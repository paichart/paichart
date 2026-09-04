import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { adminUserSelect } from '../prisma/select';
import { mapAdminUserFromPrisma } from '../prisma/mappers';
import { AdminUser } from '../types';
import { UserRole, UserStatus } from '@/lib/types/auth';
import { invalidateUserPermissions } from '@/lib/auth/permissions';

const adminUserLogger = logger.child({ module: 'AdminUserService' });

interface CreateUserData {
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  password?: string;
  customRoleId?: string;
  isVerified?: boolean;
  verificationToken?: string;
  verifiedAt?: Date | null;
}

interface UpdateUserData {
  name?: string;
  role?: UserRole;
  status?: UserStatus;
  customRoleId?: string;
}

export class AdminUserService {
  /**
   * Get users with optional filtering
   */
  static async getUsers(options?: { page?: number; limit?: number; role?: UserRole; search?: string }): Promise<AdminUser[]> {
    try {
      const { page = 1, limit = 50, role, search } = options || {};
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (role) {
        where.role = role;
      }
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const users = await prisma.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: {
          name: 'asc',
        },
        skip,
        take: Math.min(limit, 200),
      });

      return users.map(user => mapAdminUserFromPrisma({
        ...user,
        customRole: user.customRole || undefined,
        preferredSalesTheatre: user.preferredSalesTheatre || null,
        preferredCountryId: user.preferredCountryId || null,
        preferredRegionId: user.preferredRegionId || null
      }));
    } catch (error) {
      adminUserLogger.error({ err: error }, 'Failed to get users');
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<AdminUser | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: adminUserSelect,
      });

      return user ? mapAdminUserFromPrisma({
        ...user,
        customRole: user.customRole || undefined,
        preferredSalesTheatre: user.preferredSalesTheatre || null,
        preferredCountryId: user.preferredCountryId || null,
        preferredRegionId: user.preferredRegionId || null
      }) : null;
    } catch (error) {
      adminUserLogger.error({ err: error, userId }, 'Failed to get user by ID');
      throw error;
    }
  }

  /**
   * Create new user
   */
  static async createUser(data: CreateUserData): Promise<AdminUser> {
    try {
      // Import bcrypt for password hashing
      const bcrypt = require('bcryptjs');

      // BC45 FIX: Generate a cryptographically random password if not provided (was hardcoded 'TempPass2025!')
      const crypto = require('crypto');
      const tempPassword = data.password || crypto.randomBytes(24).toString('base64url');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        status: data.status,
        // Use hashed password
        password: hashedPassword,
        customRoleId: data.customRoleId,
        isVerified: data.isVerified ?? false,
        verificationToken: data.verificationToken,
        verifiedAt: data.verifiedAt,
      },
        select: adminUserSelect,
      });

      return mapAdminUserFromPrisma({
        ...user,
        customRole: user.customRole || undefined,
        preferredSalesTheatre: user.preferredSalesTheatre || null,
        preferredCountryId: user.preferredCountryId || null,
        preferredRegionId: user.preferredRegionId || null
      });
    } catch (error) {
      adminUserLogger.error({ err: error }, 'Failed to create user');
      throw error;
    }
  }

  /**
   * Update user
   */
  static async updateUser(userId: string, data: UpdateUserData): Promise<AdminUser> {
    try {
      const roleOrStatusChanged = data.role !== undefined || data.status !== undefined;

      // BC50 FIX: Wrap user update + token invalidation in transaction (atomic privilege change)
      const user = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            name: data.name,
            role: data.role,
            status: data.status,
            customRoleId: data.customRoleId,
          },
          select: adminUserSelect,
        });

        // BC36 FIX: Invalidate all refresh tokens on role/status change
        // Forces re-login so new tokens reflect updated privileges
        // W11c/IM-2: INTENTIONALLY unscoped — post MCP refresh-token persistence this also
        // revokes the user's MCP refresh tokens on a privilege change (correct; a non-ACTIVE
        // status is additionally fail-closed at the MCP refresh grant, oauth-flow-routes W12a).
        // Protocol-11 drift-sweep marker for `provider`.
        if (roleOrStatusChanged) {
          const deleted = await tx.refreshToken.deleteMany({
            where: { userId },
          });
          adminUserLogger.info(
            { userId, role: data.role, status: data.status, tokensInvalidated: deleted.count },
            'Invalidated refresh tokens after privilege change'
          );

          // 2026-07-28: also drop cached permission decisions. Defence-in-depth — the
          // permission cache key now carries `role`, so a role change self-heals on the
          // next call. This flushes the old entries immediately rather than leaving them
          // orphaned until TTL, and covers a STATUS change too, which the key does not
          // discriminate on. `invalidateUserPermissions` was exported but had ZERO callers
          // before this; the helper existed, nothing used it.
          invalidateUserPermissions(userId);
        }

        return updatedUser;
      });

      return mapAdminUserFromPrisma({
        ...user,
        customRole: user.customRole || undefined,
        preferredSalesTheatre: user.preferredSalesTheatre || null,
        preferredCountryId: user.preferredCountryId || null,
        preferredRegionId: user.preferredRegionId || null
      });
    } catch (error) {
      adminUserLogger.error({ err: error, userId }, 'Failed to update user');
      throw error;
    }
  }

  /**
   * Delete user
   */
  static async deleteUser(userId: string): Promise<void> {
    try {
      await prisma.user.delete({
        where: { id: userId },
      });
    } catch (error) {
      adminUserLogger.error({ err: error, userId }, 'Failed to delete user');
      throw error;
    }
  }
}
