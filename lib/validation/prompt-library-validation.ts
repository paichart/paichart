import { z } from 'zod';
import { AgentCategory, AgentComplexity, AgentTemplateStatus } from '@prisma/client';
import { stripDangerousKeys } from '@/lib/utils/sanitize-keys';
import { FIELD_LIMITS } from './field-limits';

/**
 * Prompt Library Validation Schemas
 * Comprehensive input validation for admin-controlled prompt library
 *
 * Security: Prevents DoS, XSS, injection, prototype pollution
 * Pattern: Phase 5 MCP Security (Zod + .strict() + enum validation)
 *
 * @created 2025-10-31 Prompt Library Admin Security
 */

// Variable configuration schema
const PromptVariableConfigSchema = z.object({
  description: z.string().min(1).max(200),
  required: z.boolean().default(false),
  // Accept any type for default, will be coerced to string
  default: z.union([z.string(), z.number(), z.boolean()]).transform(val => String(val)).optional(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']).default('string'),
  // Additional optional fields for enhanced UX
  placeholder: z.string().max(200).optional(),
  validation: z.string().max(FIELD_LIMITS.SHORT_TEXT).optional(), // Regex or validation description
  helpText: z.string().max(FIELD_LIMITS.SHORT_TEXT).optional()
}).passthrough().transform(stripDangerousKeys); // Allow additional fields (admin-created prompts may have custom metadata)

// Examples schema with size limit
//
// #215 Phase 3 sweep (2026-05-23): size cap runs BEFORE strip per
// [[feedback_zod_refine_before_transform]]. Previously the strip ran
// first; an attacker submitting a __proto__-rooted subtree with many
// leaves would get stripped to a small value that passed the cap, but
// the CPU cost of the strip walk was already paid. Cap-before-strip
// bounds total work. Symmetric to fixes in tool-schemas.js (170e3119
// + 532a7660).
const PromptExamplesSchema = z.record(z.any())
  .refine(
    (examples) => { try { return JSON.stringify(examples).length <= 10000; } catch { return false; } },
    'Examples too large or too deeply nested (max 10KB)'
  )
  .transform(stripDangerousKeys)
  .optional();

/**
 * POST /api/agent-templates/prompt-library
 */
export const CreatePromptLibrarySchema = z.object({
  name: z.string()
    .min(1, 'Name required')
    .max(200, 'Name too long (max 200 chars)'),

  description: z.string()
    .max(5000, 'Description too long (max 5000 chars)')
    .nullish(),

  category: z.nativeEnum(AgentCategory, {
    errorMap: () => ({ message: 'Invalid category' })
  }),

  promptText: z.string()
    .min(10, 'Prompt too short (min 10 chars)')
    .max(50000, 'Prompt too long (max 50KB)'),
    // Admin-only: Remove strict injection checks (admins are trusted)
    // Keep basic DoS prevention only

  variables: z.record(
    z.string()
      .min(1)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/, 'Invalid variable name (alphanumeric + underscore only)'),
    PromptVariableConfigSchema
  )
  .refine(
    (vars) => Object.keys(vars).length <= 50,
    'Too many variables (max 50)'
  )
  .refine(
    (vars) => { try { return JSON.stringify(vars).length <= 20000; } catch { return false; } },
    'Variables JSON too large or too deeply nested (max 20KB)'
  )
  .optional(),

  examples: PromptExamplesSchema,

  // Note: MCP list responses truncate useCase to 200 chars for compact display.
  // Full useCase shown in detail views and web UI. UI recommends 2000 chars max.
  useCase: z.string()
    .min(1, 'Use case required')
    .max(2000, 'Use case too long (max 2000 chars)'),

  complexity: z.nativeEnum(AgentComplexity).default('MEDIUM'),

  estimatedTime: z.number()
    .int('Must be integer')
    .positive('Must be positive')
    .max(7200, 'Too long (max 2 hours = 7200 seconds)')
    .nullish(),

  tags: z.array(
    z.string()
      .max(50, 'Tag too long (max 50 chars)')
      .regex(/^[a-z0-9:-]+$/, 'Invalid tag format (lowercase, numbers, hyphens, colons only)')
      .transform(tag => tag.toLowerCase()) // Auto-convert to lowercase
  )
  .max(20, 'Too many tags (max 20)')
  .default([])
  .refine(
    (tags) => new Set(tags).size === tags.length,
    'Duplicate tags not allowed'
  ),

  isPublic: z.boolean().default(true),

  status: z.nativeEnum(AgentTemplateStatus).default('ACTIVE'),

}).strict();  // Prevent extra fields

export type CreatePromptLibrary = z.infer<typeof CreatePromptLibrarySchema>;

/**
 * PUT /api/agent-templates/prompt-library/[id]
 */
export const UpdatePromptLibrarySchema = CreatePromptLibrarySchema
  .partial()
  .strict();

export type UpdatePromptLibrary = z.infer<typeof UpdatePromptLibrarySchema>;

/**
 * GET /api/agent-templates/prompt-library query validation
 */
export const ListPromptsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  category: z.nativeEnum(AgentCategory).optional(),
  domain: z.string().max(50).optional(),
  mcpOnly: z.coerce.boolean().optional(),
  includeUsage: z.coerce.boolean().optional(),
  public: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).strict();

export type ListPromptsQuery = z.infer<typeof ListPromptsQuerySchema>;
