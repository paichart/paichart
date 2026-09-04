import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse, UserRole } from '@/lib/types/auth';
import { mcpToolRegistry } from '@/lib/services/mcp/toolRegistry';
import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/mcp/tools/[toolId] - Get specific tool details
const getToolHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
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
    const { toolId } = context.params;
    const [serverName, toolName] = toolId.split(':');
    
    const tool = mcpToolRegistry.getToolMetadata(serverName, toolName);

    if (!tool) {
      return {
        error: {
          message: 'Tool not found',
          code: 'NOT_FOUND',
        },
      };
    }

    return { data: tool };
  } catch (error) {
    mcpLogger.error({ err: error, toolId: context.params.toolId }, 'Failed to fetch tool details');
    return {
      error: {
        message: 'Failed to fetch tool details',
        code: 'FETCH_ERROR',
      },
    };
  }
};

// PATCH /api/mcp/tools/[toolId] - Update tool (e.g., disable/enable)
const updateToolHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
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

  // 2026-05-26: this endpoint never persisted — it mutated only the in-memory
  // registry object (tool.deprecated) and returned fake success, so the dashboard
  // "disable tool" button silently did nothing. With zero production hits, return
  // an honest NOT_IMPLEMENTED rather than build out tool-status persistence. Tool
  // lifecycle is managed via the registry/services tools.
  return {
    error: {
      message: 'Updating tools via this endpoint is not implemented. Manage MCP tools via the registry (registry/services tools).',
      code: 'NOT_IMPLEMENTED',
    },
  };
};

// DELETE /api/mcp/tools/[toolId] - Remove tool
const deleteToolHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
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

  // 2026-05-26: never persisted — returned fake success without removing anything
  // (zero production hits). Honest NOT_IMPLEMENTED rather than a lie; manage MCP
  // tools via the registry/services tools.
  return {
    error: {
      message: 'Deleting tools via this endpoint is not implemented. Manage MCP tools via the registry (registry/services tools).',
      code: 'NOT_IMPLEMENTED',
    },
  };
};

export const GET = createHandler(getToolHandler, { requireAuth: true });
export const PATCH = createHandler(updateToolHandler, { requireAuth: true, allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }); // BC60 FIX
export const DELETE = createHandler(deleteToolHandler, { requireAuth: true, allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }); // BC60 FIX
