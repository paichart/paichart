/**
 * ARCHITECT-COMPOSED-DESCRIPTOR (owner 2026-11-17): the platform derives `serviceDescriptors` from the declared read lines.
 * Pure suite — every rule BOTH ways, on real production contracts (scripts/fixtures/service-descriptors/corpus-contracts.json, the
 * CORPUS.md population, trimmed to the three fields the derivation reads) plus synthetic shapes the corpus has not produced yet.
 * The real create path (supplied arm, absent arm, Node C inherit) is in scripts/test-plan-spawn-carry-behavioral.ts § SD.
 *
 * Run: npm run test:service-descriptors-derivation
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  deriveServiceDescriptors, deriveForToken, knownDescriptorTokens, isUsableDescriptorValue, descriptorOnlyTokens,
  configLineService, isKeptWithoutServiceLine, isWholeTokenDescriptorUrl, KEPT_DESCRIPTOR_URL_MAX_CHARS, SERVICE_DESCRIPTORS_FACT_VERSION,
} from '../lib/agents/harness/service-descriptors-derivation';
import { CONFIG_SOURCE_KINDS, type ConfigSourceLine } from '../lib/agents/harness/config-sources';
import { CONFIG_SOURCE_AWAITING_TEXT, descriptorWithoutServiceLineOf } from '../lib/agents/harness/held-bytes/variant';
import { deliverContract, canonicalContractSha, PLAN_CONTRACT_MAX_BYTES, decideCreateContract, type PlanContractResult } from '../lib/agents/harness/plan-spawn-carry';
import { CONFIG_SOURCE_LANES, CONFIG_SOURCE_PROTOCOLS, DEVICE_SOURCE_LANES } from '../lib/agents/harness/held-bytes/variant';

let pass = 0, fail = 0;
function test(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`✅ ${name}`); } catch (e) { fail++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, m = '') {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}expected ${y}, got ${x}`);
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
/** The derivation's output, typed loosely for reading in assertions. */
const D = (c: Record<string, unknown>) => { const r = deriveServiceDescriptors(c); return { contract: r.contract as Record<string, any>, fact: r.fact }; };

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/service-descriptors/corpus-contracts.json'), 'utf8')).programs as
  Record<string, { note: string; contract: Record<string, any> }>;
const C = (root: string) => JSON.parse(JSON.stringify(FIX[root].contract)) as Record<string, any>;
const CEOS = 'https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json';
const K8S = 'https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json';
const TF = 'https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json';
const GIT = (dev: string) => `${dev}: git-file — service github-service ; paichart/paichart-configs/network/base/${dev}-startup.cfg`;

console.log('── the token table is DERIVED from the lane tables, never retyped ──');
test('T1 known tokens = DEVICE_SOURCE_LANES keys ∪ CONFIG_SOURCE_PROTOCOLS keys ∪ the descriptor-only tokens; no overlap', () => {
  const lanes = [...Object.values(DEVICE_SOURCE_LANES).map((l) => l.contractKey), ...CONFIG_SOURCE_PROTOCOLS.map((p) => CONFIG_SOURCE_LANES[p].contractKey)];
  eq([...knownDescriptorTokens()].sort(), [...lanes, ...descriptorOnlyTokens()].sort());
  assert(descriptorOnlyTokens().every((t) => !lanes.includes(t)), 'a descriptor-only token gained a sources lane: move it out of descriptorOnlyTokens (Config sources steps 3/4)');
});

console.log('\n── rule 2 + 3: Git-only blocks — a composed descriptor is REMOVED (root cmwj9241a, CORPUS #11-12) ──');
test('G1 git-only: both composed objects removed (no-read-line); nothing written that no line names', () => {
  const c = C('cmwj9241a00fryxvwy3sk7kfh');
  const d = D(c);
  assert(d.contract !== c, 'expected a change');
  eq(d.contract.serviceDescriptors, {});
  eq(d.fact.removed, [{ token: 'kubernetes-gitops', reason: 'no-read-line' }, { token: 'network-derivation', reason: 'no-read-line' }]);
  eq([d.fact.derived, d.fact.kept, d.fact.added, d.fact.replaced], [[], [], [], []]);
  eq(Object.keys(d.contract), Object.keys(c), 'top-level key order kept: ');
  eq(d.contract.deviceSources, c.deviceSources, 'sources untouched: ');
});
test('G2 the same blocks with a device-read line ⇒ the line\'s URL REPLACES the composed object (composed)', () => {
  const c = C('cmwj9241a00fryxvwy3sk7kfh');
  c.deviceSources['network-derivation'] = [GIT('ceos1'), `ceos2: device-read — service ${CEOS}`];
  const d = D(c);
  eq(d.contract.serviceDescriptors['network-derivation'], CEOS);
  eq(d.fact.replaced, [{ token: 'network-derivation', reason: 'composed' }]);
  eq(d.fact.derived, ['network-derivation']);
});

console.log('\n── rule 1 + 3: supplied URLs copied verbatim are KEPT byte-identical (root cmwj7vb53, git-live net+k8s) ──');
test('K1 equal to the derived value ⇒ the SAME object back (byte-identical storage, unchanged sha)', () => {
  const c = C('cmwj7vb53000kyxvwjoovypxa');
  const d = D(c);
  assert(d.contract === c, 'a correct contract must come back as the same object');
  eq(d.fact.derived.sort(), ['kubernetes-gitops', 'network-derivation']);
  eq(d.fact.kept.sort(), ['kubernetes-gitops', 'network-derivation']);
  eq([d.fact.removed, d.fact.replaced, d.fact.added], [[], [], []]);
  eq(canonicalContractSha(deliverContract(c).contract), canonicalContractSha(C('cmwj7vb53000kyxvwjoovypxa')));
});
test('K2 the same program with the URL edited by one character ⇒ REPLACED (differs) with the line\'s exact value', () => {
  const c = C('cmwj7vb53000kyxvwjoovypxa');
  c.serviceDescriptors['kubernetes-gitops'] = K8S.replace('k8s-', 'k8s_');
  const d = D(c);
  eq(d.contract.serviceDescriptors['kubernetes-gitops'], K8S);
  eq(d.fact.replaced, [{ token: 'kubernetes-gitops', reason: 'differs' }]);
  eq(Object.keys(d.contract.serviceDescriptors), Object.keys(c.serviceDescriptors), 'a replaced value keeps its position: ');
});
test('K3 the Architect left the entry out ⇒ ADDED from the line (appended)', () => {
  const c = C('cmwj7vb53000kyxvwjoovypxa');
  delete c.serviceDescriptors['kubernetes-gitops'];
  const d = D(c);
  eq(d.contract.serviceDescriptors, { 'network-derivation': CEOS, 'kubernetes-gitops': K8S });
  eq(d.fact.added, ['kubernetes-gitops']);
});
test('K4 the field absent altogether ⇒ created from the lines, appended after the other top-level keys', () => {
  const c = C('cmwj7vb53000kyxvwjoovypxa');
  delete c.serviceDescriptors;
  const d = D(c);
  eq(Object.keys(d.contract).slice(-1), ['serviceDescriptors']);
  eq(d.fact.fieldShape, 'absent');
  eq(d.fact.added.sort(), ['kubernetes-gitops', 'network-derivation']);
});

console.log('\n── value leg Git-only + change leg device-read (root cmw4osbre, hand-adjudicated correct absence) ──');
test('V1 the change leg\'s URL kept; the value leg (git-file only) gets NO entry and none is invented', () => {
  const c = C('cmw4osbre000iyxm8ks28fred');
  const d = D(c);
  assert(d.contract === c, 'unchanged');
  eq(d.fact.kept, ['network-provisioning']);
  eq(d.fact.notDerived, [{ token: 'network-derivation', reason: 'no-read-line' }]);
  assert(!('network-derivation' in d.contract.serviceDescriptors), 'no value-leg entry');
});

console.log('\n── rule 2: two distinct services (owner A4, MULTI-CLUSTER-CONFIG-SOURCES) ──');
const twoClusters = () => ({
  configSources: { 'kubernetes-gitops': ['cluster-a: live-read — service ' + K8S, 'cluster-b: live-read — service https://example.test/descriptors/other-cluster.json'] },
  serviceDescriptors: { 'kubernetes-gitops': K8S },
});
test('M1 two live-read services ⇒ no entry; the Architect\'s URL REMOVED and the fact says why', () => {
  const d = D(twoClusters());
  eq(d.contract.serviceDescriptors, {});
  eq(d.fact.removed, [{ token: 'kubernetes-gitops', reason: 'multiple-services' }]);
  eq(d.fact.notDerived, [{ token: 'kubernetes-gitops', reason: 'multiple-services' }]);
});
test('M2 two lines naming the SAME service ⇒ one distinct service ⇒ derived and kept', () => {
  const c = twoClusters();
  c.configSources['kubernetes-gitops'][1] = 'cluster-b: live-read — service ' + K8S;
  const d = D(c);
  assert(d.contract === c, 'unchanged');
  eq(d.fact.kept, ['kubernetes-gitops']);
});
test('M3 the Architect wrote nothing for two clusters ⇒ nothing added, and the fact still says why', () => {
  const c: Record<string, any> = twoClusters(); delete c.serviceDescriptors;
  const d = D(c);
  assert(d.contract === c, 'unchanged');
  eq(d.fact.notDerived, [{ token: 'kubernetes-gitops', reason: 'multiple-services' }]);
});

console.log('\n── rule 2: a line that names a REGISTERED service by name ──');
test('R1 device-read — service <name> ⇒ no entry (the leg calls it as it is); an Architect URL beside it is removed', () => {
  const c = { deviceSources: { 'network-provisioning': ['ceos1: device-read — service ceos-lab-readonly'] }, serviceDescriptors: { 'network-provisioning': CEOS } };
  const d = D(c);
  eq(d.contract.serviceDescriptors, {});
  eq(d.fact.removed, [{ token: 'network-provisioning', reason: 'registered-service' }]);
});
test('R2 …and with no Architect entry nothing is written (never a name under serviceDescriptors)', () => {
  const c = { deviceSources: { 'network-provisioning': ['ceos1: device-read — service ceos-lab-readonly'] } };
  const d = D(c);
  assert(d.contract === c, 'unchanged');
  eq(deriveForToken(c, 'network-provisioning'), { kind: 'none', reason: 'registered-service' });
});

console.log('\n── rule 4: no sources lane (terraform-iac, observability-config) and lane tokens with no block ──');
test('N1 terraform / observability URLs kept untouched (root cmvvwh4kh: four supplied URLs, deviceSources a prose string)', () => {
  const c = C('cmvvwh4kh000kyx91ek34a21n');
  const d = D(c);
  assert(d.contract === c, 'unchanged');
  eq(d.fact.kept, Object.keys(c.serviceDescriptors));
  assert(d.fact.notDerived.some((x) => x.reason === 'block-unparseable'), 'the prose deviceSources reads as unparseable, named');
});
test('N2 a composed object with no endpoint under terraform-iac ⇒ REMOVED (not-a-descriptor)', () => {
  const c = { serviceDescriptors: { 'terraform-iac': { service: 'github-service', owner: 'paichart', repo: 'paichart-configs' }, 'observability-config': 'https://example.test/obs.json' } };
  const d = D(c);
  eq(d.contract.serviceDescriptors, { 'observability-config': 'https://example.test/obs.json' });
  eq(d.fact.removed, [{ token: 'terraform-iac', reason: 'not-a-descriptor' }]);
});
test('N3 an inline descriptor object WITH an endpoint under terraform-iac ⇒ kept (the leg text uses an inline object directly)', () => {
  const c = { serviceDescriptors: { 'terraform-iac': { name: 'tf-ro', endpoint: 'https://tf.example.test/mcp', category: 'infra' } } };
  const d = D(c);
  assert(d.contract === c, 'unchanged');
  eq(d.fact.kept, ['terraform-iac']);
});
test('N4 a non-URL string under observability-config ⇒ removed; a URL string ⇒ kept', () => {
  eq(deriveServiceDescriptors({ serviceDescriptors: { 'observability-config': 'use the obs service' } }).fact.removed, [{ token: 'observability-config', reason: 'not-a-descriptor' }]);
  assert(isUsableDescriptorValue(TF) && !isUsableDescriptorValue('ceos-lab') && !isUsableDescriptorValue({ endpoint: ' ' }), 'usable predicate');
});
test('N5 the k8s wrapper around the right URL, no configSources block (root cmvexqkdl, CORPUS #1) ⇒ removed by rule 4, block-absent named', () => {
  const c = C('cmvexqkdl00i3yxdo41l43dwn');
  const d = D(c);
  eq(d.contract.serviceDescriptors, {});
  eq(d.fact.removed, [{ token: 'kubernetes-gitops', reason: 'not-a-descriptor' }]);
  eq(d.fact.notDerived, [{ token: 'kubernetes-gitops', reason: 'block-absent' }]);
});
test('N6 a lane token with NO contract block and a usable URL ⇒ kept (the leg may declare its block in its own task text)', () => {
  const c = { serviceDescriptors: { 'network-derivation': CEOS } };
  const d = D(c);
  assert(d.contract === c, 'unchanged');
  eq(d.fact.notDerived, [{ token: 'network-derivation', reason: 'block-absent' }]);
});

console.log('\n── keys that are not a leg protocol token are REPORTED, never touched (owner decision owed) ──');
test('U1 two legs on one token, both fields keyed by LEG NAME (root cmwckhl06, CORPUS #6-7) ⇒ unchanged, both names reported', () => {
  const c = C('cmwckhl0600cpyxw4jjlcu0a3');
  const d = D(c);
  assert(d.contract === c, 'unchanged — leg-name keys are not removed without the owner');
  eq(d.fact.unknownKeys, ['pipeline-1-edge-ceos1', 'pipeline-2-core-ceos2']);
  eq(d.fact.derived, [], 'nothing derived: the blocks sit under leg names, not the token: ');
});
test('U2 the stray `lifecycle` prose key (root cmv4wfvnc, CORPUS #2) ⇒ reported, kept; the two token URLs kept', () => {
  const c = C('cmv4wfvnc005oyx9kljrpehw7');
  const d = D(c);
  assert(d.contract === c, 'unchanged');
  eq([d.fact.unknownKeys, d.fact.unknownKeyCount], [['lifecycle'], 1]);
});
test('U4 an unknown key SURVIVES, in place, when another entry in the same contract is replaced', () => {
  const c = { deviceSources: { 'network-provisioning': [`ceos1: device-read — service ${CEOS}`] },
    serviceDescriptors: { 'pipeline-1-edge': CEOS, 'network-provisioning': { service: 'ceos' } } };
  const d = D(c);
  eq(d.contract.serviceDescriptors, { 'pipeline-1-edge': CEOS, 'network-provisioning': CEOS });
  eq(d.fact.unknownKeys, ['pipeline-1-edge']);
});
test('U3 unknown keys are sanitised and capped; the count is untruncated', () => {
  const sd: Record<string, string> = {};
  for (let i = 0; i < 15; i++) sd[`leg ${i}/x`] = 'v';
  const f = deriveServiceDescriptors({ serviceDescriptors: sd }).fact;
  eq([f.unknownKeys.length, f.unknownKeyCount, f.unknownKeys[0]], [12, 15, 'leg?0?x']);
});

console.log('\n── shape edges ──');
test('S1 serviceDescriptors as a STRING with something to derive ⇒ replaced by the derived object, named field-not-object', () => {
  const c = { deviceSources: { 'network-provisioning': [`ceos1: device-read — service ${CEOS}`] }, serviceDescriptors: 'see the topology' };
  const d = D(c);
  eq(d.contract.serviceDescriptors, { 'network-provisioning': CEOS });
  assert(d.fact.removed.some((r) => r.reason === 'field-not-object'), 'named');
});
test('S2 …and with nothing to derive the string is left as it is', () => {
  const c = { serviceDescriptors: 'see the topology' };
  assert(deriveServiceDescriptors(c).contract === c, 'unchanged');
});
test('S3 an unparseable block (a bad line) ⇒ rule 4, never a guess from the parsable lines', () => {
  const c = { deviceSources: { 'network-provisioning': [`ceos1: device-read — service ${CEOS}`, 'ceos2 device-read'] }, serviceDescriptors: { 'network-provisioning': CEOS } };
  const d = D(c);
  assert(d.contract === c, 'unchanged');
  eq(d.fact.notDerived, [{ token: 'network-provisioning', reason: 'block-unparseable' }]);
});
test('S4 total: a throwing getter ⇒ the input back, failed true (never a throw)', () => {
  const c: Record<string, unknown> = {};
  Object.defineProperty(c, 'serviceDescriptors', { enumerable: true, get() { throw new Error('boom'); } });
  const d = D(c);
  assert(d.contract === c && d.fact.failed === true, 'fail-open');
});
test('S5 deliverContract: a derived contract over the storage cap is NOT delivered (input back, failed true)', () => {
  const big = { pad: 'x'.repeat(PLAN_CONTRACT_MAX_BYTES - 200), deviceSources: { 'network-provisioning': [`ceos1: device-read — service ${CEOS}`] } };
  const d = deliverContract(big);
  assert(d.contract === big && d.fact.failed === true, 'over cap ⇒ not delivered');
});

console.log('\n── the supplied fail-open arm derives too (one rule for every stored contract) ──');
test('A1 plan unresolved ⇒ the SUPPLIED contract is stored DERIVED; suppliedSha256 is the model\'s copy, storedAtWriteSha256 the stored one', () => {
  const sup = C('cmwj9241a00fryxvwy3sk7kfh');
  const plan: PlanContractResult = { status: 'no-heading', contract: null, planSha256: null, architectContract: null, deliveredSha256: null, serviceDescriptors: null, architectTaskId: 'ca', architectExecutionId: 'ce' };
  const d = decideCreateContract({ supplied: sup, programRootId: 'croot', plan, legBaseline: null, at: '2026-11-17T00:00:00.000Z' });
  eq((d.stored as any).serviceDescriptors, {});
  eq(d.sourceFact?.serviceDescriptors?.removed.length, 2);
  assert(d.sourceFact?.suppliedSha256 === canonicalContractSha(sup) && d.sourceFact?.storedAtWriteSha256 === canonicalContractSha(d.stored), 'two shas');
});
test('A2 NOT a program stage ⇒ the supplied contract stored as it is, no fact (out of scope: not a program leg)', () => {
  const sup = C('cmwj9241a00fryxvwy3sk7kfh');
  const d = decideCreateContract({ supplied: sup, programRootId: null, plan: null, legBaseline: null, at: '2026-11-17T00:00:00.000Z' });
  assert(d.stored === sup && d.sourceFact === null, 'untouched');
});

// ══ Config sources STEP 3 slice P4 (plan §6): mcp-hub's five cases for the observability token, in BOTH awaiting states ══
// `SHIPPED` = the list as it ships (observability awaits its text: rule 4, the Architect's value stands). `JOINED` = no row awaiting
// (what the join switches on). Every row states both, so "inert as shipped" is a test, not a sentence.
const SHIPPED = CONFIG_SOURCE_AWAITING_TEXT; const JOINED: readonly string[] = [];
const OBS = 'observability-config';
const OBS_URL = 'https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json';
const OTHER_URL = 'https://example.test/descriptors/other-obs.json';
const O_GIT = 'obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml';
const O_LIVE = (svc: string) => `obs-otelcol: live-read — service ${svc}`;
const O_HELD = (svc: string) => `obs-ingress.otlp-ingress.conf: service-held — service ${svc}`;
const DA = (c: Record<string, unknown>, aw: readonly string[]) => { const r = deriveServiceDescriptors(c, aw); return { contract: r.contract as Record<string, any>, fact: r.fact, same: r.contract === c }; };
const obs = (block: unknown, architect?: unknown): Record<string, unknown> => ({
  ...(block === undefined ? {} : { configSources: { [OBS]: block } }),
  ...(architect === undefined ? {} : { serviceDescriptors: { [OBS]: architect } }),
});
const INLINE = { name: 'obs-ro', endpoint: 'http://127.0.0.1:3114/mcp' };

console.log('\n── P4: the lane table\'s column, read through ONE helper ──');
test('P0 descriptorWithoutServiceLine: observability keep; Kubernetes and Terraform remove; no row ⇒ null; the shipped list still has observability awaiting', () => {
  eq(Object.fromEntries(Object.entries(CONFIG_SOURCE_LANES).map(([, r]) => [r.contractKey, r.descriptorWithoutServiceLine])),
    { 'kubernetes-gitops': 'remove', 'terraform-iac': 'remove', 'observability-config': 'keep' });
  eq(['observability-config', 'kubernetes-gitops', 'terraform-iac', 'network-provisioning', '', null].map((p) => descriptorWithoutServiceLineOf(p)), ['keep', 'remove', 'remove', null, null, null]);
  assert(descriptorOnlyTokens(SHIPPED).includes(OBS) && !descriptorOnlyTokens(JOINED).includes(OBS), 'observability is rule 4 as shipped and a lane token at the join');
  // the derivation asks the helper — it types no protocol name (the keep arm must not be a name test)
  const der = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/service-descriptors-derivation.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert(/descriptorWithoutServiceLineOf\(lane\.protocol\)/.test(der) && !/['"]observability-config['"]|['"]kubernetes-gitops['"]|['"]terraform-iac['"]/.test(der), 'the keep arm must be switched by the lane row, never by a protocol name');
});
test('P0b the service a line names: live-read and service-held name one, git-file and supplied name none — every kind decided', () => {
  const line: Record<string, ConfigSourceLine> = {
    'git-file': { label: 'a', kind: 'git-file', service: 'github-service', owner: 'o', repo: 'r', path: 'p', ref: null },
    'live-read': { label: 'a', kind: 'live-read', service: 'svc-live' }, 'supplied': { label: 'a', kind: 'supplied' },
    'service-held': { label: 'a', kind: 'service-held', service: 'svc-held' },
  };
  eq(Object.keys(line).sort(), [...CONFIG_SOURCE_KINDS].sort(), 'a kind with no row here: ');
  eq(CONFIG_SOURCE_KINDS.map((k) => [k, configLineService(line[k])]), [['git-file', null], ['live-read', 'svc-live'], ['supplied', null], ['service-held', 'svc-held']]);
});

console.log('\n── P4 row 1: block absent or unparseable ⇒ rule 4, untouched in both states (owner decision B) ──');
test('P1 absent: a URL kept, an inline object with an endpoint KEPT, an object with no endpoint and a non-URL string removed — the same in both states', () => {
  for (const aw of [SHIPPED, JOINED]) {
    assert(DA(obs(undefined, OBS_URL), aw).same, 'URL');
    assert(DA(obs(undefined, INLINE), aw).same, 'an inline object with an endpoint stands under rule 4 — rule 4 is NOT narrowed by the keep arm');
    eq(DA(obs(undefined, { service: 'obs' }), aw).fact.removed, [{ token: OBS, reason: 'not-a-descriptor' }]);
    eq(DA(obs(undefined, 'the obs service'), aw).fact.removed, [{ token: OBS, reason: 'not-a-descriptor' }]);
  }
});
test('P1b unparseable (a bad line; a value that is not lines): the Architect\'s URL and inline object stand in both states; JOINED names block-unparseable', () => {
  for (const block of [[O_GIT, 'not a line'], { note: 'none' }, [O_GIT, O_GIT]]) for (const v of [OBS_URL, INLINE]) {
    for (const aw of [SHIPPED, JOINED]) {
      const d = DA(obs(block, v), aw);
      assert(d.same, `${JSON.stringify(block)} / ${JSON.stringify(v)}: rewritten`);
      eq([d.fact.kept, d.fact.removed], [[OBS], []]);
      eq(d.fact.notDerived, aw === JOINED ? [{ token: OBS, reason: 'block-unparseable' }] : [], `${aw === JOINED ? 'joined' : 'shipped'}: `);
    }
  }
});

console.log('\n── P4 row 2: exactly one distinct service on the service-held and live-read lines, a descriptor URL ⇒ rule 1 ──');
test('P2 a service-held line may name a descriptor URL (the parser\'s own answer), and it IS a service line of the derivation', () => {
  eq(deriveForToken(obs([O_HELD(OBS_URL)]), OBS, JOINED), { kind: 'value', service: OBS_URL }, 'service-held alone: ');
  eq(deriveForToken(obs([O_GIT, O_LIVE(OBS_URL)]), OBS, JOINED), { kind: 'value', service: OBS_URL }, 'live-read alone: ');
  eq(deriveForToken(obs([O_GIT, O_LIVE(OBS_URL), O_HELD(OBS_URL)]), OBS, JOINED), { kind: 'value', service: OBS_URL }, 'both, one distinct service: ');
  eq(deriveForToken(obs([O_HELD(OBS_URL)]), OBS, SHIPPED), null, 'as shipped the token has no lane: ');
});
test('P2b JOINED, a block whose ONLY service line is service-held: equal ⇒ kept (same object); differing ⇒ REPLACED (differs); an object ⇒ REPLACED (composed); left out ⇒ ADDED', () => {
  const block = [O_HELD(OBS_URL)];
  const eqv = DA(obs(block, OBS_URL), JOINED);
  assert(eqv.same, 'equal must come back as the same object');
  eq([eqv.fact.derived, eqv.fact.kept, eqv.fact.notDerived], [[OBS], [OBS], []]);
  const diff = DA(obs(block, OTHER_URL), JOINED);
  eq([diff.contract.serviceDescriptors, diff.fact.replaced, diff.fact.kept], [{ [OBS]: OBS_URL }, [{ token: OBS, reason: 'differs' }], []],
    'WITHOUT service-held in the service lines this block reads "no service line" and the keep arm silently keeps a DIFFERENT URL: ');
  const comp = DA(obs(block, INLINE), JOINED);
  eq([comp.contract.serviceDescriptors, comp.fact.replaced], [{ [OBS]: OBS_URL }, [{ token: OBS, reason: 'composed' }]]);
  const out = DA(obs(block), JOINED);
  eq([out.contract.serviceDescriptors, out.fact.added, out.fact.derived], [{ [OBS]: OBS_URL }, [OBS], [OBS]]);
});
test('P2c AS SHIPPED the same four contracts are rule 4: the Architect\'s value stands, nothing is added, the fact names nothing derived', () => {
  const block = [O_HELD(OBS_URL)];
  for (const v of [OBS_URL, OTHER_URL, INLINE]) { const d = DA(obs(block, v), SHIPPED); assert(d.same, JSON.stringify(v)); eq([d.fact.derived, d.fact.kept, d.fact.notDerived], [[], [OBS], []]); }
  const out = DA(obs(block), SHIPPED);
  assert(out.same && out.fact.added.length === 0, 'nothing may be written for a token with no lane');
});

console.log('\n── P4 row 3: only git-file lines ⇒ KEPT, a string URL only (owner decision E, sec-ops F-9) — the one rule that changes ──');
test('P3 JOINED: a URL is kept byte-identical and named by its CONDITION (no-service-line, rule keep); nothing is removed', () => {
  const c = obs([O_GIT], OBS_URL);
  const d = DA(c, JOINED);
  assert(d.same, 'the contract must come back as the same object');
  eq([d.fact.kept, d.fact.removed, d.fact.derived, d.fact.notDerived], [[OBS], [], [], [{ token: OBS, reason: 'no-service-line', rule: 'keep' }]]);
  eq(deriveForToken(c, OBS, JOINED), { kind: 'none', reason: 'no-service-line', rule: 'keep' });
  // ANY descriptor URL stands — the platform has no declared line to compare it with
  assert(DA(obs([O_GIT], OTHER_URL), JOINED).same, 'another URL');
});
test('P3b JOINED: an object — even one WITH an endpoint — and a non-URL string are REMOVED (not-a-descriptor); still named by its CONDITION (no-service-line, rule keep)', () => {
  for (const v of [INLINE, { service: 'github-service', owner: 'paichart', repo: 'paichart-configs' }, 'observability-readonly', '', 42, null, ['x']]) {
    const d = DA(obs([O_GIT], v), JOINED);
    eq([d.contract.serviceDescriptors, d.fact.removed, d.fact.kept], [{}, [{ token: OBS, reason: 'not-a-descriptor' }], []], `${JSON.stringify(v)}: `);
    eq(d.fact.notDerived, [{ token: OBS, reason: 'no-service-line', rule: 'keep' }], `${JSON.stringify(v)}: `);
  }
  assert(isKeptWithoutServiceLine(OBS_URL) && !isKeptWithoutServiceLine(INLINE) && isUsableDescriptorValue(INLINE), 'the keep arm is NARROWER than rule 4 on an inline object');
});
test('P3f JOINED, the keep arm keeps ONE WHOLE URL TOKEN only (sec-ops LOW 1): anything but printable ASCII (whitespace, control, bidi, zero-width, soft hyphen, variation selectors, tag characters, any non-ASCII letter), userinfo, another scheme, or more than 2,048 characters ⇒ removed', () => {
  const bad: Array<[string, string]> = [
    ['a space inside', 'https://example.test/a b.json'], ['prose after the URL', `${OBS_URL} (use this one)`], ['a leading space', ` ${OBS_URL}`],
    ['a newline', `${OBS_URL}\nhttps://evil.example/x.json`], ['a tab', `${OBS_URL}\t`], ['a NUL', `${OBS_URL}\u0000`], ['an ESC sequence', `${OBS_URL}\u001b[31m`],
    ['a right-to-left override', `https://example.test/\u202egnp.json`], ['a zero-width space', `https://exam\u200bple.test/d.json`], ['a byte-order mark', `\ufeff${OBS_URL}`],
    // printable ASCII only (sec-ops re-check): each of these is invisible or look-alike in a terminal and none is needed in a URL
    ['a soft hyphen', 'https://exam\u00adple.test/d.json'], ['an Arabic letter mark', 'https://example.test/\u061cd.json'],
    ['a Mongolian vowel separator', 'https://example.test/d\u180e.json'], ['a variation selector', 'https://example.test/d\ufe0f.json'],
    ['a supplementary variation selector', 'https://example.test/d\u{e0100}.json'], ['a Unicode tag character', 'https://example.test/d.json\u{e0041}'],
    ['a non-ASCII letter in the host (write it in punycode)', 'https://ex\u00e4mple.test/d.json'], ['a Cyrillic look-alike', 'https://ex\u0430mple.test/d.json'],
    ['a no-break space', 'https://example.test/d\u00a0.json'], ['an ideographic space', 'https://example.test/\u3000d.json'],
    ['userinfo', 'https://user:pass@example.test/d.json'], ['a user name only', 'https://user@example.test/d.json'],
    ['over the length bound', `https://example.test/${'a'.repeat(KEPT_DESCRIPTOR_URL_MAX_CHARS)}`], ['another scheme', 'ftp://example.test/d.json'], ['a scheme and nothing else', 'https://'],
  ];
  for (const [what, v] of bad) {
    assert(!isWholeTokenDescriptorUrl(v) && !isKeptWithoutServiceLine(v), `${what}: accepted`);
    const d = DA(obs([O_GIT], v), JOINED);
    eq([d.contract.serviceDescriptors, d.fact.removed, d.fact.kept], [{}, [{ token: OBS, reason: 'not-a-descriptor' }], []], `${what}: `);
  }
  for (const v of [OBS_URL, OTHER_URL, 'http://127.0.0.1:3114/descriptor.json', 'https://example.test/d.json?v=1#frag', 'https://xn--exmple-cua.test/d.json', 'https://example.test/a%20b~_-.!$&()*+,;=:@/d.json', `https://example.test/${'a'.repeat(KEPT_DESCRIPTOR_URL_MAX_CHARS - 21)}`]) {
    assert(v.length <= KEPT_DESCRIPTOR_URL_MAX_CHARS && isKeptWithoutServiceLine(v) && DA(obs([O_GIT], v), JOINED).same, `a whole URL token was refused: ${v.slice(0, 60)} (${v.length})`);
  }
  for (const v of [null, undefined, 42, {}, [], '']) assert(!isWholeTokenDescriptorUrl(v), `not a string: ${JSON.stringify(v)}`);
});
test('P3g the tight test is the KEEP ARM\'s only: rule 4 and the lane arms are unchanged (a value the tight test refuses still stands under rule 4, in both states)', () => {
  const loose = 'https://user@example.test/d.json';
  assert(isUsableDescriptorValue(loose) && !isWholeTokenDescriptorUrl(loose), 'the fixture must separate the two predicates');
  for (const aw of [SHIPPED, JOINED]) {
    assert(DA(obs(undefined, loose), aw).same, 'rule 4, observability, no block');
    assert(DA({ serviceDescriptors: { 'network-derivation': loose } }, aw).same, 'rule 4, a lane token with no block');
  }
  // …and a rule-1 value is the declared line's string, whatever its shape (the line parser is the judge there)
  eq(DA({ configSources: { 'kubernetes-gitops': ['cluster: live-read — service ' + loose] } }, JOINED).contract.serviceDescriptors, { 'kubernetes-gitops': loose });
});
test('P3h the fact names the CONDITION, never an outcome: the same notDerived entry whether the value was kept, removed, or never written', () => {
  const want = [{ token: OBS, reason: 'no-service-line', rule: 'keep' }];
  eq([DA(obs([O_GIT], OBS_URL), JOINED).fact.notDerived, DA(obs([O_GIT], INLINE), JOINED).fact.notDerived, DA(obs([O_GIT]), JOINED).fact.notDerived], [want, want, want]);
  // a `remove` row keeps its own word and carries no `rule` key (nothing stored for Kubernetes or Terraform gains a key)
  eq(DA({ configSources: { 'kubernetes-gitops': ['cluster: supplied'] }, serviceDescriptors: { 'kubernetes-gitops': K8S } }, JOINED).fact.notDerived, [{ token: 'kubernetes-gitops', reason: 'no-read-line' }]);
  const der = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/service-descriptors-derivation.ts'), 'utf8');
  assert(!/no-service-line-kept/.test(der), 'the outcome-shaped name is back');
});
test('P9 TRIPWIRE for the join (decision 2026-11-22, three reviews): observability off the awaiting list ⇒ the FACT version is at least 2 (the resolver number stays free)', () => {
  const awaits = descriptorOnlyTokens().includes(OBS);
  assert(awaits || SERVICE_DESCRIPTORS_FACT_VERSION >= 2,
    `observability-config left CONFIG_SOURCE_AWAITING_TEXT with SERVICE_DESCRIPTORS_FACT_VERSION ${SERVICE_DESCRIPTORS_FACT_VERSION}: the join commit bumps the FACT version to 2 — it is the series-cut key for every contract the changed derivation writes (STEP3-P4-BUILD.md §9a)`);
  // while the row awaits, nothing stored may move: the version is still 1
  if (awaits) eq(SERVICE_DESCRIPTORS_FACT_VERSION, 1, 'the version moved before the join: ');
});
test('P3c JOINED, the Architect left the entry out ⇒ nothing is written (the platform never invents a descriptor), and the fact still names the rule', () => {
  const c = obs([O_GIT]);
  const d = DA(c, JOINED);
  assert(d.same, 'unchanged');
  eq([d.fact.added, d.fact.notDerived], [[], [{ token: OBS, reason: 'no-service-line', rule: 'keep' }]]);
});
test('P3d AS SHIPPED the same block is rule 4: a URL and an inline object stand, a non-URL string is removed — exactly today', () => {
  assert(DA(obs([O_GIT], OBS_URL), SHIPPED).same && DA(obs([O_GIT], INLINE), SHIPPED).same, 'stands');
  eq(DA(obs([O_GIT], 'observability-readonly'), SHIPPED).fact.removed, [{ token: OBS, reason: 'not-a-descriptor' }]);
  eq(DA(obs([O_GIT], OBS_URL), SHIPPED).fact.notDerived, [], 'no lane ⇒ nothing named: ');
});
test('P3e the keep arm is OBSERVABILITY\'s only: a Git-only Kubernetes or Terraform block still REMOVES the Architect\'s URL (no-read-line), in both states', () => {
  for (const [tok, line, url] of [['kubernetes-gitops', 'sample-workloads: git-file — service github-service ; paichart/paichart-configs/k8s/sample-workloads.yaml', K8S],
    ['terraform-iac', 'main-tf: git-file — service github-service ; paichart/paichart-configs/terraform/main.tf', TF]] as const) {
    for (const aw of [SHIPPED, JOINED]) {
      const d = DA({ configSources: { [tok]: [line] }, serviceDescriptors: { [tok]: url } }, aw);
      eq([d.contract.serviceDescriptors, d.fact.removed, d.fact.notDerived], [{}, [{ token: tok, reason: 'no-read-line' }], [{ token: tok, reason: 'no-read-line' }]], `${tok}: `);
    }
  }
  // …and a `supplied`-only Kubernetes block the same
  eq(DA({ configSources: { 'kubernetes-gitops': ['cluster: supplied'] }, serviceDescriptors: { 'kubernetes-gitops': K8S } }, JOINED).fact.removed, [{ token: 'kubernetes-gitops', reason: 'no-read-line' }]);
});

console.log('\n── P4 row 4: one service, named by registration ⇒ removed (owner decision 6: a named service is the customer\'s own) ──');
test('P4 JOINED: a service-held (or live-read) line naming a REGISTERED service ⇒ the Architect\'s URL removed (registered-service); nothing written when left out', () => {
  for (const block of [[O_HELD('observability-readonly')], [O_GIT, O_LIVE('observability-readonly')], [O_GIT, O_LIVE('observability-readonly'), O_HELD('observability-readonly')]]) {
    const d = DA(obs(block, OBS_URL), JOINED);
    eq([d.contract.serviceDescriptors, d.fact.removed], [{}, [{ token: OBS, reason: 'registered-service' }]], `${JSON.stringify(block)}: `);
    const out = DA(obs(block), JOINED);
    assert(out.same, 'never a name under serviceDescriptors');
    eq(out.fact.notDerived, [{ token: OBS, reason: 'registered-service' }]);
  }
});
test('P4b AS SHIPPED the same contract keeps the Architect\'s URL (rule 4)', () => {
  const d = DA(obs([O_HELD('observability-readonly')], OBS_URL), SHIPPED);
  assert(d.same, 'unchanged'); eq(d.fact.kept, [OBS]);
});

console.log('\n── P4 row 5: two or more distinct services ⇒ removed (owner A4) ──');
test('P5 JOINED: two URLs, and ONE service written once as a URL and once as its name, both count as two ⇒ removed (multiple-services)', () => {
  for (const block of [[O_GIT, O_LIVE(OBS_URL), O_HELD(OTHER_URL)], [O_GIT, O_LIVE(OBS_URL), O_HELD('observability-readonly')]]) {
    const d = DA(obs(block, OBS_URL), JOINED);
    eq([d.contract.serviceDescriptors, d.fact.removed], [{}, [{ token: OBS, reason: 'multiple-services' }]], `${JSON.stringify(block)}: `);
  }
});
test('P5b AS SHIPPED the same contracts keep the Architect\'s URL (rule 4)', () => {
  assert(DA(obs([O_GIT, O_LIVE(OBS_URL), O_HELD(OTHER_URL)], OBS_URL), SHIPPED).same, 'unchanged');
});

console.log('\n── P4: nothing else moves ──');
test('P6 unknownKeys are reported and left in place identically in both states, whatever the observability arm does', () => {
  for (const aw of [SHIPPED, JOINED]) {
    const c = { configSources: { [OBS]: [O_GIT] }, serviceDescriptors: { 'pipeline-4-observability': OBS_URL, [OBS]: OBS_URL, lifecycle: 'registered per leg' } };
    const d = DA(c, aw);
    assert(d.same, 'unchanged');
    eq([d.fact.unknownKeys, d.fact.unknownKeyCount], [['pipeline-4-observability', 'lifecycle'], 2]);
  }
  // an unknown key SURVIVES, in place, when the keep arm removes a composed observability value beside it
  const d = DA({ configSources: { [OBS]: [O_GIT] }, serviceDescriptors: { 'pipeline-4-observability': OBS_URL, [OBS]: INLINE } }, JOINED);
  eq([d.contract.serviceDescriptors, d.fact.unknownKeys], [{ 'pipeline-4-observability': OBS_URL }, ['pipeline-4-observability']]);
});
test('P7 the stored observability values of the fixture corpus are BYTE-UNCHANGED in both states (same object, same sha), and every corpus contract is identical between the states', () => {
  let obsValues = 0;
  for (const root of Object.keys(FIX)) {
    const shipped = DA(C(root), SHIPPED), joined = DA(C(root), JOINED);
    eq(JSON.stringify(joined.contract), JSON.stringify(shipped.contract), `${root}: the stored contract differs between the awaiting states: `);
    const sd = FIX[root].contract.serviceDescriptors;
    if (sd && typeof sd === 'object' && OBS in sd) {
      obsValues++;
      for (const d of [shipped, joined]) {
        assert(d.same, `${root}: a contract carrying a stored observability value was rewritten`);
        eq(d.contract.serviceDescriptors[OBS], sd[OBS]);
        assert(d.fact.kept.includes(OBS), `${root}: not kept`);
      }
      eq(canonicalContractSha(deliverContract(C(root)).contract), canonicalContractSha(C(root)), `${root} sha: `);
    }
  }
  eq(obsValues, 2, 'the fixture corpus carries two observability values (the production count is the corpus replay\'s, scripts/replay-service-descriptors.ts): ');
});
test('P8 a four-domain contract: the observability arm changes ONLY the observability entry; the other three tokens read the same in both states', () => {
  const c = () => ({
    deviceSources: { 'network-provisioning': [`ceos1: device-read — service ${CEOS}`] },
    configSources: { 'kubernetes-gitops': ['cluster: live-read — service ' + K8S], 'terraform-iac': ['main-tf: git-file — service github-service ; paichart/paichart-configs/terraform/main.tf'], [OBS]: [O_GIT] },
    serviceDescriptors: { 'network-provisioning': CEOS, 'kubernetes-gitops': K8S, 'terraform-iac': TF, [OBS]: INLINE },
  });
  const s = DA(c(), SHIPPED), j = DA(c(), JOINED);
  eq(s.contract.serviceDescriptors, { 'network-provisioning': CEOS, 'kubernetes-gitops': K8S, [OBS]: INLINE }, 'shipped: ');
  eq(j.contract.serviceDescriptors, { 'network-provisioning': CEOS, 'kubernetes-gitops': K8S }, 'joined: ');
  const rest = (f: typeof s.fact) => [f.derived, f.replaced, f.removed.filter((r) => r.token !== OBS), f.notDerived.filter((r) => r.token !== OBS)];
  eq(rest(j.fact), rest(s.fact), 'the other tokens: ');
});

console.log(`\nResults: ✅ ${pass} passed, ❌ ${fail} failed`);
process.exit(fail ? 1 : 0);
