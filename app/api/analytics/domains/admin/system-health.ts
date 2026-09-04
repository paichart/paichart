import { TokenPayload } from '@/lib/types/auth';
import { UnifiedAnalyticsQuery } from '@/lib/validation/task-validation';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Import the ExecutionAnalytics class
const { ExecutionAnalytics } = require('@/lib/mcp/server/utils/execution-analytics');

/**
 * System Health Handler
 * Phase 4 of Admin Intelligence Implementation
 *
 * Provides infrastructure-level metrics and recommendations:
 * - Agent execution performance (success rates, durations)
 * - Tool error rates and patterns
 * - Template performance analysis
 * - Queue health (pending/stuck executions)
 * - System-wide recommendations from ExecutionAnalytics
 *
 * Admin-only: Cross-system visibility
 */

export interface ToolHealth {
  toolName: string;
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  avgDuration: number;
  recentErrors: string[];
  trend: 'improving' | 'declining' | 'stable';
}

export interface TemplateHealth {
  id: string;
  name: string;
  category: string;
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  reliability: number;
  performanceScore: number;
}

export interface QueueHealth {
  pendingExecutions: number;
  runningExecutions: number;
  stuckExecutions: number; // Running > 30 minutes
  avgWaitTime: number;
  queueDepth: number;
}

export interface SystemRecommendation {
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  effort: string;
  suggestion: string;
  metrics?: Record<string, number>;
  details?: any[];
}

export interface SystemHealthResult {
  summary: {
    overallHealth: number; // 0-100
    agentSuccessRate: number;
    avgExecutionTime: number; // ms
    activeExecutions: number;
    errorRate: number;
    lastUpdated: Date;
  };
  toolHealth: ToolHealth[];
  templateHealth: TemplateHealth[];
  queueHealth: QueueHealth;
  trends: {
    type: string;
    description: string;
    significance: number;
    direction: 'up' | 'down' | 'stable';
  }[];
  recommendations: SystemRecommendation[];
  insights: {
    type: 'positive' | 'concern' | 'neutral';
    category: string;
    title: string;
    description: string;
  }[];
}

/**
 * Calculate overall system health score (0-100)
 */
function calculateOverallHealth(
  successRate: number,
  errorRate: number,
  queueHealth: QueueHealth,
  templateHealth: TemplateHealth[]
): number {
  // Weight factors
  const successWeight = 0.35;
  const errorWeight = 0.25;
  const queueWeight = 0.20;
  const templateWeight = 0.20;

  // Success rate score (0-100)
  const successScore = successRate;

  // Error rate score (100 = no errors, 0 = 100% errors)
  const errorScore = Math.max(0, 100 - errorRate);

  // Queue health score
  let queueScore = 100;
  if (queueHealth.stuckExecutions > 0) {
    queueScore -= queueHealth.stuckExecutions * 10;
  }
  if (queueHealth.pendingExecutions > 10) {
    queueScore -= Math.min(20, (queueHealth.pendingExecutions - 10) * 2);
  }
  queueScore = Math.max(0, queueScore);

  // Template health score (avg performance score)
  const templateScore = templateHealth.length > 0
    ? templateHealth.reduce((sum, t) => sum + t.performanceScore, 0) / templateHealth.length
    : 100;

  return Math.round(
    (successScore * successWeight) +
    (errorScore * errorWeight) +
    (queueScore * queueWeight) +
    (templateScore * templateWeight)
  );
}

export async function handleSystemHealth(
  params: UnifiedAnalyticsQuery,
  user: TokenPayload
): Promise<{ data: SystemHealthResult }> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  // Initialize ExecutionAnalytics
  const analytics = new ExecutionAnalytics({
    defaultTimeRange: '7d',
    analysisDepth: 'detailed',
    minExecutionsForTrends: 5,
    confidenceThreshold: 0.7
  });

  // Fetch execution patterns using ExecutionAnalytics
  let patterns: any = {};
  try {
    patterns = await analytics.analyzeExecutionPatterns('7d');
  } catch (error) {
    logger.warn({ err: error }, 'System Health ExecutionAnalytics failed, using fallback');
    patterns = {
      performance: { successRate: 0, total: 0, failed: 0 },
      recommendations: { recommendations: [] },
      templates: { templates: [] },
      trends: { trends: [] },
      insights: { insights: [] },
      errorPatterns: { commonErrors: [] }
    };
  }

  // Get queue health metrics
  const [pendingExecutions, runningExecutions, stuckExecutions] = await Promise.all([
    prisma.agentExecution.count({
      where: {
        status: 'PENDING',
        createdAt: { gte: sevenDaysAgo }
      }
    }),
    prisma.agentExecution.count({
      where: {
        status: 'RUNNING'
      }
    }),
    prisma.agentExecution.count({
      where: {
        status: 'RUNNING',
        startTime: { lt: thirtyMinutesAgo }
      }
    })
  ]);

  // Calculate average wait time for pending executions
  const pendingExecs = await prisma.agentExecution.findMany({
    where: {
      status: 'PENDING',
      createdAt: { gte: sevenDaysAgo }
    },
    select: {
      createdAt: true
    },
    take: 100
  });

  const avgWaitTime = pendingExecs.length > 0
    ? pendingExecs.reduce((sum, e) => sum + (now.getTime() - e.createdAt.getTime()), 0) / pendingExecs.length
    : 0;

  const queueHealth: QueueHealth = {
    pendingExecutions,
    runningExecutions,
    stuckExecutions,
    avgWaitTime: Math.round(avgWaitTime / 1000), // Convert to seconds
    queueDepth: pendingExecutions + runningExecutions
  };

  // Extract tool health from recent executions
  const recentExecutions = await prisma.agentExecution.findMany({
    where: {
      startTime: { gte: sevenDaysAgo }
    },
    take: 5000, // Phase 2 safety cap: 7-day executions for tool health analysis
    select: {
      id: true,
      status: true,
      context: true,
      logs: true,
      startTime: true,
      endTime: true
    }
  });

  // Build tool health map
  const toolMap = new Map<string, {
    total: number;
    success: number;
    errors: number;
    durations: number[];
    recentErrors: string[];
  }>();

  for (const exec of recentExecutions) {
    // Extract tools from context JSON
    const context = exec.context as Record<string, any> || {};
    const tools = (context.toolsUsed as string[]) || (context.tools as string[]) || [];
    const hasError = exec.status === 'FAILED';
    // Extract error from logs if available
    const errorMessage = exec.logs?.find(log => log.toLowerCase().includes('error')) || null;
    const duration = exec.startTime && exec.endTime
      ? new Date(exec.endTime).getTime() - new Date(exec.startTime).getTime()
      : 0;

    for (const tool of tools) {
      const existing = toolMap.get(tool) || {
        total: 0,
        success: 0,
        errors: 0,
        durations: [],
        recentErrors: []
      };

      existing.total++;
      if (hasError) {
        existing.errors++;
        if (errorMessage && existing.recentErrors.length < 5) {
          existing.recentErrors.push(errorMessage.slice(0, 100));
        }
      } else {
        existing.success++;
      }
      if (duration > 0) {
        existing.durations.push(duration);
      }

      toolMap.set(tool, existing);
    }
  }

  // Convert to ToolHealth array
  const toolHealth: ToolHealth[] = Array.from(toolMap.entries())
    .filter(([_, stats]) => stats.total >= 5) // Only tools with significant usage
    .map(([toolName, stats]): ToolHealth => ({
      toolName,
      totalExecutions: stats.total,
      successCount: stats.success,
      errorCount: stats.errors,
      errorRate: stats.total > 0 ? Math.round((stats.errors / stats.total) * 100) : 0,
      avgDuration: stats.durations.length > 0
        ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
        : 0,
      recentErrors: stats.recentErrors,
      trend: stats.errors > stats.total * 0.3 ? 'declining' as const :
             stats.errors < stats.total * 0.1 ? 'improving' as const : 'stable' as const
    }))
    .sort((a, b) => b.errorRate - a.errorRate);

  // Convert template performance from ExecutionAnalytics
  const templateHealth: TemplateHealth[] = (patterns.templates?.templates || [])
    .slice(0, 20)
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      category: t.category || 'Uncategorized',
      totalExecutions: t.totalExecutions || 0,
      successRate: Math.round(t.successRate || 0),
      avgDuration: Math.round(t.averageDuration || 0),
      reliability: Math.round(t.reliability || 0),
      performanceScore: Math.round(t.performance || 0)
    }));

  // Extract metrics from patterns
  const successRate = patterns.performance?.successRate || 0;
  const errorRate = patterns.performance?.quality?.errorRate || 0;
  const avgExecutionTime = patterns.performance?.performance?.averageDuration || 0;
  const totalExecutions = patterns.performance?.total || 0;

  // Calculate overall health
  const overallHealth = calculateOverallHealth(successRate, errorRate, queueHealth, templateHealth);

  // Format trends
  const trends = (patterns.trends?.trends || [])
    .slice(0, 5)
    .map((t: any) => ({
      type: t.type || 'unknown',
      description: t.description || '',
      significance: t.significance || 0,
      direction: t.type?.includes('declining') ? 'down' as const :
                 t.type?.includes('improving') ? 'up' as const : 'stable' as const
    }));

  // Format recommendations
  const recommendations: SystemRecommendation[] = (patterns.recommendations?.recommendations || [])
    .slice(0, 10)
    .map((r: any) => ({
      type: r.type || 'general',
      priority: r.priority || 'medium',
      title: r.title || '',
      description: r.description || '',
      impact: r.impact || 'medium',
      effort: r.effort || 'medium',
      suggestion: r.suggestion || '',
      metrics: r.metrics,
      details: r.details
    }));

  // Add queue-specific recommendations if needed
  if (stuckExecutions > 0) {
    recommendations.unshift({
      type: 'queue_health',
      priority: 'critical',
      title: `${stuckExecutions} stuck executions detected`,
      description: `There are ${stuckExecutions} executions that have been running for over 30 minutes.`,
      impact: 'high',
      effort: 'low',
      suggestion: 'Review stuck executions and consider terminating or restarting them.',
      metrics: { stuckCount: stuckExecutions }
    });
  }

  if (pendingExecutions > 20) {
    recommendations.unshift({
      type: 'queue_backlog',
      priority: 'high',
      title: `Queue backlog: ${pendingExecutions} pending executions`,
      description: `The execution queue has ${pendingExecutions} pending items, which may indicate processing delays.`,
      impact: 'medium',
      effort: 'medium',
      suggestion: 'Consider scaling execution capacity or investigating processing bottlenecks.',
      metrics: { pendingCount: pendingExecutions, avgWaitTime: queueHealth.avgWaitTime }
    });
  }

  // Add tool-specific recommendations for high error rates
  const problematicTools = toolHealth.filter(t => t.errorRate > 30);
  for (const tool of problematicTools.slice(0, 3)) {
    recommendations.push({
      type: 'tool_performance',
      priority: tool.errorRate > 50 ? 'critical' : 'high',
      title: `Tool "${tool.toolName}" has ${tool.errorRate}% error rate`,
      description: `The "${tool.toolName}" tool failed ${tool.errorCount} out of ${tool.totalExecutions} executions in the last 7 days.`,
      impact: 'high',
      effort: 'medium',
      suggestion: 'Review error logs, check API rate limits, and consider implementing retry logic.',
      metrics: { errorRate: tool.errorRate, errorCount: tool.errorCount },
      details: tool.recentErrors
    });
  }

  // Format insights
  const insights = (patterns.insights?.insights || [])
    .slice(0, 8)
    .map((i: any) => ({
      type: i.type || 'neutral',
      category: i.category || 'general',
      title: i.title || '',
      description: i.description || ''
    }));

  // Add queue health insight
  if (queueHealth.stuckExecutions === 0 && queueHealth.pendingExecutions < 5) {
    insights.unshift({
      type: 'positive' as const,
      category: 'queue',
      title: 'Healthy Execution Queue',
      description: 'No stuck executions and minimal queue backlog indicates healthy processing.'
    });
  }

  return {
    data: {
      summary: {
        overallHealth,
        agentSuccessRate: Math.round(successRate),
        avgExecutionTime: Math.round(avgExecutionTime),
        activeExecutions: runningExecutions,
        errorRate: Math.round(errorRate),
        lastUpdated: now
      },
      toolHealth: toolHealth.slice(0, 15),
      templateHealth: templateHealth.slice(0, 15),
      queueHealth,
      trends,
      recommendations: recommendations.slice(0, 10),
      insights
    }
  };
}
