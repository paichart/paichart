/**
 * Authoritative-execution selection — the ONE rule every consumer that needs
 * "the execution whose output speaks for a task" must use.
 *
 * Born from the retry-band keep-best design (2026-07-04, Protocol 2: 3 domain
 * analyses + arch synthesis on Opus + database-manager gate — see
 * cline_docs/reviews/retry-band-keep-best-2026-07-04/). Before this module,
 * FOUR independent selection implementations across 8 sites used THREE
 * different ordering keys and THREE status filters (boundary-contract BC-4) —
 * the BC75 drift class. The coverage test
 * (scripts/test-execution-selection-coverage.ts) fails the build on any new
 * hand-rolled authoritative selection.
 *
 * TWO rules live here, deliberately separate (arch Adj #3):
 *  1. Supersession filter (`supersededById IS NULL`) — the keep-best VERDICT's
 *     read side. Retry-only by construction: only an orchestrator retry ever
 *     self-marks (gated on context.reExecutionOfExecutionId at the terminal
 *     tx), so human re-runs are never filtered — latest-wins structurally.
 *  2. The R8 empty-deliverable floor (`requireNonEmptyArtifact`) — a
 *     fact-shaped floor (verifiable emptiness), applied UNIFORMLY: an
 *     execution with an empty finalResponse is never selectable regardless of
 *     who triggered it. Stopgap until R8's root fix makes such rows FAILED
 *     upstream (engine-runtime follow-ups / streaming-accumulate R8).
 *
 * Ordering: `createdAt DESC, id DESC` — the ONLY sanctioned key. NOT nullable
 * `startTime` (Postgres DESC = NULLS FIRST → queued rows would lead, BC-7) and
 * NOT artifact createdAt (the C4 third-axis divergence). Backed by the partial
 * index idx_agent_executions_authoritative_per_task (ops script
 * scripts/create-authoritative-execution-index.sh).
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../logger';
import { assessScoreIntegrity } from '../agents/harness/parse-confidence';

const log = logger.child({ module: 'ExecutionSelection' });

type SelectionClient = PrismaClient | Prisma.TransactionClient;

export interface SelectedExecution {
  id: string;
  status: string;
  createdAt: Date;
  supersededById: string | null;
}

export interface SelectionResult {
  /** The authoritative execution, or null when nothing passes (callers keep
   *  today's miss behavior — chainer-style skip-with-warn; NO resurrection). */
  execution: SelectedExecution | null;
  /** Executions that were considered and skipped, with the fact that skipped them. */
  skipped: Array<{ id: string; reason: 'superseded' | 'empty-artifact' }>;
}

export interface SelectionOptions {
  /** Uniform R8 fact-floor: skip SUCCESS rows whose result.json finalResponse
   *  is empty. Costs one artifact read per candidate — only enable where the
   *  caller would read the artifact anyway (chainer, report-md extraction). */
  requireNonEmptyArtifact?: boolean;
}

/**
 * Select the authoritative SUCCESS execution for a task.
 *
 * Semantics: newest non-superseded SUCCESS (createdAt DESC, id DESC). With
 * `requireNonEmptyArtifact`, candidates whose result.json has an empty
 * finalResponse are skipped (loud, recorded in `skipped`) and the next
 * candidate is considered.
 */
export async function selectAuthoritativeExecution(
  client: SelectionClient,
  taskId: string,
  opts: SelectionOptions = {}
): Promise<SelectionResult> {
  const skipped: SelectionResult['skipped'] = [];

  const candidates = await client.agentExecution.findMany({
    where: { taskId, status: 'SUCCESS', supersededById: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, status: true, createdAt: true, supersededById: true },
    // Bounded: retention caps keep per-task rows in single digits; take:10 covers the in-tx
    // prune budget (keep-10 SUCCESS) — the daily RM settle (keep-4) only trims further, never higher.
    take: 10,
  });

  if (!opts.requireNonEmptyArtifact) {
    return { execution: candidates[0] ?? null, skipped };
  }

  for (const candidate of candidates) {
    const artifact = await client.agentArtifact.findFirst({
      where: { executionId: candidate.id, name: { in: ['result.json', 'pipeline-index.json'] } },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });
    let empty = true;
    if (artifact?.content) {
      try {
        const parsed = JSON.parse(artifact.content);
        empty = !(typeof parsed?.finalResponse === 'string' && parsed.finalResponse.trim().length > 0);
      } catch {
        empty = true; // unparseable artifact = not selectable content
      }
    }
    if (empty) {
      skipped.push({ id: candidate.id, reason: 'empty-artifact' });
      log.warn({ taskId, executionId: candidate.id },
        'execution-selection: skipping SUCCESS execution with empty/unreadable finalResponse (R8 fact-floor)');
      continue;
    }
    return { execution: candidate, skipped };
  }

  if (skipped.length > 0) {
    log.warn({ taskId, skippedCount: skipped.length },
      'execution-selection: no selectable execution — all SUCCESS candidates skipped');
  }
  return { execution: null, skipped };
}

// ── Keep-best judgment (synchronous self-supersession — arch Adj #1) ─────────────────────────
//
// Called at TERMINAL PERSIST by both execution paths, ONLY when the completing execution
// carries context.reExecutionOfExecutionId (an orchestrator retry — the gate). Compares the
// completing run's keepBestFacts against its target's and returns whether the completing run
// must mark ITSELF superseded (it lost). Conjunctive catastrophic rule ONLY (reviewed spec §3
// item 4 + AR-3): a lone score-contradiction never trips it.

/**
 * The comparison facts. **This type deliberately carries NO confidence number, and adding one would be
 * a regression** — read this before extending it.
 *
 * The obvious way to "make retry selection smarter" is to compare `confidenceScore`: it is already in
 * `result.json`, it is a number, and it looks like a quality proxy. It is not one. A controlled
 * calibration study ran two reviews of byte-identical defective input and got **45** and **92**, and
 * five of seven approvals across the corpus sit at exactly 92 — the score carries verdict DIRECTION,
 * not correctness. It was demoted to a recorded fact at every tier, and no gate anywhere in the system
 * consumes it. Ranking retries by it would re-import it through the back door, in the one place nobody
 * would think to look for a gate.
 *
 * `scoreIntegrity` is NOT a counter-example. It is a **provenance** boolean — did the recorded number
 * match what the agent last said — and Arm 2 uses it only as a directional integrity asymmetry, never
 * as a quality signal (see AR-3 note there).
 *
 * The exclusion is enforced structurally rather than by a test: `judgeCatastrophicDegradation` cannot
 * see a score because this interface does not carry one, so a test asserting it could not fail. Adding
 * a field is therefore the ONLY way the invariant breaks, which is why the guard lives here.
 *
 * Background: `cline_docs/learning/11-when-a-judgment-may-be-believed.md` §4 and §7.
 */
export interface KeepBestFacts {
  deliverableChars: number;
  fencedBlockCount: number;
  scoreIntegrity: { recordedIsFinalMention: boolean };
  /** True when this run was recorded TRUNCATED_NO_OUTPUT (max_tokens, empty deliverable — R2). */
  truncatedNoOutput: boolean;
}

/** Extract comparison facts from a parsed result.json — uses persisted keepBestFacts when
 *  present (post-2026-07-04 rows), else derives from finalResponse/confidenceScore so
 *  historical targets stay comparable. */
export function extractKeepBestFacts(resultJson: any): KeepBestFacts | null {
  if (!resultJson || typeof resultJson !== 'object') return null;
  // R2 fact: was this run truncated with no deliverable? errorCategory is spread to the top level
  // of result.json AND nested under executionDegradation — read either.
  const truncatedNoOutput =
    resultJson.errorCategory === 'TRUNCATED_NO_OUTPUT' ||
    resultJson.executionDegradation?.errorCategory === 'TRUNCATED_NO_OUTPUT';
  if (resultJson.keepBestFacts && typeof resultJson.keepBestFacts === 'object') {
    const k = resultJson.keepBestFacts;
    return {
      deliverableChars: typeof k.deliverableChars === 'number' ? k.deliverableChars : 0,
      fencedBlockCount: typeof k.fencedBlockCount === 'number' ? k.fencedBlockCount : 0,
      scoreIntegrity: { recordedIsFinalMention: k.scoreIntegrity?.recordedIsFinalMention !== false },
      truncatedNoOutput,
    };
  }
  const text: string = typeof resultJson.finalResponse === 'string' ? resultJson.finalResponse : '';
  const recorded = typeof resultJson.confidenceScore === 'number' ? resultJson.confidenceScore : null;
  return {
    deliverableChars: text.length,
    fencedBlockCount: Math.floor((text.match(/```/g) || []).length / 2),
    scoreIntegrity: { recordedIsFinalMention: assessScoreIntegrity(text, recorded).recordedIsFinalMention },
    truncatedNoOutput,
  };
}

export interface KeepBestJudgment {
  superseded: boolean;
  /** fact-shaped reasons, persisted into the loser's result.json.supersession for audit */
  reasons: string[];
}

export function judgeCatastrophicDegradation(
  current: KeepBestFacts,
  target: KeepBestFacts,
): KeepBestJudgment {
  const reasons: string[] = [];

  // Arm 1 (structural collapse, conjunctive): deliverable shrank below 30% of the target
  // AND fenced blocks collapsed to zero from a target that had ≥3.
  const ratio = target.deliverableChars > 0 ? current.deliverableChars / target.deliverableChars : 1;
  const structuralCollapse =
    ratio < 0.3 && current.fencedBlockCount === 0 && target.fencedBlockCount >= 3;
  if (structuralCollapse) {
    reasons.push(
      `structural-collapse: deliverableChars ${current.deliverableChars}/${target.deliverableChars} (ratio ${ratio.toFixed(2)} < 0.3) AND fencedBlockCount 0 (target ${target.fencedBlockCount} >= 3)`
    );
  }

  // Arm 2 (score-contradiction asymmetry): the retry's recorded score is NOT its final
  // mention while the target's IS — the Run-2 quote-spoof shape. Never fires alone as a
  // generic quality signal (AR-3): it is a specific, directional integrity asymmetry.
  const scoreAsymmetry =
    !current.scoreIntegrity.recordedIsFinalMention && target.scoreIntegrity.recordedIsFinalMention;
  if (scoreAsymmetry) {
    reasons.push('score-contradiction-asymmetry: retry recorded score != its final mention while target is consistent');
  }

  // Arm 3 (truncation regression, truncation-stall R3): the retry truncated at max_tokens with no
  // deliverable (TRUNCATED_NO_OUTPUT) while the target was NOT truncated — the retry is a strictly
  // worse outcome and must never win. Independent of the char-ratio arm (Arm 1 requires the target
  // to carry ≥3 fenced blocks, which a good prose deliverable may not); the truncation fact is the
  // authoritative signal that the retry produced nothing. The finalize note gives a truncated retry
  // ~56 deliverableChars, so char-ratio alone would miss a low-fence target.
  const truncationRegression = current.truncatedNoOutput && !target.truncatedNoOutput;
  if (truncationRegression) {
    reasons.push('truncation-regression: retry recorded TRUNCATED_NO_OUTPUT (empty deliverable at max_tokens) while its target was not truncated');
  }

  return { superseded: structuralCollapse || scoreAsymmetry || truncationRegression, reasons };
}

/** Audit block persisted into the LOSER's own result.json.supersession (AR-5: auditable). */
export interface SelfSupersessionResult {
  supersededById: string;
  audit: Record<string, unknown>;
}

/**
 * Terminal-persist self-supersession (arch Adj #1, INFO-1): call from BOTH execution paths
 * right after result.json is built, BEFORE artifacts are written / status is updated.
 * Returns null unless this execution is a stamped orchestrator retry (context.
 * reExecutionOfExecutionId) whose facts show catastrophic degradation vs its target.
 * Pre-tx read is sanctioned (READ COMMITTED; the target is terminal and immutable).
 * NON-FATAL by contract: callers wrap in try/catch — a failed comparison degrades to
 * latest-wins (no worse than pre-feature).
 */
export async function computeSelfSupersession(
  client: SelectionClient,
  executionContext: unknown,
  ownResultJson: Record<string, unknown>,
): Promise<SelfSupersessionResult | null> {
  const targetId = (executionContext as { reExecutionOfExecutionId?: unknown } | null | undefined)
    ?.reExecutionOfExecutionId;
  if (typeof targetId !== 'string' || targetId.length === 0) return null;

  const targetArtifact = await client.agentArtifact.findFirst({
    where: { executionId: targetId, name: { in: ['result.json', 'pipeline-index.json'] } },
    orderBy: { createdAt: 'desc' },
    select: { content: true },
  });
  if (!targetArtifact?.content) {
    log.warn({ targetId }, 'keep-best: retry target has no readable result artifact — degrading to latest-wins (AR-4)');
    return null;
  }
  let targetJson: any;
  try { targetJson = JSON.parse(targetArtifact.content); } catch {
    log.warn({ targetId }, 'keep-best: retry target artifact unparseable — degrading to latest-wins');
    return null;
  }
  const targetFacts = extractKeepBestFacts(targetJson);
  const ownFacts = extractKeepBestFacts(ownResultJson);
  if (!targetFacts || !ownFacts) return null;

  const judgment = judgeCatastrophicDegradation(ownFacts, targetFacts);
  if (!judgment.superseded) return null;

  log.warn(
    { supersededById: targetId, reasons: judgment.reasons, ownFacts, targetFacts },
    'keep-best-suppression: retry catastrophically degraded vs its target — self-marking superseded'
  );
  return {
    supersededById: targetId,
    audit: {
      supersededById: targetId,
      judgedAt: new Date().toISOString(),
      reasons: judgment.reasons,
      current: ownFacts,
      target: targetFacts,
    },
  };
}
