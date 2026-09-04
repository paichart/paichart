import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { taskLogger } from '@/lib/logger';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { EnhancedTaskService } from '@/lib/services/taskService';
import { TaskService } from '@/lib/tasks/services/task';
import { UpdateTaskSchema } from '@/lib/validation/task-validation';
import { getTaskWithPOV } from '@/lib/tasks/helpers/pov-access';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { DependencyNotSatisfiedError, PipelineInvariantError, InvalidTransitionError } from '@/lib/errors';
import { taskListCache } from '@/lib/tasks/handlers/get';
import {
  logFieldChange,
  logTaskAssignment,
  logTaskUnassignment,
  TaskActivityAction,
} from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/[taskId] - Enhanced task retrieval with activity summary
const getTaskHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    const { taskId } = context.params;
    const { searchParams } = new URL(req.url);

    // ✅ SECURITY: POV access validation (prevent cross-tenant data leakage)
    const taskWithPOV = await getTaskWithPOV(taskId);

    if (!taskWithPOV || !taskWithPOV.pov) {
      return {
        error: {
          message: 'Task not found',
          code: 'NOT_FOUND',
        },
      };
    }

    try {
      validatePOVAccess(user, taskWithPOV.pov, { throwOnDeny: true });
    } catch (error: any) {
      return {
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
        },
      };
    }

    // Parse query parameters for enhanced features
    const includeActivity = searchParams.get('includeActivity') === 'true';
    const includeWorkflow = searchParams.get('includeWorkflow') === 'true';
    const includeDependencies = searchParams.get('includeDependencies') === 'true';
    const includeAnalytics = searchParams.get('includeAnalytics') === 'true';

    // 🔧 ACTIVITY: Always check for activity inclusion first
    if (includeActivity) {
      // Use standard service for basic task retrieval
      const task = await TaskService.getTask(taskId);

      if (!task) {
        return {
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        };
      }

      // Add activities to the task
      const activities = await getTaskActivities(taskId);
      taskLogger.debug({ taskId, activityCount: activities.length }, 'fetched activities for task response');

      const taskWithActivities = {
        ...task,
        activities: activities
      };

      return { data: taskWithActivities };
    }

    // Use enhanced service if any enhanced features are requested
    if (includeWorkflow || includeDependencies || includeAnalytics) {
      const task = await EnhancedTaskService.getEnhancedTask(taskId, {
        includeActivity,
        includeWorkflow,
        includeDependencies,
        includeAnalytics,
      });

      if (!task) {
        return {
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        };
      }

      return { data: task };
    } else {
      // Use standard service for basic task retrieval
      const task = await TaskService.getTask(taskId);

      if (!task) {
        return {
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        };
      }

      return { data: task };
    }
  } catch (error) {
    taskLogger.error({ err: error }, 'GET /api/tasks/[taskId] failed');
    return {
      error: {
        message: 'Failed to retrieve task',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// 🔧 ACTIVITY: Helper function to fetch task activities
async function getTaskActivities(taskId: string) {
  const { prisma } = await import('@/lib/prisma');
  
  try {
    // Get last 5 activities (removed 30-day limit to show historical POV data)
    const activities = await prisma.taskActivity.findMany({
      where: {
        taskId: taskId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 5
    });

    taskLogger.debug({ taskId, count: activities.length }, 'fetched task activities');

    // Format activities for frontend consumption
    const formattedActivities = activities.map(activity => ({
      id: activity.id,
      action: activity.action,
      timestamp: activity.timestamp.toISOString(),
      details: activity.details, // field-change old/new values for "old → new" rendering
      user: {
        id: activity.user.id,
        name: activity.user.name,
        email: activity.user.email
      }
    }));

    return formattedActivities;
  } catch (error) {
    taskLogger.error({ err: error, taskId }, 'failed to fetch task activities');
    return [];
  }
}

// PUT /api/tasks/[taskId] - Enhanced task updates with activity logging
const updateTaskHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    const { taskId } = context.params;
    const body = await req.json();
    const { searchParams } = new URL(req.url);

    // ✅ ENHANCEMENT: POV access validation (Week 3 - cross-tenant protection)
    const task = await getTaskWithPOV(taskId);

    if (!task || !task.pov) {
      return {
        error: {
          message: 'Task not found',
          code: 'NOT_FOUND',
        },
      };
    }

    try {
      validatePOVAccess(user, task.pov, { throwOnDeny: true, requireWrite: true });  // 2026-05-26 demo-write fix (PUT + DELETE)
    } catch (error: any) {
      return {
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
        },
      };
    }

    // ✅ ENHANCEMENT: Zod validation with safeParse (P1 fix - proper error handling)
    const result = UpdateTaskSchema.safeParse(body);

    if (!result.success) {
      return {
        error: {
          message: 'Validation failed',
          code: 'INVALID_REQUEST',
          details: result.error.errors
        },
      };
    }

    const validated = result.data;

    // Check if enhanced features are requested
    const useEnhanced = searchParams.get('enhanced') === 'true';

    // 🔧 ACTIVITY: Check if activity logging is requested
    // BC29 FIX: Use validated data instead of raw body for service calls
    const logActivity = body.logActivity === true;
    const previousValues = body.previousValues || {};

    if (useEnhanced) {
      const task = await EnhancedTaskService.updateTaskWithActivity(
        taskId,
        validated as any,
        user.userId
      );

      taskListCache.invalidatePattern('tasks');  // task changed → flush stale list reads
      return { data: task };
    } else {
      // Use standard service for basic task updates
      const task = await TaskService.updateTask(taskId, validated as any, user.userId);

      if (!task) {
        return {
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        };
      }

      // 🔧 ACTIVITY: Log activities if requested
      if (logActivity && previousValues) {
        await logTaskActivities(taskId, body, previousValues, user.userId);
      }

      taskListCache.invalidatePattern('tasks');  // task changed → flush stale list reads
      return { data: task };
    }
  } catch (error) {
    taskLogger.error({ err: error }, 'PUT /api/tasks/[taskId] failed');

    // 2.14 (completion-path P2): typed guard errors are structured 4xx FACTS, never a 500
    // (createHandler maps non-auth codes → 400).
    if (error instanceof DependencyNotSatisfiedError) {
      return { error: { message: error.message, code: 'DEPENDENCY_NOT_SATISFIED' } };
    }
    if (error instanceof PipelineInvariantError) {
      return { error: { message: error.message, code: 'PIPELINE_INVARIANT' } };
    }

    if (error instanceof Error) {
      if (error.message === 'Task not found') {
        return {
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        };
      }
      if (error instanceof InvalidTransitionError) {
        return { error: { message: error.message, code: 'INVALID_STATUS_TRANSITION' } };
      }
    }

    return {
      error: {
        message: 'Failed to update task',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
// Fire-and-forget pattern - logs each field change with structured details
async function logTaskActivities(
  taskId: string,
  newValues: any,
  previousValues: any,
  userId: string
) {
  const { prisma } = await import('@/lib/prisma');
  const metadata: ActivityMetadata = { source: 'API' };
  let changeCount = 0;

  // Check for assignee changes
  if (newValues.assigneeId !== previousValues.assigneeId) {
    if (!previousValues.assigneeId && newValues.assigneeId) {
      // Task was assigned
      const assignee = await prisma.user.findUnique({
        where: { id: newValues.assigneeId },
        select: { id: true, name: true }
      });
      if (assignee) {
        logTaskAssignment(taskId, userId, { id: assignee.id, name: assignee.name }, null, metadata);
        changeCount++;
      }
    } else if (previousValues.assigneeId && !newValues.assigneeId) {
      // Task was unassigned
      const prevAssignee = await prisma.user.findUnique({
        where: { id: previousValues.assigneeId },
        select: { id: true, name: true }
      });
      if (prevAssignee) {
        logTaskUnassignment(
          taskId,
          userId,
          { id: prevAssignee.id, name: prevAssignee.name },
          metadata
        );
        changeCount++;
      }
    } else if (previousValues.assigneeId && newValues.assigneeId) {
      // Assignee changed (reassignment)
      const [prevAssignee, newAssignee] = await Promise.all([
        prisma.user.findUnique({ where: { id: previousValues.assigneeId }, select: { id: true, name: true } }),
        prisma.user.findUnique({ where: { id: newValues.assigneeId }, select: { id: true, name: true } })
      ]);
      if (newAssignee) {
        logTaskAssignment(
          taskId,
          userId,
          { id: newAssignee.id, name: newAssignee.name },
          prevAssignee ? { id: prevAssignee.id, name: prevAssignee.name } : null,
          metadata
        );
        changeCount++;
      }
    }
  }

  // Check for status changes
  if (newValues.status !== previousValues.status) {
    logFieldChange(taskId, userId, {
      name: 'status',
      oldValue: previousValues.status,
      newValue: newValues.status,
      action: TaskActivityAction.STATUS_CHANGED,
    }, metadata);
    changeCount++;
  }

  // Check for priority changes
  if (newValues.priority !== previousValues.priority) {
    logFieldChange(taskId, userId, {
      name: 'priority',
      oldValue: previousValues.priority,
      newValue: newValues.priority,
      action: TaskActivityAction.PRIORITY_CHANGED,
    }, metadata);
    changeCount++;
  }

  // Check for due date changes
  if (newValues.dueDate !== previousValues.dueDate) {
    logFieldChange(taskId, userId, {
      name: 'dueDate',
      oldValue: previousValues.dueDate,
      newValue: newValues.dueDate,
      action: TaskActivityAction.DUE_DATE_CHANGED,
    }, metadata);
    changeCount++;
  }

  // Check for title changes
  if (newValues.title !== previousValues.title) {
    logFieldChange(taskId, userId, {
      name: 'title',
      oldValue: previousValues.title,
      newValue: newValues.title,
      action: TaskActivityAction.UPDATED,
    }, metadata);
    changeCount++;
  }

  // Check for description changes
  if (newValues.description !== previousValues.description) {
    logFieldChange(taskId, userId, {
      name: 'description',
      oldValue: previousValues.description ? '(previous content)' : null,
      newValue: newValues.description ? '(updated content)' : null,
      action: TaskActivityAction.UPDATED,
    }, metadata);
    changeCount++;
  }

  if (changeCount > 0) {
    taskLogger.debug({ taskId, changeCount }, 'rich activity logged for field changes');
  }
}

// DELETE /api/tasks/[taskId] - Task deletion with cascade handling
const deleteTaskHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    const { taskId } = context.params;

    // ✅ ENHANCEMENT: POV access validation (Week 3 - cross-tenant protection)
    const task = await getTaskWithPOV(taskId);

    if (!task || !task.pov) {
      return {
        error: {
          message: 'Task not found',
          code: 'NOT_FOUND',
        },
      };
    }

    try {
      validatePOVAccess(user, task.pov, { throwOnDeny: true, requireWrite: true });  // 2026-05-26 demo-write fix (PUT + DELETE)
    } catch (error: any) {
      return {
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
        },
      };
    }

    // Delete the task (cascade will handle dependencies)
    await TaskService.deleteTask(taskId);

    taskListCache.invalidatePattern('tasks');  // task deleted → flush stale list reads

    return {
      data: { 
        message: 'Task deleted successfully',
        taskId 
      } 
    };
  } catch (error) {
    taskLogger.error({ err: error }, 'DELETE /api/tasks/[taskId] failed');
    return {
      error: {
        message: 'Failed to delete task',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getTaskHandler, { requireAuth: true });
export const PUT = createHandler(updateTaskHandler, { requireAuth: true });
export const DELETE = createHandler(deleteTaskHandler, { requireAuth: true });
