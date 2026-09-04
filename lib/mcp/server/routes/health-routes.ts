/**
 * Health check routes (R1).
 *
 * Extracted from `mcp-server-http-clean.js:setupRoutes()` R1 in Wave 6 Phase 6.2.
 * Verbatim move — no behavioral changes from the pre-extraction shape.
 *
 * Single endpoint:
 *   GET /health — liveness probe + session/oauthRequest counts.
 *
 * `/mcp/health` alias was dropped in Phase 0.6 (`a24df016`) — zero hits in
 * 14-day nginx access logs.
 *
 * Dependencies (3 of RouteContext's 13 fields):
 *   - `ctx.app`         — terminal sink for route registration
 *   - `ctx.sessionStore` — read-only access to session + oauth-request counts
 *   - (no logger needed — handler doesn't log)
 *
 * @see lib/mcp/server/routes/route-context.ts (DI contract)
 * @see cline_docs/reviews/express-routes-extraction-2026-05-21/express-routes-extraction-plan-v2.md Phase 6.2
 */

import type { Request, Response } from 'express';
import type { RouteContext } from './route-context';

/**
 * Register R1 — GET /health.
 *
 * Response shape (locked per Plan v2 Response-Shape Reference Table):
 * ```
 * 200 OK
 * {
 *   status: 'ok',
 *   transport: 'clean-http',
 *   timestamp: ISO-8601,
 *   version: '1.0.0',
 *   mcp: {
 *     architecture: 'single-backend',
 *     sessions: number,
 *     maxSessions: number,
 *     oauthRequests: number,
 *     maxOAuthRequests: number,
 *     evictions: object,
 *     backend: 'mcp-server-v5'
 *   }
 * }
 * ```
 */
export function registerHealthRoutes(ctx: RouteContext): void {
  // Cast SessionStore to a typed shape for the read-only methods this route needs.
  // Full SessionStore interface lives in lib/auth/oauth/session-store.ts; ctx
  // declares it as `unknown` per RouteContext's deliberate JS/TS-cross-boundary
  // type erasure.
  const sessionStore = ctx.sessionStore as {
    getSessionCount: () => number;
    getOAuthRequestCount: () => number;
    getLimits: () => { maxSessions: number; maxOAuthRequests: number };
    getEvictionStats: () => unknown;
  };

  ctx.app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      transport: 'clean-http',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      mcp: {
        architecture: 'single-backend',
        sessions: sessionStore.getSessionCount(),
        maxSessions: sessionStore.getLimits().maxSessions,
        oauthRequests: sessionStore.getOAuthRequestCount(),
        maxOAuthRequests: sessionStore.getLimits().maxOAuthRequests,
        evictions: sessionStore.getEvictionStats(),
        backend: 'mcp-server-v5',
      },
    });
  });
}
