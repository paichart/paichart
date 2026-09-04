import { NextRequest, NextResponse } from 'next/server';
import auth from '@/lib/auth';
import { ApiResponseWithCookies } from '@/lib/types/auth';
import { createExpiredTokenCookies, formatCookieHeader } from '@/lib/cookies';
import { prisma } from '@/lib/prisma';
import { hashRefreshToken } from '@/lib/crypto/hashing';
import { authRevokeLimiter } from '@/lib/middleware/rate-limit';
import { authLogger } from '@/lib/logger';
import { config } from '@/lib/config';

/**
 * Revoke refresh token
 */
export async function POST(req: NextRequest) {
  try {
    // ✅ Rate limiting (P2.3): 20 revocations per hour
    const rateLimitResponse = authRevokeLimiter(req);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // BC52 FIX: Use config cookie name instead of hardcoded 'refreshToken' (was 'refreshToken', actual name is 'refresh_token')
    const refreshToken = req.cookies.get(config.cookie.refreshToken)?.value;
    if (!refreshToken) {
      return Response.json(
        {
          error: {
            message: 'Refresh token not found',
            code: 'REFRESH_TOKEN_NOT_FOUND',
          },
        },
        { status: 401 }
      );
    }

    // Delete refresh token from database (stored hashed — hash the presented value to match)
    await prisma.refreshToken.deleteMany({
      where: {
        token: hashRefreshToken(refreshToken),
      },
    });

    // Create expired token cookies
    const expiredTokenCookies = createExpiredTokenCookies();

    const response = NextResponse.json({
      success: true,
    });

    // Set cookie headers
    expiredTokenCookies.forEach(cookie => {
      response.cookies.set(cookie);
    });

    return response;
  } catch (error) {
    authLogger.error({ err: error }, 'Failed to revoke token');
    return Response.json(
      {
        error: {
          message: 'Failed to revoke token',
          code: 'REVOKE_TOKEN_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
