import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { CreateTaskSchema } from '@/lib/validation/task-validation';
import { povLogger } from '@/lib/logger';

/**
 * POST /api/pov/[povId]/phase/[phaseId]/stage/[stageId]/task
 *
 * Create a new task in a stage
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const POST = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅
    povLogger.debug({ stageId: params.stageId }, 'creating task for stage');

    const { povId, phaseId, stageId } = params;

    // Verify the phase exists and belongs to the POV
    const phase = await prisma.phase.findUnique({
      where: {
        id: phaseId,
        povId: povId,
      },
    });

    if (!phase) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
    }

    // Verify the stage exists and belongs to the phase
    const stage = await prisma.stage.findUnique({
      where: {
        id: stageId,
        phaseId: phaseId,
      },
    });

    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // Parse and validate request body
    const body = await request.json();

    // Normalize 'unassigned' sentinel to null before schema validation
    if (body.assigneeId === 'unassigned') body.assigneeId = null;

    // ✅ SECURITY: Validate with CreateTaskSchema (XSS/injection on title+description, enum safety, CUID IDs)
    const validation = CreateTaskSchema.safeParse({ ...body, povId, phaseId, stageId });
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    // SECURITY (2026-05-14 BC76 sibling fix): destructure metadata too.
    // Prior code read `body.metadata` at line 87, bypassing safeRecord()
    // stripDangerousKeys transform. CreateTaskSchema now declares metadata
    // (added in the same session's handler-layer BC76 fix), so it survives
    // the Zod strip and arrives here with __proto__/constructor stripped.
    const { title, description, status, priority, dueDate, assigneeId, metadata } = validation.data;

    // BC47/BC19 FIX (2026-06-08): a plain $transaction does NOT prevent the duplicate-order race
    // (the max-order findFirst takes no lock at READ COMMITTED; `order` has no unique constraint, so
    // a dup is silent). Lock the parent stage row with FOR UPDATE (waits) so concurrent appends to
    // this stage serialize. See BC19 / transaction-atomicity-pattern.md.
    const task = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM stages WHERE id = ${stageId} FOR UPDATE`;
      const lastTask = await tx.task.findFirst({
        where: { stageId },
        orderBy: { order: 'desc' }
      });

      const nextOrder = lastTask ? lastTask.order + 1000 : 1000;

      return tx.task.create({
        data: {
          title,
          description: description || null,
          status: status || 'OPEN',
          priority: priority || 'MEDIUM',
          dueDate: dueDate ? new Date(dueDate) : null,
          assigneeId: assigneeId || null,
          povId,
          phaseId,
          stageId,
          order: nextOrder,
          metadata: metadata || {},
        },
      });
    });

    povLogger.info({ taskId: task.id, stageId: params.stageId }, 'task created');

    return NextResponse.json(task);
  } catch (error) {
    povLogger.error({ err: error }, 'task create error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
});
