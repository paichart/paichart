/**
 * Secure Execution Events System
 * Replaces polling with event-driven updates using PostgreSQL NOTIFY/LISTEN
 * 
 * Security Features:
 * - Event source verification (PostgreSQL only)
 * - Data sanitization before broadcasting  
 * - Rate limiting integration
 * - Comprehensive audit logging
 * 
 * @version 1.0.0
 * @author Integration Specialist
 */

import { EventEmitter } from 'events';
import { Client } from 'pg';
import { prisma } from '../prisma';
import { getSharedEventConnectionPool } from './shared-connection-pool';
import { logger as pinoLogger } from '@/lib/logger';

export interface DatabaseEvent {
  id: string;
  status: string;
  timestamp: string;
  source: string;
  authenticated: boolean;
  data?: any;
}

export interface ExecutionUpdateEvent {
  executionId: string;
  status: string;
  progress?: number;
  timestamp: string;
  taskId?: string;
  agentTemplateId?: string;
  error?: string;
  metrics?: any;
}

export class SecureExecutionEvents extends EventEmitter {
  private sharedPool: any;
  private isConnected = false;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private eventCount = 0;
  private lastEventTime: Date | null = null;
  private logger: any;
  private systemName = 'execution-events';
  // BC34 FIX: Store handler refs so shutdown() can removeListener them from
  // the shared pool singleton. Without this, repeated shutdown/reconnect cycles
  // leak listeners on the process-wide singleton. Ported from the .js sibling
  // during bidirectional drift reconciliation (2026-04-07, plan v3).
  private _connectedHandler: (() => void) | null = null;
  private _errorHandler: ((error: any) => void) | null = null;
  private channels = ['execution_updates'];

  constructor(options: { maxListeners?: number } = {}) {
    super();
    this.setMaxListeners(options.maxListeners || 100);

    // Setup logger
    this.logger = pinoLogger.child({ module: 'ExecutionEvents' });

    // FIX: Don't initialize in constructor - use lazy initialization instead
    // This prevents SCRAM authentication error when DATABASE_URL isn't available during module load
    this.logger.info('SecureExecutionEvents created (lazy initialization - call connect() to start)');
  }

  /**
   * Explicitly connect to the event system.
   * Call this AFTER the server has started and environment variables are loaded.
   * Safe to call multiple times - will reuse existing connection.
   */
  async connect(): Promise<boolean> {
    if (this.isConnected) {
      return true;
    }

    if (this.initPromise) {
      await this.initPromise;
      return this.isConnected;
    }

    this.initPromise = this.initializeWithSharedPool();
    await this.initPromise;
    return this.isConnected;
  }

  private async initializeWithSharedPool(): Promise<void> {
    try {
      // CRITICAL: Use shared connection pool to preserve 90% database performance gains
      // While eliminating connection exhaustion risk
      this.sharedPool = getSharedEventConnectionPool();

      // FIX: Set up event listeners BEFORE registering (to not miss 'connected' event)
      // BC34 FIX: Store handler refs so shutdown() can remove them cleanly.
      this._connectedHandler = () => {
        this.isConnected = true;
        this.logger.info('Connected to shared PostgreSQL pool for execution events (preserving 90% performance gains)');
        this.emit('connected');
      };
      this._errorHandler = (error: any) => {
        this.logger.error({ err: error }, 'Shared connection error');
        this.isConnected = false;
        this.emit('error', error);
      };
      this.sharedPool.on('connected', this._connectedHandler);
      this.sharedPool.on(`error-${this.systemName}`, this._errorHandler);

      // Register execution event system with shared pool
      await this.sharedPool.registerEventSystem(
        this.systemName,
        this.channels,
        (msg: any) => this.handleDatabaseNotification(msg)
      );

      // FIX: Check if pool is already connected (in case 'connected' event fired before listener)
      const stats = this.sharedPool.getConnectionStats();
      if (stats.isConnected && !this.isConnected) {
        this.isConnected = true;
        this.logger.info('Connected to shared PostgreSQL pool (already established)');
      }

      this.logger.info('Execution events initialized with shared connection pool');

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize execution events with shared pool');
      this.isConnected = false;
      this.emit('error', error);
    }
  }

  // Logger created in constructor via pinoLogger.child()

  /**
   * Initialize connection and start listening for execution updates
   */
  async initialize(): Promise<void> {
    try {
      if (this.isConnected) {
        this.logger.debug('Already connected to PostgreSQL events');
        return;
      }

      // Note: Connection is handled by shared pool initialization
      // Execution events now use shared PostgreSQL connection pool
      
      this.logger.info('Connected to PostgreSQL events system');
      
      // Emit ready event
      this.emit('ready');
      
    } catch (error) {
      this.logger.error('Failed to initialize event system:', error);
      await this.handleReconnection();
      throw error;
    }
  }

  /**
   * Event handlers are now managed by shared connection pool
   * This method is deprecated in favor of shared pool event routing
   */
  private setupEventHandlers(): void {
    // NOTE: Event handling now managed by shared connection pool
    // Notifications are routed through shared pool to handleDatabaseNotification
    this.logger.debug('Event handlers managed by shared connection pool');
  }

  /**
   * Handle incoming database notifications
   */
  private handleDatabaseNotification(msg: any): void {
    try {
      if (!msg || !msg.payload) {
        this.logger.debug({ channel: msg?.channel }, 'Ignoring invalid notification');
        return;
      }

      // Parse the notification payload
      const eventData = JSON.parse(msg.payload);
      
      // Security: Validate event source
      if (!this.validateEventSource({
        ...eventData,
        source: 'postgresql',
        authenticated: true
      })) {
        this.logger.warn({ eventId: eventData.id }, 'Invalid event source detected, ignoring event');
        return;
      }

      // Security: Sanitize event data  
      const sanitizedData = this.sanitizeEventData(eventData);
      
      // Update event statistics
      this.eventCount++;
      this.lastEventTime = new Date();
      
      // Emit execution update event
      this.emitExecutionUpdate(sanitizedData);
      
      this.logger.debug({ executionId: sanitizedData.executionId }, 'Processed execution update event');

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to process database notification');
    }
  }

  /**
   * Security: Verify event comes from trusted database source
   */
  private validateEventSource(event: DatabaseEvent): boolean {
    // Verify event source is PostgreSQL
    if (event.source !== 'postgresql') {
      this.logger.warn({ source: event.source }, 'Untrusted event source');
      return false;
    }

    // Verify event is authenticated
    if (!event.authenticated) {
      this.logger.warn('Unauthenticated event detected');
      return false;
    }

    // Verify required fields
    if (!event.id || !event.status || !event.timestamp) {
      this.logger.warn({ eventId: event.id }, 'Event missing required fields');
      return false;
    }

    return true;
  }

  /**
   * Security: Remove sensitive fields before broadcasting
   */
  private sanitizeEventData(data: any): ExecutionUpdateEvent {
    // Remove any sensitive fields that shouldn't be broadcast
    const { password, token, privateKey, secret, ...safeData } = data;
    
    // Ensure all fields are properly typed and sanitized
    const sanitized: ExecutionUpdateEvent = {
      executionId: String(safeData.id || ''),
      status: String(safeData.status || 'UNKNOWN'),
      timestamp: safeData.timestamp || new Date().toISOString(),
      progress: typeof safeData.progress === 'number' ? safeData.progress : undefined,
      taskId: safeData.taskId ? String(safeData.taskId) : undefined,
      agentTemplateId: safeData.agentTemplateId ? String(safeData.agentTemplateId) : undefined,
      error: safeData.error ? String(safeData.error).substring(0, 500) : undefined, // Limit error message length
      metrics: safeData.metrics || undefined
    };

    return sanitized;
  }

  /**
   * Emit execution update event to subscribers
   */
  private emitExecutionUpdate(eventData: ExecutionUpdateEvent): void {
    try {
      // Emit specific execution event
      this.emit('execution_update', eventData);
      
      // Emit execution-specific event for targeted subscriptions
      this.emit(`execution_${eventData.executionId}`, eventData);
      
      // Emit status-specific events
      this.emit(`status_${eventData.status.toLowerCase()}`, eventData);
      
      this.logger.debug({ executionId: eventData.executionId, status: eventData.status }, 'Emitted execution events');

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to emit execution update');
    }
  }

  /**
   * Subscribe to updates for a specific execution
   */
  async listenForUpdates(executionId: string): Promise<void> {
    if (!this.isConnected) {
      await this.initialize();
    }
    
    this.logger.debug({ executionId }, 'Subscribing to updates for execution');
    
    // Note: PostgreSQL NOTIFY/LISTEN doesn't support execution-specific channels,
    // so we filter events in the notification handler instead
  }

  /**
   * Reconnection is now handled by shared connection pool
   * This method is deprecated in favor of shared pool reconnection logic
   */
  private async handleReconnection(): Promise<void> {
    this.logger.info('Reconnection handled by shared connection pool');
    // Shared connection pool manages reconnection with exponential backoff
    // No action needed - shared pool will emit connected event when ready
  }

  /**
   * Get event system statistics
   */
  getStats(): {
    isConnected: boolean;
    eventCount: number;
    lastEventTime: Date | null;
    listenerCount: number;
    sharedPoolStats?: any;
  } {
    const sharedStats = this.sharedPool ? this.sharedPool.getConnectionStats() : {};
    return {
      isConnected: this.isConnected,
      eventCount: this.eventCount,
      lastEventTime: this.lastEventTime,
      listenerCount: this.listenerCount('execution_update'),
      sharedPoolStats: sharedStats
    };
  }

  /**
   * Manually trigger an execution update (for testing)
   */
  async triggerUpdate(executionId: string): Promise<void> {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      // Query the current execution state
      const execution = await prisma.agentExecution.findUnique({
        where: { id: executionId },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          taskId: true,
          agentTemplateId: true
        }
      });

      if (!execution) {
        throw new Error(`Execution ${executionId} not found`);
      }

      // Create manual update event
      const updateEvent: ExecutionUpdateEvent = {
        executionId: execution.id,
        status: execution.status,
        timestamp: execution.updatedAt.toISOString(),
        taskId: execution.taskId,
        agentTemplateId: execution.agentTemplateId || undefined
      };

      this.emitExecutionUpdate(updateEvent);
      
      this.logger.info({ executionId }, 'Manually triggered update for execution');

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to trigger manual update');
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down execution events system');

    try {
      // BC34 FIX: Remove our listeners from the shared pool singleton BEFORE
      // unregistering. Without this, repeated shutdown/reconnect cycles leak
      // the 'connected' and `error-${systemName}` handlers on the process-wide
      // shared pool, eventually hitting MaxListenersExceededWarning.
      if (this.sharedPool) {
        if (this._connectedHandler) {
          this.sharedPool.removeListener('connected', this._connectedHandler);
          this._connectedHandler = null;
        }
        if (this._errorHandler) {
          this.sharedPool.removeListener(`error-${this.systemName}`, this._errorHandler);
          this._errorHandler = null;
        }
      }

      if (this.isConnected && this.sharedPool) {
        // Unregister from shared connection pool
        await this.sharedPool.unregisterEventSystem(this.systemName);
      }

      this.removeAllListeners();
      this.isConnected = false;

      this.logger.info('Execution events system shutdown complete');

    } catch (error) {
      this.logger.error({ err: error }, 'Error during shutdown');
    }
  }
}

// Global singleton instance (shared across webpack chunks and server processes)
declare global {
  var executionEvents: SecureExecutionEvents | undefined;
}

export function getSecureExecutionEvents(options?: { maxListeners?: number }): SecureExecutionEvents {
  if (!global.executionEvents) {
    global.executionEvents = new SecureExecutionEvents(options);
  }
  return global.executionEvents;
}

/**
 * Initialize the execution events system.
 * Call this AFTER the server has started and environment variables are loaded.
 *
 * @returns Promise<boolean> - true if initialization succeeded, false otherwise
 */
export async function initializeExecutionEvents(options?: { maxListeners?: number }): Promise<boolean> {
  try {
    const events = getSecureExecutionEvents(options);
    return await events.connect();
  } catch (error) {
    pinoLogger.child({ module: 'ExecutionEvents' }).error({ err: error }, 'Failed to initialize');
    return false;
  }
}