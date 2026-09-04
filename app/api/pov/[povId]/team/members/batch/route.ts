import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { validatePOVAccess, withPOVAccess } from '@/lib/auth/validate-pov-access';
import { logTeamMembershipChange } from '@/lib/auth/audit';
import { TeamRole } from '@prisma/client';
import { BatchAddTeamMembersSchema } from '@/lib/validation/team-validation';
import { canManageTeamMembers } from '@/lib/pov/auth/team-authorization';
import { isNonSelectableUser } from '@/lib/utils/team-member-guard';
import { povLogger } from '@/lib/logger';
import { povListCache } from '@/app/api/pov/pov-cache';
import { taskListCache } from '@/lib/tasks/handlers/get';

/**
 * POST /api/pov/[povId]/team/members/batch
 * Bulk add team members to a POV (Owner-only)
 * Max 20 members per batch, atomic transaction (all or nothing)
 */
export const POST = withPOVAccess(async (request, { params, user, pov }) => {
  try {
    // ✅ POV already loaded and validated by middleware

    // 1. Parse and validate request body using safeParse
    const body = await request.json();
    const validation = BatchAddTeamMembersSchema.safeParse(body);

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

    // 2. Team management authorization (Owner, Admin, or PROJECT_MANAGER)
    const authCheck = canManageTeamMembers(user, pov, { operation: 'bulkAdd' });

    if (!authCheck.allowed) {
      return NextResponse.json(
        { error: authCheck.reason },
        { status: 403 }
      );
    }

    // BC50 FIX: Wrap team creation + validation + member add in single transaction
    const userIds = validated.members.map(m => m.userId);

    const addedMembers = await prisma.$transaction(async (tx) => {
      // 3. Check if POV has a team (create if needed) — inside transaction to prevent race
      let teamId = pov.teamId;
      if (!teamId) {
        const freshPov = await tx.pOV.findUnique({ where: { id: params.povId }, select: { teamId: true } });
        teamId = freshPov?.teamId || null;

        if (!teamId) {
          const team = await tx.team.create({ data: { name: `${pov.title} Team` } });
          await tx.pOV.update({ where: { id: params.povId }, data: { teamId: team.id } });
          teamId = team.id;
        }
        pov.teamId = teamId;
      }

      // 4. Validate all users exist
      const users = await tx.user.findMany({ where: { id: { in: userIds } } });
      if (users.length !== userIds.length) {
        const foundIds = users.map(u => u.id);
        const missingIds = userIds.filter(id => !foundIds.includes(id));
        throw new Error(`NOT_FOUND:User(s) not found: ${missingIds.join(', ')}`);
      }

      // 2026-05-27 + 2026-06-04: demo/super-admin roles AND @paichart.system service accounts blocked
      const blockedUsers = users.filter(u => isNonSelectableUser(u));
      if (blockedUsers.length > 0) {
        throw new Error(`FORBIDDEN:These users cannot be added to a team: ${blockedUsers.map(u => u.id).join(', ')}`);
      }

      // 5. Check for duplicate members
      const existingMembers = await tx.teamMember.findMany({
        where: { teamId: teamId!, userId: { in: userIds } }
      });
      if (existingMembers.length > 0) {
        const duplicateIds = existingMembers.map(m => m.userId);
        throw new Error(`CONFLICT:User(s) already team members: ${duplicateIds.join(', ')}`);
      }

      // 6. Add all members atomically
      const members = [];
      for (const member of validated.members) {
        const created = await tx.teamMember.create({
          data: {
            teamId: teamId!,
            userId: member.userId,
            role: member.role || TeamRole.MEMBER
          },
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        });
        members.push(created);
      }
      return members;
    });

    // 7. Audit logging for bulk operation
    await logTeamMembershipChange(
      user.userId,
      'BULK_ADD',
      pov.teamId!,
      'ADD',
      {
        povId: params.povId,
        memberCount: addedMembers.length,
        memberIds: userIds,
        addedBy: user.email
      }
    );

    // Invalidate each added member's cached POV/task lists (they gain visibility via membership).
    for (const uid of userIds) {
      povListCache.invalidatePattern(`pov:list:${uid}`);
      taskListCache.invalidatePattern(`tasks:${uid}`);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          added: addedMembers.length,
          members: addedMembers
        },
        message: `${addedMembers.length} team member(s) added successfully`
      },
      { status: 201 }
    );

  } catch (error) {
    // BC50 FIX: Handle validation errors thrown from inside transaction
    const errMsg = error instanceof Error ? error.message : '';
    if (errMsg.startsWith('NOT_FOUND:')) {
      return NextResponse.json({ error: errMsg.slice(10) }, { status: 404 });
    }
    if (errMsg.startsWith('CONFLICT:')) {
      return NextResponse.json({ error: errMsg.slice(9) }, { status: 409 });
    }
    if (errMsg.startsWith('FORBIDDEN:')) {
      return NextResponse.json({ error: errMsg.slice(10) }, { status: 403 });
    }

    povLogger.error({ err: error }, 'batch add team members error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add team members' },
      { status: 500 }
    );
  }
});
