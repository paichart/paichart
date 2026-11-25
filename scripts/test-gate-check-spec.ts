/**
 * test:gate-check-spec — the `--spec` option of the operator's gate report (Config sources STEP 3 slice P4, plan W11; owner decision 4
 * option b: warn, not block). PURE: no database, no git, no network — it passes inside a built export tree.
 *
 * The plan's two gates: a fixture contract that LACKS the key ⇒ the report shows the difference; a spec with no block ⇒ clean.
 * Plus: both directions, the leg's own task text, both Device lanes, both awaiting states for observability (inert as shipped), and
 * the pins that keep the option a report (no exit code, no protocol name, no kind name of its own).
 *
 * Run: npm run test:gate-check-spec
 */
import * as fs from 'fs';
import * as path from 'path';
import { compareSpecToContract, printable, specTokens, SPEC_FINDER_ERROR_CAP, type SpecLeg } from './gate-check-spec';
import { obsNoPlaceholderKey } from './canary-req-sources';
import { CONFIG_SOURCE_AWAITING_TEXT, CONFIG_SOURCE_LANES, DEVICE_SOURCE_LANES } from '../lib/agents/harness/held-bytes/variant';
import { configSourcesReadKeys } from '../lib/agents/harness/plan-spawn-carry';
import { CONFIG_SOURCE_KINDS } from '../lib/agents/harness/config-sources';
import { DEVICE_SOURCE_KINDS } from '../lib/agents/harness/device-sources';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
const eq = (a: unknown, b: unknown, what = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const NONE: readonly string[] = [];
// observability's row awaiting its text: the tree before the 1.12.0 join (2026-11-23) and the state a revert of it returns to. The
// tree's own list is EMPTY since the join, so "as shipped" (no list passed) is the NONE state; the awaiting cases pass this.
const AWAITING: readonly string[] = Object.freeze(['observability-config-protocol']);
const K_GIT = 'sample-workloads: git-file — service github-service ; paichart/paichart-configs/k8s/sample-workloads.yaml';
const K_LIVE = 'cluster: live-read — service k8s-readonly';
const T_GIT = 'main-tf: git-file — service github-service ; paichart/paichart-configs/terraform/main.tf';
const O_GIT = 'obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml';
const O_HELD = 'obs-ingress.otlp-ingress.conf: service-held — service observability-readonly';
const N_GIT = (d: string) => `${d}: git-file — service github-service ; paichart/paichart-configs/network/base/${d}-startup.cfg`;
const N_READ = (d: string) => `${d}: device-read — service ceos-lab-readonly`;

const fence = (heading: string, lines: string[]) => ['```', heading, ...lines, '```'].join('\n');
const cfgLeg = (n: number, token: string, lines: string[] | null) =>
  [`## Pipeline ${n} objective — a ${token} leg (protocol: ${token})`, '', '- Make the change.', ...(lines ? ['', fence('## Config sources', lines)] : []), ''].join('\n');
const netLeg = (n: number, lane: 'change' | 'value', lines: string[] | null) =>
  [`## Pipeline ${n} objective — Network ${lane}`, '', lane === 'value' ? '- This leg changes nothing: it derives one address.' : '- Configure the switch.',
    ...(lines ? ['', fence('## Device sources', lines)] : []), ''].join('\n');
const spec = (...legs: string[]) => `# Program\n\nIntent.\n\n${legs.join('\n')}\n## Acceptance\n\nNode C checks.\n`;
const leg = (token: string, contract: unknown, description: string | null = 'Make the change.'): SpecLeg => ({ token, contract, description });
const marks = (c: ReturnType<typeof compareSpecToContract>) => c.rows.map((r) => [r.token, r.specDeclares, r.contractCarriesKey, r.differs, r.mark]);

console.log('── the plan\'s two gates ──');
test('G1 a spec with NO block and a contract with no sources key ⇒ clean: no row, one informational line, no ✗ — for a leg of a protocol with no sources lane; a no-block OBSERVABILITY leg has ONE unmarked row since the 1.12.0 join (and none with its row awaiting)', () => {
  const noBlock = spec(cfgLeg(1, 'kubernetes-gitops', null).replace('(protocol: kubernetes-gitops)', ''));
  // a leg whose protocol has no sources lane (until the join this fixture used an observability leg — the one such protocol then)
  const c = compareSpecToContract({ spec: noBlock, legs: [leg('requirements-authoring', { serviceDescriptors: {} })] });
  eq([c.rows, c.finderErrors, c.unattributedBlocks], [[], [], 0]);
  eq(c.lines, [{ mark: null, text: 'the spec declares no sources block and the plan\'s contract carries no sources key' }]);
  // the same spec and an observability leg, with its row awaiting (before the join; after a revert): identical — no row
  const before = compareSpecToContract({ spec: noBlock, legs: [leg('observability-config', { serviceDescriptors: {} })], awaiting: AWAITING });
  eq([before.rows, before.finderErrors, before.unattributedBlocks, before.lines], [[], [], 0, c.lines]);
  // AS SHIPPED since the join: the token has a leg, so it has a row — it says "no / no", carries NO mark, and nothing differs
  const now = compareSpecToContract({ spec: noBlock, legs: [leg('observability-config', { serviceDescriptors: {} })] });
  eq(marks(now), [['observability-config', false, false, false, null]]);
  eq(now.rows[0].line, 'observability-config (configSources): spec declares lines: no — contract carries the key: no');
  assert(!now.lines.some((l) => l.mark === false), 'a no-block observability leg must never read ✗');
});
test('G2 a fixture contract that LACKS the key ⇒ the report shows the difference, marked ✗, and names the token and the field', () => {
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT, K_LIVE])), legs: [leg('kubernetes-gitops', { serviceDescriptors: {} })] });
  eq(marks(c), [['kubernetes-gitops', true, false, true, false]]);
  assert(c.rows[0].line.startsWith('kubernetes-gitops (configSources): spec declares lines: yes — contract carries the key: no — DIFFERS'), c.rows[0].line);
  assert(/forced to needs-revision by name/.test(c.rows[0].line), 'a forced protocol: the leg is forced (asked of the lane helper)');
});
test('G3 the same spec with the key carried ⇒ ✓, not differing', () => {
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT, K_LIVE])), legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT, K_LIVE] } })] });
  eq(marks(c), [['kubernetes-gitops', true, true, false, true]]);
  eq(c.rows[0].line, 'kubernetes-gitops (configSources): spec declares lines: yes — contract carries the key: yes — lines equal: yes');
  eq(c.rows[0].linesEqual, true);
});

console.log('── both directions, and the leg\'s own task text ──');
test('D1 a contract key the spec gives NO lines for ⇒ ✗ (the planner wrote a block nobody declared)', () => {
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'terraform-iac', null)), legs: [leg('terraform-iac', { configSources: { 'terraform-iac': [T_GIT] } })] });
  eq(marks(c), [['terraform-iac', false, true, true, false]]);
  assert(/the contract carries a block the spec does not declare/.test(c.rows[0].line), c.rows[0].line);
});
test('D2 the block is in every leg\'s OWN task text and not in the contract ⇒ differing, but informational (the platform reads it there)', () => {
  const body = `Make the change.\n\n## Config sources\n- ${K_GIT}\n- ${K_LIVE}\n`;
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT, K_LIVE])), legs: [leg('kubernetes-gitops', {}, body)] });
  eq(marks(c), [['kubernetes-gitops', true, false, true, null]]);
  eq([c.rows[0].legs, c.rows[0].legsWithOwnBlock], [1, 1]);
  // one of two legs carries it ⇒ ✗ again, with the count
  const two = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT, K_LIVE])), legs: [leg('kubernetes-gitops', {}, body), leg('kubernetes-gitops', {})] });
  eq([two.rows[0].mark, two.rows[0].legsWithOwnBlock, two.rows[0].legs], [false, 1, 2]);
  assert(/1 of 2 leg\(s\) carry a block in their own task text/.test(two.rows[0].line), two.rows[0].line);
});
test('D3 a token with a leg, no block and no key ⇒ one informational row (nothing differs); a token with no leg, no block, no key ⇒ no row', () => {
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'terraform-iac', null)), legs: [leg('terraform-iac', {})] });
  eq(marks(c), [['terraform-iac', false, false, false, null]]);
});
test('D4 the carried value is not lines (the five Architect shapes) ⇒ the key IS carried, and the row says the platform cannot read it', () => {
  for (const v of ['', [], 'see the topology', { note: 'no sources' }]) {
    const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT])), legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': v } })] });
    const r = c.rows[0];
    eq([r.specDeclares, r.contractCarriesKey], [true, r.contractState !== 'absent'], `${JSON.stringify(v)}: `);
    assert(r.mark === false, `${JSON.stringify(v)}: must be ✗ (state ${r.contractState}): ${r.line}`);
  }
  // a string-valued configSources (not keyed by token) carries NO key for any token
  const s = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT])), legs: [leg('kubernetes-gitops', { configSources: K_GIT })] });
  eq([s.rows[0].contractCarriesKey, s.rows[0].mark], [false, false]);
});
test('D5 two legs of one token, one contract without the key ⇒ ✗ with the count (a key every leg of the token must hold)', () => {
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT]), cfgLeg(2, 'kubernetes-gitops', [K_GIT])),
    legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT] } }), leg('kubernetes-gitops', {})] });
  eq([c.rows[0].differs, c.rows[0].mark, c.rows[0].legsCarryingKey], [false, false, 1]);
  assert(/only 1 of 2 leg\(s\)/.test(c.rows[0].line), c.rows[0].line);
});

console.log('── network: the two Device lanes are two tokens ──');
test('N1 a change block and a value block are attributed by LANE; a dropped value block says the leg RUNS, a dropped change block says it is stopped', () => {
  const s = spec(netLeg(1, 'value', [N_GIT('ceos1')]), netLeg(2, 'change', [N_GIT('ceos2'), N_READ('ceos3')]));
  const ok = compareSpecToContract({ spec: s, legs: [
    leg('network-derivation', { deviceSources: { 'network-derivation': [N_GIT('ceos1')], 'network-provisioning': [N_GIT('ceos2'), N_READ('ceos3')] } }),
    leg('network-provisioning', { deviceSources: { 'network-derivation': [N_GIT('ceos1')], 'network-provisioning': [N_GIT('ceos2'), N_READ('ceos3')] } })] });
  eq(marks(ok), [['network-provisioning', true, true, false, true], ['network-derivation', true, true, false, true]]);
  const dropped = compareSpecToContract({ spec: s, legs: [leg('network-derivation', {}), leg('network-provisioning', {})] });
  eq(dropped.rows.map((r) => [r.token, r.mark]), [['network-provisioning', false], ['network-derivation', false]]);
  assert(/forced to needs-revision by name/.test(dropped.rows[0].line) && /a value leg with no block RUNS/.test(dropped.rows[1].line), dropped.rows.map((r) => r.line).join('\n'));
});
test('N2 keyed by a LEG NAME (register ARCHITECT-CONTRACT-KEY-BY-LEG) ⇒ the token\'s key is not carried ⇒ ✗', () => {
  const c = compareSpecToContract({ spec: spec(netLeg(1, 'change', [N_READ('ceos1')])), legs: [leg('network-provisioning', { deviceSources: { 'pipeline-1-edge-ceos1': [N_READ('ceos1')] } })] });
  eq(marks(c), [['network-provisioning', true, false, true, false]]);
  // the block IS in the contract, under names the platform does not read — so the line must not say it is not in the contract at all
  assert(/did not reach the plan's contract under this protocol's key/.test(c.rows[0].line), c.rows[0].line);
});
test('N3 a GENERATED spec whose Device block states no lane ⇒ counted under no token, said so, with the finder\'s own error listed', () => {
  const gen = `# Program\n\n## Design decisions\n\n| id | answer |\n|---|---|\n\n${netLeg(1, 'change', [N_READ('ceos1')])}\n## Acceptance\n\nx\n`;
  const c = compareSpecToContract({ spec: gen, legs: [leg('network-provisioning', { deviceSources: { 'network-provisioning': [N_READ('ceos1')] } })] });
  eq([c.unattributedBlocks, c.rows[0].specDeclares, c.rows[0].mark], [1, false, false]);
  assert(c.lines.some((l) => /state no lane/.test(l.text)) && c.finderErrors.some((e) => /no lane sentence/.test(e)), JSON.stringify(c.lines));
});

console.log('── ✓ means the DECLARATIONS are equal (architectural F4), never only "a key is present" ──');
test('E1 the contract carries the key but its LINES DIFFER from the spec\'s block ⇒ ✗ "lines differ"; the same lines in another order, or with the heading copied, ⇒ ✓', () => {
  const s = spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT, K_LIVE]));
  const short = compareSpecToContract({ spec: s, legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT] } })] });
  eq([short.rows[0].contractCarriesKey, short.rows[0].differs, short.rows[0].linesEqual, short.rows[0].mark], [true, false, false, false]);
  assert(/it carries a key, but the LINES DIFFER/.test(short.rows[0].line) && !/lines equal: yes/.test(short.rows[0].line), short.rows[0].line);
  const edited = compareSpecToContract({ spec: s, legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT, 'cluster: live-read — service another-cluster'] } })] });
  eq([edited.rows[0].linesEqual, edited.rows[0].mark], [false, false], 'one service edited: ');
  for (const v of [[K_LIVE, K_GIT], `## Config sources\n${K_GIT}\n${K_LIVE}`, `${K_GIT}\n${K_LIVE}\n`]) {
    const c = compareSpecToContract({ spec: s, legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': v } })] });
    eq([c.rows[0].linesEqual, c.rows[0].mark], [true, true], `${JSON.stringify(v).slice(0, 40)}: `);
  }
});
test('E2 the Device grammar the same: a dropped device line ⇒ ✗ lines differ; equal ⇒ ✓', () => {
  const s = spec(netLeg(1, 'change', [N_GIT('ceos2'), N_READ('ceos3')]));
  const ok = compareSpecToContract({ spec: s, legs: [leg('network-provisioning', { deviceSources: { 'network-provisioning': [N_READ('ceos3'), N_GIT('ceos2')] } })] });
  eq([ok.rows[0].linesEqual, ok.rows[0].mark], [true, true]);
  const lost = compareSpecToContract({ spec: s, legs: [leg('network-provisioning', { deviceSources: { 'network-provisioning': [N_GIT('ceos2')] } })] });
  eq([lost.rows[0].linesEqual, lost.rows[0].mark], [false, false]);
});
test('E3 a spec that gives two legs of ONE protocol DIFFERENT blocks ⇒ said so, ✗, never ✓ — whichever of the two the contract carries', () => {
  const s = spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT, K_LIVE]), cfgLeg(2, 'kubernetes-gitops', ['other: git-file — service github-service ; paichart/paichart-configs/k8s/other.yaml']));
  for (const carried of [[K_GIT, K_LIVE], ['other: git-file — service github-service ; paichart/paichart-configs/k8s/other.yaml']]) {
    const good = { configSources: { 'kubernetes-gitops': carried } };
    const c = compareSpecToContract({ spec: s, legs: [leg('kubernetes-gitops', good), leg('kubernetes-gitops', good)] });
    eq([c.rows[0].specBlocksDiffer, c.rows[0].linesEqual, c.rows[0].mark], [true, null, false]);
    assert(/DIFFERENT blocks: the contract has one key per protocol and cannot carry both/.test(c.rows[0].line), c.rows[0].line);
  }
  // two legs given the SAME block: one declaration, ✓
  const same = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT]), cfgLeg(2, 'kubernetes-gitops', [K_GIT])),
    legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT] } }), leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT] } })] });
  eq([same.rows[0].specBlocksDiffer, same.rows[0].mark], [false, true]);
});
test('E4 a spec block that does not parse is never ✓: lines not compared, said so', () => {
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT, 'not a line'])), legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT] } })] });
  eq([c.rows[0].linesEqual, c.rows[0].mark], [null, false]);
  assert(/lines not compared/.test(c.rows[0].line), c.rows[0].line);
});

console.log('── a block that was not attributed is never "spec declares lines: no" (architectural F5) ──');
test('U1 the finder reported a problem or a block with no lane ⇒ the row says "no block attributed to this protocol"; a clean spec with no block says "spec declares lines: no"', () => {
  const gen = `# Program\n\n## Design decisions\n\n| id | answer |\n|---|---|\n\n${netLeg(1, 'change', [N_READ('ceos1')])}\n## Acceptance\n\nx\n`;
  const c = compareSpecToContract({ spec: gen, legs: [leg('network-provisioning', { deviceSources: { 'network-provisioning': [N_READ('ceos1')] } })] });
  eq([c.rows[0].specUncertain, c.rows[0].specDeclares, c.rows[0].mark], [true, false, false]);
  assert(/no block attributed to this protocol — contract carries the key: yes/.test(c.rows[0].line) && !/spec declares lines: no/.test(c.rows[0].line), c.rows[0].line);
  assert(!/the spec does not declare \(check/.test(c.rows[0].line) && /no spec block was attributed/.test(c.rows[0].line), 'it must not claim the spec does not declare it');
  const clean = compareSpecToContract({ spec: spec(cfgLeg(1, 'terraform-iac', null)), legs: [leg('terraform-iac', {})] });
  assert(/spec declares lines: no/.test(clean.rows[0].line) && clean.rows[0].specUncertain === false, clean.rows[0].line);
  // no row at all + an unattributed block: the clean sentence is NOT printed
  // (an observability block is unattributed only while its row awaits its text — since the 1.12.0 join that state is passed explicitly)
  const none = compareSpecToContract({ spec: spec(cfgLeg(1, 'observability-config', [O_GIT])), legs: [leg('observability-config', {})], awaiting: AWAITING });
  eq(none.lines[0].text, 'no sources block was attributed to a protocol and the plan\'s contract carries no sources key');
});

console.log('── everything printed from a spec or a contract is stripped of control characters and escape sequences (sec-ops LOW 2) ──');
test('X1 an ESC sequence, a bidi override, a NUL and a newline in a heading never reach a printed line', () => {
  const evil = `## Pipeline 1 objective — \u001b[2K\u001b[1;31mALL CHECKS HOLD\u001b[0m \u202egnp\u0000 \u009b31m \u001bc x\n\n\`\`\`\n## Config sources\n${K_GIT}\n\`\`\`\n`;
  const c = compareSpecToContract({ spec: `# P\n\n${evil}`, legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT] } })] });
  assert(c.finderErrors.length > 0 && c.finderErrors.some((e) => e.includes('ALL CHECKS HOLD')), 'the fixture must carry the heading into a finder message');
  const bad = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;
  for (const l of [...c.lines.map((x) => x.text), ...c.rows.map((r) => r.line), ...c.finderErrors]) assert(!bad.test(l), `a control or bidi character was printed: ${JSON.stringify(l)}`);
  assert(!c.lines.some((l) => /\[2K|\[1;31m|\[0m/.test(l.text)), 'the body of an escape sequence was left behind');
});
test('X2 printable(): CSI and two-character escapes removed whole, C0/C1/DEL and bidi/zero-width removed, tab and newline become a space, ordinary text untouched', () => {
  eq(printable('a\u001b[31mb\u001b[0mc'), 'abc');
  eq(printable('a\u001bcb\u0007c\u007fd\u0085e'), 'abcde');
  eq(printable('a\u202eb\u200bc\ufeffd'), 'abcd');
  eq(printable('one\ntwo\tthree\rfour'), 'one two threefour');
  const plain = 'kubernetes-gitops (configSources): spec declares lines: yes — contract carries the key: yes ✓ ✗ · ⇒ “x”';
  eq(printable(plain), plain);
  const src = fs.readFileSync(path.join(__dirname, 'gate-check.ts'), 'utf8');
  assert(/\$\{printable\(s\)\}/.test(src), 'the report\'s line() must print through printable()');
});

console.log('── the two-table rule (owner decision (b), 2026-11-15): a key in the WRONG field is said so, never "carries the key: yes" ──');
test('W1 a NETWORK token filed under configSources ⇒ carries the key: NO, ✗, and the line names the wrong field', () => {
  const c = compareSpecToContract({ spec: spec(netLeg(1, 'change', [N_READ('ceos1')])), legs: [leg('network-provisioning', { configSources: { 'network-provisioning': [N_READ('ceos1')] } })] });
  eq(c.rows.map((r) => [r.token, r.field, r.specDeclares, r.contractCarriesKey, r.keyInWrongField, r.mark]), [['network-provisioning', 'deviceSources', true, false, true, false]]);
  assert(/contract carries the key: no/.test(c.rows[0].line) && /filed this protocol's block under configSources, the WRONG field: the platform reads it only under deviceSources/.test(c.rows[0].line), c.rows[0].line);
});
test('W2 a KUBERNETES token filed under deviceSources ⇒ carries the key: NO, ✗, and the line names the wrong field', () => {
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT])), legs: [leg('kubernetes-gitops', { deviceSources: { 'kubernetes-gitops': [K_GIT] } })] });
  eq(c.rows.map((r) => [r.token, r.field, r.specDeclares, r.contractCarriesKey, r.keyInWrongField, r.mark]), [['kubernetes-gitops', 'configSources', true, false, true, false]]);
  assert(/contract carries the key: no/.test(c.rows[0].line) && /under deviceSources, the WRONG field: the platform reads it only under configSources/.test(c.rows[0].line), c.rows[0].line);
});
test('W3 the wrong field is ✗ even when the spec declares nothing and no leg of the token exists, and even when the right field ALSO carries the key', () => {
  const lone = compareSpecToContract({ spec: spec(cfgLeg(1, 'terraform-iac', null)), legs: [leg('terraform-iac', { deviceSources: { 'kubernetes-gitops': [K_GIT] } })] });
  eq(lone.rows.filter((r) => r.token === 'kubernetes-gitops').map((r) => [r.contractCarriesKey, r.keyInWrongField, r.mark]), [[false, true, false]]);
  const both = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT])), legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT] }, deviceSources: { 'kubernetes-gitops': [K_GIT] } })] });
  eq(both.rows.map((r) => [r.contractCarriesKey, r.keyInWrongField, r.differs, r.mark]), [[true, true, false, false]]);
  // …and a correctly filed four-domain contract has no wrong-field row
  assert(!compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT])), legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': [K_GIT] }, deviceSources: { 'network-provisioning': [N_READ('ceos1')] } })] }).rows.some((r) => r.keyInWrongField), 'a false wrong-field');
});
test('W4 the leg\'s own task text, BOTH directions (coordinator ruling 2): without it the ✗ would be false; with no leg carrying a block the ✗ stays', () => {
  const s = spec(cfgLeg(1, 'kubernetes-gitops', [K_GIT, K_LIVE]));
  const body = `Make the change.\n\n## Config sources\n- ${K_GIT}\n- ${K_LIVE}\n`;
  eq(compareSpecToContract({ spec: s, legs: [leg('kubernetes-gitops', {}, body)] }).rows[0].mark, null, 'every leg carries it: ');
  eq(compareSpecToContract({ spec: s, legs: [leg('kubernetes-gitops', {}, 'Make the change.')] }).rows[0].mark, false, 'no leg carries it: ');
  eq(compareSpecToContract({ spec: s, legs: [leg('kubernetes-gitops', {}, null)] }).rows[0].mark, false, 'no description at all: ');
});

console.log('── observability: INERT as shipped, live when its row leaves the awaiting list — with no edit to the module ──');
test('O1 the token list is the platform\'s read keys for the awaiting list (derived, both states)', () => {
  const dev = Object.values(DEVICE_SOURCE_LANES).map((l) => l.contractKey);
  eq(specTokens().map((t) => t.token), [...dev, ...configSourcesReadKeys()], 'as shipped: ');
  eq(specTokens(NONE).map((t) => t.token), [...dev, ...Object.values(CONFIG_SOURCE_LANES).map((l) => l.contractKey)], 'every row shipped: ');
  assert(!specTokens(AWAITING).some((t) => t.token === 'observability-config') && specTokens(NONE).some((t) => t.token === 'observability-config'),
    'observability must be absent while its row awaits and present when no row awaits its text');
  // RE-READ AT THE JOIN (2026-11-23), as this line asked: the shipped list is EMPTY, so the report has an observability row with no
  // edit to the tool — as shipped is the every-row-shipped state.
  eq(CONFIG_SOURCE_AWAITING_TEXT.length, 0, 'the shipped list has no awaiting row since the observability 1.12.0 join: ');
  eq(specTokens().map((t) => t.token), specTokens(NONE).map((t) => t.token), 'as shipped ≡ every row shipped: ');
});
test('O2 WITH ITS ROW AWAITING (before the join; after a revert): an observability block in the spec has NO row (the platform does not read the key); the finder says why. AS SHIPPED since the 1.12.0 join the same dropped block is ✗', () => {
  const s = spec(cfgLeg(1, 'observability-config', [O_GIT, O_HELD]));
  const c = compareSpecToContract({ spec: s, legs: [leg('observability-config', { serviceDescriptors: {} })], awaiting: AWAITING });
  eq(c.rows, []);
  assert(c.finderErrors.length === 1 && /names no config-sources protocol/.test(c.finderErrors[0]), JSON.stringify(c.finderErrors));
  assert(!c.lines.some((l) => l.mark === false), 'no ✗ for a protocol whose text has not shipped');
  // as shipped (no list passed — what `npm run report:gate -- <gate> --spec` does): the block is read, and a plan that dropped it is ✗
  const now = compareSpecToContract({ spec: s, legs: [leg('observability-config', { serviceDescriptors: {} })] });
  eq(marks(now), [['observability-config', true, false, true, false]]);
  eq(now.finderErrors, [], 'the finder attributes the block: ');
  assert(/RUNS, on the files its read-only service returns, and nothing stops it/.test(now.rows[0].line), now.rows[0].line);
});
test('O3 EVERY ROW SHIPPED: the dropped observability block is ✗ and says the leg RUNS undeclared; carried ⇒ ✓; a key with no block ⇒ ✗', () => {
  const s = spec(cfgLeg(1, 'observability-config', [O_GIT, O_HELD]));
  const dropped = compareSpecToContract({ spec: s, legs: [leg('observability-config', { serviceDescriptors: {} })], awaiting: NONE });
  eq(marks(dropped), [['observability-config', true, false, true, false]]);
  assert(/RUNS, on the files its read-only service returns, and nothing stops it/.test(dropped.rows[0].line), dropped.rows[0].line);
  const carried = compareSpecToContract({ spec: s, legs: [leg('observability-config', { configSources: { 'observability-config': [O_GIT, O_HELD] } })], awaiting: NONE });
  eq(marks(carried), [['observability-config', true, true, false, true]]);
  const invented = compareSpecToContract({ spec: spec(cfgLeg(1, 'observability-config', null)), legs: [leg('observability-config', { configSources: { 'observability-config': [O_GIT] } })], awaiting: NONE });
  eq(marks(invented), [['observability-config', false, true, true, false]]);
});
// ── The 1.12.0 join (owner decision 2026-11-23): the placeholder exception must be VISIBLE at the plan gate. The SAME 13 shapes as the
// live control `cso-obs-no-placeholder-key` (test:canary-req-sources CSO2 / CSO3) — the report and the control are pinned to agree.
const K_BLOCK = [K_GIT];
const SAFE_SHAPES: Array<[string, unknown]> = [['no configSources', { serviceDescriptors: {} }], ['an empty object', { configSources: {} }], ['another protocol\'s key only', { configSources: { 'kubernetes-gitops': K_BLOCK } }],
  ['configSources null', { configSources: null }], ['the key null', { configSources: { 'observability-config': null } }], ['a leg-name key', { configSources: { 'pipeline-4-observability': K_BLOCK } }]];
const KEY_PLACEHOLDERS: Array<[string, unknown]> = [['an empty string', { configSources: { 'observability-config': '' } }], ['a note', { configSources: { 'observability-config': 'no block — runs undeclared' } }],
  ['an empty list', { configSources: { 'observability-config': [] } }], ['an object', { configSources: { 'observability-config': {} } }], ['["none"]', { configSources: { 'observability-config': ['none'] } }]];
const FIELD_NOT_OBJECT: Array<[string, unknown]> = [['configSources a sentence', { configSources: 'none for observability' }], ['configSources a list', { configSources: K_BLOCK }]];
const obsNoBlock = (contract: unknown) => compareSpecToContract({ spec: spec(cfgLeg(1, 'observability-config', null)), legs: [leg('observability-config', contract)] });
/** The ✗ lines that concern the observability leg: its own row, or a field line (a ✗ on ANOTHER protocol's row — a Kubernetes key
 *  the spec does not declare — is that protocol's finding, true and unrelated). */
const obsX = (c: ReturnType<typeof compareSpecToContract>) => c.lines.filter((l) => l.mark === false && (l.text.startsWith('observability-config ') || l.text.startsWith('configSources: ')));
const STOP_WORDS = 'the platform will stop every leg of this protocol by name (config-sources-unparseable), a leg that declares nothing included. Re-plan before releasing the gate';
test('PH1 a no-block observability leg, the 6 SAFE contract shapes ⇒ no ✗ anywhere, no stop sentence', () => {
  for (const [name, contract] of SAFE_SHAPES) {
    const c = obsNoBlock(contract);
    assert(obsX(c).length === 0 && c.fieldsNotObject.length === 0 && !c.lines.some((l) => /will stop/.test(l.text)), `${name}: ${JSON.stringify(c.lines)}`);
  }
});
test('PH2 a placeholder under configSources["observability-config"] (5 shapes) ⇒ ✗, and the row says the leg WILL BE STOPPED by name although it declared nothing, and to re-plan', () => {
  for (const [name, contract] of KEY_PLACEHOLDERS) {
    const c = obsNoBlock(contract);
    eq(marks(c), [['observability-config', false, true, true, false]], `${name}: `);
    assert(c.rows[0].line.includes('DIFFERS: the spec declares no block, and the contract carries a value under this key') && c.rows[0].line.includes(STOP_WORDS), `${name}: ${c.rows[0].line}`);
    assert(!/a block the spec does not declare/.test(c.rows[0].line), `${name}: a placeholder is not "a block"`);
  }
  // a spec that DOES declare, a contract placeholder: the existing "cannot read the carried value" words, plus the stop sentence
  const d = compareSpecToContract({ spec: spec(cfgLeg(1, 'observability-config', [O_GIT])), legs: [leg('observability-config', { configSources: { 'observability-config': '' } })] });
  assert(d.rows[0].mark === false && /cannot read the carried value as lines/.test(d.rows[0].line) && d.rows[0].line.includes(STOP_WORDS), d.rows[0].line);
});
test('PH3 a `forced` protocol keeps its existing wording: a placeholder under a Kubernetes key prints no stop sentence of this kind (its legs stop without a block anyway)', () => {
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', null)), legs: [leg('kubernetes-gitops', { configSources: { 'kubernetes-gitops': '' } })] });
  eq(marks(c), [['kubernetes-gitops', false, true, true, false]]);
  assert(/DIFFERS: the contract carries a block the spec does not declare/.test(c.rows[0].line) && !/will stop every leg/.test(c.rows[0].line), c.rows[0].line);
});
test('PH4 a sources FIELD that is not an object (2 shapes, and deviceSources likewise) ⇒ ONE ✗ line per field naming every protocol with a leg and what the platform does to it; the clean sentence is not printed', () => {
  for (const [name, contract] of FIELD_NOT_OBJECT) {
    const c = obsNoBlock(contract);
    eq(c.fieldsNotObject, ['configSources'], `${name}: `);
    const bad = c.lines.filter((l) => l.mark === false);
    assert(bad.length === 1 && bad[0].text.startsWith('configSources: the plan\'s contract carries this field as ') && bad[0].text.includes('not as an object keyed by protocol name')
      && bad[0].text.includes('it will stop every leg of these protocols by name, a leg that declares nothing included: observability-config (config-sources-unparseable)')
      && bad[0].text.endsWith('. Re-plan before releasing the gate'), `${name}: ${JSON.stringify(c.lines)}`);
  }
  // every protocol of the field that has a leg is named — Kubernetes and Terraform beside observability; a protocol with no leg is not
  const three = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', null), cfgLeg(2, 'observability-config', null)),
    legs: [leg('kubernetes-gitops', { configSources: 'x' }), leg('observability-config', { configSources: 'x' })] });
  const t3 = three.lines.find((l) => l.text.startsWith('configSources: '))!.text;
  assert(t3.includes('kubernetes-gitops (config-sources-unparseable), observability-config (config-sources-unparseable)') && !t3.includes('terraform-iac') && t3.includes('on 2 of 2 leg(s)'), t3);
  // deviceSources: the change lane is stopped by its own name; the value lane is named as NOT stopped
  const dev = compareSpecToContract({ spec: spec(netLeg(1, 'change', null), netLeg(2, 'value', null)), legs: [leg('network-provisioning', { deviceSources: ['x'] }), leg('network-derivation', { deviceSources: ['x'] })] });
  const td = dev.lines.find((l) => l.text.startsWith('deviceSources: '))!;
  assert(td.mark === false && td.text.includes('network-provisioning (device-sources-unparseable)') && td.text.includes('not stopped, its declaration reads unparseable: network-derivation') && td.text.includes('a list'), td.text);
  // a program with no leg of a stopped protocol says so, and no clean sentence is printed beside a ✗
  const none = compareSpecToContract({ spec: spec(cfgLeg(1, 'kubernetes-gitops', null).replace('(protocol: kubernetes-gitops)', '')), legs: [leg('requirements-authoring', { configSources: 'x' })] });
  assert(none.lines.length === 1 && none.lines[0].mark === false && none.lines[0].text.includes('no leg of this program has a protocol the platform stops for it'), JSON.stringify(none.lines));
});
test('PH5 THE REPORT AND THE LIVE CONTROL AGREE on all 13 shapes: `cso-obs-no-placeholder-key` reads FINDING exactly where the report prints a ✗', () => {
  const all = [...SAFE_SHAPES.map((x) => [...x, false] as const), ...KEY_PLACEHOLDERS.map((x) => [...x, true] as const), ...FIELD_NOT_OBJECT.map((x) => [...x, true] as const)];
  eq(all.length, 13, 'the shapes under test: ');
  for (const [name, contract, stops] of all) {
    const report = obsX(obsNoBlock(contract)).length > 0;
    const control = obsNoPlaceholderKey([{ id: 'L', description: 'Make the change.', contract }]).verdict === 'FINDING';
    eq([report, control], [stops, stops], `${name} (report ✗, control FINDING): `);
  }
});
test('PH6 every new line is stripped of control characters (a planted escape under the token name of a leg never reaches the line)', () => {
  const c = compareSpecToContract({ spec: spec(cfgLeg(1, 'observability-config', null)), legs: [leg('observability-config', { configSources: 'x\u001b[31m' })] });
  for (const l of c.lines) eq(l.text, printable(l.text), 'a line that printable() would change: ');
  assert(c.lines.every((l) => !/[\u0000-\u001f\u007f\u202e]/.test(l.text)), JSON.stringify(c.lines));
  // The field line carries no text from a spec or a contract today (fixed words, platform tokens, counts, a shape word), so no input
  // can show a missing wrap by behaviour — the wrap is pinned on the line itself, for the day a value is added to it.
  const src = fs.readFileSync(path.join(__dirname, 'gate-check-spec.ts'), 'utf8');
  assert(src.includes("lines.push({ mark: false, text: printable(`${field}: the plan's contract carries this field as "), 'the field-not-object line is no longer wrapped in printable()');
});
test('O4 a four-domain program: each token is compared with ITS legs\' contract only', () => {
  const s = spec(netLeg(1, 'change', [N_READ('ceos1')]), cfgLeg(2, 'kubernetes-gitops', [K_GIT]), cfgLeg(3, 'terraform-iac', [T_GIT]), cfgLeg(4, 'observability-config', [O_GIT]));
  const good = { deviceSources: { 'network-provisioning': [N_READ('ceos1')] }, configSources: { 'kubernetes-gitops': [K_GIT], 'terraform-iac': [T_GIT], 'observability-config': [O_GIT] } };
  const lost = { deviceSources: good.deviceSources, configSources: { 'kubernetes-gitops': [K_GIT], 'terraform-iac': [T_GIT] } };
  const c = compareSpecToContract({ spec: s, awaiting: NONE,
    legs: [leg('network-provisioning', good), leg('kubernetes-gitops', good), leg('terraform-iac', good), leg('observability-config', lost)] });
  eq(c.rows.map((r) => [r.token, r.mark]), [['network-provisioning', true], ['kubernetes-gitops', true], ['terraform-iac', true], ['observability-config', false]]);
});

console.log('── it is a REPORT: bounded, and it holds no rule of its own ──');
test('R1 the finder\'s errors are capped in the printed lines; the count is untruncated', () => {
  const many = Array.from({ length: SPEC_FINDER_ERROR_CAP + 3 }, (_, i) => `## Pipeline ${i + 1} objective — x\n\n\`\`\`\n## Config sources\n${K_GIT}\n\`\`\`\n`).join('\n');
  const c = compareSpecToContract({ spec: `# P\n\n${many}`, legs: [] });
  eq(c.finderErrors.length, SPEC_FINDER_ERROR_CAP + 3);
  assert(c.lines.some((l) => l.text.includes('… 3 more')), JSON.stringify(c.lines.slice(-2)));
});
test('R2 the module names no protocol and no kind of its own, reads no file and no database, and never exits', () => {
  const src = fs.readFileSync(path.join(__dirname, 'gate-check-spec.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const t of [...Object.values(CONFIG_SOURCE_LANES).map((l) => l.contractKey), ...Object.values(DEVICE_SOURCE_LANES).map((l) => l.contractKey)]) {
    assert(!src.includes(`'${t}'`) && !src.includes(`"${t}"`), `the module types the protocol token ${t} by hand`);
  }
  for (const k of [...CONFIG_SOURCE_KINDS, ...DEVICE_SOURCE_KINDS]) assert(!src.includes(`'${k}'`), `the module types the kind ${k} by hand`);
  assert(!/from 'fs'|@prisma\/client|child_process|process\.exit|##\s/.test(src), 'the module must stay pure (no fs, no database, no process exit, no heading pattern)');
  assert(/protocolRunsUndeclared\(/.test(src) && /assertNeverLane\(/.test(src), 'the consequence wording must ask the lane helpers');
});
test('R3 the gate report: the option is read only at a plan gate, its lines go through the report\'s own marks, and no exit code depends on it', () => {
  const src = fs.readFileSync(path.join(__dirname, 'gate-check.ts'), 'utf8');
  const i = src.indexOf('if (spec) {'); const j = src.indexOf('const deps = await tx.$queryRaw', i);
  assert(i > 0 && j > i, 'the --spec block was not found in planGate');
  const block = src.slice(i, j);
  assert(/compareSpecToContract\(/.test(block) && /for \(const ln of cmp\.lines\) line\(ln\.mark,/.test(block), 'the comparison must print through line()');
  assert(!/process\.exit|throw /.test(block), 'the comparison must never stop the report');
  // every process.exit in the report is a usage or not-found exit (2) or the top-level crash handler (1) — none reads `fails`
  assert(!/process\.exit\(\s*fails/.test(src) && !/exit\([^)]*fails/.test(src), 'the report\'s exit code must not depend on a ✗');
  assert(/if \(spec && !specUsed\)/.test(src), 'a --spec given at a non-plan gate must be SAID, not silently ignored');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
