import { NextRequest, NextResponse } from 'next/server';
import { getAvailableAssigneesHandler } from '@/lib/tasks/handlers/assignee';
import { povLogger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: { povId: string; phaseId: string } }
) {
  try {
    const response = await getAvailableAssigneesHandler(req, params.povId, params.phaseId);
    return NextResponse.json(response);
  } catch (error) {
    povLogger.error({ err: error }, 'available assignees error');
    return NextResponse.json(
      { error: 'Failed to fetch available assignees' },
      { status: 500 }
    );
  }
}
