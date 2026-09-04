import { z } from 'zod';

/**
 * Field definition for a POV template
 */
export interface FieldDefinition {
  type: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect' | 'email' | 'phone' | 'url' | 'currency';
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: Array<{ label: string; value: string }>;
    customValidator?: string;
  };
  conditional?: {
    field: string;
    operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan';
    value: any;
  };
  ui?: {
    width?: 'full' | 'half' | 'third' | 'quarter';
    order?: number;
  };
}

/**
 * Section definition for a POV template
 */
export interface SectionDefinition {
  id: string;
  title: string;
  description?: string;
  fields: string[];
  conditional?: {
    field: string;
    operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan';
    value: any;
  };
  ui?: {
    order?: number;
  };
}

/**
 * POV template definition
 */
export interface POVTemplate {
  id: string;
  name: string;
  description: string;
  version?: string;
  status?: 'draft' | 'published' | 'deprecated';
  fields: Record<string, FieldDefinition>;
  sections: SectionDefinition[];
  metadata?: {
    author?: string;
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
    fieldMappings?: Record<string, string>;
    phaseTemplates?: string[]; // Array of phase template IDs
  };
}

/**
 * POV data from a template
 */
export interface POVData {
  templateId: string;
  formData: Record<string, any>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: any[];
}

/**
 * Zod schema for field definition
 */
export const fieldDefinitionSchema = z.object({
  type: z.enum(['text', 'textarea', 'number', 'date', 'boolean', 'select', 'multiselect', 'email', 'phone', 'url', 'currency']),
  label: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    options: z.array(z.object({
      label: z.string(),
      value: z.string()
    })).optional(),
    customValidator: z.string().optional()
  }).optional(),
  conditional: z.object({
    field: z.string(),
    operator: z.enum(['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan']),
    value: z.any()
  }).optional(),
  ui: z.object({
    width: z.enum(['full', 'half', 'third', 'quarter']).optional(),
    order: z.number().optional()
  }).optional()
});

/**
 * Zod schema for section definition
 */
export const sectionDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(z.string()),
  conditional: z.object({
    field: z.string(),
    operator: z.enum(['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan']),
    value: z.any()
  }).optional(),
  ui: z.object({
    order: z.number().optional()
  }).optional()
});

/**
 * Zod schema for POV template
 */
export const povTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  status: z.enum(['draft', 'published', 'deprecated']).optional(),
  fields: z.record(z.string(), fieldDefinitionSchema),
  sections: z.array(sectionDefinitionSchema),
  metadata: z.object({
    author: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    tags: z.array(z.string()).optional(),
    fieldMappings: z.record(z.string(), z.string()).optional(),
    phaseTemplates: z.array(z.string()).optional() // Array of phase template IDs
  }).optional()
});

/**
 * Zod schema for POV data
 */
export const povDataSchema = z.object({
  templateId: z.string(),
  formData: z.record(z.string(), z.any())
});

/**
 * Phase template reference for integration with POV templates
 */
export interface PhaseTemplateReference {
  id: string;
  name: string;
  description?: string;
  type?: string;
  order?: number;
}
