/**
 * POV Access Helper for Task Endpoints
 * Reusable query to get task with POV and team info for validatePOVAccess
 *
 * @version 1.0
 * @created 2025-10-30
 * @specialist-reviewed architectural-review (88%), api-efficiency (84%)
 */

import { prisma } from '@/lib/prisma';

/**
 * Get task with POV and team information for access validation
 *
 * Used by: 6/8 task endpoints that need POV access checks
 *
 * @param taskId - Task ID
 * @returns Task with POV and team members, or null if not found
 *
 * @performance Single query with includes (prevents duplicate POV queries)
 * @specialist-approved api-efficiency (eliminates 12 duplicate queries across endpoints)
 */
export async function getTaskWithPOV(taskId: string) {
  return await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      pov: {
        select: {
          id: true,              // For logging/auditing
          ownerId: true,         // CRITICAL: For isOwner check in validatePOVAccess
          teamId: true,          // For team queries
          metadata: true,        // CRITICAL: For isDemo check in validatePOVAccess
          team: {
            select: {
              members: {
                select: {
                  userId: true,
                  role: true
                }
              }
            }
          }
        }
      }
    }
  });
}

/**
 * Get POV with team information for direct access validation (by POV ID)
 *
 * Complementary to getTaskWithPOV (which resolves task → POV).
 * Use this when the POV ID is already known (from URL params).
 *
 * Used by: task create, update, get, list, assignee handlers
 *
 * @param povId - POV ID (from URL params)
 * @returns POV with team members, or null if not found
 *
 * @specialist-reviewed api-efficiency (94%), architectural-review (95%)
 * @created 2026-04-02
 */
export async function getPOVForAccess(povId: string) {
  return await prisma.pOV.findUnique({
    where: { id: povId },
    select: {
      id: true,
      ownerId: true,
      teamId: true,
      metadata: true,
      team: {
        select: {
          members: {
            select: {
              userId: true,
              role: true,
            }
          }
        }
      }
    }
  });
}

/**
 * Verify task belongs to POV
 *
 * @param task - Task object
 * @param expectedPovId - Expected POV ID
 * @throws Error if task doesn't belong to POV
 */
export function verifyTaskBelongsToPOV(task: { povId: string | null }, expectedPovId: string): void {
  if (task.povId !== expectedPovId) {
    throw new Error(`Task does not belong to this POV`);
  }
}

/**
 * Verify user is member of POV team
 *
 * @param pov - POV with team members
 * @param userId - User ID to check
 * @returns true if user is team member
 */
export function isTeamMember(pov: { team: { members: Array<{ userId: string }> } | null }, userId: string): boolean {
  if (!pov.team) return false;
  return pov.team.members.some(m => m.userId === userId);
}
