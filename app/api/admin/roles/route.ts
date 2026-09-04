import { createHandler } from '@/lib/api-handler';
import { getAdminRolesHandler, createRoleHandler } from '@/lib/admin/handlers/role';
import { Role } from '@/lib/admin/types';
import { UserRole } from '@/lib/types/auth';

const adminAuthConfig = {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
};

// Use Role[] for GET since it returns an array of roles
export const GET = createHandler<Role[]>(getAdminRolesHandler, adminAuthConfig);
export const POST = createHandler<Role>(createRoleHandler, adminAuthConfig);
