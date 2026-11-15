/**
 * Config sources STEP 2 — the `## Config sources` grammar (lib/agents/harness/config-sources.ts), the config lane table
 * (variant.ts CONFIG_SOURCE_LANES) and the owner's six "the two tables never mix" checks (decision (b), 2026-11-15).
 *
 * The negatives are single-token mutations of a valid line: each must fail CLOSED with its named problem, never be "understood".
 * PURE: no DB.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-config-sources.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  parseConfigSourceLine, parseConfigSourceLines, parseConfigSourcesBlock, parseConfigSourcesContractValue, resolveLegConfigSources,
  sameConfigDeclaration, contractConfigSourcesValue, buildConfigSourcesSnapshot, readConfigSourcesSnapshot, declaredGitFiles,
  CONFIG_SOURCE_KINDS, CONFIG_SOURCE_KINDS_BY_PROTOCOL, CONFIG_SOURCES_SNAPSHOT_KEY, CONFIG_SOURCES_GRAMMAR_VERSION,
  // the network API, re-exported unchanged through the same module:
  parseDeviceSourceLine, parseDeviceSourcesBlock, resolveLegDeviceSources, contractDeviceSourcesValue,
} from '../lib/agents/harness/config-sources';
import * as net from '../lib/agents/harness/device-sources';
import {
  CONFIG_SOURCE_LANES, CONFIG_SOURCE_PROTOCOLS, CONFIG_SOURCE_AWAITING_TEXT, DEVICE_SOURCE_LANES, DEVICE_SOURCE_PROTOCOLS,
  configSourceLaneOf, configSourceContractKeyOf, deviceSourceLaneOf, deviceSourceContractKeyOf,
} from '../lib/agents/harness/held-bytes/variant';
import {
  CONFIG_SOURCES_READ_KEYS, DEVICE_SOURCES_READ_KEYS, configSourcesKeysOf, deviceSourcesKeysOf, RESOLVER_VERSION,
  INTERFACE_CONTRACT_SOURCE_KEYS,
} from '../lib/agents/harness/plan-spawn-carry';
import { AUDIT_STRIP_KEYS, stripAuditFacts } from '../lib/tasks/services/protected-task-metadata';
import { governingConfigSources, type LegConfigSourcesResolution } from '../lib/agents/harness/config-sources-read';
import { withConfigSourcesScope, configGitFileForce } from '../lib/agents/harness/held-bytes/config-source-scope';
import type { ExtractResult } from '../lib/agents/harness/held-bytes/extract';
import { computeConfigSourceReads, computeConfigLiveEvidence, computeConfigLiveEvidenceFromReadRecord } from '../lib/agents/harness/config-source-facts';
import { renderLiveEvidenceForPrompt, CONFIG_LIVE_EVIDENCE_SCOPE_CLAUSE, LIVE_EVIDENCE_RENDER_NAME, liveEvidenceVersionApplies } from '../lib/agents/harness/live-evidence';

const eq = (a: unknown, b: unknown, what = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const K8S = 'kubernetes-gitops-protocol';
const GIT = 'sample-workloads: git-file — service github-service ; paichart/paichart-configs/k8s/sample-workloads.yaml';
const GIT_REF = `${GIT} @ main`;
const LIVE = 'trading-cluster: live-read — service k8s-rig-readonly';
const LIVE_URL = 'trading-cluster: live-read — service https://example.com/descriptors/k8s.json';
const SUPPLIED = 'trading-cluster: supplied';
const gitEntry = { label: 'sample-workloads', kind: 'git-file', service: 'github-service', owner: 'paichart', repo: 'paichart-configs', path: 'k8s/sample-workloads.yaml', ref: null };

console.log('── the line grammar ──');
test('CS1 the three k8s kinds parse to their entries', () => {
  eq(parseConfigSourceLine(GIT, K8S), { ok: true, line: gitEntry });
  eq(parseConfigSourceLine(GIT_REF, K8S), { ok: true, line: { ...gitEntry, ref: 'main' } });
  eq(parseConfigSourceLine(LIVE, K8S), { ok: true, line: { label: 'trading-cluster', kind: 'live-read', service: 'k8s-rig-readonly' } });
  eq(parseConfigSourceLine(LIVE_URL, K8S), { ok: true, line: { label: 'trading-cluster', kind: 'live-read', service: 'https://example.com/descriptors/k8s.json' } });
  eq(parseConfigSourceLine(SUPPLIED, K8S), { ok: true, line: { label: 'trading-cluster', kind: 'supplied' } });
  eq(parseConfigSourceLine(`- \`${GIT}\``, K8S), { ok: true, line: gitEntry }, 'the protocol\'s own list marker + backticks: ');
  eq(parseConfigSourceLine(GIT, 'kubernetes-gitops'), { ok: true, line: gitEntry }, 'the short token names the same protocol: ');
});
test('CS2 single-token mutations fail closed, each with its named problem', () => {
  const bad = (line: string, problem: string) => eq(parseConfigSourceLine(line, K8S), { ok: false, problem }, `${line} → `);
  bad(GIT.replace(' — ', ' - '), 'separator-invalid');
  bad(GIT.replace(' ; ', ' , '), 'git-coordinates-invalid');
  bad(GIT.replace('paichart/paichart-configs/k8s/sample-workloads.yaml', 'paichart/paichart-configs'), 'git-coordinates-invalid');
  bad(GIT.replace('k8s/', '../'), 'git-coordinates-invalid');
  bad(`${GIT} @ a b`, 'ref-invalid');
  bad(`${GIT} @ main @ dev`, 'ref-invalid');
  bad(LIVE.replace('service k8s-rig-readonly', 'service a;b'), 'service-invalid');
  // an empty service: the trailing space is trimmed with the line, so the ` — service ` lead itself is incomplete (the network rule)
  bad(LIVE.replace('service k8s-rig-readonly', 'service '), 'separator-invalid');
  bad(`${SUPPLIED} — service x`, 'trailing-text');
  bad('trading cluster: supplied', 'not-a-source-line');
  bad('-cluster: supplied', 'device-name-invalid');
  bad('just some prose about the cluster', 'not-a-source-line');
});
test('CS3 a NETWORK kind is unknown here, and `supplied` is unknown in a Device sources block', () => {
  eq(parseConfigSourceLine('ceos1: device-read — service ceos-lab-readonly', K8S), { ok: false, problem: 'unknown-kind' });
  eq(parseConfigSourceLine('ceos1: command-package', K8S), { ok: false, problem: 'unknown-kind' });
  eq(parseDeviceSourceLine('trading-cluster: supplied'), { ok: false, problem: 'unknown-kind' });
});
test('CS4 a protocol with no kind table declares no Config sources (network, and a not-yet-built domain)', () => {
  for (const p of ['network-provisioning-protocol', 'network-derivation-protocol', 'observability-config-protocol', 'terraform-iac-protocol', 'nope']) {
    eq(parseConfigSourceLine(GIT, p), { ok: false, problem: 'unknown-kind' }, `${p}: `);
    eq(parseConfigSourceLines([GIT], p), { state: 'unparseable', problem: 'protocol-declares-no-config-sources', lineIndex: null }, `${p}: `);
  }
});
test('CS5 the kind-exhaustiveness walk: every kind of every protocol table parses from its template line', () => {
  const template: Record<string, string> = { 'git-file': GIT, 'live-read': LIVE, supplied: SUPPLIED };
  eq([...CONFIG_SOURCE_KINDS].sort(), Object.keys(template).sort(), 'a kind without a template line: ');
  for (const [protocol, kinds] of Object.entries(CONFIG_SOURCE_KINDS_BY_PROTOCOL)) {
    for (const k of kinds) {
      const r = parseConfigSourceLine(template[k], protocol);
      assert(r.ok && r.line.kind === k, `${protocol} ${k}`);
    }
  }
});

console.log('── the block ──');
test('CS6 one line per label; an empty block; too many lines', () => {
  eq(parseConfigSourceLines([GIT, LIVE], K8S).state, 'parsed');
  eq(parseConfigSourceLines([LIVE, SUPPLIED], K8S), { state: 'unparseable', problem: 'duplicate-label', lineIndex: 1 }, 'a cluster both read and supplied: ');
  eq(parseConfigSourceLines([GIT, GIT_REF], K8S), { state: 'unparseable', problem: 'duplicate-label', lineIndex: 1 });
  eq(parseConfigSourceLines(['', '  '], K8S), { state: 'unparseable', problem: 'empty-block', lineIndex: null });
  eq(parseConfigSourceLines(Array.from({ length: 257 }, (_, i) => `f${i}: supplied`), K8S), { state: 'unparseable', problem: 'too-many-lines', lineIndex: null });
  eq(parseConfigSourceLines([GIT, 'oops'], K8S), { state: 'unparseable', problem: 'not-a-source-line', lineIndex: 1 }, 'one bad line fails the whole block: ');
});
test('CS7 the task-body block: heading, end at blank line or next heading, two headings refused, the Device heading is not ours', () => {
  const body = `Intro.\n\n## Config sources\n\n${GIT}\n${LIVE}\n\nMore prose.\n## Next\nx: supplied\n`;
  const r = parseConfigSourcesBlock(body, K8S);
  assert(r.state === 'parsed' && r.entries.length === 2, JSON.stringify(r));
  eq(parseConfigSourcesBlock('no heading here', K8S), { state: 'absent' });
  eq(parseConfigSourcesBlock(null, K8S), { state: 'absent' });
  eq(parseConfigSourcesBlock(`## Config sources\n${GIT}\n\n## Config sources\n${LIVE}\n`, K8S).state, 'unparseable');
  eq(parseConfigSourcesBlock(`## Device sources\n${GIT}\n`, K8S), { state: 'absent' }, 'a Device sources heading is not a Config sources block: ');
  eq(parseDeviceSourcesBlock(`## Config sources\n${GIT}\n`), { state: 'absent' }, 'and the network parser does not read ours: ');
});
test('CS8 the contract value: string, array, one leading heading dropped, a non-line value named', () => {
  eq(parseConfigSourcesContractValue(`${GIT}\n${LIVE}`, K8S).state, 'parsed');
  eq(parseConfigSourcesContractValue([GIT, LIVE], K8S).state, 'parsed');
  eq(parseConfigSourcesContractValue(`## Config sources\n${GIT}`, K8S).state, 'parsed');
  eq(parseConfigSourcesContractValue(`${GIT}\n## Config sources`, K8S).state, 'unparseable');
  eq(parseConfigSourcesContractValue({ a: 1 }, K8S), { state: 'unparseable', problem: 'contract-value-not-lines', lineIndex: null });
  eq(parseConfigSourcesContractValue(undefined, K8S), { state: 'absent' });
});

console.log('── resolution, identity, snapshot ──');
test('CS9 resolve: contract wins over an equal body; a different body is a conflict; each side alone; absent', () => {
  const body = `## Config sources\n${LIVE}\n${GIT}\n`;
  const both = resolveLegConfigSources({ protocol: K8S, contractValue: [GIT, LIVE], taskBody: body });
  assert(both.state === 'parsed' && both.source === 'contract' && both.grammarVersion === CONFIG_SOURCES_GRAMMAR_VERSION, JSON.stringify(both));
  eq(resolveLegConfigSources({ protocol: K8S, contractValue: [GIT], taskBody: body }).state, 'conflict');
  const b = resolveLegConfigSources({ protocol: K8S, contractValue: undefined, taskBody: body });
  assert(b.state === 'parsed' && b.source === 'task-body', JSON.stringify(b));
  eq(resolveLegConfigSources({ protocol: K8S, contractValue: undefined, taskBody: 'nothing' }), { state: 'absent', grammarVersion: 1 });
  const u = resolveLegConfigSources({ protocol: K8S, contractValue: 'oops', taskBody: body });
  assert(u.state === 'unparseable' && u.source === 'contract', JSON.stringify(u));
});
test('CS10 sameConfigDeclaration: order-insensitive; a changed service, ref or path is a change', () => {
  const r = (lines: string[]) => resolveLegConfigSources({ protocol: K8S, contractValue: lines, taskBody: null });
  assert(sameConfigDeclaration(r([GIT, LIVE]), r([LIVE, GIT])), 'order');
  assert(!sameConfigDeclaration(r([GIT, LIVE]), r([GIT, LIVE.replace('k8s-rig-readonly', 'other-svc')])), 'live-read service');
  assert(!sameConfigDeclaration(r([GIT]), r([GIT_REF])), 'ref');
  assert(!sameConfigDeclaration(r([GIT]), r([GIT.replace('sample-workloads.yaml', 'other.yaml')])), 'path');
  assert(!sameConfigDeclaration(r([GIT]), r(['oops'])), 'state');
});
test('CS11 the snapshot round-trips every state, and a forged or foreign one is unreadable', () => {
  const states = [
    resolveLegConfigSources({ protocol: K8S, contractValue: [GIT_REF, LIVE], taskBody: null }),
    resolveLegConfigSources({ protocol: K8S, contractValue: [GIT, SUPPLIED], taskBody: null }),
    resolveLegConfigSources({ protocol: K8S, contractValue: undefined, taskBody: null }),
    resolveLegConfigSources({ protocol: K8S, contractValue: 'oops', taskBody: null }),
    resolveLegConfigSources({ protocol: K8S, contractValue: [GIT], taskBody: `## Config sources\n${LIVE}\n` }),
  ];
  for (const r of states) {
    const snap = buildConfigSourcesSnapshot('kubernetes-gitops', r, '2026-11-15T00:00:00.000Z');
    eq(snap.protocol, K8S, 'the snapshot names the canonical protocol: ');
    const back = readConfigSourcesSnapshot({ [CONFIG_SOURCES_SNAPSHOT_KEY]: snap });
    assert(back !== null && back !== 'unreadable' && sameConfigDeclaration(back.resolution, r), `${r.state}: ${JSON.stringify(back)}`);
  }
  const good = buildConfigSourcesSnapshot(K8S, states[0], 't');
  const read = (s: unknown) => readConfigSourcesSnapshot({ [CONFIG_SOURCES_SNAPSHOT_KEY]: s });
  eq(readConfigSourcesSnapshot({}), null);
  eq(read('x'), 'unreadable');
  eq(read({ ...good, version: 2 }), 'unreadable');
  eq(read({ ...good, protocol: 'network-provisioning-protocol' }), 'unreadable', 'a protocol with no kind table: ');
  eq(read({ ...good, protocol: 'kubernetes-gitops' }), 'unreadable', 'a non-canonical protocol name: ');
  const withEntries = (entries: unknown[]) => ({ ...good, resolution: { ...good.resolution, entries } });
  eq(read(withEntries([{ label: 'ceos1', kind: 'device-read', service: 'x' }])), 'unreadable', 'a network kind: ');
  eq(read(withEntries([{ ...gitEntry, path: '../etc/passwd' }])), 'unreadable', 'a path the grammar refuses: ');
  eq(read(withEntries([{ ...gitEntry, extra: 1 }])), 'unreadable', 'an extra key: ');
  eq(read(withEntries([{ label: 'c', kind: 'live-read', service: 'a\nb: supplied' }])), 'unreadable', 'a line break inside a field: ');
  eq(read(withEntries([{ label: 'c', kind: 'supplied' }, { label: 'c', kind: 'live-read', service: 's' }])), 'unreadable', 'a duplicate label: ');
  eq(read(withEntries([])), 'unreadable', 'parsed with no entries: ');
});
test('CS12 declaredGitFiles: the kept files of a parsed declaration, nothing for any other state', () => {
  eq(declaredGitFiles(resolveLegConfigSources({ protocol: K8S, contractValue: [GIT, LIVE], taskBody: null })).map((e) => e.path), ['k8s/sample-workloads.yaml']);
  eq(declaredGitFiles(resolveLegConfigSources({ protocol: K8S, contractValue: [LIVE], taskBody: null })), [], 'a block with no git-file keeps no file: ');
  eq(declaredGitFiles(resolveLegConfigSources({ protocol: K8S, contractValue: 'oops', taskBody: null })), []);
});
test('CS13 the snapshot key is platform-only: an AUDIT_STRIP_KEYS member, stripped from a client write', () => {
  assert((AUDIT_STRIP_KEYS as readonly string[]).includes(CONFIG_SOURCES_SNAPSHOT_KEY), 'configSourcesSnapshot is not an audit-strip key');
  const incoming: Record<string, unknown> = { [CONFIG_SOURCES_SNAPSHOT_KEY]: { forged: true }, other: 1 };
  stripAuditFacts(incoming);
  assert(!(CONFIG_SOURCES_SNAPSHOT_KEY in incoming) && incoming.other === 1, 'a forged snapshot survived the client strip');
});

console.log('── the network grammar is unchanged ──');
test('CS14 the network API re-exported through config-sources IS the device-sources API (same functions)', () => {
  assert(parseDeviceSourceLine === net.parseDeviceSourceLine && resolveLegDeviceSources === net.resolveLegDeviceSources
    && contractDeviceSourcesValue === net.contractDeviceSourcesValue, 're-export is not the same function');
});
test('CS15 the network line parser still honours ITS kind gate (the config grammar does not open it)', () => {
  net.__setLiveReadKindForLab(false);
  try {
    eq(net.parseDeviceSourceLine('ceos1: live-read — service ceos-lab-readonly'), { ok: false, problem: 'unknown-kind' }, 'network, gate closed: ');
    assert(parseConfigSourceLine(LIVE, K8S).ok, 'the k8s kind table, not the network gate, decides live-read for k8s');
  } finally { net.__setLiveReadKindForLab(null); }
  assert(net.parseDeviceSourceLine('ceos1: live-read — service ceos-lab-readonly').ok, 'network, gate as shipped');
});

console.log('── owner decision (b): the two tables never mix ──');
test('MIX1 disjoint tables: no protocol in both, no contract key in both', () => {
  const both = Object.keys(CONFIG_SOURCE_LANES).filter((p) => p in DEVICE_SOURCE_LANES);
  eq(both, [], 'a protocol in BOTH lane tables: ');
  const dk = Object.values(DEVICE_SOURCE_LANES).map((x) => x.contractKey);
  eq(Object.values(CONFIG_SOURCE_LANES).map((x) => x.contractKey).filter((k) => dk.includes(k)), [], 'a contract key in BOTH tables: ');
  for (const p of Object.keys(CONFIG_SOURCE_LANES)) {
    eq(deviceSourceLaneOf(p), null, `${p} has a DEVICE lane: `);
    eq(deviceSourceContractKeyOf(p), null, `${p} has a deviceSources key: `);
    assert(!DEVICE_SOURCE_PROTOCOLS.includes(p), `${p} is a Device-sources protocol`);
  }
  for (const p of Object.keys(DEVICE_SOURCE_LANES)) {
    eq(configSourceLaneOf(p), null, `${p} has a CONFIG lane: `);
    assert(!(p in CONFIG_SOURCE_KINDS_BY_PROTOCOL), `${p} has a Config-sources kind table`);
  }
});
test('MIX2 the plan-gate fact is derived from BOTH tables, never retyped; every read key reads as read in its own field', () => {
  eq(RESOLVER_VERSION, 4, 'resolver version: ');
  eq([...DEVICE_SOURCES_READ_KEYS].sort(), Object.values(DEVICE_SOURCE_LANES).map((x) => x.contractKey).sort(), 'device read keys: ');
  eq([...CONFIG_SOURCES_READ_KEYS].sort(), CONFIG_SOURCE_PROTOCOLS.map((p) => CONFIG_SOURCE_LANES[p].contractKey).sort(), 'config read keys: ');
  eq(deviceSourcesKeysOf({ deviceSources: Object.fromEntries(DEVICE_SOURCES_READ_KEYS.map((k) => [k, 'x'])) })?.notReadKeys, [], 'device: ');
  eq(configSourcesKeysOf({ configSources: Object.fromEntries(CONFIG_SOURCES_READ_KEYS.map((k) => [k, 'x'])) })?.notReadKeys, [], 'config: ');
  eq(INTERFACE_CONTRACT_SOURCE_KEYS.slice(-4), ['deviceSourcesKeys', 'configSourcesKeys', 'resolverVersion', 'at'], 'fact key order: ');
  eq(configSourcesKeysOf({ deviceSources: { 'network-provisioning': 'x' } }), null, 'no configSources ⇒ null: ');
  eq(configSourcesKeysOf({ configSources: 'lines' })?.shape, 'not-object');
});
test('MIX3 a key in the WRONG field is in that field\'s notReadKeys', () => {
  for (const k of Object.values(CONFIG_SOURCE_LANES).map((x) => x.contractKey)) {
    eq(deviceSourcesKeysOf({ deviceSources: { [k]: 'x' } })?.notReadKeys, [k], `${k} under deviceSources: `);
  }
  for (const k of DEVICE_SOURCES_READ_KEYS) {
    eq(configSourcesKeysOf({ configSources: { [k]: 'x' } })?.notReadKeys, [k], `${k} under configSources: `);
  }
  eq(configSourcesKeysOf({ configSources: { 'pipeline-1-k8s': 'x' } })?.notReadKeys, ['pipeline-1-k8s'], 'a leg-name key: ');
});
test('MIX4 a row awaiting its text is inert: no lane, no contract key, not read at the plan gate — and says so', () => {
  for (const p of CONFIG_SOURCE_AWAITING_TEXT) {
    assert(p in CONFIG_SOURCE_LANES, `${p} awaits text but has no row`);
    eq(configSourceLaneOf(p), null, `${p} lane: `);
    eq(configSourceContractKeyOf(p), null, `${p} key: `);
    const k = CONFIG_SOURCE_LANES[p].contractKey;
    assert(!CONFIG_SOURCES_READ_KEYS.includes(k), `${k} is read before its text shipped`);
    eq(configSourcesKeysOf({ configSources: { [k]: 'x' } })?.notReadKeys, [k], `${k} before its text: `);
  }
  eq([...CONFIG_SOURCE_PROTOCOLS].sort(), Object.keys(CONFIG_SOURCE_LANES).filter((p) => !CONFIG_SOURCE_AWAITING_TEXT.includes(p)).sort());
});
test('MIX5 awaiting-text ⇔ the seed text carries no `## Config sources` section (the J1 pin, for this table)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PROTOCOLS } = require('./seed-protocol-prompts') as { PROTOCOLS: Array<{ name: string; promptText: string }> };
  for (const p of Object.keys(CONFIG_SOURCE_LANES)) {
    const row = PROTOCOLS.find((x) => x.name === p);
    assert(row, `${p} has no seed row`);
    const carries = /^## Config sources\b/m.test(row.promptText);
    eq(CONFIG_SOURCE_AWAITING_TEXT.includes(p), !carries, `${p}: awaiting-text must equal "the text has no Config sources section" — `);
  }
});
test('MIX6 every table row has a kind table, and every kind table has a row', () => {
  eq(Object.keys(CONFIG_SOURCE_KINDS_BY_PROTOCOL).sort(), Object.keys(CONFIG_SOURCE_LANES).sort());
});
test('MIX7 no network module imports the config grammar, and the config grammar never reads `deviceSources`', () => {
  const H = path.join(__dirname, '..', 'lib', 'agents', 'harness');
  for (const f of ['device-sources.ts', 'device-sources-read.ts', 'device-source-facts.ts', 'device-source-facts-enrichment.ts', 'held-bytes/device-read-scope.ts']) {
    assert(!/from '\.\.?\/(?:\.\.\/)?config-sources'/.test(fs.readFileSync(path.join(H, f), 'utf8')), `${f} imports config-sources`);
  }
  const cs = fs.readFileSync(path.join(H, 'config-sources.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert(!/\.deviceSources\b|\['deviceSources'\]/.test(cs), 'config-sources.ts reads deviceSources');
});

console.log('── slice 2: the governing declaration, what a leg may hold, what it must hold ──');
const TGT = 'github:paichart:paichart-configs';
const snapOf = (lines: string[]) => buildConfigSourcesSnapshot(K8S, resolveLegConfigSources({ protocol: K8S, contractValue: undefined, taskBody: `## Config sources\n${lines.join('\n')}\n` }), 't');
const body = (lines: string[]) => `Change the workloads.\n\n## Config sources\n${lines.join('\n')}\n\n## Notes\nx\n`;
const parsed = (lines: string[]) => governingConfigSources({ description: body(lines), contract: null, snapshot: snapOf(lines) }, K8S);
const exOf = (paths: string[], extra: Array<{ target: string; path: string }> = []): ExtractResult => ({
  files: [...paths.map((p) => ({ target: TGT, path: p })), ...extra].map((f, i) => ({ ...f, toolCallIndex: i, serviceName: 'github-service', serviceId: null,
    identitySource: 'envelope', sourceTool: 'get_file_contents', selector: 's', text: 'kind: X\n', declaredBy: 'platform-default', declarationSha256: null,
    eligibility: 'platform', grantPovId: null, descriptorVersion: 1, sourceRevision: 'a'.repeat(40) })),
  refusals: [], stats: {}, registrantUndeclaredTools: [],
} as unknown as ExtractResult);

test('RD1 the snapshot governs: parsed when the live text still resolves to it; absent / unreadable / changed are named', () => {
  eq(parsed([GIT, LIVE]).state, 'parsed', 'unchanged: ');
  eq(governingConfigSources({ description: body([GIT]), contract: null, snapshot: null }, K8S), { state: 'snapshot-absent', grammarVersion: 1 }, 'no snapshot: ');
  eq(governingConfigSources({ description: body([GIT]), contract: null, snapshot: { version: 9 } }, K8S).state, 'snapshot-unreadable', 'bad snapshot: ');
  eq(governingConfigSources({ description: body([GIT.replace('sample-workloads.yaml', 'other.yaml')]), contract: null, snapshot: snapOf([GIT]) }, K8S).state,
    'snapshot-changed', 'an edit after the first execution is never adopted: ');
  eq(governingConfigSources({ description: body([GIT]), contract: null, snapshot: snapOf([GIT]) }, 'network-provisioning-protocol'), { state: 'not-config-source-leg' }, 'a network leg: ');
  // no block at all is a snapshot of `absent` — the governing state is `absent` (the harness stops, the carrier forces)
  const none = buildConfigSourcesSnapshot(K8S, resolveLegConfigSources({ protocol: K8S, contractValue: undefined, taskBody: 'no block' }), 't');
  eq(governingConfigSources({ description: 'no block', contract: null, snapshot: none }, K8S).state, 'absent', 'no block: ');
});
test('RD2 the contract value is read ONLY at configSources["kubernetes-gitops"] — a block under deviceSources is not this leg\'s', () => {
  const snap = buildConfigSourcesSnapshot(K8S, resolveLegConfigSources({ protocol: K8S, contractValue: `${GIT}\n${LIVE}`, taskBody: null }), 't');
  eq(governingConfigSources({ description: null, contract: { configSources: { 'kubernetes-gitops': `${GIT}\n${LIVE}` } }, snapshot: snap }, K8S).state, 'parsed', 'own field: ');
  eq(governingConfigSources({ description: null, contract: { deviceSources: { 'kubernetes-gitops': `${GIT}\n${LIVE}` } }, snapshot: snap }, K8S).state, 'snapshot-changed', 'wrong field reads as no declaration: ');
});
test('SC1 a leg that is not a Config-sources leg: capture is the SAME object (byte-identical by construction)', () => {
  const ex = exOf(['/k8s/sample-workloads.yaml', '/k8s/other.yaml']);
  assert(withConfigSourcesScope(ex, null) === ex && withConfigSourcesScope(ex, undefined) === ex && withConfigSourcesScope(ex, { state: 'not-config-source-leg' }) === ex, 'the result object changed');
});
test('SC2 undeclared never held: a Git file the pin admits but no line declares is moved to a handleless refusal (the negative control)', () => {
  const out = withConfigSourcesScope(exOf(['/k8s/sample-workloads.yaml', '/k8s/other.yaml']), parsed([GIT, LIVE]));
  eq(out.files.map((f) => f.path), ['/k8s/sample-workloads.yaml'], 'held: ');
  eq(out.refusals.map((r) => [r.refusal, r.target, r.path, r.detail]), [['git-file-not-declared', null, null, { field: 'declaration' }]], 'refused: ');
  assert(!('text' in out.refusals[0]) && !('sourceRevision' in out.refusals[0]), 'the refusal carries the file text or revision');
});
test('SC3 a declaration that is not parsed declares nothing: every Git file is refused, named by state; a non-Git file is untouched', () => {
  for (const st of ['absent', 'conflict', 'snapshot-absent', 'snapshot-unreadable', 'snapshot-changed'] as const) {
    const out = withConfigSourcesScope(exOf(['/k8s/sample-workloads.yaml'], [{ target: 'obs-otelcol', path: '/etc/otelcol/config.yaml' }]),
      { state: st, grammarVersion: 1 } as LegConfigSourcesResolution);
    eq(out.files.map((f) => f.target), ['obs-otelcol'], `${st} files: `);
    eq(out.refusals[0].detail, { field: 'declaration', state: st }, `${st} detail: `);
  }
});
test('SC4 a `live-read` or `supplied` line holds nothing; a block with no git-file line keeps no file', () => {
  const out = withConfigSourcesScope(exOf(['/k8s/sample-workloads.yaml']), parsed([LIVE]));
  eq(out.files.length, 0, 'files: ');
  eq(withConfigSourcesScope(exOf(['/k8s/sample-workloads.yaml']), parsed([SUPPLIED])).files.length, 0, 'supplied: ');
});
test('SC5 a line whose ref the platform pin never admits is not satisfied by the file held at that path (another revision)', () => {
  const offRef = parsed([`${GIT} @ feature-x`]);
  eq(withConfigSourcesScope(exOf(['/k8s/sample-workloads.yaml']), offRef).files.length, 0, 'held: ');
  eq(configGitFileForce(offRef, [{ target: TGT, path: '/k8s/sample-workloads.yaml' }])?.reason, 'git-file-not-held', 'force: ');
  eq(configGitFileForce(parsed([GIT_REF]), [{ target: TGT, path: '/k8s/sample-workloads.yaml' }]), null, '@ main is the pin\'s ref: ');
});
test('FC1 the D-1 force: every declared git-file line needs a held capture ref; labels named; live-read / supplied never force', () => {
  const two = parsed([GIT, 'flags: git-file — service github-service ; paichart/paichart-configs/k8s/orders-api-flags.yaml', LIVE]);
  eq(configGitFileForce(two, [{ target: TGT, path: '/k8s/sample-workloads.yaml' }, { target: TGT, path: '/k8s/orders-api-flags.yaml' }]), null, 'both held: ');
  eq(configGitFileForce(two, [{ target: TGT, path: '/k8s/sample-workloads.yaml' }]), { reason: 'git-file-not-held', gitFilesNotHeld: ['flags'], gitFilesNotHeldTotal: 1 }, 'one missing: ');
  eq(configGitFileForce(two, []), { reason: 'git-file-not-held', gitFilesNotHeld: ['sample-workloads', 'flags'], gitFilesNotHeldTotal: 2 }, 'none held: ');
  eq(configGitFileForce(parsed([LIVE]), []), null, 'a Git-less block: ');
  eq(configGitFileForce(parsed([SUPPLIED]), []), null, 'supplied: ');
});
test('FC2 a declaration that is not parsed forces by its own name; a non-Config-sources leg never forces; a capture refusal wins', () => {
  eq(configGitFileForce({ state: 'not-config-source-leg' }, []), null, 'off-lane: ');
  for (const st of ['absent', 'unparseable', 'conflict', 'snapshot-absent', 'snapshot-unreadable', 'snapshot-changed', 'could-not-check']) {
    eq(configGitFileForce({ state: st, grammarVersion: 1 } as LegConfigSourcesResolution, [{ target: TGT, path: '/k8s/sample-workloads.yaml' }])?.reason, `config-sources-${st}`, `${st}: `);
  }
  eq(configGitFileForce(parsed([GIT]), [{ target: TGT, path: '/k8s/sample-workloads.yaml' }], 'config-sources-snapshot-changed')?.reason, 'config-sources-snapshot-changed', 'capture refusal: ');
});
test('WR1 wiring: ONE snapshot write (prepare), the scope at capture, the force in the carrier — and each is keyed on the Config lane, never the device lane', () => {
  const rd = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const prep = rd('lib/agents/harness/prepare-task-for-execution.ts');
  eq((prep.match(/CONFIG_SOURCES_SNAPSHOT_KEY/g) ?? []).length, 2, 'the import + the one write: ');
  assert(/const configLane = contractCheck\.type === 'PIPELINE' \? configSourceLaneOf\(resolved\.protocol\) : null;/.test(prep), 'the snapshot is not gated on the config lane');
  assert(/default: assertNeverConfigLane\(configLane\);/.test(prep), 'the lane switch is not exhaustive');
  const cap = rd('lib/services/held-bytes-capture.ts');
  assert(cap.includes('withConfigSourcesScope(withDeviceEvidenceOnly(') && cap.includes('}), args.deviceRead), args.configSources);'), 'capture does not apply the scope');
  const core = rd('lib/services/execution-core.ts');
  assert(core.includes('owningLeg.configSourceProtocol\n      ? await readLegConfigSources(prisma as never, owningLeg) : null;'), 'the core does not read the declaration on a Config-sources leg only');
  const car = rd('lib/agents/harness/held-edit-carrier.ts');
  assert(car.includes('if (isConfigSourceLeg({ title: task.title ?? null, metadata: task.metadata })) {') && car.includes('configForce = configGitFileForce(sources, refs);'), 'the carrier does not apply the force');
  assert(/: deviceForce && !readError \? \{ \.\.\.base, reason: deviceForce\.reason \}\s*\n\s*: configForce && !readError/.test(car), 'precedence: the config force must follow the device force');
});
test('WR2 inert until the text: while kubernetes-gitops awaits its text, no leg resolves as a Config-sources leg', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const V = require('../lib/agents/harness/held-bytes/variant');
  const leg = { title: 'x (protocol: kubernetes-gitops)', metadata: { protocol: K8S } };
  eq(V.isConfigSourceLeg(leg), !CONFIG_SOURCE_AWAITING_TEXT.includes(K8S), 'isConfigSourceLeg: ');
  eq(V.isConfigSourceLeg({ title: 'x (protocol: network-provisioning)', metadata: { protocol: 'network-provisioning-protocol' } }), false, 'a network leg: ');
});

console.log('── multi-leg (owner decision 2026-11-15: every leg holds every declared file of its protocol\'s block) ──');
const legLine = (i: number) => `leg${i}-file: git-file — service github-service ; paichart/paichart-configs/k8s/leg${i}.yaml`;
const sharedBlock = (n: number) => [...Array.from({ length: n }, (_, i) => legLine(i + 1)), LIVE];
const refsOf = (ids: number[]) => ids.map((i) => ({ target: TGT, path: `/k8s/leg${i}.yaml` }));
test('ML1 one shared block at 2, 3, 4 and 8 k8s legs: a leg that holds every declared file is not forced, and holds exactly the declared set', () => {
  for (const n of [2, 3, 4, 8]) {
    const lines = sharedBlock(n);
    const all = Array.from({ length: n }, (_, i) => i + 1);
    for (let leg = 1; leg <= n; leg++) {
      const res = parsed(lines); // every leg resolves the SAME block: the contract reaches each leg verbatim
      eq(configGitFileForce(res, refsOf(all)), null, `${n} legs, leg ${leg}: `);
      const out = withConfigSourcesScope(exOf([...all.map((i) => `/k8s/leg${i}.yaml`), '/k8s/not-declared.yaml']), res);
      eq(out.files.map((f) => f.path), all.map((i) => `/k8s/leg${i}.yaml`), `${n} legs, leg ${leg} holds: `);
      eq(out.refusals.length, 1, `${n} legs, leg ${leg} undeclared refused: `);
    }
  }
});
test('ML2 at every leg count, a leg missing ANY declared file is forced, with that file\'s label named', () => {
  for (const n of [2, 3, 4, 8]) {
    const res = parsed(sharedBlock(n));
    for (let missing = 1; missing <= n; missing++) {
      const held = Array.from({ length: n }, (_, i) => i + 1).filter((i) => i !== missing);
      eq(configGitFileForce(res, refsOf(held)), { reason: 'git-file-not-held', gitFilesNotHeld: [`leg${missing}-file`], gitFilesNotHeldTotal: 1 }, `${n} legs, file ${missing} missing: `);
    }
    eq(configGitFileForce(res, refsOf([1]))?.gitFilesNotHeldTotal, n - 1, `${n} legs, only its "own" file read: `);
  }
});
test('ML3 a mixed program: k8s legs beside network change + value legs — the two tables and contract fields do not mix', () => {
  const contract = {
    deviceSources: { 'network-provisioning': 'ceos1: command-package', 'network-derivation': 'ceos1: command-package' },
    configSources: { 'kubernetes-gitops': sharedBlock(2).join('\n') },
  };
  const k = resolveLegConfigSources({ protocol: K8S, contractValue: contractConfigSourcesValue(contract, 'kubernetes-gitops'), taskBody: null });
  eq(k.state === 'parsed' ? k.entries.map((e) => e.label) : k.state, ['leg1-file', 'leg2-file', 'trading-cluster'], 'the k8s leg reads its own field only: ');
  // a network leg reads its own field, exactly as before
  eq(resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(contract), taskBody: null }).state, 'parsed', 'the network change leg: ');
  eq(resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(contract, 'network-derivation'), taskBody: null }).state, 'parsed', 'the network value leg: ');
  // a network leg is never a Config-sources leg, and a k8s leg is never a Device-sources leg
  eq(governingConfigSources({ description: null, contract, snapshot: null }, 'network-provisioning-protocol'), { state: 'not-config-source-leg' }, 'network leg, config lane: ');
  eq(deviceSourceLaneOf(K8S), null, 'k8s leg, device lane: ');
  // the k8s block under the WRONG field declares nothing for the k8s leg; the network key under configSources declares nothing either
  const wrong = { deviceSources: { 'kubernetes-gitops': sharedBlock(2).join('\n') }, configSources: { 'network-provisioning': 'ceos1: supplied' } };
  eq(resolveLegConfigSources({ protocol: K8S, contractValue: contractConfigSourcesValue(wrong, 'kubernetes-gitops'), taskBody: null }).state, 'absent', 'wrong field: ');
  eq(configSourcesKeysOf(wrong)?.notReadKeys, ['network-provisioning'], 'plan-gate fact, configSources: ');
  eq(deviceSourcesKeysOf(wrong)?.notReadKeys, ['kubernetes-gitops'], 'plan-gate fact, deviceSources: ');
});

console.log('── slice 3a: configSourceReads + the liveEvidence Config arm ──');
const call = (service: string, tool: string, args: Record<string, unknown>, o: { ok?: boolean; truncated?: boolean } = {}) => ({
  tool: 'services', success: o.ok !== false, arguments: { action: 'call', targetService: service, tool, arguments: args },
  result: { ...(o.truncated ? { truncated: true } : {}), ...(o.ok === false ? { isError: true } : {}),
    content: [{ type: 'data', data: { success: o.ok !== false, targetService: service, tool, arguments: args, result: {} } }] },
});
const gitCall = (p: string, o: { ok?: boolean; ref?: string } = {}) => call('github-service', 'get_file_contents', { owner: 'paichart', repo: 'paichart-configs', path: p, ...(o.ref ? { ref: o.ref } : {}) }, o);
const liveCall = (o: { ok?: boolean; truncated?: boolean } = {}) => call('k8s-rig-readonly', 'get_resource', { resourceType: 'deployments', namespace: 'trading', name: 'orders-api' }, o);
const itemsOf = (r: Record<string, unknown>) => (r.items as Array<Record<string, unknown>>).map((i) => [i.label, i.kind, (i.read as Record<string, unknown> | undefined)?.state ?? null]);

test('CF1 configSourceReads: each declared line with its read state — Git read by call index, live read by successful-call count, supplied no read', () => {
  const r = computeConfigSourceReads(parsed([GIT, LIVE]), [gitCall('k8s/sample-workloads.yaml', { ref: 'main' }), liveCall(), liveCall()]);
  eq([r.checked, r.notRead, r.undeclaredGitFileReads], [true, 0, 0], 'header: ');
  eq(itemsOf(r), [['sample-workloads', 'git-file', 'read'], ['trading-cluster', 'live-read', 'read']], 'items: ');
  eq(((r.items as Array<Record<string, unknown>>)[0].read as Record<string, unknown>).toolCallIndex, 0, 'git call index: ');
  eq(((r.items as Array<Record<string, unknown>>)[1].read as Record<string, unknown>).calls, 2, 'live calls: ');
  eq(itemsOf(computeConfigSourceReads(parsed([SUPPLIED]), [])), [['trading-cluster', 'supplied', null]], 'supplied: ');
});
test('CF2 not-read / read-failed / result-truncated are named, never guessed; a call to another path or service reads nothing', () => {
  const none = computeConfigSourceReads(parsed([GIT, LIVE]), [gitCall('k8s/other.yaml'), call('other-service', 'get_resource', {})]);
  eq(itemsOf(none), [['sample-workloads', 'git-file', 'not-read'], ['trading-cluster', 'live-read', 'not-read']], 'not read: ');
  eq(none.notRead, 2, 'notRead: ');
  const failed = computeConfigSourceReads(parsed([GIT, LIVE]), [gitCall('k8s/sample-workloads.yaml', { ok: false }), liveCall({ ok: false })]);
  eq(itemsOf(failed), [['sample-workloads', 'git-file', 'read-failed'], ['trading-cluster', 'live-read', 'read-failed']], 'failed: ');
  eq(failed.notRead, 0, 'a failed read is not "not-read": ');
  // an absent ref MEANS main on both sides (push 0), and a line naming another ref is not read by a main call
  eq(itemsOf(computeConfigSourceReads(parsed([GIT_REF]), [gitCall('k8s/sample-workloads.yaml')]))[0][2], 'read', '@ main vs no ref: ');
  eq(itemsOf(computeConfigSourceReads(parsed([`${GIT} @ feature-x`]), [gitCall('k8s/sample-workloads.yaml', { ref: 'main' })]))[0][2], 'not-read', 'another ref: ');
});
test('CF3 a declaration that is not parsed is passed through by name — no items, no counts', () => {
  for (const st of ['absent', 'conflict', 'snapshot-changed'] as const) {
    const r = computeConfigSourceReads({ state: st, grammarVersion: 1 } as LegConfigSourcesResolution, [liveCall()]);
    eq([r.checked, r.reason, 'items' in r], [false, `config-sources-${st}`, false], `${st}: `);
  }
});
test('LE1 liveEvidence Config arm: every line in exactly one bucket; the summary comes from the counts', () => {
  const le = (lines: string[], calls: unknown[]) => computeConfigLiveEvidence(parsed(lines), calls);
  const sum = (f: Record<string, unknown>) => (f.liveRead as number) + (f.liveNotRead as unknown[]).length + (f.gitFileLines as number) + (f.supplied as number);
  const cases: Array<[string[], unknown[], string]> = [
    [[GIT, LIVE], [gitCall('k8s/sample-workloads.yaml'), liveCall()], 'all-read'],
    [[GIT, LIVE], [gitCall('k8s/sample-workloads.yaml')], 'some-not-read'],
    [[GIT], [gitCall('k8s/sample-workloads.yaml')], 'git-only'],
    [[GIT], [], 'git-only'],
    [[SUPPLIED], [], 'none-declared'],
    [[LIVE], [liveCall()], 'all-read'],
  ];
  for (const [lines, calls, want] of cases) {
    const f = le(lines, calls);
    eq([f.lane, f.checked, f.summary], ['config', true, want], `${lines.join(' | ')}: `);
    eq(sum(f), f.items, `bucket sum (${want}): `);
  }
  eq(computeConfigLiveEvidenceFromReadRecord({ checked: false, reason: 'config-sources-absent', declaration: { state: 'absent' } }),
    { version: 1, lane: 'config', point: 'harvester', checked: false, reason: 'config-sources-absent', declaration: { state: 'absent' } }, 'non-parsed: ');
});
test('LE2 the §6 render of the Config arm: the same fact name, its own words (lines, not devices), facts only', () => {
  const lines = renderLiveEvidenceForPrompt(computeConfigLiveEvidence(parsed([GIT, LIVE]), [gitCall('k8s/sample-workloads.yaml')]))!;
  assert(lines[0].startsWith(`- **Live evidence — ${LIVE_EVIDENCE_RENDER_NAME}**: \`some-not-read\` ${CONFIG_LIVE_EVIDENCE_SCOPE_CLAUSE}`), lines[0]);
  assert(lines.some((l) => l.includes('live read declared, not read: `trading-cluster` (not-read)')), lines.join('\n'));
  assert(lines.some((l) => l.includes('Git files: `sample-workloads` (read)')), lines.join('\n'));
  assert(!/device/i.test(lines.join('\n')), 'the Config arm names a device');
  assert(!/\b(must|should|blocking|approve|reject|fail|pass)\b/i.test(lines.join('\n')), 'a verdict word in a fact render');
  const gitOnly = renderLiveEvidenceForPrompt(computeConfigLiveEvidence(parsed([GIT]), [gitCall('k8s/sample-workloads.yaml')]))!;
  assert(gitOnly[0].includes('`git-only`') && gitOnly[0].includes('0 declare a live read'), gitOnly[0]);
  const nc = renderLiveEvidenceForPrompt({ lane: 'config', checked: false, reason: 'config-sources-absent' })!;
  assert(nc.length === 1 && nc[0].includes('not checked — config-sources-absent') && nc[0].includes('Config sources declaration'), nc[0]);
});
test('LE3 the network render is untouched by the Config arm (a fact with no `lane` renders as before)', () => {
  const net = renderLiveEvidenceForPrompt({ checked: true, summary: 'all-read', items: 1, liveDeclared: 1, liveRead: 1, notApplicable: 0, liveNotRead: [], gitOnly: [],
    liveReadDevices: [{ device: 'ceos1', kind: 'device-read', toolCallIndex: 3 }], notApplicableDevices: [], contractDevices: { checked: false, reason: 'no-contract' } })!;
  assert(net[0].includes('device(s) declared') && net.some((l) => l.includes('read whole: `ceos1`')), net.join('\n'));
});
test('REG1 registration: configSourceReads once, LAST, leaf-persist, conditional; on the operator tail and off the summary; k8s versioned at 1.19.0', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MECHANICAL_NETS } = require('../lib/agents/harness/mechanical-nets') as { MECHANICAL_NETS: Array<{ name: string; point: string; conditionalStampReason?: string; renderPrompt: unknown; renderCard: unknown }> };
  const mine = MECHANICAL_NETS.filter((n) => n.name === 'configSourceReads');
  eq(mine.length, 1, 'registrations: ');
  // appended last when shipped; slice 3b appended the two drift entries after it (the exact tail is pinned in test-quote-fidelity)
  eq(MECHANICAL_NETS.slice(-3).map((n) => n.name), ['configSourceReads', 'platformDriftCalls', 'gitLiveDrift'], 'the Config-sources tail: ');
  eq([mine[0].point, mine[0].conditionalStampReason, mine[0].renderPrompt, mine[0].renderCard], ['leaf-persist', 'not-config-source-leg', null, null], 'shape: ');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const EA = require('../lib/services/execution-artifacts') as { RESULT_JSON_OPERATOR_TAIL_KEYS: readonly string[]; RESULT_JSON_SUMMARY_KEYS: readonly string[] };
  eq(EA.RESULT_JSON_OPERATOR_TAIL_KEYS.slice(-3), ['configSourceReads', 'platformDriftCalls', 'gitLiveDrift'], 'operator tail, appended: ');
  assert(!EA.RESULT_JSON_SUMMARY_KEYS.includes('gitLiveDrift') && !EA.RESULT_JSON_SUMMARY_KEYS.includes('platformDriftCalls'), 'a drift key is on the summary');
  assert(!EA.RESULT_JSON_SUMMARY_KEYS.includes('configSourceReads'), 'configSourceReads is on the summary');
  eq(liveEvidenceVersionApplies({ delta: { name: K8S, version: '1.18.0' } }), false, 'k8s 1.18.0: ');
  eq(liveEvidenceVersionApplies({ delta: { name: K8S, version: '1.19.0' } }), true, 'k8s 1.19.0: ');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
