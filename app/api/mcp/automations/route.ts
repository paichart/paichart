import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { TokenPayload, ApiResponse, ResourceType, ResourceAction } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { ListAutomationsQuerySchema } from '@/lib/validation/mcp-automations-validation';
import { trackActivity } from '@/lib/auth/audit';
import { mcpLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/mcp/automations - Get MCP automations (v4: with POV validation)
const getMCPAutomationsHandler: ApiHandler = async (
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
    mcpLogger.info({ userId: user.userId }, 'Fetching automations for user');

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const rawQuery = Object.fromEntries(searchParams.entries());

    const validation = ListAutomationsQuerySchema.safeParse(rawQuery);
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

    const { taskId, povId, status, limit } = validation.data;

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
        logContext: 'GET /api/mcp/automations'
      });

      if (!hasAccess) {
        return {
          error: {
            message: 'Access denied to POV',
            code: 'FORBIDDEN',
          },
        };
      }
    }

    // Get real agent executions and MCP workflows
    const automations = await getRealAutomations(user.userId, taskId, povId);

    // Filter by status if provided
    let filteredAutomations = automations;
    if (status) {
      filteredAutomations = automations.filter(a => a.status === status);
    }

    // Apply limit if provided
    if (limit) {
      filteredAutomations = filteredAutomations.slice(0, limit);
    }

    // Audit logging
    await trackActivity(user.userId, 'AGENT_EXECUTION', 'VIEW', {
      resourceType: ResourceType.AGENT_EXECUTION,
      action: ResourceAction.VIEW,
      success: true,
      details: `Listed ${filteredAutomations.length} automations`,
      filters: { taskId, povId, status, limit },
      ip: getClientIP(req),
      userAgent: req.headers.get('user-agent') || 'unknown'
    });

    return {
      data: {
        automations: filteredAutomations,
        statistics: {
          totalAutomations: filteredAutomations.length,
          activeAutomations: filteredAutomations.filter(a => a.status === 'RUNNING').length,
          pausedAutomations: filteredAutomations.filter(a => a.status === 'PAUSED').length,
          completedAutomations: filteredAutomations.filter(a => a.status === 'COMPLETED').length,
          averageSuccessRate: filteredAutomations.length > 0 ?
            filteredAutomations.reduce((sum, a) => sum + a.performance.successRate, 0) / filteredAutomations.length : 0,
          totalRuns: filteredAutomations.reduce((sum, a) => sum + a.performance.totalExecutions, 0)
        }
      }
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to fetch automations');

    return {
      error: {
        message: 'Failed to fetch MCP automations',
        code: 'FETCH_FAILED',
      },
    };
  }
};

/**
 * Get real automations from agent executions and MCP workflows
 */
async function getRealAutomations(userId: string, taskId?: string | null, povId?: string | null) {
  // Build filters
  const agentFilters: any = {};
  const workflowFilters: any = {};
  
  if (taskId) {
    agentFilters.taskId = taskId;
  }
  
  if (povId) {
    agentFilters.task = {
      povId: povId
    };
  }

  // Get recent agent executions (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const [agentExecutions, mcpWorkflows] = await Promise.all([
    // Get agent executions
    prisma.agentExecution.findMany({
      where: {
        ...agentFilters,
        startTime: {
          gte: thirtyDaysAgo
        }
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            povId: true,
            status: true
          }
        },
        agentTemplate: {
          select: {
            id: true,
            name: true,
            category: true,
            description: true
          }
        }
      },
      orderBy: { startTime: 'desc' },
      take: 20
    }),
    
    // Get MCP workflow executions
    prisma.mCPWorkflowExecution.findMany({
      where: {
        ...workflowFilters,
        startTime: {
          gte: thirtyDaysAgo
        }
      },
      orderBy: { startTime: 'desc' },
      take: 10
    })
  ]);

  const automations = [];

  // Convert agent executions to automation format
  for (const execution of agentExecutions) {
    if (!execution.startTime) continue; // Skip executions without start time
    
    const duration = execution.endTime ? 
      execution.endTime.getTime() - execution.startTime.getTime() :
      Date.now() - execution.startTime.getTime();

    // Calculate progress based on status and duration
    let progress = 0;
    if (execution.status === 'COMPLETED') progress = 100;
    else if (execution.status === 'FAILED') progress = 0;
    else if (execution.status === 'RUNNING') {
      // Estimate progress based on duration (assume 30 min average execution)
      progress = Math.min(90, Math.round((duration / (30 * 60 * 1000)) * 100));
    }

    automations.push({
      id: execution.id,
      name: `${execution.agentTemplate?.name || 'Agent'}: ${execution.task?.title || 'Task'}`,
      type: 'TASK_ASSIGNMENT',
      status: execution.status,
      taskId: execution.taskId,
      povId: execution.task?.povId,
      progress,
      startedAt: execution.startTime,
      estimatedCompletion: execution.endTime ? execution.endTime : new Date(Date.now() + 30 * 60 * 1000),
      performance: {
        successRate: execution.status === 'COMPLETED' ? 100 : 
                    execution.status === 'FAILED' ? 0 : 85, // Default for running
        averageTime: Math.round(duration / 1000 / 60), // Convert to minutes
        totalExecutions: 1
      },
      lastExecution: {
        timestamp: execution.startTime,
        status: execution.status === 'COMPLETED' ? 'SUCCESS' : 
                execution.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
        duration: Math.round(duration / 1000 / 60),
        result: undefined
      }
    });
  }

  // Convert MCP workflows to automation format
  for (const workflow of mcpWorkflows) {
    const duration = workflow.endTime ? 
      workflow.endTime.getTime() - workflow.startTime.getTime() :
      Date.now() - workflow.startTime.getTime();

    let progress = 0;
    if (workflow.status === 'COMPLETED') progress = 100;
    else if (workflow.status === 'FAILED') progress = 0;
    else if (workflow.status === 'RUNNING') {
      progress = Math.min(90, Math.round((duration / (20 * 60 * 1000)) * 100));
    }

    automations.push({
      id: workflow.id,
      name: `Workflow: ${workflow.workflowId}`,
      type: 'WORKFLOW',
      status: workflow.status,
      taskId: null,
      povId: null,
      progress,
      startedAt: workflow.startTime,
      estimatedCompletion: workflow.endTime ? workflow.endTime : new Date(Date.now() + 20 * 60 * 1000),
      performance: {
        successRate: workflow.status === 'COMPLETED' ? 100 : 
                    workflow.status === 'FAILED' ? 0 : 90,
        averageTime: Math.round(duration / 1000 / 60),
        totalExecutions: 1
      },
      lastExecution: {
        timestamp: workflow.startTime,
        status: workflow.status === 'COMPLETED' ? 'SUCCESS' : 
                workflow.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
        duration: Math.round(duration / 1000 / 60),
        result: workflow.output
      }
    });
  }

  return automations;
}

export const GET = createHandler(getMCPAutomationsHandler, { requireAuth: true });
