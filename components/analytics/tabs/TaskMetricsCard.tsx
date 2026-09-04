'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { CheckCircle, Clock, AlertCircle, XCircle } from 'lucide-react';
import { useTaskPerformance, TimeRange } from '../hooks';
import { ContentSkeleton } from '../core';
import { BLOOMBERG_HEADER, BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';

interface TaskMetricsCardProps {
  povId: string;
  timeRange?: string;
}

interface PerformanceData {
  summary: {
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    avgCompletionTime?: number;
  };
  distribution: {
    byStatus: Array<{ status: string; _count: number }>;
  };
}

/**
 * Task Metrics Card Component
 * Displays task completion rate and status distribution
 *
 * Uses: useTaskPerformance hook (unified analytics endpoint)
 * Displays: Completion rate, status distribution, avg completion time
 */
export function TaskMetricsCard({ povId, timeRange = '30d' }: TaskMetricsCardProps) {
  const { data: rawData, isLoading, error } = useTaskPerformance(
    povId,
    timeRange as TimeRange
  );

  // Extract performance data from response
  const data = (rawData as { performance?: PerformanceData })?.performance;

  if (isLoading) {
    return <ContentSkeleton className="h-64" />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Task Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load task metrics. {error instanceof Error ? error.message : 'Please try again.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data?.summary) {
    return null;
  }

  const { summary, distribution } = data;
  const completionRate = summary.completionRate || 0;

  // Extract status distribution
  const statusCounts = distribution?.byStatus || [];
  const openCount = statusCounts.find((s: any) => s.status === 'OPEN')?._count || 0;
  const inProgressCount = statusCounts.find((s: any) => s.status === 'IN_PROGRESS')?._count || 0;
  const completedCount = statusCounts.find((s: any) => s.status === 'COMPLETED')?._count || 0;
  const blockedCount = statusCounts.find((s: any) => s.status === 'BLOCKED')?._count || 0;

  return (
    <div className="space-y-0 font-mono">
      {/* Bloomberg Header Bar */}
      <div className={BLOOMBERG_HEADER.container + " flex items-center gap-4"}>
        <span className={BLOOMBERG_HEADER.title}>TASK PERFORMANCE</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>COMPLETION:</span>
        <span className={`font-bold ${completionRate >= 80 ? BLOOMBERG_COLORS.success : completionRate >= 60 ? BLOOMBERG_COLORS.warning : BLOOMBERG_COLORS.error}`}>
          {completionRate}%
        </span>
        <span className="text-muted-foreground text-[10px]">({summary.completedTasks}/{summary.totalTasks})</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>COMPLETED:</span>
        <span className={BLOOMBERG_COLORS.success}>{completedCount}</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>IN PROGRESS:</span>
        <span className={BLOOMBERG_COLORS.info}>{inProgressCount}</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>OPEN:</span>
        <span className={BLOOMBERG_COLORS.warning}>{openCount}</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>BLOCKED:</span>
        <span className={BLOOMBERG_COLORS.error}>{blockedCount}</span>
        {summary.avgCompletionTime && (
          <>
            <span className={BLOOMBERG_HEADER.separator}>|</span>
            <span className={BLOOMBERG_HEADER.metric}>AVG:</span>
            <span className={BLOOMBERG_COLORS.info}>{Math.round(summary.avgCompletionTime)}d</span>
          </>
        )}
      </div>
    </div>
  );
}
