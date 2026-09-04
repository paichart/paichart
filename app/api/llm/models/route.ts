import { NextRequest, NextResponse } from 'next/server';
import createHandler from '@/lib/api-handler';
import { UserRole } from '@/lib/types/auth';
import { LLMProvider, anthropicModels, toModelOptions } from '@/lib/services/llm/types';
import { logger } from '@/lib/logger';

export const GET = createHandler(
  async (req: NextRequest) => {
    try {
      // Task #85 (2026-04-16): simplified — no singleton provider probe (the
      // env-var fallback was removed in C1, so isAvailable() would always be
      // false and waste API calls). 2026-06-18: now reads the model list from
      // the single-source registry (anthropicModels in
      // lib/services/llm/types.ts) instead of a duplicated hardcoded list — add
      // a model in one place and it appears here. If per-user availability
      // checking becomes needed, implement it against the triggering user's
      // apiKey instead of a singleton probe.
      const result = [
        { provider: LLMProvider.ANTHROPIC_SDK, models: toModelOptions(anthropicModels) },
      ];

      return NextResponse.json({ data: result });
    } catch (error) {
      logger.error({ err: error, endpoint: 'GET /api/llm/models' }, 'Failed to get available models');
      return NextResponse.json(
        { 
          error: { 
            message: 'Failed to get available models' 
          } 
        },
        { status: 500 }
      );
    }
  },
  { requireAuth: true, allowedRoles: [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN] }
);
