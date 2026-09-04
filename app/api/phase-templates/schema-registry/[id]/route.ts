import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { schemaRegistry } from '@/lib/pov/phase-templates/schema-registry';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * GET /api/phase-templates/schema-registry/[id]
 * Get a schema by ID
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
    const schema = schemaRegistry.getSchema(id);

    if (!schema) {
      return NextResponse.json(
        { error: 'Schema not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id,
      title: schema.title || id,
      description: schema.description || '',
      schema
    });
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/phase-templates/schema-registry/[id]' }, 'Failed to fetch schema');
    return NextResponse.json(
      { error: 'Failed to fetch schema' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/phase-templates/schema-registry/[id]
 * Delete a schema
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
    const success = await schemaRegistry.removeSchema(id);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete schema' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error, endpoint: 'DELETE /api/phase-templates/schema-registry/[id]' }, 'Failed to delete schema');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to delete schema' },
      { status: 500 }
    );
  }
}
