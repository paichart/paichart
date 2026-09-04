import { createHandler } from '@/lib/api-handler';
import { getAdminSettingsHandler, updateAdminSettingsHandler } from '@/lib/admin/handlers/settings';
import { SystemSettings } from '@/lib/admin/types';
import { UserRole } from '@/lib/types/auth';

// BC60 FIX: Add allowedRoles for defense-in-depth (handler also checks)
const authConfig = { requireAuth: true, allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] as UserRole[], rateLimit: 'admin' as const };

export const GET = createHandler<SystemSettings>(getAdminSettingsHandler, authConfig);
export const PUT = createHandler<SystemSettings>(updateAdminSettingsHandler, authConfig);
