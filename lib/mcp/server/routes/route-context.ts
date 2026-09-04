/**
 * RouteContext — cross-file dependency-injection boundary for Wave 6 route extraction.
 *
 * Each per-route-group file (`health-routes.ts`, `oauth-discovery-routes.ts`,
 * `oauth-flow-routes.ts`, `mcp-transport-routes.ts`) receives a single `RouteContext`
 * object via the `index.ts` orchestrator. This replaces the implicit `this.*`
 * coupling of the monolithic `setupRoutes()` body in `mcp-server-http-clean.js`.
 *
 * **DESIGN INVARIANT — Lazy accessors for `authMiddleware` and `mcpServer`**:
 *
 * These two fields are accessor functions (`() => RequestHandler` / `() => PureSDKNativeServer`),
 * NOT direct refs. This is LOAD-BEARING per Wave 4 Phase 4.4 hotfix (commit `ef04e744`):
 *
 *   - `createAuthMiddleware()` is a factory that returns a deferred handler with
 *     closed-over `inner = null`. Calling the factory at server-construction time
 *     (before `await initialize()`) triggers the SEC-C4 throw-before-init guard
 *     and crashes the server.
 *   - `mcpServer` (PureSDKNativeServer) is initialized in `await server.start()`,
 *     not in the constructor. Eager snapshot would capture `undefined`.
 *
 * The accessor pattern defers both calls until first request — matching the
 * lazy-init wrapper in `mcp-server-http-clean.js:createAuthMiddleware()`.
 *
 * **DO NOT** "tidy" these into direct refs without re-reading Wave 4 Phase 4.4
 * SESSION-HANDOFF.md. The auto-rollback `release_20260520_104615` happened because
 * of this exact ordering bug.
 *
 * **Round 1 specialist convergence**: 3 specialists (api-efficiency F3,
 * auth-permissions C1, boundary-contract I-1) flagged this independently.
 * The mixed direct-refs + accessor pattern is the validated compromise.
 *
 * @see lib/auth/oauth/auth-manager.ts:createMiddleware (the underlying factory)
 * @see cline_docs/reviews/auth-middleware-extraction-2026-05-20/SESSION-HANDOFF.md (Wave 4 hotfix lesson)
 * @see cline_docs/reviews/express-routes-extraction-2026-05-21/express-routes-extraction-plan-v2.md (D3 + C1 fold)
 */

import type { Application, Request, Response, RequestHandler } from 'express';
import type { MiddlewareLogger } from '../express-setup';
import type { ReqUser } from '../../../auth/oauth/auth-manager';

// Forward-declared types for server-class instances injected at orchestrator-construction time.
// These intentionally use `any` for now — the underlying classes are JS or have ambient types
// that vary; the RouteContext consumer doesn't need full type fidelity beyond the methods it calls.
type SessionStoreType = unknown;
type AuthManagerType = unknown;
type MCPOAuthValidatorType = unknown;
type PureSDKNativeServerType = unknown;

/**
 * Microsoft OAuth helper — exchangeMicrosoftCode signature.
 * Mirrors the server-class method that lives in `mcp-server-http-clean.js`
 * pending Wave 3b.1+ Microsoft extraction.
 */
export interface ExchangeMicrosoftCodeOpts {
  code: string;
  serverCallbackUrl: string;
  correlationId: string;
  renderError: (message: string, status?: number) => void;
}

/**
 * The dependency-injection contract for all extracted route files.
 *
 * Field count: **13** (matches Phase 0 corrected dep audit — the original 14 dropped
 * `this._callbackRateLimit` which turned out to be comment-only refs).
 *
 * Field breakdown:
 *   - 1 Express app (terminal sink for route registration)
 *   - 1 structural logger (re-exported from express-setup.ts — D10)
 *   - 4 already-extracted classes (SessionStore, AuthManager, MCPOAuthValidator from lib/auth/)
 *   - 2 lazy accessors (authMiddleware + mcpServer — see DESIGN INVARIANT above)
 *   - 5 server-class helper methods (H1-H5 from Phase 0 inventory; stay on server class
 *     per D2 until Wave 3b.1+ extracts Microsoft helpers + future waves for the rest)
 */
export interface RouteContext {
  /** Express application instance — terminal sink for route registration. */
  app: Application;

  /** Structural logger contract. Re-exported from express-setup.ts per D10. */
  logger: MiddlewareLogger;

  /** Bounded session storage (Wave 1-2 extraction). */
  sessionStore: SessionStoreType;

  /** Auth operations + orchestrator (Wave 3a+4 extraction). */
  authManager: AuthManagerType;

  /** Provider validator (canonical at lib/auth/oauth/mcp-oauth-validator.js). */
  oauthValidator: MCPOAuthValidatorType;

  /**
   * Lazy accessor for the per-server-instance auth middleware.
   * Calling this triggers `createAuthMiddleware()` on the server class, which
   * internally defers `authManager.createMiddleware()` until first request
   * (see DESIGN INVARIANT in file-header docstring).
   */
  getAuthMiddleware: () => RequestHandler;

  /**
   * Lazy accessor for the `PureSDKNativeServer` instance.
   * Returns `null` if accessed before `server.start()` completes — callers
   * MUST handle this case (typically by returning 503 'MCP server not
   * initialized' per existing precedent).
   */
  getMcpServer: () => PureSDKNativeServerType | null;

  // ─── Server-class helper methods (H1-H5) ──────────────────────────────
  // Per D2: helpers stay on server class for Wave 6. Route files receive them
  // via RouteContext as arrow functions pre-bound to the server instance at
  // orchestrator-construction time. This preserves `this.*` access semantics
  // inside the helpers WITHOUT exposing `this` to route files.

  /** H1: Generate OAuth auth code (R7 authorize uses). */
  generateAuthCode: () => string;

  /** H2: Microsoft OAuth authorization redirect (R7 authorize delegates). */
  handleMicrosoftAuthorize: (req: Request, res: Response) => Promise<void> | void;

  /** H3: Microsoft OAuth code exchange (R8 callback delegates). */
  exchangeMicrosoftCode: (opts: ExchangeMicrosoftCodeOpts) => Promise<unknown>;

  /** H4: Identify Claude.ai-browser stateless vs Claude-Code persistent mode. */
  detectClientMode: (req: Request) => 'stateless' | 'persistent';

  /** H5: Handle a single stateless MCP request (R11 POST /mcp delegates for ChatGPT/Claude.ai). */
  handleStatelessRequest: (req: Request, res: Response) => Promise<void>;

  /**
   * Route to MCP backend handlers. Lives on server class (Domain D from
   * the facade-extraction TODO; not extracted in Wave 6).
   * Type per D15 fold (sec-ops I3) — was `unknown` in Plan v1.
   */
  processMCPRequest: (request: unknown, user: ReqUser | null) => Promise<unknown>;
}
