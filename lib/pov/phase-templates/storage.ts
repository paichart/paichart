import { prisma } from '@/lib/prisma';
import { PhaseTemplate } from './types';
import { schemaValidator } from './validator';
import { ApiError } from '@/lib/errors';
import { povLogger } from '@/lib/logger';

const localLogger = povLogger.child({ module: 'TemplateStorageService' });

/**
 * Service for managing Phase templates
 */
export class TemplateStorageService {
  private static instance: TemplateStorageService;

  private constructor() {}

  public static getInstance(): TemplateStorageService {
    if (!TemplateStorageService.instance) {
      TemplateStorageService.instance = new TemplateStorageService();
    }
    return TemplateStorageService.instance;
  }

  /**
   * Get all templates
   */
  public async getAllTemplates(): Promise<PhaseTemplate[]> {
    const templates = await prisma.phaseTemplate.findMany({
      take: 100
    });
    return templates.map(template => this.mapDatabaseToTemplate(template));
  }

  /**
   * Get templates by type
   */
  public async getTemplatesByType(type: string): Promise<PhaseTemplate[]> {
    const templates = await prisma.phaseTemplate.findMany({
      where: { type: type as any },
      take: 100
    });
    return templates.map(template => this.mapDatabaseToTemplate(template));
  }

  /**
   * Get a template by ID
   */
  public async getTemplate(id: string): Promise<PhaseTemplate | null> {
    const template = await prisma.phaseTemplate.findUnique({
      where: { id }
    });
    
    if (!template) {
      return null;
    }
    
    return this.mapDatabaseToTemplate(template);
  }

  /**
   * Save a template
   */
  public async saveTemplate(template: PhaseTemplate): Promise<PhaseTemplate> {
    // Validate template against schema
    const validation = schemaValidator.validateTemplate(template);
    if (!validation.valid) {
      const errors = schemaValidator.formatErrors(validation.errors);
      throw new ApiError('BAD_REQUEST', `Invalid template: ${errors.join(', ')}`);
    }
    
    // Validate dependencies
    const dependencyValidation = schemaValidator.validateStageDependencies(template);
    if (!dependencyValidation.valid) {
      throw new ApiError('BAD_REQUEST', `Invalid dependencies: ${dependencyValidation.errors.join(', ')}`);
    }
    
    // Validate task dependencies in each stage
    for (const stage of template.stages) {
      const taskValidation = schemaValidator.validateTaskDependencies(stage);
      if (!taskValidation.valid) {
        throw new ApiError('BAD_REQUEST', `Invalid task dependencies in stage "${stage.name}": ${taskValidation.errors.join(', ')}`);
      }
    }
    
    // Check if template exists
    const existingTemplate = await prisma.phaseTemplate.findUnique({
      where: { id: template.id }
    });
    
    if (existingTemplate) {
      // Update existing template
      const updated = await prisma.phaseTemplate.update({
        where: { id: template.id },
        data: {
          name: template.name,
          description: template.description || '',
          type: template.type as any,
          isDefault: false, // Set this based on your requirements
          workflow: template as any,
          updatedAt: new Date()
        }
      });
      
      return this.mapDatabaseToTemplate(updated);
    } else {
      // Create new template
      const created = await prisma.phaseTemplate.create({
        data: {
          id: template.id,
          name: template.name,
          description: template.description || '',
          type: template.type as any,
          isDefault: false, // Set this based on your requirements
          workflow: template as any
        }
      });
      
      return this.mapDatabaseToTemplate(created);
    }
  }

  /**
   * Delete a template
   */
  public async deleteTemplate(id: string): Promise<boolean> {
    try {
      // Check if template is in use
      const phasesUsingTemplate = await prisma.phase.count({
        where: { templateId: id }
      });
      
      if (phasesUsingTemplate > 0) {
        throw new ApiError('BAD_REQUEST', `Cannot delete template that is in use by ${phasesUsingTemplate} phases`);
      }
      
      await prisma.phaseTemplate.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      localLogger.error({ err: error, templateId: id }, 'failed to delete template');
      return false;
    }
  }

  /**
   * Create a phase from a template
   */
  public async createPhaseFromTemplate(
    templateId: string,
    povId: string,
    data: {
      name?: string;
      description?: string;
      startDate: Date;
      endDate: Date;
      order: number;
    }
  ): Promise<any> {
    // Get the template
    const template = await this.getTemplate(templateId);
    
    if (!template) {
      throw new ApiError('NOT_FOUND', `Template with ID ${templateId} not found`);
    }
    
    // BC50 FIX: Wrap phase + stages + tasks creation in transaction to prevent orphan records
    const phase = await prisma.$transaction(async (tx) => {
      // Create the phase
      const newPhase = await tx.phase.create({
        data: {
          povId,
          templateId,
          name: data.name || template.name,
          description: data.description || template.description || '',
          startDate: data.startDate,
          endDate: data.endDate,
          order: data.order,
          type: template.type as any,
          details: {
            tasks: [],
            metadata: template.metadata || {}
          } as any
        }
      });

      // Create stages from template
      const stages = template.stages || [];

      for (let i = 0; i < stages.length; i++) {
        const stageConfig = stages[i];

        // Create the stage
        const stage = await tx.stage.create({
          data: {
            phaseId: newPhase.id,
            name: stageConfig.name,
            description: stageConfig.description,
            order: stageConfig.order !== undefined ? stageConfig.order : i,
            status: (stageConfig.status || 'PENDING') as any,
            metadata: stageConfig.metadata || {}
          }
        });

        // Create tasks for the stage
        const tasks = stageConfig.tasks || [];

        for (let j = 0; j < tasks.length; j++) {
          const taskConfig = tasks[j];

          await tx.task.create({
            data: {
              stageId: stage.id,
              phaseId: newPhase.id,
              povId,
              title: taskConfig.title,
              description: taskConfig.description,
              order: j,
              status: 'OPEN',
              priority: (taskConfig.priority || 'MEDIUM') as any,
              metadata: {
                ...taskConfig.metadata,
                required: taskConfig.required,
                id: taskConfig.id,
                dependencies: taskConfig.dependencies
              }
            }
          });
        }
      }

      return newPhase;
    });

    // Return the created phase with stages and tasks
    return prisma.phase.findUnique({
      where: { id: phase.id },
      include: {
        stages: {
          include: {
            tasks: true
          },
          orderBy: {
            order: 'asc'
          }
        }
      }
    });
  }

  /**
   * Map database model to template type
   */
  private mapDatabaseToTemplate(dbTemplate: any): PhaseTemplate {
    // If the workflow field contains the full template, return it
    if (dbTemplate.workflow && typeof dbTemplate.workflow === 'object') {
      const template = dbTemplate.workflow as PhaseTemplate;
      
      // Ensure the template has the correct ID, name, and description
      template.id = dbTemplate.id;
      template.name = dbTemplate.name;
      template.description = dbTemplate.description;
      template.type = dbTemplate.type;
      
      return template;
    }
    
    // Otherwise, create a minimal template
    return {
      id: dbTemplate.id,
      name: dbTemplate.name,
      description: dbTemplate.description,
      type: dbTemplate.type,
      isDefault: dbTemplate.isDefault, // Add isDefault property
      stages: []
    };
  }
}

export const templateStorage = TemplateStorageService.getInstance();
