import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { mapTaskFromPrisma } from '@/lib/tasks/prisma/mappers';
import { parsePaginationParams, paginationResponse } from '@/lib/utils/pagination';
import { povLogger } from '@/lib/logger';

/**
 * GET /api/pov/[povId]/phase/[phaseId]/stage/[stageId]/tasks
 * Get all tasks for a stage
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { povId: string; phaseId: string; stageId: string } }
) {
  try {
    povLogger.debug({ stageId: params.stageId }, 'getting tasks for stage');
    
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { povId, phaseId, stageId } = params;

    // Verify the POV exists and user has access
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      select: {
        id: true,
        ownerId: true,
        teamId: true,
        metadata: true,
      },
    });

    if (!pov) {
      return NextResponse.json({ error: 'POV not found' }, { status: 404 });
    }

    // Check if user is owner or team member
    const isOwner = pov.ownerId === user.userId;
    let isTeamMember = false;

    if (pov.teamId) {
      const teamMember = await prisma.teamMember.findFirst({
        where: {
          teamId: pov.teamId,
          userId: user.userId,
        },
      });
      isTeamMember = !!teamMember;
    }

    // DEMO_USER: Check additive access (owned + team + demo)
    if (user.role === 'DEMO_USER') {
      const isDemo = pov.metadata &&
        typeof pov.metadata === 'object' &&
        'isDemo' in pov.metadata &&
        pov.metadata.isDemo === true;

      if (!isOwner && !isTeamMember && !isDemo) {
        return NextResponse.json({ error: 'Access denied - you do not have access to this POV' }, { status: 403 });
      }
    }

    // Calculate isDemo for general check
    const isDemo = pov.metadata &&
      typeof pov.metadata === 'object' &&
      'isDemo' in pov.metadata &&
      pov.metadata.isDemo === true;

    // Multi-tenant access: admin OR owner OR team member OR demo POV
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    const hasAccess = isAdmin || isOwner || isTeamMember || isDemo;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

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

    // Pagination
    const { searchParams } = new URL(request.url);
    const { limit, offset } = parsePaginationParams(searchParams);

    const taskWhere = { stageId: stageId };

    // Get tasks + total count in parallel
    const [tasks, totalCount] = await Promise.all([
      prisma.task.findMany({
        where: taskWhere,
        orderBy: [
          // Order tasks by our 1000x ordering system
          {
            order: 'asc'
          },
          // Fallback to creation date for tasks with same order
          {
            createdAt: 'asc'
          }
        ],
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where: taskWhere })
    ]);

    povLogger.debug({ stageId, taskCount: tasks.length, totalCount }, 'tasks fetched for stage');

    // Map tasks to the expected format
    const mappedTasks = tasks.map(mapTaskFromPrisma);

    return NextResponse.json(paginationResponse(mappedTasks, totalCount, limit, offset));
  } catch (error) {
    povLogger.error({ err: error }, 'stage tasks GET error');
    
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}
