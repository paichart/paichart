"use client";

import React, { useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEditorContext } from '../context';
import { format, differenceInDays, isPast, isFuture, formatDistanceToNow } from 'date-fns';
import { formatActivityChange } from '@/lib/tasks/activity-format';
import { fromLocalYmd } from '@/lib/utils/local-date';
import { PerformanceResponseSchema, InsightsResponseSchema, AgentExecutionsResponseSchema } from '@/lib/validation/analytics-response';
import { sanitizeErrorMessage } from '@/lib/utils/analytics-errors';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import {
  RecommendationCard,
  NoRecommendationsCard,
} from '@/components/analytics/core';

/**
 * Calculate timeline status based on POV dates
 */
function calculateTimelineStatus(startDate?: string, endDate?: string): {
  status: 'Not Started' | 'On Track' | 'At Risk' | 'Behind' | 'Completed';
  color: string;
  daysRemaining: number;
} {
  if (!startDate || !endDate) {
    return { status: 'Not Started', color: 'text-gray-500', daysRemaining: 0 };
  }

  const now = new Date();
  const start = fromLocalYmd(startDate);
  const end = fromLocalYmd(endDate);
  const totalDays = differenceInDays(end, start);
  const daysRemaining = differenceInDays(end, now);
  const daysElapsed = differenceInDays(now, start);
  const progress = totalDays > 0 ? (daysElapsed / totalDays) * 100 : 0;

  // Not started yet
  if (isFuture(start)) {
    return { status: 'Not Started', color: 'text-blue-500', daysRemaining };
  }

  // Completed (past end date)
  if (isPast(end)) {
    return { status: 'Completed', color: 'text-green-500', daysRemaining: 0 };
  }

  // On track: less than 75% time elapsed
  if (progress < 75) {
    return { status: 'On Track', color: 'text-green-500', daysRemaining };
  }

  // At risk: 75-90% time elapsed
  if (progress < 90) {
    return { status: 'At Risk', color: 'text-yellow-500', daysRemaining };
  }

  // Behind: more than 90% time elapsed
  return { status: 'Behind', color: 'text-red-500', daysRemaining };
}

/**
 * Helper function to determine trend indicator
 */
function getTrend(value: number, threshold: number): 'success' | 'warning' | 'danger' {
  if (value >= threshold) return 'success';
  if (value >= threshold * 0.7) return 'warning';
  return 'danger';
}

/**
 * Skeleton loading component
 */
const SkeletonCard = ({ className = '' }: { className?: string }) => (
  <div className={`p-4 border rounded-lg border-border bg-muted/50 animate-pulse ${className}`}>
    <div className="h-4 bg-muted-foreground/20 rounded w-1/3 mb-3"></div>
    <div className="h-8 bg-muted-foreground/20 rounded w-1/2 mb-2"></div>
    <div className="h-3 bg-muted-foreground/20 rounded w-2/3"></div>
  </div>
);

/**
 * Metric row component for performance metrics
 */
interface MetricRowProps {
  label: string;
  value: string | number;
  description?: string;
  trend?: 'success' | 'warning' | 'danger' | null;
}

const MetricRow = ({ label, value, description, trend }: MetricRowProps) => (
  <div className="flex items-center justify-between py-2 border-b last:border-b-0 border-border">
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
    <div className="flex items-center gap-2">
      <span className="text-lg font-bold text-foreground">{value}</span>
      {trend === 'success' && <span className="text-green-600">✓</span>}
      {trend === 'warning' && <span className="text-yellow-600">⚠️</span>}
      {trend === 'danger' && <span className="text-red-600">⚠️</span>}
    </div>
  </div>
);


/**
 * Analytics section component
 * Displays real-time POV analytics including task completion, team activity, and timeline status
 * Enhanced with API-powered widgets for health indicators, AI recommendations, and team performance
 */
export default function AnalyticsSection() {
  const { state } = useEditorContext();
  const queryClient = useQueryClient();
  const povId = state.data.id;

  // Calculate task completion percentage
  const taskMetrics = useMemo(() => {
    const tasks = Object.values(state.entities.tasks);
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      total: totalTasks,
      completed: completedTasks,
      inProgress: inProgressTasks,
      completionRate,
    };
  }, [state.entities.tasks]);

  // (Team activity metrics removed 2026-06-23 — the thin Team Activity card was repurposed to
  // On-Time Rate; team membership lives in the Team tab.)

  // Calculate timeline status
  const timelineMetrics = useMemo(() => {
    return calculateTimelineStatus(state.data.startDate, state.data.endDate);
  }, [state.data.startDate, state.data.endDate]);

  // React Query: Consolidated Tasks Analytics API
  // ✅ CONSOLIDATED: Performance + Insights in single call (saves ~900ms network time!)
  // Part 2: Endpoint Consolidation - Network optimization
  const { data: tasksAnalyticsData, isLoading: isLoadingTasksAnalytics, error: tasksAnalyticsError } = useQuery({
    queryKey: ['analytics', 'tasks', 'all', povId, '30d'],
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const params = new URLSearchParams({
          domain: 'tasks',
          timeframe: '30'  // Backward compat parameter
        });
        if (povId) params.append('povId', povId);
        params.append('metrics', 'performance');
        params.append('metrics', 'insights');

        const response = await fetch(
          `/api/analytics?${params}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const rawData = await response.json();

        // Validate both metrics in response
        try {
          const validatedPerformance = PerformanceResponseSchema.parse({ data: rawData.data.performance });
          const validatedInsights = InsightsResponseSchema.parse({ data: rawData.data.insights });

          return {
            performance: validatedPerformance,
            insights: validatedInsights
          };
        } catch (zodError) {
          throw zodError;
        }
      } finally {
        clearTimeout(timeout);
      }
    },
    staleTime: 60_000,
    enabled: !!povId,
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });

  // Extract performance and insights from consolidated response
  const performanceData = tasksAnalyticsData?.performance;
  const insightsData = tasksAnalyticsData?.insights;
  // Tier 2 (2026-06-23): surface performance metrics that were fetched + schema-validated but
  // never rendered (on-time rate, avg completion time, overdue). `.data.summary` per
  // PerformanceResponseSchema.
  const perf = performanceData?.data?.summary;
  const isLoadingPerformance = isLoadingTasksAnalytics;
  const isLoadingInsights = isLoadingTasksAnalytics;
  const performanceError = tasksAnalyticsError;
  const insightsError = tasksAnalyticsError;

  // React Query: Agent Executions API
  const { data: agentData, isLoading: isLoadingAgents, error: agentError } = useQuery({
    queryKey: ['agent-executions', povId],
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(
          `/api/agent-executions?povId=${povId}&dateRange=30d&limit=20`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const rawData = await response.json();

        try {
          const validatedData = AgentExecutionsResponseSchema.parse(rawData);

          // Set-based filtering for O(1) performance
          const taskIdSet = new Set(Object.keys(state.entities.tasks));

        // Null safety checks for deleted tasks
        const filteredExecutions = validatedData.data.executions.filter(exec =>
          exec.taskId &&
          exec.task !== null &&
          taskIdSet.has(exec.taskId)
        );

          return {
            ...validatedData,
            data: {
              ...validatedData.data,
              executions: filteredExecutions
            }
          };
        } catch (zodError) {
          throw zodError;
        }
      } finally {
        clearTimeout(timeout);
      }
    },
    staleTime: 60_000,
    enabled: !!povId,
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });

  // React Query: POV Task Activities (Recent Activity Feed)
  // Uses efficient server-side povId filtering (no client-side filtering needed)
  const { data: activitiesData, isLoading: isLoadingActivities, error: activitiesError } = useQuery({
    queryKey: ['pov-task-activities', povId],
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        if (!povId) throw new Error('POV ID required');

        const params = new URLSearchParams({
          povId: povId,      // Server-side POV filter (efficient!)
          dateRange: '90d',  // 90-day window
          limit: '10'        // Last 10 activities
        });

        const response = await fetch(
          `/api/tasks/activities?${params}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const rawData = await response.json();

        // Return activities directly (already filtered by POV on server)
        return rawData.data || [];
      } finally {
        clearTimeout(timeout);
      }
    },
    staleTime: 30_000, // 30 seconds (more frequent for activity feed)
    enabled: !!povId,
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });

  // Note: Real-time updates via PostgreSQL events not possible in client component
  // Analytics rely on React Query staleTime (60s) and manual refresh
  // For true real-time updates, implement WebSocket subscription in future
  // Current behavior: Data refreshes on tab switch after 60s staleTime expires

  // Calculate agent metrics from filtered executions
  const agentMetrics = useMemo(() => {
    if (!agentData?.data?.executions) return null;

    const executions = agentData.data.executions;
    const total = executions.length;
    const successful = executions.filter(e => e.status === 'SUCCESS').length;
    const failed = executions.filter(e => e.status === 'FAILED').length;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

    const durations = executions
      .filter(e => e.duration !== null)
      .map(e => e.duration as number);
    const avgDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    return {
      total,
      successful,
      failed,
      successRate,
      avgDuration: Math.round(avgDuration / 1000) // Convert to seconds
    };
  }, [agentData]);


  return (
    <div className="p-6 bg-card text-card-foreground rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4 text-foreground">Analytics Dashboard</h2>
      <p className="text-muted-foreground mb-6">
        Real-time analytics and metrics for {state.data.title || 'this POV'}.
        {state.data.startDate && state.data.endDate && (
          <span className="block mt-1 text-sm">
            Period: {format(fromLocalYmd(state.data.startDate), 'MMM d, yyyy')} - {format(fromLocalYmd(state.data.endDate), 'MMM d, yyyy')}
          </span>
        )}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg border-border">
          <h3 className="font-medium mb-2 text-foreground">Task Completion</h3>
          <div className="h-32 bg-primary/10 rounded flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-primary">{taskMetrics.completionRate}%</span>
            <span className="text-sm text-muted-foreground mt-2">
              {taskMetrics.completed} of {taskMetrics.total} tasks completed
            </span>
            {taskMetrics.inProgress > 0 && (
              <span className="text-xs text-blue-600 mt-1">
                {taskMetrics.inProgress} in progress
              </span>
            )}
            {perf && perf.averageCompletionTime > 0 && (
              <span className="text-xs text-muted-foreground mt-1">
                avg {perf.averageCompletionTime}d to complete
              </span>
            )}
          </div>
        </div>

        <div className="p-4 border rounded-lg border-border">
          {/* Tier 2: was a thin "Team Activity" card (member/phase counts — available in the Team
              tab) → repurposed to On-Time Rate, a real performance metric from the analytics API. */}
          <h3 className="font-medium mb-2 text-foreground">On-Time Rate</h3>
          <div className="h-32 bg-secondary/10 rounded flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-secondary">{perf ? `${perf.onTimeRate}%` : '—'}</span>
            <span className="text-sm text-muted-foreground mt-2">
              completed on or before due date
            </span>
            {perf && perf.overdueTasks > 0 && (
              <span className="text-xs text-red-600 mt-1">
                {perf.overdueTasks} overdue
              </span>
            )}
          </div>
        </div>

        <div className="p-4 border rounded-lg border-border">
          <h3 className="font-medium mb-2 text-foreground">Timeline</h3>
          <div className="h-32 bg-accent/10 rounded flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${timelineMetrics.color}`}>
              {timelineMetrics.status}
            </span>
            {timelineMetrics.daysRemaining > 0 && (
              <span className="text-sm text-muted-foreground mt-2">
                {timelineMetrics.daysRemaining} days remaining
              </span>
            )}
            {timelineMetrics.daysRemaining < 0 && (
              <span className="text-sm text-red-500 mt-2">
                {Math.abs(timelineMetrics.daysRemaining)} days overdue
              </span>
            )}
            {timelineMetrics.status === 'Not Started' && state.data.startDate && (
              <span className="text-sm text-muted-foreground mt-2">
                Starts {format(fromLocalYmd(state.data.startDate), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Health Dashboard (API-Powered) */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground">Health & Risk Indicators</h3>
        {isLoadingInsights ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : insightsError ? (
          <Card className="p-4 border-red-300 bg-red-50 dark:bg-red-900/10">
            <p className="text-sm text-red-600">
              Failed to load health data. {sanitizeErrorMessage(insightsError)}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['task-analytics-insights', povId] })}
              className="text-xs text-red-700 underline mt-2 hover:text-red-800"
            >
              Retry
            </button>
          </Card>
        ) : insightsData?.data?.summary ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg border-border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-foreground">Tasks at Risk</h4>
                {insightsData.data.summary.tasksAtRisk > 0 && (
                  <span className="text-yellow-600">⚠️</span>
                )}
              </div>
              <div className="h-24 rounded flex flex-col items-center justify-center bg-yellow-50 dark:bg-yellow-900/10">
                <span className={`text-3xl font-bold ${
                  insightsData.data.summary.tasksAtRisk > 0 ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {insightsData.data.summary.tasksAtRisk}
                </span>
                <span className="text-sm text-muted-foreground mt-1">
                  {insightsData.data.summary.tasksAtRisk === 1 ? 'task' : 'tasks'} at risk
                </span>
                <span className="text-xs text-muted-foreground">
                  Overdue or due within 3 days
                </span>
              </div>
            </div>

            <div className="p-4 border rounded-lg border-border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-foreground">Blocked Tasks</h4>
                {insightsData.data.summary.blockedTasks > 0 && (
                  <span className="text-red-600">🔴</span>
                )}
              </div>
              <div className="h-24 rounded flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/10">
                <span className={`text-3xl font-bold ${
                  insightsData.data.summary.blockedTasks > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {insightsData.data.summary.blockedTasks}
                </span>
                <span className="text-sm text-muted-foreground mt-1">
                  {insightsData.data.summary.blockedTasks === 1 ? 'task' : 'tasks'} blocked
                </span>
                <span className="text-xs text-muted-foreground">
                  Waiting on dependencies
                </span>
              </div>
            </div>

            <div className="p-4 border rounded-lg border-border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-foreground">Productivity Trend</h4>
                {insightsData.data.summary.productivityTrend >= 0 ? (
                  <span className="text-green-600">📈</span>
                ) : (
                  <span className="text-red-600">📉</span>
                )}
              </div>
              <div className="h-24 rounded flex flex-col items-center justify-center bg-blue-50 dark:bg-blue-900/10">
                <span className={`text-3xl font-bold ${
                  insightsData.data.summary.productivityTrend >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {insightsData.data.summary.productivityTrend > 0 ? '+' : ''}
                  {Math.round(insightsData.data.summary.productivityTrend)}%
                </span>
                <span className="text-sm text-muted-foreground mt-1">
                  vs previous 30 days
                </span>
                <span className="text-xs text-muted-foreground">
                  Task completion trend
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Row 3: AI Recommendations (API-Powered) */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
          <span>🤖</span>
          <span>AI-Generated Recommendations</span>
          {insightsData?.data?.recommendations && (
            <Badge variant="secondary">
              {insightsData.data.recommendations.length}
            </Badge>
          )}
        </h3>

        {isLoadingInsights ? (
          <SkeletonCard className="h-48" />
        ) : insightsError ? (
          <Card className="p-4 border-red-300 bg-red-50 dark:bg-red-900/10">
            <p className="text-sm text-red-600">
              Failed to load recommendations. {sanitizeErrorMessage(insightsError)}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['task-analytics-insights', povId] })}
              className="text-xs text-red-700 underline mt-2 hover:text-red-800"
            >
              Retry
            </button>
          </Card>
        ) : insightsData?.data?.recommendations && insightsData.data.recommendations.length > 0 ? (
          <div className="space-y-4">
            {insightsData.data.recommendations.map((rec, index) => (
              <RecommendationCard
                key={index}
                type={rec.type}
                priority={rec.priority}
                title={rec.title}
                description={rec.description}
                actionItems={rec.actionItems}
              />
            ))}
          </div>
        ) : (
          <NoRecommendationsCard />
        )}
      </div>

      {/* Row 4: Recent Team Activity (API-Powered) */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground">Recent Team Activity</h3>
        {isLoadingActivities ? (
          <SkeletonCard className="h-64" />
        ) : activitiesError ? (
          <Card className="p-4 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Unable to load activity feed. {sanitizeErrorMessage(activitiesError)}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['pov-task-activities', povId] })}
              className="text-xs text-yellow-700 underline mt-2 hover:text-yellow-900"
            >
              Retry
            </button>
          </Card>
        ) : activitiesData && activitiesData.length > 0 ? (
          <Card className="p-4">
            <div className="space-y-3">
              {activitiesData.map((activity: any) => {
                // Get activity icon
                const getIcon = () => {
                  const action = activity.action.toLowerCase();
                  if (action.includes('comment')) return '💬';
                  if (action.includes('completed')) return '✅';
                  if (action.includes('assigned')) return '👤';
                  if (action.includes('status')) return '🔄';
                  if (action.includes('priority')) return '⚠️';
                  if (action.includes('created')) return '✨';
                  return '📝';
                };

                // Format activity description
                const formatDescription = () => {
                  const userName = activity.user?.name || 'Unknown';
                  const taskTitle = activity.task?.title || 'Unknown task';
                  const action = activity.action.toLowerCase();

                  if (action.includes('comment')) {
                    const commentMatch = activity.action.match(/added comment:\s*"([^"]+)"/);
                    if (commentMatch) {
                      return {
                        primary: `"${commentMatch[1]}"`,
                        secondary: `${userName} on "${taskTitle}"`
                      };
                    }
                  }

                  if (action.includes('completed')) {
                    return { primary: `Completed "${taskTitle}"`, secondary: userName };
                  }

                  // Field changes (status, stage, phase, assignee, …) carry structured
                  // old/new values in `details` — render "Status: OPEN → BLOCKED".
                  const changeLabel = formatActivityChange(activity.action, activity.details);
                  if (changeLabel) {
                    return {
                      primary: changeLabel,
                      secondary: activity.task ? `${userName} on "${taskTitle}"` : userName,
                    };
                  }

                  if (action.includes('assigned')) {
                    return { primary: `Assigned "${taskTitle}"`, secondary: userName };
                  }

                  return {
                    primary: `Updated "${taskTitle}"`,
                    secondary: `${userName} • ${activity.action}`
                  };
                };

                const { primary, secondary } = formatDescription();

                return (
                  <div key={activity.id} className="flex items-start gap-3 p-3 border-b last:border-b-0 border-border hover:bg-accent/50 rounded">
                    <span className="text-xl shrink-0">{getIcon()}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {primary}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {secondary} • {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary footer */}
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                Showing last {activitiesData.length} {activitiesData.length === 1 ? 'activity' : 'activities'} from the past 90 days
              </p>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">No recent activity</p>
              <p className="text-xs mt-2">
                Activity will appear here as team members work on tasks
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Row 5: Agent Activity (API-Powered) */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
          <span>🤖</span>
          <span>AI Agent Activity</span>
          <span className="text-sm text-muted-foreground">(Last 30 Days)</span>
        </h3>

        {isLoadingAgents ? (
          <SkeletonCard className="h-64" />
        ) : agentError ? (
          <Card className="p-4 border-red-300 bg-red-50 dark:bg-red-900/10">
            <p className="text-sm text-red-600">
              Failed to load agent activity data. {sanitizeErrorMessage(agentError)}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['agent-executions', povId] })}
              className="text-xs text-red-700 underline mt-2 hover:text-red-800"
            >
              Retry
            </button>
          </Card>
        ) : agentData?.data?.executions ? (
          <Card className="p-4">
            {agentMetrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-border">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{agentMetrics.total}</p>
                  <p className="text-xs text-muted-foreground">Total Executions</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{agentMetrics.successRate}%</p>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{agentMetrics.successful}</p>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{agentMetrics.avgDuration}s</p>
                  <p className="text-xs text-muted-foreground">Avg Duration</p>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">Recent Executions</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {agentData.data.executions.slice(0, 10).map((exec) => (
                  <div key={exec.id} className="flex items-start gap-3 p-2 rounded hover:bg-accent/50">
                    <span className="text-lg">
                      {exec.status === 'SUCCESS' ? '✅' : exec.status === 'FAILED' ? '❌' : '⏳'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {exec.task?.title || 'Unknown Task'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {exec.endTime
                          ? formatDistanceToNow(new Date(exec.endTime), { addSuffix: true })
                          : 'Running...'}
                        {exec.duration && ` • ${Math.round((exec.duration as number) / 1000)}s`}
                      </p>
                    </div>
                    <Badge variant={exec.status === 'SUCCESS' ? 'default' : exec.status === 'FAILED' ? 'destructive' : 'secondary'}>
                      {exec.status}
                    </Badge>
                  </div>
                ))}

                {agentData.data.executions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No agent executions in the last 30 days
                  </p>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <p className="text-center text-muted-foreground">
              No agent executions in the last 30 days
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
