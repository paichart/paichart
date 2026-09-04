/**
 * Pre-generated RSA keypair fixtures for AuthManager test suite.
 *
 * Generated at test-suite startup (not committed) — avoids storing private keys
 * in the repo. Cost: ~150ms total for 3 keypairs at suite start. Subsequent
 * test runs in the same process reuse cached keypairs.
 *
 * Per validation-engine round-2 recommendation: scripts/test-auth-manager.ts
 * uses these fixtures to exercise multi-key JWKS (Test 5), azp mismatch
 * (Test 5b), and provider-token rejection (Test 4).
 *
 * Three keypairs:
 *   - current  → kid 'test-current-2026'   (matches `JWT_KEY_ID` env)
 *   - previous → kid 'test-previous-2025'  (matches `JWT_KEY_ID_PREV` env)
 *   - foreign  → kid 'test-foreign'        (NEVER in env — rejection target)
 *
 * @module test/fixtures/test-jwt-keys
 */

import { generateKeyPairSync } from 'crypto';

export interface TestKeyPair {
  kid: string;
  publicKeyPEM: string;
  privateKeyPEM: string;
  /** Base64-encoded PEM for env-var simulation. */
  publicKeyBase64: string;
  privateKeyBase64: string;
}

let cached: { current: TestKeyPair; previous: TestKeyPair; foreign: TestKeyPair } | null = null;

function makeKeyPair(kid: string): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    kid,
    publicKeyPEM: publicKey,
    privateKeyPEM: privateKey,
    publicKeyBase64: Buffer.from(publicKey).toString('base64'),
    privateKeyBase64: Buffer.from(privateKey).toString('base64'),
  };
}

/**
 * Get the test keypair set. Generates on first call (~150ms), cached after.
 */
export function getTestKeys(): { current: TestKeyPair; previous: TestKeyPair; foreign: TestKeyPair } {
  if (!cached) {
    cached = {
      current: makeKeyPair('test-current-2026'),
      previous: makeKeyPair('test-previous-2025'),
      foreign: makeKeyPair('test-foreign'),
    };
  }
  return cached;
}

/**
 * Install current + previous test keys into the process env so the
 * `lib/auth/jwt-key-store` module picks them up. Call BEFORE requiring
 * any module that uses the keystore.
 *
 * Returns a teardown function that restores the previous env values.
 */
export function installTestKeysIntoEnv(): () => void {
  const keys = getTestKeys();
  const saved = {
    pub: process.env.JWT_PUBLIC_KEY_BASE64,
    kid: process.env.JWT_KEY_ID,
    prevPub: process.env.JWT_PUBLIC_KEY_PREV_BASE64,
    prevKid: process.env.JWT_KEY_ID_PREV,
    prevExp: process.env.JWT_KEY_PREV_EXPIRES,
    jwtSecret: process.env.JWT_SECRET,
  };

  process.env.JWT_PUBLIC_KEY_BASE64 = keys.current.publicKeyBase64;
  process.env.JWT_KEY_ID = keys.current.kid;
  process.env.JWT_PUBLIC_KEY_PREV_BASE64 = keys.previous.publicKeyBase64;
  process.env.JWT_KEY_ID_PREV = keys.previous.kid;
  // Previous key valid for 7 days from now
  process.env.JWT_KEY_PREV_EXPIRES = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  // JWT_SECRET ephemeral test value (JWT_ACCESS_SECRET line removed 2026-06-05 — retired)
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-aaaaaaaaaaaa';

  return () => {
    if (saved.pub !== undefined) process.env.JWT_PUBLIC_KEY_BASE64 = saved.pub;
    else delete process.env.JWT_PUBLIC_KEY_BASE64;
    if (saved.kid !== undefined) process.env.JWT_KEY_ID = saved.kid;
    else delete process.env.JWT_KEY_ID;
    if (saved.prevPub !== undefined) process.env.JWT_PUBLIC_KEY_PREV_BASE64 = saved.prevPub;
    else delete process.env.JWT_PUBLIC_KEY_PREV_BASE64;
    if (saved.prevKid !== undefined) process.env.JWT_KEY_ID_PREV = saved.prevKid;
    else delete process.env.JWT_KEY_ID_PREV;
    if (saved.prevExp !== undefined) process.env.JWT_KEY_PREV_EXPIRES = saved.prevExp;
    else delete process.env.JWT_KEY_PREV_EXPIRES;
    if (saved.jwtSecret !== undefined) process.env.JWT_SECRET = saved.jwtSecret;
  };
}
