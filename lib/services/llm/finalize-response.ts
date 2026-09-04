/**
 * Finalize an agent's response text for a TERMINAL stop condition — the SINGLE source both the
 * non-stream engine (agentExecutionEngine) and the stream route (app/api/pov/agent/execute/stream)
 * use, so their stored `finalResponse` / report.md can never diverge on max-turns, max_tokens, or
 * refusal. Before this, only the engine handled max_tokens + refusal; the stream handled only
 * max-turns, so a STREAMED truncation/refusal silently lost the user-facing message (and a pre-output
 * refusal tripped the empty-content degraded-flag instead of reading as a refusal). SDK Phase 2,
 * engine↔stream parity (2026-06-20).
 *
 * Pure + dependency-free (CI-safe). Returns the final text AND the note that was appended (if any),
 * so the stream path can ALSO emit the note as a live SSE chunk; the engine just uses `finalText`.
 */
export interface FinalizedText {
  finalText: string;
  /** The note/message appended for this stop condition, or null when the text is unchanged. */
  appendedNote: string | null;
}

const MAX_TURNS_NOTE = '\n\n> **Note**: Agent reached the maximum tool call limit and was stopped.';
const MAX_TOKENS_NOTE = '\n\n> **Note**: Response was truncated due to token limit.';
const REFUSAL_MESSAGE = 'The model declined to process this request.';

export function finalizeTextForStopReason(
  stopReason: string | null | undefined,
  text: string | null | undefined,
  opts: { hitMaxTurns: boolean }
): FinalizedText {
  const base = text || '';

  // Order mirrors agentExecutionEngine.ts:838-852 exactly (hitMaxTurns first — it's a tool_use
  // stop AT the cap, not a distinct API stop_reason).
  if (opts.hitMaxTurns) {
    return { finalText: base + MAX_TURNS_NOTE, appendedNote: MAX_TURNS_NOTE };
  }
  if (stopReason === 'max_tokens') {
    return { finalText: base + MAX_TOKENS_NOTE, appendedNote: MAX_TOKENS_NOTE };
  }
  if (stopReason === 'refusal') {
    // Pre-output refusal (no text) → the generic message (also keeps it out of the empty-content
    // degraded path). Mid-stream refusal (partial text) → keep what was produced, like the engine
    // (`finalResponse = text || message`).
    if (base.trim().length === 0) {
      return { finalText: REFUSAL_MESSAGE, appendedNote: REFUSAL_MESSAGE };
    }
    return { finalText: base, appendedNote: null };
  }
  return { finalText: base, appendedNote: null };
}
