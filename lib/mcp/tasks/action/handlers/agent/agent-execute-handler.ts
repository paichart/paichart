import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { mcpLogger } from '@/lib/logger';
import { ExecutionNotClaimableError } from '@/lib/errors';

const log = mcpLogger.child({ module: 'AgentExecuteHandler' });

/**
 * Agent Execute Handler
 *
 * Handles agent execution for tasks via MCP.
 * Triggers immediate execution via the agent execution engine.
 *
 * @class AgentExecuteHandler
 * @description Triggers immediate agent execution for tasks with optional priority and scheduling.
 *   Validates configuration and POV access before execution.
 *
 *   Key Features:
 *   - Validates agent configuration (role/template required)
 *   - POV access validation via validatePOVAccess
 *   - Priority and scheduling support
 *   - Configuration override capability
 *   - Queues execution via agent execution engine
 *
 * @param {Object} parameters - Agent execution parameters
 * @param {string} parameters.taskId - Task ID to execute agent for (REQUIRED)
 * @param {string} [parameters.priority] - Execution priority (HIGH/MEDIUM/LOW)
 * @param {string} [parameters.scheduledFor] - Scheduled execution time (ISO format)
 * @param {Object} [parameters.overrideConfig] - Configuration overrides for execution
 * @param {TokenPayload} user - Authenticated user token payload
 * @param {string} user.userId - User ID from JWT token
 * @param {string} actionId - Unique action ID for tracking and logging
 *
 * @returns {Promise<Object>} Agent execution result
 * @returns {string} returns.actionId - Action tracking ID
 * @returns {string} returns.action - Action type (agent.execute)
 * @returns {string} returns.status - Execution status (queued/running)
 * @returns {Object} returns.result - Execution result
 * @returns {string} returns.result.executionId - Agent execution ID
 * @returns {string} returns.result.status - Execution status
 * @returns {string} returns.result.taskId - Task ID
 * @returns {string} returns.result.message - Status message
 *
 * @throws {Error} If taskId parameter is missing
 * @throws {Error} If task not found
 * @throws {Error} If POV access validation fails
 * @throws {Error} If agent is not configured (no role/template)
 * @throws {Error} If agent execution engine fails to queue execution
 *
 * @example
 * // Execute agent immediately
 * const result = await handleAgentExecute({
 *   taskId: 'task123'
 * }, user, 'action-456');
 *
 * @example
 * // Execute agent with high priority
 * const result = await handleAgentExecute({
 *   taskId: 'task123',
 *   priority: 'HIGH'
 * }, user, 'action-789');
 *
 * @example
 * // Schedule agent execution
 * const result = await handleAgentExecute({
 *   taskId: 'task123',
 *   scheduledFor: '2025-12-31T23:59:59Z',
 *   priority: 'MEDIUM'
 * }, user, 'action-101');
 *
 * @security
 *   - POV access validation via validatePOVAccess
 *   - Agent configuration validation
 *   - Activity logging for audit trail
 *
 * @version 1.0.0
 * @since 2025-12-18
 */

export async function handleAgentExecute(
  parameters: any,
  user: TokenPayload,
  actionId: string,
  /** Server-side extras threaded from the router (retry-band keep-best 2026-07-04). */
  routeOpts?: { callingExecutionId?: string }
) {
  const { taskId, priority, scheduledFor, overrideConfig } = parameters;

  if (!taskId) {
    throw new Error('Task ID is required for agent execution');
  }

  // 🔒 SECURITY: Validate POV access before executing agent
  const taskForAuth = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      agentTemplateId: true,
      agentRole: true,
      prompt: true,
      pov: {
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
      }
    }
  });

  if (!taskForAuth?.pov) {
    throw new Error('Task or POV not found');
  }

  // P3: Check agent configuration prerequisites before execution
  let hasTemplate = !!taskForAuth.agentTemplateId;
  const hasCustomConfig = !!taskForAuth.agentRole && !!taskForAuth.prompt;

  // Auto-assign Pipeline Harness template for PIPELINE-type tasks
  if (!hasTemplate && !hasCustomConfig && taskForAuth.type === 'PIPELINE') {
    const pipelineTemplate = await prisma.agentTemplate.findFirst({
      where: { name: 'Pipeline Harness', status: 'ACTIVE' },
      select: { id: true, name: true, defaultRole: true }
    });

    if (pipelineTemplate) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          agentTemplateId: pipelineTemplate.id,
          agentRole: pipelineTemplate.defaultRole,
          updatedAt: new Date()
        }
      });
      hasTemplate = true;
      log.info({ taskId, templateId: pipelineTemplate.id }, 'Auto-assigned Pipeline Harness template for PIPELINE task');
    }
  }

  if (!hasTemplate && !hasCustomConfig) {
    throw new Error(
      `❌ Agent not configured for task: "${taskForAuth.title}"\n\n` +
      `Before executing, you must configure the agent:\n\n` +
      `**Option 1: Use Template** (Recommended)\n` +
      `perform(action: 'agent.assign', parameters: {\n` +
      `  taskId: '${taskId}',\n` +
      `  agentTemplateName: 'Senior Developer'  // See template(action: 'list')\n` +
      `})\n\n` +
      `**Option 2: Custom Configuration**\n` +
      `perform(action: 'agent.configure', parameters: {\n` +
      `  taskId: '${taskId}',\n` +
      `  agentRole: 'QA Engineer',\n` +
      `  prompt: 'Test the infrastructure setup thoroughly'\n` +
      `})\n\n` +
      `Then retry: perform(action: 'agent.execute', parameters: { taskId: '${taskId}' })`
    );
  }

  // Transition task to IN_PROGRESS if currently OPEN (required for COMPLETED transition later)
  if (taskForAuth.status === 'OPEN') {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'IN_PROGRESS', updatedAt: new Date() }
    });
  }

  validatePOVAccess(user, taskForAuth.pov, {
    throwOnDeny: true,
    requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
    logContext: 'Agent Execute'
  });

  // Dependency enforcement: block execution if predecessor tasks aren't complete
  const incompleteDeps = await prisma.taskDependency.findMany({
    where: { taskId },
    select: {
      dependsOn: {
        select: { id: true, title: true, type: true, status: true, executionStatus: true }
      }
    }
  });

  const blockers = incompleteDeps.filter(
    d => d.dependsOn.status !== 'COMPLETED' && d.dependsOn.executionStatus !== 'SUCCESS'
  );

  if (blockers.length > 0) {
    const blockerList = blockers.map(b =>
      `  - "${b.dependsOn.title}" (status: ${b.dependsOn.status}, execution: ${b.dependsOn.executionStatus || 'none'})`
    ).join('\n');

    throw new Error(
      `⏳ Cannot execute — ${blockers.length} dependency task(s) not yet complete:\n\n` +
      `${blockerList}\n\n` +
      `Execute the dependency tasks first, then retry:\n` +
      `perform(action: 'agent.execute', parameters: { taskId: '${taskId}' })`
    );
  }

  // F18 settledness (2026-07-16): a PIPELINE dependency may be COMPLETED-but-UNSETTLED — its
  // mid-SYNTHESIZE task.complete flipped status while the deliverable (report.md) lands only when
  // its execution terminal-persists (~13s window). Executing this task now would chain a stale
  // pre-completion snapshot (T4e run #1). The manual path shares the auto-reactor's settledness
  // predicate: block while any PIPELINE dependency still has an active execution.
  // See cline_docs/reviews/nonterminal-family-2026-07-16/synthesis.md (F18).
  const pipelineDeps = incompleteDeps.filter(d => d.dependsOn.type === 'PIPELINE');
  if (pipelineDeps.length > 0) {
    const unsettled = await prisma.agentExecution.findMany({
      where: {
        taskId: { in: pipelineDeps.map(d => d.dependsOn.id) },
        status: { in: ['PENDING', 'RUNNING'] },
      },
      select: { taskId: true },
    });
    if (unsettled.length > 0) {
      const unsettledIds = new Set(unsettled.map(u => u.taskId));
      const list = pipelineDeps
        .filter(d => unsettledIds.has(d.dependsOn.id))
        .map(d => `  - "${d.dependsOn.title}" (pipeline synthesis still persisting)`)
        .join('\n');
      throw new Error(
        `⏳ Cannot execute — ${unsettled.length} pipeline dependency(ies) completed but not yet settled ` +
        `(their deliverables are still being persisted):\n\n${list}\n\n` +
        `Retry in ~30 seconds:\nperform(action: 'agent.execute', parameters: { taskId: '${taskId}' })`
      );
    }
  }

  // Import and use the agent task service
  const { AgentTaskService } = await import('@/lib/services/agentTaskService');

  const execution = await AgentTaskService.executeAgentOnTask(
    taskId,
    {
      priority: priority || 'MEDIUM',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      overrideConfig,
      // retry-band keep-best (2026-07-04): present ONLY when this agent.execute was
      // issued from inside another execution (the agent loop) — becomes
      // triggeredBy.parentExecutionId, the gate for the retry stamp.
      callingExecutionId: routeOpts?.callingExecutionId,
      metadata: {
        triggeredVia: 'mcp',
        actionId
      }
    },
    user.userId
  );

  // 🔧 FIX: Fire-and-forget execution to avoid MCP HTTP timeout (30s limit, LLM takes 30-120s)
  // The execution engine runs the LLM call asynchronously; we return immediately with "running" status.
  try {
    log.info({ executionId: execution.id, taskId }, 'triggering fire-and-forget execution');

    // Import and start the execution engine if needed
    const { agentExecutionEngine } = await import('@/lib/services/agentExecutionEngine');

    // Check if execution engine is running
    const engineStatus = await agentExecutionEngine.getStatus();
    if (!engineStatus.isRunning) {
      log.info('starting execution engine');
      await agentExecutionEngine.start();
    }

    // Fire-and-forget: trigger execution WITHOUT awaiting the LLM call
    // This prevents the MCP HTTP request from timing out (30s) while the LLM runs (30-120s)
    // BC63 FIX: Ensure execution record is marked FAILED if background dispatch fails
    agentExecutionEngine.executeById(execution.id)
      .then(() => {
        log.info({ executionId: execution.id }, 'background agent execution completed successfully');
      })
      .catch(async (err: Error) => {
        // F-3: the poller won the create→dispatch race and owns this genuinely-RUNNING
        // row — NOT a failure. Skip the FAILED persist so we don't clobber the poller's
        // in-flight execution. (A status-CAS alone can't catch this: the row IS RUNNING.)
        if (err instanceof ExecutionNotClaimableError) {
          log.info({ executionId: execution.id, taskId }, 'background dispatch deferred to poller (execution already claimed) — no FAILED persist');
          return;
        }
        log.error({ err, executionId: execution.id, taskId }, 'background agent execution failed');
        // BC63+STALE FIX: Atomically mark execution FAILED AND reset task.executionStatus
        // Without the task reset, the active-execution unique index permanently blocks
        // future executions.
        //
        // 2026-07-25 (error-surface panel): this was a ~15-line re-implementation of
        // runTerminalFailureTx MINUS the artifact — the only persist site that asserted the
        // strong terminal claim (execution FAILED *and* task.executionStatus FAILED) while
        // leaving no forensic error.json behind, and therefore no errorCode either. Routed
        // through the shared persist so this site gets the CAS, the artifact, and the column
        // from the one implementation. `source: 'mcp-dispatch'` extends the I-3 union.
        //
        // Phase 4a CAS (crash-only, now inside runTerminalFailureTx): flip to FAILED ONLY if
        // the row is still non-terminal. executeById rethrows executeAgent's error, so this
        // fires when the engine already persisted a terminal state; without the guard it would
        // overwrite a committed SUCCESS (post-commit throw) or duplicate an already-FAILED
        // persist. `persisted: false` means the row was already terminal and our tail is moot.
        //
        // fireReactors: FALSE — non-negotiable. persistTerminalFailure fires the pipeline
        // retrigger even on a CAS miss (deliberate, preserves pre-4b engine behaviour), and
        // the engine adapter has ALREADY fired it for this execution. Passing true here
        // double-fires the retrigger.
        try {
          const { persistTerminalFailure } = await import('@/lib/services/execution-terminal-persist');
          const failTime = new Date();
          // Same extraction as the poller safety net: a typed AppError carries a branchable
          // `.code`; anything else records null ("no code recorded"), never a placeholder.
          const errCode = typeof (err as any)?.code === 'string' ? (err as any).code as string : undefined;
          const result = await persistTerminalFailure(prisma, {
            executionId: execution.id,
            taskId,
            taskTitle: taskForAuth.title,
            errorMessage: err.message || 'Unknown error',
            errorCode: errCode,
            source: 'mcp-dispatch',
            logs: ['Background execution failed: ' + (err.message || 'Unknown error')],
            endTime: failTime,
            // Timing facts are APPROXIMATE at this site and deliberately not fabricated: our
            // `execution` is the pre-dispatch snapshot (PENDING — the engine stamps startTime
            // later), so executionMs is measured from createdAt and includes queue time.
            executionCreatedAt: execution.createdAt ?? null,
            executionStartTime: execution.startTime ?? null,
            // No LLM accounting is available at this site — the dispatch threw, and the
            // adapter owns the usage it accumulated. All-null columns, not zeros.
            usage: undefined,
            servingModel: null,
            fireReactors: false,
            logger: log,
          });

          // Finding-9 mirror (see the poller safety net): a PIPELINE SYNTHESIZE that called
          // task.complete — deferring TaskReady to "my terminal persist" — and THEN failed
          // would strand its dependents forever. maybeQueueReadyDependents is itself
          // status-guarded (no-ops unless the task's STATUS is COMPLETED), so a normally
          // failed task still never queues dependents off a failure. Gated on persisted:
          // a CAS miss means another site owns the terminal state and fired its own tail.
          if (result.persisted) {
            try {
              const { maybeQueueReadyDependents } = await import('@/lib/services/taskReadyReactorService');
              maybeQueueReadyDependents(taskId).catch(() => {});
            } catch { /* non-fatal */ }
          }
        } catch (persistErr) {
          log.error({ err: persistErr, executionId: execution.id, taskId }, 'terminal failure persist failed for background dispatch');
        }
      });

    log.info({ executionId: execution.id }, 'agent execution dispatched (fire-and-forget)');

    return {
      actionId,
      action: 'agent.execute',
      status: 'completed',
      result: {
        execution: {
          id: execution.id,
          status: 'RUNNING',
          startTime: execution.startTime,
          config: execution.config
        },
        message: 'Agent execution started successfully. The LLM is processing in the background (30-120 seconds).',
        nextSteps: [
          "✅ Agent execution dispatched",
          `Check progress: perform(action: 'agent.status', parameters: { taskId: '${taskId}' })`,
          "Execution runs in background - check status after 30-60 seconds",
          `Get results when complete: perform(action: 'agent.results', taskId: '${taskId}')`,
          "Estimated time: 30-120 seconds depending on complexity"
        ],
        monitoring: {
          checkStatusWith: "agent.status",
          getResultsWith: "perform",
          taskId: taskId,
          executionId: execution.id,
          estimatedTime: "30-120 seconds"
        }
      }
    };

  } catch (executionError) {
    log.error({ err: executionError, executionId: execution.id }, 'failed to dispatch execution');

    // Return the execution record even if dispatch failed
    // The background queue processor will pick it up from PENDING status
    return {
      actionId,
      action: 'agent.execute',
      status: 'completed',
      result: {
        execution: {
          id: execution.id,
          status: execution.status,
          startTime: execution.startTime,
          config: execution.config
        },
        message: 'Agent execution queued successfully (will be processed by background engine)',
        warning: `Immediate dispatch failed: ${executionError instanceof Error ? executionError.message : 'Unknown error'}`
      }
    };
  }
}
