import { NextRequest, NextResponse } from 'next/server';
// Note: Don't import cookies from next/headers - causes AsyncLocalStorage error with custom server
import { getClientIP } from '@/lib/utils/client-ip';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { hashRefreshToken } from '@/lib/crypto/hashing';
import { authLogger } from '@/lib/logger';
import { EnterpriseOAuthService } from '@/lib/auth/oauth/oauth-service';
import { trackActivity } from '@/lib/auth/audit';

export async function POST(request: NextRequest) {
  try {
    const refreshTokenValue = request.cookies.get(config.cookie.refreshToken)?.value;
    let userId: string | null = null;

    if (refreshTokenValue) {
      // Look up userId from the refresh token before deleting (for cleanup + audit)
      const storedToken = await prisma.refreshToken.findFirst({
        where: { token: hashRefreshToken(refreshTokenValue) },
        select: { userId: true, id: true },
      });

      if (storedToken) {
        userId = storedToken.userId;

        // Delete only this session's token, not all sessions
        await prisma.refreshToken.deleteMany({
          where: { token: hashRefreshToken(refreshTokenValue) },
        });
      }
    }

    // Clean up in-memory OAuth provider tokens
    if (userId) {
      EnterpriseOAuthService.clearUserTokens(userId);
    }

    authLogger.info({ userId: userId || 'unknown' }, 'User logged out');
    // P2.2: SOC 2 CC6.1 evidence — only log if we have a real userId
    // (cookies expired / already-logged-out logout-button presses skip audit).
    if (userId) {
      void trackActivity(userId, 'AUTHENTICATION', 'LOGOUT', {
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
        source: 'web_ui',
      });
    }

    // Create response with cleared cookies
    const response = NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200 }
    );

    // Clear both cookies explicitly
    response.cookies.set(config.cookie.accessToken, '', {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    response.cookies.set(config.cookie.refreshToken, '', {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    authLogger.error({ err: error }, 'Logout failed');
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
