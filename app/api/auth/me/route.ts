import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
// Note: Don't import cookies from next/headers - causes AsyncLocalStorage error with custom server
// Use req.cookies instead
import { prisma } from '@/lib/prisma';
import { corsPreflightResponse } from '@/lib/utils/cors';
import { authLogger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch complete user data from database
    const fullUser = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
        customRoleId: true,
        // BC68 FIX: verificationToken is sensitive — never expose to client
        isVerified: true,
        verifiedAt: true,
        oauthProvider: true,
        oauthProviderId: true,
        avatarUrl: true,
        organizationDomain: true,
        lastLoginAt: true,
      },
    });

    if (!fullUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // BC56 FIX: Don't expose full accessToken in response body — it's in HttpOnly cookie.
    // Instead, return only the expiration timestamp so the frontend can do pre-emptive refresh.
    let tokenExpiresAt: number | null = null;
    const accessToken = req.cookies.get('token')?.value;
    if (accessToken) {
      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        tokenExpiresAt = payload.exp || null;
      } catch { /* ignore decode errors */ }
    }

    return NextResponse.json({
      data: {
        user: fullUser,
        tokenExpiresAt, // BC56: Expose only expiration, not the full token
      }
    });
  } catch (error) {
    authLogger.error({ err: error }, 'auth/me error');
    return NextResponse.json(
      { error: 'Failed to get user data' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsPreflightResponse(req, 'GET, OPTIONS');
}
