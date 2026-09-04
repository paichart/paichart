import { templateService } from '@/lib/pov/templates/service';
import { templateStorage } from '@/lib/pov/phase-templates/storage';
import { POVTemplate } from '@/lib/pov/templates/types';
import { PhaseTemplate } from '@/lib/pov/phase-templates/types';
import { ApiError } from '@/lib/errors';
import { povLogger } from '@/lib/logger';

const localLogger = povLogger.child({ module: 'TemplateIntegrationService' });

/**
 * Service for integrating POV templates with Phase templates
 */
export class TemplateIntegrationService {
  private static instance: TemplateIntegrationService;

  private constructor() {}

  public static getInstance(): TemplateIntegrationService {
    if (!TemplateIntegrationService.instance) {
      TemplateIntegrationService.instance = new TemplateIntegrationService();
    }
    return TemplateIntegrationService.instance;
  }

  /**
   * Get phase templates associated with a POV template
   */
  public async getPhaseTemplatesForPOVTemplate(povTemplateId: string): Promise<PhaseTemplate[]> {
    // Get the POV template
    const povTemplate = await templateService.getTemplate(povTemplateId);
    if (!povTemplate) {
      throw new ApiError('NOT_FOUND', `POV template with ID ${povTemplateId} not found`);
    }

    // Get the phase template IDs from the POV template metadata
    const phaseTemplateIds = povTemplate.metadata?.phaseTemplates || [];
    
    // If no phase templates are associated, return an empty array
    if (phaseTemplateIds.length === 0) {
      return [];
    }

    // Get the phase templates
    const phaseTemplates: PhaseTemplate[] = [];
    
    for (const id of phaseTemplateIds) {
      try {
        const template = await templateStorage.getTemplate(id);
        if (template) {
          phaseTemplates.push(template);
        }
      } catch (error) {
        localLogger.error({ err: error, phaseTemplateId: id }, 'failed to fetch phase template');
        // Continue with other templates even if one fails
      }
    }

    return phaseTemplates;
  }

  /**
   * Update phase templates associated with a POV template
   */
  public async updatePhaseTemplatesForPOVTemplate(
    povTemplateId: string, 
    phaseTemplateIds: string[]
  ): Promise<POVTemplate> {
    // Get the POV template
    const povTemplate = await templateService.getTemplate(povTemplateId);
    if (!povTemplate) {
      throw new ApiError('NOT_FOUND', `POV template with ID ${povTemplateId} not found`);
    }

    // Validate that all phase template IDs exist
    for (const id of phaseTemplateIds) {
      const template = await templateStorage.getTemplate(id);
      if (!template) {
        throw new ApiError('BAD_REQUEST', `Phase template with ID ${id} not found`);
      }
    }

    // Update the POV template metadata
    const updatedTemplate: POVTemplate = {
      ...povTemplate,
      metadata: {
        ...povTemplate.metadata,
        phaseTemplates: phaseTemplateIds
      }
    };

    // Save the updated POV template
    return templateService.updateTemplate(povTemplateId, updatedTemplate);
  }

  /**
   * Create POV with associated phase templates
   */
  public async createPOVWithPhases(
    templateId: string,
    formData: Record<string, any>,
    userId: string
  ): Promise<any> {
    // Create the POV from the template
    const pov = await templateService.createPOVFromTemplate(templateId, formData, userId);
    
    // Get the POV template
    const povTemplate = await templateService.getTemplate(templateId);
    if (!povTemplate) {
      throw new ApiError('NOT_FOUND', `POV template with ID ${templateId} not found`);
    }

    // Get the phase template IDs from the POV template metadata
    const phaseTemplateIds = povTemplate.metadata?.phaseTemplates || [];
    
    // If no phase templates are associated, return the POV
    if (phaseTemplateIds.length === 0) {
      return pov;
    }

    // Create phases from the phase templates
    const phases = [];
    
    for (const id of phaseTemplateIds) {
      try {
        // Create a phase from the template
        const phase = await templateStorage.createPhaseFromTemplate(
          id,
          pov.id,
          {
            startDate: pov.startDate,
            endDate: pov.endDate,
            order: phases.length
          }
        );
        
        phases.push(phase);
      } catch (error) {
        localLogger.error({ err: error, phaseTemplateId: id }, 'failed to create phase from template');
        // Continue with other templates even if one fails
      }
    }

    // Return the POV with the created phases
    return {
      ...pov,
      phases
    };
  }

  /**
   * Get available phase templates
   */
  public async getAvailablePhaseTemplates(): Promise<PhaseTemplate[]> {
    return templateStorage.getAllTemplates();
  }
}

export const templateIntegrationService = TemplateIntegrationService.getInstance();
