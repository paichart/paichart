import { Prisma } from '@prisma/client';

export const notificationSelect = {
  id: true,
  message: true,
  type: true,
  userId: true,
  read: true,
  actionUrl: true,
  createdAt: true,
} as const satisfies Prisma.NotificationSelect;

export type PrismaNotification = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;
