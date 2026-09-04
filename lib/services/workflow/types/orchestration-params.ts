/**
 * Orchestration Parameters - Zod schemas for MCP Service Orchestration
 *
 * Provides typed validation for workflow steps, execution modes, and failure strategies.
 * Used by MCPServiceOrchestrationHandler for parameter validation.
 *
 * @see /cline_docs/reviews/workflow-extension-2026-01-04/implementation-plan-focused.md
 */

import { z } from 'zod';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { logger } from '@/lib/logger';

const securityLogger = logger.child({ module: 'OrchestrationParams' });

/** Maximum nesting depth for injection checking (prevents stack overflow DoS) */
const MAX_INJECTION_CHECK_DEPTH = 20;
const MAX_INJECTION_CHECK_KEYS = 200; // BC30: breadth guard — prevent CPU exhaustion on wide flat objects

/**
 * Recursively check all string values in an object for prompt injection patterns.
 * Used to validate workflow step arguments which can contain nested objects/arrays.
 * BC29 FIX: Depth-limited to prevent stack overflow from malicious nesting.
 *
 * @param args - The arguments object to check
 * @param _depth - Current recursion depth (internal)
 * @returns true if safe, false if injection detected
 */
function checkArgumentsForInjection(args: Record<string, unknown>, _depth = 0): boolean {
  if (_depth > MAX_INJECTION_CHECK_DEPTH) return true; // Depth guard — truncate traversal

  const values = Object.values(args);
  if (values.length > MAX_INJECTION_CHECK_KEYS) return true; // Breadth guard — skip excessively wide objects

  for (const value of values) {
    if (typeof value === 'string') {
      const result = detectPromptInjection(value);
      if (!result.isSafe) {
        securityLogger.warn({ severity: result.severity, patterns: result.detectedPatterns.map(p => p.pattern) }, 'Prompt injection blocked in workflow arguments');
        return false;
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && !detectPromptInjection(item).isSafe) {
          return false;
        }
        if (typeof item === 'object' && item !== null) {
          if (!checkArgumentsForInjection(item as Record<string, unknown>, _depth + 1)) {
            return false;
          }
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      if (!checkArgumentsForInjection(value as Record<string, unknown>, _depth + 1)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Workflow error type classification
 * Used in step results to categorize failures for diagnostics and retry decisions
 */
export const WorkflowErrorTypeSchema = z.enum([
  'timeout',          // Step or workflow timeout exceeded
  'network',          // Connection/DNS/TLS failure
  'service_error',    // Service returned 5xx or unexpected error
  'service_rejected', // Service explicitly returned isError: true
  'validation',       // Input validation failure
  'not_found',        // Service or tool not found
  'policy_blocked',   // Security policy violation (compliance, access, SSRF)
  'rate_limited',     // Rate limit exceeded
  'variable_error',   // Variable resolution failure
]);

export type WorkflowErrorType = z.infer<typeof WorkflowErrorTypeSchema>;

/**
 * Phase 4 (2026-05-16) — Shared constants for cross-layer schema alignment.
 *
 * These bounds are duplicated at 3 layers in the MCP workflow stack:
 *   L1 dispatch boundary: `lib/mcp/server/config/tool-schemas.js` (services slice)
 *   L3 handler boundary:  `lib/mcp/server/tools/hub/workflow-tools-handler.js`
 *   Engine schema:        this file (`MCPOrchestrationParamsSchema` below)
 *
 * Pre-Phase-4 these were 3 inline duplicates linked only by a prose
 * "KEEP IN SYNC" comment — sec-ops Finding from 4-specialist Phase 4
 * verdict matrix (3 of 4 chose Option C: layered alignment with structural
 * drift detection rather than schema collapse).
 *
 * The contract test at `scripts/test-workflow-schema-alignment.ts` asserts
 * all 3 schemas use these same constants. Build fails if any diverges.
 *
 * Per [[feedback_phantom_canonical_audit]] — extract narrow shared constants
 * so drift becomes structurally impossible, not "comment-prevented."
 */
export const EXECUTION_MODES = ['sequential', 'parallel', 'conditional'] as const;
export const FAILURE_STRATEGIES = ['stop', 'continue', 'rollback'] as const;

export const WORKFLOW_TIMEOUT_BOUNDS = { min: 1000, max: 600000, default: 60000 } as const;
export const WORKFLOW_RETRY_BUDGET_BOUNDS = { min: 0, max: 20, default: 10 } as const;
export const WORKFLOW_STEPS_BOUNDS = { min: 1, max: 20 } as const;

export const STEP_TIMEOUT_BOUNDS = { min: 1000, max: 60000 } as const;
export const STEP_RETRIES_BOUNDS = { min: 0, max: 5, default: 0 } as const;
export const STEP_RETRY_DELAY_BOUNDS = { min: 1000, max: 30000, default: 2000 } as const;

/**
 * Runtime-context keys that a named workflow can declare as required.
 *
 * Used at workflow.execute dispatch time: if a stored workflow declares
 * `requires: ['povId']` in its JSONB config, the Hub validates that the
 * caller provided povId (or a taskId that resolves to one) BEFORE
 * dispatching any step. Surfaces missing identity context at the
 * front door instead of failing deep in the first identity-requiring
 * service (e.g., Snowflake's REQUIRE_OAUTH path).
 *
 * Only these two keys are recognized because they're the only runtime
 * context the dispatch path resolves today. Extend cautiously — every
 * addition needs matching resolution logic in workflow-tools-handler.js.
 *
 * Phase 4-style shared constant: imported by `lib/workflows/schemas.ts`
 * for the Zod enum so adding a new key here lights up the form schema.
 */
export const WORKFLOW_REQUIRES_KEYS = ['povId', 'taskId'] as const;
export type WorkflowRequiresKey = typeof WORKFLOW_REQUIRES_KEYS[number];

/**
 * Single workflow step schema
 * Defines a service call within an orchestration workflow
 */
export const WorkflowStepSchema = z.object({
  /** Service identifier (name or ID from MCP Hub registry) */
  service: z.string().min(1),
  /** Tool name to invoke on the service */
  tool: z.string().min(1),
  /** Arguments to pass to the tool (max 50KB, prompt injection protected) */
  arguments: z.record(z.unknown())
    .refine((args) => {
      try { return JSON.stringify(args).length <= 50000; } catch { return false; } // BC30: stack overflow guard
    }, { message: 'Arguments exceed maximum size (50KB)' })
    .refine((args) => checkArgumentsForInjection(args), {
      message: 'Arguments contain HTML tags or instruction override patterns. Please use plain text values.'
    }),
  /** Step indices this step depends on (for dependency graph) */
  dependsOn: z.array(z.number()).optional(),
  /** Timeout in ms for this step */
  timeout: z.number().min(STEP_TIMEOUT_BOUNDS.min).max(STEP_TIMEOUT_BOUNDS.max).optional(),
  /** Number of retry attempts on retryable errors */
  retries: z.number().min(STEP_RETRIES_BOUNDS.min).max(STEP_RETRIES_BOUNDS.max).default(STEP_RETRIES_BOUNDS.default),
  /** Base delay between retries in ms. Uses exponential backoff. */
  retryDelay: z.number().min(STEP_RETRY_DELAY_BOUNDS.min).max(STEP_RETRY_DELAY_BOUNDS.max).default(STEP_RETRY_DELAY_BOUNDS.default),
}).catchall(z.unknown()); // Form-strip Fix A (2026-05-17): preserve unknown JSONB keys (e.g. per-step description / expectedResult written by DB-direct seed scripts) through Zod validation. Catchall narrows the inferred index value type vs .passthrough() for downstream consumers.

/**
 * MCP Orchestration parameters schema
 * Complete configuration for an orchestration workflow
 *
 * Supports two modes:
 * 1. Named workflow: { workflowName: "my-workflow" } - looks up saved workflow from database
 * 2. Ad-hoc workflow: { steps: [...] } - executes inline step definitions
 */
export const MCPOrchestrationParamsSchema = z.object({
  /** Name of saved workflow to execute (alternative to providing steps) */
  workflowName: z.string().optional(),
  /** Workflow steps to execute - optional if workflowName provided */
  steps: z.array(WorkflowStepSchema).min(WORKFLOW_STEPS_BOUNDS.min).max(WORKFLOW_STEPS_BOUNDS.max).optional(),
  /** Execution mode: sequential (default), parallel, or conditional */
  executionMode: z.enum(EXECUTION_MODES).default('sequential'),
  /** Failure strategy: stop (default), continue, or rollback */
  failureStrategy: z.enum(FAILURE_STRATEGIES).default('stop'),
  /** Global timeout in ms */
  timeout: z.number().min(WORKFLOW_TIMEOUT_BOUNDS.min).max(WORKFLOW_TIMEOUT_BOUNDS.max).default(WORKFLOW_TIMEOUT_BOUNDS.default),
  /** Maximum total retry attempts across all steps (prevents retry storms) */
  maxTotalRetries: z.number().min(WORKFLOW_RETRY_BUDGET_BOUNDS.min).max(WORKFLOW_RETRY_BUDGET_BOUNDS.max).default(WORKFLOW_RETRY_BUDGET_BOUNDS.default),
  /** Optional task ID for context (derives povId if not provided) */
  taskId: z.string().cuid().optional(),
}).refine(
  data => data.workflowName || data.steps,
  { message: 'Either workflowName or steps must be provided' }
);

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type MCPOrchestrationParams = z.infer<typeof MCPOrchestrationParamsSchema>;

/**
 * Orchestration config schema (extends workflow config)
 * Scopes orchestration to specific workflow types
 */
export const OrchestrationConfigSchema = z.object({
  /** Workflow type - must be an orchestration type */
  workflowType: z.literal('mcp_service_orchestration').or(
    z.literal('parallel_service_execution')
  ).or(z.literal('conditional_workflow')),
  /** Optional POV scoping for multi-tenant workflows */
  povId: z.string().cuid().optional(),
  /** Named workflow ID - links execution to MCPWorkflow for tracking */
  workflowId: z.string().optional(),  // Accepts CUID or legacy string IDs
  /** Orchestration parameters */
  parameters: MCPOrchestrationParamsSchema,
  /** Optional overall timeout override */
  timeout: z.number().optional(),
});

export type OrchestrationConfig = z.infer<typeof OrchestrationConfigSchema>;
