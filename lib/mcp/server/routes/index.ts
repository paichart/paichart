/**
 * Route orchestrator for the MCP HTTP server.
 *
 * Replaces the monolithic `setupRoutes()` body in `mcp-server-http-clean.js`
 * with explicit per-route-group registration. Per Plan v2 D1 (Option B
 * decomposition): 5 per-RFC-boundary files (health, oauth-discovery,
 * oauth-flow, mcp-transport) + this orchestrator.
 *
 * **CRITICAL — Registration order is LOAD-BEARING** (Plan v2 D4, Hazard H-2):
 *
 * The order in which sub-registrars are called below MUST match the order
 * in which `setupRoutes()` previously registered its 12 blocks. Specifically:
 *
 *   - B1 (`/mcp` Link header middleware) MUST register before R11
 *     (`POST /mcp` main handler) so the Link header is set on /mcp responses
 *   - B2 (`POST /mcp` unauth'd-initialize → 401 + WWW-Authenticate trigger)
 *     MUST register BEFORE R11 — otherwise R11's authMiddleware short-circuits
 *     unauth'd POST and Claude Desktop OAuth discovery silently breaks (no
 *     401, no WWW-Authenticate header, no OAuth-discovery trigger). This
 *     specific failure mode regressed twice historically; current order
 *     defends it.
 *   - R7/R8/R9 (OAuth flow trio) share state via SessionStore — they MUST
 *     be co-located in the same registrar (oauth-flow-routes) so the
 *     SessionStore boundary is a single-file concern (Hazard H-3).
 *
 * Sub-registrar order (Wave 5 setupMiddleware runs BEFORE this orchestrator,
 * registering JSON body parser, CORS, etc. — see `configureExpressMiddleware`):
 *
 *   1. health-routes         (R1 — /health)
 *   2. oauth-discovery-routes (B1 + R3 JWKS + R4 protected-resource + R5 authorization-server)
 *   3. oauth-flow-routes      (B2 + R7 authorize + R8 callback + R9 token + R10 register)
 *   4. mcp-transport-routes   (R11 POST /mcp + R12 GET /mcp SSE)
 *
 * @see lib/mcp/server/routes/route-context.ts (the DI contract)
 * @see cline_docs/reviews/express-routes-extraction-2026-05-21/express-routes-extraction-plan-v2.md
 */

import type { RouteContext } from './route-context';
import { registerHealthRoutes as registerHealthRoutesImpl } from './health-routes';
import { registerOAuthDiscoveryRoutes as registerOAuthDiscoveryRoutesImpl } from './oauth-discovery-routes';
import { registerOAuthFlowRoutes as registerOAuthFlowRoutesImpl } from './oauth-flow-routes';
import { registerMCPTransportRoutes as registerMCPTransportRoutesImpl } from './mcp-transport-routes';

/**
 * Phase 6.1 STUB — orchestrator wired in, sub-registrars empty.
 *
 * Phase 6.2-6.5 will fill each registrar in sequence. The server class
 * does NOT call `registerAllRoutes` yet; it still uses its own `setupRoutes()`
 * body. This phase is pure scaffolding + Foundation tests.
 */
export function registerAllRoutes(ctx: RouteContext): void {
  // Order is LOAD-BEARING per Plan v2 D4 / Hazard H-2 — do NOT reorder
  // without updating scripts/test-routes-orchestrator.ts handler-identity assertions.
  registerHealthRoutes(ctx);
  registerOAuthDiscoveryRoutes(ctx);
  registerOAuthFlowRoutes(ctx);
  registerMCPTransportRoutes(ctx);
}

/**
 * Phase 6.2 — extracts R1 (GET /health).
 * Implementation lives in `./health-routes.ts`; this barrel re-export
 * keeps the orchestrator's import surface stable.
 */
export function registerHealthRoutes(ctx: RouteContext): void {
  registerHealthRoutesImpl(ctx);
}

/**
 * Phase 6.3 — extracts R3 (JWKS), R4 (protected-resource),
 * R5 (authorization-server), B1 (/mcp Link header middleware).
 * Implementation lives in `./oauth-discovery-routes.ts`.
 */
export function registerOAuthDiscoveryRoutes(ctx: RouteContext): void {
  registerOAuthDiscoveryRoutesImpl(ctx);
}

/**
 * Phase 6.4 — extracts B2 (RFC 6750 401 trigger), R7 (authorize),
 * R8 (callback), R9 (token), R10 (register). Largest single phase.
 * Implementation lives in `./oauth-flow-routes.ts`.
 */
export function registerOAuthFlowRoutes(ctx: RouteContext): void {
  registerOAuthFlowRoutesImpl(ctx);
}

/**
 * Phase 6.5 — extracts R11 (POST /mcp), R12 (GET /mcp SSE).
 * Implementation lives in `./mcp-transport-routes.ts`.
 * FINAL Wave 6 route extraction.
 */
export function registerMCPTransportRoutes(ctx: RouteContext): void {
  registerMCPTransportRoutesImpl(ctx);
}
