import { TaskType } from '@prisma/client';
import { taskTypeLabels, getTaskTypeOptions } from '@/lib/utils/taskTypes';

export enum ItemTypes {
  STAGE = 'stage',
  TASK = 'task'
}

/**
 * Task types for the template builder
 * @deprecated Use getTaskTypeOptions() from lib/utils/taskTypes.ts instead
 */
export const TASK_TYPES = Object.values(TaskType).map(type => ({
  value: type,
  label: taskTypeLabels[type]
}));

/**
 * Get all task types as options
 * This is a wrapper around getTaskTypeOptions() for backward compatibility
 * @returns Array of task type options
 */
export function getTaskTypes() {
  return getTaskTypeOptions();
}
