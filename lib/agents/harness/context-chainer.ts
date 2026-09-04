/**
 * Automatic Context Chainer
 *
 * Reads result.json artifacts from completed dependency tasks and
 * populates the current task's inputContext before execution.
 *
 * This is the core Phase 1 deliverable for the distributed harness.
 * It eliminates the manual copy-paste friction identified in Phase 0.
 *
 * @version 1.0.0
 * @created 2026-04-04
 * @see cline_docs/vision-distributed-harness-2026-04-03.md
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { mergeTaskInputContext } from '@/lib/tasks/services/inputContext';
import { sanitizeChainedOutput } from '@/lib/agents/harness/sanitize-chained-output';
import { selectAuthoritativeExecution } from '@/lib/services/execution-selection';

const log = logger.child({ module: 'ContextChainer' });

// A1 §6 chained-context cap (2026-06-06). A THIRD, distinct cap — NOT the 8KB
// tool-loop cap (MAX_TOOL_RESULT_LENGTH, agentic-tool-loop.ts) and NOT the 50KB
// tool-result persistence cap (MAX_STORED_TOOL_RESULT_BYTES, execution-artifacts.ts). This bounds the upstream finalResponse(s) piped into the
// downstream agent's §6 "Pipeline Context" prompt block. Deliberately GENEROUS:
// a runaway guard, not a budget — it clears the real ~16KB harvest by ~8× and
// will not bind on normal synthesis pipelines. If a truncation warn fires on a
// real production pipeline, RAISE the per-predecessor cap (do not lower it).
// See cline_docs/reviews/2026-06-06-pipeline-stage-handoff-truncation/IMPLEMENTATION-PLAN-v2.md (Change 4).
export const PER_PREDECESSOR_SOFT_CAP = 131072; // 128 KB per upstream finalResponse (exported for the tier-invariant test, Finding D)
export const TOTAL_CONTEXT_CEILING = 524288;    // 512 KB summed across all chainedFrom (~10% of 5MB result.json cap)

function truncationMarker(kept: number, total: number): string {
  return `\n\n[CHAINED CONTEXT TRUNCATED: ${kept} of ${total} chars]`;
}

export interface ChainedContext {
  chainedFrom: Array<{
    taskId: string;
    taskTitle: string;
    agentRole: string | null;
    confidenceScore: number | null;
    qualityMetrics: Record<string, unknown> | null;
    /**
     * CC3 (2026-07-30): the predecessor's OWN `derivationContainment` stamp, transcribed at chain
     * time from the facts artifact this loop already parses. Null when the predecessor never
     * stamped one (any non-SYNTHESIZE execution, or a non-PIPELINE predecessor).
     *
     * This is the SINGLE resolution point for a predecessor's containment fact — see the comment at
     * the push site. Consumers (the program gate's consuming-leg attribution) read it from here
     * rather than re-querying, because re-querying needs the PIPELINE-vs-ACTION artifact-name
     * branch and that has been got wrong at three separate sites, silently, each time.
     */
    derivationContainment: Record<string, unknown> | null;
    finalResponse: string;
    executionId: string;
    // A1 truncation facts (Protocol-10 fact; pre-wires deferred D1 coverage signal)
    truncated?: boolean;
    originalChars?: number;
    // R9 sanitization facts (Protocol-10 fact — what happened, not a verdict). Present
    // only when the CONNECTED_OUTPUT_SANITIZE_ENABLED flag is on — presence = R9 examined
    // this predecessor, `sanitized` = it rewrote it (same semantic as site A's ToolCallRecord).
    sanitized?: boolean;
    neutralizedCount?: number;
    // Chars removed by the normalize pass. Counted separately because a strip-only rewrite
    // yields sanitized=true, neutralizedCount=0 — see the consumer rule on anySanitized below.
    strippedControlChars?: number;
    // CC2 (2026-07-15): which artifact the chained payload came from. 'result.json' for
    // normal predecessors; for a PIPELINE predecessor 'report.md' (the deliverable —
    // preferred) or 'pipeline-index.json' (documented fallback when no report.md exists).
    source?: 'result.json' | 'report.md' | 'pipeline-index.json';
  }>;
  pipelineMetadata: {
    chainedAt: string;
    totalDependencies: number;
    completedDependencies: number;
    allDependenciesMet: boolean;
    // A1 truncation facts surfaced one level up for the (deferred) SYNTHESIZE coverage gate
    anyTruncated: boolean;
    totalChars: number;
    // R9 fact surfaced one level up: did any predecessor's output get neutralized/stripped?
    // OPERATOR-TELEMETRY ONLY (review 2026-06-24, harness I-2 / validation N-1): this boolean
    // conflates a benign NBSP/control strip with a real neutralization, so it is NOT a security
    // verdict — it is not rendered into the §6 prompt (render-pipeline-context does not read it;
    // preserve that). ⚠️ SCOPE (2026-08-23, 1c): that rule is about THIS conflated aggregate only.
    // The PER-PREDECESSOR `neutralizedCount` above IS now rendered into §6 as a transport note
    // (render-pipeline-context.ts), because an injection rewrite puts a visible marker in the
    // reader's copy while the stored artifact stays clean — a reader told nothing blocks a
    // document it cannot inspect (IGP-T1 R5). Strip-only rewrites stay silent there: they leave
    // no marker to misread. Do not "simplify" that to read anySanitized. A security signal/coverage-gate must branch on neutralizedCount > 0 for
    // INJECTION specifically; branch on `sanitized` (or strippedControlChars) for "was this
    // rewritten at all" — a strip-only rewrite has neutralizedCount 0 and still corrupts output
    // (review 2026-07-26, sec-ops 2(e): keying on the count alone MISSES that class).
    anySanitized: boolean;
    // CC2b (2026-07-15, boundary B4): per-predecessor NOT-chained facts — every skip records
    // WHICH predecessor dropped and WHY (the aggregate completed/total counts can't distinguish
    // a by-design absence from a failure). Empty array on the happy path. The program-level
    // gate consumes notChained.length > 0 / predecessors < expectedPredecessors as BLOCKING
    // for program children (protocol wiring, Session B).
    notChained: Array<{ taskId: string; reason: string }>;
    // F19 (2026-07-16): count of deps that CAN produce a chainable artifact
    // (type PIPELINE or templated). Template-less human gates/holds complete without ever
    // executing, so they are excluded here AND from the notChained bookkeeping — the
    // program gate compares completedDependencies against THIS, never totalDependencies
    // (which stays the raw forensic edge count; do not redefine it — string-pinned).
    chainCapablePredecessors: number;
    // F19 (2026-07-16): chained PIPELINE predecessors that PROMISED a deliverable
    // (metadata.deliverableSourceTaskId set) but chained from the pipeline-index.json
    // fallback instead of report.md — the deliverable is missing (deleted / source failed)
    // even though the count looks complete (T4e run #2). A pipeline that never set
    // deliverableSourceTaskId hands off its index BY DESIGN and is NOT degraded.
    degradedPredecessors: number;
  };
}

/**
 * Check if all dependency tasks are completed and chain their outputs.
 *
 * Returns null if there are no dependencies (nothing to chain).
 * Throws if dependencies exist but aren't all completed (blocks execution).
 *
 * @param taskId - The task about to be executed
 * @returns ChainedContext to merge into inputContext, or null if no dependencies
 */
export async function chainDependencyContext(taskId: string): Promise<ChainedContext | null> {
  // Find all tasks this task depends on
  const dependencies = await prisma.taskDependency.findMany({
    where: { taskId },
    // CC2b (2026-07-15, boundary B2): deterministic foundational-first order. The total-ceiling
    // trim below walks chainedFrom TAIL-first on the invariant "the earliest / most-foundational
    // output survives whole" — that invariant is only real if this list is ordered. Earliest-created
    // predecessor = most foundational (the Harvester/Architect precede consumers by construction).
    orderBy: { dependsOn: { createdAt: 'asc' } },
    select: {
      dependsOn: {
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          agentRole: true,
          agentTemplateId: true, // F19: chain-capable classification
          executionStatus: true,
          metadata: true,
        },
      },
    },
  });

  if (dependencies.length === 0) {
    return null; // No dependencies — nothing to chain
  }

  const completedDeps = dependencies.filter(d => d.dependsOn.status === 'COMPLETED');
  const allMet = completedDeps.length === dependencies.length;

  // Check each dependency for a successful execution with result.json
  const chainedFrom: ChainedContext['chainedFrom'] = [];
  const notChained: ChainedContext['pipelineMetadata']['notChained'] = [];

  // F19 (2026-07-16): classify chain-capability ONCE — a template-less non-PIPELINE dep
  // (D4 human gate / operator hold) completes without executing and produces no artifact;
  // its absence from chainedFrom is by design, never a drop. Skipping it BEFORE the
  // notChained bookkeeping keeps notChained a pure missing-deliverable signal (T4e run #2:
  // a released hold false-fired both `predecessors < expected` AND notChained).
  const isChainCapable = (d: (typeof dependencies)[number]['dependsOn']) =>
    d.type === 'PIPELINE' || d.agentTemplateId != null;
  let degradedPredecessors = 0;

  for (const dep of dependencies) {
    const depTask = dep.dependsOn;

    if (!isChainCapable(depTask)) {
      continue; // by-design non-producer (gate/hold) — not chained, not a notChained drop
    }

    // F18 detector (2026-07-16, defense-in-depth behind the reactor/manual-gate settledness
    // predicates): a PIPELINE predecessor with an execution still in flight is
    // COMPLETED-but-UNSETTLED — its deliverable isn't committed yet. NEVER silently chain a
    // stale prior execution (T4e run #1); record the drop as a fact and let the settledness
    // predicates re-queue this task when the predecessor settles.
    if (depTask.type === 'PIPELINE') {
      const activeExec = await prisma.agentExecution.findFirst({
        where: { taskId: depTask.id, status: { in: ['PENDING', 'RUNNING'] } },
        select: { id: true },
      });
      if (activeExec) {
        log.warn(
          { taskId, dependencyTaskId: depTask.id, activeExecutionId: activeExec.id },
          'PIPELINE dependency completed but its execution is still persisting — not chaining a stale snapshot'
        );
        notChained.push({ taskId: depTask.id, reason: 'pipeline-synthesis-in-flight' });
        continue;
      }
    }

    if (depTask.status !== 'COMPLETED' && depTask.executionStatus !== 'SUCCESS') {
      log.warn(
        { taskId, dependencyTaskId: depTask.id, dependencyStatus: depTask.status },
        'Dependency task not completed — skipping context chain for this dependency'
      );
      notChained.push({ taskId: depTask.id, reason: 'dependency-not-completed' });
      continue;
    }

    // Authoritative execution via the SHARED selector (retry-band keep-best 2026-07-04,
    // reviewed 92%): supersession filter (a regressed orchestrator retry never chains) +
    // the uniform R8 empty-deliverable floor (an empty-finalResponse SUCCESS is skipped
    // LOUDLY instead of silently chaining '' — BC-6/F6). Miss behavior unchanged: skip+warn.
    const { execution: latestExec } = await selectAuthoritativeExecution(prisma, depTask.id, {
      requireNonEmptyArtifact: true,
    });

    if (!latestExec) {
      log.warn(
        { taskId, dependencyTaskId: depTask.id },
        'No selectable successful execution for dependency — skipping'
      );
      notChained.push({ taskId: depTask.id, reason: 'no-selectable-execution' });
      continue;
    }

    // CC2 (2026-07-15, program-harness design): a PIPELINE predecessor never writes
    // result.json — the harness root writes pipeline-index.json (forensic, result-shaped)
    // and, when metadata.deliverableSourceTaskId resolved, report.md (the deliverable).
    // Pre-CC2 this findFirst returned null for PIPELINE predecessors → silent skip →
    // cross-pipeline chaining yielded ZERO context (deps F2, boundary-confirmed).
    // Payload preference for PIPELINE: report.md (the deliverable the next pipeline should
    // design against) → fallback pipeline-index.json finalResponse (warn + source fact).
    const isPipelinePredecessor = depTask.type === 'PIPELINE';
    const factsArtifactName = isPipelinePredecessor ? 'pipeline-index.json' : 'result.json';

    // Read the result-shaped facts artifact (confidence/qualityMetrics + fallback payload)
    const resultArtifact = await prisma.agentArtifact.findFirst({
      where: { executionId: latestExec.id, name: factsArtifactName },
      select: { content: true },
    });

    if (!resultArtifact) {
      log.warn(
        { taskId, dependencyTaskId: depTask.id, executionId: latestExec.id, factsArtifactName },
        'No result-shaped artifact found — skipping'
      );
      notChained.push({ taskId: depTask.id, reason: `no-${factsArtifactName}` });
      continue;
    }

    // For a PIPELINE predecessor, prefer the deliverable report.md as the chained payload.
    const reportArtifact = isPipelinePredecessor
      ? await prisma.agentArtifact.findFirst({
          where: { executionId: latestExec.id, name: 'report.md' },
          select: { content: true },
        })
      : null;
    if (isPipelinePredecessor && !reportArtifact) {
      // Still chained (fallback below) — but the absence is a recorded fact, not silence:
      // report.md only exists when the child pipeline set deliverableSourceTaskId AND the
      // source child had a SUCCESS execution (boundary B4 hop facts).
      log.warn(
        { taskId, dependencyTaskId: depTask.id, executionId: latestExec.id },
        'PIPELINE predecessor has no report.md (deliverableSourceTaskId unset or source failed) — chaining pipeline-index fallback'
      );
    }

    // D3: the upstream result.json hit the 5MB write cap (agentExecutionEngine.ts
    // truncate). Its tail is no longer valid JSON, so JSON.parse below would throw
    // and the predecessor would be silently skipped. Detect + warn explicitly so a
    // truncated upstream is an observable fact, not a mystery gap. Mirrors the harness
    // report.md extraction guard. (Latent — finalResponse can't realistically hit 5MB.)
    if (resultArtifact.content.endsWith('[TRUNCATED: exceeded 5MB limit]')) {
      log.warn(
        { taskId, dependencyTaskId: depTask.id, executionId: latestExec.id },
        'Upstream result.json was 5MB-truncated at write time — chained context for this dependency skipped (unparseable)'
      );
      notChained.push({ taskId: depTask.id, reason: '5mb-truncated-unparseable' });
      continue;
    }

    try {
      const parsed = JSON.parse(resultArtifact.content);

      // Confidence (BC-3/L-07 fix, 2026-07-04): read from the SELECTED execution's OWN
      // result.json — never task.metadata.confidenceScore, which is last-writer-wins at
      // the TASK level and can belong to a DIFFERENT (e.g. superseded) execution. Under
      // keep-best, pairing the selected text with the task-level score would alias the
      // regression's score onto the original's content.
      const confidence = parsed.confidenceScore ?? null;

      // A1: per-predecessor soft cap. Never DROP a predecessor (dropping is the
      // silent-partial bug we are fixing) — truncate-with-marker and carry the fact.
      // CC2: PIPELINE predecessor → deliverable report.md preferred; pipeline-index fallback.
      const source: NonNullable<ChainedContext['chainedFrom'][number]['source']> =
        isPipelinePredecessor
          ? (reportArtifact ? 'report.md' : 'pipeline-index.json')
          : 'result.json';
      const rawResponse: string = (isPipelinePredecessor && reportArtifact)
        ? reportArtifact.content
        : (parsed.finalResponse || '');
      // R9 (WS1 site B): neutralize untrusted upstream output BEFORE truncation/chaining.
      // Flag-gated (default off) for staged rollout. Sanitize first so the soft-cap bounds
      // the sanitized text; originalChars stays the RAW length (the byte-identical acceptance
      // and the truncation marker's "of N" both reference raw).
      // NOTE (review 2026-06-24, harness N2): neutralization can GROW text (a short match like
      // `system:` -> a longer marker), so sanitize can INDUCE truncation a raw response just under
      // the cap would not have hit. Latent — the per-predecessor cap clears normal harvests ~8x.
      const r9 = process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED === 'true'
        ? sanitizeChainedOutput(rawResponse)
        : { text: rawResponse, strippedControlChars: 0, neutralizedInjections: [] as Array<{ category: string; match: string }> };
      let finalResponse = r9.text;
      let truncated = false;
      if (finalResponse.length > PER_PREDECESSOR_SOFT_CAP) {
        finalResponse = finalResponse.slice(0, PER_PREDECESSOR_SOFT_CAP)
          + truncationMarker(PER_PREDECESSOR_SOFT_CAP, rawResponse.length);
        truncated = true;
        log.warn(
          {
            taskId,
            dependencyTaskId: depTask.id,
            capType: 'per-predecessor',
            originalChars: rawResponse.length,
            keptChars: PER_PREDECESSOR_SOFT_CAP,
            capValue: PER_PREDECESSOR_SOFT_CAP,
          },
          'Chained context truncated — downstream stage will receive partial upstream output'
        );
      }

      // F19 (2026-07-16): promised-but-absent deliverable. deliverableSourceTaskId set means
      // this pipeline PROMISED a report.md; chaining anything else means the deliverable is
      // missing — the composition would be built on the forensic index (T4e run #2).
      if (
        isPipelinePredecessor &&
        source !== 'report.md' &&
        !!(depTask.metadata as Record<string, unknown> | null)?.deliverableSourceTaskId
      ) {
        degradedPredecessors++;
      }

      chainedFrom.push({
        taskId: depTask.id,
        taskTitle: depTask.title,
        agentRole: depTask.agentRole,
        confidenceScore: confidence,
        qualityMetrics: parsed.qualityMetrics ?? null,
        // CC3 (2026-07-30): carry the predecessor's own derivation-containment stamp. FREE — the
        // artifact is already resolved and parsed above for `confidenceScore`.
        //
        // WHY HERE AND NOWHERE ELSE: resolving a predecessor's facts artifact requires knowing that
        // a PIPELINE task writes `pipeline-index.json` while an ACTION writes `result.json`
        // (factsArtifactName, ~:216). That branch has now been got wrong at THREE sites — fixed here
        // as CC2, in agent-results-handler as wave-2 E1, and shipped broken in execution-core on
        // 2026-07-29 (which matched `result.json` only, silently resolved nothing for a PIPELINE
        // predecessor, and left the program gate's consuming-leg exception permanently unavailable).
        // The failure is SILENT — an empty result reads identically to "there was nothing upstream".
        // So the resolution lives ONCE, here, where it is already correct, and downstream consumers
        // read this field instead of re-deriving it. Do not re-add a predecessor artifact lookup
        // elsewhere; extend this instead.
        derivationContainment: parsed.derivationContainment ?? null,
        finalResponse,
        executionId: latestExec.id,
        truncated,
        originalChars: rawResponse.length,
        sanitized: r9.strippedControlChars > 0 || r9.neutralizedInjections.length > 0,
        neutralizedCount: r9.neutralizedInjections.length,
        strippedControlChars: r9.strippedControlChars,
        source,
      });

      log.info(
        {
          taskId,
          dependencyTaskId: depTask.id,
          confidenceScore: parsed.confidenceScore,
          responseLength: parsed.finalResponse?.length || 0,
        },
        'Context chained from dependency'
      );
    } catch (err) {
      log.error(
        { err, taskId, dependencyTaskId: depTask.id },
        'Failed to parse result-shaped artifact from dependency'
      );
      notChained.push({ taskId: depTask.id, reason: 'parse-failed' });
    }
  }

  // A1: total-context ceiling. Trim TAIL predecessors first so the earliest /
  // most-foundational output (e.g. the Harvester root in a synthesis pipeline)
  // survives whole. Soft guard — marker overhead may leave it marginally over;
  // acceptable for a generous 512KB runaway bound.
  let totalChars = chainedFrom.reduce((sum, e) => sum + e.finalResponse.length, 0);
  for (let i = chainedFrom.length - 1; i >= 0 && totalChars > TOTAL_CONTEXT_CEILING; i--) {
    const entry = chainedFrom[i];
    const overBy = totalChars - TOTAL_CONTEXT_CEILING;
    const keep = Math.max(0, entry.finalResponse.length - overBy);
    entry.finalResponse = entry.finalResponse.slice(0, keep)
      + truncationMarker(keep, entry.originalChars ?? entry.finalResponse.length);
    entry.truncated = true;
    totalChars = chainedFrom.reduce((sum, e) => sum + e.finalResponse.length, 0);
    log.warn(
      {
        taskId,
        dependencyTaskId: entry.taskId,
        capType: 'total-ceiling',
        originalChars: entry.originalChars,
        keptChars: keep,
        capValue: TOTAL_CONTEXT_CEILING,
      },
      'Chained context truncated — total ceiling exceeded'
    );
  }

  return {
    chainedFrom,
    pipelineMetadata: {
      chainedAt: new Date().toISOString(),
      totalDependencies: dependencies.length,
      completedDependencies: chainedFrom.length,
      allDependenciesMet: allMet,
      anyTruncated: chainedFrom.some(e => e.truncated),
      totalChars,
      anySanitized: chainedFrom.some(e => e.sanitized === true),
      notChained,
      chainCapablePredecessors: dependencies.filter(d => isChainCapable(d.dependsOn)).length,
      degradedPredecessors,
    },
  };
}

/**
 * Apply chained context to a task's inputContext.
 *
 * Merges the chained dependency outputs with any existing inputContext.
 * Called automatically before agent execution when dependencies exist.
 *
 * @param taskId - The task to update
 * @param chainedContext - Output from chainDependencyContext()
 * @returns The merged inputContext that was written (so an in-memory caller — the SSE
 *   stream route — can adopt it WITHOUT a second DB read that could race replication
 *   lag; A2). The value comes from the UPDATE's RETURNING clause, so it is the
 *   authoritative committed value — logically equal to what the poller path re-reads
 *   (jsonb does not preserve key byte-order; the §6 consumer reads parsed values).
 *
 * TS4 (2026-06-08): the merge is now an atomic Postgres `||` UPDATE via
 * mergeTaskInputContext — a plain findUnique+update was lost-update-racy vs concurrent
 * foreign inputContext writers (see bug-class BC19 / transaction-atomicity-pattern.md).
 */
export async function applyChainedContext(
  taskId: string,
  chainedContext: ChainedContext
): Promise<Record<string, unknown>> {
  // Serialize through JSON so the jsonb patch carries no Prisma-rejected type metadata.
  const patch = JSON.parse(JSON.stringify(chainedContext)) as Record<string, unknown>;

  // Atomic shallow-merge: COALESCE(existing,'{}') || patch, in one UPDATE … RETURNING.
  // Patch wins on the top-level keys (chainedFrom, pipelineMetadata) while preserving
  // any user-set keys — same direction as the prior JS spread, but race-free.
  const merged = await mergeTaskInputContext(taskId, patch);

  log.info(
    {
      taskId,
      dependenciesChained: chainedContext.chainedFrom.length,
      allMet: chainedContext.pipelineMetadata.allDependenciesMet,
    },
    'Chained context applied to task'
  );

  return merged ?? patch;
}
