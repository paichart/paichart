import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskService } from '@/lib/tasks/services/task';
import { mapTaskFromPrisma } from '@/lib/tasks/prisma/mappers';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { checkDependencyCycle, GraphLimits } from '@/lib/utils/graph';
import { povLogger } from '@/lib/logger';

/**
 * GET /api/pov/[povId]/phase/[phaseId]/task/[taskId]/dependencies
 *
 * Get dependencies for a task
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const GET = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅

    // Get task dependencies
    const dependencies = await prisma.taskDependency.findMany({
      where: { taskId: params.taskId },
      include: {
        dependsOn: {
          select: {
            id: true,
            title: true,
            status: true,
            stageId: true,
            phaseId: true,
          }
        }
      }
    });

    return NextResponse.json({ data: dependencies });
  } catch (error) {
    povLogger.error({ err: error }, 'task dependencies GET error');
    return NextResponse.json(
      { error: 'Failed to fetch task dependencies' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/pov/[povId]/phase/[phaseId]/task/[taskId]/dependencies
 *
 * Update dependencies for a task
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const PUT = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅

    // Parse request body
    const { dependencyIds } = await request.json();
    
    if (!Array.isArray(dependencyIds)) {
      return NextResponse.json(
        { error: 'dependencyIds must be an array' },
        { status: 400 }
      );
    }

    // Validate task exists
    const task = await prisma.task.findUnique({
      where: { id: params.taskId },
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Verify task belongs to the specified phase
    if (task.phaseId !== params.phaseId) {
      return NextResponse.json(
        { error: 'Task does not belong to this phase' },
        { status: 400 }
      );
    }

    // SECURITY FIX: Check for circular dependencies before creating (P0 vulnerability fix)
    // Uses BFS algorithm with DoS protection (MAX_DEPTH=GraphLimits.MAX_DEPTH (single source, CC4 2026-07-15), MAX_NODES=100)
    for (const dependsOnId of dependencyIds) {
      try {
        const { hasCycle, depth } = await checkDependencyCycle(params.taskId, dependsOnId);

        if (hasCycle) {
          return NextResponse.json(
            { error: `Circular dependency detected: adding ${dependsOnId} would create a cycle` },
            { status: 400 }
          );
        }

        if (depth >= GraphLimits.MAX_DEPTH) {
          return NextResponse.json(
            { error: `Dependency chain too deep (max depth: ${GraphLimits.MAX_DEPTH})` },
            { status: 400 }
          );
        }
      } catch (error: unknown) {
        // DoS protection errors from graph.ts — safe to surface (controlled messages)
        const message = error instanceof Error ? error.message : '';
        if (message.includes('exceeds limit') || message.includes('too complex')) {
          return NextResponse.json(
            { error: 'Dependency graph too complex' },
            { status: 400 }
          );
        }
        throw error;
      }
    }

    // Apply atomic transaction pattern for dependency updates (race condition prevention)
    await prisma.$transaction(async (tx) => {
      povLogger.debug({ taskId: params.taskId }, 'atomically updating task dependencies');
      
      // Step 1: Delete existing dependencies within transaction
      await tx.taskDependency.deleteMany({
        where: { taskId: params.taskId }
      });
      
      // Step 2: Create new dependencies within same transaction (atomic guarantees)
      if (dependencyIds.length > 0) {
        const createPromises = dependencyIds.map(dependsOnId => 
          tx.taskDependency.create({
            data: {
              taskId: params.taskId,
              dependsOnId
            }
          })
        );
        
        // All dependencies created atomically - either all succeed or all fail
        const results = await Promise.all(createPromises);
        povLogger.info({ taskId: params.taskId, count: results.length }, 'atomic dependency update successful');
      } else {
        povLogger.info({ taskId: params.taskId }, 'atomic dependency cleanup: removed all dependencies');
      }
    });

    // Get updated task with dependencies
    const updatedTask = await TaskService.getTask(params.taskId);
    
    return NextResponse.json({
      data: mapTaskFromPrisma(updatedTask),
      message: 'Dependencies updated successfully'
    });
  } catch (error) {
    povLogger.error({ err: error }, 'task dependencies PUT error');
    return NextResponse.json(
      { error: 'Failed to update task dependencies' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/pov/[povId]/phase/[phaseId]/task/[taskId]/dependencies
 *
 * Add a dependency to a task
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const POST = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅

    // Parse request body
    const { dependsOnId } = await request.json();
    
    if (!dependsOnId) {
      return NextResponse.json(
        { error: 'dependsOnId is required' },
        { status: 400 }
      );
    }

    // Validate task exists
    const task = await prisma.task.findUnique({
      where: { id: params.taskId },
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Verify task belongs to the specified phase
    if (task.phaseId !== params.phaseId) {
      return NextResponse.json(
        { error: 'Task does not belong to this phase' },
        { status: 400 }
      );
    }

    // Validate dependency task exists
    const dependencyTask = await prisma.task.findUnique({
      where: { id: dependsOnId },
    });

    if (!dependencyTask) {
      return NextResponse.json(
        { error: 'Dependency task not found' },
        { status: 404 }
      );
    }

    // Check for circular dependency using full BFS algorithm (handles transitive cycles A→B→C→A)
    try {
      const { hasCycle, depth } = await checkDependencyCycle(params.taskId, dependsOnId);

      if (hasCycle) {
        return NextResponse.json(
          { error: 'Circular dependency detected in the dependency chain' },
          { status: 400 }
        );
      }

      if (depth >= GraphLimits.MAX_DEPTH) {
        return NextResponse.json(
          { error: `Dependency chain too deep (max depth: ${GraphLimits.MAX_DEPTH})` },
          { status: 400 }
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('exceeds limit') || message.includes('too complex')) {
        return NextResponse.json(
          { error: 'Dependency graph too complex' },
          { status: 400 }
        );
      }
      throw error;
    }

    // Create dependency
    const dependency = await prisma.taskDependency.create({
      data: {
        taskId: params.taskId,
        dependsOnId
      },
      include: {
        dependsOn: {
          select: {
            id: true,
            title: true,
            status: true,
            stageId: true,
          }
        }
      }
    });

    return NextResponse.json({
      data: dependency,
      message: 'Dependency added successfully'
    });
  } catch (error) {
    povLogger.error({ err: error }, 'task dependencies POST error');

    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      return NextResponse.json(
        { error: 'This dependency already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add task dependency' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/pov/[povId]/phase/[phaseId]/task/[taskId]/dependencies/[dependencyId]
 *
 * Remove a dependency from a task
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const DELETE = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅

    const url = new URL(request.url);
    const dependencyId = url.searchParams.get('dependencyId');

    if (!dependencyId) {
      return NextResponse.json(
        { error: 'dependencyId is required' },
        { status: 400 }
      );
    }

    // Validate task exists
    const task = await prisma.task.findUnique({
      where: { id: params.taskId },
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Verify task belongs to the specified phase
    if (task.phaseId !== params.phaseId) {
      return NextResponse.json(
        { error: 'Task does not belong to this phase' },
        { status: 400 }
      );
    }

    // Delete dependency
    await prisma.taskDependency.delete({
      where: { id: dependencyId }
    });

    return NextResponse.json({
      message: 'Dependency removed successfully'
    });
  } catch (error) {
    povLogger.error({ err: error }, 'task dependencies DELETE error');

    // Check if dependency not found
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json(
        { error: 'Dependency not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to remove task dependency' },
      { status: 500 }
    );
  }
});