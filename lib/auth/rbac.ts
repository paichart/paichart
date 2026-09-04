import { UserRole } from '@/lib/types/auth';

type RouteConfig = {
  roles: UserRole[];
  permissions?: string[];
};

type RouteMap = {
  [key: string]: RouteConfig;
};

/**
 * Route configuration with required roles and permissions
 */
export const routes: RouteMap = {
  // PoV routes
  '/api/pov': {
    roles: [UserRole.USER],
    permissions: ['read:PoV', 'write:PoV'],
  },
  '/api/pov/[povId]': {
    roles: [UserRole.USER],
    permissions: ['read:PoV', 'write:PoV'],
  },
  '/api/pov/[povId]/phase': {
    roles: [UserRole.USER],
    permissions: ['read:PoV', 'write:PoV'],
  },
  '/api/pov/[povId]/phase/[phaseId]': {
    roles: [UserRole.USER],
    permissions: ['read:PoV', 'write:PoV'],
  },
  '/api/pov/[povId]/phase/[phaseId]/task': {
    roles: [UserRole.USER],
    permissions: ['read:PoV', 'write:PoV'],
  },
  '/api/pov/[povId]/phase/[phaseId]/task/[taskId]': {
    roles: [UserRole.USER],
    permissions: ['read:PoV', 'write:PoV'],
  },

  // Admin routes
  '/api/admin/users': {
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
    permissions: ['manage:users'],
  },
  '/api/admin/roles': {
    roles: [UserRole.SUPER_ADMIN],
    permissions: ['manage:roles'],
  },
  '/api/admin/settings': {
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
    permissions: ['manage:system'],
  },

  // Dashboard routes
  '/api/dashboard/team-activity': {
    roles: [UserRole.USER],
    permissions: ['read:activity'],
  },
  '/api/dashboard/PoV-overview': {
    roles: [UserRole.USER],
    permissions: ['read:PoV'],
  },
};

/**
 * Role hierarchy defining which roles inherit permissions from others
 */
export const roleHierarchy: { [key in UserRole]?: UserRole[] } = {
  [UserRole.SUPER_ADMIN]: [UserRole.ADMIN, UserRole.USER],
  [UserRole.ADMIN]: [UserRole.USER],
};

/**
 * Check if a role has access to a route
 */
export function hasRouteAccess(userRole: UserRole, route: string): boolean {
  const config = routes[route];
  if (!config) return false;

  // Get all roles user has access to (including inherited roles)
  const userRoles = [userRole, ...(roleHierarchy[userRole] || [])];

  // Check if user has any of the required roles
  return config.roles.some(role => userRoles.includes(role));
}

/**
 * Check if a role has specific permissions
 */
export function hasPermissions(userRole: UserRole, permissions: string[]): boolean {
  // Get all roles user has access to (including inherited roles)
  const userRoles = [userRole, ...(roleHierarchy[userRole] || [])];

  // Get all permissions from routes accessible by user roles
  const userPermissions = Object.values(routes)
    .filter(config => config.roles.some(role => userRoles.includes(role)))
    .flatMap(config => config.permissions || []);

  // Check if user has all required permissions
  return permissions.every(permission => userPermissions.includes(permission));
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(userRole: UserRole): string[] {
  // Get all roles user has access to (including inherited roles)
  const userRoles = [userRole, ...(roleHierarchy[userRole] || [])];

  // Get all permissions from routes accessible by user roles
  return Array.from(new Set(
    Object.values(routes)
      .filter(config => config.roles.some(role => userRoles.includes(role)))
      .flatMap(config => config.permissions || [])
  ));
}
