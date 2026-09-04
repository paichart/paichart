/**
 * Task Comment Permissions
 * Determines who can add comments to tasks
 */

import { prisma } from '@/lib/prisma';
import { authLogger } from '@/lib/logger';

const localLogger = authLogger.child({ module: 'taskCommentPermissions' });

/**
 * Check if user has permission to comment on a task
 *
 * User can comment if they are:
 * 1. POV owner
 * 2. Task assignee
 * 3. POV team member
 * 4. ADMIN or SUPER_ADMIN
 *
 * @param userId - User ID to check
 * @param taskId - Task ID to check permission for
 * @returns true if user can comment, false otherwise
 */
export async function checkTaskCommentPermission(
  userId: string,
  taskId: string
): Promise<boolean> {
  try {
    // Get task with POV and team context
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        assigneeId: true,
        pov: {
          select: {
            id: true,
            ownerId: true,
            team: {
              select: {
                members: {
                  select: {
                    userId: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!task) {
      localLogger.warn({ taskId }, 'Task not found');
      return false;
    }

    // Get user role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user) {
      localLogger.warn({ userId }, 'User not found');
      return false;
    }

    // Check permissions
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    const isOwner = task.pov?.ownerId === userId;
    const isAssignee = task.assigneeId === userId;
    const isTeamMember = task.pov?.team?.members?.some(m => m.userId === userId) || false;

    const hasPermission = isAdmin || isOwner || isAssignee || isTeamMember;

    localLogger.debug({ userId, taskId, isAdmin, isOwner, isAssignee, isTeamMember, hasPermission }, 'Permission check result');

    return hasPermission;

  } catch (error) {
    localLogger.error({ err: error }, 'Error checking task comment permissions');
    return false; // Fail closed - deny permission on error
  }
}
