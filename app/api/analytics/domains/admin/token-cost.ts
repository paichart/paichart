import { prisma } from '@/lib/prisma';
import { TokenPayload } from '@/lib/types/auth';
import { getAccessiblePovIds } from '@/lib/auth/accessible-pov-scope';
import { costForExecution } from '@/lib/services/llm/model-pricing';
import { ROLLUP_UNKNOWN_MODEL, ROLLUP_NO_POV } from '@/lib/services/execution-artifacts';

/**
 * Admin token-cost metric (token-usage-persistence Phase 2 #1) — the DURABLE all-time cost surface.
 * Unions LIVE un-pruned executions + the `token_usage_daily` rollup (historical, pruned), so cost
 * history survives PRUNE-ON-COMPLETE. Cost is DERIVED here per bucket/row as-of its date (Protocol 10).
 *
 * Ordering: read ROLLUP first, then LIVE. A row pruned in the read gap is then in NEITHER (read rollup
 * before the prune; gone from live after) → the skew can only UNDER-count by rows pruned mid-read
 * (negligible), never double-count or leak. Live-first would double-count.
 *
 * Scoping: `getAccessiblePovIds` returns null for admins (global — this metric is behind the admin gate)
 * or a POV-id allowlist (fail-closed; never matches the `__none__` sentinel). Defense-in-depth even
 * though the admin domain is admin-only.
 */
export async function handleTokenCost(params: any, user: TokenPayload) {
  const { timeRange = '30d' } = params;

  const now = new Date();
  const startDate =
    timeRange === '24h' ? new Date(now.getTime() - 24 * 60 * 60 * 1000) :
    timeRange === '7d'  ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) :
    timeRange === '30d' ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) :
    timeRange === '90d' ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) :
    timeRange === '1y'  ? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) :
    timeRange === 'all' ? new Date(0) :
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const accessiblePovIds = await getAccessiblePovIds(user); // null = admin/global

  // 1) ROLLUP first (historical, pruned).
  const rollup = await prisma.tokenUsageDaily.findMany({
    where: {
      bucketDate: { gte: startDate },
      ...(accessiblePovIds !== null ? { povId: { in: accessiblePovIds } } : {}),
    },
  });

  // 2) LIVE (recent, un-pruned) — token-bearing only, POV-scoped via the task relation.
  const live = await prisma.agentExecution.findMany({
    where: {
      startTime: { gte: startDate },
      inputTokens: { not: null },
      ...(accessiblePovIds !== null ? { task: { povId: { in: accessiblePovIds } } } : {}),
    },
    take: 50000,
    select: {
      startTime: true, inputTokens: true, outputTokens: true,
      cacheReadTokens: true, cacheCreationTokens: true, modelUsed: true,
    },
  });

  const byModelMap = new Map<string, { executions: number; inputTokens: number; outputTokens: number; costUsd: number }>();
  let totalCostUsd = 0, totalInputTokens = 0, totalOutputTokens = 0, totalExecutions = 0;
  let pricedExecutions = 0;

  const add = (model: string, executions: number, input: number, output: number, cost: { costUsd: number | null; priced: boolean }) => {
    totalExecutions += executions;
    totalInputTokens += input;
    totalOutputTokens += output;
    if (cost.priced && cost.costUsd != null) { totalCostUsd += cost.costUsd; pricedExecutions += executions; }
    const bm = byModelMap.get(model) ?? { executions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    bm.executions += executions;
    bm.inputTokens += input;
    bm.outputTokens += output;
    if (cost.priced && cost.costUsd != null) bm.costUsd += cost.costUsd;
    byModelMap.set(model, bm);
  };

  // Rollup rows — model/date carried by the bucket; unknown-model sentinel → null (unpriceable).
  for (const b of rollup) {
    const input = Number(b.inputTokens), output = Number(b.outputTokens);
    const model = b.modelUsed === ROLLUP_UNKNOWN_MODEL ? null : b.modelUsed;
    const cost = costForExecution(
      { inputTokens: input, outputTokens: output, cacheReadTokens: Number(b.cacheReadTokens), cacheCreationTokens: Number(b.cacheCreationTokens) },
      model, b.bucketDate,
    );
    add(model ?? 'unknown', Number(b.executions), input, output, cost);
  }

  // Live rows — one execution each, priced as-of startTime.
  for (const e of live) {
    const cost = costForExecution(e, e.modelUsed, e.startTime || now);
    add(e.modelUsed || 'unknown', 1, e.inputTokens || 0, e.outputTokens || 0, cost);
  }

  const byModel = [...byModelMap.entries()]
    .map(([model, s]) => ({ model, ...s }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    data: {
      tokenCost: {
        timeRange,
        totalExecutions,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd,
        // Coverage: what fraction of counted executions were priceable (unknown models → unpriced).
        costCoverage: totalExecutions > 0 ? pricedExecutions / totalExecutions : 0,
        durable: true,                    // includes pruned history via the rollup (not a rolling window)
        rollupBuckets: rollup.length,
        liveExecutions: live.length,
        byModel,
      },
    },
  };
}
