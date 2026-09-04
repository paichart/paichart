/**
 * POV Update Handler for MCP Tasks Action API
 *
 * @description Updates an existing POV's top-level fields (status, dates, team
 *   management, description, etc.). Admin-only operation per D1 v3 of the
 *   Option B implementation plan.
 *
 * Scope (Option B v3.4):
 *   - Top-level POV fields only (~25 fields). NO nested tasks/stages/phases —
 *     use task.update / stage.create / etc. for those.
 *   - Team management delegated to lib/pov/services/team.ts:applyTeamUpdate
 *     (shared with REST PUT /api/pov/[povId]; same atomicity guarantees).
 *   - Status transitions validated via statusService.validateTransition.
 *   - phaseTemplateIds intentionally excluded (legacy product feature).
 *
 * Auth:
 *   - Admin-only (UserRole.ADMIN or UserRole.SUPER_ADMIN). Customer-confirmed
 *     2026-05-15 — non-admin POV owners use REST/web UI for updates.
 *   - validatePOVAccess runs after the admin check for cross-tenant safety
 *     (admins can't update POVs outside their tenant).
 *
 * Atomicity:
 *   - POV scalar update + applyTeamUpdate wrapped in prisma.$transaction.
 *   - Status validation runs before the transaction (read-only).
 *
 * @plan cline_docs/reviews/pov-update-spec-2026-05-15/option-b-implementation-plan.md
 * @version 1.0.0
 * @since 2026-05-15
 */

import { Prisma, UserRole, POVStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { TokenPayload } from '@/lib/types/auth';
import { mcpLogger } from '@/lib/logger';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { MCPParameterSchemas } from '@/lib/validation/mcp-action-validation';
import { applyTeamUpdate } from '@/lib/pov/services/team';
import { statusService } from '@/lib/pov/services/status';
import { mapPoVToResponse } from '@/lib/pov/prisma/mappers';

const log = mcpLogger.child({ module: 'POVUpdateHandler' });

type POVUpdateParams = z.infer<typeof MCPParameterSchemas['pov.update']>;

export async function handlePOVUpdate(
  parameters: any,
  user: TokenPayload,
  actionId: string,
): Promise<any> {
  log.info({ actionId, userId: user.userId }, 'starting POV update');

  // ── 1. Cast to typed params ──
  // Schema enforcement happens at the router boundary
  // (lib/mcp/tasks/action/tasks-action-router.ts) — see the SECURITY block
  // there for why. By the time this handler runs, `parameters` has been
  // validated, refined, and transformed by MCPParameterSchemas['pov.update'].
  const params = parameters as POVUpdateParams;

  // ── 2. Auth (D1 v3): admin-only ──
  // Customer-confirmed 2026-05-15: non-admin POV owners use REST/web UI.
  // Matches pov-create-handler.ts:155-159 pattern.
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    throw new Error(
      `🔒 Admin Access Required: Updating POVs via MCP requires ADMIN role. ` +
      `Your role: ${user.role}. To update a POV you own, use the web UI or REST endpoint. ` +
      `Contact an administrator if you need MCP update access.`
    );
  }

  // ── 3. Fetch POV (auth-check shape + status for transition validation) ──
  // Mirrors put.ts:295-313 — same auth-check shape used by REST.
  const pov = await prisma.pOV.findUnique({
    where: { id: params.povId },
    select: {
      id: true,
      ownerId: true,
      title: true,         // for response payload
      status: true,        // for status-transition validation
      metadata: true,      // for validatePOVAccess
      team: {
        select: {
          members: {
            select: {
              userId: true,
              user: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!pov) {
    throw new Error(
      `POV not found: "${params.povId}"\n\n` +
      `The POV may not exist or you don't have access.\n\n` +
      `💡 Find POVs: project(action: "pov.list")`
    );
  }

  // ── 4. Cross-tenant access check (validatePOVAccess after admin check) ──
  validatePOVAccess(user, pov, {
    throwOnDeny: true,
    requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix; also admin-gated upstream)
    logContext: 'MCP pov.update',
  });

  // ── 5. Status transition validation if status is changing ──
  if (params.status !== undefined && params.status !== pov.status) {
    const transitionResult = await statusService.validateTransition(
      params.povId,
      params.status as POVStatus,
    );
    if (!transitionResult.valid) {
      throw new Error(
        `Status transition rejected: ${transitionResult.errors.join('; ')}`
      );
    }
  }

  // ── 6. Build scalar update data (undefined-skip pattern per D2 v2) ──
  // Per D2 v2: MCP does NOT support null-clearing. The FormField transforms
  // strip null → undefined for nullable fields; the undefined-skip pattern
  // below correctly preserves existing column values when the client omits a key.
  const updateData: Prisma.POVUpdateInput = {};

  if (params.title !== undefined) updateData.title = params.title;
  if (params.description !== undefined) updateData.description = params.description;
  if (params.objective !== undefined) updateData.objective = params.objective;
  if (params.status !== undefined) updateData.status = params.status as POVStatus;
  if (params.priority !== undefined) updateData.priority = params.priority;
  if (params.salesTheatre !== undefined) updateData.salesTheatre = params.salesTheatre;
  if (params.startDate !== undefined) updateData.startDate = new Date(params.startDate);
  if (params.endDate !== undefined) updateData.endDate = new Date(params.endDate);
  if (params.forecastDate !== undefined) updateData.forecastDate = new Date(params.forecastDate);
  if (params.customerName !== undefined) updateData.customerName = params.customerName;
  if (params.customerContact !== undefined) updateData.customerContact = params.customerContact;
  if (params.partnerName !== undefined) updateData.partnerName = params.partnerName;
  if (params.partnerContact !== undefined) updateData.partnerContact = params.partnerContact;
  if (params.solution !== undefined) updateData.solution = params.solution;
  if (params.opportunityName !== undefined) updateData.opportunityName = params.opportunityName;
  if (params.competitors !== undefined) updateData.competitors = params.competitors;
  if (params.estimatedBudget !== undefined) updateData.estimatedBudget = params.estimatedBudget;
  if (params.revenue !== undefined) updateData.revenue = params.revenue;
  if (params.countryId !== undefined) updateData.country = { connect: { id: params.countryId } };
  if (params.regionId !== undefined) updateData.region = { connect: { id: params.regionId } };
  if (params.metadata !== undefined) {
    updateData.metadata = params.metadata as Prisma.InputJsonValue;
  }

  // ── 7. $transaction: POV scalar update + team management (atomicity per arch-review B1) ──
  // Note (v3.1): phaseTemplateIds is NOT exposed in MCP pov.update. Legacy
  // product feature — not propagated to new surfaces. REST still uses
  // ensurePhasesFromTemplates for its own callers; MCP doesn't touch that path.
  const updatedPov = await prisma.$transaction(async (tx) => {
    // 7a. Apply POV-scalar updates (single Prisma update)
    const povUpdated = await tx.pOV.update({
      where: { id: params.povId },
      data: updateData,
    });

    // 7b. Apply team-management updates if any team field was provided.
    //     Helper extracted from put.ts:867-980 (commit cfc4ee16).
    const teamFieldProvided =
      params.projectManager !== undefined ||
      params.salesEngineers !== undefined ||
      params.technicalTeam !== undefined ||
      params.teamMembers !== undefined ||
      params.replaceTeamMembers !== undefined;

    if (teamFieldProvided) {
      await applyTeamUpdate(
        params.povId,
        {
          projectManager: params.projectManager,
          salesEngineers: params.salesEngineers,
          technicalTeam: params.technicalTeam,
          teamMembers: params.teamMembers,
          replaceTeamMembers: params.replaceTeamMembers,
        },
        tx,
      );
    }

    return povUpdated;
  });

  // Change G (2026-06-22 review): audit committed POV status transitions (thrash trail).
  if (params.status !== undefined && params.status !== pov.status) {
    const { trackActivity } = await import('@/lib/auth/audit');
    await trackActivity(user.userId, 'POV_STATUS_CHANGE', `${pov.status}->${params.status}`, {
      resourceId: params.povId,
      source: 'mcp_server',
      success: true,
      oldStatus: pov.status,
      newStatus: params.status,
    });
  }

  const updatedFields = Object.keys(updateData);
  // 2026-08-19 (morning-list #7): team writes go through applyTeamUpdate, not
  // updateData — a team-only update used to report "0 fields changed" while it
  // wrote TeamMember rows (observed live: an OWNER-row restore reported 0).
  for (const f of ['projectManager', 'salesEngineers', 'technicalTeam', 'teamMembers'] as const) {
    if ((params as Record<string, unknown>)[f] !== undefined) updatedFields.push(f);
  }
  log.info(
    { actionId, povId: params.povId, fieldsUpdated: updatedFields },
    'POV update complete'
  );

  return {
    actionId,
    action: 'pov.update',
    status: 'completed',
    result: {
      success: true,
      pov: {
        id: updatedPov.id,
        title: updatedPov.title,
        status: updatedPov.status,
        priority: updatedPov.priority,
      },
      summary: {
        fieldsUpdated: updatedFields,
        fieldCount: updatedFields.length,
      },
      message: `POV "${updatedPov.title}" updated successfully (${updatedFields.length} field${updatedFields.length === 1 ? '' : 's'} changed)`,
    },
  };
}
