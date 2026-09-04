/**
 * Execution-quality assessment — the post-loop detection cascade, extracted
 * (convergence Phase 1, 2026-07-04).
 *
 * ONE pure function owning the quality signals both execution paths previously
 * inline-mirrored (~150 lines each in agentExecutionEngine.ts and
 * stream/route.ts):
 *
 *   P5  BUDGET_EXHAUSTED               — token budget limiter rejected tool calls
 *   P4  TOOL_LOOP_DEGRADED             — last N (≥2) tool calls all failed
 *   P3  TOOL_FAILURES                  — overall failure rate > 50%
 *   P7  SILENT_REFUSAL                 — "I cannot…" with end_turn (500-char prefix, 0.5f shape)
 *   P9  TEMPLATE_SCOPE_MISMATCH        — RETIRED 2026-07-17 (~60 firings, 0 true positives; see templateScopeMatcher retirement)
 *   P10 TEMPLATE_MISMATCH_SELF_REPORTED — agent's own [TEMPLATE_MISMATCH] escape hatch (OVERRIDES)
 *   —   EMPTY_DELIVERABLE             — empty text + tool activity, nothing else claimed, NON-PIPELINE (M3 companion)
 *   —   HARNESS_NO_OUTPUT             — PIPELINE + empty pre-note deliverable, residual after P8 (2026-07-17 panel)
 *   P8  PROTOCOL_STEP_SKIPPED          — pipeline protocol validator (PIPELINE tasks only)
 *
 * Cascade priority is load-bearing: P5 > P4 > P3 are mutually exclusive
 * (if/else); P7 fires only when none of those matched; P9 only when nothing
 * matched; P10 OVERRIDES everything (agent self-report is the highest-
 * confidence signal); P8's errorCategory fills in only when still unclaimed,
 * but `protocolValidation` facts are ALWAYS populated when issues exist.
 *
 * PURE: no persistence, no LLM calls, no SSE. Signals are ADDITIVE — they
 * never change SUCCESS/FAILED status; they feed result.json so the GUI can
 * render degradation banners (task #85 B4 errorCategory channel).
 *
 * Engine-canonical: lifted verbatim from agentExecutionEngine.ts after the
 * 0.5c/0.5f hotfixes + the d7751d35 stream text normalization made the two
 * inline copies output-identical. Logs (optional `logger`) use the engine's
 * richer field sets — for the stream path this is a log-only enrichment,
 * named in the extraction commit.
 *
 * Gate: scripts/test-execution-quality.ts (branch fixtures + caller pins).
 * Manifest: cline_docs/reviews/execution-path-convergence-2026-07-04/divergence-manifest.md Part B.
 */

import { validatePipelineProtocolSteps } from '@/lib/services/pipelineProtocolValidator';
import { BUDGET_ERROR_PATTERN } from './agentic-tool-loop';
import type { ToolCallRecord } from './agentic-tool-loop';
// Canonical shape owned by the artifact family (index-signature form expected
// by buildExecutionResultJson) — do not redeclare here.
import type { ExecutionDegradation } from '@/lib/services/execution-artifacts';

export type { ExecutionDegradation };

/** Minimal pino-compatible logger surface (both paths pass their own). */
interface QualityLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

export interface ExecutionQualityInput {
  toolCallResults: ToolCallRecord[];
  failedToolCalls: number;
  /** The deliverable text (engine `finalResponse` / stream `generatedText`). */
  text: string | null | undefined;
  /**
   * The RAW pre-finalization deliverable text (`loopResult.assembledText`), BEFORE
   * finalizeTextForStopReason glues on the max_tokens/max_turns note. TRUNCATED_NO_OUTPUT
   * classifies against this, not `text` — otherwise the 56-char note masks an empty
   * truncation and the signal never fires. Optional: callers that don't supply it fall
   * back to `text` (older callers / fixtures).
   */
  rawDeliverableText?: string | null;
  /** `currentResponse?.stopReason` at loop exit. */
  stopReason: string | null | undefined;
  task: { id: string; type?: string | null; metadata?: unknown; createdAt?: Date };
  /** Platform-resolved harness mode (harnessContext.resolvedMode). Used for the P8
   *  UNKNOWN-only rescue and the harnessCreateIncomplete fact (2026-07-17). */
  resolvedMode?: string | null;
  executionId: string;
  turnCount: number;
  /** P10 log enrichment (engine supplies; optional). */
  templateName?: string | null;
  agentRole?: string | null;
  logger?: QualityLogger;
}

export interface ExecutionQualityResult {
  executionDegradation: ExecutionDegradation | null;
  protocolValidation: ReturnType<typeof validatePipelineProtocolSteps>;
  /** HARNESS_NO_OUTPUT fact (2026-07-17): PIPELINE task + empty pre-note deliverable. */
  harnessNoOutput: boolean;
  /** Dead-end CREATE fact (2026-07-17): resolvedMode CREATE + successful stage.create
   *  + zero successful task.update — the orphan-mint shape (any re-run resolves CREATE
   *  again). Terminal-persist conjoins this with fresh in-tx task-row facts. */
  harnessCreateIncomplete: boolean;
}

export function assessExecutionQuality(input: ExecutionQualityInput): ExecutionQualityResult {
  const {
    toolCallResults, failedToolCalls, text, stopReason,
    task, executionId, turnCount, logger,
  } = input;
  // Raw deliverable emptiness is judged on the PRE-note text (see rawDeliverableText doc).
  const rawDeliverable = input.rawDeliverableText !== undefined ? input.rawDeliverableText : text;
  const rawDeliverableEmpty = !rawDeliverable || rawDeliverable.trim().length === 0;

  // P3+P4+P5 (task #84): detect execution-quality degradation signals.
  let executionDegradation: ExecutionDegradation | null = null;

  if (toolCallResults.length > 0) {
    // P5: Budget exhaustion — specific error message from token budget limiter
    const budgetError = toolCallResults.find(
      t => !t.success && typeof t.error === 'string' && BUDGET_ERROR_PATTERN.test(t.error)
    );

    // P4: Consecutive tail failures — last N tool calls all failed
    let consecutiveTailFailures = 0;
    for (let i = toolCallResults.length - 1; i >= 0; i--) {
      if (!toolCallResults[i].success) consecutiveTailFailures++;
      else break;
    }

    // P3: Overall tool failure rate
    const toolFailureRate = failedToolCalls / toolCallResults.length;

    if (budgetError) {
      executionDegradation = {
        errorCategory: 'BUDGET_EXHAUSTED',
        degradationReason: 'Token budget limit hit mid-execution — tool calls rejected',
        budgetError: budgetError.error as string,
        consecutiveTailFailures,
        toolFailureRate: Math.round(toolFailureRate * 100),
      };
      logger?.warn({
        executionId,
        taskId: task.id,
        budgetError: budgetError.error,
        consecutiveTailFailures,
        toolFailureRate: Math.round(toolFailureRate * 100),
      }, 'Execution degraded: token budget exhausted — tool calls were rejected');
    } else if (consecutiveTailFailures >= 2) {
      executionDegradation = {
        errorCategory: 'TOOL_LOOP_DEGRADED',
        degradationReason: `Last ${consecutiveTailFailures} tool calls all failed — LLM exited after consecutive failures`,
        consecutiveTailFailures,
        toolFailureRate: Math.round(toolFailureRate * 100),
      };
      logger?.warn({
        executionId,
        taskId: task.id,
        consecutiveTailFailures,
        failedToolCalls,
        totalToolCalls: toolCallResults.length,
      }, 'Execution degraded: consecutive tail failures in tool loop');
    } else if (toolFailureRate > 0.5) {
      executionDegradation = {
        errorCategory: 'TOOL_FAILURES',
        degradationReason: `${failedToolCalls} of ${toolCallResults.length} tool calls failed (${Math.round(toolFailureRate * 100)}%)`,
        consecutiveTailFailures,
        toolFailureRate: Math.round(toolFailureRate * 100),
      };
      logger?.warn({
        executionId,
        taskId: task.id,
        failedToolCalls,
        totalToolCalls: toolCallResults.length,
        toolFailureRate: Math.round(toolFailureRate * 100),
      }, 'Execution degraded: majority of tool calls failed');
    }
  }

  // P7 (task #88): Silent refusal detection — LLM says "I can't do this" with
  // end_turn instead of the refusal stopReason path. Only fires if no other
  // degradation category matched (those are more specific diagnoses).
  if (!executionDegradation && text && stopReason === 'end_turn') {
    const inabilityPatterns = [
      /\bi\s+(?:am\s+)?(?:unable|cannot|can['']?t)\s+(?:to\s+)?(?:complete|fulfill|do|perform|handle|process|execute|accomplish|finish)/i,
      /\b(?:unable|not\s+able)\s+to\s+(?:complete|fulfill|proceed|continue|generate|produce)/i,
      /\bi\s+(?:do\s+not|don['']?t)\s+have\s+(?:access|the\s+(?:ability|capability|tools|information|context))/i,
      /\binsufficient\s+(?:context|information|data|access)\s+to/i,
      /\bi\s+(?:could|was)\s+not\s+(?:able\s+)?(?:to\s+)?(?:complete|fulfill|finish)/i,
    ];
    // Early-response detection: first 500 chars only (0.5f prefix-find shape —
    // an inability phrase buried at paragraph 5 after substantive work is
    // probably not a silent refusal).
    const prefix = text.slice(0, 500);
    const hitPattern = inabilityPatterns.find(p => p.test(prefix));
    if (hitPattern) {
      executionDegradation = {
        errorCategory: 'SILENT_REFUSAL',
        degradationReason: 'Agent ended with an inability statement using end_turn instead of the refusal path — execution stored as SUCCESS but the agent reported it could not complete the work',
        consecutiveTailFailures: 0,
        toolFailureRate: 0,
      };
      logger?.warn({
        executionId,
        taskId: task.id,
        responsePrefix: prefix.slice(0, 200),
        turnCount,
        toolCallCount: toolCallResults.length,
      }, 'Execution degraded: silent refusal — agent said "I cannot..." with end_turn');
    }
  }

  // P9 (task #90 MVP) RETIRED 2026-07-17: the templateType×verbs promotion is gone.
  // The MVP shipped to gather empirical FPR data; verdict was ~60 firings / 0 true
  // positives (all were deliberate protocol assignments whose vocabulary the verb
  // table didn't cover), occupying 95% of the degradation channel and training
  // readers to ignore it. Historical artifacts still carry the category — readers
  // must tolerate it. Revisit trigger: first ACTUAL wrong-template incident.

  // P10 (task #82): TEMPLATE_MISMATCH escape-hatch marker emitted by the agent
  // itself — OVERRIDES other categories (agent self-report is the highest-
  // confidence signal). Anchored to the very START of the response (no 'm'
  // flag; first 300 chars) to prevent false-positives when the agent quotes
  // the marker syntax mid-prose.
  const _templateMismatchPattern = /^\s*(?:```\s*)?\[TEMPLATE_MISMATCH\]/i;
  if (text && _templateMismatchPattern.test(text.slice(0, 300))) {
    executionDegradation = {
      errorCategory: 'TEMPLATE_MISMATCH_SELF_REPORTED',
      degradationReason: 'Agent invoked the Scope Self-Check escape hatch — task assignment is outside template scope per the agent itself',
      consecutiveTailFailures: 0,
      toolFailureRate: 0,
    };
    logger?.warn({
      executionId,
      taskId: task.id,
      templateName: input.templateName ?? undefined,
      agentRole: input.agentRole ?? undefined,
      responsePrefix: text.slice(0, 300),
    }, 'Agent self-reported template/task mismatch via escape hatch — execution stored but no useful work produced');
  }

  // TRUNCATED_NO_OUTPUT (truncation-stall R2, 2026-07-16): the final turn stopped at
  // `max_tokens` and produced NO deliverable text (raw pre-note text empty). This is the ONE
  // terminal condition the cascade previously had no signal for: finalizeTextForStopReason glues
  // a 56-char note onto the empty output, so the content-validation guard (empty AND zero tools)
  // and EMPTY_DELIVERABLE (empty text) both see non-empty and skip → a truncation was recorded as
  // an unqualified SUCCESS. Root cause: Sonnet-5 adaptive thinking exhausting max_tokens mid-turn.
  // Fires BEFORE EMPTY_DELIVERABLE (a truncation is a specific CAUSE of emptiness) and — unlike
  // EMPTY_DELIVERABLE — is INDEPENDENT of tool-count and task.type: it must catch a harness
  // SYNTHESIZE leg (task.type === 'PIPELINE', possibly 0 tools) that truncated its deliverable and
  // then never called task.complete, leaving the leg stalled IN_PROGRESS. A legitimate thin/empty
  // PIPELINE CREATE setup-and-exit is NOT caught because its stopReason is tool_use/end_turn, never
  // max_tokens. Additive (never flips SUCCESS/FAILED; Protocol-10 ship-the-fact); consumed by
  // keep-best (R3) so a truncated-empty retry can't supersede a real prior deliverable, and by the
  // harness SYNTHESIZE consumer so a stalled leg is not read as a satisfied source.
  if (!executionDegradation && stopReason === 'max_tokens' && rawDeliverableEmpty) {
    executionDegradation = {
      errorCategory: 'TRUNCATED_NO_OUTPUT',
      degradationReason: `Final turn stopped at max_tokens and produced no deliverable text (output-token ceiling exhausted, likely mid-thinking) — stored as SUCCESS but the deliverable is empty; downstream consumers must NOT treat this as a satisfied source, and it must not supersede a prior real deliverable`,
      consecutiveTailFailures: 0,
      toolFailureRate: 0,
    };
    logger?.warn({
      executionId,
      taskId: task.id,
      taskType: task.type ?? undefined,
      toolCallCount: toolCallResults.length,
      turnCount,
    }, 'Execution truncated at max_tokens with no deliverable text — TRUNCATED_NO_OUTPUT signal (stored SUCCESS)');
  }

  // EMPTY_DELIVERABLE (M3 companion, 2026-07-05, Phase-6 core-spine harness ruling):
  // empty deliverable text BUT successful tool activity. The content-validation guard
  // is engine-canonical (throw → FAILED only when empty text AND zero tool calls), so a
  // tool-driven / setup-and-exit run with an empty finalResponse persists as SUCCESS.
  // With no other category claimed, that would be a SILENT green (executionDegradation:
  // null) — a "hole labeled done" that a downstream SYNTHESIZE reads as a satisfied
  // source (the ready-dependents reactor fires on the SUCCESS basis). Additive signal
  // (never changes SUCCESS/FAILED; Protocol-10 ship-the-fact) surfaces it as a banner.
  // NON-PIPELINE ONLY: PIPELINE setup-and-exit runs legitimately emit thin/empty prose
  // (deliverable = created children + pipeline-index.json); P8 below owns their coverage.
  if (
    !executionDegradation &&
    (!text || text.trim().length === 0) &&
    toolCallResults.length > 0 &&
    task.type !== 'PIPELINE'
  ) {
    executionDegradation = {
      errorCategory: 'EMPTY_DELIVERABLE',
      degradationReason: `Agent completed ${toolCallResults.length} tool call(s) but produced no deliverable text — stored as SUCCESS with an empty deliverable; downstream consumers should not treat this as a satisfied source`,
      consecutiveTailFailures: 0,
      toolFailureRate: 0,
    };
    logger?.warn({
      executionId,
      taskId: task.id,
      toolCallCount: toolCallResults.length,
      turnCount,
    }, 'Execution produced no deliverable text despite tool activity — EMPTY_DELIVERABLE signal (stored SUCCESS)');
  }

  // P8 (task #91): Pipeline Harness protocol step validator — PIPELINE tasks
  // only. Co-occurs with other categories (protocolValidation facts always
  // populated); errorCategory fills in only when still unclaimed.
  let protocolValidation: ReturnType<typeof validatePipelineProtocolSteps> = null;
  if (task.type === 'PIPELINE') {
    // Cast: ToolCallRecord.arguments is honestly `unknown` (parsed object on
    // success, raw string on failure); the validator's ToolCallEntry types it
    // as an action-shaped object but handles arbitrary shapes defensively.
    protocolValidation = validatePipelineProtocolSteps(toolCallResults as unknown as Parameters<typeof validatePipelineProtocolSteps>[0], {
      type: task.type,
      metadata: task.metadata,
      createdAt: task.createdAt,
      resolvedMode: input.resolvedMode ?? null,
    });
    if (protocolValidation) {
      logger?.warn({
        executionId,
        taskId: task.id,
        mode: protocolValidation.mode,
        missingSteps: protocolValidation.missingSteps,
        toolCallSummary: protocolValidation.toolCallSummary,
        expectedChildCount: protocolValidation.expectedChildCount,
        actualAssignedCount: protocolValidation.actualAssignedCount,
      }, `Pipeline harness protocol gap: ${protocolValidation.mode} mode missing ${protocolValidation.missingSteps.length} required step(s)`);

      if (!executionDegradation) {
        executionDegradation = {
          errorCategory: 'PROTOCOL_STEP_SKIPPED',
          degradationReason: `Pipeline harness ${protocolValidation.mode} mode skipped ${protocolValidation.missingSteps.length} required step(s): ${protocolValidation.missingSteps[0]}${protocolValidation.missingSteps.length > 1 ? ` (+${protocolValidation.missingSteps.length - 1} more)` : ''}`,
          consecutiveTailFailures: 0,
          toolFailureRate: 0,
        };
      }
    }
  }

  // HARNESS_NO_OUTPUT (2026-07-17, 3-lens panel + pipeline-harness-specialist GO-WITH-CHANGES):
  // the RESIDUAL net for the silent-green PIPELINE stall (live specimen: a CREATE ran 3/3
  // successful calls incl. stage.create, stopped mid-protocol, empty finalResponse, normal
  // stop -> SUCCESS + degradation null + leg IN_PROGRESS forever + orphan stage).
  // Positioned AFTER the P8 fill deliberately: P8 (with widened mode inference) is the
  // PRIMARY detector and names the missing step (diagnosis outranks symptom); this fires
  // only when nothing else claimed — netting exactly what P8 declines to judge (e.g. the
  // zero-tool-call empty PIPELINE run, which P8 nulls on and EMPTY_DELIVERABLE excludes
  // by both its tool-count gate and its NON-PIPELINE scope).
  // Predicate facts, not verdicts: NO tool-count gate, NO stopReason gate (the R4 mesh),
  // judged on the PRE-note rawDeliverable (the glue covers max-TURNS too, not just
  // max_tokens — judging post-note text would blind this on exactly the R4 cases).
  // Empirical basis: empty finalResponse on PIPELINE occurred once in 125 runs = the
  // defect; the documented legitimate setup-and-exit case is THIN, never empty.
  // Additive: never flips SUCCESS/FAILED by itself (Layer 2 in terminal-persist owns
  // that, on a stricter in-tx conjunction).
  if (!executionDegradation && task.type === 'PIPELINE' && rawDeliverableEmpty) {
    executionDegradation = {
      errorCategory: 'HARNESS_NO_OUTPUT',
      degradationReason: 'PIPELINE harness produced no deliverable text (pre-note) — a healthy harness always says what it did; downstream consumers should not treat this run as a satisfied source',
      consecutiveTailFailures: 0,
      toolFailureRate: 0,
    };
    logger?.warn({
      executionId,
      taskId: task.id,
      toolCallCount: toolCallResults.length,
      turnCount,
      stopReason,
    }, 'PIPELINE harness produced no deliverable text — HARNESS_NO_OUTPUT signal (stored SUCCESS)');
  }

  // harnessCreateIncomplete FACT (dead-end CREATE shape — the orphan-mint signature):
  // resolvedMode CREATE + a successful stage.create + zero successful task.update means
  // the link write (CREATE Step 3) never happened; any re-run resolves CREATE again and
  // mints another orphan stage. Computed here (toolCalls in scope), consumed by
  // terminal-persist's Layer-2 conjunction alongside FRESH in-tx task-row facts.
  const callsAction = (entry: { arguments?: unknown; success?: boolean }, action: string): boolean =>
    entry.success === true &&
    typeof entry.arguments === 'object' && entry.arguments !== null &&
    (entry.arguments as { action?: unknown }).action === action;
  const harnessCreateIncomplete =
    task.type === 'PIPELINE' &&
    input.resolvedMode === 'CREATE' &&
    toolCallResults.some(tc => callsAction(tc as { arguments?: unknown; success?: boolean }, 'stage.create')) &&
    !toolCallResults.some(tc => callsAction(tc as { arguments?: unknown; success?: boolean }, 'task.update'));

  const harnessNoOutput = task.type === 'PIPELINE' && rawDeliverableEmpty;

  return { executionDegradation, protocolValidation, harnessNoOutput, harnessCreateIncomplete };
}
