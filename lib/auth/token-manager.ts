import { SignJWT, jwtVerify, decodeJwt, decodeProtectedHeader, importPKCS8, importSPKI, type KeyLike } from 'jose';
import { randomBytes } from 'crypto';
import { config } from '@/lib/config';
import { authLogger } from '@/lib/logger';
import { UserRole } from '@/lib/types/auth';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { getPublicKeyPEM, getCurrentKid } from '@/lib/auth/jwt-key-store';
import { JWT_ISSUER, API_AUDIENCE, LEGACY_AUDIENCES } from '@/lib/auth/public-base-url';

// U2 Phase F.2 (2026-05-19, sec-ops Important-1): mint rate limit.
// Per-user 100 mints/minute. With per-call mints at every workflow step + every
// internal API call, a misbehaving client (or compromised account) could trigger
// thousands of RSA-signs per minute. 100/min/user is generous for legitimate
// workflows (typical: 1-10) while blocking pathological cases.
const MINT_RATE_LIMIT_PER_MINUTE = 100;
const MINT_RATE_LIMIT_WINDOW_MS = 60_000;

// U2 Phase F.5 (2026-05-19, sec-ops Important-4): log volume sampling escape valve.
// PAICHART_MCP_MINT_LOG_SAMPLE_RATE env var (default 1.0; can be lowered to e.g.
// 0.1 for 10% sampling during high-traffic periods). Only sampled for
// per-call-forward mints — oauth-callback / refresh mints always logged at info.
function getMintLogSampleRate(): number {
  const raw = process.env.PAICHART_MCP_MINT_LOG_SAMPLE_RATE;
  if (!raw) return 1.0;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 1.0;
  return parsed;
}

// BC48 FIX: Runtime enum validation for JWT role claims (prevents `as UserRole` bypass)
const VALID_ROLES = Object.values(UserRole);
function validateRole(role: unknown): UserRole {
  if (typeof role !== 'string' || !VALID_ROLES.includes(role as UserRole)) {
    throw new Error(`Invalid role claim: ${String(role)}`);
  }
  return role as UserRole;
}

// TokenPayload exposes only {userId, email, role}. `provider` and `isDemoUser`
// are derived inline from role, never JWT claims (U2 Path B v3 2026-05-18).
interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

// HS256 secrets removed 2026-05-28 (Step 2): the legacy HS256 session + refresh
// verify branches that consumed these were deleted. Session/refresh tokens are
// RS256-only post the 2026-01-21 cutover. As of 2026-06-04 api keys also mint
// RS256 (via mintMcpToken) — there are NO HS256 token mint/verify sites left.
// Followup: cline_docs/follow-ups/hs256-verify-surface-hardening-2026-05-28.md

// RS256 keys (Phase 2 - Public Key Cryptography)
// Loaded lazily from environment variables
let privateKey: KeyLike | null = null;
// Phase 3.0b (2026-05-20): multi-key cache — kid → imported KeyLike.
// Replaces the single `publicKey` cache to fix the JWKS published-vs-accepted
// asymmetry (SEC-C2 from AuthManager v2 review). Raw PEM lookup is delegated
// to `lib/auth/jwt-key-store.ts` which handles env loading, expiry, and
// collision detection in one place.
const publicKeyCache = new Map<string, KeyLike>();

/**
 * Get RSA private key for RS256 signing
 * Keys are cached after first load for performance
 */
async function getPrivateKey(): Promise<KeyLike> {
  if (!privateKey) {
    try {
      const privateKeyBase64 = process.env.JWT_PRIVATE_KEY_BASE64;
      if (!privateKeyBase64) {
        throw new Error('JWT_PRIVATE_KEY_BASE64 environment variable not set');
      }

      const privateKeyPEM = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
      privateKey = await importPKCS8(privateKeyPEM, 'RS256');
      authLogger.info({ alg: 'RS256' }, 'RSA private key loaded');
    } catch (error) {
      authLogger.error({ err: error, alg: 'RS256' }, 'Failed to load RS256 private key');
      throw new Error('Failed to initialize RS256 signing - check JWT_PRIVATE_KEY_BASE64 environment variable');
    }
  }
  return privateKey;
}

/**
 * Get RSA public key for RS256 verification — multi-key by kid.
 *
 * Phase 3.0b (2026-05-20): replaces single-key cache. Looks up PEM via
 * `lib/auth/jwt-key-store.ts` (single source of truth shared with the inline
 * verifier in `mcp-server-http-clean.js`). The keystore handles:
 *   - current + previous key loading from env
 *   - kid collision detection at load time
 *   - JWT_KEY_PREV_EXPIRES filtering
 *   - cache miss → env re-read (race-during-rotation handling)
 *
 * Throws if kid is missing or doesn't match a loaded key.
 */
async function getPublicKey(kid: string): Promise<KeyLike> {
  let cached = publicKeyCache.get(kid);
  if (!cached) {
    const pem = getPublicKeyPEM(kid);  // throws if kid not found
    cached = await importSPKI(pem, 'RS256');
    publicKeyCache.set(kid, cached);
    authLogger.info({ alg: 'RS256', kid }, 'RSA public key imported into verifier cache');
  }
  return cached;
}

/**
 * Sign access token using RS256 (Phase 2)
 *
 * Uses RSA public key cryptography so external services can validate tokens
 * via JWKS endpoint without requiring a shared secret.
 */
export async function signAccessToken(payload: TokenPayload): Promise<string> {
  try {
    const key = await getPrivateKey();
    const keyId = getCurrentKid();

    const jwt = new SignJWT({
      ...payload,
      sub: payload.userId // Set sub claim to userId for JWT standard
    })
      .setProtectedHeader({ alg: 'RS256', kid: keyId })
      .setIssuer(JWT_ISSUER)
      .setAudience(API_AUDIENCE)  // Component 5: Resource-specific audience (RFC 8707); derived from APP_BASE_URL
      .setExpirationTime(`${(parseInt(config.jwt.accessExpiration, 10) || 15) * 60}s`) // Convert minutes to seconds
      .setIssuedAt();

    const token = await jwt.sign(key);
    authLogger.debug({ kid: keyId, alg: 'RS256', userId: payload.userId }, 'Access token signed');

    return token;
  } catch (error) {
    authLogger.error({ err: error }, 'Failed to sign access token');
    throw error;
  }
}

/**
 * Sign refresh token using RS256 (Phase 2)
 *
 * Uses RSA public key cryptography for consistency with access tokens.
 */
export async function signRefreshToken(payload: TokenPayload): Promise<string> {
  const key = await getPrivateKey();
  const keyId = getCurrentKid();

  return await new SignJWT({
    ...payload,
    sub: payload.userId // Set sub claim to userId for JWT standard
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(JWT_ISSUER)
    .setAudience(API_AUDIENCE)  // Component 5: Resource-specific audience (RFC 8707); derived from APP_BASE_URL
    .setExpirationTime(`${(parseInt(config.jwt.refreshExpiration, 10) || 7) * 24 * 60 * 60}s`) // Convert days to seconds
    .setIssuedAt()
    // jti makes every refresh token byte-unique. Without it, two tokens for the
    // same user minted within the same iat second are IDENTICAL strings — a
    // BC36 rotation in the same second as issuance then replaces the row with
    // the same token value, making one-time-use vacuous for that window
    // (found 2026-06-13 by test-refresh-race: login + rotation in one second).
    .setJti(randomBytes(16).toString('hex'))
    .sign(key);
}

/**
 * Generate tokens
 */
export async function generateTokens(payload: TokenPayload): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload),
  ]);

  return {
    accessToken,
    refreshToken,
  };
}

export type MintPurpose = 'oauth-callback' | 'refresh' | 'per-call-forward' | 'api-key';

/**
 * Options for minting a first-party MCP access token.
 *
 * NOTE on contract asymmetry with TokenPayload (verifier shape) — addresses
 * boundary-contract I2:
 *   MintMcpTokenOptions includes `audience`, `scope`, `azp`, `ttlSeconds`,
 *   `purpose` — minter inputs that determine the JWT claims and log routing.
 *   TokenPayload (verifier output) projects to {userId, email, role} —
 *   verifier outputs the application layer reads. Verifier intentionally
 *   narrows claims to the safe surface; audience is enforced as a constraint
 *   (not surfaced as a claim consumers act on).
 */
export interface MintMcpTokenOptions {
  userId: string;
  email: string;
  role: UserRole;
  scope: string;
  audience: string;          // Required — per-service per RFC 8707, no implicit default
  azp?: string;              // Authorized party (client_id) for client binding
  ttlSeconds?: number;       // Default 900 (15 min)
  jti?: string;              // Auto-generated if absent
  purpose?: MintPurpose;     // Drives log level (per-call-forward → debug, others → info)
}

/**
 * Mint a first-party MCP token for a specific audience (resource).
 *
 * Phase A consolidation (U2 audience-tightening v3.1): canonical home for MCP
 * token minting. Replaces the inline jsonwebtoken-based implementation that
 * previously lived at mcp-server-http-clean.js:1127-1172.
 *
 * Use cases:
 * - 'oauth-callback'   — initial mint at OAuth callback (info-level log)
 * - 'refresh'          — minted at refresh-token grant (info-level log)
 * - 'per-call-forward' — minted per workflow step (debug-level log; high volume)
 *
 * Snowflake compatibility: scope gets `session:role-any` appended (if not
 * already present) so Snowflake External OAuth uses the user's default role
 * without scope-based filtering.
 *
 * Audience: REQUIRED. Per RFC 8707, each downstream resource gets a
 * resource-specific audience. No implicit default — callsites must specify.
 */
export async function mintMcpToken(opts: MintMcpTokenOptions): Promise<string> {
  if (!opts.audience) {
    throw new Error('mintMcpToken requires audience (per-service per RFC 8707; no implicit default)');
  }

  // U2 Phase F.2 (sec-ops Important-1): rate limit before any RSA-sign work.
  // Key is namespaced by 'mint:' prefix to avoid collisions with HTTP rate limits.
  // api-key mints are rare, deliberate admin/self-service actions — separate bucket
  // so they don't share the per-call-forward mint quota (2026-06-04, sec-ops I1).
  const rateLimitNs = opts.purpose === 'api-key' ? 'apikey-mint' : 'mint';
  const rateLimitResult = checkRateLimit(`${rateLimitNs}:${opts.userId}`, MINT_RATE_LIMIT_PER_MINUTE, MINT_RATE_LIMIT_WINDOW_MS);
  if (!rateLimitResult.allowed) {
    const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
    authLogger.warn(
      { userId: opts.userId, audience: opts.audience, purpose: opts.purpose, retryAfter },
      'mint_rate_limit_exceeded'
    );
    throw new Error(
      `mint_rate_limit_exceeded: ${MINT_RATE_LIMIT_PER_MINUTE} mints per ${MINT_RATE_LIMIT_WINDOW_MS / 1000}s per user (retry after ${retryAfter}s)`
    );
  }

  const baseScope = opts.scope || 'user:email';
  const finalScope = baseScope.includes('session:role')
    ? baseScope
    : `${baseScope} session:role-any`;

  const ttlSeconds = opts.ttlSeconds ?? 900;
  const jti = opts.jti ?? randomBytes(16).toString('hex');
  const keyId = getCurrentKid();

  const key = await getPrivateKey();

  const signer = new SignJWT({
    scope: finalScope,
    azp: opts.azp,
    email: opts.email,
    role: opts.role,
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(JWT_ISSUER)
    .setAudience(opts.audience)
    .setSubject(String(opts.userId))
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`);

  const token = await signer.sign(key);

  // U2 Phase F.5 (sec-ops Important-4): sample per-call-forward logs.
  // Volume modeling: per-call mint scales with workflow steps (~10-100/req).
  // info-level mints (oauth-callback / refresh) always log; per-call-forward
  // (debug) can be sampled when traffic is high without losing operational signal.
  const isPerCall = opts.purpose === 'per-call-forward';
  const shouldLog = !isPerCall || Math.random() < getMintLogSampleRate();
  if (shouldLog) {
    const logLevel = isPerCall ? 'debug' : 'info';
    authLogger[logLevel]({
      userId: opts.userId,
      email: opts.email,
      role: opts.role,
      scope: finalScope,
      audience: opts.audience,
      azp: opts.azp,
      jti,
      purpose: opts.purpose ?? 'unspecified',
      ttl: ttlSeconds,
      kid: keyId,
      algorithm: 'RS256',
    }, 'Minted first-party MCP token');
  }

  return token;
}

/**
 * Verify access token (RS256-only since 2026-05-28).
 *
 * STATELESS for all tokens EXCEPT api-key-scoped tokens (scope contains
 * 'api-key'), which incur exactly ONE revocation + fresh-role DB read
 * (2026-06-04, api-key RS256 migration). Do NOT add per-token DB reads to this
 * path for non-api-key tokens — OAuth/session role-freshness lives in
 * AuthManager and preserves the D7 role-cache invariant.
 *
 * 2026-05-18: optional `expectedClientId` parameter restored after specialist
 * review (oauth-multi-client). When provided, enforces `azp === expectedClientId`
 * on RS256 tokens so a token minted for Claude Desktop cannot be presented by
 * ChatGPT or another MCP client. When omitted (default), the check is skipped —
 * existing callers see no behavioural change. New callers that know which
 * client should be presenting the token (MCP route guards, OAuth proxy paths)
 * can opt in by passing the expected client_id.
 *
 * The `azp` claim is already minted into every MCP token by
 * mcp-server-http-clean.js:mintMcpToken; this restores enforcement of the
 * defence-in-depth claim that was removed 2026-04-01 as "dead code".
 */
export async function verifyAccessToken(
  token: string,
  expectedClientId?: string
): Promise<TokenPayload> {
  try {
    // Check if this is RS256 token (decode header without verification)
    const parts = token.split('.');
    let header: { alg?: string; kid?: string } | null = null;
    if (parts.length === 3) {
      // Inner try is SCOPED TO HEADER PARSING ONLY (Task #135 fix, 2026-05-21).
      // Pre-fix bug: this catch wrapped both the header decode AND the full
      // RS256 verification. RS256 failures (kid missing, audience wrong,
      // signature invalid, expired) silently fell through to the HS256 path
      // below — which then passed a Uint8Array secret to jose with an
      // RS256-signed token, throwing a confusing TypeError. Caught by Wave 4
      // Phase 4.3 shadow validation (10 events during reconnect window).
      //
      // Fix: parse the header here, then ESCAPE this try block. RS256
      // verification runs outside the inner try so its errors propagate to
      // the outer catch (line ~408) and get the clear "Invalid token" error,
      // NOT a silent retry with the wrong key shape.
      try {
        const headerB64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
        const headerJson = atob(headerB64);
        header = JSON.parse(headerJson);
      } catch (decodeError) {
        // Header parse failed — not a valid JWT shape; fall through to HS256
        // (legitimate fall-through: HS256 path will reject it cleanly)
        header = null;
      }
    }

    // RS256 verification — OUTSIDE the header-parse try block so failures
    // propagate to the outer catch instead of silently falling through.
    if (header && header.alg === 'RS256') {
      // BC55 FIX: RS256 tokens MUST be cryptographically verified — never trust unverified claims.
      // Route handlers run in Node.js runtime (not Edge), so full crypto is available.
      //
      // Phase 3.0b (2026-05-20): kid-based key lookup. Required for multi-key
      // JWKS rotation support (SEC-C2). Token MUST carry a kid in its header;
      // we reject any RS256 token without one (defense-in-depth — prevents
      // attacker omitting kid to force a fallback to current-key path).
      if (!header.kid || typeof header.kid !== 'string') {
        throw new Error('RS256 token missing kid header — required for key rotation');
      }
      const rsaPublicKey = await getPublicKey(header.kid);
      const { payload: decoded } = await jwtVerify(token, rsaPublicKey, {
        algorithms: ['RS256'],  // Refuses alg:none and alg:HS256 (SEC-I8 from round 2)
        issuer: JWT_ISSUER,
        audience: [...LEGACY_AUDIENCES],  // web/API tokens + MCP OAuth tokens — the ONLY inbound accept-list (public-base-url.ts)
      });

      // 2026-05-18: enforce azp (authorized party) when caller provided
      // expectedClientId. Closes the cross-client token-reuse gap.
      // Tokens minted without azp (legacy / non-MCP) skip the check.
      if (expectedClientId) {
        const azp = decoded.azp as string | undefined;
        if (azp && azp !== expectedClientId) {
          authLogger.warn(
            { expectedClientId, actualAzp: azp },
            'RS256 token azp mismatch — cross-client reuse attempt blocked'
          );
          throw new Error('Token azp claim does not match expected client');
        }
      }

      authLogger.debug({ alg: 'RS256' }, 'RS256 token verified');

      const userId = (decoded.sub || decoded.userId) as string;
      const email = decoded.email as string;
      const role = decoded.role;

      if (!userId || !email || !role) {
        throw new Error('Invalid RS256 token payload - missing userId, email, or role');
      }

      // API-key tokens (scope contains 'api-key') incur ONE revocation + fresh-role
      // read here; every other token (OAuth/session) skips it and stays stateless
      // (preserves D7). Gated on the unforgeable, RS256-signed `scope` claim. Matched
      // by substring because mintMcpToken appends ' session:role-any' (2026-06-04).
      const tokenScope = (decoded.scope as string | undefined) ?? '';
      if (tokenScope.split(' ').includes('api-key')) {
        const { ApiKeyService } = await import('@/lib/services/apiKeyService');
        const { role: freshRole } = await ApiKeyService.enforceActiveApiKey(
          userId,
          decoded.jti as string | undefined
        );
        return {
          userId,
          email,
          role: validateRole(freshRole) // fresh role from DB for api-key tokens
        };
      }

      return {
        userId,
        email,
        role: validateRole(role) // BC48 FIX: runtime enum validation
      };
    }

    // RS256-only as of 2026-05-28 (HS256 hardening Step 2 — see followup doc
    // cline_docs/follow-ups/hs256-verify-surface-hardening-2026-05-28.md).
    // The legacy HS256 session verify branch was removed. Session/MCP tokens
    // have been RS256-minted since the 2026-01-21 cutover; with a 15-min access
    // TTL no legitimate unexpired HS256 access token can exist. As of 2026-06-04
    // there are NO HS256 token mints left in the codebase — api keys mint RS256
    // via mintMcpToken (HS256→RS256 migration). Accepting HS256 here was the
    // leaked-JWT_ACCESS_SECRET → forge-any-user (incl. SUPER_ADMIN) surface;
    // removing it closes that path.
    if (header && header.alg && header.alg !== 'RS256') {
      authLogger.warn(
        { alg: header.alg },
        'Non-RS256 access token presented — rejected (HS256 acceptance removed 2026-05-28)'
      );
    }
    throw new Error('Unsupported token algorithm — only RS256 is accepted');
  } catch (error) {
    // A failed access-token verification is an EXPECTED client outcome (bad alg,
    // expired token, bad signature, malformed) → a 401, not a server fault.
    // Logging it at `error` floods the error stream and masks real faults — e.g.
    // every api-key request hits this RS256-only path first and fails before the
    // apiKeyService.validateApiKey fallback succeeds (~500+/day from the health
    // monitor alone). Right-size to `warn`: still fully logged and queryable for
    // security review, but not error-level. Genuine JWKS/key-fetch faults have a
    // dedicated monitor (scripts/monitor-jwks-health.sh) and surface separately.
    authLogger.warn({ err: error }, 'Access token verification failed');
    throw new Error('Invalid token');
  }
}

/**
 * Verify refresh token
 * Supports both HS256 (old tokens) and RS256 (new tokens - Phase 2)
 */
export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  try {
    // Check token algorithm
    const parts = token.split('.');
    const header = JSON.parse(Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

    let verified;
    if (header.alg === 'RS256') {
      // RS256 refresh token — use kid-based key lookup (Phase 3.0b multi-key support).
      // Refresh tokens carry the same kid as the access tokens they were minted alongside.
      if (!header.kid || typeof header.kid !== 'string') {
        throw new Error('RS256 refresh token missing kid header — required for key rotation');
      }
      const key = await getPublicKey(header.kid);
      verified = await jwtVerify(token, key, {
        algorithms: ['RS256'],  // Refuses alg:none and alg:HS256
        issuer: JWT_ISSUER,
        audience: [...LEGACY_AUDIENCES],
        maxTokenAge: `${(parseInt(config.jwt.refreshExpiration, 10) || 7) * 24 * 60 * 60}s`, // BC36 FIX: Explicit max age
      });
      authLogger.debug({ alg: 'RS256', kid: header.kid }, 'Refresh token verified');
    } else {
      // RS256-only as of 2026-05-28 (HS256 hardening Step 2 — see followup doc).
      // Legacy HS256 refresh acceptance removed: refresh tokens have been RS256
      // since the 2026-01-21 cutover (7-day TTL → no legitimate unexpired HS256
      // refresh token can exist). Closes the symmetric-secret forgery path.
      authLogger.warn(
        { alg: header.alg },
        'Non-RS256 refresh token presented — rejected (HS256 acceptance removed 2026-05-28)'
      );
      throw new Error('Unsupported refresh token algorithm — only RS256 is accepted');
    }
    
    // Extract userId from either sub or userId field
    const userId = verified.payload.sub || verified.payload.userId;
    const { email, role } = verified.payload;
    
    if (!userId || !email || !role) {
      throw new Error('Invalid token payload');
    }

    return {
      userId: userId as string,
      email: email as string,
      role: validateRole(role) // BC48 FIX: runtime enum validation
    };
  } catch (error) {
    authLogger.error({ err: error }, 'Refresh token verification failed');
    throw new Error('Invalid token');
  }
}

/**
 * Decode token
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const payload = decodeJwt(token);
    
    // Extract userId from either sub or userId field
    const userId = payload.sub || payload.userId;
    const { email, role } = payload;
    
    if (!userId || !email || !role) {
      return null;
    }

    return {
      userId: userId as string,
      email: email as string,
      role: validateRole(role) // BC48 FIX: runtime enum validation
    };
  } catch (error) {
    authLogger.error({ err: error }, 'Token decode failed');
    return null;
  }
}
