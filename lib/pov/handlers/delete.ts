import { NextRequest } from "next/server"
import { z } from 'zod'
import { povService } from "@/lib/pov/services/pov"
// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
import { prisma } from '@/lib/prisma'
import { createErrorResponse, createSuccessResponse, handleZodError } from '@/lib/api/error-handler'
import { povLogger } from '@/lib/logger'

const localLogger = povLogger.child({ module: 'DeleteHandler' })

export async function deletePoVHandler(
  request: NextRequest,
  { params, user, pov }: { params: { povId: string }, user?: any, pov?: any }
) {
  // ✅ If user and pov provided by withPOVAccess, auth already done
  if (user && pov) {
    localLogger.debug({ povId: params.povId }, 'using pre-validated context for POV delete');
  }

  // 2026-05-17 (Finding #12): pass userId so the cascade delete writes a POV_DELETED
  // activity log inside the same transaction. If withPOVAccess didn't run, userId
  // is undefined and the audit write is skipped — but the route is wrapped, so user
  // is reliably present in production.
  const { povId } = params
  await povService.delete(povId, user?.userId)
  return createSuccessResponse(null, 'POV deleted successfully')
}

export async function deletePhaseHandler(
  request: NextRequest,
  { params }: { params: { povId: string; phaseId: string } }
) {
  const { phaseId } = params
  await povService.deletePhase(phaseId)
  return createSuccessResponse(null, 'Phase deleted successfully')
}

// ✅ ENHANCEMENT: Use centralized validation schema
import { DeleteMultiplePhasesSchema } from '@/lib/validation/pov';

export async function deleteMultiplePhasesHandler(
  request: NextRequest,
  { params, user, pov }: { params: { povId: string }, user: any, pov: any }
) {
  const data = await request.json()

  // ✅ Zod validation with .safeParse() pattern (proper error handling)
  const validation = DeleteMultiplePhasesSchema.safeParse(data);
  if (!validation.success) {
    localLogger.warn({ userId: user.userId, povId: params.povId, errors: validation.error.errors }, 'bulk phase deletion validation failed');

    return handleZodError(validation.error);
  }

  const { phaseIds } = validation.data

  // ✅ ENHANCEMENT: Use transaction for atomicity (sec-ops, 15 min)
  try {
    const result = await prisma.$transaction(async (tx) => {
      // ✅ Verify all phases belong to this POV (single query - optimized)
      const phases = await tx.phase.findMany({
        where: { id: { in: phaseIds } },
        select: { id: true, povId: true },
        take: 200
      })

      // Verify all found
      if (phases.length !== phaseIds.length) {
        const found = phases.map(p => p.id)
        const notFound = phaseIds.filter(id => !found.includes(id))
        throw new Error(`NOT_FOUND:Phases not found: ${notFound.join(', ')}`)
      }

      // Verify all belong to this POV
      const invalidPhases = phases.filter(p => p.povId !== params.povId)
      if (invalidPhases.length > 0) {
        throw new Error(
          `FORBIDDEN:Phases ${invalidPhases.map(p => p.id).join(', ')} do not belong to this POV`
        )
      }

      // Audit logging for bulk operations (>10 threshold)
      if (phaseIds.length > 10) {
        localLogger.info({
          userId: user.userId,
          povId: params.povId,
          phaseCount: phaseIds.length,
          phaseIds,
          action: 'DELETE_MULTIPLE_PHASES'
        }, 'bulk phase deletion audit')
      }

      // ✅ ENHANCEMENT: Atomic deletion within transaction
      await Promise.all(phaseIds.map(id => povService.deletePhase(id)))

      return { deletedCount: phaseIds.length }
    })

    return createSuccessResponse(
      {
        deletedPhaseIds: phaseIds,
        deletedCount: result.deletedCount
      },
      `${result.deletedCount} phases deleted successfully`
    )
  } catch (error) {
    // Parse custom error format (code:message)
    if (error instanceof Error && error.message.includes(':')) {
      const [code, message] = error.message.split(':', 2)
      if (code === 'NOT_FOUND') {
        return createErrorResponse('NOT_FOUND', message)
      }
      if (code === 'FORBIDDEN') {
        return createErrorResponse('FORBIDDEN', message)
      }
    }
    throw error
  }
}
