import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { povLogger } from '@/lib/logger';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';

/**
 * GET /api/pov/check-circular-dependency
 *
 * Check if adding a dependency would create a circular dependency
 * Query parameters:
 * - taskId: The ID of the task being edited
 * - dependsOnId: Comma-separated list of task IDs that the task depends on
 */
export async function GET(req: NextRequest) {
  try {
    // BC56 FIX: Require authentication (was completely unprotected)
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const taskId = url.searchParams.get('taskId');
    const dependsOnIdsParam = url.searchParams.get('dependsOnId');
    
    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId is required' },
        { status: 400 }
      );
    }
    
    if (!dependsOnIdsParam) {
      return NextResponse.json(
        { hasCircularDependency: false }
      );
    }
    
    const dependsOnIds = dependsOnIdsParam.split(',').filter(Boolean);
    
    // If no dependencies, there can't be a circular dependency
    if (dependsOnIds.length === 0) {
      return NextResponse.json(
        { hasCircularDependency: false }
      );
    }
    
    // Check for direct circular dependency (task depends on itself)
    if (dependsOnIds.includes(taskId)) {
      return NextResponse.json(
        { hasCircularDependency: true, reason: 'Task cannot depend on itself' }
      );
    }
    
    // BC56 FIX: Scope dependencies to the task's POV (was unscoped global query leaking cross-tenant data)
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { stage: { select: { phase: { select: { povId: true } } } } }
    });
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    const povId = task.stage?.phase?.povId;
    if (!povId) {
      return NextResponse.json({ error: 'Task has no POV context' }, { status: 400 });
    }

    // 2026-05-26: verify the caller can access this task's POV before revealing its
    // dependency structure (boolean-oracle hardening — BC56 scoped the query but
    // didn't check caller access).
    const depPov = await prisma.pOV.findUnique({
      where: { id: povId },
      select: { id: true, ownerId: true, metadata: true, team: { select: { members: { select: { userId: true } } } } },
    });
    const depIsAdmin = authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN';
    if (depPov && !depIsAdmin && !validatePOVAccess(authUser, depPov, { throwOnDeny: false, logContext: 'Circular Dependency Check' })) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get dependencies only for tasks within the same POV
    const allDependencies = await prisma.taskDependency.findMany({
      where: {
        task: { stage: { phase: { povId } } }
      }
    });
    
    // Build a dependency graph
    const dependencyGraph: Record<string, string[]> = {};
    
    // Initialize the graph with existing dependencies
    allDependencies.forEach(dep => {
      if (!dependencyGraph[dep.taskId]) {
        dependencyGraph[dep.taskId] = [];
      }
      dependencyGraph[dep.taskId].push(dep.dependsOnId);
    });
    
    // Add the new dependencies to the graph
    if (!dependencyGraph[taskId]) {
      dependencyGraph[taskId] = [];
    }
    dependsOnIds.forEach(depId => {
      if (!dependencyGraph[taskId].includes(depId)) {
        dependencyGraph[taskId].push(depId);
      }
    });
    
    // Check for circular dependencies using depth-first search
    const hasCircularDependency = checkForCircularDependencies(dependencyGraph, taskId);
    
    return NextResponse.json({
      hasCircularDependency,
      reason: hasCircularDependency ? 'Circular dependency detected in the dependency chain' : null
    });
  } catch (error) {
    povLogger.error({ err: error }, 'check circular dependency error');
    return NextResponse.json(
      { error: 'Failed to check circular dependencies' },
      { status: 500 }
    );
  }
}

/**
 * Check for circular dependencies in a dependency graph
 * 
 * @param graph The dependency graph
 * @param startNode The node to start the check from
 * @returns True if a circular dependency is detected, false otherwise
 */
function checkForCircularDependencies(
  graph: Record<string, string[]>,
  startNode: string
): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function dfs(node: string): boolean {
    // If node is not in the graph, it has no dependencies
    if (!graph[node]) {
      return false;
    }
    
    // Mark the current node as visited and add to recursion stack
    visited.add(node);
    recursionStack.add(node);
    
    // Visit all dependencies
    for (const dependency of graph[node]) {
      // If dependency is not visited, check it recursively
      if (!visited.has(dependency)) {
        if (dfs(dependency)) {
          return true;
        }
      } 
      // If dependency is in recursion stack, we found a cycle
      else if (recursionStack.has(dependency)) {
        return true;
      }
    }
    
    // Remove the node from recursion stack
    recursionStack.delete(node);
    return false;
  }
  
  return dfs(startNode);
}