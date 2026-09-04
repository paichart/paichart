import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { buildPOVAccessFilter } from '@/lib/pov/auth/pov-access-filter';
import { costForExecution } from '@/lib/services/llm/model-pricing';

/**
 * Agent Executions Summary Handler
 * Extracted from: /app/api/agent-executions/summary/route.ts
 *
 * Provides aggregated statistics on agent executions:
 * - Total/successful/failed execution counts
 * - Success rate and average execution time
 * - Execution breakdowns (by status, by agent)
 * - Recent activity (daily trends)
 * - Token usage estimates
 *
 * CRITICAL: Context-aware POV filtering (single POV vs cross-POV)
 *
 * Part 2: Endpoint Consolidation (Phase 3/5)
 */
export async function getAgentSummary(params: any, user: TokenPayload) {
  const { povId, taskId, timeRange = '30d' } = params;

  // Calculate date range
  const now = new Date();
  let startDate: Date;

  switch (timeRange) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
      startDate = new Date(0); // All time
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  // ============================================================================
  // CRITICAL: Context-aware POV filtering (preserved from source lines 57-114)
  // ============================================================================
  let taskWhereClause: any = {};

  if (povId) {
    // Single-POV query: filter by specific POV
    taskWhereClause = { povId };
  } else {
    // Cross-POV query: filter by all POVs user has access to (centralized helper)
    taskWhereClause = {
      pov: buildPOVAccessFilter(user)
    };
  }

  // Build where clause for agent executions
  // BC24 FIX: Add take cap to prevent unbounded result sets
  const executions = await prisma.agentExecution.findMany({
    where: {
      startTime: {
        gte: startDate
      },
      ...(taskId && taskId !== 'global' && { taskId }),
      // Apply context-aware POV filtering
      task: taskWhereClause
    },
    take: 10000,
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      agentTemplateId: true,
      // token-usage-persistence: real token facts (null on pre-2026-07-02 rows — forward-only)
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheCreationTokens: true,
      modelUsed: true
    }
  });

  // Calculate summary statistics
  const totalExecutions = executions.length;
  // ExecutionStatus enum is SUCCESS/FAILED — there is NO 'COMPLETED' (was always 0).
  const successfulExecutions = executions.filter(e => e.status === 'SUCCESS').length;
  const failedExecutions = executions.filter(e => e.status === 'FAILED').length;
  const activeExecutions = executions.filter(e => e.status === 'RUNNING').length;
  const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

  // Calculate average execution time
  const completedExecutions = executions.filter(e => e.startTime && e.endTime);
  const totalExecutionTime = completedExecutions.reduce((sum, exec) => {
    if (exec.startTime && exec.endTime) {
      return sum + (exec.endTime.getTime() - exec.startTime.getTime());
    }
    return sum;
  }, 0);
  const averageExecutionTime = completedExecutions.length > 0
    ? totalExecutionTime / completedExecutions.length
    : 0;

  // Period-over-period trends: current window vs the immediately-preceding window of equal length.
  // Deltas (not % change) to match the UI: executionTrend = count delta, successRateTrend = pp delta,
  // performanceTrend = avg-duration delta (ms; UI inverts the icon since faster is better).
  // 'all' timeRange has no meaningful previous period → trends stay 0.
  let executionTrend = 0;
  let successRateTrend = 0;
  let performanceTrend = 0;
  if (timeRange !== 'all') {
    const windowMs = now.getTime() - startDate.getTime();
    const prevExecutions = await prisma.agentExecution.findMany({
      where: {
        startTime: { gte: new Date(startDate.getTime() - windowMs), lt: startDate },
        ...(taskId && taskId !== 'global' && { taskId }),
        task: taskWhereClause
      },
      take: 10000,
      select: { status: true, startTime: true, endTime: true }
    });
    const prevTotal = prevExecutions.length;
    const prevSuccessRate = prevTotal > 0
      ? (prevExecutions.filter(e => e.status === 'SUCCESS').length / prevTotal) * 100
      : 0;
    const prevCompleted = prevExecutions.filter(e => e.startTime && e.endTime);
    const prevAvgDuration = prevCompleted.length > 0
      ? prevCompleted.reduce((sum, e) => sum + (e.endTime!.getTime() - e.startTime!.getTime()), 0) / prevCompleted.length
      : 0;
    executionTrend = totalExecutions - prevTotal;
    successRateTrend = Math.round((successRate - prevSuccessRate) * 10) / 10;
    performanceTrend = Math.round(averageExecutionTime - prevAvgDuration);
  }

  // Group by status
  const executionsByStatus = executions.reduce((acc, exec) => {
    acc[exec.status] = (acc[exec.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group by agent template
  const executionsByAgent = executions.reduce((acc, exec) => {
    const agent = exec.agentTemplateId || 'unknown';
    acc[agent] = (acc[agent] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Generate recent activity (daily breakdown for last 7 days)
  const recentActivity = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const dayExecutions = executions.filter(e =>
      e.startTime && e.startTime >= dayStart && e.startTime < dayEnd
    );

    const daySuccessful = dayExecutions.filter(e => e.status === 'SUCCESS').length;
    const daySuccessRate = dayExecutions.length > 0 ? (daySuccessful / dayExecutions.length) * 100 : 0;

    const dayCompleted = dayExecutions.filter(e => e.startTime && e.endTime);
    const dayTotalTime = dayCompleted.reduce((sum, exec) => {
      if (exec.startTime && exec.endTime) {
        return sum + (exec.endTime.getTime() - exec.startTime.getTime());
      }
      return sum;
    }, 0);
    const dayAverageTime = dayCompleted.length > 0 ? dayTotalTime / dayCompleted.length : 0;

    recentActivity.push({
      date: date.toISOString().split('T')[0],
      executions: dayExecutions.length,
      successRate: daySuccessRate,
      // 2026-06-12: was `averageTime` — the sole consumer (AgentHistoryView)
      // reads `avgDuration`; the Performance tab cell rendered undefined.
      avgDuration: dayAverageTime
    });
  }

  // 2026-06-12: topAgents — the UI's "Top Agents" tab rendered
  // summary.topAgents, a field this handler NEVER produced (phantom-field
  // family, same as pov.progress). Group by template, batch-resolve names
  // (WHERE IN — no N+1), rank by execution count.
  const agentStats = new Map<string, { executions: number; successful: number; totalTime: number; completed: number }>();
  for (const exec of executions) {
    const key = exec.agentTemplateId || 'unknown';
    const s = agentStats.get(key) ?? { executions: 0, successful: 0, totalTime: 0, completed: 0 };
    s.executions++;
    if (exec.status === 'SUCCESS') s.successful++;
    if (exec.startTime && exec.endTime) {
      s.totalTime += exec.endTime.getTime() - exec.startTime.getTime();
      s.completed++;
    }
    agentStats.set(key, s);
  }
  const templateIds = [...agentStats.keys()].filter(id => id !== 'unknown');
  const templates = templateIds.length > 0
    ? await prisma.agentTemplate.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, name: true }
      })
    : [];
  const nameById = new Map(templates.map(t => [t.id, t.name]));
  const topAgents = [...agentStats.entries()]
    .map(([id, s]) => ({
      agentName: nameById.get(id) || (id === 'unknown' ? 'Unknown agent' : id),
      executions: s.executions,
      successRate: s.executions > 0 ? (s.successful / s.executions) * 100 : 0,
      avgDuration: s.completed > 0 ? s.totalTime / s.completed : 0
    }))
    .sort((a, b) => b.executions - a.executions)
    .slice(0, 6);

  // token-usage-persistence: REAL token facts + derived cost, replacing the former
  // `totalExecutions * 1500` fabrication (a Protocol-10 fact-vs-verdict violation). Summed from the
  // already-fetched, POV-scoped executions (no extra query). Cost is derived per-execution priced
  // AS-OF startTime (never stored); unpriceable models contribute 0 and lower `costCoverage`.
  // Historical rows have null token columns (forward-only) → contribute 0; the number reflects the
  // retained window honestly (see PRUNE-ON-COMPLETE), not an all-time total.
  let totalInputTokens = 0, totalOutputTokens = 0, totalCacheReadTokens = 0, totalCacheCreationTokens = 0;
  let totalCostUsd = 0;
  let tokenBearingExecutions = 0, pricedExecutions = 0;
  const byModelMap = new Map<string, { executions: number; inputTokens: number; outputTokens: number; costUsd: number }>();
  for (const e of executions) {
    if (e.inputTokens != null || e.outputTokens != null) tokenBearingExecutions++;
    totalInputTokens += e.inputTokens || 0;
    totalOutputTokens += e.outputTokens || 0;
    totalCacheReadTokens += e.cacheReadTokens || 0;
    totalCacheCreationTokens += e.cacheCreationTokens || 0;
    const cost = costForExecution(e, e.modelUsed, e.startTime || now);
    if (cost.priced && cost.costUsd != null) { totalCostUsd += cost.costUsd; pricedExecutions++; }
    const key = e.modelUsed || 'unknown';
    const bm = byModelMap.get(key) ?? { executions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    bm.executions++;
    bm.inputTokens += e.inputTokens || 0;
    bm.outputTokens += e.outputTokens || 0;
    if (cost.priced && cost.costUsd != null) bm.costUsd += cost.costUsd;
    byModelMap.set(key, bm);
  }
  const totalTokensUsed = totalInputTokens + totalOutputTokens;
  const byModel = [...byModelMap.entries()]
    .map(([model, s]) => ({ model, ...s }))
    .sort((a, b) => b.costUsd - a.costUsd);
  // Honesty signal: fraction of in-window executions that carry real token data (vs null historical).
  const costCoverage = totalExecutions > 0 ? tokenBearingExecutions / totalExecutions : 0;

  return {
    summary: {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate,
      averageExecutionTime,
      totalExecutionTime,
      totalTokensUsed,
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      totalCostUsd,
      costCoverage,
      byModel,
      activeExecutions,
      executionsByStatus,
      executionsByAgent,
      trends: {
        executionTrend,
        successRateTrend,
        performanceTrend // renamed from averageTimeTrend — the UI reads summary.trends.performanceTrend
      },
      topAgents,
      recentActivity
    }
  };
}
