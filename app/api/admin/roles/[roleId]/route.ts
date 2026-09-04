import { createHandler } from '@/lib/api-handler';
import { updateRoleHandler, deleteRoleHandler } from '@/lib/admin/handlers/role';
import { RoleResponse } from '@/lib/admin/types';
import { UserRole } from '@/lib/types/auth';

export const PUT = createHandler<RoleResponse>(updateRoleHandler, { 
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN]
});

export const DELETE = createHandler<{ success: true }>(deleteRoleHandler, { 
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN]
});
