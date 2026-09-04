import type { Task } from '../types/EntityTypes';

export const depIds = (t: Task): string[] =>
  t.dependencies?.map(d => d.dependsOnId) ?? [];

export const dependsOn = (t: Task, id: string): boolean =>
  t.dependencies?.some(d => d.dependsOnId === id) ?? false;

export function checkForDependencyCycles(
  taskId: string,
  tasks: Record<string, Task>,
  visited: Set<string> = new Set(),
  recursionStack: Set<string> = new Set()
): boolean {
  visited.add(taskId);
  recursionStack.add(taskId);

  const task = tasks[taskId];
  if (!task) {
    // Stale dep ID (e.g. cascade-delete race). Surface for diagnosis; treat as no-cycle.
    console.warn(`[checkForDependencyCycles] dangling dependency reference: task '${taskId}' not in state`);
    recursionStack.delete(taskId);
    return false;
  }

  for (const depId of depIds(task)) {
    if (!visited.has(depId)) {
      if (checkForDependencyCycles(depId, tasks, visited, recursionStack)) return true;
    } else if (recursionStack.has(depId)) {
      return true;
    }
  }

  recursionStack.delete(taskId);
  return false;
}
