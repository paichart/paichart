import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { authLogger } from '@/lib/logger';
import { corsPreflightResponse } from '@/lib/utils/cors';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    authLogger.error({ err: error }, 'token verify error');
    return NextResponse.json(
      { error: 'Failed to verify token' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsPreflightResponse(req, 'GET, OPTIONS');
}
