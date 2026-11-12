/**
 * test-canary-req-sources.ts: each req-src-* canary control (scripts/canary-req-sources.ts) PASSES on a correct program and
 * reads FINDING on each fault it exists to catch. No database: carriers are built here the way the platform stores them
 * (contract `deviceSources` keyed by protocol; the snapshot built by the shipping module's own buildDeviceSourcesSnapshot).
 *
 * Example device and repo names are neutral (SKILL rule 7). The spec fixture is first proven clean by the publish check, so a
 * grammar change shows here as a fixture failure, never as a silent pass.
 */
import * as fs from 'fs';
import * as path from 'path';
import { checkSources } from './check-requirements-sources';
import { contractEqualsSpec, keysParse, snapshotContract, valueCardGitOnly, CARD_WORD_RE, type Carrier } from './canary-req-sources';
import { buildDeviceSourcesSnapshot, resolveLegDeviceSources, DEVICE_SOURCE_KINDS, SOURCE_SEPARATOR } from '../lib/agents/harness/device-sources';

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = '') => { if (ok) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`); } };

const D = SOURCE_SEPARATOR;
const VALUE_LINES = [
  `edge-sw-01: git-file${D}service netops-git ; netops/device-configs/configs/edge-sw-01.cfg`,
  `edge-sw-02: git-file${D}service netops-git ; netops/device-configs/configs/edge-sw-02.cfg`,
];
const CHANGE_LINES = [
  `edge-sw-02: git-file${D}service netops-git ; netops/device-configs/configs/edge-sw-02.cfg`,
  `edge-sw-02: device-read${D}service netops-devices`,
  `edge-sw-01: live-read${D}service netops-devices`,
];
const fenced = (lines: string[]) => ['```', '## Device sources', ...lines, '```'].join('\n');
const spec = (opts: { value?: string[] | null; change?: string[] } = {}) => {
  const value = opts.value === undefined ? VALUE_LINES : opts.value;
  return [
    '# Requirements', '',
    '## Pipeline 1 objective', '',
    '1. Derive one free address for edge-sw-02. This leg changes no device configuration.', '',
    ...(value ? [fenced(value), ''] : []),
    '## Pipeline 2 objective', '',
    '2. Configure the address on edge-sw-02. This leg changes device configuration.', '',
    fenced(opts.change ?? CHANGE_LINES), '',
    '## Design decisions', '', '| row | answer |', '|---|---|', '',
  ].join('\n');
};
const VP = 'network-derivation-protocol', CP = 'network-provisioning-protocol';
const snap = (contract: Record<string, unknown>, key: string, body: string | null = null) => ({
  deviceSourcesSnapshot: buildDeviceSourcesSnapshot(resolveLegDeviceSources({
    contractValue: (contract.deviceSources as Record<string, unknown> | undefined)?.[key], taskBody: body,
  }), '2026-11-10T00:00:00.000Z'),
});
const program = (ds: Record<string, unknown> | null, o: { valueSnap?: boolean; nodeCds?: Record<string, unknown> } = {}): Carrier[] => {
  const contract = ds ? { deviceSources: ds } : {};
  return [
    { id: 'value-leg', kind: 'leg', protocol: VP, contract, metadata: o.valueSnap === false ? {} : snap(contract, 'network-derivation') },
    { id: 'change-leg', kind: 'leg', protocol: CP, contract, metadata: snap(contract, 'network-provisioning') },
    { id: 'node-c', kind: 'nodeC', protocol: null, contract: o.nodeCds ? { deviceSources: o.nodeCds } : contract, metadata: {} },
  ];
};
const GOOD = { 'network-derivation': VALUE_LINES.join('\n'), 'network-provisioning': CHANGE_LINES.join('\n') };

console.log('fixture');
const pre = checkSources(spec());
t('the fixture spec passes the publish check (generated, 2 blocks, lanes by sentence)', pre.errors.length === 0 && pre.blocks.length === 2
  && pre.mode === 'generated' && pre.blocks.every((b) => b.laneSource === 'sentence'), JSON.stringify(pre.errors));

console.log('req-src-contract-equals-spec');
t('PASS: both keys equal the spec (string form)', contractEqualsSpec(program(GOOD), spec()).verdict === 'PASS');
t('PASS: an array-of-lines contract value, reordered', contractEqualsSpec(program({ 'network-derivation': [...VALUE_LINES].reverse(), 'network-provisioning': CHANGE_LINES }), spec()).verdict === 'PASS');
t('FINDING: the change key drops a device', contractEqualsSpec(program({ ...GOOD, 'network-provisioning': CHANGE_LINES.slice(0, 2).join('\n') }), spec()).verdict === 'FINDING');
t('FINDING: the change key retypes a kind', contractEqualsSpec(program({ ...GOOD, 'network-provisioning': CHANGE_LINES.map((l) => l.replace('live-read', 'device-read')).join('\n') }), spec()).verdict === 'FINDING');
t('FINDING: the value leg lacks the value key the spec gives it', contractEqualsSpec(program({ 'network-provisioning': GOOD['network-provisioning'] }), spec()).verdict === 'FINDING');
t('FINDING: a value key the spec never gave (invented)', contractEqualsSpec(program(GOOD), spec({ value: null })).verdict === 'FINDING');
t('PASS: no value key when the spec gives the value lane none', contractEqualsSpec(program({ 'network-provisioning': GOOD['network-provisioning'] }, { valueSnap: false }), spec({ value: null })).verdict === 'PASS');
t('FINDING: Node C carries a different change block', contractEqualsSpec(program(GOOD, { nodeCds: { ...GOOD, 'network-provisioning': CHANGE_LINES[0] } }), spec()).verdict === 'FINDING');
t('FINDING: the spec itself fails the publish check (hyphen for the separator)', contractEqualsSpec(program(GOOD), spec({ change: CHANGE_LINES.map((l) => l.replace(D, ' - ')) })).verdict === 'FINDING');
t('FINDING: the contracts carry no deviceSources at all', contractEqualsSpec(program(null, { valueSnap: false }), spec()).verdict === 'FINDING');

console.log('req-src-keys-parse');
t('PASS: both keys parse on every carrier', keysParse(program(GOOD)).verdict === 'PASS');
t('FINDING: a prose note under the value key (canary B attempt 2 shape)', keysParse(program({ ...GOOD, 'network-derivation': 'none stated in requirements; this leg reaches both switches via its descriptor' })).verdict === 'FINDING');
t('FINDING: a prose note under the change key', keysParse(program({ ...GOOD, 'network-provisioning': 'see the requirements for the device list' })).verdict === 'FINDING');
t('FINDING: a key no protocol reads', keysParse(program({ ...GOOD, 'network-validation': CHANGE_LINES.join('\n') })).verdict === 'FINDING');
t('FINDING: deviceSources not keyed by protocol', keysParse([{ id: 'x', kind: 'leg', protocol: CP, contract: { deviceSources: CHANGE_LINES }, metadata: {} }]).verdict === 'FINDING');
t('UNEXERCISED: no deviceSources anywhere', keysParse(program(null)).verdict === 'UNEXERCISED');

console.log('req-src-snapshot-contract');
t('PASS: both snapshots parsed, source contract, equal to the spec', snapshotContract(program(GOOD), spec()).verdict === 'PASS');
const bodyOnly: Carrier[] = program(GOOD).map((c) => (c.id === 'change-leg'
  ? { ...c, metadata: snap({}, 'network-provisioning', fenced(CHANGE_LINES).replace(/```/g, '')) } : c));
t('FINDING: the change snapshot came from the task body, not the contract', snapshotContract(bodyOnly, spec()).verdict === 'FINDING');
t('FINDING: a change leg with no snapshot', snapshotContract(program(GOOD).map((c) => (c.id === 'change-leg' ? { ...c, metadata: {} } : c)), spec()).verdict === 'FINDING');
t('FINDING: an unreadable snapshot', snapshotContract(program(GOOD).map((c) => (c.id === 'value-leg' ? { ...c, metadata: { deviceSourcesSnapshot: { version: 9 } } } : c)), spec()).verdict === 'FINDING');
t('FINDING: the snapshot declares other devices than the spec', snapshotContract(program({ ...GOOD, 'network-derivation': VALUE_LINES[0] }), spec()).verdict === 'FINDING');
t('PASS: a value leg with no own block has no snapshot', snapshotContract(program({ 'network-provisioning': GOOD['network-provisioning'] }, { valueSnap: false }), spec({ value: null })).verdict === 'PASS');
t('FINDING: a value leg with a snapshot while the spec gives it no block', snapshotContract(program(GOOD), spec({ value: null })).verdict === 'FINDING');

console.log('req-src-value-card-git-only');
const card = (w: string) => `… liveEvidence: ${w} (declared devices) …`;
t('PASS: card git-only = fact git-only', valueCardGitOnly([{ legId: 'v', card: card('git-only'), factSummary: 'git-only' }]).verdict === 'PASS');
t('FINDING: card some-git-only', valueCardGitOnly([{ legId: 'v', card: card('some-git-only'), factSummary: 'some-git-only' }]).verdict === 'FINDING');
t('FINDING: card git-only but the fact differs', valueCardGitOnly([{ legId: 'v', card: card('git-only'), factSummary: 'all-read' }]).verdict === 'FINDING');
t('FINDING: no word on the card', valueCardGitOnly([{ legId: 'v', card: 'no facts', factSummary: 'git-only' }]).verdict === 'FINDING');
t('UNEXERCISED: no declared value leg', valueCardGitOnly([]).verdict === 'UNEXERCISED');

console.log('pins');
const src = fs.readFileSync(path.join(__dirname, 'canary-req-sources.ts'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
t('one parser: canary-req-sources.ts holds no separator character', !src.includes(SOURCE_SEPARATOR.trim()));
t('one parser: canary-req-sources.ts holds no kind literal', DEVICE_SOURCE_KINDS.every((k) => !code.includes(`'${k}'`) && !code.includes(`"${k}"`)));
const canary = fs.readFileSync(path.join(__dirname, 'canary-check.ts'), 'utf8');
t('the card regex is the one vlg-h4 reads the card with', canary.includes(`/${CARD_WORD_RE.source}/`));
for (const n of ['req-src-contract-equals-spec', 'req-src-keys-parse', 'req-src-snapshot-contract', 'req-src-value-card-git-only']) {
  t(`canary-check.ts registers ${n}`, canary.includes(`'${n}': {`));
}

console.log(`\n${fail ? '❌' : '✅'} canary-req-sources: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
