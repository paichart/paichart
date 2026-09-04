import { TokenPayload } from '@/lib/types/auth';
import { TaskAnalyticsService } from '@/lib/services/taskAnalyticsService';

/**
 * Task Performance Handler — Tier 3 ADAPTER (2026-06-23).
 *
 * The compute now lives in the single source of truth, TaskAnalyticsService.getTaskPerformance.
 * This handler maps GUI params → service filters and reshapes the flat service result into the
 * existing `{ summary, distribution, trends, topPerformers }` contract (PerformanceResponseSchema),
 * so the schema and the POV-editor Analytics tab are unaffected.
 *
 * SECURITY: povIds (accessible-POV scope) / adminGlobal are injected by handleTasksDomain; the
 * service's fail-closed floor (assertAnalyticsScoped) rejects an accidentally-unscoped call.
 */
export async function getTaskPerformance(params: any, _user: TokenPayload) {
  const { povId, povIds, phaseId, assigneeId, teamId, startDate, endDate, timeframe = '30', adminGlobal } = params;

  const r = await TaskAnalyticsService.getTaskPerformance(
    {
      povId,
      povIds,
      phaseId,
      assigneeId,
      teamId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      // F-J: replicate the former GUI default (parseInt(timeframe)||30); only when no explicit range.
      timeframeDays: (startDate || endDate) ? undefined : (parseInt(timeframe, 10) || 30),
    },
    { include: ['distribution', 'trends', 'topPerformers'], scope: adminGlobal ? 'GLOBAL_ADMIN' : undefined }
  );

  return {
    summary: {
      totalTasks: r.totalTasks,
      completedTasks: r.completedTasks,
      completionRate: r.completionRate,
      averageCompletionTime: r.averageCompletionTime,
      onTimeRate: r.onTimeRate,
      overdueTasks: r.overdueTasks,
    },
    distribution: r.distribution,
    trends: r.trends,
    topPerformers: r.topPerformers,
  };
}
