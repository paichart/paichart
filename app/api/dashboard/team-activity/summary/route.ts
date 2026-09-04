import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { TeamActivitySummaryQuerySchema } from '@/lib/validation/dashboard-validation';
import { logger } from '@/lib/logger';
import { buildPOVAccessFilterWithRole } from '@/lib/pov/auth/pov-access-filter';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/dashboard/team-activity/summary - Get team activity summary
const getTeamActivitySummaryHandler: ApiHandler = async (
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

    // ✅ Validate query parameters
    const queryValidation = TeamActivitySummaryQuerySchema.safeParse({
      timeRange: searchParams.get('timeRange') || '7d'
    });

    if (!queryValidation.success) {
      return {
        error: {
          message: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: queryValidation.error.errors
        },
      };
    }

    const { timeRange } = queryValidation.data;

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Role-based POV scoping (centralized helper)
    const { filter: povWhere, isAdmin } = buildPOVAccessFilterWithRole(user);

    // Scoped task filter
    const taskWhere = {
      createdAt: { gte: startDate },
      ...(isAdmin ? {} : { pov: povWhere })
    };

    // Scoped activity filter
    const activityWhere = {
      timestamp: { gte: startDate },
      ...(isAdmin ? {} : { task: { pov: povWhere } })
    };

    // Get team and user data (scoped to accessible POVs)
    const [teams, users, tasks, activities] = await Promise.all([
      prisma.team.findMany({
        where: isAdmin ? {} : {
          // 2026-05-17: POV.teamId is @unique now; back-relation is singular `pov`.
          pov: povWhere
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },
          _count: {
            select: {
              tasks: true,
              members: true
            }
          }
        },
        take: 200
      }),
      prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          ...(isAdmin ? {} : {
            OR: [
              { id: user.userId },
              { teamMembers: { some: { team: { pov: povWhere } } } }
            ]
          })
        },
        select: {
          id: true,
          name: true,
          email: true,
          lastLogin: true
        },
        take: 200
      }),
      prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          status: true,
          teamId: true,
          assigneeId: true,
          createdAt: true,
          updatedAt: true
        },
        take: 5000
      }),
      prisma.taskActivity.findMany({
        where: activityWhere,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          task: {
            select: {
              id: true,
              title: true,
              teamId: true
            }
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 100
      })
    ]);

    // Calculate summary metrics
    const totalMembers = users.length;
    const activeMembers = users.filter(u => 
      u.lastLogin && u.lastLogin >= new Date(now.getTime() - 24 * 60 * 60 * 1000)
    ).length;

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const overdueTasks = tasks.filter(t => t.status === 'BLOCKED').length; // Using BLOCKED as overdue proxy

    // Calculate team efficiency (simplified)
    const teamEfficiency = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate average productivity (simplified - based on task completion rate)
    const averageProductivity = teamEfficiency;
    const averageQuality = Math.min(95, averageProductivity + Math.random() * 10); // Simulated
    const totalHoursWorked = totalTasks * 2.5; // Estimated 2.5 hours per task

    // Calculate trends (simplified - would need historical data for real trends)
    const productivityTrend = Math.random() * 20 - 10; // Random trend for demo
    const qualityTrend = Math.random() * 15 - 7.5;
    const efficiencyTrend = Math.random() * 12 - 6;
    const activityTrend = Math.random() * 25 - 12.5;

    // Find top performers (simplified)
    const userTaskCounts = tasks.reduce((acc, task) => {
      if (task.assigneeId) {
        acc[task.assigneeId] = (acc[task.assigneeId] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const topPerformers = Object.entries(userTaskCounts)
      .map(([userId, taskCount]) => {
        const user = users.find(u => u.id === userId);
        return {
          userId,
          userName: user?.name || 'Unknown',
          score: taskCount * 10, // Simplified scoring
          category: 'PRODUCTIVITY' as const
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Department breakdown (simplified)
    const departmentBreakdown = [
      {
        department: 'Engineering',
        memberCount: Math.floor(totalMembers * 0.4),
        averageProductivity: averageProductivity + Math.random() * 10 - 5,
        completedTasks: Math.floor(completedTasks * 0.6)
      },
      {
        department: 'Product',
        memberCount: Math.floor(totalMembers * 0.3),
        averageProductivity: averageProductivity + Math.random() * 10 - 5,
        completedTasks: Math.floor(completedTasks * 0.25)
      },
      {
        department: 'Design',
        memberCount: Math.floor(totalMembers * 0.2),
        averageProductivity: averageProductivity + Math.random() * 10 - 5,
        completedTasks: Math.floor(completedTasks * 0.1)
      },
      {
        department: 'QA',
        memberCount: Math.floor(totalMembers * 0.1),
        averageProductivity: averageProductivity + Math.random() * 10 - 5,
        completedTasks: Math.floor(completedTasks * 0.05)
      }
    ];

    // Hourly activity distribution
    const activityDistribution = Array.from({ length: 24 }, (_, hour) => {
      const count = activities.filter(a => a.timestamp.getHours() === hour).length;
      return { hour, activityCount: count };
    });

    // Recent activities
    const recentActivities = activities.slice(0, 20).map(activity => ({
      userId: activity.userId,
      userName: activity.user.name,
      type: activity.action,
      description: `${activity.user.name} ${activity.action.toLowerCase().replace('_', ' ')}`,
      timestamp: activity.timestamp
    }));

    return {
      data: {
        totalMembers,
        activeMembers,
        totalTasks,
        completedTasks,
        overdueTasks,
        averageProductivity,
        averageQuality,
        teamEfficiency,
        totalHoursWorked,
        trends: {
          productivityTrend,
          qualityTrend,
          efficiencyTrend,
          activityTrend
        },
        topPerformers,
        departmentBreakdown,
        activityDistribution,
        recentActivities
      }
    };
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/dashboard/team-activity/summary' }, 'Failed to retrieve team activity summary');
    return {
      error: {
        message: 'Failed to retrieve team activity summary',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getTeamActivitySummaryHandler, { requireAuth: true });
