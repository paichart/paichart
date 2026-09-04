/**
 * Team-membership exclusion guard (2026-05-27).
 *
 * Some accounts must never be selectable as team members / assignees, nor be
 * addable to a team via any write path:
 *   - DEMO_USER   — auto-provisioned public viewers (read-only)
 *   - SUPER_ADMIN — platform/system operator accounts (e.g. system@paichart.com),
 *                   not real project collaborators
 *
 * These roles are filtered out of the team-member/assignee pickers at the query
 * layer (see app/api/users, TeamService.getAvailableMembers, TaskService
 * .getAvailableAssignees); this helper is the write-side defense-in-depth so no
 * API path (single add, batch add, MCP/REST pov.update, pov.create) can slip one
 * onto a team even if an id is supplied directly, bypassing the pickers.
 */

import type { UserRole } from '@prisma/client';

// Single source of truth for "never a team member / assignee candidate".
export const NON_SELECTABLE_ROLES: UserRole[] = ['DEMO_USER', 'SUPER_ADMIN'];

// 2026-06-04: service accounts (passwordless, role USER — e.g. monitor@paichart.system,
// demo-owner@paichart.system) are marked by this email suffix and are likewise never
// team-member / assignee candidates. Keeping them role USER keeps them out of demo-cleanup
// (which only targets DEMO_USER); the suffix is what hides them from pickers and write paths.
export const SYSTEM_ACCOUNT_EMAIL_SUFFIX = '@paichart.system';

/** True if non-selectable by role OR by service-account email suffix. */
export function isNonSelectableUser(u: { role: UserRole; email: string | null }): boolean {
  return NON_SELECTABLE_ROLES.includes(u.role)
    || (!!u.email && u.email.endsWith(SYSTEM_ACCOUNT_EMAIL_SUFFIX));
}

// Accepts the Prisma client or a transaction client — both expose `user.findMany`.
// Loosely typed to avoid Prisma's overloaded-signature variance friction.
type UserFindMany = { user: { findMany: (...args: any[]) => Promise<any> } };

/**
 * Returns the subset of the given user ids whose role is non-selectable for team
 * membership (DEMO_USER or SUPER_ADMIN — see NON_SELECTABLE_ROLES).
 * Empty input (after dropping null/undefined/dupes) → empty set, no query.
 */
export async function findBlockedTeamMemberIds(
  client: UserFindMany,
  ids: Array<string | null | undefined>,
): Promise<Set<string>> {
  const clean = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (clean.length === 0) return new Set<string>();
  const rows: Array<{ id: string }> = await client.user.findMany({
    where: {
      id: { in: clean },
      OR: [
        { role: { in: NON_SELECTABLE_ROLES } },
        { email: { endsWith: SYSTEM_ACCOUNT_EMAIL_SUFFIX } },
      ],
    },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
