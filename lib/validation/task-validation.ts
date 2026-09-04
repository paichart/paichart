/**
 * Task Management Validation Schemas
 * Centralized validation for Week 3 task endpoints
 *
 * @version 1.0
 * @created 2025-10-30
 * @specialist-reviewed validation-engine (85%), sec-ops (82%)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Task-Shape Schema Universe (4 variants — keep in sync when adding fields)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Adding a new field to "task" requires touching ALL FOUR shape variants below.
 * A new injection refine, length cap, or enum tightening on one without the
 * others creates BC75 sibling drift. The 2026-05-15 convergence eliminated
 * 5 such drifts; see registry §Task-Shape Sibling Drift for the audit history.
 *
 * 1. CreateTaskSchema (this file, ~L20)
 *    POST /api/pov/[povId]/phase/[phaseId]/task — single-task create.
 *    All Prisma-required fields required here; `povId` required (URL semantic);
 *    has defaults on status/priority.
 *
 * 2. UpdateTaskSchema (this file, ~L110)
 *    PUT /api/pov/[povId]/.../task/[taskId] — single-task update.
 *    All fields optional; refines that data has at least one key.
 *
 * 3. UpdateTaskStatusSchema (this file, ~L175)
 *    Status-transition endpoint with audit fields (blockReason, notes) and
 *    a "BLOCKED requires blockReason" business-rule refine. Status field uses
 *    z.nativeEnum directly (with custom error map), not PrismaEnum.taskStatus —
 *    same enum source, benign drift. Inventory awareness only.
 *
 * 4. NestedTaskInputSchema (lib/validation/task-shapes.ts)
 *    `UpdatePOVSchemaComprehensive.tasks` (comprehensive POV PUT) + future MCP
 *    pov.update handler. All fields optional except title; has `id` for batch
 *    targeting and `modelParameters` for handler routing into metadata.
 *
 * Cross-cutting helpers:
 * - `FormField.optionalCUID(...)` — form-friendly (null→undefined transform).
 *   Use for fields a UI form sends. Imports from './form-field-patterns'.
 * - `OptionalCUIDStrict(...)` — rejects null. Use for action parameters
 *   (bulk operations, move targets, query strings). Imports from
 *   './id-validation'. Renamed 2026-05-15 to disambiguate from the form variant.
 * - `PrismaEnum.taskType` / `.taskStatus` / `.taskPriority`
 *   — auto-syncs with the Prisma schema; use over hardcoded z.enum literals
 *   to prevent BC75 enum drift. (`.executionStatus` exists but is NOT used by
 *   the client-input schemas in this file — F1 2026-07-25, engine-owned field.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { FormField } from './form-field-patterns';
import { FIELD_LIMITS } from './field-limits';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { OptionalCUIDStrict } from '@/lib/validation/id-validation';
import { stripDangerousKeys } from '@/lib/utils/sanitize-keys';
import { safeRecord } from './zod-helpers';
import { RUNTIME_LIMITS } from './runtime-limits';
import { PrismaEnum } from './enum-validation';

// ✅ Task creation validation
export const CreateTaskSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(FIELD_LIMITS.TITLE, 'Title too long')
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Title contains HTML tags or instruction override patterns. Please use plain text.'
    }),

  // Use FormField pattern to accept null from forms
  // Limit increased to 50KB to support agent execution prompts with markdown/examples
  description: FormField.optionalString(FIELD_LIMITS.CONTENT)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Description contains HTML tags or instruction override patterns. Please use plain text.'
    }),

  // Database uses CUID format (@id @default(cuid()))
  povId: z.string().cuid('Invalid POV ID'), // Required for POV access check

  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  phaseId: FormField.optionalCUID('phase ID'),

  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  stageId: FormField.optionalCUID('stage ID'),

  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  assigneeId: FormField.optionalCUID('assignee ID'),

  // Use Prisma enum to prevent drift (TaskPriority: HIGH, MEDIUM, LOW)
  priority: z.nativeEnum(TaskPriority, {
    errorMap: () => ({ message: 'Invalid priority' })
  }).default(TaskPriority.MEDIUM),

  // Use Prisma enum to prevent drift (TaskStatus: OPEN, IN_PROGRESS, COMPLETED, BLOCKED)
  status: z.nativeEnum(TaskStatus, {
    errorMap: () => ({ message: 'Invalid status' })
  }).default(TaskStatus.OPEN),

  // Use FormField pattern to accept null from forms
  dueDate: FormField.optionalDateTime(),

  // Use FormField pattern to accept null from forms
  estimatedHours: FormField.optionalNumber(0, 1000),

  // Use FormField pattern to accept null from forms
  tags: FormField.optional(
    z.array(z.string().max(FIELD_LIMITS.ID, 'Tag too long')).max(20, 'Too many tags (max 20)')
  ),

  // 2026-05-14 BC76 fix: handlers at lib/tasks/handlers/{task,post}.ts and
  // lib/tasks/services/task.ts:updateTask read/write all of these fields,
  // but the schema didn't declare them — so safeParse + .data swap would
  // have silently dropped them. Refines mirror TaskAgentExecuteSchema for
  // the text fields that feed into LLM execution.
  teamId: FormField.optionalCUID('team ID'),
  agentRole: FormField.optionalString(FIELD_LIMITS.NAME)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Agent role contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  agentTemplateId: FormField.optionalCUID('agent template ID'),
  prompt: FormField.optionalString(FIELD_LIMITS.CONTENT)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Prompt contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  inputContext: safeRecord().nullable().optional(),
  outputArtifacts: FormField.optional(z.array(safeRecord())),
  // F1 (2026-07-25): executionStatus is ENGINE-owned — deliberately NOT accepted from
  // clients. It is the terminal-family fact the engine predicates read (reactor dependents
  // scan `executionStatus IS DISTINCT FROM 'FAILED'`; F16 cone + claim CAS + the
  // all-children-terminal completion invariant all key off it). Authorized writers are the
  // engine family (direct Prisma) and workflowEngine, which passes an untyped literal to
  // TaskService and never touches Zod — so removing it here breaks no internal caller.
  // Same invariant as the POV-PUT handler strip (SYNTHESIS §1.9), enforced one layer earlier.
  // DO NOT RE-ADD (a client could forge a task born SUCCESS, or freeze one out of the
  // cascade with FAILED). Pinned by test-completion-core-boundary.ts + test-task-handler-bc76.ts.
  agentLog: FormField.optionalString(FIELD_LIMITS.CONTENT)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Agent log contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  mcpToolId: FormField.optionalCUID('MCP tool ID'),
  mcpWorkflowId: FormField.optionalCUID('MCP workflow ID'),
  mcpContext: safeRecord().nullable().optional(),
  mcpMetadata: safeRecord().nullable().optional(),
  maxRetries: FormField.optionalNumber(0, RUNTIME_LIMITS.MAX_RETRIES),
  timeout: FormField.optionalNumber(0, 3600000),
  parentTaskId: FormField.optionalCUID('parent task ID'),
  type: FormField.optional(PrismaEnum.taskType),
  order: FormField.optionalNumber(0, 1_000_000),
  dependencyIds: FormField.optional(
    z.array(z.string().cuid('Invalid dependency ID')).max(50, 'Too many dependencies (max 50)')
  ),
  // WS2 Phase A (2026-08-17): a task must not be BORN with a platform stamp (create-forgery
  // channel, panel B-3/B1b — self-promote gains F10 programConfidence on a non-confidence-bearing
  // protocol; self-demote silently loses F12). Refine BEFORE transform (standing rule: a refine
  // chained after safeRecord()'s transform silently skips on failure), inside the FormField
  // wrapper. The platform stamps server-side at first execution.
  metadata: FormField.optional(
    z.record(z.any())
      .superRefine((data, ctx) => {
        for (const key of ['protocol', 'protocolResolvedAt']) {
          if (data && typeof data === 'object' && key in data) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message: `metadata.${key} is resolved by the platform at first execution and is not writable at create (PROTOCOL_STAMP_IMMUTABLE)`,
            });
          }
        }
      })
      .transform(stripDangerousKeys)
  ),
});

// ✅ Task update validation
export const UpdateTaskSchema = z.object({
  // Use FormField pattern to accept null from forms (with min validation)
  title: FormField.optionalString(FIELD_LIMITS.TITLE)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Title contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  // Use FormField pattern to accept null from forms
  // Limit increased to 50KB to support agent execution prompts with markdown/examples
  description: FormField.optionalString(FIELD_LIMITS.CONTENT)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Description contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  assigneeId: FormField.optionalCUID('assignee ID'),
  // Use Prisma enum to prevent drift (TaskPriority: HIGH, MEDIUM, LOW) + accepts null
  priority: FormField.optional(z.nativeEnum(TaskPriority)),
  // Use FormField pattern to accept null from forms
  dueDate: FormField.optionalDateTime(),
  // Use FormField pattern to accept null from forms
  estimatedHours: FormField.optionalNumber(0, 1000),
  // Use FormField pattern to accept null from forms
  tags: FormField.optional(
    z.array(z.string().max(FIELD_LIMITS.ID)).max(20)
  ),

  // 2026-05-14 BC76 fix: same fields TaskService.updateTask actually writes
  // (lib/tasks/services/task.ts:622-820). Without declaring them here, the
  // updateTaskHandler swap from `data` → `validation.data` would silently
  // strip every agent-execution field. Refines mirror TaskAgentExecuteSchema.
  status: FormField.optional(z.nativeEnum(TaskStatus)),
  stageId: FormField.optionalCUID('stage ID'),
  teamId: FormField.optionalCUID('team ID'),
  agentRole: FormField.optionalString(FIELD_LIMITS.NAME)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Agent role contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  agentTemplateId: FormField.optionalCUID('agent template ID'),
  prompt: FormField.optionalString(FIELD_LIMITS.CONTENT)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Prompt contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  inputContext: safeRecord().nullable().optional(),
  outputArtifacts: FormField.optional(z.array(safeRecord())),
  // F1 (2026-07-25): executionStatus deliberately absent — engine-owned.
  // See the tombstone in CreateTaskSchema above. Do not re-add.
  agentLog: FormField.optionalString(FIELD_LIMITS.CONTENT)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Agent log contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  mcpToolId: FormField.optionalCUID('MCP tool ID'),
  mcpWorkflowId: FormField.optionalCUID('MCP workflow ID'),
  mcpContext: safeRecord().nullable().optional(),
  mcpMetadata: safeRecord().nullable().optional(),
  maxRetries: FormField.optionalNumber(0, RUNTIME_LIMITS.MAX_RETRIES),
  timeout: FormField.optionalNumber(0, 3600000),
  parentTaskId: FormField.optionalCUID('parent task ID'),
  type: FormField.optional(PrismaEnum.taskType),
  order: FormField.optionalNumber(0, 1_000_000),
  dependencyIds: FormField.optional(
    z.array(z.string().cuid('Invalid dependency ID')).max(50, 'Too many dependencies (max 50)')
  ),
  metadata: FormField.optional(safeRecord()),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field required for update'
});

// ✅ Task status update validation
export const UpdateTaskStatusSchema = z.object({
  // Use Prisma enum to prevent drift (TaskStatus: OPEN, IN_PROGRESS, COMPLETED, BLOCKED)
  status: z.nativeEnum(TaskStatus, {
    errorMap: () => ({ message: 'Invalid status' })
  }),

  // 2026-05-14 P1: added .refine(detectPromptInjection) — these text fields
  // persist to task.blockReason / task.notes (rendered in UI + activity log)
  // and were missing the injection refine that every other text field on
  // CreateTask/UpdateTask carries.
  blockReason: FormField.optionalString(FIELD_LIMITS.SHORT_TEXT)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Block reason contains HTML tags or instruction override patterns. Please use plain text.'
    }),

  notes: FormField.optionalString(FIELD_LIMITS.MODERATE_TEXT)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Notes contain HTML tags or instruction override patterns. Please use plain text.'
    })
}).refine(data => {
  // ✅ Business rule: BLOCKED status requires reason
  if (data.status === 'BLOCKED' && !data.blockReason) {
    return false;
  }
  return true;
}, {
  message: 'Block reason required when status is BLOCKED'
});

// ✅ Task dependency validation
export const TaskDependencySchema = z.object({
  // Database uses CUID format (@id @default(cuid()))
  dependsOnId: z.string().cuid('Invalid task ID'), // ✅ Correct field name from Prisma schema

  dependencyType: z.enum(['BLOCKS', 'REQUIRED', 'RELATED'], {
    errorMap: () => ({ message: 'Invalid dependency type' })
  }).default('BLOCKS').optional() // Optional - not in Prisma schema
});

// ✅ Task attachment validation (matches Prisma Attachment schema)
export const TaskAttachmentSchema = z.object({
  filename: z.string()
    .min(1, 'Filename required')
    .max(255, 'Filename too long'),

  fileType: z.string()
    .max(100, 'File type too long'),

  fileSize: z.number()
    .min(1, 'File cannot be empty')
    .max(100 * 1024 * 1024, 'File too large (max 100MB)'),

  // BC53 FIX: Restrict to https:// protocol only — prevents file://, javascript:, data: URI attacks
  storageUrl: z.string()
    .url('Invalid storage URL')
    .max(FIELD_LIMITS.URL_LONG, 'URL too long')
    .refine(
      (url) => url.startsWith('https://'),
      'Storage URL must use HTTPS protocol'
    )
});

// ========================================
// Task Operations Validation Schemas
// Added: 2025-11-06 (Week 3 P2 - Group 4 Task Management)
// ========================================

/**
 * Move Task Schema - Move task to different phase/stage
 */
export const MoveTaskSchema = z.object({
  taskId: OptionalCUIDStrict('taskId'),
  targetPhaseId: OptionalCUIDStrict('phaseId'),
  targetStageId: OptionalCUIDStrict('stageId'),
  position: z.number().int().min(0).max(1000).nullable().optional(),
}).refine(
  data => data.targetPhaseId || data.targetStageId,
  { message: 'Must specify either targetPhaseId or targetStageId' }
);

/**
 * REST task-move request schema (POST .../task/[taskId]/move).
 *
 * Field names match what app/api/.../task/[taskId]/move/route.ts:48 reads —
 * different from MoveTaskSchema's MCP-aligned shape (targetPhaseId etc.).
 * Two parallel schemas exist by design: MoveTaskSchema is for the
 * MCP `task.move` action, MoveTaskRequestSchema is the REST endpoint.
 */
export const MoveTaskRequestSchema = z.object({
  newStageId: FormField.optionalCUID('new stage ID'),
  newOrder: FormField.optionalNumber(0, 1_000_000),
  newStatus: FormField.optional(z.nativeEnum(TaskStatus)),
}).refine(
  data => data.newStageId || data.newStatus,
  { message: 'Either newStageId or newStatus is required' }
);

/**
 * Reorder Tasks Schema - Reorder tasks within phase/stage
 */
export const ReorderTasksSchema = z.object({
  phaseId: OptionalCUIDStrict('phaseId'),
  stageId: OptionalCUIDStrict('stageId'),
  taskIds: z.array(OptionalCUIDStrict('taskId'))
    .min(1, 'At least one task ID required')
    .max(100, 'Maximum 100 tasks allowed'), // DoS prevention
}).refine(
  data => data.phaseId || data.stageId,
  { message: 'Must specify either phaseId or stageId' }
);

// ========================================
// Task Agent Execution Schema
// Added: 2025-11-07 (Week 1 P0-2 - Prompt injection protection)
// ========================================

/**
 * Task Agent Execute Schema with Prompt Injection Protection
 * For: POST /api/tasks/[taskId]/agent/execute
 */
export const TaskAgentExecuteSchema = z.object({
  overrideConfig: z.object({
    agentRole: z.string()
      .max(255, 'Agent role must be 255 characters or less')
      .refine((val) => detectPromptInjection(val).isSafe, {
        message: 'Agent role contains HTML tags or instruction override patterns. Please use plain text.'
      })
      .optional(),

    prompt: z.string()
      .max(50000, 'Prompt must be 50000 characters or less') // Increased for complex agent prompts
      .refine((val) => detectPromptInjection(val).isSafe, {
        message: 'Prompt contains HTML tags or instruction override patterns. Please use plain text.'
      })
      .optional(),

    inputContext: safeRecord().nullable().optional(),
    maxRetries: z.number().min(1).max(RUNTIME_LIMITS.MAX_RETRIES).nullable().optional(),
    timeout: z.number().min(1000).max(600000).nullable().optional(), // 1s to 10min

    // MCP overrides
    mcpToolId: OptionalCUIDStrict('mcpToolId'),
    mcpWorkflowId: OptionalCUIDStrict('mcpWorkflowId'),
    mcpContext: safeRecord().nullable().optional(),
    mcpMetadata: safeRecord().nullable().optional(),
  }).nullable().optional(),

  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  metadata: safeRecord().nullable().optional(),
});

// ========================================
// Bulk Operations Validation Schemas
// Added: 2025-11-07 (Week 1 P0-3 - DoS protection)
// ========================================

/**
 * Bulk Update Tasks Schema with DoS Prevention
 * For: POST /api/tasks/bulk/update
 */
export const BulkUpdateTasksSchema = z.object({
  taskIds: z.array(z.string().cuid('Invalid task ID'))
    .min(1, 'At least one task ID required')
    .max(100, 'Maximum 100 tasks per bulk update (DoS prevention)'),

  updates: z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).nullable().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional(),
    assigneeId: OptionalCUIDStrict('assigneeId'),
    stageId: OptionalCUIDStrict('stageId'),
    dueDate: z.string().datetime().nullable().optional(),
    metadata: safeRecord().nullable().optional(),
  })
    .refine(
      (data) => Object.keys(data).length > 0,
      { message: 'At least one field must be updated' }
    ),

  options: z.object({
    validatePermissions: z.boolean().optional().default(true),
    skipValidation: z.boolean().optional().default(false),
    continueOnError: z.boolean().optional().default(false),
    logActivity: z.boolean().optional().default(true),
  }).optional(),
})
  .refine(
    // Prevent massive payloads (DoS) - Increased to support 50KB descriptions × 100 tasks
    (data) => { try { return JSON.stringify(data).length < 5242880; } catch { return false; } }, // 5MB limit, BC30: stack overflow guard
    { message: 'Request payload too large or too deeply nested (max 5MB)' }
  );

/**
 * Bulk Assign Tasks Schema
 * For: POST /api/tasks/bulk/assign
 */
export const BulkAssignTasksSchema = z.object({
  taskIds: z.array(z.string().cuid('Invalid task ID'))
    .min(1, 'At least one task ID required')
    .max(100, 'Maximum 100 tasks per bulk assign'),

  assigneeId: OptionalCUIDStrict('assigneeId').optional(),
  teamId: OptionalCUIDStrict('teamId').optional(),

  options: z.object({
    validatePermissions: z.boolean().optional().default(true),
    skipValidation: z.boolean().optional().default(false),
    continueOnError: z.boolean().optional().default(false),
    logActivity: z.boolean().optional().default(true),
    batchSize: z.number().min(1).max(100).optional().default(50),
  }).optional(),
})
  .refine(
    data => data.assigneeId || data.teamId,
    { message: 'Either assigneeId or teamId must be provided' }
  );

/**
 * Bulk Move Tasks Schema
 * For: POST /api/tasks/bulk/move
 */
export const BulkMoveTasksSchema = z.object({
  taskIds: z.array(z.string().cuid('Invalid task ID'))
    .min(1, 'At least one task ID required')
    .max(50, 'Maximum 50 tasks per bulk move'), // Lower limit - more complex operation

  targetStageId: OptionalCUIDStrict('targetStageId').optional(),
  targetPhaseId: OptionalCUIDStrict('targetPhaseId').optional(),

  options: z.object({
    validatePermissions: z.boolean().optional().default(true),
    validatePovConsistency: z.boolean().optional().default(true),
    skipValidation: z.boolean().optional().default(false),
    continueOnError: z.boolean().optional().default(false),
    logActivity: z.boolean().optional().default(true),
    batchSize: z.number().min(1).max(50).optional().default(50),
  }).optional(),
})
  .refine(
    data => data.targetStageId || data.targetPhaseId,
    { message: 'Must specify either targetStageId or targetPhaseId' }
  );

// ========================================
// Task Search & Filter Validation Schemas
// Added: 2025-11-07 (Week 2 P1 Group 3 - Query validation)
// ========================================

/**
 * Task Search Query Schema with XSS Prevention
 * For: GET /api/tasks/search query parameters
 */
export const TaskSearchQuerySchema = z.object({
  // Text search with XSS prevention
  q: z.string().max(FIELD_LIMITS.SEARCH_QUERY).optional(),
  query: z.string().max(FIELD_LIMITS.SEARCH_QUERY).optional(),

  // Pagination (DoS prevention). R-C2 (2026-06-18): the 1000 ceiling is DELIBERATELY
  // higher than parsePaginationParams' 100 default (lib/utils/pagination.ts) — search
  // returns a result SET to scan/filter/export, not a UI page. Bounded + safe; the
  // difference is intentional per-use-case tuning, not drift.
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),

  // Quick search mode
  quick: z.string().optional(), // "true" or "false" from query params
});

// TaskAnalyticsQuerySchema removed 2026-06-12 — only consumers were the
// deprecated /api/tasks/analytics/* wrappers, deleted at their sunset date.
// Unified endpoint validation lives in UnifiedAnalyticsQuerySchema below.

// Type exports
export type MoveTaskInput = z.infer<typeof MoveTaskSchema>;
export type ReorderTasksInput = z.infer<typeof ReorderTasksSchema>;
export type TaskAgentExecuteInput = z.infer<typeof TaskAgentExecuteSchema>;
export type BulkUpdateTasksInput = z.infer<typeof BulkUpdateTasksSchema>;
export type BulkAssignTasksInput = z.infer<typeof BulkAssignTasksSchema>;
export type BulkMoveTasksInput = z.infer<typeof BulkMoveTasksSchema>;
export type TaskSearchQuery = z.infer<typeof TaskSearchQuerySchema>;

// ========================================
// MCP Analytics Validation Schemas
// Added: 2025-12-12 (Phase 0 security fix)
// Purpose: Prevent XSS, SQL injection, DoS attacks on analytics endpoints
// Specialists: sec-ops (78%→92%), validation-engine (88%→97%)
// ========================================

// MCPAnalyticsQuerySchema removed 2026-06-24 — its only consumer was the deprecated
// /api/mcp/analytics route (+ the domain=mcp handler), both deleted with the Tools & ROI tab.

// MCPToolsPerformanceQuerySchema removed 2026-06-12 — its only consumer was
// the dead /api/mcp/tools/performance route family (0 UI importers, 0 prod
// hits across full log retention, fabricated Math.random metrics + fake-success
// catch fallbacks), deleted in the same commit.

// AnalyticsOverviewQuerySchema removed 2026-06-12 — only consumer was the
// deprecated /api/analytics/overview wrapper, deleted at its sunset date.
// Unified endpoint validation lives in UnifiedAnalyticsQuerySchema below.

/**
 * Unified Analytics Query Schema
 * For: GET /api/analytics (Part 2: Endpoint Consolidation)
 *
 * Security Features (10-layer protection):
 * 1. Domain: Enum validation (only 5 allowed domains)
 * 2. Metrics: Array validation with max length (prevents DoS)
 * 3. IDs: CUID format enforcement (prevents IDOR, injection)
 * 4. TimeRange: Enum validation (prevents SQL injection)
 * 5. Status: Max 50 chars (prevents XSS, DoS)
 *
 * Attack Prevention:
 * ✅ XSS: String constraints block "<script>alert('xss')</script>"
 * ✅ SQL Injection: Enum validation blocks "' OR 1=1 --"
 * ✅ IDOR: CUID format enforced on all ID fields
 * ✅ DoS: Array max 10 items, strings max 50 chars
 * ✅ Parameter Pollution: Transform handles 'all' vs array
 * ✅ Type Confusion: Strict typing enforced
 *
 * Usage Examples:
 * - /api/analytics?domain=tasks&metrics=performance&metrics=insights&povId=xyz
 * - /api/analytics?domain=overview&povId=xyz
 *
 * Part 2 Implementation: Query Optimization + Endpoint Consolidation
 * Specialist-validated: 90.7% confidence (api-efficiency, architectural, boundary-contract)
 */
export const UnifiedAnalyticsQuerySchema = z.object({
  // Domain routing (required)
  domain: z.enum(['tasks', 'agents', 'team', 'overview', 'admin'])
    .describe('Analytics domain to query'),

  // Metrics selection (optional, defaults to 'all')
  metrics: z.union([
    z.array(
      z.string()
        .min(1, 'Metric name cannot be empty')
        .max(50, 'Metric name must be 50 characters or less')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Metric name must be alphanumeric with dashes/underscores only')
    )
      .max(10, 'Maximum 10 metrics per request'),  // DoS prevention
    z.literal('all')
  ])
    .default('all')
    .transform((val) => {
      // Normalize: 'all' → ['all'], or keep array
      return val === 'all' ? ['all'] : val;
    })
    .describe('Metrics to fetch (array or "all")'),

  // Time range filter (optional)
  timeRange: z.enum(['7d', '30d', '90d', '1y'])
    .default('30d')
    .optional()
    .describe('Time range for analytics data'),

  // Security: CUID validation for all ID fields (IDOR prevention)
  povId: FormField.optionalCUID('POV ID'),
  phaseId: FormField.optionalCUID('Phase ID'),
  teamId: FormField.optionalCUID('Team ID'),
  toolId: FormField.optionalCUID('Tool ID'),

  // Status filter (optional, max length for security)
  // ✅ M1 FIX: Add XSS/injection sanitization (security audit recommendation)
  status: z.string()
    .max(50, 'Status must be 50 characters or less')
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Status contains HTML tags or instruction override patterns. Please use plain text.'
    })
    .optional()
    .describe('Status filter'),

}).describe('Unified Analytics API query parameters');

export type UnifiedAnalyticsQuery = z.infer<typeof UnifiedAnalyticsQuerySchema>;
