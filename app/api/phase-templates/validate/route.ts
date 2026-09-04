import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { schemaValidator } from '@/lib/pov/phase-templates/validator';
import { schemaRegistry } from '@/lib/pov/phase-templates/schema-registry';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * POST /api/phase-templates/validate
 * Validate a template against a schema
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { schema, data, schemaId } = await request.json();
    
    let validationSchema = schema;
    
    // If schemaId is provided, use the schema from the registry
    if (schemaId && !schema) {
      const registeredSchema = schemaRegistry.getSchema(schemaId);
      if (!registeredSchema) {
        return NextResponse.json(
          { error: `Schema with ID ${schemaId} not found` },
          { status: 404 }
        );
      }
      validationSchema = registeredSchema;
    }
    
    // If no schema is provided, use the default template schema
    if (!validationSchema) {
      const validation = schemaValidator.validateTemplate(data);
      return NextResponse.json({
        valid: validation.valid,
        errors: validation.valid ? [] : schemaValidator.formatErrors(validation.errors)
      });
    }
    
    // Use Ajv to validate against the provided schema
    const ajv = new (require('ajv'))({ allErrors: true });
    require('ajv-formats')(ajv);
    
    const validate = ajv.compile(validationSchema);
    const valid = validate(data);
    
    return NextResponse.json({
      valid: !!valid,
      errors: valid ? [] : formatErrors(validate.errors)
    });
  } catch (error) {
    logger.error({ err: error, endpoint: 'POST /api/phase-templates/validate' }, 'Failed to validate template');
    
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to validate template' },
      { status: 500 }
    );
  }
}

/**
 * Format validation errors into human-readable messages
 */
function formatErrors(errors: any[]): string[] {
  if (!errors) return [];
  
  return errors.map(error => {
    const path = error.instancePath || '';
    const property = error.params.missingProperty ? 
      `/${error.params.missingProperty}` : '';
    
    switch (error.keyword) {
      case 'required':
        return `Missing required property: ${error.params.missingProperty}`;
      case 'enum':
        return `${path}${property} must be one of: ${error.params.allowedValues.join(', ')}`;
      case 'type':
        return `${path}${property} must be a ${error.params.type}`;
      default:
        return `${path}${property} ${error.message}`;
    }
  });
}
