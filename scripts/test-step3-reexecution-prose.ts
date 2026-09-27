#!/usr/bin/env ts-node
/**
 * RWF C4 (2026-09-26): the base orchestrator protocol's Step 3 says what the platform now enforces. Pins the
 * load-bearing phrases (prompt-construction review §C.2) AND couples them to the code they describe, so the prose
 * and the mechanism cannot drift apart silently:
 *   - the reviewer exception (50-69 is never a reason to re-roll a verdict);
 *   - a stale reviewer is re-run only on the FACT `verdictFresh: no` (the exact word the card renders);
 *   - "A run that re-executes a child ENDS here" (the textual counterpart of reExecutionExit);
 *   - escalation wins; both refusal codes are named (the harness sees the refusal TEXT, not _meta — mcpService
 *     drops it — so the codes must also appear in the refusal messages).
 * Source scan, no DB. Paired with the seeded row via seed:protocols on deploy.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0; const failed: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }

const seed = read('scripts/seed-protocol-prompts.ts');
const base = seed.slice(seed.indexOf('const PIPELINE_ORCHESTRATOR_PROTOCOL = `'), seed.indexOf('const ARTIFACT_SYNTHESIS_PROTOCOL = `'));
const s3 = base.indexOf('### Step 3: Quality Gate');
const step3 = base.slice(s3, base.indexOf('### Step 4:', s3)); // search FROM Step 3: other modes have their own '### Step 4:' earlier

console.log('\n🧪 RWF C4 — Step 3 re-execution prose\n');
test('S0 Step 3 was found in the base protocol', () => assert(step3.length > 500, `step3 length ${step3.length}`));
test('S1 reviewer exception: 50-69 on a reviewer/QA-gate child is Accepted; the verdict decides', () => {
  assert(step3.includes('**unless the child is a reviewer/QA-gate child**'), 'reviewer exception missing');
  assert(/let its terminal verdict decide the outcome at Step 5/.test(step3), 'destination for a 50-69 reviewer missing');
});
test('S2 a stale reviewer is re-run ONLY on the fact `verdictFresh: no` — the word the card actually renders', () => {
  assert(step3.includes('shows \\`verdictFresh: no\\`'), 'the stale-verdict trigger is not keyed on the fact');
  assert(step3.includes('the platform refuses any other reviewer re-execution'), 'platform enforcement not stated');
  const card = read('lib/mcp/server/tools/advanced/lean-card-facts.js');
  const fresh = read('lib/agents/harness/chained-predecessors.ts');
  assert(card.includes("facts.push(`verdictFresh: ${exec.verdictFresh}"), 'card no longer renders `verdictFresh: <word>`');
  assert(/c\?\.match === 'different' \? 'no'/.test(fresh), "freshnessWord no longer maps 'different' to 'no'");
});
test('S3 "A run that re-executes a child ENDS here" — no teardown, stamp, task.complete or final comment', () => {
  assert(step3.includes('A run that re-executes a child ENDS here: no Step 4, no Step 5 — no teardown, no gate stamp, no \\`task.complete\\`, no final comment.'), 'ENDS-here sentence missing');
});
test('S4 escalation wins; both refusal codes named, and each code is in its real refusal message', () => {
  assert(step3.includes('**Escalation wins:** if ANY child is < 50, escalate in that run and re-execute nothing.'), 'escalation-wins rule missing');
  const rules = read('lib/services/orchestrator-reexecution.ts');
  for (const code of ['ORCHESTRATOR_REEXECUTION_CAP', 'REVIEWER_SAME_INPUT_REEXECUTION']) {
    assert(step3.includes(code), `${code} not named in Step 3`);
    assert(rules.includes(`\`${code}: `), `${code} is not the leading token of its refusal message`);
  }
  assert(step3.includes('A refusal is the answer, not an error to retry.'), 'refusal-is-the-answer missing');
});
test('S5 the keep-best claim is scoped to same-input re-runs (the unscoped "can only help" is gone)', () => {
  assert(!step3.includes('so a re-run can only help'), 'the unscoped premise survived');
  assert(step3.includes('For this same-input re-run the platform keeps the BETTER'), 'same-input scoping missing');
});

console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
