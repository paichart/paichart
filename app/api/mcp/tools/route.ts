import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { TokenPayload, ApiResponse, ResourceType, ResourceAction } from '@/lib/types/auth';
import { mcpToolRegistry } from '@/lib/services/mcp/toolRegistry';
import { ListToolsQuerySchema } from '@/lib/validation/mcp-tools-validation';
import { trackActivity } from '@/lib/auth/audit';
import { mcpLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

/**
 * GET /api/mcp/tools - List available MCP tools (v4: with validation and audit logging)
 *
 * Security: User-authenticated (READ operations only)
 * Query: serverName, category, search, deprecated, limit
 *
 * ⭐ v4 Admin Pattern Clarification:
 * - This endpoint (GET /api/mcp/tools) is READ operations, user-scoped
 * - Tool CRUD operations (PATCH/DELETE /api/mcp/tools/[toolId]) remain admin-only
 * - Distinction:
 *   - MCP Tool Registry (in-memory, system-level) = admin-only CRUD
 *   - MCP Hub Services (database MCPTool, user-owned) = user-scoped via configuration.ownerId
 * - See mcp-hub-specialist P1 #1 for details
 */
const getMCPToolsHandler: ApiHandler = async (
  request: NextRequest,
  { params }: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    mcpLogger.info({ userId: user.userId, role: user.role }, 'Fetching tools for user');

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const rawQuery = Object.fromEntries(searchParams.entries());

    const validation = ListToolsQuerySchema.safeParse(rawQuery);
    if (!validation.success) {
      return {
        error: {
          message: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        },
      };
    }

    const { serverName, category, search, deprecated, limit } = validation.data;

    // Build search criteria
    // NOTE: MCP Tool Registry is system-level (in-memory), no POV scoping needed
    const searchCriteria: any = {};
    if (serverName) searchCriteria.serverName = serverName;
    if (category) searchCriteria.category = category;
    if (search) searchCriteria.search = search;
    if (deprecated !== undefined) searchCriteria.deprecated = deprecated;

    // Search tools with validated criteria
    let tools = mcpToolRegistry.searchTools(searchCriteria);

    mcpLogger.debug({ toolCount: tools.length }, 'Tools found before limit');

    // Apply limit if provided
    if (limit) {
      tools = tools.slice(0, limit);
    }

    mcpLogger.info({ toolCount: tools.length }, 'Returning tools');
    mcpLogger.debug({ toolNames: tools.map(t => `${t.serverName}:${t.name}`) }, 'Tool list details');

    // Audit logging
    await trackActivity(user.userId, 'AGENT_EXECUTION', 'VIEW', {
      resourceType: ResourceType.AGENT_EXECUTION,
      action: ResourceAction.VIEW,
      success: true,
      details: `Listed ${tools.length} MCP tools`,
      filters: { serverName, category, search, deprecated, limit },
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown'
    });

    const responseData = {
      data: {
        tools,
        totalTools: tools.length,
        activeTools: tools.filter(t => !t.deprecated).length,
        serverCount: new Set(tools.map(t => t.serverName)).size,
        filters: { serverName, category, search, deprecated, limit }
      }
    };

    return responseData;
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to fetch tools');
    return {
      error: {
        message: 'Failed to fetch MCP tools',
        code: 'TOOLS_FETCH_FAILED',
        details: 'See server logs for details'
      },
    };
  }
};

export const GET = createHandler(getMCPToolsHandler, { requireAuth: true, rateLimit: 'write' as const });
