/**
 * PUBLIC_BASE_URL — the ONE public origin this deployment is reachable at, and
 * everything the auth layer derives from it (JWT issuer, token audiences, the
 * OAuth discovery URLs). Source of truth: `APP_BASE_URL`.
 *
 * Why this module exists (open-source readiness D4, panel review
 * cline_docs/reviews/public-base-url-derivation-2026-09-04/SYNTHESIS.md):
 * until 2026-09-04 the prod origin was spelled as a literal in ~15 files —
 * token-manager minted AND verified with its own copies — so a self-hosted install
 * minted tokens for paichart.app and advertised paichart.app as its OAuth issuer.
 *
 * HARD CONSTRAINTS — do not "improve" these away:
 *   1. ZERO imports. This module is bundled into the Next.js EDGE middleware via
 *      lib/auth/middleware.ts. A logger, `@/lib/config`, Prisma or a Node built-in
 *      here breaks the middleware bundle for the whole site.
 *   2. Read ONCE at module load (like every other env read in lib/auth). There is
 *      no live toggle; a change needs a restart. Tests must spawn child processes.
 *   3. The fallback stays the prod origin (FALLBACK_BASE_URL) so every env-blind script and CI
 *      job derives EXACTLY today's strings (prod sets APP_BASE_URL to that value,
 *      so prod is byte-identical whether or not the variable is visible).
 *   4. NEVER throw on ABSENCE at module load (see constraint 1 — the Edge bundle
 *      must never crash on env visibility). Production servers fail loud instead
 *      via assertPublicBaseUrlConfigured() at their entrypoints. A MALFORMED value
 *      throws everywhere: garbage here silently mints unverifiable tokens.
 *
 * Canonical form = `new URL(raw).origin` (RFC 3986 §6.2.2–6.2.3: scheme + host
 * lower-cased, default port dropped, no trailing slash). Path, query, fragment and
 * credentials are rejected: the RFC 8414 / 9728 well-known routes are registered at
 * host root, so a sub-path base would produce an issuer that does not match the URL
 * the metadata is served from. jose compares iss/aud by exact string, so the minter
 * and the verifier MUST derive from this one constant — that is the whole point.
 */

const FALLBACK_BASE_URL = 'https://paichart.app';

function canonicalise(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`APP_BASE_URL is not an absolute URL: "${raw}"`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`APP_BASE_URL must be http(s): "${raw}"`);
  }
  if (u.username || u.password) {
    throw new Error('APP_BASE_URL must not carry credentials');
  }
  if (u.search || u.hash) {
    throw new Error('APP_BASE_URL must not carry a query or fragment');
  }
  if (u.pathname !== '/' && u.pathname !== '') {
    throw new Error(
      `APP_BASE_URL must be an origin with no path (got "${u.pathname}") — sub-path deployments are unsupported`
    );
  }
  return u.origin;
}

const rawEnv = (process.env.APP_BASE_URL ?? '').trim();

/** 'env' when APP_BASE_URL supplied the value, 'fallback' when the built-in default did. */
export const PUBLIC_BASE_URL_SOURCE: 'env' | 'fallback' = rawEnv ? 'env' : 'fallback';

/** Canonical public origin — the prod origin, or e.g. http://localhost:3000 on a self-host. */
export const PUBLIC_BASE_URL: string = canonicalise(rawEnv || FALLBACK_BASE_URL);

/** JWT `iss` claim — also the OAuth authorization-server identifier (RFC 8414 `issuer`). */
export const JWT_ISSUER: string = PUBLIC_BASE_URL;

/** Audience of web/API tokens (access + refresh). */
export const API_AUDIENCE: string = `${PUBLIC_BASE_URL}/api`;

/**
 * Audience of MCP OAuth tokens (ChatGPT, Claude Desktop, Gemini, API keys) — the
 * MCP front door. Also the RFC 9728 `resource` the metadata advertises, and the
 * D11 LOCKED fallback in the OAuth callback flow (oauth-flow-routes.ts).
 */
export const MCP_FRONTDOOR_AUDIENCE: string = `${PUBLIC_BASE_URL}/mcp`;

/**
 * The inbound verifier's accept-list — exactly these two, in this order.
 * Per-service audiences (below) are verified by the receiving service, never here.
 */
export const LEGACY_AUDIENCES: readonly [string, string] = Object.freeze([
  API_AUDIENCE,
  MCP_FRONTDOOR_AUDIENCE,
] as [string, string]);

/**
 * Per-service audience prefix (RFC 8707): `audienceForService()` in
 * lib/mcp/server/tools/hub/audience-policy.js appends the NFKD-normalised
 * service slug → e.g. <base>/mcp/snowflake-service.
 * (The dead '/services/' convention was deleted 2026-09-04 — zero consumers.)
 */
export const MCP_SERVICE_AUDIENCE_PREFIX: string = `${MCP_FRONTDOOR_AUDIENCE}/`;

/**
 * Production fail-loud, called by the two SERVER entrypoints (lib/server-init.ts,
 * mcp-server-http-clean.js) — never by the module itself (constraint 4).
 * A self-host that boots with NODE_ENV=production and no APP_BASE_URL would
 * otherwise silently advertise paichart.app as its issuer and send its users to
 * the public SaaS login. Prod always has the variable (deploy heredoc), so this is
 * a no-op there. Returns operator warnings the caller should log.
 */
export function assertPublicBaseUrlConfigured(
  env: { NODE_ENV?: string; [key: string]: string | undefined } = process.env
): { source: 'env' | 'fallback'; baseUrl: string; warnings: string[] } {
  const warnings: string[] = [];
  if (env.NODE_ENV === 'production') {
    if (PUBLIC_BASE_URL_SOURCE === 'fallback') {
      throw new Error(
        'APP_BASE_URL is required in production: it is the JWT issuer, every token audience and every ' +
          'OAuth discovery URL this server advertises. Set it to the exact public origin (e.g. https://your-domain).'
      );
    }
    const baseHostname = new URL(PUBLIC_BASE_URL).hostname;
    if (PUBLIC_BASE_URL.startsWith('http:') && baseHostname !== 'localhost' && baseHostname !== '127.0.0.1') {
      warnings.push(
        `APP_BASE_URL is plain http (${PUBLIC_BASE_URL}) in production — bearer tokens will travel unencrypted; MCP clients require https or localhost.`
      );
    }
  }
  return { source: PUBLIC_BASE_URL_SOURCE, baseUrl: PUBLIC_BASE_URL, warnings };
}
