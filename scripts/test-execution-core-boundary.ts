/**
 * test-execution-core-boundary — Phase-6 core/adapter contract pins (2026-07-05).
 *
 * Source-pattern gate for lib/services/execution-core.ts (runExecutionCore) and its engine adapter.
 * These are the panel-required NEW tripwires (phase-6-confidence-assessment.md):
 *   C-4  — the core does ZERO create / status-claim / hydration (it starts AFTER the claim).
 *   REACTOR — reactor/prune are THREADED params, not hardcoded literals (a literal = accidental Flip 1).
 *   ORDER — the post-loop order (AE6-I1) is cap → #90 retry → quality → persist, load-bearing.
 *   SEAM — the happy-path core does not own the failure catch or the engine activity log.
 */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
function test(description: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${description}`); }
  catch (e) { failed++; console.log(`❌ ${description}\n   ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// Strip comments so the pattern pins match CODE, not the module's own docstrings (which name the
// very anti-patterns they forbid). Block comments first, then full-line + trailing // comments.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"`])\/\/.*$/gm, '$1');
}
const coreSrc = stripComments(fs.readFileSync(path.join(__dirname, '../lib/services/execution-core.ts'), 'utf8'));
const engineSrc = stripComments(fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8'));
const streamSrc = stripComments(fs.readFileSync(path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts'), 'utf8'));
const persistSrc = stripComments(fs.readFileSync(path.join(__dirname, '../lib/services/execution-terminal-persist.ts'), 'utf8'));

// ---------- C-4: core starts AFTER the claim (zero create / claim / hydration) ----------
test('C-4: core contains no agentExecution.create', () => {
  assert(!/agentExecution\.create\b/.test(coreSrc), 'runExecutionCore must not create executions (C-4)');
});
test('C-4: core writes no status-claim (RUNNING/PENDING)', () => {
  assert(!/status:\s*'(RUNNING|PENDING)'/.test(coreSrc), 'runExecutionCore must not write a status claim (C-4)');
  assert(!/updateMany\(/.test(coreSrc), 'runExecutionCore must not CAS-claim via updateMany (C-4)');
});
test('C-4: core does no hydration (loadExecutionContext / EXECUTION_*_SELECT/INCLUDE)', () => {
  assert(!/EXECUTION_TEMPLATE_SELECT|EXECUTION_TASK_CONTEXT_INCLUDE|loadExecutionContext/.test(coreSrc),
    'runExecutionCore must not hydrate — the adapter does that pre-claim/pre-create (AE-I1)');
});

// ---------- REACTOR/PRUNE: threaded params, never hardcoded (a literal = accidental Flip 1) ----------
test('REACTOR: core THREADS fireReactors/prune (no hardcoded literal in the persist call)', () => {
  assert(/fireReactors,/.test(coreSrc), 'core must pass fireReactors as a threaded param (shorthand)');
  assert(/\bprune,/.test(coreSrc), 'core must pass prune as a threaded param (shorthand)');
  assert(!/fireReactors:\s*(true|false)/.test(coreSrc),
    'core must NOT hardcode fireReactors — a literal true = accidental Flip 1 (stream autonomous billing); false = harness never SYNTHESIZEs');
  assert(!/prune:\s*(true|false)/.test(coreSrc), 'core must NOT hardcode prune — it THREADS the param; both adapters now supply true (converged)');
});
test('REACTOR: engine adapter supplies its transitional values (true/true) to the core', () => {
  assert(/prune:\s*true/.test(engineSrc) && /fireReactors:\s*true/.test(engineSrc),
    'engine adapter must pass prune:true + fireReactors:true (transitional; preserves pre-4b behavior)');
});
test('REACTOR: stream adapter supplies fireReactors:true (Flip 1) + prune:true (Flip 2 SHIPPED — fully converged)', () => {
  // Flip 1 (2026-07-06): the stream now fires reactors like the engine — GUI runs are cascade entry points.
  // prune is INDEPENDENT and stays false (Flip 2 is separately Steve-gated); the split assertion proves
  // flipping fireReactors did NOT disturb prune's state.
  assert(/fireReactors:\s*true/.test(streamSrc),
    'stream adapter must pass fireReactors:true in its runExecutionCore call AND its persistTerminalFailure call (Flip 1)');
  assert(/prune:\s*true/.test(streamSrc),
    'stream adapter must pass prune:true — Flip 2 (PRUNE universal) SHIPPED; GUI prunes-on-complete like the engine');
  assert(!/prune:\s*false/.test(streamSrc),
    'stream adapter must NOT pass prune:false — Flip 2 is shipped, both transitional params are converged');
});

// ---------- REACTOR-FIRING SEMANTICS: success→both / failure→retrigger-only (Flip 1 asymmetry) ----------
// Origin-independent core policy in execution-terminal-persist.ts — the SAME asymmetry now governs BOTH
// adapters once the stream fires reactors (Flip 1). Comments are stripped, so these match real call sites
// (the module's own docstrings name maybeQueueReadyDependents, which would defeat an un-stripped match).
{
  const failIdx = persistSrc.indexOf('function persistTerminalFailure');
  assert(failIdx > 0, 'sanity: persistTerminalFailure must exist');
  const successRegion = persistSrc.slice(0, failIdx);
  const failureRegion = persistSrc.slice(failIdx);
  test('SEMANTICS: SUCCESS fires BOTH reactors (pipeline-retrigger + ready-dependents)', () => {
    assert(/maybeRetriggerPipelineHarness\s*\(/.test(successRegion), 'success must call maybeRetriggerPipelineHarness');
    assert(/maybeQueueReadyDependents\s*\(/.test(successRegion), 'success must call maybeQueueReadyDependents');
  });
  test('SEMANTICS: FAILURE fires the retrigger + the F9 TaskReady safety net (status-guarded — dependents still never queue off a NORMALLY-failed task)', () => {
    assert(/maybeRetriggerPipelineHarness\s*\(/.test(failureRegion), 'failure must call maybeRetriggerPipelineHarness');
    // Finding 9 (2026-07-15, es+ae reviews): failure ALSO fires maybeQueueReadyDependents as
    // the safety net for the task-complete deferral. The historic asymmetry ("no queueing off
    // a failure") is preserved INSIDE the reactor: it no-ops unless task.status==='COMPLETED',
    // and runTerminalFailureTx never sets task.status — so only the completed-then-crashed
    // PIPELINE case queues. The refined policy: "queue iff the TASK completed", not "never on
    // execution failure".
    assert(/maybeQueueReadyDependents/.test(failureRegion),
      'failure must fire the F9 TaskReady safety net (guarded by the reactor\'s COMPLETED-status check)');
    // (comment-presence pin lives in test-terminal-persist-shape, which reads RAW source —
    // persistSrc here is stripComments()'d, so prose cannot be asserted in this suite)
  });
  test('SEMANTICS: both reactor fires are gated behind if (input.fireReactors) (post-commit, fire-and-forget)', () => {
    assert((persistSrc.match(/if\s*\(\s*input\.fireReactors\s*\)/g) || []).length === 2,
      'exactly two fireReactors gates — one in persistTerminalSuccess, one in persistTerminalFailure');
  });
}

// ---------- STREAM ADAPTER input-assembly contracts (Phase 6b review findings F1/F1b) ----------
test('STREAM: extensions is a shared mutable ref (F1b) — mutated in onInitialResponse, not a call-site literal', () => {
  // A call-site object literal `extensions: { functionCall, … }` evaluates BEFORE the loop, freezing
  // the pre-loop nulls → result.json data loss + byte-diff vs the `?? undefined` omission. The adapter
  // must mutate a shared ref inside the loop observer instead (bc F1b / ae #1).
  assert(/extensions\.functionCall = response\.functionCall \?\? undefined/.test(streamSrc),
    'stream must mutate the shared extensions ref in onInitialResponse (F1b) — the `?? undefined` coercion is load-bearing');
  assert(!/extensions:\s*\{/.test(streamSrc),
    'stream must NOT pass extensions as a call-site object literal — that freezes pre-loop nulls (F1b)');
});
test('STREAM: buildSuccessLogs MUTATES + returns the shared logs array (F1)', () => {
  // A copy-return (`[...logs, …]`) leaves the shared array short → the final post-commit SSE log_update
  // AND the persisted agentExecution.logs byte-diff. Must push+return the same reference (bc F1, charge C).
  assert(/buildSuccessLogs:\s*\(\)\s*=>\s*\{[^}]*logs\.push\([^}]*return logs[^}]*\}/.test(streamSrc),
    'stream buildSuccessLogs must push to AND return the shared logs array (mutate, not copy) — F1');
});

// ---------- ORDER: post-loop is cap → #90 retry → quality → persist (AE6-I1) ----------
test('ORDER: cap → runDiagnosticRetry → assessExecutionQuality → persistTerminalSuccess (live order)', () => {
  const iCap = coreSrc.indexOf('applyConfidenceCap(');
  const iRetry = coreSrc.indexOf('runDiagnosticRetry(');
  const iQuality = coreSrc.indexOf('assessExecutionQuality(');
  const iPersist = coreSrc.indexOf('persistTerminalSuccess(');
  assert(iCap > 0 && iRetry > 0 && iQuality > 0 && iPersist > 0, 'all four stages must be present in the core');
  assert(iCap < iRetry, 'applyConfidenceCap must precede runDiagnosticRetry');
  assert(iRetry < iQuality, 'runDiagnosticRetry must precede assessExecutionQuality (#90 mutates finalResponse; quality reads it)');
  assert(iQuality < iPersist, 'assessExecutionQuality must precede persistTerminalSuccess');
});

// ---------- SEAM: happy-path core does NOT own the failure catch or the engine activity log ----------
test('SEAM: core owns SUCCESS persist only — no persistTerminalFailure / buildErrorJson', () => {
  assert(!/persistTerminalFailure|buildErrorJson/.test(coreSrc),
    'the failure path stays adapter-side (persistTerminalFailure + F-1 rethrow); the core throws');
  assert(/persistTerminalSuccess\(/.test(coreSrc), 'core must own persistTerminalSuccess');
});
test('SEAM: engine adapter keeps the failure catch (persistTerminalFailure + rethrow)', () => {
  assert(/persistTerminalFailure\(/.test(engineSrc), 'engine adapter must retain persistTerminalFailure in its catch');
  assert(/throw error;/.test(engineSrc), 'engine adapter must retain the F-1 original-error rethrow');
});
test('SEAM: engine adapter no longer runs the loop inline (moved to the core)', () => {
  assert(!/runAgenticToolLoop\(/.test(engineSrc), 'the tool loop must run in the core, not inline in the engine');
  assert(/runExecutionCore\(/.test(engineSrc), 'engine adapter must call runExecutionCore');
});
test('SEAM: core does not own the engine activity log (adapter-only)', () => {
  assert(!/logAgentExecution/.test(coreSrc), 'logAgentExecution is engine-adapter-only (fires via onExecutionCompleted)');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
