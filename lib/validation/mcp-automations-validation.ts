import { z } from 'zod';
import { FormField } from './form-field-patterns';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { FIELD_LIMITS } from './field-limits';
import { RUNTIME_LIMITS } from './runtime-limits';

/**
 * MCP Automations Validation Schemas
 * Validates query parameters for automation endpoints
 *
 * @created 2025-10-31 Phase 5 MCP Security
 */

// Automation status enum
export const AutomationStatusSchema = z.enum([
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'PENDING'
]);

// Recommendation type enum
export const RecommendationTypeSchema = z.enum([
  'OPTIMIZATION',
  'AUTOMATION',
  'INTEGRATION',
  'SECURITY',
  'PERFORMANCE'
]);

// Recommendation priority enum
export const RecommendationPrioritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
]);

// Recommendation status enum
export const RecommendationStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'IMPLEMENTED'
]);

/**
 * GET /api/mcp/automations query validation
 */
export const ListAutomationsQuerySchema = z.object({
  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  taskId: FormField.optionalCUID('task ID'),
  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  povId: FormField.optionalCUID('POV ID'),
  // Use FormField pattern to accept null from forms
  status: FormField.optional(AutomationStatusSchema),
  // Use FormField pattern to accept null from forms
  limit: FormField.optional(z.coerce.number().int().min(1).max(100)),
}).strict();

export type ListAutomationsQuery = z.infer<typeof ListAutomationsQuerySchema>;

/**
 * GET /api/mcp/automation-metrics query validation
 */
export const AutomationMetricsQuerySchema = z.object({
  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  taskId: FormField.optionalCUID('task ID'),
  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  povId: FormField.optionalCUID('POV ID'),
  // Use FormField pattern to accept null from forms
  startDate: FormField.optional(z.coerce.date()),
  // Use FormField pattern to accept null from forms
  endDate: FormField.optional(z.coerce.date()),
}).strict();

export type AutomationMetricsQuery = z.infer<typeof AutomationMetricsQuerySchema>;

/**
 * GET /api/mcp/ai-recommendations query validation
 */
export const AIRecommendationsQuerySchema = z.object({
  // Use FormField pattern to accept null from forms
  status: FormField.optional(z.enum(['all', 'PENDING', 'APPROVED', 'REJECTED', 'IMPLEMENTED'])),
  // Use FormField pattern to accept null from forms
  type: FormField.optional(z.enum(['all', 'OPTIMIZATION', 'AUTOMATION', 'INTEGRATION', 'SECURITY', 'PERFORMANCE'])),
  // Use FormField pattern to accept null from forms
  priority: FormField.optional(z.enum(['all', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])),
  // Use FormField pattern to accept null from forms
  confidence: FormField.optional(z.enum(['all', 'low', 'medium', 'high'])),
  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  povId: FormField.optionalCUID('POV ID'),
  // Use FormField pattern to accept null from forms
  limit: FormField.optional(z.coerce.number().int().min(1).max(100)),
}).strict();

export type AIRecommendationsQuery = z.infer<typeof AIRecommendationsQuerySchema>;

/**
 * POST /api/mcp/automations/[id]/configure body validation
 * BC29/BC30 FIX: Was completely unvalidated (raw body spread into JSON columns)
 */
export const AutomationConfigUpdateSchema = z.object({
  execution: z.object({
    maxRetries: z.number().int().min(0).max(RUNTIME_LIMITS.MAX_RETRIES).optional(),
    timeout: z.number().int().min(1).max(86400).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  }).optional(),
  notifications: z.object({
    onSuccess: z.boolean().optional(),
    onFailure: z.boolean().optional(),
    onTimeout: z.boolean().optional(),
  }).optional(),
  performance: z.object({
    memoryLimit: z.string().max(20).optional(),
    cpuLimit: z.string().max(20).optional(),
    diskLimit: z.string().max(20).optional(),
  }).optional(),
}).strict();

export type AutomationConfigUpdate = z.infer<typeof AutomationConfigUpdateSchema>;

/**
 * POST /api/mcp/tasks/recommendations body validation
 * BC30 FIX: JSON fields had no size or depth limits
 */
export const CreateRecommendationSchema = z.object({
  type: z.enum(['OPTIMIZATION', 'AUTOMATION', 'QUALITY_IMPROVEMENT', 'COST_REDUCTION', 'RISK_MITIGATION']),
  // 2026-05-14 P1 (sec-ops F-03): added .refine(detectPromptInjection) on
  // both text fields. Recommendations are persisted to DB and rendered in
  // the UI activity feed; also consumed by the AI recommender for further
  // analysis (LLM-context attack surface).
  title: z.string().min(1).max(FIELD_LIMITS.TITLE)
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Title contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  description: z.string().min(1).max(FIELD_LIMITS.METADATA)
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Description contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  confidence: z.number().min(0).max(1),
  impact: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('MEDIUM'),
  effort: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('MEDIUM'),
  actions: z.record(z.unknown()).refine(
    (val) => { try { return JSON.stringify(val).length <= 50000; } catch { return false; } },
    'Actions object too large or too deeply nested (max 50KB)'
  ).optional().default({}),
  parameters: z.record(z.unknown()).refine(
    (val) => { try { return JSON.stringify(val).length <= 50000; } catch { return false; } },
    'Parameters object too large or too deeply nested (max 50KB)'
  ).optional().default({}),
  context: z.record(z.unknown()).refine(
    (val) => { try { return JSON.stringify(val).length <= 50000; } catch { return false; } },
    'Context object too large or too deeply nested (max 50KB)'
  ).optional().default({}),
  taskId: z.string().cuid().optional(),
  povId: z.string().cuid().optional(),
  toolId: z.string().max(200).optional(),
});

export type CreateRecommendation = z.infer<typeof CreateRecommendationSchema>;
