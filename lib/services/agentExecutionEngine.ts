import { prisma } from '@/lib/prisma';
import { llmService } from './llm/llm-service';
import { DEFAULT_MAX_TOKENS } from './llm/types';
import { finalizeTextForStopReason } from './llm/finalize-response';
import { RUNTIME_LIMITS } from '@/lib/validation/runtime-limits';
import { resolvePromptPlaceholders, buildContextSummary } from './agentTemplateBuilder/pAIchartUniversalTemplate';
import { EventEmitter } from 'events';
import { logAgentExecution } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';
import { AuthError, NoTemplateAssignedError, ExecutionNotClaimableError } from '@/lib/errors';
import { resolveHarnessMode, ResolvedHarnessContext } from './harnessModeResolver';
import { currentOwnerStamp, currentProcessIdentity, classifyOwner, parseOwner } from './executionOwnership';
// Phase 6: the happy-path spine (loop → post-loop → SUCCESS persist) moved to execution-core.ts.
// This adapter keeps prep + the failure catch (persistTerminalFailure + F-1 rethrow).
import { runExecutionCore } from './execution-core';
import { deriveMcpToolNames, buildHubToolGuidance } from './execution-hub-guidance';
import { persistTerminalFailure, buildErrorJson, resolveAgentRole } from './execution-terminal-persist';
import { applySystemPromptInjectionsWithFact, type ProtocolInjectionFact } from './execution-system-prompt';
import { resolveTaskProtocol } from '../agents/harness/program-protocol';
import { EXECUTION_TASK_CONTEXT_INCLUDE, EXECUTION_TEMPLATE_SELECT } from './execution-hydration';
import { buildAgentPromptBody } from '@/lib/agents/harness/build-agent-prompt-body';
import { normalizeModelConfig, READ_MORE_FUNCTION_DEF } from '@/lib/agents/harness/agentic-tool-loop';
import type { AccumulatedUsage } from '@/lib/agents/harness/agentic-tool-loop';

const logger = mcpLogger.child({ module: 'AgentExecutionEngine' });

export interface AgentExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  metrics?: {
    executionTime: number;
    tokensUsed?: number;
    llmProvider?: string;
  };
}

export class AgentExecutionEngine extends EventEmitter {
  private static instance: AgentExecutionEngine;
  private isRunning = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private resourceManager: any = null;

  private constructor() {
    super();
    this.setMaxListeners(50); // Fix 6.4
  }

  static getInstance(): AgentExecutionEngine {
    if (!AgentExecutionEngine.instance) {
      AgentExecutionEngine.instance = new AgentExecutionEngine();
    }
    return AgentExecutionEngine.instance;
  }

  /**
   * Start the execution engine
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Engine already running');
      return;
    }

    logger.info('Starting agent execution engine');
    this.isRunning = true;

    // Initialize LLM service
    try {
      await llmService.initializeMCP();
      logger.info('LLM service initialized');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to initialize MCP, continuing without it');
    }

    // Initialize Resource Manager for real-time streaming
    try {
      const { mcpResourceManager } = await import('./mcp/resourceManager');
      this.resourceManager = mcpResourceManager;
      logger.info('Resource manager connected for streaming');
    } catch (error) {
      logger.warn({ err: error }, 'Resource manager not available');
    }

    // STARTUP CLEANUP: reap RUNNING executions whose owning process is gone.
    //
    // A RUNNING row means "some process is executing this". At startup we ask whether that
    // process still exists, using the `context._owner` stamp written by the atomic claim in
    // executeAgent(). Rows owned by a LIVE process are left alone — pm2 hosts the engine in
    // BOTH paichart-web and paichart-mcp, so a restart of one must not reap the other's
    // in-flight work.
    //
    // This replaced a `createdAt < now - 2min` age filter (2026-07-31). Age was a proxy for
    // ownership and wrong in both directions: it skipped a genuinely-dead execution that was
    // only 22 seconds old (Run 17 — pm2 bounced by needrestart after an openssl patch),
    // stranding its task for what would have been ~105 minutes until the periodic reaper;
    // and removing the guard outright would have reaped the live sibling instead. The age
    // rule survives ONLY as the fallback for rows claimed before the stamp existed.
    //
    // Do NOT "fix" a lingering zombie by lowering EXECUTION_REAPER_RUNNING_MS — that
    // threshold is invariant-pinned (test:sdk-request-options) and is not the bug.
    // Follow-up: cline_docs/follow-ups/startup-cleanup-blind-window-2026-07-31.md
    //
    // Uses $transaction per transaction-atomicity-pattern: execution + task = 2 tables.
    try {
      const self = currentProcessIdentity();
      const legacyAgeThreshold = Date.now() - 2 * 60 * 1000; // pre-stamp rows only

      // context->'_owner' rather than the whole row: `context` carries pipeline payloads and
      // there is no reason to pull them into memory to read four fields.
      const runningExecs = await prisma.$queryRaw<
        Array<{ id: string; taskId: string; createdAt: Date; owner: unknown }>
      >`SELECT id, "taskId", "createdAt", context->'_owner' AS owner
          FROM agent_executions
         WHERE status = 'RUNNING'`;

      const skippedAlive: string[] = [];
      const orphanedExecs: Array<{ id: string; taskId: string }> = [];

      for (const row of runningExecs) {
        const verdict = classifyOwner(parseOwner(row.owner), self);
        if (verdict === 'orphaned') {
          orphanedExecs.push({ id: row.id, taskId: row.taskId });
        } else if (verdict === 'unknown') {
          // No stamp — fall back to the old age heuristic rather than guessing. Reaches zero
          // once every row predating the stamp has aged out.
          // new Date(...) rather than .getTime() directly: $queryRaw bypasses Prisma's type
          // mapping, so tolerate a string timestamp instead of throwing inside the cleanup.
          if (new Date(row.createdAt).getTime() < legacyAgeThreshold) {
            orphanedExecs.push({ id: row.id, taskId: row.taskId });
          }
        } else {
          skippedAlive.push(row.id);
        }
      }

      if (skippedAlive.length > 0) {
        logger.info(
          { count: skippedAlive.length, executionIds: skippedAlive },
          'Startup cleanup left RUNNING executions alone — owning process is still alive'
        );
      }

      if (orphanedExecs.length > 0) {
        await prisma.$transaction(async (tx) => {
          // Batch-fail all orphaned executions. The `status: 'RUNNING'` predicate is a CAS,
          // matching the periodic reaper's Phase-4a guard: the read above is a separate
          // statement, so a row that reached a terminal state in between must not be
          // clobbered back to FAILED.
          await tx.agentExecution.updateMany({
            where: { id: { in: orphanedExecs.map(e => e.id) }, status: 'RUNNING' },
            data: {
              status: 'FAILED',
              endTime: new Date(),
            },
          });

          // Reset executionStatus on affected tasks
          const taskIds = [...new Set(orphanedExecs.map(e => e.taskId))];
          await tx.task.updateMany({
            where: { id: { in: taskIds } },
            data: { executionStatus: null, updatedAt: new Date() },
          });
        });

        logger.warn({ orphanedCount: orphanedExecs.length }, 'Cleaned up orphaned RUNNING executions on startup');

        // Finding 9 safety net (2026-07-15, F9 reviews — both specialists): this reaper
        // bypasses persistTerminalFailure, so a PIPELINE SYNTHESIZE that completed its
        // task (TaskReady deferred to "my terminal persist") and was then killed by a
        // reload/crash would strand its dependents forever. Fire the reactor per reaped
        // task — its own guards (task.status==='COMPLETED', no-active-execution, debounce)
        // make this a no-op for normally-orphaned tasks and un-strand ONLY the finding-9 case.
        try {
          const { maybeQueueReadyDependents } = await import('./taskReadyReactorService');
          for (const tid of [...new Set(orphanedExecs.map(e => e.taskId))]) {
            maybeQueueReadyDependents(tid).catch(() => {});
          }
        } catch { /* reactor import failure is non-fatal on the cleanup path */ }
      }
    } catch (cleanupError) {
      logger.error({ err: cleanupError }, 'Startup orphan cleanup failed (non-fatal)');
    }

    // Start processing pending executions every 10 seconds
    this.processingInterval = setInterval(() => {
      this.processPendingExecutions().catch(error => {
        logger.error({ err: error }, 'Error processing pending executions');
      });
    }, 10000);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    this.processingInterval.unref();

    // Process immediately on start
    this.processPendingExecutions().catch(error => {
      logger.error({ err: error }, 'Error in initial processing');
    });

    logger.info('Agent execution engine started');
  }

  /**
   * Stop the execution engine
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping agent execution engine');
    this.isRunning = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info('Agent execution engine stopped');
  }

  /**
   * Process pending agent executions
   */
  private async processPendingExecutions(): Promise<void> {
    try {
      // STALE FIX: Transition zombie RUNNING/PENDING executions to FAILED after restart.
      // When PM2 restarts the server, in-flight executions are killed but their DB records
      // remain as RUNNING. This cleanup runs every poll cycle (10s).
      //
      // TWO TIERS (M2 decision, 2026-07-17 — panel-reviewed): PENDING that never claimed
      // in 20 min is definitionally dead; RUNNING must be allowed the MAX admissible
      // watchdog envelope (Pipeline Harness at 100 turns = 53 min) or a legitimate long
      // run gets flipped to FAILED mid-flight — a false terminal fact that fires dependent
      // reactors while the run is alive. The old single 20-min literal predated the
      // high-turn templates. Thresholds + ordering invariant live in runtime-limits.ts.
      //
      // Uses $transaction per transaction-atomicity-pattern: execution + task = 2 tables,
      // one logical operation per stale execution.
      try {
        const now = Date.now();
        const staleExecutions = await prisma.agentExecution.findMany({
          where: {
            OR: [
              { status: 'PENDING', createdAt: { lt: new Date(now - RUNTIME_LIMITS.EXECUTION_REAPER_PENDING_MS) } },
              { status: 'RUNNING', createdAt: { lt: new Date(now - RUNTIME_LIMITS.EXECUTION_REAPER_RUNNING_MS) } },
            ],
          },
          select: { id: true, taskId: true, status: true, createdAt: true },
        });

        for (const exec of staleExecutions) {
          // Atomic: mark execution FAILED + reset task executionStatus (2 tables).
          // Phase 4a CAS: the row was RUNNING/PENDING at scan time, but could have
          // COMPLETED (SUCCESS) in the window between the findMany and here — flip to
          // FAILED ONLY if still non-terminal, so the periodic sweep can't race-clobber
          // a just-committed SUCCESS.
          await prisma.$transaction(async (tx) => {
            const flipped = await tx.agentExecution.updateMany({
              where: { id: exec.id, status: { in: ['PENDING', 'RUNNING'] } },
              data: {
                status: 'FAILED',
                endTime: new Date(),
              },
            });
            if (flipped.count === 0) return; // completed between scan and update — leave it

            // Check if this was the only active execution for the task
            const remainingActive = await tx.agentExecution.findFirst({
              where: {
                taskId: exec.taskId,
                status: { in: ['PENDING', 'RUNNING'] },
                id: { not: exec.id },
              },
              select: { id: true },
            });

            if (!remainingActive) {
              await tx.task.update({
                where: { id: exec.taskId },
                data: { executionStatus: null, updatedAt: new Date() },
              });
            }
          });

          // Tier + age in the log so a reaped restart-zombie and a reaped live hang are
          // distinguishable later (the 2026-06-28 reaped row is unexplainable today for
          // want of exactly this).
          logger.warn(
            {
              executionId: exec.id, taskId: exec.taskId, staleStatus: exec.status, createdAt: exec.createdAt,
              ageMs: now - exec.createdAt.getTime(),
              reaperTier: exec.status === 'PENDING' ? 'PENDING_20MIN' : 'RUNNING_OVER_MAX_ENVELOPE',
            },
            'Transitioned stale execution to FAILED (killed process or in-process hang)'
          );

          // Finding 9 safety net (2026-07-15): same rationale as the startup reaper above —
          // a swept-FAILED SYNTHESIZE whose task.complete already committed must not strand
          // dependents. Guarded inside the reactor (COMPLETED-status check); safe unconditionally.
          try {
            const { maybeQueueReadyDependents } = await import('./taskReadyReactorService');
            maybeQueueReadyDependents(exec.taskId).catch(() => {});
          } catch { /* non-fatal */ }
        }
      } catch (cleanupError) {
        logger.error({ err: cleanupError }, 'Stale execution cleanup failed (non-fatal)');
      }

      // Get pending executions
      const pendingExecutions = await prisma.agentExecution.findMany({
        where: {
          status: 'PENDING'
        },
        include: {
          // Canonical hydration shapes (Phase 5b-i): task-relation superset + the
          // 11-field template UNION select — (P9 retired 2026-07-17) on this
          // path for the first time (it was silently dead under the old 7-field
          // select). See lib/services/execution-hydration.ts.
          task: { include: EXECUTION_TASK_CONTEXT_INCLUDE },
          agentTemplate: { select: EXECUTION_TEMPLATE_SELECT }
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 5 // Process up to 5 executions at a time
      });

      if (pendingExecutions.length === 0) {
        return;
      }

      logger.info({ count: pendingExecutions.length }, 'Processing pending executions');

      // Process executions in PARALLEL (5x throughput vs serial)
      // Each execution has its own error boundary preserving safety-net behavior.
      // DB connections are released during LLM calls (10-60s), so 5 parallel executions
      // use ~33% of the 15-connection pool at peak. CAS claim prevents double-execution.
      await Promise.allSettled(
        pendingExecutions.map(async (execution) => {
          try {
            await this.executeAgent(execution);
          } catch (error) {
            logger.error({ err: error, executionId: execution.id }, 'Failed to execute agent');

            // Safety net: the CRASH-ONLY backstop for when executeAgent's own
            // terminal persist did NOT run (its FAILURE tx threw / a hard crash
            // between claim and persist). Phase 4a CAS: flip to FAILED ONLY if the
            // row is still non-terminal — so when executeAgent already persisted
            // (SUCCESS or FAILED), this net is a no-op instead of clobbering the
            // status or writing a duplicate error.json. A real un-persisted crash
            // still finds RUNNING/PENDING here and gets its backstop error.json.
            try {
              const safetyNetEndTime = new Date();
              await prisma.$transaction(async (tx) => {
                const flipped = await tx.agentExecution.updateMany({
                  where: { id: execution.id, status: { in: ['PENDING', 'RUNNING'] } },
                  data: {
                    status: 'FAILED',
                    endTime: safetyNetEndTime,
                    updatedAt: safetyNetEndTime,
                    logs: [
                      ...(execution.logs || []),
                      `Error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
                      'Agent execution failed'
                    ]
                  }
                });

                if (flipped.count === 0) {
                  // executeAgent already persisted a terminal state — nothing to back up.
                  return;
                }

                await tx.task.update({
                  where: { id: execution.taskId },
                  data: {
                    executionStatus: 'FAILED',
                    updatedAt: safetyNetEndTime
                  }
                });

                // B4 (task #85): include errorCategory when the thrown error
                // carries one — lets GUI render targeted remediation banners
                // (e.g., "Configure your API key" for USER_CONFIG_REQUIRED)
                // instead of a generic "execution failed" message.
                // I-3: content via the ONE shared buildErrorJson shape.
                const errCode = (error as any)?.code;
                await tx.agentArtifact.create({
                  data: {
                    executionId: execution.id,
                    name: 'error.json',
                    type: 'application/json',
                    content: buildErrorJson({
                      errorMessage: error instanceof Error ? error.message : 'Unknown error',
                      errorCode: errCode,
                      source: 'safety-net',
                      taskId: execution.taskId,
                      taskTitle: execution.task?.title,
                      timestamp: safetyNetEndTime,
                    }),
                  },
                });
              });

              // Finding 9 safety net (2026-07-15): this catch only does real work when
              // persistTerminalFailure ITSELF threw — in that narrow case the deferred
              // TaskReady fire was lost too. Same guarded, idempotent fire as the reapers.
              try {
                const { maybeQueueReadyDependents } = await import('./taskReadyReactorService');
                maybeQueueReadyDependents(execution.taskId).catch(() => {});
              } catch { /* non-fatal */ }
            } catch (updateError) {
              logger.error({ err: updateError, executionId: execution.id }, 'Safety net update also failed');
            }
          }
        })
      );
    } catch (error) {
      logger.error({ err: error }, 'Error in processPendingExecutions');
    }
  }

  /**
   * Real-time execution streaming methods
   */
  private async registerExecutionResource(execution: any): Promise<void> {
    if (!this.resourceManager || typeof this.resourceManager.registerResource !== 'function') return;

    try {
      await this.resourceManager.registerResource({
        id: `execution:${execution.id}`,
        name: `Agent Execution ${execution.id}`,
        uri: `embedded://paichart/agent-execution/${execution.id}`,
        type: 'EXECUTION',
        metadata: {
          taskId: execution.taskId,
          agentTemplateId: execution.agentTemplateId,
          status: execution.status,
          tags: ['agent-execution', 'real-time', 'streaming'],
          capabilities: ['streaming', 'queryable', 'linkable'],
          startTime: execution.startTime,
          progress: 0
        }
      });

      logger.debug({ executionId: execution.id }, 'Registered execution resource');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to register execution resource');
    }
  }

  private async updateExecutionResource(executionId: string, updates: any): Promise<void> {
    if (!this.resourceManager || typeof this.resourceManager.updateResource !== 'function') return;

    try {
      await this.resourceManager.updateResource(`execution:${executionId}`, {
        metadata: updates,
        lastUpdated: new Date().toISOString()
      });

      // Emit real-time event for streaming
      this.emit('execution:progress', {
        executionId,
        ...updates,
        timestamp: new Date().toISOString()
      });

      logger.debug({ executionId }, 'Updated execution resource');
    } catch (error) {
      logger.warn({ err: error, executionId }, 'Failed to update execution resource');
    }
  }

  private async streamExecutionProgress(executionId: string, step: string, progress: number, details?: any): Promise<void> {
    const streamData = {
      executionId,
      step,
      progress: Math.min(100, Math.max(0, progress)),
      details,
      timestamp: new Date().toISOString()
    };

    // Update resource manager
    await this.updateExecutionResource(executionId, {
      currentStep: step,
      progress: streamData.progress,
      stepDetails: details
    });

    // Emit for real-time listeners
    this.emit('execution:stream', streamData);

    logger.debug({ executionId, step, progress: streamData.progress }, 'Streaming execution progress');
  }

  /**
   * Execute a single agent with real-time streaming
   */
  private async executeAgent(execution: any): Promise<void> {
    const startTime = new Date();
    // token-usage-persistence: method-scoped (same scope as startTime) so the FAILED catch can
    // persist partial spend — totalUsage is block-scoped inside the execution try. Ref tracks the
    // post-loop diagnostic-retry mutation; assigned once the loop returns.
    let capturedUsage: AccumulatedUsage | undefined;
    let capturedModel: string | null = null;
    logger.info({ executionId: execution.id, taskId: execution.taskId }, 'Executing agent');

    try {
      // RACE CONDITION FIX: Atomic claim — only one caller can transition PENDING → RUNNING.
      // Both executeById() (fire-and-forget) and processPendingExecutions() (10s poller) can
      // race to execute the same PENDING execution. updateMany with a where-status condition
      // acts as an atomic compare-and-swap: only the winner sees count === 1.
      //
      // OWNERSHIP STAMP (2026-07-31): the same CAS records WHICH process is running this,
      // so the startup cleanup can ask "is that process alive?" instead of guessing from
      // row age. Written here and nowhere else — the claim is the only moment at which the
      // answer is both known and true. Merged into `context` (no schema change); both
      // callers of executeAgent() load the row with `include`, so the spread is a full row,
      // and no other code path writes `context` after creation.
      // See lib/services/executionOwnership.ts for why age was the wrong signal.
      const claimed = await prisma.agentExecution.updateMany({
        where: { id: execution.id, status: 'PENDING' },
        data: {
          status: 'RUNNING',
          startTime,
          context: {
            ...(execution.context && typeof execution.context === 'object' ? execution.context : {}),
            _owner: currentOwnerStamp(),
          },
        }
      });
      if (claimed.count === 0) {
        logger.info({ executionId: execution.id }, 'Execution already claimed by another path — skipping');
        return;
      }

      // Register execution as a trackable resource for real-time streaming
      await this.registerExecutionResource(execution);
      await this.streamExecutionProgress(execution.id, 'initializing', 5, { message: 'Starting agent execution' });

      // Status already set to RUNNING by the atomic claim above — just update logs
      await this.updateExecutionStatus(execution.id, 'RUNNING', {
        startTime,
        logs: ['Agent execution started']
      });
      await this.streamExecutionProgress(execution.id, 'status_updated', 10, { status: 'RUNNING', startTime });

      // Get task configuration
      const task = execution.task;
      const config = execution.config || {};
      const context = execution.context || {};
      await this.streamExecutionProgress(execution.id, 'config_loaded', 15, { 
        taskId: execution.taskId, 
        hasConfig: !!config, 
        hasContext: !!context 
      });

      // UPDATED: Extract MCP configuration from dedicated schema fields (unified storage architecture)
      const mcpConfig = task.mcpContext || {};
      await this.streamExecutionProgress(execution.id, 'mcp_config_extracted', 20, { 
        hasMcpConfig: !!mcpConfig, 
        toolCount: mcpConfig.tools?.length || 0 
      });
      
      // TASK 3.3: Enhanced Execution Type Configuration
      // Extract execution type with proper priority and validation
      const configuredExecutionType = mcpConfig.executionType || 
                                     config.executionType;
      
      // Validate execution type against supported types
      const supportedExecutionTypes = [
        'standard', 'systematic_validation', 'debug_systematic_analysis', 
        'collaborative', 'research_focused', 'testing_focused', 'documentation_focused'
      ];
      
      const finalExecutionType = supportedExecutionTypes.includes(configuredExecutionType) 
        ? configuredExecutionType 
        : 'standard';
      
      if (configuredExecutionType && configuredExecutionType !== finalExecutionType) {
        logger.warn({ requestedType: configuredExecutionType, fallbackType: finalExecutionType }, 'Invalid execution type, using fallback');
      }
      
      // MCP tool names — shared derivation (Axis 6): task.mcpContext.tools → consolidated names
      // (legacy-mapped, deduped, CONSOLIDATED_TOOLS default), with the config.mcpTools fallback.
      const mcpToolNames = deriveMcpToolNames(mcpConfig.tools, config.mcpTools);

      const enhancedConfig = {
        ...config,
        mcpTools: mcpToolNames,
        workflow: mcpConfig.workflow?.phases || 
                  config.workflow || {},
        successMetrics: mcpConfig.successMetrics || 
                       config.successMetrics || [],
        executionType: finalExecutionType,
        // Preserve other config values
        maxTokens: config.maxTokens || task.maxTokens || DEFAULT_MAX_TOKENS,  // Standardized default
        temperature: config.temperature ?? 0.3,
        maxRetries: config.maxRetries ?? task.maxRetries ?? 3,
        timeout: config.timeout ?? task.timeout ?? 300000
      };

      // Structured config summary (minimal fields)
      logger.debug({
        executionId: execution.id,
        executionType: enhancedConfig.executionType,
        toolCount: enhancedConfig.mcpTools.length,
        workflowPhaseCount: Object.keys(enhancedConfig.workflow).length,
        successMetricCount: enhancedConfig.successMetrics.length,
        configSource: mcpConfig.configuredVia || 'execution_config',
        hasUnifiedStorage: !!task.mcpContext
      }, 'Enhanced config prepared');

      // Resolve agent template: prefer execution.agentTemplate (populated when
      // callers pass agentTemplateId, as of 2026-04-15 reactor-userid work) with
      // fallback to the task's agentTemplate relation. Post-2026-04-18 (Concern B
      // guard below), this is guaranteed non-null at runtime for the engine path
      // — the guard throws NoTemplateAssignedError otherwise.
      // This affects protocol injection, role determination, and context building.
      const resolvedTemplate = execution.agentTemplate || (task as any).agentTemplate || null;

      // 2026-04-18 (Concern B): enforce template-ownership-model invariant.
      // Every engine execution must run with a named template. Without this guard,
      // the engine silently falls through to buildSystemPrompt's Priority 3
      // (Universal Template + ROLE_GUIDANCE_LIBRARY runtime lookup). Zero prod
      // usage (0/128 executions verified 2026-04-16) but reachable — closing it
      // here makes the invariant structural.
      //
      // Intentional parity gap with the stream route's guard at
      // app/api/pov/agent/execute/stream/route.ts (also added in this commit):
      // the stream route checks `!storedSystemPrompt && !task.agentTemplate`
      // — it accepts a user-configured custom system prompt as valid execution
      // context (Priority 2). The engine path here is STRICTER: it requires a
      // resolved FK template, regardless of whether a custom prompt exists on
      // the task. Rationale: the engine is the reactor/queue-driven path (no
      // user present to configure prompts interactively); the stream route is
      // the interactive GUI path. If a use case ever needs custom prompts via
      // the reactor path, revisit this guard and mirror the stream condition.
      //
      // Outer catch at lines 1600-1647 reads NoTemplateAssignedError.code into
      // execution.errorCategory = 'NO_TEMPLATE_ASSIGNED' on error.json so the
      // GUI renders a targeted banner. Task CAS at agentTaskService.ts:333
      // allows FAILED→retry, so the task remains recoverable after a template
      // is assigned.
      //
      // See plan §6.2 at cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md
      if (!resolvedTemplate) {
        throw new NoTemplateAssignedError(execution.id, task.id);
      }

      // Build enhanced context with proper task relations
      const enhancedContext = this.buildEnhancedContext(task, context, resolvedTemplate);
      await this.streamExecutionProgress(execution.id, 'context_built', 40, {
        contextKeys: Object.keys(enhancedContext).length,
        hasTemplate: !!resolvedTemplate
      });

      // Build the prompt using enhanced config
      const prompt = this.buildAgentPrompt(task, enhancedConfig, enhancedContext);
      await this.streamExecutionProgress(execution.id, 'prompt_generated', 50, { 
        promptLength: prompt.length,
        preview: prompt.substring(0, 100) + '...'
      });
      
      logger.debug({ executionId: execution.id, promptLength: prompt.length }, 'Generated prompt');

      // Get user ID for LLM initialization
      const userId = this.extractUserId(context, task);
      await this.streamExecutionProgress(execution.id, 'user_identified', 55, { userId: userId || 'system' });

      // Resolve user LLM settings (per-request, no singleton mutation)
      let userLLMSettings: { provider?: any; apiKey?: string; model?: string } = {};
      if (userId) {
        try {
          userLLMSettings = await llmService.resolveUserSettings(userId);
          await this.streamExecutionProgress(execution.id, 'llm_initialized', 60, { userId, initialized: true });
        } catch (error) {
          logger.warn({ err: error, userId }, 'Failed to resolve user LLM settings');
          await this.streamExecutionProgress(execution.id, 'llm_init_warning', 60, {
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // B1 (task #85): pre-flight auth check. Fail LOUD before any LLM work
      // if the triggering user has no apiKey configured. Replaces the silent
      // env-var fallback that previously routed unauthenticated calls to
      // whatever key the provider singleton happened to be seeded with —
      // leading to cross-user billing when the triggering user didn't have
      // their own key (see Demo Financial Corp 2026-04-15 incident).
      //
      // The error is caught by the safety nets at lines 273/1256 and surfaced
      // in the error.json artifact with `errorCategory: 'USER_CONFIG_REQUIRED'`
      // so the GUI can render a "Configure your settings" banner instead of
      // a generic "execution failed" message.
      //
      // This check sits BEFORE buildSystemPrompt / mcpFunctions / tool-loop
      // setup (lines 572+), so auth failures don't burn template-loading or
      // MCP-tool-discovery work. Token budget check (llm-service.ts:188) also
      // sits downstream, so an auth-failed execution never counts against
      // the user's budget.
      if (!userId) {
        throw new AuthError(
          `No triggering user identified for this execution. The reactor or API handler should have provided a valid user via context.triggeredBy.id. Execution cannot proceed without attribution.`,
          'USER_CONFIG_REQUIRED',
          { taskId: task.id, executionId: execution.id }
        );
      }
      if (!userLLMSettings.apiKey) {
        throw new AuthError(
          `No API key configured for your account. Visit /settings/llm to add a personal key.`,
          'USER_CONFIG_REQUIRED',
          { userId, taskId: task.id, executionId: execution.id }
        );
      }

      // Determine agent role from multiple sources
      // I-9: the ONE shared role-resolution chain (formerly the private
      // determineAgentRole method — lifted verbatim into the terminal-persist core).
      const agentRole = resolveAgentRole(config.agentRole, resolvedTemplate?.defaultRole, task.agentRole);
      await this.streamExecutionProgress(execution.id, 'role_determined', 65, { agentRole });

      // P9 (task #90 MVP) RETIRED 2026-07-17: the templateType×verbs scope matcher
      // shipped explicitly to gather empirical FPR data before committing to a heavier
      // design. Verdict: ~60 firings in system history, ZERO true positives — every
      // firing was a deliberate protocol assignment whose title vocabulary ('harvest'
      // on ORCHESTRATOR legs, 'author' on DOCUMENTER, 'assessment' on ARCHITECT) the
      // hand-written verb table didn't cover. At ~100% FPR occupying 95% of the
      // executionDegradation channel it trained readers to ignore degradation signals
      // (Protocol 10 trust-erosion). Module deleted; P10's [TEMPLATE_MISMATCH] agent
      // self-report escape hatch remains. Revisit trigger: the first ACTUAL
      // wrong-template incident observed in the wild.

      // Phase 4 mode-resolver (2026-04-26): pre-compute mode for PIPELINE tasks
      // before LLM turn. Used by buildSystemPrompt AND artifact write below.
      // Calling at outer scope (NOT inside buildSystemPrompt) keeps the result
      // available to the artifact-write site without closure-capture trick.
      // Placed AFTER auth checks (lines 625-638) so auth-rejected runs don't
      // pay the resolver query cost (per agent-execution-specialist review).
      // See: cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/
      const harnessContext = task?.type === 'PIPELINE' && task?.id
        ? await resolveHarnessMode(task.id)
        : null;

      // Execute with LLM
      // NOTE (PC-I1, 2026-07-05): `task.modelParameters?.systemPrompt` is STRUCTURALLY DEAD —
      // Task has no modelParameters scalar (the prompt persists at task.metadata.modelParameters
      // .systemPrompt), so this arg is always undefined and buildSystemPrompt's Priority-2 never
      // fires (engine is single-branch: template only). Do NOT "fix" this to the metadata path —
      // that resurrects a dead branch and changes engine output; an engine stored-prompt read is
      // a flagged 5b+ decision. Same dead-by-data-shape class as the removed Priority-3.
      // Pinned by test:system-prompt-injections (E-guard).
      const { prompt: systemPrompt, protocolInjection } = await this.buildSystemPrompt(agentRole, task, resolvedTemplate, task.modelParameters?.systemPrompt, enhancedConfig.mcpTools, harnessContext, execution.id);
      await this.streamExecutionProgress(execution.id, 'system_prompt_built', 70, {
        systemPromptLength: systemPrompt.length,
        source: resolvedTemplate?.promptTemplate ? 'template' : 'default'
      });

      await this.streamExecutionProgress(execution.id, 'llm_executing', 75, { 
        provider: 'anthropic_sdk',
        maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,  // Standardized default
        temperature: config.temperature ?? 0.3
      });

      // Prepare MCP tools as functions for the LLM if available
      let mcpFunctions = undefined;
      if (enhancedConfig.mcpTools && enhancedConfig.mcpTools.length > 0) {
        logger.info({ toolCount: enhancedConfig.mcpTools.length }, 'Preparing MCP tools as functions for LLM');
        
        // Get tool definitions from MCP server manager
        const { mcpServerManager } = await import('./mcp/serverManager');
        const toolDefinitions = await mcpServerManager.getToolDefinitions(enhancedConfig.mcpTools);
        
        if (toolDefinitions.length > 0) {
          mcpFunctions = [];

          for (const { serverName, tool } of toolDefinitions) {
            // Convert MCP tool to function format expected by LLM
            mcpFunctions.push({
              name: tool.name,
              description: tool.description || `MCP tool: ${tool.name}`,
              parameters: tool.inputSchema || {
                type: 'object',
                properties: {},
                required: []
              }
            });
            logger.debug({ toolName: tool.name, serverName }, 'Added MCP tool as function');
          }
          // read_more pager (injected, not a registered tool — kept off every external tools/list
          // surface; served by the agentic loop's name-interceptor). Offered ONLY when the run has
          // tools (this branch), so reflection/zero-tool turns are unaffected and the cache guard holds.
          mcpFunctions.push(READ_MORE_FUNCTION_DEF);
        } else {
          // HARD FAIL — previously this was a silent warn + continue, which let the engine
          // call the LLM with `functions: undefined`. Models like Sonnet, when prompted to
          // orchestrate tools but given no tool definitions, fall back to emitting XML
          // tool-call text (Cline format). The agentic tool loop never fires (stopReason
          // is end_turn, functionCalls is empty), and the entire pipeline gets hallucinated
          // as a single generation and stored with executionStatus=SUCCESS. This is the
          // exact silent-fallback-on-hot-path anti-pattern Bug Class 73 eradication targeted.
          //
          // Repro: Apr 10 2026 Meridian Health Systems test (execution cmns86lk3000kyxs1hfm2y6nb).
          // After Bug Class 73 Phase 2 activated Tier 1 in-process execution in paichart-mcp,
          // agent executions began running there — but mcp-server-http-clean.js never
          // initialized the embedded MCP server / mcpToolRegistry the way lib/server-init.ts
          // does for paichart-web. Result: registry empty → this branch fires → SUCCESS
          // hallucinated.
          //
          // See: cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/implementation-plan.md
          // See: .claude/projects/-home-steve-copov15/memory/feedback_loud_failures_hot_paths.md
          const errorMsg =
            `Agent execution requires MCP tools but none resolved from the tool registry. ` +
            `Requested: [${enhancedConfig.mcpTools.join(', ')}]. ` +
            `Likely cause: the embedded MCP server / mcpToolRegistry was not initialized in ` +
            `this process. Check that lib/server-init.ts:initializeMCPServices() runs at ` +
            `startup for whichever entrypoint is hosting the agent execution engine ` +
            `(paichart-web: server.ts → server-init.ts; paichart-mcp: mcp-server-http-clean.js ` +
            `— verify this path also calls initializeMCPServices).`;
          logger.error({
            executionId: execution.id,
            requestedTools: enhancedConfig.mcpTools,
            processPid: process.pid,
          }, errorMsg);
          throw new Error(errorMsg);
        }
      }
      // Note: if enhancedConfig.mcpTools is empty (outer if false), mcpFunctions stays
      // undefined and execution proceeds toolless. Some templates legitimately run with
      // no tools (e.g. pure text-generation). The CONSOLIDATED_TOOLS default in
      // deriveMcpToolNames (execution-hub-guidance.ts) means this branch should not fire
      // for standard pipeline/harness tasks.

      // Agentic tool loop constants — configurable via template metadata
      // Use resolvedTemplate (not execution.agentTemplate which is historically null)
      const templateMeta = (resolvedTemplate?.metadata as any) || {};
      const templateModelParams = templateMeta.modelParameters || {};
      // R-1 (2026-06-17): `|| 30` is the DEFAULT, not the MAX. Clamp to the
      // shared RUNTIME_LIMITS.MAX_TOOL_TURNS so an unbounded template-metadata
      // value (the ADMIN-only freeform path the schema doesn't cap) can't
      // balloon the loop + the executionTimeoutMs formula below. Validation is
      // the primary gate; this clamp also defends rows written before it landed.
      // Finding B (2026-06-18): the template metadata is untyped (safeRecord), so
      // maxToolTurns can be a non-number. Number()+isFinite guard, else a string
      // like "abc" → Math.min(NaN, …) = NaN → loop runs 0 turns and the timeout
      // (180_000 + NaN*30_000) fires ~instantly. Coerce; fall back to the default.
      const rawToolTurns = Number(templateModelParams.maxToolTurns);
      const requestedToolTurns = Number.isFinite(rawToolTurns) && rawToolTurns > 0 ? rawToolTurns : RUNTIME_LIMITS.DEFAULT_TOOL_TURNS;
      const MAX_TOOL_TURNS = Math.min(requestedToolTurns, RUNTIME_LIMITS.MAX_TOOL_TURNS);
      const TIMEOUT_BASE_MS = RUNTIME_LIMITS.EXECUTION_TIMEOUT_BASE_MS;
      const TIMEOUT_PER_TURN_MS = RUNTIME_LIMITS.EXECUTION_TIMEOUT_PER_TURN_MS;
      const executionTimeoutMs = TIMEOUT_BASE_MS + (MAX_TOOL_TURNS * TIMEOUT_PER_TURN_MS);

      // Progress helper: proportional percentages within 75-90% band
      function loopProgress(turn: number, phase: 'llm' | 'tool' | 'done'): number {
        const LOOP_START = 75, LOOP_END = 90;
        const turnRange = (LOOP_END - LOOP_START) / MAX_TOOL_TURNS;
        const turnBase = LOOP_START + ((turn - 1) * turnRange);
        switch (phase) {
          case 'llm': return Math.round(turnBase);
          case 'tool': return Math.round(turnBase + turnRange * 0.5);
          case 'done': return Math.round(turnBase + turnRange);
        }
      }

      // B1 (tool-loop extraction Phase 1): normalize ONCE; the shared core builds all LLM options
      // from this. Do NOT read config.* for LLM options past this line. S2: never log
      // normalizedLlmConfig (carries raw apiKey).
      const normalizedLlmConfig = normalizeModelConfig(config, userLLMSettings, systemPrompt);

      // Phase 6: the shared happy-path spine (timeout controller → agentic tool loop → post-loop
      // pipeline → SUCCESS persist) runs in lib/services/execution-core.ts. This engine adapter
      // supplies its prep facts + its EventEmitter-progress observer bundle; the core THROWS on
      // failure into the catch below (which owns persistTerminalFailure + F-1 rethrow, unchanged).
      await runExecutionCore({
        executionId: execution.id,
        execution: { id: execution.id, createdAt: execution.createdAt ?? null, startTime, context: execution.context },
        task: { id: task.id, type: task.type, metadata: task.metadata, povId: task.povId, title: task.title, createdAt: task.createdAt, inputContext: task.inputContext },
        config,
        userId,
        prompt,
        normalizedLlmConfig,
        mcpFunctions,
        agentRole,
        resolvedTemplate: resolvedTemplate ? { id: resolvedTemplate.id, name: resolvedTemplate.name } : null,
        harnessContext,
        protocolInjection,
        maxToolTurns: MAX_TOOL_TURNS,
        executionTimeoutMs,
        startTime,
        buildSuccessLogs: ({ tokensUsed, executionTime, turnCount, toolCallCount }) => [
          'Agent execution started',
          `LLM response generated (${tokensUsed || 'unknown'} tokens)`,
          ...(turnCount > 0 ? [`Agentic loop: ${turnCount} turn(s), ${toolCallCount} tool call(s)`] : []),
          `Execution completed in ${executionTime}ms`,
          'Agent execution completed successfully',
        ],
        prune: true,
        fireReactors: true,
        logger,
      }, {
        loop: {
          onInitialResponse: async (response) => {
            await this.streamExecutionProgress(execution.id, 'llm_completed', 75, {
              responseLength: response.text?.length || 0,
              tokensUsed: response.usage ? (response.usage.inputTokens || 0) + (response.usage.outputTokens || 0) : 'unknown'
            });
          },
          onTurnStart: async (turn, functionCalls) => {
            await this.streamExecutionProgress(execution.id, 'executing_tools',
              loopProgress(turn, 'tool'), { turn, toolCount: functionCalls.length });
          },
        },
        onUsageCaptured: (usage, model) => { capturedUsage = usage; capturedModel = model; },
        onStoringResults: async ({ executionTime, contentLength }) => {
          await this.streamExecutionProgress(execution.id, 'storing_results', 90, {
            executionTime, artifactType: 'text', contentLength,
          });
        },
        onExecutionCompleted: async ({ executionTime, tokensUsed }) => {
          await this.streamExecutionProgress(execution.id, 'execution_completed', 100, {
            success: true, executionTime, tokensUsed, artifactStored: true, finalStatus: 'completed',
          });
          // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31) — engine-adapter-only (activity log).
          const apiMetadata: ActivityMetadata = { source: 'API' };
          logAgentExecution(execution.taskId, userId || 'system', {
            executionId: execution.id,
            agentName: agentRole || config.agentRole || 'Agent',
            status: 'SUCCESS',
          }, apiMetadata);
          logger.info({ executionId: execution.id, executionTimeMs: executionTime, tokensUsed }, 'Agent execution completed successfully');
        },
      });

    } catch (error) {
      const endTime = new Date();
      const executionTime = endTime.getTime() - startTime.getTime();

      logger.error({ err: error, executionId: execution.id, executionTimeMs: executionTime }, 'Agent execution failed');

      // Terminal FAILURE persist — the shared core (Phase 4b) keeps the 4a CAS
      // (crash-only): flip to FAILED ONLY while the row is still non-terminal, so
      // a throw AFTER the SUCCESS tx commits can never clobber the committed
      // SUCCESS row, and a real failure persists exactly ONCE. Engine adapter
      // config: failure retrigger ON (success→both / failure→retrigger-only
      // asymmetry is core policy).
      try {
        await persistTerminalFailure(prisma, {
          executionId: execution.id,
          taskId: execution.taskId,
          taskTitle: execution.task?.title,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorCode: (error as any)?.code,
          source: 'executeAgent',
          logs: [
            ...(execution.logs || []),
            `Error occurred after ${executionTime}ms: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'Agent execution failed'
          ],
          endTime,
          executionCreatedAt: execution.createdAt ?? null,
          executionStartTime: startTime,
          usage: capturedUsage,
          servingModel: capturedModel,
          fireReactors: true,
          logger,
        });
      } catch (persistError) {
        // F-1: the FAILURE persist itself failed — the row may still be
        // RUNNING/PENDING. Log and fall through to rethrow the ORIGINAL error so
        // the crash-only safety nets (poller catch / MCP .catch) still see an
        // un-persisted failure and fire. Swallowing or rethrowing persistError
        // here is the one mis-implementation that LOSES a failure.
        logger.error({ err: persistError, executionId: execution.id }, 'Terminal FAILURE persist failed — rethrowing original error for the crash-only safety net');
      }

      throw error;
    }
  }

  /**
   * Build agent prompt (user message) from task and configuration.
   *
   * Assembly order follows agent-prompt-assembly-pattern.md (CrewAI-aligned):
   *   §1 Directive — synthesized goal or explicit task.prompt
   *   §2 Expected Output — from agentTemplate.outputSchema (completion contract)
   *   §3 Task Context — title, description, priority, status, type, due date
   *   §4 Task Sequence Context — parent/subtasks
   *   §5 Environment Context — POV, Phase, Team, Assignee
   *   §6 Chained Context — inputContext from previous tasks
   *   §7 Available Tools — MCP tools
   *   §8 Workflow & Constraints — workflow phases, success metrics, constraints
   *
   * NOTE: agentTemplate.promptTemplate is the SYSTEM prompt (via buildSystemPrompt).
   * It is never injected here to avoid duplication and unresolved placeholders.
   */
  private buildAgentPrompt(task: any, config: any, context: any): string {
    // Body EXTRACTED to lib/agents/harness/build-agent-prompt-body.ts:buildAgentPromptBody (B1 Stage 2,
    // 2026-06-09). Verbatim delegation — SINGLE SOURCE OF TRUTH shared with the SSE stream route. Byte-equivalence
    // proven across 33 branches (scripts/test-build-agent-prompt-parity.ts) BEFORE this edit; the gate stays green.
    return buildAgentPromptBody(task, config, context);
  }

  /**
   * Build system prompt using pAIchart Universal Template with enhanced context
   */
  private async buildSystemPrompt(
    agentRole: string,
    task?: any,
    agentTemplate?: any,
    userSystemPrompt?: string,
    mcpTools?: string[],
    harnessContext?: ResolvedHarnessContext | null,
    executionId?: string,
  ): Promise<{ prompt: string; protocolInjection: ProtocolInjectionFact }> {

    let prompt: string;

    // Priority 1: Agent Template (if assigned and has promptTemplate)
    if (agentTemplate?.promptTemplate) {
      logger.debug({ templateName: agentTemplate.name }, 'Using agent template system prompt');
      prompt = this.resolveTemplateVariables(agentTemplate.promptTemplate, agentRole, task);
    }
    // Priority 2: User System Prompt (from UI configuration)
    else if (userSystemPrompt?.trim()) {
      logger.debug('Using user-configured system prompt');
      prompt = userSystemPrompt;
    }
    // Priority 3 REMOVED (2026-06-09): the pAIchart Universal Template fallback was DEAD code, unreachable because
    // (a) the null-template guard at :574 throws NoTemplateAssignedError before buildSystemPrompt when no template
    // resolves, and (b) promptTemplate is schema-non-nullable (`String @db.Text`) with 0/24 prod templates empty,
    // so a resolved template always has a non-empty promptTemplate → Priority 1 always fires. (The original
    // "remove after 30 days of debug-log telemetry" plan could never have triggered — that debug log is suppressed
    // at prod's info level.) Fail LOUD if a future code path ever reaches here instead of silently resurrecting a
    // deprecated template.
    else {
      throw new Error(
        `buildSystemPrompt: unreachable no-template path (agentRole=${agentRole}) — no agentTemplate.promptTemplate ` +
        `and no userSystemPrompt. Blocked upstream by the null-template guard + non-nullable promptTemplate; if this ` +
        `fires, a new no-template execution path was introduced and needs explicit handling.`
      );
    }

    // Append hub tool routing guidance if hub tools are present
    if (mcpTools && mcpTools.includes('services')) {
      const hubGuidance = await buildHubToolGuidance(mcpTools, prisma, logger);
      if (hubGuidance) {
        prompt += hubGuidance;
      }
    }

    // Shared injection tail (convergence Phase 5a): metadata-null tripwire,
    // harness-context block, protocol injection (loadProtocols/named, cap-10 with
    // cap-hit warn), P10 scope self-check — ONE implementation with the stream
    // route. The resolution HEAD above stays engine-policy (template → dead
    // userSystemPrompt → fail-loud). Golden-byte gate: test:system-prompt-injections.
    const templateMetadata = agentTemplate?.metadata as Record<string, any> | null;
    // WS1 Phase C: the task's protocol identity is resolved HERE (D1.6 — inside buildSystemPrompt,
    // from the engine's post-stamp task row; the resolver owns stamp-vs-title precedence) and the
    // injection binds execution identity so the B2 observability line is forensically joinable.
    const taskProtocol = resolveTaskProtocol({ title: task?.title, metadata: task?.metadata });
    const injectionLogger = logger.child({ executionId, taskId: task?.id, templateId: agentTemplate?.id });
    return applySystemPromptInjectionsWithFact(prompt, {
      harnessContext: harnessContext ?? null,
      template: agentTemplate ? { id: agentTemplate.id, name: agentTemplate.name } : null,
      templateMetadata,
      constraints: agentTemplate?.constraints ?? null,
      taskProtocol,
    }, prisma, injectionLogger);
  }

  // buildHubToolGuidance extracted to lib/services/execution-hub-guidance.ts (Axis 6 — shared by both adapters).


  /**
   * Resolve template variables for agent templates. Delegates to the shared resolvePromptPlaceholders() +
   * the ONE merged buildContextSummary() (Axis 3, 2026-07-07) — the SAME context builder the stream uses, so
   * `${contextualInformation}` is byte-identical across both paths (test:context-builder-parity). SYNC + DB-free
   * (the dead Session block that needed a per-execution query is gone).
   * @see agent-prompt-assembly-pattern.md
   */
  private resolveTemplateVariables(
    template: string,
    agentRole: string,
    task?: any
  ): string {
    const contextualInfo = task
      ? buildContextSummary(task)
      : 'Context will be provided during task execution.';
    return resolvePromptPlaceholders(template, agentRole, contextualInfo);
  }

  /**
   * Update execution status
   */
  private async updateExecutionStatus(
    executionId: string, 
    status: string, 
    updates: {
      startTime?: Date;
      endTime?: Date;
      logs?: string[];
    }
  ): Promise<void> {
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    // 2026-07-25: an `error?: string` parameter used to sit in this signature and was
    // silently DROPPED here — the tombstone of the same never-existent `error` column the
    // read handlers were projecting. Its only caller never passed one. Deleted rather than
    // wired up: the branchable code now lives in `errorCode`, written by the ONE terminal
    // persist (execution-terminal-persist.ts), and this claim-time helper is not a
    // failure-persist site. Adding a field here that the line below would drop is exactly
    // how the original ghost survived four years.
    if (updates.startTime) updateData.startTime = updates.startTime;
    if (updates.endTime) updateData.endTime = updates.endTime;
    if (updates.logs) updateData.logs = updates.logs;

    await prisma.agentExecution.update({
      where: { id: executionId },
      data: updateData
    });
  }

  /**
   * Execute a specific agent execution by ID (for manual triggering)
   */
  async executeById(executionId: string): Promise<AgentExecutionResult> {
    // Query parity with processPendingExecutions() — include agentTemplate, subTasks,
    // parentTask, team so the prompt builder has full context regardless of entry path
    const execution = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      include: {
        // Canonical hydration shapes (Phase 5b-i) — query parity with the poller.
        task: { include: EXECUTION_TASK_CONTEXT_INCLUDE },
        agentTemplate: { select: EXECUTION_TEMPLATE_SELECT }
      }
    });

    if (!execution) {
      throw new Error(`Agent execution ${executionId} not found`);
    }

    if (execution.status !== 'pending' && execution.status !== 'PENDING') {
      // F-3: the poller won the create→dispatch race and is already running this row.
      // Typed so the MCP background-dispatch .catch can skip the FAILED persist instead
      // of clobbering a genuinely-RUNNING execution.
      throw new ExecutionNotClaimableError(executionId, execution.status);
    }

    await this.executeAgent(execution);

    return {
      success: true,
      output: 'Agent execution completed successfully'
    };
  }

  /**
   * Build enhanced context with proper task relations
   */
  private buildEnhancedContext(task: any, originalContext: any, agentTemplate: any): any {
    return {
      ...originalContext,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        type: task.type,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate
      },
      pov: task.pov,
      phase: task.phase,
      team: task.team,
      assignee: task.assignee,
      agentTemplate: agentTemplate,
      triggeredBy: originalContext.triggeredBy || { id: 'system' }
    };
  }

  /**
   * Extract user ID from context and task.
   *
   * Priority: `context.triggeredBy.id` (from canonical wrapper) → `task.assigneeId`
   * (legacy fallback, kept for backward-compat with rows created before task #85).
   *
   * The fallback to `task.assigneeId` is the exact misattribution site that
   * caused the 2026-04-15 reactor-userId bug (Demo Financial Corp): reactors
   * wrote `triggeredBy` as a bare string, `context.triggeredBy?.id` returned
   * undefined, the fallback resolved to POV-owner's (empty) apiKey. As of
   * task #85 this should never fire for new executions — all 6 call sites
   * now funnel through `createAgentExecution` which validates the shape. The
   * WARN-log below catches any future reactor code that forgets the contract
   * AND any legacy rows still processed through the 10s poller.
   */
  private extractUserId(context: any, task: any): string | undefined {
    if (context?.triggeredBy?.id && typeof context.triggeredBy.id === 'string') {
      return context.triggeredBy.id;
    }
    if (task?.assigneeId) {
      logger.warn(
        {
          taskId: task.id,
          assigneeId: task.assigneeId,
          triggeredByShape: typeof context?.triggeredBy,
          triggeredByValue: context?.triggeredBy,
        },
        'extractUserId falling back to task.assigneeId — context.triggeredBy.id missing or malformed. Reactor code may be writing triggeredBy as a bare string instead of {id, source}. Check lib/services/agent-execution-create.ts wrapper usage.'
      );
      return task.assigneeId;
    }
    return undefined;
  }

  /**
   * Determine agent role from multiple sources
   */
  /**
   * Get execution engine status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    pendingExecutions: number;
    runningExecutions: number;
  }> {
    // ✅ Q1 2026 Performance: Parallelize independent counts (50% faster)
    const [pendingCount, runningCount] = await Promise.all([
      prisma.agentExecution.count({ where: { status: 'PENDING' } }),
      prisma.agentExecution.count({ where: { status: 'RUNNING' } })
    ]);

    return {
      isRunning: this.isRunning,
      pendingExecutions: pendingCount,
      runningExecutions: runningCount
    };
  }
}

// Export singleton instance
export const agentExecutionEngine = AgentExecutionEngine.getInstance();
