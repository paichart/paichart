export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  userId: string;
  read: boolean;
  actionUrl?: string;
  createdAt: Date;
}

export interface NotificationResponse {
  data: Notification[];
  unreadCount: number;
}

export interface CreateNotificationRequest {
  type: NotificationType;
  title: string;
  message: string;
  userId: string;
  actionUrl?: string;
}

export enum NotificationType {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  SUCCESS = 'success'
}
