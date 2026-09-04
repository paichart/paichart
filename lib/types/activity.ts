/**
 * Activity Types - Shared between backend and frontend
 *
 * SINGLE SOURCE OF TRUTH for activity logging types.
 * Used in:
 * - Database (JSONB storage)
 * - API responses
 * - Frontend display (TaskActivityTimeline)
 *
 * Created: 2025-12-31
 * Review: 9 specialists, 88% confidence
 * @see /cline_docs/reviews/task-activity-rich-details-2025-12-31/
 */

/**
 * Enum for activity action types - prevents typos
 * Addresses CRITICAL-T3: Action String Safety
 */
export const TaskActivityAction = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  PRIORITY_CHANGED: 'PRIORITY_CHANGED',
  ASSIGNED: 'ASSIGNED',
  UNASSIGNED: 'UNASSIGNED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED',
  ATTACHMENT_REMOVED: 'ATTACHMENT_REMOVED',
  AGENT_EXECUTED: 'AGENT_EXECUTED',
  PHASE_CHANGED: 'PHASE_CHANGED',
  // IMPORTANT-P1: Add STAGE_CHANGED (per phase-stage-specialist)
  // Tasks move between stages more frequently than between phases (Kanban)
  STAGE_CHANGED: 'STAGE_CHANGED',
  DUE_DATE_CHANGED: 'DUE_DATE_CHANGED',
  COMPLETED: 'COMPLETED',
  REOPENED: 'REOPENED',
  // Field-specific updates (for precise timeline display)
  // Added: 2026-01-05 (enum parity with ACTION_SYMBOLS)
  TITLE_UPDATED: 'TITLE_UPDATED',
  DESCRIPTION_UPDATED: 'DESCRIPTION_UPDATED',
  // WORKFLOW_EXECUTED: Track orchestration/browser workflows on tasks
  // Added: 2026-01-05 (MCPServiceOrchestrationHandler support)
  WORKFLOW_EXECUTED: 'WORKFLOW_EXECUTED',
} as const;

export type TaskActivityActionType = typeof TaskActivityAction[keyof typeof TaskActivityAction];

/**
 * Structured details for activity logging
 * Used in database (JSONB) and frontend display
 */
export interface ActivityDetails {
  // Field changes (status, priority, phase, etc.)
  fieldName?: string;
  oldValue?: unknown;  // Changed from 'any' per types-system review
  newValue?: unknown;  // Changed from 'any' per types-system review

  // Assignment changes
  assigneeName?: string;
  assigneeId?: string;

  // Comments
  comment?: string;

  // Attachments
  attachmentName?: string;
  attachmentId?: string;
  fileSize?: number;
  fileType?: string;

  // Agent execution (links to AgentExecution record)
  agentName?: string;
  executionId?: string;
  // IMPORTANT-2: Must match Prisma ExecutionStatus enum (per parameter-normalizer review)
  // See: prisma/schema.prisma - ExecutionStatus enum
  executionStatus?:
    | 'PENDING'         // Initial state
    | 'READY'           // Dependencies met
    | 'RUNNING'         // Execution in progress
    | 'PENDING_REVIEW'  // Requires review
    | 'REVIEW_APPROVED' // Review successful
    | 'REVIEW_REJECTED' // Review failed
    | 'SUCCESS'         // Completed successfully
    | 'FAILED';         // Failed or timed out

  // Auth attribution forensics (added 2026-04-16, task #85)
  // Recorded at execution-creation time via createAgentExecution wrapper.
  // Answers "who triggered this, and through which code path?" for billing/
  // audit queries. See lib/services/types/triggered-by.ts for the source enum.
  authMethod?: 'per-user' | 'system';
  triggeredBySource?: string;   // One of TriggeredBySourceEnum values
  parentExecutionId?: string;   // For reactor cascades — trace lineage
  parentTaskId?: string;        // Optional debugging context
  povId?: string;               // POV scope for billing attribution

  // IMPORTANT-P3: Phase/stage name resolution (per phase-stage-specialist)
  // Store human-readable names for timeline display, not just IDs
  oldPhaseName?: string;   // e.g., "Discovery"
  newPhaseName?: string;   // e.g., "Implementation"
  oldStageName?: string;   // e.g., "Requirements Gathering"
  newStageName?: string;   // e.g., "Technical Design"

  // Workflow execution (links to MCPWorkflowExecution record)
  // Added: 2026-01-05 (MCPServiceOrchestrationHandler support)
  workflowId?: string;           // MCPWorkflowExecution.id
  workflowType?: string;         // e.g., 'mcp_service_orchestration', 'browser_automation'
  workflowStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  workflowStepCount?: number;    // Total steps executed
  workflowExecutionTime?: number; // Total execution time in ms
}

/**
 * Request metadata for audit trail
 */
export interface ActivityMetadata {
  source: 'WEB' | 'API' | 'MCP' | 'AGENT' | 'SYSTEM';
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Activity source types
 */
export type ActivitySource = ActivityMetadata['source'];

/**
 * Helper type for activity logging functions
 */
export interface ActivityLogInput {
  taskId: string;
  userId: string;
  action: TaskActivityActionType;
  details?: ActivityDetails;
  metadata?: ActivityMetadata;
}
