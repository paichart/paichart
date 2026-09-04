/**
 * Zod schemas for workflow API validation
 *
 * NOTE: Re-exports WorkflowStepSchema from orchestration-params to avoid duplication
 * (validation-engine review - prevents schema drift)
 */
import { z } from 'zod';
import { MCPWorkflowExecutionStatus, MCPWorkflowStatus } from '@prisma/client';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';

// Re-export existing schema (DRY - validation-engine review)
export { WorkflowStepSchema } from '@/lib/services/workflow/types/orchestration-params';
import { WorkflowStepSchema, WORKFLOW_REQUIRES_KEYS } from '@/lib/services/workflow/types/orchestration-params';

// Full workflow config (stored in steps Json field)
//
// Handler-meta vs engine-schema cut (added 2026-05-17 per workflow-orch I3 + boundary-contract I6):
//   - `steps`, `executionMode`, `failureStrategy`, `timeout` flow into the orchestration engine
//   - `requires` is read by the Hub's workflow.execute dispatcher and used to gate the call
//     BEFORE any engine code runs. It never reaches the engine. Keep it here, NOT in
//     `MCPOrchestrationParamsSchema` in orchestration-params.ts.
//
// .catchall(z.unknown()) preserves unknown JSONB keys through API write paths (form-strip
// Fix A): if a caller or seed script stores additional keys we don't yet model, Zod won't
// silently drop them on validate. Catchall gives a narrower inferred index value type
// (`unknown` vs the `.passthrough()` form's loose `any`).
export const WorkflowConfigSchema = z.object({
  steps: z.array(WorkflowStepSchema).min(1).max(20),
  executionMode: z.enum(['sequential', 'parallel', 'conditional']).default('sequential'),
  failureStrategy: z.enum(['stop', 'continue', 'rollback']).default('stop'),
  timeout: z.number().min(1000).max(600000).default(60000),
  requires: z.array(z.enum(WORKFLOW_REQUIRES_KEYS)).max(WORKFLOW_REQUIRES_KEYS.length).optional()
}).catchall(z.unknown());

// Create workflow request
export const CreateWorkflowSchema = z.object({
  name: z.string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens')
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Name contains potentially dangerous patterns'
    }),  // XSS protection (sec-ops review Fix 8)
  description: z.string().max(1000).nullable().optional(),
  category: z.enum(['analysis', 'automation', 'deployment', 'documentation', 'general', 'intelligence', 'monitoring', 'onboarding', 'reporting', 'testing']).nullable().optional(),
  steps: WorkflowConfigSchema,
  triggers: z.object({
    manual: z.boolean().default(true),
    events: z.array(z.object({
      type: z.string(),
      filter: z.record(z.unknown()).optional()
    })).max(50).optional()  // DoS prevention (validation-engine review Fix 7)
  }).default({ manual: true }),
  schedule: z.object({
    cron: z.string(),
    timezone: z.string().default('UTC')
  }).nullable().optional()
});

// Update workflow request
export const UpdateWorkflowSchema = z.object({
  description: z.string().max(1000).optional(),
  category: z.enum(['analysis', 'automation', 'deployment', 'documentation', 'general', 'intelligence', 'monitoring', 'onboarding', 'reporting', 'testing']).optional(),
  steps: WorkflowConfigSchema.optional(),
  triggers: z.object({
    manual: z.boolean(),
    events: z.array(z.object({
      type: z.string(),
      filter: z.record(z.unknown()).optional()
    })).max(50).optional()  // DoS prevention (validation-engine review Fix 7)
  }).optional(),
  schedule: z.object({
    cron: z.string(),
    timezone: z.string()
  }).nullable().optional(),
  status: z.nativeEnum(MCPWorkflowStatus).optional()
}).strict(); // reject unknown keys LOUDLY (e.g. immutable `name` on update) instead of silently stripping

// Run workflow request
// NOTE: .passthrough() allows MCP metadata fields (validation-engine review)
export const RunWorkflowSchema = z.object({
  workflowName: z.string().optional(),
  steps: z.array(WorkflowStepSchema).min(1).max(20).optional(),
  executionMode: z.enum(['sequential', 'parallel', 'conditional']).default('sequential'),
  failureStrategy: z.enum(['stop', 'continue', 'rollback']).default('stop'),
  timeout: z.number().min(1000).max(600000).default(60000),
  povId: z.string().cuid().optional(),
  taskId: z.string().cuid().optional()
}).passthrough().refine(
  data => data.workflowName || data.steps,
  { message: 'Either workflowName or steps must be provided' }
);

// Query params for list
// NOTE: Added pagination (api-efficiency review)
export const ListWorkflowsQuerySchema = z.object({
  category: z.enum(['analysis', 'automation', 'deployment', 'documentation', 'general', 'intelligence', 'monitoring', 'onboarding', 'reporting', 'testing']).optional(),
  // Optional (no default): omitting status returns ALL statuses so the admin GUI can see + manage
  // PAUSED/DEPRECATED workflows. Pass ?status=ACTIVE explicitly for live-only.
  status: z.nativeEnum(MCPWorkflowStatus).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

// Query params for executions list
// NOTE: Uses nativeEnum to prevent drift with Prisma enum (validation-engine review)
export const ListExecutionsQuerySchema = z.object({
  workflowId: z.string().cuid().optional(),
  status: z.nativeEnum(MCPWorkflowExecutionStatus).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

// Type exports
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
export type CreateWorkflow = z.infer<typeof CreateWorkflowSchema>;
export type UpdateWorkflow = z.infer<typeof UpdateWorkflowSchema>;
export type RunWorkflow = z.infer<typeof RunWorkflowSchema>;
export type ListWorkflowsQuery = z.infer<typeof ListWorkflowsQuerySchema>;
export type ListExecutionsQuery = z.infer<typeof ListExecutionsQuerySchema>;

/**
 * Data Transfer Object for workflow data sent to frontend
 * Includes flattened steps array extracted from WorkflowConfigSchema
 *
 * Phase 0 Fix 0.5: Type safety improvements (types-system-specialist)
 */
export interface WorkflowDTO {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: MCPWorkflowStatus;

  // Flattened from WorkflowConfigSchema
  steps: z.infer<typeof WorkflowStepSchema>[];
  executionMode: 'sequential' | 'parallel' | 'conditional';
  failureStrategy: 'stop' | 'continue' | 'rollback';
  timeout: number;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
}

/**
 * Type guard to validate WorkflowConfig structure at runtime
 *
 * Phase 0 Fix 0.5: Type safety improvements (types-system-specialist)
 */
export function isWorkflowConfig(data: unknown): data is z.infer<typeof WorkflowConfigSchema> {
  return WorkflowConfigSchema.safeParse(data).success;
}

/**
 * Type-safe extraction of WorkflowConfig from database JSON
 * Returns null if the structure is invalid
 *
 * Phase 0 Fix 0.5: Type safety improvements (types-system-specialist)
 */
export function extractWorkflowConfig(
  stepsJson: unknown
): z.infer<typeof WorkflowConfigSchema> | null {
  if (!isWorkflowConfig(stepsJson)) {
    return null;
  }
  return stepsJson;
}
