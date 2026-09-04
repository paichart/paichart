import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import type { ActivityDetails } from '@/lib/types/activity';
import { taskLogger } from '@/lib/logger';
import { buildPOVAccessFilterWithRole } from '@/lib/pov/auth/pov-access-filter';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/global/activities - Retrieve all task activities across all tasks
const getGlobalActivitiesHandler: ApiHandler = async (
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

    // Parse query parameters
    const limit = parseInt(searchParams.get('limit') || '50', 10) || 50;
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId');
    const povId = searchParams.get('povId'); // Filter by specific POV
    const dateRange = searchParams.get('dateRange') || '7d';
    const taskId = searchParams.get('taskId'); // Should be 'global' for this endpoint

    // Progressive loading - include rich details when requested (Phase 2.7)
    // Default to false for list view (saves 3-4x response size)
    const includeDetails = searchParams.get('includeDetails') === 'true';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (dateRange) {
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

    // Build where clause for global activities (all tasks)
    const where: any = {
      timestamp: {
        gte: startDate
      }
    };

    // Scope to POVs the user can access (centralized helper)
    const { filter: povFilter, isAdmin } = buildPOVAccessFilterWithRole(user);
    const povWhere = {
      ...(!isAdmin ? povFilter : {}),
      ...(povId && { id: povId })
    };
    // Only add task.pov filter if there are conditions
    if (Object.keys(povWhere).length > 0) {
      where.task = { pov: povWhere };
    }

    if (action && action !== 'all') {
      where.action = { contains: action, mode: 'insensitive' };
    }

    if (userId && userId !== 'all') {
      where.userId = userId;
    }

    taskLogger.info({ dateRange, povId, limit, offset, includeDetails, role: user.role }, 'global activities query');

    // Get activities with user, task, and POV information
    // Optionally include rich details for expanded views (Phase 2.7)
    const activities = await prisma.taskActivity.findMany({
      where,
      select: {
        id: true,
        action: true,
        timestamp: true,
        taskId: true,
        userId: true,
        // Only include rich details when requested (saves 3-4x response size)
        ...(includeDetails && {
          details: true,
          metadata: true,
        }),
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
            type: true,
            status: true,
            priority: true,
            pov: {
              select: {
                id: true,
                title: true,
                description: true
              }
            }
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: Math.min(limit, 100),
      skip: offset
    });

    taskLogger.debug({ count: activities.length, dateRange }, 'global activities fetched');

    // Get total count for pagination
    const totalCount = await prisma.taskActivity.count({ where });

    // Format activities with enhanced information for dashboard
    const formattedActivities = activities.map(activity => {
      // Get details: prefer stored JSONB, fall back to string parsing for old records
      const activityDetails = includeDetails
        ? getActivityDetails(activity, includeDetails)
        : undefined;

      return {
        id: activity.id,
        action: activity.action,
        timestamp: activity.timestamp.toISOString(),
        user: {
          id: activity.user?.id || activity.userId,
          name: activity.user?.name || 'Unknown User',
          email: activity.user?.email || ''
        },
        taskId: activity.taskId,
        task: {
          id: activity.task?.id || activity.taskId,
          title: activity.task?.title || 'Unknown Task',
          type: activity.task?.type || 'ACTION',
          status: activity.task?.status || 'OPEN',
          priority: activity.task?.priority || 'MEDIUM'
        },
        pov: activity.task?.pov ? {
          id: activity.task.pov.id,
          title: activity.task.pov.title,
          description: activity.task.pov.description
        } : null,
        // Include rich details when requested (Phase 2.7)
        ...(includeDetails && activityDetails && { details: activityDetails }),
        ...(includeDetails && (activity as any).metadata && { metadata: (activity as any).metadata }),
      };
    });

    taskLogger.info({ count: formattedActivities.length, total: totalCount }, 'global activities response');

    return {
      data: formattedActivities,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + activities.length < totalCount,
      }
    };
  } catch (error) {
    taskLogger.error({ err: error }, 'failed to retrieve global task activities');
    return {
      error: {
        message: 'Failed to retrieve global task activities',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get activity details with backward compatibility
 *
 * Phase 2.7: Handles progressive loading of rich details
 * - New records: Return stored JSONB details from database
 * - Old records: Fall back to string parsing for backward compatibility
 *
 * @param activity - Activity record from database
 * @param includeDetails - Whether to include details in response
 * @returns ActivityDetails or undefined
 */
function getActivityDetails(
  activity: { action: string; details?: unknown },
  includeDetails: boolean
): ActivityDetails | undefined {
  // Progressive loading - skip details if not requested
  if (!includeDetails) {
    return undefined;
  }

  // New records: Return stored details from database (JSONB column)
  if (activity.details && typeof activity.details === 'object') {
    return activity.details as ActivityDetails;
  }

  // Old records: Fall back to string parsing for backward compatibility
  return generateActivityDetailsFromString(activity.action);
}

/**
 * Parse activity details from legacy action strings (backward compatibility)
 *
 * Used for old activity records created before Phase 2 (2025-12-31)
 * that have NULL details column.
 */
function generateActivityDetailsFromString(action: string): ActivityDetails | undefined {
  const details: ActivityDetails = {};

  // Extract details based on action type
  if (action.includes('assigned')) {
    // For assignments, extract the assignee name from the action
    const assigneeMatch = action.match(/assigned (.+)/);
    if (assigneeMatch) {
      details.newValue = assigneeMatch[1];
      details.fieldName = 'assignee';
    }
  }

  if (action.includes('priority')) {
    // For priority changes, extract the priority level
    const priorityMatch = action.match(/priority to (.+)/);
    if (priorityMatch) {
      details.newValue = priorityMatch[1];
      details.fieldName = 'priority';
    }
  }

  if (action.includes('status')) {
    // For status changes, extract the status
    const statusMatch = action.match(/status to (.+)/);
    if (statusMatch) {
      details.newValue = statusMatch[1];
      details.fieldName = 'status';
    }
  }

  if (action.includes('comment')) {
    // For comments, extract the comment text
    const commentMatch = action.match(/comment: "(.+?)"/);
    if (commentMatch) {
      details.comment = commentMatch[1];
    }
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Map database action to timeline format
 * @deprecated Use TaskActivityAction enum from lib/types/activity.ts
 */
function mapActionToTimelineFormat(action: string): string {
  // Map our descriptive actions to timeline action types
  if (action.includes('assigned')) return 'ASSIGNED';
  if (action.includes('unassigned')) return 'UNASSIGNED';
  if (action.includes('priority')) return 'PRIORITY_CHANGED';
  if (action.includes('status')) return 'STATUS_CHANGED';
  if (action.includes('title')) return 'TITLE_UPDATED';
  if (action.includes('description')) return 'DESCRIPTION_UPDATED';
  if (action.includes('completed')) return 'COMPLETED';
  if (action.includes('created')) return 'CREATED';
  if (action.includes('comment')) return 'COMMENT_ADDED';
  if (action.includes('agent')) return 'AGENT_EXECUTED';
  if (action.includes('stage')) return 'STAGE_CHANGED';
  if (action.includes('phase')) return 'PHASE_CHANGED';

  return 'UPDATED'; // Default fallback
}

/**
 * Generate human-readable description
 * @deprecated Use action string directly with new format
 */
function generateActivityDescription(activity: any): string {
  const userName = activity.user?.name || 'Unknown User';

  // Use the action as-is since we're now storing descriptive actions
  return `${userName} ${activity.action}`;
}

/**
 * Generate activity details (legacy - for old action strings)
 * @deprecated Use getActivityDetails() instead
 */
function generateActivityDetails(activity: any): any {
  return generateActivityDetailsFromString(activity.action);
}

export const GET = createHandler(getGlobalActivitiesHandler, { requireAuth: true });
