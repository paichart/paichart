import { NextRequest, NextResponse } from 'next/server';
import { mcpLogger } from '@/lib/logger';

// Prevent Next.js 14 static caching of this no-request-read GET (see /api/health/route.ts,
// 2026-07-23): health reports must reflect live server state, not a build-time snapshot.
export const dynamic = 'force-dynamic';

// GET /api/mcp/servers/health - Get health report for all servers
export async function GET(request: NextRequest) {
  try {
    const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');
    const healthReport = await mcpServerManager.getHealthReport();
    
    return NextResponse.json({
      success: true,
      data: {
        timestamp: new Date(),
        overallHealth: calculateOverallHealth(healthReport),
        totalServers: healthReport.totalServers,
        connectedServers: healthReport.connectedServers,
        disconnectedServers: healthReport.disconnectedServers,
        errorServers: healthReport.errorServers,
        averageResponseTime: healthReport.averageResponseTime,
        totalTools: healthReport.totalTools,
        servers: healthReport.serverDetails.map(server => ({
          name: server.name,
          status: server.status,
          responseTime: server.responseTime,
          uptime: server.uptime,
          lastCheck: new Date(),
          errorCount: server.errorCount,
          toolCount: server.toolCount,
          healthScore: calculateServerHealthScore(server)
        }))
      }
    });
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to fetch server health report');
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch health report',
      details: 'See server logs for details'
    }, { status: 500 });
  }
}

// Helper function to calculate overall health percentage
function calculateOverallHealth(healthReport: any): number {
  if (healthReport.totalServers === 0) return 100;
  
  const connectedWeight = 0.6;
  const responseTimeWeight = 0.3;
  const errorWeight = 0.1;
  
  // Connected servers score (0-100)
  const connectedScore = (healthReport.connectedServers / healthReport.totalServers) * 100;
  
  // Response time score (0-100, where < 1000ms = 100, > 5000ms = 0)
  const responseTimeScore = Math.max(0, Math.min(100, 
    100 - ((healthReport.averageResponseTime - 1000) / 4000) * 100
  ));
  
  // Error score (0-100, where 0 errors = 100)
  const totalErrors = healthReport.serverDetails.reduce((sum: number, server: any) => sum + server.errorCount, 0);
  const errorScore = Math.max(0, 100 - (totalErrors * 10)); // Each error reduces score by 10
  
  const overallHealth = (
    connectedScore * connectedWeight +
    responseTimeScore * responseTimeWeight +
    errorScore * errorWeight
  );
  
  return Math.round(overallHealth);
}

// Helper function to calculate individual server health score
function calculateServerHealthScore(server: any): number {
  if (server.status !== 'connected') return 0;
  
  const uptimeScore = Math.min(100, (server.uptime / (24 * 60 * 60 * 1000)) * 100); // 24h = 100%
  const responseTimeScore = Math.max(0, Math.min(100, 
    100 - ((server.responseTime - 500) / 2000) * 100
  ));
  const errorScore = Math.max(0, 100 - (server.errorCount * 5));
  
  return Math.round((uptimeScore * 0.4 + responseTimeScore * 0.4 + errorScore * 0.2));
}
