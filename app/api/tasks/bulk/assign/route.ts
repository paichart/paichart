import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { TaskBulkService } from '@/lib/services/taskBulkService';
import { BulkAssignTasksSchema } from '@/lib/validation/task-validation';
import { bulkOperationLimiter } from '@/lib/utils/rate-limiter';
import { taskLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// POST /api/tasks/bulk/assign - Bulk task assignment
const bulkAssignTasksHandler: ApiHandler = async (
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

    // ✅ SECURITY: Validate bulk assign request (P0-3 CRITICAL - DoS protection)
    const validation = BulkAssignTasksSchema.safeParse(body);
    if (!validation.success) {
      // Security logging for monitoring attack attempts
      taskLogger.warn({ endpoint: 'POST /api/tasks/bulk/assign', userId: user?.userId, errors: validation.error.issues, taskCount: body.taskIds?.length || 0 }, 'Bulk assign validation failed');

      return {
        error: {
          message: 'Validation failed: ' + validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          code: 'VALIDATION_ERROR',
        },
      };
    }

    const { taskIds, assigneeId, teamId, options } = validation.data;

    // ✅ SECURITY (2026-05-26 demo-write fix): validate POV access (WRITE) for every
    // task being assigned. Pre-existing IDOR — bulkAssignTasks checked task existence
    // only (no ownership/team/role), unlike sibling bulk/update + bulk/move. Mirror
    // their loop; requireWrite:true ⇒ a demo user's isDemo flag does NOT grant.
    {
      const { prisma } = await import('@/lib/prisma');
      const { validatePOVAccess } = await import('@/lib/auth/validate-pov-access');

      const tasks = await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, povId: true }
      });
      const uniquePovIds = [...new Set(tasks.map(t => t.povId).filter(Boolean))] as string[];

      if (uniquePovIds.length > 0) {
        const povs = await prisma.pOV.findMany({
          where: { id: { in: uniquePovIds } },
          include: { team: { include: { members: true } } }
        });
        for (const pov of povs) {
          try {
            validatePOVAccess(user, pov, { throwOnDeny: true, requireWrite: true, logContext: 'Bulk Assign Tasks' });
          } catch {
            taskLogger.warn({ userId: user.userId, povId: pov.id }, 'Bulk assign POV access denied');
            return {
              error: {
                message: 'Access denied: insufficient permissions for one or more tasks',
                code: 'FORBIDDEN',
              },
            };
          }
        }
      }
    }

    // Validate assignee exists if provided
    if (assigneeId) {
      const assignee = await import('@/lib/prisma').then(({ prisma }) =>
        prisma.user.findUnique({
          where: { id: assigneeId },
          select: { id: true, name: true, email: true }
        })
      );

      if (!assignee) {
        return {
          error: {
            message: 'Assignee not found',
            code: 'NOT_FOUND',
          },
        };
      }
    }

    // Validate team exists if provided
    if (teamId) {
      const team = await import('@/lib/prisma').then(({ prisma }) =>
        prisma.team.findUnique({
          where: { id: teamId },
          select: { id: true, name: true }
        })
      );

      if (!team) {
        return {
          error: {
            message: 'Team not found',
            code: 'NOT_FOUND',
          },
        };
      }
    }

    // Process bulk assignment
    const result = await TaskBulkService.bulkAssignTasks({
      taskIds,
      assigneeId,
      teamId,
      options: {
        validatePermissions: options?.validatePermissions !== false,
        skipValidation: options?.skipValidation === true,
        continueOnError: options?.continueOnError === true,
        logActivity: options?.logActivity !== false,
        batchSize: options?.batchSize || 50,
        ...options
      },
      userId: user.userId
    });

    return {
      data: result
    };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'POST /api/tasks/bulk/assign' }, 'Failed to perform bulk task assignment');
    return {
      error: {
        message: 'Failed to perform bulk task assignment',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const POST = createHandler(bulkAssignTasksHandler, { requireAuth: true, rateLimit: bulkOperationLimiter });
