#!/usr/bin/env ts-node
/**
 * TEST-SERIALIZATION-RETRY: boundary + structure guard (2026-06-09)
 *
 * boundary-contract's regression guard: a retry re-runs the ENTIRE `fn`, so NO non-idempotent side-effect
 * (activity log / notification / SSE / external fetch) may live inside a `withSerializationRetry(() => ...)`
 * callback. This statically scans every wrap site and fails if a side-effect marker appears inside the wrapped
 * span. Plus structural asserts: the adapter delegates to `withRetry` (no forked loop) + the shared constant +
 * the jitter core. CI-safe (source scan, no prisma import).
 *
 * Run: npm run test:serialization-retry-boundary
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
const failures: string[] = [];
const pass = (m: string) => { passed++; console.log(`  ✅ ${m}`); };
const fail = (m: string, d?: string) => { failed++; failures.push(d ? `${m} — ${d}` : m); console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// Side-effects that MUST NOT appear inside a wrapped tx (they'd double-fire on retry).
// 2026-07-24 (completion-path P2, event-system §4 CI pin): reactor fires added — an in-tx
// reactor call reads pre-commit state via its own connection and silently LOSES the cascade.
const MARKERS = /logFieldChange|createTaskActivity|logStageFieldChange|sendAssigneeNotification|createNotification|pg_notify|\.emit\(|\bfetch\(|broadcast|maybeQueueReadyDependents|maybeRetriggerPipelineHarness|fireCompletionEffects|fireCompletionReactors|logTaskCompleted/;

// Paren-matched span of each `withSerializationRetry( ... )` call (the arrow fn + label arg).
function wrapSpans(src: string): string[] {
  const spans: string[] = [];
  const needle = 'withSerializationRetry(';
  let i = src.indexOf(needle);
  while (i !== -1) {
    let depth = 0;
    let j = i + needle.length - 1; // at the '('
    for (; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') { depth--; if (depth === 0) break; }
    }
    spans.push(src.slice(i, j + 1));
    i = src.indexOf(needle, j + 1);
  }
  return spans;
}

const WRAP_SITES = [
  'lib/tasks/services/task.ts',                                 // 2 wraps: updateTask + updateTaskDependencies (F3)
  'lib/mcp/tasks/action/handlers/task/task-update-handler.ts',
  'lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts',
  'lib/pov/services/phase.ts',                                  // 2 wraps: reorderPhases + reorderStages
  'lib/pov/handlers/post.ts',                                   // createPhase
  'app/api/pov/[povId]/phase/[phaseId]/stage/route.ts',         // createStage
  'lib/tasks/services/complete-task-terminally.ts',             // Layer 2 (completion-path P2)
];
// F3 (2026-07-25): 8 → 9. TaskService.updateTaskDependencies gained a wrap — its read+delete+create
// dependency rewrite used to run as three separate round-trips (crash window + TOCTOU), and edges
// became load-bearing when assertCompletionDependenciesSatisfied started enforcing them on human
// completion. The new span is side-effect-free by construction (two prisma calls + a debug log), so
// it satisfies Part A's marker scan.
const EXPECTED_TOTAL_WRAPS = 9; // task(2)+task-update(1)+agent-configure(1)+phase(2)+post(1)+stage-route(1)+completion-core(1)

console.log('\n🔁 TEST — serialization-retry boundary + structure\n');
console.log('── Part A: no side-effect inside any wrapped tx (boundary) ──\n');
let totalSpans = 0;
for (const site of WRAP_SITES) {
  const spans = wrapSpans(read(site));
  if (spans.length === 0) { fail(`A: ${site} — expected a withSerializationRetry wrap, found none`); continue; }
  totalSpans += spans.length;
  const dirty = spans.find(s => MARKERS.test(s));
  if (!dirty) pass(`A: ${site} — ${spans.length} wrap(s), no side-effect markers inside the tx`);
  else fail(`A: ${site} — side-effect marker INSIDE a wrapped tx (double-fire risk)`, (dirty.match(MARKERS) || [''])[0]);
}
if (totalSpans === EXPECTED_TOTAL_WRAPS) pass(`A: all ${EXPECTED_TOTAL_WRAPS} expected wrap sites present`);
else fail('A: wrap-site count drift', `${totalSpans} (expected ${EXPECTED_TOTAL_WRAPS})`);

console.log('\n── Part B: adapter delegates to withRetry (no forked loop) ──\n');
{
  const adapter = read('lib/database/serialization-retry.ts');
  if (/from '@\/lib\/auth\/oauth\/retry-utils'/.test(adapter) && /withRetry\(/.test(adapter)) pass('B1 adapter imports + calls the shared withRetry (no fork)');
  else fail('B1 adapter does not delegate to withRetry');
  if (/export const RETRYABLE_SQLSTATES[\s\S]*'40001'[\s\S]*'40P01'[\s\S]*'55P03'/.test(adapter)) pass('B2 shared RETRYABLE_SQLSTATES = {40001,40P01,55P03}');
  else fail('B2 shared SQLSTATE constant missing/wrong');
  // Scope the exclusion check to the Set LITERAL (the comment legitimately documents the excluded codes).
  const setLiteral = (adapter.match(/RETRYABLE_SQLSTATES[^=]*=\s*new Set\(\[([^\]]*)\]/) || [])[1] || '';
  if (setLiteral && !/53300|P2002|P2025|P2003/.test(setLiteral)) pass('B3 Set literal excludes 53300/P2002/P2025/P2003');
  else fail('B3 retryable Set literal includes a non-retryable code', setLiteral);
  if (/jitter:\s*'full'/.test(adapter)) pass("B4 serialization config uses FULL jitter");
  else fail('B4 not using full jitter');
  if (/maxTotalDelayMs:\s*750/.test(adapter)) pass('B5 maxTotalDelayMs cap present');
  else fail('B5 maxTotalDelayMs cap missing');
}

console.log('\n── Part C: jitter landed in the shared core (BC14) ──\n');
{
  const core = read('lib/auth/oauth/retry-utils.ts');
  if (/Math\.random\(\)/.test(core) && /function calculateDelay[\s\S]{0,400}Math\.random\(\)/.test(core)) pass('C1 calculateDelay now applies jitter (Math.random)');
  else fail('C1 calculateDelay still jitter-free (BC14 gap)');
  if (/jitter:\s*0\.2/.test(core)) pass('C2 OAuth default = ±20% jitter (BC14 compliance)');
  else fail('C2 OAuth ±20% default missing');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
console.log('✅ serialization-retry boundary + structure guard passed\n');
