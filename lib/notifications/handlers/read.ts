import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { markAsRead } from '../services/delivery';
import { Notification, NotificationType } from '../types';
import { prisma } from '@/lib/prisma';
import { logNotificationActivity } from '../services/activity';
import { logger } from '@/lib/logger';

const localLogger = logger.child({ module: 'NotificationReadHandler' });

export async function markAsReadHandler(
  req: NextRequest,
  notificationId: string
): Promise<{ data: Notification }> {
  const user = await getAuthUser(req);
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Validate notification ID
  if (!notificationId) {
    throw new Error('Notification ID is required');
  }

  // Mark notification as read
  const notification = await markAsRead(notificationId, user.userId);

  return { data: notification };
}

export async function markAllAsReadHandler(
  req: NextRequest
): Promise<{ success: boolean; count: number }> {
  const user = await getAuthUser(req);
  if (!user) {
    throw new Error('Unauthorized');
  }

  try {
    // Update all unread notifications for the user
    const { count } = await prisma.notification.updateMany({
      where: {
        userId: user.userId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    // Log activity
    if (count > 0) {
      await logNotificationActivity(user.userId, 'read', {
        notificationId: 'all',
        type: NotificationType.INFO,
        title: 'Marked all notifications as read',
      });
    }

    return { success: true, count };
  } catch (error) {
    localLogger.error({ err: error, userId: user.userId }, 'markAllAsReadHandler failed');
    throw error;
  }
}
