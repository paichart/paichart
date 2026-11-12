#!/usr/bin/env ts-node
/**
 * NO-REGRESSION GOLDEN SET — offline ($0) tests (Protocol 16 § The standing no-regression rule; register NO-REGRESSION-GOLDEN-SET).
 * Out of CI like the lab suite (it needs the lab snapshot cache, which holds production data and is never committed): a missing
 * snapshot FAILS by name, never skips.
 *
 *   npm run test:golden-set
 *
 * GS1  the frozen set loads: pins unedited, both directions per shipped domain, a forced case, Author forms legal
 * GS2  every case recomputes its STORED outcome from the stored verdict + carrier stamp (golden-self-test)
 * GS3  the companion builder: reach (a one-domain text arm reaches only that domain), model arms reach all, deterministic
 * GS4  the pre-registration check and the lab-text pin check refuse what they must
 * GS5  the scorer, both directions (mutation-pinned): every flip class, the asymmetric masked rule, targets, unscored
 * GS6  END TO END, $0: the full companion under `--fake-llm persisted` reproduces all 31 stored outcomes (v7: + both requirements legs) (v3: incl. both value legs); one tampered sample ⇒ DO-NOT-SHIP;
 *       v6: the persisted Reviewer cells equal the frozen production rebuild (frozen-cmp) but for two named differences
 * GS7  `run --spend` on an agent-text/model lab with no goldenSet declaration is refused before any call
 */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://leg-replay-lab:never@127.0.0.1:1/never_connects';
if (!process.env.PAICHART_SKIP_DB_CONNECT) process.env.PAICHART_SKIP_DB_CONNECT = 'true';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  loadGoldenSet, caseRoles, REQUIREMENTS_PROTOCOL, buildGoldenCompanion, validateGoldenDeclaration, goldenStoredSelfTest, scoreGolden, classifyCell, goldenVerdict, refusalPointsAtLiveOnly,
  readGoldenSample, labNeedsGolden, GOLDEN_DIR, type GoldenCase, type GoldenCellScore,
} from './leg-replay-lab/golden-set';
import { loadSnapshot } from './leg-replay-lab/snapshot';
import { parsedResult } from './leg-replay-lab/rebuild';

const REPO = path.resolve(__dirname, '..');
const FIX = path.join(GOLDEN_DIR, 'fixtures');
let pass = 0; let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); } catch (e) { fail++; console.log(`  ❌ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function scratchCopy(fixture: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-'));
  fs.cpSync(path.join(FIX, fixture), path.join(d, fixture), { recursive: true });
  return path.join(d, fixture);
}
const lab = (args: string[]) => execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'scripts/leg-replay-lab/lab.ts', ...args],
  { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ANTHROPIC_API_KEY: '' }, maxBuffer: 256 * 1024 * 1024 });
const stored = (c: GoldenCase) => { const sn = loadSnapshot(c.authorExecutionId); return { qualityGate: sn.leg?.metadata?.qualityGate ?? null, editApplication: parsedResult(sn.author)?.editApplication ?? null, authorText: (parsedResult(sn.author)?.finalResponse as string | undefined) ?? null }; };

(async () => {
  const gs = loadGoldenSet();
  const byId = (id: string) => gs.cases.find((c) => c.id === id)!;

  console.log('GS1 the frozen set');
  await t('loads, every pin unedited (sha256), v7 (+ the two requirements cases and their 3 pins): 19 cases, 6 protocols, 12 templates; the re-freeze record names every case', () => {
    assert(gs.version === 'v7' && gs.cases.length === 19, `${gs.version} cases ${gs.cases.length}`);
    assert(Object.keys(gs.pins.protocols).length === 6 && Object.keys(gs.pins.templates).length === 12, 'pins');
    const added = (gs.refreezes ?? []).flatMap((r) => r.added).sort().join();
    assert(added === gs.cases.map((c) => c.id).sort().join(), `refreezes added ≠ cases: ${added}`);
    assert(gs.refreezes!.at(-1)!.version === gs.version, 'the newest re-freeze names the current version');
  });
  await t('the value leg (v2): shape value, no held binding, persisted Author only; a held seed on a value protocol is refused', () => {
    const v = byId('NET-VALUE-C1');
    assert(v.shape === 'value' && gs.heldJoinSeedByProtocol[v.protocol] === null && v.authorForms.join() === 'persisted', 'value case shape');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-set-'));
    fs.cpSync(GOLDEN_DIR, d, { recursive: true });
    const j = JSON.parse(fs.readFileSync(path.join(d, 'golden-set.json'), 'utf8'));
    j.heldJoinSeedByProtocol['network-derivation-protocol'] = 'seed-network-provisioning-templates';
    fs.writeFileSync(path.join(d, 'golden-set.json'), JSON.stringify(j));
    let threw = false; try { loadGoldenSet(d); } catch (e) { threw = /value leg/.test((e as Error).message); }
    assert(threw, 'a value case on a held-bound protocol must be refused');
  });
  await t('the requirements legs (v7): shape requirements, requirements-authoring 1.10.1 with no held binding, persisted Author only, one approved + one correct refusal; the shape is refused on any other protocol, live form refused, a held seed refused', () => {
    const rq = gs.cases.filter((c) => c.shape === 'requirements');
    assert(rq.map((c) => c.id).sort().join() === 'REQ-LOGARCH-F1,REQ-OBS-SENDERS', rq.map((c) => c.id).join());
    assert(rq.every((c) => c.protocol === REQUIREMENTS_PROTOCOL && c.authorForms.join() === 'persisted' && gs.heldJoinSeedByProtocol[c.protocol] === null), 'requirements case shape');
    assert(gs.pins.protocols[REQUIREMENTS_PROTOCOL].version === '1.10.1' && gs.pins.protocols[REQUIREMENTS_PROTOCOL].sha256.startsWith('fd4b55a8'), 'requirements pin');
    assert(rq.map((c) => c.expected.legOutcome).sort().join() === 'approved,needs-revision', 'both directions');
    assert(caseRoles(rq[0]).author === 'requirements_author' && caseRoles(rq[0]).reviewer === 'requirements_reviewer', 'roles');
    const refused = (mut: (j: any) => void, re: RegExp) => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-set-')); fs.cpSync(GOLDEN_DIR, d, { recursive: true });
      const j = JSON.parse(fs.readFileSync(path.join(d, 'golden-set.json'), 'utf8')); mut(j); fs.writeFileSync(path.join(d, 'golden-set.json'), JSON.stringify(j));
      try { loadGoldenSet(d); return false; } catch (e) { return re.test((e as Error).message); }
    };
    const req = (j: any) => j.cases.find((c: any) => c.id === 'REQ-OBS-SENDERS');
    assert(refused((j) => { req(j).authorForms = ['persisted', 'live']; }, /persisted Author only/), 'live form refused');
    assert(refused((j) => { req(j).protocol = 'network-derivation-protocol'; }, /requirements case/), 'requirements shape on another protocol refused');
    assert(refused((j) => { j.heldJoinSeedByProtocol[REQUIREMENTS_PROTOCOL] = 'seed-network-provisioning-templates'; }, /requirements leg/), 'held seed refused');
    assert(refused((j) => { delete req(j).shape; }, /requirements case|requirements leg/), 'a requirements-protocol case without the shape refused');
  });
  await t('both directions in every domain the shared keys ship to (an approved leg AND a needs-revision leg)', () => {
    for (const d of ['network', 'k8s', 'terraform', 'observability']) {
      const cs = gs.cases.filter((c) => c.domain === d);
      assert(cs.some((c) => c.expected.legOutcome === 'approved'), `${d}: no approved case`);
      assert(cs.some((c) => c.expected.legOutcome === 'needs-revision'), `${d}: no needs-revision case`);
    }
  });
  await t('the forced class is present, incl. a pure override (agent approved, platform forced)', () => {
    assert(gs.cases.some((c) => c.class === 'forced' && c.expected.agentApproved && c.expected.platformReason), 'no pure forced case');
  });
  await t('a refusal of one Author\'s package is scored on the persisted Author only (loader refuses live)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-set-'));
    fs.cpSync(GOLDEN_DIR, d, { recursive: true });
    const j = JSON.parse(fs.readFileSync(path.join(d, 'golden-set.json'), 'utf8'));
    j.cases.find((c: any) => c.id === 'OBS-DEMO-REF').authorForms = ['persisted', 'live'];
    fs.writeFileSync(path.join(d, 'golden-set.json'), JSON.stringify(j));
    let threw = false; try { loadGoldenSet(d); } catch (e) { threw = /persisted Author only/.test((e as Error).message); }
    assert(threw, 'a live Author form on an Author-defect refusal must be refused');
  });
  await t('a hand-edited pin is refused (the set is frozen)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-set-'));
    fs.cpSync(GOLDEN_DIR, d, { recursive: true });
    fs.appendFileSync(path.join(d, gs.pins.templates[Object.keys(gs.pins.templates)[0]].file), '\nedited');
    let threw = false; try { loadGoldenSet(d); } catch (e) { threw = /was edited/.test((e as Error).message); }
    assert(threw, 'an edited pin must be refused');
  });

  console.log('GS2 stored outcomes recompute (needs the snapshot cache)');
  await t('all 19 cases: stored verdict + stored carrier stamp ⇒ the stored leg outcome = the expectation', () => {
    const rows = goldenStoredSelfTest((id) => loadSnapshot(id));
    const bad = rows.filter((r) => !r.ok);
    assert(!bad.length, bad.map((r) => `${r.case}: ${r.detail}`).join(' | '));
  });

  console.log('GS3 the companion builder');
  await t('a one-line observability text arm reaches only the observability cases (5 cells), the other 16 are UNREACHED', () => {
    const r = buildGoldenCompanion(scratchCopy('obs-text-lab'), gs).report;
    assert(r.cells.map((c) => `${c.case}:${c.form}`).sort().join(',') === 'OBS-C1:live,OBS-C1:persisted,OBS-DEMO-REF:persisted,OBS-PROG:live,OBS-PROG:persisted', r.cells.map((c) => c.cell).join(','));
    assert(r.unreached.length === 16, `unreached ${r.unreached.length}`);
    assert(r.targets.join() === 'OBS-DEMO-REF', 'target carried');
  });
  await t('a model arm reaches every case: 19 Reviewer cells + 12 Author cells (Author-defect refusals, the value legs, NET-C126 and the requirements legs stay persisted)', () => {
    const r = buildGoldenCompanion(scratchCopy('model-lab'), gs).report;
    assert(r.cells.filter((c) => c.form === 'persisted').length === 19 && r.cells.filter((c) => c.form === 'live').length === 12, `${r.cells.length}`);
    assert(!r.cells.some((c) => c.form === 'live' && ['K8S-AK5', 'OBS-DEMO-REF', 'NET-VALUE-C1', 'NET-VALUE-C126', 'NET-C126', 'REQ-OBS-SENDERS', 'REQ-LOGARCH-F1'].includes(c.case)), 'live cell on an Author-defect refusal, the value leg or a requirements leg');
    assert(['REQ-OBS-SENDERS', 'REQ-LOGARCH-F1'].every((id) => r.cells.some((c) => c.case === id && c.form === 'persisted' && c.reach.join() === 'reviewer-model')), 'the requirements Reviewer cells (Reviewer model lever; the Author model lever never reaches a requirements_author)');
    assert(r.cells.some((c) => c.case === 'NET-VALUE-C1' && c.form === 'persisted' && c.reach.join() === 'reviewer-model'), 'the value leg Reviewer cell (shared infra tier)');
  });
  await t('an Author-only model arm (infraAuthor tier) never reaches the value leg: UNREACHED, named by tier', () => {
    const dir = scratchCopy('model-lab');
    const e = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    delete e.variants.mx.reviewerModel; delete e.variants.mx.reviewerEffort;
    fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(e));
    const r = buildGoldenCompanion(dir, gs).report;
    assert(!r.cells.some((c) => c.case === 'NET-VALUE-C1'), 'value leg reached by an Author model lever');
    assert(r.unreached.some((u) => u.case === 'NET-VALUE-C1' && /config_change_author tier/.test(u.why)), JSON.stringify(r.unreached.filter((u) => u.case === 'NET-VALUE-C1')));
  });
  await t('deterministic: a rebuild writes a byte-identical experiment.json; every cell holds its domain\'s heldJoinSeed', () => {
    const dir = scratchCopy('model-lab');
    const a = fs.readFileSync(path.join(buildGoldenCompanion(dir, gs).dir, 'experiment.json'), 'utf8');
    const b = fs.readFileSync(path.join(buildGoldenCompanion(dir, gs).dir, 'experiment.json'), 'utf8');
    assert(a === b, 'rebuild differs');
    const e = JSON.parse(a);
    // B12: carried standing nodes (STAND-*) are not golden cases
    for (const n of e.nodes.filter((x: any) => !/^STAND-/.test(x.id))) { const c = byId(n.id.replace(/^GOLD-/, '')); for (const v of n.variants) assert((e.variants[v].heldJoinSeed ?? null) === gs.heldJoinSeedByProtocol[c.protocol], `${n.id}/${v}`); }
  });
  await t('the candidate text reaches the companion: the observability cell\'s materialized protocol = pin + the arm\'s edit', () => {
    const { dir, experiment } = buildGoldenCompanion(scratchCopy('obs-text-lab'), gs);
    const f = path.join(dir, experiment.baseline.protocols['observability-config-protocol'].file.replace(/\.baseline\.md$/, '.gprobeobservabilityr.md'));
    assert(fs.readFileSync(f, 'utf8').includes('(golden fixture probe: a one-line text arm)'), 'candidate text missing');
  });

  console.log('GS4 refusals');
  await t('labNeedsGolden: a lever arm ⇒ yes; a companion ⇒ never re-carried', () => {
    const e = JSON.parse(fs.readFileSync(path.join(FIX, 'model-lab', 'experiment.json'), 'utf8'));
    assert(labNeedsGolden(e), 'model lab');
    assert(!labNeedsGolden({ ...e, goldenCompanion: {} }), 'companion');
    assert(!labNeedsGolden({ ...e, variants: { base: { edits: [] } } }), 'base-only experiment');
  });
  await t('declaration: missing, wrong version, unknown case, reasonless opt-out — each refused', () => {
    const e = JSON.parse(fs.readFileSync(path.join(FIX, 'model-lab', 'experiment.json'), 'utf8'));
    assert(validateGoldenDeclaration({ ...e, goldenSet: undefined }, gs).length === 1, 'missing');
    assert(validateGoldenDeclaration({ ...e, goldenSet: { version: 'v0' } }, gs).some((m) => /v0/.test(m)), 'version');
    assert(validateGoldenDeclaration({ ...e, goldenSet: { version: gs.version, optOut: [{ case: 'NOPE', reason: 'a long enough reason' }] } }, gs).some((m) => /NOPE/.test(m)), 'unknown');
    assert(validateGoldenDeclaration({ ...e, goldenSet: { version: gs.version, optOut: [{ case: 'NET-JL1', reason: '' }] } }, gs).some((m) => /reason/.test(m)), 'reason');
    assert(validateGoldenDeclaration(e, gs).length === 0, 'the valid declaration');
  });
  await t('a lab that edits a protocol from a text other than the golden pin is refused (build on today\'s production text)', () => {
    const dir = scratchCopy('obs-text-lab');
    const e = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    e.baseline.protocols['observability-config-protocol'].version = '1.10.0';
    fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(e));
    let threw = false; try { buildGoldenCompanion(dir, gs); } catch (x) { threw = /today's production text/.test((x as Error).message); }
    assert(threw, 'must refuse');
  });
  await t('an opted-out case runs no cell', () => {
    const dir = scratchCopy('model-lab');
    const e = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    e.goldenSet.optOut = [{ case: 'TF-TL2', reason: 'fixture: shows an opt-out removes the case' }];
    fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(e));
    const r = buildGoldenCompanion(dir, gs).report;
    assert(!r.cells.some((c) => c.case === 'TF-TL2') && r.optedOut.join() === 'TF-TL2', 'opt-out');
  });

  console.log('GS5 the scorer, both directions');
  const cell = (c: GoldenCase, s: Array<Record<string, any>>, target = false): GoldenCellScore => {
    const reads = s.map((x, i) => readGoldenSample(c, true, { node: 'n', variant: 'v', i, ...x }, `s${i}`));
    return { case: c.id, cell: 'v', arm: 'a', form: 'persisted', expected: c.expected, samples: reads, target, ...classifyCell(c, reads) };
  };
  const applied = { state: 'applied', candidateDigest8: 'aaaaaaaa' };
  await t('approved case, Reviewer refuses ⇒ FLIPPED ⇒ DO-NOT-SHIP', () => {
    const x = cell(byId('NET-JL1'), [{ verdict: { approved: false }, editApplication: applied }]);
    assert(x.status === 'FLIPPED' && goldenVerdict([x]).verdict === 'DO-NOT-SHIP', x.status);
  });
  await t('approved case, Reviewer approves but the live Author\'s edits were refused ⇒ platform reason ⇒ FLIPPED', () => {
    const x = cell(byId('NET-JL1'), [{ verdict: { approved: true }, editApplication: { state: 'refused', candidateDigest8: 'aaaaaaaa' } }]);
    assert(x.status === 'FLIPPED' && x.samples[0].platformReason === 'refused', `${x.status} ${x.samples[0].platformReason}`);
  });
  await t('an out-of-scope package (no-edits) is never forced by scope ⇒ approved reproduces', () => {
    const x = cell(byId('K8S-BK3'), [{ verdict: { approved: true }, editApplication: { state: 'no-edits' } }]);
    assert(x.status === 'REPRODUCED', `${x.status} ${x.samples[0].platformReason}`);
  });
  await t('Author-defect refusal, Reviewer now approves ⇒ FLIPPED (needs-revision → approved) ⇒ DO-NOT-SHIP', () => {
    const x = cell(byId('OBS-DEMO-REF'), [{ verdict: { approved: true }, editApplication: applied }]);
    assert(x.status === 'FLIPPED' && /needs-revision → approved/.test(x.direction!) && goldenVerdict([x]).verdict === 'DO-NOT-SHIP', `${x.status}`);
  });
  await t('input-decided refusal, agent now approves ⇒ MASKED-TOWARD-APPROVAL ⇒ DO-NOT-SHIP (the agent defence was lost)', () => {
    const x = cell(byId('NET-JL3'), [{ verdict: { approved: true }, editApplication: applied }]);
    assert(x.status === 'MASKED-TOWARD-APPROVAL' && goldenVerdict([x]).verdict === 'DO-NOT-SHIP', x.status);
  });
  await t('pure forced case, agent now refuses ⇒ MASKED-TOWARD-REFUSAL ⇒ recorded, PASS (the safe direction)', () => {
    const x = cell(byId('TF-TL4'), [{ verdict: { approved: false }, editApplication: { state: 'unheld' } }]);
    assert(x.status === 'MASKED-TOWARD-REFUSAL' && goldenVerdict([x]).verdict === 'PASS', x.status);
  });
  await t('a flip on a case the pre-registration names as its TARGET is not a miss', () => {
    const x = cell(byId('OBS-DEMO-REF'), [{ verdict: { approved: true }, editApplication: applied }], true);
    assert(goldenVerdict([x]).verdict === 'PASS', goldenVerdict([x]).verdict);
  });
  await t('an error or an unparseable verdict ⇒ UNSCORED ⇒ INCOMPLETE (never a pass)', () => {
    const x = cell(byId('NET-JL1'), [{ error: 'boom' }]); const y = cell(byId('NET-JL1'), [{ verdict: null }]);
    assert(x.status === 'UNSCORED' && y.status === 'UNSCORED' && goldenVerdict([x, y]).verdict === 'INCOMPLETE', `${x.status} ${y.status}`);
  });

  await t('NEEDS-READ (owner 2026-11-08): a refusal pointing at a live-only line ⇒ true; at stored lines only ⇒ false; nothing quoted or no stored text ⇒ true (the hand read must); a NEEDS-READ cell is never a PASS, and a real flip beside it stays DO-NOT-SHIP', () => {
    const storedPkg = 'Edit 2: add `network 10.99.0.3/32` under `router bgp 65001` › `address-family ipv4`.\nV1: show ip bgp';
    const livePkg = 'Edit 2: add `network 10.99.0.3/32` under `router bgp 65001`.\nV1: show ip bgp';
    assert(refusalPointsAtLiveOnly(['enters `network 10.99.0.3/32` at the top level'], livePkg, storedPkg) === true, 'a live-only line');
    assert(refusalPointsAtLiveOnly(['enters `network 10.99.0.3/32` at the top level'], storedPkg, storedPkg) === false, 'MUTATION same package ⇒ FLIPPED');
    assert(refusalPointsAtLiveOnly(['no quoted span here'], livePkg, storedPkg) === true && refusalPointsAtLiveOnly(['`network 10.99.0.3/32`'], livePkg, null) === true, 'undecidable ⇒ hand read');
    const nr = { ...cell(byId('NET-JL1'), [{ verdict: { approved: false }, editApplication: applied }]), status: 'NEEDS-READ' as const, direction: 'x' };
    assert(goldenVerdict([nr]).verdict === 'NEEDS-READ', `NEEDS-READ alone: ${goldenVerdict([nr]).verdict}`);
    const flip = cell(byId('OBS-DEMO-REF'), [{ verdict: { approved: true }, editApplication: applied }]);
    assert(goldenVerdict([nr, flip]).verdict === 'DO-NOT-SHIP', 'a real flip beside a NEEDS-READ is still DO-NOT-SHIP');
  });

  console.log('GS6 end to end, $0 (--fake-llm persisted over the full companion)');
  await t('31 cells (19 cases, both Author forms, all four domains + both value legs + both requirements legs, held binding) reproduce every stored outcome; a tampered sample ⇒ DO-NOT-SHIP', () => {
    const dir = scratchCopy('model-lab');
    const comp = buildGoldenCompanion(dir, gs).dir;
    const runDir = path.join(path.dirname(dir), 'run-fake');
    lab(['run', '--experiment', comp, '--fake-llm', 'persisted', '--out', runDir, '--concurrency', '6']);
    const r = scoreGolden([runDir], comp, stored, gs);
    assert(r.cells.length === 31, `cells ${r.cells.length}`);
    assert(['REQ-OBS-SENDERS', 'REQ-LOGARCH-F1'].every((id) => r.cells.filter((c) => c.case === id).length === 1 && r.cells.filter((c) => c.case === id).every((c) => c.status === 'REPRODUCED')), 'requirements cells (v7)');
    assert(['NET-VALUE-C1', 'NET-VALUE-C126', 'NET-C126'].every((id) => r.cells.some((c) => c.case === id) && r.cells.filter((c) => c.case === id).every((c) => c.status === 'REPRODUCED')), 'value leg / 1.26.0 canary cells');
    assert(r.verdict.verdict === 'PASS', `${r.verdict.verdict}: ${r.verdict.reasons.join(' | ')}`);
    // GOLDEN-REVIEWER-BYTE-FIDELITY (b): a value cell's Reviewer sees the Derivation Architect's STORED containment stamp, as production's did.
    for (const id of ['NET-VALUE-C1', 'NET-VALUE-C126']) {
      const u = fs.readFileSync(path.join(runDir, `GOLD-${id}`, 'gmxnetvaluer', 'reviewer.user.md'), 'utf8');
      assert(u.includes('**Derivation containment (platform fact)**: benign — checked-clean'), `${id}: the stored derivation-containment line is missing from the Reviewer prompt`);
    }
    // GOLDEN-REVIEWER-BYTE-FIDELITY (a) (v6): every held case with a stored editApplication carries the per-case flag (K8S-AK5 and the
    // value legs do not), and frozen-cmp reads every persisted Reviewer cell byte-identical to the frozen production rebuild EXCEPT the
    // two named differences: the computed liveEvidence line on the four pre-1.26.0 network legs (production adds it from 1.26.0), and
    // K8S-AK5's system prompt (pre-join; the held-join seed's constraint row). Reverting the flag in golden-set.ts reads 13 differing.
    const ce = JSON.parse(fs.readFileSync(path.join(comp, 'experiment.json'), 'utf8'));
    const flagged = ce.nodes.filter((n: any) => n.persistedEditApplication).map((n: any) => n.id.replace(/^GOLD-/, '')).sort().join();
    assert(flagged === gs.cases.filter((c) => !['K8S-AK5', 'NET-VALUE-C1', 'NET-VALUE-C126', 'REQ-OBS-SENDERS', 'REQ-LOGARCH-F1'].includes(c.id)).map((c) => c.id).sort().join(), `flagged: ${flagged}`);
    let fc = '';
    try { fc = lab(['frozen-cmp', '--experiment', comp, '--run', runDir, '--dump']); } catch (x: any) { fc = String(x.stdout ?? ''); }
    const differ = [...fc.matchAll(/≠ +GOLD-([A-Z0-9-]+)\//g)].map((x) => x[1]).sort().join();
    assert(differ === 'K8S-AK5,NET-JL1,NET-JL3,NET-JL4,NET-JP1,REQ-LOGARCH-F1', `frozen-cmp differs on: ${differ}`);
    assert((fc.match(/✅/g) ?? []).length === 13, `frozen-cmp identical cells: ${(fc.match(/✅/g) ?? []).length}`);
    // v7 (§2.2a fidelity gate, owner-accepted exception): REQ-OBS-SENDERS is byte-identical; REQ-LOGARCH-F1 (authored under 1.8.0) differs
    // in the SYSTEM prompt only, on exactly two lines — today's requirements_reviewer guidance 8.1 and 8.4.
    assert(/✅ +GOLD-REQ-OBS-SENDERS\/\S+: reviewer\.system\.md identical · reviewer\.user\.md identical/.test(fc), 'REQ-OBS-SENDERS byte-identical');
    assert(/≠ +GOLD-REQ-LOGARCH-F1\/\S+: reviewer\.system\.md differs · reviewer\.user\.md identical/.test(fc), 'REQ-LOGARCH-F1 differs in the system prompt only');
    const rqd = path.join(runDir, 'GOLD-REQ-LOGARCH-F1', fs.readdirSync(path.join(runDir, 'GOLD-REQ-LOGARCH-F1')).find((x) => /^g\w+requirementsr$/.test(x))!);
    const fl = fs.readFileSync(path.join(rqd, 'frozen.reviewer.system.md'), 'utf8').split('\n'); const cl = fs.readFileSync(path.join(rqd, 'reviewer.system.md'), 'utf8').split('\n');
    const dl = cl.map((l, i) => (l !== fl[i] ? l.trim().slice(0, 4) : null)).filter((x) => x !== null);
    assert(fl.length === cl.length && dl.join() === '8.1 ,8.4 ', `REQ-LOGARCH-F1 system lines differing: ${dl.join(' | ')} (lengths ${fl.length}/${cl.length})`);
    assert(/≠ +GOLD-K8S-AK5\/\S+: reviewer\.system\.md differs · reviewer\.user\.md identical/.test(fc), 'K8S-AK5 differs in the system prompt only');
    // Mutation: one approved case's Reviewer now refuses — the scorer must catch it.
    const f = path.join(runDir, 'GOLD-OBS-PROG', 'gmxobservabilityr', 'sample-01', 'sample.json');
    const s = JSON.parse(fs.readFileSync(f, 'utf8')); s.verdict.approved = false; fs.writeFileSync(f, JSON.stringify(s));
    const m = scoreGolden([runDir], comp, stored, gs);
    assert(m.verdict.verdict === 'DO-NOT-SHIP' && m.verdict.reasons.length === 1 && /OBS-PROG/.test(m.verdict.reasons[0]), m.verdict.reasons.join(' | '));
    // Mutation 2 (v2): the value leg's derivation_reviewer now refuses — caught too, by name.
    const fv = path.join(runDir, 'GOLD-NET-VALUE-C1', 'gmxnetvaluer', 'sample-01', 'sample.json');
    const sv = JSON.parse(fs.readFileSync(fv, 'utf8')); sv.verdict.approved = false; fs.writeFileSync(fv, JSON.stringify(sv));
    const m2 = scoreGolden([runDir], comp, stored, gs);
    assert(m2.verdict.reasons.length === 2 && m2.verdict.reasons.some((x) => /NET-VALUE-C1/.test(x)), m2.verdict.reasons.join(' | '));
    // NEEDS-READ end to end: a LIVE-arm refusal of an approve-expected case. Quoting a line the live package shares with the stored one ⇒
    // FLIPPED; after the live package's line is changed (the live Author wrote something else there) ⇒ NEEDS-READ.
    const liveCell = r.cells.find((x) => x.case === 'NET-JL1' && x.form === 'live')!;
    const ld = path.join(runDir, 'GOLD-NET-JL1', liveCell.cell, 'sample-01');
    const lsj = JSON.parse(fs.readFileSync(path.join(ld, 'sample.json'), 'utf8'));
    const pkg = fs.readFileSync(path.join(ld, 'author.md'), 'utf8');
    const line = pkg.split('\n').find((l) => /`[^`]{6,}`/.test(l))!;
    const span = line.match(/`([^`]{6,})`/)![1];
    lsj.verdict = { ...lsj.verdict, approved: false, blocking: [`the package's \`${span}\` is wrong here`] }; fs.writeFileSync(path.join(ld, 'sample.json'), JSON.stringify(lsj));
    const m3 = scoreGolden([runDir], comp, stored, gs).cells.find((x) => x.case === 'NET-JL1' && x.form === 'live')!;
    assert(m3.status === 'FLIPPED', `a refusal at a line the stored package has stays FLIPPED: ${m3.status}`);
    fs.writeFileSync(path.join(ld, 'author.md'), pkg.replace(line, `${line} (live Author's own wording)`));
    const m4 = scoreGolden([runDir], comp, stored, gs);
    const c4 = m4.cells.find((x) => x.case === 'NET-JL1' && x.form === 'live')!;
    assert(c4.status === 'NEEDS-READ' && m4.verdict.verdict === 'DO-NOT-SHIP' && m4.verdict.reasons.some((x) => /NET-JL1 .*NEEDS-READ/.test(x)), `${c4.status} ${m4.verdict.verdict}`);
  });

  await t('v6: a network text lab carries the unplanted STANDING network cases with persistedEditApplication (their stored Author has editApplication); the planted VLG-I3 never', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-'));
    const lab0 = path.join(d, 'netlab'); for (const x of ['edits', 'protocols']) fs.mkdirSync(path.join(lab0, x), { recursive: true });
    const pin = gs.pins.protocols['network-provisioning-protocol'];
    const text = fs.readFileSync(path.join(REPO, 'scripts/leg-replay-lab/golden', pin.file), 'utf8');
    fs.writeFileSync(path.join(lab0, 'protocols/np.baseline.md'), text);
    const anchor = text.split('\n').find((l) => l.length > 60 && text.split(l).length === 2)!;
    fs.writeFileSync(path.join(lab0, 'edits/identity.json'), JSON.stringify({ id: 'identity', appliesTo: ['network-provisioning-protocol'], ops: [{ type: 'replace', old: anchor, new: anchor }] }));
    fs.writeFileSync(path.join(lab0, 'experiment.json'), JSON.stringify({ label: 'golden-fixture-identity-net', purpose: 'test only, never spent', n: 1, flags: {},
      baseline: { protocols: { 'network-provisioning-protocol': { file: 'protocols/np.baseline.md', version: pin.version, sha256: pin.sha256 } } },
      variants: { base: { edits: [] }, nx: { edits: ['edits/identity.json'], authorSource: 'persisted' } }, nodes: [], measures: [], goldenSet: { version: gs.version } }));
    const e = buildGoldenCompanion(lab0, gs).experiment as any;
    const st = e.nodes.filter((n: any) => n.id.startsWith('STAND-'));
    assert(st.map((n: any) => n.id).sort().join() === 'STAND-NET-APPLY-WHOLE-FILE,STAND-NET-FWA3-EDGE' && st.every((n: any) => n.persistedEditApplication === true), JSON.stringify(st.map((n: any) => [n.id, n.persistedEditApplication])));
  });

  console.log('GS7 the spend gate');
  await t('run --spend on a lever lab with no goldenSet declaration is refused before any call (no key in the shell)', () => {
    const dir = scratchCopy('model-lab');
    const e = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    delete e.goldenSet; fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(e));
    let msg = '';
    try { lab(['run', '--experiment', dir, '--spend', '--max-usd', '1']); } catch (x: any) { msg = String(x.stderr ?? '') + String(x.stdout ?? ''); }
    assert(/GOLDEN SET: --spend refused/.test(msg), `not refused by the golden gate: ${msg.slice(0, 300)}`);
  });

  console.log(`\n${fail ? '❌' : '✅'} golden set: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
