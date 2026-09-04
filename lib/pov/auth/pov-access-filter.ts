/**
 * POV Access Filter Helper
 *
 * Centralizes the "which POVs can this user see?" Prisma WHERE clause
 * across 9+ endpoints that query multiple POVs (dashboards, lists, analytics).
 *
 * Authorization Hierarchy:
 * 1. ADMIN / SUPER_ADMIN - See all POVs (no filter)
 * 2. USER - See owned POVs + POVs where team member
 * 3. DEMO_USER - See owned + team + demo-flagged POVs
 *
 * This is different from validatePOVAccess (single POV gate → 403).
 * This helper returns a Prisma WHERE clause for filtering lists.
 *
 * @specialist-reviewed auth-permissions (95%), api-efficiency (94%), architectural-review (95%)
 * @created 2026-04-02
 * @version 1.0
 */

import { Prisma } from '@prisma/client';

/**
 * Build a Prisma WHERE clause that scopes queries to POVs the user can access.
 *
 * Used by: dashboard, analytics, agent-executions, task activities, POV lists
 *
 * @param user - Authenticated user with userId and role
 * @returns Prisma.POVWhereInput - merge into your query's `where` clause
 *
 * @example
 * // Direct usage (count, findMany on POV table)
 * const filter = buildPOVAccessFilter(user);
 * const povs = await prisma.pOV.findMany({ where: { ...filter, status: 'ACTIVE' } });
 *
 * @example
 * // Nested usage (filter tasks by accessible POVs)
 * const filter = buildPOVAccessFilter(user);
 * const tasks = await prisma.task.findMany({ where: { pov: filter } });
 *
 * @example
 * // With isAdmin check (for scoped sub-queries like teams, activities)
 * const { filter, isAdmin } = buildPOVAccessFilterWithRole(user);
 * const teams = await prisma.team.findMany({
 *   where: isAdmin ? {} : { povs: { some: filter } }
 * });
 */
export function buildPOVAccessFilter(
  user: { userId: string; role: string }
): Prisma.POVWhereInput {
  // ADMIN/SUPER_ADMIN: see all (no filter)
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return {};
  }

  // Build OR conditions: owned + team member
  const orConditions: Prisma.POVWhereInput[] = [
    { ownerId: user.userId },
    { team: { members: { some: { userId: user.userId } } } },
  ];

  // DEMO_USER: also see demo-flagged POVs
  if (user.role === 'DEMO_USER') {
    orConditions.push({
      metadata: { path: ['isDemo'], equals: true },
    });
  }

  return { OR: orConditions };
}

/**
 * Build POV access filter with admin flag for conditional sub-queries.
 *
 * Some endpoints need to know if the user is admin to decide whether
 * to apply the filter to nested relations (teams, activities, etc.).
 *
 * @param user - Authenticated user with userId and role
 * @returns { filter, isAdmin } - the WHERE clause and admin flag
 *
 * @example
 * const { filter, isAdmin } = buildPOVAccessFilterWithRole(user);
 * const taskWhere = {
 *   createdAt: { gte: startDate },
 *   ...(isAdmin ? {} : { pov: filter })
 * };
 */
export function buildPOVAccessFilterWithRole(
  user: { userId: string; role: string }
): { filter: Prisma.POVWhereInput; isAdmin: boolean } {
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  return {
    filter: buildPOVAccessFilter(user),
    isAdmin,
  };
}
