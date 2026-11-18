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
 *             registrySha256 follows it) and `installCheckDataAt(null)` restores HEAD's;
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
import { installCheckDataAt } from './leg-replay-lab/check-at';
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
import { objectiveOfRecordSource, createObjectiveToolServer } from './leg-replay-lab/objective-of-record';

const LAB = path.join(__dirname, 'leg-replay-lab');
/** origin/main before Z49 (0bcbfd7f added the request-path registry row): the in-run check data of the 2026-10-09 drafts. */
const PRE_Z49 = '452dfe15a547a2f88bbcc0a0529cd9f7e20f3b26';
const EXP = path.join(LAB, 'inputs', '2026-10-07-gaps-1-3');
let pass = 0; let fail = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  // LAB_TEST_ONLY=<regex> runs the matching tests only (a developer filter; the full suite is the gate).
  if (process.env.LAB_TEST_ONLY && !new RegExp(process.env.LAB_TEST_ONLY).test(name)) return;
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
    installCheckDataAt(PRE_Z49);
    let shipping: string;
    try {
      shipping = buildRequirementsCorrectionPrompt(computeRequirementsFormCheckStamp({ text: n7Text, stopReason: 'end_turn', textSource: 'loop', inputs: n7In }) as any,
        analyzeRequirementsForm({ draft: n7Text, objective: n7In.objective, ownerRowItemMapParsed: n7In.ownerMap } as any));
    } finally { installCheckDataAt(null); }
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
    installCheckDataAt(PRE_Z49);
    let g5: ReturnType<typeof scoreText>; let near: ReturnType<typeof scoreText>;
    try {
      g5 = scoreText(g5Text, g5In);
      const anchor = '## Program scope\n';
      assert(g5Text.split(anchor).length === 2, 'gen 5 has no unique Program scope heading to pad under');
      const pad = (n: number) => g5Text.replace(anchor, anchor + 'x'.repeat(n) + '\n\n');
      const probe = scoreText(pad(1000), g5In);
      near = scoreText(pad(1000 + (g5.limit! - 250) - probe.view!), g5In);
    } finally { installCheckDataAt(null); }
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
    const pre = installCheckDataAt('452dfe15a547a2f88bbcc0a0529cd9f7e20f3b26');
    let old: any;
    try { old = stamp(); } finally { installCheckDataAt(null); }
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

  await test('QS1 quote score: DRAFT-C §1 on the persisted harvests; an excerpt-labelled cut is caught by the shipping fact since quoteFidelity v6; the UNLABELLED cut is read strictly by the score only; a marked excerpt and a byte-for-byte quote read faithful', () => {
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
    // QUOTE-FIDELITY-EXCERPT-BLIND (closed in quoteFidelity v6, 2026-10-31): the same quotes with the claim word swapped for
    // "excerpt" used to read clean to the shipping fact while the score flagged them. v6 reads an excerpt-labelled FILE-lane
    // block strictly, so the shipping fact and the score now agree.
    const unl = r2.finalResponse.split('\n').map((l: string) => l.replace(new RegExp(VERBATIM_CLAIM_RE.source, 'gi'), 'excerpt')).join('\n');
    const shipped: any = computeQuoteFidelity({ point: 'harvest', deliverable: unl, toolCalls: r2.toolCalls });
    assert(shipped.reason === 'quote-omits-or-changes-lines' && !scoreHarvesterQuotes(unl, r2.toolCalls).faithful, `v6 excerpt read: shipping ${shipped.reason}`);
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
    // v6: the "Excerpt of …" silent cut is now a shipping finding; a genuinely UNLABELLED silent cut keeps the free-narrowing
    // rule in the shipping fact (by design) and is caught only by the strict score — the gap this score still exists for.
    assert((computeQuoteFidelity({ point: 'harvest', deliverable: silent, toolCalls: r2.toolCalls }) as any).reason === 'quote-omits-or-changes-lines', 'v6: an excerpt-labelled silent cut is a shipping finding');
    const unlabelledSilent = `otlp-ingress.conf:\n\n\`\`\`nginx\n${lines.slice(10).join('\n').replace(/\n$/, '')}\n\`\`\`\n`;
    assert((computeQuoteFidelity({ point: 'harvest', deliverable: unlabelledSilent, toolCalls: r2.toolCalls }) as any).reason === 'all-quotes-complete', 'an UNLABELLED silent cut still reads clean to the shipping fact (free narrowing)');
    assert(!scoreHarvesterQuotes(unlabelledSilent, r2.toolCalls).faithful, 'the strict score still flags the unlabelled silent cut');
  });

  // ── PLATFORM-HELD-BYTES Stage B, G1 lab capabilities (STAGE-B-PLAN §4; model-evaluation lane §1.3) ─────────────────────
  const G1 = path.join(LAB, 'inputs', '2026-10-15-held-bytes-g1');
  const AR3 = 'cmv6bn32g004vyxwtbg6e177c';
  await test('HB1 L-1: the frozen Harvester\'s stored tool calls → the shipping capture + view; a persist-truncated file leaf is refused BY NAME', async () => {
    const { buildLabHeldStore, buildLabHeldStoreFromResult, labHeldViewFields, frozenHarvesterEntry } = await import('./leg-replay-lab/held-store');
    const { buildView } = await import('../lib/agents/harness/held-bytes/view');
    const snap = loadSnapshot(AR3);
    const store = buildLabHeldStore(snap);
    assert(store.harvesterExecutionId === frozenHarvesterEntry(snap).executionId && store.refs.length === 3 && store.refusals.length === 0, `store ${store.refs.length}/${store.refusals.length}`);
    const f = await labHeldViewFields(store);
    const items = f.heldView as any[];
    assert(items.map((i) => i.handle).join() === 'H1,H2,H3' && items.every((i) => typeof i.viewText === 'string' && !i.state), 'three rendered handles');
    for (const it of items) { const r = store.refs.find((x) => x.id === it.refId)!; const v = buildView(r.content, it.r9Version); assert(v.ok && v.viewText === it.viewText, `${it.handle} view = shipping buildView`); }
    const art = snap.childArtifacts.find((x) => x.executionId === store.harvesterExecutionId && x.name === 'result.json')!;
    const rj = JSON.parse(art.content); const k = rj.toolCalls.findIndex((t: any) => /get_ingress_config/.test(JSON.stringify(t.arguments ?? '')));
    assert(k >= 0, 'an ingress call to cut');
    rj.toolCalls[k] = { ...rj.toolCalls[k], result: { truncated: true, preview: 'x' } };
    let msg = ''; try { buildLabHeldStoreFromResult({ executionId: 'x', taskId: 'y', povId: 'z', resultJson: JSON.stringify(rj) }); } catch (e) { msg = (e as Error).message; }
    assert(/L-1 refused: .* truncated at persist \(calls \d+\)/.test(msg), msg || 'no refusal');
  });

  await test('HB2 L-2: the variant text = the seed render at the build commit; refused when that commit\'s obs base is not the pinned baseline; the binding renames both templates', async () => {
    const { heldVariantProtocolAt, snapshotWithVariantBinding } = await import('./leg-replay-lab/variant-binding');
    const exp = JSON.parse(fs.readFileSync(path.join(G1, 'experiment.json'), 'utf8'));
    const b = exp.baseline.protocols['observability-config-protocol'];
    const base = { text: fs.readFileSync(path.join(G1, b.file), 'utf8'), version: b.version };
    const src = exp.variants.hb.protocolSource as string;
    const t = heldVariantProtocolAt('observability-config-held-protocol', src, base);
    assert(t.text === protocolTextAtCommit('observability-config-held-protocol', src.slice('commit:'.length)).text && /\+obs\.1\.9\.0\.655a75db$/.test(t.version ?? ''), `variant ${t.version}`);
    let msg = ''; try { heldVariantProtocolAt('observability-config-held-protocol', src, { ...base, text: base.text + ' ' }); } catch (e) { msg = (e as Error).message; }
    assert(/is not the pinned baseline/.test(msg), msg || 'not refused');
    const r = snapshotWithVariantBinding(loadSnapshot(AR3), 'observability-config-held-protocol');
    // Phase 10 panel D4: the leaves still bind the held templates (the measured text); the LEG binds the held-capable obs name.
    assert(r.report.templates.map((x) => x.to).join() === 'Observability Held Config Rollback Author,Observability Held Change Reviewer' && /\(protocol: observability-config\)/.test(r.report.legTitle ?? '') && r.report.legProtocol === 'observability-config-protocol', JSON.stringify(r.report));
    assert(loadSnapshot(AR3).leg!.metadata.protocol === 'observability-config-protocol', 'the cached snapshot was mutated');
  });

  await test('HB3 L-3: the hb Author prompt differs from base by EXACTLY the held blocks and the variant constraint line', async () => {
    const dir = path.join(out, 'g1-dry');
    runLab(['run', '--experiment', G1, '--out', dir, '--only', 'A-R3']);
    const rd = (v: string, f: string) => fs.readFileSync(path.join(dir, 'A-R3', v, f), 'utf8').split('\n');
    const bu = rd('base', 'author.user.md'), hu = rd('hb', 'author.user.md');
    const removed = bu.filter((l) => !hu.includes(l));
    assert(removed.length === 0, `base lines missing from hb: ${removed.slice(0, 3).join(' | ')}`);
    const added = hu.filter((l) => !bu.includes(l));
    const heldBlock = hu.slice(hu.findIndex((l) => l.startsWith('### Held file H1')));
    const unexplained = added.filter((l) => !heldBlock.includes(l) && !l.startsWith('• **Held Files: Edits Only:**'));
    assert(unexplained.length === 0, `unexplained hb lines: ${unexplained.slice(0, 3).join(' | ')}`);
    assert(hu.filter((l) => /^### Held file H\d/.test(l)).length === 3, 'three held blocks');
  });

  await test('HB4 L-6 fixtures through the LIVE path ($0): correct edits apply (restore-is-held-base); a bare non-unique SEARCH is refused then CORRECTED and adopted; a whole-file retype is REFUSED (held-file-written-whole, Phase 10 W3)', () => {
    const run = (fx: string) => {
      const dir = path.join(out, `fx-${fx}`);
      runLab(['run', '--experiment', G1, '--out', dir, '--only', 'A-R3', '--variants', 'hb', '--n', '1', '--fake-llm', `fixture:${path.join(G1, 'fixtures', fx)}`]);
      return { s: JSON.parse(fs.readFileSync(path.join(dir, 'A-R3', 'hb', 'sample-01', 'sample.json'), 'utf8')), e: JSON.parse(fs.readFileSync(path.join(dir, 'A-R3', 'hb', 'sample-01', 'editApplication.json'), 'utf8')) };
    };
    const c = run('correct');
    assert(c.e.fact.state === 'applied' && c.e.fact.applied === 2 && /restore-is-held-base/.test(c.s.leafFacts.rollbackContainment) && c.e.fact.refWrite === 'lab-not-written', `correct ${JSON.stringify(c.e.fact).slice(0, 200)}`);
    const n = run('nonunique');
    assert(n.e.correction.attempted === true && n.e.correction.adopted === true && n.e.fact.state === 'applied' && n.e.fact.textSource === 'edit-correction' && n.e.correction.refusedBefore === 1, `nonunique ${JSON.stringify(n.e.correction)}`);
    const r = run('retype');
    // Phase 10 W3: the retype writes H2 whole — the applier refuses it (was `no-edits`, which is now the carrier's out-of-scope state).
    assert(r.e.fact.state === 'refused' && r.e.fact.refused?.['held-file-written-whole'] === 1 && /no-restore-blocks/.test(r.s.leafFacts.rollbackContainment), `retype ${r.e.fact.state} ${JSON.stringify(r.e.fact.refused)}`);
  });

  await test('HB6 L-5 scorer self-test, both directions (correct / corrected / SG-WIN retype / planted collateral) + the post-run digest check', () => {
    const scored: Record<string, any> = {};
    for (const fx of ['correct', 'nonunique', 'retype', 'collateral']) {
      const dir = path.join(out, `sc-${fx}`);
      runLab(['run', '--experiment', G1, '--out', dir, '--only', 'A-R3', '--variants', 'hb', '--n', '1', '--fake-llm', `fixture:${path.join(G1, 'fixtures', fx)}`]);
      runLab(['edits-score', '--run', dir, '--experiment', G1]);
      scored[fx] = JSON.parse(fs.readFileSync(path.join(dir, 'g1-scores.json'), 'utf8'))[0].samples[0];
    }
    const c = scored.correct, n = scored.nonunique, r = scored.retype, k = scored.collateral;
    assert(c.correct && c.state === 'applied' && !c.change.outOfScope.length && c.digestReproduces === true, `correct ${JSON.stringify(c).slice(0, 200)}`);
    assert(n.correct && n.correctionAdopted === true && n.digestReproduces === true, `nonunique ${JSON.stringify(n).slice(0, 200)}`);
    assert(!r.correct && r.state === 'refused' && r.sgWin.join() === 'H2', `retype SG-WIN ${JSON.stringify(r.sgWin)} state ${r.state}`); // Phase 10 W3: refused, SG-WIN unchanged
    assert(!k.correct && k.state === 'applied' && k.change.outOfScope.some((o: any) => /client_max_body_size 64m/.test(o.line)), `collateral ${JSON.stringify(k.change)}`);
  });

  await test('HB7 L-8 / L-8b Architect cells: the held arm sees exactly the handle index (no file text); ARCH-QUOTE / ARCH-HANDLE read the legacy output as quoting + no handle, and a well-formed variant output as clean + named', async () => {
    const dir = path.join(out, 'x-fake');
    runLab(['run', '--experiment', G1, '--out', dir, '--only', 'X-R3', '--n', '1', '--fake-llm', 'persisted']);
    const xb = fs.readFileSync(path.join(dir, 'X-R3', 'xbase', 'author.user.md'), 'utf8').split('\n');
    const xh = fs.readFileSync(path.join(dir, 'X-R3', 'xhb', 'author.user.md'), 'utf8').split('\n');
    const added = xh.filter((l) => !xb.includes(l)).filter((l) => l.trim());
    assert(xb.every((l) => xh.includes(l)) && added.length === 4 && added[0] === '### Held files (by handle)' && added.slice(1).every((l) => /^- H[123] — \/etc\/\S+ · \d+ lines$/.test(l)), `xhb delta: ${added.join(' | ')}`);
    const { scoreArchitect } = await import('./leg-replay-lab/score-edits');
    const legacy = scoreArchitect(path.join(dir, 'X-R3', 'xhb', 'sample-01'), path.join(dir, 'X-R3', 'xhb'));
    assert(legacy.quotes.length > 0 && !legacy.namesHandle, `legacy ${JSON.stringify(legacy)}`);
    const good = path.join(dir, 'X-R3', 'xhb', 'sample-99'); fs.mkdirSync(good, { recursive: true });
    fs.writeFileSync(path.join(good, 'author.md'), '# Design\n\nChange H2 (/etc/nginx/conf.d/otlp-ingress.conf), both OTLP server blocks: replace `allow all;` with the chained sender allow lines, then `deny all;`.\nH1 and H3 are unchanged.\n\n```text\nordering: H2 edit → nginx -t → reload\n```\n');
    const g = scoreArchitect(good, path.join(dir, 'X-R3', 'xhb'));
    assert(g.quotes.length === 0 && g.namesHandle, `good ${JSON.stringify(g)}`);
  });

  // Stage B G2 (2026-10-15). HB8/HB10 read G1's saved samples under runs/ (gitignored, local, kept until the ACTIVE-flip
  // re-assert — plan §4); without them they FAIL by name, never skip.
  const G2 = path.join(LAB, 'inputs', '2026-10-15-held-bytes-g2');
  const G1_TARGETS_RUN = path.join(LAB, 'runs', '2026-10-15T02-47-02-2026-10-15-held-bytes-g1');
  await test('HB8 L-9 lab-sample Author: every hb cell reproduces its G1 stamp, plants re-stamp PURELY (no correction), each plant is verbatim in the rendered diff, the user-prompt lever is exactly the diff block + the variant Reviewer template\'s one constraint line, 0 named states except R-STATE; a sample whose Author prompt moved is refused by name', async () => {
    assert(fs.existsSync(G1_TARGETS_RUN), `G1 run folder missing: ${G1_TARGETS_RUN} (kept locally until the ACTIVE-flip re-assert)`);
    const dir = path.join(out, 'g2-hb');
    runLab(['run', '--experiment', G2, '--variants', 'hb', '--out', dir]);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const ids = Object.keys(m.nodes);
    assert(ids.length === 9, `nodes ${ids.join()}`);
    for (const id of ids) {
      const a = m.nodes[id].variants.hb.authorSource;
      assert(a.reproducesOwnStamp.ok, `${id} does not reproduce its G1 stamp: ${a.reproducesOwnStamp.detail}`);
      assert(a.stamp.correction.attempted === false, `${id}: a correction was decided ${JSON.stringify(a.stamp.correction)}`);
      assert(a.diffMustShow.every((x: any) => x.inDiff), `${id}: plant not verbatim in the diff ${JSON.stringify(a.diffMustShow)}`);
      assert(a.leverDelta.removed.length === 0 && a.leverDelta.addedOutsideHeldBlock.length === 0, `${id}: lever delta ${JSON.stringify(a.leverDelta)}`);
      // Since e574210d7 (G3-entry decision 1) the variant Reviewer row adds exactly ONE constraint, rendered in the user prompt.
      assert(a.leverDelta.addedTemplateConstraint.length === 1 && a.leverDelta.addedTemplateConstraint[0].startsWith('• **Held Diff: Unaccounted Lines Block:** '), `${id}: template-constraint delta ${JSON.stringify(a.leverDelta.addedTemplateConstraint)}`);
      if (id === 'R-STATE') assert(a.editDiff.state === 'diff-recompute-mismatch' && a.namedStateHeadersInPrompt === 1 && a.renderedDiffHeadersInPrompt === 0, `R-STATE ${JSON.stringify(a.editDiff)}`);
      // PC-P2-1 (e574210d7): a package with no applied edit (R-NOOP, 0 edits ⇒ empty diff) is headed "no held-file edit was applied".
      // Phase 10 W5: an Author stamped no-edits is OUT OF SCOPE — the Reviewer sees "this package edits no held file", not the none-applied heading.
      else if (id === 'R-NOOP') assert(a.editDiff.state === 'rendered' && a.editDiff.diffChars === 0 && a.namedStateHeadersInPrompt === 0 && a.renderedDiffHeadersInPrompt === 0 && a.noEditAppliedHeadersInPrompt === 0 && a.noHeldEditHeadersInPrompt === 1, `R-NOOP ${JSON.stringify(a.editDiff)} ${a.noHeldEditHeadersInPrompt}`);
      else assert(a.editDiff.state === 'rendered' && a.namedStateHeadersInPrompt === 0 && a.renderedDiffHeadersInPrompt === 1 && a.noEditAppliedHeadersInPrompt === 0, `${id} ${JSON.stringify(a.editDiff)}`);
    }
    assert(['R-COLLATERAL', 'R-NEIGHBOUR', 'R-WRONG', 'R-EXTRA'].every((id) => m.nodes[id].variants.hb.authorSource.plant && m.nodes[id].variants.hb.authorSource.diffMustShow.length > 0), 'every must-refuse plant is pinned to a diff line');
    const { loadLabSample } = require('./leg-replay-lab/lab-sample');
    const src = 'lab-sample:2026-10-15T02-47-02-2026-10-15-held-bytes-g1/A-R3/hb/1';
    const sys = fs.readFileSync(path.join(G1_TARGETS_RUN, 'A-R3', 'hb', 'author.system.md'), 'utf8');
    const user = fs.readFileSync(path.join(G1_TARGETS_RUN, 'A-R3', 'hb', 'author.user.md'), 'utf8');
    const proto = m.nodes['R-CLEAN-R3'].variants.hb.protocol.sha256;
    let msg = '';
    try { loadLabSample(src, { authorExecutionId: 'cmv6bn32g004vyxwtbg6e177c', protocolSha256: proto, authorPrompt: { system: sys, user: user + ' ' } }); } catch (e) { msg = (e as Error).message; }
    assert(/Author user prompt differs/.test(msg), msg || 'a moved Author prompt was not refused');
    msg = '';
    try { loadLabSample(src, { authorExecutionId: 'cmv5te81m00akyxgh5k4qq4y3', protocolSha256: proto, authorPrompt: { system: sys, user } }); } catch (e) { msg = (e as Error).message; }
    assert(/the sample's Author execution is/.test(msg), msg || 'a sample of another Author was not refused');
    msg = '';
    try { loadLabSample('lab-sample:2026-10-15T03-32-23-2026-10-15-held-bytes-g1/A-R3/base/1', { authorExecutionId: 'cmv6bn32g004vyxwtbg6e177c', protocolSha256: proto, authorPrompt: { system: sys, user } }); } catch (e) { msg = (e as Error).message; }
    assert(/ran protocol/.test(msg), msg || 'a base-arm sample was not refused');
  });

  await test('HB9 G2 scorer self-test both directions (refusal FOR the plant / for something else / approval / unparsed / restore subcount); the mutations ignore-plant and cites-scope are caught', () => {
    const { g2SelfTest } = require('./leg-replay-lab/score-g2');
    const ok = g2SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of ['ignore-plant', 'cites-scope']) assert(!g2SelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
  });

  await test('HB10 the frozen G2 fallback edit set applies 2/2 on the run 1–3 held bases and re-stamps to the SAME candidate digest as the chosen sample (it is a correct set)', async () => {
    assert(fs.existsSync(G1_TARGETS_RUN), `G1 run folder missing: ${G1_TARGETS_RUN}`);
    const { pureStamp } = require('./leg-replay-lab/lab-sample');
    const { buildLabHeldStore, labHeldViewFields, labResolveHeldFiles } = require('./leg-replay-lab/held-store');
    const { r9VersionInEffect } = require('../lib/agents/harness/sanitize-chained-output');
    const snap = loadSnapshot('cmv6bn32g004vyxwtbg6e177c');
    const store = buildLabHeldStore(snap);
    const items = (await labHeldViewFields(store)).heldView;
    const r9 = r9VersionInEffect();
    const res = await labResolveHeldFiles(store, r9)(items, {});
    const fb = pureStamp(fs.readFileSync(path.join(G2, 'fallback', 'R-CLEAN.edits.md'), 'utf8'), res.files, res.refs, r9);
    const s1 = pureStamp(fs.readFileSync(path.join(G1_TARGETS_RUN, 'A-R3', 'hb', 'sample-01', 'author.md'), 'utf8'), res.files, res.refs, r9);
    assert(fb.fact.state === 'applied' && fb.fact.applied === 2 && fb.fact.total === 2, `fallback ${JSON.stringify(fb.fact).slice(0, 200)}`);
    assert(fb.fact.candidateDigest8 === s1.fact.candidateDigest8, `fallback ${fb.fact.candidateDigest8} vs sample ${s1.fact.candidateDigest8}`);
  });

  // Stage B G3 (2026-10-16, G3-LAB-PREREG.md). HB12 reads the same G1 sample as HB8 (runs/, gitignored, kept until the ACTIVE flip).
  await test('HB11 G3 scorer self-test both directions per reading — (a) diff-line vs scope-only, (b) remit sentence on an approval, (c) platform render vs package text, must-approve refusals citing the diff rule; the mutations ignore-plant, no-diff-rule, remit-blind, no-platform-render, pair-blind are caught', () => {
    const { g3SelfTest } = require('./leg-replay-lab/score-g3');
    const ok = g3SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of ['ignore-plant', 'no-diff-rule', 'remit-blind', 'no-platform-render', 'pair-blind']) assert(!g3SelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
  });

  await test('HB12 G3 dry run: R-PARTIAL stamps partial (1/2, search-not-found ×1) and renders the refused H1 header + ONE refusal fact line; every cell adds exactly the variant Reviewer constraint line; the reused plants are verbatim in their diffs; R-STATE keeps its named state', async () => {
    assert(fs.existsSync(G1_TARGETS_RUN), `G1 run folder missing: ${G1_TARGETS_RUN}`);
    const G3 = path.join(LAB, 'inputs', '2026-10-16-held-bytes-g3');
    const dir = path.join(out, 'g3-hb');
    runLab(['run', '--experiment', G3, '--variants', 'hb', '--out', dir]);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert(Object.keys(m.nodes).sort().join() === 'R-CLEAN-R3,R-COLLATERAL,R-NEIGHBOUR,R-PARTIAL,R-SECRET,R-STATE', `nodes ${Object.keys(m.nodes).join()}`);
    for (const id of Object.keys(m.nodes)) {
      const a = m.nodes[id].variants.hb.authorSource;
      assert(a.reproducesOwnStamp.ok && a.stamp.correction.attempted === false, `${id} stamp ${JSON.stringify(a.stamp)}`);
      assert(a.leverDelta.removed.length === 0 && a.leverDelta.addedOutsideHeldBlock.length === 0 && a.leverDelta.addedTemplateConstraint.length === 1, `${id} lever ${JSON.stringify(a.leverDelta)}`);
      assert(a.diffMustShow.every((x: any) => x.inDiff), `${id} plant not in diff`);
    }
    const p = m.nodes['R-PARTIAL'].variants.hb.authorSource;
    assert(p.stamp.state === 'partial' && p.stamp.applied === 1 && p.stamp.total === 2 && p.stamp.refusedTotal === 1, `R-PARTIAL stamp ${JSON.stringify(p.stamp)}`);
    const u = fs.readFileSync(path.join(dir, 'R-PARTIAL', 'hb', 'reviewer.user.md'), 'utf8');
    assert((u.match(/^#### H1 — \/etc\/nginx\/conf\.d\/operator-access\.conf · not applied · refused: search-not-found$/gm) ?? []).length === 1, 'R-PARTIAL refused H1 header');
    assert((u.match(/^Refused by the platform \(not applied\): `search-not-found`×1\.$/gm) ?? []).length === 1, 'R-PARTIAL refusal fact line');
    assert(m.nodes['R-STATE'].variants.hb.authorSource.editDiff.state === 'diff-recompute-mismatch', 'R-STATE named state');
  });

  await test('HB5b (pure) a pin-violation warning stops ONE chosen Harvester\'s store build, but the identity check is told and goes on (HELD-ID-CHECK-ABORTS-ON-A-PIN-VIOLATION)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildLabHeldStoreFromResult } = require('./leg-replay-lab/held-store');
    const foreign = { tool: 'services', success: true,
      arguments: { action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: { owner: 'someone', repo: 'other-repo', path: 'k8s/a.yaml' } },
      result: { content: [{ type: 'data', data: { success: true, targetService: 'github-service', tool: 'get_file_contents', arguments: { owner: 'someone', repo: 'other-repo', path: 'k8s/a.yaml' },
        metadata: { targetServiceId: 'gh' }, result: { content: [{ type: 'text', text: 'ok' }, { type: 'resource', resource: { uri: 'repo://someone/other-repo/contents/k8s/a.yaml', text: 'kind: X\n' } }] } } }] } };
    const h = { executionId: 'e1', taskId: 't1', povId: 'p1', resultJson: JSON.stringify({ toolCalls: [foreign] }), gitFileSourceLeg: true };
    let threw = '';
    try { buildLabHeldStoreFromResult(h); } catch (e) { threw = (e as Error).message; }
    assert(/L-1: prepareHeldCapture warned on e1/.test(threw) && /pinViolations/.test(threw), `no opt-in must throw: ${threw}`);
    const told: number[] = [];
    const store = buildLabHeldStoreFromResult(h, { onPinViolationWarning: (n: number) => told.push(n) });
    assert(store.refs.length === 0 && told.length === 1 && told[0] === 1, `opt-in: refs ${store.refs.length}, told ${JSON.stringify(told)}`);
    // the opt-in forgives ONLY a pin violation: the identity check wires it, and turns any other failure into a named mismatch
    const src = fs.readFileSync(path.join(__dirname, 'leg-replay-lab', 'held-store.ts'), 'utf8');
    assert(src.includes('const unexpected = warned.filter((w) => !(opts.onPinViolationWarning && isPinViolation(w)));') && src.includes('out.mismatches.push(`${r.executionId}: ${(e as Error).message.slice(0, 200)}`); continue;'), 'the check no longer names a failed rebuild and goes on');
  });

  await test('HB5 G-HOLD-ID ($0, read-only): every held Harvester in production reproduces through L-1', () => {
    // Across the 2026-11-11 pin cut no ONE pin rebuilds the whole population (the pin is not stored per execution), so the gate is the
    // both-pins form: an execution reproduces when it reproduces under the pin in force when it ran (HELD-ID-CHECK-NINE-NETWORK-LEGS-NOT-REBUILT).
    const log = execFileSync('bash', [path.join(__dirname, 'leg-replay-lab', 'held-id-check-both-pins.sh')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    assert(/✅ G-HOLD-ID holds across the pin cut/.test(log) && /under BOTH 0/.test(log), log.split('\n').filter((l) => /G-HOLD|pin |mismatch/.test(l)).join(' '));
  });

  await test('ME5 (ME-P2-5) the post-run digest check takes R9 from the RUN\'s manifest flags, never the scoring shell; a run with no recorded flags fails loud', () => {
    const se = require('./leg-replay-lab/score-edits');
    const { R9_VERSION } = require('../lib/agents/harness/sanitize-chained-output');
    const mk = (name: string, manifest: unknown) => { const d = path.join(out, `me5-${name}`); fs.mkdirSync(d, { recursive: true }); if (manifest !== undefined) fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(manifest)); return d; };
    const saved = process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED;
    try {
      process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED = 'false'; // the shell says OFF …
      assert(se.r9VersionOfRun(mk('on', { flags: { CONNECTED_OUTPUT_SANITIZE_ENABLED: 'true' } })) === R9_VERSION, 'a run made with sanitize ON must score at R9_VERSION');
      process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED = 'true'; // … and now ON
      assert(se.r9VersionOfRun(mk('off', { flags: {} })) === 'none', 'a run made with sanitize OFF must score at none');
    } finally { if (saved === undefined) delete process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED; else process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED = saved; }
    let threw = 0;
    for (const [n, m] of [['nomanifest', undefined], ['noflags', { label: 'x' }]] as const) { try { se.r9VersionOfRun(mk(n, m)); } catch { threw++; } }
    assert(threw === 2, 'a run whose R9 setting is unrecorded must throw, not default');
    const src = fs.readFileSync(path.join(__dirname, 'leg-replay-lab', 'score-edits.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export function postRunDigestCheck'), src.indexOf('export function canaryScan'));
    assert(fn.length > 0 && !/process\.env/.test(fn), 'postRunDigestCheck must not read process.env');
  });

  await test('ME6 (ME-P2-6) a planted node\'s arm either receives the plant or is NAMED unplanted; run() refuses an unannounced gap before any call', () => {
    const { plantArmGaps } = require('./leg-replay-lab/lab');
    const d = path.join(out, 'me6'); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'p.json'), JSON.stringify({ id: 'P', appliesTo: ['author:AX'], ops: [] }));
    const src: Record<string, string> = { base: 'persisted', hb: 'lab-sample:S1', live: 'live' };
    const node = (extra: Record<string, unknown> = {}) => ({ id: 'N', authorExecutionId: 'AX', authorPlant: 'p.json', variants: ['base', 'hb', 'live'], ...extra });
    const g = plantArmGaps(d, node(), (v: string) => src[v], null);
    assert(g.length === 2 && /^hb \(lab-sample:S1 not in/.test(g[0]) && /^live \(live Author/.test(g[1]), `gaps ${JSON.stringify(g)}`);
    assert(plantArmGaps(d, node({ unplantedArms: ['hb', 'live'] }), (v: string) => src[v], null).length === 0, 'named unplanted arms must pass');
    assert(plantArmGaps(d, node(), (v: string) => src[v], ['base']).length === 0, 'a persisted arm whose form the plant lists is covered; unselected arms are not checked');
    assert(plantArmGaps(d, { id: 'M', authorExecutionId: 'AX', variants: ['live'] }, () => 'live', null).length === 0, 'an unplanted node has no gaps');
    const lab = fs.readFileSync(path.join(__dirname, 'leg-replay-lab', 'lab.ts'), 'utf8');
    const i = lab.indexOf('const gaps = plantArmGaps('), j = lab.indexOf('const { jobs, nodeReports } = await prepare(exp,');
    assert(i > 0 && j > i && /if \(gaps\.length\) throw/.test(lab.slice(i, j)), 'run() must refuse a gap before prepare()');
  });

  await test('HUB1 (HUB-P2-2, lab series cut 2026-10-16) the lab offers agents the SAME `project` tool production does: no `held.get`, no held params, equal to the production strip', () => {
    const { toolDefs } = require('./leg-replay-lab/rebuild');
    const { stripAgentForbiddenActions } = require('../lib/services/mcp/agent-tool-strip');
    const { CONSOLIDATED_SCHEMAS } = require('../lib/mcp/server/config/tool-schemas');
    const { zodToJsonSchema } = require('zod-to-json-schema');
    const defs = toolDefs(['project', 'perform']);
    const project = defs.find((d: any) => d.name === 'project');
    assert(project, 'project tool missing');
    const enumv: string[] = project.parameters?.properties?.action?.enum ?? [];
    assert(enumv.length > 0 && !enumv.includes('held.get'), `held.get offered: ${enumv.join(',')}`);
    for (const p of ['refId', 'executionId', 'handle', 'kind']) assert(!(p in (project.parameters?.properties ?? {})), `held param offered: ${p}`);
    assert(!/held\.get/.test(project.description), 'description still names held.get');
    const raw = zodToJsonSchema(CONSOLIDATED_SCHEMAS.project.inputSchema, { target: 'jsonSchema7' });
    assert(((raw as any).properties.action.enum as string[]).includes('held.get'), 'control: the unstripped schema no longer offers held.get — the check tests nothing');
    const prod = stripAgentForbiddenActions({ name: 'project', description: CONSOLIDATED_SCHEMAS.project.description, inputSchema: raw });
    assert(JSON.stringify(project.parameters) === JSON.stringify(prod.inputSchema) && project.description === prod.description,
      'lab project definition differs from the production strip of the same schema');
    const perform = defs.find((d: any) => d.name === 'perform');
    assert(perform && JSON.stringify(perform.parameters) === JSON.stringify(zodToJsonSchema(CONSOLIDATED_SCHEMAS.perform.inputSchema, { target: 'jsonSchema7' })),
      'a tool with no forbidden action must pass through unchanged');
  });

  // ── held-k8s step 1k: L-K-a fixture tier · L-K-b fixture plants · L-K-c Architect Phase 0 source · L-K-d score-k1 ─────────
  const FX = path.join(LAB, 'fixtures', 'k1-self-test');
  const fxMod = require('./leg-replay-lab/fixture-tools');
  const ghCall = (p: unknown, over: Record<string, unknown> = {}, target = 'github-service') => ({ action: 'call', targetService: target, tool: 'get_file_contents',
    arguments: { owner: 'paichart', repo: 'paichart-lab-configs', path: p, ...over } });
  const innerOf = (env: any) => env.content[0].data.result;

  await test('LK1 (L-K-a) the fixture tier serves file / directory / missing in the probed shape, refuses off-pin calls as the hub does, and never stubs a fixture-service call silently', async () => {
    const fx = fxMod.loadFileFixture(FX);
    const web = fs.readFileSync(path.join(FX, 'files', 'k8s', 'web.yaml'), 'utf8');
    const blob = execFileSync('git', ['hash-object', '--stdin'], { input: web }).toString().trim();
    const srv = fxMod.createFixtureToolServer(fx, null, TOOL_STUB_RESULT);
    const f = innerOf(await srv.executeToolOnServer('s', 'services', ghCall('k8s/web.yaml', { owner: 'PaiChart', ref: 'main' })));
    assert(f.content.length === 2 && f.content[0].type === 'text' && f.content[0].text === `successfully downloaded text file (SHA: ${blob})`, `status item ${JSON.stringify(f.content[0])} (blob must equal git hash-object)`);
    assert(f.content[1].type === 'resource' && f.content[1].resource.text === web && f.content[1].resource.uri === `repo://PaiChart/paichart-lab-configs/sha/${fx.spec.commit}/contents/k8s/web.yaml`, 'resource item / URI (echoes the caller\'s owner spelling, commit-form)');
    const d = innerOf(await srv.executeToolOnServer('s', 'services', ghCall('k8s')));
    const listing = JSON.parse(d.content[0].text);
    assert(d.content.length === 1 && listing.map((e: any) => `${e.type}:${e.name}`).join(',') === 'dir:apps,file:large-release.yaml,file:web.yaml', `directory listing ${d.content[0].text.slice(0, 200)}`);
    const m = innerOf(await srv.executeToolOnServer('s', 'services', ghCall('k8s/absent.yaml')));
    assert(m.isError === true && m.content[0].text === 'Failed to get file contents.', 'missing-path shape');
    for (const [label, call] of [['another owner', ghCall('k8s/web.yaml', { owner: 'someone-else' })], ['a sha argument', ghCall('k8s/web.yaml', { sha: fx.spec.commit })], ['a PR ref', ghCall('k8s/web.yaml', { ref: 'refs/pull/1/head' })], ['no path', ghCall(undefined)]] as const) {
      let msg = ''; try { await srv.executeToolOnServer('s', 'services', call); } catch (e) { msg = (e as Error).message; }
      assert(/^Service call blocked by compliance policy: Blocked: \w+ is outside the file source pin \(/.test(msg), `${label}: ${msg || 'not refused'}`);
    }
    let dotdot = ''; try { await srv.executeToolOnServer('s', 'services', ghCall('k8s/../secrets.yaml')); } catch (e) { dotdot = (e as Error).message; }
    assert(/blocked by compliance policy/.test(dotdot), 'a ../ path must be refused by the shipping policy');
    assert(await srv.executeToolOnServer('s', 'services', ghCall('k8s/web.yaml', {}, 'cmregistryid0000000000001')) === TOOL_STUB_RESULT, 'an unresolvable targetService gets the stub …');
    assert(await srv.executeToolOnServer('s', 'project', { action: 'pov.details' }) === TOOL_STUB_RESULT, 'a non-fixture call goes to the fallback (stub here)');
    const tiers = srv.fixtureLog.map((e: any) => e.tier).join(',');
    assert(tiers === 'fixture-file,fixture-directory,fixture-missing,fixture-refused,fixture-refused,fixture-refused,fixture-refused,fixture-refused,unserved-fixture', `fixture tiers ${tiers}`);
    assert(srv.log.map((e: any) => e.tier).join(',') === `${tiers},unserved`, 'the shared log keeps ONE entry per call, in order');
    const rep = fxMod.fixtureToolsReport(srv.fixtureLog);
    assert(rep.valid === false && rep.unserved === 1 && rep.generatedListings === 1, `… and is LOGGED unserved-fixture, making the sample invalid (${JSON.stringify({ v: rep.valid, u: rep.unserved })})`);
    assert(fxMod.fixtureToolsReport([]).valid === true, 'no repo read ⇒ valid vacuously (H-NOREPO)');
    // with the recorded tier as fallback: production calls are served by it, in the same shared log
    const stored: StoredCall[] = [{ index: 0, tool: 'services', server: 's', args: { action: 'call', targetService: 'k8s-cluster', tool: 'read_object', arguments: '{"name":"web"}' }, result: { r: 'web' }, error: null, success: true, truncatedAtPersist: false }];
    const both = fxMod.createFixtureToolServer(fx, createRecordedToolServer(stored, TOOL_STUB_RESULT), TOOL_STUB_RESULT);
    await both.executeToolOnServer('s', 'services', ghCall('k8s/web.yaml'));
    assert(JSON.stringify(await both.executeToolOnServer('s', 'services', { action: 'call', targetService: 'k8s-cluster', tool: 'read_object', arguments: { name: 'web' } })) === '{"r":"web"}', 'the recorded fallback did not serve the cluster read');
    assert(both.log.map((e: any) => e.tier).join(',') === 'fixture-file,canonical', `shared log ${both.log.map((e: any) => e.tier).join(',')}`);
  });

  await test('LK2 (L-K-a, hub N-5) the shipping capture holds every fixture file as served; the > 50 KB manifest is cut to a preview at persist (MI-13 / a recorded replay cannot see it) while capture holds it whole', async () => {
    const fx = fxMod.loadFileFixture(FX);
    const large = fx.files.get('k8s/large-release.yaml');
    assert(large && large.length > 50000, `the realistic large manifest must exceed 50,000 chars (has ${large?.length})`);
    const r = await fxMod.fixtureCaptureReadiness(fx);
    assert(r.held === 3 && r.files === 3 && r.failures.length === 0, `capture readiness ${JSON.stringify(r)}`);
    assert(JSON.stringify(r.persistTruncated) === '["k8s/large-release.yaml"]', `persist-truncated ${JSON.stringify(r.persistTruncated)}`);
    const { buildExecutionResultJson } = require('../lib/services/execution-artifacts');
    const srv = fxMod.createFixtureToolServer(fx, null, TOOL_STUB_RESULT);
    const recs = [];
    for (const p of ['k8s/web.yaml', 'k8s/large-release.yaml']) recs.push({ tool: 'services', success: true, arguments: ghCall(p), result: await srv.executeToolOnServer('s', 'services', ghCall(p)) });
    const rj = buildExecutionResultJson({ taskId: 't', taskTitle: 'lab', agentRole: 'infra_state_harvester', modelUsed: 'lab', finalResponse: '', confidenceScore: null, turnCount: 1, maxToolTurns: 1,
      toolCallResults: recs, successfulToolCalls: 2, failedToolCalls: 0, executionTime: 0, tokensUsed: 0, correctionTurnUsed: false, logger: fxMod.LAB_PERSIST_LOGGER });
    const s0 = JSON.stringify(rj.toolCalls[0]);
    assert(!s0.includes(fxMod.renderFixtureResult(fx, ghCall('k8s/web.yaml').arguments).inner.content[0].text.slice(-41, -1)) && /elided at persist/.test(s0), 'G-1: the stored small-file record must not carry the blob id (status item elided)');
    assert(rj.toolCalls[1].result.truncated === true, 'the > 50,000 JSON-char record must persist as a truncated preview');
    const storedCalls = storedCallsOf({ resultJson: JSON.stringify(rj) } as any);
    assert(storedCalls.length === 2 && storedCalls[1].truncatedAtPersist && !storedCalls[0].truncatedAtPersist, `stored calls ${storedCalls.length}`);
    const rec = createRecordedToolServer(storedCalls, TOOL_STUB_RESULT);
    assert(await rec.executeToolOnServer('s', 'services', ghCall('k8s/large-release.yaml')) === TOOL_STUB_RESULT && rec.log[0].tier === 'unserved-truncated', 'a recorded replay of the large file must read unserved-truncated (why the fixture tier serves from the fixture)');
    const { extractDeclaredFiles } = require('../lib/agents/harness/held-bytes/extract');
    const held = extractDeclaredFiles(recs, undefined, { gitFileSourceLeg: true });
    assert(held.files.length === 2 && held.files[1].text === large && held.files[1].sourceRevision === fx.spec.commit, 'capture over the in-memory records holds the large file whole');
  });

  await test('LK3 (L-K-b) a fixture plant applies exactly once to a COPY and moves the digest; a bad target, a non-unique anchor and a plaintext Secret fail loud', () => {
    const plain = fxMod.loadFileFixture(FX);
    const planted = fxMod.loadFileFixture(FX, [path.join(FX, 'plants', 'drift-replicas.json')]);
    assert(planted.files.get('k8s/web.yaml')!.includes('  replicas: 3\n') && !planted.files.get('k8s/web.yaml')!.includes('  replicas: 2\n'), 'plant not applied');
    assert(fs.readFileSync(path.join(FX, 'files', 'k8s', 'web.yaml'), 'utf8').includes('  replicas: 2\n'), 'the fixture FILE was modified');
    assert(planted.plants.length === 1 && planted.plants[0].path === 'k8s/web.yaml' && planted.plants[0].deltaChars === 0 && planted.digest !== plain.digest, `plant report / digest ${JSON.stringify(planted.plants)}`);
    const tmp = path.join(out, 'lk3'); fs.mkdirSync(tmp, { recursive: true });
    const bad = (name: string, spec: unknown) => { const f = path.join(tmp, `${name}.json`); fs.writeFileSync(f, JSON.stringify(spec)); return f; };
    const throws = (f: () => unknown, re: RegExp, label: string) => { let m = ''; try { f(); } catch (e) { m = (e as Error).message; } assert(re.test(m), `${label}: ${m || 'did not throw'}`); };
    throws(() => fxMod.loadFileFixture(FX, [bad('nofile', { id: 'x', appliesTo: ['fixture:k8s/nope.yaml'], ops: [{ type: 'replace', old: 'a', new: 'b' }] })]), /not a fixture file/, 'plant on an absent file');
    throws(() => fxMod.loadFileFixture(FX, [bad('wrongtarget', { id: 'x', appliesTo: ['author:abc'], ops: [] })]), /targets fixture:<repo path> only/, 'non-fixture target');
    throws(() => fxMod.loadFileFixture(FX, [bad('dup', { id: 'x', appliesTo: ['fixture:k8s/web.yaml'], ops: [{ type: 'replace', old: 'app: web', new: 'app: x' }] })]), /occurs \d+ times/, 'non-unique anchor');
    const sec = path.join(tmp, 'secretfx'); fs.cpSync(FX, sec, { recursive: true });
    fs.writeFileSync(path.join(sec, 'files', 'k8s', 'creds.yaml'), 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: x\nstringData:\n  k: v\n');
    throws(() => fxMod.loadFileFixture(sec), /plaintext Secret manifest/, 'a plaintext Secret in a fixture');
    const off = path.join(tmp, 'offpin'); fs.cpSync(FX, off, { recursive: true });
    fs.writeFileSync(path.join(off, 'fixture.json'), JSON.stringify({ ...plain.spec, repo: 'another-repo' }));
    throws(() => fxMod.loadFileFixture(off), /is not github-service's pinned repo/, 'a fixture outside the pin');
  });

  await test('LK4 (G-FIXTURE-ID) fixture-id-check passes a byte-identical probe, fails a one-byte change, a generated listing and an unrecorded refusal', () => {
    const fx = fxMod.loadFileFixture(FX);
    const r = (p: string) => fxMod.renderFixtureResult(fx, ghCall(p).arguments).inner;
    const good = { cases: [{ arguments: ghCall('k8s/web.yaml').arguments, result: { success: true, targetService: 'github-service', result: r('k8s/web.yaml') } }, { arguments: ghCall('k8s/absent.yaml').arguments, result: r('k8s/absent.yaml') },
      { arguments: ghCall('k8s/web.yaml', { owner: 'x' }).arguments, result: 'Service call blocked by compliance policy: …' }] };
    assert(fxMod.fixtureIdCheck(fx, good).ok, fxMod.fixtureIdCheck(fx, good).lines.join(' | '));
    const changed = JSON.parse(JSON.stringify(good)); changed.cases[0].result.result.content[1].resource.text += ' ';
    assert(!fxMod.fixtureIdCheck(fx, changed).ok, 'a one-byte change passed');
    assert(!fxMod.fixtureIdCheck(fx, { cases: [{ arguments: ghCall('k8s').arguments, result: r('k8s') }] }).ok, 'a GENERATED listing must never pass G-FIXTURE-ID');
    const verbatim = { ...fx, spec: { ...fx.spec, listings: { k8s: '[{"name":"web.yaml","type":"file"}]' } } };
    assert(fxMod.fixtureIdCheck(verbatim, { cases: [{ arguments: ghCall('k8s').arguments, result: { content: [{ type: 'text', text: '[{"name":"web.yaml","type":"file"}]' }] } }] }).ok, 'a verbatim listing must pass');
    assert(!fxMod.fixtureIdCheck(fx, { cases: [{ arguments: ghCall('k8s/web.yaml', { owner: 'x' }).arguments, result: r('k8s/web.yaml') }] }).ok, 'a refusal the probe did not record passed');
    assert(!fxMod.fixtureIdCheck(fx, { cases: [] }).ok, 'an empty probe passed');
  });

  await test('LK5 (L-K-a through the SHIPPING loop) a scripted Harvester\'s repo reads are served by the fixture and its cluster read by the recorded tier; the persisted toolCalls score as named / guess / other-repo', async () => {
    const { runLive } = await import('./leg-replay-lab/live');
    const { buildExecutionResultJson } = require('../lib/services/execution-artifacts');
    const { githubReads } = await import('./leg-replay-lab/score-k1');
    const OBSQ_DIR = path.join(LAB, 'inputs', '2026-10-13-obs-quote-consumer');
    const snap = loadSnapshot('cmv5t9ivv008oyxghtb0epzmr');
    const proto: ProtocolText = { name: 'observability-config-protocol', version: '1.8.0', source: 'test', text: fs.readFileSync(path.join(OBSQ_DIR, 'protocols', 'observability-config-protocol@1.8.0.baseline.md'), 'utf8') };
    const prompt = await rebuildPrompt(snap, 'author', proto);
    const stored = storedCallsOf(snap.author);
    const fx = fxMod.loadFileFixture(FX, [path.join(FX, 'plants', 'drift-replicas.json')]);
    const srv = fxMod.createFixtureToolServer(fx, createRecordedToolServer(stored, TOOL_STUB_RESULT), TOOL_STUB_RESULT);
    const calls = [ghCall('k8s/web.yaml'), ghCall('k8s'), ghCall('k8s/absent.yaml'), ghCall('k8s/web.yaml', { owner: 'someone-else' })]
      .map((a, i) => ({ id: `t${i}`, name: 'services', arguments: JSON.stringify(a) }));
    calls.push({ id: 't9', name: stored[0].tool, arguments: typeof stored[0].args === 'string' ? stored[0].args : JSON.stringify(stored[0].args) });
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
    let k = 0;
    const gen = async () => (k++ === 0
      ? { text: '', stopReason: 'tool_use', functionCalls: calls, usage, metadata: { model: prompt.model }, rawContentBlocks: calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: JSON.parse(c.arguments) })) }
      : { text: 'Harvest done. Drift detected on Deployment web: replicas is 3 in the repo vs 2 in the cluster.', stopReason: 'end_turn', functionCalls: [], rawContentBlocks: [{ type: 'text', text: 'done' }], usage, metadata: { model: prompt.model } });
    const a = await runLive(prompt, { executionId: 'lab-lk5-h', taskId: snap.author.task.id, taskType: snap.author.task.type, apiKey: 'fake', toolServer: srv as any, generateTextOverride: gen });
    assert(srv.fixtureLog.map((e: any) => e.tier).join(',') === 'fixture-file,fixture-directory,fixture-missing,fixture-refused', `fixture tiers ${srv.fixtureLog.map((e: any) => e.tier).join(',')}`);
    assert(srv.log.length === 5 && srv.log[4].tier === 'exact', `the production call must be served exactly by the recorded tier (${srv.log.map((e: any) => e.tier).join(',')})`);
    const recs = a.toolCallRecords as Array<Record<string, any>>;
    const fileRec = recs.find((t) => JSON.stringify(t.arguments).includes('"k8s/web.yaml"') && t.success);
    assert(fileRec && JSON.stringify(fileRec.result).includes('  replicas: 3'), 'the served bytes carry the plant');
    const rj = buildExecutionResultJson({ taskId: 't', taskTitle: 'lab', agentRole: 'infra_state_harvester', modelUsed: prompt.model, finalResponse: a.finalResponse, confidenceScore: null, turnCount: a.turns, maxToolTurns: prompt.maxToolTurns,
      toolCallResults: recs, successfulToolCalls: recs.filter((t) => t.success).length, failedToolCalls: recs.filter((t) => !t.success).length, executionTime: 0, tokensUsed: 0, correctionTurnUsed: false, logger: fxMod.LAB_PERSIST_LOGGER });
    const g = githubReads(rj.toolCalls, { role: 'harvester', repo: { owner: 'paichart', repo: 'paichart-lab-configs' }, namedPaths: ['k8s/web.yaml'] });
    assert(g.reads.map((r) => `${r.class}:${r.path}:${r.success}`).join(',') === 'named:k8s/web.yaml:true,guess:k8s:true,guess:k8s/absent.yaml:true,otherRepo:k8s/web.yaml:false', `persisted reads ${JSON.stringify(g.reads)}`);
  });

  await test('LK6 (L-K-a/b + L-K-c end to end, $0) a fixture Harvester node dry-runs (brief edit in the prompt, capture readiness, digest); its fake sample feeds an Architect cell that reproduces the frozen prompt; a moved brief, a moved fixture, an invalid sample and a frozen fallback are each handled by name', () => {
    const OBSQ_DIR = path.join(LAB, 'inputs', '2026-10-13-obs-quote-consumer');
    const ex = path.join(out, 'lk6-exp'); fs.cpSync(OBSQ_DIR, ex, { recursive: true });
    fs.cpSync(FX, path.join(ex, 'fixture'), { recursive: true });
    const tail = 'do not delete the registration yourself.';
    const brief = { id: 'brief', appliesTo: ['author-task:description'], ops: [{ type: 'replace', old: tail, new: `${tail}\n\nRepository files to read (owner paichart, repo paichart-lab-configs): k8s/web.yaml.` }] };
    fs.writeFileSync(path.join(ex, 'brief.json'), JSON.stringify(brief));
    fs.writeFileSync(path.join(ex, 'frozen-harvest.md'), '## Phase 0 (hand-written fallback)\nDrift detected on Deployment web: replicas is 3 in the repo vs 2 in the cluster — LK6 frozen marker line.\n');
    const runName = `lk6-test-${process.pid}`;
    const runDir = path.join(LAB, 'runs', runName);
    const e = JSON.parse(fs.readFileSync(path.join(ex, 'experiment.json'), 'utf8'));
    const H = { id: 'H', authorExecutionId: 'cmv5t9ivv008oyxghtb0epzmr', kind: 'harvester', variants: ['hbase'], harvesterOnly: true, tools: 'recorded', n: 1,
      fileFixture: 'fixture', fixturePlants: ['fixture/plants/drift-replicas.json'], inputEdits: 'brief.json' };
    const A = (src: string) => ({ id: 'A', authorExecutionId: 'cmv5tbfz100abyxghil4j1xx1', kind: 'architect', variants: ['hbase'], architectOnly: true, harvesterSourceByVariant: { hbase: src } });
    const writeExp = (nodes: unknown[]) => fs.writeFileSync(path.join(ex, 'experiment.json'), JSON.stringify({ ...e, nodes }, null, 2));
    const fails = (args: string[], re: RegExp, label: string) => { let m = ''; try { runLab(args); } catch (err) { m = `${(err as any).stdout ?? ''}${(err as any).stderr ?? ''}`; } assert(re.test(m), `${label}: ${m.split('\n').filter((l) => /L-K-c|Error/.test(l)).slice(0, 3).join(' | ') || 'did not fail'}`); };
    try {
      writeExp([H, A(`lab-sample:${runName}/H/hbase/1`)]);
      const dry = path.join(out, 'lk6-dry');
      const log = runLab(['run', '--experiment', ex, '--only', 'H', '--out', dry]);
      const m = JSON.parse(fs.readFileSync(path.join(dry, 'manifest.json'), 'utf8')).nodes.H;
      assert(m.fixture && m.fixture.captureReadiness.held === 3 && m.fixture.plants.length === 1 && m.fixture.captureReadiness.persistTruncated.join() === 'k8s/large-release.yaml', `fixture report ${JSON.stringify(m.fixture)}`);
      assert(/reaches every arm's prompt verbatim/.test(log) && fs.readFileSync(path.join(dry, 'H', 'hbase', 'author.user.md'), 'utf8').includes('Repository files to read (owner paichart'), 'the brief edit must reach the Harvester prompt');
      runLab(['run', '--experiment', ex, '--only', 'H', '--out', runDir, '--fake-llm', 'persisted', '--n', '1']);
      const sm = JSON.parse(fs.readFileSync(path.join(runDir, 'H', 'hbase', 'sample-01', 'sample.json'), 'utf8'));
      assert(!sm.error && sm.valid === true && sm.fixtureTools.calls === 0 && sm.fixtureTools.digest === m.fixture.digest, `fake sample ${JSON.stringify({ e: sm.error, v: sm.valid, f: sm.fixtureTools })}`);
      const adry = path.join(out, 'lk6-adry');
      runLab(['run', '--experiment', ex, '--only', 'A', '--out', adry]);
      const hs = JSON.parse(fs.readFileSync(path.join(adry, 'manifest.json'), 'utf8')).nodes.A.variants.hbase.harvesterSource;
      assert(hs.inPrompt === true && hs.reproducesFrozenPrompt === true && hs.harvesterNode === 'H', `L-K-c identity control ${JSON.stringify(hs)}`);
      // a moved brief ⇒ the sample's Harvester prompt is no longer the H node's
      fs.writeFileSync(path.join(ex, 'brief.json'), JSON.stringify({ ...brief, ops: [{ ...brief.ops[0], new: brief.ops[0].new + ' Also k8s/apps/api.yaml.' }] }));
      fails(['run', '--experiment', ex, '--only', 'A', '--out', path.join(out, 'lk6-x1')], /Harvester (system|user) prompt differs from the one the H node builds now/, 'moved brief');
      fs.writeFileSync(path.join(ex, 'brief.json'), JSON.stringify(brief));
      writeExp([{ ...H, fixturePlants: [] }, A(`lab-sample:${runName}/H/hbase/1`)]);
      fails(['run', '--experiment', ex, '--only', 'A', '--out', path.join(out, 'lk6-x2')], /the sample read fixture [0-9a-f]{12}, the H node loads [0-9a-f]{12}/, 'moved fixture');
      writeExp([H, A(`lab-sample:${runName}/H/hbase/1`)]);
      fs.writeFileSync(path.join(runDir, 'H', 'hbase', 'sample-01', 'sample.json'), JSON.stringify({ ...sm, valid: false }));
      fails(['run', '--experiment', ex, '--only', 'A', '--out', path.join(out, 'lk6-x3')], /the sample is INVALID/, 'invalid sample');
      writeExp([H, A('frozen:frozen-harvest.md')]);
      const fdry = path.join(out, 'lk6-fdry');
      runLab(['run', '--experiment', ex, '--only', 'A', '--out', fdry]);
      assert(fs.readFileSync(path.join(fdry, 'A', 'hbase', 'author.user.md'), 'utf8').includes('LK6 frozen marker line') && !fs.readFileSync(path.join(adry, 'A', 'hbase', 'author.user.md'), 'utf8').includes('LK6 frozen marker line'), 'the frozen fallback harvest must reach the Architect prompt');
      writeExp([H, { ...A('persisted'), harvesterSourceByVariant: undefined }, { ...H, id: 'B', harvesterOnly: false }]);
      fails(['run', '--experiment', ex, '--only', 'B', '--out', path.join(out, 'lk6-x4')], /fileFixture\/fixturePlants serve a HARVESTER/, 'a fixture on a non-harvester node');
    } finally { fs.rmSync(runDir, { recursive: true, force: true }); }
  });

  await test('LK7 (L-K-d) score-k1 self-test both directions (repo reads, NOREPO, drift found/not, defaults trap, missing path, cluster targets, architect halt/reconcile, validity + NOT MEASURED, gate lines); the mutations ignore-guess, defaults-blind, drift-blind are caught', () => {
    const { k1SelfTest } = require('./leg-replay-lab/score-k1');
    const ok = k1SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of ['ignore-guess', 'defaults-blind', 'drift-blind']) assert(!k1SelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
    const log = runLab(['k1-self-test']);
    assert(/reads every case as pre-registered/.test(log), 'CLI k1-self-test');
  });

  await test('LK8 (L-K2) score-k2 self-test both directions (SG-DOC one-document retype vs unchanged quote vs whole file, strict unified diff incl. an undercounted hunk header, SG-DIFF, independent G-AMBIG incl. count=N, DRIFT-CAUSE proxies incl. negation, ARCH-QUOTE k8s document reading, collateral rendered-count citation); the mutations sgdoc-blind, diff-lenient, cause-blind, ambig-blind, negation-blind, newdoc-quote, count-blind are caught', () => {
    const { k2SelfTest } = require('./leg-replay-lab/score-k2');
    const ok = k2SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of ['sgdoc-blind', 'diff-lenient', 'cause-blind', 'ambig-blind', 'negation-blind', 'newdoc-quote', 'count-blind']) assert(!k2SelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
    const log = runLab(['k2-self-test']);
    assert(/reads every case as pre-registered/.test(log), 'CLI k2-self-test');
  });

  await test('LT1 (L-T1) score-t1 self-test both directions (PATH incl. ref/sha, browser bypass of the pinned repo vs the descriptor fetch, forbidden state paths; STATE/DESC; terraform CAUSE incl. "both possibilities" and negation; DIFF two values + absent-from-state; NOFALSE computed-attribute traps; REF the merge() attribution; HEAD; Architect halt / reconcile-callout); the mutations path-blind, bypass-blind, cause-blind, negation-blind, diff-blind, trap-blind, ref-blind are caught', () => {
    const { t1SelfTest } = require('./leg-replay-lab/score-t1');
    const ok = t1SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of ['path-blind', 'bypass-blind', 'cause-blind', 'negation-blind', 'diff-blind', 'trap-blind', 'ref-blind', 'refused-blind']) assert(!t1SelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
    const log = runLab(['t1-self-test']);
    assert(/reads every case as pre-registered/.test(log), 'CLI t1-self-test');
  });

  await test('LN1 (L-N1) score-n1 self-test both directions (REG named/descriptor-URL identity, NOHAND hand register + descriptor fetch, PATH listing / unnamed path / device call in a git-only cell / Git read in a device-only cell / undeclared device / default branch of a ref-named path / bypass, the own ref pin-refused is not a miss; REF; STOP both cells; BASE; OUTAGE; DRIFT cause vs both-possibilities; CTRLX; ARCH out-of-scope HALT; CANARY through the shipping R10); every mutation is caught', () => {
    const { n1SelfTest } = require('./leg-replay-lab/score-n1');
    const ok = n1SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of ['reg-blind', 'hand-blind', 'path-blind', 'undeclared-blind', 'ref-blind', 'stop-blind', 'base-blind', 'cause-blind', 'negation-blind', 'ctrlx-blind', 'arch-blind']) assert(!n1SelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
  });

  await test('LN2 (L-N1 B4/B5/B6) network fixture tiers: a config read in any argument spelling is served from the pool with the inner result unchanged and the caller\'s arguments echoed; a multi-getter read is logged unserved-device; the failure host gets the stored result; catalogue reads served, a service outside the catalogue logged; a descriptorUrl register THROWS the pinned text; recordedToolsReport counts every unserved* tier as unserved', async () => {
    const { createNetworkToolServer, networkToolsReport } = require('./leg-replay-lab/network-fixtures');
    const { recordedToolsReport } = require('./leg-replay-lab/recorded-tools');
    const inner = { content: [{ type: 'text', text: 'x' }], structuredContent: { hosts: { ceos1: { success: true, output: { config: { running: 'hostname ceos1' } } } } } };
    const env = { content: [{ type: 'data', data: { success: true, targetService: 'ceos-lab-readonly', tool: 'fetch_data', arguments: { getters: ['config'], getters_options: { config: { retrieve: 'running' } }, filter_name: 'ceos1' }, result: inner } }] };
    const fail = { content: [{ type: 'text', text: 'failed: 502' }], isError: true };
    const fx = { spec: { deviceFailureHosts: ['ceos2'], catalogueServices: ['github-service'] }, refusal: 'Validation failed: descriptor-fetch-failed: x',
      pool: { serviceNames: ['ceos-lab-readonly'], entries: [{ tool: 'fetch_data', getter: 'config', host: 'ceos1', result: env, from: { executionId: 'e', index: 5 } }], failure: { result: fail, from: { executionId: 'f', index: 6 } } },
      catalogue: { discoverWrapper: { services: [], total: 0 }, listWrapper: { services: [] }, services: { 'github-service': { name: 'github-service', tools: { tools: [] }, health: { status: 'ACTIVE' }, discoverRow: { name: 'github-service', configuration: { category: 'automation' } } } } } };
    const srv = createNetworkToolServer(fx, null, { stub: true });
    const r1: any = await srv.executeToolOnServer('s', 'services', { action: 'call', targetService: 'ceos-lab-readonly', tool: 'fetch_data', arguments: JSON.stringify({ getters: ['config'], filter_name: 'ceos1' }) });
    assert(JSON.stringify(r1.content[0].data.result) === JSON.stringify(inner) && JSON.stringify(r1.content[0].data.arguments) === JSON.stringify({ getters: ['config'], filter_name: 'ceos1' }), 'pool: inner unchanged, caller args echoed');
    const r2: any = await srv.executeToolOnServer('s', 'services', { action: 'call', targetService: 'ceos-lab-readonly', tool: 'fetch_data', arguments: { getters: ['config', 'facts'], filter_name: 'ceos1' } });
    assert(r2.stub === true, 'multi-getter → stub');
    const r3: any = await srv.executeToolOnServer('s', 'services', { action: 'call', targetService: 'ceos-lab-readonly', tool: 'fetch_data', arguments: { getters: ['config'], filter_name: 'ceos2' } });
    assert(r3 === fail, 'failure host → the stored failed result');
    const r4: any = await srv.executeToolOnServer('s', 'registry', { action: 'tools', service_name: 'github-service' });
    assert(r4.content[0].data.tools, 'catalogue tools served');
    const r5: any = await srv.executeToolOnServer('s', 'services', { action: 'health', service_name: 'browser-automation-service' });
    assert(r5.stub === true, 'outside the catalogue → stub');
    let threw = '';
    try { await srv.executeToolOnServer('s', 'registry', { action: 'register', descriptorUrl: 'https://x/d.json' }); } catch (e) { threw = (e as Error).message; }
    assert(threw === fx.refusal, 'B6 throws the pinned text');
    const rep = networkToolsReport(srv.netLog);
    assert(rep.configCalls === 3 && rep.configServed === 2 && rep.catalogueCalls === 2 && rep.catalogueServed === 1 && rep.valid === false, `report ${JSON.stringify({ c: rep.configCalls, s: rep.configServed, k: rep.catalogueCalls, ks: rep.catalogueServed })}`);
    const rr = recordedToolsReport(srv.log, []);
    assert(rr.otherServicesCalls === 4 && rr.otherServicesServed === 2, `recordedToolsReport other ${rr.otherServicesServed}/${rr.otherServicesCalls}`);
    // ADDENDUM (c): a successful descriptorUrl register brings its service into the catalogue (tools served, list shows it); a single-host
    // multi-getter read is composed from the pool's single-getter entries.
    const URL = 'https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json';
    const env2 = JSON.parse(JSON.stringify(env)); env2.content[0].data.result.structuredContent.hosts.ceos1.output = { bgp_config: { local_as: 65001 } };
    const fx2: any = { ...fx, refusal: null, spec: { catalogueServices: ['github-service'], catalogueOnRegister: { [URL]: 'ceos-lab-readonly' } },
      pool: { ...fx.pool, entries: [...fx.pool.entries, { tool: 'fetch_data', getter: 'bgp_config', host: 'ceos1', result: env2, from: { executionId: 'e', index: 6 } }] } };
    fx2.catalogue = { ...fx.catalogue, services: { ...fx.catalogue.services, 'ceos-lab-readonly': { name: 'ceos-lab-readonly', tools: { tools: [{ name: 'fetch_data' }] }, health: { status: 'ACTIVE' }, discoverRow: { id: 'ceos-lab-readonly', name: 'ceos-lab-readonly', configuration: { category: 'automation' } } } } };
    const before: any = await createNetworkToolServer(fx2, null, { stub: true }).executeToolOnServer('s', 'registry', { action: 'tools', service_name: 'ceos-lab-readonly' });
    assert(before.stub === true, 'not in the catalogue before a register');
    const fallback = { log: [] as any[], getToolDefinition: async (n: string) => ({ serverName: 'x', tool: { name: n } }), executeToolOnServer: async () => { fallback.log.push({ tool: 'registry', action: 'register', innerTool: null, fileTool: false, tier: 'same-action', storedIndex: 0 }); return { content: [{ type: 'data', data: { success: true, serviceName: 'ceos-lab-readonly' } }] }; } };
    const s2 = createNetworkToolServer(fx2, fallback, { stub: true });
    await s2.executeToolOnServer('s', 'registry', { action: 'register', descriptorUrl: URL });
    const after: any = await s2.executeToolOnServer('s', 'registry', { action: 'tools', service_name: 'ceos-lab-readonly' });
    const list: any = await s2.executeToolOnServer('s', 'registry', { action: 'list' });
    assert(after.content[0].data.tools && list.content[0].data.total === 1, 'catalogue joined after a successful register (tools + list)');
    const comp: any = await s2.executeToolOnServer('s', 'services', { action: 'call', targetService: 'ceos-lab-readonly', tool: 'fetch_data', arguments: { getters: ['config', 'bgp_config'], filter_name: 'ceos1' } });
    const outp = comp.content[0].data.result.structuredContent.hosts.ceos1.output;
    assert(outp.config && outp.bgp_config && s2.netLog.some((x: any) => x.tier === 'device-pool-composed'), 'multi-getter composed from the pool');
    // ADDENDUM (e) mutation pins — each fixture is proved in BOTH directions.
    const stubFallback = { log: [] as any[], getToolDefinition: async (n: string) => ({ serverName: 'x', tool: { name: n } }), executeToolOnServer: async () => { stubFallback.log.push({ tool: 'registry', action: 'register', innerTool: null, fileTool: false, tier: 'unserved', storedIndex: null }); return { stub: true }; } };
    const s3 = createNetworkToolServer(fx2, stubFallback, { stub: true });
    await s3.executeToolOnServer('s', 'registry', { action: 'register', descriptorUrl: URL });
    await s3.executeToolOnServer('s', 'registry', { action: 'tools', service_name: 'ceos-lab-readonly' });
    assert(networkToolsReport(s3.netLog).valid === false, 'an UNSERVED register followed by registry tools reads invalid');
    const s4 = createNetworkToolServer({ ...fx2, spec: { catalogueServices: ['github-service'] } }, fallback, { stub: true });
    await s4.executeToolOnServer('s', 'registry', { action: 'register', descriptorUrl: URL });
    await s4.executeToolOnServer('s', 'registry', { action: 'tools', service_name: 'ceos-lab-readonly' });
    assert(networkToolsReport(s4.netLog).valid === false, 'mutation: without catalogueOnRegister the post-register tools read is unserved');
    const s5 = createNetworkToolServer({ ...fx2, pool: fx.pool }, fallback, { stub: true });
    await s5.executeToolOnServer('s', 'services', { action: 'call', targetService: 'ceos-lab-readonly', tool: 'fetch_data', arguments: { getters: ['config', 'bgp_config'], filter_name: 'ceos1' } });
    const rep5 = networkToolsReport(s5.netLog);
    assert(rep5.valid === false && rep5.configServed === 0, 'mutation: a multi-getter the pool cannot compose reads unserved-device');
    // ADDENDUM (f): the SHIPPING descriptor field check runs before a served register — descriptorUrl alone passes; a typed name that disagrees
    // with the descriptor is refused DESCRIPTOR_FIELD_DISAGREES; mutation: without descriptorFiles the same register is served a success.
    const desc = { name: 'ceos-lab-readonly', endpoint: 'https://ceos-lab.paichart.app/mcp', description: 'Read-only lab device service descriptor', category: 'automation', capabilities: { tools: ['fetch_data'] } };
    const fx6: any = { ...fx2, descriptors: { [URL]: desc } };
    const s6 = createNetworkToolServer(fx6, fallback, { stub: true });
    const okReg: any = await s6.executeToolOnServer('s', 'registry', { action: 'register', descriptorUrl: URL });
    assert(okReg.content[0].data.success === true, 'descriptorUrl alone passes the shipping check');
    let disagree = '';
    try { await s6.executeToolOnServer('s', 'registry', { action: 'register', descriptorUrl: URL, name: 'my-invented-name' }); } catch (e) { disagree = (e as Error).message; }
    assert(/DESCRIPTOR_FIELD_DISAGREES: name differs from the fetched descriptor/.test(disagree), `a disagreeing typed name is refused (got: ${disagree.slice(0, 120)})`);
    const s7 = createNetworkToolServer({ ...fx2 }, fallback, { stub: true });
    const served: any = await s7.executeToolOnServer('s', 'registry', { action: 'register', descriptorUrl: URL, name: 'my-invented-name' });
    assert(served.content[0].data.success === true, 'mutation: without descriptorFiles the disagreeing register is served (the R2 gap)');
  });

  await test('LT2 (LAB-VALIDITY-OTHER-CALLS) recordedToolsReport keeps `valid` as the FILE-tool rule and adds otherValid over non-file services calls (fixture tiers served, platform calls ignored, unserved counted)', () => {
    const { recordedToolsReport } = require('./leg-replay-lab/recorded-tools');
    const e = (tool: string, innerTool: string | null, tier: string, fileTool = false) => ({ tool, action: tool === 'services' ? 'call' : 'x', innerTool, fileTool, tier, storedIndex: null });
    const base = [e('services', 'scrape_page', 'exact'), e('services', 'get_file_contents', 'fixture-file'), e('services', 'state_list', 'exact'), e('services', 'state_pull', 'exact'), e('project', null, 'unserved'), e('registry', null, 'same-action')];
    const ok = recordedToolsReport(base, []);
    assert(ok.valid === true && ok.otherValid === true && ok.otherServicesCalls === 4 && ok.otherServicesServed === 4, `clean: ${JSON.stringify({ v: ok.valid, o: ok.otherValid, c: ok.otherServicesCalls, s: ok.otherServicesServed })}`);
    const bad = recordedToolsReport([...base, e('services', 'state_pull', 'unserved')], []);
    assert(bad.valid === true && bad.otherValid === false && bad.otherServicesServed === 4 && bad.otherServicesCalls === 5, `one unserved state read of 5 (80%) must fail otherValid but not valid: ${JSON.stringify({ v: bad.valid, o: bad.otherValid })}`);
  });

  await test('LT3 (L-T2) score-t2 HCL ARCH-QUOTE both directions (a NEW resource sharing only trivial lines is not a quote; 3 non-trivial held lines in order are; 2 are not); the mutation trivial-blind is caught', () => {
    const { t2SelfTest } = require('./leg-replay-lab/score-t2');
    const ok = t2SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    assert(!t2SelfTest({ mutate: 'trivial-blind' }).ok, 'mutation trivial-blind not caught');
    const log = runLab(['t2-self-test']);
    assert(/reads every case as pre-registered/.test(log), 'CLI t2-self-test');
  });

  await test('LK9 (L-K-e) the held-JOIN binding refuses a leg this tree does not make held-capable, and a seed that is not a templates module', () => {
    const { snapshotWithHeldJoin } = require('./leg-replay-lab/variant-binding');
    const snap = (protocol: string) => ({ leg: { id: 'l', title: `x (protocol: ${protocol})`, metadata: { protocol: `${protocol}-protocol` } }, author: { template: null }, reviewer: null });
    let threw = '';
    // Example moved terraform-iac -> network-provisioning at held-terraform step 3 (terraform joined HELD_JOIN_VERSIONS at 1.15.0), and
    // network-provisioning -> network-derivation at held-network push 3 (network joined; network-derivation is the one domain left out).
    try { snapshotWithHeldJoin(snap('network-derivation') as never, 'seed-kubernetes-gitops-templates'); } catch (e) { threw = (e as Error).message; }
    assert(/not held-capable/.test(threw), `network-derivation leg not refused: ${threw}`);
    threw = '';
    try { snapshotWithHeldJoin(snap('kubernetes-gitops') as never, '../lib/evil'); } catch (e) { threw = (e as Error).message; }
    assert(/must name a scripts\/seed-\*-templates module/.test(threw), `bad seed not refused: ${threw}`);
    const ok = snapshotWithHeldJoin(snap('kubernetes-gitops') as never, 'seed-kubernetes-gitops-templates');
    assert(ok.report.legProtocol === 'kubernetes-gitops-protocol' && ok.report.templates.length === 0, 'k8s leg binds');
  });

  await test('LK10 (L-K2 defect) the spend meter equals Σ sample.json costUsd for concurrent Architect + Harvester samples, and the racy `spent += await` form is caught', () => {
    // Invocation 3 of L-K2 recorded $1.59 for $6.79 of calls: `spent += await runArchitectSample(...)` read `spent` before the await.
    const K2 = path.join(LAB, 'inputs', '2026-10-19-held-k8s-l-k2');
    const run = (mut: string, dir: string) => execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.join(LAB, 'lab.ts'), 'run', '--experiment', K2, '--only', 'X-K1,X-K2,X-K3,X-K4,H-CAUSE-WIT',
      '--variants', 'xhb,hk2', '--n', '3', '--concurrency', '4', '--fake-llm', 'persisted', '--out', dir],
      { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: '', LAB_TEST_FAKE_OUTPUT_TOKENS: '1000', LAB_TEST_SPEND_MUTATION: mut }, maxBuffer: 64 * 1024 * 1024 }).toString();
    const okDir = path.join(out, 'lk10-ok'); run('', okDir);
    const m = JSON.parse(fs.readFileSync(path.join(okDir, 'manifest.json'), 'utf8'));
    assert(m.sampleSumUsd > 0.1, `the fake calls must cost something (sample sum $${m.sampleSumUsd})`);
    assert(Math.abs(m.meterUsd - m.sampleSumUsd) < 0.005 && m.spendMismatch === false, `meter $${m.meterUsd} ≠ sample sum $${m.sampleSumUsd}`);
    const racyDir = path.join(out, 'lk10-racy'); const log = run('racy', racyDir);
    const r = JSON.parse(fs.readFileSync(path.join(racyDir, 'manifest.json'), 'utf8'));
    assert(r.spendMismatch === true && /SPEND MISMATCH/.test(log), 'the racy accumulator was not caught by the run-end check');
    assert(r.spentUsd >= r.sampleSumUsd, 'manifest.spentUsd must never be below the sample sum');
    let refused = '';
    try { execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.join(LAB, 'lab.ts'), 'run', '--experiment', K2, '--only', 'X-K1', '--spend', '--out', path.join(out, 'lk10-refuse')],
      { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: 'sk-ant-test-not-a-key', LAB_TEST_FAKE_OUTPUT_TOKENS: '1' }, stdio: 'pipe' }); } catch (e: any) { refused = String(e.stderr ?? e.message); }
    assert(/TEST ONLY — refusing to spend/.test(refused), 'a --spend run with a LAB_TEST_* variable set must refuse before any call');
  });

  await test('LK11 (L-K2 defect) a raw tool-result plant on a harvesterOnly node reaches the SERVED record (both stored copies), and the lab refuses a plant whose text is absent from the served copy', () => {
    const { snapshotWithInputEdits } = require('./leg-replay-lab/input-edits');
    const { storedCallsOf } = require('./leg-replay-lab/recorded-tools');
    const { loadSnapshot } = require('./leg-replay-lab/snapshot');
    const K2 = path.join(LAB, 'inputs', '2026-10-19-held-k8s-l-k2');
    const node = { id: 'H-CAUSE-NOWIT', inputEdits: 'plants/H-CAUSE-NOWIT.plant.json' };
    const { snap, report } = snapshotWithInputEdits(K2, node, loadSnapshot('cmvdnhwdx00jayxt0ub4o6gf4'));
    const served = JSON.stringify(storedCallsOf(snap.author)[3].result);
    assert(!/last-applied-configuration/.test(served), 'the served Deployment read still carries the annotation');
    const t = Object.values<any>(report.targets)[0];
    assert(t.copies.includes('author.resultJson') && t.copies.includes('childArtifacts'), `copies: ${t.copies}`);
    // A plant whose anchor is not in the target leaf is refused (never silently unapplied).
    const bad = path.join(out, 'lk11-bad.json');
    fs.writeFileSync(bad, JSON.stringify({ id: 'bad', appliesTo: ['harvester-toolcall:cmvdnhwdx00jayxt0ub4o6gf4:3'], ops: [{ type: 'replace', old: 'NOT-IN-THE-RESULT-xyz', new: '' }] }));
    let threw = '';
    try { snapshotWithInputEdits(path.dirname(bad), { id: 'X', inputEdits: path.basename(bad) }, loadSnapshot('cmvdnhwdx00jayxt0ub4o6gf4')); } catch (e) { threw = (e as Error).message; }
    assert(/string leaves/.test(threw), `an absent anchor was not refused: ${threw}`);
  });

  await test('LK12 (lab-cost ranks 3–4) LAB-PLANT-PRESENCE-CHECK refuses a plant that does not reach the prompt (identical twin, missing added line, removed line still present) and passes one that does; LAB-WARM-FIRST queues every sample 1 first and holds a sibling until its cell is warm', async () => {
    const { plantPresence, warmFirstOrder, warmGate, warmed } = require('./leg-replay-lab/lab');
    const spec = { id: 'p', appliesTo: ['x'], ops: [{ type: 'replace', old: 'keep\n  - tier: frontend\n  - app: scraper', new: 'keep\n  - app: scraper' }] };
    const twin = 'head\nkeep\n  - tier: frontend\n  - app: scraper\ntail';
    const planted = 'head\nkeep\n  - app: scraper\ntail\n+rendered diff line';
    const ok = plantPresence(spec, twin, planted);
    assert(ok.ok && ok.outsidePlant.length === 1, `a reaching plant: ${JSON.stringify(ok)}`);
    assert(!plantPresence(spec, twin, twin).ok, 'identical prompts must be refused');
    assert(!plantPresence({ ...spec, ops: [{ type: 'replace', old: 'a', new: 'a\nNEW LINE' }] }, twin, planted).ok, 'an added line absent from the planted prompt must be refused');
    assert(!plantPresence(spec, twin, `${twin}\nextra`).ok, 'a removed line still present as often must be refused');
    // An op naming another Author form (op-level appliesTo, G2 R-COLLATERAL) is not this arm's plant and is not checked here.
    const multi = { ...spec, appliesTo: ['x', 'y'], ops: [...spec.ops.map((op) => ({ ...op, appliesTo: ['x'] })), { type: 'replace', old: 'zz\nGONE', new: 'zz', appliesTo: ['y'] }] };
    assert(plantPresence(multi, `${twin}\nGONE`, `${planted}\nGONE`, 'x').ok, 'an op for another Author form was checked against this arm');
    assert(!plantPresence(multi, `${twin}\nGONE`, `${planted}\nGONE`, 'y').ok, 'the other form\'s op is checked on its own arm');
    const xs = [1, 2, 3].flatMap((i) => ['A', 'B'].map((job) => ({ job, i })));
    assert(warmFirstOrder(xs).slice(0, 2).every((x: any) => x.i === 1), 'sample 1 of every cell is queued first');
    const gate = warmGate(); const order: string[] = [];
    let firstCall!: () => void; const firstCallDone = new Promise<void>((r) => { firstCall = r; });
    const fn = warmed(gate, true, async (t: any) => { order.push(`start ${t.job}${t.i}`); if (t.i === 1) { await firstCallDone; gate.open(t.job); order.push(`warm ${t.job}`); await new Promise((r) => setTimeout(r, 5)); } });
    const p2 = fn({ job: 'A', i: 2 }); const p1 = fn({ job: 'A', i: 1 });
    await new Promise((r) => setTimeout(r, 5)); assert(!order.includes('start A2'), 'a sibling started before its cell was warm');
    firstCall(); await Promise.all([p1, p2]);
    assert(order.indexOf('start A2') > order.indexOf('warm A'), `order: ${order.join(' · ')}`);
    const off: string[] = []; await warmed(warmGate(), false, async (t: any) => { off.push(String(t.i)); })({ job: 'Z', i: 2 }); assert(off.length === 1, '--no-warm-first never waits');
  });

  await test('LK13 (LAB-BATCH-TRANSPORT) the batch body = the production body except betas/fallbacks (where sent) and the two cache TTL leaves; any other difference is flagged; capture never reaches the network; batch results are keyed by custom_id; outside a batch scope the original method runs; batch pricing', async () => {
    const bt = require('./leg-replay-lab/batch-transport');
    const body = { model: 'claude-opus-5-5', max_tokens: 48000, system: [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'U' }], cache_control: { type: 'ephemeral' }, output_config: { effort: 'high' }, tools: [{ name: 't', input_schema: {} }], betas: ['server-side-fallback-2026-06-01'], fallbacks: [{ model: 'claude-opus-4-8' }] };
    const r = bt.toBatchParams(body, { ttl: '1h' });
    assert(JSON.stringify(r.dropped) === JSON.stringify(['betas', 'fallbacks']) && r.ttlPaths.length === 2, JSON.stringify(r));
    const ok = bt.allowedBatchDiff(body, '1h'); const diff = bt.bodyDiff(body, r.params);
    assert(diff.length === 4 && diff.every(ok), `diff ${diff}`);
    const mutated = { ...r.params, max_tokens: 1 }; assert(bt.bodyDiff(body, mutated).some((p: string) => !ok(p)), 'a changed max_tokens is not flagged');
    const sonnet = { ...body, model: 'claude-sonnet-5' } as any; delete sonnet.betas; delete sonnet.fallbacks;
    assert(bt.bodyDiff(sonnet, bt.toBatchParams(sonnet, { ttl: '1h' }).params).every(bt.allowedBatchDiff(sonnet, '1h')), 'sonnet differs beyond the ttl leaves');
    assert(!bt.allowedBatchDiff(sonnet, '1h')('fallbacks'), 'fallbacks may differ only where production sent it');
    const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');
    const proto = require('@anthropic-ai/sdk/resources/messages/messages').Messages.prototype;
    const before = proto.stream;
    const caps: any[] = []; const cap = bt.installBatchTransport({ mode: 'capture', ttl: '1h', onCapture: (c: any) => caps.push(c) });
    const client = new Anthropic({ apiKey: 'sk-ant-test-not-a-key' });
    const m = await client.messages.stream(body as any).finalMessage();
    assert(m.stop_reason === 'end_turn' && caps.length === 1 && caps[0].unexpected.length === 0, 'capture did not record the request');
    let threw = ''; try { client.messages.create(body as any); } catch (e) { threw = (e as Error).message; } assert(/never touch the network/.test(threw), 'capture mode let messages.create through');
    cap.uninstall(); assert(proto.stream === before, 'uninstall did not restore messages.stream');
    // Batch mode against a fake batches client: two requests, results returned in REVERSE order.
    const sentinel = function () { return { finalMessage: async () => ({ via: 'standard' }) }; }; proto.stream = sentinel;
    const submitted: any[] = [];
    const fakeClient = { messages: { batches: {
      create: async (b: any) => { submitted.push(b); return { id: 'mb_1', processing_status: 'in_progress' }; },
      retrieve: async () => ({ id: 'mb_1', processing_status: 'ended' }),
      results: async () => (async function* () { for (const q of [...submitted[0].requests].reverse()) yield { custom_id: q.custom_id, result: { type: 'succeeded', message: { echo: q.params.messages[0].content } } }; })(),
    } } };
    const t = bt.installBatchTransport({ mode: 'batch', ttl: '1h', windowMs: 10, pollMs: 1 });
    const self = { _client: fakeClient };
    const [a1, a2] = await bt.inBatchScope(true, () => Promise.all([proto.stream.call(self, { ...body, messages: [{ role: 'user', content: 'one' }] }).finalMessage(), proto.stream.call(self, { ...body, messages: [{ role: 'user', content: 'two' }] }).finalMessage()]));
    assert(a1.echo === 'one' && a2.echo === 'two', `results not keyed by custom_id: ${JSON.stringify([a1, a2])}`);
    assert(submitted.length === 1 && submitted[0].requests.length === 2 && !('fallbacks' in submitted[0].requests[0].params) && submitted[0].requests[0].params.cache_control.ttl === '1h', 'one batch, batch params');
    const outside = await proto.stream.call(self, body).finalMessage(); assert(outside.via === 'standard', 'outside a batch scope the original method must run (Harvesters stay standard)');
    t.uninstall(); proto.stream = before;
    assert(Math.abs(bt.batchCostUsd(10, 2, '1h') - 5.6) < 1e-9 && bt.batchCostUsd(10, 2, null) === 5, 'batch pricing');
  });

  await test('LNB1 (L-NB1) score-nb1 self-test both directions (B5 SECRET raw text + tool-call arguments, results not counted; B5-QUOTE <value> passes / clear value / dropped line / no quoted line fail; B5-aware Git quote; B3 unpinned ref read + ref-and-commit source, substitute / no ref / commit-without-ref / default-branch commit fail; B2-FIRST production order misses, held-first passes; NOPKG; NOFALSE; Author SECRET); every mutation is caught', () => {
    const { nb1SelfTest, NB1_MUTATIONS } = require('./leg-replay-lab/score-nb1');
    const ok = nb1SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of NB1_MUTATIONS) assert(!nb1SelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
  });

  await test('LNB2 (L-NB-a / L-NB-b) unpinned customer Git fixture: a read at a named ref is SERVED (no pin) with the ref\'s commit in the URI, the default branch serves the default commit, an unknown ref reads missing, a call to a service outside the fixture is unserved; loading refuses a PINNED service name, the platform-pinned repo, and refs on a pinned fixture; capture readiness is named not-applicable · author-chained plant patches every copy of the chained finalResponse and re-reads it', async () => {
    const fsx = require('fs'); const os = require('os'); const pth = require('path');
    const { loadFileFixture, createFixtureToolServer, fixtureCaptureReadiness } = require('./leg-replay-lab/fixture-tools');
    const mk = (spec: Record<string, unknown>) => { const d = fsx.mkdtempSync(pth.join(os.tmpdir(), 'lnb2-')); fsx.mkdirSync(pth.join(d, 'files', 'net'), { recursive: true }); fsx.writeFileSync(pth.join(d, 'files', 'net', 'a.cfg'), 'hostname a\n'); fsx.writeFileSync(pth.join(d, 'fixture.json'), JSON.stringify(spec)); return d; };
    const C1 = '1'.repeat(40), C2 = '2'.repeat(40);
    const fx = loadFileFixture(mk({ owner: 'acme-netops', repo: 'fabric-configs', commit: C1, unpinned: true, serviceNames: ['acme-git'], refs: { 'release-1': C2 } }));
    const srv = createFixtureToolServer(fx, null, { stub: true });
    const call = (svc: string, a: Record<string, unknown>) => srv.executeToolOnServer('s', 'services', { action: 'call', targetService: svc, tool: 'get_file_contents', arguments: { owner: 'acme-netops', repo: 'fabric-configs', ...a } });
    const uri = (r: any) => r.content[0].data.result.content.find((c: any) => c.type === 'resource')?.resource?.uri ?? null;
    const r1: any = await call('acme-git', { path: 'net/a.cfg', ref: 'release-1' }); assert(uri(r1) === `repo://acme-netops/fabric-configs/sha/${C2}/contents/net/a.cfg`, `ref read: ${uri(r1)}`);
    const r2: any = await call('acme-git', { path: 'net/a.cfg' }); assert(uri(r2) === `repo://acme-netops/fabric-configs/sha/${C1}/contents/net/a.cfg`, 'default branch');
    const r3: any = await call('acme-git', { path: 'net/a.cfg', ref: 'nope' }); assert(r3.content[0].data.result.isError === true, 'unknown ref → missing');
    const r4: any = await call('github-service', { path: 'net/a.cfg' }); assert(r4.stub === true, 'other service → stub');
    assert(srv.fixtureLog.map((e: any) => e.tier).join(',') === 'fixture-file,fixture-file,fixture-missing,unserved-fixture', srv.fixtureLog.map((e: any) => e.tier).join(','));
    assert((await fixtureCaptureReadiness(fx)).notApplicable, 'readiness named not-applicable');
    const refuses = (spec: Record<string, unknown>) => { try { loadFileFixture(mk(spec)); return false; } catch { return true; } };
    assert(refuses({ owner: 'acme-netops', repo: 'fabric-configs', commit: C1, unpinned: true, serviceNames: ['github-service'] }), 'a pinned service name as unpinned');
    assert(refuses({ owner: 'paichart', repo: 'paichart-lab-configs', commit: C1, unpinned: true, serviceNames: ['acme-git'] }), 'the platform-pinned repo through an unpinned service');
    assert(refuses({ owner: 'paichart', repo: 'paichart-lab-configs', commit: C1, refs: { x: C2 } }), 'refs on a pinned fixture');
    const { snapshotWithInputEdits } = require('./leg-replay-lab/input-edits');
    const d = fsx.mkdtempSync(pth.join(os.tmpdir(), 'lnb2e-'));
    fsx.writeFileSync(pth.join(d, 'p.json'), JSON.stringify({ id: 'p', appliesTo: ['author-chained:cmvmvu0v0001syxo6hz1h4q1y'], ops: [{ type: 'replace', old: 'community <<R>> ro', new: 'community CANARY ro' }] }));
    const entry = { executionId: 'cmvmvu0v0001syxo6hz1h4q1y', finalResponse: 'x community <<R>> ro y' };
    const snap: any = { author: { exec: { config: { inputContext: { chainedFrom: [entry] } } }, task: { inputContext: JSON.stringify({ chainedFrom: [entry] }) } }, children: [], childArtifacts: [] };
    const r = snapshotWithInputEdits(d, { id: 'n', inputEdits: 'p.json' }, snap);
    assert(r.snap.author.exec.config.inputContext.chainedFrom[0].finalResponse === 'x community CANARY ro y' && JSON.parse(r.snap.author.task.inputContext).chainedFrom[0].finalResponse === 'x community CANARY ro y', 'both copies patched');
    assert(snap.author.exec.config.inputContext.chainedFrom[0].finalResponse.includes('<<R>>'), 'the cached snapshot is untouched');
    let threw = false; try { fsx.writeFileSync(pth.join(d, 'q.json'), JSON.stringify({ id: 'q', appliesTo: ['author-chained:cmvmvu0v0001syxo6hz1h4q1y'], ops: [{ type: 'replace', old: 'absent', new: 'x' }] })); snapshotWithInputEdits(d, { id: 'n', inputEdits: 'q.json' }, snap); } catch { threw = true; }
    assert(threw, 'an op that does not apply is refused');
  });

  await test('LNB3 (L-NB2) score-nb2 self-test both directions (per-quote source split git/device, the F-NB1 clear-quote miss, tables are not quotes, another mask is masked, Author B5 incl. no-quote passes, VOID rule 0/5 and 1/5 VOID, 2/5 discriminates); every mutation is caught · device-pool plants: exact-count refusal, un-planting proves identity, an unplanted entry never moves', () => {
    const { nb2SelfTest, NB2_MUTATIONS } = require('./leg-replay-lab/score-nb2');
    const ok = nb2SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of NB2_MUTATIONS) assert(!nb2SelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
    const nf = require('./leg-replay-lab/network-fixtures');
    const env = (host: string, getter: string, out: unknown) => ({ tool: 'fetch_data', getter, host, from: { executionId: 'x', index: 0 }, result: { content: [{ type: 'data', data: { result: { structuredContent: { hosts: { [host]: { success: true, output: out } } } } } }] } });
    const pool = { serviceNames: ['d'], entries: [env('a', 'config', { running: 'snmp-server community <<R>> ro\nx' }), env('b', 'config', { running: 'snmp-server community <<R>> ro' }), env('a', 'snmp_information', { community: { '<<R>>': { mode: 'ro' } } })] };
    const plants = [{ host: 'a', getter: 'config', find: 'community <<R>> ro', replace: 'community CAN1 ro', count: 1 }, { host: 'a', getter: 'snmp_information', find: '"<<R>>":', replace: '"CAN1":', count: 1 }];
    const { pool: p2 } = nf.plantDevicePool(pool, plants);
    assert(JSON.stringify(p2.entries[0].result).includes('community CAN1 ro') && JSON.stringify(p2.entries[2].result).includes('"CAN1"'), 'planted');
    assert(JSON.stringify(p2.entries[1].result) === JSON.stringify(pool.entries[1].result), 'an unplanted entry never moves');
    assert(JSON.stringify(pool.entries[0].result).includes('<<R>>'), 'the source pool is untouched');
    assert(nf.provePlants(pool, p2, plants).length === 0, 'un-planting proves identity');
    let threw = false; try { nf.plantDevicePool(pool, [{ ...plants[0], count: 2 }]); } catch { threw = true; } assert(threw, 'a wrong count is refused');
    threw = false; try { nf.plantDevicePool(pool, [{ ...plants[0], host: 'zz' }]); } catch { threw = true; } assert(threw, 'a missing entry is refused');
    const tampered = JSON.parse(JSON.stringify(p2)); tampered.entries[1].result.content[0].data.result.structuredContent.hosts.b.output.running += ' ';
    assert(nf.provePlants(pool, tampered, plants).length > 0, 'a moved unplanted entry fails the proof');
  });

  await test('LN4 (L-N2-a) the lab held store passes the leg\'s declared Device sources through the shipping grammar + scope: the B-L2 window leg holds its declared device configs (device:ceos2 among them); without the declaration the device lane holds none; a refused Git ref is a named refusal (N-L3); a terraform store is unchanged (needs the gitignored snapshot cache — LL-N-34)', () => {
    const hs = require('./leg-replay-lab/held-store');
    const load = (id: string) => { const f = path.join(__dirname, 'leg-replay-lab/cache/snapshots', `${id}.json`); assert(fs.existsSync(f), `needs the lab snapshot cache (${id})`); return JSON.parse(fs.readFileSync(f, 'utf8')); };
    const bl2 = load('cmvn5amvd0059yxyawefjeq0t');
    const st = hs.buildLabHeldStore(bl2);
    assert(st.refs.some((r: any) => r.target === 'device:ceos2' && r.path === '/running-config'), 'B-L2 holds device:ceos2');
    const e = hs.frozenHarvesterEntry(bl2);
    const art = bl2.childArtifacts.find((a: any) => a.executionId === e.executionId && a.name === 'result.json');
    const noDecl = hs.buildLabHeldStoreFromResult({ executionId: e.executionId, taskId: e.taskId, povId: bl2.author.task.pov_id, resultJson: art.content, gitFileSourceLeg: true });
    assert(!noDecl.refs.some((r: any) => String(r.target).startsWith('device:')), 'mutation: without deviceLeg the device lane holds nothing');
    const nl3 = hs.buildLabHeldStore(load('cmvmwjdv50011yxo7jhk4jh13'));
    assert(nl3.refusals.some((r: any) => r.refusal === 'source-not-pinned') && nl3.refs.some((r: any) => r.target === 'device:ceos2'), 'N-L3: ceos1 refused source-not-pinned, ceos2 held');
    const tf = hs.buildLabHeldStore(load('cmvhpeoer00c8yxb8jf45osnm'));
    assert(tf.refs.length === 1 && !tf.refs.some((r: any) => String(r.target).startsWith('device:')), 'terraform store unchanged');
  });

  await test('LN5 (L-N2) score-n2 self-test both directions (SG-CLI configure block vs expected output, G-RESTORE partial vs full, G-N2 per clause, G-N5 finding vs clean, unheld handle named); every mutation is caught', () => {
    const { n2SelfTest, N2_MUTATIONS } = require('./leg-replay-lab/score-n2');
    const ok = n2SelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of N2_MUTATIONS) assert(!n2SelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
  });

  await test('LOA1 (L-OA) score-oa self-test both directions (refused side literal-403 / comparison / demo prose table / missing; admitted side full vs Run 1 shape; 000 note; placeholder + unlisted target; remap literal; edit digest; control status commands); every mutation is caught', () => {
    const { oaSelfTest, OA_MUTATIONS } = require('./leg-replay-lab/score-oa');
    const ok = oaSelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of OA_MUTATIONS) assert(!oaSelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
  });

  await test('LN6 (T2-REVIEWER-GATE-KEYS) the Reviewer bench table is driven by node config (scoring.reviewerGate), not node names: a non-k8s cell is read, the bar decides, too few valid samples read NOT MEASURED, an unconfigured node stays out; every mutation (name-keyed, ignore-bar, approve-blind) is caught', () => {
    const { reviewerBenchSelfTest } = require('./leg-replay-lab/score-reviewer-bench');
    const ok = reviewerBenchSelfTest();
    assert(ok.ok, ok.failures.join('; '));
    for (const mutate of ['name-keyed', 'ignore-bar', 'approve-blind']) assert(!reviewerBenchSelfTest({ mutate }).ok, `mutation ${mutate} not caught`);
  });

  await test('LN7 (L-N2-c + replay stub) a pre-net network Harvester gets gitDeviceComparison from the shipping function (B-L2: checked, 1 device compared, 4 differences) and the Author transcription reads it; a non-network snapshot is untouched; validationToolCalls computes in the lab (N-L4 positive control: 2 findings) instead of an enrichment error', async () => {
    const { withComputedHarvesterComparison } = require('./leg-replay-lab/device-comparison-patch');
    const { runAuthorLeafNets } = require('./leg-replay-lab/nets');
    const load = (id: string) => { const f = path.join(__dirname, 'leg-replay-lab/cache/snapshots', `${id}.json`); assert(fs.existsSync(f), `needs the lab snapshot cache (${id})`); return JSON.parse(fs.readFileSync(f, 'utf8')); };
    const bl2 = load('cmvn5amvd0059yxyawefjeq0t');
    const r = withComputedHarvesterComparison(bl2);
    assert(r.report.state === 'computed' && r.report.checked && r.report.comparedDevices === 1 && r.report.differences === 4, `B-L2 comparison ${JSON.stringify(r.report)}`);
    const fr = (s: any) => JSON.parse(s.childArtifacts.find((a: any) => a.executionId === s.author.exec.id && a.name === 'result.json').content).finalResponse;
    const leaf = await runAuthorLeafNets(r.snap, 'config_change_author', fr(bl2), 'lab-ln7');
    assert((leaf.stamped.gitDeviceComparison as any)?.checked === true, 'the Author transcription reads the computed stamp');
    assert(withComputedHarvesterComparison(load('cmvhpeoer00c8yxb8jf45osnm')).report.state === 'not-device-source-leg', 'terraform untouched');
    const nl4 = load('cmvmwxn2j00cnyxo6byrbyc1m');
    const l4 = await runAuthorLeafNets(nl4, 'config_change_author', fr(nl4), 'lab-ln7b');
    const v: any = l4.stamped.validationToolCalls;
    assert(v?.checked === true && Array.isArray(v.findings) && v.findings.length === 2 && !l4.errors.validationToolCalls, `N-L4 validationToolCalls ${JSON.stringify(v)?.slice(0, 200)}`);
  });

  // ── Config sources L-CS-N ($0 levers, 2026-11-04) ──
  const FWA3 = 'cmvyb2anc008djef0pzv52byj';
  const loadCached = (id: string) => { const f = path.join(__dirname, 'leg-replay-lab/cache/snapshots', `${id}.json`); assert(fs.existsSync(f), `needs the lab snapshot cache (${id}; self-host: snapshot --source local-db:<db>)`); return JSON.parse(fs.readFileSync(f, 'utf8')); };
  const withBlock = (snap: any, block: string) => { const c = JSON.parse(JSON.stringify(snap)); const d: string = c.leg.description; const i = d.indexOf('## Device sources'); assert(i >= 0, 'leg has a Device sources block'); const j = d.indexOf('\n## ', i + 3); c.leg.description = d.slice(0, i) + block + (j >= 0 ? d.slice(j) : ''); return c; };
  const LR_BLOCK = '## Device sources\nceos1: device-read — service ceos-lab-readonly\nceos2: live-read — service ceos-lab-readonly\n';
  await test('LCS1 (kind-gate.ts, S3/F15) the per-arm gate: open parses a planted live-read line, closed reads unknown-kind (reported, not refused), an open arm whose block does not parse is REFUSED; the gate is restored after every bind; a bad value is refused', async () => {
    const KG = require('./leg-replay-lab/kind-gate');
    const DS = require('../lib/agents/harness/device-sources');
    assert(KG.armKindGate(undefined, 'a') === null && KG.armKindGate({ liveReadKind: 'open' }, 'a') === 'open', 'armKindGate');
    let threw = false; try { KG.armKindGate({ liveReadKind: 'yes' }, 'a'); } catch { threw = true; } assert(threw, 'a bad liveReadKind is refused');
    const snap = withBlock(loadCached(FWA3), LR_BLOCK);
    const open = await KG.withArmKindGate('open', () => KG.kindGateCheck(snap, 'open', 'x/rc'));
    // 2026-11-05 (1.26.0 merged, the tree constant is now TRUE): was `=== false` (the constant while the text was a lab candidate). Same intent, stated against the constant itself (LL-CS-13).
    assert(DS.liveReadKindEnabled() === DS.LIVE_READ_KIND_ENABLED, 'the gate is restored to the tree constant after withArmKindGate');
    assert(open.effectiveOpen && open.leg.state === 'parsed' && open.leg.liveReadEntries === 1 && open.refusal === null, `open ${JSON.stringify(open.leg)}`);
    const closed = await KG.withArmKindGate('closed', () => KG.kindGateCheck(snap, 'closed', 'x/rb'));
    assert(!closed.effectiveOpen && closed.leg.state === 'unparseable' && closed.closedArmUnknownKind && closed.refusal === null, `closed ${JSON.stringify(closed.leg)}`);
    const bad = withBlock(loadCached(FWA3), '## Device sources\nceos2: device-read — service ceos-lab-readonly\nceos2: live-read — service ceos-lab-readonly\n');
    const refused = await KG.withArmKindGate('open', () => KG.kindGateCheck(bad, 'open', 'x/rc'));
    assert(refused.refusal && /live-read-not-alone/.test(refused.refusal), `an unparseable open-arm block is refused: ${refused.refusal}`);
    // 2026-11-05: the tree constant is now TRUE, so an un-bound read cannot show a leak; the leak is measured inside an outer CLOSED bind (same intent, LL-CS-13).
    let leaked = false; await KG.withArmKindGate('closed', async () => { try { await KG.withArmKindGate('open', () => { throw new Error('boom'); }); } catch { leaked = DS.liveReadKindEnabled(); } }); assert(!leaked, 'a throw inside the bind does not leak an open gate');
    const stored = await KG.withArmKindGate('open', () => KG.kindGateCheck(loadCached(FWA3), 'open', 'x/rc'));
    assert(stored.refusal === null && stored.leg.liveReadLine === false, 'a stored v1 block on an open arm is not refused');
  });
  await test('LCS2 (snapshot.ts + self-host-provenance.ts, ME-B3/F14) the R-FWA3 self-host snapshot carries provenance; P0-P4 pass against the lab pins (protocol 4df1b4c8, both templates, opus-5-5/sonnet-5, approved/92); a wrong pin, a production snapshot and a wrong expectation each fail', () => {
    const { selfHostProvenanceChecks } = require('./leg-replay-lab/self-host-provenance');
    const g = JSON.parse(fs.readFileSync(path.join(__dirname, 'leg-replay-lab/golden/golden-set.json'), 'utf8'));
    const snap = loadCached(FWA3);
    assert(snap.provenance?.kind === 'self-host' && /^3422efe1/.test(snap.provenance.dumpSha256 ?? ''), `provenance ${JSON.stringify(snap.provenance)}`);
    const pins = { protocols: { 'network-provisioning-protocol': { version: '1.25.0', sha256: g.pins.protocols['network-provisioning-protocol'].sha256 } }, templates: Object.fromEntries(Object.values<any>(g.pins.templates).map((t) => [t.name, { role: t.role, sha256: t.sha256 }])) };
    const rows = [{ name: 'network-provisioning-protocol', version: '1.25.0', sha256: g.pins.protocols['network-provisioning-protocol'].sha256 }];
    const ok = selfHostProvenanceChecks(snap, rows, pins, { approved: true, confidence: 92 });
    assert(ok.length === 8 && ok.every((c: any) => c.ok), `all pass: ${ok.filter((c: any) => !c.ok).map((c: any) => c.name + ' ' + c.detail).join(' | ')}`);
    const wrongPin = selfHostProvenanceChecks(snap, [{ ...rows[0], sha256: 'f'.repeat(64) }], pins);
    assert(wrongPin.filter((c: any) => !c.ok).map((c: any) => c.name).join() === 'P1 protocol (author),P1 protocol (reviewer)', 'a wrong install sha fails P1');
    assert(!selfHostProvenanceChecks(snap, rows, pins, { approved: false, confidence: 92 }).find((c: any) => c.name === 'P4 persisted verdict').ok, 'a wrong expectation fails P4');
    const prod = loadCached('cmvn5amvd0059yxyawefjeq0t');
    assert(!selfHostProvenanceChecks(prod, rows, pins)[0].ok, 'a production snapshot fails P0');
    const { provenanceRefusals } = require('./leg-replay-lab/lab');
    assert(provenanceRefusals([{ id: 'R', authorExecutionId: FWA3, provenance: 'self-host' }], loadCached).length === 0, 'declared self-host = cached self-host');
    assert(provenanceRefusals([{ id: 'R', authorExecutionId: FWA3 }], loadCached).length === 1, 'a self-host snapshot under a node that does not declare it is refused');
    assert(provenanceRefusals([{ id: 'B', authorExecutionId: 'cmvn5amvd0059yxyawefjeq0t', provenance: 'self-host' }], loadCached).length === 1, 'a production snapshot under a self-host node is refused');
  });
  await test('LCS3 (standing-bench.ts, owner G4-c) NET-FWA3-EDGE reproduces its STORED (wrong) outcome approved/92; a reaching lab must declare it on every reaching arm with a do-not-ship refuse gate; a lab that does not reach it owes nothing', () => {
    const sb = require('./leg-replay-lab/standing-bench');
    const rows = sb.standingBenchSelfTest(loadCached);
    // s2 (2026-11-07): VLG-I3-GIT-ONLY joined the bench — check NET-FWA3-EDGE by id and every case's frozen record.
    assert(rows.length === sb.loadStandingBench().cases.length && rows.every((r: any) => r.ok) && rows.some((r: any) => r.id === 'NET-FWA3-EDGE'), `self-test ${JSON.stringify(rows)}`);
    const dir = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n');
    const exp = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    // s3 (2026-11-08): NET-APPLY-WHOLE-FILE joined after L-CS-N ran; L-CS-N's lock is read on the cases it was registered under.
    const lcsnProblems = (e: any) => sb.standingBenchProblems(e, dir).filter((p: string) => !/NET-APPLY-WHOLE-FILE/.test(p));
    assert(lcsnProblems(exp).length === 0, `L-CS-N declares it: ${lcsnProblems(exp).join(' | ')}`);
    const noDecl = { ...exp, standingBench: [] };
    assert(sb.standingBenchProblems(noDecl, dir).some((p: string) => /not declared/.test(p)), 'an undeclared reached case is a problem');
    const oneArm = { ...exp, nodes: exp.nodes.map((n: any) => (n.id === 'R-FWA3' ? { ...n, variants: ['rb'] } : n)) };
    assert(sb.standingBenchProblems(oneArm, dir).some((p: string) => /does not run on reaching arm/.test(p)), 'a reaching arm without the node is a problem');
    const noGate = { ...exp, nodes: exp.nodes.map((n: any) => (n.id === 'R-FWA3' ? { ...n, scoring: {} } : n)) };
    assert(sb.standingBenchProblems(noGate, dir).some((p: string) => /doNotShip/.test(p)), 'a node without the do-not-ship refuse gate is a problem');
    // an arm whose only nodes are Harvester cells (or that is authorOnly) runs no Reviewer: the standing case is not reached by it
    const hOnly = { variants: { hc: { edits: ['edits/network-provisioning-1.26.0.json'] }, ac: { edits: ['edits/network-provisioning-1.26.0.json'], authorOnly: true } }, nodes: [{ id: 'H', authorExecutionId: 'x', variants: ['hc'], harvesterOnly: true }, { id: 'A', authorExecutionId: 'y', variants: ['ac'] }] };
    assert(sb.standingBenchProblems(hOnly, dir).length === 0, `harvester-only / authorOnly arms reach no Reviewer: ${sb.standingBenchProblems(hOnly, dir).join(' | ')}`);
    const unreached = { variants: { base: { edits: [] } }, nodes: [] };
    assert(sb.standingBenchProblems(unreached, dir).length === 0, 'a lab with no lever on the reader owes nothing');
  });
  await test('LCS4 (network-fixtures.ts buildRigPool, F14) the devext PRE-redaction pool: identity-proved, every placeholder (incl. the R10 v10 garble) restored and reversed byte for byte, the ceos2 Loopback11 10.99.0.2/32 witness present, rig named per entry; a wrong plant count, a missing witness and a surviving placeholder each refuse', () => {
    const nf = require('./leg-replay-lab/network-fixtures');
    const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n/fixtures/device-plants.json'), 'utf8'));
    const sources = spec.sourceExecutionIds.map((id: string) => ({ executionId: id, toolCalls: JSON.parse(loadCached(id).author.resultJson).toolCalls }));
    const r = nf.buildRigPool(sources, spec);
    assert(r.pool.entries.length === 6 && r.pool.entries.every((e: any) => e.rig === 'devext') && r.witness.length === 2, `pool ${r.pool.entries.length} entries`);
    // O-4: ceos2 interfaces / interfaces_ip DERIVED from the stored multi-getter read, each = its stored sub-object
    const der = r.pool.entries.filter((e: any) => e.derived);
    assert(der.length === 2 && der.every((e: any) => e.host === 'ceos2' && /^split:cmvyboicf00cxjef0n63qykau#3$/.test(e.derived)), `derived ${JSON.stringify(der.map((e: any) => [e.host, e.getter, e.derived]))}`);
    const core = JSON.parse(loadCached('cmvyboicf00cxjef0n63qykau').author.resultJson).toolCalls[3].result.content[0].data.result.structuredContent.hosts.ceos2.output;
    for (const e of der) {
      const o = e.result.content[0].data.result.structuredContent.hosts.ceos2.output;
      assert(JSON.stringify(Object.keys(o)) === JSON.stringify([e.getter]) && JSON.stringify(o[e.getter]) === JSON.stringify(core[e.getter]), `${e.getter}: exactly the stored sub-object`);
      assert(JSON.stringify(e.result.content[0].data.arguments.getters) === JSON.stringify([e.getter]), `${e.getter}: single-getter arguments`);
    }
    // IDENTITY: the core registration id re-stamped to the edge's on every ceos2 entry, exactly once
    assert(JSON.stringify(r.restamped) === JSON.stringify(['ceos2/config', 'ceos2/interfaces', 'ceos2/interfaces_ip']) && !JSON.stringify(r.pool.entries.map((e: any) => e.result)).includes('cmvybolq0008ojeem0x71vu7m'), `restamped ${JSON.stringify(r.restamped)}`);
    const thr = (f: () => unknown, re: RegExp) => { try { f(); return false; } catch (e) { return re.test((e as Error).message); } };
    assert(thr(() => nf.buildRigPool(sources, { ...spec, plants: spec.plants.map((p: any, i: number) => (i === 0 ? { ...p, count: 2 } : p)) }), /occurs 1 times/), 'a wrong plant count refuses');
    assert(thr(() => nf.buildRigPool(sources, { ...spec, witness: { ...spec.witness, mustContain: ['ip address 10.99.0.250/32'] } }), /witness/), 'a missing witness refuses');
    assert(thr(() => nf.buildRigPool(sources, { ...spec, plants: spec.plants.slice(0, 5) }), /placeholder survives/), 'a surviving placeholder refuses');
  });
  await test('LCS5 (live-evidence-patch.ts, L-CS-a / ME-B1) the seam: absent module ⇒ not-built + snapshot UNCHANGED; through an injected computer every stored Harvester copy is stamped and re-read, an already-stamped copy is left alone, a non-network leg is untouched, the computer receives the leg declaration resolved under the bound gate; a module with a different export shape throws', async () => {
    const LE = require('./leg-replay-lab/live-evidence-patch');
    const KG = require('./leg-replay-lab/kind-gate');
    const bl2 = loadCached('cmvn5amvd0059yxyawefjeq0t');
    const absent = LE.withComputedLiveEvidence(bl2, LE.loadLiveEvidenceComputer(path.join(__dirname, 'leg-replay-lab/__no_such_module__')));
    assert(absent.report.state === 'not-built' && absent.snap === bl2, 'absent ⇒ not-built, the same snapshot object');
    const seen: any[] = [];
    const fake = (sources: any, toolCalls: any) => { seen.push({ state: sources.state, kinds: sources.state === 'parsed' ? sources.entries.map((e: any) => e.kind) : [], calls: Array.isArray(toolCalls) ? toolCalls.length : -1 }); return { items: 2, liveDeclared: 1, liveRead: 1, liveNotRead: [], gitOnly: [], notApplicable: 0, summary: 'all-read' }; };
    const r = LE.withComputedLiveEvidence(bl2, fake);
    assert(r.report.state === 'computed' && r.report.copies >= 1 && r.fact.point === 'harvester', `computed ${JSON.stringify(r.report)}`);
    const h = r.report.harvesterExecutionId;
    for (const a of r.snap.childArtifacts.filter((x: any) => x.executionId === h && x.name === 'result.json')) assert(JSON.parse(a.content).liveEvidence?.summary === 'all-read', 'every copy stamped');
    assert(!JSON.parse(bl2.childArtifacts.find((x: any) => x.executionId === h && x.name === 'result.json').content).liveEvidence, 'the cached snapshot is not written');
    assert(LE.withComputedLiveEvidence(r.snap, fake).report.state === 'already-stamped', 'an already-stamped copy is left alone');
    assert(LE.withComputedLiveEvidence(loadCached('cmvhpeoer00c8yxb8jf45osnm'), fake).report.state === 'not-device-source-leg', 'terraform untouched');
    const fw = withBlock(loadCached(FWA3), LR_BLOCK);
    await KG.withArmKindGate('open', () => LE.withComputedLiveEvidence(fw, fake));
    assert(JSON.stringify(seen[seen.length - 1].kinds) === '["device-read","live-read"]', `the computer saw the open-gate declaration ${JSON.stringify(seen[seen.length - 1])}`);
    const applies = (pi: any) => /^1\.(2[6-9]|[3-9]\d)\./.test(String(pi?.delta?.version ?? ''));
    const below = LE.withComputedLiveEvidence(bl2, fake, { protocol: { name: 'network-provisioning-protocol', version: '1.25.0' }, versionApplies: applies });
    assert(below.report.state === 'not-stamped-version' && below.snap === bl2, 'below the released version ⇒ NOT_STAMPED, snapshot unchanged (ME-B4)');
    const at = LE.withComputedLiveEvidence(bl2, fake, { protocol: { name: 'network-provisioning-protocol', version: '1.26.0' }, versionApplies: applies });
    assert(at.report.state === 'computed', 'at the released version ⇒ computed');
    const { armComposedProtocol } = require('./leg-replay-lab/lab');
    assert(armComposedProtocol({ variants: { rc: { composedVersion: '1.26.0' } } }, 'rc', { name: 'n', version: '1.25.0+rc' }).version === '1.26.0'
      && armComposedProtocol({ variants: { rb: {} } }, 'rb', { name: 'n', version: '1.25.0' }).version === '1.25.0', 'armComposedProtocol');
    const tmp = path.join(out, 'bad-live-evidence.js'); fs.writeFileSync(tmp, 'exports.computeLiveEvidence = function (a) { return {}; };');
    let threw = false; try { LE.loadLiveEvidenceComputer(tmp); } catch (e) { threw = /seam expects 3/.test((e as Error).message); } assert(threw, 'a one-parameter export is refused');
  });
  await test('LCS6 (score-n1.ts kind union) the scorer kind union = the shipping DeviceSourceKind list; n1-self-test green and its live-read-blind mutation RED', () => {
    const { N1_KIND_UNION_PIN, n1SelfTest } = require('./leg-replay-lab/score-n1');
    const DS = require('../lib/agents/harness/device-sources');
    assert(JSON.stringify(Object.keys(N1_KIND_UNION_PIN).sort()) === JSON.stringify([...DS.DEVICE_SOURCE_KINDS].sort()), 'union = shipping kinds');
    assert(n1SelfTest().ok, `n1 self-test ${n1SelfTest().failures.join(' | ')}`);
    assert(!n1SelfTest({ mutate: 'live-read-blind' }).ok, 'live-read-blind is RED');
  });

  await test('LCS7 (L-CS-N capture, LL-N-39) through the SHIPPING capture: a live-read device read whole is NOT held (live-read-evidence-only, gate open) while the same read declared device-read IS held (gate closed) — on the devext edge harvest + the re-stamped pool ceos2 read', async () => {
    const { buildLabHeldStore, frozenHarvesterEntry } = require('./leg-replay-lab/held-store');
    const KG = require('./leg-replay-lab/kind-gate');
    const base = loadCached(FWA3); const h = frozenHarvesterEntry(base);
    const pool = JSON.parse(fs.readFileSync(path.join(__dirname, 'leg-replay-lab/cache/cs-n/device-pool-devext.json'), 'utf8'));
    const c2 = pool.entries.find((e: any) => e.host === 'ceos2' && e.getter === 'config');
    const URL = 'https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/descriptors/ceos-lab-readonly-descriptor.json';
    const store = async (gate: string, kind: string) => {
      const s = JSON.parse(JSON.stringify(base));
      s.leg.description = s.leg.description.replace(`ceos1: device-read — service ${URL}`, `ceos1: device-read — service ${URL}\nceos2: ${kind} — service ${URL}`);
      for (const a of s.childArtifacts.filter((x: any) => x.executionId === h.executionId && x.name === 'result.json')) {
        const r = JSON.parse(a.content);
        const t = JSON.parse(JSON.stringify(r.toolCalls.find((c: any) => JSON.stringify(c.arguments).includes('getters') && JSON.stringify(c.arguments).includes('config'))));
        const args = typeof t.arguments === 'string' ? JSON.parse(t.arguments) : t.arguments;
        args.arguments = JSON.stringify({ getters: ['config'], filter_name: 'ceos2', getters_options: { config: { retrieve: 'running' } } });
        t.arguments = args; t.result = c2.result; r.toolCalls.push(t); a.content = JSON.stringify(r);
      }
      return KG.withArmKindGate(gate, () => buildLabHeldStore(s));
    };
    const open = await store('open', 'live-read');
    assert(open.refs.length === 1 && open.refusals.length === 1 && open.refusals[0].refusal === 'live-read-evidence-only', `open ${JSON.stringify(open.refusals)}`);
    const closed = await store('closed', 'device-read');
    assert(closed.refs.length === 2 && closed.refusals.length === 0, `closed refs ${closed.refs.length} refusals ${JSON.stringify(closed.refusals)}`);
  });
  await test('LCS8 (O-2(a) protocol injection) the arm\'s composed delta reaches the leaf nets: at 1.26.0 the Author transcribes the Harvester\'s liveEvidence, at 1.25.0 (and with none) it is NOT_STAMPED — production\'s population rule, on the deployed lib', async () => {
    const LE = require('./leg-replay-lab/live-evidence-patch');
    const { runAuthorLeafNets } = require('./leg-replay-lab/nets');
    const { armProtocolInjection } = require('./leg-replay-lab/lab');
    const s = loadCached(FWA3);
    const patched = LE.withComputedLiveEvidence(s, undefined, { protocol: { name: 'network-provisioning-protocol', version: '1.26.0' } });
    assert(patched.report.state === 'computed', `patch ${JSON.stringify(patched.report)}`);
    const text = JSON.parse(s.author.resultJson).finalResponse;
    const pi = (v: string) => armProtocolInjection({ variants: { x: { composedVersion: v } } }, 'x', { name: 'network-provisioning-protocol', version: '1.25.0' });
    const at = await runAuthorLeafNets(patched.snap, 'config_change_author', text, 'lcs8-a', undefined, undefined, pi('1.26.0'));
    const below = await runAuthorLeafNets(patched.snap, 'config_change_author', text, 'lcs8-b', undefined, undefined, pi('1.25.0'));
    const none = await runAuthorLeafNets(patched.snap, 'config_change_author', text, 'lcs8-c');
    assert((at.stamped.liveEvidence as any)?.checked === true && (at.stamped.liveEvidence as any)?.point === 'author-transcription', `1.26.0 ${JSON.stringify(at.stamped.liveEvidence)?.slice(0, 160)}`);
    assert(!below.stamped.liveEvidence && !none.stamped.liveEvidence, `below/none stamped: ${JSON.stringify(below.stamped.liveEvidence)} ${JSON.stringify(none.stamped.liveEvidence)}`);
    const direct = LE.withComputedLiveEvidence(s, (_src: any, calls: any) => ({ items: Array.isArray(calls) ? calls.length : -1 }), { protocol: { name: 'network-provisioning-protocol', version: '1.26.0' }, versionApplies: () => true }, { toolCalls: [1, 2, 3] });
    assert(direct.report.state === 'computed' && direct.fact.items === 3 && direct.snap === s, 'direct mode computes over the given calls and patches nothing');
  });
  await test('LCS9 (score-csn.ts) the L-CS-N scorer reads every case as pre-registered, the scope definition and the git-file-only warning id are the candidate text VERBATIM, and each of its 9 mutations is RED', () => {
    const { csnSelfTest } = require('./leg-replay-lab/score-csn');
    const cand = fs.readFileSync(path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n/protocols/network-provisioning-protocol@1.25.0.rc.md'), 'utf8');
    const ok = csnSelfTest({ candidateText: cand });
    assert(ok.ok, ok.failures.join(' | '));
    for (const m of ['held-blind', 'held-loose', 'alloc-regex', 'alloc-blind', 'dv-regex', 'ref-blind', 'nopkg-blind', 'limit-blind', 'overlap-blind', 'reason-blind', 'void-blind', 'warn-blind']) assert(!csnSelfTest({ mutate: m }).ok, `${m} is not caught`);
  });

  await test('LCS10 (git-harvest-plant.ts + restampPersisted, owner 2026-11-05) the Git-only re-cast: the frozen Harvester\'s calls become fixture Git reads (shipping persist shape), the shipping capture holds both Git files, L-CS-a reads gitOnly [ceos1, ceos2], and the planted R-FWA3-GIT-BOTH package re-stamps PURELY 2/2 with the free pool in the diff', async () => {
    const GH = require('./leg-replay-lab/git-harvest-plant');
    const { buildLabHeldStore, labResolveHeldFiles, labHeldViewFields } = require('./leg-replay-lab/held-store');
    const LE = require('./leg-replay-lab/live-evidence-patch');
    const KG = require('./leg-replay-lab/kind-gate');
    const { pureStamp } = require('./leg-replay-lab/lab-sample');
    const { r9VersionInEffect } = require('../lib/agents/harness/sanitize-chained-output');
    const { applyEdits } = require('./leg-replay-lab/edits');
    const E = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n');
    const URL = 'https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/descriptors/ceos-lab-readonly-descriptor.json';
    const base = JSON.parse(JSON.stringify(loadCached(FWA3)));
    base.leg.description = base.leg.description.replace(`ceos1: device-read — service ${URL}`, 'ceos1: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos1-startup.cfg\nceos2: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos2-startup.cfg');
    const g = await GH.withGitHarvest(base, E, { fixture: '../../fixtures/l-n1-0b35ce3', paths: ['network/base/ceos1-startup.cfg', 'network/base/ceos2-startup.cfg'] });
    assert(g.report.calls === 2 && g.report.commit.startsWith('0b35ce31') && g.snap !== base, `report ${JSON.stringify(g.report)}`);
    const store = await KG.withArmKindGate('open', () => buildLabHeldStore(g.snap));
    assert(JSON.stringify(store.refs.map((r: any) => r.path)) === JSON.stringify(['/network/base/ceos1-startup.cfg', '/network/base/ceos2-startup.cfg']) && store.refusals.length === 0, `held ${JSON.stringify(store.refs.map((r: any) => r.path))} ${JSON.stringify(store.refusals)}`);
    const le = await KG.withArmKindGate('open', () => LE.withComputedLiveEvidence(g.snap, undefined, { protocol: { name: 'network-provisioning-protocol', version: '1.26.0' } }));
    assert(JSON.stringify((le.fact as any).gitOnly.map((x: any) => x.device)) === '["ceos1","ceos2"]' && (le.fact as any).liveDeclared === 0, `fact ${JSON.stringify(le.fact)?.slice(0, 200)}`);
    const plant = JSON.parse(fs.readFileSync(path.join(E, 'plants/R-FWA3-GIT-BOTH.plant.json'), 'utf8'));
    const text = applyEdits(JSON.parse(base.author.resultJson).finalResponse, [plant], `author:${FWA3}`).text;
    const r9 = r9VersionInEffect();
    const fields = await labHeldViewFields(store);
    const resolved = await labResolveHeldFiles(store, r9)(fields.heldView, { authorTaskId: String(base.author.task.id), authorStageId: base.author.task.stage_id ?? null, scope: base.author.task.pov_id ?? null, legTaskId: String(base.leg.id) });
    const st = pureStamp(text, resolved.files, resolved.refs, r9);
    assert(st.fact.state === 'applied' && st.fact.applied === 2 && st.fact.total === 2, `stamp ${JSON.stringify(st.fact).slice(0, 200)}`);
  });
  await test('LCS11 (input-edits contract:interfaceContract + contract-devices fold, ADDENDUM (e)) R-CONTRACT-OOS patches EVERY stored contract copy (leg, Author/Reviewer task + exec config) and the live-evidence fact then names oob-console1 as contract-named, not declared; R-FWA3 names ceos2, R-FWA3-GIT-BOTH names nothing; a copy that does not take the edit is REFUSED (mutation RED)', async () => {
    const { snapshotWithInputEdits } = require('./leg-replay-lab/input-edits');
    const LE = require('./leg-replay-lab/live-evidence-patch');
    const KG = require('./leg-replay-lab/kind-gate');
    const E = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n');
    const ic = (x: any) => (typeof x === 'string' ? JSON.parse(x) : x);
    const fact = async (snap: any) => (await KG.withArmKindGate('open', () => LE.withComputedLiveEvidence(snap, undefined, { protocol: { name: 'network-provisioning-protocol', version: '1.26.0' } }))).fact as any;
    const oos = snapshotWithInputEdits(E, { id: 'R-CONTRACT-OOS', inputEdits: 'node-inputs/r-contract-oos.json' }, loadCached(FWA3));
    const copies: string[] = oos.report.targets['contract:interfaceContract'].copies;
    assert(copies.length === 5 && copies.includes('leg.inputContext') && copies.includes('reviewer.exec.config.inputContext'), `copies ${JSON.stringify(copies)}`);
    for (const c of [oos.snap.leg.inputContext, oos.snap.author.task.inputContext, oos.snap.author.exec.config.inputContext, oos.snap.reviewer.task.inputContext, oos.snap.reviewer.exec.config.inputContext]) {
      const k = ic(c).interfaceContract;
      assert(k.deviceSources['network-provisioning-core'].some((l: string) => l.startsWith('oob-console1: device-read')) && k.outOfScope.some((l: string) => l.startsWith('oob-console1,')), 'a copy lacks the planted contract');
    }
    const fOos = await fact(oos.snap);
    assert(JSON.stringify(fOos.contractNotDeclared) === '["oob-console1"]', `OOS contractNotDeclared ${JSON.stringify(fOos.contractNotDeclared)}`);
    const fFwa3 = await fact(loadCached(FWA3));
    assert(JSON.stringify(fFwa3.contractNotDeclared) === '["ceos2"]', `R-FWA3 contractNotDeclared ${JSON.stringify(fFwa3.contractNotDeclared)}`);
    const both = snapshotWithInputEdits(E, { id: 'R-FWA3-GIT-BOTH', inputEdits: 'node-inputs/r-fwa3-git-both.json' }, loadCached(FWA3));
    const fBoth = await fact(both.snap);
    assert(!fBoth.contractNotDeclared || fBoth.contractNotDeclared.length === 0, `GIT-BOTH contractNotDeclared ${JSON.stringify(fBoth.contractNotDeclared)}`);
    // Mutation: one copy (the Reviewer's frozen config) no longer carries the anchor — the patch must refuse, never patch the rest.
    const bad = JSON.parse(JSON.stringify(loadCached(FWA3)));
    const rc = ic(bad.reviewer.exec.config.inputContext); rc.interfaceContract.outOfScope = [];
    bad.reviewer.exec.config.inputContext = typeof bad.reviewer.exec.config.inputContext === 'string' ? JSON.stringify(rc) : rc;
    let refused = false; try { snapshotWithInputEdits(E, { id: 'R-CONTRACT-OOS', inputEdits: 'node-inputs/r-contract-oos.json' }, bad); } catch (e) { refused = /reviewer\.exec\.config\.inputContext|anchor occurs 0/.test((e as Error).message); }
    assert(refused, 'a contract copy that does not take the edit must be refused');
  });
  await test('LCS12 (ADDENDUM (h)) harvestFromSample re-casts the frozen Harvester with a step-3 LR-EDGE lab sample (every stored copy; the sample\'s protocol sha pinned; a wrong sha REFUSED) and the computed fact reads ceos2 live-read READ; patchHarvesterEntry still refuses a frozen heldIndex unless a held lab-sample arm drops it', async () => {
    const GH = require('./leg-replay-lab/git-harvest-plant');
    const { patchHarvesterEntry } = require('./leg-replay-lab/chain');
    const { snapshotWithInputEdits } = require('./leg-replay-lab/input-edits');
    const LE = require('./leg-replay-lab/live-evidence-patch');
    const KG = require('./leg-replay-lab/kind-gate');
    const E = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n');
    const SRC = 'lab-sample:2026-11-05T01-37-45-2026-11-04-config-sources-net-l-cs-n/LR-EDGE/hc/1';
    const runDir = path.join(__dirname, 'leg-replay-lab/runs/2026-11-05T01-37-45-2026-11-04-config-sources-net-l-cs-n');
    if (!fs.existsSync(runDir)) { console.log('   (LCS12 skipped: the step-3 run folder is not in this tree — runs/ is gitignored)'); return; }
    const sha = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(runDir, 'LR-EDGE/hc/protocol.md'), 'utf8'), 'utf8').digest('hex');
    const base = snapshotWithInputEdits(E, { id: 'R-FWA3-FIXED', inputEdits: 'node-inputs/r-le-none.json' }, loadCached(FWA3)).snap;
    const r = GH.withSampleHarvest(base, SRC, sha);
    assert(r.report.copies >= 1 && r.report.calls === 5, `report ${JSON.stringify(r.report)}`);
    let refused = false; try { GH.withSampleHarvest(base, SRC, '0'.repeat(64)); } catch (e) { refused = /protocol/.test((e as Error).message); }
    assert(refused, 'a sample that read another protocol text must be refused');
    const fact = (await KG.withArmKindGate('open', () => LE.withComputedLiveEvidence(r.snap, undefined, { protocol: { name: 'network-provisioning-protocol', version: '1.26.0' } }))).fact as any;
    assert(fact.summary === 'all-read' && fact.liveRead === 2 && (!fact.liveNotRead || fact.liveNotRead.length === 0), `fact ${JSON.stringify(fact).slice(0, 240)}`);
    const before = (await KG.withArmKindGate('open', () => LE.withComputedLiveEvidence(base, undefined, { protocol: { name: 'network-provisioning-protocol', version: '1.26.0' } }))).fact as any;
    assert(before.summary === 'some-not-read', `unplanted twin reads ${before.summary} (must be some-not-read: the plant must move the fact)`);
    const arch = loadCached('cmvyb0tr70084jef0j273kup8');
    const rr = { executionId: 'lab-x', finalResponse: 'x'.repeat(40), confidenceScore: 80, qualityMetrics: null, markerPresence: null, rollbackContainment: null, derivationContainment: null };
    let held = false; try { patchHarvesterEntry(arch.author.exec, rr); } catch (e) { held = /carries heldIndex/.test((e as Error).message); }
    assert(held, 'a frozen heldIndex must still be refused by default');
    const { ctx } = patchHarvesterEntry(arch.author.exec, rr, { dropProductionHeld: true });
    const he = ctx.chainedFrom.find((e: any) => e?.agentRole === 'infra_state_harvester');
    assert(!('heldIndex' in he) && he.executionId === 'lab-x', 'the dropped production capture must not survive on the replayed entry');
  });

  // ── VALUE-LEG-GIT (2026-11-06, model-evaluation): the value lane (value-lane.ts L-VLG-a/b/c, replay-prisma `legReads`). ──
  const VLG_E = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-06-value-leg-git');
  const VLG_H = 'cmw478njh002kyx2v0v0t3goy', VLG_X = 'cmw47bixl0032yx31135j69pn', VLG_X1 = 'cmvvz3xmh003hyx8jwcqt4xmp';
  await test('LVLG1 replay-prisma legReads serves the three leg-row projections production issues (owning leg by stage, declaration columns, contract) through the SHIPPING readers — and only when asked (default: the shape still throws)', async () => {
    const { buildReplayPrisma } = require('./leg-replay-lab/replay-prisma');
    const { resolveOwningLeg } = require('../lib/agents/harness/program-protocol');
    const snap = loadCached(VLG_H);
    const stageId = snap.leg.metadata.pipelineStageId;
    const on = buildReplayPrisma(snap, [], { legReads: true }).client;
    const r = await resolveOwningLeg(on, stageId);
    assert(r.kind === 'one' && r.legTaskId === snap.leg.id, `owning leg ${JSON.stringify(r).slice(0, 160)}`);
    const off = buildReplayPrisma(snap, []).client;
    let threw = false; try { await resolveOwningLeg(off, stageId); } catch (e) { threw = /unsupported query shape/.test((e as Error).message); }
    assert(threw, 'without legReads the owning-leg query must still THROW (every earlier experiment unchanged)');
    const { readLegDeviceSources } = require('../lib/agents/harness/device-sources-read');
    const d = await readLegDeviceSources(on, { kind: 'self', legId: snap.leg.id, heldCapable: false, deviceSource: true, deviceSourceLane: 'value' });
    assert(d.state === 'snapshot-absent', `the stored canary value leg took no snapshot — reads ${d.state}`);
  });
  await test('LVLG2 (GOLDEN-VALUE-LIVE) the shipping value-leg containment net over a replayed Architect text: the PERSISTED C126 and C1 texts reproduce their STORED stamps exactly; a /26 for C1 reads blocking (prefix-not-minimal); a block that swallows a held /32 not named as a member reads blocking; a free /32 EQUAL to a harvested /32 reads blocking derived-value-held (F-2 CLOSED 2026-11-07, VALUE-FREE-ADDRESS-BLIND platform half, owner G10-c)', async () => {
    const VL = require('./leg-replay-lab/value-lane');
    for (const id of [VLG_X, VLG_X1]) {
      const snap = loadCached(id); const ares = JSON.parse(snap.author.resultJson);
      const c = await VL.valueArchitectContainment(snap, ares.finalResponse, snap.author.exec.id);
      assert(!c.error && JSON.stringify(c.fact) === JSON.stringify(ares.derivationContainment), `${id}: computed ${JSON.stringify(c.fact).slice(0, 200)} ≠ stored`);
    }
    const c1 = loadCached(VLG_X1); const t1 = JSON.parse(c1.author.resultJson).finalResponse as string;
    const bad = await VL.valueArchitectContainment(c1, t1.split('10.99.0.0/27').join('10.99.0.0/26'), 'lab-lvlg2-a');
    assert(bad.fact?.containmentDisposition?.disposition === 'blocking', `C1 /26 reads ${VL.containmentLine(bad.fact)}`);
    const x = loadCached(VLG_X); const tx = JSON.parse(x.author.resultJson).finalResponse as string;
    const swallow = tx.replace('{"kind": "cidr", "value": "10.99.0.3/32", "members": ["10.99.0.3/32"]}', '{"kind": "cidr", "value": "10.99.0.0/30", "members": ["10.99.0.3/32"]}');
    assert(swallow !== tx, 'swallow edit did not apply');
    const sw = await VL.valueArchitectContainment(x, swallow, 'lab-lvlg2-b');
    assert(sw.fact?.containmentDisposition?.disposition === 'blocking' && (sw.fact?.violations ?? []).length > 0, `swallow reads ${VL.containmentLine(sw.fact)}`);
    const collide = tx.split('10.99.0.3/32').join('10.99.0.2/32');
    const co = await VL.valueArchitectContainment(x, collide, 'lab-lvlg2-c');
    const held = (co.fact?.violations ?? []).filter((v: any) => v.reason === 'derived-value-held');
    assert(co.fact?.containmentDisposition?.disposition === 'blocking' && held.length >= 1 && held.every((v: any) => v.derived === '10.99.0.2/32' && v.harvested === '10.99.0.2/32' && v.harvestedDevice === 'ceos2'),
      `F-2 closed (2026-11-07): a free /32 equal to a held /32 must read blocking derived-value-held — got ${VL.containmentLine(co.fact)} ${JSON.stringify(co.fact?.violations)}`);
  });
  await test('LVLG3 withFirstExecutionSnapshot mirrors production\'s writer: the stored canary value leg (no own key, no block) takes NO snapshot; with its own key planted it takes one (contract source, 2 entries) and becomes a value-lane Device-sources leg; a second take is refused', async () => {
    const VL = require('./leg-replay-lab/value-lane');
    const { snapshotWithInputEdits } = require('./leg-replay-lab/input-edits');
    const { isDeviceSourceLeg, deviceSourceLaneOfLeg } = require('../lib/agents/harness/held-bytes/variant');
    const raw = loadCached(VLG_X);
    assert(VL.withFirstExecutionSnapshot(raw).report.state === 'absent-no-snapshot', 'stored leg must take no snapshot');
    const planted = snapshotWithInputEdits(VLG_E, { id: 'A-GIT', inputEdits: 'node-inputs/nd-git.json' }, raw).snap;
    const r = VL.withFirstExecutionSnapshot(planted);
    assert(r.report.state === 'taken' && r.report.source === 'contract' && r.report.entries === 2 && r.report.lane === 'value', JSON.stringify(r.report));
    assert(isDeviceSourceLeg(r.snap.leg) && deviceSourceLaneOfLeg(r.snap.leg) === 'value', 'the planted leg must read as a value-lane Device-sources leg');
    assert(!isDeviceSourceLeg(raw.leg), 'the stored leg must stay off the lane');
    assert(VL.withFirstExecutionSnapshot(r.snap).report.state === 'already-snapshotted', 'a second take must be refused');
  });
  await test('LVLG4 withValueHarvest: the frozen harvests stamp the SHIPPING device facts on the value lane (Git-only: git-only, gitOnly [ceos1, ceos2], no comparison; Git+live: some-git-only, ceos1 read whole, comparison checked) into the Architect\'s AND the Reviewer\'s frozen contexts; without the snapshot the leg is off the lane and no liveEvidence is stamped', async () => {
    const VL = require('./leg-replay-lab/value-lane');
    const { snapshotWithInputEdits } = require('./leg-replay-lab/input-edits');
    if (!fs.existsSync(path.join(__dirname, 'leg-replay-lab/cache/vlg/harvest-git-only.calls.json'))) { console.log('   (LVLG4 skipped: run `lab:leg-replay -- vlg-fixtures` first — cache/vlg is gitignored)'); return; }
    const raw = loadCached(VLG_X);
    const prep = (inputs: string) => VL.withFirstExecutionSnapshot(snapshotWithInputEdits(VLG_E, { id: 'x', inputEdits: inputs }, raw).snap).snap;
    const g = await VL.withValueHarvest(VLG_E, prep('node-inputs/nd-git.json'), { text: 'harvests/git-only.md', toolCalls: '../../cache/vlg/harvest-git-only.calls.json' });
    const gl = g.report.liveEvidence as any;
    assert(gl?.summary === 'git-only' && JSON.stringify((gl.gitOnly ?? []).map((x: any) => x.device)) === '["ceos1","ceos2"]', `git-only fact ${JSON.stringify(gl).slice(0, 200)}`);
    assert(g.report.chainEntries.length === 4, `chain entries ${g.report.chainEntries}`);
    const he = g.snap.reviewer.exec.config.inputContext.chainedFrom.find((e: any) => e?.agentRole === 'infra_state_harvester');
    assert(he.liveEvidence?.summary === 'git-only' && he.finalResponse.includes('paichart-lab-configs/network/base/ceos2-startup.cfg'), 'the Reviewer\'s Harvester entry must carry the frozen harvest and its fact');
    const l = await VL.withValueHarvest(VLG_E, prep('node-inputs/nd-live.json'), { text: 'harvests/git-live.md', toolCalls: '../../cache/vlg/harvest-git-live.calls.json' });
    const ll = l.report.liveEvidence as any;
    assert(ll?.summary === 'some-git-only' && ll.liveRead === 1 && (l.report.gitDeviceComparison as any)?.checked === true, `git-live facts ${JSON.stringify(ll).slice(0, 200)} / ${JSON.stringify(l.report.gitDeviceComparison).slice(0, 120)}`);
    const off = await VL.withValueHarvest(VLG_E, snapshotWithInputEdits(VLG_E, { id: 'x', inputEdits: 'node-inputs/nd-git.json' }, raw).snap, { text: 'harvests/git-only.md', toolCalls: '../../cache/vlg/harvest-git-only.calls.json' });
    assert(!off.report.liveEvidence || (off.report.liveEvidence as any).checked !== true, `no snapshot ⇒ off the lane, yet liveEvidence ${JSON.stringify(off.report.liveEvidence).slice(0, 160)}`);
  });

  await test('LVLG5 (ADDENDUM (c)) the standing-bench lock reaches a change_reviewer case only through a node whose Reviewer IS a change_reviewer: the golden netvalue companion (derivation_reviewer, production-tier reviewerModel) is NOT reached; the same arm on an uncached node fails closed (reached); L-CS-N without its standingBench declaration is still refused', async () => {
    const SB = require('./leg-replay-lab/standing-bench');
    const gd = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-06-value-leg-git/golden-v3');
    const g = JSON.parse(fs.readFileSync(path.join(gd, 'experiment.json'), 'utf8'));
    assert(SB.reviewerRoleOf(g.nodes[0]) === 'derivation_reviewer', `role ${SB.reviewerRoleOf(g.nodes[0])}`);
    // s2 (2026-11-07): the companion IS reached by VLG-I3-GIT-ONLY (derivation_reviewer, network-derivation edits) — never by NET-FWA3-EDGE.
    assert(!SB.standingBenchProblems(g, gd).some((p: string) => /NET-FWA3-EDGE/.test(p)), `golden netvalue companion must not reach NET-FWA3-EDGE: ${SB.standingBenchProblems(g, gd).join(' | ')}`);
    // B12: a production-tier reviewerModel is no lever, so give the arm a REAL Reviewer model lever: the cached derivation_reviewer node still
    // does not reach NET-FWA3-EDGE (role), and the same arm on an uncached node fails closed (reached).
    const lever = { ...g, variants: Object.fromEntries(Object.entries(g.variants).map(([k, v]: any) => [k, { ...v, reviewerModel: 'claude-opus-5-5' }])) };
    assert(!SB.standingBenchProblems(lever, gd).some((p: string) => /NET-FWA3-EDGE/.test(p)), 'a model lever on a derivation_reviewer-only arm does not reach NET-FWA3-EDGE');
    const unk = { ...lever, nodes: g.nodes.map((n: any) => ({ ...n, authorExecutionId: 'cznotcachedlvlg5000000000' })) };
    assert(SB.standingBenchProblems(unk, gd).some((p: string) => /NET-FWA3-EDGE is reached/.test(p)), 'an uncached node must fail closed (reached)');
    const cd = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n');
    const c = JSON.parse(fs.readFileSync(path.join(cd, 'experiment.json'), 'utf8'));
    // s3 (2026-11-08): NET-APPLY-WHOLE-FILE joined after L-CS-N ran (read on the cases it was registered under).
    assert(SB.standingBenchProblems(c, cd).filter((p: string) => !/NET-APPLY-WHOLE-FILE/.test(p)).length === 0, 'L-CS-N as declared passes');
    const { standingBench, ...noDecl } = c; void standingBench;
    assert(SB.standingBenchProblems(noDecl, cd).some((p: string) => /NET-FWA3-EDGE is reached/.test(p)), 'L-CS-N without its declaration must still be refused');
  });

  await test('LVLG6 (standing bench s2) VLG-I3-GIT-ONLY: a derivation_reviewer lab with network-derivation edits must declare it; a declaring node with byte-identical planted inputs + the exact gate passes; a rewritten gate, a changed plant or a dropped snapshot is refused; a change_reviewer-only lab is not reached; the gate reads the L-VLG 2a R-GIT samples MET 5/5 and the crib\'s unlabelled approval MISSED', async () => {
    const SB = require('./leg-replay-lab/standing-bench');
    const dir = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-06-value-leg-git');
    const exp = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    const i3 = SB.loadStandingBench().cases.find((c: any) => c.id === 'VLG-I3-GIT-ONLY');
    assert(i3 && i3.kind === 'planted' && i3.reader === 'derivation_reviewer', 'the case is in the bench');
    assert(SB.standingBenchProblems(exp, dir).some((p: string) => /VLG-I3-GIT-ONLY is reached/.test(p)), 'an undeclaring network-derivation lab is refused');
    const gate = { ...i3.gate };
    const decl = (over: any = {}) => ({ ...exp, standingBench: [{ case: 'VLG-I3-GIT-ONLY', node: 'R-GIT' }],
      nodes: exp.nodes.map((n: any) => (n.id === 'R-GIT' ? { ...n, expect: 'rc: APPROVE + NON-BLOCKING WARNING (git-file-only) naming ceos1 and ceos2', scoring: { reviewerGate: gate }, ...over } : n)) });
    if (!fs.existsSync(path.join(__dirname, 'leg-replay-lab/cache/vlg/harvest-git-only.calls.json'))) { console.log('   (LVLG6 lock half skipped: run vlg-fixtures — cache/vlg is gitignored)'); return; }
    const ok = SB.standingBenchProblems(decl(), dir);
    assert(ok.length === 0, `declared as the case: ${ok.join(' | ')}`);
    assert(SB.standingBenchProblems(decl({ scoring: { reviewerGate: { ...gate, devices: ['ceos1'] } } }), dir).some((p: string) => /exactly/.test(p)), 'a rewritten gate is refused');
    assert(SB.standingBenchProblems(decl({ authorPlant: 'plants/R-LIVE.plant.json' }), dir).some((p: string) => /authorPlant/.test(p)), 'a different plant is refused');
    assert(SB.standingBenchProblems(decl({ deviceSourcesSnapshot: undefined }), dir).some((p: string) => /deviceSourcesSnapshot/.test(p)), 'a dropped snapshot is refused');
    const cd = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n');
    const c = JSON.parse(fs.readFileSync(path.join(cd, 'experiment.json'), 'utf8'));
    assert(!SB.standingBenchProblems(c, cd).some((p: string) => /VLG-I3/.test(p)), 'a change_reviewer-only lab is not reached by I3');
    const runs = path.join(__dirname, 'leg-replay-lab/runs');
    const r2a = path.join(runs, '2026-11-06T05-42-27-2026-11-06-value-leg-git/R-GIT/rc'), crib = path.join(runs, '2026-11-06T04-45-04-2026-11-06-value-leg-git/R-GIT/rc/sample-01/sample.json');
    if (!fs.existsSync(r2a) || !fs.existsSync(crib)) { console.log('   (LVLG6 sample half skipped: the L-VLG run folders are not in this tree — runs/ is gitignored)'); return; }
    const met = fs.readdirSync(r2a).filter((d) => d.startsWith('sample-')).map((d) => SB.evaluateStandingGate(i3, JSON.parse(fs.readFileSync(path.join(r2a, d, 'sample.json'), 'utf8')).verdict));
    assert(met.length === 4 && met.every((m: any) => m.met), `2a R-GIT: ${met.map((m: any) => m.why).join(' | ')}`);
    const miss = SB.evaluateStandingGate(i3, JSON.parse(fs.readFileSync(crib, 'utf8')).verdict);
    assert(!miss.met && /without a git-file-only warning/.test(miss.why), `crib R-GIT must read MISSED: ${miss.why}`);
  });

  await test('LVLG7 (B12) golden-build carries every REACHED standing case into the companion: a network-derivation text lab gets STAND-VLG-I3-GIT-ONLY on its persisted value arm only (planted inputs referenced in place, sha-equal) and the companion passes the lock; a network-provisioning-only lab gets STAND-NET-FWA3-EDGE and not I3; removing a carried node is refused; a live-Author arm is covered by its persisted twin', async () => {
    const G = require('./leg-replay-lab/golden-set');
    const SB = require('./leg-replay-lab/standing-bench');
    const gs = G.loadGoldenSet();
    if (!fs.existsSync(path.join(__dirname, 'leg-replay-lab/cache/vlg/harvest-git-only.calls.json'))) { console.log('   (LVLG7 skipped: run vlg-fixtures — cache/vlg is gitignored)'); return; }
    const mk = (name: string, protos: string[], arms: Record<string, any>) => {
      const d = path.join(out, `b12-${name}`); fs.mkdirSync(path.join(d, 'protocols'), { recursive: true }); fs.mkdirSync(path.join(d, 'edits'), { recursive: true });
      const baseline: any = { protocols: {} };
      for (const pn of ['network-provisioning-protocol', 'network-derivation-protocol']) {
        const pin = gs.pins.protocols[pn]; const f = `protocols/${pn}@${pin.version}.baseline.md`;
        fs.copyFileSync(path.join(__dirname, 'leg-replay-lab/golden', pin.file), path.join(d, f)); baseline.protocols[pn] = { file: f, version: pin.version, sha256: pin.sha256 };
      }
      const A = '## Device sources — declared, never inferred';
      fs.writeFileSync(path.join(d, 'edits/probe.json'), JSON.stringify({ id: 'b12-probe', appliesTo: protos, ops: [{ type: 'replace', old: A, new: `${A}\n\n(B12 probe line.)` }] }));
      fs.writeFileSync(path.join(d, 'experiment.json'), JSON.stringify({ label: `b12-${name}`, purpose: 'B12 test', n: 1, flags: {}, goldenSet: { version: gs.version }, baseline, variants: arms, nodes: [], measures: [] }));
      return G.buildGoldenCompanion(d);
    };
    const v = mk('vd', ['network-derivation-protocol'], { xr: { edits: ['edits/probe.json'], authorSource: 'persisted' } });
    const stand = v.experiment.nodes.filter((n: any) => /^STAND-/.test(n.id)).map((n: any) => n.id);
    assert(JSON.stringify(stand) === '["STAND-VLG-I3-GIT-ONLY"]', `value-text companion carries ${JSON.stringify(stand)}`);
    const i3 = v.experiment.nodes.find((n: any) => n.id === 'STAND-VLG-I3-GIT-ONLY');
    assert(i3.variants.length === 1 && /netvalue/.test(i3.variants[0]), `I3 runs on ${i3.variants} (the value arm only)`);
    assert(SB.standingBenchProblems(v.experiment, v.dir).length === 0, `value companion lock: ${SB.standingBenchProblems(v.experiment, v.dir).join(' | ')}`);
    const dropped = { ...v.experiment, nodes: v.experiment.nodes.filter((n: any) => n.id !== 'STAND-VLG-I3-GIT-ONLY') };
    assert(SB.standingBenchProblems(dropped, v.dir).some((p: string) => /VLG-I3-GIT-ONLY/.test(p)), 'a companion missing a reached node is refused');
    const np = mk('np', ['network-provisioning-protocol'], { xr: { edits: ['edits/probe.json'], authorSource: 'persisted' } });
    const standNp = np.experiment.nodes.filter((n: any) => /^STAND-/.test(n.id)).map((n: any) => n.id);
    // s3 (2026-11-08): a network-provisioning lab also reaches NET-APPLY-WHOLE-FILE (change_reviewer).
    assert(JSON.stringify(standNp) === '["STAND-NET-FWA3-EDGE","STAND-NET-APPLY-WHOLE-FILE"]', `change-text companion carries ${JSON.stringify(standNp)}`);
    assert(SB.standingBenchProblems(np.experiment, np.dir).length === 0, `change companion lock: ${SB.standingBenchProblems(np.experiment, np.dir).join(' | ')}`);
    const live = mk('live', ['network-provisioning-protocol'], { xa: { edits: ['edits/probe.json'] } });
    const fwa = live.experiment.nodes.find((n: any) => n.id === 'STAND-NET-FWA3-EDGE');
    assert(fwa && fwa.variants.every((a: string) => live.experiment.variants[a].authorSource === 'persisted'), 'the carried node runs on persisted arms only');
    assert(Object.values(live.experiment.variants).some((x: any) => x.authorSource !== 'persisted'), 'the companion has a live-Author arm');
    assert(SB.standingBenchProblems(live.experiment, live.dir).length === 0, `a live arm is covered by its persisted twin: ${SB.standingBenchProblems(live.experiment, live.dir).join(' | ')}`);
  });

  await test('LSB3 (standing bench s3, owner 2026-11-07) NET-APPLY-WHOLE-FILE: the frozen record reproduces its STORED (wrong) approval 90 under the shipping parser; a network-provisioning lab whose change_reviewer arm does not declare it is refused (lock proof on the NB1 experiment); the NB1 R-APPLY-MISS node declared with the do-not-ship refuse gate passes; a node with a rewritten gate is refused; the gate reads the NB1 (f) R-APPLY-MISS samples MET and an approval MISSED', () => {
    const SB = require('./leg-replay-lab/standing-bench');
    const row = SB.standingBenchSelfTest(loadCached).find((r: any) => r.id === 'NET-APPLY-WHOLE-FILE');
    assert(row && row.ok && /approved\/90/.test(row.detail), `self-test ${JSON.stringify(row)}`);
    const dir = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-07-network-text-batch-1');
    const exp = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    assert(SB.standingBenchProblems(exp, dir).some((p: string) => /NET-APPLY-WHOLE-FILE is reached/.test(p)), `NB1 as committed (pre-s3) must be refused for the new case: ${SB.standingBenchProblems(exp, dir).join(' | ')}`);
    const gate = { gate: 'STAND-NET-APPLY-WHOLE-FILE', expect: 'refuse-for-plant', doNotShip: true };
    const decl = (scoring: any) => ({ ...exp, standingBench: [...exp.standingBench, { case: 'NET-APPLY-WHOLE-FILE', node: 'R-APPLY-MISS' }],
      nodes: exp.nodes.map((n: any) => (n.id === 'R-APPLY-MISS' ? { ...n, scoring } : n)) });
    const ok = SB.standingBenchProblems(decl({ reviewerGate: gate }), dir).filter((p: string) => /NET-APPLY-WHOLE-FILE/.test(p));
    assert(ok.length === 0, `declared with the gate passes: ${ok.join(' | ')}`);
    assert(SB.standingBenchProblems(decl({ reviewerGate: { ...gate, doNotShip: false } }), dir).some((p: string) => /NET-APPLY-WHOLE-FILE/.test(p)), 'a gate without do-not-ship is refused');
    const c = SB.loadStandingBench().cases.find((x: any) => x.id === 'NET-APPLY-WHOLE-FILE');
    assert(SB.evaluateStandingGate(c, { approved: false, blocking: ['whole-file load of ceos1'] }).met, 'a refusal reads MET');
    assert(!SB.evaluateStandingGate(c, { approved: true, blocking: [] }).met, 'an approval reads MISSED (the stored false release)');
    const runs = path.join(__dirname, 'leg-replay-lab/runs/2026-11-07T08-38-09-2026-11-07-network-text-batch-1/R-APPLY-MISS/r');
    if (fs.existsSync(runs)) {
      const v = fs.readdirSync(runs).filter((x: string) => x.startsWith('sample-')).map((x: string) => JSON.parse(fs.readFileSync(path.join(runs, x, 'sample.json'), 'utf8')).verdict);
      assert(v.length === 4 && v.every((x: any) => SB.evaluateStandingGate(c, x).met), `NB1 (f)-2a R-APPLY-MISS samples MET: ${v.map((x: any) => x?.approved)}`);
    } else console.log('   (LSB3: NB1 (f)-2a run folder not on this machine — sample check skipped)');
  });

  await test('LVLG8 (B9) live-evidence-patch is lane-aware: on a VALUE leg it reads the leg\'s own contract key and its fact EQUALS the shipping Harvester enrichment (git-only); on a CHANGE leg whose contract also carries a network-derivation key, that key\'s devices stay out of contractNotDeclared (production\'s fold), which the old 3-argument call did not do', async () => {
    const LE = require('./leg-replay-lab/live-evidence-patch');
    const VL = require('./leg-replay-lab/value-lane');
    const { snapshotWithInputEdits } = require('./leg-replay-lab/input-edits');
    if (!fs.existsSync(path.join(__dirname, 'leg-replay-lab/cache/vlg/harvest-git-only.calls.json'))) { console.log('   (LVLG8 skipped: run vlg-fixtures)'); return; }
    const E = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-06-value-leg-git');
    const raw = loadCached('cmw47bixl0032yx31135j69pn');
    const snap = VL.withFirstExecutionSnapshot(snapshotWithInputEdits(E, { id: 'x', inputEdits: 'node-inputs/nd-git.json' }, raw).snap).snap;
    const ship = await VL.withValueHarvest(E, snap, { text: 'harvests/git-only.md', toolCalls: '../../cache/vlg/harvest-git-only.calls.json' });
    const calls = JSON.parse(fs.readFileSync(path.join(__dirname, 'leg-replay-lab/cache/vlg/harvest-git-only.calls.json'), 'utf8'));
    const lab = LE.withComputedLiveEvidence(snap, undefined, { protocol: { name: 'network-provisioning-protocol', version: '1.26.0' } }, { toolCalls: calls }).fact;
    const strip = (f: any) => { const { point, ...r } = f ?? {}; void point; return r; };
    assert(JSON.stringify(strip(lab)) === JSON.stringify(strip(ship.report.liveEvidence)), `value lane: lab ${JSON.stringify(lab).slice(0, 200)} ≠ shipping ${JSON.stringify(ship.report.liveEvidence).slice(0, 200)}`);
    const cd = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n');
    const ch = snapshotWithInputEdits(cd, { id: 'R-FWA3-GIT-BOTH', inputEdits: 'node-inputs/r-fwa3-git-both.json' }, loadCached('cmvyb2anc008djef0pzv52byj')).snap;
    const leg = ch.leg as any; leg.inputContext = { ...leg.inputContext, interfaceContract: { ...(leg.inputContext?.interfaceContract ?? {}), deviceSources: { ...(leg.inputContext?.interfaceContract?.deviceSources ?? {}), 'network-derivation': ['zzvalue9: git-file — service github-service ; o/r/zz.cfg'] } } };
    const f = LE.withComputedLiveEvidence(ch, undefined, { protocol: { name: 'network-provisioning-protocol', version: '1.26.0' } }, { toolCalls: [] }).fact as any;
    assert(f && !JSON.stringify(f.contractNotDeclared ?? []).includes('zzvalue9'), `change lane folded a value-lane device: ${JSON.stringify(f?.contractNotDeclared)}`);
    const old = LE.loadLiveEvidenceComputer()(require('../lib/agents/harness/device-sources').resolveLegDeviceSources({ contractValue: require('../lib/agents/harness/device-sources').contractDeviceSourcesValue(leg.inputContext.interfaceContract), taskBody: leg.description }), [], leg.inputContext.interfaceContract);
    assert(JSON.stringify(old.contractNotDeclared ?? []).includes('zzvalue9'), 'control: the 3-argument call (the old lab path) does fold it — the test would not see the difference otherwise');
  });

  await test('LVLG9 (NB1 blind-read defect) TEXT REACH: the batch-1 dry run that composed the RELEASED derivation_architect guidance on all four xv cells is refused (candidate fragment missing, released fragment present); a prompt composing the base protocol is refused; a prompt composing another domain\'s protocol is out of reach', async () => {
    const TR = require('./leg-replay-lab/text-reach');
    const dir = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-07-network-text-batch-1');
    const exp = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    const xv = TR.armReachSpec(dir, exp, 'xv');
    assert(xv.templateOps.length > 0 && xv.protocols.some((p: any) => p.name === 'network-derivation-protocol'), 'the xv arm carries the BR-5 template edit and 1.3.1');
    const old = path.join(__dirname, 'leg-replay-lab/runs/2026-11-06T20-39-21-2026-11-07-network-text-batch-1-dry');
    if (fs.existsSync(old)) {
      for (const n of ['A-LIVE', 'A-GIT', 'A-C126', 'A-C1']) {
        const sys = fs.readFileSync(path.join(old, n, 'xv', 'author.system.md'), 'utf8');
        const pr = TR.textReachProblems(xv, [{ label: n, role: 'derivation_architect', system: sys }]);
        assert(pr.some((p: string) => /candidate fragment is missing/.test(p)) && pr.some((p: string) => /RELEASED text is still there/.test(p)), `${n} (the defective dry run) must be refused: ${pr.join(' | ')}`);
      }
    } else console.log('   (LVLG9 run-folder half skipped: the defective dry run is not in this tree — runs/ is gitignored)');
    const np = TR.armReachSpec(dir, exp, 'r').protocols.find((p: any) => p.name === 'network-provisioning-protocol');
    const spec = { arm: 'r', protocols: [np], templateOps: [] };
    assert(TR.textReachProblems(spec, [{ label: 'base', role: 'change_reviewer', system: `x\n${np.base}\ny` }]).some((p: string) => /BASE/.test(p)), 'a prompt composing the base is refused');
    assert(TR.textReachProblems(spec, [{ label: 'cand', role: 'change_reviewer', system: `x\n${np.candidate}\ny` }]).length === 0, 'a prompt composing the candidate passes');
    assert(TR.textReachProblems(spec, [{ label: 'other', role: 'change_reviewer', system: 'a k8s prompt' }]).length === 0, 'a prompt composing neither is out of reach');
  });

  await test('LVLG10 (44cf00704) the lab\'s liveEvidence on a Git-only CHANGE leg EQUALS the shipping Harvester enrichment at both versions: network-provisioning 1.27.0 reads git-only, 1.26.0 reads none-declared (one definition: liveEvidenceOptionsFor imported)', async () => {
    const LE = require('./leg-replay-lab/live-evidence-patch');
    const VL = require('./leg-replay-lab/value-lane');
    const GH = require('./leg-replay-lab/git-harvest-plant');
    const N = require('./leg-replay-lab/nets');
    const { snapshotWithInputEdits } = require('./leg-replay-lab/input-edits');
    const { frozenHarvesterEntry } = require('./leg-replay-lab/held-store');
    const cd = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-04-config-sources-net-l-cs-n');
    const base = snapshotWithInputEdits(cd, { id: 'x', inputEdits: 'node-inputs/r-fwa3-git-both.json' }, loadCached('cmvyb2anc008djef0pzv52byj')).snap;
    const g = await GH.withGitHarvest(base, cd, { fixture: '../../fixtures/l-n1-0b35ce3', paths: ['network/base/ceos1-startup.cfg', 'network/base/ceos2-startup.cfg'] });
    // The planted world's snapshot is the one production would take from the PLANTED block (the stored devext leg carries its own,
    // which production would read as snapshot-changed against the plant): drop it, then take it the shipping way.
    const g2 = JSON.parse(JSON.stringify(g.snap)); delete g2.leg.metadata.deviceSourcesSnapshot;
    const fs1 = VL.withFirstExecutionSnapshot(g2); assert(fs1.report.state === 'taken', `snapshot ${fs1.report.state}`); const snap = fs1.snap;
    const h = frozenHarvesterEntry(snap);
    const art = snap.childArtifacts.find((a: any) => a.executionId === h.executionId && a.name === 'result.json');
    const rj = JSON.parse(art.content);
    const hTask = snap.children.find((c: any) => c.id === h.taskId);
    const strip = (f: any) => { const { point, ...r } = f ?? {}; void point; return r; };
    for (const [ver, want] of [['1.27.0', 'git-only'], ['1.26.0', 'none-declared']] as const) {
      const lab = LE.withComputedLiveEvidence(snap, undefined, { protocol: { name: 'network-provisioning-protocol', version: ver } }, { toolCalls: rj.toolCalls }).fact as any;
      const prod = (await N.runLeafNetsFor(snap, hTask, 'infra_state_harvester', rj.finalResponse, h.executionId, rj.toolCalls, { delta: { name: 'network-provisioning-protocol', version: ver } }, { legReads: true })).stamped.liveEvidence as any;
      assert(lab?.summary === want, `${ver}: lab reads ${lab?.summary} (want ${want})`);
      assert(JSON.stringify(strip(lab)) === JSON.stringify(strip(prod)), `${ver}: lab ${JSON.stringify(lab).slice(0, 220)} ≠ shipping ${JSON.stringify(prod).slice(0, 220)}`);
    }
  });

  await test('LVLG11 (NB1 final candidate) TEXT REACH refuses a superseded render: the c3f02e27 dry run\'s network prompts fail the 8f142a6a spec; a template-CONSTRAINT edit is checked both ways (the released Harvest-Anchored row refused, the candidate row passes)', async () => {
    const TR = require('./leg-replay-lab/text-reach');
    const dir = path.join(__dirname, 'leg-replay-lab/inputs/2026-11-07-network-text-batch-1');
    const exp = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    const old = path.join(__dirname, 'leg-replay-lab/runs/2026-11-06T21-00-13-2026-11-07-network-text-batch-1-dry');
    if (fs.existsSync(path.join(dir, 'protocols/network-provisioning-protocol@1.26.0.r.md')) && fs.existsSync(old)) {
      const r = TR.armReachSpec(dir, exp, 'r');
      const sys = fs.readFileSync(path.join(old, 'R-APPLY-MISS', 'r', 'reviewer.system.md'), 'utf8');
      const pr = TR.textReachProblems(r, [{ label: 'c3f02e27', role: 'change_reviewer', system: sys }]);
      assert(pr.some((p: string) => /neither its base nor arm r's candidate/.test(p)), `the superseded render must be refused: ${pr.join(' | ')}`);
    } else console.log('   (LVLG11 run-folder half skipped: build-candidates output or the c3f02e27 dry run not in this tree)');
    const released = { 'Harvest-Anchored': 'Every member names the harvest entry it came from; an empty population is a gap, never an invented value' };
    const candidate = { 'Harvest-Anchored': 'Every member names the harvest entry it came from. Where the objective asks for free addresses, every allocation they must avoid names its harvest entry instead, and the chosen addresses are not in the harvest. An empty population is a gap, never an invented value' };
    assert(TR.constraintReachProblems('rel', `x ${released['Harvest-Anchored']} y`, { released, candidate }).length === 2, 'a prompt with the released row: candidate missing AND released present');
    assert(TR.constraintReachProblems('cand', `x ${candidate['Harvest-Anchored']} y`, { released, candidate }).length === 0, 'a prompt with the candidate row passes');
  });

  // 2026-11-10 (owner; REQ-PROMPT-TOOL-CALL-CLASH): a requirements Reviewer's objective fetch is served its OWN stored answer.
  const OR_NODES = [['cmvc184ff00l8yxzpxz3j7chn', 'cmvc1gli700llyxzpwrb4nkas'], ['cmv00armk00b5yxlremi97y0a', 'cmv00fjvr00beyxlrztgown0x']] as const;
  const orCheck = async () => {
    for (const [aid] of OR_NODES) {
      const snap = loadSnapshot(aid);
      const src = objectiveOfRecordSource(snap);
      assert(src.state === 'served' && src.legId === snap.leg!.id, `${aid}: source ${src.state} (${src.reason})`);
      const stored = (JSON.parse(snap.reviewer!.resultJson!).toolCalls as any[]).find((t) => t.tool === 'project' && t.arguments?.action === 'task.context');
      const srv = createObjectiveToolServer(src, TOOL_STUB_RESULT);
      const got: any = await srv.executeToolOnServer('s', 'project', { action: 'task.context', taskId: snap.leg!.id });
      assert(JSON.stringify(got) === JSON.stringify(stored.result), `${aid}: served answer ≠ the stored task.context result byte for byte`);
      assert(got.content.map((c: any) => c.text).join('').includes(snap.leg!.description), `${aid}: served answer does not carry the leg description verbatim`);
      assert(await srv.executeToolOnServer('s', 'project', { action: 'task.context', taskId: 'cm-other-task' }) === TOOL_STUB_RESULT, `${aid}: another task's context was served`);
      assert(await srv.executeToolOnServer('s', 'perform', { action: 'task.comment', taskId: snap.leg!.id }) === TOOL_STUB_RESULT, `${aid}: a non-fetch call was served`);
      assert(srv.log.map((e) => e.tier).join() === 'objective-of-record,unserved,unserved', `${aid}: tiers ${srv.log.map((e) => e.tier).join()}`);
    }
  };
  await test('OR1 objective of record: each requirements golden Reviewer\'s fetch is served its stored task.context answer byte for byte (the leg description inside); other calls stub; RED: unserve ⇒ the check fails', async () => {
    await orCheck();
    process.env.LAB_TEST_OBJECTIVE_MUTATION = 'unserve';
    let red = false;
    try { await orCheck(); } catch (e) { red = /served answer ≠ the stored/.test((e as Error).message); } finally { delete process.env.LAB_TEST_OBJECTIVE_MUTATION; }
    assert(red, 'RED mutation: with the fetch unserved the check still passed');
  });

  await test('OR2 objective of record: an input-edited objective is served with its one pre-edit span replaced (exactly once, else the stub); falls back BY NAME on no stored fetch or a non-requirements Reviewer', () => {
    const snap = loadSnapshot(OR_NODES[0][0]);
    const edited = JSON.parse(JSON.stringify(snap)); edited.leg.description = `${edited.leg.description}\nPLANTED LINE`;
    assert(objectiveOfRecordSource(edited).state === 'objective-edited', 'an edited objective with no pre-edit text was served');
    const ie = objectiveOfRecordSource(edited, snap.leg!.description);
    const ieText = (ie.answer as any)?.content?.map((c: any) => c.text).join('') ?? '';
    const stText = (JSON.parse(snap.reviewer!.resultJson!).toolCalls as any[]).find((t) => t.tool === 'project').result.content.map((c: any) => c.text).join('');
    assert(ie.state === 'served-input-edited' && ieText === stText.replace(snap.leg!.description, edited.leg.description), `input-edited objective: ${ie.state} (${ie.reason})`);
    const twice = JSON.parse(JSON.stringify(edited)); const rj2 = JSON.parse(twice.reviewer.resultJson); const tc2 = rj2.toolCalls.find((t: any) => t.tool === 'project'); tc2.result.content[0].text += snap.leg!.description; twice.reviewer.resultJson = JSON.stringify(rj2);
    assert(objectiveOfRecordSource(twice, snap.leg!.description).state === 'objective-edited', 'a stored answer with TWO copies of the pre-edit objective was patched');
    const noFetch = JSON.parse(JSON.stringify(snap)); const rj = JSON.parse(noFetch.reviewer.resultJson); rj.toolCalls = rj.toolCalls.filter((t: any) => t.tool !== 'project'); noFetch.reviewer.resultJson = JSON.stringify(rj);
    assert(objectiveOfRecordSource(noFetch).state === 'no-stored-fetch', 'a Reviewer with no stored fetch was served');
    const other = JSON.parse(JSON.stringify(snap)); other.reviewer.task.agentRole = 'change_reviewer';
    assert(objectiveOfRecordSource(other).state === 'not-requirements-reviewer', 'a non-requirements Reviewer got the tier');
    const srv = createObjectiveToolServer(objectiveOfRecordSource(edited), TOOL_STUB_RESULT);
    return srv.executeToolOnServer('s', 'project', { action: 'task.context', taskId: snap.leg!.id }).then((r) => assert(r === TOOL_STUB_RESULT, 'a not-served source served the fetch'));
  });

  await test('OR3 through the SHIPPING loop under --fake-llm persisted: both requirements golden cells replay their stored calls, the fetch is served the stored bytes, every stored verdict reproduces; RED: unserve ⇒ 0 served', () => {
    const REQG = path.join(LAB, 'inputs', '2026-11-09-req-golden-cases');
    const read = (dir: string) => ['REQ-A-OBS-SENDERS', 'REQ-B-LOGARCH-F1'].map((id) => ({ id, m: JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).nodes[id], s: JSON.parse(fs.readFileSync(path.join(dir, id, 'gr', 'sample-01', 'sample.json'), 'utf8')) }));
    const dir = path.join(out, 'or-fake');
    runLab(['run', '--experiment', REQG, '--out', dir, '--fake-llm', 'persisted', '--n', '1']);
    for (const { id, m, s } of read(dir)) {
      assert(!s.error, `${id}: ${s.error}`);
      assert(m.objectiveOfRecord?.state === 'served', `${id}: manifest objectiveOfRecord ${JSON.stringify(m.objectiveOfRecord)}`);
      const b = s.reviewerTools?.objectiveBytes;
      assert(b && b.served === 1 && b.identical === 1 && !b.mismatches.length, `${id}: objective bytes ${JSON.stringify(b)}`);
      assert(s.verdict.approved === m.persisted.approved && JSON.stringify(s.verdict.blocking) === JSON.stringify(m.persisted.blocking), `${id}: replayed verdict ≠ stored`);
    }
    const red = path.join(out, 'or-fake-red');
    execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.join(LAB, 'lab.ts'), 'run', '--experiment', REQG, '--out', red, '--fake-llm', 'persisted', '--n', '1'],
      { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: '', LAB_TEST_OBJECTIVE_MUTATION: 'unserve' }, maxBuffer: 64 * 1024 * 1024 });
    for (const { id, s } of read(red)) assert(s.reviewerTools?.objectiveBytes?.served === 0 && s.reviewerTools.log[0] === 'project.task.context:unserved', `${id}: RED mutation still served (${JSON.stringify(s.reviewerTools)})`);
  });

  // ───────────────────────────── L-CS-K: Config sources STEP 2, code push slice 4 (2026-11-15) ─────────────────────────────
  // The levers of config-sources-arm.ts / config-sources-patch.ts on the cached Kubernetes golden leg K8S-PROG. Every expectation is
  // recomputed in the test by the SHIPPING pure functions with the test's OWN caller — the lever is compared with them, never trusted.
  // This block NEVER fetches a snapshot (register LAB-TEST-READS-PRODUCTION): a missing cache entry is a plain failure.
  {
    const cs = await import('./leg-replay-lab/config-sources-patch');
    const arm = await import('./leg-replay-lab/config-sources-arm');
    const hs = await import('./leg-replay-lab/held-store');
    const { governingConfigSources } = await import('../lib/agents/harness/config-sources-read');
    const { computeConfigSourceReads, computeConfigLiveEvidence } = await import('../lib/agents/harness/config-source-facts');
    const { computeGitLiveDrift, renderGitLiveDriftForPrompt } = await import('../lib/agents/harness/git-live-drift');
    const { runPlatformDriftCalls } = await import('../lib/agents/harness/platform-drift-run');
    const { configGitFileForce } = await import('../lib/agents/harness/held-bytes/config-source-scope');
    const { configSourceLaneOf, CONFIG_SOURCE_AWAITING_TEXT } = await import('../lib/agents/harness/held-bytes/variant');
    const { renderLiveEvidenceForPrompt } = await import('../lib/agents/harness/live-evidence');
    const { PLACEHOLDER } = await import('../lib/agents/harness/redact-artifact-secrets');
    const { createHash } = await import('crypto');
    const sha = (t: string) => createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');
    const K8S_PROG = 'cmvsze85600boyxb3iipbdk3r'; const K8S_PROG_REVIEWER = 'cmvszgkek009ayxb4kmj3cbak';
    const NET_LEG = 'cmw47bixl0032yx31135j69pn';
    const cached = (id: string) => {
      if (!fs.existsSync(snapshotPath(id))) throw new Error(`the lab cache has no snapshot ${id} — this test never fetches from production (LAB-TEST-READS-PRODUCTION); fill the cache first (lab:leg-replay -- snapshot)`);
      return loadSnapshot(id);
    };
    const P18 = { name: 'kubernetes-gitops-protocol', version: '1.18.0' }; const P19 = { name: 'kubernetes-gitops-protocol', version: '1.19.0' };
    const GIT_LINE = 'sample-workloads: git-file — service github-service ; paichart/paichart-lab-configs/k8s/sample-workloads.yaml';
    const LIVE_LINE = 'trading-cluster: live-read — service k8s-rig-readonly';
    const block = (...lines: string[]) => `\n\n## Config sources\n${lines.join('\n')}\n`;
    const BLOCK = block(GIT_LINE, LIVE_LINE);
    const withBlock = (b: string | null) => { const c = JSON.parse(JSON.stringify(cached(K8S_PROG))); if (b) c.leg.description = `${c.leg.description}${b}`; return c; };
    const planted = (b: string | null = BLOCK) => cs.withFirstExecutionConfigSnapshot(withBlock(b)).snap;
    const FIX = JSON.parse(fs.readFileSync(cs.CONTRACT_FIXTURE, 'utf8')) as { result: Record<string, any> };
    const harvestOf = (snap: any) => { const h = hs.frozenHarvesterEntry(snap); return { h, result: JSON.parse(snap.childArtifacts.find((a: any) => a.executionId === h.executionId && a.name === 'result.json').content) }; };
    const govOf = (snap: any) => governingConfigSources({ description: snap.leg.description, contract: null, snapshot: snap.leg.metadata.configSourcesSnapshot ?? null }, P19.name);
    /** The test's own oracle: the shipping functions, the test's own caller (the contract fixture with the sha echo). */
    const oracle = async (snap: any, caller?: (manifest: string) => any) => {
      const gov = govOf(snap); const { result } = harvestOf(snap);
      const store = hs.buildLabHeldStore(snap, gov as never);
      let invoked = 0;
      const calls = gov.state !== 'parsed' ? undefined : await runPlatformDriftCalls({ sources: gov, toolCalls: result.toolCalls, redactedMarker: PLACEHOLDER, maxManifestBytes: 262144,
        heldFiles: store.refs.map((r) => ({ target: r.target as string, path: r.path as string, content: r.content, sha256: r.blobSha256 })),
        call: async ({ manifest }) => { invoked++; return caller ? caller(manifest) : { kind: 'result', result: { ...FIX.result, manifestSha256: sha(manifest) } }; } });
      return { gov, store, calls, invoked, reads: computeConfigSourceReads(gov, result.toolCalls), live: computeConfigLiveEvidence(gov, result.toolCalls), drift: computeGitLiveDrift(calls ?? undefined) };
    };
    const FIXTURE_PLANT = { default: { caller: 'contract-fixture' as const } };
    const throws = async (fn: () => unknown, re: RegExp, what: string) => { let m = ''; try { await fn(); } catch (e) { m = (e as Error).message; } assert(re.test(m), `${what}: expected a refusal matching ${re}, got "${m.slice(0, 200)}"`); };

    await test('LCK1 (config-sources-arm.ts) the per-arm switch: production reads Config sources from the 1.19.0 text commit on (the awaiting list is empty); the lab arm reads Config sources only at the released version (shipping liveEvidenceVersionApplies) on a leg whose protocol is in the SHIPPING lane table — a 1.18.0 arm and a network leg read none, and every lever then returns the snapshot object it was given', async () => {
      // 1.19.0 TEXT COMMIT (branch cs-k8s-text, c55a26364): kubernetes-gitops has LEFT the awaiting list, so production and the lab arm
      // agree by construction — production derives the lane from the list, the lab from the table + the version test. Below 1.19.0 the
      // version test alone keeps every cell byte-identical (asserted next). Before the text commit this read: list length 1, lane null.
      // Config sources STEP 4 (2026-11-17): terraform-iac now AWAITS its text (list length 1), so this pins the k8s PROPERTY, not the length;
      // a tf arm reads no Config sources until a terraform-iac row exists in LIVE_EVIDENCE_MIN_VERSIONS (the lab's version test).
      assert(!CONFIG_SOURCE_AWAITING_TEXT.includes('kubernetes-gitops-protocol') && configSourceLaneOf('kubernetes-gitops') !== null, 'the 1.19.0 text commit empties CONFIG_SOURCE_AWAITING_TEXT (kubernetes-gitops is a Config-sources protocol) — re-read this block');
      const snap = planted();
      assert(arm.armConfigSources(snap.leg, { delta: P18 }) === null && arm.armConfigSources(snap.leg, undefined) === null && arm.armOwningLeg(snap.leg, { delta: P18 }) === null, 'a 1.18.0 arm must read no Config sources');
      const g = arm.armConfigSources(snap.leg, { delta: P19 });
      assert(g?.state === 'parsed' && (g as any).entries.length === 2, `1.19.0 arm: ${JSON.stringify(g).slice(0, 200)}`);
      const ol = arm.armOwningLeg(snap.leg, { delta: P19 }) as any;
      assert(ol.kind === 'self' && ol.configSourceProtocol === 'kubernetes-gitops-protocol' && ol.heldCapable === true && ol.gitFileSource === true && ol.deviceSource === false, `owning leg: ${JSON.stringify(ol)}`);
      const net = cached(NET_LEG);
      assert(arm.configLegOf(net.leg) === null && arm.armConfigSources(net.leg, { delta: { name: 'network-provisioning-protocol', version: '9.9.9' } }) === null, 'a network leg is never a Config-sources leg');
      const base = await cs.withComputedConfigFacts(snap, { protocol: P18, drift: FIXTURE_PLANT });
      assert(base.snap === snap && base.facts === null && base.report.state === 'not-stamped-version', `base arm: ${JSON.stringify(base.report)}`);
      const offLeg = await cs.withComputedConfigFacts(net, { protocol: { name: 'network-provisioning-protocol', version: '9.9.9' } });
      assert(offLeg.snap === net && offLeg.report.state === 'not-config-source-leg', 'off a Config-sources leg');
      const held = (st: any) => JSON.stringify([st.refs, st.refusals, st.scope]); // stats carry a wall-clock duration
      assert(held(hs.buildLabHeldStore(snap, null)) === held(hs.buildLabHeldStore(snap)) && hs.buildLabHeldStore(snap).refs.length === 1, 'a null declaration must leave the held store as it was');
    });

    await test('LCK2 (L-CS-K-a) the first-execution snapshot is the shipping writer\'s: taken once (takenAt = the leg\'s protocolResolvedAt), re-read by the shipping reader; a leg with NO block snapshots `absent` (the harness-stop state) and every fact and the force name it; no snapshot ⇒ snapshot-absent; a description edited after the snapshot ⇒ snapshot-changed; nothing is held in any of the three', async () => {
      const raw = withBlock(BLOCK);
      const t1 = cs.withFirstExecutionConfigSnapshot(raw);
      assert(t1.report.state === 'taken' && t1.report.resolution === 'parsed' && t1.report.entries === 2 && t1.report.takenAt === raw.leg.metadata.protocolResolvedAt, JSON.stringify(t1.report));
      assert(raw.leg.metadata.configSourcesSnapshot === undefined, 'the input snapshot object was written');
      assert(cs.withFirstExecutionConfigSnapshot(t1.snap).report.state === 'already-snapshotted', 'a second snapshot must be refused');
      assert(cs.withFirstExecutionConfigSnapshot(cached(NET_LEG)).report.state === 'not-config-source-protocol', 'a network leg takes no Config snapshot');
      for (const [label, snap, want] of [['no block', planted(null), 'absent'], ['no snapshot', withBlock(BLOCK), 'snapshot-absent'],
        ['edited after', (() => { const s = planted() as any; s.leg.description = String(s.leg.description).replace('k8s/sample-workloads.yaml', 'k8s/other.yaml'); return s; })(), 'snapshot-changed']] as const) {
        const r = await cs.withComputedConfigFacts(snap, { protocol: P19, drift: FIXTURE_PLANT });
        const o = await oracle(snap);
        assert(r.report.declaration === want && o.gov.state === want, `${label}: declaration ${r.report.declaration} / ${o.gov.state}`);
        assert(r.facts!.liveEvidence!.checked === false && r.facts!.liveEvidence!.reason === `config-sources-${want}`, `${label}: liveEvidence ${JSON.stringify(r.facts!.liveEvidence).slice(0, 160)}`);
        assert(r.facts!.gitLiveDrift!.checked === false && r.facts!.gitLiveDrift!.reason === 'no-platform-call-record' && r.facts!.platformDriftCalls === undefined && r.calls === undefined, `${label}: no call may be planned`);
        assert(r.report.configForce?.reason === `config-sources-${want}` && r.report.held?.refs === 0 && r.report.held?.notDeclared === 1, `${label}: force/held ${JSON.stringify([r.report.configForce, r.report.held])}`);
        assert(JSON.stringify(r.report.configForce) === JSON.stringify(configGitFileForce(o.gov, [])), `${label}: the force is not the shipping function's`);
      }
    });

    await test('LCK3 (L-CS-K-b/c) the four Harvester stamps ARE the shipping functions\' answers (recomputed here with the test\'s own caller): configSourceReads, the liveEvidence Config arm, the call record of runPlatformDriftCalls, computeGitLiveDrift; every stored copy patched and re-read, the cached snapshot untouched; a HAND-BUILT fact, call record or untyped result is refused by name; a call with no plant is refused (never stubbed)', async () => {
      const cacheSha = sha(fs.readFileSync(snapshotPath(K8S_PROG), 'utf8'));
      const snap = planted(); const before = JSON.stringify(snap);
      const r = await cs.withComputedConfigFacts(snap, { protocol: P19, drift: FIXTURE_PLANT });
      const o = await oracle(snap);
      assert(r.report.state === 'computed' && JSON.stringify(snap) === before && r.snap !== snap, 'the lever must return a patched COPY');
      assert(JSON.stringify(r.facts!.configSourceReads) === JSON.stringify(o.reads), 'configSourceReads ≠ computeConfigSourceReads');
      assert(JSON.stringify(r.facts!.liveEvidence) === JSON.stringify(o.live) && o.live.lane === 'config' && o.live.summary === 'all-read', `liveEvidence ≠ computeConfigLiveEvidence (${o.live.summary})`);
      const strip = (c: any[]) => c.map(({ durationMs: _d, ...x }) => x);
      assert(JSON.stringify(strip(r.calls as any[])) === JSON.stringify(strip(o.calls as any[])) && o.invoked === 1 && r.calls![0].outcome === 'called', 'the call record is not runPlatformDriftCalls\' over the held file');
      assert(r.calls![0].manifestSha256 === r.store!.refs[0].blobSha256 && (r.calls![0] as any).heldSha256 === undefined, 'the bytes "sent" are not the held bytes');
      assert(JSON.stringify(r.facts!.gitLiveDrift) === JSON.stringify(computeGitLiveDrift(r.calls)) && JSON.stringify(r.facts!.gitLiveDrift) === JSON.stringify(o.drift), 'gitLiveDrift ≠ computeGitLiveDrift(call record)');
      const f0 = (r.facts!.gitLiveDrift as any).files[0];
      assert(f0.state === 'compared' && f0.summary === 'differences' && f0.differingTotal === 5 && f0.objects === 6 && f0.objectsCompared === 3, `the contract fixture's reading: ${JSON.stringify(f0).slice(0, 200)}`);
      const { h } = harvestOf(r.snap);
      const arts = r.snap.childArtifacts.filter((a) => a.executionId === h.executionId && a.name === 'result.json');
      assert(arts.length === r.report.copies && arts.every((a) => cs.CONFIG_FACT_KEYS.every((k) => JSON.stringify(JSON.parse(a.content)[k]) === JSON.stringify(r.facts![k]))), 'a stored copy of the Harvester result.json lacks a stamp');
      assert(sha(fs.readFileSync(snapshotPath(K8S_PROG), 'utf8')) === cacheSha, 'the cached snapshot was written');
      // The stamps are left alone on a leg that already carries production's own.
      const again = await cs.withComputedConfigFacts(r.snap, { protocol: P19, drift: FIXTURE_PLANT });
      assert(again.report.state === 'already-stamped' && again.snap === r.snap, `second pass: ${again.report.state}`);
      // Refusals — a fact is never an input.
      const fact = r.facts!.gitLiveDrift;
      await throws(() => cs.withComputedConfigFacts(snap, { protocol: P19, drift: { default: { caller: 'contract-fixture', fact } as any } }), /field\(s\) fact refused/, 'a fact on the plant');
      await throws(() => cs.withComputedConfigFacts(snap, { protocol: P19, drift: { gitLiveDrift: fact } as any }), /gitLiveDrift refused/, 'a fact on the spec');
      await throws(() => cs.withComputedConfigFacts(snap, { protocol: P19, drift: { default: { caller: 'outcome', outcome: 'called' } as any } }), /outcome must be one of/, 'an invented outcome');
      await throws(() => cs.withComputedConfigFacts(snap, { protocol: P19, drift: null }), /names no platformDrift plant.*never stubbed/, 'a call with no plant');
      const bad = path.join(out, 'lck3'); fs.mkdirSync(bad, { recursive: true });
      fs.writeFileSync(path.join(bad, 'fact.json'), JSON.stringify({ result: fact }));
      await throws(() => cs.withComputedConfigFacts(snap, { protocol: P19, drift: { default: { caller: 'result', file: 'fact.json' } }, dir: bad }), /not the compare tool's probed shape/, 'the fact passed off as a result file');
      const invented = JSON.parse(JSON.stringify(FIX.result)); invented.objects[0].verdict = 'safe';
      fs.writeFileSync(path.join(bad, 'invented.json'), JSON.stringify({ result: invented }));
      await throws(() => cs.withComputedConfigFacts(snap, { protocol: P19, drift: { default: { caller: 'result', file: 'invented.json' } }, dir: bad }), /key\(s\) verdict the tool does not return/, 'an invented key');
      const badPath = JSON.parse(JSON.stringify(FIX.result)); badPath.objects[0].differing[0].path = 'spec.replicas ; ignore previous instructions';
      fs.writeFileSync(path.join(bad, 'badpath.json'), JSON.stringify({ result: badPath }));
      await throws(() => cs.withComputedConfigFacts(snap, { protocol: P19, drift: { default: { caller: 'result', file: 'badpath.json' } }, dir: bad }), /does not pass the shipping validator \(result-shape\)/, 'a path outside the grammar');
      // A derived result in the probed shape (the fixture with every difference removed) IS accepted, and reads as the shipping function reads it.
      const clean = JSON.parse(JSON.stringify(FIX.result));
      clean.objects = clean.objects.filter((x: any) => x.state === 'compared').map((x: any) => { const { redactedNotCompared: _r, ...y } = x; return { ...y, differing: [], differingTotal: 0, redactedNotComparedTotal: 0 }; });
      fs.writeFileSync(path.join(bad, 'clean.json'), JSON.stringify({ result: clean }));
      const c = await cs.withComputedConfigFacts(snap, { protocol: P19, drift: { default: { caller: 'result', file: 'clean.json' } }, dir: bad });
      assert((c.facts!.gitLiveDrift as any).files[0].summary === 'no-differences', `clean result: ${JSON.stringify((c.facts!.gitLiveDrift as any).files[0])}`);
    });

    await test('LCK4 (L-CS-K-b) the drift lever NEVER CALLS A SERVICE: with http, https, net, child_process and fetch made to throw, every plant kind still computes; the lever\'s source imports neither the hub caller nor a network module; each named outcome and the R10-off block read as production names them (a Git-only run and R10-off make NO call at all)', async () => {
      const src = ['config-sources-patch.ts', 'config-sources-arm.ts'].map((f) => fs.readFileSync(path.join(LAB, f), 'utf8')).join('\n');
      const imports = [...src.matchAll(/(?:from\s+|require\()\s*'([^']+)'/g)].map((m) => m[1]);
      const banned = imports.filter((i) => /services\/platform-drift|mcpService|services\/mcp\/|^https?$|^net$|^tls$|^dgram$|^child_process$|node-fetch|undici|axios/.test(i));
      assert(banned.length === 0, `the drift lever imports ${banned.join(', ')}`);
      assert(imports.some((i) => /harness\/platform-drift-run$/.test(i)) && imports.some((i) => /harness\/git-live-drift$/.test(i)), 'the lever must import the SHIPPING platform-drift-run and git-live-drift');
      const tripped: string[] = [];
      const patches: Array<[any, string, any]> = [];
      const trip = (mod: any, key: string, name: string) => { patches.push([mod, key, mod[key]]); mod[key] = () => { tripped.push(name); throw new Error(`LCK4: ${name} was called`); }; };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const http = require('http'), https = require('https'), net = require('net'), cp = require('child_process');
      trip(http, 'request', 'http.request'); trip(http, 'get', 'http.get'); trip(https, 'request', 'https.request'); trip(https, 'get', 'https.get');
      trip(net, 'connect', 'net.connect'); trip(net, 'createConnection', 'net.createConnection');
      for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) trip(cp, k, `child_process.${k}`);
      trip(globalThis as any, 'fetch', 'fetch');
      const priorR10 = process.env.ARTIFACT_SECRET_REDACT_ENABLED;
      try {
        const snap = planted();
        const want: Array<[any, string, number]> = [[FIXTURE_PLANT, 'called', 1],
          ...(['no-compare-tool', 'refused', 'foreign-service', 'tool-refused', 'failed'] as const).map((k): [any, string, number] => [{ default: { caller: 'outcome', outcome: k } },
            ({ 'no-compare-tool': 'service-declares-no-compare-tool', refused: 'call-refused', 'foreign-service': 'service-not-owned', 'tool-refused': 'tool-refused', failed: 'call-failed' } as Record<string, string>)[k], 1])];
        for (const [drift, outcome, fixtureCalls] of want) {
          const r = await cs.withComputedConfigFacts(snap, { protocol: P19, drift });
          assert(r.calls!.length === 1 && r.calls![0].outcome === outcome && r.report.platformDriftCalls!.fixtureCalls.length === fixtureCalls, `${JSON.stringify(drift)}: ${JSON.stringify(r.report.platformDriftCalls)}`);
          const f = (r.facts!.gitLiveDrift as any).files[0];
          assert(outcome === 'called' ? f.state === 'compared' : f.state === 'not-checked' && f.reason === outcome, `${outcome}: fact ${JSON.stringify(f).slice(0, 160)}`);
          assert(renderGitLiveDriftForPrompt(r.facts!.gitLiveDrift as any)!.length >= 2, `${outcome}: no §6 render`);
        }
        // A Git-only run: no live-read line ⇒ no call is made, and the fact says so; liveEvidence reads `git-only`.
        const go = await cs.withComputedConfigFacts(planted(block(GIT_LINE)), { protocol: P19, drift: null });
        assert(go.calls![0].outcome === 'no-live-read-source' && go.report.platformDriftCalls!.fixtureCalls.length === 0 && go.facts!.liveEvidence!.summary === 'git-only', `git-only: ${JSON.stringify(go.report).slice(0, 300)}`);
        // Live only: no git-file line ⇒ nothing kept, an empty record, no call.
        const lo = await cs.withComputedConfigFacts(planted(block(LIVE_LINE)), { protocol: P19, drift: null });
        assert(Array.isArray(lo.calls) && lo.calls.length === 0 && lo.report.held!.refs === 0 && lo.report.held!.notDeclared === 1 && lo.report.configForce === null && lo.facts!.liveEvidence!.summary === 'all-read', `live-only: ${JSON.stringify(lo.report).slice(0, 300)}`);
        // R10 off: the held bytes are raw, so nothing is "sent" (sec-ops F4).
        process.env.ARTIFACT_SECRET_REDACT_ENABLED = 'false';
        const off = await cs.labPlatformDriftCalls({ sources: govOf(snap) as never, store: hs.buildLabHeldStore(snap, govOf(snap) as never), toolCalls: harvestOf(snap).result.toolCalls, spec: FIXTURE_PLANT, dir: null });
        assert(off.calls![0].outcome === 'redaction-off' && off.log.length === 0, `R10 off: ${JSON.stringify(off.calls)}`);
      } finally {
        if (priorR10 === undefined) delete process.env.ARTIFACT_SECRET_REDACT_ENABLED; else process.env.ARTIFACT_SECRET_REDACT_ENABLED = priorR10;
        for (const [mod, key, orig] of patches) mod[key] = orig;
      }
      assert(tripped.length === 0, `a network or process call was attempted: ${tripped.join(', ')}`);
    });

    await test('LCK5 (multi-leg, owner 2026-11-15: every leg holds every declared file) one shared block naming three files: a leg whose Harvester read ONE is forced `git-file-not-held` with the two missing labels and the platform calls the compare tool for the held file only; a leg that read all three holds exactly the three, is not forced, and gets three calls; an in-pin file no line declares is never held', async () => {
      const B3 = block(GIT_LINE, 'leg-b: git-file — service github-service ; paichart/paichart-lab-configs/k8s/leg-b.yaml', 'leg-c: git-file — service github-service ; paichart/paichart-lab-configs/k8s/leg-c.yaml', LIVE_LINE);
      const snap = planted(B3);
      const one = await cs.withComputedConfigFacts(snap, { protocol: P19, drift: FIXTURE_PLANT });
      assert(JSON.stringify(one.report.configForce) === JSON.stringify({ reason: 'git-file-not-held', gitFilesNotHeld: ['leg-b', 'leg-c'], gitFilesNotHeldTotal: 2 }), `one file read: ${JSON.stringify(one.report.configForce)}`);
      assert(one.calls!.map((c) => `${c.label}:${c.outcome}`).join() === 'sample-workloads:called,leg-b:file-not-held,leg-c:file-not-held' && one.report.platformDriftCalls!.fixtureCalls.length === 1, `calls: ${one.calls!.map((c) => `${c.label}:${c.outcome}`).join()}`);
      assert(one.facts!.liveEvidence!.summary === 'all-read' && (one.facts!.configSourceReads as any).notRead === 2, 'the read record must name the two unread files');
      // A leg that read all three: the stored Git read record re-cast for the two other paths (a TEST derivation of a stored record,
      // content made distinct per file) and appended — the capture, the scope and the force are the shipping functions'.
      const { h, result } = harvestOf(snap);
      const gitCall = result.toolCalls.find((t: any) => t?.arguments?.targetService === 'github-service');
      const recast = (p: string) => JSON.parse(JSON.stringify(gitCall).split('k8s/sample-workloads.yaml').join(p).split('# Trading namespace').join(`# ${p} — Trading namespace`));
      const calls3 = [...result.toolCalls, recast('k8s/leg-b.yaml'), recast('k8s/leg-c.yaml'), recast('k8s/undeclared.yaml')];
      const all = await cs.withComputedConfigFacts(snap, { protocol: P19, drift: FIXTURE_PLANT }, { toolCalls: calls3, executionId: 'lab-lck5-h', taskId: h.taskId, text: String(result.finalResponse) });
      assert(all.report.configForce === null, `three files read: forced ${JSON.stringify(all.report.configForce)}`);
      assert(all.store!.refs.map((r) => r.path).sort().join() === '/k8s/leg-b.yaml,/k8s/leg-c.yaml,/k8s/sample-workloads.yaml' && all.report.held!.notDeclared === 1, `held: ${all.store!.refs.map((r) => r.path).join()} notDeclared ${all.report.held!.notDeclared}`);
      assert(all.calls!.every((c) => c.outcome === 'called') && all.calls!.length === 3 && (all.facts!.gitLiveDrift as any).filesCompared === 3, `calls: ${all.calls!.map((c) => `${c.label}:${c.outcome}`).join()}`);
      assert((all.facts!.configSourceReads as any).undeclaredGitFileReads === 1 && all.snap === snap, 'the undeclared read must be counted, and direct mode patches nothing');
      // byLabel: one file's service answer can differ from the default.
      const mixed = await cs.withComputedConfigFacts(snap, { protocol: P19, drift: { default: { caller: 'contract-fixture' }, byLabel: { 'leg-b': { caller: 'outcome', outcome: 'tool-refused' } } } },
        { toolCalls: calls3, executionId: 'lab-lck5-h', taskId: h.taskId, text: String(result.finalResponse) });
      assert(mixed.calls!.map((c) => c.outcome).join() === 'called,tool-refused,called', `byLabel: ${mixed.calls!.map((c) => c.outcome).join()}`);
    });

    await test('LCK6 (carry + bytes, $0 dry run through lab.ts) a persisted Kubernetes Reviewer cell: the 1.18.0 base arm is byte-identical to the frozen production rebuild AND to the same arm of a node with no lever (all four prompts); the 1.19.0 arm\'s Reviewer prompt is the base prompt plus EXACTLY the shipping renders of the Author\'s transcription (liveEvidence Config arm, then gitLiveDrift), its Author prompt plus the liveEvidence lines only; the control line reads rollbackContainment ✓ on the held cell; a hand-built fact in the node spec stops the dry run', async () => {
      const gsm = await import('./leg-replay-lab/golden-set');
      const root = path.join(out, 'lck6'); fs.mkdirSync(root, { recursive: true });
      fs.cpSync(path.join(gsm.GOLDEN_DIR, 'fixtures', 'model-lab'), path.join(root, 'model-lab'), { recursive: true });
      const comp = gsm.buildGoldenCompanion(path.join(root, 'model-lab'), gsm.loadGoldenSet()).dir;
      const ef = path.join(comp, 'experiment.json');
      const e = JSON.parse(fs.readFileSync(ef, 'utf8'));
      const g = e.nodes.find((n: any) => n.id === 'GOLD-K8S-PROG');
      assert(g && g.authorExecutionId === K8S_PROG && g.reviewerExecutionId === K8S_PROG_REVIEWER && e.variants.gmxk8sr, 'the golden companion no longer carries GOLD-K8S-PROG / gmxk8sr');
      const desc = cached(K8S_PROG).leg!.description as string;
      fs.mkdirSync(path.join(comp, 'edits'), { recursive: true });
      fs.writeFileSync(path.join(comp, 'edits', 'cs-block.json'), JSON.stringify({ id: 'cs-block', appliesTo: ['leg:description'], ops: [{ type: 'replace', old: desc, new: `${desc}${BLOCK}` }] }));
      e.label = 'lck6'; delete e.standingBench;
      e.variants = { b: { ...e.variants.gmxk8sr, comment: 'base: the golden pin (1.18.0)' }, c: { ...e.variants.gmxk8sr, composedVersion: '1.19.0', comment: 'the Config-sources version key (no text yet)' } };
      const levers = { inputEdits: 'edits/cs-block.json', configSourcesSnapshot: 'first-execution', platformDrift: FIXTURE_PLANT };
      e.nodes = [{ ...g, id: 'R-BASE', variants: ['b'] }, { ...g, id: 'R-CS', variants: ['b', 'c'], ...levers }];
      fs.writeFileSync(ef, JSON.stringify(e));
      const dry = path.join(root, 'dry');
      const log = runLab(['run', '--experiment', comp, '--out', dry]);
      assert(/DRY RUN, \$0/.test(log) && /No model was called/.test(log), 'not a dry run');
      assert(/R-CS +control pass: leaf nets reproduce persisted \[markerPresence ✓ rollbackContainment ✓\]/.test(log) && /R-BASE +control pass: leaf nets reproduce persisted \[markerPresence ✓ rollbackContainment ✓\]/.test(log), `the held cell's control line: ${(log.match(/control pass[^\n]*/g) ?? []).join(' | ').slice(0, 300)}`);
      const rd = (n: string, v: string, f: string) => fs.readFileSync(path.join(dry, n, v, f), 'utf8');
      for (const f of ['reviewer.user.md', 'reviewer.system.md', 'author.user.md', 'author.system.md']) assert(rd('R-CS', 'b', f) === rd('R-BASE', 'b', f), `the levers moved the base arm's ${f}`);
      let fc = ''; try { fc = runLab(['frozen-cmp', '--experiment', comp, '--run', dry]); } catch (x: any) { fc = String(x.stdout ?? ''); }
      assert(/✅ R-BASE\/b: reviewer\.system\.md identical · reviewer\.user\.md identical/.test(fc) && /✅ R-CS\/b: reviewer\.system\.md identical · reviewer\.user\.md identical/.test(fc), `frozen-cmp base arms: ${fc}`);
      assert(/≠ +R-CS\/c: reviewer\.system\.md identical · reviewer\.user\.md differs/.test(fc), `frozen-cmp candidate arm: ${fc}`);
      // The forward pin: what a leg STORED at 1.19.0 would have chained — computed here, never by the lever.
      const snap = planted(); const o = await oracle(snap); const { h } = harvestOf(snap);
      const tr = (f: Record<string, unknown>) => ({ ...f, point: 'author-transcription', harvesterExecutionId: h.executionId });
      const liveLines = renderLiveEvidenceForPrompt(tr(o.live) as never)!; const driftLines = renderGitLiveDriftForPrompt(tr(o.drift) as never)!;
      assert(liveLines.length === 3 && driftLines.length === 10, `oracle renders: ${liveLines.length}/${driftLines.length} lines`);
      const splice = (base: string, cand: string, want: string[], what: string) => {
        const b = base.split('\n'); const c = cand.split('\n');
        let i = 0; while (i < b.length && b[i] === c[i]) i++;
        assert(c.length === b.length + want.length && JSON.stringify(c.slice(i, i + want.length)) === JSON.stringify(want) && JSON.stringify(c.slice(i + want.length)) === JSON.stringify(b.slice(i)),
          `${what}: the candidate prompt is not the base prompt plus exactly the ${want.length} rendered line(s) (first difference at line ${i + 1}: ${JSON.stringify(c[i]).slice(0, 160)})`);
      };
      splice(rd('R-CS', 'b', 'reviewer.user.md'), rd('R-CS', 'c', 'reviewer.user.md'), [...liveLines, ...driftLines], 'Reviewer');
      splice(rd('R-CS', 'b', 'author.user.md'), rd('R-CS', 'c', 'author.user.md'), liveLines, 'Author');
      assert(rd('R-CS', 'c', 'reviewer.system.md') === rd('R-CS', 'b', 'reviewer.system.md') && rd('R-CS', 'c', 'author.system.md') === rd('R-CS', 'b', 'author.system.md'), 'a system prompt moved');
      const m = JSON.parse(fs.readFileSync(path.join(dry, 'manifest.json'), 'utf8'));
      const hc = m.nodes['R-CS'].variants.c.held.configSources;
      assert(hc.state === 'computed' && hc.configForce === null && hc.held.refs === 1 && hc.platformDriftCalls.outcomes.join() === 'sample-workloads:called' && m.nodes['R-CS'].variants.b.held.configSources === undefined, `manifest: ${JSON.stringify(hc).slice(0, 300)}`);
      assert(m.nodes['R-CS'].controls.leafNetsReproducePersisted.rollbackContainment === true && m.nodes['R-CS'].controls.leafNetsReproducePersisted.heldAware === true, 'control: held-aware rollbackContainment');
      // A hand-built fact in the node spec stops the run before any build.
      e.nodes[1].platformDrift = { default: { caller: 'contract-fixture', gitLiveDrift: o.drift } };
      fs.writeFileSync(ef, JSON.stringify(e));
      let refused = ''; try { runLab(['run', '--experiment', comp, '--out', path.join(root, 'dry-bad')]); } catch (x: any) { refused = String(x.stderr ?? '') + String(x.stdout ?? ''); }
      assert(/field\(s\) gitLiveDrift refused/.test(refused), `a hand-built fact was not refused: ${refused.slice(-300)}`);
    });

    await test('LCK7 (Architect + Harvester cells, $0) on the L-K2 experiment\'s cached Kubernetes nodes with a 1.19.0 version key: the Architect\'s Harvester entry carries liveEvidence AND gitLiveDrift (both rendered in its prompt), the base held arm\'s prompt is byte-identical with and without the levers; a Harvester sample (--fake-llm persisted, recorded tools) is stamped all four facts from its OWN capture, the drift record made by the fixture caller; the arm below the version gets none', async () => {
      const K2 = path.join(LAB, 'inputs', '2026-10-19-held-k8s-l-k2');
      const root = path.join(out, 'lck7'); const exp = path.join(root, 'exp');
      fs.cpSync(K2, exp, { recursive: true });
      const ef = path.join(exp, 'experiment.json'); const e = JSON.parse(fs.readFileSync(ef, 'utf8'));
      const x = e.nodes.find((n: any) => n.id === 'X-K1'); const hn = e.nodes.find((n: any) => n.id === 'H-CAUSE-WIT');
      assert(x && hn && !x.inputEdits && !hn.inputEdits, 'the L-K2 nodes this test borrows changed');
      const plant = (id: string, file: string) => { const d = cached(id).leg!.description as string; fs.writeFileSync(path.join(exp, 'edits', file), JSON.stringify({ id: file.replace('.json', ''), appliesTo: ['leg:description'], ops: [{ type: 'replace', old: d, new: `${d}${BLOCK}` }] })); return `edits/${file}`; };
      e.variants.xcs = { ...e.variants.xhb, composedVersion: '1.19.0' }; e.variants.hcs = { ...e.variants.hk2, composedVersion: '1.19.0' };
      // The new arms read the SAME materialized text as the arms they copy (same edits) — only the version key differs.
      for (const [from, to] of [['xhb', 'xcs'], ['hk2', 'hcs']]) for (const f of fs.readdirSync(path.join(exp, 'protocols')).filter((n) => n.endsWith(`.${from}.md`))) fs.copyFileSync(path.join(exp, 'protocols', f), path.join(exp, 'protocols', f.replace(`.${from}.md`, `.${to}.md`)));
      const xl = { inputEdits: plant(x.authorExecutionId, 'cs-x.json'), configSourcesSnapshot: 'first-execution', platformDrift: FIXTURE_PLANT };
      const hl = { inputEdits: plant(hn.authorExecutionId, 'cs-h.json'), configSourcesSnapshot: 'first-execution', platformDrift: FIXTURE_PLANT };
      const { nByVariant: _n, ...x0 } = x; const { nByVariant: _m, ...h0 } = hn;
      e.nodes = [{ ...x0, id: 'X-BASE', variants: ['xhb'] }, { ...x0, id: 'X-CS', variants: ['xhb', 'xcs'], ...xl }, { ...h0, id: 'H-CS', variants: ['hk2', 'hcs'], ...hl }];
      fs.writeFileSync(ef, JSON.stringify(e));
      const dry = path.join(root, 'dry');
      runLab(['run', '--experiment', exp, '--only', 'X-BASE,X-CS', '--out', dry]);
      const rd = (n: string, v: string, f: string) => fs.readFileSync(path.join(dry, n, v, f), 'utf8');
      // The only base-arm footprint is the input edit itself (the Architect is shown the leg's objective): nothing else moves.
      const delta = (a: string, b: string) => { const A = a.split('\n'); const B = b.split('\n'); return { added: B.filter((l) => !A.includes(l)), removed: A.filter((l) => !B.includes(l)) }; };
      const baseDelta = delta(rd('X-BASE', 'xhb', 'author.user.md'), rd('X-CS', 'xhb', 'author.user.md'));
      assert(baseDelta.removed.length === 0 && baseDelta.added.every((l) => BLOCK.split('\n').includes(l)), `the levers moved the base arm beyond the planted block: +${JSON.stringify(baseDelta.added).slice(0, 200)} -${JSON.stringify(baseDelta.removed).slice(0, 200)}`);
      const d = delta(rd('X-CS', 'xhb', 'author.user.md'), rd('X-CS', 'xcs', 'author.user.md'));
      assert(d.removed.length === 0 && d.added.some((l) => l.startsWith('- **Live evidence — the platform\'s live-evidence fact**: `all-read`')) && d.added.some((l) => l.startsWith('- **Git vs live — the platform\'s Git-vs-live drift fact**'))
        && d.added.some((l) => l.includes('`spec.replicas` (value-differs)')) && d.added.length === 13, `Architect delta: ${JSON.stringify(d).slice(0, 400)}`);
      const fake = path.join(root, 'fake');
      runLab(['run', '--experiment', exp, '--only', 'H-CS', '--fake-llm', 'persisted', '--n', '1', '--out', fake]);
      const s = (v: string) => JSON.parse(fs.readFileSync(path.join(fake, 'H-CS', v, 'sample-01', 'sample.json'), 'utf8'));
      const cf = s('hcs').configFacts;
      assert(cf && cf.liveEvidence.lane === 'config' && cf.liveEvidence.summary === 'all-read' && cf.configSourceReads.checked === true && cf.gitLiveDrift.checked === true && cf.gitLiveDrift.filesCompared === 1
        && cf.platformDriftCalls.calls[0].outcome === 'called' && cf.report.configForce === null && cf.report.platformDriftCalls.fixtureCalls[0].plant === 'contract-fixture', `Harvester sample: ${JSON.stringify(cf).slice(0, 400)}`);
      assert(s('hk2').configFacts === undefined && !Object.keys(s('hk2').leafFacts).includes('gitLiveDrift'), 'an arm below the Config-sources version must stamp none of the facts');
      assert(Object.keys(s('hcs').leafNetErrors ?? {}).filter((k) => (cs.CONFIG_FACT_KEYS as readonly string[]).includes(k)).length === 0, `a Config net errored: ${JSON.stringify(s('hcs').leafNetErrors)}`);
    });

    await test('LCK8 (L-CS-K, 2026-11-16) a drift answer for a STORED leg is the rig tool\'s own compare_manifest over the stored manifest + the Harvester\'s recorded live reads (k8s-drift-from-recorded.py): deterministic (the golden v8 files regenerate byte for byte), an unread object is live-read-failed (never absent, never equal), a live plant can change a recorded object and cannot create one; the lab\'s probed-shape check admits `namespace` on exactly the not-compared reasons the tool decides AFTER setting it (pinned to the tool\'s source order) and never `detail`; an input-edit file whose ops target several places applies each op only to its own target', async () => {
      const { execFileSync } = await import('child_process');
      const GEN = path.join(LAB, 'k8s-drift-from-recorded.py');
      const tmp = path.join(out, 'lck8'); fs.mkdirSync(tmp, { recursive: true });
      for (const [cse, id] of [['K8S-PROG', 'cmvsze85600boyxb3iipbdk3r'], ['K8S-BK3', 'cmveuxfhg0079yxdp63qsw0hc'], ['K8S-AK5', 'cmvdnl4tg00kqyxt00x6923yn']]) {
        if (!fs.existsSync(snapshotPath(id))) throw new Error(`the lab cache has no snapshot ${id} (LAB-TEST-READS-PRODUCTION: fill the cache first)`);
        const f = path.join(tmp, `${cse}.json`);
        execFileSync('python3', ['-I', GEN, id, '--out', f]);
        assert(fs.readFileSync(f, 'utf8') === fs.readFileSync(path.join(LAB, 'golden', 'config-sources', `${cse}.compare-result.json`), 'utf8'), `${cse}: the committed golden drift answer does not regenerate byte for byte`);
        const r = JSON.parse(fs.readFileSync(f, 'utf8'));
        const unknown = r.result.objects.filter((o: any) => o.state === 'not-compared');
        assert(unknown.every((o: any) => o.reason === 'live-read-failed' && !('detail' in o)) && unknown.length === r.provenance.notReadByTheHarvest.length, `${cse}: an object with no recorded live copy must be live-read-failed with no detail, and only those`);
        assert(r.provenance.namespaceExistenceWitnessed.join() === 'trading' && r.result.objects.find((o: any) => o.kind === 'Namespace')?.state === 'compared', `${cse}: the Namespace (it declares nothing but its name) is compared by existence`);
        // blind-read F1: what the production tool would GET. A-K5's window has same-reset reads (shared UIDs) for the objects its own harvest skipped.
        if (cse === 'K8S-AK5') assert(unknown.length === 0 && r.provenance.sameResetReads.map((b: any) => b.object).sort().join() === 'configmaps/trading/orders-api-config,networkpolicies/trading/orders-api-ingress' && r.provenance.sameResetLinks.length > 0, `K8S-AK5: same-reset reads ${JSON.stringify(r.provenance.sameResetReads)}`);
        if (cse === 'K8S-PROG') assert(unknown.map((o: any) => o.kind).sort().join() === 'ConfigMap,Service' && r.provenance.sameResetReads.length === 0, `K8S-PROG: no same-reset copy exists for Service and ConfigMap`);
        const own = JSON.parse(execFileSync('python3', ['-I', GEN, id, '--own-reads-only']).toString());
        assert(own.result.objects.filter((o: any) => o.state === 'not-compared').length >= unknown.length && own.provenance.sameResetReads.length === 0, `${cse}: --own-reads-only must answer only the harvest's own reads`);
        assert(!r.result.objects.some((o: any) => o.state === 'absent-live'), `${cse}: an unread object was answered absent`);
      }
      // A plant cannot create an object the harvest never read.
      fs.writeFileSync(path.join(tmp, 'bad-plant.json'), JSON.stringify([{ object: 'configmaps/trading/orders-api-config', set: { 'data.LOG_LEVEL': 'debug' } }]));
      let err = ''; try { execFileSync('python3', ['-I', GEN, 'cmvsze85600boyxb3iipbdk3r', '--live-plant', path.join(tmp, 'bad-plant.json')], { stdio: 'pipe' }); } catch (x: any) { err = String(x.stderr ?? '') + String(x.stdout ?? ''); }
      assert(/never read that object \(a plant cannot create one\)/.test(err), `a plant on an unread object must be refused: ${err.slice(0, 200)}`);
      // The shape allowance is the tool's source order: namespace is written before get_live, and the three reasons come after it.
      const tool = fs.readFileSync(path.join(LAB, '..', '..', '.claude/knowledge/pipelines/kubernetes-gitops/phase4-kind-rig/k8s-mcp-readonly/declared_compare.py'), 'utf8');
      const at = (needle: string) => { const i = tool.indexOf(needle); assert(i >= 0, `declared_compare.py no longer contains ${needle}`); return i; };
      const nsSet = at('entry["namespace"] = _clean(namespace, 253)');
      for (const reason of cs.NAMESPACED_NOT_COMPARED_REASONS) assert(at(`"reason": "${reason}"`) > nsSet, `${reason} is decided before the namespace is set — the probed-shape allowance is wrong`);
      for (const reason of ['secret-never-compared', 'kind-not-allowlisted', 'no-namespace']) assert(at(`"reason": "${reason}"`) < nsSet, `${reason} moved after the namespace line — re-read NAMESPACED_NOT_COMPARED_REASONS`);
      const FIXR = JSON.parse(fs.readFileSync(cs.CONTRACT_FIXTURE, 'utf8')).result;
      const withObj = (o: Record<string, unknown>) => ({ ...FIXR, objects: [...FIXR.objects, o] });
      assert(cs.probedShapeProblems(withObj({ index: 9, apiVersion: 'v1', kind: 'Service', name: 'x', namespace: 'trading', state: 'not-compared', reason: 'live-read-failed' })).length === 0, 'live-read-failed with namespace must be the tool\'s shape');
      assert(cs.probedShapeProblems(withObj({ index: 9, apiVersion: 'v1', kind: 'Secret', name: 'x', namespace: 'trading', state: 'not-compared', reason: 'secret-never-compared' })).some((m: string) => /namespace/.test(m)), 'a Secret entry carrying namespace is not the tool\'s shape');
      assert(cs.probedShapeProblems(withObj({ index: 9, apiVersion: 'v1', kind: 'Service', name: 'x', namespace: 'trading', state: 'not-compared', reason: 'live-read-failed', detail: 'api status 403' })).some((m: string) => /detail/.test(m)), '`detail` must never be admitted');
      // A mixed-target input edit (leg + brief + a raw tool-call plant in ONE file) applies, and each target holds only its own ops.
      const ie = await import('./leg-replay-lab/input-edits');
      const E = path.join(LAB, 'inputs', '2026-11-16-config-sources-k8s-l-cs-k');
      const spec = JSON.parse(fs.readFileSync(path.join(E, 'node-inputs', 'h-gitlive.json'), 'utf8'));
      const hs0 = cached('cmvdnhwdx00jayxt0ub4o6gf4');
      const r = ie.snapshotWithInputEdits(E, { id: 'LCK8', inputEdits: 'node-inputs/h-gitlive.json' }, hs0) as any;
      assert(Object.keys(r.report.targets).sort().join() === 'author-task:description,harvester-toolcall:cmvdnhwdx00jayxt0ub4o6gf4:0,leg:description', `targets: ${Object.keys(r.report.targets).join()}`);
      assert(String(r.snap.leg.description).endsWith('trading-cluster: live-read — service k8s-rig-readonly\n') && JSON.parse(r.snap.author.resultJson).toolCalls[0].result.content[0].data.result.content[0].text.includes('compare_declared_fields'), 'a target did not take its op');
      assert(spec.ops.length === 3, 'h-gitlive carries three ops (leg, brief, descriptor)');
      // fixture read D3: a cell built on one stored leg for ANOTHER objective patches the task TITLE and the stage NAME too.
      const E3 = path.join(LAB, 'inputs', '2026-11-16-config-sources-k8s-l-cs-k-3leg');
      const r3 = ie.snapshotWithInputEdits(E3, { id: 'LCK8-3', inputEdits: 'node-inputs/h3-flags.json' }, hs0) as any;
      assert(r3.snap.author.task.title === 'Harvest current cluster state for the orders-api-flags ConfigMap (trading namespace)' && r3.snap.author.stage.name === 'Pipeline: orders-api-flags leg — FEATURE_X on'
        && !String(r3.snap.author.task.description).includes('resources/HPA objective') && hs0.author.task.title !== r3.snap.author.task.title, 'h3-flags: title / stage name / objective-class sentence not patched (or the cached snapshot was written)');
      // X-INSCOPE re-plant: the chained Harvester's taskTitle (the "### Previous Task" heading) is patched in every copy too.
      const xs = ie.snapshotWithInputEdits(path.join(LAB, 'inputs', '2026-11-16-config-sources-k8s-l-cs-k'), { id: 'LCK8-X', inputEdits: 'node-inputs/x-inscope.json' }, cached('cmvdlhll500adyxt0kuhctd5y')) as any;
      const ent = xs.snap.author.exec.config.inputContext.chainedFrom.find((e: any) => e.executionId === 'cmvdlfnpq005kyxt0c7jol17h');
      assert(!/scraper/i.test(ent.taskTitle) && !/scraper/i.test(xs.snap.author.task.title) && !/scraper/i.test(xs.snap.author.stage.name) && /tier: web/.test(xs.snap.author.task.description), `x-inscope re-plant: ${ent.taskTitle} | ${xs.snap.author.task.title} | ${xs.snap.author.stage.name}`);
    });

    await test('LCK10 (L-CS-K first runs, 2026-11-16: --max-usd 2.96 spent $3.42; --max-usd 1.04 spent $1.47; the rb arm (nByVariant 0) ran under --n 1) the spend cap is checked BEFORE every model call — once the meter reaches it no further call is sent, so the overrun is bounded by the calls in flight (<= --concurrency, one call each) and the manifest records the cap and the rule; a per-variant n of 0 is never overridden by --n', async () => {
      const K2 = path.join(LAB, 'inputs', '2026-10-19-held-k8s-l-k2');
      const dir = path.join(out, 'lck10-cap');
      const conc = 2;
      let log = '';
      try {
        log = execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.join(LAB, 'lab.ts'), 'run', '--experiment', K2, '--only', 'H-CAUSE-WIT,X-K1,X-K2', '--variants', 'hk2,xhb',
          '--n', '3', '--concurrency', String(conc), '--fake-llm', 'persisted', '--max-usd', '0.05', '--out', dir],
          { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: '', LAB_TEST_FAKE_OUTPUT_TOKENS: '1000' }, maxBuffer: 64 * 1024 * 1024 }).toString();
      } catch (x: any) { log = String(x.stdout ?? '') + String(x.stderr ?? ''); }
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      // The fake bills only output tokens: 1000 Sonnet 5 output tokens per call.
      const perCall = Math.max(...fs.readdirSync(dir).flatMap((n) => fs.statSync(path.join(dir, n)).isDirectory() ? fs.readdirSync(path.join(dir, n)).filter((v) => fs.statSync(path.join(dir, n, v)).isDirectory()).flatMap((v) => fs.readdirSync(path.join(dir, n, v)).filter((x) => /^sample-/.test(x)).map((x) => {
        const sj = JSON.parse(fs.readFileSync(path.join(dir, n, v, x, 'sample.json'), 'utf8')); return Math.max(0, ...(sj.calls ?? []).map((c: any) => c.costUsd ?? 0)); })) : []));
      assert(m.maxUsd === 0.05 && /a model call is sent only if/.test(m.capRule) && m.capHits > 0, `manifest cap fields: ${JSON.stringify({ maxUsd: m.maxUsd, capRule: m.capRule, capHits: m.capHits })}`);
      // Every fake call costs the same, so after the first answer the reserve is exact and the run never passes the cap.
      assert(perCall > 0 && m.spentUsd <= m.maxUsd + 1e-9, `spent $${m.spentUsd} exceeds the cap $${m.maxUsd} (per call $${perCall.toFixed(4)}, concurrency ${conc})`);
      assert(/LAB CAP/.test(log), 'no sample reports the cap');
      // nByVariant 0 is prompts only, whatever --n says.
      const E = path.join(LAB, 'inputs', '2026-11-16-config-sources-k8s-l-cs-k');
      const d2 = path.join(out, 'lck10-n0');
      execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.join(LAB, 'lab.ts'), 'run', '--experiment', E, '--only', 'R-CONSISTENT', '--n', '1', '--fake-llm', 'persisted', '--out', d2],
        { cwd: path.join(__dirname, '..'), env: { ...process.env, ANTHROPIC_API_KEY: '' }, maxBuffer: 64 * 1024 * 1024 });
      const rbSamples = fs.existsSync(path.join(d2, 'R-CONSISTENT', 'rb')) ? fs.readdirSync(path.join(d2, 'R-CONSISTENT', 'rb')).filter((x) => /^sample-/.test(x)) : [];
      const rcSamples = fs.readdirSync(path.join(d2, 'R-CONSISTENT', 'rc')).filter((x) => /^sample-/.test(x));
      assert(rbSamples.length === 0 && rcSamples.length === 1, `nByVariant 0 under --n 1: rb ${rbSamples.length} sample(s), rc ${rcSamples.length}`);
    });

    await test('LCK11 (L-CS-K stop item 3, LAB-UNSERVED-NOTICE-LEAK) the k8s cluster tier answers EVERY call to the read-only service from the recorded cluster state (k8s-cluster-fixture.py over the A-K5 harvest + its same-reset harvests): recorded objects and complete listings served (label selectors applied), an absent member 404, anything the state cannot establish 403, the service\'s own argument errors — never the lab notice; other services fall through to the recorded tier', async () => {
      const { execFileSync } = await import('child_process');
      const k8 = await import('./leg-replay-lab/k8s-fixtures');
      const { TOOL_STUB_RESULT } = await import('./leg-replay-lab/live');
      const f = path.join(out, 'lck11', 'state.json'); fs.mkdirSync(path.dirname(f), { recursive: true });
      execFileSync('python3', ['-I', path.join(LAB, 'k8s-cluster-fixture.py'), 'cmvdnl4tg00kqyxt00x6923yn', '--out', f]);
      const st = k8.loadK8sClusterState(f);
      assert(st.harvesters!.length >= 2 && Object.keys(st.objects).length >= 4 && st.membership['pods/trading'], `state: ${st.harvesters?.length} harvests, ${Object.keys(st.objects).length} objects`);
      const fallbackCalls: string[] = [];
      const fallback = { log: [] as any[], async getToolDefinition(n: string) { return { serverName: 'x', tool: { name: n } }; }, async executeToolOnServer(_s: string, t: string) { fallbackCalls.push(t); return { content: [{ type: 'text', text: 'recorded' }] }; } };
      const srv = k8.createK8sClusterServer(st, fallback as any, TOOL_STUB_RESULT);
      const call = async (tool: string, args: Record<string, unknown>) => {
        const r: any = await srv.executeToolOnServer('paichart-embedded-mcp', 'services', { action: 'call', targetService: 'k8s-rig-readonly', tool, arguments: JSON.stringify(args) });
        const res = r.content[0].data.result; const text = JSON.stringify(r);
        assert(!/LEG REPLAY LAB|not executed in an offline replay/.test(text), `${tool}: the lab notice leaked`);
        return { isError: res.isError === true, text: res.content[0].text, sc: res.structuredContent };
      };
      const pods = await call('list_resource_names', { resourceType: 'pods', namespace: 'trading', labelSelector: 'app=orders-api' });
      assert(!pods.isError && pods.sc.count === Object.keys(st.membership['pods/trading'].names).length && pods.sc.count > 0, `pods: ${pods.text.slice(0, 160)}`);
      const none = await call('list_resource_names', { resourceType: 'pods', namespace: 'trading', labelSelector: 'app=no-such-app' });
      assert(!none.isError && none.sc.count === 0, 'a selector that matches nothing must return an empty listing');
      const dep = await call('get_resource', { resourceType: 'deployments', namespace: 'trading', name: 'orders-api' });
      assert(!dep.isError && dep.sc.metadata.name === 'orders-api', 'a recorded object must be served');
      const nps = await call('list_resources', { resourceType: 'networkpolicies', namespace: 'trading' });
      assert(!nps.isError && nps.sc.items.length === 1, 'a complete listing with every object recorded must be served');
      const pdb = await call('get_resource', { resourceType: 'poddisruptionbudgets', namespace: 'trading', name: 'orders-api' });
      assert(pdb.isError && pdb.text === 'k8s API error (404): Not Found', `absent member: ${pdb.text}`);
      const cms = await call('list_resources', { resourceType: 'configmaps', namespace: 'trading' });
      assert(cms.isError && cms.text === 'k8s API error (403): Forbidden', `unknown membership: ${cms.text}`);
      const podGet = await call('get_resource', { resourceType: 'pods', namespace: 'trading', name: Object.keys(st.membership['pods/trading'].names)[0] });
      assert(podGet.isError && podGet.text === 'k8s API error (403): Forbidden', 'a member whose full object is not recorded is refused 403, never invented');
      const bad = await call('list_resources', { resourceType: 'secrets', namespace: 'trading' });
      assert(bad.isError && /is not in the read-only allowlist/.test(bad.text), 'the service\'s own allowlist text');
      const cmp = await call('compare_declared_fields', { manifest: 'kind: Service' });
      assert(cmp.isError && cmp.text === 'k8s API error (403): Forbidden', 'an agent call of the compare tool is refused (counted by NOTOOL)');
      await srv.executeToolOnServer('x', 'services', { action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: '{}' });
      await srv.executeToolOnServer('x', 'registry', { action: 'register', name: 'k8s-rig-readonly' });
      assert(fallbackCalls.join() === 'services,registry', `other calls must fall through: ${fallbackCalls.join()}`);
      assert(srv.log.filter((e: any) => /^cluster-/.test(e.tier)).length === 9 && srv.log.every((e: any) => e.tier !== 'unserved'), `tiers: ${srv.log.map((e: any) => e.tier).join()}`);
      for (const [sel, labels, want] of [['app=orders-api,tier!=frontend', { app: 'orders-api', tier: 'backend' }, true], ['tier in (backend,web)', { tier: 'backend' }, true], ['!tier', { tier: 'x' }, false]] as const)
        assert(k8.selectorMatches(sel, labels as any) === want, `selector ${sel}`);
    });

    await test('LCK9 (score-csk.ts) the L-CS-K scorer reads every in-code case as pre-registered, and each of its eight mutations goes RED (compare-blind, negation-loose, tool-blind, held-blind, halt-blind, noedit-blind, reason-blind, warn-blind); the Reviewer verdict and the git-file-only warning are the shipping parsers\' readings', async () => {
      const sk = await import('./leg-replay-lab/score-csk');
      const base = sk.cskSelfTest();
      assert(base.ok, `csk-self-test: ${base.failures.join(' | ')}`);
      for (const m of ['compare-blind', 'negation-loose', 'tool-blind', 'held-blind', 'halt-blind', 'noedit-blind', 'reason-blind', 'force-blind', 'live-side-blind'] as const) assert(!sk.cskSelfTest(m).ok, `mutation ${m} stayed green`);
      const rv = 'Review body.\nNON-BLOCKING WARNING (git-file-only): the package does not say it was checked against the Git file only.\n\n## VERDICT: APPROVED\n';
      assert(sk.readReviewer(sk.CSK_CELLS['R-CONSISTENT'], { approved: true, blocking: [] }, rv).warnGitOnly === true, 'the shipping warnings parser must read the git-file-only id');
      assert(sk.readReviewer(sk.CSK_CELLS['R-CONSISTENT'], { approved: true, blocking: [] }, rv, 'warn-blind').warnGitOnly === false, 'mutation warn-blind stayed green');
      const src = fs.readFileSync(path.join(LAB, 'score-csk.ts'), 'utf8');
      assert(/from '\.\.\/\.\.\/lib\/agents\/harness\/reviewer-warnings'/.test(src), 'the scorer must read warnings with the shipping parser');
    });

    // ───────────── L-CS-T: Config sources STEP 4 (Terraform), code push slice 4 — the lab half (2026-11-17) ─────────────
    // D-T1 (owner Tb = B2): terraform-iac has NO Git-vs-live method. Production (`runLegPlatformDrift`, platform-drift.ts) then makes no
    // call and writes no record, and `gitLiveDrift` reads `no-git-vs-live-method` (method null). The lab cannot load that module (it
    // loads the hub), so `labPlatformDriftCalls` takes the leg's protocol and decides with the SHIPPING `gitLiveDriftMethodOf`. These
    // tests run on the cached Terraform golden leg TF-PROG (Harvester read terraform/main.tf @ main + the rig's state tools); never fetch.
    const TF_PROG = 'cmvsze3ud00bfyxb377av3uny'; const TF_PROG_REVIEWER = 'cmvszht2500c2yxb3a82187r9';
    const T16 = { name: 'terraform-iac-protocol', version: '1.16.0' }; const T17 = { name: 'terraform-iac-protocol', version: '1.17.0' };
    const TF_GIT_LINE = 'main-tf: git-file — service github-service ; paichart/paichart-lab-configs/terraform/main.tf';
    const TF_LIVE_LINE = 'prod-state: live-read — service terraform-rig-readonly';
    const TF_BLOCK = block(TF_GIT_LINE, TF_LIVE_LINE);
    const tfWithBlock = (b: string | null) => { const c = JSON.parse(JSON.stringify(cached(TF_PROG))); if (b) c.leg.description = `${c.leg.description}${b}`; return c; };
    const tfPlanted = (b: string | null = TF_BLOCK) => cs.withFirstExecutionConfigSnapshot(tfWithBlock(b)).snap;
    const NO_METHOD = { version: 1, method: null, point: 'harvester', checked: false, reason: 'no-git-vs-live-method' };
    const { gitLiveDriftMethodOf } = await import('../lib/agents/harness/git-live-drift');

    await test('LCT1 (config-sources-arm.ts, Terraform) at the 1.17.0 text commit terraform-iac is a live Config-sources protocol, and the lab arm reads Config sources on a Terraform leg only at 1.17.0 (the shipping table + version test); the shipping method table gives terraform-iac NO Git-vs-live method at either spelling and Kubernetes its compare tool', async () => {
      // 1.17.0 TEXT COMMIT (cs-tf-text b36fc5812): terraform-iac has LEFT the awaiting list, so production and the lab arm agree by
      // construction (production derives the lane from the list, the lab from the table + the version test). Before it this read "awaits".
      assert(!CONFIG_SOURCE_AWAITING_TEXT.includes('terraform-iac-protocol') && configSourceLaneOf('terraform-iac') !== null, 'terraform-iac must be a live Config-sources protocol at the 1.17.0 text commit — re-read this block');
      assert(gitLiveDriftMethodOf('terraform-iac') === null && gitLiveDriftMethodOf('terraform-iac-protocol') === null && gitLiveDriftMethodOf('kubernetes-gitops') === 'k8s-declared-field-compare', 'GIT_LIVE_DRIFT_METHODS changed (D-T1)');
      assert(cs.noGitLiveMethod('terraform-iac-protocol') && !cs.noGitLiveMethod('kubernetes-gitops-protocol') && !cs.noGitLiveMethod(undefined) && !cs.noGitLiveMethod(''), 'noGitLiveMethod is not production\'s test (a non-empty protocol whose method is null)');
      const snap = tfPlanted();
      assert(arm.configLegOf(snap.leg)?.protocol === 'terraform-iac-protocol' && arm.configLegOf(snap.leg)?.contractKey === 'terraform-iac', `tf leg row: ${JSON.stringify(arm.configLegOf(snap.leg)).slice(0, 200)}`);
      assert(arm.armConfigSources(snap.leg, { delta: T16 }) === null && arm.armOwningLeg(snap.leg, { delta: T16 }) === null, 'a 1.16.0 Terraform arm must read no Config sources');
      const g = arm.armConfigSources(snap.leg, { delta: T17 });
      assert(g?.state === 'parsed' && (g as any).entries.map((x: any) => x.kind).join() === 'git-file,live-read', `1.17.0 arm: ${JSON.stringify(g).slice(0, 200)}`);
      assert((arm.armOwningLeg(snap.leg, { delta: T17 }) as any).configSourceProtocol === 'terraform-iac-protocol', 'owning leg protocol');
      const base = await cs.withComputedConfigFacts(snap, { protocol: T16, drift: null });
      assert(base.snap === snap && base.facts === null && base.report.state === 'not-stamped-version', `1.16.0 base arm: ${JSON.stringify(base.report)}`);
    });

    await test('LCT2 (L-CS-K-b on Terraform) a 1.17.0 Terraform arm NEVER makes a lab drift call or record: with http/https/net/child_process/fetch tripped, the Harvester is stamped liveEvidence + configSourceReads, NO platformDriftCalls, and gitLiveDrift = computeGitLiveDrift(undefined, terraform-iac) = not-checked no-git-vs-live-method (method null); the same inputs with the Kubernetes protocol (or none) DO reach the caller — the protocol alone decides; a platformDrift plant on a Terraform leg is refused by name', async () => {
      const tripped: string[] = []; const patches: Array<[any, string, any]> = [];
      const trip = (mod: any, key: string, name: string) => { patches.push([mod, key, mod[key]]); mod[key] = () => { tripped.push(name); throw new Error(`LCT2: ${name} was called`); }; };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const http = require('http'), https = require('https'), net = require('net'), cp = require('child_process');
      trip(http, 'request', 'http.request'); trip(https, 'request', 'https.request'); trip(net, 'connect', 'net.connect'); trip(net, 'createConnection', 'net.createConnection');
      for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) trip(cp, k, `child_process.${k}`);
      trip(globalThis as any, 'fetch', 'fetch');
      try {
        for (const [what, b, liveSummary] of [['git+live', TF_BLOCK, 'all-read'], ['git-only', block(TF_GIT_LINE), 'git-only']] as const) {
          const snap = tfPlanted(b);
          // drift: null — had the lab planned a call, the fixture caller would refuse "names no platformDrift plant … never stubbed".
          const r = await cs.withComputedConfigFacts(snap, { protocol: T17, drift: null });
          assert(r.report.state === 'computed' && r.calls === undefined && r.facts!.platformDriftCalls === undefined && r.report.platformDriftCalls === null, `${what}: a call record exists ${JSON.stringify(r.report.platformDriftCalls)}`);
          assert(JSON.stringify(r.facts!.gitLiveDrift) === JSON.stringify(NO_METHOD) && JSON.stringify(r.facts!.gitLiveDrift) === JSON.stringify(computeGitLiveDrift(undefined, 'terraform-iac-protocol')), `${what}: gitLiveDrift ${JSON.stringify(r.facts!.gitLiveDrift)}`);
          assert(r.report.gitLiveDrift!.reason === 'no-git-vs-live-method' && r.report.gitLiveDrift!.checked === false, `${what}: report ${JSON.stringify(r.report.gitLiveDrift)}`);
          const { result } = (() => { const h = hs.frozenHarvesterEntry(snap); return { result: JSON.parse(snap.childArtifacts.find((a: any) => a.executionId === h.executionId && a.name === 'result.json')!.content) }; })();
          const gov = governingConfigSources({ description: snap.leg!.description as string, contract: null, snapshot: (snap.leg!.metadata as any).configSourcesSnapshot }, 'terraform-iac-protocol');
          assert(JSON.stringify(r.facts!.liveEvidence) === JSON.stringify(computeConfigLiveEvidence(gov, result.toolCalls)) && r.facts!.liveEvidence!.summary === liveSummary, `${what}: liveEvidence ${JSON.stringify(r.facts!.liveEvidence).slice(0, 200)}`);
          assert(JSON.stringify(r.facts!.configSourceReads) === JSON.stringify(computeConfigSourceReads(gov, result.toolCalls)), `${what}: configSourceReads`);
          assert(r.report.configForce === null && r.report.held!.refs === 1 && r.store!.refs[0].path === '/terraform/main.tf', `${what}: held ${JSON.stringify([r.report.configForce, r.report.held])}`);
          const back = JSON.parse(r.snap.childArtifacts.find((a: any) => a.executionId === r.report.harvesterExecutionId && a.name === 'result.json')!.content);
          assert(!('platformDriftCalls' in back) && JSON.stringify(back.gitLiveDrift) === JSON.stringify(NO_METHOD), `${what}: the patched Harvester result.json carries a call record`);
        }
        // The protocol alone decides: the same parsed Terraform declaration, store and calls, with a plant.
        const snap = tfPlanted(); const gov = arm.armConfigSources(snap.leg, { delta: T17 })!;
        const h = hs.frozenHarvesterEntry(snap); const tc = JSON.parse(snap.childArtifacts.find((a: any) => a.executionId === h.executionId && a.name === 'result.json')!.content).toolCalls;
        const call = (protocol?: string | null) => cs.labPlatformDriftCalls({ sources: gov, store: hs.buildLabHeldStore(snap, gov), toolCalls: tc, spec: FIXTURE_PLANT, dir: null, ...(protocol !== undefined ? { protocol } : {}) });
        for (const p of ['terraform-iac-protocol', 'terraform-iac']) { const x = await call(p); assert(x.calls === undefined && x.log.length === 0, `${p}: the fixture caller ran (${x.log.length})`); }
        for (const p of [undefined, null, '', 'kubernetes-gitops-protocol']) { const x = await call(p as any); assert(x.calls?.length === 1 && x.log.length === 1, `${String(p)}: the caller did not run — the method decision leaked beyond the protocol`); }
        await throws(() => cs.withComputedConfigFacts(snap, { protocol: T17, drift: FIXTURE_PLANT }), /platformDrift refused — terraform-iac-protocol has no Git-vs-live method/, 'a drift plant on a Terraform leg');
      } finally { for (const [mod, key, orig] of patches) mod[key] = orig; }
      assert(tripped.length === 0, `a network or process call was attempted: ${tripped.join(', ')}`);
      // The decision is the shipping table's, never a lab copy.
      const src = fs.readFileSync(path.join(LAB, 'config-sources-patch.ts'), 'utf8');
      assert(/import \{[^}]*\bgitLiveDriftMethodOf\b[^}]*\} from '\.\.\/\.\.\/lib\/agents\/harness\/git-live-drift'/.test(src) && !/terraform-iac/.test(src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')), 'config-sources-patch.ts must decide with the SHIPPING gitLiveDriftMethodOf and name no protocol in code');
    });

    await test('LCT3 (carry + bytes, $0 dry run through lab.ts) a persisted TERRAFORM Reviewer cell (GOLD-TF-PROG): the 1.16.0 base arm is byte-identical to the frozen production rebuild and to a node with no lever; the 1.17.0 arm\'s Reviewer AND Author prompts are the base plus EXACTLY the shipping liveEvidence render (the Reviewer\'s also the Plan-witness platform line, planWitness lever), and NO drift line (the chainer carries gitLiveDrift only when checked; the lab copy is pinned to it); the manifest records no call; a drift plant on the Terraform node stops the dry run', async () => {
      const gsm = await import('./leg-replay-lab/golden-set');
      const root = path.join(out, 'lct3'); fs.mkdirSync(root, { recursive: true });
      fs.cpSync(path.join(gsm.GOLDEN_DIR, 'fixtures', 'model-lab'), path.join(root, 'model-lab'), { recursive: true });
      const comp = gsm.buildGoldenCompanion(path.join(root, 'model-lab'), gsm.loadGoldenSet()).dir;
      const ef = path.join(comp, 'experiment.json');
      const e = JSON.parse(fs.readFileSync(ef, 'utf8'));
      const g = e.nodes.find((n: any) => n.id === 'GOLD-TF-PROG');
      assert(g && g.authorExecutionId === TF_PROG && g.reviewerExecutionId === TF_PROG_REVIEWER && e.variants.gmxterraformr, 'the golden companion no longer carries GOLD-TF-PROG / gmxterraformr');
      const desc = cached(TF_PROG).leg!.description as string;
      fs.mkdirSync(path.join(comp, 'edits'), { recursive: true });
      fs.writeFileSync(path.join(comp, 'edits', 'tf-block.json'), JSON.stringify({ id: 'tf-block', appliesTo: ['leg:description'], ops: [{ type: 'replace', old: desc, new: `${desc}${TF_BLOCK}` }] }));
      e.label = 'lct3'; delete e.standingBench;
      e.variants = { b: { ...e.variants.gmxterraformr, comment: 'base: the golden pin (1.16.0)' }, c: { ...e.variants.gmxterraformr, composedVersion: '1.17.0', comment: 'the Config-sources version key (no text yet)' } };
      const levers = { inputEdits: 'edits/tf-block.json', configSourcesSnapshot: 'first-execution' };
      e.nodes = [{ ...g, id: 'T-BASE', variants: ['b'] }, { ...g, id: 'T-CS', variants: ['b', 'c'], ...levers }];
      fs.writeFileSync(ef, JSON.stringify(e));
      const dry = path.join(root, 'dry');
      const log = runLab(['run', '--experiment', comp, '--out', dry]);
      assert(/DRY RUN, \$0/.test(log) && /No model was called/.test(log), 'not a dry run');
      const rd = (n: string, v: string, f: string) => fs.readFileSync(path.join(dry, n, v, f), 'utf8');
      for (const f of ['reviewer.user.md', 'reviewer.system.md', 'author.user.md', 'author.system.md']) assert(rd('T-CS', 'b', f) === rd('T-BASE', 'b', f), `the levers moved the base arm's ${f}`);
      let fc = ''; try { fc = runLab(['frozen-cmp', '--experiment', comp, '--run', dry]); } catch (x: any) { fc = String(x.stdout ?? ''); }
      assert(/✅ T-BASE\/b: reviewer\.system\.md identical · reviewer\.user\.md identical/.test(fc) && /✅ T-CS\/b: reviewer\.system\.md identical · reviewer\.user\.md identical/.test(fc), `frozen-cmp base arms: ${fc}`);
      assert(/≠ +T-CS\/c: reviewer\.system\.md identical · reviewer\.user\.md differs/.test(fc), `frozen-cmp candidate arm: ${fc}`);
      let fa = ''; try { fa = runLab(['frozen-cmp', '--experiment', comp, '--run', dry, '--author']); } catch (x: any) { fa = String(x.stdout ?? ''); }
      assert(/✅ T-BASE\/b: author\.system\.md identical · author\.user\.md identical/.test(fa) && /✅ T-CS\/b: author\.system\.md identical · author\.user\.md identical/.test(fa), `frozen-cmp --author base arms: ${fa}`);
      // The forward pin, computed here with the shipping functions — never by the lever.
      const snap = tfPlanted(); const h = hs.frozenHarvesterEntry(snap);
      const tc = JSON.parse(snap.childArtifacts.find((a: any) => a.executionId === h.executionId && a.name === 'result.json')!.content).toolCalls;
      const gov = governingConfigSources({ description: snap.leg!.description as string, contract: null, snapshot: (snap.leg!.metadata as any).configSourcesSnapshot }, 'terraform-iac-protocol');
      const tr = (f: Record<string, unknown>) => ({ ...f, point: 'author-transcription', harvesterExecutionId: h.executionId });
      const liveLines = renderLiveEvidenceForPrompt(tr(computeConfigLiveEvidence(gov, tc)) as never)!;
      const driftLines = renderGitLiveDriftForPrompt(tr(computeGitLiveDrift(undefined, 'terraform-iac-protocol')) as never)!;
      assert(driftLines.length === 1 && /not-checked/.test(driftLines[0]) && !/compared by the read-only service/.test(driftLines[0]), `the no-method render: ${JSON.stringify(driftLines)}`);
      // PRODUCTION RENDERS NO DRIFT LINE on a Terraform leg: the chainer carries `gitLiveDrift` only when `checked === true`
      // (context-chainer.ts), and §6 renders only a carried fact — so the slice-3 one-line render reaches no prompt today. The lab's
      // carry (chain.ts, configEntryFieldsFor) copies that rule; this pin turns red if the shipping rule changes and the copy does not.
      const chainerSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agents', 'harness', 'context-chainer.ts'), 'utf8');
      const labChainSrc = fs.readFileSync(path.join(LAB, 'chain.ts'), 'utf8'); const patchSrc = fs.readFileSync(path.join(LAB, 'config-sources-patch.ts'), 'utf8');
      assert(/const gitLiveDrift = !isPipelinePredecessor && stampedDrift[^;]*\(stampedDrift as \{ checked\?: unknown \}\)\.checked === true/.test(chainerSrc)
        && /\(r\.gitLiveDrift as \{ checked\?: unknown \}\)\.checked === true\) entry\.gitLiveDrift/.test(labChainSrc) && /gl\.checked === true && GIT_DEVICE_COMPARISON_READERS\.has\(role\)/.test(patchSrc),
        'the chainer\'s gitLiveDrift carry rule (checked === true) changed, or the lab copies (chain.ts, configEntryFieldsFor) no longer match it — re-derive both and LCT3\'s expected lines');
      const splice = (base: string, cand: string, want: string[], what: string) => {
        const b = base.split('\n'); const c = cand.split('\n');
        let i = 0; while (i < b.length && b[i] === c[i]) i++;
        assert(c.length === b.length + want.length && JSON.stringify(c.slice(i, i + want.length)) === JSON.stringify(want) && JSON.stringify(c.slice(i + want.length)) === JSON.stringify(b.slice(i)),
          `${what}: the candidate prompt is not the base prompt plus exactly the ${want.length} rendered line(s) (first difference at line ${i + 1}: ${JSON.stringify(c[i]).slice(0, 160)})`);
      };
      // planWitness lever (2026-11-18): at 1.17.0 the leg Reviewer ALSO reads the platform's Plan-witness fact for the stored package — a
      // 1.16.0 package, so no stop sentence and no block; its one held edit is read (the key read reached the net). These are the shipping §6
      // lines (plan-witness.ts renderPlanWitnessForPrompt), pinned by literal. The Author reads none (PLAN_WITNESS_READERS).
      const witnessLines = [
        '- **Plan witness — platform check** (computed by the platform from the package text and its kept-file edits; no model checked it):',
        "  - Result: 2 fault(s) found — listed below; the edits' names were not compared (there is no block).",
        "  - Stop sentence: `absent` — the package does not contain the protocol's stop sentence.",
        '  - `Plan witness` block: absent.',
        '  - Edit block 1 (H1): read — `aws_s3_bucket.app_logs` edited; sets `policy`.',
        '  - Names compared with the block: not compared — there is no `Plan witness` block.',
        '  - The platform returns this package for revision on this ground, whatever the review concludes: `stop-sentence-absent`.',
      ];
      const inserted = (base: string, cand: string) => { const b = base.split('\n'); const c = cand.split('\n'); const ins: string[] = []; let j = 0;
        for (const l of c) { if (j < b.length && l === b[j]) j++; else ins.push(l); } assert(j === b.length, 'the candidate prompt dropped or changed a base line'); return ins; };
      const insR = inserted(rd('T-CS', 'b', 'reviewer.user.md'), rd('T-CS', 'c', 'reviewer.user.md'));
      assert(JSON.stringify([...insR].sort()) === JSON.stringify([...liveLines, ...witnessLines].sort()) && insR.join('\n').includes(witnessLines.join('\n')) && insR.join('\n').includes(liveLines.join('\n')),
        `Reviewer: the candidate prompt is not the base prompt plus exactly the liveEvidence render and the Plan-witness render: ${JSON.stringify(insR).slice(0, 900)}`);
      assert(!rd('T-CS', 'c', 'author.user.md').includes('Plan witness — platform check'), 'the Author prompt carries the Plan-witness fact (reader set is the leg Reviewer only)');
      splice(rd('T-CS', 'b', 'author.user.md'), rd('T-CS', 'c', 'author.user.md'), liveLines, 'Author');
      for (const f of ['reviewer.user.md', 'author.user.md']) assert(!rd('T-CS', 'c', f).includes('Git-vs-live drift fact'), `${f}: a gitLiveDrift line was rendered on a Terraform leg (production carries only a checked fact)`);
      assert(rd('T-CS', 'c', 'reviewer.system.md') === rd('T-CS', 'b', 'reviewer.system.md') && rd('T-CS', 'c', 'author.system.md') === rd('T-CS', 'b', 'author.system.md'), 'a system prompt moved');
      const m = JSON.parse(fs.readFileSync(path.join(dry, 'manifest.json'), 'utf8'));
      const hc = m.nodes['T-CS'].variants.c.held.configSources;
      assert(hc.state === 'computed' && hc.configForce === null && hc.held.refs === 1 && hc.platformDriftCalls === null && hc.gitLiveDrift.reason === 'no-git-vs-live-method' && m.nodes['T-CS'].variants.b.held.configSources === undefined, `manifest: ${JSON.stringify(hc).slice(0, 300)}`);
      // A drift plant on a Terraform node can never reach a prompt — refused before any build.
      e.nodes[1].platformDrift = FIXTURE_PLANT; fs.writeFileSync(ef, JSON.stringify(e));
      let refused = ''; try { runLab(['run', '--experiment', comp, '--out', path.join(root, 'dry-bad')]); } catch (x: any) { refused = String(x.stderr ?? '') + String(x.stdout ?? ''); }
      assert(/platformDrift refused — terraform-iac-protocol has no Git-vs-live method/.test(refused), `a Terraform drift plant was not refused: ${refused.slice(-300)}`);
    });

    // ───────────── L-CS-T pre-registration levers (2026-11-17): the refused-ref cell, the planted-Author stamp rule, the scorer, the builder ─────────────
    const CST = path.join(LAB, 'inputs', '2026-11-17-config-sources-tf-l-cs-t');
    await test('LCT4 (H-REFUSED, C3) the pinned Git service REFUSES an agent-named ref through the shipping policy (fixture tier l-t1-592f0c2: terraform/main.tf @ v1.0 ⇒ fixture-refused, thrown as the hub throws it) and serves the default branch (@ main ⇒ the file) — so a v1.0 read in the paid cell meets a production-shaped refusal, never the lab notice', async () => {
      const fxm = require('./leg-replay-lab/fixture-tools');
      const fx = fxm.loadFileFixture(path.join(LAB, 'fixtures', 'l-t1-592f0c2'));
      const srv = fxm.createFixtureToolServer(fx, null, { stub: true });
      const call = (ref: string) => ({ action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: { owner: 'paichart', repo: 'paichart-lab-configs', path: 'terraform/main.tf', ref } });
      let msg = ''; try { await srv.executeToolOnServer('s', 'services', call('v1.0')); } catch (e) { msg = (e as Error).message; }
      assert(/Service call blocked by compliance policy/.test(msg) && srv.fixtureLog.at(-1)?.tier === 'fixture-refused', `@ v1.0: ${msg} / ${JSON.stringify(srv.fixtureLog.at(-1))}`);
      const ok = await srv.executeToolOnServer('s', 'services', call('main'));
      const served = fs.readFileSync(path.join(LAB, 'fixtures', 'l-t1-592f0c2', 'files', 'terraform', 'main.tf'), 'utf8');
      assert(srv.fixtureLog.at(-1)?.tier === 'fixture-file' && (ok as any).content[0].data.result.content[1].resource.text === served, `@ main: ${JSON.stringify(srv.fixtureLog.at(-1))}`);
      const e = JSON.parse(fs.readFileSync(path.join(CST, 'experiment.json'), 'utf8'));
      const n = e.nodes.find((x: any) => x.id === 'H-REFUSED');
      assert(n.fileFixture === '../../fixtures/l-t1-592f0c2' && JSON.parse(fs.readFileSync(path.join(CST, n.inputEdits), 'utf8')).ops.some((o: any) => /terraform\/main\.tf @ v1\.0/.test(o.new)), 'H-REFUSED must declare @ v1.0 and read through the fixture tier');
    });

    await test('LCT5 (lab.ts, L-CS-T) a PLANTED persisted Author reads its stored editApplication only when the SHIPPING held-edit parse is unchanged (line numbers aside): the R-* plants (witness inserted, drift item re-cast) keep it; a plant that touches the H1 edit does not — the persistedEditApplication guard refuses it', async () => {
      const { heldEditsSemantics } = await import('./leg-replay-lab/lab');
      const { applyEdits: ae } = await import('./leg-replay-lab/edits');
      const snap = cached(TF_PROG);
      const stored = JSON.parse(snap.childArtifacts.find((a: any) => a.executionId === TF_PROG && a.name === 'result.json')!.content).finalResponse as string;
      const sem0 = heldEditsSemantics(stored);
      assert(JSON.parse(sem0).blocks.length === 1, 'the stored TF-PROG package carries one held edit');
      for (const id of ['R-WITNESS-OK', 'R-NO-WITNESS', 'R-STOP-ALTERED', 'R-INCOMPLETE', 'R-NODRIFT', 'R-GITONLY-WARN', 'R-GITONLY-STMT']) {
        const spec = JSON.parse(fs.readFileSync(path.join(CST, 'plants', `${id}.plant.json`), 'utf8'));
        let t = stored; for (const op of spec.ops) { assert(t.split(op.old).length === 2, `${id}: an op is not exactly-once`); t = t.replace(op.old, op.new); }
        assert(heldEditsSemantics(t) === sem0, `${id}: the plant moved the held edits (the stored stamp would describe another package)`);
      }
      const touched = stored.replace('Sid       = "AllowTelemetryExporterPutLogs"', 'Sid       = "AllowTelemetryExporterPut"');
      assert(touched !== stored && heldEditsSemantics(touched) !== sem0, 'a plant inside the H1 REPLACE must change the parse');
      void ae;
      const src = fs.readFileSync(path.join(LAB, 'lab.ts'), 'utf8');
      assert(/const peaPlantSafe = !plant\.editId \|\| heldEditsSemantics\(plant\.text\) === heldEditsSemantics\(String\(ares\.finalResponse \?\? ''\)\);/.test(src) && /peaWant && !!held && peaPlantSafe/.test(src), 'the guard must decide by the shipping parse');
    });

    await test('LCT6 (score-cst.ts) the L-CS-T scorer reads every in-code case as pre-registered and each of its ten mutations goes RED (warn-blind here: V1); on REAL bytes, both ways: the R-WITNESS-OK plant applied to the stored TF-PROG package meets every Author witness rule, R-STOP-ALTERED misses STOP, R-INCOMPLETE misses WITNESS, R-NO-WITNESS misses WITNESS, R-NODRIFT misses NOCOMPARE/POSITION; the stored 1.16.0 harvest is flagged NOCOMPARE', async () => {
      const sc = await import('./leg-replay-lab/score-cst');
      const base = sc.cstSelfTest(); assert(base.ok, `cst-self-test: ${base.failures.join(' | ')}`);
      for (const m of sc.CST_MUTATIONS) assert(!sc.cstSelfTest(m).ok, `mutation ${m} stayed green`);
      // The git-file-only warning, both ways, through the SHIPPING parser (needs a terminal verdict block — kept out of the lab's code, V1).
      const verdictBlock = '\n\n## VERDICT: APPROVED\nBlocking issues: none\nConfidence: 88\n';
      const warnText = 'Review body.\nNON-BLOCKING WARNING (git-file-only): the package does not say it was designed against the .tf files only.' + verdictBlock;
      const RW = sc.CST_CELLS['R-GITONLY-WARN']; const RO = sc.CST_CELLS['R-WITNESS-OK'];
      assert(sc.cstReviewerMeets(RW, sc.readCstReviewer(RW, { approved: true, blocking: [] }, warnText)).length === 0, 'R-GITONLY-WARN: approved with the warning meets');
      assert(sc.cstReviewerMeets(RW, sc.readCstReviewer(RW, { approved: true, blocking: [] }, 'Review body.' + verdictBlock)).some((x) => /no git-file-only/.test(x)), 'R-GITONLY-WARN: approved without the warning misses');
      assert(sc.cstReviewerMeets(RO, sc.readCstReviewer(RO, { approved: true, blocking: [] }, warnText)).some((x) => /where none is due/.test(x)), 'R-WITNESS-OK: a warning on a state run misses');
      assert(sc.cstReviewerMeets(RW, sc.readCstReviewer(RW, { approved: true, blocking: [] }, warnText, 'warn-blind')).length > 0, 'mutation warn-blind stayed green');
      assert(/from '\.\.\/\.\.\/lib\/agents\/harness\/reviewer-warnings'/.test(fs.readFileSync(path.join(LAB, 'score-cst.ts'), 'utf8')), 'the scorer must read warnings with the shipping parser');
      const snap = cached(TF_PROG);
      const stored = JSON.parse(snap.childArtifacts.find((a: any) => a.executionId === TF_PROG && a.name === 'result.json')!.content).finalResponse as string;
      const planted = (id: string) => { let t = stored; for (const op of JSON.parse(fs.readFileSync(path.join(CST, 'plants', `${id}.plant.json`), 'utf8')).ops) t = t.replace(op.old, op.new); return t; };
      const A = sc.CST_CELLS['A-STATEGIT'];
      assert(sc.cstAuthorMeets(A, sc.readCstAuthor(planted('R-WITNESS-OK'))).length === 0, `R-WITNESS-OK as an Author output: ${sc.cstAuthorMeets(A, sc.readCstAuthor(planted('R-WITNESS-OK'))).join(' | ')}`);
      assert(sc.cstAuthorMeets(A, sc.readCstAuthor(planted('R-STOP-ALTERED'))).some((x) => /^STOP/.test(x)), 'R-STOP-ALTERED must miss STOP');
      assert(sc.cstAuthorMeets(A, sc.readCstAuthor(planted('R-INCOMPLETE'))).some((x) => /^WITNESS/.test(x)), 'R-INCOMPLETE must miss WITNESS');
      assert(sc.cstAuthorMeets(A, sc.readCstAuthor(planted('R-NO-WITNESS'))).some((x) => /no Plan witness/.test(x)), 'R-NO-WITNESS must miss WITNESS');
      assert(sc.cstAuthorMeets(A, sc.readCstAuthor(planted('R-NODRIFT'))).some((x) => /NOCOMPARE|POSITION/.test(x)), 'R-NODRIFT must miss NOCOMPARE/POSITION');
      assert(sc.cstAuthorMeets(A, sc.readCstAuthor(stored)).some((x) => /no Plan witness/.test(x)), 'the stored 1.16.0 package has no Plan witness');
      const hs = cached('cmvsz9zut003kyxb44xwia8kv');
      const harvest = JSON.parse(hs.childArtifacts.find((a: any) => a.executionId === 'cmvsz9zut003kyxb44xwia8kv' && a.name === 'result.json')!.content).finalResponse as string;
      assert(sc.compareSentences(harvest).length >= 1, 'the stored 1.16.0 harvest (file-vs-state table) must read NOCOMPARE');
      assert(sc.STOP_SENTENCE.startsWith('If the team') && sc.STOP_SENTENCE.endsWith('merged change).') && fs.readFileSync(path.join(CST, 'candidate', 'terraform-iac-protocol@1.17.0.md'), 'utf8').includes(`word for word: *${sc.STOP_SENTENCE}*`), 'the scorer\'s stop sentence is the frozen text\'s, byte for byte');
      // ADDENDUM (d): a cap-cut sample is not a sample (never scored); runs pool (a later run completes the cell).
      const pr = path.join(out, 'lct6-pool');
      const put = (run: string, node: string, s: string, j: Record<string, unknown>, h = '') => { const d = path.join(pr, run, node, 'hc', s); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'sample.json'), JSON.stringify(j)); fs.writeFileSync(path.join(d, 'harvester.md'), h); fs.writeFileSync(path.join(d, 'toolCalls.json'), '[]'); };
      put('r1', 'H-DRIFT', 'sample-01', { error: 'LAB CAP: $1.156 spent + 3 x $0.135 reserve > --max-usd $1.55; no further model call is sent' });
      put('r2', 'H-DRIFT', 'sample-01', { verdict: null }, 'harvest');
      const pooled = sc.scoreCstRuns([path.join(pr, 'r1'), path.join(pr, 'r2')]);
      assert(pooled.capCut.length === 1 && pooled.rows.filter((r) => r.node === 'H-DRIFT').length === 1 && pooled.cells.find((c) => c.node === 'H-DRIFT')!.of === 1, `cap-cut skip + pooling: ${JSON.stringify({ capCut: pooled.capCut, of: pooled.cells.map((c) => [c.node, c.of]) })}`);
      // ADDENDUM (g): a provider-layer failure (the model call never returned) is INVALID — skipped and listed, valid n reported; any other
      // error is still a scored miss.
      put('r3', 'H-STATEGIT', 'sample-01', { error: 'LLM call failed at provider layer: Connection error. (code: unknown_error). See pino logs for full error details.' });
      put('r3', 'H-STATEGIT', 'sample-02', { error: 'fixture: the Harvester result could not be parsed' });
      const pe = sc.scoreCstRuns([path.join(pr, 'r3')]);
      const hsg = pe.cells.find((c) => c.node === 'H-STATEGIT')!;
      assert(pe.providerError.length === 1 && /sample-01/.test(pe.providerError[0]) && hsg.of === 1 && hsg.meets === 0, `provider-error skip (valid n 1, the other error a miss): ${JSON.stringify({ pe: pe.providerError, of: hsg.of, meets: hsg.meets })}`);
      assert(sc.isProviderError('TypeError: fetch failed') && !sc.isProviderError('no parseable verdict') && !sc.isProviderError('LAB CAP: $1 spent'), 'isProviderError must read transport failures only');
    });

    await test('LCT8 (NEVER-HELD-PATH, $0 platform level — not a model cell) a Terraform block naming a state, plan, variables or CLI-credentials path as a git-file line is unparseable `path-never-held` at resolution (the shipping parser behind the lab arm): the lab Harvester holds nothing and every fact and the force name the unparseable block — so the leg stops before any agent reads it', async () => {
      for (const bad of ['terraform/terraform.tfstate', 'terraform/prod.tfplan', 'terraform/prod.tfvars', 'terraform/.terraform/credentials.tfrc.json']) {
        const snap = tfPlanted(block(`state: git-file — service github-service ; paichart/paichart-lab-configs/${bad}`, TF_LIVE_LINE));
        const g = arm.armConfigSources(snap.leg, { delta: T17 }) as any;
        assert(g?.state === 'unparseable' && g.problem === 'path-never-held', `${bad}: ${JSON.stringify(g).slice(0, 200)}`);
        const r = await cs.withComputedConfigFacts(snap, { protocol: T17, drift: null });
        assert(r.report.declaration === 'unparseable' && r.report.held!.refs === 0 && r.calls === undefined && /unparseable/.test(String(r.report.configForce?.reason ?? '')), `${bad}: ${JSON.stringify(r.report).slice(0, 300)}`);
      }
      // A holdable look-alike stays holdable (the predicate is the shipping heldPathRefusal, never widened).
      const ok = arm.armConfigSources(tfPlanted(block('vars: git-file — service github-service ; paichart/paichart-lab-configs/terraform/variables.tf', TF_LIVE_LINE)).leg, { delta: T17 }) as any;
      assert(ok?.state === 'parsed', `variables.tf must stay holdable: ${JSON.stringify(ok).slice(0, 160)}`);
    });

    await test('LCT7 (build-inputs.py) the L-CS-T inputs are deterministic and proved: a re-run writes byte-identical files; apply(golden 1.16.0 pin, the 16 ops) == the frozen candidate (sha e601b4f4); every candidate arm materializes that sha', async () => {
      const files = ['edits/terraform-iac-1.17.0.json', 'stop-sentence.txt', ...fs.readdirSync(path.join(CST, 'node-inputs')).map((f) => `node-inputs/${f}`), ...fs.readdirSync(path.join(CST, 'plants')).map((f) => `plants/${f}`)];
      const before = files.map((f) => fs.readFileSync(path.join(CST, f), 'utf8'));
      execFileSync('python3', ['-I', path.join(CST, 'build-inputs.py')], { cwd: path.join(__dirname, '..') });
      files.forEach((f, i) => assert(fs.readFileSync(path.join(CST, f), 'utf8') === before[i], `${f} changed on a re-run (not deterministic)`));
      const { createHash: ch } = await import('crypto');
      const h = (t: string) => ch('sha256').update(t).digest('hex');
      let t = fs.readFileSync(path.join(LAB, 'golden', 'protocols', 'terraform-iac-protocol@1.16.0.md'), 'utf8');
      const ops = JSON.parse(fs.readFileSync(path.join(CST, 'edits', 'terraform-iac-1.17.0.json'), 'utf8')).ops;
      assert(ops.length === 16, `ops ${ops.length}`);
      for (const op of ops) { assert(t.split(op.old).length === 2, 'an op is not exactly-once'); t = t.replace(op.old, op.new); }
      assert(h(t) === 'ed8bdb991631143cccccc933fae34bda130f1b8ac4b73b24ce846dbe80e14fca', `apply(base, ops) sha ${h(t)}`); // re-freeze 4 (f3fe3c36b)
      for (const arm of ['hc', 'xc', 'ac', 'rc']) { const f = path.join(CST, 'protocols', `terraform-iac-protocol@1.16.0.${arm}.md`); if (fs.existsSync(f)) assert(h(fs.readFileSync(f, 'utf8')) === h(t), `${arm}: the materialized text is not the frozen candidate`); }
      const E3 = `${CST}-3leg`;
      assert(fs.readFileSync(path.join(E3, 'edits', 'terraform-iac-1.17.0.json'), 'utf8') === fs.readFileSync(path.join(CST, 'edits', 'terraform-iac-1.17.0.json'), 'utf8'), 'the three-leg experiment must carry the same 1.17.0 ops');
    });

    await test('LCT9 (ADDENDUM (a)+(b), owner D-1/D-2/D-4) on REAL bytes, both ways: the R-KEYS plant applied to the stored T-LQ package meets every A-DRIFT witness rule (KEY tags.owner, the stop sentence with "or map key", tier kept "cold"); R-WHOLE-MAP misses KEYS; the stored 1.15.0 package (tier written "warm", no witness) misses EDIT and WITNESS; both plants change the held edit (so the cells re-stamp, never reuse the stored stamp); the stored T-LQ harvest reads NOCOMPARE; the three-leg fixture serves exactly the probed blobs (git hash-object = the pipeline-harness production identity probe; the capture of all three is shown by the -3leg dry run under the production pin)', async () => {
      const sc = await import('./leg-replay-lab/score-cst');
      const { heldEditsSemantics } = await import('./leg-replay-lab/lab');
      const TA = 'cmvinl5nn00jpyxwkapntn5dz'; const TH = 'cmvinisua00hbyxwk1mertk4u';
      const res = (id: string, ex: string) => JSON.parse(cached(id).childArtifacts.find((a: any) => a.executionId === ex && a.name === 'result.json')!.content);
      const stored = res(TA, TA).finalResponse as string;
      const planted = (id: string) => { let t = stored; for (const op of JSON.parse(fs.readFileSync(path.join(CST, 'plants', `${id}.plant.json`), 'utf8')).ops) { assert(t.split(op.old).length === 2, `${id}: an op is not exactly-once`); t = t.replace(op.old, op.new); } return t; };
      const AD = sc.CST_CELLS['A-DRIFT'];
      const keys = sc.cstAuthorMeets(AD, sc.readCstAuthor(planted('R-KEYS'), undefined, AD.witness));
      assert(keys.length === 0, `R-KEYS as an Author output: ${keys.join(' | ')}`);
      assert(sc.cstAuthorMeets(AD, sc.readCstAuthor(planted('R-WHOLE-MAP'), undefined, AD.witness)).some((x) => /^KEYS/.test(x)), 'R-WHOLE-MAP must miss KEYS');
      const st = sc.cstAuthorMeets(AD, sc.readCstAuthor(stored, undefined, AD.witness));
      assert(st.some((x) => /^EDIT/.test(x)) && st.some((x) => /no Plan witness/.test(x)), `the stored 1.15.0 package: ${st.join(' | ')}`);
      assert(heldEditsSemantics(planted('R-KEYS')) !== heldEditsSemantics(stored) && heldEditsSemantics(planted('R-WHOLE-MAP')) === heldEditsSemantics(planted('R-KEYS')), 'the T-LQ plants change the held edit identically (tier kept "cold") — restampPersisted, never the stored stamp');
      const e = JSON.parse(fs.readFileSync(path.join(CST, 'experiment.json'), 'utf8'));
      assert(['R-KEYS', 'R-WHOLE-MAP'].every((id) => e.nodes.find((n: any) => n.id === id)?.restampPersisted === true), 'the T-LQ Reviewer cells must re-stamp');
      assert(sc.compareSentences(res(TH, TH).finalResponse).length >= 1, 'the stored T-LQ harvest (file-vs-state table) must read NOCOMPARE');
      const FX3 = path.join(LAB, 'fixtures', 'cs-t-0b76f4c');
      const blobs: Record<string, string> = { 'main.tf': '9064c9e34f3b45f17c873379a4cf8a799adc3852', 'archive.tf': 'efc667c2587d07e9552ea7917950021da6c92379', 'fixtures.tf': 'a7219bea1b4253bf6f15fc2e228e3e9998af5417' };
      for (const [f, b] of Object.entries(blobs)) assert(execFileSync('git', ['hash-object', path.join(FX3, 'files', 'terraform', f)]).toString().trim() === b, `${f}: the fixture blob is not the probed one`);
      assert(JSON.parse(fs.readFileSync(path.join(FX3, 'fixture.json'), 'utf8')).commit === '0b76f4c908bd604e6b98719f94f39c139e48f1c8', 'fixture commit');
    });

    await test('LCT10 (plan-witness-lever.ts, ADDENDUM (i)) the planWitness FACT LEVER: the key read is version-keyed exactly as the core keys it ({} below terraform-iac 1.17.0); the carry reaches the leg Reviewer only; the force composes the SHIPPING heldEditVerdict + planWitnessForceReason under the carrier\'s precedence (the copied line is pinned in the shipping source); and on REAL bytes ($0 dry run through lab.ts) every L-CS-T Reviewer prompt carries ONE `Plan witness — platform check` line with the state its plant implies, the 1.16.0 base arm none', async () => {
      const lv = await import('./leg-replay-lab/plan-witness-lever');
      const inj = (name: string, version: string) => ({ delta: { name, version } });
      assert(Object.keys(lv.planWitnessHeldInput(inj('terraform-iac-protocol', '1.16.0'), null, [])).length === 0, 'below 1.17.0 the lever hands the nets nothing');
      assert(Object.keys(lv.planWitnessHeldInput(inj('kubernetes-gitops-protocol', '1.19.0'), null, [])).length === 0, 'another protocol: nothing');
      assert(Object.keys(lv.planWitnessHeldInput(undefined, null, [])).length === 0, 'no injection: nothing');
      const k = lv.planWitnessHeldInput(inj('terraform-iac-protocol', '1.17.0'), null, []);
      assert('planWitnessKeys' in k && k.planWitnessKeys === null, 'at 1.17.0 with no application the key read is null (the fact reads no-key-read), as the core hands it');
      const fact = (stop: string, o: Record<string, unknown> = {}) => ({ version: 1, checked: true, stopSentence: stop, ...o });
      assert(lv.planWitnessForEntry(fact('verbatim'), 'change_reviewer') !== null && lv.planWitnessForEntry(fact('verbatim'), 'config_change_author') === null
        && lv.planWitnessForEntry(fact('verbatim'), 'infrastructure_architect') === null && lv.planWitnessForEntry(null, 'change_reviewer') === null, 'the carry reaches the leg Reviewer only, and only an object stamp');
      assert(lv.planWitnessForEntry({ version: 1, checked: false, reason: 'enrichment-error' }, 'change_reviewer') !== null, 'a not-checked stamp is carried too (the Reviewer must see it)');
      const applied = { state: 'applied', applied: 1, total: 1, candidateDigest8: 'abcd1234' };
      const f1 = lv.planWitnessLegForce({ fact: fact('altered'), editApplication: applied, authorExecutionId: 'a1' });
      assert(f1.reason === 'stop-sentence-altered' && f1.byWitnessFact && f1.leverVersion === 2 && f1.inScope, `altered on an applied package: ${JSON.stringify(f1)}`);
      assert(lv.planWitnessLegForce({ fact: fact('absent'), editApplication: applied, authorExecutionId: 'a1' }).reason === 'stop-sentence-absent', 'absent forces');
      // §8b (second build): where EVERY edit was read, a missing name forces witness-incomplete and a whole-value key witness-whole-value (in that order);
      // under any other coverage, and for a missing RESOURCE or a re-spaced line, nothing forces.
      const lf = (o: Record<string, unknown>) => lv.planWitnessLegForce({ fact: fact('verbatim', o), editApplication: applied, authorExecutionId: 'a1' });
      assert(lf({ listsCover: 'all-edits', missing: ['x: policy'] }).reason === 'witness-incomplete' && lf({ listsCover: 'all-edits', missing: ['x: policy'] }).byWitnessFact, 'a missing name with every edit read forces witness-incomplete');
      assert(lf({ listsCover: 'all-edits', wholeValueKeys: ['x: tags.tier'] }).reason === 'witness-whole-value', 'a whole-value key with every edit read forces witness-whole-value');
      assert(lf({ listsCover: 'all-edits', missing: ['x: policy'], wholeValueKeys: ['x: tags.tier'] }).reason === 'witness-incomplete', 'both list faults: one reason, witness-incomplete');
      assert(lf({ listsCover: 'read-edits-only', missing: ['x: policy'], wholeValueKeys: ['x: tags.tier'] }).reason === null && lf({ missing: ['x: policy'] }).reason === null, 'a list never forces unless every edit was read');
      assert(lf({ listsCover: 'all-edits', missingResources: ['aws_s3_bucket.extra'], realigned: ['x: tags.team'] }).reason === null, 'a missing resource and a re-spaced line never force');
      assert(lv.planWitnessLegForce({ fact: fact('altered', { listsCover: 'all-edits', missing: ['x: policy'] }), editApplication: applied, authorExecutionId: 'a1' }).reason === 'stop-sentence-altered', 'the stop sentence goes first');
      assert(lv.planWitnessLegForce({ fact: fact('verbatim', { listsCover: 'all-edits', missing: ['x: policy'] }), editApplication: { state: 'refused', applied: 0, total: 1 }, authorExecutionId: 'a1' }).byWitnessFact === false, 'a list force never outranks the package\'s own reason');
      assert(JSON.stringify(lv.readSampleForce({ reason: 'witness-incomplete', byWitnessFact: true, leverVersion: 2 })) === JSON.stringify({ reason: 'witness-incomplete', byFact: true, v2: true })
        && JSON.stringify(lv.readSampleForce({ reason: 'stop-sentence-absent', byStopSentence: true })) === JSON.stringify({ reason: 'stop-sentence-absent', byFact: true, v2: false })
        && lv.readSampleForce(undefined).reason === null, 'readSampleForce reads both lever versions');
      assert(lv.planWitnessLegForce({ fact: { version: 1, checked: false, reason: 'enrichment-error' }, editApplication: applied, authorExecutionId: 'a1' }).reason === null, 'could-not-check never forces');
      const f2 = lv.planWitnessLegForce({ fact: fact('altered'), editApplication: { state: 'refused', applied: 0, total: 1 }, authorExecutionId: 'a1' });
      assert(f2.reason !== null && !f2.byWitnessFact && f2.witnessFactReason === 'stop-sentence-altered', `the package's own reason outranks the stop sentence: ${JSON.stringify(f2)}`);
      const f3 = lv.planWitnessLegForce({ fact: fact('altered'), editApplication: applied, authorExecutionId: 'a1', runLevelReason: 'git-file-not-held' });
      assert(f3.reason === 'git-file-not-held' && !f3.byWitnessFact, 'a run-level reason outranks the stop sentence');
      // The drift point, pinned: the one precedence line the lever copies, and the two hand-overs it mirrors, in the SHIPPING source.
      const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      assert(src('lib/agents/harness/held-edit-carrier.ts').includes('witnessReason && !readError && base.reason === null && base.inScope ? { ...base, reason: witnessReason } : base'), 'the carrier\'s stop-sentence precedence line moved — re-read plan-witness-lever.ts planWitnessLegForce');
      assert(src('lib/services/execution-core.ts').includes('heldStamps.planWitnessKeys = planWitnessKeysOrNull(pkg.application, step.files)'), 'the core\'s key-read hand-over moved — re-read planWitnessHeldInput');
      assert(src('lib/agents/harness/context-chainer.ts').includes('PLAN_WITNESS_READERS.has('), 'the chainer\'s carry rule moved — re-read planWitnessForEntry');
      // REAL bytes: the nine Reviewer cells, $0 dry run.
      const dry = path.join(out, 'lct10');
      const cellsR = ['R-WITNESS-OK', 'R-NO-WITNESS', 'R-STOP-ALTERED', 'R-INCOMPLETE', 'R-NODRIFT', 'R-GITONLY-WARN', 'R-GITONLY-STMT', 'R-KEYS', 'R-WHOLE-MAP'];
      const log = runLab(['run', '--experiment', CST, '--only', cellsR.join(','), '--out', dry]);
      assert(/DRY RUN, \$0/.test(log) && /No model was called/.test(log), 'not a dry run');
      const HEAD = '- **Plan witness — platform check**';
      const block = (node: string, arm: string) => { const ls = fs.readFileSync(path.join(dry, node, arm, 'reviewer.user.md'), 'utf8').split('\n'); const i = ls.findIndex((l) => l.startsWith(HEAD));
        const heads = ls.filter((l) => l.startsWith(HEAD)).length; if (i < 0) return { heads, body: '' }; let j = i + 1; while (j < ls.length && ls[j].startsWith('  - ')) j++; return { heads, body: ls.slice(i, j).join('\n') }; };
      assert(block('R-WITNESS-OK', 'rb').heads === 0, 'the 1.16.0 base arm must carry no Plan-witness line');
      // PLAN-WITNESS-BUILD.md §8b render: a Result line first, three counted lists, a closing line when the fault count is above 0.
      const NONE3 = ['Resources the block does not name (0): none.', 'Missing from the block (0): none.', 'Unchanged keys the block gives a value for (0): none.'];
      const CLEAN = ['Result: no fault found; every edit was read.', 'Stop sentence: `verbatim`', '`Plan witness` block: present.', ...NONE3];
      const RETURNS = 'The platform returns this package for revision on this ground, whatever the review concludes: ';
      const expect: Record<string, string[]> = {
        'R-STOP-ALTERED': ['Result: 1 fault(s) found — listed below; every edit was read.', 'Stop sentence: `altered`', '`Plan witness` block: present.', ...NONE3, RETURNS + '`stop-sentence-altered`.'],
        'R-NO-WITNESS': ["Result: 2 fault(s) found — listed below; the edits' names were not compared (there is no block).", 'Stop sentence: `absent`', '`Plan witness` block: absent.', 'not compared — there is no `Plan witness` block', RETURNS + '`stop-sentence-absent`.'],
        'R-INCOMPLETE': ['Result: 1 fault(s) found — listed below; every edit was read.', 'Stop sentence: `verbatim`', 'Missing from the block (1): `aws_s3_bucket.app_logs: policy` — the edits set or remove each of these and the block does not contain it.',
          'Resources the block does not name (0): none.', 'Unchanged keys the block gives a value for (0): none.', RETURNS + '`witness-incomplete`.'],
        'R-WHOLE-MAP': ['Result: 2 fault(s) found — listed below; every edit was read.', 'Stop sentence: `verbatim`',
          'Unchanged keys the block gives a value for (2): `aws_s3_bucket.archive: tags.team` (the edits leave its value unchanged — its line is only re-spaced; the block states a value for it), `aws_s3_bucket.archive: tags.tier` (the edits leave its value unchanged — its line is only re-spaced; the block states a value for it).',
          'Missing from the block (0): none.', 're-spaced lines, which change no value: `tags.team`, `tags.tier`', RETURNS + '`witness-whole-value`.'],
        'R-KEYS': [...CLEAN, 'sets `tags.owner`; re-spaced lines, which change no value: `tags.team`, `tags.tier`'],
        'R-WITNESS-OK': [...CLEAN, 'sets `policy`'],
        'R-NODRIFT': CLEAN, 'R-GITONLY-WARN': CLEAN, 'R-GITONLY-STMT': CLEAN,
      };
      const NO_RETURN = new Set(['R-KEYS', 'R-WITNESS-OK', 'R-NODRIFT', 'R-GITONLY-WARN', 'R-GITONLY-STMT']);
      for (const [node, want] of Object.entries(expect)) {
        const b = block(node, 'rc');
        assert(b.heads === 1, `${node}: ${b.heads} Plan-witness line(s) in the Reviewer prompt`);
        for (const w of want) assert(b.body.includes(w), `${node}: the platform line does not carry [${w}] — ${b.body.slice(0, 400)}`);
        assert(!/NOT read|not read|no-key-read/.test(b.body), `${node}: the key read did not reach the net (the fact reads no-key-read)`);
        assert(!/Coverage:|does not contain:|spacing-only/.test(b.body), `${node}: a string of the FIRST render (removed in §8b) is still in the prompt`);
        if (NO_RETURN.has(node)) assert(!/The platform (?:returns|does not return) this package/.test(b.body), `${node}: a no-fault package must carry no closing return line`);
      }
    });
  }

  fs.rmSync(out, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
