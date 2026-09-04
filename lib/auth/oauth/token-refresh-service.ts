/**
 * Background service for proactive OAuth token refresh
 * Uses in-memory token storage (no database queries)
 *
 * Part of OAuth Token Refresh Implementation v2.2
 * Checks every 5 minutes and refreshes tokens expiring within 10 minutes
 */

import { oauthLogger } from './oauth-logger';
import { authLogger } from '@/lib/logger';

// Import the tokenStorage directly to avoid constructor access issues
// The EnterpriseOAuthService class has a static tokenStorage Map
let tokenStorage: Map<string, any>;
let oauthServiceInstance: any;

// Lazy initialization to avoid circular dependency
function getTokenStorage(): Map<string, any> {
  if (!tokenStorage) {
    // Dynamic import to avoid circular dependency at module load time
    const { oauthService } = require('./oauth-service');
    oauthServiceInstance = oauthService;
    tokenStorage = (oauthService as any).constructor.tokenStorage as Map<string, any>;
  }
  return tokenStorage;
}

// Get oauth service instance (lazy loaded)
function getOAuthService(): any {
  if (!oauthServiceInstance) {
    const { oauthService } = require('./oauth-service');
    oauthServiceInstance = oauthService;
    if (!tokenStorage) {
      tokenStorage = (oauthService as any).constructor.tokenStorage as Map<string, any>;
    }
  }
  return oauthServiceInstance;
}

// Global state storage key for cross-process communication
const SERVICE_STATE_KEY = '__token_refresh_service_state__';

interface ServiceState {
  running: boolean;
  lastRun: number | null;
  startedAt: number | null;
}

export class TokenRefreshService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs = 5 * 60 * 1000; // 5 minutes
  private readonly refreshThresholdMs = 10 * 60 * 1000; // Refresh 10 min before expiry

  /**
   * Get shared state storage (accessible across Next.js processes)
   */
  private getStateStorage(): Map<string, any> {
    return getTokenStorage();
  }

  /**
   * Get current service state from shared storage
   */
  private getState(): ServiceState {
    const storage = this.getStateStorage();
    const state = storage.get(SERVICE_STATE_KEY);
    return state || { running: false, lastRun: null, startedAt: null };
  }

  /**
   * Update service state in shared storage
   */
  private setState(updates: Partial<ServiceState>): void {
    const storage = this.getStateStorage();
    const currentState = this.getState();
    const newState = { ...currentState, ...updates };
    storage.set(SERVICE_STATE_KEY, newState);
  }

  /**
   * Start background token refresh service
   */
  start(): void {
    const state = this.getState();
    if (state.running) {
      authLogger.debug('token refresh service already running');
      return;
    }

    this.setState({ running: true, startedAt: Date.now() });
    authLogger.info({ intervalMs: this.checkIntervalMs }, 'token refresh service started (in-memory storage)');

    // Run immediately on start
    this.checkAndRefreshTokens();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAndRefreshTokens();
    }, this.checkIntervalMs);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    this.intervalId.unref();
  }

  /**
   * Stop background service
   */
  stop(): void {
    const state = this.getState();
    if (!state.running) {
      authLogger.debug('token refresh service not running');
      return;
    }

    this.setState({ running: false, lastRun: null, startedAt: null });
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    authLogger.info('token refresh service stopped');
  }

  /**
   * Check all in-memory tokens and refresh those expiring soon
   */
  private async checkAndRefreshTokens(): Promise<void> {
    const state = this.getState();
    if (!state.running) return;

    const startTime = Date.now();
    const now = Date.now();
    const refreshThreshold = now + this.refreshThresholdMs;

    authLogger.debug('starting token expiry check');

    try {
      // Access tokenStorage from the service (using bracket notation for private static)
      const tokenStorage = this.getStateStorage();

      // Count actual tokens (exclude service state entry)
      const tokenCount = Array.from(tokenStorage.keys()).filter(k => k !== SERVICE_STATE_KEY).length;

      if (tokenCount === 0) {
        authLogger.debug('no tokens in storage');
        this.setState({ lastRun: Date.now() });
        return;
      }

      authLogger.debug({ tokenCount }, 'checking tokens for expiry');

      const tokensToRefresh: Array<{ userId: string; provider: string }> = [];

      for (const [key, tokenData] of tokenStorage.entries()) {
        // Skip service state entry
        if (key === SERVICE_STATE_KEY) continue;

        const expiresAt = tokenData.expiresAt.getTime();

        // Check if token expires within threshold
        if (expiresAt < refreshThreshold) {
          const minutesUntilExpiry = Math.round((expiresAt - now) / (60 * 1000));
          authLogger.info({ userId: tokenData.userId, minutesUntilExpiry }, 'token expiring soon');

          tokensToRefresh.push({
            userId: tokenData.userId,
            provider: tokenData.provider
          });
        }
      }

      authLogger.debug({ count: tokensToRefresh.length }, 'tokens queued for refresh');

      // Refresh tokens (with rate limiting)
      let refreshedCount = 0;
      let failedCount = 0;

      for (const { userId, provider } of tokensToRefresh) {
        try {
          // Rate limit: 1 refresh per second
          await new Promise(resolve => setTimeout(resolve, 1000));

          const result = await getOAuthService().refreshOAuthToken(userId, provider);

          if (result) {
            refreshedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          authLogger.error({ err: error, userId, provider }, 'token refresh failed');

          oauthLogger.log({
            userId,
            provider,
            action: 'refresh_failed',
            success: false,
            errorMessage,
            requestId: `background-${Date.now()}`
          });
        }
      }

      const executionTimeMs = Date.now() - startTime;
      this.setState({ lastRun: Date.now() });

      authLogger.info({ refreshedCount, failedCount, executionTimeMs }, 'token refresh cycle completed');
    } catch (error) {
      authLogger.error({ err: error }, 'token refresh check error');
    }
  }

  /**
   * Get service health status
   * This method reads from shared storage, making it accessible across Next.js processes
   */
  getServiceHealth(): {
    running: boolean;
    lastRun: Date | null;
    tokensInMemory: number;
  } {
    try {
      const state = this.getState();
      const tokenStorage = this.getStateStorage();

      // Count actual tokens (exclude service state entry)
      const tokenCount = Array.from(tokenStorage.keys()).filter(k => k !== SERVICE_STATE_KEY).length;

      return {
        running: state.running,
        lastRun: state.lastRun ? new Date(state.lastRun) : null,
        tokensInMemory: tokenCount
      };
    } catch (error) {
      return {
        running: false,
        lastRun: null,
        tokensInMemory: 0
      };
    }
  }

  /**
   * Manually trigger token check (for testing/admin)
   */
  async triggerCheck(): Promise<void> {
    const state = this.getState();
    if (!state.running) {
      throw new Error('Token refresh service is not running');
    }

    authLogger.info('manual token refresh triggered');
    await this.checkAndRefreshTokens();
  }
}

// Singleton instance
export const tokenRefreshService = new TokenRefreshService();
