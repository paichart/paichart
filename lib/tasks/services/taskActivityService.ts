import { prisma } from '@/lib/prisma';
import { taskLogger } from '@/lib/logger';
import { TokenPayload } from '@/lib/types/auth';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  ActivityDetails,
  ActivityMetadata,
  TaskActivityAction,
  TaskActivityActionType,
  type ActivityLogInput,
} from '@/lib/types/activity';
import {
  validateActivityDetails,
  validateActivityMetadata,
} from '@/lib/validation/activity-validation';

// Optimized Task Activity Service - Task 9
// Extended with rich details logging (Phase 2.2 - 2025-12-31)
// Fixes N+1 queries for activity user details with batch user lookups

interface TaskActivityFilters {
  taskId?: string;
  userId?: string;
  action?: string;
  povId?: string;  // Filter by POV (queries task.povId)
  dateRange?: '1d' | '7d' | '30d' | '90d';
  limit?: number;
  offset?: number;
}

interface OptimizedTaskActivity {
  id: string;
  action: string;
  timestamp: Date;
  taskId: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  // Null for POV-level entries (e.g. POV status transitions), which have no task.
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
  } | null;
  // Structured field-change data ({fieldName, oldValue, newValue, ...names}) — powers the
  // "old → new" rendering in the activity timelines. Previously stripped at this boundary.
  details?: unknown;
}

/**
 * OPTIMIZED: Get task activity history with batch user lookups
 * 
 * BEFORE (N+1 Pattern):
 * 1. Query activities: SELECT * FROM task_activities WHERE ...
 * 2. For each activity, query user: SELECT * FROM users WHERE id = ? (N queries)
 * 3. For each activity, query task: SELECT * FROM tasks WHERE id = ? (N queries)
 * Total: 1 + N + N queries (up to 201 queries for 100 activities)
 * 
 * AFTER (Batch Pattern):
 * 1. Query activities: SELECT * FROM task_activities WHERE ...
 * 2. Batch query users: SELECT * FROM users WHERE id IN (...)  (1 query)
 * 3. Batch query tasks: SELECT * FROM tasks WHERE id IN (...)  (1 query)
 * Total: 3 queries regardless of result count
 * 
 * Expected Impact: 70% reduction in activity query time
 */
export async function getTaskActivityHistory(
  filters: TaskActivityFilters,
  user: TokenPayload
): Promise<{
  data: OptimizedTaskActivity[];
  total: number;
  pagination: {
    hasMore: boolean;
    offset: number;
    limit: number;
  };
}> {
  taskLogger.debug('starting optimized activity history query');
  const startTime = Date.now();

  try {
    // Build date filter
    const dateFilter = buildDateFilter(filters.dateRange);
    
    // Build where clause for activities
    const where: any = {};

    if (filters.taskId) {
      where.taskId = filters.taskId;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action) {
      where.action = { contains: filters.action, mode: 'insensitive' };
    }

    // Filter by POV - queries through task relation
    if (filters.povId) {
      where.task = { povId: filters.povId };
    }

    if (dateFilter) {
      where.timestamp = { gte: dateFilter };
    }

    const limit = Math.min(filters.limit || 50, 200);
    const offset = filters.offset || 0;

    // OPTIMIZATION STEP 1: Get activities with minimal fields only
    const [activities, totalCount] = await Promise.all([
      prisma.taskActivity.findMany({
        where,
        select: {
          id: true,
          action: true,
          timestamp: true,
          taskId: true,
          userId: true,
          details: true, // field-change old/new values (same-row JSONB, no N+1)
          // NO INCLUDES - This prevents N+1 queries
        },
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.taskActivity.count({ where })
    ]);

    // POV-level status transitions live in the Platform `Activity` table (not TaskActivity).
    // For a POV-scoped feed, merge them in by metadata.resourceId (written by both the REST
    // and MCP status guards), so the timeline shows "POV status: X → Y" alongside task changes.
    // Actor-agnostic (not owner-filtered) and gated to POV-scope feeds (not task-scoped).
    const povStatusRows = (filters.povId && !filters.taskId)
      ? await prisma.activity.findMany({
          where: {
            type: 'POV_STATUS_CHANGE',
            metadata: { path: ['resourceId'], equals: filters.povId },
            ...(dateFilter ? { createdAt: { gte: dateFilter } } : {}),
          },
          select: { id: true, action: true, createdAt: true, userId: true, metadata: true },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }).catch(err => {
          taskLogger.warn({ err, povId: filters.povId }, 'POV status activity merge failed — task-only');
          return [] as { id: string; action: string; createdAt: Date; userId: string; metadata: unknown }[];
        })
      : [];

    if (activities.length === 0 && povStatusRows.length === 0) {
      return {
        data: [],
        total: 0,
        pagination: { hasMore: false, offset, limit }
      };
    }

    // OPTIMIZATION STEP 2: Extract unique user IDs and task IDs for batch queries
    const uniqueUserIds = Array.from(new Set([
      ...activities.map(a => a.userId),
      ...povStatusRows.map(a => a.userId),
    ]));
    const uniqueTaskIds = Array.from(new Set(activities.map(a => a.taskId)));

    taskLogger.debug({ uniqueUsers: uniqueUserIds.length, uniqueTasks: uniqueTaskIds.length }, 'batch querying users and tasks');

    // OPTIMIZATION STEP 3: Batch query users and tasks
    const [userMap, taskMap] = await Promise.all([
      // Batch query all users at once
      prisma.user.findMany({
        where: { id: { in: uniqueUserIds } },
        select: {
          id: true,
          name: true,
          email: true,
        },
        take: 200,
      }).then(users => new Map(users.map(u => [u.id, u]))),
      
      // Batch query all tasks at once
      prisma.task.findMany({
        where: { id: { in: uniqueTaskIds } },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
        },
        take: 200,
      }).then(tasks => new Map(tasks.map(t => [t.id, t])))
    ]);

    // OPTIMIZATION STEP 4: Assemble results using in-memory maps
    const optimizedActivities: OptimizedTaskActivity[] = activities.map(activity => {
      const user = userMap.get(activity.userId);
      const task = taskMap.get(activity.taskId);
      
      return {
        id: activity.id,
        action: activity.action,
        timestamp: activity.timestamp,
        taskId: activity.taskId,
        userId: activity.userId,
        user: user || {
          id: activity.userId,
          name: 'Unknown User',
          email: '',
        },
        task: task || {
          id: activity.taskId,
          title: 'Unknown Task',
          status: 'OPEN',
          priority: 'MEDIUM',
        },
        details: activity.details,
      };
    });

    // Normalize POV status transitions into the same shape (task: null) and merge by recency.
    const povOptimized: OptimizedTaskActivity[] = povStatusRows.map(row => {
      const meta = (row.metadata || {}) as Record<string, unknown>;
      const user = userMap.get(row.userId);
      return {
        id: row.id,
        action: 'POV status changed', // 'status' substring → 🔄 icon in the renderers
        timestamp: row.createdAt,
        taskId: '',
        userId: row.userId,
        user: user || { id: row.userId, name: 'Unknown User', email: '' },
        task: null,
        details: { fieldName: 'POV status', oldValue: meta.oldStatus, newValue: meta.newStatus },
      };
    });

    const merged = [...optimizedActivities, ...povOptimized]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    const queryTime = Date.now() - startTime;
    taskLogger.info({ activityCount: activities.length, povStatusCount: povOptimized.length, queryTimeMs: queryTime }, 'activity history query complete');

    return {
      data: merged,
      total: totalCount + povOptimized.length,
      pagination: {
        hasMore: offset + activities.length < totalCount,
        offset,
        limit
      }
    };

  } catch (error) {
    taskLogger.error({ err: error }, 'failed to fetch task activity history');
    throw new Error('Failed to fetch task activity history');
  }
}

// Legacy N+1-prone version replaced by the optimized one above — see git
// history for the pre-rewrite implementation. Block comment removed
// 2026-05-14 (dead-block-comment hazard, same class as Bug Class 75
// UpdatePOVSchemaInline; see bc60a6bb).

/**
 * Create task activity with optimized user lookup
 */
export async function createTaskActivity(data: {
  userId: string;
  taskId: string;
  action: string;
}): Promise<void> {
  try {
    // Validate userId exists before creating activity
    if (data.userId && data.userId !== 'system') {
      const userExists = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { id: true }
      });

      if (!userExists) {
        taskLogger.warn({ userId: data.userId, taskId: data.taskId, action: data.action }, 'skipping activity - user not found');
        return; // Skip activity creation rather than failing
      }
    } else if (data.userId === 'system') {
      taskLogger.warn({ taskId: data.taskId, action: data.action }, 'skipping activity - system user not implemented');
      return; // Skip 'system' user activities (no such user exists)
    }

    await prisma.taskActivity.create({
      data: {
        userId: data.userId,
        taskId: data.taskId,
        action: data.action,
        timestamp: new Date(),
      },
    });

    taskLogger.debug({ taskId: data.taskId, action: data.action }, 'activity created');
  } catch (error) {
    // Make activity logging non-blocking (don't fail the request if logging fails)
    taskLogger.warn({ err: error, taskId: data.taskId, action: data.action }, 'failed to create activity (non-fatal)');
    // Don't throw - activity logging is optional, shouldn't break task operations
  }
}

/**
 * Get activity summary for dashboard with optimized aggregations
 */
export async function getActivitySummary(
  dateRange: string = '7d',
  user: TokenPayload
): Promise<{
  totalActivities: number;
  actionBreakdown: Record<string, number>;
  topUsers: Array<{ userId: string; userName: string; count: number }>;
  recentActivities: OptimizedTaskActivity[];
}> {
  taskLogger.debug('getting activity summary');
  const startTime = Date.now();
  
  try {
    const dateFilter = buildDateFilter(dateRange);
    const where: any = dateFilter ? { timestamp: { gte: dateFilter } } : {};

    // Use aggregation queries for summary data
    const [totalActivities, actionBreakdown, topUserData] = await Promise.all([
      prisma.taskActivity.count({ where }),
      
      prisma.taskActivity.groupBy({
        by: ['action'],
        where,
        _count: true,
      }),
      
      prisma.taskActivity.groupBy({
        by: ['userId'],
        where,
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 5,
      })
    ]);

    // Batch query user details for top users
    const topUserIds = topUserData.map(u => u.userId);
    const userMap = topUserIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: topUserIds } },
      select: { id: true, name: true }
    }).then(users => new Map(users.map(u => [u.id, u]))) : new Map();

    // Get recent activities using our optimized function
    const recentResult = await getTaskActivityHistory(
      { limit: 10, dateRange: dateRange as any },
      user
    );

    const queryTime = Date.now() - startTime;
    taskLogger.info({ queryTimeMs: queryTime, totalActivities }, 'activity summary complete');

    return {
      totalActivities,
      actionBreakdown: Object.fromEntries(
        actionBreakdown.map(item => [item.action, item._count])
      ),
      topUsers: topUserData.map(userData => {
        const user = userMap.get(userData.userId);
        return {
          userId: userData.userId,
          userName: user?.name || 'Unknown User',
          count: userData._count
        };
      }),
      recentActivities: recentResult.data
    };
  } catch (error) {
    taskLogger.error({ err: error }, 'failed to get activity summary');
    throw new Error('Failed to get activity summary');
  }
}

// Helper function to build date filters
function buildDateFilter(dateRange?: string): Date | null {
  if (!dateRange) return null;

  const now = new Date();
  switch (dateRange) {
    case '1d':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

// ============================================================================
// RICH ACTIVITY LOGGING (Phase 2.2 - 2025-12-31)
// Fire-and-forget pattern for activity logging with structured details
// ============================================================================

/**
 * Log activity with rich details - FIRE AND FORGET pattern
 *
 * Addresses CRITICAL-A2: Activity logging outside transactions
 * - Non-blocking: Caller doesn't await
 * - Non-critical: Failures logged but don't break main flow
 * - Validated: Zod validation on all writes
 *
 * NOTE: Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 * Optional prismaClient parameter allows dependency injection for testing.
 *
 * @param data - Activity data with typed action and optional details/metadata
 * @param prismaClient - Optional Prisma client (defaults to global singleton)
 */
export function logActivityWithDetails(
  data: ActivityLogInput,
  prismaClient: PrismaClient = prisma
): void {
  // Validate details before writing (Zod)
  const validatedDetails = data.details
    ? validateActivityDetails(data.details)
    : undefined;
  const validatedMetadata = data.metadata
    ? validateActivityMetadata(data.metadata)
    : undefined;

  // IMPORTANT-3: Add validation failure logging (per validation-engine-specialist)
  // Aids debugging without blocking operations
  if (data.details && !validatedDetails) {
    taskLogger.warn({ taskId: data.taskId, action: data.action }, 'invalid details provided, writing activity without details');
  }
  if (data.metadata && !validatedMetadata) {
    taskLogger.warn({ taskId: data.taskId, action: data.action }, 'invalid metadata provided, writing activity without metadata');
  }

  // FIRE AND FORGET - don't await, don't block caller
  // This addresses CRITICAL-A2: Activity logging in transactions
  prismaClient.taskActivity.create({
    data: {
      taskId: data.taskId,
      userId: data.userId,
      action: data.action,
      // Cast to Prisma.InputJsonValue for JSONB compatibility
      details: validatedDetails as Prisma.InputJsonValue | undefined,
      metadata: validatedMetadata as Prisma.InputJsonValue | undefined,
      timestamp: new Date(),
    },
  }).then(() => {
    taskLogger.debug({ taskId: data.taskId, action: data.action, hasDetails: !!validatedDetails }, 'activity logged');
  }).catch((error) => {
    // Log but don't throw - activity logging should never break main flow
    taskLogger.error({ err: error, taskId: data.taskId, action: data.action }, 'failed to log activity');
  });
}

/**
 * Log task assignment change
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logTaskAssignment(
  taskId: string,
  userId: string,
  assignee: { id: string; name: string },
  oldAssignee?: { id: string; name: string } | null,
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.ASSIGNED,
    details: {
      assigneeName: assignee.name,
      assigneeId: assignee.id,
      oldValue: oldAssignee?.name,
      newValue: assignee.name,
      fieldName: 'assignee',
    },
    metadata,
  }, prismaClient);
}

/**
 * Log task unassignment
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logTaskUnassignment(
  taskId: string,
  userId: string,
  previousAssignee: { id: string; name: string },
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.UNASSIGNED,
    details: {
      assigneeName: previousAssignee.name,
      assigneeId: previousAssignee.id,
      oldValue: previousAssignee.name,
      newValue: null,
      fieldName: 'assignee',
    },
    metadata,
  }, prismaClient);
}

/**
 * Log agent execution completion
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logAgentExecution(
  taskId: string,
  userId: string,
  execution: {
    agentName: string;
    executionId: string;
    // Use Prisma ExecutionStatus enum values (per parameter-normalizer review)
    status: 'PENDING' | 'READY' | 'RUNNING' | 'PENDING_REVIEW' |
            'REVIEW_APPROVED' | 'REVIEW_REJECTED' | 'SUCCESS' | 'FAILED';
  },
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.AGENT_EXECUTED,
    details: {
      agentName: execution.agentName,
      executionId: execution.executionId,
      executionStatus: execution.status,
    },
    metadata: metadata || { source: 'AGENT' },
  }, prismaClient);
}

/**
 * Log attachment added to task
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logAttachmentAdded(
  taskId: string,
  userId: string,
  attachment: {
    id: string;
    filename: string;
    fileSize: number;
    fileType: string;
  },
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.ATTACHMENT_ADDED,
    details: {
      attachmentName: attachment.filename,
      attachmentId: attachment.id,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
    },
    metadata,
  }, prismaClient);
}

/**
 * Log attachment removed from task
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logAttachmentRemoved(
  taskId: string,
  userId: string,
  attachment: {
    id: string;
    filename: string;
  },
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.ATTACHMENT_REMOVED,
    details: {
      attachmentName: attachment.filename,
      attachmentId: attachment.id,
    },
    metadata,
  }, prismaClient);
}

/**
 * Log comment added to task
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logCommentAdded(
  taskId: string,
  userId: string,
  comment: string,
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.COMMENT_ADDED,
    details: {
      comment: comment.substring(0, 5000), // Match Zod limit
    },
    metadata,
  }, prismaClient);
}

/**
 * Log generic field change (status, priority, due date, etc.)
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logFieldChange(
  taskId: string,
  userId: string,
  field: {
    name: string;
    oldValue: unknown;
    newValue: unknown;
    action: TaskActivityActionType;
  },
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: field.action,
    details: {
      fieldName: field.name,
      oldValue: field.oldValue,
      newValue: field.newValue,
    },
    metadata,
  }, prismaClient);
}

/**
 * Log stage change (Kanban drag-and-drop)
 * IMPORTANT-P1: Stage changes are high-frequency (per phase-stage-specialist)
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logStageChange(
  taskId: string,
  userId: string,
  change: {
    oldStageId?: string;
    oldStageName?: string;
    newStageId: string;
    newStageName: string;
  },
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.STAGE_CHANGED,
    details: {
      fieldName: 'stage',
      oldValue: change.oldStageId,
      newValue: change.newStageId,
      oldStageName: change.oldStageName,
      newStageName: change.newStageName,
    },
    metadata,
  }, prismaClient);
}

/**
 * Log phase change with name resolution
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logPhaseChange(
  taskId: string,
  userId: string,
  change: {
    oldPhaseId?: string;
    oldPhaseName?: string;
    newPhaseId: string;
    newPhaseName: string;
  },
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.PHASE_CHANGED,
    details: {
      fieldName: 'phase',
      oldValue: change.oldPhaseId,
      newValue: change.newPhaseId,
      oldPhaseName: change.oldPhaseName,
      newPhaseName: change.newPhaseName,
    },
    metadata,
  }, prismaClient);
}

/**
 * Log task creation
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logTaskCreated(
  taskId: string,
  userId: string,
  taskTitle?: string,
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.CREATED,
    details: taskTitle ? { newValue: taskTitle } : undefined,
    metadata,
  }, prismaClient);
}

/**
 * Log task completion
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logTaskCompleted(
  taskId: string,
  userId: string,
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.COMPLETED,
    details: {
      fieldName: 'status',
      newValue: 'COMPLETED',
    },
    metadata,
  }, prismaClient);
}

/**
 * Log task reopened
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 */
export function logTaskReopened(
  taskId: string,
  userId: string,
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.REOPENED,
    details: {
      fieldName: 'status',
      newValue: 'OPEN',
    },
    metadata,
  }, prismaClient);
}

/**
 * Log workflow execution on a task
 * Added: 2026-01-05 (MCPServiceOrchestrationHandler support)
 * Uses global Prisma singleton by default (per global-prisma-singleton-pattern.md)
 *
 * @param taskId - The task ID the workflow executed on
 * @param userId - The user who triggered the workflow
 * @param workflow - Workflow execution details
 * @param metadata - Optional request metadata
 * @param prismaClient - Optional Prisma client (defaults to global singleton)
 */
export function logWorkflowExecution(
  taskId: string,
  userId: string,
  workflow: {
    workflowId: string;
    workflowType: string;
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
    stepCount?: number;
    executionTime?: number;
  },
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logActivityWithDetails({
    taskId,
    userId,
    action: TaskActivityAction.WORKFLOW_EXECUTED,
    details: {
      workflowId: workflow.workflowId,
      workflowType: workflow.workflowType,
      workflowStatus: workflow.status,
      workflowStepCount: workflow.stepCount,
      workflowExecutionTime: workflow.executionTime,
    },
    metadata: metadata || { source: 'SYSTEM' },
  }, prismaClient);
}

// Re-export types for convenience
export { TaskActivityAction, type TaskActivityActionType } from '@/lib/types/activity';
export type { ActivityDetails, ActivityMetadata } from '@/lib/types/activity';