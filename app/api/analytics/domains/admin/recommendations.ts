import { TokenPayload } from '@/lib/types/auth';
import { UnifiedAnalyticsQuery } from '@/lib/validation/task-validation';
import { prisma } from '@/lib/prisma';

/**
 * Admin Recommendations Handler
 * Phase 3 of Admin Intelligence Implementation + Phase 7 Activity-Based Recommendations
 *
 * Generates 14 admin-specific recommendation types from portfolio-wide pattern detection:
 *
 * SOURCE DATA RECOMMENDATIONS (1-8):
 * 1. PORTFOLIO_RISK - Multiple POVs at risk
 * 2. PHASE_BOTTLENECK - Common phase blocking multiple POVs
 * 3. RESOURCE_ALLOCATION - Team workload imbalance
 * 4. TOOL_PERFORMANCE - MCP tool error rates
 * 5. TEAM_EFFICIENCY - Cross-POV team comparison
 * 6. TEMPLATE_OPTIMIZATION - Underperforming templates
 * 7. GEOGRAPHIC_INSIGHT - Regional patterns
 * 8. CROSS_POV_PATTERN - Shared blockers/dependencies
 *
 * ACTIVITY-BASED RECOMMENDATIONS (9-14) - Phase 7:
 * 9.  STALE_TASK_DETECTION - Tasks with no activity in 7+ days
 * 10. ACTIVITY_BOTTLENECK - Tasks with 5+ status changes (churning)
 * 11. ASSIGNMENT_VOLATILITY - Tasks reassigned 3+ times
 * 12. COMMENT_HEAVY_TASKS - Tasks with 10+ comments (unclear requirements)
 * 13. AGENT_RETRY_PATTERN - Same agent re-executed 3+ times on task
 * 14. RAPID_STATUS_CYCLING - Status changed 3+ times in 24 hours
 */

export type AdminRecommendationType =
  // Source data recommendations (1-8)
  | 'PORTFOLIO_RISK'
  | 'PHASE_BOTTLENECK'
  | 'RESOURCE_ALLOCATION'
  | 'TOOL_PERFORMANCE'
  | 'TEAM_EFFICIENCY'
  | 'TEMPLATE_OPTIMIZATION'
  | 'GEOGRAPHIC_INSIGHT'
  | 'CROSS_POV_PATTERN'
  // Activity-based recommendations (9-14) - Phase 7
  | 'STALE_TASK_DETECTION'
  | 'ACTIVITY_BOTTLENECK'
  | 'ASSIGNMENT_VOLATILITY'
  | 'COMMENT_HEAVY_TASKS'
  | 'AGENT_RETRY_PATTERN'
  | 'RAPID_STATUS_CYCLING';

export type RecommendationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AdminRecommendation {
  id: string;
  type: AdminRecommendationType;
  priority: RecommendationPriority;
  title: string;
  description: string;
  actionItems: string[];
  scope: 'PORTFOLIO' | 'REGIONAL' | 'TEAM' | 'SYSTEM';
  affectedCount: number;
  affectedEntities?: {
    id: string;
    title: string;
    type: string;
  }[];
  metrics?: {
    current: number;
    threshold: number;
    trend?: 'improving' | 'declining' | 'stable';
  };
  generatedAt: Date;
}

interface AdminRecommendationsResult {
  recommendations: AdminRecommendation[];
  summary: {
    total: number;
    byPriority: { priority: string; count: number }[];
    byType: { type: string; count: number }[];
  };
  generatedAt: Date;
}

/**
 * Generate unique ID for recommendation
 */
function generateRecId(type: string, index: number): string {
  return `admin-rec-${type.toLowerCase()}-${Date.now()}-${index}`;
}

export async function handleAdminRecommendations(
  params: UnifiedAnalyticsQuery,
  user: TokenPayload
): Promise<{ data: AdminRecommendationsResult }> {
  const now = new Date();
  const recommendations: AdminRecommendation[] = [];

  // Time constants for activity analysis
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch all data needed for recommendations in parallel
  const [
    activePOVs,
    allTasks,
    agentExecutions,
    teamWorkload,
    templates,
    // Phase 7: Activity-based recommendation queries
    activityPatterns,
    recentActivities,
  ] = await Promise.all([
    // Active POVs with phases and tasks
    // Active POVs = IN_PROGRESS, STALLED, VALIDATION (excludes PROJECTED)
    // Recommendations should be based on POVs actively being worked
    prisma.pOV.findMany({
      where: {
        status: { in: ['IN_PROGRESS', 'STALLED', 'VALIDATION'] }
      },
      take: 200, // Phase 2 safety cap: active POVs for recommendation analysis
      include: {
        phases: {
          include: {
            tasks: {
              take: 200, // Phase 2 safety cap: tasks per phase
              select: {
                id: true,
                status: true,
                dueDate: true,
                assigneeId: true,
              }
            }
          }
        },
        owner: { select: { id: true, email: true, name: true } },
      }
    }),

    // All tasks for workload analysis (includes title for activity recommendations)
    prisma.task.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] }
      },
      take: 5000, // Phase 2 safety cap: workload analysis needs breadth
      select: {
        id: true,
        title: true, // Added for activity recommendation entity display
        status: true,
        assigneeId: true,
        povId: true,
      }
    }),

    // Recent agent executions for tool performance
    prisma.agentExecution.findMany({
      where: {
        startTime: { gte: sevenDaysAgo }
      },
      take: 5000, // Phase 2 safety cap: matches recentActivities cap below
      select: {
        id: true,
        status: true,
        context: true, // Contains toolsUsed info
        logs: true,
      }
    }),

    // Team workload (tasks per user)
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        assigneeId: { not: null }
      },
      _count: { id: true }
    }),

    // Agent templates for optimization analysis
    prisma.agentTemplate.findMany({
      take: 500, // Phase 2 safety cap: templates typically < 100
      select: {
        id: true,
        name: true,
        category: true,
        _count: {
          select: { tasks: true }
        }
      }
    }),

    // Phase 7: Activity patterns grouped by task and action (last 14 days)
    // Used for: STALE_TASK, ACTIVITY_BOTTLENECK, ASSIGNMENT_VOLATILITY, COMMENT_HEAVY, AGENT_RETRY
    prisma.taskActivity.groupBy({
      by: ['taskId', 'action'],
      where: {
        timestamp: { gte: fourteenDaysAgo }
      },
      _count: { id: true },
      _max: { timestamp: true },
    }),

    // Phase 7: Recent activities for rapid cycling detection (last 24 hours)
    // Used for: RAPID_STATUS_CYCLING
    prisma.taskActivity.findMany({
      where: {
        action: { in: ['STATUS_CHANGED', 'ASSIGNED', 'AGENT_EXECUTED'] },
        timestamp: { gte: oneDayAgo }
      },
      select: {
        taskId: true,
        action: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 5000, // Limit for performance
    }),
  ]);

  // Create task title lookup map for activity recommendations (O(1) lookups)
  const taskTitleMap = new Map<string, string>();
  for (const task of allTasks) {
    taskTitleMap.set(task.id, task.title);
  }

  // Create set of taskIds from active POVs (IN_PROGRESS, STALLED, VALIDATION)
  // Used to filter activity-based recommendations - excludes PROJECTED, WON, LOST
  const activePOVTaskIds = new Set<string>();
  for (const pov of activePOVs) {
    for (const phase of pov.phases) {
      for (const task of phase.tasks) {
        activePOVTaskIds.add(task.id);
      }
    }
  }

  // ============================================================================
  // RECOMMENDATION 1: PORTFOLIO_RISK
  // Trigger: > 3 POVs with overdue tasks
  // ============================================================================
  const atRiskPOVs = activePOVs.filter(pov => {
    const overdueTasks = pov.phases.flatMap(p => p.tasks).filter(t =>
      t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED'
    );
    return overdueTasks.length > 0;
  });

  if (atRiskPOVs.length > 3) {
    recommendations.push({
      id: generateRecId('portfolio-risk', 1),
      type: 'PORTFOLIO_RISK',
      priority: atRiskPOVs.length > 5 ? 'CRITICAL' : 'HIGH',
      title: `${atRiskPOVs.length} POVs have overdue tasks`,
      description: `Your portfolio has ${atRiskPOVs.length} POVs with tasks past their due date. This indicates potential delivery risks that need immediate attention.`,
      actionItems: [
        `Review the ${Math.min(3, atRiskPOVs.length)} most critical POVs: ${atRiskPOVs.slice(0, 3).map(p => p.title).join(', ')}`,
        'Identify common blockers across at-risk POVs',
        'Consider reallocating resources to critical POVs',
        'Schedule stakeholder reviews for high-risk deliverables',
      ],
      scope: 'PORTFOLIO',
      affectedCount: atRiskPOVs.length,
      affectedEntities: atRiskPOVs.slice(0, 10).map(p => ({
        id: p.id,
        title: p.title,
        type: 'POV',
      })),
      metrics: {
        current: atRiskPOVs.length,
        threshold: 3,
        trend: 'stable',
      },
      generatedAt: now,
    });
  }

  // ============================================================================
  // RECOMMENDATION 2: PHASE_BOTTLENECK
  // Trigger: > 5 POVs stuck on same phase type
  // ============================================================================
  const phaseGroups = new Map<string, { povIds: Set<string>; taskCount: number }>();

  for (const pov of activePOVs) {
    for (const phase of pov.phases) {
      const incompleteTasks = phase.tasks.filter(t => t.status !== 'COMPLETED').length;
      if (incompleteTasks > 0) {
        const existing = phaseGroups.get(phase.name) || { povIds: new Set(), taskCount: 0 };
        existing.povIds.add(pov.id);
        existing.taskCount += incompleteTasks;
        phaseGroups.set(phase.name, existing);
      }
    }
  }

  for (const [phaseName, data] of phaseGroups.entries()) {
    if (data.povIds.size >= 5) {
      recommendations.push({
        id: generateRecId('phase-bottleneck', recommendations.length),
        type: 'PHASE_BOTTLENECK',
        priority: data.povIds.size >= 8 ? 'CRITICAL' : 'HIGH',
        title: `"${phaseName}" is blocking ${data.povIds.size} POVs`,
        description: `The "${phaseName}" phase has incomplete tasks in ${data.povIds.size} POVs with ${data.taskCount} total tasks pending. This common bottleneck suggests a systemic issue.`,
        actionItems: [
          `Investigate why "${phaseName}" phase is consistently slow`,
          'Consider adding dedicated resources for this phase type',
          'Review phase requirements for potential simplification',
          'Create phase-specific playbooks or templates',
        ],
        scope: 'PORTFOLIO',
        affectedCount: data.povIds.size,
        metrics: {
          current: data.povIds.size,
          threshold: 5,
        },
        generatedAt: now,
      });
    }
  }

  // ============================================================================
  // RECOMMENDATION 3: RESOURCE_ALLOCATION
  // Trigger: Max workload > 1.5x average workload
  // ============================================================================
  if (teamWorkload.length > 2) {
    const workloads = teamWorkload.map(w => w._count.id);
    const avgWorkload = workloads.reduce((a, b) => a + b, 0) / workloads.length;
    const maxWorkload = Math.max(...workloads);
    const minWorkload = Math.min(...workloads);

    if (maxWorkload > avgWorkload * 1.5) {
      const overloadedUsers = teamWorkload.filter(w => w._count.id > avgWorkload * 1.3);

      recommendations.push({
        id: generateRecId('resource-allocation', 1),
        type: 'RESOURCE_ALLOCATION',
        priority: maxWorkload > avgWorkload * 2 ? 'CRITICAL' : 'HIGH',
        title: `Workload imbalance detected (${maxWorkload} vs ${Math.round(avgWorkload)} avg tasks)`,
        description: `Some team members have significantly more tasks than others. The highest workload is ${maxWorkload} tasks while the average is ${Math.round(avgWorkload)}. This imbalance risks burnout and delays.`,
        actionItems: [
          `Redistribute ${Math.round(maxWorkload - avgWorkload)} tasks from overloaded team members`,
          'Review task assignments for upcoming sprints',
          'Consider skill-based task routing to balance load',
          'Implement workload visibility in team standups',
        ],
        scope: 'TEAM',
        affectedCount: overloadedUsers.length,
        metrics: {
          current: maxWorkload,
          threshold: Math.round(avgWorkload * 1.5),
          trend: maxWorkload > minWorkload * 3 ? 'declining' : 'stable',
        },
        generatedAt: now,
      });
    }
  }

  // ============================================================================
  // RECOMMENDATION 4: TOOL_PERFORMANCE
  // Trigger: Any tool with error rate > 30%
  // ============================================================================
  const toolStats = new Map<string, { total: number; errors: number }>();

  for (const exec of agentExecutions) {
    // Extract tools from context JSON (may contain toolsUsed array)
    const context = exec.context as Record<string, any> || {};
    const tools = (context.toolsUsed as string[]) || (context.tools as string[]) || [];
    const hasError = exec.status === 'FAILED';

    for (const tool of tools) {
      const stats = toolStats.get(tool) || { total: 0, errors: 0 };
      stats.total++;
      if (hasError) stats.errors++;
      toolStats.set(tool, stats);
    }
  }

  for (const [toolName, stats] of toolStats.entries()) {
    if (stats.total >= 10) { // Only report tools with significant usage
      const errorRate = (stats.errors / stats.total) * 100;
      if (errorRate > 30) {
        recommendations.push({
          id: generateRecId('tool-performance', recommendations.length),
          type: 'TOOL_PERFORMANCE',
          priority: errorRate > 50 ? 'CRITICAL' : 'HIGH',
          title: `Tool "${toolName}" has ${Math.round(errorRate)}% error rate`,
          description: `The "${toolName}" tool failed ${stats.errors} out of ${stats.total} executions in the last 7 days. This high error rate is impacting agent reliability.`,
          actionItems: [
            `Review error logs for "${toolName}" tool`,
            'Check for API rate limits or authentication issues',
            'Consider implementing retry logic or fallbacks',
            'Update tool configuration or credentials if needed',
          ],
          scope: 'SYSTEM',
          affectedCount: stats.errors,
          metrics: {
            current: Math.round(errorRate),
            threshold: 30,
            trend: 'declining',
          },
          generatedAt: now,
        });
      }
    }
  }

  // ============================================================================
  // RECOMMENDATION 5: TEAM_EFFICIENCY
  // Trigger: Completion rate variance > 2x between POVs
  // ============================================================================
  const povCompletionRates = activePOVs.map(pov => {
    const allTasks = pov.phases.flatMap(p => p.tasks);
    const completed = allTasks.filter(t => t.status === 'COMPLETED').length;
    return {
      pov,
      rate: allTasks.length > 0 ? (completed / allTasks.length) * 100 : 0,
      total: allTasks.length,
    };
  }).filter(p => p.total >= 5); // Only POVs with meaningful task counts

  if (povCompletionRates.length >= 3) {
    const rates = povCompletionRates.map(p => p.rate);
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);

    if (maxRate > 50 && minRate < 25 && maxRate > minRate * 2) {
      const topPerformers = povCompletionRates.filter(p => p.rate > avgRate * 1.3);
      const lowPerformers = povCompletionRates.filter(p => p.rate < avgRate * 0.7);

      recommendations.push({
        id: generateRecId('team-efficiency', 1),
        type: 'TEAM_EFFICIENCY',
        priority: 'MEDIUM',
        title: `Wide efficiency gap: ${Math.round(maxRate)}% vs ${Math.round(minRate)}% completion`,
        description: `POV completion rates vary significantly from ${Math.round(minRate)}% to ${Math.round(maxRate)}%. Studying high-performers could help improve overall portfolio velocity.`,
        actionItems: [
          `Analyze practices from top-performing POVs (${topPerformers.slice(0, 2).map(p => p.pov.title).join(', ')})`,
          'Identify blockers in low-performing POVs',
          'Share best practices across teams',
          'Consider pairing high and low performers',
        ],
        scope: 'PORTFOLIO',
        affectedCount: lowPerformers.length,
        affectedEntities: lowPerformers.slice(0, 5).map(p => ({
          id: p.pov.id,
          title: p.pov.title,
          type: 'POV',
        })),
        metrics: {
          current: Math.round(minRate),
          threshold: Math.round(avgRate * 0.7),
        },
        generatedAt: now,
      });
    }
  }

  // ============================================================================
  // RECOMMENDATION 6: TEMPLATE_OPTIMIZATION
  // Trigger: Templates with < 3 usages (underutilized)
  // ============================================================================
  const underutilizedTemplates = templates.filter(t => t._count.tasks < 3 && t._count.tasks > 0);
  const unusedTemplates = templates.filter(t => t._count.tasks === 0);

  if (unusedTemplates.length > 5) {
    recommendations.push({
      id: generateRecId('template-optimization', 1),
      type: 'TEMPLATE_OPTIMIZATION',
      priority: 'LOW',
      title: `${unusedTemplates.length} agent templates are unused`,
      description: `You have ${unusedTemplates.length} agent templates that have never been used. Consider reviewing these for relevance or consolidation.`,
      actionItems: [
        'Review unused templates for potential archival',
        'Consolidate similar templates to reduce maintenance',
        'Promote useful templates to increase adoption',
        'Document template use cases for team awareness',
      ],
      scope: 'SYSTEM',
      affectedCount: unusedTemplates.length,
      affectedEntities: unusedTemplates.slice(0, 10).map(t => ({
        id: t.id,
        title: t.name,
        type: 'Template',
      })),
      generatedAt: now,
    });
  }

  // ============================================================================
  // RECOMMENDATION 7: GEOGRAPHIC_INSIGHT
  // Trigger: Regional health variance > 30%
  // ============================================================================
  const theatreGroups = new Map<string, { povs: typeof activePOVs; overdueCount: number }>();

  for (const pov of activePOVs) {
    const theatre = pov.salesTheatre || 'UNKNOWN';
    const existing = theatreGroups.get(theatre) || { povs: [], overdueCount: 0 };
    existing.povs.push(pov);

    const overdueTasks = pov.phases.flatMap(p => p.tasks).filter(t =>
      t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED'
    ).length;
    existing.overdueCount += overdueTasks;

    theatreGroups.set(theatre, existing);
  }

  if (theatreGroups.size >= 2) {
    const theatreStats = Array.from(theatreGroups.entries()).map(([theatre, data]) => ({
      theatre,
      povCount: data.povs.length,
      overdueRate: data.povs.length > 0 ? (data.overdueCount / data.povs.length) : 0,
    })).filter(t => t.povCount >= 2);

    if (theatreStats.length >= 2) {
      const rates = theatreStats.map(t => t.overdueRate);
      const maxRate = Math.max(...rates);
      const minRate = Math.min(...rates);

      if (maxRate > 0 && (minRate === 0 || maxRate > minRate * 1.5)) {
        const worstTheatre = theatreStats.find(t => t.overdueRate === maxRate);
        const bestTheatre = theatreStats.find(t => t.overdueRate === minRate);

        if (worstTheatre && bestTheatre && worstTheatre.theatre !== bestTheatre.theatre) {
          recommendations.push({
            id: generateRecId('geographic-insight', 1),
            type: 'GEOGRAPHIC_INSIGHT',
            priority: 'MEDIUM',
            title: `${worstTheatre.theatre} region has higher overdue rate`,
            description: `The ${worstTheatre.theatre} region averages ${Math.round(worstTheatre.overdueRate)} overdue tasks per POV, while ${bestTheatre.theatre} averages ${Math.round(bestTheatre.overdueRate)}. Regional factors may be affecting delivery.`,
            actionItems: [
              `Investigate regional challenges in ${worstTheatre.theatre}`,
              `Share best practices from ${bestTheatre.theatre}`,
              'Consider timezone or resource availability factors',
              'Review regional support and tooling parity',
            ],
            scope: 'REGIONAL',
            affectedCount: worstTheatre.povCount,
            metrics: {
              current: Math.round(worstTheatre.overdueRate),
              threshold: Math.round(bestTheatre.overdueRate * 1.5),
            },
            generatedAt: now,
          });
        }
      }
    }
  }

  // ============================================================================
  // RECOMMENDATION 8: CROSS_POV_PATTERN
  // Trigger: > 3 POVs with blocked tasks
  // ============================================================================
  const blockedPOVs = activePOVs.filter(pov => {
    const blockedTasks = pov.phases.flatMap(p => p.tasks).filter(t => t.status === 'BLOCKED');
    return blockedTasks.length > 0;
  });

  if (blockedPOVs.length > 3) {
    const totalBlocked = blockedPOVs.reduce((sum, pov) => {
      return sum + pov.phases.flatMap(p => p.tasks).filter(t => t.status === 'BLOCKED').length;
    }, 0);

    recommendations.push({
      id: generateRecId('cross-pov-pattern', 1),
      type: 'CROSS_POV_PATTERN',
      priority: blockedPOVs.length > 5 ? 'HIGH' : 'MEDIUM',
      title: `${blockedPOVs.length} POVs have blocked tasks (${totalBlocked} total)`,
      description: `Multiple POVs are experiencing blocked tasks, suggesting potential shared dependencies or common blockers that need resolution.`,
      actionItems: [
        'Identify common blockers across POVs',
        'Escalate shared dependencies to leadership',
        'Create a blocker resolution task force',
        'Implement blocker tracking and alerts',
      ],
      scope: 'PORTFOLIO',
      affectedCount: blockedPOVs.length,
      affectedEntities: blockedPOVs.slice(0, 10).map(p => ({
        id: p.id,
        title: p.title,
        type: 'POV',
      })),
      metrics: {
        current: totalBlocked,
        threshold: 3,
      },
      generatedAt: now,
    });
  }

  // ============================================================================
  // PHASE 7: ACTIVITY-BASED RECOMMENDATIONS (9-14)
  // These analyze TaskActivity patterns to detect temporal issues
  // ============================================================================

  // Build activity count maps from grouped data
  const taskActivityCounts = new Map<string, Map<string, { count: number; lastActivity: Date | null }>>();
  for (const pattern of activityPatterns) {
    if (!taskActivityCounts.has(pattern.taskId)) {
      taskActivityCounts.set(pattern.taskId, new Map());
    }
    taskActivityCounts.get(pattern.taskId)!.set(pattern.action, {
      count: pattern._count.id,
      lastActivity: pattern._max.timestamp,
    });
  }

  // Get all taskIds with any activity in last 14 days
  const activeTaskIds = new Set(activityPatterns.map(p => p.taskId));

  // ============================================================================
  // RECOMMENDATION 9: STALE_TASK_DETECTION
  // Trigger: Tasks with no activity in 7+ days
  // Only includes tasks from active POVs (IN_PROGRESS, STALLED, VALIDATION)
  // ============================================================================
  const staleTasks = allTasks.filter(task => {
    // Only include tasks from active POVs
    if (!activePOVTaskIds.has(task.id)) return false;

    // Check if task has any recent activity
    const taskPatterns = taskActivityCounts.get(task.id);
    if (!taskPatterns) return true; // No activity at all = stale

    // Find most recent activity across all action types
    let mostRecentActivity: Date | null = null;
    for (const [, data] of taskPatterns) {
      if (data.lastActivity) {
        if (!mostRecentActivity || data.lastActivity > mostRecentActivity) {
          mostRecentActivity = data.lastActivity;
        }
      }
    }

    // Stale if no activity or last activity > 7 days ago
    return !mostRecentActivity || mostRecentActivity < sevenDaysAgo;
  });

  if (staleTasks.length >= 5) {
    recommendations.push({
      id: generateRecId('stale-task-detection', recommendations.length),
      type: 'STALE_TASK_DETECTION',
      priority: 'MEDIUM',
      title: `${staleTasks.length} tasks have no activity in 7+ days`,
      description: `Multiple open tasks appear stalled with no recent updates. These may be forgotten, blocked without status update, or require reassignment.`,
      actionItems: [
        'Review stale tasks for hidden blockers or dependencies',
        'Contact assignees to check task status',
        'Consider reassigning abandoned tasks',
        'Set up automated stale task alerts for future prevention',
      ],
      scope: 'PORTFOLIO',
      affectedCount: staleTasks.length,
      affectedEntities: staleTasks.slice(0, 10).map(t => ({
        id: t.id,
        title: taskTitleMap.get(t.id) || `Task ${t.id.slice(-6)}`,
        type: 'Task',
      })),
      metrics: {
        current: staleTasks.length,
        threshold: 5,
      },
      generatedAt: now,
    });
  }

  // ============================================================================
  // RECOMMENDATION 10: ACTIVITY_BOTTLENECK
  // Trigger: Tasks with 5+ status changes (churning/indecision)
  // Only includes tasks from active POVs (IN_PROGRESS, STALLED, VALIDATION)
  // ============================================================================
  const churningTasks: { taskId: string; statusChanges: number }[] = [];

  for (const [taskId, actions] of taskActivityCounts) {
    // Only include tasks from active POVs
    if (!activePOVTaskIds.has(taskId)) continue;

    const statusChangeData = actions.get('STATUS_CHANGED');
    if (statusChangeData && statusChangeData.count >= 5) {
      churningTasks.push({ taskId, statusChanges: statusChangeData.count });
    }
  }

  if (churningTasks.length >= 3) {
    churningTasks.sort((a, b) => b.statusChanges - a.statusChanges);
    const maxChanges = churningTasks[0].statusChanges;

    recommendations.push({
      id: generateRecId('activity-bottleneck', recommendations.length),
      type: 'ACTIVITY_BOTTLENECK',
      priority: 'MEDIUM',
      title: `${churningTasks.length} tasks show status churn (5+ changes)`,
      description: `Tasks with excessive status changes often indicate unclear requirements, scope creep, or workflow issues. The worst case has ${maxChanges} status changes.`,
      actionItems: [
        'Review requirements clarity for churning tasks',
        'Check for scope creep or changing priorities',
        'Consider breaking large tasks into smaller units',
        'Investigate if status definitions are understood by team',
      ],
      scope: 'PORTFOLIO',
      affectedCount: churningTasks.length,
      affectedEntities: churningTasks.slice(0, 10).map(t => ({
        id: t.taskId,
        title: taskTitleMap.get(t.taskId) || `Task ${t.taskId.slice(-6)}`,
        type: 'Task',
      })),
      metrics: {
        current: maxChanges,
        threshold: 5,
      },
      generatedAt: now,
    });
  }

  // ============================================================================
  // RECOMMENDATION 11: ASSIGNMENT_VOLATILITY
  // Trigger: Tasks reassigned 3+ times (ownership unclear)
  // Only includes tasks from active POVs (IN_PROGRESS, STALLED, VALIDATION)
  // ============================================================================
  const volatileTasks: { taskId: string; reassignments: number }[] = [];

  for (const [taskId, actions] of taskActivityCounts) {
    // Only include tasks from active POVs
    if (!activePOVTaskIds.has(taskId)) continue;

    const assignedData = actions.get('ASSIGNED');
    if (assignedData && assignedData.count >= 3) {
      volatileTasks.push({ taskId, reassignments: assignedData.count });
    }
  }

  if (volatileTasks.length >= 2) {
    volatileTasks.sort((a, b) => b.reassignments - a.reassignments);
    const maxReassignments = volatileTasks[0].reassignments;

    recommendations.push({
      id: generateRecId('assignment-volatility', recommendations.length),
      type: 'ASSIGNMENT_VOLATILITY',
      priority: 'MEDIUM',
      title: `${volatileTasks.length} tasks reassigned 3+ times`,
      description: `Frequent task reassignment can indicate unclear ownership, skill mismatch, or capacity issues. The most reassigned task changed hands ${maxReassignments} times.`,
      actionItems: [
        'Review task assignment criteria and processes',
        'Check if skills match task requirements',
        'Consider workload balancing before assignment',
        'Establish clearer task ownership guidelines',
      ],
      scope: 'TEAM',
      affectedCount: volatileTasks.length,
      affectedEntities: volatileTasks.slice(0, 10).map(t => ({
        id: t.taskId,
        title: taskTitleMap.get(t.taskId) || `Task ${t.taskId.slice(-6)}`,
        type: 'Task',
      })),
      metrics: {
        current: maxReassignments,
        threshold: 3,
      },
      generatedAt: now,
    });
  }

  // ============================================================================
  // RECOMMENDATION 12: COMMENT_HEAVY_TASKS
  // Trigger: Tasks with 10+ comments (may need clarification/escalation)
  // Only includes tasks from active POVs (IN_PROGRESS, STALLED, VALIDATION)
  // ============================================================================
  const commentHeavyTasks: { taskId: string; comments: number }[] = [];

  for (const [taskId, actions] of taskActivityCounts) {
    // Only include tasks from active POVs
    if (!activePOVTaskIds.has(taskId)) continue;

    const commentData = actions.get('COMMENT_ADDED');
    if (commentData && commentData.count >= 10) {
      commentHeavyTasks.push({ taskId, comments: commentData.count });
    }
  }

  if (commentHeavyTasks.length >= 2) {
    commentHeavyTasks.sort((a, b) => b.comments - a.comments);
    const maxComments = commentHeavyTasks[0].comments;

    recommendations.push({
      id: generateRecId('comment-heavy-tasks', recommendations.length),
      type: 'COMMENT_HEAVY_TASKS',
      priority: 'MEDIUM',
      title: `${commentHeavyTasks.length} tasks have 10+ comments`,
      description: `Tasks with excessive comments may indicate unclear requirements, ongoing debates, or need for synchronous discussion. The most discussed task has ${maxComments} comments.`,
      actionItems: [
        'Schedule brief meetings for heavily discussed tasks',
        'Review if task requirements need clarification',
        'Consider breaking complex tasks into subtasks',
        'Check if escalation to stakeholders is needed',
      ],
      scope: 'PORTFOLIO',
      affectedCount: commentHeavyTasks.length,
      affectedEntities: commentHeavyTasks.slice(0, 10).map(t => ({
        id: t.taskId,
        title: taskTitleMap.get(t.taskId) || `Task ${t.taskId.slice(-6)}`,
        type: 'Task',
      })),
      metrics: {
        current: maxComments,
        threshold: 10,
      },
      generatedAt: now,
    });
  }

  // ============================================================================
  // RECOMMENDATION 13: AGENT_RETRY_PATTERN
  // Trigger: Same agent executed 3+ times on task (may be failing)
  // Only includes tasks from active POVs (IN_PROGRESS, STALLED, VALIDATION)
  // ============================================================================
  const agentRetryTasks: { taskId: string; retries: number }[] = [];

  for (const [taskId, actions] of taskActivityCounts) {
    // Only include tasks from active POVs
    if (!activePOVTaskIds.has(taskId)) continue;

    const agentData = actions.get('AGENT_EXECUTED');
    if (agentData && agentData.count >= 3) {
      agentRetryTasks.push({ taskId, retries: agentData.count });
    }
  }

  if (agentRetryTasks.length >= 2) {
    agentRetryTasks.sort((a, b) => b.retries - a.retries);
    const maxRetries = agentRetryTasks[0].retries;

    recommendations.push({
      id: generateRecId('agent-retry-pattern', recommendations.length),
      type: 'AGENT_RETRY_PATTERN',
      priority: 'MEDIUM',
      title: `${agentRetryTasks.length} tasks show agent retry patterns`,
      description: `Tasks with multiple agent executions may indicate failing agents, unclear prompts, or tasks unsuited for automation. The most retried task has ${maxRetries} agent executions.`,
      actionItems: [
        'Review agent execution logs for failure patterns',
        'Check if task prompts are clear and actionable',
        'Consider if tasks are appropriate for agent automation',
        'Investigate specific agent tool failures',
      ],
      scope: 'SYSTEM',
      affectedCount: agentRetryTasks.length,
      affectedEntities: agentRetryTasks.slice(0, 10).map(t => ({
        id: t.taskId,
        title: taskTitleMap.get(t.taskId) || `Task ${t.taskId.slice(-6)}`,
        type: 'Task',
      })),
      metrics: {
        current: maxRetries,
        threshold: 3,
      },
      generatedAt: now,
    });
  }

  // ============================================================================
  // RECOMMENDATION 14: RAPID_STATUS_CYCLING
  // Trigger: 3+ status changes in 24 hours (immediate attention needed)
  // Only includes tasks from active POVs (IN_PROGRESS, STALLED, VALIDATION)
  // ============================================================================
  const rapidCyclingTasks = new Map<string, number>();

  for (const activity of recentActivities) {
    // Only include tasks from active POVs
    if (!activePOVTaskIds.has(activity.taskId)) continue;

    if (activity.action === 'STATUS_CHANGED') {
      const count = rapidCyclingTasks.get(activity.taskId) || 0;
      rapidCyclingTasks.set(activity.taskId, count + 1);
    }
  }

  const rapidCyclers = Array.from(rapidCyclingTasks.entries())
    .filter(([, count]) => count >= 3)
    .map(([taskId, statusChanges]) => ({ taskId, statusChanges }))
    .sort((a, b) => b.statusChanges - a.statusChanges);

  if (rapidCyclers.length > 0) {
    const maxCycles = rapidCyclers[0].statusChanges;

    recommendations.push({
      id: generateRecId('rapid-status-cycling', recommendations.length),
      type: 'RAPID_STATUS_CYCLING',
      priority: 'MEDIUM',
      title: `${rapidCyclers.length} tasks changed status 3+ times today`,
      description: `Tasks with rapid status cycling often indicate confusion, unclear workflows, or urgent issues requiring immediate attention. The worst case has ${maxCycles} changes in 24 hours.`,
      actionItems: [
        'Contact task owners immediately for clarification',
        'Review if workflow process is understood',
        'Check for external blockers causing back-and-forth',
        'Consider task scope or requirement issues',
      ],
      scope: 'PORTFOLIO',
      affectedCount: rapidCyclers.length,
      affectedEntities: rapidCyclers.slice(0, 10).map(t => ({
        id: t.taskId,
        title: taskTitleMap.get(t.taskId) || `Task ${t.taskId.slice(-6)}`,
        type: 'Task',
      })),
      metrics: {
        current: maxCycles,
        threshold: 3,
        trend: 'declining',
      },
      generatedAt: now,
    });
  }

  // ============================================================================
  // Sort recommendations by priority
  // ============================================================================
  const priorityOrder: Record<RecommendationPriority, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };

  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Build summary
  const byPriority = Object.entries(
    recommendations.reduce((acc, r) => {
      acc[r.priority] = (acc[r.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([priority, count]) => ({ priority, count }));

  const byType = Object.entries(
    recommendations.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([type, count]) => ({ type, count }));

  return {
    data: {
      recommendations,
      summary: {
        total: recommendations.length,
        byPriority,
        byType,
      },
      generatedAt: now,
    },
  };
}
