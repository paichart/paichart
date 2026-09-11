#!/usr/bin/env ts-node
/**
 * rollback-containment fixtures (net #3, 2026-09-11)
 *
 * Every fixture is LIVE campaign text — see scripts/fixtures/rollback-containment/PROVENANCE.md.
 * Hand-authored fixtures cannot pin this net: the whole reason it exists is that the classification
 * of a real package's rollback section is not what reading the source suggests.
 *
 * Both directions are tested SEPARATELY, because they are not the same result:
 *   PASSING  — the four (b)-lane / clean specimens land on their measured expectations.
 *   BLOCKING — a mutated value is DETECTED and named.
 *   NON-SUPPRESSION — the (a)-lane k8s specimen contributes nothing, and a GREEDY predicate makes
 *                     that assertion FAIL (proved here, not asserted).
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeRollbackContainmentFact } from '../lib/agents/harness/rollback-containment-enrichment';
import {
  scopeRestoreLines,
  checkRollbackContainment,
  computeRollbackDisposition,
  type ExclusionClass,
} from '../lib/agents/harness/rollback-containment';

console.log('↩️  rollback-containment fixtures\n');

let passed = 0;
let failed = 0;

const pending: Array<Promise<void>> = [];
function test(description: string, fn: () => void | Promise<void>) {
  try {
    const r = fn();
    if (r && typeof (r as Promise<void>).then === 'function') {
      pending.push((r as Promise<void>).then(
        () => { console.log(`✅ ${description}`); passed++; },
        (e: unknown) => { console.error(`❌ ${description}`); if (e instanceof Error) console.error(`   Error: ${e.message}`); failed++; }
      ));
      return;
    }
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) console.error(`   Error: ${error.message}`);
    failed++;
  }
}

function expectEq(actual: unknown, expected: unknown, what = '') {
  if (actual !== expected) {
    throw new Error(`${what}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const DIR = path.join(__dirname, 'fixtures', 'rollback-containment');
const read = (n: string) => fs.readFileSync(path.join(DIR, n), 'utf8');

function measure(name: string) {
  const scope = scopeRestoreLines(read(`${name}-author.md`));
  const check = checkRollbackContainment(scope.lines, read(`${name}-harvest.md`));
  return { scope, check };
}

// ── PASSING DIRECTION ─────────────────────────────────────────────────────────────────────────
// Counts measured against production artifacts 2026-09-11. A change here is a FINDING: either the
// scoping moved or a fixture was edited, and both matter more than the number.

test('R19 P4 (the motivating incident): 51 restore lines, ZERO missing — the package the reviewer refused is exonerated', () => {
  const { scope, check } = measure('r19p4');
  expectEq(check.restoreLinesTotal, 51, 'restore lines: ');
  expectEq(check.restoreLinesFound, 51, 'found: ');
  expectEq(check.missing.length, 0, 'missing: ');
  // The six "anachronistic" description lines are the reason this incident exists. Name one.
  const descs = scope.lines.filter((l) => l.text.startsWith('description to-ceos'));
  expectEq(descs.length, 6, 'description lines scoped: ');
  expectEq(
    check.missing.some((m) => m.line.includes('transit path via ceos2 preferred')),
    false,
    'the disputed transit-preference description must be found in harvest: '
  );
});

test('R19 P4: scoping spans ALL THREE device blocks — a `kind === rollback` filter would drop one', () => {
  // The rollback preamble says "harvested LIVE by this P4 leg", so classifyBlock assigns the first
  // device block `harvested-state` and the other two `rollback`. Scoping on `kind` yields 34 lines,
  // not 51 — position-dependently. This asserts the restoreIntent axis, not the kind.
  const { scope } = measure('r19p4');
  expectEq(scope.blocksScanned.restore, 3, 'restore blocks: ');
  for (const dev of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
    if (!scope.lines.some((l) => l.text === `router-id ${dev}`)) {
      throw new Error(`device ${dev}'s rollback block was not scoped — the kind/ancestry split regressed`);
    }
  }
});

test('R3a-3 (excerpt lane): the disputed rule_files glob is found in the leg\'s own harvest', () => {
  const { scope, check } = measure('r3a3');
  expectEq(check.restoreLinesTotal, 2, 'restore lines: ');
  expectEq(check.missing.length, 0, 'missing: ');
  if (!scope.lines.some((l) => l.text === '- /etc/prometheus/rules/*.yml')) {
    throw new Error('the disputed glob line was not scoped');
  }
  // Trimming is what makes this match: the author indents it, the harvest does not.
  if (!read('r3a3-author.md').includes('  - /etc/prometheus/rules/*.yml')) {
    throw new Error('fixture drift: the author no longer indents the glob, so this no longer pins trimming');
  }
});

test('R3a-3: the two benign classes in one rollback section are NAMED, not silently dropped', () => {
  const { scope } = measure('r3a3');
  expectEq(scope.excluded['expected-output-in-restore-section'], 1, 'expected-output: ');
  expectEq(scope.excluded['validation-command-in-restore-section'], 1, 'validation-command: ');
});

test('R3b-2 (whole-file lane): 26 restore lines, ZERO missing — rollback is the as-deployed file', () => {
  const { check } = measure('r3b2');
  expectEq(check.restoreLinesTotal, 26, 'restore lines: ');
  expectEq(check.restoreLinesFound, 26, 'found: ');
  expectEq(check.missing.length, 0, 'missing: ');
});

test('FW-A3.3 (greenfield): an all-`no `-form rollback scopes ZERO lines as inverse-rollback-block', () => {
  const { scope, check } = measure('fw');
  expectEq(check.restoreLinesTotal, 0, 'restore lines: ');
  expectEq(scope.blocksScanned.restore, 1, 'restore blocks: ');
  expectEq(scope.excluded['inverse-rollback-block'], 9, 'inverse-rollback-block: ');
  expectEq(scope.excluded['separator'], 5, 'separator: ');
  // This is the class that made the NAIVE rule flag 100% of the 56-package corpus.
  const d = computeRollbackDisposition({ checked: false, reason: 'no-restore-form-lines', ...check });
  expectEq(d.disposition, 'benign');
  expectEq(d.reason, 'no-restore-form-lines');
});

// ── NON-SUPPRESSION — the (a) lane ────────────────────────────────────────────────────────────

test('June k8s (a-lane): the fact contributes NOTHING, so the reviewer\'s legitimate catch stands', () => {
  const { scope, check } = measure('k8s');
  expectEq(check.restoreLinesTotal, 0, 'restore lines: ');
  expectEq(check.missing.length, 0, 'missing: ');
  expectEq(scope.excluded['procedural-rollback-block'], 5, 'procedural-rollback-block: ');
  expectEq(scope.excluded['comment-line'], 4, 'comment-line: ');
  // The reviewer blocked for MISSING LimitRange/ResourceQuota/PDB evidence and was RIGHT. Nothing
  // this net computes may bear on that: it answers containment-in-harvest, never completeness.
  const d = computeRollbackDisposition({ checked: false, reason: 'no-restore-form-lines', ...check });
  expectEq(d.disposition, 'benign');
  if (JSON.stringify(scope.lines) !== '[]') {
    throw new Error('an (a)-lane package must scope no restore lines — see PROVENANCE.md');
  }
});

test('NON-SUPPRESSION IS MUTATION-PROVEN: a GREEDY predicate makes the k8s assertion fail', () => {
  // A non-suppression test that cannot fail is not a test. Simulate the exact regression that
  // matters — dropping `procedural-rollback-block` so a git-revert procedure is treated as restored
  // content — and assert THIS fixture is what catches it.
  const doc = read('k8s-author.md');
  const real = scopeRestoreLines(doc);
  expectEq(real.lines.length, 0, 'baseline must be zero: ');

  // The greedy variant: same scoping, minus the procedural exclusion.
  const greedyLines = (() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fencedBlockLines, isSeparatorLine } = require('../lib/agents/harness/dialect-lint');
    return (fencedBlockLines(doc) as Array<{ text: string; restoreIntent: boolean; label: string | null }>)
      .filter((b) => b.restoreIntent && b.text.trim() && !isSeparatorLine(b.text)
        && !/^\s*no\s/i.test(b.text) && b.label !== 'expected-output');
  })();
  if (greedyLines.length === 0) {
    throw new Error(
      'the greedy variant scoped nothing, so this fixture would NOT catch a regression that ' +
      'removes the procedural exclusion — the non-suppression guard is inert'
    );
  }
  console.log(`   (greedy variant would have scoped ${greedyLines.length} lines — the guard bites)`);
});

// ── BLOCKING DIRECTION ────────────────────────────────────────────────────────────────────────
// Cannot be obtained from a clean round; it is obtained by mutating a clean package. Both mutations
// COMPILE and are semantically plausible — a mutation that produces no output proves nothing.

for (const [before, after] of [
  ['endpoint: 0.0.0.0:8889', 'endpoint: 0.0.0.0:9999'],
  ['batch: {}', 'batch: {timeout: 5s}'],
] as Array<[string, string]>) {
  test(`BLOCKING: R3b-2 with \`${before}\` → \`${after}\` yields exactly one named missing line`, () => {
    const doc = read('r3b2-author.md');
    // Mutate INSIDE the rollback section only. Both strings also appear in §1's witnessed baseline
    // and §2's desired-state file, and a naive first-occurrence replace lands there — producing a
    // package whose ROLLBACK is untouched and therefore still fully contained. That reads as "the
    // check missed a fabrication" when in truth nothing was fabricated in the rollback, which is
    // the same wrong-conclusion-from-the-wrong-slice mistake this whole net is about.
    const start = doc.indexOf('## 6. Rollback Plan');
    const end = doc.indexOf('## 7. Recommended');
    if (start < 0 || end < 0) throw new Error('fixture drift: R3b-2 rollback section headings moved');
    const section = doc.slice(start, end);
    if (!section.includes(before)) {
      throw new Error(`fixture drift: ${before} is no longer in R3b-2's rollback section`);
    }
    const mutated = doc.slice(0, start) + section.replace(before, after) + doc.slice(end);
    const scope = scopeRestoreLines(mutated);
    const check = checkRollbackContainment(scope.lines, read('r3b2-harvest.md'));
    expectEq(check.missing.length, 1, 'missing: ');
    expectEq(check.missing[0].line, after, 'the missing line must be NAMED, not counted: ');
    expectEq(check.restoreLinesFound, 25, 'found: ');
    const d = computeRollbackDisposition({ checked: true, ...check });
    // ESCALATES, never blocks — the corpus base rate of true fabrication is 0/56 (Path 3).
    expectEq(d.disposition, 'needs-node-c');
    expectEq(d.reason, 'unmatched-restore-lines');
  });
}

// ── EXCLUSION CLASSES: each one mutation-verified to STOP firing ──────────────────────────────

test('MUTATION: removing the `!` separators from R19 P4 drops the separator exclusion to zero', () => {
  const doc = read('r19p4-author.md').split('\n').filter((l) => l.trim() !== '!').join('\n');
  const scope = scopeRestoreLines(doc);
  expectEq(scope.excluded['separator'] ?? 0, 0, 'separator: ');
  // and the restore lines are unchanged — separators were never adjudicated
  expectEq(scope.lines.length, 51, 'restore lines: ');
});

test('MUTATION: un-inverting FW-A3.3\'s rollback turns it from inverse-block into adjudicated lines', () => {
  const doc = read('fw-author.md').replace(/^(\s*)no /gm, '$1');
  const scope = scopeRestoreLines(doc);
  expectEq(scope.excluded['inverse-rollback-block'] ?? 0, 0, 'inverse-rollback-block: ');
  if (scope.lines.length === 0) {
    throw new Error('un-inverting must produce adjudicable lines, or the exclusion was not what suppressed them');
  }
});

// ── DISPOSITION: benign is an ALLOWLIST, and the could-not-check arm fails closed ─────────────

test('DISPOSITION: an unrecognised reason falls through to blocking, VISIBLY', () => {
  const d = computeRollbackDisposition({ checked: false, reason: 'something-nobody-added-to-the-allowlist' });
  expectEq(d.disposition, 'blocking');
  expectEq(d.reason, 'hard-gap');
});

test('DISPOSITION: no-harvest-text fails CLOSED — the package quoted content and the evidence was unreadable', () => {
  const d = computeRollbackDisposition({ checked: false, reason: 'no-harvest-text' });
  expectEq(d.disposition, 'blocking');
});

test('DISPOSITION: enrichment-error fails CLOSED (G3 — the one arm meaning "things went wrong")', () => {
  expectEq(computeRollbackDisposition({ checked: false, reason: 'enrichment-error' }).disposition, 'blocking');
});

test('DISPOSITION: program-tier is benign and applicable:false — never a leg gap on a program parent', () => {
  const d = computeRollbackDisposition({ checked: false, reason: 'program-tier' });
  expectEq(d.disposition, 'benign');
  expectEq(d.reason, 'program-tier');
});

test('DISPOSITION: benign for "nothing quoted" is NOT an approval — the reasons are distinguishable', () => {
  // `no-restore-blocks` (the package has no rollback section at all) and `all-restore-lines-found`
  // (everything quoted was found) are both benign, and a consumer MUST be able to tell them apart —
  // conflating them is how this fact would start reading as a completeness verdict.
  const nothing = computeRollbackDisposition({ checked: false, reason: 'no-restore-blocks' });
  const found = computeRollbackDisposition({ checked: true, missing: [], restoreLinesTotal: 26 });
  expectEq(nothing.disposition, 'benign');
  expectEq(found.disposition, 'benign');
  if (nothing.reason === found.reason) {
    throw new Error('"nothing to adjudicate" and "all lines found" must not share a reason string');
  }
});

// ── LANE SCOPING (ruled 2026-09-11 after the corpus re-measure) ──────────────────────────────

test('LANE: terraform-iac and kubernetes-gitops are DELIBERATE no-checks — benign, not blocking', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isDesiredStateLane, DESIRED_STATE_LANES } = require('../lib/agents/harness/rollback-containment');
  for (const lane of DESIRED_STATE_LANES) {
    expectEq(isDesiredStateLane(lane), true, `${lane} (short): `);
    // ⚠️ THE FORM THAT ACTUALLY REACHES THIS PREDICATE IN PRODUCTION. A stamp carries the LONG
    // form; the first cut compared short names by string equality and matched nothing live, so the
    // ruling shipped inert and a corpus re-measure came back byte-identical to the pre-ruling run.
    expectEq(isDesiredStateLane(`${lane}-protocol`), true, `${lane}-protocol (stamped form): `);
  }
  const d = computeRollbackDisposition({ checked: false, reason: 'lane-not-supported' });
  expectEq(d.disposition, 'benign');
  expectEq(d.reason, 'lane-not-supported');
});

test('LANE: a DELIBERATE no-check and a COULD-NOT-check must not share a disposition reason', () => {
  // lane-not-supported = we chose not to look. no-harvest-text = we tried and the evidence was
  // unreadable. Conflating them either blocks every terraform leg or silently excuses a broken
  // harvest; the whole value of the taxonomy is telling a reader which one happened.
  const deliberate = computeRollbackDisposition({ checked: false, reason: 'lane-not-supported' });
  const couldNot = computeRollbackDisposition({ checked: false, reason: 'no-harvest-text' });
  expectEq(deliberate.disposition, 'benign');
  expectEq(couldNot.disposition, 'blocking');
});

test('LANE: the list is a DENYLIST — an unknown protocol is ADJUDICATED, never silently skipped', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isDesiredStateLane } = require('../lib/agents/harness/rollback-containment');
  for (const p of ['observability-config', 'observability-config-protocol', 'network-provisioning',
                   'network-provisioning-protocol', 'some-future-protocol', null, undefined, '']) {
    if (isDesiredStateLane(p)) {
      throw new Error(`${p} must NOT be treated as a desired-state lane — a coverage gap has to surface as visible escalation, not silence`);
    }
  }
});

// ── ENRICHMENT ARM PRECEDENCE (ruled 2026-09-11 after the first live HCL leg) ────────────────
//
// ⚠️ THE GAP THIS CLOSES. Every test above exercises the PURE module; the arm ordering lives in the
// ENRICHMENT, so when the precedence was wrong the whole suite stayed green and the defect was only
// found by reading a live k8s stamp. The enrichment needs no DATABASE_URL (it imports Prisma as a
// TYPE only), so a stub client pins the ordering directly.

function stubPrisma(opts: { stageId: string | null; legTitle: string | null; children?: Array<Record<string, unknown>> }) {
  return {
    task: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) =>
        select && 'stageId' in select
          ? { stageId: opts.stageId }
          : { title: opts.legTitle, metadata: {} },
      findMany: async () => opts.children ?? [],
    },
    stage: { findUnique: async () => ({ metadata: { harnessTaskId: 'leg1' } }) },
    $queryRaw: async () => [],
  } as unknown as Parameters<typeof computeRollbackContainmentFact>[0];
}

const PROCEDURAL_PKG = [
  '## 3. Rollback Plan', '', '**Command:**', '```bash', 'git revert <sha>', 'git push origin main', '```', '',
].join('\n');

test('ARM-1: an HCL leg with a PROCEDURAL rollback stamps lane-not-supported, NOT a content reason', async () => {
  // The live k8s-gitops R1 case. Both reasons are benign, so the gate was never wrong — but
  // `no-restore-blocks` is the wrong TRUE statement: it implies that adding a restore block would
  // get the package adjudicated, and in this lane nothing ever is.
  const fact = await computeRollbackContainmentFact(
    stubPrisma({ stageId: 's1', legTitle: 'Add an HPA (protocol: kubernetes-gitops)' }),
    { taskId: 'a1', deliverable: PROCEDURAL_PKG }
  );
  expectEq(fact.checked, false);
  expectEq(fact.reason, 'lane-not-supported', 'reason: ');
  expectEq(fact.lane, 'kubernetes-gitops-protocol', 'lane: ');
  expectEq((fact.rollbackDisposition as Record<string, unknown>).disposition, 'benign');
});

test('ARM-2: a NON-HCL leg with the same package still stamps the CONTENT reason', async () => {
  // Lane-first must change ONLY the desired-state lanes. If this flips, the hoist broke everything.
  const fact = await computeRollbackContainmentFact(
    stubPrisma({ stageId: 's1', legTitle: 'OSPF removal (protocol: network-provisioning)' }),
    { taskId: 'a1', deliverable: PROCEDURAL_PKG }
  );
  expectEq(fact.reason, 'no-restore-form-lines', 'reason: ');
  expectEq((fact.rollbackDisposition as Record<string, unknown>).disposition, 'benign');
});

test('ARM-3: no-child-stage was NOT hoisted — a stage-less package stays BENIGN, not blocking', async () => {
  // The trap in the reorder. `no-child-stage` is not in the benign allowlist, so hoisting it with
  // the lane check would flip a stage-less package with no rollback section from benign to BLOCKING.
  const fact = await computeRollbackContainmentFact(
    stubPrisma({ stageId: null, legTitle: null }),
    { taskId: 'a1', deliverable: '## Change\n\nno rollback section here\n' }
  );
  expectEq(fact.reason, 'no-restore-blocks', 'reason: ');
  expectEq((fact.rollbackDisposition as Record<string, unknown>).disposition, 'benign');
});

test('ARM-4: an UNRESOLVABLE lane is ADJUDICATED, never silently skipped', async () => {
  const fact = await computeRollbackContainmentFact(
    stubPrisma({ stageId: 's1', legTitle: 'A leg with no protocol token at all' }),
    { taskId: 'a1', deliverable: PROCEDURAL_PKG }
  );
  if (fact.reason === 'lane-not-supported') {
    throw new Error('an unknown protocol must fall through to adjudication — a coverage gap has to surface, not go silent');
  }
});

// ── CHAINER CARRY (2a-plumbing) ───────────────────────────────────────────────────────────────
// Source-text pins, the same shape test-marker-presence.ts uses for the sibling fact. They assert
// the WIRING PROPERTIES, not the formatting: each one is written so that deleting the behaviour
// fails it, and reformatting does not.

const chainerSrc = fs.readFileSync(
  path.join(__dirname, '..', 'lib/agents/harness/context-chainer.ts'), 'utf-8');

test('CHAIN-1: ChainedContext declares rollbackContainment, so §6 can read a sibling\'s fact', () => {
  if (!/rollbackContainment: Record<string, unknown> \| null;/.test(chainerSrc)) {
    throw new Error('the carried field is not declared on ChainedContext.chainedFrom[]');
  }
});

test('CHAIN-2: the carry is LANE-GUARDED — never a bare pass-through', () => {
  // A bare `rollbackContainment: parsed.rollbackContainment ?? null` would carry the fact into
  // every lane, which is exactly what the 66%-unmatched corpus measurement says not to do.
  if (/rollbackContainment:\s*parsed\.rollbackContainment/.test(chainerSrc)) {
    throw new Error('the carry is an unguarded pass-through — the lane ruling has been bypassed');
  }
  if (!/resolveRollbackLane\(depTask\)/.test(chainerSrc)) {
    throw new Error('the lane guard is not consulted at the push site');
  }
});

test('CHAIN-3: the lane is NOT read from the predecessor alone — it falls back to the LEG', () => {
  // THE TRAP THIS PINS. An ACTION sibling (a Reviewer\'s own Author — the common case) carries
  // metadata.protocol as a PRESENT-BUT-NULL key, and the resolution ladder treats a present key as
  // authoritative. Asking only the sibling returns null in EVERY lane, which silently disables the
  // carry everywhere while looking wired. The enrichment shipped exactly this bug the same day and
  // it was caught only because a corpus re-measure came back byte-identical.
  const fn = chainerSrc.slice(chainerSrc.indexOf('async function resolveRollbackLane'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  if (!/harnessTaskId/.test(body)) {
    throw new Error('resolveRollbackLane does not fall back to the leg via stage.metadata.harnessTaskId');
  }
  if (!/canonicalProtocolName/.test(body)) {
    throw new Error('the lane compares raw strings — a stamp carries the LONG form and would never match');
  }
});

test('CHAIN-4: out-of-lane is a FIELD OMISSION, not a chain skip — nothing enters notChained', () => {
  // The predecessor is still fully chained; it simply carries no rollback fact. notChained means
  // "this predecessor\'s CONTEXT did not arrive", which would be false here and would make a
  // healthy chain read degraded.
  const pushes = [...chainerSrc.matchAll(/notChained\.push\(\{[^}]*\}/g)].map((m) => m[0]);
  for (const p of pushes) {
    if (/rollback|lane/i.test(p)) {
      throw new Error(`a lane omission is being recorded as a chain skip: ${p}`);
    }
  }
});

test('CHAIN-5: the lane lookups are skipped when there is no fact to carry', () => {
  // Most predecessors are not Authors and stamp nothing. Doing two PK lookups for each of them
  // would be a per-predecessor cost for a field that is null by construction.
  if (!/stampedRollback && \(await resolveRollbackLane/.test(chainerSrc)) {
    throw new Error('the lane resolution is not short-circuited on an absent fact');
  }
});

// ── SCOPE NOTE: the honest-limits statement travels IN the fact ───────────────────────────────

test('SCOPE: the fact carries its own limits, so a consumer cannot over-claim it', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ROLLBACK_SCOPE_NOTE } = require('../lib/agents/harness/rollback-containment');
  for (const claim of ['TRIMMED EXACT LINE', 'NOTHING about whether the package is COMPLETE', 'OWN harvest']) {
    if (!ROLLBACK_SCOPE_NOTE.includes(claim)) {
      throw new Error(`the scope note must state: ${claim}`);
    }
  }
});

// The async ARM-* tests resolve here. Without this await the process exits reporting only the
// synchronous results — a suite that silently drops a third of its assertions.
void Promise.all(pending).then(() => {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('\n❌ rollback-containment fixtures FAILED');
    process.exit(1);
  }
  console.log('\n✅ rollback-containment fixtures PASSED');
});
