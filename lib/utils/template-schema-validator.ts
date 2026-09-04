/**
 * Template Schema Validator
 * 
 * This utility provides functions to validate and normalize template schemas
 * to ensure consistent data formats for storage and retrieval.
 */

import { z } from 'zod';
import { logger } from '@/lib/logger';

const schemaLogger = logger.child({ module: 'TemplateSchemaValidator' });

// Define the schema structure using Zod
const MetadataSchema = z.object({
  phaseTemplates: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString())
});

const TemplateSchemaSchema = z.object({
  metadata: MetadataSchema.default({})
}).catchall(z.any());

export type TemplateMetadata = z.infer<typeof MetadataSchema>;
export type TemplateSchema = z.infer<typeof TemplateSchemaSchema>;

/**
 * Validates and normalizes a template schema
 * 
 * @param schema The schema to validate and normalize
 * @returns A normalized schema with all required fields
 */
export function validateTemplateSchema(schema: any): TemplateSchema {
  // Handle null or undefined schema
  if (!schema) {
    return TemplateSchemaSchema.parse({});
  }
  
  // Handle string schema (parse JSON)
  if (typeof schema === 'string') {
    try {
      schema = JSON.parse(schema);
    } catch (e) {
      schemaLogger.error({ err: e }, 'Failed to parse schema string');
      return TemplateSchemaSchema.parse({});
    }
  }
  
  // Validate and normalize the schema
  try {
    return TemplateSchemaSchema.parse(schema);
  } catch (e) {
    schemaLogger.error({ err: e }, 'Schema validation error');
    return TemplateSchemaSchema.parse({});
  }
}

/**
 * Gets phase template IDs from a schema
 * 
 * @param schema The schema to extract phase template IDs from
 * @returns An array of phase template IDs
 */
export function getPhaseTemplateIds(schema: any): string[] {
  const validSchema = validateTemplateSchema(schema);
  return validSchema.metadata.phaseTemplates;
}

/**
 * Updates phase template IDs in a schema
 * 
 * @param schema The schema to update
 * @param phaseTemplateIds The phase template IDs to set
 * @returns An updated schema with the new phase template IDs
 */
export function updatePhaseTemplateIds(schema: any, phaseTemplateIds: string[]): TemplateSchema {
  const validSchema = validateTemplateSchema(schema);
  
  return {
    ...validSchema,
    metadata: {
      ...validSchema.metadata,
      phaseTemplates: phaseTemplateIds,
      updatedAt: new Date().toISOString()
    }
  };
}

/**
 * Checks if a schema needs normalization
 * 
 * @param schema The schema to check
 * @returns True if the schema needs normalization, false otherwise
 */
export function needsNormalization(schema: any): boolean {
  // Handle null or undefined schema
  if (!schema) {
    return true;
  }
  
  // Handle string schema
  if (typeof schema === 'string') {
    return true;
  }
  
  // Check if metadata exists
  if (!schema.metadata) {
    return true;
  }
  
  // Check if phaseTemplates exists and is an array
  if (!Array.isArray(schema.metadata.phaseTemplates)) {
    return true;
  }
  
  // Check if tags exists and is an array
  if (!Array.isArray(schema.metadata.tags)) {
    return true;
  }
  
  // Check if createdAt exists and is a string
  if (typeof schema.metadata.createdAt !== 'string') {
    return true;
  }
  
  // Check if updatedAt exists and is a string
  if (typeof schema.metadata.updatedAt !== 'string') {
    return true;
  }
  
  return false;
}