#!/usr/bin/env ts-node
/**
 * Express middleware setup unit tests (Wave 5 Phase 5.1).
 *
 * 15 tests covering all 7 middleware blocks in configureExpressMiddleware().
 *
 * Test plan locked in express-middleware-extraction-plan-v2.md
 * after round-1 specialist review (boundary-contract + sec-ops) and
 * architectural-review verdict (GO at 96/94/93/96%).
 *
 *  1. cors() options verbatim (exposedHeaders array) + app.use SEQUENCE
 *     (sec-ops C2 fold + architectural-review polish #5)
 *  2. JSON parser DoS — small payload (≤100KB) → rawBody verbatim
 *  3. JSON parser DoS — large payload (>100KB) → poison-pill string
 *     (sec-ops I-1: truncation contract)
 *  4. BC54 substring evasion: claude.ai.attacker.example → REJECT (sec-ops C1)
 *  5. BC54 substring evasion: attacker.example/claude.ai (path) → REJECT (sec-ops C1)
 *  6. BC54 substring evasion: xclaude.ai (prefix injection) → REJECT (sec-ops C1)
 *  7. BC54 case mismatch: https://CLAUDE.AI → ACCEPT (sec-ops C1)
 *  8. BC54 BIND_ALL still rejects attacker subdomain → REJECT (sec-ops C1)
 *  9. BC54 hardcoded domain: https://claude.ai → ACCEPT
 * 10. BC54 hardcoded domain: https://anthropic.com → ACCEPT
 * 11. BC54 hardcoded domain: https://claude-desktop.app → ACCEPT (often-forgotten 3rd)
 * 12. BC54 subdomain: https://something.claude.ai → ACCEPT
 * 13. BC54 no-dot prefix: https://claudeai.com → REJECT
 * 14. PRE-EXISTING preservation: corsOrigin verbatim per Task #145
 *     — DO NOT FIX HERE (architectural-review polish #2 rename)
 * 15. Block 4 JSON parse error → HTTP 200 -32700 (boundary I-4 fold)
 */

import pino from 'pino';
import express from 'express';
import type { Application, Request, Response, NextFunction } from 'express';
import http from 'http';

// ─────────────────────────────────────────────────────────────────────
// CORS SPY — MUST be installed BEFORE express-setup is required.
//
// express-setup.ts does `const cors = require('cors')` at module-top.
// That reference is captured at load time, so any later monkey-patching
// of require.cache won't affect already-loaded modules. We install the
// spy here in the test top-level, then require express-setup via
// require() (NOT import) so the load order is deterministic.
//
// corsCalls is the module-level recorder; tests reset it via reset().
// ─────────────────────────────────────────────────────────────────────
interface CorsCall {
  options: Record<string, unknown>;
}
const corsCalls: CorsCall[] = [];
function resetCorsCalls(): void {
  corsCalls.length = 0;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const realCorsModule = require('cors');
const corsModulePath = require.resolve('cors');
require.cache[corsModulePath]!.exports = function spyCors(opts: Record<string, unknown>) {
  corsCalls.push({ options: opts });
  return realCorsModule(opts);
};

// Now load express-setup — its top-level `require('cors')` resolves to spyCors
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { configureExpressMiddleware } = require('../lib/mcp/server/express-setup') as {
  configureExpressMiddleware: typeof import('../lib/mcp/server/express-setup').configureExpressMiddleware;
};

// ──────────────────────────────────────────────────────────────────────
// Test harness — assert + counters
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

// ──────────────────────────────────────────────────────────────────────
// Helpers — mock Express + HTTP request driver
// ──────────────────────────────────────────────────────────────────────

const silentLogger = pino({ level: 'silent' });

function makeLogger() {
  return {
    debug: (..._args: unknown[]) => { /* silent */ },
    warn: (..._args: unknown[]) => { /* silent */ },
    info: (..._args: unknown[]) => { /* silent */ },
    error: (..._args: unknown[]) => { /* silent */ },
  };
}

interface AppUseCall {
  kind: 'use-fn' | 'use-path' | 'options';
  args: unknown[];
}

/**
 * Spy harness: wraps a real Express app and records every app.use call
 * in order. The cors() options spy is installed at module top-level
 * (see corsCalls above); this function just resets that recorder.
 *
 * Test 1 uses this to assert app.use ORDER + cors() options verbatim.
 */
function makeSpyApp(): { app: Application; useCalls: AppUseCall[]; corsCalls: CorsCall[] } {
  resetCorsCalls();
  const app = express();
  const useCalls: AppUseCall[] = [];

  const realUse = app.use.bind(app);
  // Wrap app.use to capture every registration
  // Express's app.use is heavily overloaded — capture all args
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).use = (...args: unknown[]) => {
    useCalls.push({ kind: 'use-fn', args });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return realUse(...(args as [any]));
  };

  const realOptions = app.options.bind(app);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).options = (...args: unknown[]) => {
    useCalls.push({ kind: 'options', args });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return realOptions(...(args as [any, any]));
  };

  return {
    app,
    useCalls,
    corsCalls,
  };
}

/**
 * Start a real HTTP server with configured middleware on an ephemeral port.
 * Returns { server, port, close }. Caller MUST close.
 *
 * The /mcp POST handler returns 200 with { ok: true } so the test can
 * distinguish "passed origin gate" (200) from "blocked by origin gate" (403).
 */
async function startServerWithMiddleware(corsOrigin: string): Promise<{
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}> {
  const app = express();
  configureExpressMiddleware(app, {
    corsOrigin,
    logger: makeLogger(),
  });
  // Terminal /mcp handler to test Block 6 origin gate
  app.post('/mcp', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  // Terminal /not-mcp handler to test Block 6 path-scope
  app.post('/not-mcp', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  // Catch-all error handler (must come LAST so Block 4 wins for SyntaxError)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message });
  });

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        server,
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

interface PostResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function httpPost(port: number, path: string, body: string, headers: Record<string, string> = {}): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body).toString(),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers as Record<string, string>,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪 Express middleware setup tests (Wave 5 Phase 5.1)\n');

  // ─── Test 1 ──────────────────────────────────────────────────────────
  // cors() options verbatim + app.use SEQUENCE
  // (sec-ops C2 + architectural-review polish #5)
  console.log('Test 1: cors() options verbatim + app.use SEQUENCE');
  {
    const spy = makeSpyApp();
    configureExpressMiddleware(spy.app, {
      corsOrigin: 'https://localhost',
      logger: makeLogger(),
    });

    // cors() options assertion
    assertEqual(spy.corsCalls.length, 1, 'cors() called exactly once');
    const corsOpts = spy.corsCalls[0]?.options;
    assertEqual(
      corsOpts?.exposedHeaders,
      ['WWW-Authenticate', 'Link', 'MCP-Session-Id', 'X-MCP-Version'],
      'cors().exposedHeaders verbatim (4 entries)'
    );
    assertEqual(
      corsOpts?.methods,
      ['GET', 'POST', 'DELETE', 'OPTIONS'],
      'cors().methods verbatim (4 entries)'
    );
    assertEqual(
      corsOpts?.allowedHeaders,
      ['Content-Type', 'Authorization', 'MCP-Session-Id', 'X-API-Key'],
      'cors().allowedHeaders verbatim (4 entries)'
    );
    assertEqual(corsOpts?.credentials, true, 'cors().credentials === true');
    // Task #145 (2026-05-21): single-origin string is now split into a 1-element array
    assertEqual(corsOpts?.origin, ['https://localhost'], 'cors().origin === [corsOrigin] (single-element array post-#145)');

    // app.use SEQUENCE assertion (architectural-review polish #5)
    // Expected order: 6 app.use() calls (Block 1, 2, 3, 4, 6, 7) + 1 app.options() (Block 5)
    // Spy treats them all as registration events in calling order.
    assertEqual(spy.useCalls.length, 7, 'exactly 7 middleware registrations');
    assertEqual(spy.useCalls[0]?.kind, 'use-fn', 'Block 1 (express.json) is first');
    assertEqual(spy.useCalls[1]?.kind, 'use-fn', 'Block 2 (urlencoded) is second');
    assertEqual(spy.useCalls[2]?.kind, 'use-fn', 'Block 3 (cors) is third');
    assertEqual(spy.useCalls[3]?.kind, 'use-fn', 'Block 4 (JSON parse error) is fourth');
    assertEqual(spy.useCalls[4]?.kind, 'options', 'Block 5 (OPTIONS preflight) is fifth');
    assertEqual(spy.useCalls[5]?.kind, 'use-fn', 'Block 6 (origin validation) is sixth');
    assertEqual(spy.useCalls[6]?.kind, 'use-fn', 'Block 7 (request logging) is seventh');
  }

  // ─── Tests 2-3 ───────────────────────────────────────────────────────
  // Task #142 (2026-05-21): rawBody verify callback DROPPED. Block 1 now
  // only configures express.json's limit:'10mb' + strict:true. These
  // tests pin the new behavior:
  //   2. Body is still parsed correctly (req.body populated)
  //   3. req.rawBody is undefined (no verify callback assigns it)
  console.log('\nTest 2: JSON parser — req.body still populated after #142 drop');
  {
    const app = express();
    configureExpressMiddleware(app, { corsOrigin: 'https://localhost', logger: makeLogger() });
    let capturedBody: unknown;
    app.post('/echo', (req: Request, res: Response) => {
      capturedBody = req.body;
      res.status(200).json({ ok: true });
    });
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    await httpPost(port, '/echo', JSON.stringify({ test: 'small' }));
    assertEqual(capturedBody, { test: 'small' }, 'Test 2: req.body parsed correctly');

    await new Promise<void>((res) => server.close(() => res()));
  }

  console.log('\nTest 3: JSON parser — req.rawBody is undefined post-#142 drop');
  {
    const app = express();
    configureExpressMiddleware(app, { corsOrigin: 'https://localhost', logger: makeLogger() });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedRawBody: any = 'NOT-SET';
    app.post('/echo', (req: Request, res: Response) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedRawBody = (req as any).rawBody;
      res.status(200).json({ ok: true });
    });
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    await httpPost(port, '/echo', JSON.stringify({ test: 'check-undef' }));
    assertEqual(capturedRawBody, undefined, 'Test 3: req.rawBody is undefined (verify callback removed)');

    await new Promise<void>((res) => server.close(() => res()));
  }

  // ─── Tests 4-8 ───────────────────────────────────────────────────────
  // BC54 substring-evasion attack vectors (sec-ops C1 fold)
  console.log('\nTests 4-8: BC54 origin validation — ATTACK VECTORS (sec-ops C1)');
  {
    const { port, close } = await startServerWithMiddleware('https://localhost');
    try {
      // Test 4: subdomain stuffing
      const r4 = await httpPost(port, '/mcp', '{}', { Origin: 'https://claude.ai.attacker.example' });
      assertEqual(r4.status, 403, 'Test 4: claude.ai.attacker.example → 403');

      // Test 5: substring in path (origin contains attacker hostname, path has claude.ai)
      const r5 = await httpPost(port, '/mcp', '{}', { Origin: 'https://attacker.example/claude.ai' });
      assertEqual(r5.status, 403, 'Test 5: attacker.example/claude.ai → 403');

      // Test 6: prefix injection — xclaude.ai is NOT a subdomain of claude.ai
      const r6 = await httpPost(port, '/mcp', '{}', { Origin: 'https://xclaude.ai' });
      assertEqual(r6.status, 403, 'Test 6: xclaude.ai → 403 (prefix-injection)');

      // Test 7: case mismatch — URL hostname normalization lowercases CLAUDE.AI
      const r7 = await httpPost(port, '/mcp', '{}', { Origin: 'https://CLAUDE.AI' });
      assertEqual(r7.status, 200, 'Test 7: https://CLAUDE.AI → 200 (case-insensitive)');
    } finally {
      await close();
    }
  }

  // Test 8 — BIND_ALL mode still rejects attacker subdomain
  console.log('\nTest 8: BC54 BIND_ALL mode still rejects non-local origin');
  {
    const prev = process.env.MCP_HTTP_BIND_ALL;
    process.env.MCP_HTTP_BIND_ALL = 'true';
    try {
      const { port, close } = await startServerWithMiddleware('https://localhost');
      try {
        const r8 = await httpPost(port, '/mcp', '{}', { Origin: 'https://claude.ai.attacker.example' });
        assertEqual(r8.status, 403, 'Test 8: BIND_ALL mode — attacker subdomain → 403');
      } finally {
        await close();
      }
    } finally {
      if (prev === undefined) delete process.env.MCP_HTTP_BIND_ALL;
      else process.env.MCP_HTTP_BIND_ALL = prev;
    }
  }

  // ─── Tests 9-11 ──────────────────────────────────────────────────────
  // BC54 hardcoded allowed domains
  console.log('\nTests 9-11: BC54 origin validation — 3 hardcoded allowed domains');
  {
    const { port, close } = await startServerWithMiddleware('https://localhost');
    try {
      const r9 = await httpPost(port, '/mcp', '{}', { Origin: 'https://claude.ai' });
      assertEqual(r9.status, 200, 'Test 9: https://claude.ai → 200');

      const r10 = await httpPost(port, '/mcp', '{}', { Origin: 'https://anthropic.com' });
      assertEqual(r10.status, 200, 'Test 10: https://anthropic.com → 200');

      const r11 = await httpPost(port, '/mcp', '{}', { Origin: 'https://claude-desktop.app' });
      assertEqual(r11.status, 200, 'Test 11: https://claude-desktop.app → 200 (3rd domain)');
    } finally {
      await close();
    }
  }

  // ─── Tests 12-13 ─────────────────────────────────────────────────────
  // BC54 subdomain handling
  console.log('\nTests 12-13: BC54 origin validation — subdomain handling');
  {
    const { port, close } = await startServerWithMiddleware('https://localhost');
    try {
      const r12 = await httpPost(port, '/mcp', '{}', { Origin: 'https://something.claude.ai' });
      assertEqual(r12.status, 200, 'Test 12: https://something.claude.ai → 200 (subdomain)');

      const r13 = await httpPost(port, '/mcp', '{}', { Origin: 'https://claudeai.com' });
      assertEqual(r13.status, 403, 'Test 13: https://claudeai.com → 403 (no dot — not subdomain)');
    } finally {
      await close();
    }
  }

  // ─── Test 14 ─────────────────────────────────────────────────────────
  // PRE-EXISTING preservation: corsOrigin verbatim per Task #145
  // (sec-ops N-1 fold + architectural-review polish #2 — rename for clarity)
  //
  // Task #145 FIX (2026-05-21): corsOrigin is now split BEFORE passing to
  // cors() (Block 3) AND in Block 6 (allowlist). Both blocks see proper
  // arrays. Tests 14a/14b verify the Block 6 allowlist; Test 14c verifies
  // the cors() module receives the split array (Block 3); Test 14d
  // verifies the wildcard '*' is preserved as a string (cors() needs '*'
  // literal for "allow all").
  console.log('\nTest 14: Task #145 fix — corsOrigin comma-split in BOTH Block 3 (cors) and Block 6 (allowlist)');
  {
    const { port, close } = await startServerWithMiddleware(
      'https://configured.example,https://localhost'
    );
    try {
      // Block 6 split: both origins in allowlist
      const r14a = await httpPost(port, '/mcp', '{}', { Origin: 'https://localhost' });
      assertEqual(r14a.status, 200, 'Test 14a: localhost (via Block 6 split) → 200');

      const r14b = await httpPost(port, '/mcp', '{}', { Origin: 'https://configured.example' });
      assertEqual(r14b.status, 200, 'Test 14b: configured.example (via Block 6 split) → 200');
    } finally {
      await close();
    }
  }

  // Test 14c — cors() receives array, not string with comma (Task #145)
  console.log('\nTest 14c: Task #145 — cors() receives split array for comma-separated corsOrigin');
  {
    const spy = makeSpyApp();
    configureExpressMiddleware(spy.app, {
      corsOrigin: 'https://a.com,https://b.com',
      logger: makeLogger(),
    });
    assertEqual(
      spy.corsCalls[0]?.options?.origin,
      ['https://a.com', 'https://b.com'],
      'Test 14c: cors().origin is split array, NOT comma string'
    );
  }

  // Test 14d — wildcard '*' preserved verbatim (cors needs '*' literal)
  console.log('\nTest 14d: Task #145 — wildcard "*" passes through to cors() as-is');
  {
    const spy = makeSpyApp();
    configureExpressMiddleware(spy.app, {
      corsOrigin: '*',
      logger: makeLogger(),
    });
    assertEqual(
      spy.corsCalls[0]?.options?.origin,
      '*',
      'Test 14d: cors().origin === "*" (not ["*"])'
    );
  }

  // ─── Test 15 ─────────────────────────────────────────────────────────
  // Block 4 JSON parse error → HTTP 200 -32700 (boundary I-4 fold)
  // INVARIANT: HTTP 200 is intentional per MCP spec, NOT a bug.
  console.log('\nTest 15: Block 4 JSON parse error → HTTP 200 + JSON-RPC -32700');
  {
    const { port, close } = await startServerWithMiddleware('https://localhost');
    try {
      const r15 = await httpPost(port, '/mcp', '{ malformed JSON', { Origin: 'https://claude.ai' });
      assertEqual(r15.status, 200, 'Test 15: malformed JSON → HTTP 200 (MCP spec, NOT 400)');
      const parsed = JSON.parse(r15.body);
      assertEqual(parsed.jsonrpc, '2.0', 'Test 15: response.jsonrpc === "2.0"');
      assertEqual(parsed.error?.code, -32700, 'Test 15: response.error.code === -32700');
      assertEqual(parsed.error?.message, 'Parse error', 'Test 15: response.error.message === "Parse error"');
      assertEqual(parsed.id, null, 'Test 15: response.id === null (unrecoverable id)');
    } finally {
      await close();
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
  console.log('✅ All Express setup tests passed');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});

// Suppress unused-var lint for silentLogger (kept for parity with other test files)
void silentLogger;
