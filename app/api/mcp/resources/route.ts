import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/api/error-handler';
import { ListResourcesQuerySchema } from '@/lib/validation/mcp-resources-validation';
import { trackActivity } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { UserRole, ResourceType, ResourceAction } from '@/lib/types/auth';
import { mcpLogger } from '@/lib/logger';
import { buildPOVAccessFilter } from '@/lib/pov/auth/pov-access-filter';

/**
 * GET /api/mcp/resources - List MCP resources (POV-scoped)
 *
 * Security: Requires authentication, POV-scoped filtering
 * Query: serverName, type, search, limit, povId (optional)
 *
 * v4 Performance Note: Current implementation uses in-memory filtering.
 * For >1000 resources, consider DB-level POV filtering with:
 * - WHERE clause: povId IN (user's accessible POV IDs)
 * - Cursor-based pagination for large result sets
 * - See resource-manager-specialist P1 #2 for details
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authentication check
    const user = await getAuthUser(request);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // 2. Parse and validate query parameters
    const url = new URL(request.url);
    const rawQuery = Object.fromEntries(url.searchParams.entries());

    const validation = ListResourcesQuerySchema.safeParse(rawQuery);
    if (!validation.success) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid query parameters',
        validation.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      );
    }

    const { serverName, type, search, limit, sortBy, sortOrder, povId, tags } = validation.data;

    // 3. POV validation if povId provided
    if (povId) {
      const pov = await prisma.pOV.findUnique({
        where: { id: povId },
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
        logContext: 'GET /api/mcp/resources'
      });
    }

    // 4. Import resource manager
    const { mcpResourceManager } = await import('@/lib/services/mcp/resourceManager');

    // 5. Build query options
    const queryOptions: any = {
      serverName,
      type,
      search,
      limit: limit || 100,
      sortBy: sortBy || 'name',
      sortOrder: sortOrder || 'asc'
    };

    // Parse tags if provided
    if (tags) {
      queryOptions.tags = tags.split(',').map(t => t.trim());
    }

    // 6. Get resources (filtered to user's POVs if not admin)
    let resources = await mcpResourceManager.listResources(queryOptions);

    // 7. Filter resources to user's accessible POVs (unless admin or povId specified)
    // ⚠️ v4 Performance Note: In-memory filtering acceptable for <1000 resources
    // For scale >1000 resources, move this to DB WHERE clause (see JSDoc above)
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN && !povId) {
      // Get all POVs user has access to (centralized helper)
      const accessiblePOVs = await prisma.pOV.findMany({
        where: buildPOVAccessFilter(user),
        select: { id: true },
        take: 200
      });

      const povIds = accessiblePOVs.map(p => p.id);

      // Filter resources by accessible POVs
      // NOTE: Resources have metadata.povId field (and metadata.povContext in v4)
      resources = resources.filter((r: any) =>
        !r.metadata?.povId || povIds.includes(r.metadata.povId)
      );
    } else if (povId) {
      // Filter to specific POV
      resources = resources.filter((r: any) =>
        r.metadata?.povId === povId
      );
    }

    // 8. Audit logging
    await trackActivity(user.userId, 'MCP_RESOURCES', 'LIST', {
      resourceType: ResourceType.MCP_RESOURCES,
      action: ResourceAction.VIEW,
      success: true,
      details: `Listed ${resources.length} resources`,
      filters: { serverName, type, search, limit, povId },
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown'
    });

    // 9. Return success response
    return createSuccessResponse({
      resources,
      totalCount: resources.length,
      filters: { serverName, type, search, limit, sortBy, sortOrder, povId, tags }
    });

  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to list MCP resources');
    return handleApiError(error);
  }
}
