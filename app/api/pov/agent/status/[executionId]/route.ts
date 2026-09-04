import { NextRequest } from 'next/server';
import createHandler from '@/lib/api-handler';
import { prisma } from '@/lib/prisma';
import { UserRole, TokenPayload } from '@/lib/types/auth';
import { AgentExecutionResponse } from '@/lib/pov/api/agent-service';
import { ExecutionStatus } from '@/components/poveditor/pov/context/types/EntityTypes';
import { getPOVFromExecution } from '@/lib/utils/pov-helpers';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { agentOperationsLimiter } from '@/lib/middleware/rate-limit';
import { povLogger } from '@/lib/logger';

/**
 * GET /api/pov/agent/status/[executionId]
 * Get the status of an agent execution
 *
 * SECURITY: POV access validation (P1 Fix - Nov 2025)
 * - Was vulnerability: Information disclosure (view any execution)
 * - Now: Validates POV ownership before returning status
 * Risk: HIGH → LOW
 */
export const GET = createHandler(
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

    // ✅ P1 FIX: Validate POV access
    try {
      validatePOVAccess(user!, pov, {
        throwOnDeny: true,
        logContext: 'Execution Status'
      });
    } catch (error) {
      povLogger.error({ userId: user!.userId, executionId, povId: pov.id }, 'SECURITY: cross-POV status view denied');

      return {
        error: {
          message: 'POV access denied',
          code: 'FORBIDDEN',
        },
      };
    }

    // ✅ Security check passed - now fetch execution details
    const execution = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      include: {
        artifacts: true,
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
    
    // Return execution response
    const response: AgentExecutionResponse = {
      executionId: execution.id,
      status: execution.status as ExecutionStatus,
      startTime: execution.startTime?.toISOString() || new Date().toISOString(),
      endTime: execution.endTime?.toISOString(),
      logs: execution.logs || [],
      artifacts: execution.artifacts.map((artifact: any) => ({
        id: artifact.id,
        name: artifact.name,
        type: artifact.type,
        content: artifact.content,
        createdAt: artifact.createdAt.toISOString(),
      })),
    };
    
    return { data: response };
  },
  { requireAuth: true, allowedRoles: [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN] }
);
