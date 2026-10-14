/**
 * Leg replay lab — RECORDED TOOLS: serve a replayed sample the tool results its node's PRODUCTION execution received.
 *
 * WHY (2026-10-13, VERBATIM-QUOTE-OMISSION group C lab, DRAFT-C §5.1): the default lab stubs every tool call
 * (live.ts `TOOL_STUB_RESULT`). An Author or Reviewer works from §6, so the stub is harmless for them; a Harvester's
 * whole job is tool calls, so under the stub it has nothing to quote and a quote-fidelity measure reads nothing.
 *
 * WHAT IS SERVED, AND WHERE R9 HAPPENS. A served result is the stored `result.json` `toolCalls[i].result` — the RAW,
 * pre-R9 object production's `executeToolOnServer` returned (structuredContent paths intact). It is handed back
 * through the SAME `executeToolOnServer` seam, so the SHIPPING loop (`executeToolTurn`) applies R9 site A, the Tier-1
 * LLM cap and the read_more pager to it exactly as in production — the lab sanitises nothing itself. The loop's
 * `toolCallResults` then carry the served raw object, `rewritten`/`rewriteClasses` and `resultTruncatedForLlm`, and
 * the shipping result.json builder turns them into a sample's `toolCalls`, so `computeQuoteFidelity` recomputes
 * offline exactly as at persist. A stored call that FAILED is replayed as a throw of its stored error (the loop then
 * records it as production did).
 *
 * MATCHING (each stored call serves at most once, first unused in production order; every serve names its tier):
 *   exact         same tool, `JSON.stringify(args)` equal
 *   canonical     same tool, args equal after sorting keys and parsing nested JSON strings ("differs only in key
 *                 order", and the services gateway's `arguments: "{}"` vs `arguments: {}`)
 *   services-tool a `services` call naming the same inner tool with canonically equal inner arguments (absent ≡ {}),
 *                 under another `targetService` name — the same read of the same file under a re-registered name
 *   repeat        every matching stored call is used: the LAST matching one is served again (a re-read of a deployed
 *                 file returns the same bytes; serving the stub instead would tell the model reads are not executed)
 *   same-action   a PLATFORM call (project/registry/perform — never `services`) with no match above: the first unused
 *                 stored call of the same tool and `action` — e.g. a self-provision `registry.register` whose description
 *                 the sample worded differently. Never a `services` call: a different query, URL or file would be
 *                 served another read's bytes.
 * Otherwise the call gets the stub and is recorded `unserved`. A stored result truncated at persist
 * (`{truncated:true, preview}`) is NOT served (it is not what production returned); recorded `unserved-truncated`.
 *
 * VALIDITY (pre-registered, DRAFT-C §5.1 rule 5): a sample counts only when ≥ 90% of its calls to FILE tools were
 * served (any tier but same-action, unserved*). A sample that read no file is valid vacuously and reported as such
 * (`fileCalls: 0`) — not reading the file is the Harvester's behaviour, scored by its fact, not a mode failure.
 */
import { FILE_ARTIFACT_TOOLS } from '../../lib/agents/harness/quote-fidelity';
import type { ExecBlock } from './snapshot';
import { parsedResult } from './rebuild';

/** The tools whose result IS the quoted document: the file lane plus the Prometheus rendering (C2's lane). */
export const RECORDED_FILE_TOOLS: readonly string[] = [...FILE_ARTIFACT_TOOLS, 'get_prometheus_config'];
export const RECORDED_VALIDITY_MIN = 0.9;

export type ServeTier = 'exact' | 'canonical' | 'services-tool' | 'repeat' | 'same-action' | 'unserved' | 'unserved-truncated';
export interface ServeLogEntry { tool: string; action: string | null; innerTool: string | null; fileTool: boolean; tier: ServeTier; storedIndex: number | null }
export interface StoredCall { index: number; tool: string; server: string | null; args: unknown; result: unknown; error: string | null; success: boolean; truncatedAtPersist: boolean }

const parseMaybe = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!(s.startsWith('{') || s.startsWith('['))) return v;
  try { return JSON.parse(s); } catch { return v; }
};
/** Key-sorted, nested-JSON-string-parsed form. Only ever COMPARED, never sent. */
export function canonicalArgs(v: unknown): string {
  const norm = (x: unknown): unknown => {
    const p = parseMaybe(x);
    if (Array.isArray(p)) return p.map(norm);
    if (p && typeof p === 'object') return Object.fromEntries(Object.keys(p as object).sort().map((k) => [k, norm((p as Record<string, unknown>)[k])]));
    return p;
  };
  return JSON.stringify(norm(v));
}
const obj = (v: unknown): Record<string, unknown> | null => {
  const p = parseMaybe(v);
  return p && typeof p === 'object' && !Array.isArray(p) ? p as Record<string, unknown> : null;
};
const innerToolOf = (tool: string, args: unknown): string | null => {
  const a = obj(args);
  return tool === 'services' && typeof a?.tool === 'string' ? a.tool : null;
};
const actionOf = (args: unknown): string | null => {
  const a = obj(args);
  return typeof a?.action === 'string' ? a.action : null;
};
/** A services call's inner arguments, canonical, with absent ≡ {} ≡ "{}". */
const innerArgsOf = (args: unknown): string => {
  const a = obj(args);
  const inner = a?.arguments;
  return inner == null || inner === '' ? canonicalArgs({}) : canonicalArgs(inner);
};
export const isFileCall = (tool: string, args: unknown): boolean => RECORDED_FILE_TOOLS.includes(innerToolOf(tool, args) ?? '');

/** The production execution's tool calls, in order, as the record a sample is served from. */
export function storedCallsOf(b: ExecBlock): StoredCall[] {
  const tcs = parsedResult(b)?.toolCalls;
  if (!Array.isArray(tcs)) return [];
  return tcs.map((t: any, index: number) => ({
    index, tool: String(t?.tool ?? t?.name ?? '?'), server: typeof t?.server === 'string' ? t.server : null,
    args: t?.arguments, result: t?.result, error: typeof t?.error === 'string' ? t.error : null, success: t?.success !== false,
    truncatedAtPersist: !!(t?.result && typeof t.result === 'object' && (t.result as any).truncated === true && typeof (t.result as any).preview === 'string'),
  }));
}

export interface RecordedToolServer {
  getToolDefinition(name: string): Promise<{ serverName: string; tool: { name: string } }>;
  executeToolOnServer(server: string, tool: string, args: unknown): Promise<unknown>;
  log: ServeLogEntry[];
}

/**
 * One server per SAMPLE (each sample's "first unused" state is its own). `stub` is what an unserved call returns —
 * live.ts passes `TOOL_STUB_RESULT`, so unserved calls look exactly as they do in the default lab.
 */
export function createRecordedToolServer(stored: StoredCall[], stub: unknown): RecordedToolServer {
  const used = new Set<number>();
  const log: ServeLogEntry[] = [];
  const serverOf = new Map<string, string>();
  for (const s of stored) if (s.server && !serverOf.has(s.tool)) serverOf.set(s.tool, s.server);
  const serve = (s: StoredCall): unknown => {
    if (!s.success) throw new Error(s.error ?? 'recorded tool call failed');
    return s.result;
  };
  return {
    log,
    async getToolDefinition(name: string) { return { serverName: serverOf.get(name) ?? 'leg-replay-lab-recorded', tool: { name } }; },
    async executeToolOnServer(_server: string, tool: string, args: unknown) {
      const inner = innerToolOf(tool, args);
      const fileTool = isFileCall(tool, args);
      const entry: ServeLogEntry = { tool, action: actionOf(args), innerTool: inner, fileTool, tier: 'unserved', storedIndex: null };
      log.push(entry);
      const same = stored.filter((s) => s.tool === tool);
      const exactKey = JSON.stringify(args);
      const canonKey = canonicalArgs(args);
      const tiers: Array<[ServeTier, (s: StoredCall) => boolean]> = [
        ['exact', (s) => JSON.stringify(s.args) === exactKey],
        ['canonical', (s) => canonicalArgs(s.args) === canonKey],
        ['services-tool', (s) => tool === 'services' && inner !== null && innerToolOf(s.tool, s.args) === inner && innerArgsOf(s.args) === innerArgsOf(args)],
      ];
      for (const [tier, pred] of tiers) {
        const hit = same.find((s) => !used.has(s.index) && pred(s));
        if (!hit) continue;
        if (hit.truncatedAtPersist) { entry.tier = 'unserved-truncated'; entry.storedIndex = hit.index; return stub; }
        used.add(hit.index); entry.tier = tier; entry.storedIndex = hit.index;
        return serve(hit);
      }
      const again = [...same].reverse().find((s) => tiers.some(([, pred]) => pred(s)));
      if (again) {
        if (again.truncatedAtPersist) { entry.tier = 'unserved-truncated'; entry.storedIndex = again.index; return stub; }
        entry.tier = 'repeat'; entry.storedIndex = again.index;
        return serve(again);
      }
      if (tool !== 'services') {
        const act = actionOf(args);
        const hit = same.find((s) => !used.has(s.index) && actionOf(s.args) === act && !s.truncatedAtPersist);
        if (hit) { used.add(hit.index); entry.tier = 'same-action'; entry.storedIndex = hit.index; return serve(hit); }
      }
      return stub;
    },
  };
}

export interface RecordedToolsReport {
  calls: number;
  tiers: Partial<Record<ServeTier, number>>;
  fileCalls: number;
  fileServed: number;
  fileServedRate: number | null;
  valid: boolean;
  /** A file tool the PRODUCTION execution called that this sample never called (reported, not a validity input). */
  productionFileToolsNotCalled: string[];
  log: ServeLogEntry[];
}

export function recordedToolsReport(log: ServeLogEntry[], stored: StoredCall[]): RecordedToolsReport {
  const tiers: Partial<Record<ServeTier, number>> = {};
  for (const e of log) tiers[e.tier] = (tiers[e.tier] ?? 0) + 1;
  const file = log.filter((e) => e.fileTool);
  const fileServed = file.filter((e) => e.tier !== 'unserved' && e.tier !== 'unserved-truncated' && e.tier !== 'same-action').length;
  const rate = file.length ? fileServed / file.length : null;
  const called = new Set(file.map((e) => e.innerTool));
  const prodFile = [...new Set(stored.filter((s) => isFileCall(s.tool, s.args)).map((s) => innerToolOf(s.tool, s.args)!))];
  return {
    calls: log.length, tiers, fileCalls: file.length, fileServed, fileServedRate: rate,
    valid: rate === null || rate >= RECORDED_VALIDITY_MIN,
    productionFileToolsNotCalled: prodFile.filter((t) => !called.has(t)),
    log,
  };
}
