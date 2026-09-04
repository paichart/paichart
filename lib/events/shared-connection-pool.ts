/**
 * Shared PostgreSQL Connection Pool for Event Systems
 * Eliminates connection pool exhaustion risk while maintaining 90% database performance gains
 * 
 * Reduces PostgreSQL connections from 3 separate connections to 1 shared connection
 * across all event emitters (execution, phase-stage, prompt-registry)
 * 
 * @version 1.0.0
 * @author Integration-Manager Specialist
 */

import { Client } from 'pg';
import { EventEmitter } from 'events';
import { prisma } from '../prisma';
import type { PrismaClient } from '@prisma/client';
import { logger as pinoLogger } from '@/lib/logger';

interface EventSystemRegistration {
  systemName: string;
  channels: string[];
  registeredAt: Date;
  isActive: boolean;
}

// Global singleton declaration (shared across webpack chunks)
declare global {
  var sharedEventConnectionPool: SharedEventConnectionPool | undefined;
}

export class SharedEventConnectionPool extends EventEmitter {
  private pgClient: Client | null = null;
  private isConnected = false;
  private connectedSystems: Map<string, EventSystemRegistration> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private initPromise: Promise<void> | null = null;
  private isReconnecting = false;
  private logger: any;

  private constructor() {
    super();
    this.setMaxListeners(50); // Allow multiple event systems to listen
    
    this.logger = pinoLogger.child({ module: 'SharedEventPool' });
  }

  public static getInstance(): SharedEventConnectionPool {
    if (!global.sharedEventConnectionPool) {
      global.sharedEventConnectionPool = new SharedEventConnectionPool();
    }
    return global.sharedEventConnectionPool;
  }

  public async registerEventSystem(
    systemName: string, 
    channels: string[], 
    notificationHandler: (msg: any) => void
  ): Promise<void> {
    try {
      this.logger.info({ systemName, channels }, 'Registering event system');
      
      // Register system
      this.connectedSystems.set(systemName, {
        systemName,
        channels,
        registeredAt: new Date(),
        isActive: true
      });

      // BC24 FIX: Guard against concurrent initialization race
      if (!this.isConnected) {
        if (!this.initPromise) {
          this.initPromise = this.initializeConnection().finally(() => {
            this.initPromise = null;
          });
        }
        await this.initPromise;
      }

      // Listen to channels for this system
      // BC37 FIX: Validate channel names to prevent SQL injection via LISTEN/UNLISTEN
      const SAFE_CHANNEL = /^[a-z_][a-z0-9_]{0,62}$/;
      for (const channel of channels) {
        if (!SAFE_CHANNEL.test(channel)) {
          this.logger.warn({ channel, systemName }, 'Rejected invalid channel name');
          continue;
        }
        await this.pgClient!.query(`LISTEN ${channel}`);
        this.logger.debug({ channel, systemName }, 'Listening to channel');
      }

      // Register notification handler for this system
      this.on(`notification-${systemName}`, notificationHandler);
      
      this.logger.info({ systemName }, 'Event system registered successfully');
      
    } catch (error) {
      this.logger.error({ err: error, systemName }, 'Failed to register event system');
      throw error;
    }
  }

  public async unregisterEventSystem(systemName: string): Promise<void> {
    try {
      const registration = this.connectedSystems.get(systemName);
      if (!registration) {
        this.logger.debug({ systemName }, 'Event system not registered');
        return;
      }

      // Stop listening to channels for this system
      // BC37 FIX: Same channel validation as registerEventSystem
      const SAFE_CHANNEL = /^[a-z_][a-z0-9_]{0,62}$/;
      if (this.isConnected && this.pgClient) {
        for (const channel of registration.channels) {
          if (!SAFE_CHANNEL.test(channel)) continue;
          await this.pgClient.query(`UNLISTEN ${channel}`);
          this.logger.debug({ channel }, 'Stopped listening to channel');
        }
      }

      // Remove notification handler
      this.removeAllListeners(`notification-${systemName}`);
      
      // Mark as inactive
      registration.isActive = false;
      this.connectedSystems.delete(systemName);
      
      this.logger.info({ systemName }, 'Event system unregistered');
      
      // If no active systems, consider disconnecting
      if (this.connectedSystems.size === 0) {
        this.logger.info('No active event systems, maintaining connection for reuse');
      }
      
    } catch (error) {
      this.logger.error({ err: error, systemName }, 'Failed to unregister event system');
    }
  }

  private async initializeConnection(): Promise<void> {
    try {
      // FIX: Ensure Prisma connection is established first (validates DATABASE_URL is available)
      // This fixes the SCRAM authentication error caused by undefined DATABASE_URL during module load
      this.logger.info('Verifying database connectivity via Prisma...');
      await (prisma as PrismaClient).$connect();

      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new Error('DATABASE_URL environment variable is not set after Prisma connect');
      }

      // FIX: Parse DATABASE_URL to handle query parameters correctly
      // Previous regex captured query params in database name (e.g., "copov15?pgbouncer=true")
      const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);

      const clientConfig = urlMatch ? {
        user: urlMatch[1],
        password: String(urlMatch[2]), // Ensure password is string for SCRAM
        host: urlMatch[3],
        port: parseInt(urlMatch[4], 10),
        database: urlMatch[5].split('?')[0], // Remove any remaining query params
        keepAlive: true,
        keepAliveInitialDelayMillis: 1000,
        connectionTimeoutMillis: 10000
      } : {
        connectionString: dbUrl,
        keepAlive: true,
        keepAliveInitialDelayMillis: 1000,
        connectionTimeoutMillis: 10000
      };

      this.logger.debug({
        user: clientConfig.user || 'from-connection-string',
        host: clientConfig.host || 'from-connection-string',
        database: clientConfig.database || 'from-connection-string',
      }, 'Creating pg.Client');

      this.pgClient = new Client(clientConfig);

      // Set up shared event handlers
      this.pgClient.on('notification', (msg) => {
        this.handleSharedNotification(msg);
      });

      this.pgClient.on('error', (err) => {
        this.logger.error({ err }, 'Shared PostgreSQL connection error');
        this.handleConnectionError(err);
      });

      this.pgClient.on('end', () => {
        this.logger.info('Shared PostgreSQL connection ended');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      await this.pgClient.connect();
      this.isConnected = true;
      this.reconnectAttempts = 0;

      this.logger.info('Shared PostgreSQL connection established for all event systems');
      this.emit('connected');

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize shared connection');
      this.handleConnectionError(error);
    }
  }

  private handleSharedNotification(notification: any): void {
    try {
      // Route notification to appropriate event system(s)
      for (const [systemName, registration] of this.connectedSystems) {
        if (registration.isActive && registration.channels.includes(notification.channel)) {
          this.emit(`notification-${systemName}`, notification);
          this.logger.debug({ channel: notification.channel, systemName }, 'Routed event to system');
        }
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to handle shared notification');
    }
  }

  private handleConnectionError(error: any): void {
    this.isConnected = false;
    this.emit('error', error);
    
    // Notify all registered systems of connection error
    for (const systemName of this.connectedSystems.keys()) {
      this.emit(`error-${systemName}`, error);
    }
    
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    // BC24 FIX: Guard against re-entrant reconnect scheduling
    if (this.isReconnecting) {
      this.logger.debug('Reconnect already scheduled, skipping');
      return;
    }
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.isReconnecting = true;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.logger.info({ delayMs: delay, attempt: this.reconnectAttempts + 1 }, 'Scheduling shared connection reconnect');

      const reconnectTimeout = setTimeout(() => {
        this.reconnectAttempts++;
        this.isReconnecting = false;
        this.initializeConnection();
      }, delay);

      // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
      reconnectTimeout.unref();
    } else {
      this.logger.error('Max reconnect attempts reached for shared connection');
      this.emit('max-reconnects-reached');
    }
  }

  public async sendNotification(channel: string, data: any): Promise<void> {
    if (!this.isConnected || !this.pgClient) {
      throw new Error('Shared connection not available for notification sending');
    }

    // BC37 FIX: Validate channel name to prevent SQL injection via NOTIFY.
    // Matches the LISTEN/UNLISTEN validation at line 82 of this file.
    // Ported from lib/events/shared-connection-pool.js as part of the
    // bidirectional drift reconciliation (2026-04-07, plan v3).
    const SAFE_CHANNEL = /^[a-z_][a-z0-9_]{0,62}$/;
    if (!SAFE_CHANNEL.test(channel)) {
      throw new Error(`Invalid channel name: ${channel.substring(0, 50)}`);
    }

    try {
      const payload = JSON.stringify(data);
      await this.pgClient.query(`NOTIFY ${channel}, '${payload.replace(/'/g, "''")}'`);
      this.logger.debug({ channel }, 'Sent notification via shared connection');
    } catch (error) {
      this.logger.error({ err: error, channel }, 'Failed to send notification');
      throw error;
    }
  }

  public getConnectionStats(): any {
    return {
      isConnected: this.isConnected,
      registeredSystems: this.connectedSystems.size,
      activeConnections: Array.from(this.connectedSystems.values()).filter(reg => reg.isActive).length,
      totalChannels: Array.from(this.connectedSystems.values()).reduce((sum, reg) => sum + reg.channels.length, 0),
      reconnectAttempts: this.reconnectAttempts,
      systemDetails: Object.fromEntries(this.connectedSystems)
    };
  }

  public async gracefulDisconnect(): Promise<void> {
    try {
      if (this.isConnected && this.pgClient) {
        // Unregister all systems
        const systemNames = Array.from(this.connectedSystems.keys());
        for (const systemName of systemNames) {
          await this.unregisterEventSystem(systemName);
        }
        
        await this.pgClient.end();
        this.logger.info('Shared connection pool gracefully disconnected');
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Error during graceful disconnect');
    }
  }
}

// Singleton access function
export function getSharedEventConnectionPool(): SharedEventConnectionPool {
  return SharedEventConnectionPool.getInstance();
}

export default SharedEventConnectionPool;