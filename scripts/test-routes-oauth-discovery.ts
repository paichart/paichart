#!/usr/bin/env ts-node
/**
 * Wave 6 Phase 6.3 — OAuth discovery route tests (B1 + R3 + R4 + R5).
 *
 * Test plan per Plan v2 Phase 6.3 (~14 tests) — addresses:
 *   - sec-ops C4 (JWKS 7-branch coverage + Hazard H-5 security-critical)
 *   - Plan v2 I11 / oauth-multi-client I-1 (R5 verbatim path-array equality)
 *
 *   B1 — Link header tests (2):
 *     1. GET /mcp emits RFC 9728 Link: <resource_metadata>; rel="oauth-protected-resource"
 *     2. GET /mcp emits Access-Control-Expose-Headers: Link, WWW-Authenticate, MCP-Session-Id
 *
 *   R3 — JWKS 7-branch coverage (sec-ops C4):
 *     3. No JWT_PUBLIC_KEY_BASE64 env → 500 'JWKS not configured'
 *     4. Single-key (no PREV env) → 1-element keys[] array
 *     5. Multi-key (current + previous valid) → 2-element keys[] array
 *     6. Previous key with past expiry → filtered out (1-element array)
 *     7. Previous key with invalid expiry string → filtered + 1-element
 *     8. All keys expired (current null-expiry preserved is happy path; this
 *        tests the "no active keys" guard via private-key trickery — covered
 *        by Branch 9 below)
 *     9. Private key pasted as JWT_PUBLIC_KEY_BASE64 → throws → 500
 *
 *   R3 — Cross-endpoint consistency:
 *    10. /.well-known/jwks.json and /mcp/.well-known/jwks.json return
 *        identical keys[] arrays
 *
 *   R4 — protected-resource metadata:
 *    11. Shape match (resource, authorization_servers, scopes_supported,
 *        bearer_methods_supported, resource_documentation)
 *
 *   R5 — authorization-server metadata:
 *    12. **Verbatim path-array equality** (Plan v2 I11): 5 sorted paths
 *    13. Response shape (issuer, authorization_endpoint, token_endpoint,
 *        jwks_uri, etc.)
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import http from 'http';
import * as crypto from 'crypto';
import { registerOAuthDiscoveryRoutes } from '../lib/mcp/server/routes/oauth-discovery-routes';
import type { RouteContext } from '../lib/mcp/server/routes/route-context';

// ──────────────────────────────────────────────────────────────────────
// Test harness
// ──────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assertEqual(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(`${msg}\n     expected: ${e}\n     actual:   ${a}`);
    console.log(`  ❌ ${msg}\n     expected: ${e}\n     actual:   ${a}`);
  }
}

function assertTrue(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

const noopLogger = {
  debug: () => { /* silent */ },
  warn: () => { /* silent */ },
  info: () => { /* silent */ },
  error: () => { /* silent */ },
};

function makeMockContext(app: express.Application): RouteContext {
  return {
    app,
    logger: noopLogger,
    sessionStore: {},
    authManager: {},
    oauthValidator: {},
    getAuthMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    getMcpServer: () => null,
    generateAuthCode: () => 'mock',
    handleMicrosoftAuthorize: async () => { /* noop */ },
    exchangeMicrosoftCode: async () => ({}),
    detectClientMode: () => 'stateless' as const,
    handleStatelessRequest: async () => { /* noop */ },
    processMCPRequest: async () => ({}),
  };
}

interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function httpGet(port: number, path: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        headers: res.headers as Record<string, string>,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ──────────────────────────────────────────────────────────────────────
// JWT key fixture generation for R3 JWKS tests
// ──────────────────────────────────────────────────────────────────────

interface TestKeyFixture {
  publicKeyBase64: string;
  privateKeyBase64: string;
}

function generateTestKeyPair(): TestKeyFixture {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    publicKeyBase64: Buffer.from(publicKey).toString('base64'),
    privateKeyBase64: Buffer.from(privateKey).toString('base64'),
  };
}

/**
 * Temporarily swap process.env values for a test scope; returns cleanup func.
 */
function patchEnv(overrides: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

async function spinUpAppWithEnv(envOverrides: Record<string, string | undefined>): Promise<{
  port: number;
  close: () => Promise<void>;
  restoreEnv: () => void;
}> {
  const restoreEnv = patchEnv(envOverrides);
  const app = express();
  registerOAuthDiscoveryRoutes(makeMockContext(app));
  // Need body parser so /mcp middleware can read body
  app.use(express.json());
  // Terminal /mcp handler to confirm B1 Link header injection
  app.get('/mcp', (_req: Request, res: Response) => res.status(200).json({ ok: true }));

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
        restoreEnv,
      });
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪 OAuth discovery route tests (Wave 6 Phase 6.3)\n');

  const keyA = generateTestKeyPair();
  const keyB = generateTestKeyPair();

  // ─── Tests 1-2 — B1 Link header ─────────────────────────────────────
  console.log('Tests 1-2: B1 /mcp Link header middleware');
  {
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: keyA.publicKeyBase64,
      JWT_KEY_ID: 'test-key-A',
      JWT_PUBLIC_KEY_PREV_BASE64: undefined,
      JWT_KEY_ID_PREV: undefined,
    });
    try {
      const r = await httpGet(port, '/mcp');
      assertEqual(r.status, 200, 'Test 1: GET /mcp passes through middleware to handler');
      assertEqual(
        r.headers.link,
        '<https://paichart.app/.well-known/oauth-protected-resource>; rel="oauth-protected-resource"',
        'Test 1: Link header injected by B1 middleware'
      );
      assertEqual(
        r.headers['access-control-expose-headers'],
        'Link, WWW-Authenticate, MCP-Session-Id',
        'Test 2: Access-Control-Expose-Headers set by B1 middleware'
      );
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ─── Test 3 — R3 Branch 1: No JWT_PUBLIC_KEY_BASE64 ─────────────────
  console.log('\nTest 3: R3 JWKS Branch 1 — no JWT_PUBLIC_KEY_BASE64 → 500');
  {
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: undefined,
      JWT_KEY_ID: undefined,
      JWT_PUBLIC_KEY_PREV_BASE64: undefined,
      JWT_KEY_ID_PREV: undefined,
    });
    try {
      const r = await httpGet(port, '/.well-known/jwks.json');
      assertEqual(r.status, 500, 'Test 3: HTTP 500');
      assertEqual(JSON.parse(r.body), { error: 'JWKS not configured' }, 'Test 3: error message');
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ─── Test 4 — R3 Branch 2: Single-key ───────────────────────────────
  console.log('\nTest 4: R3 JWKS Branch 2 — single-key (no PREV env) → 1-element keys[]');
  {
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: keyA.publicKeyBase64,
      JWT_KEY_ID: 'test-key-A',
      JWT_PUBLIC_KEY_PREV_BASE64: undefined,
      JWT_KEY_ID_PREV: undefined,
    });
    try {
      const r = await httpGet(port, '/.well-known/jwks.json');
      assertEqual(r.status, 200, 'Test 4: HTTP 200');
      const body = JSON.parse(r.body) as { keys: Array<{ kid: string; use: string; alg: string }> };
      assertEqual(body.keys.length, 1, 'Test 4: keys[] has 1 element');
      assertEqual(body.keys[0]?.kid, 'test-key-A', 'Test 4: kid === test-key-A');
      assertEqual(body.keys[0]?.use, 'sig', 'Test 4: use === sig');
      assertEqual(body.keys[0]?.alg, 'RS256', 'Test 4: alg === RS256');
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ─── Test 5 — R3 Branch 3: Multi-key (current + previous valid) ─────
  console.log('\nTest 5: R3 JWKS Branch 3 — multi-key (current + previous valid) → 2-element keys[]');
  {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: keyA.publicKeyBase64,
      JWT_KEY_ID: 'test-key-A',
      JWT_PUBLIC_KEY_PREV_BASE64: keyB.publicKeyBase64,
      JWT_KEY_ID_PREV: 'test-key-B',
      JWT_KEY_PREV_EXPIRES: future,
    });
    try {
      const r = await httpGet(port, '/.well-known/jwks.json');
      assertEqual(r.status, 200, 'Test 5: HTTP 200');
      const body = JSON.parse(r.body) as { keys: Array<{ kid: string }> };
      assertEqual(body.keys.length, 2, 'Test 5: keys[] has 2 elements');
      assertEqual(body.keys.map((k) => k.kid).sort(), ['test-key-A', 'test-key-B'], 'Test 5: kids include both A and B');
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ─── Test 6 — R3 Branch 4: Previous key with past expiry → filtered ─
  console.log('\nTest 6: R3 JWKS Branch 4 — previous key with past expiry → filtered out');
  {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: keyA.publicKeyBase64,
      JWT_KEY_ID: 'test-key-A',
      JWT_PUBLIC_KEY_PREV_BASE64: keyB.publicKeyBase64,
      JWT_KEY_ID_PREV: 'test-key-B',
      JWT_KEY_PREV_EXPIRES: past,
    });
    try {
      const r = await httpGet(port, '/.well-known/jwks.json');
      assertEqual(r.status, 200, 'Test 6: HTTP 200');
      const body = JSON.parse(r.body) as { keys: Array<{ kid: string }> };
      assertEqual(body.keys.length, 1, 'Test 6: keys[] has 1 element (expired filtered)');
      assertEqual(body.keys[0]?.kid, 'test-key-A', 'Test 6: only current key remains');
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ─── Test 7 — R3 Branch 5: Invalid expiry string → filtered ─────────
  console.log('\nTest 7: R3 JWKS Branch 5 — previous key with invalid expiry string → filtered out');
  {
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: keyA.publicKeyBase64,
      JWT_KEY_ID: 'test-key-A',
      JWT_PUBLIC_KEY_PREV_BASE64: keyB.publicKeyBase64,
      JWT_KEY_ID_PREV: 'test-key-B',
      JWT_KEY_PREV_EXPIRES: 'this-is-not-a-date',
    });
    try {
      const r = await httpGet(port, '/.well-known/jwks.json');
      assertEqual(r.status, 200, 'Test 7: HTTP 200');
      const body = JSON.parse(r.body) as { keys: Array<{ kid: string }> };
      assertEqual(body.keys.length, 1, 'Test 7: keys[] has 1 element (invalid expiry filtered)');
      assertEqual(body.keys[0]?.kid, 'test-key-A', 'Test 7: only current key remains');
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ─── Test 8 — R3 Branch 7: Private key pasted as public ─────────────
  console.log('\nTest 8: R3 JWKS Branch 7 — private key pasted as JWT_PUBLIC_KEY_BASE64 → 500');
  {
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: keyA.privateKeyBase64,  // private pasted!
      JWT_KEY_ID: 'test-key-A',
      JWT_PUBLIC_KEY_PREV_BASE64: undefined,
      JWT_KEY_ID_PREV: undefined,
    });
    try {
      const r = await httpGet(port, '/.well-known/jwks.json');
      assertEqual(r.status, 500, 'Test 8: HTTP 500');
      assertEqual(JSON.parse(r.body), { error: 'JWKS generation failed' }, 'Test 8: sanitized error (no internal details leaked — Task #156)');
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ─── Test 9 — R3 Cross-endpoint consistency ─────────────────────────
  console.log('\nTest 9: R3 cross-endpoint consistency — both paths return identical keys[]');
  {
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: keyA.publicKeyBase64,
      JWT_KEY_ID: 'test-key-A',
      JWT_PUBLIC_KEY_PREV_BASE64: undefined,
      JWT_KEY_ID_PREV: undefined,
    });
    try {
      const r1 = await httpGet(port, '/.well-known/jwks.json');
      const r2 = await httpGet(port, '/mcp/.well-known/jwks.json');
      assertEqual(r1.status, 200, 'Test 9: /.well-known/jwks.json → 200');
      assertEqual(r2.status, 200, 'Test 9: /mcp/.well-known/jwks.json → 200');
      assertEqual(r1.body, r2.body, 'Test 9: both paths return identical response body');
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ─── Test 10 — R4 protected-resource metadata shape ─────────────────
  console.log('\nTest 10: R4 /.well-known/oauth-protected-resource → 200 + shape');
  {
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: keyA.publicKeyBase64,
      JWT_KEY_ID: 'test-key-A',
    });
    try {
      const r = await httpGet(port, '/.well-known/oauth-protected-resource');
      assertEqual(r.status, 200, 'Test 10: HTTP 200');
      assertEqual(r.headers['access-control-allow-origin'], '*', 'Test 10: CORS *');
      const body = JSON.parse(r.body);
      assertEqual(body.resource, 'https://paichart.app/mcp', 'Test 10: resource');
      assertEqual(body.authorization_servers, ['https://paichart.app'], 'Test 10: authorization_servers');
      assertEqual(body.bearer_methods_supported, ['header'], 'Test 10: bearer_methods_supported');
      assertEqual(body.resource_documentation, 'https://paichart.app/docs/mcp', 'Test 10: resource_documentation');
      assertTrue(Array.isArray(body.scopes_supported) && body.scopes_supported.length > 0, 'Test 10: scopes_supported populated from MCP_SCOPES');
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ─── Test 11 — R5 verbatim path-array equality (Plan v2 I11) ────────
  console.log('\nTest 11: R5 oauth-authorization-server verbatim 8-path array (Plan v2 I11)');
  {
    // openid-configuration variants RE-ADDED 2026-05-26 (OpenAI connector OIDC
    // discovery probe — 404 aborted ChatGPT setup). R5 must have EXACTLY these
    // 8 paths in this order:
    const expectedPaths = [
      '/.well-known/oauth-authorization-server',
      '/mcp/.well-known/oauth-authorization-server',
      '/oauth/.well-known/oauth-authorization-server',
      '/.well-known/oauth-authorization-server/mcp',
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/openid-configuration',
      '/mcp/.well-known/openid-configuration',
      '/.well-known/openid-configuration/mcp',
    ];

    // Spy on app.get to capture the paths array
    const app = express();
    const getCalls: { paths: unknown }[] = [];
    const realGet = app.get.bind(app);
    const getSpy = (...args: unknown[]): unknown => {
      const [paths] = args;
      getCalls.push({ paths });
      return (realGet as unknown as (...a: unknown[]) => unknown)(...args);
    };
    (app as unknown as { get: typeof getSpy }).get = getSpy;

    registerOAuthDiscoveryRoutes(makeMockContext(app));

    // Find R5's registration — it's the one with /oauth-authorization-server in the array
    const r5Call = getCalls.find((c) => Array.isArray(c.paths) && (c.paths as string[]).includes('/.well-known/oauth-authorization-server'));
    assertTrue(r5Call !== undefined, 'Test 11: R5 registration found');
    assertEqual(r5Call?.paths, expectedPaths, 'Test 11: R5 paths verbatim sorted-array equality (Plan v2 I11)');
  }

  // ─── Test 12 — R5 response shape ────────────────────────────────────
  console.log('\nTest 12: R5 /.well-known/oauth-authorization-server → 200 + shape');
  {
    const { port, close, restoreEnv } = await spinUpAppWithEnv({
      JWT_PUBLIC_KEY_BASE64: keyA.publicKeyBase64,
      JWT_KEY_ID: 'test-key-A',
    });
    try {
      const r = await httpGet(port, '/.well-known/oauth-authorization-server');
      assertEqual(r.status, 200, 'Test 12: HTTP 200');
      assertEqual(r.headers['access-control-allow-origin'], '*', 'Test 12: CORS *');
      const body = JSON.parse(r.body);
      assertEqual(body.issuer, 'https://paichart.app', 'Test 12: issuer');
      assertEqual(body.authorization_endpoint, 'https://paichart.app/oauth/authorize', 'Test 12: authorization_endpoint');
      assertEqual(body.token_endpoint, 'https://paichart.app/oauth/token', 'Test 12: token_endpoint');
      assertEqual(body.jwks_uri, 'https://paichart.app/mcp/.well-known/jwks.json', 'Test 12: jwks_uri (Plan v2 H-5 — JWKS endpoint must exist)');
      assertEqual(body.registration_endpoint, 'https://paichart.app/oauth/register', 'Test 12: registration_endpoint');
      assertEqual(body.response_types_supported, ['code'], 'Test 12: response_types_supported');
      assertEqual(body.grant_types_supported, ['authorization_code', 'refresh_token'], 'Test 12: grant_types_supported');
      assertEqual(body.id_token_signing_alg_values_supported, ['RS256'], 'Test 12: RS256');
    } finally {
      await close();
      restoreEnv();
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\n❌ FAILURES:\n');
    failures.forEach(f => console.log(`  - ${f}\n`));
    process.exit(1);
  }
  console.log('✅ All OAuth discovery route tests passed');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
