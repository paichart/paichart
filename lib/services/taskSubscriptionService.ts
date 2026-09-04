import { EventEmitter } from 'events';
import crypto from 'crypto';
import { taskLogger } from '@/lib/logger';

export interface TaskUpdateEvent {
  type: 'status_change' | 'assignment_change' | 'content_update' | 'activity_added' | 'agent_execution' | 'bulk_operation';
  taskId: string;
  userId?: string;
  timestamp: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  metadata?: {
    source?: string;
    operationId?: string;
    batchId?: string;
    agentExecutionId?: string;
  };
}

export interface TaskSubscription {
  taskId: string;
  userId: string;
  callback: (update: TaskUpdateEvent) => void;
  subscriptionId: string;
  createdAt: Date;
}

/**
 * Task Subscription Service
 *
 * TIME BOMB PREVENTION (Jan 2026):
 * - Maps have MAX size limits with cleanup handling
 * - Cleanup timer uses .unref() and is auto-started on instantiation
 * - Pattern: time-bomb-detection-pattern.md (Categories 1, 2, & 5)
 */
export class TaskSubscriptionServiceClass extends EventEmitter {
  private subscriptions: Map<string, TaskSubscription[]> = new Map();
  private userSubscriptions: Map<string, string[]> = new Map();
  private static cleanupInterval: NodeJS.Timeout | null = null;

  // TIME BOMB PREVENTION: Map size limits (Category 1: Unbounded Caches)
  private readonly MAX_TASKS = 5000;
  private readonly MAX_USERS = 2000;
  private readonly MAX_SUBSCRIPTIONS_PER_TASK = 100;

  constructor() {
    super();
    this.setMaxListeners(100); // Fix 6.4

    // TIME BOMB PREVENTION: Auto-start cleanup (Category 2: Cleanup Schedulers)
    TaskSubscriptionServiceClass.startPeriodicCleanup();
  }

  /**
   * Subscribe to task updates
   */
  subscribe(taskId: string, userId: string, callback: (update: TaskUpdateEvent) => void): string {
    // Enforce Map size limits (previously defined but not checked)
    if (!this.subscriptions.has(taskId) && this.subscriptions.size >= this.MAX_TASKS) {
      taskLogger.warn({ taskCount: this.subscriptions.size, maxTasks: this.MAX_TASKS }, 'Task subscription limit reached — rejecting new task subscription');
      throw new Error('Maximum task subscription limit reached');
    }
    if (!this.userSubscriptions.has(userId) && this.userSubscriptions.size >= this.MAX_USERS) {
      taskLogger.warn({ userCount: this.userSubscriptions.size, maxUsers: this.MAX_USERS }, 'User subscription limit reached — rejecting new subscription');
      throw new Error('Maximum user subscription limit reached');
    }
    const existingTaskSubs = this.subscriptions.get(taskId);
    if (existingTaskSubs && existingTaskSubs.length >= this.MAX_SUBSCRIPTIONS_PER_TASK) {
      taskLogger.warn({ taskId, subCount: existingTaskSubs.length, max: this.MAX_SUBSCRIPTIONS_PER_TASK }, 'Per-task subscription limit reached');
      throw new Error('Maximum subscriptions per task reached');
    }

    // BC32 FIX: crypto.randomUUID() replaces predictable Math.random()
    const subscriptionId = `${taskId}-${userId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const subscription: TaskSubscription = {
      taskId,
      userId,
      callback,
      subscriptionId,
      createdAt: new Date()
    };

    // Add to task subscriptions
    if (!this.subscriptions.has(taskId)) {
      this.subscriptions.set(taskId, []);
    }
    this.subscriptions.get(taskId)!.push(subscription);

    // Add to user subscriptions
    if (!this.userSubscriptions.has(userId)) {
      this.userSubscriptions.set(userId, []);
    }
    this.userSubscriptions.get(userId)!.push(subscriptionId);

    taskLogger.debug({ taskId, userId, subscriptionId }, 'User subscribed to task');
    
    return subscriptionId;
  }

  /**
   * Unsubscribe from task updates
   */
  unsubscribe(taskId: string, userId: string): boolean {
    const taskSubscriptions = this.subscriptions.get(taskId);
    if (!taskSubscriptions) {
      return false;
    }

    // Find and remove subscription
    const subscriptionIndex = taskSubscriptions.findIndex(sub => 
      sub.userId === userId
    );

    if (subscriptionIndex === -1) {
      return false;
    }

    const subscription = taskSubscriptions[subscriptionIndex];
    taskSubscriptions.splice(subscriptionIndex, 1);

    // Remove from user subscriptions
    const userSubs = this.userSubscriptions.get(userId);
    if (userSubs) {
      const userSubIndex = userSubs.indexOf(subscription.subscriptionId);
      if (userSubIndex !== -1) {
        userSubs.splice(userSubIndex, 1);
      }
    }

    // Clean up empty arrays
    if (taskSubscriptions.length === 0) {
      this.subscriptions.delete(taskId);
    }

    taskLogger.debug({ taskId, userId }, 'User unsubscribed from task');
    
    return true;
  }

  /**
   * Unsubscribe by subscription ID
   */
  unsubscribeById(subscriptionId: string): boolean {
    for (const [taskId, subscriptions] of this.subscriptions.entries()) {
      const subscriptionIndex = subscriptions.findIndex(sub => 
        sub.subscriptionId === subscriptionId
      );

      if (subscriptionIndex !== -1) {
        const subscription = subscriptions[subscriptionIndex];
        subscriptions.splice(subscriptionIndex, 1);

        // Remove from user subscriptions
        const userSubs = this.userSubscriptions.get(subscription.userId);
        if (userSubs) {
          const userSubIndex = userSubs.indexOf(subscriptionId);
          if (userSubIndex !== -1) {
            userSubs.splice(userSubIndex, 1);
          }
        }

        // Clean up empty arrays
        if (subscriptions.length === 0) {
          this.subscriptions.delete(taskId);
        }

        taskLogger.debug({ subscriptionId }, 'Subscription removed');
        return true;
      }
    }

    return false;
  }

  /**
   * Publish task update to all subscribers
   */
  publishTaskUpdate(update: TaskUpdateEvent): void {
    const subscriptions = this.subscriptions.get(update.taskId);
    if (!subscriptions || subscriptions.length === 0) {
      return;
    }

    taskLogger.debug({ taskId: update.taskId, subscriberCount: subscriptions.length }, 'Publishing task update');

    // BC24 FIX: Collect broken subscriptions first, remove AFTER iteration
    // (splicing during forEach skips elements)
    const brokenSubscriptionIds: string[] = [];
    subscriptions.forEach(subscription => {
      try {
        subscription.callback(update);
      } catch (error) {
        taskLogger.error({ err: error, subscriptionId: subscription.subscriptionId }, 'Subscription callback failed');
        brokenSubscriptionIds.push(subscription.subscriptionId);
      }
    });

    // Remove broken subscriptions after iteration completes
    for (const id of brokenSubscriptionIds) {
      this.unsubscribeById(id);
    }

    // Emit event for other listeners
    this.emit('task_update', update);
  }

  /**
   * Get active subscriptions for a task
   */
  getTaskSubscriptions(taskId: string): TaskSubscription[] {
    return this.subscriptions.get(taskId) || [];
  }

  /**
   * Get active subscriptions for a user
   */
  getUserSubscriptions(userId: string): TaskSubscription[] {
    const userSubIds = this.userSubscriptions.get(userId) || [];
    const subscriptions: TaskSubscription[] = [];

    for (const [taskId, taskSubs] of this.subscriptions.entries()) {
      for (const sub of taskSubs) {
        if (userSubIds.includes(sub.subscriptionId)) {
          subscriptions.push(sub);
        }
      }
    }

    return subscriptions;
  }

  /**
   * Get subscription statistics
   */
  getStats() {
    const totalSubscriptions = Array.from(this.subscriptions.values())
      .reduce((total, subs) => total + subs.length, 0);

    const taskCount = this.subscriptions.size;
    const userCount = this.userSubscriptions.size;

    return {
      totalSubscriptions,
      taskCount,
      userCount,
      subscriptionsByTask: Array.from(this.subscriptions.entries()).map(([taskId, subs]) => ({
        taskId,
        subscriberCount: subs.length
      }))
    };
  }

  /**
   * Clean up old or inactive subscriptions
   */
  cleanup(maxAgeMinutes: number = 60): number {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    let cleanedCount = 0;

    for (const [taskId, subscriptions] of this.subscriptions.entries()) {
      const activeSubscriptions = subscriptions.filter(sub => {
        if (sub.createdAt < cutoffTime) {
          // Remove from user subscriptions
          const userSubs = this.userSubscriptions.get(sub.userId);
          if (userSubs) {
            const userSubIndex = userSubs.indexOf(sub.subscriptionId);
            if (userSubIndex !== -1) {
              userSubs.splice(userSubIndex, 1);
            }
          }
          cleanedCount++;
          return false;
        }
        return true;
      });

      if (activeSubscriptions.length === 0) {
        this.subscriptions.delete(taskId);
      } else {
        this.subscriptions.set(taskId, activeSubscriptions);
      }
    }

    if (cleanedCount > 0) {
      taskLogger.info({ cleanedCount }, 'Cleaned up old task subscriptions');
    }

    return cleanedCount;
  }

  /**
   * Start periodic cleanup timer (Fix 4.2)
   * TIME BOMB PREVENTION: Auto-called from constructor (Category 2)
   */
  static startPeriodicCleanup(): void {
    if (TaskSubscriptionServiceClass.cleanupInterval) {
      // Already running, skip
      return;
    }

    TaskSubscriptionServiceClass.cleanupInterval = setInterval(() => {
      TaskSubscriptionService.cleanup(60); // Clean up subscriptions older than 1 hour
    }, 5 * 60 * 1000); // Run every 5 minutes

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    TaskSubscriptionServiceClass.cleanupInterval.unref();

    taskLogger.info('Task subscription periodic cleanup started');
  }

  /**
   * Stop periodic cleanup timer (Fix 4.2)
   */
  static stopPeriodicCleanup(): void {
    if (TaskSubscriptionServiceClass.cleanupInterval) {
      clearInterval(TaskSubscriptionServiceClass.cleanupInterval);
      TaskSubscriptionServiceClass.cleanupInterval = null;
      taskLogger.info('Task subscription periodic cleanup stopped');
    }
  }
}

// Create singleton instance
export const TaskSubscriptionService = new TaskSubscriptionServiceClass();

// Helper function to create task update events
export function createTaskUpdateEvent(
  taskId: string,
  type: TaskUpdateEvent['type'],
  changes: TaskUpdateEvent['changes'],
  metadata?: TaskUpdateEvent['metadata']
): TaskUpdateEvent {
  return {
    type,
    taskId,
    timestamp: new Date().toISOString(),
    changes,
    metadata
  };
}

// Helper function to publish task updates from other services
export function publishTaskUpdate(
  taskId: string,
  type: TaskUpdateEvent['type'],
  changes: TaskUpdateEvent['changes'],
  metadata?: TaskUpdateEvent['metadata']
): void {
  const update = createTaskUpdateEvent(taskId, type, changes, metadata);
  TaskSubscriptionService.publishTaskUpdate(update);
}

// TIME BOMB PREVENTION: Periodic cleanup auto-starts on singleton instantiation (Jan 2026)
// No need to call startPeriodicCleanup() manually - it runs automatically
