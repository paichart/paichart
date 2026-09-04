import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { config } from '../../../../lib/config';
import { signAccessToken, signRefreshToken } from '../../../../lib/jwt';
import { prisma } from '../../../../lib/prisma';
import { verifyRefreshToken } from '../../../../lib/jwt';
import { hashRefreshToken } from '../../../../lib/crypto/hashing';
import { authRefreshLimiter } from '@/lib/middleware/rate-limit';
import { authLogger } from '@/lib/logger';

// Single-flight refresh (2026-06-12, refresh-token-race PLAN-v2 §1a):
// concurrent requests presenting the SAME refresh token await one
// validate→rotate→sign pipeline instead of racing the BC36 delete+create
// rotation (losers used to throw P2025 → 401 → "Failed to fetch" banners on
// parallel-fetch pages). Module scope is shared — this route runs in the
// Node runtime (Prisma) inside the single PM2 fork process. Every refresh
// caller (middleware loopback, AuthProvider, multi-tab) funnels through this
// route, so this is the one chokepoint that covers all.
// Entries live only while a rotation is in flight (.finally cleanup), so Map
// size is bounded by concurrent in-flight rotations.
type RotationOutcome =
  | {
      ok: true;
      user: { id: string; email: string; name: string | null; role: string };
      accessToken: string;
      newRefreshToken: string;
      tokenExpiresAt: number;
    }
  | { ok: false; status: number; body: Record<string, unknown> };

const inflightRotations = new Map<string, Promise<RotationOutcome>>();

async function rotateRefreshToken(refreshToken: string): Promise<RotationOutcome> {
  // Verify refresh token
  const decoded = await verifyRefreshToken(refreshToken);
  if (!decoded) {
    authLogger.debug('invalid refresh token');
    return { ok: false, status: 401, body: { error: 'Invalid refresh token' } };
  }

  // Check if refresh token exists in database
  const storedToken = await prisma.refreshToken.findFirst({
    where: {
      token: hashRefreshToken(refreshToken),
      userId: decoded.userId,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!storedToken) {
    authLogger.debug({ userId: decoded.userId }, 'refresh token not in database');
    return { ok: false, status: 401, body: { error: 'Invalid refresh token' } };
  }

  // Fetch current user data (before token generation to use fresh role)
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user) {
    authLogger.warn({ userId: decoded.userId }, 'user not found during refresh');
    return { ok: false, status: 401, body: { error: 'User not found' } };
  }

  // Generate new tokens using CURRENT role from DB (not stale JWT claims)
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role as unknown as import('@/lib/types/auth').UserRole,
  };
  const accessToken = await signAccessToken(tokenPayload);

  // BC36 FIX: Rotate refresh token — delete old, create new (one-time use)
  const newRefreshToken = await signRefreshToken(tokenPayload);

  await prisma.$transaction(async (tx) => {
    // Delete the used refresh token
    await tx.refreshToken.delete({
      where: { id: storedToken.id },
    });
    // Create new refresh token
    await tx.refreshToken.create({
      data: {
        token: hashRefreshToken(newRefreshToken),
        userId: user.id,
        expiresAt: new Date(
          Date.now() +
            (parseInt(config.jwt.refreshExpiration, 10) || 7) * 24 * 60 * 60 * 1000
        ),
      },
    });
  });

  // BC56: tokenExpiresAt lets the frontend pre-emptively refresh without decoding the token.
  const accessExpirationMin = parseInt(config.jwt.accessExpiration, 10) || 15;

  authLogger.debug({ userId: user.id }, 'token refresh successful');
  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
    newRefreshToken,
    tokenExpiresAt: Math.floor(Date.now() / 1000) + accessExpirationMin * 60,
  };
}

export async function POST(req: NextRequest) {
  try {
    // ✅ Rate limiting (P2.3): 60 refreshes per hour, keyed PER REFRESH-TOKEN
    // (hash of the cookie) when present, per-IP only as a cookieless fallback.
    // Per-token keying (2026-06-13, PLAN-v2) replaced per-IP because the BC69
    // middleware loopback presents the server's egress IP, collapsing all users
    // into one shared bucket → correlated mass-logout. The token rotates on
    // every success, so a healthy session never re-hits its bucket.
    // Runs BEFORE the single-flight dedup so every request consumes budget
    // (dedup must not become a limiter bypass): N same-token racers each consume
    // a unit of THAT token's bucket, then join the one in-flight rotation.
    const rateLimitResponse = authRefreshLimiter(req);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    authLogger.debug('token refresh attempt');

    // Get refresh token from cookie
    const refreshToken = req.cookies.get(config.cookie.refreshToken)?.value;
    if (!refreshToken) {
      authLogger.debug('no refresh token found');
      return NextResponse.json(
        { error: 'No refresh token' },
        { status: 401 }
      );
    }

    // Single-flight: join an in-flight rotation for this token, or start one.
    // Log fields use a hash prefix — raw token values must NEVER be logged.
    // info-level (not debug): prod logs at info, and this marker is the
    // greppable regression guard for the race fix — it only fires on an
    // actual dedup event, so volume is a few lines per real race.
    let rotation = inflightRotations.get(refreshToken);
    if (rotation) {
      authLogger.info(
        { tokenHash: createHash('sha256').update(refreshToken).digest('hex').slice(0, 12) },
        'refresh deduplicated'
      );
    } else {
      rotation = rotateRefreshToken(refreshToken).finally(() =>
        inflightRotations.delete(refreshToken)
      );
      inflightRotations.set(refreshToken, rotation);
    }

    const outcome = await rotation;
    if (!outcome.ok) {
      return NextResponse.json(outcome.body, { status: outcome.status });
    }

    // Each request builds its OWN response from the shared rotation result
    // (never share a Response object — its body stream is single-consumer).
    const cookieOptions = {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: 'lax' as const,
      path: '/',
    };

    // BC52 FIX: Don't expose accessToken in response body — it's set as HttpOnly cookie.
    const response = NextResponse.json({
      success: true,
      data: {
        user: outcome.user,
        tokenExpiresAt: outcome.tokenExpiresAt,
      },
    });

    // Set cookies using Next.js Response API
    response.cookies.set({
      name: config.cookie.accessToken,
      value: outcome.accessToken,
      ...cookieOptions,
      maxAge: config.cookie.maxAge,
    });

    response.cookies.set({
      name: config.cookie.refreshToken,
      value: outcome.newRefreshToken,
      ...cookieOptions,
      maxAge: (parseInt(config.jwt.refreshExpiration, 10) || 7) * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    authLogger.error({ err: error }, 'token refresh error');
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 401 }
    );
  }
}
