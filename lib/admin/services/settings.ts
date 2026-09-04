import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { systemSettingsSelect } from '../prisma/select';
import { mapSystemSettingsFromPrisma } from '../prisma/mappers';
import { SystemSettings, UpdateSettingRequest, ALLOWED_SETTINGS } from '../types';

const settingsLogger = logger.child({ module: 'AdminSettingsService' });

const defaultSettings = {
  id: 'global',
  notifications: true,
  twoFactor: false,
  darkMode: false,
  updatedAt: new Date(),
} as const;

export class AdminSettingsService {
  /**
   * Get system settings
   */
  static async getSettings(): Promise<SystemSettings> {
    try {
      const settings = await prisma.systemSettings.findFirst({
        where: { id: 'global' },
        select: systemSettingsSelect,
      });

      return mapSystemSettingsFromPrisma(settings || defaultSettings);
    } catch (error) {
      settingsLogger.error({ err: error }, 'Failed to get settings');
      throw error;
    }
  }

  /**
   * Update system settings
   */
  static async updateSettings(updates: UpdateSettingRequest[]): Promise<SystemSettings> {
    try {
      // Validate updates
      for (const update of updates) {
        if (!ALLOWED_SETTINGS.includes(update.id)) {
          throw new Error(`Invalid setting: ${update.id}`);
        }
        if (typeof update.value !== 'boolean') {
          throw new Error(`Invalid value for setting: ${update.id}`);
        }
      }

      // Convert updates to Prisma data format
      const data = {
        id: 'global',
        ...Object.fromEntries(updates.map(u => [u.id, u.value])),
      };

      // Update settings
      const settings = await prisma.systemSettings.upsert({
        where: { id: 'global' },
        create: data,
        update: Object.fromEntries(updates.map(u => [u.id, u.value])),
        select: systemSettingsSelect,
      });

      return mapSystemSettingsFromPrisma(settings);
    } catch (error) {
      settingsLogger.error({ err: error }, 'Failed to update settings');
      throw error;
    }
  }
}
