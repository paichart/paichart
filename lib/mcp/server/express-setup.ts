/**
 * Express middleware setup for the MCP HTTP server.
 *
 * Pure setup function — registers 7 middleware blocks on an Express app in
 * the EXACT order required by mcp-server-http-clean.js. Order is itself a
 * load-bearing invariant (Block 4 must follow Block 1's express.json so the
 * JSON parse error handler catches the right SyntaxError; Block 6's origin
 * validation must run BEFORE Block 7's request logger so 403 responses
 * don't get debug-logged).
 *
 * Extracted from mcp-server-http-clean.js:306-461 in Wave 5 (2026-05-21).
 * Verbatim move — no behavioral changes. PRE-EXISTING items are
 * intentionally preserved (see Tasks #145, #146, #147 for follow-ups).
 *
 * Five invariants this file must preserve post-extraction (architectural-
 * review verdict, 2026-05-21):
 *   1. Block registration ORDER (Block 1→7 sequence)
 *   2. MCP_HTTP_BIND_ALL read INSIDE Block 6 closure (per-request), not at
 *      registration time
 *   3. BC54 hostname-equality with INLINE try/catch on each allowed entry
 *      (must NOT hoist to outer try/catch — would short-circuit the loop)
 *   4. JSON parse error returns HTTP 200 (not 400) — MCP spec compliance
 *   5. req.rawBody verify callback fires GLOBALLY on every POST, not just
 *      /mcp
 */

import type { Application, Request, Response, NextFunction } from 'express';
import express from 'express';
import cors from 'cors';

/**
 * Structural logger contract — only the methods this file calls. Pino
 * loggers satisfy this; the server's `this.logger` satisfies this. Pinned
 * per architectural-review polish (Wave 5 D6) to avoid pulling pino types
 * into this module.
 *
 * Verified: only `.warn` and `.debug` are called inside this function.
 * `.info` and `.error` are listed defensively in case a future block adds
 * them — keeping the contract symmetric makes the shape easy to satisfy
 * from any structured logger.
 */
export interface MiddlewareLogger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Options for configureExpressMiddleware.
 *
 * - `corsOrigin`: passed verbatim to `cors({ origin })`. PRE-EXISTING:
 *   comma-separated strings are NOT split by cors() — see Task #145 for
 *   the planned fix. This module preserves the verbatim behavior.
 * - `logger`: structural logger; see MiddlewareLogger.
 */
export interface ExpressMiddlewareOptions {
  corsOrigin: string;
  logger: MiddlewareLogger;
}

/**
 * Register the 7-block middleware stack on the given Express application.
 *
 * Verbatim extraction of mcp-server-http-clean.js setupMiddleware()
 * lines 306-461 (Wave 5). Call exactly once per app instance during
 * server construction, BEFORE setupRoutes() (line 185 then 186 in the
 * server constructor — middleware must be registered before routes).
 *
 * No return value. No state captured. Pure side-effect setup.
 */
export function configureExpressMiddleware(
  app: Application,
  options: ExpressMiddlewareOptions
): void {
  const { corsOrigin, logger } = options;

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 1 — JSON body parser (10MB limit, strict mode)
  //
  // Previously included a `verify` callback that captured the raw body
  // string to `req.rawBody` (with a 100KB DoS-protection truncation
  // marker). Dropped 2026-05-21 (Task #142): zero downstream readers
  // verified across 4 orthogonal greps of lib/, scripts/, app/, and
  // mcp-server-http-clean.js. The truncation marker was a poison-pill
  // value that was never consumed. Express's own 10MB `limit:` enforces
  // DoS protection without the per-request string allocation.
  // ─────────────────────────────────────────────────────────────────────
  app.use(express.json({
    limit: '10mb',
    strict: true, // Enforce strict JSON parsing
  }));

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 2 — URL-encoded body parser (OAuth token endpoint uses form)
  // ─────────────────────────────────────────────────────────────────────
  app.use(express.urlencoded({ extended: true, limit: '10mb' })); // OAuth token requests use form encoding

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 3 — CORS with exposed headers for OAuth discovery
  //
  // 🔧 FIX (Dec 13, 2025): Expose WWW-Authenticate for Claude Desktop OAuth discovery
  // Without exposedHeaders, Claude Desktop can't read the 401 response headers.
  //
  // 🔧 FIX (2026-05-21, Task #145): Split comma-separated corsOrigin into
  // an array before passing to cors(). cors() does NOT split strings, so
  // a value like 'https://a.com,https://b.com' was previously emitted as
  // a literal (spec-invalid) Access-Control-Allow-Origin header. The
  // wildcard '*' is preserved verbatim (cors() requires the string form
  // for "allow all"). Matches Block 6's already-split allowlist behavior.
  //
  // INVARIANT (sec-ops C2 fold): the exposedHeaders array MUST contain all
  // four entries verbatim — silent truncation (e.g., dropping
  // 'WWW-Authenticate') breaks Claude Desktop OAuth discovery with no error.
  // ─────────────────────────────────────────────────────────────────────
  const corsOriginParsed: string | string[] =
    corsOrigin === '*'
      ? '*'
      : corsOrigin.split(',').map((o) => o.trim()).filter((o) => o.length > 0);
  app.use(cors({
    origin: corsOriginParsed,
    exposedHeaders: [
      'WWW-Authenticate',           // OAuth resource_metadata discovery
      'Link',                       // RFC 9728 alternative
      'MCP-Session-Id',             // Session tracking
      'X-MCP-Version'               // Version header
    ],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'MCP-Session-Id', 'X-API-Key'],
    credentials: true
  }));

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 4 — JSON parse error → JSON-RPC -32700 (MCP spec compliance)
  //
  // INVARIANT (sec-ops I-2 / D7 fold):
  // MCP spec requires HTTP 200 (NOT 400) for malformed JSON, because the
  // error is carried as a JSON-RPC envelope in the response body. The
  // status code 200 here is INTENTIONAL and load-bearing — do NOT
  // "fix" it to 400 thinking it's a bug. Error code -32700 is the
  // JSON-RPC 2.0 "Parse error" code per the spec.
  //
  // id: null is correct here because the malformed JSON means we can't
  // recover the original request id.
  // ─────────────────────────────────────────────────────────────────────
  app.use((err: Error & { status?: number; body?: unknown }, _req: Request, res: Response, next: NextFunction) => {
    // Check if it's a JSON parse error
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      logger.warn('Invalid JSON received:', err.message);

      // Return JSON-RPC 2.0 parse error
      return res.status(200).json({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
          data: `Invalid JSON: ${err.message}`
        },
        id: null
      });
    }

    // Pass to next error handler
    next(err);
  });

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 5 — Global OPTIONS preflight for OAuth discovery endpoints
  //
  // 🔧 FIX (Dec 13, 2025): Global OPTIONS handler for OAuth discovery endpoints
  // Required for Claude Desktop cross-origin preflight requests.
  // 🔧 FIX (Dec 13, 2025): Use explicit paths instead of wildcards
  // path-to-regexp doesn't support wildcards like '/oauth/*' - they cause TypeError.
  //
  // PRE-EXISTING (sec-ops PRE-2, confirmed conventional): the wildcard
  // `Access-Control-Allow-Origin: *` on preflight is conventional for
  // OAuth discovery endpoints because cookies/credentials aren't sent on
  // preflight. Tightening would require per-route discovery-endpoint logic.
  // ─────────────────────────────────────────────────────────────────────
  app.options([
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-protected-resource',
    '/.well-known/openid-configuration',
    '/.well-known/jwks.json',
    '/oauth/authorize',
    '/oauth/token',
    '/oauth/register',
    '/mcp'
  ], (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Session-Id, X-API-Key');
    res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Link, MCP-Session-Id');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
  });

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 6 — Origin validation (BC54 DNS rebinding protection)
  //
  // MUST: Validate Origin header to prevent DNS rebinding attacks
  // Note: Only validate when Origin is present (browsers send it, CLI tools don't)
  //
  // INVARIANTS (architectural-review):
  //   - MCP_HTTP_BIND_ALL is read INSIDE the closure (per-request),
  //     NOT at registration time
  //   - The hostname-equality `try { new URL(allowed).hostname } catch {}`
  //     loop in BC54 uses INLINE try/catch per iteration — hoisting to
  //     an outer try/catch would short-circuit the loop on the first bad
  //     entry and silently skip subsequent allowed origins
  //
  // PRE-EXISTING (boundary I-3 / sec-ops PRE-4, Task #146):
  // `req.path === '/mcp'` exact-match leaves /mcp/v2 ungated. Wave 6
  // route extraction or Task #146 will fix.
  // PRE-EXISTING (sec-ops PRE-1 / N3, Task #147):
  // `startsWith('172.')` matches 172.0-172.255, not just RFC1918
  // 172.16-172.31. LOW severity in dev-only BIND_ALL branch.
  // ─────────────────────────────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = (req.headers.origin || req.headers.referer) as string | undefined;

    // Only validate for MCP endpoints when Origin is present
    if (req.path === '/mcp' && origin) {
      // For security: only allow localhost origins by default
      const allowedOrigins = [
        'http://localhost',
        'http://127.0.0.1',
        'https://localhost',
        'https://127.0.0.1'
      ];

      // If CORS is configured for specific origin(s), allow them
      if (corsOrigin !== '*') {
        const configuredOrigins = corsOrigin.split(',').map((o: string) => o.trim());
        allowedOrigins.push(...configuredOrigins);
      }

      // If server is bound to all interfaces, be more permissive
      // This is for development/testing when MCP_HTTP_BIND_ALL=true
      if (process.env.MCP_HTTP_BIND_ALL === 'true') {
        // Allow local network origins for development.
        // Task #147 (2026-05-21): tightened 172.* to RFC1918 172.16-31
        // (was startsWith('172.') which matches 172.0-172.255, far broader
        // than RFC1918's 172.16.0.0/12). LOW severity dev-only fix.
        const originUrl = new URL(origin);
        const hostname = originUrl.hostname;
        // 172.16.0.0/12 (RFC1918) — second octet must be 16-31
        const rfc1918_172_match = /^172\.(\d{1,3})\./.exec(hostname);
        const isRfc1918_172 = rfc1918_172_match !== null
          && Number(rfc1918_172_match[1]) >= 16
          && Number(rfc1918_172_match[1]) <= 31;
        const isLocalNetwork =
          hostname === 'localhost' ||
          hostname.startsWith('127.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          isRfc1918_172;

        if (!isLocalNetwork) {
          logger.warn('Origin validation failed: non-local network origin', { origin });
          return res.status(403).json({
            error: 'Forbidden: Invalid Origin header'
          });
        }
      } else {
        // BC54 FIX: Parse origin as URL and compare hostnames exactly (was using .includes()/.startsWith() — trivially bypassable)
        const originUrl = new URL(origin);
        const originHost = originUrl.hostname.toLowerCase();
        const isAllowed = allowedOrigins.some(allowed => {
          try {
            const allowedHost = new URL(allowed).hostname.toLowerCase();
            return originHost === allowedHost;
          } catch { return false; }
        });

        // BC54 FIX: Exact hostname match for Claude.ai and Anthropic domains
        const isClaudeAIDomain = originHost === 'claude.ai' || originHost.endsWith('.claude.ai') ||
                                originHost === 'anthropic.com' || originHost.endsWith('.anthropic.com') ||
                                originHost === 'claude-desktop.app' || originHost.endsWith('.claude-desktop.app');

        if (!isAllowed && !isClaudeAIDomain) {
          logger.warn('Origin validation failed:', { origin, allowed: allowedOrigins });
          return res.status(403).json({
            error: 'Forbidden: Invalid Origin header'
          });
        }
      }
    }

    next();
  });

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 7 — Request logging
  // ─────────────────────────────────────────────────────────────────────
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`HTTP Request`, {
      method: req.method,
      path: req.path,
      hasAuth: !!(req.headers.authorization || req.headers['x-api-key']),
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin
    });
    next();
  });
}
