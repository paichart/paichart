/**
 * complete-task-terminally — the shared terminal-transition core (two-layer spine, Phase 2).
 *
 * Decision record: cline_docs/reviews/completion-path-unification-2026-07-24/SYNTHESIS.md
 * (8-specialist panel). Structural precedent: execution-terminal-persist
 * (runTerminalSuccessTx + persistTerminalSuccess); governance precedent: runExecutionCore
 * (seam discipline, threaded facts, pinned boundary test).
 *
 *   LAYER 1 — runTaskCompletionTx(tx, input): the pure in-tx spine. Fresh read → transition
 *     validate → APPROVAL dep-guard (shared predicate, tx snapshot) → PIPELINE 4-point invariant
 *     (effective-metadata-aware) → adapter buildUpdateData seam → CAS status write
 *     (updateMany gated on count — concurrent double-completes throw CompletionConflictError,
 *     never race). completedAt derives from the taskCompletedAtExtension chokepoint.
 *     Prisma-instantiation-free; NO side effects; safe under serialization retry by rollback.
 *   LAYER 2 — completeTaskTerminally(db, input): pre-tx expensive facts (F10 programConfidence)
 *     → serialization-retry-wrapped $transaction (RepeatableRead, 5000) around Layer 1 → POST-COMMIT
 *     tail: completion comment, canonical logTaskCompleted activity fact, reactors behind the
 *     THREADED `fireReactors` param (retrigger immediate; TaskReady behind the F9 deferral
 *     verbatim). Reactor imports are fire-time DYNAMIC (route bundles must not drag engine
 *     lifecycle deps).
 *
 * TRANSACTION-BOUNDARY RULE (the likeliest silent implementation error — es review §4):
 * reactors/comment/activity run strictly AFTER the outermost commit. The reactors re-read via
 * bare prisma and self-skip `not-completed-at-read` — an in-tx fire silently LOSES the cascade.
 * Adapters that own their tx (task.update) compose Layer 1 inside it and run the tail after
 * THEIR commit; adapters must never wrap completeTaskTerminally in another tx (no nesting).
 *
 * Threaded reactor params: `fireReactors` is per-adapter input, initially preserving today's
 * behavior byte-identically (MCP-complete true; web/bulk/MCP-update/move false). Flip A/B turn
 * the new paths on as param-only diffs — a hardcoded literal here = an accidental flip
 * (pinned by scripts/test-completion-core-boundary.ts, the runExecutionCore REACTOR pin analog).
 *
 * Residual (accepted, matches today): the F18 settledness clause is non-monotone — a re-execution
 * row can appear on a COMPLETED upstream between the in-tx check and commit; fail direction is
 * falsely-allow, and the reactor re-evaluates the same predicate at queue time.
 *
 * Boundary rules (pinned):
 *  - ZERO auth/POV-access logic here — adapters authenticate/authorize BEFORE calling (C-4 analog).
 *  - The dep predicate SQL lives ONLY in taskReadyReactorService (single source).
 *  - Guards take the CALLER's client — tx snapshot semantics are load-bearing.
 *  - No `@/lib/prisma` singleton import — Layer 2 takes `db` as a parameter.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { validateTaskStatusTransition } from './status-transitions';
import { hasUnsatisfiedDeps, listUnsatisfiedDeps } from '@/lib/services/taskReadyReactorService';
import {
  DependencyNotSatisfiedError,
  PipelineInvariantError,
  PipelineStageMismatchError,
  CompletionConflictError,
} from '@/lib/errors';
import { withSerializationRetry } from '@/lib/database/serialization-retry';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';
import { isProgramHarnessTask } from '@/lib/agents/harness/program-protocol';

const log = mcpLogger.child({ module: 'CompleteTaskTerminally' });

/** Any Prisma client the guards can run on — a TransactionClient or bare prisma. */
export type CompletionDbClient = Pick<Prisma.TransactionClient, 'task' | 'stage' | '$queryRaw'>;

/**
 * Dep-guard type scope (task-dependency ruling, panel-unanimous): APPROVAL only.
 * Edges on generic ACTION tasks are frequently informational/sequencing (the born-ready
 * reactor treats them as queueing hints — ratified A1/A2 divergences); blanket enforcement
 * would retroactively harden production data for zero safety benefit. Second fence over the
 * engine-spine exemption: every F17/F20/R4 stamp targets PIPELINE tasks, so even a mis-wired
 * caller cannot dep-block an engine escalation (PIPELINE ∉ this set).
 * DEFERRED-WITH-TRIGGER widening = edit this set (one line, no signature change).
 * NEVER an adapter parameter — adapters choose whether they call the guarded path, not what
 * the guard means.
 */
export const DEP_GUARD_ENFORCED_TYPES: ReadonlySet<string> = new Set(['APPROVAL']);

/** Audited override input — an explicit human action, never a silent bypass (Protocol 10). */
export interface DependencyOverride {
  reason: string;
}

/**
 * The enriched audit fact the caller must stamp into task metadata IN THE SAME WRITE when an
 * override is used (dep IDs + actor + timestamp + reason — never a bare boolean). Writable
 * ONLY via this guard path; every adapter strips the key from inbound client metadata.
 */
export interface CompletedWithDependencyOverrideFact {
  by: string;
  at: string; // ISO timestamp
  reason: string;
  unsatisfiedDepIds: string[];
}

/**
 * Item-1 guard: an APPROVAL task may not transition to COMPLETED while its own dependency
 * edges are unsatisfied (shared predicate, F18 settledness included).
 *
 * Self-contained: reads the task's type via the passed client (one PK read) so callers cannot
 * mis-scope it. Returns the override audit fact to stamp when `override` was used and the
 * guard would otherwise have thrown; returns null when the guard passed cleanly.
 *
 * @throws DependencyNotSatisfiedError (typed, carries the unsatisfied upstream facts)
 */
export async function assertCompletionDependenciesSatisfied(
  taskId: string,
  client: CompletionDbClient,
  opts?: { override?: DependencyOverride | null; actorUserId?: string }
): Promise<CompletedWithDependencyOverrideFact | null> {
  const task = await client.task.findUnique({
    where: { id: taskId },
    select: { type: true },
  });
  if (!task || !DEP_GUARD_ENFORCED_TYPES.has(task.type)) {
    return null; // out of scope — structural no-op for generic tasks
  }

  if (!(await hasUnsatisfiedDeps(taskId, client))) {
    return null; // satisfied — the common ripe-gate case (born-IN_PROGRESS single-call release)
  }

  const unsatisfied = await listUnsatisfiedDeps(taskId, client);

  if (opts?.override) {
    const fact: CompletedWithDependencyOverrideFact = {
      by: opts.actorUserId ?? 'unknown',
      at: new Date().toISOString(),
      reason: opts.override.reason,
      unsatisfiedDepIds: unsatisfied.map((d) => d.dependsOnId),
    };
    log.warn(
      { taskId, ...fact },
      'Completion dependency guard OVERRIDDEN — audited completedWithDependencyOverride fact returned for stamping'
    );
    return fact;
  }

  throw new DependencyNotSatisfiedError(taskId, unsatisfied);
}

/**
 * E1: the ONE copy of the PIPELINE 4-point completion invariant (anti-fabrication defense).
 * Replaces the two divergent handler copies (task-complete-handler.ts / task-update-handler.ts
 * — a live drift instance: they had already diverged in error class and metadata handling).
 *
 * Effective-metadata-aware: pass `effectiveMetadata` when the caller is merging metadata in
 * the same operation (the task.update `{pipelineStageId + COMPLETED}` one-call pattern);
 * defaults to the task's stored metadata.
 *
 * Required state for a PIPELINE task to complete:
 *   1. metadata.pipelineStageId is set (harness created a child stage)
 *   2. child stage contains ≥1 task (harness actually created children)
 *   3. every task in child stage is terminal: status=COMPLETED OR executionStatus=FAILED
 *   4. the stage's recorded harnessTaskId back-pointer matches this task (clobber defense)
 *
 * NOTE: the engine's F20 child-count check (execution-terminal-persist.ts) is the same SHAPE
 * but a deliberately different POLICY (no-child-stage falls through to pre-flight-bail instead
 * of throwing) — it does NOT call this function. Documented divergence, both sites.
 *
 * No-op for non-PIPELINE tasks. Throws PipelineInvariantError (points 1-3, stage-missing) or
 * PipelineStageMismatchError (point 4) — typed facts; adapters render.
 */
export async function assertPipelineCompletionInvariant(
  client: CompletionDbClient,
  task: { id: string; type: string; metadata: Prisma.JsonValue | null },
  opts?: { effectiveMetadata?: Record<string, unknown> | null }
): Promise<void> {
  if (task.type !== 'PIPELINE') return;

  const meta =
    opts?.effectiveMetadata ?? ((task.metadata as Record<string, unknown> | null) ?? {});
  const pipelineStageId = typeof meta.pipelineStageId === 'string' ? meta.pipelineStageId : null;

  if (!pipelineStageId) {
    throw new PipelineInvariantError(
      task.id,
      'no-child-stage',
      `Pipeline cannot complete: no child stage linked.\n\n` +
        `This PIPELINE task has no metadata.pipelineStageId — meaning CREATE mode never ran ` +
        `successfully. A harness cannot complete without decomposing its objective.\n\n` +
        `Run CREATE mode first: decompose the objective, create a child stage, wire children with deps and templates, record the child stage id in metadata.pipelineStageId, then exit. The engine will run children automatically and auto-retrigger you in SYNTHESIZE mode when they all finish.`
    );
  }

  const childCount = await client.task.count({ where: { stageId: pipelineStageId } });
  if (childCount === 0) {
    throw new PipelineInvariantError(
      task.id,
      'empty-child-stage',
      `Pipeline cannot complete: child stage "${pipelineStageId}" contains no tasks.\n\n` +
        `CREATE mode linked a stage but did not create any children. Either delete the ` +
        `metadata.pipelineStageId and re-run CREATE, or add child tasks to the stage.`,
      { pipelineStageId }
    );
  }

  const nonTerminalChildren = await client.task.count({
    where: {
      stageId: pipelineStageId,
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
    throw new PipelineInvariantError(
      task.id,
      'non-terminal-children',
      `Pipeline cannot complete: ${nonTerminalChildren} child task(s) in stage "${pipelineStageId}" are not yet terminal.\n\n` +
        `The harness exits after CREATE/ORCHESTRATE and is auto-retriggered by the pipeline reactor ` +
        `when all children reach a terminal state (COMPLETED or executionStatus=FAILED). Do not call ` +
        `task.complete on a PIPELINE task before the retrigger fires.`,
      { pipelineStageId, nonTerminalChildren }
    );
  }

  // 4th invariant point (2026-04-25): the stage's recorded harnessTaskId must match this
  // task's id — silent-corruption clobber defense. Back-pointer is write-once server-side
  // (task-update-handler back-pointer write), so TOCTOU is a non-concern.
  // See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
  const stage = await client.stage.findUnique({
    where: { id: pipelineStageId },
    select: { metadata: true },
  });

  if (!stage) {
    throw new PipelineInvariantError(
      task.id,
      'stage-missing',
      `Pipeline cannot complete: stage "${pipelineStageId}" no longer exists. ` +
        `task.metadata.pipelineStageId may be stale or the stage was deleted mid-run.`,
      { pipelineStageId }
    );
  }

  const stageMeta = (stage.metadata as Record<string, unknown> | null) ?? {};
  const recordedHarnessIdRaw = stageMeta.harnessTaskId;
  const recordedHarnessId =
    typeof recordedHarnessIdRaw === 'string' ? recordedHarnessIdRaw : null;

  if (recordedHarnessId === null) {
    // Post-sunset hard-fail (2026-04-25): missing/non-string back-pointer is the same
    // corruption class as a wrong-task back-pointer.
    log.warn(
      {
        securityEvent: true,
        taskId: task.id,
        pipelineStageId,
        recordedHarnessIdRaw,
        reason: 'no-back-pointer-or-non-string',
      },
      'PIPELINE clobber detected: stage has no string harnessTaskId back-pointer (post-sunset hard-fail).'
    );
    throw new PipelineStageMismatchError(task.id, pipelineStageId, null);
  } else if (recordedHarnessId !== task.id) {
    log.warn(
      {
        securityEvent: true,
        taskId: task.id,
        pipelineStageId,
        recordedHarnessId,
        reason: 'pipeline-stage-mismatch',
      },
      'PIPELINE clobber detected: stage harnessTaskId back-pointer does not match (silent-corruption defense fired)'
    );
    throw new PipelineStageMismatchError(task.id, pipelineStageId, recordedHarnessId);
  }

  log.info(
    { taskId: task.id, pipelineStageId, childCount },
    'PIPELINE task completion invariant verified — all 4 points pass'
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Phase 2 — the two-layer spine
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The actor completing the task — adapter-authenticated facts, threaded like error.json source.
 *
 * F7a (2026-07-25): 'WORKFLOW' removed. No adapter could ever produce it — workflowEngine reaches
 * the core through TaskService.updateTask and therefore arrives as 'API'. An enum member nothing
 * can emit is a lie in the type: a reader reasonably assumes workflow-driven completions are
 * distinguishable in activity provenance, and they were not. If we later want that provenance,
 * re-add the member IN THE SAME CHANGE as threading an actor through updateTask — the member alone
 * buys nothing. (delete > defend at zero producers, per 63e24f19.)
 */
export interface CompletionActor {
  userId: string;
  source: 'MCP' | 'API' | 'BULK' | 'MOVE';
}

export interface TaskCompletionTxInput {
  taskId: string;
  actor: CompletionActor;
  /**
   * Adapter-divergence seam (the runExecutionCore threaded-facts pattern): runs INSIDE the tx,
   * receives the tx client + the freshly-read row, returns extra update-data merged into the
   * ONE terminal write. MUST be pure (re-runs on serialization retry) and MUST return data
   * fields only — no status, no reactor decisions, no external side effects (pinned).
   */
  buildUpdateData?: (
    tx: Prisma.TransactionClient,
    existing: { id: string; status: string; type: string; metadata: Prisma.JsonValue | null; title: string | null }
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Core-computed metadata FACTS to fold into the write (Layer 2's F10 stamp). */
  metadataStamp?: Record<string, unknown> | null;
  /** Effective metadata for the PIPELINE invariant when the caller merges metadata itself (task.update). */
  effectiveMetadataOverride?: Record<string, unknown> | null;
  /** Audited dep-guard override — MCP task.complete adapter only (TD3). */
  dependencyOverride?: DependencyOverride | null;
  /** Response include shape (adapters differ); omitted → bare row. */
  include?: Prisma.TaskInclude;
}

export interface TaskCompletionTxResult {
  /** false = task was already COMPLETED at read (idempotent re-complete; no write, no cascade). */
  transitioned: boolean;
  taskType: string;
  task: unknown;
  overrideFact: CompletedWithDependencyOverrideFact | null;
}

/**
 * LAYER 1 — the in-tx terminal-transition spine. Composable: adapters that already own a
 * RepeatableRead tx (MCP task.update) call this inside it; everyone else goes through
 * completeTaskTerminally below. Throws typed errors; performs the ONLY human-path status
 * write (CAS). No side effects — safe to re-run via rollback.
 */
export async function runTaskCompletionTx(
  tx: Prisma.TransactionClient,
  input: TaskCompletionTxInput
): Promise<TaskCompletionTxResult> {
  const { taskId, actor } = input;

  // Fresh in-tx read — pre-tx snapshots go stale (the runTerminalSuccessTx I-7 rule).
  const existing = await tx.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, type: true, metadata: true, title: true },
  });
  if (!existing) {
    throw new Error(`Task not found: "${taskId}"`);
  }

  // Idempotent re-complete: no write, no cascade (constraint (b) — fire only on a REAL transition).
  if (existing.status === 'COMPLETED') {
    log.info({ taskId, source: actor.source }, 'completion no-op: task already COMPLETED at read');
    return { transitioned: false, taskType: existing.type, task: null, overrideFact: null };
  }

  validateTaskStatusTransition(existing.status, 'COMPLETED');

  const overrideFact = await assertCompletionDependenciesSatisfied(taskId, tx, {
    override: input.dependencyOverride ?? null,
    actorUserId: actor.userId,
  });

  // Adapter data seam BEFORE the invariant so a metadata merge riding this call is visible to it.
  const builderData = input.buildUpdateData ? await input.buildUpdateData(tx, existing) : {};
  if ('status' in builderData) {
    throw new Error('buildUpdateData must not set status — the core owns the terminal write');
  }

  const effectiveMetadata =
    (builderData.metadata as Record<string, unknown> | undefined) ??
    input.effectiveMetadataOverride ??
    undefined;
  await assertPipelineCompletionInvariant(tx, existing, { effectiveMetadata });

  // Metadata assembly: builder's merge (or stored) + core facts + the override audit fact.
  const stamp = input.metadataStamp ?? {};
  const needMetadataWrite =
    builderData.metadata !== undefined || Object.keys(stamp).length > 0 || overrideFact !== null;
  const metadataWrite = needMetadataWrite
    ? {
        metadata: JSON.parse(
          JSON.stringify({
            ...((builderData.metadata as Record<string, unknown> | undefined) ??
              ((existing.metadata as Record<string, unknown> | null) || {})),
            ...stamp,
            ...(overrideFact ? { completedWithDependencyOverride: overrideFact } : {}),
          })
        ) as Prisma.InputJsonValue,
      }
    : {};

  // CAS write (Phase-4a analog): gated on the status we validated — a concurrent transition
  // between our read and this write matches zero rows and throws, never silently double-writes.
  // completedAt derives from taskCompletedAtExtension (the single chokepoint).
  const cas = await tx.task.updateMany({
    where: { id: taskId, status: existing.status },
    data: {
      ...builderData,
      ...metadataWrite,
      status: 'COMPLETED',
      updatedAt: new Date(),
    },
  });
  if (cas.count === 0) {
    throw new CompletionConflictError(taskId, existing.status);
  }

  const task = await tx.task.findUnique({
    where: { id: taskId },
    ...(input.include ? { include: input.include } : {}),
  });

  return { transitioned: true, taskType: existing.type, task, overrideFact };
}

export interface CompleteTaskOptions extends Omit<TaskCompletionTxInput, 'metadataStamp'> {
  /** Sanitize at the WRITE SITE (adapter duty) — persisted as a Comment post-commit. */
  completionNote?: string | null;
  /** LLM-passed confidence (MCP task.complete) — used only for the F10 divergence WARN fact. */
  llmConfidenceScore?: number | null;
  /**
   * THREADED reactor param — never hardcode. Initial per-adapter values preserve today
   * byte-identically (MCP-complete true; web/bulk/MCP-update/move false). Flips A/B are
   * param-only diffs.
   */
  fireReactors: boolean;
}

export interface CompleteTaskObservers {
  onCompleted?: (facts: { taskId: string; transitioned: boolean }) => void | Promise<void>;
}

/**
 * F10 (2026-07-16, hoisted CORE-side per panel contradiction 3): engine-computed PROGRAM
 * confidence — a FACT from the children's own authoritative artifacts, stamped ADDITIVELY
 * (metadata.programConfidence; never clobbers confidenceScore). Computed PRE-tx (multi-query
 * artifact reads — the retry-purity rule keeps it out of the retried closure).
 */
async function computeProgramConfidenceStamp(
  db: PrismaClient | Prisma.TransactionClient,
  taskId: string,
  existing: { type: string; title: string | null; metadata: Prisma.JsonValue | null },
  llmConfidenceScore?: number | null
): Promise<Record<string, unknown>> {
  if (existing.type !== 'PIPELINE') return {};
  // STAMP-FIRST (WS2 Phase A, 2026-08-17): reads the task's own `metadata.protocol` stamp via
  // the shared predicate, with the TRANSITIONAL title-token fallback for pre-stamp tasks
  // (removal gated on the recorded backfill — see program-protocol.ts). A post-stamp rename no
  // longer moves this guard. History: the pre-2026-08-08 inline test had no closing paren and
  // prefix-matched `pov-program-lite`, stamping programConfidence on a protocol that may not be
  // confidence-bearing (a verdict presented as an engine-computed fact).
  if (!isProgramHarnessTask(existing)) return {};
  const meta = (existing.metadata as Record<string, unknown> | null) ?? {};
  const pipelineStageId = typeof meta.pipelineStageId === 'string' ? meta.pipelineStageId : null;
  if (!pipelineStageId) return {};

  try {
    const { selectAuthoritativeExecution } = await import('@/lib/services/execution-selection');
    const pipelineChildren = await db.task.findMany({
      where: { stageId: pipelineStageId, type: 'PIPELINE' },
      select: { id: true },
    });
    const scores: number[] = [];
    let missingChildScores = 0;
    for (const child of pipelineChildren) {
      let score: number | null = null;
      const { execution: authoritative } = await selectAuthoritativeExecution(db, child.id);
      if (authoritative) {
        const artifact = await db.agentArtifact.findFirst({
          where: { executionId: authoritative.id, name: { in: ['pipeline-index.json', 'result.json'] } },
          orderBy: { createdAt: 'desc' },
          select: { content: true },
        });
        if (artifact) {
          try {
            const parsed = JSON.parse(artifact.content) as Record<string, unknown>;
            if (typeof parsed.confidenceScore === 'number') score = parsed.confidenceScore;
          } catch { /* unparseable → missing */ }
        }
      }
      if (score == null) missingChildScores++;
      else scores.push(score);
    }
    if (scores.length === 0) return {};
    const stamp: Record<string, unknown> = {
      programConfidence: Math.min(...scores),
      programConfidenceChildren: scores.length,
      ...(missingChildScores > 0 ? { programConfidenceMissing: missingChildScores } : {}),
    };
    if (llmConfidenceScore != null && llmConfidenceScore !== Math.min(...scores)) {
      log.warn(
        { taskId, llmConfidence: llmConfidenceScore, computedMinChildConfidence: Math.min(...scores), errorCode: 'PROGRAM_CONFIDENCE_DIVERGENCE' },
        'Program confidence divergence: LLM-passed confidence != computed MIN child confidence (fact stamped as metadata.programConfidence)'
      );
    }
    return stamp;
  } catch (confErr) {
    log.warn(
      { taskId, err: confErr instanceof Error ? confErr.message : String(confErr) },
      'program-confidence computation failed — completing without the programConfidence fact (non-fatal)'
    );
    return {};
  }
}

/**
 * LAYER 2 — the default wrapper: owns the tx (RepeatableRead + withSerializationRetry) and the
 * post-commit effects tail. Adapters WITHOUT their own tx call this whole; the MCP task.update
 * adapter composes Layer 1 inside its existing tx and runs `fireCompletionEffects` after its
 * own commit instead. Never call this from inside an open transaction (Prisma cannot nest).
 */
export async function completeTaskTerminally(
  db: PrismaClient,
  input: CompleteTaskOptions,
  observers: CompleteTaskObservers = {}
): Promise<TaskCompletionTxResult & { reactorsFired: boolean }> {
  // Pre-tx expensive facts (retry purity: nothing non-idempotent inside the retried closure).
  const preRead = await db.task.findUnique({
    where: { id: input.taskId },
    select: { type: true, title: true, metadata: true },
  });
  const metadataStamp = preRead
    ? await computeProgramConfidenceStamp(db, input.taskId, preRead, input.llmConfidenceScore)
    : {};

  const result = await withSerializationRetry(
    () =>
      db.$transaction(
        (tx) => runTaskCompletionTx(tx, { ...input, metadataStamp }),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 5000 }
      ),
    `complete-task-terminally:${input.actor.source}`
  );

  const reactorsFired = await fireCompletionEffects(db, input, result);
  await observers.onCompleted?.({ taskId: input.taskId, transitioned: result.transitioned });
  return { ...result, reactorsFired };
}

/**
 * The POST-COMMIT effects tail — shared by the wrapper above AND by own-tx adapters (they call
 * it after THEIR commit). Everything here is fire-and-forget/log-never-throw (Pattern #46):
 * comment, canonical completion-activity fact, and the guarded reactors.
 */
export async function fireCompletionEffects(
  db: PrismaClient,
  input: Pick<CompleteTaskOptions, 'taskId' | 'actor' | 'completionNote' | 'fireReactors'>,
  result: Pick<TaskCompletionTxResult, 'transitioned' | 'taskType'>
): Promise<boolean> {
  if (!result.transitioned) return false;
  const { taskId, actor } = input;

  // Completion comment — post-commit (pre-write creation could orphan a "completed" comment on
  // a failed complete, and would double-create under retry — db-manager finding 2).
  if (input.completionNote) {
    try {
      await db.comment.create({
        data: { taskId, userId: actor.userId, text: input.completionNote, createdAt: new Date() },
      });
      log.info({ taskId }, 'created completion comment for task');
    } catch (e) {
      log.error({ taskId, err: e instanceof Error ? e.message : String(e) }, 'completion comment failed (non-fatal)');
    }
  }

  // The ONE canonical completion-activity fact (boundary-contract matrix #11). Dynamic import:
  // taskActivityService transitively pulls the prisma singleton, which would break Layer 1's
  // prisma-instantiation-free mock-testability (DM1) if imported at module load.
  const activityMeta: ActivityMetadata = { source: actor.source === 'MCP' ? 'MCP' : 'API' };
  import('./taskActivityService')
    .then(({ logTaskCompleted }) => logTaskCompleted(taskId, actor.userId, activityMeta))
    .catch(() => {});

  if (!input.fireReactors) return false;
  await fireCompletionReactors(db, { taskId, taskType: result.taskType, retrigger: true });
  return true;
}

/**
 * The reactor-only sub-tail (FLIP B split): ONE copy of the fire policy shared by the per-task
 * tail above AND the bulk post-batch fan-out (which dedupes the retrigger by stage — pass
 * retrigger:false for non-representative rows). Fire-and-forget; post-commit ONLY.
 */
export async function fireCompletionReactors(
  db: PrismaClient,
  fact: { taskId: string; taskType: string; retrigger: boolean }
): Promise<void> {
  const { taskId } = fact;
  // Fire-and-forget reactors AFTER the commit. Dynamic imports: the reactor services pull
  // engine process-lifecycle deps that must not load at module import in route bundles
  // (execution-terminal-persist precedent).
  //
  // 1. PipelineRetrigger stays IMMEDIATE: parent↔child linkage is metadata.pipelineStageId,
  //    NOT task_dependencies, so the retrigger path never does the synchronous context-chain
  //    that finding 9 broke. ⚠ LINKAGE ASSUMPTION: if a program ever wires a parent-harness →
  //    child task_dependency edge, the retrigger would need the same deferral as TaskReady.
  //    Bulk dedupes this fire by stageId (every retrigger guard keys off the child's stage —
  //    100 same-stage children ⇒ 1 call): retrigger=true only for the stage representative.
  if (fact.retrigger) {
    const { maybeRetriggerPipelineHarness } = await import('@/lib/services/pipelineRetriggerReactorService');
    maybeRetriggerPipelineHarness(taskId).catch(() => {});
  }

  // 2. TaskReady behind the F9 deferral (finding 9, 2026-07-15 — verbatim, fact-keyed not
  //    path-keyed): a PIPELINE completed MID-EXECUTION by its own SYNTHESIZE run must defer to
  //    the terminal persist (artifacts don't exist yet — dependents would chain the PREVIOUS
  //    execution's artifact). Scope: ONLY PIPELINE with an active PENDING/RUNNING execution.
  //    Template-less gates keep the immediate else-branch fire (the human gate-release path
  //    depends on it). Residual zombie edge covered by the reaper-side fires (path-agnostic).
  const { maybeQueueReadyDependents } = await import('@/lib/services/taskReadyReactorService');
  if (fact.taskType === 'PIPELINE') {
    db.agentExecution.count({
      where: { taskId, status: { in: ['PENDING', 'RUNNING'] } },
    }).then((active) => {
      if (active > 0) {
        log.info(
          { taskId, activeExecutions: active },
          'TaskReady reactor deferred to terminal persist — PIPELINE completed mid-execution (finding 9)'
        );
        return;
      }
      maybeQueueReadyDependents(taskId).catch(() => {});
    }).catch((countErr) => {
      // Count failed — fall back to the immediate fire (at-least-once beats never). WARN loudly:
      // a persistent count failure silently reverts to the pre-fix stale-chain behavior.
      log.warn({ taskId, err: countErr }, 'F9 deferral count failed — falling back to immediate TaskReady fire');
      maybeQueueReadyDependents(taskId).catch(() => {});
    });
  } else {
    maybeQueueReadyDependents(taskId).catch(() => {});
  }
}
