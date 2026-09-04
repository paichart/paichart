import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { GetAgentExecutionsQuerySchema } from '@/lib/validation/agent-template-validation';
import { logger } from '@/lib/logger';
import { buildPOVAccessFilter } from '@/lib/pov/auth/pov-access-filter';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/agent-executions - Get agent execution history
const getAgentExecutionsHandler: ApiHandler = async (
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
    const { searchParams } = new URL(req.url);

    // P1 FIX: Validate ALL query parameters with schema (Issues #5, #7)
    // Convert null to undefined for optional fields (searchParams.get returns null for missing params)
    const queryParams = {
      povId: searchParams.get('povId') || undefined,
      taskId: searchParams.get('taskId') || undefined,
      status: searchParams.get('status') || undefined,
      dateRange: searchParams.get('dateRange') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined
    };

    const validationResult = GetAgentExecutionsQuerySchema.safeParse(queryParams);

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

    // Context-aware POV filtering:
    // - If povId provided: validate access to that specific POV (faster single-POV query)
    // - If povId omitted: query across all POVs user has access to (dashboard view)

    let taskWhereClause: any = {};

    if (query.povId) {
      // Single-POV query: validate access to specific POV
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
        // Use NOT_FOUND instead of FORBIDDEN to prevent POV enumeration
        return {
          error: {
            message: 'POV not found',
            code: 'NOT_FOUND'
          }
        };
      }

      // Filter by this specific POV
      taskWhereClause = { povId: query.povId };

    } else {
      // Cross-POV query: filter by all POVs user has access to (centralized helper)
      taskWhereClause = {
        pov: buildPOVAccessFilter(user)
      };
    }

    // Calculate date range using validated parameters
    const now = new Date();
    let startDate: Date;

    switch (query.dateRange) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date(0); // All time
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Build where clause with context-aware POV filtering.
    //
    // dateRange='all' must NOT apply a startTime filter: `startTime >= epoch` silently DROPS executions whose
    // startTime is NULL (PENDING/SCHEDULED legitimately have none — they haven't started), which hid them from
    // list views entirely. For 'all' the user wants everything, so omit the date predicate. For a BOUNDED range,
    // keep `startTime >= startDate` — "started in range" is the correct semantic, and not-yet-started executions
    // genuinely fall outside it. (2026-06-09; the NULL-startTime exclusion surfaced via the GUI artifacts incident.)
    const executionWhere = {
      ...(query.dateRange !== 'all' && { startTime: { gte: startDate } }),
      ...(query.taskId && query.taskId !== 'global' && { taskId: query.taskId }),
      ...(query.status && { status: query.status }),
      // Apply context-aware POV filtering
      task: taskWhereClause
    };

    const [executions, totalCount] = await Promise.all([
      prisma.agentExecution.findMany({
        where: executionWhere,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              type: true
            }
          },
          // 2026-06-12: AgentHistoryView renders agentName/agentType — fields
          // this response never carried (card titles were blank; the search
          // box threw on .toLowerCase() of undefined)
          agentTemplate: {
            select: { name: true, category: true }
          }
        },
        // BC66 FIX: Use validated sortBy directly (schema constrains to safe enum)
        orderBy: {
          [query.sortBy ?? 'startTime']: query.sortOrder ?? 'desc'
        },
        take: query.limit,
        skip: query.offset
      }),
      prisma.agentExecution.count({ where: executionWhere })
    ]);

    logger.info({ executionCount: executions.length }, 'Agent Executions found in date range');

    // Process database executions
    const processedExecutions = executions.map(exec => {
      const duration = exec.startTime && exec.endTime 
        ? exec.endTime.getTime() - exec.startTime.getTime() 
        : null;
      
      // Config projection — pull commonly-needed fields out of the JSONB
      // `config` column so clients don't have to know the full shape. Previous
      // behavior set `agentRole` to `exec.agentTemplateId` which is wrong (role
      // is a string like "pipeline_harness_orchestrator", not a CUID). Now
      // reads from config.agentRole with the templateId as a fallback, and
      // also surfaces `model` which the GUI Monitoring tab uses.
      const config = (exec.config && typeof exec.config === 'object') ? (exec.config as any) : {};
      // 2026-06-12: progress — same explicit-estimate pattern as
      // /api/mcp/automations (success=100, FAILED=0, RUNNING=elapsed-based
      // estimate capped at 90; UI labels RUNNING values as estimates).
      // NOTE: AgentExecution's ExecutionStatus is SUCCESS/FAILED — NOT COMPLETED
      // (unlike MCPWorkflowExecution). Was 'COMPLETED' → success showed 0% progress.
      const elapsed = exec.startTime ? Date.now() - exec.startTime.getTime() : 0;
      const progress =
        exec.status === 'SUCCESS' ? 100
        : exec.status === 'FAILED' ? 0
        : exec.status === 'RUNNING' ? Math.min(90, Math.round((elapsed / (30 * 60 * 1000)) * 100))
        : 0;

      return {
        id: exec.id,
        taskId: exec.taskId,
        agentName: exec.agentTemplate?.name || config.agentRole || 'Agent',
        agentType: exec.agentTemplate?.category || 'AGENT',
        agentRole: config.agentRole || exec.agentTemplateId || 'unknown',
        agentTemplateId: exec.agentTemplateId || null,
        model: config.model || null,
        status: exec.status,
        startTime: exec.startTime,
        endTime: exec.endTime,
        duration,
        progress,
        prompt: 'prompt' in config ? String(config.prompt) : 'Agent execution',
        result: typeof exec.context === 'object' && exec.context && 'result' in exec.context
          ? (exec.context as any).result
          : null,
        error: exec.status === 'FAILED' ? 'Execution failed' : null,
        logs: exec.logs || [],
        task: exec.task,
        pov: null, // Not available in current schema
        createdAt: exec.createdAt,
        updatedAt: exec.updatedAt
      };
    });

    return {
      data: {
        executions: processedExecutions,
        pagination: {
          total: totalCount,
          page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
          limit: query.limit || 50,
          totalPages: Math.ceil(totalCount / (query.limit || 50))
        }
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'GET /api/agent-executions failed');
    return {
      error: {
        message: 'Failed to retrieve agent executions',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getAgentExecutionsHandler, { requireAuth: true });
