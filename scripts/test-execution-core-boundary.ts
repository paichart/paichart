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

// ---------- Step B (2026-10-07): ONE reflection pass — #89 (in the loop) > form correction > #90 ----------
test('ORDER (Step B): runFormCorrection precedes onStoringResults and runDiagnosticRetry, and #90 is told an attempt happened', () => {
  const iLoop = coreSrc.indexOf('runAgenticToolLoop(');
  const iForm = coreSrc.indexOf('runFormCorrection(');
  const iStore = coreSrc.indexOf('observers.onStoringResults');
  const iRetry = coreSrc.indexOf('runDiagnosticRetry(');
  assert(iLoop > 0 && iForm > iLoop && iForm < iStore && iStore < iRetry, `order loop ${iLoop} < form ${iForm} < storing ${iStore} < #90 ${iRetry}`);
  assert((coreSrc.match(/runFormCorrection\(/g) || []).length === 1, 'exactly one form-correction call site');
  assert(/formCorrectionAttempted/.test(coreSrc.slice(iRetry, iRetry + 200)), '#90 call does not carry formCorrectionAttempted (the 5th disqualifier)');
  assert(!/runFormCorrection\(/.test(engineSrc) && !/runFormCorrection\(/.test(streamSrc), 'an adapter calls the form correction itself (one insertion must serve both paths)');
});

// ---------- F2 §3.3 (2026-09-25, register E1): the truncation fact reads the LOOP-EXIT stop reason ----------
// #90 REPLACES currentResponse with its reflection, so `currentResponse.stopReason` after #90 is the
// reflection's end_turn. On the 2026-09-24 reviewer incident that hid a max_tokens deliverable. Both
// consumers of the truncation fact must be handed the loop's own value.
test('F2-3.3: assessExecutionQuality AND buildExecutionResultJson receive loopResult.finalStopReason (not the post-#90 currentResponse)', () => {
  const qStart = coreSrc.indexOf('assessExecutionQuality({');
  const qWin = coreSrc.slice(qStart, coreSrc.indexOf('});', qStart));
  assert(/loopExitStopReason:\s*loopResult\.finalStopReason/.test(qWin),
    'the quality layer must classify truncation on loopResult.finalStopReason');
  const bStart = coreSrc.indexOf('buildExecutionResultJson({');
  const bWin = coreSrc.slice(bStart, coreSrc.indexOf('});', bStart));
  assert(/finalStopReason:\s*loopResult\.finalStopReason/.test(bWin),
    'the result.json builder must stamp loopResult.finalStopReason');
  assert(!/finalStopReason:\s*currentResponse/.test(bWin), 'the builder must never be handed the post-#90 stop reason');
});

// ---------- NTF-R4L1.3 (2026-09-25, register E1): the retry's deadline IS the watchdog's ----------
test('NTF-R4L1.3: deadlineAt is computed beside the watchdog setTimeout and passed into runAgenticToolLoop', () => {
  const iTimer = coreSrc.indexOf('setTimeout(() => executionAbort.abort()');
  assert(iTimer > 0, 'watchdog timer missing from the core');
  const before = coreSrc.slice(Math.max(0, iTimer - 200), iTimer);
  assert(/const deadlineAt = Date\.now\(\) \+ executionTimeoutMs;\s*const executionTimeout = $/.test(before),
    'deadlineAt must be computed on the line adjacent to the watchdog timer, from the SAME executionTimeoutMs');
  const lStart = coreSrc.indexOf('runAgenticToolLoop({');
  const lWin = coreSrc.slice(lStart, coreSrc.indexOf('}, {', lStart));
  assert(/\bdeadlineAt,/.test(lWin), 'deadlineAt must be passed in the runAgenticToolLoop input');
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

// ---------- COMPLETE-THEN-FAIL (2026-10-05, DESIGN-v2 §3): the catch around the LOOP, and only the loop ----------
const anchoredSrc = stripComments(fs.readFileSync(path.join(__dirname, '../lib/services/execution-completion-anchored.ts'), 'utf8'));
test('CTF-SEAM-1: the core catches the LOOP throw only and hands it to rescueOrRethrow; the post-loop cascade has no catch', () => {
  const loopIdx = coreSrc.indexOf('runAgenticToolLoop({');
  const catchIdx = coreSrc.indexOf('} catch (loopErr) {');
  const finIdx = coreSrc.indexOf('} finally {', catchIdx);
  assert(loopIdx > 0 && catchIdx > loopIdx && finIdx > catchIdx, 'try { loop } catch (loopErr) { … } finally { clearTimeout } shape');
  const catchBody = coreSrc.slice(catchIdx, finIdx);
  assert(/await rescueOrRethrow\(loopErr,/.test(catchBody), 'the catch delegates to rescueOrRethrow with the ORIGINAL error object');
  assert(/onExecutionCompleted\?\.\(/.test(catchBody) && /return;/.test(catchBody), 'a rescue resolves through the adapter success tail and returns');
  assert(!/\bthrow\b/.test(catchBody), "the catch has NO throw of its own — every rethrow is rescueOrRethrow's (the original object)");
  const afterFinally = coreSrc.slice(finIdx);
  assert(!/catch \(loopErr\)/.test(afterFinally), 'no second loop catch');
});
test('CTF-SEAM-2: the rescue never calls the text cascade (#90 / confidence parse / finalize / generateText)', () => {
  for (const sym of ['runDiagnosticRetry', 'parseConfidenceScore', 'applyConfidenceCap', 'finalizeTextForStopReason', 'generateText', 'computeSelfSupersession']) {
    assert(!new RegExp(`\\b${sym}\\(`).test(anchoredSrc), `execution-completion-anchored.ts must not call ${sym}`);
  }
  assert(/confidenceScore: null/.test(anchoredSrc) && /diagnosticRetryUsed: false/.test(anchoredSrc), 'structural nulls in the builder call');
  assert(/persistTerminalSuccess\(db, \{[\s\S]*?anchored: true/.test(anchoredSrc), 'the persist is the anchored mode');
});
test('CTF-SEAM-3: every non-rescued exit of rescueOrRethrow throws the ORIGINAL error object (`throw err;`)', () => {
  const body = anchoredSrc.slice(anchoredSrc.indexOf('export async function rescueOrRethrow'));
  const throws = body.match(/\bthrow [^;]+;/g) || [];
  assert(throws.length > 0 && throws.every((t) => t === 'throw err;'), `only "throw err;" allowed, found ${JSON.stringify(throws)}`);
});

test('CTF-SEAM-4 (build review BC-M1/EF-F1): the post-loop region is wrapped ONCE and its catch only annotates (the original is rethrown by the helper)', () => {
  const i = coreSrc.indexOf('} catch (postLoopErr) {');
  assert(i > 0 && coreSrc.indexOf('} catch (postLoopErr) {', i + 1) < 0, 'exactly one post-loop catch');
  const body = coreSrc.slice(i, coreSrc.indexOf('}', coreSrc.indexOf('annotatePostLoopThrowOrRethrow(', i)) + 1);
  assert(/await annotatePostLoopThrowOrRethrow\(postLoopErr,/.test(body), 'the post-loop catch hands the ORIGINAL error to annotatePostLoopThrowOrRethrow');
  assert(!/\bthrow\b/.test(body), 'no throw of its own');
  assert(coreSrc.indexOf('} catch (postLoopErr) {') > coreSrc.indexOf('persistTerminalSuccess(prisma'), 'the normal success persist sits inside the wrapped region');
});
test('CTF-SEAM-5 (build review EF-F2): the core AND the rescue stamp nets through the ONE shared helper; neither builds its own net ctx', () => {
  const nets = stripComments(fs.readFileSync(path.join(__dirname, '../lib/services/execution-nets.ts'), 'utf8'));
  assert(/runNetsAtPoint\('leaf-persist'/.test(nets) && /runNetsAtPoint\('leg-synthesize'/.test(nets), 'the helper runs BOTH points');
  for (const [name, src] of [['execution-core', coreSrc], ['execution-completion-anchored', anchoredSrc]] as const) {
    assert(/await stampExecutionNets\(/.test(src), `${name} calls stampExecutionNets`);
    assert(!/runNetsAtPoint\(|buildNetContext\(/.test(src), `${name} must not call runNetsAtPoint/buildNetContext itself (a forked net ctx)`);
  }
});

test('CTF-SEAM-6 (PLATFORM-HELD-BYTES Stage A): the capture halves sit where the plan puts them, on BOTH success paths', () => {
  const pos = (src: string, needle: string) => src.indexOf(needle);
  const count = (src: string, re: RegExp) => (src.match(re) || []).length;
  // core: ONE pure call after `const executionTime` and before every reader of toolCallResults
  assert(count(coreSrc, /prepareHeldCapture\(/g) === 1, 'core: exactly one prepareHeldCapture(');
  const prep = pos(coreSrc, 'prepareHeldCapture(');
  assert(prep > pos(coreSrc, 'const executionTime') && prep < pos(coreSrc, 'buildSuccessLogs(')
    && prep < pos(coreSrc, 'assessExecutionQuality(') && prep < pos(coreSrc, 'buildExecutionResultJson('),
    'core: the pure half is after the duration and before buildSuccessLogs / assessExecutionQuality / buildExecutionResultJson');
  // core: ONE I/O call after keep-best and before the persist, inside the post-loop region
  assert(count(coreSrc, /await captureHeldFiles\(/g) === 1, 'core: exactly one await captureHeldFiles(');
  const io = pos(coreSrc, 'await captureHeldFiles(');
  assert(io > pos(coreSrc, '} catch (ksErr) {') && io < pos(coreSrc, 'persistTerminalSuccess(prisma'), 'core: the I/O half is after keep-best and before the persist');
  // The POST-LOOP try is the last `try {` before `} catch (postLoopErr) {` (code review AE N-2: not the first in the file).
  const postCatch = pos(coreSrc, '} catch (postLoopErr) {');
  const postTry = coreSrc.lastIndexOf('try {', coreSrc.lastIndexOf('const { toolCallResults', postCatch));
  assert(postTry > 0 && prep > postTry && io < postCatch, 'core: both inside the post-loop region');
  // anchored: the pure half BEFORE buildCompletionAnchoredResult (which runs the nets), the I/O half after `built`
  const fnA = anchoredSrc.slice(pos(anchoredSrc, 'export async function persistCompletionAnchored'));
  assert(pos(fnA, 'prepareHeldCapture(') > 0 && pos(fnA, 'prepareHeldCapture(') < pos(fnA, 'buildCompletionAnchoredResult('), 'anchored: pure half before buildCompletionAnchoredResult (AE D1)');
  assert(pos(fnA, 'await captureHeldFiles(') > pos(fnA, 'const built') && pos(fnA, 'await captureHeldFiles(') < pos(fnA, 'persistTerminalSuccess(db'), 'anchored: I/O half after built, before the persist');
  // the two-caller pin: exactly two success persists in lib/ + app/, each preceded in its function by captureHeldFiles(
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p2 = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p2, out); }
      else if (/\.(ts|tsx|js)$/.test(e.name)) out.push(p2);
    }
    return out;
  };
  const callers: string[] = [];
  for (const f of [...walk(path.join(__dirname, '../lib')), ...walk(path.join(__dirname, '../app'))]) {
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    const n = count(src, /\bpersistTerminalSuccess\(/g) - count(src, /export async function persistTerminalSuccess\(/g);
    for (let i = 0; i < n; i++) callers.push(path.relative(path.join(__dirname, '..'), f));
  }
  assert(JSON.stringify(callers.sort()) === JSON.stringify(['lib/services/execution-completion-anchored.ts', 'lib/services/execution-core.ts']),
    `persistTerminalSuccess callers: ${JSON.stringify(callers)} — a third success path must capture too`);
  // neither file reaches inside the helper
  for (const [name, src] of [['execution-core', coreSrc], ['execution-completion-anchored', anchoredSrc]] as const) {
    assert(!/extractDeclaredFiles\(|canonicalBase\(|upsertHeldBlobs\(/.test(src), `${name} must call only the two helper halves`);
  }
  // Every catch body, brace-balanced, incl. a bare `catch {` (code review AE N-1: the [^}]* form stopped inside the
  // body's first object literal and never matched `catch {`).
  const helper = stripComments(fs.readFileSync(path.join(__dirname, '../lib/services/held-bytes-capture.ts'), 'utf8'));
  const catchBodies: string[] = [];
  const re = /catch\s*(?:\([^)]*\))?\s*\{/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(helper)) !== null) {
    let depth = 1, i = mm.index + mm[0].length;
    for (; i < helper.length && depth > 0; i++) { if (helper[i] === '{') depth++; else if (helper[i] === '}') depth--; }
    catchBodies.push(helper.slice(mm.index, i));
  }
  assert(catchBodies.length >= 3, `found ${catchBodies.length} catch bodies`);
  assert(catchBodies.every((c) => !/\bthrow\b/.test(c)), 'no catch in the helper rethrows');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
