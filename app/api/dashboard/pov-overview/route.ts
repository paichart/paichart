import { NextRequest } from 'next/server';
import { createHandler } from '@/lib/api-handler';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/types/auth';
import { POVStatus } from '@prisma/client';
import { buildPOVAccessFilter } from '@/lib/pov/auth/pov-access-filter';

/**
 * Get POV overview statistics
 */
export const GET = createHandler(
  async (req: NextRequest, context, user) => { // Receive user object

    // Build access-scoped WHERE clause: owned POVs + team POVs
    const accessWhere = buildPOVAccessFilter(user!);

    // Get POV statistics
    const [
      totalPoVs,
      draftPoVs,
      inProgressPoVs,
      completedPoVs,
      recentPoVs,
    ] = await Promise.all([
      // Total PoVs
      prisma.pOV.count({
        where: accessWhere,
      }),
      // Draft PoVs
      prisma.pOV.count({
        where: {
          ...accessWhere,
          status: POVStatus.PROJECTED,
        },
      }),
      // In Progress PoVs
      prisma.pOV.count({
        where: {
          ...accessWhere,
          status: POVStatus.IN_PROGRESS,
        },
      }),
      // Completed PoVs
      prisma.pOV.count({
        where: {
          ...accessWhere,
          status: POVStatus.WON,
        },
      }),
      // Recent PoVs
      // 2026-06-12: team include removed — the PoVOverview widget (sole
      // consumer) reads only id/title/status/owner. team is used in the
      // accessWhere clause for scoping, which doesn't require including it.
      prisma.pOV.findMany({
        where: accessWhere,
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 5,
      }),
    ]);

    return {
      data: {
        total: totalPoVs,
        projected: draftPoVs,
        inProgress: inProgressPoVs,
        won: completedPoVs,
        recent: recentPoVs,
      },
    };
  },
  {
    requireAuth: true,
    allowedRoles: [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN],
  }
);
