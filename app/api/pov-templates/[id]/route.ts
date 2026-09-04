import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { templateService } from '@/lib/pov/templates/service';
import { ApiError } from '@/lib/errors';
import { UpdatePOVTemplateSchema } from '@/lib/validation/pov-template-validation';
import { povLogger } from '@/lib/logger';

/**
 * GET /api/pov-templates/[id]
 * Get a template by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const template = await templateService.getTemplate(id);

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    povLogger.error({ err: error }, 'template GET error');
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/pov-templates/[id]
 * Update a template
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params;
    const data = await request.json();

    // ✅ P1 FIX: API-layer validation (defense-in-depth with service-layer validation)
    const validation = UpdatePOVTemplateSchema.safeParse(data);

    if (!validation.success) {
      // SECURITY LOGGING: Log validation failures
      povLogger.error({ userId: user.userId, templateId: id, errors: validation.error.errors }, 'SECURITY: POV template update validation failed');

      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }

    const validated = validation.data;

    // Ensure id is set for service (required by POVTemplate interface)
    const templateData = {
      ...validated,
      id, // Explicitly set id from params
      name: validated.name || '', // Ensure required fields have defaults
      description: validated.description || '',
      fields: validated.fields || {},
      sections: validated.sections || []
    };

    const template = await templateService.updateTemplate(id, templateData as any);

    return NextResponse.json({ template });
  } catch (error) {
    povLogger.error({ err: error }, 'template PUT error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pov-templates/[id]
 * Delete a template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params;
    await templateService.deleteTemplate(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    povLogger.error({ err: error }, 'template DELETE error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}
