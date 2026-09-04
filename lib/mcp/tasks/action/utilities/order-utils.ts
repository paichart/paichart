/**
 * Order Utility Functions
 *
 * Provides order calculation for stages and tasks.
 * Used for maintaining correct ordering when creating new items.
 *
 * Extracted from: app/api/mcp/tasks/action/route.ts (lines 971-990)
 */

import { prisma } from '@/lib/prisma';

/**
 * Gets the next available order number for a new stage in a phase
 *
 * Uses 1000 increment pattern (industry standard) for flexible reordering.
 * Matches task ordering pattern for consistency.
 *
 * @param phaseId - The phase ID to get next stage order for
 * @returns Next order number (last order + 1000, or 1000 if no stages)
 */
export async function getNextStageOrder(phaseId: string): Promise<number> {
  const lastStage = await prisma.stage.findFirst({
    where: { phaseId },
    orderBy: { order: 'desc' }
  });

  // Use 1000 increment pattern like tasks (allows reordering flexibility)
  return lastStage ? lastStage.order + 1000 : 1000;
}

/**
 * Gets the next available order number for a new phase in a POV
 *
 * Uses 1000 increment pattern (industry standard) for flexible reordering.
 * Matches stage and task ordering patterns for consistency.
 *
 * @param povId - The POV ID to get next phase order for
 * @returns Next order number (last order + 1000, or 1000 if no phases)
 */
export async function getNextPhaseOrder(povId: string): Promise<number> {
  const lastPhase = await prisma.phase.findFirst({
    where: { povId },
    orderBy: { order: 'desc' }
  });

  // Use 1000 increment pattern (allows reordering flexibility)
  return lastPhase ? lastPhase.order + 1000 : 1000;
}

/**
 * Gets the next available order number for a new task in a stage
 *
 * Uses the same pattern as reorder endpoint: (index + 1) * 1000
 * If no tasks exist, start at 1000. Otherwise, add 1000 to the last order.
 *
 * @param stageId - The stage ID to get next task order for
 * @returns Next order number (last order + 1000, or 1000 if no tasks)
 */
export async function getNextTaskOrder(stageId: string): Promise<number> {
  const lastTask = await prisma.task.findFirst({
    where: { stageId },
    orderBy: { order: 'desc' }
  });

  // Use the same pattern as reorder endpoint: (index + 1) * 1000
  // If no tasks exist, start at 1000. Otherwise, add 1000 to the last order.
  return lastTask ? lastTask.order + 1000 : 1000;
}
