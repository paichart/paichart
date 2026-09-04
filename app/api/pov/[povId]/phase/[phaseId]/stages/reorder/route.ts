import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { reorderLimiter } from '@/lib/middleware/rate-limit';
import { getPhaseStageEventEmitter } from '@/lib/events/phase-stage-events';
import { logPhaseStageOperation } from '@/lib/auth/audit';
import { phaseService } from '@/lib/pov/services/phase';
import { ReorderStagesSchema } from '@/lib/validation/pov';
import { povLogger } from '@/lib/logger';

/**
 * POST /api/pov/[povId]/phase/[phaseId]/stages/reorder
 * Reorder stages in a phase
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const POST = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅
    povLogger.debug({ phaseId: params.phaseId }, 'reordering stages for phase');

    // ✅ ENHANCED: Rate limiting (Week 4 Phase 5.4)
    const rateLimitResponse = reorderLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

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

    // 2026-05-14 P1 wire-up: schema replaces ad-hoc Array.isArray check.
    // Old shape: no DoS cap at all. New shape: ReorderStagesSchema enforces
    // min 1, max 50 and per-element CUID validation.
    const body = await request.json();
    const validation = ReorderStagesSchema.safeParse({ ...body, phaseId });
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
    // ReorderStagesSchema's per-element OptionalCUID makes the array type
    // (string | undefined)[] — filter undefined here so the service gets
    // a clean string[]. Zod's .min(1) already guarantees non-empty after filter.
    const stageIds = validation.data.stageIds.filter((id): id is string => Boolean(id));

    // ✅ ENHANCED: Use atomic PhaseService.reorderStages (Week 4 Phase 2.2)
    // Replaced Promise.all with atomic transaction + FOR UPDATE NOWAIT
    const stages = await phaseService.reorderStages(phaseId, stageIds, user.userId);

    povLogger.info({ phaseId, stageCount: stageIds.length }, 'stages reordered');

    // ✅ ENHANCED: Event emission for all reordered stages (Week 4 Phase 5.4)
    try {
      const eventEmitter = getPhaseStageEventEmitter();
      for (const stage of stages) {
        await eventEmitter.emitStageEvent('updated', stage, user.userId);
      }
    } catch (error) {
      povLogger.error({ err: error }, 'stage reorder event emission failed');
    }

    // ✅ ENHANCED: Audit logging (Week 4 Phase 5.4)
    await logPhaseStageOperation(
      user.userId,
      'REORDER_STAGES',
      'stage',
      phaseId,
      {
        resourceId: phaseId,
        details: `Reordered ${stageIds.length} stages in phase`,
        success: true,
        povId: params.povId,
        phaseId,
        stageCount: stageIds.length,
        stageIds
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    povLogger.error({ err: error }, 'stages reorder error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to reorder stages' },
      { status: 500 }
    );
  }
});