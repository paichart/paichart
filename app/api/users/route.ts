import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { parsePaginationParams, paginationResponse } from '@/lib/utils/pagination';
import { logger } from '@/lib/logger';
import { NON_SELECTABLE_ROLES, SYSTEM_ACCOUNT_EMAIL_SUFFIX } from '@/lib/utils/team-member-guard';

/**
 * GET /api/users
 * Get all active users for team member selection
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2026-05-26 round 2: the user directory (names + emails) must not be
    // harvestable by DEMO public viewers. This endpoint backs the team-member
    // picker, which only USER/ADMIN use (DEMO is read-only and can't manage teams).
    if (user.role === 'DEMO_USER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // P0 Fix: Parse optional filters (Issue #4)
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('teamId');
    const povId = searchParams.get('povId');
    const excludeId = searchParams.get('excludeId');  // Exclude specific user (useful for "add member")

    logger.info({ teamId, povId, excludeId }, 'Fetching users for team selection');

    // P0 Fix: Build where clause with optional filters (Issue #4)
    const where: any = {
      status: 'ACTIVE',
      // 2026-05-27: demo + super-admin/system accounts are never team-member candidates — keep them out of the picker
      role: { notIn: NON_SELECTABLE_ROLES },
      // 2026-06-04: service accounts (@paichart.system) are never candidates either
      email: { not: { endsWith: SYSTEM_ACCOUNT_EMAIL_SUFFIX } },
    };

    // Exclude specific user if requested
    if (excludeId) {
      where.id = { not: excludeId };
    }

    // Filter by team (users NOT already in this team)
    if (teamId) {
      where.NOT = {
        teamMembers: {
          some: {
            teamId: teamId
          }
        }
      };
    }

    // Filter by POV (users NOT already in this POV's team)
    if (povId) {
      // First, get the POV's team ID
      const pov = await prisma.pOV.findUnique({
        where: { id: povId },
        select: { teamId: true }
      });

      if (pov?.teamId) {
        where.NOT = {
          teamMembers: {
            some: {
              teamId: pov.teamId
            }
          }
        };
      }
    }

    // Pagination
    const { limit, offset } = parsePaginationParams(searchParams);

    // Fetch users + total count in parallel
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
        orderBy: {
          name: 'asc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where })
    ]);

    logger.info({ usersFound: users.length, totalCount }, 'Users fetched for team selection');

    return NextResponse.json(paginationResponse(users, totalCount, limit, offset));
  } catch (error) {
    logger.error({ err: error }, 'Users API error');
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
