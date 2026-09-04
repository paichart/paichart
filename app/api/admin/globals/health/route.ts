import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { UserRole } from '@/lib/types/auth';
import { logger } from '@/lib/logger';

// Note: Global types are declared in their respective source files
// We access them via (global as any) to avoid type conflicts

interface GlobalsHealthStatus {
  timestamp: string;
  serverProcess: string;
  globals: {
    database: {
      prismaClient: { exists: boolean; };
    };
    eventSystems: {
      promptRegistry?: { connected: boolean; listenerCount: number; eventCount: number; };
      execution?: { connected: boolean; listenerCount: number; eventCount: number; };
      connectionPool?: { connected: boolean; registeredSystems: number; activeConnections: number; };
    };
    authSystems: {
      authCache?: { exists: boolean; };
      sessionManager?: { exists: boolean; };
    };
    mcpHub: {
      serverManager?: { exists: boolean; serverCount?: number; };
      toolRegistry?: { exists: boolean; toolCount?: number; };
      resourceManager?: { exists: boolean; resourceCount?: number; };
    };
  };
  health: {
    overall: 'healthy' | 'degraded' | 'critical';
    issues: string[];
    recommendations: string[];
  };
}

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Admin-only endpoint
    const user = await getAuthUser(request);
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check Database
    const g = global as any;
    const database = {
      prismaClient: { exists: !!g.prismaClient }
    };

    if (!g.prismaClient) {
      issues.push('Prisma client not initialized');
      recommendations.push('Check server-init.ts database connection');
    }

    // Check Event Systems
    const eventSystems: any = {};

    if (g.promptRegistryEvents) {
      const stats = g.promptRegistryEvents.getStats();
      eventSystems.promptRegistry = {
        connected: stats.isConnected,
        listenerCount: stats.listenerCount || 0,
        eventCount: stats.eventCount || 0
      };

      if (!stats.isConnected) {
        issues.push('Prompt registry events disconnected');
        recommendations.push('Restart MCP server to reinitialize prompt events');
      }
    } else {
      issues.push('Prompt registry events not initialized');
      recommendations.push('Check server-init.ts event system initialization');
    }

    if (g.executionEvents) {
      const stats = g.executionEvents.getStats();
      eventSystems.execution = {
        connected: stats.isConnected,
        listenerCount: stats.listenerCount || 0,
        eventCount: stats.eventCount || 0
      };

      if (!stats.isConnected) {
        issues.push('Execution events disconnected');
      }
    }

    if (g.sharedEventConnectionPool) {
      const stats = g.sharedEventConnectionPool.getConnectionStats();
      eventSystems.connectionPool = {
        connected: stats.isConnected,
        registeredSystems: stats.registeredSystems || 0,
        activeConnections: stats.activeConnections || 0
      };

      if (!stats.isConnected) {
        issues.push('Shared event connection pool disconnected');
        recommendations.push('Check PostgreSQL connectivity and DATABASE_URL');
      }
    }

    // Check Auth Systems
    const authSystems: any = {};

    // Event-driven auth cache + session manager DELETED 2026-06-14 (dormant dead
    // code — never instantiated; the g.* globals were never populated, so the prior
    // else-branches reported permanent phantom 'not initialized' failures). The live
    // mechanisms are the real permission cache (lib/auth/cache.ts) + RefreshToken /
    // SessionStore. authSystems intentionally left empty.

    // Check MCP Hub
    const mcpHub: any = {};

    if (g.mcpServerManager) {
      try {
        const servers = g.mcpServerManager.getAllServers();
        const connectedCount = servers.filter((s: any) => s.status === 'CONNECTED').length;
        mcpHub.serverManager = {
          exists: true,
          serverCount: servers.length,
          connectedCount
        };

        if (connectedCount === 0 && servers.length > 0) {
          issues.push('No MCP servers connected');
          recommendations.push('Check MCP server connectivity and authentication');
        }
      } catch (error) {
        mcpHub.serverManager = { exists: true, error: 'Failed to get server stats' };
      }
    }

    if (g.mcpToolRegistry) {
      try {
        const stats = g.mcpToolRegistry.getStatistics();
        mcpHub.toolRegistry = {
          exists: true,
          toolCount: stats.totalTools || 0
        };
      } catch (error) {
        mcpHub.toolRegistry = { exists: true, error: 'Failed to get tool stats' };
      }
    }

    if (g.mcpResourceManager) {
      mcpHub.resourceManager = { exists: true };
    }

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';

    const criticalIssues = issues.filter(i =>
      i.includes('Prisma') ||
      i.includes('connection pool') ||
      i.includes('Auth cache')
    );

    if (criticalIssues.length > 0) {
      overall = 'critical';
    } else if (issues.length > 2) {
      overall = 'degraded';
    } else if (issues.length > 0) {
      overall = 'degraded';
    }

    const healthStatus: GlobalsHealthStatus = {
      timestamp: new Date().toISOString(),
      serverProcess: 'paichart-web',
      globals: {
        database,
        eventSystems,
        authSystems,
        mcpHub
      },
      health: {
        overall,
        issues,
        recommendations
      }
    };

    return NextResponse.json(healthStatus, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });

  } catch (error) {
    logger.error({ err: error }, 'Globals Health error');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check globals health',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}
