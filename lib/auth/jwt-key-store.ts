/**
 * JWT Key Store — single source of truth for RS256 public key lookup by kid.
 *
 * Pre-Phase 3.0b state (the bug this module fixes — SEC-C2 from AuthManager v2 review):
 *   - `token-manager.ts:getPublicKey()` loaded ONLY `JWT_PUBLIC_KEY_BASE64`
 *   - Inline RS256 verifier in `mcp-server-http-clean.js:createAuthMiddleware` did the same
 *   - But the JWKS endpoint at `mcp-server-http-clean.js` SERVES BOTH current and previous keys
 *     during the rotation window
 *   - Result: published-vs-accepted asymmetry — external services could fetch the previous
 *     key from JWKS, sign requests with it, and we would REJECT those requests
 *
 * Post-Phase 3.0b state (this module):
 *   - Both verifiers look up keys by kid via `getPublicKeyPEM(kid)` here
 *   - Loads current + previous keys, filters expired previous keys (mirrors JWKS endpoint logic)
 *   - Asserts current.kid !== previous.kid (collision prevention)
 *   - Throws on missing/malformed kid (no fallback to current key — attacker bypass)
 *   - Refuses non-RS256 algorithms at the verifier callsite
 *
 * Edge cases handled (per sec-ops round-2 review):
 *   1. `kid` header missing/malformed → caller throws immediately, no fallback
 *   2. `kid` collision (current === previous) → fail-fast at load time
 *   3. Race during rotation → re-read env on cache miss
 *   4. `JWT_KEY_PREV_EXPIRES` enforcement → mirrors JWKS endpoint filter
 *   5. Algorithm pinning — `algorithms: ['RS256']` enforced at consumer callsites
 *
 * @module lib/auth/jwt-key-store
 */

import { authLogger } from '../mcp/server/mcp-logger';

interface KeyEntry {
  kid: string;
  publicKeyPEM: string;
  expiresAt: Date | null;
}

/**
 * Module-level cache. Invalidated implicitly on cache miss + re-read of env.
 * Multi-key support: indexed by kid.
 */
let keyCache: Map<string, KeyEntry> | null = null;

/**
 * Default kid used ONLY when JWT_KEY_ID is unset (dev convenience — prod always
 * sets it explicitly via production-deploy.yml secrets).
 *
 * ROTATION: bump this literal on each 90-day key rotation (next ~2026-10-20) —
 * see JWT_KEY_ROTATION_GUIDE.md. This is the SINGLE source of the default;
 * before 2026-06-11 the literal was duplicated at 6 call sites and had gone
 * one rotation stale ('paichart-2026-01' while prod served 'paichart-2026-04').
 */
export const DEFAULT_JWT_KEY_ID = 'paichart-2026-07';

let warnedDefaultKid = false;

/**
 * Current signing-key kid: env override, else DEFAULT_JWT_KEY_ID.
 *
 * Single source of truth for every mint/JWKS/key-store site. Warns once when
 * the fallback engages — a missing JWT_KEY_ID stays internally consistent
 * (mint, JWKS, and verify all share this value, so kid labels match
 * end-to-end), but it should never happen in prod, so make it visible.
 */
export function getCurrentKid(): string {
  const kid = process.env.JWT_KEY_ID;
  if (kid) return kid;
  if (!warnedDefaultKid) {
    warnedDefaultKid = true;
    authLogger.warn(
      { defaultKid: DEFAULT_JWT_KEY_ID },
      '[jwt-key-store] JWT_KEY_ID unset — falling back to DEFAULT_JWT_KEY_ID (dev only; prod must set JWT_KEY_ID)'
    );
  }
  return DEFAULT_JWT_KEY_ID;
}

function decodePublicKeyPEM(base64: string): string {
  const pem = Buffer.from(base64, 'base64').toString('utf8');
  if (!pem.includes('-----BEGIN PUBLIC KEY-----')) {
    const pemHeader = pem.split('\n')[0] || '<empty>';
    throw new Error(
      `[jwt-key-store] base64 does not decode to a PUBLIC KEY PEM — got header "${pemHeader}". ` +
        'Did you paste a private key into JWT_PUBLIC_KEY_*_BASE64?'
    );
  }
  return pem;
}

/**
 * Load keys from env vars into the cache. Idempotent — safe to call on every
 * cache miss for race-during-rotation handling.
 *
 * Throws on:
 *   - Missing JWT_PUBLIC_KEY_BASE64 (no current key)
 *   - kid collision (current === previous)
 *   - Malformed PEM (private key in public slot)
 *
 * Silently skips: expired previous keys (per JWKS endpoint filter).
 */
function loadKeys(): Map<string, KeyEntry> {
  const cache = new Map<string, KeyEntry>();

  // Current key (required)
  const currentBase64 = process.env.JWT_PUBLIC_KEY_BASE64;
  if (!currentBase64) {
    throw new Error('[jwt-key-store] JWT_PUBLIC_KEY_BASE64 environment variable not set');
  }
  const currentKid = getCurrentKid();
  const currentPEM = decodePublicKeyPEM(currentBase64);
  cache.set(currentKid, { kid: currentKid, publicKeyPEM: currentPEM, expiresAt: null });

  // Previous key (optional — set by rotation procedure)
  const prevBase64 = process.env.JWT_PUBLIC_KEY_PREV_BASE64;
  const prevKid = process.env.JWT_KEY_ID_PREV;
  if (prevBase64 && prevKid) {
    // Collision check — current and previous kid MUST differ
    if (prevKid === currentKid) {
      throw new Error(
        `[jwt-key-store] kid collision: JWT_KEY_ID and JWT_KEY_ID_PREV are both "${currentKid}". ` +
          'Rotation procedure must assign distinct kids to current and previous keys.'
      );
    }

    // Expiry filter — mirrors JWKS endpoint logic
    const expiresAtRaw = process.env.JWT_KEY_PREV_EXPIRES;
    let expiresAt: Date | null = null;
    if (expiresAtRaw) {
      const parsed = new Date(expiresAtRaw);
      if (isNaN(parsed.getTime())) {
        authLogger.error(
          { prevKid, expiresAtRaw },
          '[jwt-key-store] JWT_KEY_PREV_EXPIRES is not a valid date — skipping previous key'
        );
        // Skip the key entirely if its expiry is malformed
        authLogger.info({ kids: [currentKid], keyCount: 1 }, '[jwt-key-store] Keys loaded (previous skipped — malformed expiry)');
        return cache;
      }
      expiresAt = parsed;
      if (expiresAt <= new Date()) {
        authLogger.info(
          { prevKid, expiresAt: expiresAt.toISOString() },
          '[jwt-key-store] Previous key has expired — not loaded'
        );
        authLogger.info({ kids: [currentKid], keyCount: 1 }, '[jwt-key-store] Keys loaded (previous expired)');
        return cache;
      }
    }

    const prevPEM = decodePublicKeyPEM(prevBase64);
    cache.set(prevKid, { kid: prevKid, publicKeyPEM: prevPEM, expiresAt });
  }

  authLogger.info(
    { kids: Array.from(cache.keys()), keyCount: cache.size },
    '[jwt-key-store] Keys loaded'
  );
  return cache;
}

/**
 * Get the PEM string for a given kid. Caches keys after first call;
 * on cache miss, re-reads env (race-during-rotation handling).
 *
 * @param kid — Key ID from the token's protected header. MUST NOT be empty.
 * @throws Error if kid is missing/empty, or if no matching key is loaded.
 */
export function getPublicKeyPEM(kid: string): string {
  if (!kid || typeof kid !== 'string') {
    throw new Error(`[jwt-key-store] kid required for key lookup — got ${JSON.stringify(kid)}`);
  }

  // First try the cache
  if (!keyCache) {
    keyCache = loadKeys();
  }

  let entry = keyCache.get(kid);
  if (!entry) {
    // Cache miss — re-read env (race-during-rotation handling).
    // Reloading is idempotent and safe; the new cache replaces the old.
    authLogger.warn({ kid }, '[jwt-key-store] kid cache miss — re-reading env in case of rotation');
    keyCache = loadKeys();
    entry = keyCache.get(kid);
  }

  if (!entry) {
    const knownKids = Array.from(keyCache.keys());
    throw new Error(
      `[jwt-key-store] no public key for kid "${kid}" — known kids: [${knownKids.join(', ')}]`
    );
  }

  return entry.publicKeyPEM;
}

/**
 * Test-only: clear the cache. Used by unit tests that mutate env between tests.
 * Not exposed via the package's public API surface.
 */
export function __resetKeyCacheForTests(): void {
  keyCache = null;
}
