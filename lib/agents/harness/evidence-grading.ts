/**
 * REVIEWER EVIDENCE GRADING — a FACT about the epistemic mode a QA-gate reviewer declared on its
 * own findings, transcribed from the `VERIFIED-AGAINST-EVIDENCE` / `ACCEPTED-FROM-CLAIMS` tokens
 * every domain protocol mandates and, until now, nothing read.
 *
 * WHY (2026-09-20). `approved: true` collapses two different claims: "I recomputed this myself" and
 * "I am trusting the package's word". A reviewer declares which one it means on every finding, in
 * prose, and the platform discarded it — so the distinction was unavailable to any consumer. The
 * motivating instance: a reviewer saw a cross-pipeline import, described it accurately, graded it a
 * non-blocking observation and approved at 92; the harness quality gate escalated and refused to
 * release (ARCHITECTURE.md Invariant 6).
 *
 * Protocol 10: this is a FACT — "the reviewer's response carried N lines bearing token X" — never a
 * judgement about whether the reviewer verified ENOUGH. It has NO CONSUMER by design (no gate
 * conjunct, no `programReleasable` input, no disposition); it ships to generate the data a verdict
 * would have to be earned against. See the soak note at the bottom of this header.
 *
 * ── THREE STATES, NOT TWO ────────────────────────────────────────────────────────────────────────
 * `graded: false` (no token anywhere) is NOT the same as `graded: true, verifiedLines: 0` (the
 * reviewer graded, and verified nothing itself). A two-state fact would bin the first into whichever
 * the parser defaults to — the defect `CHECK-DESIGN-DISCIPLINE.md` §2a documents. Measured
 * 2026-09-20: **68 of 261** reviewer verdicts (26%) emit NEITHER token, i.e. approve with no
 * epistemic claim at all. That bucket is arguably the most dangerous one and it must be visible.
 *
 * ── THE COUNTS ARE LINES, NOT FINDINGS ───────────────────────────────────────────────────────────
 * Named `verifiedLines`/`acceptedLines` on purpose. A grading token is emitted per finding, but a
 * finding may span lines, a line may carry a compound grade, and nothing in the grammar makes a
 * finding machine-delimited. Calling these `verifiedFindings` would be the shared-field-for-
 * discriminating-field trap (execution-facts-discovery, corpus-measure practice): a name asserting a
 * unit the parser cannot observe. A consumer may compare them to each other; it may NOT read either
 * as a count of findings.
 *
 * ── THE BOTH-TOKEN LINE IS EXPOSED, NOT FILTERED ─────────────────────────────────────────────────
 * A line can carry both tokens for two different reasons, and this parser deliberately does not try
 * to tell them apart:
 *   (a) a COMPOUND GRADE on a real finding — `VERIFIED-AGAINST-EVIDENCE (naming) /
 *       ACCEPTED-FROM-CLAIMS (content accuracy)`. Legitimate, and the dominant shape.
 *   (b) a SCHEME RESTATEMENT that grades nothing — `State findings as VERIFIED-AGAINST-EVIDENCE or
 *       ACCEPTED-FROM-CLAIMS`. A false positive.
 * The suspicion was that (b) inflates the both-token population. MEASURED 2026-09-20 over 261 live
 * verdicts: 46 both-token lines across 42 legs; excluding the alternation shape (`X or/vs Y`) moves
 * the corpus from 170/134/111 to 170/132/**109** — i.e. **2 legs in 261, 0.8pp**. The remedy costs
 * more than the defect: a rule excluding both-token lines would discard the 9 compound grades and
 * ~34 prose gradings that make up the rest. So this module COUNTS HONESTLY and reports
 * `bothTokenLines` as its own field, handing the consumer the ambiguity as a fact instead of
 * resolving it with a heuristic. `bothTokenLines` is a SUBSET of both counts above, not a third
 * bucket — the three do not sum.
 *
 * ── PARSER DISCIPLINE (mirrors parse-verdict.ts) ─────────────────────────────────────────────────
 *   - Token-locked: the two literals, case-sensitive as the protocols write them. No synonyms, no
 *     stemming, no inference about what the reviewer "meant".
 *   - Scans the WHOLE finalResponse, NOT `ReviewerVerdict.raw`. Gradings ride on FINDINGS, which
 *     precede the terminal `## VERDICT:` block; scanning from the verdict line onward would read
 *     zero on a correctly-formed reviewer. (Pinned: 'gradings before the verdict block are counted'.)
 *   - PURE — no prisma/logger/`this`; text in, transcription out. Called inside
 *     `buildExecutionResultJson` so dual-path parity is structural, not maintained by discipline.
 *   - NOT a registry net, by this domain's own rule: a value nested on exactly one fact and owning
 *     no `RESULT_JSON_SUMMARY_KEYS` entry stays private to its producer. It nests on
 *     `reviewerVerdict`, which is produced by a synchronous transcription, not by a net.
 *
 * ⚠️ NESTING COST, measured rather than assumed. Riding inside `reviewerVerdict` means this fact is
 * absent whenever the verdict block does not parse. Measured 2026-09-20: of 270 `change_reviewer`
 * executions, 261 carry a `reviewerVerdict`; of the 9 that do not, exactly **1** carries grading
 * tokens. The nesting loses 1 observation in 270 and keeps the fact attached to the verdict it
 * qualifies. Accepted deliberately; re-measure before promoting it to a top-level key.
 *
 * ⚠️ DELIBERATELY UNRENDERED (the §5.1 convention requires a render OR a recorded reason — this is
 * the reason). Rendering the grading rate into the §6 prompt would tell reviewers what the platform
 * is measuring about them, contaminating the baseline this fact exists to establish; rendering it on
 * the lean card puts it in front of SYNTHESIZE, which is a consumer. Observe it during the soak by
 * querying the artifact directly. RE-DECIDE when the reviewer-remit changes land and the denominator
 * stabilises — a fact left unrendered past its reason is the A1/F7 class.
 *
 * @created 2026-09-20
 */

/** The two literals the protocols mandate. Exported so tests can assert the grammar still uses them. */
export const VERIFIED_TOKEN = 'VERIFIED-AGAINST-EVIDENCE';
export const ACCEPTED_TOKEN = 'ACCEPTED-FROM-CLAIMS';

export interface EvidenceGrading {
  /**
   * Did the reviewer emit ANY grading token? `false` is a POSITIVE observation — approved with no
   * epistemic claim at all — and is why this fact has three states rather than two.
   */
  graded: boolean;
  /** LINES bearing VERIFIED-AGAINST-EVIDENCE. A line count. NOT a count of findings. */
  verifiedLines: number;
  /** LINES bearing ACCEPTED-FROM-CLAIMS. A line count. NOT a count of findings. */
  acceptedLines: number;
  /**
   * LINES bearing BOTH tokens — a compound grade or a scheme restatement, indistinguishable by
   * design (see header). Already counted in BOTH fields above; the three do not sum.
   */
  bothTokenLines: number;
  /** Which method produced the counts — self-describing, mirroring markerPresence.parser. */
  parser: 'line-token-scan';
}

/**
 * Transcribe the reviewer's evidence grading from its response text.
 *
 * @param text the reviewer's `finalResponse` (may be null/undefined/empty)
 * @returns the grading fact; `graded: false` with zero counts when no token appears
 */
export function computeEvidenceGrading(text: string | null | undefined): EvidenceGrading {
  let verifiedLines = 0;
  let acceptedLines = 0;
  let bothTokenLines = 0;

  for (const line of (text ?? '').split('\n')) {
    const v = line.includes(VERIFIED_TOKEN);
    const a = line.includes(ACCEPTED_TOKEN);
    if (v) verifiedLines++;
    if (a) acceptedLines++;
    if (v && a) bothTokenLines++;
  }

  return {
    graded: verifiedLines > 0 || acceptedLines > 0,
    verifiedLines,
    acceptedLines,
    bothTokenLines,
    parser: 'line-token-scan',
  };
}
