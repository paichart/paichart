/**
 * chained-record — the PURE half of chained-predecessors.ts (no imports), so execution-selection can use it
 * without a circular import. The record's meaning and the reasons are documented in chained-predecessors.ts.
 */

export type NotChainedReason = 'scheduled' | 'skip-chaining' | 'chain-failed' | 'no-deps' | 'nothing-chained';

export type ChainedRecord =
  | { status: 'chained'; ids: Record<string, string> }
  | { status: 'not-chained'; reason: NotChainedReason };

/**
 * Own-edge predecessor ids from a chained inputContext (or a ChainedContext). Null when it carries no
 * `chainedFrom` array at all. `inheritedFromLeg` entries are excluded.
 */
export function projectChainedPredecessors(inputContext: unknown): Record<string, string> | null {
  const cf = (inputContext as { chainedFrom?: unknown } | null | undefined)?.chainedFrom;
  if (!Array.isArray(cf)) return null;
  const ids: Record<string, string> = {};
  for (const e of cf) {
    if (!e || typeof e !== 'object') continue;
    const entry = e as Record<string, unknown>;
    if (entry.inheritedFromLeg) continue;
    if (typeof entry.taskId === 'string' && typeof entry.executionId === 'string') ids[entry.taskId] = entry.executionId;
  }
  return ids;
}

/** The record to STAMP for a chained context: 'chained' when at least one own predecessor was chained. */
export function recordFromChained(chained: unknown): ChainedRecord {
  const ids = projectChainedPredecessors(chained) ?? {};
  return Object.keys(ids).length > 0 ? { status: 'chained', ids } : { status: 'not-chained', reason: 'nothing-chained' };
}

function isRecord(v: unknown): v is ChainedRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (r.status === 'chained' && !!r.ids && typeof r.ids === 'object')
    || (r.status === 'not-chained' && typeof r.reason === 'string');
}

export type RecordSource = 'context' | 'legacy-config' | 'absent';

/** Read an execution's record: the stamped one, else the legacy frozen config, else absent. */
export function readChainedRecord(exec: { context: unknown; config: unknown }): { record: ChainedRecord | null; source: RecordSource } {
  const stamped = (exec.context as Record<string, unknown> | null)?.chainedPredecessors;
  if (isRecord(stamped)) return { record: stamped, source: 'context' };
  const legacy = projectChainedPredecessors((exec.config as Record<string, unknown> | null)?.inputContext);
  if (legacy && Object.keys(legacy).length > 0) return { record: { status: 'chained', ids: legacy }, source: 'legacy-config' };
  return { record: null, source: 'absent' };
}

/**
 * Did two executions receive the same predecessor executions? 'same' only when BOTH records are 'chained' with
 * identical id maps; 'changed' when both are 'chained' and differ; otherwise null (unknown). A not-chained or
 * absent record on either side is unknown, never "same" (independent audit N8).
 */
export function compareRecords(a: ChainedRecord | null, b: ChainedRecord | null): 'same' | 'changed' | null {
  if (a?.status !== 'chained' || b?.status !== 'chained') return null;
  const ka = Object.keys(a.ids).sort(); const kb = Object.keys(b.ids).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return 'changed';
  return ka.every((k) => a.ids[k] === b.ids[k]) ? 'same' : 'changed';
}
