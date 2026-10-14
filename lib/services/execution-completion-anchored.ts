/**
 * COMPLETE-THEN-FAIL phase 1 — the completion-anchored rescue (2026-10-05).
 *
 * Design: cline_docs/reviews/complete-then-fail-2026-10-05/DESIGN-v2.md (panel → SYNTHESIS → AUDIT W1–W8 folded;
 * every decision settled in the open register, COMPLETE-THEN-FAIL Q-groups 1 and 2).
 *
 * THE DEFECT. A PIPELINE SYNTHESIZE harness calls `task.complete` on its own task (the task is COMPLETED, its gate
 * stamped), and then its NEXT LLM call throws. Before this module the execution ended FAILED through the adapter
 * catch: the success persist (report.md, the SYNTHESIZE `pipeline-index.json`, the five net stamps) never ran, and the
 * failure tail's Finding-9 safety net woke the dependents onto the CREATE-time index. A COMPLETED leg with no
 * deliverable. 2 of 1,081 PIPELINE executions since 2026-06-26; the 2026-10-04 S3 leg is the preserved fixture.
 *
 * THE RESCUE. Everything the success persist writes is DB-derived EXCEPT the harness's closing narrative. So when the
 * thrown error is the loop's (it carries the attached partial state) AND this execution is the one that completed its
 * own PIPELINE SYNTHESIZE task AND report.md will come from an authoritative upstream source, the core does not hand
 * the throw to the adapter: it runs ONE DB-only builder and persists SUCCESS, with
 *   - a LABELLED platform-authored finalResponse (O2) that states no outcome and carries no parseable token, and
 *   - the `postCompletionFailure` FACT (O1/O3 — the provider error lives inside it; `errorCode` stays null).
 * The text cascade (confidence parse, #90 diagnostic retry, text-dependent quality arms) is NOT run.
 *
 * ERROR INTEGRITY (§3.6). Every throw this module does not rescue is rethrown as the ORIGINAL object. When the
 * execution HAD completed its own task (P2–P4), the outcome is attached to that object as `postCompletionRescue` and
 * the shared failure persist transcribes it into error.json — so "eligible but never evaluated" (a defect) is
 * separable in SQL from "declined by design" and "attempted and failed" (named residuals).
 *
 * PHASE 2 (O6) — the reapers will call `persistCompletionAnchored` unchanged, with `partial` absent.
 */

import type { PrismaClient } from '@prisma/client';
import { childTasksDispatchedBy } from './harness-dispatch-fact';
import { buildExecutionResultJson, deriveChainedContextSignal } from './execution-artifacts';
import { persistTerminalSuccess } from './execution-terminal-persist';
import { prepareHeldCapture, captureHeldFiles } from './held-bytes-capture';
import { anchoredSelfSupersession, selectAuthoritativeExecution } from './execution-selection';
import { stampExecutionNets } from './execution-nets';
import { assessExecutionQuality } from '@/lib/agents/harness/execution-quality';
import { readAgenticLoopPartial } from '@/lib/agents/harness/agentic-tool-loop';
import type { AgenticLoopPartial, ToolCallRecord } from '@/lib/agents/harness/agentic-tool-loop';
import type { ExecutionCoreInput } from './execution-core';
import type { TerminalSuccessResult } from './execution-terminal-persist';

type Logger = ExecutionCoreInput['logger'];

/** The anchor key (an AUDIT_STRIP_KEYS member, written only by the completion core's Layer 1). */
const ANCHOR_KEY = 'completedByExecutionId';

/** The fixed in-band first line of the platform text (v2 §3.4). Travels with the text on every path. */
export const POST_COMPLETION_TEXT_LABEL =
  "[Platform-authored record — not model output. This SYNTHESIZE run's closing turn did not run.]";

/** The O2 label value, nested in the fact (SYNTHESIS C1). */
export const POST_COMPLETION_FINAL_RESPONSE_SOURCE = 'platform-post-completion' as const;

/** Cap on the verbatim provider message inside the fact (v2 §3.5 / SYNTHESIS C2). */
export const POST_COMPLETION_MESSAGE_CAP = 1000;

export type PostCompletionDeclinedReason =
  | 'missing-partial-state'
  | 'no-deliverable-source'
  | 'no-authoritative-source'
  // Deviation from v2's three-member union, recorded in BUILD-REPORT: a P5/P6 READ that THROWS after P2–P4 held is
  // neither "declined by design" nor "attempted"; without a name it would be the absent outcome MI-13 calls a defect.
  | 'predicate-read-failed'
  // Build review BC-M1/EF-F1: the loop ended normally and the throw came later (the post-loop cascade or the normal
  // success persist). Not rescuable; named so MI-13 T1a stays 0 by construction.
  | 'post-loop-throw';

/** The rescue outcome attached to the ORIGINAL error (and transcribed into error.json) whenever P2–P4 held. */
export interface PostCompletionRescueOutcome {
  attempted: boolean;
  declinedReason: PostCompletionDeclinedReason | null;
  failedWith: { errorCode: string | null; message: string } | null;
}

/** The fact (v2 §3.5). No verdict-shaped members; stamped only when the event happened. */
export interface PostCompletionFailureFact {
  taskCompletedAt: string | null;
  failedAt: string;
  phase: string | null;
  turn: number | null;
  cause: {
    class: 'provider' | 'abort' | 'internal';
    errorCode: string | null;
    providerErrorType: string | null;
    requestId: string | null;
    message: string;
  };
  closingTurnRun: false;
  finalResponseSource: typeof POST_COMPLETION_FINAL_RESPONSE_SOURCE;
}

/** The error's code by the SAME expression both adapter catches use for the errorCode column / errorCategory. */
export function adapterErrorCode(err: unknown): string | null {
  const c = (err as { code?: unknown } | null | undefined)?.code;
  return typeof c === 'string' && c.length > 0 ? c : null;
}

/**
 * The error's message, verbatim — `message || name || 'Unknown error'` (build review BC-L1). The stream catch's
 * expression: it equals the engine's on every non-empty message, and an empty-message error (the ResponseAborted class)
 * still leaves the fact something that identifies it.
 */
export function adapterErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Unknown error';
  return 'Unknown error';
}

/**
 * A provider-controlled token rendered into PROSE (build review PC-F-PC-1). `providerErrorType` comes from the HTTP
 * error body — a fixed vocabulary from Anthropic, but not from a gateway or proxy — so the text renders it only when it
 * is a plain identifier, else `unrecognized`. The raw value is kept in the fact.
 */
export function prosePlainToken(v: string | null | undefined, absent: string): string {
  if (v == null || v === '') return absent;
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(v) ? v : 'unrecognized';
}

export function capMessage(message: string, cap = POST_COMPLETION_MESSAGE_CAP): string {
  if (message.length <= cap) return message;
  return message.slice(0, cap) + `…[truncated ${message.length - cap} chars]`;
}

export function buildPostCompletionFailureFact(input: {
  err: unknown;
  partial: AgenticLoopPartial | null;
  taskCompletedAt: Date | null;
  /** Fallback only: the partial's own throw-time `failedAt` wins when present (build review EF-F6). */
  failedAt: Date;
}): PostCompletionFailureFact {
  const { err, partial } = input;
  return {
    taskCompletedAt: input.taskCompletedAt ? input.taskCompletedAt.toISOString() : null,
    // The moment the loop CAUGHT the throw (from the partial); else the caller's time (phase 2: the reap time).
    failedAt: partial?.failedAt ?? input.failedAt.toISOString(),
    phase: partial?.phase ?? null,
    turn: partial ? partial.turn : null,
    cause: {
      class: partial?.causeClass ?? 'internal',
      errorCode: adapterErrorCode(err),
      providerErrorType: partial?.providerErrorType ?? null,
      requestId: partial?.requestId ?? null,
      message: capMessage(adapterErrorMessage(err)),
    },
    closingTurnRun: false,
    finalResponseSource: POST_COMPLETION_FINAL_RESPONSE_SOURCE,
  };
}

/**
 * The platform text (v2 §3.4). Deterministic; facts known at write time ONLY. Excluded by contract: any outcome claim,
 * the provider message (it stays in the fact), the gate's values, any confidence token, any VERDICT heading, the
 * report-id placeholder. Non-empty by construction ⇒ clears the R8 floor with no selector change (O2).
 */
export function buildPostCompletionText(input: {
  taskId: string;
  fact: PostCompletionFailureFact;
  deliverableSourceTaskId: string;
}): string {
  const { fact } = input;
  return [
    POST_COMPLETION_TEXT_LABEL,
    '',
    `Task: \`${input.taskId}\``,
    `Task completed at: ${fact.taskCompletedAt ?? 'not recorded on the task row'}`,
    `Failed at: ${fact.failedAt}`,
    `Failed call: phase \`${fact.phase ?? 'unknown'}\`, turn ${fact.turn ?? 'unknown'}`,
    `Cause: errorCode \`${prosePlainToken(fact.cause.errorCode, 'none')}\`, providerErrorType \`${prosePlainToken(fact.cause.providerErrorType, 'none')}\``,
    `Deliverable source task: \`${input.deliverableSourceTaskId}\``,
    'report.md outcome: see `reportMdSource` in this index.',
    'Gate as stamped: see task `metadata.qualityGate`.',
  ].join('\n');
}

/** The one execution-`logs` line (v2 §3.2 step 6, W4) — appended by the core, so equal on both paths. */
export function buildRescueLogLine(fact: PostCompletionFailureFact): string {
  return `Post-completion rescue: task completed by this execution at ${fact.taskCompletedAt ?? 'unknown'}; ` +
    `next call failed (${prosePlainToken(fact.cause.errorCode, 'no code')}/${prosePlainToken(fact.cause.providerErrorType, 'no provider type')}); ` +
    'deliverable persisted from DB state';
}

/** The auto-comment line (v2 §3.2 step 6). */
export const RESCUE_AUTO_COMMENT_NOTE =
  '**Post-completion failure**: this run completed its task, then a later call failed — see `postCompletionFailure` in pipeline-index.json';

/**
 * A tool record's arguments as an object. The loop records the PARSED object on success but the raw JSON STRING when the
 * call threw (agentic-tool-loop.ts executeToolTurn) — so a failed call must be parsed here or it is invisible (build
 * review PH-F2: a thrown registry delete read as "no registry delete").
 */
function argsObject(a: unknown): Record<string, unknown> | null {
  if (a && typeof a === 'object') return a as Record<string, unknown>;
  if (typeof a === 'string') {
    try { const p = JSON.parse(a); return p && typeof p === 'object' ? p as Record<string, unknown> : null; } catch { return null; }
  }
  return null;
}

/** Teardown fact for the Step-5 replacement comment, from the partial tool log (v2 §3.8 item 5): EVERY registry delete. */
export function teardownFactFromToolLog(toolCallResults: ToolCallRecord[]): string {
  const deletes = toolCallResults
    .map((t) => ({ t, a: argsObject(t.arguments) }))
    .filter(({ t, a }) => t.tool === 'registry' && !!a && a.action === 'delete');
  if (deletes.length === 0) return 'no registry delete in this run\'s tool log';
  const one = ({ t, a }: { t: ToolCallRecord; a: Record<string, unknown> | null }): string => {
    const name = prosePlainToken(typeof a?.service_name === 'string' ? a.service_name : null, 'unnamed');
    if (!t.success) return `\`${name}\` — threw: ${String(t.error ?? 'unknown error').slice(0, 200)}`;
    const isError = !!(t.result && typeof t.result === 'object' && (t.result as { isError?: unknown }).isError === true);
    return `\`${name}\` — ${isError ? 'returned an error result' : 'returned without error'}`;
  };
  return `${deletes.length} registry delete call(s): ${deletes.map(one).join('; ')}`;
}

/** Line 2 of the replacement comment — the platform-authorship marker (build review PC-F-PC-2). */
export const STEP5_REPLACEMENT_MARKER = 'Posted by the platform in place of the harness\'s Step 5 comment.';

/** The Step-5 replacement comment (v2 §3.8, Q4 decided: facts only, no imperatives, no table, no confidence). */
export function buildStep5ReplacementComment(input: {
  childStageId: string | null;
  reportMdArtifactId: string | null;
  gate: { outcome?: unknown; reviewerScore?: unknown; reviewerPresent?: unknown } | null;
  gateReadAt: Date;
  teardown: string;
  /** `metadata.programReleasable` on the fresh row, transcribed verbatim when present (build review PH-F7). */
  programReleasable?: unknown;
}): string {
  const lines: string[] = [];
  lines.push(`**Child stage:** \`${input.childStageId ?? 'not linked'}\``);
  lines.push(STEP5_REPLACEMENT_MARKER);
  lines.push(input.reportMdArtifactId
    ? `**📄 Final deliverable:** fetch(id: "artifact-${input.reportMdArtifactId}")`
    : '**📄 Final deliverable:** no report.md was produced by this run.');
  const g = input.gate;
  // "as READ at": the time is when the platform read the row, not when the harness stamped it (build review PH-F6).
  const releasable = input.programReleasable !== undefined ? ` · programReleasable \`${String(input.programReleasable)}\`` : '';
  lines.push(g
    ? `Gate as read at ${input.gateReadAt.toISOString()}: outcome \`${String(g.outcome ?? 'absent')}\` · reviewerScore \`${String(g.reviewerScore ?? 'absent')}\` · reviewerPresent \`${String(g.reviewerPresent ?? 'absent')}\`${releasable}`
    : `Gate as read at ${input.gateReadAt.toISOString()}: no qualityGate on the task${releasable}.`);
  // PH-F3: a COMPLETED leg CAN be re-run in place (2026-09-22) — what cannot change is its stamped outcome.
  lines.push('This task is COMPLETED; COMPLETED→COMPLETED is rejected, so a later run cannot change its stamped outcome.');
  lines.push(`**Teardown:** ${input.teardown}`);
  lines.push('The harness\'s closing comment was not posted: the per-child quality table and the closing score line are ' +
    'absent, not reconstructed. Cause: see `postCompletionFailure` in pipeline-index.json.');
  return lines.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The builder (no writes) — the acceptance replay runs exactly this against the preserved fixture.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AnchoredBuildInput {
  executionId: string;
  execution: ExecutionCoreInput['execution'];
  task: ExecutionCoreInput['task'];
  config: ExecutionCoreInput['config'];
  agentRole: string;
  harnessContext: ExecutionCoreInput['harnessContext'];
  protocolInjection?: ExecutionCoreInput['protocolInjection'];
  maxToolTurns: number;
  mcpFunctions?: ExecutionCoreInput['mcpFunctions'];
  modelFallback: string | null;
  /** The loop's partial state (phase 1: required by P1; phase 2's reapers pass none). */
  partial: AgenticLoopPartial | null;
  fact: PostCompletionFailureFact;
  deliverableSourceTaskId: string;
  startTime: Date;
  endTime: Date;
  extensions?: Record<string, unknown>;
  logger: Logger;
}

export interface AnchoredBuildResult {
  resultJson: Record<string, unknown>;
  finalText: string;
  tokensUsed: number;
  executionTime: number;
  toolCallResults: ToolCallRecord[];
  successfulToolCalls: number;
  failedToolCalls: number;
  supersession: ReturnType<typeof anchoredSelfSupersession>;
}

export async function buildCompletionAnchoredResult(
  db: PrismaClient,
  input: AnchoredBuildInput,
): Promise<AnchoredBuildResult> {
  const { executionId, task, partial, harnessContext, logger } = input;
  const toolCallResults = partial?.toolCallResults ?? [];
  const failedToolCalls = toolCallResults.filter((t) => !t.success).length;
  const successfulToolCalls = toolCallResults.length - failedToolCalls;
  const turnCount = partial?.turnCount ?? 0;
  const totalUsage = partial?.totalUsage;
  const tokensUsed = totalUsage ? totalUsage.inputTokens + totalUsage.outputTokens : 0;
  const executionTime = input.endTime.getTime() - input.startTime.getTime();
  const finalText = buildPostCompletionText({ taskId: task.id, fact: input.fact, deliverableSourceTaskId: input.deliverableSourceTaskId });

  // 1. Dispatch fact — server-written rows, as the core does.
  let dispatchedChildIds: string[] | undefined;
  const childStage = (task.metadata as Record<string, unknown> | null)?.pipelineStageId;
  if (typeof childStage === 'string') {
    try {
      dispatchedChildIds = await childTasksDispatchedBy(db, { executionId, childStageId: childStage });
    } catch (e) {
      logger.warn({ executionId, err: e instanceof Error ? e.message : String(e) },
        'dispatch-fact read failed (anchored) — protocol validator falls back to the tool-call log');
    }
  }

  // 2. Quality: the tool-log arms + the protocol validator with the post-completion sanctioned exit. Every
  //    text-dependent arm is bypassed by the flag (named reason 'post-completion-anchored').
  const { executionDegradation, protocolValidation } = assessExecutionQuality({
    toolCallResults,
    failedToolCalls,
    text: finalText,
    rawDeliverableText: finalText,
    stopReason: partial?.finalStopReason ?? null,
    loopExitStopReason: partial?.finalStopReason ?? null,
    task: { id: task.id, type: task.type, metadata: task.metadata, createdAt: task.createdAt },
    resolvedMode: harnessContext?.mode ?? null,
    ...(dispatchedChildIds ? { dispatchedChildIds } : {}),
    postCompletionFailure: true,
    executionId,
    turnCount,
    agentRole: input.agentRole,
    logger,
  });

  // 3. The canonical builder with EXPLICIT values: confidence null structurally (parseConfidenceScore and the #90
  //    diagnostic retry are NOT called); counts and usage from the partial state — never []/0 placeholders.
  const resultJson = buildExecutionResultJson({
    taskId: task.id,
    taskTitle: task.title,
    agentRole: input.agentRole,
    modelUsed: partial?.servingModel || input.modelFallback || 'default',
    finalResponse: finalText,
    confidenceScore: null,
    confidenceCapped: false,
    originalConfidence: null,
    executionDegradation,
    protocolValidation,
    harnessContext,
    protocolInjection: input.protocolInjection,
    postCompletionFailure: input.fact,
    turnCount,
    maxToolTurns: input.maxToolTurns,
    toolCallResults,
    successfulToolCalls,
    failedToolCalls,
    executionTime,
    tokensUsed,
    mcpFunctions: input.mcpFunctions,
    correctionTurnUsed: false,
    budgetFailFastUsed: false,
    diagnosticRetryUsed: false,
    finalStopReason: partial?.finalStopReason ?? null,
    ...(input.extensions ? { extensions: input.extensions } : {}),
    chainedContext: deriveChainedContextSignal(task.inputContext),
    logger,
    executionId,
  });

  // 4. The nets, through the ONE shared helper the core also calls (stampExecutionNets — build review EF-F2): both
  //    registry points, the same ctx construction. On a PIPELINE task only the five leg-synthesize nets apply. (v2
  //    lists nets before the builder; the core builds first and stamps after, and the replay proves byte parity.)
  await stampExecutionNets(db, {
    task: { id: task.id, type: task.type, metadata: task.metadata, inputContext: task.inputContext },
    agentRole: input.agentRole ?? null,
    harnessMode: harnessContext?.mode ?? null,
    finalResponse: finalText,
    executionId,
    logger,
  }, resultJson as Record<string, unknown>);

  // Keep-best: SKIPPED with the named reason, never compared (v2 §3.2 step 4, AR-A12/EF-F9).
  const supersession = anchoredSelfSupersession(input.execution.context);
  if (supersession) (resultJson as Record<string, unknown>).supersession = supersession.audit;

  return { resultJson, finalText, tokensUsed, executionTime, toolCallResults, successfulToolCalls, failedToolCalls, supersession };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The persist — builder + anchored terminal-success tx + the post-commit replacement comment.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PersistCompletionAnchoredInput extends AnchoredBuildInput {
  task: ExecutionCoreInput['task'];
  userId: string;
  buildSuccessLogs: ExecutionCoreInput['buildSuccessLogs'];
  prune: boolean;
  fireReactors: boolean;
}

export interface PersistCompletionAnchoredResult extends TerminalSuccessResult {
  tokensUsed: number;
  executionTime: number;
  endTime: Date;
}

export async function persistCompletionAnchored(
  db: PrismaClient,
  input: PersistCompletionAnchoredInput,
): Promise<PersistCompletionAnchoredResult> {
  // PLATFORM-HELD-BYTES Stage A (2026-10-14): the PURE half FIRST — buildCompletionAnchoredResult itself runs
  // buildExecutionResultJson and the nets over these same records (panel AE D1). Shadow; never throws.
  const heldPlan = prepareHeldCapture({
    toolCallResults: input.partial?.toolCallResults ?? [], task: { id: input.task.id, povId: input.task.povId }, logger: input.logger,
  });
  const built = await buildCompletionAnchoredResult(db, input);
  const logs = input.buildSuccessLogs({
    tokensUsed: built.tokensUsed, executionTime: built.executionTime,
    turnCount: input.partial?.turnCount ?? 0, toolCallCount: built.toolCallResults.length,
  });
  // W4: the rescue line goes into the execution `logs`, AFTER the adapter's own lines — never "completed
  // successfully" unqualified. Core-appended ⇒ identical on both paths.
  logs.push(buildRescueLogLine(input.fact));

  // PLATFORM-HELD-BYTES Stage A: the I/O half, back to back with the persist (never receives the loop records).
  const heldCaptures = await captureHeldFiles(db, { executionId: input.executionId, taskId: input.task.id, plan: heldPlan, logger: input.logger });

  const persisted = await persistTerminalSuccess(db, {
    executionId: input.executionId,
    ...(heldCaptures && (heldCaptures.refs.length || heldCaptures.refusals.length) ? { heldCaptures } : {}),
    task: { id: input.task.id, type: input.task.type, metadata: input.task.metadata, povId: input.task.povId, title: input.task.title },
    finalText: built.finalText,
    resultJson: built.resultJson,
    logs,
    endTime: input.endTime,
    executionCreatedAt: input.execution.createdAt ?? null,
    executionStartTime: input.startTime,
    usage: input.partial?.totalUsage,
    servingModel: input.partial?.servingModel ?? input.modelFallback ?? null,
    supersededById: null,
    truncationStalled: false,
    synthesizeDeadEnd: false,
    harnessNoOutput: false,
    agentRole: input.agentRole,
    confidenceScore: null,
    toolCallsTotal: built.toolCallResults.length,
    toolCallsSucceeded: built.successfulToolCalls,
    toolCallsFailed: built.failedToolCalls,
    commentUserId: input.userId || 'system',
    prune: input.prune,
    fireReactors: input.fireReactors,
    logger: input.logger,
    anchored: true,
    autoCommentNote: RESCUE_AUTO_COMMENT_NOTE,
  });

  // 7. Step-5 replacement comment — post-commit, where the real report.md id is known. Never thrown.
  // Posted ONLY when the harness's closing comment did NOT run (build review PH-F1): the validator already decided that —
  // `postCompletionSteps` is non-empty exactly when no task.comment followed the last task.complete. When the closing
  // comment DID run, the harness's own comment stands (its report-id placeholder is substituted in the tx) and a second
  // pointer saying "not posted" would contradict it.
  const pv = (built.resultJson as { protocolValidation?: { postCompletionSteps?: unknown } }).protocolValidation;
  const closingCommentMissing = Array.isArray(pv?.postCompletionSteps) && pv!.postCompletionSteps.length > 0;
  if (closingCommentMissing) try {
    const fresh = await db.task.findUnique({ where: { id: input.task.id }, select: { metadata: true } });
    const meta = (fresh?.metadata as Record<string, unknown> | null) ?? {};
    const reportMd = persisted.createdArtifacts.find((a) => a.name === 'report.md') ?? null;
    const text = buildStep5ReplacementComment({
      childStageId: typeof meta.pipelineStageId === 'string' ? meta.pipelineStageId : null,
      reportMdArtifactId: reportMd?.id ?? null,
      gate: (meta.qualityGate && typeof meta.qualityGate === 'object') ? meta.qualityGate as Record<string, unknown> : null,
      gateReadAt: new Date(),
      teardown: teardownFactFromToolLog(built.toolCallResults),
      ...(meta.programReleasable !== undefined ? { programReleasable: meta.programReleasable } : {}),
    });
    await db.comment.create({ data: { taskId: input.task.id, userId: input.userId || 'system', text, createdAt: new Date() } });
  } catch (commentErr) {
    input.logger.warn({ executionId: input.executionId, err: commentErr instanceof Error ? commentErr.message : String(commentErr) },
      'Post-completion rescue: Step-5 replacement comment failed — non-blocking');
  }

  return { ...persisted, tokensUsed: built.tokensUsed, executionTime: built.executionTime, endTime: input.endTime };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The predicate + the catch-side orchestration the core calls.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RescueContext extends Omit<PersistCompletionAnchoredInput,
  'partial' | 'fact' | 'deliverableSourceTaskId' | 'endTime'> {}

export interface RescueDeps {
  db: PrismaClient;
  /** Injectable for the unit pins; production = persistCompletionAnchored. */
  persist?: typeof persistCompletionAnchored;
  now?: () => Date;
}

/**
 * A throw AFTER the loop ended normally (the post-loop cascade or the normal success persist — tx timeout, 40P01, P2002)
 * on a run that had already completed its OWN PIPELINE SYNTHESIZE task (build review BC-M1 / EF-F1). It is not
 * rescuable (no loop partial; the normal persist itself failed), but without a named outcome it is indistinguishable in
 * SQL from "eligible but never evaluated", so MI-13's RED T1a would fire on correct code. Same predicate as
 * rescueOrRethrow's P2–P4 — so the outcome is present exactly when the run was eligible — and ALWAYS rethrows the
 * original object. A failed predicate read attaches nothing (eligibility unknown), as in rescueOrRethrow.
 */
export async function annotatePostLoopThrowOrRethrow(
  err: unknown,
  ctx: Pick<RescueContext, 'task' | 'executionId' | 'harnessContext' | 'logger'>,
  deps: Pick<RescueDeps, 'db'>,
): Promise<never> {
  const { task, executionId, harnessContext, logger } = ctx;
  if (task.type !== 'PIPELINE' || harnessContext?.mode !== 'SYNTHESIZE') throw err;
  if (!err || typeof err !== 'object' || (err as Record<string, unknown>).postCompletionRescue) throw err;
  type FreshRow = { status: string; metadata: unknown } | null;
  let fresh: FreshRow;
  try {
    fresh = await deps.db.task.findUnique({ where: { id: task.id }, select: { status: true, metadata: true } }) as FreshRow;
  } catch (readErr) {
    logger.warn({ executionId, taskId: task.id, err: readErr instanceof Error ? readErr.message : String(readErr) },
      'Post-loop throw: predicate read failed — rethrowing the original error with no outcome');
    throw err;
  }
  const meta = (fresh?.metadata && typeof fresh.metadata === 'object' ? fresh.metadata : {}) as Record<string, unknown>;
  if (fresh?.status !== 'COMPLETED' || meta[ANCHOR_KEY] !== executionId) throw err;
  attachOutcome(err, { attempted: false, declinedReason: 'post-loop-throw', failedWith: null });
  logger.warn({ executionId, taskId: task.id, postCompletionRescue: false, declinedReason: 'post-loop-throw' },
    'A throw after the loop ended normally, on a run that completed its own task — not rescuable; outcome recorded');
  throw err;
}

function attachOutcome(err: unknown, outcome: PostCompletionRescueOutcome): void {
  if (!err || typeof err !== 'object') return;
  try { (err as Record<string, unknown>).postCompletionRescue = outcome; } catch { /* frozen — log line still emitted */ }
}

/**
 * Called from the core's catch around the agentic loop. RESOLVES with the persist result when the run was rescued;
 * otherwise THROWS THE ORIGINAL ERROR OBJECT (identity preserved — every adapter reader sees it unchanged). Never
 * throws anything else.
 */
export async function rescueOrRethrow(
  err: unknown,
  ctx: RescueContext,
  deps: RescueDeps,
): Promise<PersistCompletionAnchoredResult> {
  const { task, executionId, harnessContext, logger } = ctx;
  const now = deps.now ?? (() => new Date());

  // P2 — no read needed.
  if (task.type !== 'PIPELINE' || harnessContext?.mode !== 'SYNTHESIZE') throw err;

  // P3/P4 — fresh read. Its own try: a failure here means eligibility is unknown, so nothing is attached.
  let fresh: { status: string; metadata: unknown; completedAt: Date | null; povId: string | null } | null;
  try {
    fresh = await deps.db.task.findUnique({
      where: { id: task.id },
      select: { status: true, metadata: true, completedAt: true, povId: true },
    }) as typeof fresh;
  } catch (readErr) {
    logger.warn({ executionId, taskId: task.id, err: readErr instanceof Error ? readErr.message : String(readErr) },
      'Post-completion rescue: predicate read failed — rethrowing the original error');
    throw err;
  }
  const meta = (fresh?.metadata && typeof fresh.metadata === 'object' ? fresh.metadata : {}) as Record<string, unknown>;
  if (fresh?.status !== 'COMPLETED' || meta[ANCHOR_KEY] !== executionId) throw err;

  // From here P2–P4 hold: the run is ELIGIBLE, and every exit attaches an outcome (MI-13 RED T1a keys on its absence).
  const decline = (declinedReason: PostCompletionDeclinedReason): never => {
    attachOutcome(err, { attempted: false, declinedReason, failedWith: null });
    logger.warn({ executionId, taskId: task.id, postCompletionRescue: false, declinedReason },
      'Post-completion rescue declined — the execution completed its own task but the rescue predicate does not hold');
    throw err;
  };

  // P1 — the typed loop error carrying the mandatory partial state.
  const partial = readAgenticLoopPartial(err);
  if (!partial) decline('missing-partial-state');

  // P5 — a deliverable source on the fresh row.
  const sourceTaskId = meta.deliverableSourceTaskId;
  if (typeof sourceTaskId !== 'string' || sourceTaskId.length === 0) decline('no-deliverable-source');

  // P6 — that source has an authoritative SUCCESS (the options getReportMdDecision uses).
  try {
    const { execution: authoritative } = await selectAuthoritativeExecution(deps.db, sourceTaskId as string, {
      requireNonEmptyArtifact: true,
    });
    if (!authoritative) decline('no-authoritative-source');
  } catch (p6Err) {
    if (p6Err === err) throw err; // a decline above
    logger.warn({ executionId, taskId: task.id, err: p6Err instanceof Error ? p6Err.message : String(p6Err) },
      'Post-completion rescue: P6 read failed');
    decline('predicate-read-failed');
  }

  const failedAt = now();
  const fact = buildPostCompletionFailureFact({ err, partial, taskCompletedAt: fresh?.completedAt ?? null, failedAt });
  const persist = deps.persist ?? persistCompletionAnchored;
  try {
    const result = await persist(deps.db, {
      ...ctx,
      partial,
      fact,
      deliverableSourceTaskId: sourceTaskId as string,
      endTime: failedAt,
    });
    const line = {
      executionId, taskId: task.id, postCompletionRescue: true,
      causeClass: fact.cause.class, errorCode: fact.cause.errorCode, providerErrorType: fact.cause.providerErrorType,
    };
    // AR-A5: an internal-class cause stays as loud as the adapter catch made it before.
    if (fact.cause.class === 'internal') logger.error({ ...line, err }, 'Post-completion rescue: SUCCESS persisted from DB state after an INTERNAL error');
    else logger.warn(line, 'Post-completion rescue: SUCCESS persisted from DB state after a post-completion failure');
    return result;
  } catch (rescueErr) {
    const failedWith = { errorCode: adapterErrorCode(rescueErr), message: capMessage(adapterErrorMessage(rescueErr)) };
    attachOutcome(err, { attempted: true, declinedReason: null, failedWith });
    logger.error({
      executionId, taskId: task.id, errorCode: 'POST_COMPLETION_RESCUE_FAILED',
      rescueErr: rescueErr instanceof Error ? rescueErr.message : String(rescueErr),
      rescueErrCode: failedWith.errorCode,
      originalErr: adapterErrorMessage(err),
    }, 'Post-completion rescue FAILED — rethrowing the ORIGINAL loop error (the adapter persists FAILED as before)');
    throw err;
  }
}
