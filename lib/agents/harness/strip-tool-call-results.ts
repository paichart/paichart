/**
 * F9-s7 (2026-10-31): agent callers never receive a child's RAW tool results through `agent.results`.
 *
 * `perform agent.results` returns a child execution's full `result.json` (and, for a harness, `pipeline-index.json`).
 * Its `toolCalls[].result` / `.error` are the raw text connected services returned — scraped web pages, device output —
 * and R9 (sanitize-chained-output.ts) never screens them on this path: site A covers `services` results only, and the
 * pager stores the envelope, so `read_more` paged raw service text to config-writing reasoners (prod: 24 windows in 16
 * executions; one carried an unredacted device hash, one an R9-neutralized injection in its un-neutralized form).
 *
 * The fix is to OMIT, not to rewrite: an in-place R9 pass over a parsed JSON envelope corrupts it (the F9 panel ruling).
 * Each call keeps the facts a reasoner may legitimately use (which tool, which server, did it succeed, how large, the R9
 * stamps), and loses the payload. A child's deliverable is its `finalResponse`, untouched here; no protocol or role
 * guidance reads a child's raw tool results (role guidance tells agents NOT to load them).
 *
 * Scope: applied only when the call comes from an agent loop (the server-set `callingExecutionId`). A human MCP client
 * reading its own POV's results keeps the full record — that is an operator forensic read, not an LLM input.
 */

/** Keys kept on each tool call. Everything else — notably the service-written `result` and `error` — is dropped.
 *  `arguments` stays: it is the calling agent's OWN input, not service output, and it says what was asked for. */
const KEPT_KEYS = [
  'tool', 'name', 'server', 'arguments', 'success', 'durationMs', 'timestamp', 'turn',
  'resultChars', 'resultTruncatedForLlm', 'sanitized', 'rewritten', 'rewriteClasses',
] as const;

export const TOOL_RESULTS_OMITTED_NOTE =
  'Raw tool results and errors are omitted for agent callers (F9-s7): they are unscreened service output. ' +
  "Read this execution's deliverable (finalResponse); the per-call facts (tool, server, success, size) remain.";

function payloadChars(v: unknown): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'string') return v.length;
  try { return JSON.stringify(v).length; } catch { return 0; }
}

/** Strip one parsed artifact object in place-free fashion. Returns the same reference when there is nothing to strip. */
export function stripToolCallResultsFromRecord<T>(record: T): T {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const rec = record as Record<string, unknown>;
  if (!Array.isArray(rec.toolCalls)) return record;
  const toolCalls = rec.toolCalls.map((call) => {
    if (!call || typeof call !== 'object') return call;
    const c = call as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of KEPT_KEYS) if (k in c) out[k] = c[k];
    if (!('resultChars' in out) && 'result' in c) out.resultChars = payloadChars(c.result);
    if ('error' in c && c.error !== undefined && c.error !== null) out.hadError = true;
    out.resultOmitted = true;
    return out;
  });
  return { ...rec, toolCalls, toolCallResultsOmitted: TOOL_RESULTS_OMITTED_NOTE } as T;
}

/**
 * Strip a JSON artifact's text. Non-JSON or JSON without a `toolCalls` array is returned unchanged (byte-identical),
 * so report.md, error.json and any other artifact pass through.
 */
export function stripToolCallResultsFromJsonText(text: string): { text: string; stripped: boolean } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { text, stripped: false }; }
  const out = stripToolCallResultsFromRecord(parsed);
  if (out === parsed) return { text, stripped: false };
  return { text: JSON.stringify(out, null, 2), stripped: true };
}
