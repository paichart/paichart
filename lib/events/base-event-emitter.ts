/**
 * Base Event Emitter Class
 * Standardized event architecture with proven patterns from 90% database performance success
 * 
 * Eliminates pattern inconsistencies across event systems while maintaining:
 * - 90% database load reduction through shared connection pool
 * - Consistent error handling and reconnection logic  
 * - Unified event emission and validation patterns
 * - Memory leak prevention through proper lifecycle management
 * 
 * @version 1.0.0
 * @author Integration-Manager Specialist
 */

import { EventEmitter } from 'events';
import { getSharedEventConnectionPool } from './shared-connection-pool';
import { logger as pinoLogger } from '@/lib/logger';

export interface BaseEventConfig {
  systemName: string;
  channels: string[];
  maxListeners?: number;
  enableDebugLogging?: boolean;
}

export interface StandardizedEvent {
  id: string;
  action: string;
  timestamp: string;
  userId: string;
  data: any;
}

export abstract class BaseEventEmitter extends EventEmitter {
  protected sharedPool: any;
  protected isConnected = false;
  protected eventCount = 0;
  protected logger: any;
  protected systemName: string;
  protected channels: string[];
  protected config: BaseEventConfig;
  // Finding C (2026-06-14): lazy init. initPromise makes initialize() idempotent
  // under concurrent first-calls; the handler refs let disconnect() remove our
  // listeners from the shared-pool singleton (BC34 leak fix). Mirrors the
  // gold-standard lazy emitters (execution-events / prompt-registry-events).
  private initPromise: Promise<boolean> | null = null;
  private _connectedHandler: (() => void) | null = null;
  private _errorHandler: ((error: any) => void) | null = null;

  constructor(config: BaseEventConfig) {
    super();

    this.config = config;
    this.systemName = config.systemName;
    this.channels = config.channels;
    this.setMaxListeners(config.maxListeners || 100);

    // Standardized logger setup (consistent across all event systems)
    this.logger = this.createStandardizedLogger();

    // Finding C: NO eager connect in the constructor. The shared-pool connect is
    // a SCRAM footgun if a subclass is ever constructed at module load before
    // DATABASE_URL is available. Connect lazily via initialize() — pre-warmed once
    // at startup in lib/server-init.ts. emitDatabaseEvent() no-ops until connected.
  }

  /**
   * Standardized logger creation using pino child logger
   */
  private createStandardizedLogger() {
    return pinoLogger.child({ module: this.systemName });
  }

  /**
   * Explicit, idempotent lazy initialization (Finding C). Pre-warmed once at
   * startup (`lib/server-init.ts`); safe to call repeatedly — concurrent
   * first-calls coalesce on the same promise. Returns true once connected.
   */
  public async initialize(): Promise<boolean> {
    if (this.isConnected) return true;
    if (this.initPromise) {
      await this.initPromise;
      return this.isConnected;
    }
    this.initPromise = this.initializeWithSharedPool();
    await this.initPromise;
    return this.isConnected;
  }

  /**
   * Standardized shared connection pool initialization
   * Preserves 90% database performance gains from Plan 1
   */
  private async initializeWithSharedPool(): Promise<boolean> {
    try {
      // Use shared connection pool to eliminate connection duplication
      this.sharedPool = getSharedEventConnectionPool();

      // Set up listeners BEFORE registering (to not miss the 'connected' event).
      // BC34 FIX: store NAMED handler refs so disconnect() can removeListener them
      // from the process-wide shared-pool singleton — anonymous arrows leak one
      // pair per disconnect/reconnect cycle.
      this._connectedHandler = () => {
        this.isConnected = true;
        this.logger.info('Connected to shared PostgreSQL pool');
        this.emit('connected');
        this.onConnected();
      };
      this._errorHandler = (error: any) => {
        this.logger.error({ err: error }, 'Shared connection error');
        this.handleConnectionError(error);
      };
      this.sharedPool.on('connected', this._connectedHandler);
      this.sharedPool.on(`error-${this.systemName}`, this._errorHandler);

      // Register this event system with unified pool
      await this.sharedPool.registerEventSystem(
        this.systemName,
        this.channels,
        (msg: any) => this.handleDatabaseNotification(msg)
      );

      // Already-connected race check: if the pool connected before our listener
      // attached, the 'connected' event already fired — adopt it.
      const stats = this.sharedPool.getConnectionStats?.();
      if (stats?.isConnected && !this.isConnected) {
        this.isConnected = true;
        this.onConnected();
        this.logger.info('Connected to shared PostgreSQL pool (already established)');
      }

      this.logger.info('Initialized with shared connection pool');
      return this.isConnected;

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize with shared pool');
      this.handleConnectionError(error);
      this.initPromise = null; // allow a later retry after a failed init
      return false;
    }
  }

  /**
   * Standardized database notification handling
   * Consistent across all event systems
   */
  private handleDatabaseNotification(notification: any): void {
    try {
      if (!notification.payload) {
        this.logger.debug('Received notification without payload');
        return;
      }

      const eventData = JSON.parse(notification.payload);
      this.validateAndEmitEvent(eventData, notification.channel);
      
      this.eventCount++;
      this.logger.debug({ channel: notification.channel, action: eventData.action }, 'Processed event');
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to process database notification');
    }
  }

  /**
   * Standardized event validation and emission
   * Abstract method - each system implements specific validation
   */
  protected abstract validateAndEmitEvent(eventData: any, channel: string): void;

  /**
   * Standardized event emission to database
   * Consistent PostgreSQL NOTIFY pattern across all systems
   */
  protected async emitDatabaseEvent(channel: string, eventData: any): Promise<void> {
    if (!this.isConnected || !this.sharedPool) {
      // SELF-HEAL (non-blocking): the singleton may live in a process that never
      // ran the server-init pre-warm (e.g. paichart-mcp calls initializeMCPServices,
      // not initializeServer), OR the shared pool permanently gave up after
      // maxReconnectAttempts. Kick off a background initialize() so the NEXT emit
      // can land — but do NOT await it here: the hot path stays non-blocking and
      // this event is still dropped by design. initialize()'s initPromise guard
      // dedupes concurrent heals; registerEventSystem re-connects the pool even
      // after its reconnect scheduler exhausted (shared-connection-pool.ts:71).
      this.logger.error({ channel }, 'Cannot emit event: not connected to shared pool (attempting background re-init)');
      void this.initialize().catch((err) => {
        this.logger.error({ err, channel }, 'Background re-init after failed emit also failed');
      });
      return;
    }

    try {
      await this.sharedPool.sendNotification(channel, eventData);
      this.logger.debug({ channel }, 'Sent event via shared pool');
    } catch (error) {
      this.logger.error({ err: error, channel }, 'Failed to send event');
      throw error;
    }
  }

  /**
   * Standardized connection error handling
   * Consistent across all event systems
   */
  protected handleConnectionError(error: any): void {
    this.isConnected = false;
    this.emit('error', error);
    this.onConnectionError(error);
  }

  /**
   * Standardized stats collection
   * Consistent monitoring across all event systems
   */
  public getStandardizedStats(): any {
    const sharedStats = this.sharedPool ? this.sharedPool.getConnectionStats() : {};
    return {
      systemName: this.systemName,
      isConnected: this.isConnected,
      eventCount: this.eventCount,
      channels: this.channels,
      listenerCount: this.listenerCount('*'),
      sharedPoolStats: sharedStats,
      customStats: this.getCustomStats()
    };
  }

  /**
   * Standardized cleanup and disconnection
   * Proper resource management to prevent memory leaks
   */
  public async disconnect(): Promise<void> {
    try {
      // BC34 FIX: remove OUR handlers from the shared-pool singleton BEFORE
      // unregistering — without this, repeated disconnect/reconnect cycles leak
      // the 'connected' / `error-${systemName}` handlers on the process-wide pool.
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
        await this.sharedPool.unregisterEventSystem(this.systemName);
        this.isConnected = false;
      }

      // Remove all listeners on THIS emitter to prevent memory leaks
      this.removeAllListeners();
      // Allow a future initialize() to reconnect cleanly
      this.initPromise = null;

      this.logger.info('Disconnected from shared PostgreSQL pool');
      this.onDisconnected();
      
    } catch (error) {
      this.logger.error({ err: error }, 'Error during disconnect');
    }
  }

  // Abstract methods for system-specific behavior
  protected abstract onConnected(): void;
  protected abstract onConnectionError(error: any): void;
  protected abstract onDisconnected(): void;
  protected abstract getCustomStats(): any;
}

export default BaseEventEmitter;