'use client';

import { Card, CardContent } from '@/components/ui/Card';
import { Folder, CheckCircle, Bot, TrendingUp } from 'lucide-react';
import { MetricCard, MetricGridSkeleton } from '@/components/analytics/core';
import { useOverviewAnalytics, TimeRange } from '@/components/analytics/hooks';
import { RiskDashboard } from './RiskDashboard';
import { PortfolioBreakdown } from './PortfolioBreakdown';
import { BLOOMBERG_HEADER, BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';
import { MetricTooltip } from '@/components/ui/MetricTooltip';

interface OverviewTabProps {
  povId: string | 'all';
  timeRange: string;
}

interface OverviewMetrics {
  povCount: number;
  taskCompletionRate: number;
  agentSuccessRate: number;
  hoursSaved: number;
  povTrend: number;
  taskTrend: number;
  agentTrend: number;
  roiTrend: number;
  projects?: Array<{
    id: string; title: string; status: string; theatre: string | null;
    owner: string | null; totalTasks: number; completedTasks: number; completionRate: number;
  }>;
}

/**
 * Overview Tab Component
 * High-level analytics metrics with risk dashboard
 *
 * Displays:
 * - Active Projects count
 * - Task Completion Rate (Project Health)
 * - Agent Success Rate (AI Reliability)
 * - ROI (Automation Savings)
 * - Risk Dashboard (when specific POV selected)
 */
export function OverviewTab({ povId, timeRange }: OverviewTabProps) {
  const { data, isLoading, error } = useOverviewAnalytics(
    povId,
    timeRange as TimeRange
  ) as { data: OverviewMetrics | undefined; isLoading: boolean; error: unknown };

  if (isLoading) {
    return <MetricGridSkeleton count={4} />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-destructive">
            Failed to load overview metrics. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const timeLabel = timeRange === '7d' ? '7 days' : timeRange === '90d' ? '90 days' : '30 days';

  // Default hourly rate for ROI calculation (can be made configurable per POV)
  const hourlyRate = 100;
  const dollarSavings = data.hoursSaved * hourlyRate;

  return (
    <div className="space-y-0 font-mono">
      {/* Bloomberg Header Bar */}
      <div className={BLOOMBERG_HEADER.container + " flex items-center gap-4"}>
        <span className={BLOOMBERG_HEADER.title}>OVERVIEW</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>PROJECTS:</span>
        <MetricTooltip explainer="POVs in scope for this view" className={BLOOMBERG_COLORS.info}>{data.povCount}</MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        {/* 2026-06-12 UX: was labeled HEALTH — but the value is task
            completion rate, and 'health' already means two OTHER formulas
            on the admin dashboard. Call it what it is. */}
        <span className={BLOOMBERG_HEADER.metric}>COMPLETION:</span>
        <MetricTooltip explainer={`Tasks completed (last ${timeLabel})`} className={`font-bold ${data.taskCompletionRate >= 80 ? BLOOMBERG_COLORS.success : data.taskCompletionRate >= 60 ? BLOOMBERG_COLORS.warning : BLOOMBERG_COLORS.error}`}>
          {data.taskCompletionRate}%
        </MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>AI SUCCESS:</span>
        <MetricTooltip explainer={`Agent executions completed successfully (last ${timeLabel})`} className={`font-bold ${data.agentSuccessRate >= 80 ? BLOOMBERG_COLORS.success : data.agentSuccessRate >= 60 ? BLOOMBERG_COLORS.warning : BLOOMBERG_COLORS.error}`}>
          {data.agentSuccessRate}%
        </MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        {/* ROI is an ESTIMATE: agent execution wall-time treated as human
            hours saved, valued at an assumed $100/hr — say so (Protocol 10:
            estimates must not masquerade as measurements). */}
        <span className={BLOOMBERG_HEADER.metric}>ROI:</span>
        <MetricTooltip
          explainer={`Estimate: ${data.hoursSaved}h of agent execution time treated as human hours saved, valued at an assumed $100/hr`}
          className={BLOOMBERG_COLORS.success}
        >
          {data.hoursSaved}h
        </MetricTooltip>
        <span className="text-muted-foreground text-[10px]">(${dollarSavings.toLocaleString()} est.)</span>
      </div>

      {/* Portfolio breakdown — All Projects only */}
      {povId === 'all' && data.projects && data.projects.length > 0 && (
        <PortfolioBreakdown projects={data.projects} />
      )}

      {/* Risk Dashboard — portfolio risk when All Projects, per-project otherwise */}
      <div className="mt-4">
        <RiskDashboard povId={povId} timeRange={timeRange} />
      </div>
    </div>
  );
}
