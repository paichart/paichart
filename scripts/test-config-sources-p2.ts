/**
 * Config sources STEP 3, slice P2 (plan v2.1 W1, W8, W10, W25, §13 A7 / A8 / B6) — the one capture helper, capture as an allow-list
 * on a declared leg, the unified force, the text-reverted state.
 *
 * The capture cases go through the REAL `prepareHeldCapture` (the pure half of capture) over stored tool-call records: the served
 * files are the stored run-2 harvest's own (`get_ingress_config`: operator-access.conf + otlp-ingress.conf; `get_otel_config`), the
 * Git reads have the stored gateway shape. No rule is copied. PURE: no DB.
 *
 * `W25_TABLE=1` prints the leg-state × file-kind table (the evidence pack's capture table) as markdown.
 *
 * Run: npm run test:config-sources   (third file of that script)
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveLegConfigSources, CONFIG_SOURCES_GRAMMAR_VERSION, type ConfigSourcesSnapshot } from '../lib/agents/harness/config-sources';
import {
  CONFIG_SOURCE_AWAITING_TEXT, captureScopesFor, carrierAppliesConfigForce, hasConfigSourcesSnapshotObject, isGitFileSourceLeg,
  legHasConfigDeclarationToGovern, resolveOwningLegProtocol, type OwningLegResolution,
} from '../lib/agents/harness/held-bytes/variant';
import { governingConfigSourcesAsOf, configSnapshotDecision, type GoverningConfigRow, type LegConfigSourcesResolution } from '../lib/agents/harness/config-sources-read';
import {
  withConfigSourcesScope, withDeclaredFilesScope, configSourceForce, configGitFileForce, configLabelCollisions, protocolDeclaresServiceFiles,
  DECLARED_FILE_CASES, DECLARED_SCOPE_REFUSALS, SERVED_FILE_EVIDENCE_ONLY, SERVICE_FILE_NOT_DECLARED,
} from '../lib/agents/harness/held-bytes/config-source-scope';
import { extractDeclaredFiles, type ExtractResult, type ExtractedFile } from '../lib/agents/harness/held-bytes/extract';
import { HANDLELESS_CAPTURE_REFUSALS, harvesterHandles } from '../lib/agents/harness/held-chain';
import { prepareHeldCapture, DECLARED_SCOPE_ROW_CAP } from '../lib/services/held-bytes-capture';
import { tableFromDeclarations } from '../lib/services/held-descriptor-table';
import { runLegPlatformDrift } from '../lib/services/platform-drift';
import { runPlatformDriftCalls } from '../lib/agents/harness/platform-drift-run';
import { gitLiveDriftMethodOf, gitLiveDriftCallsService } from '../lib/agents/harness/git-live-drift';
import { runLegFileSourceCompare } from '../lib/services/file-source-compare-run';
import { computeGitLiveDriftHarvesterFact, stampFileSourceCompare, stampPlatformDriftCalls } from '../lib/agents/harness/git-live-drift-enrichment';
import { computeConfigSourceReadsFact } from '../lib/agents/harness/config-source-facts-enrichment';
import { computeLiveEvidenceHarvesterFact } from '../lib/agents/harness/live-evidence-enrichment';
import { LIVE_EVIDENCE_MIN_VERSIONS, liveEvidenceVersionApplies } from '../lib/agents/harness/live-evidence';

const eq = (a: unknown, b: unknown, what = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
let passed = 0; let failed = 0;
const pending: Array<Promise<void>> = [];
function test(name: string, fn: () => void | Promise<void>) {
  const done = (e?: unknown) => { if (e === undefined) { passed++; console.log(`✅ ${name}`); } else { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); } };
  try { const r = fn(); if (r && typeof (r as Promise<void>).then === 'function') pending.push((r as Promise<void>).then(() => done(), (e) => done(e ?? new Error('rejected')))); else done(); }
  catch (e) { done(e); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
type Rec = Record<string, unknown>;
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

process.env.HELD_BYTES_CAPTURE_ENABLED = 'true';

const OBS = 'observability-config-protocol';
const K8S = 'kubernetes-gitops-protocol';
const NONE: readonly string[] = [];              // "every table row's text has shipped"
const SHIPPED = CONFIG_SOURCE_AWAITING_TEXT;     // what production passes today

const O_GIT = 'obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml';
const O_LIVE = 'obs-otelcol: live-read — service observability-readonly';
const O_HELD = 'obs-ingress.otlp-ingress.conf: service-held — service observability-readonly';
const block = (lines: string[]) => `Change it.\n\n## Config sources\n${lines.join('\n')}\n\n## Notes\nx\n`;
const row = (r: Partial<GoverningConfigRow>): GoverningConfigRow => ({ description: null, contract: null, snapshot: null, protocolStamped: true, ...r });
const snapOf = (lines: string[]): ConfigSourcesSnapshot => {
  const d = configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: block(lines), interfaceContract: null, takenAt: 't' }, NONE);
  assert(d.action === 'write', `the fixture block did not snapshot: ${JSON.stringify(d)}`);
  return d.snapshot;
};
const governed = (lines: string[], awaiting: readonly string[] = NONE): LegConfigSourcesResolution =>
  governingConfigSourcesAsOf(row({ description: block(lines), snapshot: snapOf(lines) }), OBS, awaiting);
const DECL = [O_GIT, O_LIVE, O_HELD];
const PARSED = governed(DECL);
const obsLeg = (metadata: Rec = {}) => ({ title: 'x', metadata: { protocol: OBS, ...metadata } });
const legRes = (over: Partial<Extract<OwningLegResolution, { kind: 'leg' }>> = {}): OwningLegResolution =>
  ({ kind: 'leg', legId: 'leg1', heldCapable: true, ownStageId: 's1', ...over } as OwningLegResolution);

// ── stored records ──
const RUN2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'quote-fidelity', 'run2-harvest.json'), 'utf8'));
const INGRESS: Rec = RUN2.toolCalls[1]; const OTEL: Rec = RUN2.toolCalls[2];
const ingressWith = (files: Rec): Rec => {
  const rec = clone(INGRESS);
  (((((rec.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent as Rec).files = files;
  return rec;
};
const GH_REV = '0ea432e751cc622ffab91d7a90386c66cadf8733';
const ghRecord = (p: string, text = 'receivers: {}\n'): Rec => {
  const args = { owner: 'paichart', repo: 'paichart-configs', path: p };
  return { tool: 'services', success: true, arguments: { action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: args },
    result: { content: [{ type: 'data', data: { success: true, targetService: 'github-service', tool: 'get_file_contents', arguments: args,
      result: { content: [{ type: 'text', text: 'successfully downloaded text file' },
        { type: 'resource', resource: { uri: `repo://paichart/paichart-configs/sha/${GH_REV}/contents/${p}`, mimeType: 'text/plain; charset=utf-8', text } }] },
      metadata: { targetServiceId: 'github-service' } } }] } };
};
const GIT_DECLARED = ghRecord('observability/otelcol/config.yaml');
const GIT_UNDECLARED = ghRecord('k8s/sample-workloads.yaml', 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: trading\n');
const logger = { warn: () => undefined, info: () => undefined };
const TASK = { id: 'cmtaskP2', povId: 'cmpovP2' };
type Scopes = { gitFileSourceLeg: boolean; configSources: LegConfigSourcesResolution | null; configSourceProtocol: string | null };
const capture = (records: Rec[], s: Scopes) => {
  const plan = prepareHeldCapture({ toolCallResults: records, task: TASK, logger, gitFileSourceLeg: s.gitFileSourceLeg,
    ...(s.configSources ? { configSources: s.configSources, configSourceProtocol: s.configSourceProtocol } : {}) });
  const files = (plan?.files ?? []) as unknown as Array<{ target: string; path: string }>;
  const refusals = (plan?.refusals ?? []) as unknown as Array<{ target: string | null; path: string | null; refusal: string; detail?: Rec }>;
  return { plan, held: files.map((f) => `${f.target} ${f.path}`), refusals };
};
const scopesFor = (g: LegConfigSourcesResolution | null, marker = true): Scopes =>
  captureScopesFor(legRes(marker ? { configSourceProtocol: OBS } : {}), g);

const OTLP = ['obs-ingress', '/etc/nginx/conf.d/otlp-ingress.conf']; const OPER = ['obs-ingress', '/etc/nginx/conf.d/operator-access.conf'];
const OTELF = ['obs-otelcol', '/etc/otelcol/config.yaml']; const GITF = ['github:paichart:paichart-configs', '/observability/otelcol/config.yaml'];

console.log('── W1: the one capture helper ──');
test('CS1 captureScopesFor: no resolved leg takes nothing; a name-list protocol keeps its Git lane by name; observability only with a governing scope', () => {
  for (const leg of [null, undefined, { kind: 'no-leg' } as OwningLegResolution, { kind: 'could-not-check' } as OwningLegResolution]) {
    eq(captureScopesFor(leg, PARSED), { gitFileSourceLeg: false, configSources: null, configSourceProtocol: null }, `${JSON.stringify(leg)}: `);
  }
  // Kubernetes / Terraform (`forced` rows) and network (no Config row): by name, with or without a scope
  const k8sParsed = { state: 'parsed' } as { state: string };
  eq(captureScopesFor(legRes({ gitFileSource: true, configSourceProtocol: K8S }), k8sParsed), { gitFileSourceLeg: true, configSources: k8sParsed, configSourceProtocol: K8S }, 'k8s, scope: ');
  eq(captureScopesFor(legRes({ gitFileSource: true, configSourceProtocol: K8S }), null).gitFileSourceLeg, true, 'k8s, no scope read: ');
  eq(captureScopesFor(legRes({ gitFileSource: true }), null), { gitFileSourceLeg: true, configSources: null, configSourceProtocol: null }, 'network / a k8s leg before its text: ');
  eq(captureScopesFor(legRes({ gitFileSource: false }), null).gitFileSourceLeg, false, 'a leg of no Git protocol: ');
  // observability: the lane follows the SCOPE, never the name
  eq(captureScopesFor(legRes({ configSourceProtocol: OBS }), null).gitFileSourceLeg, false, 'obs, no scope: ');
  eq(captureScopesFor(legRes({ configSourceProtocol: OBS }), { state: 'not-config-source-leg' }).gitFileSourceLeg, false, 'obs, a leg that declares nothing: ');
  for (const st of ['parsed', 'unparseable', 'conflict', 'snapshot-absent', 'snapshot-unreadable', 'snapshot-changed', 'snapshot-text-reverted', 'could-not-check']) {
    eq(captureScopesFor(legRes({ configSourceProtocol: OBS }), { state: st }), { gitFileSourceLeg: true, configSources: { state: st }, configSourceProtocol: OBS }, `obs, ${st}: `);
  }
  // even if the metadata twin said yes, an observability leg with no scope has no lane (the helper overrides the name bit)
  eq(captureScopesFor(legRes({ gitFileSource: true, configSourceProtocol: OBS }), null).gitFileSourceLeg, false, 'obs, twin true, no scope: ');
});
test('CS2 the metadata twin: observability is a Git file source only when its text has shipped AND the leg carries a snapshot OBJECT', () => {
  const snap = snapOf(DECL);
  eq([isGitFileSourceLeg(obsLeg(), NONE), isGitFileSourceLeg(obsLeg({ configSourcesSnapshot: snap }), NONE)], [false, true], 'shipped: ');
  eq([isGitFileSourceLeg(obsLeg(), SHIPPED), isGitFileSourceLeg(obsLeg({ configSourcesSnapshot: snap }), SHIPPED)], [false, false], 'awaiting: ');
  for (const v of [null, 'x', 1, true, [], [snap]]) {
    eq(hasConfigSourcesSnapshotObject({ configSourcesSnapshot: v }), false, `${JSON.stringify(v)}: `);
    eq(isGitFileSourceLeg(obsLeg({ configSourcesSnapshot: v }), NONE), false, `twin, ${JSON.stringify(v)}: `);
  }
  for (const aw of [NONE, SHIPPED]) eq(isGitFileSourceLeg({ title: 'x', metadata: { protocol: K8S } }, aw), true, 'k8s by name: ');
});
test('CS3 both capture call sites ask the helper, and neither decides a switch by hand', () => {
  const core = fs.readFileSync(path.join(__dirname, '../lib/services/execution-core.ts'), 'utf8');
  const rescue = fs.readFileSync(path.join(__dirname, '../lib/services/execution-completion-anchored.ts'), 'utf8');
  assert(core.includes('const captureScopes = captureScopesFor(owningLeg, legConfigSources);') && core.includes('gitFileSourceLeg: captureScopes.gitFileSourceLeg'), 'the core does not use the helper');
  assert(!/gitFileSourceLeg:\s*\(owningLeg/.test(core) && !core.includes('heldCaptureTakesConfigScope'), 'the core still decides a capture switch by hand');
  assert(rescue.includes('const rescueScopes = captureScopesFor<LegConfigSourcesResolution>(null, null);') && rescue.includes('gitFileSourceLeg: rescueScopes.gitFileSourceLeg'), 'the rescue does not use the helper');
  // the rescue reads no leg: it runs only for a PIPELINE task, for which the core resolves no owning leg either
  assert(core.includes("task.type === 'PIPELINE' ? null : await resolveOwningLegProtocol(prisma, task)"), 'the core now resolves an owning leg for a PIPELINE task — the rescue must then resolve one too');
  assert(!rescue.includes('resolveOwningLegProtocol') && !rescue.includes('readLegConfigSources'), 'the rescue reads a leg row');
});

test('CS4 (review, architectural F2 — plan §13.D AR C-3 as reworded after A7): twin true ⇒ the helper\'s Git lane is on; helper on and twin off ⇒ the scope is not `parsed` (nothing held)', async () => {
  // MI-13 (`_gitsrcleg`) and the lab stand on the metadata TWIN; capture asks the HELPER. They may differ only where nothing is held.
  const db = { task: { findUnique: async () => null }, stage: { findUnique: async () => null } };
  const snap = snapOf(DECL);
  type RowC = { name: string; metadata: Rec; awaiting: readonly string[]; row: Partial<GoverningConfigRow> | 'unread' | 'no-leg' };
  const rows: RowC[] = [
    { name: 'no block', metadata: {}, awaiting: NONE, row: {} },
    { name: 'no block, row awaiting', metadata: {}, awaiting: SHIPPED, row: {} },
    { name: 'a parsed declaration', metadata: { configSourcesSnapshot: snap }, awaiting: NONE, row: { description: block(DECL), snapshot: snap } },
    { name: 'not parsed (snapshot-changed)', metadata: { configSourcesSnapshot: snap }, awaiting: NONE, row: { description: block([O_HELD]), snapshot: snap } },
    { name: 'a block added to a leg with no snapshot', metadata: {}, awaiting: NONE, row: { description: block(DECL) } },
    { name: 'a snapshot with the protocol awaiting its text', metadata: { configSourcesSnapshot: snap }, awaiting: SHIPPED, row: { description: block(DECL), snapshot: snap } },
    { name: 'could-not-check (the leg row could not be read)', metadata: { configSourcesSnapshot: snap }, awaiting: NONE, row: 'unread' },
    { name: 'the owning-leg read failed (A8)', metadata: { configSourcesSnapshot: snap }, awaiting: NONE, row: 'no-leg' },
  ];
  for (const r of rows) {
    const leg = obsLeg(r.metadata);
    const twin = isGitFileSourceLeg(leg, r.awaiting);
    const res: OwningLegResolution = r.row === 'no-leg' ? ({ kind: 'could-not-check', reason: 'read-threw' } as OwningLegResolution)
      : await resolveOwningLegProtocol(db as never, { id: 'L', type: 'PIPELINE', ...leg } as never, r.awaiting);
    const marker = (res.kind === 'self' || res.kind === 'leg') && !!res.configSourceProtocol;
    const scope: LegConfigSourcesResolution | null = !marker ? null
      : r.row === 'unread' ? { state: 'could-not-check', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION, reason: 'read-threw' }
      : governingConfigSourcesAsOf(row(r.row as Partial<GoverningConfigRow>), OBS, r.awaiting);
    const helper = captureScopesFor(res, scope);
    // the resolution's own name bit IS the twin (review, architectural F8: the resolver passes its awaiting list through)
    if (res.kind === 'self' || res.kind === 'leg') eq(res.gitFileSource === true, twin, `${r.name}: the resolution's Git bit is not the twin: `);
    if (r.row === 'no-leg') {
      // A8, the recorded exception: no leg resolved ⇒ the helper takes NOTHING (lane off, no scope) though the twin may read true —
      // and nothing of the Git lane is held there (the W25 table's last row: "no row")
      eq([helper.gitFileSourceLeg, helper.configSources], [false, null], `${r.name}: `);
      continue;
    }
    if (twin) assert(helper.gitFileSourceLeg, `${r.name}: the twin says Git file source, the helper's lane is OFF`);
    if (helper.gitFileSourceLeg && !twin) assert(helper.configSources !== null && helper.configSources.state !== 'parsed', `${r.name}: the helper's lane is on, the twin is off, and the scope is ${helper.configSources?.state} — a Git file could be HELD on a leg MI-13 does not count as a Git file source`);
  }
  // Kubernetes (a name-list protocol): twin and helper agree whatever the scope
  for (const aw of [NONE, SHIPPED]) {
    const k = { title: 'x', metadata: { protocol: K8S } };
    const res = await resolveOwningLegProtocol(db as never, { id: 'K', type: 'PIPELINE', ...k } as never, aw);
    eq([isGitFileSourceLeg(k, aw), captureScopesFor(res, null).gitFileSourceLeg], [true, true], 'kubernetes: ');
  }
});
test('CS5 (review, architectural F8) no lib/ module asks the bare shipped-text rule: `governingConfigSources(` is called ONLY inside `governingConfigSourcesAsOf` — a new caller of the bare rule would skip the text-reverted state', () => {
  const root = path.join(__dirname, '..', 'lib');
  const hits: string[] = [];
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(f); continue; }
    if (!/\.(ts|tsx|js)$/.test(e.name)) continue;
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const m of src.matchAll(/(?<![A-Za-z0-9_])governingConfigSources\(/g)) hits.push(`${path.relative(root, f)}@${src.slice(Math.max(0, (m.index ?? 0) - 16), m.index).replace(/\s+/g, ' ')}`);
  } };
  walk(root);
  eq(hits.map((h) => h.split('@')[0]), ['agents/harness/config-sources-read.ts', 'agents/harness/config-sources-read.ts'], 'files that name the bare rule: ');
  assert(hits.some((h) => h.endsWith('export function ')) && hits.some((h) => /return $/.test(h)), `the two sites must be the definition and the one call inside governingConfigSourcesAsOf: ${JSON.stringify(hits)}`);
  const read = fs.readFileSync(path.join(root, 'agents/harness/config-sources-read.ts'), 'utf8');
  assert(/export function governingConfigSourcesAsOf\([\s\S]*?\n  return governingConfigSources\(row, protocol\);\n\}/.test(read), 'the one call is not the last line of governingConfigSourcesAsOf');
});

console.log('── A7: a snapshot on a leg whose text is not live ──');
test('TR1 governing state: awaiting row + a snapshot object ⇒ `snapshot-text-reverted`, whatever the snapshot or the description says', () => {
  const snap = snapOf(DECL);
  eq(governingConfigSourcesAsOf(row({ description: block(DECL), snapshot: snap }), OBS, SHIPPED), { state: 'snapshot-text-reverted', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION }, 'a valid snapshot: ');
  eq(governingConfigSourcesAsOf(row({ description: null, snapshot: snap }), OBS, SHIPPED).state, 'snapshot-text-reverted', 'the block was removed since: ');
  eq(governingConfigSourcesAsOf(row({ description: block(DECL), snapshot: { junk: 1 } }), OBS, SHIPPED).state, 'snapshot-text-reverted', 'an unreadable snapshot object: ');
  eq(governingConfigSourcesAsOf(row({ description: block(DECL), snapshot: snap, protocolStamped: false }), OBS, SHIPPED).state, 'snapshot-text-reverted', 'no protocol stamp: ');
  // no snapshot object ⇒ the leg is not governed at all while the row awaits (today's behaviour for all 79 stored legs)
  for (const s of [null, undefined, 'x', []]) eq(governingConfigSourcesAsOf(row({ description: block(DECL), snapshot: s }), OBS, SHIPPED), { state: 'not-config-source-leg' }, `${JSON.stringify(s)}: `);
  // a `forced` protocol's awaiting row is unchanged: not governed (the recorded scope limit)
  eq(governingConfigSourcesAsOf(row({ description: block(DECL), snapshot: snap }), K8S, [K8S]), { state: 'not-config-source-leg' }, 'a forced row awaiting: ');
  // with the text shipped the same row governs normally
  eq(governingConfigSourcesAsOf(row({ description: block(DECL), snapshot: snap }), OBS, NONE).state, 'parsed', 'shipped: ');
});
test('TR2 the leg is READ and FORCED in the awaiting state: the resolution marker, the carrier gate, the force name', () => {
  const snap = snapOf(DECL);
  eq([legHasConfigDeclarationToGovern(obsLeg(), SHIPPED), legHasConfigDeclarationToGovern(obsLeg({ configSourcesSnapshot: snap }), SHIPPED)], [false, true], 'governed: ');
  eq([carrierAppliesConfigForce(obsLeg(), SHIPPED), carrierAppliesConfigForce(obsLeg({ configSourcesSnapshot: snap }), SHIPPED)], [false, true], 'carrier gate: ');
  eq(legHasConfigDeclarationToGovern({ title: 'x', metadata: { protocol: K8S, configSourcesSnapshot: snap } }, [K8S]), false, 'a forced row awaiting is not governed: ');
  eq(configSourceForce({ state: 'snapshot-text-reverted', grammarVersion: 2 }, [{ target: 'obs-ingress', path: '/etc/nginx/conf.d/otlp-ingress.conf' }]),
    { reason: 'config-sources-snapshot-text-reverted' }, 'the force: ');
});
test('TR3 the resolution carries `configSourceProtocol` for a text-reverted leg, and not for an undeclared one', async () => {
  const db = { task: { findUnique: async () => null }, stage: { findUnique: async () => null } };
  const self = async (metadata: Rec) => resolveOwningLegProtocol(db as never, { id: 't1', type: 'PIPELINE', title: 'x', metadata: { protocol: OBS, ...metadata }, stage_id: null } as never, SHIPPED);
  const a = await self({}); const b = await self({ configSourcesSnapshot: snapOf(DECL) });
  eq([(a as Rec).configSourceProtocol ?? null, (b as Rec).configSourceProtocol ?? null], [null, OBS], 'marker: ');
});

test('TR4 (coordinator ruling 6 — a SECURITY property; RE-PROVEN at STEP 3 P3 with the observability version row present): on a text-reverted leg no held byte leaves the platform, nothing is compared, and every fact that stamps says so by the state\'s own name', async () => {
  const reverted = governed(DECL, SHIPPED);
  eq(reverted.state, 'snapshot-text-reverted', 'fixture: ');
  // (1) the platform's compare CALL: every combination of the other inputs that could let it through — never called, no record
  let called = 0;
  const call = async () => { called++; return { kind: 'refused' } as never; };
  const held = [{ target: OTLP[0], path: OTLP[1], content: 'server {}\n', sha256: 'a'.repeat(64) }];
  for (const versionApplies of [true, false]) for (const protocol of [OBS, K8S, null]) {
    const out = await runLegPlatformDrift({ sources: reverted, isHarvester: true, versionApplies, heldFiles: held, toolCalls: [INGRESS, OTEL],
      runOwnerId: 'u1', executionId: 'e1', logger, call, protocol });
    eq([out ?? null, called], [null, 0], `versionApplies ${versionApplies}, protocol ${protocol}: `);
  }
  // THREE layers hold this, each pinned on its own (a mutation of one alone cannot make a call — so each is asserted directly):
  //   outer — `runLegPlatformDrift` returns before anything unless the declaration is `parsed` (the source line, since behaviour cannot show it);
  //   guard — the no-call guard (P3, plan W4): a call is made only for a `service-call` protocol, and observability is not one;
  //   inner — `runPlatformDriftCalls` itself returns null on a declaration that is not `parsed`, with no call.
  const driftSrc = fs.readFileSync(path.join(__dirname, '../lib/services/platform-drift.ts'), 'utf8');
  assert(driftSrc.includes("if (!input.isHarvester || !input.versionApplies || !input.sources || input.sources.state !== 'parsed') return undefined;"), 'the outer guard of the platform drift call changed — re-read coordinator ruling 6');
  assert(driftSrc.includes('if (!gitLiveDriftCallsService(input.protocol)) return undefined;'), 'the no-call guard of the platform drift call changed — re-read plan W4');
  eq([await runPlatformDriftCalls({ sources: reverted, heldFiles: held, toolCalls: [INGRESS, OTEL], redactedMarker: '<<R>>', call }), called], [null, 0], 'the inner runner on a text-reverted declaration: ');
  // a PARSED observability declaration makes no service call either: its method is one the platform computes itself
  eq([gitLiveDriftMethodOf(OBS), gitLiveDriftCallsService(OBS), gitLiveDriftCallsService(K8S)], ['file-ordered-lines/1', false, true], 'the method rows: ');
  eq([await runLegPlatformDrift({ sources: PARSED, isHarvester: true, versionApplies: true, heldFiles: held, toolCalls: [], runOwnerId: 'u1', executionId: 'e1', logger, call, protocol: OBS }) ?? null, called], [null, 0], 'a parsed observability declaration: ');
  // (2) THE VERSION ROW IS PRESENT NOW (P3) — an execution composed at 1.12.0 can persist after a revert of the text. So the version is
  // NOT what keeps this leg quiet: the declaration's STATE is. The platform's file comparison is made ONLY on `parsed`:
  eq(LIVE_EVIDENCE_MIN_VERSIONS[OBS], '1.12.0', 'the observability version row: ');
  eq([liveEvidenceVersionApplies({ delta: { name: OBS, version: '1.11.0' } }), liveEvidenceVersionApplies({ delta: { name: OBS, version: '1.12.0' } })], [false, true], 'version keying: ');
  for (const state of [reverted, governed(DECL, NONE)]) {
    const rec = runLegFileSourceCompare({ sources: state, protocol: OBS, isHarvester: true, versionApplies: true, plan: { files: [], refusals: [] }, evidence: null, toolCalls: [INGRESS, OTEL], executionId: 'e1', logger });
    eq(rec === undefined, state.state !== 'parsed', `a compare record is built only on a parsed declaration (${state.state}): `);
  }
  // …and the three facts, through the SHIPPING enrichments at 1.12.0 on the text-reverted leg: each stamps `checked:false` by the
  // state's own name — no file entry, no quoted line, no sha — and the record net stamps nothing.
  const ctx = { prisma: {} as never, task: { id: 't', type: 'ACTION', metadata: {}, inputContext: null }, agentRole: 'infra_state_harvester', harnessMode: null, finalResponse: '',
    stageId: null, programTier: false, toolCalls: [INGRESS, OTEL], protocolInjection: { delta: { name: OBS, version: '1.12.0' } },
    owningLeg: async () => legRes({ configSourceProtocol: OBS }), configSources: async () => reverted,
    children: async () => [], contractApplicability: async () => null } as never;
  const want = { checked: false, reason: 'config-sources-snapshot-text-reverted' };
  const drift = await computeGitLiveDriftHarvesterFact(ctx) as Rec;
  eq([drift.checked, drift.reason, drift.method, 'files' in drift], [want.checked, want.reason, 'file-ordered-lines/1', false], 'gitLiveDrift: ');
  const reads = await computeConfigSourceReadsFact(ctx) as Rec;
  eq([reads.checked, reads.reason, 'items' in reads, 'undeclared' in reads], [want.checked, want.reason, false, false], 'configSourceReads: ');
  const live = await computeLiveEvidenceHarvesterFact(ctx) as Rec;
  eq([live.checked, live.reason], [want.checked, want.reason], 'liveEvidence: ');
  eq(Object.keys(await stampFileSourceCompare(ctx)).length, 0, 'the record net stamps nothing off a parsed declaration: ');
  eq(Object.keys(await stampPlatformDriftCalls(ctx)).length, 0, 'no platform call record: ');
});

console.log('── W8: capture is an allow-list on a declared leg (the real prepareHeldCapture) ──');
// The eight file kinds, each as the record(s) that produce it and the (target, path) to look for.
const ingressFiles = ((((((INGRESS.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent as Rec).files) as Rec;
const KEYFILE = ingressWith({ ...ingressFiles, 'server.key': 'not a key, only the name\n' });
const RECORDS = [GIT_DECLARED, GIT_UNDECLARED, INGRESS, OTEL];
/** One cell: what happened to the file at (target, path). */
const cell = (c: ReturnType<typeof capture>, [target, p]: string[]): string => {
  if (c.held.includes(`${target} ${p}`)) return 'HELD';
  const r = c.refusals.find((x) => x.target === target && x.path === p);
  if (r) return `${r.refusal}${r.detail && typeof r.detail.case === 'string' ? ` (${r.detail.case})` : ''}`;
  return 'no row';
};
const gitRefusals = (c: ReturnType<typeof capture>) => c.refusals.filter((r) => r.refusal === 'git-file-not-declared').length;

test('AL1 a leg that declares nothing (and every leg of another protocol): the SAME object back — nothing moves', () => {
  const ex = extractDeclaredFiles(clone(RECORDS), undefined, { gitFileSourceLeg: false });
  for (const s of [null, undefined, { state: 'not-config-source-leg' } as LegConfigSourcesResolution]) assert(withDeclaredFilesScope(ex, s, RECORDS, OBS) === ex, 'no scope: a new object');
  // a Kubernetes or Terraform declaration: the protocol's block cannot name a service file ⇒ unchanged, whatever its state
  assert(!protocolDeclaresServiceFiles(K8S) && !protocolDeclaresServiceFiles('terraform-iac-protocol') && protocolDeclaresServiceFiles(OBS), 'which protocols name service files');
  for (const proto of [K8S, 'terraform-iac-protocol']) assert(withDeclaredFilesScope(ex, PARSED, RECORDS, proto) === ex, `${proto}: a new object`);
  // STEP 3 P3 CHANGED THIS PIN DELIBERATELY (P2 reviews: sec-ops F4 / architectural F1; LL-CS-116).
  //   BEFORE P3: a governing scope with NO protocol (null / undefined) was returned unchanged — "no protocol" meant "no allow-list", so
  //              a caller that passed the scope and forgot its protocol held files production refuses.
  //   AFTER  P3: a governing scope with no protocol is judged as the STRICTEST protocol — the allow-list is ON (fail closed).
  for (const proto of [null, undefined]) {
    const out = withDeclaredFilesScope(ex, PARSED, RECORDS, proto);
    assert(out !== ex && out.files.every((f) => f.target.startsWith('github:') || PARSED.state !== 'parsed' || out.refusals.length > ex.refusals.length), `${proto}: a governing scope without its protocol must NOT pass unchanged`);
  }
  // through capture: the three served files are held, the Git reads are outside every lane
  const c = capture(clone(RECORDS), scopesFor(null, false));
  eq([cell(c, OTLP), cell(c, OPER), cell(c, OTELF), cell(c, GITF), c.refusals.length], ['HELD', 'HELD', 'HELD', 'no row', 0], 'no block: ');
});
test('AL2 a declared leg: each file is claimed by exactly one rule', () => {
  const c = capture(clone(RECORDS), scopesFor(PARSED));
  eq(cell(c, GITF), 'HELD', 'the declared Git file: ');
  eq(gitRefusals(c), 1, 'the undeclared Git file (git-file-not-declared, no identity): ');
  eq(cell(c, OTLP), 'HELD', 'the declared service-held file: ');
  eq(cell(c, OTELF), SERVED_FILE_EVIDENCE_ONLY, 'the served copy of a Git-based label with a live-read line: ');
  eq(cell(c, OPER), `${SERVICE_FILE_NOT_DECLARED} (no-label)`, 'an undeclared sibling the same call returned: ');
  eq(c.held.length, 2, 'held: ');
});
test('AL3 wrong service, a Git base with no live-read line, a never-held name', () => {
  const ex = extractDeclaredFiles(clone([INGRESS, OTEL]), undefined, { gitFileSourceLeg: true });
  // the same (target, path) from ANOTHER service than the line names
  const other: ExtractResult = { ...ex, files: ex.files.map((f) => ({ ...f, serviceName: 'other-readonly', serviceId: 'other-id' } as ExtractedFile)) };
  const w = withDeclaredFilesScope(other, PARSED, [INGRESS, OTEL], OBS);
  const byPath = (r: ExtractResult, p: string) => r.refusals.filter((x) => x.path === p).map((x) => [x.refusal, x.detail ?? null]);
  eq(byPath(w, OTLP[1]), [[SERVICE_FILE_NOT_DECLARED, { case: 'wrong-service' }]], 'service-held from another service: ');
  eq(byPath(w, OTELF[1]), [[SERVICE_FILE_NOT_DECLARED, { case: 'wrong-service' }]], 'evidence from another service: ');
  eq(w.files.length, 0, 'nothing held from the wrong service: ');
  // a label with a Git base and NO live-read line: the served copy is not evidence, it is undeclared
  assert(PARSED.state === 'parsed', 'fixture');
  const noLive = { ...PARSED, entries: PARSED.entries.filter((e) => e.kind !== 'live-read') } as LegConfigSourcesResolution;
  eq(byPath(withDeclaredFilesScope(ex, noLive, [INGRESS, OTEL], OBS), OTELF[1]), [[SERVICE_FILE_NOT_DECLARED, { case: 'label-has-git-base-no-live-read' }]], 'no live-read line: ');
  // a never-held NAME keeps the never-held refusal capture already gives it (it is not relabelled by the scope)
  const k = capture([clone(KEYFILE)], scopesFor(PARSED));
  const keyCell = cell(k, ['obs-ingress', '/etc/nginx/conf.d/server.key']);
  const plain = cell(capture([clone(KEYFILE)], scopesFor(null, false)), ['obs-ingress', '/etc/nginx/conf.d/server.key']);
  assert(keyCell !== 'HELD' && keyCell !== 'no row' && !DECLARED_SCOPE_REFUSALS.has(keyCell.split(' ')[0]), `the key-named file: ${keyCell}`);
  eq(keyCell, plain, 'the same never-held name on a declared leg as on an undeclared one: ');
});
test('AL4 a declaration that is not `parsed` holds NOTHING, by name; text-reverted has its own case', () => {
  const states: Array<[string, LegConfigSourcesResolution, string]> = [
    ['unparseable', governingConfigSourcesAsOf(row({ description: block(['obs-otelcol: nonsense']) }), OBS, NONE), 'declaration-not-parsed'],
    ['snapshot-changed', governingConfigSourcesAsOf(row({ description: block([O_HELD]), snapshot: snapOf(DECL) }), OBS, NONE), 'declaration-not-parsed'],
    ['could-not-check', { state: 'could-not-check', grammarVersion: 2, reason: 'read-threw' }, 'declaration-not-parsed'],
    ['snapshot-text-reverted', governed(DECL, SHIPPED), 'text-reverted'],
  ];
  for (const [name, g, kase] of states) {
    assert(g.state !== 'parsed' && g.state !== 'not-config-source-leg', `${name}: the fixture governs as ${g.state}`);
    const c = capture(clone(RECORDS), scopesFor(g));
    eq(c.held, [], `${name} held: `);
    eq([cell(c, OTLP), cell(c, OPER), cell(c, OTELF)], Array(3).fill(`${SERVICE_FILE_NOT_DECLARED} (${kase})`), `${name} served files: `);
    eq(gitRefusals(c), 2, `${name} Git files refused by name: `);
  }
  eq([...DECLARED_FILE_CASES], ['no-label', 'label-has-git-base-no-live-read', 'wrong-service', 'declaration-not-parsed', 'text-reverted'], 'the closed set: ');
});
test('AL5 a served key that is not a legal label is dropped and counted — no row, and its text is in no row and no log', () => {
  // a key the extractor ADMITS as a path (no slash, no dot segment) and that is not a legal label: a space, and over-long
  const HOSTILE = 'has space ' + 'x'.repeat(300) + '.conf';
  const logs: string[] = [];
  const sc = scopesFor(PARSED);
  const log = (o: Record<string, unknown>, m: string) => { logs.push(JSON.stringify(o) + m); };
  const plan = prepareHeldCapture({ toolCallResults: [ingressWith({ ...ingressFiles, [HOSTILE]: 'x\n' })], task: TASK, logger: { warn: log, info: log },
    gitFileSourceLeg: sc.gitFileSourceLeg, configSources: sc.configSources, configSourceProtocol: sc.configSourceProtocol });
  const all = JSON.stringify(plan) + logs.join('');
  assert(!all.includes('x'.repeat(40)), 'the hostile key reached a row or a log');
  assert(logs.some((l) => l.includes('"serviceKeyNotALabel":1')), `the dropped key is not counted in the log: ${logs.join(' | ').slice(0, 300)}`);
  eq((plan as unknown as { stats: Rec }).stats.serviceKeyNotALabel, 1, 'the operator count on the plan stats: ');
});
test('AL6 the scope rows are NOT held candidates: the held counters are those of the files alone, and the rows have their own bound', () => {
  // E3: with the scope, held bytes and the held count are exactly those of the files held
  const declared = capture(clone(RECORDS), scopesFor(PARSED));
  const stats = (declared.plan as unknown as { stats: Rec }).stats;
  const heldFiles = (declared.plan as unknown as { files: Array<{ byteLength?: number }> }).files;
  eq(stats.held, 2, 'held: ');
  if (heldFiles.every((f) => typeof f.byteLength === 'number')) eq(stats.heldBytes, heldFiles.reduce((n, f) => n + (f.byteLength as number), 0), 'held bytes are the held files\' alone: ');
  eq(DECLARED_SCOPE_ROW_CAP, 40, 'the row bound is the sec-ops ruling\'s number (E4) — changing it is a decision: ');
  // E4: many undeclared siblings from one call ⇒ at most DECLARED_SCOPE_ROW_CAP per-file rows, then ONE row carrying the count
  const many: Rec = {}; for (let i = 0; i < DECLARED_SCOPE_ROW_CAP + 25; i++) many[`site-${i}.conf`] = `server { listen ${8000 + i}; }\n`;
  const c = capture([ingressWith({ ...many, 'otlp-ingress.conf': ingressFiles['otlp-ingress.conf'] })], scopesFor(PARSED));
  const scopeRows = c.refusals.filter((r) => r.refusal === SERVICE_FILE_NOT_DECLARED);
  eq(cell(c, OTLP), 'HELD', 'the declared file is still held behind the undeclared ones: ');
  eq(scopeRows.filter((r) => r.path !== null).length, DECLARED_SCOPE_ROW_CAP, 'per-file rows: ');
  eq(scopeRows.filter((r) => r.path === null).map((r) => r.detail), [{ files: 25, capScope: 'declared-scope-rows' }], 'the one overflow row: ');
  assert(!c.refusals.some((r) => r.refusal === 'over-cap'), 'an undeclared sibling pushed the capture over the held cap');
});
test('AL7 both new refusals are handle-less though they keep target and path — and never join a held file\'s handle', () => {
  assert(HANDLELESS_CAPTURE_REFUSALS.has(SERVED_FILE_EVIDENCE_ONLY) && HANDLELESS_CAPTURE_REFUSALS.has(SERVICE_FILE_NOT_DECLARED), 'membership');
  const ref = { id: 'r1', scope: 's', blobSha256: 'a'.repeat(64), toolCallIndex: 0, selector: '/a', target: 'obs-ingress', path: OTLP[1], lineCount: 3 };
  const hs = harvesterHandles([ref], [
    { toolCallIndex: 0, selector: '/b', target: 'obs-ingress', path: OPER[1], refusal: SERVICE_FILE_NOT_DECLARED },
    { toolCallIndex: 0, selector: '/c', target: 'obs-ingress', path: OTLP[1], refusal: SERVICE_FILE_NOT_DECLARED },   // same pair as the held file (wrong service)
    { toolCallIndex: 1, selector: '/d', target: 'obs-otelcol', path: OTELF[1], refusal: SERVED_FILE_EVIDENCE_ONLY },
  ]);
  eq(hs.map((h) => [h.handle, h.state, h.path, h.objects]), [['H1', 'bound', OTLP[1], 1]], 'handles: ');
});

test('AL8 no target-prefix exemption: a `device:` target, and a registrant service claiming a PLATFORM target name, are never held on a declared leg', () => {
  const ex = extractDeclaredFiles(clone([INGRESS, OTEL]), undefined, { gitFileSourceLeg: true });
  const base = ex.files[0];
  const mk = (over: Partial<ExtractedFile>): ExtractedFile => ({ ...base, ...over } as ExtractedFile);
  const planted: ExtractResult = { ...ex, files: [
    mk({ target: 'device:ceos1', path: 'running-config', serviceName: 'customer-net', serviceId: 'reg-1', declaredBy: 'registrant' } as Partial<ExtractedFile>),
    mk({ target: 'obs-ingress', path: OTLP[1], serviceName: 'customer-svc', serviceId: 'reg-2', declaredBy: 'registrant' } as Partial<ExtractedFile>),   // a declared service-held label's file
    mk({ target: 'obs-otelcol', path: OTELF[1], serviceName: 'customer-svc', serviceId: 'reg-2', declaredBy: 'registrant' } as Partial<ExtractedFile>),  // a Git-based label's served copy
    mk({ target: 'customer-files', path: '/any/thing.conf', serviceName: 'customer-svc', serviceId: 'reg-2', declaredBy: 'registrant' } as Partial<ExtractedFile>),
  ] };
  const r = withDeclaredFilesScope(planted, PARSED, [INGRESS, OTEL], OBS);
  eq(r.files, [], 'held: ');
  eq(r.refusals.slice(ex.refusals.length).map((x) => [x.target, x.refusal, x.detail ?? null]), [
    ['device:ceos1', SERVICE_FILE_NOT_DECLARED, { case: 'no-label' }],
    ['obs-ingress', SERVICE_FILE_NOT_DECLARED, { case: 'wrong-service' }],
    ['obs-otelcol', SERVICE_FILE_NOT_DECLARED, { case: 'wrong-service' }],
    ['customer-files', SERVICE_FILE_NOT_DECLARED, { case: 'no-label' }],
  ], 'each refused by name: ');
  // and the Config scope before it leaves every non-Git file alone (it is this scope that judges them)
  assert(withConfigSourcesScope(planted, PARSED) === planted, 'the Git scope moved a non-Git file');
});
test('AL10 the two REGISTRANT columns through the real capture: a customer service\'s file with a `device:` target, and one whose target the service NAMES as a platform target', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const decl = require('../lib/mcp/server/config/held-file-declaration.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const he = require('../lib/mcp/server/config/held-eligibility.js');
  const ctx = { serviceName: 'customer-svc', capabilityToolNames: ['get_conf'], platformServiceNames: [], platformPins: [], platformTargets: ['obs-otelcol', 'obs-ingress'] };
  // registration REFUSES a constant platform target — so the only way a customer file can carry a platform target name is a TEMPLATE
  // target filled from a key the service itself returns
  eq(decl.validateHeldFiles({ files: [{ tool: 'get_conf', select: 'structuredContent.files.*', target: { const: 'obs-otelcol' }, path: { const: '/etc/otelcol/config.yaml' } }] }, ctx).ok, false, 'a constant platform target at registration: ');
  const SID = 'svc-customer-1';
  const mk = (target: unknown, pathSpec: unknown, key: string) => {
    const v = decl.validateHeldFiles({ files: [{ tool: 'get_conf', select: 'structuredContent.files.*', target, path: pathSpec }] }, ctx);
    assert(v.ok === true, `the fixture declaration was refused: ${JSON.stringify(v)}`);
    const rec = { tool: 'services', success: true, arguments: { action: 'call', targetService: 'customer-svc', tool: 'get_conf' },
      result: { content: [{ type: 'data', data: { targetService: 'customer-svc', tool: 'get_conf', success: true, metadata: { targetServiceId: SID }, arguments: {},
        result: { structuredContent: { files: { [key]: 'receivers: {}\n' } } } } }] } };
    he.setOnRecord(rec, { serviceId: SID, eligibility: 'own', heldFilesSha256: v.sha256, gitSource: false });
    const heldTable = tableFromDeclarations([{ serviceId: SID, sha: v.sha256 }], [{ sha256: v.sha256, heldFiles: v.declaration }]);
    const run = (sc: Scopes) => {
      const plan = prepareHeldCapture({ toolCallResults: [rec], task: TASK, logger, heldTable: heldTable as never, live: true, gitFileSourceLeg: sc.gitFileSourceLeg,
        ...(sc.configSources ? { configSources: sc.configSources, configSourceProtocol: sc.configSourceProtocol } : {}) });
      const files = (plan?.files ?? []) as unknown as Array<{ target: string; path: string }>;
      const refusals = (plan?.refusals ?? []) as unknown as Array<{ target: string | null; refusal: string; detail?: Rec }>;
      return files.length ? `HELD ${files[0].target}` : refusals.map((r) => `${r.refusal}${r.detail && typeof r.detail.case === 'string' ? ` (${r.detail.case})` : ''}`).join(',') || 'no row';
    };
    return { undeclared: run(scopesFor(null, false)), declared: run(scopesFor(PARSED)), reverted: run(scopesFor(governed(DECL, SHIPPED))) };
  };
  // (a) a `device:` target — held on a leg that declares nothing (as today), never on a declared one
  eq(mk({ const: 'device:ceos1' }, { const: '/running-config' }, 'k'),
    { undeclared: 'HELD device:ceos1', declared: `${SERVICE_FILE_NOT_DECLARED} (no-label)`, reverted: `${SERVICE_FILE_NOT_DECLARED} (text-reverted)` }, 'device: target: ');
  // (b) the service returns the KEY `obs-otelcol`, so its file would land on the platform target + path of a declared label. The
  // EXTRACTOR refuses it first, on every leg (a registrant file can never carry a platform target name — its own check, before this
  // scope): the same refusal with and without a declaration. The scope's `wrong-service` rule is the second line behind it (AL3, AL8).
  const b = mk({ template: '{key}' }, { const: '/etc/otelcol/config.yaml' }, 'obs-otelcol');
  eq([b.undeclared, b.declared, b.reverted], ['path-invalid', 'path-invalid', 'path-invalid'], 'a customer file naming a platform target: ');
  // (c) the same on the declared SERVICE-HELD label's target and path
  const c = mk({ template: '{key}' }, { const: '/etc/nginx/conf.d/otlp-ingress.conf' }, 'obs-ingress');
  eq([c.undeclared, c.declared, c.reverted], ['path-invalid', 'path-invalid', 'path-invalid'], 'a customer file on a service-held label\'s target: ');
});
test('AL9 hostile served keys: the scope is linear — 20,000 undeclared keys with long names are judged in well under a second', () => {
  const ex = extractDeclaredFiles(clone([INGRESS]), undefined, { gitFileSourceLeg: true });
  const base = ex.files[0];
  const junk = '?#;%2e%2E/../'.repeat(40);
  const files = Array.from({ length: 20000 }, (_, i) => ({ ...base, path: `/etc/nginx/conf.d/${junk}${i}.conf` } as ExtractedFile));
  const t0 = Date.now();
  const r = withDeclaredFilesScope({ ...ex, files }, PARSED, [INGRESS], OBS);
  const ms = Date.now() - t0;
  assert(r.files.length === 0, 'a hostile key was held');
  assert(ms < 3000, `the scope took ${ms} ms over 20,000 hostile keys`);
  console.log(`   (timing: ${ms} ms over 20,000 keys of ${junk.length + 30} chars)`);
});

console.log('── W10: the one force, both lists; label collisions ──');
test('FO1 configSourceForce: declaration state > git-file-not-held > service-held-not-held; both lists whenever non-empty', () => {
  const git = { target: GITF[0], path: GITF[1] }; const svc = { target: OTLP[0], path: OTLP[1] };
  eq(configSourceForce(PARSED, [git, svc]), null, 'everything held: ');
  eq(configSourceForce(PARSED, [git]), { reason: 'service-held-not-held', serviceFilesNotHeld: ['obs-ingress.otlp-ingress.conf'], serviceFilesNotHeldTotal: 1 }, 'the service file missing: ');
  eq(configSourceForce(PARSED, [svc]), { reason: 'git-file-not-held', gitFilesNotHeld: ['obs-otelcol'], gitFilesNotHeldTotal: 1 }, 'the Git file missing: ');
  eq(configSourceForce(PARSED, []), { reason: 'git-file-not-held', gitFilesNotHeld: ['obs-otelcol'], gitFilesNotHeldTotal: 1,
    serviceFilesNotHeld: ['obs-ingress.otlp-ingress.conf'], serviceFilesNotHeldTotal: 1 }, 'both missing: ');
  // the served copy of the Git-based label never satisfies the Git line, and never the service line of another label
  eq(configSourceForce(PARSED, [{ target: OTELF[0], path: OTELF[1] }])?.reason, 'git-file-not-held', 'the evidence copy is not the base: ');
  // the old name is the same function (the lab and the golden set import it)
  assert(configGitFileForce === configSourceForce, 'the alias forked');
});
test('FO2 ONE block with 2, 3, 4 and 8 service-held labels beside a Git pair (one capture, one force): every line read ⇒ no force; a missed line forces by its own list', () => {
  for (const n of [2, 3, 4, 8]) {
    const lines: string[] = [];
    for (let i = 1; i <= n; i++) lines.push(`obs-ingress.leg${i}.conf: service-held — service observability-readonly`);
    lines.push(O_GIT, O_LIVE);
    const g = governed(lines);
    assert(g.state === 'parsed', `${n} legs: ${g.state}`);
    const all = [{ target: GITF[0], path: GITF[1] }, ...Array.from({ length: n }, (_, i) => ({ target: 'obs-ingress', path: `/etc/nginx/conf.d/leg${i + 1}.conf` }))];
    eq(configSourceForce(g, all), null, `${n} legs, every line read: `);
    const miss = Math.ceil(n / 2);
    eq(configSourceForce(g, all.filter((r) => r.path !== `/etc/nginx/conf.d/leg${miss}.conf`)),
      { reason: 'service-held-not-held', serviceFilesNotHeld: [`obs-ingress.leg${miss}.conf`], serviceFilesNotHeldTotal: 1 }, `${n} legs, one service label missed: `);
    eq(configSourceForce(g, all.slice(1)), { reason: 'git-file-not-held', gitFilesNotHeld: ['obs-otelcol'], gitFilesNotHeldTotal: 1 }, `${n} legs, the Git line missed: `);
    // through capture: one call returning every leg's file ⇒ every declared file held, nothing refused
    const files: Rec = {}; for (let i = 1; i <= n; i++) files[`leg${i}.conf`] = `server { listen ${9000 + i}; }\n`;
    const c = capture([clone(GIT_DECLARED), ingressWith(files)], scopesFor(g));
    eq([c.held.length, c.refusals.length], [n + 1, 0], `${n} legs, capture: `);
    eq(configSourceForce(g, c.held.map((h) => ({ target: h.split(' ')[0], path: h.split(' ')[1] }))), null, `${n} legs, the force over what capture held: `);
  }
});
test('FO2b (review, architectural F7) n LEGS sharing one block, at 2, 3, 4 and 8: each leg\'s own capture holds exactly the declared set, one base per label, and no leg is forced; a leg that read only "its own" file is forced for the rest', () => {
  for (const n of [2, 3, 4, 8]) {
    const lines: string[] = [];
    for (let i = 1; i <= n; i++) lines.push(`obs-ingress.leg${i}.conf: service-held — service observability-readonly`);
    lines.push(O_GIT, O_LIVE);
    const declared = [`${GITF[0]} ${GITF[1]}`, ...Array.from({ length: n }, (_, i) => `obs-ingress /etc/nginx/conf.d/leg${i + 1}.conf`)].sort();
    const files: Rec = {}; for (let i = 1; i <= n; i++) files[`leg${i}.conf`] = `server { listen ${9000 + i}; }\n`;
    for (let leg = 1; leg <= n; leg++) {
      // EACH leg has its own row, its own snapshot of the SAME block, its own Harvester execution and its own capture
      const g = governingConfigSourcesAsOf(row({ description: block(lines), snapshot: snapOf(lines) }), OBS, NONE);
      assert(g.state === 'parsed', `${n} legs, leg ${leg}: ${g.state}`);
      const sc = captureScopesFor(legRes({ legId: `leg${leg}`, configSourceProtocol: OBS }), g);
      // the leg's Harvester reads every declared line, the served collector copy (evidence) and an undeclared sibling
      const plan = prepareHeldCapture({ toolCallResults: [clone(GIT_DECLARED), ingressWith({ ...files, 'stray.conf': 'x\n' }), clone(OTEL)], task: { id: `harv-leg${leg}`, povId: 'p' }, logger,
        gitFileSourceLeg: sc.gitFileSourceLeg, configSources: sc.configSources, configSourceProtocol: sc.configSourceProtocol });
      const held = ((plan?.files ?? []) as unknown as Array<{ target: string; path: string }>).map((f) => `${f.target} ${f.path}`).sort();
      eq(held, declared, `${n} legs, leg ${leg} holds exactly the declared set: `);
      eq(new Set(held).size, held.length, `${n} legs, leg ${leg}: a second base for one label: `);
      eq(configSourceForce(g, held.map((h) => ({ target: h.split(' ')[0], path: h.split(' ')[1] }))), null, `${n} legs, leg ${leg} is not forced: `);
      // the same leg reading only "its own" file: forced, the other n-1 service labels and the Git file named
      const own = prepareHeldCapture({ toolCallResults: [ingressWith({ [`leg${leg}.conf`]: files[`leg${leg}.conf`] })], task: { id: `harv-leg${leg}`, povId: 'p' }, logger,
        gitFileSourceLeg: sc.gitFileSourceLeg, configSources: sc.configSources, configSourceProtocol: sc.configSourceProtocol });
      const f = configSourceForce(g, ((own?.files ?? []) as unknown as Array<{ target: string; path: string }>).map((x) => ({ target: x.target, path: x.path })));
      eq([f?.reason, f?.gitFilesNotHeldTotal, f?.serviceFilesNotHeldTotal], ['git-file-not-held', 1, n - 1], `${n} legs, leg ${leg} read only its own file: `);
    }
  }
});
test('FO3 a mixed program: a Kubernetes leg and a no-block observability leg beside a declared one are untouched', () => {
  const k8s = resolveLegConfigSources({ protocol: K8S, contractValue: null, taskBody: block(['sample-workloads: git-file — service github-service ; paichart/paichart-configs/k8s/sample-workloads.yaml']) });
  assert(k8s.state === 'parsed', `k8s fixture: ${k8s.state}`);
  const kg = { ...k8s, source: 'task' } as unknown as LegConfigSourcesResolution;
  const kScopes = captureScopesFor(legRes({ gitFileSource: true, configSourceProtocol: K8S }), kg) as Scopes;
  // The Kubernetes leg's capture is what it was before the declared-files scope existed: that scope hands back the SAME object for a
  // protocol whose block cannot name a service file. (Until STEP 3 P3 this case compared against a capture given the scope with NO
  // protocol; such a call is now judged as the strictest protocol — see AL1 — so the "before" is stated as the identity it always was.)
  const exK = withConfigSourcesScope(extractDeclaredFiles(clone(RECORDS), undefined, { gitFileSourceLeg: true }), kg);
  assert(withDeclaredFilesScope(exK, kg, RECORDS, K8S) === exK, 'the declared-files scope changed a Kubernetes leg');
  const after = capture(clone(RECORDS), kScopes);
  eq([cell(after, OTLP), cell(after, OPER), cell(after, OTELF), after.held.includes('github:paichart:paichart-configs /k8s/sample-workloads.yaml')], ['HELD', 'HELD', 'HELD', true], 'a Kubernetes leg with the same records holds what it held: ');
  // …and the SAME scope handed over WITHOUT its protocol holds none of the served files (P3, fail closed)
  const noProto = prepareHeldCapture({ toolCallResults: clone(RECORDS), task: TASK, logger, gitFileSourceLeg: true, configSources: kg });
  eq((noProto?.files ?? []).filter((f) => !(f as unknown as { target: string }).target.startsWith('github:')).length, 0, 'a scope without its protocol: served files held: ');
  eq(configSourceForce(kg, [{ target: GITF[0], path: '/k8s/sample-workloads.yaml' }]), null, 'k8s force: ');
});
test('FO4 label collisions: two labels naming one file are reported; a clean block reports none', () => {
  eq(configLabelCollisions(PARSED), [], 'the fixture block: ');
  assert(PARSED.state === 'parsed', 'fixture');
  const git = PARSED.entries.find((e) => e.kind === 'git-file');
  assert(git, 'fixture');
  const dup = { ...PARSED, entries: [...PARSED.entries, { ...git, label: 'obs-ingress.other.conf' }] } as LegConfigSourcesResolution;
  eq(configLabelCollisions(dup), [['obs-otelcol', 'obs-ingress.other.conf']], 'the same Git file under two labels: ');
  eq(configLabelCollisions({ state: 'snapshot-absent', grammarVersion: 2 }), [], 'not parsed: ');
});

console.log('── W25: the leg-state × file-kind table (the real capture) ──');
const LEG_STATES: Array<[string, Scopes]> = [
  ['no block (declares nothing)', scopesFor(null, false)],
  ['a parsed declaration', scopesFor(PARSED)],
  ['a declaration that is not parsed (snapshot-changed)', scopesFor(governingConfigSourcesAsOf(row({ description: block([O_HELD]), snapshot: snapOf(DECL) }), OBS, NONE))],
  ['a snapshot with the protocol awaiting its text', scopesFor(governed(DECL, SHIPPED))],
  ['could-not-check (the leg row could not be read)', scopesFor({ state: 'could-not-check', grammarVersion: 2, reason: 'read-threw' })],
  ['the owning-leg read failed (A8: no leg resolved)', captureScopesFor({ kind: 'could-not-check' } as OwningLegResolution, null) as Scopes],
  // review, sec-ops F6: the leg's OWN PIPELINE persist — the core resolves NO owning leg for a PIPELINE task, so a harness execution
  // that calls the read-only service itself is outside every scope, whatever the leg declares
  ['the leg\'s OWN PIPELINE persist (a harness execution; any declaration)', captureScopesFor<LegConfigSourcesResolution>(null, null) as Scopes],
];
const FILE_KINDS: Array<[string, Rec[], string[] | 'git']> = [
  ['declared Git file', [GIT_DECLARED], 'git'],
  ['undeclared Git file', [GIT_UNDECLARED], 'git'],
  ['declared service-held file', [INGRESS], OTLP],
  ['served copy of a Git-based label (live-read line)', [OTEL], OTELF],
  ['undeclared sibling from the same call', [INGRESS], OPER],
  ['key-named file', [KEYFILE], ['obs-ingress', '/etc/nginx/conf.d/server.key']],
];
const table = LEG_STATES.map(([name, s]) => [name, ...FILE_KINDS.map(([, recs, at]) => {
  const c = capture(clone(recs), s);
  // a Git refusal row carries no target or path (the existing rule), so the Git columns are read by name
  if (at === 'git') return c.held.some((h) => h.startsWith('github:')) ? 'HELD' : gitRefusals(c) ? 'git-file-not-declared' : 'no row';
  return cell(c, at);
})]);
test('TB1 the table: row 4 (text reverted) holds nothing in ANY column; row 5 is the recorded A8 exception (the served files are held)', () => {
  const byName = Object.fromEntries(table.map((r) => [r[0], r.slice(1)]));
  eq(byName['no block (declares nothing)'].slice(0, 5), ['no row', 'no row', 'HELD', 'HELD', 'HELD'], 'no block: ');
  eq(byName['a parsed declaration'].slice(0, 5), ['HELD', 'git-file-not-declared', 'HELD', SERVED_FILE_EVIDENCE_ONLY, `${SERVICE_FILE_NOT_DECLARED} (no-label)`], 'parsed: ');
  for (const name of ['a declaration that is not parsed (snapshot-changed)', 'a snapshot with the protocol awaiting its text', 'could-not-check (the leg row could not be read)']) {
    assert(byName[name].every((c) => c !== 'HELD' && c !== 'no row'), `${name}: ${JSON.stringify(byName[name])}`);
  }
  eq(byName['the owning-leg read failed (A8: no leg resolved)'].slice(0, 5), byName['no block (declares nothing)'].slice(0, 5), 'A8 = the non-variant path: ');
  eq(byName['the leg\'s OWN PIPELINE persist (a harness execution; any declaration)'].slice(0, 5), byName['no block (declares nothing)'].slice(0, 5), 'the leg\'s own persist = unscoped: ');
  for (const r of table) assert(r[6] !== 'HELD', `a key-named file was held on "${r[0]}"`);
});
if (process.env.W25_TABLE === '1') {
  console.log(`\n| leg state | ${FILE_KINDS.map((k) => k[0]).join(' | ')} |\n|---|${FILE_KINDS.map(() => '---').join('|')}|`);
  for (const r of table) console.log(`| ${r.join(' | ')} |`);
}

void Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
