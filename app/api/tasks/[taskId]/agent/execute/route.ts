import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { TaskAgentExecuteSchema } from '@/lib/validation/task-validation';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { taskLogger } from '@/lib/logger';
import { createAgentExecution } from '@/lib/services/agent-execution-create';
import { DuplicateActiveExecutionError } from '@/lib/errors';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// POST /api/tasks/[taskId]/agent/execute - Execute agent on task
const executeAgentHandler: ApiHandler = async (
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
    const body = await req.json();

    // ✅ SECURITY: Validate agent execution request (P0-2 CRITICAL - Prompt injection protection)
    const validation = TaskAgentExecuteSchema.safeParse(body);
    if (!validation.success) {
      // Security logging for monitoring prompt injection attempts
      taskLogger.warn({ endpoint: 'POST /api/tasks/[taskId]/agent/execute', userId: user?.userId, taskId: context.params.taskId, errors: validation.error.issues }, 'Agent execute validation failed');

      return {
        error: {
          message: 'Validation failed: ' + validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          code: 'VALIDATION_ERROR',
        },
      };
    }

    const {
      overrideConfig,
      priority = 'MEDIUM',
      scheduledFor,
      metadata
    } = validation.data;

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
        
        // Agent configuration
        agentRole: true,
        prompt: true,
        inputContext: true,
        maxRetries: true,
        timeout: true,
        executionStatus: true,
        
        // MCP configuration
        mcpContext: true,
        mcpToolId: true,
        mcpWorkflowId: true,
        mcpMetadata: true,
        
        // Related data for context
        assignee: {
          select: { id: true, name: true, email: true }
        },
        phase: {
          select: { id: true, name: true, type: true, order: true }
        },
        pov: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            objective: true,
            customerName: true,
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

    // 🔒 SECURITY: Validate POV access before allowing agent execution
    if (task.pov) {
      try {
        validatePOVAccess(user, task.pov, {
          throwOnDeny: true,
          requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
          logContext: 'Agent Execute'
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

    // Check if agent is configured
    if (!task.agentRole && !task.prompt) {
      return {
        error: {
          message: 'Agent not configured for this task. Please configure the agent first.',
          code: 'AGENT_NOT_CONFIGURED',
        },
      };
    }

    // Guard: reject if already executing (preliminary check — atomic CAS below
    // prevents races; L3's DB constraint closes any remaining window).
    // Canonical code 'DUPLICATE_ACTIVE_EXECUTION' across all three duplicate-
    // detection paths in this route + the MCP handler (agentTaskService.ts) +
    // the SSE stream (stream/route.ts). Boundary-contract §B1/§B3 CRITICAL:
    // avoid 'ALREADY_RUNNING' (pre-L3 ad-hoc code) splitting the contract.
    if (task.executionStatus === 'RUNNING' || task.executionStatus === 'PENDING') {
      return {
        error: {
          message: 'Agent is already executing for this task',
          code: 'DUPLICATE_ACTIVE_EXECUTION',
        },
      };
    }

    // Prepare execution configuration
    const executionConfig = {
      agentRole: overrideConfig?.agentRole || task.agentRole,
      prompt: overrideConfig?.prompt || task.prompt,
      inputContext: overrideConfig?.inputContext || task.inputContext,
      maxRetries: overrideConfig?.maxRetries ?? task.maxRetries ?? 3,
      timeout: overrideConfig?.timeout ?? task.timeout ?? 300000,
      priority,
      
      // MCP configuration
      mcpToolId: overrideConfig?.mcpToolId || task.mcpToolId,
      mcpWorkflowId: overrideConfig?.mcpWorkflowId || task.mcpWorkflowId,
      mcpContext: overrideConfig?.mcpContext || task.mcpContext,
      mcpMetadata: overrideConfig?.mcpMetadata || task.mcpMetadata,
      
      // Additional metadata
      metadata: {
        ...metadata,
        triggeredBy: user.userId,
        triggeredAt: new Date().toISOString(),
        taskContext: {
          id: task.id,
          title: task.title,
          description: task.description,
          type: task.type,
          phase: task.phase,
          pov: task.pov,
          assignee: task.assignee
        }
      }
    };

    // Create agent execution via canonical wrapper (task #85). Note: the
    // previous code stored `triggeredBy: {id, email}` — the schema now
    // requires `{id, source}` instead (email was unused downstream; if
    // needed for audit it lives in the forensic Activity record).
    //
    // 2026-04-18 L3: throws DuplicateActiveExecutionError if the partial
    // UNIQUE index rejects a concurrent duplicate. Return HTTP 409 via
    // createHandler convention (NOT NextResponse.json) with the canonical
    // DUPLICATE_ACTIVE_EXECUTION code matching the pre-create guard above.
    let execution;
    try {
      ({ execution } = await createAgentExecution({
        taskId,
        status: scheduledFor ? 'SCHEDULED' : 'PENDING',
        config: executionConfig,
        triggeredBy: {
          id: user.userId,
          source: 'api-task-execute',
        },
        contextExtras: {
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            type: task.type,
          },
          phase: task.phase,
          pov: task.pov,
          assignee: task.assignee,
        },
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        povId: task.pov?.id ?? null,
      }));
    } catch (err) {
      if (err instanceof DuplicateActiveExecutionError) {
        return {
          error: {
            message:
              `Agent is already executing for this task. ` +
              `Existing execution: ${err.existingExecutionId ?? 'unknown'}. ` +
              `Wait for it to complete, or cancel it before re-executing.`,
            code: 'DUPLICATE_ACTIVE_EXECUTION',
          },
        };
      }
      throw err;
    }

    // Atomic CAS: only claim task if not already executing (prevents duplicate execution race)
    const targetStatus = scheduledFor ? 'READY' : 'PENDING';
    const claimed = await prisma.task.updateMany({
      where: {
        id: taskId,
        executionStatus: { notIn: ['RUNNING', 'PENDING', 'READY'] }
      },
      data: {
        executionStatus: targetStatus,
        updatedAt: new Date()
      }
    });

    if (claimed.count === 0) {
      // Race lost — clean up orphaned execution record. Same canonical code
      // as the pre-create guard above; avoid the split-code hazard where
      // the same condition appears under two different codes on one surface.
      await prisma.agentExecution.delete({ where: { id: execution.id } }).catch(() => {});
      return {
        error: {
          message: 'Agent is already executing for this task',
          code: 'DUPLICATE_ACTIVE_EXECUTION',
        },
      };
    }

    // TODO: Here you would typically dispatch the execution to your agent system
    // For now, we'll just return the execution details
    
    return {
      data: {
        message: scheduledFor 
          ? 'Agent execution scheduled successfully' 
          : 'Agent execution triggered successfully',
        execution: {
          id: execution.id,
          status: execution.status,
          scheduledFor: execution.startTime,
          config: execution.config,
          createdAt: execution.createdAt
        },
        task: {
          id: task.id,
          title: task.title,
          executionStatus: scheduledFor ? 'READY' : 'PENDING'
        },
        nextSteps: scheduledFor 
          ? ['Agent will execute at the scheduled time', 'Monitor execution status via GET /api/tasks/{taskId}/agent']
          : ['Agent execution is queued', 'Monitor execution status via GET /api/tasks/{taskId}/agent', 'Check execution logs for progress']
      }
    };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'POST /api/tasks/[taskId]/agent/execute' }, 'Failed to execute agent');
    return {
      error: {
        message: 'Failed to execute agent',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const POST = createHandler(executeAgentHandler, { requireAuth: true });
