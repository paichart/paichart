import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { TeamActivityQuerySchema } from '@/lib/validation/dashboard-validation';
import { handleTeamDomain } from '@/app/api/analytics/domains/team';
import { logger } from '@/lib/logger';

// ============================================================================
// GET /api/dashboard/team-activity - DEPRECATED (Backward Compatibility Wrapper)
// ============================================================================
// This endpoint is DEPRECATED in favor of unified endpoint.
// Use: GET /api/analytics?domain=team&metrics=activity
//
// Sunset Date: 2026-06-12 (6 months from now)
//
// This wrapper calls the unified handler directly (no network overhead).
// Maintains backward compatibility for existing clients during migration period.
//
// Part 2: Endpoint Consolidation (Phase 4/5)
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);

    // Deprecation logging for sunset planning
    logger.warn({ endpoint: 'GET /api/dashboard/team-activity', userId: user?.userId, migration: 'Use GET /api/analytics?domain=team&metrics=activity instead', sunsetDate: '2026-06-12' }, 'Deprecated endpoint used');

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate query parameters
    const { searchParams } = req.nextUrl;

    const queryValidation = TeamActivityQuerySchema.safeParse({
      page: searchParams.get('page') || '1',
      pageSize: searchParams.get('pageSize') || '10',
      teamId: searchParams.get('teamId') || undefined,
      povId: searchParams.get('povId') || undefined,
      type: searchParams.get('type') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined
    });

    if (!queryValidation.success) {
      return NextResponse.json({
        error: 'Invalid query parameters',
        details: queryValidation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }

    const validatedData = queryValidation.data;

    // Map to unified format
    const unifiedParams = {
      domain: 'team' as const,
      metrics: ['activity'],
      povId: validatedData.povId,
      teamId: validatedData.teamId,
      ...validatedData
    };

    // ✅ Call unified handler DIRECTLY (no network overhead)
    const result = await handleTeamDomain(unifiedParams, user);

    // Extract activity from result (maintain old response structure)
    return NextResponse.json({
      data: result.data.activity
    });

  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/dashboard/team-activity' }, 'Failed to get team activity');
    return NextResponse.json(
      { error: 'Failed to get team activity' },
      { status: 500 }
    );
  }
}
