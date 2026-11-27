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
  readGoldenSample, labNeedsGolden, GOLDEN_DIR, derivedCasePin, casePin, GOLDEN_DEFAULT_GIT_PIN, type GoldenCase, type GoldenCellScore,
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
/** v10: run the lab under a named Git pin (the companion of another pin runs in its own process). */
const labPin = (pin: string, args: string[]) => execFileSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'scripts/leg-replay-lab/lab.ts', ...args],
  { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ANTHROPIC_API_KEY: '', GIT_FILE_SOURCE_PIN: pin }, maxBuffer: 256 * 1024 * 1024 });
const PROD_PIN = 'paichart/paichart-configs';
type Built = ReturnType<typeof buildGoldenCompanion>;
/** Every cell of every companion of a build (one companion per Git pin). */
const famCells = (b: Built) => b.companions.flatMap((c) => c.report.cells);
/** `--fake-llm persisted` over every companion, each under its own pin; the run folders, in companion order (the default pin first). */
const runFamily = (b: Built, base: string, extra: string[] = []) => b.companions.map((c, i) => { const rd = `${base}-${i}`; labPin(c.pin, ['run', '--experiment', c.dir, '--fake-llm', 'persisted', '--out', rd, '--concurrency', '6', ...extra]); return rd; });
const stored = (c: GoldenCase) => { const sn = loadSnapshot(c.authorExecutionId); return { qualityGate: sn.leg?.metadata?.qualityGate ?? null, editApplication: parsedResult(sn.author)?.editApplication ?? null, authorText: (parsedResult(sn.author)?.finalResponse as string | undefined) ?? null }; };

(async () => {
  const gs = loadGoldenSet();
  const byId = (id: string) => gs.cases.find((c) => c.id === id)!;
  const GV = `golden-${gs.version}`; const GVP = `${GV}-pin-paichart-paichart-configs`; // the two companion folders of this version

  console.log('GS1 the frozen set');
  await t('loads, every pin unedited (sha256), v13 (v10: the terraform-iac 1.17.0 canary in, three pre-1.17.0 Terraform approve cases retired; v11: + the four-domain program\'s Terraform leg TF-R3; v12: kubernetes-gitops pinned at 1.19.0, K8S-R3 in, K8S-PROG and K8S-BK3 retired; v13: observability-config pinned at 1.12.0, no case moved): 17 cases, 6 protocols, 12 templates; the re-freeze record names every case and every retirement; terraform-iac is pinned at 1.17.0, kubernetes-gitops at 1.19.0, requirements-authoring still at its OLD version on purpose', () => {
    assert(gs.version === 'v13' && gs.cases.length === 17, `${gs.version} cases ${gs.cases.length}`);
    assert(gs.pins.protocols['terraform-iac-protocol'].version === '1.17.0' && gs.pins.protocols['terraform-iac-protocol'].sha256.startsWith('ed8bdb991631'), 'the terraform-iac pin is the live 1.17.0 text');
    assert(gs.pins.protocols['kubernetes-gitops-protocol'].version === '1.19.0' && gs.pins.protocols['kubernetes-gitops-protocol'].sha256.startsWith('5f51e83c1848'), 'the kubernetes-gitops pin is the live 1.19.0 text (v12)');
    assert(gs.pins.protocols['requirements-authoring-protocol'].version === '1.10.1', 'the requirements pin stays at 1.10.1 ON PURPOSE (the re-pin is NOT planned: owner 2026-11-19, GOLDEN-REQ-PIN-STALE) — re-pinning it is a new version and an owner decision');
    assert(Object.keys(gs.pins.protocols).length === 6 && Object.keys(gs.pins.templates).length === 12, 'pins');
    const retired = new Set((gs.refreezes ?? []).flatMap((r) => r.retired ?? []));
    assert([...retired].sort().join() === 'K8S-BK3,K8S-PROG,TF-C1,TF-PROG,TF-TL2' && gs.refreezes!.find((r) => r.version === 'v10')!.excluded.length === 3 && gs.refreezes!.every((r) => (r.retired ?? []).every((id) => r.excluded.some((x) => x.leg.startsWith(`${id} `)))), 'every retired case is explained in the excluded list of the re-freeze that retired it');
    const v11 = gs.refreezes!.find((r) => r.version === 'v11')!;
    assert(v11.version === 'v11' && v11.added.join() === 'TF-R3' && !(v11.retired ?? []).length && v11.excluded.length === 1 && /cmwmvr89l000eyxyka1mkw3a4/.test(v11.excluded[0].leg) && /near-duplicate of TF-C117/.test(v11.excluded[0].why) && /^none/.test(v11.pinsMoved[0]), 'v11: one case added, the git-live twin excluded as a near-duplicate with its reason, no pin moved');
    const added = (gs.refreezes ?? []).flatMap((r) => r.added).filter((id) => !retired.has(id)).sort().join();
    assert(added === gs.cases.map((c) => c.id).sort().join(), `refreezes added ≠ cases: ${added}`);
    assert(gs.refreezes!.at(-1)!.version === gs.version, 'the newest re-freeze names the current version');
    const v13 = gs.refreezes!.at(-1)!;
    assert(v13.version === 'v13' && !v13.added.length && !(v13.retired ?? []).length && !v13.excluded.length && /observability-config-protocol 1\.11\.0 → 1\.12\.0 \(4d62c5232e2f\)/.test(v13.pinsMoved[0]), 'v13: the observability re-pin only — no case added, retired or excluded');
    assert(gs.pins.protocols['observability-config-protocol'].version === '1.12.0' && gs.pins.protocols['observability-config-protocol'].sha256.startsWith('4d62c5232e2f'), 'the observability pin is the live 1.12.0 text (v13)');
    const v12 = gs.refreezes!.find((r) => r.version === 'v12')!; const why = (id: string) => v12.excluded.find((x) => x.leg.startsWith(`${id} `))?.why ?? '';
    assert(v12.added.join() === 'K8S-R3' && (v12.retired ?? []).join() === 'K8S-PROG,K8S-BK3' && v12.excluded.length === 3, 'v12: K8S-R3 in, two retired, the 2026-11-16 canary leg excluded');
    assert(/did NOT flip/.test(why('K8S-PROG')) && /WEAKER DUPLICATE, NOT AS A STALE CHAIN/.test(why('K8S-PROG')), 'K8S-PROG is recorded as retired as a weaker duplicate — it did not flip in L-CS-K');
    assert(/STALE-CHAIN EVIDENCE/.test(why('K8S-BK3')) && /change leg whose package carries no edit/.test(why('K8S-BK3')) && /no run is owed/.test(why('K8S-BK3')) && /VALUE LANE/.test(why('K8S-BK3')) && !/value-only/i.test(JSON.stringify(v12)), 'K8S-BK3: retired on the stale-chain evidence; its coverage returns with the Kubernetes value lane; no run is owed');
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
  await t('all 17 cases: stored verdict + stored carrier stamp ⇒ the stored leg outcome = the expectation', () => {
    const rows = goldenStoredSelfTest((id) => loadSnapshot(id));
    const bad = rows.filter((r) => !r.ok);
    assert(!bad.length, bad.map((r) => `${r.case}: ${r.detail}`).join(' | '));
  });

  console.log('GS3 the companion builder');
  await t('a one-line observability text arm reaches only the observability cases (5 cells, ONE companion — no case of another Git pin is reached), the other 14 are UNREACHED', () => {
    const b = buildGoldenCompanion(scratchCopy('obs-text-lab'), gs); const r = b.report;
    assert(b.companions.length === 1 && b.companions[0].pin === 'paichart/paichart-lab-configs' && path.basename(b.dir) === GV, `companions: ${b.companions.map((c) => path.basename(c.dir)).join()}`);
    assert(r.cells.map((c) => `${c.case}:${c.form}`).sort().join(',') === 'OBS-C1:live,OBS-C1:persisted,OBS-DEMO-REF:persisted,OBS-PROG:live,OBS-PROG:persisted', r.cells.map((c) => c.cell).join(','));
    assert(r.unreached.length === 14 && ['TF-C117', 'TF-R3', 'K8S-R3'].every((id) => r.unreached.some((u) => u.case === id)), `unreached ${r.unreached.length} (the production-pin case must still be reported UNREACHED)`);
    assert(r.targets.join() === 'OBS-DEMO-REF', 'target carried');
  });
  await t('a model arm reaches every case: 17 Reviewer cells + 10 Author cells (Author-defect refusals, the value legs, NET-C126 and the requirements legs stay persisted), in TWO companions — 21 cells under the lab pin, the 6 of K8S-R3, TF-C117 and TF-R3 under the production pin', () => {
    const b = buildGoldenCompanion(scratchCopy('model-lab'), gs); const r = { cells: famCells(b) };
    assert(r.cells.filter((c) => c.form === 'persisted').length === 17 && r.cells.filter((c) => c.form === 'live').length === 10, `${r.cells.length}`);
    assert(b.companions.map((c) => `${path.basename(c.dir)}=${c.pin}:${c.report.cells.length}`).join() === `${GV}=paichart/paichart-lab-configs:21,${GVP}=${PROD_PIN}:6`, b.companions.map((c) => `${path.basename(c.dir)}=${c.pin}:${c.report.cells.length}`).join());
    assert(b.companions[1].report.cells.every((c) => ['K8S-R3', 'TF-C117', 'TF-R3'].includes(c.case)) && b.companions.every((c) => c.experiment.requireGitFileSourcePin === c.pin && JSON.stringify(c.report.companions) === JSON.stringify(b.companions[0].report.companions) && c.report.companions!.length === 2), 'each companion requires its pin and lists the whole family');
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
    e.goldenSet.optOut = [{ case: 'TF-TL4', reason: 'fixture: shows an opt-out removes the case' }];
    fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(e));
    const bo = buildGoldenCompanion(dir, gs); const r = bo.report;
    assert(!famCells(bo).some((c) => c.case === 'TF-TL4') && r.optedOut.join() === 'TF-TL4', 'opt-out');
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
    // K8S-BK3 (the stored no-edits case) was retired at v12; the scoring rule is kept under test on a synthetic no-edits copy of K8S-R3.
    const x = cell({ ...byId('K8S-R3'), id: 'SYN-NO-EDITS' }, [{ verdict: { approved: true }, editApplication: { state: 'no-edits' } }]);
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
  await t('27 cells (17 cases, both Author forms, all four domains + both value legs + both requirements legs, held binding) in TWO companions (one per Git pin, each run in its own process under its own pin) reproduce every stored outcome; one companion\'s run alone reads INCOMPLETE, never PASS; frozen-cmp per cell incl. the Kubernetes §2.2a gate; the held-aware control line; a tampered sample ⇒ DO-NOT-SHIP', () => {
    const dir = scratchCopy('model-lab');
    const built = buildGoldenCompanion(dir, gs); const comp = built.dir;
    const runDirs = runFamily(built, path.join(path.dirname(dir), 'run-fake')); const runDir = runDirs[0]; // [0] = the default-pin companion's run
    const r = scoreGolden(runDirs, comp, stored, gs);
    assert(r.cells.length === 27 && runDirs.length === 2, `cells ${r.cells.length} in ${runDirs.length} run(s)`);
    assert(['REQ-OBS-SENDERS', 'REQ-LOGARCH-F1'].every((id) => r.cells.filter((c) => c.case === id).length === 1 && r.cells.filter((c) => c.case === id).every((c) => c.status === 'REPRODUCED')), 'requirements cells (v7)');
    assert(['NET-VALUE-C1', 'NET-VALUE-C126', 'NET-C126'].every((id) => r.cells.some((c) => c.case === id) && r.cells.filter((c) => c.case === id).every((c) => c.status === 'REPRODUCED')), 'value leg / 1.26.0 canary cells');
    assert(r.verdict.verdict === 'PASS', `${r.verdict.verdict}: ${r.verdict.reasons.join(' | ')}`);
    assert(scoreGolden(runDirs, built.companions[1].dir, stored, gs).verdict.verdict === 'PASS', 'golden-score reads the same family from either companion');
    // v10: a lab's golden set is EVERY companion. With one pin's run missing, that pin's cells are UNSCORED ⇒ INCOMPLETE — never PASS.
    const onlyDefault = scoreGolden([runDirs[0]], comp, stored, gs);
    assert(onlyDefault.verdict.verdict === 'INCOMPLETE' && onlyDefault.verdict.reasons.length === 6 && onlyDefault.verdict.reasons.every((x) => /^(TF-(C117|R3)|K8S-R3) /.test(x)), `the default-pin run alone: ${onlyDefault.verdict.verdict} ${onlyDefault.verdict.reasons.join(' | ')}`);
    const onlyProd = scoreGolden([runDirs[1]], built.companions[1].dir, stored, gs);
    assert(onlyProd.verdict.verdict === 'INCOMPLETE' && onlyProd.verdict.reasons.length === 21, `the production-pin run alone: ${onlyProd.verdict.verdict} (${onlyProd.verdict.reasons.length} unscored)`);
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
    const flagged = built.companions.flatMap((c) => c.experiment.nodes as any[]).filter((n: any) => n.persistedEditApplication).map((n: any) => n.id.replace(/^GOLD-/, '')).sort().join();
    assert(flagged === gs.cases.filter((c) => !['K8S-AK5', 'NET-VALUE-C1', 'NET-VALUE-C126', 'REQ-OBS-SENDERS', 'REQ-LOGARCH-F1'].includes(c.id)).map((c) => c.id).sort().join(), `flagged: ${flagged}`);
    let fc = '';
    built.companions.forEach((c, i) => { try { fc += labPin(c.pin, ['frozen-cmp', '--experiment', c.dir, '--run', runDirs[i], '--dump']); } catch (x: any) { fc += String(x.stdout ?? ''); } });
    const differ = [...fc.matchAll(/≠ +GOLD-([A-Z0-9-]+)\//g)].map((x) => x[1]).sort().join();
    // v10: + TF-TL4 — a pre-1.17.0 leg replayed at the 1.17.0 pin with its frozen declaration (the block, the live-evidence fact and the
    // Plan-witness platform line are new in its USER prompt; its system prompt is the pin). TF-C117, the first stored 1.17.0 leg, is
    // byte-identical on both Reviewer prompts AND both Author prompts: production stamped every fact the lab now reproduces.
    assert(differ === 'K8S-AK5,NET-JL1,NET-JL3,NET-JL4,NET-JP1,REQ-LOGARCH-F1,TF-TL4', `frozen-cmp differs on: ${differ}`);
    assert((fc.match(/✅/g) ?? []).length === 10, `frozen-cmp identical cells: ${(fc.match(/✅/g) ?? []).length}`);
    assert(/✅ +GOLD-TF-C117\/\S+: reviewer\.system\.md identical · reviewer\.user\.md identical/.test(fc), 'TF-C117 Reviewer prompts byte-identical to the frozen production rebuild');
    assert(/≠ +GOLD-TF-TL4\/\S+: reviewer\.system\.md identical · reviewer\.user\.md differs/.test(fc), 'TF-TL4 differs in the user prompt only');
    // v11: TF-R3 (state + Git, a consumed value chained from the value leg, a new resource) — byte-identical too, Reviewer and Author, so the
    // cross-leg value entry in the Author's frozen chained context is replayed exactly as production chained it.
    assert(/✅ +GOLD-TF-R3\/\S+: reviewer\.system\.md identical · reviewer\.user\.md identical/.test(fc), 'TF-R3 Reviewer prompts byte-identical to the frozen production rebuild');
    let fat = ''; try { fat = labPin(PROD_PIN, ['frozen-cmp', '--experiment', built.companions[1].dir, '--run', runDirs[1], '--author']); } catch (x: any) { fat = String(x.stdout ?? ''); }
    assert(/✅ +GOLD-TF-C117\/\S+: author\.system\.md identical · author\.user\.md identical/.test(fat), `TF-C117 Author prompts byte-identical: ${fat.slice(-300)}`);
    assert(/✅ +GOLD-TF-R3\/\S+: author\.system\.md identical · author\.user\.md identical/.test(fat), `TF-R3 Author prompts byte-identical: ${fat.slice(-300)}`);
    // v7 (§2.2a fidelity gate, owner-accepted exception): REQ-OBS-SENDERS is byte-identical; REQ-LOGARCH-F1 (authored under 1.8.0) differs
    // in the SYSTEM prompt only, on exactly two lines — today's requirements_reviewer guidance 8.1 and 8.4.
    assert(/✅ +GOLD-REQ-OBS-SENDERS\/\S+: reviewer\.system\.md identical · reviewer\.user\.md identical/.test(fc), 'REQ-OBS-SENDERS byte-identical');
    assert(/≠ +GOLD-REQ-LOGARCH-F1\/\S+: reviewer\.system\.md differs · reviewer\.user\.md identical/.test(fc), 'REQ-LOGARCH-F1 differs in the system prompt only');
    const rqd = path.join(runDir, 'GOLD-REQ-LOGARCH-F1', fs.readdirSync(path.join(runDir, 'GOLD-REQ-LOGARCH-F1')).find((x) => /^g\w+requirementsr$/.test(x))!);
    const fl = fs.readFileSync(path.join(rqd, 'frozen.reviewer.system.md'), 'utf8').split('\n'); const cl = fs.readFileSync(path.join(rqd, 'reviewer.system.md'), 'utf8').split('\n');
    const dl = cl.map((l, i) => (l !== fl[i] ? l.trim().slice(0, 4) : null)).filter((x) => x !== null);
    assert(fl.length === cl.length && dl.join() === '8.1 ,8.4 ', `REQ-LOGARCH-F1 system lines differing: ${dl.join(' | ')} (lengths ${fl.length}/${cl.length})`);
    // golden v12 (2026-11-19) — the KUBERNETES frozen-cmp gate at the 1.19.0 pin (Config sources STEP 2 §2.2a), named cell by cell.
    //   K8S-R3 (a stored 1.19.0 leg, production pin): BYTE-IDENTICAL on both Reviewer prompts and both Author prompts. Production stamped
    //     its Config-sources snapshot, its drift call record and its Git-vs-live drift fact; the lab reads them as stamped (`already-stamped`)
    //     and makes NO drift call of its own. So every fact production renders at 1.19.0 is reproduced — a fact the lab did not reproduce
    //     (or a lever that recomputed one) goes red here at $0.
    //   K8S-AK5 (pre-join, a 1.17-era Author-defect refusal, lab pin): the permanent exception — it differs in system AND user prompts on
    //     both roles (pre-join: no held-join constraint rows, no held view; and from the 1.19.0 pin it carries its frozen declaration and
    //     the planted drift answer of golden v8, which production never rendered for it).
    assert(/≠ +GOLD-K8S-AK5\/\S+: reviewer\.system\.md differs · reviewer\.user\.md differs/.test(fc), 'K8S-AK5 differs in both Reviewer prompts at the 1.19.0 pin');
    assert(/✅ +GOLD-K8S-R3\/\S+: reviewer\.system\.md identical · reviewer\.user\.md identical/.test(fc), '§2.2a: K8S-R3 Reviewer prompts are not byte-identical to the frozen production rebuild');
    const man = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8')); const manP = JSON.parse(fs.readFileSync(path.join(runDirs[1], 'manifest.json'), 'utf8'));
    const k8sNodes = built.companions.flatMap((c) => (c.experiment.nodes as any[]).filter((n: any) => /^GOLD-K8S-/.test(n.id)).map((n: any) => `${n.id}@${c.pin}`));
    assert(k8sNodes.sort().join() === `GOLD-K8S-AK5@paichart/paichart-lab-configs,GOLD-K8S-R3@${PROD_PIN}`, `§2.2a: the Kubernetes golden cells changed (${k8sNodes.join()}) — name each new cell's frozen-cmp result here`);
    for (const v of Object.keys(manP.nodes['GOLD-K8S-R3'].variants)) {
      const cs = manP.nodes['GOLD-K8S-R3'].variants[v].held?.configSources;
      assert(cs?.state === 'already-stamped' && cs.protocol?.version === '1.19.0' && cs.platformDriftCalls === undefined, `§2.2a: K8S-R3/${v} must read production's own stamps and make NO lab drift call: ${JSON.stringify(cs).slice(0, 300)}`);
    }
    const uR3 = fs.readFileSync(path.join(runDirs[1], 'GOLD-K8S-R3', 'gmxk8sr', 'reviewer.user.md'), 'utf8');
    assert(uR3.includes("- **Git vs live — the platform's Git-vs-live drift fact**") && /`sample-workloads`: `no-differences`|no-differences/.test(uR3) && /Live evidence — the platform's live-evidence fact\*\*: `all-read`/.test(uR3), '§2.2a: K8S-R3\'s Reviewer prompt carries the drift fact and the live-evidence fact production rendered');
    const csA = man.nodes['GOLD-K8S-AK5'].variants['gmxk8sr'].held?.configSources;
    assert(csA?.state === 'computed' && csA.platformDriftCalls?.fixtureCalls?.[0]?.plant === 'result:config-sources/K8S-AK5.compare-result.json' && csA.gitLiveDrift?.checked === true, `K8S-AK5 runs on its frozen declaration and the planted drift answer (a fixture caller, never a service): ${JSON.stringify(csA).slice(0, 300)}`);
    // The AUTHOR side of the same gate.
    let fa = '';
    try { fa = labPin(PROD_PIN, ['frozen-cmp', '--experiment', built.companions[1].dir, '--run', runDirs[1], '--author', '--only', 'GOLD-K8S-R3']); } catch (x: any) { fa = String(x.stdout ?? ''); }
    assert(/✅ +GOLD-K8S-R3\/\S+: author\.system\.md identical · author\.user\.md identical/.test(fa), `§2.2a: K8S-R3's Author prompt is not byte-identical to the frozen production rebuild: ${fa.slice(-300)}`);
    let faA = '';
    try { faA = lab(['frozen-cmp', '--experiment', comp, '--run', runDir, '--author', '--only', 'GOLD-K8S-AK5']); } catch (x: any) { faA = String(x.stdout ?? ''); }
    assert(/≠ +GOLD-K8S-AK5\/\S+: author\.system\.md differs · author\.user\.md differs/.test(faA), `§2.2a: K8S-AK5's Author lines: ${faA.slice(-300)}`);
    // No standing-bench case is a Kubernetes Reviewer cell today; one added later must be named in this gate.
    const sb = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, 'standing-bench.json'), 'utf8'));
    assert(sb.cases.every((c: any) => c.protocol !== 'kubernetes-gitops-protocol'), '§2.2a: a Kubernetes standing case exists — add its Reviewer cell to the frozen-cmp gate above');
    // CONTROL-HELD (plan §2.2a last paragraph, fixed in slice 4): the control pass hands the leaf nets the persisted held Author's own
    // editApplication and the frozen held handles, so `rollbackContainment` reproduces on every held cell (it read ✗ on all of them).
    const ctl = runDirs.flatMap((rd) => Object.entries(JSON.parse(fs.readFileSync(path.join(rd, 'manifest.json'), 'utf8')).nodes as Record<string, any>)).map(([id, n]) => [id, n.controls?.leafNetsReproducePersisted] as const).filter(([, c]) => c);
    assert(ctl.filter(([, c]) => c.heldAware).length === 12 && ctl.every(([, c]) => c.rollbackContainment === true && c.markerPresence === true), `control pass: ${ctl.filter(([, c]) => !(c.rollbackContainment && c.markerPresence)).map(([id]) => id).join() || `held-aware ${ctl.filter(([, c]) => c.heldAware).length}`}`);
    // Mutation: one approved case's Reviewer now refuses — the scorer must catch it.
    const f = path.join(runDir, 'GOLD-OBS-PROG', 'gmxobservabilityr', 'sample-01', 'sample.json');
    const s = JSON.parse(fs.readFileSync(f, 'utf8')); s.verdict.approved = false; fs.writeFileSync(f, JSON.stringify(s));
    const m = scoreGolden(runDirs, comp, stored, gs);
    assert(m.verdict.verdict === 'DO-NOT-SHIP' && m.verdict.reasons.length === 1 && /OBS-PROG/.test(m.verdict.reasons[0]), m.verdict.reasons.join(' | '));
    // Mutation 2 (v2): the value leg's derivation_reviewer now refuses — caught too, by name.
    const fv = path.join(runDir, 'GOLD-NET-VALUE-C1', 'gmxnetvaluer', 'sample-01', 'sample.json');
    const sv = JSON.parse(fs.readFileSync(fv, 'utf8')); sv.verdict.approved = false; fs.writeFileSync(fv, JSON.stringify(sv));
    const m2 = scoreGolden(runDirs, comp, stored, gs);
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
    const m3 = scoreGolden(runDirs, comp, stored, gs).cells.find((x) => x.case === 'NET-JL1' && x.form === 'live')!;
    assert(m3.status === 'FLIPPED', `a refusal at a line the stored package has stays FLIPPED: ${m3.status}`);
    fs.writeFileSync(path.join(ld, 'author.md'), pkg.replace(line, `${line} (live Author's own wording)`));
    const m4 = scoreGolden(runDirs, comp, stored, gs);
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

  console.log('GS8 the Kubernetes cases at the 1.19.0 pin (v8: frozen declarations; v12: kubernetes-gitops pinned at 1.19.0, K8S-R3 a stored 1.19.0 leg on the PRODUCTION Git pin)');
  await t('v12: the Kubernetes cases are K8S-R3 (a stored 1.19.0 leg: its own snapshot, drift call record and drift fact — no declaration, no drift plant; the production Git pin) and K8S-AK5 (the pre-join correct refusal, frozen declaration + drift answer, the lab pin); the validator still REQUIRES a drift plant on a Kubernetes declaration; a k8s text lab on the 1.19.0 pin writes TWO companions; under --fake-llm persisted each reproduces under its own pin and the pair scores PASS; composedVersion travels only onto cells of the edited protocol', () => {
    const k8s = gs.cases.filter((c) => c.protocol === 'kubernetes-gitops-protocol');
    assert(k8s.map((c) => c.id).sort().join() === 'K8S-AK5,K8S-R3', `Kubernetes cases: ${k8s.map((c) => c.id).join()}`);
    const r3 = byId('K8S-R3'); const ak5 = byId('K8S-AK5');
    assert(r3.gitFileSourcePin === PROD_PIN && !r3.configSources && r3.class === 'released-program' && r3.authorForms.join() === 'persisted,live' && JSON.stringify(r3.expected) === JSON.stringify({ legOutcome: 'approved', agentApproved: true, platformReason: null }), 'K8S-R3 as frozen');
    assert(!ak5.gitFileSourcePin && ak5.configSources?.fromVersion === '1.19.0' && ak5.configSources.block.length === 2 && ak5.configSources.platformDrift?.default?.caller === 'result' && ak5.authorForms.join() === 'persisted', 'K8S-AK5 as frozen (v8 declaration + drift answer)');
    assert(gs.cases.filter((c) => c.configSources).map((c) => c.id).sort().join() === 'K8S-AK5,TF-TL4', 'only the two pre-Config-sources cases still carry a frozen declaration');
    // The validator: a Kubernetes declaration without its drift answer is refused.
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-set-')); fs.cpSync(GOLDEN_DIR, bad, { recursive: true });
    const raw = JSON.parse(fs.readFileSync(path.join(bad, 'golden-set.json'), 'utf8')); delete raw.cases.find((c: any) => c.id === 'K8S-AK5').configSources.platformDrift;
    fs.writeFileSync(path.join(bad, 'golden-set.json'), JSON.stringify(raw));
    let refused = ''; try { loadGoldenSet(bad); } catch (x: any) { refused = String(x.message); }
    assert(/K8S-AK5 configSources\.platformDrift must be/.test(refused), `a Kubernetes case with no drift plant was not refused: ${refused.slice(0, 200)}`);
    // The pin itself composes 1.19.0 now: a model lab (no composedVersion of its own) carries K8S-AK5's declaration too.
    const ml = buildGoldenCompanion(scratchCopy('model-lab'), gs).companions[0].experiment as any;
    const mlAk5 = ml.nodes.find((n: any) => n.id === 'GOLD-K8S-AK5');
    assert(mlAk5.configSourcesSnapshot === 'first-execution' && mlAk5.platformDrift?.default?.caller === 'result', 'at the 1.19.0 pin a model-lever cell of K8S-AK5 carries its frozen declaration and drift answer');
    // composedVersion travels only onto cells of the EDITED protocol (golden-set.ts, L-CS-K): a text arm that also carries a model
    // lever reaches every domain, and a network cell stamped as composing network-provisioning "1.19.0" would lose its liveEvidence line.
    const mixed = scratchCopy('k8s-text-lab');
    const me = JSON.parse(fs.readFileSync(path.join(mixed, 'experiment.json'), 'utf8')); me.variants.kt.reviewerModel = 'claude-sonnet-5'; me.variants.kt.reviewerEffort = 'high';
    fs.writeFileSync(path.join(mixed, 'experiment.json'), JSON.stringify(me));
    const mx = buildGoldenCompanion(mixed, gs);
    const cellsOf = (re: RegExp) => mx.companions.flatMap((c) => Object.entries(c.experiment.variants).filter(([k]) => re.test(k)).map(([, v]) => v as any));
    assert(cellsOf(/k8s[ra]$/).length >= 3 && cellsOf(/k8s[ra]$/).every((v) => v.composedVersion === '1.19.0'), 'the Kubernetes cells must carry composedVersion');
    assert(cellsOf(/(network|netvalue|terraform|observability|requirements)[ra]$/).length >= 5 && cellsOf(/(network|netvalue|terraform|observability|requirements)[ra]$/).every((v) => v.composedVersion === undefined), 'composedVersion leaked onto a cell of a protocol the arm does not edit');
    // The k8s text lab: two companions.
    const dir = scratchCopy('k8s-text-lab');
    const built = buildGoldenCompanion(dir, gs);
    assert(built.companions.map((c) => `${path.basename(c.dir)}|${c.pin}|${c.report.cells.map((x) => `${x.case}:${x.form}`).sort().join('+')}`).join(' ; ')
      === `${GV}|paichart/paichart-lab-configs|K8S-AK5:persisted ; ${GVP}|${PROD_PIN}|K8S-R3:live+K8S-R3:persisted`, built.companions.map((c) => `${path.basename(c.dir)}|${c.pin}|${c.report.cells.length}`).join(' ; '));
    const nR3 = built.companions[1].experiment.nodes.find((n: any) => n.id === 'GOLD-K8S-R3'); const nAk5 = built.companions[0].experiment.nodes.find((n: any) => n.id === 'GOLD-K8S-AK5');
    assert(nR3.persistedEditApplication === true && !nR3.inputEdits && !nR3.configSourcesSnapshot && !nR3.platformDrift, 'K8S-R3 carries no planted declaration and no drift plant');
    assert(nAk5.configSourcesSnapshot === 'first-execution' && /^config-sources\/K8S-AK5\.block\.json$/.test(nAk5.inputEdits) && nAk5.platformDrift?.default?.caller === 'result', 'K8S-AK5 carries its frozen declaration and drift answer');
    const runDirs = runFamily(built, path.join(path.dirname(dir), 'run-k8s'));
    const m0 = JSON.parse(fs.readFileSync(path.join(runDirs[0], 'manifest.json'), 'utf8')); const m1 = JSON.parse(fs.readFileSync(path.join(runDirs[1], 'manifest.json'), 'utf8'));
    for (const v of nAk5.variants) { const cs = m0.nodes['GOLD-K8S-AK5'].variants[v].held?.configSources; assert(cs?.state === 'computed' && cs.declaration === 'parsed' && cs.configForce === null && cs.platformDriftCalls?.outcomes?.join() === 'sample-workloads:called', `K8S-AK5/${v}: ${JSON.stringify(cs).slice(0, 300)}`); }
    for (const v of nR3.variants) { const cs = m1.nodes['GOLD-K8S-R3'].variants[v].held?.configSources; assert(cs?.state === 'already-stamped' && cs.protocol?.version === '1.19.0' && cs.platformDriftCalls === undefined, `K8S-R3/${v}: production's own stamps must be read, with no lab drift call: ${JSON.stringify(cs).slice(0, 300)}`); }
    const pr = nR3.variants.find((v: string) => /r$/.test(v))!;
    const uR3 = fs.readFileSync(path.join(runDirs[1], 'GOLD-K8S-R3', pr, 'reviewer.user.md'), 'utf8');
    assert(uR3.includes("- **Git vs live — the platform's Git-vs-live drift fact**") && /Live evidence — the platform's live-evidence fact\*\*: `all-read`/.test(uR3), 'K8S-R3: the Reviewer prompt carries the stored drift fact and live-evidence fact');
    const aR3 = fs.readFileSync(path.join(runDirs[1], 'GOLD-K8S-R3', pr, 'author.user.md'), 'utf8');
    assert(aR3.includes('10.99.0.0/27') && /network-derivation/.test(aR3), 'K8S-R3: the Author prompt carries the consumed value in the frozen chained network-derivation entry');
    const r = scoreGolden(runDirs, built.dir, stored, gs);
    assert(r.cells.length === 3 && r.cells.every((c) => c.status === 'REPRODUCED') && r.verdict.verdict === 'PASS'
      && r.cells.filter((c) => c.case === 'K8S-R3').every((c) => c.samples.every((x) => x.agentApproved === true && x.platformReason === null && x.legOutcome === 'approved'))
      && r.cells.filter((c) => c.case === 'K8S-AK5').every((c) => c.samples.every((x) => x.agentApproved === false && x.legOutcome === 'needs-revision')),
      `${r.verdict.verdict}: ${r.cells.map((c) => `${c.case}/${c.cell} ${c.status}`).join(' | ')}`);
    // Mutation: the persisted K8S-R3 Reviewer now refuses ⇒ FLIPPED ⇒ DO-NOT-SHIP.
    const f = path.join(runDirs[1], 'GOLD-K8S-R3', pr, 'sample-01', 'sample.json'); const sj = JSON.parse(fs.readFileSync(f, 'utf8')); sj.verdict.approved = false; fs.writeFileSync(f, JSON.stringify(sj));
    const m = scoreGolden(runDirs, built.dir, stored, gs);
    assert(m.verdict.verdict === 'DO-NOT-SHIP' && m.verdict.reasons.length === 1 && /K8S-R3/.test(m.verdict.reasons[0]), m.verdict.reasons.join(' | '));
    // A planted declaration over the stored snapshot is refused (the snapshot is production's own).
    const dir2 = scratchCopy('k8s-text-lab'); const cp2 = buildGoldenCompanion(dir2, gs).companions[1];
    const desc = loadSnapshot(r3.authorExecutionId).leg!.description as string;
    fs.mkdirSync(path.join(cp2.dir, 'config-sources'), { recursive: true });
    fs.writeFileSync(path.join(cp2.dir, 'config-sources', 'second.block.json'), JSON.stringify({ id: 'gs8-second', appliesTo: ['leg:description'], ops: [{ type: 'replace', old: desc, new: `${desc}\n\n## Config sources\nx: git-file — service github-service ; paichart/paichart-configs/k8s/other.yaml\n` }] }));
    const ef2 = path.join(cp2.dir, 'experiment.json'); const e2 = JSON.parse(fs.readFileSync(ef2, 'utf8'));
    const n2 = e2.nodes.find((n: any) => n.id === 'GOLD-K8S-R3'); n2.inputEdits = 'config-sources/second.block.json'; n2.configSourcesSnapshot = 'first-execution'; n2.variants = [pr]; fs.writeFileSync(ef2, JSON.stringify(e2));
    let refused2 = ''; try { labPin(PROD_PIN, ['run', '--experiment', cp2.dir, '--fake-llm', 'persisted', '--out', path.join(path.dirname(dir2), 'run-second')]); } catch (x: any) { refused2 = String(x.stderr ?? '') + String(x.stdout ?? ''); }
    assert(/GOLD-K8S-R3: configSourcesSnapshot — already-snapshotted/.test(refused2), `a planted declaration over the stored snapshot was not refused: ${refused2.slice(-300)}`);
  });

  console.log('GS9 the Terraform cases at the 1.17.0 pin (v10: the canary TF-C117; v11: the program leg TF-R3; both on the PRODUCTION Git pin; one companion per pin)');
  await t('v10: the Terraform cases are TF-C117 (a stored 1.17.0 leg with its own Config-sources snapshot: no frozen declaration; declares the production Git pin) and TF-TL4 (the forced case, frozen declaration @ v1.0, no drift plant); a tf text lab on the 1.17.0 pin writes TWO companions; under --fake-llm persisted each reproduces under its own pin (TF-C117 approved, clean Plan-witness fact, no force; TF-TL4 forced git-file-not-held) and the pair scores PASS; the validator still forbids a drift plant on terraform-iac', () => {
    const tf = gs.cases.filter((c) => c.protocol === 'terraform-iac-protocol');
    assert(tf.map((c) => c.id).sort().join() === 'TF-C117,TF-R3,TF-TL4', `Terraform cases: ${tf.map((c) => c.id).join()}`);
    const c117 = byId('TF-C117'); const tl4 = byId('TF-TL4');
    assert(c117.gitFileSourcePin === PROD_PIN && !c117.configSources && c117.class === 'released-program' && c117.authorForms.join() === 'persisted,live' && JSON.stringify(c117.expected) === JSON.stringify({ legOutcome: 'approved', agentApproved: true, platformReason: null }), 'TF-C117 as frozen');
    assert(!tl4.gitFileSourcePin && tl4.configSources?.fromVersion === '1.17.0' && tl4.configSources.block[0].endsWith('terraform/main.tf @ v1.0') && tl4.configSources.platformDrift === undefined, 'TF-TL4 as frozen');
    // The validator: no drift plant on a protocol with no Git-vs-live method.
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-set-'));
    fs.cpSync(GOLDEN_DIR, bad, { recursive: true });
    const raw = JSON.parse(fs.readFileSync(path.join(bad, 'golden-set.json'), 'utf8'));
    raw.cases.find((c: any) => c.id === 'TF-TL4').configSources.platformDrift = { default: { caller: 'result', file: 'config-sources/K8S-PROG.drift.json' } };
    fs.writeFileSync(path.join(bad, 'golden-set.json'), JSON.stringify(raw));
    let refused = ''; try { loadGoldenSet(bad); } catch (x: any) { refused = String(x.message); }
    assert(/TF-TL4 configSources\.platformDrift is forbidden on terraform-iac-protocol/.test(refused), `a drift plant on a Terraform case was not refused: ${refused.slice(0, 200)}`);
    // The tf text lab: two companions, each requiring its pin.
    const dir = scratchCopy('tf-text-lab');
    const built = buildGoldenCompanion(dir, gs);
    assert(built.companions.map((c) => `${path.basename(c.dir)}|${c.pin}|${c.report.cells.map((x) => `${x.case}:${x.form}`).sort().join('+')}`).join(' ; ')
      === `${GV}|paichart/paichart-lab-configs|TF-TL4:live+TF-TL4:persisted ; ${GVP}|${PROD_PIN}|TF-C117:live+TF-C117:persisted+TF-R3:live+TF-R3:persisted`, built.companions.map((c) => `${path.basename(c.dir)}|${c.pin}|${c.report.cells.length}`).join(' ; '));
    const n117 = built.companions[1].experiment.nodes.find((n: any) => n.id === 'GOLD-TF-C117'); const nTl4 = built.companions[0].experiment.nodes.find((n: any) => n.id === 'GOLD-TF-TL4');
    assert(n117.persistedEditApplication === true && !n117.inputEdits && !n117.configSourcesSnapshot && !n117.platformDrift, 'TF-C117 carries no planted declaration (its stored leg has its own snapshot)');
    assert(nTl4.configSourcesSnapshot === 'first-execution' && /^config-sources\/TF-TL4\.block\.json$/.test(nTl4.inputEdits) && nTl4.platformDrift === undefined, 'TF-TL4 carries its frozen declaration and no drift plant');
    assert(built.companions.every((c) => Object.values(c.experiment.variants).every((v: any) => v.composedVersion === '1.17.0')), 'every cell composes 1.17.0');
    const runDirs = runFamily(built, path.join(path.dirname(dir), 'run-tf'));
    const m0 = JSON.parse(fs.readFileSync(path.join(runDirs[0], 'manifest.json'), 'utf8')); const m1 = JSON.parse(fs.readFileSync(path.join(runDirs[1], 'manifest.json'), 'utf8'));
    for (const v of nTl4.variants) { const cs = m0.nodes['GOLD-TF-TL4'].variants[v].held?.configSources; assert(cs?.state === 'computed' && cs.configForce?.reason === 'git-file-not-held' && cs.held?.refs === 0 && cs.platformDriftCalls === null, `TF-TL4/${v}: ${JSON.stringify(cs).slice(0, 300)}`); }
    for (const v of n117.variants) { const cs = m1.nodes['GOLD-TF-C117'].variants[v].held?.configSources; assert(cs?.state === 'already-stamped' && cs.protocol?.version === '1.17.0', `TF-C117/${v}: the stored snapshot must be read as production stamped it: ${JSON.stringify(cs).slice(0, 300)}`); }
    // The persisted TF-C117 cell: the key read comes from a pure re-application that REPRODUCES the stored stamp; the fact is clean; nothing forces.
    const pr = n117.variants.find((v: string) => /r$/.test(v))!;
    const kr = m1.nodes['GOLD-TF-C117'].variants[pr].authorSource?.planWitnessKeys;
    assert(kr?.source === 're-applied' && kr.reproducesStoredStamp === true && kr.stored.candidateDigest8 === 'd77a5338', `TF-C117 key read: ${JSON.stringify(kr)}`);
    const s117 = JSON.parse(fs.readFileSync(path.join(runDirs[1], 'GOLD-TF-C117', pr, 'sample-01', 'sample.json'), 'utf8'));
    assert(s117.planWitness?.stopSentence === 'verbatim' && s117.planWitness.witnessBlock === 'present' && s117.planWitness.listsCover === 'all-edits' && !s117.planWitness.missing.length && !s117.planWitness.wholeValueKeys.length && s117.planWitnessForce?.reason === null && s117.planWitnessForce.leverVersion === 2, `TF-C117 fact/force: ${JSON.stringify(s117.planWitnessForce)}`);
    const u117 = fs.readFileSync(path.join(runDirs[1], 'GOLD-TF-C117', pr, 'reviewer.user.md'), 'utf8');
    assert(u117.includes('  - Result: no fault found; every edit was read.') && u117.includes('sets `tags.owner`; re-spaced lines, which change no value: `tags.team`, `tags.tier`') && !u117.includes('The platform returns this package'), 'TF-C117: the Reviewer prompt carries the clean Plan-witness platform line');
    // v11 — TF-R3: state + Git (liveEvidence all-read from the stored Harvester stamp), a consumed value, a NEW resource block. Its stored
    // snapshot is read (no plant); the key read reproduces the stored stamp; the fact reads the edit as `create` (action only), clean.
    const r3 = byId('TF-R3'); const nR3 = built.companions[1].experiment.nodes.find((n: any) => n.id === 'GOLD-TF-R3');
    assert(r3.gitFileSourcePin === PROD_PIN && !r3.configSources && nR3.persistedEditApplication === true && !nR3.inputEdits && !nR3.configSourcesSnapshot, 'TF-R3 as frozen: production pin, no planted declaration');
    const kr3 = m1.nodes['GOLD-TF-R3'].variants[pr].authorSource?.planWitnessKeys;
    assert(kr3?.reproducesStoredStamp === true && kr3.stored.candidateDigest8 === 'ef633ba6', `TF-R3 key read: ${JSON.stringify(kr3)}`);
    const sR3 = JSON.parse(fs.readFileSync(path.join(runDirs[1], 'GOLD-TF-R3', pr, 'sample-01', 'sample.json'), 'utf8'));
    assert(sR3.planWitness?.stopSentence === 'verbatim' && sR3.planWitness.listsCover === 'all-edits' && sR3.planWitness.edits[0].resources[0].address === 'aws_s3_bucket_policy.app_logs' && sR3.planWitness.edits[0].resources[0].change === 'create'
      && !sR3.planWitness.missing.length && !sR3.planWitness.missingResources.length && !sR3.planWitness.wholeValueKeys.length && sR3.planWitnessForce?.reason === null, `TF-R3 fact/force: ${JSON.stringify(sR3.planWitness).slice(0, 300)}`);
    const uR3 = fs.readFileSync(path.join(runDirs[1], 'GOLD-TF-R3', pr, 'reviewer.user.md'), 'utf8');
    assert(uR3.includes('  - Result: no fault found; every edit was read.') && uR3.includes('`aws_s3_bucket_policy.app_logs` block added (action only)') && /Live evidence — the platform's live-evidence fact\*\*: `all-read`/.test(uR3), 'TF-R3: the Reviewer prompt carries the clean create line and the all-read live-evidence fact');
    const aR3 = fs.readFileSync(path.join(runDirs[1], 'GOLD-TF-R3', pr, 'author.user.md'), 'utf8');
    assert(aR3.includes('10.99.0.0/27') && /network-derivation/.test(aR3), 'TF-R3: the Author prompt carries the consumed value in the chained network-derivation entry (frozen, never re-run)');
    const r = scoreGolden(runDirs, built.dir, stored, gs);
    assert(r.cells.length === 6 && r.cells.every((c) => c.status === 'REPRODUCED') && r.verdict.verdict === 'PASS'
      && r.cells.filter((c) => c.case === 'TF-R3').length === 2 && r.cells.filter((c) => c.case !== 'TF-TL4').every((c) => c.samples.every((x) => x.agentApproved === true && x.platformReason === null && x.legOutcome === 'approved'))
      && r.cells.filter((c) => c.case === 'TF-TL4').every((c) => c.samples.every((x) => x.platformReason === 'git-file-not-held' && x.legOutcome === 'needs-revision')),
      `${r.verdict.verdict}: ${r.cells.map((c) => `${c.case}/${c.cell} ${c.status} ${c.samples.map((x) => x.platformReason).join()}`).join(' | ')}`);
    // The text arm reaches the cells: the materialized candidate is the pin plus the probe.
    const cand = fs.readFileSync(path.join(built.companions[1].dir, 'protocols', fs.readdirSync(path.join(built.companions[1].dir, 'protocols')).find((f) => /terraform-iac-protocol@1\.17\.0\.g\w+\.md$/.test(f))!), 'utf8');
    assert(cand.includes('(golden fixture probe: a one-line text arm)') && cand.length === fs.readFileSync(path.join(GOLDEN_DIR, gs.pins.protocols['terraform-iac-protocol'].file), 'utf8').length + ' (golden fixture probe: a one-line text arm)'.length, 'the candidate text = the 1.17.0 pin + the probe');
  });
  await t('v10, the other direction on TF-C117: a stop sentence ALTERED in the stored package is forced by the platform (stop-sentence-altered) ⇒ FLIPPED ⇒ DO-NOT-SHIP; a declaration planted over the leg\'s own stored snapshot is refused (already-snapshotted)', () => {
    const dir = scratchCopy('tf-text-lab');
    const built = buildGoldenCompanion(dir, gs); const cp = built.companions[1];
    const pkg = parsedResult(loadSnapshot(byId('TF-C117').authorExecutionId).author)!.finalResponse as string;
    const CLAUSE = ' — a revert included —';
    assert(pkg.split(CLAUSE).length === 2, 'the stored TF-C117 package must carry the stop sentence clause exactly once');
    const stopLine = pkg.split('\n').find((l) => l.includes(CLAUSE))!; // a whole-line plant (the plant-presence check reads lines)
    assert(pkg.split(stopLine).length === 2, 'the stop sentence line must be unique in the package');
    fs.mkdirSync(path.join(cp.dir, 'plants'), { recursive: true });
    fs.writeFileSync(path.join(cp.dir, 'plants', 'stop-altered.plant.json'), JSON.stringify({ id: 'gs9-stop-altered', appliesTo: [`author:${byId('TF-C117').authorExecutionId}`], ops: [{ type: 'replace', old: stopLine, new: stopLine.replace(CLAUSE, '') }] }));
    const ef = path.join(cp.dir, 'experiment.json'); const e = JSON.parse(fs.readFileSync(ef, 'utf8'));
    const node = e.nodes.find((n: any) => n.id === 'GOLD-TF-C117'); const pr = node.variants.find((v: string) => /r$/.test(v));
    node.authorPlant = 'plants/stop-altered.plant.json'; node.variants = [pr]; fs.writeFileSync(ef, JSON.stringify(e));
    const run1 = path.join(path.dirname(dir), 'run-altered');
    labPin(PROD_PIN, ['run', '--experiment', cp.dir, '--fake-llm', 'persisted', '--out', run1]);
    const sj = JSON.parse(fs.readFileSync(path.join(run1, 'GOLD-TF-C117', pr, 'sample-01', 'sample.json'), 'utf8'));
    assert(sj.planWitness?.stopSentence === 'altered' && sj.planWitnessForce?.reason === 'stop-sentence-altered' && sj.planWitnessForce.byWitnessFact === true, `the planted package's fact/force: ${JSON.stringify(sj.planWitnessForce)}`);
    assert(fs.readFileSync(path.join(run1, 'GOLD-TF-C117', pr, 'reviewer.user.md'), 'utf8').includes('The platform returns this package for revision on this ground, whatever the review concludes: `stop-sentence-altered`.'), 'the Reviewer prompt names the platform return');
    const r1 = scoreGolden([run1], cp.dir, stored, gs).cells.find((c) => c.case === 'TF-C117' && c.form === 'persisted')!;
    assert(r1.status === 'FLIPPED' && r1.samples[0].agentApproved === true && r1.samples[0].platformReason === 'stop-sentence-altered' && goldenVerdict([r1]).verdict === 'DO-NOT-SHIP', `${r1.status} ${r1.samples[0]?.platformReason}`);
    // The stored leg's OWN Config-sources snapshot cannot be replaced by a planted declaration: the lab refuses (the snapshot is taken
    // once, at the leg's first execution, in production too). So the "unread second git-file" direction is not plantable on TF-C117; the
    // Config force itself is pinned on TF-TL4 above (git-file-not-held) and on the Kubernetes cases in GS8.
    const dir2 = scratchCopy('tf-text-lab'); const cp2 = buildGoldenCompanion(dir2, gs).companions[1];
    const desc = loadSnapshot(byId('TF-C117').authorExecutionId).leg!.description as string;
    fs.mkdirSync(path.join(cp2.dir, 'config-sources'), { recursive: true });
    fs.writeFileSync(path.join(cp2.dir, 'config-sources', 'second.block.json'), JSON.stringify({ id: 'gs9-second-file', appliesTo: ['leg:description'], ops: [{ type: 'replace', old: desc, new: `${desc}\n\n## Config sources\nmain-tf: git-file — service github-service ; paichart/paichart-configs/terraform/main.tf\n` }] }));
    const ef2 = path.join(cp2.dir, 'experiment.json'); const e2 = JSON.parse(fs.readFileSync(ef2, 'utf8'));
    const n2 = e2.nodes.find((n: any) => n.id === 'GOLD-TF-C117'); n2.inputEdits = 'config-sources/second.block.json'; n2.configSourcesSnapshot = 'first-execution'; n2.variants = [pr]; fs.writeFileSync(ef2, JSON.stringify(e2));
    let refused2 = ''; try { labPin(PROD_PIN, ['run', '--experiment', cp2.dir, '--fake-llm', 'persisted', '--out', path.join(path.dirname(dir2), 'run-second')]); } catch (x: any) { refused2 = String(x.stderr ?? '') + String(x.stdout ?? ''); }
    assert(/GOLD-TF-C117: configSourcesSnapshot — already-snapshotted/.test(refused2), `a planted declaration over the stored snapshot was not refused: ${refused2.slice(-300)}`);
  });

  console.log('GS10 one companion per Git pin (golden v10): the pin check is intact, both ways');
  await t('a companion run under the WRONG pin is refused before any build (requireGitFileSourcePin); with that requirement stripped, the lab\'s own held store still ABORTS on the stored Harvester\'s read (pinViolations) — the pin check itself, not the declaration, is the guard', () => {
    const built = buildGoldenCompanion(scratchCopy('tf-text-lab'), gs); const cp = built.companions[1]; const cl = built.companions[0];
    const out = path.join(path.dirname(path.dirname(cp.dir)), 'run-wrong');
    let e1 = ''; try { labPin('paichart/paichart-lab-configs', ['run', '--experiment', cp.dir, '--fake-llm', 'persisted', '--out', out]); } catch (x: any) { e1 = String(x.stderr ?? '') + String(x.stdout ?? ''); }
    assert(/requires the Git file source pin paichart\/paichart-configs; this process runs paichart\/paichart-lab-configs/.test(e1), `the production-pin companion under the lab pin: ${e1.slice(-300)}`);
    let e2 = ''; try { labPin(PROD_PIN, ['run', '--experiment', cl.dir, '--fake-llm', 'persisted', '--out', out]); } catch (x: any) { e2 = String(x.stderr ?? '') + String(x.stdout ?? ''); }
    assert(/requires the Git file source pin paichart\/paichart-lab-configs; this process runs paichart\/paichart-configs/.test(e2), `the lab-pin companion under the production pin: ${e2.slice(-300)}`);
    const ef = path.join(cp.dir, 'experiment.json'); const e = JSON.parse(fs.readFileSync(ef, 'utf8')); delete e.requireGitFileSourcePin; fs.writeFileSync(ef, JSON.stringify(e));
    let e3 = ''; try { labPin('paichart/paichart-lab-configs', ['run', '--experiment', cp.dir, '--fake-llm', 'persisted', '--out', out]); } catch (x: any) { e3 = String(x.stderr ?? '') + String(x.stdout ?? ''); }
    assert(/prepareHeldCapture warned on cmwmsuhza004fyx8qqmvuo2st[^\n]*"pinViolations":1/.test(e3), `with the requirement stripped the held store must still abort on the pin violation: ${e3.slice(-400)}`);
  });
  await t('a missing companion is INCOMPLETE, never PASS: one pin\'s run alone ⇒ INCOMPLETE naming the other pin\'s cells; a sibling companion FOLDER deleted ⇒ golden-score refuses (rebuild); the CLI exits non-zero on INCOMPLETE', () => {
    const dir = scratchCopy('tf-text-lab'); const built = buildGoldenCompanion(dir, gs);
    const runDirs = runFamily(built, path.join(path.dirname(dir), 'run-miss'));
    for (const [i, missingCase, n] of [[0, 'TF-(C117|R3)', 4], [1, 'TF-TL4', 2]] as const) {
      const one = scoreGolden([runDirs[i]], built.companions[i].dir, stored, gs);
      assert(one.verdict.verdict === 'INCOMPLETE' && one.verdict.reasons.length === n && one.verdict.reasons.every((x) => new RegExp(`^${missingCase} `).test(x) && /UNSCORED \(no samples\)/.test(x)), `run ${i} alone: ${one.verdict.verdict} ${one.verdict.reasons.join(' | ')}`);
    }
    let cli = ''; let code = 0; try { cli = lab(['golden-score', '--run', runDirs[0], '--experiment', built.dir]); } catch (x: any) { cli = String(x.stdout ?? ''); code = x.status; }
    assert(code !== 0 && /Golden result: INCOMPLETE/.test(cli), `the CLI on one run: exit ${code}`);
    let cliBoth = ''; let codeBoth = -1; try { cliBoth = lab(['golden-score', '--run', runDirs.join(','), '--experiment', built.dir]); codeBoth = 0; } catch (x: any) { cliBoth = String(x.stdout ?? ''); codeBoth = x.status; }
    assert(codeBoth === 0 && /Golden result: PASS/.test(cliBoth), `the CLI on both runs: exit ${codeBoth}`);
    fs.rmSync(built.companions[1].dir, { recursive: true, force: true });
    let gone = ''; try { scoreGolden(runDirs, built.dir, stored, gs); } catch (x: any) { gone = String(x.message); }
    assert(new RegExp(`the companion .*${GVP} is missing — run golden-build again`).test(gone), `a deleted sibling companion: ${gone.slice(0, 200)}`);
  });
  await t('derive-and-compare: the pin a case declares must be the pin its stored Harvester\'s refs name — a wrong or missing declaration fails at golden-build (never at replay); every frozen case derives to its declared pin', () => {
    const derived = gs.cases.map((c) => [c.id, derivedCasePin(c).pin, casePin(c)] as const);
    assert(derived.every(([, d, p]) => d === null || d === p), `derived ≠ declared: ${derived.filter(([, d, p]) => d !== null && d !== p).map((x) => x.join(' ')).join(' | ')}`);
    assert(derivedCasePin(byId('TF-C117')).pin === PROD_PIN && derivedCasePin(byId('TF-C117')).evidence === 'held Git refs' && derivedCasePin(byId('TF-TL4')).pin === GOLDEN_DEFAULT_GIT_PIN && derivedCasePin(byId('TF-TL4')).evidence === 'Git reads (none held)'
      && derivedCasePin(byId('K8S-AK5')).pin === GOLDEN_DEFAULT_GIT_PIN && derivedCasePin(byId('K8S-R3')).pin === PROD_PIN && derivedCasePin(byId('NET-VALUE-C1')).pin === null, 'the derivations of five known cases');
    assert(derived.filter(([, d]) => d === PROD_PIN).map(([id]) => id).join() === 'K8S-R3,TF-C117,TF-R3', 'exactly the three post-2026-11-11 legs are on the production pin');
    // The declaration removed: TF-C117 falls to the default pin, its Harvester's refs name the production pin ⇒ refused at build.
    const noDecl = { ...gs, cases: gs.cases.map((c) => (c.id === 'TF-C117' ? (({ gitFileSourcePin: _p, ...rest }) => rest)(c) as GoldenCase : c)) };
    let r1 = ''; try { buildGoldenCompanion(scratchCopy('tf-text-lab'), noDecl); } catch (x: any) { r1 = String(x.message); }
    assert(/case TF-C117 declares the Git pin paichart\/paichart-lab-configs \(the default\), but its stored Harvester's held Git refs name paichart\/paichart-configs/.test(r1), `a missing declaration: ${r1.slice(0, 260)}`);
    // A wrong declaration on a lab-pin case: refused at build too.
    const wrong = { ...gs, cases: gs.cases.map((c) => (c.id === 'NET-JL1' ? { ...c, gitFileSourcePin: PROD_PIN } : c)) };
    let r2 = ''; try { buildGoldenCompanion(scratchCopy('model-lab'), wrong); } catch (x: any) { r2 = String(x.message); }
    assert(/case NET-JL1 declares the Git pin paichart\/paichart-configs, but its stored Harvester's held Git refs name paichart\/paichart-lab-configs/.test(r2), `a wrong declaration: ${r2.slice(0, 260)}`);
    // The loader: the default pin is never written, a malformed pin and a pin on a leg that holds no file are refused.
    for (const [mut, re] of [[(c: any) => { c.gitFileSourcePin = GOLDEN_DEFAULT_GIT_PIN; }, /is written only when it is NOT the default/], [(c: any) => { c.gitFileSourcePin = 'not a pin'; }, /must be "owner\/repo"/]] as const) {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-set-')); fs.cpSync(GOLDEN_DIR, d, { recursive: true });
      const j = JSON.parse(fs.readFileSync(path.join(d, 'golden-set.json'), 'utf8')); mut(j.cases.find((c: any) => c.id === 'TF-C117')); fs.writeFileSync(path.join(d, 'golden-set.json'), JSON.stringify(j));
      let m = ''; try { loadGoldenSet(d); } catch (x: any) { m = String(x.message); }
      assert(re.test(m), `the loader must refuse: ${m.slice(0, 200)}`);
    }
    const dv = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-set-')); fs.cpSync(GOLDEN_DIR, dv, { recursive: true });
    const jv = JSON.parse(fs.readFileSync(path.join(dv, 'golden-set.json'), 'utf8')); jv.cases.find((c: any) => c.id === 'NET-VALUE-C1').gitFileSourcePin = PROD_PIN; fs.writeFileSync(path.join(dv, 'golden-set.json'), JSON.stringify(jv));
    let mv = ''; try { loadGoldenSet(dv); } catch (x: any) { mv = String(x.message); }
    assert(/declares a Git pin on network-derivation-protocol, which holds no file/.test(mv), `a pin on a value leg: ${mv.slice(0, 200)}`);
  });

  await t('standing cover across pins: a Reviewer-side lever that differs from production reaches the change_reviewer standing cases on every Reviewer arm; the lab-pin companion carries them, the production-pin companion names it (standingCoveredBy) and the lock accepts that cover — and refuses it when the sibling stops carrying the case, carries it under other Reviewer-side levers, is missing, or is not named', async () => {
    const sb = await import('./leg-replay-lab/standing-bench');
    const dir = scratchCopy('model-lab');
    const e0 = JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8'));
    e0.variants.mx.reviewerEffort = 'medium'; // a Reviewer effort other than production's: reaches every *_reviewer standing reader
    fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(e0));
    const built = buildGoldenCompanion(dir, gs); const [cl, cp] = built.companions;
    const reached = ['NET-APPLY-WHOLE-FILE', 'NET-FWA3-EDGE'];
    assert(reached.every((id) => cl.report.standing!.some((x) => x.case === id)) && !(cp.report.standing ?? []).length, `the lab-pin companion carries the standing cases: ${JSON.stringify(cl.report.standing)}`);
    assert((cp.report.standingCoveredBy ?? []).map((x) => `${x.case}@${x.companion}`).sort().join() === reached.map((id) => `${id}@${GV}`).join(), `standingCoveredBy: ${JSON.stringify(cp.report.standingCoveredBy)}`);
    const problems = (exp: any, d: string) => sb.standingBenchProblems(exp, d);
    assert(problems(cl.experiment, cl.dir).length === 0, `the lab-pin companion passes the lock: ${problems(cl.experiment, cl.dir).join(' | ')}`);
    assert(problems(cp.experiment, cp.dir).length === 0, `the production-pin companion is covered by its sibling: ${problems(cp.experiment, cp.dir).join(' | ')}`);
    // Not named ⇒ the usual problem.
    const bare = JSON.parse(JSON.stringify(cp.experiment)); delete bare.goldenCompanion.standingCoveredBy;
    assert(problems(bare, cp.dir).length === 2 && problems(bare, cp.dir).every((x) => /not declared in "standingBench"/.test(x)), `not named: ${problems(bare, cp.dir).join(' | ')}`);
    // Other Reviewer-side levers on this companion's arm ⇒ the sibling's node does not measure it.
    const other = JSON.parse(JSON.stringify(cp.experiment)); for (const v of Object.values(other.variants) as any[]) v.reviewerEffort = 'low';
    assert(problems(other, cp.dir).length === 2 && problems(other, cp.dir).every((x) => /carries it on no arm with the Reviewer-side levers of/.test(x)), `other levers: ${problems(other, cp.dir).join(' | ')}`);
    // The sibling stops carrying one case ⇒ refused for that case.
    const lf = path.join(cl.dir, 'experiment.json'); const keep = fs.readFileSync(lf, 'utf8'); const le = JSON.parse(keep);
    le.standingBench = le.standingBench.filter((x: any) => x.case !== 'NET-FWA3-EDGE'); fs.writeFileSync(lf, JSON.stringify(le));
    const p1 = problems(cp.experiment, cp.dir);
    assert(p1.length === 1 && new RegExp(`NET-FWA3-EDGE .*${GV}\\) does not carry it`).test(p1[0]), `the sibling dropped a case: ${p1.join(' | ')}`);
    // The sibling folder gone ⇒ refused.
    fs.rmSync(cl.dir, { recursive: true, force: true });
    const p2 = problems(cp.experiment, cp.dir);
    assert(p2.length === 2 && p2.every((x) => new RegExp(`\\(${GV}\\) is missing`).test(x)), `the sibling is missing: ${p2.join(' | ')}`);
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
