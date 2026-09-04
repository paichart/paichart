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

// GET /api/tasks/global/activities/summary - Get task activities summary
const getTaskActivitiesSummaryHandler: ApiHandler = async (
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
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const povId = searchParams.get('povId'); // Filter by specific POV
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

    // Scope to POVs the user can access (mirrors sibling /activities/route.ts)
    const { filter: povFilter, isAdmin } = buildPOVAccessFilterWithRole(user);
    const povWhere = {
      ...(!isAdmin ? povFilter : {}),
      ...(povId && { id: povId })
    };

    const where: any = {
      timestamp: { gte: startDate },
      ...(taskId && taskId !== 'global' && { taskId }),
    };
    if (Object.keys(povWhere).length > 0) {
      where.task = { pov: povWhere };
    }

    // Get task activities from database
    const activities = await prisma.taskActivity.findMany({
      where,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            type: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 5000, // BC62 FIX: Bound query to prevent memory exhaustion
    });

    taskLogger.info({ activityCount: activities.length, dateRange }, 'Task activities summary retrieved');

    // Calculate summary statistics
    const totalActivities = activities.length;

    // Group by activity type
    const activitiesByType = activities.reduce((acc, activity) => {
      acc[activity.action] = (acc[activity.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Group by user
    const activitiesByUser = activities.reduce((acc, activity) => {
      const userId = activity.userId || 'unknown';
      acc[userId] = (acc[userId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Group by task
    const activitiesByTask = activities.reduce((acc, activity) => {
      acc[activity.taskId] = (acc[activity.taskId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Generate recent activity (daily breakdown)
    const recentActivity = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayActivities = activities.filter(a => 
        a.timestamp >= dayStart && a.timestamp < dayEnd
      );
      
      const tasksCreated = dayActivities.filter(a => a.action === 'task.created').length;
      const tasksCompleted = dayActivities.filter(a => a.action === 'task.completed').length;
      const statusChanges = dayActivities.filter(a => a.action === 'task.status_changed').length;
      
      recentActivity.push({
        date: date.toISOString().split('T')[0],
        activities: dayActivities.length,
        tasksCreated,
        tasksCompleted,
        statusChanges
      });
    }

    // Get most active users
    const userActivityCounts = activities.reduce((acc, activity) => {
      if (activity.user) {
        const userId = activity.user.id;
        if (!acc[userId]) {
          acc[userId] = {
            userId,
            name: activity.user.name || activity.user.email,
            activities: 0
          };
        }
        acc[userId].activities++;
      }
      return acc;
    }, {} as Record<string, { userId: string; name: string; activities: number }>);

    const mostActiveUsers = Object.values(userActivityCounts)
      .sort((a, b) => b.activities - a.activities)
      .slice(0, 5);

    // Get most active tasks
    const taskActivityCounts = activities.reduce((acc, activity) => {
      if (activity.task) {
        const taskId = activity.task.id;
        if (!acc[taskId]) {
          acc[taskId] = {
            taskId,
            title: activity.task.title,
            activities: 0
          };
        }
        acc[taskId].activities++;
      }
      return acc;
    }, {} as Record<string, { taskId: string; title: string; activities: number }>);

    const mostActiveTasks = Object.values(taskActivityCounts)
      .sort((a, b) => b.activities - a.activities)
      .slice(0, 5);

    return {
      data: {
        summary: {
          totalActivities,
          activitiesByType,
          activitiesByUser,
          activitiesByTask,
          trends: {
            activityTrend: 0, // Would need historical data to calculate
            taskCreationTrend: 0,
            completionTrend: 0
          },
          recentActivity,
          mostActiveUsers,
          mostActiveTasks
        }
      }
    };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'GET /api/tasks/global/activities/summary' }, 'Failed to retrieve task activities summary');
    return {
      error: {
        message: 'Failed to retrieve task activities summary',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getTaskActivitiesSummaryHandler, { requireAuth: true });
