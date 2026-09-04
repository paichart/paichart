import { exportJWK, importSPKI } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { jwksLimiter } from '@/lib/middleware/rate-limit';
import { authLogger } from '@/lib/logger';
import { getCurrentKid } from '@/lib/auth/jwt-key-store';

/**
 * JWKS (JSON Web Key Set) Endpoint
 *
 * Returns the public key(s) in JWK format for external services to validate
 * pAIchart JWT tokens without requiring a shared secret.
 *
 * Phase 2: RS256/JWKS Implementation (Single key)
 * Phase 3: Multi-key JWKS Support (Zero-downtime rotation)
 *
 * This enables TEAM_MEMBER trust level token passing to external services
 * and supports zero-downtime key rotation with 7-day overlap period.
 *
 * Security:
 * - Rate limited to 100 requests/minute per IP to prevent DoS attacks
 * - Expired key filtering with validation (P1-5)
 * - Empty JWKS array prevention (P1-9)
 * - Previous key retention for rollback capability (P1-1)
 *
 * @see implementation-plan-v4.2.md - Step 2.4 (Phase 2)
 * @see cline_docs/reviews/phase-3-jwt-enhancements-2026-01-24/implementation-plan.md - Component 1
 * @see .claude/knowledge/JWT_KEY_ROTATION_GUIDE.md - Rotation procedures
 */

interface KeyConfig {
  kid: string;
  publicKeyBase64: string;
  expiresAt?: string; // ISO 8601 date
}

// Force dynamic rendering: route reads request.headers via the rate limiter
// AND reads process.env.JWT_KEY_ID* at request time. Without this, Next.js
// either prerenders the route (baking stale env values into .next/server/app/
// api/auth/jwks.body) or hits DYNAMIC_SERVER_USAGE 500s on first request after
// a rebuild. Discovered during the April 2026 soak rotation — the prerendered
// .body file kept serving the old kid even after env was correctly updated.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // P0-1: Rate limiting to prevent JWKS flooding DoS attack
  const rateLimitResponse = jwksLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse; // 429 Too Many Requests
  }

  try {
    // Phase 3: Build key configuration array (supports multiple keys)
    const allKeys: KeyConfig[] = [
      // Current key (always active)
      {
        kid: getCurrentKid(),
        publicKeyBase64: process.env.JWT_PUBLIC_KEY_BASE64!,
      },
    ];

    // Add previous key if exists (during rotation)
    if (process.env.JWT_PUBLIC_KEY_PREV_BASE64 && process.env.JWT_KEY_ID_PREV) {
      allKeys.push({
        kid: process.env.JWT_KEY_ID_PREV,
        publicKeyBase64: process.env.JWT_PUBLIC_KEY_PREV_BASE64,
        expiresAt: process.env.JWT_KEY_PREV_EXPIRES,
      });
    }

    // Validate current key is configured
    if (!process.env.JWT_PUBLIC_KEY_BASE64) {
      authLogger.error('JWKS: JWT_PUBLIC_KEY_BASE64 not set');
      return NextResponse.json(
        { error: 'JWKS endpoint not configured' },
        { status: 500 }
      );
    }

    // P1-5: Filter expired keys with comprehensive validation
    const activeKeys = allKeys.filter(key => {
      if (!key.expiresAt) return true; // No expiry = always active

      const expiryDate = new Date(key.expiresAt);
      const now = new Date();

      // Validate expiry date format
      if (isNaN(expiryDate.getTime())) {
        authLogger.error({ kid: key.kid, expiresAt: key.expiresAt }, 'JWKS: invalid expiry date');
        return false;
      }

      // Filter expired keys
      return expiryDate > now;
    });

    // Log expired keys for debugging (P1-5)
    const expiredKeys = allKeys.filter(k => !activeKeys.includes(k));
    if (expiredKeys.length > 0) {
      authLogger.info({ expired: expiredKeys.map(k => k.kid) }, 'JWKS: filtered expired keys');
    }

    // P1-9: Prevent empty JWKS array (validation-engine-specialist)
    if (activeKeys.length === 0) {
      authLogger.fatal({ keys: allKeys.map(k => ({ kid: k.kid, expiresAt: k.expiresAt })) }, 'JWKS: no active keys available');

      return new NextResponse('No active JWT keys available', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // Convert all active keys to JWK format
    const jwks = {
      keys: await Promise.all(
        activeKeys.map(async (keyConfig) => {
          const publicKeyPEM = Buffer.from(keyConfig.publicKeyBase64, 'base64').toString('utf8');

          // Strict PEM-header validation. jose's importSPKI already rejects
          // non-public PEMs, but its error message ("spki must be SPKI
          // formatted string") doesn't point at the root cause. Early explicit
          // check produces a log line the operator can act on immediately.
          // Caught during the April 8 2026 soak rotation where private-key
          // bytes were pasted into JWT_PUBLIC_KEY_PREV_BASE64 by mistake.
          if (!publicKeyPEM.includes('-----BEGIN PUBLIC KEY-----')) {
            const pemHeader = publicKeyPEM.split('\n')[0] || '<empty>';
            const envVar = keyConfig.kid === getCurrentKid()
              ? 'JWT_PUBLIC_KEY_BASE64'
              : 'JWT_PUBLIC_KEY_PREV_BASE64';
            authLogger.error({ kid: keyConfig.kid, pemHeader, envVar }, 'JWKS: public key env var does not contain a PUBLIC KEY PEM (did you paste a private key?)');
            throw new Error(`JWKS: invalid public key PEM for kid ${keyConfig.kid} — expected "BEGIN PUBLIC KEY", got "${pemHeader}"`);
          }

          const publicKey = await importSPKI(publicKeyPEM, 'RS256');
          const jwk = await exportJWK(publicKey);

          return {
            ...jwk,
            kid: keyConfig.kid,
            use: 'sig',
            alg: 'RS256',
          };
        })
      )
    };

    authLogger.debug({ count: jwks.keys.length, kids: jwks.keys.map(k => k.kid) }, 'JWKS: returning keys');

    // Return JWKS with long cache headers (24 hours)
    return NextResponse.json(jwks, {
      headers: {
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    authLogger.error({ err: error }, 'JWKS generation error');
    return NextResponse.json(
      { error: 'Failed to generate JWKS' },
      { status: 500 }
    );
  }
}
