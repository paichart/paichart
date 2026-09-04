import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse, UserRole } from '@/lib/types/auth';
import { logger } from '@/lib/logger';
import { AdminActivityService } from '../services/activity';
import { ActivityResponse, ActivityCreateResponse, ActivityFilters } from '../types';

const activityHandlerLogger = logger.child({ module: 'AdminActivityHandler' });

export async function getAdminActivitiesHandler(
  req: NextRequest,
  _context: { params: Record<string, string> },
  user?: TokenPayload
): Promise<ApiResponse<ActivityResponse>> {
  try {
    // Check if user exists and has admin access
    if (!user) {
      return {
        error: {
          message: 'Unauthorized - no user found',
          code: 'UNAUTHORIZED',
        },
      };
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      return {
        error: {
          message: 'Unauthorized - requires admin access',
          code: 'FORBIDDEN',
        },
      };
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const filters: ActivityFilters = {
      userId: searchParams.get('userId') || undefined,
      type: searchParams.get('type') || undefined,
      action: searchParams.get('action') || undefined,
      povId: searchParams.get('povId') || undefined,  // POV-scoped audit filtering
      startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
      endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      page: Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1), // BC41 FIX: prevent negative page
      limit: Math.min(parseInt(searchParams.get('limit') || '10', 10) || 10, 100), // BC41 FIX: cap limit
    };

    const result = await AdminActivityService.getActivities(filters);

    return {
      data: result,
    };
  } catch (error) {
    activityHandlerLogger.error({ err: error }, 'Failed to get admin activities');
    return {
      error: {
        message: error instanceof Error ? error.message : 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
      },
    };
  }
}

export async function logAdminActivityHandler(
  req: NextRequest,
  _context: { params: Record<string, string> },
  user?: TokenPayload
): Promise<ApiResponse<ActivityCreateResponse>> {
  try {
    // Check if user exists and has admin access
    if (!user) {
      return {
        error: {
          message: 'Unauthorized - no user found',
          code: 'UNAUTHORIZED',
        },
      };
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      return {
        error: {
          message: 'Unauthorized - requires admin access',
          code: 'FORBIDDEN',
        },
      };
    }

    const data = await req.json();
    const activity = await AdminActivityService.logActivity({
      userId: user.userId, // Always use the authenticated user's ID
      type: data.type,
      action: data.action,
      metadata: data.metadata,
    });

    return {
      data: {
        activity,
      },
    };
  } catch (error) {
    activityHandlerLogger.error({ err: error }, 'Failed to log admin activity');
    return {
      error: {
        message: error instanceof Error ? error.message : 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
      },
    };
  }
}
