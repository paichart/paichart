import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { updateUserSettings } from '../services/settings';
import { UpdateUserSettingsSchema } from '@/lib/validation/settings-validation';

const settingsPutLogger = logger.child({ module: 'SettingsPutHandler' });

export async function handlePutSettings(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const data = await req.json();

    // ✅ SECURITY: Validate with strict schema (prevent injection, unknown fields)
    const validation = UpdateUserSettingsSchema.safeParse(data);

    if (!validation.success) {
      settingsPutLogger.warn({ userId: user.userId, issueCount: validation.error.issues.length }, 'Settings validation failed');

      return NextResponse.json(
        {
          error: 'Invalid settings data',
          issues: validation.error.issues
        },
        { status: 400 }
      );
    }

    const validatedData = validation.data;  // Now validated!

    try {
      // Type assertion safe here - validation ensures correct structure
      const settings = await updateUserSettings(user.userId, validatedData as any);
      return NextResponse.json({ data: { settings } });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid timezone') {
        return NextResponse.json(
          { error: 'Invalid timezone' },
          { status: 400 }
        );
      }
      throw error;
    }
  } catch (error) {
    settingsPutLogger.error({ err: error }, 'Failed to update settings');
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
