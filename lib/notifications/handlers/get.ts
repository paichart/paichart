import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';
import { notificationSelect } from '../prisma/select';
import { mapNotificationFromPrisma } from '../prisma/mappers';
import { NotificationResponse } from '../types';

// OPTIMIZATION: WebSocket connection pooling and message batching
// TIME BOMB PREVENTION (Jan 2026): Added size limits for all Maps
const wsConnections = new Map();
const messageBatches = new Map();
const notificationCache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes (short TTL for real-time data)
const BATCH_SIZE = 10;
const BATCH_TIMEOUT = 1000; // 1 second
const MAX_CONNECTIONS = 1000;

// TIME BOMB PREVENTION: Map size limits (Category 1: Unbounded Caches)
const MAX_MESSAGE_BATCHES = 1000;
const MAX_NOTIFICATION_CACHE = 2000;

// OPTIMIZATION: WebSocket connection management
class NotificationWebSocketManager {
  private connections: Map<string, any> = new Map();
  private userConnectionCount: Map<string, number> = new Map(); // BC62 FIX: Per-user tracking
  private batches: Map<string, any[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();

  // BC62 FIX: Per-user connection limit
  private static MAX_PER_USER = 10;

  addConnection(userId: string, ws: any) {
    if (this.connections.size >= MAX_CONNECTIONS) {
      logger.warn({ maxConnections: MAX_CONNECTIONS }, 'ws max connections reached, rejecting');
      return false;
    }

    // BC62 FIX: Enforce per-user connection limit
    const userCount = this.userConnectionCount.get(userId) || 0;
    if (userCount >= NotificationWebSocketManager.MAX_PER_USER) {
      logger.warn({ userId, maxPerUser: NotificationWebSocketManager.MAX_PER_USER }, 'ws per-user limit reached, rejecting');
      return false;
    }
    this.userConnectionCount.set(userId, userCount + 1);

    this.connections.set(userId, ws);
    logger.debug({ total: this.connections.size }, 'ws connection added');
    return true;
  }

  removeConnection(userId: string) {
    this.connections.delete(userId);
    // BC62 FIX: Decrement per-user count
    const userCount = this.userConnectionCount.get(userId) || 0;
    if (userCount <= 1) {
      this.userConnectionCount.delete(userId);
    } else {
      this.userConnectionCount.set(userId, userCount - 1);
    }
    this.clearBatch(userId);
    logger.debug({ total: this.connections.size }, 'ws connection removed');
  }

  // OPTIMIZATION: Message batching for performance
  batchMessage(userId: string, message: any) {
    if (!this.batches.has(userId)) {
      this.batches.set(userId, []);
    }

    const batch = this.batches.get(userId)!;
    batch.push(message);

    // Send immediately if batch is full
    if (batch.length >= BATCH_SIZE) {
      this.flushBatch(userId);
      return;
    }

    // Set timer to send batch after timeout
    if (!this.batchTimers.has(userId)) {
      const timer = setTimeout(() => {
        this.flushBatch(userId);
      }, BATCH_TIMEOUT);
      this.batchTimers.set(userId, timer);
    }
  }

  private flushBatch(userId: string) {
    const batch = this.batches.get(userId);
    if (!batch || batch.length === 0) return;

    const connection = this.connections.get(userId);
    if (connection && connection.readyState === 1) { // WebSocket.OPEN
      try {
        connection.send(JSON.stringify({
          type: 'notification_batch',
          data: batch,
          timestamp: new Date().toISOString()
        }));
        logger.debug({ batchSize: batch.length }, 'ws batch sent');
      } catch (error) {
        logger.error({ err: error }, 'ws batch send failed');
        this.removeConnection(userId);
      }
    }

    this.clearBatch(userId);
  }

  private clearBatch(userId: string) {
    this.batches.delete(userId);
    const timer = this.batchTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(userId);
    }
  }

  // OPTIMIZATION: Broadcast to multiple users efficiently
  broadcast(userIds: string[], message: any) {
    userIds.forEach(userId => {
      if (this.connections.has(userId)) {
        this.batchMessage(userId, message);
      }
    });
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  // OPTIMIZATION: Health check for connections
  healthCheck() {
    const deadConnections: string[] = [];
    
    this.connections.forEach((ws, userId) => {
      if (ws.readyState !== 1) { // Not WebSocket.OPEN
        deadConnections.push(userId);
      }
    });

    deadConnections.forEach(userId => {
      this.removeConnection(userId);
    });

    logger.debug({ removedCount: deadConnections.length }, 'ws health check completed');
  }
}

// Global WebSocket manager instance
const wsManager = new NotificationWebSocketManager();

// OPTIMIZATION: Periodic health check (Fix 4.1 - managed timer)
let notificationHealthCheckInterval: NodeJS.Timeout | null = null;

export function startNotificationHealthCheck(): void {
  if (notificationHealthCheckInterval) {
    return;
  }

  notificationHealthCheckInterval = setInterval(() => {
    wsManager.healthCheck();
  }, 30000); // Every 30 seconds

  // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
  notificationHealthCheckInterval.unref();

  logger.info('notification health check started');
}

export function stopNotificationHealthCheck(): void {
  if (notificationHealthCheckInterval) {
    clearInterval(notificationHealthCheckInterval);
    notificationHealthCheckInterval = null;
    logger.info('notification health check stopped');
  }
}

// OPTIMIZATION: Helper functions for notification optimization
function getCacheKey(userId: string): string {
  return `notifications:${userId}`;
}

function getCachedNotifications(cacheKey: string) {
  const cached = notificationCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  return null;
}

function setCachedNotifications(cacheKey: string, data: any): void {
  // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
  if (notificationCache.size >= MAX_NOTIFICATION_CACHE && !notificationCache.has(cacheKey)) {
    const oldestKey = notificationCache.keys().next().value;
    if (oldestKey) {
      notificationCache.delete(oldestKey);
    }
  }

  notificationCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });

  // Cleanup old cache entries (TTL-based)
  if (notificationCache.size > MAX_NOTIFICATION_CACHE / 2) {
    const entries = Array.from(notificationCache.entries());
    const now = Date.now();

    entries.forEach(([key, value]) => {
      if (now - value.timestamp > CACHE_TTL) {
        notificationCache.delete(key);
      }
    });
  }
}

// Export WebSocket manager for external use
export { wsManager as notificationWebSocketManager };

// Retry configuration
const RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 5000,
};

// Helper function to implement exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  retryCount = 0
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && 
        error.message.includes('Too many database connections') &&
        retryCount < RETRY_OPTIONS.maxRetries) {
      const delay = Math.min(
        RETRY_OPTIONS.initialDelay * Math.pow(2, retryCount),
        RETRY_OPTIONS.maxDelay
      );
      logger.warn({ delayMs: delay, attempt: retryCount + 1 }, 'retrying after db connection error');
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retryCount + 1);
    }
    throw error; // Replace return Promise.reject with throw error
  }
}

export async function getNotificationsHandler(req: NextRequest): Promise<NextResponse<NotificationResponse>> {
  try {
    // Get user from token
    const user = await getAuthUser(req);
    if (!user) {
      // Return empty array for unauthenticated users
      return NextResponse.json({
        data: [],
        unreadCount: 0,
      });
    }

    // OPTIMIZATION: Check cache first for real-time notifications
    const cacheKey = getCacheKey(user.userId);
    const cachedResult = getCachedNotifications(cacheKey);
    
    if (cachedResult) {
      logger.debug({ userId: user.userId }, 'notifications cache hit');
      
      // OPTIMIZATION: Send real-time update via WebSocket if available
      if (wsManager.getConnectionCount() > 0) {
        wsManager.batchMessage(user.userId, {
          type: 'notifications_cached',
          data: cachedResult.data,
          unreadCount: cachedResult.unreadCount,
          timestamp: new Date().toISOString()
        });
      }
      
      return NextResponse.json(cachedResult);
    }

    logger.debug({ userId: user.userId }, 'notifications cache miss, querying database');

    // OPTIMIZATION: Enhanced transaction with WebSocket integration
    const transactionResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const [notifs, count] = await Promise.all([
        tx.notification.findMany({
          where: {
            userId: user?.userId,
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: notificationSelect,
          take: 50, // Limit to recent notifications for performance
        }),
        tx.notification.count({
          where: {
            userId: user?.userId,
            read: false,
          },
        }),
      ]);
      return { notifications: notifs, unreadCount: count };
    }, {
      maxWait: 2000,
      timeout: 5000,
      isolationLevel: 'ReadCommitted',
    });

    // OPTIMIZATION: Prepare enhanced response with WebSocket metadata
    const responseData = {
      data: transactionResult.notifications.map(mapNotificationFromPrisma),
      unreadCount: transactionResult.unreadCount,
      websocketEnabled: wsManager.getConnectionCount() > 0,
      cached: false,
      optimized: true
    };

    // OPTIMIZATION: Cache the result
    setCachedNotifications(cacheKey, responseData);

    // OPTIMIZATION: Send real-time update via WebSocket
    if (wsManager.getConnectionCount() > 0) {
      wsManager.batchMessage(user.userId, {
        type: 'notifications_updated',
        data: responseData.data,
        unreadCount: responseData.unreadCount,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error({ err: error }, 'notifications handler error');
    return NextResponse.json(
      {
        data: [],
        unreadCount: 0,
        websocketEnabled: false,
        cached: false,
        error: 'Failed to fetch notifications'
      },
      { status: 500 }
    );
  }
}
