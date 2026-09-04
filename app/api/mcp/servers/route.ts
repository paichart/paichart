import { NextRequest, NextResponse } from 'next/server';
import { MCPServerConfig } from '@/lib/services/llm/mcp-integration';
import { z } from 'zod';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { mcpServerLimiter } from '@/lib/middleware/rate-limit';
import { mcpLogger } from '@/lib/logger';

interface ExtendedMCPServerConfig extends MCPServerConfig {
  id: string;
  status: 'connected' | 'disconnected' | 'error' | 'testing';
  health?: {
    lastCheck: Date;
    responseTime: number;
    uptime: number;
    errorCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// Comprehensive MCP Server validation schema
const MCPServerConfigSchema = z.object({
  name: z.string()
    .min(1, 'Server name is required')
    .max(255, 'Server name too long')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Server name must be alphanumeric with hyphens/underscores'),
  description: z.string()
    .max(1000, 'Description too long')
    .optional(),
  version: z.string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format (e.g., 1.0.0)')
    .optional()
    .default('1.0.0'),
  transport: z.object({
    type: z.enum(['stdio', 'http', 'sse'], {
      errorMap: () => ({ message: 'Transport type must be stdio, http, or sse' })
    }),
    // Validate stdio transport (highest RCE risk) - ENHANCED with whitelist
    command: z.string()
      .max(500, 'Command too long')
      // ✅ PHASE 2: Force absolute paths starting with /
      .regex(/^\/[a-zA-Z0-9\/_\-\.]+$/, 'Command must be absolute path starting with /')
      .refine((cmd) => {
        // ✅ PHASE 2: Whitelist of allowed commands
        const allowedCommands = [
          '/usr/bin/node',
          '/usr/bin/python',
          '/usr/bin/python3',
          '/usr/local/bin/node',
          '/usr/local/bin/npx'
        ];
        return allowedCommands.includes(cmd);
      }, {
        message: 'Command must be from allowed list (node, python, npx)'
      })
      .optional(),
    args: z.array(
      z.string()
        .max(200, 'Arg too long')
        // ✅ PHASE 2: Block dangerous args
        .refine((arg) => {
          const dangerousPatterns = ['-e', '--eval', '-c', 'eval(', 'exec('];
          return !dangerousPatterns.some(pattern => arg.includes(pattern));
        }, {
          message: 'Argument contains dangerous pattern'
        })
    )
      .max(20, 'Too many arguments')
      .optional(),
    // Validate HTTP/SSE transport
    // 2026-05-14 P1 (sec-ops F-04): SSRF guard. Without this, an admin
    // could register a "server" pointing at localhost / RFC 1918 /
    // 169.254.169.254 (AWS metadata) and have pAIchart fetch from it.
    // Admin-only auth is the primary mitigation; this is defense-in-depth
    // for compromised-admin and insider-threat scenarios.
    url: z.string()
      .url('Invalid URL format')
      .max(2000, 'URL too long')
      .refine((url) => {
        try {
          const parsed = new URL(url);
          // Block non-http(s) protocols (file://, ftp://, gopher://, data:, etc.)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
          }
          const host = parsed.hostname.toLowerCase();
          // Block localhost variants
          if (host === 'localhost' || host === '0.0.0.0' || host === '[::]' || host === '[::1]') {
            return false;
          }
          // Block IPv4 loopback (127.0.0.0/8)
          if (/^127\./.test(host)) return false;
          // Block RFC 1918 private ranges (10/8, 172.16/12, 192.168/16)
          if (/^10\./.test(host)) return false;
          if (/^192\.168\./.test(host)) return false;
          if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
          // Block link-local + AWS/GCP metadata services
          if (/^169\.254\./.test(host)) return false;
          // Block IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
          if (/^\[?(fc|fd)[0-9a-f]{2}:/i.test(host)) return false;
          if (/^\[?fe80:/i.test(host)) return false;
          return true;
        } catch {
          return false;
        }
      }, {
        message: 'URL must be public http(s); private/loopback/metadata hosts blocked (SSRF defense)'
      })
      .optional(),
    headers: z.record(z.string().max(500, 'Header value too long'))
      .optional()
  }).refine((transport) => {
    // stdio requires command
    if (transport.type === 'stdio' && !transport.command) {
      return false;
    }
    // http/sse requires url
    if ((transport.type === 'http' || transport.type === 'sse') && !transport.url) {
      return false;
    }
    return true;
  }, {
    message: 'stdio requires command, http/sse requires url'
  }),
  capabilities: z.object({
    tools: z.boolean().optional(),
    resources: z.boolean().optional(),
    prompts: z.boolean().optional()
  }).optional(),
  authentication: z.object({
    type: z.enum(['none', 'bearer', 'oauth2']).optional(),
    token: z.string().max(1000, 'Token too long').optional(),
    credentials: z.record(z.string().max(500, 'Credential too long')).optional()
  }).optional()
});

// GET /api/mcp/servers - List all configured servers
export async function GET(request: NextRequest) {
  try {
    const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');
    
    // Get all server information (not just names)
    const serverInfos = mcpServerManager.getAllServerInfo();
    const healthReport = mcpServerManager.getHealthReport();
    
    // Convert server info to the expected format
    const servers = serverInfos.map(serverInfo => ({
      id: serverInfo.name, // Use name as ID for now
      name: serverInfo.name,
      description: serverInfo.config.description || '',
      version: serverInfo.config.version || '1.0.0',
      status: serverInfo.status,
      transport: serverInfo.config.transport,
      capabilities: serverInfo.config.capabilities,
      authentication: serverInfo.config.authentication,
      health: {
        lastCheck: new Date(),
        responseTime: 0, // 2026-06-12: was fabricated 150 — no per-server timing instrumentation
        uptime: serverInfo.connectedAt ? Date.now() - serverInfo.connectedAt.getTime() : 0,
        errorCount: serverInfo.errorCount
      },
      createdAt: serverInfo.connectedAt || new Date(),
      updatedAt: serverInfo.lastActivity || new Date(),
      createdBy: 'system',
      toolCount: serverInfo.toolCount
    }));
    
    mcpLogger.info({ serverCount: servers.length, serverNames: servers.map(s => s.name) }, 'Servers found');
    mcpLogger.debug({ servers: servers.map(s => ({ name: s.name, status: s.status, transportType: s.transport?.type })) }, 'Server details');
    
    return NextResponse.json({
      success: true,
      data: {
        servers,
        healthReport,
        totalServers: servers.length,
        connectedServers: servers.filter(s => s.status === 'connected').length
      }
    });
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to fetch servers');
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch servers',
      details: 'See server logs for details'
    }, { status: 500 });
  }
}

// POST /api/mcp/servers - Add new server
export async function POST(request: NextRequest) {
  try {
    // ✅ PHASE 2: Rate limiting check (10 servers per hour)
    const rateLimitResponse = mcpServerLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse; // Rate limit exceeded
    }

    // ✅ 1. Authentication
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // ✅ 2. Authorization (ADMIN-only)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({
        success: false,
        error: 'Forbidden - Admin access required'
      }, { status: 403 });
    }

    // ✅ 3. Validation
    const data = await request.json();

    // ✅ P1 FIX: Use safeParse instead of try/catch with .parse()
    const validation = MCPServerConfigSchema.safeParse(data);

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }

    const validated = validation.data;

    // ✅ 4. Use validated data in business logic
    const fullConfig = {
      ...validated,
      id: `server-${Date.now()}`,
      status: 'disconnected' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: user.userId // Now using authenticated user
    };

    const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');
    const result = await mcpServerManager.addServer(fullConfig as MCPServerConfig);

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Server added successfully'
    });
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to add server');
    return NextResponse.json({
      success: false,
      error: 'Failed to add server',
      details: 'See server logs for details'
    }, { status: 500 });
  }
}
