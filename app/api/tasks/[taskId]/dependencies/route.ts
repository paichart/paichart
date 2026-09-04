import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { TaskDependencySchema } from '@/lib/validation/task-validation';
import { getTaskWithPOV } from '@/lib/tasks/helpers/pov-access';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { createErrorResponse, createSuccessResponse } from '@/lib/api/error-handler';
import { checkDependencyCycle, GraphLimits } from '@/lib/utils/graph';
import { prisma } from '@/lib/prisma';
import { trackActivity } from '@/lib/auth/audit';
import { taskLogger } from '@/lib/logger';

// POST /api/tasks/[taskId]/dependencies - Add task dependency
export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // ✅ 1. Authentication
    const user = await getAuthUser(req);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // ✅ 2. POV Access Validation
    const task = await getTaskWithPOV(params.taskId);

    if (!task || !task.pov) {
      return createErrorResponse('NOT_FOUND', 'Task not found');
    }

    try {
      validatePOVAccess(user, task.pov, { throwOnDeny: true, requireWrite: true });  // 2026-05-26 demo-write fix
    } catch (error: any) {
      return createErrorResponse('FORBIDDEN', 'Access denied');
    }

    // ✅ 3. Zod Validation with safeParse (P1 fix - proper error handling)
    const data = await req.json();
    const result = TaskDependencySchema.safeParse(data);

    if (!result.success) {
      return NextResponse.json({
        error: {
          message: 'Validation failed',
          code: 'INVALID_REQUEST',
          details: result.error.errors
        },
      }, { status: 400 });
    }

    const validated = result.data;

    // ✅ 4. Verify dependent task exists and is in same POV
    const dependentTask = await prisma.task.findUnique({
      where: { id: validated.dependsOnId },
      select: { id: true, povId: true }
    });

    if (!dependentTask) {
      return createErrorResponse('NOT_FOUND', 'Dependent task not found');
    }

    if (dependentTask.povId !== task.povId) {
      return createErrorResponse('BAD_REQUEST', 'Dependent task must be in same POV');
    }

    // ✅ 5. CRITICAL: Check for circular dependencies (Week 3 P0 Fix #1)
    try {
      const { hasCycle, depth } = await checkDependencyCycle(params.taskId, validated.dependsOnId);

      if (hasCycle) {
        return createErrorResponse('BAD_REQUEST', 'Circular dependency detected');
      }

      if (depth >= GraphLimits.MAX_DEPTH) {
        return createErrorResponse('BAD_REQUEST', `Dependency chain too deep (max depth: ${GraphLimits.MAX_DEPTH})`);
      }
    } catch (error: any) {
      // DoS protection errors
      if (error.message?.includes('exceeds limit') || error.message?.includes('too complex')) {
        return createErrorResponse('BAD_REQUEST', 'Dependency graph too complex');
      }
      throw error;
    }

    // ✅ 6. Create dependency
    const dependency = await prisma.taskDependency.create({
      data: {
        taskId: params.taskId,
        dependsOnId: validated.dependsOnId
      }
    });

    // ✅ Audit logging
    await trackActivity(
      user.userId,
      'TASK',
      'ADD_DEPENDENCY',
      {
        taskId: params.taskId,
        dependsOnId: validated.dependsOnId,
        success: true
      }
    );

    taskLogger.info({ taskId: params.taskId, dependsOnId: validated.dependsOnId }, 'Task dependency added');

    return createSuccessResponse(dependency, 'Dependency added successfully');
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'POST /api/tasks/[taskId]/dependencies' }, 'Failed to add dependency');
    return createErrorResponse('INTERNAL_ERROR', 'Failed to add dependency');
  }
}

// DELETE /api/tasks/[taskId]/dependencies - Remove task dependency
export async function DELETE(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // ✅ 1. Authentication
    const user = await getAuthUser(req);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // ✅ 2. POV Access Validation
    const task = await getTaskWithPOV(params.taskId);

    if (!task || !task.pov) {
      return createErrorResponse('NOT_FOUND', 'Task not found');
    }

    try {
      validatePOVAccess(user, task.pov, { throwOnDeny: true, requireWrite: true });  // 2026-05-26 demo-write fix
    } catch (error: any) {
      return createErrorResponse('FORBIDDEN', 'Access denied');
    }

    // ✅ 3. Get dependency ID from query params
    const { searchParams } = new URL(req.url);
    const dependsOnId = searchParams.get('dependsOnId');

    if (!dependsOnId) {
      return createErrorResponse('BAD_REQUEST', 'dependsOnId query parameter required');
    }

    // ✅ 4. Delete dependency
    const deleted = await prisma.taskDependency.deleteMany({
      where: {
        taskId: params.taskId,
        dependsOnId: dependsOnId
      }
    });

    if (deleted.count === 0) {
      return createErrorResponse('NOT_FOUND', 'Dependency not found');
    }

    // ✅ Audit logging
    await trackActivity(
      user.userId,
      'TASK',
      'REMOVE_DEPENDENCY',
      {
        taskId: params.taskId,
        dependsOnId,
        success: true
      }
    );

    taskLogger.info({ taskId: params.taskId, dependsOnId }, 'Task dependency removed');

    return createSuccessResponse(null, 'Dependency removed successfully');
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'DELETE /api/tasks/[taskId]/dependencies' }, 'Failed to remove dependency');
    return createErrorResponse('INTERNAL_ERROR', 'Failed to remove dependency');
  }
}
