import { NextRequest, NextResponse } from 'next/server';
import { createTaskHandler, getPhaseTasksHandler, getTaskHandler, updateTaskHandler } from '@/lib/tasks/handlers/task';
import { povLogger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: { povId: string; phaseId: string } }
) {
  try {
    const data = await req.json();
    const response = await createTaskHandler(req, params.povId, params.phaseId, data);
    return NextResponse.json(response);
  } catch (error) {
    povLogger.error({ err: error }, 'task create error');
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { povId: string; phaseId: string; taskId?: string } }
) {
  try {
    // Get the taskId from the URL if it exists
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const taskId = segments[segments.length - 1];

    // If taskId is present in the URL, get a single task
    if (taskId && taskId !== 'task') {
      const response = await getTaskHandler(req, params.povId, params.phaseId, taskId);
      return NextResponse.json(response);
    }

    // Otherwise, get all tasks for the phase
    const response = await getPhaseTasksHandler(req, params.povId, params.phaseId);
    return NextResponse.json(response);
  } catch (error) {
    povLogger.error({ err: error }, 'task GET error');
    return NextResponse.json(
      { error: 'Failed to fetch task(s)' },
      { status: 500 }
    );
  }
}
