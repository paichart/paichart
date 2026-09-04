import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { roleSelect, roleWithUsersSelect } from '../prisma/select';
import { mapRoleFromPrisma } from '../prisma/mappers';
import { Role, CreateRoleRequest, UpdateRoleRequest } from '../types';
import { ApiError, ErrorCode } from '@/lib/errors';

const roleLogger = logger.child({ module: 'AdminRoleService' });

export class AdminRoleService {
  /**
   * Get all roles
   */
  static async getRoles(): Promise<Role[]> {
    try {
      const roles = await prisma.role.findMany({
        select: roleWithUsersSelect,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return roles.map(mapRoleFromPrisma);
    } catch (error) {
      roleLogger.error({ err: error }, 'Failed to get roles');
      throw new ApiError(ErrorCode.DATABASE_ERROR, 'Failed to get roles');
    }
  }

  /**
   * Get a single role by ID
   */
  static async getRole(roleId: string): Promise<Role> {
    try {
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        select: roleWithUsersSelect,
      });

      if (!role) {
        throw new ApiError(ErrorCode.RECORD_NOT_FOUND, 'Role not found');
      }

      return mapRoleFromPrisma(role);
    } catch (error) {
      roleLogger.error({ err: error, roleId }, 'Failed to get role');
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(ErrorCode.DATABASE_ERROR, 'Failed to get role');
    }
  }

  /**
   * Create a new role
   */
  static async createRole(data: CreateRoleRequest): Promise<Role> {
    try {
      const existingRole = await prisma.role.findFirst({
        where: {
          name: {
            equals: data.name,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          name: true
        }
      });

      if (existingRole) {
        throw new ApiError(ErrorCode.DUPLICATE_RECORD, 'Role with this name already exists');
      }

      const role = await prisma.role.create({
        data,
        select: roleSelect,
      });

      return mapRoleFromPrisma(role);
    } catch (error: any) {
      // BC65 FIX: Handle unique constraint violation from concurrent create
      if (error?.code === 'P2002') {
        throw new ApiError(ErrorCode.DUPLICATE_RECORD, 'Role with this name already exists');
      }
      roleLogger.error({ err: error, roleName: data.name }, 'Failed to create role');
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(ErrorCode.DATABASE_ERROR, 'Failed to create role');
    }
  }

  /**
   * Update a role
   */
  static async updateRole(roleId: string, data: UpdateRoleRequest): Promise<Role> {
    try {
      const existingRole = await prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!existingRole) {
        throw new ApiError(ErrorCode.RECORD_NOT_FOUND, 'Role not found');
      }

      // Check if name is being changed and if it's already taken
      if (data.name !== existingRole.name) {
        const nameTaken = await prisma.role.findFirst({
          where: {
            name: {
              equals: data.name,
              mode: 'insensitive'
            },
            NOT: {
              id: roleId
            }
          },
          select: {
            id: true,
            name: true
          }
        });

        if (nameTaken) {
          throw new ApiError(ErrorCode.DUPLICATE_RECORD, 'Role name is already taken');
        }
      }

      const role = await prisma.role.update({
        where: { id: roleId },
        data,
        select: roleSelect,
      });

      return mapRoleFromPrisma(role);
    } catch (error: any) {
      // BC65 FIX: Handle unique constraint violation from concurrent rename
      if (error?.code === 'P2002') {
        throw new ApiError(ErrorCode.DUPLICATE_RECORD, 'Role name is already taken');
      }
      roleLogger.error({ err: error, roleId }, 'Failed to update role');
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(ErrorCode.DATABASE_ERROR, 'Failed to update role');
    }
  }

  /**
   * Delete a role
   */
  static async deleteRole(roleId: string): Promise<void> {
    try {
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        select: roleWithUsersSelect,
      });

      if (!role) {
        throw new ApiError(ErrorCode.RECORD_NOT_FOUND, 'Role not found');
      }

      // Check if role is assigned to any users
      if (role.users.length > 0) {
        throw new ApiError(ErrorCode.FOREIGN_KEY_VIOLATION, 'Cannot delete role that is assigned to users');
      }

      await prisma.role.delete({
        where: { id: roleId },
      });
    } catch (error) {
      roleLogger.error({ err: error, roleId }, 'Failed to delete role');
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(ErrorCode.DATABASE_ERROR, 'Failed to delete role');
    }
  }
}
