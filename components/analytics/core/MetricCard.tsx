'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';
import { ReactNode } from 'react';
import { BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number;
  description?: string;
  /** Secondary value shown below main value (e.g., dollar savings) */
  secondaryValue?: string;
  /** Secondary value color class (default: BLOOMBERG_COLORS.success) */
  secondaryColor?: string;
  /** Tooltip explaining what this metric means */
  tooltip?: string;
  className?: string;
}

/**
 * MetricCard Component
 * Reusable metric display with tooltip and secondary value support
 *
 * Features:
 * - Displays metric title, value, and optional icon
 * - Shows trend indicator (up/down with percentage)
 * - Optional description text
 * - Optional secondary value (e.g., dollar savings for ROI)
 * - Optional tooltip for business context
 * - Consistent styling across all analytics dashboards
 *
 * Used by:
 * - OverviewTab (4 metric cards)
 * - TaskMetricsCard (status counts)
 * - InsightsTab (summary metrics)
 */
export function MetricCard({
  title,
  value,
  icon,
  trend,
  description,
  secondaryValue,
  secondaryColor = BLOOMBERG_COLORS.success,
  tooltip,
  className = ''
}: MetricCardProps) {
  const showTrend = trend !== undefined && trend !== 0;

  const titleContent = (
    <div className="flex items-center gap-1">
      <span>{title}</span>
      {tooltip && (
        <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
      )}
    </div>
  );

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        {tooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <CardTitle className="text-sm font-medium cursor-help">
                  {titleContent}
                </CardTitle>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        )}
        {icon && <div className="h-4 w-4 text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {secondaryValue && (
          <p className={`text-sm font-medium ${secondaryColor}`}>
            {secondaryValue}
          </p>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
        {showTrend && (
          <div className={`flex items-center gap-1 text-xs mt-1 ${
            trend > 0 ? BLOOMBERG_COLORS.success : BLOOMBERG_COLORS.error
          }`}>
            {trend > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>{trend > 0 ? '+' : ''}{trend}% from last period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
