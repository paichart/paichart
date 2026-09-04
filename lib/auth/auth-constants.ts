/**
 * Shared authentication constants — single source of truth for OAuth scopes,
 * token TTLs, and audience patterns.
 *
 * Extracted in Phase 3.1 of the AuthManager extraction (2026-05-20) per
 * `safe-modular-extraction-pattern.md` Phase 3: extract shared constants
 * FIRST, before extracting the class itself. Catches default-value-drift
 * silent failures early (Time Bomb Cat 2).
 *
 * Pre-Phase 3.1 state: these constants lived as static class properties on
 * `CleanMCPHTTPServer` in `mcp-server-http-clean.js`. Server class now
 * re-exports from this module so existing `CleanMCPHTTPServer.X` callers
 * continue to work (zero behaviour change). Future consumers (AuthManager
 * Wave 3a, MicrosoftOAuthHandler Wave 3b) import from here directly.
 *
 * @module lib/auth/auth-constants
 */

// ============================================================================
// Token TTLs
// ============================================================================

/**
 * First-party MCP access token TTL — 15 minutes (RFC 8252 short-lived).
 * Pre-Phase 3.1: `CleanMCPHTTPServer.TOKEN_TTL_SECONDS`.
 *
 * NOTE (Phase 3.1 historical context): comment at line 1719 of the legacy
 * code referenced "8-hour TTL" as a PM2-restart workaround. That was wrong —
 * the canonical value has always been 900s (15 min). Stale comment removed
 * in Phase 3.1.
 */
export const TOKEN_TTL_SECONDS = 900;

/**
 * OAuth state nonce TTL — 15 minutes. Authorize → callback round-trip
 * must complete within this window.
 */
export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

/** Refresh token lifetime — 7 days. */
export const REFRESH_TOKEN_TTL_DAYS = 7;

// ============================================================================
// OAuth scope strings — per-client (CRITICAL: exact-string match required)
// ============================================================================

/**
 * ChatGPT OAuth scope (Microsoft provider).
 * INVARIANT: exact-string match required by ChatGPT — order/spacing/case all matter.
 * Enforced by CONSTRUCTION: the token endpoint echoes the client's requested
 * scope string verbatim into the response (`scope: requestedScope` in
 * lib/mcp/server/routes/oauth-flow-routes.ts). There is no runtime check —
 * `AuthManager.validateScopeMatch` was deleted 2026-06-11 (dead since Wave
 * 3b.0a; it was a tautological self-comparison of that same echo).
 */
export const CHATGPT_SCOPE = 'openid email';

/**
 * Claude Desktop OAuth scope (GitHub provider).
 *
 * Reduced from `'read:user read:org'` to `'user:email'` on 2026-04-09 (plan v4
 * user-feedback item). GitHub's /user endpoint returns id/login/name/avatar_url/
 * company/bio as public profile fields regardless of scope. `user:email` grants
 * ACCESS to the user's verified emails — but note GET /user.email is still null
 * for private-email users; the primary verified address must be fetched via
 * GET /user/emails (2026-06-20: implemented in lib/auth/oauth/github-email.ts;
 * the prior claim that the scope alone removed the `${login}@github.user` stub
 * was incorrect — the stub persisted until /user/emails was actually called).
 * `read:org` was unused — no consumer read organization data.
 */
export const CLAUDE_SCOPE = 'user:email';

/** Microsoft Graph API scope — user info lookup. */
export const MICROSOFT_GRAPH_SCOPE = 'openid profile email User.Read';

/**
 * Microsoft Graph API scope WITH refresh token support.
 * Used for OAuth flows that need refresh capability (server-side refresh
 * middleware path). Base scope (without `offline_access`) is used for one-shot
 * Graph API lookups where refresh isn't needed.
 */
export const MICROSOFT_GRAPH_SCOPE_OFFLINE = 'openid profile email User.Read offline_access';

// ============================================================================
// Scope arrays for discovery endpoints
// ============================================================================

/** MCP-specific capability scopes — exposed via /.well-known/oauth-protected-resource. */
export const MCP_SCOPES = Object.freeze([
  'mcp:read',
  'tools:graph.read',
  'tools:pov.read',
  'tools:pov.write',
  'tools:tasks.read',
  'tools:tasks.write',
  'tools:agents.read',
  'tools:agents.execute',
] as const);

/** OIDC core scopes. */
export const OIDC_SCOPES = Object.freeze(['openid', 'email', 'profile'] as const);

/** GitHub OAuth scopes (see CLAUDE_SCOPE comment for reduction rationale). */
export const GITHUB_SCOPES = Object.freeze(['user:email'] as const);

// ============================================================================
// Audience patterns
// ============================================================================

/**
 * Issuer + audiences are DERIVED from APP_BASE_URL in ./public-base-url.ts
 * (2026-09-04, D4) and re-exported here so existing import paths keep working.
 *
 * - LEGACY_AUDIENCES — the inbound verifier's accept-list (web/API + MCP front
 *   door). Per-service audiences (RFC 8707, U2 Phase F) are minted in addition
 *   to these but verified only by the receiving service, never here.
 * - MCP_SERVICE_AUDIENCE_PREFIX — `${base}/mcp/`; audienceForService() appends
 *   the service slug. (A dead `PER_SERVICE_AUDIENCE_PREFIX = …/services/` with
 *   zero consumers and a false comment was deleted 2026-09-04.)
 * - JWT_ISSUER — the `iss` claim and the OAuth authorization-server identifier.
 */
export {
  PUBLIC_BASE_URL,
  JWT_ISSUER,
  API_AUDIENCE,
  MCP_FRONTDOOR_AUDIENCE,
  LEGACY_AUDIENCES,
  MCP_SERVICE_AUDIENCE_PREFIX,
} from './public-base-url';
