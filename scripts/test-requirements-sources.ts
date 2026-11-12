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
import { checkSources, LANE_SENTENCES, type SourcesResult } from './check-requirements-sources';
import { DEVICE_SOURCE_KINDS, SOURCE_SEPARATOR } from '../lib/agents/harness/device-sources';

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
const PY = fs.readFileSync(path.join(__dirname, 'publish-generated-spec.py'), 'utf8');
test('PIN2 the Python publish pass calls the check and parses no block itself', () => {
  assert(PY.includes("'check-requirements-sources.ts'"), 'publish-generated-spec.py no longer calls the sources check');
  assert(!PY.includes(SOURCE_SEPARATOR.trim() + ' service') && !DEVICE_SOURCE_KINDS.some((k) => PY.includes(`'${k}'`)), 'publish-generated-spec.py parses sources itself');
});
const SKILL = fs.readFileSync(path.join(ROOT, '.claude/skills/requirements-spec/SKILL.md'), 'utf8');
test('PIN3 the skill states both lane sentences exactly as the check reads them', () => {
  for (const s of Object.values(LANE_SENTENCES)) assert(SKILL.includes(s), `SKILL.md lacks "${s}"`);
});
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
