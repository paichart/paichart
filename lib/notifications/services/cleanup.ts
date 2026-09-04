import { prisma } from '@/lib/prisma';
import { subDays } from 'date-fns';
import { logger } from '@/lib/logger';

const localLogger = logger.child({ module: 'NotificationCleanup' });

/**
 * Delete old read notifications
 * - Read notifications older than 7 days are deleted
 * - Unread notifications are kept indefinitely
 */
export async function cleanupOldNotifications() {
  try {
    const threshold = subDays(new Date(), 7);

    const { count } = await prisma.notification.deleteMany({
      where: {
        read: true,
        createdAt: {
          lt: threshold,
        },
      },
    });

    localLogger.info({ deletedCount: count }, 'cleaned up old notifications');
    return count;
  } catch (error) {
    localLogger.error({ err: error }, 'cleanupOldNotifications failed');
    throw error;
  }
}

/**
 * Delete all read notifications for a user
 */
export async function clearReadNotifications(userId: string) {
  try {
    const { count } = await prisma.notification.deleteMany({
      where: {
        userId,
        read: true,
      },
    });

    localLogger.info({ userId, deletedCount: count }, 'cleared read notifications for user');
    return count;
  } catch (error) {
    localLogger.error({ err: error, userId }, 'clearReadNotifications failed');
    throw error;
  }
}

/**
 * Get cleanup statistics
 */
export async function getCleanupStats() {
  try {
    const threshold = subDays(new Date(), 7);

    const [totalCount, readCount, oldReadCount] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.count({
        where: { read: true },
      }),
      prisma.notification.count({
        where: {
          read: true,
          createdAt: {
            lt: threshold,
          },
        },
      }),
    ]);

    return {
      totalNotifications: totalCount,
      readNotifications: readCount,
      cleanupEligible: oldReadCount,
      lastChecked: new Date(),
    };
  } catch (error) {
    localLogger.error({ err: error }, 'getCleanupStats failed');
    throw error;
  }
}
