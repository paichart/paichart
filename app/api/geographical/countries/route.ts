import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { geographicalService } from '@/lib/services/geographicalService';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await getAuthUser(request);
    if (!user) {
      throw new ApiError('UNAUTHORIZED', 'Unauthorized');
    }

    // Get all countries
    const countries = await geographicalService.getAllCountries();

    // Map countries to a simpler format
    const mappedCountries = countries.map(country => ({
      id: country.id,
      name: country.name,
      code: country.code,
      theatre: country.theatre,
      regions: country.regions.map(region => ({
        id: region.id,
        name: region.name,
        type: region.type,
      })),
    }));

    const response = NextResponse.json(mappedCountries);
    // Geographical data is seed-managed and near-static (changes only via
    // scripts/seed-geographical-data.js) — safe for client-side caching.
    // Week-4 SWR pattern: fresh 1h, stale-while-revalidate 24h.
    response.headers.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400');
    response.headers.set('Vary', 'Authorization'); // BC40: prevent cross-user cache poisoning
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    
    logger.error({ err: error, endpoint: 'GET /api/geographical/countries' }, 'Failed to fetch countries');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
