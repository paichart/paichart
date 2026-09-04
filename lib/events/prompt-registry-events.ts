/**
 * Prompt Registry Events System
 * Real-time prompt updates and registry synchronization across all MCP sessions
 * 
 * Features:
 * - Event broadcasting for prompt create/update/delete operations  
 * - Cache invalidation and refresh across all active sessions
 * - Leverages existing PostgreSQL NOTIFY/LISTEN infrastructure
 * 
 * @version 1.0.0
 * @author Prompt-Construction Specialist
 */

import { EventEmitter } from 'events';
import { Client } from 'pg';
import { prisma } from '../prisma';
import { getSharedEventConnectionPool } from './shared-connection-pool';
import { logger } from '@/lib/logger';

export interface PromptRegistryEvent {
  id: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed';
  promptId: string;
  promptName: string;
  data: {
    name: string;
    category?: string;
    tags?: string[];
    status?: string;
    isPublic?: boolean;
    mcpEnabled?: boolean;
  };
  timestamp: string;
  userId: string;
}

export class PromptRegistryEventEmitter extends EventEmitter {
  private sharedPool: any;
  private isConnected = false;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private eventCount = 0;
  private logger: any;
  private systemName = 'prompt-registry-events';
  private channels = ['prompt_registry_events'];
  // BC34: Handler refs for cleanup in disconnect()
  private _connectedHandler: (() => void) | null = null;
  private _errorHandler: ((error: any) => void) | null = null;

  constructor() {
    super();
    this.setMaxListeners(50); // Allow many MCP sessions to listen

    this.logger = logger.child({ module: 'PromptRegistryEvents' });

    // FIX: Don't initialize in constructor - use lazy initialization instead
    // This prevents SCRAM authentication error when DATABASE_URL isn't available during module load
    this.logger.info('PromptRegistryEventEmitter created (lazy initialization - call initialize() to connect)');
  }

  /**
   * Explicitly initialize the event emitter connection.
   * Call this AFTER the server has started and environment variables are loaded.
   * Safe to call multiple times - will reuse existing initialization.
   */
  public async initialize(): Promise<boolean> {
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
      // PERFORMANCE FIX: Use shared connection pool for prompt registry events
      // Contributes to reducing PostgreSQL connections from 3 to 1
      this.sharedPool = getSharedEventConnectionPool();

      // FIX: Set up event listeners BEFORE registering (to not miss 'connected' event)
      // BC34 FIX: Store handler refs for cleanup in disconnect()
      this._connectedHandler = () => {
        this.isConnected = true;
        this.logger.info('Connected to shared PostgreSQL pool for prompt registry events');
        this.emit('connected');
      };
      this._errorHandler = (error: any) => {
        this.logger.error({ err: error }, 'Shared connection error');
        this.isConnected = false;
        this.emit('error', error);
      };
      this.sharedPool.on('connected', this._connectedHandler);
      this.sharedPool.on(`error-${this.systemName}`, this._errorHandler);

      // Register prompt registry event system with shared pool
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

      this.logger.info('Prompt registry events initialized with shared connection pool');

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize with shared pool');
      this.isConnected = false;
      this.emit('error', error);
    }
  }

  private handleDatabaseNotification(notification: any) {
    try {
      if (!notification.payload) {
        this.logger.debug('Received notification without payload');
        return;
      }

      const eventData = JSON.parse(notification.payload);
      this.validateAndEmitEvent(eventData);
      
      this.eventCount++;
      this.logger.debug({ action: eventData.action }, 'Processed prompt registry event');

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to process database notification');
    }
  }

  private validateAndEmitEvent(eventData: any) {
    // Validate event structure
    if (!eventData.promptId || !eventData.action || !eventData.promptName) {
      this.logger.error({ promptId: eventData.promptId, action: eventData.action }, 'Invalid prompt event data structure');
      return;
    }

    // Create standardized event
    const promptEvent: PromptRegistryEvent = {
      id: eventData.id || eventData.promptId,
      action: eventData.action,
      promptId: eventData.promptId,
      promptName: eventData.promptName,
      data: {
        name: eventData.promptName,
        category: eventData.category,
        tags: eventData.tags,
        status: eventData.status,
        isPublic: eventData.isPublic,
        mcpEnabled: eventData.tags?.includes('mcp') || false
      },
      timestamp: new Date().toISOString(),
      userId: eventData.userId || 'system'
    };

    // Emit specific events
    this.emit('prompt-registry-change', promptEvent);
    this.emit(`prompt-${promptEvent.action}`, promptEvent);
    this.emit(`prompt-${eventData.promptId}`, promptEvent); // Prompt-specific events
    
    // Emit cache invalidation event
    this.emit('cache-invalidate', { promptName: eventData.promptName, action: eventData.action });
    
    this.logger.debug({ action: promptEvent.action, promptName: promptEvent.promptName }, 'Emitted prompt event');
  }

  // Connection error handling and reconnection now managed by BaseEventEmitter

  public async emitPromptEvent(action: string, prompt: any, userId: string = 'system') {
    const eventData = {
      id: prompt.id,
      promptId: prompt.id,
      promptName: prompt.name,
      action,
      category: prompt.category,
      tags: prompt.tags,
      status: prompt.status,
      isPublic: prompt.isPublic,
      userId,
      timestamp: new Date().toISOString()
    };

    // Emit locally
    this.validateAndEmitEvent(eventData);

    // Notify other processes via shared PostgreSQL connection
    // FIX: Check if event system is connected before sending notification
    if (!this.isConnected || !this.sharedPool) {
      this.logger.warn({ action }, 'Event system not connected - skipping NOTIFY (prompt will require manual MCP restart)');
      return;
    }

    try {
      await this.sharedPool.sendNotification('prompt_registry_events', eventData);
      this.logger.debug({ action }, 'Sent prompt registry notification via shared pool');
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to send prompt registry notification');
    }
  }

  public getStats() {
    const sharedStats = this.sharedPool ? this.sharedPool.getConnectionStats() : {};
    return {
      isConnected: this.isConnected,
      eventCount: this.eventCount,
      listenerCount: this.listenerCount('prompt-registry-change'),
      sharedPoolStats: sharedStats,
      systemName: this.systemName,
      channels: this.channels
    };
  }

  public async disconnect() {
    try {
      // BC34 FIX: Remove our listeners from the shared pool singleton
      if (this.sharedPool) {
        if (this._connectedHandler) this.sharedPool.removeListener('connected', this._connectedHandler);
        if (this._errorHandler) this.sharedPool.removeListener(`error-${this.systemName}`, this._errorHandler);
      }
      if (this.isConnected && this.sharedPool) {
        await this.sharedPool.unregisterEventSystem(this.systemName);
        this.isConnected = false;
      }
      this.removeAllListeners();
      this.logger.info('Disconnected from shared PostgreSQL pool');
    } catch (error) {
      this.logger.error({ err: error }, 'Error during disconnect');
    }
  }
}

// Global singleton instance (shared across webpack chunks and server processes)
declare global {
  var promptRegistryEvents: PromptRegistryEventEmitter | undefined;
}

export function getPromptRegistryEventEmitter(): PromptRegistryEventEmitter {
  if (!global.promptRegistryEvents) {
    global.promptRegistryEvents = new PromptRegistryEventEmitter();
  }
  return global.promptRegistryEvents;
}

/**
 * Initialize the prompt registry event emitter.
 * Call this AFTER the server has started and environment variables are loaded.
 *
 * @returns Promise<boolean> - true if initialization succeeded, false otherwise
 *
 * Usage in MCP server startup:
 * ```
 * import { initializePromptRegistryEvents } from './lib/events/prompt-registry-events';
 *
 * async function startServer() {
 *   // ... other initialization
 *   const eventsReady = await initializePromptRegistryEvents();
 *   if (eventsReady) {
 *     console.log('Real-time prompt events enabled');
 *   } else {
 *     console.warn('Prompt events disabled - manual restart required for updates');
 *   }
 * }
 * ```
 */
export async function initializePromptRegistryEvents(): Promise<boolean> {
  try {
    const emitter = getPromptRegistryEventEmitter();
    return await emitter.initialize();
  } catch (error) {
    logger.child({ module: 'PromptRegistryEvents' }).error({ err: error }, 'Failed to initialize');
    return false;
  }
}

export default PromptRegistryEventEmitter;