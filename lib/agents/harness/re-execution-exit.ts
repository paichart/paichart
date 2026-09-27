/**
 * Re-execution exit — the validator's view of "this SYNTHESIZE re-executed a child and exited" (RWF A4,
 * 2026-09-26). PURE: reads the persisted tool-call log only.
 *
 * The CORE never uses this: it reads the server-written dispatch rows (harness-dispatch-fact.ts) and hands the
 * validator that list (`dispatchedChildIds`), so live runs and the persist decision agree on one fact. This
 * helper is the FALLBACK for callers with no database — unit tests and replays of archived runs.
 *
 * Two traps it must survive (boundary-contract review, 2026-09-26):
 *  1. A REFUSED `agent.execute` (dependency block, duplicate, cap) is returned as an MCP `isError` result and
 *     the tool loop records it `success: true`. Counting it would grant a sanctioned-exit exemption to a run
 *     that dispatched nothing. So an entry counts only if `success === true` AND the result is not `isError`.
 *     A result truncated at persistence (`{ truncated, preview }`) is checked on its preview text.
 *  2. `taskId` arrives in FIVE accepted shapes: `parameters.taskId` / `parameters.task_id` (object, or
 *     `parameters` as a JSON string), and top-level `taskId` / `task_id`. Parsed, never regex-matched over a
 *     flattened blob — a nested `taskId` inside `overrideConfig` would otherwise match.
 */

export interface ToolCallLike {
  tool?: string;
  success?: boolean;
  arguments?: unknown;
  result?: unknown;
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) ? p : null; } catch { return null; }
  }
  return null;
}

function isErrorResult(result: unknown): boolean {
  const r = asObject(result);
  if (!r) return false;
  if (r.isError === true) return true;
  // Persisted results over the size cap are replaced by { truncated, preview }.
  if (typeof r.preview === 'string' && /"isError"\s*:\s*true/.test(r.preview)) return true;
  return false;
}

/** The `action` and `taskId` of a `perform` call, whichever of the accepted shapes it used. */
export function parsePerformCall(args: unknown): { action: string | null; taskId: string | null } {
  const a = asObject(args);
  if (!a) return { action: null, taskId: null };
  const params = asObject(a.parameters);
  const pick = (o: Record<string, unknown> | null) =>
    o ? (typeof o.taskId === 'string' ? o.taskId : typeof o.task_id === 'string' ? o.task_id : null) : null;
  return {
    action: typeof a.action === 'string' ? a.action : null,
    taskId: pick(params) ?? pick(a),
  };
}

/** Child task ids this run's `agent.execute` calls actually dispatched (refusals excluded), in call order. */
export function extractReExecutedChildIds(toolCallResults: ToolCallLike[] | null | undefined): string[] {
  const ids: string[] = [];
  for (const tc of toolCallResults ?? []) {
    if (tc.success !== true || isErrorResult(tc.result)) continue;
    const { action, taskId } = parsePerformCall(tc.arguments);
    if (action === 'agent.execute' && taskId && !ids.includes(taskId)) ids.push(taskId);
  }
  return ids;
}
