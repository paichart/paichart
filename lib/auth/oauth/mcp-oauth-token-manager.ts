/**
 * MCP OAuth Token Manager
 *
 * Separate token storage for MCP OAuth (AI clients: Claude Desktop, ChatGPT, Gemini)
 * This maintains architectural boundary with Web App OAuth (browser users)
 *
 * Reference: /cline_docs/oauth-architecture-clarification.md
 * - System A: MCP OAuth - HYBRID (stateless GitHub, stateful Microsoft/Google)
 * - System B: Web App OAuth - Stateful (all providers)
 *
 * Created: 2025-10-14
 * Part of: Microsoft MCP OAuth Integration (Plan v3.2 - Phase 0.1)
 * Updated: 2025-10-14 (Phase 0.9 - Circuit breakers)
 */

import { CircuitBreaker, CircuitBreakerState } from './circuit-breaker-utils';
import { authLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { hashRefreshToken } from '@/lib/crypto/hashing';

const localLogger = authLogger.child({ module: 'MCPOAuthTokenManager' });

// TIME BOMB PREVENTION: Map size limits (Category 1: Unbounded Caches)
const MAX_MCP_TOKENS = 5000;

export interface MCPOAuthTokenData {
  userId: string;
  provider: 'microsoft' | 'google'; // GitHub tokens not stored (long-lived)
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  lastRefreshed: Date;
  refreshAttempts: number;
  createdAt: Date;
}

export interface RefreshTokenData {
  userId: string;
  scope: string;
  audience: string;
  clientId: string;
  expiresAt: Date;
  createdAt: Date;
}

export class MCPOAuthTokenManager {
  // Separate in-memory storage for MCP OAuth tokens
  private static mcpTokens = new Map<string, MCPOAuthTokenData>();

  // Phase 0.9: Circuit breakers per provider
  private static circuitBreakers = new Map<string, CircuitBreaker>();

  // Refresh tokens are DB-persisted (RefreshToken table, provider:'mcp') — see the
  // Refresh Token Management section below. No in-memory Map (survives pm2 restart).

  // Cleanup scheduler interval reference
  private static cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Store MCP OAuth token (Microsoft/Google only - GitHub uses stateless validation)
   */
  static storeToken(userId: string, data: Omit<MCPOAuthTokenData, 'createdAt'>): void {
    const tokenKey = `mcp_oauth_${userId}_${data.provider}`;

    // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
    if (this.mcpTokens.size >= MAX_MCP_TOKENS && !this.mcpTokens.has(tokenKey)) {
      const oldestKey = this.mcpTokens.keys().next().value;
      if (oldestKey) {
        this.mcpTokens.delete(oldestKey);
      }
    }

    this.mcpTokens.set(tokenKey, {
      ...data,
      createdAt: new Date()
    });

    localLogger.info({ provider: data.provider, userId, expiresInSeconds: Math.round((data.expiresAt.getTime() - Date.now()) / 1000) }, 'Stored MCP OAuth token');
  }

  /**
   * Get MCP OAuth token for user and provider
   */
  static getToken(userId: string, provider: 'microsoft' | 'google'): MCPOAuthTokenData | undefined {
    const tokenKey = `mcp_oauth_${userId}_${provider}`;
    return this.mcpTokens.get(tokenKey);
  }

  /**
   * Remove MCP OAuth token
   */
  static removeToken(userId: string, provider: 'microsoft' | 'google'): boolean {
    const tokenKey = `mcp_oauth_${userId}_${provider}`;
    const deleted = this.mcpTokens.delete(tokenKey);

    if (deleted) {
      localLogger.info({ provider, userId }, 'Removed MCP OAuth token');
    }

    return deleted;
  }

  /**
   * Get all MCP OAuth tokens (for health monitoring)
   */
  static getAllTokens(): Map<string, MCPOAuthTokenData> {
    return this.mcpTokens;
  }

  /**
   * Get MCP OAuth token count (for health monitoring)
   */
  static getTokenCount(): number {
    return this.mcpTokens.size;
  }

  /**
   * Get tokens expiring within threshold
   */
  static getExpiringTokens(
    thresholdMs: number = 10 * 60 * 1000
  ): Array<{ userId: string; provider: string; expiresIn: number }> {
    const now = Date.now();
    const threshold = now + thresholdMs;
    const expiring: Array<{ userId: string; provider: string; expiresIn: number }> = [];

    const entries = Array.from(this.mcpTokens.entries());
    for (const [key, tokenData] of entries) {
      const expiresAt = tokenData.expiresAt.getTime();
      if (expiresAt < threshold) {
        expiring.push({
          userId: tokenData.userId,
          provider: tokenData.provider,
          expiresIn: expiresAt - now
        });
      }
    }

    return expiring;
  }

  /**
   * Get token count by provider
   */
  static getTokenCountByProvider(provider: 'microsoft' | 'google'): number {
    let count = 0;
    const entries = Array.from(this.mcpTokens.entries());
    for (const [key, tokenData] of entries) {
      if (tokenData.provider === provider) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get expiring tokens for specific provider
   */
  static getExpiringTokensByProvider(
    provider: 'microsoft' | 'google',
    thresholdMs: number = 10 * 60 * 1000
  ): Array<{ userId: string; expiresIn: number }> {
    const now = Date.now();
    const threshold = now + thresholdMs;
    const expiring: Array<{ userId: string; expiresIn: number }> = [];

    const entries = Array.from(this.mcpTokens.entries());
    for (const [key, tokenData] of entries) {
      if (tokenData.provider === provider) {
        const expiresAt = tokenData.expiresAt.getTime();
        if (expiresAt < threshold) {
          expiring.push({
            userId: tokenData.userId,
            expiresIn: expiresAt - now
          });
        }
      }
    }

    return expiring;
  }

  /**
   * Type guard: Check if token is MCP OAuth token
   */
  static isMCPOAuthToken(tokenKey: string): boolean {
    return tokenKey.startsWith('mcp_oauth_');
  }

  /**
   * Phase 0.9: Get or create circuit breaker for provider
   */
  private static getCircuitBreaker(provider: string): CircuitBreaker {
    if (!this.circuitBreakers.has(provider)) {
      this.circuitBreakers.set(provider, new CircuitBreaker({
        failureThreshold: 5,      // Open after 5 failures
        successThreshold: 2,      // Close after 2 successes
        timeout: 60000,           // Reset after 60 seconds
        provider: provider
      }));
    }
    return this.circuitBreakers.get(provider)!;
  }

  /**
   * Phase 0.9: Check if circuit breaker allows operation
   */
  static isCircuitOpen(provider: string): boolean {
    const breaker = this.getCircuitBreaker(provider);
    return breaker.getState() === 'OPEN';
  }

  /**
   * Phase 0.9: Record successful operation
   */
  static recordSuccess(provider: string): void {
    const breaker = this.getCircuitBreaker(provider);
    breaker.recordSuccess();
  }

  /**
   * Phase 0.9: Record failed operation
   */
  static recordFailure(provider: string): void {
    const breaker = this.getCircuitBreaker(provider);
    breaker.recordFailure();
  }

  /**
   * Phase 0.9: Get circuit breaker state
   */
  static getCircuitBreakerState(provider: string): CircuitBreakerState {
    const breaker = this.circuitBreakers.get(provider);
    return breaker ? breaker.getState() : 'CLOSED';
  }

  /**
   * Phase 0.9: Get all circuit breaker states (for health monitoring)
   */
  static getAllCircuitBreakers(): Array<{
    provider: string;
    state: CircuitBreakerState;
    failures: number;
    lastFailure: Date | null;
  }> {
    const states: Array<{
      provider: string;
      state: CircuitBreakerState;
      failures: number;
      lastFailure: Date | null;
    }> = [];

    const entries = Array.from(this.circuitBreakers.entries());
    for (const [provider, breaker] of entries) {
      states.push(breaker.getStats());
    }

    return states;
  }

  /**
   * Phase 0.9: Manually reset circuit breaker
   */
  static resetCircuitBreaker(provider: string): void {
    const breaker = this.circuitBreakers.get(provider);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Clear all tokens (for testing or emergency shutdown)
   */
  static clearAllTokens(): void {
    const count = this.mcpTokens.size;
    this.mcpTokens.clear();
    localLogger.info({ clearedCount: count }, 'Cleared all MCP OAuth tokens');
  }

  /**
   * Get token statistics (for health monitoring)
   */
  static getTokenStats(): {
    total: number;
    byProvider: { microsoft: number; google: number };
    expiringWithin10Min: number;
    expiringWithin1Hour: number;
    expired: number;
  } {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    const stats = {
      total: this.mcpTokens.size,
      byProvider: { microsoft: 0, google: 0 },
      expiringWithin10Min: 0,
      expiringWithin1Hour: 0,
      expired: 0
    };

    const entries = Array.from(this.mcpTokens.entries());
    for (const [key, tokenData] of entries) {
      // Count by provider
      stats.byProvider[tokenData.provider]++;

      // Calculate time until expiry
      const expiresIn = tokenData.expiresAt.getTime() - now;

      if (expiresIn < 0) {
        stats.expired++;
      } else if (expiresIn < tenMinutes) {
        stats.expiringWithin10Min++;
      } else if (expiresIn < oneHour) {
        stats.expiringWithin1Hour++;
      }
    }

    return stats;
  }

  // ─── Refresh Token Management (DB-persisted — survives pm2 restart) ────
  // Persisted to the shared `RefreshToken` table; System A rows are discriminated
  // by provider:'mcp', mirroring the web route app/api/auth/refresh/route.ts. The raw
  // token is NEVER stored — only sha256(token) via hashRefreshToken (one pinned helper
  // across store/lookup/delete). Plan: cline_docs/reviews/mcp-refresh-token-persistence-2026-06-28/.

  /**
   * Validate-and-narrow a RefreshToken row → RefreshTokenData, else null (IM-A).
   * Rejects an expired row OR any row missing a privilege/identity field: a null
   * `scope` would be coerced to 'user:email' by mintMcpToken (token-manager.ts:252),
   * silently narrowing the token through rotation (BC-1); a null `audience` throws
   * there; a null `clientId` breaks the E.8 cross-client guard.
   */
  private static rowToData(
    row: { userId: string | null; scope: string | null; audience: string | null; clientId: string | null; expiresAt: Date; createdAt: Date } | null
  ): RefreshTokenData | null {
    if (!row) return null;
    if (row.expiresAt <= new Date()) return null;
    if (!row.userId || !row.scope || !row.audience || !row.clientId) return null;
    return {
      userId: row.userId,
      scope: row.scope,
      audience: row.audience,
      clientId: row.clientId,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }

  /**
   * Store an MCP refresh token (hashed) in the RefreshToken table.
   */
  static async storeRefreshToken(
    refreshToken: string,
    data: Omit<RefreshTokenData, 'expiresAt' | 'createdAt'>
  ): Promise<void> {
    const ttlDays = parseInt(config.jwt.refreshExpiration, 10) || 7;
    await prisma.refreshToken.create({
      data: {
        token: hashRefreshToken(refreshToken),
        userId: data.userId,
        scope: data.scope,
        audience: data.audience,
        clientId: data.clientId,
        provider: 'mcp',
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });
    localLogger.info({ userId: data.userId }, 'MCP refresh token stored (DB, 7-day TTL)');
  }

  /**
   * Get refresh token data — null if not an MCP token, not found, expired, or partial.
   */
  static async getRefreshToken(token: string): Promise<RefreshTokenData | null> {
    // CR-2: prefix pre-gate — a non-mcp token cannot be an MCP refresh token; reject before any DB hit
    if (!token.startsWith('mcp_refresh_')) return null;
    const row = await prisma.refreshToken.findFirst({
      where: { token: hashRefreshToken(token), provider: 'mcp', expiresAt: { gt: new Date() } },
      select: { userId: true, scope: true, audience: true, clientId: true, expiresAt: true, createdAt: true },
    });
    return this.rowToData(row);
  }

  /**
   * Remove an MCP refresh token — REVOCATION / sign-out only. NOT for rotation: the
   * refresh grant deletes inside its own transaction so a missing row aborts the grant
   * (one-time-use, CR-1). This helper swallows a miss, so it must not gate rotation.
   */
  static async removeRefreshToken(token: string): Promise<boolean> {
    const res = await prisma.refreshToken.deleteMany({
      where: { token: hashRefreshToken(token), provider: 'mcp' },
    });
    if (res.count > 0) localLogger.info('MCP refresh token removed');
    return res.count > 0;
  }

  /**
   * Remove all MCP refresh tokens for a user ("sign out everywhere"). Scoped to
   * provider:'mcp' so it never deletes the user's browser-OAuth (System B) rows.
   */
  static async removeRefreshTokensByUser(userId: string): Promise<number> {
    const res = await prisma.refreshToken.deleteMany({ where: { userId, provider: 'mcp' } });
    if (res.count > 0) localLogger.info({ userId, removed: res.count }, 'MCP refresh tokens cleared for user');
    return res.count;
  }

  /**
   * Count of live MCP refresh tokens (monitoring). Scoped to provider:'mcp'.
   */
  static async getRefreshTokenCount(): Promise<number> {
    return prisma.refreshToken.count({ where: { provider: 'mcp' } });
  }

  // NB: expired-row cleanup is global via compliance-monitor.js cleanupExpiredRefreshTokens
  // (table-wide) — no MCP-specific janitor here (IM-4; the W2 read-time expiresAt filter
  // already hides expired rows).

  /**
   * Clean expired OAuth tokens (mcpTokens Map)
   */
  static cleanExpiredTokens(): number {
    const now = Date.now();
    let cleaned = 0;

    const tokenEntries = Array.from(this.mcpTokens.entries());
    for (const [key, tokenData] of tokenEntries) {
      if (tokenData.expiresAt.getTime() < now) {
        this.mcpTokens.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      localLogger.info({ cleaned }, 'Cleaned expired OAuth tokens');
    }

    return cleaned;
  }

  /**
   * Start periodic cleanup of all expired tokens
   * Should be called once on server startup
   */
  static startCleanupScheduler(): void {
    localLogger.info('Starting token cleanup scheduler (interval: 15 minutes)');

    // Run immediately on startup (mcpTokens Map only; refresh tokens are DB-persisted
    // and swept globally by compliance-monitor.js — IM-4)
    this.cleanExpiredTokens();

    // Run every 15 minutes
    this.cleanupInterval = setInterval(() => {
      const tokensCleaned = this.cleanExpiredTokens();

      if (tokensCleaned > 0) {
        localLogger.info({ tokensCleaned }, 'Token cleanup complete');
      }
    }, 15 * 60 * 1000);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    this.cleanupInterval.unref();
  }

  /**
   * Stop cleanup scheduler (for graceful shutdown)
   */
  static stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      localLogger.info('Token cleanup scheduler stopped');
    }
  }
}
