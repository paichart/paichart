import { prisma } from "@/lib/prisma"
import { withSerializationRetry } from "@/lib/database/serialization-retry"
import { Phase, PhaseTemplate, PhaseType, Prisma, StageStatus } from "@prisma/client"
import { PhaseTemplateCreateInput, PhaseTemplateUpdateInput, WorkflowStage, PhaseDetails } from "../types/phase"
import { povLogger } from "@/lib/logger"
import { logStageFieldChange, TaskActivityAction } from "./stageActivityService"

const localLogger = povLogger.child({ module: 'PhaseService' })

const defaultPhaseDetails: PhaseDetails = {
  tasks: [],
  metadata: {},
}

export interface CreateStageInput {
  name: string;
  description?: string;
  order: number;
  status?: StageStatus;
  metadata?: Record<string, any>;
}

export interface UpdateStageInput {
  name?: string;
  description?: string;
  status?: StageStatus;
  order?: number;
  metadata?: Record<string, any>;
}

export class PhaseService {
  async getTemplates() {
    return prisma.phaseTemplate.findMany({
      take: 100,
    })
  }

  async getTemplate(id: string) {
    return prisma.phaseTemplate.findUnique({
      where: { id },
    })
  }

  async createTemplate(data: PhaseTemplateCreateInput) {
    return prisma.phaseTemplate.create({
      data: {
        ...data,
        workflow: data.workflow as Prisma.JsonObject,
      },
    })
  }

  async updateTemplate(id: string, data: PhaseTemplateUpdateInput) {
    return prisma.phaseTemplate.update({
      where: { id },
      data: {
        ...data,
        workflow: data.workflow ? (data.workflow as Prisma.JsonObject) : undefined,
      },
    })
  }

  async deleteTemplate(id: string) {
    return prisma.phaseTemplate.delete({
      where: { id },
    })
  }

  async getWorkflows() {
    const templates = await prisma.phaseTemplate.findMany({
      where: {
        isDefault: true,
      },
      take: 100,
    })

    // Group templates by type and extract workflow stages
    const workflowsByType = templates.reduce((acc, template) => {
      if (!acc[template.type]) {
        const workflow = template.workflow as { stages: WorkflowStage[] }
        acc[template.type] = {
          type: template.type,
          stages: workflow?.stages || [],
        }
      }
      return acc
    }, {} as Record<PhaseType, { type: PhaseType; stages: WorkflowStage[] }>)

    // Ensure all phase types have a workflow, even if empty
    Object.values(PhaseType).forEach((type) => {
      if (!workflowsByType[type]) {
        workflowsByType[type] = {
          type,
          stages: [],
        }
      }
    })

    return Object.values(workflowsByType)
  }

  async updateWorkflow(type: PhaseType, stages: WorkflowStage[]) {
    // Find or create default template for this phase type
    let template = await prisma.phaseTemplate.findFirst({
      where: {
        type,
        isDefault: true,
      },
    })

    if (template) {
      // Update existing template
      return prisma.phaseTemplate.update({
        where: { id: template.id },
        data: {
          workflow: {
            stages,
          } as Prisma.JsonObject,
        },
      })
    } else {
      // Create new default template
      return prisma.phaseTemplate.create({
        data: {
          name: `Default ${type} Template`,
          type,
          isDefault: true,
          workflow: {
            stages,
          } as Prisma.JsonObject,
        },
      })
    }
  }

  async getPhase(id: string) {
    const phase = await prisma.phase.findUnique({
      where: { id },
      include: {
        template: true,
      },
    })

    if (!phase) return null

    const details = phase.details ? JSON.parse(JSON.stringify(phase.details)) as PhaseDetails : defaultPhaseDetails

    return {
      ...phase,
      details,
    }
  }

  async getPoVPhases(povId: string) {
    const phases = await prisma.phase.findMany({
      where: { povId },
      include: {
        template: true,
      },
      // Don't order in database - we'll sort in JavaScript for logical ordering
      take: 50,
    })

    // FIXED: Sort phases logically (PLANNING → EXECUTION → REVIEW) then by order
    const typeOrder = { PLANNING: 0, EXECUTION: 1, REVIEW: 2 };
    
    const sortedPhases = phases.sort((a, b) => {
      // First sort by logical type order
      const aTypeOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 999;
      const bTypeOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 999;
      
      if (aTypeOrder !== bTypeOrder) {
        return aTypeOrder - bTypeOrder;
      }
      
      // Then sort by order within the same type
      return (a.order || 0) - (b.order || 0);
    });

    return sortedPhases.map(phase => ({
      ...phase,
      details: phase.details ? JSON.parse(JSON.stringify(phase.details)) as PhaseDetails : defaultPhaseDetails,
    }))
  }

  async createPhase(data: {
    povId: string;
    templateId?: string | null;
    name: string;
    description: string;
    startDate: Date;
    endDate: Date;
    order: number;
    type?: PhaseType;
    details?: PhaseDetails;
  }) {
    const details = data.details || defaultPhaseDetails

    return prisma.phase.create({
      data: {
        ...data,
        type: data.type || PhaseType.PLANNING,
        details: JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue,
      },
      include: {
        template: true,
        tasks: true,
        pov: {
          include: {
            owner: true,
            team: {
              include: {
                members: {
                  include: {
                    user: true
                  }
                }
              }
            }
          }
        }
      },
    })
  }

  async updatePhase(id: string, data: {
    name?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    details?: PhaseDetails;
  }) {
    const currentPhase = await this.getPhase(id)
    if (!currentPhase) throw new Error("Phase not found")

    const details = data.details || currentPhase.details

    return prisma.phase.update({
      where: { id },
      data: {
        ...data,
        details: JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue,
      },
      include: {
        template: true,
      },
    })
  }

  async deletePhase(id: string) {
    return prisma.phase.delete({
      where: { id },
    })
  }

  async reorderPhases(povId: string, phaseIds: string[], order: number[]) {
    if (phaseIds.length !== order.length) {
      throw new Error("Phase IDs and order arrays must have the same length")
    }

    // BC14/BC19 (2026-06-09): Serializable + FOR UPDATE NOWAIT can abort (40001) / fail-fast (55P03) under a
    // concurrent reorder — retry instead of erroring the user. No accumulators here; post-tx is a pure read.
    await withSerializationRetry(() => prisma.$transaction(async (tx) => {
      // Lock all phases in this POV to prevent concurrent reorder
      await tx.$executeRaw`
        SELECT id FROM "Phase"
        WHERE "povId" = ${povId}
        FOR UPDATE NOWAIT
      `;

      // Update order of each phase sequentially within transaction
      for (let i = 0; i < phaseIds.length; i++) {
        await tx.phase.update({
          where: { id: phaseIds[i] },
          data: { order: order[i] },
        });
      }
    }, {
      isolationLevel: 'Serializable',
      timeout: 10000
    }), 'phase.ts:reorderPhases');

    return this.getPoVPhases(povId)
  }

  // Stage Management
  async getStages(phaseId: string) {
    return prisma.stage.findMany({
      where: { phaseId },
      include: {
        tasks: {
          orderBy: {
            order: 'asc',
          },
          take: 100, // Safety cap
        },
      },
      orderBy: {
        order: 'asc',
      },
    })
  }

  async getStage(id: string) {
    return prisma.stage.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: {
            order: 'asc',
          },
        },
      },
    })
  }

  async createStage(phaseId: string, data: CreateStageInput) {
    // Filter out phaseId from data to prevent field leakage
    // phaseId parameter is source of truth
    const { phaseId: _, ...safeData } = data as any;

    return prisma.stage.create({
      data: {
        ...safeData,
        phaseId,  // Parameter (source of truth)
        status: data.status || StageStatus.PENDING,
        metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) as Prisma.InputJsonValue : undefined,
      },
      include: {
        tasks: true,
      },
    })
  }

  async updateStage(id: string, data: UpdateStageInput, userId?: string) {
    // BC2 P0 FIX (2026-04-25): shallow-merge metadata so callers can add keys
    // without clobbering existing ones. Prior implementation used whole-replace
    // via `data.metadata || currentStage.metadata`, which silently dropped any
    // keys the caller didn't include — same bug class as task.metadata had
    // pre-BC19. Mirrors lib/mcp/tasks/action/handlers/task/task-update-handler.ts:503.
    // RepeatableRead matches the prior BC19 site at this same method.
    // See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
    //
    // Phase 2 stage_activities (2026-04-26): userId is optional. The method
    // currently has no production callers (REST/MCP paths use direct prisma
    // calls), but the signature is future-proofed so the next caller has a
    // clear path to forensic logging without a follow-up signature change.
    const result = await prisma.$transaction(async (tx) => {
      const currentStage = await tx.stage.findUnique({ where: { id } })
      if (!currentStage) throw new Error("Stage not found")

      const existingMeta = (currentStage.metadata as Record<string, unknown> | null) || {}
      const incomingMeta = data.metadata as Record<string, unknown> | undefined
      const mergedMetadata = incomingMeta
        ? { ...existingMeta, ...incomingMeta }
        : existingMeta

      const { metadata: _drop, ...restData } = data

      const updated = await tx.stage.update({
        where: { id },
        data: {
          ...restData,
          metadata: JSON.parse(JSON.stringify(mergedMetadata)) as Prisma.InputJsonValue,
        },
        include: {
          tasks: true,
        },
      })

      return { updated, before: currentStage, mergedMetadata }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })

    // Post-tx fire-and-forget forensic logging. Only fires when a userId
    // is supplied — preserves the no-op shape for the regression test and
    // any current callers that don't have user context.
    if (userId) {
      const fields: Array<{ name: keyof UpdateStageInput; action: typeof TaskActivityAction[keyof typeof TaskActivityAction] }> = [
        { name: 'name', action: TaskActivityAction.UPDATED },
        { name: 'description', action: TaskActivityAction.UPDATED },
        { name: 'status', action: TaskActivityAction.STATUS_CHANGED },
        { name: 'order', action: TaskActivityAction.UPDATED },
      ]
      for (const f of fields) {
        if (data[f.name] !== undefined && (result.before as any)[f.name] !== (result.updated as any)[f.name]) {
          logStageFieldChange(id, userId, {
            name: String(f.name),
            oldValue: (result.before as any)[f.name],
            newValue: (result.updated as any)[f.name],
            action: f.action,
          }, { source: 'API' })
        }
      }
      // Per-key metadata diff (only emit when caller actually supplied metadata).
      if (data.metadata !== undefined) {
        const beforeMeta = (result.before.metadata as Record<string, unknown> | null) || {}
        for (const key of Object.keys(data.metadata as Record<string, unknown>)) {
          if (beforeMeta[key] !== (result.mergedMetadata as Record<string, unknown>)[key]) {
            logStageFieldChange(id, userId, {
              name: `metadata.${key}`,
              oldValue: beforeMeta[key] ?? null,
              newValue: (result.mergedMetadata as Record<string, unknown>)[key],
              action: TaskActivityAction.UPDATED,
            }, { source: 'API' })
          }
        }
      }
    }

    return result.updated
  }

  async deleteStage(id: string) {
    return prisma.stage.delete({ where: { id } })
  }

  async reorderStages(phaseId: string, stageIds: string[], userId?: string) {
    // ✅ ENHANCED: Atomic transaction with row-level locking (Week 4 Phase 2.2)
    //
    // Phase 2 stage_activities (2026-04-26): userId is optional. The 1
    // existing caller (app/api/.../stages/reorder/route.ts:55) passes it.
    // Order-only audit — name/desc/status untouched by this operation.
    // BC14/BC19 (2026-06-09): Serializable + FOR UPDATE NOWAIT can abort (40001) or fail-fast (55P03) under a
    // concurrent reorder — wrap in withSerializationRetry so it retries instead of erroring the user. The diff
    // accumulator is declared INSIDE the fn and RETURNED, so a retry re-inits it per attempt (no double-logging
    // post-tx). See transaction-atomicity-pattern.md §Retry.
    const reorderDiffs = await withSerializationRetry(() => prisma.$transaction(async (tx) => {
      const diffs: Array<{ stageId: string; before: number; after: number }> = []
      // Verify all stages belong to the phase (within transaction)
      const stages = await tx.stage.findMany({
        where: { phaseId, id: { in: stageIds } },
        take: 200,
      })

      if (stages.length !== stageIds.length) {
        throw new Error("Some stage IDs are invalid or do not belong to this phase")
      }

      const beforeOrders = new Map(stages.map(s => [s.id, s.order]))

      // Lock all stages in this phase to prevent concurrent reorder
      await tx.$executeRaw`
        SELECT id FROM stages
        WHERE "phaseId" = ${phaseId}
        FOR UPDATE NOWAIT
      `;

      // Update order of each stage sequentially within transaction
      // Use 1000 increment pattern (industry standard) to maintain ordering consistency
      for (let i = 0; i < stageIds.length; i++) {
        const newOrder = (i + 1) * 1000
        const beforeOrder = beforeOrders.get(stageIds[i])
        await tx.stage.update({
          where: { id: stageIds[i] },
          data: { order: newOrder },  // 1000, 2000, 3000... (preserves 1000 increment pattern)
        });
        if (beforeOrder !== undefined && beforeOrder !== newOrder) {
          diffs.push({ stageId: stageIds[i], before: beforeOrder, after: newOrder })
        }
      }
      return diffs
    }, {
      isolationLevel: 'Serializable',
      timeout: 10000
    }), 'phase.ts:reorderStages');

    // Post-tx fire-and-forget logging — only stages whose order actually changed.
    if (userId) {
      for (const diff of reorderDiffs) {
        logStageFieldChange(diff.stageId, userId, {
          name: 'order',
          oldValue: diff.before,
          newValue: diff.after,
          action: TaskActivityAction.UPDATED,
        }, { source: 'API' })
      }
    }

    return prisma.stage.findMany({
      where: { phaseId },
      orderBy: { order: 'asc' },
      include: {
        tasks: {
          orderBy: {
            order: 'asc',
          },
        },
      },
      take: 200,
    })
  }

  // Task Management
  async moveTask(taskId: string, newStageId: string, newOrder: number) {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) throw new Error("Task not found")

    const stage = await prisma.stage.findUnique({ where: { id: newStageId } })
    if (!stage) throw new Error("Stage not found")

    // Get tasks in the target stage
    const stageTasks = await prisma.task.findMany({
      where: { stageId: newStageId },
      orderBy: { order: 'asc' },
      take: 200,
    })

    // Reorder tasks
    const updatedTasks = await prisma.$transaction(async (tx) => {
      // Move the task to the new stage
      await tx.task.update({
        where: { id: taskId },
        data: { stageId: newStageId, order: newOrder },
      })

      // Reorder other tasks in the stage
      for (let i = newOrder; i < stageTasks.length; i++) {
        if (stageTasks[i].id !== taskId) {
          await tx.task.update({
            where: { id: stageTasks[i].id },
            data: { order: i + 1 },
          })
        }
      }

      return tx.task.findMany({
        where: { stageId: newStageId },
        orderBy: { order: 'asc' },
        take: 200,
      })
    })

    return updatedTasks
  }

  async createTask(stageId: string, data: {
    title: string;
    description?: string;
    assigneeId?: string;
    dueDate?: Date;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    type?: 'ACTION' | 'DECISION' | 'MILESTONE' | 'APPROVAL' | 'DOCUMENT';
    metadata?: Record<string, any>;
  }) {
    const stage = await prisma.stage.findUnique({
      where: { id: stageId },
      include: {
        phase: true,
        tasks: {
          orderBy: {
            order: 'asc',
          },
        },
      },
    })

    if (!stage) throw new Error("Stage not found")

    // Apply atomic transaction pattern for task order calculation (race condition prevention)
    return await prisma.$transaction(async (tx) => {
      // Get the highest order atomically to prevent race conditions
      const lastTask = await tx.task.findFirst({
        where: { stageId },
        orderBy: { order: 'desc' },
        select: { order: true }
      });
      
      const atomicOrder = lastTask ? lastTask.order + 1000 : 1000;  // Use 1000 increment pattern
      localLogger.debug({ stageId, atomicOrder }, 'calculated atomic task order for stage');
      
      // Create task with calculated order in same transaction
      return tx.task.create({
        data: {
          ...data,
          stageId,
          phaseId: stage.phaseId,
          povId: stage.phase.povId,
          order: atomicOrder,
          status: 'OPEN',
          type: data.type || 'ACTION',
          metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) as Prisma.InputJsonValue : undefined,
        },
      });
    });
  }
}

export const phaseService = new PhaseService()
