/**
 * Reactor Skip Counter
 *
 * Per-process counter that escalates the log level for reactor "duplicate
 * active execution" skips, so regression is visible without grepping debug
 * logs — while keeping baseline noise low.
 *
 * The partial UNIQUE index on agent_executions (L3) throws P2002 when two
 * paths race to create an active execution for the same task. The three
 * reactor paths catch the typed DuplicateActiveExecutionError and skip.
 * If L1+L2 are working, these skips should be rare (single digits per week
 * per reactor source). If the skip frequency rises, L1/L2 are leaking races
 * they should be catching.
 *
 * Escalation triggers:
 *   - First skip per reactor source (proves the constraint is alive)
 *   - Every 100th skip (extreme-frequency signal)
 *   - First skip past 1 hour since last info-level emit (hourly heartbeat)
 *
 * All other skips emit at debug level.
 *
 * Per-process state: in multi-PM2-instance deployments each process has
 * its own counter — that's fine, the metric we care about is per-process
 * frequency, not cluster-wide total.
 *
 * Created: 2026-04-18
 * Plan: cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md §5.D.4-escalation
 * Reviews: event-system-specialist-review.md §I2
 */

import { mcpLogger } from '@/lib/logger';

const log = mcpLogger.child({ module: 'ReactorSkipCounter' });

const ESCALATE_EVERY = 100;
const ESCALATE_HOURLY_MS = 60 * 60 * 1000;

interface CounterState {
  count: number;
  lastInfoAt: number;
}

const counters = new Map<string, CounterState>();

export type ReactorSource =
  | 'task-ready-depfree'
  | 'task-ready-depcompletion'
  | 'pipeline-retrigger';

/**
 * Log a reactor-duplicate-active-execution skip. Emits at info level on
 * first-per-source, every 100th, or first past the hour; otherwise debug.
 *
 * @param reactorSource - distinguishes which reactor path fired (important
 *                        for triage — harness-retrigger races diagnose
 *                        different bugs than task-ready races).
 * @param fields - additional structured fields to include in the log entry
 *                 (taskId, existingExecutionId, etc.).
 */
/**
 * Shared escalation logic for reactor-skip kinds (extracted 2026-04-25).
 * Both `logReactorDuplicateSkip` and `logReactorMismatchSkip` delegate here.
 * The caller decides:
 *   - the counter key (which determines what gets escalated together vs separately)
 *   - the payload shape (errorCode, reason, optional securityEvent flag, etc.)
 *   - the log message text
 */
function emitReactorSkipLog(
  stateKey: string,
  payload: Record<string, unknown>,
  message: string
): void {
  const now = Date.now();
  const state = counters.get(stateKey) ?? { count: 0, lastInfoAt: 0 };
  state.count += 1;

  const shouldEscalate =
    state.count === 1 ||
    state.count % ESCALATE_EVERY === 0 ||
    now - state.lastInfoAt > ESCALATE_HOURLY_MS;

  // Inject the running count into the payload so consumers can filter on it
  // without the caller having to thread it through.
  const finalPayload = { ...payload, skipCount: state.count };

  if (shouldEscalate) {
    state.lastInfoAt = now;
    log.info(finalPayload, message);
  } else {
    log.debug(finalPayload, message);
  }

  counters.set(stateKey, state);
}

export function logReactorDuplicateSkip(
  reactorSource: ReactorSource,
  fields: Record<string, unknown>
): void {
  // No `securityEvent: true` here — intentional asymmetry with
  // logReactorMismatchSkip below. A duplicate-active-execution skip is a
  // benign concurrency race caught by the L3 unique constraint (the system
  // working as designed). A pipeline-stage-mismatch skip indicates silent
  // corruption or a cross-harness completion attempt, which IS a security-
  // relevant integrity event. Don't add the tag here without rethinking
  // that distinction.
  emitReactorSkipLog(
    reactorSource,
    {
      ...fields,
      reactorSource,
      errorCode: 'DUPLICATE_ACTIVE_EXECUTION',
      reason: 'duplicate-active-execution',
    },
    'Reactor skipped: another path already queued this task (caught by unique constraint)'
  );
}

/**
 * Log a reactor pipeline-stage-mismatch skip. Same shape and escalation logic
 * as logReactorDuplicateSkip (delegated to `emitReactorSkipLog`) — distinct
 * error code surfaces in pino so the two skip kinds can be filtered separately
 * during incident response.
 *
 * Counter key is namespaced (`${reactorSource}:mismatch`) to avoid colliding
 * with the existing duplicate counter for the same source. Also tagged with
 * `securityEvent: true` per the codebase convention (verified 9+ sites
 * including service-call-handler.js:236,260) — the mismatch indicates silent
 * corruption or cross-harness completion attempt, distinct from the benign
 * race condition that produces a duplicate skip.
 *
 * Created: 2026-04-25
 * See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
 *
 * @param reactorSource - distinguishes which reactor path fired (currently
 *                        only 'pipeline-retrigger' uses this).
 * @param fields - additional structured fields (harnessTaskId, pipelineStageId,
 *                 recordedHarnessId, cascadeCompletedTaskId).
 */
export function logReactorMismatchSkip(
  reactorSource: ReactorSource,
  fields: Record<string, unknown>
): void {
  emitReactorSkipLog(
    `${reactorSource}:mismatch`,
    {
      ...fields,
      reactorSource,
      errorCode: 'PIPELINE_STAGE_MISMATCH',
      reason: 'pipeline-stage-mismatch',
      // Tag per codebase convention. logReactorDuplicateSkip deliberately does
      // NOT carry this — duplicates are benign concurrency races, not violations.
      securityEvent: true,
    },
    'Reactor skipped: stage harnessTaskId back-pointer does not match harness task (clobber suspected)'
  );
}

/**
 * Log a reactor generation-budget skip — the harness auto-retrigger CHAIN hit its
 * per-harness generation budget (MAX_HARNESS_REACTOR_GENERATIONS) and the reactor
 * refused to queue the next generation. Bounds a runaway/pathological harness whose
 * SYNTHESIZE keeps re-creating stages (the per-cycle Guards 1-7 each bound a SINGLE
 * retrigger; nothing else bounds the NUMBER of generations — the chain is otherwise
 * depth-unbounded, pipelineRetriggerReactorService.ts:281).
 *
 * Counter key is namespaced (`${reactorSource}:budget`) so budget trips escalate
 * separately from the duplicate (`${source}`) and mismatch (`${source}:mismatch`)
 * counters for the same source.
 *
 * NO `securityEvent: true` — like logReactorDuplicateSkip (and unlike
 * logReactorMismatchSkip), this is a benign runaway-guard firing (the system working
 * as designed), not an integrity violation. It is a FACT signal ("generation N hit
 * the budget"), not a verdict (Protocol 10-clean).
 *
 * Created: 2026-06-14
 * Plan: cline_docs/follow-ups/agent-execute-stream-hardening-2026-06-13.md (D-4)
 *
 * @param reactorSource - currently only 'pipeline-retrigger' uses this.
 * @param fields - structured fields (harnessTaskId, generation, budget,
 *                 cascadeCompletedTaskId).
 */
export function logReactorBudgetSkip(
  reactorSource: ReactorSource,
  fields: Record<string, unknown>
): void {
  emitReactorSkipLog(
    `${reactorSource}:budget`,
    {
      ...fields,
      reactorSource,
      errorCode: 'HARNESS_GENERATION_BUDGET_EXCEEDED',
      reason: 'generation-budget-exceeded',
    },
    'Reactor skipped: harness auto-retrigger generation budget exceeded (runaway guard)'
  );
}

/**
 * Test-only: reset counters. Not exported in production surface.
 */
export function __resetReactorSkipCounters(): void {
  counters.clear();
}
