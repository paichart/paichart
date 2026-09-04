import { ReadableStreamDefaultController } from 'stream/web';

declare global {
  var sseClients: Map<string, ReadableStreamDefaultController>;
}

export interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  actionUrl?: string;
  timestamp: Date;
}
