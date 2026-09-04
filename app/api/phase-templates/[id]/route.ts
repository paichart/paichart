import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { templateService } from '@/lib/services/template-service';
import { PhaseType } from '@prisma/client';
import { PhaseTemplateSchema } from '@/lib/validation/phase-template-validation';
import { logger } from '@/lib/logger';

/**
 * GET /api/phase-templates/[id]
 * Retrieves a specific phase template by ID
 * 
 * DELETE /api/phase-templates/[id]
 * Deletes a specific phase template by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get the authenticated user
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Phase templates are global resources (no owner column) — mutation is ADMIN-only,
    // matching the sibling /api/pov-templates/[id] gate. (IDOR fix 2026-05-26)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: admin role required' },
        { status: 403 }
      );
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

    // Check if the template is being used by any POVs
    const povsUsingTemplate = await prisma.pOV.findMany({
      where: {
        phases: {
          some: {
            templateId: id
          }
        }
      },
      select: {
        id: true,
        title: true
      }
    });

    if (povsUsingTemplate.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete template that is being used by POVs',
          povs: povsUsingTemplate
        },
        { status: 400 }
      );
    }

    // Delete the template from the database
    await prisma.phaseTemplate.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting phase template');
    return NextResponse.json(
      { error: 'Failed to delete phase template' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get the authenticated user
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Phase templates are global resources (no owner column) — mutation is ADMIN-only,
    // matching the sibling /api/pov-templates/[id] gate. (IDOR fix 2026-05-26)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: admin role required' },
        { status: 403 }
      );
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

    const data = await request.json();

    // ✅ P0 FIX: Comprehensive validation with PhaseTemplateSchema (Quarterly Review Q1 2026)
    const validation = PhaseTemplateSchema.safeParse(data);

    if (!validation.success) {
      // SECURITY LOGGING: Log validation failures (potential injection attempts)
      logger.error({ userId: user.userId, templateId: id, errors: validation.error.errors }, 'SECURITY: Phase template update validation failed');

      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }

    const validated = validation.data;

    // Check if template exists
    const existingTemplate = await prisma.phaseTemplate.findUnique({
      where: { id }
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Standardize task properties in stages if they exist (use validated data)
    let workflow = existingTemplate.workflow;
    if (validated.stages && Array.isArray(validated.stages)) {
      const standardizedStages = validated.stages.map((stage: any) => ({
        ...stage,
        tasks: stage.tasks?.map((task: any) => ({
          ...task,
          id: task.id || task.key || `task-${Math.random().toString(36).substr(2, 9)}`,
          title: task.title || task.name || '',
          dependencies: (task.dependencies || []).filter((dep: any) => dep !== undefined)
        })) || []
      }));

      workflow = {
        stages: standardizedStages
      };
    }

    // Use validated type (already validated by PhaseTemplateSchema)
    const phaseType: PhaseType = validated.type || existingTemplate.type;

    // Update the template in the database (use validated data)
    const updatedTemplate = await prisma.phaseTemplate.update({
      where: { id },
      data: {
        name: validated.name,
        description: validated.description || '',
        type: phaseType,
        isDefault: validated.isDefault !== undefined ? validated.isDefault : existingTemplate.isDefault,
        workflow: workflow as any
      }
    });

    // Normalize the response
    const normalizedTemplate = {
      id: updatedTemplate.id,
      name: updatedTemplate.name,
      description: updatedTemplate.description,
      type: updatedTemplate.type,
      isDefault: updatedTemplate.isDefault,
      stages: (workflow as any)?.stages || [],
      createdAt: updatedTemplate.createdAt,
      updatedAt: updatedTemplate.updatedAt
    };

    return NextResponse.json(normalizedTemplate);
  } catch (error) {
    logger.error({ err: error }, 'Error updating phase template');
    return NextResponse.json(
      { error: 'Failed to update phase template' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get the authenticated user
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

    // Fetch the template from the database
    const template = await prisma.phaseTemplate.findUnique({
      where: { id }
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Normalize the template data
    const normalizedTemplate = {
      id: template.id,
      name: template.name,
      description: template.description || undefined, // Convert null to undefined
      type: template.type,
      isDefault: template.isDefault,
      // Extract stages from the workflow JSON
      stages: (template.workflow as any)?.stages || [],
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
    };

    // Resolve dependency IDs to names
    const templateWithResolvedIds = await templateService.resolveIdsToNames(normalizedTemplate);

    return NextResponse.json(templateWithResolvedIds);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching phase template');
    return NextResponse.json(
      { error: 'Failed to fetch phase template' },
      { status: 500 }
    );
  }
}
