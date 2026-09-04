/**
 * runExecutionCore — the shared happy-path execution spine (convergence Phase 6, 2026-07-05).
 *
 * The ONE implementation of the post-claim execution body that the engine
 * (`agentExecutionEngine.ts`) and the stream route (`app/api/pov/agent/execute/stream/route.ts`)
 * previously inline-mirrored (~350 lines each). Owns, in order (AE6-I1 live order — load-bearing):
 *
 *   timeout controller → runAgenticToolLoop → finalizeTextForStopReason → content-validation guard
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
import { llmService } from './llm/llm-service';
import { finalizeTextForStopReason } from './llm/finalize-response';
import { buildExecutionResultJson, deriveChainedContextSignal } from './execution-artifacts';
import { persistTerminalSuccess } from './execution-terminal-persist';
import { computeSelfSupersession } from './execution-selection';
import { computeDerivationContainmentFact } from '@/lib/agents/harness/derivation-containment-enrichment';
import { computeDialectLintFact } from '@/lib/agents/harness/dialect-lint-enrichment';
import { computeContractPropagationFact } from '@/lib/agents/harness/contract-propagation-enrichment';
import { assessExecutionQuality } from '@/lib/agents/harness/execution-quality';
import { runDiagnosticRetry } from '@/lib/agents/harness/diagnostic-retry';
import { runAgenticToolLoop } from '@/lib/agents/harness/agentic-tool-loop';
import type { AccumulatedUsage, AgenticLoopObservers, AgenticLoopInput } from '@/lib/agents/harness/agentic-tool-loop';
import { parseConfidenceScore, applyConfidenceCap, CONFIDENCE_CAP_CEILING } from '@/lib/agents/harness/parse-confidence';
import { mcpLogger } from '@/lib/logger';
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
  } finally {
    clearTimeout(executionTimeout);
  }

  const { toolCallResults, messageHistory, totalUsage, turnCount, correctionTurnUsed, budgetFailFastUsed, truncationRetryUsed, truncationRetryRecovered } = loopResult;
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

  const endTime = new Date();
  const executionTime = endTime.getTime() - startTime.getTime();

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

  await observers.onStoringResults?.({ executionTime, contentLength: finalResponse?.length || 0 });

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
    confidenceScore, confidenceCapped, correctionTurnUsed,
    text: finalResponse, currentResponse, messageHistory, totalUsage,
    prompt, normalizedLlmConfig, executionId, userId,
  }, { generateText: (p, o, u) => llmService.generateText(p, o, u), logger }, observers.diagnosticRetry);
  const diagnosticRetryUsed = _retry.diagnosticRetryUsed;
  finalResponse = _retry.text;
  currentResponse = _retry.currentResponse;
  confidenceScore = _retry.confidenceScore;

  // Token usage — 0.5b: computed AFTER the #90 retry fold so result.json / logs / persist agree.
  // Raw-sum semantic: 0 is a legitimate fact.
  const tokensUsed = totalUsage.inputTokens + totalUsage.outputTokens;

  const executionLogs = buildSuccessLogs({ tokensUsed, executionTime, turnCount, toolCallCount: toolCallResults.length });

  // Post-loop quality cascade (P5/P4/P3/P7/P10/EMPTY_DELIVERABLE/P8/HARNESS_NO_OUTPUT) — shared
  // assessExecutionQuality. Signals are ADDITIVE — they never change SUCCESS/FAILED status.
  const { executionDegradation, protocolValidation, harnessNoOutput, harnessCreateIncomplete } = assessExecutionQuality({
    toolCallResults,
    failedToolCalls,
    text: finalResponse,
    // Raw pre-note text so TRUNCATED_NO_OUTPUT (R2) isn't masked by the finalize note.
    // `loopResult.assembledText` is the deliverable BEFORE finalizeTextForStopReason; on the
    // truncation-stall path no diagnostic retry fires (null confidence), so this still
    // corresponds to the final currentResponse.
    rawDeliverableText: loopResult.assembledText,
    stopReason: currentResponse?.stopReason,
    task: { id: task.id, type: task.type, metadata: task.metadata, createdAt: task.createdAt },
    // HARNESS_NO_OUTPUT (2026-07-17): resolver-stamped mode — P8's UNKNOWN-only rescue
    // + the harnessCreateIncomplete (dead-end CREATE) fact.
    resolvedMode: harnessContext?.mode ?? null,
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

  // Derivation-containment fact (2026-07-17, pipeline-harness-specialist GO-WITH-CHANGES@85):
  // MECHANICAL check that a harness's derived values (e.g. a covering CIDR) don't swallow any
  // HARVESTED allocation beyond their declared members. Anchored to the HARVEST child's own
  // `## Harvested Allocations` block — never the package's copy (the run-4 fabrication surface).
  // PRE-tx by ruling: the child artifacts committed before the SYNTHESIZE reactor fired, so a
  // READ COMMITTED read here sees them; keeping it out of runTerminalSuccessTx leaves the
  // fixture-pinned F17/F20/truncation/HNO ordering untouched and a throw can never roll back the
  // SUCCESS commit. NON-THROW: any miss/parse failure ⇒ checked:false + reason — the reviewer
  // (LLM) tier blocks on missing evidence; this mechanical tier only reports the fact.
  if (task.type === 'PIPELINE' && harnessContext?.mode === 'SYNTHESIZE') {
    try {
      // EXTRACTED 2026-07-30 into lib/agents/harness/derivation-containment-enrichment.ts so this
      // logic is reachable WITHOUT a full program run. Inline here, the only way to observe what it
      // stamps was a rig rebuild + ~30-50 min run + human gates — so it got "verified" by reading
      // source, and three defects shipped that way (wrong reason string / unrendered field / wrong
      // artifact name). scripts/replay-containment.ts now runs THAT function against a real
      // completed leg in seconds. The try/catch stays HERE: non-throwing is the caller's contract
      // (degrade to enrichment-error; a throw must never roll back the SUCCESS commit).
      const fact = await computeDerivationContainmentFact(prisma, {
        stageId: (task.metadata as Record<string, unknown> | null)?.pipelineStageId,
        chainedFrom: (task.inputContext as { chainedFrom?: unknown } | null)?.chainedFrom,
      });
      (resultJson as Record<string, unknown>).derivationContainment = fact;
      if (Array.isArray((fact as { violations?: unknown[] }).violations) && (fact as { violations: unknown[] }).violations.length > 0) {
        logger.warn({ executionId, taskId: task.id, derivationContainment: fact },
          'Derivation-containment violations: a derived value covers harvested allocation(s) outside its declared members');
      }
      // DISCHARGE TELEMETRY (2026-08-27, panel condition 6). `no-author-child` now ESCALATES to Node C
      // instead of blocking, which trades a mechanical decision for a reviewer judgement. That trade was
      // made knowingly and is only defensible while we can see how often it is exercised — so emit a
      // countable line per escalation. This is the outcome data by which a DECLARED `legKind` could later
      // be EARNED (Protocol 10: ship the fact, earn the verdict); the panel rejected `legKind` as
      // unearned NOW, not wrong forever. A climb here without new program types is the signal to revisit.
      const disp = (fact as { containmentDisposition?: { disposition?: string; reason?: string } })
        .containmentDisposition;
      if (disp?.reason === 'no-author-child-leg-kind-undecidable') {
        logger.info({ executionId, taskId: task.id, containmentDisposition: disp },
          'Containment escalated to Node C: leg kind undecidable (no author child) — discharge required');
      }
    } catch (dcErr) {
      // G3 (2026-08-03): this path NEVER calls computeDerivationContainmentFact, so anything the
      // enrichment stamps is guaranteed ABSENT on the one arm that means "things went wrong".
      // Stamp the disposition here too, or an enrichment crash renders as a bare
      // `NOT checked (enrichment-error)` with no gate token at all — a failure that reads clean.
      (resultJson as Record<string, unknown>).derivationContainment = {
        checked: false, reason: 'enrichment-error',
        containmentDisposition: {
          disposition: 'blocking', reason: 'hard-gap',
          inputs: { reason: 'enrichment-error', violationCount: 0, unsupportedCount: 0 },
        },
      };
      logger.warn({ executionId, err: dcErr instanceof Error ? dcErr.message : String(dcErr) },
        'derivation-containment enrichment failed — fact recorded as checked:false');
    }
  }

  // DIALECT LINT (Phase 2, 2026-08-25) — the SECOND mechanical net, wired to the same site and the
  // same contract as derivation-containment above: PRE-tx, non-throwing, fact-not-verdict.
  //
  // Earned the same way: a prose contract failing twice on one axis. IGP-T1 R1 shipped two IOS-isms
  // on an Arista target past an APPROVING reviewer (refused at the operator's config session), then
  // R3 re-emitted a banned token past a contract that explicitly named it. Prose guards in this
  // domain have failed at least once each; mechanical ones have held.
  //
  // Scans FENCED CODE BLOCKS ONLY, and only those classified candidate-config — prose legitimately
  // NAMES banned tokens when stating rules, and an expected-output block legitimately quotes them
  // (R9). Blocking a clean package on that would be the R5 mistake inside our own guard.
  if (task.type === 'PIPELINE' && harnessContext?.mode === 'SYNTHESIZE') {
    try {
      const lint = await computeDialectLintFact(prisma, {
        stageId: (task.metadata as Record<string, unknown> | null)?.pipelineStageId,
        interfaceContract: (task.inputContext as { interfaceContract?: unknown } | null)?.interfaceContract,
      });
      (resultJson as Record<string, unknown>).dialectLint = lint;
      const violations = (lint as { violations?: unknown[] }).violations;
      if (Array.isArray(violations) && violations.length > 0) {
        logger.warn({ executionId, taskId: task.id, dialectLint: lint },
          'Dialect-lint violations: banned platform token(s) present in candidate-config blocks');
      }
      const transcription = (lint as { transcription?: { missing?: unknown[] } }).transcription;
      if (Array.isArray(transcription?.missing) && transcription.missing.length > 0) {
        logger.warn({ executionId, taskId: task.id, missing: transcription.missing },
          'Dialect-lint: required canonical-stanza line(s) ABSENT from the package (the R7 omission shape)');
      }
    } catch (dlErr) {
      // Same G3 reasoning as the containment catch above: this path never calls the enrichment, so
      // anything it stamps is guaranteed ABSENT on the one arm meaning "things went wrong". Stamp a
      // named fact here too, or an enrichment crash renders as nothing at all — a failure that
      // reads clean, which is the exact class this net exists to close.
      (resultJson as Record<string, unknown>).dialectLint = {
        checked: false, reason: 'enrichment-error', tokensConsidered: [], violations: [],
      };
      logger.warn({ executionId, err: dlErr instanceof Error ? dlErr.message : String(dlErr) },
        'dialect-lint enrichment failed — fact recorded as checked:false');
    }
  }

  // CONTRACT PROPAGATION (2026-08-26) — the THIRD mechanical net, and the first that lints the
  // HARNESS'S OWN DECOMPOSITION rather than an agent's output.
  //
  // Measured: across every archived leg carrying an interfaceContract, 7 of 7 lost most of the
  // canonical stanza when the leg harness PARAPHRASED the contract into its children's
  // descriptions, and 0 of N ACTION children ever held the structured contract. The obligations
  // that should have caught it are CONDITIONAL ("where the contract carries a canonical stanza
  // template, TRANSCRIBE it" / "...verify every non-placeholder line appears"), so with no contract
  // in context the predicate is false, NO OBLIGATION IS OWED, and nothing is logged as skipped.
  // Two live rounds shipped configs missing a line that left the routing protocol INACTIVE.
  //
  // Same contract as the two nets above: PRE-tx, non-throwing, FACT not verdict, catch arm stamps
  // a named reason. SYNTHESIZE (not CREATE) is deliberate: inheritance happens at each CHILD's
  // prepare, i.e. AFTER the leg's CREATE persist — a CREATE-time reading would report
  // hasInterfaceContract:false for every child forever, even once the fix works.
  if (task.type === 'PIPELINE' && harnessContext?.mode === 'SYNTHESIZE') {
    try {
      const propagation = await computeContractPropagationFact(prisma, {
        stageId: (task.metadata as Record<string, unknown> | null)?.pipelineStageId,
        interfaceContract: (task.inputContext as { interfaceContract?: unknown } | null)?.interfaceContract,
      });
      (resultJson as Record<string, unknown>).contractPropagation = propagation;
      const kids = (propagation.children ?? []) as Array<Record<string, unknown>>;
      const starved = kids.filter((k) => k.executed && !k.hasInterfaceContract);
      if (starved.length > 0) {
        logger.warn({ executionId, taskId: task.id,
          starved: starved.map((k) => ({ taskId: k.taskId, role: k.role,
            linesAbsentFromBrief: (k.canonicalLinesAbsentFromBrief as string[])?.length ?? 0 })) },
          'Contract propagation: executed child ran WITHOUT the structured interface contract — ' +
          'its conditional transcribe/verify obligations were unsatisfiable');
      }
    } catch (cpErr) {
      (resultJson as Record<string, unknown>).contractPropagation = {
        checked: false, reason: 'enrichment-error', canonicalLinesConsidered: 0, children: [],
      };
      logger.warn({ executionId, err: cpErr instanceof Error ? cpErr.message : String(cpErr) },
        'contract-propagation enrichment failed — fact recorded as checked:false');
    }
  }

  // Keep-best self-supersession — computed PRE-tx (READ COMMITTED; target terminal + immutable).
  // Fires ONLY for stamped orchestrator retries. Non-fatal: failure = latest-wins.
  let selfSupersession: Awaited<ReturnType<typeof computeSelfSupersession>> = null;
  try {
    selfSupersession = await computeSelfSupersession(prisma, (execution as any).context, resultJson);
    if (selfSupersession) (resultJson as any).supersession = selfSupersession.audit;
  } catch (ksErr) {
    logger.warn({ executionId, err: ksErr instanceof Error ? ksErr.message : String(ksErr) },
      'keep-best comparison failed — proceeding latest-wins');
  }

  // Terminal SUCCESS persist — the ONE shared implementation (Phase 4b): atomic tx (artifacts +
  // execution + task) plus the core-owned post-commit tail (reactors, auto-comment). prune/fireReactors
  // are THREADED transitional params (engine true/true, stream false/false) — not flipped here.
  const persistResult = await persistTerminalSuccess(prisma, {
    executionId,
    task: { id: task.id, type: task.type, metadata: task.metadata, povId: task.povId, title: task.title },
    finalText: finalResponse,
    resultJson,
    logs: executionLogs,
    endTime,
    executionCreatedAt: execution.createdAt ?? null,
    executionStartTime: startTime,
    usage: totalUsage,
    servingModel,
    supersededById: selfSupersession?.supersededById ?? null,
    truncationStalled,
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
}
