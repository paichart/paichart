/**
 * SessionStore — Extracted in-memory state for MCP HTTP server.
 *
 * Consolidates the 5 Maps previously living on CleanMCPHTTPServer:
 *   - sessionTransports (transport bag per MCP session)
 *   - sessionContexts (auth context per MCP session)
 *   - sessionTimestamps (session creation time for TTL + insertion-order FIFO eviction)
 *   - oauthRequests (in-flight OAuth state, indexed by state-nonce OR pkce:<challenge>)
 *   - authCodes (one-shot auth codes redeemed at /oauth/token)
 *
 * Extracted per SESSION-STORE-EXTRACTION-PLAN-v2.md (Phase 2.1).
 * Wired side-by-side with legacy state in Phase 2.2 (dual-write Phase 2.3),
 * with consumer reads migrated incrementally in Phase 2.4-2.9.
 *
 * INVARIANTS:
 *   - `exchangeAuthCode` must remain synchronous (no await between get+delete) to prevent replay (sec-ops C1).
 *   - `deleteSession` deletes across all 3 session Maps atomically + idempotently (AP I-3).
 *   - `setContext` requires a prior `setSession` call (AP C-3).
 *   - `destroy()` is idempotent + tolerates post-destroy callbacks (sec-ops I1).
 *   - `noCleanup: true` constructor option prevents auto-registering setInterval — required for Phase 2.2 transient state where legacy cleanup remains authoritative (sec-ops C3).
 */

import type { Logger } from 'pino';
import { PUBLIC_BASE_URL } from '../public-base-url';

/** Generic transport-bag stored per MCP session. See @modelcontextprotocol/sdk/server/streamableHttp. */
export type TransportData = {
  sessionId?: string;
  created?: Date;
  user?: unknown;
  authenticated?: boolean;
  /** True for stateless-mode sessions — flagged for immediate cleanup post-response. */
  temporary?: boolean;
  [key: string]: unknown;
};

/**
 * Per-session authentication context. Populated by the auth middleware on the first
 * request, replayed on subsequent requests sharing the same session.
 *
 * INTERFACE INVARIANTS (must not be lost in extraction):
 * - `userId` (top-level) — P7 hijack-defense check at lib/mcp/server/routes/mcp-transport-routes.ts (~:214; moved out of mcp-server-http-clean.js in Wave 6/7)
 * - `user.id` — P4 fresh-auth preference check at lib/mcp/server/routes/mcp-transport-routes.ts (~:232)
 * - `user.scope/jti/permissions` — RS256-only extras spread from AuthManager populateReqUser (lib/auth/oauth/auth-manager.ts; moved in Wave 3a)
 * - `temporary` — affects stateless-session cleanup (consumer in lib/mcp/server/routes/mcp-transport-routes.ts; moved out of mcp-server-http-clean.js in Wave 6/7)
 */
export interface SessionContext {
  /** P7 hijack-defense identity binding — TOP-LEVEL field */
  userId?: string | null;
  user?: {
    id: string;
    email: string;
    role: string;
    /** Token kept on req.user post-Phase D site #8; flows through SessionContext for replay */
    token?: string;
    /** Authorized party (Option α). Multi-tenancy roadmap: tenantId joins this object as separate claim */
    azp?: string;
    /** Auth method discriminator: 'mcp_token' (RS256) | 'jwt' (HS256) | 'api-key' */
    authMethod?: string;
    /** RS256-only extras (populateReqUser RS256 path) */
    scope?: string;
    jti?: string;
    permissions?: {
      canAccessMCP?: boolean;
      canViewPOVs?: boolean;
      canEditTasks?: boolean;
      [key: string]: unknown;
    };
    /** Multi-tenancy: populated when Tier 3 lands; currently always undefined */
    tenantId?: string;
    [key: string]: unknown;
  };
  authenticated?: boolean;
  authMethod?: string;
  /** Set when stateless session is created; triggers immediate cleanup */
  temporary?: boolean;
  createdAt?: Date;
  [key: string]: unknown;
}

/**
 * OAuth request data parked between authorize and token-exchange flows.
 * Indexed by `state` (random nonce) OR `pkce:<challenge>` (PKCE fallback for state-less ChatGPT flow).
 */
export interface OAuthRequestData {
  /** MCP client identifier (chatgpt_xxx, claude_yyy, etc.) — distinct from githubClientId */
  originalClientId: string;
  /** Client's redirect URI for post-callback final redirect */
  clientRedirectUri: string;
  /** Client's original state param (NOT the Map key — that's the server-generated nonce) */
  clientState?: string;
  clientName?: string;
  /** OAuth requested scope */
  requestedScope?: string;
  /** OAuth requested resource (RFC 8707) */
  requestedResource?: string;
  /** PKCE challenge */
  code_challenge?: string;
  code_challenge_method?: string;
  /** Cross-flow forensic trace ID */
  correlationId: string;
  /** GitHub OAuth App ID — distinct from MCP client_id */
  githubClientId?: string;
  /** Env-var NAME holding GitHub client_secret (indirection for dev/prod) */
  githubClientSecretEnv?: string;
  /** Provider dispatch — 'github' | 'microsoft' (default 'github') */
  provider: 'github' | 'microsoft';
  /** Token issuance time (used by /oauth/token to enforce 15-min state TTL) */
  createdAt: number;
  [key: string]: unknown;
}

/**
 * Auth code generated post-callback, exchanged at /oauth/token for first-party JWT.
 * Atomic get-and-delete prevents replay.
 */
export interface AuthCodeData {
  userId: string;
  email: string;
  role: string;
  scope: string;
  audience: string;
  /** azp source for mintMcpToken — sec-ops finding #3 compliance */
  originalClientId: string;
  /** RFC 6749 §4.1.3 — must match request body redirect_uri at /oauth/token */
  clientRedirectUri: string;
  clientName: string;
  /** PKCE verification */
  code_challenge?: string;
  code_challenge_method?: string;
  /** Cross-flow forensic trace ID */
  correlationId: string;
  /** OAuth audit log durationMs metric */
  timestamp: number;
  /** Multi-tenancy: populated when Tier 3 lands */
  tenantId?: string;
  [key: string]: unknown;
}

export interface SessionStoreOptions {
  logger: Logger;
  sessionTtlMs?: number;        // default 30 * 60 * 1000 (30 min)
  /**
   * OAuth request TTL — pAIchart issues short-lived state nonces for the
   * authorize → callback round-trip. Default 15 min matches the caller-side
   * setTimeout fallback in `mcp-server-http-clean.js`.
   */
  oauthRequestTtlMs?: number;   // default 15 * 60 * 1000 (15 min)
  /**
   * Auth code TTL — `pac_` prefixed codes are minted by the OAuth callback,
   * exchanged once at /oauth/token. Default 5 min matches RFC 6749 §4.1.2
   * recommendation (codes SHOULD be short-lived).
   */
  authCodeTtlMs?: number;       // default 5 * 60 * 1000 (5 min)
  cleanupIntervalMs?: number;   // default 5 * 60 * 1000 (5 min)
  maxSessions?: number;         // default 10000
  maxOAuthRequests?: number;    // default 1000
  maxAuthCodes?: number;        // default 500
  /**
   * If true, do NOT register a setInterval cleanup loop at construction time.
   * Required for Phase 2.2 transient state where legacy CleanMCPHTTPServer
   * cleanup is still authoritative. Caller must invoke startCleanup() later
   * (Phase 2.3) when ready to transition ownership. (sec-ops C3 + AR C1 fix)
   */
  noCleanup?: boolean;
}

export interface EvictionStats {
  sessions: number;
  oauth: number;
  authCodes: number;
}

export interface SessionLimits {
  maxSessions: number;
  maxOAuthRequests: number;
  maxAuthCodes: number;
}

/** Strongly-typed accessor for /health route + future diagnostics. (BC C-1 fix) */
export interface SessionInfoView {
  transport: TransportData;
  context: SessionContext | undefined;
  isTemporary: boolean;
}

/** Allowed redirect domains for OAuth flows — exposed as static for unit testing (BC NICE-2). */
const ALLOWED_OAUTH_REDIRECT_DOMAINS = Object.freeze([
  'claude.ai',
  'chatgpt.com',
  'smithery.ai',
  'glama.ai',
  'paichart.app',
  'paichart.com',
  new URL(PUBLIC_BASE_URL).hostname,   // D4-B: the operator's own host (security-neutral — it is their host)
] as const);

export class SessionStore {
  static readonly ALLOWED_OAUTH_REDIRECT_DOMAINS: readonly string[] = ALLOWED_OAUTH_REDIRECT_DOMAINS;

  private readonly logger: Logger;
  private readonly sessionTtlMs: number;
  private readonly oauthRequestTtlMs: number;
  private readonly authCodeTtlMs: number;
  private readonly cleanupIntervalMs: number;
  private readonly maxSessions: number;
  private readonly maxOAuthRequests: number;
  private readonly maxAuthCodes: number;

  private readonly sessionTransports = new Map<string, TransportData>();
  private readonly sessionContexts = new Map<string, SessionContext>();
  private readonly sessionTimestamps = new Map<string, number>();
  private readonly oauthRequests = new Map<string, OAuthRequestData>();
  private readonly authCodes = new Map<string, AuthCodeData>();

  private readonly evictionStats: EvictionStats = { sessions: 0, oauth: 0, authCodes: 0 };

  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(options: SessionStoreOptions) {
    if (!options?.logger) {
      throw new Error('SessionStore requires a logger');
    }
    this.logger = options.logger;
    this.sessionTtlMs = options.sessionTtlMs ?? 30 * 60 * 1000;
    this.oauthRequestTtlMs = options.oauthRequestTtlMs ?? 15 * 60 * 1000;
    this.authCodeTtlMs = options.authCodeTtlMs ?? 5 * 60 * 1000;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 5 * 60 * 1000;
    this.maxSessions = options.maxSessions ?? 10000;
    this.maxOAuthRequests = options.maxOAuthRequests ?? 1000;
    this.maxAuthCodes = options.maxAuthCodes ?? 500;

    if (!options.noCleanup) {
      this.startCleanup();
    }
  }

  // ---- Session storage ----

  setSession(sessionId: string, transport: TransportData, context?: SessionContext | null): void {
    // FIFO eviction when at capacity (Map iteration is insertion order — ES2015 §23.1).
    // We do NOT re-insert on access, so this is FIFO (oldest insertion), not true LRU.
    // Acceptable for session cache: sessions are evicted by TTL first; capacity-eviction is rare.
    if (this.sessionTransports.size >= this.maxSessions && !this.sessionTransports.has(sessionId)) {
      const oldestSessionId = this.sessionTimestamps.keys().next().value;
      if (oldestSessionId) {
        this.sessionTransports.delete(oldestSessionId);
        this.sessionContexts.delete(oldestSessionId);
        this.sessionTimestamps.delete(oldestSessionId);
        this.evictionStats.sessions++;
        this.logger.warn(
          { evictedSessionId: oldestSessionId.substring(0, 20) },
          '[SessionStore] FIFO-evicted oldest session due to capacity'
        );
      }
    }

    this.sessionTransports.set(sessionId, transport);
    if (context !== null && context !== undefined) {
      this.sessionContexts.set(sessionId, context);
    }
    this.sessionTimestamps.set(sessionId, Date.now());
  }

  /**
   * Park/replace auth context for an existing session.
   * Used by Wave 4 auth-middleware extraction to write populateReqUser output
   * into the session's replay slot AFTER the session has been created.
   *
   * @throws Error if sessionId has no transport (must call setSession first)
   */
  setContext(sessionId: string, context: SessionContext): void {
    if (!this.sessionTransports.has(sessionId)) {
      throw new Error(
        `SessionStore.setContext: cannot set context for unknown session ${sessionId.substring(0, 20)} — call setSession() first`
      );
    }
    this.sessionContexts.set(sessionId, context);
  }

  getTransport(sessionId: string): TransportData | undefined {
    return this.sessionTransports.get(sessionId);
  }

  getContext(sessionId: string): SessionContext | undefined {
    return this.sessionContexts.get(sessionId);
  }

  /** Combined typed accessor — for stateless-cleanup branch + /health route. */
  getSessionInfo(sessionId: string): SessionInfoView | undefined {
    const transport = this.sessionTransports.get(sessionId);
    if (!transport) return undefined;
    const context = this.sessionContexts.get(sessionId);
    return {
      transport,
      context,
      isTemporary: transport.temporary === true || context?.temporary === true,
    };
  }

  hasSession(sessionId: string): boolean {
    return this.sessionTransports.has(sessionId);
  }

  /**
   * Atomic delete across all 3 backing Maps (transport + context + timestamp).
   * Idempotent — safe on already-deleted sessions.
   * Returns true if any Map had the entry.
   */
  deleteSession(sessionId: string): boolean {
    const hadTransport = this.sessionTransports.delete(sessionId);
    const hadContext = this.sessionContexts.delete(sessionId);
    const hadTimestamp = this.sessionTimestamps.delete(sessionId);
    return hadTransport || hadContext || hadTimestamp;
  }

  // trackSessionCreation + refreshSessionTTL removed in Phase 2.11 (2026-05-19) —
  // both had zero callers. setSession() handles timestamp tracking internally; if
  // sliding-TTL behaviour ever becomes a requirement (e.g., per Tracked Item #1 in
  // .claude/knowledge/TODO1-mcp-spec-feature-gap-analysis.md), restore here and wire
  // into the request handler at the same time.

  getSessionCount(): number {
    return this.sessionTransports.size;
  }

  // ---- OAuth request storage ----

  setOAuthRequest(key: string, data: OAuthRequestData): void {
    if (this.oauthRequests.size >= this.maxOAuthRequests && !this.oauthRequests.has(key)) {
      const oldestKey = this.oauthRequests.keys().next().value;
      if (oldestKey) {
        this.oauthRequests.delete(oldestKey);
        this.evictionStats.oauth++;
        this.logger.warn(
          { evictedKey: oldestKey.substring(0, 20) },
          '[SessionStore] FIFO-evicted oldest OAuth request due to capacity'
        );
      }
    }
    this.oauthRequests.set(key, data);
  }

  getOAuthRequest(key: string): OAuthRequestData | undefined {
    return this.oauthRequests.get(key);
  }

  deleteOAuthRequest(key: string): boolean {
    return this.oauthRequests.delete(key);
  }

  getOAuthRequestCount(): number {
    return this.oauthRequests.size;
  }

  // ---- Auth code storage ----

  setAuthCode(code: string, data: AuthCodeData): void {
    if (this.authCodes.size >= this.maxAuthCodes && !this.authCodes.has(code)) {
      const oldestKey = this.authCodes.keys().next().value;
      if (oldestKey) {
        this.authCodes.delete(oldestKey);
        this.evictionStats.authCodes++;
        this.logger.warn('[SessionStore] FIFO-evicted oldest auth code due to capacity');
      }
    }
    this.authCodes.set(code, data);
  }

  /**
   * ATOMIC get-and-delete (replay prevention).
   *
   * MUST remain synchronous. Adding `await` between .get() and .delete()
   * opens a replay window. Non-Promise return type is the static guard.
   * Race-tested in Phase 2.1 unit tests (sec-ops C1).
   */
  exchangeAuthCode(code: string): AuthCodeData | null {
    const data = this.authCodes.get(code);
    if (!data) return null;
    this.authCodes.delete(code); // IMMEDIATE — no await between get and delete
    return data;
  }

  deleteAuthCode(code: string): boolean {
    return this.authCodes.delete(code);
  }

  getAuthCodeCount(): number {
    return this.authCodes.size;
  }

  // ---- Redirect URI allowlist ----

  /**
   * Validate redirect_uri against allowlist (open redirect prevention).
   * Allows localhost/127.0.0.1 on any port (MCP CLI clients use dynamic ports).
   * Allows known HTTPS domains for registered MCP clients.
   */
  isAllowedRedirectUri(uri: string | null | undefined): boolean {
    if (!uri) return false;
    try {
      const parsed = new URL(uri);
      if (['127.0.0.1', 'localhost'].includes(parsed.hostname)) return true;
      if (parsed.protocol !== 'https:') return false;
      return ALLOWED_OAUTH_REDIRECT_DOMAINS.some(
        (d) => parsed.hostname === d || parsed.hostname.endsWith('.' + d)
      );
    } catch {
      return false;
    }
  }

  // ---- Diagnostics ----

  /** Snapshot of eviction counters — new object per call (D7 hygiene). */
  getEvictionStats(): EvictionStats {
    return { ...this.evictionStats };
  }

  /** Configured limits — for /health route. */
  getLimits(): SessionLimits {
    return {
      maxSessions: this.maxSessions,
      maxOAuthRequests: this.maxOAuthRequests,
      maxAuthCodes: this.maxAuthCodes,
    };
  }

  // ---- Lifecycle ----

  /**
   * TTL cleanup across ALL three time-based stores (sessions, oauthRequests, authCodes).
   * Defence-in-depth: callers ALSO register per-entry setTimeouts on the OAuth + auth
   * code paths, but this loop guarantees eviction even if a caller forgets — eliminates
   * the "works by convention" anti-pattern (Time Bomb Detection Pattern, Category 4).
   *
   * Public for testing + Phase 2.3 manual invocation. Returns a per-store eviction count.
   */
  cleanupStaleSessions(): { sessions: number; oauthRequests: number; authCodes: number } {
    const now = Date.now();
    const stats = { sessions: 0, oauthRequests: 0, authCodes: 0 };

    // Sessions — keyed by sessionTimestamps (Map<sessionId, createdAt>)
    for (const [sessionId, createdAt] of this.sessionTimestamps.entries()) {
      if (now - createdAt > this.sessionTtlMs) {
        this.sessionTransports.delete(sessionId);
        this.sessionContexts.delete(sessionId);
        this.sessionTimestamps.delete(sessionId);
        stats.sessions++;
        this.logger.debug({ sessionId }, '[SessionStore] Auto-cleaned stale session');
      }
    }

    // OAuth requests — keyed in-value by OAuthRequestData.createdAt
    for (const [key, data] of this.oauthRequests.entries()) {
      if (now - data.createdAt > this.oauthRequestTtlMs) {
        this.oauthRequests.delete(key);
        stats.oauthRequests++;
        this.logger.debug(
          { keyPrefix: key.substring(0, 20) },
          '[SessionStore] Auto-cleaned stale OAuth request'
        );
      }
    }

    // Auth codes — keyed in-value by AuthCodeData.timestamp
    for (const [code, data] of this.authCodes.entries()) {
      if (now - data.timestamp > this.authCodeTtlMs) {
        this.authCodes.delete(code);
        stats.authCodes++;
        this.logger.debug('[SessionStore] Auto-cleaned stale auth code');
      }
    }

    if (stats.sessions + stats.oauthRequests + stats.authCodes > 0) {
      this.logger.info(
        {
          sessions: stats.sessions,
          oauthRequests: stats.oauthRequests,
          authCodes: stats.authCodes,
          active: this.sessionTransports.size,
        },
        '[SessionStore] TTL cleanup'
      );
    }
    return stats;
  }

  /**
   * Start the cleanup interval. Idempotent — safe to call multiple times.
   * Called from Phase 2.3 when SessionStore takes ownership of cleanup from
   * legacy CleanMCPHTTPServer.startSessionCleanupScheduler.
   */
  startCleanup(): void {
    if (this.cleanupInterval) return;
    if (this.destroyed) {
      this.logger.warn('[SessionStore] startCleanup called on destroyed store; ignored');
      return;
    }
    this.logger.info(
      {
        ttlMinutes: this.sessionTtlMs / 60000,
        intervalMinutes: this.cleanupIntervalMs / 60000,
      },
      '[SessionStore] Starting session cleanup scheduler'
    );

    this.cleanupInterval = setInterval(() => {
      if (this.destroyed) return;
      this.cleanupStaleSessions();
    }, this.cleanupIntervalMs);
    // .unref() prevents the interval from keeping the Node process alive during shutdown.
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clear the cleanup interval + flush all Maps. Called from server shutdown().
   * Idempotent. Tolerates post-destroy callbacks (in-flight setTimeout closures become no-ops).
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessionTransports.clear();
    this.sessionContexts.clear();
    this.sessionTimestamps.clear();
    this.oauthRequests.clear();
    this.authCodes.clear();
  }

  /** Test-only: peek at whether the cleanup interval is registered. */
  __hasCleanupInterval(): boolean {
    return this.cleanupInterval !== null;
  }
}
