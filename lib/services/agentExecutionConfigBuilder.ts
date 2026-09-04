import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';
import { buildTemplateModelParameters } from './llm/template-model-params';
import type { TriggeredBy, TriggeredBySource } from './types/triggered-by';

const log = mcpLogger.child({ module: 'agentExecutionConfigBuilder' });

/**
 * Builds the rich `config` JSONB shape for an `agent_executions` row so that
 * GUI (Monitoring tab, Artifacts tab) and analytics (agent-executions endpoint)
 * can read the same execution-context fields regardless of who created the
 * execution row. Called from every site that auto-creates execution rows:
 *
 *   - lib/services/pipelineRetriggerReactorService.ts (harness SYNTHESIZE retrigger)
 *   - lib/services/taskReadyReactorService.ts (dep-free initial wave + sibling cascade)
 *
 * The engine path (agentTaskService.ts executeAgentOnTask) still builds its own
 * config inline because it has slightly different metadata flags (override
 * support) and is user-triggered rather than reactor-triggered.
 *
 * FIELD-PARITY CLAIM VERIFIED 2026-07-17 (BC-T6-1 sibling sweep, prompted by the
 * "two reactors disagree" finding): both reactors use THIS helper, so they cannot
 * diverge from each other; against the engine's inline build, every field's
 * fallback chain matched (same buildTemplateModelParameters, same ??-defaults)
 * EXCEPT config.metadata.triggeredBy — this helper writes a SOURCE STRING, the
 * engine wrote the triggering USER's CUID under the same key (semantic collision,
 * zero readers, fixed same day: engine now writes 'engine-direct'; the user id is
 * canonical in context.triggeredBy.id). The pre/post-chain inputContext timing
 * difference between callers is neutralized at the chokepoint: createAgentExecution
 * overrides frozen config.inputContext with prepareTaskForExecution's RETURNING
 * value (BC-T6-1 fix, pinned by test-execution-config-snapshot.ts) — and
 * prepareTaskForExecution mutates inputContext AND (since WS2 Phase A, 2026-08-17)
 * writes the write-if-absent metadata.protocol stamp — but the stamp is NOT a
 * snapshotted config field, and protocol injection reads it via resolveTaskProtocol
 * (stamp-or-title convergent), so the build-vs-create timing hazard remains
 * inputContext-only. (The previous "mutates ONLY inputContext" claim here was
 * falsified by Phase A and would have made the stream's pre-stamp snapshot look
 * impossible — WS1 Phase C panel §0.)
 *
 * **Why this exists as a shared helper**: on 2026-04-15 we discovered that both
 * reactor services shipped with a 2-key config ({reason, autoQueued}) while the
 * engine path shipped a rich 18-key config. The GUI Monitoring tab reads config.
 * model, config.temperature, etc. — reactor-created executions rendered empty.
 * Commit 7714705c fixed the pipeline retrigger reactor; two weeks later a
 * Demo Financial pipeline failed because the task-ready reactor had the same
 * bug. Extracting this builder here prevents the next reactor (or any other
 * execution-creation site) from regressing into the thin-config trap.
 *
 * @param taskId - Task whose execution is being created
 * @param options - Reactor-specific flags and triggering metadata
 * @returns Rich config object for the agent_executions row's `config` field, or null if task/template not loadable
 */
export async function buildRichExecutionConfig(
  taskId: string,
  options: {
    /** e.g., 'pipeline-retrigger-reactor', 'task-ready-reactor', 'engine-direct' */
    triggerSource: string;
    /** Reactor-specific flags merged INTO the rich config (e.g., {autoRetrigger: true, reason: 'all-children-terminal'}) */
    extraConfigKeys?: Record<string, any>;
  }
): Promise<{ config: Record<string, any>; taskAgentTemplateId: string | null } | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      metadata: true,
      agentRole: true,
      agentTemplateId: true,
      prompt: true,
      inputContext: true,
      maxRetries: true,
      timeout: true,
      mcpToolId: true,
      mcpWorkflowId: true,
      mcpContext: true,
      mcpMetadata: true,
      agentTemplate: {
        select: {
          id: true,
          name: true,
          defaultRole: true,
          promptTemplate: true,
          metadata: true,
          maxRetries: true,
          timeout: true,
        },
      },
    },
  });

  if (!task) {
    log.warn({ taskId }, 'buildRichExecutionConfig: task not found');
    return null;
  }

  // Model parameters priority chain (mirrors agentTaskService.ts:211-241 and
  // the earlier fix in pipelineRetriggerReactorService.ts):
  //   1. task.metadata.modelParameters (non-empty) — explicit per-task override
  //   2. agent template defaults merged with template.metadata.modelParameters
  //   3. hardcoded fallback (claude-haiku-4-5, temp 0.7)
  let modelParameters: Record<string, any> = {};
  const taskMeta = (task.metadata as any) || {};
  if (taskMeta.modelParameters && Object.keys(taskMeta.modelParameters).length > 0) {
    modelParameters = taskMeta.modelParameters;
  } else if (task.agentTemplate) {
    // Build from the template's OWN fields only — no hardcoded provider/model/
    // temperature base (those shadowed the real resolution). 2026-06-18 cleanup.
    // Shared with agentTaskService via buildTemplateModelParameters (one helper,
    // no re-drift).
    modelParameters = buildTemplateModelParameters(task.agentTemplate);
  }

  const config: Record<string, any> = {
    agentRole: task.agentRole || task.agentTemplate?.defaultRole,
    prompt: task.prompt || task.agentTemplate?.promptTemplate,
    inputContext: task.inputContext,
    maxRetries: task.maxRetries ?? 3,
    timeout: task.timeout ?? 300000,
    priority: 'MEDIUM',
    // Model parameters spread flat (provider, model, temperature, maxTokens, etc.)
    ...modelParameters,
    // MCP configuration — null/undefined on tasks that don't use MCP tools
    mcpToolId: task.mcpToolId,
    mcpWorkflowId: task.mcpWorkflowId,
    mcpContext: task.mcpContext,
    mcpMetadata: task.mcpMetadata,
    metadata: {
      triggeredBy: options.triggerSource,
      triggeredAt: new Date().toISOString(),
    },
    // Reactor-specific flags merged in (e.g., {autoQueued: true, reason: 'dep-free-initial-wave'})
    ...(options.extraConfigKeys || {}),
  };

  // Invariant: rich config must have the fields the GUI/analytics readers need.
  // If these are missing after population, something upstream changed (template
  // deleted, task fields cleared, no model in template) — log loudly so the
  // regression doesn't hide. This warning caught the taskReadyReactor thin-config
  // bug on 2026-04-15; keep it.
  const missingKeys = ['agentRole', 'prompt'].filter((k) => !config[k]);
  if (missingKeys.length > 0) {
    log.warn(
      {
        taskId,
        triggerSource: options.triggerSource,
        missingKeys,
        hasTemplate: !!task.agentTemplate,
        templateName: task.agentTemplate?.name,
      },
      'buildRichExecutionConfig: config missing expected fields — GUI monitoring will show blanks and LLM call may return empty'
    );
  }

  return { config, taskAgentTemplateId: task.agentTemplateId };
}

/**
 * Resolves the `triggeredBy` object for a reactor-queued child execution by
 * looking up the parent PIPELINE task's latest execution and copying its
 * triggeredBy. This is the 2026-04-16 fix for the reactor auth-propagation
 * bug (task #85) — every child inherits the ORIGINAL triggering user, not
 * the task's assignee (which defaults to POV owner).
 *
 * Implements the event-system-specialist's tri-state policy (ES-4, A4):
 *   - **Parent PIPELINE found + valid triggeredBy**: copy id/source from parent,
 *     override `source` to the reactor-specific value, attach parentExecutionId
 *     and parentTaskId for lineage.
 *   - **No parent PIPELINE found**: this is NOT necessarily an error — it means
 *     the reactor fired for a task that wasn't spawned by the harness (e.g.,
 *     a plain dep-free task manually wired). Fall back to `task.assigneeId`
 *     wrapped as `{id, source: 'child-assignee-fallback'}`. Log INFO.
 *   - **Parent found but context.triggeredBy is malformed/missing**: corruption
 *     or legacy row. Log WARN, return `null` — caller should skip queuing
 *     rather than poison the child's execution.
 *
 * @param child - Child task needing a triggeredBy resolved
 * @param reactorSource - The reactor-specific source to tag the output with
 *                        (e.g., 'reactor-task-ready', 'reactor-task-ready-initial')
 * @returns Resolved triggeredBy object, or `null` if parent found but corrupted
 */
export async function resolveTriggeredByFromParent(
  child: { id: string; stageId: string | null; assigneeId: string | null },
  reactorSource: Extract<
    TriggeredBySource,
    'reactor-task-ready' | 'reactor-task-ready-initial' | 'reactor-pipeline-retrigger'
  >
): Promise<TriggeredBy | null> {
  if (!child.stageId) {
    // Task has no stage — can't look up parent PIPELINE. Fall through to assignee.
    return assigneeFallback(child, reactorSource);
  }

  // Two-hop SQL: child.stageId → PIPELINE task with that pipelineStageId in its
  // metadata → its latest execution's context.triggeredBy. Parameterized via
  // Prisma tagged template ($queryRaw binds values, not string-interpolates —
  // confirmed per SEC-9 2nd-pass review).
  let parentRows: Array<{ context: unknown; executionId: string; taskId: string }> = [];
  try {
    parentRows = await prisma.$queryRaw<
      Array<{ context: unknown; executionId: string; taskId: string }>
    >`
      SELECT ae.context, ae.id AS "executionId", ae."taskId"
      FROM agent_executions ae
      INNER JOIN tasks t ON t.id = ae."taskId"
      WHERE t.type = 'PIPELINE'
        AND t.metadata->>'pipelineStageId' = ${child.stageId}
      ORDER BY ae."createdAt" DESC
      LIMIT 1
    `;
  } catch (err) {
    log.error({ err, childId: child.id, stageId: child.stageId }, 'parent-PIPELINE lookup query failed');
    return null; // Don't poison child's execution with a fabricated user — skip.
  }

  if (parentRows.length === 0) {
    // No parent PIPELINE task claims this child's stage — reactor fired for a
    // non-harness-originated task (manual dep-free creation, legacy workflow).
    // Fall back to assignee; this IS legitimate, just not harness-driven.
    log.info(
      { childId: child.id, stageId: child.stageId },
      'resolveTriggeredByFromParent: no parent PIPELINE found — falling back to child.assigneeId (legitimate non-harness path)'
    );
    return assigneeFallback(child, reactorSource);
  }

  const parent = parentRows[0];
  const parentContext = parent.context as any;
  const parentTriggeredBy = parentContext?.triggeredBy;

  if (
    !parentTriggeredBy ||
    typeof parentTriggeredBy !== 'object' ||
    typeof parentTriggeredBy.id !== 'string'
  ) {
    // Parent found but its triggeredBy is malformed or pre-fix legacy shape
    // (bare string). We CAN'T recover a trustworthy user from this — refuse
    // to queue the child. Engine pre-flight (B1) will surface the stall.
    log.warn(
      {
        childId: child.id,
        stageId: child.stageId,
        parentExecutionId: parent.executionId,
        parentTaskId: parent.taskId,
        parentTriggeredByShape: typeof parentTriggeredBy,
        parentTriggeredByValue: parentTriggeredBy,
      },
      'resolveTriggeredByFromParent: parent PIPELINE found but context.triggeredBy is malformed — skipping child queue rather than poisoning with assignee fallback'
    );
    return null;
  }

  return {
    id: parentTriggeredBy.id,
    source: reactorSource,
    parentExecutionId: parent.executionId,
    parentTaskId: parent.taskId,
  };
}

/**
 * Fallback path when no parent PIPELINE can be found (legitimate non-harness
 * reactor fires). Uses the child's own assigneeId wrapped in the contract's
 * `child-assignee-fallback` source so queries can distinguish this path from
 * harness-propagated executions. Returns `null` if the child has no assignee
 * — caller should skip queuing in that case.
 */
function assigneeFallback(
  child: { id: string; assigneeId: string | null },
  _reactorSource: TriggeredBySource
): TriggeredBy | null {
  if (!child.assigneeId) {
    log.warn(
      { childId: child.id },
      'resolveTriggeredByFromParent: no parent PIPELINE and no child.assigneeId — cannot queue'
    );
    return null;
  }
  return {
    id: child.assigneeId,
    source: 'child-assignee-fallback',
  };
}
