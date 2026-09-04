/**
 * Task Assignment Handler
 *
 * Handles task assignment operations with intelligent user lookup and POV access validation.
 * Supports lookup by taskId/taskTitle and assigneeId/assignee(name/email).
 *
 * @module lib/mcp/tasks/action/handlers/task/task-assign-handler
 * @extracted 2025-12-18 (Phase 2.3, Step 1/12)
 * @dependencies prisma, validatePOVAccess, TokenPayload
 */

import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import type { TokenPayload } from '@/lib/types/auth';
import { logTaskAssignment, logCommentAdded } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';

/**
 * Assigns a task to a user with intelligent lookup and validation
 *
 * Features:
 * - Task lookup by ID or title (with POV context)
 * - User lookup by ID, name, or email (exact/partial/name parts)
 * - Team lookup by ID or name
 * - POV access validation
 * - Activity logging
 *
 * @param parameters - Task assignment parameters (taskId/taskTitle, assigneeId/assignee, etc.)
 * @param user - Authenticated user token payload
 * @param actionId - Unique action identifier for logging
 * @returns Task assignment result with assigned task data
 * @throws Error if task/user/team not found or access denied
 */
export async function handleTaskAssign(parameters: any, user: TokenPayload, actionId: string) {
  const { taskId, assigneeId, assignee, teamId, teamName, taskTitle, povId, povTitle, reason } = parameters;

  // If no taskId provided, try to find task by title + POV context
  let finalTaskId = taskId;

  if (!finalTaskId && taskTitle) {
    mcpLogger.debug({ taskTitle, povId, povTitle }, 'Looking up task by title');

    // Build search criteria
    const searchCriteria: any = {
      title: { equals: taskTitle, mode: 'insensitive' }
    };

    // Add POV context if provided
    if (povId) {
      searchCriteria.povId = povId;
    } else if (povTitle) {
      searchCriteria.pov = {
        title: { contains: povTitle, mode: 'insensitive' }
      };
    }

    // Find matching tasks
    const matchingTasks = await prisma.task.findMany({
      where: searchCriteria,
      include: {
        pov: { select: { id: true, title: true } },
        phase: { select: { id: true, name: true } }
      },
      take: 20
    });

    if (matchingTasks.length === 0) {
      throw new Error(`No tasks found with title "${taskTitle}"${povId ? ` in POV ${povId}` : povTitle ? ` in POV containing "${povTitle}"` : ''}`);
    } else if (matchingTasks.length === 1) {
      finalTaskId = matchingTasks[0].id;
      mcpLogger.debug({ taskId: finalTaskId }, 'Unique task found by title');
    } else {
      // Multiple matches - provide helpful error
      const povList = matchingTasks.map(t => `"${t.pov?.title}" (ID: ${t.id})`).join(', ');
      throw new Error(`Multiple tasks found with title "${taskTitle}". Please specify POV context. Found in POVs: ${povList}`);
    }
  }

  if (!finalTaskId) {
    throw new Error('Either taskId or taskTitle (with POV context) is required for task assignment');
  }

  // 🔒 SECURITY: Validate POV access before allowing task assignment
  const taskForAuth = await prisma.task.findUnique({
    where: { id: finalTaskId },
    select: {
      pov: {
        select: {
          id: true,
          ownerId: true,
          metadata: true,
          team: {
            select: {
              members: {
                select: { userId: true }
              }
            }
          }
        }
      }
    }
  });

  if (!taskForAuth?.pov) {
    throw new Error(
      `Task not found: "${finalTaskId}"\n\n` +
      `The task may not exist or you don't have access.\n\n` +
      `💡 Find tasks:\n` +
      `• project(action: "task.list", pov_name: "Your POV") - See all tasks in a POV\n` +
      `• project(action: "task.list", assignee_name: "Your Name") - See your assigned tasks\n` +
      `• search("task keywords") - Search across all tasks\n\n` +
      `Or verify the task ID is correct.`
    );
  }

  validatePOVAccess(user, taskForAuth.pov, {
    throwOnDeny: true,
    requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
    logContext: 'Task Assign'
  });

  let finalAssigneeId = assigneeId;

    // If assignee is provided as a name/email instead of ID, look up the user
    if (!finalAssigneeId && assignee) {
      mcpLogger.debug('Looking up user for assignment');

      // ============================================================================
      // PARALLEL QUERY OPTIMIZATION (Dec 2025 - 3 user lookups → ~45% faster)
      // Run all user search strategies in parallel, use best match
      // ============================================================================

      const nameParts = assignee.split(' ').filter((part: string) => part.length > 0);

      const [exactMatch, partialMatch, namePartsMatch] = await Promise.all([
        // Strategy 1: Exact match (name OR email equals)
        prisma.user.findFirst({
          where: {
            OR: [
              { name: { equals: assignee, mode: 'insensitive' } },
              { email: { equals: assignee, mode: 'insensitive' } }
            ]
          },
          select: { id: true, name: true, email: true }
        }),
        // Strategy 2: Partial match (name OR email contains)
        prisma.user.findFirst({
          where: {
            OR: [
              { name: { contains: assignee, mode: 'insensitive' } },
              { email: { contains: assignee, mode: 'insensitive' } }
            ]
          },
          select: { id: true, name: true, email: true }
        }),
        // Strategy 3: Name parts match (first/last name split)
        nameParts.length > 0
          ? prisma.user.findFirst({
              where: {
                OR: nameParts.map((part: string) => ({
                  name: { contains: part, mode: 'insensitive' }
                }))
              },
              select: { id: true, name: true, email: true }
            })
          : Promise.resolve(null)
      ]);

      // Use best match (exact > partial > nameParts)
      const foundUser = exactMatch || partialMatch || namePartsMatch;

      if (foundUser) {
        finalAssigneeId = foundUser.id;
        mcpLogger.debug({ userId: foundUser.id, matchType: exactMatch ? 'exact' : partialMatch ? 'partial' : 'nameParts' }, 'User resolved for assignment');
      } else {
        // List available users for debugging
        const allUsers = await prisma.user.findMany({
          select: { id: true, name: true, email: true },
          take: 50
        });
        mcpLogger.warn({ availableCount: allUsers.length }, 'User lookup failed for assignment');
        throw new Error(`User not found: "${assignee}". Available users: ${allUsers.map(u => u.name).join(', ')}`);
      }
    }

    // Validate that the user ID exists before trying to assign
    if (finalAssigneeId) {
      const userExists = await prisma.user.findUnique({
        where: { id: finalAssigneeId },
        select: { id: true, name: true, email: true }
      });

      if (!userExists) {
        throw new Error(`User ID "${finalAssigneeId}" does not exist in the database`);
      }

      // Wave C M2 fix (2026-05-23, Basic Tools sec-ops Phase 3): assignee
      // must be a POV team member or POV owner. Previously: any user in
      // the system could be assigned to any task. Blocks notification-spam,
      // workflow-disruption, and audit-trail-pollution surface.
      // Admins bypass via validatePOVAccess pattern above.
      const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
      if (!isAdmin) {
        const isPOVOwner = taskForAuth.pov.ownerId === finalAssigneeId;
        const isPOVTeamMember = (taskForAuth.pov.team?.members ?? []).some(
          (m: { userId: string }) => m.userId === finalAssigneeId
        );
        if (!isPOVOwner && !isPOVTeamMember) {
          throw new Error(
            `User "${finalAssigneeId}" is not a member of this POV team and is not the POV owner. ` +
            `Add them to the team via pov.update first, or assign to an existing team member.`
          );
        }
      }
    }

  let finalTeamId = teamId;

  // If teamName is provided instead of teamId, look up the team
  if (!finalTeamId && teamName) {
    mcpLogger.debug('Looking up team by name');

    // ============================================================================
    // PARALLEL QUERY OPTIMIZATION (Dec 2025 - 2 team lookups → ~50% faster)
    // Run all team search strategies in parallel, use best match
    // ============================================================================

    const [exactTeamMatch, partialTeamMatch] = await Promise.all([
      // Strategy 1: Exact team name match
      prisma.team.findFirst({
        where: {
          name: { equals: teamName, mode: 'insensitive' }
        },
        select: { id: true, name: true }
      }),
      // Strategy 2: Partial team name match
      prisma.team.findFirst({
        where: {
          name: { contains: teamName, mode: 'insensitive' }
        },
        select: { id: true, name: true }
      })
    ]);

    // Use best match (exact > partial)
    const foundTeam = exactTeamMatch || partialTeamMatch;

    if (foundTeam) {
      finalTeamId = foundTeam.id;
      mcpLogger.debug({ teamId: foundTeam.id, matchType: exactTeamMatch ? 'exact' : 'partial' }, 'Team resolved');
    } else {
      // List available teams for debugging
      const allTeams = await prisma.team.findMany({
        select: { id: true, name: true },
        take: 50
      });
      mcpLogger.warn({ availableCount: allTeams.length }, 'Team lookup failed');
      throw new Error(`Team not found: "${teamName}". Available teams: ${allTeams.map(t => t.name).join(', ')}`);
    }
  }

  if (!finalAssigneeId) {
    throw new Error('Either assigneeId or assignee (name/email) is required for task assignment');
  }

  const task = await prisma.task.update({
    where: { id: finalTaskId },
    data: {
      assigneeId: finalAssigneeId,
      teamId: finalTeamId,
      updatedAt: new Date()
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } }
    }
  });

  // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
  // Fire-and-forget pattern - logs assignment with assignee details
  const mcpMetadata: ActivityMetadata = { source: 'MCP' };

  if (task.assignee) {
    logTaskAssignment(
      task.id,
      user.userId,
      { id: task.assignee.id, name: task.assignee.name },
      null, // No previous assignee tracked in this handler
      mcpMetadata
    );
    mcpLogger.debug({ taskId: task.id, assigneeId: task.assignee.id }, 'Assignment activity logged');
  }

  // 🔧 BUG-010 FIX: If reason provided, log it as a comment activity
  if (reason && typeof reason === 'string' && reason.trim()) {
    const sanitizedReason = reason.trim();
    logCommentAdded(
      task.id,
      user.userId,
      `Assignment reason: ${sanitizedReason}`,
      mcpMetadata
    );
    mcpLogger.debug({ taskId: task.id }, 'Assignment reason activity logged');
  }

  // Get POV ID for cache invalidation
  const taskWithPov = await prisma.task.findUnique({
    where: { id: finalTaskId },
    select: { povId: true }
  });

  return {
    actionId,
    action: 'task.assign',
    status: 'completed',
    result: {
      task,
      assignedUser: task.assignee,
      message: `Task assigned successfully to ${task.assignee?.name} via MCP`,
      // Include POV ID for potential cache invalidation on client side
      povId: taskWithPov?.povId
    }
  };
}
