#!/usr/bin/env ts-node
/**
 * TEST: authRefreshLimiter per-token keying + dedicated store
 * (loopback-refresh fix, 2026-06-13, PLAN-v2 — sec-ops/auth/arch reviewed).
 *
 * BEHAVIORAL test (constructs real NextRequest objects — verified runnable under
 * ts-node, unlike most middleware which we source-guard). Locks the properties
 * that actually contain the correlated-mass-logout blast radius:
 *   1. default IP keying unchanged (regression guard for the ~15 other limiters)
 *   2. two different refresh tokens → INDEPENDENT buckets (the core property)
 *   3. same token shares one bucket, trips at 60
 *   4. cookieless requests fall back to a per-IP bucket, distinct namespace
 *   5. dedicated store: token-churn cannot evict the SHARED singleton's keys
 *   6. structural namespacing: a generator's bucket can't collide with default
 *
 * DATABASE_URL stubbed before imports (CI has no DB; @/lib/config reads env).
 * Run: npm run test:refresh-rate-limit
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
// TRUSTED_PROXY lets getClientIP read x-forwarded-for so IP-keyed cases are
// controllable; per-token cases don't depend on it.
process.env.TRUSTED_PROXY = '1';

import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { authRefreshLimiter, createRateLimiter, checkRateLimit } from '@/lib/middleware/rate-limit';
import { getClientIP } from '@/lib/utils/client-ip';

const HOUR = 60 * 60 * 1000;
const PATH = 'https://paichart.app/api/auth/refresh';

let passed = 0, failed = 0;
const failures: string[] = [];
const pass = (m: string) => { passed++; console.log(`  ✅ ${m}`); };
const fail = (m: string, d?: string) => { failed++; failures.push(d ? `${m} — ${d}` : m); console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`); };

// Build a NextRequest to the refresh route with an optional refresh_token cookie
// and optional client IP (via x-forwarded-for, trusted because TRUSTED_PROXY set).
function makeReq(opts: { cookie?: string; ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.cookie !== undefined) headers.cookie = `refresh_token=${opts.cookie}; junk=1`;
  if (opts.ip) headers['x-forwarded-for'] = opts.ip;
  return new NextRequest(PATH, { headers });
}

// allowed === true when limiter returns null (not a 429 response)
const allowed = (req: NextRequest) => authRefreshLimiter(req) === null;

console.log('\n🔒 TEST — authRefreshLimiter per-token keying + dedicated store\n');

// 1. Default IP keying unchanged for a vanilla limiter (regression guard).
{
  const lim = createRateLimiter({ limit: 2, windowMs: HOUR, message: 'x' });
  const a1 = lim(new NextRequest('https://paichart.app/api/x', { headers: { 'x-forwarded-for': '10.0.0.1' } }));
  const a2 = lim(new NextRequest('https://paichart.app/api/x', { headers: { 'x-forwarded-for': '10.0.0.1' } }));
  const a3 = lim(new NextRequest('https://paichart.app/api/x', { headers: { 'x-forwarded-for': '10.0.0.1' } }));
  const other = lim(new NextRequest('https://paichart.app/api/x', { headers: { 'x-forwarded-for': '10.0.0.2' } }));
  if (a1 === null && a2 === null && a3 !== null) pass('1 default IP keying: same IP shares bucket, trips at limit');
  else fail('1 default IP keying broken', `a1=${a1===null} a2=${a2===null} a3blocked=${a3!==null}`);
  if (other === null) pass('1b default IP keying: different IP = independent bucket');
  else fail('1b different IP not independent');
}

// 2. CORE PROPERTY: two different refresh tokens get independent buckets.
//    Exhaust token A (60 allowed, 61st blocked); token B must be untouched.
{
  let aTrippedAt = -1;
  for (let i = 1; i <= 61; i++) {
    if (!allowed(makeReq({ cookie: 'token-A' }))) { aTrippedAt = i; break; }
  }
  const bStillOk = allowed(makeReq({ cookie: 'token-B' }));
  if (aTrippedAt === 61) pass('2 token A trips on the 61st request (ceiling 60)');
  else fail('2 token A ceiling wrong', `tripped at ${aTrippedAt}, expected 61`);
  if (bStillOk) pass('2b token B bucket INDEPENDENT of token A (blast-radius contained)');
  else fail('2b token B affected by token A — shared bucket regression');
}

// 3. Same token shares ONE bucket regardless of differing client IP
//    (per-token keying is IP-independent — the whole point: the loopback
//    presents one egress IP, yet must not collapse distinct sessions).
{
  const c = 'token-shared';
  // Different IPs, same token → same bucket. Exhaust across mixed IPs.
  let trippedAt = -1;
  for (let i = 1; i <= 61; i++) {
    const ip = `192.168.0.${i % 50}`;
    if (!allowed(makeReq({ cookie: c, ip }))) { trippedAt = i; break; }
  }
  if (trippedAt === 61) pass('3 same token across DIFFERENT IPs shares one bucket (IP-independent)');
  else fail('3 per-token keying leaked IP into the bucket', `tripped at ${trippedAt}`);
}

// 4. Cookieless requests fall back to a per-IP bucket, namespaced distinctly
//    from token buckets (cookieless POSTs 401 instantly at the route — only
//    probes live here — so this bucket existing at all is just defense).
{
  let trippedAt = -1;
  for (let i = 1; i <= 61; i++) {
    if (!allowed(makeReq({ ip: '203.0.113.7' }))) { trippedAt = i; break; }   // no cookie
  }
  const otherIpOk = allowed(makeReq({ ip: '203.0.113.8' }));
  if (trippedAt === 61) pass('4 cookieless: per-IP fallback bucket trips at 60');
  else fail('4 cookieless fallback ceiling wrong', `tripped at ${trippedAt}`);
  if (otherIpOk) pass('4b cookieless: different IP = independent fallback bucket');
  else fail('4b cookieless IPs not independent');
}

// 5. DEDICATED STORE: the limiter must NOT share the singleton store, or
//    attacker token-churn would FIFO-evict other limiters' brute-force counters.
//    Precise proof: exhaust the EXACT key the limiter would generate, but in the
//    SHARED store (via checkRateLimit). If the limiter shared that store it would
//    now be blocked; a fresh allow proves its store is private.
{
  const cookie = 'isolation-token';
  const hash = createHash('sha256').update(cookie).digest('hex').slice(0, 16);
  const sharedKey = `kg:/api/auth/refresh:tok:${hash}`;
  for (let i = 0; i < 60; i++) checkRateLimit(sharedKey, 60, HOUR);     // fill shared store for this exact key
  const sharedNowBlocked = !checkRateLimit(sharedKey, 60, HOUR).allowed; // confirm we exhausted it
  const limiterStillAllows = allowed(makeReq({ cookie }));               // limiter's PRIVATE store is fresh
  if (sharedNowBlocked) pass('5 shared-store key exhausted (test setup valid)');
  else fail('5 could not exhaust shared store key');
  if (limiterStillAllows) pass('5b limiter uses a DEDICATED store (immune to shared-store exhaustion)');
  else fail('5b limiter shares the singleton store — eviction-of-other-counters regression');
}

// 6. Structural namespacing: a generator's bucket cannot collide with a default
//    IP-keyed bucket on the SAME pathname in the shared store.
{
  const SAMEPATH = 'https://paichart.app/api/ns-test';
  const genLim = createRateLimiter({ limit: 1, windowMs: HOUR, message: 'x', keyGenerator: () => 'CONST' });
  const ipLim = createRateLimiter({ limit: 1, windowMs: HOUR, message: 'x' });
  // Exhaust the generator-keyed bucket (kg:/api/ns-test:CONST).
  genLim(new NextRequest(SAMEPATH, { headers: { 'x-forwarded-for': '8.8.8.8' } }));
  const genBlocked = genLim(new NextRequest(SAMEPATH, { headers: { 'x-forwarded-for': '8.8.8.8' } })) !== null;
  // The default IP-keyed bucket (8.8.8.8:/api/ns-test) must be untouched.
  const ipOk = ipLim(new NextRequest(SAMEPATH, { headers: { 'x-forwarded-for': '8.8.8.8' } })) === null;
  if (genBlocked) pass('6 generator-keyed bucket trips independently');
  else fail('6 generator bucket did not trip');
  if (ipOk) pass('6b generator bucket does NOT collide with default IP bucket (same path)');
  else fail('6b namespace collision: generator key clobbered default IP key');
}

// 7. L6 fix: getClientIP (now shared lib/utils/client-ip.ts) prefers
//    CF-Connecting-IP, beating XFF, and a default IP-keyed limiter buckets by it.
//    Without this, prod (TRUSTED_PROXY unset) keyed every request on one constant
//    ⇒ all IP-keyed limiters shared ONE global bucket (platform-wide false locks).
{
  const cfReq = new NextRequest(PATH, { headers: { 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' } });
  if (getClientIP(cfReq) === '9.9.9.9') pass('7 CF-Connecting-IP wins over x-forwarded-for');
  else fail('7 CF-Connecting-IP not preferred', getClientIP(cfReq));

  const xffReq = new NextRequest(PATH, { headers: { 'x-forwarded-for': '2.2.2.2' } });
  if (getClientIP(xffReq) === '2.2.2.2') pass('7b falls back to XFF when no CF header (TRUSTED_PROXY set)');
  else fail('7b XFF fallback broken', getClientIP(xffReq));

  // A default IP-keyed limiter now buckets by CF-Connecting-IP.
  const lim = createRateLimiter({ limit: 1, windowMs: HOUR, message: 'x' });
  const p = 'https://paichart.app/api/cf-test';
  lim(new NextRequest(p, { headers: { 'cf-connecting-ip': '9.9.9.9' } }));
  const sameBlocked = lim(new NextRequest(p, { headers: { 'cf-connecting-ip': '9.9.9.9' } })) !== null;
  const otherOk = lim(new NextRequest(p, { headers: { 'cf-connecting-ip': '8.8.8.8' } })) === null;
  if (sameBlocked) pass('7c same CF-IP shares bucket (trips at limit)');
  else fail('7c same CF-IP did not share bucket');
  if (otherOk) pass('7d different CF-IP = independent bucket (global-bucketing fixed)');
  else fail('7d different CF-IP not independent');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
console.log('✅ authRefreshLimiter per-token keying + dedicated store verified\n');
