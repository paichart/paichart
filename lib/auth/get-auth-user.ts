import { NextRequest } from 'next/server';
import { verifyAccessToken } from '../jwt';
// Note: Don't statically import cookies from next/headers - causes AsyncLocalStorage error
// with custom server. Use dynamic import in getAuthUserFromServer() instead.
import { config } from '@/lib/config';
import { UserRole } from '@/lib/types/auth';
import { authLogger } from '@/lib/logger';

const localLogger = authLogger.child({ module: 'getAuthUser' });

export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  try {
    // Get token from cookies or Authorization header
    const cookieToken = req.cookies.get(config.cookie.accessToken)?.value;
    const headerToken = req.headers.get('Authorization')?.replace('Bearer ', '');
    const token = headerToken || cookieToken;

    if (!token) {
      return null;
    }

    const decoded = await verifyAccessToken(token);

    if (!decoded) {
      return null;
    }

    const user = {
      userId: decoded.userId || (decoded as any).sub, // Support both formats (RS256 uses sub)
      email: decoded.email,
      role: decoded.role
    };
    return user;
  } catch (error) {
    localLogger.error({ err: error }, 'Auth error');
    return null;
  }
}

// For server components (not API routes)
// WARNING: This function may fail with custom server due to AsyncLocalStorage issues.
// Use getAuthUser(req) in API routes instead.
export async function getAuthUserFromServer(): Promise<AuthUser | null> {
  try {
    // Dynamic import to avoid loading next/headers at module load time
    // This prevents AsyncLocalStorage errors when the module is imported but function not called
    const { cookies } = await import('next/headers');
    const cookieStore = cookies();
    const token = cookieStore.get(config.cookie.accessToken)?.value;

    if (!token) {
      return null;
    }

    const decoded = await verifyAccessToken(token);

    if (!decoded) {
      return null;
    }

    const user = {
      userId: decoded.userId || (decoded as any).sub, // Support both formats (RS256 uses sub)
      email: decoded.email,
      role: decoded.role
    };
    return user;
  } catch (error) {
    localLogger.error({ err: error }, 'Auth error');
    return null;
  }
}
