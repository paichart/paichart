import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { TaskBulkService } from '@/lib/services/taskBulkService';
import { BulkMoveTasksSchema } from '@/lib/validation/task-validation';
import { taskLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// POST /api/tasks/bulk/move - Bulk task movement between phases
const bulkMoveTasksHandler: ApiHandler = async (
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

    // ✅ SECURITY: Validate bulk move request (P0-3 CRITICAL - DoS protection)
    const validation = BulkMoveTasksSchema.safeParse(body);
    if (!validation.success) {
      // Security logging for monitoring attack attempts
      taskLogger.warn({ endpoint: 'POST /api/tasks/bulk/move', userId: user?.userId, errors: validation.error.issues, taskCount: body.taskIds?.length || 0 }, 'Bulk move validation failed');

      return {
        error: {
          message: 'Validation failed: ' + validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          code: 'VALIDATION_ERROR',
        },
      };
    }

    const { taskIds, targetPhaseId, targetStageId, options } = validation.data;

    // ✅ SECURITY: Validate user has POV access for every task being moved
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
            validatePOVAccess(user, pov, { throwOnDeny: true, requireWrite: true, logContext: 'Bulk Move Tasks' });
          } catch {
            taskLogger.warn({ userId: user.userId, povId: pov.id }, 'Bulk move POV access denied');
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

    // Ensure at least one target is provided (schema already validates this)
    const finalTargetPhaseId = targetPhaseId || undefined;
    const finalTargetStageId = targetStageId || undefined;

    // Validate target phase exists if provided
    const targetPhase = await import('@/lib/prisma').then(({ prisma }) =>
      prisma.phase.findUnique({
        where: { id: targetPhaseId },
        include: {
          pov: {
            select: { id: true, title: true, status: true }
          }
        }
      })
    );

    if (!targetPhase) {
      return {
        error: {
          message: 'Target phase not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // Validate tasks belong to the same POV as target phase (optional check)
    if (options?.validatePovConsistency !== false) {
      const { prisma } = await import('@/lib/prisma');
      const tasks = await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, povId: true }
      });

      const invalidTasks = tasks.filter(task => 
        task.povId && task.povId !== targetPhase.pov?.id
      );

      if (invalidTasks.length > 0) {
        return {
          error: {
            message: `${invalidTasks.length} tasks belong to different POVs and cannot be moved to this phase`,
            code: 'POV_MISMATCH',
            details: {
              invalidTaskIds: invalidTasks.map(t => t.id),
              targetPovId: targetPhase.pov?.id
            }
          },
        };
      }
    }

    // Process bulk move
    const result = await TaskBulkService.bulkMoveTasks({
      taskIds,
      targetPhaseId: finalTargetPhaseId!,
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

    // Add target phase information to the result
    const enhancedResult = {
      ...result,
      targetPhase: {
        id: targetPhase.id,
        name: targetPhase.name,
        type: targetPhase.type,
        pov: targetPhase.pov
      }
    };

    return {
      data: enhancedResult
    };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'POST /api/tasks/bulk/move' }, 'Failed to perform bulk task move');
    return {
      error: {
        message: 'Failed to perform bulk task move',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// BC44 FIX: Add rate limiting (consistent with bulk assign which has bulkOperationLimiter)
export const POST = createHandler(bulkMoveTasksHandler, { requireAuth: true, rateLimit: 'write' });
