import { TokenPayload } from '@/lib/types/auth';
import { UnifiedAnalyticsQuery } from '@/lib/validation/task-validation';
import { getAgentSummary } from './summary';

/**
 * Agents Domain Handler
 * Routes to agent-specific analytics:
 * - summary: Aggregated execution statistics
 *
 * Part 2: Endpoint Consolidation (Phase 3/5)
 */
export async function handleAgentsDomain(
  params: UnifiedAnalyticsQuery,
  user: TokenPayload
) {
  const { metrics } = params;

  // Handle 'all' or specific metrics
  const requestedMetrics = metrics.includes('all')
    ? ['summary']
    : metrics;

  const results: any = {};

  // Fetch requested metrics in parallel
  await Promise.all(
    requestedMetrics.map(async (metric: string) => {
      switch (metric) {
        case 'summary':
          results.summary = await getAgentSummary(params, user);
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
