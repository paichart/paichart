import { NextRequest, NextResponse } from 'next/server';
import { getTaskHandler, updateTaskHandler } from '@/lib/tasks/handlers/task';
import { taskLogger } from '@/lib/logger';
import { DependencyNotSatisfiedError, PipelineInvariantError, InvalidTransitionError, ProtocolStampImmutableError } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: { povId: string; phaseId: string; taskId: string } }
) {
  taskLogger.debug({ taskId: params.taskId }, 'task GET');
  try {
    const response = await getTaskHandler(req, params.povId, params.phaseId, params.taskId);
    return NextResponse.json(response);
  } catch (error) {
    taskLogger.error({ err: error, taskId: params.taskId }, 'task GET error');
    return NextResponse.json(
      { error: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { povId: string; phaseId: string; taskId: string } }
) {
  try {
    // Parse request body
    const data = await req.json();
    taskLogger.debug({ taskId: params.taskId }, 'task PUT');

    // Validate taskId
    if (!params.taskId) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    // Update task
    const response = await updateTaskHandler(req, params.povId, params.phaseId, params.taskId, data);
    return NextResponse.json(response);
  } catch (error) {
    taskLogger.error({ err: error, taskId: params.taskId }, 'task PUT error');

    // 2.14 (completion-path P2): typed guard errors are structured 4xx FACTS, never a 500.
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
      return NextResponse.json({ error: error.message, code: 'INVALID_STATUS_TRANSITION' }, { status: 400 });
    }
    // WS2 Phase A (2026-08-17, panel A-4): the platform-stamp guard's 400 must arrive as a 400
    // with its code intact — this route previously fell through to an opaque 500 for it.
    if (error instanceof ProtocolStampImmutableError) {
      return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 400 });
    }
    // A-4 second half: handler-level Zod validation failures ('Invalid task data: ...') were
    // reaching the generic 500 with message and field path destroyed. They are client errors.
    if (error instanceof Error && error.message.startsWith('Invalid task data:')) {
      return NextResponse.json({ error: error.message, code: 'INVALID_REQUEST' }, { status: 400 });
    }

    // Check if it's a Prisma error
    if (error instanceof Error && error.name === 'PrismaClientKnownRequestError') {
      return NextResponse.json(
        { error: 'Database error occurred' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
