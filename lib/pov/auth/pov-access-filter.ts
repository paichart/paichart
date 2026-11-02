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
 * (isAdmin-gated sub-queries: see buildPOVAccessFilterWithRole below.)
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

/**
 * Scope a task-by-TITLE lookup to the POVs the caller can access (register X9, 2026-10-31).
 *
 * task.update / task.assign / task.comment resolve a title with `task.findMany` BEFORE their
 * `validatePOVAccess` check, and on more than one match they name every match's POV title and task id
 * in the error. Unscoped, that error disclosed other tenants' POV titles (customer names) and task ids
 * to any authenticated caller, including DEMO_USER. The later access check still blocked the write;
 * the disclosure was in the lookup itself.
 *
 * ADMIN/SUPER_ADMIN get the criteria unchanged (they may see every POV). Everyone else matches only
 * tasks in a POV they own, are a team member of, or (DEMO_USER) a demo POV — `buildPOVAccessFilter`'s
 * rule. NOT identical to `validatePOVAccess`: that check also grants a `user.tenantId === pov.metadata.tenantId`
 * arm this filter lacks, so a tenant-path-only user gets "No tasks found" here (stricter, never a leak).
 * Wrapping in AND keeps any `pov` filter the caller already set (povTitle).
 *
 * FAILS CLOSED on a missing `userId` (sec-ops X9 review): Prisma drops `{ ownerId: undefined }`, so that
 * OR arm would match every POV and silently reopen the leak.
 */
export function scopeTaskTitleLookup(
  where: Prisma.TaskWhereInput,
  user: { userId: string; role: string }
): Prisma.TaskWhereInput {
  if (!user || typeof user.userId !== 'string' || user.userId.length === 0) {
    throw new Error('Task title lookup requires an authenticated user id');
  }
  const access = buildPOVAccessFilter(user);
  if (Object.keys(access).length === 0) return where;
  return { AND: [where, { pov: access }] };
}

/**
 * Scope a TEAM lookup (by id or name) to teams the caller can reach (register TEAM-LOOKUP-CROSS-TENANT,
 * 2026-10-31, sec-ops X9 review). task.assign resolved `teamName` with an unscoped exact/contains match
 * (returning the team's {id, name}), listed 50 team names from every POV on a miss, and accepted any
 * `teamId` — so a caller could enumerate other POVs' team names (often customer names) and attach a
 * foreign team to their own task.
 *
 * ADMIN/SUPER_ADMIN unchanged. Everyone else: the team of a POV they can access (buildPOVAccessFilter,
 * the withPOVAccess rule) OR a team they are a member of. Fails closed on a missing userId, like
 * scopeTaskTitleLookup.
 */
export function scopeTeamLookup(
  where: Prisma.TeamWhereInput,
  user: { userId: string; role: string }
): Prisma.TeamWhereInput {
  if (!user || typeof user.userId !== 'string' || user.userId.length === 0) {
    throw new Error('Team lookup requires an authenticated user id');
  }
  const access = buildPOVAccessFilter(user);
  if (Object.keys(access).length === 0) return where;
  return { AND: [where, { OR: [{ pov: access }, { members: { some: { userId: user.userId } } }] }] };
}

/**
 * Scope a task lookup BY ID to tasks in POVs the caller can access (register DEPENDENCY-IDS-UNSCOPED,
 * 2026-10-31, auth-permissions review). task.create / task.update validated `dependencyIds` only for EXISTENCE,
 * so a non-admin could wire a dependency edge to another POV's task. Same rule and same fail-closed behaviour as
 * scopeTaskTitleLookup; a foreign id is treated exactly like a missing one (skipped with the existing warn), so
 * the reply does not reveal that it exists. Measured before shipping: 0 of 3,900 prod dependency edges cross a
 * POV, so no existing pipeline, program or reactor wiring is affected.
 */
export function scopeTaskIdLookup(
  where: Prisma.TaskWhereInput,
  user: { userId: string; role: string }
): Prisma.TaskWhereInput {
  return scopeTaskTitleLookup(where, user);
}

