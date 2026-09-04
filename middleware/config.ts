import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge Runtime compatible config
const edgeConfig = {
  auth: {
    publicPaths: [
      '/register',
      '/login',
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/refresh',
      '/api/health',
      '/_next',
      '/favicon.ico',
      '/public',
    ],
  },
};

export async function configMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static files
  if (edgeConfig.auth.publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Continue to auth middleware for protected paths
  return NextResponse.next();
}
