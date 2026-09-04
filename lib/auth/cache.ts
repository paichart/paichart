import { UserRole } from '@prisma/client';
import { ResourceAction, ResourceType } from '../types/auth';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface PermissionCacheKey {
  userId: string;
  /**
   * 2026-07-28: `role` is part of the key because the cached decision DEPENDS on it —
   * checkPermission resolves `rolePermission` by `user.role` (permissions.ts). Keyed on
   * userId alone, a demoted user kept their cached `true` grants for the full 5-minute
   * TTL: privilege persistence after revocation.
   *
   * Chosen over invalidate-on-role-change because that only fires for code paths that
   * write the role. A direct `UPDATE "User" SET role=...` — the documented way to flip a
   * role for testing (PRODUCTION_OPERATIONS_GUIDE) — bypasses every hook. Keying on role
   * self-heals regardless of HOW the role changed: the next call presents the new role,
   * producing a different key and a clean miss.
   */
  role: UserRole;
  resourceType: ResourceType;
  resourceId: string;
  action: ResourceAction;
}

class PermissionCache {
  private cache: Map<string, CacheEntry<boolean>> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Phase 3.10c follow-up (2026-05-20): active eviction of expired entries.
    // Without this, entries set once and never re-read accumulate forever
    // (until invalidate*() fires or process restart). Matches the pattern
    // used by SessionStore (lib/auth/oauth/session-store.ts:507). `.unref()`
    // so the interval doesn't pin the process during graceful shutdown.
    this.startPeriodicCleanup();
  }

  private startPeriodicCleanup(): void {
    // Run cleanup every 5 minutes (matches defaultTTL — guarantees that
    // expired entries are evicted within 2 × TTL worst-case)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Stop the cleanup interval and flush the cache. Idempotent. Used by
   * tests + graceful shutdown. The exported singleton instance does NOT
   * call this — it lives for the lifetime of the process.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  /** Test-only — returns current cache size for invariant checks */
  __getSizeForTests(): number {
    return this.cache.size;
  }

  private createKey(key: PermissionCacheKey): string {
    // Fail LOUD on a missing discriminator rather than silently building a colliding key.
    //
    // This closes the CACHE-KEY ESCALATION CLASS recorded in security-discovery.md: a
    // caller passing a raw TokenPayload (which has `.userId`, not `.id`) yields
    // `id === undefined`, and the template happily produced "undefined:mcp-service:*:view"
    // — one key shared by EVERY caller, so one ADMIN's `true` grant was served to everyone
    // for the TTL. That was previously guarded only by a discovery-prompt grep asking
    // whether callers map userId -> id; this makes it structurally impossible instead.
    //
    // Same reasoning now applies to `role`, which became a key component on 2026-07-28:
    // an undefined role would collapse all roles onto one key, which is the same
    // escalation with a different field.
    if (!key.userId || !key.role) {
      throw new Error(
        `Permission cache key missing a discriminator (userId=${String(key.userId)}, ` +
        `role=${String(key.role)}). Refusing to build a colliding key — pass a full ` +
        `{ id, role } user, not a raw token payload.`
      );
    }
    // `role` sits immediately after `userId` so invalidateUserPermissions' `${userId}:`
    // prefix match and invalidateResourcePermissions' `${type}:${id}` substring match
    // both keep working unchanged.
    return `${key.userId}:${key.role}:${key.resourceType}:${key.resourceId}:${key.action}`;
  }

  async get(
    key: PermissionCacheKey,
    fetchFn: () => Promise<boolean>
  ): Promise<boolean> {
    const cacheKey = this.createKey(key);
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await fetchFn();
    this.set(key, value);
    return value;
  }

  set(key: PermissionCacheKey, value: boolean, ttl: number = this.defaultTTL): void {
    const cacheKey = this.createKey(key);
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  invalidate(key: PermissionCacheKey): void {
    const cacheKey = this.createKey(key);
    this.cache.delete(cacheKey);
  }

  invalidateUserPermissions(userId: string): void {
    Array.from(this.cache.keys()).forEach(key => {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    });
  }

  invalidateResourcePermissions(resourceType: ResourceType, resourceId: string): void {
    Array.from(this.cache.keys()).forEach(key => {
      if (key.includes(`${resourceType}:${resourceId}`)) {
        this.cache.delete(key);
      }
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

interface TeamCacheKey {
  userId: string;
  teamId: string;
}

class TeamMembershipCache {
  private cache: Map<string, CacheEntry<boolean>> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly defaultTTL = 10 * 60 * 1000; // 10 minutes

  constructor() {
    // Phase 3.10c follow-up (2026-05-20) — see PermissionCache constructor.
    this.startPeriodicCleanup();
  }

  private startPeriodicCleanup(): void {
    // Run cleanup every 10 minutes (matches defaultTTL)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 10 * 60 * 1000);
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  __getSizeForTests(): number {
    return this.cache.size;
  }

  private createKey(key: TeamCacheKey): string {
    return `${key.userId}:${key.teamId}`;
  }

  async get(
    key: TeamCacheKey,
    fetchFn: () => Promise<boolean>
  ): Promise<boolean> {
    const cacheKey = this.createKey(key);
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await fetchFn();
    this.set(key, value);
    return value;
  }

  set(key: TeamCacheKey, value: boolean, ttl: number = this.defaultTTL): void {
    const cacheKey = this.createKey(key);
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  invalidate(key: TeamCacheKey): void {
    const cacheKey = this.createKey(key);
    this.cache.delete(cacheKey);
  }

  invalidateUserTeams(userId: string): void {
    Array.from(this.cache.keys()).forEach(key => {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    });
  }

  invalidateTeam(teamId: string): void {
    Array.from(this.cache.keys()).forEach(key => {
      if (key.endsWith(`:${teamId}`)) {
        this.cache.delete(key);
      }
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Export singleton instances
export const permissionCache = new PermissionCache();
export const teamMembershipCache = new TeamMembershipCache();
