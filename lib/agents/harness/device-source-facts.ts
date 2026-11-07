/**
 * held-network step 3 batch 2b — the two Harvester facts on a Device-sources leg (network-provisioning), PURE.
 *
 *   deviceSourceReads   (P3, closes F-NW1's PLATFORM half) — "for each source the leg declares, which call read it?" Per device and
 *                       declared kind: the read call (tool-call index) or a named state (`not-read`, `read-failed`,
 *                       `result-truncated`, `empty-config`). Plus the declaration itself (source, or why there is none) and how
 *                       many device configuration reads the declaration does NOT cover (S-NOBLOCK: an undeclared read never
 *                       becomes a held base — this counts them).
 *   gitDeviceComparison (P5 / S3-C) — per device declaring BOTH a Git file and a device read: the mechanical comparison
 *                       (git-device-comparison.ts). A warning fact for the Architect and the leg Reviewer; gates nothing.
 *
 * Both read the execution's OWN tool calls as result.json carries them (`ctx.toolCalls`), through the SHIPPING extractor
 * (`extractDeclaredFiles` with the device-read scope, `live: false`) — the same definition of "a device configuration read" and "a
 * Git file read" that capture uses, never a second one. Facts, never verdicts: indices, states, counts.
 */
import { extractDeclaredFiles, type ExtractResult } from './held-bytes/extract';
import { PLATFORM_DEFAULT_DESCRIPTORS, DEVICE_READ_TARGET_PREFIX } from './held-bytes/descriptors';
import { buildDeviceReadScope, registrationsByDescriptorUrl } from './held-bytes/device-read-scope';
import type { LegDeviceSourcesResolution } from './device-sources-read';
import { assertNeverKind, type DeviceSourceLine } from './device-sources';
import { compareGitWithDevice, GIT_DEVICE_COMPARISON_METHOD, GIT_DEVICE_COMPARISON_VERSION } from './git-device-comparison';

export const DEVICE_SOURCE_READS_VERSION = 1;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
function argsOf(raw: unknown): Obj | null {
  if (isObj(raw)) return raw;
  if (typeof raw === 'string') { try { const p = JSON.parse(raw); return isObj(p) ? p : null; } catch { return null; } }
  return null;
}

interface CallView {
  index: number; service: string | null; serviceId: string | null; tool: string | null; args: Obj; ok: boolean; truncated: boolean;
}

/** Every `services` call, with the resolved service (envelope first), the SERVICE's own arguments and whether it succeeded. */
function serviceCalls(records: readonly unknown[]): CallView[] {
  const out: CallView[] = [];
  records.forEach((rec, index) => {
    if (!isObj(rec) || rec.tool !== 'services') return;
    const outer = argsOf(rec.arguments);
    if (!outer || (outer.action !== undefined && outer.action !== 'call')) return;
    const res = isObj(rec.result) ? rec.result : null;
    const first = res && Array.isArray(res.content) ? res.content[0] : null;
    const data = isObj(first) && first.type === 'data' && isObj(first.data) ? first.data : null;
    const meta = data && isObj(data.metadata) ? data.metadata : null;
    const inner = data && isObj(data.arguments) ? data.arguments : argsOf(outer.arguments) ?? {};
    const innerResult = data && isObj(data.result) ? data.result : null;
    const ok = rec.success !== false && !!res && res.isError !== true && !!data && data.success !== false
      && !(innerResult && innerResult.isError === true);
    out.push({
      index,
      service: data && typeof data.targetService === 'string' ? data.targetService : typeof outer.targetService === 'string' ? outer.targetService : null,
      serviceId: meta && typeof meta.targetServiceId === 'string' ? meta.targetServiceId : null,
      tool: data && typeof data.tool === 'string' ? data.tool : typeof outer.tool === 'string' ? outer.tool : null,
      args: inner, ok, truncated: !!res && res.truncated === true,
    });
  });
  return out;
}

/** Does a call's argument object name the device (a string value, or an element of an array value, equal to it)? */
function namesDevice(args: Obj, device: string): boolean {
  return Object.values(args).some((v) => v === device || (Array.isArray(v) && v.includes(device)));
}

import { maskQueryValues } from '@/lib/mcp/server/config/descriptor-fetch';

/** sec-ops batch-2b SF-4: a declared descriptor URL is stamped through the IF-2 masker (origin + path; query values masked; no
 *  userinfo, no fragment) — never verbatim. A service NAME is stamped as declared. An unparseable URL is never echoed. */
export function shownService(service: string): string {
  if (!/^https?:\/\//i.test(service)) return service;
  try { return maskQueryValues(new URL(service)); } catch { return '(unparseable descriptor URL)'; }
}

/** The services a declared service string resolves to in THIS execution: the name itself, or the rows registered from the URL. */
function serviceMatcher(records: readonly unknown[]) {
  const regs = registrationsByDescriptorUrl(records);
  return (declared: string, c: { service: string | null; serviceId: string | null }): boolean => {
    if (/^https?:\/\//i.test(declared)) {
      return (regs.get(declared) ?? []).some((r) => (r.serviceId && c.serviceId ? r.serviceId === c.serviceId : r.serviceName === c.service));
    }
    return c.service === declared;
  };
}

/** Config-sources push 0 (DESIGN v2 §2 item 0.2, execution-facts B1, 2026-11-04): D3's "a missing ref is `main`", applied to the READ
 *  RECORD on both sides. The call gate now forwards (and echoes) `ref:'main'` for an absent ref, and the texts pass the line's ref or
 *  `main` — so a line naming no ref must match a call carrying `main` (and `refs/heads/main`), or every unbranched git-file line reads
 *  `not-read` while every force stays right: a silently wrong fact the nets replay cannot see (stored calls carry no `ref`). */
function normalisedRef(ref: unknown): string {
  const r = typeof ref === 'string' && ref !== '' ? ref : 'main';
  // sec-ops PUSH0 S-2: both gates admit `refs/heads/<x>` for a pin on `<x>` (pinFromDeclaration), so the read record folds it the same way.
  return r.startsWith('refs/heads/') ? r.slice('refs/heads/'.length) : r;
}

function gitArgsMatch(e: Extract<DeviceSourceLine, { kind: 'git-file' }>, args: Obj): boolean {
  const p = typeof args.path === 'string' ? args.path.replace(/^\/+/, '') : null;
  return args.owner === e.owner && args.repo === e.repo && p === e.path && normalisedRef(args.ref) === normalisedRef(e.ref);
}

function declarationOf(sources: LegDeviceSourcesResolution): Obj {
  switch (sources.state) {
    case 'parsed': return { state: 'parsed', source: sources.source, grammarVersion: sources.grammarVersion, devices: new Set(sources.entries.map((e) => e.device)).size };
    case 'unparseable': return { state: 'unparseable', source: sources.source, grammarVersion: sources.grammarVersion, problem: sources.problem, lineIndex: sources.lineIndex };
    case 'conflict': return { state: 'conflict', grammarVersion: sources.grammarVersion };
    case 'absent': return { state: 'absent', grammarVersion: sources.grammarVersion };
    case 'could-not-check': return { state: 'could-not-check', grammarVersion: sources.grammarVersion, reason: sources.reason };
    // push 2 (O-2): the governing declaration is the immutable first-execution snapshot; these say why there is none to use.
    case 'snapshot-absent': case 'snapshot-unreadable': case 'snapshot-changed': return { state: sources.state, grammarVersion: sources.grammarVersion };
    default: return { state: 'not-device-source-leg' };
  }
}

function extractFor(sources: Extract<LegDeviceSourcesResolution, { state: 'parsed' }>, records: readonly unknown[]): ExtractResult {
  return extractDeclaredFiles(records, PLATFORM_DEFAULT_DESCRIPTORS, { gitFileSourceLeg: true, live: false, deviceRead: buildDeviceReadScope(sources, records) });
}

/** deviceSourceReads. `sources` is never `not-device-source-leg` here (the enrichment returns NOT_STAMPED first). */
export function computeDeviceSourceReads(sources: LegDeviceSourcesResolution, toolCalls: unknown): Obj {
  const declaration = declarationOf(sources);
  if (sources.state !== 'parsed') {
    return { version: DEVICE_SOURCE_READS_VERSION, checked: false, reason: `device-sources-${sources.state}`, declaration };
  }
  const records = Array.isArray(toolCalls) ? toolCalls : [];
  const ex = extractFor(sources, records);
  const calls = serviceCalls(records);
  const matches = serviceMatcher(records);
  const devices: Array<{ device: string; sources: Obj[] }> = [];
  let notRead = 0;
  for (const e of sources.entries) {
    let row = devices.find((d) => d.device === e.device);
    if (!row) { row = { device: e.device, sources: [] }; devices.push(row); }
    if (e.kind === 'command-package') { row.sources.push({ kind: 'command-package' }); continue; }
    let read: Obj;
    if (e.kind === 'device-read' || e.kind === 'live-read') { // execution-facts B2 site 4: `live-read` is a whole-config read too (evidence)
      const held = ex.files.find((f) => f.target === `${DEVICE_READ_TARGET_PREFIX}${e.device}` && matches(e.service, { service: f.serviceName, serviceId: f.serviceId }));
      const empty = ex.refusals.find((r) => r.refusal === 'device-config-empty' && typeof r.selector === 'string'
        && r.selector.split('/').includes(e.device) && matches(e.service, { service: r.serviceName, serviceId: r.serviceId }));
      const mine = calls.filter((c) => matches(e.service, c) && namesDevice(c.args, e.device));
      if (held) read = { state: 'whole-config', toolCallIndex: held.toolCallIndex };
      else if (empty) read = { state: 'empty-config', toolCallIndex: empty.toolCallIndex };
      else if (mine.some((c) => c.truncated)) read = { state: 'result-truncated', toolCallIndex: mine.find((c) => c.truncated)!.index };
      else if (mine.some((c) => !c.ok)) read = { state: 'read-failed', toolCallIndex: mine.find((c) => !c.ok)!.index };
      else read = { state: 'not-read', otherCallsNamingDevice: mine.length };
      row.sources.push({ kind: e.kind, service: shownService(e.service), read });
    } else if (e.kind === 'git-file') {
      const mine = calls.filter((c) => matches(e.service, c) && gitArgsMatch(e, c.args));
      const okCall = mine.find((c) => c.ok);
      if (okCall) read = { state: 'read', toolCallIndex: okCall.index, ...(okCall.truncated ? { resultTruncated: true } : {}) };
      else if (mine.length) read = { state: 'read-failed', toolCallIndex: mine[0].index };
      else read = { state: 'not-read' };
      row.sources.push({ kind: 'git-file', service: shownService(e.service), path: e.path, ref: e.ref, read });
    } else {
      return assertNeverKind(e);
    }
    if (read.state === 'not-read') notRead++;
  }
  const scope = buildDeviceReadScope(sources, records);
  return {
    version: DEVICE_SOURCE_READS_VERSION, checked: true, declaration, devices, notRead,
    undeclaredDeviceConfigReads: ex.refusals.filter((r) => r.refusal === 'device-not-declared' || r.refusal === 'device-service-not-declared').length,
    ...(scope.state === 'declared' && scope.unresolvedServices.length ? { unresolvedServices: scope.unresolvedServices.map(shownService) } : {}),
  };
}

/** gitDeviceComparison at the Harvester point. */
export function computeGitDeviceComparison(sources: LegDeviceSourcesResolution, toolCalls: unknown): Obj {
  const base = { version: GIT_DEVICE_COMPARISON_VERSION, method: GIT_DEVICE_COMPARISON_METHOD, point: 'harvester' };
  if (sources.state !== 'parsed') return { ...base, checked: false, reason: `device-sources-${sources.state}` };
  const both = [...new Set(sources.entries.map((e) => e.device))].filter((d) =>
    sources.entries.some((e) => e.device === d && e.kind === 'git-file') && sources.entries.some((e) => e.device === d && e.kind === 'device-read'));
  if (both.length === 0) return { ...base, checked: false, reason: 'no-device-declares-both-sources' };
  const records = Array.isArray(toolCalls) ? toolCalls : [];
  const ex = extractFor(sources, records);
  const calls = serviceCalls(records);
  const matches = serviceMatcher(records);
  const devices: Obj[] = [];
  for (const device of both) {
    const g = sources.entries.find((e) => e.device === device && e.kind === 'git-file') as Extract<DeviceSourceLine, { kind: 'git-file' }>;
    const dr = sources.entries.find((e) => e.device === device && e.kind === 'device-read') as Extract<DeviceSourceLine, { kind: 'device-read' }>;
    const gitFile = ex.files.find((f) => !f.target.startsWith(DEVICE_READ_TARGET_PREFIX) && matches(g.service, { service: f.serviceName, serviceId: f.serviceId })
      && gitArgsMatch(g, calls.find((c) => c.index === f.toolCallIndex)?.args ?? {}));
    const devFile = ex.files.find((f) => f.target === `${DEVICE_READ_TARGET_PREFIX}${device}` && matches(dr.service, { service: f.serviceName, serviceId: f.serviceId }));
    const gitRef = { service: shownService(g.service), path: g.path, ref: g.ref, ...(gitFile ? { toolCallIndex: gitFile.toolCallIndex } : {}) };
    if (!gitFile) { devices.push({ device, state: 'no-git-file-text', gitFile: gitRef }); continue; }
    if (!devFile) { devices.push({ device, state: 'no-device-config-text', gitFile: gitRef }); continue; }
    // v2: `r.state` is `compared` or a named hierarchy-form state (`hierarchy-form-not-parsed` / `hierarchy-forms-differ`, with the
    // two forms) — never a silent comparison of a text whose hierarchy the comparison cannot read.
    const r = compareGitWithDevice(gitFile.text, devFile.text);
    const { state, ...rest } = r; // `state` keeps its v1 key position (after `device`) — byte-stable stamps
    devices.push({ device, state, gitFile: gitRef, deviceRead: { service: shownService(dr.service), toolCallIndex: devFile.toolCallIndex }, ...rest });
  }
  return { ...base, checked: true, comparedDevices: devices.filter((d) => d.state === 'compared').length, devices };
}
