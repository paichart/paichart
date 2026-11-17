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
  deriveServiceDescriptors, deriveForToken, knownDescriptorTokens, isUsableDescriptorValue, DESCRIPTOR_ONLY_TOKENS,
} from '../lib/agents/harness/service-descriptors-derivation';
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
  eq([...knownDescriptorTokens()].sort(), [...lanes, ...DESCRIPTOR_ONLY_TOKENS].sort());
  assert(DESCRIPTOR_ONLY_TOKENS.every((t) => !lanes.includes(t)), 'a descriptor-only token gained a sources lane: move it out of DESCRIPTOR_ONLY_TOKENS (Config sources steps 3/4)');
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

console.log(`\nResults: ✅ ${pass} passed, ❌ ${fail} failed`);
process.exit(fail ? 1 : 0);
