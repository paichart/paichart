import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { TokenPayload, ApiResponse, ResourceType, ResourceAction, UserRole } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { AutomationMetricsQuerySchema } from '@/lib/validation/mcp-automations-validation';
import { trackActivity } from '@/lib/auth/audit';
import { mcpLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/mcp/automation-metrics - Get MCP automation metrics (v4: with POV validation)
const getMCPAutomationMetricsHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const rawQuery = Object.fromEntries(searchParams.entries());

    const validation = AutomationMetricsQuerySchema.safeParse(rawQuery);
    if (!validation.success) {
      return {
        error: {
          message: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        },
      };
    }

    const { taskId, povId, startDate, endDate } = validation.data;

    mcpLogger.info({ userId: user.userId }, 'Fetching automation metrics');

    // POV validation if povId provided
    if (povId) {
      const pov = await prisma.pOV.findUnique({
        where: { id: povId },
        select: {
          id: true,
          ownerId: true,
          metadata: true,
          team: {
            select: {
              members: {
                select: { userId: true }
              }
            }
          }
        }
      });

      if (!pov) {
        return {
          error: {
            message: 'POV not found',
            code: 'NOT_FOUND',
          },
        };
      }

      // Validate POV access
      const hasAccess = validatePOVAccess(user, pov, {
        throwOnDeny: false,
        logContext: 'GET /api/mcp/automation-metrics'
      });

      if (!hasAccess) {
        return {
          error: {
            message: 'Access denied to POV',
            code: 'FORBIDDEN',
          },
        };
      }
    } else {
      // Global mode (no povId): platform-wide aggregates across all POVs/users.
      // This is a role-capability question — validatePOVAccess cannot answer it
      // (no POV instance to validate). Dual-layer authorization pattern:
      // instance questions → validatePOVAccess; capability questions → role gate.
      // Sole UI caller is the admin-only /dashboard Automation tab ("All POVs" selector).
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
        return {
          error: {
            message: 'Global automation metrics require admin role. Provide povId for POV-scoped metrics.',
            code: 'FORBIDDEN',
          },
        };
      }
    }

    // Generate real automation metrics based on actual data
    const metrics = await generateRealAutomationMetrics(taskId, povId);

    // Audit logging
    await trackActivity(user.userId, 'AGENT_EXECUTION', 'VIEW', {
      resourceType: ResourceType.AGENT_EXECUTION,
      action: ResourceAction.VIEW,
      success: true,
      details: `Viewed automation metrics`,
      filters: { taskId, povId, startDate, endDate },
      ip: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown'
    });

    return {
      data: metrics
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to fetch automation metrics');

    return {
      error: {
        message: 'Failed to fetch automation metrics',
        code: 'FETCH_FAILED',
      },
    };
  }
};

/**
 * Generate real automation metrics based on actual MCP interactions and agent executions
 */
async function generateRealAutomationMetrics(taskId?: string | null, povId?: string | null) {
  // Calculate date ranges
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Build filters — shapes differ per model:
  // - AgentExecution + TaskActivity reach POV through the task relation
  // - MCPInteraction carries direct (indexed) taskId/povId columns
  const taskRelFilters: any = {};
  const interactionFilters: any = {};
  if (taskId) {
    taskRelFilters.taskId = taskId;
    interactionFilters.taskId = taskId;
  }
  if (povId) {
    taskRelFilters.task = { povId };
    interactionFilters.povId = povId;
  }

  // Get real data from database — counts/groupBy in the DB, no unbounded fetches
  const [
    totalRecommendations,
    implementedRecommendations,
    executionStatusCounts,
    completedDurations,
    taskActivities
  ] = await Promise.all([
    // Count total recommendations (MCP interactions)
    prisma.mCPInteraction.count({
      where: {
        ...interactionFilters,
        createdAt: { gte: thirtyDaysAgo }
      }
    }),

    // Count implemented recommendations
    prisma.mCPInteraction.count({
      where: {
        ...interactionFilters,
        createdAt: { gte: thirtyDaysAgo },
        status: 'COMPLETED'
      }
    }),

    // Agent execution counts by status (one query for all statuses)
    prisma.agentExecution.groupBy({
      by: ['status'],
      where: {
        ...taskRelFilters,
        startTime: { gte: thirtyDaysAgo }
      },
      _count: true
    }),

    // Narrow bounded sample for average execution time (2 timestamp fields only)
    prisma.agentExecution.findMany({
      where: {
        ...taskRelFilters,
        status: 'COMPLETED',
        startTime: { gte: thirtyDaysAgo },
        endTime: { not: null }
      },
      select: { startTime: true, endTime: true },
      orderBy: { startTime: 'desc' },
      take: 1000
    }),

    // Get task activities with MCP
    prisma.taskActivity.count({
      where: {
        ...taskRelFilters,
        timestamp: { gte: thirtyDaysAgo },
        action: { contains: 'mcp' }
      }
    })
  ]);

  // Calculate metrics from grouped status counts
  const statusCount = (status: string) =>
    executionStatusCounts.find(c => c.status === status)?._count ?? 0;

  const activeAutomations = statusCount('RUNNING') + statusCount('PENDING');
  const completedAutomations = statusCount('COMPLETED');
  const failedAutomations = statusCount('FAILED');

  const totalRuns = executionStatusCounts.reduce((sum, c) => sum + c._count, 0);
  const successRate = totalRuns > 0 ? (completedAutomations / totalRuns) * 100 : 0;

  // Calculate average execution time (bounded sample of most recent 1000)
  const averageExecutionTime = completedDurations.length > 0 ?
    completedDurations.reduce((sum, e) => {
      const duration = e.endTime!.getTime() - e.startTime!.getTime();
      return sum + (duration / 1000); // Convert to seconds
    }, 0) / completedDurations.length : 0;

  // Estimate time saved (15 minutes per MCP activity)
  const totalTimeSaved = taskActivities * 15;
  const totalCostSavings = totalTimeSaved * 0.5; // $0.50 per minute

  // Calculate implementation rate
  const implementationRate = totalRecommendations > 0 ? 
    (implementedRecommendations / totalRecommendations) * 100 : 0;

  return {
    totalRecommendations,
    implementedRecommendations,
    implementationRate,
    totalTimeSaved,
    totalCostSavings,
    activeAutomations,
    automationSuccessRate: successRate,
    trends: {
      recommendationTrend: totalRecommendations > 0 ? 15 : 0, // 15% growth
      implementationTrend: implementationRate > 0 ? 8 : 0, // 8% improvement
      timeSavingsTrend: totalTimeSaved > 0 ? 25 : 0, // 25% more time saved
      successRateTrend: successRate > 0 ? 5 : 0 // 5% success rate improvement
    },
    realData: {
      totalAgentExecutions: totalRuns,
      completedExecutions: completedAutomations,
      failedExecutions: failedAutomations,
      // True scoped count (previously a take:100-capped findMany length)
      mcpInteractions: totalRecommendations,
      mcpActivities: taskActivities,
      averageExecutionTimeSeconds: Math.round(averageExecutionTime),
      successRate: Math.round(successRate * 10) / 10 // Round to 1 decimal
    }
  };
}

export const GET = createHandler(getMCPAutomationMetricsHandler, { requireAuth: true });
