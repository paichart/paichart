/**
 * General Request Throttle Middleware
 * 
 * Purpose: Basic rate limiting for all routes with different limits per route type
 * - Different limits for authenticated vs unauthenticated users
 * - Route-specific multipliers (LLM, MCP, Template, Admin routes)
 * - Simple in-memory store (upgrade to Redis for production)
 * 
 * Note: Works alongside rate-limiter-enhanced.ts which provides specialized auth/API limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { PUBLIC_BASE_URL } from '../lib/auth/public-base-url';

// Simple in-memory store for request counts
// In production, you'd want to use Redis or similar
// TIME BOMB PREVENTION (Jan 2026): Added size limit and .unref()
const requestCounts = new Map<string, { count: number; timestamp: number }>();

// TIME BOMB PREVENTION: Map size limit (Category 1: Unbounded Caches)
const MAX_REQUEST_COUNTS_SIZE = 10000;

// Clean up old entries every minute
// Note: No .unref() because this runs in Edge Runtime (not Node.js)
// Edge Runtime handles cleanup automatically when the runtime terminates
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (now - value.timestamp > 60000) { // 1 minute
      requestCounts.delete(key);
    }
  }
}, 60000);

export function requestThrottleMiddleware(req: NextRequest) {
  // Get user ID from request headers or cookies for authenticated users
  const userId = req.headers.get('x-user-id') || req.cookies.get('userId')?.value;
  
  // Different rate limits for authenticated and unauthenticated users
  const isAuthenticated = !!userId;
  
  // Get window size from env or use default (5 seconds for LLM routes, 1 second for others)
  // BC21 FIX: parseInt(env) || default guards NaN from misconfigured env vars
  let windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '1000', 10) || 1000;
  
  // Use a longer window for LLM routes
  const isLLMRoute = req.nextUrl.pathname.includes('/api/llm/');
  if (isLLMRoute) {
    windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS_LLM || '5000', 10) || 5000;
  }
  
  // Higher limits for authenticated users, lower for unauthenticated
  const maxRequests = isAuthenticated
    ? (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_AUTH || '20', 10) || 20)
    : (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10) || 10);
  
  // Different rate limits for different types of routes
  const isTemplateRoute = req.nextUrl.pathname.includes('/templates/');
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin/');
  const isMCPRoute = req.nextUrl.pathname.includes('/api/mcp/') || req.nextUrl.pathname.includes('/api/tasks');
  
  // Adjust limits for specific routes that might need more requests
  const routeMaxRequests = isLLMRoute
    ? maxRequests * 5 // 5x the limit for LLM routes
    : isMCPRoute
    ? maxRequests * 3 // 3x the limit for MCP routes (Claude Desktop integration)
    : isTemplateRoute
    ? maxRequests * 2 // Double the limit for template routes
    : isAdminRoute
    ? maxRequests * 1.5 // 50% more for admin routes
    : maxRequests;
  
  // L6 FIX (2026-06-13): unauthenticated requests key on the resolved client IP
  // (CF-Connecting-IP primary — see lib/utils/client-ip.ts). Was `req.ip`, which
  // is a CONSTANT behind the nginx→localhost server (req.ip empty) — so EVERY
  // unauthenticated request to a path shared ONE bucket = a global throttle on
  // the broadest (per-request) limiter. Edge-safe (helper is pure).
  const clientIp = getClientIP(req);

  // Create a key that includes user ID for authenticated users
  const key = isAuthenticated
    ? `${userId}-${req.nextUrl.pathname}`
    : `${clientIp}-${req.nextUrl.pathname}`;
  
  const now = Date.now();

  // Get current request count
  const current = requestCounts.get(key) || { count: 0, timestamp: now };

  // Reset count if window has passed
  if (now - current.timestamp > windowMs) {
    current.count = 0;
    current.timestamp = now;
  }

  // Increment count
  current.count++;

  // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
  if (requestCounts.size >= MAX_REQUEST_COUNTS_SIZE && !requestCounts.has(key)) {
    const oldestKey = requestCounts.keys().next().value;
    if (oldestKey) {
      requestCounts.delete(oldestKey);
    }
  }

  requestCounts.set(key, current);

  // Check if over limit
  if (current.count > routeMaxRequests) {
    console.warn(`[Request Throttle] Too many requests from ${isAuthenticated ? `user ${userId}` : `IP ${clientIp}`} to ${req.nextUrl.pathname}`);
    
    // Calculate retry after time
    const retryAfter = Math.ceil((current.timestamp + windowMs - now) / 1000);
    
    // For API routes, return JSON response
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({
          error: 'Too many requests',
          message: 'Please try again later',
          retryAfter
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString()
          }
        }
      );
    }
    
    // For page routes, redirect to a rate limit page with information.
    // BC69: base on APP_BASE_URL, not req.url (Host-header-derived → poisonable
    // open-redirect). Same trust fix as lib/auth/middleware.ts TRUSTED_ORIGIN.
    const baseOrigin = PUBLIC_BASE_URL;  // canonical origin (D4-B)
    return NextResponse.redirect(new URL(`/rate-limited?retryAfter=${retryAfter}`, baseOrigin));
  }

  // Add rate limit headers
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', routeMaxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', (routeMaxRequests - current.count).toString());
  response.headers.set('X-RateLimit-Reset', (current.timestamp + windowMs).toString());

  return response;
}
