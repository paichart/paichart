/**
 * Quality-gate verdict-mismatch guard — the DETERMINISTIC reconciliation layer between the
 * SYNTHESIZE LLM's stamped `metadata.qualityGate.outcome` and the reviewer's own transcribed
 * terminal verdict (`result.json.reviewerVerdict`, parse-verdict.ts).
 *
 * Why: the 2026-07-14 incident (cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/)
 * showed SYNTHESIZE — an LLM reading the reviewer's response through head-slice truncation caps —
 * can stamp an outcome that contradicts the reviewer's actual terminal verdict. Prompt rules alone
 * are the same substrate that failed, so this guard compares the stamped outcome against the parsed
 * FACT at the single chokepoint where the stamp lands (task.update metadata merge).
 *
 * Phase 1 semantics: FLAG, never override. On contradiction it annotates the incoming qualityGate
 * with `verdictMismatch: true` + the transcribed reviewer verdict and logs loud. The platform does
 * not overrule the orchestrator (its rule also gates on confidence ≥85 / escalation) — it makes the
 * disagreement visible and generates the outcome data that earns deterministic consumption (Phase 2,
 * Protocol 10 "ship the fact → it generates the data").
 *
 * Failure isolation: NEVER throws — a guard failure must not block a harness completing. Errors are
 * logged and the stamp proceeds unannotated.
 */

import { parseReviewerVerdict, REVIEWER_ROLES, type ReviewerVerdict } from './parse-verdict';

// Method-shorthand signatures (bivariant) so the real PrismaClient is directly assignable.
type PrismaLike = {
  // `type` is OPTIONAL so existing mocks/callers stay structurally valid; it is the deterministic
  // program-tier signal (a PIPELINE sibling ⇒ this stage is a program's — F-T6-2, 2026-07-17).
  task: { findMany(args: any): Promise<Array<{ id: string; type?: string | null }>> };
  agentArtifact: { findMany(args: any): Promise<Array<{ content: string }>> };
};

type LoggerLike = {
  warn: (data: Record<string, unknown>, msg: string) => void;
  error: (data: Record<string, unknown>, msg: string) => void;
  // OPTIONAL (existing callers pass pino, which has it; mocks need not): the benign program-tier
  // divergence is expected behavior, so it must NOT be logged at warn — that would just relocate the
  // false positive into the log stream the quarterly tally reads.
  info?: (data: Record<string, unknown>, msg: string) => void;
};

/**
 * Inspect an incoming task.update metadata merge for a PIPELINE task. When it stamps
 * `qualityGate.outcome` (approved/needs-revision) and the stage's reviewer child carries a
 * transcribed terminal verdict that CONTRADICTS it, annotate the merge in place.
 *
 * @param prisma        prisma client (read-only queries)
 * @param taskId        the PIPELINE (harness) task being updated
 * @param taskType      the task's type (guard is PIPELINE-only)
 * @param existingMetadata the task's current metadata (source of pipelineStageId)
 * @param pendingMerge  the incoming metadata merge object — MUTATED in place on mismatch
 * @param logger        pino-style logger
 */
export async function annotateQualityGateVerdictMismatch(
  prisma: PrismaLike,
  taskId: string,
  taskType: string | null | undefined,
  existingMetadata: Record<string, unknown> | null | undefined,
  pendingMerge: Record<string, unknown>,
  logger: LoggerLike,
): Promise<void> {
  try {
    if (taskType !== 'PIPELINE') return;
    const qualityGate = pendingMerge?.qualityGate as Record<string, unknown> | undefined;
    if (!qualityGate) return;
    const outcome = qualityGate.outcome;
    // 'escalated' is an orchestrator-level call (child confidence < 50) with no reviewer
    // counterpart — only approved/needs-revision are comparable to the reviewer's verdict.
    if (outcome !== 'approved' && outcome !== 'needs-revision') return;

    const stageId =
      (pendingMerge?.pipelineStageId as string | undefined) ??
      (existingMetadata?.pipelineStageId as string | undefined);
    if (!stageId || typeof stageId !== 'string') return;

    // Sibling child tasks in the same pipeline stage (the harness's children).
    // F21 (2026-07-16): filter by the stageId COLUMN — children live in the child stage via
    // task.stageId (the same axis harnessModeResolver:128 and the retrigger reactor use);
    // `metadata.pipelineStageId` is the PARENT harness's key and exists on no child, so the
    // original metadata-path filter matched [] always and the guard was dead since ship
    // (T5 finding, PROGRAM-TEST-PLAN.md 2026-07-16). At program level this now resolves
    // exactly Node C (the only REVIEWER_ROLES child in the program stage).
    const siblings = await prisma.task.findMany({
      where: {
        id: { not: taskId },
        stageId: stageId,
      },
      select: { id: true, type: true },
    });
    if (siblings.length === 0) return;

    // TIER DETECTION (T6 finding F-T6-2, 2026-07-17) — deterministic, from the sibling TYPES we
    // already fetched; never from an LLM-stamped marker.
    //
    // A PROGRAM's stage contains child PIPELINE legs; a plain pipeline's stage contains only ACTION
    // children. That distinction decides whether this guard's core premise even holds:
    //   - PIPELINE tier: the protocol says "the outcome is derived from the reviewer's terminal
    //     ## VERDICT: block" (seed-protocol-prompts.ts:1204) ⇒ any disagreement IS a misread. This
    //     is the 2026-07-14 incident class the guard was built for.
    //     EXCEPTION (orchestrator 3.9.2, A6): a reviewer-LESS pipeline has no reviewerVerdict —
    //     its `approved` is fact-derived (children terminal + non-FAILED, no anti-fabrication
    //     degradation), not verdict-derived, stamped reviewerPresent:false. `verdict === null`
    //     already makes this guard silent for that case; that silence is CORRECT — never "harden"
    //     it into a mismatch. Any future Phase-2 deterministic reviewerVerdict consumption MUST
    //     gate on reviewer-present (a naive outcome=verdict.approved would misfire on every
    //     reviewer-less pipeline).
    //   - PROGRAM tier: the protocol defines the outcome as an AND — every leg approved AND no
    //     derivationContainment violation AND Node C approved AND coverage complete (:2492-2500;
    //     score thresholds removed in pov-program 1.0.10 — confidence numbers are recorded facts,
    //     not gate inputs, per the 2026-07-18 calibration study). Node C is
    //     ONE CONJUNCT, not the determinant. So `needs-revision` over an APPROVED Node C is the
    //     DESIGNED behavior whenever a leg blocks — not a contradiction.
    // Live proof (T6 run 1, program cmro29d65000dyx2a0ynjltvh): Node C approved (cross-leg
    // conformance was genuinely exact) while a leg escalated on a blocked harvest. Both were RIGHT;
    // the guard compared unlike things and flagged a false positive. Left unfixed, EVERY program
    // where a leg blocks but integration conforms would pollute the mismatch count that the
    // CLAUDE.md quarterly Phase-2 decision is tallied from.
    const isProgramTier = siblings.some((s) => s.type === 'PIPELINE');

    // Newest-first authoritative result.json artifacts across the children; the reviewer child is
    // identified by result.json.agentRole (there is no role column on agent_executions).
    const artifacts = await prisma.agentArtifact.findMany({
      where: {
        name: 'result.json',
        execution: {
          taskId: { in: siblings.map((s) => s.id) },
          supersededById: null,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
      take: 20,
    });

    let verdict: ReviewerVerdict | null = null;
    for (const artifact of artifacts) {
      try {
        const parsed = JSON.parse(artifact.content) as Record<string, unknown>;
        if (typeof parsed.agentRole !== 'string' || !REVIEWER_ROLES.has(parsed.agentRole)) continue;
        // Prefer the emitted transcription; fall back to parsing finalResponse for pre-fix runs.
        const emitted = parsed.reviewerVerdict as ReviewerVerdict | undefined;
        verdict =
          emitted && typeof emitted.approved === 'boolean'
            ? emitted
            : parseReviewerVerdict(typeof parsed.finalResponse === 'string' ? parsed.finalResponse : null);
        break; // newest reviewer result.json is authoritative — stop at the first
      } catch {
        continue; // not valid JSON — skip
      }
    }
    if (!verdict) return; // no transcribable reviewer verdict → nothing to reconcile (never fabricate)

    const stampedApproved = outcome === 'approved';
    if (verdict.approved === stampedApproved) return; // agreement → no annotation (facts only)

    // DIRECTION-AWARE at the program tier (F-T6-2). The disagreement is asymmetric:
    //   - stamped `approved` + reviewer REJECTED → a REAL contradiction at EVERY tier: Node C's
    //     approval is a NECESSARY conjunct of the program AND, so `approved` cannot outrank a
    //     rejecting reviewer. Program SYNTHESIZE is an LLM reading through the same substrate the
    //     guard exists to distrust — keep catching this.
    //   - stamped `needs-revision` + reviewer APPROVED → EXPECTED at the program tier: some OTHER
    //     conjunct (a leg's outcome/score, coverage) legitimately blocked. Not a misread.
    // So at the program tier we suppress only the VERDICT in the benign direction — while still
    // annotating `reviewerVerdict`, which is a pure FACT (Protocol 10) and is exactly the audit
    // trail T6.6 used to verify "Node C's APPROVED did not override the block". Keep the fact; drop
    // only the unearned verdict. (A program-wide exemption would be WRONG — it would blind the
    // approved+REJECTED direction, which is the dangerous one.)
    const benignProgramDivergence = isProgramTier && !stampedApproved && verdict.approved;

    qualityGate.reviewerVerdict = { approved: verdict.approved, blocking: verdict.blocking };
    // `tier` rides alongside the flag so a consumer (and the quarterly tally) can tell WHICH
    // comparison frame produced it, instead of inferring it — the field that would have made this
    // whole class self-evident.
    qualityGate.verdictMismatchTier = isProgramTier ? 'program' : 'pipeline';
    if (benignProgramDivergence) {
      logger.info?.(
        { taskId, outcome, reviewerApproved: verdict.approved, tier: 'program' },
        'Program outcome diverges from an APPROVED integration reviewer — expected (the outcome is an AND; the reviewer is one conjunct). Fact annotated, no mismatch flagged.',
      );
      return;
    }

    qualityGate.verdictMismatch = true;
    logger.warn(
      {
        taskId,
        stageId,
        stampedOutcome: outcome,
        reviewerApproved: verdict.approved,
        reviewerBlocking: verdict.blocking,
      },
      'PIPELINE qualityGate verdict-mismatch: SYNTHESIZE stamped an outcome contradicting the reviewer terminal verdict — annotated, not overridden (Phase 1)',
    );
  } catch (error) {
    logger.error(
      { taskId, error: error instanceof Error ? error.message : String(error) },
      'verdict-mismatch guard failed — qualityGate stamp proceeds unannotated',
    );
  }
}
