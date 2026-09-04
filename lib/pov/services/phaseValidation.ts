import { prisma } from "@/lib/prisma"
import { PhaseType, Prisma } from "@prisma/client"
import { stageValidationService } from "./stageValidationService"
import { phaseProgressService } from "./phaseProgressService"
import { povLogger } from "@/lib/logger"

const localLogger = povLogger.child({ module: 'PhaseValidationService' })

export class PhaseValidationService {
  // Phase Validation
  async validatePhaseTimeline(phaseId: string, startDate: Date, endDate: Date): Promise<boolean> {
    // Check if the phase exists
    const phase = await prisma.phase.findUnique({
      where: { id: phaseId },
    })

    if (!phase) {
      throw new Error("Phase not found")
    }

    // Check if the start date is before the end date
    if (startDate >= endDate) {
      return false
    }

    // Check if the phase overlaps with other phases in the same POV
    const overlappingPhases = await prisma.phase.findMany({
      where: {
        povId: phase.povId,
        id: { not: phaseId },
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        ],
      },
      take: 50,
    })

    return overlappingPhases.length === 0
  }

  async validatePhaseStatus(phaseId: string, newStatus: PhaseType): Promise<boolean> {
    const phase = await prisma.phase.findUnique({
      where: { id: phaseId },
    })

    if (!phase) {
      throw new Error("Phase not found")
    }

    // Check if all stages in the phase are completed
    if (newStatus === PhaseType.REVIEW) {
      // Fetch stages for this phase
      const stages = await prisma.$queryRaw<any[]>`
        SELECT * FROM "stages" WHERE "phaseId" = ${phaseId}
      `
      
      const incompleteStages = stages.filter(stage => stage.status !== 'COMPLETED')
      return incompleteStages.length === 0
    }

    return true
  }

  /**
   * OPTIMIZED: Comprehensive phase validation using new optimized services
   * 
   * Integrates with phaseProgressService and stageValidationService for
   * high-performance validation with caching and aggregate queries.
   */
  async validatePhaseStatusOptimized(phaseId: string, newStatus: PhaseType): Promise<{
    isValid: boolean;
    canTransition: boolean;
    blockingReasons: string[];
    progressMetrics?: {
      total: number;
      completed: number;
      percentage: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      // Get phase information
      const phase = await prisma.phase.findUnique({
        where: { id: phaseId },
        select: {
          id: true,
          name: true,
          povId: true,
          type: true,
          stages: {
            select: {
              id: true,
              status: true,
              order: true
            },
            orderBy: { order: 'asc' }
          }
        }
      });

      if (!phase) {
        throw new Error("Phase not found");
      }

      const blockingReasons: string[] = [];
      let canTransition = true;

      // Use optimized progress calculation
      const progressMetrics = await phaseProgressService.calculatePhaseProgress(phase.povId);
      const phaseProgress = progressMetrics.find(p => p.phaseId === phaseId);

      if (!phaseProgress) {
        blockingReasons.push("Phase progress data not available");
        canTransition = false;
      }

      // Status-specific validation rules using optimized services
      switch (newStatus) {
        case PhaseType.EXECUTION:
          // Can start execution if planning phase has some progress
          if (phase.type === PhaseType.PLANNING && phaseProgress && phaseProgress.percentage < 80) {
            blockingReasons.push("Planning phase should be at least 80% complete");
            canTransition = false;
          }
          break;

        case PhaseType.REVIEW:
          // Can move to review if execution is substantially complete
          if (phase.type === PhaseType.EXECUTION) {
            if (phaseProgress && phaseProgress.percentage < 90) {
              blockingReasons.push("Execution phase should be at least 90% complete");
              canTransition = false;
            }

            // Validate all stages using optimized validation service
            if (phase.stages.length > 0) {
              const stageIds = phase.stages.map(s => s.id);
              const targetStatuses = phase.stages.map(() => 'COMPLETED' as const);

              try {
                const stageValidations = await stageValidationService.validateMultipleStages(stageIds, targetStatuses);
                const invalidStages = stageValidations.filter(v => !v.isValid);

                if (invalidStages.length > 0) {
                  blockingReasons.push(`${invalidStages.length} stages are not ready for completion`);
                  canTransition = false;
                }
              } catch (error) {
                localLogger.error({ err: error, phaseId }, 'stage validation failed, using fallback');
                blockingReasons.push("Unable to validate stage readiness");
                canTransition = false;
              }
            }
          }
          break;
      }

      const isValid = canTransition && blockingReasons.length === 0;

      // Performance logging
      const executionTime = Date.now() - startTime;
      localLogger.debug({ phaseId, executionTimeMs: executionTime }, 'validatePhaseStatusOptimized completed');

      return {
        isValid,
        canTransition,
        blockingReasons,
        progressMetrics: phaseProgress ? {
          total: phaseProgress.total,
          completed: phaseProgress.completed,
          percentage: phaseProgress.percentage
        } : undefined
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      localLogger.error({ err: error, phaseId, executionTimeMs: executionTime }, 'validatePhaseStatusOptimized failed, falling back to original method');
      const isValid = await this.validatePhaseStatus(phaseId, newStatus);
      
      return {
        isValid,
        canTransition: isValid,
        blockingReasons: isValid ? [] : ["Validation failed - using fallback method"],
        progressMetrics: undefined
      };
    }
  }

  // Stage Validation
  async validateStageOrder(phaseId: string, stageIds: string[]): Promise<boolean> {
    // Check if all stages belong to the phase using raw SQL
    const stageIdsStr = stageIds.map(id => `'${id}'`).join(',')
    const stages = await prisma.$queryRaw<any[]>`
      SELECT id FROM "stages" 
      WHERE "phaseId" = ${phaseId} AND id IN (${Prisma.raw(stageIdsStr)})
    `

    if (stages.length !== stageIds.length) {
      return false
    }

    return true
  }

  async validateStageStatus(stageId: string, newStatus: string): Promise<boolean> {
    // Get the stage and its tasks using raw SQL
    const stage = await prisma.$queryRaw<any[]>`
      SELECT * FROM "stages" WHERE id = ${stageId}
    `

    if (!stage || stage.length === 0) {
      throw new Error("Stage not found")
    }

    // Check if all tasks in the stage are completed
    if (newStatus === 'COMPLETED') {
      const tasks = await prisma.$queryRaw<any[]>`
        SELECT * FROM "tasks" WHERE "stage_id" = ${stageId}
      `
      
      const incompleteTasks = tasks.filter((task: any) => task.status !== 'COMPLETED')
      return incompleteTasks.length === 0
    }

    return true
  }

  // Task Validation
  async validateTaskDependencies(taskId: string): Promise<boolean> {
    // In a real implementation, we would check if all dependencies of the task are completed
    // For now, we'll just return true
    return true
  }

  async validateTaskAssignment(taskId: string, assigneeId: string): Promise<boolean> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        pov: {
          include: {
            team: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    })

    if (!task || !task.pov || !task.pov.team) {
      throw new Error("Task or POV team not found")
    }

    // Check if the assignee is a member of the POV team
    const isTeamMember = task.pov.team.members.some(member => member.userId === assigneeId)
    return isTeamMember
  }
}

export const phaseValidationService = new PhaseValidationService()
