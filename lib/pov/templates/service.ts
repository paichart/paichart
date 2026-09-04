import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { POVTemplate } from './types';
import { templateValidator } from './validator';
import { ApiError } from '@/lib/errors';
import { ensureObject } from '@/lib/utils/ensure-object';
import { povLogger } from '@/lib/logger';

/**
 * Service for managing POV templates
 */
export class TemplateService {
  private static instance: TemplateService;

  private constructor() {}

  public static getInstance(): TemplateService {
    if (!TemplateService.instance) {
      TemplateService.instance = new TemplateService();
    }
    return TemplateService.instance;
  }

  /**
   * Create a new template
   */
  public async createTemplate(template: POVTemplate, userId: string): Promise<POVTemplate> {
    // Validate template against schema
    const validation = templateValidator.validateTemplate(template);
    if (!validation.valid) {
      const errors = templateValidator.formatSchemaErrors(validation.errors);
      throw new ApiError('BAD_REQUEST', `Invalid template: ${errors.join(', ')}`);
    }
    
    // Set default values
    if (!template.version) {
      template.version = '1.0.0';
    }
    if (!template.status) {
      template.status = 'draft';
    }
    
    // Create template in database
    const created = await (prisma as any).POVTemplate.create({
      data: {
        id: template.id,
        name: template.name,
        description: template.description,
        version: template.version,
        status: template.status,
        schema: template as any,
        createdBy: userId
      }
    });
    
    return ensureObject(created.schema, {}, 'POVTemplate schema') as unknown as POVTemplate;
  }

  /**
   * Get a template by ID
   */
  public async getTemplate(id: string): Promise<POVTemplate | null> {
    const template = await (prisma as any).POVTemplate.findUnique({
      where: { id }
    });
    
    if (!template) {
      return null;
    }
    
    return ensureObject(template.schema, {}, 'POVTemplate schema') as unknown as POVTemplate;
  }

  /**
   * Get all templates
   */
  public async getAllTemplates(): Promise<POVTemplate[]> {
    const templates = await (prisma as any).POVTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100
    });
    
    return templates.map((t: any) => ensureObject(t.schema, {}, 'POVTemplate schema') as unknown as POVTemplate);
  }

  /**
   * Update a template
   */
  public async updateTemplate(id: string, template: POVTemplate): Promise<POVTemplate> {
    // Validate template against schema
    const validation = templateValidator.validateTemplate(template);
    if (!validation.valid) {
      const errors = templateValidator.formatSchemaErrors(validation.errors);
      throw new ApiError('BAD_REQUEST', `Invalid template: ${errors.join(', ')}`);
    }
    
    // Ensure ID matches
    template.id = id;
    
    // BC19 FIX: Atomic read-modify-write for version increment
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await (tx as any).POVTemplate.findUnique({
        where: { id }
      });

      if (!existing) {
        throw new ApiError('NOT_FOUND', `Template with ID ${id} not found`);
      }

      // Increment version if not specified
      if (!template.version) {
        const existingVersion = (existing.schema as any).version || '1.0.0';
        const versionParts = existingVersion.split('.');
        versionParts[2] = (parseInt(versionParts[2]) + 1).toString();
        template.version = versionParts.join('.');
      }

      return (tx as any).POVTemplate.update({
        where: { id },
        data: {
          name: template.name,
          description: template.description,
          version: template.version,
          status: template.status,
          schema: template as any,
          updatedAt: new Date()
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    return ensureObject(updated.schema, {}, 'POVTemplate schema') as unknown as POVTemplate;
  }

  /**
   * Delete a template
   */
  public async deleteTemplate(id: string): Promise<void> {
    // Check if template is in use
    const povsUsingTemplate = await (prisma as any).POV.count({
      where: { templateId: id } as any
    });
    
    if (povsUsingTemplate > 0) {
      throw new ApiError('BAD_REQUEST', `Cannot delete template that is in use by ${povsUsingTemplate} POVs`);
    }
    
    await (prisma as any).POVTemplate.delete({
      where: { id }
    });
  }

  /**
   * Create a POV from a template
   */
  public async createPOVFromTemplate(
    templateId: string,
    formData: Record<string, any>,
    userId: string
  ): Promise<any> {
    try {
      // Get the template
      const template = await this.getTemplate(templateId);
      if (!template) {
        throw new ApiError('NOT_FOUND', `Template with ID ${templateId} not found`);
      }
      
      // Validate form data against template
      const validation = templateValidator.validatePOVData(formData, template);
      if (!validation.valid) {
        throw new ApiError('BAD_REQUEST', 'Invalid form data', validation.errors);
      }
      
      povLogger.debug({ templateId }, 'Processing form data in template service');
      
      // Extract and validate core POV fields from form data
      const povData = await this.extractPOVData(formData, template);
      
      povLogger.debug({ title: povData.title, phaseCount: povData.phases?.length || 0 }, 'POV data prepared for creation');
      
      // Create POV with transaction to ensure all operations succeed or fail together
      const pov = await prisma.$transaction(async (tx) => {
        // Create the POV
        const createdPov = await (tx as any).POV.create({
          data: {
            ...povData,
            template: {
              connect: { id: templateId }
            },
            formData: formData as any,
            owner: {
              connect: { id: userId }
            }
          }
        });
        
        return createdPov;
      });
      
      return pov;
    } catch (error) {
      povLogger.error({ err: error, templateId }, 'Failed to create POV from template');
      
      // Re-throw ApiErrors as is
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Convert Prisma errors to ApiErrors with more context
      if ((error as any).code?.startsWith('P')) {
        throw new ApiError(
          'BAD_REQUEST',
          `Database error: ${(error as any).message || 'Unknown error'}`,
          { code: (error as any).code, meta: (error as any).meta }
        );
      }
      
      // For other errors, wrap them in an ApiError
      throw new ApiError(
        'INTERNAL_SERVER_ERROR',
        'Failed to create POV from template',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Extract core POV fields from form data
   */
  private async extractPOVData(formData: Record<string, any>, template: POVTemplate): Promise<any> {
    povLogger.debug({ templateName: template.name, fieldCount: Object.keys(template.fields || {}).length }, 'Extracting POV data from template');
    
    // Generate a default title from template if not provided
    const defaultTitle = `${template.name} - ${new Date().toLocaleDateString()}`;
    
    // Map form fields to POV fields based on metadata
    const povData: any = {
      title: defaultTitle,
      description: template.description || 'POV created from template',
      status: 'PROJECTED',
      priority: 'MEDIUM',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      salesTheatre: formData.salesTheatre || 'NORTH_AMERICA', // Use provided value or default
    };
    
    // Look for field mappings in template metadata
    const fieldMappings = template.metadata?.fieldMappings || {};
    povLogger.debug({ mappingCount: Object.keys(fieldMappings).length }, 'Applying field mappings from template');
    
    // Apply mappings
    Object.entries(fieldMappings).forEach(([povField, formField]) => {
      const fieldKey = formField as string;
      if (formData[fieldKey] !== undefined) {
        povData[povField] = formData[fieldKey];
      }
    });
    
    // Map custom fields from form data to POV metadata
    const customFields: Record<string, any> = {};
    Object.entries(formData).forEach(([key, value]) => {
      // Skip standard fields that are already mapped
      if (!['countryId', 'regionId', 'salesTheatre'].includes(key)) {
        customFields[key] = value;
      }
    });
    
    // Add custom fields to metadata
    povData.metadata = {
      customFields,
      templateName: template.name,
      templateVersion: template.version
    };
    
    // Ensure required fields have values
    if (formData.title) {
      povData.title = formData.title;
    } else if (formData.name) {
      povData.title = formData.name;
    }
    
    if (formData.description) {
      povData.description = formData.description;
    }
    
    // Map specific fields from template if they exist
    if (template.fields) {
      // Map customer information
      if (formData.customer_name) {
        povData.customerName = formData.customer_name;
      }
      
      if (formData.customer_contact) {
        povData.customerContact = formData.customer_contact;
      }
      
      // Map partner information
      if (formData.partner_name) {
        povData.partnerName = formData.partner_name;
      }
      
      if (formData.partner_contact) {
        povData.partnerContact = formData.partner_contact;
      }
      
      // Map opportunity information
      if (formData.opportunity_name) {
        povData.opportunityName = formData.opportunity_name;
      }
      
      if (formData.revenue) {
        const rev = parseFloat(formData.revenue);
        if (Number.isFinite(rev)) povData.revenue = rev;
      }

      if (formData.budget || formData.estimated_budget) {
        const budget = parseFloat(formData.budget || formData.estimated_budget);
        if (Number.isFinite(budget)) povData.estimatedBudget = budget;
      }
      
      // Map solution information
      if (formData.solution) {
        povData.solution = formData.solution;
      }
      
      // Map competitors as an array
      if (formData.competitors) {
        povData.competitors = Array.isArray(formData.competitors)
          ? formData.competitors
          : formData.competitors.split(',').map((c: string) => c.trim());
      }
    }
    
    // Validate and handle country relationship
    if (!formData.countryId) {
      throw new ApiError('BAD_REQUEST', 'Country ID is required for POV creation');
    }
    
    // Verify country exists in database
    try {
      const country = await prisma.country.findUnique({
        where: { id: formData.countryId }
      });
      
      if (!country) {
        throw new ApiError('BAD_REQUEST', `Country with ID ${formData.countryId} does not exist`);
      }
      
      povData.country = {
        connect: { id: formData.countryId }
      };
    } catch (error) {
      povLogger.error({ err: error, countryId: formData.countryId }, 'Country validation failed');
      throw new ApiError('BAD_REQUEST', `Invalid country ID: ${formData.countryId}`);
    }
    
    // Validate and handle region relationship if provided
    if (formData.regionId) {
      try {
        const region = await prisma.region.findUnique({
          where: { id: formData.regionId }
        });
        
        if (!region) {
          throw new ApiError('BAD_REQUEST', `Region with ID ${formData.regionId} does not exist`);
        }
        
        // Verify region belongs to the selected country
        const regionBelongsToCountry = await prisma.region.findFirst({
          where: {
            id: formData.regionId,
            countryId: formData.countryId
          }
        });
        
        if (!regionBelongsToCountry) {
          throw new ApiError('BAD_REQUEST', `Region with ID ${formData.regionId} does not belong to country with ID ${formData.countryId}`);
        }
        
        povData.region = {
          connect: { id: formData.regionId }
        };
      } catch (error) {
        povLogger.error({ err: error, regionId: formData.regionId }, 'Region validation failed');
        throw new ApiError('BAD_REQUEST', `Invalid region ID: ${formData.regionId}`);
      }
    }
    
    return povData;
  }
}

export const templateService = TemplateService.getInstance();
