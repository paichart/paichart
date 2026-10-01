#!/usr/bin/env ts-node
/**
 * Validation-shape contract (2026-08-04).
 *
 * WHY THIS EXISTS. Across Runs 21-24, five of eight pipeline legs were gated `needs-revision` by their
 * own reviewers for writing PROSE where a validation step needs a literal expected output. The agents
 * are capable of the literal form — Run 24 produced it and both legs passed. The variance tracked the
 * SHAPE they chose:
 *
 *   Run 23 (rejected, 78): a markdown table, `| Step | Command | Expected Output |`, whose narrow cell
 *                          invited "Interface is UP, IP assigned, line protocol UP".
 *   Run 24 (approved, 92): fenced blocks, one per command, with the literal device output per device.
 *
 * So the contract now specifies the shape, in all four domain protocols, identically (extended to the
 * observability-config-protocol at its 1.0.0 birth, 2026-09-10 — carried from the first seed, not
 * retrofitted). This suite pins that they all carry it and that they have not drifted apart — four
 * copies of a rule is four chances for two of them to be right.
 *
 * ⚠️ THIS IS A BET, and it is recorded as one in
 * `cline_docs/follow-ups/validation-text-uncontained-2026-08-02.md` §10: shape beats instruction. The
 * baseline is 5 of 8 legs. It needs a before/after measurement, not an assumption that it worked.
 */
import * as fs from 'fs';
import * as path from 'path';

const SEED = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'seed-protocol-prompts.ts'), 'utf-8');

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.error(`❌ ${name}\n   ${e instanceof Error ? e.message : e}`); failed++; }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const SHAPE_ANCHOR = 'REQUIRED SHAPE (2026-08-04, measured)';
const TABLE_BAN = 'Do NOT put validation in a markdown table';

console.log('🧾 Validation-shape contract\n');

// 2026-09-15: the clause is now ONE shared const interpolated into the four domain protocols
// (panel: witnessed-rendering-obligation-2026-09-14). So "4 copies, identical" is the WRONG property
// to assert — it is true by construction and therefore vacuous. What must be pinned instead is
// REACHABILITY: exactly one definition, and every domain protocol still receiving it. The old
// byte-equality test would have caught NONE of the three live defects that motivated the extraction.
const CLAUSE_REF = '${VALIDATION_SHAPE_CLAUSE}';
const DOMAIN_PROTOCOL_CONSTS = [
  'PIPELINE_PROVISIONING_PROTOCOL',
  'PIPELINE_KUBERNETES_GITOPS_PROTOCOL',
  'PIPELINE_TERRAFORM_IAC_PROTOCOL',
  'PIPELINE_OBSERVABILITY_CONFIG_PROTOCOL',
];

test('the shape clause has exactly ONE definition — no copy has been re-inlined', () => {
  const defs = SEED.split('const VALIDATION_SHAPE_CLAUSE').length - 1;
  assert(defs === 1, `expected exactly 1 definition of the clause, found ${defs}`);
  const anchors = SEED.split(SHAPE_ANCHOR).length - 1;
  assert(anchors === 1,
    `the clause anchor appears ${anchors}× in source; it must appear ONCE (inside the const). ` +
    'A second occurrence means a domain has re-inlined its own copy — which is how the copies ' +
    'drifted before: only network carried the third sanctioned shape, so the same author behaviour ' +
    'was approved in one domain and blocked in another.');
});

test('all FOUR domain protocols still RECEIVE the shape clause', () => {
  const n = SEED.split(CLAUSE_REF).length - 1;
  assert(n === 4, `expected 4 interpolations of the shared clause, found ${n}`);
  // Reachability, not just a count: each named domain protocol body must contain the interpolation.
  for (const name of DOMAIN_PROTOCOL_CONSTS) {
    const start = SEED.indexOf(`const ${name} = \``);
    assert(start > -1, `${name} not found — rename? the reachability check is now blind`);
    const end = SEED.indexOf('\nconst ', start + 10);
    const body = SEED.slice(start, end === -1 ? undefined : end);
    assert(body.includes(CLAUSE_REF),
      `${name} does NOT receive the shared shape clause — that domain silently gets a weaker rule, ` +
      'which is exactly the state this extraction was done to end.');
  }
});

test('the clause FORBIDS the table form — the shape that invited the prose', () => {
  const n = SEED.split(TABLE_BAN).length - 1;
  assert(n === 1, `expected the table prohibition once (in the shared const), found ${n}`);
});

test('the remedy LADDER is intact — replace before drop, and unwitnessed is not a drop', () => {
  // The pre-2026-09-15 tail offered only "replace it with one you can, or drop it", which conflated
  // two different absences: a check that does not exist (drop is right) and one that exists but was
  // never witnessed (dropping it loses real coverage). It also offered DROP as a peer of REPLACE.
  assert(SEED.includes('REPLACE** the command with one whose output you CAN quote'),
    'the REPLACE rung is gone — it is the FIRST remedy and the one authors skip (a terraform leg used ' +
    '-no-color to make one step quotable and did not apply the same move to the next)');
  assert(SEED.includes('never a drop, because dropping it loses real coverage'),
    'the drop/unwitnessed distinction is gone — without it an author drops a runnable check to comply');
  assert(SEED.includes('nobody has yet observed'),
    'the unwitnessed-output rung is gone; the honest answer becomes unsayable again');
});

test('the clause ADDRESSES THE REVIEWER — the half R13 missed', () => {
  // R13 (2026-08-27) was a REVIEWER blocking a compliant author. Its entire remedy landed on the
  // author side, so as shipped it did not prevent R13 — which recurred 2026-09-14 in terraform.
  // The permission must reach the party that blocks, or extraction alone ships the failure intact.
  assert(SEED.includes('addressed to you as well'),
    'the reviewer-addressed paragraph is gone — a permission addressed only to the author is read by ' +
    'the reviewer as nothing at all, and the role-neutral text below it says "literal or drop"');
  assert(SEED.includes('judge the stated REASON, not the absence of a literal'),
    'the reviewer disposition is gone — what to ACCEPT, not merely what to reject');
  assert(SEED.includes('licenses nothing'),
    'the licensing deferral is gone — without it this clause would sanction the shape in domains ' +
    'whose protocol sanctions none (terraform/k8s renderings ARE obtainable pre-apply, so a blanket ' +
    'sanction converts a CORRECT block into a pass)');
});

test('the clause demands LITERAL output and names the failure it replaces', () => {
  assert(SEED.includes('the LITERAL text the tool or device returns'),
    'the "literal text" requirement is gone — without it "expected output" readmits description');
  // Pins the PROPERTY (a defined move exists when the literal is impossible), not the old phrasing.
  // The 2026-09-15 rewrite replaced "replace it with one you can, or drop it" with a three-rung
  // ladder; an assertion on the old words would have failed for a correct change — and this one
  // did exactly that, which is how it was found. The rungs themselves are pinned by the ladder test.
  assert(SEED.includes('not deterministic AS WRITTEN') && SEED.includes('do NOT describe it in prose'),
    'the fallback instruction is gone: without a defined move for a step whose output cannot be ' +
    'quoted, the author has nothing to do but write prose — the defect this whole clause exists to remove');
});

test('the clause ships NO worked values — a shape example must not seed a value', () => {
  // VT-12 D2/D3: a stated expected value propagates through tiers as if observed. The example is
  // placeholders only. This asserts the illustration carries no address from the rig's pool.
  const i = SEED.indexOf(SHAPE_ANCHOR);
  const clause = SEED.slice(i, i + 900);
  assert(!/10\.99\.\d+\.\d+/.test(clause),
    'the shape example contains a real pool address — it will be copied as an expected value');
  assert(clause.includes('<the exact command>') && clause.includes('character for character'),
    'the placeholder illustration is gone; without it "one fenced block per command" is under-specified');
});

test('network (f2): a VALUE-PRODUCING package validates by printed literal, never by restated conclusion', () => {
  // X29 (2026-09-28, Program Run 4 FABRIC). A package that changes no device has nothing to validate
  // except its derived value, so it restated the design's derivation — which clause (f) forbids.
  // Measured: 5 of 8 value-producing network packages did so, 4 were refused; 0 config-change packages
  // ever were. The two that wrote re-runnable commands + the literal text they print were both
  // approved. (f2) names that shape. Pinned per PROPERTY, and scoped to the network body: this is the
  // only domain whose legs publish a derived value without changing anything (R4 derive/consume split).
  const start = SEED.indexOf('const PIPELINE_PROVISIONING_PROTOCOL = `');
  const end = SEED.indexOf('\nconst ', start + 10);
  const body = SEED.slice(start, end);
  assert(body.includes('(f2) **A VALUE-PRODUCING package — one that changes no device'),
    'the (f2) scope condition is gone — without a condition the agent can evaluate from its own design, ' +
    'the rule either reaches config-change packages or reaches nothing');
  assert(body.includes('The expected output is what the command PRINTS, never a sentence saying what it proves'),
    'the printed-literal rule is gone — Run 4 put "/27 is the tightest valid cover" inside an expected-output block');
  assert(body.includes('a step that is a description of arithmetic rather than a command is not a validation step'),
    'the pseudo-command exclusion is gone — "Step 1 — Containment: enumerate the span" is not re-runnable');
  assert(body.includes('plus these commands and the text they print ARE the computation shown'),
    'the show-the-computation reconciliation is gone — the requirements template demands the deliverable "show the computation", ' +
    'and Run 4\'s Author brief demanded both full arithmetic and no narrative; without this sentence the two layers contradict');
  assert(body.includes('Any package that changes a device: (b) applies unchanged'),
    'the config-change exit is gone — (f2) must leave ordinary config-change packages exactly as they were');
  assert(body.includes('is a claim, not a conclusion, and belongs in the package'),
    'the observed/applied carve-out is gone — without it a contract "must report" obligation collides with (f) ' +
    '(2026-09-26: a marker interpretation was blocked together with the restated derivation it sat beside)');
  assert(body.includes('is the shape (f2) REQUIRES — accept it'),
    'the reviewer half is gone — a permission addressed only to the Author is read by the Reviewer as nothing');
  assert(body.includes('never block it as one'),
    'the reviewer is no longer told an observed/applied report is not a conclusion');
  // (f) itself must survive — (f2) sharpens it, never replaces it.
  assert(body.includes('Do NOT restate, summarize, or carry forward the design\'s containment CONCLUSION'),
    'clause (f) is gone — (f2) is a clarification of (f) and is meaningless without it');
  for (const other of ['PIPELINE_KUBERNETES_GITOPS_PROTOCOL', 'PIPELINE_TERRAFORM_IAC_PROTOCOL', 'PIPELINE_OBSERVABILITY_CONFIG_PROTOCOL']) {
    const s = SEED.indexOf(`const ${other} = \``);
    const e = SEED.indexOf('\nconst ', s + 10);
    assert(s > -1 && !SEED.slice(s, e).includes('(f2)'),
      `${other} carries (f2) — its legs do not publish derived values without a change, and "(f2)" names a clause that domain does not have`);
  }
  const entry = SEED.indexOf(`name: 'network-provisioning-protocol'`);
  const versionLine = SEED.slice(entry).match(/version: '(\d+\.\d+\.\d+)',(.*)/);
  assert(!!versionLine && versionLine[2].includes('X29'),
    'the network changelog no longer records X29 — a later bump erased history instead of appending "Prior: …"');
});

test('every domain protocol that carries the rule was VERSION-BUMPED with it', () => {
  // A protocol edited without a bump ships silently and cannot be correlated with a run.
  //
  // 2026-08-11 REWRITE — the original pinned exact version literals ("1.2.4", two "1.0.5"s),
  // which (a) broke on the next LEGITIMATE bump (the protocol-obligation-audit batch: this exact
  // test blocked that deploy), and (b) was not even anchored: the "1.2.4" it found belonged to an
  // UNRELATED prompt row by the time it fired. Assert the durable intent instead: each domain
  // protocol entry's version CHANGELOG still carries the shape-rule entry — later bumps must
  // append history ("Prior: …"), never erase it.
  for (const name of ['network-provisioning-protocol', 'kubernetes-gitops-protocol', 'terraform-iac-protocol', 'observability-config-protocol']) {
    const entry = SEED.indexOf(`name: '${name}'`);
    assert(entry !== -1, `${name} entry not found in PROTOCOLS[]`);
    const versionLine = SEED.slice(entry).match(/version: '(\d+\.\d+\.\d+)',(.*)/);
    assert(!!versionLine, `${name} has no version line after its name field`);
    assert(versionLine![2].includes('VALIDATION SHAPE'),
      `${name} version changelog no longer records the shape rule — a bump erased history instead of appending "Prior: …"`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
