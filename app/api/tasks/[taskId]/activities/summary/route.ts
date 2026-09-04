import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { taskLogger } from '@/lib/logger';
import { buildPOVAccessFilterWithRole } from '@/lib/pov/auth/pov-access-filter';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/[taskId]/activities/summary - Get task activities summary
const getActivitiesSummaryHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    const { taskId } = context.params;
    const { searchParams } = new URL(req.url);
    const dateRange = searchParams.get('dateRange') || '7d';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (dateRange) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Scope to tasks whose POV the caller can access — mirrors the hardened
    // sibling app/api/tasks/global/activities/summary/route.ts. Without this, any
    // authenticated user could read another tenant's task activity summary (incl.
    // active users' names + emails) by supplying an arbitrary taskId.
    // (cross-tenant-leak fix 2026-05-26 round 2)
    const { filter: povFilter, isAdmin } = buildPOVAccessFilterWithRole(user);

    // Get activities from database
    const activities = await prisma.taskActivity.findMany({
      where: {
        taskId, // [taskId] is always a concrete id here — literal /global routes to the static sibling

        timestamp: {
          gte: startDate
        },
        ...(!isAdmin && { task: { pov: povFilter } }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    // Calculate summary statistics
    const totalActivities = activities.length;
    
    // Calculate today's activities
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayActivities = activities.filter(a => a.timestamp >= todayStart).length;
    
    // Calculate this week's activities
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekActivities = activities.filter(a => a.timestamp >= weekStart).length;
    
    // Calculate this month's activities
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthActivities = activities.filter(a => a.timestamp >= monthStart).length;

    // Find top users
    const userActivityCounts = activities.reduce((acc, activity) => {
      const userId = activity.userId;
      if (!acc[userId]) {
        acc[userId] = {
          userId,
          userName: activity.user.name,
          activityCount: 0,
          lastActivity: activity.timestamp
        };
      }
      acc[userId].activityCount++;
      if (activity.timestamp > acc[userId].lastActivity) {
        acc[userId].lastActivity = activity.timestamp;
      }
      return acc;
    }, {} as Record<string, any>);

    const topUsers = Object.values(userActivityCounts)
      .sort((a: any, b: any) => b.activityCount - a.activityCount)
      .slice(0, 10);

    // Activity breakdown by action type
    const activityCounts = activities.reduce((acc, activity) => {
      acc[activity.action] = (acc[activity.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const activityBreakdown = Object.entries(activityCounts)
      .map(([action, count]) => ({
        action,
        count,
        percentage: (count / totalActivities) * 100
      }))
      .sort((a, b) => b.count - a.count);

    // Hourly distribution
    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => {
      const count = activities.filter(a => a.timestamp.getHours() === hour).length;
      return { hour, count };
    });

    // Calculate trends (simplified - would need historical data for real trends)
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayActivities = activities.filter(a => 
      a.timestamp >= yesterdayStart && a.timestamp < todayStart
    ).length;
    
    const lastWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekActivities = activities.filter(a => 
      a.timestamp >= lastWeekStart && a.timestamp < weekStart
    ).length;
    
    const lastMonthStart = new Date(monthStart.getTime() - 30 * 24 * 60 * 60 * 1000);
    const lastMonthActivities = activities.filter(a => 
      a.timestamp >= lastMonthStart && a.timestamp < monthStart
    ).length;

    const dailyTrend = yesterdayActivities > 0 
      ? ((todayActivities - yesterdayActivities) / yesterdayActivities) * 100 
      : 0;
    
    const weeklyTrend = lastWeekActivities > 0 
      ? ((weekActivities - lastWeekActivities) / lastWeekActivities) * 100 
      : 0;
    
    const monthlyTrend = lastMonthActivities > 0 
      ? ((monthActivities - lastMonthActivities) / lastMonthActivities) * 100 
      : 0;

    return {
      data: {
        summary: {
          totalActivities,
          todayActivities,
          weekActivities,
          monthActivities,
          topUsers,
          activityBreakdown,
          trends: {
            dailyTrend,
            weeklyTrend,
            monthlyTrend
          },
          hourlyDistribution
        }
      }
    };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'GET /api/tasks/[taskId]/activities/summary' }, 'Failed to retrieve task activities summary');
    return {
      error: {
        message: 'Failed to retrieve task activities summary',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getActivitiesSummaryHandler, { requireAuth: true });
