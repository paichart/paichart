import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { TeamActivityExportQuerySchema } from '@/lib/validation/dashboard-validation';
import { logger } from '@/lib/logger';
import { buildPOVAccessFilterWithRole } from '@/lib/pov/auth/pov-access-filter';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/dashboard/team-activity/export - Export team activity data
const exportTeamActivityHandler: ApiHandler = async (
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
    const queryValidation = TeamActivityExportQuerySchema.safeParse({
      format: searchParams.get('format') || 'csv',
      timeRange: searchParams.get('timeRange') || '7d',
      department: searchParams.get('department') || undefined
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

    const { format, timeRange, department } = queryValidation.data;

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case '1d':
      case '24h':
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

    // Build where clause — scope to POVs the user can access
    const where: any = {
      timestamp: { gte: startDate }
    };

    // Scope to POVs the user can access (centralized helper)
    const { filter: povFilter, isAdmin } = buildPOVAccessFilterWithRole(user);
    if (!isAdmin) {
      where.task = { pov: povFilter };
    }

    // Get team activities
    const activities = await prisma.taskActivity.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: 1000 // Limit for performance
    });

    if (format === 'csv') {
      // Generate CSV content
      const csvHeaders = [
        'Timestamp',
        'User Name',
        'User Email',
        'Department',
        'Action',
        'Task ID',
        'Task Title',
        'Task Status'
      ];

      const csvRows = activities.map(activity => [
        activity.timestamp.toISOString(),
        activity.user?.name || 'Unknown',
        activity.user?.email || '',
        '', // No department field
        activity.action,
        activity.taskId,
        '', // No task relation
        '' // No task status
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(cell => 
          typeof cell === 'string' && cell.includes(',') 
            ? `"${cell.replace(/"/g, '""')}"` 
            : cell
        ).join(','))
      ].join('\n');

      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="team-activity-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    // Default to JSON export
    return {
      data: {
        timeRange,
        department,
        exportedAt: now.toISOString(),
        totalActivities: activities.length,
        activities: activities.map(activity => ({
          id: activity.id,
          timestamp: activity.timestamp,
          action: activity.action,
          taskId: activity.taskId,
          userId: activity.userId,
          user: {
            id: activity.user?.id,
            name: activity.user?.name,
            email: activity.user?.email
          }
        }))
      }
    };
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/dashboard/team-activity/export' }, 'Failed to export team activity data');
    return {
      error: {
        message: 'Failed to export team activity data',
        code: 'EXPORT_ERROR',
      },
    };
  }
};

export const GET = createHandler(exportTeamActivityHandler, { requireAuth: true });
