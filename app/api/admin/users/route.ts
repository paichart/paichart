import { createHandler } from '@/lib/api-handler';
import { getAdminUsersHandler, createUserHandler, updateUserHandler, deleteUserHandler } from '@/lib/admin/handlers/user';
import { UserRole } from '@/lib/types/auth';

const authConfig = {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
};

export const GET = createHandler(getAdminUsersHandler, authConfig);
export const POST = createHandler(createUserHandler, authConfig);
export const PUT = createHandler(updateUserHandler, authConfig);
export const DELETE = createHandler(deleteUserHandler, authConfig);
