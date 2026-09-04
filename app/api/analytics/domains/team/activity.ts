import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { getAccessiblePovIds } from '@/lib/auth/accessible-pov-scope';

/**
 * Team Activity Handler
 * Extracted from: /app/api/dashboard/team-activity/route.ts
 *
 * Provides team activity metrics with complex POV filtering:
 * - Activity list with pagination
 * - Analytics breakdowns (by type, by user, trends)
 *
 * CRITICAL: Complex POV filtering logic (lines 64-126 from source)
 * - Activity model has NO direct POV relation
 * - Must filter by users who have tasks in POV
 * - Edge case: POV with no users → return empty (not error)
 *
 * Part 2: Endpoint Consolidation (Phase 4/5)
 */
export async function getTeamActivity(params: any, user: TokenPayload) {
  const {
    povId,
    teamId,
    type,
    startDate,
    endDate,
    page = 1,
    pageSize = 10
  } = params;

  // Build where clause
  const where: any = {};
  if (type) where.type = type;
  if (startDate) {
    where.createdAt = {
      ...where.createdAt,
      gte: new Date(startDate),
    };
  }
  if (endDate) {
    where.createdAt = {
      ...where.createdAt,
      lte: new Date(endDate),
    };
  }

  // ============================================================================
  // CRITICAL: POV filtering logic (PRESERVE EXACTLY - lines 64-110 from source)
  // ============================================================================
  // Activity model doesn't have direct POV relation
  // Filter by users who have tasks in this POV
  if (povId) {
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      include: {
        tasks: {
          select: {
            assigneeId: true
          }
        },
        team: {
          include: {
            members: {
              select: { userId: true }
            }
          }
        }
      }
    });

    // ✅ M3 FIX: Explicit POV access validation (security audit recommendation)
    // Returns 404 (not 403) to prevent information disclosure
    if (!pov) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
        analytics: { byType: [], byUser: [], trends: [] }
      };
    }

    const hasAccess = await validatePOVAccess(user, pov);
    if (!hasAccess) {
      // IDOR prevention: Return empty result (not 403 error)
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
        analytics: { byType: [], byUser: [], trends: [] }
      };
    }

    // Get unique user IDs from POV (task assignees + team members)
    const povUserIds = new Set<string>();

    // Add task assignees
    pov.tasks.forEach(task => {
      if (task.assigneeId) povUserIds.add(task.assigneeId);
    });

    // Add team members
    pov.team?.members.forEach(member => {
      povUserIds.add(member.userId);
    });

    if (povUserIds.size > 0) {
      where.userId = { in: Array.from(povUserIds) };
    } else {
      // EDGE CASE: No users in this POV
      // Return empty result (not error)
      where.userId = 'nonexistent';
    }
  }

  // ============================================================================
  // Team filtering through user relationship (lines 112-126 from source)
  // ============================================================================
  if (teamId) {
    // 🔒 SECURITY (SEC-C1 pt2, 2026-06-23): teamId was accepted with no membership check —
    // any non-admin could read an arbitrary team's activity (names/emails). Verify membership.
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    if (!isAdmin) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId, userId: user.userId },
        select: { id: true }
      });
      if (!membership) {
        return {
          items: [], total: 0, page, pageSize, hasMore: false,
          analytics: { byType: [], byUser: [], trends: [] }
        };
      }
    }
    // Get user IDs from team members
    // BC24 FIX: Add take cap (teams shouldn't have unbounded members)
    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId },
      take: 1000,
      select: { userId: true }
    });
    const userIds = teamMembers.map(member => member.userId);
    if (userIds.length > 0) {
      where.userId = { in: userIds };
    } else {
      // If no team members found, return empty result
      where.userId = 'nonexistent';
    }
  }

  // 🔒 SECURITY (SEC-C1 pt2, 2026-06-23): with no explicit povId/teamId the query was
  // UNSCOPED → all-tenant activity (incl. user names/emails) for any authenticated non-admin.
  // Scope to users in the caller's accessible POVs (admin → global). Empty accessible set →
  // 'nonexistent' → zero rows (fail-closed).
  if (!povId && !teamId) {
    const accessiblePovIds = await getAccessiblePovIds(user); // null = admin (global)
    if (accessiblePovIds !== null) {
      if (accessiblePovIds.length === 0) {
        where.userId = 'nonexistent';
      } else {
        const scopedUserIds = new Set<string>();
        const accessiblePovs = await prisma.pOV.findMany({
          where: { id: { in: accessiblePovIds } },
          select: {
            tasks: { select: { assigneeId: true } },
            team: { select: { members: { select: { userId: true } } } }
          }
        });
        accessiblePovs.forEach(p => {
          p.tasks.forEach(t => { if (t.assigneeId) scopedUserIds.add(t.assigneeId); });
          p.team?.members.forEach(m => scopedUserIds.add(m.userId));
        });
        where.userId = scopedUserIds.size > 0 ? { in: Array.from(scopedUserIds) } : 'nonexistent';
      }
    }
  }

  // Pagination
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  // Fetch activities with analytics in parallel
  const [activities, total, byType, byUser, trends] = await Promise.all([
    // Main query
    prisma.activity.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take,
    }),

    // Total count
    prisma.activity.count({ where }),

    // Analytics: by type
    prisma.activity.groupBy({
      by: ['type'],
      where,
      _count: {
        id: true
      }
    }),

    // Analytics: by user (top 10)
    prisma.activity.groupBy({
      by: ['userId'],
      where,
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 10
    }),

    // Analytics: trends (last 7 days)
    prisma.activity.groupBy({
      by: ['type'],
      where: {
        ...where,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      _count: {
        id: true
      }
    })
  ]);

  return {
    items: activities,
    total,
    page,
    pageSize,
    hasMore: total > page * pageSize,
    analytics: {
      byType,
      byUser,
      trends
    }
  };
}
