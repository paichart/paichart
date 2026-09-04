import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { getUserSettings } from '../services/settings';

const settingsGetLogger = logger.child({ module: 'SettingsGetHandler' });

export async function handleGetSettings(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const settings = await getUserSettings(user.userId);
    return NextResponse.json({ data: { settings } });
  } catch (error) {
    settingsGetLogger.error({ err: error }, 'Failed to fetch settings');
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
