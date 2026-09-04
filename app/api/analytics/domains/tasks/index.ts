import { TokenPayload } from '@/lib/types/auth';
import { UnifiedAnalyticsQuery } from '@/lib/validation/task-validation';
import { getAccessiblePovIds } from '@/lib/auth/accessible-pov-scope';
import { getTaskPerformance } from './performance';
import { getTaskInsights } from './insights';

/**
 * Tasks Domain Handler
 * Routes to task-specific analytics:
 * - performance: Task completion metrics
 * - insights: Predictive insights and recommendations
 */
export async function handleTasksDomain(
  params: UnifiedAnalyticsQuery,
  user: TokenPayload
) {
  const { metrics } = params;

  // 🔒 SECURITY (SEC-C1, 2026-06-23): the no-povId path previously computed ALL-tenant
  // aggregates (incl. assignee names/emails) for any authenticated user. When no povId is
  // given, scope to the user's accessible POVs (admins → null → global, unchanged). A non-admin
  // with no POVs gets `povIds: []` → the handlers apply `{ in: [] }` → zero rows (fail-closed).
  let scopedParams: any = params;
  if (!params.povId) {
    const accessiblePovIds = await getAccessiblePovIds(user);
    if (accessiblePovIds !== null) {
      scopedParams = { ...params, povIds: accessiblePovIds };
    } else {
      // admin → intentional global; mark it so the adapters pass the service's GLOBAL_ADMIN
      // sentinel (F-D fail-closed floor would otherwise reject the unscoped call).
      scopedParams = { ...params, adminGlobal: true };
    }
  }

  // Handle 'all' or specific metrics
  const requestedMetrics = metrics.includes('all')
    ? ['performance', 'insights']
    : metrics;

  const results: any = {};

  // Fetch requested metrics in parallel
  await Promise.all(
    requestedMetrics.map(async (metric: string) => {
      switch (metric) {
        case 'performance':
          results.performance = await getTaskPerformance(scopedParams, user);
          break;

        case 'insights':
          results.insights = await getTaskInsights(scopedParams, user);
          break;

        case 'all':
          // 'all' was already expanded above
          break;

        default:
          throw new Error(`Unknown metric: ${metric}`);
      }
    })
  );

  return { data: results };
}
