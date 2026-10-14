/**
 * runExecutionCore — the shared happy-path execution spine (convergence Phase 6, 2026-07-05).
 *
 * The ONE implementation of the post-claim execution body that the engine
 * (`agentExecutionEngine.ts`) and the stream route (`app/api/pov/agent/execute/stream/route.ts`)
 * previously inline-mirrored (~350 lines each). Owns, in order (AE6-I1 live order — load-bearing):
 *
 *   timeout controller → runAgenticToolLoop → finalizeTextForStopReason → content-validation guard
 *   → computeFormCheckFact (config_change_author only; 2026-10-07)
 *   → runFormCorrection (Step B: flag on AND every hit an undercount; ONE tool-less pass)
 *   → runRequirementsFormStep (requirements_author only; 2b 2026-10-09: fact always, ONE correction turn behind
 *     REQUIREMENTS_FORM_CORRECTION_ENABLED + the R4-style time budget)
 *   → parseConfidenceScore/applyConfidenceCap → runDiagnosticRetry → tokensUsed
 *   → assessExecutionQuality → buildExecutionResultJson → computeSelfSupersession
 *   → persistTerminalSuccess → onExecutionCompleted
 *
 * SEAM (Steve-approved 2026-07-05, happy-path core):
 *  - The core owns the HAPPY PATH + SUCCESS persist. It THROWS on failure
 *    (content-validation, empty-content, a persist error) — it does NOT catch.
 *  - The adapter keeps: claim (C-4: core starts AFTER claim), prep (config / template guard /
 *    auth / prompt HEADS / mcpFunctions / normalizeModelConfig), and the failure `catch`
 *    (persistTerminalFailure + F-1 rethrow). The whole failure path stays adapter-side and
 *    byte-unchanged; `persistTerminalFailure` was already the shared owner (Phase 4b).
 *  - Adapter divergence is threaded as INPUT facts / a small observer bundle — NOT converged
 *    inside the core (six-axis prompt HEADS stay per-adapter; SSE emissions stay in the stream
 *    adapter as observer-hook implementations so the 30-site source order is preserved).
 *
 * C-4 invariant: this module contains ZERO `agentExecution.create`, ZERO status-claim writes,
 * and ZERO `loadExecutionContext` — the adapter does all of that BEFORE calling the core.
 * Pinned by scripts/test-execution-core-boundary.ts.
 *
 * Reactor/PRUNE are core PARAMETERS threaded through `persistTerminalSuccess` — BOTH paths
 * pass prune:true/fireReactors:true since Flip 1/Flip 2 landed (2026-07-06; engine :804-805/:871,
 * stream route.ts:698/:705/:959). The F9 deferral (2026-07-15) RELIES on fireReactors being true
 * on every path a harness SYNTHESIZE can take — a hardcoded false here would strand dependents.
 * The reactor-firing pin asserts the param is threaded, not hardcoded.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { childTasksDispatchedBy } from './harness-dispatch-fact';
import { llmService } from './llm/llm-service';
import { finalizeTextForStopReason } from './llm/finalize-response';
import { buildExecutionResultJson, deriveChainedContextSignal } from './execution-artifacts';
import { persistTerminalSuccess } from './execution-terminal-persist';
import { prepareHeldCapture, captureHeldFiles } from './held-bytes-capture';
import { computeSelfSupersession } from './execution-selection';
// The five facts are no longer imported one by one: they are ENTRIES in the shared registry, and
// the point of the registry is that this file cannot know one of them and forget another.
import { stampExecutionNets } from './execution-nets';
import { assessExecutionQuality } from '@/lib/agents/harness/execution-quality';
import { runDiagnosticRetry, BUDGET_SELF_FLAG_PATTERN } from '@/lib/agents/harness/diagnostic-retry';
import { computeFormCheckFact, isFormCheckEligible } from '@/lib/agents/harness/package-form-check';
import type { FormCheckFact } from '@/lib/agents/harness/package-form-check';
import { runFormCorrection, isFormCorrectionEnabled } from '@/lib/agents/harness/form-correction';
import type { FormCorrectionObservers } from '@/lib/agents/harness/form-correction';
import { isRequirementsFormCheckEligible } from '@/lib/agents/harness/requirements-form-check';
import {
  runRequirementsFormStep, recountRequirementsStamp, resolveRequirementsFormInputs, isRequirementsFormCorrectionEnabled,
} from '@/lib/agents/harness/requirements-form-correction';
import type { RequirementsFormCheckStamp, RequirementsFormCorrectionObservers, RequirementsFormInputs } from '@/lib/agents/harness/requirements-form-correction';
import { runAgenticToolLoop } from '@/lib/agents/harness/agentic-tool-loop';
import type { AccumulatedUsage, AgenticLoopObservers, AgenticLoopInput } from '@/lib/agents/harness/agentic-tool-loop';
import { parseConfidenceScore, applyConfidenceCap, CONFIDENCE_CAP_CEILING } from '@/lib/agents/harness/parse-confidence';
import { mcpLogger } from '@/lib/logger';
import { rescueOrRethrow, annotatePostLoopThrowOrRethrow } from './execution-completion-anchored';
import type { ResolvedHarnessContext } from './harnessModeResolver';

type CoreLogger = Pick<typeof mcpLogger, 'info' | 'warn' | 'error' | 'debug'>;

/**
 * Everything the happy-path spine reads, produced by the adapter's prep (post-claim). Adapter
 * divergence (R2–R11) is threaded here as facts/callbacks — every field is a place the two
 * adapters may legitimately differ WITHOUT the core forking behavior (arg to a shared helper).
 */
export interface ExecutionCoreInput {
  executionId: string;
  /** Row refs the spine reads (createdAt for chained-context timing; context for supersession). */
  execution: { id: string; createdAt?: Date | null; startTime?: Date | null; context?: unknown };
  task: {
    id: string; type?: string | null; metadata: Prisma.JsonValue | null;
    povId: string | null; title: string; createdAt?: Date; inputContext?: unknown;
  };
  /** Frozen execution.config — read only for the R8-family fallback fields the builder needs. */
  config: Record<string, unknown>;
  userId: string;
  /** Adapter-assembled user-message HEAD (per-adapter policy; NOT converged here). */
  prompt: string;
  /** normalizeModelConfig output (adapter builds it in prep; system prompt already baked in). */
  normalizedLlmConfig: AgenticLoopInput['cfg'];
  mcpFunctions: AgenticLoopInput['mcpFunctions'];
  /** I-9 resolved role ('AI Assistant' floor — never falsy; the dead 'custom' tail is dropped, R8b). */
  agentRole: string;
  resolvedTemplate: { id?: string; name?: string | null } | null;
  harnessContext: ResolvedHarnessContext | null;
  /** WS1 Phase C: the per-execution protocol-injection FACT (adapter-computed at prompt build). */
  protocolInjection?: import('./execution-system-prompt').ProtocolInjectionFact | null;
  maxToolTurns: number;
  executionTimeoutMs: number;
  /** The RUNNING-start timestamp (engine: local new Date() at claim; adapter-supplied, R3). */
  startTime: Date;
  /** Persisted success-log narrative — adapter policy (engine canned 5-line; R5/M11). */
  buildSuccessLogs: (facts: { tokensUsed: number; executionTime: number; turnCount: number; toolCallCount: number }) => string[];
  /** result.json N-6 path-specific extensions (stream-only; engine passes undefined). */
  extensions?: Record<string, unknown>;
  /** Transitional core params — engine true/true, stream false/false. Flip 1/2 are separate phases. */
  prune: boolean;
  fireReactors: boolean;
  logger: CoreLogger;
}

/** Adapter presentation hooks. All optional, all awaited. Loop/retry hooks are forwarded verbatim. */
export interface ExecutionCoreObservers {
  /** Forwarded to runAgenticToolLoop (engine: onInitialResponse/onTurnStart; stream: SSE chunks). */
  loop?: AgenticLoopObservers;
  /** Forwarded to runFormCorrection (Step B; stream wires 2 SSE emissions; engine passes none). */
  formCorrection?: FormCorrectionObservers;
  /** Forwarded to runRequirementsFormStep (2b; no adapter wires it yet — the engine and stream pass none). */
  requirementsFormCorrection?: RequirementsFormCorrectionObservers;
  /** Forwarded to runDiagnosticRetry (stream wires 2 SSE emissions; engine passes none). */
  diagnosticRetry?: Parameters<typeof runDiagnosticRetry>[2];
  /**
   * Reports the accumulated usage + serving model right after the loop, so the adapter's failure
   * `catch` can persist partial spend for a post-loop throw (engine capturedUsage/capturedModel).
   */
  onUsageCaptured?: (usage: AccumulatedUsage, servingModel: string | null) => void;
  /** stopReason produced an appended note (stream emits it as an SSE text_chunk; engine no-op). */
  onStopReasonFinalized?: (appendedNote: string | null, finalText: string) => Promise<void> | void;
  /** Before the terminal tx (engine: streamExecutionProgress 'storing_results' 90%; stream: log_update). */
  onStoringResults?: (details: { executionTime: number; contentLength: number }) => Promise<void> | void;
  /** After the SUCCESS commit (engine: progress 100% + logAgentExecution; stream: SSE tail). */
  onExecutionCompleted?: (facts: {
    executionTime: number; tokensUsed: number;
    createdArtifacts: Awaited<ReturnType<typeof persistTerminalSuccess>>['createdArtifacts'];
    endTime: Date;
  }) => Promise<void> | void;
}

/**
 * Run the shared happy-path spine. Assumes the row is already claimed/RUNNING (C-4). Resolves on
 * SUCCESS (after persist + onExecutionCompleted); THROWS on any failure for the adapter's catch.
 */
export async function runExecutionCore(input: ExecutionCoreInput, observers: ExecutionCoreObservers = {}): Promise<void> {
  const {
    executionId, execution, task, config, userId, prompt, normalizedLlmConfig, mcpFunctions,
    agentRole, resolvedTemplate, harnessContext, protocolInjection,
    maxToolTurns, executionTimeoutMs, startTime, buildSuccessLogs, extensions, prune, fireReactors, logger,
  } = input;

  // The abort TIMER is core-owned and spans the #89 correction turn too (converged to the stream
  // route's safer placement; the engine formerly cleared it in a finally before #89).
  const executionAbort = new AbortController();
  // 2b (2026-10-09): the loop's start — the requirements correction's throughput window (output tokens / wall clock).
  const loopStartedAt = Date.now();
  // The watchdog's OWN deadline, computed on the line beside the timer it describes (register E1,
  // 2026-09-25) so a refactor cannot split them. The loop's R4 retry sizes its raise against it.
  const deadlineAt = Date.now() + executionTimeoutMs;
  const executionTimeout = setTimeout(() => executionAbort.abort(), executionTimeoutMs);

  // Phase 3 extraction: the full agentic loop (initial LLM call, P2 provider-error check, tool
  // turns, message threading, token accumulation, #89 anti-fabrication correction) runs in the
  // shared module. Adapter-side effects (EventEmitter progress / SSE) wire in via AWAITED observers.
  const { mcpServerManager } = await import('./mcp/serverManager');
  let loopResult!: Awaited<ReturnType<typeof runAgenticToolLoop>>;
  try {
    loopResult = await runAgenticToolLoop({
      prompt,
      cfg: normalizedLlmConfig,
      mcpFunctions,
      maxToolTurns,
      signal: executionAbort.signal,
      deadlineAt,
      // Selects the read_more pager's per-role read budget (role-read-budget.ts, R1) — ONE call site, both adapters.
      agentRole,
      executionId,
      taskId: task.id,
      userId,
    }, {
      getToolDefinition: (name: string) => mcpServerManager.getToolDefinition(name),
      executeToolOnServer: (s: string, t: string, a: unknown, o: { sessionId: string; userId: string; timeout: number }) =>
        mcpServerManager.executeToolOnServer(s, t, a as Record<string, any>, o),
      generateText: (p: string, o: any, u?: string) => llmService.generateText(p, o, u),
      logger,
    }, observers.loop ?? {});
  } catch (loopErr) {
    clearTimeout(executionTimeout);
    // COMPLETE-THEN-FAIL (2026-10-05, DESIGN-v2 §3): a loop throw AFTER this execution completed its own PIPELINE
    // SYNTHESIZE task is rescued from DB state (persistCompletionAnchored → SUCCESS + the postCompletionFailure fact);
    // the text cascade below is NOT run. Every other throw is rethrown as the ORIGINAL object by rescueOrRethrow —
    // the adapter's failure catch sees exactly what it saw before (with an attached outcome when the run was eligible).
    const rescued = await rescueOrRethrow(loopErr, {
      executionId, execution, task, config, agentRole, harnessContext, protocolInjection, maxToolTurns,
      mcpFunctions, modelFallback: normalizedLlmConfig.model || null, startTime,
      extensions, logger, userId, buildSuccessLogs, prune, fireReactors,
    }, { db: prisma });
    await observers.onExecutionCompleted?.({
      executionTime: rescued.executionTime,
      tokensUsed: rescued.tokensUsed,
      createdArtifacts: rescued.createdArtifacts,
      endTime: rescued.endTime,
    });
    return;
  } finally {
    clearTimeout(executionTimeout);
  }

  // COMPLETE-THEN-FAIL build review BC-M1/EF-F1: a throw AFTER the loop ended normally (the post-loop cascade or the
  // normal success persist) is not rescuable, but on a run that completed its own PIPELINE SYNTHESIZE task it gets a
  // named outcome ('post-loop-throw') so MI-13's RED T1a stays 0 by construction. The ORIGINAL error is always rethrown.
  try {
    const { toolCallResults, messageHistory, totalUsage, turnCount, correctionTurnUsed, budgetFailFastUsed, truncationRetryUsed, truncationRetryRecovered, truncationRetrySkippedReason, truncationRetryMaxTokens, truncationRetryStopReason, truncationRetryDiscardedChars } = loopResult;
    let currentResponse = loopResult.currentResponse;
    // Phase 2 (C-1): the loop owns the deliverable-text source. `assembledText` === last-turn
    // `currentResponse.text` (post-#89) — both paths consume the SAME source.
    let finalResponse = loopResult.assembledText;
    // Report usage/model to the adapter's failure catch (partial-spend-on-failure; ref = serving model).
    const servingModel = currentResponse?.metadata?.model || normalizedLlmConfig.model || null;
    observers.onUsageCaptured?.(totalUsage, servingModel);

    // Handle stop reasons — finalResponse via finalizeTextForStopReason, shared so the two paths
    // can't diverge on these terminal messages (engine↔stream parity).
    const hitMaxTurns = currentResponse.stopReason === 'tool_use' && turnCount >= maxToolTurns;
    if (hitMaxTurns) {
      logger.warn({ executionId, turnCount }, 'Tool loop hit MAX_TOOL_TURNS limit');
    } else if (currentResponse.stopReason === 'max_tokens') {
      logger.warn({ executionId }, 'LLM response truncated (max_tokens)');
    } else if (currentResponse.stopReason === 'refusal') {
      logger.error({ executionId }, 'LLM refused the request');
    }
    const finalized = finalizeTextForStopReason(currentResponse.stopReason, loopResult.assembledText, { hitMaxTurns });
    finalResponse = finalized.finalText;
    if (finalized.appendedNote) {
      await observers.onStopReasonFinalized?.(finalized.appendedNote, finalResponse);
    }

    // The LOOP's end. Only the onStoringResults observer reads it (its SSE value is unchanged); the persisted
    // endTime / executionTime are re-taken AFTER the post-loop cascade below (G5, 2026-10-10).
    const loopExecutionTime = Date.now() - startTime.getTime();

    // CONTENT VALIDATION (engine-canonical, M3): throw → FAILED only when empty text AND zero tool
    // calls. A tool-driven / setup-and-exit run with empty text proceeds to SUCCESS and is surfaced
    // by the additive EMPTY_DELIVERABLE signal in assessExecutionQuality below (never changes status).
    if ((!finalResponse || finalResponse.trim().length === 0) && toolCallResults.length === 0) {
      const apiError = (currentResponse as any)?.error;
      const diag = {
        executionId,
        taskId: task.id,
        taskType: task.type,
        agentTemplateId: resolvedTemplate?.id,
        agentTemplateName: resolvedTemplate?.name,
        agentRole,
        turnCount,
        finalStopReason: currentResponse?.stopReason,
        finalTextLength: (currentResponse?.text || '').length,
        finalContentBlockCount: Array.isArray((currentResponse as any)?.content)
          ? (currentResponse as any).content.length
          : null,
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
        maxToolTurns,
        hitMaxTurns: turnCount >= maxToolTurns,
        apiErrorMessage: apiError?.message || null,
        apiErrorCode: apiError?.code || null,
      };
      logger.error(diag, 'Agent execution produced no content — LLM returned empty response with no tool calls');
      const apiErrSuffix = apiError?.message ? `, providerError="${apiError.message}"` : '';
      throw new Error(
        `Agent execution produced no content: LLM returned empty response with no tool calls ` +
        `(stopReason=${diag.finalStopReason}, turns=${diag.turnCount}, outputTokens=${diag.outputTokens}, template=${diag.agentTemplateName || 'unknown'}${apiErrSuffix}). ` +
        `Common cause: template scope doesn't match task OR LLM provider auth/model issue — check pino logs for apiErrorMessage.`
      );
    }

    // PACKAGE FORM CHECK (2026-10-07, mechanical-reflection-trigger Step A — plan §3/§7). THIS block is the FACT:
    // pure, synchronous, no LLM call, no text change. `config_change_author` by EXACT role, non-PIPELINE; every other
    // role computes nothing and its result.json is byte-identical. Placed here — after the content guard, before
    // #90 — because this is where the single correction pass runs (precedence #89 > form > #90), so the stamped
    // `correction` decision is the one taken at the point the pass is taken. With the flag OFF (default) a trigger
    // hit records 'flag-off' and the Step B block below does nothing: byte-identical to Step A.
    let formCheck: FormCheckFact | null = null;
    const formCorrectionEnabled = isFormCorrectionEnabled();
    if (isFormCheckEligible(agentRole, task.type)) {
      formCheck = computeFormCheckFact({
        text: finalResponse,
        stopReason: loopResult.finalStopReason,
        textSource: 'loop',
        correctionTurnUsed,
        budgetFlagged: !!budgetFailFastUsed || (!!finalResponse && BUDGET_SELF_FLAG_PATTERN.test(finalResponse.slice(0, 1500))),
        correctionEnabled: formCorrectionEnabled,
        // Fail-OPEN and LOGGED (review F4/L7): a detector exception stamps the named checker-error arm and never fails
        // the execution; the message goes to the journal so it is visible before MI-13 runs.
        onCheckerError: (message) => logger.warn({ executionId, taskId: task.id, err: message },
          'package form check: checker-error — fact stamped checked:false, execution unaffected'),
      });
    }

    // FORM CORRECTION (Step B, 2026-10-07; Steve-approved scope). Runs ONLY when the fact above decided `attempted`:
    // flag on, no #89 pass, no budget flag, and EVERY hit an UNDERCOUNT (review B-M1: any marker — even inside the
    // undercount's own extra lines — short hunk or mixed package stays fact-only). ONE tool-less reflection-mode turn; the corrected text replaces the deliverable
    // ONLY when the provenance-checked adoption guard passes — otherwise the original stands, by reference. The
    // turn's tokens are folded into totalUsage either way (they were spent). An ATTEMPT spends the run's one
    // reflection pass, so #90 below is disqualified (`formCorrectionAttempted`). Non-fatal: an LLM throw or provider
    // error keeps the original. The re-check: when adopted, the form check is re-run on the corrected text and that
    // re-check IS the persisted fact (`textSource: 'form-correction'`); `correction` keeps the decision-point hits.
    // One insertion serves BOTH adapters (engine + stream both call runExecutionCore) and every PROCESS that runs them:
    // paichart-web (poller, GUI stream) AND paichart-mcp (agent.execute runs executeById in-process) — review B-H1.
    let formCorrectionAttempted = false;
    // Errored reflection calls (AUDIT 2026-10-07): the loop's (#89, budget fail-fast) + form correction + #90 below.
    // Stamped as toolLoop.reflectionErrors ONLY when non-empty — every clean execution's result.json is byte-unchanged.
    const reflectionErrors = [...(loopResult.reflectionErrors ?? [])];
    if (formCheck && formCheck.correction.attempted) {
      const decision = formCheck;
      const _fc = await runFormCorrection({
        text: finalResponse, currentResponse, messageHistory, totalUsage,
        prompt, normalizedLlmConfig, mcpFunctions, executionId, userId, undercountOnly: true,
      }, { generateText: (p, o, u) => llmService.generateText(p, o, u), logger }, observers.formCorrection);
      // INFO-3 (Step B review): the pass is spent only if the turn ACTUALLY attempted (a scope refusal inside the turn —
      // unreachable while the decision and the turn share allHitsAreUndercounts — must not disqualify #90).
      formCorrectionAttempted = _fc.correction.attempted === true;
      if (_fc.reflectionError) reflectionErrors.push(_fc.reflectionError);
      const correction = {
        ..._fc.correction,
        decisionTriggerHitsTotal: decision.triggerHitsTotal ?? 0,
        decisionHitsTotal: decision.hitsTotal ?? 0,
        decisionHits: decision.hits,
      };
      if (_fc.correction.adopted) {
        finalResponse = _fc.text;
        currentResponse = _fc.currentResponse;
        const recheck = computeFormCheckFact({
          text: finalResponse, stopReason: currentResponse?.stopReason, textSource: 'form-correction',
          onCheckerError: (message) => logger.warn({ executionId, taskId: task.id, err: message },
            'package form check: checker-error on the form-correction re-check — fact stamped checked:false, execution unaffected'),
        });
        if (recheck.checked && (recheck.triggerHitsTotal ?? 0) > 0) {
          // 0 by construction (the guard requires zero trigger hits). A non-zero here is kill criterion 3.
          logger.error({ executionId, taskId: task.id, triggerHitsTotal: recheck.triggerHitsTotal },
            'form correction: adopted text re-check carries trigger hits — kill criterion 3');
        }
        formCheck = { ...recheck, correction };
      } else {
        formCheck = { ...decision, correction };
      }
      // The attempt's attempted/adopted/reason were already logged by the turn; this line carries the tokens.
      logger.info({ executionId, taskId: task.id, adopted: correction.adopted === true,
        notAdoptedReason: correction.notAdoptedReason ?? null, decisionTriggerHitsTotal: correction.decisionTriggerHitsTotal,
        inputTokens: correction.inputTokens ?? null, outputTokens: correction.outputTokens ?? null,
        cacheReadTokens: correction.cacheReadTokens ?? null, cacheCreationTokens: correction.cacheCreationTokens ?? null,
        editsTotal: correction.editsTotal ?? null, durationMs: correction.durationMs ?? null },
        'form correction: outcome stamped on toolLoop.formCheck');
    }

    // REQUIREMENTS FORM CHECK + CORRECTION (2b, 2026-10-09 — requirements-author retrospective, Steve "2b first").
    // `requirements_author` by EXACT role, non-PIPELINE; every other role reads nothing and its result.json is
    // byte-identical. The fact is stamped on EVERY eligible execution (shadow mode: with the flag OFF there is no
    // behaviour change). Inputs: the owning harness's description (the objective) + its metadata.requirementsRowItemMap
    // — ONE read, eligible role only, never fatal (a failure is a named `inputs.objectiveUnresolvedReason`). The turn
    // runs only when the step's decision says `attempted` (failing trigger check, no #89, no budget flag, the flag ON,
    // the objective resolved, and the time budget fits). An attempt spends the run's one reflection pass: #90 below is
    // disqualified exactly as for the terraform form correction. The engine's own text changes ONLY on adoption.
    let requirementsFormCheck: RequirementsFormCheckStamp | null = null;
    let requirementsInputs: RequirementsFormInputs | null = null;
    let requirementsPreCorrectionDraft: string | null = null;
    let requirementsCorrectionNotAdoptedText: string | null = null;
    if (isRequirementsFormCheckEligible(agentRole, task.type)) {
      requirementsInputs = await resolveRequirementsFormInputs(prisma, task.id);
      const _rq = await runRequirementsFormStep({
        text: finalResponse, stopReason: loopResult.finalStopReason, inputs: requirementsInputs,
        correctionTurnUsed,
        budgetFlagged: !!budgetFailFastUsed || (!!finalResponse && BUDGET_SELF_FLAG_PATTERN.test(finalResponse.slice(0, 1500))),
        enabled: isRequirementsFormCorrectionEnabled(),
        deadlineAt, loopStartedAt, currentResponse, messageHistory, totalUsage,
        prompt, normalizedLlmConfig, mcpFunctions, executionId, userId,
      }, { generateText: (p, o, u) => llmService.generateText(p, o, u), logger }, observers.requirementsFormCorrection);
      requirementsFormCheck = _rq.stamp;
      if (_rq.attempted && typeof _rq.preCorrectionText === 'string') requirementsPreCorrectionDraft = _rq.preCorrectionText;
      if (_rq.attempted && typeof _rq.notAdoptedText === 'string') requirementsCorrectionNotAdoptedText = _rq.notAdoptedText;
      if (_rq.stamp.correction.adopted === true) {
        finalResponse = _rq.text;
        currentResponse = _rq.currentResponse;
      }
      if (_rq.reflectionError) reflectionErrors.push(_rq.reflectionError);
      // The one reflection pass is spent (#89 > form > #90): the same disqualifier the terraform correction sets, taken
      // from the turn's OWN outcome (INFO-3), never set before the call.
      formCorrectionAttempted = formCorrectionAttempted || _rq.attempted;
      const c = requirementsFormCheck.correction;
      logger.info({ executionId, taskId: task.id, checked: requirementsFormCheck.checked, attempted: c.attempted,
        notAttemptedReason: c.notAttemptedReason ?? null, failingChecks: c.failingChecks ?? null,
        adopted: c.adopted ?? null, notAdoptedReason: c.notAdoptedReason ?? null,
        objective: requirementsFormCheck.inputs.objective, ownerRowItemMap: requirementsFormCheck.inputs.ownerRowItemMap,
        inputTokens: c.inputTokens ?? null, outputTokens: c.outputTokens ?? null, durationMs: c.durationMs ?? null },
        'requirements form check: stamped on toolLoop.requirementsFormCheck');
    }

    await observers.onStoringResults?.({ executionTime: loopExecutionTime, contentLength: finalResponse?.length || 0 });

    // Build quality metrics for harness consumption
    const successfulToolCalls = toolCallResults.filter(t => t.success).length;
    const failedToolCalls = toolCallResults.filter(t => !t.success).length;

    // Parse confidence score (last-match-wins) — shared single source of truth (A, 2026-06-09).
    let confidenceScore: number | null = parseConfidenceScore(finalResponse);

    // Objective guard: cap confidence to 60 when tool failure rate exceeds 50% (shared applyConfidenceCap).
    const _cap = applyConfidenceCap(confidenceScore, toolCallResults.length, failedToolCalls);
    const originalConfidence = _cap.original;
    const confidenceCapped = _cap.capped;
    if (_cap.capped) {
      logger.warn({
        msg: 'Confidence capped: tool failure rate exceeds 50%',
        executionId,
        original: _cap.original,
        capped: CONFIDENCE_CAP_CEILING,
        toolFailRate: Math.round((failedToolCalls / toolCallResults.length) * 100),
        toolCalls: { total: toolCallResults.length, succeeded: successfulToolCalls, failed: failedToolCalls },
      });
    }
    confidenceScore = _cap.score;

    // Diagnostic retry for the 50-69 confidence band (#90) — shared runDiagnosticRetry owns the
    // bounded single reflection pass. Stream wires 2 SSE emissions as observers; engine passes none.
    const _retry = await runDiagnosticRetry({
      confidenceScore, confidenceCapped, correctionTurnUsed, formCorrectionAttempted,
      text: finalResponse, currentResponse, messageHistory, totalUsage,
      prompt, normalizedLlmConfig, mcpFunctions, executionId, userId,
    }, { generateText: (p, o, u) => llmService.generateText(p, o, u), logger }, observers.diagnosticRetry);
    const diagnosticRetryUsed = _retry.diagnosticRetryUsed;
    if (_retry.reflectionError) reflectionErrors.push(_retry.reflectionError);
    finalResponse = _retry.text;
    currentResponse = _retry.currentResponse;
    confidenceScore = _retry.confidenceScore;

    // #90 replaced the deliverable ⇒ re-count the text that will actually be PERSISTED, so the fact describes
    // the package the reviewer and the operator receive. The correction decision stays the one taken above.
    if (formCheck && diagnosticRetryUsed) {
      formCheck = {
        ...computeFormCheckFact({
          text: finalResponse, stopReason: currentResponse?.stopReason, textSource: 'diagnostic-retry',
          onCheckerError: (message) => logger.warn({ executionId, taskId: task.id, err: message },
            'package form check: checker-error on the #90 recount — fact stamped checked:false, execution unaffected'),
        }),
        correction: formCheck.correction,
      };
    }
    if (requirementsFormCheck && requirementsInputs && diagnosticRetryUsed) {
      requirementsFormCheck = recountRequirementsStamp(requirementsFormCheck, {
        text: finalResponse, stopReason: currentResponse?.stopReason, inputs: requirementsInputs,
        onCheckerError: (message) => logger.warn({ executionId, taskId: task.id, err: message },
          'requirements form check: checker-error on the #90 recount — fact stamped checked:false, execution unaffected'),
      });
    }

    // G5 (2026-10-10, agent-execution review F1): the persisted endTime / executionTime are taken HERE, after the
    // post-loop cascade (form correction, requirements correction, #90), so a run's recorded duration includes the
    // turns it spent. Taken before 2026-10-10 at loop end, which hid a 2–4 minute re-emission. SERIES CUT (CLAUDE.md).
    const endTime = new Date();
    const executionTime = endTime.getTime() - startTime.getTime();

    // PLATFORM-HELD-BYTES Stage A (2026-10-14): the PURE capture half — right after the duration is taken (so
    // executionTime does not move) and BEFORE anything reads toolCallResults (assessExecutionQuality,
    // buildExecutionResultJson, the nets), so no later mutation of a shared record can change what is held. Shadow only;
    // a no-op unless HELD_BYTES_CAPTURE_ENABLED === 'true'. Never throws. (OA-8 as amended; panel AE S3 / D5.)
    const heldPlan = prepareHeldCapture({ toolCallResults, task: { id: task.id, povId: task.povId }, logger });

    // Token usage — 0.5b: computed AFTER the #90 retry fold so result.json / logs / persist agree.
    // Raw-sum semantic: 0 is a legitimate fact.
    const tokensUsed = totalUsage.inputTokens + totalUsage.outputTokens;

    const executionLogs = buildSuccessLogs({ tokensUsed, executionTime, turnCount, toolCallCount: toolCallResults.length });

    // RWF A4 (2026-09-26): for a SYNTHESIZE harness run, the children THIS run dispatched — read from the
    // server-written execution rows (refusal-proof, stage-filtered), so the protocol validator grades the
    // re-execute exit on the same fact the persist decision uses. The child-stage link is written by an
    // EARLIER CREATE, so it is genuinely present in this pre-run task snapshot. Failure ⇒ undefined ⇒ the
    // validator's tool-call fallback; never fatal.
    let dispatchedChildIds: string[] | undefined;
    const childStageForDispatch = (task.metadata as Record<string, unknown> | null)?.pipelineStageId;
    if (task.type === 'PIPELINE' && harnessContext?.mode === 'SYNTHESIZE' && typeof childStageForDispatch === 'string') {
      try {
        dispatchedChildIds = await childTasksDispatchedBy(prisma, { executionId, childStageId: childStageForDispatch });
      } catch (dispatchErr) {
        logger.warn({ executionId, err: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr) },
          'dispatch-fact read failed — protocol validator falls back to the tool-call log');
      }
    }

    // Post-loop quality cascade (P5/P4/P3/P7/P10/EMPTY_DELIVERABLE/P8/HARNESS_NO_OUTPUT) — shared
    // assessExecutionQuality. Signals are ADDITIVE — they never change SUCCESS/FAILED status.
    const { executionDegradation, protocolValidation, harnessNoOutput, harnessCreateIncomplete } = assessExecutionQuality({
      toolCallResults,
      failedToolCalls,
      text: finalResponse,
      // Raw pre-note text so TRUNCATED_NO_OUTPUT (R2) isn't masked by the finalize note.
      // `loopResult.assembledText` is the deliverable BEFORE finalizeTextForStopReason.
      rawDeliverableText: loopResult.assembledText,
      // P7 judges the post-#90 text, so it keeps the post-#90 stop reason.
      stopReason: currentResponse?.stopReason,
      // F2 §3.3 (2026-09-25): the truncation categories pair the raw deliverable with ITS OWN stop
      // reason. `currentResponse` above has been REPLACED by #90's reflection when #90 produced text,
      // so its stop reason is the reflection's (`end_turn`) — the former comment here ("no diagnostic
      // retry fires on the truncation path") held only for the EMPTY case; a PARTIAL deliverable can
      // carry a parseable 50–69 score and trip #90 (reviewer incident cmuerrjuz…, 2026-09-24).
      loopExitStopReason: loopResult.finalStopReason,
      task: { id: task.id, type: task.type, metadata: task.metadata, createdAt: task.createdAt },
      // HARNESS_NO_OUTPUT (2026-07-17): resolver-stamped mode — P8's UNKNOWN-only rescue
      // + the harnessCreateIncomplete (dead-end CREATE) fact.
      resolvedMode: harnessContext?.mode ?? null,
      ...(dispatchedChildIds ? { dispatchedChildIds } : {}),
      executionId,
      turnCount,
      templateName: resolvedTemplate?.name,
      agentRole,
      logger,
    });

    // result.json — machine-readable, complete metadata. Built via the shared helper for parity.
    const resultJson = buildExecutionResultJson({
      taskId: task.id,
      taskTitle: task.title,
      agentRole,
      modelUsed: currentResponse?.metadata?.model || normalizedLlmConfig.model || 'default',
      finalResponse: finalResponse || '',
      confidenceScore,
      confidenceCapped,
      originalConfidence,
      executionDegradation,
      protocolValidation,
      harnessContext,
      protocolInjection,
      turnCount,
      maxToolTurns,
      toolCallResults,
      successfulToolCalls,
      failedToolCalls,
      executionTime,
      tokensUsed,
      mcpFunctions,
      correctionTurnUsed,
      budgetFailFastUsed,
      diagnosticRetryUsed,
      truncationRetryUsed,
      truncationRetryRecovered,
      truncationRetrySkippedReason,
      truncationRetryMaxTokens,
      truncationRetryStopReason,
      truncationRetryDiscardedChars,
      // F2: the LOOP-EXIT stop reason (never the post-#90 currentResponse's — §3.3).
      finalStopReason: loopResult.finalStopReason,
      ...(formCheck ? { formCheck } : {}),
      ...(requirementsFormCheck ? { requirementsFormCheck } : {}),
      ...(reflectionErrors.length ? { reflectionErrors } : {}),
      ...(extensions ? { extensions } : {}),
      chainedContext: deriveChainedContextSignal(task.inputContext),
      logger,
      executionId,
    });

    // R4 Layer 2 (truncation-stall): derive the terminalization gate HERE, where both facts are in
    // hand — the R2 degradation category AND the resolved mode (emitted into resultJson). A SYNTHESIZE
    // that produced no deliverable at max_tokens must be marked FAILED in the persist tx (never left
    // IN_PROGRESS/SUCCESS = the "settled-children, harness-mute" hang). Passing a derived boolean keeps
    // the tx free of resultJson shape-assumptions (event-system review shape #1). Non-SYNTHESIZE modes
    // are excluded: an ORCHESTRATE truncation is harmless (children still running retrigger normally),
    // and a CREATE truncation either throws at the content guard or self-heals — marking either FAILED
    // would kill a healthy pipeline.
    const truncationStalled =
      executionDegradation?.errorCategory === 'TRUNCATED_NO_OUTPUT' &&
      (resultJson as { resolvedMode?: unknown }).resolvedMode === 'SYNTHESIZE';

    // SYNTHESIZE dead-end (2026-09-14). The SECOND provable "nothing is in flight" shape, and the
    // reason HARNESS_NO_OUTPUT Layer 2 did not fire on prod execution cmu0yl664006kyx0e3olnguqe.
    // That branch proves dead-end-ness from an ABSENT `metadata.pipelineStageId` — correct for a
    // CREATE (no child stage ⇒ nothing will ever cascade back), but FALSE for a SYNTHESIZE: the link
    // is present and yet nothing is in flight, because SYNTHESIZE resolves only once every child is
    // already terminal, so every cascade has already fired and no future event can retrigger it.
    // Same caller-side derivation as truncationStalled above (keeps the tx free of resultJson shape
    // assumptions). Mode-gated for the same reason: an empty ORCHESTRATE is harmless (children still
    // running will retrigger) and an empty CREATE is the case the ABSENT-link conjunct already covers.
    const synthesizeDeadEnd =
      (harnessNoOutput || harnessCreateIncomplete) &&
      (resultJson as { resolvedMode?: unknown }).resolvedMode === 'SYNTHESIZE';

    // Derivation-containment fact (2026-07-17, pipeline-harness-specialist GO-WITH-CHANGES@85):
    // MECHANICAL check that a harness's derived values (e.g. a covering CIDR) don't swallow any
    // HARVESTED allocation beyond their declared members. Anchored to the HARVEST child's own
    // `## Harvested Allocations` block — never the package's copy (the run-4 fabrication surface).
    // PRE-tx by ruling: the child artifacts committed before the SYNTHESIZE reactor fired, so a
    // READ COMMITTED read here sees them; keeping it out of runTerminalSuccessTx leaves the
    // fixture-pinned F17/F20/truncation/HNO ordering untouched and a throw can never roll back the
    // SUCCESS commit. NON-THROW: any miss/parse failure ⇒ checked:false + reason — the reviewer
    // (LLM) tier blocks on missing evidence; this mechanical tier only reports the fact.
    // ── MECHANICAL NETS, stamped through the SHARED REGISTRY (stage 2b, 2026-09-12) ─────────────
    //
    // This was six hand-written blocks. They are now six entries in `MECHANICAL_NETS`, and the
    // difference is the guarantee: a hand-wired site can be FORGOTTEN, and a net that was never
    // called stamps nothing — indistinguishable, in the artifact, from a net that ran and found
    // nothing. A REGISTERED net can be inert only by returning an inert fact.
    //
    // Everything load-bearing about the old blocks is preserved and now uniform:
    //   • PRE-tx. The child artifacts committed before the SYNTHESIZE reactor fired, so a READ
    //     COMMITTED read here sees them, and keeping this out of runTerminalSuccessTx leaves the
    //     fixture-pinned F17/F20/truncation/HNO ordering untouched — a throw can never roll back the
    //     SUCCESS commit.
    //   • NON-THROWING, per net. The loop's catch stamps that net's `errorFact()`, so the one arm
    //     meaning "things went wrong" still carries a named blocking disposition rather than
    //     rendering clean (G3). One net throwing can no longer cost another net its stamp.
    //   • FACTS, NEVER VERDICTS. The reviewer tier blocks on missing evidence; this tier reports.
    //
    // TIER: resolved ONCE here (the stamp-first predicate the completion core uses) and handed to
    // ctx, but every net's tier ARM now lives inside its own enrichment — which is the half a replay
    // runner can exercise. Three of them decided it in a call-site ternary until today, so the only
    // way to see what a program parent stamped was a live program run.
    // EF-F2 (COMPLETE-THEN-FAIL build review): the ctx construction + BOTH invocation points live in ONE shared helper,
    // which the completion-anchored rescue calls too — so the two paths cannot fork their net inputs.
    await stampExecutionNets(prisma, {
      task: { id: task.id, type: task.type, metadata: task.metadata, inputContext: task.inputContext },
      agentRole: agentRole ?? null,
      harnessMode: harnessContext?.mode ?? null,
      finalResponse,
      executionId,
      logger,
    }, resultJson as Record<string, unknown>);

    // ── Per-net operator telemetry. Deliberately OUTSIDE the registry: these lines are specific
    // claims about specific facts, and a uniform "log the fact" would either say nothing useful or
    // say it about nets it does not understand. Read from the stamp, so they cannot drift from it.
    {
      const dc = (resultJson as Record<string, unknown>).derivationContainment as
        { violations?: unknown[]; containmentDisposition?: { disposition?: string; reason?: string } } | undefined;
      if (Array.isArray(dc?.violations) && dc.violations.length > 0) {
        logger.warn({ executionId, taskId: task.id, derivationContainment: dc },
          'Derivation-containment violations: a derived value covers harvested allocation(s) outside its declared members');
      }
      // DISCHARGE TELEMETRY (2026-08-27, panel condition 6). `no-author-child` ESCALATES to Node C
      // instead of blocking, trading a mechanical decision for a reviewer judgement. That trade is
      // only defensible while we can see how often it is exercised — so emit a countable line per
      // escalation. This is the outcome data by which a DECLARED `legKind` could later be EARNED
      // (Protocol 10: ship the fact, earn the verdict); the panel rejected it as unearned NOW, not
      // wrong forever. A climb here without new program types is the signal to revisit.
      if (dc?.containmentDisposition?.reason === 'no-author-child-leg-kind-undecidable') {
        logger.info({ executionId, taskId: task.id, containmentDisposition: dc.containmentDisposition },
          'Containment escalated to Node C: leg kind undecidable (no author child) — discharge required');
      }

      const lint = (resultJson as Record<string, unknown>).dialectLint as
        { violations?: unknown[]; transcription?: { missing?: unknown[] } } | undefined;
      if (Array.isArray(lint?.violations) && lint.violations.length > 0) {
        logger.warn({ executionId, taskId: task.id, dialectLint: lint },
          'Dialect-lint violations: banned platform token(s) present in candidate-config blocks');
      }
      if (Array.isArray(lint?.transcription?.missing) && lint.transcription.missing.length > 0) {
        logger.warn({ executionId, taskId: task.id, missing: lint.transcription.missing },
          'Dialect-lint: required canonical-stanza line(s) ABSENT from the package (the R7 omission shape)');
      }

      const propagation = (resultJson as Record<string, unknown>).contractPropagation as
        { children?: Array<Record<string, unknown>> } | undefined;
      const starved = (propagation?.children ?? []).filter((k) => k.executed && !k.hasInterfaceContract);
      if (starved.length > 0) {
        logger.warn({ executionId, taskId: task.id,
          starved: starved.map((k) => ({ taskId: k.taskId, role: k.role,
            linesAbsentFromBrief: (k.canonicalLinesAbsentFromBrief as string[])?.length ?? 0 })) },
          'Contract propagation: executed child ran WITHOUT the structured interface contract — ' +
          'its conditional transcribe/verify obligations were unsatisfiable');
      }
    }


    // Keep-best self-supersession — computed PRE-tx (READ COMMITTED; target terminal + immutable).
    // Fires ONLY for stamped orchestrator retries. Non-fatal: failure = latest-wins.
    let selfSupersession: Awaited<ReturnType<typeof computeSelfSupersession>> = null;
    try {
      selfSupersession = await computeSelfSupersession(prisma, (execution as any).context, resultJson,
        { executionId, config: input.config });
      if (selfSupersession) (resultJson as any).supersession = selfSupersession.audit;
    } catch (ksErr) {
      logger.warn({ executionId, err: ksErr instanceof Error ? ksErr.message : String(ksErr) },
        'keep-best comparison failed — proceeding latest-wins');
      // RWF C.3: a stamped retry whose comparison THREW is named, so absence of `supersession` never reads as
      // "compared and kept". `supersededById` presence (not key presence) is what means "lost".
      if ((execution as any).context?.reExecutionOfExecutionId) {
        (resultJson as any).supersession = { checked: false, reason: 'keep-best-error' };
      }
    }

    // PLATFORM-HELD-BYTES Stage A: the I/O capture half (leg SELECT + autocommit blob upsert + validation), as late as
    // possible so the window before the terminal transaction is short. It never receives toolCallResults or resultJson
    // — only the primitives-only plan. Never throws.
    const heldCaptures = await captureHeldFiles(prisma, { executionId, taskId: task.id, plan: heldPlan, logger });

    // Terminal SUCCESS persist — the ONE shared implementation (Phase 4b): atomic tx (artifacts +
    // execution + task) plus the core-owned post-commit tail (reactors, auto-comment). prune/fireReactors
    // are THREADED transitional params (engine true/true, stream false/false) — not flipped here.
    const persistResult = await persistTerminalSuccess(prisma, {
      executionId,
      task: { id: task.id, type: task.type, metadata: task.metadata, povId: task.povId, title: task.title },
      finalText: finalResponse,
      resultJson,
      ...(requirementsPreCorrectionDraft ? { preCorrectionDraft: requirementsPreCorrectionDraft } : {}),
      ...(requirementsCorrectionNotAdoptedText ? { correctionNotAdoptedText: requirementsCorrectionNotAdoptedText } : {}),
      ...(heldCaptures && (heldCaptures.refs.length || heldCaptures.refusals.length) ? { heldCaptures } : {}),
      logs: executionLogs,
      endTime,
      executionCreatedAt: execution.createdAt ?? null,
      executionStartTime: startTime,
      usage: totalUsage,
      servingModel,
      supersededById: selfSupersession?.supersededById ?? null,
      truncationStalled,
      synthesizeDeadEnd,
      // HARNESS_NO_OUTPUT Layer 2 (2026-07-17): quality-layer facts; persist conjoins with
      // FRESH in-tx task-row facts (status !== COMPLETED, !metadata.pipelineStageId) + the
      // F17/F20 gates. Either fact qualifies — the in-tx conjunction is what makes it safe.
      harnessNoOutput: harnessNoOutput || harnessCreateIncomplete,
      agentRole,
      confidenceScore,
      toolCallsTotal: toolCallResults.length,
      toolCallsSucceeded: successfulToolCalls,
      toolCallsFailed: failedToolCalls,
      commentUserId: userId || 'system',
      prune,
      fireReactors,
      logger,
    });

    await observers.onExecutionCompleted?.({
      executionTime,
      tokensUsed,
      createdArtifacts: persistResult.createdArtifacts,
      endTime,
    });
  } catch (postLoopErr) {
    await annotatePostLoopThrowOrRethrow(postLoopErr, { task, executionId, harnessContext, logger }, { db: prisma });
  }
}
