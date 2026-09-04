import { Prisma } from '@prisma/client';

export const defaultSettingsSelect = {
  id: true,
  userId: true,
  settings: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSettingsSelect;

export type DefaultSettingsSelect = Prisma.UserSettingsGetPayload<{
  select: typeof defaultSettingsSelect;
}>;
