#!/usr/bin/env ts-node
/**
 * SessionStore unit tests (Phase 2.1 — SESSION-STORE-EXTRACTION-PLAN-v2.md)
 *
 * 10 tests covering:
 *  1. Atomic exchangeAuthCode happy path
 *  2. Atomic exchangeAuthCode race (same microtask tick — exactly one wins)
 *  3. Double-delete safe (deleteAuthCode after exchangeAuthCode is no-op)
 *  4. FIFO eviction (sessions, oauth, authCodes) — insertion-order, not true LRU
 *  5. TTL cleanup with fast interval
 *  6. setContext throws if no transport (AP C-3 invariant)
 *  7. deleteSession atomic across 3 Maps (AP I-3)
 *  8. noCleanup: true skips setInterval registration (sec-ops C3)
 *  9. isAllowedRedirectUri corpus (BC NICE-2)
 * 10. PKCE-keyed vs state-keyed OAuthRequest namespace isolation (sec-ops I3)
 */

import pino from 'pino';
import {
  SessionStore,
  type AuthCodeData,
  type OAuthRequestData,
  type SessionContext,
  type TransportData,
} from '../lib/auth/oauth/session-store';

const silentLogger = pino({ level: 'silent' });

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✅ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`❌ ${name}`);
      console.error(`   ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

// ---- Fixtures ----

const authCodeFixture = (overrides: Partial<AuthCodeData> = {}): AuthCodeData => ({
  userId: 'user-123',
  email: 'user@example.com',
  role: 'USER',
  scope: 'read write',
  audience: 'https://paichart.app/mcp',
  originalClientId: 'chatgpt_abc',
  clientRedirectUri: 'https://chatgpt.com/oauth/callback',
  clientName: 'ChatGPT',
  correlationId: 'corr-xyz',
  timestamp: Date.now(),
  ...overrides,
});

const oauthRequestFixture = (overrides: Partial<OAuthRequestData> = {}): OAuthRequestData => ({
  originalClientId: 'chatgpt_abc',
  clientRedirectUri: 'https://chatgpt.com/oauth/callback',
  correlationId: 'corr-xyz',
  provider: 'github',
  createdAt: Date.now(),
  ...overrides,
});

const transportFixture = (overrides: Partial<TransportData> = {}): TransportData => ({
  created: new Date(),
  authenticated: true,
  ...overrides,
});

const contextFixture = (overrides: Partial<SessionContext> = {}): SessionContext => ({
  userId: 'user-123',
  user: { id: 'user-123', email: 'user@example.com', role: 'USER' },
  authenticated: true,
  authMethod: 'mcp_token',
  ...overrides,
});

// ---- Tests ----

async function run() {
  console.log('🧪 SessionStore unit tests\n');

  // 1. Atomic exchangeAuthCode happy path
  await test('exchangeAuthCode: happy path returns data then null on replay', () => {
    const store = new SessionStore({ logger: silentLogger, noCleanup: true });
    const data = authCodeFixture();
    store.setAuthCode('code-1', data);
    const first = store.exchangeAuthCode('code-1');
    assert(first !== null, 'first exchange should return data');
    assertEqual(first?.userId, 'user-123', 'first.userId');
    const second = store.exchangeAuthCode('code-1');
    assert(second === null, 'second exchange must return null (replay denied)');
    store.destroy();
  });

  // 2. Atomic exchangeAuthCode race — same microtask tick
  await test('exchangeAuthCode: same-tick race — exactly one caller wins', () => {
    const store = new SessionStore({ logger: silentLogger, noCleanup: true });
    store.setAuthCode('code-race', authCodeFixture({ userId: 'race-winner' }));
    // Simulate concurrent dispatch: in JS this means same-tick sync .get + .delete pairs.
    // Both callers run synchronously back-to-back; the atomic invariant says only one returns non-null.
    const a = store.exchangeAuthCode('code-race');
    const b = store.exchangeAuthCode('code-race');
    const winners = [a, b].filter((x) => x !== null);
    assertEqual(winners.length, 1, 'exactly one caller must win');
    assertEqual(winners[0]?.userId, 'race-winner', 'winner gets the data');
    store.destroy();
  });

  // 3. Double-delete safe
  await test('deleteAuthCode after exchangeAuthCode is safe no-op', () => {
    const store = new SessionStore({ logger: silentLogger, noCleanup: true });
    store.setAuthCode('code-dd', authCodeFixture());
    const exchanged = store.exchangeAuthCode('code-dd');
    assert(exchanged !== null, 'exchange returns data');
    const deleted = store.deleteAuthCode('code-dd');
    assertEqual(deleted, false, 'second delete returns false (no-op)');
    // Also verify no exception thrown on third try
    store.deleteAuthCode('code-dd');
    store.destroy();
  });

  // 4. FIFO eviction (insertion-order, not true LRU — Map.keys().next().value)
  await test('FIFO eviction across sessions, oauth, authCodes when at capacity', () => {
    const store = new SessionStore({
      logger: silentLogger,
      noCleanup: true,
      maxSessions: 3,
      maxOAuthRequests: 3,
      maxAuthCodes: 3,
    });

    // Sessions: insert 4, oldest must evict
    store.setSession('s1', transportFixture(), contextFixture());
    store.setSession('s2', transportFixture(), contextFixture());
    store.setSession('s3', transportFixture(), contextFixture());
    store.setSession('s4', transportFixture(), contextFixture());
    assert(!store.hasSession('s1'), 's1 should be evicted (oldest)');
    assert(store.hasSession('s4'), 's4 should be present');
    assertEqual(store.getEvictionStats().sessions, 1, 'sessions eviction counter +1');

    // OAuth requests
    store.setOAuthRequest('state-a', oauthRequestFixture());
    store.setOAuthRequest('state-b', oauthRequestFixture());
    store.setOAuthRequest('state-c', oauthRequestFixture());
    store.setOAuthRequest('state-d', oauthRequestFixture());
    assert(store.getOAuthRequest('state-a') === undefined, 'state-a evicted');
    assert(store.getOAuthRequest('state-d') !== undefined, 'state-d present');
    assertEqual(store.getEvictionStats().oauth, 1, 'oauth eviction counter +1');

    // Auth codes
    store.setAuthCode('c-a', authCodeFixture());
    store.setAuthCode('c-b', authCodeFixture());
    store.setAuthCode('c-c', authCodeFixture());
    store.setAuthCode('c-d', authCodeFixture());
    assert(store.exchangeAuthCode('c-a') === null, 'c-a evicted');
    assertEqual(store.getAuthCodeCount(), 3, 'c-b/c-c/c-d remain (c-a exchange was a no-op miss)');
    assertEqual(store.getEvictionStats().authCodes, 1, 'authCodes eviction counter +1');

    store.destroy();
  });

  // 5. TTL cleanup with fast interval — covers all 3 time-based stores
  await test('TTL cleanup expires stale sessions', async () => {
    const store = new SessionStore({
      logger: silentLogger,
      sessionTtlMs: 10,            // 10ms TTL
      cleanupIntervalMs: 5,        // 5ms interval
      noCleanup: false,             // explicitly start cleanup
    });
    store.setSession('s-stale', transportFixture(), contextFixture());
    assertEqual(store.getSessionCount(), 1, 'session registered');
    // Wait for TTL + interval to fire at least once
    await new Promise((r) => setTimeout(r, 40));
    assertEqual(store.getSessionCount(), 0, 'stale session cleaned by TTL interval');
    store.destroy();
  });

  // 5b. TTL cleanup also evicts stale OAuth requests (Time Bomb Cat 4 defence-in-depth)
  await test('TTL cleanup expires stale OAuth requests', async () => {
    const store = new SessionStore({
      logger: silentLogger,
      sessionTtlMs: 60_000,        // long, irrelevant
      oauthRequestTtlMs: 10,       // 10ms TTL for OAuth requests
      cleanupIntervalMs: 5,
      noCleanup: false,
    });
    // Stale entry: createdAt in the past
    store.setOAuthRequest('state-stale', oauthRequestFixture({ createdAt: Date.now() - 1000 }));
    // Fresh entry: createdAt now
    store.setOAuthRequest('state-fresh', oauthRequestFixture({ createdAt: Date.now() }));
    assertEqual(store.getOAuthRequestCount(), 2, 'both entries registered');
    await new Promise((r) => setTimeout(r, 40));
    assert(store.getOAuthRequest('state-stale') === undefined, 'stale OAuth request evicted');
    // Note: state-fresh's createdAt is also now older than 10ms after the wait — also evicted.
    // The key test: stale ones eviction is enforced by SessionStore, not caller setTimeouts.
    assertEqual(store.getOAuthRequestCount(), 0, 'all entries past TTL evicted by internal loop');
    store.destroy();
  });

  // 5c. TTL cleanup also evicts stale auth codes (Time Bomb Cat 4 defence-in-depth)
  await test('TTL cleanup expires stale auth codes', async () => {
    const store = new SessionStore({
      logger: silentLogger,
      sessionTtlMs: 60_000,
      authCodeTtlMs: 10,           // 10ms TTL for auth codes
      cleanupIntervalMs: 5,
      noCleanup: false,
    });
    store.setAuthCode('pac_stale', authCodeFixture({ timestamp: Date.now() - 1000 }));
    store.setAuthCode('pac_fresh', authCodeFixture({ timestamp: Date.now() }));
    assertEqual(store.getAuthCodeCount(), 2, 'both auth codes registered');
    await new Promise((r) => setTimeout(r, 40));
    assert(store.exchangeAuthCode('pac_stale') === null, 'stale auth code evicted');
    assertEqual(store.getAuthCodeCount(), 0, 'all auth codes past TTL evicted by internal loop');
    store.destroy();
  });

  // 6. setContext invariant
  await test('setContext throws if session not previously set', () => {
    const store = new SessionStore({ logger: silentLogger, noCleanup: true });
    let threw = false;
    try {
      store.setContext('unknown-session', contextFixture());
    } catch (err) {
      threw = true;
      assert(
        err instanceof Error && err.message.includes('cannot set context'),
        `wrong error: ${err}`
      );
    }
    assert(threw, 'setContext on unknown session must throw');
    store.destroy();
  });

  // 7. deleteSession atomic across 3 Maps
  await test('deleteSession removes from transport+context+timestamp Maps atomically', () => {
    const store = new SessionStore({ logger: silentLogger, noCleanup: true });
    store.setSession('s-del', transportFixture(), contextFixture());
    assert(store.hasSession('s-del'), 'session present pre-delete');
    assert(store.getContext('s-del') !== undefined, 'context present pre-delete');

    const wasDeleted = store.deleteSession('s-del');
    assertEqual(wasDeleted, true, 'first delete returns true');
    assert(!store.hasSession('s-del'), 'transport gone');
    assert(store.getContext('s-del') === undefined, 'context gone');

    // Idempotency
    const wasDeletedAgain = store.deleteSession('s-del');
    assertEqual(wasDeletedAgain, false, 'second delete returns false');

    store.destroy();
  });

  // 8. noCleanup option
  await test('new SessionStore({noCleanup: true}) does NOT register cleanup interval', () => {
    const store = new SessionStore({ logger: silentLogger, noCleanup: true });
    assertEqual(store.__hasCleanupInterval(), false, 'no interval registered');
    // And manual startCleanup() flips it on
    store.startCleanup();
    assertEqual(store.__hasCleanupInterval(), true, 'startCleanup registers interval');
    // Idempotent
    store.startCleanup();
    assertEqual(store.__hasCleanupInterval(), true, 'idempotent startCleanup');
    store.destroy();
    assertEqual(store.__hasCleanupInterval(), false, 'destroy clears interval');
  });

  // 9. isAllowedRedirectUri corpus
  await test('isAllowedRedirectUri allowlist corpus', () => {
    const store = new SessionStore({ logger: silentLogger, noCleanup: true });

    // Allowed: localhost (any scheme, any port)
    assert(store.isAllowedRedirectUri('http://localhost:54321/cb'), 'localhost allowed');
    assert(store.isAllowedRedirectUri('http://127.0.0.1:54321/cb'), '127.0.0.1 allowed');

    // Allowed: HTTPS on known domains + subdomains
    assert(store.isAllowedRedirectUri('https://claude.ai/oauth/cb'), 'claude.ai allowed');
    assert(store.isAllowedRedirectUri('https://app.claude.ai/cb'), 'subdomain allowed');
    assert(store.isAllowedRedirectUri('https://chatgpt.com/cb'), 'chatgpt.com allowed');
    assert(store.isAllowedRedirectUri('https://paichart.app/cb'), 'paichart.app allowed');

    // Denied: HTTP on known domains
    assert(!store.isAllowedRedirectUri('http://claude.ai/cb'), 'http://claude.ai DENIED');

    // Denied: unknown domain
    assert(!store.isAllowedRedirectUri('https://evil.com/cb'), 'evil.com DENIED');

    // Denied: hostname-suffix evasion (e.g., notclaude.ai should NOT match claude.ai)
    assert(!store.isAllowedRedirectUri('https://notclaude.ai/cb'), 'notclaude.ai DENIED');
    assert(!store.isAllowedRedirectUri('https://claude.ai.evil.com/cb'), 'claude.ai.evil.com DENIED');

    // Denied: null / undefined / invalid
    assert(!store.isAllowedRedirectUri(null), 'null DENIED');
    assert(!store.isAllowedRedirectUri(undefined), 'undefined DENIED');
    assert(!store.isAllowedRedirectUri(''), 'empty DENIED');
    assert(!store.isAllowedRedirectUri('not a url'), 'garbage DENIED');

    // Static corpus accessor
    assert(
      SessionStore.ALLOWED_OAUTH_REDIRECT_DOMAINS.includes('claude.ai'),
      'static accessor exposes corpus'
    );
    store.destroy();
  });

  // 10. PKCE-keyed vs state-keyed namespace isolation
  await test('OAuthRequest namespace: state-keyed and pkce-keyed entries are independent', () => {
    const store = new SessionStore({ logger: silentLogger, noCleanup: true });
    const stateData = oauthRequestFixture({ correlationId: 'via-state' });
    const pkceData = oauthRequestFixture({ correlationId: 'via-pkce' });

    store.setOAuthRequest('state-nonce-1', stateData);
    store.setOAuthRequest('pkce:challenge-1', pkceData);

    // Independent retrieval
    assertEqual(
      store.getOAuthRequest('state-nonce-1')?.correlationId,
      'via-state',
      'state lookup returns state entry'
    );
    assertEqual(
      store.getOAuthRequest('pkce:challenge-1')?.correlationId,
      'via-pkce',
      'pkce lookup returns pkce entry'
    );

    // Independent deletion — deleting one must NOT affect the other
    store.deleteOAuthRequest('state-nonce-1');
    assert(store.getOAuthRequest('state-nonce-1') === undefined, 'state entry deleted');
    assert(
      store.getOAuthRequest('pkce:challenge-1') !== undefined,
      'pkce entry survives state deletion'
    );

    store.destroy();
  });

  // ---- Report ----
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    console.error(`\n❌ SessionStore tests FAILED`);
    process.exit(1);
  }
  console.log(`\n✅ All SessionStore tests passed`);
}

run().catch((err) => {
  console.error('Unhandled error in test runner:', err);
  process.exit(1);
});
