import { NextResponse, NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { UserRole } from '../types/auth';
import { authLogger } from '@/lib/logger';
import { PUBLIC_BASE_URL, JWT_ISSUER } from './public-base-url';

const localLogger = authLogger.child({ module: 'authMiddleware' });

// BC69 FIX: Use APP_BASE_URL instead of req.nextUrl.origin (derived from Host header)
// to prevent host header poisoning in fetch() and redirect() calls.
const TRUSTED_ORIGIN = PUBLIC_BASE_URL;  // canonicalised APP_BASE_URL (same fallback as before)

// Single-flight loopback refresh (2026-06-12, refresh-token-race PLAN-v2 §1b):
// concurrent middleware-originated requests carrying the same refresh token
// share ONE upstream fetch instead of issuing N loopback round-trips (through
// Cloudflare/nginx) that race each other and burn N units of rate-limit
// budget. Correctness is owned by the route-level single-flight in
// /api/auth/refresh; this layer is a network optimization. The helper
// consumes the upstream response exactly once (BC20 body-cancel) and resolves
// to an extracted plain object — never a shared Response, whose body stream
// is single-consumer. Entries are removed on settle, so Map size is bounded
// by concurrent in-flight refreshes. Log fields must never include the raw
// token (Map keys are token values).
interface RefreshResult {
  ok: boolean;
  setCookie: string | null;
}

const inflightRefresh = new Map<string, Promise<RefreshResult>>();

function refreshOnce(refreshToken: string, requestId: string): Promise<RefreshResult> {
  const existing = inflightRefresh.get(refreshToken);
  if (existing) {
    // info-level so the marker is visible in prod logs (info floor) — it's
    // the greppable regression guard for the race fix and fires only on dedup.
    localLogger.info({ requestId }, 'refresh deduplicated');
    return existing;
  }

  const p = (async (): Promise<RefreshResult> => {
    // BC69 FIX: Use TRUSTED_ORIGIN instead of req.nextUrl.origin (host header trust)
    const response = await fetch(`${TRUSTED_ORIGIN}/api/auth/refresh`, {
      method: 'POST',
      headers: new Headers({
        Cookie: `${config.cookie.refreshToken}=${refreshToken}`,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }),
      credentials: 'include',
      // A hung loopback fetch must not pin a Map entry (and every racer
      // behind it). Feature-detected: AbortSignal.timeout is not contractually
      // guaranteed in the Edge-runtime sandbox, and this is the hot path for
      // every authenticated request.
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10_000) : undefined,
    });

    // BC20 FIX: consume body exactly once to release the TCP connection
    // (we only need the set-cookie headers)
    await response.body?.cancel();

    return { ok: response.ok, setCookie: response.headers.get('set-cookie') };
  })().finally(() => inflightRefresh.delete(refreshToken));

  inflightRefresh.set(refreshToken, p);
  return p;
}

export async function authMiddleware(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    // Check for token in cookies or Authorization header
    const cookieToken = req.cookies.get(config.cookie.accessToken)?.value;
    const authHeader = req.headers.get('Authorization');
    const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const token = headerToken || cookieToken;

    if (!token) {
      const refreshToken = req.cookies.get(config.cookie.refreshToken)?.value;
      if (!refreshToken) {
        throw new Error('No tokens found');
      }

      // Try to refresh the token (single-flight — see refreshOnce above)
      const refreshResult = await refreshOnce(refreshToken, requestId);

      if (!refreshResult.ok) {
        throw new Error('Token refresh failed');
      }

      // Get the new access token from response cookies
      if (!refreshResult.setCookie) {
        throw new Error('No cookies in refresh response');
      }

      // Return response with new cookies, reloading the SAME page.
      // BC69: reconstruct path+search on TRUSTED_ORIGIN — never redirect to the
      // raw req.url, whose origin is Host-header-derived (poisonable open-redirect).
      const selfUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, TRUSTED_ORIGIN);
      const redirectResponse = NextResponse.redirect(selfUrl);
      redirectResponse.headers.set('Set-Cookie', refreshResult.setCookie);
      return redirectResponse;
    }

    // Check JWT algorithm. RS256 tokens (MCP first-party + browser sessions
    // post the 2026-01-21 cutover) validate claims here and defer signature
    // verification to the route handler (Edge runtime can't do RS256 crypto).
    // Non-RS256 tokens are no longer accepted in middleware (HS256 hardening
    // Step 2, 2026-05-28 — see followup hs256-verify-surface-hardening-2026-05-28.md);
    // they fall through to the refresh path below, which re-mints RS256.
    try {
      // Decode JWT header to check algorithm (no verification, just parsing)
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const headerB64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      const headerJson = atob(headerB64);
      const header = JSON.parse(headerJson);

      // If RS256 token, validate claims then pass to route handler for signature verification
      // Edge Runtime can't do RS256 crypto, but we CAN validate structure and claims
      if (header.alg === 'RS256') {
        // BC55 FIX: Validate basic claims before passing through (defense-in-depth)
        try {
          const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const payloadJson = atob(payloadB64);
          const claims = JSON.parse(payloadJson);

          // Reject if missing required claims
          if (!claims.sub && !claims.userId) {
            throw new Error('RS256 token missing subject claim');
          }
          // Reject if issuer doesn't match
          if (claims.iss && claims.iss !== JWT_ISSUER) {
            throw new Error('RS256 token invalid issuer');
          }
          // Reject if expired (exp is in seconds)
          if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
            throw new Error('RS256 token expired');
          }
        } catch (claimError) {
          localLogger.warn('RS256 token claim validation failed');
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        localLogger.debug('RS256 token claims validated - passing to route handler for signature verification');
        return NextResponse.next();
      }

      // Non-RS256 (legacy HS256 browser session) — acceptance removed 2026-05-28
      // (HS256 hardening Step 2). No legitimate unexpired HS256 session exists
      // post-cutover. Throw so the catch below attempts a refresh (re-mints an
      // RS256 session); a real user is not locked out. The former HS256 success
      // path that ran after this point — a decoded-payload check plus user-id
      // and user-role request-header injection and an access-cookie re-set —
      // was removed. It only ran for HS256 browser sessions; RS256 sessions
      // return above, and no route consumes those injected headers.
      localLogger.warn(`Non-RS256 session token presented (alg=${header.alg}) — HS256 middleware acceptance removed; deferring to refresh`);
      throw new Error('Unsupported session token algorithm — only RS256 is accepted');
    } catch (error) {
      // Try to refresh the token (single-flight — see refreshOnce above).
      // This is the site that raced pre-fix (parallel fetches with an expired
      // access cookie each triggered an independent refresh).
      const refreshToken = req.cookies.get(config.cookie.refreshToken)?.value;
      if (refreshToken) {
        const refreshResult = await refreshOnce(refreshToken, requestId);

        if (refreshResult.ok && refreshResult.setCookie) {
          // BC69: reconstruct path+search on TRUSTED_ORIGIN (req.url origin is
          // Host-header-derived → poisonable). Reloads the same page safely.
          const selfUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, TRUSTED_ORIGIN);
          const redirectResponse = NextResponse.redirect(selfUrl);
          redirectResponse.headers.set('Set-Cookie', refreshResult.setCookie);
          return redirectResponse;
        }
      }
      throw new Error('Invalid token');
    }
  } catch (error: any) {
    
    // For API routes, return 401 instead of redirecting
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { 
          error: 'Unauthorized', 
          message: 'Your session has expired. Please log in again.',
          code: 'SESSION_EXPIRED'
        }, 
        { status: 401 }
      );
    }
    
    // For page routes, redirect to login with a reason
    // BC69 FIX: Use TRUSTED_ORIGIN instead of req.nextUrl.origin (host header trust)
    const loginUrl = new URL('/login', TRUSTED_ORIGIN);
    
    // Add a reason parameter to show a message on the login page
    loginUrl.searchParams.set('reason', 'session_expired');
    
    // Add the original URL as a redirect parameter (same-origin paths only)
    const redirectPath = req.nextUrl.pathname + req.nextUrl.search;
    if (redirectPath.startsWith('/') && !redirectPath.startsWith('//')) {
      loginUrl.searchParams.set('redirect', redirectPath);
    }
    
    const response = NextResponse.redirect(loginUrl);
    
    // Clear tokens
    response.cookies.delete(config.cookie.accessToken);
    response.cookies.delete(config.cookie.refreshToken);
    
    return response;
  }
}
