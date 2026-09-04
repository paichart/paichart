import { Prisma } from '@prisma/client';

export interface UserSettings {
  timezone: string;
  notifications?: {
    email: boolean;
    inApp: boolean;
    desktop: boolean;
  };
  theme?: {
    mode: 'light' | 'dark' | 'system';
    primaryColor?: string;
    fontSize?: 'small' | 'medium' | 'large';
  };
  display?: {
    dateFormat?: string;
    timeFormat?: '12h' | '24h';
    firstDayOfWeek?: 0 | 1; // 0 = Sunday, 1 = Monday
  };
  accessibility?: {
    reducedMotion?: boolean;
    highContrast?: boolean;
    screenReader?: boolean;
  };
}

export const defaultUserSettings: UserSettings = {
  timezone: 'Australia/Sydney',
  notifications: {
    email: true,
    inApp: true,
    desktop: false,
  },
  theme: {
    mode: 'system',
    fontSize: 'medium',
  },
  display: {
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    firstDayOfWeek: 1,
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    screenReader: false,
  },
};

export type UserSettingsUpdate = Partial<UserSettings>;

// Prisma types
export type UserSettingsSelect = Prisma.UserSettingsSelect;
export type UserSettingsWhereInput = Prisma.UserSettingsWhereInput;
export type UserSettingsWhereUniqueInput = Prisma.UserSettingsWhereUniqueInput;
export type UserSettingsCreateInput = Prisma.UserSettingsCreateInput;
export type UserSettingsUpdateInput = Prisma.UserSettingsUpdateInput;
