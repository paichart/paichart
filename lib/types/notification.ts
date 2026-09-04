import { Prisma } from '@prisma/client';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type NotificationPayload = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read?: boolean;
  actionUrl?: string | null;
  timestamp: Date;
};

export type DbNotification = Prisma.NotificationGetPayload<{}>;
