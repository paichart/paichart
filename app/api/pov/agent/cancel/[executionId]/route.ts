import { NextRequest } from 'next/server';
import createHandler from '@/lib/api-handler';
import { prisma } from '@/lib/prisma';
import { UserRole, TokenPayload } from '@/lib/types/auth';
import { ExecutionStatus } from '@/components/poveditor/pov/context/types/EntityTypes';
import { getPOVFromExecution } from '@/lib/utils/pov-helpers';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { agentOperationsLimiter } from '@/lib/middleware/rate-limit';
import { povLogger } from '@/lib/logger';

/**
 * POST /api/pov/agent/cancel/[executionId]
 * Cancel an agent execution
 *
 * SECURITY: POV access validation (P1 Fix - Nov 2025)
 * - Was CRITICAL vulnerability: Any user could cancel any execution
 * - Now: Validates POV ownership before allowing cancel
 * Risk: CRITICAL → LOW
 */
export const POST = createHandler(
  async (req: NextRequest, context: { params: Record<string, string> }, user?: TokenPayload) => {
    // ✅ Rate limiting: 50 operations per minute
    const rateLimitResponse = agentOperationsLimiter(req);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { executionId } = context.params;

    // ✅ P1 FIX: Get POV context and validate access
    const pov = await getPOVFromExecution(executionId);

    if (!pov) {
      return {
        error: {
          message: 'Execution not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // ✅ P1 FIX: Validate POV access before allowing cancel
    try {
      validatePOVAccess(user!, pov, {
        throwOnDeny: true,
        requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
        logContext: 'Cancel Execution'
      });
    } catch (error) {
      povLogger.error({ userId: user!.userId, executionId, povId: pov.id }, 'SECURITY: cross-POV cancel attempt denied');

      return {
        error: {
          message: 'POV access denied',
          code: 'FORBIDDEN',
        },
      };
    }

    // ✅ Security check passed - now fetch execution for status check
    const execution = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!execution) {
      return {
        error: {
          message: 'Execution not found',
          code: 'NOT_FOUND',
        },
      };
    }
    
    // Atomic compare-and-swap: only cancel if still in a cancelable state
    // Prevents race where two concurrent cancel requests or a cancel + completion race
    const cancelableStatuses: ExecutionStatus[] = ['PENDING', 'READY', 'RUNNING'];
    if (!cancelableStatuses.includes(execution.status as ExecutionStatus)) {
      return {
        error: {
          message: `Cannot cancel execution with status ${execution.status}`,
          code: 'INVALID_STATE',
        },
      };
    }

    // Atomic CAS: updateMany with status guard ensures only one caller wins
    const result = await prisma.agentExecution.updateMany({
      where: {
        id: executionId,
        status: { in: cancelableStatuses },
      },
      data: {
        status: 'FAILED' as ExecutionStatus,
        endTime: new Date(),
        logs: ['Execution canceled by user'],
      },
    });

    if (result.count === 0) {
      return {
        error: {
          message: 'Execution already completed or canceled',
          code: 'INVALID_STATE',
        },
      };
    }
    
    // TODO: Integrate with job queue to cancel running jobs (see A3 in IMPLEMENTATION-PLAN.md, depends on A1)
    
    return { data: { message: 'Execution canceled successfully' } };
  },
  { requireAuth: true, allowedRoles: [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN] }
);
