import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TokenPayload } from '@/lib/types/auth';
import { CreateTaskData, TaskResponse } from '../types/index';
import { taskFullSelect } from '../prisma/select';
import { mapTaskFromPrisma } from '../prisma/mappers';
import { CreateTaskSchema } from '@/lib/validation/task-validation';
import { getTaskWithPOV, getPOVForAccess } from '@/lib/tasks/helpers/pov-access';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { taskListCache } from './get'; // Import cache for invalidation

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user: TokenPayload
) => Promise<T | { error: { message: string; code: string } }>;

export const createTaskHandler: ApiHandler<TaskResponse> = async (
  req: NextRequest,
  _context: { params: Record<string, string> },
  user: TokenPayload
) => {
  const data = (await req.json()) as CreateTaskData;

  // ✅ ENHANCEMENT: Zod validation (Week 3 P0 Fix #3)
  const validation = CreateTaskSchema.safeParse(data);
  if (!validation.success) {
    return {
      error: {
        message: 'Invalid task data: ' + validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        code: 'VALIDATION_ERROR'
      }
    };
  }

  const validated = validation.data;

  // ✅ ENHANCEMENT: POV access validation (Week 3 - cross-tenant protection)
  const pov = await getPOVForAccess(validated.povId);

  if (!pov) {
    return {
      error: {
        message: 'POV not found',
        code: 'NOT_FOUND',
      },
    };
  }

  try {
    validatePOVAccess(user, pov, { throwOnDeny: true, requireWrite: true, logContext: 'Task Create (Direct)' });
  } catch (error: any) {
    return {
      error: {
        message: error.message || 'Access denied',
        code: 'FORBIDDEN',
      },
    };
  }

  // POV access validation is sufficient - removed redundant role-based permission check
  // Aligns with lib/tasks/handlers/task.ts pattern (ownership-based auth)
  // If user has POV access (owner OR team OR demo), they can create tasks

  // Calculate the next task order using the same pattern as reorder endpoint
  let nextOrder = 1000; // Default for first task

  if (validated.stageId) {
    const lastTask = await prisma.task.findFirst({
      where: { stageId: validated.stageId },
      orderBy: { order: 'desc' }
    });

    // Use the same pattern as reorder endpoint: (index + 1) * 1000
    nextOrder = lastTask ? lastTask.order + 1000 : 1000;
  }

  // SECURITY (2026-05-14 BC76 fix): read from validated, NOT raw data.
  // Previously line 36 stored `validated` but the Prisma write below used
  // `data.X` for every field — discarding every refine and transform.
  const task = await prisma.task.create({
    data: {
      title: validated.title,
      description: validated.description || null,
      assigneeId: validated.assigneeId || null,
      teamId: validated.teamId || null,
      povId: validated.povId || null,
      phaseId: validated.phaseId || null,
      stageId: validated.stageId || null,
      order: nextOrder,
      dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
      priority: validated.priority || 'MEDIUM',
      status: validated.status || 'OPEN',
    },
    select: taskFullSelect,
  });

  // ✅ Q1 2026 Performance: Invalidate task list cache after creation
  taskListCache.invalidatePattern('tasks');

  return { data: mapTaskFromPrisma(task) };
};
