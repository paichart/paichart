'use client';

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

/**
 * Analytics Domain Types
 * Maps to /api/analytics?domain=X
 */
export type AnalyticsDomain = 'overview' | 'tasks' | 'agents' | 'mcp' | 'team';

/**
 * Time Range Options
 * Maps to /api/analytics?timeRange=X
 */
export type TimeRange = '7d' | '30d' | '90d' | '1y';

/**
 * useAnalyticsQuery Options
 * Unified configuration for analytics data fetching
 */
export interface UseAnalyticsQueryOptions<T> {
  /** Analytics domain (overview, tasks, agents, mcp, team) */
  domain: AnalyticsDomain;
  /** Specific metrics to fetch, or 'all' for all metrics in domain */
  metrics?: string[];
  /** POV ID to scope analytics, or 'all' for aggregate */
  povId: string | 'all';
  /** Time range for analytics data */
  timeRange?: TimeRange;
  /** Optional Zod schema for response validation */
  schema?: z.ZodType<T>;
  /** Cache duration in ms (default: 2 minutes) */
  staleTime?: number;
  /** Whether query is enabled (default: true) */
  enabled?: boolean;
  /** Allow fetching for 'all' POVs (default: only for 'overview' domain) */
  allowAllPOVs?: boolean;
}

/**
 * useAnalyticsQuery
 *
 * Unified hook for fetching analytics data from the consolidated /api/analytics endpoint.
 * Provides type-safe data fetching with optional Zod validation, consistent caching,
 * and automatic query key management.
 *
 * @example
 * // Basic usage - overview metrics
 * const { data, isLoading } = useAnalyticsQuery({
 *   domain: 'overview',
 *   povId: 'all',
 *   timeRange: '30d',
 * });
 *
 * @example
 * // With specific metrics
 * const { data } = useAnalyticsQuery({
 *   domain: 'tasks',
 *   metrics: ['performance', 'insights'],
 *   povId: selectedPOVId,
 *   timeRange: '30d',
 * });
 *
 * @example
 * // With Zod schema validation
 * const { data } = useAnalyticsQuery({
 *   domain: 'tasks',
 *   metrics: ['insights'],
 *   povId: povId,
 *   schema: InsightsResponseSchema,
 * });
 */
export function useAnalyticsQuery<T = unknown>({
  domain,
  metrics = ['all'],
  povId,
  timeRange = '30d',
  schema,
  staleTime = 2 * 60 * 1000, // 2 minutes default
  enabled = true,
  allowAllPOVs = false,
}: UseAnalyticsQueryOptions<T>): UseQueryResult<T> {
  // Determine if query should be enabled
  // By default, only 'overview' domain allows 'all' POVs
  const shouldFetch = enabled && (
    povId !== 'all' ||
    domain === 'overview' ||
    allowAllPOVs
  );

  return useQuery({
    queryKey: ['analytics', domain, metrics, povId, timeRange],
    queryFn: async (): Promise<T> => {
      const params = new URLSearchParams({
        domain,
        timeRange,
      });

      // Add POV filter if not 'all'
      if (povId !== 'all') {
        params.append('povId', povId);
      }

      // Add metrics (supports array params)
      metrics.forEach(m => params.append('metrics', m));

      const res = await fetch(`/api/analytics?${params}`);

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(
          error.error?.message || `Failed to fetch ${domain} analytics`
        );
      }

      const json = await res.json();

      // If schema provided, validate response
      if (schema) {
        try {
          const validated = schema.parse(json);
          // Return data property if it exists, otherwise return validated object
          if (validated && typeof validated === 'object' && 'data' in validated) {
            return (validated as { data: T }).data;
          }
          return validated as T;
        } catch (zodError) {
          throw zodError;
        }
      }

      // Return data property by default
      return json.data as T;
    },
    staleTime,
    refetchOnWindowFocus: false,
    enabled: shouldFetch,
  });
}

/**
 * Pre-configured hooks for common analytics queries
 */

/**
 * useOverviewAnalytics
 * Fetches high-level metrics: POV count, task completion, agent success, hours saved
 */
export function useOverviewAnalytics(
  povId: string | 'all',
  timeRange: TimeRange = '30d'
) {
  return useAnalyticsQuery({
    domain: 'overview',
    metrics: ['all'],
    povId,
    timeRange,
    allowAllPOVs: true,
  });
}

/**
 * Task Insights Response Shape
 */
export interface TaskInsightsResponse {
  insights: {
    summary: {
      tasksAtRisk: number;
      blockedTasks: number;
      productivityTrend: number;
      averageWorkload: number;
    };
    risks: {
      tasksAtRisk: Array<{
        id: string;
        title: string;
        dueDate?: string;
        status: string;
        assignee?: { name: string };
      }>;
      blockedTasks: Array<{
        id: string;
        title: string;
        status: string;
        assignee?: { name: string };
      }>;
    };
    workload: {
      distribution: Array<{
        assignee?: { name: string };
        activeTasks: number;
      }>;
      imbalanceScore: number;
    };
    bottlenecks: Array<{
      phase?: { name: string };
      incompleteTasks: number;
    }>;
    recommendations: Array<{
      type: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      description: string;
      actionItems: string[];
    }>;
  };
}

/**
 * useTaskInsights
 * Fetches task insights: risks, workload, bottlenecks, recommendations
 */
export function useTaskInsights(
  povId: string,
  timeRange: TimeRange = '30d'
) {
  return useAnalyticsQuery<TaskInsightsResponse>({
    domain: 'tasks',
    metrics: ['insights'],
    povId,
    timeRange,
    enabled: !!povId && povId !== 'all', // Insights require specific POV
  });
}

/**
 * useTaskPerformance
 * Fetches task performance: completion rates, status distribution, trends
 */
export function useTaskPerformance(
  povId: string,
  timeRange: TimeRange = '30d'
) {
  return useAnalyticsQuery({
    domain: 'tasks',
    metrics: ['performance'],
    povId,
    timeRange,
  });
}

/**
 * useTaskAnalytics
 * Fetches both performance and insights in a single call
 */
export function useTaskAnalytics(
  povId: string,
  timeRange: TimeRange = '30d'
) {
  return useAnalyticsQuery({
    domain: 'tasks',
    metrics: ['performance', 'insights'],
    povId,
    timeRange,
    enabled: povId !== 'all',
  });
}
