/**
 * #90 diagnostic retry — the 50-69 confidence-band reflection pass, extracted
 * (convergence Phase 3, 2026-07-05).
 *
 * ONE implementation of the bounded single retry both execution paths previously
 * inline-mirrored (~90 lines each in agentExecutionEngine.ts and stream/route.ts):
 * when an execution's confidence lands in the NEEDS-REVISION band [50,69] and no
 * disqualifier holds, re-prompt the agent ONCE (no tools) to reflect on structural
 * gaps, then re-parse the confidence and fold the retry's tokens in.
 *
 * Impure by nature (an LLM call + in-place mutation of messageHistory/totalUsage),
 * so it takes the same shape as runAgenticToolLoop: (input, deps, observers).
 * The two SSE emissions the stream makes (a "reflecting…" log before, the retry
 * text after) are the ONLY path divergence — they become observer hooks; the
 * engine passes none. Log messages are engine-canonical (the stream's slightly
 * shorter variants are absorbed here).
 *
 * Trigger conditions (ALL must hold), verbatim from the engine:
 *   1. confidenceScore parsed AND in [50, 69]
 *   2. NOT confidenceCapped (the objective cap already lowered the score)
 *   3. NOT correctionTurnUsed (the #89 anti-fabrication correction already ran)
 *   4. Agent did NOT self-flag budget exhaustion in the deliverable text
 *      (a same-window retry would hit the same rate-limit wall)
 *
 * Bounded to ONE retry (no tools → no loop re-entry). Non-fatal on empty/throw:
 * the prior response is kept.
 *
 * Gate: scripts/test-diagnostic-retry.ts. Manifest: Part B (M5).
 */

import { addUsage, buildLlmCallOptions, BUDGET_ERROR_PATTERN } from './agentic-tool-loop';
import type { AccumulatedUsage, NormalizedModelConfig } from './agentic-tool-loop';
import { parseConfidenceScore } from './parse-confidence';

// The deliverable-text budget self-flag pattern (distinct from the tool-error
// BUDGET_ERROR_PATTERN — this scans the agent's own prose). Kept verbatim.
const BUDGET_SELF_FLAG_PATTERN =
  /token budget|rate limit|MCP tool calls.*blocked|hourly.*budget.*exhaust|all MCP tools are rate-limited/i;
void BUDGET_ERROR_PATTERN; // (imported to document the sibling; not used here)

interface RetryLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

export interface DiagnosticRetryObservers {
  /** Entering the retry (band matched, not disqualified). Stream emits a
   *  "reflecting…" SSE log_update. Fires BEFORE the retry LLM call. */
  onDiagnosticRetryStart?: (priorConfidence: number) => Promise<void> | void;
  /** The retry produced non-empty text. Stream emits it as an SSE text_chunk.
   *  Fires AFTER token fold, BEFORE the confidence re-parse (matches the former
   *  inline order). */
  onDiagnosticRetryComplete?: (retryText: string) => Promise<void> | void;
  /** Retry declined because the agent self-flagged budget exhaustion. */
  onDiagnosticRetryDeclined?: (reason: string) => Promise<void> | void;
}

export interface DiagnosticRetryInput {
  confidenceScore: number | null;
  confidenceCapped: boolean;
  correctionTurnUsed: boolean;
  /** The deliverable text (last-turn, post-Phase-2). Scanned for the budget
   *  self-flag and embedded in the diagnostic prompt. */
  text: string;
  /** The final LLM response — its rawContentBlocks/text are pushed as the
   *  assistant turn before the diagnostic user prompt. */
  currentResponse: any;
  /** Mutated in place: the assistant turn + diagnostic user prompt are pushed. */
  messageHistory: any[];
  /** Mutated in place: the retry's usage is folded in via addUsage. */
  totalUsage: AccumulatedUsage;
  /** The agent's base user prompt, passed to the retry generateText call. */
  prompt: string;
  normalizedLlmConfig: NormalizedModelConfig;
  executionId: string;
  userId: string | undefined;
}

export interface DiagnosticRetryDeps {
  generateText: (prompt: string, options: any, userId?: string) => Promise<any>;
  logger: RetryLogger;
}

export interface DiagnosticRetryResult {
  diagnosticRetryUsed: boolean;
  /** Updated deliverable text (retry output) or unchanged. */
  text: string;
  /** Updated response (retry) or unchanged. */
  currentResponse: any;
  /** Re-parsed confidence (retry) or unchanged. */
  confidenceScore: number | null;
}

export async function runDiagnosticRetry(
  input: DiagnosticRetryInput,
  deps: DiagnosticRetryDeps,
  observers: DiagnosticRetryObservers = {},
): Promise<DiagnosticRetryResult> {
  const {
    confidenceCapped, correctionTurnUsed, text, messageHistory,
    totalUsage, prompt, normalizedLlmConfig, executionId, userId,
  } = input;
  const { generateText, logger } = deps;

  // Working copies of the mutable outputs (return unchanged if no retry).
  let currentResponse = input.currentResponse;
  let confidenceScore = input.confidenceScore;
  let diagnosticRetryUsed = false;

  const isInDiagnosticBand = confidenceScore !== null && confidenceScore >= 50 && confidenceScore <= 69;
  const agentSelfFlaggedBudget = !!text && BUDGET_SELF_FLAG_PATTERN.test(text.slice(0, 1500));

  if (isInDiagnosticBand && !confidenceCapped && !correctionTurnUsed && !agentSelfFlaggedBudget) {
    try {
      const priorConfidence = confidenceScore as number;
      const diagnosticPrompt =
        `**Diagnostic retry — your prior response scored ${priorConfidence}/100 (NEEDS REVISION band).**\n\n` +
        `Per the calibrated five-band rubric, scores in the 50-69 band indicate structural gaps. Common causes:\n` +
        `- Unanchored claims (assertions without verifiable detail from your tool results or chained context)\n` +
        `- Conflated findings (two unrelated lessons folded into one paragraph)\n` +
        `- Missing data integration (source data not woven into the deliverable)\n` +
        `- Generic framing where the available data supported specifics\n\n` +
        `**Your prior response is shown below. Review it against the source data already in your context.**\n\n` +
        `${text}\n\n` +
        `**Action**: produce ONE improved response that addresses the gaps you can identify. ` +
        `If the prior response was as good as the data allows (e.g., source material genuinely thin, ` +
        `key dependency unavailable), say so explicitly and keep the same score — honesty is the goal, ` +
        `not score inflation. If you can substantively improve, do so and re-score the improved response.\n\n` +
        `**Constraints:**\n` +
        `- Do not call any tools — none are available on this turn.\n` +
        `- End with an updated confidence score in the format "Confidence: N/100".\n` +
        `- A score still in the 50-69 band is acceptable if it reflects reality — the diagnostic retry exists to give the agent a structured second pass, not to push the score artificially.`;

      messageHistory.push({ role: 'assistant', content: currentResponse.rawContentBlocks ?? currentResponse.text });
      messageHistory.push({ role: 'user', content: [{ type: 'text', text: diagnosticPrompt }] });

      logger.info({ executionId, priorConfidence },
        'Diagnostic retry: prior response in 50-69 band, requesting reflection');

      if (observers.onDiagnosticRetryStart) {
        await observers.onDiagnosticRetryStart(priorConfidence);
      }

      // I-1 (streaming-accumulate review, Change 1b): the execution watchdog timer was
      // cleared in the loop's finally, so the caller's signal here is an UNARMED guard —
      // and under streaming there is no implicit SDK end-to-end timeout. Arm a fresh
      // bounded controller or a mid-stream stall hangs this execution indefinitely.
      // 600s matches the SDK's former non-streaming bound.
      const diagAbort = new AbortController();
      const diagTimer = setTimeout(() => diagAbort.abort(), 600_000);
      const retryStartTime = Date.now();
      let retryResponse: any;
      try {
        retryResponse = await generateText(prompt, buildLlmCallOptions(normalizedLlmConfig, 'reflection', {
          signal: diagAbort.signal,
          messages: messageHistory as any,
        }), userId);
      } finally {
        clearTimeout(diagTimer);
      }
      const retryDurationMs = Date.now() - retryStartTime;

      if (retryResponse?.text && retryResponse.text.trim().length > 0) {
        // Accumulate retry tokens to totalUsage (same pattern as correction turn)
        addUsage(totalUsage, retryResponse.usage);
        const retryText: string = retryResponse.text;

        if (observers.onDiagnosticRetryComplete) {
          await observers.onDiagnosticRetryComplete(retryText);
        }

        // Replace deliverable text + response with the retry output
        currentResponse = retryResponse;
        // Re-parse confidence via the shared parser (last-match-wins).
        const retryConfidence: number | null = parseConfidenceScore(retryText);
        if (retryConfidence !== null) {
          confidenceScore = retryConfidence;
        }
        diagnosticRetryUsed = true;

        // Large-negative-delta alert: a retry that LOWERS the score by >20 points means
        // the first response was severely overconfident — forensic signal worth elevating
        // from info → warn.
        const confDelta = confidenceScore !== null && priorConfidence !== null ? confidenceScore - priorConfidence : null;
        const isOverconfidentDrop = confDelta !== null && confDelta <= -20;
        const logFn = isOverconfidentDrop ? logger.warn.bind(logger) : logger.info.bind(logger);
        logFn({
          executionId,
          priorConfidence,
          retryConfidence: confidenceScore,
          confidenceDelta: confDelta,
          overconfidentFirstResponse: isOverconfidentDrop,
          retryDurationMs,
          retryInputTokens: retryResponse.usage?.inputTokens,
          retryOutputTokens: retryResponse.usage?.outputTokens,
        }, isOverconfidentDrop
          ? 'Diagnostic retry: completed — LARGE NEGATIVE DELTA (first response was severely overconfident; agent reflected and dropped >20 points). Investigate prior response for inflated claims, missing data, or fabrication patterns.'
          : 'Diagnostic retry: completed');

        return { diagnosticRetryUsed, text: retryText, currentResponse, confidenceScore };
      } else {
        logger.warn({ executionId, retryDurationMs },
          'Diagnostic retry returned empty — keeping prior response');
      }
    } catch (retryErr) {
      // Non-fatal: keep prior response, log for forensics
      logger.warn({ err: retryErr, executionId },
        'Diagnostic retry failed — keeping prior response');
    }
  } else if (isInDiagnosticBand && agentSelfFlaggedBudget) {
    // Forensic visibility: log when we DECLINE to retry due to budget exhaustion.
    // Same-window retry would hit the same wall — manual-after-window-reset is the
    // documented mitigation (HOWTO troubleshooting row 2026-04-28).
    logger.info({ executionId, confidenceScore, reason: 'budget_exhaustion_detected' },
      'Diagnostic retry skipped: agent self-flagged budget exhaustion in deliverable text');
    if (observers.onDiagnosticRetryDeclined) {
      await observers.onDiagnosticRetryDeclined('budget_exhaustion_detected');
    }
  }

  return { diagnosticRetryUsed, text, currentResponse, confidenceScore };
}
