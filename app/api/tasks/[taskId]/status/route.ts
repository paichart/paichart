import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { UpdateTaskStatusSchema } from '@/lib/validation/task-validation';
import { getTaskWithPOV } from '@/lib/tasks/helpers/pov-access';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { createErrorResponse, createSuccessResponse } from '@/lib/api/error-handler';
import { TaskService } from '@/lib/tasks/services/task';
import { TaskStatus } from '@/lib/tasks/types/index';
import { trackActivity } from '@/lib/auth/audit';
import { taskLogger } from '@/lib/logger';
import { DependencyNotSatisfiedError, PipelineInvariantError, InvalidTransitionError } from '@/lib/errors';

// PATCH /api/tasks/[taskId]/status - Update task status
export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // ✅ 1. Authentication
    const user = await getAuthUser(req);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // ✅ 2. POV Access Validation (Week 3 - cross-tenant protection)
    const task = await getTaskWithPOV(params.taskId);

    if (!task || !task.pov) {
      return createErrorResponse('NOT_FOUND', 'Task not found');
    }

    try {
      validatePOVAccess(user, task.pov, { throwOnDeny: true, requireWrite: true });  // 2026-05-26 demo-write fix
    } catch (error: any) {
      return createErrorResponse('FORBIDDEN', 'Access denied');
    }

    // ✅ 3. Zod Validation with safeParse (P1 fix - proper error handling)
    const data = await req.json();
    const result = UpdateTaskStatusSchema.safeParse(data);

    if (!result.success) {
      return NextResponse.json({
        error: {
          message: 'Validation failed',
          code: 'INVALID_REQUEST',
          details: result.error.errors
        },
      }, { status: 400 });
    }

    const validated = result.data;

    // ✅ 4. Business Logic - Update status (with transition validation + the shared terminal
    // guards, P1-C2). Typed guard errors map to structured 4xx FACTS the GUI can render —
    // a legitimate "blocked by plan gate" must never read as a 500 (Protocol 10).
    let updated;
    try {
      updated = await TaskService.updateTask(params.taskId, {
        status: validated.status as TaskStatus
      }, user.userId);
    } catch (error: any) {
      if (error instanceof DependencyNotSatisfiedError) {
        return NextResponse.json({
          error: {
            message: error.message,
            code: 'DEPENDENCY_NOT_SATISFIED',
            unsatisfied: error.unsatisfied,
          },
        }, { status: 409 });
      }
      if (error instanceof PipelineInvariantError) {
        return NextResponse.json({
          error: {
            message: error.message,
            code: 'PIPELINE_INVARIANT',
            point: error.point,
          },
        }, { status: 409 });
      }
      if (error instanceof InvalidTransitionError) {
        return NextResponse.json({
          error: {
            message: error.message,
            code: 'INVALID_STATUS_TRANSITION',
          },
        }, { status: 400 });
      }
      throw error;
    }

    // ✅ Audit logging
    await trackActivity(
      user.userId,
      'TASK',
      'UPDATE_STATUS',
      {
        taskId: params.taskId,
        oldStatus: task.status,
        newStatus: validated.status,
        blockReason: validated.blockReason,
        success: true
      }
    );

    taskLogger.info({ taskId: params.taskId, oldStatus: task.status, newStatus: validated.status }, 'Task status updated');

    return createSuccessResponse(updated, 'Task status updated successfully');
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'PATCH /api/tasks/[taskId]/status' }, 'Failed to update task status');
    return createErrorResponse('INTERNAL_ERROR', 'Failed to update task status');
  }
}
