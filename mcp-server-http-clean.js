#!/usr/bin/env node

/**
 * Clean MCP HTTP Server Implementation
 * Uses the working mcp-server-v5.js as backend via child process
 * Avoids complex per-session architecture and resource validation loops
 */

require('dotenv').config();

// Phase 2 proper (2026-04-08) — Register ts-node + tsconfig-paths for TypeScript
// resolution. Must run AFTER dotenv.config() (so JWT_SECRET is available) but
// BEFORE any lib/** require. Critical: line 27's `require('./mcp-server-v5')`
// transitively loads lib/prisma, lib/utils/ensure-object, and the oauth chain,
// all of which are now .ts source-of-truth files after Phase 2 deletes their .js
// siblings. Without this registration the entire paichart-mcp process would
// crash on MODULE_NOT_FOUND.
//
// Unconditional (NOT gated on isProduction): `npm run mcp:http:dev` needs ts-node
// too. Mirrors the pattern from server.js:9-25 and the parent registration in
// mcp-server-v5.js from Phase 2.P0 step 1 (commit a7db9a35). Idempotent —
// calling ts-node.register() twice is safe, the second call is a no-op.
require('tsconfig-paths/register');
require('ts-node').register({
  project: './tsconfig.server.json',
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    baseUrl: '.',
    paths: {
      '@/*': ['./*'],
    },
  },
});

const { mcpLogger: _bootLogger, authLogger, createAdapter } = require('./lib/mcp/server/mcp-logger');
const bootLog = _bootLogger.child({ component: 'clean-http' });

// JWT_ACCESS_SECRET boot guard removed 2026-06-05: the symmetric access secret has no
// remaining consumer (api keys mint/verify RS256 via mintMcpToken; the inline HS256
// verifier was deleted 2026-05-28). Auth is RS256-only — see lib/auth/token-manager.ts.

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// Import the working MCP server
const { PureSDKNativeServer } = require('./mcp-server-v5');

// Import prompt-registry's setPrismaInstance — configures the prompt-registry
// module's database access at server-class construction time. MUST run before
// PureSDKNativeServer instantiates (in MCPCoreManager.init), which itself
// constructs the PromptRegistry that reads from prisma.
//
// Wave 7 Phase 7.2.1 (2026-05-21): dropped `PromptRegistry` named import (was
// at line 61) + entire `PromptCommandHandler` import (was at line 62). Both
// classes are still used at runtime via PureSDKNativeServer's own
// instantiation chain (see mcp-server-v5.js); the IMPORTS here were dead-code
// residuals after setupMCPServer moved to MCPCoreManager in Phase 7.1+7.2.
// Direct grep confirmed zero `new PromptRegistry(` / `new PromptCommandHandler(`
// instantiations in this file.
const { setPrismaInstance } = require('./lib/mcp/server/prompts/prompt-registry');

// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
const { prisma, ensureConnection } = require('./lib/prisma');
setPrismaInstance(prisma);

// Alias for backward compatibility with OAuth code
const globalPrisma = prisma;

// Import unified OAuth validator
const { MCPOAuthValidator } = require('./lib/auth/oauth/mcp-oauth-validator');
// U2 Phase A (2026-05-19): canonical mintMcpToken consolidated to lib/auth/token-manager.ts.
// Direct ts-node require works because ts-node is registered at lines 23-24.
const { mintMcpToken } = require('./lib/auth/token-manager');
// Phase 3.0b (2026-05-20): multi-key JWKS verification (SEC-C2 fix).
// Replaces inline `process.env.JWT_PUBLIC_KEY_BASE64` lookup with kid-based
// lookup so the verifier accepts BOTH current and previous keys during
// rotation — matching what the JWKS endpoint publishes.
const { getPublicKeyPEM } = require('./lib/auth/jwt-key-store');
// Phase 3.1 (2026-05-20): shared auth constants — single source of truth.
// Static class props below re-export from this module so existing
// `CleanMCPHTTPServer.X` callers continue to work unchanged. AuthManager
// Wave 3a will import from this module directly.
const AUTH_CONSTANTS = require('./lib/auth/auth-constants');
// D4 (2026-09-04): issuer/audiences/discovery URLs derive from APP_BASE_URL. In production the
// server refuses to boot without it — a self-host at the fallback would advertise paichart.app
// as its OAuth issuer (silent identity swap). Prod always sets it (deploy heredoc), so no-op there.
const { MCP_FRONTDOOR_AUDIENCE, assertPublicBaseUrlConfigured } = require('./lib/auth/public-base-url');
if (process.env.NODE_ENV === 'production') {
  const { warnings: baseUrlWarnings } = assertPublicBaseUrlConfigured();
  for (const w of baseUrlWarnings) authLogger.warn({ component: 'public-base-url' }, w);
}
// Refactor Wave 1 (2026-05-19): MCP method classifier extracted (was inline at
// MCP_PUBLIC_METHODS / isProtectedMethod). See
// cline_docs/reviews/mcp-server-http-clean-refactor-2026-05-19/current-state-inventory.md §C.
const { isProtectedMethod, MCP_PUBLIC_METHODS } = require('./lib/auth/mcp-method-classifier');
// SessionStore — consolidated home for the in-memory MCP session state
// (transports, contexts, oauth requests, auth codes). Extracted in
// cline_docs/reviews/mcp-server-http-clean-refactor-2026-05-19/SESSION-STORE-EXTRACTION-PLAN-v2.md
const { SessionStore } = require('./lib/auth/oauth/session-store');
// AuthManager Phase 3.3 (2026-05-20): side-by-side with legacy auth code.
// Constructed with noCleanup:true; createAuthMiddleware/setupAuth/etc. on this
// class remain authoritative until Phase 3.4 dual-validate lands. See
// cline_docs/reviews/auth-manager-extraction-2026-05-20/auth-manager-extraction-plan-v3.md
const { AuthManager } = require('./lib/auth/oauth/auth-manager');
// Wave 7 Phase 7.1 (2026-05-21): MCPCoreManager owns PureSDKNativeServer
// backend lifecycle + initial auth context (setupMCPServer + initializeAuthContext).
const { MCPCoreManager } = require('./lib/mcp/server/mcp-core');
// Import enhanced OAuth logger for MCP OAuth audit trail
const { oauthLogger } = require('./lib/auth/oauth/oauth-logger');
// Import MCP OAuth token manager for Microsoft/Google token storage (Phase 0.1)
const { MCPOAuthTokenManager } = require('./lib/auth/oauth/mcp-oauth-token-manager');
// Wave 5 Phase 5.2 (2026-05-21): Express middleware setup extracted to lib/mcp/server/express-setup.ts
// configureExpressMiddleware registers all 7 middleware blocks verbatim (cors, JSON parser, BC54
// origin validation, etc). See express-middleware-extraction-plan-v2.md.
const { configureExpressMiddleware } = require('./lib/mcp/server/express-setup');
// Wave 6 Phase 6.2 (2026-05-21): Route registration extracted to lib/mcp/server/routes/
// registerAllRoutes orchestrates 5 per-route-group registrars in load-bearing order.
// Phase 6.2 lands R1 health; subsequent phases will land OAuth discovery/flow + MCP transport.
const { registerHealthRoutes, registerOAuthDiscoveryRoutes, registerOAuthFlowRoutes, registerMCPTransportRoutes } = require('./lib/mcp/server/routes');

// U2 Phase E.1 populateReqUser bare function dropped in Phase 3.10a (2026-05-20).
// Originally consolidated the 3 auth-middleware req.user population paths.
// Replaced by AuthManager.populateReqUser (lib/auth/oauth/auth-manager.ts) in
// Phase 3.6 — 0 callers remained, deleted here. The AuthManager version adds
// dual id/userId emission + Object.freeze guard (SEC-N1) on top of the
// original contract.

class CleanMCPHTTPServer {
  // Auth constants — single source of truth now in `lib/auth/auth-constants.ts`
  // (Phase 3.1 extraction, 2026-05-20). Static class props re-export so existing
  // `CleanMCPHTTPServer.X` callers continue to work. Documentation for each
  // constant lives in the module; do NOT edit values here — edit the module.
  static TOKEN_TTL_SECONDS = AUTH_CONSTANTS.TOKEN_TTL_SECONDS;
  static OAUTH_STATE_TTL_MS = AUTH_CONSTANTS.OAUTH_STATE_TTL_MS;
  static REFRESH_TOKEN_TTL_DAYS = AUTH_CONSTANTS.REFRESH_TOKEN_TTL_DAYS;
  static CHATGPT_SCOPE = AUTH_CONSTANTS.CHATGPT_SCOPE;
  static CLAUDE_SCOPE = AUTH_CONSTANTS.CLAUDE_SCOPE;
  static MICROSOFT_GRAPH_SCOPE = AUTH_CONSTANTS.MICROSOFT_GRAPH_SCOPE;
  static MICROSOFT_GRAPH_SCOPE_OFFLINE = AUTH_CONSTANTS.MICROSOFT_GRAPH_SCOPE_OFFLINE;
  static MCP_SCOPES = AUTH_CONSTANTS.MCP_SCOPES;
  static OIDC_SCOPES = AUTH_CONSTANTS.OIDC_SCOPES;
  static GITHUB_SCOPES = AUTH_CONSTANTS.GITHUB_SCOPES;

  // MCP_PUBLIC_METHODS + isProtectedMethod() extracted to
  // ./lib/auth/mcp-method-classifier.ts (Wave 1 refactor, 2026-05-19).
  // Imported at top of this file. The class no longer owns this classification —
  // it's pure data + pure function with zero coupling to instance state.

  constructor(options = {}) {
    this.port = options.port || process.env.MCP_HTTP_PORT || 8080;
    this.corsOrigin = options.corsOrigin || process.env.MCP_HTTP_CORS_ORIGIN || '*';
    // Method-level authentication (Dec 8, 2025)
    // Public methods (initialize, ping, list/*) allowed without auth for OAuth discovery
    // Protected methods (tools/call, resources/read, etc.) require auth
    // OAuth endpoints (/oauth/*) are always auth-exempt (handled separately)
    bootLog.info({ publicMethods: MCP_PUBLIC_METHODS }, 'Method-level security enabled');
    
    this.app = express();
    this.server = null;
    // Wave 7 Phase 7.1 (2026-05-21): this.mcpCore.mcpServer field DELETED. MCPCoreManager
    // owns the PureSDKNativeServer instance via its internal _mcpServer field.
    // Access via this.mcpCore.mcpServer (lazy getter, returns null pre-init).
    // Per C-CROSS-2 (architectural-review verdict v2 Q4): no property shim;
    // direct rewire of all this.mcpCore.mcpServer.X references to this.mcpCore.mcpServer.X.
    this.sdkTransport = null; // DEPRECATED: Will be removed for per-session architecture
    this.logger = this.createLogger();

    // Session TTL configuration
    // Session TTL + cleanup interval moved to SessionStore defaults
    // (30 min TTL, 5 min interval). Phase 2.10f (2026-05-19).

    // Map size limits (time-bomb-detection-pattern.md - Category 1: Unbounded Caches)
    // SessionStore — sole owner of session/oauthRequest/authCode state + TTL
    // cleanup. Phase 2.10f (2026-05-19) removed the legacy scheduler invocation.
    this.sessionStore = new SessionStore({ logger: this.logger });

    // Initialize OAuth validator
    this.oauthValidator = new MCPOAuthValidator(this.logger);

    // AuthManager (Phase 3.3 → 3.9, 2026-05-20):
    //  - 3.3: instantiated side-by-side
    //  - 3.6: populateReqUser made authoritative on hot path
    //  - 3.8/3.8c/3.8d: scope/refresh/detect callers migrated
    //  - 3.9 (this commit): rate-limit cleanup interval now active (noCleanup
    //    flag dropped). Replaces legacy _callbackRateLimit Map + ad-hoc
    //    "every 100 requests" cleanup with a 60s setInterval running
    //    AuthManager.cleanupRateLimitState(). interval.unref() so it
    //    doesn't pin the process during graceful shutdown.
    // initialize() called from start(); destroy() from shutdown() — clears
    // interval + flushes rate-limit Map.
    this.authManager = new AuthManager({
      logger: this.logger,
      sessionStore: this.sessionStore,
      oauthAuditLogger: oauthLogger,
      // Phase 4.0 (2026-05-20, Wave 4): prismaClient injected for the
      // RS256 user-lookup path inside AuthManager.createMiddleware().
      // Per v2 plan D1 — constructor injection, not call-time. Matches
      // sessionStore/oauthAuditLogger pattern.
      prismaClient: globalPrisma,
    });

    // Wave 7 Phase 7.1 (2026-05-21): MCPCoreManager owns SDK backend lifecycle.
    // Constructed cheap (just stores deps); init() awaited from start() to
    // populate this.mcpCore.mcpServer. Route handlers (registered below by
    // setupRoutes) dereference via ctx.getMcpServer = () => this.mcpCore.mcpServer
    // lazy accessor — pattern matches Wave 4 Phase 4.4 SEC-C4 lazy-init lesson.
    this.mcpCore = new MCPCoreManager({
      logger: this.logger,
      prismaClient: globalPrisma,
      sessionStore: this.sessionStore,
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Determine if an MCP method requires authentication
   * @param {string} method - MCP method name from request
   * @returns {boolean} - true if method requires auth, false if public
   */
  // isProtectedMethod() extracted to ./lib/auth/mcp-method-classifier.ts
  // (Wave 1 refactor, 2026-05-19). Import at top of this file.

  // setupMCPServer() EXTRACTED to lib/mcp/server/mcp-core.ts:MCPCoreManager.init()
  // in Wave 7 Phase 7.1 (2026-05-21). Verbatim move — no behavioral change.
  // Server-class start() now calls this.mcpCore.init() instead.

  // setupSDKSessionServer() REMOVED 2026-05-21 (Wave 7 Phase 7.0b).
  // Last edit Sept 10, 2025 (commit bce5322e — "Fix MCP tool registration"
  // / orphaned during manual session lifecycle refactor that replaced SDK
  // transport). Zero callers in repo (full-repo grep), zero production
  // journald hits in 14 days. Verified Phase 0 inventory at
  // cline_docs/reviews/mcp-core-extraction-2026-05-21/phase-0-inventory.md
  // §1.2. Parallel to Wave 3b.0a dead-code drop of
  // handleMicrosoftTokenExchange + refreshMicrosoftToken (commit 0f07ac90).
  // Net -37 LOC.

  createLogger() {
    return createAdapter(_bootLogger.child({ component: 'clean-http' }));
  }

  // Session TTL cleanup is owned by SessionStore (registered at construction via
  // its internal setInterval). Phase 2.10f (2026-05-19) removed the legacy
  // startSessionCleanupScheduler / cleanupStaleSessions methods from here.
  // Phase 2.11 (2026-05-19) removed trackSessionCreation + refreshSessionTTL from
  // SessionStore itself — both had zero callers. See gap-analysis doc Tracked Item
  // #1 if sliding-TTL behaviour ever needs to come back.

  // setSession (with bounded LRU eviction + timestamp tracking) extracted to
  // SessionStore. Phase 2.10d (2026-05-19) removed the pass-through shim;
  // callers invoke this.sessionStore.setSession directly.

  // setOAuthRequest (with bounded LRU eviction) extracted to SessionStore.
  // Phase 2.10c (2026-05-19) removed the pass-through shim; callers invoke
  // this.sessionStore.setOAuthRequest directly.

  // setAuthCode + exchangeAuthCode (replay-safe atomic get+delete) extracted to
  // SessionStore. Phase 2.10b (2026-05-19) removed the pass-through shims;
  // callers now invoke this.sessionStore.{setAuthCode,exchangeAuthCode} directly.

  // isAllowedRedirectUri (sec-ops: open redirect prevention) extracted to
  // SessionStore.isAllowedRedirectUri (Phase 2.8 refactor, 2026-05-19).
  // Callers now invoke this.sessionStore.isAllowedRedirectUri(uri) directly.
  // Allowlist corpus + suffix-evasion guard are unit-tested in test:session-store.

  setupMiddleware() {
    // Wave 5 Phase 5.2 (2026-05-21): body extracted verbatim to
    // lib/mcp/server/express-setup.ts. See express-middleware-extraction-plan-v2.md
    // and the file's docstring for load-bearing invariants (Block 1 rawBody
    // truncation contract, Block 4 HTTP-200-on-parse-error, Block 6 BC54).
    configureExpressMiddleware(this.app, {
      corsOrigin: this.corsOrigin,
      logger: this.logger,
    });
  }

  async setupAuth() {
    try {
      // JWT_ACCESS_SECRET guard removed 2026-06-05: the inline HS256 verifier this once
      // protected was deleted 2026-05-28; live /mcp auth is AuthManager.createMiddleware →
      // token-manager.verifyAccessToken (RS256-only). The symmetric secret has no consumer.
      this.logger.info('Authentication setup complete - Method-level security enabled', {
        publicMethods: MCP_PUBLIC_METHODS.length,
        protectedMethods: 'All others (secure-by-default)'
      });
    } catch (error) {
      this.logger.error('Failed to setup authentication:', error);
      process.exit(1);
    }
  }

  // Phase 4.3 shadow validation helpers removed in Phase 4.4 (2026-05-20)
  // alongside the legacy createAuthMiddleware body that they were validating.
  //
  // Observation window result (production logs at 07:10:03+ on deploy day):
  // 26 `auth_middleware_dual_validate_drift` events — ALL of them were the
  // same divergence: `name: legacy=undefined shadow=<name from Prisma>`.
  // This was the v2 plan's deliberate Phase 4.2 improvement (populating
  // req.user.name from the Prisma user when JWT lacks the name claim).
  // The shadow did NOT find any real bugs in AuthManager.createMiddleware.
  // The 10 TypeError events earlier in the window were a pre-existing
  // token-manager.verifyAccessToken latent issue (Task #135 follow-up),
  // not caused by Wave 4. p99 added latency was 3-7ms (well under 50ms gate).
  //
  // Phase 4.4 (this commit): server-class createAuthMiddleware becomes a
  // thin delegation wrapper. AuthManager.createMiddleware is now sole
  // authority for the auth orchestration on the hot path.

  /**
   * Auth middleware factory — thin delegation wrapper around
   * AuthManager.createMiddleware. The wrapper catches AuthMiddlewareReject
   * (thrown by AuthManager on 401 paths) and merges `req.body?.id ?? null`
   * into the JSON-RPC envelope at serialize time (the id-mirror contract
   * lives at the HTTP boundary, per v2 boundary-C3 fold).
   *
   * Wave 4 Phase 4.4 (2026-05-20): ~234 LOC of orchestration deleted;
   * replaced by this ~30 LOC wrapper. Phase 4.3 shadow window confirmed
   * AuthManager.createMiddleware behaves equivalently except for the
   * deliberate Phase 4.2 improvement of populating req.user.name from
   * the Prisma DB when the JWT payload lacks the name claim.
   *
   * Downstream behavioral change introduced by this commit:
   *   - req.user.name was undefined for most RS256 tokens before (JWT
   *     payload didn't carry name). It is now populated from Prisma's
   *     user.name. Consumers (task comments, audit logs, notifications)
   *     will start seeing real names instead of undefined. This is an
   *     improvement, not a regression.
   */
  createAuthMiddleware() {
    // Lazy-init: do NOT call this.authManager.createMiddleware() at factory
    // invocation time. setupRoutes() runs in the constructor (line ~186),
    // but authManager.initialize() runs in start() AFTER construction. The
    // factory call would throw the SEC-C4 "called before initialize()" guard
    // (Wave 3a) at server-startup time — that's what caused the failed
    // Phase 4.4 deploy (release_20260520_104615, auto-rolled-back).
    //
    // Defer the call to first request: by then, start() has run and
    // initialize() has populated the AuthManager state. Cache the inner
    // middleware so the factory is invoked exactly once per process.
    let inner = null;
    return async (req, res, next) => {
      if (!inner) inner = this.authManager.createMiddleware();
      try {
        await inner(req, res, next);
      } catch (err) {
        if (err && err.name === 'AuthMiddlewareReject') {
          // Apply all 3 headers per the v2 marker contract
          for (const [headerName, headerValue] of Object.entries(err.headers)) {
            res.setHeader(headerName, headerValue);
          }
          // Merge req.body?.id into JSON-RPC envelope (?? null preserves
          // id=0 per boundary N3; the marker omits id by design).
          return res.status(err.statusCode).json({
            ...err.jsonRpcErrorWithoutId,
            id: req.body?.id ?? null,
          });
        }
        // Non-AuthMiddlewareReject error → 500 (unchanged behavior)
        this.logger.error('Authentication error:', err);
        return res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Authentication error',
            data: { details: err?.message },
          },
          id: req.body?.id ?? null,
        });
      }
    };
  }

  // verifyGitHubToken() + findOrCreateUserFromGitHub() removed in Phase 3.0a (2026-05-20).
  // Verified ZERO callers anywhere in the codebase (oauth-multi-provider C3 hypothesis confirmed).
  // The live GitHub OAuth flow goes through `oauthValidator.verifyOAuthToken()` (the dispatcher
  // at lib/auth/oauth/mcp-oauth-validator.js:24), which in turn calls its own internal
  // verifyGitHubToken at line 50. The discrete methods here were dead code.
  // If GitHub-specific validation is ever needed inline again, see AuthManager.verifyGitHubToken
  // (Wave 3a extraction plan v3 §API).

  // generateRefreshToken dropped in Phase 3.10a (2026-05-20). Migrated to
  // AuthManager.generateRefreshToken in Phase 3.8 (commit b7f3ead5) — byte-
  // equivalent: `mcp_refresh_${crypto.randomBytes(32).base64url}`.

  /**
   * Generate Secure Auth Code for OAuth Proxy Pattern
   * Returns pac_ prefixed random string for pAIchart auth codes
   * Used in the callback route after exchanging GitHub code for token
   *
   * @returns {string} Auth code with pac_ prefix (256-bit entropy)
   */
  generateAuthCode() {
    const code = crypto.randomBytes(32).toString('hex');
    return `pac_${code}`;
  }

  // validateScopeMatch + detectOAuthClient dropped in Phase 3.10a (2026-05-20).
  // Both migrated to AuthManager in Phase 3.8/3.8c/3.8d:
  //  - AuthManager.validateScopeMatch (commit aead8b5b) — then DELETED outright
  //    2026-06-11: its only-ever caller was handleMicrosoftTokenExchange (dead,
  //    removed Wave 3b.0a 0f07ac90), and the check was a tautology (compared the
  //    requested scope to a response field assembled FROM that same value).
  //    scope_match_validated / scope_mismatch_detected audit events retired with it.
  //  - AuthManager.detectOAuthClient (commit 90fc81c6): same CLIENT_PROVIDER_MAP
  //    semantics. The 2 patterns dropped during JS→TS port (Gemini /oauth/callback
  //    fallback, ChatGPT localhost:8000) were restored in 3.8d. Test 17b in
  //    scripts/test-auth-manager.ts locks the parity invariants.

  // mintMcpToken consolidated to lib/auth/token-manager.ts (U2 Phase A, 2026-05-19).
  // Callsites import directly via the require at the top of this file.

  /**
   * Microsoft OAuth Authorization Handler
   * Phase 2: Handles authorization request and redirects to Microsoft
   * Part of: Microsoft MCP OAuth Integration (Plan v3.2)
   */
  handleMicrosoftAuthorize(req, res) {
    const {
      client_id,
      redirect_uri,
      state,
      scope,
      code_challenge,
      code_challenge_method,
      resource  // 🔧 SURGICAL FIX: Capture resource parameter
    } = req.query;

    // Validate redirect_uri against allowlist (sec-ops: open redirect prevention)
    if (!this.sessionStore.isAllowedRedirectUri(redirect_uri)) {
      authLogger.error({ redirect_uri }, 'Microsoft OAuth authorize: redirect_uri not in allowlist');
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'redirect_uri is not registered for this application'
      });
    }

    // 🔧 CRITICAL FIX: Use centralized client detection
    const { clientName, clientConfig } = this.authManager.detectOAuthClient(redirect_uri);
    const isGeminiCLI = clientName === 'gemini';
    const isChatGPT = clientName === 'chatgpt';
    const isClaude = clientName === 'claude-desktop' || clientName === 'claude-browser';

    // Generate correlation ID for Microsoft OAuth flow
    const correlationId = `oauth-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // OAuth Proxy Pattern: use SERVER's own callback URL (not client's).
    // Mirrors the GitHub proxy at line 2502-2503. Prevents passthrough of dynamic
    // per-connection client redirect URIs (e.g. chatgpt.com/connector/oauth/<id>)
    // that cannot be pre-registered in Azure AD.
    const serverCallbackUrl = process.env.OAUTH_CALLBACK_URL ||
      `https://${req.get('host')}/oauth/callback`;

    // Generate server-side state for Microsoft (separate from client's state).
    // Mirrors GitHub proxy at line 2506.
    const serverState = crypto.randomBytes(32).toString('hex');

    // Store EXPANDED client OAuth request data (boundary-contract: all fields preserved).
    // Mirrors GitHub proxy at line 2522-2542. The provider field allows /oauth/callback
    // to dispatch on provider lookup.
    const oauthRequestData = {
      correlationId,
      provider: 'microsoft',
      // Client's original values (for restoration in callback)
      clientState: state,                      // Client's opaque state
      clientRedirectUri: redirect_uri,         // Client's redirect URI (validated above)
      originalClientId: client_id,             // Client's client_id (for azp claim)
      requestedScope: scope,                   // Client's exact scope
      // 🔒 LOCKED INVARIANT (Plan v2 D11) — third leg (R7-Microsoft): front-door audience,
      // NOT audienceForService(). See oauth-flow-routes.ts file-header.
      requestedResource: resource || MCP_FRONTDOOR_AUDIENCE,  // ← D11 LOCKED
      // PKCE (validated server-side at /oauth/token; NOT forwarded to Microsoft)
      code_challenge,
      code_challenge_method,
      // Client identity (stored at authorize time so callback doesn't re-detect)
      clientName,
      // Metadata
      timestamp: Date.now()
    };

    // Store by serverState (not client's state)
    this.sessionStore.setOAuthRequest(serverState, oauthRequestData);

    // PKCE fallback: also store by code_challenge (emergency lookup path)
    if (code_challenge) {
      this.sessionStore.setOAuthRequest(`pkce:${code_challenge}`, oauthRequestData);
      authLogger.info({ correlationId }, 'Microsoft OAuth: also stored by code_challenge for PKCE fallback');
    }

    // Auto-cleanup after 15 minutes (Phase 2.10a: SessionStore-only)
    setTimeout(() => {
      this.sessionStore.deleteOAuthRequest(serverState);
      if (code_challenge) {
        this.sessionStore.deleteOAuthRequest(`pkce:${code_challenge}`);
      }
    }, 15 * 60 * 1000);

    // Log scope/resource capture (preserved verbatim from prior implementation)
    oauthLogger.log({
      correlationId,
      userId: 'anonymous',
      provider: 'microsoft',
      action: 'scope_resource_captured',
      success: true,
      requestId: `scope-${Date.now()}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: {
        requestedScope: scope,
        requestedResource: resource || `${MCP_FRONTDOOR_AUDIENCE} (default)`,
        scopeLength: scope ? scope.length : 0,
        resourcePresent: !!resource,
        codeChallenge: code_challenge ? 'present' : 'missing',
        proxyPattern: true,
        serverCallbackUrl
      }
    });

    authLogger.info({ serverState: serverState.substring(0, 20) + '...', scope, resource: resource || `${MCP_FRONTDOOR_AUDIENCE} (default)`, correlationId }, 'Microsoft OAuth: stored OAuth request keyed by serverState');

    authLogger.info({ scope: scope ? `${scope.substring(0, 30)}...` : 'none', resource: resource || 'default', correlationId }, 'Microsoft OAuth scope/resource captured');

    // Microsoft OAuth: single app for all clients (rationalized — no per-client Microsoft apps in production)
    const msClientId = process.env.MICROSOFT_CLIENT_ID;

    // Build Microsoft authorization URL — proxy pattern: send OUR callback, OUR state.
    const msAuthUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    msAuthUrl.searchParams.set('client_id', msClientId);
    msAuthUrl.searchParams.set('redirect_uri', serverCallbackUrl);  // proxy: server's callback (was client's — broken)
    msAuthUrl.searchParams.set('state', serverState);                // proxy: server-generated state (was client's — collision risk)

    // Pure code flow — pAIchart's /oauth/callback handles the exchange server-side.
    msAuthUrl.searchParams.set('response_type', 'code');

    // Microsoft-specific scopes (override — clients may send GitHub-style scopes which Microsoft doesn't understand)
    const msScope = CleanMCPHTTPServer.MICROSOFT_GRAPH_SCOPE_OFFLINE;
    msAuthUrl.searchParams.set('scope', msScope);

    // PKCE NOT forwarded to Microsoft. The proxy uses client_secret server-side;
    // PKCE remains enforced strictly between the MCP client and pAIchart at /oauth/token.
    // Mirror of GitHub proxy comment at line 2518-2519.

    authLogger.info({ clientId: msClientId, url: msAuthUrl.toString(), correlationId, proxyCallback: serverCallbackUrl }, 'Microsoft OAuth: proxy pattern — redirecting to Microsoft with server callback');

    // Redirect to Microsoft
    res.redirect(msAuthUrl.toString());
  }

  /**
   * Microsoft OAuth Code Exchange (proxy callback helper)
   *
   * Called from /oauth/callback when oauthRequest.provider === 'microsoft'.
   * Exchanges Microsoft's authorization code for an access token using the SERVER's
   * callback URL (not the client's), validates the user via Graph, stores Graph tokens
   * server-side for refresh, and returns { user, tokenData }.
   *
   * Returns null on any failure (after rendering an HTML error response to the browser).
   * Caller MUST check the return value and abort if null.
   *
   * Replaces the upstream-exchange portion of the legacy handleMicrosoftTokenExchange.
   * The legacy handler remains in place during the rollback window but is no longer
   * dispatched to (see /oauth/token route).
   */
  async exchangeMicrosoftCode({ code, serverCallbackUrl, correlationId, renderError }) {
    // Circuit breaker — fail fast if Microsoft service is degraded
    if (MCPOAuthTokenManager.isCircuitOpen('microsoft')) {
      authLogger.error({ correlationId }, 'Microsoft OAuth callback: circuit breaker OPEN — blocking request');
      renderError('Microsoft authentication is temporarily unavailable. Please try again in a few minutes.', 503);
      return null;
    }

    const msClientId = process.env.MICROSOFT_CLIENT_ID;
    const msClientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const msTokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const msScope = CleanMCPHTTPServer.MICROSOFT_GRAPH_SCOPE_OFFLINE;

    // Build token request — redirect_uri MUST match the one sent at /authorize (serverCallbackUrl)
    const params = new URLSearchParams({
      client_id: msClientId,
      client_secret: msClientSecret,
      code: code,
      redirect_uri: serverCallbackUrl,  // proxy: server callback (must match authorize)
      grant_type: 'authorization_code',
      scope: msScope
    });
    // PKCE NOT included — proxy uses client_secret server-side; PKCE stays client↔pAIchart only.

    const { fetchWithRetry } = require('./lib/auth/oauth/retry-utils');
    let response;
    try {
      response = await fetchWithRetry(
        msTokenUrl,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          retryableStatusCodes: [429, 503, 504]
        },
        {
          provider: 'microsoft',
          operation: 'token_exchange'
        }
      );
    } catch (err) {
      authLogger.error({ err, correlationId }, 'Microsoft OAuth callback: token endpoint unreachable');
      MCPOAuthTokenManager.recordFailure('microsoft');
      renderError('Microsoft authentication failed (network error). Please try again.', 502);
      return null;
    }

    const tokenData = await response.json();

    if (tokenData.error) {
      authLogger.error({ error: tokenData.error, description: tokenData.error_description, correlationId }, 'Microsoft OAuth callback: token exchange failed');
      MCPOAuthTokenManager.recordFailure('microsoft');
      oauthLogger.log({
        correlationId,
        userId: 'unknown',
        provider: 'microsoft',
        action: 'oauth_callback_microsoft_exchange_failed',
        success: false,
        errorMessage: tokenData.error_description || tokenData.error,
        requestId: `callback-${Date.now()}`
      });
      renderError('Microsoft authorization failed. Please try again.');
      return null;
    }

    // Scope normalization log (Microsoft never returns 'offline_access' in granted scopes — it's a meta-scope)
    const normalizeScope = (s) => s?.split(' ').filter(x => x !== 'offline_access').sort().join(' ');
    const normalizedRequested = normalizeScope(msScope);
    const normalizedGranted = normalizeScope(tokenData.scope);

    oauthLogger.log({
      correlationId,
      userId: 'unknown',
      provider: 'microsoft',
      action: 'provider_token_received',
      success: true,
      requestId: `callback-${Date.now()}`,
      metadata: {
        scopeRequested: msScope,
        scopeGranted: tokenData.scope,
        scopeMatch: normalizedRequested === normalizedGranted,
        scopeMatchRaw: msScope === tokenData.scope,
        offlineAccessRequested: msScope?.includes('offline_access'),
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        hasIdToken: !!tokenData.id_token,
        expiresIn: tokenData.expires_in,
        proxyPattern: true
      }
    });

    authLogger.info({ correlationId }, 'Microsoft OAuth callback: code exchanged successfully');

    // Ensure DB connection before user lookup (prevents cold-start failures)
    const dbReady = await ensureConnection();
    if (!dbReady) {
      authLogger.error({ correlationId }, 'Microsoft OAuth callback: database not ready for user verification');
      oauthLogger.log({
        correlationId,
        userId: 'unknown',
        provider: 'microsoft',
        action: 'database_connection_failed',
        success: false,
        errorMessage: 'Database temporarily unavailable',
        requestId: `callback-${Date.now()}`,
        metadata: { retryRecommended: true }
      });
      renderError('Database temporarily unavailable. Please try again in a moment.', 503);
      return null;
    }

    // Validate Microsoft access token + look up / create user via Graph
    const user = await this.oauthValidator.verifyMicrosoftToken(
      tokenData.access_token,
      correlationId
    );

    if (!user || !user.id) {
      authLogger.error({ correlationId, userPresent: !!user }, 'Microsoft OAuth callback: user validation failed');
      oauthLogger.log({
        correlationId,
        userId: 'unknown',
        provider: 'microsoft',
        action: 'user_validation_failed',
        success: false,
        errorMessage: 'Could not validate user from Microsoft token',
        requestId: `callback-${Date.now()}`,
        metadata: {
          userPresent: !!user,
          userIdPresent: !!(user?.id),
          microsoftTokenValid: true
        }
      });
      renderError('User validation failed. Please contact support.');
      return null;
    }

    // Store Microsoft tokens server-side (refresh-token-bearing flows only — Graph API access).
    // These tokens are NEVER returned to the MCP client; they live server-side for the
    // refresh middleware to keep Graph sessions alive.
    if (tokenData.refresh_token) {
      MCPOAuthTokenManager.storeToken(user.id, {
        userId: user.id,
        provider: 'microsoft',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        refreshExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        lastRefreshed: new Date(),
        refreshAttempts: 0
      });
    }

    MCPOAuthTokenManager.recordSuccess('microsoft');

    return { user, tokenData };
  }

  // Wave 3b Phase 3b.0a (2026-05-21) — dead code dropped (-542 LOC):
  //
  //   - handleMicrosoftTokenExchange (was 398 LOC): "no longer dispatched"
  //     per the comment at /oauth/token route (~line ~1973 post-delete).
  //     The unified pac_ branch handles Microsoft auth codes identically
  //     to GitHub via exchangeMicrosoftCode + the canonical callback flow.
  //     Comprehensive grep confirmed 0 callers in app/, lib/,
  //     mcp-server-http-clean.js (only self-ref + comment refs).
  //
  //   - refreshMicrosoftToken (was 144 LOC): 0 production callers. The
  //     MCPOAuthTokenManager handles refresh storage directly (in the
  //     /oauth/refresh + /oauth/token route handlers). This server-class
  //     method was a forward-looking helper for a proactive-refresh path
  //     that was never wired.

  // mcpOAuthRefreshMiddleware() removed in Phase 3.0a (2026-05-20).
  // Verified ZERO callers (never wired into the middleware chain). Was intended for
  // proactive Microsoft/Google token refresh but never registered with Express.
  // If proactive refresh is ever needed, see MicrosoftOAuthHandler (Wave 3b plan).

  // detectClientMode() EXTRACTED to MCPCoreManager.detectClientMode()
  // in Wave 7 Phase 7.2 (2026-05-21). Verbatim port — pure function, no
  // this-deps. 5 detection branches all return persistent today (D-H4 from
  // Phase 0 inventory); future stateless-client paths preserved defensively.

  // handleStatelessRequest() EXTRACTED to MCPCoreManager.handleStatelessRequest()
  // in Wave 7 Phase 7.2 (2026-05-21). Verbatim port + I-CROSS-10 fold
  // (try/finally cleanup for catch-path safety, fixes pre-Wave-7 session
  // leak on processRequest errors).

  /**
   * Build the RouteContext for the Wave 6 extracted route registrars.
   *
   * Constructs the 13-field DI contract documented in
   * `lib/mcp/server/routes/route-context.ts`. Critical design points:
   *
   *   - `getAuthMiddleware` / `getMcpServer` are LAZY ACCESSOR FUNCTIONS,
   *     not direct refs (Wave 4 Phase 4.4 lazy-init lesson — commit
   *     `ef04e744` / SEC-C4 throw-before-init). They MUST be invoked
   *     per-request, never at registration time.
   *   - Helper methods H1-H5 are bound to `this` via arrow funcs so route
   *     files don't need to know about the server instance.
   *
   * Called by `setupRoutes()` to pass into each `registerXxxRoutes(ctx)`.
   */
  _buildRouteContext() {
    return {
      app: this.app,
      logger: this.logger,
      sessionStore: this.sessionStore,
      authManager: this.authManager,
      oauthValidator: this.oauthValidator,
      // LAZY accessors — see Wave 4 Phase 4.4 SEC-C4 lesson
      getAuthMiddleware: () => this.createAuthMiddleware(),
      getMcpServer: () => this.mcpCore.mcpServer,
      // Helper methods (H1-H5) — bound for use inside route files
      generateAuthCode: () => this.generateAuthCode(),
      handleMicrosoftAuthorize: (req, res) => this.handleMicrosoftAuthorize(req, res),
      exchangeMicrosoftCode: (opts) => this.exchangeMicrosoftCode(opts),
      // Wave 7 Phase 7.2 (2026-05-21): delegated to MCPCoreManager
      detectClientMode: (req) => this.mcpCore.detectClientMode(req),
      handleStatelessRequest: (req, res) => this.mcpCore.handleStatelessRequest(req, res),
      // Domain D — stays on server class indefinitely
      // Wave 7 Phase 7.2 (2026-05-21): delegated to MCPCoreManager.processRequest
      processMCPRequest: (request, user) => this.mcpCore.processRequest(request, user),
    };
  }

  setupRoutes() {
    // ========================================
    // CLAUDE DESKTOP OAUTH FIX v2 (Dec 13, 2025)
    // Pre-emptive OAuth discovery for Claude Desktop
    // ========================================

    // B1 Link header middleware + R3 JWKS + R4 protected-resource + R5
    // authorization-server metadata ALL extracted to oauth-discovery-routes.ts
    // in Wave 6 Phase 6.3 (2026-05-21). Verbatim — no behavioral change.
    // B1 registers FIRST (matches original B1→B2 order) so the Link header
    // applies to B2's 401 response below.
    registerOAuthDiscoveryRoutes(this._buildRouteContext());

    // B2 RFC 6750 401 trigger + R7 authorize + R8 callback + R9 token + R10 register
    // ALL extracted to lib/mcp/server/routes/oauth-flow-routes.ts in Wave 6
    // Phase 6.4 (2026-05-21). Largest extraction in Wave 6 (~870 LOC of route
    // bodies). Order is LOAD-BEARING (Plan v2 D4 / Hazard H-2): B2 registers
    // FIRST inside registerOAuthFlowRoutes so the 401 trigger fires before
    // R11 (POST /mcp main handler) which is still inline below at registerHealthRoutes
    // boundary. See oauth-flow-routes.ts file-header for D11 LOCKED audience
    // invariant + D13 R10 sibling-classifier SYNC warning.
    registerOAuthFlowRoutes(this._buildRouteContext());

    // R1 health route (extracted Wave 6 Phase 6.2). Order vs OAuth flow
    // doesn't matter functionally (/health is GET-only, no path collision).
    registerHealthRoutes(this._buildRouteContext());

    // R11 (POST /mcp main handler) + R12 (GET /mcp SSE) extracted to
    // lib/mcp/server/routes/mcp-transport-routes.ts in Wave 6 Phase 6.5
    // (2026-05-21). FINAL Wave 6 route extraction. Order: AFTER B2 (which
    // fires in registerOAuthFlowRoutes) so unauth'd initialize → 401 trigger
    // works before R11 main handler runs. R12 uses inner-closure auth
    // pattern (ChatGPT manifest discovery serves WITHOUT auth, others go
    // through authMiddleware — see oauth-flow-routes.ts SYNC docstring).
    //
    // /mcp/v2 ChatGPT cache-bypass endpoint REMOVED Phase 0.6 (Task #146).
    registerMCPTransportRoutes(this._buildRouteContext());

    // DELETE /mcp session-termination endpoint DROPPED 2026-05-21
    // (Wave 6 Phase 0.6). Zero hits in 14-day nginx access logs — no MCP
    // client implements DELETE-on-disconnect. SessionStore TTL handles
    // cleanup automatically (see lib/auth/oauth/session-store.ts —
    // sessionTimestamps map + cleanupStaleSessions). The MCP spec defines
    // DELETE for explicit termination but it's purely optional; if a
    // client ever implements it they'll see a 404 and the SessionStore
    // will reap the stale session on its next sweep.
  }

  // processMCPRequest() EXTRACTED to lib/mcp/server/mcp-core.ts:MCPCoreManager.processRequest()
  // in Wave 7 Phase 7.2 (2026-05-21). Verbatim port — 611 LOC → ~480 LOC TS
  // (parseResourceUri sub-helper + VALID_MCP_METHODS import). Hot path 3182
  // hits/14d. Server class delegates via _buildRouteContext.processMCPRequest.

  async start() {
    try {
      await this.setupAuth();
      // AuthManager Phase 3.3 (2026-05-20): initialize() sets up verifier deps.
      // (The JWT_ACCESS_SECRET fail-fast it once ran was retired 2026-06-05 — RS256-only auth.)
      await this.authManager.initialize();
      // Wave 7 Phase 7.1 (2026-05-21): setupMCPServer → MCPCoreManager.init()
      await this.mcpCore.init();

      // Bug Class 73 Phase 2 sibling fix (2026-04-10): initialize the embedded
      // MCP server and populate mcpToolRegistry in THIS process. Without this,
      // in-process agent executions that now run inside paichart-mcp (Tier 1
      // direct Prisma path activated in Phase 2) call
      // mcpServerManager.getToolDefinitions(...) against an empty registry,
      // the LLM is invoked with no tools, and Sonnet hallucinates the pipeline
      // as Cline-style XML text. Mirrors what lib/server-init.ts does for
      // paichart-web.
      //
      // See: lib/services/agentExecutionEngine.ts around line 602 (hard-fail guard)
      // See: cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/implementation-plan.md
      //
      // ⚠️ CROSS-PROCESS INVARIANT (2026-06-21): this process bootstraps ONLY the
      // tool registry via initializeMCPServices(). It deliberately does NOT call
      // initializeServer() — so the following run ONLY in paichart-web and this
      // process RELIES ON paichart-web for them:
      //   • agent-execution background poller + zombie cleanup
      //     (agentExecutionEngine.start() — processPendingExecutions every 10s).
      //     Foreground MCP executions run inline via executeById and are fine; the
      //     web poller is the BACKSTOP for PENDING execs that don't run inline
      //     (reactor-queued / dependency-gated / failed-to-start). It catches
      //     them via a cross-process `status IN (PENDING,RUNNING)` query, and the
      //     active_per_task unique index prevents double-execution. ⇒ if paichart-web
      //     is down or this process ever runs standalone, those execs STALL.
      //   • token refresh, notification health, task-subscription cleanup, compliance
      //     monitor (global schedulers — web-only by design to avoid double-scheduling).
      // Event systems (phase-stage, execution-events, prompt-registry) self-heal /
      // self-connect on use, so they DON'T need pre-warm here.
      // ⇒ If you add a service to initializeServer(), DECIDE whether paichart-mcp
      // needs it too — silent divergence here caused the 2026-06-20 phase-stage
      // dropped-events bug. See lib/server-init.ts (matching note).
      try {
        const { initializeMCPServices } = require('./lib/server-init');
        await initializeMCPServices();
        bootLog.info('Embedded MCP server + tool registry initialized in paichart-mcp');
      } catch (mcpInitError) {
        // Fail loud — agent executions running in this process will be broken
        // without the tool registry. Better to crash PM2 now than to accept
        // silent hallucinated SUCCESS downstream.
        bootLog.fatal({ err: mcpInitError }, 'Failed to initialize embedded MCP services — agent executions will hallucinate');
        throw mcpInitError;
      }

      // Per-session transports created dynamically in route handlers

      // Initialize authentication context from API key if present
      // Wave 7 Phase 7.1 (2026-05-21): initializeAuthContext → MCPCoreManager.initializeAuthContext()
      await this.mcpCore.initializeAuthContext();
      
      // SHOULD: Bind only to localhost for security
      const bindAddress = process.env.MCP_HTTP_BIND_ALL === 'true' ? '0.0.0.0' : '127.0.0.1';
      
      this.server = this.app.listen(this.port, bindAddress, () => {
        bootLog.info({
          bindAddress,
          port: this.port,
          transport: 'MCP SDK',
          security: bindAddress === '127.0.0.1' ? 'localhost-only' : 'all-interfaces',
          auth: `method-level (${MCP_PUBLIC_METHODS.length} public)`,
          corsOrigin: this.corsOrigin,
        }, 'MCP SDK Server started — ready for Claude Desktop and browser connections');

        // Start OAuth token cleanup scheduler (prevents memory leaks from expired tokens)
        MCPOAuthTokenManager.startCleanupScheduler();
      });

      // Setup graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      this.logger.error('Failed to start server', { error: error.message });
      process.exit(1);
    }
  }

  // initializeAuthContext() EXTRACTED to lib/mcp/server/mcp-core.ts:MCPCoreManager
  // .initializeAuthContext() in Wave 7 Phase 7.1 (2026-05-21). Verbatim move
  // — no behavioral change. Server-class start() now calls
  // this.mcpCore.initializeAuthContext() instead.

  async shutdown() {
    try {
      this.logger.info('🔄 Received shutdown signal, shutting down...');

      // AuthManager Phase 3.3 (2026-05-20): idempotent destroy — safe even if
      // noCleanup:true skipped the rate-limit interval. Clears the empty Map too.
      if (this.authManager) {
        this.authManager.destroy();
      }
      // Phase 2.10f (2026-05-19): SessionStore owns the only session-related
      // setInterval. destroy() clears it + flushes its Maps. Idempotent.
      if (this.sessionStore) {
        this.sessionStore.destroy();
      }
      MCPOAuthTokenManager.stopCleanupScheduler();

      if (this.sdkTransport) {
        await this.sdkTransport.close();
      }

      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        this.logger.info('✅ MCP SDK server shutdown complete');
      }

      process.exit(0);
    } catch (error) {
      this.logger.error('Shutdown error:', error);
      process.exit(1);
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new CleanMCPHTTPServer();
  server.start();
}

module.exports = { CleanMCPHTTPServer };
