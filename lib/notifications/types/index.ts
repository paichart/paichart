export enum NotificationType {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  SUCCESS = 'success',
}

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

export interface MarkAsReadRequest {
  notificationId: string;
  userId: string;
}

export interface NotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
}

export interface UseNotificationsResult {
  loading: boolean;
  notifications: NotificationPayload[];
  error: Error | null;
  addNotification: (title: string, message: string, options?: any) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  refresh: () => Promise<void>;
  initialFetchFailed: boolean;
}
