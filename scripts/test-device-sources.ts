/**
 * held-network step 3 batch 2b (P3 / S3-A) — the ONE strict Device sources grammar (lib/agents/harness/device-sources.ts).
 *
 * DERIVED, NOT COPIED: the positive fixtures are built from the network-provisioning protocol's OWN template lines (the backticked
 * `<device>: …` forms in its "Device sources — declared, never inferred" section, and the operator HOWTO's mirror), with each
 * placeholder substituted. A protocol that rewords a template, adds a slot or drops a kind reds this suite instead of drifting.
 * The negatives are single-token mutations of a valid line — each must fail CLOSED with its named problem, never be "understood".
 * Corpus: every `## Device sources` block in the stored lab briefs (scripts/leg-replay-lab/inputs) must parse.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-device-sources.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  parseDeviceSourceLine, parseDeviceSourceLines, parseDeviceSourcesBlock, parseDeviceSourcesContractValue, resolveLegDeviceSources, contractDeviceSourcesValue,
  DEVICE_SOURCES_CONTRACT_KEY, SOURCE_SEPARATOR,
  buildDeviceSourcesSnapshot, readDeviceSourcesSnapshot, sameDeclaration, DEVICE_SOURCES_SNAPSHOT_KEY,
} from '../lib/agents/harness/device-sources';
import { governingDeviceSources } from '../lib/agents/harness/device-sources-read';
const eq = (a: unknown, b: unknown, what = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PROTOCOLS } = require('./seed-protocol-prompts') as { PROTOCOLS: Array<{ name: string; promptText: string }> };

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const text = (n: string) => { const p = PROTOCOLS.find((x) => x.name === n); if (!p) throw new Error(`protocol ${n} missing`); return p.promptText; };
const NET = text('network-provisioning-protocol');
const SECTION = (() => {
  const i = NET.indexOf('## Device sources — declared, never inferred');
  const j = NET.indexOf('\n## ', i + 1);
  if (i < 0 || j < 0) throw new Error('Device sources section not found in the network protocol');
  return NET.slice(i, j);
})();
/** Every backticked `<device>: …` template the given text prints. */
const templates = (t: string) => [...t.matchAll(/`(<device>: [^`]+)`/g)].map((m) => m[1]);
const PROTOCOL_TEMPLATES = templates(SECTION);
const HOWTO = PROTOCOLS.find((p) => p.name === 'HOWTO-use-pipeline-harness')?.promptText ?? '';
const HOWTO_TEMPLATES = templates(HOWTO);

/** The placeholders this suite knows how to fill. A template carrying any other `<…>` slot reds T1 (a new slot = a grammar change). */
const KNOWN_SLOTS = new Set(['<device>', '<name | descriptor URL>', '<owner>/<repo>/<path>', '<branch|tag|commit>']);
function instances(tpl: string): Array<{ line: string; service: string; ref: string | null }> {
  const out: Array<{ line: string; service: string; ref: string | null }> = [];
  for (const service of ['acme-device-svc', 'https://example.invalid/descriptors/acme-device.json']) {
    const refs: Array<string | null> = tpl.includes('[@ <branch|tag|commit>]') ? [null, 'release-2026.10'] : [null];
    for (const ref of refs) {
      let l = tpl.replace('<device>', 'sw-a1').replace('<name | descriptor URL>', service).replace('<owner>/<repo>/<path>', 'acme-netops/fabric-configs/network/base/sw-a1.cfg');
      l = ref === null ? l.replace(' [@ <branch|tag|commit>]', '') : l.replace('[@ <branch|tag|commit>]', `@ ${ref}`);
      out.push({ line: l, service, ref });
    }
  }
  return out;
}

test('T1 the protocol prints exactly four templates, one per kind (network 1.26.0 adds `live-read`), and every slot is one this suite fills', () => {
  assert(PROTOCOL_TEMPLATES.length === 4, `templates: ${JSON.stringify(PROTOCOL_TEMPLATES)}`);
  const kinds = PROTOCOL_TEMPLATES.map((t) => /^<device>: ([a-z-]+)/.exec(t)?.[1]).sort();
  assert(JSON.stringify(kinds) === JSON.stringify(['command-package', 'device-read', 'git-file', 'live-read']), JSON.stringify(kinds));
  for (const t of [...PROTOCOL_TEMPLATES, ...HOWTO_TEMPLATES]) {
    const slots = [...t.matchAll(/<[^<>]+>(?:\/<[^<>]+>\/<[^<>]+>)?/g)].map((m) => m[0]);
    for (const s of slots) assert(KNOWN_SLOTS.has(s), `unknown slot ${s} in ${t}`);
  }
  assert(PROTOCOL_TEMPLATES.every((t) => t.includes(SOURCE_SEPARATOR) || t.endsWith('command-package')), 'the em-dash separator is the protocol\'s own');
});

test('T2 every instance of every PROTOCOL template parses, as itself, with or without the list marker / backticks the protocol uses', () => {
  for (const tpl of PROTOCOL_TEMPLATES) {
    for (const { line, service, ref } of instances(tpl)) {
      for (const shown of [line, `- ${line}`, `\`${line}\``, `- \`${line}\``]) {
        const p = parseDeviceSourceLine(shown);
        assert(p.ok, `${shown} → ${JSON.stringify(p)}`);
        assert(p.line.device === 'sw-a1', JSON.stringify(p.line));
        if (p.line.kind !== 'command-package') assert(p.line.service === service, JSON.stringify(p.line));
        if (p.line.kind === 'git-file') {
          assert(p.line.owner === 'acme-netops' && p.line.repo === 'fabric-configs' && p.line.path === 'network/base/sw-a1.cfg' && p.line.ref === ref, JSON.stringify(p.line));
        }
      }
    }
  }
});

test('T3 the operator HOWTO mirror prints the same grammar (every one of its templates parses once filled)', () => {
  assert(HOWTO_TEMPLATES.length >= 3, `HOWTO templates: ${HOWTO_TEMPLATES.length}`);
  for (const tpl of HOWTO_TEMPLATES) for (const { line } of instances(tpl)) assert(parseDeviceSourceLine(line).ok, `${tpl} → ${line}`);
});

test('T4 single-token mutations FAIL CLOSED with a named problem (never inferred)', () => {
  const ok = 'sw-a1: device-read — service acme-device-svc';
  const git = 'sw-a1: git-file — service acme-git ; acme/configs/net/sw-a1.cfg @ main';
  const cases: Array<[string, string]> = [
    [ok.replace(' — ', ' - '), 'separator-invalid'],            // ASCII hyphen is not the em dash
    [ok.replace(' — ', ' – '), 'separator-invalid'],            // nor the en dash
    [ok.replace('service ', ''), 'separator-invalid'],
    [ok.replace(': ', ':'), 'not-a-source-line'],
    [ok.replace('device-read', 'device-file'), 'unknown-kind'],
    [ok.replace('device-read', 'Device-Read'), 'not-a-source-line'],
    ['sw-a1: command-package — service x', 'trailing-text'],
    [ok.replace('sw-a1', 'sw a1'), 'not-a-source-line'],
    [ok.replace('acme-device-svc', ''), 'separator-invalid'],
    [ok.replace('acme-device-svc', 'a;b'), 'service-invalid'],
    [git.replace(' ; ', ' ;'), 'git-coordinates-invalid'],
    [git.replace('acme/configs/net/sw-a1.cfg', 'acme/configs'), 'git-coordinates-invalid'],
    [git.replace('net/sw-a1.cfg', 'net/../sw-a1.cfg'), 'git-coordinates-invalid'],
    [git.replace('net/sw-a1.cfg', 'net/sw a1.cfg'), 'git-coordinates-invalid'],
    [git.replace('@ main', '@ main @ dev'), 'ref-invalid'],
    [git.replace('@ main', '@ '), 'git-coordinates-invalid'], // a trailing '@' with no ref (the line is trimmed first)
    [git.replace('@ main', '@ -x'), 'ref-invalid'],
  ];
  for (const [l, problem] of cases) {
    const p = parseDeviceSourceLine(l);
    assert(!p.ok && p.problem === problem, `${l} → ${JSON.stringify(p)} (expected ${problem})`);
  }
});

test('T5 block: heading, lines, end at blank/heading; a prose line inside the run ⇒ the WHOLE block unparseable; two blocks ⇒ unparseable', () => {
  const body = '# Leg\n\nSome intro.\n\n## Device sources\n- sw1: device-read — service svc\n- sw2: command-package\n\nUsing ONLY read-only tools, harvest…\n';
  const p = parseDeviceSourcesBlock(body);
  assert(p.state === 'parsed' && p.entries.length === 2, JSON.stringify(p));
  const nextHeading = '## Device sources\n- sw1: device-read — service svc\n## Objective\nx';
  assert(parseDeviceSourcesBlock(nextHeading).state === 'parsed', 'a heading ends the block');
  const prose = '## Device sources\n- sw1: device-read — service svc\nRead each device once.\n';
  const q = parseDeviceSourcesBlock(prose);
  assert(q.state === 'unparseable' && q.problem === 'not-a-source-line' && q.lineIndex === 1, JSON.stringify(q));
  const two = '## Device sources\n- sw1: command-package\n\n## Device sources\n- sw2: command-package\n';
  assert(parseDeviceSourcesBlock(two).state === 'unparseable', 'two blocks');
  const empty = '## Device sources\n\n## Next\n';
  const e = parseDeviceSourcesBlock(empty);
  assert(e.state === 'unparseable' && e.problem === 'empty-block', JSON.stringify(e));
  assert(parseDeviceSourcesBlock('no block here').state === 'absent', 'absent');
  assert(parseDeviceSourcesBlock(null).state === 'absent', 'null body');
});

test('T6 per-device rules: command-package stands alone; one source per kind; git-file + device-read on one device is allowed', () => {
  const both = parseDeviceSourceLinesFrom(['sw1: git-file — service g ; o/r/p.cfg', 'sw1: device-read — service d']);
  assert(both.state === 'parsed' && both.entries.length === 2, JSON.stringify(both));
  const alone = parseDeviceSourceLinesFrom(['sw1: command-package', 'sw1: device-read — service d']);
  assert(alone.state === 'unparseable' && alone.problem === 'command-package-not-alone', JSON.stringify(alone));
  const dup = parseDeviceSourceLinesFrom(['sw1: device-read — service d', 'sw1: device-read — service e']);
  assert(dup.state === 'unparseable' && dup.problem === 'duplicate-source', JSON.stringify(dup));
});
function parseDeviceSourceLinesFrom(lines: string[]) { return parseDeviceSourcesContractValue(lines); }

test('T7 leg resolution: contract wins when the body has none; equal ⇒ contract; different ⇒ conflict; body alone ⇒ body; neither ⇒ absent', () => {
  const lines = ['sw1: device-read — service d', 'sw2: command-package'];
  const bodyEq = '## Device sources\n- sw2: command-package\n- sw1: device-read — service d\n';
  const bodyNe = '## Device sources\n- sw1: device-read — service other\n';
  const c = { deviceSources: { [DEVICE_SOURCES_CONTRACT_KEY]: lines } };
  assert(resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(c), taskBody: 'x' }).state === 'parsed', 'contract only');
  const eq = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(c), taskBody: bodyEq });
  assert(eq.state === 'parsed' && eq.source === 'contract', `order-insensitive equality: ${JSON.stringify(eq)}`);
  assert(resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(c), taskBody: bodyNe }).state === 'conflict', 'different ⇒ conflict');
  assert(resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(c), taskBody: '## Device sources\nnot a line\n' }).state === 'conflict', 'unparseable body beside a contract ⇒ conflict');
  const b = resolveLegDeviceSources({ contractValue: undefined, taskBody: bodyEq });
  assert(b.state === 'parsed' && b.source === 'task-body', JSON.stringify(b));
  assert(resolveLegDeviceSources({ contractValue: undefined, taskBody: 'nothing' }).state === 'absent', 'absent');
  // the contract as one multi-line string is the same declaration
  const s = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue({ deviceSources: { [DEVICE_SOURCES_CONTRACT_KEY]: lines.join('\n') } }), taskBody: null });
  assert(s.state === 'parsed' && s.entries.length === 2, JSON.stringify(s));
});

test('T8 contract shapes that are not lines fail closed (never read as a declaration of some leg)', () => {
  for (const contract of [{ deviceSources: lines() }, { deviceSources: 'sw1: command-package' }, { deviceSources: { [DEVICE_SOURCES_CONTRACT_KEY]: { sw1: 'device-read' } } },
    { deviceSources: { [DEVICE_SOURCES_CONTRACT_KEY]: [1, 2] } }]) {
    const r = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(contract), taskBody: null });
    assert(r.state === 'unparseable' && r.problem === 'contract-value-not-lines', `${JSON.stringify(contract)} → ${JSON.stringify(r)}`);
  }
  // another leg's key only ⇒ this leg's value is absent
  assert(resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue({ deviceSources: { 'terraform-iac': ['x'] } }), taskBody: null }).state === 'absent', 'other key');
});
function lines() { return ['sw1: command-package']; }

test('T9 CORPUS: every `## Device sources` block in the stored lab briefs parses (measured, not assumed)', () => {
  const root = path.join(__dirname, 'leg-replay-lab', 'inputs');
  const blocks: string[] = [];
  const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.json')) blocks.push(fs.readFileSync(p, 'utf8')); } };
  if (fs.existsSync(root)) walk(root);
  // The lab briefs are PRIVATE (allowlist: lab data stays internal, 2026-11-02). In the private source repo (recognised as export-public.py's
  // SOURCE GUARD does: cline_docs/ + CLAUDE.md) the corpus must be present; in the public export it is absent BY DESIGN — skip BY NAME.
  const isPrivateSource = fs.existsSync(path.join(__dirname, '..', 'cline_docs')) && fs.existsSync(path.join(__dirname, '..', 'CLAUDE.md'));
  if (!fs.existsSync(root) && !isPrivateSource) { console.log('   (public export: the lab brief corpus is internal by design — T9 skipped)'); return; }
  let seen = 0; const bad: string[] = [];
  for (const raw of blocks) {
    for (const m of raw.matchAll(/"((?:[^"\\]|\\.)*## Device sources\\n(?:[^"\\]|\\.)*)"/g)) {
      let s: string; try { s = JSON.parse(`"${m[1]}"`); } catch { continue; }
      if (!/^## Device sources\n- /m.test(s)) continue; // protocol prose that names the heading, not a block
      seen++;
      const p = parseDeviceSourcesBlock(s);
      if (p.state !== 'parsed') bad.push(`${JSON.stringify(p)} :: ${s.slice(s.indexOf('## Device sources'), s.indexOf('## Device sources') + 160)}`);
    }
  }
  console.log(`   corpus: ${seen} brief block(s) found, ${seen - bad.length} parsed`);
  assert(seen >= 10, `expected ≥ 10 lab brief blocks, found ${seen} (the corpus moved?)`);
  assert(bad.length === 0, bad.join('\n'));
});

test('T10 the contract value as the Program Architect writes it (measured on prod: the block copied WITH its heading) parses; a heading elsewhere does not', () => {
  const withHeading = '## Device sources\nsw1: git-file — service g ; o/r/p.cfg\nsw1: device-read — service https://example.invalid/d.json\nsw2: device-read — service https://example.invalid/d.json';
  const p = parseDeviceSourcesContractValue(withHeading);
  assert(p.state === 'parsed' && p.entries.length === 3, JSON.stringify(p));
  assert(parseDeviceSourcesContractValue(withHeading.split('\n')).state === 'parsed', 'array form with the heading as element 0');
  const mid = parseDeviceSourcesContractValue(['sw1: command-package', '## Device sources', 'sw2: command-package']);
  assert(mid.state === 'unparseable' && mid.problem === 'not-a-source-line', JSON.stringify(mid));
});

// ── push 2 (O-2, the J1 entry gate — sec-ops batch-2b SF-1): the immutable first-execution snapshot ──────────────────────
const SNAP_LINES = ['sw1: git-file — service g ; o/r/net/sw1.cfg', 'sw1: device-read — service devsvc', 'sw2: command-package'];
const SNAP_BODY = `## Objective\nchange things\n\n## Device sources\n${SNAP_LINES.map((l) => `- \`${l}\``).join('\n')}\n`;
const snapOf = (taskBody: string | null, contractValue: unknown = undefined) =>
  buildDeviceSourcesSnapshot(resolveLegDeviceSources({ contractValue, taskBody }), '2026-10-26T00:00:00.000Z');

test('S1 a snapshot round-trips through JSON (the jsonb column) and validates; it governs when the live text still declares the same', () => {
  const stored = JSON.parse(JSON.stringify(snapOf(SNAP_BODY)));
  const r = readDeviceSourcesSnapshot({ [DEVICE_SOURCES_SNAPSHOT_KEY]: stored });
  assert(r && r !== 'unreadable' && r.resolution.state === 'parsed' && r.resolution.entries.length === 3, JSON.stringify(r));
  const g = governingDeviceSources({ description: SNAP_BODY, contract: null, snapshot: stored });
  assert(g.state === 'parsed' && g.entries.length === 3, JSON.stringify(g));
  // a cosmetic edit elsewhere in the description, and the same lines reordered, still govern from the snapshot
  const reordered = `## Device sources\n${[...SNAP_LINES].reverse().join('\n')}\n\n## Notes\nedited later`;
  assert(governingDeviceSources({ description: reordered, contract: null, snapshot: stored }).state === 'parsed', 'reorder / outside edit');
});

test('S2 FAIL CLOSED, each by name: no snapshot ⇒ snapshot-absent; an invalid one ⇒ snapshot-unreadable; a re-declared live block ⇒ snapshot-changed', () => {
  const stored = JSON.parse(JSON.stringify(snapOf(SNAP_BODY)));
  eq(governingDeviceSources({ description: SNAP_BODY, contract: null, snapshot: null }).state, 'snapshot-absent');
  for (const bad of [{ ...stored, version: 2 }, { ...stored, takenAt: 1 }, 'x', [stored],
    { ...stored, resolution: { ...stored.resolution, grammarVersion: 9 } },
    { ...stored, resolution: { ...stored.resolution, entries: [{ device: 'sw1', kind: 'device-read', service: 'devsvc', extra: 1 }] } },
    { ...stored, resolution: { ...stored.resolution, entries: [{ device: '../x', kind: 'command-package' }] } },
    { ...stored, resolution: { ...stored.resolution, entries: [] } },
    { ...stored, resolution: { state: 'parsed', grammarVersion: 1, source: 'elsewhere', entries: stored.resolution.entries } }]) {
    eq(governingDeviceSources({ description: SNAP_BODY, contract: null, snapshot: bad }).state, 'snapshot-unreadable', `${JSON.stringify(bad).slice(0, 80)}: `);
  }
  // THE ATTACK (SF-1): the agent rewrites its leg's block after the first execution — a device re-pointed at another service
  const edited = SNAP_BODY.replace('device-read — service devsvc', 'device-read — service lookalike-svc');
  eq(governingDeviceSources({ description: edited, contract: null, snapshot: stored }).state, 'snapshot-changed');
  eq(governingDeviceSources({ description: SNAP_BODY.replace(/## Device sources[\s\S]*$/, ''), contract: null, snapshot: stored }).state, 'snapshot-changed', 'block deleted: ');
  eq(governingDeviceSources({ description: `${SNAP_BODY}- \`sw3: device-read — service devsvc\`\n`, contract: null, snapshot: stored }).state, 'snapshot-changed', 'device added: ');
});

test('S3 a contract-carried declaration snapshots the same way; a snapshot of an ABSENT block governs as absent (the leg declared none)', () => {
  const c = { deviceSources: { [DEVICE_SOURCES_CONTRACT_KEY]: SNAP_LINES } };
  const stored = JSON.parse(JSON.stringify(snapOf(null, contractDeviceSourcesValue(c))));
  const g = governingDeviceSources({ description: 'no block', contract: c, snapshot: stored });
  assert(g.state === 'parsed' && g.source === 'contract', JSON.stringify(g));
  const none = JSON.parse(JSON.stringify(snapOf('no block here')));
  eq(governingDeviceSources({ description: 'no block here', contract: null, snapshot: none }).state, 'absent');
  eq(governingDeviceSources({ description: SNAP_BODY, contract: null, snapshot: none }).state, 'snapshot-changed', 'a block ADDED after an absent snapshot: ');
});

test('S4 sameDeclaration: order-insensitive on entries, side-insensitive, state-sensitive', () => {
  const a = resolveLegDeviceSources({ contractValue: SNAP_LINES, taskBody: null });
  const b = resolveLegDeviceSources({ contractValue: undefined, taskBody: `## Device sources\n${[...SNAP_LINES].reverse().join('\n')}` });
  assert(sameDeclaration(a, b), 'same entries, other side, other order');
  assert(!sameDeclaration(a, resolveLegDeviceSources({ contractValue: undefined, taskBody: null })), 'parsed vs absent');
});

test('S5 the WRITER (source pins): the snapshot is written only in the first-execution branch, for a PIPELINE leg of a Device-sources protocol, in the SAME statement as the protocol stamp; the key is an audit fact', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/prepare-task-for-execution.ts'), 'utf8');
  const branch = src.slice(src.indexOf("if (contractCheck && !('protocol' in taskMeta)) {"), src.indexOf('} else if (contractCheck && typeof taskMeta.protocol'));
  assert(branch.includes("contractCheck.type === 'PIPELINE' && resolved.protocol && DEVICE_SOURCE_PROTOCOLS.includes(resolved.protocol)"), 'population');
  assert(/const stampJson = JSON\.stringify\(\{\s*protocol: resolved\.protocol,\s*protocolResolvedAt: resolvedAt,\s*\.\.\.\(snapshot \? \{ \[DEVICE_SOURCES_SNAPSHOT_KEY\]: snapshot \} : \{\}\),/.test(branch), 'one statement with the stamp');
  assert((src.match(/DEVICE_SOURCES_SNAPSHOT_KEY/g) ?? []).length === 2, 'the import + the one write: no other writer');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AUDIT_STRIP_KEYS, stripAuditFacts } = require('../lib/tasks/services/protected-task-metadata') as { AUDIT_STRIP_KEYS: readonly string[]; stripAuditFacts: (m: Record<string, unknown>) => void };
  assert(AUDIT_STRIP_KEYS.includes(DEVICE_SOURCES_SNAPSHOT_KEY), 'not an audit fact');
  const incoming: Record<string, unknown> = { [DEVICE_SOURCES_SNAPSHOT_KEY]: { forged: true }, other: 1 };
  stripAuditFacts(incoming);
  assert(!(DEVICE_SOURCES_SNAPSHOT_KEY in incoming) && incoming.other === 1, 'a forged snapshot survived the client strip');
  const rd = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/device-sources-read.ts'), 'utf8');
  assert(rd.includes("(metadata -> 'deviceSourcesSnapshot') AS snapshot") && rd.includes('return governingDeviceSources(rows[0], contractKeyForOwningLeg(owningLeg));'), 'the reader governs from the snapshot (VALUE-LEG-GIT: re-resolving the live text under the leg\'s OWN contract key)');
});

// ── Config-sources network step, Phase A (DESIGN v2 §1.2, §3.1; execution-facts B2/S8; audit F15) — grammar v2 `live-read` ─────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DS = require('../lib/agents/harness/device-sources') as typeof import('../lib/agents/harness/device-sources');
const LR = 'ceos2: live-read — service ceos-lab-readonly';
const withGate = <T>(on: boolean | null, fn: () => T): T => { DS.__setLiveReadKindForLab(on); try { return fn(); } finally { DS.__setLiveReadKindForLab(null); } };

test('LR1 the KIND GATE opens with network 1.26.0 (this tree); the lab lever closed (base arm) reads `live-read` as unknown-kind exactly as before', () => {
  assert(DS.LIVE_READ_KIND_ENABLED === true && DS.liveReadKindEnabled() === true, 'the gate must be OPEN in a tree whose network text carries the kind line (1.26.0)');
  const open = parseDeviceSourceLine(LR); assert(open.ok && open.line.kind === 'live-read', JSON.stringify(open));
  withGate(false, () => { const r = parseDeviceSourceLine(LR); assert(!r.ok && r.problem === 'unknown-kind', JSON.stringify(r)); });
});
test('LR2 gate open (lab lever): `live-read` parses as an evidence line with its service; it stands ALONE on a device', () => withGate(true, () => {
  const r = parseDeviceSourceLine(LR); assert(r.ok && r.line.kind === 'live-read' && (r.line as { service: string }).service === 'ceos-lab-readonly', JSON.stringify(r));
  const alone = parseDeviceSourceLines([`ceos1: device-read — service ceos-lab-readonly`, LR]); assert(alone.state === 'parsed', JSON.stringify(alone));
  for (const other of ['ceos2: device-read — service ceos-lab-readonly', 'ceos2: git-file — service github-service ; o/r/ceos2.cfg', 'ceos2: command-package']) {
    const b = parseDeviceSourceLines([LR, other]); assert(b.state === 'unparseable' && b.problem === (other.endsWith('command-package') ? 'command-package-not-alone' : 'live-read-not-alone'), `${other}: ${JSON.stringify(b)}`);
  }
}));
test('LR3 VERSION RULE (execution-facts S8): a block of v1 kinds resolves v1 even with the gate open; a block using `live-read` resolves v2; every NON-parsed state stays v1', () => withGate(true, () => {
  const v1 = resolveLegDeviceSources({ contractValue: undefined, taskBody: '## Device sources\nceos1: device-read — service s' });
  const v2 = resolveLegDeviceSources({ contractValue: undefined, taskBody: `## Device sources\nceos1: device-read — service s\n${LR}` });
  const bad = resolveLegDeviceSources({ contractValue: undefined, taskBody: `## Device sources\n${LR}\nceos2: command-package` });
  const absent = resolveLegDeviceSources({ contractValue: undefined, taskBody: 'nothing' });
  const conflict = resolveLegDeviceSources({ contractValue: [LR], taskBody: '## Device sources\nceos1: device-read — service s' });
  eq([v1.grammarVersion, v2.grammarVersion, bad.grammarVersion, absent.grammarVersion, conflict.grammarVersion], [1, 2, 1, 1, 1], 'versions: ');
}));
test('LR4 the snapshot READER accepts v1 and v2, validates each entry against ITS version, refuses a non-parsed v2 and a v1 snapshot carrying `live-read`', () => withGate(true, () => {
  const v2 = resolveLegDeviceSources({ contractValue: undefined, taskBody: `## Device sources\nceos1: device-read — service s\n${LR}` });
  const snap = buildDeviceSourcesSnapshot(v2, '2026-11-04T00:00:00Z');
  const back = readDeviceSourcesSnapshot({ [DEVICE_SOURCES_SNAPSHOT_KEY]: snap });
  assert(back && back !== 'unreadable' && back.resolution.state === 'parsed' && back.resolution.grammarVersion === 2, JSON.stringify(back));
  const forgedV1 = JSON.parse(JSON.stringify(snap)); forgedV1.resolution.grammarVersion = 1;
  eq(readDeviceSourcesSnapshot({ [DEVICE_SOURCES_SNAPSHOT_KEY]: forgedV1 }), 'unreadable', 'v1 with a live-read entry: ');
  const v2NoLive = JSON.parse(JSON.stringify(snap)); v2NoLive.resolution.entries = [v2NoLive.resolution.entries[0]];
  eq(readDeviceSourcesSnapshot({ [DEVICE_SOURCES_SNAPSHOT_KEY]: v2NoLive }), 'unreadable', 'v2 using no v2 kind: ');
  const v2Absent = { version: 1, takenAt: 'x', resolution: { state: 'absent', grammarVersion: 2 } };
  eq(readDeviceSourcesSnapshot({ [DEVICE_SOURCES_SNAPSHOT_KEY]: v2Absent }), 'unreadable', 'a non-parsed v2: ');
  const v1 = resolveLegDeviceSources({ contractValue: undefined, taskBody: '## Device sources\nceos1: device-read — service s' });
  const v1back = readDeviceSourcesSnapshot({ [DEVICE_SOURCES_SNAPSHOT_KEY]: buildDeviceSourcesSnapshot(v1, 't') });
  assert(v1back && v1back !== 'unreadable' && v1back.resolution.grammarVersion === 1, 'a stored v1 snapshot must stay readable');
}));
test('LR5 identity keys `live-read` WITH its service (execution-facts B2 site 1): an evidence-service edit reads as a different declaration', () => withGate(true, () => {
  const a = resolveLegDeviceSources({ contractValue: undefined, taskBody: `## Device sources\n${LR}` });
  const b = resolveLegDeviceSources({ contractValue: undefined, taskBody: '## Device sources\nceos2: live-read — service attacker-svc' });
  assert(!sameDeclaration(a, b), 'service change compared equal');
  const c = resolveLegDeviceSources({ contractValue: [LR], taskBody: '## Device sources\nceos2: live-read — service attacker-svc' });
  eq(c.state, 'conflict', 'contract vs body differing service: ');
}));
test('LR6 KIND EXHAUSTIVENESS: every kind round-trips the parser, the identity key and the snapshot reader at its version (a new kind added without arms reds here)', () => withGate(true, () => {
  const lineFor: Record<string, string> = { 'git-file': 'd: git-file — service g ; o/r/p.cfg', 'device-read': 'd: device-read — service s', 'command-package': 'd: command-package', 'live-read': 'd: live-read — service s' };
  eq(Object.keys(lineFor).sort(), [...DS.DEVICE_SOURCE_KINDS].sort(), 'kind list: ');
  for (const k of DS.DEVICE_SOURCE_KINDS) {
    const r = resolveLegDeviceSources({ contractValue: undefined, taskBody: `## Device sources\n${lineFor[k]}` });
    assert(r.state === 'parsed' && r.entries[0].kind === k, `${k}: ${JSON.stringify(r)}`);
    const back = readDeviceSourcesSnapshot({ [DEVICE_SOURCES_SNAPSHOT_KEY]: buildDeviceSourcesSnapshot(r, 't') });
    assert(back && back !== 'unreadable' && sameDeclaration(back.resolution, r), `${k}: snapshot round-trip`);
  }
}));
test('LR7 the lab override is reachable ONLY from the lab and tests (production never calls it)', () => {
  const { execSync } = require('child_process') as typeof import('child_process');
  const hits = execSync(`grep -rln "__setLiveReadKindForLab" lib app scripts services --include=*.ts --include=*.js || true`, { cwd: path.join(__dirname, '..') }).toString().trim().split('\n').filter(Boolean);
  const bad = hits.filter((f) => f !== 'lib/agents/harness/device-sources.ts' && !f.startsWith('scripts/leg-replay-lab/') && !/^scripts\/test-/.test(f));
  eq(bad, [], 'callers outside the lab/tests: ');
});
test('LR8 the gate is false ⇔ the seeded network text carries no `live-read` kind line (the TEXT commit flips both together)', () => {
  const textHasKind = /`<device>: live-read — service/.test(SECTION);
  eq(DS.LIVE_READ_KIND_ENABLED, textHasKind, 'gate vs text: ');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
