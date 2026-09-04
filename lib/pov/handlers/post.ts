import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { withSerializationRetry } from '@/lib/database/serialization-retry';
import { ApiError } from '@/lib/errors';
import { phaseService } from '../services/phase';
import { phaseTemplateService } from '../services/phaseTemplate';
import { createPhaseSchema } from '../types/requests';
import { PhaseType } from '@prisma/client';
import { phaseStageMutationLimiter } from '@/lib/middleware/rate-limit';
import { getPhaseStageEventEmitter } from '@/lib/events/phase-stage-events';
import { logPhaseStageOperation } from '@/lib/auth/audit';
import { povLogger } from '@/lib/logger';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { getPOVForAccess } from '@/lib/tasks/helpers/pov-access';

const localLogger = povLogger.child({ module: 'PostHandler' });

export async function createPhaseHandler(
  request: NextRequest,
  { params }: { params: { povId: string } }
) {
  const user = await getAuthUser(request);
  if (!user) {
    throw new ApiError('UNAUTHORIZED', 'Unauthorized');
  }

  // ✅ ENHANCED: Rate limiting (Week 4 Phase 5.1)
  const rateLimitResponse = phaseStageMutationLimiter(request);
  if (rateLimitResponse) {
    throw new ApiError('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded');
  }

  const { povId } = params;

  // Load PoV in the shape validatePOVAccess reads (owner / team.members / metadata)
  const pov = await getPOVForAccess(povId);

  if (!pov) {
    throw new ApiError('NOT_FOUND', 'PoV not found');
  }

  // Instance-scoped: phase-create requires owner / team-member / admin access to the parent POV
  validatePOVAccess(user, pov, { throwOnDeny: true, requireWrite: true, logContext: 'Phase Create' });

  const data = await request.json();

  // Validate request body
  const validatedData = createPhaseSchema.safeParse(data);
  if (!validatedData.success) {
    throw new ApiError('BAD_REQUEST', 'Invalid request body', validatedData.error);
  }

  // ✅ ENHANCED: Atomic order calculation (Week 4 Phase 2.2)
  const phase = await withSerializationRetry(() => prisma.$transaction(async (tx) => {
    // Lock all phases in this POV to prevent race conditions
    await tx.$executeRaw`
      SELECT id FROM "Phase"
      WHERE "povId" = ${povId}
      FOR UPDATE NOWAIT
    `;

    // Calculate order atomically within transaction using 1000 increment pattern
    const lastPhase = await tx.phase.findFirst({
      where: { povId },
      orderBy: { order: 'desc' },
      select: { order: true }
    });

    const atomicOrder = lastPhase ? lastPhase.order + 1000 : 1000;  // Industry standard increment
    localLogger.debug({ povId, atomicOrder }, 'calculated atomic order for phase creation');

    // Check if we're creating a phase from a template
    if (data.templateId) {
      // Create phase from template (within transaction)
      return await phaseTemplateService.createPhaseFromTemplate({
        ...validatedData.data,
        povId,
        templateId: data.templateId,
      });
    } else {
      // Create regular phase (within transaction)
      return await tx.phase.create({
        data: {
          ...validatedData.data,
          povId,
          order: atomicOrder,
          type: validatedData.data.type || PhaseType.PLANNING,
          templateId: validatedData.data.templateId || null,
        },
        include: {
          template: true,
          tasks: true,
          pov: {
            include: {
              owner: true,
              team: {
                include: {
                  members: {
                    include: {
                      user: true
                    }
                  }
                }
              }
            }
          }
        },
      });
    }
  }, {
    isolationLevel: 'Serializable',
    timeout: 10000
  }), 'pov/handlers/post.ts:createPhase');

  if (!phase) {
    throw new ApiError('INTERNAL_SERVER_ERROR', 'Failed to create phase');
  }

  // ✅ ENHANCED: Event emission for real-time updates (Week 4 Phase 5.1)
  try {
    const eventEmitter = getPhaseStageEventEmitter();
    await eventEmitter.emitPhaseEvent('created', phase, user.userId);
  } catch (error) {
    localLogger.error({ err: error }, 'phase create event emission failed');
  }

  // ✅ ENHANCED: Audit logging (Week 4 Phase 5.1)
  await logPhaseStageOperation(
    user.userId,
    'CREATE_PHASE',
    'phase',
    phase.id,
    {
      resourceId: phase.id,
      details: `Created phase "${phase.name}" in POV ${povId}`,
      success: true,
      povId: phase.povId,
      phaseName: phase.name,
      phaseType: phase.type
    }
  );

  // Return the phase data directly
  return phase;
}
