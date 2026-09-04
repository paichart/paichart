/**
 * Shared workflow types for frontend and backend
 * Prevents field leakage and type mismatches
 *
 * Phase 0 Fix 0.1: Type safety (boundary-contract-specialist)
 */

/**
 * Result from a single service call in a workflow step
 * This is the structure stored in MCPWorkflowExecution.output array
 */
export interface ServiceCallResult {
  /** Whether the service call succeeded */
  success: boolean;

  /** Response data payload from the service (can be any structure) */
  data?: unknown;

  /** Error message if the call failed */
  error?: string;

  /** Error classification for diagnostics */
  errorType?: string;

  /** Whether this error type was retryable */
  retryable?: boolean;

  /** Number of attempts made (1 = no retries) */
  attempts?: number;

  /** Execution time in milliseconds */
  executionTime: number;

  /** Service that was called (e.g., "paichart-pov-service") */
  service: string;

  /** Tool that was invoked (e.g., "project") */
  tool: string;

  /** Optional step index (for ordering) */
  stepIndex?: number;
}

/**
 * Workflow execution record from database
 * Matches MCPWorkflowExecution model structure
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string | null;
  userId: string;
  povId: string | null;
  executionMode: 'PREDEFINED' | 'AD_HOC';
  workflowType: string | null;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  startTime: string;
  endTime: string | null;
  duration: number | null;

  /** Full step results array (ServiceCallResult[]) */
  output: ServiceCallResult[] | null;

  error: string | null;
  workflow: {
    name: string;
    description: string | null;
    category: string | null;
  } | null;
}

/**
 * A single step in a workflow's config. Known fields are typed; unknown keys (e.g. `description`/
 * `expectedResult` written by DB-direct seed scripts) ride at runtime — the WorkflowEditor's `_original`
 * capture preserves them on save (per-step form-strip lane). Do NOT `.map()` steps into a narrower shape
 * before the editor sees them, or those unknown keys drop.
 */
export interface WorkflowStep {
  service: string;
  tool: string;
  arguments?: Record<string, unknown>;
  dependsOn?: number[];
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Single shared Workflow shape for the page + table + editor (UI-alignment migration 2026-06-30).
 *
 * ⚠️ M2/M3: carries EVERY field the editor reads (executionMode/failureStrategy/timeout) plus the two
 * preservation lanes (`_rawConfig` top-level, per-step keys inside `steps`). These are OPTIONAL, so the
 * compiler will NOT flag a `.map()` that drops them — the binding control is the RUNTIME no-row-model rule
 * (keep `[...workflows].sort()`, pass the same object reference to the editor) + the form-strip gate test.
 */
export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'DEPRECATED';
  executionCount: number;
  successRate: number | null;
  lastExecution: string | null;
  steps: WorkflowStep[];
  // Orchestration fields the editor reads (WorkflowEditor:176-184) — must survive list→table→editor
  executionMode?: 'sequential' | 'parallel' | 'conditional';
  failureStrategy?: 'stop' | 'continue' | 'rollback';
  timeout?: number;
  requires?: unknown;                    // povId/taskId execution-gate declaration (preserved inside _rawConfig)
  _rawConfig?: Record<string, unknown>;  // raw JSONB config — top-level preservation lane (form-strip fix)
}
