import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { schemaRegistry } from '@/lib/pov/phase-templates/schema-registry';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * GET /api/phase-templates/schema-registry
 * Get all registered schemas
 */
export async function GET(request: NextRequest) {
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

    const schemas = Array.from(schemaRegistry.getAllSchemas().entries()).map(
      ([id, schema]) => ({
        id,
        title: schema.title || id,
        description: schema.description || '',
        schema
      })
    );

    return NextResponse.json({ schemas });
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/phase-templates/schema-registry' }, 'Failed to fetch schemas');
    return NextResponse.json(
      { error: 'Failed to fetch schemas' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/phase-templates/schema-registry
 * Register a new schema
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

    const { id, schema } = await request.json();
    
    if (!id) {
      return NextResponse.json(
        { error: 'Schema ID is required' },
        { status: 400 }
      );
    }
    
    if (!schema || typeof schema !== 'object') {
      return NextResponse.json(
        { error: 'Valid schema object is required' },
        { status: 400 }
      );
    }
    
    await schemaRegistry.registerSchema(id, schema);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    logger.error({ err: error, endpoint: 'POST /api/phase-templates/schema-registry' }, 'Failed to register schema');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to register schema' },
      { status: 500 }
    );
  }
}
