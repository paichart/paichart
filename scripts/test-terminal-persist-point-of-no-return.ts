#!/usr/bin/env ts-node
/**
 * Terminal-Persist Point-of-No-Return Tests — convergence Phase 0.5a (C-3)
 *
 * Guards the invariant: once a terminal transaction commits, NO post-commit
 * SSE write may throw into the outer catch — a client disconnect after the
 * SUCCESS tx would otherwise overwrite the committed SUCCESS row with FAILED
 * (SUCCESS artifacts + error.json side by side, task COMPLETED while
 * executionStatus FAILED).
 *
 * Layer 1 source-structural pins (the route handler cannot be instantiated
 * in CI — no DATABASE_URL, Next.js runtime): if anyone reintroduces a bare
 * `writer.write` after the success tx, un-hoists safeWrite, or unguards the
 * success-path close, this fails.
 *
 * Created: 2026-07-04
 * Plan: cline_docs/reviews/execution-path-convergence-2026-07-04/implementation-plan.md §Phase 0.5a
 * Finding: agent-execution-analysis.md C-3
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🔒 Terminal-Persist Point-of-No-Return Tests (0.5a pattern validation)\n');

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

const routePath = path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts');
const src = fs.readFileSync(routePath, 'utf8');

// Region markers: the success-path post-commit block starts after the success
// tx's closing findMany/commit and ends at the outer catch.
const successCommitIdx = src.indexOf('// 0.5a (C-3): the SUCCESS tx has committed');
const outerCatchIdx = src.indexOf('} catch (error) {', successCommitIdx);
const iifeIdx = src.indexOf('(async () => {');
const safeWriteDefIdx = src.indexOf('const safeWrite = async (data: string)');

test('P1: post-commit marker comment exists on the success path', () => {
  if (successCommitIdx === -1) {
    throw new Error('point-of-no-return marker comment not found — was the success post-commit block rewritten?');
  }
  if (outerCatchIdx === -1) {
    throw new Error('outer catch not found after the success post-commit block');
  }
});

test('P2: safeWrite is hoisted ABOVE the execution IIFE (shared by success + catch paths)', () => {
  if (safeWriteDefIdx === -1) throw new Error('safeWrite definition not found');
  if (iifeIdx === -1) throw new Error('execution IIFE not found');
  if (safeWriteDefIdx > iifeIdx) {
    throw new Error('safeWrite is defined inside/after the IIFE — the success path cannot share it');
  }
});

test('P3: safeWrite is defined exactly once (no catch-local shadow)', () => {
  const count = src.split('const safeWrite = async').length - 1;
  if (count !== 1) throw new Error(`expected exactly 1 safeWrite definition, found ${count}`);
});

test('P4: no bare writer.write between the success-tx commit and the outer catch', () => {
  const region = src.slice(successCommitIdx, outerCatchIdx);
  // Every SSE emission in the post-commit success region must route through safeWrite.
  if (/await\s+writer\.write\(/.test(region)) {
    throw new Error('bare `await writer.write(` found after the success tx commit — must use safeWrite (C-3)');
  }
  const safeWrites = region.match(/await safeWrite\(/g) || [];
  if (safeWrites.length < 4) {
    throw new Error(`expected ≥4 safeWrite calls in the post-commit success region (execution_update, artifact_created loop, log_update, [DONE]); found ${safeWrites.length}`);
  }
});

test('P5: success-path writer.close is guarded (a close throw must not reach the catch)', () => {
  const region = src.slice(successCommitIdx, outerCatchIdx);
  if (!region.includes('try { await writer.close(); } catch')) {
    throw new Error('success-path writer.close() is not try/catch-guarded');
  }
  // And no unguarded close in the region:
  const unguarded = region.replace('try { await writer.close(); } catch', '');
  if (/await\s+writer\.close\(\)/.test(unguarded)) {
    throw new Error('an unguarded `await writer.close()` remains in the post-commit success region');
  }
});

test('P6: safeWrite absorbs the throw (returns false, does not rethrow)', () => {
  const defEnd = src.indexOf('};', safeWriteDefIdx);
  const def = src.slice(safeWriteDefIdx, defEnd);
  if (!def.includes('catch')) throw new Error('safeWrite has no catch');
  if (!def.includes('return false')) throw new Error('safeWrite catch does not return false');
  if (/catch[^}]*throw/.test(def)) throw new Error('safeWrite catch rethrows — must absorb');
});

test('P7: ZERO bare writer.write anywhere — F2 SUPERSEDED 2026-08-21 (disconnect stops streaming, never the work)', () => {
  // ⚠️ This test formerly pinned the OPPOSITE contract (performance F2, 2026-07-04):
  // "≥10 bare writer.write calls pre-commit — a dead SSE client legitimately aborts
  // a run before commit". F2 was SUPERSEDED on 2026-08-21 with lead + boundary
  // sign-off, per the process the F2 ruling itself required: exec
  // cmt14lwlq00a4yxttzptbmr69 finished its work (end_turn, 7030 output tokens) and
  // a pre-commit write threw ResponseAborted, discarding the completed deliverable —
  // and the operator confirmed no user action (disconnects arrive from network/CDN/
  // tab lifecycle). The premise "disconnect = user abandoned the run" is false, and
  // the tx-commit boundary was the wrong line: work completes BEFORE commit.
  // New contract: every SSE write routes through safeWrite; the only abort
  // authorities are the execution timeout, application errors, and explicit
  // cancellation. See cline_docs/reviews/stream-safewrite-sweep-2026-08-21/
  // (agent-execution review + boundary-contract sign-off) and
  // cline_docs/follow-ups/stream-disconnect-discards-completed-work-2026-08-21.md.
  // Allowed raw writes, by POSITION (boundary sign-off §5 P7a — an argument-text
  // filter would silently re-allowlist any site if safeWrite's param were renamed):
  // inside the safeWrite definition itself, and the heartbeat line (own .catch).
  // A redundant text-based gate also lives in test:sse-event-sequence.
  const safeWriteDefEnd = src.indexOf('};', safeWriteDefIdx);
  const heartbeatIdx = src.indexOf(': heartbeat');
  const heartbeatLineStart = src.lastIndexOf('\n', heartbeatIdx);
  const heartbeatLineEnd = src.indexOf('\n', heartbeatIdx);
  const bareWrites = [...src.matchAll(/writer\.write\(encoder\.encode\(/g)]
    .map(m => m.index as number)
    .filter(i => !(i > safeWriteDefIdx && i < safeWriteDefEnd))
    .filter(i => !(i > heartbeatLineStart && i < heartbeatLineEnd));
  if (bareWrites.length) {
    const context = bareWrites.map(i => src.slice(i, src.indexOf('\n', i)).slice(0, 90));
    throw new Error(`${bareWrites.length} bare writer.write site(s) found — route through safeWrite:\n   ${context.join('\n   ')}`);
  }
});

test('P8: the clientGone latch exists and safeWrite short-circuits on it', () => {
  // Companion to the F2 supersession: once the transport dies it never recovers,
  // so safeWrite latches and skips subsequent writes (no reject/catch churn),
  // and the heartbeat is guarded on the same latch.
  if (!src.includes('let clientGone = false')) throw new Error('clientGone latch declaration not found');
  const defEnd = src.indexOf('};', safeWriteDefIdx);
  const def = src.slice(safeWriteDefIdx, defEnd);
  if (!def.includes('if (clientGone) return false')) throw new Error('safeWrite does not short-circuit on clientGone');
  if (!def.includes('clientGone = true')) throw new Error('safeWrite catch does not set the clientGone latch');
  if (!src.includes('!writerClosed && !clientGone')) throw new Error('heartbeat is not guarded on clientGone');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
