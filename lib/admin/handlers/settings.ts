import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { logger } from '@/lib/logger';
import { AdminSettingsService } from '../services/settings';
import { SystemSettings, UpdateSettingRequest } from '../types';
import { ApiError, ErrorCode } from '@/lib/errors';
import { trackActivity } from '@/lib/auth/audit';
import { UpdateSystemSettingsSchema } from '@/lib/validation/settings-validation';

const settingsHandlerLogger = logger.child({ module: 'AdminSettingsHandler' });

export async function getAdminSettingsHandler(
  _req: NextRequest,
  _context: { params: Record<string, string> },
  user?: TokenPayload
): Promise<ApiResponse<SystemSettings>> {
  try {
    // ✅ Allow both ADMIN and SUPER_ADMIN
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Not authorized to access admin settings');
    }

    const settings = await AdminSettingsService.getSettings();

    return {
      data: settings,
    };
  } catch (error) {
    settingsHandlerLogger.error({ err: error }, 'Failed to get admin settings');
    throw error;
  }
}

export async function updateAdminSettingsHandler(
  req: NextRequest,
  _context: { params: Record<string, string> },
  user?: TokenPayload
): Promise<ApiResponse<SystemSettings>> {
  try {
    // ✅ Allow both ADMIN and SUPER_ADMIN
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Not authorized to modify admin settings');
    }

    const data = await req.json();

    // ✅ Zod validation with safeParse
    const validation = UpdateSystemSettingsSchema.safeParse(data);

    if (!validation.success) {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid settings data',
        validation.error.errors
      );
    }

    const validated = validation.data;

    const settings = await AdminSettingsService.updateSettings(validated);

    // ✅ Enhanced audit logging
    await trackActivity(
      user.userId,
      'SETTINGS',
      'UPDATE',
      {
        settingsChanged: validated.map(s => s.id),
        updates: validated,
        success: true
      }
    );

    settingsHandlerLogger.info({ settingsChanged: validated.map(s => s.id) }, 'System settings updated');

    return {
      data: settings,
    };
  } catch (error) {
    settingsHandlerLogger.error({ err: error }, 'Failed to update admin settings');
    throw error;
  }
}
