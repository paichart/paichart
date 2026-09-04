import { NextRequest } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/api/error-handler';
import { trackActivity } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { UserRole, ResourceType, ResourceAction } from '@/lib/types/auth';
import { mcpLogger } from '@/lib/logger';

/**
 * GET /api/mcp/resources/[resourceId] - Read specific resource content
 *
 * Security: Requires authentication, POV-scoped access control
 *
 * P0 Fix (Feb 2026): Added authentication, POV validation, and audit logging.
 * Previously had NO access control — any request could read any resource.
 *
 * Uses MCPResourceManager (TS) which has colon-prefixed keys (execution:{id}, artifact:{id}).
 * The resource's metadata.povId and metadata.povContext are used for POV validation.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { resourceId: string } }
) {
  try {
    // 1. Authentication check
    const user = await getAuthUser(request);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // 2. Decode resource ID
    const resourceId = decodeURIComponent(params.resourceId);

    // 3. Parse query parameters
    const url = new URL(request.url);
    const useCache = url.searchParams.get('useCache') !== 'false';
    const preserveContext = url.searchParams.get('preserveContext') === 'true';
    const sessionId = url.searchParams.get('sessionId') || undefined;

    mcpLogger.info({ resourceId, userId: user.userId }, 'Reading resource by ID');

    // 4. Import resource manager and get resource metadata first
    const { mcpResourceManager } = await import('@/lib/services/mcp/resourceManager');

    // 5. Get resource to check POV context before returning content
    const resource = mcpResourceManager.getResource(resourceId);

    // 6. POV access validation (if resource has POV context)
    const resourcePovId = resource?.metadata?.povId;

    if (resourcePovId) {
      // Try cached POV context first (5ms) — same v4 pattern as [...uri]/route.ts
      const cachedPOVContext = resource?.metadata?.povContext;

      if (cachedPOVContext && cachedPOVContext.id === resourcePovId) {
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
          logContext: 'GET /api/mcp/resources/[resourceId] (cached)'
        });
      } else {
        // Fallback to DB query (50-100ms)
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

        validatePOVAccess(user, pov, {
          throwOnDeny: true,
          logContext: 'GET /api/mcp/resources/[resourceId] (DB query)'
        });
      }
    } else if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      // Non-admin users can only access resources that have POV context
      // Resources without POV context (e.g., mock resources) are admin-only
      if (resource) {
        return createErrorResponse('FORBIDDEN', 'Access denied - resource has no POV context');
      }
      // If resource doesn't exist, let readResource throw its own error below
    }

    // 7. Read resource content — thread the real authenticated identity
    // (resource-boundary-contract Phase 3.2: this replaces the embedded
    // server's old fabricate-ADMIN fallback for execution reads; tenant
    // methods are fail-closed on absent context)
    const content = await mcpResourceManager.readResource(resourceId, {
      useCache,
      preserveContext,
      sessionId,
      userId: user.userId,
      role: user.role
    });

    // 8. Audit logging
    await trackActivity(user.userId, 'MCP_RESOURCE', 'READ', {
      resourceType: ResourceType.MCP_RESOURCE,
      resourceId,
      action: ResourceAction.VIEW,
      success: true,
      details: `Read resource: ${resourceId}`,
      povId: resourcePovId,
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown'
    });

    // 9. Return success response
    return createSuccessResponse({
      resourceId,
      content,
      options: { useCache, preserveContext, sessionId }
    });
  } catch (error) {
    mcpLogger.error({ err: error, resourceId: params.resourceId }, 'Failed to read resource');
    return handleApiError(error);
  }
}
