import { prisma } from '@/lib/prisma';
import { withSerializationRetry } from '@/lib/database/serialization-retry';
import { TaskPriority, TaskStatus, CreateTaskData, TaskType } from '../types/index';
import { taskFullSelect, taskSelect, taskAgentRuntimeFields, taskDepsSelect } from '../prisma/select';
import { TaskPriority as PrismaTaskPriority, TaskStatus as PrismaTaskStatus, TaskType as PrismaTaskType, Prisma } from '@prisma/client';
import { userSelect } from '@/lib/pov/prisma/select';
import { createNotification } from '@/lib/notifications/services/delivery';
import { NotificationType } from '@/lib/notifications/types';
import { stringToTaskType } from '@/lib/utils/taskTypes';
import { createQueryTimer, logOptimizationResult } from '@/lib/database/dev-query-logger';
import { createTaskActivity } from './taskActivityService';
import { enforceProtocolStampImmutable, dropPlatformRunKeys, stripAuditFacts } from './protected-task-metadata';
import { taskLogger } from '@/lib/logger';
import { NON_SELECTABLE_ROLES, SYSTEM_ACCOUNT_EMAIL_SUFFIX } from '@/lib/utils/team-member-guard';

// Transition machine moved to ./status-transitions (P1-C1, completion-path
// unification 2026-07-24) so the completion core can import it without a
// task.ts cycle. Re-exported here so the 5 existing importers keep working.
import { VALID_TASK_TRANSITIONS, validateTaskStatusTransition } from './status-transitions';
export { VALID_TASK_TRANSITIONS, validateTaskStatusTransition };
import { completeTaskTerminally } from './complete-task-terminally';
import { InvalidTransitionError } from '@/lib/errors';

export class TaskService {
  /**
   * Send notification to task assignee
   */
  private static async sendAssigneeNotification(
    taskId: string,
    assigneeId: string,
    taskTitle: string,
    povId: string | null
  ) {
    try {
      if (!povId) return; // Skip if no PoV is associated

      // Get PoV owner's name
      const pov = await prisma.pOV.findUnique({
        where: { id: povId },
        include: {
          owner: {
            select: { name: true }
          }
        }
      });

      if (!pov) return;

      // Get phase ID for the task
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { phaseId: true }
      });

      if (!task?.phaseId) return;

      // Link to the POV editor in project mode. The deep /pov/.../task/... routes
      // don't exist (they 404'd); /pov/edit/[povId]?mode=project is the real route.
      await createNotification({
        type: NotificationType.INFO,
        title: 'New Task Assignment',
        message: `Assigned task ${taskTitle} by ${pov.owner.name}`,
        userId: assigneeId,
        actionUrl: `/pov/edit/${povId}?mode=project`
      });
    } catch (error) {
      taskLogger.error({ err: error }, 'sendAssigneeNotification failed');
      // Don't throw error as this is a non-critical operation
    }
  }

  /**
   * Create a new task
   */
  /**
   * Create task dependencies
   */
  /**
   * Create dependency edges on a caller-supplied tx client. Extracted 2026-07-25 (F3) so the
   * rewrite path can run delete+create inside ONE transaction — see updateTaskDependencies.
   */
  private static async createDependenciesInTx(
    tx: Prisma.TransactionClient,
    taskId: string,
    dependencyIds: string[]
  ) {
    if (!dependencyIds || dependencyIds.length === 0) return [];
    const results = await Promise.all(
      dependencyIds.map(dependsOnId => tx.taskDependency.create({ data: { taskId, dependsOnId } }))
    );
    taskLogger.debug({ taskId, created: results.length }, 'dependency edges created in tx');
    return results;
  }

  private static async createTaskDependencies(taskId: string, dependencyIds: string[]) {
    try {
      if (!dependencyIds || dependencyIds.length === 0) {
        return;
      }

      // Apply atomic transaction pattern for bulk dependency creation (race condition prevention)
      await prisma.$transaction(async (tx) => this.createDependenciesInTx(tx, taskId, dependencyIds));

      taskLogger.info({ taskId, dependencyCount: dependencyIds.length }, 'atomically created dependencies');
    } catch (error) {
      taskLogger.error({ err: error, taskId }, 'atomic bulk dependency creation failed');
      throw error;
    }
  }

  /**
   * Update task dependencies — read + delete + create in ONE transaction.
   *
   * F3 (2026-07-25): this used to run three SEPARATE round-trips (findMany, then deleteMany, then
   * createTaskDependencies' own $transaction). Two defects fell out of that:
   *   1. Crash window — a failure between the delete and the create left edges DROPPED but not
   *      recreated.
   *   2. TOCTOU — the diff was computed from a read outside the write's transaction, so a
   *      concurrent rewrite of the same task's edges could be silently lost.
   * Cosmetic while edges only fed the auto-queue reactor; CONSEQUENTIAL since the completion arc,
   * because `assertCompletionDependenciesSatisfied` now ENFORCES these edges on human completion —
   * lost edges make a gate wrongly completable, and a half-applied rewrite can wrongly block one.
   *
   * RepeatableRead + withSerializationRetry is the house read-modify-write pattern (BC19/TS4, same
   * as updateTask's tx below): a concurrent writer aborts loudly with 40001 and is retried, rather
   * than silently clobbering. Do NOT downgrade the isolation.
   *
   * Callers invoke this OUTSIDE their own transaction (createTask post-creation, updateTask's
   * terminal and ordinary paths), so opening a transaction here nests nothing.
   */
  private static async updateTaskDependencies(taskId: string, dependencyIds: string[] | undefined) {
    try {
      // If dependencies not provided, don't update them
      if (dependencyIds === undefined) {
        return;
      }

      await withSerializationRetry(() => prisma.$transaction(async (tx) => {
        const existingDependencies = await tx.taskDependency.findMany({
          where: { taskId },
          take: 200,
        });

        // Calculate dependencies to add and remove
        const existingDependencyIds = existingDependencies.map(dep => dep.dependsOnId);
        const dependenciesToAdd = dependencyIds.filter(id => !existingDependencyIds.includes(id));
        const dependenciesToRemove = existingDependencies.filter(dep => !dependencyIds.includes(dep.dependsOnId));

        // Remove dependencies that are no longer needed
        if (dependenciesToRemove.length > 0) {
          await tx.taskDependency.deleteMany({
            where: {
              id: {
                in: dependenciesToRemove.map(dep => dep.id)
              }
            }
          });
          taskLogger.debug({ taskId, removed: dependenciesToRemove.length }, 'removed stale dependencies');
        }

        // Add new dependencies — SAME tx, so the rewrite is all-or-nothing
        if (dependenciesToAdd.length > 0) {
          await this.createDependenciesInTx(tx, taskId, dependenciesToAdd);
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }), 'task.ts:updateTaskDependencies');

      taskLogger.debug({ taskId }, 'updated dependencies');
    } catch (error) {
      taskLogger.error({ err: error, taskId }, 'updateTaskDependencies failed');
      throw error;
    }
  }

  /**
   * Get tasks with full context - N+1 OPTIMIZED VERSION
   * 🔧 PERFORMANCE FIX: Replaces deep includes with strategic selects + batch lookups
   * Expected improvement: 500ms → 150ms (70% reduction)
   */
  static async getTasksWithContext(filters?: {
    povId?: string;
    phaseId?: string;
    stageId?: string;
    assigneeId?: string;
    status?: TaskStatus;
    limit?: number;
    offset?: number;
  }) {
    try {
      const startTime = Date.now();
      taskLogger.debug({ filters }, 'getTasksWithContext starting N+1 optimized query');

      // Build where conditions
      const where: any = {};
      if (filters?.povId) where.povId = filters.povId;
      if (filters?.phaseId) where.phaseId = filters.phaseId;
      if (filters?.stageId) where.stageId = filters.stageId;
      if (filters?.assigneeId) where.assigneeId = filters.assigneeId;
      if (filters?.status) where.status = filters.status;

      // Step 1: Get tasks with minimal data (1 query)
      const tasks = await prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          assigneeId: true,
          teamId: true,
          povId: true,
          phaseId: true,
          stageId: true,
          order: true,
          dueDate: true,
          priority: true,
          status: true,
          type: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          ...taskAgentRuntimeFields,
          agentTemplateId: true,
          mcpContext: true,
          mcpMetadata: true,
          mcpToolId: true,
          mcpWorkflowId: true,
          parentTaskId: true,
        },
        take: filters?.limit || 100,
        skip: filters?.offset || 0,
        orderBy: [
          { phase: { type: 'asc' } },
          { phase: { order: 'asc' } },
          { stage: { order: 'asc' } },
          { order: 'asc' },
          { createdAt: 'asc' }
        ],
      });

      if (tasks.length === 0) {
        const queryTime = Date.now() - startTime;
        taskLogger.debug({ queryTimeMs: queryTime }, 'getTasksWithContext no tasks found');
        return [];
      }

      // Step 2: Batch fetch all related data to avoid N+1
      const taskIds = tasks.map(task => task.id);
      const povIds = [...new Set(tasks.map(task => task.povId).filter(Boolean))] as string[];
      const phaseIds = [...new Set(tasks.map(task => task.phaseId).filter(Boolean))] as string[];
      const stageIds = [...new Set(tasks.map(task => task.stageId).filter(Boolean))] as string[];
      const assigneeIds = [...new Set(tasks.map(task => task.assigneeId).filter(Boolean))] as string[];
      const teamIds = [...new Set(tasks.map(task => task.teamId).filter(Boolean))] as string[];
      const agentTemplateIds = [...new Set(tasks.map(task => task.agentTemplateId).filter(Boolean))] as string[];

      // Batch fetch relationships in parallel (6-8 queries max instead of N+1)
      // FAULT ISOLATION: Per-item .catch() prevents one model failure from losing all enrichment data
      const [povs, phases, stages, assignees, teams, agentTemplates, dependencies, executions, activities] = await Promise.all([
        // POVs batch lookup with minimal owner data
        povIds.length > 0 ? prisma.pOV.findMany({
          where: { id: { in: povIds } },
          select: {
            id: true,
            title: true,
            customerName: true,
            ownerId: true,
            owner: { select: { id: true, name: true, email: true } }
          },
          take: 200,
        }).catch(err => { taskLogger.warn({ err }, 'Batch POV lookup failed — returning empty'); return []; }) : [],

        // Phases batch lookup
        phaseIds.length > 0 ? prisma.phase.findMany({
          where: { id: { in: phaseIds } },
          select: { id: true, name: true, type: true, order: true, povId: true },
          take: 200,
        }).catch(err => { taskLogger.warn({ err }, 'Batch phase lookup failed — returning empty'); return []; }) : [],

        // Stages batch lookup
        stageIds.length > 0 ? prisma.stage.findMany({
          where: { id: { in: stageIds } },
          select: { id: true, name: true, order: true, phaseId: true },
          take: 200,
        }).catch(err => { taskLogger.warn({ err }, 'Batch stage lookup failed — returning empty'); return []; }) : [],

        // Assignees batch lookup
        assigneeIds.length > 0 ? prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true, email: true, role: true, status: true },
          take: 200,
        }).catch(err => { taskLogger.warn({ err }, 'Batch assignee lookup failed — returning empty'); return []; }) : [],

        // Teams batch lookup with member count
        teamIds.length > 0 ? prisma.team.findMany({
          where: { id: { in: teamIds } },
          select: {
            id: true,
            name: true,
            _count: { select: { members: true } }
          },
          take: 200,
        }).catch(err => { taskLogger.warn({ err }, 'Batch team lookup failed — returning empty'); return []; }) : [],

        // Agent templates batch lookup
        agentTemplateIds.length > 0 ? prisma.agentTemplate.findMany({
          where: { id: { in: agentTemplateIds } },
          select: { id: true, name: true, category: true, defaultRole: true },
          take: 200,
        }).catch(err => { taskLogger.warn({ err }, 'Batch template lookup failed — returning empty'); return []; }) : [],

        // Task dependencies batch lookup — use canonical taskDepsSelect shape
        // so id/createdAt/dependsOn.stageId match what TaskEditor and the MCP
        // task.context handler return. Previously this stripped those fields,
        // breaking the cross-stage indicator for any MCP-fetched task list.
        taskIds.length > 0 ? prisma.taskDependency.findMany({
          where: { taskId: { in: taskIds } },
          select: taskDepsSelect.dependencies.select,
          take: 200,
        }).catch(err => { taskLogger.warn({ err }, 'Batch dependency lookup failed — returning empty'); return []; }) : [],

        // Recent executions batch lookup (last 3 per task)
        taskIds.length > 0 ? prisma.agentExecution.findMany({
          where: { taskId: { in: taskIds } },
          select: {
            id: true,
            taskId: true,
            status: true,
            startTime: true,
            endTime: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: taskIds.length * 3 // Limit to avoid excessive data
        }).catch(err => { taskLogger.warn({ err }, 'Batch execution lookup failed — returning empty'); return []; }) : [],

        // Recent activities batch lookup (last 5 per task)
        // Note: Activity model doesn't have taskId, description fields - using TaskActivity instead
        taskIds.length > 0 ? prisma.taskActivity.findMany({
          where: {
            taskId: { in: taskIds },
            action: { in: ['TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_ASSIGNED'] }
          },
          select: {
            id: true,
            taskId: true,
            action: true,
            timestamp: true,
            user: { select: { id: true, name: true } }
          },
          orderBy: { timestamp: 'desc' },
          take: taskIds.length * 5 // Limit to avoid excessive data
        }).catch(err => { taskLogger.warn({ err }, 'Batch activity lookup failed — returning empty'); return []; }) : []
      ]);

      // Step 3: Create lookup maps for O(1) access
      const povMap = new Map(povs.map(p => [p.id, p]));
      const phaseMap = new Map(phases.map(p => [p.id, p]));
      const stageMap = new Map(stages.map(s => [s.id, s]));
      const assigneeMap = new Map(assignees.map(a => [a.id, a]));
      const teamMap = new Map(teams.map(t => [t.id, t]));
      const agentTemplateMap = new Map(agentTemplates.map(t => [t.id, t]));
      
      // Group dependencies by task ID
      const dependenciesMap = new Map<string, (typeof dependencies)[number][]>();
      dependencies.forEach(dep => {
        if (!dependenciesMap.has(dep.taskId)) {
          dependenciesMap.set(dep.taskId, []);
        }
        dependenciesMap.get(dep.taskId)!.push(dep);
      });

      // Group executions by task ID (latest first)
      const executionsMap = new Map<string, (typeof executions)[number][]>();
      executions.forEach(exec => {
        if (!executionsMap.has(exec.taskId)) {
          executionsMap.set(exec.taskId, []);
        }
        executionsMap.get(exec.taskId)!.push(exec);
      });

      // Group activities by task ID (latest first)
      const activitiesMap = new Map<string, (typeof activities)[number][]>();
      activities.forEach(activity => {
        if (activity.taskId && !activitiesMap.has(activity.taskId)) {
          activitiesMap.set(activity.taskId, []);
        }
        if (activity.taskId) {
          activitiesMap.get(activity.taskId)!.push(activity);
        }
      });

      // Step 4: Assemble full context objects
      const tasksWithContext = tasks.map(task => ({
        ...task,
        pov: povMap.get(task.povId || ''),
        phase: phaseMap.get(task.phaseId || ''),
        stage: task.stageId ? stageMap.get(task.stageId) || null : null,
        assignee: assigneeMap.get(task.assigneeId || ''),
        team: teamMap.get(task.teamId || ''),
        agentTemplate: agentTemplateMap.get(task.agentTemplateId || ''),
        dependencies: dependenciesMap.get(task.id) || [],
        recentExecutions: executionsMap.get(task.id)?.slice(0, 3) || [],
        recentActivities: activitiesMap.get(task.id)?.slice(0, 5) || [],
        // Additional context fields
        contextMetadata: {
          hasActiveExecution: executionsMap.get(task.id)?.some(e => e.status === 'RUNNING') || false,
          lastActivity: activitiesMap.get(task.id)?.[0]?.timestamp || task.updatedAt,
          dependencyCount: dependenciesMap.get(task.id)?.length || 0,
          executionCount: executionsMap.get(task.id)?.length || 0
        }
      }));

      const queryTime = Date.now() - startTime;
      taskLogger.info({ taskCount: tasksWithContext.length, queryTimeMs: queryTime }, 'getTasksWithContext N+1 optimized query complete');

      return tasksWithContext;
    } catch (error) {
      taskLogger.error({ err: error }, 'getTasksWithContext failed');
      throw error;
    }
  }

  /**
   * Get task type from data or metadata
   * This handles both the new type field and the legacy metadata.type field
   */
  private static getTaskType(data: Partial<CreateTaskData>): PrismaTaskType {
    // If type is provided directly, use it
    if (data.type) {
      return data.type as PrismaTaskType;
    }
    
    // If metadata.type is provided, convert it to TaskType enum
    if (data.metadata?.type) {
      return stringToTaskType(data.metadata.type);
    }
    
    // Default to ACTION
    return PrismaTaskType.ACTION;
  }

  static async createTask(data: CreateTaskData) {
    const queryTimer = createQueryTimer('TaskService.createTask');
    
    try {
      // Validate assignee if provided
      if (data.assigneeId) {
        const assignee = await prisma.user.findUnique({
          where: { id: data.assigneeId },
        });
        if (!assignee) {
          throw new Error('Invalid assignee');
        }
      }
      
      // Extract dependency IDs
      const { dependencyIds, ...taskData } = data;

      // Get task type from data or metadata
      const taskType = this.getTaskType(data);

      // Calculate the next task order using the same pattern as reorder endpoint
      let nextOrder = 1000; // Default for first task
      
      // Apply atomic transaction pattern for task order calculation (race condition prevention)
      const task: any = await prisma.$transaction(async (tx) => {
        let atomicOrder = 1000; // Default order
        
        if (taskData.stageId) {
          const lastTask = await tx.task.findFirst({
            where: { stageId: taskData.stageId },
            orderBy: { order: 'desc' },
            select: { order: true }
          });
          
          // Use the same pattern as reorder endpoint: (index + 1) * 1000
          atomicOrder = lastTask ? lastTask.order + 1000 : 1000;
          taskLogger.debug({ stageId: taskData.stageId, order: atomicOrder }, 'atomic task order calculated');
        }

        return tx.task.create({
        data: {
          title: taskData.title,
          description: taskData.description || null,
          assigneeId: taskData.assigneeId || null,
          povId: taskData.povId || null,
          phaseId: taskData.phaseId || null,
          stageId: taskData.stageId || null,
          order: atomicOrder, // Set proper order using atomic calculation
          dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
          priority: (taskData.priority || TaskPriority.MEDIUM) as PrismaTaskPriority,
          status: (taskData.status || TaskStatus.OPEN) as PrismaTaskStatus,
          type: taskType, // Use the TaskType enum
          
          // AI-Driven Development Fields
          agentRole: taskData.agentRole,
          agentTemplateId: taskData.agentTemplateId, // CRITICAL FIX: Missing agentTemplateId field
          prompt: taskData.prompt,
          inputContext: taskData.inputContext,
          outputArtifacts: taskData.outputArtifacts,
          executionStatus: taskData.executionStatus as any, // Cast to ExecutionStatus
          agentLog: taskData.agentLog,
          maxRetries: taskData.maxRetries,
          timeout: taskData.timeout,
          
          // Parent-Child Relationship
          parentTaskId: taskData.parentTaskId,
          
          // MCP (Model Context Protocol) Fields
          mcpContext: taskData.mcpContext,
          mcpToolId: taskData.mcpToolId,
          mcpWorkflowId: taskData.mcpWorkflowId,
          mcpMetadata: taskData.mcpMetadata,
          
          // Legacy metadata (remove type from metadata)
          metadata: taskData.metadata ? {
            ...taskData.metadata,
            type: undefined
          } : undefined,
        },
        select: taskFullSelect,
      });
      
      return task; // Return task from atomic transaction
    });

    // Post-creation operations (outside transaction for performance)
    try {
      // Create dependencies if provided
      if (dependencyIds && dependencyIds.length > 0) {
        await this.createTaskDependencies(task.id, dependencyIds);
      }

      // Send notification if task has an assignee
      if (task.assigneeId) {
        await this.sendAssigneeNotification(
          task.id,
          task.assigneeId,
          task.title,
          task.povId
        );
      }

      // Create task activity record using optimized service
      await createTaskActivity({
        userId: task.assigneeId || 'system', // Use assignee or system if no assignee
        taskId: task.id,
        action: `created task "${task.title}"${task.assigneeId ? ` and assigned to ${task.assignee?.name}` : ''}`
      });
    } catch (postCreationError) {
      taskLogger.warn({ err: postCreationError, taskId: task.id }, 'post-creation operations failed, task created successfully');
    }

    // Fetch the task again with dependencies
    const taskWithDependencies = await this.getTask(task.id);
      
      const queryTime = queryTimer.stop();
      taskLogger.info({ taskId: taskWithDependencies?.id, queryTimeMs: queryTime }, 'task created successfully');
      
      return taskWithDependencies;
    } catch (error) {
      queryTimer.stop();
      taskLogger.error({ err: error }, 'createTask failed');
      throw error;
    }
  }

  /**
   * Get tasks for a phase (with optional pagination)
   */
  static async getPhaseTasks(
    phaseId: string,
    pagination?: { limit?: number; offset?: number }
  ) {
    try {
      const where = { phaseId };
      if (pagination) {
        const limit = Math.min(pagination.limit ?? 50, 100);
        const offset = pagination.offset ?? 0;
        const [tasks, total] = await Promise.all([
          prisma.task.findMany({ where, select: taskSelect, orderBy: { createdAt: 'asc' }, take: limit, skip: offset }),
          prisma.task.count({ where }),
        ]);
        return { data: tasks, total };
      }
      return prisma.task.findMany({ where, select: taskSelect, orderBy: { createdAt: 'asc' }, take: 500 });
    } catch (error) {
      taskLogger.error({ err: error, phaseId }, 'getPhaseTasks failed');
      throw error;
    }
  }

  /**
   * Get a single task by ID
   */
  static async getTask(taskId: string) {
    try {
      taskLogger.debug({ taskId }, 'getTask lookup');

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: taskFullSelect,
      });

      taskLogger.debug({ taskId, found: !!task }, 'getTask result');
      
      if (!task) return null;
      return task;
    } catch (error) {
      taskLogger.error({ err: error, taskId }, 'getTask failed');
      throw error;
    }
  }

  /**
   * Update a task
   * @param taskId - The task ID to update
   * @param data - The task data to update
   * @param userId - Optional user ID for activity tracking (defaults to 'system')
   */
  /**
   * BC2 update-data assembly, factored (P2 wave 4 / 3.6) so the non-terminal tx path and the
   * completion core's buildUpdateData seam share ONE definition of the merge semantics.
   * `existingJsonb` supplies the shallow-merge bases (read in the SAME tx as the write — the
   * BC2 atomicity requirement). Pure (no I/O): safe under serialization retry.
   */
  private static assembleUpdateData(
    taskData: Partial<CreateTaskData>,
    // ⚠️ `metadata` is REQUIRED here DELIBERATELY (db-manager consult §5, 2026-08-17): the C5
    // merge below bases on it, and an optional field would let a caller omit it — TypeScript
    // silent, merge base {} — so every write through that caller would FULL-ERASE task.metadata
    // (qualityGate, protocol, pipelineStageId) at exactly the moments that matter. Widening this
    // type is what forces every call site + fallback literal to supply it.
    existingJsonb: { inputContext: unknown; mcpContext: unknown; mcpMetadata: unknown; metadata: unknown }
  ): Record<string, unknown> {
    const taskType = taskData.type !== undefined ? taskData.type as PrismaTaskType : undefined;

    // BC2 helper: shallow-merge a jsonb field with the existing value. `incoming === null` is
    // explicit clear; `incoming === undefined` means "don't touch".
    const mergeJsonbField = (existing: unknown, incoming: unknown): unknown => {
      if (incoming === null) return null;
      const existingObj = (existing as Record<string, unknown> | null) || {};
      const incomingObj = (incoming as Record<string, unknown>) || {};
      return JSON.parse(JSON.stringify({ ...existingObj, ...incomingObj }));
    };

    return {
      ...(taskData.title !== undefined && { title: taskData.title.trim() }),
      ...(taskData.description !== undefined && { description: taskData.description?.trim() || null }),
      ...(taskData.assigneeId !== undefined && { assigneeId: taskData.assigneeId || null }),
      ...(taskData.dueDate !== undefined && { dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null }),
      ...(taskData.priority !== undefined && { priority: taskData.priority as PrismaTaskPriority }),
      ...(taskData.status !== undefined && { status: taskData.status as PrismaTaskStatus }),
      ...(taskType !== undefined && { type: taskType }),
      ...(taskData.stageId !== undefined && { stageId: taskData.stageId || null }),
      ...(taskData.order !== undefined && { order: taskData.order }),
      ...(taskData.agentRole !== undefined && { agentRole: taskData.agentRole }),
      ...(taskData.agentTemplateId !== undefined && { agentTemplateId: taskData.agentTemplateId }),
      ...(taskData.prompt !== undefined && { prompt: taskData.prompt }),
      // BC2 P0 FIX (C1): inputContext shallow-merge
      ...(taskData.inputContext !== undefined && {
        inputContext: mergeJsonbField(existingJsonb.inputContext, taskData.inputContext) as Prisma.InputJsonValue,
      }),
      // BC2 P0 wholesale-by-design (C2): outputArtifacts is the canonical full artifact list.
      ...(taskData.outputArtifacts !== undefined && { outputArtifacts: taskData.outputArtifacts }),
      ...(taskData.executionStatus !== undefined && { executionStatus: taskData.executionStatus as any }),
      ...(taskData.agentLog !== undefined && { agentLog: taskData.agentLog }),
      ...(taskData.maxRetries !== undefined && { maxRetries: taskData.maxRetries }),
      ...(taskData.timeout !== undefined && { timeout: taskData.timeout }),
      ...(taskData.parentTaskId !== undefined && { parentTaskId: taskData.parentTaskId }),
      // BC2 P0 FIX (C3): mcpContext shallow-merge
      ...(taskData.mcpContext !== undefined && {
        mcpContext: mergeJsonbField(existingJsonb.mcpContext, taskData.mcpContext) as Prisma.InputJsonValue,
      }),
      ...(taskData.mcpToolId !== undefined && { mcpToolId: taskData.mcpToolId }),
      ...(taskData.mcpWorkflowId !== undefined && { mcpWorkflowId: taskData.mcpWorkflowId }),
      // BC2 P0 FIX (C4): mcpMetadata shallow-merge
      ...(taskData.mcpMetadata !== undefined && {
        mcpMetadata: mergeJsonbField(existingJsonb.mcpMetadata, taskData.mcpMetadata) as Prisma.InputJsonValue,
      }),
      // BC2 P0 FIX (C5 — WS2 Phase A, 2026-08-17): metadata shallow-merge. This was the ONE
      // JSONB field the original BC2 sweep skipped: replace semantics meant `metadata: {}`
      // erased every platform-owned key (protocol / pipelineStageId / qualityGate /
      // requiresInterfaceContract) with no key written and no error — the WS2 panel's collective
      // headline, and an easier guard self-disable than the title rename it replaced. Semantics
      // now match the MCP handler (same column, previously OPPOSITE semantics per transport).
      //
      // Split strip-keys (db-manager consult §2): `type: undefined` stays INLINE — delete-ALWAYS
      // is the intent (a legacy mirror of the type COLUMN, never read from the row; an own
      // undefined-valued key overwrites-then-drops under merge+serialize, so this still deletes
      // a stale stored copy). `completedWithDependencyOverride` is deleted from the INCOMING
      // copy ONLY — it is the guard-WRITTEN audit fact, and `= undefined` under merge would
      // erase the stored genuine value on every web metadata write (the exact class C5 closes);
      // this also aligns with the three sibling strip sites (put.ts/bulk/MCP handler).
      //
      // Top-level `metadata: null` is a documented NO-OP (WS2 D4), not a clear — the !== null
      // gate keeps it away from mergeJsonbField's null-clear branch.
      //
      // PROTOCOL STAMP GUARD (D3.2): enforceProtocolStampImmutable throws
      // PROTOCOL_STAMP_IMMUTABLE (400) on a differing/novel inbound stamp value and silently
      // drops an equal echo; the merge then preserves the stored stamp by omission.
      ...(taskData.metadata !== undefined && taskData.metadata !== null && (() => {
        const incoming: Record<string, unknown> = { ...taskData.metadata, type: undefined };
        stripAuditFacts(incoming);
        enforceProtocolStampImmutable(
          incoming,
          (existingJsonb.metadata as Record<string, unknown> | null) ?? null,
          (taskData as { id?: string }).id ?? '(update)',
          { surface: 'web-funnel', onViolation: 'throw' }
        );
        // Platform-run-keys panel 2026-08-19 (STALE-CLOBBER axis): editor-class surface — the
        // inbound metadata may be a form-load-time snapshot; run keys are dropped so the run's
        // values govern. Ordering is normative: stamp guard FIRST (forgery still 400s), then
        // the run-key drop, then the merge. See protected-task-metadata.ts header.
        dropPlatformRunKeys(
          incoming,
          (existingJsonb.metadata as Record<string, unknown> | null) ?? null,
          (taskData as { id?: string }).id ?? '(update)',
          { surface: 'web-funnel', warn: (f, m) => taskLogger.warn(f, m) }
        );
        return { metadata: mergeJsonbField(existingJsonb.metadata, incoming) as Prisma.InputJsonValue };
      })()),
    };
  }

  static async updateTask(taskId: string, data: Partial<CreateTaskData>, userId?: string) {
    const queryTimer = createQueryTimer('TaskService.updateTask');

    try {
      // Validate assignee if provided
      if (data.assigneeId) {
        const assignee = await prisma.user.findUnique({
          where: { id: data.assigneeId },
        });
        if (!assignee) {
          throw new Error('Invalid assignee');
        }
      }

      // P2 wave 4 (3.6): TERMINAL transitions route through the completion core BEFORE the tx
      // below (the core owns its own RepeatableRead tx — Prisma cannot nest; the web funnel's
      // six routes + workflowEngine all inherit this in one site). The pre-read is routing
      // only — the core re-reads fresh in-tx and is authoritative.
      if (data.status === 'COMPLETED') {
        const pre = await prisma.task.findUnique({
          where: { id: taskId },
          select: { status: true, type: true, metadata: true, assigneeId: true, priority: true, title: true },
        });
        if (!pre) throw new Error('Task not found');

        if (pre.status !== 'COMPLETED') {
          validateTaskStatusTransition(pre.status, 'COMPLETED');

          // FLIP A (2026-07-24): the interim APPROVAL/PIPELINE reject is GONE — gated types
          // flow through the core like everything else (guards are core-internal), and the
          // web path now FIRES the dependency cascade. GUI gate release is first-class.

          const { dependencyIds: _dropDepsT, ...taskDataT } = data;
          const result = await completeTaskTerminally(prisma, {
            taskId,
            actor: { userId: userId || 'system', source: 'API' },
            fireReactors: true, // FLIP A (2026-07-24): the web funnel fires the cascade
            buildUpdateData: async (tx) => {
              // BC2 atomicity: jsonb merge bases read in the SAME tx as the write.
              const jsonb = await tx.task.findUnique({
                where: { id: taskId },
                // `metadata: true` is LOAD-BEARING (consult §5): without it the C5 merge bases
                // on {} and every terminal completion would silently FULL-ERASE task.metadata.
                select: { inputContext: true, mcpContext: true, mcpMetadata: true, metadata: true },
              });
              const { status: _s, ...rest } = taskDataT;
              return TaskService.assembleUpdateData(
                rest,
                jsonb ?? { inputContext: null, mcpContext: null, mcpMetadata: null, metadata: null }
              );
            },
            include: { assignee: { select: { id: true, name: true, email: true } } },
          });

          // Post-effects (parity with the non-terminal path, MINUS the status significant-change
          // line — the core emits the canonical completion-activity fact).
          if (data.dependencyIds !== undefined) {
            await this.updateTaskDependencies(taskId, data.dependencyIds);
          }
          const coreTask = result.task as { povId?: string | null; title?: string; assignee?: { name?: string } } | null;
          if (data.assigneeId && (!pre.assigneeId || pre.assigneeId !== data.assigneeId)) {
            await this.sendAssigneeNotification(taskId, data.assigneeId, coreTask?.title ?? pre.title, coreTask?.povId ?? null);
          }
          const significantChanges: string[] = [];
          if (data.assigneeId && pre.assigneeId !== data.assigneeId) {
            significantChanges.push(`reassigned task to ${coreTask?.assignee?.name || 'unassigned'}`);
          }
          if (data.priority && pre.priority !== data.priority) {
            significantChanges.push(`changed priority from ${pre.priority} to ${data.priority}`);
          }
          if (data.title && pre.title !== data.title) {
            significantChanges.push(`updated title`);
          }
          if (significantChanges.length > 0) {
            await createTaskActivity({
              userId: userId || 'system',
              taskId,
              action: significantChanges.join(' and ')
            });
          }

          const taskWithDependencies = await this.getTask(taskId);
          const queryTime = queryTimer.stop();
          taskLogger.info({ taskId, queryTimeMs: queryTime, viaCompletionCore: true }, 'task updated successfully');
          return taskWithDependencies;
        }
        // pre.status === 'COMPLETED': same-status re-PATCH falls through to the ordinary tx
        // path below (idempotent re-write — pre-migration parity; no guards, no cascade).
      }

      // BC2 P0 FIX (2026-04-25, candidates C1/C3/C4): wrap read-then-write
      // in a tx so the existing jsonb values used for shallow-merge are
      // atomic with the update. The REST UpdateTaskSchema marks
      // inputContext/mcpContext/mcpMetadata as `.nullable().optional()`
      // (lib/validation/task-validation.ts:208,215,216) — partial PUT
      // values would whole-replace via the prior `taskData.X !== undefined
      // && { X: taskData.X }` shape, clobbering keys the caller didn't pass.
      // outputArtifacts is wholesale-replace-by-design (candidate C2): not in
      // the REST validator; engine paths write the canonical full artifact
      // list at execution-success time.
      // See: bug-class-registry.md BC2 Phase 4 follow-up + cline_docs/reviews/harness-clobber-detection-2026-04-25/
      const { task, existingTask } = await withSerializationRetry(() => prisma.$transaction(async (tx) => {
        // Validate task exists + fetch jsonb fields used for shallow-merge,
        // plus the diff-source fields the post-tx side-effects block at
        // L767-797 reads (assigneeId / priority / title for notification +
        // activity-significance comparison).
        const existingTask = await tx.task.findUnique({
          where: { id: taskId },
          select: {
            status: true,
            // type + metadata: read for the shared terminal guards (P1-C2)
            type: true,
            metadata: true,
            assigneeId: true,
            priority: true,
            title: true,
            inputContext: true,
            mcpContext: true,
            mcpMetadata: true,
          },
        });

        if (!existingTask) {
          throw new Error('Task not found');
        }

        // Validate status transition if status is being changed
        if (data.status && data.status !== existingTask.status) {
          validateTaskStatusTransition(existingTask.status, data.status);
        }

        // Extract dependency IDs
        const { dependencyIds: _dropDeps, ...taskData } = data;

        // P2 wave 4 (3.6): update-data assembly factored into assembleUpdateData — ONE
        // definition shared with the completion core's builder. Terminal transitions never
        // reach this tx (routed to the core above); the P1-C2 in-tx guard block is gone with
        // them. Non-terminal status changes were validated above; same-status COMPLETED
        // re-writes pass through as ordinary updates (pre-migration parity).
        const updateData = TaskService.assembleUpdateData(taskData, existingTask);

        // F2 (2026-07-25): omit an UNCHANGED status from the write. taskCompletedAtExtension
        // stamps completedAt=now on ANY payload containing status:'COMPLETED' and cannot see the
        // row's prior status (it runs at the write, so the pre-image is unavailable). A
        // same-status COMPLETED re-PATCH therefore silently moved completedAt forward, corrupting
        // the exact forensic fact the column exists to provide (schema.prisma:308 — "real
        // completion time vs the updatedAt proxy"). The terminal core is unaffected (its
        // idempotent no-op skips the write entirely); this is the ordinary-update fall-through
        // that same-status re-PATCHes land in. Pinned by test-completion-behavioral B11.
        if (updateData.status !== undefined && updateData.status === existingTask.status) {
          delete updateData.status;
        }

        taskLogger.debug({ taskId, fieldCount: Object.keys(updateData).length }, 'updateTask applying changes');

        const updatedTask = await tx.task.update({
          where: { id: taskId },
          data: updateData,
          select: taskFullSelect,
        });
        return { task: updatedTask, existingTask };
        // TS4 / BC19 (2026-06-08): RepeatableRead is what makes this read-modify-write
        // lost-update SAFE — a concurrent writer to this row aborts with 40001 (loud), it
        // does NOT silently clobber. A plain `$transaction` (READ COMMITTED) would NOT
        // prevent lost-update. Do not "downgrade" the isolation. See bug-class BC19 /
        // transaction-atomicity-pattern.md "Read-Then-Write Race Protection".
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }), 'task.ts:updateTask');

      // Update dependencies if provided (outside tx — same as pre-fix shape;
      // dependencies are a separate concern from the task row itself)
      if (data.dependencyIds !== undefined) {
        await this.updateTaskDependencies(taskId, data.dependencyIds);
      }

      // Send notification if assignee was added or changed
      if (data.assigneeId && (!existingTask.assigneeId || existingTask.assigneeId !== data.assigneeId)) {
        await this.sendAssigneeNotification(
          task.id,
          data.assigneeId,
          task.title,
          task.povId
        );
      }

      // Create task activity for significant changes
      const significantChanges: string[] = [];
      if (data.status && existingTask.status !== data.status) {
        significantChanges.push(`changed status from ${existingTask.status} to ${data.status}`);
      }
      if (data.assigneeId && existingTask.assigneeId !== data.assigneeId) {
        significantChanges.push(`reassigned task to ${task.assignee?.name || 'unassigned'}`);
      }
      if (data.priority && existingTask.priority !== data.priority) {
        significantChanges.push(`changed priority from ${existingTask.priority} to ${data.priority}`);
      }
      if (data.title && existingTask.title !== data.title) {
        significantChanges.push(`updated title`);
      }

      if (significantChanges.length > 0) {
        await createTaskActivity({
          userId: userId || 'system',
          taskId: task.id,
          action: significantChanges.join(' and ')
        });
      }

      // Fetch the task again with updated dependencies
      const taskWithDependencies = await this.getTask(taskId);
      
      const queryTime = queryTimer.stop();
      taskLogger.info({ taskId, queryTimeMs: queryTime }, 'task updated successfully');
      
      return taskWithDependencies;
    } catch (error) {
      queryTimer.stop();
      taskLogger.error({ err: error, taskId }, 'updateTask failed');
      // F4 (2026-07-25): typed. This site was NOT in the residuals charter's 5-site list — the
      // repo sweep found 6 consumers, and a missed re-throw arm here would have re-wrapped a
      // transition error as a generic 500 at the service layer.
      if (error instanceof InvalidTransitionError) {
        throw error; // Re-throw transition errors as-is for clear messaging
      }
      if (error instanceof Error) {
        if (error.message.includes('Record to update not found')) {
          throw new Error('Task not found');
        }
        if (error.message.includes('Unique constraint failed')) {
          throw new Error('Task with this title already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete a task
   */
  static async deleteTask(taskId: string) {
    try {
      await prisma.task.delete({
        where: { id: taskId },
      });
    } catch (error) {
      taskLogger.error({ err: error, taskId }, 'deleteTask failed');
      throw error;
    }
  }

  /**
   * Get available assignees for a task
   */
  static async getAvailableAssignees(teamId: string) {
    try {
      const teamMembers = await prisma.teamMember.findMany({
        where: {
          teamId,
          user: { role: { notIn: NON_SELECTABLE_ROLES }, email: { not: { endsWith: SYSTEM_ACCOUNT_EMAIL_SUFFIX } } }, // 2026-05-27 + 2026-06-04: exclude demo/super-admin roles AND @paichart.system service accounts
        },
        include: {
          user: {
            select: userSelect,
          },
        },
      });

      // Filter active users and map to user list
      return teamMembers
        .filter(member => member.user.status === 'ACTIVE')
        .map(member => member.user);
    } catch (error) {
      taskLogger.error({ err: error, teamId }, 'getAvailableAssignees failed');
      throw error;
    }
  }
}
