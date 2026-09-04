import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { templateService as unifiedTemplateService } from '@/lib/services/template-service'; // Import the unified template service
import { templateService as povTemplateService } from '@/lib/pov/templates/service'; // Import the original POV template service for creation
import { ApiError } from '@/lib/errors';
import { CreatePOVTemplateSchema } from '@/lib/validation/pov-template-validation';
import { povLogger } from '@/lib/logger';

/**
 * GET /api/pov-templates
 * Get all templates
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templates = await povTemplateService.getAllTemplates(); // Use the POV template service to list templates

    // Resolve phase template IDs in metadata to names
    const templatesWithResolvedPhaseTemplates = await Promise.all(
      templates.map(async (template) => {
        if (template.metadata?.phaseTemplates && Array.isArray(template.metadata.phaseTemplates)) {
          const resolvedPhaseTemplates = await Promise.all(
            template.metadata.phaseTemplates.map(async (phaseTemplateId: string) => {
              try {
                const phaseTemplate = await unifiedTemplateService.getTemplate(phaseTemplateId, 'phase');
                return phaseTemplate ? { id: phaseTemplate.id, name: phaseTemplate.name } : { id: phaseTemplateId, name: 'Unknown Template', _resolveError: true };
              } catch (error) {
                povLogger.error({ err: error, phaseTemplateId }, 'error resolving phase template ID');
                return { id: phaseTemplateId, name: 'Error Resolving Template', _resolveError: true }; // BC63 FIX: Flag resolution failures
              }
            })
          );
          return {
            ...template,
            metadata: {
              ...template.metadata,
              phaseTemplates: resolvedPhaseTemplates,
            },
          };
        }
        return template;
      })
    );

    return NextResponse.json({ templates: templatesWithResolvedPhaseTemplates });
  } catch (error) {
    povLogger.error({ err: error }, 'templates GET error');
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pov-templates
 * Create a new template
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin role
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const data = await request.json();

    // ✅ P1 FIX: Comprehensive validation with CreatePOVTemplateSchema (Quarterly Review Q1 2026)
    const validation = CreatePOVTemplateSchema.safeParse(data);

    if (!validation.success) {
      // SECURITY LOGGING: Log validation failures (potential injection attempts)
      povLogger.error({ userId: user.userId, errors: validation.error.errors }, 'SECURITY: POV template validation failed');

      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }

    const validated = validation.data;

    // Ensure id is set (required by POVTemplate interface)
    const templateData = {
      ...validated,
      id: validated.id || `template-${Date.now()}`, // Generate if not provided
      name: validated.name,
      description: validated.description,
      fields: validated.fields,
      sections: validated.sections
    };

    const template = await povTemplateService.createTemplate(templateData as any, user.userId); // Use validated data

    return NextResponse.json({ template });
  } catch (error) {
    povLogger.error({ err: error }, 'templates POST error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
