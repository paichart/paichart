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
 * So the contract now specifies the shape, in all three domain protocols, identically. This suite pins
 * that they all carry it and that they have not drifted apart — three copies of a rule is three chances
 * for two of them to be right.
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

test('all THREE domain protocols carry the shape requirement', () => {
  const n = SEED.split(SHAPE_ANCHOR).length - 1;
  assert(n === 3, `expected the shape rule in network + k8s + terraform (3), found ${n}. ` +
    'A domain protocol without it will keep emitting prose validation and losing runs.');
});

test('all three FORBID the table form — the shape that invited the prose', () => {
  const n = SEED.split(TABLE_BAN).length - 1;
  assert(n === 3, `expected the table prohibition 3 times, found ${n}`);
});

test('the three copies have NOT drifted apart', () => {
  // Three copies of a rule is three chances for two of them to be right. Compare the clause bodies.
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const i = SEED.indexOf(SHAPE_ANCHOR, from);
    if (i === -1) break;
    bodies.push(SEED.slice(i, i + 700));
    from = i + 1;
  }
  assert(bodies.length === 3, `expected 3 clause bodies, found ${bodies.length}`);
  assert(bodies[0] === bodies[1] && bodies[1] === bodies[2],
    'the three shape clauses have diverged — fix them to be identical, or a domain silently gets a weaker rule');
});

test('the clause demands LITERAL output and names the failure it replaces', () => {
  assert(SEED.includes('the LITERAL text the tool or device returns'),
    'the "literal text" requirement is gone — without it "expected output" readmits description');
  assert(SEED.includes('not deterministic — replace it with one'),
    'the fallback instruction is gone: a step whose output cannot be quoted must be replaced or dropped, ' +
    'otherwise the author has no move when the check is genuinely non-deterministic and writes prose instead');
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

test('every domain protocol that carries the rule was VERSION-BUMPED with it', () => {
  // A protocol edited without a bump ships silently and cannot be correlated with a run.
  //
  // 2026-08-11 REWRITE — the original pinned exact version literals ("1.2.4", two "1.0.5"s),
  // which (a) broke on the next LEGITIMATE bump (the protocol-obligation-audit batch: this exact
  // test blocked that deploy), and (b) was not even anchored: the "1.2.4" it found belonged to an
  // UNRELATED prompt row by the time it fired. Assert the durable intent instead: each domain
  // protocol entry's version CHANGELOG still carries the shape-rule entry — later bumps must
  // append history ("Prior: …"), never erase it.
  for (const name of ['network-provisioning-protocol', 'kubernetes-gitops-protocol', 'terraform-iac-protocol']) {
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
