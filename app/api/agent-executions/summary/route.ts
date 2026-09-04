import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { GetAgentExecutionsSummaryQuerySchema } from '@/lib/validation/agent-template-validation';
import { handleAgentsDomain } from '@/app/api/analytics/domains/agents';
import { logger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// ============================================================================
// GET /api/agent-executions/summary - DEPRECATED (Backward Compatibility Wrapper)
// ============================================================================
// This endpoint is DEPRECATED in favor of unified endpoint.
// Use: GET /api/analytics?domain=agents&metrics=summary
//
// Sunset Date: 2026-06-12 (6 months from now)
//
// This wrapper calls the unified handler directly (no network overhead).
// Maintains backward compatibility for existing clients during migration period.
//
// Part 2: Endpoint Consolidation (Phase 3/5)
// ============================================================================

const getAgentExecutionsSummaryHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  // Deprecation logging for sunset planning
  logger.warn({ endpoint: 'GET /api/agent-executions/summary', userId: user?.userId, migration: 'Use GET /api/analytics?domain=agents&metrics=summary instead', sunsetDate: '2026-06-12' }, 'Deprecation: Old endpoint used');

  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    const { searchParams } = new URL(req.url);

    // Validate query parameters
    const queryParams = {
      povId: searchParams.get('povId') || undefined,
      taskId: searchParams.get('taskId') || undefined,
      timeRange: searchParams.get('timeRange') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      groupBy: searchParams.get('groupBy') || undefined
    };

    const validationResult = GetAgentExecutionsSummaryQuerySchema.safeParse(queryParams);

    if (!validationResult.success) {
      return {
        error: {
          message: 'Invalid query parameters',
          code: 'INVALID_REQUEST',
          details: validationResult.error.flatten()
        }
      };
    }

    const query = validationResult.data;

    // Validate POV access if povId provided
    if (query.povId) {
      const pov = await prisma.pOV.findUnique({ where: { id: query.povId } });

      if (!pov) {
        return {
          error: {
            message: 'POV not found',
            code: 'NOT_FOUND'
          }
        };
      }

      const hasAccess = await validatePOVAccess(user, pov);

      if (!hasAccess) {
        return {
          error: {
            message: 'POV not found',
            code: 'NOT_FOUND'
          }
        };
      }
    }

    // Map to unified format
    const unifiedParams = {
      domain: 'agents' as const,
      metrics: ['summary'],
      povId: query.povId,
      timeRange: query.timeRange as '7d' | '30d' | '90d' | '1y' | undefined,
    };

    // ✅ Call unified handler DIRECTLY (no network overhead)
    const result = await handleAgentsDomain(unifiedParams, user);

    // Extract summary from result (maintain old response structure)
    return {
      data: result.data.summary
    };

  } catch (error) {
    logger.error({ err: error }, 'GET /api/agent-executions/summary failed');
    return {
      error: {
        message: 'Failed to retrieve agent execution summary',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getAgentExecutionsSummaryHandler, { requireAuth: true });
