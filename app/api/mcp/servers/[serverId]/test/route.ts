import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { mcpLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// POST /api/mcp/servers/[serverId]/test - Test server connection
const testServerConnectionHandler: ApiHandler = async (
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
    const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');
    
    // Check if server exists
    const serverInfo = mcpServerManager.getServerInfo(params.serverId);
    if (!serverInfo) {
      return {
        error: {
          message: 'Server not found',
          code: 'SERVER_NOT_FOUND',
        },
      };
    }

    const startTime = Date.now();
    let testResult = {
      success: false,
      responseTime: 0,
      error: null as string | null,
      capabilities: [] as string[],
      toolCount: 0
    };

    try {
      // Attempt to connect to the server
      await mcpServerManager.connectServer(params.serverId);
      
      const endTime = Date.now();
      testResult = {
        success: true,
        responseTime: endTime - startTime,
        error: null,
        capabilities: serverInfo.capabilities || [],
        toolCount: serverInfo.toolCount
      };
    } catch (error) {
      const endTime = Date.now();
      testResult = {
        success: false,
        responseTime: endTime - startTime,
        error: 'Connection failed',
        capabilities: [],
        toolCount: 0
      };
    }
    
    return {
      data: {
        serverId: params.serverId,
        status: testResult.success ? 'connected' : 'error',
        responseTime: testResult.responseTime,
        error: testResult.error,
        capabilities: testResult.capabilities,
        toolCount: testResult.toolCount,
        timestamp: new Date()
      }
    };
  } catch (error) {
    mcpLogger.error({ err: error, serverId: params.serverId }, 'Server connection test failed');
    return {
      error: {
        message: 'Connection test failed',
        code: 'CONNECTION_TEST_FAILED',
        details: 'See server logs for details'
      },
    };
  }
};

export const POST = createHandler(testServerConnectionHandler, { requireAuth: true });
