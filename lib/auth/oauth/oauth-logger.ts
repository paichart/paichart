/**
 * OAuth Enhanced File Logger
 * Structured logging to file with rotation
 *
 * Part of OAuth Token Refresh Implementation v2.2
 * Provides file-based audit trail for all OAuth operations
 */

import fs from 'fs';
import path from 'path';
import { authLogger } from '@/lib/logger';

const localLogger = authLogger.child({ module: 'OAuthLogger' });

interface OAuthLogEvent {
  userId: string;
  provider: string;
  action: string;
  success: boolean;
  errorMessage?: string;
  requestId?: string;
  correlationId?: string;        // NEW: Track entire OAuth flow
  executionTimeMs?: number;
  durationMs?: number;            // NEW: Flow duration
  tokenRotated?: boolean;
  encryptionVersion?: number;
  ipAddress?: string;
  userAgent?: string;
  clientId?: string;              // NEW: OAuth client ID
  redirectUri?: string;           // NEW: Callback URI
  metadata?: Record<string, any>; // NEW: Additional context (scope, resource, etc.)
}

export class OAuthLogger {
  private logDir: string;
  private logFile: string;
  private directoryEnsured = false;
  private logLevel: string;       // NEW: Configurable log level

  constructor() {
    // BC53 FIX: Validate OAUTH_LOG_DIR against path traversal and restrict to allowed prefixes
    const ALLOWED_LOG_PREFIXES = ['/var/log/', '/tmp/', '/var/www/'];
    const rawLogDir = process.env.OAUTH_LOG_DIR || '/var/log/paichart';
    const resolvedDir = path.resolve(rawLogDir);
    const isAllowed = ALLOWED_LOG_PREFIXES.some(prefix => resolvedDir.startsWith(prefix));
    this.logDir = isAllowed && !resolvedDir.includes('..') ? resolvedDir : '/var/log/paichart';
    this.logFile = path.join(this.logDir, 'oauth-audit.log');
    this.logLevel = process.env.OAUTH_LOG_LEVEL || 'info';  // NEW: default 'info'

    // Don't create log directory during construction (causes EACCES during Next.js build)
    // Will be created lazily on first log() call
  }

  /**
   * Check if event should be logged based on log level
   * Levels: debug (0) < info (1) < warn (2) < error (3)
   */
  private shouldLog(eventLevel: string = 'info'): boolean {
    const levels: Record<string, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };

    const configLevel = levels[this.logLevel.toLowerCase()] ?? 1;
    const requestedLevel = levels[eventLevel.toLowerCase()] ?? 1;

    return requestedLevel >= configLevel;
  }

  /**
   * Ensure log directory exists, create if needed (lazy initialization)
   */
  private ensureLogDirectory(): void {
    if (this.directoryEnsured) return; // Already ensured, skip

    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
        localLogger.info({ logDir: this.logDir }, 'Created log directory');
      }
      this.directoryEnsured = true;
    } catch (error) {
      // Silently fallback to /tmp if unable to create in /var/log (e.g., during build)
      this.logDir = '/tmp/paichart';
      this.logFile = path.join(this.logDir, 'oauth-audit.log');

      try {
        if (!fs.existsSync(this.logDir)) {
          fs.mkdirSync(this.logDir, { recursive: true });
        }
        this.directoryEnsured = true;
      } catch (fallbackError) {
        // If /tmp also fails, just disable file logging (console logging still works)
        localLogger.warn('Could not create log directory, file logging disabled');
        this.directoryEnsured = false; // Will retry next time
      }
    }
  }

  /**
   * Log OAuth event with structured format.
   *
   * Emits the SAME sanitized event payload to both pino (live observability,
   * captured by PM2 and shippable to central log stores) and the on-disk audit
   * file (long-term retention, queryable via searchByUser/searchByProvider/getStats).
   *
   * Pino level routing:
   * - success: true  → info (normal operations, sampled at high volume in steady state)
   * - success: false → warn (failures bubble up in PM2 tail + observability dashboards)
   */
  log(event: OAuthLogEvent): void {
    const timestamp = new Date().toISOString();
    const status = event.success ? '✅' : '❌';

    // BC42 FIX: Sanitize user-controlled text fields before serialization to prevent log injection
    const sanitize = (v: string | undefined, max: number = 500) =>
      v ? String(v).substring(0, max).replace(/[\n\r\x00-\x1f]/g, '') : v;

    // Build single sanitized event payload — used by both pino + file paths.
    // Centralizes sanitization so pino and file never diverge on what's captured.
    const sanitizedEvent: OAuthLogEvent & { timestamp: string; status: string } = {
      ...event,
      errorMessage: sanitize(event.errorMessage),
      userAgent: sanitize(event.userAgent, 256),
      timestamp,
      status,
    };

    // Structured log (captured by PM2 + shippable to central log stores).
    // Was: localLogger.info with only 4 fields (action/provider/userId/success).
    // Now: ships the full sanitized event so observability stores have parity
    // with the on-disk audit log (correlationId, executionTimeMs, ipAddress,
    // clientId, redirectUri, metadata, etc. all preserved).
    const logLevel = event.success ? 'info' : 'warn';
    localLogger[logLevel](sanitizedEvent, 'OAuth audit event');

    // File log (long-term audit retention) - lazy initialization
    try {
      this.ensureLogDirectory(); // Ensure directory exists before writing (lazy)
      if (this.directoryEnsured) {
        fs.appendFileSync(this.logFile, JSON.stringify(sanitizedEvent) + '\n');
      }
    } catch (error) {
      // Don't let logging failures break OAuth flow
      // Silently skip file logging if directory creation failed
    }
  }

  /**
   * Get recent logs (for debugging)
   */
  getRecentLogs(lines: number = 100): string[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim());
      return allLines.slice(-lines);
    } catch (error) {
      localLogger.error({ err: error }, 'Failed to read logs');
      return [];
    }
  }

  /**
   * Search logs by user ID
   */
  searchByUser(userId: string, limit: number = 50): any[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.split('\n');

      return lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(log => log && log.userId === userId)
        .slice(-limit);
    } catch (error) {
      localLogger.error({ err: error }, 'Failed to search logs');
      return [];
    }
  }

  /**
   * Get logs by provider
   */
  searchByProvider(provider: string, limit: number = 50): any[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.split('\n');

      return lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(log => log && log.provider === provider)
        .slice(-limit);
    } catch (error) {
      localLogger.error({ err: error }, 'Failed to search logs by provider');
      return [];
    }
  }

  /**
   * Get failed operations
   */
  getFailures(limit: number = 50): any[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.split('\n');

      return lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(log => log && log.success === false)
        .slice(-limit);
    } catch (error) {
      localLogger.error({ err: error }, 'Failed to get failures');
      return [];
    }
  }

  /**
   * Get statistics for monitoring
   */
  getStats(since?: Date): {
    totalEvents: number;
    successCount: number;
    failureCount: number;
    byProvider: Record<string, number>;
    byAction: Record<string, number>;
  } {
    try {
      if (!fs.existsSync(this.logFile)) {
        return {
          totalEvents: 0,
          successCount: 0,
          failureCount: 0,
          byProvider: {},
          byAction: {}
        };
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.split('\n');

      const stats = {
        totalEvents: 0,
        successCount: 0,
        failureCount: 0,
        byProvider: {} as Record<string, number>,
        byAction: {} as Record<string, number>
      };

      const sinceTime = since ? since.getTime() : 0;

      lines.forEach(line => {
        try {
          const log = JSON.parse(line);

          // Filter by time if specified
          if (since) {
            const logTime = new Date(log.timestamp).getTime();
            if (logTime < sinceTime) return;
          }

          stats.totalEvents++;

          if (log.success) {
            stats.successCount++;
          } else {
            stats.failureCount++;
          }

          // Count by provider
          stats.byProvider[log.provider] = (stats.byProvider[log.provider] || 0) + 1;

          // Count by action
          stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
        } catch {
          // Skip invalid lines
        }
      });

      return stats;
    } catch (error) {
      localLogger.error({ err: error }, 'Failed to get stats');
      return {
        totalEvents: 0,
        successCount: 0,
        failureCount: 0,
        byProvider: {},
        byAction: {}
      };
    }
  }

  /**
   * Get log file path
   */
  getLogPath(): string {
    return this.logFile;
  }
}

// Singleton instance
export const oauthLogger = new OAuthLogger();
