import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { taskLogger } from '@/lib/logger';
import { taskAgentRuntimeFields } from '@/lib/tasks/prisma/select';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/[taskId]/agent - Retrieve agent task configuration and execution history
//
// NOTE: POST /api/tasks/[taskId]/agent was removed (Mar 2026).
// It had zero active callers and set executionStatus: 'PENDING' unconditionally,
// which violated the CAS guard in agentTaskService.ts and bypassed template merging,
// prompt building, and tool resolution.
// Use POST /api/agents/configure for all agent configuration writes.
const getAgentConfigHandler: ApiHandler = async (
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
    const { taskId } = context.params;

    // Get task with agent configuration
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        type: true,

        // Agent runtime fields — shared constant from lib/tasks/prisma/select.ts
        ...taskAgentRuntimeFields,

        // MCP fields
        mcpContext: true,
        mcpToolId: true,
        mcpWorkflowId: true,
        mcpMetadata: true,

        // Related data
        assignee: {
          select: { id: true, name: true, email: true }
        },
        phase: {
          select: { id: true, name: true, type: true }
        },
        pov: {
          select: {
            id: true, title: true, status: true,
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
        }
      }
    });

    if (!task) {
      return {
        error: {
          message: 'Task not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // 🔒 SECURITY: Validate POV access before returning agent config
    if (task.pov) {
      try {
        validatePOVAccess(user, task.pov, {
          throwOnDeny: true,
          logContext: 'Agent Config Read'
        });
      } catch {
        return {
          error: {
            message: 'Access denied - you do not have access to this POV',
            code: 'FORBIDDEN',
          },
        };
      }
    }

    // ============================================================================
    // PARALLEL QUERY OPTIMIZATION (Dec 2025 - 4 independent queries → ~75% faster)
    // All agent performance queries run concurrently instead of sequentially
    // ============================================================================

    const [recentExecutions, totalExecutions, successfulExecutions, completedExecutions] = await Promise.all([
      // Get recent agent executions
      prisma.agentExecution.findMany({
        where: { taskId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
          createdAt: true,
          logs: true
        }
      }),
      // Total execution count
      prisma.agentExecution.count({
        where: { taskId }
      }),
      // selection-exempt: aggregate analytics, not authoritative selection. successRate + avg
      // execution time count/average over ALL SUCCESS runs of this task (superseded included —
      // a superseded run still executed successfully). Superseded-row analytics POLICY is
      // arch-synthesis L-22, deferred to Phase 2. (Was a dead status:'completed' filter →
      // permanently 0; fixed to 'SUCCESS' 2026-07-04, BC-5.)
      prisma.agentExecution.count({
        where: {
          taskId,
          status: 'SUCCESS'
        }
      }),
      // selection-exempt: aggregate analytics (avg execution time over ALL SUCCESS runs; see
      // the count query above — L-22 superseded-analytics policy is Phase 2).
      prisma.agentExecution.findMany({
        where: {
          taskId,
          status: 'SUCCESS',
          startTime: { not: null },
          endTime: { not: null }
        },
        select: {
          startTime: true,
          endTime: true
        }
      })
    ]);

    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    const executionTimes = completedExecutions
      .filter(exec => exec.startTime && exec.endTime)
      .map(exec => exec.endTime!.getTime() - exec.startTime!.getTime());

    const averageExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
      : 0;

    return {
      data: {
        task,
        agentConfig: {
          isConfigured: !!(task.agentRole || task.prompt),
          role: task.agentRole,
          prompt: task.prompt,
          inputContext: task.inputContext,
          outputArtifacts: task.outputArtifacts,
          executionStatus: task.executionStatus,
          maxRetries: task.maxRetries ?? 3,
          timeout: task.timeout,
          mcpIntegration: {
            toolId: task.mcpToolId,
            workflowId: task.mcpWorkflowId,
            context: task.mcpContext,
            metadata: task.mcpMetadata
          }
        },
        performance: {
          totalExecutions,
          successfulExecutions,
          successRate: Math.round(successRate * 100) / 100,
          averageExecutionTime: Math.round(averageExecutionTime / 1000), // seconds
          recentExecutions
        }
      }
    };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'GET /api/tasks/[taskId]/agent' }, 'Failed to retrieve agent configuration');
    return {
      error: {
        message: 'Failed to retrieve agent configuration',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getAgentConfigHandler, { requireAuth: true });
