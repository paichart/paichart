import { prisma, type PrismaClient } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ensureObject } from '@/lib/utils/ensure-object';
import { activityWithUserSelect } from '../prisma/select';
import { Activity, ActivityFilters, ActivityListData } from '../types';

const activityLogger = logger.child({ module: 'AdminActivityService' });

type ActivityWithUser = Awaited<ReturnType<PrismaClient['activity']['findUnique']>> & {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

export class AdminActivityService {
  /**
   * Get activity logs with filters and pagination
   */
  static async getActivities(filters: ActivityFilters): Promise<ActivityListData> {
    try {
      const {
        userId,
        type,
        action,
        povId,
        startDate,
        endDate,
        page = 1,
        limit = 10,
      } = filters;

      // Build where clause
      const where: any = {};
      if (userId) where.userId = userId;
      if (type) where.type = type;
      if (action) where.action = action;

      // POV-scoped filtering: Filter activities by povId stored in metadata
      if (povId) {
        where.metadata = {
          path: ['povId'],
          equals: povId
        };
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      // Get activities with pagination and filter options
      const [activities, total, types, actions] = await Promise.all([
        prisma.activity.findMany({
          where,
          select: activityWithUserSelect,
          orderBy: {
            createdAt: 'desc',
          },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.activity.count({ where }),
        prisma.activity.findMany({
          select: { type: true },
          distinct: ['type'],
          orderBy: { type: 'asc' },
          take: 100, // Phase 2 safety cap: distinct types are small but should be bounded
        }),
        prisma.activity.findMany({
          select: { action: true },
          distinct: ['action'],
          orderBy: { action: 'asc' },
          take: 100, // Phase 2 safety cap: distinct actions are small but should be bounded
        }),
      ]);

      const pages = Math.ceil(total / limit);

      return {
        activities: (activities as ActivityWithUser[]).map((activity) => ({
          id: activity.id,
          userId: activity.userId,
          type: activity.type,
          action: activity.action,
          metadata: activity.metadata ? ensureObject(activity.metadata, {}, 'Activity metadata') as Record<string, any> : undefined,
          createdAt: activity.createdAt.toISOString(),
          user: {
            name: activity.user.name,
            email: activity.user.email,
            role: activity.user.role,
          },
        })),
        pagination: {
          total,
          pages,
          current: page,
          limit,
          pageSize: activities.length,
          hasMore: page < pages,
        },
        filters: {
          types: types.map((t: { type: string }) => t.type),
          actions: actions.map((a: { action: string }) => a.action),
        },
      };
    } catch (error) {
      activityLogger.error({ err: error }, 'Failed to get activities');
      throw error;
    }
  }

  /**
   * Log a new activity
   */
  static async logActivity(data: {
    userId: string;
    type: string;
    action: string;
    metadata?: Record<string, any>;
  }): Promise<Activity> {
    try {
      const activity = await prisma.activity.create({
        data,
        select: activityWithUserSelect,
      }) as ActivityWithUser;

      return {
        id: activity.id,
        userId: activity.userId,
        type: activity.type,
        action: activity.action,
        metadata: activity.metadata ? ensureObject(activity.metadata, {}, 'Activity metadata') as Record<string, any> : undefined,
        createdAt: activity.createdAt.toISOString(),
        user: {
          name: activity.user.name,
          email: activity.user.email,
          role: activity.user.role,
        },
      };
    } catch (error) {
      activityLogger.error({ err: error }, 'Failed to log activity');
      throw error;
    }
  }
}
