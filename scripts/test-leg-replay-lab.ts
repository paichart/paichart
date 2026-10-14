#!/usr/bin/env ts-node
/**
 * test-leg-replay-lab — the leg replay lab's own pins. $0: no model call, production read-only (snapshots are fetched
 * once over the read-only psql channel and cached under scripts/leg-replay-lab/cache/; later runs are offline).
 *
 *   npm run test:leg-replay-lab
 *
 *   F1-F4  PROMPT-REBUILD FIDELITY on four past executions (Author AND Reviewer each): the rebuilt system prompt's
 *          protocol-injection fact (mode, binding, version, preambleChars), role, tool list and model equal what the
 *          execution persisted — under the text it actually ran (current prod row, or the seed at a past commit).
 *   F5     the check can FAIL: the wrong protocol version on a node moves preambleChars and is caught.
 *   D1     a DRY RUN end to end on the 2026-10-07 experiment config exits 0, makes no model call, and every node's
 *          control pass is green (nets reproduce the persisted stamps; the chain patch is an identity; the shipping
 *          parser reproduces the persisted verdict).
 *   D2     the LIVE PATH end to end with a scripted model that returns the persisted outputs: every node's replayed
 *          verdict equals its persisted verdict (refused stays refused, approved stays approved).
 *   V1-V2  verdict parsing is the SHIPPING parser: the lab imports parse-verdict.ts and defines no verdict grammar
 *          of its own; the parser it calls is the same function object the platform exports.
 *   E1-E3  candidate texts: an edit anchor must occur exactly once; materialized files equal baseline + edits;
 *          the Reviewer-facing gap-3 half lands in the Phase 3 bullet only.
 *   G1     the blocking-item grouping heuristic lands each persisted item where READ.md §1 classifies it.
 *   T1     a GUIDANCE edit (variant `templateEdits`, appliesTo `role:<agentRole>`) reaches the targeted role's system
 *          prompt, and only that role's — the hook the gap-2 qualifier needs (READ.md §6). §1 follows the node's ERA:
 *          on a pre-fix node replayed as-run it also lands in §1; replayed as post-fix (`dropTemplateDirective`) it
 *          does not, and §1 is synthesized (TEMPLATE-SENT-TWICE fix A, 2026-10-07).
 *   T2     the three directive eras rebuild as production builds them: pre-fix template-fallback (as-run: the frozen
 *          template copy in §1), post-fix (config.prompt absent: §1 synthesized, system from the template row), and
 *          own-prompt (§1 = the task's prompt, the SYSTEM base = the template row — never the task's prompt).
 *   M1     the lexical measures separate the PERSISTED packages the way READ.md §1 does (both directions): the
 *          condition-as-expected-output measure fires on O5/O7 and on no approved control; self-comparison on O1 only;
 *          O5 carries the labelled PRESENCE shape 3 times (READ.md: "uses the labelled PRESENCE: shape 3 times").
 *   P1     L0a + L0b (2026-10-08, WARNINGS-INVISIBLE batch 2): a variant with `authorSource: 'persisted'` makes NO Author
 *          call and costs $0; an unplanted node's Reviewer prompt is the one the chain-identity control proves; a planted
 *          node's Reviewer sees the plant (and only it); the leg reviewerWarnings control computes (not its errorFact);
 *          the fake live path writes the planted package, the warning measures and report-section.md per sample.
 *   P2     a plant anchor that is not unique (or a plant aimed at another node) FAILS the dry run.
 *   W1     a labelled reachability line travels the whole lab chain offline: shipping verdict builder → leg reviewerWarnings
 *          net through replay-prisma (registered) → appendReviewerWarningsSection (no label prefix) → reachChainPass;
 *          the hygiene measures fire on a negated label and on a label under `Blocking issues:` (both directions).
 *   R1-R5  requirements_author nodes (L-R1..L-R5, 2026-10-09, inputs/2026-10-09-req-author-loop):
 *          R1 the reviewer is paired by the SHIPPING REVIEWER_ROLES set (N9 → its requirements_reviewer), and a node
 *             that names a different reviewer than the cached snapshot's fails loud instead of reusing it;
 *          R2 a dry run on N9: every control ✓, the role-excluded leaf nets read n/a (not a mismatch), the in-run
 *             requirements form check computes with the owner map, and the three arms' rendered prompts are identical;
 *          R3 the 2b correction flag is PER ARM: with REQUIREMENTS_FORM_CORRECTION_ENABLED=true in the env, the OFF arm
 *             stamps flag-off with no correction call, the ON arm makes the tool-less correction call (fake model) with
 *             the SHIPPING builder's message for that draft (N7; was N9 + the stage-A file until group 3a, 2026-10-12),
 *             and an arm lever set together with the env flag in `flags` is refused;
 *          R4 the scorer (shipping TS port) reproduces stage A's table on all 9 persisted trial drafts, plus each
 *             `movedBy` entry (a shipped code change, by commit) that is in this tree's history;
 *          R5 the L-R5 size allowance: a draft passing the in-run size check by < 500 (planted from gen 5 since group 3a)
 *             is not counted publishable, gen 5 as written is, and the
 *             committed report.md adds +0 on approved gens (the "NOT RELEASED" banner only on refused ones).
 *   GR1-GR4 group 4 lab (2026-10-12, inputs/2026-10-12-g4-registry): GR1 an edit op may name a subset of its spec's
 *          targets (the Reviewer brief paraphrases item 21); GR2 item 22 reaches LA's three inputs once each and no other
 *          node; GR3 the g4 scorer self-test (P9) — or a loud refusal in a tree without G's classifier; GR4 nByVariant.
 *   Z1-Z5  Z49 lab gate levers (Z5: HCL exemplar parse, L10 measure fault) (2026-10-10, inputs/2026-10-10-z49-request-path):
 *          Z1 node `inputEdits` (L-Z1) edit a DEEP COPY of the snapshot — leg/Author/Reviewer descriptions each exactly once —
 *             and leave the cached snapshot file byte-unchanged; an unknown target or a non-unique anchor fails loud;
 *          Z2 variant `requirementsCheckAt` (L-Z2) installs the in-run check data of a commit on the live module (the stamp's
 *             registrySha256 follows it) and `useCheckDataAt(null)` restores HEAD's;
 *          Z3 the Z49 scorer reads the persisted run-2 draft as the Z49 failure and every planted control as pre-registered;
 *          Z4 protocol-history v2 renders a protocol's embedded seed-data file AT the commit (requirements-authoring 1.8.0 at
 *             452dfe15 == the production row pinned 2026-10-09; v1 rendered today's skeleton at every commit).
 *   RT1-RT3 RECORDED TOOLS + harvester nodes (2026-10-13, inputs/2026-10-13-obs-quote-consumer):
 *          RT1 a scripted model re-issuing each harvester node's PRODUCTION calls is served the stored results byte for byte
 *              through the shipping loop: every call served, served bytes == stored, every file-tool call's R9 and LLM-cap
 *              facts == production's, the replayed quoteFidelity == the persisted recompute, the quote score == the
 *              persisted score (five nodes, both arms);
 *          RT2 the matching tiers, both directions: exact, key order, services `arguments` string vs object, another
 *              targetService, a repeat read, a reworded platform call (same-action); a different query, a persist-truncated
 *              result and a never-recorded file read are NOT served; a stored failure replays as a throw; validity at 90%;
 *          RT3 the candidate text reaches every hobs19/obs19 prompt verbatim (each op once) and no baseline prompt.
 *   QS1    the harvester quote score: reproduces DRAFT-C §1 on the persisted harvests (H-R2, H-R1, H-CLEAN); reads run 2's
 *          quotes with the word "verbatim" swapped out as NOT faithful while the shipping fact reads them clean (the
 *          unlabelled-cut blind spot, which is why the score reads strictly); a labelled excerpt with `# [elided: …]` at
 *          the cut and a byte-for-byte quote of the raw file both read faithful.
 */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://leg-replay-lab:never@127.0.0.1:1/never_connects';
if (!process.env.PAICHART_SKIP_DB_CONNECT) process.env.PAICHART_SKIP_DB_CONNECT = 'true';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { loadSnapshot } from './leg-replay-lab/snapshot';
import { rebuildPrompt, fidelityChecks, parsedResult, sha256, type ProtocolText } from './leg-replay-lab/rebuild';
import { protocolTextAtCommit } from './leg-replay-lab/protocol-history';
import { applyEdits, groupOf, computeMeasures, withModel, plantFor, shippingReviewerVerdict, reviewerWarningMeasures, reachChainPass } from './leg-replay-lab/lab';
import { runLegSynthesizeNets } from './leg-replay-lab/nets';
import { snapshotSql } from './leg-replay-lab/snapshot';
import { scoreSelfTest, scoreText, nodeInputs, readOwnerMap, SIZE_ALLOWANCE_CHARS } from './leg-replay-lab/score-requirements';
import { snapshotWithInputEdits } from './leg-replay-lab/input-edits';
import { useCheckDataAt } from './leg-replay-lab/check-at';
import { z49SelfTest, parseStanza } from './leg-replay-lab/score-z49';
import { g4SelfTest, requireG4Classifier } from './leg-replay-lab/score-g4';
import { snapshotPath } from './leg-replay-lab/snapshot';
import { computeRequirementsFormCheckStamp, buildRequirementsCorrectionPrompt } from '../lib/agents/harness/requirements-form-correction';
import { analyzeRequirementsForm } from '../lib/agents/harness/requirements-form-check';
import { appendReviewerWarningsSection } from '../lib/services/report-warnings-section';
import * as shippingVerdict from '../lib/agents/harness/parse-verdict';
import { createRecordedToolServer, recordedToolsReport, storedCallsOf, type StoredCall } from './leg-replay-lab/recorded-tools';
import { scoreHarvesterQuotes } from './leg-replay-lab/score-quote';
import { computeQuoteFidelity, VERBATIM_CLAIM_RE } from '../lib/agents/harness/quote-fidelity';
import { TOOL_STUB_RESULT } from './leg-replay-lab/live';

const LAB = path.join(__dirname, 'leg-replay-lab');
/** origin/main before Z49 (0bcbfd7f added the request-path registry row): the in-run check data of the 2026-10-09 drafts. */
const PRE_Z49 = '452dfe15a547a2f88bbcc0a0529cd9f7e20f3b26';
const EXP = path.join(LAB, 'inputs', '2026-10-07-gaps-1-3');
let pass = 0; let fail = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); } catch (e) { fail++; console.log(`  ❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const EXACT = ['protocolInjection.mode', 'protocolInjection.delta', 'protocolInjection.protocolNames', 'protocolInjection.stampSource',
  'protocolInjection.preambleChars', 'agentRole', 'toolNames', 'model'];

async function rebuildAndCheck(eid: string, text: ProtocolText) {
  const snap = loadSnapshot(eid);
  for (const which of ['author', 'reviewer'] as const) {
    const r = await rebuildPrompt(snap, which, text);
    const checks = fidelityChecks(snap, which, r);
    for (const name of EXACT) {
      const c = checks.find((x) => x.name === name);
      assert(c && c.ok === true, `${eid} ${which} ${name}: ${c ? c.detail : 'missing'}`);
    }
  }
}
const prodText = (name: string, version: string): ProtocolText => {
  const f = path.join(EXP, 'protocols', `${name}@${version}.baseline.md`);
  return { name, version, text: fs.readFileSync(f, 'utf8'), source: f };
};
const commitText = (name: string, commit: string): ProtocolText => {
  const t = protocolTextAtCommit(name, commit);
  return { name, version: t.version, text: t.text, source: `commit:${commit}` };
};

(async () => {
  console.log('🧪 test-leg-replay-lab');

  await test('F1 O7 (obs 1.6.0, 10-06, refused) — Author + Reviewer rebuilt exactly', () =>
    rebuildAndCheck('cmuwby46000jmyx9eltfdr4z1', prodText('observability-config-protocol', '1.6.0')));
  await test('F2 TF control (terraform 1.12.1, 10-06, approved) — Author + Reviewer rebuilt exactly', () =>
    rebuildAndCheck('cmuwbwxvw00jdyx9eoy7ra77r', prodText('terraform-iac-protocol', '1.12.1')));
  await test('F3 O5 (obs 1.5.0, 10-03, refused) — rebuilt exactly under the seed at ee2c8d13 (a RETIRED text)', () =>
    rebuildAndCheck('cmurnitt9029zyxx9r8fb7n0i', commitText('observability-config-protocol', 'ee2c8d13')));
  await test('F4 C-1004 (obs 1.6.0, 10-04, approved) — rebuilt exactly under the seed at d3e79672', () =>
    rebuildAndCheck('cmutj5f1x004ayx0g9bzbsssv', commitText('observability-config-protocol', 'd3e79672')));
  await test('F5 the check CAN fail: obs 1.6.0 text on a 1.5.0 node moves preambleChars and is reported', async () => {
    const snap = loadSnapshot('cmurnitt9029zyxx9r8fb7n0i');
    const r = await rebuildPrompt(snap, 'author', prodText('observability-config-protocol', '1.6.0'));
    const c = fidelityChecks(snap, 'author', r).find((x) => x.name === 'protocolInjection.preambleChars')!;
    assert(c.ok === false, `expected a preambleChars mismatch, got ${c.detail}`);
  });

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'leg-replay-lab-test-'));
  const runLab = (args: string[]) => execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.join(LAB, 'lab.ts'), ...args],
    { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: '' }, maxBuffer: 64 * 1024 * 1024 }).toString();

  await test('D1 dry run end to end on the experiment config: exit 0, no call, every control green', () => {
    const dir = path.join(out, 'dry');
    const log = runLab(['run', '--experiment', EXP, '--out', dir]);
    assert(/DRY RUN, \$0/.test(log) && /No model was called/.test(log), 'not a dry run');
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert(!fs.readdirSync(dir).some((d) => fs.existsSync(path.join(dir, d)) && fs.statSync(path.join(dir, d)).isDirectory()
      && fs.readdirSync(path.join(dir, d)).some((v) => fs.existsSync(path.join(dir, d, v)) && fs.statSync(path.join(dir, d, v)).isDirectory()
        && fs.readdirSync(path.join(dir, d, v)).some((x) => x.startsWith('sample-')))), 'a dry run wrote samples');
    assert(Object.keys(m.nodes).length === 7, `expected 7 nodes, got ${Object.keys(m.nodes).length}`);
    for (const [id, n] of Object.entries<any>(m.nodes)) {
      const c = n.controls;
      assert(c.leafNetsReproducePersisted.markerPresence && c.leafNetsReproducePersisted.rollbackContainment, `${id}: leaf nets do not reproduce the persisted stamps`);
      assert(c.chainPatchIdentity, `${id}: chain patch is not an identity`);
      assert(c.shippingParserReproducesPersistedVerdict, `${id}: shipping parser does not reproduce the persisted verdict`);
      assert(m.code && /^[0-9a-f]{40}$/.test(m.code.head), 'manifest carries no commit hash (rule 7)');
      for (const [v, vr] of Object.entries<any>(n.variants)) {
        assert(vr.protocol.sha256 && vr.authorPromptSha.system, `${id}/${v}: no text/prompt hashes`);
        assert(fs.existsSync(path.join(dir, id, v, 'author.system.md')), `${id}/${v}: prompt not saved`);
      }
    }
    assert(m.estimate.expectedUsd > 0 && m.estimate.upperUsd >= m.estimate.expectedUsd, 'no cost estimate');
  });

  await test('D2 live path with a scripted model returning the persisted outputs: every replayed verdict = persisted', () => {
    const dir = path.join(out, 'fake');
    runLab(['run', '--experiment', EXP, '--out', dir, '--fake-llm', 'persisted', '--n', '1', '--variants', 'baseline', '--concurrency', '2']);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const rows = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
    assert(rows.length === 7, `expected 7 summary rows, got ${rows.length}`);
    for (const r of rows) {
      const persisted = m.nodes[r.node].persisted.approved;
      assert(r.errors === 0, `${r.node}: sample error`);
      assert(r.noVerdict === 0, `${r.node}: no parseable verdict`);
      assert(persisted === false ? r.refused === 1 : r.approved === 1, `${r.node}: replayed verdict ≠ persisted (${persisted})`);
    }
  });

  await test('V1 the lab imports the SHIPPING parser and defines no verdict grammar of its own', () => {
    const files = fs.readdirSync(LAB).filter((f) => f.endsWith('.ts'));
    const importers = files.filter((f) => /from '\.\.\/\.\.\/lib\/agents\/harness\/parse-verdict'/.test(fs.readFileSync(path.join(LAB, f), 'utf8')));
    assert(importers.includes('lab.ts'), 'lab.ts does not import lib/agents/harness/parse-verdict');
    for (const f of files) {
      const src = fs.readFileSync(path.join(LAB, f), 'utf8');
      // The grammar's own tokens, case-sensitive, in code (comments stripped): the marker and the refusal token.
      assert(!/VERDICT:|NEEDS[-_ ]?REVISION/.test(src.replace(/^\s*(\/\/|\*).*$/gm, '')), `${f} carries its own verdict grammar`);
    }
  });
  await test('V2 the parser the lab calls IS the platform export (same function object)', () => {
    const viaLab = require('../lib/agents/harness/parse-verdict');
    assert(viaLab.parseReviewerVerdict === shippingVerdict.parseReviewerVerdict, 'two parser instances');
    const v = shippingVerdict.parseReviewerVerdict('x\n## VERDICT: NEEDS-REVISION\nBlocking issues:\n- a\n- b\nConfidence: 80');
    assert(v && v.approved === false && v.blocking.length === 2, 'parser smoke');
  });

  await test('E1 an edit anchor must occur exactly once (0 and 2 both refuse)', () => {
    const e = { id: 'x', appliesTo: ['p'], ops: [{ type: 'replace' as const, old: 'AB', new: 'C' }] };
    let threw0 = false; try { applyEdits('xx', [e], 'p'); } catch { threw0 = true; }
    let threw2 = false; try { applyEdits('AB AB', [e], 'p'); } catch { threw2 = true; }
    assert(threw0 && threw2, `0-match threw ${threw0}, 2-match threw ${threw2}`);
    assert(applyEdits('AB', [e], 'q').applied.length === 0, 'applied to a protocol it does not target');
  });
  await test('E2 materialized candidate files == pinned baseline + edits (sha-checked)', () => {
    const exp = JSON.parse(fs.readFileSync(path.join(EXP, 'experiment.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(EXP, 'protocols', 'MANIFEST.json'), 'utf8'));
    for (const [name, b] of Object.entries<any>(exp.baseline.protocols)) {
      const base = fs.readFileSync(path.join(EXP, b.file), 'utf8');
      assert(sha256(base) === b.sha256, `${name} baseline sha drift`);
      for (const [v, spec] of Object.entries<any>(exp.variants)) {
        if (v === 'baseline') continue;
        const edits = spec.edits.map((f: string) => JSON.parse(fs.readFileSync(path.join(EXP, f), 'utf8')));
        const { text, applied } = applyEdits(base, edits, name);
        if (!applied.length) continue;
        const f = path.join(EXP, b.file.replace(/\.baseline\.md$/, `.${v}.md`));
        assert(fs.readFileSync(f, 'utf8') === text, `${f} ≠ baseline + edits`);
        assert(manifest[`${name}:${v}`].sha256 === sha256(text), `${name}:${v} manifest sha drift`);
      }
    }
  });
  await test('E3 gap 3 changes exactly two places in observability-config (Phase 2 (b) and the Phase 3 bullet); gap 1 one place per domain', () => {
    const base = fs.readFileSync(path.join(EXP, 'protocols', 'observability-config-protocol@1.6.0.baseline.md'), 'utf8').split('\n');
    const g3 = fs.readFileSync(path.join(EXP, 'protocols', 'observability-config-protocol@1.6.0.gap3.md'), 'utf8').split('\n');
    const changed = base.map((l, i) => (l !== g3[i] ? i : -1)).filter((i) => i >= 0);
    assert(base.length === g3.length && changed.length === 2, `changed lines ${changed.length}`);
    assert(/Phase 2 — Observability Config Rollback Author/.test(g3[changed[0]]) && /Phase 3 — Observability Change Reviewer/.test(g3[changed[1]]), 'gap 3 landed outside the two bullets');
    for (const n of ['observability-config-protocol@1.6.0', 'terraform-iac-protocol@1.12.1']) {
      const b = fs.readFileSync(path.join(EXP, 'protocols', `${n}.baseline.md`), 'utf8').split('\n');
      const g = fs.readFileSync(path.join(EXP, 'protocols', `${n}.gap1.md`), 'utf8').split('\n');
      assert(b.length === g.length && b.filter((l, i) => l !== g[i]).length === 1, `${n}: gap 1 changed ≠ 1 line`);
    }
  });

  await test('G1 the grouping heuristic lands each persisted refusal where READ.md §1 puts it', () => {
    const want: Record<string, string> = {
      cmunduty100dbyx7p74tnwd7r: 'self-comparison', cmurilb0n01mwyxx9os3mqaqf: 'access-control-coverage',
      cmurnitt9029zyxx9r8fb7n0i: 'validation-form', cmuwby46000jmyx9eltfdr4z1: 'validation-form',
    };
    for (const [eid, g] of Object.entries(want)) {
      const items: string[] = parsedResult(loadSnapshot(eid).reviewer)!.reviewerVerdict.blocking;
      assert(items.length === 1 && groupOf(items[0]) === g, `${eid}: ${groupOf(items[0] ?? '')} ≠ ${g}`);
    }
  });

  await test('T1 a guidance edit reaches only the targeted role (Author system; §1 by era; Reviewer untouched)', () => {
    const tmp = path.join(out, 'exp-tpl');
    fs.cpSync(EXP, tmp, { recursive: true });
    const exp = JSON.parse(fs.readFileSync(path.join(tmp, 'experiment.json'), 'utf8'));
    fs.writeFileSync(path.join(tmp, 'edits', 'tpl-probe.json'), JSON.stringify({ id: 'tplprobe', appliesTo: ['role:config_change_author'],
      ops: [{ type: 'replace', old: 'working within pAIchart', new: 'working within pAIchart [LAB-TEMPLATE-PROBE]' }] }));
    exp.variants.tplprobe = { edits: [], templateEdits: ['edits/tpl-probe.json'] };
    exp.variants.tplprobepost = { edits: [], templateEdits: ['edits/tpl-probe.json'], dropTemplateDirective: true };
    exp.nodes = exp.nodes.filter((nd: any) => nd.id === 'O7').map((nd: any) => ({ ...nd, variants: ['baseline', 'tplprobe', 'tplprobepost'] }));
    fs.writeFileSync(path.join(tmp, 'experiment.json'), JSON.stringify(exp, null, 2));
    const dir = path.join(out, 'tpl-run');
    runLab(['run', '--experiment', tmp, '--out', dir]);
    const rd = (v: string, f: string) => fs.readFileSync(path.join(dir, 'O7', v, f), 'utf8');
    assert(rd('tplprobe', 'author.system.md').includes('[LAB-TEMPLATE-PROBE]'), 'probe not in the Author system prompt');
    // O7 is a PRE-FIX node (prompt-less task; the builders froze the template into config.prompt). As-run, the pre-fix
    // builders would have frozen the candidate there too, so it reaches §1; replayed as post-fix it must not.
    assert(rd('tplprobe', 'author.user.md').includes('[LAB-TEMPLATE-PROBE]'), 'as-run: probe not in the pre-fix Author §1');
    assert(rd('tplprobepost', 'author.system.md').includes('[LAB-TEMPLATE-PROBE]'), 'post-fix: probe not in the Author system prompt');
    assert(!rd('tplprobepost', 'author.user.md').includes('[LAB-TEMPLATE-PROBE]'), 'post-fix: probe reached §1 — the template must be in the system prompt only');
    assert(/## Directive\nAs a [^\n]+, complete the following task: "/.test(rd('tplprobepost', 'author.user.md')), 'post-fix: §1 not synthesized');
    assert(!rd('baseline', 'author.system.md').includes('[LAB-TEMPLATE-PROBE]'), 'probe leaked into baseline');
    assert(rd('tplprobe', 'reviewer.system.md') === rd('baseline', 'reviewer.system.md'), 'Reviewer prompt changed by an Author-role edit');
    assert(!fs.existsSync(path.join(dir, 'O7', 'tplprobe', 'reviewer.template.md')), 'reviewer template override written');
  });

  await test('T2 the three directive eras rebuild as production builds them (pre-fix as-run · post-fix · own-prompt)', async () => {
    const eid = 'cmuwby46000jmyx9eltfdr4z1'; // O7: a pre-fix template-fallback node
    const text = prodText('observability-config-protocol', '1.6.0');
    const MARK = 'working within pAIchart'; // a template line that survives placeholder resolution
    const clone = () => JSON.parse(JSON.stringify(loadSnapshot(eid)));
    const directive = (u: string) => u.slice(0, u.indexOf('\n## ', 5));

    const pre = clone();
    assert(!pre.author.task.prompt && pre.author.exec.config.prompt, 'O7 is no longer a pre-fix template-fallback node');
    const asRun = await rebuildPrompt(pre, 'author', text);
    assert(directive(asRun.user).includes(MARK) && asRun.system.includes(MARK), 'pre-fix as-run: template must be in §1 AND the system prompt');
    const asPost = await rebuildPrompt(pre, 'author', text, { dropTemplateDirective: true });
    assert(!directive(asPost.user).includes(MARK) && asPost.system === asRun.system, 'pre-fix as post-fix: §1 must drop the template, system unchanged');

    const post = clone(); delete post.author.exec.config.prompt;
    const p = await rebuildPrompt(post, 'author', text);
    assert(/^## Directive\nAs a [^\n]+, complete the following task: "/.test(p.user), `post-fix: §1 not synthesized: ${p.user.slice(0, 120)}`);
    assert(!directive(p.user).includes(MARK) && p.system.includes(MARK), 'post-fix: template must be in the system prompt only');

    const own = clone(); own.author.task.prompt = 'OWN-DIRECTIVE-SENTINEL'; own.author.exec.config.prompt = 'OWN-DIRECTIVE-SENTINEL';
    const o = await rebuildPrompt(own, 'author', text);
    assert(directive(o.user).includes('OWN-DIRECTIVE-SENTINEL'), 'own-prompt: §1 must be the task prompt');
    assert(!o.system.includes('OWN-DIRECTIVE-SENTINEL') && o.system.includes(MARK), 'own-prompt: the SYSTEM base must be the template row, not the task prompt');
    const oc = await rebuildPrompt(own, 'author', text, { templatePromptOverride: (own.author.template.promptTemplate as string).replace(MARK, `${MARK} [PROBE]`) });
    assert(oc.system.includes('[PROBE]') && !oc.user.includes('[PROBE]') && directive(oc.user).includes('OWN-DIRECTIVE-SENTINEL'),
      'own-prompt + candidate: the candidate goes to the system prompt only; §1 stays the task prompt');
  });

  await test('M1 the measures separate the persisted packages as READ.md does (fires on the refused, silent on the controls)', () => {
    const exp = JSON.parse(fs.readFileSync(path.join(EXP, 'experiment.json'), 'utf8'));
    const m = (eid: string) => computeMeasures(parsedResult(loadSnapshot(eid).author)!.finalResponse, exp.measures);
    const O5 = m('cmurnitt9029zyxx9r8fb7n0i'); const O7 = m('cmuwby46000jmyx9eltfdr4z1'); const O1 = m('cmunduty100dbyx7p74tnwd7r');
    const controls = ['cmuqs1qfz0026yxxab7u91i5o', 'cmutj5f1x004ayx0g9bzbsssv', 'cmuwbwxvw00jdyx9eoy7ra77r'].map(m);
    assert(O5.conditionAsExpectedOutput > 0 && O7.conditionAsExpectedOutput > 0, `condition measure silent on a refused node (${O5.conditionAsExpectedOutput}, ${O7.conditionAsExpectedOutput})`);
    assert(controls.every((c) => c.conditionAsExpectedOutput === 0), 'condition measure fires on an approved control');
    assert(O1.selfComparison > 0 && [O5, O7, ...controls].every((c) => c.selfComparison === 0), 'self-comparison measure not specific to O1');
    assert(O5.presenceShapeLabels === 3, `O5 PRESENCE labels ${O5.presenceShapeLabels} ≠ 3`);
  });

  await test('MO1 model override sets BOTH the prompt model and the loop config model; unknown models fail loud; null is identity', async () => {
    const snap = loadSnapshot('cmuwbwxvw00jdyx9eoy7ra77r');
    const tf: ProtocolText = { name: 'terraform-iac-protocol', version: '1.12.1', source: 'test', text: fs.readFileSync(path.join(EXP, 'protocols', 'terraform-iac-protocol@1.12.1.baseline.md'), 'utf8') };
    const p = await rebuildPrompt(snap, 'author', tf);
    assert(withModel(p, null) === p, 'null override is not identity');
    const o = withModel(p, 'claude-opus-5-5');
    assert(o.model === 'claude-opus-5-5' && (o.llmConfigSource as any).model === 'claude-opus-5-5', 'override did not reach both model fields');
    assert(o.system === p.system && o.user === p.user, 'override changed the prompt text');
    assert(p.model !== 'claude-opus-5-5', 'override mutated the original prompt');
    let threw = false; try { withModel(p, 'claude-not-a-model-9'); } catch { threw = true; }
    assert(threw, 'unknown model did not fail loud');
  });

  await test('MO2 effort override reaches the loop config; an effort the model does not accept fails loud (no silent clamp)', async () => {
    const snap = loadSnapshot('cmuwbwxvw00jdyx9eoy7ra77r');
    const tf: ProtocolText = { name: 'terraform-iac-protocol', version: '1.12.1', source: 'test', text: fs.readFileSync(path.join(EXP, 'protocols', 'terraform-iac-protocol@1.12.1.baseline.md'), 'utf8') };
    const p = await rebuildPrompt(snap, 'author', tf);
    const o = withModel(p, 'claude-opus-5-5', 'medium');
    assert(o.model === 'claude-opus-5-5' && (o.llmConfigSource as any).effort === 'medium', 'effort did not reach llmConfigSource');
    const e = withModel(p, null, 'medium');
    assert(e.model === p.model && (e.llmConfigSource as any).effort === 'medium', 'effort-only override changed the model or dropped effort');
    let threw = false; try { withModel(p, 'claude-opus-5-5', 'turbo'); } catch { threw = true; }
    assert(threw, 'an unaccepted effort did not fail loud');
  });

  const B2 = path.join(LAB, 'inputs', '2026-10-08-batch2');
  const NA = 'cmuw8uwbl006yyx9ey6bw4cs6';
  await test('P1 authorSource persisted + authorPlant: $0 Author, plant reaches only its node, warnings control computes, fake path writes the measures', () => {
    const tmp = path.join(out, 'exp-b2');
    fs.cpSync(B2, tmp, { recursive: true });
    const exp = JSON.parse(fs.readFileSync(path.join(tmp, 'experiment.json'), 'utf8'));
    exp.nodes = exp.nodes.filter((nd: any) => nd.id === 'N-A' || nd.id === 'P-GLOSS');
    fs.writeFileSync(path.join(tmp, 'experiment.json'), JSON.stringify(exp, null, 2));
    const dir = path.join(out, 'b2-dry');
    const log = runLab(['run', '--experiment', tmp, '--out', dir]);
    assert(/author\[PERSISTED, \$0\]/.test(log) && /author\[PERSISTED\+plant plant-P-GLOSS, \$0\]/.test(log), 'estimate does not show a $0 persisted Author');
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert(m.estimate.calls === 2 * 2 * exp.n, `expected Reviewer-only calls (${2 * 2 * exp.n}), got ${m.estimate.calls}`);
    for (const id of ['N-A', 'P-GLOSS']) {
      const c = m.nodes[id].controls;
      assert(c.chainPatchIdentity && c.shippingParserReproducesPersistedVerdict && c.legReviewerWarningsComputes, `${id}: a control failed ${JSON.stringify(c)}`);
    }
    const GLOSS = 'proving /27 is the minimal aligned block, not just a sufficient one';
    const rd = (n: string, v: string) => fs.readFileSync(path.join(dir, n, v, 'reviewer.user.md'), 'utf8');
    assert(rd('P-GLOSS', 'baseline').includes(GLOSS) && rd('P-GLOSS', 'batch2').includes(GLOSS), 'plant missing from the planted node');
    assert(!rd('N-A', 'baseline').includes(GLOSS), 'plant leaked into the unplanted node');
    assert(rd('N-A', 'baseline') === rd('N-A', 'batch2'), 'Reviewer user prompt differs between arms (only the system text may)');
    assert(m.nodes['P-GLOSS'].plant?.edit === 'plant-P-GLOSS' && m.nodes['N-A'].plant === null, 'plant not recorded in the manifest');
    const fdir = path.join(out, 'b2-fake');
    runLab(['run', '--experiment', tmp, '--out', fdir, '--fake-llm', 'persisted', '--n', '1', '--concurrency', '2']);
    const smp = JSON.parse(fs.readFileSync(path.join(fdir, 'P-GLOSS', 'batch2', 'sample-01', 'sample.json'), 'utf8'));
    assert(smp.authorSource?.source === 'persisted' && smp.authorSource.plant === 'plant-P-GLOSS', 'sample does not record the persisted source + plant');
    assert(!smp.calls.some((c: any) => c.role === 'author'), 'an Author call was made');
    assert(fs.readFileSync(path.join(fdir, 'P-GLOSS', 'batch2', 'sample-01', 'author.md'), 'utf8').includes(GLOSS), 'sample author.md is not the planted package');
    assert(smp.warningMeasures && typeof smp.warningMeasures.restatedLabel === 'number', 'no warning measures');
    assert(smp.legReviewerWarnings?.reason === 'transcribed' && !smp.legReviewerWarningsError, `leg reviewerWarnings did not compute: ${JSON.stringify(smp.legReviewerWarnings)}`);
    assert(fs.existsSync(path.join(fdir, 'P-GLOSS', 'batch2', 'sample-01', 'report-section.md')), 'report-section.md not saved');
    assert(/## Reviewer warnings \(L0e/.test(fs.readFileSync(path.join(fdir, 'summary.md'), 'utf8')), 'summary has no warnings table');
  });

  await test('P2 a plant anchor that is not exactly-once, or a plant aimed at another node, fails', () => {
    const persisted = parsedResult(loadSnapshot(NA).author)!.finalResponse;
    const dir = path.join(out, 'plant-probe');
    fs.mkdirSync(dir, { recursive: true });
    const w = (f: string, spec: unknown) => fs.writeFileSync(path.join(dir, f), JSON.stringify(spec));
    w('dup.json', { id: 'dup', appliesTo: [`author:${NA}`], ops: [{ type: 'replace', old: 'ceos1', new: 'x' }] });
    w('other.json', { id: 'other', appliesTo: ['author:cmuwbwxvw00jdyx9eoy7ra77r'], ops: [{ type: 'replace', old: '# Change Package', new: 'x' }] });
    w('ok.json', { id: 'ok', appliesTo: [`author:${NA}`], ops: [{ type: 'replace', old: '# Change Package: Fabric', new: '# Change Package [PLANT]: Fabric' }] });
    let dup = false; try { plantFor(dir, { id: 'X', authorExecutionId: NA, authorPlant: 'dup.json' }, persisted); } catch { dup = true; }
    let other = false; try { plantFor(dir, { id: 'X', authorExecutionId: NA, authorPlant: 'other.json' }, persisted); } catch { other = true; }
    const ok = plantFor(dir, { id: 'X', authorExecutionId: NA, authorPlant: 'ok.json' }, persisted);
    assert(dup && other, `non-unique threw ${dup}, wrong-node threw ${other}`);
    assert(ok.text.startsWith('# Change Package [PLANT]: Fabric') && ok.deltaChars === 8, 'a valid plant did not apply exactly');
    assert(plantFor(dir, { id: 'X', authorExecutionId: NA }, persisted).text === persisted, 'no plant must be identity');
  });

  await test('W1 a labelled reachability line travels verdict → leg fact (registered) → section; hygiene measures fire both ways', async () => {
    const snap = loadSnapshot(NA);
    const ares = parsedResult(snap.author)!;
    const LINE = 'V7-V9 are absent, so no post-change step proves the six exporter addresses stay reachable.';
    const text = `Review body.\nNON-BLOCKING WARNING (reachability-after-suppression): ${LINE}\n\n## VERDICT: APPROVED\nBlocking issues: none\nConfidence: 85`;
    const rv = shippingReviewerVerdict(text)!;
    assert(rv.approved === true && rv.warnings.length === 1 && rv.warnings[0].id === 'reachability-after-suppression', `shipping verdict: ${JSON.stringify(rv.warnings)}`);
    const leg = await runLegSynthesizeNets(snap, [
      { taskId: snap.author.task.id, executionId: 'lab-w1-a', resultJson: { finalResponse: ares.finalResponse } },
      { taskId: snap.reviewer!.task.id, executionId: 'lab-w1-r', resultJson: { finalResponse: text, reviewerVerdict: rv } },
    ]);
    const fact = leg!.stamped.reviewerWarnings as any;
    assert(!leg!.errors.reviewerWarnings && fact.reason === 'transcribed' && fact.count === 1, `leg fact: ${JSON.stringify(fact)} ${leg!.errors.reviewerWarnings ?? ''}`);
    const section = appendReviewerWarningsSection('', fact).content;
    assert(section.includes(`- reachability-after-suppression — ${LINE}`) && !section.includes('NON-BLOCKING WARNING ('), `section: ${section}`);
    const wm = reviewerWarningMeasures(text, rv);
    assert(wm.reachLabel === 1 && wm.reachTranscribed === 1 && wm.labelInBlocking === 0 && wm.negatedLabel === 0, `measures: ${JSON.stringify(wm)}`);
    assert(reachChainPass(wm, fact, section), 'reachChainPass false on a good chain');
    assert(!reachChainPass(wm, { ...fact, count: 0 }, section), 'reachChainPass true with a zero leg count');
    // Negative direction: a negated label and a label under Blocking issues are counted.
    const bad = 'Body.\nNON-BLOCKING WARNING (restated-conclusion): none — the package restates nothing.\n\n## VERDICT: NEEDS-REVISION\nBlocking issues:\n- NON-BLOCKING WARNING (restated-conclusion): the gloss after Step 4\nConfidence: 60';
    const bm = reviewerWarningMeasures(bad, shippingReviewerVerdict(bad));
    assert(bm.negatedLabel === 1 && bm.labelInBlocking === 1 && bm.restatedLabel === 1, `negative measures: ${JSON.stringify(bm)}`);
    const att = reviewerWarningMeasures('x\nNON-BLOCKING WARNING (restated-conclusion): the package states /27 is minimal after Step 4\n\n## VERDICT: APPROVED\nBlocking issues: none', shippingReviewerVerdict('x\nNON-BLOCKING WARNING (restated-conclusion): the package states /27 is minimal after Step 4\n\n## VERDICT: APPROVED\nBlocking issues: none'));
    assert(att.restatedTranscribed === 1 && att.attribution[0].attribution === 'attributes-to-package', `D7 attribution: ${JSON.stringify(att.attribution)}`);
  });

  // ───────────── requirements_author (L-R1..L-R5) ─────────────
  const REQ = path.join(LAB, 'inputs', '2026-10-09-req-author-loop');
  const N9 = 'cmv07fmft00byyxls5jn3xgm4';
  const N9R = 'cmv07nowe00cbyxlsbgmusez7';

  await test('R1 reviewer paired by the shipping REVIEWER_ROLES set; a named reviewer that differs from the cache fails loud', () => {
    const sql = snapshotSql(N9);
    for (const r of shippingVerdict.REVIEWER_ROLES) assert(sql.includes(`'${r}'`), `pairing SQL omits ${r}`);
    assert(!/"agentRole" = 'change_reviewer'/.test(sql), 'pairing SQL is still hard-wired to change_reviewer');
    const snap = loadSnapshot(N9);
    assert(snap.reviewer?.exec.id === N9R, `N9 paired ${snap.reviewer?.exec.id}, expected ${N9R}`);
    assert(parsedResult(snap.reviewer!)?.agentRole === 'requirements_reviewer', 'N9 reviewer is not a requirements_reviewer');
    assert(loadSnapshot(N9, { reviewerExecutionId: N9R }).reviewer!.exec.id === N9R, 'naming the cached reviewer must reuse the cache');
    let threw = false;
    try { loadSnapshot(N9, { reviewerExecutionId: 'cmv06gebv00xbyxlrfntzfcpp' }); } catch (e) { threw = /re-fetch/.test((e as Error).message); }
    assert(threw, 'a node naming a different reviewer than the cached snapshot did not fail loud');
  });

  const reqTmp = (name: string, edit: (e: any) => void) => {
    const tmp = path.join(out, name);
    fs.cpSync(REQ, tmp, { recursive: true });
    const e = JSON.parse(fs.readFileSync(path.join(tmp, 'experiment.json'), 'utf8'));
    edit(e);
    fs.writeFileSync(path.join(tmp, 'experiment.json'), JSON.stringify(e, null, 2));
    return tmp;
  };

  await test('R2 requirements dry run on N9: controls ✓ (role-excluded nets n/a), form check computes with the owner map, arms byte-identical', () => {
    const tmp = reqTmp('exp-req', (e) => { e.nodes = e.nodes.filter((nd: any) => nd.id === 'N9'); });
    const dir = path.join(out, 'req-dry');
    const log = runLab(['run', '--experiment', tmp, '--out', dir]);
    assert(/markerPresence n\/a ✓ rollbackContainment n\/a ✓/.test(log), 'role-excluded leaf nets not reported n/a');
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).nodes.N9.controls;
    assert(c.chainPatchIdentity && c.shippingParserReproducesPersistedVerdict && c.legReviewerWarningsComputes, `a control failed ${JSON.stringify(c)}`);
    assert(JSON.stringify(c.leafNetsReproducePersisted.notApplicable) === '["markerPresence","rollbackContainment"]', `n/a list ${JSON.stringify(c.leafNetsReproducePersisted.notApplicable)}`);
    const rq = c.requirementsFormCheckComputes;
    // 51,725 → 48,322 by group 3a (ad77a501, 2026-10-12): the program view drops the owner section's not-applicable rows
    // (that commit's message states this exact move). A view measure, untouched by check data; same in every tree after it.
    assert(rq?.ok && rq.ownerRowItemMap === 'present' && rq.itemMapSource === 'owner-map' && rq.persistedDraft.view === 48322, `form check control ${JSON.stringify(rq)}`);
    for (const f of ['author.system.md', 'author.user.md', 'reviewer.system.md']) {
      const rd = (v: string) => fs.readFileSync(path.join(dir, 'N9', v, f), 'utf8');
      assert(rd('sonnetBase') === rd('opusBase') && rd('opusBase') === rd('opusLoop'), `${f} differs between arms (they may differ only in model and flag)`);
    }
    assert(!fs.readFileSync(path.join(dir, 'N9', 'opusLoop', 'author.user.md'), 'utf8').includes('requirementsRowItemMap'), 'the owner map reached a prompt');
  });

  await test('R3 the 2b correction flag is per arm, independent of the env; an arm lever plus the env flag is refused', () => {
    // L-Z2: the trial drafts are 2026-10-09 drafts; check them under that day's check data (pre-Z49 registry).
    // N9 → N7 (2026-10-12, group 4 lab P0): group 3a (ad77a501) brought N9's view under the limit, so at production code
    // N9 fails no trigger check and the ON arm has nothing to correct — the test lost its subject. N7 (gen 7, 53,639)
    // is over the size limit in every tree since stage A. Its failing set grows by `coverage` under group 4 (5230c131:
    // restatements are Author-actionable), so the assertion is that `size` is among them, not the exact set.
    // The stage-A message file was rendered by 2026-10-09 code; the shipping message has since moved by construction
    // (3a's numbers, G's restatement item). The lab is now checked against the SHIPPING builder on the same draft and
    // inputs: what it must deliver is what production would send.
    // R1 (2026-10-12): under the Program Architect's 64,000 limit N7 (53,639) FITS — no trial draft is over it — so its
    // failing set is `coverage` alone (5230c131). The subject here is the per-arm flag, not the size check: the assertion
    // is that the ON arm attempts on a failing trigger check, whichever it is.
    const tmp = reqTmp('exp-req-r3', (e) => { e.nodes = e.nodes.filter((nd: any) => nd.id === 'N7'); for (const v of Object.values<any>(e.variants)) v.requirementsCheckAt = PRE_Z49; });
    const fdir = path.join(out, 'req-fake');
    execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.join(LAB, 'lab.ts'), 'run', '--experiment', tmp, '--out', fdir,
      '--fake-llm', 'persisted', '--n', '1', '--variants', 'opusBase,opusLoop'],
      { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: '', REQUIREMENTS_FORM_CORRECTION_ENABLED: 'true' }, maxBuffer: 64 * 1024 * 1024 });
    const smp = (v: string) => JSON.parse(fs.readFileSync(path.join(fdir, 'N7', v, 'sample-01', 'sample.json'), 'utf8'));
    const off = smp('opusBase'); const on = smp('opusLoop');
    assert(off.author.requirementsFormCorrectionEnabledSource === 'arm:off' && off.author.requirementsFormCheck.correction.notAttemptedReason === 'flag-off', `OFF arm: ${JSON.stringify(off.author.requirementsFormCheck?.correction)}`);
    assert(!off.calls.some((x: any) => x.purpose === 'requirements-form-correction'), 'the OFF arm made a correction call (the env leaked into the arm)');
    const corr = on.author.requirementsFormCheck.correction;
    assert(on.author.requirementsFormCorrectionEnabledSource === 'arm:on' && corr.attempted === true && corr.failingChecks.length > 0, `ON arm: ${JSON.stringify(corr)}`);
    assert(on.calls.filter((x: any) => x.role === 'author').map((x: any) => x.purpose).join(',') === 'loop,requirements-form-correction', `ON arm calls: ${on.calls.map((x: any) => x.purpose)}`);
    assert(corr.adopted === false && corr.notAdoptedReason === 'no-improvement', 'the fake re-emission (identical text) must be rejected as no-improvement');
    assert(corr.timeBudget.remainingMs > 1_000_000, `the lab watchdog is not production's 1080 s: ${corr.timeBudget.remainingMs}`);
    const sd = path.join(fdir, 'N7', 'opusLoop', 'sample-01');
    const n7 = loadSnapshot('cmv0564wz008kyxlscta8h2uw');
    const n7Text = parsedResult(n7.author)!.finalResponse;
    const n7In = nodeInputs(n7, readOwnerMap(REQ, 'owner-maps/log-archive-namespace-write-2026-10-09.answers.json'));
    useCheckDataAt(PRE_Z49);
    let shipping: string;
    try {
      shipping = buildRequirementsCorrectionPrompt(computeRequirementsFormCheckStamp({ text: n7Text, stopReason: 'end_turn', textSource: 'loop', inputs: n7In }) as any,
        analyzeRequirementsForm({ draft: n7Text, objective: n7In.objective, ownerRowItemMapParsed: n7In.ownerMap } as any));
    } finally { useCheckDataAt(null); }
    assert(fs.readFileSync(path.join(sd, 'correction-message.md'), 'utf8') === shipping, 'the lab correction message differs from the shipping builder on the same draft and inputs');
    assert(fs.existsSync(path.join(sd, 'author.pre-correction.md')) && fs.existsSync(path.join(sd, 'author.correction-raw.md')), 'pre-correction / raw re-emission not saved');
    const bad = reqTmp('exp-req-r3-bad', (e) => { e.nodes = e.nodes.filter((nd: any) => nd.id === 'N9'); e.flags.REQUIREMENTS_FORM_CORRECTION_ENABLED = 'true'; });
    let refused = false;
    try {
      execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.join(LAB, 'lab.ts'), 'run', '--experiment', bad, '--out', path.join(out, 'req-bad')],
        { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: '' }, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
    } catch (e) { refused = /one lever, two sources/.test(String((e as any).stderr ?? e)); }
    assert(refused, 'an arm lever together with the env flag in `flags` was not refused');
  });

  await test('R4 the requirements scorer reproduces stage A on all 9 persisted trial drafts', () => {
    const r = scoreSelfTest(REQ);
    assert(r.rows.length === 9, `${r.rows.length} gens scored`);
    assert(r.mismatches.length === 0, r.mismatches.join('; '));
  });

  await test('R5 L-R5 allowance: in-run size pass by < 500 is not publishable; report.md adds +0 on approved gens', () => {
    const r = scoreSelfTest(REQ);
    const approvedGens = [3, 5, 7, 9];
    for (const d of r.reportDeltas) {
      if (approvedGens.includes(d.gen)) assert(d.delta === 0, `gen ${d.gen} (approved) report.md delta ${d.delta}`);
      assert(d.delta >= 0 && d.delta < SIZE_ALLOWANCE_CHARS, `gen ${d.gen} report.md delta ${d.delta} not covered by the ${SIZE_ALLOWANCE_CHARS} allowance`);
    }
    // Gen 5 was the natural near-limit case (49,918). Group 3a (ad77a501) took its view to 45,773, so it now tests the
    // OTHER direction (well inside: counted publishable), and the near-limit case is PLANTED (2026-10-12, group 4 lab P0):
    // gen 5 padded inside *Program scope* (a section the program view keeps) to land 250 under the limit.
    const snap = loadSnapshot('cmv039qyi00n0yxlrujybxow1');
    const g5Text = parsedResult(snap.author)!.finalResponse;
    const g5In = nodeInputs(snap, readOwnerMap(REQ, 'owner-maps/log-archive-namespace-write-2026-10-09.answers.json'));
    useCheckDataAt(PRE_Z49);
    let g5: ReturnType<typeof scoreText>; let near: ReturnType<typeof scoreText>;
    try {
      g5 = scoreText(g5Text, g5In);
      const anchor = '## Program scope\n';
      assert(g5Text.split(anchor).length === 2, 'gen 5 has no unique Program scope heading to pad under');
      const pad = (n: number) => g5Text.replace(anchor, anchor + 'x'.repeat(n) + '\n\n');
      const probe = scoreText(pad(1000), g5In);
      near = scoreText(pad(1000 + (g5.limit! - 250) - probe.view!), g5In);
    } finally { useCheckDataAt(null); }
    assert(g5.view === 45773 && g5.failing.length === 0 && g5.mechanicalPass && g5.sizeWithAllowance, `gen 5 (inside): ${JSON.stringify({ view: g5.view, failing: g5.failing, size: g5.sizeWithAllowance })}`);
    assert(near.view === g5.limit! - 250 && !near.failing.includes('size') && !near.sizeWithAllowance, `planted near-limit: ${JSON.stringify({ view: near.view, limit: near.limit, failing: near.failing, size: near.sizeWithAllowance })}`);
  });

  const Z49 = path.join(LAB, 'inputs', '2026-10-10-z49-request-path');
  const A21 = 'cmv0hmi8q006wyxmcyein2a3g';
  const ITEM21 = "21. The pods' requests reach the bucket through a private endpoint of the storage service (private-endpoint): the bucket sees each pod's own address in the attribute that path carries.";

  await test('Z1 node inputEdits edit a COPY (leg, Author, Reviewer descriptions once each); the cache is untouched; bad edits fail loud', () => {
    const before = sha256(fs.readFileSync(snapshotPath(A21), 'utf8'));
    const orig = loadSnapshot(A21);
    const { snap, report } = snapshotWithInputEdits(Z49, { id: 'A21', inputEdits: 'node-inputs/item-21-request-path.json' }, orig);
    for (const [what, t] of [['leg', snap.leg!.description], ['author', snap.author.task.description], ['reviewer', snap.reviewer!.task.description]] as const) {
      assert(String(t).split(ITEM21).length - 1 === 1, `${what}: item 21 not present exactly once`);
    }
    assert(!String(orig.leg!.description).includes(ITEM21) && !String(orig.author.task.description).includes(ITEM21), 'the original snapshot object was mutated');
    assert(Object.keys(report!.targets).length === 3, `targets ${JSON.stringify(report)}`);
    assert(sha256(fs.readFileSync(snapshotPath(A21), 'utf8')) === before, 'the cached snapshot file changed');
    const tmp = path.join(out, 'z1'); fs.mkdirSync(tmp, { recursive: true });
    const bad = (spec: any) => { fs.writeFileSync(path.join(tmp, 'e.json'), JSON.stringify(spec)); try { snapshotWithInputEdits(tmp, { id: 'X', inputEdits: 'e.json' }, orig); return false; } catch { return true; } };
    assert(bad({ id: 'u', appliesTo: ['task:prompt'], ops: [{ type: 'replace', old: 'x', new: 'y' }] }), 'an unknown target was accepted');
    assert(bad({ id: 'a', appliesTo: ['author-task:description'], ops: [{ type: 'replace', old: 'the', new: 'THE' }] }), 'a non-unique anchor was accepted');
    assert(bad({ id: 'm', appliesTo: ['leg:description'], ops: [{ type: 'replace', old: 'NO-SUCH-ANCHOR', new: 'y' }] }), 'a missing anchor was accepted');
  });

  await test('Z2 requirementsCheckAt installs a commit\'s check data on the live module and restores HEAD\'s', () => {
    const text = parsedResult(loadSnapshot(A21).author)!.finalResponse;
    const stamp = () => computeRequirementsFormCheckStamp({ text, stopReason: 'end_turn', textSource: 'loop', inputs: { objective: 'x', objectiveResolved: true, harnessTaskId: null, ownerMap: null, ownerMapState: 'absent' } as any }) as any;
    const head = stamp();
    const pre = useCheckDataAt('452dfe15a547a2f88bbcc0a0529cd9f7e20f3b26');
    let old: any;
    try { old = stamp(); } finally { useCheckDataAt(null); }
    const back = stamp();
    assert(pre.registrySha256.startsWith('7a896d1ddc4c') && old.registrySha256 === pre.registrySha256, `pre-Z49 stamp sha ${old?.registrySha256}`);
    assert(head.registrySha256 === back.registrySha256 && head.registrySha256 !== old.registrySha256, 'HEAD data not restored');
    const rp = (f: any) => f.coverage.errors.filter((e: any) => e.key === 'request-path').length;
    assert(rp(head) === 2 && rp(old) === 0, `request-path findings HEAD ${rp(head)} / pre-Z49 ${rp(old)} (expected 2 / 0)`);
  });

  await test('Z3 the Z49 scorer reads the persisted Z49 failure and every planted control as pre-registered', () => {
    const r = z49SelfTest(Z49);
    assert(r.rows.length >= 9, `${r.rows.length} cases`);
    assert(r.mismatches.length === 0, r.mismatches.join('; '));
  });

  await test('Z5 the Z49 scorer reads an HCL jsonencode exemplar (L10 measure fault: A21/z49/sample-03 read parse:none)', () => {
    const hcl = ['- Exemplar:', '', '```hcl', 'resource "aws_s3_bucket_policy" "<NAME>" {', '  policy = jsonencode({',
      '    Statement = [', '      {', '        Sid       = "<ALLOW_SID>"', '        Effect    = "Allow"', '        Action    = "s3:GetObject"',
      '        Condition = {', '          IpAddress = { "aws:VpcSourceIp" = [<HOST LIST>] }', '        }', '      },', '      {',
      '        Sid       = "<DENY_SID>"', '        Effect    = "Deny"', '        Condition = {',
      '          NotIpAddress = { "aws:VpcSourceIp" = [<HOST LIST>] }', '        }', '      }', '    ]', '  })', '}', '```', ''].join('\n');
    const st = parseStanza(hcl);
    assert(st.parse === 'hcl' && st.blocks === 1, JSON.stringify(st));
    assert(JSON.stringify(st.statements) === JSON.stringify([{ effect: 'Allow', keys: ['aws:VpcSourceIp'] }, { effect: 'Deny', keys: ['aws:VpcSourceIp'] }]), JSON.stringify(st.statements));
    const json = '```json\n{ "Effect": "Allow", "Condition": { "IpAddress": { "aws:SourceIp": ["x"] } } }\n```';
    assert(parseStanza(json).parse === 'json' && parseStanza(json).statements[0].keys[0] === 'aws:SourceIp', 'JSON path unchanged');
  });

  await test('Z4 protocol-history renders embedded seed-data AT the commit (1.8.0 at 452dfe15 == the pinned production row)', () => {
    const pre = protocolTextAtCommit('requirements-authoring-protocol', '452dfe15a547a2f88bbcc0a0529cd9f7e20f3b26');
    const z = protocolTextAtCommit('requirements-authoring-protocol', '0bcbfd7f5ce46d1b9c05692ab629064aaf1175b4');
    assert(pre.version === '1.8.0' && z.version === '1.9.0', `versions ${pre.version} / ${z.version}`);
    assert(sha256(pre.text) === '9f4623569e6f154e0636cff827b77429e41fd483e4f4931e8a7b3ae850a5ea25', 'the 1.8.0 render is not the production row pinned 2026-10-09');
    assert(!pre.text.includes('.request-path |') && z.text.includes('{{LEG_TOKEN}}.request-path |'), 'the skeleton row is not keyed to the commit');
  });

  // ───────────── group 4 lab (2026-10-12, inputs/2026-10-12-g4-registry) ─────────────
  const G4 = path.join(LAB, 'inputs', '2026-10-12-g4-registry');
  const LA = 'cmv261gws00byyx0r0np06hg3';
  const ITEM22 = "22. The bucket's own policy is the only part that governs reads; the restriction covers all of it.";

  await test('GR1 an edit op may name a SUBSET of its spec\'s targets; an op naming a target outside the spec fails; absent = every target', () => {
    const spec = { id: 's', appliesTo: ['a', 'b'], ops: [{ type: 'replace' as const, old: 'x', new: 'X', appliesTo: ['a'] }, { type: 'replace' as const, old: 'y', new: 'Y', appliesTo: ['b'] }] };
    assert(applyEdits('x y', [spec], 'a').text === 'X y' && applyEdits('x y', [spec], 'b').text === 'x Y', 'per-op targets not honoured');
    assert(applyEdits('x', [{ id: 'p', appliesTo: ['a'], ops: [{ type: 'replace', old: 'x', new: 'X' }] }], 'a').text === 'X', 'an op without appliesTo changed behaviour');
    let threw = false;
    try { applyEdits('x', [{ id: 'q', appliesTo: ['a'], ops: [{ type: 'replace', old: 'x', new: 'X', appliesTo: ['c'] }] }], 'a'); } catch (e) { threw = /does not apply to/.test((e as Error).message); }
    assert(threw, 'an op naming a target outside its spec was accepted');
  });

  await test('GR2 item 22 reaches LA\'s objective, Author brief and Reviewer brief exactly once (the Reviewer copy by its own anchor); TZ/TA carry none', () => {
    const exp = JSON.parse(fs.readFileSync(path.join(G4, 'experiment.json'), 'utf8'));
    const nd = exp.nodes.find((x: any) => x.id === 'LA');
    const { snap, report } = snapshotWithInputEdits(G4, nd, loadSnapshot(LA, { reviewerExecutionId: nd.reviewerExecutionId }));
    for (const [what, t] of [['leg', snap.leg!.description], ['author', snap.author.task.description], ['reviewer', snap.reviewer!.task.description]] as const) {
      assert(String(t).split(ITEM22).length - 1 === 1, `${what}: item 22 not present exactly once`);
    }
    assert(Object.keys(report!.targets).length === 3, `targets ${JSON.stringify(report)}`);
    for (const id of ['TZ', 'TA']) {
      const n = exp.nodes.find((x: any) => x.id === id);
      assert(!n.inputEdits && !String(loadSnapshot(n.authorExecutionId).leg!.description).includes(ITEM22), `${id} carries item 22`);
    }
  });

  await test('GR3 the g4 scorer reads every persisted and planted case as pre-registered — or, outside G\'s tree, refuses loudly', () => {
    let hasG = true;
    try { requireG4Classifier(); } catch (e) { hasG = false; assert(/needs the group 4 coverage classifier/.test((e as Error).message), (e as Error).message); }
    if (!hasG) return;   // the base tree (release code): scoring there would read every G-ITEM proxy 0 by construction
    if (!fs.existsSync(path.join(LAB, 'cache', 'g4-sealed', 'expect.json'))) throw new Error('sealed file absent — P9/P11 cannot run in this checkout');
    const r = g4SelfTest(G4);
    assert(r.rows.length >= 25 && r.mismatches.length === 0, r.mismatches.join('; '));
  });

  await test('GR4 nByVariant: a node runs n per variant (base TZ 1 beside g4 TZ 3) in the dry-run plan', () => {
    const tmp = path.join(out, 'g4-n'); fs.cpSync(G4, tmp, { recursive: true });
    const e = JSON.parse(fs.readFileSync(path.join(tmp, 'experiment.json'), 'utf8'));
    e.nodes = e.nodes.filter((x: any) => x.id === 'TZ'); e.variants.base.requirementsCheckAt = null; e.variants.g4.requirementsCheckAt = null;
    fs.writeFileSync(path.join(tmp, 'experiment.json'), JSON.stringify(e, null, 2));
    const log = String(runLab(['run', '--experiment', tmp, '--out', path.join(out, 'g4-n-dry')]));
    assert(/TZ\s+base\s+.* 1× ≈/.test(log) && /TZ\s+g4\s+.* 3× ≈/.test(log), `estimate rows: ${log.split('\n').filter((l) => /^\s+TZ\s/.test(l)).join(' | ')}`);
  });

  // ── RECORDED TOOLS + harvester nodes (2026-10-13) ──
  const OBSQ = path.join(LAB, 'inputs', '2026-10-13-obs-quote-consumer');
  const H_NODES = ['H-R2', 'H-R1', 'H-CLEAN', 'H-PROM', 'H-PROMC'];
  await test('RT1 recorded tools: a replay of each harvester node\'s production calls is served the stored bytes; facts and score = persisted', () => {
    const dir = path.join(out, 'obsq-fake');
    runLab(['run', '--experiment', OBSQ, '--out', dir, '--fake-llm', 'persisted', '--n', '1', '--only', H_NODES.join(','), '--concurrency', '2']);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    let samples = 0;
    for (const id of H_NODES) {
      const nr = m.nodes[id];
      assert(nr.controls.quoteFidelityComputes === true, `${id}: quoteFidelity does not compute on the persisted harvest`);
      for (const v of Object.keys(nr.variants)) {
        const sm = JSON.parse(fs.readFileSync(path.join(dir, id, v, 'sample-01', 'sample.json'), 'utf8'));
        assert(!sm.error, `${id}/${v}: ${sm.error}`);
        const b = sm.servedBytes; const rt = sm.recordedTools;
        assert(rt.calls === nr.record.calls && (rt.tiers.exact ?? 0) === nr.record.calls && sm.valid === true, `${id}/${v}: not every production call served exactly (${JSON.stringify(rt.tiers)})`);
        assert(b.served === nr.record.calls && b.identical === b.served, `${id}/${v}: served bytes differ from stored (${JSON.stringify(b)})`);
        // Every R9/LLM-cap mismatch must be on a NON-file call (the stored scrape_page record is 72 chars shorter than the
        // content production's model was shown — a stored-record gap, LAB-PREREG-OBS.md §1.4); file calls must match.
        assert(b.mismatches.every((x: string) => /stored (\d+)/.test(x) && !/get_(ingress|otel|prometheus)_config/.test(JSON.stringify(storedCallsOf(loadSnapshot(nr.authorExecutionId).author)[Number(x.match(/stored (\d+)/)![1])].args))),
          `${id}/${v}: a FILE-tool call's R9/LLM-cap facts differ: ${b.mismatches.join('; ')}`);
        assert(sm.quoteFidelity.reason === nr.persistedQuoteFidelity.reason && JSON.stringify(sm.quoteFidelity.blocks) === JSON.stringify(nr.persistedQuoteFidelity.blocks), `${id}/${v}: replayed quoteFidelity ≠ persisted recompute`);
        const strip = ({ blocks, ...rest }: any) => rest;
        assert(JSON.stringify(strip(sm.quoteScore)) === JSON.stringify(strip(nr.persistedQuoteScore)), `${id}/${v}: quote score ≠ persisted`);
        samples++;
      }
    }
    assert(samples === 8, `expected 8 harvester samples (5 hobs19 + 3 hbase), got ${samples}`);
  });

  await test('RT2 recorded-tool matching tiers both directions; truncated/never-recorded reads unserved; failures replay; validity at 90%', async () => {
    const svc = (tool: string, args: unknown, target = 'obs') => ({ action: 'call', targetService: target, tool, arguments: args });
    const stored: StoredCall[] = [
      { index: 0, tool: 'services', server: 's', args: svc('get_ingress_config', '{}'), result: { r: 'ingress' }, error: null, success: true, truncatedAtPersist: false },
      { index: 1, tool: 'services', server: 's', args: svc('query_metric', '{"query":"up"}'), result: { r: 'up' }, error: null, success: true, truncatedAtPersist: false },
      { index: 2, tool: 'registry', server: 's', args: { action: 'register', name: 'obs', description: 'as production worded it' }, result: { r: 'registered' }, error: null, success: true, truncatedAtPersist: false },
      { index: 3, tool: 'services', server: 's', args: svc('get_otel_config', '{}'), result: { truncated: true, preview: '{"a"' }, error: null, success: true, truncatedAtPersist: true },
      { index: 4, tool: 'services', server: 's', args: svc('stack_health', '{}'), result: null, error: 'boom', success: false, truncatedAtPersist: false },
      { index: 5, tool: 'project', server: 's', args: { povId: 'p', action: 'pov.details' }, result: { r: 'pov' }, error: null, success: true, truncatedAtPersist: false },
    ];
    const srv = createRecordedToolServer(stored, TOOL_STUB_RESULT);
    const got = async (tool: string, args: unknown) => srv.executeToolOnServer('s', tool, args);
    assert(JSON.stringify(await got('project', { action: 'pov.details', povId: 'p' })) === '{"r":"pov"}', 'key order not served (canonical)');
    assert(JSON.stringify(await got('services', svc('get_ingress_config', {}, 'obs-2'))) === '{"r":"ingress"}', 'object {} under another targetService not served (services-tool)');
    assert(JSON.stringify(await got('services', svc('get_ingress_config', '{}'))) === '{"r":"ingress"}', 'a re-read not served (repeat)');
    assert(await got('services', svc('query_metric', '{"query":"rate(x[5m])"}')) === TOOL_STUB_RESULT, 'a DIFFERENT query was served another read\'s bytes');
    assert(JSON.stringify(await got('registry', { action: 'register', name: 'obs', description: 'worded differently' })) === '{"r":"registered"}', 'reworded platform call not served (same-action)');
    assert(await got('services', svc('get_otel_config', '{}')) === TOOL_STUB_RESULT, 'a persist-truncated result was served');
    assert(await got('services', svc('get_prometheus_config', '{}')) === TOOL_STUB_RESULT, 'a never-recorded file read was served');
    let threw = false; try { await got('services', svc('stack_health', {})); } catch (e) { threw = (e as Error).message === 'boom'; }
    assert(threw, 'a stored failure did not replay as a throw of its error');
    const tiers = srv.log.map((e) => e.tier).join(',');
    assert(tiers === 'canonical,services-tool,repeat,unserved,same-action,unserved-truncated,unserved,canonical', `tiers ${tiers}`);
    const rep = recordedToolsReport(srv.log, stored);
    assert(rep.fileCalls === 4 && rep.fileServed === 2 && rep.valid === false, `validity ${JSON.stringify({ f: rep.fileCalls, s: rep.fileServed, v: rep.valid })}`);
    assert(recordedToolsReport([], stored).valid === true && recordedToolsReport([], stored).fileServedRate === null, 'no file call must be valid vacuously, rate null');
    const nine = Array.from({ length: 10 }, (_, k) => ({ tool: 'services', action: 'call', innerTool: 'get_otel_config', fileTool: true, tier: (k < 9 ? 'exact' : 'unserved') as any, storedIndex: null }));
    assert(recordedToolsReport(nine, stored).valid === true && recordedToolsReport(nine.slice(1), stored).valid === false, '90% boundary');
  });

  await test('RT3 the candidate reaches every hobs19/obs19 prompt verbatim (each op once) and no baseline prompt', () => {
    const dir = path.join(out, 'obsq-dry');
    runLab(['run', '--experiment', OBSQ, '--out', dir]);
    const spec = JSON.parse(fs.readFileSync(path.join(OBSQ, 'edits', 'obs-1.9.0.json'), 'utf8'));
    const news = spec.ops.map((o: any) => (o.new.startsWith(o.old) ? o.new.slice(o.old.length) : o.new));
    let prompts = 0;
    for (const id of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())) {
      for (const v of fs.readdirSync(path.join(dir, id)).filter((d) => fs.statSync(path.join(dir, id, d)).isDirectory())) {
        const sys = fs.readFileSync(path.join(dir, id, v, 'author.system.md'), 'utf8');
        const cand = v === 'hobs19' || v === 'obs19';
        for (const t of news) assert((sys.split(t).length - 1) === (cand ? 1 : 0), `${id}/${v}: candidate piece ${cand ? 'not exactly once' : 'present in a baseline prompt'}: ${t.slice(0, 50)}`);
        if (fs.existsSync(path.join(dir, id, v, 'reviewer.system.md'))) {
          const rs = fs.readFileSync(path.join(dir, id, v, 'reviewer.system.md'), 'utf8');
          for (const t of news) assert((rs.split(t).length - 1) === (cand ? 1 : 0), `${id}/${v} reviewer: candidate piece count wrong`);
        }
        prompts++;
      }
    }
    assert(prompts === 13, `expected 13 node×variant prompt sets, got ${prompts}`);
  });

  await test('QS1 quote score: DRAFT-C §1 on the persisted harvests; the unlabelled-cut blind spot read strictly; a marked excerpt and a byte-for-byte quote read faithful', () => {
    const r2 = parsedResult(loadSnapshot('cmv5t9ivv008oyxghtb0epzmr').author)!;
    const q2 = scoreHarvesterQuotes(r2.finalResponse, r2.toolCalls);
    const strictOf = (q: any, l: number) => q.blocks.find((b: any) => b.blockLine === l)?.strict;
    assert(q2.fileBlocks === 3 && !q2.faithful && q2.addedInVerbatimFile === 1 && q2.editedLines === 0, `H-R2 ${JSON.stringify({ ...q2, blocks: undefined })}`);
    assert(strictOf(q2, 7)?.omittedComment === 1 && strictOf(q2, 7)?.added === 1 && strictOf(q2, 20)?.adjacentComment === 10 && strictOf(q2, 20)?.changed === 1 && strictOf(q2, 50)?.adjacentComment === 5, 'H-R2 per-block findings ≠ DRAFT-C §1.1');
    const r1 = parsedResult(loadSnapshot('cmv4x8h1q00a4yx9lf6mj9yh2').author)!;
    const q1 = scoreHarvesterQuotes(r1.finalResponse, r1.toolCalls);
    assert(q1.editedLines === 1 && q1.fileBlocksStrictClean === 1 && !q1.faithful, `H-R1 ${JSON.stringify({ ...q1, blocks: undefined })}`);
    const rc = parsedResult(loadSnapshot('cmundq5om00eayx7o6hm6ywob').author)!;
    assert(scoreHarvesterQuotes(rc.finalResponse, rc.toolCalls).faithful, 'H-CLEAN not faithful');
    // The blind spot: the same quotes with the claim word swapped out read clean to the shipping fact, never to the score.
    const unl = r2.finalResponse.split('\n').map((l: string) => l.replace(new RegExp(VERBATIM_CLAIM_RE.source, 'gi'), 'excerpt')).join('\n');
    const shipped: any = computeQuoteFidelity({ point: 'harvest', deliverable: unl, toolCalls: r2.toolCalls });
    assert(shipped.reason === 'all-quotes-complete' && !scoreHarvesterQuotes(unl, r2.toolCalls).faithful, `blind spot: shipping ${shipped.reason}`);
    // Compliant forms, built from the RAW file the tool returned.
    const raw: string = r2.toolCalls[4].result.content[0].data.result.structuredContent.files['otlp-ingress.conf'];
    const lines = raw.split('\n');
    const whole = `As-deployed otlp-ingress.conf, byte for byte:\n\n\`\`\`nginx\n${raw.replace(/\n$/, '')}\n\`\`\`\n`;
    const excerpt = `Excerpt of otlp-ingress.conf (header left out):\n\n\`\`\`nginx\n# [elided: the 10-line header comment]\n${lines.slice(10).join('\n').replace(/\n$/, '')}\n\`\`\`\n`;
    const silent = `Excerpt of otlp-ingress.conf:\n\n\`\`\`nginx\n${lines.slice(10).join('\n').replace(/\n$/, '')}\n\`\`\`\n`;
    for (const [name, doc, want] of [['whole file', whole, true], ['marked excerpt', excerpt, true], ['silent unlabelled cut', silent, false]] as const) {
      const q = scoreHarvesterQuotes(doc, r2.toolCalls);
      assert(q.fileBlocks === 1 && q.faithful === want, `${name}: faithful ${q.faithful}, want ${want} (${JSON.stringify(q.blocks)})`);
    }
    assert((computeQuoteFidelity({ point: 'harvest', deliverable: silent, toolCalls: r2.toolCalls }) as any).reason === 'all-quotes-complete', 'the silent cut should read clean to the shipping fact (the blind spot this score exists for)');
  });

  fs.rmSync(out, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
