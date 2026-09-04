import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { geographicalService } from '@/lib/services/geographicalService';
import { ApiError } from '@/lib/errors';
import { TheatreParamSchema } from '@/lib/validation/geographical-validation';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { theatre: string } }
) {
  try {
    // Verify authentication
    const user = await getAuthUser(request);
    if (!user) {
      throw new ApiError('UNAUTHORIZED', 'Unauthorized');
    }

    // ✅ Validate path parameter
    const paramValidation = TheatreParamSchema.safeParse(params);

    if (!paramValidation.success) {
      return NextResponse.json({
        error: 'Invalid theatre parameter',
        details: paramValidation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }

    const { theatre } = paramValidation.data;

    // Get countries by theatre
    const countries = await geographicalService.getCountriesByTheatre(theatre);

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

    return NextResponse.json(mappedCountries);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    
    logger.error({ err: error, endpoint: 'GET /api/geographical/theatre/[theatre]/countries' }, 'Failed to fetch countries by theatre');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
