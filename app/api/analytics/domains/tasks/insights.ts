import { TokenPayload } from '@/lib/types/auth';
import { TaskAnalyticsService } from '@/lib/services/taskAnalyticsService';

/**
 * Task Insights Handler — Tier 3 ADAPTER (2026-06-23).
 *
 * The compute now lives in the single source of truth, TaskAnalyticsService.getTaskInsights.
 * This handler reshapes the flat service result into the existing
 * `{ summary, risks, workload, bottlenecks, recommendations }` contract (InsightsResponseSchema),
 * read by AnalyticsSection (`insightsData.data.summary.*`).
 *
 * BEHAVIOR (F-K): summary.tasksAtRisk / blockedTasks are now EXACT count() (was findMany().length
 * capped at 1000 → undercounted past 1000). The `risks` detail lists remain capped at 1000, so
 * `summary.tasksAtRisk` may legitimately exceed `risks.tasksAtRisk.length` on very large POVs.
 *
 * SECURITY: povIds / adminGlobal injected by handleTasksDomain; service floor rejects unscoped.
 */
export async function getTaskInsights(params: any, _user: TokenPayload) {
  const { povId, povIds, phaseId, teamId, adminGlobal } = params;

  const r = await TaskAnalyticsService.getTaskInsights(
    { povId, povIds, phaseId, teamId },
    { include: ['risks', 'workload', 'bottlenecks', 'recommendations'], scope: adminGlobal ? 'GLOBAL_ADMIN' : undefined }
  );

  return {
    summary: {
      tasksAtRisk: r.tasksAtRisk,
      blockedTasks: r.blockedTasks,
      productivityTrend: r.productivityTrend,
      averageWorkload: r.averageWorkload,
    },
    risks: r.risks,
    workload: r.workload,
    bottlenecks: r.bottlenecks,
    recommendations: r.recommendations,
  };
}
