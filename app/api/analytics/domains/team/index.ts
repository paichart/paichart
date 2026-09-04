import { TokenPayload } from '@/lib/types/auth';
import { UnifiedAnalyticsQuery } from '@/lib/validation/task-validation';
import { getTeamActivity } from './activity';

/**
 * Team Domain Handler
 * Routes to team-specific analytics:
 * - activity: Team member activity metrics with complex POV filtering
 *
 * Part 2: Endpoint Consolidation (Phase 4/5)
 */
export async function handleTeamDomain(
  params: UnifiedAnalyticsQuery,
  user: TokenPayload
) {
  const { metrics } = params;

  // Handle 'all' or specific metrics
  const requestedMetrics = metrics.includes('all')
    ? ['activity']
    : metrics;

  const results: any = {};

  // Fetch requested metrics in parallel
  await Promise.all(
    requestedMetrics.map(async (metric: string) => {
      switch (metric) {
        case 'activity':
          results.activity = await getTeamActivity(params, user);
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
