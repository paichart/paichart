/**
 * OAuth 2.0 Callback Endpoint
 * Handles OAuth callbacks and completes authentication flow
 * Part of Plan 9: Anthropic Directory Policy compliance
 *
 * FIX (Dec 2025): Now creates proper session tokens with refresh token
 * - Matches regular login pattern (signAccessToken + signRefreshToken)
 * - Stores refresh token in database for auto-refresh support
 * - Sets BOTH cookies (accessToken + refreshToken)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { oauthService } from '@/lib/auth/oauth/oauth-service';
import { signAccessToken, signRefreshToken } from '@/lib/auth/token-manager';
import { config } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { hashRefreshToken } from '@/lib/crypto/hashing';
import { UserRole } from '@/lib/types/auth';
import { authLogger } from '@/lib/logger';
import { trackActivity } from '@/lib/auth/audit';
import { PUBLIC_BASE_URL } from '@/lib/auth/public-base-url';

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const provider = params.provider;
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Use APP_BASE_URL for production redirects
    const baseUrl = PUBLIC_BASE_URL;

    // Handle OAuth errors
    if (error) {
      authLogger.error({ provider, oauthError: error }, 'oauth provider error');

      const errorRedirect = new URL('/auth/oauth/error', baseUrl);
      errorRedirect.searchParams.set('error', error);
      errorRedirect.searchParams.set('provider', provider);

      return NextResponse.redirect(errorRedirect);
    }

    // Validate required parameters
    if (!code || !state) {
      authLogger.error({ provider, hasCode: !!code, hasState: !!state }, 'oauth missing parameters');

      const errorRedirect = new URL('/auth/oauth/error', baseUrl);
      errorRedirect.searchParams.set('error', 'missing_parameters');
      errorRedirect.searchParams.set('provider', provider);

      return NextResponse.redirect(errorRedirect);
    }

    authLogger.debug({ provider }, 'processing oauth callback');

    // With dedicated OAuth apps, Gemini callbacks go directly to localhost:7777
    // This handler only needs to handle web app callbacks

    // Complete OAuth authentication for web flow
    const authResult = await oauthService.handleOAuthCallback(provider, code, state);

    if (!authResult.success) {
      authLogger.error({ provider, error: authResult.error }, 'oauth authentication failed');

      const errorRedirect = new URL('/auth/oauth/error', baseUrl);

      // Check if this is a GitHub no-verified-email error (Wave 1 renamed
      // GITHUB_EMAIL_PRIVATE -> GITHUB_NO_VERIFIED_EMAIL when /user/emails
      // resolution landed; the error is now "no verified email", not "make it public").
      if (authResult.error?.includes('GITHUB_NO_VERIFIED_EMAIL')) {
        errorRedirect.searchParams.set('error', 'github_no_verified_email');
        errorRedirect.searchParams.set('details', authResult.error.replace('GITHUB_NO_VERIFIED_EMAIL: ', ''));
      } else {
        errorRedirect.searchParams.set('error', 'authentication_failed');
        errorRedirect.searchParams.set('details', authResult.error || 'Unknown error');
      }
      errorRedirect.searchParams.set('provider', provider);

      return NextResponse.redirect(errorRedirect);
    }

    authLogger.info({ provider, userId: authResult.user?.id }, 'oauth login successful');
    // P2.2: SOC 2 CC6.1 evidence for OAuth path. Fire-and-forget per
    // .claude/knowledge/patterns/fire-and-forget-activity-logging-pattern.md
    if (authResult.user?.id) {
      void trackActivity(authResult.user.id, 'AUTHENTICATION', 'OAUTH_LOGIN_SUCCESS', {
        provider,
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
        source: 'web_ui',
      });
    }

    // =========================================================================
    // FIX: Create proper session tokens (matches regular login pattern)
    // =========================================================================
    const tokenPayload = {
      userId: authResult.user!.id,
      email: authResult.user!.email,
      role: authResult.user!.role as UserRole,
    };

    // Generate session tokens using the same functions as regular login
    const accessToken = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);
    authLogger.debug({ provider, userId: authResult.user?.id }, 'oauth session tokens generated');

    // BC52 FIX (extended to OAuth callback 2026-04-09): enforce per-user
    // session limit. Previously this guard existed only on the password
    // login path (app/api/auth/login/route.ts:250) — OAuth callbacks were
    // creating unbounded RefreshToken rows, leaking memory and bypassing
    // the BC52 hardening for the vast majority of users (Claude Desktop,
    // Claude Code, web GitHub/Microsoft all go through OAuth callback).
    // Surfaced during BC73 post-soak audit when steve.terry@paichart.com
    // had 2 RefreshTokens accumulating with no per-OAuth-callback cleanup.
    const MAX_SESSIONS = 10;
    // W11/CR-3: web rows only (provider != 'mcp') — don't evict a user's MCP refresh token.
    const existingTokens = await prisma.refreshToken.findMany({
      where: { userId: authResult.user!.id, provider: { not: 'mcp' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existingTokens.length >= MAX_SESSIONS) {
      const tokensToDelete = existingTokens.slice(MAX_SESSIONS - 1).map(t => t.id);
      await prisma.refreshToken.deleteMany({
        where: { id: { in: tokensToDelete } },
      });
      authLogger.info({ provider, userId: authResult.user?.id, deleted: tokensToDelete.length }, 'OAuth callback enforced MAX_SESSIONS, deleted oldest tokens');
    }

    // Store refresh token in database (hashed at rest; enables auto-refresh)
    await prisma.refreshToken.create({
      data: {
        token: hashRefreshToken(refreshToken),
        userId: authResult.user!.id,
        expiresAt: new Date(
          Date.now() + (parseInt(config.jwt.refreshExpiration, 10) || 7) * 24 * 60 * 60 * 1000
        ),
      },
    });
    authLogger.debug({ provider, userId: authResult.user?.id }, 'oauth refresh token stored');

    // Create success response
    const successRedirect = new URL('/auth/oauth/success', baseUrl);
    const response = NextResponse.redirect(successRedirect);

    // Set BOTH cookies (access + refresh) using config constants
    response.cookies.set(config.cookie.accessToken, accessToken, {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: (parseInt(config.jwt.accessExpiration, 10) || 15) * 60, // 15 minutes (seconds)
    });

    response.cookies.set(config.cookie.refreshToken, refreshToken, {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: (parseInt(config.jwt.refreshExpiration, 10) || 7) * 24 * 60 * 60, // 7 days (seconds)
    });
    authLogger.debug({ provider }, 'oauth session cookies set');

    // Add user info to redirect for frontend handling
    successRedirect.searchParams.set('user', JSON.stringify({
      name: authResult.user?.name,
      email: authResult.user?.email,
      provider: provider
    }));

    authLogger.debug({ provider }, 'oauth redirecting to success');

    return response;

  } catch (error) {
    authLogger.error({ provider: params.provider, err: error }, 'oauth callback failed');

    const baseUrl = PUBLIC_BASE_URL;
    const errorRedirect = new URL('/auth/oauth/error', baseUrl);
    errorRedirect.searchParams.set('error', 'callback_failed');
    errorRedirect.searchParams.set('details', 'Authentication failed. Please try again.');
    errorRedirect.searchParams.set('provider', params.provider);

    return NextResponse.redirect(errorRedirect);
  }
}

/**
 * Handle OAuth errors and provide user-friendly error pages
 */
export async function POST(request: NextRequest) {
  // Handle any POST requests to callback (some providers may use POST)
  return GET(request, { params: { provider: 'unknown' } });
}