import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { withSerializationRetry } from '@/lib/database/serialization-retry';
import { ApiError } from '@/lib/errors';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { phaseStageMutationLimiter } from '@/lib/middleware/rate-limit';
import { getPhaseStageEventEmitter } from '@/lib/events/phase-stage-events';
import { logPhaseStageOperation, calculateDeleteSeverity } from '@/lib/auth/audit';
import { CreateStageSchema, UpdateStageSchema } from '@/lib/validation/pov';
import { validateCUIDFormat } from '@/lib/validation/id-validation';
import { povLogger } from '@/lib/logger';
import { logStageFieldChange, TaskActivityAction } from '@/lib/pov/services/stageActivityService';

// Helper function to get the next stage order with atomic transaction protection
// Uses 1000 increment pattern (industry standard) matching task ordering
async function getNextStageOrder(phaseId: string, tx: any = prisma): Promise<number> {
  // ✅ ENHANCED: Add row-level locking (Week 4 Phase 2.2)
  if (tx !== prisma) {
    // Called within transaction - add locking
    await tx.$executeRaw`
      SELECT id FROM stages
      WHERE "phaseId" = ${phaseId}
      FOR UPDATE NOWAIT
    `;
  }

  const lastStage = await tx.stage.findFirst({
    where: { phaseId },
    orderBy: { order: 'desc' },
    select: { order: true }
  });

  // Use 1000 increment pattern (matches task ordering and shared order-utils.ts)
  const atomicOrder = lastStage ? lastStage.order + 1000 : 1000;
  povLogger.debug({ phaseId, order: atomicOrder }, 'stage order calculated');

  return atomicOrder;
}

/**
 * POST /api/pov/[povId]/phase/[phaseId]/stage
 * Create a new stage for a phase
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { povId: string; phaseId: string } }
) {
  try {
    povLogger.debug({ phaseId: params.phaseId }, 'creating stage');

    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ ENHANCED: Rate limiting (Week 4 Phase 5.3)
    const rateLimitResponse = phaseStageMutationLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { povId, phaseId } = params;

    // Verify the POV exists and get team membership
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      select: {
        id: true,
        ownerId: true,
        metadata: true,
        team: {
          select: {
            members: {
              select: { userId: true, user: { select: { id: true } } }
            }
          }
        }
      },
    });

    if (!pov) {
      return NextResponse.json({ error: 'POV not found' }, { status: 404 });
    }

    // Validate POV access using shared utility
    try {
      validatePOVAccess(user, pov, {
        throwOnDeny: true,
        requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
        logContext: 'Stage POST'
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
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

    // Parse request body
    const body = await request.json();

    // Schema validation
    const validation = CreateStageSchema.safeParse({ ...body, phaseId });
    if (!validation.success) {
      povLogger.warn({ userId: user.userId, povId, phaseId }, 'stage create validation failed');

      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, { status: 400 });
    }

    // SECURITY (2026-05-14 bug-class sweep): read from validation.data, NOT
    // raw body. Earlier code read `body` after safeParse — same anti-pattern
    // as the POST /api/pov direct-path bypass (commit 8f883324). Reading
    // body silently bypasses the .refine(detectPromptInjection) on stage
    // name + description and all transforms.
    const { name, order, afterStage, beforeStage, position } = validation.data;

    // Validate required fields (kept for backward compatibility)
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // ✅ ENHANCED: Atomic transaction with row-level locking (Week 4 Phase 2.2)
    const stage = await withSerializationRetry(() => prisma.$transaction(async (tx) => {
      // Lock all stages in this phase
      await tx.$executeRaw`
        SELECT id FROM stages
        WHERE "phaseId" = ${phaseId}
        FOR UPDATE NOWAIT
      `;

      // 🔧 Smart Stage Ordering with relative positioning
      let finalOrder = 0;

      if (order && typeof order === 'number') {
        // Explicit order provided - use it directly (stages use simple numeric ordering)
        finalOrder = order;
      } else if (afterStage || beforeStage) {
        // Relative positioning requested
        const referenceStageTitle = afterStage || beforeStage;

        const referenceStage = await tx.stage.findFirst({
        where: {
          phaseId: phaseId,
          name: { equals: referenceStageTitle, mode: 'insensitive' }
        },
        select: { id: true, name: true, order: true }
      });
      
      if (referenceStage) {
        
        if (afterStage) {
          // Insert after the reference stage
          const nextStage = await tx.stage.findFirst({
            where: {
              phaseId: phaseId,
              order: { gt: referenceStage.order }
            },
            orderBy: { order: 'asc' },
            select: { order: true }
          });

          if (nextStage) {
            // Insert between reference stage and next stage
            finalOrder = Math.floor((referenceStage.order + nextStage.order) / 2);
          } else {
            // Insert at the end (use 1000 increment pattern)
            finalOrder = referenceStage.order + 1000;
          }
        } else if (beforeStage) {
          // Insert before the reference stage
          const prevStage = await tx.stage.findFirst({
            where: {
              phaseId: phaseId,
              order: { lt: referenceStage.order }
            },
            orderBy: { order: 'desc' },
            select: { order: true }
          });

          if (prevStage) {
            // Insert between previous stage and reference stage
            finalOrder = Math.floor((prevStage.order + referenceStage.order) / 2);
          } else {
            // Insert at the beginning (use 1000 as minimum for new ordering pattern)
            finalOrder = Math.max(1000, referenceStage.order - 1000);
          }
        }
      } else {
        povLogger.debug({ referenceStageTitle }, 'reference stage not found, using default');
        finalOrder = await getNextStageOrder(phaseId, tx);
      }
      } else if (position) {
        // Position-based ordering (e.g., "first", "last", "middle")
        if (position === 'first') {
          const firstStage = await tx.stage.findFirst({
            where: { phaseId: phaseId },
            orderBy: { order: 'asc' },
            select: { order: true }
          });
          finalOrder = firstStage ? Math.max(1, firstStage.order - 1) : 1;
        } else if (position === 'last') {
          finalOrder = await getNextStageOrder(phaseId, tx);
        } else {
          // Default to end
          finalOrder = await getNextStageOrder(phaseId, tx);
        }
      } else {
        // No specific ordering requested - append to end
        finalOrder = await getNextStageOrder(phaseId, tx);
      }

      // Create the stage within transaction
      return await tx.stage.create({
        data: {
          name,
          order: finalOrder,
          phaseId,
        },
      });
    }, {
      isolationLevel: 'Serializable',
      timeout: 10000
    }), 'stage/route.ts:createStage');

    povLogger.info({ stageId: stage.id, phaseId: params.phaseId }, 'stage created');

    // ✅ ENHANCED: Event emission for real-time updates (Week 4 Phase 5.3)
    try {
      const eventEmitter = getPhaseStageEventEmitter();
      await eventEmitter.emitStageEvent('created', stage, user.userId);
    } catch (error) {
      povLogger.error({ err: error }, 'stage create event emission failed');
    }

    // ✅ ENHANCED: Audit logging (Week 4 Phase 5.3)
    await logPhaseStageOperation(
      user.userId,
      'CREATE_STAGE',
      'stage',
      stage.id,
      {
        resourceId: stage.id,
        details: `Created stage "${stage.name}" in phase ${phaseId}`,
        success: true,
        povId,
        phaseId,
        stageName: name,
        stageOrder: stage.order
      }
    );

    return NextResponse.json(stage);
  } catch (error) {
    povLogger.error({ err: error }, 'stage create error');
    
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create stage' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/pov/[povId]/phase/[phaseId]/stage
 * Update an existing stage
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { povId: string; phaseId: string } }
) {
  try {
    // Extract stageId from URL search params
    const url = new URL(request.url);
    const stageId = url.searchParams.get('stageId');

    if (!stageId) {
      return NextResponse.json({ error: 'Stage ID is required' }, { status: 400 });
    }

    povLogger.debug({ stageId, phaseId: params.phaseId }, 'updating stage');

    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ ENHANCED: Rate limiting (Week 4 Phase 5.3)
    const rateLimitResponse = phaseStageMutationLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { povId, phaseId } = params;

    // Verify the POV exists and get team membership
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      select: {
        id: true,
        ownerId: true,
        metadata: true,
        team: {
          select: {
            members: {
              select: { userId: true, user: { select: { id: true } } }
            }
          }
        }
      },
    });

    if (!pov) {
      return NextResponse.json({ error: 'POV not found' }, { status: 404 });
    }

    // Validate POV access using shared utility
    try {
      validatePOVAccess(user, pov, {
        throwOnDeny: true,
        requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
        logContext: 'Stage PUT'
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Verify the stage exists and belongs to the correct phase
    const existingStage = await prisma.stage.findUnique({
      where: {
        id: stageId,
        phaseId: phaseId,
      },
    });

    if (!existingStage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();

    // Schema validation
    const validation = UpdateStageSchema.safeParse({ ...body, stageId, phaseId });
    if (!validation.success) {
      povLogger.warn({ userId: user.userId, stageId }, 'stage update validation failed');

      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, { status: 400 });
    }

    // SECURITY (2026-05-14 bug-class sweep): use validation.data, not raw body.
    // See POST handler above for the full anti-pattern description.
    const { name, description, order } = validation.data;

    // Validate required fields (kept for backward compatibility)
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Update the stage
    const updatedStage = await prisma.stage.update({
      where: { id: stageId },
      data: {
        name,
        description: description || existingStage.description,
        order: order !== undefined ? order : existingStage.order,
        updatedAt: new Date(),
      },
    });

    // Phase 2 stage_activities (2026-04-26): per-field forensic record.
    // existingStage was already fetched at L345 for the phase-membership
    // check, so the before-state is free.
    if (existingStage.name !== updatedStage.name) {
      logStageFieldChange(stageId, user.userId, {
        name: 'name',
        oldValue: existingStage.name,
        newValue: updatedStage.name,
        action: TaskActivityAction.UPDATED,
      }, { source: 'API' });
    }
    if (existingStage.description !== updatedStage.description) {
      logStageFieldChange(stageId, user.userId, {
        name: 'description',
        oldValue: existingStage.description,
        newValue: updatedStage.description,
        action: TaskActivityAction.UPDATED,
      }, { source: 'API' });
    }
    if (existingStage.order !== updatedStage.order) {
      logStageFieldChange(stageId, user.userId, {
        name: 'order',
        oldValue: existingStage.order,
        newValue: updatedStage.order,
        action: TaskActivityAction.UPDATED,
      }, { source: 'API' });
    }

    // ✅ ENHANCED: Event emission for real-time updates (Week 4 Phase 5.3)
    try {
      const eventEmitter = getPhaseStageEventEmitter();
      await eventEmitter.emitStageEvent('updated', updatedStage, user.userId);
    } catch (error) {
      povLogger.error({ err: error }, 'stage update event emission failed');
    }

    // ✅ ENHANCED: Audit logging (Week 4 Phase 5.3)
    await logPhaseStageOperation(
      user.userId,
      'UPDATE_STAGE',
      'stage',
      stageId,
      {
        resourceId: stageId,
        details: `Updated stage "${updatedStage.name}"`,
        success: true,
        povId,
        phaseId,
        stageName: updatedStage.name
      }
    );

    return NextResponse.json(updatedStage);
  } catch (error) {
    povLogger.error({ err: error }, 'stage update error');
    
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to update stage' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pov/[povId]/phase/[phaseId]/stage/[stageId]
 * Delete a stage from a phase
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { povId: string; phaseId: string } }
) {
  try {
    // Extract stageId from URL search params since it's not in the route params
    const url = new URL(request.url);
    const stageId = url.searchParams.get('stageId');

    if (!stageId) {
      return NextResponse.json({ error: 'Stage ID is required' }, { status: 400 });
    }

    // Validate stage ID format (consistent CUID validation)
    const stageIdCheck = validateCUIDFormat(stageId, 'stage ID');
    if (!stageIdCheck.valid) {
      return NextResponse.json({ error: stageIdCheck.error }, { status: 400 });
    }

    // Validate phase ID format (from params)
    const phaseIdCheck = validateCUIDFormat(params.phaseId, 'phase ID');
    if (!phaseIdCheck.valid) {
      return NextResponse.json({ error: phaseIdCheck.error }, { status: 400 });
    }

    povLogger.debug({ stageId, phaseId: params.phaseId }, 'deleting stage');

    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ ENHANCED: Rate limiting (Week 4 Phase 5.3)
    const rateLimitResponse = phaseStageMutationLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { povId, phaseId } = params;

    // Verify the POV exists and get team membership
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      select: {
        id: true,
        ownerId: true,
        metadata: true,
        team: {
          select: {
            members: {
              select: { userId: true, user: { select: { id: true } } }
            }
          }
        }
      },
    });

    if (!pov) {
      return NextResponse.json({ error: 'POV not found' }, { status: 404 });
    }

    // Validate POV access using shared utility
    try {
      validatePOVAccess(user, pov, {
        throwOnDeny: true,
        requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
        logContext: 'Stage DELETE'
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Verify the stage exists and belongs to the correct phase
    const stage = await prisma.stage.findUnique({
      where: {
        id: stageId,
        phaseId: phaseId,
      },
      include: {
        tasks: {
          select: { id: true }
        }
      }
    });

    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // Check if stage has tasks - prevent deletion if it has tasks
    if (stage.tasks.length > 0) {
      return NextResponse.json({
        error: 'Cannot delete stage with existing tasks. Please move or delete all tasks first.'
      }, { status: 400 });
    }

    const taskCount = stage.tasks.length; // Already included in query

    // ✅ ENHANCED: Event emission BEFORE deletion (need stage data) (Week 4 Phase 5.3)
    try {
      const eventEmitter = getPhaseStageEventEmitter();
      await eventEmitter.emitStageEvent('deleted', stage, user.userId);
    } catch (error) {
      povLogger.error({ err: error }, 'stage delete event emission failed');
    }

    // Delete the stage
    await prisma.stage.delete({
      where: { id: stageId }
    });

    povLogger.info({ stageId }, 'stage deleted');

    // ✅ ENHANCED: Security audit logging with severity (Week 4 Phase 5.3)
    await logPhaseStageOperation(
      user.userId,
      'DELETE_STAGE',
      'stage',
      stageId,
      {
        resourceId: stageId,
        details: `Deleted stage "${stage.name}" (${taskCount} tasks affected)`,
        success: true,
        povId,
        phaseId,
        stageName: stage.name,
        affectedTasks: taskCount,
        severity: calculateDeleteSeverity(taskCount)
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Stage deleted successfully',
      stageId: stageId
    });
  } catch (error) {
    povLogger.error({ err: error }, 'stage delete error');
    
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to delete stage' },
      { status: 500 }
    );
  }
}
