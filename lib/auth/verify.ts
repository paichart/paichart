import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAccessToken } from '@/lib/jwt';
// Note: Don't import cookies from next/headers - causes AsyncLocalStorage error with custom server
// Use req.cookies instead
import { config } from '@/lib/config';
import { authLogger } from '@/lib/logger';

export interface AuthResult {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function verifyAuth(req: NextRequest): Promise<AuthResult | null> {
  try {
    // Get token from request cookies (not cookies() function to avoid AsyncLocalStorage issues)
    const token = req.cookies.get(config.cookie.accessToken)?.value;

    if (!token) {
      authLogger.debug('No access token found in cookies');
      return null;
    }

    // Verify JWT
    const payload = await verifyAccessToken(token);

    if (!payload || !(payload as any).sub) {
      authLogger.warn('Invalid JWT payload received');
      return null;
    }

    // Get user from database
    const userId = (payload as any).sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      authLogger.warn({ userId }, 'User not found during auth verification');
      return null;
    }

    authLogger.debug({ userId: user.id, role: user.role }, 'Auth verification successful');
    return user;
  } catch (error) {
    authLogger.error({ err: error }, 'Auth verification failed');
    return null;
  }
}
