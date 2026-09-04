#!/usr/bin/env ts-node
/**
 * Reactor Race Guard Tests — Concern A (agent.assign × agent.execute race)
 *
 * Layer 1 pattern validation for the L1 (harness-skip) + L2 (executionStatus
 * claim check) guards that prevent duplicate PENDING agent_executions rows.
 *
 * If anyone removes or weakens these guards in the future, this test fails
 * loudly — protecting against regression of the 2026-04-16 smoke-test finding
 * on task cmo10k1cp0001yxlgn6b61ll6.
 *
 * Created: 2026-04-18
 * Plan: cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md §1, §2
 * Related: event-system-specialist-review.md §F5 (9-cell state-space table)
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🏁 Reactor Race Guard Tests (L1 + L2 pattern validation)\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    failed++;
  }
}

function expect(value: any) {
  return {
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected string to contain "${substring}"`);
      }
    },
    toMatch(re: RegExp) {
      if (typeof value !== 'string' || !re.test(value)) {
        throw new Error(`Expected string to match ${re}`);
      }
    },
  };
}

const REPO_ROOT = path.resolve(__dirname, '..');

const assignHandlerSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/mcp/tasks/action/handlers/agent/agent-assign-handler.ts'),
  'utf-8'
);
const reactorSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/taskReadyReactorService.ts'),
  'utf-8'
);
const retriggerSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/pipelineRetriggerReactorService.ts'),
  'utf-8'
);
const skipCounterSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/reactor-skip-counter.ts'),
  'utf-8'
);

// ========================================
// L1 — agent-assign-handler.ts: skip maybeQueueIfDepFree for PIPELINE tasks
// ========================================

console.log('--- L1: harness-skip in agent-assign-handler.ts ---\n');

test('L1.1: maybeQueueIfDepFree call is wrapped in task.type !== PIPELINE guard', () => {
  // The guard must wrap the dynamic-import + call. If the conditional is
  // removed, the assign×execute race re-opens on harness tasks.
  expect(assignHandlerSource).toMatch(
    /if\s*\(\s*task\.type\s*!==\s*['"]PIPELINE['"]\s*\)/
  );
});

test('L1.2: skip branch emits structured log for observability', () => {
  // The else branch MUST log the skip — silent skips break debuggability.
  expect(assignHandlerSource).toContain('Skipped maybeQueueIfDepFree for harness task');
});

test('L1.3: guard references the plan and §L1', () => {
  // Forward-reference to the plan document so future readers find context.
  expect(assignHandlerSource).toContain(
    'cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md'
  );
});

test('L1.4: the dynamic import of maybeQueueIfDepFree is inside the guard block', () => {
  // Structural check: the import must be inside the `if (task.type !== 'PIPELINE')`
  // block, not outside (which would still fire for PIPELINE tasks). Ordering +
  // proximity check (destructuring braces make a pure-regex block match fragile).
  const guardMatch = assignHandlerSource.match(/if\s*\(\s*task\.type\s*!==\s*['"]PIPELINE['"]\s*\)/);
  if (!guardMatch || guardMatch.index === undefined) {
    throw new Error('Could not locate L1 guard');
  }
  const importIdx = assignHandlerSource.indexOf(
    "import('@/lib/services/taskReadyReactorService')",
    guardMatch.index
  );
  if (importIdx < 0) {
    throw new Error('Dynamic import not found after the guard');
  }
  const distance = importIdx - guardMatch.index;
  if (distance > 200) {
    throw new Error(
      `Dynamic import too far from guard (${distance} chars) — may be outside the guard block`
    );
  }
});

// ========================================
// L2 — taskReadyReactorService.ts: skip when task.executionStatus is already claimed
// ========================================

console.log('\n--- L2: claim-check in taskReadyReactorService.ts ---\n');

test('L2.1: task fetch selects executionStatus (required for L2 check)', () => {
  // Without this field in the select clause, the L2 check would read
  // undefined and the guard would be a no-op.
  expect(reactorSource).toMatch(/executionStatus:\s*true/);
});

test('L2.2: check blocks PENDING status', () => {
  expect(reactorSource).toMatch(/task\.executionStatus\s*===\s*['"]PENDING['"]/);
});

test('L2.3: check blocks RUNNING status', () => {
  expect(reactorSource).toMatch(/task\.executionStatus\s*===\s*['"]RUNNING['"]/);
});

test('L2.4: check blocks READY status (scheduledFor executions)', () => {
  // READY is set by agentTaskService.ts:327 and the execute route for
  // scheduled executions. Blocking it prevents races with near-due schedules.
  expect(reactorSource).toMatch(/task\.executionStatus\s*===\s*['"]READY['"]/);
});

test('L2.5: early-exit log includes task-already-claimed reason for grepability', () => {
  // §5.F.6 monitoring greps on this reason string.
  expect(reactorSource).toContain("'task-already-claimed'");
});

test('L2.6: log message distinguishes this skip from agent_executions-based skip', () => {
  // Two distinct reactor-skip reasons must be grep-distinguishable in prod logs.
  expect(reactorSource).toContain(
    "'Reactor skipped: task already claimed by another path'"
  );
  expect(reactorSource).toContain(
    "'Reactor skipped: task already has an execution'"
  );
});

test('L2.7: guard placement — L2 check comes BEFORE the agent_executions findFirst', () => {
  // Per event-system F6, placing the cheap in-memory check before the DB
  // roundtrip is the optimal order.
  const l2Position = reactorSource.indexOf("'task-already-claimed'");
  const existingCheckPosition = reactorSource.indexOf("'already-has-execution'");
  if (l2Position < 0 || existingCheckPosition < 0) {
    throw new Error('Could not locate both skip markers in source');
  }
  if (l2Position >= existingCheckPosition) {
    throw new Error(
      `L2 check must precede agent_executions findFirst (L2 at ${l2Position}, existing at ${existingCheckPosition})`
    );
  }
});

test('L2.8: guard references the plan and §L2', () => {
  expect(reactorSource).toContain(
    'cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md'
  );
});

// ========================================
// D-4 — pipelineRetriggerReactorService.ts: per-harness reactor-generation budget (Guard 8)
//       + reactor-skip-counter.ts: logReactorBudgetSkip
// ========================================

console.log('\n--- D-4: reactor-generation budget (Guard 8) ---\n');

test('D4.1: budget const reads MAX_HARNESS_REACTOR_GENERATIONS from env, default 10', () => {
  expect(retriggerSource).toMatch(
    /MAX_HARNESS_REACTOR_GENERATIONS\s*=\s*Number\(\s*process\.env\.MAX_HARNESS_REACTOR_GENERATIONS\s*\?\?\s*10\s*\)/
  );
});

test('D4.2: counter read ONLY from a reactor prior (C3 client-injection defense)', () => {
  // A non-reactor prior (original interactive CREATE) may carry a client-injected
  // reactorGeneration via body.context — it MUST be treated as 0.
  expect(retriggerSource).toMatch(
    /source\s*===\s*['"]reactor-pipeline-retrigger['"]\s*\?\s*Number\(\s*priorContext\?\.reactorGeneration\s*\?\?\s*0\s*\)\s*:\s*0/
  );
});

test('D4.3: budget refusal compares priorGeneration >= MAX_HARNESS_REACTOR_GENERATIONS', () => {
  expect(retriggerSource).toMatch(/priorGeneration\s*>=\s*MAX_HARNESS_REACTOR_GENERATIONS/);
});

test('D4.4: refusal path calls logReactorBudgetSkip', () => {
  expect(retriggerSource).toContain("logReactorBudgetSkip('pipeline-retrigger'");
});

test('D4.5: incremented generation is persisted via contextExtras', () => {
  expect(retriggerSource).toMatch(/reactorGeneration:\s*nextGeneration/);
});

test('D4.6: Guard 8 precedes buildRichExecutionConfig (budget-exhausted does no config work)', () => {
  const guardPos = retriggerSource.indexOf('priorGeneration >= MAX_HARNESS_REACTOR_GENERATIONS');
  const buildPos = retriggerSource.indexOf('buildRichExecutionConfig(harnessId');
  if (guardPos < 0 || buildPos < 0) {
    throw new Error('Could not locate Guard 8 and the config-build call');
  }
  if (guardPos >= buildPos) {
    throw new Error(
      `Guard 8 must precede buildRichExecutionConfig (guard at ${guardPos}, build at ${buildPos})`
    );
  }
});

test('D4.7: Guard 8 documents the BC67 monotonicity dependency', () => {
  expect(retriggerSource).toMatch(/BC67|one active execution per harness task/);
});

test('D4.8: logReactorBudgetSkip namespaces its counter key with :budget', () => {
  expect(skipCounterSource).toMatch(/`\$\{reactorSource\}:budget`/);
});

test('D4.9: budget skip carries HARNESS_GENERATION_BUDGET_EXCEEDED errorCode', () => {
  expect(skipCounterSource).toContain("errorCode: 'HARNESS_GENERATION_BUDGET_EXCEEDED'");
});

test('D4.10: budget skip does NOT carry securityEvent (benign runaway-guard, mirrors duplicate skip)', () => {
  // Slice the logReactorBudgetSkip function body and assert securityEvent is absent —
  // it is a FACT signal, not an integrity violation (unlike logReactorMismatchSkip).
  const fnStart = skipCounterSource.indexOf('export function logReactorBudgetSkip');
  if (fnStart < 0) throw new Error('logReactorBudgetSkip not found');
  const fnEnd = skipCounterSource.indexOf('\n}', fnStart);
  const body = skipCounterSource.slice(fnStart, fnEnd);
  if (/securityEvent/.test(body)) {
    throw new Error(
      'logReactorBudgetSkip must NOT set securityEvent — it is a benign runaway-guard, not an integrity violation'
    );
  }
});

// ========================================
// CC1 — nested-program retrigger (2026-07-15, program-harness design)
// Guard 2's blanket PIPELINE type-skip blocked a completing CHILD pipeline from
// retriggering its PARENT program harness. It was replaced with a post-Guard-3
// self-ID check. These pins prevent the blanket skip from being reintroduced.
// See cline_docs/reviews/program-architect-design-2026-07-15/design-proposal.md CC1.
// ========================================

console.log('\n--- CC1: nested-program retrigger in pipelineRetriggerReactorService.ts ---\n');

test('CC1.1: the blanket PIPELINE type-skip is GONE (a child pipeline may retrigger its parent)', () => {
  // The old form: `if (completed.type === 'PIPELINE') { return; }` — must not exist in CODE.
  // Strip //-comments first: the removal tombstone comment legitimately quotes the old form.
  const codeOnly = retriggerSource.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  if (/if\s*\(\s*completed\.type\s*===\s*'PIPELINE'\s*\)\s*\{?\s*\n?\s*return/.test(codeOnly)) {
    throw new Error('Blanket completed.type===PIPELINE early-return has been reintroduced — this kills program-harness nesting (CC1)');
  }
});

test('CC1.2: the true self-trigger guard exists AFTER harness resolution', () => {
  expect(retriggerSource).toContain('harness.id === completedTaskId');
});

test('CC1.3: the self-trigger guard fires AFTER Guard 3 resolves the harness (ordering)', () => {
  const guard3 = retriggerSource.indexOf("metadata->>'pipelineStageId'");
  const selfGuard = retriggerSource.indexOf('harness.id === completedTaskId');
  if (guard3 < 0 || selfGuard < 0 || selfGuard < guard3) {
    throw new Error('Self-ID guard must come after the Guard-3 harness lookup');
  }
});

test('CC1.4: degenerate self-reference logs loud (warn), never a silent return', () => {
  const selfGuard = retriggerSource.indexOf('harness.id === completedTaskId');
  const window = retriggerSource.slice(selfGuard, selfGuard + 600);
  expect(window).toContain('log.warn');
});

// ========================================
// Finding 9 (2026-07-15, T3 stale-chain): task-complete-handler defers the
// TaskReady reactor for PIPELINE tasks completed MID-EXECUTION (their
// deliverable artifacts don't exist until the SYNTHESIZE execution's terminal
// persist, which re-fires the reactor post-commit). Gates/manual completes
// (no active execution) keep the immediate fire — the human gate-release
// path depends on it.
// ========================================

// P2 wave 2 (2026-07-24): the F9 deferral moved VERBATIM into the shared completion core
// (fireCompletionEffects tail, complete-task-terminally.ts) so ALL adapters inherit it —
// these pins retarget with it (string-pinned-tests rule: pins migrate with the code).
const completionCoreSource = fs.readFileSync(
  path.join(process.cwd(), 'lib/tasks/services/complete-task-terminally.ts'),
  'utf-8'
);

test('F9.1: PIPELINE branch gates the TaskReady fire on an active-execution count (PENDING/RUNNING)', () => {
  const branch = completionCoreSource.indexOf("if (fact.taskType === 'PIPELINE')");
  if (branch < 0) throw new Error('PIPELINE deferral branch missing from the completion core tail');
  const window = completionCoreSource.slice(branch, branch + 1200);
  expect(window).toContain("status: { in: ['PENDING', 'RUNNING'] }");
  expect(window).toContain('deferred to terminal persist');
});

test('F9.2: deferral is LOUD (info log), never a silent skip', () => {
  const branch = completionCoreSource.indexOf("if (fact.taskType === 'PIPELINE')");
  const window = completionCoreSource.slice(branch, branch + 1200);
  expect(window).toContain('log.info');
});

test('F9.3: count-failure falls back to the immediate fire (at-least-once, never never)', () => {
  const branch = completionCoreSource.indexOf("if (fact.taskType === 'PIPELINE')");
  const window = completionCoreSource.slice(branch, branch + 1600);
  const fallbackWindow = window.slice(window.indexOf('Count failed'));
  if (!fallbackWindow.includes('maybeQueueReadyDependents(taskId)') || !fallbackWindow.includes('log.warn')) {
    throw new Error('count-failure fallback must WARN loudly and still fire maybeQueueReadyDependents');
  }
});

test('F9.4: non-PIPELINE tasks keep the unconditional immediate fire (gate releases)', () => {
  const branch = completionCoreSource.indexOf("if (fact.taskType === 'PIPELINE')");
  const elseWindow = completionCoreSource.slice(branch, branch + 2200);
  const elseIdx = elseWindow.indexOf('} else {');
  if (elseIdx < 0 || !elseWindow.slice(elseIdx, elseIdx + 200).includes('maybeQueueReadyDependents(taskId)')) {
    throw new Error('non-PIPELINE else-branch must fire maybeQueueReadyDependents immediately');
  }
});

test('F9.6: ALL THREE engine direct-flip sites (startup reaper, 20-min sweep, poller safety net) fire the guarded TaskReady reactor — the stranded-dependents holes from the F9 reviews', () => {
  const engineSource = fs.readFileSync(
    path.join(process.cwd(), 'lib/services/agentExecutionEngine.ts'),
    'utf-8'
  );
  const fires = engineSource.split("await import('./taskReadyReactorService')").length - 1;
  if (fires < 3) {
    throw new Error(`expected >=3 reaper-side TaskReady fires (startup + sweep + safety-net), found ${fires} — a direct FAILED flip without the fire strands a mid-execution-completed PIPELINE's dependents forever`);
  }
  expect(engineSource).toContain('Finding 9 safety net');
});

test('F9.5: the retrigger reactor stays immediate and unconditional in the core tail', () => {
  const fireBlock = completionCoreSource.slice(
    completionCoreSource.indexOf('maybeRetriggerPipelineHarness(taskId)'),
    completionCoreSource.indexOf("if (fact.taskType === 'PIPELINE')")
  );
  expect(fireBlock).toContain('.catch(() => {})');
});

// ========================================
// E1 — gap (e) born-ready fix (2026-07-18): maybeQueueIfDepFree queues tasks
// created with ALL deps already satisfied, via the SAME predicate the
// dep-completion reactor uses — with PIPELINE tasks explicitly excluded (CC6).
// ========================================

console.log('\n--- E1: born-ready create/assign path (gap (e)) ---\n');

test('E1.1: shared unsatisfied-dep predicate exists (single definition of "satisfied")', () => {
  expect(reactorSource).toContain('function unsatisfiedDepExistsSql');
});

test('E1.2: dep-completion query consumes the shared predicate (no inline drift copy)', () => {
  expect(reactorSource).toMatch(/AND NOT \$\{unsatisfiedDepExistsSql\(Prisma\.sql`t\.id`\)\}/);
});

test('E1.3: born-ready check consumes the shared predicate with the param form', () => {
  expect(reactorSource).toMatch(
    /SELECT \$\{unsatisfiedDepExistsSql\(Prisma\.sql`\$\{taskId\}`\)\} AS "hasUnsatisfied"/
  );
});

test('E1.4: F18 settledness clause lives inside the shared predicate', () => {
  // 2026-07-24 (completion-path P1-C1): the clause is factored into upstreamUnsatisfiedCondSql,
  // composed by BOTH unsatisfiedDepExistsSql and the exported listUnsatisfiedDeps — still ONE
  // source; this pin follows the clause to the factored helper and asserts the composition.
  const condStart = reactorSource.indexOf('function upstreamUnsatisfiedCondSql');
  if (condStart < 0) throw new Error('upstreamUnsatisfiedCondSql (factored F18 home) missing');
  const condEnd = reactorSource.indexOf('\n}', condStart);
  const condBody = reactorSource.slice(condStart, condEnd);
  if (!/upstream\.type = 'PIPELINE'/.test(condBody) || !/'PENDING', 'RUNNING'/.test(condBody)) {
    throw new Error('F18 PIPELINE-settledness clause missing from shared predicate condition');
  }
  const predStart = reactorSource.indexOf('function unsatisfiedDepExistsSql');
  const predEnd = reactorSource.indexOf('\n}', predStart);
  const predBody = reactorSource.slice(predStart, predEnd);
  if (!/\$\{upstreamUnsatisfiedCondSql\(\)\}/.test(predBody)) {
    throw new Error('unsatisfiedDepExistsSql must compose upstreamUnsatisfiedCondSql (single source)');
  }
});

test('E1.5: PIPELINE tasks with deps keep the blanket skip (CC6 — dep-completion only)', () => {
  expect(reactorSource).toContain("'pipeline-with-deps'");
});

test('E1.6: PIPELINE guard precedes the born-ready SQL (no satisfaction query for pipelines)', () => {
  const guardPos = reactorSource.indexOf("'pipeline-with-deps'");
  const queryPos = reactorSource.indexOf('AS "hasUnsatisfied"');
  if (guardPos < 0 || queryPos < 0) throw new Error('Could not locate guard and query');
  if (guardPos >= queryPos) {
    throw new Error(`PIPELINE guard must precede born-ready SQL (guard ${guardPos}, query ${queryPos})`);
  }
});

test('E1.7: born-ready gate is fail-closed (queues only on an explicit false)', () => {
  // A missing row / null / undefined must SKIP, not queue — hence !== false.
  expect(reactorSource).toMatch(/hasUnsatisfied !== false/);
});

test('E1.8: born-ready executions carry a distinct reason fact (Protocol 10)', () => {
  expect(reactorSource).toContain("'born-ready-deps-already-satisfied'");
  expect(reactorSource).toContain("'dep-free-initial-wave'");
});

// ========================================
// E2 — gap (e) task.update door (2026-07-18, td-review A3): dependency rewrite /
// template attach on update fires maybeQueueIfDepFree post-commit, with the
// L1-mirroring call-site PIPELINE skip.
// ========================================

console.log('\n--- E2: born-ready update path (gap (e) task.update door) ---\n');

const updateHandlerSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/mcp/tasks/action/handlers/task/task-update-handler.ts'),
  'utf-8'
);

test('E2.1: update handler fires maybeQueueIfDepFree on dep rewrite or template attach', () => {
  expect(updateHandlerSource).toMatch(
    /\(\s*hasDependencyUpdate\s*\|\|\s*updateData\.agentTemplateId\s*!==\s*undefined\s*\)/
  );
  expect(updateHandlerSource).toContain("import('@/lib/services/taskReadyReactorService')");
});

test('E2.5: update-path fire refuses executionStatus=FAILED (frozen-cone un-terminalize guard)', () => {
  // es-review delta ADVISORY (2026-07-18): a dep rewrite on an OPEN+FAILED cone
  // member must not silently re-queue it — re-enabling is explicit agent.execute.
  expect(updateHandlerSource).toMatch(/task\?\.executionStatus\s*!==\s*['"]FAILED['"]/);
});

test('E2.2: update-path call site skips PIPELINE tasks (mirrors L1)', () => {
  expect(updateHandlerSource).toMatch(/task\?\.type\s*!==\s*['"]PIPELINE['"]/);
  expect(updateHandlerSource).toContain('Skipped maybeQueueIfDepFree for harness task on update');
});

test('E2.3: the fire is post-commit (after the $transaction block resolves)', () => {
  const txEnd = updateHandlerSource.indexOf("'task-update-handler:handleTaskUpdate'");
  const fireIdx = updateHandlerSource.indexOf("import('@/lib/services/taskReadyReactorService')");
  if (txEnd < 0 || fireIdx < 0) throw new Error('Could not locate tx boundary and reactor fire');
  if (fireIdx <= txEnd) {
    throw new Error(`Reactor fire must be post-commit (tx at ${txEnd}, fire at ${fireIdx})`);
  }
});

test('E2.4: fire is fire-and-forget (both promise layers caught)', () => {
  const fireIdx = updateHandlerSource.indexOf("import('@/lib/services/taskReadyReactorService')");
  const block = updateHandlerSource.slice(fireIdx, fireIdx + 250);
  const catches = (block.match(/\.catch\(\(\) => \{\}\)/g) || []).length;
  if (catches < 2) {
    throw new Error(`Expected 2 .catch(() => {}) layers on the update-path fire, found ${catches}`);
  }
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=====================================');

if (failed > 0) {
  process.exit(1);
}
