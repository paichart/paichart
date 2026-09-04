import { prisma } from '@/lib/prisma';
import { Prisma, TeamRole } from '@prisma/client';
import { TeamMemberSelection } from '../types/team';
import { teamMemberSelect } from '../prisma/team';
import { povLogger } from '@/lib/logger';
import { findBlockedTeamMemberIds, NON_SELECTABLE_ROLES, SYSTEM_ACCOUNT_EMAIL_SUFFIX } from '@/lib/utils/team-member-guard';

const orchLog = povLogger.child({ module: 'TeamUpdate' });

export class TeamService {
  /**
   * Get available users for team member selection
   */
  static async getAvailableMembers({ povId, ownerId }: TeamMemberSelection) {
    try {
      povLogger.debug({ povId, ownerId }, 'Fetching available team members');
      
      const users = await prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          role: { notIn: NON_SELECTABLE_ROLES }, // 2026-05-27: demo + super-admin/system accounts are not team-member candidates
          email: { not: { endsWith: SYSTEM_ACCOUNT_EMAIL_SUFFIX } }, // 2026-06-04: hide @paichart.system service accounts
        },
        select: teamMemberSelect,
        orderBy: {
          name: 'asc',
        },
        take: 200,
      });
      
      povLogger.debug({ povId, count: users.length }, 'Available team members found');
      return users;
    } catch (error) {
      povLogger.error({ err: error, povId }, 'Failed to fetch available members');
      throw error;
    }
  }

  /**
   * Check if a user is a member of a team
   */
  static async isTeamMember({ teamId, userId }: { teamId: string; userId: string }) {
    try {
      const member = await prisma.teamMember.findFirst({
        where: {
          teamId,
          userId,
        },
      });
      return !!member;
    } catch (error) {
      povLogger.error({ err: error, teamId, userId }, 'Failed to check team membership');
      throw error;
    }
  }

  // 2026-08-19: addMembers + updateMembers DELETED (zero callers repo-wide,
  // incl. dynamic-dispatch sweep; defend-vs-delete rule). updateMembers was
  // also a re-add-the-bug trap: its blanket deleteMany({}) is the same
  // OWNER-row-destroying replace semantics fixed in applyTeamUpdate the same
  // day (morning-list #7, commit 78a5dc88). Team writes go through
  // applyTeamUpdate below — do not resurrect these.
}

// ════════════════════════════════════════════════════════════════════════════
// POV-Update Team Orchestration (extracted 2026-05-15 from put.ts:858-980)
// ════════════════════════════════════════════════════════════════════════════
//
// `applyTeamUpdate` is the shared orchestration for the POV-update team-management
// flow: role assignments (project manager / sales engineers / technical team),
// teamMember upserts + replace, and on-demand team creation. Extracted per the
// Option B implementation plan (File 0) at
// `cline_docs/reviews/pov-update-spec-2026-05-15/option-b-implementation-plan.md`.
//
// **Atomicity**: callers MUST wrap this in `prisma.$transaction`. The function
// does NOT start its own tx — sub-writes (3-12, depending on input) need to
// commit/rollback together with the caller's POV update.
//
// **Why extract**: REST `PUT /api/pov/[povId]` and (planned) MCP `pov.update`
// both need the same orchestration. Without extraction the two paths would
// inline-duplicate the logic, creating BC75-style sibling-drift risk.
//
// **Out of scope**: `phaseTemplateIds` is NOT handled here. It triggers
// `ensurePhasesFromTemplates` which runs outside the existing tx in REST today
// (`put.ts:1032-1049`). Per arch-review (2026-05-15 review round 3): including
// it in this helper risks serialize-deadlock or atomicity break. REST keeps
// its existing post-tx call; MCP `pov.update` doesn't expose the field at all
// (legacy product feature, Steve 2026-05-15).

export interface TeamUpdateParams {
  projectManager?: string;
  salesEngineers?: string[];
  technicalTeam?: string[];
  teamMembers?: Array<{ userId: string; role: TeamRole | string }>;
  replaceTeamMembers?: boolean;
  // NOTE: phaseTemplateIds is intentionally NOT in this interface. See file-level
  // docstring for rationale.
}

export interface TeamUpdateResult {
  /**
   * The POV's teamId after the update. May be newly-created if the POV had no
   * team and `teamMembers` was provided. Callers maintaining local POV state
   * should sync against this value.
   */
  teamId: string | null;
}

/**
 * Apply team-management updates to a POV inside an existing transaction.
 *
 * Behavior preserved verbatim from `put.ts:858-980` (no logic changes during
 * extraction). Existing edge case: if `projectManager`/`salesEngineers`/
 * `technicalTeam` are provided but the POV has no team AND `teamMembers` is
 * empty/absent, the role assignments are silently dropped (the role-upsert
 * branch requires `currentTeamId` to be truthy, and the team-creation branch
 * only fires for `teamMembers`). This is the pre-existing REST behavior;
 * preserving for parity. If product wants to fix it (always create a team if
 * any team input is provided), file as a separate behavior-change commit.
 */
export async function applyTeamUpdate(
  povId: string,
  params: TeamUpdateParams,
  tx: Prisma.TransactionClient,
): Promise<TeamUpdateResult> {
  // Fetch current POV state (one read; needed for teamId + title-for-team-naming).
  const pov = await tx.pOV.findUnique({
    where: { id: povId },
    select: { id: true, title: true, teamId: true },
  });
  if (!pov) {
    throw new Error(`POV not found: ${povId}`);
  }

  let currentTeamId: string | null = pov.teamId;

  // 2026-05-27: demo + super-admin/system accounts must never become team members.
  // Defense-in-depth behind the picker filters — this is the shared sink for MCP
  // pov.update + REST POV update.
  const blockedIds = await findBlockedTeamMemberIds(tx, [
    params.projectManager,
    ...(params.salesEngineers || []),
    ...(params.technicalTeam || []),
    ...((params.teamMembers || []).map((m: { userId?: string }) => m?.userId)),
  ]);
  if (blockedIds.size > 0) {
    throw new Error(`FORBIDDEN:These users cannot be added to a team: ${[...blockedIds].join(', ')}`);
  }

  // ── 1. Role assignments (PM / SE / TT) ────────────────────────────────
  // BC65 FIX: atomic upsert pattern prevents check-then-act races.
  // Only fires if POV has a team; pre-existing behavior preserved.
  const projectManager = params.projectManager;
  const salesEngineers = params.salesEngineers || [];
  const technicalTeam = params.technicalTeam || [];

  if (projectManager || salesEngineers.length > 0 || technicalTeam.length > 0) {
    if (currentTeamId) {
      const teamId = currentTeamId;
      const assignRole = async (memberId: string, role: TeamRole) => {
        await tx.teamMember.upsert({
          where: { teamId_userId: { teamId, userId: memberId } },
          update: { role },
          create: { teamId, userId: memberId, role },
        });
        orchLog.debug({ povId, role }, 'team member role assigned (upsert)');
      };

      if (projectManager) {
        await assignRole(projectManager, TeamRole.PROJECT_MANAGER);
      }
      for (const userId of salesEngineers) {
        await assignRole(userId, TeamRole.SALES_ENGINEER);
      }
      for (const userId of technicalTeam) {
        await assignRole(userId, TeamRole.TECHNICAL_TEAM);
      }
    }
  }

  // ── 2. teamMembers array handling (replace-or-add + on-demand team creation) ──
  const teamMembers = params.teamMembers;
  if (teamMembers && Array.isArray(teamMembers)) {
    if (currentTeamId) {
      // POV already has a team — update members.
      const teamId = currentTeamId;
      const shouldReplaceTeamMembers = params.replaceTeamMembers === true;

      if (shouldReplaceTeamMembers) {
        orchLog.info({ povId }, 'replacing existing team members');
        // 2026-08-19 (morning-list #7): preserve OWNER rows on replace. The GUI
        // normalizer derives teamMembers from the PM/SE/TT dropdowns ONLY (the
        // owner is never in that list) and hard-sets replaceTeamMembers=true
        // (normalizer.ts:598) — so every GUI POV save was silently DELETING the
        // owner's team membership seeded at pov.create. OWNER membership is
        // platform-owned; replace semantics apply to the dropdown-managed roles.
        // (If teamMembers explicitly lists the owner, the upsert below still wins.)
        await tx.teamMember.deleteMany({ where: { teamId, role: { not: TeamRole.OWNER } } });
      } else {
        orchLog.debug({ povId }, 'keeping existing team members');
      }

      // Add new team members (one-by-one to ensure all are created).
      if (teamMembers.length > 0) {
        for (const member of teamMembers) {
          // Normalize legacy 'TECHNICAL' alias to TECHNICAL_TEAM
          let role = member.role;
          if (role === 'TECHNICAL') {
            role = 'TECHNICAL_TEAM';
          }
          await tx.teamMember.create({
            data: {
              teamId,
              userId: member.userId,
              role: role as TeamRole,
            },
          });
        }
      }
    } else if (teamMembers.length > 0) {
      // POV has no team yet — create one + link.
      const team = await tx.team.create({
        data: {
          name: `${pov.title} Team`,
          pov: {
            connect: { id: povId },
          },
        },
      });

      for (const member of teamMembers) {
        let role = member.role;
        if (role === 'TECHNICAL') {
          role = 'TECHNICAL_TEAM';
        }
        await tx.teamMember.create({
          data: {
            teamId: team.id,
            userId: member.userId,
            role: role as TeamRole,
          },
        });
      }

      // Link the new team to the POV.
      await tx.pOV.update({
        where: { id: povId },
        data: { teamId: team.id },
      });

      currentTeamId = team.id;
    }
  }

  return { teamId: currentTeamId };
}
