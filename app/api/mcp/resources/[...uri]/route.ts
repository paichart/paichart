import { NextRequest } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/api/error-handler';
import { ReadResourceQuerySchema } from '@/lib/validation/mcp-resources-validation';
import { trackActivity } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { UserRole, ResourceType, ResourceAction } from '@/lib/types/auth';
import { mcpLogger } from '@/lib/logger';

/**
 * GET /api/mcp/resources/[...uri] - Read specific MCP resource
 *
 * Security: Requires authentication, POV-scoped access control
 * Path: Resource URI (e.g., mcp://artifacts/123)
 * Query: serverName (optional), povId (optional), includeContent (optional)
 *
 * v4 Performance: Uses cached POV context from metadata.povContext (5ms validation)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { uri: string[] } }
) {
  try {
    // 1. Authentication check
    const user = await getAuthUser(request);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // 2. Parse resource URI from path
    const resourceUri = params.uri.join('/');
    if (!resourceUri) {
      return createErrorResponse('BAD_REQUEST', 'Resource URI is required');
    }

    // 3. Parse and validate query parameters
    const url = new URL(request.url);
    const rawQuery = Object.fromEntries(url.searchParams.entries());

    const validation = ReadResourceQuerySchema.safeParse(rawQuery);
    if (!validation.success) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid query parameters',
        validation.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      );
    }

    const { serverName, povId, includeContent } = validation.data;

    // 4. Import resource manager
    const { mcpResourceManager } = await import('@/lib/services/mcp/resourceManager');

    // 5. Read resource (pass userId + role for access-scoped data fetching —
    // N1 fix: the role was previously dropped here and hardcoded to 'USER'
    // downstream, silently under-fetching for ADMIN and DEMO_USER)
    const resource = await mcpResourceManager.readResource(resourceUri, {
      userId: user.userId,
      role: user.role,
    });

    if (!resource) {
      return createErrorResponse('NOT_FOUND', 'Resource not found');
    }

    // 6. Extract POV ID from resource metadata or query
    const resourcePovId = resource.metadata?.povId || povId;

    // 7. POV access validation (if resource has POV context)
    if (resourcePovId) {
      // ⭐ v4 Performance: Try cached POV context first (5ms)
      const cachedPOVContext = resource.metadata?.povContext;

      if (cachedPOVContext && cachedPOVContext.id === resourcePovId) {
        // Use cached context for fast validation
        validatePOVAccess(user, {
          id: cachedPOVContext.id,
          ownerId: cachedPOVContext.ownerId,
          metadata: {
            isDemo: cachedPOVContext.isDemo,
            tenantId: cachedPOVContext.tenantId,
          },
          team: {
            members: cachedPOVContext.teamMemberIds?.map((uid: string) => ({ userId: uid })) || []
          }
        } as any, {
          throwOnDeny: true,
          logContext: 'GET /api/mcp/resources/[...uri] (cached)'
        });
      } else {
        // Fallback to DB query if no cached context (50-100ms)
        const pov = await prisma.pOV.findUnique({
          where: { id: resourcePovId },
          select: {
            id: true,
            ownerId: true,
            metadata: true,
            team: {
              select: {
                members: {
                  select: { userId: true }
                }
              }
            }
          }
        });

        if (!pov) {
          return createErrorResponse('NOT_FOUND', 'POV not found');
        }

        // Validate access (throw on denial)
        validatePOVAccess(user, pov, {
          throwOnDeny: true,
          logContext: 'GET /api/mcp/resources/[...uri] (DB query)'
        });
      }
    } else if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      // Non-admin users can only access resources with POV context
      return createErrorResponse('FORBIDDEN', 'Access denied - resource has no POV context');
    }

    // 8. Audit logging
    await trackActivity(user.userId, 'MCP_RESOURCE', 'READ', {
      resourceType: ResourceType.MCP_RESOURCE,
      resourceId: resourceUri,
      action: ResourceAction.VIEW,
      success: true,
      details: `Read resource: ${resourceUri}`,
      povId: resourcePovId,
      usedCachedContext: !!resource.metadata?.povContext,
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown'
    });

    // 9. Return resource
    return createSuccessResponse({
      resource,
      uri: resourceUri,
      povId: resourcePovId
    });

  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to read MCP resource by URI');
    return handleApiError(error);
  }
}
