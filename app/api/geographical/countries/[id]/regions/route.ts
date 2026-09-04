import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { geographicalService } from '@/lib/services/geographicalService';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const user = await getAuthUser(request);
    if (!user) {
      throw new ApiError('UNAUTHORIZED', 'Unauthorized');
    }

    const { id } = params;
    if (!id) {
      throw new ApiError('BAD_REQUEST', 'Country ID is required');
    }

    // Get regions by country
    const regions = await geographicalService.getRegionsByCountry(id);

    return NextResponse.json(regions);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    
    logger.error({ err: error, endpoint: 'GET /api/geographical/countries/[id]/regions' }, 'Failed to fetch regions by country');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
