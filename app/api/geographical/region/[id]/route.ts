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

    // Fetch region by ID
    const region = await prisma.region.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        countryId: true,
        country: {
          select: {
            id: true,
            name: true,
            code: true,
            theatre: true,
          },
        },
      },
    });

    if (!region) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    return NextResponse.json(region);
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/geographical/region/[id]' }, 'Failed to fetch region');
    return NextResponse.json(
      { error: 'Failed to fetch region' },
      { status: 500 }
    );
  }
}
