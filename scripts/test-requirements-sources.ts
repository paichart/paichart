/**
 * test:requirements-sources: the requirements SOURCES check (scripts/check-requirements-sources.ts), STEP 1 Phase A (2026-11-09).
 *
 * DERIVED, NOT COPIED: positive fixtures are built from the network-provisioning protocol's OWN template lines (the backticked
 * `<device>: ...` forms in its "Device sources" section), placeholders substituted, exactly as test-device-sources does, so a
 * protocol rewording reds this suite instead of drifting from it.
 * Corpus: the in-repo canary copy of held-network-window-p1-vlg ALWAYS; every published spec in the public repo
 * (PAICHART_PUBLIC_REPO or ~/paichart) when present, else SKIP BY NAME. A published spec that fails is a FINDING, never "fixed".
 * Pins: the check holds no kind name and no separator of its own (one parser, LL-CS-22); the Python publish pass calls it and
 * parses nothing; the skill states the two lane sentences the check reads.
 *
 * Run: npm run test:requirements-sources
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { checkSources, LANE_SENTENCES, SHIPPED_CONFIG_KEYS, type SourcesResult } from './check-requirements-sources';
import { DEVICE_SOURCE_KINDS, SOURCE_SEPARATOR } from '../lib/agents/harness/device-sources';
import { CONFIG_SOURCE_KINDS, CONFIG_SOURCE_KINDS_BY_PROTOCOL } from '../lib/agents/harness/config-sources';
import { CONFIG_SOURCE_LANES } from '../lib/agents/harness/held-bytes/variant';
import { canonicalProtocolName } from '../lib/agents/harness/program-protocol';
import { rowItemMapFromAnswers, type RowItemMap } from '../lib/agents/harness/requirements-clauses';

const { PROTOCOLS } = require('./seed-protocol-prompts') as { PROTOCOLS: Array<{ name: string; promptText: string }> };

let passed = 0; let failed = 0; let skipped = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}
function skip(name: string, why: string) { skipped++; console.log(`⏭  ${name} SKIPPED: ${why}`); }
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
const ROOT = path.join(__dirname, '..');
const rules = (r: SourcesResult) => r.errors.map((e) => e.rule).sort().join(',');
const show = (r: SourcesResult) => JSON.stringify(r.errors);

// ── fixtures from the protocol's own template lines ─────────────────────────────────────────────────────────────────────
const NET = PROTOCOLS.find((p) => p.name === 'network-provisioning-protocol')?.promptText ?? '';
const SECTION = (() => {
  const i = NET.indexOf('## Device sources — declared, never inferred');
  const j = NET.indexOf('\n## ', i + 1);
  if (i < 0 || j < 0) throw new Error('Device sources section not found in the network protocol');
  return NET.slice(i, j);
})();
const TEMPLATES = [...SECTION.matchAll(/`(<device>: [^`]+)`/g)].map((m) => m[1]);
const kindOf = (t: string) => /^<device>: ([a-z-]+)/.exec(t)?.[1] ?? '';
const fill = (tpl: string, dev: string, ref: string | null = null) => {
  const l = tpl.replace('<device>', dev).replace('<name | descriptor URL>', 'acme-device-svc')
    .replace('<owner>/<repo>/<path>', `acme-netops/fabric-configs/network/base/${dev}.cfg`);
  return ref === null ? l.replace(' [@ <branch|tag|commit>]', '') : l.replace('[@ <branch|tag|commit>]', `@ ${ref}`);
};
const tplOf = (k: string) => { const t = TEMPLATES.find((x) => kindOf(x) === k); if (!t) throw new Error(`no protocol template for ${k}`); return t; };
/** A change block using every kind the protocol prints (one device per kind; live-read stands alone). */
const CHANGE_LINES = ['sw-a1', 'sw-a2', 'sw-a3', 'sw-a4'].map((d, i) => fill(TEMPLATES[i], d, i === 0 ? 'release-2026.10' : null));
/** A value block: a Git-only device and a live-seen device. */
const VALUE_LINES = [fill(tplOf('git-file'), 'sw-a1'), fill(tplOf('live-read'), 'sw-a2')];

const HEADING = '## Device sources';
const fence = (lines: string[], heading = HEADING) => ['```', heading, ...lines, '```'].join('\n');
function leg(n: number, lane: 'change' | 'value' | null, lines: string[] | null, extra = ''): string {
  const parts = [`## Pipeline ${n} objective — Network (fabric ${n})`, '', '- Harvest the fabric read-only.'];
  if (lines) {
    parts.push(`- **Device sources** (row \`network-provisioning.sources\`, item ${n}).${lane ? ` ${LANE_SENTENCES[lane]}` : ''}`,
      '  The leg\'s task description carries this `## Device sources` block exactly:', '', fence(lines));
  }
  if (extra) parts.push(extra);
  return parts.join('\n') + '\n';
}
const SPEC_HEAD = '# Program\n\n## Design decisions\n\n| id | answer |\n|---|---|\n\n';
const spec = (...legs: string[]) => SPEC_HEAD + legs.join('\n') + '\n## Acceptance\n\nNode C checks.\n';
const item = (n: number, lines: string[], lead = 'Device sources for this leg:') =>
  `${n}. ${lead}\n   ${HEADING}\n${lines.map((l) => `   ${l}`).join('\n')}\n`;
const objective = (...items: string[]) => `Objective.\n\nDESIGN DECISIONS - DECLARED, NOT INFERRED.\n\n${items.join('')}\n`;

test('T0 the protocol prints one template per kind, and the fixtures use every one of them', () => {
  const kinds = TEMPLATES.map(kindOf).sort();
  assert(JSON.stringify(kinds) === JSON.stringify([...DEVICE_SOURCE_KINDS].sort()), `protocol kinds ${JSON.stringify(kinds)} vs parser ${JSON.stringify(DEVICE_SOURCE_KINDS)}`);
});

// ── positives ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test('P1 a generated two-lane spec built from every protocol template, with its owner items, is clean (S1-S4)', () => {
  const r = checkSources(spec(leg(1, 'value', VALUE_LINES), leg(2, 'change', CHANGE_LINES)),
    objective(item(1, VALUE_LINES), item(2, CHANGE_LINES)));
  assert(r.mode === 'generated', r.mode);
  assert(r.errors.length === 0, show(r));
  assert(r.blocks.map((b) => `${b.lane}/${b.laneSource}`).join(',') === 'value/sentence,change/sentence', JSON.stringify(r.blocks.map((b) => b.lane)));
  assert(r.items.length === 2 && r.items.every((i) => i.state === 'parsed'), JSON.stringify(r.items));
});
test('P2 order and the protocol\'s own decoration (list marker, backticks) do not matter: the platform reads the same declaration', () => {
  const decorated = [...CHANGE_LINES].reverse().map((l, i) => (i % 2 ? `- \`${l}\`` : `- ${l}`));
  const r = checkSources(spec(leg(1, 'change', decorated)), objective(item(1, CHANGE_LINES)));
  assert(r.errors.length === 0, show(r));
});
test('P3 two change legs sharing one block pass S4 (the firewall-a3 r3 shape)', () => {
  const r = checkSources(spec(leg(1, 'change', CHANGE_LINES), leg(3, 'change', CHANGE_LINES)), objective(item(1, CHANGE_LINES)));
  assert(r.errors.length === 0, show(r));
});
test('P4 a spec with no sources block at all is clean (non-network legs are not this check\'s)', () => {
  const r = checkSources(spec(leg(1, null, null)), objective('1. Approver: the network lead.\n'));
  assert(r.errors.length === 0 && r.blocks.length === 0 && r.items.length === 0, show(r));
});
test('P5 hand-written mode (no Design decisions): the lane is inferred from "changes nothing" and reported as inferred', () => {
  const hw = '# Program\n\n' + leg(1, null, VALUE_LINES, 'Publish the values. Changes nothing.') + leg(2, null, CHANGE_LINES);
  const r = checkSources(hw);
  assert(r.mode === 'hand-written' && r.errors.length === 0, show(r));
  assert(r.blocks.map((b) => `${b.lane}/${b.laneSource}`).join(',') === 'value/inferred,change/inferred', JSON.stringify(r.blocks));
  assert(r.notChecked[0].startsWith('S3'), 'S3 must be printed as not checked without --objective');
});

test('P6 the SKELETON\'s own Device sources slot, filled as its placeholders say, passes S1-S4 (template ↔ check, requirements-authoring >= 1.11.0)', () => {
  const tmpl = fs.readFileSync(path.join(__dirname, 'seed-data', 'requirements-skeleton.tmpl'), 'utf8');
  const i = tmpl.indexOf('### Device sources — a network leg only');
  if (i < 0) { skip('P6', 'the skeleton carries no Device sources slot (requirements-authoring < 1.11.0)'); return; }
  const j = tmpl.indexOf('\n## ', i);
  const slot = tmpl.slice(i, j);
  const fill = (lane: 'change' | 'value', lines: string[]) => slot
    .replace('{{LEG_TOKEN}}', 'network-provisioning').replace('{{N}}', lane === 'value' ? '1' : '2')
    .replace(/\{\{LANE SENTENCE[^}]*\}\}/, LANE_SENTENCES[lane])
    .replace(/\{\{THE OWNER'S BLOCK[^}]*\}\}/, [HEADING, ...lines].join('\n'));
  const p1 = fill('value', VALUE_LINES); const p2 = fill('change', CHANGE_LINES);
  assert(!p1.includes('{{') && !p2.includes('{{'), 'a placeholder of the slot was not filled - the slot shape changed');
  const draft = SPEC_HEAD + '## Pipeline 1 objective — Network (fabric)\n\n- Harvest.\n\n' + p1 + '\n## Pipeline 2 objective — Network (core)\n\n- Change.\n\n' + p2 + '\n## Acceptance\n';
  const r = checkSources(draft, objective(item(1, VALUE_LINES), item(2, CHANGE_LINES)));
  assert(r.errors.length === 0, show(r));
  assert(r.blocks.map((b) => `${b.lane}/${b.laneSource}`).join(',') === 'value/sentence,change/sentence', JSON.stringify(r.blocks));
});

// ── negatives: each must fail CLOSED with its rule ─────────────────────────────────────────────────────────────────────
test('N1 S2: an ASCII hyphen in place of the separator does not parse (the parser\'s problem is named)', () => {
  const bad = CHANGE_LINES.map((l, i) => (i === 0 ? l.replace(SOURCE_SEPARATOR, ' - ') : l));
  const r = checkSources(spec(leg(1, 'change', bad)), objective(item(1, CHANGE_LINES)));
  assert(rules(r) === 'S2,S3', show(r));
  assert(r.errors.some((e) => e.rule === 'S2' && e.message.includes('separator-invalid')), show(r));
});
test('N2 S3: a device the owner gave is dropped from the spec block', () => {
  const r = checkSources(spec(leg(1, 'change', CHANGE_LINES.slice(1))), objective(item(1, CHANGE_LINES)));
  assert(rules(r) === 'S3,S3', show(r));
});
test('N3 S3: a ref the owner gave is dropped (a partly carried line)', () => {
  const r = checkSources(spec(leg(1, 'change', [CHANGE_LINES[0].replace(' @ release-2026.10', ''), ...CHANGE_LINES.slice(1)])), objective(item(1, CHANGE_LINES)));
  assert(rules(r) === 'S3,S3', show(r));
});
test('N4 S3: a block the owner never gave', () => {
  const r = checkSources(spec(leg(1, 'change', CHANGE_LINES), leg(2, 'value', VALUE_LINES)), objective(item(1, CHANGE_LINES)));
  assert(rules(r) === 'S3', show(r));
});
test('N5 S3: an owner item whose block does not parse is refused before anything is compared', () => {
  const r = checkSources(spec(leg(1, 'change', CHANGE_LINES)), objective(item(1, [CHANGE_LINES[0].replace(SOURCE_SEPARATOR, ' -- ')])));
  assert(r.errors.some((e) => e.rule === 'S3' && e.message.includes('owner item 1')), show(r));
});
test('N6 S4: two change legs with different blocks (one key per lane; plan L1)', () => {
  const r = checkSources(spec(leg(1, 'change', CHANGE_LINES), leg(3, 'change', CHANGE_LINES.slice(0, 2))),
    objective(item(1, CHANGE_LINES), item(3, CHANGE_LINES.slice(0, 2))));
  assert(rules(r) === 'S4', show(r));
});
test('N7 S4: two value legs with different blocks (the value key is one key too)', () => {
  const r = checkSources(spec(leg(1, 'value', VALUE_LINES), leg(2, 'value', VALUE_LINES.slice(0, 1))),
    objective(item(1, VALUE_LINES), item(2, VALUE_LINES.slice(0, 1))));
  assert(rules(r) === 'S4', show(r));
});
test('N8 S1: a generated spec block with no lane sentence, and one with both', () => {
  const none = checkSources(spec(leg(1, null, CHANGE_LINES)), objective(item(1, CHANGE_LINES)));
  assert(rules(none) === 'S1', show(none));
  const both = checkSources(spec(leg(1, 'change', CHANGE_LINES, LANE_SENTENCES.value)), objective(item(1, CHANGE_LINES)));
  assert(rules(both) === 'S1', show(both));
});
test('N9 S1: two blocks in one leg section; a block outside a leg section; a heading outside a fence', () => {
  const two = checkSources(spec(leg(1, 'change', CHANGE_LINES, '\n' + fence(CHANGE_LINES))), objective(item(1, CHANGE_LINES)));
  assert(rules(two) === 'S1', show(two));
  const outside = checkSources(spec(leg(1, 'change', CHANGE_LINES)) + '\n## Notes\n\n' + LANE_SENTENCES.change + '\n\n' + fence(CHANGE_LINES) + '\n',
    objective(item(1, CHANGE_LINES)));
  assert(outside.errors.some((e) => e.rule === 'S1' && e.message.includes('outside a leg')), show(outside));
  const bare = checkSources(spec(leg(1, null, null, `${LANE_SENTENCES.change}\n\n${HEADING}\n${CHANGE_LINES.join('\n')}`)), objective(item(1, CHANGE_LINES)));
  assert(bare.errors.some((e) => e.rule === 'S1' && e.message.includes('outside a fence')), show(bare));
});
test('N10 S2: a block whose task-body copy and contract copy would differ (text after a blank line inside the fence)', () => {
  const r = checkSources(spec(leg(1, 'change', [...CHANGE_LINES, '', 'sw-a9: command-package'])), objective(item(1, CHANGE_LINES)));
  assert(r.errors.some((e) => e.rule === 'S2'), show(r));
});

// ── config sources (2026-11-16, kubernetes-gitops 1.19.0 prep): the same rules, read by config-sources.ts ──────────────────────
const CFG_HEADING = '## Config sources';
const CFG_LINES = [
  'sample-workloads: git-file — service github-service ; acme/k8s-configs/k8s/sample-workloads.yaml',
  'cluster: live-read — service https://raw.githubusercontent.com/acme/descriptors/main/k8s-readonly-descriptor.json',
];
const CFG_LINES_2 = [...CFG_LINES, 'trading-policy: git-file — service github-service ; acme/k8s-configs/k8s/trading-policy.yaml'];
function kLeg(n: number, lines: string[] | null, token = 'kubernetes-gitops', extra = ''): string {
  const parts = [`## Pipeline ${n} objective — Cluster ${n}`, '', `- Author the policy (row \`${token}.target\`).`];
  if (lines) parts.push(`The leg's task description carries this \`${CFG_HEADING}\` block exactly:`, '', fence(lines, CFG_HEADING));
  if (extra) parts.push(extra);
  return parts.join('\n') + '\n';
}
const cItem = (n: number, lines: string[]) => item(n, lines, 'Config sources for the cluster leg:').replace(HEADING, CFG_HEADING);
const cfg = (r: SourcesResult) => r.blocks.filter((b) => b.grammar === 'config');
/** The owner's ROW-ITEM-MAP keying config items on kubernetes-gitops, as the publish pass passes it (--answers). Since owner items are
 *  keyed on their token (TK section), an S3 run with two shipped config-sources protocols needs it; these fixtures carry it so each test
 *  keeps its own subject whether or not terraform-iac has shipped. */
const k8sMap = (...ns: number[]) => ({ rowItemMap: new Map(ns.map((n) => [n, new Set([`kubernetes-gitops.item-${n}`])])) as Map<number, Set<string>> });

test('PC1 a kubernetes-gitops leg with its config-sources block and owner item is clean; protocol and lane come from the table', () => {
  const r = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), k8sMap(2));
  assert(r.errors.length === 0, show(r));
  const b = cfg(r);
  assert(b.length === 1 && b[0].grammar === 'config' && b[0].protocol === 'kubernetes-gitops' && b[0].lane === 'change' && b[0].laneSource === 'table', JSON.stringify(r.blocks));
  assert(r.items.length === 1 && r.items[0].grammar === 'config' && r.items[0].state === 'parsed', JSON.stringify(r.items));
});
test('PC2 two kubernetes-gitops legs sharing ONE block pass S4; a network leg beside them keeps its own grammar', () => {
  const r = checkSources(spec(leg(1, 'change', CHANGE_LINES), kLeg(2, CFG_LINES_2), kLeg(3, CFG_LINES_2)),
    objective(item(1, CHANGE_LINES), cItem(2, CFG_LINES_2)), k8sMap(2));
  assert(r.errors.length === 0, show(r));
  assert(r.blocks.map((b) => b.grammar).join(',') === 'device,config,config', JSON.stringify(r.blocks));
});
test('NC1 S2: a config-sources line that does not parse (ASCII hyphen separator)', () => {
  const r = checkSources(spec(kLeg(2, [CFG_LINES[0].replace(SOURCE_SEPARATOR, ' - '), CFG_LINES[1]])), objective(cItem(2, CFG_LINES)), k8sMap(2));
  assert(rules(r) === 'S2,S3', show(r));
  assert(r.errors.some((e) => e.rule === 'S2' && e.message.includes('kubernetes-gitops')), show(r));
  assert(r.items[0].state === 'parsed', 'the owner item itself parses: the S3 is the unmatched item, not an unkeyed one');
});
test('NC2 S1: a config-sources heading outside a fence', () => {
  const r = checkSources(spec(kLeg(2, null, 'kubernetes-gitops', `${CFG_HEADING}\n${CFG_LINES.join('\n')}`)), objective(cItem(2, CFG_LINES)), k8sMap(2));
  assert(r.errors.some((e) => e.rule === 'S1' && e.message.includes('outside a fence')), show(r));
});
test('NC3 S4: two kubernetes-gitops legs with DIFFERENT blocks (one block per protocol token, owner 2026-11-15)', () => {
  const r = checkSources(spec(kLeg(2, CFG_LINES), kLeg(3, CFG_LINES_2)), objective(cItem(2, CFG_LINES), cItem(3, CFG_LINES_2)), k8sMap(2, 3));
  assert(rules(r) === 'S4', show(r));
});
test('NC4 S1: a config-sources block on an observability-config leg names that leg and declares nothing', () => {
  const r = checkSources(spec(kLeg(4, CFG_LINES, 'observability-config')));
  assert(rules(r) === 'S1' && r.errors[0].message.includes('observability-config') && cfg(r).length === 0, show(r));
});
test('NC5 S1: a device-sources block and a config-sources block in one leg section', () => {
  const r = checkSources(spec(kLeg(2, CFG_LINES, 'kubernetes-gitops', `${LANE_SENTENCES.change}\n\n${fence(CHANGE_LINES)}`)));
  assert(r.errors.some((e) => e.rule === 'S1' && e.message.includes('one grammar')), show(r));
});
test('NC6 S3: a config file the owner gave is dropped from the spec block', () => {
  const r = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES_2)), k8sMap(2));
  assert(rules(r) === 'S3,S3', show(r));
  assert(r.items[0].state === 'parsed', 'the S3s are the dropped file both ways, not an unkeyed item');
});

// ── owner items keyed on their TOKEN (2026-11-17, STEPS-2-4-PLAN §3b item 6; record STEP4-REQ-CHECK-TOKEN-KEYING.md) ──────────
// terraform-iac is injected as if its text had shipped (the check's `configKeys` option; lib/ is untouched). It shares the k8s kinds,
// so an owner item's TEXT cannot say which protocol it is: only the owner's ROW-ITEM-MAP (answers.md) can.
const TF_KEYS = [...new Set([...SHIPPED_CONFIG_KEYS, 'terraform-iac'])]; // the same set before and after terraform-iac ships
const rmap = (o: Record<number, string[]>): RowItemMap => new Map(Object.entries(o).map(([k, v]) => [Number(k), new Set(v)]));
const TF_LINES = [
  'network-stack: git-file — service github-service ; acme/tf-configs/terraform/main.tf',
  'workspace: live-read — service https://raw.githubusercontent.com/acme/descriptors/main/terraform-readonly-descriptor.json',
];
const tLeg = (n: number, lines: string[] | null, extra = '') => kLeg(n, lines, 'terraform-iac', extra);
const K8S = (n: number) => `kubernetes-gitops.item-${n}`;
const TFR = (n: number) => `terraform-iac.item-${n}`;
const msgs = (r: SourcesResult) => r.errors.map((e) => e.message).join(' | ');

test('TK0 the injection is meaningful: terraform-iac is a Config-sources row with the SAME kinds as kubernetes-gitops (shipped or not)', () => {
  const tf = Object.values(CONFIG_SOURCE_LANES).find((v) => v.contractKey === 'terraform-iac');
  assert(tf, 'no terraform-iac row in CONFIG_SOURCE_LANES - the TK tests prove nothing without it');
  assert(SHIPPED_CONFIG_KEYS.includes('kubernetes-gitops'), JSON.stringify(SHIPPED_CONFIG_KEYS));
  const kinds = (p: string) => JSON.stringify([...(CONFIG_SOURCE_KINDS_BY_PROTOCOL[canonicalProtocolName(p)] ?? [])].sort());
  assert(kinds('terraform-iac') === kinds('kubernetes-gitops'), `${kinds('terraform-iac')} vs ${kinds('kubernetes-gitops')} (the ambiguity this keying removes needs equal kinds)`);
});
// The five tests that failed 5/33 with the tf row read (STEP4-BUILD.md §4), re-run with terraform-iac in the key set and the owner's map.
test('TK1 = PC1 with terraform-iac read: the k8s item keyed by its row resolves under kubernetes-gitops only; clean', () => {
  const r = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), { configKeys: TF_KEYS, rowItemMap: rmap({ 2: [K8S(2)] }) });
  assert(r.errors.length === 0, show(r));
  assert(cfg(r).length === 1 && cfg(r)[0].grammar === 'config' && (cfg(r)[0] as { protocol: string }).protocol === 'kubernetes-gitops', JSON.stringify(r.blocks));
  assert(r.items.length === 1 && r.items[0].state === 'parsed', JSON.stringify(r.items));
});
test('TK2 = PC2 with terraform-iac read: two k8s legs sharing one block beside a network leg; clean', () => {
  const r = checkSources(spec(leg(1, 'change', CHANGE_LINES), kLeg(2, CFG_LINES_2), kLeg(3, CFG_LINES_2)),
    objective(item(1, CHANGE_LINES), cItem(2, CFG_LINES_2)), { configKeys: TF_KEYS, rowItemMap: rmap({ 1: ['network-provisioning.sources'], 2: ['kubernetes-gitops.sources'] }) });
  assert(r.errors.length === 0, show(r));
  assert(r.blocks.map((b) => b.grammar).join(',') === 'device,config,config', JSON.stringify(r.blocks));
});
test('TK3 = NC1 with terraform-iac read: S2 on the unparseable line, S3 once (not once per key)', () => {
  const r = checkSources(spec(kLeg(2, [CFG_LINES[0].replace(SOURCE_SEPARATOR, ' - '), CFG_LINES[1]])), objective(cItem(2, CFG_LINES)),
    { configKeys: TF_KEYS, rowItemMap: rmap({ 2: [K8S(2)] }) });
  assert(rules(r) === 'S2,S3', show(r));
});
test('TK4 = NC3 with terraform-iac read: two k8s legs with different blocks is S4 only', () => {
  const r = checkSources(spec(kLeg(2, CFG_LINES), kLeg(3, CFG_LINES_2)), objective(cItem(2, CFG_LINES), cItem(3, CFG_LINES_2)),
    { configKeys: TF_KEYS, rowItemMap: rmap({ 2: [K8S(2)], 3: [K8S(3)] }) });
  assert(rules(r) === 'S4', show(r));
});
test('TK5 = NC6 with terraform-iac read: a dropped file is S3 both ways, once each', () => {
  const r = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES_2)), { configKeys: TF_KEYS, rowItemMap: rmap({ 2: [K8S(2)] }) });
  assert(rules(r) === 'S3,S3', show(r));
});
test('TK6 a k8s item and a tf item in one spec: each matched ONLY to its own leg\'s block, even when the two declarations are identical', () => {
  const r = checkSources(spec(kLeg(2, CFG_LINES), tLeg(3, TF_LINES)), objective(cItem(2, CFG_LINES), cItem(3, TF_LINES)),
    { configKeys: TF_KEYS, rowItemMap: rmap({ 2: ['kubernetes-gitops.sources'], 3: ['terraform-iac.sources'] }) });
  assert(r.errors.length === 0, show(r));
  assert(cfg(r).map((b) => (b as { protocol: string }).protocol).join(',') === 'kubernetes-gitops,terraform-iac', JSON.stringify(r.blocks));
  // identical text on both legs: two items, each keyed, each carried on its own leg - clean; drop the tf item and the tf block is named
  const same = { configKeys: TF_KEYS, rowItemMap: rmap({ 2: [K8S(2)], 3: [TFR(3)] }) };
  const r2 = checkSources(spec(kLeg(2, CFG_LINES), tLeg(3, CFG_LINES)), objective(cItem(2, CFG_LINES), cItem(3, CFG_LINES)), same);
  assert(r2.errors.length === 0, show(r2));
  const r3 = checkSources(spec(kLeg(2, CFG_LINES), tLeg(3, CFG_LINES)), objective(cItem(2, CFG_LINES)), same);
  assert(rules(r3) === 'S3' && /terraform-iac config-sources block .* carries owner item 2, which is a kubernetes-gitops item/.test(msgs(r3)), show(r3));
});
test('TK7 a tf owner item carried under a k8s leg is a NAMED error both ways (never silently accepted because the text matches)', () => {
  const r = checkSources(spec(kLeg(2, TF_LINES)), objective(cItem(2, TF_LINES)), { configKeys: TF_KEYS, rowItemMap: rmap({ 2: ['terraform-iac.sources'] }) });
  assert(rules(r) === 'S3,S3', show(r));
  assert(/owner item 2 is a terraform-iac item, but the block that declares it sits on a kubernetes-gitops leg/.test(msgs(r)), show(r));
  assert(/kubernetes-gitops config-sources block at line \d+ carries owner item 2, which is a terraform-iac item/.test(msgs(r)), show(r));
  // the mirror: a k8s item on a tf leg
  const m = checkSources(spec(tLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), { configKeys: TF_KEYS, rowItemMap: rmap({ 2: [K8S(2)] }) });
  assert(rules(m) === 'S3,S3' && /owner item 2 is a kubernetes-gitops item, but the block that declares it sits on a terraform-iac leg/.test(msgs(m)), show(m));
});
test('TK8 fail CLOSED: an item naming no config-sources token, naming two, or (two protocols read) with no map at all is a named S3 - never a guess', () => {
  const none = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), { configKeys: TF_KEYS, rowItemMap: rmap({ 2: ['network-provisioning.item-2'] }) });
  assert(none.errors.some((e) => e.rule === 'S3' && /owner item 2: .*name no config-sources token \(rows: network-provisioning\.item-2/.test(e.message)), show(none));
  assert(none.items.length === 1 && none.items[0].state === 'unkeyed', JSON.stringify(none.items));
  const unmapped = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), { configKeys: TF_KEYS, rowItemMap: rmap({}) });
  assert(unmapped.errors.some((e) => e.rule === 'S3' && /rows: none/.test(e.message)), show(unmapped));
  const two = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), { configKeys: TF_KEYS, rowItemMap: rmap({ 2: [K8S(2), TFR(2)] }) });
  assert(two.errors.some((e) => e.rule === 'S3' && /several config-sources tokens \(kubernetes-gitops, terraform-iac/.test(e.message)), show(two));
  const nomap = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), { configKeys: TF_KEYS });
  assert(nomap.errors.some((e) => e.rule === 'S3' && /no row-item map names its protocol .* 2 config-sources protocols .*\(--answers\)/.test(e.message)), show(nomap));
  // an unkeyed item is never matched, so the leg's block is also reported as carrying no owner item
  assert(rules(nomap) === 'S3,S3', show(nomap));
});
test('TK9 default keys: a given map is the ONLY source of the item\'s protocol; with ONE protocol read and no map, the pre-keying result is unchanged', () => {
  const ok = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), { rowItemMap: rmap({ 2: [K8S(2)] }) });
  assert(ok.errors.length === 0, show(ok));
  const wrong = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), { rowItemMap: rmap({ 2: ['network-provisioning.item-2'] }) });
  assert(wrong.errors.some((e) => e.rule === 'S3' && e.message.includes('name no config-sources token')), show(wrong));
  // one protocol pinned explicitly (the pre-1.17.0 key set), so this half holds whether or not terraform-iac has shipped
  const one = { configKeys: ['kubernetes-gitops'] };
  const plain = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), one);
  assert(plain.errors.length === 0 && plain.items[0].state === 'parsed', show(plain));
  const deflt = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)));
  assert(JSON.stringify(deflt) === JSON.stringify(checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), {})), 'an empty options object changed the result');
  const dup = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), { configKeys: ['kubernetes-gitops', 'kubernetes-gitops'] });
  assert(JSON.stringify(dup) === JSON.stringify(plain), 'a key listed twice must read as listed once (the set is de-duplicated)');
});
test('TK10 the leg rule with terraform-iac read: a section naming both config-sources tokens is an S1 ambiguity (unchanged rule, fail closed)', () => {
  const r = checkSources(spec(kLeg(2, CFG_LINES, 'kubernetes-gitops', 'The terraform-iac leg runs after this one.')), null, { configKeys: TF_KEYS });
  assert(rules(r) === 'S1' && /several config-sources protocols \(kubernetes-gitops, terraform-iac\)/.test(msgs(r)), show(r));
});
test('TK13 the DEFAULT key set with two shipped config-sources protocols: an owner item checked without the owner\'s map is a named S3', () => {
  if (SHIPPED_CONFIG_KEYS.length < 2) { console.log('  · TK13 not applicable: one config-sources protocol shipped (TK8 proves the same with an injected set)'); return; }
  const r = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)));
  assert(r.errors.some((e) => e.rule === 'S3' && /no row-item map names its protocol .*\(--answers\)/.test(e.message)), show(r));
  assert(r.items.length === 1 && r.items[0].state === 'unkeyed', JSON.stringify(r.items));
  const keyed = checkSources(spec(kLeg(2, CFG_LINES)), objective(cItem(2, CFG_LINES)), k8sMap(2));
  assert(keyed.errors.length === 0, show(keyed));
});
const ANSWERS = (rows: Array<[string, number]>) => `# Answers\n\n## Row → item map\n\n<!-- ROW-ITEM-MAP -->\n| row id | item |\n|---|---|\n${rows.map(([r, n]) => `| \`${r}\` | ${n} |`).join('\n')}\n`;
test('TK11 the owner\'s answers.md is read by the SHARED map parser (rowItemMapFromAnswers), "(added …)" notes included', () => {
  const m = rowItemMapFromAnswers(ANSWERS([['approver.program-plan', 1], ['kubernetes-gitops.item-2', 2]])
    + '| `terraform-iac.sources` (added 2026-11-17: the tf leg) | 3 |\n');
  assert(JSON.stringify([...(m.get(3) ?? [])]) === '["terraform-iac.sources"]', JSON.stringify([...m.entries()].map(([k, v]) => [k, [...v]])));
  const r = checkSources(spec(kLeg(2, CFG_LINES), tLeg(3, TF_LINES)), objective(cItem(2, CFG_LINES), cItem(3, TF_LINES)), { configKeys: TF_KEYS, rowItemMap: m });
  assert(r.errors.length === 0, show(r) + JSON.stringify([...m.entries()].map(([k, v]) => [k, [...v]])));
});
test('TK12 the CLI reads --answers: a k8s item mapped to its row exits 0; mapped to a network row only exits 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-sources-tk-'));
  try {
    const d = path.join(dir, 'r.md'); const o = path.join(dir, 'o.txt'); const good = path.join(dir, 'a1.md'); const bad = path.join(dir, 'a2.md');
    fs.writeFileSync(d, spec(kLeg(2, CFG_LINES))); fs.writeFileSync(o, objective(cItem(2, CFG_LINES)));
    fs.writeFileSync(good, ANSWERS([['kubernetes-gitops.item-2', 2]])); fs.writeFileSync(bad, ANSWERS([['network-provisioning.item-2', 2]]));
    const cli = (a: string) => { try { execFileSync(path.join(ROOT, 'node_modules/.bin/ts-node'), ['-r', 'tsconfig-paths/register', path.join(__dirname, 'check-requirements-sources.ts'), '--draft', d, '--objective', o, '--answers', a], { cwd: ROOT, stdio: 'pipe' }); return 0; } catch (e) { return (e as { status: number }).status; } };
    assert(cli(good) === 0, 'a correctly keyed item did not exit 0');
    assert(cli(bad) === 1, 'an item keyed to no config-sources token did not exit 1');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── corpus ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const CANARY = path.join(ROOT, 'cline_docs/reviews/value-leg-git-2026-11-06/canary-spec/held-network-window-p1-vlg/requirements.md');
// cline_docs/ is private: the public export carries no copy of this spec (public-allowlist.rules), so C1 skips BY NAME there.
if (!fs.existsSync(CANARY)) skip('C1 the in-repo canary copy', `not present at ${CANARY} (cline_docs/ is not exported)`);
else test('C1 the in-repo canary copy of held-network-window-p1-vlg passes: a value lane and a change lane, both parsed', () => {
  const r = checkSources(fs.readFileSync(CANARY, 'utf8'));
  assert(r.errors.length === 0, show(r));
  assert(r.blocks.map((b) => b.lane).join(',') === 'value,change', JSON.stringify(r.blocks.map((b) => b.lane)));
});
const PUBLIC = process.env.PAICHART_PUBLIC_REPO || path.join(os.homedir(), 'paichart');
const ART = path.join(PUBLIC, 'program-artifacts');
if (!fs.existsSync(ART)) skip('C2 every published spec', `no public repo at ${PUBLIC}`);
else {
  const expect: Record<string, string> = {
    'firewall-a3-partner-path-r3': 'change,change', 'held-network-window-p1': 'change', 'held-network-window-p1-vlg': 'value,change',
    // 2026-11-11: published 11-10 (hand-written; value lane git-file ceos1+ceos2; change lane ceos2 git-file + device-read, ceos1 live-read)
    'lab-exporter-loopback-ceos2': 'value,change',
  };
  test('C2 the hand-written specs carry the expected lanes, and every published spec passes S1-S4 (a failure is a FINDING)', () => {
    const fails: string[] = [];
    for (const d of fs.readdirSync(ART).sort()) {
      const f = path.join(ART, d, 'requirements.md');
      if (!fs.existsSync(f)) continue;
      const r = checkSources(fs.readFileSync(f, 'utf8'));
      if (r.errors.length) fails.push(`${d}: ${show(r)}`);
      if (expect[d] !== undefined && r.blocks.map((b) => b.lane).join(',') !== expect[d]) fails.push(`${d}: lanes ${r.blocks.map((b) => b.lane).join(',')} ≠ ${expect[d]}`);
      if (expect[d] === undefined && r.blocks.length) fails.push(`${d}: an unexpected sources block (add it to the expected corpus after reading it)`);
    }
    for (const d of Object.keys(expect)) if (!fs.existsSync(path.join(ART, d, 'requirements.md'))) fails.push(`${d}: missing`);
    assert(fails.length === 0, fails.join('\n   '));
  });
}

// ── pins ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const CHECK_SRC = fs.readFileSync(path.join(__dirname, 'check-requirements-sources.ts'), 'utf8');
test('PIN1 one parser: the check imports device-sources.ts and holds no kind name and no separator character of its own', () => {
  assert(/from '\.\.\/lib\/agents\/harness\/device-sources'/.test(CHECK_SRC), 'the shipping parser import is gone');
  for (const k of DEVICE_SOURCE_KINDS) assert(!CHECK_SRC.includes(k), `the check names the kind "${k}" itself`);
  assert(!CHECK_SRC.includes(SOURCE_SEPARATOR.trim()), 'the check carries the separator character itself');
  assert(!/Device sources/.test(CHECK_SRC.replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '')), 'the check spells the heading itself (outside comments)');
});
test('PIN5 one parser for config sources too: the check imports config-sources.ts and spells no config heading or kind itself', () => {
  assert(/from '\.\.\/lib\/agents\/harness\/config-sources'/.test(CHECK_SRC), 'the config-sources parser import is gone');
  const code = CHECK_SRC.replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '');
  assert(!/Config sources/.test(code), 'the check spells the config heading itself (outside comments)');
  for (const k of CONFIG_SOURCE_KINDS) assert(!code.includes(`'${k}'`) && !code.includes(` ${k} `), `the check names the config kind "${k}" itself`);
});
// A live generated network+k8s spec (private configs checkout): its one config-sources block must read clean.
const LIVE_R2 = path.join(os.homedir(), 'paichart-configs/usecases/telemetry-export-held-r2/requirements.program.md');
if (!fs.existsSync(LIVE_R2)) skip('C3 the telemetry-export-held-r2 spec', `not present at ${LIVE_R2}`);
else test('C3 the telemetry-export-held-r2 spec: one kubernetes-gitops config-sources block, clean', () => {
  const r = checkSources(fs.readFileSync(LIVE_R2, 'utf8'));
  assert(r.errors.length === 0 && cfg(r).length === 1 && r.blocks.length === 1, show(r) + JSON.stringify(r.blocks));
});
const PY = fs.readFileSync(path.join(__dirname, 'publish-generated-spec.py'), 'utf8');
test('PIN2 the Python publish pass calls the check and parses no block itself', () => {
  assert(PY.includes("'check-requirements-sources.ts'"), 'publish-generated-spec.py no longer calls the sources check');
  assert(!PY.includes(SOURCE_SEPARATOR.trim() + ' service') && !DEVICE_SOURCE_KINDS.some((k) => PY.includes(`'${k}'`)), 'publish-generated-spec.py parses sources itself');
});
test('PIN6 the Python publish pass hands the owner\'s answers to the sources check (owner items keyed on their token, §3b item 6)', () => {
  assert(/'check-requirements-sources\.ts'\),[^\n]*'--answers', a\.answers/.test(PY), 'publish-generated-spec.py calls the sources check without --answers: config-sources owner items would not be keyed on their token');
});
// The skill's operative files are not exported (owner 2026-11-13). In the PRIVATE repo (it has cline_docs/) SKILL.md must exist
// and this pin runs; in the public tree it is absent by design and the pin is skipped out loud — never skipped silently in private.
const SKILL_PATH = path.join(ROOT, '.claude/skills/requirements-spec/SKILL.md');
const PRIVATE_REPO = fs.existsSync(path.join(ROOT, 'cline_docs'));
if (fs.existsSync(SKILL_PATH) || PRIVATE_REPO) {
  const SKILL = fs.readFileSync(SKILL_PATH, 'utf8');
  test('PIN3 the skill states both lane sentences exactly as the check reads them', () => {
    for (const s of Object.values(LANE_SENTENCES)) assert(SKILL.includes(s), `SKILL.md lacks "${s}"`);
  });
} else {
  console.log('  · PIN3 skipped: the requirements-spec skill is not part of the public export');
}
test('PIN4 the CLI exits 1 on an ERROR and 0 when clean (the publish pass keys on the exit code)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-sources-'));
  try {
    const good = path.join(dir, 'good.md'); const bad = path.join(dir, 'bad.md'); const obj = path.join(dir, 'obj.txt');
    fs.writeFileSync(good, spec(leg(1, 'change', CHANGE_LINES))); fs.writeFileSync(bad, spec(leg(1, 'change', CHANGE_LINES.slice(1))));
    fs.writeFileSync(obj, objective(item(1, CHANGE_LINES)));
    const cli = (d: string) => { try { execFileSync(path.join(ROOT, 'node_modules/.bin/ts-node'), ['-r', 'tsconfig-paths/register', path.join(__dirname, 'check-requirements-sources.ts'), '--draft', d, '--objective', obj], { cwd: ROOT, stdio: 'pipe' }); return 0; } catch (e) { return (e as { status: number }).status; } };
    assert(cli(good) === 0, 'clean spec did not exit 0');
    assert(cli(bad) === 1, 'spec with a dropped device did not exit 1');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
