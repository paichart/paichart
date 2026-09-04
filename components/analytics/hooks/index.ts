/**
 * Analytics Hooks
 * Unified data fetching patterns for analytics
 */

export {
  useAnalyticsQuery,
  useOverviewAnalytics,
  useTaskInsights,
  useTaskPerformance,
  useTaskAnalytics,
} from './useAnalyticsQuery';

export type {
  AnalyticsDomain,
  TimeRange,
  UseAnalyticsQueryOptions,
  TaskInsightsResponse,
} from './useAnalyticsQuery';
