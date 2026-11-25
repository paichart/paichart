/**
 * Leg replay lab — L-1, the IN-MEMORY held store (PLATFORM-HELD-BYTES Stage B plan §4; model-evaluation lane §1.3 L-1).
 *
 * For a node, the Author's FROZEN Harvester entry (its `config.inputContext.chainedFrom`, the authoritative execution the
 * Author was chained from — never "newest", BC-A8) names the Harvester execution; its stored result.json `toolCalls` go
 * through the SHIPPING capture (`prepareHeldCapture`: extractor + canonical decode + R10 + caps) and the SHIPPING view
 * (`buildView`), and the §6 fields are built by the SHIPPING pure entry builders (held-chain.ts `heldViewEntryFields` /
 * `heldIndexEntryFields`). Nothing is written anywhere: the store is a value.
 *
 * REFUSED BY NAME (never silently held from a cut): a Harvester whose stored file-call result was truncated at persist —
 * the bytes the capture would hold are not the bytes production held (recorded-tools.ts's `truncatedAtPersist` rule).
 *
 * `labResolveHeldFiles` is the lab's `ResolveHeldFiles` for the shipping edit step: the same pointer checks the production
 * resolver makes (the item's ref exists, belongs to this Harvester execution, its view text hashes to the store's view),
 * answered from memory. G-HOLD-ID pins that the lab's base hashes equal production `held_blobs.sha256` on live Harvesters.
 */
import { createHash } from 'crypto';
import { prepareHeldCaptureWithEvidence } from '../../lib/services/held-bytes-capture';
import type { HeldCapturePlan } from '../../lib/services/held-bytes-store';
import type { CaptureEvidence } from '../../lib/agents/harness/file-source-compare';
import { buildView } from '../../lib/agents/harness/held-bytes/view';
import { r9VersionInEffect } from '../../lib/agents/harness/sanitize-chained-output';
import {
  harvesterHandles, heldViewEntryFields, heldIndexEntryFields, type HeldCaptureRefLike, type HeldRefusalLike, type HeldViewResolution,
  type HeldChainState,
} from '../../lib/agents/harness/held-chain';
import type { ResolveHeldFiles, ResolvedHeldRef } from '../../lib/services/held-edit-step';
import type { HeldFileInput } from '../../lib/agents/harness/held-bytes/apply';
import type { Snapshot } from './snapshot';
import { isDeviceSourceLeg } from '../../lib/agents/harness/held-bytes/variant';
import { resolveLegDeviceSources, contractDeviceSourcesValue } from '../../lib/agents/harness/device-sources';
import { buildDeviceReadScope } from '../../lib/agents/harness/held-bytes/device-read-scope';
import { labCaptureScopes, assertCaptureScopes, type LabCaptureScopes } from './config-sources-arm';

const HARVESTER_ROLE = 'infra_state_harvester';
/** held-network step 3 batch 2b deploy (CLAUDE.md series cut): the device-read capture lane is live from here. */
export const DEVICE_LANE_CUT = '2026-10-26T02:20:23Z';
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

export interface LabHeldRef extends HeldCaptureRefLike {
  content: string; redactorVersion: string; redactedCount: number; sourceTool: string; serviceName: string;
}
export interface LabHeldStore {
  harvesterExecutionId: string;
  harvesterTaskId: string;
  scope: string | null;
  refs: LabHeldRef[];
  refusals: Array<HeldRefusalLike & { refusal: string }>;
  stats: Record<string, number>;
  /** STEP 3 slice L: Σ the held files' stored byte lengths — the `storedBytes` input of the shipping `buildHeldBytesDigest`. */
  storedBytes: number;
}
/** STEP 3 slice L: the store WITH what the file comparison reads — the capture plan (strings and numbers) and the served-side
 *  EVIDENCE (text that production never stores). The evidence is returned BESIDE the store, never on it: a store is carried into
 *  manifests and reports, the evidence lives only until the comparison is made (the core's own rule, execution-core.ts). */
export interface LabCapture { store: LabHeldStore; plan: HeldCapturePlan | null; evidence: CaptureEvidence | null }

/** The Author's frozen Harvester entry: exactly one chained entry whose role is the Harvester's. */
export function frozenHarvesterEntry(snap: Snapshot): { executionId: string; taskId: string } {
  const cf = snap.author.exec.config?.inputContext?.chainedFrom;
  const hits = (Array.isArray(cf) ? cf : []).filter((e: any) => e?.agentRole === HARVESTER_ROLE);
  if (hits.length !== 1) throw new Error(`${snap.author.exec.id}: ${hits.length} frozen Harvester entries (want exactly 1)`);
  return { executionId: String(hits[0].executionId), taskId: String(hits[0].taskId) };
}

/** The store for one Harvester execution's stored result.json. Throws (by name) on a persist-truncated file leaf. */
/** `gitFileSourceLeg` (held-k8s, L-K-e): the owning leg may read a Git file source — the shipping capture's 1b-scope input
 *  (`OwningLegResolution.gitFileSource`). Absent ⇒ false, so an observability store is byte-identical to before; a k8s store
 *  without it holds NOTHING from github-service (the capture counts the read as `outOfScopeLane`). */
/** `deviceLeg` (held-network L-N2-a, 2026-10-26): the owning leg's description + interface contract when the leg declares Device
 *  sources (`isDeviceSourceLeg`) — resolved by the SHIPPING grammar and scope builder exactly as execution-core does
 *  (`resolveLegDeviceSources` → `buildDeviceReadScope` over these records). Absent ⇒ no device-read lane (every non-network store is
 *  byte-identical to before; a network store without it holds NO device config — the capture refuses nothing, it never sees the lane). */
export function deviceLegOf(leg: { title?: string | null; metadata?: unknown; description?: string | null; inputContext?: any } | null | undefined): { description: string | null; contract: unknown } | undefined {
  if (!leg || !isDeviceSourceLeg(leg)) return undefined;
  const ic = typeof leg.inputContext === 'string' ? (() => { try { return JSON.parse(leg.inputContext); } catch { return null; } })() : leg.inputContext;
  return { description: leg.description ?? null, contract: ic?.interfaceContract ?? null };
}

/** `scopes` (Config sources STEP 2 L-CS-K; STEP 3 slice L, register CONFIG-SOURCES-OBS-JOIN-PRECONDITIONS item 8): what held
 *  capture takes from the leg on this ARM — the Git-lane switch, the Config scope and the protocol the scope belongs to, as ONE
 *  object from the SHIPPING `captureScopesFor` (config-sources-arm.ts `labCaptureScopes`), handed to the SHIPPING capture exactly
 *  as execution-core hands them. A scope without its protocol (or the reverse) is REFUSED — never judged as "the strictest
 *  protocol" by accident. `gitFileSourceLeg` (held-k8s L-K-e) is the older, scope-less form, kept for the production identity
 *  check and the callers that hold no leg; naming BOTH is refused (one lever, two sources). Neither ⇒ the Git lane off, no scope. */
export function buildLabCaptureFromResult(h: { executionId: string; taskId: string; povId: string | null; resultJson: string; gitFileSourceLeg?: boolean; deviceLeg?: { description: string | null; contract: unknown }; scopes?: LabCaptureScopes | null },
  opts: { /** told the count when production's capture warned of pin violations; absent ⇒ such a warning throws, as every warning does */ onPinViolationWarning?: (count: number) => void } = {}): LabCapture {
  if ('configSources' in (h as Record<string, unknown>)) throw new Error('L-1: `configSources` is no longer a store input — pass `scopes` (labCaptureScopes: the Config scope travels with its protocol and the Git-lane switch)');
  if (h.scopes && h.gitFileSourceLeg !== undefined) throw new Error('L-1: both `scopes` and `gitFileSourceLeg` were passed — one lever, two sources');
  const scopes = h.scopes ? assertCaptureScopes(h.scopes, `L-1 (${h.executionId})`) : null;
  const rj = JSON.parse(h.resultJson) as { toolCalls?: unknown[] };
  const toolCalls = Array.isArray(rj.toolCalls) ? rj.toolCalls : [];
  const cut = toolCalls.map((t: any, i) => ({ i, t })).filter(({ t }) => t?.result && typeof t.result === 'object' && t.result.truncated === true && typeof t.result.preview === 'string');
  if (cut.length) throw new Error(`L-1 refused: Harvester ${h.executionId} has ${cut.length} tool result(s) truncated at persist (calls ${cut.map((c) => c.i).join(', ')}) — not the bytes production held`);
  const prior = process.env.HELD_BYTES_CAPTURE_ENABLED;
  process.env.HELD_BYTES_CAPTURE_ENABLED = 'true';
  let plan: HeldCapturePlan | null;
  let evidence: CaptureEvidence | null;
  const warned: string[] = [];
  try {
    const deviceRead = h.deviceLeg
      ? buildDeviceReadScope(resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(h.deviceLeg.contract), taskBody: h.deviceLeg.description }), toolCalls)
      : null;
    // The SAME argument shape as execution-core.ts: the Config scope and its protocol are spread together, or not at all.
    const prepared = prepareHeldCaptureWithEvidence({ toolCallResults: toolCalls, task: { id: h.taskId, povId: h.povId },
      gitFileSourceLeg: scopes ? scopes.gitFileSourceLeg : h.gitFileSourceLeg === true, ...(deviceRead ? { deviceRead } : {}),
      ...(scopes && scopes.configSources ? { configSources: scopes.configSources, configSourceProtocol: scopes.configSourceProtocol } : {}),
      logger: { info: () => undefined, warn: (o: any) => { warned.push(JSON.stringify(o)); } } });
    plan = prepared.plan; evidence = prepared.evidence;
  } finally {
    if (prior === undefined) delete process.env.HELD_BYTES_CAPTURE_ENABLED; else process.env.HELD_BYTES_CAPTURE_ENABLED = prior;
  }
  // HELD-ID-CHECK-ABORTS-ON-A-PIN-VIOLATION (2026-11-15): ONE warning is a legitimate production event — a Git read the pin refused
  // (`pinViolations`: the agent asked for another repo or ref; production refused it, logged it, and held nothing for it). A caller
  // that opts in (`onPinViolationWarning` — the identity check, which walks EVERY production Harvester) is told and the build goes on.
  // Every other warning, and a pin-violation warning with no opt-in (a lab building its store from ONE chosen Harvester), still throws.
  const isPinViolation = (w: string): boolean => { try { const o = JSON.parse(w); return !!o && typeof o === 'object' && typeof o.pinViolations === 'number' && o.pinViolations > 0; } catch { return false; } };
  const unexpected = warned.filter((w) => !(opts.onPinViolationWarning && isPinViolation(w)));
  if (unexpected.length) throw new Error(`L-1: prepareHeldCapture warned on ${h.executionId}: ${unexpected.join('; ')}`);
  for (const w of warned.filter(isPinViolation)) opts.onPinViolationWarning?.(Number(JSON.parse(w).pinViolations));
  const files = plan?.files ?? [];
  const store: LabHeldStore = {
    harvesterExecutionId: h.executionId, harvesterTaskId: h.taskId, scope: plan?.scope ?? h.povId,
    // A lab ref id is deterministic and NOT a cuid (it can never be mistaken for a production row).
    refs: files.map((f, i) => ({ id: `labref${i}_${f.sha256.slice(0, 12)}`, scope: plan!.scope ?? '', blobSha256: f.sha256, toolCallIndex: f.toolCallIndex,
      selector: f.selector, target: f.target, path: f.path, lineCount: f.lineCount, content: f.content, redactorVersion: f.redactorVersion,
      redactedCount: f.redactedCount, sourceTool: f.sourceTool, serviceName: f.serviceName })),
    refusals: (plan?.refusals ?? []).map((r) => ({ toolCallIndex: r.toolCallIndex, selector: r.selector, target: r.target, path: r.path, refusal: r.refusal })),
    stats: plan?.stats ?? {},
    storedBytes: files.reduce((n, f) => n + f.storedByteLength, 0),
  };
  return { store, plan, evidence };
}
/** The store alone (every caller that makes no file comparison). */
export function buildLabHeldStoreFromResult(h: Parameters<typeof buildLabCaptureFromResult>[0], opts: Parameters<typeof buildLabCaptureFromResult>[1] = {}): LabHeldStore {
  return buildLabCaptureFromResult(h, opts).store;
}

/** The ARM a node's store is built for: its composed protocol injection (`armProtocolInjection`). Absent ⇒ an arm that reads no
 *  Config sources (every store built before L-CS-K, and every base arm): the Git lane by name, no scope — byte-identical to before. */
export interface LabStoreArm { protocolInjection: unknown }
function armOf(arm: LabStoreArm | null | undefined): unknown {
  if (arm && typeof arm === 'object' && 'state' in (arm as unknown as Record<string, unknown>)) throw new Error('L-1: buildLabHeldStore takes the ARM ({ protocolInjection }), not a governing declaration — the scopes are derived by labCaptureScopes (captureScopesFor), never passed loose');
  return arm ? arm.protocolInjection : undefined;
}
/** The capture for a node: its frozen Harvester, read from the snapshot's stage artifacts, under the arm's capture scopes. */
export function buildLabCapture(snap: Snapshot, arm?: LabStoreArm | null): LabCapture {
  const e = frozenHarvesterEntry(snap);
  const art = snap.childArtifacts.find((a) => a.executionId === e.executionId && a.name === 'result.json');
  if (!art) throw new Error(`L-1: the snapshot carries no result.json for the frozen Harvester execution ${e.executionId}`);
  return buildLabCaptureFromResult({ executionId: e.executionId, taskId: e.taskId, povId: snap.author.task.pov_id ?? null, resultJson: art.content,
    scopes: labCaptureScopes(snap.leg, armOf(arm)), deviceLeg: deviceLegOf(snap.leg as never) });
}
/** The store for a node (see `buildLabCapture`). */
export function buildLabHeldStore(snap: Snapshot, arm?: LabStoreArm | null): LabHeldStore {
  return buildLabCapture(snap, arm).store;
}

export function labViewResolution(ref: { content: string }, r9Version: string): HeldViewResolution {
  const v = buildView(ref.content, r9Version);
  return v.ok ? { state: 'rendered', view: { viewText: v.viewText, lineCount: v.lineCount, r9Version: v.r9Version, viewVersion: v.viewVersion, rewrittenLines: v.rewrittenLines } } : { state: v.state };
}

/** The Harvester entry's `heldView` (Author) — the shipping builder over the store. */
export async function labHeldViewFields(store: LabHeldStore, state: HeldChainState = { budgetUsed: 0 }, r9Version = r9VersionInEffect()): Promise<Record<string, unknown>> {
  const byId = new Map(store.refs.map((r) => [r.id, r]));
  return heldViewEntryFields(harvesterHandles(store.refs, store.refusals), store.refs,
    async (ref) => labViewResolution(byId.get(ref.id)!, r9Version), { demoPov: false, depExecutionId: store.harvesterExecutionId, state });
}

/** The Harvester entry's `heldIndex` (Architect). */
export function labHeldIndexFields(store: LabHeldStore): Record<string, unknown> {
  return heldIndexEntryFields(harvesterHandles(store.refs, store.refusals), store.refs);
}

/** The lab's resolver for the shipping edit step: the production resolver's pointer checks, answered from memory. */
export function labResolveHeldFiles(store: LabHeldStore, r9Version = r9VersionInEffect()): ResolveHeldFiles {
  const byId = new Map(store.refs.map((r) => [r.id, r]));
  return async (items) => {
    const files: HeldFileInput[] = []; const refs: ResolvedHeldRef[] = [];
    for (const it of items) {
      const ref = it.refId ? byId.get(it.refId) : undefined;
      if (!ref || it.harvesterExecutionId !== store.harvesterExecutionId || !it.r9Version || !it.viewVersion) { files.push({ handle: it.handle, path: it.path, state: 'binding-invalid' }); continue; }
      const v = labViewResolution(ref, it.r9Version);
      if (v.state !== 'rendered' || !('view' in v)) { files.push({ handle: it.handle, path: it.path, state: 'view-not-rendered' }); continue; }
      if (typeof it.viewText === 'string' && sha(it.viewText) !== sha(v.view.viewText)) { files.push({ handle: it.handle, path: it.path, state: 'binding-invalid' }); continue; }
      files.push({ handle: it.handle, path: ref.path ?? '', state: 'rendered', baseText: ref.content, viewText: v.view.viewText, rewrittenLines: v.view.rewrittenLines, redactorVersion: ref.redactorVersion });
      refs.push({ handle: it.handle, refId: ref.id, scope: ref.scope, blobSha256: ref.blobSha256, r9Version: it.r9Version, viewVersion: it.viewVersion,
        row: { id: ref.id, scope: ref.scope, blobSha256: ref.blobSha256, kind: 'CAPTURE', path: ref.path, redactorVersion: ref.redactorVersion, redactedCount: ref.redactedCount, lineCount: ref.lineCount } });
    }
    return { files, refs };
  };
}

/** The capture scopes of a STORED production Harvester (see `heldIdentityCheck`): `labCaptureScopes` over its leg row and its own
 *  stored protocol injection. A result.json that does not parse, or carries no injection, reads as an arm with no Config sources. */
export function identityScopes(leg: { id?: string; title?: string | null; metadata?: unknown; description?: string | null; inputContext?: unknown } | null, resultJson: string): LabCaptureScopes {
  let injection: unknown;
  try { injection = (JSON.parse(resultJson) as { protocolInjection?: unknown }).protocolInjection; } catch { injection = undefined; }
  return labCaptureScopes(leg as never, injection);
}

/**
 * G-HOLD-ID ($0, read-only): every Harvester execution production holds CAPTURE refs for, rebuilt through L-1 from its STORED
 * result.json, must reproduce the same (toolCallIndex, path, blobSha256) set. Keyed on the stored row's `redactorVersion`:
 * push 1's v2→v3 replay moved 0 held blobs, so a mismatch on either version is a lab (or capture) defect, never drift.
 */
export function heldIdentityCheck(runSql: (sql: string) => string): { executions: number; refs: number; equal: number; byVersion: Record<string, number>; mismatches: string[]; predatesDeviceLane: string[]; pinViolationWarned: string[] } {
  // held-k8s (L-K-e): the owning leg (stage metadata harnessTaskId) decides the Git-source scope, as production's capture does.
  const rows = runSql(`SELECT json_build_object('executionId', r."executionId", 'startTime', e."startTime", 'taskId', e."taskId", 'povId', t.pov_id,
      'leg', (SELECT json_build_object('id', l.id, 'title', l.title, 'metadata', l.metadata, 'description', l.description, 'inputContext', l."inputContext") FROM stages s JOIN tasks l ON l.id = s.metadata->>'harnessTaskId' WHERE s.id = t.stage_id),
      'resultJson', (SELECT a.content FROM agent_artifacts a WHERE a."executionId" = r."executionId" AND a.name = 'result.json' ORDER BY a."createdAt" DESC LIMIT 1),
      'refs', json_agg(json_build_object('toolCallIndex', r."toolCallIndex", 'path', r.path, 'blobSha256', r."blobSha256", 'redactorVersion', r."redactorVersion") ORDER BY r."toolCallIndex", r.path))
    FROM held_file_refs r JOIN agent_executions e ON e.id = r."executionId" JOIN tasks t ON t.id = e."taskId"
    WHERE r.kind = 'CAPTURE' GROUP BY r."executionId", e."taskId", e."startTime", t.pov_id, t.stage_id;`).split('\n').filter(Boolean);
  const out = { executions: 0, refs: 0, equal: 0, byVersion: {} as Record<string, number>, mismatches: [] as string[], predatesDeviceLane: [] as string[], pinViolationWarned: [] as string[] };
  for (const line of rows) {
    const r = JSON.parse(line) as { startTime?: string | null; executionId: string; taskId: string; povId: string | null; resultJson: string | null; leg: { title: string | null; metadata: unknown; description?: string | null; inputContext?: unknown } | null; refs: Array<{ toolCallIndex: number; path: string; blobSha256: string; redactorVersion: string }> };
    out.executions++;
    if (!r.resultJson) { out.mismatches.push(`${r.executionId}: no result.json`); continue; }
    let store: LabHeldStore;
    try {
      // STEP 3 slice L (independent review F2): the scopes PRODUCTION took for this Harvester — the shipping `captureScopesFor`, asked
      // with the leg row and the Harvester's OWN stored `protocolInjection` (the version key production read). A Harvester composed
      // below its protocol's Config-sources version, or of a protocol with no Config lane, gets the Git lane by name and no scope —
      // exactly what this check passed before. A DECLARED 1.12.0 observability Harvester gets the Git lane by its declaration (the
      // leg is no Git-source leg by name), so the rebuild holds the Git files production held; without this the first live declared
      // run would turn this check, and the lab suite, red.
      store = buildLabHeldStoreFromResult({ executionId: r.executionId, taskId: r.taskId, povId: r.povId, resultJson: r.resultJson, scopes: identityScopes(r.leg, r.resultJson), deviceLeg: deviceLegOf(r.leg as never) }, { onPinViolationWarning: (n) => out.pinViolationWarned.push(`${r.executionId}: ${n} Git read(s) the pin refused in production (held nothing for them)`) });
    } catch (e) {
      // one execution the lab cannot rebuild is a NAMED mismatch; the check goes on to the rest (it used to stop here)
      out.mismatches.push(`${r.executionId}: ${(e as Error).message.slice(0, 200)}`); continue;
    }
    const key = (x: { toolCallIndex: number | null; path: string | null; blobSha256: string }) => `${x.toolCallIndex}|${x.path}|${x.blobSha256}`;
    const lab = new Set(store.refs.map(key));
    for (const p of r.refs) {
      out.refs++; out.byVersion[p.redactorVersion] = (out.byVersion[p.redactorVersion] ?? 0) + 1;
      if (lab.has(key(p))) out.equal++; else out.mismatches.push(`${r.executionId} call ${p.toolCallIndex} ${p.path}: prod ${p.blobSha256.slice(0, 12)} (${p.redactorVersion}) not in the lab store`);
    }
    // L-N2-a: a Harvester that ran BEFORE the device-read lane deployed (batch 2b, cut 2026-10-26 02:20:23Z) has no stored device ref by
    // construction; the lab (today's capture) holds its declared device configs. Those extras are NAMED, never a mismatch — and only when
    // production holds no device ref for it at all and every extra is a `device:` target (anything else stays a mismatch).
    const extra = store.refs.filter((x) => !r.refs.some((p) => key(p) === key(x)));
    if (store.refs.length !== r.refs.length && r.startTime && Date.parse(r.startTime) < Date.parse(DEVICE_LANE_CUT)
        && !r.refs.some((p) => p.path === '/running-config') && extra.length === store.refs.length - r.refs.length
        && extra.every((x) => typeof x.target === 'string' && x.target.startsWith('device:'))) {
      out.predatesDeviceLane.push(`${r.executionId}: ${extra.length} device config(s) held by today's capture, none stored (ran before the device-read lane)`);
    } else if (store.refs.length !== r.refs.length) out.mismatches.push(`${r.executionId}: lab holds ${store.refs.length} file(s), production ${r.refs.length}`);
  }
  return out;
}
