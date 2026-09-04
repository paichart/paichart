import { Notification, NotificationType, CreateNotificationRequest } from '../types';
import { PrismaNotification } from './select';
import { Prisma } from '@prisma/client';

export function mapNotificationFromPrisma(
  notification: PrismaNotification
): Notification {
  return {
    id: notification.id,
    type: notification.type as NotificationType,
    title: notification.message.split('\n')[0], // Use first line as title
    message: notification.message,
    userId: notification.userId,
    read: notification.read,
    actionUrl: notification.actionUrl || undefined,
    createdAt: notification.createdAt,
  };
}

export function mapCreateNotificationToPrisma(
  data: CreateNotificationRequest
): Prisma.NotificationCreateInput {
  return {
    message: `${data.title}\n${data.message}`, // Combine title and message
    type: data.type,
    read: false,
    actionUrl: data.actionUrl,
    user: {
      connect: {
        id: data.userId,
      },
    },
  };
}
