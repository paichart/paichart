import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { getTaskWithPOV } from '@/lib/tasks/helpers/pov-access';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { taskLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/[taskId]/activities/export - Export task activities
const exportTaskActivitiesHandler: ApiHandler = async (
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

    // PENTEST FIX: Validate POV access before exporting activities (was missing — any user could export any task's audit trail)
    const taskWithPOV = await getTaskWithPOV(taskId);

    if (!taskWithPOV || !taskWithPOV.pov) {
      return {
        error: { message: 'Task not found', code: 'NOT_FOUND' },
      };
    }

    try {
      validatePOVAccess(user, taskWithPOV.pov, { throwOnDeny: true });
    } catch {
      return {
        error: { message: 'Task not found', code: 'NOT_FOUND' },
      };
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';
    const timeRange = searchParams.get('timeRange') || '7d';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
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

    // Get task activities
    const activities = await prisma.taskActivity.findMany({
      where: {
        taskId,
        timestamp: {
          gte: startDate
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    if (format === 'csv') {
      // Generate CSV content
      const csvHeaders = [
        'Timestamp',
        'Activity Type',
        'Description',
        'User Name',
        'User Email',
        'Task Title',
        'Task Status',
        'Duration (minutes)',
        'Details'
      ];

      const csvRows = activities.map(activity => [
        activity.timestamp.toISOString(),
        activity.action,
        '', // No description field
        activity.user?.name || 'Unknown',
        activity.user?.email || '',
        '', // No task relation
        '', // No task status
        0, // No duration field
        '' // No metadata field
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
          'Content-Disposition': `attachment; filename="task-${taskId.replace(/[^a-zA-Z0-9_-]/g, '')}-activities-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    // Default to JSON export
    return {
      data: {
        taskId,
        timeRange,
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
    taskLogger.error({ err: error, endpoint: 'GET /api/tasks/[taskId]/activities/export' }, 'Failed to export task activities');
    return {
      error: {
        message: 'Failed to export task activities',
        code: 'EXPORT_ERROR',
      },
    };
  }
};

export const GET = createHandler(exportTaskActivitiesHandler, { requireAuth: true });
