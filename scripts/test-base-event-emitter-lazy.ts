#!/usr/bin/env ts-node
/**
 * Finding C regression test — BaseEventEmitter lazy init + BC34 leak fix.
 *
 * Pins the 2026-06-14 contract change (implemented after the auth-event-subsystem
 * deletions left `phase-stage-events` as the sole live BaseEventEmitter subclass):
 *  1. The constructor does NOT eager-connect (SCRAM footgun removed).
 *  2. A public idempotent `initialize()` with an `initPromise` guard exists.
 *  3. `disconnect()` removeListener's BOTH pool handlers (BC34 leak fix) before
 *     `removeAllListeners()`.
 *  4. `server-init.ts` pre-warms `getPhaseStageEventEmitter().initialize()`.
 *
 * If anyone re-introduces eager init or drops the BC34 removeListener, this fails
 * loudly. Source-text assertions only (no imports) — CI-safe, no DATABASE_URL.
 *
 * Created: 2026-06-14
 * Plan: cline_docs/follow-ups/agent-execute-stream-hardening-2026-06-13.md (Finding C)
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 Finding C — BaseEventEmitter lazy-init + BC34 regression\n');

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

const REPO = path.resolve(__dirname, '..');
const base = fs.readFileSync(path.join(REPO, 'lib/events/base-event-emitter.ts'), 'utf-8');
const serverInit = fs.readFileSync(path.join(REPO, 'lib/server-init.ts'), 'utf-8');

// --- 1. Constructor must NOT eager-connect ---
test('FC1: constructor does NOT call this.initializeWithSharedPool() (eager init removed)', () => {
  const ctorStart = base.indexOf('constructor(config: BaseEventConfig)');
  const ctorEnd = base.indexOf('\n  }', ctorStart);
  const ctorBody = base.slice(ctorStart, ctorEnd);
  if (/this\.initializeWithSharedPool\(\)/.test(ctorBody)) {
    throw new Error('Constructor eager-connects again — the SCRAM footgun is back. Connect lazily via initialize().');
  }
});

// --- 2. Public idempotent initialize() with initPromise guard ---
test('FC2: public initialize() exists with an initPromise idempotency guard', () => {
  if (!/public async initialize\(\): Promise<boolean>/.test(base)) {
    throw new Error('public initialize(): Promise<boolean> missing');
  }
  if (!/private initPromise: Promise<boolean> \| null/.test(base)) {
    throw new Error('initPromise guard field missing');
  }
  if (!/this\.initPromise = this\.initializeWithSharedPool\(\)/.test(base)) {
    throw new Error('initialize() does not route through initPromise');
  }
});

// --- 3. BC34: disconnect() removes BOTH pool handlers via stored refs ---
test('FC3: disconnect() removeListener\'s connected + error handlers (BC34 leak fix)', () => {
  if (!/removeListener\('connected', this\._connectedHandler\)/.test(base)) {
    throw new Error("disconnect() does not removeListener the 'connected' handler — BC34 leak");
  }
  if (!/removeListener\(`error-\$\{this\.systemName\}`, this\._errorHandler\)/.test(base)) {
    throw new Error("disconnect() does not removeListener the error handler — BC34 leak");
  }
  // The removeListener must precede removeAllListeners (else nulled-out refs).
  const rmListener = base.indexOf("removeListener('connected'");
  const rmAll = base.indexOf('this.removeAllListeners()', base.indexOf('public async disconnect'));
  if (rmListener < 0 || rmAll < 0 || rmListener >= rmAll) {
    throw new Error('removeListener(pool handlers) must come BEFORE removeAllListeners()');
  }
});

// --- 4. Named handler refs stored (so removeListener has a stable target) ---
test('FC4: handler refs stored as _connectedHandler / _errorHandler (not anonymous arrows)', () => {
  if (!/this\._connectedHandler = \(\) =>/.test(base)) throw new Error('_connectedHandler not stored');
  if (!/this\._errorHandler = \(error: any\) =>/.test(base)) throw new Error('_errorHandler not stored');
  if (!/this\.sharedPool\.on\('connected', this\._connectedHandler\)/.test(base)) {
    throw new Error('listener attached as anonymous arrow instead of the stored ref');
  }
});

// --- 5. server-init pre-warms the sole live subclass ---
test('FC5: server-init.ts pre-warms getPhaseStageEventEmitter().initialize()', () => {
  if (!/getPhaseStageEventEmitter\(\)\.initialize\(\)/.test(serverInit)) {
    throw new Error('phase-stage-events not pre-warmed in server-init — live-updates would cold-connect on first emit');
  }
  // Loud-fail on pre-warm failure (not silently swallowed).
  if (!/phaseStageEventsReady/.test(serverInit) || !/FAILED to pre-warm/.test(serverInit)) {
    throw new Error('pre-warm result not surfaced loud on failure');
  }
});

// --- 6. emitDatabaseEvent self-heals (non-blocking) when disconnected ---
// 2026-06-20 (event-system review): the paichart-mcp process never runs the
// server-init pre-warm, so its phase-stage singleton was isConnected=false from
// birth and emitDatabaseEvent silently dropped every event for the process
// lifetime. Fix: emit kicks off a background initialize() when disconnected so the
// NEXT emit lands — WITHOUT awaiting it (the hot path must stay non-blocking).
test('FC6: emitDatabaseEvent triggers a non-blocking background self-heal when disconnected', () => {
  const emitFn = base.slice(
    base.indexOf('protected async emitDatabaseEvent'),
    base.indexOf('protected handleConnectionError')
  );
  if (!/void this\.initialize\(\)/.test(emitFn)) {
    throw new Error('emitDatabaseEvent no longer triggers a non-blocking self-heal — silent permanent drop regressed');
  }
  if (/await this\.initialize\(\)/.test(emitFn)) {
    throw new Error('emitDatabaseEvent awaits initialize() — violates the non-blocking hot-path contract');
  }
});

console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=====================================');
if (failed > 0) process.exit(1);
