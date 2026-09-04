/**
 * Agent Execution Create Wrapper — the canonical path for creating
 * `agent_executions` rows.
 *
 * ## Purpose
 *
 * Single enforcement point for the `context.triggeredBy` shape contract
 * (see `lib/services/types/triggered-by.ts`). Every call site that creates
 * an execution row MUST funnel through this wrapper. Raw
 * `agentExecution.create(...)` calls are forbidden outside this file —
 * enforced by `__tests__/security/raw-agent-execution-create.test.ts`
 * (task #85 scope item G8) which fails CI if any other file contains the
 * raw call.
 *
 * ## Why a wrapper instead of documentation
 *
 * The 2026-04-15 reactor-userId-drift bug happened because 4+ call sites
 * independently assembled the `context.triggeredBy` object. Two got the
 * shape right; two wrote a bare string. Documentation-only enforcement
 * doesn't survive N independent authors. This wrapper makes the schema
 * violation a hard fail (`BoundaryContractViolation` thrown) before any
 * database row is written.
 *
 * ## Audit trail
 *
 * Every execution creation also fires a fire-and-forget `TaskActivity`
 * entry via `logActivityWithDetails` — written in its own transaction
 * outside the agentExecution.create transaction, so audit-write failures
 * don't roll back the execution record (and vice versa). See scope item
 * E7 and 2nd-pass sec-ops NEW-1 for the transaction-boundary rationale.
 *
 * ## Pipeline context chaining
 *
 * Before creating the row, this wrapper calls `prepareTaskForExecution` to
 * populate the task's `inputContext` from completed dependencies (pipeline §6
 * chaining) — non-fatal, run BEFORE the INSERT (so the poller never sees a
 * PENDING row whose context isn't chained), skipped for SCHEDULED rows and for
 * explicit inputContext overrides. See lib/agents/harness/prepare-task-for-execution.ts.
 *
 * ## Callers
 *
 * As of commit landing task #85:
 *   - lib/services/agentTaskService.ts (direct MCP path, source: 'mcp-direct')
 *   - lib/services/taskReadyReactorService.ts (two call sites — 'reactor-task-ready', 'reactor-task-ready-initial')
 *   - lib/services/pipelineRetriggerReactorService.ts (source: 'reactor-pipeline-retrigger')
 *   - app/api/tasks/[taskId]/agent/execute/route.ts (source: 'api-task-execute')
 *   - app/api/pov/agent/execute/stream/route.ts (source: 'api-pov-stream')
 *
 * New callers: import {createAgentExecution}; pick the right source from
 * `TriggeredBySourceEnum`; done.
 */

import type { AgentExecution } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveExecutionModelParams } from './llm/template-model-params';
import { assertPersisted } from '@/lib/mcp/tasks/action/utilities/durability';
import { mcpLogger } from '@/lib/logger';
import { BoundaryContractViolation, CanNeverRunError, DuplicateActiveExecutionError } from '@/lib/errors';
import { TriggeredBySchema, type TriggeredBy } from './types/triggered-by';
import { logActivityWithDetails } from '@/lib/tasks/services/taskActivityService';
import { TaskActivityAction } from '@/lib/types/activity';
import { prepareTaskForExecution } from '@/lib/agents/harness/prepare-task-for-execution';

const log = mcpLogger.child({ module: 'agentExecutionCreate' });

/**
 * Server-reserved keys inside `agent_executions.context` — fields the server
 * sets and that downstream code reads for a CONTROL-FLOW decision. A client must
 * never be able to inject these (the only raw-client-context ingress is the
 * stream route, which passes `body.context` verbatim — see
 * client-context-trust-boundary-2026-06-14.md). Strip them from any
 * client-supplied context BEFORE it becomes `contextExtras`.
 *
 *  - `triggeredBy`        — identity (also overwritten server-side here, but strip for clarity)
 *  - `reactorGeneration`  — D-4 per-harness generation budget (Guard 8)
 *  - `cascadeCompletedTaskId` / `upstreamCompletedTaskId` — reactor cascade markers
 *
 * NOTE: do NOT strip these inside `createAgentExecution` unconditionally — the
 * reactor legitimately sets `reactorGeneration`/`cascade*` via its own
 * server-built `contextExtras`. Strip only at the client ingress.
 */
export const SERVER_RESERVED_CONTEXT_KEYS = [
  'triggeredBy',
  'reactorGeneration',
  'cascadeCompletedTaskId',
  'upstreamCompletedTaskId',
  // retry-band keep-best (2026-07-04): retry-provenance stamp, written ONLY by the
  // gated chokepoint logic below — never client-suppliable.
  'reExecutionOfExecutionId',
] as const;

/**
 * Return a shallow copy of a client-supplied context object with all
 * server-reserved keys removed. Use at any ingress that accepts raw client
 * context (today: the agent stream route).
 */
export function stripReservedContextKeys(
  ctx: Record<string, any> | null | undefined
): Record<string, any> {
  if (!ctx || typeof ctx !== 'object') return {};
  const out: Record<string, any> = { ...ctx };
  for (const key of SERVER_RESERVED_CONTEXT_KEYS) delete out[key];
  return out;
}

/**
 * Sources permitted to set server-reserved context keys (`reactorGeneration`/
 * `cascade*`): the reactor + system creates that legitimately build that context.
 * Every OTHER source is an API/client path that must never carry them.
 */
const SERVER_CONTEXT_SOURCES: ReadonlySet<string> = new Set([
  'reactor-task-ready',
  'reactor-task-ready-initial',
  'reactor-pipeline-retrigger',
  'child-assignee-fallback',
  'system',
]);

/**
 * Arguments for creating an agent execution row.
 *
 * `triggeredBy` is validated as typed `TriggeredBy` (see triggered-by.ts).
 * `contextExtras` is merged into the stored context alongside triggeredBy
 * — use it for direct-path richness (task snapshot, pov, assignee) that
 * reactors don't need.
 */
export interface CreateAgentExecutionArgs {
  taskId: string;
  agentTemplateId?: string | null;
  status: 'PENDING' | 'SCHEDULED' | 'RUNNING';
  config: Record<string, any>;
  triggeredBy: TriggeredBy;
  contextExtras?: Record<string, any>;
  logs?: string[];
  scheduledFor?: Date | null;
  /**
   * Optional POV scope for audit-trail forensics. Caller supplies if known
   * — the execution row itself doesn't carry povId, but the audit record
   * benefits from the scope for "who billed what under which POV" queries.
   */
  povId?: string | null;
  /**
   * Skip dependency context chaining for this execution. Set by the explicit
   * `agent.execute` path when an explicit `inputContext` override was supplied,
   * so chaining does not clobber it (preserves v1 semantics — TS3).
   */
  skipChaining?: boolean;
}

/**
 * Result of {@link createAgentExecution}.
 *
 * `chainedInputContext` is the serialized merged `task.inputContext` written by
 * the pre-execution chaining step, or null when nothing was chained. Callers that
 * build their prompt from an in-memory `task` snapshot (the SSE stream route) adopt
 * it directly to avoid a replication-lag-prone re-read (A2); poller-driven callers
 * ignore it (they re-read `task` fresh after row creation).
 */
export interface CreateAgentExecutionResult {
  execution: AgentExecution;
  chainedInputContext: Record<string, unknown> | null;
}

/**
 * Canonical execution-row create.
 *
 * Throws `BoundaryContractViolation` synchronously if `triggeredBy` fails
 * its Zod schema. Otherwise creates the row, fires a fire-and-forget
 * forensic audit entry, and returns the full created execution record.
 * Callers typically only need `.id` + `.taskId` + `.status` but the full
 * row is returned for parity with direct `prisma.agentExecution.create`
 * usage at existing sites.
 */
export async function createAgentExecution(
  args: CreateAgentExecutionArgs
): Promise<CreateAgentExecutionResult> {
  // Write-boundary validation: schema parse throws ZodError on failure,
  // which we wrap in BoundaryContractViolation for catch-block clarity.
  const parseResult = TriggeredBySchema.safeParse(args.triggeredBy);
  if (!parseResult.success) {
    log.error(
      {
        taskId: args.taskId,
        receivedTriggeredBy: args.triggeredBy,
        issues: parseResult.error.issues,
      },
      'triggeredBy shape contract violation at agent-execution-create boundary'
    );
    throw new BoundaryContractViolation(
      `Invalid triggeredBy shape for agent execution (taskId=${args.taskId}). ` +
        `First issue: ${parseResult.error.issues[0]?.path.join('.')} — ${parseResult.error.issues[0]?.message}`,
      {
        issues: parseResult.error.issues,
        received: args.triggeredBy,
        taskId: args.taskId,
      }
    );
  }
  const validatedTriggeredBy = parseResult.data;

  // P1 boundary-contract defense-in-depth (2026-06-15): only reactor/system creates may
  // carry server-reserved context keys (reactorGeneration/cascade*). For any API/client
  // source, strip them at this chokepoint too — belt-and-suspenders behind the stream-route
  // ingress strip, and the STRUCTURAL guard for any FUTURE client-facing create path that
  // forwards body.context but forgets to strip. Does NOT clobber the reactor (its source is
  // in SERVER_CONTEXT_SOURCES). See client-context-trust-boundary-2026-06-14.md.
  if (!SERVER_CONTEXT_SOURCES.has(validatedTriggeredBy.source) && args.contextExtras) {
    const ce = args.contextExtras;
    const present = SERVER_RESERVED_CONTEXT_KEYS.filter((k) => ce[k] !== undefined);
    if (present.length > 0) {
      log.warn(
        { taskId: args.taskId, source: validatedTriggeredBy.source, strippedKeys: present },
        'Stripped server-reserved context keys from a non-reactor create (client injection or caller bug)'
      );
      args.contextExtras = stripReservedContextKeys(ce);
    }
  }

  // Pipeline context chaining (2026-06-06). Single pre-execution step at THE
  // enforced row-creation chokepoint, so every path (explicit, both task-ready
  // reactors, pipeline-retrigger, REST, SSE stream) gets full-fidelity §6 context
  // — not just the explicit agent.execute path (the two-execution-path-parity bug).
  // Run BEFORE the row is created so the poller can never pick up a PENDING row
  // whose task.inputContext hasn't been chained yet. NON-FATAL (helper swallows +
  // loud-logs). NOT wrapped in a shared $transaction with the create: chaining does
  // cross-row reads that would lengthen the create txn and widen the P2002 race
  // window; an inert chained inputContext with no row (if create then fails) is
  // harmless — the next create re-chains. See IMPLEMENTATION-PLAN-v2.md (Change 2).
  // F16 (2026-07-16): prepareTaskForExecution's CC7 guard throws a typed PERMANENT
  // CanNeverRunError BEFORE any row exists — so no terminal persist ever fires for
  // this task. Placed HERE (the one universal funnel) so ALL callers — both task-ready
  // reactors, the retrigger reactor, agent.execute, REST, SSE — uniformly mark the task
  // executionStatus=FAILED + cone + fire the program retrigger (frozen-cone fix).
  // Best-effort then RETHROW THE ORIGINAL error (loud-fail contract preserved —
  // interactive callers still see the refusal; reactor catches log-and-continue).
  let chainedInputContext: Record<string, unknown> | null;
  try {
    chainedInputContext = await prepareTaskForExecution(args.taskId, {
      status: args.status,
      skipChaining: args.skipChaining,
    });
  } catch (prepErr) {
    if (prepErr instanceof CanNeverRunError) {
      try {
        const { handleCanNeverRunTask } = await import('./task-can-never-run-persist');
        await handleCanNeverRunTask(args.taskId, prepErr, validatedTriggeredBy.id);
      } catch (markErr) {
        log.error(
          { taskId: args.taskId, err: markErr instanceof Error ? markErr.message : String(markErr) },
          'can-never-run marking failed — rethrowing the original refusal (task may stay OPEN; F16)'
        );
      }
    }
    throw prepErr;
  }

  // ── Retry-provenance stamp (retry-band keep-best, 2026-07-04, reviewed 92%) ──
  // Gate (MED-1 + reactor exclusion): stamp ONLY orchestrator-issued re-executions —
  // source 'mcp-direct' (an agent-loop tool call; humans via Desktop share the source but
  // never carry parentExecutionId — the loop threads it, clients can't) AND
  // parentExecutionId present. Reactor sources are deliberately EXCLUDED: the
  // pipeline-retrigger reactor also writes parentExecutionId, but a SYNTHESIZE retrigger
  // is a mode transition, not a retry — stamping it could wrongly self-supersede the
  // root's CREATE run. The stamp targets the CURRENT authoritative SUCCESS execution
  // (via the shared selector — INFO-3: no fifth hand-rolled query); absent one, no stamp
  // (first execution of a task is never a retry). Consumed once by the terminal
  // self-supersession comparison; forensic thereafter.
  let reExecutionOfExecutionId: string | undefined;
  if (
    validatedTriggeredBy.source === 'mcp-direct' &&
    validatedTriggeredBy.parentExecutionId
  ) {
    try {
      const { selectAuthoritativeExecution } = await import('./execution-selection');
      const { execution: priorAuthoritative } = await selectAuthoritativeExecution(prisma, args.taskId);
      if (priorAuthoritative) {
        reExecutionOfExecutionId = priorAuthoritative.id;
        log.info(
          { taskId: args.taskId, reExecutionOfExecutionId, parentExecutionId: validatedTriggeredBy.parentExecutionId },
          'Retry-provenance stamp: orchestrator re-execution of a task with a prior authoritative SUCCESS'
        );
      }
    } catch (stampErr) {
      // Non-fatal: a failed stamp degrades to latest-wins (no worse than pre-feature).
      log.warn({ taskId: args.taskId, err: stampErr instanceof Error ? stampErr.message : String(stampErr) },
        'Retry-provenance stamp failed — execution proceeds unstamped (latest-wins)');
    }
  }

  // ── I-10 snapshot-at-create (convergence Phase 5b-iii, template-system Q3a ruling) ──
  // Resolve the model-parameter precedence chain ONCE, here at the enforced create
  // chokepoint, and freeze the result into `execution.config`. Both execution paths
  // read the frozen row (the engine always did; the stream's live re-compute at
  // prompt time — the 506ddd91 wiring-site class — is retired by this).
  // Merge order: `args.config` WINS on key collisions, so the five callers that
  // already pass a pre-resolved rich config (both reactors, retrigger,
  // agentTaskService, REST route) are value-idempotent — their flat keys came from
  // this same chain. The raw-config caller (SSE stream: body.agentConfig) gains the
  // resolved flat keys it previously computed live. NON-FATAL: a resolution failure
  // degrades to args.config verbatim (loud warn); a genuinely model-less config then
  // fails loud downstream at normalizeModelConfig (MODEL_UNRESOLVED), never silently.
  let frozenConfig: Record<string, any> = args.config;
  try {
    const taskForConfig = await prisma.task.findUnique({
      where: { id: args.taskId },
      select: {
        metadata: true,
        agentTemplateId: true,
        agentTemplate: { select: { id: true, promptTemplate: true, maxRetries: true, timeout: true, metadata: true } },
      },
    });
    if (taskForConfig) {
      // The governing template is the one the RUN will resolve (execution.agentTemplate
      // || task.agentTemplate — the engine's resolvedTemplate chain).
      let template = taskForConfig.agentTemplate;
      if (args.agentTemplateId && args.agentTemplateId !== taskForConfig.agentTemplateId) {
        template = await prisma.agentTemplate.findUnique({
          where: { id: args.agentTemplateId },
          select: { id: true, promptTemplate: true, maxRetries: true, timeout: true, metadata: true },
        });
      }
      const resolved = resolveExecutionModelParams({
        taskMetadata: taskForConfig.metadata,
        explicitParams: (args.config as any)?.parameters,
        template,
      });
      frozenConfig = { ...resolved, ...args.config };
    } else {
      log.warn({ taskId: args.taskId }, 'config snapshot: task not found — freezing caller config verbatim');
    }
  } catch (snapshotErr) {
    log.warn(
      { taskId: args.taskId, err: snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr) },
      'config snapshot failed — freezing caller config verbatim (a model-less config will fail loud at normalizeModelConfig)'
    );
  }

  // BC-T6-1 (T6 boundary audit, 2026-07-17): the frozen config MUST reflect what the execution will
  // actually SEE. Above, `frozenConfig = { ...resolved, ...args.config }` lets **args.config win** —
  // and the `reactor-task-ready` caller passes a config whose `inputContext` was copied BEFORE
  // prepareTaskForExecution applied chaining, while the retrigger reactor happens to pass a
  // post-chain copy. So the two reactors DISAGREED and the frozen snapshot silently misrepresented
  // the run: T6's exec1 froze an inputContext with NO `chainedFrom` even though its runtime prompt
  // demonstrably carried §6. A forensic audit keying on the frozen config concludes "this execution
  // never received chained context" — during the T6 audit that reading **would have falsely refuted
  // the round's core claim**, and nearly did.
  //
  // `chainedInputContext` is prepareTaskForExecution's RETURNING value — the authoritative merged
  // inputContext for THIS execution — so it wins over any caller-supplied copy. Null (no chaining /
  // skipChaining) leaves the caller's value untouched.
  // Severity: LOW functional (the runtime prompt was always built from the task row, not this
  // snapshot) / MEDIUM forensic. Pinned by scripts/test-execution-config-snapshot.ts.
  if (chainedInputContext) {
    frozenConfig = { ...frozenConfig, inputContext: chainedInputContext };
  }

  const now = new Date();
  let execution: AgentExecution;
  try {
    execution = await prisma.agentExecution.create({
      data: {
        taskId: args.taskId,
        agentTemplateId: args.agentTemplateId ?? undefined,
        status: args.status,
        config: frozenConfig as any,
        context: {
          ...(args.contextExtras || {}),
          triggeredBy: validatedTriggeredBy as any,
          ...(reExecutionOfExecutionId ? { reExecutionOfExecutionId } : {}),
        } as any,
        logs: args.logs ?? [],
        // A RUNNING execution has, by definition, already started → stamp startTime now. SCHEDULED uses its
        // scheduled time; PENDING stays null until a runner promotes it. 2026-06-09: the stream path creates
        // directly as RUNNING (the engine creates PENDING then updates), so without this its executions had a
        // NULL startTime → excluded by /api/agent-executions' `startTime >= …` filter → GUI artifacts vanished.
        startTime: args.status === 'RUNNING' ? now : (args.scheduledFor ?? null),
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    // 2026-04-18 L3: the partial UNIQUE index `idx_agent_executions_active_per_task`
    // prevents duplicate active (PENDING/RUNNING) executions for the same task.
    // A P2002 on this constraint means another code path won the race. Translate
    // to the typed DuplicateActiveExecutionError so callers stay Prisma-agnostic.
    //
    // Prisma 6.16 `meta.target` is typed `Record<string, unknown>` and runtime
    // behavior varies for named raw-SQL indexes:
    //   - Managed @@unique → `string[]` of column names
    //   - Named raw-SQL index → typically `string` with the index name
    //   - Some Postgres/Prisma codepaths → `undefined` with constraint name in message
    // Three-arm matcher + message-body fallback covers all three (boundary-contract §B3).
    const prismaErr = err as { code?: string; meta?: { target?: string[] | string } };
    const targetMatchesOurIndex =
      prismaErr?.code === 'P2002' && (
        (Array.isArray(prismaErr.meta?.target) && prismaErr.meta.target.includes('taskId')) ||
        (typeof prismaErr.meta?.target === 'string' && prismaErr.meta.target.includes('active_per_task')) ||
        (err instanceof Error && err.message.includes('active_per_task'))
      );

    if (targetMatchesOurIndex) {
      // Look up the winner's id so callers can surface it in user-facing errors.
      const existing = await prisma.agentExecution.findFirst({
        where: { taskId: args.taskId, status: { in: ['PENDING', 'RUNNING'] } },
        select: { id: true },
      }).catch(() => null);

      // Phantom-P2002 sanity check (boundary-contract §B3 IMPORTANT):
      // We matched the constraint identifier but can't find an active row —
      // either data is stale or Prisma's error shape drifted. Don't fabricate
      // a DuplicateActiveExecutionError with `existingExecutionId: undefined`;
      // log loudly and re-throw the original error for forensics.
      if (!existing) {
        log.error(
          {
            taskId: args.taskId,
            errorCode: 'DUPLICATE_ACTIVE_EXECUTION_PHANTOM',
            triggeredBy: validatedTriggeredBy.source,
            prismaMetaTarget: prismaErr.meta?.target,
            prismaMessage: err instanceof Error ? err.message : undefined,
          },
          'P2002 matched our partial unique index, but no active execution found — Prisma error shape may have drifted'
        );
        throw err;
      }

      // Monitoring hook (dev-ops §9): stable label for §5.F.6 30-day grep metric.
      // Queries in the plan grep `errorCode":"DUPLICATE_ACTIVE_EXECUTION"` directly.
      log.warn(
        {
          taskId: args.taskId,
          errorCode: 'DUPLICATE_ACTIVE_EXECUTION',
          existingExecutionId: existing.id,
          triggeredBy: validatedTriggeredBy.source,
        },
        'Active execution already exists for task — constraint rejected duplicate create'
      );

      throw new DuplicateActiveExecutionError(args.taskId, existing.id);
    }

    // Any other error propagates unchanged.
    throw err;
  }

  // DURABILITY ASSERTION — guard the phantom-commit class (create resolved, no durable row).
  // Runs ONLY on the genuine-new-create success path: the P2002 dedup arm throws
  // DuplicateActiveExecutionError above, so this never fires on dedup. Placed BEFORE the
  // fire-and-forget audit write so a phantom commit aborts before we emit an AGENT_EXECUTED
  // activity for a non-existent execution (Protocol 10: ship the fact of persistence).
  // INVARIANT: callers MUST NOT wrap createAgentExecution in an outer $transaction — the
  // post-commit read-back assumes the bare create has auto-committed; a fresh-query read
  // inside an uncommitted outer txn would false-throw.
  // See cline_docs/findings/2026-06-20-mcp-task-create-false-success.md.
  await assertPersisted(
    () => prisma.agentExecution.findUnique({ where: { id: execution.id }, select: { id: true } }),
    {
      entity: 'AgentExecution',
      actionLabel: 'agent.execution.create',
      id: execution.id,
      log: { taskId: args.taskId, executionId: execution.id, triggeredBySource: validatedTriggeredBy.source, povId: args.povId ?? undefined },
    }
  );

  // OPEN → IN_PROGRESS at the row-creation chokepoint (2026-07-14). The agent.execute MCP
  // handler does this transition itself, but the OTHER entry paths (TaskReadyReactor
  // auto-queue, poller, reactor SYNTHESIZE requeue) reach here directly — and a task left
  // OPEN while executing breaks TWO downstream invariants: the pipeline-retrigger reactor's
  // Guard 3 (`status = 'IN_PROGRESS'`) silently never fires (auto-queued harness ran CREATE,
  // children all completed, SYNTHESIZE never retriggered — cascading-pipelines Phase-0 probe,
  // run cmrkmy4z6…), and task.complete rejects OPEN→COMPLETED as an invalid transition.
  // Conditioned on OPEN so it is a no-op for re-runs of COMPLETED tasks and for tasks the
  // handler already transitioned (idempotent parity with agent-execute-handler.ts:171).
  await prisma.task.updateMany({
    where: { id: args.taskId, status: 'OPEN' },
    data: { status: 'IN_PROGRESS', updatedAt: new Date() },
  });

  // Fire-and-forget forensic audit. Runs in its own transaction (via
  // logActivityWithDetails's own create call), so a failure here cannot
  // roll back the execution row. Loud-log on failure inside the helper.
  // Satisfies E7 + 2P-BC-2 + 2P-SEC-3 (transaction boundary correctness).
  logActivityWithDetails({
    taskId: args.taskId,
    userId: validatedTriggeredBy.id,
    action: TaskActivityAction.AGENT_EXECUTED,
    details: {
      executionId: execution.id,
      // Activity log's `executionStatus` enum targets completion states
      // (SUCCESS/FAILED/etc); at creation time we're always PENDING or
      // RUNNING, which the field's validator accepts. SCHEDULED is a
      // creation-only state with no activity-log equivalent — map it to
      // PENDING for audit purposes (the row's actual status is in
      // agent_executions.status, source of truth).
      executionStatus: (args.status === 'SCHEDULED' ? 'PENDING' : args.status) as 'PENDING' | 'RUNNING',
      agentName: 'agent-execution-create-wrapper',
      // Forensic fields for "who billed what" queries
      authMethod: 'per-user',
      triggeredBySource: validatedTriggeredBy.source,
      parentExecutionId: validatedTriggeredBy.parentExecutionId,
      parentTaskId: validatedTriggeredBy.parentTaskId,
      povId: args.povId ?? undefined,
    },
    metadata: { source: 'AGENT' },
  });

  return { execution, chainedInputContext };
}
