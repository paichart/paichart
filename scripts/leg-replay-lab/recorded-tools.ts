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
import { registrationsByDescriptorUrl } from '../../lib/agents/harness/held-bytes/device-read-scope';
import { normalisedEndpoint } from '../../lib/agents/harness/held-bytes/declared-descriptor-endpoints';

/** The tools whose result IS the quoted document: the file lane plus the Prometheus rendering (C2's lane). */
export const RECORDED_FILE_TOOLS: readonly string[] = [...FILE_ARTIFACT_TOOLS, 'get_prometheus_config'];
export const RECORDED_VALIDITY_MIN = 0.9;

/** The fixture tiers (L-K-a, fixture-tools.ts) share this log when a node carries a file fixture: one entry per call, in order. */
export type ServeTier = 'exact' | 'canonical' | 'services-tool' | 'repeat' | 'same-action' | 'unserved' | 'unserved-truncated'
  | 'fixture-file' | 'fixture-directory' | 'fixture-missing' | 'fixture-refused' | 'unserved-fixture'
  /** L-N1 network tiers (network-fixtures.ts) share this log too. */
  | 'device-pool' | 'device-failure' | 'unserved-device' | 'catalogue' | 'unserved-catalogue' | 'register-refused'
  /** L-CS-K (2026-11-16): the k8s cluster tier (k8s-fixtures.ts) — a served read, or the service's own refusal of one. */
  | 'cluster-state' | 'cluster-refused'
  /** A requirements Reviewer's objective fetch, served from its own stored answer (objective-of-record.ts, 2026-11-10). */
  | 'objective-of-record'
  /** STEP 3 slice L (independent review F1): the faithful registration route — see `RecordedServeOptions.registerRoute`. */
  | 'register-descriptor' | 'register-endpoint' | 'unserved-register'
  /** Read-rule widening controls (2026-11-26, owner option (c)): a declared live-read line's descriptor fetch the record does not hold,
   *  answered from the descriptor's pinned published bytes (descriptor-fetch.ts). */
  | 'descriptor-fixture';
export interface ServeLogEntry { tool: string; action: string | null; innerTool: string | null; fileTool: boolean; tier: ServeTier; storedIndex: number | null }
export interface StoredCall { index: number; tool: string; server: string | null; args: unknown; result: unknown; error: string | null; success: boolean; truncatedAtPersist: boolean;
  /** The execution's own persisted tool-call record (R9 / LLM-cap facts). */ raw?: Record<string, any>; /** L-OBS-MLH: the sibling execution a pooled call came from. */ pooledFrom?: string }

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
    raw: t && typeof t === 'object' ? t : undefined,
  }));
}

/**
 * L-OBS-MLH sibling pool (2026-11-25): a Harvester node may be served a FILE read its own production execution never made from a
 * SIBLING execution's stored call (another leg's Harvester in the same program, same stack). Only `services` calls of a file tool
 * (RECORDED_FILE_TOOLS) are pooled — never a write, a registry call or a non-file read. PINNED BOTH WAYS: a key (target service,
 * inner tool, inner arguments) that the node's own record AND a sibling both hold must carry byte-identical results (canonical JSON, the gateway's `_meta` envelope excluded),
 * and a key two siblings both hold must agree — any difference refuses the pool (a different stack state is never served as this
 * one's). The pooled calls are appended after the node's own, with indices from 10000 × (sibling position + 1), so a serve log names
 * them; the node's own calls are unchanged and served first.
 */
export interface SiblingPoolReport { siblings: string[]; added: Array<{ from: string; key: string; index: number }>; crossChecked: string[];
  /** L-OBS-MLH ADDENDUM B: platform calls served from a sibling's record (same-action tier; never a file read, never a write executed). */ platformAdded: Array<{ from: string; key: string; index: number }> }
const poolKey = (c: StoredCall): string | null => {
  if (c.tool !== 'services' || actionOf(c.args) !== 'call' || !isFileCall(c.tool, c.args)) return null;
  const a = obj(c.args);
  return `${String(a?.targetService ?? '')}|${innerToolOf(c.tool, c.args)}|${innerArgsOf(c.args)}`;
};
export function poolSiblingCalls(own: StoredCall[], siblings: Array<{ executionId: string; calls: StoredCall[] }>): { calls: StoredCall[]; report: SiblingPoolReport } {
  // The CONTENT is compared, never the call envelope: every `_meta` subtree (the gateway's call time, duration, endpoint) is dropped
  // first — two calls of one tool on one stack differ there by construction. Every other byte must match.
  // Measured on canary B: the two calls differ ONLY in `_meta` (executionTime, timestamp) and the gateway's `metadata.executionTime` /
  // `metadata.timestamp`; those exact fields are dropped, nothing else.
  const strip = (x: unknown, parent = ''): unknown => { const p = parseMaybe(x); if (Array.isArray(p)) return p.map((v) => strip(v));
    if (p && typeof p === 'object') return Object.fromEntries(Object.entries(p as Record<string, unknown>)
      .filter(([k]) => k !== '_meta' && !(parent === 'metadata' && (k === 'executionTime' || k === 'timestamp'))).map(([k, v]) => [k, strip(v, k)])); return p; };
  const canon = (r: unknown) => canonicalArgs(strip(r));
  const ownBy = new Map<string, StoredCall>();
  for (const c of own) { const k = poolKey(c); if (k && c.success && !c.truncatedAtPersist && !ownBy.has(k)) ownBy.set(k, c); }
  const sibBy = new Map<string, { from: string; call: StoredCall }>();
  const crossChecked: string[] = [];
  siblings.forEach((s) => {
    for (const c of s.calls) {
      const k = poolKey(c); if (!k || !c.success || c.truncatedAtPersist) continue;
      const mine = ownBy.get(k);
      if (mine) { if (canon(mine.result) !== canon(c.result)) throw new Error(`sibling pool: ${s.executionId} answered ${k} differently from this node's own record — a different stack state; refused`); crossChecked.push(`${k} = own`); continue; }
      const prev = sibBy.get(k);
      if (prev) { if (canon(prev.call.result) !== canon(c.result)) throw new Error(`sibling pool: ${prev.from} and ${s.executionId} answered ${k} differently — refused`); crossChecked.push(`${k} = ${prev.from}`); continue; }
      sibBy.set(k, { from: s.executionId, call: c });
    }
  });
  const added: SiblingPoolReport['added'] = [];
  const calls = [...own];
  // ADDENDUM B (2026-11-25): the two PLATFORM calls a Harvester sample may make that touch nothing scored — `project pov.details`
  // and `perform task.comment` — are served from the record so a sample's validity is attainable: the node's own stored call if it
  // has one (the same-action tier already serves it), else the FIRST sibling's stored call of that action, appended here. Nothing is
  // executed (a comment is never written: the stored acknowledgement is returned). No content cross-check: these are not stack reads.
  const platformAdded: SiblingPoolReport['platformAdded'] = [];
  const PLATFORM = new Set(['project|pov.details', 'perform|task.comment']);
  const platKey = (c: StoredCall) => `${c.tool}|${actionOf(c.args) ?? ''}`;
  const ownPlat = new Set(own.filter((c) => c.success && PLATFORM.has(platKey(c))).map(platKey));
  siblings.forEach((sb, pos) => {
    for (const c of sb.calls) {
      const k = platKey(c);
      if (!PLATFORM.has(k) || !c.success || c.truncatedAtPersist || ownPlat.has(k) || platformAdded.some((x) => x.key === k)) continue;
      const index = 10000 * (pos + 1) + c.index;
      calls.push({ ...c, index, pooledFrom: sb.executionId }); platformAdded.push({ from: sb.executionId, key: k, index });
    }
  });
  [...sibBy.entries()].forEach(([k, v]) => {
    const pos = siblings.findIndex((s) => s.executionId === v.from);
    const index = 10000 * (pos + 1) + v.call.index;
    calls.push({ ...v.call, index, pooledFrom: v.from }); added.push({ from: v.from, key: k, index });
  });
  return { calls, report: { siblings: siblings.map((s) => s.executionId), added, crossChecked, platformAdded } };
}

export interface RecordedToolServer {
  getToolDefinition(name: string): Promise<{ serverName: string; tool: { name: string } }>;
  executeToolOnServer(server: string, tool: string, args: unknown): Promise<unknown>;
  log: ServeLogEntry[];
}

/**
 * `registerRoute: 'faithful'` (Config sources STEP 3 slice L; independent review F1, 2026-11-23) — OPT-IN per node, so every
 * experiment built before it serves exactly as it did.
 *
 * WHY. The platform ties a declared DESCRIPTOR-URL service line to a registration from the execution's own tool records
 * (`registrationsByDescriptorUrl`: a `registry register` carrying that `descriptorUrl`, or a hand registration whose ENDPOINT is the
 * one the platform's table lists for the URL). A leg whose Harvester registered any other way is forced `service-held-not-held` —
 * correct by design (owner 2026-11-22). Without this option a `registry register` the stored run did not make is served by the
 * `same-action` tier: the STORED registration's result, whatever the sample's own arguments were. A sample that registered by hand
 * at ANOTHER endpoint would then get a result naming the stored endpoint, be tied by it, and read "held, not forced" where
 * production forces — the force column wrong on exactly the sample the registration reading is about.
 *
 * WHAT IT DOES for a `registry` call with `action: 'register'` (every other call: the tiers above, unchanged):
 *   register-descriptor   the sample registered WITH `descriptorUrl`, and the stored registration resolves — by the SHIPPING
 *                         resolver, either route — to that SAME URL: the stored result is served (the row the platform registers
 *                         from that descriptor is the row the stored run registered).
 *   register-endpoint     the sample registered BY HAND with the stored registration's own service name and endpoint: the stored
 *                         result is served (production would tie it by endpoint — "by hand at the descriptor's own endpoint").
 *   unserved-register     anything else (another URL, another endpoint, another name, a stored run with no registration): the STUB.
 *                         The lab does not know what the platform would answer, and says so: the sample's records then carry no
 *                         successful registration, so the shipping resolver ties nothing and the lab's force reads as production's
 *                         would for a registration that did not resolve. The Harvester's ROUTE is scored from its ARGUMENTS.
 */
export interface RecordedServeOptions { registerRoute?: 'faithful';
  /** 2026-11-26 (descriptor-fetch.ts): answers a declared descriptor's `scrape_page` that NO stored call serves (tier `descriptor-fixture`);
   *  null ⇒ unserved, as before. Absent ⇒ every earlier experiment serves exactly as it did. */
  descriptorFetch?: (tool: string, args: unknown) => unknown | null }

/** The ONE field the shipping registration handler adds to its success result for a registration FROM a descriptor URL
 *  (service-registration-handler.js: `...(descriptorProvenance ? { registeredFromDescriptor: true } : {})`; pinned to that source
 *  line by LCO12). The stored result the lab serves may be a HAND registration's, which lacks it; every other field of the handler's
 *  result (success, serviceId, serviceName, message, endpoint, owner, status, nextSteps, verification) is the same literal for both
 *  routes. NOT modelled, named: the held-file declaration fields a descriptor that declares `heldFiles` adds, and
 *  `verification.example` (it quotes the caller's first capability). The result names NO tools on either route — a Harvester learns
 *  them from the hub's listing calls (the catalogue tier, network-fixtures.ts). A copy is returned; the stored record is not changed. */
export function asDescriptorRegistration(result: unknown): unknown {
  const r = JSON.parse(JSON.stringify(result)) as { content?: Array<{ type?: string; data?: Record<string, unknown> }> };
  const data = r?.content?.[0]?.type === 'data' ? r.content[0].data : null;
  if (!data || data.success !== true) return result;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) { if (k === 'nextSteps' && !('registeredFromDescriptor' in data)) out.registeredFromDescriptor = true; out[k] = v; }
  if (!('registeredFromDescriptor' in out)) out.registeredFromDescriptor = true;
  r.content![0].data = out;
  return r;
}

/**
 * One server per SAMPLE (each sample's "first unused" state is its own). `stub` is what an unserved call returns —
 * live.ts passes `TOOL_STUB_RESULT`, so unserved calls look exactly as they do in the default lab.
 */
export function createRecordedToolServer(stored: StoredCall[], stub: unknown, opts: RecordedServeOptions = {}): RecordedToolServer {
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
      if (opts.registerRoute === 'faithful' && tool === 'registry' && actionOf(args) === 'register') {
        const a = obj(args) ?? {};
        const reg = stored.find((s) => s.tool === 'registry' && actionOf(s.args) === 'register' && s.success && !s.truncatedAtPersist);
        const rec = reg ? [{ tool: 'registry', success: true, arguments: obj(reg.args) ?? {}, result: reg.result }] : [];
        const resolved = registrationsByDescriptorUrl(rec);
        const data = reg ? (((reg.result as any)?.content?.[0]?.data ?? null) as Record<string, unknown> | null) : null;
        if (reg && typeof a.descriptorUrl === 'string') {
          if ((resolved.get(a.descriptorUrl) ?? []).length > 0) { entry.tier = 'register-descriptor'; entry.storedIndex = reg.index; return asDescriptorRegistration(serve(reg)); }
        } else if (reg && a.descriptorUrl === undefined && data) {
          const storedEndpoint = typeof data.endpoint === 'string' ? data.endpoint : typeof obj(reg.args)?.endpoint === 'string' ? String(obj(reg.args)!.endpoint) : null;
          const mine = typeof a.endpoint === 'string' ? normalisedEndpoint(a.endpoint) : null;
          if (mine !== null && storedEndpoint !== null && mine === normalisedEndpoint(storedEndpoint) && typeof a.name === 'string' && a.name === data.serviceName) {
            entry.tier = 'register-endpoint'; entry.storedIndex = reg.index; return serve(reg);
          }
        }
        entry.tier = 'unserved-register';
        return stub;
      }
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
      if (opts.descriptorFetch && tool === 'services') {
        const answer = opts.descriptorFetch(tool, args);
        if (answer !== null) { entry.tier = 'descriptor-fixture'; return answer; }
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
  /** LAB-VALIDITY-OTHER-CALLS (2026-10-21): the NON-file `services` calls (state / cluster / descriptor reads; fixture-tier Git reads
   *  count as served). `valid` stays the file-tool rule above, unchanged, so earlier labs keep their readings; a lab that pre-registers
   *  "≥ 90% of other calls served" reads `otherValid` (score-t1 does). Platform calls (project / registry / perform) are not counted. */
  otherServicesCalls: number;
  otherServicesServed: number;
  otherServicesServedRate: number | null;
  otherValid: boolean;
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
  // The node's OWN production file tools only — a sibling-pooled call (L-OBS-MLH) is not this execution's production read.
  const prodFile = [...new Set(stored.filter((s) => !s.pooledFrom && isFileCall(s.tool, s.args)).map((s) => innerToolOf(s.tool, s.args)!))];
  const other = log.filter((e) => e.tool === 'services' && !e.fileTool);
  // Every `unserved*` tier (unserved, -truncated, -fixture, and L-N1's -device / -catalogue) is unserved; same-action never counts.
  const otherServed = other.filter((e) => !e.tier.startsWith('unserved') && e.tier !== 'same-action').length;
  const otherRate = other.length ? otherServed / other.length : null;
  return {
    calls: log.length, tiers, fileCalls: file.length, fileServed, fileServedRate: rate,
    valid: rate === null || rate >= RECORDED_VALIDITY_MIN,
    otherServicesCalls: other.length, otherServicesServed: otherServed, otherServicesServedRate: otherRate,
    otherValid: otherRate === null || otherRate >= RECORDED_VALIDITY_MIN,
    productionFileToolsNotCalled: prodFile.filter((t) => !called.has(t)),
    log,
  };
}

/**
 * The served-bytes check of a Harvester sample (moved here from lab.ts, 2026-11-25): each served log entry is matched to the loop record
 * of the same position, and to the STORED call it was served from — looked up by that call's `index`, never by array position. A
 * sibling-pooled call (L-OBS-MLH) carries index 10000 × k + i, so a position lookup found nothing and the check threw
 * "Cannot read properties of undefined (reading 'success')" after the loop, losing the paid sample (H-1, H-B-NORESTRICT #1).
 * R9 / LLM-cap facts are compared with the stored call's OWN production record (`raw`, of the execution it came from).
 */
export function servedBytesCheck(log: ServeLogEntry[], recs: Array<Record<string, any>>, stored: StoredCall[]):
  { served: number; identical: number; r9Compared: number; r9Equal: number; pooledServed: number; mismatches: string[] } {
  const bytes = { served: 0, identical: 0, r9Compared: 0, r9Equal: 0, pooledServed: 0, mismatches: [] as string[] };
  const byIndex = new Map(stored.map((c) => [c.index, c]));
  log.forEach((e, k) => {
    if (e.storedIndex === null || e.tier === 'unserved-truncated') return;
    const st = byIndex.get(e.storedIndex);
    if (!st) throw new Error(`served-bytes check: call ${k} names stored call ${e.storedIndex}, which the record does not hold`);
    const rec = recs[k];
    if (!st.success) return;
    bytes.served++; if (st.pooledFrom) bytes.pooledServed++;
    if (rec && JSON.stringify(rec.result) === JSON.stringify(st.result)) bytes.identical++; else bytes.mismatches.push(`call ${k} ← stored ${e.storedIndex}: result differs`);
    const prodRec = st.raw;
    if (rec && typeof prodRec?.rewritten === 'boolean') {
      bytes.r9Compared++;
      if (rec.rewritten === prodRec.rewritten && JSON.stringify(rec.rewriteClasses ?? []) === JSON.stringify(prodRec.rewriteClasses ?? [])
        && rec.resultTruncatedForLlm === prodRec.resultTruncatedForLlm && rec.resultChars === prodRec.resultChars) bytes.r9Equal++;
      else bytes.mismatches.push(`call ${k} ← stored ${e.storedIndex}: R9/LLM-cap facts differ (rewritten ${rec.rewritten}/${prodRec.rewritten}, chars ${rec.resultChars}/${prodRec.resultChars})`);
    }
  });
  return bytes;
}
