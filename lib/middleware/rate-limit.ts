/**
 * Rate Limiting Middleware for Next.js
 *
 * Prevents DoS attacks, trial abuse, and account enumeration.
 * Addresses sec-ops-specialist concern about missing rate limiting.
 *
 * @see /cline_docs/reviews/server-validation-security-2025-10-29/sec-ops-review.md
 *
 * NOTE: This is a simple in-memory implementation. For production with multiple
 * servers, use Redis-based rate limiting (e.g., @upstash/ratelimit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { config } from '@/lib/config';
import { getClientIP } from '@/lib/utils/client-ip';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// TIME BOMB PREVENTION: Map size limit (Category 1: Unbounded Caches)
const MAX_RATE_LIMIT_ENTRIES = 10000;

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.resetTime) {
          this.store.delete(key);
        }
      }
    }, 5 * 60 * 1000);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    this.cleanupInterval.unref();
  }

  /**
   * Check if request should be rate limited
   */
  check(key: string, limit: number, windowMs: number): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      // New window
      const resetTime = now + windowMs;

      // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
      if (this.store.size >= MAX_RATE_LIMIT_ENTRIES && !this.store.has(key)) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) {
          this.store.delete(oldestKey);
        }
      }

      this.store.set(key, { count: 1, resetTime });
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime
      };
    }

    if (entry.count >= limit) {
      // Rate limit exceeded
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }

    // Increment count
    entry.count++;
    this.store.set(key, entry);

    return {
      allowed: true,
      remaining: limit - entry.count,
      resetTime: entry.resetTime
    };
  }

  clear(key: string): void {
    this.store.delete(key);
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

/**
 * In-process rate limit check for non-HTTP callers (e.g., function-level
 * gates like JWT minting). Returns the underlying check result rather than
 * the NextResponse wrapper that `createRateLimiter` returns.
 *
 * U2 Phase F.2 (2026-05-19): added to gate mintMcpToken calls in
 * lib/auth/token-manager.ts. Shares the same in-memory store as HTTP
 * rate limiting (keys are namespaced by the caller so collisions are
 * impossible).
 *
 * @param key - Namespaced rate-limit key (e.g., 'mint:userId-cuid')
 * @param limit - Max calls allowed in the window
 * @param windowMs - Window size in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number) {
  return rateLimiter.check(key, limit, windowMs);
}

// getClientIP moved to lib/utils/client-ip.ts (single source of truth — see L6 /
// arch F2, 2026-06-13). CF-Connecting-IP primary; was duplicated + drifted here
// and in middleware/rate-limiter-enhanced.ts. Imported at top of file.

/**
 * Rate limit options
 */
interface RateLimitOptions {
  limit: number;      // Max requests
  windowMs: number;   // Time window in milliseconds
  message?: string;   // Custom error message
  /**
   * Custom bucket-identity derivation. When provided, the limiter keys on
   * `keyGenerator(request)` instead of the default client IP. The factory
   * STRUCTURALLY namespaces the result (`kg:${pathname}:${output}`) so a
   * generator's output can never collide with the default `${ip}:${pathname}`
   * keys nor with another generator's — callers don't hand-namespace.
   *
   * Loopback-refresh fix (2026-06-13): authRefreshLimiter uses this to key on
   * a hash of the refresh-token cookie instead of IP, because the BC69
   * middleware loopback presents the server's own egress IP — collapsing every
   * user's reactive refresh into ONE shared bucket. Per-token keying is
   * IP-independent (also fixes CGNAT/mobile users sharing an IP).
   * See cline_docs/reviews/loopback-refresh-rate-limit-2026-06-13/PLAN-v2.md.
   */
  keyGenerator?: (request: NextRequest) => string;
  /**
   * Use a PRIVATE store instead of the shared 10k-entry singleton. Required
   * for any limiter whose key space an attacker can inflate (e.g. per-token
   * keying — unlimited distinct cookie values): churn would FIFO-evict OTHER
   * limiters' long-window counters (registration/password-reset brute-force
   * protection) out of the shared store. Isolation keeps that blast radius
   * inside this limiter. (sec-ops C-IMPORTANT-2, 2026-06-13.)
   */
  dedicatedStore?: boolean;
}

/**
 * Create a rate limit checker function
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { limit, windowMs, message = 'Too many requests, please try again later', keyGenerator } = options;
  // A private store isolates an attacker-inflatable key space from the shared
  // singleton (see dedicatedStore doc above). Created once per limiter.
  const store = options.dedicatedStore ? new RateLimiter() : rateLimiter;

  return (request: NextRequest): NextResponse | null => {
    // Structural namespacing: a custom generator's output is wrapped so it
    // cannot collide with default IP keys or another generator's keys, even
    // on the shared store. Default path (no generator) is unchanged.
    const key = keyGenerator
      ? `kg:${request.nextUrl.pathname}:${keyGenerator(request)}`
      : `${getClientIP(request)}:${request.nextUrl.pathname}`;

    const result = store.check(key, limit, windowMs);

    if (!result.allowed) {
      const resetDate = new Date(result.resetTime);
      return NextResponse.json(
        {
          error: message,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetDate.toISOString(),
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString()
          }
        }
      );
    }

    return null; // Allowed
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */

// User Registration: 5 attempts per hour per IP
export const registrationLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many registration attempts, please try again in an hour'
});

// MCP Server Creation: 10 servers per hour per IP
export const mcpServerLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many server creation attempts, please try again in an hour'
});

// POV Creation: 50 POVs per day per IP
export const povCreationLimiter = createRateLimiter({
  limit: 50,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  message: 'Daily POV creation limit reached, please try again tomorrow'
});

// Phase/Stage Mutation: 300 operations per hour per IP
export const phaseStageMutationLimiter = createRateLimiter({
  limit: 300,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Phase/stage mutation rate limit exceeded (300/hour)'
});

// Phase/Stage Reorder: 50 operations per hour per IP
export const reorderLimiter = createRateLimiter({
  limit: 50,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Reorder rate limit exceeded (50/hour)'
});

// Bulk Operations: 10 operations per hour per IP
export const bulkOperationLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Bulk operation rate limit exceeded (10/hour)'
});

// Agent Template Application: 100 per hour per IP (CRITICAL operation)
export const applyTemplateRateLimiter = createRateLimiter({
  limit: 100,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Template application rate limit exceeded (100/hour)'
});

// Agent Template Mutation: 50 per hour per IP
export const templateMutationLimiter = createRateLimiter({
  limit: 50,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Template mutation rate limit exceeded (50/hour)'
});

// Agent Template Preview: 200 per hour per IP (read-only operation)
export const templatePreviewLimiter = createRateLimiter({
  limit: 200,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Template preview rate limit exceeded (200/hour)'
});

// Prompt Library Creation: 10 prompts per hour per IP
export const promptCreationLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many prompts created. Please try again later.'
});

// Prompt Library Deletion: 20 deletions per hour per IP
export const promptDeletionLimiter = createRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many prompts deleted. Please try again later.'
});

// Password Reset Request: 3 requests per hour per IP
// Prevents: Email spam, DoS attacks on password reset flow
export const passwordResetRequestLimiter = createRateLimiter({
  limit: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many password reset requests. Please try again in an hour.',
});

// Password Reset Execution: 5 attempts per hour per IP
// Prevents: Token brute force attacks
export const passwordResetLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many password reset attempts. Please try again later.',
});

// Agent Execution: 10 executions per minute per IP
// Prevents: Agent execution DoS, resource exhaustion
// Applied to: POST /api/pov/agent/execute, POST /api/pov/agent/execute/stream
export const agentExecutionLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many agent executions. Limit: 10 per minute. Please wait before executing more agents.',
});

// Agent Operations: 50 operations per minute per IP
// Prevents: Log flooding, resource exhaustion from status checks
// Applied to: GET /api/pov/agent/status, POST /api/pov/agent/cancel, GET /api/pov/agent/artifacts
export const agentOperationsLimiter = createRateLimiter({
  limit: 50,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many agent operations. Limit: 50 per minute. Please slow down.',
});

// Feature Requests: 5 requests per hour per IP
// Prevents: Feature request spam, abuse
// Applied to: POST /api/support/feature
export const featureRequestLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many feature requests. You can submit up to 5 per hour. Please try again later.',
});

// Support Requests: 10 requests per hour per IP
// Prevents: Support ticket spam while allowing legitimate volume
// Applied to: POST /api/support/request
export const supportRequestLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many support requests. You can submit up to 10 per hour. Please try again later.',
});

// ============================================================================
// P2.3: Rate Limiting Expansion (Quarterly Review Nov 2025)
// ============================================================================

// Admin Settings: 10 requests per hour per IP
// Prevents: Settings manipulation attacks, accidental misconfiguration loops
// Applied to: PUT /api/admin/settings/llm
export const adminSettingsLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many admin settings updates. Limit: 10 per hour.',
});

// Admin CRM: 10 requests per hour per IP
// Prevents: CRM sync abuse, configuration spam
// Applied to: POST /api/admin/crm/settings, POST /api/admin/crm/sync
export const adminCRMLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many CRM operations. Limit: 10 per hour.',
});

// Admin API Key Generation: 10 requests per hour per IP
// Prevents: API key generation abuse, brute force attempts
// Applied to: POST /api/admin/users/[userId]/api-key
export const adminAPIKeyLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many API key operations. Limit: 10 per hour.',
});

// Auth Token Revocation: 20 requests per hour per IP
// Prevents: Revocation spam while allowing legitimate session cleanup
// Applied to: POST /api/auth/revoke
export const authRevokeLimiter = createRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many token revocation requests. Limit: 20 per hour.',
});

// Auth Token Refresh: 60 requests per hour PER REFRESH-TOKEN (not per IP)
// Applied to: POST /api/auth/refresh
//
// Loopback-refresh fix (2026-06-13, PLAN-v2 — sec-ops/auth/arch reviewed):
// keying on IP was a correlated-mass-logout foot-gun. lib/auth/middleware.ts
// recovers expired sessions via a loopback POST to this route (BC69: server →
// Cloudflare → nginx → server), which presents the SERVER's egress IP — so
// every user's reactive refresh shared ONE bucket, and a flood (organic Monday-
// 9am cold-starts OR ~100 cheap garbage-cookie requests) 429'd everyone at once.
//   • keyGenerator: cookie present → per-token-hash bucket (IP-independent, so
//     also fixes CGNAT/mobile users sharing an IP); absent → per-IP fallback
//     (those 401 immediately at the route, so the bucket only sees probes).
//   • 60/h is generous: the refresh token ROTATES on every success
//     (app/api/auth/refresh/route.ts:80-99), so a healthy session never re-hits
//     its bucket — only a stuck retry loop does. Worst legit same-token burst is
//     ~2-3 (N parallel-fetch racers consume N units before the route's single-
//     flight dedups; limiter intentionally runs before dedup).
//   • dedicatedStore: per-token keying is attacker-inflatable; a private store
//     stops cookie-churn from FIFO-evicting other limiters' brute-force counters.
// NOTE: the cookieless-IP fallback uses getClientIP (XFF-first-hop, spoofable
// behind our proxy). That is acceptable HERE (cookieless = instant 401, nothing
// to protect) but the SAME weakness affects every IP-keyed limiter repo-wide —
// tracked as a separate bug-class sweep (F/U-1 in PLAN-v2; CF-Connecting-IP).
export const authRefreshLimiter = createRateLimiter({
  limit: 60,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many token refresh requests. Limit: 60 per hour.',
  dedicatedStore: true,
  keyGenerator: (request) => {
    const cookie = request.cookies.get(config.cookie.refreshToken)?.value;
    return cookie
      ? `tok:${createHash('sha256').update(cookie).digest('hex').slice(0, 16)}`
      : `ip:${getClientIP(request)}`;
  },
});

// Analytics Queries: 200 requests per minute per IP
// Prevents: Analytics query DoS while allowing dashboard usage
// Applied to: GET /api/tasks/analytics/*, GET /api/mcp/metrics, GET /api/analytics/*
// Read-heavy: Higher limit than mutations (200/min vs typical 10/hour)
// Phase 1+3B: Increased from 100 to 200 to support 50 concurrent users (performance-analyst recommendation)
// Calculation: 50 users × 5 API calls = 250 requests, 200/min allows headroom
// NOTE (2026-05-26): this is the REST-layer analytics limiter (200/min). A SEPARATE,
// tighter analyticsReadLimiter (30/min) lives in lib/utils/rate-limiter.ts for the
// MCP tool dispatch path (round 3 Probe B) — two modules, same name by design; the
// MCP one guards the recommendations.get generator. Don't confuse them.
export const analyticsReadLimiter = createRateLimiter({
  limit: 200,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many analytics queries. Limit: 200 per minute.',
});

// ============================================================================
// Phase 2: Security Hardening (sec-ops-specialist recommendations)
// ============================================================================

// JWKS Endpoint: 100 requests per minute per IP
// Prevents: JWKS flooding DoS attack while allowing legitimate external service validation
// Applied to: GET /api/auth/jwks
// Public endpoint: Must balance security with availability for external services
// Recommendation from sec-ops P0-1 assessment (2026-01-21)
export const jwksLimiter = createRateLimiter({
  limit: 100,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many JWKS requests. Please try again later.',
});

/**
 * Check rate limit keyed by user ID (not IP).
 * Use when you need per-user limits that follow the user regardless of their IP.
 *
 * @param userId  - The authenticated user's ID
 * @param action  - A string label for the action (e.g. 'mcp-tool-register')
 * @param limit   - Max allowed requests in the window
 * @param windowMs - Window size in milliseconds
 * @returns { allowed, remaining, resetTime }
 */
export function checkUserRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetTime: number } {
  const key = `user:${userId}:${action}`;
  return rateLimiter.check(key, limit, windowMs);
}

/**
 * Clear a user-keyed rate limit counter (e.g. after a successful login
 * cancels the per-email failure counter). Mirrors clearAuthRateLimit(ip)
 * in middleware/rate-limiter-enhanced.ts for the IP-keyed equivalent.
 */
export function clearUserRateLimit(userId: string, action: string): void {
  const key = `user:${userId}:${action}`;
  rateLimiter.clear(key);
}

/**
 * Usage example:
 *
 * export async function POST(request: NextRequest) {
 *   // Check rate limit
 *   const rateLimitResponse = registrationLimiter(request);
 *   if (rateLimitResponse) {
 *     return rateLimitResponse; // Rate limit exceeded
 *   }
 *
 *   // Continue with normal request handling
 *   // ...
 * }
 */
