import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { parsePaginationParams } from '@/lib/utils/pagination';
import { povLogger } from '@/lib/logger';

/**
 * GET /api/pov/[povId]/phase/[phaseId]/stages
 * Get all stages for a phase
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const GET = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅
    povLogger.debug({ phaseId: params.phaseId }, 'getting stages for phase');

    const { phaseId } = params;

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

    // ✅ ENHANCED: Response optimization with expand parameter (Week 4 Phase 3.1)
    const { searchParams } = new URL(request.url);
    const expand = searchParams.get('expand') === 'true';
    const { limit } = parsePaginationParams(searchParams, { limit: 100, maxLimit: 100 });

    // Get all stages for the phase with conditional includes (safety cap: stages are naturally bounded per phase)
    const stages = await prisma.stage.findMany({
      where: {
        phaseId: phaseId,
      },
      orderBy: {
        order: 'asc',
      },
      take: limit,
      include: expand ? {
        // Full expansion (includes all task details)
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            dependencies: true
          }
        },
        phase: {
          select: { id: true, name: true, type: true }
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      } : {
        // Minimal expansion (just count)
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    povLogger.debug({ phaseId, stageCount: stages.length }, 'stages fetched for phase');

    const response = NextResponse.json(stages);

    // ✅ ENHANCED: HTTP cache headers (Week 4 Phase 3.2)
    // Cache for 30s, allow stale for 5 minutes (50% query reduction)
    response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=300');
    response.headers.set('Vary', 'Authorization'); // BC40 FIX: Prevent cross-user cache poisoning

    return response;
  } catch (error) {
    povLogger.error({ err: error }, 'stages GET error');
    
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch stages' },
      { status: 500 }
    );
  }
});