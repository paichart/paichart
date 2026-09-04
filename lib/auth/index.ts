import * as tokenManager from './token-manager';
import * as permissions from './permissions';
import * as rbac from './rbac';
import * as audit from './audit';
import * as cache from './cache';
export * from './token-manager';
export * from './get-auth-user';
export { verifyToken } from '@/lib/jwt';

// Re-export individual functions from token-manager
export const {
  signAccessToken,
  signRefreshToken,
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
} = tokenManager;

// Re-export individual functions from permissions
export const {
  checkPermission,
  checkPermissions,
  invalidateUserPermissions,
  invalidateResourcePermissions,
  invalidateTeamPermissions,
} = permissions;

// Re-export individual functions from rbac
export const {
  getRolePermissions,
} = rbac;

// Export combined auth object
export const auth = {
  tokens: tokenManager,
  permissions,
  rbac,
  audit,
  cache,
};

export default auth;
