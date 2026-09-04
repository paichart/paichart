import { TokenPayload } from '@/lib/types/auth';
import { UnifiedAnalyticsQuery } from '@/lib/validation/task-validation';
import { handlePortfolioHealth } from './portfolio-health';
import { handleAdminRecommendations } from './recommendations';
import { handleSystemHealth } from './system-health';
import { handleHealthHistory } from './health-history';
import { handleTokenCost } from './token-cost';

/**
 * Admin Domain Handler
 * Phase 2 + Phase 3 + Phase 4 of Admin Intelligence Implementation
 *
 * Provides admin-only analytics:
 * - portfolio-health: Cross-POV aggregation metrics (Phase 2)
 * - recommendations: Admin-specific recommendations (Phase 3)
 * - system-health: Infrastructure metrics (Phase 4)
 * - health-history: Historical health scores for timeline (Phase 5)
 *
 * Security: Admin role validation in unified router
 *
 * Metrics supported:
 * - 'portfolio-health' → handlePortfolioHealth
 * - 'recommendations' → handleAdminRecommendations
 * - 'system-health' → handleSystemHealth
 * - 'health-history' → handleHealthHistory
 * - 'all' → All metrics (except health-history which must be explicit)
 */
export async function handleAdminDomain(
  params: UnifiedAnalyticsQuery,
  user: TokenPayload
) {
  const { metrics = ['all'] } = params;

  // Determine which metrics to fetch
  const requestedMetrics = metrics.includes('all')
    ? ['portfolio-health', 'recommendations', 'system-health']  // All phases
    : metrics;

  const results: Record<string, any> = {};

  // Fetch requested metrics in parallel
  await Promise.all(
    requestedMetrics.map(async (metric) => {
      switch (metric) {
        case 'portfolio-health':
          const healthResult = await handlePortfolioHealth(params, user);
          results.portfolioHealth = healthResult.data;
          break;

        case 'recommendations':
          const recsResult = await handleAdminRecommendations(params, user);
          results.recommendations = recsResult.data;
          break;

        case 'system-health':
          const systemResult = await handleSystemHealth(params, user);
          results.systemHealth = systemResult.data;
          break;

        case 'health-history': {
          // P4 2026-06-12: forward the validated timeRange (was hardcoded
          // 6 months — flat history compressed into the chart's left edge).
          // No param keeps the legacy 6-month window.
          const tr = params.timeRange;
          const historyOpts =
            tr === '7d' || tr === '30d' ? { months: 1, period: 'weekly' as const } :
            tr === '90d' ? { months: 3, period: 'weekly' as const } :
            tr === '1y' ? { months: 12, period: 'monthly' as const } :
            { months: 6, period: 'weekly' as const };
          const historyResult = await handleHealthHistory(historyOpts, user);
          results.healthHistory = historyResult.data;
          break;
        }

        case 'token-cost': {
          // token-usage-persistence Phase 2: durable all-time LLM cost (rollup + live). Explicit-only
          // (not in 'all') — like health-history, it's a heavier dedicated surface.
          const costResult = await handleTokenCost(params, user);
          results.tokenCost = costResult.data.tokenCost;
          break;
        }

        default:
          // Unknown metric - skip silently (already validated by schema)
          break;
      }
    })
  );

  return { data: results };
}
