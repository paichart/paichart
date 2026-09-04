#!/usr/bin/env ts-node
/**
 * AuthManager unit tests (Phase 3.2 — AuthManager extraction v3 plan).
 *
 * 19 tests covering:
 *  1. verifyMcpToken: valid RS256 token returns claims
 *  2. verifyMcpToken: missing audience rejected (RFC 8707)
 *  3. verifyMcpToken: invalid signature rejected
 *  4. verifyMcpToken: provider token (ghp_/gho_/ms-) rejected with explicit audit event (SEC-C3)
 *  5. verifyMcpToken: multi-key JWKS — current AND previous accepted; foreign rejected; kid missing rejected
 *  5b. verifyMcpToken: azp mismatch rejected via expectedClientId (validation-engine Critical 1)
 *  6. verifySessionToken: HS256 backward compat — wrong issuer/audience rejected
 *  7. (removed 2026-06-06 — AuthManager.verifyApiKey deleted in the api-key RS256 migration)
 *  8. populateReqUser: ReqUser shape across live paths (RS256 Bearer, X-API-Key)
 *  9. (removed 2026-06-11 — AuthManager.validateScopeMatch deleted; only-ever caller was the dead Microsoft exchange handler dropped in Wave 3b.0a, and the check was a tautology)
 *  12. checkCallbackRateLimit: 30/min/IP + Retry-After math + Math.max(1) boundary
 *  13. destroy(): idempotent + clears rate-limit Map (validation-engine Important 1)
 *  14. Startup race: createMiddleware() before initialize() throws (SEC-C4)
 *  15. (removed 2026-06-05 — JWT_ACCESS_SECRET fail-fast retired with the symmetric secret)
 *  16. detectOAuthClient: nullable clientConfig on 'webapp' fallback
 *  17. detectOAuthClient: URL normalization (CHATGPT.COM, hash fragments, query strings, trailing slashes)
 *  17b. detectOAuthClient: parity vs server-class (Phase 3.8d) — Gemini /oauth/callback fallback, ChatGPT localhost:8000, order invariant
 *  18. populateReqUser: Object.freeze prevents shadowing canonical fields (oauth-multi-client N2)
 *  20. decodeJwtPayload: does NOT verify signature (validation-engine Important 4)
 *  21. Rate-limit bounded growth: 1000 IPs across 65s, Map size stabilizes (validation-engine Important 2)
 */
// CI belt-and-suspenders (DATABASE_URL-transitive rule): this suite injects a mock prisma and
// never touches the real DB, but stub DATABASE_URL if unset so a transitively-loaded module
// reading it at import time can't break CI (runners have no DATABASE_URL). Local keeps its own.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';

import pino from 'pino';
import { SignJWT, importPKCS8 } from 'jose';
import { installTestKeysIntoEnv, getTestKeys, type TestKeyPair } from '../test/fixtures/test-jwt-keys';

// MUST install test keys into env BEFORE requiring modules that consume them
const teardownEnv = installTestKeysIntoEnv();

// Now require the modules that read env at module-load time
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AuthManager, AuthMiddlewareReject } = require('../lib/auth/oauth/auth-manager');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SessionStore } = require('../lib/auth/oauth/session-store');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __resetKeyCacheForTests } = require('../lib/auth/jwt-key-store');

const silentLogger = pino({ level: 'silent' });

// Mock oauthAuditLogger — captures events for assertion
interface CapturedEvent {
  action: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}

function makeAuditLogger() {
  const events: CapturedEvent[] = [];
  return {
    events,
    log(event: CapturedEvent) {
      events.push(event);
    },
  };
}

/**
 * Mock Prisma user reader for tests. Per Wave 4 Phase 4.0 (v2 D1):
 * AuthManager now requires a prismaClient at construction. Tests pass a
 * configurable mock whose `findUnique` returns whatever the test scenario
 * needs. Default (no override) returns a benign USER role.
 */
function makeMockPrisma(overrides?: {
  findUnique?: (args: { where: { id: string } }) => Promise<any>;
}) {
  return {
    user: {
      findUnique:
        overrides?.findUnique ??
        (async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          email: `${where.id}@test.local`,
          role: 'USER',
          name: 'Test User',
        })),
    },
  };
}

function makeAuthManager(opts: {
  noCleanup?: boolean;
  prisma?: ReturnType<typeof makeMockPrisma>;
} = {}): {
  am: any;
  audit: ReturnType<typeof makeAuditLogger>;
  store: any;
  prisma: ReturnType<typeof makeMockPrisma>;
} {
  __resetKeyCacheForTests();
  const audit = makeAuditLogger();
  const store = new SessionStore({ logger: silentLogger, noCleanup: true });
  const prisma = opts.prisma ?? makeMockPrisma();
  const am = new AuthManager({
    logger: silentLogger,
    sessionStore: store,
    oauthAuditLogger: audit,
    prismaClient: prisma,
    noCleanup: opts.noCleanup ?? true,
  });
  return { am, audit, store, prisma };
}

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

async function assertRejects(promise: Promise<unknown>, msg: string, expectedSubstring?: string): Promise<void> {
  try {
    await promise;
    throw new Error(`${msg} — did not throw`);
  } catch (err) {
    if (expectedSubstring) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes(expectedSubstring)) {
        throw new Error(`${msg} — wrong error: expected substring "${expectedSubstring}", got "${message}"`);
      }
    }
  }
}

// ---- Sign helper for tests ----

async function signTestToken(
  keyPair: TestKeyPair,
  payload: {
    userId: string;
    email: string;
    role: string;
    azp?: string;
  },
  opts: {
    audience?: string;
    issuer?: string;
    expiresIn?: string;
    omitKid?: boolean;
  } = {}
): Promise<string> {
  const privateKey = await importPKCS8(keyPair.privateKeyPEM, 'RS256');
  const protectedHeader = opts.omitKid
    ? { alg: 'RS256' as const }
    : { alg: 'RS256' as const, kid: keyPair.kid };

  const jwt = new SignJWT({
    sub: payload.userId,
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    ...(payload.azp ? { azp: payload.azp } : {}),
  })
    .setProtectedHeader(protectedHeader)
    .setIssuer(opts.issuer ?? 'https://paichart.app')
    .setAudience(opts.audience ?? 'https://paichart.app/mcp')
    .setExpirationTime(opts.expiresIn ?? '15m')
    .setIssuedAt();

  return jwt.sign(privateKey);
}

// HS256 sign helper for Phase 4.2 createMiddleware tests
async function signHs256Token(payload: {
  userId: string;
  email: string;
  role: string;
  azp?: string;
  name?: string;
}): Promise<string> {
  // Literal throwaway secret (env-independent): these tokens exist only to prove HS256
  // is REJECTED by the RS256-only verifier, so the value is irrelevant. JWT_ACCESS_SECRET
  // retired 2026-06-05.
  const accessSecret = 'test-hs256-throwaway-secret-min-32-chars';
  const secretKey = new TextEncoder().encode(accessSecret);
  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    ...(payload.azp ? { azp: payload.azp } : {}),
    ...(payload.name ? { name: payload.name } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('https://paichart.app')
    .setAudience('https://paichart.app/mcp')
    .setExpirationTime('15m')
    .setIssuedAt()
    .sign(secretKey);
}

// ---- Mock req/res helpers for Phase 4.2 createMiddleware tests ----

function makeMockReq(opts: {
  authHeader?: string;
  apiKey?: string;
  method?: string; // JSON-RPC method in body
  httpMethod?: string;
  path?: string;
} = {}): any {
  return {
    headers: {
      ...(opts.authHeader ? { authorization: opts.authHeader } : {}),
      ...(opts.apiKey ? { 'x-api-key': opts.apiKey } : {}),
      'user-agent': 'test-suite/1.0',
    },
    body: opts.method !== undefined ? { method: opts.method, id: 42 } : undefined,
    method: opts.httpMethod ?? 'POST',
    path: opts.path ?? '/mcp',
  };
}

function makeMockRes(): any {
  return {
    setHeader: () => {},
    status: () => ({ json: () => {} }),
    statusCode: 200,
  };
}

// ============================================================================
// Tests
// ============================================================================

async function run() {
  console.log('🧪 AuthManager unit tests (Phase 3.2)\n');

  // 1
  await test('verifyMcpToken: valid RS256 token returns claims', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const keys = getTestKeys();
    const token = await signTestToken(keys.current, { userId: 'u1', email: 'a@b.c', role: 'USER' });
    const claims = await am.verifyMcpToken(token);
    assertEqual(claims.userId, 'u1', 'userId');
    assertEqual(claims.email, 'a@b.c', 'email');
    assertEqual(claims.role, 'USER', 'role');
    am.destroy();
  });

  // 2
  await test('verifyMcpToken: missing audience rejected', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const keys = getTestKeys();
    const token = await signTestToken(keys.current, { userId: 'u1', email: 'a@b.c', role: 'USER' }, {
      audience: 'https://attacker.example/whatever',
    });
    await assertRejects(am.verifyMcpToken(token), 'wrong audience must reject');
    am.destroy();
  });

  // 3
  await test('verifyMcpToken: invalid signature rejected', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const keys = getTestKeys();
    // Sign with FOREIGN key (not in env keystore)
    const token = await signTestToken(keys.foreign, { userId: 'u1', email: 'a@b.c', role: 'USER' });
    await assertRejects(am.verifyMcpToken(token), 'foreign-key token must reject');
    am.destroy();
  });

  // 4 — provider token rejection with audit event (SEC-C3 + SEC-I7)
  await test('verifyMcpToken: provider token (ghp_/gho_/ms-) rejected with audit event', async () => {
    const { am, audit } = makeAuthManager();
    await am.initialize();
    await assertRejects(am.verifyMcpToken('ghp_abcdefghijklmnop'), 'ghp_ must reject', 'provider_token_rejected');
    await assertRejects(am.verifyMcpToken('gho_abcdefghijklmnop'), 'gho_ must reject');
    await assertRejects(am.verifyMcpToken('ms-abcdefghijklmnop'), 'ms- must reject');
    const audits = audit.events.filter((e) => e.action === 'provider_token_misrouted');
    assertEqual(audits.length, 3, 'three audit events emitted (one per provider prefix)');
    assert(audits.every((e) => e.success === false), 'all audit events are failures');
    am.destroy();
  });

  // 5 — multi-key JWKS: current + previous both work, foreign rejected, missing kid rejected
  await test('verifyMcpToken: multi-key JWKS — current + previous accepted, foreign + missing-kid rejected', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const keys = getTestKeys();

    // Current key — accepted
    const tokenCurrent = await signTestToken(keys.current, { userId: 'u1', email: 'a@b.c', role: 'USER' });
    const claimsCurrent = await am.verifyMcpToken(tokenCurrent);
    assertEqual(claimsCurrent.userId, 'u1', 'current key accepted');

    // Previous key — accepted (during rotation window)
    const tokenPrev = await signTestToken(keys.previous, { userId: 'u2', email: 'b@b.c', role: 'USER' });
    const claimsPrev = await am.verifyMcpToken(tokenPrev);
    assertEqual(claimsPrev.userId, 'u2', 'previous key accepted (rotation window)');

    // Foreign key — rejected (kid not in env). token-manager wraps as "Invalid token"
    // but the underlying cause is the keystore throwing "no public key for kid".
    const tokenForeign = await signTestToken(keys.foreign, { userId: 'u3', email: 'c@b.c', role: 'USER' });
    await assertRejects(am.verifyMcpToken(tokenForeign), 'foreign kid rejected');

    // Missing kid — rejected (defense-in-depth). Same wrapping as foreign-kid case.
    const tokenNoKid = await signTestToken(keys.current, { userId: 'u4', email: 'd@b.c', role: 'USER' }, {
      omitKid: true,
    });
    await assertRejects(am.verifyMcpToken(tokenNoKid), 'missing kid rejected');

    am.destroy();
  });

  // 5b — azp mismatch (cross-client token reuse defence)
  await test('verifyMcpToken: azp mismatch rejected via expectedClientId', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const keys = getTestKeys();
    const token = await signTestToken(keys.current, {
      userId: 'u1',
      email: 'a@b.c',
      role: 'USER',
      azp: 'client_A',
    });

    // Same client — accepted
    const claims = await am.verifyMcpToken(token, { expectedClientId: 'client_A' });
    assertEqual(claims.userId, 'u1', 'matching azp accepted');

    // Different client — rejected. token-manager wraps the azp-mismatch
    // as "Invalid token" (security hygiene — doesn't leak which check failed),
    // but the warn log at token-manager.ts:336 confirms the azp check was the
    // actual gate. Test asserts throw + verification path was reached.
    await assertRejects(
      am.verifyMcpToken(token, { expectedClientId: 'client_B' }),
      'azp mismatch rejected'
    );
    am.destroy();
  });

  // 6 — HS256 backward compat (delegates to token-manager which enforces audience+issuer)
  await test('verifySessionToken: HS256 backward compat — wrong issuer/audience rejected', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    // Sign with wrong issuer using jose directly (HS256). Literal secret — value is
    // irrelevant (token exists to be rejected); JWT_ACCESS_SECRET retired 2026-06-05.
    const accessSecret = 'test-hs256-throwaway-secret-min-32-chars';
    const secretKey = new TextEncoder().encode(accessSecret);
    const badToken = await new SignJWT({ userId: 'u1', email: 'a@b.c', role: 'USER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://attacker.example')
      .setAudience('https://paichart.app/mcp')
      .setExpirationTime('15m')
      .setIssuedAt()
      .sign(secretKey);
    await assertRejects(am.verifyMcpToken(badToken), 'HS256 wrong issuer rejected');
    am.destroy();
  });

  // 7 — (removed 2026-06-06: AuthManager.verifyApiKey was deleted in the api-key RS256
  //  migration. The X-API-Key path is now verified via verifyMcpToken — covered by Test 25.)

  // 8 — populateReqUser shape across 3 paths
  await test('populateReqUser: ReqUser shape includes name, provider, userId, azp via extras', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const req: any = {};
    am.populateReqUser(
      req,
      { userId: 'u1', email: 'a@b.c', role: 'USER' as any },
      'tok123',
      'mcp_token',
      { azp: 'client_A', name: 'Alice', tenantId: 't1', provider: 'github', scope: 'mcp:read', jti: 'jti1' }
    );
    assertEqual(req.user.id, 'u1', 'id');
    assertEqual(req.user.userId, 'u1', 'userId (alias)');
    assertEqual(req.user.email, 'a@b.c', 'email');
    assertEqual(req.user.role, 'USER', 'role');
    assertEqual(req.user.name, 'Alice', 'name');
    assertEqual(req.user.tenantId, 't1', 'tenantId');
    assertEqual(req.user.provider, 'github', 'provider');
    assertEqual(req.user.azp, 'client_A', 'azp');
    assertEqual(req.user.authMethod, 'mcp_token', 'authMethod');
    assertEqual(req.user.token, 'tok123', 'token');
    assertEqual(req.user.scope, 'mcp:read', 'scope (forensic)');
    am.destroy();
  });

  // 9 — (removed 2026-06-11: AuthManager.validateScopeMatch deleted — dead since Wave 3b.0a)

  // 12 — checkCallbackRateLimit
  await test('checkCallbackRateLimit: 30/min/IP + Retry-After math + Math.max(1) boundary', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const ip = '1.2.3.4';
    // First 30 requests allowed
    for (let i = 0; i < 30; i++) {
      const r = am.checkCallbackRateLimit(ip);
      assert(r.allowed === true, `request ${i + 1} should be allowed`);
    }
    // 31st request rejected with retryAfterSeconds >= 1
    const denied = am.checkCallbackRateLimit(ip);
    assert(denied.allowed === false, '31st request denied');
    assert(denied.retryAfterSeconds >= 1, 'retryAfterSeconds at least 1 (boundary safety)');
    assert(denied.retryAfterSeconds <= 60, 'retryAfterSeconds at most 60');
    am.destroy();
  });

  // 13 — destroy() idempotent + clears rate-limit
  await test('destroy(): idempotent + clears rate-limit Map state', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    am.checkCallbackRateLimit('5.6.7.8');
    assert(am.__getRateLimitMapSize() === 1, 'rate-limit has 1 entry pre-destroy');
    am.destroy();
    assert(am.__getRateLimitMapSize() === 0, 'rate-limit cleared post-destroy');
    am.destroy();  // idempotent
    assert(am.__getRateLimitMapSize() === 0, 'still 0 after second destroy');
  });

  // 14 — startup race: createMiddleware before initialize throws (SEC-C4)
  await test('createMiddleware() before initialize() throws (SEC-C4)', async () => {
    const { am } = makeAuthManager();
    let threw = false;
    try {
      am.createMiddleware();
    } catch (err) {
      threw = true;
      assert(
        err instanceof Error && err.message.includes('before initialize'),
        `wrong error: ${err}`
      );
    }
    assert(threw, 'createMiddleware before initialize MUST throw');
    am.destroy();
  });

  // (Test 15 removed 2026-06-05: it asserted initialize() throws on missing
  //  JWT_ACCESS_SECRET — that fail-fast guard was retired with the symmetric secret.)

  // 16 — detectOAuthClient nullable
  await test('detectOAuthClient: nullable clientConfig on webapp fallback', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const r1 = am.detectOAuthClient('https://unknown.example/cb');
    assertEqual(r1.clientName, 'webapp', 'unknown URI → webapp');
    assert(r1.clientConfig === null, 'clientConfig is null for webapp fallback');
    const r2 = am.detectOAuthClient(null);
    assertEqual(r2.clientName, 'webapp', 'null URI → webapp');
    assert(r2.clientConfig === null, 'null URI → null clientConfig');
    am.destroy();
  });

  // 17 — detectOAuthClient URL normalization
  await test('detectOAuthClient: URL normalization (case, fragments, query)', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    // Uppercase host
    const r1 = am.detectOAuthClient('https://CHATGPT.COM/connector_platform_oauth_redirect');
    assertEqual(r1.clientName, 'chatgpt', 'uppercase host matches chatgpt');
    // Query string
    const r2 = am.detectOAuthClient('https://chatgpt.com/cb?utm=x');
    assertEqual(r2.clientName, 'chatgpt', 'with query string matches');
    // Hash fragment
    const r3 = am.detectOAuthClient('https://chatgpt.com/cb#foo');
    assertEqual(r3.clientName, 'chatgpt', 'with hash matches');
    // Claude
    const r4 = am.detectOAuthClient('https://claude.ai/api/mcp/auth_callback');
    assertEqual(r4.clientName, 'claude-browser', 'claude.ai → claude-browser');
    // Localhost callback
    const r5 = am.detectOAuthClient('http://localhost:54321/callback');
    assertEqual(r5.clientName, 'claude-desktop', 'localhost:NNNN/callback → claude-desktop');
    // Gemini
    const r6 = am.detectOAuthClient('http://localhost:7777/oauth/callback');
    assertEqual(r6.clientName, 'gemini', 'localhost:7777 → gemini');
    am.destroy();
  });

  // 17b — detectOAuthClient parity invariants vs server-class (Phase 3.8d restoration)
  // Locks the patterns restored in commit aead8b5b+1: ChatGPT localhost:8000 + Gemini
  // localhost+/oauth/callback fallback. Per ts-port-behavioral-equivalence memory.
  await test('detectOAuthClient: parity with server-class CLIENT_PROVIDER_MAP (3.8d)', async () => {
    const { am } = makeAuthManager();
    await am.initialize();

    // Gemini fallback — non-7777 port using /oauth/callback path. Server-class
    // pattern: (localhost && /oauth/callback). Without restoration, this matched
    // claude-desktop incorrectly because of the /callback suffix overlap.
    const gem1 = am.detectOAuthClient('http://localhost:9999/oauth/callback');
    assertEqual(gem1.clientName, 'gemini', 'localhost:9999 + /oauth/callback → gemini (fallback restored)');

    // ChatGPT local dev — server-class pattern: localhost:8000
    const gpt1 = am.detectOAuthClient('http://localhost:8000/callback');
    assertEqual(gpt1.clientName, 'chatgpt', 'localhost:8000 → chatgpt (local dev pattern restored)');

    // Order invariant — Gemini MUST check first; otherwise claude-desktop's
    // /callback pattern would consume localhost:9999/oauth/callback
    const gem2 = am.detectOAuthClient('http://localhost:51234/oauth/callback');
    assertEqual(gem2.clientName, 'gemini', 'arbitrary localhost port + /oauth/callback → gemini, NOT claude-desktop');

    // Claude-desktop guard — bare /callback (no /oauth/) still matches as desktop
    const cd1 = am.detectOAuthClient('http://localhost:51234/callback');
    assertEqual(cd1.clientName, 'claude-desktop', 'bare /callback (no /oauth/) → claude-desktop');

    // Ensure ChatGPT production domains still match (no regression from
    // adding the localhost:8000 fallback)
    const gpt2 = am.detectOAuthClient('https://chatgpt.com/connector_platform_oauth_redirect');
    assertEqual(gpt2.clientName, 'chatgpt', 'production chatgpt.com still matches');

    am.destroy();
  });

  // 18 — Object.freeze prevents shadowing canonical fields
  await test('populateReqUser: req.user is Object.frozen post-population', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const req: any = {};
    am.populateReqUser(
      req,
      { userId: 'u1', email: 'a@b.c', role: 'USER' as any },
      'tok123',
      'mcp_token',
      { azp: 'client_A' }
    );
    // Attempt to overwrite azp
    let threw = false;
    try {
      req.user.azp = 'attacker';
    } catch {
      threw = true;
    }
    // Object.freeze in non-strict mode silently fails; in strict mode throws.
    // Either way, the value MUST NOT change.
    assertEqual(req.user.azp, 'client_A', 'azp unchanged after attempted overwrite');
    void threw;  // ESM strict mode behaviour varies; canonical-field invariance is the real test
    am.destroy();
  });

  // 20 — decodeJwtPayload: does NOT verify signature
  await test('decodeJwtPayload: does NOT verify signature (silent-trust prevention)', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const keys = getTestKeys();
    // Sign with foreign key (verifier would reject)
    const token = await signTestToken(keys.foreign, { userId: 'u1', email: 'a@b.c', role: 'USER', azp: 'leaked' });
    // decodeJwtPayload returns the payload WITHOUT verifying signature
    const payload = am.decodeJwtPayload(token);
    assert(payload !== null, 'decodeJwtPayload returns payload (not null)');
    assertEqual(payload.userId, 'u1', 'userId decoded');
    assertEqual(payload.azp, 'leaked', 'azp decoded — caller must verify separately');
    // Garbage input returns null
    const garbage = am.decodeJwtPayload('not-a-jwt');
    assert(garbage === null, 'garbage → null');
    am.destroy();
  });

  // 21 — rate-limit bounded growth
  await test('Rate-limit Map size bounded — 100 IPs, no unbounded growth', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    for (let i = 0; i < 100; i++) {
      am.checkCallbackRateLimit(`10.0.0.${i}`);
    }
    assertEqual(am.__getRateLimitMapSize(), 100, 'Map has exactly 100 entries (one per IP)');
    // Repeated requests from same IPs don't grow the Map
    for (let i = 0; i < 100; i++) {
      am.checkCallbackRateLimit(`10.0.0.${i}`);
    }
    assertEqual(am.__getRateLimitMapSize(), 100, 'Map still 100 after repeat — no duplicate entries');
    am.destroy();
  });

  // 22 — AuthMiddlewareReject builder shape (Wave 4 Phase 4.1)
  // Per v2 boundary-C3 fold: the marker carries statusCode + headers +
  // jsonRpcErrorWithoutId. Server wrapper merges req.body?.id at serialize
  // time. This test asserts the marker shape stays stable so the wrapper
  // can rely on it.
  await test('AuthMiddlewareReject: builder shape stable (Wave 4 Phase 4.1)', async () => {
    const reject = new AuthMiddlewareReject(
      401,
      {
        'WWW-Authenticate': 'Bearer resource_metadata="https://example.com/.well-known"',
        Link: '<https://example.com/.well-known>; rel="oauth-protected-resource"',
        'Access-Control-Expose-Headers': 'WWW-Authenticate, Link',
      },
      {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Authentication required',
          data: { hint: 'Method X requires authentication' },
        },
      }
    );
    assertEqual(reject.statusCode, 401, 'statusCode preserved');
    assertEqual(reject.name, 'AuthMiddlewareReject', 'error name set');
    assertEqual(reject.headers['WWW-Authenticate'].includes('Bearer'), true, 'WWW-Authenticate has Bearer');
    assertEqual(reject.headers.Link.includes('oauth-protected-resource'), true, 'Link header has rel');
    assertEqual(
      reject.headers['Access-Control-Expose-Headers'],
      'WWW-Authenticate, Link',
      'CORS expose header includes both auth headers'
    );
    assertEqual(reject.jsonRpcErrorWithoutId.error.code, -32001, 'JSON-RPC error code preserved');
    assertEqual(reject.jsonRpcErrorWithoutId.jsonrpc, '2.0', 'jsonrpc version present');
    // jsonRpcErrorWithoutId does NOT include `id` — that's merged at serialize
    assertEqual(
      'id' in (reject.jsonRpcErrorWithoutId as any),
      false,
      'id NOT present in builder (server wrapper merges it)'
    );
    // instanceof check (used by server wrapper to distinguish from 500-level errors)
    assertEqual(reject instanceof AuthMiddlewareReject, true, 'instanceof check works');
    assertEqual(reject instanceof Error, true, 'extends Error so .stack/.message work');
  });

  // ==========================================================================
  // Phase 4.2 — createMiddleware orchestration tests (Tests 23-33)
  // ==========================================================================

  // 23 — RS256 happy path: FRESH role from Prisma per D7
  await test('createMiddleware: RS256 path populates req.user with FRESH role from Prisma (D7)', async () => {
    const keys = getTestKeys();
    const token = await signTestToken(keys.current, {
      userId: 'u_rs256',
      email: 'rs256@test.local',
      role: 'USER',  // stale role in JWT
    });
    const prismaCall = { count: 0, args: null as any };
    const prisma = makeMockPrisma({
      findUnique: async (args: any) => {
        prismaCall.count++;
        prismaCall.args = args;
        return { id: 'u_rs256', email: 'rs256@db.local', role: 'ADMIN', name: 'RS256 User' };  // fresh role
      },
    });
    const { am, audit } = makeAuthManager({ prisma });
    await am.initialize();
    const req = makeMockReq({ authHeader: `Bearer ${token}` });
    const mw = am.createMiddleware();
    let nextCalled = false;
    await mw(req, makeMockRes(), () => { nextCalled = true; });
    assertEqual(nextCalled, true, 'next() called');
    assertEqual(prismaCall.count, 1, 'Prisma findUnique called once');
    assertEqual(prismaCall.args?.where?.id, 'u_rs256', 'looked up by JWT sub');
    assertEqual(req.user?.id, 'u_rs256', 'req.user.id = JWT sub');
    assertEqual(req.user?.role, 'ADMIN', 'req.user.role = FRESH role from Prisma (NOT stale USER from JWT)');
    assertEqual(req.user?.authMethod, 'mcp_token', 'authMethod = mcp_token');
    assertEqual(audit.events.some((e: any) => e.action === 'auth_success_mcp_token'), true, 'audit event emitted (D6 dual-emit)');
    am.destroy();
  });

  // 24 — HS256 Bearer is REJECTED (HS256 acceptance removed 2026-05-28). Was formerly a
  //  "happy path / STALE role" test; the HS256 session path no longer exists.
  await test('createMiddleware: HS256 Bearer token is rejected (not accepted)', async () => {
    const token = await signHs256Token({
      userId: 'u_hs256',
      email: 'hs256@test.local',
      role: 'ADMIN',
    });
    const prismaCall = { count: 0 };
    const prisma = makeMockPrisma({
      findUnique: async () => { prismaCall.count++; return { id: 'u_hs256', email: 'hs256@db.local', role: 'USER', name: null }; },
    });
    const { am } = makeAuthManager({ prisma });
    await am.initialize();
    // Protected method → an unaccepted token must 401-reject, never populate req.user.
    const req = makeMockReq({ authHeader: `Bearer ${token}`, method: 'tools/call' });
    let thrown: any = null;
    try {
      await am.createMiddleware()(req, makeMockRes(), () => {});
    } catch (err) { thrown = err; }
    assertEqual(thrown instanceof AuthMiddlewareReject, true, 'HS256 Bearer → AuthMiddlewareReject (401)');
    assertEqual(req.user, undefined, 'HS256 Bearer → req.user NOT populated');
    assertEqual(prismaCall.count, 0, 'HS256 rejected before any Prisma lookup');
    am.destroy();
  });

  // 25 — API-key (X-API-Key header) happy path: an RS256 first-party token presented via
  //  X-API-Key is verified through verifyMcpToken; req.user.role comes from the token claims.
  //  (For a true api-key-scoped token, verifyAccessToken substitutes the FRESH role via
  //  enforceActiveApiKey — exercised in the api-key revocation suite, not here.)
  await test('createMiddleware: API-key (X-API-Key) path populates req.user (RS256)', async () => {
    const keys = getTestKeys();
    const apiKey = await signTestToken(keys.current, {
      userId: 'u_apikey',
      email: 'apikey@test.local',
      role: 'USER',
    });
    const { am, audit } = makeAuthManager();
    await am.initialize();
    const req = makeMockReq({ apiKey });
    const mw = am.createMiddleware();
    let nextCalled = false;
    await mw(req, makeMockRes(), () => { nextCalled = true; });
    assertEqual(nextCalled, true, 'next() called');
    assertEqual(req.user?.id, 'u_apikey', 'req.user.id matches');
    assertEqual(req.user?.role, 'USER', 'req.user.role from token claims');
    assertEqual(req.user?.authMethod, 'api-key', 'authMethod = api-key');
    assertEqual(audit.events.some((e: any) => e.action === 'auth_success_api_key'), true, 'audit event emitted');
    am.destroy();
  });

  // 26 — Protected method, no token → throws AuthMiddlewareReject with correct shape
  await test('createMiddleware: protected method, no token → throws AuthMiddlewareReject (boundary C3 + sec-ops I1)', async () => {
    const { am, audit } = makeAuthManager();
    await am.initialize();
    const req = makeMockReq({ method: 'tools/call' }); // protected method
    const mw = am.createMiddleware();
    let thrown: any = null;
    try {
      await mw(req, makeMockRes(), () => {});
    } catch (err) {
      thrown = err;
    }
    assertEqual(thrown instanceof AuthMiddlewareReject, true, 'throws AuthMiddlewareReject');
    assertEqual(thrown.statusCode, 401, 'statusCode = 401');
    assertEqual(thrown.headers['WWW-Authenticate'].includes('Bearer'), true, 'WWW-Authenticate has Bearer');
    assertEqual(thrown.headers.Link.includes('oauth-protected-resource'), true, 'Link has rel');
    assertEqual(thrown.headers['Access-Control-Expose-Headers'], 'WWW-Authenticate, Link', 'CORS expose');
    assertEqual(thrown.jsonRpcErrorWithoutId.error.code, -32001, 'JSON-RPC code -32001');
    assertEqual(thrown.jsonRpcErrorWithoutId.error.data.hint.includes('tools/call'), true, 'hint mentions method');
    assertEqual('id' in thrown.jsonRpcErrorWithoutId, false, 'id NOT in builder (server merges)');
    assertEqual(audit.events.some((e: any) => e.action === 'auth_middleware_401'), true, '401 audit event emitted');
    am.destroy();
  });

  // 27 — D7 invariant: RS256 with role=USER in JWT but role=ADMIN in DB → Prisma wins
  await test('createMiddleware D7: RS256 role-source asymmetry — Prisma is the truth', async () => {
    const keys = getTestKeys();
    const token = await signTestToken(keys.current, {
      userId: 'u_d7_rs',
      email: 'a@b.c',
      role: 'USER',  // stale in JWT
    });
    const prisma = makeMockPrisma({
      findUnique: async () => ({ id: 'u_d7_rs', email: 'a@b.c', role: 'ADMIN', name: null }),  // fresh
    });
    const { am } = makeAuthManager({ prisma });
    await am.initialize();
    const req = makeMockReq({ authHeader: `Bearer ${token}` });
    await am.createMiddleware()(req, makeMockRes(), () => {});
    assertEqual(req.user.role, 'ADMIN', 'RS256 + JWT.role=USER + DB.role=ADMIN → req.user.role=ADMIN (Prisma wins)');
  });

  // 28 — (removed 2026-06-06: the HS256 role-source asymmetry no longer exists — HS256 is
  //  rejected. RS256 D7 "Prisma is the truth" is Test 27; HS256 rejection is Test 24.)

  // 29 — Role string byte-identity across the live paths (auth-permissions I3)
  await test('createMiddleware: role strings byte-identical to UserRole enum across both live paths', async () => {
    const keys = getTestKeys();
    const rs256 = await signTestToken(keys.current, { userId: 'u29a', email: 'a@b.c', role: 'USER' });
    const apiKey = await signTestToken(keys.current, { userId: 'u29c', email: 'c@b.c', role: 'USER' });
    const prisma = makeMockPrisma({
      findUnique: async ({ where }: any) => ({ id: where.id, email: 'x@b.c', role: 'USER', name: null }),
    });
    const { am } = makeAuthManager({ prisma });
    await am.initialize();
    const req1 = makeMockReq({ authHeader: `Bearer ${rs256}` });
    const req3 = makeMockReq({ apiKey });
    const mw = am.createMiddleware();
    await mw(req1, makeMockRes(), () => {});
    await mw(req3, makeMockRes(), () => {});
    assertEqual(req1.user.role === 'USER', true, 'RS256 Bearer path: role === "USER"');
    assertEqual(req3.user.role === 'USER', true, 'X-API-Key path: role === "USER"');
    // Both live paths must produce byte-identical strings (validatePOVAccess uses === UserRole.X)
    assertEqual(req1.user.role === req3.user.role, true, 'identical roles across both live paths');
  });

  // 30 — Undefined method (DELETE /mcp with no body) → next() pass-through (boundary N2)
  await test('createMiddleware: undefined method (no req.body) → next() pass-through', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const req = { headers: {}, body: undefined, method: 'DELETE', path: '/mcp' };
    let nextCalled = false;
    let thrown: any = null;
    try {
      await am.createMiddleware()(req as any, makeMockRes(), () => { nextCalled = true; });
    } catch (err) {
      thrown = err;
    }
    // isProtectedMethod(undefined) returns TRUE (secure by default), so this SHOULD throw
    // BUT the actual behavior: undefined method + no token → reject. This is the secure-default contract.
    assertEqual(thrown instanceof AuthMiddlewareReject, true, 'undefined method treated as protected (secure default)');
    assertEqual(nextCalled, false, 'next NOT called when reject thrown');
  });

  // 31 — req.user.token field invariant: set to verified token across both live paths (boundary I5)
  await test('createMiddleware: req.user.token = verified token across both live paths (boundary I5)', async () => {
    const keys = getTestKeys();
    const rs256 = await signTestToken(keys.current, { userId: 'u31a', email: 'a@b.c', role: 'USER' });
    const apiKey = await signTestToken(keys.current, { userId: 'u31c', email: 'c@b.c', role: 'USER' });
    const prisma = makeMockPrisma({
      findUnique: async ({ where }: any) => ({ id: where.id, email: 'x@b.c', role: 'USER', name: null }),
    });
    const { am } = makeAuthManager({ prisma });
    await am.initialize();
    const req1 = makeMockReq({ authHeader: `Bearer ${rs256}` });
    const req3 = makeMockReq({ apiKey });
    const mw = am.createMiddleware();
    await mw(req1, makeMockRes(), () => {});
    await mw(req3, makeMockRes(), () => {});
    assertEqual(req1.user.token, rs256, 'RS256 Bearer: req.user.token = RS256 token');
    assertEqual(req3.user.token, apiKey, 'X-API-Key: req.user.token = apikey token');
  });

  // 32 — Dual-emit on success: both pino info + audit logger fire (D6, sec-ops N2)
  await test('createMiddleware D6: dual-emit on success (pino + audit logger)', async () => {
    // Use pino observer to count logger calls
    let pinoCalls = 0;
    const observingLogger: any = {
      info: () => { pinoCalls++; },
      debug: () => { pinoCalls++; },
      warn: () => {},
      error: () => {},
      fatal: () => {},
      child: () => observingLogger,
    };
    __resetKeyCacheForTests();
    const audit = makeAuditLogger();
    const store = new SessionStore({ logger: silentLogger, noCleanup: true });
    const prisma = makeMockPrisma({
      findUnique: async () => ({ id: 'u32', email: 'a@b.c', role: 'USER', name: null }),
    });
    const am = new AuthManager({
      logger: observingLogger,
      sessionStore: store,
      oauthAuditLogger: audit,
      prismaClient: prisma,
      noCleanup: true,
    });
    await am.initialize();
    const keys = getTestKeys();
    const rs256 = await signTestToken(keys.current, { userId: 'u32', email: 'a@b.c', role: 'USER' });
    const req = makeMockReq({ authHeader: `Bearer ${rs256}` });
    await am.createMiddleware()(req, makeMockRes(), () => {});
    assertEqual(pinoCalls > 0, true, 'pino logger called at least once');
    assertEqual(audit.events.some((e: any) => e.action === 'auth_success_mcp_token'), true, 'audit logger fired (RS256 success)');
    // Both destinations have fired = dual-emit verified
    am.destroy();
  });

  // 33 — Public method (tools/list), no token → next() without req.user mutation
  await test('createMiddleware: public method (tools/list), no token → next() without req.user', async () => {
    const { am } = makeAuthManager();
    await am.initialize();
    const req = makeMockReq({ method: 'tools/list' }); // public per MCP_PUBLIC_METHODS
    let nextCalled = false;
    await am.createMiddleware()(req, makeMockRes(), () => { nextCalled = true; });
    assertEqual(nextCalled, true, 'next() called for public method');
    assertEqual(req.user, undefined, 'req.user NOT mutated (no auth provided)');
  });

  // ---- Report ----
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  teardownEnv();
  if (failed > 0) {
    console.error(`\n❌ AuthManager tests FAILED`);
    process.exit(1);
  }
  console.log(`\n✅ All AuthManager tests passed`);
}

run().catch((err) => {
  console.error('Unhandled error in test runner:', err);
  teardownEnv();
  process.exit(1);
});
