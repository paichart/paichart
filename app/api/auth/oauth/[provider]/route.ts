/**
 * OAuth 2.0 Authorization Endpoint
 * Initiates OAuth flow with enterprise providers (Microsoft, Google, GitHub)
 * Part of Plan 9: Anthropic Directory Policy compliance
 */

import { NextRequest, NextResponse } from 'next/server';
import { oauthService } from '@/lib/auth/oauth/oauth-service';
import { authLogger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const provider = params.provider;
    const returnTo = request.nextUrl.searchParams.get('returnTo');

    // Validate provider
    const supportedProviders = ['microsoft', 'google', 'github'];
    if (!supportedProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Unsupported OAuth provider: ${provider}` },
        { status: 400 }
      );
    }

    authLogger.debug({ provider }, 'oauth flow initiated');

    // Generate authorization URL for web app
    // Gemini uses its own OAuth app and doesn't go through this endpoint
    const authUrl = await oauthService.initiateOAuthFlow(
      provider,
      returnTo || undefined
    );

    // Redirect to OAuth provider
    return NextResponse.redirect(authUrl);

  } catch (error) {
    authLogger.error({ err: error, provider: params.provider }, 'oauth initiation failed');
    
    return NextResponse.json(
      { 
        error: 'OAuth authorization failed',
        details: 'See server logs for details',
        provider: params.provider
      },
      { status: 500 }
    );
  }
}