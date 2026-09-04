/**
 * OAuth flow routes (B2 + R7 + R8 + R9 + R10).
 *
 * Extracted from `mcp-server-http-clean.js:setupRoutes()` in Wave 6
 * Phase 6.4. Verbatim move — no behavioral changes from the pre-extraction
 * shape. Largest extraction in Wave 6 (~700 LOC of route bodies).
 *
 * Five registrations (ordered per Plan v2 D4 + Hazard H-2 sensitivity):
 *
 *   B2 — `app.post('/mcp', unauthInitializeMw)`:
 *     RFC 6750 401 trigger for Claude Desktop OAuth discovery. Returns
 *     401 + `WWW-Authenticate: Bearer resource_metadata=...` when an
 *     unauthenticated initialize request arrives. **Order is LOAD-BEARING**
 *     (Hazard H-2): MUST register BEFORE R11 (main /mcp POST handler)
 *     in mcp-transport-routes.ts. If R11 registers first, R11's auth
 *     middleware short-circuits unauth'd POST and B2 never fires —
 *     Claude Desktop OAuth discovery silently breaks (no 401, no
 *     WWW-Authenticate header). This specific regression happened
 *     historically; current order defends it.
 *
 *   R7 — `app.get('/oauth/authorize')`:
 *     OAuth authorization endpoint. Routes to GitHub or Microsoft
 *     provider via `selectProvider()` helper (C8 fold). Stores OAuth
 *     request state in SessionStore by serverState + PKCE code_challenge.
 *
 *   R8 — `app.get('/oauth/callback')`:
 *     Server-side OAuth callback. Rate-limited via
 *     `authManager.checkCallbackRateLimit` (Phase 3.9 SEC-C4). Exchanges
 *     provider code for user, mints pAIchart auth code, redirects to
 *     client's original redirect_uri.
 *
 *   R9 — `app.post('/oauth/token')`:
 *     OAuth token endpoint. Handles both `authorization_code` and
 *     `refresh_token` grants. **U2 Phase E.8 client_id mismatch
 *     enforcement** (oauth-multi-prov C1 + oauth-multi-client C-2 fold)
 *     blocks cross-client refresh attempts.
 *
 *   R10 — `app.post(['/oauth/register', '/register'])`:
 *     OAuth 2.0 Dynamic Client Registration (RFC 7591). Returns pre-
 *     configured client details based on classifier. See SYNC WARNING below.
 *
 * ════════════════════════════════════════════════════════════════════════
 * 🔗 SIBLING-IMPLEMENTATION SYNC WARNING (Plan v2 D13)
 * ════════════════════════════════════════════════════════════════════════
 *
 * R10 below contains an INLINE client classifier that is a SIBLING of
 * `AuthManager.detectOAuthClient` (in `lib/auth/oauth/auth-manager.ts`,
 * search for `CLIENT_PROVIDER_MAP`). The two classifiers differ:
 *
 *   - R10 inline operates on `redirect_uris[]` array + `client_name`
 *     and has Claude-Desktop-vs-Browser routing logic.
 *   - `AuthManager.detectOAuthClient` operates on a single `redirect_uri`
 *     string and is used by R7/R9 + Wave 4's auth middleware.
 *
 * Phase 3.8b deferred the consolidation to protect Claude Desktop's
 * primary OAuth registration flow. Until consolidation lands:
 *
 *   **IF YOU ADD/REMOVE A PATTERN HERE, AUDIT
 *   `lib/auth/oauth/auth-manager.ts:CLIENT_PROVIDER_MAP` TOO.**
 *
 * Plan v2 D13 also adds a fixture-based equivalence test (in
 * `scripts/test-routes-oauth-flow.ts`) asserting both classifiers agree
 * on a baseline set of URIs. The test will fire on Wave 6 deployment;
 * future divergence between the two classifiers fails CI.
 * ════════════════════════════════════════════════════════════════════════
 *
 * ════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED INVARIANT (Plan v2 D11)
 * ════════════════════════════════════════════════════════════════════════
 *
 * OAuth callback flow (R7 → R8 → R9) audience selection is ALWAYS:
 *
 *   audience = requestedResource || MCP_FRONTDOOR_AUDIENCE
 *
 * where MCP_FRONTDOOR_AUDIENCE (`lib/auth/public-base-url.ts`) is
 * `${PUBLIC_BASE_URL}/mcp` — the canonical URI of this MCP front door, the
 * same string R4 advertises as RFC 9728 `resource` and the inbound verifier
 * accepts (LEGACY_AUDIENCES). In production PUBLIC_BASE_URL derives from
 * APP_BASE_URL=https://paichart.app, so the value is the prod front door.
 * The Microsoft authorize path in mcp-server-http-clean.js carries the same
 * lock (third leg, R7-Microsoft).
 *
 * The per-service audience helper `audienceForService()` in
 * `lib/mcp/server/tools/hub/audience-policy` is OUTBOUND-MINT-ONLY and is NOT
 * involved in OAuth callback minting. This file MUST NOT import from
 * audience-policy — MCP_FRONTDOOR_AUDIENCE is imported from the auth layer.
 *
 * **DO NOT** "tidy" R7's `requestedResource: resource || MCP_FRONTDOOR_AUDIENCE`
 * or R9's `requestedAudience = storedAudience || MCP_FRONTDOOR_AUDIENCE`
 * into calls to `audienceForService()`. Those code paths are
 * distinct concerns:
 *
 *   - OAuth callback mints first-party tokens for AI clients → front-door audience
 *   - Per-call mints from MCP tool handlers → per-service audience
 *
 * Mixing them broke RFC 8707 audience semantics in pre-U2 implementations.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Dependencies (RouteContext fields used):
 *   - `ctx.app`                       — route registration target
 *   - `ctx.sessionStore`              — OAuth request + auth code storage
 *   - `ctx.authManager`               — detectOAuthClient, checkCallbackRateLimit, generateRefreshToken
 *   - `ctx.oauthValidator`            — verifyOAuthToken (GitHub code exchange)
 *   - `ctx.handleMicrosoftAuthorize`  — H2 helper (Microsoft authorize delegation)
 *   - `ctx.exchangeMicrosoftCode`     — H3 helper (Microsoft code exchange in R8)
 *   - `ctx.generateAuthCode`          — H1 helper (pAIchart auth code generation)
 *
 * @see lib/mcp/server/routes/route-context.ts (DI contract)
 * @see cline_docs/reviews/express-routes-extraction-2026-05-21/express-routes-extraction-plan-v2.md Phase 6.4
 */

import type { Request, Response, RequestHandler } from 'express';
import type { RouteContext } from './route-context';
import * as crypto from 'crypto';
import { TOKEN_TTL_SECONDS, CHATGPT_SCOPE, CLAUDE_SCOPE } from '../../../auth/auth-constants';
// D11: front-door audience comes from the AUTH layer — this file MUST NOT import audience-policy.
import { PUBLIC_BASE_URL, MCP_FRONTDOOR_AUDIENCE } from '../../../auth/public-base-url';

// CommonJS imports for JS modules
import mcpLogger from '../mcp-logger';
const { authLogger } = mcpLogger as { authLogger: { error: (...a: unknown[]) => void; info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; debug: (...a: unknown[]) => void; fatal: (...a: unknown[]) => void } };

import { oauthLogger } from '../../../auth/oauth/oauth-logger';
import { prisma as globalPrisma } from '../../../prisma';
import { MCPOAuthTokenManager } from '../../../auth/oauth/mcp-oauth-token-manager';
import { mintMcpToken } from '../../../auth/token-manager';
import type { UserRole } from '../../../types/auth';
import { config } from '../../../config';
import { hashRefreshToken } from '../../../crypto/hashing';

/**
 * Normalize req.headers['x-forwarded-for'] which Express types as
 * `string | string[] | undefined`. Returns first IP in chain, or undefined.
 */
function xff(req: Request): string | undefined {
  const h = req.headers['x-forwarded-for'];
  if (typeof h === 'string') return h;
  if (Array.isArray(h)) return h[0];
  return undefined;
}

/**
 * Real client IP behind Cloudflare + nginx. CF-Connecting-IP is the true client
 * address; fall back to x-forwarded-for, then req.ip (nginx loopback). Without
 * this, oauth-audit.log records 127.0.0.1 (the nginx→app hop) for every event.
 *
 * DELIBERATELY SEPARATE from getClientIP() in lib/utils/client-ip.ts (the rate-limit
 * gating resolver): this is Express-typed, returns `undefined` for callers to fall back
 * (|| 'unknown' / req.socket.remoteAddress), and serves AUDIT LOGGING — not security
 * gating, so it needn't be spoof-proof. Not merged on purpose. Shared rule: CF-Connecting-IP
 * primary — if that changes (e.g. CF deprecates the header), update BOTH.
 */
function clientIp(req: Request): string | undefined {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  if (Array.isArray(cf) && cf[0]) return cf[0];
  return req.ip || xff(req);
}

// ─────────────────────────────────────────────────────────────────────
// C8 FOLD — selectProvider helper (file-private)
//
// Plan v2 D12: per-provider routing extracted to a file-private helper
// (NOT moved to AuthManager — these branches are route-local). Used by
// both R7 (authorize) and R9 (token) since both need provider selection.
//
// Smart selection order: explicit ?provider= > client default > 'github'.
// ─────────────────────────────────────────────────────────────────────
interface ProviderSelection {
  selectedProvider: 'github' | 'microsoft';
  detectedClientName: string;
  detectedClientConfig: { defaultProvider?: string } | null;
}

function selectProvider(
  ctx: RouteContext,
  redirectUri: string | undefined,
  explicitProvider: string | undefined
): ProviderSelection {
  const authManager = ctx.authManager as { detectOAuthClient: (uri: string | undefined) => { clientName: string; clientConfig: { defaultProvider?: string } | null } };
  const { clientName, clientConfig } = authManager.detectOAuthClient(redirectUri);

  const selectedProvider = (explicitProvider ||
                            (clientConfig?.defaultProvider) ||
                            'github').toLowerCase() as 'github' | 'microsoft';

  return {
    selectedProvider,
    detectedClientName: clientName,
    detectedClientConfig: clientConfig,
  };
}

// Type for SessionStore methods this file calls
type SessionStoreShape = {
  setOAuthRequest: (key: string, data: unknown) => void;
  getOAuthRequest: (key: string) => Record<string, unknown> | null;
  deleteOAuthRequest: (key: string) => void;
  setAuthCode: (code: string, data: unknown) => void;
  exchangeAuthCode: (code: string) => Record<string, unknown> | null;
  deleteAuthCode: (code: string) => void;
  isAllowedRedirectUri: (uri: string) => boolean;
};

// Type for AuthManager methods this file calls
type AuthManagerShape = {
  detectOAuthClient: (uri: string | undefined) => { clientName: string; clientConfig: { defaultProvider?: string } | null };
  checkCallbackRateLimit: (ip: string) => { allowed: boolean; retryAfterSeconds: number };
  checkRegisterRateLimit: (ip: string) => { allowed: boolean; retryAfterSeconds: number };
  generateRefreshToken: () => string;
};

// Type for OAuthValidator
type OAuthValidatorShape = {
  verifyOAuthToken: (token: string) => Promise<{ id: string; email?: string; role?: string } | null>;
};

/**
 * Register all 5 OAuth flow routes in declaration order.
 *
 * Per Plan v2 D4 / Hazard H-2: B2 MUST register first so that the 401
 * trigger fires BEFORE R11 (main /mcp POST handler in mcp-transport-routes.ts).
 *
 * R7/R8/R9/R10 are OAuth-flow endpoints and their order doesn't matter
 * functionally, but is preserved exactly per Plan v2 verbatim invariant.
 */
export function registerOAuthFlowRoutes(ctx: RouteContext): void {
  registerB2UnauthInitializeMiddleware(ctx);  // B2 — Hazard H-2 defense
  registerR7Authorize(ctx);                    // R7
  registerR8Callback(ctx);                     // R8
  registerR9Token(ctx);                        // R9
  registerR10Register(ctx);                    // R10
}

// ─────────────────────────────────────────────────────────────────────
// B2 — POST /mcp unauth'd-initialize → 401 + WWW-Authenticate trigger
//
// CRITICAL (Hazard H-2): Claude Desktop only triggers OAuth on POST
// failures, not GET. By returning 401 on unauth'd `initialize`, we force
// OAuth discovery via RFC 6750 WWW-Authenticate + RFC 9728 Link headers.
//
// MUST register BEFORE R11 (mcp-transport-routes.ts main POST handler)
// or it never fires.
// ─────────────────────────────────────────────────────────────────────
function registerB2UnauthInitializeMiddleware(ctx: RouteContext): void {
  ctx.app.post('/mcp', (req: Request, res: Response, next: () => void) => {
    const hasAuth = req.headers.authorization || req.headers['x-api-key'];
    const isInitialize = (req.body as { method?: string } | undefined)?.method === 'initialize';

    // If no auth AND this is initialize request, return 401 to trigger OAuth
    if (!hasAuth && isInitialize) {
      authLogger.info('No auth on initialize — returning 401 to trigger OAuth discovery');

      const resourceMetadataUrl = `${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`;

      // RFC 6750 WWW-Authenticate header
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);

      // RFC 9728 Link header (backup)
      res.setHeader('Link', `<${resourceMetadataUrl}>; rel="oauth-protected-resource"`);

      // Expose headers for CORS
      res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Link');
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Authentication required',
          data: {
            hint: 'OAuth authentication required. Use the resource_metadata URL to discover authorization server.',
            oauth_discovery: resourceMetadataUrl,
            authorization_server: `${PUBLIC_BASE_URL}/.well-known/oauth-authorization-server`,
          },
        },
        id: (req.body as { id?: unknown } | undefined)?.id || null,
      });
      return;
    }

    // Has auth or not initialize - proceed normally
    next();
  });
}

// ─────────────────────────────────────────────────────────────────────
// R7 — GET /oauth/authorize (Multi-Provider Proxy)
//
// Phase 1: Provider selection mechanism via ?provider= query param OR
// client detection from redirect_uri. Microsoft delegates to ctx.
// handleMicrosoftAuthorize. GitHub builds the authorize URL inline.
// ─────────────────────────────────────────────────────────────────────
function registerR7Authorize(ctx: RouteContext): void {
  const sessionStore = ctx.sessionStore as SessionStoreShape;

  ctx.app.get('/oauth/authorize', (req: Request, res: Response): void => {
    const {
      client_id,
      redirect_uri,
      state,
      scope,
      code_challenge,
      code_challenge_method,
      response_type,
      provider,
      resource,
    } = req.query as Record<string, string | undefined>;

    // C8 FOLD: provider selection via helper
    const { selectedProvider, detectedClientName, detectedClientConfig } =
      selectProvider(ctx, redirect_uri, provider);

    // VALIDATION LOGGING: Client detection and provider selection
    authLogger.info({ detectedClient: detectedClientName, detectedProvider: detectedClientConfig?.defaultProvider || 'none', explicitProvider: provider || 'none', selectedProvider, redirect_uri }, 'OAuth authorize client detection');

    // Mismatch detection — Warn about potential provider/client mismatches.
    // detectOAuthClient returns 'claude-desktop' / 'claude-browser' (never bare 'claude'),
    // so the union check below is required.
    if (detectedClientName === 'chatgpt' && selectedProvider === 'github') {
      authLogger.warn({ client: 'chatgpt', provider: 'github' }, 'OAuth authorize: potential provider/client mismatch');
    }
    if ((detectedClientName === 'claude-desktop' || detectedClientName === 'claude-browser') && selectedProvider === 'microsoft') {
      authLogger.warn({ client: detectedClientName, provider: 'microsoft' }, 'OAuth authorize: potential provider/client mismatch');
    }
    if (detectedClientName === 'gemini' && selectedProvider === 'microsoft') {
      authLogger.warn({ client: 'gemini', provider: 'microsoft' }, 'OAuth authorize: potential provider/client mismatch');
    }

    authLogger.info({ provider: selectedProvider, client_id, redirect_uri, state: state ? `${state.substring(0, 20)}...` : 'missing', code_challenge: code_challenge ? 'present' : 'missing', code_challenge_method: code_challenge_method || 'none', response_type: response_type || 'code' }, 'OAuth authorize request');
    authLogger.info({ scope, resource, scope_length: scope ? scope.length : 0, resource_present: !!resource }, 'OAuth authorize exact parameters');

    // Generate correlation ID for OAuth flow tracking
    const correlationId = `oauth-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Log OAuth authorize initiation
    oauthLogger.log({
      correlationId,
      userId: 'anonymous',
      provider: selectedProvider,
      action: 'oauth_authorize_initiated',
      success: true,
      requestId: `auth-${Date.now()}`,
      clientId: client_id,
      redirectUri: redirect_uri,
      ipAddress: clientIp(req) || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    // Validate provider
    if (!['github', 'microsoft'].includes(selectedProvider)) {
      authLogger.error({ provider: selectedProvider }, 'OAuth authorize: unsupported provider');
      res.status(400).json({
        error: 'invalid_request',
        error_description: `Unsupported provider: ${selectedProvider}. Supported: github, microsoft`,
      });
      return;
    }

    // Route to appropriate provider handler
    if (selectedProvider === 'microsoft') {
      const result = ctx.handleMicrosoftAuthorize(req, res);
      // Handle both Promise<void> and void returns
      if (result instanceof Promise) {
        result.catch((err) => authLogger.error({ err }, 'handleMicrosoftAuthorize rejected'));
      }
      return;
    }

    // All MCP clients use the single org GitHub App (rationalized Phase 2)
    const githubClientId = process.env.MCP_CLI_GITHUB_CLIENT_ID || '';
    const githubClientSecretEnv = 'MCP_CLI_GITHUB_CLIENT_SECRET';

    oauthLogger.log({
      correlationId,
      userId: 'anonymous',
      provider: selectedProvider,
      action: 'client_detected',
      success: true,
      requestId: `client-${Date.now()}`,
      clientId: detectedClientName,
      redirectUri: redirect_uri,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'],
      metadata: { selectedGitHubApp: githubClientId, clientType: detectedClientName },
    });

    authLogger.info({ client: detectedClientName, selectedGitHubApp: githubClientId, provider: selectedProvider }, 'OAuth authorize client detected');

    // Validate redirect_uri against allowlist (sec-ops: open redirect prevention)
    if (!redirect_uri || !sessionStore.isAllowedRedirectUri(redirect_uri)) {
      authLogger.error({ redirect_uri }, 'OAuth authorize: redirect_uri not in allowlist');
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'redirect_uri is not registered for this application',
      });
      return;
    }

    // P8 FIX: Require PKCE (code_challenge) per OAuth 2.1
    if (!code_challenge) {
      authLogger.error({ redirect_uri, client_id }, 'OAuth authorize: code_challenge required (PKCE mandatory)');
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'code_challenge is required. PKCE is mandatory per OAuth 2.1.',
      });
      return;
    }

    // OAuth Proxy Pattern: use SERVER's own callback URL (not client's)
    const serverCallbackUrl = process.env.OAUTH_CALLBACK_URL ||
      `https://${req.get('host')}/oauth/callback`;

    // Generate server-side state for GitHub (separate from client's state)
    const serverState = crypto.randomBytes(32).toString('hex');

    // Build GitHub authorization URL
    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
    githubAuthUrl.searchParams.set('client_id', githubClientId);
    githubAuthUrl.searchParams.set('redirect_uri', serverCallbackUrl);
    githubAuthUrl.searchParams.set('state', serverState);

    if (scope) {
      githubAuthUrl.searchParams.set('scope', scope);
    }

    // PKCE NOT forwarded to GitHub — validated between client and pAIchart only

    // 🔒 LOCKED INVARIANT (Plan v2 D11): OAuth callback flow audience =
    // requestedResource || front door (NOT audienceForService — that's
    // outbound-mint-only). See file-header docstring for full rationale.
    const oauthRequestData = {
      correlationId,
      provider: selectedProvider,
      // Client's original values (for restoration in callback)
      clientState: state,
      clientRedirectUri: redirect_uri,
      originalClientId: client_id,
      requestedScope: scope,
      requestedResource: resource || MCP_FRONTDOOR_AUDIENCE,  // ← D11 LOCKED
      // PKCE (for server-side validation at token exchange)
      code_challenge,
      code_challenge_method,
      // GitHub credentials (avoid re-detecting in callback)
      githubClientId,
      githubClientSecretEnv,
      // Client identity (stored at authorize time for token exchange)
      clientName: detectedClientName,
      // Metadata
      response_type,
      timestamp: Date.now(),
    };

    // Store by serverState (not client's state)
    sessionStore.setOAuthRequest(serverState, oauthRequestData);

    // PKCE fallback: Also store by code_challenge (oauth-multi-prov I2:
    // dual-write to serverState + pkce:<challenge> is fragile but preserved
    // verbatim — both routes need to find the data on callback).
    sessionStore.setOAuthRequest(`pkce:${code_challenge}`, oauthRequestData);
    authLogger.info('GitHub OAuth: also stored by code_challenge for PKCE fallback');

    // Log scope/resource capture
    oauthLogger.log({
      correlationId,
      userId: 'anonymous',
      provider: 'github',
      action: 'scope_resource_captured',
      success: true,
      requestId: `scope-${Date.now()}`,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'],
      metadata: {
        requestedScope: scope || 'none',
        scopeLength: scope ? scope.length : 0,
        codeChallenge: code_challenge ? 'present' : 'missing',
        codeChallengeMethod: code_challenge_method || 'none',
        clientDetected: detectedClientName,
        selectedGitHubApp: githubClientId,
        proxyPattern: true,
        serverCallbackUrl,
      },
    });

    // Task #159 (2026-05-21): REMOVED redundant per-request setTimeout.
    // SessionStore.cleanupStaleSessions runs every 5 min and TTL-evicts
    // OAuth requests older than oauthRequestTtlMs (15 min default). The
    // per-request setTimeout duplicated the TTL clock and added no value
    // beyond what SessionStore already provides — both lose state on PM2
    // restart identically (in-memory Maps). The real backstop is the
    // 15-min TTL enforced server-side at /oauth/token (search
    // `oauthRequestTtlMs` in lib/auth/oauth/session-store.ts).

    authLogger.info({ serverState: serverState.substring(0, 20) + '...', correlationId, provider: selectedProvider, proxyCallback: serverCallbackUrl }, 'GitHub OAuth: proxy pattern — redirecting to GitHub with server callback');
    authLogger.info({ clientId: githubClientId, url: githubAuthUrl.toString() }, 'GitHub OAuth authorize redirect');

    // Redirect to GitHub
    res.redirect(githubAuthUrl.toString());
  });
}

// ─────────────────────────────────────────────────────────────────────
// R8 — GET /oauth/callback (Proxy Pattern)
//
// GitHub redirects here after user authorizes. We exchange the GitHub
// code for a token, validate the user, generate a pAIchart auth code,
// and redirect to the client's original redirect_uri.
//
// Rate-limited via authManager.checkCallbackRateLimit (Phase 3.9 SEC-C4)
// with RFC 6585 §4 Retry-After header.
// ─────────────────────────────────────────────────────────────────────
function registerR8Callback(ctx: RouteContext): void {
  const sessionStore = ctx.sessionStore as SessionStoreShape;
  const authManager = ctx.authManager as AuthManagerShape;
  const oauthValidator = ctx.oauthValidator as OAuthValidatorShape;

  ctx.app.get('/oauth/callback', async (req: Request, res: Response): Promise<void> => {
    // Rate limit: 30 requests per minute per IP
    const ip = clientIp(req) || 'unknown';
    const rl = authManager.checkCallbackRateLimit(ip);
    if (!rl.allowed) {
      authLogger.warn({ ip, retryAfterSeconds: rl.retryAfterSeconds }, 'OAuth callback: rate limit exceeded');
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      res.status(429).send('Too many requests. Please try again later.');
      return;
    }

    const { code, state: serverState } = req.query as Record<string, string | undefined>;

    // Helper: render HTML error (this route is hit by the browser, not an API client)
    const renderError = (message: string, status = 400): void => {
      res.status(status).send(`<!DOCTYPE html><html><head><title>Authentication Error</title>
        <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#1a1a2e;color:#e0e0e0}
        .card{background:#16213e;padding:2rem;border-radius:8px;max-width:400px;text-align:center}
        h1{color:#e94560}a{color:#0f3460}</style></head>
        <body><div class="card"><h1>Authentication Failed</h1><p>${message}</p>
        <p><a href="${PUBLIC_BASE_URL}">Return to pAIchart</a></p></div></body></html>`);
    };

    try {
      if (!code || !serverState) {
        authLogger.error({ hasCode: !!code, hasState: !!serverState }, 'OAuth callback: missing code or state');
        return renderError('Missing authorization code or state. Please try again.');
      }

      // Look up original client request by serverState
      const oauthRequest = sessionStore.getOAuthRequest(serverState);
      if (!oauthRequest) {
        authLogger.error({ serverState: serverState.substring(0, 20) }, 'OAuth callback: state not found (expired or invalid)');
        return renderError('Authorization session expired. Please try again.');
      }

      // Delete serverState immediately (one-time use)
      sessionStore.deleteOAuthRequest(serverState);
      // Also clean up PKCE fallback entry
      if (oauthRequest.code_challenge) {
        sessionStore.deleteOAuthRequest(`pkce:${oauthRequest.code_challenge}`);
      }

      const {
        correlationId, clientState, clientRedirectUri, originalClientId,
        requestedScope, requestedResource, code_challenge, code_challenge_method,
        githubClientId, githubClientSecretEnv, clientName,
        provider = 'github',  // default for any in-flight requests written before Microsoft proxy fix
      } = oauthRequest as Record<string, string | undefined> & { provider?: string };

      const serverCallbackUrl = process.env.OAUTH_CALLBACK_URL ||
        `https://${req.get('host')}/oauth/callback`;

      let user: { id: string; email?: string; role?: string } | undefined;

      if (provider === 'microsoft') {
        const result = await ctx.exchangeMicrosoftCode({
          code, serverCallbackUrl, correlationId: correlationId || '', renderError,
        }) as { user?: typeof user } | undefined;
        if (!result) return;  // helper rendered error response
        user = result.user;
      } else {
        // GitHub branch — exchange GitHub code for GitHub token using stored credentials
        authLogger.info({ correlationId, githubClientId }, 'OAuth callback: exchanging GitHub code for token');

        const githubClientSecret = process.env[githubClientSecretEnv || ''] || '';

        const githubTokenUrl = 'https://github.com/login/oauth/access_token';
        const params = new URLSearchParams({
          client_id: githubClientId || '',
          client_secret: githubClientSecret,
          code,
          redirect_uri: serverCallbackUrl,
        });

        const response = await fetch(githubTokenUrl, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          signal: AbortSignal.timeout(15_000),
        });

        const responseText = await response.text();
        const tokenData = JSON.parse(responseText) as { access_token?: string; error?: string; error_description?: string };

        if (tokenData.error) {
          authLogger.error({ error: tokenData.error, description: tokenData.error_description, correlationId }, 'OAuth callback: GitHub token exchange failed');
          oauthLogger.log({
            correlationId, userId: 'unknown', provider: 'github',
            action: 'oauth_callback_github_exchange_failed', success: false,
            errorMessage: tokenData.error_description || tokenData.error,
            requestId: `callback-${Date.now()}`,
          });
          return renderError('GitHub authorization failed. Please try again.');
        }

        authLogger.info({ correlationId }, 'OAuth callback: GitHub code exchanged successfully');

        user = (await oauthValidator.verifyOAuthToken(tokenData.access_token || '')) || undefined;
        if (!user) {
          authLogger.error({ correlationId }, 'OAuth callback: GitHub token validation failed');
          return renderError('User validation failed. Please try again.');
        }
      }

      // SHARED tail (both providers): validate user fields, mint pAIchart auth code, redirect to client.

      // Validate user.email and user.role exist (boundary-contract: field leakage prevention)
      if (!user || !user.email || !user.role) {
        authLogger.error({ userId: user?.id, hasEmail: !!user?.email, hasRole: !!user?.role, correlationId, provider },
          'OAuth callback: user missing required fields for JWT');
        return renderError('User account is missing required information. Please contact support.');
      }

      authLogger.info({ userId: user.id, email: user.email, correlationId, provider }, 'OAuth callback: user validated');

      // Defence-in-depth: re-validate clientRedirectUri against allowlist
      if (!clientRedirectUri || !sessionStore.isAllowedRedirectUri(clientRedirectUri)) {
        authLogger.error({ clientRedirectUri, correlationId, provider }, 'OAuth callback: clientRedirectUri failed allowlist re-check');
        return renderError('Authorization failed validation. Please try again.');
      }

      // Generate pAIchart auth code
      const authCode = ctx.generateAuthCode();

      // Store auth code with all data needed for token exchange
      sessionStore.setAuthCode(authCode, {
        userId: user.id,
        email: user.email,
        role: user.role,
        scope: requestedScope,
        audience: requestedResource,  // ← D11 LOCKED — front-door audience preserved
        originalClientId,
        clientRedirectUri,
        clientName,
        code_challenge,
        code_challenge_method,
        correlationId,
        provider,  // Task #158 (2026-05-21): plumb provider into AuthCodeData so R9 audit-log honors it (was hardcoded 'github')
        timestamp: Date.now(),
      });

      // Task #159 (2026-05-21): REMOVED redundant per-request setTimeout.
      // SessionStore.cleanupStaleSessions TTL-evicts auth codes per
      // authCodeTtlMs (5 min default). exchangeAuthCode is also one-time-use
      // (atomic delete on successful exchange — see registerR9Token below),
      // so successful flows clear immediately. Stale codes from interrupted
      // flows clear via TTL sweep within 5 min, identical to the prior
      // setTimeout behavior. Both lose state on PM2 restart identically.

      // Log successful callback
      oauthLogger.log({
        correlationId, userId: user.id, provider,
        action: 'oauth_callback_auth_code_generated', success: true,
        requestId: `callback-${Date.now()}`,
        metadata: { scope: requestedScope, audience: requestedResource },
      });

      // Redirect to client's original redirect_uri using URL constructor
      const redirectUrl = new URL(clientRedirectUri);
      redirectUrl.searchParams.set('code', authCode);
      if (clientState) {
        redirectUrl.searchParams.set('state', clientState);
      }

      authLogger.info({ correlationId, redirectTo: redirectUrl.hostname }, 'OAuth callback: redirecting to client with pAIchart auth code');

      res.redirect(redirectUrl.toString());
    } catch (error) {
      authLogger.error({ err: error }, 'OAuth callback: unexpected error');
      renderError('An unexpected error occurred. Please try again.');
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// R9 — POST /oauth/token (Multi-Provider Proxy)
//
// Handles BOTH `authorization_code` and `refresh_token` grant types.
//
// **U2 Phase E.8 client_id mismatch enforcement** (oauth-multi-prov C1 +
// oauth-multi-client C-2 fold per Plan v2 C2): refresh tokens issued to
// Client A cannot be used by Client B. This is the load-bearing
// cross-client refresh attack defense.
//
// Task #158 (audit log provider:'github' hardcode) RESOLVED 2026-05-21
// (commit prior to Wave 6 close). The success-path audit log at L931 now
// reads provider from `acd.provider` plumbed through R8 → setAuthCode →
// AuthCodeData → here. Defaults to 'github' only for in-flight auth codes
// issued before the proxy fix landed (backward-compat tail). Remaining
// 'github' literals at L289/L573 are intentional — they live inside
// github-specific branches (provider-mismatch warn, github-exchange-failed
// log) where the value is correct, not hardcoded.
// ─────────────────────────────────────────────────────────────────────
function registerR9Token(ctx: RouteContext): void {
  const sessionStore = ctx.sessionStore as SessionStoreShape;
  const authManager = ctx.authManager as AuthManagerShape;

  ctx.app.post('/oauth/token', async (req: Request, res: Response): Promise<void> => {
    try {
      // Log the raw request for debugging
      // BC42 FIX: Log presence flags only — never dump OAuth secrets
      authLogger.debug({ grant_type: req.body?.grant_type, has_code: !!req.body?.code, has_secret: !!req.body?.client_secret, has_verifier: !!req.body?.code_verifier, has_refresh: !!req.body?.refresh_token, contentType: req.headers['content-type'] }, 'OAuth token request');

      const {
        grant_type,
        code,
        redirect_uri,
        client_id,
        code_verifier,
        provider,
        refresh_token,
      } = (req.body || {}) as Record<string, string | undefined>;

      if (!req.body) {
        authLogger.error('OAuth token: missing request body');
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing request body',
        });
        return;
      }

      // Handle refresh_token grant type FIRST
      if (grant_type === 'refresh_token') {
        if (!refresh_token) {
          res.status(400).json({
            error: 'invalid_request',
            error_description: 'refresh_token is required for refresh_token grant',
          });
          return;
        }

        // Get refresh token data (validated-and-narrowed; null if not-mcp / not-found / expired / partial)
        const refreshData = await MCPOAuthTokenManager.getRefreshToken(refresh_token);

        if (!refreshData) {
          authLogger.info('OAuth token: refresh token invalid or expired');
          res.status(401).json({
            error: 'invalid_grant',
            error_description: 'Refresh token is invalid or expired',
          });
          return;
        }

        // U2 Phase E.8: client_id mismatch enforcement — refresh tokens
        // issued to Client A cannot be used by Client B (Plan v2 C2 fold)
        if (client_id && refreshData.clientId !== client_id) {
          authLogger.warn(
            { expectedClientId: refreshData.clientId, requestedClientId: client_id, userId: refreshData.userId },
            'OAuth token: refresh client_id mismatch — cross-client refresh attempt blocked'
          );
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Refresh token client_id mismatch',
          });
          return;
        }

        authLogger.info({ userId: refreshData.userId }, 'OAuth token: refresh grant — minting new tokens');

        // RBAC FIX: Lookup user to get email and role for JWT claims
        const user = (await globalPrisma.user.findUnique({
          where: { id: refreshData.userId },
        })) as { email: string; role: UserRole; status: string } | null;

        if (!user) {
          res.status(401).json({
            error: 'invalid_grant',
            error_description: 'User not found',
          });
          return;
        }

        // W12a/IM-2: fail closed on a non-ACTIVE account. The refresh credential now
        // survives 7 days (was wiped every pm2 reload), so a suspend/disable must be
        // enforced here — not left to wait for the next deploy. Mirrors login:285.
        if (user.status !== 'ACTIVE') {
          authLogger.warn({ userId: refreshData.userId, status: user.status }, 'OAuth token: refresh blocked — account not ACTIVE');
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Account is not active',
          });
          return;
        }

        // Mint new access token
        const newAccessToken = await mintMcpToken({
          userId: refreshData.userId,
          email: user.email,
          role: user.role,
          scope: refreshData.scope,
          audience: refreshData.audience,
          azp: refreshData.clientId,
          ttlSeconds: TOKEN_TTL_SECONDS,
          purpose: 'refresh',
        });

        // Generate NEW refresh token (rotation)
        const newRefreshToken = authManager.generateRefreshToken();

        // CR-1: atomic one-time-use rotation. The DELETE of the old token is the claim —
        // a concurrent double-refresh has exactly one winner; the loser's delete finds
        // nothing (count 0), the transaction aborts, no second successor is created, and
        // the access token minted above is NEVER returned. (Do not use the swallowing
        // MCPOAuthTokenManager.removeRefreshToken helper here — that would double-mint.)
        const rotateTtlDays = parseInt(config.jwt.refreshExpiration, 10) || 7;
        try {
          await globalPrisma.$transaction(async (tx) => {
            const del = await tx.refreshToken.deleteMany({
              where: { token: hashRefreshToken(refresh_token), provider: 'mcp' },
            });
            if (del.count === 0) {
              throw new Error('refresh_token_already_rotated');
            }
            await tx.refreshToken.create({
              data: {
                token: hashRefreshToken(newRefreshToken),
                userId: refreshData.userId,
                scope: refreshData.scope,
                audience: refreshData.audience,
                clientId: refreshData.clientId,
                provider: 'mcp',
                expiresAt: new Date(Date.now() + rotateTtlDays * 24 * 60 * 60 * 1000),
              },
            });
          });
        } catch {
          authLogger.warn({ userId: refreshData.userId }, 'OAuth token: refresh lost the one-time-use race — rejecting');
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Refresh token is invalid or expired',
          });
          return;
        }

        authLogger.info('OAuth token: refresh successful — new tokens issued');

        res.json({
          access_token: newAccessToken,
          token_type: 'Bearer',
          expires_in: TOKEN_TTL_SECONDS,
          refresh_token: newRefreshToken,
          scope: refreshData.scope,
        });
        return;
      }

      // Handle authorization_code grant type
      if (!code) {
        authLogger.error('OAuth token: missing code for authorization_code grant');
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'code is required for authorization_code grant',
        });
        return;
      }

      // C8 FOLD: provider selection via helper (matches R7 pattern)
      const { selectedProvider } = selectProvider(ctx, redirect_uri, provider);

      authLogger.info({ provider: selectedProvider, grant_type, client_id, redirect_uri, has_code: !!code, has_verifier: !!code_verifier }, 'OAuth token exchange request');

      // Validate provider
      if (!['github', 'microsoft'].includes(selectedProvider)) {
        authLogger.error({ provider: selectedProvider }, 'OAuth token: unsupported provider');
        res.status(400).json({
          error: 'invalid_request',
          error_description: `Unsupported provider: ${selectedProvider}. Supported: github, microsoft`,
        });
        return;
      }

      // Both providers (github + microsoft) flow through the unified pac_ branch.
      // Microsoft auth codes are now pac_ codes generated in /oauth/callback by the
      // exchangeMicrosoftCode helper. Legacy handleMicrosoftTokenExchange method
      // DELETED in Wave 3b.0a (2026-05-12) after zero-caller verification.

      // Synchronous delete-before-use (sec-ops: replay prevention)
      const authCodeData = sessionStore.exchangeAuthCode(code);

      if (!authCodeData) {
        authLogger.error({ codePrefix: code?.substring(0, 8) }, 'OAuth token: auth code expired or already used');
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code is expired, invalid, or already used',
        });
        return;
      }

      const acd = authCodeData as {
        userId: string;
        email: string;
        role: UserRole;
        scope?: string;
        audience?: string;
        originalClientId?: string;
        clientRedirectUri: string;
        code_challenge?: string;
        code_challenge_method?: string;
        correlationId?: string;
        provider?: string;  // Task #158 — read provider from AuthCodeData so audit log honors actual flow
        timestamp?: number;
      };
      const {
        userId, email, role, scope: storedScope, audience: storedAudience,
        originalClientId, clientRedirectUri, code_challenge, code_challenge_method,
        correlationId: storedCorrelationId,
      } = acd;

      // Validate redirect_uri match (RFC 6749 Section 4.1.3)
      if (redirect_uri && redirect_uri !== clientRedirectUri) {
        authLogger.error({ expected: clientRedirectUri, received: redirect_uri, correlationId: storedCorrelationId },
          'OAuth token: redirect_uri mismatch');
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'redirect_uri does not match the value used in authorization',
        });
        return;
      }

      // Validate client_id match (defense-in-depth, sec-ops finding #3)
      if (client_id && originalClientId && client_id !== originalClientId) {
        authLogger.error({ expected: originalClientId, received: client_id, correlationId: storedCorrelationId },
          'OAuth token: client_id mismatch');
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'client_id does not match the authorized client',
        });
        return;
      }

      // Validate PKCE code_verifier (3/4 specialists agree: MUST implement)
      if (code_challenge) {
        if (!code_verifier) {
          authLogger.error({ correlationId: storedCorrelationId }, 'OAuth token: code_verifier required but missing');
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'code_verifier is required when code_challenge was provided',
          });
          return;
        }
        const computed = crypto.createHash('sha256').update(code_verifier).digest('base64url');
        if (computed !== code_challenge) {
          authLogger.error({ correlationId: storedCorrelationId }, 'OAuth token: PKCE verification failed');
          res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier does not match code_challenge',
          });
          return;
        }
        authLogger.info({ correlationId: storedCorrelationId }, 'OAuth token: PKCE verification passed');
      }

      // 🔒 LOCKED INVARIANT (Plan v2 D11): front-door audience
      const requestedScope = storedScope || CLAUDE_SCOPE;
      const requestedAudience = storedAudience || MCP_FRONTDOOR_AUDIENCE;  // ← D11 LOCKED

      // Mint first-party RS256 JWT
      const mcpToken = await mintMcpToken({
        userId,
        email,
        role,
        scope: requestedScope,
        audience: requestedAudience,
        azp: originalClientId || client_id || 'mcp-client',
        purpose: 'oauth-callback',
      });

      // Generate refresh token (7-day lifetime)
      const refreshToken = authManager.generateRefreshToken();

      // Store refresh token (DB-persisted, hashed, provider:'mcp')
      await MCPOAuthTokenManager.storeRefreshToken(refreshToken, {
        userId,
        scope: requestedScope,
        audience: requestedAudience,
        clientId: originalClientId || client_id || 'mcp-client',
      });

      // Log successful proxy token exchange.
      // Task #158 (2026-05-21): now honors actual provider via acd.provider
      // (plumbed through R8 → setAuthCode → AuthCodeData → here). Defaults to
      // 'github' for backward-compat with any in-flight auth codes that didn't
      // carry the provider field (e.g. issued seconds before this deploy).
      oauthLogger.log({
        correlationId: storedCorrelationId,
        userId,
        provider: acd.provider || 'github',
        action: 'mcp_oauth_token_exchange',
        success: true,
        requestId: `oauth-${Date.now()}`,
        durationMs: Date.now() - (acd.timestamp || Date.now()),
        ipAddress: clientIp(req),
        userAgent: req.headers['user-agent'],
        metadata: { proxyPattern: true, scope: requestedScope, audience: requestedAudience },
      });

      authLogger.info({ userId, email, correlationId: storedCorrelationId }, 'OAuth proxy: minted first-party RS256 token + refresh token');

      // Return first-party token
      res.json({
        access_token: mcpToken,
        token_type: 'Bearer',
        scope: requestedScope,
        expires_in: TOKEN_TTL_SECONDS,
        refresh_token: refreshToken,
        resource: requestedAudience,
      });
    } catch (error) {
      // Task #156: sanitize error_description
      authLogger.error({ err: error }, 'OAuth token exchange failed');
      res.status(500).json({
        error: 'token_exchange_failed',
        error_description: 'Token exchange failed; see server logs for details',
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// R10 — POST /oauth/register (Dynamic Client Registration, RFC 7591)
//
// Returns pre-configured client details for CLI tools / dynamic clients.
// Two branches: ChatGPT (Microsoft client_id + OIDC scope) vs everyone
// else (org GitHub App, public client, proxy pattern).
//
// ⚠️ SEE FILE-HEADER SYNC WARNING for the sibling-classifier maintenance
// contract (Plan v2 D13). Inline classifier here differs from
// AuthManager.detectOAuthClient and Phase 3.8b deferred their consolidation.
// ─────────────────────────────────────────────────────────────────────
function registerR10Register(ctx: RouteContext): void {
  const sessionStore = ctx.sessionStore as SessionStoreShape;
  const authManager = ctx.authManager as AuthManagerShape;

  ctx.app.post(['/oauth/register', '/register'], (req: Request, res: Response): void => {
    // Registration endpoint needs CORS * for Claude Desktop
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Rate limit (30/min/IP) — app-level backstop now that Cloudflare Bot Fight
    // Mode is off on /oauth/* (RFC 6585 §4 Retry-After). Per-IP; ChatGPT DCR
    // arrives from rotating Azure IPs so legit connector setup is unaffected.
    const ip = clientIp(req) || 'unknown';
    const rl = authManager.checkRegisterRateLimit(ip);
    if (!rl.allowed) {
      authLogger.warn({ ip, retryAfterSeconds: rl.retryAfterSeconds }, 'OAuth registration: rate limit exceeded');
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      res.status(429).json({
        error: 'rate_limited',
        error_description: 'Too many registration requests. Please try again later.',
      });
      return;
    }

    // Validate redirect_uris against allowlist (sec-ops: registration open redirect prevention)
    const body = req.body as { redirect_uris?: string[]; client_name?: string; grant_types?: string[] } | undefined;
    const requestedUris = body?.redirect_uris || [];
    const invalidUris = requestedUris.filter((uri: string) => !sessionStore.isAllowedRedirectUri(uri));
    if (invalidUris.length > 0) {
      authLogger.warn({ invalidUris }, 'OAuth registration: rejected disallowed redirect_uris');
      res.status(400).json({
        error: 'invalid_redirect_uri',
        error_description: `redirect_uri not allowed: ${invalidUris[0]}. Use localhost or a registered domain.`,
      });
      return;
    }

    // 🔗 SIBLING IMPLEMENTATION (Plan v2 D13 / Phase 3.8b deferral):
    // This inline classifier is a sibling of AuthManager.detectOAuthClient.
    // It operates on redirect_uris[] + client_name + has Claude-Desktop-
    // vs-Browser routing logic the single-URI version doesn't need. Keep
    // client-type patterns IN SYNC between the two — if you add/remove a
    // pattern here, audit detectOAuthClient too (see file-header).
    const isGeminiCLI = body?.redirect_uris &&
                        body.redirect_uris.some((uri) => uri.includes('localhost') && uri.includes('/oauth/callback'));
    const isChatGPT = body?.redirect_uris &&
                      body.redirect_uris.some((uri) =>
                        uri.includes('chatgpt.com') ||
                        uri.includes('openai.com') ||
                        uri.includes('localhost:8000') ||
                        Boolean(body.client_name && body.client_name.toLowerCase().includes('chatgpt'))
                      );
    const isClaudeDesktop = body?.redirect_uris &&
                            body.redirect_uris.some((uri) =>
                              (uri.includes('localhost') && uri.includes('/callback') && !uri.includes('/oauth/callback')) ||
                              uri.includes('claude.ai/api/mcp/auth_callback')
                            );
    const isClaudeBrowser = (body?.redirect_uris &&
                            body.redirect_uris.some((uri) => uri.includes('claude.ai') && !uri.includes('auth_callback'))) ||
                            Boolean(body?.client_name && body.client_name.toLowerCase().includes('claude'));
    const isClaude = isClaudeDesktop || isClaudeBrowser;

    // Log client registration
    const clientType = isGeminiCLI ? 'gemini' :
                       isChatGPT ? 'chatgpt' :
                       isClaudeDesktop ? 'claude-desktop' :
                       isClaudeBrowser ? 'claude-browser' :
                       isClaude ? 'claude' : 'unknown';

    oauthLogger.log({
      userId: 'anonymous',
      provider: 'registration',
      action: 'oauth_client_registration',
      success: true,
      requestId: `reg-${Date.now()}`,
      clientId: body?.client_name || clientType,
      redirectUri: body?.redirect_uris?.[0],
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'],
      metadata: {
        clientType,
        redirectUris: body?.redirect_uris,
        grantTypes: body?.grant_types,
      },
    });

    authLogger.info({ clientName: body?.client_name, clientType, redirectUris: body?.redirect_uris }, 'OAuth client registration request');

    // Rationalized registration: 2 branches (3-specialist reviewed)
    // Branch 1: ChatGPT (Microsoft client_id + OIDC scope)
    // Branch 2: Everyone else (org GitHub App, public client, proxy pattern)
    const mcpCliClientId = process.env.MCP_CLI_GITHUB_CLIENT_ID || '';

    if (isChatGPT) {
      // ChatGPT: Microsoft OAuth provider with OIDC scope
      const chatgptClientId = process.env.CHATGPT_MICROSOFT_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || '';
      authLogger.info({ clientId: chatgptClientId }, 'OAuth registration: ChatGPT — Microsoft client');
      res.status(201).json({
        client_id: chatgptClientId,
        client_name: body?.client_name || 'ChatGPT MCP Client',
        // 2026-05-24: echo the client's submitted redirect_uris instead of
        // hard-coding the legacy `connector_platform_oauth_redirect`. The new
        // ChatGPT Apps SDK uses per-connector redirect URIs of the form
        // `https://chatgpt.com/connector/oauth/{callback_id}`. Hard-coding the
        // legacy URI caused OAuth flows from the new connector to fail because
        // ChatGPT's internal state expected the new URI but we registered the
        // old one. isAllowedRedirectUri() at line 990 above already validates
        // the submitted URIs — safe to echo. Mirrors the non-ChatGPT branch
        // below (line 1080) which already does this correctly.
        redirect_uris: body?.redirect_uris || ['https://chatgpt.com/connector_platform_oauth_redirect'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: CHATGPT_SCOPE,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        authorization_endpoint: `${PUBLIC_BASE_URL}/oauth/authorize`,
        token_endpoint: `${PUBLIC_BASE_URL}/oauth/token`,
        supported_providers: ['github', 'microsoft'],
        provider_selection: 'Use provider parameter in token/authorize requests',
      });
    } else {
      // Everyone else: org GitHub App, public client, proxy pattern
      authLogger.info({ clientName: body?.client_name, clientType, clientId: mcpCliClientId }, 'OAuth registration: public client (proxy pattern)');
      res.status(201).json({
        client_id: mcpCliClientId,
        client_name: body?.client_name || 'MCP Client',
        redirect_uris: body?.redirect_uris || ['http://127.0.0.1/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: CLAUDE_SCOPE,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        authorization_endpoint: `${PUBLIC_BASE_URL}/oauth/authorize`,
        token_endpoint: `${PUBLIC_BASE_URL}/oauth/token`,
        supported_providers: ['github', 'microsoft'],
        provider_selection: 'Use ?provider=microsoft for Microsoft OAuth',
      });
    }
  });
}
