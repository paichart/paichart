#!/usr/bin/env ts-node
/**
 * FAILED-Persist CAS Tests — convergence Phase 4a
 *
 * Guards the crash-only invariant: EVERY site that flips an execution to FAILED
 * must do so with a compare-and-set (`status IN (PENDING, RUNNING)`), so a throw
 * AFTER the SUCCESS tx commits can never overwrite the committed SUCCESS row, and
 * a real failure persists exactly ONCE (whichever site flips first wins; the rest
 * find a terminal row and no-op).
 *
 * FAILED-persist sites after the Phase-4b extraction, all must be CAS:
 *   1. runTerminalFailureTx           (lib/services/execution-terminal-persist.ts —
 *      the ONE terminal FAILURE tx; executeAgent's catch AND the stream route call it)
 *   2. poller safety-net              (lib/services/agentExecutionEngine.ts)
 *   3. per-poll stale sweeper         (lib/services/agentExecutionEngine.ts)
 *   4. MCP background-dispatch .catch (lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts)
 *      — 2026-07-25: no longer a site of its own; routes through (1) with fireReactors:false
 *
 * Plus F-1 (Phase 4b): executeAgent must rethrow the ORIGINAL error when the
 * terminal persist itself throws, so the crash-only nets still fire.
 *
 * Runtime behavior (post-commit-throw → SUCCESS preserved; double-failure → single
 * persist) needs a DB and is validated by soak; this is the Layer-1 structural lock.
 * Runtime CAS hit/miss fixtures live in test-terminal-persist-shape.ts.
 *
 * Created: 2026-07-05 (retargeted for the Phase-4b extraction same day)
 * Plan: cline_docs/reviews/execution-path-convergence-2026-07-04/implementation-plan.md §Phase 4a/4b
 * Findings: agent-execution F-2 (+ bonus clobber), database-manager IMPORTANT-1, boundary P4-I-1, F-1
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🔒 FAILED-Persist CAS Tests (Phase 4a)\n');

let passed = 0;
let failed = 0;
function test(d: string, fn: () => void) {
  try { fn(); console.log(`✅ ${d}`); passed++; }
  catch (e) { console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   ${e.message}`); failed++; }
}

const engineSrc = fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');
const coreSrc = fs.readFileSync(path.join(__dirname, '../lib/services/execution-terminal-persist.ts'), 'utf8');
const mcpSrc = fs.readFileSync(path.join(__dirname, '../lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts'), 'utf8');

// The CAS shape: an updateMany whose where filters status to the non-terminal set.
const casRe = /updateMany\(\{\s*where:\s*\{\s*id:[^}]*status:\s*\{\s*in:\s*\[\s*'PENDING',\s*'RUNNING'\s*\]/;

test('engine: has TWO CAS FAILED-persist sites (poller safety-net + stale sweeper); executeAgent delegates to the core', () => {
  const matches = engineSrc.match(new RegExp(casRe.source, 'g')) || [];
  if (matches.length !== 2) throw new Error(`expected 2 CAS updateMany sites in the engine (Phase 4b moved executeAgent's into the core), found ${matches.length}`);
  if (!engineSrc.includes('await persistTerminalFailure(prisma, {')) {
    throw new Error("executeAgent's catch does not call the shared persistTerminalFailure");
  }
});

test('core: runTerminalFailureTx is the CAS shape with the count guard (4a survives the extraction)', () => {
  const matches = coreSrc.match(new RegExp(casRe.source, 'g')) || [];
  if (matches.length !== 1) throw new Error(`expected exactly 1 CAS updateMany in the core, found ${matches.length}`);
  const guards = (coreSrc.match(/if \(flipped\.count === 0\)/g) || []).length;
  if (guards !== 1) throw new Error(`expected 1 flipped.count===0 guard in the core, found ${guards}`);
});

test('engine+core: NO un-guarded FAILED persist via a plain tx.agentExecution.update remains', () => {
  // Every FAILED flip must go through updateMany+CAS. A bare `tx.agentExecution.update(`
  // whose data sets status:'FAILED' would be an un-guarded clobber site.
  const bareFailedUpdate = /tx\.agentExecution\.update\(\{[\s\S]{0,200}?status:\s*'FAILED'/g;
  for (const [name, src] of [['engine', engineSrc], ['core', coreSrc]] as const) {
    const hits = src.match(bareFailedUpdate) || [];
    if (hits.length > 0) throw new Error(`${name}: found ${hits.length} un-guarded FAILED persist(s) via tx.agentExecution.update`);
  }
});

test('engine: each CAS site gates its follow-on writes on flipped.count === 0 → skip', () => {
  const guards = (engineSrc.match(/if \(flipped\.count === 0\)/g) || []).length;
  if (guards !== 2) throw new Error(`expected 2 flipped.count===0 guards in the engine, found ${guards}`);
});

test('F-1: executeAgent absorbs a persist-crash and rethrows the ORIGINAL error (crash-only nets stay reachable)', () => {
  // The persist call is wrapped; the catch logs; `throw error` (the ORIGINAL) follows.
  // Swallowing or rethrowing persistError instead would LOSE failures.
  if (!/catch \(persistError\) \{[\s\S]{0,800}?\}\s*\n\s*throw error;/.test(engineSrc)) {
    throw new Error('F-1 shape missing: persistTerminalFailure not wrapped with a log-and-rethrow-original catch');
  }
});

// 2026-07-25 (error-surface panel): site 4 no longer hand-rolls the CAS — it routes through
// the ONE core persist, so it inherits the CAS, the error.json artifact (which it never wrote)
// and the errorCode column. These pins moved from "has its own CAS" to "delegates, correctly".
test('MCP handler: background-dispatch .catch delegates to the core persist (no hand-rolled CAS)', () => {
  if (!/await persistTerminalFailure\(prisma, \{/.test(mcpSrc)) {
    throw new Error('MCP .catch does not call the shared persistTerminalFailure');
  }
  if (casRe.test(mcpSrc)) {
    throw new Error('MCP .catch has re-grown an inline CAS updateMany — the duplicate this site was collapsed to remove');
  }
  if (/tx\.agentExecution\.update\(\{[\s\S]{0,120}?status:\s*'FAILED'/.test(mcpSrc)) {
    throw new Error('MCP .catch still has an un-guarded FAILED update');
  }
});

test('MCP handler: persist is called with fireReactors: false (the engine adapter already fired the retrigger)', () => {
  // persistTerminalFailure fires the pipeline retrigger even on a CAS MISS (deliberate —
  // preserves pre-4b engine behaviour). true here would double-fire it for one execution.
  const call = mcpSrc.match(/await persistTerminalFailure\(prisma, \{[\s\S]*?\n {10}\}\);/);
  if (!call) throw new Error('could not locate the persistTerminalFailure call site');
  if (!/fireReactors: false/.test(call[0])) {
    throw new Error('MCP dispatch persist does not pass fireReactors: false — double-fires the pipeline retrigger');
  }
});

test('MCP handler: ready-dependents fire is gated on result.persisted (a CAS miss means another site owns the tail)', () => {
  if (!/if \(result\.persisted\) \{[\s\S]{0,400}?maybeQueueReadyDependents\(taskId\)/.test(mcpSrc)) {
    throw new Error('Finding-9 TaskReady fire is missing or not gated on result.persisted');
  }
});

// ── F-3: dispatch-refusal must be a typed error the MCP .catch skips ──
const errorsSrc = fs.readFileSync(path.join(__dirname, '../lib/errors.ts'), 'utf8');
const engineSrc2 = fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');

test('F-3: ExecutionNotClaimableError exists and executeById throws it (not a plain Error)', () => {
  if (!errorsSrc.includes('class ExecutionNotClaimableError extends AppError')) {
    throw new Error('ExecutionNotClaimableError not defined');
  }
  if (!engineSrc2.includes('throw new ExecutionNotClaimableError(')) {
    throw new Error('executeById does not throw the typed error');
  }
  if (/throw new Error\(`Agent execution \$\{executionId\} is not in pending/.test(engineSrc2)) {
    throw new Error('executeById still throws a plain Error for the not-pending case');
  }
});

test('F-3: MCP .catch skips the FAILED persist for ExecutionNotClaimableError', () => {
  if (!mcpSrc.includes('err instanceof ExecutionNotClaimableError')) {
    throw new Error('MCP .catch does not distinguish the dispatch-refusal — would clobber the poller run');
  }
});

test('F-3 ORDER: the ExecutionNotClaimableError early return sits ABOVE the persist call', () => {
  // The CAS does NOT cover this case: the poller won the create→dispatch race and the row
  // genuinely IS RUNNING, so the CAS would MATCH and clobber a live execution. The guard is
  // the ONLY thing standing between us and the F-3 bug — order is the whole contract.
  const guardAt = mcpSrc.indexOf('err instanceof ExecutionNotClaimableError');
  const returnAt = mcpSrc.indexOf('return;', guardAt);
  const persistAt = mcpSrc.indexOf('await persistTerminalFailure(prisma, {');
  if (guardAt < 0 || returnAt < 0 || persistAt < 0) throw new Error('guard or persist call not found');
  if (!(guardAt < returnAt && returnAt < persistAt)) {
    throw new Error('ExecutionNotClaimableError guard no longer short-circuits above the persist — re-opens F-3 (clobbers a genuinely-RUNNING poller execution)');
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
