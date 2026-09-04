/**
 * Analytics Module
 * Unified exports for analytics components, hooks, and context
 *
 * Usage:
 * import { MetricCard, useAnalyticsQuery, AnalyticsProvider } from '@/components/analytics';
 */

// Core Components
export {
  MetricCard,
  AnalyticsCard,
  RecommendationCard,
  NoRecommendationsCard,
  MetricCardSkeleton,
  MetricGridSkeleton,
  ContentSkeleton,
  InsightsSkeleton,
  ChartSkeleton,
  ExportButton,
} from './core';

export type {
  Recommendation,
  RecommendationType,
  RecommendationPriority,
} from './core';

// Hooks
export {
  useAnalyticsQuery,
  useOverviewAnalytics,
  useTaskInsights,
  useTaskPerformance,
  useTaskAnalytics,
} from './hooks';

export type {
  AnalyticsDomain,
  TimeRange,
  UseAnalyticsQueryOptions,
  TaskInsightsResponse,
} from './hooks';

// Context
export { AnalyticsProvider, useAnalyticsContext } from './AnalyticsContext';

// POV Selection
export { POVSelector } from './POVSelector';

// Tab Components (for page composition)
export { OverviewTab } from './tabs/OverviewTab';
export { InsightsTab } from './tabs/InsightsTab';
export { TaskMetricsCard } from './tabs/TaskMetricsCard';
export { RiskDashboard } from './tabs/RiskDashboard';
