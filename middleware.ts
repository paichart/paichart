import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authMiddleware } from './lib/auth/middleware';
import { requestThrottleMiddleware } from './middleware/request-throttle';
import { isAllowedOrigin } from './lib/utils/cors';

export async function middleware(request: NextRequest) {
  // Apply request throttling first
  const throttleResponse = await requestThrottleMiddleware(request);
  if (throttleResponse.status === 429) {
    return throttleResponse;
  }

  try {
    // Protected routes
    if (request.nextUrl.pathname.startsWith('/dashboard') ||
        request.nextUrl.pathname.startsWith('/pov') ||
        request.nextUrl.pathname.startsWith('/admin') ||
        request.nextUrl.pathname.startsWith('/test-auth')) {
      return await authMiddleware(request);
    }

    // API routes that need auth
    if (request.nextUrl.pathname.startsWith('/api/') &&
        !request.nextUrl.pathname.startsWith('/api/auth/') &&
        !request.nextUrl.pathname.startsWith('/api/public/') &&
        !request.nextUrl.pathname.startsWith('/api/health') &&
        !request.nextUrl.pathname.startsWith('/api/mcp/discover') &&
        !request.nextUrl.pathname.includes('/public-download')) {
      const response = await authMiddleware(request);
      
      // If auth successful, add CORS headers
      if (response.status === 200) {
        // Removed task normalization middleware
        // const normalizedResponse = await taskNormalizationMiddleware(request);
        
        // BC22 FIX: CORS origin allowlist (no longer echoes arbitrary origins with credentials)
        const origin = request.headers.get('origin');
        if (isAllowedOrigin(origin, request.nextUrl)) {
          response.headers.set('Access-Control-Allow-Credentials', 'true');
          response.headers.set('Access-Control-Allow-Origin', origin!);
        }
        return response;
      }
      return response;
    }

    // Public routes
    return NextResponse.next();
  } catch (error) {
    console.error('[middleware] Error:', error);
    // For API routes, return 401 instead of redirecting
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // For page routes, redirect to login.
    // BC69: base on APP_BASE_URL, not request.url (Host-header-derived → poisonable).
    return NextResponse.redirect(new URL('/login', process.env.APP_BASE_URL || 'https://paichart.app'));
  }
}

// Configure middleware matching
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
