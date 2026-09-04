import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    // Fetch country by ID
    const country = await prisma.country.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        theatre: true,
        regions: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!country) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 });
    }

    return NextResponse.json(country);
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/geographical/country/[id]' }, 'Failed to fetch country');
    return NextResponse.json(
      { error: 'Failed to fetch country' },
      { status: 500 }
    );
  }
}
