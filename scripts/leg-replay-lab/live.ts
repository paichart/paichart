/**
 * Leg replay lab — ONE live execution of a rebuilt prompt: the SHIPPING tool loop and post-loop cascade.
 *
 * Called only under `--spend`. Order mirrors execution-core.ts `runExecutionCore` (AE6-I1 live order):
 *   runAgenticToolLoop → finalizeTextForStopReason → content guard → computeFormCheckFact (config_change_author)
 *   → runFormCorrection (flag on AND the fact decided `attempted`)
 *   → runRequirementsFormStep (requirements_author; the SAME shared step the core calls — fact always, the correction
 *     turn when REQUIREMENTS_FORM_CORRECTION_ENABLED=true in the lab's env and the step decides `attempted`)
 *   → parseConfidenceScore/applyConfidenceCap
 *   → runDiagnosticRetry (the 50-69 band)
 * Every step is the shipping function; the lab only sequences them, because runExecutionCore itself also
 * PERSISTS (it cannot be called without writing to a database). That sequencing is a copy of ~40 lines of
 * ordering and is the one place this module could drift from the core — re-read execution-core.ts:200-372
 * whenever it changes.
 *
 * TOOLS: the model is offered the same tool definitions. A tool CALL cannot be served (no live stack, no
 * production MCP), so every call returns a fixed success-shaped stub naming the replay, and is recorded in
 * `toolCalls` so a report shows which samples asked for something they did not get. Success-shaped on purpose:
 * an error result would trip the #89 correction turn and the confidence cap, i.e. change the deliverable for a
 * reason that does not exist in production.
 * RECORDED TOOLS (2026-10-13, node `tools: 'recorded'`): a `RecordedToolServer` (recorded-tools.ts) serves each call
 * the stored raw result of the node's production execution through the same seam; the shipping loop applies R9 and the
 * LLM cap to it. The loop's full records come back as `toolCallRecords` for the sample's result.json `toolCalls`.
 */
import { runAgenticToolLoop, normalizeModelConfig } from '../../lib/agents/harness/agentic-tool-loop';
import { finalizeTextForStopReason } from '../../lib/services/llm/finalize-response';
import { computeFormCheckFact, isFormCheckEligible } from '../../lib/agents/harness/package-form-check';
import { runFormCorrection, isFormCorrectionEnabled } from '../../lib/agents/harness/form-correction';
import { parseConfidenceScore, applyConfidenceCap } from '../../lib/agents/harness/parse-confidence';
import { isRequirementsFormCheckEligible } from '../../lib/agents/harness/requirements-form-check';
import { runRequirementsFormStep, isRequirementsFormCorrectionEnabled, requirementsInputsFromHarnessRow } from '../../lib/agents/harness/requirements-form-correction';
import type { RequirementsFormInputs } from '../../lib/agents/harness/requirements-form-correction';
import { runDiagnosticRetry, BUDGET_SELF_FLAG_PATTERN } from '../../lib/agents/harness/diagnostic-retry';
import { RUNTIME_LIMITS } from '../../lib/validation/runtime-limits';
import { costForExecution } from '../../lib/services/llm/model-pricing';
import { LLMProvider } from '../../lib/services/llm/types';
import type { RebuiltPrompt } from './rebuild';
import type { RecordedToolServer } from './recorded-tools';

export const TOOL_STUB_RESULT = {
  content: [{ type: 'text', text: 'LEG REPLAY LAB: tool calls are not executed in an offline replay. No live state, no other task\'s output and no comment was read or written. Continue from your prompt and your §6 Pipeline Context.' }],
};

export interface LlmCall { purpose: string; model: string | null; stopReason: string | null; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number | null }

export interface LiveResult {
  finalResponse: string;
  finalStopReason: string | null;
  turns: number;
  toolCalls: Array<{ tool: string; action: string | null }>;
  /** The SHIPPING loop's full tool-call records (served result, R9 facts, LLM-cap facts) — the input of the result.json
   *  `toolCalls` builder. Under the stub every result is the stub. */
  toolCallRecords: Array<Record<string, unknown>>;
  formCheck: Record<string, unknown> | null;
  /** requirements_author only: the shipping `toolLoop.requirementsFormCheck` stamp. */
  requirementsFormCheck: Record<string, unknown> | null;
  /** requirements_author, when the correction turn was ATTEMPTED: the draft before it, the facts-only message the
   *  Author was sent, and the model's raw re-emission (kept even when NOT adopted — the read needs both sides). */
  requirementsCorrection?: { preCorrectionText: string; correctionPrompt: string | null; correctedRaw: string | null; enabledSource: string } | null;
  /** requirements_author: where the step's `enabled` came from — `arm:on|off` (the variant lever) or `env:on|off`. */
  requirementsFormCorrectionEnabledSource?: string | null;
  confidenceScore: number | null;
  diagnosticRetryUsed: boolean;
  correctionTurnUsed: boolean;
  truncationRetryUsed: boolean;
  calls: LlmCall[];
  costUsd: number;
  durationMs: number;
}

/**
 * TEST ONLY ($0): a scripted model that re-issues a production execution's tool calls, one production TURN per model
 * turn and in production order, then answers with `text`. Under recorded tools this drives the whole served path — the
 * proof that a replayed node receives the bytes production stored (`--fake-llm persisted` on a recorded node).
 */
export function fakeReplayToolCalls(stored: Array<{ turn?: unknown; tool?: unknown; arguments?: unknown }>, text: string, model: string) {
  const turns: Array<Array<{ id: string; name: string; arguments: string }>> = [];
  let last: unknown = Symbol('none');
  stored.forEach((t, i) => {
    if (t.turn !== last || !turns.length) { turns.push([]); last = t.turn; }
    turns[turns.length - 1].push({ id: `lab-replay-${i}`, name: String(t.tool), arguments: typeof t.arguments === 'string' ? t.arguments : JSON.stringify(t.arguments ?? {}) });
  });
  let k = 0;
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  return async () => {
    const calls = turns[k++];
    if (!calls) return { text, stopReason: 'end_turn', functionCalls: [], rawContentBlocks: [{ type: 'text', text }], usage, metadata: { model } };
    return { text: '', stopReason: 'tool_use', functionCalls: calls, usage, metadata: { model },
      rawContentBlocks: calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: JSON.parse(c.arguments) })) };
  };
}

/** A scripted model for the $0 end-to-end test: every call answers with `text` (no tool use, end_turn, zero usage). */
export function fakeGenerateText(text: string, model: string) {
  return async () => ({ text, stopReason: 'end_turn', functionCalls: [], rawContentBlocks: [{ type: 'text', text }],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, metadata: { model } });
}

export async function runLive(p: RebuiltPrompt, ctx: { executionId: string; taskId: string; taskType: string | null; apiKey: string;
  /** requirements_author: the harness row the snapshot carries (`snap.leg`) — the objective + owner map, no DB read. */
  requirementsHarnessRow?: Record<string, any> | null;
  /** L-R3 (2026-10-09): the ARM's correction flag. When set it is the step's `enabled`, independent of the process env
   *  (samples of different arms run concurrently in one process, so an env flip per arm would race). Unset ⇒ the env
   *  (`REQUIREMENTS_FORM_CORRECTION_ENABLED`), as before. */
  requirementsFormCorrectionEnabled?: boolean;
  /** Recorded tools (2026-10-13): serve calls from the node's production record instead of the stub. One per sample. */
  toolServer?: RecordedToolServer | null;
  /** TEST ONLY: replaces the model call. Never set on a --spend run. */
  generateTextOverride?: (prompt: string, options: any, userId?: string) => Promise<any> }): Promise<LiveResult> {
  const llm = ctx.generateTextOverride ? null : (await import('../../lib/services/llm/llm-service')).llmService;
  const started = Date.now();
  const calls: LlmCall[] = [];
  let purpose = 'loop';
  let corrCapture: { correctionPrompt: string | null; correctedRaw: string | null } | null = null;
  const generateText = async (prompt: string, options: any, userId?: string) => {
    const resp: any = ctx.generateTextOverride ? await ctx.generateTextOverride(prompt, options, userId) : await llm!.generateText(prompt, options, userId);
    if (purpose === 'requirements-form-correction') {
      const last = Array.isArray(options?.messages) ? options.messages[options.messages.length - 1] : null;
      const lastText = Array.isArray(last?.content) ? last.content.map((b: any) => b?.text ?? '').join('') : (typeof last?.content === 'string' ? last.content : null);
      corrCapture = { correctionPrompt: lastText, correctedRaw: typeof resp?.text === 'string' ? resp.text : null };
    }
    const u = resp?.usage ?? {};
    const model = resp?.metadata?.model ?? p.model;
    calls.push({
      purpose, model, stopReason: resp?.stopReason ?? null,
      inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, cacheReadTokens: u.cacheReadTokens ?? 0, cacheCreationTokens: u.cacheCreationTokens ?? 0,
      costUsd: costForExecution({ inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens, cacheCreationTokens: u.cacheCreationTokens }, model, new Date()).costUsd ?? null,
    });
    return resp;
  };
  const quiet = { info: () => {}, debug: () => {}, warn: () => {}, error: (o: any, m: string) => console.warn('    [loop error]', m, o?.apiErrorMessage ?? o?.err?.message ?? '') } as any;
  const cfg = normalizeModelConfig(p.llmConfigSource as any,
    { provider: LLMProvider.ANTHROPIC_SDK, apiKey: ctx.apiKey } as any, p.system);
  const toolCalls: LiveResult['toolCalls'] = [];
  const abort = new AbortController();
  // The lab's loop bound has been a flat 600 s. For requirements_author the bound is LOAD-BEARING: the 2b step decides
  // `insufficient-time` from the watchdog's time left, so the lab uses production's own formula
  // (agentExecutionEngine: EXECUTION_TIMEOUT_BASE_MS + maxToolTurns × EXECUTION_TIMEOUT_PER_TURN_MS — 1080 s at 30 turns).
  // Other roles keep 600 s so earlier experiments' baselines stay comparable (a known lab/production divergence).
  const reqEligible = isRequirementsFormCheckEligible(p.role, ctx.taskType);
  const prodTurns = Math.min(Number.isFinite(p.maxToolTurns) && p.maxToolTurns > 0 ? p.maxToolTurns : RUNTIME_LIMITS.DEFAULT_TOOL_TURNS, RUNTIME_LIMITS.MAX_TOOL_TURNS);
  const timeoutMs = reqEligible ? RUNTIME_LIMITS.EXECUTION_TIMEOUT_BASE_MS + prodTurns * RUNTIME_LIMITS.EXECUTION_TIMEOUT_PER_TURN_MS : 600_000;
  const loopStartedAt = Date.now();
  const deadlineAt = loopStartedAt + timeoutMs;
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  let loop: Awaited<ReturnType<typeof runAgenticToolLoop>>;
  try {
    loop = await runAgenticToolLoop({
      prompt: p.user, cfg, mcpFunctions: p.tools as any, maxToolTurns: p.maxToolTurns, signal: abort.signal,
      deadlineAt, agentRole: p.role ?? null, executionId: ctx.executionId, taskId: ctx.taskId, userId: undefined,
    }, {
      getToolDefinition: async (name: string) => (ctx.toolServer ? await ctx.toolServer.getToolDefinition(name) : { serverName: 'leg-replay-lab-stub', tool: { name } }) as any,
      executeToolOnServer: async (s: string, tool: string, args: any) => {
        toolCalls.push({ tool, action: typeof args?.action === 'string' ? args.action : null });
        return ctx.toolServer ? ctx.toolServer.executeToolOnServer(s, tool, args) as any : TOOL_STUB_RESULT;
      },
      generateText,
      logger: quiet,
    }, {});
  } finally { clearTimeout(timer); }

  const { messageHistory, totalUsage, turnCount, correctionTurnUsed, budgetFailFastUsed, toolCallResults } = loop;
  let currentResponse = loop.currentResponse;
  const hitMaxTurns = currentResponse.stopReason === 'tool_use' && turnCount >= p.maxToolTurns;
  let finalResponse = finalizeTextForStopReason(currentResponse.stopReason, loop.assembledText, { hitMaxTurns }).finalText;
  if ((!finalResponse || !finalResponse.trim()) && toolCallResults.length === 0) {
    throw new Error(`replay produced no content (stopReason=${currentResponse?.stopReason}) — production would mark this execution FAILED`);
  }

  let formCheck: any = null;
  let formCorrectionAttempted = false;
  if (isFormCheckEligible(p.role, ctx.taskType)) {
    formCheck = computeFormCheckFact({
      text: finalResponse, stopReason: loop.finalStopReason, textSource: 'loop', correctionTurnUsed,
      budgetFlagged: !!budgetFailFastUsed || (!!finalResponse && BUDGET_SELF_FLAG_PATTERN.test(finalResponse.slice(0, 1500))),
      correctionEnabled: isFormCorrectionEnabled(),
    });
    if (formCheck.correction?.attempted) {
      purpose = 'form-correction';
      const fc = await runFormCorrection({
        text: finalResponse, currentResponse, messageHistory, totalUsage, prompt: p.user, normalizedLlmConfig: cfg,
        mcpFunctions: p.tools as any, executionId: ctx.executionId, userId: undefined, undercountOnly: true,
      } as any, { generateText, logger: quiet });
      formCorrectionAttempted = fc.correction.attempted === true;
      const correction = { ...fc.correction, decisionTriggerHitsTotal: formCheck.triggerHitsTotal ?? 0, decisionHitsTotal: formCheck.hitsTotal ?? 0, decisionHits: formCheck.hits };
      if (fc.correction.adopted) {
        finalResponse = fc.text; currentResponse = fc.currentResponse;
        formCheck = { ...computeFormCheckFact({ text: finalResponse, stopReason: currentResponse?.stopReason, textSource: 'form-correction' }), correction };
      } else formCheck = { ...formCheck, correction };
    }
  }

  let requirementsFormCheck: any = null;
  let requirementsCorrection: LiveResult['requirementsCorrection'] = null;
  let requirementsFormCorrectionEnabledSource: string | null = null;
  if (reqEligible) {
    const inputs: RequirementsFormInputs = requirementsInputsFromHarnessRow(ctx.requirementsHarnessRow);
    purpose = 'requirements-form-correction';
    const enabled = typeof ctx.requirementsFormCorrectionEnabled === 'boolean' ? ctx.requirementsFormCorrectionEnabled : isRequirementsFormCorrectionEnabled();
    const enabledSource = typeof ctx.requirementsFormCorrectionEnabled === 'boolean' ? `arm:${enabled ? 'on' : 'off'}` : `env:${enabled ? 'on' : 'off'}`;
    const preCorrectionText = finalResponse;
    const rq = await runRequirementsFormStep({
      text: finalResponse, stopReason: loop.finalStopReason, inputs, correctionTurnUsed,
      budgetFlagged: !!budgetFailFastUsed || (!!finalResponse && BUDGET_SELF_FLAG_PATTERN.test(finalResponse.slice(0, 1500))),
      enabled, deadlineAt, loopStartedAt, currentResponse, messageHistory, totalUsage,
      prompt: p.user, normalizedLlmConfig: cfg, mcpFunctions: p.tools as any, executionId: ctx.executionId, userId: undefined,
    }, { generateText, logger: quiet });
    requirementsFormCheck = rq.stamp;
    requirementsFormCorrectionEnabledSource = enabledSource;
    finalResponse = rq.text; currentResponse = rq.currentResponse;
    if (rq.attempted) {
      formCorrectionAttempted = true;
      const cap = corrCapture as { correctionPrompt: string | null; correctedRaw: string | null } | null;
      requirementsCorrection = { preCorrectionText, correctionPrompt: cap?.correctionPrompt ?? null, correctedRaw: cap?.correctedRaw ?? null, enabledSource };
    }
  }

  const failed = toolCallResults.filter((t: any) => !t.success).length;
  const cap = applyConfidenceCap(parseConfidenceScore(finalResponse), toolCallResults.length, failed);
  purpose = 'diagnostic-retry';
  const retry = await runDiagnosticRetry({
    confidenceScore: cap.score, confidenceCapped: cap.capped, correctionTurnUsed, formCorrectionAttempted,
    text: finalResponse, currentResponse, messageHistory, totalUsage, prompt: p.user, normalizedLlmConfig: cfg,
    mcpFunctions: p.tools as any, executionId: ctx.executionId, userId: undefined,
  }, { generateText, logger: quiet });
  finalResponse = retry.text;

  return {
    finalResponse, finalStopReason: retry.currentResponse?.stopReason ?? loop.finalStopReason, turns: turnCount, toolCalls,
    toolCallRecords: toolCallResults as Array<Record<string, unknown>>,
    formCheck, requirementsFormCheck, requirementsCorrection, requirementsFormCorrectionEnabledSource, confidenceScore: retry.confidenceScore, diagnosticRetryUsed: retry.diagnosticRetryUsed, correctionTurnUsed,
    truncationRetryUsed: loop.truncationRetryUsed, calls, costUsd: calls.reduce((s, c) => s + (c.costUsd ?? 0), 0), durationMs: Date.now() - started,
  };
}
