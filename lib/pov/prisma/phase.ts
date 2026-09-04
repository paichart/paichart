import { Prisma } from '@prisma/client';
import { PhaseWithTemplate, PhaseResponse, PhaseProgress } from '../types/phase';

// Prisma Select Types
export const phaseSelect = {
  id: true,
  name: true,
  description: true,
  type: true,
  startDate: true,
  endDate: true,
  order: true,
  povId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PhaseSelect;

// Type for Prisma query result using the select
export type PhaseQueryResult = Prisma.PhaseGetPayload<{
  select: typeof phaseSelect;
}>;

// Mappers
export function mapPhaseFromPrisma(phase: PhaseWithTemplate): PhaseResponse {
  return {
    ...phase,
    template: phase.template,
    details: phase.details,
    progress: {
      completed: phase.details.tasks.filter(t => t.completed).length,
      total: phase.details.tasks.length,
      percentage: phase.details.tasks.length > 0 
        ? Math.round((phase.details.tasks.filter(t => t.completed).length / phase.details.tasks.length) * 100)
        : 0,
      requiredCompleted: phase.details.tasks.filter(t => t.required && t.completed).length,
      requiredTotal: phase.details.tasks.filter(t => t.required).length,
      status: getPhaseStatus(phase)
    }
  };
}

function getPhaseStatus(phase: PhaseWithTemplate): PhaseProgress['status'] {
  const tasks = phase.details.tasks;
  if (tasks.length === 0) return 'not_started';
  if (tasks.every(t => t.completed)) return 'completed';
  if (tasks.some(t => t.completed)) return 'in_progress';
  
  // Check if any tasks are blocked by dependencies
  const hasBlockedTasks = tasks.some(task => {
    if (!task.dependencies?.length) return false;
    return task.dependencies.some(depKey => {
      const depTask = tasks.find(t => t.key === depKey);
      return depTask && !depTask.completed;
    });
  });

  return hasBlockedTasks ? 'blocked' : 'not_started';
}

// Prisma Input Types
export type CreatePhaseInput = Prisma.PhaseCreateInput;
export type UpdatePhaseInput = Prisma.PhaseUpdateInput;
export type PhaseWhereInput = Prisma.PhaseWhereInput;
export type PhaseOrderByInput = Prisma.PhaseOrderByWithRelationInput;
