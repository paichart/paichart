/**
 * AuthManager — extracted authentication code from `mcp-server-http-clean.js`.
 *
 * Wave 3a (2026-05-20). Owns:
 *   - Token verification (RS256 MCP tokens + API keys; HS256 verify retired 2026-05-28)
 *   - Auth middleware factory (replaces inline `createAuthMiddleware` on server class)
 *   - `populateReqUser()` (consolidates 3 auth paths)
 *   - Pure utilities: `generateRefreshToken`, `detectOAuthClient`
 *     (`validateScopeMatch` DELETED 2026-06-11 — its only-ever caller was the
 *     dead Microsoft token-exchange handler removed in Wave 3b.0a `0f07ac90`;
 *     the check was a tautology — it compared the client-requested scope to a
 *     response field assembled FROM that same value, never a provider's
 *     returned scopes. `scope_match_validated`/`scope_mismatch_detected`
 *     audit events are no longer emitted.)
 *   - Rate limiting for OAuth callback endpoint
 *
 * Wave 3b (DEFERRED): `MicrosoftOAuthHandler` (handleMicrosoftAuthorize,
 * handleMicrosoftTokenExchange (dead/rollback-only), refreshMicrosoftToken).
 *
 * Phase 3.0a (2026-05-20) verified that `verifyGitHubToken` and
 * `findOrCreateUserFromGitHub` had zero callers — deleted instead of extracted.
 * Live GitHub flow goes through `MCPOAuthValidator.verifyGitHubToken` at
 * `lib/auth/oauth/mcp-oauth-validator.js`, which AuthManager does NOT touch.
 *
 * INVARIANTS (v3 plan):
 *   - `verifyMcpToken` delegates to `token-manager.verifyAccessToken` — no
 *     duplicate verification logic (sec-ops SEC-I3)
 *   - Multi-key JWKS verification via `lib/auth/jwt-key-store` (SEC-C2 fix)
 *   - `populateReqUser` extras include azp, name, tenantId, provider (post-v2 fold)
 *   - Provider tokens (`ghp_`, `gho_`, `ms-`) rejected with explicit audit event
 *   - `Retry-After` header math: `Math.max(1, ceil(...))` (SEC-C5 + boundary safety)
 *   - `createMiddleware()` throws if called before `initialize()` (SEC-C4 race fix)
 *
 * @module lib/auth/oauth/auth-manager
 */

import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';
import type { SessionStore } from './session-store';
import { randomBytes } from 'crypto';
import { decodeProtectedHeader, decodeJwt, jwtVerify } from 'jose';
import { PUBLIC_BASE_URL } from '../public-base-url';
import { verifyAccessToken } from '../token-manager';
import { UserRole } from '../../types/auth';
// Wave 4 Phase 4.2: imported for createMiddleware orchestration. Per v2 D5:
// the classifier is a pure function with no `this.*` coupling, extracted
// in Wave 1; importing directly is the cleanest path.
import { isProtectedMethod } from '../mcp-method-classifier';

// ============================================================================
// Interfaces — every field grep-verified against actual call sites
// ============================================================================

/**
 * The shape mutated onto `req.user` across all 3 auth paths.
 *
 * Field invariants (boundary-contract r1/r2 + auth-permissions r1):
 *   - `id` + `userId` BOTH required — downstream uses `user.id || user.userId`
 *   - `name` flows to task-comment notifications (silent bug if dropped)
 *   - `tenantId` is LIVE multi-tenant code (NOT placeholder)
 *   - `provider` set by oauthValidator paths (token-refresh-middleware reads it)
 *   - `scope`, `jti`, `permissions` are write-only forensic fields (no readers)
 *   - `authMethod` union widened to all live values
 */
export interface ReqUser {
  id: string;
  userId: string;
  email: string;
  role: UserRole;
  name?: string;
  token?: string;
  azp?: string;
  tenantId?: string;
  authMethod?:
    | 'mcp_token'
    | 'jwt'
    | 'api-key'
    | 'microsoft_oauth'
    | 'github_oauth'
    | 'google_oauth'
    | 'oauth'
    | 'unknown';
  provider?: string;
  scope?: string;
  jti?: string;
  permissions?: {
    canAccessMCP?: boolean;
    canViewPOVs?: boolean;
    canEditTasks?: boolean;
  };
}

/**
 * Narrow shape projected by `token-manager.verifyAccessToken`.
 * Only `{userId, email, role}` — `azp`, `name`, etc. require `decodeJwtPayload`.
 */
export interface VerifiedTokenClaims {
  userId: string;
  email: string;
  role: UserRole;
}

/**
 * Wider raw JWT payload — used by `decodeJwtPayload` to recover claims
 * `verifyAccessToken` doesn't project (azp, name, scope, jti, etc.).
 */
export interface RawJwtPayload extends VerifiedTokenClaims {
  azp?: string;
  name?: string;
  scope?: string;
  jti?: string;
  permissions?: ReqUser['permissions'];
  iat?: number;
  exp?: number;
  /** RFC 8707 — single aud OR audience array. */
  aud?: string | string[];
  iss?: string;
  sub?: string;
}

/** Lifecycle dependency: pino-shaped oauth audit logger. */
export interface OAuthAuditLoggerLike {
  log(event: {
    correlationId?: string;
    userId?: string;
    provider?: string;
    action: string;
    success: boolean;
    errorMessage?: string;
    executionTimeMs?: number;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): void;
  warn?(event: Record<string, unknown>): void;
}

/**
 * Minimal Prisma surface AuthManager needs. Avoids importing PrismaClient
 * directly to keep this module lightweight + test-mockable. The real shape
 * is satisfied by `import { prisma } from '@/lib/db/prisma-client'`.
 */
export interface PrismaUserReader {
  user: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{ id: string; email: string; role: string; name: string | null } | null>;
  };
}

export interface AuthManagerOptions {
  logger: Logger;
  sessionStore: SessionStore;
  oauthAuditLogger: OAuthAuditLoggerLike;
  /**
   * Prisma client for RS256 user lookup. Required by Phase 4.0+ (Wave 4).
   * Per v2 plan D1 — injected at construction time (not at call time);
   * matches sessionStore/oauthAuditLogger pattern.
   */
  prismaClient: PrismaUserReader;
  /** Default 30 req/min/IP. */
  callbackRateLimitPerMinute?: number;
  /** Skip rate-limit/init side effects — for tests + Phase 2.2-style transitions. */
  noCleanup?: boolean;
}

/** Result of the auth chain extraction. */
export type AuthResult =
  | { kind: 'authenticated'; user: ReqUser }
  | { kind: 'public-method'; reason: 'no-token-but-method-allowed' }
  | { kind: 'unauthorized'; statusCode: 401; errorCode: -32001; hint: string }
  | { kind: 'session-identity-mismatch'; statusCode: 403; errorCode: -32001; hint: string };

/** Rate-limit decision — discriminated union avoids "what is retryAfterSeconds when allowed?" trap. */
export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Result of client classification. */
export interface ClientConfig {
  name: string;
  defaultProvider: 'github' | 'microsoft';
  scope?: string;
}

// ============================================================================
// CLIENT_PROVIDER_MAP — redirect_uri → client classification
// ============================================================================

interface ClientMatch {
  name: string;
  detect: (redirectUri: string) => boolean;
  defaultProvider: 'github' | 'microsoft';
}

// IMPORTANT — order matters. Gemini's fallback pattern (localhost + /oauth/callback)
// would match ChatGPT's localhost:8000 pattern, so Gemini MUST check first. Then
// ChatGPT's localhost:8000 — local dev — is more specific than the Claude-Desktop
// generic localhost+/callback match, so ChatGPT goes next. Claude-desktop is last
// because its pattern (localhost + /callback + NOT /oauth/callback) is the most
// permissive — anything else with /callback on localhost ends up classified as
// Claude Desktop.
const CLIENT_PROVIDER_MAP: ClientMatch[] = [
  {
    // CHECK FIRST — Gemini CLI: explicit port 7777 OR localhost+/oauth/callback fallback
    // for the case where Gemini uses a dynamic port. The /oauth/callback path
    // distinguishes from Claude Desktop (which uses bare /callback).
    name: 'gemini',
    detect: (uri) =>
      /localhost:7777/i.test(uri) ||
      (/localhost/i.test(uri) && /\/oauth\/callback/i.test(uri)),
    defaultProvider: 'github',
  },
  {
    // CHECK SECOND — ChatGPT: production domains + localhost:8000 for local dev
    name: 'chatgpt',
    detect: (uri) =>
      /chatgpt\.com|openai\.com/i.test(uri) || /localhost:8000/i.test(uri),
    defaultProvider: 'microsoft',
  },
  {
    // Claude.ai browser flows
    name: 'claude-browser',
    detect: (uri) => /claude\.ai/i.test(uri),
    defaultProvider: 'github',
  },
  {
    // CHECK LAST — Claude Desktop: localhost + /callback + NOT /oauth/callback
    // (the Gemini fallback above already consumed /oauth/callback). Scheme +
    // optional port + literal /callback. Order matters: this pattern would
    // false-positive on Gemini's fallback if we hadn't checked Gemini first.
    name: 'claude-desktop',
    detect: (uri) =>
      /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/callback($|[?#])/i.test(uri),
    defaultProvider: 'github',
  },
];

// ============================================================================
// AuthMiddlewareReject — thrown by createMiddleware on auth failure
// ============================================================================

/**
 * Thrown by `AuthManager.createMiddleware` when a protected method is
 * called without valid auth credentials. The server-class wrapper catches
 * and serializes (merging `req.body?.id ?? null` into the JSON-RPC envelope
 * at serialize time, per Wave 4 v2 boundary-C3 fold).
 *
 * **Why a builder, not a finished envelope**: AuthManager doesn't have
 * access to `req.body?.id` at throw time (the orchestrator that decides
 * "reject" doesn't reach into the body). The id-mirror is a JSON-RPC
 * protocol contract that lives at the HTTP boundary — the server wrapper
 * is the right place to merge it.
 *
 * Headers shape covers all 3 mandatory fields per sec-ops I1:
 *   - WWW-Authenticate (RFC 6750 §3 Bearer challenge)
 *   - Link (RFC 9728 backup discovery)
 *   - Access-Control-Expose-Headers (CORS preflight for the above two)
 */
export class AuthMiddlewareReject extends Error {
  constructor(
    public readonly statusCode: 401 | 403,
    public readonly headers: {
      'WWW-Authenticate': string;
      Link: string;
      'Access-Control-Expose-Headers': string;
    },
    public readonly jsonRpcErrorWithoutId: {
      jsonrpc: '2.0';
      error: {
        code: number;
        message: string;
        data: Record<string, unknown>;
      };
    }
  ) {
    super('Auth middleware rejected request');
    this.name = 'AuthMiddlewareReject';
  }
}

// ============================================================================
// AuthManager class
// ============================================================================

const PROVIDER_TOKEN_PREFIXES = ['ghp_', 'gho_', 'ms-'];

export class AuthManager {
  private readonly logger: Logger;
  private readonly sessionStore: SessionStore;
  private readonly oauthAuditLogger: OAuthAuditLoggerLike;
  private readonly prismaClient: PrismaUserReader;
  private readonly callbackRateLimitPerMinute: number;
  // DCR (/oauth/register) per-IP limit. Inline default (no constructor option)
  // to keep the change surface minimal — see checkRegisterRateLimit JSDoc.
  private readonly registerRateLimitPerMinute: number = 30;
  private readonly noCleanup: boolean;

  // Rate-limit state — keyed by `oauth_callback:${ip}` / `oauth_register:${ip}`.
  // Replaces ad-hoc Map at mcp-server-http-clean.js:2666. Shared cleanup evicts
  // expired entries of both buckets (cleanupRateLimitState iterates all keys).
  private readonly callbackRateLimit = new Map<string, { count: number; start: number }>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  private initialized = false;
  private destroyed = false;

  constructor(options: AuthManagerOptions) {
    if (!options?.logger) {
      throw new Error('AuthManager requires a logger');
    }
    if (!options.sessionStore) {
      throw new Error('AuthManager requires a sessionStore');
    }
    if (!options.oauthAuditLogger) {
      throw new Error('AuthManager requires an oauthAuditLogger');
    }
    if (!options.prismaClient) {
      throw new Error('AuthManager requires a prismaClient (Phase 4.0)');
    }
    this.logger = options.logger;
    this.sessionStore = options.sessionStore;
    this.oauthAuditLogger = options.oauthAuditLogger;
    this.prismaClient = options.prismaClient;
    this.callbackRateLimitPerMinute = options.callbackRateLimitPerMinute ?? 30;
    this.noCleanup = options.noCleanup ?? false;
  }

  /**
   * Initialize verifier dependencies. MUST be called before `createMiddleware()`
   * (SEC-C4 race fix). Idempotent.
   *
   * (The Phase 3.5b SEC-C1 `JWT_ACCESS_SECRET` fail-fast was removed 2026-06-05 —
   * the symmetric secret has no consumer; verification is RS256-only via token-manager.)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.destroyed) {
      throw new Error('AuthManager.initialize() called on destroyed instance');
    }

    if (!this.noCleanup) {
      // Rate-limit cleanup runs every minute, evicting entries older than
      // one window (60s). Prevents the unbounded-growth time bomb caught
      // by validation-engine round 2.
      this.cleanupInterval = setInterval(() => this.cleanupRateLimitState(), 60_000);
      if (typeof this.cleanupInterval.unref === 'function') {
        this.cleanupInterval.unref();
      }
    }

    this.initialized = true;
    this.logger.info('[AuthManager] initialized');
  }

  // ---- Token verification ----

  /**
   * Verify a first-party MCP token. Delegates to `token-manager.verifyAccessToken`
   * which handles RS256 + audience + issuer + azp checks in one place (RS256-only).
   *
   * Defense-in-depth: rejects raw provider tokens (ghp_/gho_/ms-) before
   * signature verification — emits `provider_token_misrouted` audit event.
   *
   * @throws on signature failure, expired, bad audience/issuer, or azp mismatch.
   */
  async verifyMcpToken(
    token: string,
    opts?: { expectedClientId?: string }
  ): Promise<VerifiedTokenClaims> {
    // SEC-C3 + SEC-I7: explicit provider-token shape-check with distinct audit event
    if (typeof token === 'string') {
      const matched = PROVIDER_TOKEN_PREFIXES.find((p) => token.startsWith(p));
      if (matched) {
        this.oauthAuditLogger.log({
          action: 'provider_token_misrouted',
          success: false,
          metadata: { prefix: matched, tokenPrefix: token.substring(0, 6) },
        });
        throw new Error(
          `[AuthManager] provider_token_rejected — raw ${matched.replace(/_$/, '')} token sent to MCP endpoint`
        );
      }
    }

    const claims = await verifyAccessToken(token, opts?.expectedClientId);
    // token-manager already runs validateRole and projects to {userId, email, role}
    return {
      userId: claims.userId,
      email: claims.email,
      role: claims.role,
    };
  }

  /**
   * Decode the raw JWT payload WITHOUT signature verification. Used to recover
   * claims that `verifyAccessToken` doesn't project (azp, name, scope, jti, etc.).
   *
   * SECURITY: this method does NOT validate signature. NEVER trust the returned
   * payload for authentication — only use after a separate verifyMcpToken (or
   * token-manager verifyAccessToken) call has succeeded. (AuthManager.verifyApiKey
   * was deleted 2026-06-04 in the api-key RS256 migration.)
   */
  decodeJwtPayload(token: string): RawJwtPayload | null {
    if (!token || typeof token !== 'string') return null;
    try {
      return decodeJwt(token) as RawJwtPayload;
    } catch {
      return null;
    }
  }

  // ---- Middleware factory ----

  /**
   * Returns an Express middleware that runs the auth chain (Bearer → API-Key → 401)
   * and populates req.user.
   *
   * SEC-C4: throws if called before `initialize()`. Tests assert this.
   */
  createMiddleware(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    if (!this.initialized) {
      throw new Error('[AuthManager] createMiddleware() called before initialize()');
    }
    if (this.destroyed) {
      throw new Error('[AuthManager] createMiddleware() called on destroyed instance');
    }

    // Wave 4 Phase 4.2 (2026-05-20): fills the Phase 3.2 stub.
    //
    // Auth chain:
    //   1. Authorization: Bearer <token>
    //      a. If alg=RS256 with kid → verify + Prisma user fetch (FRESH role)
    //      b. Else (non-RS256 / no kid / RS256 failure) → fall through to (1c)
    //      c. Fallback verify (verifyMcpToken) → use claims.role. Reachable only for
    //         non-fast-path tokens; HS256 is rejected (retired 2026-05-28), so in
    //         practice this no longer succeeds.
    //   2. X-API-Key header → verifyMcpToken → use claims.role.
    //   3. If isProtectedMethod(method) → throw AuthMiddlewareReject (server
    //      wrapper serializes with id mirror); else next() for public method.
    //
    // D7 role-source invariant (auth-permissions C1): the Bearer RS256 path (1a) reads
    // FRESH user.role from Prisma. claims.role (paths 1c/2) comes from verifyAccessToken:
    // for api-key-scoped tokens it is FRESH (enforceActiveApiKey re-reads role+status);
    // for stateless OAuth/session tokens it is the token's own role (intentionally
    // stateless, short-lived). HS256 acceptance was removed 2026-05-28. Test 27 locks the
    // RS256 FRESH-from-Prisma invariant (former Test 28 HS256 asymmetry removed 2026-06-06).
    return async (req, _res, next) => {
      this.logger.debug(
        {
          method: req.body?.method,
          hasAuth: !!req.headers.authorization,
          hasApiKey: !!req.headers['x-api-key'],
        },
        '[AuthManager] auth middleware processing'
      );

      const authHeader = req.headers.authorization;
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);

        // Path 1a: RS256 first-party MCP token (kid-based key lookup).
        // Per D7: RS256 reads FRESH role from Prisma, not from JWT payload.
        try {
          const header = decodeProtectedHeader(token);
          if (header && header.alg === 'RS256') {
            if (!header.kid || typeof header.kid !== 'string') {
              throw new Error('RS256 token missing kid header — required for key rotation');
            }
            const claims = await this.verifyMcpToken(token);
            const rawPayload = this.decodeJwtPayload(token) ?? ({} as RawJwtPayload);
            // FRESH role from Prisma — D7 invariant
            const user = await this.prismaClient.user.findUnique({
              where: { id: claims.userId },
            });
            if (user) {
              this.populateReqUser(
                req,
                {
                  userId: user.id,
                  email: user.email,
                  role: user.role as ReqUser['role'],
                },
                token,
                'mcp_token',
                {
                  azp: rawPayload.azp,
                  name: rawPayload.name ?? user.name ?? undefined,
                  scope: rawPayload.scope,
                  jti: rawPayload.jti,
                  permissions: {
                    canAccessMCP: true,
                    canViewPOVs: true,
                    canEditTasks: ['ADMIN', 'SUPER_ADMIN', 'USER', 'DEMO_USER'].includes(user.role),
                  },
                }
              );
              // Dual-emit on success (D6): pino stdout + audit logger
              this.logger.debug(
                { userId: user.id, scope: rawPayload.scope, jti: rawPayload.jti },
                '[AuthManager] MCP first-party token authentication successful'
              );
              this.oauthAuditLogger.log({
                action: 'auth_success_mcp_token',
                success: true,
                userId: user.id,
                metadata: {
                  scope: rawPayload.scope,
                  jti: rawPayload.jti,
                  authMethod: 'mcp_token',
                },
              });
              return next();
            }
          }
          // Non-RS256 or no kid → fall through to fallback verify path 1c (HS256 is rejected there since 2026-05-28)
        } catch (mcpError: unknown) {
          const errMsg = mcpError instanceof Error ? mcpError.message : String(mcpError);
          this.logger.debug({ err: errMsg }, '[AuthManager] MCP token verification failed (trying other methods)');
        }

        // Path 1c: fallback verify (non-fast-path Bearer) — uses claims.role per the D7 note
        // above; HS256 is rejected here, so this no longer succeeds in practice.
        try {
          const claims = await this.verifyMcpToken(token);
          const rawPayload = this.decodeJwtPayload(token) ?? ({} as RawJwtPayload);
          this.populateReqUser(
            req,
            {
              userId: claims.userId,
              email: claims.email,
              role: claims.role,
            },
            token,
            'jwt',
            {
              azp: rawPayload.azp,
              name: rawPayload.name,
            }
          );
          this.logger.debug(
            { userId: claims.userId },
            '[AuthManager] JWT authentication successful'
          );
          this.oauthAuditLogger.log({
            action: 'auth_success_jwt',
            success: true,
            userId: claims.userId,
            metadata: { authMethod: 'jwt' },
          });
          return next();
        } catch (jwtError: unknown) {
          const errMsg = jwtError instanceof Error ? jwtError.message : String(jwtError);
          this.logger.debug({ err: errMsg }, '[AuthManager] JWT verification failed');
        }
      }

      // Path 2: X-API-Key header — uses claims.role from verifyAccessToken (FRESH for
      // api-key-scoped tokens via enforceActiveApiKey; token role for stateless tokens)
      const apiKey = req.headers['x-api-key'];
      if (typeof apiKey === 'string') {
        try {
          const claims = await this.verifyMcpToken(apiKey);
          const rawPayload = this.decodeJwtPayload(apiKey) ?? ({} as RawJwtPayload);
          this.populateReqUser(
            req,
            {
              userId: claims.userId,
              email: claims.email,
              role: claims.role,
            },
            apiKey,
            'api-key',
            {
              azp: rawPayload.azp,
              name: rawPayload.name,
            }
          );
          this.logger.debug(
            { userId: claims.userId },
            '[AuthManager] API key authentication successful'
          );
          this.oauthAuditLogger.log({
            action: 'auth_success_api_key',
            success: true,
            userId: claims.userId,
            metadata: { authMethod: 'api-key' },
          });
          return next();
        } catch (jwtError: unknown) {
          const errMsg = jwtError instanceof Error ? jwtError.message : String(jwtError);
          this.logger.debug({ err: errMsg }, '[AuthManager] API key JWT verification failed');
        }
      }

      // Path 3: failure handling — protected method requires auth
      const method = req.body?.method;
      const methodRequiresAuth = isProtectedMethod(method);

      if (methodRequiresAuth) {
        // Dual-emit 401 (D6)
        this.logger.info(
          {
            method,
            path: req.path,
            httpMethod: req.method,
            userAgent: typeof req.headers['user-agent'] === 'string'
              ? req.headers['user-agent'].substring(0, 50)
              : undefined,
            hasAuthHeader: !!authHeader,
            hasApiKey: !!apiKey,
          },
          '[Auth] Protected method requires authentication'
        );
        this.oauthAuditLogger.log({
          action: 'auth_middleware_401',
          success: false,
          userId: 'unknown',
          metadata: { method: method || req.method, path: req.path },
        });

        const resourceMetadataUrl = `${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`;
        throw new AuthMiddlewareReject(
          401,
          {
            'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
            Link: `<${resourceMetadataUrl}>; rel="oauth-protected-resource"`,
            'Access-Control-Expose-Headers': 'WWW-Authenticate, Link',
          },
          {
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message:
                `This is an MCP endpoint for AI clients. To connect, paste this URL into Claude Desktop, ChatGPT, or another MCP client. For setup instructions visit ${PUBLIC_BASE_URL}`,
              data: {
                hint: `Method '${method || req.method}' requires authentication`,
                setup_url: PUBLIC_BASE_URL,
                oauth_discovery: resourceMetadataUrl,
                authorization_server: `${PUBLIC_BASE_URL}/.well-known/oauth-authorization-server`,
              },
            },
          }
        );
      } else {
        // Public method — proceed without req.user mutation
        this.logger.debug(
          { method },
          '[AuthManager] allowing public method without auth'
        );
        return next();
      }
    };
  }

  /**
   * Populate req.user from verified claims + extras. Extras carry the wider
   * fields (azp, name, tenantId, provider, scope, jti, permissions) that the
   * narrow `verifiedClaims` shape doesn't include.
   *
   * Mutates `req.user` in place. After populate, the object is Object.freeze'd
   * to prevent later mutation from shadowing canonical fields (Test 18).
   */
  populateReqUser(
    req: Request,
    claims: VerifiedTokenClaims,
    token: string,
    authMethod: NonNullable<ReqUser['authMethod']>,
    extras: Partial<
      Pick<ReqUser, 'azp' | 'scope' | 'jti' | 'permissions' | 'name' | 'tenantId' | 'provider'>
    > = {}
  ): void {
    const reqUser: ReqUser = {
      id: claims.userId,
      userId: claims.userId,  // dual emission for downstream `user.id || user.userId` pattern
      email: claims.email,
      role: claims.role,
      token,
      authMethod,
      ...extras,
    };
    // SEC-N1 + Test 18: prevent later mutations from shadowing canonical fields
    (req as Request & { user: ReqUser }).user = Object.freeze(reqUser);
  }

  // ---- Pure utilities ----

  /** Generate `mcp_refresh_*` random token via crypto.randomBytes. 32 bytes = 256 bits. */
  generateRefreshToken(): string {
    return 'mcp_refresh_' + randomBytes(32).toString('base64url');
  }

  /**
   * Match `redirect_uri` against CLIENT_PROVIDER_MAP.
   * Returns `clientConfig: null` for the 'webapp' fallback (boundary-contract C11).
   * URL normalization: trim, lowercase host. Hash fragments/query strings preserved.
   */
  detectOAuthClient(redirectUri: string | null | undefined): {
    clientName: string;
    clientConfig: ClientConfig | null;
  } {
    if (!redirectUri || typeof redirectUri !== 'string') {
      return { clientName: 'webapp', clientConfig: null };
    }

    // URL normalization — lower-case the host only; preserve path/query/hash
    let normalized = redirectUri.trim();
    try {
      const url = new URL(normalized);
      normalized = url.origin.toLowerCase() + url.pathname + url.search + url.hash;
    } catch {
      // Not a valid URL — fall back to raw string matching
    }

    for (const match of CLIENT_PROVIDER_MAP) {
      if (match.detect(normalized)) {
        return {
          clientName: match.name,
          clientConfig: { name: match.name, defaultProvider: match.defaultProvider },
        };
      }
    }
    return { clientName: 'webapp', clientConfig: null };
  }

  // ---- Rate limiting ----

  /**
   * Check OAuth callback rate limit (default 30/min/IP).
   *
   * Returns discriminated union — `retryAfterSeconds` only present when not allowed.
   * Caller MUST set `Retry-After: <retryAfterSeconds>` header on 429 response
   * (RFC 6585 §4 — SEC-C5 fix).
   *
   * Math: `Math.max(1, ceil((start + 60000 - now) / 1000))` — boundary safety
   * prevents `Retry-After: 0` at exact window boundary.
   */
  checkCallbackRateLimit(ipAddress: string): RateLimitResult {
    if (this.destroyed) {
      throw new Error('[AuthManager] checkCallbackRateLimit() called on destroyed instance');
    }
    return this.checkIpRateLimit(`oauth_callback:${ipAddress}`, this.callbackRateLimitPerMinute);
  }

  /**
   * Check OAuth DCR (`/oauth/register`, RFC 7591) rate limit (default 30/min/IP).
   *
   * Shares the Map + cleanup with the callback limiter. Added 2026-05-26: after
   * Cloudflare Bot Fight Mode was disabled on `/oauth/*` (it was Managed-Challenging
   * OpenAI's datacenter DCR POSTs and breaking the ChatGPT connector), the edge
   * throttle on this open endpoint is gone, so app-level is now the only backstop.
   * Per-IP only stops single-source floods — ChatGPT DCR arrives from rotating
   * Azure IPs, so legitimate connector setup is unaffected.
   */
  checkRegisterRateLimit(ipAddress: string): RateLimitResult {
    if (this.destroyed) {
      throw new Error('[AuthManager] checkRegisterRateLimit() called on destroyed instance');
    }
    return this.checkIpRateLimit(`oauth_register:${ipAddress}`, this.registerRateLimitPerMinute);
  }

  /** Shared fixed-window per-IP limiter — bucket-prefixed key, 60s window. */
  private checkIpRateLimit(key: string, perMinute: number): RateLimitResult {
    const now = Date.now();
    const entry = this.callbackRateLimit.get(key);

    if (!entry || now - entry.start >= 60_000) {
      // New window — fresh start
      this.callbackRateLimit.set(key, { count: 1, start: now });
      return { allowed: true };
    }

    if (entry.count < perMinute) {
      entry.count += 1;
      return { allowed: true };
    }

    // Rate limit exceeded
    const elapsed = now - entry.start;
    const retryAfterSeconds = Math.max(1, Math.ceil((60_000 - elapsed) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  /**
   * Test-visible: returns size of rate-limit Map.
   * Used by Test 21 (bounded-growth invariant).
   */
  __getRateLimitMapSize(): number {
    return this.callbackRateLimit.size;
  }

  /** Internal: evict rate-limit entries whose window has expired. */
  private cleanupRateLimitState(): void {
    if (this.destroyed) return;
    const now = Date.now();
    for (const [key, entry] of this.callbackRateLimit.entries()) {
      if (now - entry.start >= 60_000) {
        this.callbackRateLimit.delete(key);
      }
    }
  }

  // ---- Lifecycle ----

  /** Idempotent. Clears rate-limit Map + interval. Tolerates post-destroy callbacks. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.callbackRateLimit.clear();
  }
}
