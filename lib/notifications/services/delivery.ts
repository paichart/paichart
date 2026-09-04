import { prisma } from '@/lib/prisma';
import { CreateNotificationRequest, NotificationType } from '../types';
import { mapCreateNotificationToPrisma, mapNotificationFromPrisma } from '../prisma/mappers';
import { logNotificationActivity } from './activity';
import { logger } from '@/lib/logger';

const localLogger = logger.child({ module: 'NotificationDelivery' });

export async function createNotification(data: CreateNotificationRequest) {
  try {
    const notification = await prisma.notification.create({
      data: mapCreateNotificationToPrisma(data),
      include: {
        user: true,
      },
    });

    // Log activity
    await logNotificationActivity(data.userId, 'create', {
      notificationId: notification.id,
      type: data.type as NotificationType,
      title: data.title,
    });

    return mapNotificationFromPrisma(notification);
  } catch (error) {
    localLogger.error({ err: error }, 'createNotification failed');
    throw error;
  }
}

export async function markAsRead(notificationId: string, userId: string) {
  try {
    const notification = await prisma.notification.update({
      where: {
        id: notificationId,
        userId, // Ensure user owns the notification
      },
      data: {
        read: true,
      },
      include: {
        user: true,
      },
    });

    // Log activity
    await logNotificationActivity(userId, 'read', {
      notificationId: notification.id,
      type: notification.type as NotificationType,
      title: notification.message, // Use message as title for activity log
    });

    return mapNotificationFromPrisma(notification);
  } catch (error) {
    localLogger.error({ err: error, notificationId }, 'markAsRead failed');
    throw error;
  }
}

export async function getUserNotifications(userId: string) {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
      take: 200,
    });

    return {
      data: notifications.map(mapNotificationFromPrisma),
      unreadCount: notifications.filter(n => !n.read).length,
    };
  } catch (error) {
    localLogger.error({ err: error, userId }, 'getUserNotifications failed');
    throw error;
  }
}

export async function deleteNotification(notificationId: string, userId: string) {
  try {
    const notification = await prisma.notification.delete({
      where: { id: notificationId, userId },
      include: { user: true },
    });

    // Log activity
    await logNotificationActivity(userId, 'delete', {
      notificationId: notification.id,
      type: notification.type as NotificationType,
      title: notification.message, // Use message as title for activity log
    });

    return mapNotificationFromPrisma(notification);
  } catch (error) {
    localLogger.error({ err: error, notificationId }, 'deleteNotification failed');
    throw error;
  }
}
