/**
 * API Key Service for User-Specific MCP Authentication
 * Generates and manages JWT-based API keys for individual users
 */

import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { UserRole } from '@/lib/types/auth';
import { authLogger } from '@/lib/logger';
import { mintMcpToken } from '@/lib/auth/token-manager';
import { MCP_FRONTDOOR_AUDIENCE } from '@/lib/auth/public-base-url';

const log = authLogger.child({ module: 'ApiKeyService' });

export interface ApiKeyData {
  token: string;
  jti: string;
  createdAt: string;
  expiresAt: string;
  purpose: string;
}

export interface UserApiKeySettings {
  apiKey?: ApiKeyData;
  apiKeyHistory?: ApiKeyData[];
}

export class ApiKeyService {
  /**
   * Generate a new API key for a user.
   *
   * 2026-06-04 HS256→RS256 migration: api keys are now RS256 first-party tokens
   * (via mintMcpToken), so they authenticate on the live RS256-only `/mcp` path.
   * `scope:'api-key'` is the revocation marker — `verifyAccessToken` gates a
   * single active-jti + fresh-role check on it (see `enforceActiveApiKey`).
   */
  static async generateApiKey(
    userId: string,
    expirationDays: number = 365,
    purpose: string = 'mcp-authentication'
  ): Promise<ApiKeyData> {
    // validation-engine I2: bound the TTL (1..365 days) — no negative/born-expired
    // or absurd-lifetime keys (revocation is the safety net, TTL is the backstop).
    if (!Number.isInteger(expirationDays) || expirationDays < 1 || expirationDays > 365) {
      throw new Error('expirationDays must be an integer between 1 and 365');
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const ttlSeconds = expirationDays * 24 * 60 * 60;

    // Generate the jti HERE so we persist it (the revocation allowlist) AND mint
    // with the same value (mint→storage must agree, or revocation silently no-ops).
    const jti = randomBytes(16).toString('hex');

    // mintMcpToken: RS256, sets iss=JWT_ISSUER (derived from APP_BASE_URL) + kid (JWT_KEY_ID), and
    // appends ' session:role-any' → scope becomes 'api-key session:role-any'.
    const token = await mintMcpToken({
      userId: user.id,
      email: user.email,
      role: user.role as unknown as UserRole,
      scope: 'api-key',
      audience: MCP_FRONTDOOR_AUDIENCE,  // mint + verifier accept-list are ONE unit (public-base-url.ts)
      ttlSeconds,
      jti,
      purpose: 'api-key',
    });

    const nowMs = Date.now();
    const apiKeyData: ApiKeyData = {
      token,
      jti,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttlSeconds * 1000).toISOString(),
      purpose
    };

    // Store in user settings
    await this.storeApiKey(userId, apiKeyData);

    return apiKeyData;
  }

  /**
   * Store API key in user settings
   */
  private static async storeApiKey(userId: string, apiKeyData: ApiKeyData): Promise<void> {
    // Atomic read-modify-write to prevent lost key history under concurrent key generation
    await prisma.$transaction(async (tx) => {
      const userSettings = await tx.userSettings.findUnique({
        where: { userId }
      });

      const currentSettings = userSettings?.settings as any || {};
      const apiKeySettings: UserApiKeySettings = currentSettings.apiKey || {};

      // Move current key to history if it exists
      if (apiKeySettings.apiKey) {
        apiKeySettings.apiKeyHistory = apiKeySettings.apiKeyHistory || [];
        apiKeySettings.apiKeyHistory.unshift(apiKeySettings.apiKey);

        // Keep only last 5 keys in history
        apiKeySettings.apiKeyHistory = apiKeySettings.apiKeyHistory.slice(0, 5);
      }

      // Set new key
      apiKeySettings.apiKey = apiKeyData;

      // Update settings
      const newSettings = {
        ...currentSettings,
        apiKey: apiKeySettings
      };

      await tx.userSettings.upsert({
        where: { userId },
        update: { settings: newSettings },
        create: {
          userId,
          settings: newSettings
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /**
   * Get user's current API key
   */
  static async getUserApiKey(userId: string): Promise<ApiKeyData | null> {
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    if (!userSettings?.settings) {
      return null;
    }

    const settings = userSettings.settings as any;
    const apiKeySettings: UserApiKeySettings = settings.apiKey || {};

    return apiKeySettings.apiKey || null;
  }

  /**
   * Get user's API key history
   */
  static async getUserApiKeyHistory(userId: string): Promise<ApiKeyData[]> {
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    if (!userSettings?.settings) {
      return [];
    }

    const settings = userSettings.settings as any;
    const apiKeySettings: UserApiKeySettings = settings.apiKey || {};

    return apiKeySettings.apiKeyHistory || [];
  }

  /**
   * Revoke user's current API key
   */
  static async revokeApiKey(userId: string): Promise<void> {
    // Atomic read-modify-write to prevent lost key history under concurrent revocation
    await prisma.$transaction(async (tx) => {
      const userSettings = await tx.userSettings.findUnique({
        where: { userId }
      });

      if (!userSettings?.settings) {
        return;
      }

      const currentSettings = userSettings.settings as any;
      const apiKeySettings: UserApiKeySettings = currentSettings.apiKey || {};

      // Move current key to history with revoked status
      if (apiKeySettings.apiKey) {
        const revokedKey = {
          ...apiKeySettings.apiKey,
          revokedAt: new Date().toISOString()
        };

        apiKeySettings.apiKeyHistory = apiKeySettings.apiKeyHistory || [];
        apiKeySettings.apiKeyHistory.unshift(revokedKey);
        apiKeySettings.apiKeyHistory = apiKeySettings.apiKeyHistory.slice(0, 5);
      }

      // Remove current key
      delete apiKeySettings.apiKey;

      // Update settings
      const newSettings = {
        ...currentSettings,
        apiKey: apiKeySettings
      };

      await tx.userSettings.update({
        where: { userId },
        data: { settings: newSettings }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /**
   * Check if API key is expired
   */
  static isApiKeyExpired(apiKey: ApiKeyData): boolean {
    return new Date(apiKey.expiresAt) < new Date();
  }

  /**
   * Get API key status
   */
  static getApiKeyStatus(apiKey: ApiKeyData): 'active' | 'expired' | 'revoked' {
    if ('revokedAt' in apiKey) {
      return 'revoked';
    }
    
    if (this.isApiKeyExpired(apiKey)) {
      return 'expired';
    }

    return 'active';
  }

  /**
   * Generate API key for MCP server usage (similar to original script)
   */
  static async generateMCPApiKey(
    userId: string,
    expirationDays: number = 365
  ): Promise<string> {
    const apiKeyData = await this.generateApiKey(userId, expirationDays, 'mcp-authentication');
    return apiKeyData.token;
  }

  /**
   * Revocation + fresh-role enforcement for an api-key-scoped RS256 token.
   *
   * Called from `verifyAccessToken` ONLY for tokens whose scope contains
   * 'api-key' — so OAuth/session tokens never incur this DB read and stay
   * stateless (preserves the D7 fresh-role-cache invariant). Returns the user's
   * CURRENT role; throws (fail-closed) if the user is inactive/missing OR the
   * presented jti is not the user's active api-key (revoked or superseded).
   *
   * One query reads role + status + the active-jti via the User.settings relation.
   * Active-jti path: userSettings.settings.apiKey.apiKey.jti.
   */
  static async enforceActiveApiKey(
    userId: string,
    presentedJti: string | undefined
  ): Promise<{ role: UserRole }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        settings: { select: { settings: true } },
      },
    });

    if (!user || user.status === 'INACTIVE') {
      log.warn(
        { userId, status: user?.status ?? 'not-found' },
        'auth_rejected_api_key_user_inactive'
      );
      throw new Error('API key user inactive or deleted');
    }

    const settings = (user.settings?.settings as any) ?? {};
    const activeJti: string | undefined = settings?.apiKey?.apiKey?.jti;

    // Fail-closed: absent active jti (revoked → key cleared) OR mismatch (superseded
    // by a regenerated key) → reject. sec-ops I4: distinct forensic event on replay.
    if (!activeJti || activeJti !== presentedJti) {
      log.warn(
        { userId, presentedJti: presentedJti ?? 'none', activeJti: activeJti ?? 'none' },
        'auth_rejected_api_key_revoked'
      );
      throw new Error('API key revoked or superseded');
    }

    log.debug({ userId, role: user.role }, 'API key active-jti validated');
    return { role: user.role as unknown as UserRole };
  }
}

export default ApiKeyService;
