import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { validatePOVAccess, withPOVAccess } from '@/lib/auth/validate-pov-access';
import { logTeamMembershipChange } from '@/lib/auth/audit';
import { TeamRole } from '@prisma/client';
import { AddTeamMemberSchema } from '@/lib/validation/team-validation';
import { canManageTeamMembers } from '@/lib/pov/auth/team-authorization';
import { isNonSelectableUser } from '@/lib/utils/team-member-guard';
import { parsePaginationParams } from '@/lib/utils/pagination';
import { povLogger } from '@/lib/logger';
import { povListCache } from '@/app/api/pov/pov-cache';
import { taskListCache } from '@/lib/tasks/handlers/get';

/**
 * GET /api/pov/[povId]/team/members
 * Get team members for a POV
 */
export const GET = withPOVAccess(async (request, { params, user, pov }) => {
  try {
    // ✅ POV already loaded and validated by middleware
    const { povId } = params;

    // If the POV doesn't have a team, return just the owner as a potential assignee
    if (!pov.teamId) {
      const owner = await prisma.user.findUnique({
        where: { id: pov.ownerId },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      });

      return NextResponse.json([owner]);
    }

    // Get team members (safety cap: teams are naturally small but cap prevents abuse)
    const { searchParams } = new URL(request.url);
    const { limit } = parsePaginationParams(searchParams, { limit: 200, maxLimit: 200 });
    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId: pov.teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,  // Include avatar for UI display
          },
        },
      },
      take: limit,
    });

    // Format the response to include both TeamMember.id and User.id
    const members = teamMembers.map(member => ({
      id: member.id,          // TeamMember.id (for DELETE operations)
      userId: member.user.id, // User.id (for reference)
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl || null,  // Avatar for UI display
      role: member.role,
    }));

    // Check if owner is already in the team
    const ownerInTeam = members.some(member => member.userId === pov.ownerId);

    // If owner is not in the team, add them
    if (!ownerInTeam) {
      const owner = await prisma.user.findUnique({
        where: { id: pov.ownerId },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      });

      if (owner) {
        members.unshift({
          id: 'owner-placeholder', // Placeholder ID (owner may not be in TeamMember table)
          userId: owner.id,
          name: owner.name,
          email: owner.email,
          avatarUrl: owner.avatarUrl || null,
          role: 'OWNER',
        });
      }
    }

    return NextResponse.json(members);
  } catch (error) {
    povLogger.error({ err: error }, 'error fetching team members');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/pov/[povId]/team/members
 * Add a team member to a POV (Owner-only)
 */
export const POST = withPOVAccess(async (request, { params, user, pov }) => {
  try {
    // ✅ POV already loaded and validated by middleware

    // 1. Parse and validate request body using safeParse
    const body = await request.json();
    const validation = AddTeamMemberSchema.safeParse(body);

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
    const authCheck = canManageTeamMembers(user, pov, { operation: 'add' });

    if (!authCheck.allowed) {
      return NextResponse.json(
        { error: authCheck.reason },
        { status: 403 }
      );
    }

    // BC47 FIX: Wrap team creation + member add in transaction to prevent double-create race
    // Also handle P2002 unique constraint for concurrent duplicate member adds
    let teamMember;
    try {
      teamMember = await prisma.$transaction(async (tx) => {
        // BC19/BC47 (2026-06-08): lock the POV row up front so concurrent member-adds to a
        // teamless POV serialize. The plain-tx "re-read to prevent race" below did NOT prevent
        // it — a plain SELECT takes no row lock at READ COMMITTED, so two requests could both
        // see teamId=null and both create a team (one orphaned). FOR UPDATE waits, then the
        // second request sees the committed teamId. See BC19 / transaction-atomicity-pattern.md.
        await tx.$executeRaw`SELECT id FROM "POV" WHERE id = ${params.povId} FOR UPDATE`;
        // 3. Check if POV has a team (create if needed) — inside transaction to prevent double-create
        let teamId = pov.teamId;
        if (!teamId) {
          // Re-read POV inside transaction (now under the row lock above)
          const freshPov = await tx.pOV.findUnique({ where: { id: params.povId }, select: { teamId: true } });
          teamId = freshPov?.teamId || null;

          if (!teamId) {
            const team = await tx.team.create({ data: { name: `${pov.title} Team` } });
            await tx.pOV.update({ where: { id: params.povId }, data: { teamId: team.id } });
            teamId = team.id;
          }
        }

        // 4. Check if user already exists as a team member
        const existing = await tx.teamMember.findFirst({
          where: { teamId, userId: validated.userId }
        });
        if (existing) {
          return { duplicate: true } as any;
        }

        // 5. Check if user exists
        const userToAdd = await tx.user.findUnique({ where: { id: validated.userId } });
        if (!userToAdd) {
          return { notFound: true } as any;
        }
        // 2026-05-27 + 2026-06-04: demo/super-admin roles AND @paichart.system service
        // accounts must never become team members (write-side guard)
        if (isNonSelectableUser(userToAdd)) {
          return { demoBlocked: true } as any;
        }

        // 6. Add team member
        return tx.teamMember.create({
          data: {
            teamId: teamId!,
            userId: validated.userId,
            role: validated.role || TeamRole.MEMBER
          },
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        });
      });
    } catch (error: any) {
      // BC47 FIX: Handle P2002 unique constraint (concurrent duplicate add)
      if (error?.code === 'P2002') {
        return NextResponse.json({ error: 'User is already a team member' }, { status: 409 });
      }
      throw error;
    }

    if ((teamMember as any)?.duplicate) {
      return NextResponse.json({ error: 'User is already a team member' }, { status: 409 });
    }
    if ((teamMember as any)?.notFound) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if ((teamMember as any)?.demoBlocked) {
      return NextResponse.json({ error: 'This user cannot be added to a team' }, { status: 403 });
    }

    // Update pov.teamId for audit logging below
    if (!pov.teamId) {
      pov.teamId = teamMember.teamId || (teamMember as any).teamId;
    }

    // 7. Audit logging — use teamMember.teamId (guaranteed non-null from transaction)
    const auditTeamId: string = pov.teamId || teamMember.teamId || (teamMember as any).teamId;
    await logTeamMembershipChange(
      user.userId,
      validated.userId,
      auditTeamId,
      'ADD',
      {
        povId: params.povId,
        role: validated.role || TeamRole.MEMBER,
        addedBy: user.email
      }
    );

    // Transform to match GET response structure (flat, not nested)
    const response = {
      id: teamMember.id,          // TeamMember.id (for DELETE operations)
      userId: teamMember.user.id, // User.id (for reference)
      name: teamMember.user.name,
      email: teamMember.user.email,
      avatarUrl: teamMember.user.avatarUrl || null,  // Avatar for UI display
      role: teamMember.role,
    };

    // Invalidate the added member's cached POV/task lists — they gain visibility via
    // team membership, else the POV/tasks stay missing from their list until the TTL.
    povListCache.invalidatePattern(`pov:list:${validated.userId}`);
    taskListCache.invalidatePattern(`tasks:${validated.userId}`);

    return NextResponse.json(
      {
        success: true,
        data: response
      },
      { status: 201 }
    );

  } catch (error) {
    povLogger.error({ err: error }, 'add team member error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add team member' },
      { status: 500 }
    );
  }
});