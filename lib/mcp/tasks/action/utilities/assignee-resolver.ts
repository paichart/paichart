import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';
import type { TokenPayload } from '@/lib/types/auth';

/**
 * Person-assignee resolution shared by task.assign and task.create (extracted 2026-09-25 — moved
 * VERBATIM from task-assign-handler.ts so the two actions cannot diverge; do not re-inline).
 *
 * Why task.create needed it: harness agents sent `assignee_name` on task.create 23 times
 * (2026-07-26 → 09-22, all APPROVAL gates). task.create's schema had no assignee-name key, so the
 * name was stripped and every gate landed on the POV owner. See
 * cline_docs/reviews/perform-template-param-2026-09-25/mcp-tool-architecture-advisory.md.
 * Resolution itself was rewritten 2026-09-25 (N2-f1) — see chooseAssignee.
 */

export interface ResolvedAssignee { id: string; name: string | null; email: string }

/** A POV's people, for preferring its team when a name is resolved. */
export interface PovScope { ownerId: string | null; team?: { members?: Array<{ userId: string }> } | null }

type Stage = { label: string; test: (u: ResolvedAssignee) => boolean };

/**
 * Pure matching core (unit-tested in scripts/test-assignee-resolver.ts). Stages, strictest first:
 * exact email → exact name → name/email contains the query → name contains EVERY word of the query.
 * Within a stage, exactly one match resolves; two or more is an AMBIGUITY and throws naming them (name
 * + email, so the caller can retry by email); none falls through to the next stage.
 *
 * The POV's own people (owner + team members) are tried first, through all stages; the whole user
 * table only if none of them matches — so "Josh" resolves to the Josh on this POV even when another
 * Josh exists elsewhere, and an admin (who bypasses the team check) is no longer handed a stranger
 * with the same first name.
 *
 * 2026-09-25 (N2-f1): replaced first-match resolution. Every stage used findFirst, so two users with
 * the same name resolved to whichever the database returned first (live: two "Steve Terry" accounts),
 * and the name-parts stage OR-ed the words, so "Josh Allen" matched anyone named Josh OR Allen.
 */
export function chooseAssignee(query: string, users: ResolvedAssignee[], teamIds?: Set<string>): ResolvedAssignee {
  const q = query.trim().toLowerCase();
  if (!q) throw new Error('Assignee is empty');
  const words = q.split(/\s+/).filter(Boolean);
  const name = (u: ResolvedAssignee) => (u.name ?? '').toLowerCase();
  const email = (u: ResolvedAssignee) => u.email.toLowerCase();
  const stages: Stage[] = [
    { label: 'exact email', test: u => email(u) === q },
    { label: 'exact name', test: u => name(u) === q },
    { label: 'name or email containing it', test: u => name(u).includes(q) || email(u).includes(q) },
    { label: 'name containing every word of it', test: u => words.length > 1 && words.every(w => name(u).includes(w)) },
  ];
  const pools: Array<{ scope: string; users: ResolvedAssignee[] }> = [];
  if (teamIds && teamIds.size > 0) pools.push({ scope: "this POV's owner and team", users: users.filter(u => teamIds.has(u.id)) });
  pools.push({ scope: 'all users', users });
  for (const pool of pools) {
    for (const stage of stages) {
      const hits = pool.users.filter(stage.test);
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) {
        const list = hits.map(u => `${u.name ?? '(no name)'} <${u.email}>`).join('; ');
        throw new Error(`Assignee "${query}" is ambiguous — ${hits.length} users match by ${stage.label} among ${pool.scope}: ${list}. Use the email address to choose one.`);
      }
    }
  }
  throw new Error(`User not found: "${query}"`);
}

/**
 * Resolve a person by name or email, preferring the POV's own people when a scope is given.
 * Throws on no match or an ambiguous one — never guesses. The not-found error lists the POV's people
 * when a scope is given (useful, and no wider than the caller's own POV), otherwise the user table as
 * before.
 */
export async function resolveUserByNameOrEmail(assignee: string, scope?: PovScope): Promise<ResolvedAssignee> {
  mcpLogger.debug('Looking up user for assignment');
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true }, take: 5000 });
  const teamIds = scope
    ? new Set<string>([...(scope.ownerId ? [scope.ownerId] : []), ...((scope.team?.members ?? []).map(m => m.userId))])
    : undefined;
  try {
    const found = chooseAssignee(assignee, users, teamIds);
    mcpLogger.debug({ userId: found.id }, 'User resolved for assignment');
    return found;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.startsWith('User not found')) throw e;
    const listed = teamIds && teamIds.size > 0 ? users.filter(u => teamIds.has(u.id)) : users.slice(0, 50);
    mcpLogger.warn({ availableCount: listed.length }, 'User lookup failed for assignment');
    throw new Error(`${msg}. Available users: ${listed.map(u => u.name).join(', ')}`);
  }
}

/**
 * Wave C M2 (2026-05-23, Basic Tools sec-ops Phase 3): a non-admin may only assign a POV team
 * member or the POV owner. Blocks notification-spam, workflow-disruption, and audit-trail-pollution
 * surface. Admins bypass (validatePOVAccess pattern).
 */
export function assertAssigneeInPovTeam(
  user: TokenPayload,
  pov: { ownerId: string | null; team?: { members?: Array<{ userId: string }> } | null },
  assigneeId: string
): void {
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  if (isAdmin) return;
  const isPOVOwner = pov.ownerId === assigneeId;
  const isPOVTeamMember = (pov.team?.members ?? []).some(
    (m: { userId: string }) => m.userId === assigneeId
  );
  if (!isPOVOwner && !isPOVTeamMember) {
    throw new Error(
      `User "${assigneeId}" is not a member of this POV team and is not the POV owner. ` +
      `Add them to the team via pov.update first, or assign to an existing team member.`
    );
  }
}
