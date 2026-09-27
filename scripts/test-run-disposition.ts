#!/usr/bin/env ts-node
/**
 * run-disposition tests (item 10, 2026-09-15).
 *
 * The module FAILS CLOSED by design: a malformed disposition reads as null, so a typo
 * leaves a run visible rather than erasing it from the board. These pin that direction,
 * because the dangerous failure is the silent one.
 */
import { readRunDisposition, isDisposed } from '../lib/tasks/run-disposition';

let passed = 0, failed = 0;
const test = (d: string, fn: () => void) => {
  try { fn(); console.log(`✅ ${d}`); passed++; }
  catch (e) { console.error(`❌ ${d}\n   ${(e as Error).message}`); failed++; }
};
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };

const valid = { runDisposition: { state: 'superseded', reason: 'replaced by run 2', at: '2026-09-15T09:00:00Z', supersededBy: 'cmu1yj66y' } };

test('reads a well-formed superseded disposition', () => {
  const d = readRunDisposition(valid);
  assert(d?.state === 'superseded', 'state');
  assert(d?.supersededBy === 'cmu1yj66y', 'supersededBy carried');
  assert(isDisposed(valid), 'isDisposed true');
});

test('reads abandoned without supersededBy', () => {
  const d = readRunDisposition({ runDisposition: { state: 'abandoned', reason: 'dev debris', at: '2026-09-15T09:00:00Z' } });
  assert(d?.state === 'abandoned', 'state');
  assert(d?.supersededBy === undefined, 'no supersededBy');
});

test('FAILS CLOSED: a coined state is not a disposition', () => {
  // The closed set matters — 2026-08-12 a coined `kind` stamped a false violation and
  // parked a correct program. Same class, so the same closed-set discipline.
  assert(readRunDisposition({ runDisposition: { state: 'parked', reason: 'x', at: 'y' } }) === null, 'coined state must not read');
});

test('FAILS CLOSED: an empty reason is not a disposition', () => {
  assert(readRunDisposition({ runDisposition: { state: 'abandoned', reason: '   ', at: 'y' } }) === null, 'blank reason');
  assert(readRunDisposition({ runDisposition: { state: 'abandoned', at: 'y' } }) === null, 'missing reason');
});

test('FAILS CLOSED: missing `at`, wrong types, and junk all read null', () => {
  assert(readRunDisposition({ runDisposition: { state: 'abandoned', reason: 'x' } }) === null, 'missing at');
  assert(readRunDisposition({ runDisposition: 'abandoned' }) === null, 'string not object');
  assert(readRunDisposition({ runDisposition: null }) === null, 'null');
  assert(readRunDisposition({}) === null, 'absent');
  assert(readRunDisposition(null) === null, 'null metadata');
  assert(readRunDisposition('nonsense') === null, 'non-object metadata');
});

test('a partial disposition NEVER yields a partial object', () => {
  // The dangerous shape: half-read, treated as disposed, run vanishes from the board.
  const d = readRunDisposition({ runDisposition: { state: 'superseded', reason: 'ok', at: '2026-09-15', supersededBy: 42 } });
  assert(d !== null, 'valid core still reads');
  assert(d!.supersededBy === undefined, 'non-string supersededBy dropped, not coerced');
});

console.log(`\n${'='.repeat(40)}\nResults: ${passed} passed, ${failed} failed\n${'='.repeat(40)}`);
process.exit(failed > 0 ? 1 : 0);
