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
  private initPromise: Promise<void> | null = null;
  private isReconnecting = false;
  private isShuttingDown = false;

  /**
   * FACT: the channels this pg SESSION is actually listening on.
   * Never derived from intent (connectedSystems is intent; this is observation).
   * Cleared only where the session itself is replaced or lost.
   */
  private listeningChannels: Set<string> = new Set();

  /** BC37: the one channel-name grammar for this file. */
  private static readonly SAFE_CHANNEL = /^[a-z_][a-z0-9_]{0,62}$/;
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
      
      // Register system.
      // BC37: validate at the WRITE site so the map can never hold a hostile value.
      // Validating only at the LISTEN site left invalid channels in the map (they were
      // `continue`d past the query but still stored), so any later consumer that trusted
      // registration.channels would interpolate unvalidated input into SQL.
      const validChannels = channels.filter((channel) => {
        if (!SharedEventConnectionPool.SAFE_CHANNEL.test(channel)) {
          this.logger.warn({ channel, systemName }, 'Rejected invalid channel name at registration');
          return false;
        }
        return true;
      });
      this.connectedSystems.set(systemName, {
        systemName,
        channels: validChannels,
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

      // Issue LISTEN through the SINGLE shared site. Full iteration (not a per-system
      // variant) keeps establishListens() the only place this file issues LISTEN — a
      // property rather than a comment. listeningChannels makes repeats a no-op.
      //
      // FAIL CLOSED, preserving the prior contract: before this refactor a failing
      // `LISTEN` query threw out of the loop and propagated to the caller. establishListens
      // COLLECTS failures instead of throwing, so registration must re-raise them itself —
      // otherwise a system registers "successfully" while deaf on its own channels, which
      // is the exact silent-failure class this change exists to remove.
      const listenResult = await this.establishListens();
      if (listenResult.failed.length > 0) {
        throw new Error(
          `LISTEN failed for ${listenResult.failed.length} channel(s) of ${systemName}: ` +
          listenResult.failed.map((f) => f.channel).join(', ')
        );
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
      // The session is new: nothing is listening on it yet.
      this.listeningChannels.clear();

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
        this.listeningChannels.clear();
        if (this.isShuttingDown) return;   // shutdown must not race a reconnect
        this.scheduleReconnect();
      });

      await this.pgClient.connect();
      // LISTEN is replayed BEFORE anything is flagged connected. Consumers must never
      // observe 'connected' over a session that is not actually listening.
      await this.activateConnection();

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize shared connection');
      this.handleConnectionError(error);
    }
  }

  /**
   * THE ONLY SITE IN THIS FILE THAT ISSUES `LISTEN`.
   * Runs against a connected-but-not-yet-flagged client:
   *   - MUST NOT read this.isConnected (it is false here, by design)
   *   - MUST NOT route through sendNotification() (that guards on isConnected -> deadlock)
   */
  private async establishListens(): Promise<{
    established: string[]; rejected: string[]; failed: Array<{ channel: string; err: unknown }>;
  }> {
    const established: string[] = [];
    const rejected: string[] = [];
    const failed: Array<{ channel: string; err: unknown }> = [];
    const client = this.pgClient;
    if (!client) {
      return { established, rejected, failed: [{ channel: '*', err: new Error('no client') }] };
    }

    for (const [systemName, reg] of this.connectedSystems) {
      if (!reg.isActive) continue;   // mirrors handleSharedNotification's routing predicate
      for (const channel of reg.channels) {
        // BC37 again AT the LISTEN site: never inherit trust from the caller, even though
        // the write site now validates too. Defence in depth on a SQL-interpolation path.
        if (!SharedEventConnectionPool.SAFE_CHANNEL.test(channel)) {
          this.logger.warn({ channel, systemName }, 'Rejected invalid channel name');
          rejected.push(channel);
          continue;
        }
        if (this.listeningChannels.has(channel)) { established.push(channel); continue; }
        try {
          await client.query(`LISTEN ${channel}`);
          this.listeningChannels.add(channel);
          established.push(channel);
        } catch (err) {
          failed.push({ channel, err });
        }
      }
    }
    return { established, rejected, failed };
  }

  /**
   * The ONLY site that flags the pool connected, and it does so only after LISTEN.
   * Fails CLOSED: a partial replay must never be reported as a healthy connection.
   */
  private async activateConnection(): Promise<void> {
    const r = await this.establishListens();
    if (r.failed.length > 0) {
      throw new Error(
        `LISTEN replay incomplete: ${r.failed.length} of ${r.failed.length + r.established.length} failed`
      );
    }
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.logger.info(
      { listening: r.established, rejected: r.rejected },
      'Shared PostgreSQL connection established for all event systems'
    );
    this.emit('connected');
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
    this.listeningChannels.clear();

    // Notify per-system FIRST. Previously the bare `emit('error')` below ran first and
    // THREW (EventEmitter throws on an unhandled 'error'), so this loop never ran:
    // consumers kept isConnected=true and their self-heal, gated on that flag, never
    // fired. The false fact disabled its own remedy.
    for (const systemName of this.connectedSystems.keys()) {
      // STRUCTURAL: the pool's own recovery must never depend on how a listener behaves.
      // A consumer that throws here previously unwound this loop and prevented
      // scheduleReconnect() below from running — the pool was held hostage by a listener.
      try {
        this.emit(`error-${systemName}`, error);
      } catch (listenerErr) {
        this.logger.error({ err: listenerErr, systemName }, 'Consumer error handler threw; continuing');
      }
    }

    // 'pool-error', never bare 'error'. A named event cannot throw when unlistened, so
    // there is no unhandled-emit hazard to defend against — the footgun is removed
    // rather than guarded, and cannot be reintroduced by deleting a listener.
    this.emit('pool-error', error);

    if (this.isShuttingDown) return;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    // BC24 FIX: Guard against re-entrant reconnect scheduling
    if (this.isReconnecting) {
      this.logger.debug('Reconnect already scheduled, skipping');
      return;
    }
    if (this.isShuttingDown) return;

    // P3: NO terminal give-up. The former cap (5 attempts / ~31s) made the pool go quiet
    // on any outage longer than that, invisibly — the same trade-off the deployment units
    // resolve the other way ("keeps trying and keeps logging why" beats "went quiet an
    // hour ago"). reconnectAttempts survives only to compute backoff.
    this.isReconnecting = true;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.logger.info({ delayMs: delay, attempt: this.reconnectAttempts + 1 }, 'Scheduling shared connection reconnect');

    const reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.isReconnecting = false;
      // Rejections route to handleConnectionError inside initializeConnection's catch;
      // this .catch is belt-and-braces so a retry can never become an unhandled rejection.
      this.initializeConnection().catch((err) => {
        this.logger.error({ err }, 'Reconnect attempt failed');
      });
    }, delay);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    reconnectTimeout.unref();
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
      // FACT, not intent: what this session is actually listening on. `isConnected` alone
      // cannot distinguish a healthy pool from a reconnected-but-deaf one.
      listeningChannels: Array.from(this.listeningChannels),
      systemDetails: Object.fromEntries(this.connectedSystems)
    };
  }

  public async gracefulDisconnect(): Promise<void> {
    this.isShuttingDown = true;
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