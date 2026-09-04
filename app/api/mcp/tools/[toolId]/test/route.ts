import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse, UserRole } from '@/lib/types/auth';
import { mcpLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// POST /api/mcp/tools/[toolId]/test - Test individual tool
const testMCPToolHandler: ApiHandler = async (
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
    // Decode the URL-encoded toolId first
    const decodedToolId = decodeURIComponent(params.toolId);

    // Parse the toolId which is in format "serverName:toolName"
    const [serverName, toolName] = decodedToolId.split(':');
    mcpLogger.debug({ serverName, toolName }, 'starting tool test');
    
    if (!serverName || !toolName) {
      mcpLogger.warn({ decodedToolId }, 'invalid tool ID format');
      return {
        error: {
          message: 'Invalid tool ID format. Expected format: serverName:toolName',
          code: 'INVALID_TOOL_ID',
          debug: { decodedToolId, serverName, toolName }
        },
      };
    }

    // 2026-05-14 P1 (sec-ops F-05): role-based tool gating. Previously
    // any authenticated user could invoke ANY tool via the test endpoint
    // (including ADMIN-categorized tools like 'template'), bypassing the
    // tool-security policy that the MCP server runtime enforces. Reuse
    // the canonical enforceToolSecurity from
    // lib/mcp/server/config/tool-security.js so policy stays single-source.
    try {
      const toolSecurity = await import('@/lib/mcp/server/config/tool-security' as any) as {
        enforceToolSecurity: (toolName: string, ctx: { user: { id: string; role: string } }) => boolean;
      };
      toolSecurity.enforceToolSecurity(toolName, { user: { id: user.userId, role: user.role } });
    } catch (err: any) {
      mcpLogger.warn({ toolName, userRole: user.role, err: err.message }, 'tool test rejected by enforceToolSecurity');
      return {
        error: {
          message: err.message || 'Tool access denied',
          code: 'FORBIDDEN',
        },
      };
    }

    const startTime = Date.now();
    let testResult = {
      success: false,
      responseTime: 0,
      error: null as string | null,
      result: null as any
    };

    try {
      // Handle embedded server specially
      if (serverName === 'paichart-embedded-mcp') {
        mcpLogger.debug({ toolName }, 'testing embedded server tool');
        
        // Get embedded server directly
        const { embeddedMCPServer } = await import('@/lib/mcp/embedded-server');
        
        if (!embeddedMCPServer.isReady()) {
          throw new Error('Embedded MCP server is not ready');
        }
        
        // Get request body parameters
        const body = await request.json().catch(() => ({}));
        
        // Execute tool on embedded server with actual parameters
        const result = await embeddedMCPServer.callTool(toolName, body);
        
        const endTime = Date.now();
        testResult = {
          success: true,
          responseTime: endTime - startTime,
          error: null,
          result: result
        };
        
        mcpLogger.info({ toolName, responseTimeMs: testResult.responseTime }, 'embedded tool test successful');
      } else {
        // Handle external servers
        mcpLogger.debug({ serverName, toolName }, 'testing external server tool');
        
        const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');
        
        // Check if server exists
        const serverInfo = mcpServerManager.getServerInfo(serverName);
        mcpLogger.debug({ serverName, status: serverInfo?.status }, 'server info retrieved');
        
        if (!serverInfo) {
          throw new Error(`Server ${serverName} not found. This server needs to be configured in the Server Management tab first.`);
        }

        // Check if server is connected
        if (serverInfo.status !== 'connected') {
          throw new Error(`Server ${serverName} is not connected (status: ${serverInfo.status})`);
        }

        // Execute the tool with test parameters
        const result = await mcpServerManager.executeToolOnServer(
          serverName,
          toolName,
          {}, // Empty arguments for test
          {
            // 10s bound — ENFORCED for external servers since e72f5b17 (threaded
            // serverManager → mcpService.callExternalTool → SDK RequestOptions).
            // For the embedded server this field is deliberately unread (M2 decision
            // 2026-07-17: no embedded per-call ceiling; see bug-class-registry BC79 site 5).
            timeout: 10000,
            userId: 'system-test'
          }
        );
        
        const endTime = Date.now();
        testResult = {
          success: true,
          responseTime: endTime - startTime,
          error: null,
          result: result
        };
        
        mcpLogger.info({ serverName, toolName, responseTimeMs: testResult.responseTime }, 'external tool test successful');
      }
    } catch (error) {
      const endTime = Date.now();
      testResult = {
        success: false,
        responseTime: endTime - startTime,
        error: 'Tool execution failed',
        result: null
      };
      
      mcpLogger.error({ err: error, serverName, toolName }, 'tool test failed');
    }
    
    return {
      data: {
        toolId: params.toolId,
        serverName,
        toolName,
        status: testResult.success ? 'success' : 'error',
        responseTime: testResult.responseTime,
        error: testResult.error,
        result: testResult.result,
        timestamp: new Date()
      }
    };
  } catch (error) {
    mcpLogger.error({ err: error, toolId: params.toolId }, 'tool test handler failed');
    return {
      error: {
        message: 'Tool test failed',
        code: 'TOOL_TEST_FAILED',
        details: 'See server logs for details'
      },
    };
  }
};

// 2026-05-17: admin-gated. The endpoint invokes the actual tool (not a probe/dry-run)
// and passes NO user context to `embeddedMCPServer.callTool` (line 91), which means
// per-user authorization checks downstream depend on apiClient → API auth rejection
// (no JWT forwarded → 401 at downstream endpoints). External tool invocations are
// attributed to `userId: 'system-test'` (line 128). For admins these audit-trail
// quirks are acceptable; for general users the bypass-shape risk + audit confusion
// outweigh the test convenience. Filed as
// cline_docs/reviews/post-hardening-audit-2026-05-17/BUG-REPORT-mcp-tools-test-endpoint-audit-2026-05-17.md
// with the open question of whether any embedded tool bypasses apiClient and hits
// prisma directly (real bypass surface if so — delete the endpoint).
export const POST = createHandler(testMCPToolHandler, { requireAuth: true, allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] });
