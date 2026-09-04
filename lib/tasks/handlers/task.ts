import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { getPOVForAccess } from '../helpers/pov-access';
import { TaskService } from '../services/task';
import { taskListCache } from './get';
import { TaskResponse, TaskPriority, TaskStatus, CreateTaskData } from '../types/index';
import { mapTaskFromPrisma } from '../prisma/mappers';
import { CreateTaskSchema, UpdateTaskSchema } from '@/lib/validation/task-validation';
import { parsePaginationParams, paginationResponse } from '@/lib/utils/pagination';
import { taskLogger } from '@/lib/logger';

const log = taskLogger.child({ module: 'TaskHandler' });

/**
 * Create task handler
 */
export async function createTaskHandler(
  req: NextRequest,
  povId: string,
  phaseId: string,
  data: {
    title: string;
    description?: string;
    assigneeId?: string;
    dueDate?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    stageId?: string;
    dependencyIds?: string[];
    
    // AI-Driven Development Fields
    agentRole?: string;
    prompt?: string;
    inputContext?: any;
    outputArtifacts?: any;
    // executionStatus intentionally absent — engine-owned, stripped from
    // Create/UpdateTaskSchema (F1 2026-07-25). Declaring it here would
    // advertise an input the validator drops.
    agentLog?: string;
    maxRetries?: number;
    timeout?: number;
    
    // Parent-Child Relationship
    parentTaskId?: string;
    
    // Legacy metadata
    metadata?: any;
  }
): Promise<TaskResponse> {
  const user = await getAuthUser(req);
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get PoV for access validation (needs metadata + team for validatePOVAccess)
  const pov = await getPOVForAccess(povId);

  if (!pov) {
    throw new Error('PoV not found');
  }

  // Check POV access (ownership OR team OR demo OR admin)
  // Aligns with UPDATE/DELETE handlers for consistency
  try {
    validatePOVAccess(user, pov, {
      throwOnDeny: true,
      requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
      logContext: 'Task Create'
    });
  } catch (error: any) {
    throw new Error(error.message || 'Permission denied - requires access to PoV');
  }

  // ✅ SECURITY: Validate text fields for XSS/injection and enum safety
  const validation = CreateTaskSchema.safeParse({ ...data, povId, phaseId });
  if (!validation.success) {
    throw new Error('Invalid task data: ' + validation.error.errors.map(e => e.message).join(', '));
  }

  // SECURITY (2026-05-14 BC76 fix): read from validation.data, NOT raw data.
  // The prior `data as any` cast discarded every transform and refine the
  // schema runs (incl. .refine(detectPromptInjection) on title + description
  // + the new agent-execution text fields). URL params povId/phaseId
  // override validated body to keep them as source of truth.
  const { povId: _, phaseId: __, ...safeData } = validation.data;

  // Create task. Cast bridges a TypeScript-only mismatch: Zod's
  // z.nativeEnum(TaskPriority) infers as a literal union ("HIGH" |
  // "MEDIUM" | "LOW") while CreateTaskData uses the TaskPriority enum
  // type — structurally identical at runtime, distinct to tsc. Cast
  // is safe because validation.data IS the validated shape.
  const task = await TaskService.createTask({
    ...safeData,
    povId,    // URL param (source of truth)
    phaseId,  // URL param (source of truth)
  } as CreateTaskData);

  return {
    data: mapTaskFromPrisma(task),
  };
}

/**
 * Update task handler
 */
export async function updateTaskHandler(
  req: NextRequest,
  povId: string,
  phaseId: string,
  taskId: string,
  data: {
    title?: string;
    description?: string;
    assigneeId?: string;
    dueDate?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    stageId?: string;
    dependencyIds?: string[];
    
    // AI-Driven Development Fields
    agentRole?: string;
    prompt?: string;
    inputContext?: any;
    outputArtifacts?: any;
    // executionStatus intentionally absent — engine-owned, stripped from
    // Create/UpdateTaskSchema (F1 2026-07-25). Declaring it here would
    // advertise an input the validator drops.
    agentLog?: string;
    maxRetries?: number;
    timeout?: number;
    
    // Parent-Child Relationship
    parentTaskId?: string;
    
    // Legacy metadata
    metadata?: any;
  }
): Promise<TaskResponse> {
  const user = await getAuthUser(req);
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get PoV for access validation (needs metadata + team for validatePOVAccess)
  const pov = await getPOVForAccess(povId);

  if (!pov) {
    throw new Error('PoV not found');
  }

  // Check POV access (ownership OR team OR demo OR admin)
  try {
    validatePOVAccess(user, pov, {
      throwOnDeny: true,
      requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
      logContext: 'Task Update'
    });
  } catch (error: any) {
    throw new Error(error.message || 'Permission denied - requires access to PoV');
  }

  // ✅ SECURITY: Validate text fields for XSS/injection and enum safety
  const validation = UpdateTaskSchema.safeParse(data);
  if (!validation.success) {
    throw new Error('Invalid task data: ' + validation.error.errors.map(e => e.message).join(', '));
  }

  // Validate task exists and belongs to the phase
  const existingTask = await TaskService.getTask(taskId);
  if (!existingTask) {
    throw new Error('Task not found');
  }
  if (existingTask.phaseId !== phaseId) {
    throw new Error('Task does not belong to this phase');
  }

  // SECURITY (2026-05-14 BC76 fix): pass validation.data to TaskService.updateTask,
  // NOT raw data. The prior raw-data pass discarded every refine on title /
  // description / agentRole / prompt / agentLog and dropped transforms on
  // inputContext / outputArtifacts / mcpContext / mcpMetadata / metadata.
  const validated = validation.data;

  // Validate required fields
  if (validated.title !== undefined && validated.title !== null && !validated.title.trim()) {
    throw new Error('Title cannot be empty');
  }

  // Update task (cast: same TaskPriority enum-vs-literal mismatch as createTaskHandler)
  const task = await TaskService.updateTask(taskId, validated as Partial<CreateTaskData>, user.userId);

  taskListCache.invalidatePattern('tasks');  // task changed → flush stale list reads

  return {
    data: mapTaskFromPrisma(task),
  };
}

/**
 * Get single task handler
 */
export async function getTaskHandler(
  req: NextRequest,
  povId: string,
  phaseId: string,
  taskId: string
): Promise<TaskResponse> {
  log.info({ taskId }, 'getting task');

  const user = await getAuthUser(req);
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get PoV for access validation (needs metadata + team for validatePOVAccess)
  const pov = await getPOVForAccess(povId);

  if (!pov) {
    throw new Error('PoV not found');
  }

  // Check POV access (ownership OR team OR demo OR admin)
  try {
    validatePOVAccess(user, pov, {
      throwOnDeny: true,
      logContext: 'Task Get'
    });
  } catch (error: any) {
    throw new Error(error.message || 'Permission denied - requires access to PoV');
  }

  const task = await TaskService.getTask(taskId);
  log.debug({ taskId, hasTask: !!task }, 'raw task from service');
  
  if (!task) {
    throw new Error('Task not found');
  }

  // Verify task belongs to the specified phase
  if (task.phaseId !== phaseId) {
    throw new Error('Task does not belong to this phase');
  }

  const mappedTask = mapTaskFromPrisma(task);
  log.debug({ taskId: mappedTask?.id }, 'mapped task');
  
  return {
    data: mappedTask,
  };
}

/**
 * Get phase tasks handler
 */
export async function getPhaseTasksHandler(
  req: NextRequest,
  povId: string,
  phaseId: string
): Promise<{ data: any[] }> {
  const user = await getAuthUser(req);
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get PoV for access validation (needs metadata + team for validatePOVAccess)
  const pov = await getPOVForAccess(povId);

  if (!pov) {
    throw new Error('PoV not found');
  }

  // Check POV access (ownership OR team OR demo OR admin)
  try {
    validatePOVAccess(user, pov, {
      throwOnDeny: true,
      logContext: 'Phase Tasks List'
    });
  } catch (error: any) {
    throw new Error(error.message || 'Permission denied - requires access to PoV');
  }

  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePaginationParams(searchParams);
  const result = await TaskService.getPhaseTasks(phaseId, { limit, offset });

  // result is { data, total } when pagination provided
  if ('data' in result && 'total' in result) {
    return paginationResponse(result.data.map(mapTaskFromPrisma), result.total, limit, offset);
  }

  // Fallback (shouldn't happen since we always pass pagination)
  return { data: (result as any[]).map(mapTaskFromPrisma) };
}
