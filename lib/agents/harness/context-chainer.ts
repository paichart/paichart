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
import { sanitizeChainedOutput, isR9OperatorEvent } from '@/lib/agents/harness/sanitize-chained-output';
import { selectAuthoritativeExecution, CHAIN_SELECTION_OPTIONS } from '@/lib/services/execution-selection';
import { resolveTaskProtocol, canonicalProtocolName } from '@/lib/agents/harness/program-protocol';

const log = logger.child({ module: 'ContextChainer' });

/** The one lane whose rollback fact is carried to a Reviewer today (net #3, ruled 2026-09-11). */
const ROLLBACK_FACT_LANE = 'observability-config';

/**
 * Is this predecessor's leg in the lane whose rollback fact we carry?
 *
 * TWO SHAPES, and the second is the one that bites. A PIPELINE predecessor (cross-leg chaining)
 * carries a real protocol stamp on its own row, so the ladder answers directly. An ACTION sibling
 * — the common case here, a Reviewer chaining from its own Author — carries `metadata.protocol` as
 * a PRESENT-BUT-NULL key, and the ladder treats a present key as authoritative (the R1 closure), so
 * it answers null for every leg in every lane. Asking the sibling therefore silently disables the
 * carry everywhere. (The enrichment hit this same trap the same day; it is not obvious from either
 * call site, which is why it is written down at both.)
 *
 * So: ask the predecessor first, then fall back to its LEG via `stage.metadata.harnessTaskId`.
 * Two PK lookups, and only ever reached when a rollback fact actually exists to carry.
 */
async function resolveRollbackLane(
  depTask: { title: string | null; metadata: unknown; stageId: string | null }
): Promise<boolean> {
  const direct = resolveTaskProtocol(depTask).protocol;
  if (direct) return canonicalProtocolName(direct) === canonicalProtocolName(ROLLBACK_FACT_LANE);
  if (!depTask.stageId) return false;
  const stage = await prisma.stage.findUnique({
    where: { id: depTask.stageId }, select: { metadata: true },
  });
  const legId = (stage?.metadata as Record<string, unknown> | null)?.harnessTaskId;
  if (typeof legId !== 'string' || !legId) return false;
  const leg = await prisma.task.findUnique({
    where: { id: legId }, select: { title: true, metadata: true },
  });
  const protocol = leg ? resolveTaskProtocol(leg).protocol : null;
  return !!protocol && canonicalProtocolName(protocol) === canonicalProtocolName(ROLLBACK_FACT_LANE);
}

// A1 §6 chained-context cap (2026-06-06). A THIRD, distinct cap — NOT the 8KB
// tool-loop cap (MAX_TOOL_RESULT_LENGTH, agentic-tool-loop.ts) and NOT the 50KB
// tool-result persistence cap (MAX_STORED_TOOL_RESULT_BYTES, execution-artifacts.ts). This bounds the upstream finalResponse(s) piped into the
// downstream agent's §6 "Pipeline Context" prompt block. Deliberately GENEROUS:
// a runaway guard, not a budget — it clears the real ~16KB harvest by ~8× and
// will not bind on normal synthesis pipelines. If a truncation warn fires on a
// real production pipeline, RAISE the per-predecessor cap (do not lower it).
// See cline_docs/reviews/2026-06-06-pipeline-stage-handoff-truncation/IMPLEMENTATION-PLAN-v2.md (Change 4).
// SCOPE, stated because the two caps differ and the difference is deliberate (2026-09-12): this one
// bounds ONE upstream `finalResponse` and nothing else — its name and its 8x-a-real-harvest sizing
// are both about that string. TOTAL_CONTEXT_CEILING below bounds the SERIALIZED ENTRY, carried facts
// included, because that is what actually reaches the §6 prompt. Do not "make them consistent" by
// widening this one: a per-predecessor cap counting facts would truncate a finalResponse to make
// room for a fact, which is the opposite of the trim-text-never-facts rule at the ceiling.
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
     * H-4 (2026-09-10): the predecessor's stamped MARKER PRESENCE — which machine-parsed blocks the
     * platform found in its final response. Carried here (like confidenceScore) because the leaf
     * Reviewer's §6 is the ONLY place it reads a sibling; a card-only fact never reaches it.
     */
    markerPresence: Record<string, unknown> | null;
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
    /**
     * Net #3 (2026-09-11): the predecessor Author's stamped `rollbackContainment` — is the content
     * its rollback promises to RESTORE present in the harvest that leg witnessed?
     *
     * Carried here for the same reason as `markerPresence`: the leaf Reviewer's §6 is the ONLY
     * place it reads a sibling's fact, and a card-only fact never reaches its prompt (R12). This
     * one matters more than most, because the net exists to answer a question the Reviewer
     * STRUCTURALLY cannot: it reads the package, never the raw harvest, so a verbatim-quotation
     * claim is uncheckable from where the judgement is made. Three live refusals of correct
     * rollbacks came from exactly that gap.
     *
     * Null when the predecessor never stamped one (any non-Author execution, or an Author predating
     * the net) AND null OUT OF LANE — see the lane guard at the push site. Null renders nothing:
     * there is no ABSENT token for this fact while it gates nothing, deliberately, because ABSENT
     * here means "not yet produced", not "treat as blocking".
     */
    rollbackContainment: Record<string, unknown> | null;
    finalResponse: string;
    executionId: string;
    // A1 truncation facts (Protocol-10 fact; pre-wires deferred D1 coverage signal)
    truncated?: boolean;
    originalChars?: number;
    // R9 sanitization facts (Protocol-10 fact — what happened, not a verdict). Present ONLY when
    // R9 examined this predecessor (CONNECTED_OUTPUT_SANITIZE_ENABLED on) — absent otherwise, NEVER
    // stamped as a clean "false" for text R9 did not see (F9: the flag-off path used to do exactly
    // that, and the default self-host posture is flag-off). Same semantic as site A's ToolCallRecord.
    // "Was this rewritten" = `rewritten`; which step = `rewriteClasses` (F9, 2026-09-25). `rewritten`
    // also explains a gap between `originalChars` (RAW length) and the delivered text's length.
    // ABSENT `rewritten` on an entry stamped before F9 (incl. an injected legacy copy) means UNKNOWN,
    // never false — the `degraded` precedent below.
    // `sanitized` is LEGACY, FROZEN at its 2026-07-26 meaning (zero-width/bidi or C0/C1 strip fired,
    // or an injection pattern was neutralized). It does NOT mean "rewritten" — NFKC, ANSI, the
    // quarantine-tag defang and `emptied` are excluded. Do not widen it (sanitize-chained-output.ts).
    sanitized?: boolean;
    rewritten?: boolean;
    rewriteClasses?: string[];
    neutralizedCount?: number;
    // Chars removed by the zero-width/bidi + C0-C1 strips (not ANSI). Counted separately because a
    // strip-only rewrite yields neutralizedCount=0.
    strippedControlChars?: number;
    // CC2 (2026-07-15): which artifact the chained payload came from. 'result.json' for
    // normal predecessors; for a PIPELINE predecessor 'report.md' (the deliverable —
    // preferred) or 'pipeline-index.json' (documented fallback when no report.md exists).
    source?: 'result.json' | 'report.md' | 'pipeline-index.json';
    // F19 PER ENTRY (2026-09-16): the boolean the `degradedPredecessors` COUNT was summed from and then
    // discarded. Carried so a consumer that receives this entry second-hand (an injected copy, below)
    // can qualify it — a "deliverable" heading over a pipeline-index.json fallback is a stronger false
    // assertion than "Previous Task" was. Absent on entries stamped before this date: treat absent as
    // UNKNOWN, never as "not degraded" (the renderer keys on `source` for the heading, not on this).
    degraded?: boolean;
    // CROSS-PIPELINE DELIVERY (2026-09-16, Bug Class 84 fix). Set ONLY on an entry COPIED VERBATIM from
    // the owning leg's own `chainedFrom` into a non-PIPELINE child — the leg this child's stage belongs
    // to. Absent on every entry the child earned through its own task_dependencies edge. The stamp is
    // PLATFORM-WRITTEN at prepare and lands in the frozen execution config (BC-T6-1), so it is the
    // per-execution provenance a corpus query can key on. It is NOT the forgeable-hint class of
    // `interfaceContractInheritedFrom`: no user channel writes `chainedFrom` (every prepare rewrites it).
    inheritedFromLeg?: string;
    inheritedAt?: string;
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
    // no marker to misread. Do not "simplify" that to read anySanitized. F9 (2026-09-25): "was this
    // rewritten at all" is the per-entry `rewritten`, NOT this aggregate and NOT `sanitized` (the
    // 2(e) rule that said so was ~3/4 wrong: NFKC, ANSI and the tag defang never set it).
    // ⚠️ UNREAD AND UNPROJECTED: deriveChainedContextSignal (execution-artifacts.ts) never copies it,
    // so it has reached 0 result.json artifacts (1,019 tasks carry it). Kept for now; its removal or a
    // real consumer is register item F9-s6 — do not add a sibling aggregate without projecting it.
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
    // ── CROSS-PIPELINE DELIVERY (2026-09-16) ─────────────────────────────────────────────────────
    // The four fields below describe the INJECTED population (entries copied from the owning leg's
    // chainedFrom, see `LegInjection`). They are kept OUT of the dependency-derived counts above ON
    // PURPOSE: `completedDependencies` / `totalDependencies` / `chainCapablePredecessors` /
    // `allDependenciesMet` are computed from the task_dependencies ROWS and never count an injected
    // entry — `predecessors === chainCapablePredecessors` is a string-pinned Protocol-10 fact the
    // program gate reads, and an injected entry is not a predecessor of THIS task. Only the
    // payload-describing aggregates (`totalChars`, `anyTruncated`, `anySanitized`) are computed over
    // the WHOLE array, injected entries included — they describe what the prompt carries.
    // ⚠️ `anySanitized` is therefore a MIXED-POPULATION aggregate: it can go true from an injected
    // entry, which was sanitized at the LEG's prepare (copied entries are never re-sanitized here).
    /** The leg whose chainedFrom was consulted; null when this task is not a leg's child (or no leg resolved). */
    inheritedFromLeg: string | null;
    /** How many injected entries are in `chainedFrom`. */
    inheritedPredecessors: number;
    /** DENOMINATOR: how many entries the leg OFFERED (pre-policy — candidates + every skip). 0 here
     *  with a resolved leg means "nothing on offer"; >0 with inheritedPredecessors 0 means every one
     *  was skipped and `inheritedSkipped` names why. Never a silent zero. */
    legCrossPipelineEntries: number;
    /** Every leg entry NOT injected, with its reason. ⚠️ NEVER folded into `notChained` — the program
     *  gate treats notChained.length > 0 as BLOCKING, and a fail-open here must not fail closed. */
    inheritedSkipped: Array<{ taskId: string; reason: string }>;
  };
}

/**
 * CROSS-PIPELINE DELIVERY (2026-09-16) — what the caller hands the chainer to inject.
 *
 * THE DEFECT (Bug Class 84, container-tier terminus): a program's cross-pipeline edge is leg→leg. The
 * consuming LEG receives the upstream leg's deliverable in its own chainedFrom (51 of 51 edges), and
 * the leg's harness — an LLM — paraphrases it into its children's task descriptions; no deterministic
 * path carries it to a CHILD (3 of 51). Run 3's Architect held the correct digits in prose and refused
 * them, correctly, because prose is not the platform channel. Instance 2 (2026-08-17) had no contract
 * telling it to refuse, proceeded, and RELEASED on a value it could not verify.
 *
 * THE FIX: pass the entry, extract nothing. The owning leg's chainedFrom entries are copied VERBATIM
 * into the child's chainedFrom, stamped `inheritedFromLeg`. The `derivationContainment` stamp rides
 * inside each entry, so a stamped crossing value arrives as a FACT; the report.md prose arrives as the
 * SAME bytes the leg saw (already sanitized and capped at the leg's prepare). Deciding WHICH value
 * crosses is a verdict this deliberately does not make (Protocol 10).
 *
 * Resolution of the leg is the CALLER's (prepare-task-for-execution → resolveOwningLeg): the chainer
 * takes the entries so a fixture needs no extra stub. `entries` is the leg's stored jsonb — untyped
 * on purpose; the chainer validates the minimum it relies on and skips the rest with a reason.
 */
export interface LegInjection {
  legTaskId: string;
  entries: unknown[];
  /** The CHILD's agentRole (the task being prepared), for the exclusion policy below. null = unnamed. */
  childAgentRole?: string | null;
}

/**
 * INJECTION SCOPE — an EXCLUSION list, never an inclusion list (DECISION-injection-scope.md).
 *
 * WHY EXCLUDE HARVESTERS (prompt-construction, from the renderer's chair): a harvester's output is a
 * point-in-time snapshot of OBSERVED state, and an upstream report.md carries allocations/CIDRs/VLANs
 * in exactly the shape of a harvest table. A harvester that folds an injected entry into
 * `## Harvested Allocations` produces a clean-looking harvest containing a value nobody observed on
 * the device — machine-parsed ground truth the containment net compares derived values against. It
 * poisons the anti-fabrication net at its ROOT; every tier above then checks correctly against
 * contaminated data. The provenance stamp cannot defend this (it says WHO produced it, not IS IT STILL
 * TRUE) and `role="context_only"` addresses instruction-following, the wrong threat model. The
 * harvester's own seeded guidance says it "run[s] BEFORE any design and ha[s] no predecessor".
 *
 * WHY EXCLUSION, NOT INCLUSION: an inclusion list fails CLOSED — a new domain adds a consuming role,
 * nobody updates the list, delivery silently stops: Bug Class 84 recreated by its own fix. A null /
 * unnamed role matches no exclusion and RECEIVES the injection — a stated property (255 leg children
 * carry a null role), pinned by fixture.
 *
 * ⚠️ Do NOT reuse `HARNESS_LEAF_ROLE_RE` (marker-presence.ts) — /harvest|architect|design|author/i
 * would exclude the CONSUMING roles (`infra_change_architect`, `config_change_author`) this fix exists
 * for. Spell the names literally.
 *
 * `change_reviewer` is excluded FOR NOW with a reason: its §6 holds exactly one document today and its
 * guidance says so; three self-host format vetoes (2026-09-09) were reviewers misreading a
 * one-document §6. Revisit when a reviewer is told to check `## Consumed Values` against the upstream.
 * `program_architect` is on NEITHER list — it is a child of the program ROOT, which has no upstream
 * pipeline, so resolveOwningLeg finds nothing and the question is moot.
 */
export const INJECTION_EXCLUDED_ROLES: ReadonlySet<string> = new Set([
  'infra_state_harvester',      // harvest-shaped
  'artifact_harvester',         // harvest-shaped
  'synthesis_source_acquirer',  // harvest-shaped despite the name — the shape is the signal
  'network_state_harvester',    // harvest-shaped
  'change_reviewer',            // for now — see above
  'publication_reviewer',       // artifact-synthesis' reviewer — same seat as change_reviewer
  'requirements_reviewer',      // requirements-authoring's reviewer — same seat (decided 2026-09-24)
]);

/**
 * RECONCILIATION TRIPWIRE (2026-09-17). The list above is LITERAL NAMES, deliberately — see the
 * HARNESS_LEAF_ROLE_RE warning. That choice has one failure mode: a domain that names its
 * harvest-shaped or review-shaped role differently falls through and RECEIVES the injection.
 *
 * Found exactly that way: `publication_reviewer` (artifact-synthesis, 12 children) sat outside the
 * list while `change_reviewer` (the same seat in the four infra domains) was excluded. Zero live
 * impact — artifact-synthesis has never been a leg inside a program — but it was latent, and it is
 * the direction that matters: an exclusion list fails toward DELIVERY, which is normally the safe
 * side, EXCEPT for these two shapes, where delivery is the harm (a harvester folding an upstream
 * value into machine-parsed ground truth; a reviewer gaining a second reviewable document).
 *
 * So: warn when a role LOOKS like one of those shapes and is not excluded. A warn, never a block —
 * the judgement of which roles belong is a human one, and a shape-matching regex is not entitled to
 * make it (`infra_change_architect` would be untouched here, correctly, but a future
 * `design_reviewer` would warn and deserve a decision, not a silent exclusion).
 */
const INJECTION_SHAPE_TRIPWIRE_RE = /review|harvest|acquir/i;

/**
 * Check if all dependency tasks are completed and chain their outputs.
 *
 * Returns null if there are no dependencies (nothing to chain).
 * Throws if dependencies exist but aren't all completed (blocks execution).
 *
 * @param taskId - The task about to be executed
 * @returns ChainedContext to merge into inputContext, or null if no dependencies
 */
/** F-D (2026-09-10): the client is injectable so the in-flight / not-completed arms have a real fixture
 *  (scripts/test-context-chainer-inflight.ts). Production callers pass nothing. */
export type ChainerClient = typeof prisma;
export async function chainDependencyContext(
  taskId: string,
  db: ChainerClient = prisma,
  opts: { inject?: LegInjection | null } = {}
): Promise<ChainedContext | null> {
  // Find all tasks this task depends on
  const dependencies = await db.taskDependency.findMany({
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
          stageId: true, // net #3 lane resolution — see resolveRollbackLane()
        },
      },
    },
  });

  // CROSS-PIPELINE DELIVERY: the injectable entries, classified BEFORE the dep-free early return so a
  // leg's Phase-0 harvester (dep-free by construction — 52/198 children) can still receive them.
  // The early return itself is KEPT: with no dependencies AND nothing to inject the contract is
  // unchanged (null, no write) — every other dep-free task on the platform, and the read-only replay
  // in scripts/replay-containment.ts, see exactly what they saw before. Only a task with something to
  // inject takes the normal path; an EMPTY chainedFrom is never written (Array.isArray([]) is true and
  // the renderer would emit a hollow "0 of 0" §6 block).
  const injection = classifyLegInjection(opts.inject);

  if (dependencies.length === 0 && injection.candidates.length === 0) {
    if (injection.legTaskId && injection.skipped.length > 0) {
      // A DEP-FREE child whose leg OFFERED entries that were all excluded/filtered: no context, so no
      // row-level record — this log line is the only trace (see the recording limit in
      // classifyLegInjection). The excluded harvest population lands here by design.
      log.info(
        { taskId, legTaskId: injection.legTaskId, legCrossPipelineEntries: injection.skipped.length, skipped: injection.skipped },
        'Owning leg consulted — nothing inherited (dep-free child; skips are log-only here)'
      );
    }
    return null; // No dependencies, nothing to inject — nothing to chain
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
    // H-5 (2026-09-09): the SAME guard for every chain-capable predecessor. An ACTION Harvester that
    // called task.complete on itself mid-execution was chained as EMPTY (no selectable execution yet),
    // and its consumer designed against nothing (devext Run 6). The reason string keeps the PIPELINE
    // form for pipelines (pinned) and names the ACTION case distinctly for replay.
    // F-B (panel 2026-09-10): only a COMPLETED dependency can be "completed but persisting" — a
    // not-yet-completed upstream with a running execution is the ordinary not-completed case below,
    // and must not be recorded as in-flight (it logged "completed" falsely).
    if (depTask.status === 'COMPLETED') {
      const activeExec = await db.agentExecution.findFirst({
        where: { taskId: depTask.id, status: { in: ['PENDING', 'RUNNING'] } },
        select: { id: true },
      });
      if (activeExec) {
        log.warn(
          { taskId, dependencyTaskId: depTask.id, dependencyType: depTask.type, activeExecutionId: activeExec.id },
          'Dependency completed but its execution is still persisting — not chaining a stale snapshot'
        );
        notChained.push({ taskId: depTask.id,
          reason: depTask.type === 'PIPELINE' ? 'pipeline-synthesis-in-flight' : 'execution-in-flight' });
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
    // CHAIN_SELECTION_OPTIONS, not a literal: the mechanical nets read through the same constant
    // (authoritative-result-read.ts) so the gate is stamped from exactly the execution chained here.
    const { execution: latestExec } = await selectAuthoritativeExecution(db, depTask.id, CHAIN_SELECTION_OPTIONS);

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
    const resultArtifact = await db.agentArtifact.findFirst({
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
      ? await db.agentArtifact.findFirst({
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
      // F9: null when R9 did not run, so the push site stamps NO R9 facts (never a fabricated clean).
      const r9 = process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED === 'true'
        ? sanitizeChainedOutput(rawResponse)
        : null;
      let finalResponse = r9 ? r9.text : rawResponse;
      if (r9 && isR9OperatorEvent(r9.rewriteClasses)) {
        // Site-B operator event (F9 — before this there was NO securityEvent at site B at all).
        // Same gate as site A (R9_OPERATOR_EVENT_CLASSES). dependency + predecessor execution ids
        // let an operator dedupe: every re-prepare re-chains the same bytes. No match text for the
        // tag class (unbounded, attacker-controlled); injection matches truncated as at site A.
        log.warn(
          {
            securityEvent: true,
            site: 'B',
            taskId,
            dependencyTaskId: depTask.id,
            predecessorExecutionId: latestExec.id,
            rewriteClasses: r9.rewriteClasses,
            neutralizedCount: r9.neutralizedInjections.length,
            neutralizedCategories: Array.from(new Set(r9.neutralizedInjections.map(n => n.category))),
            matches: r9.neutralizedInjections.slice(0, 5).map(n => n.match.slice(0, 60)),
          },
          'R9 sanitizer rewrote chained predecessor output before the downstream reasoner (site B)'
        );
      }
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
      const degraded =
        isPipelinePredecessor &&
        source !== 'report.md' &&
        !!(depTask.metadata as Record<string, unknown> | null)?.deliverableSourceTaskId;
      if (degraded) {
        degradedPredecessors++;
      }

      // Resolved BEFORE the push so the lane lookups are skipped entirely when there is no fact to
      // carry — which is every predecessor that is not an Author, i.e. most of them.
      const stampedRollback =
        (parsed as { rollbackContainment?: Record<string, unknown> }).rollbackContainment ?? null;
      const rollbackFact = stampedRollback && (await resolveRollbackLane(depTask))
        ? stampedRollback
        : null;

      chainedFrom.push({
        taskId: depTask.id,
        taskTitle: depTask.title,
        agentRole: depTask.agentRole,
        confidenceScore: confidence,
        qualityMetrics: parsed.qualityMetrics ?? null,
        markerPresence: (parsed as { markerPresence?: Record<string, unknown> }).markerPresence ?? null,
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
        // Net #3 (2026-09-11). Read from the SELECTED execution's own result.json, exactly like
        // `confidenceScore` above (BC-3) and the two containment fields — never task.metadata,
        // which is last-writer-wins at the task level and can belong to a different execution.
        //
        // LANE GUARD, and it is a FIELD OMISSION rather than a chain skip: the predecessor is still
        // fully chained, it simply carries no rollback fact. So nothing is recorded in
        // `notChained` — that array means "this predecessor's CONTEXT did not arrive", which would
        // be false here and would make a healthy chain read degraded.
        //
        // WHY THE LANE EXISTS: a corpus re-measure over 125 archived packages put the unmatched-
        // line rate at 66% outside observability-config. Handing a Reviewer a fact that cries wolf
        // gets it ignored precisely when it is right, which would waste the exoneration value the
        // net was built for. The other lanes are not wrong, they are unruled — see
        // cline_docs/follow-ups/rollback-containment-context-entry-2026-09-11.md.
        rollbackContainment: rollbackFact,
        finalResponse,
        executionId: latestExec.id,
        truncated,
        originalChars: rawResponse.length,
        // R9 facts only when R9 examined the text (F9). `sanitized` = LEGACY, frozen expression.
        ...(r9 ? {
          sanitized: r9.strippedControlChars > 0 || r9.neutralizedInjections.length > 0,
          rewritten: r9.rewritten,
          rewriteClasses: r9.rewriteClasses,
          neutralizedCount: r9.neutralizedInjections.length,
          strippedControlChars: r9.strippedControlChars,
        } : {}),
        source,
        degraded,
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
  //
  // ⚠️ MEASURE THE WHOLE ENTRY, TRIM ONLY `finalResponse` (2026-09-12). This summed
  // `e.finalResponse.length` alone until today, so every carried FACT — `markerPresence`,
  // `derivationContainment`, `rollbackContainment`, and each net the registry adds — was
  // outside the accounting entirely. Those facts are rendered into §6 and therefore ARE
  // chained context; a chain could sit "at" 512 KB and serialize materially larger, silently.
  // Measured 2026-09-12 across all 658 archived predecessor entries: ~0.8 KB/entry of fact
  // today, worst-case ~3.2 KB/entry once four nets carry their honest-limits `scope` prose —
  // still far under the ceiling (max observed total 217 KB), which is exactly why this had to
  // be fixed while it was cheap. A ceiling exists to bound a RUNAWAY, and a runaway is
  // precisely when the uncounted fraction is largest.
  //
  // TRIMMING STAYS finalResponse-ONLY, deliberately. A truncated fact is a CORRUPT fact, and a
  // fact that silently vanished at the ceiling is the A1 class one layer up — a consumer reads
  // ABSENT and cannot tell "never stamped" from "dropped for space". So the overhead is
  // COUNTED but never CUT: an entry whose facts alone exceed the ceiling trims its
  // finalResponse to zero and the loop moves on to the next predecessor rather than spinning.
  const entryChars = (e: (typeof chainedFrom)[number]): number => {
    try {
      return JSON.stringify(e)?.length ?? e.finalResponse.length;
    } catch {
      // A non-serializable entry can only over-count by omission; never let accounting throw
      // inside a soft guard. Degrade to the pre-2026-09-12 behaviour for that entry alone.
      return e.finalResponse.length;
    }
  };
  const sumChars = () => chainedFrom.reduce((sum, e) => sum + entryChars(e), 0);
  let totalChars = sumChars();
  // ONE loop body, TWO passes (2026-09-16). The body below is the thrice-fixed arithmetic, verbatim;
  // what changed is WHICH entries it may cut. `candidates` is walked tail-first and only those
  // entries are trimmed, while `totalChars` is always the sum over the WHOLE array. Pass 1 (here)
  // runs over the child's OWN entries exactly as before. Pass 2 runs after the leg's entries are
  // injected, restricted to the INJECTED entries, against whatever headroom pass 1 left — so the
  // child's own harvest is never cut to make room for an injection, and the single ceiling still
  // bounds the whole payload. Keying pass 2 on `inheritedFromLeg` rather than array position is
  // what lets the injected block sit at the HEAD (it is the most foundational input) while still
  // being the first thing trimmed. A SECOND copy of this loop restricted by hand was rejected: it
  // is the exact block that was wrong three times, and two copies drift.
  const trimTailToCeiling = (candidates: Array<(typeof chainedFrom)[number]>): void => {
  for (let i = candidates.length - 1; i >= 0 && totalChars > TOTAL_CONTEXT_CEILING; i--) {
    const entry = candidates[i];
    const overBy = totalChars - TOTAL_CONTEXT_CEILING;
    // RE-TRIM SAFETY (2026-09-16): an entry that was ALREADY truncated (per-predecessor arm above, or
    // an injected copy the LEG's ceiling cut) carries its marker at the tail of `finalResponse`. Slicing
    // that string could land INSIDE the old marker and leave a garbled fragment in front of the new
    // one. Strip the old marker first; `originalChars` is the RAW upstream length either way, so the
    // fresh marker's "of N" stays true. (Pre-existing latent nit for the per-predecessor→ceiling case;
    // reachable in earnest now that injected entries can be cut a second time.)
    const alreadyTruncated = entry.truncated === true;
    if (alreadyTruncated) {
      entry.finalResponse = entry.finalResponse.replace(/\n\n\[CHAINED CONTEXT TRUNCATED: \d+ of \d+ chars\]$/, '');
    }
    // SUBTRACT THE MARKER THIS TRIM IS ABOUT TO ADD (2026-09-12). `keep = len - overBy` left the
    // entry ~50 chars over after the marker was appended, so the loop fell through to the NEXT
    // predecessor and shaved ~54 chars off it, and the next, and the next — cascading all the way
    // to the HEAD. That silently contradicted this block's own promise that the earliest /
    // most-foundational predecessor "survives whole": in a 4-predecessor chain the Harvester root
    // was being trimmed to pay for the marker on the tail. Pre-existing (the old arithmetic had the
    // same shape) and only visible once a fixture put a chain deliberately just over the line.
    // Budgeting the marker up front makes the loop converge on the tail entry, as documented.
    // The bound is computed from the UNTRIMMED lengths, so it can only over-reserve by a digit
    // or two — never under-reserve, which is the direction that would re-open the cascade.
    //
    // ⚠️ MEASURED IN SERIALIZED BYTES, NOT RAW CHARS, because the accounting above is serialized:
    // the marker opens with two newlines, and `JSON.stringify` renders each as the two characters
    // \n. A raw-length budget therefore under-reserves by exactly the escape growth, each pass
    // removes as many characters as its own marker adds, the total never falls, and the loop walks
    // the whole chain shaving a marker's worth off every predecessor — the cascade, in a subtler
    // form. `- 2` drops the quotes `JSON.stringify` puts around the string.
    const markerBudget = JSON.stringify(truncationMarker(
      entry.finalResponse.length,
      entry.originalChars ?? entry.finalResponse.length
    )).length - 2;
    const keep = Math.max(0, entry.finalResponse.length - overBy - markerBudget);
    entry.finalResponse = entry.finalResponse.slice(0, keep)
      + truncationMarker(keep, entry.originalChars ?? entry.finalResponse.length);
    entry.truncated = true;
    totalChars = sumChars();
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
  };
  trimTailToCeiling(chainedFrom); // pass 1: the child's own entries, unchanged behaviour

  // ── CROSS-PIPELINE DELIVERY: inject the owning leg's entries ──────────────────────────────────
  // Counts that describe THIS task's dependency rows are pinned BEFORE the append (see the metadata
  // type comment): `completedDependencies` is the own-entry count, never chainedFrom.length.
  const completedDependencies = chainedFrom.length;
  const ownTaskIds = new Set(chainedFrom.map((e) => e.taskId));
  const notChainedTaskIds = new Set(notChained.map((n) => n.taskId));
  const inheritedSkipped: ChainedContext['pipelineMetadata']['inheritedSkipped'] = [...injection.skipped];
  const injected: typeof chainedFrom = [];
  const inheritedAt = new Date().toISOString();
  for (const candidate of injection.candidates) {
    // DE-DUP AGAINST BOTH ARRAYS. A taskId already in the child's own chainedFrom: the child's OWN
    // entry wins — it came through selectAuthoritativeExecution and is counted. A taskId in
    // notChained: SKIP — injecting it would make the row assert the predecessor both blocked and
    // arrived, and for an in-flight upstream would reinstate exactly the stale snapshot the guard
    // refused. (The in-flight guard exists only where the child holds an edge; a dep-free child has
    // no such check and receives whatever the LEG chained at ITS prepare — say so, do not hide it.)
    if (ownTaskIds.has(candidate.taskId)) {
      inheritedSkipped.push({ taskId: candidate.taskId, reason: 'own-edge-wins' });
      continue;
    }
    if (notChainedTaskIds.has(candidate.taskId)) {
      inheritedSkipped.push({ taskId: candidate.taskId, reason: 'in-not-chained' });
      continue;
    }
    injected.push({ ...candidate, inheritedFromLeg: injection.legTaskId!, inheritedAt });
  }
  if (injected.length > 0) {
    // HEAD, in received order: the leg predates its own children by construction, so this asserts
    // nothing that needs a timestamp read. Rendering order is NOT trim order — see pass 2 below.
    chainedFrom.unshift(...injected);
    totalChars = sumChars();
    trimTailToCeiling(injected); // pass 2: ONLY the injected entries, against the remaining headroom
    log.info(
      { taskId, legTaskId: injection.legTaskId, inherited: injected.map((e) => e.taskId), skipped: inheritedSkipped },
      'Cross-pipeline entries inherited from the owning leg'
    );
  } else if (injection.legTaskId) {
    log.info(
      { taskId, legTaskId: injection.legTaskId, legCrossPipelineEntries: injection.candidates.length + injection.skipped.length, skipped: inheritedSkipped },
      'Owning leg consulted — nothing inherited'
    );
  }

  return {
    chainedFrom,
    pipelineMetadata: {
      chainedAt: new Date().toISOString(),
      totalDependencies: dependencies.length,
      completedDependencies, // own entries ONLY — pinned before the injection append
      allDependenciesMet: allMet,
      anyTruncated: chainedFrom.some(e => e.truncated),
      totalChars,
      anySanitized: chainedFrom.some(e => e.sanitized === true),
      notChained,
      chainCapablePredecessors: dependencies.filter(d => isChainCapable(d.dependsOn)).length,
      degradedPredecessors,
      inheritedFromLeg: injection.legTaskId,
      inheritedPredecessors: injected.length,
      // OFFERED count, not post-policy: a leg that offered three result.json entries must read
      // "inherited 0 of 3", with inheritedSkipped CONFIRMING why — not "0 of 0, nothing on offer".
      legCrossPipelineEntries: injection.candidates.length + injection.skipped.length,
      inheritedSkipped,
    },
  };
}

/**
 * Classify the leg's stored entries into injectable candidates + recorded skips. Pure; exported for
 * the fixture. SOURCE POLICY, stated as a policy and not a filter: only a PIPELINE-sourced entry —
 * `source: 'report.md'` (the deliverable) or `'pipeline-index.json'` (the forensic fallback) — is a
 * cross-pipeline entry. EXCLUDED: `'result.json'` (an ACTION upstream of the leg — a program-level
 * producer feeding a leg is not delivered by this mechanism today) and entries with NO `source`
 * (pre-CC2, before 2026-07-15 — unclassifiable, so not guessed). The plan's literal
 * `source !== 'result.json'` would have admitted the source-less legacy shape; this is the positive
 * form of the same policy. Malformed entries (no string taskId / finalResponse) are skipped, named.
 */
export function classifyLegInjection(inject: LegInjection | null | undefined): {
  legTaskId: string | null;
  candidates: ChainedContext['chainedFrom'];
  skipped: Array<{ taskId: string; reason: string }>;
} {
  if (!inject || !inject.legTaskId || !Array.isArray(inject.entries)) {
    return { legTaskId: inject?.legTaskId ?? null, candidates: [], skipped: [] };
  }
  const candidates: ChainedContext['chainedFrom'] = [];
  const skipped: Array<{ taskId: string; reason: string }> = [];
  // ROLE EXCLUSION first: every offered entry is recorded `role-excluded` and none is a candidate.
  // RECORDING LIMIT, named rather than claimed: `inheritedSkipped` lives in pipelineMetadata, which
  // exists only when the chainer returns a context. An excluded DEP-FREE child (177 of 186 excluded
  // children today) therefore gets no row-level record — only the early-return log line below in
  // chainDependencyContext. Where the child holds its own edges (change_reviewer, 240 of 241) the
  // skips DO land in the row. A12 is closed on the with-deps population only.
  const role = inject.childAgentRole ?? null;
  if (role && !INJECTION_EXCLUDED_ROLES.has(role) && INJECTION_SHAPE_TRIPWIRE_RE.test(role)) {
    log.warn(
      { role, legTaskId: inject.legTaskId, errorCode: 'INJECTION_ROLE_SHAPE_UNREVIEWED' },
      'Role looks harvest- or review-shaped but is not in INJECTION_EXCLUDED_ROLES — it WILL receive ' +
      'the cross-pipeline injection. Decide deliberately and add it to the list or record why not.',
    );
  }
  if (role && INJECTION_EXCLUDED_ROLES.has(role)) {
    for (const raw of inject.entries) {
      const id = (raw as { taskId?: unknown } | null)?.taskId;
      skipped.push({ taskId: typeof id === 'string' ? id : '<malformed>', reason: 'role-excluded' });
    }
    return { legTaskId: inject.legTaskId, candidates, skipped };
  }
  for (const raw of inject.entries) {
    const e = raw as Partial<ChainedContext['chainedFrom'][number]> | null;
    if (!e || typeof e !== 'object' || typeof e.taskId !== 'string' || typeof e.finalResponse !== 'string') {
      skipped.push({ taskId: typeof e?.taskId === 'string' ? e.taskId : '<malformed>', reason: 'malformed-entry' });
      continue;
    }
    if (e.source !== 'report.md' && e.source !== 'pipeline-index.json') {
      skipped.push({ taskId: e.taskId, reason: 'not-cross-pipeline-source' });
      continue;
    }
    // Copy — never alias the leg's object; the trim mutates finalResponse in place. A stamp the leg's
    // entry might carry is overwritten below with THIS leg (the immediate source).
    const { inheritedFromLeg: _prior, inheritedAt: _priorAt, ...rest } = e as ChainedContext['chainedFrom'][number];
    candidates.push({ ...rest });
  }
  return { legTaskId: inject.legTaskId, candidates, skipped };
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
      dependenciesChained: chainedContext.pipelineMetadata.completedDependencies, // NOT chainedFrom.length — injected entries are not dependencies
      inheritedPredecessors: chainedContext.pipelineMetadata.inheritedPredecessors,
      allMet: chainedContext.pipelineMetadata.allDependenciesMet,
    },
    'Chained context applied to task'
  );

  return merged ?? patch;
}
