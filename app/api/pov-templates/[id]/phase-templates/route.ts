import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { templateService } from '@/lib/services/template-service';
import { validateTemplateSchema, updatePhaseTemplateIds } from '@/lib/utils/template-schema-validator';
import { povLogger } from '@/lib/logger';
import { ensureObject } from '@/lib/utils/ensure-object';

// Define a consistent structure for template data
interface TemplateMetadata {
  phaseTemplates: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  [key: string]: any; // Allow for additional properties
}

interface TemplateSchema {
  id?: string;
  name?: string;
  fields?: Record<string, any>;
  status?: string;
  version?: string;
  metadata: TemplateMetadata;
  sections?: any[];
  description?: string;
  [key: string]: any; // Allow for additional properties
}

interface POVTemplate {
  id: string;
  name: string;
  description?: string;
  status?: string;
  version?: string;
  schema?: TemplateSchema | string;
  metadata?: TemplateMetadata;
  fields?: Record<string, any>;
  sections?: any[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
  createdBy?: string;
  [key: string]: any; // Allow for additional properties
}

/**
 * Ensures the template has a consistent structure
 * This is the key function that standardizes the data structure
 */
function normalizeTemplateStructure(template: any): POVTemplate {
  // Ensure we have an object to work with
  if (!template) {
    template = {};
  }
  
  // Parse schema if it's a string
  let schema: any = template.schema;
  if (typeof schema === 'string') {
    try {
      schema = JSON.parse(schema);
    } catch (e) {
      povLogger.error({ err: e }, 'Failed to parse template schema string');
      schema = {};
    }
  }
  
  if (!schema) {
    schema = {};
  }
  
  // Ensure schema has metadata
  if (!schema.metadata) {
    schema.metadata = {};
  }
  
  // Ensure metadata has required fields
  if (!Array.isArray(schema.metadata.phaseTemplates)) {
    schema.metadata.phaseTemplates = [];
  }
  
  if (!Array.isArray(schema.metadata.tags)) {
    schema.metadata.tags = [];
  }
  
  if (!schema.metadata.createdAt) {
    schema.metadata.createdAt = new Date().toISOString();
  }
  
  schema.metadata.updatedAt = new Date().toISOString();
  
  // Ensure top-level metadata exists and matches schema.metadata
  if (!template.metadata) {
    template.metadata = { ...schema.metadata };
  } else {
    // Ensure top-level metadata has the same phase templates as schema.metadata
    template.metadata.phaseTemplates = [...schema.metadata.phaseTemplates];
    template.metadata.tags = schema.metadata.tags || template.metadata.tags || [];
    template.metadata.createdAt = schema.metadata.createdAt || template.metadata.createdAt || new Date().toISOString();
    template.metadata.updatedAt = new Date().toISOString();
  }
  
  // Ensure other required fields exist
  const normalizedTemplate: POVTemplate = {
    id: template.id || '',
    name: template.name || '',
    description: template.description || '',
    status: template.status || schema.status || 'draft',
    version: template.version || schema.version || '1.0.0',
    schema: schema,
    metadata: template.metadata,
    fields: template.fields || schema.fields || {},
    sections: template.sections || schema.sections || [],
    createdAt: template.createdAt || schema.metadata?.createdAt,
    updatedAt: new Date().toISOString(),
    createdBy: template.createdBy
  };
  
  return normalizedTemplate;
}

/**
 * Updates a template with the given phase template IDs
 * Ensures the phase template IDs are stored in a consistent location
 */
async function updateTemplateWithPhaseTemplates(templateId: string, phaseTemplateIds: string[]): Promise<any> {
  try {
    povLogger.debug({ templateId, phaseTemplateCount: phaseTemplateIds.length }, 'Updating template with phase templates');
    
    // Get the current template
    const template = await prisma.pOVTemplate.findUnique({
      where: { id: templateId },
    });
    
    if (!template) {
      povLogger.warn({ templateId }, 'Template not found for phase template update');
      return null;
    }
    
    // Normalize the template structure
    const normalizedTemplate = normalizeTemplateStructure(template);
    
    // Update the phase templates in both locations
    if (normalizedTemplate.schema && typeof normalizedTemplate.schema !== 'string') {
      if (!normalizedTemplate.schema.metadata) {
        normalizedTemplate.schema.metadata = {
          phaseTemplates: [],
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
      normalizedTemplate.schema.metadata.phaseTemplates = [...phaseTemplateIds];
    }
    
    if (!normalizedTemplate.metadata) {
      normalizedTemplate.metadata = {
        phaseTemplates: [],
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
    normalizedTemplate.metadata.phaseTemplates = [...phaseTemplateIds];
    
    // Update the template in the database
    const updatedTemplate = await prisma.pOVTemplate.update({
      where: { id: templateId },
      data: {
        schema: normalizedTemplate.schema,
        // Also update the top-level metadata if it exists in the database schema
        ...(Object.keys(template).includes('metadata') ? { metadata: normalizedTemplate.metadata } : {})
      },
    });
    
    povLogger.debug({ templateId }, 'Template phase templates updated successfully');
    return updatedTemplate;
  } catch (error) {
    povLogger.error({ err: error, templateId }, 'Failed to update template with phase templates');
    throw error;
  }
}

/**
 * Gets the phase template IDs from a template
 * Checks both possible locations and returns a consistent result
 */
function getPhaseTemplateIds(template: any): string[] {
  if (!template) return [];
  
  // Check schema.metadata.phaseTemplates first
  if (template.schema) {
    // BC2 defense: ensureObject handles string→object coercion safely (no crash on malformed JSON)
    const schema = ensureObject(template.schema, {}, 'POVTemplate schema (getPhaseTemplateIds)') as Record<string, any>;
    
    if (schema.metadata && Array.isArray(schema.metadata.phaseTemplates)) {
      return [...schema.metadata.phaseTemplates];
    }
  }
  
  // Fall back to top-level metadata if available
  if (template.metadata && Array.isArray(template.metadata.phaseTemplates)) {
    return [...template.metadata.phaseTemplates];
  }
  
  return [];
}

/**
 * GET /api/pov-templates/:id/phase-templates
 * Get all phase templates associated with a POV template
 * 
 * This implementation uses the standardized data structure
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const povTemplateId = params.id;
  povLogger.debug({ povTemplateId }, 'GET phase templates request');

  try {
    const user = await getAuthUser(request);
    if (!user) {
      povLogger.warn({ povTemplateId }, 'Unauthorized phase templates access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      // Get the POV template
      const povTemplate = await prisma.pOVTemplate.findUnique({
        where: { id: povTemplateId },
      });

      if (!povTemplate) {
        povLogger.warn({ povTemplateId }, 'POV template not found');
        return NextResponse.json(
          { error: `POV template with ID ${povTemplateId} not found` },
          { status: 404 }
        );
      }

      // Use the standardized function to get phase template IDs
      const phaseTemplateIds = getPhaseTemplateIds(povTemplate);

      // If no phase template IDs, return empty array immediately
      if (!phaseTemplateIds.length) {
        povLogger.debug({ povTemplateId }, 'No phase template IDs found');
        return NextResponse.json([]);
      }

      // Get the phase templates with error handling for each template
      const phaseTemplates = await Promise.all(
        phaseTemplateIds.map(async (id: string) => {
          try {
            const template = await templateService.getTemplate(id, 'phase');
            if (!template) {
              povLogger.warn({ phaseTemplateId: id, povTemplateId }, 'Phase template not found');
              return null;
            }
            return template;
          } catch (templateError) {
            povLogger.error({ err: templateError, phaseTemplateId: id, povTemplateId }, 'Failed to fetch phase template');
            return null;
          }
        })
      );

      // Filter out null values (templates that couldn't be found)
      const validPhaseTemplates = phaseTemplates.filter(Boolean);
      povLogger.debug({ povTemplateId, requested: phaseTemplateIds.length, found: validPhaseTemplates.length }, 'Phase templates fetched');

      return NextResponse.json(validPhaseTemplates);
    } catch (innerError) {
      povLogger.error({ err: innerError, povTemplateId }, 'Error processing phase templates');
      return NextResponse.json(
        { error: `Error processing POV template: ${innerError instanceof Error ? innerError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    povLogger.error({ err: error, povTemplateId }, 'GET phase templates failed');
    return NextResponse.json(
      { error: 'Failed to fetch phase templates for POV template' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pov-templates/:id/phase-templates
 * Update the phase templates associated with a POV template
 * 
 * This implementation uses the standardized data structure
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const povTemplateId = params.id;
  povLogger.debug({ povTemplateId }, 'POST phase templates request');

  try {
    const user = await getAuthUser(request);
    if (!user) {
      povLogger.warn({ povTemplateId }, 'Unauthorized phase templates update attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin role
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      povLogger.warn({ povTemplateId, userId: user.userId, role: user.role }, 'Insufficient permissions for phase template update');
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse request body with error handling
    let phaseTemplateIds: string[] = [];
    try {
      const requestData = await request.json();

      if (!requestData || typeof requestData !== 'object') {
        povLogger.warn({ povTemplateId }, 'Invalid request data for phase template update');
        return NextResponse.json(
          { error: 'Invalid request data' },
          { status: 400 }
        );
      }

      phaseTemplateIds = requestData.phaseTemplateIds;

      if (!Array.isArray(phaseTemplateIds)) {
        povLogger.warn({ povTemplateId }, 'phaseTemplateIds must be an array');
        return NextResponse.json(
          { error: 'phaseTemplateIds must be an array' },
          { status: 400 }
        );
      }
    } catch (parseError) {
      povLogger.error({ err: parseError, povTemplateId }, 'Failed to parse phase template update request body');
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      );
    }

    povLogger.debug({ povTemplateId, phaseTemplateCount: phaseTemplateIds.length }, 'Validating phase template IDs');
    const invalidIds: string[] = [];
    
    for (const id of phaseTemplateIds) {
      try {
        const phaseTemplate = await prisma.phaseTemplate.findUnique({
          where: { id },
        });

        if (!phaseTemplate) {
          invalidIds.push(id);
        }
      } catch (error) {
        povLogger.error({ err: error, phaseTemplateId: id, povTemplateId }, 'Error validating phase template');
        invalidIds.push(id);
      }
    }
    
    if (invalidIds.length > 0) {
      povLogger.warn({ povTemplateId, invalidCount: invalidIds.length, invalidIds }, 'Invalid phase template IDs found');
      return NextResponse.json(
        { 
          error: `Invalid phase template IDs: ${invalidIds.join(', ')}`,
          invalidIds
        },
        { status: 400 }
      );
    }

    // Use the standardized function to update the template with phase templates
    const updatedTemplate = await updateTemplateWithPhaseTemplates(povTemplateId, phaseTemplateIds);
    
    if (!updatedTemplate) {
      return NextResponse.json(
        { error: `Failed to update template with phase templates` },
        { status: 500 }
      );
    }
    
    // Get the phase template IDs from the updated template to verify
    const verificationIds = getPhaseTemplateIds(updatedTemplate);
    
    return NextResponse.json({
      success: true,
      phaseTemplateIds,
      template: updatedTemplate,
      verification: {
        phaseTemplatesInDatabase: verificationIds,
        schemaModified: true
      }
    });
  } catch (error) {
    povLogger.error({ err: error, povTemplateId }, 'POST phase templates failed');
    return NextResponse.json(
      { error: 'Failed to update phase templates for POV template' },
      { status: 500 }
    );
  }
}