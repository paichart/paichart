const { LRUCache } = require('lru-cache');
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'RateLimiter' });

interface RateLimitOptions {
  interval: number; // Time window in milliseconds
  maxRequests: number; // Max requests per interval
}

export class RateLimiter {
  private cache: any; // LRUCache instance
  private options: RateLimitOptions;

  constructor(options: RateLimitOptions) {
    this.options = options;
    this.cache = new LRUCache({
      max: 10000, // Max 10k unique IPs/tokens
      ttl: options.interval,
    });
  }

  /**
   * Check if request should be allowed
   * @param identifier - Unique identifier (IP, token, etc.)
   * @returns true if allowed, false if rate limited
   */
  async checkLimit(identifier: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.cache.get(identifier) || [];
    
    // Filter out expired requests
    const validRequests = requests.filter(
      (timestamp: number) => now - timestamp < this.options.interval
    );
    
    if (validRequests.length >= this.options.maxRequests) {
      // Finding #10 (2026-04-08, Phase 3 smoking-gun): the pino log from commit
      // 367f5d71 was only wired into the checkRateLimit() helper below, which is
      // used exclusively by lib/api-handler.ts (Next.js /api/* path). All MCP
      // handlers (service-registration, task-action) call this class method
      // directly, so MCP 429s were silent end-to-end — both under the shadowed
      // .js AND after Phase 2 proper activated the .ts. Log here so the hot
      // path is observable regardless of caller.
      log.warn({
        identifier,
        maxRequests: this.options.maxRequests,
        intervalMs: this.options.interval,
        remaining: 0,
      }, 'Rate limit exceeded');
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.cache.set(identifier, validRequests);
    
    return true;
  }

  /**
   * Get remaining requests for identifier
   */
  getRemainingRequests(identifier: string): number {
    const requests = this.cache.get(identifier) || [];
    const now = Date.now();
    const validRequests = requests.filter(
      (timestamp: number) => now - timestamp < this.options.interval
    );
    return Math.max(0, this.options.maxRequests - validRequests.length);
  }

  /**
   * Get reset time for identifier
   */
  getResetTime(identifier: string): Date {
    const requests = this.cache.get(identifier) || [];
    if (requests.length === 0) {
      return new Date();
    }
    
    const oldestRequest = Math.min(...requests);
    return new Date(oldestRequest + this.options.interval);
  }
}

// Pre-configured rate limiters
export const downloadRateLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 downloads per minute
});

export const apiRateLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 API calls per minute
});

// MCP analytics tools (recommendations.get / team.performance) run expensive
// aggregations — recommendations.get fires the 9+ parallel-query generator. The
// MCP tool dispatch path had NO per-user limit (only external service calls were
// capped at 20/min), so a DEMO client could hammer the generator. 30/min/user
// bounds abuse while staying well clear of normal UI usage. (round 3 Probe B)
export const analyticsReadLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 analytics calls per minute per user
});

// P1 #2: Additional rate limiters for Q4 2025 Security Review
export const writeOperationLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  maxRequests: 300, // 300 ops/min (raised from 30 — MCP tasks/action handles reads+writes via single
  // POST endpoint; polling calls count alongside writes. nginx provides upstream rate limiting.)
});

export const adminOperationLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  maxRequests: 20, // 20 admin operations per minute
});

export const bulkOperationLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 bulk operations per minute
});

export const sensitiveOperationLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 sensitive operations per minute (delete, etc.)
});

// POV Creation: 50 POVs per day (matches web API limit)
// Used by: MCP pov.create action handler
// Aligns with: app/api/pov/route.ts POV creation endpoint
export const povCreationLimiter = new RateLimiter({
  interval: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 50, // 50 POV creations per day per user
});

// Hub Service Registration: 50 services per day per user
// Used by: MCP registry(action: "register") handler
// Prevents: Registry spam while allowing legitimate bulk onboarding
// Bug Class 73 fix (2026-04-08): ported from deleted rate-limiter.js where this
// limiter was only defined on the stale .js sibling; the .ts source-of-truth
// never had it. Activating .ts via Phase 2 proper surfaced "Cannot read
// properties of undefined (reading 'checkLimit')" at service-registration-handler.js:124.
export const serviceRegistrationLimiter = new RateLimiter({
  interval: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 50, // 50 service registrations per day per user
});

/**
 * Helper to create rate limit response
 * @param limiter - The rate limiter to use
 * @param identifier - Unique identifier (IP, userId, etc.)
 * @returns Response if rate limited, null if allowed
 */
export async function checkRateLimit(
  limiter: RateLimiter,
  identifier: string
): Promise<Response | null> {
  const allowed = await limiter.checkLimit(identifier);
  if (!allowed) {
    // Finding #11 (2026-04-08): removed redundant log.warn here — the canonical
    // "Rate limit exceeded" pino entry now fires inside RateLimiter.checkLimit()
    // itself (Finding #10 fix, commit 12a4d6db), so every caller — MCP handlers
    // AND this api-handler helper — produces exactly one log entry per denial.
    return new Response(
      JSON.stringify({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(limiter.getResetTime(identifier).getTime() - Date.now()) / 1000
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((limiter.getResetTime(identifier).getTime() - Date.now()) / 1000)),
          'X-RateLimit-Remaining': String(limiter.getRemainingRequests(identifier))
        }
      }
    );
  }
  return null;
}