'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { useAnalyticsQuery } from '../hooks';
import { MetricCardSkeleton } from '../core';
import { BLOOMBERG_COLORS, BLOOMBERG_VARIANTS } from '@/lib/constants/bloomberg-styles';

interface RiskDashboardProps {
  povId: string;
  timeRange: string;
}

interface RiskTask {
  id: string;
  title: string;
  dueDate?: string;
  status: string;
  assignee?: {
    name: string;
  };
}

interface InsightsResponse {
  insights: {
    summary: {
      tasksAtRisk: number;
      blockedTasks: number;
      productivityTrend: number;
      averageWorkload: number;
    };
    risks: {
      tasksAtRisk: RiskTask[];
      blockedTasks: RiskTask[];
    };
  };
}

/**
 * RiskDashboard Component
 * Surfaces high-priority risk items on the Overview tab
 *
 * Features:
 * - Shows tasks at risk (overdue or due within 3 days)
 * - Shows blocked tasks (waiting on dependencies)
 * - Quick navigation to Insights tab for details
 * - Green state when no risks present
 *
 * Used by:
 * - OverviewTab (embedded when POV selected)
 */
export function RiskDashboard({ povId, timeRange }: RiskDashboardProps) {
  const router = useRouter();

  const { data, isLoading, error } = useAnalyticsQuery<InsightsResponse>({
    domain: 'tasks',
    metrics: ['insights'],
    povId,
    timeRange: timeRange as '7d' | '30d' | '90d' | '1y',
    allowAllPOVs: true, // aggregate risk across all accessible POVs when 'all' is selected
  });

  const navigateToInsights = (filter?: string) => {
    const params = new URLSearchParams({
      povId,
      range: timeRange,
      tab: 'insights',
    });
    if (filter) {
      params.set('filter', filter);
    }
    router.push(`/analytics?${params}`);
  };

  if (isLoading) {
    return <RiskDashboardSkeleton />;
  }

  if (error || !data?.insights?.summary) {
    return null;
  }

  const { tasksAtRisk, blockedTasks } = data.insights.summary;
  const hasRisks = tasksAtRisk > 0 || blockedTasks > 0;

  // No risks - show success state
  if (!hasRisks) {
    return (
      <Card className={BLOOMBERG_VARIANTS.success}>
        <CardContent className="p-4 flex items-center justify-center gap-2">
          <CheckCircle className={`h-5 w-5 ${BLOOMBERG_COLORS.success}`} />
          <p className={BLOOMBERG_COLORS.success}>
            No tasks at risk - Project is on track!
          </p>
        </CardContent>
      </Card>
    );
  }

  const riskTasks = data.insights.risks?.tasksAtRisk || [];
  const blocked = data.insights.risks?.blockedTasks || [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {tasksAtRisk > 0 && (
        <RiskCard
          icon={<AlertTriangle className={`h-5 w-5 ${BLOOMBERG_COLORS.warning}`} />}
          title={`${tasksAtRisk} Task${tasksAtRisk > 1 ? 's' : ''} at Risk`}
          description="Overdue or due within 3 days"
          tasks={riskTasks.slice(0, 3)}
          variant="warning"
          onViewAll={() => navigateToInsights('at-risk')}
        />
      )}
      {blockedTasks > 0 && (
        <RiskCard
          icon={<AlertCircle className={`h-5 w-5 ${BLOOMBERG_COLORS.error}`} />}
          title={`${blockedTasks} Blocked Task${blockedTasks > 1 ? 's' : ''}`}
          description="Waiting on dependencies"
          tasks={blocked.slice(0, 3)}
          variant="danger"
          onViewAll={() => navigateToInsights('blocked')}
        />
      )}
    </div>
  );
}

interface RiskCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  tasks: RiskTask[];
  variant: 'warning' | 'danger';
  onViewAll: () => void;
}

function RiskCard({ icon, title, description, tasks, variant, onViewAll }: RiskCardProps) {
  return (
    <Card className={BLOOMBERG_VARIANTS[variant]}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="text-xs"
          >
            View All →
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {tasks.length > 0 ? (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate flex-1 mr-2">{task.title}</span>
                {task.assignee && (
                  <Badge variant="outline" className="text-xs">
                    {task.assignee.name}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Loading details...</p>
        )}
      </CardContent>
    </Card>
  );
}

function RiskDashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <MetricCardSkeleton />
      <MetricCardSkeleton />
    </div>
  );
}
