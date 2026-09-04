import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse, UserRole, UserStatus } from '@/lib/types/auth';
import { authLogger } from '@/lib/logger';
import { AdminUserService } from '../services/user';
import { AdminUserResponse } from '../types';
import { CreateUserSchema, ListUsersSchema } from '@/lib/validation/admin-user-validation';
import { trackActivity } from '@/lib/auth/audit';

const adminHandlerLogger = authLogger.child({ module: 'AdminUserHandler' });

const roleHierarchy: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 3,
  [UserRole.ADMIN]: 2,
  [UserRole.USER]: 1,
  [UserRole.DEMO_USER]: 1, // Same rank as USER (Feb 2026)
};

interface CreateUserRequest {
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  password?: string;
  customRoleId?: string;
}

interface UpdateUserRequest {
  name?: string;
  role?: UserRole;
  status?: UserStatus;
  customRoleId?: string;
}

export async function getAdminUsersHandler(
  req: NextRequest,
  _context: { params: Record<string, string> },
  user?: TokenPayload
): Promise<AdminUserResponse> {
  try {
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
      return { error: { message: 'Unauthorized - requires admin access', code: 'UNAUTHORIZED' } };
    }

    const { searchParams } = new URL(req.url);

    const queryParams = {
      page: parseInt(searchParams.get('page') || '1', 10) || 1,
      limit: Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100),
      role: searchParams.get('role') || undefined,
      search: searchParams.get('search') || undefined
    };

    const validation = ListUsersSchema.safeParse(queryParams);
    if (!validation.success) {
      return {
        error: {
          message: 'Invalid query parameters: ' + validation.error.errors.map(e => e.message).join(', '),
          code: 'VALIDATION_ERROR'
        }
      };
    }

    const { page, limit, role, search } = validation.data;
    const users = await AdminUserService.getUsers({ page, limit, role: role as UserRole | undefined, search });

    return {
      data: { users },
    };
  } catch (error) {
    adminHandlerLogger.error({ err: error }, 'Failed to get admin users');
    throw error;
  }
}

export async function createUserHandler(
  req: NextRequest,
  _context: { params: Record<string, string> },
  user?: TokenPayload
): Promise<AdminUserResponse> {
  try {
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
      return { error: { message: 'Unauthorized - Admin access required', code: 'UNAUTHORIZED' } };
    }

    const data = await req.json();

    const validation = CreateUserSchema.safeParse(data);
    if (!validation.success) {
      return {
        error: {
          message: 'Invalid user data: ' + validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          code: 'VALIDATION_ERROR'
        }
      };
    }

    const validated = validation.data;

    const requestData: CreateUserRequest = {
      email: validated.email,
      name: validated.name,
      role: validated.role as UserRole,
      status: validated.status ?? UserStatus.ACTIVE, // honor form status; default ACTIVE when omitted
      password: validated.password,
      customRoleId: validated.customRoleId ?? undefined, // honor form custom role (SUPER_ADMIN-gated below)
    };

    const currentUserRoleLevel = roleHierarchy[user.role];
    const newUserRoleLevel = roleHierarchy[requestData.role];

    if (newUserRoleLevel > currentUserRoleLevel) {
      return { error: { message: 'Cannot create a user with a higher role than your own', code: 'FORBIDDEN' } };
    }

    // BC39 parity with the update path: only SUPER_ADMIN can assign custom roles (prevents privilege
    // escalation via custom permissions). Without this, honoring customRoleId on create would be a hole.
    if (requestData.customRoleId && user.role !== 'SUPER_ADMIN') {
      return { error: { message: 'Only SUPER_ADMIN can assign custom roles', code: 'FORBIDDEN' } };
    }

    const newUser = await AdminUserService.createUser(requestData);

    await trackActivity(
      user.userId,
      'USER_MANAGEMENT',
      'CREATE_USER',
      {
        targetUserId: newUser.id,
        targetEmail: newUser.email,
        targetRole: newUser.role,
        success: true
      }
    );

    adminHandlerLogger.info({ actorId: user.userId, targetUserId: newUser.id, role: newUser.role }, 'User created');

    return {
      data: { users: [newUser] },
    };
  } catch (error) {
    // Handle duplicate email (Prisma unique constraint violation)
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return { error: { message: 'A user with this email already exists', code: 'VALIDATION_ERROR' } };
    }
    adminHandlerLogger.error({ err: error }, 'Failed to create user');
    throw error;
  }
}

export async function updateUserHandler(
  req: NextRequest,
  _context: { params: Record<string, string> },
  user?: TokenPayload
): Promise<AdminUserResponse> {
  try {
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
      return { error: { message: 'Unauthorized - requires admin access', code: 'UNAUTHORIZED' } };
    }

    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return { error: { message: 'User ID is required', code: 'VALIDATION_ERROR' } };
    }

    const body = await req.json();

    const { UpdateUserSchema } = await import('@/lib/validation/admin-user-validation');
    const result = UpdateUserSchema.safeParse(body);

    if (!result.success) {
      return {
        error: {
          message: 'Validation failed: ' + result.error.errors.map(e => e.message).join(', '),
          code: 'VALIDATION_ERROR'
        }
      };
    }

    const requestData: UpdateUserRequest = {
      name: result.data.name,
      role: result.data.role,
      status: result.data.status,
      customRoleId: result.data.customRoleId,
    };

    const targetUser = await AdminUserService.getUserById(userId);

    if (!targetUser) {
      return { error: { message: 'User not found', code: 'NOT_FOUND' } };
    }

    const currentUserRoleLevel = roleHierarchy[user.role];
    const targetUserRoleLevel = roleHierarchy[targetUser.role];
    const newRoleLevel = requestData.role ? roleHierarchy[requestData.role] : targetUserRoleLevel;

    if (targetUserRoleLevel > currentUserRoleLevel) {
      return { error: { message: 'Cannot modify a user with a higher role than your own', code: 'FORBIDDEN' } };
    }

    if (newRoleLevel > currentUserRoleLevel) {
      return { error: { message: 'Cannot assign a role higher than your own', code: 'FORBIDDEN' } };
    }

    // BC39 FIX: Only SUPER_ADMIN can assign custom roles (prevents privilege escalation via custom permissions)
    if (requestData.customRoleId && user.role !== 'SUPER_ADMIN') {
      return { error: { message: 'Only SUPER_ADMIN can assign custom roles', code: 'FORBIDDEN' } };
    }

    const updatedUser = await AdminUserService.updateUser(userId, requestData);

    // P2.4 (2026-05-24): SOC 2 CC6.1 evidence — admin user mutation audit
    void trackActivity(user.userId, 'USER_MANAGEMENT', 'UPDATE_USER', {
      targetUserId: updatedUser.id,
      targetEmail: updatedUser.email,
      changes: requestData,
      previousRole: targetUser.role,
      newRole: updatedUser.role,
      success: true,
      source: 'admin',
    });

    return {
      data: { users: [updatedUser] },
    };
  } catch (error) {
    adminHandlerLogger.error({ err: error }, 'Failed to update user');
    throw error;
  }
}

export async function deleteUserHandler(
  req: NextRequest,
  _context: { params: Record<string, string> },
  user?: TokenPayload
): Promise<AdminUserResponse> {
  try {
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
      return { error: { message: 'Unauthorized - requires admin access', code: 'UNAUTHORIZED' } };
    }

    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return { error: { message: 'User ID is required', code: 'VALIDATION_ERROR' } };
    }

    const targetUser = await AdminUserService.getUserById(userId);

    if (!targetUser) {
      return { error: { message: 'User not found', code: 'NOT_FOUND' } };
    }

    const currentUserRoleLevel = roleHierarchy[user.role];
    const targetUserRoleLevel = roleHierarchy[targetUser.role];

    if (targetUserRoleLevel > currentUserRoleLevel) {
      return { error: { message: 'Cannot delete a user with a higher role than your own', code: 'FORBIDDEN' } };
    }

    await AdminUserService.deleteUser(userId);

    // P2.4 (2026-05-24): SOC 2 CC6.1 evidence — admin user deletion audit (CRITICAL)
    void trackActivity(user.userId, 'USER_MANAGEMENT', 'DELETE_USER', {
      targetUserId: userId,
      targetEmail: targetUser.email,
      deletedRole: targetUser.role,
      success: true,
      source: 'admin',
    });

    return {
      data: { users: [] },
    };
  } catch (error) {
    adminHandlerLogger.error({ err: error }, 'Failed to delete user');
    throw error;
  }
}
