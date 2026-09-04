/**
 * Workflow API handlers
 *
 * Admin-only CRUD operations for named workflows.
 * All handlers are called via createHandler with requireAuth: true,
 * which guarantees user is present at runtime. The user! assertion is safe.
 */
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ensureObject } from '@/lib/utils/ensure-object';
import { executeOrchestrationWorkflow } from '@/lib/services/workflow';
import { TokenPayload } from '@/lib/types/auth';

const workflowLogger = logger.child({ module: 'WorkflowHandlers' });
import { z } from 'zod';
import {
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  RunWorkflowSchema,
  ListWorkflowsQuerySchema,
  ListExecutionsQuerySchema,
  WorkflowDTO,
  WorkflowStepSchema,
  extractWorkflowConfig
} from './schemas';

/**
 * GET /api/workflows - List workflows
 */
export async function handleListWorkflows(
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) {
  const { searchParams } = new URL(req.url);
  // NOTE: Added pagination params (api-efficiency review)
  const query = ListWorkflowsQuerySchema.safeParse({
    category: searchParams.get('category') || undefined,
    status: searchParams.get('status') || 'ACTIVE',
    limit: searchParams.get('limit') || 50,
    offset: searchParams.get('offset') || 0
  });

  if (!query.success) {
    return { error: { message: 'Invalid query parameters', code: 'VALIDATION_ERROR', details: query.error.flatten() } };
  }

  const { status, category, limit, offset } = query.data;

  // Get total count for pagination (api-efficiency review)
  const total = await prisma.mCPWorkflow.count({
    where: {
      status,
      ...(category && { category })
    }
  });

  const rawWorkflows = await prisma.mCPWorkflow.findMany({
    where: {
      status,
      ...(category && { category })
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      status: true,
      steps: true,  // JSON object with nested steps array
      executionCount: true,
      successRate: true,
      averageTime: true,
      lastExecution: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { name: 'asc' },
    take: limit,
    skip: offset
  });

  // Transform workflows to extract nested steps array for frontend
  // DB stores: { steps: [...], executionMode, timeout, failureStrategy }
  // Frontend expects: steps to be the array directly
  // Phase 0 Fix 0.5: Type-safe extraction (types-system-specialist)
  const workflows = rawWorkflows.map(workflow => {
    const config = extractWorkflowConfig(workflow.steps);

    if (!config) {
      // Fallback for legacy workflows without proper config
      workflowLogger.warn({ workflowId: workflow.id }, 'Workflow has invalid config structure');
      return {
        ...workflow,
        steps: [],
        executionMode: 'sequential' as const,
        failureStrategy: 'stop' as const,
        timeout: 60000
      };
    }

    return {
      ...workflow,
      steps: config.steps,
      executionMode: config.executionMode,
      failureStrategy: config.failureStrategy,
      timeout: config.timeout,
      // I2 (workflow-orch + boundary-contract round-2 2026-05-17): surface declared
      // runtime requirements so AI clients can introspect what to pass at execute
      // time instead of trial-and-error. Empty array if not declared.
      requires: Array.isArray(config.requires) ? config.requires : [],
      // Top-level form-strip fix (Phase 5 2026-05-17): include the raw JSONB config
      // alongside extracted fields so the GUI editor can spread unknown top-level
      // keys (e.g., `requires`) back on save without losing them. The extracted
      // fields stay as the primary form-state surface; _rawConfig is the
      // form-strip preservation lane only. Closes BUG-REPORT-mcp-workflows-
      // toplevel-formstrip-2026-05-17.
      _rawConfig: workflow.steps as Record<string, unknown>
    };
  });

  return { data: { total, limit, offset, workflows } };
}

/**
 * POST /api/workflows - Create workflow
 */
export async function handleCreateWorkflow(
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) {
  const body = await req.json();
  const validation = CreateWorkflowSchema.safeParse(body);

  if (!validation.success) {
    return { error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details: validation.error.flatten() } };
  }

  const { name, description, category, steps, triggers, schedule } = validation.data;

  // BC65 FIX: Use try/catch on create to handle race between duplicate check and insert
  try {
    // Check for duplicate name (fast path)
    const existing = await prisma.mCPWorkflow.findUnique({ where: { name } });
    if (existing) {
      return { error: { message: `Workflow "${name}" already exists`, code: 'DUPLICATE_NAME' } };
    }

    // Cast JSON fields to Prisma.InputJsonValue for JSONB compatibility
    const workflow = await prisma.mCPWorkflow.create({
      data: {
        name,
        description,
        category,
        createdBy: user!.userId,
        steps: steps as unknown as Prisma.InputJsonValue,
        triggers: triggers as unknown as Prisma.InputJsonValue,
        schedule: schedule as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE'
      }
    });

    return { data: workflow };
  } catch (error: any) {
    // BC65 FIX: Handle unique constraint violation from concurrent create
    if (error?.code === 'P2002') {
      return { error: { message: `Workflow "${name}" already exists`, code: 'DUPLICATE_NAME' } };
    }
    throw error;
  }
}

/**
 * GET /api/workflows/[id] - Get single workflow
 */
export async function handleGetWorkflow(
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) {
  const { id } = context.params;

  const rawWorkflow = await prisma.mCPWorkflow.findUnique({
    where: { id },
    include: {
      executions: {
        take: 10,
        orderBy: { startTime: 'desc' },
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
          output: true
        }
      }
    }
  });

  if (!rawWorkflow) {
    return { error: { message: 'Workflow not found', code: 'NOT_FOUND' } };
  }

  // Transform to extract nested steps array for frontend
  // Phase 0 Fix 0.5: Type-safe extraction (types-system-specialist)
  const config = extractWorkflowConfig(rawWorkflow.steps);

  if (!config) {
    // Fallback for legacy workflows without proper config
    workflowLogger.warn({ workflowId: rawWorkflow.id }, 'Workflow has invalid config structure');
    return {
      data: {
        ...rawWorkflow,
        steps: [] as z.infer<typeof WorkflowStepSchema>[],
        executionMode: 'sequential' as const,
        failureStrategy: 'stop' as const,
        timeout: 60000,
        requires: [] as Array<'povId' | 'taskId'>,
        _rawConfig: (rawWorkflow.steps ?? {}) as Record<string, unknown>
      }
    };
  }

  const workflow = {
    ...rawWorkflow,
    steps: config.steps,
    executionMode: config.executionMode,
    failureStrategy: config.failureStrategy,
    timeout: config.timeout,
    requires: Array.isArray(config.requires) ? config.requires : [],
    // Top-level form-strip fix (Phase 5 2026-05-17): see handleListWorkflows.
    _rawConfig: rawWorkflow.steps as Record<string, unknown>
  };

  return { data: workflow };
}

/**
 * PUT /api/workflows/[id] - Update workflow
 */
export async function handleUpdateWorkflow(
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) {
  const { id } = context.params;
  const body = await req.json();
  const validation = UpdateWorkflowSchema.safeParse(body);

  if (!validation.success) {
    return { error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details: validation.error.flatten() } };
  }

  const existing = await prisma.mCPWorkflow.findUnique({ where: { id } });
  if (!existing) {
    return { error: { message: 'Workflow not found', code: 'NOT_FOUND' } };
  }

  // Destructure and cast JSON fields for Prisma compatibility
  const { steps, triggers, schedule, ...rest } = validation.data;
  const workflow = await prisma.mCPWorkflow.update({
    where: { id },
    data: {
      ...rest,
      ...(steps && { steps: steps as unknown as Prisma.InputJsonValue }),
      ...(triggers && { triggers: triggers as unknown as Prisma.InputJsonValue }),
      ...(schedule !== undefined && { schedule: schedule as unknown as Prisma.InputJsonValue })
    }
  });

  return { data: workflow };
}

/**
 * DELETE /api/workflows/[id] - Delete workflow (soft delete)
 */
export async function handleDeleteWorkflow(
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) {
  const { id } = context.params;

  const existing = await prisma.mCPWorkflow.findUnique({ where: { id } });
  if (!existing) {
    return { error: { message: 'Workflow not found', code: 'NOT_FOUND' } };
  }

  // Hard delete (matches the skills/prompt-library delete). Execution history survives — the
  // MCPWorkflowExecution.workflow relation is onDelete: SetNull, so run records are kept (workflowId → null).
  // To retire-but-keep a workflow with its named history, set status to DEPRECATED in the editor instead.
  await prisma.mCPWorkflow.delete({
    where: { id }
  });

  return { data: { success: true, message: `Workflow "${existing.name}" deleted` } };
}

/**
 * POST /api/workflows/run - Run workflow
 */
export async function handleRunWorkflow(
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) {
  const body = await req.json();
  const validation = RunWorkflowSchema.safeParse(body);

  if (!validation.success) {
    return { error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details: validation.error.flatten() } };
  }

  let { workflowName, steps, executionMode, failureStrategy, timeout, povId, taskId } = validation.data;

  // Lookup workflow by name if provided
  // NOTE: Use findFirst (not findUnique) - compound where clause (boundary-contract review)
  let workflowId: string | undefined;
  if (workflowName && !steps) {
    const workflow = await prisma.mCPWorkflow.findFirst({
      where: { name: workflowName, status: 'ACTIVE' }
    });

    if (!workflow) {
      return { error: { message: `Workflow "${workflowName}" not found`, code: 'NOT_FOUND' } };
    }

    workflowId = workflow.id;  // Capture for execution tracking
    const config = ensureObject(workflow.steps, {}, 'MCPWorkflow steps') as Record<string, any>;
    steps = config.steps as typeof steps;
    executionMode = (config.executionMode as typeof executionMode) || executionMode;
    failureStrategy = (config.failureStrategy as typeof failureStrategy) || failureStrategy;
    timeout = (config.timeout as typeof timeout) || timeout;
  }

  // Derive povId from taskId if needed
  if (taskId && !povId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { povId: true }
    });
    povId = task?.povId || undefined;
  }

  // Ensure steps are present
  if (!steps || steps.length === 0) {
    return { error: { message: 'Either workflowName or steps must be provided', code: 'VALIDATION_ERROR' } };
  }

  // U2 Phase D sites #12, #13 (2026-05-19): Bearer-extract DROPPED.
  // Pre-Phase-D, this handler extracted the Bearer token from the inbound
  // request and forwarded it down the orchestration chain. Post-Phase-D,
  // downstream service-caller mints per-call tokens with per-service audience
  // (RFC 8707). The inbound user identity is sufficient — token forwarding
  // is no longer needed.

  // Execute workflow
  const result = await executeOrchestrationWorkflow(
    'mcp_service_orchestration',
    { steps, executionMode, failureStrategy, timeout },
    user!.userId,
    { povId, workflowId }
  );

  return { data: { success: true, workflowName, result } };
}

/**
 * GET /api/workflows/executions - List workflow executions
 */
export async function handleListExecutions(
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) {
  const { searchParams } = new URL(req.url);
  const query = ListExecutionsQuerySchema.safeParse({
    workflowId: searchParams.get('workflowId') || undefined,
    status: searchParams.get('status') || undefined,
    limit: searchParams.get('limit') || 50,
    offset: searchParams.get('offset') || 0
  });

  if (!query.success) {
    return { error: { message: 'Invalid query parameters', code: 'VALIDATION_ERROR', details: query.error.flatten() } };
  }

  const { workflowId, status, limit, offset } = query.data;

  // Build where clause
  const where = {
    ...(workflowId && { workflowId }),
    ...(status && { status })
  };

  // Get total count
  const total = await prisma.mCPWorkflowExecution.count({ where });

  // Fetch executions with workflow details
  const executions = await prisma.mCPWorkflowExecution.findMany({
    where,
    select: {
      id: true,
      workflowId: true,
      userId: true,
      povId: true,
      executionMode: true,
      workflowType: true,
      status: true,
      startTime: true,
      endTime: true,
      duration: true,
      output: true,
      error: true,
      workflow: {
        select: {
          name: true,
          description: true,
          category: true
        }
      }
    },
    orderBy: { startTime: 'desc' },
    take: limit,
    skip: offset
  });

  return { data: { total, limit, offset, executions } };
}
