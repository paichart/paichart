#!/usr/bin/env ts-node
/**
 * LISTEN-replay + no-bare-error + no-give-up regression test.
 *
 * Pins the 2026-09-13 triple (P1/P2/P3) in lib/events/shared-connection-pool.ts.
 * Plan: cline_docs/reviews/self-host-supervision-and-listen-replay-2026-09-13/
 *
 * WHY THIS EXISTS — the defect it prevents, proven live on prod 2026-09-12 23:17:
 * a Postgres-only restart left `paichart-web` ALIVE with every LISTEN silently gone.
 * pg_stat_activity showed one application listener and it belonged to the *other*
 * process. The web process kept serving 200s and receiving zero notifications.
 *
 * Three properties, which are only correct TOGETHER:
 *   P1  the pool never emits bare 'error' (EventEmitter throws on an unhandled one,
 *       which killed the process before its own reconnect could run), and consumers
 *       are notified BEFORE any throw path so their self-heal is not gated on a lie.
 *   P2  LISTEN is re-issued on every new session, and `isConnected` is set ONLY after
 *       it succeeds — fail closed, never "connected" over a deaf session.
 *   P3  no terminal give-up: the pool retries indefinitely rather than going quiet.
 *
 * Behavioural where behaviour is the property (a fake pg.Client records real queries,
 * so "LISTEN was re-issued" is proven, not inferred from the map being iterated);
 * source-text only for the structural "single site" invariants behaviour cannot show.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;
function test(description: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`✅ ${description}`); passed++; })
    .catch((error: any) => {
      console.error(`❌ ${description}`);
      console.error(`   ${error?.message ?? error}`);
      failed++;
    });
}
function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------------------
// Fake pg client. Records every query so LISTEN re-issue is observable.
// ---------------------------------------------------------------------------
class FakeClient {
  public queries: string[] = [];
  public failChannels = new Set<string>();
  private handlers: Record<string, Function[]> = {};
  on(evt: string, fn: Function) { (this.handlers[evt] ||= []).push(fn); return this; }
  emit(evt: string, arg?: any) { (this.handlers[evt] || []).forEach((h) => h(arg)); }
  async connect() { /* no-op */ }
  async end() { /* no-op */ }
  async query(sql: string) {
    this.queries.push(sql);
    const m = /^LISTEN (.+)$/.exec(sql);
    if (m && this.failChannels.has(m[1])) throw new Error(`simulated LISTEN failure: ${m[1]}`);
    return { rows: [] };
  }
  listens() { return this.queries.filter((q) => q.startsWith('LISTEN ')); }
}

const REPO = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(REPO, 'lib/events/shared-connection-pool.ts'), 'utf-8');

// Patch pg.Client BEFORE the pool module is loaded, so `new Client(...)` builds a fake.
const pg = require('pg');
const RealClient = pg.Client;
pg.Client = FakeClient;

const { SharedEventConnectionPool } = require('../lib/events/shared-connection-pool.ts');

/** A pool with a fake session already attached, bypassing connect(). */
function poolWithSession(): { pool: any; client: FakeClient } {
  const pool = Object.create(SharedEventConnectionPool.prototype);
  const client = new FakeClient();
  pool.pgClient = client;
  pool.isConnected = false;
  pool.connectedSystems = new Map();
  pool.listeningChannels = new Set();
  pool.reconnectAttempts = 0;
  pool.isReconnecting = false;
  pool.isShuttingDown = false;
  pool.logger = { info() {}, warn() {}, error() {}, debug() {} };
  // EventEmitter internals for emit/on
  Object.assign(pool, new (require('events').EventEmitter)());
  return { pool, client };
}
function register(pool: any, name: string, channels: string[]) {
  pool.connectedSystems.set(name, { systemName: name, channels, registeredAt: new Date(), isActive: true });
}

async function main() {
  console.log('🧪 shared-connection-pool — LISTEN replay / no-bare-error / no-give-up\n');

  // === P2: the core property — LISTEN is RE-ISSUED on a new session ===============
  await test('P2-1: LISTEN is issued for every registered channel', async () => {
    const { pool, client } = poolWithSession();
    register(pool, 'sysA', ['alpha_events', 'beta_events']);
    await pool.establishListens();
    assert(client.listens().includes('LISTEN alpha_events'), 'alpha not listened');
    assert(client.listens().includes('LISTEN beta_events'), 'beta not listened');
  });

  await test('P2-2: after the session is replaced, LISTEN is RE-ISSUED (the actual defect)', async () => {
    const { pool, client } = poolWithSession();
    register(pool, 'sysA', ['alpha_events']);
    await pool.establishListens();
    assert(client.listens().length === 1, 'expected one LISTEN on first session');

    // Simulate a new pg session exactly as initializeConnection does: new client, cleared fact.
    const client2 = new FakeClient();
    pool.pgClient = client2;
    pool.listeningChannels.clear();

    await pool.establishListens();
    assert(
      client2.listens().includes('LISTEN alpha_events'),
      'REGRESSION: LISTEN was NOT re-issued on the new session — this is the production defect'
    );
  });

  await test('P2-3: replay is idempotent within one session (no duplicate LISTEN)', async () => {
    const { pool, client } = poolWithSession();
    register(pool, 'sysA', ['alpha_events']);
    await pool.establishListens();
    await pool.establishListens();
    assert(client.listens().length === 1, `expected 1 LISTEN, got ${client.listens().length}`);
  });

  await test('P2-4: FAIL CLOSED — a failed LISTEN must not produce a "connected" pool', async () => {
    const { pool, client } = poolWithSession();
    client.failChannels.add('beta_events');
    register(pool, 'sysA', ['alpha_events', 'beta_events']);
    let threw = false;
    try { await pool.activateConnection(); } catch { threw = true; }
    assert(threw, 'activateConnection must throw on a partial replay');
    assert(pool.isConnected === false, 'isConnected must stay FALSE after a partial replay');
  });

  await test('P2-5: activateConnection emits "connected" only after LISTEN succeeds', async () => {
    const { pool, client } = poolWithSession();
    register(pool, 'sysA', ['alpha_events']);
    let listensAtEmit = -1;
    pool.on('connected', () => { listensAtEmit = client.listens().length; });
    await pool.activateConnection();
    assert(listensAtEmit === 1, `LISTEN must precede 'connected' (saw ${listensAtEmit} listens at emit)`);
    assert(pool.isConnected === true, 'isConnected should be true after a clean activation');
  });

  // === P1: no bare 'error' — the crash that started all of this ===================
  await test('P1-1: handleConnectionError does NOT throw when nothing listens', async () => {
    const { pool } = poolWithSession();
    register(pool, 'sysA', ['alpha_events']);
    pool.scheduleReconnect = () => {};           // isolate from timers
    pool.handleConnectionError(new Error('57P01 simulated'));  // must not throw
    assert(pool.isConnected === false, 'pool should be marked disconnected');
  });

  await test('P1-2: consumers are notified (error-<system>) — their self-heal is not gated on a lie', async () => {
    const { pool } = poolWithSession();
    register(pool, 'sysA', ['alpha_events']);
    pool.scheduleReconnect = () => {};
    let notified = false;
    pool.on('error-sysA', () => { notified = true; });
    pool.handleConnectionError(new Error('57P01 simulated'));
    assert(notified, 'REGRESSION: per-system consumers were not notified before the pool emit');
  });

  await test('P1-3: the fact is cleared on error (listeningChannels must not outlive its session)', async () => {
    const { pool } = poolWithSession();
    register(pool, 'sysA', ['alpha_events']);
    await pool.establishListens();
    assert(pool.listeningChannels.size === 1, 'precondition: one channel listening');
    pool.scheduleReconnect = () => {};
    pool.handleConnectionError(new Error('57P01 simulated'));
    assert(pool.listeningChannels.size === 0, 'listeningChannels must be cleared when the session is lost');
  });

  await test('P1-4: a THROWING consumer must not prevent scheduleReconnect (live regression 2026-09-13)', async () => {
    const { pool } = poolWithSession();
    register(pool, 'sysA', ['alpha_events']);
    let scheduled = false;
    pool.scheduleReconnect = () => { scheduled = true; };
    // Exactly what base-event-emitter did: its handler emitted bare 'error' on itself,
    // which threw, unwound the pool's notify loop, and killed its own recovery.
    pool.on('error-sysA', () => { throw new Error('consumer exploded'); });
    pool.handleConnectionError(new Error('57P01 simulated'));
    assert(scheduled, 'REGRESSION: a throwing listener prevented the pool from scheduling a reconnect');
  });

  await test('P1-5: consumers never emit bare \'error\' unguarded (the same hazard, sibling files)', () => {
    for (const f of ['base-event-emitter.ts', 'prompt-registry-events.ts', 'execution-events.ts']) {
      const src = fs.readFileSync(path.join(REPO, 'lib/events', f), 'utf-8');
      const unguarded = src.split('\n').filter((l) =>
        /this\.emit\('error'/.test(l) && !/listenerCount\('error'\)/.test(l));
      assert(unguarded.length === 0,
        `${f}: ${unguarded.length} unguarded bare 'error' emit(s) — these throw when unlistened`);
    }
  });

  // === P3: no terminal give-up ====================================================
  await test('P3-1: still schedules a retry far beyond the old cap of 5', async () => {
    const { pool } = poolWithSession();
    pool.reconnectAttempts = 50;
    let scheduled = false;
    const realSetTimeout = global.setTimeout;
    (global as any).setTimeout = (fn: any, ms: number) => { scheduled = true; return { unref() {} }; };
    try { pool.scheduleReconnect(); } finally { (global as any).setTimeout = realSetTimeout; }
    assert(scheduled, 'REGRESSION: pool gave up retrying — it must never go quiet');
  });

  await test('P3-2: shutdown suppresses reconnect (no race against gracefulDisconnect)', async () => {
    const { pool } = poolWithSession();
    pool.isShuttingDown = true;
    let scheduled = false;
    const realSetTimeout = global.setTimeout;
    (global as any).setTimeout = (fn: any) => { scheduled = true; return { unref() {} }; };
    try { pool.scheduleReconnect(); } finally { (global as any).setTimeout = realSetTimeout; }
    assert(!scheduled, 'shutdown must not schedule a reconnect');
  });

  // === BC37: channel validation at BOTH sites =====================================
  await test('BC37-1: an invalid channel never reaches query() from the replay', async () => {
    const { pool, client } = poolWithSession();
    register(pool, 'evil', ['good_events', 'bad; DROP TABLE tasks--']);
    const r = await pool.establishListens();
    assert(client.listens().length === 1, 'only the valid channel may be listened');
    assert(r.rejected.length === 1, 'the invalid channel must be reported as rejected');
    assert(!client.queries.some((q) => q.includes('DROP TABLE')), 'INJECTION: hostile channel reached SQL');
  });

  // === Structural invariants behaviour cannot prove ===============================
  await test('S1: exactly ONE site issues LISTEN in this file', () => {
    const sites = (SRC.match(/`LISTEN \$\{/g) || []).length;
    assert(sites === 1, `expected 1 LISTEN site, found ${sites} — "the only site" is a property, not a comment`);
  });

  await test('S2: the pool never emits bare \'error\'', () => {
    assert(!/this\.emit\('error'/.test(SRC), "REGRESSION: bare emit('error') is back — it throws when unlistened");
  });

  await test('S3: isConnected = true appears only inside activateConnection', () => {
    const idx = SRC.indexOf('private async activateConnection');
    const end = SRC.indexOf('\n  private', idx + 10);
    const inside = SRC.slice(idx, end);
    const total = (SRC.match(/this\.isConnected = true/g) || []).length;
    assert(total === 1, `isConnected = true must have exactly ONE site, found ${total}`);
    assert(inside.includes('this.isConnected = true'), 'that site must be activateConnection');
  });

  await test('S4: no terminal give-up remains in source', () => {
    assert(!/max-reconnects-reached/.test(SRC), 'the terminal give-up event is back');
    assert(!/maxReconnectAttempts/.test(SRC), 'the reconnect cap is back — the pool can go quiet again');
  });

  await test('S5: channels are validated at the WRITE site, not only at LISTEN', () => {
    const idx = SRC.indexOf('this.connectedSystems.set(systemName');
    const before = SRC.slice(Math.max(0, idx - 700), idx);
    assert(/SAFE_CHANNEL/.test(before), 'BC37: the map may never store an unvalidated channel');
  });

  pg.Client = RealClient;
  console.log(`\n${failed === 0 ? '✅' : '❌'} passed: ${passed}, failed: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
