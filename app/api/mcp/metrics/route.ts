import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { analyticsReadLimiter } from '@/lib/middleware/rate-limit';
import { mcpLogger } from '@/lib/logger';
import os from 'os';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/mcp/metrics - Get MCP system metrics and analytics
const getMCPMetricsHandler: ApiHandler = async (
  request: NextRequest,
  { params }: { params: Record<string, string> },
  user?: TokenPayload
) => {
  // ✅ Rate limiting (P2.3): 100 analytics queries per minute
  const rateLimitResponse = analyticsReadLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    mcpLogger.info('Fetching system metrics');
    
    const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');
    
    // Get health report from server manager
    const healthReport = mcpServerManager.getHealthReport();

    // 2026-06-12: real tool counts from the DB catalog. Previously
    // activeTools = connectedServers ("Simplified") — the dashboard's
    // "ACTIVE: 1/6" was connected-SERVER count over tool count
    // (apples over oranges). connectedServers is now its own field.
    const connectedServers = healthReport.connectedServers;

    // 2026-06-12 mock-data eviction: all derived metrics below now come from
    // the interactions table (real data), windowed to the last 30 days.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const since30d = new Date(Date.now() - 30 * DAY_MS);
    const since24h = new Date(Date.now() - DAY_MS);
    const since7d = new Date(Date.now() - 7 * DAY_MS);
    const since14d = new Date(Date.now() - 14 * DAY_MS);

    const [interactions, totalToolCount, newToolCount, activeToolCount, latestTool] = await Promise.all([
      prisma.mCPInteraction.findMany({
        where: { createdAt: { gte: since30d } },
        select: {
          toolId: true,
          status: true,
          executionTime: true,
          createdAt: true,
          tool: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      prisma.mCPTool.count(),
      prisma.mCPTool.count({ where: { createdAt: { gte: since30d } } }),
      prisma.mCPTool.count({ where: { status: 'ACTIVE' } }),
      prisma.mCPTool.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { name: true, createdAt: true },
      }),
    ]);

    const totalInteractions = interactions.length;
    // Success/failure are computed over RESOLVED interactions (COMPLETED + FAILED). PENDING is
    // surfaced separately and NOT counted as failure — previously successRate was COMPLETED/total,
    // so a backlog of PENDING (logged-but-not-finalized) interactions read as a false ~87% error
    // rate / UNHEALTHY. (Root cause of the PENDING backlog fixed in mcp-logging.ts.)
    const completedCount = interactions.filter((i) => i.status === 'COMPLETED').length;
    const failedCount = interactions.filter((i) => i.status === 'FAILED').length;
    const pendingInteractions = interactions.filter((i) => i.status === 'PENDING').length;
    const resolvedCount = completedCount + failedCount;
    const successRate = resolvedCount > 0 ? (completedCount / resolvedCount) * 100 : 0;
    const failureRate = resolvedCount > 0 ? (failedCount / resolvedCount) * 100 : 0;
    // Math.round: raw division rendered as "190.22132796780684ms" in the
    // dashboard header (2026-06-12 cosmetic fix)
    const avgResponseTime =
      totalInteractions > 0
        ? Math.round(
            interactions.reduce((acc, i) => acc + (i.executionTime || 0), 0) / totalInteractions
          )
        : 0;

    // Real trends: this 7-day window vs the prior 7-day window
    // (was hardcoded fake growth numbers until 2026-06-12)
    const rateOf = (arr: typeof interactions) => {
      const resolved = arr.filter((i) => i.status === 'COMPLETED' || i.status === 'FAILED');
      return resolved.length > 0
        ? (resolved.filter((i) => i.status === 'COMPLETED').length / resolved.length) * 100
        : 0;
    };
    const avgTimeOf = (arr: typeof interactions) =>
      arr.length > 0
        ? arr.reduce((acc, i) => acc + (i.executionTime || 0), 0) / arr.length
        : 0;

    const last7 = interactions.filter((i) => i.createdAt >= since7d);
    const prior7 = interactions.filter(
      (i) => i.createdAt >= since14d && i.createdAt < since7d
    );

    const trends = {
      // % of the tool catalog registered in the last 30 days
      toolGrowth:
        totalToolCount > 0 ? Math.round((newToolCount / totalToolCount) * 100) : 0,
      // interaction volume delta: last 7d vs prior 7d
      interactionTrend: last7.length - prior7.length,
      // success-rate delta (percentage points)
      successTrend: Math.round((rateOf(last7) - rateOf(prior7)) * 10) / 10,
      // avg response-time delta in ms (negative = faster)
      responseTrend: Math.round(avgTimeOf(last7) - avgTimeOf(prior7)),
    };

    const toolPerformance = Object.values(
      interactions.reduce((acc, i) => {
        const toolId = i.toolId || 'unknown';
        if (!acc[toolId]) {
          acc[toolId] = {
            toolId,
            name: i.tool?.name || 'Unknown Service',
            executions: 0,
            completed: 0,
            failed: 0,
            successRate: 0,
            avgTime: 0,
          };
        }
        acc[toolId].executions++;
        if (i.status === 'COMPLETED') acc[toolId].completed++;
        else if (i.status === 'FAILED') acc[toolId].failed++;
        acc[toolId].avgTime += i.executionTime || 0;
        return acc;
      }, {} as Record<string, any>)
    ).map((tool: any) => {
      const resolved = tool.completed + tool.failed;
      if (tool.executions > 0) tool.avgTime /= tool.executions;
      // Success over RESOLVED interactions (completed + failed), not completed/total — the
      // latter showed e.g. 0.2% for a service whose interactions were mostly logged-not-
      // finalized (PENDING). Matches the header SUCCESS metric.
      tool.successRate = resolved > 0 ? (tool.completed / resolved) * 100 : 0;
      return tool;
    });

    // Real 24h interaction patterns bucketed by UTC hour-of-day
    // (was Math.random() simulated data until 2026-06-12 — the dashboard
    // histogram literally rendered random bars)
    const last24 = interactions.filter((i) => i.createdAt >= since24h);
    const interactionPatterns = Array.from({ length: 24 }, (_, hour) => {
      const bucket = last24.filter((i) => i.createdAt.getUTCHours() === hour);
      return {
        hour,
        interactions: bucket.length,
        successRate: bucket.length > 0 ? Math.round(rateOf(bucket) * 10) / 10 : 0,
      };
    });

    // Real recent activity: latest RESOLVED interactions + latest service registration.
    // Only completed/failed are meaningful events — a PENDING ("call pending") row is just a
    // logged-not-finalized record, not an event worth surfacing. "Service registered" because
    // MCPTool rows are MCP services (internal + external), not individual tools.
    const recentActivity = [
      ...interactions
        .filter((i) => i.status === 'COMPLETED' || i.status === 'FAILED')
        .slice(0, 2)
        .map((i) => ({
          type: 'interaction' as const,
          label: `${i.tool?.name || 'Service'} call ${i.status === 'COMPLETED' ? 'completed' : 'failed'}`,
          timestamp: i.createdAt,
        })),
      ...(latestTool
        ? [{
            type: 'registration' as const,
            label: `Service registered: ${latestTool.name}`,
            timestamp: latestTool.createdAt,
          }]
        : []),
    ]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 3);

    const metrics = {
      totalTools: totalToolCount,
      activeTools: activeToolCount,
      connectedServers,
      totalInteractions,
      successRate,
      failureRate,
      pendingInteractions,
      avgResponseTime,
      trends,
      toolPerformance,
      interactionPatterns,
      recentActivity,
      lastUpdated: new Date(),
      // Real process metrics (was hardcoded 65/42/28 + fake 99.8 uptime).
      // memoryUsage = this Node process RSS as % of host memory;
      // cpuUsage = 1-min load average per core. networkIO removed — no
      // cheap real source exists; we don't fabricate it.
      systemHealth: {
        // Explicit thresholds: >=80% success (or no traffic) healthy,
        // >=50% degraded, else unhealthy
        // Health from the true FAILED rate (of resolved interactions), not success-over-total —
        // PENDING (logged-not-finalized) interactions must not drive the system to UNHEALTHY.
        overallStatus:
          resolvedCount === 0 || failureRate <= 10
            ? 'healthy'
            : failureRate <= 30
              ? 'degraded'
              : 'unhealthy',
        processUptimeSeconds: Math.round(process.uptime()),
        memoryUsage: Math.round((process.memoryUsage().rss / os.totalmem()) * 100),
        cpuUsage: Math.min(100, Math.round((os.loadavg()[0] / os.cpus().length) * 100)),
      },
    };
    
    mcpLogger.info({ totalTools: totalToolCount, activeTools: activeToolCount, connectedServers }, 'Generated metrics');
    
    return {
      data: metrics
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to fetch metrics');
    return {
      error: {
        message: 'Failed to fetch MCP metrics',
        code: 'METRICS_FETCH_FAILED',
        details: 'See server logs for details'
      },
    };
  }
};

export const GET = createHandler(getMCPMetricsHandler, { requireAuth: true });
