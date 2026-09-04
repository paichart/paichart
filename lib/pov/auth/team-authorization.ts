/**
 * Team Management Authorization Helper
 *
 * Centralizes team authorization logic across 4 endpoints:
 * - POST /api/pov/[povId]/team/members (add)
 * - DELETE /api/pov/[povId]/team/members/[memberId] (remove)
 * - PUT /api/pov/[povId]/team/members/[memberId] (update role)
 * - POST /api/pov/[povId]/team/members/batch (bulk add)
 *
 * Authorization Hierarchy:
 * 1. POV Owner - Full control over all team operations
 * 2. Site Admins (ADMIN, SUPER_ADMIN) - Full control (admin override)
 * 3. PROJECT_MANAGER - Can manage team with restrictions
 *
 * PROJECT_MANAGER Restrictions (from auth-permissions specialist review):
 * - Cannot remove other PROJECT_MANAGERs (owner-only)
 * - Cannot promote members to PROJECT_MANAGER (owner-only)
 * - Cannot change own role (prevents accidental self-demotion)
 * - Cannot remove owner (already protected in handlers)
 *
 * @specialist-reviewed auth-permissions (91%), architectural-review (92%), boundary-contract (92%)
 * @created 2025-11-02
 * @version 1.0
 */

import { TeamRole } from '@prisma/client';

export interface TeamAuthorizationOptions {
  operation: 'add' | 'remove' | 'updateRole' | 'bulkAdd';
  targetMemberId?: string;  // For remove/updateRole operations
  targetRole?: TeamRole;     // For updateRole operations
}

export interface TeamAuthorizationResult {
  allowed: boolean;
  reason?: string;
  authorizedAs?: 'owner' | 'admin' | 'project_manager';
}

/**
 * Check if user can manage team members
 *
 * Returns authorization result with:
 * - allowed: boolean (can user perform operation)
 * - reason: string (error message if not allowed)
 * - authorizedAs: string (for audit logging)
 *
 * @param user - Authenticated user with userId and role
 * @param pov - POV with ownerId and optional team members
 * @param options - Operation type and optional target info
 * @returns Authorization result
 */
export function canManageTeamMembers(
  user: { userId: string; role: string },
  pov: {
    id: string;
    ownerId: string;
    team?: {
      members: Array<{ userId: string; role: TeamRole; id: string; [key: string]: any }>;
    } | null;
  },
  options: TeamAuthorizationOptions
): TeamAuthorizationResult {

  // 1. Check if user is POV owner (full control)
  if (pov.ownerId === user.userId) {
    return { allowed: true, authorizedAs: 'owner' };
  }

  // 2. Check if user is site admin (full control - admin override)
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return { allowed: true, authorizedAs: 'admin' };
  }

  // 3. Check if user is PROJECT_MANAGER in this team
  const userMember = pov.team?.members?.find(m => m.userId === user.userId);
  const isProjectManager = userMember?.role === TeamRole.PROJECT_MANAGER;

  if (!isProjectManager) {
    return {
      allowed: false,
      reason: 'Only POV owner, site admin, or Project Manager can manage team members'
    };
  }

  // PROJECT_MANAGER restrictions (from auth-permissions specialist decisions)

  // Restriction 1: Cannot remove other PROJECT_MANAGERs (88% confidence)
  // Rationale: Maintains role hierarchy, prevents PROJECT_MANAGER conflicts
  if (options.operation === 'remove' && options.targetMemberId) {
    const targetMember = pov.team?.members?.find(m => m.id === options.targetMemberId);
    if (targetMember?.role === TeamRole.PROJECT_MANAGER) {
      return {
        allowed: false,
        reason: 'Only POV owner can remove Project Managers from the team',
        authorizedAs: 'project_manager'
      };
    }
  }

  // Restriction 2: Cannot promote to PROJECT_MANAGER (90% confidence)
  // Rationale: Owner controls who manages team, maintains authority delegation
  if (options.operation === 'updateRole' && options.targetRole === TeamRole.PROJECT_MANAGER) {
    return {
      allowed: false,
      reason: 'Only POV owner can assign Project Manager role',
      authorizedAs: 'project_manager'
    };
  }

  // Restriction 3: Cannot change own role (95% confidence)
  // Rationale: Prevents accidental self-demotion, security best practice
  if (options.operation === 'updateRole' && options.targetMemberId === userMember.id) {
    return {
      allowed: false,
      reason: 'Cannot change your own role',
      authorizedAs: 'project_manager'
    };
  }

  // All checks passed - PROJECT_MANAGER is authorized
  return { allowed: true, authorizedAs: 'project_manager' };
}
