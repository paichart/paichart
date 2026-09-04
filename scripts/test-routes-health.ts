#!/usr/bin/env ts-node
/**
 * Wave 6 Phase 6.2 — Health route tests (R1).
 *
 * 4 tests covering the GET /health endpoint extracted from
 * `mcp-server-http-clean.js:setupRoutes()` R1.
 *
 *   Test 1 — Registration: `registerHealthRoutes(ctx)` adds exactly one
 *            GET /health route to the Express app.
 *
 *   Test 2 — Happy path: GET /health → 200 + locked response shape
 *            (status, transport, timestamp, version, mcp object).
 *
 *   Test 3 — Data sources: response correctly reads sessions /
 *            oauthRequests / evictions from injected sessionStore.
 *
 *   Test 4 — Stale /mcp/health alias is NOT registered (Phase 0.6 dropped it).
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import http from 'http';
import { registerHealthRoutes } from '../lib/mcp/server/routes/health-routes';
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
  debug: (..._args: unknown[]) => { /* silent */ },
  warn: (..._args: unknown[]) => { /* silent */ },
  info: (..._args: unknown[]) => { /* silent */ },
  error: (..._args: unknown[]) => { /* silent */ },
};

interface MockSessionStore {
  getSessionCount: () => number;
  getOAuthRequestCount: () => number;
  getLimits: () => { maxSessions: number; maxOAuthRequests: number };
  getEvictionStats: () => { total: number };
  __counts: { sessions: number; oauthRequests: number };
}

function makeMockSessionStore(counts: { sessions: number; oauthRequests: number }): MockSessionStore {
  return {
    __counts: counts,
    getSessionCount: () => counts.sessions,
    getOAuthRequestCount: () => counts.oauthRequests,
    getLimits: () => ({ maxSessions: 10000, maxOAuthRequests: 1000 }),
    getEvictionStats: () => ({ total: 0 }),
  };
}

function makeMockContext(app: express.Application, sessionStore: MockSessionStore): RouteContext {
  return {
    app,
    logger: noopLogger,
    sessionStore,
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

interface GetResult {
  status: number;
  body: string;
}

function httpGet(port: number, path: string): Promise<GetResult> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪 Health route tests (Wave 6 Phase 6.2)\n');

  // ─── Test 1 — Registration ──────────────────────────────────────────
  console.log('Test 1: registerHealthRoutes adds exactly one GET /health');
  {
    const app = express();
    const calls: { method: string; path: string }[] = [];
    const realGet = app.get.bind(app);
    const getSpy = (...args: unknown[]): unknown => {
      const [path] = args;
      calls.push({ method: 'GET', path: String(path) });
      return (realGet as unknown as (...a: unknown[]) => unknown)(...args);
    };
    (app as unknown as { get: typeof getSpy }).get = getSpy;

    const ctx = makeMockContext(app, makeMockSessionStore({ sessions: 0, oauthRequests: 0 }));
    registerHealthRoutes(ctx);

    assertEqual(calls.length, 1, 'Test 1: exactly 1 GET registered');
    assertEqual(calls[0]?.path, '/health', 'Test 1: path is /health');
  }

  // ─── Test 2 — Happy path response shape ─────────────────────────────
  console.log('\nTest 2: GET /health returns 200 + locked response shape');
  {
    const app = express();
    const ctx = makeMockContext(app, makeMockSessionStore({ sessions: 3, oauthRequests: 1 }));
    registerHealthRoutes(ctx);

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    const result = await httpGet(port, '/health');

    assertEqual(result.status, 200, 'Test 2: HTTP 200');
    const body = JSON.parse(result.body);
    assertEqual(body.status, 'ok', 'Test 2: status === "ok"');
    assertEqual(body.transport, 'clean-http', 'Test 2: transport === "clean-http"');
    assertEqual(body.version, '1.0.0', 'Test 2: version === "1.0.0"');
    assertTrue(typeof body.timestamp === 'string' && body.timestamp.includes('T'), 'Test 2: timestamp is ISO-8601 string');
    assertEqual(body.mcp?.architecture, 'single-backend', 'Test 2: mcp.architecture === "single-backend"');
    assertEqual(body.mcp?.backend, 'mcp-server-v5', 'Test 2: mcp.backend === "mcp-server-v5"');

    await new Promise<void>((res) => server.close(() => res()));
  }

  // ─── Test 3 — Data sources ──────────────────────────────────────────
  console.log('\nTest 3: response correctly reads counts from injected sessionStore');
  {
    const app = express();
    const store = makeMockSessionStore({ sessions: 42, oauthRequests: 7 });
    const ctx = makeMockContext(app, store);
    registerHealthRoutes(ctx);

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    const result = await httpGet(port, '/health');
    const body = JSON.parse(result.body);

    assertEqual(body.mcp?.sessions, 42, 'Test 3: mcp.sessions === store.getSessionCount()');
    assertEqual(body.mcp?.oauthRequests, 7, 'Test 3: mcp.oauthRequests === store.getOAuthRequestCount()');
    assertEqual(body.mcp?.maxSessions, 10000, 'Test 3: mcp.maxSessions === store.getLimits().maxSessions');
    assertEqual(body.mcp?.maxOAuthRequests, 1000, 'Test 3: mcp.maxOAuthRequests === store.getLimits().maxOAuthRequests');
    assertEqual(body.mcp?.evictions, { total: 0 }, 'Test 3: mcp.evictions === store.getEvictionStats()');

    await new Promise<void>((res) => server.close(() => res()));
  }

  // ─── Test 4 — /mcp/health alias is NOT registered ───────────────────
  console.log('\nTest 4: /mcp/health alias is NOT registered (Phase 0.6 dropped it)');
  {
    const app = express();
    const ctx = makeMockContext(app, makeMockSessionStore({ sessions: 0, oauthRequests: 0 }));
    registerHealthRoutes(ctx);

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    const result = await httpGet(port, '/mcp/health');

    assertEqual(result.status, 404, 'Test 4: GET /mcp/health → 404 (alias dropped in Phase 0.6)');

    await new Promise<void>((res) => server.close(() => res()));
  }

  // ──────────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\n❌ FAILURES:\n');
    failures.forEach(f => console.log(`  - ${f}\n`));
    process.exit(1);
  }
  console.log('✅ All health route tests passed');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
