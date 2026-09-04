import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withPOVAccess } from "@/lib/auth/validate-pov-access"
import { phaseStageMutationLimiter } from "@/lib/middleware/rate-limit"
import { getPhaseStageEventEmitter } from "@/lib/events/phase-stage-events"
import { logPhaseStageOperation, calculateDeleteSeverity } from "@/lib/auth/audit"
import { updatePhaseSchema } from "@/lib/validation/pov"
import { validateCUIDFormat } from "@/lib/validation/id-validation"
import { povLogger } from "@/lib/logger"

/**
 * GET /api/pov/[povId]/phase/[phaseId]
 * Get a specific phase
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const GET = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅
    const { phaseId } = params;

    // ✅ ENHANCED: Response optimization with expand and includeStages parameters (Week 4 Phase 3.1, 3.3)
    const { searchParams } = new URL(request.url);
    const expand = searchParams.get('expand') === 'true';
    const includeStages = searchParams.get('includeStages') === 'true';

    // Get the phase with conditional includes
    const phase = await prisma.phase.findUnique({
      where: { id: phaseId },
      include: expand ? {
        // Full expansion (50KB response)
        template: {
          include: {
            phases: { include: { tasks: true } }
          }
        },
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            dependencies: true
          }
        },
        stages: includeStages ? {
          orderBy: { order: 'asc' },
          include: {
            tasks: { select: { id: true, title: true, status: true } }
          }
        } : undefined,
        pov: {
          include: {
            team: { include: { members: true } }
          }
        }
      } : {
        // Minimal expansion (5KB response)
        template: true,
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
        stages: includeStages ? {
          orderBy: { order: 'asc' }
        } : undefined
      },
    })

    if (!phase) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 })
    }

    // Check if the phase belongs to the POV
    if (phase.povId !== params.povId) {
      return NextResponse.json({ error: "Phase not found in this POV" }, { status: 404 })
    }

    const response = NextResponse.json({ phase });

    // ✅ ENHANCED: HTTP cache headers (Week 4 Phase 3.2)
    // Cache for 60s, allow stale for 5 minutes (single resource, higher cache tolerance)
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    response.headers.set('Vary', 'Authorization'); // BC40 FIX: Prevent cross-user cache poisoning

    return response;
  } catch (error) {
    povLogger.error({ err: error }, 'phase GET error')
    return NextResponse.json(
      { error: "Failed to fetch phase" },
      { status: 500 }
    )
  }
});

/**
 * PUT /api/pov/[povId]/phase/[phaseId]
 * Update a phase
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const PUT = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅

    // ✅ ENHANCED: Rate limiting (Week 4 Phase 5.2)
    const rateLimitResponse = phaseStageMutationLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { phaseId } = params;
    const data = await request.json()

    // Route-level validation (defense-in-depth)
    const validation = updatePhaseSchema.safeParse(data);
    if (!validation.success) {
      povLogger.warn({ userId: user.userId, povId: params.povId, phaseId, errors: validation.error.errors }, 'phase update validation failed');

      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, { status: 400 });
    }

    // Check if the phase exists
    const phase = await prisma.phase.findUnique({
      where: { id: phaseId },
    })

    if (!phase) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 })
    }

    // Check if the phase belongs to the POV
    if (phase.povId !== params.povId) {
      return NextResponse.json({ error: "Phase not found in this POV" }, { status: 404 })
    }

    // Update the phase
    const updatedPhase = await prisma.phase.update({
      where: { id: phaseId },
      data: {
        name: data.name,
        description: data.description,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        type: data.type,
        details: data.details,
      },
      include: {
        template: true,
        tasks: {
          include: {
            assignee: true,
          },
        },
      },
    })

    // ✅ ENHANCED: Event emission for real-time updates (Week 4 Phase 5.2)
    try {
      const eventEmitter = getPhaseStageEventEmitter();
      await eventEmitter.emitPhaseEvent('updated', updatedPhase, user.userId);
    } catch (error) {
      povLogger.error({ err: error }, 'phase update event emission failed');
    }

    // ✅ ENHANCED: Audit logging (Week 4 Phase 5.2)
    await logPhaseStageOperation(
      user.userId,
      'UPDATE_PHASE',
      'phase',
      phaseId,
      {
        resourceId: phaseId,
        details: `Updated phase "${updatedPhase.name}"`,
        success: true,
        povId: params.povId,
        phaseName: updatedPhase.name,
        changes: Object.keys(validation.data)
      }
    );

    return NextResponse.json({ phase: updatedPhase })
  } catch (error) {
    povLogger.error({ err: error }, 'phase PUT error')
    return NextResponse.json(
      { error: "Failed to update phase" },
      { status: 500 }
    )
  }
});

/**
 * DELETE /api/pov/[povId]/phase/[phaseId]
 * Delete a phase
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const DELETE = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅

    // Validate phase ID format (consistent CUID validation)
    const phaseIdCheck = validateCUIDFormat(params.phaseId, 'phase ID');
    if (!phaseIdCheck.valid) {
      return NextResponse.json({ error: phaseIdCheck.error }, { status: 400 });
    }

    // ✅ ENHANCED: Rate limiting (Week 4 Phase 5.2)
    const rateLimitResponse = phaseStageMutationLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { phaseId } = params;

    // Check if the phase exists
    const phase = await prisma.phase.findUnique({
      where: { id: phaseId },
    })

    if (!phase) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 })
    }

    // Check if the phase belongs to the POV
    if (phase.povId !== params.povId) {
      return NextResponse.json({ error: "Phase not found in this POV" }, { status: 404 })
    }

    // Count affected resources for audit logging
    const [stageCount, taskCount, activeTaskCount] = await Promise.all([
      prisma.stage.count({ where: { phaseId } }),
      prisma.task.count({ where: { phaseId } }),
      prisma.task.count({ where: { phaseId, status: { in: ['IN_PROGRESS', 'BLOCKED'] } } })
    ]);

    // Guard: Prevent deletion of phases with active tasks
    if (activeTaskCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete phase with active tasks. Complete or remove active tasks first.',
        activeTasks: activeTaskCount
      }, { status: 400 });
    }

    // Delete the phase (cascade to stages and tasks)
    await prisma.phase.delete({
      where: { id: phaseId },
    })

    // ✅ ENHANCED: Event emission (Week 4 Phase 5.2) - emit BEFORE deletion
    try {
      const eventEmitter = getPhaseStageEventEmitter();
      await eventEmitter.emitPhaseEvent('deleted', phase, user.userId);
    } catch (error) {
      povLogger.error({ err: error }, 'phase delete event emission failed');
    }

    // ✅ ENHANCED: Security audit logging with severity (Week 4 Phase 5.2)
    const totalAffected = stageCount + taskCount;
    await logPhaseStageOperation(
      user.userId,
      'DELETE_PHASE',
      'phase',
      phaseId,
      {
        resourceId: phaseId,
        details: `Deleted phase "${phase.name}" (${stageCount} stages, ${taskCount} tasks affected)`,
        success: true,
        povId: params.povId,
        phaseName: phase.name,
        affectedStages: stageCount,
        affectedTasks: taskCount,
        severity: calculateDeleteSeverity(totalAffected)
      }
    );

    // BC67 FIX: Return affected resource counts so caller knows cascade impact
    return NextResponse.json({ success: true, affected: { stages: stageCount, tasks: taskCount } })
  } catch (error) {
    povLogger.error({ err: error }, 'phase DELETE error')
    return NextResponse.json(
      { error: "Failed to delete phase" },
      { status: 500 }
    )
  }
});
