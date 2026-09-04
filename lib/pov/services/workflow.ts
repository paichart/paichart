import { prisma } from '../../../lib/prisma';
import { Prisma, WorkflowStatus, WorkflowStepStatus, WorkflowType } from '@prisma/client';
import { ensureObject } from '@/lib/utils/ensure-object';

interface WorkflowInitData {
  type: WorkflowType;
  metadata?: Record<string, any>;
}

interface WorkflowStepData {
  name: string;
  order: number;
  role: string;
  metadata?: Record<string, any>;
}

interface StepStatusUpdate {
  status: WorkflowStepStatus;
  comment?: string;
  metadata?: Record<string, any>;
}

interface WorkflowStatusUpdate {
  status: WorkflowStatus;
  metadata?: Record<string, any>;
}

class WorkflowService {
  private static instance: WorkflowService;

  private constructor() {}

  static getInstance(): WorkflowService {
    if (!WorkflowService.instance) {
      WorkflowService.instance = new WorkflowService();
    }
    return WorkflowService.instance;
  }

  async initialize(povId: string, data: WorkflowInitData) {
    return await prisma.workflow.create({
      data: {
        povId,
        type: data.type,
        status: WorkflowStatus.PENDING,
        metadata: data.metadata as unknown as Prisma.InputJsonValue
      },
      include: {
        steps: true
      }
    });
  }

  async addStep(workflowId: string, data: WorkflowStepData) {
    return await prisma.workflowStep.create({
      data: {
        workflowId,
        name: data.name,
        order: data.order,
        role: data.role,
        status: WorkflowStepStatus.PENDING,
        metadata: data.metadata as unknown as Prisma.InputJsonValue
      }
    });
  }

  async updateStepStatus(stepId: string, update: StepStatusUpdate) {
    // BC50 FIX: Wrap step update + workflow status update in transaction (atomic state change)
    const step = await prisma.$transaction(async (tx) => {
      const updatedStep = await tx.workflowStep.update({
        where: { id: stepId },
        data: {
          status: update.status,
          comment: update.comment,
          metadata: update.metadata as unknown as Prisma.InputJsonValue
        },
        include: {
          workflow: {
            include: {
              steps: true
            }
          }
        }
      });

      // Auto-update workflow status based on steps
      if (updatedStep.workflow) {
        const allSteps = updatedStep.workflow.steps;
        const newStatus = this.determineWorkflowStatus(allSteps);
        if (newStatus !== updatedStep.workflow.status) {
          await tx.workflow.update({
            where: { id: updatedStep.workflow.id },
            data: { status: newStatus }
          });
        }
      }

      return updatedStep;
    });

    return step;
  }

  private determineWorkflowStatus(steps: { status: WorkflowStepStatus }[]): WorkflowStatus {
    const allCompleted = steps.every(s => 
      s.status === WorkflowStepStatus.APPROVED || 
      s.status === WorkflowStepStatus.SKIPPED
    );
    if (allCompleted) return WorkflowStatus.COMPLETED;

    const hasRejected = steps.some(s => s.status === WorkflowStepStatus.REJECTED);
    if (hasRejected) return WorkflowStatus.REJECTED;

    const hasInProgress = steps.some(s => s.status === WorkflowStepStatus.IN_PROGRESS);
    if (hasInProgress) return WorkflowStatus.IN_PROGRESS;

    return WorkflowStatus.PENDING;
  }

  async updateStatus(workflowId: string, update: WorkflowStatusUpdate) {
    return await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: update.status,
        metadata: update.metadata as unknown as Prisma.InputJsonValue
      },
      include: {
        steps: true
      }
    });
  }

  async getWorkflow(workflowId: string) {
    return await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        steps: {
          orderBy: {
            order: 'asc'
          }
        }
      }
    });
  }

  async complete(workflowId: string, data: WorkflowStatusUpdate) {
    // BC19 FIX: Atomic read-modify-write for metadata merge
    return prisma.$transaction(async (tx) => {
      const existingWorkflow = await tx.workflow.findUnique({
        where: { id: workflowId },
        include: { steps: { orderBy: { order: 'asc' } } }
      });
      const existingMetadata = ensureObject(existingWorkflow?.metadata, {}, 'Workflow metadata');
      return tx.workflow.update({
        where: { id: workflowId },
        data: {
          status: WorkflowStatus.COMPLETED,
          metadata: {
            ...existingMetadata,
            ...data.metadata,
            completedAt: new Date().toISOString()
          } as unknown as Prisma.InputJsonValue
        },
        include: {
          steps: true
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getPOVWorkflows(povId: string) {
    return await prisma.workflow.findMany({
      where: { povId },
      include: {
        steps: {
          orderBy: {
            order: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100,
    });
  }

  async deleteWorkflow(workflowId: string) {
    await prisma.workflowStep.deleteMany({
      where: { workflowId }
    });
    return await prisma.workflow.delete({
      where: { id: workflowId }
    });
  }

  async validatePhaseProgress(phaseId: string): Promise<{ valid: boolean; errors: string[] }> {
    const phase = await prisma.phase.findUnique({
      where: { id: phaseId },
      include: {
        pov: {
          include: {
            workflows: {
              where: {
                type: 'PHASE_APPROVAL'
              },
              include: {
                steps: true
              }
            }
          }
        }
      }
    });

    if (!phase) {
      return {
        valid: false,
        errors: ['Phase not found']
      };
    }

    const errors: string[] = [];

    // Check if phase has an approval workflow
    const approvalWorkflow = phase.pov.workflows.find(w => 
      w.type === 'PHASE_APPROVAL' && 
      w.metadata && 
      (w.metadata as any).phaseId === phaseId
    );

    if (!approvalWorkflow) {
      errors.push('No approval workflow found for phase');
      return { valid: false, errors };
    }

    // Check workflow status
    if (approvalWorkflow.status !== 'COMPLETED') {
      errors.push('Phase approval workflow not completed');
    }

    // Check all steps are approved or skipped
    const pendingSteps = approvalWorkflow.steps.filter(step => 
      !['APPROVED', 'SKIPPED'].includes(step.status)
    );

    if (pendingSteps.length > 0) {
      errors.push(`${pendingSteps.length} approval steps pending`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const workflowService = WorkflowService.getInstance();
