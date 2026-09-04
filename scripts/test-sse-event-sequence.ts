#!/usr/bin/env ts-node
/**
 * SSE Event-Sequence Fixture — convergence Phase 1 (performance §7)
 *
 * Pins the ORDERED sequence of SSE emissions in the stream route's source
 * (every `writer.write(encoder.encode(...))` / `safeWrite(...)` carrying a
 * typed payload, in source order). This is the wire-contract drift-lock held
 * through Phase 6: when the route becomes a thin adapter over the execution
 * core, this exact sequence must still be produced — a reordered, renamed,
 * dropped, or added event type fails here and forces a deliberate update
 * (boundary-contract's 12-event table is the consumer-side reference:
 * agent-service.ts processSSEStream switch).
 *
 * Source-order pin, not a runtime capture: the route needs a live DB + LLM
 * to run, and source order IS emission order for the linear success/catch
 * tails. Mid-loop observer events are inherently conditional (loop turns),
 * so the pin asserts the ordered TYPE SEQUENCE of emission SITES, which is
 * exactly what an adapter refactor could silently change.
 *
 * Created: 2026-07-04
 * Plan: cline_docs/reviews/execution-path-convergence-2026-07-04/implementation-plan.md §Phase 1
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('📡 SSE Event-Sequence Fixture (Phase 1 wire-contract drift-lock)\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) console.error(`   ${error.message}`);
    failed++;
  }
}

const src = fs.readFileSync(
  path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts'), 'utf8');

// Harvest every SSE emission site in source order.
function harvestSequence(source: string): string[] {
  const events: string[] = [];
  const re = /(?:writer\.write\(encoder\.encode\(|safeWrite\()(`data: \$\{JSON\.stringify\(\{\s*\n?\s*type: '([a-z_]+)'|`data: \$\{JSON\.stringify\(initialData\)|'data: \[DONE\]|': heartbeat)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[2]) events.push(m[2]);
    else if (m[1].includes('initialData')) events.push('execution_started');
    else if (m[1].includes('[DONE]')) events.push('[DONE]');
    else events.push('heartbeat');
  }
  return events;
}

// The golden sequence — harvested 2026-07-04 post-Phase-1 (de6f2217 tree).
// Segment layout:
//   init:        execution_started, heartbeat, 3× setup log_update
//   loop (observer-wired, conditional per turn): prompt_snapshot, text_chunk,
//                web-search extensions, function_call, tool cadence
//   post-loop:   reflection/finalize log_updates + text_chunks
//   success tail (post-commit, safeWrite): execution_update → artifact_created
//                → log_update → [DONE]
//   catch tail (safeWrite): error → log_update → execution_update →
//                artifact_created → [DONE]
const GOLDEN: string[] = [
  'execution_started',
  'heartbeat',
  'log_update',
  'log_update',
  'log_update',
  'prompt_snapshot',
  'text_chunk',
  'web_search_results',
  'citations',
  'search_queries',
  'function_call',
  'log_update',
  'tool_result_card',
  'log_update',
  'text_chunk',
  'log_update',
  'text_chunk',
  'text_chunk',
  'log_update',
  'log_update',
  'text_chunk',
  'execution_update',
  'artifact_created',
  'log_update',
  '[DONE]',
  'error',
  'log_update',
  'execution_update',
  'artifact_created',
  '[DONE]',
];

const actual = harvestSequence(src);

test(`sequence: ${GOLDEN.length} emission sites in the pinned order`, () => {
  if (actual.length !== GOLDEN.length) {
    throw new Error(
      `emission-site count changed: expected ${GOLDEN.length}, found ${actual.length}.\n` +
      `   actual: ${actual.join(' → ')}\n` +
      `   A deliberate wire-contract change must update the GOLDEN list AND check the GUI consumer switch (agent-service.ts processSSEStream).`
    );
  }
  for (let i = 0; i < GOLDEN.length; i++) {
    if (actual[i] !== GOLDEN[i]) {
      throw new Error(`position ${i}: expected '${GOLDEN[i]}', found '${actual[i]}' (sequence: ${actual.join(' → ')})`);
    }
  }
});

test('success tail: execution_update → artifact_created → log_update → [DONE] (post-commit, absorb-on-disconnect)', () => {
  const tail = actual.slice(actual.indexOf('execution_update'), actual.indexOf('[DONE]') + 1);
  const expected = ['execution_update', 'artifact_created', 'log_update', '[DONE]'];
  if (tail.join(',') !== expected.join(',')) {
    throw new Error(`success tail is ${tail.join(' → ')}; expected ${expected.join(' → ')}`);
  }
});

test('catch tail: error → log_update → execution_update → artifact_created → [DONE]', () => {
  const errIdx = actual.indexOf('error');
  if (errIdx === -1) throw new Error('no error event emission found');
  const tail = actual.slice(errIdx);
  const expected = ['error', 'log_update', 'execution_update', 'artifact_created', '[DONE]'];
  if (tail.join(',') !== expected.join(',')) {
    throw new Error(`catch tail is ${tail.join(' → ')}; expected ${expected.join(' → ')}`);
  }
});

test('event-type vocabulary matches the GUI consumer set (no unknown types emitted)', () => {
  // Consumer reference: lib/pov/api/agent-service.ts processSSEStream switch
  // (boundary-contract wire table). heartbeat + [DONE] are transport-level.
  const KNOWN = new Set([
    'execution_started', 'heartbeat', 'log_update', 'prompt_snapshot', 'text_chunk',
    'web_search_results', 'citations', 'search_queries', 'function_call',
    'tool_result_card', 'execution_update', 'artifact_created', 'error', '[DONE]',
  ]);
  const unknown = actual.filter(e => !KNOWN.has(e));
  if (unknown.length) throw new Error(`unknown event types emitted: ${unknown.join(', ')}`);
});

test('zero raw writer.write sites (2026-08-21 safeWrite sweep regression gate)', () => {
  // A raw `writer.write(encoder.encode(...))` inside the try throws ResponseAborted on a
  // dead client, reaches the outer catch, and persists FAILED over completed work (exec
  // cmt14lwlq00a4yxttzptbmr69 lost a finished 7030-token deliverable this way). ALL SSE
  // emissions must route through safeWrite. Allowed raw sites: the write inside safeWrite
  // itself (arg is the bare `data` param) and the heartbeat (has its own .catch).
  const raw = [...src.matchAll(/writer\.write\(encoder\.encode\((.*)/g)]
    .map(m => m[1])
    .filter(arg => !arg.startsWith('data)') && !arg.includes(': heartbeat'));
  if (raw.length) {
    throw new Error(
      `${raw.length} raw writer.write site(s) found — route them through safeWrite ` +
      `(see cline_docs/follow-ups/stream-disconnect-discards-completed-work-2026-08-21.md):\n   ` +
      raw.join('\n   ')
    );
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
