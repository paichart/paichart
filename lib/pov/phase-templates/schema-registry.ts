import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { povLogger } from '@/lib/logger';

const localLogger = povLogger.child({ module: 'SchemaRegistry' });

/**
 * Registry for managing custom schema extensions
 */
export class SchemaRegistry {
  private static instance: SchemaRegistry;
  private customSchemas: Map<string, any> = new Map();

  private constructor() {}

  public static getInstance(): SchemaRegistry {
    if (!SchemaRegistry.instance) {
      SchemaRegistry.instance = new SchemaRegistry();
    }
    return SchemaRegistry.instance;
  }

  /**
   * Initialize the registry with stored schemas
   */
  public async initialize(): Promise<void> {
    // Load custom schemas from database
    const schemas = await prisma.customSchema.findMany({
      take: 100
    });
    
    schemas.forEach(schema => {
      this.customSchemas.set(schema.id, schema.schema);
    });
  }

  /**
   * Register a custom schema
   */
  public async registerSchema(id: string, schema: any): Promise<void> {
    // Validate schema structure
    if (!schema.$schema || !schema.type) {
      throw new ApiError('BAD_REQUEST', 'Invalid schema format');
    }
    
    // Save to database
    await prisma.customSchema.upsert({
      where: { id },
      update: { schema: schema as any },
      create: {
        id,
        name: schema.title || id,
        schema: schema as any
      }
    });
    
    // Update in-memory cache
    this.customSchemas.set(id, schema);
  }

  /**
   * Get a schema by ID
   */
  public getSchema(id: string): any | undefined {
    return this.customSchemas.get(id);
  }

  /**
   * Get all registered schemas
   */
  public getAllSchemas(): Map<string, any> {
    return new Map(this.customSchemas);
  }

  /**
   * Remove a schema
   */
  public async removeSchema(id: string): Promise<boolean> {
    try {
      await prisma.customSchema.delete({
        where: { id }
      });
      
      this.customSchemas.delete(id);
      return true;
    } catch (error) {
      localLogger.error({ err: error, schemaId: id }, 'failed to remove schema');
      return false;
    }
  }

  /**
   * Extend the base template schema with custom properties
   */
  public extendTemplateSchema(baseSchema: any, extensions: any[]): any {
    const extendedSchema = { ...baseSchema };
    
    extensions.forEach(extension => {
      // Merge properties
      if (extension.properties) {
        extendedSchema.properties = {
          ...extendedSchema.properties,
          ...extension.properties
        };
      }
      
      // Merge required fields
      if (extension.required && Array.isArray(extension.required)) {
        extendedSchema.required = [
          ...new Set([...extendedSchema.required, ...extension.required])
        ];
      }
    });
    
    return extendedSchema;
  }
}

export const schemaRegistry = SchemaRegistry.getInstance();

// Initialize the registry when the module is loaded
if (typeof window === 'undefined') {
  // Only run on server-side
  schemaRegistry.initialize().catch(error => {
    localLogger.error({ err: error }, 'failed to initialize schema registry');
  });
}
