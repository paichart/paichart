/**
 * Config sources STEP 3, slice P1 (observability-config, plan v2.1 W5 rows 1 / 11-13 / 19, W6, W7, §13 A1 / A6 / A9 / D / E) — the lane
 * row and its no-block rule, grammar 2 (the `service-held` kind and the pair rule), labels, the snapshot decision.
 *
 * EVERYTHING HERE RUNS IN BOTH AWAITING STATES through the real functions: the awaiting list is a defaulted parameter, so `SHIPPED`
 * (what production passes — nothing) and `NONE` (`[]`, "every row's text has shipped") go through the same code. No rule is copied.
 * PURE: no DB.
 *
 * Run: npm run test:config-sources   (it runs scripts/test-config-sources.ts, then this file)
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  parseConfigSourceLine, parseConfigSourceLines, resolveLegConfigSources, buildConfigSourcesSnapshot, readConfigSourcesSnapshot,
  configBlockRuleProblem, grammarVersionOfConfigEntries, configPairingOf, configLabelTableOf, sameConfigDeclaration,
  CONFIG_SOURCE_KINDS, CONFIG_SOURCE_KINDS_BY_PROTOCOL, CONFIG_SOURCE_PAIRING_BY_PROTOCOL, CONFIG_LABEL_PROBLEMS, CONFIG_SOURCES_SNAPSHOT_KEY,
  CONFIG_SOURCES_GRAMMAR_VERSION, CONFIG_SOURCES_GRAMMAR_VERSIONS, type ConfigSourceLine, type ConfigSourcesSnapshot,
} from '../lib/agents/harness/config-sources';
import {
  CONFIG_SOURCE_LANES, CONFIG_SOURCE_AWAITING_TEXT, CONFIG_SOURCE_PROTOCOLS, configSourceProtocolsFor, configSourceLaneOf, configSourceContractKeyOf,
  configSourceLaneOfLeg, legProtocolHasConfigLane, carrierAppliesConfigForce, heldCaptureTakesConfigScope, resolveOwningLegProtocol,
  HELD_OBS_PROTOCOL, HELD_VARIANT_PROTOCOL,
} from '../lib/agents/harness/held-bytes/variant';
import { governingConfigSources, readLegConfigSources, configSnapshotDecision, type GoverningConfigRow } from '../lib/agents/harness/config-sources-read';
import { configLabelParts, configLabelKeyProblem, resolveConfigLabel, resolveConfigLabels, platformLabelTargets } from '../lib/agents/harness/held-bytes/config-label';
import { PLATFORM_DEFAULT_DESCRIPTORS, type Descriptor } from '../lib/agents/harness/held-bytes/descriptors';
import { configGitFileForce } from '../lib/agents/harness/held-bytes/config-source-scope';
import { configSourcesReadKeys, configSourcesKeysOf } from '../lib/agents/harness/plan-spawn-carry';
import { descriptorOnlyTokens, knownDescriptorTokens, deriveForToken, deriveServiceDescriptors } from '../lib/agents/harness/service-descriptors-derivation';

const eq = (a: unknown, b: unknown, what = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
let passed = 0; let failed = 0;
const pending: Array<Promise<void>> = [];
function test(name: string, fn: () => void | Promise<void>) {
  const done = (e?: unknown) => { if (e === undefined) { passed++; console.log(`✅ ${name}`); } else { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); } };
  try { const r = fn(); if (r && typeof (r as Promise<void>).then === 'function') pending.push((r as Promise<void>).then(() => done(), (e) => done(e ?? new Error('rejected')))); else done(); }
  catch (e) { done(e); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const OBS = 'observability-config-protocol';
const K8S = 'kubernetes-gitops-protocol';
const TF = 'terraform-iac-protocol';
const SHIPPED = undefined;                       // what production passes: the shipped awaiting list
const NONE: readonly string[] = [];              // "every table row's text has shipped"
const STATES: Array<[string, readonly string[] | undefined]> = [['as shipped', SHIPPED], ['all rows shipped', NONE]];

// The observability lines (the published files of paichart/paichart-configs, plan §9.5; the rig's service name).
const O_GIT = 'obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml';
const O_LIVE = 'obs-otelcol: live-read — service observability-readonly';
const O_HELD = 'obs-ingress.otlp-ingress.conf: service-held — service observability-readonly';
const O_GIT2 = 'obs-ingress.operator-access.conf: git-file — service github-service ; paichart/paichart-configs/observability/nginx/operator-access.conf @ main';
const K_GIT = 'sample-workloads: git-file — service github-service ; paichart/paichart-configs/k8s/sample-workloads.yaml';
const K_LIVE = 'trading-cluster: live-read — service k8s-rig-readonly';
const block = (lines: string[]) => `Change it.\n\n## Config sources\n${lines.join('\n')}\n\n## Notes\nx\n`;
const row = (r: Partial<GoverningConfigRow>): GoverningConfigRow => ({ description: null, contract: null, snapshot: null, protocolStamped: true, ...r });
const obsLeg = { title: 'x', metadata: { protocol: OBS } };
const snapObs = (lines: string[]): ConfigSourcesSnapshot => {
  const d = configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: block(lines), interfaceContract: null, takenAt: 't' }, NONE);
  assert(d.action === 'write', `the fixture block did not snapshot: ${JSON.stringify(d)}`);
  return d.snapshot;
};

console.log('── W5: the lane row, its no-block rule, and the awaiting list as a parameter ──');
test('OL1 the table: observability is a row, `runs-undeclared`, awaiting its text; Kubernetes and Terraform are `forced` and shipped', () => {
  eq(CONFIG_SOURCE_LANES[OBS], { lane: 'change', contractKey: 'observability-config', noBlock: 'runs-undeclared', descriptorWithoutServiceLine: 'keep' }, 'the observability row: ');
  eq([CONFIG_SOURCE_LANES[K8S].noBlock, CONFIG_SOURCE_LANES[TF].noBlock], ['forced', 'forced'], 'the older rows: ');
  eq([...CONFIG_SOURCE_AWAITING_TEXT], [OBS], 'the awaiting list: ');
  // the column is read from the table ROW at its two sites (the per-leg rule, the snapshot decision); no accessor exists until a
  // third reader does (review: `configNoBlockOf` was removed — it had no caller)
  assert(!/configNoBlockOf/.test(fs.readFileSync(path.join(__dirname, '../lib/agents/harness/held-bytes/variant.ts'), 'utf8')), 'an unused no-block accessor is back');
  eq([...CONFIG_SOURCE_PROTOCOLS].sort(), [K8S, TF].sort(), 'the protocols that declare Config sources as shipped: ');
  eq([...configSourceProtocolsFor(NONE)].sort(), [K8S, OBS, TF].sort(), '… with every row shipped: ');
  // the retired held variant is NOT a row: a leg stamped with it never has a Config lane, in either state
  for (const [, aw] of STATES) eq(configSourceLaneOfLeg({ title: 'x', metadata: { protocol: HELD_VARIANT_PROTOCOL } }, aw), null, 'the retired variant: ');
  eq(HELD_OBS_PROTOCOL, OBS, 'the row is keyed by the observability protocol name: ');
});
test('OL2 INERT as shipped, a Config protocol with every row shipped — every reader of the awaiting list, through its own parameter', async () => {
  const noDb = { task: { findUnique: async () => null }, stage: { findUnique: async () => null } } as never;
  const want: Record<string, { lane: string | null; key: string | null; has: boolean; force: boolean; res: boolean; read: boolean; only: string[] }> = {
    'as shipped': { lane: null, key: null, has: false, force: false, res: false, read: false, only: ['observability-config'] },
    'all rows shipped': { lane: 'change', key: 'observability-config', has: true, force: true, res: true, read: true, only: [] },
  };
  for (const [name, aw] of STATES) {
    const r = await resolveOwningLegProtocol(noDb, { id: 'L', type: 'PIPELINE', ...obsLeg }, aw);
    const got = { lane: configSourceLaneOf(OBS, aw), key: configSourceContractKeyOf(OBS, aw), has: legProtocolHasConfigLane(obsLeg, aw),
      force: carrierAppliesConfigForce(obsLeg, aw), res: r.kind === 'self' && r.configSourceProtocol === OBS,
      read: configSourcesReadKeys(aw).includes('observability-config'), only: [...descriptorOnlyTokens(aw)] };
    eq(got, want[name], `${name}: `);
    eq(heldCaptureTakesConfigScope(r), want[name].res, `${name} capture scope: `);
    // the plan-gate fact reads the key only once the text has shipped
    eq(configSourcesKeysOf({ configSources: { 'observability-config': 'x' } }, aw)?.notReadKeys, want[name].read ? [] : ['observability-config'], `${name} plan-gate fact: `);
    // membership is DERIVED: a token is descriptor-only XOR a sources lane, never both, and always known
    assert(knownDescriptorTokens(aw).includes('observability-config'), `${name}: the token is not a known descriptor token`);
    eq(deriveForToken({ configSources: { 'observability-config': O_GIT } }, 'observability-config', aw) === null, !want[name].read, `${name} derivation lane: `);
  }
  // Kubernetes and Terraform: identical in both states (their rows are not awaiting)
  for (const p of [K8S, TF]) for (const [name, aw] of STATES) {
    eq([configSourceLaneOf(p, aw), carrierAppliesConfigForce({ title: 'x', metadata: { protocol: p } }, aw), configSourcesReadKeys(aw).includes(CONFIG_SOURCE_LANES[p].contractKey)],
      ['change', true, true], `${p} ${name}: `);
  }
});
test('OL3 the three constants of plan W5 rows 11-12 are FUNCTIONS of the awaiting list — no module-level copy survives', () => {
  const rd = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const carry = rd('lib/agents/harness/plan-spawn-carry.ts'); const der = rd('lib/agents/harness/service-descriptors-derivation.ts');
  assert(!/CONFIG_SOURCES_READ_KEYS|CONFIG_SOURCE_PROTOCOLS/.test(carry) && /export function configSourcesReadKeys\(awaiting: readonly string\[\] = CONFIG_SOURCE_AWAITING_TEXT\)/.test(carry), 'plan-spawn-carry: a module-level key list');
  assert(!/SOURCE_LANE_TOKENS|DESCRIPTOR_ONLY_TOKENS|CONFIG_SOURCE_PROTOCOLS/.test(der) && /export function descriptorOnlyTokens\(awaiting/.test(der) && /function sourceLaneTokens\(awaiting/.test(der), 'the derivation: a module-level token list');
  assert(!/\[\s*'observability-config'\s*\]/.test(der), 'the derivation types the descriptor-only token by hand — it must come from the table and the awaiting list');
  // a row can never be in both lists, for ANY awaiting list
  for (const aw of [NONE, [OBS], [K8S, TF, OBS], [K8S]]) {
    const lanes = configSourcesReadKeys(aw); const only = descriptorOnlyTokens(aw);
    eq(only.filter((t) => lanes.includes(t)), [], `awaiting ${JSON.stringify(aw)}: in both lists: `);
    eq([...lanes, ...only].sort(), Object.values(CONFIG_SOURCE_LANES).map((x) => x.contractKey).sort(), `awaiting ${JSON.stringify(aw)}: a row in neither list: `);
  }
});

console.log('── W5 row 13: the per-leg rule (governingConfigSources) ──');
test('GV1 runs-undeclared: no snapshot and no block ⇒ not-config-source-leg; no snapshot and a live block ⇒ snapshot-absent; a snapshot ⇒ the snapshot', () => {
  eq(governingConfigSources(row({ description: 'Tune the collector.' }), OBS), { state: 'not-config-source-leg' }, 'no block, no snapshot: ');
  eq(governingConfigSources(row({ description: null }), OBS), { state: 'not-config-source-leg' }, 'no description at all: ');
  eq(governingConfigSources(row({ description: block([O_GIT]) }), OBS), { state: 'snapshot-absent', grammarVersion: 1 }, 'a live block, no snapshot (plan §9.4 populations A-C): ');
  eq(governingConfigSources(row({ description: block(['not a line']) }), OBS), { state: 'snapshot-absent', grammarVersion: 1 }, 'an UNPARSEABLE live block still counts as a block: ');
  const snap = snapObs([O_GIT, O_LIVE]);
  eq(governingConfigSources(row({ description: block([O_GIT, O_LIVE]), snapshot: snap }), OBS).state, 'parsed', 'a snapshot governs: ');
  eq(governingConfigSources(row({ description: block([O_GIT]), snapshot: snap }), OBS).state, 'snapshot-changed', 'an edit after the snapshot: ');
  eq(governingConfigSources(row({ description: 'no block now', snapshot: snap }), OBS).state, 'snapshot-changed', 'the block removed after the snapshot: ');
});
test('GV1b (review, architectural F5) a stored `absent` snapshot on a runs-undeclared leg is NOT governed by — the platform never writes one; it reads snapshot-unreadable, never config-sources-absent', () => {
  const absent = { version: 1, takenAt: 't', protocol: OBS, resolution: { state: 'absent', grammarVersion: 1 } };
  eq(readConfigSourcesSnapshot({ [CONFIG_SOURCES_SNAPSHOT_KEY]: absent }), absent, 'the reader itself accepts the shape (a forced protocol stores it): ');
  const g = governingConfigSources(row({ description: 'Tune the collector.', snapshot: absent }), OBS);
  eq(g, { state: 'snapshot-unreadable', grammarVersion: 1 }, 'governing: ');
  eq(configGitFileForce(g, []), { reason: 'config-sources-snapshot-unreadable' }, 'the force names the snapshot, never "absent": ');
  // the writer's own decision for that leg is `remove`, so the platform cannot have produced it
  eq(configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: 'Tune the collector.', interfaceContract: null, takenAt: 't' }, NONE), { action: 'remove' });
  // a FORCED protocol is unchanged: its stored `absent` snapshot governs as `absent` (the harness stops, the carrier names it)
  const kAbsent = buildConfigSourcesSnapshot(K8S, resolveLegConfigSources({ protocol: K8S, contractValue: undefined, taskBody: 'no block' }), 't');
  eq(governingConfigSources(row({ description: 'no block', snapshot: kAbsent }), K8S).state, 'absent', 'Kubernetes: ');
});
test('GV2 forced (Kubernetes, Terraform): no snapshot ⇒ snapshot-absent, with or without a block — UNCHANGED', () => {
  for (const p of [K8S, TF]) {
    eq(governingConfigSources(row({ description: 'no block' }), p), { state: 'snapshot-absent', grammarVersion: 1 }, `${p} no block: `);
    eq(governingConfigSources(row({ description: block([K_GIT]) }), p), { state: 'snapshot-absent', grammarVersion: 1 }, `${p} a block: `);
  }
  eq(governingConfigSources(row({ description: block([K_GIT]) }), 'network-provisioning-protocol'), { state: 'not-config-source-leg' }, 'off the table: ');
  eq(governingConfigSources(row({ description: block([O_GIT]), snapshot: snapObs([O_GIT]) }), HELD_VARIANT_PROTOCOL), { state: 'not-config-source-leg' }, 'the retired variant, even with a snapshot: ');
});
test('GV3 (A9) a snapshot governs only on a leg that carries the protocol stamp — every protocol; the reader asks for the stamp in its ONE row read', async () => {
  const snapO = snapObs([O_GIT]);
  const snapK = buildConfigSourcesSnapshot(K8S, resolveLegConfigSources({ protocol: K8S, contractValue: undefined, taskBody: block([K_GIT]) }), 't');
  eq(governingConfigSources(row({ description: block([O_GIT]), snapshot: snapO, protocolStamped: false }), OBS), { state: 'snapshot-unreadable', grammarVersion: 1 }, 'observability, unstamped: ');
  eq(governingConfigSources(row({ description: block([K_GIT]), snapshot: snapK, protocolStamped: false }), K8S), { state: 'snapshot-unreadable', grammarVersion: 1 }, 'Kubernetes, unstamped: ');
  eq(governingConfigSources(row({ description: block([K_GIT]), snapshot: snapK, protocolStamped: true }), K8S).state, 'parsed', 'Kubernetes, stamped: ');
  // an unstamped leg with NO snapshot keeps the no-snapshot rule (the stamp is asked only of a snapshot)
  eq(governingConfigSources(row({ description: 'x', protocolStamped: false }), OBS), { state: 'not-config-source-leg' }, 'unstamped, nothing declared: ');
  eq(configGitFileForce(governingConfigSources(row({ description: block([O_GIT]), snapshot: snapO, protocolStamped: false }), OBS), []), { reason: 'config-sources-snapshot-unreadable' }, 'forced by name, nothing held: ');
  // the reader: its SELECT returns the stamp flag, and only a real `true` counts (SQL NULL when the key is absent)
  const res = { kind: 'self' as const, legId: 'L', heldCapable: true, configSourceProtocol: K8S };
  let sql = '';
  const db = (stamped: unknown) => ({ $queryRaw: async (q: { strings?: readonly string[]; text?: string }) => { sql = (q.strings ?? [q.text ?? '']).join('?');
    return [{ description: block([K_GIT]), contract: null, snapshot: snapK, protocolStamped: stamped }]; } }) as never;
  eq((await readLegConfigSources(db(true), res)).state, 'parsed', 'stamped row: ');
  for (const v of [false, null, undefined, 'true', 1]) eq((await readLegConfigSources(db(v), res)).state, 'snapshot-unreadable', `protocolStamped ${JSON.stringify(v)}: `);
  assert(/\(jsonb_typeof\(metadata -> 'protocol'\) = 'string'\) AS "protocolStamped"/.test(sql), `the reader's SELECT does not ask for the stamp: ${sql}`);
});
test('GV4 multi-leg, at the governing rule: each leg resolves ONLY its own key; a silent second leg stays undeclared; a contract block declares a silent leg', () => {
  const contractOf = (cs: unknown) => ({ configSources: cs });
  // a mixed program: the contract carries a Kubernetes block and an observability block; each leg reads its own
  const mixed = contractOf({ 'kubernetes-gitops': K_GIT, 'observability-config': `${O_GIT}\n${O_LIVE}` });
  eq(governingConfigSources(row({ contract: contractOf({ 'kubernetes-gitops': K_GIT }) }), OBS), { state: 'not-config-source-leg' }, 'an observability leg under a Kubernetes-only contract: ');
  eq(governingConfigSources(row({ contract: mixed }), OBS).state, 'snapshot-absent', 'an observability leg whose key IS in the contract (no snapshot yet): ');
  eq(resolveLegConfigSources({ protocol: OBS, contractValue: (mixed.configSources as Record<string, unknown>)['observability-config'], taskBody: null }).state, 'parsed', 'its own block parses: ');
  eq(resolveLegConfigSources({ protocol: K8S, contractValue: (mixed.configSources as Record<string, unknown>)['kubernetes-gitops'], taskBody: null }).state, 'parsed', 'the Kubernetes leg reads its own: ');
  // a block in ONE leg's task body; a second leg of the same program is silent ⇒ leg 2 is undeclared and runs as today
  eq(governingConfigSources(row({ description: 'Leg 2: add a scrape job.' }), OBS), { state: 'not-config-source-leg' }, 'the silent second leg: ');
  // a contract block with a silent leg body ⇒ that leg IS declared (a contract block applies to every observability leg of the program)
  const d = configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: 'Leg 2: add a scrape job.', interfaceContract: mixed, takenAt: 't' }, NONE);
  assert(d.action === 'write' && d.snapshot.resolution.state === 'parsed' && d.snapshot.resolution.source === 'contract', `a contract block on a silent leg: ${JSON.stringify(d)}`);
  eq(governingConfigSources(row({ description: 'Leg 2: add a scrape job.', contract: mixed, snapshot: d.snapshot }), OBS).state, 'parsed', '… and it governs: ');
  // a stamped leg with no snapshot and no block: undeclared. The same leg with a block ADDED afterwards ⇒ forced by name.
  eq(governingConfigSources(row({ description: 'x' }), OBS), { state: 'not-config-source-leg' }, 'stamped, no snapshot, no block: ');
  eq(configGitFileForce(governingConfigSources(row({ description: block([O_GIT]) }), OBS), []), { reason: 'config-sources-snapshot-absent' }, 'the same leg with a block added: ');
  eq(configGitFileForce({ state: 'not-config-source-leg' }, []), null, 'an undeclared leg is never forced: ');
});
test('GV5 the FIVE shapes the Program Architect might write under the key (plan §13 D, boundary-contract): each named, each forced by name, none read as a declaration', () => {
  const cases: Array<[string, unknown, string]> = [
    ['an empty string', { 'observability-config': '' }, 'empty-block'],
    ['an empty array', { 'observability-config': [] }, 'empty-block'],
    ['a prose string', { 'observability-config': 'See the requirements for the collector files.' }, 'not-a-source-line'],
    ['an object note', { 'observability-config': { note: 'no sources for this leg' } }, 'contract-value-not-lines'],
    ['a string-valued configSources', 'obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml', 'contract-value-not-lines'],
  ];
  for (const [name, cs, problem] of cases) {
    const contract = { configSources: cs, serviceDescriptors: { 'observability-config': 'https://example.com/descriptors/obs.json' } };
    // at the first stamp: a snapshot of `unparseable (contract: <problem>)` — never `absent`, so never a silent no-block run …
    const d = configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: 'Tune the collector.', interfaceContract: contract, takenAt: 't' }, NONE);
    assert(d.action === 'write', `${name}: ${JSON.stringify(d)}`);
    eq(d.snapshot.resolution, { state: 'unparseable', grammarVersion: 1, source: 'contract', problem, lineIndex: problem === 'not-a-source-line' ? 0 : null }, `${name} snapshot: `);
    // … which governs by that name, and the carrier forces `config-sources-unparseable` (the operator's line of plan §9.4)
    const g = governingConfigSources(row({ description: 'Tune the collector.', contract, snapshot: d.snapshot }), OBS);
    eq([g.state, (g as { problem?: string }).problem], ['unparseable', problem], `${name} governing: `);
    eq(configGitFileForce(g, []), { reason: 'config-sources-unparseable' }, `${name} force: `);
    // before any snapshot (a leg stamped earlier): a live block that is not `absent` ⇒ forced `snapshot-absent`, never undeclared
    eq(governingConfigSources(row({ description: 'Tune the collector.', contract }), OBS).state, 'snapshot-absent', `${name} with no snapshot: `);
    // what the derivation's row 1 keeps: a block that does not parse derives nothing, so the Architect's own descriptor is KEPT (rule 4)
    const dv = deriveServiceDescriptors(contract as Record<string, unknown>, NONE);
    // (the string-valued form is unreadable under EVERY Config-sources token, so the other lane tokens are named beside this one)
    eq([dv.fact.kept, dv.fact.removed, dv.fact.notDerived.filter((x) => x.token === 'observability-config'), dv.fact.notDerived.length],
      [['observability-config'], [], [{ token: 'observability-config', reason: 'block-unparseable' }], typeof cs === 'string' ? 3 : 1], `${name} derivation: `);
    assert(dv.contract === contract, `${name}: the derivation rewrote a contract it derived nothing from`);
    // AS SHIPPED none of this is read: the leg has no Config lane and nothing is snapshotted
    eq(configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: 'Tune the collector.', interfaceContract: contract, takenAt: 't' }), { action: 'none' }, `${name} as shipped: `);
  }
  // the string-valued form hits EVERY leg of the program that reads configSources — Kubernetes too (existing behaviour, restated)
  eq(resolveLegConfigSources({ protocol: K8S, contractValue: { configSourcesNotKeyedByToken: true }, taskBody: null }).state, 'unparseable');
});

console.log('── W6: grammar 2 — the service-held kind, the pair rule, the version ──');
test('GR1 the observability kinds parse; `supplied` is not one of them; `service-held` is not a Kubernetes or Terraform kind', () => {
  eq(parseConfigSourceLine(O_GIT, OBS), { ok: true, line: { label: 'obs-otelcol', kind: 'git-file', service: 'github-service', owner: 'paichart', repo: 'paichart-configs', path: 'observability/otelcol/config.yaml', ref: null } });
  eq(parseConfigSourceLine(O_LIVE, OBS), { ok: true, line: { label: 'obs-otelcol', kind: 'live-read', service: 'observability-readonly' } });
  eq(parseConfigSourceLine(O_HELD, OBS), { ok: true, line: { label: 'obs-ingress.otlp-ingress.conf', kind: 'service-held', service: 'observability-readonly' } });
  eq(parseConfigSourceLine('obs-otelcol: supplied', OBS), { ok: false, problem: 'unknown-kind' });
  for (const p of [K8S, TF]) eq(parseConfigSourceLine(O_HELD, p), { ok: false, problem: 'unknown-kind' }, `${p}: `);
  eq([...CONFIG_SOURCE_KINDS_BY_PROTOCOL[OBS]], ['git-file', 'service-held', 'live-read']);
  assert(CONFIG_SOURCE_KINDS.includes('service-held'), 'the kind list (the exhaustiveness walk) lacks service-held');
  // single-token mutations of the service-held line, each failing CLOSED with its name (it shares live-read's parser)
  eq(parseConfigSourceLine('obs-otelcol: service-held - service observability-readonly', OBS), { ok: false, problem: 'separator-invalid' });
  eq(parseConfigSourceLine('obs-otelcol: service-held — service a`b', OBS), { ok: false, problem: 'service-invalid' });
  eq(parseConfigSourceLine('obs-otelcol: service-held — service a ; b', OBS), { ok: false, problem: 'service-invalid' });
  eq(parseConfigSourceLine('obs-otelcol: service-held', OBS), { ok: false, problem: 'separator-invalid' });
  // a key-named Git path is refused at resolution, for this protocol too (W18's block-resolution site)
  eq(parseConfigSourceLine('obs-ingress.x: git-file — service github-service ; paichart/paichart-configs/observability/nginx/.htpasswd', OBS), { ok: false, problem: 'path-never-held' });
  eq(parseConfigSourceLine('obs-ingress.x: git-file — service github-service ; paichart/paichart-configs/observability/nginx/tls/server.key', OBS), { ok: false, problem: 'path-never-held' });
});
test('GR2 the pair rule keys on the per-protocol `pairing` PROPERTY: base-plus-live-read (observability) both ways; none (Kubernetes, Terraform) unchanged', () => {
  eq([configPairingOf(OBS), configPairingOf(K8S), configPairingOf(TF), configPairingOf('nope')], ['base-plus-live-read', 'none', 'none', 'none']);
  eq(Object.keys(CONFIG_SOURCE_PAIRING_BY_PROTOCOL).sort(), Object.keys(CONFIG_SOURCE_LANES).sort(), 'every lane row states its pairing: ');
  const st = (lines: string[], p = OBS) => { const r = parseConfigSourceLines(lines, p); return r.state === 'parsed' ? 'parsed' : `${(r as { problem: string }).problem}@${(r as { lineIndex: number | null }).lineIndex}`; };
  const G2 = 'obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/other.yaml';
  const H = 'obs-otelcol: service-held — service observability-readonly';
  eq(st([O_GIT, O_LIVE]), 'parsed', 'a git-file base with its live-read: ');
  eq(st([O_LIVE, O_GIT]), 'parsed', '… in the other order: ');
  eq(st([O_GIT, O_LIVE, O_HELD, O_GIT2]), 'parsed', 'three labels, one paired: ');
  eq(st([O_GIT, G2]), 'duplicate-label@1', 'two git-file lines on one label: ');
  eq(st([O_GIT, H]), 'duplicate-label@1', 'git-file and service-held on one label (one base only): ');
  eq(st([H, O_GIT]), 'duplicate-label@1', '… in the other order: ');
  eq(st([O_GIT, O_LIVE, O_LIVE]), 'duplicate-label@2', 'a second live-read: ');
  eq(st([H, O_LIVE]), 'redundant-live-read@1', 'a live-read beside a service-held base: ');
  eq(st([O_LIVE, H]), 'redundant-live-read@0', '… in the other order (the live-read line is the one named): ');
  eq(st([O_LIVE]), 'live-read-without-base@0', 'a live-read alone: ');
  eq(st([O_GIT2, O_LIVE]), 'live-read-without-base@1', 'a live-read whose label has no base (another label does): ');
  // pairing none: a repeated label is duplicate-label, whatever the kinds — exactly as before
  for (const p of [K8S, TF]) {
    eq(st([K_GIT, 'sample-workloads: live-read — service k8s-rig-readonly'], p), 'duplicate-label@1', `${p} a git-file and a live-read on one label: `);
    eq(st([K_GIT, K_LIVE], p), 'parsed', `${p} two labels: `);
  }
  // the property decides, not the kinds present: the SAME entries under a `none` protocol are refused
  const paired = (parseConfigSourceLines([O_GIT, O_LIVE], OBS) as { entries: ConfigSourceLine[] }).entries;
  eq([configBlockRuleProblem(paired, OBS), configBlockRuleProblem(paired, K8S)], [null, { index: 1, problem: 'duplicate-label' }]);
});
test('GR3 the grammar version: 1 unless a PARSED block uses service-held or a pair; every Kubernetes and Terraform block is 1', () => {
  const v = (lines: string[], p = OBS) => resolveLegConfigSources({ protocol: p, contractValue: undefined, taskBody: block(lines) }).grammarVersion;
  eq([v([O_GIT]), v([O_GIT, O_GIT2]), v([O_HELD]), v([O_GIT, O_LIVE]), v([O_GIT, O_HELD])], [1, 1, 2, 2, 2], 'observability: ');
  eq([v([K_GIT, K_LIVE], K8S), v([K_GIT], TF)], [1, 1], 'Kubernetes / Terraform: ');
  eq([resolveLegConfigSources({ protocol: OBS, contractValue: undefined, taskBody: 'x' }).grammarVersion, v(['nope'])], [1, 1], 'absent / unparseable: ');
  eq([CONFIG_SOURCES_GRAMMAR_VERSION, [...CONFIG_SOURCES_GRAMMAR_VERSIONS]], [1, [1, 2]], 'the constant stays 1: ');
  eq(grammarVersionOfConfigEntries([]), 1);
  // the version is not part of sameness: it is derived from the entries
  assert(sameConfigDeclaration(resolveLegConfigSources({ protocol: OBS, contractValue: undefined, taskBody: block([O_GIT, O_LIVE]) }),
    resolveLegConfigSources({ protocol: OBS, contractValue: undefined, taskBody: block([O_LIVE, O_GIT]) })), 'line order changed the declaration');
});
test('GR4 the snapshot reader accepts versions 1 and 2 and CARRIES the stored version; the two REAL stored shapes read back key for key', () => {
  const rb = (s: unknown) => readConfigSourcesSnapshot({ [CONFIG_SOURCES_SNAPSHOT_KEY]: s });
  // the two shapes stored in production today (Kubernetes: a git-file and a live-read on two labels; Terraform: one git-file), grammar 1
  const k = { version: 1, takenAt: '2026-11-18T08:00:00.000Z', protocol: K8S, resolution: { state: 'parsed', grammarVersion: 1, source: 'contract',
    entries: [{ label: 'sample-workloads', kind: 'git-file', service: 'github-service', owner: 'paichart', repo: 'paichart-configs', path: 'k8s/sample-workloads.yaml', ref: null },
      { label: 'trading-cluster', kind: 'live-read', service: 'https://example.com/descriptors/k8s.json' }] } };
  const t = { version: 1, takenAt: '2026-11-18T21:30:00.000Z', protocol: TF, resolution: { state: 'parsed', grammarVersion: 1, source: 'task-body',
    entries: [{ label: 'main-tf', kind: 'git-file', service: 'github-service', owner: 'paichart', repo: 'paichart-configs', path: 'terraform/main.tf', ref: 'main' }] } };
  eq(rb(k), k, 'the stored Kubernetes shape: '); eq(rb(t), t, 'the stored Terraform shape: ');
  // grammar 2 round trip, with and without a labelCheck
  const s2 = snapObs([O_GIT, O_LIVE, O_HELD]);
  eq([s2.resolution.grammarVersion, s2.labelCheck], [2, { table: 'platform-file-targets/1', state: 'resolved' }], 'the built snapshot: ');
  eq(rb(JSON.parse(JSON.stringify(s2))), s2, 'grammar 2 round trip: ');
  // the stored version is CARRIED and must be the one the entries give — never rewritten, never trusted
  const stored = (g: unknown, base: unknown = s2) => ({ ...(base as object), resolution: { ...((base as { resolution: object }).resolution), grammarVersion: g } });
  eq(rb(stored(1)), 'unreadable', 'a paired block stored as version 1: ');
  eq(rb(stored(3)), 'unreadable', 'an unknown version: ');
  eq(rb(stored('2')), 'unreadable', 'a string version: ');
  eq(rb(stored(2, k)), 'unreadable', 'version 2 on a Kubernetes snapshot (its entries give 1 — control R4): ');
  eq(rb({ version: 1, takenAt: 't', protocol: OBS, resolution: { state: 'absent', grammarVersion: 2 } }), 'unreadable', 'a non-parsed state at version 2: ');
  eq(rb({ version: 1, takenAt: 't', protocol: OBS, resolution: { state: 'absent', grammarVersion: 1 } }), { version: 1, takenAt: 't', protocol: OBS, resolution: { state: 'absent', grammarVersion: 1 } });
  // the reader runs the block rule: a stored snapshot can never hold what the grammar refuses
  const two = (a: object, b: object, p: string) => ({ version: 1, takenAt: 't', protocol: p, resolution: { state: 'parsed', grammarVersion: 2, source: 'task-body', entries: [a, b] } });
  const H = { label: 'obs-otelcol', kind: 'service-held', service: 'observability-readonly' }; const L = { label: 'obs-otelcol', kind: 'live-read', service: 'observability-readonly' };
  eq(rb(two(H, L, OBS)), 'unreadable', 'a stored redundant live-read: ');
  eq(rb(two(H, { ...H, service: 'other' }, OBS)), 'unreadable', 'a stored duplicate base: ');
  eq(rb({ version: 1, takenAt: 't', protocol: K8S, resolution: { state: 'parsed', grammarVersion: 1, source: 'task-body', entries: [{ label: 'x', kind: 'service-held', service: 's' }] } }), 'unreadable', 'a service-held entry on a Kubernetes snapshot: ');
  eq(rb({ ...k, resolution: { ...k.resolution, entries: [{ ...k.resolution.entries[1], extra: 1 }] } }), 'unreadable', 'an entry with a fourth field: ');
});

console.log('── W6 / §13 A1 / §13 E: labels ──');
test('LB1 the split is at the FIRST `.`; ONE key function refuses empty, `.` and `..`; no platform target contains a `.`', () => {
  eq(configLabelParts('obs-otelcol'), { target: 'obs-otelcol', key: null });
  eq(configLabelParts('obs-ingress.otlp-ingress.conf'), { target: 'obs-ingress', key: 'otlp-ingress.conf' });
  eq(configLabelParts('obs-ingress..htpasswd'), { target: 'obs-ingress', key: '.htpasswd' });
  eq(configLabelParts('obs-ingress.'), { target: 'obs-ingress', key: '' });
  eq(['', '.', '..', 'a', '...', '.a'].map(configLabelKeyProblem), [true, true, true, false, false, false]);
  const targets = [...platformLabelTargets().keys()];
  assert(targets.includes('obs-otelcol') && targets.includes('obs-ingress'), `the platform targets: ${targets.join(', ')}`);
  for (const d of PLATFORM_DEFAULT_DESCRIPTORS) for (const f of d.files ?? []) {
    if ('const' in f.target) assert(!f.target.const.includes('.'), `platform target ${f.target.const} contains a "." — the first-"." split is no longer exact (plan §13 E)`);
  }
  const src = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/held-bytes/config-label.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  eq((src.match(/key === '\.\.'|=== '\.\.'/g) ?? []).length, 1, 'the key rule is written once: ');
  assert(!/lastIndexOf|longest/i.test(src), 'a longest-match resolver is back (cut by plan §13 E)');
});
test('LB2 resolution: a platform target or a named problem; only const and template paths resolve; the resolved path meets the never-held predicate', () => {
  eq(resolveConfigLabel('obs-otelcol'), { ok: true, target: 'obs-otelcol', path: '/etc/otelcol/config.yaml' });
  eq(resolveConfigLabel('obs-ingress.otlp-ingress.conf'), { ok: true, target: 'obs-ingress', path: '/etc/nginx/conf.d/otlp-ingress.conf' });
  eq(resolveConfigLabel('obs-ingress.operator-access.conf'), { ok: true, target: 'obs-ingress', path: '/etc/nginx/conf.d/operator-access.conf' });
  const prob = (l: string, d?: Descriptor[]) => { const r = resolveConfigLabel(l, d); return r.ok ? 'ok' : r.problem; };
  eq(prob('my-collector'), 'label-target-not-supported', 'a customer target (owner decision 10): ');
  eq(prob('observability-readonly'), 'label-target-not-supported', 'the service NAME is not a target: ');
  eq(prob('obs-ingress'), 'label-key-invalid', 'a several-file target with no key: ');
  eq(prob('obs-otelcol.config.yaml'), 'label-key-invalid', 'a one-file target with a key: ');
  eq([prob('obs-ingress.'), prob('obs-ingress..'), prob('obs-ingress...')], ['label-key-invalid', 'label-key-invalid', 'label-key-invalid'], 'empty / "." / "..": ');
  eq([prob('obs-ingress..htpasswd'), prob('obs-ingress.htpasswd'), prob('obs-ingress.tls.key'), prob('obs-ingress.server.pem')],
    ['path-never-held', 'path-never-held', 'path-never-held', 'path-never-held'], 'a key-named served path: ');
  const custom = (p: unknown): Descriptor[] => [{ descriptorVersion: 1, service: 's', tool: 't', files: [{ select: 'a', target: { const: 'tgt' }, path: p as never }] }];
  eq([prob('tgt', custom({ argument: 'path' })), prob('tgt', custom({ uri: 'path' })), prob('tgt', custom({ const: '/x' }))], ['label-path-not-resolvable', 'label-path-not-resolvable', 'ok'], 'argument / uri path sources: ');
  eq([...CONFIG_LABEL_PROBLEMS], ['label-target-not-supported', 'label-key-invalid', 'label-path-not-resolvable', 'path-never-held'], 'the closed problem set: ');
  // block level: the FIRST problem, with the index of its entry; every kind is checked
  const entries = (lines: string[]) => (parseConfigSourceLines(lines, OBS) as { entries: ConfigSourceLine[] }).entries;
  eq(resolveConfigLabels(entries([O_GIT, O_LIVE, O_HELD]), 'T'), { table: 'T', state: 'resolved' });
  eq(resolveConfigLabels(entries([O_GIT, 'my-collector: service-held — service observability-readonly']), 'T'), { table: 'T', state: 'problem', problem: 'label-target-not-supported', lineIndex: 1 });
  eq(resolveConfigLabels(entries(['my-collector: git-file — service github-service ; a/b/c.yaml']), 'T').state, 'problem', 'a git-file label must resolve too: ');
  eq([configLabelTableOf(OBS), configLabelTableOf(K8S), configLabelTableOf(TF)], ['platform-file-targets/1', null, null], 'which protocols check labels: ');
});
test('LB3 (A1) the label outcome is its OWN field: the resolution stays `parsed`; the governing read names the problem at every read; an edit still reads snapshot-changed', () => {
  const lines = ['my-collector: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml'];
  const s = snapObs(lines);
  eq([s.resolution.state, s.labelCheck], ['parsed', { table: 'platform-file-targets/1', state: 'problem', problem: 'label-target-not-supported', lineIndex: 0 }], 'the snapshot: ');
  const want = { state: 'unparseable', grammarVersion: 1, source: 'task-body', problem: 'label-target-not-supported', lineIndex: 0 };
  const first = governingConfigSources(row({ description: block(lines), snapshot: s }), OBS);
  const second = governingConfigSources(row({ description: block(lines), snapshot: JSON.parse(JSON.stringify(s)) }), OBS);
  eq(first, want, 'first persist: '); eq(second, want, 'second persist (the snapshot read back from JSON): ');
  eq(configGitFileForce(first, []), { reason: 'config-sources-unparseable' }, 'the carrier force: ');
  eq(governingConfigSources(row({ description: block([O_GIT]), snapshot: s }), OBS).state, 'snapshot-changed', 'the description edited afterwards: ');
  // the reader CARRIES labelCheck, accepts a snapshot WITHOUT it and WITH it, and validates it against the closed set
  const rb = (x: unknown) => readConfigSourcesSnapshot({ [CONFIG_SOURCES_SNAPSHOT_KEY]: x });
  const { labelCheck: _lc, ...without } = s; void _lc;
  // FAIL CLOSED (review, architectural F1): on a protocol WITH a label table a parsed snapshot that lacks the check, or names another
  // table, is unreadable — never "labels fine". The leg is then forced `config-sources-snapshot-unreadable`.
  eq(rb(s), s, 'with labelCheck: ');
  eq(rb(without), 'unreadable', 'a parsed observability snapshot WITHOUT labelCheck: ');
  eq(governingConfigSources(row({ description: block(lines), snapshot: without }), OBS), { state: 'snapshot-unreadable', grammarVersion: 1 }, '… governs as unreadable: ');
  eq(configGitFileForce(governingConfigSources(row({ description: block(lines), snapshot: without }), OBS), []), { reason: 'config-sources-snapshot-unreadable' }, '… and forces by that name: ');
  const good = snapObs([O_GIT]);
  eq(rb({ ...good, labelCheck: { table: 'another-table/1', state: 'resolved' } }), 'unreadable', 'a labelCheck naming ANOTHER table: ');
  const { labelCheck: _g, ...goodWithout } = good; void _g;
  eq(rb(goodWithout), 'unreadable', 'a parsed snapshot with RESOLVABLE labels but no stored check is still unreadable: ');
  // a NON-parsed observability snapshot carries no check (nothing to check) and reads back
  const un = configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: block(['nope']), interfaceContract: null, takenAt: 't' }, NONE);
  assert(un.action === 'write' && !('labelCheck' in un.snapshot), 'an unparseable block stored a labelCheck');
  eq(rb(JSON.parse(JSON.stringify(un.snapshot))), un.snapshot, 'an unparseable observability snapshot reads back without a check: ');
  eq(rb({ ...s, labelCheck: { table: 'T', state: 'problem', problem: 'made-up', lineIndex: 0 } }), 'unreadable', 'a problem name outside the closed set: ');
  eq(rb({ ...s, labelCheck: { table: 'T', state: 'resolved', extra: 1 } }), 'unreadable', 'an extra key: ');
  eq(rb({ ...s, labelCheck: 'resolved' }), 'unreadable', 'not an object: ');
  eq(rb({ ...s, labelCheck: { table: 'T', state: 'problem', problem: 'label-key-invalid', lineIndex: -1 } }), 'unreadable', 'a negative index: ');
  const k = buildConfigSourcesSnapshot(K8S, resolveLegConfigSources({ protocol: K8S, contractValue: undefined, taskBody: block([K_GIT]) }), 't');
  eq(rb({ ...k, labelCheck: { table: 'T', state: 'resolved' } }), 'unreadable', 'a labelCheck on a protocol with no label table: ');
  assert(!('labelCheck' in k), 'a Kubernetes snapshot gained a labelCheck — the 9 stored shapes would no longer be what the writer writes');
  // the reader and the line parser never consult the descriptor table (a later table edit cannot move a stored snapshot)
  const cs = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/config-sources.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert(!/config-label|descriptors/.test(cs), 'config-sources.ts imports the label resolver or the descriptor table');
});

console.log('── W5 row 1 / W7: the snapshot decision ──');
test('SN1 configSnapshotDecision: none while the row awaits its text; write for a forced protocol whatever it resolves to; runs-undeclared writes a block and REMOVES on absent', () => {
  const d = (protocol: string | null, description: string | null, aw: readonly string[] | undefined, type = 'PIPELINE', interfaceContract: unknown = null) =>
    configSnapshotDecision({ type, protocol, description, interfaceContract, takenAt: 'T' }, aw);
  // as shipped: observability is inert — the stamp statement is the one before Config sources
  eq(d(OBS, block([O_GIT]), SHIPPED), { action: 'none' }, 'observability as shipped, a block: ');
  eq(d(OBS, 'no block', SHIPPED), { action: 'none' }, 'observability as shipped, no block: ');
  // not a leg, no protocol, a protocol with no row
  eq([d(OBS, block([O_GIT]), NONE, 'ACTION'), d(null, 'x', NONE), d('network-provisioning-protocol', 'x', NONE)], [{ action: 'none' }, { action: 'none' }, { action: 'none' }]);
  // forced: unchanged in both states — a snapshot whatever the block resolves to, no labelCheck
  for (const [name, aw] of STATES) {
    const a = d(K8S, 'no block', aw); const b = d(TF, block([K_GIT]), aw);
    eq(a, { action: 'write', snapshot: { version: 1, takenAt: 'T', protocol: K8S, resolution: { state: 'absent', grammarVersion: 1 } } }, `${name} Kubernetes, no block: `);
    assert(b.action === 'write' && b.snapshot.resolution.state === 'parsed' && !('labelCheck' in b.snapshot), `${name} Terraform: ${JSON.stringify(b)}`);
    eq(JSON.stringify(a.action === 'write' && Object.keys(a.snapshot)), JSON.stringify(['version', 'takenAt', 'protocol', 'resolution']), `${name}: the stored key order moved: `);
  }
  // runs-undeclared, the text shipped
  eq(d(OBS, 'no block', NONE), { action: 'remove' }, 'no block ⇒ remove: ');
  eq(d(OBS, null, NONE), { action: 'remove' }, 'no description ⇒ remove: ');
  const w = d(OBS, block([O_GIT, O_LIVE]), NONE);
  assert(w.action === 'write' && w.snapshot.resolution.state === 'parsed' && w.snapshot.labelCheck?.state === 'resolved', `a block ⇒ write with the label check: ${JSON.stringify(w)}`);
  const u = d(OBS, block(['nope']), NONE);
  assert(u.action === 'write' && u.snapshot.resolution.state === 'unparseable' && !('labelCheck' in u.snapshot), `an unparseable block is snapshotted (never removed): ${JSON.stringify(u)}`);
});
test('SN2 the F-2 case (plan §3.3): an override run with no block, the block added, an ordinary run ⇒ the block is snapshotted then and governs', () => {
  // 1. the override run returns BEFORE the stamp writer: the leg has no stamp and no snapshot; with no block it is undeclared
  eq(governingConfigSources(row({ description: 'Tune the collector.', protocolStamped: false }), OBS), { state: 'not-config-source-leg' }, 'after the override run: ');
  // 2. the block is added; 3. the next ordinary prepare reaches the writer (the stamp is still absent — "first" means that)
  const d = configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: block([O_GIT]), interfaceContract: null, takenAt: 'T2' }, NONE);
  assert(d.action === 'write', JSON.stringify(d));
  eq(governingConfigSources(row({ description: block([O_GIT]), snapshot: d.snapshot, protocolStamped: true }), OBS).state, 'parsed', 'it governs from then: ');
});
test('SN3 the removal statement: ONE statement removes a snapshot the platform did not take and writes the stamp; a security event says so; the prepare step applies the decision only', () => {
  const prep = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/prepare-task-for-execution.ts'), 'utf8');
  const code = prep.replace(/\/\/.*$/gm, '');
  assert(code.includes(`UPDATE tasks SET metadata = (COALESCE(metadata, '{}'::jsonb) - '${CONFIG_SOURCES_SNAPSHOT_KEY}') || \${stampJson}::jsonb`), 'the removal statement: the key literal must equal CONFIG_SOURCES_SNAPSHOT_KEY');
  assert(/if \(configDecision\.action === 'remove'\) \{[\s\S]{0,700}securityEvent: true, errorCode: 'CONFIG_SOURCES_SNAPSHOT_REMOVED'[\s\S]{0,400}- 'configSourcesSnapshot'\)/.test(code), 'the removal arm does not log the security event before its statement');
  assert(/if \(CONFIG_SOURCES_SNAPSHOT_KEY in taskMeta\) \{\s*log\.warn\(/.test(code), 'the security event is not conditional on a snapshot having been there');
  // the unchanged statement is still the only other one, so every other leg's stamp is byte-identical
  eq((code.match(/UPDATE tasks SET metadata = COALESCE\(metadata, '\{\}'::jsonb\) \|\| \$\{stampJson\}::jsonb/g) ?? []).length, 1, 'the unchanged stamp statement: ');
  eq((code.match(/UPDATE tasks SET metadata/g) ?? []).length, 2, 'stamp statements in the prepare step: ');
  // the writer runs once: under the write-if-absent test on the stamp
  assert(/if \(contractCheck && !\('protocol' in taskMeta\)\) \{/.test(code), 'the stamp writer is no longer write-if-absent');
});
test('SN4 (W7 gate) every task-create SITE strips the platform-only keys, builds metadata from platform values only, or writes no metadata — there is NO unstripped class', () => {
  // The plan's gate: "every task-create path strips audit keys or builds metadata from platform values only". It was NOT true of the
  // tree until 2026-11-22 (STEP3-P1-BUILD.md finding W7-1; register TASK-CREATE-AUDIT-KEYS-UNSTRIPPED): four paths wrote caller- or
  // template-supplied metadata as given. They strip at the seam — the audit keys since `5438ee586`, and the run keys and the two
  // stamp keys since TASK-CREATE-BIRTH-KEYS (`stripPlatformKeysAtCreate`).
  //
  // HARDENED 2026-11-22 (sec-ops LOW 2 on `5438ee586`). The first form saw only `tx|prisma|db|client .task.create(` in lib/ and app/,
  // and asked of an already-classified file only that it strip SOMEWHERE. It now sees: any receiver (`this.x.task.create`,
  // `(tx as any).Task.create`); `createMany` / `createManyAndReturn` / `upsert`; a NESTED create (`tasks: { create`,
  // `task: { create`); raw `INSERT INTO tasks`; and the deployed files outside lib/ and app/ (`server.ts`,
  // `mcp-server-http-clean.js`, `services/`). Every create SITE is counted per file and judged on its own — a third create in
  // `put.ts`, or a second in any other file, turns it red.
  const ROOT = path.join(__dirname, '..');
  // A plain directory walk, NOT `git grep`: the public export is validated in a directory that is not a git repository (plan §9.5;
  // the first form of this pin called git and the ship's export dry run refused the push, 2026-11-21 — the second time this class
  // was caught there, after test-security-invariants PD20 on 2026-11-15).
  const walkSource = (dir: string, out: string[] = []): string[] => {
    if (!fs.existsSync(path.join(ROOT, dir))) return out;
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist' || e.name.startsWith('.git')) continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walkSource(rel, out);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  const DIRECT = /\.task\.(?:create|createMany|createManyAndReturn|upsert)\s*\(/gi;
  const NESTED = /\btasks?\s*:\s*\{\s*(?:create|createMany|connectOrCreate|upsert)\s*:/g; // a nested WRITE (`create:`); a query-extension hook is a method (`create(`), see lib/database/task-completed-at-extension.ts
  const RAW = /INSERT\s+INTO\s+(?:"?public"?\.)?"?tasks"?(?![\w"])/gi;
  const noComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const sitesOf = (t: string): number[] => [DIRECT, NESTED, RAW].flatMap((re) => [...t.matchAll(re)].map((m) => m.index ?? 0)).sort((a, b) => a - b);
  // the finder itself: each form it must see, and the look-alikes it must not count
  for (const form of ['await this.db.task.create({', 'await (tx as any).Task.create({', 'tx.task.createMany({', 'repo.task.createManyAndReturn({', 'prisma.task.upsert({',
    'stage: { create: { tasks: { create: [', 'tasks: { createMany: {', 'task: { create: {', 'await prisma.$executeRaw`INSERT INTO tasks (id) VALUES', 'INSERT INTO "tasks" (', 'insert into public.tasks(']) {
    eq(sitesOf(form).length, 1, `the create-site finder on \`${form}\`: `);
  }
  for (const form of ['tx.taskActivity.create({', 'tx.task.update({', 'tx.task.findMany({', 'INSERT INTO tasks_archive (', 'subtasks: { create: [', 'tasks: { connect: [', 'query: { task: { create({ args, query }) { return query(args); } } }']) {
    eq(sitesOf(form).length, 0, `the create-site finder must not count \`${form}\`: `);
  }
  const DEPLOYED_ROOT_FILES = ['server.ts', 'mcp-server-http-clean.js'].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const sources = [...walkSource('lib'), ...walkSource('app'), ...walkSource('services'), ...DEPLOYED_ROOT_FILES].filter((f) => !/\.test\.|__tests__/.test(f));
  assert(sources.length > 500 && sources.some((f) => f.startsWith('lib/mcp/')) && sources.some((f) => f.startsWith('app/api/')), `the walk found only ${sources.length} source files`);
  const text = new Map(sources.map((f) => [f, noComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))] as const));
  const found = Object.fromEntries(sources.map((f) => [f, sitesOf(text.get(f) as string).length] as const).filter(([, n]) => n > 0));
  /** Every file with a task-create site, its class, and HOW MANY sites it has. */
  const CLASS: Record<string, { cls: 'strips' | 'platform-values' | 'no-metadata'; sites: number }> = {
    'lib/mcp/tasks/action/handlers/task/task-create-handler.ts': { cls: 'platform-values', sites: 1 },
    'lib/tasks/services/task.ts': { cls: 'strips', sites: 1 },
    'lib/pov/handlers/put.ts': { cls: 'strips', sites: 2 },
    'lib/tasks/handlers/post.ts': { cls: 'no-metadata', sites: 1 },
    'app/api/pov/[povId]/phase/[phaseId]/stage/[stageId]/task/route.ts': { cls: 'strips', sites: 1 },
    'lib/pov/services/phase.ts': { cls: 'strips', sites: 1 },
    'lib/pov/services/phaseTemplate.ts': { cls: 'strips', sites: 1 },
    'lib/pov/phase-templates/storage.ts': { cls: 'strips', sites: 1 },
  };
  const byName = (o: Record<string, number>) => Object.entries(o).sort(([x], [y]) => (x < y ? -1 : 1));
  eq(byName(found), byName(Object.fromEntries(Object.entries(CLASS).map(([f, c]) => [f, c.sites]))), 'the task-create sites per file (a new file, or a new site in a listed file, must be classified here): ');
  /** For each site of a file: the text from the previous site (or the file start) to it, and the text from it to the next. */
  const windows = (f: string): Array<{ before: string; after: string }> => {
    const t = text.get(f) as string; const at = sitesOf(t);
    return at.map((i, n) => ({ before: t.slice(n ? at[n - 1] : 0, i), after: t.slice(i, n + 1 < at.length ? at[n + 1] : t.length) }));
  };
  const SEAMS = ['app/api/pov/[povId]/phase/[phaseId]/stage/[stageId]/task/route.ts', 'lib/pov/services/phase.ts', 'lib/pov/services/phaseTemplate.ts', 'lib/pov/phase-templates/storage.ts'];
  for (const f of SEAMS) {
    // the seam helper wraps the metadata VALUE the create writes (a call elsewhere in the file is not enough)
    for (const w of windows(f)) assert(/^[\s\S]{0,1200}?\bmetadata:\s*(?:data\.metadata\s*\?\s*)?stripPlatformKeysAtCreate\(/.test(w.after), `${f}: a task create no longer writes metadata through stripPlatformKeysAtCreate`);
  }
  // the helper drops all three classes, and never throws
  const helper = /export function stripPlatformKeysAtCreate[\s\S]*?\n\}/.exec(text.get('lib/tasks/services/protected-task-metadata.ts') as string)?.[0] ?? '';
  assert(/stripAuditFacts\(copy,/.test(helper) && /dropPlatformRunKeys\(copy, null,/.test(helper) && /enforceProtocolStampImmutable\(copy, null, [\s\S]{0,80}onViolation: 'strip-warn'/.test(helper) && !/\bthrow\b|onViolation: 'throw'/.test(helper),
    'stripPlatformKeysAtCreate no longer drops the audit keys, the run keys and the stamp keys (strip-warn, never a throw)');
  // put.ts: EACH of its two create branches runs the three calls on the object it then writes
  for (const w of windows('lib/pov/handlers/put.ts')) {
    assert(/stripAuditFacts\(taskMetadata\)/.test(w.before) && /enforceProtocolStampImmutable\(taskMetadata, null,[\s\S]{0,160}onViolation: 'strip-warn'/.test(w.before) && /dropPlatformRunKeys\(taskMetadata, null,/.test(w.before)
      && /^[\s\S]{0,1600}?\bmetadata: taskMetadata\b/.test(w.after), 'lib/pov/handlers/put.ts: a create branch does not strip the audit, stamp and run keys from the metadata it writes');
  }
  // TaskService.createTask: its one create runs the three calls on the copy it writes
  for (const w of windows('lib/tasks/services/task.ts')) {
    assert(/^[\s\S]{0,4000}?\bmetadata: taskData\.metadata \? \(\(\) => \{[\s\S]{0,900}?stripAuditFacts\(incoming, warn,[\s\S]{0,500}?enforceProtocolStampImmutable\(incoming, null,[\s\S]{0,120}?onViolation: 'strip-warn'[\s\S]{0,200}?dropPlatformRunKeys\(incoming, null,[\s\S]{0,200}?return incoming/.test(w.after),
      'lib/tasks/services/task.ts: its create no longer strips the audit, run and stamp keys from the metadata copy it writes');
  }
  assert(!/task\.create\(\{[\s\S]{0,900}?\bmetadata\b/.test(text.get('lib/tasks/handlers/post.ts') as string), 'lib/tasks/handlers/post.ts: classified "no-metadata" but its create writes metadata');
  // The MCP create handler builds metadata from the platform's contract write only — and is NOT a seam: it legitimately writes
  // `requiresInterfaceContract` (a run key) and `interfaceContractSource` (an audit key). A "consistency" edit adding a drop there
  // would erase the platform's own facts.
  const mcp = text.get('lib/mcp/tasks/action/handlers/task/task-create-handler.ts') as string;
  assert(/const created = await tx\.task\.create\(\{[\s\S]{0,1500}?\.\.\.contractWrite/.test(mcp) && !/metadata: (parameters|validatedParams|params)\./.test(mcp), 'the MCP create handler no longer builds metadata from the platform\'s contract write only');
  assert(!/\b(stripPlatformKeysAtCreate|dropPlatformRunKeys|stripAuditFacts|enforceProtocolStampImmutable)\(/.test(mcp) && /requiresInterfaceContract: true/.test(mcp) && /interfaceContractSource:/.test(mcp),
    'the MCP create handler must keep writing requiresInterfaceContract / interfaceContractSource and must NOT run a create-seam drop');
  // The two service methods that drop at birth are reached from CLIENT surfaces only. A new caller — a platform writer above all —
  // must be classified here before it can rely on, or be surprised by, the drop.
  const callers = (re: RegExp, self: string) => sources.filter((f) => f !== self && re.test(text.get(f) as string)).sort();
  eq(callers(/\bTaskService\.createTask\(/, 'lib/tasks/services/task.ts'), ['lib/tasks/handlers/task.ts'], 'the callers of TaskService.createTask (client-facing REST handler only): ');
  eq(callers(/\b[pP]haseService\.createTask\(/, 'lib/pov/services/phase.ts'), ['lib/pov/handlers/put.ts'], 'the callers of PhaseService.createTask (the POV editor save only): ');
});

Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
});
