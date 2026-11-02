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
import { prepareHeldCapture } from '../../lib/services/held-bytes-capture';
import { buildView } from '../../lib/agents/harness/held-bytes/view';
import { r9VersionInEffect } from '../../lib/agents/harness/sanitize-chained-output';
import {
  harvesterHandles, heldViewEntryFields, heldIndexEntryFields, type HeldCaptureRefLike, type HeldRefusalLike, type HeldViewResolution,
  type HeldChainState,
} from '../../lib/agents/harness/held-chain';
import type { ResolveHeldFiles, ResolvedHeldRef } from '../../lib/services/held-edit-step';
import type { HeldFileInput } from '../../lib/agents/harness/held-bytes/apply';
import type { Snapshot } from './snapshot';
import { isGitFileSourceLeg, isDeviceSourceLeg } from '../../lib/agents/harness/held-bytes/variant';
import { resolveLegDeviceSources, contractDeviceSourcesValue } from '../../lib/agents/harness/device-sources';
import { buildDeviceReadScope } from '../../lib/agents/harness/held-bytes/device-read-scope';

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
}

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

export function buildLabHeldStoreFromResult(h: { executionId: string; taskId: string; povId: string | null; resultJson: string; gitFileSourceLeg?: boolean; deviceLeg?: { description: string | null; contract: unknown } }): LabHeldStore {
  const rj = JSON.parse(h.resultJson) as { toolCalls?: unknown[] };
  const toolCalls = Array.isArray(rj.toolCalls) ? rj.toolCalls : [];
  const cut = toolCalls.map((t: any, i) => ({ i, t })).filter(({ t }) => t?.result && typeof t.result === 'object' && t.result.truncated === true && typeof t.result.preview === 'string');
  if (cut.length) throw new Error(`L-1 refused: Harvester ${h.executionId} has ${cut.length} tool result(s) truncated at persist (calls ${cut.map((c) => c.i).join(', ')}) — not the bytes production held`);
  const prior = process.env.HELD_BYTES_CAPTURE_ENABLED;
  process.env.HELD_BYTES_CAPTURE_ENABLED = 'true';
  let plan: ReturnType<typeof prepareHeldCapture>;
  const warned: string[] = [];
  try {
    const deviceRead = h.deviceLeg
      ? buildDeviceReadScope(resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(h.deviceLeg.contract), taskBody: h.deviceLeg.description }), toolCalls)
      : null;
    plan = prepareHeldCapture({ toolCallResults: toolCalls, task: { id: h.taskId, povId: h.povId }, gitFileSourceLeg: h.gitFileSourceLeg === true, ...(deviceRead ? { deviceRead } : {}), logger: { info: () => undefined, warn: (o: any) => { warned.push(JSON.stringify(o)); } } });
  } finally {
    if (prior === undefined) delete process.env.HELD_BYTES_CAPTURE_ENABLED; else process.env.HELD_BYTES_CAPTURE_ENABLED = prior;
  }
  if (warned.length) throw new Error(`L-1: prepareHeldCapture warned on ${h.executionId}: ${warned.join('; ')}`);
  const files = plan?.files ?? [];
  return {
    harvesterExecutionId: h.executionId, harvesterTaskId: h.taskId, scope: plan?.scope ?? h.povId,
    // A lab ref id is deterministic and NOT a cuid (it can never be mistaken for a production row).
    refs: files.map((f, i) => ({ id: `labref${i}_${f.sha256.slice(0, 12)}`, scope: plan!.scope ?? '', blobSha256: f.sha256, toolCallIndex: f.toolCallIndex,
      selector: f.selector, target: f.target, path: f.path, lineCount: f.lineCount, content: f.content, redactorVersion: f.redactorVersion,
      redactedCount: f.redactedCount, sourceTool: f.sourceTool, serviceName: f.serviceName })),
    refusals: (plan?.refusals ?? []).map((r) => ({ toolCallIndex: r.toolCallIndex, selector: r.selector, target: r.target, path: r.path, refusal: r.refusal })),
    stats: plan?.stats ?? {},
  };
}

/** The store for a node: its frozen Harvester, read from the snapshot's stage artifacts. */
export function buildLabHeldStore(snap: Snapshot): LabHeldStore {
  const e = frozenHarvesterEntry(snap);
  const art = snap.childArtifacts.find((a) => a.executionId === e.executionId && a.name === 'result.json');
  if (!art) throw new Error(`L-1: the snapshot carries no result.json for the frozen Harvester execution ${e.executionId}`);
  return buildLabHeldStoreFromResult({ executionId: e.executionId, taskId: e.taskId, povId: snap.author.task.pov_id ?? null, resultJson: art.content,
    gitFileSourceLeg: !!snap.leg && isGitFileSourceLeg(snap.leg), deviceLeg: deviceLegOf(snap.leg as never) });
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

/**
 * G-HOLD-ID ($0, read-only): every Harvester execution production holds CAPTURE refs for, rebuilt through L-1 from its STORED
 * result.json, must reproduce the same (toolCallIndex, path, blobSha256) set. Keyed on the stored row's `redactorVersion`:
 * push 1's v2→v3 replay moved 0 held blobs, so a mismatch on either version is a lab (or capture) defect, never drift.
 */
export function heldIdentityCheck(runSql: (sql: string) => string): { executions: number; refs: number; equal: number; byVersion: Record<string, number>; mismatches: string[]; predatesDeviceLane: string[] } {
  // held-k8s (L-K-e): the owning leg (stage metadata harnessTaskId) decides the Git-source scope, as production's capture does.
  const rows = runSql(`SELECT json_build_object('executionId', r."executionId", 'startTime', e."startTime", 'taskId', e."taskId", 'povId', t.pov_id,
      'leg', (SELECT json_build_object('title', l.title, 'metadata', l.metadata, 'description', l.description, 'inputContext', l."inputContext") FROM stages s JOIN tasks l ON l.id = s.metadata->>'harnessTaskId' WHERE s.id = t.stage_id),
      'resultJson', (SELECT a.content FROM agent_artifacts a WHERE a."executionId" = r."executionId" AND a.name = 'result.json' ORDER BY a."createdAt" DESC LIMIT 1),
      'refs', json_agg(json_build_object('toolCallIndex', r."toolCallIndex", 'path', r.path, 'blobSha256', r."blobSha256", 'redactorVersion', r."redactorVersion") ORDER BY r."toolCallIndex", r.path))
    FROM held_file_refs r JOIN agent_executions e ON e.id = r."executionId" JOIN tasks t ON t.id = e."taskId"
    WHERE r.kind = 'CAPTURE' GROUP BY r."executionId", e."taskId", e."startTime", t.pov_id, t.stage_id;`).split('\n').filter(Boolean);
  const out = { executions: 0, refs: 0, equal: 0, byVersion: {} as Record<string, number>, mismatches: [] as string[], predatesDeviceLane: [] as string[] };
  for (const line of rows) {
    const r = JSON.parse(line) as { startTime?: string | null; executionId: string; taskId: string; povId: string | null; resultJson: string | null; leg: { title: string | null; metadata: unknown; description?: string | null; inputContext?: unknown } | null; refs: Array<{ toolCallIndex: number; path: string; blobSha256: string; redactorVersion: string }> };
    out.executions++;
    if (!r.resultJson) { out.mismatches.push(`${r.executionId}: no result.json`); continue; }
    const store = buildLabHeldStoreFromResult({ executionId: r.executionId, taskId: r.taskId, povId: r.povId, resultJson: r.resultJson, gitFileSourceLeg: !!r.leg && isGitFileSourceLeg(r.leg), deviceLeg: deviceLegOf(r.leg as never) });
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
