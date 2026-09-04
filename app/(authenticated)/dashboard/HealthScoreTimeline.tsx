"use client";

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { MetricTooltip } from '@/components/ui/MetricTooltip';

interface HealthDataPoint {
  date: string;
  healthScore: number;
  completionRate: number;
  overduePercent: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalPOVs: number;
  activePOVs: number;
  atRiskPOVs: number;
  agentExecutions: number;
  agentSuccessRate: number;
}

interface HealthHistoryResponse {
  data: {
    healthHistory: {
      dataPoints: HealthDataPoint[];
      period: 'daily' | 'weekly' | 'monthly';
      startDate: string;
      endDate: string;
    };
  };
}

/**
 * Format date for display
 */
function formatDate(dateStr: string, period: string): string {
  const date = new Date(dateStr);
  if (period === 'weekly') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (period === 'monthly') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Get color for health score
 */
function getHealthColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * Get trend indicator
 */
function getTrend(current: number, previous: number): { icon: React.ReactNode; label: string; color: string } {
  const diff = current - previous;
  if (diff > 2) return { icon: <TrendingUp className="h-3 w-3" />, label: `+${diff}`, color: 'text-green-400' };
  if (diff < -2) return { icon: <TrendingDown className="h-3 w-3" />, label: `${diff}`, color: 'text-red-400' };
  return { icon: <Minus className="h-3 w-3" />, label: '0', color: 'text-gray-400' };
}

type ChartTimeRange = '30d' | '90d' | '1y';

export function HealthScoreTimeline() {
  const [hoveredPoint, setHoveredPoint] = useState<HealthDataPoint | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // P4 2026-06-12: range selector, 90d default — the old fixed 6-month
  // window compressed ~6 flat months into the chart's left edge
  const [timeRange, setTimeRange] = useState<ChartTimeRange>('90d');

  const { data, isLoading, error } = useQuery<HealthHistoryResponse>({
    queryKey: ['admin-health-history', timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?domain=admin&metrics=health-history&timeRange=${timeRange}`);
      if (!res.ok) throw new Error('Failed to fetch health history');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (prev) => prev, // keep chart mounted while a new range loads
  });

  // Calculate chart dimensions and scales
  const chartConfig = useMemo(() => {
    if (!data?.data?.healthHistory?.dataPoints) return null;

    const points = data.data.healthHistory.dataPoints;
    const period = data.data.healthHistory.period;

    // Y-axis: 0-100 for percentages
    const yMin = 0;
    const yMax = 100;
    const yTicks = [100, 80, 60, 40, 20, 0];

    // X-axis: dates
    const xLabels = points.map(p => formatDate(p.date, period));

    return {
      points,
      period,
      yMin,
      yMax,
      yTicks,
      xLabels,
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading health timeline...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !chartConfig) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/10">
        <CardContent className="p-6">
          <p className="text-center text-yellow-400">
            Health timeline data unavailable
          </p>
        </CardContent>
      </Card>
    );
  }

  const { points, period, yTicks, xLabels } = chartConfig;
  const currentScore = points[points.length - 1]?.healthScore || 0;
  const previousScore = points[points.length - 2]?.healthScore || currentScore;
  const trend = getTrend(currentScore, previousScore);

  // Calculate SVG path for each metric line
  const chartWidth = 100; // percentage
  const chartHeight = 100;
  const padding = { left: 0, right: 0, top: 5, bottom: 5 };

  const getX = (index: number) => {
    const usableWidth = chartWidth - padding.left - padding.right;
    return padding.left + (index / (points.length - 1)) * usableWidth;
  };

  const getY = (value: number) => {
    const usableHeight = chartHeight - padding.top - padding.bottom;
    return padding.top + ((100 - value) / 100) * usableHeight;
  };

  // Generate SVG paths
  const healthPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.healthScore)}`).join(' ');
  const completionPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.completionRate)}`).join(' ');
  const overduePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.overduePercent)}`).join(' ');
  const agentSuccessPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.agentSuccessRate)}`).join(' ');

  // Generate area fill for health score
  const healthAreaPath = `${healthPath} L ${getX(points.length - 1)} ${getY(0)} L ${getX(0)} ${getY(0)} Z`;

  return (
    <TooltipProvider>
      <Card className="bg-card border overflow-hidden">
        {/* Header - Bloomberg style */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 font-mono text-xs">
          <div className="flex items-center gap-4">
            <span className="text-green-400 font-bold">HEALTH SCORE</span>
            <span className="text-muted-foreground">|</span>
            <span className={`text-2xl font-bold ${getHealthColor(currentScore)}`}>{currentScore}</span>
            <span className={`flex items-center gap-1 ${trend.color}`}>
              {trend.icon}
              {trend.label}
            </span>
          </div>
          <div className="flex-1 text-center text-muted-foreground">
            POV Status: <span className="text-amber-400">IN_PROGRESS</span>, <span className="text-orange-400">STALLED</span>, <span className="text-purple-400">VALIDATION</span>
          </div>
          {/* P4: time-range selector (90d default) */}
          <div className="flex items-center gap-1 mr-3">
            {(['30d', '90d', '1y'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-1.5 py-0.5 border text-[10px] uppercase transition-colors ${
                  timeRange === r
                    ? 'border-amber-400 text-amber-400'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {/* 2026-06-12 UX: legend abbreviations (HTH/CMP/OVD/AGT) were
              undecipherable — full words, with formula hints on hover */}
          <div className="flex items-center gap-3 text-muted-foreground">
            <MetricTooltip className="text-green-400" explainer="Health score: task completion (55%) + overdue ratio (45%), weekly snapshot">━ Health</MetricTooltip>
            <MetricTooltip className="text-blue-400" explainer="Task completion rate (%)">━ Completion</MetricTooltip>
            <MetricTooltip className="text-red-400" explainer="Overdue tasks as % of total">━ Overdue</MetricTooltip>
            <MetricTooltip className="text-purple-400" explainer="Agent execution success rate (%)">━ Agent Success</MetricTooltip>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="relative" style={{ height: '140px' }}>
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between py-2 text-[10px] text-muted-foreground font-mono border-r bg-muted/20">
            {yTicks.map((tick) => (
              <div key={tick} className="px-1 text-right">
                {tick}
              </div>
            ))}
          </div>

          {/* Chart area */}
          <div className="absolute left-10 right-0 top-0 bottom-6">
            {/* Lines + area fill. These use a 0–100 user-space viewBox stretched to the
                full width (preserveAspectRatio="none"); without the viewBox the path `d`
                coords were treated as raw pixels and the whole series bunched into the
                leftmost ~100px. vector-effect keeps stroke widths uniform under the stretch. */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* Health score area fill */}
              <path
                d={healthAreaPath}
                fill="rgb(34, 197, 94)"
                fillOpacity="0.1"
                className="transition-all duration-300"
              />
              {/* Overdue line (red) */}
              <path
                d={overduePath}
                fill="none"
                stroke="rgb(239, 68, 68)"
                strokeWidth="2"
                strokeOpacity="0.7"
                vectorEffect="non-scaling-stroke"
                className="transition-all duration-300"
              />
              {/* Completion rate line (blue) */}
              <path
                d={completionPath}
                fill="none"
                stroke="rgb(59, 130, 246)"
                strokeWidth="2"
                strokeOpacity="0.7"
                vectorEffect="non-scaling-stroke"
                className="transition-all duration-300"
              />
              {/* Health score line (green) */}
              <path
                d={healthPath}
                fill="none"
                stroke="rgb(34, 197, 94)"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
                className="transition-all duration-300"
              />
              {/* Agent success rate line (purple) */}
              <path
                d={agentSuccessPath}
                fill="none"
                stroke="rgb(168, 85, 247)"
                strokeWidth="2"
                strokeOpacity="0.7"
                vectorEffect="non-scaling-stroke"
                className="transition-all duration-300"
              />
            </svg>

            {/* Grid + interactive points. Kept in a percentage-based SVG (no stretched
                viewBox) so the circles stay round and align with the lines above. */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              {/* Horizontal grid lines */}
              {yTicks.map((tick, i) => (
                <line
                  key={`h-${tick}`}
                  x1="0%"
                  y1={`${(i / (yTicks.length - 1)) * 100}%`}
                  x2="100%"
                  y2={`${(i / (yTicks.length - 1)) * 100}%`}
                  stroke="currentColor"
                  strokeOpacity="0.1"
                  strokeDasharray="4 4"
                />
              ))}
              {/* Vertical grid lines */}
              {points.map((_, i) => (
                <line
                  key={`v-${i}`}
                  x1={`${(i / (points.length - 1)) * 100}%`}
                  y1="0%"
                  x2={`${(i / (points.length - 1)) * 100}%`}
                  y2="100%"
                  stroke="currentColor"
                  strokeOpacity="0.1"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Interactive points for health score.
                  2026-06-12 UX: tooltip (per-week stats for ALL four lines)
                  previously triggered only on the 4px circles — effectively
                  undiscoverable. Each point now has a full-height invisible
                  hover column: hover anywhere over a week to see its stats. */}
              {points.map((point, i) => {
                const colWidth = points.length > 1 ? 100 / (points.length - 1) : 100;
                const colLeft = Math.max(0, getX(i) - colWidth / 2);
                return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <g
                      className="cursor-pointer"
                      onMouseEnter={() => {
                        setHoveredPoint(point);
                        setHoveredIndex(i);
                      }}
                      onMouseLeave={() => {
                        setHoveredPoint(null);
                        setHoveredIndex(null);
                      }}
                    >
                      <rect
                        x={`${colLeft}%`}
                        y="0"
                        width={`${Math.min(colWidth, 100 - colLeft)}%`}
                        height="100%"
                        fill="transparent"
                      />
                      <circle
                        cx={`${getX(i)}%`}
                        cy={`${getY(point.healthScore)}%`}
                        r={hoveredIndex === i ? 6 : 4}
                        fill={hoveredIndex === i ? 'rgb(34, 197, 94)' : 'rgb(24, 24, 27)'}
                        stroke="rgb(34, 197, 94)"
                        strokeWidth="2"
                        className="transition-all duration-200"
                      />
                    </g>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="font-mono text-xs">
                    <div className="space-y-2">
                      <p className="font-semibold border-b pb-1">{formatDate(point.date, period)}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        <span className="text-green-400">Health:</span>
                        <span className="font-bold">{point.healthScore}%</span>
                        <span className="text-blue-400">Completion:</span>
                        <span>{point.completionRate}%</span>
                        <span className="text-red-400">Overdue:</span>
                        <span>{point.overduePercent}%</span>
                        <span className="text-purple-400">Agent Success:</span>
                        <span>{point.agentSuccessRate}%</span>
                        <span className="text-muted-foreground">Tasks:</span>
                        <span>{point.completedTasks}/{point.totalTasks}</span>
                        <span className="text-muted-foreground">Executions:</span>
                        <span>{point.agentExecutions}</span>
                      </div>
                      <div className="border-t pt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                        <span className="text-muted-foreground">Total POVs:</span>
                        <span>{point.totalPOVs}</span>
                        <span className="text-purple-400">Active:</span>
                        <span>{point.activePOVs}</span>
                        <span className="text-orange-400">At Risk:</span>
                        <span>{point.atRiskPOVs}</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
                );
              })}
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="absolute left-10 right-0 bottom-0 h-6 flex border-t bg-muted/20">
            {xLabels.filter((_, i) => i % Math.ceil(xLabels.length / 8) === 0 || i === xLabels.length - 1).map((label, i) => (
              <div
                key={i}
                className="flex-1 flex items-center justify-center text-xs text-muted-foreground font-mono"
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 font-mono text-xs">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">Period: {period}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">{points.length} data points</span>
          </div>
          <div className="flex items-center gap-4">
            <span>
              Avg: <span className={getHealthColor(Math.round(points.reduce((s, p) => s + p.healthScore, 0) / points.length))}>
                {Math.round(points.reduce((s, p) => s + p.healthScore, 0) / points.length)}%
              </span>
            </span>
            <span>
              Min: <span className="text-red-400">{Math.min(...points.map(p => p.healthScore))}%</span>
            </span>
            <span>
              Max: <span className="text-green-400">{Math.max(...points.map(p => p.healthScore))}%</span>
            </span>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
}

export default HealthScoreTimeline;
