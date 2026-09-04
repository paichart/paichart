/**
 * Graph Algorithm Utilities
 * Circular dependency detection, topological sort, DoS protection
 *
 * @version 1.1
 * @created 2025-10-30
 * @updated 2026-04-04 — increased depth limit for harness pipelines, added topologicalSort
 * @specialist-reviewed sec-ops (82%), api-efficiency (84%)
 * @performance 95% improvement (450ms → 50ms for 20-node graph)
 */

import { prisma } from '@/lib/prisma';

export const GraphLimits = {
  MAX_DEPTH: 20,
  MAX_NODES: 100
};

/**
 * Check for circular dependencies with DoS protection
 *
 * @param taskId - The task that would depend on dependsOnTaskId
 * @param dependsOnTaskId - The task to add as a dependency
 * @returns Object with hasCycle boolean and max depth found
 *
 * @complexity O(n) time, 1 database query
 * @performance 95% faster than N+1 pattern (450ms → 50ms)
 *
 * DoS Protection:
 * - GraphLimits.MAX_DEPTH = 20 (prevents deep dependency chains; raised-and-reconciled 2026-07-15
 *   CC4 — a linear gated 6-pipeline PROGRAM chain is ~11 deep; callers must import GraphLimits,
 *   never hardcode the number — the pre-CC4 drift had this doc saying 10, the value at 20, and
 *   four handlers hardcoding 10)
 * - MAX_NODES = 100 (prevents complex graphs)
 * - Single query (prevents N+1 attack)
 */
export async function checkDependencyCycle(
  taskId: string,
  dependsOnTaskId: string
): Promise<{ hasCycle: boolean; depth: number }> {
  const MAX_DEPTH = GraphLimits.MAX_DEPTH;
  const MAX_NODES = GraphLimits.MAX_NODES;

  // ✅ Single query - fetch entire subgraph for POV
  // Scopes to POV to prevent cross-tenant graph queries
  const allDeps = await prisma.taskDependency.findMany({
    where: {
      task: {
        pov: {
          tasks: { some: { id: taskId } }
        }
      }
    },
    select: { taskId: true, dependsOnId: true },
    take: 5000,
  });

  // ✅ Build adjacency list (in-memory)
  const graph = new Map<string, string[]>();
  for (const dep of allDeps) {
    if (!graph.has(dep.taskId)) {
      graph.set(dep.taskId, []);
    }
    graph.get(dep.taskId)!.push(dep.dependsOnId);
  }

  // ✅ BFS with depth + complexity limits (DoS protection)
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [
    { id: dependsOnTaskId, depth: 0 }
  ];
  let maxDepth = 0;

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    // ✅ DoS protection: Depth limit
    if (depth > MAX_DEPTH) {
      throw new Error(`Dependency depth exceeds limit (${MAX_DEPTH})`);
    }

    // ✅ DoS protection: Complexity limit
    if (visited.size > MAX_NODES) {
      throw new Error(`Dependency graph too complex (limit: ${MAX_NODES} nodes)`);
    }

    maxDepth = Math.max(maxDepth, depth);

    // ✅ Cycle detection
    if (id === taskId) {
      return { hasCycle: true, depth: maxDepth };
    }

    if (visited.has(id)) continue;
    visited.add(id);

    const neighbors = graph.get(id) || [];
    queue.push(...neighbors.map(neighborId => ({ id: neighborId, depth: depth + 1 })));
  }

  return { hasCycle: false, depth: maxDepth };
}

/**
 * Topological sort of tasks within a POV by dependency order
 *
 * Returns task IDs in execution order: tasks with no dependencies first,
 * then tasks whose dependencies are all satisfied, etc.
 * Tasks at the same depth level are returned in their original order.
 *
 * @param povId - The POV to scope the sort to
 * @returns Ordered array of task IDs (ready-to-execute order)
 * @throws If the graph contains a cycle (should not happen if checkDependencyCycle is used)
 *
 * @complexity O(V + E) time, 1 database query
 */
export async function topologicalSort(povId: string): Promise<string[]> {
  const allDeps = await prisma.taskDependency.findMany({
    where: { task: { povId } },
    select: { taskId: true, dependsOnId: true },
    take: 5000,
  });

  const allTasks = await prisma.task.findMany({
    where: { povId },
    select: { id: true },
    orderBy: { order: 'asc' },
  });

  // Build adjacency list and in-degree map
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dependsOnId → [taskIds that depend on it]

  for (const task of allTasks) {
    inDegree.set(task.id, 0);
  }

  for (const dep of allDeps) {
    inDegree.set(dep.taskId, (inDegree.get(dep.taskId) || 0) + 1);
    if (!dependents.has(dep.dependsOnId)) {
      dependents.set(dep.dependsOnId, []);
    }
    dependents.get(dep.dependsOnId)!.push(dep.taskId);
  }

  // Kahn's algorithm: BFS from nodes with in-degree 0
  const queue: string[] = [];
  for (const [taskId, degree] of inDegree) {
    if (degree === 0) queue.push(taskId);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const dependent of (dependents.get(current) || [])) {
      const newDegree = (inDegree.get(dependent) || 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  if (sorted.length < allTasks.length) {
    throw new Error('Dependency graph contains a cycle — cannot determine execution order');
  }

  return sorted;
}
