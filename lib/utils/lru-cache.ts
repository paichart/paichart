/**
 * LRU Cache with TTL and Pattern-Based Invalidation
 *
 * Features:
 * - LRU eviction (prevents unbounded growth - TIME BOMB PREVENTION Category 1)
 * - TTL expiration (prevents stale data)
 * - Pattern-based invalidation (clear related entries on mutation)
 * - Type-safe generic implementation
 *
 * Pattern: cache-lru-invalidation-pattern.md (95% confidence)
 * Created: February 17, 2026 (Q1 2026 Performance Review - Phase 3)
 *
 * @version 1.0.0
 */

export interface CacheOptions {
  maxSize?: number;
  ttl?: number; // Time to live in milliseconds
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * LRU Cache with TTL
 *
 * Usage:
 * ```typescript
 * const cache = new LRUCache<POV[]>({ maxSize: 100, ttl: 60000 });
 *
 * // Get from cache
 * const cached = cache.get('pov:list:user123');
 * if (cached) return cached;
 *
 * // Set in cache
 * const povs = await prisma.pov.findMany(...);
 * cache.set('pov:list:user123', povs);
 *
 * // Invalidate on mutation
 * cache.invalidate('pov:list:user123'); // Exact match
 * cache.invalidatePattern('pov:list'); // All user POV lists
 * ```
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 100; // Default: 100 entries
    this.ttl = options.ttl || 60000; // Default: 60 seconds
  }

  /**
   * Get value from cache if exists and not expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU - mark as recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  /**
   * Set value in cache with LRU eviction
   */
  set(key: string, data: T): void {
    // TIME BOMB PREVENTION (Category 1): LRU eviction if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Evict oldest entry (first in Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Invalidate exact cache key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching pattern
   *
   * Example: invalidatePattern('pov:list') clears all POV list caches
   */
  invalidatePattern(pattern: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl
    };
  }

  /**
   * Get all cache keys (for debugging)
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Helper function to generate auth-aware cache keys
 * Ensures multi-tenant cache isolation
 */
export function generateCacheKey(
  resource: string,
  userId: string,
  params?: Record<string, any>
): string {
  const paramString = params
    ? Object.entries(params)
        .filter(([_, v]) => v !== null && v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)) // Consistent ordering
        .map(([k, v]) => `${k}=${v}`)
        .join(':')
    : '';

  return paramString
    ? `${resource}:${userId}:${paramString}`
    : `${resource}:${userId}`;
}
