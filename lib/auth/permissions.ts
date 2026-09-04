import { prisma } from '@/lib/prisma';
import { ResourceAction, ResourceType, UserRole } from '../types/auth';
import { permissionCache, teamMembershipCache } from './cache';
import { logPermissionCheck } from './audit';
import { authLogger } from '@/lib/logger';

import { Resource } from '../types/auth';

const localLogger = authLogger.child({ module: 'permissions' });

interface User {
  id: string;
  role: UserRole;
}

export async function checkPermission(
  user: User,
  resource: Resource,
  action: ResourceAction,
  context: { ip?: string; userAgent?: string } = {}
): Promise<boolean> {
  // Capability checks pass id: null (no instance); coerce for the cache key + audit.
  const resourceId = resource.id ?? '*';

  // Super Admin bypass
  if (user.role === UserRole.SUPER_ADMIN) {
    await logPermissionCheck(
      user.id,
      resource.type,
      resourceId,
      action,
      true,
      { ...context, reason: 'SUPER_ADMIN_BYPASS' }
    );
    return true;
  }

  // Check cache first
  return await permissionCache.get(
    {
      userId: user.id,
      // 2026-07-28: the decision below is resolved from `user.role`, so the role MUST be
      // part of the key or a demoted user keeps their cached grants for the whole TTL.
      role: user.role,
      resourceType: resource.type,
      resourceId: resourceId,
      action,
    },
    async () => {
      try {
        // Get user's role permissions from database
        const rolePermission = await prisma.rolePermission.findUnique({
          where: {
            role_resourceType_action: {
              role: user.role,
              resourceType: resource.type,
              action: action,
            },
          },
        });

        if (!rolePermission) {
          await logPermissionCheck(
            user.id,
            resource.type,
            resourceId,
            action,
            false,
            { ...context, error: 'PERMISSION_NOT_FOUND' }
          );
          return false;
        }

        // Check if permission is enabled
        const hasPermission = rolePermission.enabled;

        await logPermissionCheck(
          user.id,
          resource.type,
          resourceId,
          action,
          hasPermission,
          {
            ...context,
            enabled: rolePermission.enabled,
            reason: hasPermission ? 'CONDITIONS_MET' : 'CONDITIONS_NOT_MET'
          }
        );

        return hasPermission;
      } catch (error: any) {
        const errorMessage = error?.message || 'Unknown error';
        localLogger.error({ err: error, errorMessage }, 'Permission check error');
        await logPermissionCheck(
          user.id,
          resource.type,
          resourceId,
          action,
          false,
          { ...context, error: errorMessage }
        );
        return false;
      }
    }
  );
}

export async function checkPermissions(
  user: User,
  resource: Resource,
  actions: ResourceAction[]
): Promise<Record<ResourceAction, boolean>> {
  const results = await Promise.all(
    actions.map(action => checkPermission(user, resource, action))
  );

  return actions.reduce((acc, action, index) => {
    acc[action] = results[index];
    return acc;
  }, {} as Record<ResourceAction, boolean>);
}

export function invalidateUserPermissions(userId: string): void {
  permissionCache.invalidateUserPermissions(userId);
  teamMembershipCache.invalidateUserTeams(userId);
}

export function invalidateResourcePermissions(resourceType: ResourceType, resourceId: string): void {
  permissionCache.invalidateResourcePermissions(resourceType, resourceId);
}

export function invalidateTeamPermissions(teamId: string): void {
  teamMembershipCache.invalidateTeam(teamId);
}
