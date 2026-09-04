import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { logActivityWithDetails, TaskActivityAction } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { safeRecord } from '@/lib/validation/zod-helpers';
import { getPOVFromTask } from '@/lib/utils/pov-helpers';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { taskLogger } from '@/lib/logger';

// 2026-05-14 P1: schema preserves the existing permissive `action` shape
// (downstream actionTypeMap accepts lowercase forms and falls back to
// UPDATED for unknown values — UX choice) but adds bounds on the string,
// runs stripDangerousKeys on details (BC27 defense-in-depth), and locks
// out arbitrary jsonb payloads via safeRecord().
const CreateTaskActivityWithDetailsSchema = z.object({
  action: z.string().min(1, 'Action is required').max(100, 'Action too long'),
  metadata: safeRecord().optional(),
  details: safeRecord().optional(),
});

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/[taskId]/activities - Retrieve task activities with filtering
const getActivitiesHandler: ApiHandler = async (
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

    // 2026-05-27: POV-access gate (IDOR fix — un-fixed sibling of the /summary fix in
    // c626986b). GET was requireAuth-only, leaking ANY task's activity history + the
    // acting users' names/emails to any authed viewer (incl. DEMO via token replay).
    // Mirror the POST handler's check, read-only variant (NOT_FOUND on deny — don't
    // reveal the task exists).
    const pov = await getPOVFromTask(taskId);
    if (pov) {
      const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
      const hasAccess = validatePOVAccess(user, pov, { throwOnDeny: false, logContext: 'TaskActivity List (taskId path)' });
      if (!hasAccess && !isAdmin) {
        return { error: { message: 'Task not found', code: 'NOT_FOUND' } };
      }
    }

    const { searchParams } = new URL(req.url);
    
    // Parse query parameters
    const limit = parseInt(searchParams.get('limit') || '50', 10) || 50;
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where clause
    const where: any = { taskId };
    
    if (action) {
      where.action = { contains: action, mode: 'insensitive' };
    }
    
    if (userId) {
      where.userId = userId;
    }
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate);
      }
    }

    // Get activities with user information
    const activities = await prisma.taskActivity.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 100), // Cap at 100
      skip: offset,
    });

    // Get total count for pagination
    const totalCount = await prisma.taskActivity.count({ where });

    return {
      data: {
        activities,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + activities.length < totalCount,
        }
      }
    };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'GET /api/tasks/[taskId]/activities' }, 'Failed to retrieve task activities');
    return {
      error: {
        message: 'Failed to retrieve task activities',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// POST /api/tasks/[taskId]/activities - Manual activity logging
const createActivityHandler: ApiHandler = async (
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

    // 2026-05-14 P1: schema validation (sec-ops F-02 + api-efficiency #9).
    const validation = CreateTaskActivityWithDetailsSchema.safeParse(body);
    if (!validation.success) {
      return {
        error: {
          message: 'Validation failed: ' + validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          code: 'VALIDATION_ERROR',
        },
      };
    }
    const { action } = validation.data;
    const details = validation.data.details || {};

    // 2026-05-14 P1: POV access check (sec-ops F-02 IDOR). Same gap as
    // the sibling /api/tasks/activities POST endpoint — any auth'd user
    // could write fake activity rows against any taskId.
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
      validatePOVAccess(user, pov, { throwOnDeny: true, requireWrite: true, logContext: 'TaskActivity Create (taskId path)' });
    } catch (err: any) {
      return {
        error: {
          message: err.message || 'Access denied',
          code: 'FORBIDDEN',
        },
      };
    }

    // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
    const apiMetadata: ActivityMetadata = { source: 'API' };

    // Map action string to TaskActivityAction if possible, else use UPDATED
    const actionTypeMap: Record<string, string> = {
      'status_changed': TaskActivityAction.STATUS_CHANGED,
      'priority_changed': TaskActivityAction.PRIORITY_CHANGED,
      'assigned': TaskActivityAction.ASSIGNED,
      'unassigned': TaskActivityAction.UNASSIGNED,
      'commented': TaskActivityAction.COMMENT_ADDED,
      'created': TaskActivityAction.CREATED,
      'completed': TaskActivityAction.COMPLETED,
      'reopened': TaskActivityAction.REOPENED,
    };

    const actionType = actionTypeMap[action.toLowerCase()] || TaskActivityAction.UPDATED;

    // Create activity with rich details
    const activity = await prisma.taskActivity.create({
      data: {
        taskId,
        userId: user.userId,
        action: actionType,
        details: Object.keys(details).length > 0 ? details : undefined,
        timestamp: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      }
    });

    taskLogger.info({ taskId, actionType }, 'Rich activity created via API');

    return { data: activity };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'POST /api/tasks/[taskId]/activities' }, 'Failed to create task activity');
    return {
      error: {
        message: 'Failed to create task activity',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getActivitiesHandler, { requireAuth: true });
export const POST = createHandler(createActivityHandler, { requireAuth: true });
