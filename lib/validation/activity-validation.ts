/**
 * Activity Validation Schemas - Zod schemas for activity logging
 *
 * Addresses CRITICAL-T2: No Zod Validation
 * All activity details are validated before database writes.
 *
 * Created: 2025-12-31
 * Review: 9 specialists, 88% confidence
 * @see /cline_docs/reviews/task-activity-rich-details-2025-12-31/
 */

import { z } from 'zod';
import { TaskActivityAction, type ActivityDetails, type ActivityMetadata } from '@/lib/types/activity';
// Use centralized validators (per validation-engine-specialist)
import { OptionalCUIDStrict } from '@/lib/validation/id-validation';
import { ExecutionStatusSchema } from '@/lib/validation/enum-validation';
import { FIELD_LIMITS } from './field-limits';
// IMPORTANT-1: Import prompt injection detection (per parameter-normalizer review)
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { logger } from '@/lib/logger';

const localLogger = logger.child({ module: 'ActivityValidation' });

/**
 * Truncate long text values for activity logging
 * Prevents JSONB bloat - most changes are small enum/name values
 *
 * Guidelines:
 * - Description changes: caller should pass null (just flag, don't store content)
 * - Title changes: truncate to ~15 words
 * - Status/priority: tiny values, no truncation needed
 *
 * @param value - The value to truncate
 * @param maxWords - Maximum number of words (default: 15)
 * @returns Truncated string or null
 */
function truncateForActivity(value: unknown, maxWords = 15): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    // For non-strings, stringify but limit size
    let str: string;
    try { str = JSON.stringify(value); } catch { return '[object too deeply nested]'; } // BC30: stack overflow guard
    return str.length > 200 ? str.slice(0, 200) + '...' : str;
  }
  const words = value.trim().split(/\s+/).slice(0, maxWords);
  const truncated = words.join(' ');
  return value.length > truncated.length ? `${truncated}...` : value;
}

/**
 * Schema for activity details (JSONB column)
 * Strict mode rejects unknown fields to prevent data pollution
 */
export const ActivityDetailsSchema = z.object({
  fieldName: z.string().max(FIELD_LIMITS.ID).optional(),
  // Truncate long values to ~15 words max (~200 bytes)
  // For description changes, caller should pass null (don't store content)
  oldValue: z.unknown()
    .transform(v => truncateForActivity(v, 15))
    .optional(),
  newValue: z.unknown()
    .transform(v => truncateForActivity(v, 15))
    .optional(),
  assigneeName: z.string().max(FIELD_LIMITS.NAME).optional(),
  // Use centralized CUID validator (per validation-engine-specialist)
  assigneeId: OptionalCUIDStrict('assignee ID'),
  // IMPORTANT-1: Add prompt injection prevention (per parameter-normalizer review)
  comment: z.string()
    .max(FIELD_LIMITS.METADATA)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Comment contains disallowed patterns'
    })
    .optional(),
  attachmentName: z.string().max(FIELD_LIMITS.NAME).optional(),
  // Use centralized CUID validator (per validation-engine-specialist)
  attachmentId: OptionalCUIDStrict('attachment ID'),
  fileSize: z.number().int().positive().optional(),
  fileType: z.string().max(FIELD_LIMITS.LABEL).optional(),
  agentName: z.string().max(FIELD_LIMITS.NAME).optional(),
  // Use centralized CUID validator (per validation-engine-specialist)
  executionId: OptionalCUIDStrict('execution ID'),
  // Use Prisma nativeEnum for auto-sync (per validation-engine-specialist)
  // This imports ExecutionStatus from Prisma and auto-syncs with schema
  executionStatus: ExecutionStatusSchema.optional(),
  // IMPORTANT-P3: Phase/stage name resolution (per phase-stage-specialist)
  // Store human-readable names for timeline display
  oldPhaseName: z.string().max(FIELD_LIMITS.NAME).optional(),
  newPhaseName: z.string().max(FIELD_LIMITS.NAME).optional(),
  oldStageName: z.string().max(FIELD_LIMITS.NAME).optional(),
  newStageName: z.string().max(FIELD_LIMITS.NAME).optional(),
  // Workflow execution fields (Added: 2026-01-05)
  // Links to MCPWorkflowExecution record for orchestration/browser workflows
  workflowId: OptionalCUIDStrict('workflow ID'),
  workflowType: z.string().max(FIELD_LIMITS.LABEL).optional(),
  workflowStatus: z.enum(['SUCCESS', 'FAILED', 'PARTIAL']).optional(),
  workflowStepCount: z.number().int().min(0).optional(),
  workflowExecutionTime: z.number().int().min(0).optional(),
  // Auth attribution forensics (Added: 2026-04-16, task #85)
  // Written at execution-creation time via createAgentExecution wrapper.
  // TODO(retention): billing forensics typically want 7-year retention
  // (SOX/tax), current TaskActivity policy is 90d. See follow-up task for
  // retention-policy decision before production cutover. Approved by
  // database-manager-specialist 2026-04-16 at 92% confidence as additive-
  // only (zero readers, no migration, no new index at current scale).
  authMethod: z.enum(['per-user', 'system']).optional(),
  triggeredBySource: z.string().max(FIELD_LIMITS.LABEL).optional(),
  parentExecutionId: OptionalCUIDStrict('parent execution ID'),
  parentTaskId: OptionalCUIDStrict('parent task ID'),
  povId: OptionalCUIDStrict('POV ID'),
}).strict(); // Reject unknown fields

/**
 * Schema for activity metadata (JSONB column)
 * Used for audit trail (IP, user agent, source)
 */
export const ActivityMetadataSchema = z.object({
  source: z.enum(['WEB', 'API', 'MCP', 'AGENT', 'SYSTEM']),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(FIELD_LIMITS.SHORT_TEXT).optional(),
  requestId: z.string().optional(),
}).strict();

/**
 * Schema for task activity action types
 * Matches TaskActivityAction const object
 */
export const TaskActivityActionSchema = z.enum([
  'CREATED', 'UPDATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED',
  'ASSIGNED', 'UNASSIGNED', 'COMMENT_ADDED',
  'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED',
  'AGENT_EXECUTED', 'PHASE_CHANGED', 'STAGE_CHANGED',  // IMPORTANT-P1
  'DUE_DATE_CHANGED', 'COMPLETED', 'REOPENED',
  'TITLE_UPDATED', 'DESCRIPTION_UPDATED',  // Added: 2026-01-05 (enum parity)
  'WORKFLOW_EXECUTED',  // Added: 2026-01-05 (orchestration support)
]);

/**
 * Validate activity details before database write
 * Returns validated data or null if invalid
 *
 * IMPORTANT: Logs validation failures for debugging (per validation-engine-specialist)
 *
 * @param details - Raw details object to validate
 * @returns Validated ActivityDetails or null
 */
export function validateActivityDetails(details: unknown): ActivityDetails | null {
  const result = ActivityDetailsSchema.safeParse(details);
  if (!result.success) {
    // Log validation failures for debugging (per validation-engine-specialist)
    localLogger.warn({ errors: result.error.flatten().fieldErrors, input: typeof details === 'object' ? Object.keys(details || {}) : typeof details }, 'Invalid activity details provided');
    return null;
  }
  return result.data as ActivityDetails;
}

/**
 * Validate activity metadata before database write
 * Returns validated data or null if invalid
 *
 * @param metadata - Raw metadata object to validate
 * @returns Validated ActivityMetadata or null
 */
export function validateActivityMetadata(metadata: unknown): ActivityMetadata | null {
  const result = ActivityMetadataSchema.safeParse(metadata);
  if (!result.success) {
    localLogger.warn({ errors: result.error.flatten().fieldErrors }, 'Invalid activity metadata provided');
    return null;
  }
  return result.data as ActivityMetadata;
}

/**
 * Validate activity action type
 * Returns validated action or null if invalid
 *
 * @param action - Action string to validate
 * @returns Validated action string or null
 */
export function validateActivityAction(action: unknown): string | null {
  const result = TaskActivityActionSchema.safeParse(action);
  return result.success ? result.data : null;
}

// Export the truncate function for use in activity logger
export { truncateForActivity };

// Re-export types for convenience
export type { ActivityDetails, ActivityMetadata } from '@/lib/types/activity';
