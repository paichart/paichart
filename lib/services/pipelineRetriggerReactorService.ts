/**
 * Pipeline Retrigger Reactor Service
 *
 * Orchestration Reactor — event-driven automation loop-closure service.
 * File name follows the `<domain>ReactorService.ts` convention so all reactors
 * are grep-findable: `find lib/services -name '*ReactorService.ts'`.
 * @see .claude/knowledge/patterns/orchestration-reactor-pattern.md (Pattern #46)
 * @see .claude/knowledge/domain/harness/automation-loop-closure-architecture.md
 *
 * Purpose:
 *   When a task transitions to a terminal state (COMPLETED, or executionStatus
 *   FAILED), check whether it was the last incomplete child of a PIPELINE
 *   harness. If so, queue the harness for re-execution so it can enter
 *   SYNTHESIZE mode.
 *
 * Design decision — metadata-based linkage (Option A):
 *   The harness lives in ONE stage (often a "control plane" stage that
 *   registers pipelines). It creates a SEPARATE child stage ("Pipeline: X")
 *   for its children and records the child stage's id in its own
 *   metadata.pipelineStageId field. This preserves the established UX
 *   convention where children are grouped in their own named stage, rather
 *   than mixed into whatever stage the harness happens to live in.
 *
 *   Detection flow:
 *     1. A child task transitions to terminal (anywhere in the system)
 *     2. We look up that child's stage_id
 *     3. We find a PIPELINE task whose metadata.pipelineStageId === that stage_id
 *     4. We check all children in that stage are now terminal
 *     5. If yes + all guards pass, queue the harness for SYNTHESIZE
 *
 *   Why not stage-based detection: earlier v2 required harness and children
 *   to share a stage. That simplifies the query but abandons the established
 *   "Pipeline: X" child-stage convention and mixes unrelated tasks.
 *
 * Trigger mechanism:
 *   Queues a new AgentExecution row with status = 'PENDING'. The existing
 *   engine poller (processPendingExecutions, 10s interval) picks it up.
 *   Cross-process safe (no direct method call across request boundary).
 *
 * Loop guards (in order):
 *   1. Event entity loaded and has a stage
 *   2. Event entity is not itself a PIPELINE task (harness doesn't self-trigger)
 *   3. A PIPELINE harness exists whose metadata.pipelineStageId matches the
 *      event's stage, and it's still IN_PROGRESS
 *   4. All tasks in the child stage are terminal (status=COMPLETED or
 *      executionStatus=FAILED)
 *   5. Child stage contains ≥1 task (misconfigured harness with no children
 *      doesn't get retriggered into an infinite loop)
 *   6. No existing PENDING or RUNNING execution for the harness
 *   7. Debounce: no execution created for this harness within last 30s
 *
 * Call sites:
 *   - lib/services/agentExecutionEngine.ts (after successful task COMPLETED tx)
 *   - lib/services/agentExecutionEngine.ts (after FAILED execution tx)
 *   - lib/mcp/tasks/action/handlers/task/task-complete-handler.ts (MCP path)
 *
 * All call sites use fire-and-forget (.catch(() => {})) — reactor never
 * throws outward; internal errors are logged.
 */

import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';
import { buildRichExecutionConfig } from './agentExecutionConfigBuilder';
import { createAgentExecution } from './agent-execution-create';
import { DuplicateActiveExecutionError } from '@/lib/errors';
import { logReactorDuplicateSkip, logReactorMismatchSkip, logReactorBudgetSkip } from './reactor-skip-counter';
import { TriggeredBySchema, type TriggeredBy } from './types/triggered-by';

const log = mcpLogger.child({ module: 'PipelineRetrigger' });

const DEBOUNCE_MS = 30_000;

// D-4 (2026-06-14): per-harness reactor-generation budget. The per-cycle guards
// (Guards 1-7) each bound a SINGLE retrigger; none bounds the NUMBER of generations.
// The chain inherits identity through "arbitrary reactor-chain depth" (read below),
// so a runaway/pathological harness whose SYNTHESIZE keeps re-creating stages would
// retrigger forever (bounded RATE by the engine poller take:5, unbounded TOTAL). This
// caps the chain. Mirrors the workflow engine's maxTotalRetries=10
// (lib/services/workflow/core/orchestration-engine.js:313). Legit max generation is 1
// (CREATE→SYNTHESIZE→complete — harnessModeResolver has no stage-N+1 mode), so 10 is
// pure runaway headroom. Soft + env-tunable (non-load-bearing).
//
// NOTE: counter monotonicity depends on BC67 (one active execution per harness task) —
// Guards 6/7 + the partial-unique index guarantee one retrigger row per generation, so
// concurrent child-completions race the SAME prior generation and exactly one wins. Do
// NOT colocate this counter with any feature that allows >1 active execution per task.
const MAX_HARNESS_REACTOR_GENERATIONS = Number(
  process.env.MAX_HARNESS_REACTOR_GENERATIONS ?? 10
);

/**
 * Called after a task transitions to COMPLETED or FAILED. If the task was
 * the last incomplete child of a PIPELINE harness (linked by
 * metadata.pipelineStageId), queues the harness for SYNTHESIZE re-execution.
 *
 * Safe to call fire-and-forget — all errors are caught and logged.
 * Never throws (never blocks the caller's completion flow).
 *
 * @param completedTaskId - Task that just transitioned to a terminal state
 */
export async function maybeRetriggerPipelineHarness(completedTaskId: string): Promise<void> {
  try {
    // Guard 1: Load event entity with the fields guards need.
    const completed = await prisma.task.findUnique({
      where: { id: completedTaskId },
      select: { id: true, stageId: true, type: true, status: true },
    });

    if (!completed?.stageId) {
      return; // No stage — cannot be part of a pipeline
    }

    // Guard 2 REMOVED (2026-07-15, program-harness design CC1 — the nesting KEYSTONE).
    // The old blanket `if (completed.type === 'PIPELINE') return` blocked a completing CHILD
    // PIPELINE from ever retriggering its PARENT program harness (design panel: nesting is
    // dead without this). Self-trigger is structurally prevented by the metadata linkage —
    // a harness's pipelineStageId points at its CHILD stage, never at the stage it lives in —
    // and the residual degenerate case (pipelineStageId === own stageId misconfiguration) is
    // caught by the explicit self-ID check after Guard 3 below. PIPELINE completions are rare
    // (only harnesses complete), so the added Guard-3 query volume is negligible.
    // See cline_docs/reviews/program-architect-design-2026-07-15/design-proposal.md CC1.

    // Guard 3: Find the harness via metadata.pipelineStageId link.
    // A PIPELINE task whose metadata has { pipelineStageId: <completed.stageId> }
    // is the parent of this child. Prisma doesn't support JSON path queries
    // in findFirst cleanly across DBs, so we use a raw SQL hop here.
    //
    // Query: find IN_PROGRESS PIPELINE tasks in the same phase whose metadata
    // claims ownership of this stage. Phase-scoping is a sanity filter — a
    // harness and its children should always share a phase.
    // Column naming note: `agentTemplateId` has no @map in schema.prisma — in
    // Postgres the column is camelCase with double-quotes. `stage_id` IS
    // mapped so it's snake_case. Always check schema before adding raw SQL.
    const harnesses = await prisma.$queryRaw<
      Array<{ id: string; title: string; agentTemplateId: string | null; status: string }>
    >`
      SELECT t.id, t.title, t."agentTemplateId", t.status
      FROM tasks t
      WHERE t.type = 'PIPELINE'
        AND t.metadata->>'pipelineStageId' = ${completed.stageId}
      LIMIT 1
    `;

    const harness = harnesses[0];
    if (!harness) {
      return; // No harness owns this child stage (the common non-pipeline-child case)
    }
    // Guard 2' (2026-07-15, CC1): TRUE self-trigger guard — replaces the removed blanket
    // type-skip. Fires only in the degenerate misconfiguration where a harness's
    // pipelineStageId points at the stage it LIVES in (its own completion would then
    // resolve itself as "parent"). Loud, not silent — this state is always a bug.
    if (harness.id === completedTaskId) {
      log.warn(
        { harnessTaskId: harness.id, pipelineStageId: completed.stageId },
        'Degenerate self-reference: harness pipelineStageId points at its own stage — not retriggering',
      );
      return;
    }
    // Guard 3b (2026-07-14): a harness EXISTS but is not mid-flight. IN_PROGRESS is the
    // truthful mid-flight status (createAgentExecution now transitions OPEN→IN_PROGRESS at
    // the chokepoint, so every entry path satisfies this). Any other status here is an
    // anomaly worth a LOUD log, never a silent return — the cascading-pipelines Phase-0
    // probe (run cmrkmy4z6…) sat OPEN with all children complete and this guard's silent
    // no-match hid the stuck SYNTHESIZE for 22 minutes. COMPLETED is the one benign case
    // (late duplicate completion event after the pipeline already synthesized) — debug level.
    if (harness.status !== 'IN_PROGRESS') {
      const logFn = harness.status === 'COMPLETED' ? log.debug.bind(log) : log.warn.bind(log);
      logFn(
        {
          harnessTaskId: harness.id,
          harnessStatus: harness.status,
          pipelineStageId: completed.stageId,
          completedTaskId,
        },
        'Pipeline harness found for completed child but not IN_PROGRESS — SYNTHESIZE not queued',
      );
      return;
    }

    // Guard 3.5 (2026-04-25): Verify bidirectional pointer integrity.
    // The stage we just located via metadata.pipelineStageId must record the
    // matching harnessTaskId back-pointer. If it doesn't, the harness's
    // pipelineStageId was clobbered to point at a stage owned by a different
    // harness (or hand-edited). Fail closed — never queue a SYNTHESIZE
    // against an unverified stage.
    // Placed before existing Guard 4 (child count) so a clobbered run never
    // runs the child-count math. Scales with PIPELINE completions only
    // because Guard 3 already filtered out non-PIPELINE callers.
    // See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
    const stageRecord = await prisma.stage.findUnique({
      where: { id: completed.stageId },
      select: { metadata: true },
    });
    const stageRecordMeta = (stageRecord?.metadata as Record<string, unknown> | null) ?? {};
    const recordedOwnerRaw = stageRecordMeta.harnessTaskId;
    const recordedOwner = typeof recordedOwnerRaw === 'string' ? recordedOwnerRaw : null;

    if (recordedOwner === null) {
      // Sunset complete (2026-04-25): see task-complete-handler.ts for
      // full rationale. Reactor now SKIPS (does not queue SYNTHESIZE) on
      // missing/non-string back-pointer — same class of corruption as a
      // wrong-task back-pointer. Reactor is best-effort so this skips
      // rather than throws.
      logReactorMismatchSkip('pipeline-retrigger', {
        harnessTaskId: harness.id,
        pipelineStageId: completed.stageId,
        recordedHarnessId: null,
        recordedOwnerRaw,
        cascadeCompletedTaskId: completedTaskId,
      });
      return;
    } else if (recordedOwner !== harness.id) {
      logReactorMismatchSkip('pipeline-retrigger', {
        harnessTaskId: harness.id,
        pipelineStageId: completed.stageId,
        recordedHarnessId: recordedOwner,
        cascadeCompletedTaskId: completedTaskId,
      });
      return;
    }
    // else: matches — fall through to existing harnessId extraction

    const harnessId = harness.id;
    const harnessTitle = harness.title;
    const harnessTemplateId = harness.agentTemplateId;

    // Guard 4: All tasks in the child stage must be terminal.
    //
    // Task-level "terminal" in this codebase means:
    //   - status = COMPLETED (agent completed the work), OR
    //   - executionStatus = FAILED (execution failed; task stays IN_PROGRESS
    //     but the harness should still re-enter to escalate)
    //
    // TaskStatus enum: OPEN | IN_PROGRESS | COMPLETED | BLOCKED. No FAILED.
    const nonTerminalChildren = await prisma.task.count({
      where: {
        stageId: completed.stageId,
        AND: [
          { status: { not: 'COMPLETED' } },
          {
            OR: [
              { executionStatus: null },
              { executionStatus: { notIn: ['FAILED'] } },
            ],
          },
        ],
      },
    });

    if (nonTerminalChildren > 0) {
      // Not ready — some children still running/open.
      // DEBUG level: this is the normal case every time an intermediate child
      // completes, so log at a level that doesn't clutter info logs.
      log.debug(
        {
          harnessTaskId: harnessId,
          childStageId: completed.stageId,
          nonTerminalChildren,
          reason: 'siblings-in-flight',
        },
        'Reactor skipped: pipeline not ready for synthesize'
      );
      return;
    }

    // Guard 5: Sanity — child stage must have ≥ 1 task.
    // Defends against misconfigured harness that claimed a stage but created
    // no children. Without this, we'd loop retriggering an empty pipeline.
    const childCount = await prisma.task.count({
      where: { stageId: completed.stageId },
    });
    if (childCount === 0) {
      log.warn(
        {
          harnessTaskId: harnessId,
          childStageId: completed.stageId,
          reason: 'empty-child-stage',
        },
        'Reactor skipped: harness metadata points to empty stage (misconfigured)'
      );
      return;
    }

    // Guard 6: No existing PENDING or RUNNING execution for the harness.
    const activeExecution = await prisma.agentExecution.findFirst({
      where: {
        taskId: harnessId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      select: { id: true, status: true },
    });
    if (activeExecution) {
      log.debug(
        {
          harnessTaskId: harnessId,
          activeExecutionId: activeExecution.id,
          status: activeExecution.status,
          reason: 'already-in-flight',
        },
        'Reactor skipped: harness has active execution'
      );
      return;
    }

    // Guard 7: Debounce. Absorb near-simultaneous child completions — multiple
    // children finishing within the window only trigger one harness run.
    const recentExecution = await prisma.agentExecution.findFirst({
      where: {
        taskId: harnessId,
        createdAt: { gte: new Date(Date.now() - DEBOUNCE_MS) },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (recentExecution) {
      log.debug(
        {
          harnessTaskId: harnessId,
          recentExecutionId: recentExecution.id,
          ageMs: Date.now() - recentExecution.createdAt.getTime(),
          reason: 'debounce',
        },
        'Reactor skipped: within debounce window'
      );
      return;
    }

    // All guards passed — queue the harness for SYNTHESIZE.
    // Engine's processPendingExecutions poller (10s interval) picks it up.

    // A1 (task #85): resolve triggeredBy by copying from the harness's OWN
    // latest execution (which is either the original mcp-direct CREATE or a
    // previous reactor-retrigger). This inherits the original triggering
    // user through arbitrary reactor-chain depth. Simpler than A2/A3 since
    // we already have the harness task id in scope.
    const priorExecRows = await prisma.$queryRaw<
      Array<{ context: unknown; id: string }>
    >`
      SELECT ae.context, ae.id
      FROM agent_executions ae
      WHERE ae."taskId" = ${harnessId}
      ORDER BY ae."createdAt" DESC
      LIMIT 1
    `;
    if (priorExecRows.length === 0) {
      log.warn(
        { harnessTaskId: harnessId },
        'Retrigger skipped: harness has no prior execution to inherit triggeredBy from (should be impossible — harness was just created+completed above)'
      );
      return;
    }
    const priorContext = priorExecRows[0].context as any;
    const priorTriggeredByParse = TriggeredBySchema.safeParse(priorContext?.triggeredBy);
    if (!priorTriggeredByParse.success) {
      log.warn(
        {
          harnessTaskId: harnessId,
          priorExecutionId: priorExecRows[0].id,
          priorTriggeredByShape: typeof priorContext?.triggeredBy,
          issues: priorTriggeredByParse.error.issues,
        },
        'Retrigger skipped: harness prior execution context.triggeredBy is malformed. Engine pre-flight will surface the stall rather than auto-retrigger with a poisoned triggeredBy.'
      );
      return;
    }
    const triggeredBy: TriggeredBy = {
      id: priorTriggeredByParse.data.id,
      source: 'reactor-pipeline-retrigger',
      parentExecutionId: priorExecRows[0].id,
      parentTaskId: harnessId,
    };

    // Guard 8 (D-4, 2026-06-14): per-harness reactor-generation budget. Caps the
    // auto-retrigger CHAIN depth (Guards 1-7 each bound a single retrigger only).
    // Read the counter ONLY from a server-written reactor prior — a non-reactor prior
    // (the original interactive CREATE) may carry a CLIENT-injected reactorGeneration
    // via stream/route.ts body.context, so treat it as 0 (see
    // client-context-trust-boundary-2026-06-14.md). Number() guards a legacy/string value.
    // Placed AFTER the triggeredBy parse-guard above so a poisoned prior context
    // short-circuits before any budget logic runs; BEFORE buildRichExecutionConfig so a
    // budget-exhausted chain does no config-build work.
    const priorGeneration =
      priorTriggeredByParse.data.source === 'reactor-pipeline-retrigger'
        ? Number(priorContext?.reactorGeneration ?? 0)
        : 0;
    const nextGeneration = priorGeneration + 1;
    if (priorGeneration >= MAX_HARNESS_REACTOR_GENERATIONS) {
      logReactorBudgetSkip('pipeline-retrigger', {
        harnessTaskId: harnessId,
        generation: priorGeneration,
        budget: MAX_HARNESS_REACTOR_GENERATIONS,
        cascadeCompletedTaskId: completedTaskId,
      });
      return;
    }

    // Build rich config via shared helper.
    const built = await buildRichExecutionConfig(harnessId, {
      triggerSource: 'pipeline-retrigger-reactor',
      extraConfigKeys: {
        // Signal SYNTHESIZE mode to the engine — the harness reads these from
        // its own config.autoRetrigger to detect it was reactor-triggered.
        autoRetrigger: true,
        reason: 'all-children-terminal',
      },
    });
    if (!built) {
      log.warn(
        { harnessTaskId: harnessId, harnessTemplateId },
        'Retrigger skipped: buildRichExecutionConfig returned null (harness/template load failed)'
      );
      return;
    }

    // Write via canonical wrapper (task #85 E2/E3). L3 (2026-04-18): throws
    // DuplicateActiveExecutionError if the partial UNIQUE index rejects a
    // concurrent duplicate create — silent no-op on that case. Harness retrigger
    // races diagnose different bugs than task-ready races (reactorSource label
    // distinguishes them in logs).
    try {
      const { execution } = await createAgentExecution({
        taskId: harnessId,
        agentTemplateId: built.taskAgentTemplateId,
        status: 'PENDING',
        config: built.config,
        triggeredBy,
        // D-4: persist the incremented generation so the NEXT retrigger inherits it
        // (read back via priorContext at Guard 8). Rides the same context channel as
        // triggeredBy; createAgentExecution spreads contextExtras verbatim into context.
        contextExtras: { cascadeCompletedTaskId: completedTaskId, reactorGeneration: nextGeneration },
        logs: ['Auto-retriggered by pipeline retrigger service (SYNTHESIZE mode)'],
      });

      log.info(
        {
          harnessTaskId: harnessId,
          harnessTitle,
          executionId: execution.id,
          triggeredBy: completedTaskId,
          childStageId: completed.stageId,
        },
        'Pipeline harness auto-retriggered for SYNTHESIZE mode'
      );
    } catch (innerErr) {
      if (innerErr instanceof DuplicateActiveExecutionError) {
        logReactorDuplicateSkip('pipeline-retrigger', {
          harnessTaskId: harnessId,
          existingExecutionId: innerErr.existingExecutionId,
          cascadeCompletedTaskId: completedTaskId,
          childStageId: completed.stageId,
        });
        return;
      }
      throw innerErr;
    }
  } catch (err) {
    // Never throw — reactor is best-effort. Log and move on.
    log.error(
      { err, completedTaskId },
      'Pipeline auto-retrigger failed (non-fatal — caller completion unaffected)'
    );
  }
}
