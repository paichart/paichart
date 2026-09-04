import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function activityTracker(request: NextRequest) {
  // Skip notifications endpoint to avoid infinite loop
  if (request.nextUrl.pathname === '/api/notifications') {
    return NextResponse.next();
  }

  // Only track activity for authenticated routes
  if (!request.nextUrl.pathname.startsWith('/api/') && 
      !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/_next/') &&
      !request.nextUrl.pathname.startsWith('/favicon.ico')) {
    
    console.log('[Activity Tracker] Tracking activity for:', request.nextUrl.pathname);
    
    // Continue with the request
    const response = NextResponse.next();

    // Add activity tracking headers
    response.headers.set('x-last-activity', new Date().toISOString());
    response.headers.set('x-tracked-path', request.nextUrl.pathname);

    return response;
  }

  return NextResponse.next();
}
