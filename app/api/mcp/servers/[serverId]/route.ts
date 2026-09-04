import { NextRequest } from 'next/server';
import { z } from 'zod';
import { MCPServerConfig } from '@/lib/services/llm/mcp-integration';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { createErrorResponse, createSuccessResponse } from '@/lib/api/error-handler';
import { mcpLogger } from '@/lib/logger';

// ✅ Enhanced validation schema with command whitelist (Pre-Phase Fix A)
const UpdateMCPServerSchema = z.object({
  name: z.string()
    .min(1).max(255)
    .regex(/^[a-zA-Z0-9-_]+$/)
    .optional(),
  description: z.string().max(1000).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  transport: z.object({
    type: z.enum(['stdio', 'http', 'sse']),
    // ✅ Command whitelist (same as POST endpoint)
    command: z.string()
      .max(500)
      .regex(/^\/[a-zA-Z0-9\/_\-\.]+$/, 'Must be absolute path')
      .refine((cmd) => {
        const allowedCommands = [
          '/usr/bin/node',
          '/usr/bin/python',
          '/usr/bin/python3',
          '/usr/local/bin/node',
          '/usr/local/bin/npx'
        ];
        return allowedCommands.includes(cmd);
      }, { message: 'Command not in whitelist' })
      .optional(),
    // ✅ Dangerous args filter (same as POST endpoint)
    args: z.array(
      z.string()
        .max(200)
        .refine((arg) => {
          const dangerousPatterns = ['-e', '--eval', '-c', 'eval(', 'exec('];
          return !dangerousPatterns.some(pattern => arg.includes(pattern));
        }, { message: 'Argument contains dangerous pattern' })
    )
      .max(20)
      .optional(),
    url: z.string().url().max(2000).optional(),
  }).optional(),
  capabilities: z.object({
    tools: z.boolean().optional(),
    resources: z.boolean().optional(),
    prompts: z.boolean().optional()
  }).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field required for update'
});

// GET /api/mcp/servers/[serverId] - Get server details
export async function GET(
  request: NextRequest,
  { params }: { params: { serverId: string } }
) {
  try {
    // ✅ 1. Authentication
    const user = await getAuthUser(request);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // ✅ 2. Authorization (admin-only)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return createErrorResponse('FORBIDDEN', 'Admin access required');
    }

    // ✅ 3. Business logic
    const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');
    const serverInfo = mcpServerManager.getServerInfo(params.serverId);

    if (!serverInfo) {
      return createErrorResponse('NOT_FOUND', 'Server not found');
    }

    // ✅ 4. Sanitize config (don't expose credentials)
    const sanitizedConfig = { ...serverInfo.config };
    if (sanitizedConfig.authentication) {
      sanitizedConfig.authentication = {
        ...sanitizedConfig.authentication,
        token: sanitizedConfig.authentication.token ? '[REDACTED]' : undefined,
        apiKey: sanitizedConfig.authentication.apiKey ? '[REDACTED]' : undefined
      };
    }

    return createSuccessResponse({
      id: params.serverId,
      name: serverInfo.name,
      config: sanitizedConfig,
      status: serverInfo.status,
      toolCount: serverInfo.toolCount,
      errorCount: serverInfo.errorCount,
      connectedAt: serverInfo.connectedAt,
      lastActivity: serverInfo.lastActivity,
      version: serverInfo.version,
      capabilities: serverInfo.capabilities
    });
  } catch (error) {
    mcpLogger.error({ err: error, serverId: params.serverId }, 'Failed to fetch server');
    return createErrorResponse('INTERNAL_ERROR', 'Failed to fetch server');
  }
}

// PUT /api/mcp/servers/[serverId] - Update server
export async function PUT(
  request: NextRequest,
  { params }: { params: { serverId: string } }
) {
  try {
    // ✅ 1. Authentication
    const user = await getAuthUser(request);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // ✅ 2. Authorization (admin-only)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return createErrorResponse('FORBIDDEN', 'Admin access required');
    }

    // ✅ 3. Validation
    const data = await request.json();

    // ✅ P1 FIX: Use safeParse instead of try/catch with .parse()
    const result = UpdateMCPServerSchema.safeParse(data);

    if (!result.success) {
      return createErrorResponse('VALIDATION_ERROR', 'Validation failed', {
        fields: result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }

    const validated = result.data;

    // ✅ 4. Business logic
    const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');

    const serverInfo = mcpServerManager.getServerInfo(params.serverId);
    if (!serverInfo) {
      return createErrorResponse('NOT_FOUND', 'Server not found');
    }

    mcpLogger.debug({ serverId: params.serverId, serverName: serverInfo.config.name }, 'Current server config loaded');
    mcpLogger.debug({ serverId: params.serverId, updateFields: Object.keys(validated) }, 'Validated updates received');

    const updatedConfig = {
      ...serverInfo.config,
      ...validated,
      version: validated.version || serverInfo.config.version
    };

    mcpLogger.info({ serverId: params.serverId, serverName: updatedConfig.name }, 'Server config updated');

    // Remove and re-add server with new config
    await mcpServerManager.removeServer(params.serverId);
    await mcpServerManager.addServer(updatedConfig as MCPServerConfig);

    return createSuccessResponse(updatedConfig, 'Server updated successfully');
  } catch (error) {
    mcpLogger.error({ err: error, serverId: params.serverId }, 'Failed to update server');
    return createErrorResponse('INTERNAL_ERROR', 'Failed to update server');
  }
}

// DELETE /api/mcp/servers/[serverId] - Remove server
export async function DELETE(
  request: NextRequest,
  { params }: { params: { serverId: string } }
) {
  try {
    // ✅ 1. Authentication
    const user = await getAuthUser(request);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // ✅ 2. Authorization (admin-only)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return createErrorResponse('FORBIDDEN', 'Admin access required');
    }

    // ✅ 3. Business logic
    const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');

    const serverInfo = mcpServerManager.getServerInfo(params.serverId);
    if (!serverInfo) {
      return createErrorResponse('NOT_FOUND', 'Server not found');
    }

    await mcpServerManager.removeServer(params.serverId);

    return createSuccessResponse(null, 'Server removed successfully');
  } catch (error) {
    mcpLogger.error({ err: error, serverId: params.serverId }, 'Failed to remove server');
    return createErrorResponse('INTERNAL_ERROR', 'Failed to remove server');
  }
}
