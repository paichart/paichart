import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { getTaskActivityHistory, getActivitySummary } from '@/lib/tasks/services/taskActivityService';
import { TaskActivityActionSchema } from '@/lib/validation/activity-validation';
import { getPOVFromTask } from '@/lib/utils/pov-helpers';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { taskLogger } from '@/lib/logger';

// 2026-05-14 P1: schema closes two gaps simultaneously —
// (a) action is now a strict enum (was unbounded string),
// (b) taskId is now CUID-validated (was truthy check).
// POV-access check below closes the IDOR gap separately (caller could
// previously write a TaskActivity for any taskId they could enumerate).
const CreateTaskActivitySchema = z.object({
  taskId: z.string().cuid('Invalid task ID format'),
  action: TaskActivityActionSchema,
});

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/activities - Optimized task activity retrieval
const getTaskActivitiesHandler: ApiHandler = async (
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
    taskLogger.debug({ userId: user.userId }, 'task activities request started');
    const { searchParams } = new URL(req.url);
    
    // Check for summary mode
    const summary = searchParams.get('summary');
    if (summary === 'true') {
      const dateRange = searchParams.get('dateRange') || '7d';
      const result = await getActivitySummary(dateRange, user);
      
      taskLogger.info({ totalActivities: result.totalActivities, dateRange }, 'activity summary completed');
      
      return { data: result };
    }

    // Parse comprehensive activity filters
    const filters = {
      taskId: searchParams.get('taskId') || undefined,
      userId: searchParams.get('userId') || undefined,
      action: searchParams.get('action') || undefined,
      povId: searchParams.get('povId') || undefined,  // Filter by POV
      dateRange: searchParams.get('dateRange') as '1d' | '7d' | '30d' | '90d' || '7d',
      limit: Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200),
      offset: Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0),
    };

    taskLogger.debug({ dateRange: filters.dateRange, limit: filters.limit, offset: filters.offset }, 'task activity filters');

    // Execute optimized activity query
    const result = await getTaskActivityHistory(filters, user);
    
    taskLogger.info({ resultCount: result.data.length, total: result.total }, 'task activities retrieved');

    return {
      data: result.data,
      pagination: result.pagination,
      total: result.total
    };

  } catch (error) {
    taskLogger.error({ err: error }, 'failed to retrieve task activities');
    return {
      error: {
        message: 'Failed to retrieve task activities',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getTaskActivitiesHandler, { requireAuth: true });

// POST /api/tasks/activities - Create task activity (for manual activity logging)
const postTaskActivityHandler: ApiHandler = async (
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
    const body = await req.json();

    // 2026-05-14 P1: schema validation (sec-ops F-02 + api-efficiency #9 +
    // validation-engine missing-schema-application).
    const validation = CreateTaskActivitySchema.safeParse(body);
    if (!validation.success) {
      return {
        error: {
          message: 'Validation failed: ' + validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          code: 'VALIDATION_ERROR',
        },
      };
    }
    const { taskId, action } = validation.data;

    taskLogger.info({ taskId, action, userId: user.userId }, 'creating manual task activity');

    // 2026-05-14 P1: POV access check (sec-ops F-02 IDOR). Without this,
    // any authenticated user could write fake TaskActivity rows against
    // any taskId they could enumerate — audit-log trust erosion.
    const pov = await getPOVFromTask(taskId);
    if (!pov) {
      return {
        error: {
          message: 'Task not found',
          code: 'NOT_FOUND',
        },
      };
    }
    try {
      validatePOVAccess(user, pov, { throwOnDeny: true, requireWrite: true, logContext: 'TaskActivity Create' });
    } catch (err: any) {
      return {
        error: {
          message: err.message || 'Access denied',
          code: 'FORBIDDEN',
        },
      };
    }

    // Use optimized service to create activity
    const { createTaskActivity } = await import('@/lib/tasks/services/taskActivityService');
    await createTaskActivity({
      userId: user.userId,
      taskId,
      action,
    });

    taskLogger.info({ taskId, userId: user.userId }, 'manual task activity created');

    return {
      data: {
        message: 'Task activity created successfully',
        taskId,
        action,
        userId: user.userId
      }
    };

  } catch (error) {
    taskLogger.error({ err: error }, 'failed to create task activity');
    return {
      error: {
        message: 'Failed to create task activity',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const POST = createHandler(postTaskActivityHandler, { requireAuth: true });