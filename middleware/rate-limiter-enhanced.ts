/**
 * Enhanced Rate Limiting Middleware
 * 
 * Purpose: Specialized rate limiting for authentication and API endpoints
 * - Authentication rate limiting with IP blocking
 * - API rate limiting with configurable windows
 * - Used primarily by auth endpoints and API routes
 * 
 * Note: Works alongside request-throttle.ts which provides general rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';
import { getClientIP } from '@/lib/utils/client-ip';

// Configuration (with environment variable overrides)
// BC21 FIX: parseInt(env) || default guards NaN from misconfigured env vars
const RATE_LIMIT_CONFIG = {
  auth: {
    maxAttempts: parseInt(process.env.RATE_LIMIT_AUTH_MAX_ATTEMPTS || '10', 10) || 10,
    windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || String(15 * 60 * 1000), 10) || 15 * 60 * 1000,
    blockDurationMs: parseInt(process.env.RATE_LIMIT_AUTH_BLOCK_MS || String(30 * 60 * 1000), 10) || 30 * 60 * 1000,
  },
  api: {
    maxRequests: parseInt(process.env.RATE_LIMIT_API_MAX_REQUESTS || '1000', 10) || 1000,
    windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || '60000', 10) || 60000,
  }
};

// Rate limit stores
const authAttempts = new LRUCache<string, number>({
  max: 1000,
  ttl: RATE_LIMIT_CONFIG.auth.windowMs,
});

const blockedIPs = new LRUCache<string, boolean>({
  max: 1000,
  ttl: RATE_LIMIT_CONFIG.auth.blockDurationMs,
});

const apiRequests = new LRUCache<string, number>({
  max: 10000,
  ttl: RATE_LIMIT_CONFIG.api.windowMs,
});

// getClientIP moved to lib/utils/client-ip.ts (single source of truth — see L6 /
// arch F2, 2026-06-13). CF-Connecting-IP primary; was duplicated + drifted here
// and in lib/middleware/rate-limit.ts. Imported at top of file.

/**
 * Rate limiter for authentication endpoints
 */
export async function authRateLimiter(request: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIP(request);
  
  // Check if IP is blocked
  if (blockedIPs.get(ip)) {
    return NextResponse.json(
      {
        error: 'Too many failed attempts',
        message: 'Your IP has been temporarily blocked. Please try again later.',
        retryAfter: RATE_LIMIT_CONFIG.auth.blockDurationMs / 1000,
      },
      { status: 429 }
    );
  }
  
  // Track authentication attempts
  const attempts = authAttempts.get(ip) || 0;
  
  if (attempts >= RATE_LIMIT_CONFIG.auth.maxAttempts) {
    // Block the IP
    blockedIPs.set(ip, true);
    authAttempts.delete(ip);
    
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Maximum of ${RATE_LIMIT_CONFIG.auth.maxAttempts} login attempts exceeded. IP blocked for ${RATE_LIMIT_CONFIG.auth.blockDurationMs / 60000} minutes.`,
        retryAfter: RATE_LIMIT_CONFIG.auth.blockDurationMs / 1000,
      },
      { status: 429 }
    );
  }
  
  // Increment attempt counter
  authAttempts.set(ip, attempts + 1);
  
  return null; // Allow request to proceed
}

/**
 * Rate limiter for general API endpoints
 */
export async function apiRateLimiter(request: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIP(request);
  
  // Track API requests
  const requests = apiRequests.get(ip) || 0;
  
  if (requests >= RATE_LIMIT_CONFIG.api.maxRequests) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Maximum of ${RATE_LIMIT_CONFIG.api.maxRequests} requests per minute exceeded.`,
        retryAfter: RATE_LIMIT_CONFIG.api.windowMs / 1000,
      },
      { 
        status: 429,
        headers: {
          'Retry-After': String(RATE_LIMIT_CONFIG.api.windowMs / 1000),
          'X-RateLimit-Limit': String(RATE_LIMIT_CONFIG.api.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Date.now() + RATE_LIMIT_CONFIG.api.windowMs),
        }
      }
    );
  }
  
  // Increment request counter
  apiRequests.set(ip, requests + 1);
  
  return null; // Allow request to proceed
}

/**
 * Clear rate limit for an IP (e.g., after successful login)
 */
export function clearAuthRateLimit(ip: string): void {
  authAttempts.delete(ip);
}

/**
 * Get rate limit status for monitoring
 */
export function getRateLimitStatus() {
  return {
    authAttempts: authAttempts.size,
    blockedIPs: blockedIPs.size,
    apiRequests: apiRequests.size,
    config: RATE_LIMIT_CONFIG,
  };
}