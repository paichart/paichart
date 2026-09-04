/**
 * Base error class
 */
export class AppError extends Error {
  code: string;
  details?: Record<string, any>;

  constructor(message: string, code: string, details?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

/**
 * Authentication error
 */
export class AuthError extends AppError {
  constructor(message: string, code = 'UNAUTHORIZED', details?: Record<string, any>) {
    super(message, code, details);
  }
}

/**
 * Thrown by the agent execution engine (and stream route) when an execution
 * reaches the prompt-resolution step without a resolved template AND without
 * a user-configured system prompt. Closes the Priority 3 Universal-Template
 * fallback bypass (0/128 prod usage verified 2026-04-16 but reachable).
 *
 * The engine's outer catch at agentExecutionEngine.ts:1600-1647 reads
 * `error.code` and writes it to `execution.errorCategory` in error.json,
 * so the GUI can render a targeted "no template assigned" banner instead
 * of a generic "execution failed" message.
 *
 * See: cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md §6.2
 */
export class NoTemplateAssignedError extends AppError {
  constructor(executionId: string, taskId: string) {
    super(
      `Execution ${executionId} has no resolved agent template. ` +
      `Every execution must have an assigned template. ` +
      `Call perform(action: "agent.assign", taskId: "${taskId}") with a templateId before executing.`,
      'NO_TEMPLATE_ASSIGNED',
      { executionId, taskId }
    );
  }
}

/**
 * Thrown by the agent-execution-create wrapper when the partial UNIQUE
 * index `idx_agent_executions_active_per_task` rejects a create that
 * would produce a second active (PENDING/RUNNING) execution for the
 * same task. Typed class (vs. raw Prisma P2002 string-matching) keeps
 * the 6 callers Prisma-agnostic and is grep-friendly in logs.
 *
 * Callers:
 *   - agentTaskService.ts: rethrows as ApiError(DUPLICATE_RECORD)
 *   - taskReadyReactorService.ts (dep-completion + dep-free): silent no-op
 *   - pipelineRetriggerReactorService.ts: silent no-op
 *   - stream/route.ts: pre-stream HTTP 409 Response (writer not in scope)
 *   - [taskId]/agent/execute/route.ts: createHandler {error:{message,code}}
 *
 * See: cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md §5.A, §5.C
 */
export class DuplicateActiveExecutionError extends AppError {
  constructor(
    public readonly taskId: string,
    public readonly existingExecutionId?: string
  ) {
    super(
      `Active execution already exists for task ${taskId}` +
        (existingExecutionId ? ` (existing execution: ${existingExecutionId})` : ''),
      'DUPLICATE_ACTIVE_EXECUTION',
      { taskId, existingExecutionId }
    );
  }
}

/**
 * Thrown by `executeById` when the target execution is no longer in a claimable
 * (PENDING) state — the 10s poller won the create→dispatch race and is already
 * running it. This is NOT an execution failure: the run is proceeding under the
 * poller. Callers (the MCP background-dispatch `.catch`) MUST distinguish this
 * from a real failure and NOT persist FAILED — doing so would clobber the
 * genuinely-RUNNING execution. (Phase 4 F-3.)
 */
export class ExecutionNotClaimableError extends AppError {
  constructor(
    public readonly executionId: string,
    public readonly currentStatus: string
  ) {
    super(
      `Agent execution ${executionId} is not in pending status (current: ${currentStatus})`,
      'EXECUTION_NOT_CLAIMABLE',
      { executionId, currentStatus }
    );
  }
}

/**
 * Thrown when a PIPELINE harness's `task.metadata.pipelineStageId` points at
 * a stage whose `metadata.harnessTaskId` back-pointer doesn't match this
 * task's id. Indicates either silent-corruption (the harness's metadata was
 * clobbered mid-run to point at a different harness's stage) or a
 * cross-harness completion attempt.
 *
 * Thrown by the handler invariant at:
 *   - lib/mcp/tasks/action/handlers/task/task-complete-handler.ts:148-208
 *   - lib/mcp/tasks/action/handlers/task/task-update-handler.ts:380-457
 *
 * Mirrored as a skip (not a throw) by the retrigger reactor:
 *   - lib/services/pipelineRetriggerReactorService.ts (Guard 3.5)
 *
 * See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
 */
export class PipelineStageMismatchError extends AppError {
  constructor(
    public readonly taskId: string,
    public readonly stagePointer: string,
    public readonly recordedOwner: string | null
  ) {
    super(
      `Pipeline cannot complete: stage "${stagePointer}" records owner ` +
        `"${recordedOwner ?? '<null>'}" but completion was requested by "${taskId}". ` +
        `This indicates the harness's metadata.pipelineStageId was changed mid-run, ` +
        `or another task is attempting to complete this pipeline. ` +
        `Investigate task_activities for both tasks before resolving.`,
      'PIPELINE_STAGE_MISMATCH',
      { taskId, stagePointer, recordedOwner }
    );
  }
}

/**
 * Thrown by the completion dep-guard (complete-task-terminally.ts,
 * assertCompletionDependenciesSatisfied) when an APPROVAL task is asked to
 * complete while it still has unsatisfied dependency edges. FACT-shaped
 * (Protocol 10): carries the concrete unsatisfied upstreams; web adapters map
 * it to 4xx DEPENDENCY_NOT_SATISFIED, never a generic 500.
 * See cline_docs/reviews/completion-path-unification-2026-07-24/SYNTHESIS.md.
 */
export class DependencyNotSatisfiedError extends AppError {
  constructor(
    public readonly taskId: string,
    public readonly unsatisfied: Array<{
      dependsOnId: string;
      title: string;
      status: string;
      unsettledPipeline: boolean;
    }>
  ) {
    const lines = unsatisfied.map((d) =>
      d.unsettledPipeline
        ? `  - "${d.title}" (${d.dependsOnId}): COMPLETED but its execution is still persisting — ` +
          `re-check after the ≤20-min sweep, or use the audited override`
        : `  - "${d.title}" (${d.dependsOnId}): ${d.status}`
    );
    super(
      `Task cannot complete: ${unsatisfied.length} unsatisfied ` +
        `dependenc${unsatisfied.length === 1 ? 'y' : 'ies'}:\n${lines.join('\n')}`,
      'DEPENDENCY_NOT_SATISFIED',
      { taskId, unsatisfied }
    );
  }
}

/**
 * Thrown by `validateTaskStatusTransition` (lib/tasks/services/status-transitions.ts) when a
 * requested task status change is not permitted by the state machine.
 *
 * F4 (2026-07-25): previously a plain `Error` that six call sites matched by
 * `.message.includes('Invalid task status transition')` — a reworded validator message would have
 * silently dropped every mapping to a generic 500, which is exactly the string coupling the
 * completion arc removed everywhere else. The message text is preserved BYTE-FOR-BYTE because the
 * seeded pipeline protocol prompts quote it to agents (scripts/seed-protocol-prompts.ts) — the
 * type is additive, not a rewrite.
 *
 * `allowed` is the fact the caller needs to render a useful message: what the state machine WOULD
 * have accepted from `from`. Empty array means `from` is terminal.
 */
export class InvalidTransitionError extends AppError {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly allowed: string[],
    message: string
  ) {
    super(message, 'INVALID_TRANSITION', { from, to, allowed });
  }
}

/**
 * Thrown by the shared PIPELINE 4-point completion invariant
 * (complete-task-terminally.ts, assertPipelineCompletionInvariant) when a
 * PIPELINE task is asked to complete without the required child state. `point`
 * identifies which invariant point failed (facts, not judgement). Point 4
 * (back-pointer mismatch) throws PipelineStageMismatchError instead — same
 * class as before extraction.
 */
export class PipelineInvariantError extends AppError {
  constructor(
    public readonly taskId: string,
    public readonly point: 'no-child-stage' | 'empty-child-stage' | 'non-terminal-children' | 'stage-missing',
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'PIPELINE_INVARIANT', { taskId, point, ...details });
  }
}

/**
 * Thrown by `runTaskCompletionTx` (complete-task-terminally.ts) when the CAS terminal write
 * matched zero rows — the task's status moved under us between the in-tx read and the write
 * (concurrent double-complete or concurrent transition). The completion did NOT happen;
 * adapters render as a conflict (409), callers may re-read and decide.
 */
export class CompletionConflictError extends AppError {
  constructor(
    public readonly taskId: string,
    public readonly expectedStatus: string
  ) {
    super(
      `Task ${taskId} completion conflict: status changed concurrently ` +
        `(expected ${expectedStatus} at write time). No write was performed — re-read and retry if appropriate.`,
      'COMPLETION_CONFLICT',
      { taskId, expectedStatus }
    );
  }
}

/**
 * Thrown by `prepareTaskForExecution` (the pre-create step inside the
 * `createAgentExecution` chokepoint) when a task's execution preconditions can
 * NEVER be met as configured — e.g. a pov-program pipeline child whose
 * `inputContext.interfaceContract` is absent (CC7). PERMANENT by contract:
 * catching code may treat this as terminal (mark `executionStatus=FAILED`,
 * escalate the owning program) — unlike transient create failures, which must
 * stay retryable. See F16 frozen-cone fix:
 * cline_docs/reviews/f16-frozen-cone-2026-07-16/synthesis.md
 */
export class CanNeverRunError extends AppError {
  constructor(
    public readonly taskId: string,
    public readonly reasonCode: string,
    message: string
  ) {
    super(message, 'CAN_NEVER_RUN', { taskId, reasonCode });
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR', details?: Record<string, any>) {
    super(message, code, details);
  }
}

/**
 * Boundary contract violation — a typed sub-class of ValidationError thrown
 * when data crossing an internal system boundary fails its declared shape
 * contract. Use at write boundaries that feed JSONB columns, message queues,
 * cross-service RPCs, or any surface where the downstream consumer assumes
 * a specific shape. Named so `catch (e) { if (e instanceof BoundaryContractViolation) ... }`
 * can distinguish "caller sent wrong shape" from "database rejected" etc.
 *
 * Usage (as of task #85, 2026-04-16):
 *   lib/services/agent-execution-create.ts wraps TriggeredBySchema.parse and
 *   throws BoundaryContractViolation on parse failure, preserving the raw
 *   Zod issues array in `.details.issues` for forensic logging.
 *
 * @see lib/services/types/triggered-by.ts
 * @see .claude/knowledge/patterns/orchestration-reactor-pattern.md (Pattern #46 Common Pitfalls)
 */
export class BoundaryContractViolation extends ValidationError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'BOUNDARY_CONTRACT_VIOLATION', details);
  }
}

/**
 * Database error
 */
export class DatabaseError extends AppError {
  constructor(message: string, code = 'DATABASE_ERROR', details?: Record<string, any>) {
    super(message, code, details);
  }
}

/**
 * API error
 */
export class ApiError extends AppError {
  statusCode: number;

  constructor(code: ErrorCodeType, message: string, details?: Record<string, any>) {
    super(message, code, details);
    this.statusCode = getStatusCodeForError(code);
  }

  /**
   * BC35 FIX: Returns details only for 4xx client errors (validation, not-found, etc.)
   * Strips details for 5xx server errors to prevent leaking internal state.
   */
  get safeDetails(): Record<string, any> | undefined {
    return this.statusCode < 500 ? this.details : undefined;
  }
}

/**
 * Type guards
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Error codes
 */
export const ErrorCode = {
  // Auth errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  BAD_REQUEST: 'BAD_REQUEST',

  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  FOREIGN_KEY_VIOLATION: 'FOREIGN_KEY_VIOLATION',
  NOT_FOUND: 'NOT_FOUND',

  // API errors
  API_ERROR: 'API_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Domain-specific
  PIPELINE_STAGE_MISMATCH: 'PIPELINE_STAGE_MISMATCH',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Map error codes to HTTP status codes
 */
function getStatusCodeForError(code: ErrorCodeType): number {
  switch (code) {
    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.INVALID_TOKEN:
    case ErrorCode.TOKEN_EXPIRED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.INVALID_REQUEST:
    case ErrorCode.MISSING_REQUIRED_FIELD:
    case ErrorCode.INVALID_FIELD_VALUE:
    case ErrorCode.BAD_REQUEST:
      return 400;
    case ErrorCode.RECORD_NOT_FOUND:
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return 429;
    case ErrorCode.SERVICE_UNAVAILABLE:
      return 503;
    case ErrorCode.PIPELINE_STAGE_MISMATCH:
      // Conflict — the harness task and the stage's recorded owner disagree
      // about who owns the stage. Mid-run state divergence; not a server bug.
      // Latent until the MCP HTTP route's catch is updated to honor typed-error
      // statusCode (currently set on ApiError only). Forward-looking.
      return 409;
    case ErrorCode.INTERNAL_SERVER_ERROR:
    case ErrorCode.API_ERROR:
    case ErrorCode.DATABASE_ERROR:
    case ErrorCode.DUPLICATE_RECORD:
    case ErrorCode.FOREIGN_KEY_VIOLATION:
    default:
      return 500;
  }
}

/**
 * WS2 Phase A (2026-08-17): task.metadata.protocol (+ protocolResolvedAt) is a PLATFORM-written
 * routing fact — resolved once from the title token at the execution chokepoint, write-protected
 * on every client task path. A client write carrying a DIFFERING (or novel) value is rejected
 * loudly (Protocol 10: a clear client-facing signal, never a silent strip — the D-1
 * rejectTemplateControlledKeys contract); an EQUAL echo (the POV editor round-trips whole task
 * entities) is accepted as a no-op. See lib/tasks/services/protected-task-metadata.ts and
 * cline_docs/reviews/ws2-phase-a-2026-08-17/SYNTHESIS.md D3.
 */
export class ProtocolStampImmutableError extends AppError {
  constructor(taskId: string, key: string, details?: Record<string, any>) {
    super(
      `PROTOCOL_STAMP_IMMUTABLE: task metadata key "${key}" is resolved by the platform at first ` +
      `execution and is not writable per task (task ${taskId}). Before the task's first execution, ` +
      `edit the (protocol: …) token in the TITLE instead — resolution consumes it; after, ` +
      `delete-and-recreate the task (or use the admin backfill script for a protocol rename).`,
      'PROTOCOL_STAMP_IMMUTABLE',
      details
    );
  }
}
