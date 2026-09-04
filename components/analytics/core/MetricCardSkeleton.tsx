'use client';

import { Card, CardHeader, CardContent } from '@/components/ui/Card';

/**
 * MetricCardSkeleton Component
 * Loading skeleton that matches MetricCard dimensions
 *
 * Features:
 * - Matches MetricCard header/content structure
 * - Consistent animation across all analytics views
 * - Reduces layout shift during loading
 *
 * Used by:
 * - OverviewTab (loading state)
 * - InsightsTab (loading state)
 * - TaskMetricsCard (loading state)
 * - AnalyticsSection (loading state)
 */
export function MetricCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="h-4 bg-muted animate-pulse rounded w-24" />
        <div className="h-4 w-4 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent>
        <div className="h-8 bg-muted animate-pulse rounded w-16 mb-2" />
        <div className="h-3 bg-muted animate-pulse rounded w-32" />
      </CardContent>
    </Card>
  );
}

/**
 * MetricGridSkeleton Component
 * Grid of skeleton cards for dashboard loading states
 *
 * @param count - Number of skeleton cards to display (default: 4)
 */
export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * ContentSkeleton Component
 * Generic content area skeleton for larger sections
 */
export function ContentSkeleton({ className = '' }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="h-6 bg-muted animate-pulse rounded w-48" />
      </CardHeader>
      <CardContent>
        <div className="h-32 bg-muted animate-pulse rounded" />
      </CardContent>
    </Card>
  );
}

/**
 * InsightsSkeleton Component
 * Full skeleton for InsightsTab loading state
 */
export function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      <MetricGridSkeleton count={4} />
      <ContentSkeleton />
    </div>
  );
}

/**
 * ChartSkeleton Component
 * Skeleton for chart/visualization areas
 */
export function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 bg-muted animate-pulse rounded w-32" />
        <div className="h-3 bg-muted animate-pulse rounded w-48 mt-2" />
      </CardHeader>
      <CardContent>
        <div className={`${height} bg-muted animate-pulse rounded`} />
      </CardContent>
    </Card>
  );
}
