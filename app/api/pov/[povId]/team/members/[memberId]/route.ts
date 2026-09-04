import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { logTeamMembershipChange } from '@/lib/auth/audit';
import { TeamRole } from '@prisma/client';
import { UpdateTeamMemberRoleSchema } from '@/lib/validation/team-validation';
import { canManageTeamMembers } from '@/lib/pov/auth/team-authorization';
import { validateCUIDFormat } from '@/lib/validation/id-validation';
import { povListCache } from '@/app/api/pov/pov-cache';
import { taskListCache } from '@/lib/tasks/handlers/get';
import { povLogger } from '@/lib/logger';

/**
 * DELETE /api/pov/[povId]/team/members/[memberId]
 * Remove a team member from a POV (Owner-only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { povId: string; memberId: string } }
) {
  try {
    // Validate member ID format (consistent CUID validation)
    const memberIdCheck = validateCUIDFormat(params.memberId, 'member ID');
    if (!memberIdCheck.valid) {
      return NextResponse.json({ error: memberIdCheck.error }, { status: 400 });
    }

    // Validate POV ID format
    const povIdCheck = validateCUIDFormat(params.povId, 'POV ID');
    if (!povIdCheck.valid) {
      return NextResponse.json({ error: povIdCheck.error }, { status: 400 });
    }

    // 1. Authentication
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get POV and check access
    const pov = await prisma.pOV.findUnique({
      where: { id: params.povId },
      include: {
        team: {
          include: {
            members: true  // Full TeamMember model (id, userId, role) - type-safe for helper
          }
        }
      }
    });

    if (!pov) {
      return NextResponse.json({ error: 'POV not found' }, { status: 404 });
    }

    // Validate POV access
    validatePOVAccess(user, pov, { throwOnDeny: true, requireWrite: true });  // 2026-05-26 demo-write fix (also canManageTeamMembers-gated)

    // 3. Team management authorization (includes PROJECT_MANAGER restriction)
    const authCheck = canManageTeamMembers(user, pov, {
      operation: 'remove',
      targetMemberId: params.memberId
    });

    if (!authCheck.allowed) {
      return NextResponse.json(
        { error: authCheck.reason },
        { status: 403 }
      );
    }

    // 4. SECURITY: Prevent self-removal (route-level check, defense-in-depth)
    const targetMember = await prisma.teamMember.findUnique({
      where: { id: params.memberId },
      select: { userId: true }
    });

    if (targetMember && targetMember.userId === user.userId) {
      povLogger.warn({ userId: user.userId, povId: params.povId, memberId: params.memberId, severity: 'HIGH' }, 'self-removal attempt blocked');

      return NextResponse.json({
        error: 'Cannot remove yourself from team. Ask another admin to remove you.',
        code: 'SELF_REMOVAL_BLOCKED'
      }, { status: 403 });
    }

    // 5. Find team member (full details)
    const teamMember = await prisma.teamMember.findUnique({
      where: { id: params.memberId },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    if (!teamMember) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // 6. Verify member belongs to this POV's team
    if (teamMember.teamId !== pov.teamId) {
      return NextResponse.json(
        { error: 'Team member does not belong to this POV' },
        { status: 400 }
      );
    }

    // 7. CRITICAL: Last owner protection - cannot remove POV owner
    if (teamMember.userId === pov.ownerId) {
      return NextResponse.json(
        { error: 'Cannot remove POV owner from team. Transfer ownership first.' },
        { status: 400 }
      );
    }

    // 8. Check for assigned active tasks (prevent orphaned tasks)
    const assignedTasks = await prisma.task.count({
      where: {
        povId: params.povId,
        assigneeId: teamMember.userId,
        status: { in: ['OPEN', 'IN_PROGRESS'] }
      }
    });

    // 8b. Parse optional body for reassignment
    let reassignTasksTo: string | null = null;
    try {
      const body = await request.json();
      reassignTasksTo = body?.reassignTasksTo || null;
    } catch {
      // No body or invalid JSON - that's fine, original behavior
    }

    if (assignedTasks > 0 && !reassignTasksTo) {
      // No reassignment target provided - block with 409
      return NextResponse.json(
        {
          error: `Cannot remove member with ${assignedTasks} active task(s). Reassign tasks first.`,
          data: { activeTasks: assignedTasks }
        },
        { status: 409 }
      );
    }

    // 8c. Reassign active tasks if target provided
    if (assignedTasks > 0 && reassignTasksTo) {
      // Validate reassignment target is a CUID
      const reassignIdCheck = validateCUIDFormat(reassignTasksTo, 'reassignment target ID');
      if (!reassignIdCheck.valid) {
        return NextResponse.json({ error: reassignIdCheck.error }, { status: 400 });
      }

      // Verify target user exists and is on the team (or is the POV owner)
      const targetIsOwner = reassignTasksTo === pov.ownerId;
      const targetIsTeamMember = targetIsOwner || await prisma.teamMember.findFirst({
        where: {
          userId: reassignTasksTo,
          teamId: pov.teamId!
        },
        select: { id: true }
      });

      if (!targetIsTeamMember) {
        return NextResponse.json(
          { error: 'Reassignment target must be a team member or the POV owner' },
          { status: 400 }
        );
      }

      // Atomic: reassign tasks + delete member in a transaction
      await prisma.$transaction([
        prisma.task.updateMany({
          where: {
            povId: params.povId,
            assigneeId: teamMember.userId,
            status: { in: ['OPEN', 'IN_PROGRESS'] }
          },
          data: { assigneeId: reassignTasksTo }
        }),
        prisma.teamMember.delete({
          where: { id: params.memberId }
        })
      ]);

      // Cache invalidation for both users
      povListCache.invalidatePattern(`pov:list:${teamMember.userId}`);
      taskListCache.invalidatePattern(`tasks:${teamMember.userId}`);
      taskListCache.invalidatePattern(`tasks:${reassignTasksTo}`);

      // Audit logging
      await logTeamMembershipChange(
        user.userId,
        teamMember.userId,
        pov.teamId!,
        'REMOVE',
        {
          povId: params.povId,
          memberName: teamMember.user?.name,
          memberEmail: teamMember.user?.email,
          removedBy: user.email,
          tasksReassigned: assignedTasks,
          reassignedTo: reassignTasksTo
        }
      );

      return NextResponse.json({
        success: true,
        message: `Team member removed. ${assignedTasks} task(s) reassigned.`,
        data: { tasksReassigned: assignedTasks }
      });
    }

    // 9. Remove team member (no active tasks)
    await prisma.teamMember.delete({
      where: { id: params.memberId }
    });

    // ✅ Q1 2026 Security: Invalidate caches for removed user (immediate access revocation)
    // Prevents removed user from accessing POVs/tasks via stale cache (30-60s window)
    povListCache.invalidatePattern(`pov:list:${teamMember.userId}`);
    taskListCache.invalidatePattern(`tasks:${teamMember.userId}`);

    // 10. Audit logging
    await logTeamMembershipChange(
      user.userId,
      teamMember.userId,
      pov.teamId!,
      'REMOVE',
      {
        povId: params.povId,
        memberName: teamMember.user?.name,
        memberEmail: teamMember.user?.email,
        removedBy: user.email
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Team member removed successfully'
    });

  } catch (error) {
    povLogger.error({ err: error }, 'remove team member error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to remove team member' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/pov/[povId]/team/members/[memberId]
 * Update a team member's role (Owner-only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { povId: string; memberId: string } }
) {
  try {
    // 1. Authentication
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate request body using safeParse
    const body = await request.json();
    const validation = UpdateTeamMemberRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed: ' + validation.error.errors.map((e: any) => e.message).join(', '),
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    const validated = validation.data;

    // 3. Get POV and check access (include team members for authorization)
    const pov = await prisma.pOV.findUnique({
      where: { id: params.povId },
      include: {
        team: {
          include: {
            members: true  // Full TeamMember model - consistent with other endpoints
          }
        }
      }
    });

    if (!pov) {
      return NextResponse.json({ error: 'POV not found' }, { status: 404 });
    }

    // Validate POV access
    validatePOVAccess(user, pov, { throwOnDeny: true, requireWrite: true });  // 2026-05-26 demo-write fix (also canManageTeamMembers-gated)

    // 4. Team management authorization (includes PROJECT_MANAGER restrictions)
    const authCheck = canManageTeamMembers(user, pov, {
      operation: 'updateRole',
      targetMemberId: params.memberId,
      targetRole: validated.role
    });

    if (!authCheck.allowed) {
      return NextResponse.json(
        { error: authCheck.reason },
        { status: 403 }
      );
    }

    // 5. Find team member
    const teamMember = await prisma.teamMember.findUnique({
      where: { id: params.memberId },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    if (!teamMember) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // 6. Verify member belongs to this POV's team
    if (teamMember.teamId !== pov.teamId) {
      return NextResponse.json(
        { error: 'Team member does not belong to this POV' },
        { status: 400 }
      );
    }

    // 7. Prevent changing POV owner's role (protection)
    if (teamMember.userId === pov.ownerId) {
      return NextResponse.json(
        { error: 'Cannot change POV owner role' },
        { status: 400 }
      );
    }

    // Store old role for audit logging
    const oldRole = teamMember.role;

    // 8. Update team member role
    const updatedMember = await prisma.teamMember.update({
      where: { id: params.memberId },
      data: { role: validated.role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // 9. Audit logging (using ADD action for role update)
    await logTeamMembershipChange(
      user.userId,
      teamMember.userId,
      pov.teamId!,
      'ADD',
      {
        povId: params.povId,
        roleUpdate: true,
        oldRole,
        newRole: validated.role,
        memberName: teamMember.user?.name,
        memberEmail: teamMember.user?.email,
        updatedBy: user.email
      }
    );

    return NextResponse.json({
      success: true,
      data: updatedMember,
      message: 'Team member role updated successfully'
    });

  } catch (error) {
    povLogger.error({ err: error }, 'update team member role error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update team member role' },
      { status: 500 }
    );
  }
}
