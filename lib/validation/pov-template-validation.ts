/**
 * POV Template Validation Schemas
 *
 * Comprehensive Zod validation for POV template operations.
 * Provides type-safe validation with injection detection.
 *
 * @version 1.0.0
 * @created 2026-02-16 (Q1 2026 Quarterly Review - P1 Security Fix)
 */

import { z } from 'zod';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { ValidationPatterns } from './input-validation-framework';
import { FIELD_LIMITS } from './field-limits';

/**
 * Field validation definition schema
 */
const FieldValidationSchema = z.object({
  min: z.number().min(0).max(1000000).nullable().optional(),
  max: z.number().min(0).max(1000000).nullable().optional(),
  pattern: z.string().max(FIELD_LIMITS.SHORT_TEXT).nullable().optional(),
  options: z.array(z.object({
    label: z.string().min(1).max(FIELD_LIMITS.NAME),
    value: z.string().min(1).max(FIELD_LIMITS.NAME)
  })).max(100).nullable().optional(),
  customValidator: z.string().max(FIELD_LIMITS.MODERATE_TEXT).nullable().optional()
}).nullable().optional();

/**
 * Conditional logic schema
 */
const ConditionalSchema = z.object({
  field: z.string().min(1).max(FIELD_LIMITS.NAME),
  operator: z.enum(['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan']),
  value: z.any()
}).optional();

/**
 * UI configuration schema
 */
const UIConfigSchema = z.object({
  width: z.enum(['full', 'half', 'third', 'quarter']).nullable().optional(),
  order: z.number().min(0).max(1000).nullable().optional()
}).nullable().optional();

/**
 * Field definition schema
 */
const FieldDefinitionSchema = z.object({
  type: z.enum(['text', 'textarea', 'number', 'date', 'boolean', 'select', 'multiselect', 'email', 'phone', 'url', 'currency']),
  label: z.string().min(1).max(FIELD_LIMITS.NAME),
  description: z.string().max(FIELD_LIMITS.MODERATE_TEXT).nullable().optional(),
  placeholder: z.string().max(FIELD_LIMITS.NAME).nullable().optional(),
  required: z.boolean().nullable().optional(),
  validation: FieldValidationSchema,
  conditional: ConditionalSchema,
  ui: UIConfigSchema
});

/**
 * Section definition schema
 */
const SectionDefinitionSchema = z.object({
  id: z.string().min(1).max(FIELD_LIMITS.NAME),
  title: z.string()
    .min(1, 'Section title required')
    .max(255, 'Section title too long')
    .refine((val) => {
      const check = detectPromptInjection(val);
      return check.severity !== 'CRITICAL';
    }, {
      message: 'Section title contains dangerous patterns'
    }),
  description: z.string().max(FIELD_LIMITS.MODERATE_TEXT).nullable().optional(),
  fields: z.array(z.string().min(1).max(FIELD_LIMITS.NAME)).min(1).max(50),
  conditional: ConditionalSchema,
  ui: UIConfigSchema
});

/**
 * POV template metadata schema
 */
const POVTemplateMetadataSchema = z.object({
  author: z.string().max(FIELD_LIMITS.NAME).nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  tags: z.array(z.string().max(FIELD_LIMITS.LABEL)).max(20).nullable().optional(),
  fieldMappings: z.record(z.string().max(255), z.string().max(255)).nullable().optional(),
  phaseTemplates: z.array(z.string().length(25)).max(10).nullable().optional() // CUID array
}).nullable().optional();

/**
 * Base POV template schema
 */
const BasePOVTemplateSchema = z.object({
  id: z.string().nullable().optional(), // Optional for creation
  name: z.string()
    .min(1, 'Template name required')
    .max(255, 'Template name too long')
    .refine((val) => {
      const check = detectPromptInjection(val);
      return check.severity !== 'CRITICAL';
    }, {
      message: 'Template name contains dangerous patterns'
    }),
  description: z.string()
    .min(1, 'Description required')
    .max(2000, 'Description too long')
    .refine((val) => {
      const check = detectPromptInjection(val);
      return check.severity !== 'CRITICAL';
    }, {
      message: 'Description contains dangerous patterns'
    }),
  version: z.string().max(50).nullable().optional(),
  status: z.enum(['draft', 'published', 'deprecated']).nullable().optional(),
  fields: z.record(z.string().max(255), FieldDefinitionSchema)
    .refine((fields) => Object.keys(fields).length > 0, {
      message: 'At least one field required'
    })
    .refine((fields) => Object.keys(fields).length <= 100, {
      message: 'Too many fields (max 100)'
    }),
  sections: z.array(SectionDefinitionSchema)
    .min(1, 'At least one section required')
    .max(20, 'Too many sections (max 20)'),
  metadata: POVTemplateMetadataSchema
});

/**
 * Create POV template schema
 * Used for POST /api/pov-templates
 */
export const CreatePOVTemplateSchema = BasePOVTemplateSchema.refine((data) => {
  // Cross-field validation: All section fields must exist in fields object
  for (const section of data.sections) {
    for (const fieldKey of section.fields) {
      if (!data.fields[fieldKey]) {
        return false;
      }
    }
  }
  return true;
}, {
  message: 'All section fields must be defined in template fields object'
});

/**
 * Update POV template schema
 * Used for PUT /api/pov-templates/[id]
 */
export const UpdatePOVTemplateSchema = BasePOVTemplateSchema
  .partial()
  .refine((data) => {
    // If updating both sections and fields, validate consistency
    if (data.sections && data.fields) {
      for (const section of data.sections) {
        for (const fieldKey of section.fields) {
          if (!data.fields[fieldKey]) {
            return false;
          }
        }
      }
    }
    return true;
  }, {
    message: 'All section fields must be defined in template fields object'
  });
