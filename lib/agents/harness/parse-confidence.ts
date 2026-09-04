/**
 * Shared confidence-score parser + objective cap — the SINGLE SOURCE OF TRUTH for turning agent
 * `finalResponse` prose into the numeric `confidenceScore` the harness quality-gate acts on.
 *
 * Both execution paths use these: the engine (`agentExecutionEngine.ts`, reactor-cascade/real pipelines) and
 * the SSE stream route (`app/api/pov/agent/execute/stream/route.ts`, GUI). Previously each had its own inline
 * copy (parse + cap), maintained by mirror-comment — which already drifted once (Bug Class 75 #5: the stream
 * forgot the cap → GUI children kept inflated scores → wrong harness accept/retry decisions). Importing these
 * from one module makes that drift STRUCTURALLY IMPOSSIBLE (the test asserts no inline copy remains).
 *
 * PURE — no engine/prisma/logger/`this` coupling. `parseConfidenceScore` is text→number; `applyConfidenceCap`
 * is (score, counts)→decision and the CALLER logs (so the per-path logger identity stays at the call site).
 *
 * @created 2026-06-09 (A — confidence-parse parity; 5-specialist review)
 */

/** Objective-cap thresholds (do NOT diverge — single source of truth). */
export const CONFIDENCE_CAP_CEILING = 60;
export const CONFIDENCE_CAP_FAIL_RATE_THRESHOLD = 0.5;

/**
 * Parse the agent's self-reported confidence from its response text.
 *
 * LAST-match-wins within a pattern (agents are instructed to END with `Confidence: N/100`; earlier
 * occurrences are typically a SYNTHESIZE quote of an upstream child's score). Patterns are tried in priority
 * order; the first pattern that yields an IN-RANGE match wins. Out-of-range last match → fall through to the
 * next PATTERN (does NOT scan back for an earlier in-range match of the same pattern — preserved exactly).
 *
 * `null` is distinct from `0`: `null` = no score in prose (downstream branches on `!== null`); `0` = an
 * explicit zero score and MUST survive as `0`.
 *
 * @param text the response text (engine `finalResponse` may be `undefined`; stream `generatedText` may be `''`)
 * @returns the parsed 0-100 integer, or `null` if absent/unparseable
 */
export function parseConfidenceScore(text: string | null | undefined): number | null {
  let confidenceScore: number | null = null;
  if (text) {
    const patterns = [
      /confidence[:\s]+score[:\s]*(\d{1,3})\s*(?:\/\s*100|%)?/gi,     // "Confidence Score: 85/100"
      /confidence[:\s]*(\d{1,3})\s*(?:\/\s*100|%)/gi,                  // "Confidence: 85/100" or "confidence: 85%"
      /confidence[:\s]*(\d{1,3})\b/gi,                                  // "Confidence: 85"
      /\*\*confidence\*\*[:\s]*(\d{1,3})/gi,                           // "**Confidence**: 85"
      /confidence\s+(?:level|rating|assessment)[:\s]*(\d{1,3})/gi,     // "Confidence level: 85"
      /(\d{1,3})\s*(?:\/\s*100|%)\s*confidence/gi,                     // "85/100 confidence"
    ];
    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      if (matches.length > 0) {
        // Last-match-wins: the trailing occurrence is the agent's own self-assessment.
        const lastMatch = matches[matches.length - 1];
        const parsed = parseInt(lastMatch[1], 10);
        if (parsed >= 0 && parsed <= 100) {
          confidenceScore = parsed;
          break;
        }
      }
    }
  }
  return confidenceScore;
}

export interface ConfidenceCapResult {
  /** the (possibly capped) score to persist */
  score: number | null;
  /** true iff the objective guard fired (caller logs + uses this to suppress the diagnostic retry) */
  capped: boolean;
  /** the pre-cap score (flows to buildExecutionResultJson as originalConfidence) */
  original: number | null;
}

/**
 * Objective guard: cap confidence to 60 when the tool failure rate exceeds 50% — catches the pathological
 * case where an agent claims high confidence despite evidence of failure. Only caps a score that is
 * currently `> 60` (a score already ≤ 60 is not "capped", so `confidenceCapped` stays false, which the
 * diagnostic-retry guard depends on).
 *
 * Pure: returns the decision; the CALLER performs the `logger.warn` (with its own logger + executionId) when
 * `capped` is true, exactly as the inline code did.
 *
 * @param score          the parsed confidence (may be null)
 * @param toolCallCount  total tool calls this execution (`toolCallResults.length`)
 * @param failedCount    failed tool calls (`toolCallResults.filter(!success).length`)
 */
export function applyConfidenceCap(
  score: number | null,
  toolCallCount: number,
  failedCount: number,
): ConfidenceCapResult {
  if (toolCallCount > 0 && score !== null && score > CONFIDENCE_CAP_CEILING) {
    const toolFailRate = failedCount / toolCallCount;
    if (toolFailRate > CONFIDENCE_CAP_FAIL_RATE_THRESHOLD) {
      return { score: CONFIDENCE_CAP_CEILING, capped: true, original: score };
    }
  }
  return { score, capped: false, original: score };
}

// ── Score-integrity facts (retry-band keep-best, 2026-07-04, reviewed 92%) ──────────────────
//
// parseConfidenceScore (above) resolves by PATTERN PRIORITY, then last-match within the pattern —
// so a response that QUOTES "Confidence Score: 90/100" anywhere and ends "Confidence: 45" records
// 90 while its positionally-final mention is 45 (the Run-2 regression mechanism). These facts make
// that divergence VISIBLE without changing the recorded-score semantics (both paths + the quality
// gate depend on parseConfidenceScore exactly as-is — do NOT touch it).
//
// AR-3 (hard constraint): `recordedIsFinalMention === false` is a CONJUNCTIVE INPUT to the
// keep-best comparison, never a standalone gate — an agent legitimately quoting a child's score
// positionally-last would false-positive a lone check.

export interface ScoreIntegrity {
  /** total in-range score mentions found (all patterns, positional scan) */
  mentions: number;
  /** in-range mention values in positional order */
  values: number[];
  /** max - min across mentions (0 when fewer than 2) — secondary datum, never a gate */
  spread: number;
  /** the positionally-LAST in-range mention, or null when none */
  finalMention: number | null;
  /** false ONLY when a recorded score and a final mention both exist and disagree */
  recordedIsFinalMention: boolean;
}

/** Same pattern set as parseConfidenceScore, scanned POSITIONALLY (index order, not priority). */
const ALL_MENTION_PATTERNS = [
  /confidence[:\s]+score[:\s]*(\d{1,3})\s*(?:\/\s*100|%)?/gi,
  /confidence[:\s]*(\d{1,3})\s*(?:\/\s*100|%)/gi,
  /confidence[:\s]*(\d{1,3})\b/gi,
  /\*\*confidence\*\*[:\s]*(\d{1,3})/gi,
  /confidence\s+(?:level|rating|assessment)[:\s]*(\d{1,3})/gi,
  /(\d{1,3})\s*(?:\/\s*100|%)\s*confidence/gi,
];

export function assessScoreIntegrity(
  text: string | null | undefined,
  recordedScore: number | null | undefined,
): ScoreIntegrity {
  const hits: Array<{ index: number; value: number }> = [];
  if (text) {
    for (const pattern of ALL_MENTION_PATTERNS) {
      for (const m of text.matchAll(pattern)) {
        const v = parseInt(m[1], 10);
        if (v >= 0 && v <= 100 && m.index !== undefined) {
          hits.push({ index: m.index, value: v });
        }
      }
    }
  }
  // Positional order; de-dup same-index hits (overlapping patterns match the same literal).
  hits.sort((a, b) => a.index - b.index);
  const deduped: Array<{ index: number; value: number }> = [];
  for (const h of hits) {
    const prev = deduped[deduped.length - 1];
    if (!prev || h.index !== prev.index) deduped.push(h);
  }
  const values = deduped.map((h) => h.value);
  const finalMention = values.length > 0 ? values[values.length - 1] : null;
  const spread = values.length >= 2 ? Math.max(...values) - Math.min(...values) : 0;
  const recordedIsFinalMention =
    recordedScore == null || finalMention == null ? true : recordedScore === finalMention;
  return { mentions: values.length, values, spread, finalMention, recordedIsFinalMention };
}
