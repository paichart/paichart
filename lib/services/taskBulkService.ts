import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { taskLogger } from '@/lib/logger';
import { enforceProtocolStampImmutable, dropPlatformRunKeys, stripAuditFacts } from '@/lib/tasks/services/protected-task-metadata';
import { validateTaskStatusTransition } from '@/lib/tasks/services/status-transitions';
import { completeTaskTerminally } from '@/lib/tasks/services/complete-task-terminally';
import {
  logFieldChange,
  logTaskAssignment,
  logPhaseChange,
  logStageChange,
  TaskActivityAction,
} from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';

export interface BulkUpdateOptions {
  validatePermissions?: boolean;
  skipValidation?: boolean;
  continueOnError?: boolean;
  logActivity?: boolean;
  batchSize?: number;
  timeout?: number;
}

export interface BulkUpdateResult {
  operationId: string;
  totalTasks: number;
  successfulUpdates: number;
  failedUpdates: number;
  errors: Array<{
    taskId: string;
    error: string;
    code?: string;
  }>;
  updatedTasks: any[];
  summary: {
    duration: number;
    batchesProcessed: number;
    averageTimePerTask: number;
  };
}

export interface BulkAssignResult {
  operationId: string;
  totalTasks: number;
  successfulAssignments: number;
  failedAssignments: number;
  errors: Array<{
    taskId: string;
    error: string;
    code?: string;
  }>;
  assignedTasks: any[];
  summary: {
    duration: number;
    batchesProcessed: number;
    averageTimePerTask: number;
  };
}

export interface BulkMoveResult {
  operationId: string;
  totalTasks: number;
  successfulMoves: number;
  failedMoves: number;
  errors: Array<{
    taskId: string;
    error: string;
    code?: string;
  }>;
  movedTasks: any[];
  summary: {
    duration: number;
    batchesProcessed: number;
    averageTimePerTask: number;
  };
}

export class TaskBulkService {
  /**
   * Bulk update tasks with validation and error handling
   */
  static async bulkUpdateTasks(params: {
    taskIds: string[];
    updates: any;
    options?: BulkUpdateOptions;
    userId: string;
  }): Promise<BulkUpdateResult> {
    const startTime = Date.now();
    const operationId = `bulk-update-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    
    const {
      taskIds,
      updates,
      options = {},
      userId
    } = params;

    const {
      validatePermissions = true,
      skipValidation = false,
      continueOnError = true,
      logActivity = true,
      batchSize = 50,
      timeout = 30000
    } = options;

    const result: BulkUpdateResult = {
      operationId,
      totalTasks: taskIds.length,
      successfulUpdates: 0,
      failedUpdates: 0,
      errors: [],
      updatedTasks: [],
      summary: {
        duration: 0,
        batchesProcessed: 0,
        averageTimePerTask: 0
      }
    };

    try {
      // Validate tasks exist and user has permissions
      if (validatePermissions && !skipValidation) {
        const existingTasks = await prisma.task.findMany({
          where: {
            id: { in: taskIds }
          },
          select: {
            id: true,
            assigneeId: true,
            teamId: true,
            povId: true
          },
          take: 200,
        });

        const existingTaskIds = existingTasks.map(t => t.id);
        const missingTaskIds = taskIds.filter(id => !existingTaskIds.includes(id));

        if (missingTaskIds.length > 0) {
          missingTaskIds.forEach(taskId => {
            result.errors.push({
              taskId,
              error: 'Task not found',
              code: 'NOT_FOUND'
            });
          });
          result.failedUpdates += missingTaskIds.length;
        }
      }

      // Process tasks in batches
      let validTaskIds = taskIds.filter(id =>
        !result.errors.some(error => error.taskId === id)
      );

      // P2 wave 3 (TD4/TD7): terminal bulk runs per-row through the completion core, so rows
      // COMMIT independently — a dependent listed before its in-batch dependency would
      // deterministically dep-block (cuid order does NOT respect dependency order). Sort the
      // FULL id list topologically over the induced dependency subgraph (taskId tie-break)
      // BEFORE batch-splitting (a per-batch sort silently fails for pairs split across batches).
      if (updates.status === 'COMPLETED' && validTaskIds.length > 1) {
        validTaskIds = await this.topoSortByInducedDeps(validTaskIds);
      }

      const batches = this.createBatches(validTaskIds, batchSize);
      
      for (const batch of batches) {
        try {
          const batchResult = await this.processBatch(
            batch,
            updates,
            userId,
            logActivity,
            operationId
          );

          result.successfulUpdates += batchResult.successful.length;
          result.failedUpdates += batchResult.failed.length;
          result.updatedTasks.push(...batchResult.successful);
          result.errors.push(...batchResult.errors);
          result.summary.batchesProcessed++;

        } catch (batchError) {
          if (!continueOnError) {
            throw batchError;
          }

          // Log batch failure and continue
          batch.forEach(taskId => {
            result.errors.push({
              taskId,
              error: `Batch processing failed: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`,
              code: 'BATCH_ERROR'
            });
          });
          result.failedUpdates += batch.length;
        }
      }

      // Calculate summary
      const endTime = Date.now();
      result.summary.duration = endTime - startTime;
      result.summary.averageTimePerTask = result.totalTasks > 0 
        ? result.summary.duration / result.totalTasks 
        : 0;

      return result;

    } catch (error) {
      taskLogger.error({ err: error, operationId }, 'bulkUpdateTasks failed');
      throw error;
    }
  }

  /**
   * Bulk assign tasks to users or teams
   */
  static async bulkAssignTasks(params: {
    taskIds: string[];
    assigneeId?: string;
    teamId?: string;
    options?: BulkUpdateOptions;
    userId: string;
  }): Promise<BulkAssignResult> {
    const startTime = Date.now();
    const operationId = `bulk-assign-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    
    const {
      taskIds,
      assigneeId,
      teamId,
      options = {},
      userId
    } = params;

    if (!assigneeId && !teamId) {
      throw new Error('Either assigneeId or teamId must be provided');
    }

    const updates = {
      assigneeId,
      teamId,
      updatedAt: new Date()
    };

    // Use the bulk update functionality
    const updateResult = await this.bulkUpdateTasks({
      taskIds,
      updates,
      options,
      userId
    });

    // Transform result to assignment-specific format
    const result: BulkAssignResult = {
      operationId,
      totalTasks: updateResult.totalTasks,
      successfulAssignments: updateResult.successfulUpdates,
      failedAssignments: updateResult.failedUpdates,
      errors: updateResult.errors,
      assignedTasks: updateResult.updatedTasks,
      summary: updateResult.summary
    };

    // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
    if (options.logActivity !== false && result.successfulAssignments > 0) {
      const apiMetadata: ActivityMetadata = { source: 'API' };
      for (const task of result.assignedTasks) {
        if (assigneeId) {
          logTaskAssignment(task.id, userId, {
            id: assigneeId,
            name: task.assignee?.name || 'Unknown',
          }, null, apiMetadata);
        }
        if (teamId) {
          logFieldChange(task.id, userId, {
            name: 'teamId',
            oldValue: null,
            newValue: teamId,
            action: TaskActivityAction.UPDATED,
          }, apiMetadata);
        }
      }
    }

    return result;
  }

  /**
   * Bulk move tasks between phases
   */
  static async bulkMoveTasks(params: {
    taskIds: string[];
    targetPhaseId: string;
    options?: BulkUpdateOptions;
    userId: string;
  }): Promise<BulkMoveResult> {
    const startTime = Date.now();
    const operationId = `bulk-move-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const {
      taskIds,
      targetPhaseId,
      options = {},
      userId
    } = params;

    // Validate target phase exists
    const targetPhase = await prisma.phase.findUnique({
      where: { id: targetPhaseId },
      select: { id: true, name: true, povId: true }
    });

    if (!targetPhase) {
      throw new Error('Target phase not found');
    }

    // 🎯 RICH ACTIVITY LOGGING: Capture old phase info before update
    // This enables proper phase transition display in timeline
    const oldPhaseMap = new Map<string, { id: string; name: string }>();
    if (options.logActivity !== false) {
      const tasksWithPhases = await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: {
          id: true,
          phase: { select: { id: true, name: true } }
        },
        take: 200,
      });
      for (const task of tasksWithPhases) {
        if (task.phase) {
          oldPhaseMap.set(task.id, task.phase);
        }
      }
    }

    const updates = {
      phaseId: targetPhaseId,
      updatedAt: new Date()
    };

    // Use the bulk update functionality
    const updateResult = await this.bulkUpdateTasks({
      taskIds,
      updates,
      options: { ...options, logActivity: false }, // We'll handle activity logging here
      userId
    });

    // Transform result to move-specific format
    const result: BulkMoveResult = {
      operationId,
      totalTasks: updateResult.totalTasks,
      successfulMoves: updateResult.successfulUpdates,
      failedMoves: updateResult.failedUpdates,
      errors: updateResult.errors,
      movedTasks: updateResult.updatedTasks,
      summary: updateResult.summary
    };

    // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
    // Updated 2026-01-05: Use logPhaseChange with phase names for rich timeline
    // BC33 FIX: Wrapped in try/catch — activity logging must not throw after successful transaction
    if (result.successfulMoves > 0) {
      try {
        const apiMetadata: ActivityMetadata = { source: 'API' };
        for (const task of result.movedTasks) {
          const oldPhase = oldPhaseMap.get(task.id);
          logPhaseChange(task.id, userId, {
            oldPhaseId: oldPhase?.id,
            oldPhaseName: oldPhase?.name,
            newPhaseId: targetPhaseId,
            newPhaseName: targetPhase.name,
          }, apiMetadata);
        }
      } catch (activityError) {
        taskLogger.error({ err: activityError }, 'Failed to log bulk move activity (data saved successfully)');
      }
    }

    return result;
  }

  /**
   * Topological sort of the batch over its INDUCED dependency subgraph (Kahn; taskId tie-break
   * for determinism). P2 wave 3 (TD4): guarantees an in-batch dependency's per-row tx COMMITS
   * before its dependent's guard reads the edge. The full-graph DAG invariant (cycle-checked at
   * edge write) makes this total; a residual cycle falls back to taskId order (defensive).
   */
  private static async topoSortByInducedDeps(taskIds: string[]): Promise<string[]> {
    const idSet = new Set(taskIds);
    const edges = await prisma.taskDependency.findMany({
      where: { taskId: { in: taskIds }, dependsOnId: { in: taskIds } },
      select: { taskId: true, dependsOnId: true },
    });
    if (edges.length === 0) return [...taskIds].sort();

    const indegree = new Map<string, number>(taskIds.map((id) => [id, 0]));
    const dependents = new Map<string, string[]>();
    for (const e of edges) {
      indegree.set(e.taskId, (indegree.get(e.taskId) ?? 0) + 1);
      const list = dependents.get(e.dependsOnId) ?? [];
      list.push(e.taskId);
      dependents.set(e.dependsOnId, list);
    }
    const ready = [...idSet].filter((id) => (indegree.get(id) ?? 0) === 0).sort();
    const out: string[] = [];
    while (ready.length > 0) {
      const id = ready.shift()!;
      out.push(id);
      for (const dep of (dependents.get(id) ?? []).sort()) {
        const d = (indegree.get(dep) ?? 0) - 1;
        indegree.set(dep, d);
        if (d === 0) ready.push(dep);
      }
      ready.sort();
    }
    if (out.length !== taskIds.length) {
      taskLogger.warn({ sorted: out.length, total: taskIds.length }, 'bulk topo-sort residual cycle — falling back to id order for the remainder');
      for (const id of [...idSet].sort()) if (!out.includes(id)) out.push(id);
    }
    return out;
  }

  /**
   * P2 wave 3 (3.5): terminal bulk rows run PER-ROW through the completion core — each row's
   * guards + CAS write commit in their OWN RepeatableRead tx (dissolves the poisoned-tx
   * false-success defect for this path; retry amplification is per-row). fireReactors stays
   * FALSE (THREADED — Flip B turns the bulk cascade on as a post-batch coalesced pass).
   * APPROVAL/PIPELINE rows keep the P1 signal ordering: guards first (true reason), then the
   * interim reject — they do NOT reach the core until Flip B.
   */
  private static async processTerminalBatch(
    taskIds: string[],
    updates: any,
    userId: string,
    logActivity: boolean,
    operationId: string
  ) {
    const successful: any[] = [];
    const failed: string[] = [];
    const errors: Array<{ taskId: string; error: string; code?: string }> = [];
    const include = {
      assignee: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      pov: { select: { id: true, title: true } },
    };
    const { status: _status, ...nonStatusUpdates } = updates ?? {};
    const transitionedFacts: Array<{ taskId: string; taskType: string; stageId: string | null }> = [];

    for (const taskId of taskIds) {
      try {
        const existing = await prisma.task.findUnique({
          where: { id: taskId },
          select: { status: true, type: true, metadata: true },
        });
        if (!existing) throw new Error(`Task not found: ${taskId}`);

        if (existing.status === 'COMPLETED') {
          // Parity with the pre-migration shape: a same-status bulk write still applies the
          // non-status fields (ordinary update — no transition, no guards, no cascade).
          const task = await prisma.task.update({
            where: { id: taskId },
            data: { ...nonStatusUpdates, updatedAt: new Date() },
            include,
          });
          successful.push(task);
          continue;
        }

        // FLIP B (2026-07-24): the interim APPROVAL/PIPELINE reject is GONE — all types flow
        // through the core (guards internal; typed errors surface as per-row codes). NO
        // override on bulk remains the rule (TD3).

        const r = await completeTaskTerminally(prisma, {
          taskId,
          actor: { userId, source: 'BULK' },
          // Per-row tail stays OFF by design — FLIP B fires the coalesced POST-BATCH fan-out
          // below instead (retrigger deduped by stage; TaskReady sequential with F9 per task).
          fireReactors: false,
          buildUpdateData: async (tx) => {
            // WS2 Phase A (C5 sibling): terminal bulk metadata merges over the stored row too.
            if (nonStatusUpdates?.metadata && typeof nonStatusUpdates.metadata === 'object') {
              const metaRow = await tx.task.findUnique({ where: { id: taskId }, select: { metadata: true } });
              return {
                ...nonStatusUpdates,
                metadata: { ...((metaRow?.metadata as Record<string, unknown> | null) ?? {}), ...(nonStatusUpdates.metadata as Record<string, unknown>) },
              };
            }
            return nonStatusUpdates;
          },
          include,
        });
        successful.push(r.task);
        if (r.transitioned && r.task) {
          transitionedFacts.push({
            taskId,
            taskType: r.taskType,
            stageId: (r.task as { stageId?: string | null }).stageId ?? null,
          });
        }
      } catch (taskError) {
        failed.push(taskId);
        errors.push({
          taskId,
          error: taskError instanceof Error ? taskError.message : 'Update failed',
          code: (taskError as { code?: string })?.code || 'UPDATE_ERROR',
        });
      }
    }

    if (logActivity && successful.length > 0) {
      try {
        const apiMetadata: ActivityMetadata = { source: 'API' };
        for (const task of successful) {
          logFieldChange(task.id, userId, {
            name: 'bulk_update',
            oldValue: null,
            newValue: updates,
            action: TaskActivityAction.UPDATED,
          }, apiMetadata);
        }
      } catch (activityError) {
        taskLogger.error({ err: activityError }, 'Failed to log bulk terminal-update activity (data saved successfully)');
      }
    }

    // FLIP B (2026-07-24): the coalesced POST-BATCH fan-out — fires ONLY from the committed
    // transitioned set, AFTER every per-row tx has resolved (never interleaved mid-batch).
    // Retrigger is DEDUPED BY STAGE (every retrigger guard keys off the completed child's
    // stageId — 100 same-stage children ⇒ 1 call, killing the herd's worst cost); TaskReady
    // runs per-task SEQUENTIALLY (pool-friendly) with the F9 deferral per task — both via the
    // core's single-copy fireCompletionReactors. Fire-and-forget: never blocks the response.
    if (transitionedFacts.length > 0) {
      (async () => {
        const { fireCompletionReactors } = await import('@/lib/tasks/services/complete-task-terminally');
        const stagesFired = new Set<string>();
        for (const fact of transitionedFacts) {
          const isStageRep = fact.stageId !== null && !stagesFired.has(fact.stageId);
          if (isStageRep) stagesFired.add(fact.stageId!);
          await fireCompletionReactors(prisma, {
            taskId: fact.taskId,
            taskType: fact.taskType,
            retrigger: isStageRep || fact.stageId === null,
          });
        }
        taskLogger.info(
          { operationId, transitioned: transitionedFacts.length, retriggerStages: stagesFired.size },
          'FLIP B bulk fan-out complete (stage-deduped retrigger + sequential TaskReady)'
        );
      })().catch((e) => {
        taskLogger.error({ operationId, err: e instanceof Error ? e.message : String(e) }, 'bulk fan-out failed (rows committed; reactors idempotent — safe to re-fire)');
      });
    }

    return { successful, failed, errors };
  }

  /**
   * Process a batch of task updates
   */
  private static async processBatch(
    taskIds: string[],
    updates: any,
    userId: string,
    logActivity: boolean,
    operationId: string
  ) {
    // TD6 (P1-C2; ORDER FIXED wave-3 audit): the completedWithDependencyOverride audit fact is
    // writable ONLY by the guard path — strip a forged copy from inbound bulk metadata BEFORE
    // any branch. (The wave-3 terminal delegation initially sat ABOVE this strip, leaving the
    // terminal path — the one that matters — strip-free; caught in the checkbox audit,
    // regression-pinned by behavioral B8.)
    if (updates?.metadata && typeof updates.metadata === 'object') {
      stripAuditFacts(updates.metadata as Record<string, unknown>,
        (f, m) => taskLogger.warn({ ...f, operationId, userId }, m));
    }

    // WS2 Phase A (2026-08-17, D3.2): platform stamp keys are never bulk-writable. existing=null
    // deliberately: a single payload applied to MANY tasks cannot be a per-task echo, so any
    // presence is a forge/change attempt -> clean 400 (PROTOCOL_STAMP_IMMUTABLE).
    if (updates?.metadata && typeof updates.metadata === 'object') {
      enforceProtocolStampImmutable(updates.metadata as Record<string, unknown>, null, taskIds[0] ?? '(bulk)', {
        surface: 'bulk-update',
        onViolation: 'throw',
      });
      // Platform-run-keys panel 2026-08-19: ONE payload fanned to MANY tasks can never be a
      // legitimate per-task run write (the harness writes via MCP task.update only) — drop,
      // warn-on-differ (existing=null ⇒ any presence warns once).
      dropPlatformRunKeys(updates.metadata as Record<string, unknown>, null, taskIds[0] ?? '(bulk)', {
        surface: 'bulk-update', warn: (f, m) => taskLogger.warn({ ...f, operationId, userId }, m),
      });
    }

    // P2 wave 3: terminal bulk goes per-row through the completion core; the batch-tx shape
    // below serves NON-terminal updates only.
    if (updates?.status === 'COMPLETED') {
      return this.processTerminalBatch(taskIds, updates, userId, logActivity, operationId);
    }

    const successful: any[] = [];
    const failed: string[] = [];
    const errors: Array<{ taskId: string; error: string; code?: string }> = [];

    try {
      // Perform batch update
      const updatedTasks = await prisma.$transaction(async (tx) => {
        const tasks = [];

        for (const taskId of taskIds) {
          try {
            // P1-C2 (E2 close), narrowed at P2 wave 3: this batch-tx path serves NON-terminal
            // updates only (COMPLETED routes through processTerminalBatch above) — the state
            // machine still validates every remaining status change per row. JS-level throws
            // don't poison the interactive tx.
            if (updates.status) {
              const existing = await tx.task.findUnique({
                where: { id: taskId },
                select: { status: true },
              });
              if (!existing) {
                throw new Error(`Task not found: ${taskId}`);
              }
              if (updates.status !== existing.status) {
                validateTaskStatusTransition(existing.status, updates.status);
              }
            }

            // WS2 Phase A (C5 sibling): metadata merges over the stored row — a bulk metadata
            // write must not erase platform keys (protocol/pipelineStageId/qualityGate) on
            // every task in the batch by omission.
            let rowData: Record<string, unknown> = { ...updates, updatedAt: new Date() };
            if (updates?.metadata && typeof updates.metadata === 'object') {
              const metaRow = await tx.task.findUnique({ where: { id: taskId }, select: { metadata: true } });
              rowData.metadata = { ...((metaRow?.metadata as Record<string, unknown> | null) ?? {}), ...(updates.metadata as Record<string, unknown>) };
            }
            const task = await tx.task.update({
              where: { id: taskId },
              data: rowData as any,
              include: {
                assignee: { select: { id: true, name: true, email: true } },
                team: { select: { id: true, name: true } },
                phase: { select: { id: true, name: true } },
                pov: { select: { id: true, title: true } }
              }
            });
            
            tasks.push(task);
            successful.push(task);
            
          } catch (taskError) {
            failed.push(taskId);
            errors.push({
              taskId,
              error: taskError instanceof Error ? taskError.message : 'Update failed',
              // P1-C2: surface typed guard codes per row (facts — DEPENDENCY_NOT_SATISFIED,
              // PIPELINE_INVARIANT) instead of the generic UPDATE_ERROR.
              code: (taskError as { code?: string })?.code || 'UPDATE_ERROR'
            });
          }
        }

        return tasks;
      });

      // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
      // Log activities after transaction completes (fire-and-forget)
      // BC33 FIX: Wrapped in try/catch — activity logging must not throw after successful transaction
      if (logActivity && successful.length > 0) {
        try {
          const apiMetadata: ActivityMetadata = { source: 'API' };
          for (const task of successful) {
            logFieldChange(task.id, userId, {
              name: 'bulk_update',
              oldValue: null,
              newValue: updates,
              action: TaskActivityAction.UPDATED,
            }, apiMetadata);
          }
        } catch (activityError) {
          taskLogger.error({ err: activityError }, 'Failed to log bulk update activity (data saved successfully)');
        }
      }

      return { successful, failed, errors };

    } catch (error) {
      // If transaction fails, mark all as failed
      taskIds.forEach(taskId => {
        failed.push(taskId);
        errors.push({
          taskId,
          error: error instanceof Error ? error.message : 'Transaction failed',
          code: 'TRANSACTION_ERROR'
        });
      });

      return { successful, failed, errors };
    }
  }

  /**
   * Create batches from array of task IDs
   */
  private static createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

}
