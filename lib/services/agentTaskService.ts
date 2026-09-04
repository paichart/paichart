import { prisma } from '@/lib/prisma';
import { taskLogger } from '@/lib/logger';
import { ExecutionStatus } from '@prisma/client';
import { createAgentExecution } from './agent-execution-create';
import { buildTemplateModelParameters } from './llm/template-model-params';
import { ApiError, ErrorCode, DuplicateActiveExecutionError } from '@/lib/errors';
// (logFieldChange / TaskActivityAction / ActivityMetadata imports removed 2026-06-08, TS4 —
//  their sole consumer, configureAgentForTask, was deleted as dead code.)

export interface AgentConfiguration {
  agentRole?: string;
  prompt?: string;
  inputContext?: any;
  maxRetries?: number;
  timeout?: number;
  mcpToolId?: string;
  mcpWorkflowId?: string;
  mcpContext?: any;
  mcpMetadata?: any;
  modelParameters?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    stopSequences?: string[];
    useSystemPrompt?: boolean;
    [key: string]: any;
  };
}

export interface AgentExecution {
  id: string;
  taskId: string;
  status: string;
  config: any;
  context: any;
  logs: any[];
  startTime: Date | null;
  endTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentExecutionSummary {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  runningExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  lastExecution: Date | null;
}

export class AgentTaskService {
  // (configureAgentForTask removed 2026-06-08, TS4 — verified zero callers / dead code.
  //  The live MCP configure path is lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts.)

  /**
   * Execute agent on a task
   */
  static async executeAgentOnTask(
    taskId: string,
    options: {
      overrideConfig?: Partial<AgentConfiguration>;
      priority?: string;
      scheduledFor?: Date;
      metadata?: any;
      /** Calling agent-execution id when this execute was issued from inside another
       *  execution (agent-loop tool call). Becomes triggeredBy.parentExecutionId —
       *  the retry-provenance gate (keep-best 2026-07-04). Human paths never set it. */
      callingExecutionId?: string;
    },
    userId: string
  ): Promise<AgentExecution> {
    try {
      // Get task with current configuration
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          phase: { select: { id: true, name: true, type: true } },
          pov: { 
            select: { 
              id: true, 
              title: true, 
              description: true,
              status: true,
              objective: true,
              solution: true,
              customerName: true,
              revenue: true,
              priority: true,
              ownerId: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              // Add team info for execution context
              team: {
                select: {
                  members: {
                    select: {
                      role: true,
                      user: {
                        select: {
                          id: true,
                          name: true,
                          email: true
                        }
                      }
                    }
                  }
                }
              }
            } 
          },
          agentTemplate: {
            select: {
              id: true,
              name: true,
              promptTemplate: true,
              defaultRole: true,
              capabilities: true,
              constraints: true,
              metadata: true,
              maxRetries: true,
              timeout: true,
              priority: true
            }
          }
        }
      });

      if (!task) {
        throw new Error('Task not found');
      }

      // Check if agent is configured
      if (!task.agentRole && !task.prompt) {
        throw new Error('Agent not configured for this task');
      }

      // Guard: reject if already executing (preliminary check — atomic CAS below
      // prevents races; L3's DB constraint closes any remaining window). Use the
      // typed ApiError with ErrorCode.DUPLICATE_RECORD (maps to HTTP 409) so MCP
      // clients + REST consumers get a routable `.code`. Canonical code across
      // both guards in this file AND the L3 DB constraint is 'DUPLICATE_ACTIVE_EXECUTION'.
      if (task.executionStatus === 'RUNNING' || task.executionStatus === 'PENDING') {
        throw new ApiError(
          ErrorCode.DUPLICATE_RECORD,
          'Agent is already executing for this task',
          { taskId, executionStatus: task.executionStatus, code: 'DUPLICATE_ACTIVE_EXECUTION' }
        );
      }

      // Get model parameters from task metadata or agent template
      let modelParameters = {};
      
      // Priority: 1. Override config, 2. Task metadata, 3. Agent template defaults
      if (options.overrideConfig?.modelParameters) {
        modelParameters = options.overrideConfig.modelParameters;
        taskLogger.debug({ taskId, source: 'override' }, 'using model parameters');
      } else if (task.metadata && (task.metadata as any).modelParameters && Object.keys((task.metadata as any).modelParameters).length > 0) {
        // Only use task metadata if modelParameters is not empty
        modelParameters = (task.metadata as any).modelParameters;
        taskLogger.debug({ taskId, source: 'taskMetadata' }, 'using model parameters');
      } else if (task.agentTemplate) {
        // Build from the template's OWN fields only — no hardcoded provider/model/
        // temperature base (those shadowed the real resolution). model/temperature/
        // provider resolve downstream at normalizeModelConfig. 2026-06-18 cleanup.
        modelParameters = buildTemplateModelParameters(task.agentTemplate);
        taskLogger.debug({ taskId, source: 'agentTemplate' }, 'using model parameters');
      } else {
        taskLogger.debug({ taskId }, 'no model parameters found in any source');
      }

      // Dependency context chaining now happens centrally inside
      // createAgentExecution (the row-creation chokepoint, covering ALL execution
      // paths — not just this one). It writes task.inputContext; the engine/poller
      // reads it fresh for §6 Pipeline Context. The skip-on-override semantics this
      // path used to enforce inline are preserved via the `skipChaining` arg below.
      // config.inputContext below is NOT used for §6 (VERIFY-1) — vestigial snapshot.
      // See IMPLEMENTATION-PLAN-v2.md (Change 3).
      const freshTask = await prisma.task.findUnique({
        where: { id: taskId },
        select: { inputContext: true },
      });

      // Prepare execution configuration
      const executionConfig = {
        agentRole: options.overrideConfig?.agentRole || task.agentRole || task.agentTemplate?.defaultRole,
        prompt: options.overrideConfig?.prompt || task.prompt || task.agentTemplate?.promptTemplate,
        inputContext: options.overrideConfig?.inputContext || freshTask?.inputContext || task.inputContext,
        maxRetries: options.overrideConfig?.maxRetries ?? task.maxRetries ?? 3,
        timeout: options.overrideConfig?.timeout ?? task.timeout ?? 300000,
        priority: options.priority || 'MEDIUM',
        
        // Model parameters
        ...modelParameters,
        
        // MCP configuration
        mcpToolId: options.overrideConfig?.mcpToolId || task.mcpToolId,
        mcpWorkflowId: options.overrideConfig?.mcpWorkflowId || task.mcpWorkflowId,
        mcpContext: options.overrideConfig?.mcpContext || task.mcpContext,
        mcpMetadata: options.overrideConfig?.mcpMetadata || task.mcpMetadata,
        
        // Additional metadata
        metadata: {
          ...options.metadata,
          // BC-T6-1 sibling sweep (2026-07-17): was `triggeredBy: userId` while the shared
          // reactor helper (agentExecutionConfigBuilder) writes a SOURCE STRING under the
          // same key — a semantic collision (user CUID vs 'task-ready-reactor') waiting for
          // its first reader. Zero readers today (verified — all consumers use the canonical
          // Zod-validated context.triggeredBy, where the user id already lives as .id).
          // Aligned to the helper's source-string semantics. Rows before 2026-07-17 carry a
          // user CUID here on the engine path.
          triggeredBy: 'engine-direct',
          triggeredAt: new Date().toISOString()
        }
      };

      // Create execution record via canonical wrapper (task #85). Wrapper
      // validates triggeredBy shape with Zod, writes the row, and fires
      // fire-and-forget forensic audit. Throws BoundaryContractViolation on
      // schema drift — should never happen on this direct path since we
      // construct the shape ourselves, but the contract is enforced.
      //
      // 2026-04-18 L3: also throws DuplicateActiveExecutionError if the
      // partial UNIQUE index rejects a concurrent duplicate create. Convert
      // to ApiError(DUPLICATE_RECORD) so MCP clients see a routable `.code`.
      let execution;
      try {
        ({ execution } = await createAgentExecution({
          taskId,
          agentTemplateId: task.agentTemplateId || undefined,
          status: options.scheduledFor ? 'SCHEDULED' : 'PENDING',
          config: executionConfig,
          triggeredBy: {
            id: userId,
            source: 'mcp-direct',
            ...(options.callingExecutionId ? { parentExecutionId: options.callingExecutionId } : {}),
          },
          contextExtras: {
            task: {
              id: task.id,
              title: task.title,
              description: task.description,
              type: task.type,
              status: task.status,
              priority: task.priority,
            },
            phase: task.phase,
            pov: task.pov,
            assignee: task.assignee,
          },
          scheduledFor: options.scheduledFor || null,
          povId: task.pov?.id ?? null,
          // Preserve v1 skip-on-override: an explicit inputContext override must
          // not be clobbered by dependency chaining (TS3).
          skipChaining: !!options.overrideConfig?.inputContext,
        }));
      } catch (err) {
        if (err instanceof DuplicateActiveExecutionError) {
          throw new ApiError(
            ErrorCode.DUPLICATE_RECORD,
            `Agent is already executing for this task. ` +
              `Existing execution: ${err.existingExecutionId ?? 'unknown'}. ` +
              `Wait for it to complete, or cancel it before re-executing.`,
            {
              taskId: err.taskId,
              existingExecutionId: err.existingExecutionId,
              code: 'DUPLICATE_ACTIVE_EXECUTION',
            }
          );
        }
        throw err;
      }
      
      taskLogger.info({ executionId: execution.id, taskId: execution.taskId, status: execution.status }, 'agent execution created');

      // Atomic CAS: only claim task if it's not already executing (prevents duplicate execution race)
      // NOTE: SQL `NULL NOT IN (...)` evaluates to UNKNOWN (treated as FALSE), so we must
      // explicitly include NULL via OR to allow execution of tasks never previously executed.
      const targetStatus = options.scheduledFor ? 'READY' : 'PENDING';
      const claimed = await prisma.task.updateMany({
        where: {
          id: taskId,
          OR: [
            { executionStatus: null },
            { executionStatus: { notIn: ['RUNNING', 'PENDING', 'READY'] } },
          ],
        },
        data: {
          executionStatus: targetStatus,
          updatedAt: new Date()
        }
      });

      if (claimed.count === 0) {
        // Race lost — clean up the orphaned execution record and surface the
        // duplicate via the same typed ApiError used by the pre-create guard.
        // Pre-L3 this was the ONLY race guard; post-L3 the DB constraint at
        // createAgentExecution also fires (that catch above), but this CAS
        // check still wins the race in the common case (no L3 P2002 roundtrip).
        await prisma.agentExecution.delete({ where: { id: execution.id } }).catch(() => {});
        throw new ApiError(
          ErrorCode.DUPLICATE_RECORD,
          'Agent is already executing for this task',
          { taskId, code: 'DUPLICATE_ACTIVE_EXECUTION' }
        );
      }

      return execution;
    } catch (error) {
      taskLogger.error({ err: error, taskId }, 'executeAgentOnTask failed');
      throw error;
    }
  }

  /**
   * Get agent executions for a task or globally
   */
  static async getAgentExecutions(filters: {
    taskId?: string;
    status?: string;
    povId?: string;
    phaseId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'startTime' | 'endTime' | 'status';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    executions: AgentExecution[];
    total: number;
    statistics: AgentExecutionSummary;
  }> {
    try {
      // Build where clause
      const where: any = {};
      
      if (filters.taskId) where.taskId = filters.taskId;
      if (filters.status) where.status = filters.status;
      
      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
      }

      if (filters.povId || filters.phaseId) {
        where.task = {};
        if (filters.povId) where.task.povId = filters.povId;
        if (filters.phaseId) where.task.phaseId = filters.phaseId;
      }

      // Parallel query optimization (Dec 2025 - count + findMany → ~50% faster)
      const [executions, total] = await Promise.all([
        // Get executions
        prisma.agentExecution.findMany({
          where,
          include: {
            task: {
              select: {
                id: true,
                title: true,
                description: true,
                status: true,
                priority: true,
                type: true,
                assignee: { select: { id: true, name: true, email: true } },
                phase: { select: { id: true, name: true, type: true } },
                pov: { select: { id: true, title: true, status: true } }
              }
            }
          },
          orderBy: {
            // BC66 FIX: Allowlist prevents dynamic orderBy injection
            [(['createdAt', 'updatedAt', 'startTime', 'endTime', 'status'] as const).includes(filters.sortBy as any) ? filters.sortBy! : 'createdAt']: filters.sortOrder || 'desc'
          },
          skip: Math.max(0, filters.offset || 0),
          take: Math.min(Math.max(1, filters.limit || 50), 100)
        }),
        // Get total count
        prisma.agentExecution.count({ where })
      ]);

      // Calculate statistics
      const stats = await this.calculateExecutionStatistics(where);

      return {
        executions,
        total,
        statistics: stats
      };
    } catch (error) {
      taskLogger.error({ err: error }, 'getAgentExecutions failed');
      throw error;
    }
  }

  /**
   * Get agent configuration for a task
   */
  static async getAgentConfiguration(taskId: string): Promise<{
    task: any;
    agentConfig: any;
    performance: AgentExecutionSummary;
  }> {
    try {
      // Get task with agent configuration
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          phase: { select: { id: true, name: true, type: true } },
          pov: { select: { id: true, title: true, status: true } }
        }
      });

      if (!task) {
        throw new Error('Task not found');
      }

      // Get performance statistics
      const performance = await this.calculateExecutionStatistics({ taskId });

      // Get recent executions
      const recentExecutions = await prisma.agentExecution.findMany({
        where: { taskId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
          createdAt: true
        }
      });

      return {
        task,
        agentConfig: {
          isConfigured: !!(task.agentRole || task.prompt),
          role: task.agentRole,
          prompt: task.prompt,
          inputContext: task.inputContext,
          maxRetries: task.maxRetries,
          timeout: task.timeout,
          executionStatus: task.executionStatus,
          mcpIntegration: {
            toolId: task.mcpToolId,
            workflowId: task.mcpWorkflowId,
            context: task.mcpContext,
            metadata: task.mcpMetadata
          }
        },
        performance: performance as any
      };
    } catch (error) {
      taskLogger.error({ err: error, taskId }, 'getAgentConfiguration failed');
      throw error;
    }
  }

  /**
   * Calculate execution statistics
   */
  private static async calculateExecutionStatistics(where: any): Promise<AgentExecutionSummary> {
    try {
      // Parallel query optimization (Dec 2025 - 6 independent queries → ~83% faster)
      const [
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        runningExecutions,
        completedExecutions,
        lastExecution
      ] = await Promise.all([
        // Total executions count
        prisma.agentExecution.count({ where }),
        // Successful executions count
        prisma.agentExecution.count({
          where: { ...where, status: ExecutionStatus.SUCCESS }
        }),
        // Failed executions count
        prisma.agentExecution.count({
          where: { ...where, status: ExecutionStatus.FAILED }
        }),
        // Running executions count
        prisma.agentExecution.count({
          where: { ...where, status: ExecutionStatus.RUNNING }
        }),
        // Completed executions for average time calculation
        prisma.agentExecution.findMany({
          where: {
            ...where,
            status: ExecutionStatus.SUCCESS,
            startTime: { not: null },
            endTime: { not: null }
          },
          select: { startTime: true, endTime: true },
          take: 5000,
        }),
        // Last execution
        prisma.agentExecution.findFirst({
          where,
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
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
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        runningExecutions,
        successRate: Math.round(successRate * 100) / 100,
        averageExecutionTime: Math.round(averageExecutionTime / 1000), // Convert to seconds
        lastExecution: lastExecution?.createdAt || null
      };
    } catch (error) {
      taskLogger.error({ err: error }, 'calculateExecutionStatistics failed');
      throw error;
    }
  }

}
