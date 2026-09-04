/**
 * OAuth discovery routes (B1 + R3 + R4 + R5).
 *
 * Extracted from `mcp-server-http-clean.js:setupRoutes()` in Wave 6
 * Phase 6.3. Verbatim move — no behavioral changes from the pre-extraction
 * shape.
 *
 * Four registrations (ordered per Plan v2 D4 + Hazard H-5 sensitivity):
 *
 *   B1 — `app.use('/mcp', linkHeaderMiddleware)`:
 *     Injects RFC 9728 `Link` header on ALL /mcp responses for Claude
 *     Desktop OAuth discovery. Per Plan v2 D9 placement: B1 belongs here
 *     (discovery metadata), B2 belongs in oauth-flow-routes (the 401
 *     trigger).
 *
 *   R3 — `app.get(['/.well-known/jwks.json', '/mcp/.well-known/jwks.json'])`:
 *     **SECURITY-CRITICAL** (Hazard H-5). Multi-key JWKS endpoint that
 *     serves current + previous RS256 public key during 90-day rotation
 *     window. Aligned with Next.js JWKS endpoint pattern. Strict PEM
 *     header validation prevents private-key-pasted-as-public misconfig
 *     (see Apr 8 2026 soak rotation incident in JWT_KEY_ROTATION_GUIDE.md).
 *     `/oauth/jwks.json` and `/mcp/jwks.json` aliases were dropped in
 *     Phase 0.6 (zero hits in 14-day nginx logs).
 *
 *   R4 — `app.get(['/.well-known/oauth-protected-resource', '+/mcp variants'])`:
 *     RFC 8707 + RFC 9728 protected-resource metadata. Returns 200 (not
 *     401) per Wei Ming T.'s recommendation — Claude Web gets confused
 *     by 401 here.
 *
 *   R5 — `app.get(['/.well-known/oauth-authorization-server', '+4 variants'])`:
 *     RFC 8414 OAuth 2.0 discovery. 5 surviving path variants for Gemini
 *     CLI + ChatGPT routing quirks. 3 `/.well-known/openid-configuration`
 *     variants dropped in Phase 0.6.
 *
 * Dependencies (RouteContext fields used):
 *   - `ctx.app`    — route registration target
 *   - `ctx.logger` — operational logging
 *   (authLogger is imported directly — auth-specific logger used by R3 JWKS
 *    matches pre-extraction pattern)
 *
 * @see lib/mcp/server/routes/route-context.ts (DI contract)
 * @see cline_docs/reviews/express-routes-extraction-2026-05-21/express-routes-extraction-plan-v2.md Phase 6.3
 * @see .claude/knowledge/JWT_KEY_ROTATION_GUIDE.md (Apr 8 2026 soak rotation lesson)
 */

import type { Request, Response, NextFunction } from 'express';
import type { RouteContext } from './route-context';
import * as crypto from 'crypto';
import { MCP_SCOPES, GITHUB_SCOPES, OIDC_SCOPES } from '../../../auth/auth-constants';
import { PUBLIC_BASE_URL, MCP_FRONTDOOR_AUDIENCE } from '../../../auth/public-base-url';
import { getCurrentKid } from '../../../auth/jwt-key-store';

// authLogger — auth-specific logger used by R3 JWKS. mcp-logger.js exports
// CommonJS module.exports = { authLogger, ... }; use default-import + destructure
// so TypeScript accepts the CJS shape.
import mcpLogger from '../mcp-logger';
const { authLogger } = mcpLogger as { authLogger: { error: (...a: unknown[]) => void; info: (...a: unknown[]) => void; fatal: (...a: unknown[]) => void; warn: (...a: unknown[]) => void } };

/**
 * Register all 4 OAuth discovery routes in declaration order.
 *
 * Per Plan v2 D9: B1 is registered FIRST because the Link-header
 * middleware must apply to ALL /mcp responses (including R11 POST /mcp
 * which is registered later by oauth-flow-routes + mcp-transport-routes).
 *
 * R3/R4/R5 are stateless GET endpoints — their relative order doesn't
 * matter functionally, but is preserved exactly to match Plan v2's
 * verbatim-preservation invariant + Test 1's app.use SEQUENCE assertion.
 */
export function registerOAuthDiscoveryRoutes(ctx: RouteContext): void {
  registerLinkHeaderMiddleware(ctx);  // B1
  registerJWKSEndpoint(ctx);          // R3 — SECURITY-CRITICAL
  registerProtectedResourceMetadata(ctx);  // R4
  registerAuthorizationServerMetadata(ctx);  // R5
}

// ─────────────────────────────────────────────────────────────────────
// B1 — /mcp Link header middleware
//
// FIX 1 (Dec 13, 2025): Claude Desktop reads RFC 9728 Link header on
// /mcp responses to trigger OAuth discovery. Injects on every /mcp
// response (path-scoped middleware via app.use).
// ─────────────────────────────────────────────────────────────────────
function registerLinkHeaderMiddleware(ctx: RouteContext): void {
  ctx.app.use('/mcp', (_req: Request, res: Response, next: NextFunction) => {
    const resourceMetadataUrl = `${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`;
    res.setHeader('Link', `<${resourceMetadataUrl}>; rel="oauth-protected-resource"`);
    res.setHeader('Access-Control-Expose-Headers', 'Link, WWW-Authenticate, MCP-Session-Id');
    next();
  });
}

// ─────────────────────────────────────────────────────────────────────
// R3 — JWKS endpoint (security-critical, Hazard H-5)
//
// INVARIANTS (preserve verbatim — these are the 7 branches sec-ops C4
// requires explicit test coverage for):
//   1. JWT_PUBLIC_KEY_BASE64 missing → 500 'JWKS not configured'
//   2. Single-key (no PREV env) → 1-element keys[] array
//   3. Multi-key (current + previous) → 2-element keys[] array
//   4. Previous key with past expiry → filtered out
//   5. Previous key with invalid expiry string → filtered + error logged
//   6. All keys expired/filtered → 500 'No active JWT keys available'
//   7. Private key pasted as public → throws (caught + 500) with explicit
//      error log naming the env var
// ─────────────────────────────────────────────────────────────────────
function registerJWKSEndpoint(ctx: RouteContext): void {
  ctx.app.get([
    '/.well-known/jwks.json',
    '/mcp/.well-known/jwks.json',
  ], (_req: Request, res: Response) => {
    try {
      const publicKeyBase64 = process.env.JWT_PUBLIC_KEY_BASE64;
      if (!publicKeyBase64) {
        authLogger.error('JWT_PUBLIC_KEY_BASE64 not configured for JWKS');
        return res.status(500).json({ error: 'JWKS not configured' });
      }

      interface KeyEntry {
        kid: string;
        publicKeyBase64: string;
        expiresAt: string | null;
      }
      const allKeys: KeyEntry[] = [];

      // Current key (always present)
      allKeys.push({
        kid: getCurrentKid(),
        publicKeyBase64,
        expiresAt: null,
      });

      // Previous key (present during rotation window)
      if (process.env.JWT_PUBLIC_KEY_PREV_BASE64 && process.env.JWT_KEY_ID_PREV) {
        allKeys.push({
          kid: process.env.JWT_KEY_ID_PREV,
          publicKeyBase64: process.env.JWT_PUBLIC_KEY_PREV_BASE64,
          expiresAt: process.env.JWT_KEY_PREV_EXPIRES || null,
        });
      }

      // Filter expired keys (aligned with Next.js JWKS endpoint pattern)
      const activeKeys = allKeys.filter((key) => {
        if (!key.expiresAt) return true;
        const expiryDate = new Date(key.expiresAt);
        if (isNaN(expiryDate.getTime())) {
          authLogger.error({ kid: key.kid, expiresAt: key.expiresAt }, 'JWKS: invalid expiry date on key');
          return false;
        }
        return expiryDate > new Date();
      });

      // Safety: Never return empty JWKS
      if (activeKeys.length === 0) {
        authLogger.fatal({ keyCount: allKeys.length }, 'JWKS: no active keys available after filtering');
        return res.status(500).json({ error: 'No active JWT keys available' });
      }

      // Convert all active keys to JWK format
      // Strict PEM-header validation. Node's crypto.createPublicKey() will
      // silently accept a PRIVATE key PEM and extract the public half, which
      // masks misconfiguration (e.g. pasting private-key bytes into the
      // JWT_PUBLIC_KEY_*_BASE64 secret slot). The April 8 2026 soak rotation
      // hit exactly this. Better to fail loud here so misconfig is caught
      // on both channels.
      const jwks = activeKeys.map((key) => {
        const publicKeyPEM = Buffer.from(key.publicKeyBase64, 'base64').toString('utf8');

        if (!publicKeyPEM.includes('-----BEGIN PUBLIC KEY-----')) {
          const pemHeader = publicKeyPEM.split('\n')[0] || '<empty>';
          authLogger.error({
            kid: key.kid,
            pemHeader,
            envVar: key.kid === getCurrentKid()
              ? 'JWT_PUBLIC_KEY_BASE64'
              : 'JWT_PUBLIC_KEY_PREV_BASE64',
          }, 'JWKS: public key env var does not contain a PUBLIC KEY PEM (did you paste a private key?)');
          throw new Error(`JWKS: invalid public key PEM for kid ${key.kid} — expected "BEGIN PUBLIC KEY", got "${pemHeader}"`);
        }

        const keyObj = crypto.createPublicKey(publicKeyPEM);
        const jwk = keyObj.export({ format: 'jwk' }) as Record<string, unknown>;

        jwk.use = 'sig';
        jwk.kid = key.kid;
        jwk.alg = 'RS256';

        return jwk;
      });

      authLogger.info({ keyCount: jwks.length, kids: jwks.map((k) => k.kid) }, 'Serving JWKS public keys');

      // Return standard JWKS format with cache headers (aligned with Next.js endpoint)
      res.set('Cache-Control', 'public, max-age=86400');
      res.json({ keys: jwks });
    } catch (error) {
      // Task #156 (2026-05-21): sanitize error.message — was leaking internal
      // crypto error details to clients. Full error logged server-side via pino.
      authLogger.error({ err: error }, 'Error serving JWKS');
      res.status(500).json({ error: 'JWKS generation failed' });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// R4 — OAuth protected-resource metadata (RFC 8707 + RFC 9728)
//
// Returns 200 (NOT 401) per Wei Ming T.'s recommendation — Claude Web
// gets confused by 401 on this endpoint. Dec 9, 2025: reverted to 200
// (was briefly 401, didn't help Claude Desktop either).
// ─────────────────────────────────────────────────────────────────────
function registerProtectedResourceMetadata(ctx: RouteContext): void {
  ctx.app.get([
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
    '/mcp/.well-known/oauth-protected-resource',
  ], (_req: Request, res: Response) => {
    // OAuth metadata endpoints need CORS * for Claude Desktop discovery
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(200).json({
      resource: MCP_FRONTDOOR_AUDIENCE,  // RFC 9728 — the same string the verifier accepts + D11 falls back to
      authorization_servers: [PUBLIC_BASE_URL],
      scopes_supported: MCP_SCOPES,
      bearer_methods_supported: ['header'],
      resource_documentation: `${PUBLIC_BASE_URL}/docs/mcp`,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// R5 — OAuth Authorization Server Metadata (RFC 8414)
//
// 5 path variants required by Gemini CLI + ChatGPT routing. Per Plan v2
// I11 (oauth-multi-client I-1 fold): test plan asserts verbatim sorted-
// array equality on this app.get([...paths]) list.
//
// /.well-known/openid-configuration RE-ADDED 2026-05-26: OpenAI's ChatGPT
// connector now probes OIDC discovery and ABORTS on a 404 — verified in prod
// (two ChatGPT connector setups died at GET /.well-known/openid-configuration
// → 404; Claude/Gemini use oauth-authorization-server and were unaffected).
// Our metadata is already a valid OIDC discovery document, so the same handler
// serves both. (Originally dropped in Phase 0.6 on a "zero hits in 14 days"
// basis that no longer holds now that OpenAI changed the connector flow.)
// ─────────────────────────────────────────────────────────────────────
function registerAuthorizationServerMetadata(ctx: RouteContext): void {
  ctx.app.get([
    '/.well-known/oauth-authorization-server',
    '/mcp/.well-known/oauth-authorization-server',
    '/oauth/.well-known/oauth-authorization-server',  // Gemini CLI expects this path
    '/.well-known/oauth-authorization-server/mcp',  // ChatGPT appends /mcp to well-known paths
    '/.well-known/oauth-protected-resource/mcp',  // ChatGPT RFC 8707 protected resource discovery
    '/.well-known/openid-configuration',  // OpenAI/ChatGPT connector OIDC discovery probe (404 here aborted setup)
    '/mcp/.well-known/openid-configuration',
    '/.well-known/openid-configuration/mcp',
  ], (_req: Request, res: Response) => {
    // OAuth discovery endpoints publicly accessible from any origin per OAuth 2.0 spec
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.json({
      issuer: PUBLIC_BASE_URL,  // RFC 8414 §3.3: MUST equal the origin this document is served from
      // OAuth endpoints routed by nginx to MCP server
      authorization_endpoint: `${PUBLIC_BASE_URL}/oauth/authorize`,
      token_endpoint: `${PUBLIC_BASE_URL}/oauth/token`,
      // FIRST-PARTY TOKEN FIX: JWKS URI so ChatGPT can verify our token signatures
      jwks_uri: `${PUBLIC_BASE_URL}/mcp/.well-known/jwks.json`,  // path stays /mcp/… — root /.well-known/jwks.json is 404 behind nginx
      // 2026-05-26: userinfo_endpoint REMOVED. It pointed at
      // https://graph.microsoft.com/oidc/userinfo, which rejects our first-party
      // `pac_` tokens (they aren't Graph tokens). OpenAI's connector docs confirm
      // token verification is JWT-claims-based and userinfo is NOT required; OIDC
      // Discovery treats userinfo_endpoint as RECOMMENDED, not required. A broken
      // advertised endpoint is worse than its absence. If a real userinfo is ever
      // needed, implement a same-origin /oauth/userinfo that accepts pac_ tokens.
      // Registration endpoint routed by nginx to MCP server
      registration_endpoint: `${PUBLIC_BASE_URL}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],  // S256-only (drop downgrade-able 'plain'; prod = 100% S256)
      scopes_supported: [
        ...MCP_SCOPES,
        ...GITHUB_SCOPES,
        ...OIDC_SCOPES,
      ],
      // Include 'none' for public client support (Gemini CLI)
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      claims_supported: ['sub', 'email', 'email_verified', 'name', 'preferred_username'],
      service_documentation: `${PUBLIC_BASE_URL}/docs/oauth`,
      ui_locales_supported: ['en'],
      claims_parameter_supported: false,
      request_parameter_supported: false,
      request_uri_parameter_supported: false,
      require_request_uri_registration: false,
      op_policy_uri: `${PUBLIC_BASE_URL}/privacy`,
      op_tos_uri: `${PUBLIC_BASE_URL}/terms`,
    });
  });
}
