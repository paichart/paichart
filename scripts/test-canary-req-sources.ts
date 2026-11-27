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
import { contractEqualsSpec, keysParse, snapshotContract, valueCardGitOnly, CARD_WORD_RE, driftCallsOf, canonJson, archDescriptorsRespected, archFetchRoute, tfLegFacts, obsNoPlaceholderKey, obsUndeclaredLeg, obsDeclaredFacts, type Carrier , readRuleWidened } from './canary-req-sources';
import { computeGitLiveDrift } from '../lib/agents/harness/git-live-drift';
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

// ── csk-k8s-facts helpers (2026-11-16): recompute from the stored record's `.calls`, compare key-order-free. Fixture = a real
// production record (Kubernetes Harvester cmwj8df8p0094yxvwu7m1j89t), both directions.
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/canary/k8s-drift-record.json'), 'utf8'));
  t('KF1 the stored fact equals a recompute from the record\'s calls (the control PASSES a correct record)',
    canonJson(computeGitLiveDrift(driftCallsOf(fx.platformDriftCalls), 'kubernetes-gitops-protocol')) === canonJson(fx.gitLiveDrift));
  t('KF2 the wrapper itself is not the calls (recomputing from it reads no-platform-call-record — the first-run false FINDING)',
    canonJson(computeGitLiveDrift(fx.platformDriftCalls, 'kubernetes-gitops-protocol')) !== canonJson(fx.gitLiveDrift));
  const tampered = JSON.parse(JSON.stringify(fx.gitLiveDrift)); tampered.files[0].summary = 'differences';
  t('KF3 a stored fact that differs from its record is caught (the control FINDS a wrong record)',
    canonJson(computeGitLiveDrift(driftCallsOf(fx.platformDriftCalls), 'kubernetes-gitops-protocol')) !== canonJson(tampered));
  const reordered = Object.fromEntries(Object.entries(fx.gitLiveDrift).reverse());
  t('KF4 key order does not matter', canonJson(reordered) === canonJson(fx.gitLiveDrift));
  t('KF5 a bare calls array is accepted as-is', driftCallsOf(fx.platformDriftCalls.calls) === fx.platformDriftCalls.calls);
}

// ── arch-text-2 controls (2026-11-17): fixtures are tonight's real production records (both directions).
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/canary/arch-text-2.json'), 'utf8'));
  t('AT1 a leg whose descriptors the platform removed is a FINDING (tonight, before the text)', archDescriptorsRespected([{ id: 'L', fact: fx.legFact }]).verdict === 'FINDING');
  const clean = { ...fx.legFact, removed: [], replaced: [], notDerived: fx.legFact.notDerived };
  t('AT2 nothing removed or replaced is a PASS', archDescriptorsRespected([{ id: 'L', fact: clean }]).verdict === 'PASS');
  t('AT3 no fact at all is UNEXERCISED, never a PASS', archDescriptorsRespected([{ id: 'L', fact: null }]).verdict === 'UNEXERCISED');
  t('AT4 tonight\'s Architect (two refused scrape_page calls) is a FINDING', archFetchRoute(fx.architectServiceCalls).verdict === 'FINDING');
  const gitOnly = fx.architectServiceCalls.filter((c: any) => !JSON.stringify(c.arguments ?? '').includes('scrape_page'));
  t('AT5 Git-file reads only is a PASS', archFetchRoute(gitOnly).verdict === 'PASS');
  t('AT6 no spec fetch at all is UNEXERCISED', archFetchRoute([]).verdict === 'UNEXERCISED');
}
{
  // cst-tf-facts (terraform-iac 1.17.0 + the Architect's configSources["terraform-iac"] sentence) — a real 1.17.0 Author fact, both ways.
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/canary/cst-tf-facts.json'), 'utf8'));
  const author = (pw: unknown) => ({ role: 'config_change_author', result: { planWitness: pw } as Record<string, unknown> });
  const harv = { role: 'infra_state_harvester', result: { gitLiveDrift: fx.gitLiveDrift } as Record<string, unknown> };
  const leg = (over: Record<string, unknown> = {}) => ({ id: 'L', tasks: 5, snapshotOn: 5, kids: [harv, author(fx.planWitness)], ...over });
  t('TF1 a leg with its snapshot, a clean witness and no drift call is a PASS', tfLegFacts([leg()]).verdict === 'PASS');
  t('TF2 a leg with no Config sources snapshot is a FINDING (the block did not reach it)', tfLegFacts([leg({ snapshotOn: 0 })]).verdict === 'FINDING');
  t('TF3 an Author with no planWitness fact is a FINDING', tfLegFacts([leg({ kids: [harv, { role: 'config_change_author', result: {} }] })]).verdict === 'FINDING');
  t('TF4 an altered stop sentence is a FINDING', tfLegFacts([leg({ kids: [harv, author({ ...fx.planWitness, stopSentence: 'altered' })] })]).verdict === 'FINDING');
  t('TF5 a name missing from the block is a FINDING', tfLegFacts([leg({ kids: [harv, author({ ...fx.planWitness, missing: ['aws_s3_bucket.archive: tags.owner'] })] })]).verdict === 'FINDING');
  t('TF6 a platform drift call on a Terraform leg is a FINDING', tfLegFacts([leg({ kids: [{ role: 'infra_state_harvester', result: { platformDriftCalls: { version: 1, calls: [] } } }, author(fx.planWitness)] })]).verdict === 'FINDING');
  t('TF7 no Terraform leg, or no Author result yet, is UNEXERCISED, never a PASS', tfLegFacts([]).verdict === 'UNEXERCISED' && tfLegFacts([leg({ kids: [harv] })]).verdict === 'UNEXERCISED');
}
{
  // ── observability-config 1.12.0, the join (pre-registered 2026-11-23). Both directions and the absence, per control. ──
  const GIT = 'obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml';
  const LIVE = 'obs-otelcol: live-read — service https://example.test/descriptors/obs.json';
  const body = (lines: string[] | null) => `Tune the collector.${lines ? `\n\n## Config sources\n${lines.join('\n')}\n` : ''}`;
  const K8 = ['sample: git-file — service github-service ; paichart/paichart-configs/k8s/sample-workloads.yaml'];
  const cl = (contract: unknown, lines: string[] | null = null) => ({ id: 'L', description: body(lines), contract });
  // cso-obs-no-placeholder-key
  t('CSO1 no observability leg is UNEXERCISED, never a PASS', obsNoPlaceholderKey([]).verdict === 'UNEXERCISED');
  for (const [name, contract] of [['no configSources', { serviceDescriptors: {} }], ['an empty object', { configSources: {} }], ['another protocol\'s key only', { configSources: { 'kubernetes-gitops': K8 } }],
    ['configSources null', { configSources: null }], ['the key null', { configSources: { 'observability-config': null } }], ['a leg-name key', { configSources: { 'pipeline-4-observability': K8 } }]] as Array<[string, unknown]>) {
    t(`CSO2 a leg that declares nothing, ${name} ⇒ PASS`, obsNoPlaceholderKey([cl(contract)]).verdict === 'PASS');
  }
  for (const [name, contract] of [['an empty string', { configSources: { 'observability-config': '' } }], ['a note', { configSources: { 'observability-config': 'no block — runs undeclared' } }],
    ['an empty list', { configSources: { 'observability-config': [] } }], ['an object', { configSources: { 'observability-config': {} } }], ['["none"]', { configSources: { 'observability-config': ['none'] } }],
    ['configSources a sentence', { configSources: 'none for observability' }], ['configSources a list', { configSources: K8 }]] as Array<[string, unknown]>) {
    t(`CSO3 a placeholder — ${name} ⇒ FINDING`, obsNoPlaceholderKey([cl(contract)]).verdict === 'FINDING');
  }
  t('CSO4 a DECLARED leg (the block under the key parses; or in its own task text) ⇒ PASS, counted as declared',
    obsNoPlaceholderKey([cl({ configSources: { 'observability-config': [GIT, LIVE] } })]).verdict === 'PASS' && obsNoPlaceholderKey([cl({}, [GIT])]).lines.join('\n').includes('1 declare a block that parses'));
  t('CSO5 one clean leg and one placeholder leg ⇒ FINDING (every leg is read)', obsNoPlaceholderKey([cl({}), cl({ configSources: { 'observability-config': '' } })]).verdict === 'FINDING');
  // cso-obs-undeclared-leg
  const UND = { version: 1, checked: false, reason: 'config-sources-absent', declaration: { state: 'absent', grammarVersion: 1 }, undeclared: { heldFrom: 'service', files: 3, refusals: 0 } };
  const fl = (over: Record<string, unknown> = {}) => ({ id: 'L', description: body(null), contract: {}, snapshot: false, heldEdit: { state: 'applied', forced: false }, harvester: { configSourceReads: UND } as Record<string, unknown> | null, ...over });
  t('CSO6 a no-block leg: no snapshot, no Config-lane reason, the undeclared stamp ⇒ PASS', obsUndeclaredLeg([fl()]).verdict === 'PASS');
  t('CSO7 forced by the Config lane (could-not-check; unparseable) ⇒ FINDING', obsUndeclaredLeg([fl({ heldEdit: { forced: true, reason: 'config-sources-could-not-check' } })]).verdict === 'FINDING'
    && obsUndeclaredLeg([fl({ heldEdit: { forced: true, reason: 'config-sources-unparseable' } })]).verdict === 'FINDING');
  t('CSO8 a reason that is NOT the Config lane\'s (partial) is not this control\'s finding', obsUndeclaredLeg([fl({ heldEdit: { forced: true, reason: 'partial' } })]).verdict === 'PASS');
  t('CSO9 no undeclared stamp, a snapshot, or a comparison record on a no-block leg ⇒ FINDING', obsUndeclaredLeg([fl({ harvester: {} })]).verdict === 'FINDING'
    && obsUndeclaredLeg([fl({ snapshot: true })]).verdict === 'FINDING' && obsUndeclaredLeg([fl({ harvester: { configSourceReads: UND, fileSourceCompare: {} } })]).verdict === 'FINDING');
  t('CSO10 no such leg, or no Harvester result yet ⇒ UNEXERCISED', obsUndeclaredLeg([]).verdict === 'UNEXERCISED' && obsUndeclaredLeg([fl({ harvester: null })]).verdict === 'UNEXERCISED'
    && obsUndeclaredLeg([fl({ description: body([GIT]) })]).verdict === 'UNEXERCISED');
  // cso-obs-declared-facts
  const reads = (items: unknown[], extra: Record<string, unknown> = {}) => ({ version: 1, checked: true, unit: 'files', items, notRead: 0, ...extra });
  const item = (kind: string, state: string) => ({ label: 'obs-otelcol', kind, read: { state } });
  const dh = (r: unknown) => ({ fileSourceCompare: { version: 1 }, configSourceReads: r, liveEvidence: { summary: 'all-read' }, gitLiveDrift: { checked: true } });
  const dl = (over: Record<string, unknown> = {}) => ({ id: 'D', description: body([GIT, LIVE]), contract: {}, snapshot: true, heldEdit: null, harvester: dh(reads([item('git-file', 'read'), item('live-read', 'read')])) as Record<string, unknown> | null, ...over });
  t('CSO11 a declared leg with its snapshot, the record and the three facts, every line tied ⇒ PASS', obsDeclaredFacts([dl()]).verdict === 'PASS');
  t('CSO12 a line reading file-from-other-service / registered-under-other-name, or an unresolved service ⇒ FINDING (the Harvester left the descriptor-URL route)',
    obsDeclaredFacts([dl({ harvester: dh(reads([item('live-read', 'file-from-other-service')])) })]).verdict === 'FINDING'
    && obsDeclaredFacts([dl({ harvester: dh(reads([item('service-held', 'registered-under-other-name')])) })]).verdict === 'FINDING'
    && obsDeclaredFacts([dl({ harvester: dh(reads([item('git-file', 'read')], { unresolvedServices: ['https://…'] })) })]).verdict === 'FINDING');
  t('CSO13 a missing record or fact, no snapshot, or the undeclared stamp on a declared leg ⇒ FINDING', obsDeclaredFacts([dl({ harvester: { configSourceReads: reads([]) } })]).verdict === 'FINDING'
    && obsDeclaredFacts([dl({ snapshot: false })]).verdict === 'FINDING' && obsDeclaredFacts([dl({ harvester: dh({ ...UND }) })]).verdict === 'FINDING');
  {
    // sec-ops (join review): stored strings are printed through printable() — an escape sequence in a reason, a label, a kind or a summary never reaches a line
    const ESC = '\u001b[31mRED\u001b[0m\u202e'; const bad = (ls: string[]) => ls.some((l) => /[\u0000-\u001f\u007f\u202e]/.test(l));
    const a = obsUndeclaredLeg([fl({ heldEdit: { forced: true, reason: `config-sources-${ESC}` }, harvester: { configSourceReads: { ...UND, reason: ESC } } })]);
    const b = obsDeclaredFacts([dl({ harvester: { fileSourceCompare: {}, configSourceReads: reads([{ label: ESC, kind: ESC, read: { state: ESC } }]), liveEvidence: { summary: ESC }, gitLiveDrift: { checked: false, reason: ESC } } })]);
    const c = obsNoPlaceholderKey([{ id: `L${ESC}`, description: 'x', contract: { configSources: { 'observability-config': '' } } }]);
    t('CSO15 an escape sequence in a stored reason, label, kind, state, summary or id never reaches a printed line (all three controls)',
      !bad(a.lines) && !bad(b.lines) && !bad(c.lines) && a.lines.join('').includes('RED') && b.lines.join('').includes('RED') && a.verdict === 'FINDING' && c.verdict === 'FINDING');
  }
  t('CSO14 no declared leg, or no Harvester result yet ⇒ UNEXERCISED; a plain not-read line is NOT a registration finding', obsDeclaredFacts([fl()]).verdict === 'UNEXERCISED'
    && obsDeclaredFacts([dl({ harvester: null })]).verdict === 'UNEXERCISED' && obsDeclaredFacts([dl({ harvester: dh(reads([item('live-read', 'not-read')])) })]).verdict === 'PASS');
}

{ // RRW1-RRW4 — the read rule widened to kubernetes-gitops / terraform-iac (pre-registered 2026-11-26)
  const h = (rule: boolean, states: string[], tools: string[] = []) => ({ protocolInjection: { configSourcesReadRule: rule },
    configSourceReads: { items: states.map((s, i) => ({ label: `l${i}`, kind: i ? 'live-read' : 'git-file', read: { state: s } })) },
    toolCalls: tools.map((x) => ({ tool: 'services', arguments: { action: 'call', targetService: 's', tool: x } })) });
  const leg = (o: any = {}) => ({ id: 'L', protocol: 'kubernetes-gitops-protocol', snapshot: true, heldEdit: null, harvesters: [h(true, ['read', 'read'], ['list_resources'])], ...o });
  const ok = readRuleWidened([leg(), leg({ protocol: 'terraform-iac-protocol' })]);
  t('RRW1 declared k8s + tf Harvesters with the rule, every line read, no force ⇒ PASS; the WATCH line prints the services calls', ok.verdict === 'PASS' && ok.lines.some((l) => l.includes('WATCH services calls: list_resources×1')), JSON.stringify(ok));
  t('RRW2 the rule absent, a declared line not read, or a git-file-not-held force ⇒ FINDING',
    readRuleWidened([leg({ harvesters: [h(false, ['read'])] })]).verdict === 'FINDING'
    && readRuleWidened([leg({ harvesters: [h(true, ['read', 'not-read'])] })]).verdict === 'FINDING'
    && readRuleWidened([leg({ heldEdit: { forced: true, reason: 'git-file-not-held' } })]).verdict === 'FINDING');
  t('RRW3 extra live reads incl. list_secret_names are a WATCH, never a finding',
    (() => { const r = readRuleWidened([leg({ harvesters: [h(true, ['read', 'read'], ['list_resources', 'list_secret_names'])] })]); return r.verdict === 'PASS' && r.lines.some((l) => l.includes('list_secret_names present')); })());
  t('RRW4 an undeclared leg, an observability leg, or no Harvester result yet ⇒ UNEXERCISED',
    readRuleWidened([leg({ snapshot: false })]).verdict === 'UNEXERCISED' && readRuleWidened([leg({ protocol: 'observability-config-protocol' })]).verdict === 'UNEXERCISED'
    && readRuleWidened([leg({ harvesters: [null] })]).verdict === 'UNEXERCISED');
}

console.log(`\n${fail ? '❌' : '✅'} canary-req-sources: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
