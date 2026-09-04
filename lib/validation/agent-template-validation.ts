/**
 * Agent Template Validation Schemas
 *
 * Comprehensive Zod validation with integrated prompt injection detection.
 * Provides type-safe validation for agent template operations.
 *
 * @version 1.0.0
 * @created 2025-10-30
 * @specialist-reviewed validation-engine (90%), sec-ops (88%)
 */

import { z } from 'zod';
import { detectPromptInjection, extractPlaceholders } from '@/lib/security/prompt-injection-prevention';
import { AgentCategory, AgentPriority, AgentTemplateStatus, AgentComplexity, TemplateType } from '@prisma/client';
import { FormField } from './form-field-patterns';
import { FIELD_LIMITS } from './field-limits';
import { stripDangerousKeys } from '@/lib/utils/sanitize-keys';
import { safePassthrough, safeRecord } from './zod-helpers';
import { ModelParametersSchema } from './model-parameters';
import { RUNTIME_LIMITS } from './runtime-limits';
import { OptionalCUIDStrict } from './id-validation';
import { ValidationPatterns } from './input-validation-framework';
import { logger } from '@/lib/logger';

const localLogger = logger.child({ module: 'AgentTemplateValidation' });

/**
 * Variable value schema with integrated injection detection
 *
 * Validates:
 * - Type safety (string, number, boolean, object)
 * - Length limits (DoS prevention)
 * - Prompt injection patterns (CRITICAL detection)
 * - XSS patterns (code injection)
 */
export const VariableValueSchema = z.union([
  // String values with injection detection
  z.string()
    .max(2000, 'Variable value too long (max 2000 chars)')
    .refine((val) => {
      // ✅ Prompt injection detection
      const check = detectPromptInjection(val);
      return check.severity !== 'CRITICAL';
    }, {
      message: 'CRITICAL prompt injection detected in variable value'
    })
    .refine((val) => {
      // Additional check for HIGH severity in strict contexts
      const check = detectPromptInjection(val);
      if (check.severity === 'HIGH') {
        // Log but don't block (handled by strictMode in applyTemplateSafe)
        localLogger.warn({ riskScore: check.riskScore, patterns: check.detectedPatterns.map(p => p.category) }, 'HIGH-risk pattern detected in variable');
      }
      return true; // Allow but warn
    }),

  // Number values
  z.number()
    .min(-1000000, 'Number too small')
    .max(1000000, 'Number too large'),

  // Boolean values
  z.boolean(),

  // Object values (recursively checked)
  safePassthrough()
    .refine((obj) => {
      // Check object doesn't contain injection in serialized form
      let str: string;
      try { str = JSON.stringify(obj); } catch { return false; } // BC30: stack overflow guard
      if (str.length > 5000) {
        return false; // Object too large
      }

      const check = detectPromptInjection(str);
      return check.severity !== 'CRITICAL';
    }, {
      message: 'CRITICAL prompt injection detected in object variable'
    })
]);

/**
 * Template variable definition schema
 *
 * Used when defining variables in a template
 */
export const TemplateVariableDefinitionSchema = z.object({
  name: z.string()
    .regex(/^[a-zA-Z0-9_.]+$/, 'Variable name must be alphanumeric with dots/underscores only')
    .min(1, 'Variable name required')
    .max(50, 'Variable name too long (max 50 chars)'),

  required: z.boolean()
    .default(false),

  // Use FormField pattern to accept null from forms
  defaultValue: FormField.optional(z.any()),

  type: z.enum(['string', 'number', 'boolean', 'object', 'array'])
    .default('string'),

  // Use FormField pattern to accept null from forms
  description: FormField.optionalString(FIELD_LIMITS.SHORT_TEXT),

  // Use FormField pattern to accept null from forms
  validation: FormField.optional(z.object({
    minLength: FormField.optionalNumber(),
    maxLength: FormField.optionalNumber(),
    pattern: FormField.optionalString(), // Regex pattern
    enum: FormField.optional(z.array(z.string())) // Allowed values
  }))
}).refine((data) => {
  // Required variables cannot have default values
  if (data.required && data.defaultValue !== undefined) {
    return false;
  }
  return true;
}, {
  message: 'Required variables cannot have default values',
  path: ['defaultValue']
});

/**
 * Apply template request schema
 *
 * Used when applying a template with variables
 */
export const ApplyTemplateRequestSchema = z.object({
  // Database uses CUID format (@id @default(cuid()))
  taskId: z.string()
    .cuid('Invalid task ID format'),

  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  povId: FormField.optionalCUID('POV ID'),

  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  phaseId: FormField.optionalCUID('phase ID'),

  variables: z.record(
    // Key: variable name (alphanumeric + dots)
    z.string().regex(/^[a-zA-Z0-9_.]+$/),
    // Value: validated with injection detection
    VariableValueSchema
  ).refine((vars) => {
    // Limit number of variables (DoS prevention)
    return Object.keys(vars).length <= 100;
  }, {
    message: 'Too many variables (max 100)'
  }).refine((vars) => {
    // Check overall risk score across all variables
    let totalRiskScore = 0;
    for (const value of Object.values(vars)) {
      const check = detectPromptInjection(String(value));
      totalRiskScore += check.riskScore;
    }

    // Block if combined risk score too high
    return totalRiskScore < 200; // Threshold for combined risk
  }, {
    message: 'Combined variable risk score too high (possible coordinated injection attempt)'
  }),

  // Use FormField pattern to accept null from forms
  userContext: FormField.optional(z.object({
    userId: FormField.optionalString(),
    userEmail: FormField.optional(z.string().email()),
    userName: FormField.optionalString()
  }).passthrough().transform(stripDangerousKeys)),

  // Use FormField pattern to accept null from forms
  systemContext: FormField.optional(safePassthrough()),

  // Use FormField pattern to accept null from forms
  options: FormField.optional(z.object({
    strictMode: z.boolean().default(true),
    validateInjection: z.boolean().default(true),
    dryRun: z.boolean().default(false)
  }))
});

/**
 * Base agent template schema (without cross-field validation)
 *
 * Used for building create/update schemas
 */
const BaseAgentTemplateSchema = z.object({
  name: z.string()
    .min(1, 'Template name required')
    .max(255, 'Template name too long')
    .regex(ValidationPatterns.SAFE_TEXT, 'Template name contains unsafe characters')
    .refine((val) => !ValidationPatterns._SCRIPT_INJECTION_MATCH.test(val), 'Script injection pattern detected in name'),

  // Use FormField pattern to accept null from forms
  description: FormField.optionalString(FIELD_LIMITS.METADATA),

  category: z.nativeEnum(AgentCategory, {
    errorMap: () => ({ message: 'Invalid category' })
  }).default(AgentCategory.GENERAL),

  // Added 2026-04-17 (task #83 GUI-edit plumbing). Inline z.nativeEnum with
  // errorMap matches the existing `category` field style above. The canonical
  // TemplateTypeSchema at lib/validation/enum-validation.ts:167 lacks errorMap;
  // same-file consistency chosen over cross-file ideal (see
  // cline_docs/reviews/template-audit-2026-04-16/agent-builder-templatetype-category-plan.md §1.2).
  templateType: z.nativeEnum(TemplateType, {
    errorMap: () => ({ message: 'Invalid template type' })
  }).default(TemplateType.GENERALIST),

  defaultRole: z.string()
    .min(1, 'Default role required')
    .max(500, 'Default role too long')
    .refine((role) => {
      // Check role doesn't contain injection
      const check = detectPromptInjection(role);
      return check.severity !== 'CRITICAL';
    }, {
      message: 'Default role contains dangerous patterns'
    }),

  promptTemplate: z.string()
    .min(1, 'Prompt template required')
    .max(50000, 'Prompt template too long (max 50KB)')
    .refine((template) => {
      // Validate template itself doesn't contain CRITICAL injection
      const check = detectPromptInjection(template);
      return check.severity !== 'CRITICAL';
    }, {
      message: 'Template contains CRITICAL injection patterns'
    })
    .refine((template) => {
      // Check for malformed placeholders
      const unclosed = template.match(/{{[^}]*$/);
      return !unclosed;
    }, {
      message: 'Template has unclosed placeholder (malformed {{variable}})'
    })
    .refine((template) => {
      // Check for nested placeholders (not supported)
      const nested = template.match(/{{[^}]*{{/);
      return !nested;
    }, {
      message: 'Nested placeholders not supported'
    }),

  variables: z.array(TemplateVariableDefinitionSchema)
    .max(50, 'Too many template variables (max 50)')
    .superRefine((variables, ctx) => {
      // Check for duplicate variable names
      const names = variables.map(v => v.name);
      const duplicates = names.filter((n, i) => names.indexOf(n) !== i);

      if (duplicates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate variable names: ${Array.from(new Set(duplicates)).join(', ')}`,
          path: ['variables']
        });
      }
    }),

  // Use FormField pattern to accept null from forms
  capabilities: FormField.optional(safeRecord()),

  // Use FormField pattern to accept null from forms
  constraints: FormField.optional(safeRecord()),

  // Use FormField pattern to accept null from forms
  maxRetries: FormField.optional(
    z.number().int().min(0).max(RUNTIME_LIMITS.MAX_RETRIES).default(RUNTIME_LIMITS.DEFAULT_RETRIES)
  ),

  // Use FormField pattern to accept null from forms
  timeout: FormField.optional(
    z.number().int()
      .min(1000) // Min 1 second
      .max(600000) // Max 10 minutes
      .default(60000) // Default 1 minute
  ),

  // Use FormField pattern to accept null from forms
  priority: FormField.optional(
    z.nativeEnum(AgentPriority).default(AgentPriority.MEDIUM)
  ),

  // Use FormField pattern to accept null from forms
  complexity: FormField.optional(z.nativeEnum(AgentComplexity)),

  // Use FormField pattern to accept null from forms
  inputSchema: FormField.optional(safeRecord()),

  // Use FormField pattern to accept null from forms
  outputSchema: FormField.optional(safeRecord()),

  // Use FormField pattern to accept null from forms
  contextTemplate: FormField.optional(safeRecord()),

  // Use FormField pattern to accept null from forms
  metadata: FormField.optional(safeRecord()),

  // Use FormField pattern to accept null from forms
  version: FormField.optionalString(50),

  // Use FormField pattern to accept null from forms
  status: FormField.optional(
    z.nativeEnum(AgentTemplateStatus).default(AgentTemplateStatus.DRAFT)
  ),

  // Use FormField pattern to accept null from forms
  isDefault: FormField.optional(z.boolean().default(false)),

  // isPublic intentionally removed 2026-07-01: it was validated then silently dropped on the
  // agent-template create path (a phantom — AgentTemplateService has no isPublic field, and no
  // caller sent it). The prompt-library isPublic (a real visibility gate) is separate and unaffected.

  // Use FormField pattern to accept null from forms
  tags: FormField.optional(
    z.array(z.string().max(50)).max(20)
  )
});

/**
 * Create agent template schema
 *
 * Used when creating a new agent template
 */
export const CreateAgentTemplateSchema = BaseAgentTemplateSchema.refine((data) => {
  // Cross-field validation: All placeholders must have variable definitions
  const placeholders = extractPlaceholders(data.promptTemplate);
  const definedVars = data.variables.map((v: any) => v.name);
  const missing = placeholders.filter(p => !definedVars.includes(p));

  // Return true/false instead of throwing (Zod best practice)
  return missing.length === 0;
}, {
  message: 'Template has undefined variables. All {{placeholders}} must have corresponding variable definitions.'
});

/**
 * Update agent template schema
 */
export const UpdateAgentTemplateSchema = BaseAgentTemplateSchema
  .partial()
  .strict() // reject unknown keys LOUDLY instead of silently stripping (silent-strip class eradication 2026-06-30)
  .refine((data) => {
    // If updating promptTemplate and variables together, validate consistency
    if (data.promptTemplate && data.variables) {
      const placeholders = extractPlaceholders(data.promptTemplate);
      const definedVars = data.variables.map((v: any) => v.name);
      const missing = placeholders.filter(p => !definedVars.includes(p));

      // Return true/false instead of throwing (Zod best practice)
      return missing.length === 0;
    }
    return true;
  }, {
    message: 'Template has undefined variables. All {{placeholders}} must have corresponding variable definitions.'
  });

// 2026-05-14 P3 cleanup: deleted 3 orphan schemas + 4 orphan helpers.
// Validation-engine Protocol 4 audit found these had zero callers.
// The routes they were designed for (POST /api/agent-templates/[id]/bulk-apply,
// /preview, /validate) were never shipped. Builder route has its own
// inline ValidateTemplatePostSchema (different shape: { templateData }
// wrapper) — the two are not duplicates, and the orphan was strictly
// dead.
//
// Removed:
//   • BulkApplyTemplateRequestSchema
//   • ValidateTemplateRequestSchema
//   • PreviewTemplateRequestSchema
//   • isValidVariableName()           (0 callers)
//   • validateVariablesMatchTemplate() (0 callers)
//   • getRequiredVariables()           (0 callers)
//   • validateRequiredVariables()      (0 callers)
//
// Kept: TemplateVariableDefinitionSchema + VariableValueSchema —
// both used by live schemas elsewhere in this file.

// ========================================
// Agent Execution Validation Schemas
// Added: 2025-11-06 (Week 1 P0 security fixes)
// ========================================

/**
 * Agent Execution Schema with Prompt Injection Prevention
 *
 * Validates agent execution requests:
 * - Prompt injection detection (reuses existing detectPromptInjection)
 * - Field length limits (role: 255, prompt: 10000)
 * - CUID task IDs
 *
 * Risk: 90/125 (CRITICAL) - Prompt injection → AI bypass
 * Endpoint: POST /api/pov/agent/execute
 */
export const AgentExecuteSchema = z.object({
  // Required fields
  taskId: OptionalCUIDStrict('taskId'),

  // Agent configuration
  agentConfig: z.object({
    role: z.string()
      .min(1, 'Agent role is required')
      .max(255, 'Agent role must be 255 characters or less')
      .refine((val) => detectPromptInjection(val).isSafe, {
        message: 'Agent role contains HTML tags or instruction override patterns. Please use plain text.'
      }),

    // PIPELINE tasks have no prompt (auto-assigned at execution time), so the
    // GUI sends prompt: "" which must pass validation. Preprocess converts
    // empty/whitespace strings to undefined before the schema runs.
    prompt: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '') ? undefined : val,
      z.string()
        .min(10, 'Prompt must be at least 10 characters')
        .max(50000, 'Prompt must be 50000 characters or less')
        .refine((val) => detectPromptInjection(val).isSafe, {
          message: 'Prompt contains HTML tags or instruction override patterns. Please use plain text.'
        })
        .optional()
    ),

    // R-1/R-4 (2026-06-17) + model-aware (2026-06-18): the inline parameters object
    // is now the shared ModelParametersSchema (single source of truth). It admits
    // maxTokens/thinkingBudgetTokens up to the GLOBAL ceiling (Opus 128K) and the
    // runtime clamp (maxOutputTokensForModel at normalizeModelConfig) enforces the
    // real per-model limit; adds the maxToolTurns cap. Strict variant preserves
    // this object's prior unknown-key-strip posture.
    parameters: ModelParametersSchema.nullable().optional(),
  }),

  // Context
  context: safeRecord().nullable().optional(),
});

/**
 * Agent Function Execution Schema
 */
export const AgentExecuteFunctionSchema = z.object({
  taskId: OptionalCUIDStrict('taskId'),
  functionName: z.string()
    .min(1, 'Function name is required')
    .max(255, 'Function name must be 255 characters or less')
    .regex(/^[a-zA-Z0-9_]+$/, 'Function name must contain only alphanumeric characters and underscores'),

  parameters: safeRecord().optional(),
});

// ========================================
// Agent Execution Query Validation Schemas
// Added: 2025-11-08 (Week 2 P1 security fixes)
// ========================================

/**
 * Get Agent Executions Query Schema
 *
 * Validates query parameters for listing agent executions.
 * Prevents SQL injection and DoS attacks.
 *
 * Risk Prevention:
 * - SQL injection: Type validation, enum constraints
 * - DoS: Max limit 100, validated pagination
 * - Single-POV: Optional povId for single-POV scoping (faster, used in POV detail pages)
 * - Cross-POV: Omit povId for user-accessible POVs (dashboard/global views)
 *
 * Endpoint: GET /api/agent-executions
 */
export const GetAgentExecutionsQuerySchema = z.object({
  // Optional POV scope (context-aware: pass povId if available from URL, omit for cross-POV queries)
  povId: z.string()
    .cuid('Invalid POV ID format')
    .optional()
    .describe('POV ID to scope executions (optional: include for single-POV, omit for cross-POV dashboard queries)'),

  // Optional filters (allow 'global' special value for cross-task queries)
  taskId: z.union([
    z.literal('global'),  // Special value for dashboard cross-task queries
    z.string().cuid('Invalid task ID format')
  ]).optional(),

  status: z.enum([
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
  ]).optional(),

  dateRange: z.enum(['24h', '7d', '30d', '90d', 'all'])
    .default('7d')
    .optional(),

  // Pagination (DoS prevention)
  limit: z.coerce.number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .optional(),

  offset: z.coerce.number()
    .int()
    .min(0)
    .max(100000) // R-C1 (2026-06-17): was unbounded; cap deep-pagination scans
    .default(0)
    .optional(),

  // Date filters (alternative to dateRange)
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),

  // Sorting
  sortBy: z.enum(['createdAt', 'updatedAt', 'startTime', 'endTime', 'status'])
    .default('startTime')
    .optional(),

  sortOrder: z.enum(['asc', 'desc'])
    .default('desc')
    .optional()
}).refine((data) => {
  // Validate date range if both provided
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: 'startDate must be before or equal to endDate',
  path: ['startDate']
});

/**
 * Get Agent Executions Summary Query Schema
 *
 * Validates query parameters for execution summary endpoint.
 * Prevents SQL injection and DoS attacks.
 *
 * Risk Prevention:
 * - SQL injection: Type validation, enum constraints
 * - Single-POV: Optional povId for single-POV scoping (faster, used in POV detail pages)
 * - Cross-POV: Omit povId for user-accessible POVs (dashboard/global views)
 * - Invalid params: timeRange OR custom dates (not both)
 *
 * Endpoint: GET /api/agent-executions/summary
 */
export const GetAgentExecutionsSummaryQuerySchema = z.object({
  // Optional POV scope (context-aware: pass povId if available from URL, omit for cross-POV queries)
  povId: z.string()
    .cuid('Invalid POV ID format')
    .optional()
    .describe('POV ID to scope summary (optional: include for single-POV, omit for cross-POV dashboard queries)'),

  // Optional filters (allow 'global' special value for cross-task queries)
  taskId: z.union([
    z.literal('global'),  // Special value for dashboard cross-task queries
    z.string().cuid('Invalid task ID format')
  ]).optional(),

  // Time range for summary
  timeRange: z.enum(['24h', '7d', '30d', '90d', 'all'])
    .default('7d')
    .optional(),

  // Custom date range (alternative to timeRange)
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),

  // Group by options
  groupBy: z.enum(['status', 'task', 'agent', 'day', 'week', 'month'])
    .default('status')
    .optional()
}).refine((data) => {
  // Cannot use both timeRange and custom dates
  if (data.timeRange && data.timeRange !== 'all' && (data.startDate || data.endDate)) {
    return false;
  }
  return true;
}, {
  message: 'Cannot use timeRange with custom startDate/endDate',
  path: ['timeRange']
}).refine((data) => {
  // Validate date range if both provided
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: 'startDate must be before or equal to endDate',
  path: ['startDate']
});

// Type exports
export type AgentExecuteInput = z.infer<typeof AgentExecuteSchema>;
export type AgentExecuteFunctionInput = z.infer<typeof AgentExecuteFunctionSchema>;
export type GetAgentExecutionsQuery = z.infer<typeof GetAgentExecutionsQuerySchema>;
export type GetAgentExecutionsSummaryQuery = z.infer<typeof GetAgentExecutionsSummaryQuerySchema>;

/**
 * Prompt Library Update Schema
 * Used for PUT /api/agent-templates/prompt-library/[promptId]
 *
 * Security: Prevents ...body spread vulnerability (Q1 2026 Quarterly Review)
 * Critical: Uses .strict() to reject unknown fields (prevents privilege escalation)
 */
export const PromptLibraryUpdateSchema = z.object({
  name: z.string().min(1).max(FIELD_LIMITS.NAME).optional(),
  // description/estimatedTime are nullable columns and the PromptEditor form sends
  // null to mean "cleared" — .nullish() matches CreatePromptLibrarySchema's treatment.
  description: z.string().max(FIELD_LIMITS.DESCRIPTION).nullish(),
  category: z.nativeEnum(AgentCategory).optional(),
  promptText: z.string()
    .max(50000, 'Prompt text too long (max 50KB)')
    .refine((val) => {
      const check = detectPromptInjection(val);
      return check.severity !== 'CRITICAL';
    }, {
      message: 'CRITICAL prompt injection detected in prompt text'
    })
    .optional(),
  variables: z.any().optional(), // JSON field - framework validates on read
  examples: z.any().optional(), // JSON field - framework validates on read
  useCase: z.string().max(FIELD_LIMITS.MODERATE_TEXT).optional(),
  complexity: z.nativeEnum(AgentComplexity).optional(),
  estimatedTime: z.number().min(0).max(86400).nullish(), // Max 24 hours in seconds
  rating: z.number().min(1).max(5).optional(),
  version: z.string().max(50).optional(),
  status: z.nativeEnum(AgentTemplateStatus).optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
}).strict(); // ✅ CRITICAL: Reject unknown fields (prevents privilege escalation via usageCount/successRate injection)
