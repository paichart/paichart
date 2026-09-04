import { prisma } from "@/lib/prisma";
import { PhaseService } from "./phase";
import { PhaseType, StageStatus } from "@prisma/client";
import { povLogger } from "@/lib/logger";

export class PhaseTemplateService {
  private phaseService: PhaseService;

  constructor() {
    this.phaseService = new PhaseService();
  }

  /**
   * Create a phase from a template
   * This method creates a phase and all its stages and tasks based on a template
   */
  async createPhaseFromTemplate(data: {
    povId: string;
    templateId: string;
    name: string;
    description: string;
    startDate: Date;
    endDate: Date;
    type?: PhaseType;
  }) {
    povLogger.info({ povId: data.povId, templateId: data.templateId, type: data.type }, 'Creating phase from template');
    // Get the template
    const template = await prisma.phaseTemplate.findUnique({
      where: { id: data.templateId },
    });

    if (!template) {
      povLogger.warn({ templateId: data.templateId }, 'Template not found');
      throw new Error("Template not found");
    }
    
    povLogger.debug({ templateId: template.id, templateType: template.type }, 'Template found');

    // Create the phase
    const phase = await this.phaseService.createPhase({
      povId: data.povId,
      templateId: data.templateId,
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      type: data.type || template.type,
      order: 0, // Will be updated later
    });

    // Get the template workflow
    let workflow: any;
    
    try {
      workflow = typeof template.workflow === 'string' 
        ? JSON.parse(template.workflow) 
        : template.workflow;
      
      povLogger.debug({ stageCount: workflow?.stages?.length }, 'Template workflow parsed');
    } catch (error) {
      povLogger.error({ err: error, templateId: template.id }, 'Error parsing template workflow');
      return phase; // Return the phase without stages if we can't parse the workflow
    }
    
    if (!workflow || !workflow.stages || !Array.isArray(workflow.stages)) {
      povLogger.debug({ templateId: template.id }, 'No stages in workflow, checking top level');

      // Try to look for stages at the top level
      const templateAny = template as any;
      if (templateAny.stages && Array.isArray(templateAny.stages)) {
        povLogger.debug({ stageCount: templateAny.stages.length }, 'Found stages at top level of template');
        workflow = { stages: templateAny.stages };
      } else {
        return phase; // No stages to create
      }
    }
    
    povLogger.debug({ stageCount: workflow.stages.length }, 'Processing template stages');

    // BC50 FIX: Wrap stage + task creation in transaction to prevent orphan records on partial failure
    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < workflow.stages.length; index++) {
        const stageData = workflow.stages[index] as any;
        povLogger.debug({ stageIndex: index + 1, stageCount: workflow.stages.length, stageName: stageData.name }, 'Creating stage');

        const stage = await tx.stage.create({
          data: {
            phaseId: phase.id,
            name: stageData.name,
            description: stageData.description || '',
            order: (index + 1) * 1000,
            status: StageStatus.PENDING,
            metadata: stageData.metadata || {},
          }
        });

        povLogger.debug({ stageId: stage.id }, 'Stage created');

        if (stageData.tasks && Array.isArray(stageData.tasks)) {
          for (let taskIndex = 0; taskIndex < stageData.tasks.length; taskIndex++) {
            const taskData = stageData.tasks[taskIndex] as any;
            const taskTitle = taskData.title || taskData.name || `Task ${taskIndex + 1}`;

            if (!taskData.title && !taskData.name) {
              povLogger.warn({ taskIndex: taskIndex + 1, stageName: stageData.name, fallbackTitle: taskTitle }, 'Task missing title field, using fallback');
            }

            await tx.task.create({
              data: {
                stageId: stage.id,
                phaseId: phase.id,
                povId: data.povId,
                title: taskTitle,
                description: taskData.description || `Task ${taskIndex + 1} in ${stageData.name} stage`,
                priority: taskData.priority || 'MEDIUM',
                type: taskData.type || 'ACTION',
                status: 'OPEN',
                order: (taskIndex + 1) * 1000,
                metadata: {
                  ...taskData.metadata,
                  dependencies: taskData.dependencies || [],
                },
              }
            });
          }
          povLogger.debug({ stageName: stageData.name, taskCount: stageData.tasks.length }, 'All tasks created for stage');
        }
      }
      povLogger.info({ phaseId: phase.id, stageCount: workflow.stages.length }, 'All stages and tasks created successfully');
    });

    // Get the updated phase with all stages and tasks
    const updatedPhase = await prisma.phase.findUnique({
      where: { id: phase.id },
      include: {
        template: true,
        stages: {
          include: {
            tasks: true,
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    return updatedPhase;
  }
}

export const phaseTemplateService = new PhaseTemplateService();
