#!/usr/bin/env ts-node
/**
 * CC7 interface-contract channel — source pins (CI-safe, no DB).
 *
 * Locks the F11/F12 fix (2026-07-15, live program run cmrlqfu610003yx1xk5ys7oyz):
 *   A3 — router double-nest hoist (tasks-action-router.ts): the harness LLM occasionally
 *        double-nests the contract (parameters.parameters.interfaceContract), which the
 *        default-strip safeParse silently removes. The router hoists it BEFORE safeParse.
 *   B1 — structural loud-fail (prepare-task-for-execution.ts): a program pipeline child with
 *        no contract THROWS even with NO requiresInterfaceContract flag, keyed on the parent
 *        harness TASK TITLE token `(protocol: pov-program` — NOT template metadata (the program
 *        reuses the generic Pipeline Harness template) and NOT bare type==='PIPELINE'.
 *
 * Behavioral end-to-end proof (needs dev DB): scripts/test-cc7-contract-guard-behavioral.ts (5/5).
 */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
function test(desc: string, fn: () => void) {
  try { fn(); console.log(`✅ ${desc}`); passed++; }
  catch (e) { console.log(`❌ ${desc}\n   ${e instanceof Error ? e.message : e}`); failed++; }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

const routerSrc = fs.readFileSync(path.join(process.cwd(), 'lib/mcp/tasks/action/tasks-action-router.ts'), 'utf8');
const guardSrc = fs.readFileSync(path.join(process.cwd(), 'lib/agents/harness/prepare-task-for-execution.ts'), 'utf8');

console.log('🔒 CC7 contract-guard source pins (F11/F12)\n');

// ── A3: router hoist ──
test('A3.1: router hoists parameters.parameters.interfaceContract before safeParse', () => {
  const hoistIdx = routerSrc.indexOf('inner.interfaceContract');
  const parseIdx = routerSrc.indexOf('schema.safeParse(parameters)');
  assert(hoistIdx > 0, 'hoist block missing');
  assert(parseIdx > 0, 'safeParse missing');
  assert(hoistIdx < parseIdx, 'hoist MUST run before safeParse (else the default-strip removes the nested key first)');
});
test('A3.2: hoist is no-clobber (never overwrites a correctly-placed interfaceContract)', () => {
  const win = routerSrc.slice(routerSrc.indexOf('inner.interfaceContract'), routerSrc.indexOf('inner.interfaceContract') + 260);
  assert(/parameters\s*as\s*any\)\.interfaceContract\s*===\s*undefined/.test(win) || win.includes('.interfaceContract === undefined'),
    'hoist must guard on the top-level interfaceContract being undefined (no-clobber)');
});

// ── B1: structural loud-fail ──
test('B1.1: guard throws INTERFACE_CONTRACT_MISSING on the flag arm OR the structural arm', () => {
  assert(/requiresContract\s*\|\|\s*structurallyRequiresContract/.test(guardSrc), 'guard must fire on either arm');
  assert(guardSrc.includes('INTERFACE_CONTRACT_MISSING'), 'throw missing');
});
test('B1.2 (rewritten WS2 Phase A, 2026-08-17): structural arm keys on the parent TASK ROW\'s protocol STAMP via the shared filter, AND-lifted with the stage filter', () => {
  // Pre-Phase-A this pin asserted the parent TITLE token and the ABSENCE of path:['protocol'] —
  // guarding against reading TEMPLATE metadata. Phase A moved the discriminator to the parent
  // TASK row's `metadata.protocol` stamp (shared programHarnessProtocolFilter, with a
  // transitional title disjunct), so the object-discipline property this pin protects is now:
  // the filter is composed inside a prisma.task query (the TASK row, never the template), and
  // the stage filter + protocol filter are AND-lifted (two `metadata` keys in one object literal
  // is last-writer-wins and would match the wrong harness).
  const start = guardSrc.indexOf('structurallyRequiresContract = false');
  const end = guardSrc.indexOf('structurallyRequiresContract = !!programParent');
  assert(start > 0 && end > start, 'structural arm block not found');
  const win = guardSrc.slice(start, end);
  assert(win.includes('programHarnessProtocolFilter()'), 'discriminator must be the SHARED stamp filter (parent task row)');
  assert(win.includes("path: ['pipelineStageId']"), 'must match the parent whose pipelineStageId == this stage');
  assert(/AND:\s*\[/.test(win), 'stage filter and protocol filter must be AND-lifted');
  assert(win.includes('prisma.task.findFirst') || guardSrc.slice(start - 200, end).includes('prisma.task.findFirst'),
    'the read must be against the TASK row, never template metadata (object discipline)');
});
test('B1.3: structural arm only considers PIPELINE-typed children (excludes ACTION producer/NodeC/gate/Architect)', () => {
  const win = guardSrc.slice(guardSrc.indexOf('structurallyRequiresContract = false'), guardSrc.indexOf('structurallyRequiresContract = !!programParent') + 60);
  assert(win.includes("type === 'PIPELINE'"), 'child must be PIPELINE-typed to be structurally required');
});
test('B1.4: the throw stays OUTSIDE every try (loud, never swallowed into a catch)', () => {
  // Asserts the PROPERTY, not a position. The prior form compared the throw against the
  // FIRST `try {` in the file, which silently became a different try the moment an
  // unrelated guarded block (contract inheritance, 2026-08-26) was inserted above it —
  // a green invariant reported red while the code was correct. Brace-match every try
  // body and require the throw to be lexically outside all of them.
  // Anchor on the STATEMENT, not the message token: the token's first occurrence is the
  // explanatory comment two lines above, so a token-anchored pin measured the comment's
  // position and passed under mutation (verified 2026-08-26).
  const throwIdx = guardSrc.indexOf('throw new CanNeverRunError(');
  assert(throwIdx > 0, 'contract throw not found');
  assert(guardSrc.slice(throwIdx, throwIdx + 600).includes('INTERFACE_CONTRACT_MISSING'),
    'anchored statement is not the interface-contract throw');
  const bodies: Array<[number, number]> = [];
  for (let i = guardSrc.indexOf('try {'); i >= 0; i = guardSrc.indexOf('try {', i + 1)) {
    let depth = 0;
    let j = guardSrc.indexOf('{', i);
    const open = j;
    for (; j < guardSrc.length; j++) {
      if (guardSrc[j] === '{') depth++;
      else if (guardSrc[j] === '}' && --depth === 0) break;
    }
    bodies.push([open, j]);
  }
  const enclosing = bodies.find(([a, b]) => throwIdx > a && throwIdx < b);
  assert(!enclosing, `the contract throw is inside a try body at ${enclosing?.[0]} — it would be swallowed`);
});

// ── F16: frozen-cone fix (2026-07-16) — can-never-run marking + escalation wiring ──
// See cline_docs/reviews/f16-frozen-cone-2026-07-16/synthesis.md. Behavioral proof:
// scripts/test-f16-frozen-cone-behavioral.ts (dev DB).
const createSrc = fs.readFileSync(path.join(process.cwd(), 'lib/services/agent-execution-create.ts'), 'utf8');
const persistSrc = fs.readFileSync(path.join(process.cwd(), 'lib/services/task-can-never-run-persist.ts'), 'utf8');
// The forward-cone walk was extracted to its own prisma-free module (2026-07-16, R4) so
// execution-terminal-persist can share it without dragging lib/prisma into pure-mock persist tests.
const coneSrc = fs.readFileSync(path.join(process.cwd(), 'lib/services/mark-forward-cone.ts'), 'utf8');
const readySrc = fs.readFileSync(path.join(process.cwd(), 'lib/services/taskReadyReactorService.ts'), 'utf8');
const retriggerSrc = fs.readFileSync(path.join(process.cwd(), 'lib/services/pipelineRetriggerReactorService.ts'), 'utf8');
const resolverSrc = fs.readFileSync(path.join(process.cwd(), 'lib/services/harnessModeResolver.ts'), 'utf8');

test('F16.1: guard throws the TYPED CanNeverRunError (permanent taxonomy), message keeps INTERFACE_CONTRACT_MISSING', () => {
  assert(guardSrc.includes('throw new CanNeverRunError('), 'must throw the typed class, not a raw Error');
  assert(guardSrc.includes("'missing-interface-contract'"), 'reasonCode missing');
});
test('F16.2: chokepoint catches CanNeverRunError → handleCanNeverRunTask → RETHROWS the original', () => {
  assert(createSrc.includes('instanceof CanNeverRunError'), 'typed catch missing at chokepoint');
  assert(createSrc.includes('handleCanNeverRunTask'), 'marking helper not invoked');
  assert(createSrc.includes('throw prepErr'), 'original refusal must be rethrown (loud-fail contract)');
});
test('F16.3: helper marks the transitive forward cone in ONE tx and fires the retrigger POST-commit', () => {
  assert(coneSrc.includes('WITH RECURSIVE cone'), 'cone walk must be transitive (Node C is 2 hops)');
  assert(coneSrc.includes('blockedByUpstreamFailure'), 'cone honesty metadata missing');
  const txEnd = persistSrc.lastIndexOf('});', persistSrc.indexOf('maybeRetriggerPipelineHarness'));
  assert(persistSrc.indexOf('maybeRetriggerPipelineHarness') > txEnd, 'retrigger must fire after the transaction');
  assert(/flipped\.count === 0/.test(persistSrc), 'idempotency gate missing (duplicate refusals must be no-ops)');
});
test('F16.4: cone walk is FORWARD-ONLY + stage-scoped (upstream parked gates structurally excluded); downstream cone gates ARE marked (no agentTemplateId filter — else pipeline→gate→pipeline re-hangs)', () => {
  const cteIdx = coneSrc.indexOf('WITH RECURSIVE cone');
  const win = coneSrc.slice(cteIdx, cteIdx + 900);
  assert(win.includes('WHERE td."dependsOnId" = ${failedTaskId}'), 'cone seed must walk dependents-of the refused task (forward), never dependencies-of');
  assert(win.includes('stage_id ='), 'cone must be stage-scoped');
  assert(!win.includes('"agentTemplateId" IS NOT NULL'), 'template filter must NOT be in the cone query — a downstream template-less gate left OPEN keeps Guard 4 unsatisfied (the v1.0.2 multi-gate topology hang)');
  assert(coneSrc.includes('depth <'), 'cone walk must be depth-bounded');
});
test('F16.5: ready-reactor never re-selects a can-never-run (FAILED) task', () => {
  assert(readySrc.includes(`IS DISTINCT FROM 'FAILED'`), 're-selection filter missing (loop belt-and-suspenders)');
});
test('F16.6: terminal predicates UNTOUCHED — Guard 4 + mode resolver keep COMPLETED-or-executionStatus-FAILED verbatim', () => {
  assert(retriggerSrc.includes(`{ executionStatus: { notIn: ['FAILED'] } }`), 'Guard 4 predicate changed — F16 chose the cascade precisely to avoid this');
  assert(resolverSrc.includes(`c.status === 'COMPLETED' || c.executionStatus === 'FAILED'`), 'resolver predicate changed — must stay verbatim');
});

console.log(`\n${'='.repeat(45)}\nResults: ${passed} passed, ${failed} failed\n${'='.repeat(45)}`);
process.exit(failed > 0 ? 1 : 0);
