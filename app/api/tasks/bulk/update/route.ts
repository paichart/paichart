import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { BulkUpdateTasksSchema } from '@/lib/validation/task-validation';
import { taskLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// POST /api/tasks/bulk/update - Bulk task updates with validation
const bulkUpdateTasksHandler: ApiHandler = async (
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

    // ✅ SECURITY: Validate bulk update request (P0-3 CRITICAL - DoS protection)
    const validation = BulkUpdateTasksSchema.safeParse(body);
    if (!validation.success) {
      // Security logging for monitoring attack attempts
      taskLogger.warn({ endpoint: 'POST /api/tasks/bulk/update', userId: user?.userId, errors: validation.error.issues, taskCount: body.taskIds?.length || 0 }, 'Bulk update validation failed');

      return {
        error: {
          message: 'Validation failed: ' + validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          code: 'VALIDATION_ERROR',
        },
      };
    }

    const { taskIds, updates, options } = validation.data;

    // ✅ SECURITY: Validate user has POV access for every task being updated
    {
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
            validatePOVAccess(user, pov, { throwOnDeny: true, requireWrite: true, logContext: 'Bulk Update Tasks' });
          } catch {
            taskLogger.warn({ userId: user.userId, povId: pov.id }, 'Bulk update POV access denied');
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

    // Import bulk service
    const { TaskBulkService } = await import('@/lib/services/taskBulkService');

    // Process bulk update
    const result = await TaskBulkService.bulkUpdateTasks({
      taskIds,
      updates,
      options: {
        validatePermissions: options?.validatePermissions !== false,
        skipValidation: options?.skipValidation === true,
        continueOnError: options?.continueOnError === true,
        logActivity: options?.logActivity !== false,
        ...options
      },
      userId: user.userId
    });

    return {
      data: result
    };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'POST /api/tasks/bulk/update' }, 'Failed to perform bulk task update');
    return {
      error: {
        message: 'Failed to perform bulk task update',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// BC44 FIX: Add rate limiting (consistent with bulk assign which has bulkOperationLimiter)
export const POST = createHandler(bulkUpdateTasksHandler, { requireAuth: true, rateLimit: 'write' });
