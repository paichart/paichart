/**
 * Core Analytics Components
 * Reusable component library for all analytics dashboards
 *
 * Shared components for consistent UX across all analytics views.
 * Reduces code duplication and provides single source of truth for common patterns.
 */

// Display Components
export { MetricCard } from './MetricCard';
export { AnalyticsCard } from './AnalyticsCard';

// Recommendation Components
export {
  RecommendationCard,
  NoRecommendationsCard,
} from './RecommendationCard';
export type {
  Recommendation,
  RecommendationType,
  RecommendationPriority,
} from './RecommendationCard';

// Skeleton Components
export {
  MetricCardSkeleton,
  MetricGridSkeleton,
  ContentSkeleton,
  InsightsSkeleton,
  ChartSkeleton,
} from './MetricCardSkeleton';

// Actions
export { ExportButton } from './ExportButton';
