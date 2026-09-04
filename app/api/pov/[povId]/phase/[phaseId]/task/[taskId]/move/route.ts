import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { MoveTaskRequestSchema } from '@/lib/validation/task-validation';
import { povLogger } from '@/lib/logger';
import { validateTaskStatusTransition } from '@/lib/tasks/services/status-transitions';
import { completeTaskTerminally } from '@/lib/tasks/services/complete-task-terminally';
import { DependencyNotSatisfiedError, PipelineInvariantError, InvalidTransitionError } from '@/lib/errors';

/**
 * POST /api/pov/[povId]/phase/[phaseId]/task/[taskId]/move
 * Move a task to a different stage or reorder within the same stage
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const POST = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅
    povLogger.debug({ taskId: params.taskId }, 'moving task');

    const { phaseId, taskId } = params;

    // Verify the phase exists and belongs to the POV
    const phase = await prisma.phase.findUnique({
      where: {
        id: phaseId,
        povId: params.povId,
      },
    });

    if (!phase) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
    }

    // Verify the task exists and belongs to the phase
    const task = await prisma.task.findUnique({
      where: {
        id: taskId,
        phaseId: phaseId,
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // 2026-05-14 P1 wire-up: schema replaces hardcoded validStatuses array
    // (which would drift if Prisma TaskStatus enum evolved) + inline bounds
    // checks. MoveTaskRequestSchema enforces nativeEnum(TaskStatus), CUID on
    // newStageId, and 0..1_000_000 on newOrder.
    const body = await request.json();
    const validation = MoveTaskRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }
    const { newStageId, newOrder, newStatus } = validation.data;

    let updateData: any = {};

    // Handle stage-based move (legacy functionality)
    if (newStageId) {
      // Verify the new stage exists and belongs to the phase
      const newStage = await prisma.stage.findUnique({
        where: {
          id: newStageId,
          phaseId: phaseId,
        },
      });

      if (!newStage) {
        return NextResponse.json({ error: 'New stage not found' }, { status: 404 });
      }

      updateData.stageId = newStageId;
    }

    // Handle order update (schema already enforced 0..1_000_000 bounds)
    if (typeof newOrder === 'number') {
      // Log warning if order doesn't follow 1000 increment pattern (debug aid)
      if (newOrder > 0 && newOrder % 1000 !== 0) {
        povLogger.warn({ taskId, newOrder }, 'order does not follow 1000 increment pattern');
      }
      updateData.order = newOrder;
    }

    const moveInclude = {
      assignee: {
        select: { id: true, name: true, email: true, role: true, status: true },
      },
      comments: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' as const },
      },
    };

    // Handle status-based move (Kanban functionality)
    // P1-C2 (path 8) closed the bare OPEN→COMPLETED drag; P2 wave 6 (3.8) finishes the shape:
    // a GENERIC terminal drag now routes through the completion core (tx + CAS + canonical
    // activity; the stage/order fields ride the SAME write via the builder). APPROVAL/PIPELINE
    // keep guards-first + the INTERIM reject (removed at Flip A).
    if (newStatus === 'COMPLETED' && task.status !== 'COMPLETED') {
      validateTaskStatusTransition(task.status, newStatus);

      // FLIP A (2026-07-24): the interim APPROVAL/PIPELINE reject is gone — all types flow
      // through the core (guards internal) and the kanban drag fires the cascade.

      const result = await completeTaskTerminally(prisma, {
        taskId,
        actor: { userId: user.userId, source: 'MOVE' },
        fireReactors: true, // FLIP A (2026-07-24): kanban terminal drags fire the cascade
        buildUpdateData: () => updateData, // stageId/order ride the one terminal write
        include: moveInclude,
      });
      povLogger.info({ taskId, newStageId, viaCompletionCore: true, transitioned: result.transitioned }, 'task moved (terminal, via core)');
      // Audit-6 edge: a concurrent completion makes the core a no-op (transitioned:false,
      // task:null) — respond with a fresh read, never a null body.
      const responseTask = result.task ?? await prisma.task.findUnique({ where: { id: taskId }, include: moveInclude });
      return NextResponse.json(responseTask);
    }

    if (newStatus && newStatus !== task.status) {
      // Non-terminal transition: state machine + ordinary write.
      validateTaskStatusTransition(task.status, newStatus);
      updateData.status = newStatus;
    }
    // F2 (2026-07-25): a same-status drag deliberately writes NO status. It used to re-write the
    // identical value as an "idempotent no-op", but it is not one: taskCompletedAtExtension
    // stamps completedAt=now on any payload containing status:'COMPLETED' and cannot see the
    // prior status, so re-dragging an already-COMPLETED card within its column silently moved
    // its completion timestamp. The stage/order fields below still apply.

    // Always update the timestamp
    updateData.updatedAt = new Date();

    // Update the task
    const updatedTask = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: updateData,
      include: moveInclude,
    });

    povLogger.info({ taskId, newStageId }, 'task moved');
    
    return NextResponse.json(updatedTask);
  } catch (error) {
    povLogger.error({ err: error }, 'task move error');

    // P1-C2: typed guard errors are FACTS the GUI can render — never a 500.
    if (error instanceof DependencyNotSatisfiedError) {
      return NextResponse.json(
        { error: error.message, code: 'DEPENDENCY_NOT_SATISFIED', unsatisfied: error.unsatisfied },
        { status: 409 }
      );
    }
    if (error instanceof PipelineInvariantError) {
      return NextResponse.json(
        { error: error.message, code: 'PIPELINE_INVARIANT', point: error.point },
        { status: 409 }
      );
    }
    if (error instanceof InvalidTransitionError) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_TRANSITION' },
        { status: 400 }
      );
    }

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to move task' },
      { status: 500 }
    );
  }
});
