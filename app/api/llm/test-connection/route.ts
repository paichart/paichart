import { NextRequest, NextResponse } from 'next/server';
import createHandler from '@/lib/api-handler';
import { AnthropicSdkProvider } from '@/lib/services/llm/anthropic-sdk-provider';
import { LLMProvider } from '@/lib/services/llm/types';
import { logger } from '@/lib/logger';

export const POST = createHandler(
  async (req: NextRequest) => {
    try {
      // `apiUrl` was destructured here but never read — dropped 2026-08-06. Worth stating
      // plainly: there is NO user-supplied URL on this route. The only path constructs
      // AnthropicSdkProvider(apiKey), which targets Anthropic's fixed endpoint, so opening
      // this route to non-admins below adds no SSRF surface.
      const { provider, apiKey } = await req.json();
      
      // Validate required parameters
      if (!provider) {
        return NextResponse.json(
          { error: 'Provider is required' },
          { status: 400 }
        );
      }
      
      let isAvailable = false;
      let message = '';
      
      // Map string provider to LLMProvider enum
      let providerEnum: LLMProvider;
      switch (provider) {
        case 'anthropic':
          // Legacy provider no longer supported, fallback to SDK
          providerEnum = LLMProvider.ANTHROPIC_SDK;
          break;
        case 'anthropic_sdk':
          providerEnum = LLMProvider.ANTHROPIC_SDK;
          break;
        default:
          return NextResponse.json(
            { error: 'Invalid provider' },
            { status: 400 }
          );
      }
      
      // Test connection based on provider
      switch (providerEnum) {
        case LLMProvider.ANTHROPIC_SDK:
          if (!apiKey) {
            return NextResponse.json(
              { error: 'API key is required for Anthropic SDK' },
              { status: 400 }
            );
          }
          
          logger.info({ provider: 'anthropic_sdk' }, 'testing LLM connection');
          
          const anthropicSdkProvider = new AnthropicSdkProvider(apiKey);
          
          try {
            isAvailable = await anthropicSdkProvider.isAvailable();
            logger.info({ provider: 'anthropic_sdk', isAvailable }, 'anthropic SDK availability check');
          } catch (error) {
            logger.error({ err: error, provider: 'anthropic_sdk' }, 'anthropic SDK availability check failed');
            throw error;
          }
          message = isAvailable 
            ? 'Successfully connected to Anthropic Claude SDK API' 
            : 'Failed to connect to Anthropic Claude SDK API';
          break;
          
        default:
          return NextResponse.json(
            { error: 'Invalid provider' },
            { status: 400 }
          );
      }
      
      if (!isAvailable) {
        return NextResponse.json(
          { error: message },
          { status: 400 }
        );
      }
      
      return NextResponse.json({ 
        success: true,
        message,
        provider
      });
    } catch (error) {
      logger.error({ err: error }, 'LLM connection test failed');
      return NextResponse.json(
        {
          error: 'LLM connection test failed',
        },
        { status: 500 }
      );
    }
  },
  // Was ADMIN/SUPER_ADMIN only. Relaxed to any authenticated user 2026-08-06 so the
  // per-user key form on /profile can offer a Test button — previously only the admin
  // (org-key) form could test, which is backwards: the per-user key is the one actually
  // used for executions. The caller supplies a key they just typed and the request goes
  // to a fixed host, so this grants no capability a user doesn't already have by calling
  // Anthropic directly.
  { requireAuth: true }
);
