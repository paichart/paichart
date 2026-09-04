/**
 * Non-blocking Token Refresh Middleware
 * Queues async token refreshes if expiring soon
 * Does NOT block the request - continues processing with current token
 *
 * Part of OAuth Token Refresh Implementation v2.2
 */

import { oauthService } from './oauth-service';
import { authLogger } from '@/lib/logger';

const localLogger = authLogger.child({ module: 'TokenRefreshMiddleware' });

/**
 * Check if user's token needs refresh and queue async refresh if needed
 * Returns immediately - does not block request
 */
export async function checkAndQueueTokenRefresh(
  userId: string,
  provider?: string
): Promise<void> {
  try {
    // Access tokenStorage from the service
    const tokenStorage = (oauthService as any).constructor.tokenStorage as Map<string, any>;

    if (!tokenStorage) {
      return; // No token storage available
    }

    const storageKey = `oauth_${userId}`;
    const tokenData = tokenStorage.get(storageKey);

    if (!tokenData) {
      return; // No token found for user
    }

    const now = Date.now();
    const expiresAt = tokenData.expiresAt.getTime();
    const timeUntilExpiry = expiresAt - now;
    const tenMinutes = 10 * 60 * 1000;

    // If token expires within 10 minutes, queue background refresh
    if (timeUntilExpiry < tenMinutes && timeUntilExpiry > 0) {
      const minutesLeft = Math.round(timeUntilExpiry / (60 * 1000));
      localLogger.info({ userId, minutesLeft }, 'Token expiring soon, queueing refresh');

      // Queue async refresh (don't await - let it run in background)
      setImmediate(async () => {
        try {
          await oauthService.refreshOAuthToken(userId, provider || tokenData.provider);
        } catch (error) {
          localLogger.error({ err: error }, 'Background refresh error');
        }
      });
    }
  } catch (error) {
    localLogger.error({ err: error }, 'Error checking token');
    // Don't throw - middleware should never break request flow
  }
}

/**
 * Express-style middleware wrapper
 * For use in Express/Next.js middleware chains
 */
export function createTokenRefreshMiddleware() {
  return async (req: any, res: any, next: any) => {
    // Check if user context exists
    if (req.user && req.user.id) {
      // Queue async refresh check (non-blocking)
      checkAndQueueTokenRefresh(req.user.id, req.user.provider).catch(err => {
        localLogger.error({ err }, 'Middleware error');
      });
    }

    // Continue processing request immediately
    next();
  };
}

/**
 * Standalone function for use in MCP server auth flow
 */
export async function maybeRefreshToken(userId: string, provider?: string): Promise<void> {
  return checkAndQueueTokenRefresh(userId, provider);
}
