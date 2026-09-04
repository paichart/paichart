/**
 * Agentic Tool Loop — shared module for the two execution paths
 * (engine: lib/services/agentExecutionEngine.ts, stream: app/api/pov/agent/execute/stream/route.ts).
 *
 * Phase 1 scope (implementation plan: cline_docs/agent-tool-loop-implementation-plan-v1.md):
 * option normalization + the two-mode LLM call-options builder. This collapses the
 * 8 hand-maintained inline option objects that produced drift D-D/D-E (model/provider
 * fallback divergence between paths).
 *
 * ── SECURITY RULES (sec-ops review S1/S2, cline_docs/reviews/tool-loop-extraction-2026-06-10/) ──
 *
 * S1 — ZERO MODULE-LEVEL STATE. No memoization, no caching, no module-scoped `let`.
 *      Every user's BYOK apiKey flows through these functions; module-level state is
 *      how the Mar 2026 singleton-mutation incident leaked one user's apiKey/model
 *      into another user's request (provider setModel/setApiKey, since removed).
 *      Pure functions of their inputs ONLY.
 *
 * S2 — THE OPTIONS OBJECT IS LOG-FORBIDDEN. Never pass the built options (or the
 *      NormalizedModelConfig) to any logger — it contains the raw apiKey. Log only
 *      named scalar fields (model, provider, turn, durations, token counts).
 *
 * S3 — apiKey passes through VERBATIM. No fallback, no default, no third
 *      enforcement gate here. Fail-closed gates live upstream (engine pre-flight
 *      AuthError) and downstream (provider getClientForRequest throw).
 *
 * ── BOUNDARY NOTES (boundary-contract review B1/B5) ──
 *
 * B1 — Normalization happens ONCE per execution at the caller boundary. After
 *      normalizing, no call site may read `config.*` / `modelParameters.*` for LLM
 *      options again.
 *
 * B5 — No Zod here, deliberately: this is an internal boundary with TypeScript
 *      types on both sides (caller-owned config in, LLMRequestOptions out). Zod
 *      belongs at trust boundaries (HTTP, MCP transport), not between two typed
 *      modules in the same process.
 *
 * Model fallback chain (D-D, commit 64b7c864): config/model-params > user settings >
 * STOP. The provider default (env ANTHROPIC_MODEL → hardcoded) handles the tail.
 * Do NOT add a model literal here.
 */

import { LLMProvider, DEFAULT_MAX_TOKENS, DEFAULT_MODEL_PARAMS } from '@/lib/services/llm/types';
import { RUNTIME_LIMITS } from '@/lib/validation/runtime-limits';
import { capabilitiesFor, clampEffort } from '@/lib/services/llm/model-capabilities';
import { AppError } from '@/lib/errors';
import type { LLMRequestOptions } from '@/lib/services/llm/types';
import { sanitizeChainedOutput } from '@/lib/agents/harness/sanitize-chained-output';

/**
 * Token-usage accumulation across an agentic loop's turns.
 * (token-usage-persistence Phase 1) Extended to carry CACHE tokens: the provider returns
 * cacheReadTokens/cacheCreationTokens (anthropic-sdk-provider.ts:343-347) but the old
 * {inputTokens,outputTokens} accumulator dropped them, making cost non-reconstructable.
 * ONE mutator (`addUsage`) is used at all 6 accumulation sites — 4 in this loop + the 2
 * diagnostic-retry callers (engine + stream) — so the cache total can't silently under-count
 * from a missed site. Provider guarantees this shape; `|| 0` guards partial/absent usage.
 */
export interface AccumulatedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

type PartialUsage = { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheCreationTokens?: number } | undefined;

export function newAccumulatedUsage(usage?: PartialUsage): AccumulatedUsage {
  return {
    inputTokens: usage?.inputTokens || 0,
    outputTokens: usage?.outputTokens || 0,
    cacheReadTokens: usage?.cacheReadTokens || 0,
    cacheCreationTokens: usage?.cacheCreationTokens || 0,
  };
}

export function addUsage(total: AccumulatedUsage, usage?: PartialUsage): void {
  if (!usage) return;
  total.inputTokens += usage.inputTokens || 0;
  total.outputTokens += usage.outputTokens || 0;
  total.cacheReadTokens += usage.cacheReadTokens || 0;
  total.cacheCreationTokens += usage.cacheCreationTokens || 0;
}

/**
 * The 11 persistent option fields (field inventory:
 * cline_docs/reviews/tool-loop-extraction-2026-06-10/field-matrix.md).
 * Field types are Pick'd from LLMRequestOptions so SDK-driven type updates
 * propagate automatically.
 */
export interface NormalizedModelConfig
  extends Pick<
    LLMRequestOptions,
    'topP' | 'stopSequences' | 'cacheControl' | 'thinkingBudgetTokens' | 'webSearch' | 'effort'
  > {
  maxTokens: number;
  /** Optional since WU-3: OMITTED for models that reject temperature (Opus 4.7/4.8, Fable). */
  temperature?: number;
  systemPrompt: string | undefined;
  provider: LLMProvider;
  model: string | undefined;
  apiKey: string | undefined;
}

/**
 * Loose input shape — both callers' sources have the SAME field names:
 * engine `config.*` (flat spread from executionConfig) and stream
 * `modelParameters.*`. One normalize function serves both; it structurally
 * cannot drift the way two per-path adapters could (and did: D-E was the
 * stream initial call missing the provider fallback its own sibling sites had).
 */
export interface ModelConfigSource {
  maxTokens?: number;
  temperature?: number;
  topP?: LLMRequestOptions['topP'];
  stopSequences?: LLMRequestOptions['stopSequences'];
  provider?: LLMProvider;
  model?: string;
  webSearch?: LLMRequestOptions['webSearch'];
  /** RAW value from task/template metadata — may be a legacy object ({type:'persistent',id}),
   *  boolean, null, or junk (untyped-metadata precedent: the maxToolTurns NaN case).
   *  normalizeCacheControl resolves it to the canonical LLMRequestOptions shape. */
  cacheControl?: unknown;
  thinkingBudgetTokens?: number;
  effort?: LLMRequestOptions['effort'];
}

/** Matches llmService.resolveUserSettings() return shape — the PROVIDER/KEY axis.
 *  `model` is intentionally absent: model resolves from the template/task, not user
 *  settings (two-axis, 2026-06-18). */
export interface UserLLMSettings {
  provider?: LLMProvider;
  apiKey?: string;
}

/**
 * Resolve the raw cacheControl signal to the canonical wire shape (Finding G, 2026-07-08,
 * 3-specialist review 92% GREEN — cline_docs/reviews/prompt-caching-G-2026-07-08/):
 *   false            -> OFF (explicit opt-out — the GUI writes false; survives the default)
 *   null / undefined -> DEFAULT-ON ({type:'ephemeral'}) — prod audit: every existing null is
 *                       form-default residue, never a deliberate opt-out (template-system F1)
 *   true             -> ON (legacy boolean toggle)
 *   {type: ...}      -> ON, normalized to ephemeral (legacy 'persistent'/'id' are not API values)
 *   anything else    -> OFF (junk-tolerant; untyped metadata can bypass Zod — F5c)
 * PROMPT_CACHE_DISABLED=true is the ops kill-switch (rollback without a deploy config change).
 */
export function normalizeCacheControl(raw: unknown): { type: 'ephemeral' } | undefined {
  if (process.env.PROMPT_CACHE_DISABLED === 'true') return undefined;
  if (raw === false) return undefined;
  if (raw === null || raw === undefined) return { ...DEFAULT_MODEL_PARAMS.cacheControl };
  if (raw === true) return { type: 'ephemeral' };
  if (typeof raw === 'object' && typeof (raw as { type?: unknown }).type === 'string') {
    return { type: 'ephemeral' };
  }
  return undefined;
}

/**
 * Normalize a caller's model config into the canonical shape. Bakes the
 * documented resolution chains (previously duplicated — inconsistently — at
 * 8 call sites):
 *   provider: source > user settings > ANTHROPIC_SDK        (fixes D-E uniformly)
 *   model:    source > user settings > undefined            (D-D: provider owns the tail)
 *   apiKey:   user settings, verbatim                       (S3)
 */
export function normalizeModelConfig(
  source: ModelConfigSource,
  userLLMSettings: UserLLMSettings,
  systemPrompt: string | undefined
): NormalizedModelConfig {
  // MODEL = the load-bearing identity (which LLM runs). Two-axis resolution
  // (2026-06-18 cleanup, Protocol 2 reviewed): model resolves from the template/task
  // (`source.model`) ONLY — NOT from userLLMSettings (that's the provider/key axis).
  // No silent default: a model-less template is a misconfiguration that must FAIL
  // LOUD, not silently run a buried Haiku literal. Mirrors the apiKey resolve-or-throw
  // (USER_CONFIG_REQUIRED); the .code surfaces as errorCategory='MODEL_UNRESOLVED' in
  // error.json so the GUI/MCP client gets an actionable fact, not an opaque failure.
  const model = source.model;
  if (!model) {
    throw new AppError(
      'No model resolved for this execution. Set a model on the agent template ' +
        '(Agent Builder → Model, stored as metadata.modelParameters.model). ' +
        'Checked: template metadata and task override — none found.',
      'MODEL_UNRESOLVED'
    );
  }
  // WU-3 (SDK Phase 2): resolve the model's request capabilities at THIS chokepoint
  // (engine + stream both feed normalizeModelConfig — token-optimizer C1). FAIL
  // LOUD on an unknown model (no silent legacy shape). temperature/effort become
  // model-conditional HERE so the provider just consumes a resolved config.
  //
  // ⚠️ Corrected 2026-08-09: this said "engine + stream + reactor". There are exactly TWO
  // production call sites — agentExecutionEngine.ts:871 and
  // app/api/pov/agent/execute/stream/route.ts:618. The reactor cascade does not call this
  // directly; it routes through the engine. The stale third path would send an auditor
  // hunting a chokepoint that does not exist — which matters because this IS the hop where
  // the two real paths can diverge (see cline_docs/reviews/cache-breakpoint-split-2026-08-09/).
  const cap = capabilitiesFor(model);
  return {
    // R-4 + model-aware: clamp maxTokens to the model's real output ceiling (Opus/Fable
    // 128K, Haiku/Sonnet 64K) — now sourced from cap.outputCeiling.
    maxTokens: Math.min(source.maxTokens ?? DEFAULT_MAX_TOKENS, cap.outputCeiling),
    // temperature/topP ONLY for models that accept them — OMITTED for Opus 4.7/4.8/Fable
    // (the API 400s on temperature for that tier). WU-4 removes the provider's `?? 0.3` so
    // this omission actually reaches the wire.
    temperature: cap.acceptsTemperature ? (source.temperature ?? DEFAULT_MODEL_PARAMS.temperature) : undefined,
    topP: cap.acceptsTemperature ? source.topP : undefined,
    // effort → output_config.effort. Default 'high', clamped to what the model accepts;
    // undefined (omitted) for models without effort (Haiku 4.5 errors on it).
    effort: clampEffort(source.effort ?? 'high', cap) ?? undefined,
    stopSequences: source.stopSequences,
    systemPrompt,
    // provider/key axis — still resolves from userLLMSettings (profile/system).
    provider: source.provider ?? userLLMSettings.provider ?? LLMProvider.ANTHROPIC_SDK,
    model,
    apiKey: userLLMSettings.apiKey,
    webSearch: source.webSearch,
    cacheControl: normalizeCacheControl(source.cacheControl),
    thinkingBudgetTokens: source.thinkingBudgetTokens,
  };
}

/**
 * The two call shapes (field matrix, all 8 sites):
 *  - 'full'       — initial + loop-continuation calls: tools available, webSearch
 *                   and extended thinking honored.
 *  - 'reflection' — #89 anti-fabrication correction + #90 diagnostic retry:
 *                   `functions: []` + `functionCall: 'none'` structurally prevent
 *                   loop re-entry; thinking disabled (simple rewrite); webSearch
 *                   omitted.
 */
export type LlmCallMode = 'full' | 'reflection';

export interface PerCallOptions {
  /** Execution-level AbortController signal — required on EVERY call (P4 rule). */
  signal: AbortSignal;
  /** Tool definitions; only consumed in 'full' mode. */
  mcpFunctions?: LLMRequestOptions['functions'];
  /** Message history for continuation/reflection turns; omitted on the initial call. */
  messages?: LLMRequestOptions['messages'];
}

/**
 * Build the options object for llmService.generateText(). Behavior-identical to
 * the 8 former inline objects, with ONE documented unification: the initial
 * call's `functionCall: mcpFunctions ? 'auto' : undefined` conditional now also
 * applies to continuation calls (which hardcoded 'auto'). Identical in reachable
 * states — a continuation turn only occurs after stopReason 'tool_use', which
 * requires functions to have been provided.
 */
export function buildLlmCallOptions(
  cfg: NormalizedModelConfig,
  mode: LlmCallMode,
  perCall: PerCallOptions
): LLMRequestOptions {
  const base: LLMRequestOptions = {
    maxTokens: cfg.maxTokens,
    temperature: cfg.temperature,
    topP: cfg.topP,
    stopSequences: cfg.stopSequences,
    systemPrompt: cfg.systemPrompt,
    provider: cfg.provider,
    model: cfg.model,
    apiKey: cfg.apiKey,
    ...(perCall.messages ? { messages: perCall.messages } : {}),
    signal: perCall.signal,
  };

  if (mode === 'full') {
    return {
      ...base,
      // Zero-tool guard (token-optimizer, G review): no functions => structurally single-call =>
      // a cache write that is never read (+25% on one request). Only cache multi-turn-capable calls.
      cacheControl: perCall.mcpFunctions?.length ? cfg.cacheControl : undefined,
      functions: perCall.mcpFunctions,
      functionCall: perCall.mcpFunctions ? 'auto' : undefined,
      webSearch: cfg.webSearch,
      thinkingBudgetTokens: cfg.thinkingBudgetTokens,
      effort: cfg.effort,
    };
  }

  // reflection: no tools (structural loop-re-entry guard), no thinking,
  // webSearch omitted entirely (matches former inline reflection objects).
  return {
    ...base,
    // Reflection calls are TERMINAL (one call, different systemPrompt => separate cache):
    // a write here is never read — pure premium on the largest-history call of the run
    // (agent-execution, G review). Never cache reflections.
    cacheControl: undefined,
    functions: [],
    functionCall: 'none',
    thinkingBudgetTokens: undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: executeToolTurn — the per-turn tool-execution body
// (implementation plan E2.1; extracted verbatim from the two former inline
// loops, engine :862-908 / stream :770-833 at commit ad508c3c)
// ─────────────────────────────────────────────────────────────────────────────

/** Tier-1 truncation: bounds what feeds BACK to the LLM as tool_result content.
 *  (Distinct from the 50KB Tier-2 persistence truncation at resultJson assembly.)
 *  Exported for the tier-nesting invariant test (Finding D) — see
 *  scripts/test-truncation-tier-invariant.ts + harvest-truncation-safety.md §1. */
export const MAX_TOOL_RESULT_LENGTH = 8000;

/** Tier-1 LLM-view truncation (HEAD-only, CHARACTER cap). Bounds what a tool result feeds BACK to
 *  the LLM. DISTINCT from contextManager's compression (head+tail) and the agent-results/formatters
 *  display previews — do NOT merge (harvest-truncation-safety.md §1: the tiers are intentionally
 *  not unified). The appended directive is fact-forward per Protocol 10: it states what happened
 *  (counts) + the established scoped-read discipline (already seeded in UNIVERSAL_AGENT_RULES and
 *  the infra_state_harvester role guidance) — no predictive verdict. The `[truncated]` substring is
 *  load-bearing: role-guidance prose (pAIchartUniversalTemplate.ts) tells agents to look for it. */
export function truncateForLlm(
  content: string,
  ref?: number
): { text: string; truncated: boolean; fullLength: number } {
  const fullLength = content.length;
  if (fullLength <= MAX_TOOL_RESULT_LENGTH) return { text: content, truncated: false, fullLength };
  const dropped = fullLength - MAX_TOOL_RESULT_LENGTH;
  const base =
    content.slice(0, MAX_TOOL_RESULT_LENGTH) +
    `\n\n... [truncated] — showed the first ${MAX_TOOL_RESULT_LENGTH} of ${fullLength} characters; ` +
    `the remaining ${dropped} are NOT shown. Do not treat the missing tail as absent or fabricate it. `;
  // Recovery clause. Protocol 10: the options are ordered by COST FACTS (a scoped re-read is cheaper),
  // NOT an unearnable "prefer X" verdict (ordering an option the platform can't validate — the run-3
  // no-narrower-form case had none). The read_more line is offered ONLY when this result was captured
  // in the pager (ref present); a result with no pageable ref (e.g. a failed call) gets the scope-or-flag
  // form only. `... [truncated]` is load-bearing (role prose + string-pinned tests) — keep it verbatim.
  const recover = ref !== undefined
    ? `To recover: a NARROWER/SCOPED re-read (by section, filter, resource, or page) is usually cheaper and needs no extra turn when a narrower form exists. ` +
      `To keep reading THIS exact result instead: read_more({ ref: "${ref}", offset: ${MAX_TOOL_RESULT_LENGTH} }) — each window costs a turn, so page only what the task needs. ` +
      `If you do neither, name the specific missing content as a gap. Never repeat the same broad call unchanged.`
    : `If you need the omitted content, re-issue this read NARROWER/SCOPED (by section, filter, resource, or page). ` +
      `If this read has no narrower form, flag the gap in your output instead of repeating the same call.`;
  return { text: base + recover, truncated: true, fullLength };
}

// ─────────────────────────────────────────────────────────────────────────────
// read_more — truncation-recovery pager (Phase 1, memory-backed)
// Design: cline_docs/reviews/overflow-fetch-design-2026-07-09/. When a tool result exceeds the
// Tier-1 cap above, its FULL post-R9 string is stashed in a per-execution PagerState and the
// truncation notice hands the model a `ref`. The model calls read_more({ref, offset}) to page the
// SAME content — NO re-execution, no new query, no device contact. The loop intercepts read_more by
// NAME in executeToolTurn and serves windows from memory. It is NEVER registered on any server —
// READ_MORE_FUNCTION_DEF is injected into mcpFunctions at the two build sites (agentExecutionEngine
// + stream/route), so it stays entirely off every external tools/list surface (mcp-hub +
// mcp-tool-architecture audits, 2026-07-10). Phase 2 (durable spill to agent_artifacts) is gated
// separately on sec-ops + boundary-contract.
// ─────────────────────────────────────────────────────────────────────────────

/** Window sizing. max < MAX_TOOL_RESULT_LENGTH (8000) by an envelope+escaping margin so a served
 *  window is itself NEVER Tier-1-truncated (the read_more block bypasses truncateForLlm). */
export const READ_MORE_WINDOW_BOUNDS = { min: 100, max: 7000, default: 6000 };
/** Hard cap on windows served for ONE origin ref (anti-page-the-whole-thing; TO-1/SO-C5). */
const READ_MORE_PAGES_PER_ORIGIN = 6;
/** Per-execution store ceiling. Evict-oldest on overflow → a later read_more on an evicted ref
 *  returns a fact-shaped is_error (never a throw). Bounds memory on pathological runs. */
const PAGER_STORE_MAX_BYTES = 2_000_000;

/** Per-execution pager state — created in runAgenticToolLoop, threaded into executeToolTurn.
 *  S1: strictly loop-local, never shared across executions. */
export interface PagerState {
  /** ref (monotonic int) → FULL post-R9 LLM-bound string (the exact basis of resultChars). */
  store: Map<number, string>;
  nextRef: number;
  bytesStored: number;
  /** ref → windows served so far (per-origin cap). */
  pagesByRef: Map<number, number>;
  /** read_more calls served this run (per-run cap). */
  pagerTurnsUsed: number;
  /** min(8, floor(0.25 * maxToolTurns)) — computed once at creation. */
  maxPagerTurns: number;
}

export function createPagerState(maxToolTurns: number): PagerState {
  return {
    store: new Map(),
    nextRef: 1,
    bytesStored: 0,
    pagesByRef: new Map(),
    pagerTurnsUsed: 0,
    maxPagerTurns: Math.min(8, Math.floor(0.25 * maxToolTurns)),
  };
}

/** Stash a truncated result's FULL post-R9 string; returns the ref to advertise in the notice.
 *  BLOCKING SO-C1: the caller MUST pass the post-R9 `toolResultContent` local, NOT record.result
 *  (the raw pre-R9 object — sourcing pages from it would bypass the R9 sanitizer). */
function pagerCapture(pager: PagerState, content: string): number {
  const ref = pager.nextRef++;
  pager.store.set(ref, content);
  pager.bytesStored += content.length;
  while (pager.bytesStored > PAGER_STORE_MAX_BYTES && pager.store.size > 1) {
    const oldest = pager.store.keys().next().value as number;
    pager.bytesStored -= pager.store.get(oldest)?.length ?? 0;
    pager.store.delete(oldest);
  }
  return ref;
}

/** The LLM-facing function def injected into mcpFunctions at the two build sites whenever a run has
 *  tools. Kept in the SAME {name, description, parameters} shape both sites already emit so the
 *  prompt-cache functions block stays byte-stable. NOT a registered tool — no server, no registry,
 *  no external surface; a single shared ref (never mutated) so injected bytes are identical per run. */
export const READ_MORE_FUNCTION_DEF: { name: string; description: string; parameters: any } = {
  name: 'read_more',
  description: `Continue reading a tool result that was truncated — returns the next window of the SAME content you already received the first part of (no re-execution, no new query, no device contact).
WHEN TO USE:
✅ A result ended with a "... [truncated]" notice that gave you a ref
❌ You could narrow the original query instead (a filtered/scoped re-read is cheaper — prefer it)
❌ Inventing refs — only use a ref handed to you in a truncation notice in THIS execution
Refs are NOT for reading upstream dependency outputs — those are already in your prompt as §6 Pipeline Context.
RETURNS raw text: a header [read_more ref=.. offset=..], the window, then either the next offset to continue or [end of result].`,
  parameters: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'Overflow reference copied VERBATIM from the truncation notice' },
      offset: { type: 'integer', minimum: 0, description: 'Character offset to continue from (the notice gives you the next offset)' },
      limit: {
        type: 'integer', minimum: READ_MORE_WINDOW_BOUNDS.min, maximum: READ_MORE_WINDOW_BOUNDS.max,
        description: `Window size in chars (default ${READ_MORE_WINDOW_BOUNDS.default}; capped at ${READ_MORE_WINDOW_BOUNDS.max} so the window is itself never truncated)`,
      },
    },
    required: ['ref', 'offset'],
  },
};

/** Serve ONE read_more call from memory (Phase 1). Returns a NORMAL record + tool_result block.
 *  Every error path is a fact-shaped is_error block (SO-C5: never throw — the model must be able to
 *  adapt). RAW TEXT window (not a JSON envelope) so it never nests a second Tier-1 truncation. */
function pagerServe(
  pager: PagerState,
  toolCall: LlmFunctionCall,
  ctx: ToolTurnContext
): { record: ToolCallRecord; block: ToolResultBlock } {
  const startedAt = Date.now();
  const mkErr = (msg: string, args: unknown): { record: ToolCallRecord; block: ToolResultBlock } => ({
    record: {
      turn: ctx.turn, tool: 'read_more', arguments: args, error: msg, success: false,
      durationMs: Date.now() - startedAt, timestamp: new Date().toISOString(),
    },
    block: { type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify({ error: msg }), is_error: true },
  });

  let args: any;
  try { args = JSON.parse(toolCall.arguments); }
  catch { return mkErr('read_more: arguments were not valid JSON', toolCall.arguments); }

  // Per-run cap (SO-C5) — checked before serving so an over-pager is redirected to scope-or-flag.
  if (pager.pagerTurnsUsed >= pager.maxPagerTurns) {
    return mkErr(`read_more: this run's page budget (${pager.maxPagerTurns}) is exhausted. Stop paging — scope the original read narrower, or name the specific missing content as a gap in your output.`, args);
  }

  const ref = Number(args?.ref);
  if (!Number.isInteger(ref)) {
    return mkErr(`read_more: '${args?.ref}' is not a valid ref. Copy the ref verbatim from a "... [truncated]" notice in THIS execution.`, args);
  }
  const full = pager.store.get(ref);
  if (full === undefined) {
    return mkErr(`read_more: unknown or expired ref ${ref}. Refs are valid only within this execution and may expire under memory pressure — re-issue the original read (scoped/narrower) for fresh content.`, args);
  }
  const originPages = pager.pagesByRef.get(ref) ?? 0;
  if (originPages >= READ_MORE_PAGES_PER_ORIGIN) {
    return mkErr(`read_more: already paged ref ${ref} ${READ_MORE_PAGES_PER_ORIGIN} times. Stop paging this result — scope the original read narrower or flag the remaining tail as a gap.`, args);
  }
  const offset = Number(args?.offset);
  if (!Number.isInteger(offset) || offset < 0 || offset >= full.length) {
    return mkErr(`read_more: offset ${args?.offset} is out of range for ref ${ref} (valid 0..${full.length - 1}).`, args);
  }

  const reqLimit = Number(args?.limit);
  const limit = Math.min(
    Math.max(Number.isInteger(reqLimit) ? reqLimit : READ_MORE_WINDOW_BOUNDS.default, READ_MORE_WINDOW_BOUNDS.min),
    READ_MORE_WINDOW_BOUNDS.max,
  );
  const win = full.slice(offset, offset + limit);
  const end = offset + win.length;
  const nextOffset = end < full.length ? end : null;
  const header = `[read_more ref=${ref} offset=${offset}..${end} of ${full.length}]`;
  const trailer = nextOffset !== null
    ? `\n[more remains] — continue: read_more({ ref: "${ref}", offset: ${nextOffset} }). A scoped/narrower re-read of the source is usually cheaper than paging on; page only what the task needs.`
    : `\n[end of result]`;
  const text = `${header}\n${win}${trailer}`;

  pager.pagesByRef.set(ref, originPages + 1);
  pager.pagerTurnsUsed += 1;

  return {
    record: {
      turn: ctx.turn, tool: 'read_more', arguments: args, result: text, success: true,
      durationMs: Date.now() - startedAt, timestamp: new Date().toISOString(),
      resultTruncatedForLlm: false, resultChars: text.length,
    },
    block: { type: 'tool_result', tool_use_id: toolCall.id, content: text },
  };
}

/** Budget-rejection error shape from tokenManager via mcpService (single source; also used
 *  by the #89 skip below. Engine + stream categorization carry copies — consolidated to this
 *  export 2026-07-04). */
export const BUDGET_ERROR_PATTERN = /budget exceeded|hourly limit/i;

/** Budget fail-fast (follow-ups item 2, reviewed 2026-07-04): blocked-report request threaded
 *  into the SAME user message as the rejected tool results (tool_results first — the documented
 *  Anthropic mixed-content shape). Fact-shaped per Protocol 10: report what happened, no
 *  predicted-recovery verdicts. The deterministic failure list is injected by the caller (A1). */
function buildBudgetBlockedReportPrompt(records: ToolCallRecord[]): string {
  const failureList = records
    .map((t, i) => `${i + 1}. **${t.tool}**: ${t.error || 'unknown error'}`)
    .join('\n');
  return (
    `**Budget fail-fast notice (platform).** Every tool call you made this turn was rejected by ` +
    `the per-user hourly token budget:\n\n${failureList}\n\n` +
    `The budget window will not admit further tool calls for the remainder of the hour, so no ` +
    `tools are available on this final turn. Write a BLOCKED report as your final response:\n` +
    `- What you were asked to do and what (if anything) you completed before the rejections.\n` +
    `- Which sources/tools you could not reach, tool by tool, and the exact error.\n` +
    `- What an operator should do (retry this task after the hourly budget window resets).\n` +
    `- Do NOT fabricate, reconstruct, or guess at data the rejected calls would have returned.\n` +
    `- End with a confidence score in the format "Confidence: N/100" reflecting the blocked state.`
  );
}

/** Degrade-to-(a) synthesized terminal (reviewed spec 3.5): MUST be non-empty and MUST contain
 *  "token budget" (keeps #90's _agentSelfFlaggedBudget suppression true) — a platform
 *  fact-report, not agent prose. */
function synthBlockedText(records: ToolCallRecord[], turn: number): string {
  const sample = records.find(r => typeof r.error === 'string')?.error ?? 'budget exceeded';
  return (
    `[System-synthesized report — the blocked-report turn could not run] Execution blocked: ` +
    `hourly token budget exhausted — ${records.length} tool call(s) rejected on turn ${turn} ` +
    `("${sample}"). No further tool calls or LLM turns were attempted. Retry after the hourly ` +
    `token budget window resets. Confidence: 15/100`
  );
}

/**
 * PINNED SHAPE (boundary review B3) — these records land VERBATIM in
 * result.json.toolCalls (artifact schema, JSONB — renames break consumers
 * silently: detection cascade P3/P4, forensic greps, GUI artifact viewer).
 *
 * Deliberate asymmetry carried from the original code: on success `arguments`
 * is the PARSED object; on failure it is the RAW string (JSON.parse may be
 * what failed).
 */
export type ToolCallRecord = {
  turn: number;
  tool: string;
  server?: string;
  arguments: unknown;
  result?: unknown;
  error?: string;
  success: boolean;
  durationMs: number;
  timestamp: string;
  /** C2 (2026-07-08) — Tier-1 forensic signal, emit-only (mirrors ChainedContextSignal.anyTruncated:
   *  detectors emit, consumers decide): did the LLM-bound copy of this result get truncated at
   *  MAX_TOOL_RESULT_LENGTH before the model reasoned over it? Operator check: grep result.json
   *  toolCalls for `resultTruncatedForLlm: true` (harvest-truncation-safety.md §6). */
  resultTruncatedForLlm?: boolean;
  /** Full char length of the (post-R9) LLM-bound content the Tier-1 cap saw — present whether or
   *  not truncated. NB: measures the PRETTY-PRINTED JSON.stringify(result, null, 2) string (the
   *  :420 serialization), so it will NOT match Tier-2's compact 50KB byte measure nor raw
   *  record.result when R9 rewrote the copy; failure records carry it too (error-JSON length). */
  resultChars?: number;
  /** R9 site-A observability (2026-07-26). Emit-only FACTS (Protocol 10). Names mirror site B's
   *  per-predecessor facts (context-chainer.ts:327-329) so one grep covers both boundaries.
   *
   *  PRESENCE MEANS "R9 EXAMINED THIS RESULT" (review 2026-07-26, aexec+sec-ops concurring), NOT
   *  "R9 rewrote it" — read `sanitized` for that. Absent means R9 never ran: flag off, tool wasn't
   *  `services`, or the call threw (success=false). This distinction IS the C1 dataset: a
   *  false-positive RATE needs a denominator, and the denominator is "records carrying
   *  `sanitized`". The first shape shipped today set the fields only when the sanitizer FIRED,
   *  which made a clean read indistinguishable from an unexamined one and left the rate
   *  uncomputable. Do NOT stamp these on non-`services` records: that would assert R9 inspected
   *  bytes it never saw — a fabricated fact, exactly what Protocol 10 forbids.
   *
   *  WHY AT ALL: site A rewrites device output BEFORE the Harvester's reasoner reads it, and
   *  formerly discarded the structured result — a false positive (`logging level
   *  system:informational`, `route-map SYSTEM:PREPEND`) silently corrupted the harvest with no
   *  log, no field and no counter.
   *
   *  CONSUMER RULE: branch on `sanitized` for "was this result rewritten" — NOT on
   *  `neutralizedCount` alone (a control-char-only strip is a real rewrite with count 0), and
   *  NEVER on the in-band marker string (advisory + attacker-spoofable —
   *  sanitize-chained-output.ts header). */
  sanitized?: boolean;
  neutralizedCount?: number;
  /** Chars removed by the normalize pass (zero-width/bidi/C0-C1/ANSI). Counted separately from
   *  `neutralizedCount`: a strip-only rewrite yields sanitized=true, neutralizedCount=0. */
  strippedControlChars?: number;
  /** Deduped injection CATEGORIES that fired (e.g. ['SYSTEM_MANIPULATION']). Categories only —
   *  the matched TEXT stays in the pino line and out of the artifact: it is attacker-controlled,
   *  and result.json is re-read by agents and rendered in the GUI viewer. */
  neutralizedCategories?: string[];
};
// ^ type alias (not interface) deliberately: downstream consumers type these
// as ToolCallEntry which carries an index signature, and TS only grants
// implicit index-signature compatibility to type aliases.

/** Anthropic tool_result content block (threaded into message history). */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id?: string;
  content: string;
  is_error?: true;
}

/** A single tool_use call from the LLM response (functionCalls[] entry). */
export interface LlmFunctionCall {
  id?: string;
  name: string;
  arguments: string;
}

/**
 * Injected dependencies (arch review A3) — kills the former per-turn
 * `await import('./mcp/serverManager')` and makes the turn body testable
 * with scripted fakes.
 */
export interface ToolTurnDeps {
  getToolDefinition: (name: string) => Promise<{ serverName: string } | null | undefined>;
  executeToolOnServer: (
    serverName: string,
    toolName: string,
    args: unknown,
    opts: { sessionId: string; userId: string; timeout: number }
  ) => Promise<unknown>;
  /** Pino-compatible. S2: never pass options/config objects — named scalars only. */
  logger: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

export interface ToolTurnContext {
  executionId: string;
  /** Tool-authz identity (sec-ops S4): falls back to 'system' — semantics
   *  carried unchanged from both former inline loops; flagged for a future
   *  hardening decision, do NOT widen. */
  userId?: string;
  turn: number;
}

/**
 * Per-path side effects (arch review A1): every observer is AWAITED so the
 * stream route's SSE event ordering relative to tool execution is preserved.
 * The stream's per-call PRE-announcement events (function_call SSE for all
 * calls before any executes) deliberately stay CALLER-side — modeling them
 * here as a per-tool callback would interleave announce/execute and change
 * the GUI event order.
 *
 * @param record        the pinned ToolCallRecord for this tool
 * @param fullContent   the FULL stringified result (pre Tier-1 truncation) —
 *                      the stream route derives its 2000-char SSE preview from this
 */
export interface ToolTurnObservers {
  onToolResult?: (record: ToolCallRecord, fullContent: string) => Promise<void> | void;
}

/**
 * Execute ALL tool calls for one agentic-loop turn. Behavior-identical to the
 * two former inline loops, with ONE documented unification: the failure warn
 * message is the engine's ('Tool execution failed, returning error to LLM');
 * the stream path formerly logged 'Tool execution failed in streaming'.
 *
 * Tool errors do NOT throw — they return as `is_error: true` tool_result
 * blocks so the LLM can adapt (P4 protocol rule).
 */
export async function executeToolTurn(
  functionCalls: LlmFunctionCall[],
  deps: ToolTurnDeps,
  ctx: ToolTurnContext,
  observers: ToolTurnObservers = {},
  pager?: PagerState
): Promise<{ toolResultBlocks: ToolResultBlock[]; toolCallRecords: ToolCallRecord[] }> {
  const toolResultBlocks: ToolResultBlock[] = [];
  const toolCallRecords: ToolCallRecord[] = [];

  for (const toolCall of functionCalls) {
    // read_more is served locally from the per-execution pager, BEFORE any tool dispatch. It is
    // injected into mcpFunctions (not a registered tool), so getToolDefinition would miss it —
    // this interception is its ONLY execution path. With no pager (older callers/tests) it falls
    // through and 404s at the getToolDefinition check below, the correct "not a real tool" behavior.
    if (pager && toolCall.name === 'read_more') {
      const { record, block } = pagerServe(pager, toolCall, ctx);
      toolCallRecords.push(record);
      toolResultBlocks.push(block);
      continue;
    }
    const toolDef = await deps.getToolDefinition(toolCall.name);
    let toolResultContent: string;
    let success = true;
    let record: ToolCallRecord;
    // Per-TOOL start time (D-C, 2026-06-10) — never turn-level.
    const toolStartTime = Date.now();

    try {
      if (!toolDef) throw new Error(`Tool '${toolCall.name}' not found in any server`);
      const parsedArgs = JSON.parse(toolCall.arguments);
      const toolResult = await deps.executeToolOnServer(
        toolDef.serverName, toolCall.name, parsedArgs,
        { sessionId: ctx.executionId, userId: ctx.userId || 'system', timeout: RUNTIME_LIMITS.TOOL_CALL_TIMEOUT_MS }
      );
      toolResultContent = JSON.stringify(toolResult, null, 2);
      record = {
        turn: ctx.turn, tool: toolCall.name, server: toolDef.serverName,
        arguments: parsedArgs, result: toolResult, success: true,
        durationMs: Date.now() - toolStartTime, timestamp: new Date().toISOString()
      };
    } catch (toolError) {
      success = false;
      const errorMsg = toolError instanceof Error ? toolError.message : 'Unknown error';
      toolResultContent = JSON.stringify({ error: errorMsg, tool: toolCall.name });
      record = {
        turn: ctx.turn, tool: toolCall.name, server: toolDef?.serverName,
        arguments: toolCall.arguments, error: errorMsg, success: false,
        durationMs: Date.now() - toolStartTime, timestamp: new Date().toISOString()
      };
      deps.logger.warn({ err: toolError, toolName: toolCall.name }, 'Tool execution failed, returning error to LLM');
    }
    toolCallRecords.push(record);

    // M2 fact-emitter (2026-07-17, panel decision): observation, NOT enforcement. The panel
    // declined to mint an embedded per-call timeout (every embedded p99 < 4s, zero attributable
    // hangs); this WARN generates the dataset that could someday EARN one. Threshold = 3× the
    // max organic embedded call ever observed. durationMs also persists in the artifact record,
    // so the evidence outlives log rotation.
    if (record.durationMs > RUNTIME_LIMITS.SLOW_TOOL_CALL_WARN_MS) {
      deps.logger.warn(
        { toolName: toolCall.name, server: record.server, durationMs: record.durationMs, executionId: ctx.executionId, success },
        'Slow tool call (observation threshold exceeded)'
      );
    }

    // A1: awaited — preserves SSE ordering for the stream route.
    if (observers.onToolResult) {
      await observers.onToolResult(record, toolResultContent);
    }

    // R9 (WS1 site A): neutralize untrusted connected-service output before it re-enters the
    // reasoner via the tool_result block. Gated to the `services` gateway (external/device output;
    // internal-tool JSON is first-party/trusted) + the rollout flag. The SSE observer above already
    // streamed the RAW value for operator transparency; only the LLM-bound copy is sanitized.
    // ENVELOPE (review 2026-06-24): toolResultContent is the whole JSON.stringify envelope, so
    // sanitize runs over the full document (field-level scoping deferred — needs the services
    // result shape; mcp-tool-architecture). SUCCESS-GATE: the isError-RETURNS failure path keeps
    // success=true and IS sanitized; only a genuine JS throw (success=false -> first-party SDK
    // error string at the catch above) is skipped — an accepted residual (sec IMP-1 / aexec I-2).
    // OBSERVABILITY (2026-07-26): the structured result was formerly DISCARDED here (`.text` only),
    // so a rewrite at the boundary closest to the device left no trace — no log, no record field,
    // no way to tell a mangled harvest from a clean one, and no way to measure the C1 false-positive
    // rate that gates the narrow-vs-mark-don't-mutate decision. Now recorded on both channels:
    // durable FACTS on the pinned record (outlive log rotation, same rationale as the M2 slow-tool
    // warn) + a pino line carrying the matched text for triage. Behaviour is UNCHANGED — this
    // observes the existing rewrite, it does not alter what the model sees.
    // DENOMINATOR (review 2026-07-26): the facts are stamped for EVERY result R9 examines, clean
    // ones included — presence = examined, `sanitized` = rewritten. The pino warn stays
    // firing-only (a clean read is not an operator event).
    if (success && toolCall.name === 'services' && process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED === 'true') {
      const r9 = sanitizeChainedOutput(toolResultContent);
      toolResultContent = r9.text;
      const categories = Array.from(new Set(r9.neutralizedInjections.map(n => n.category)));
      const rewrote = r9.neutralizedInjections.length > 0 || r9.strippedControlChars > 0;
      record.sanitized = rewrote;
      record.neutralizedCount = r9.neutralizedInjections.length;
      record.strippedControlChars = r9.strippedControlChars;
      if (categories.length > 0) record.neutralizedCategories = categories;
      if (rewrote) {
        // WARN not INFO: a firing is either a real injection attempt or a false positive that
        // corrupted harvested device state. Both warrant an operator's eye. Matches are truncated
        // (attacker-controlled, unbounded) and live ONLY here — never in the artifact.
        deps.logger.warn(
          {
            securityEvent: true,
            toolName: toolCall.name,
            server: record.server,
            executionId: ctx.executionId,
            turn: ctx.turn,
            neutralizedCount: r9.neutralizedInjections.length,
            neutralizedCategories: categories,
            strippedControlChars: r9.strippedControlChars,
            matches: r9.neutralizedInjections.slice(0, 5).map(n => n.match.slice(0, 60)),
          },
          'R9 sanitizer rewrote connected-service output before the reasoner (site A)'
        );
      }
    }

    // Tier-1 truncation: bound what feeds back to the LLM context window.
    // C2: the signal fields are set by MUTATING the record already pushed at the top of this
    // iteration (same object ref — lands in the returned array). NOTE the observer above ran
    // BEFORE this mutation, so the SSE tool_result_card never sees these fields — deliberate:
    // do NOT move the observer below this point, its fullContent must stay the RAW pre-sanitize
    // value (the stream preview invariant).
    // read_more capture (BLOCKING SO-C1): stash the FULL post-R9 string — THIS local, captured after
    // the R9 rewrite above and NOT record.result (the raw pre-R9 object) — so the model can page the
    // tail without a sanitizer bypass. Mint the ref BEFORE truncateForLlm so the notice advertises it.
    // Gate on success: a failed tool's short error JSON isn't pageable (no ref → scope-or-flag notice).
    let pagerRef: number | undefined;
    if (pager && success && toolResultContent.length > MAX_TOOL_RESULT_LENGTH) {
      pagerRef = pagerCapture(pager, toolResultContent);
    }
    const { text: truncated, truncated: wasTruncated, fullLength } = truncateForLlm(toolResultContent, pagerRef);
    record.resultTruncatedForLlm = wasTruncated;
    record.resultChars = fullLength;

    toolResultBlocks.push({
      type: 'tool_result' as const,
      tool_use_id: toolCall.id,
      content: truncated,
      ...(success ? {} : { is_error: true as const })
    });
  }

  return { toolResultBlocks, toolCallRecords };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: runAgenticToolLoop — the full agentic loop
// (implementation plan E3.1-E3.3; extracted verbatim from engine :780-1005 /
// stream :~640-995 at commit 9c051380). Subsumes: initial LLM call, P2
// provider-error check, the while loop (turn accounting, executeToolTurn,
// message threading, continuation calls, token accumulation, per-turn pino),
// and the #89 anti-fabrication correction turn.
//
// STAYS CALLER-SIDE (arch review A6): stop-reason handling, #90 diagnostic
// retry, the detection cascade, loopProgress percentage math (engine), SSE
// response streaming + logs[] entries (stream, via observers), and the
// AbortController timer (callers own setTimeout/clearTimeout; the loop only
// consumes the signal).
// ─────────────────────────────────────────────────────────────────────────────

/** Pino-compatible logger surface the loop needs (H3: message strings and
 *  field names below are a VERBATIM-carry contract — production runbooks
 *  grep for them). */
export interface LoopLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface AgenticLoopDeps extends Omit<ToolTurnDeps, 'logger'> {
  /** llmService.generateText (injected for scripted-fake equivalence tests). */
  generateText: (prompt: string, options: LLMRequestOptions, userId?: string) => Promise<any>;
  logger: LoopLogger;
}

export interface AgenticLoopInput {
  prompt: string;
  /** Normalized ONCE by the caller (B1). S2: log-forbidden — carries raw apiKey. */
  cfg: NormalizedModelConfig;
  mcpFunctions?: LLMRequestOptions['functions'];
  /** Resolved by the CALLER (drift D-F: the two paths resolve this from
   *  different template sources — the loop takes the number, callers own the
   *  source). Prod harness template uses 100. */
  maxToolTurns: number;
  signal: AbortSignal;
  executionId: string;
  taskId: string;
  userId?: string;
}

/** All observers AWAITED (A1). The stream route wires SSE + logs[] here;
 *  the engine wires EventEmitter progress events. */
export interface AgenticLoopObservers extends ToolTurnObservers {
  /** After the initial LLM call AND the P2 check (a P2 throw emits nothing). */
  onInitialResponse?: (response: any, llmDurationMs: number) => Promise<void> | void;
  /** After the per-turn 'starting turn' pino, before tool execution — the
   *  stream route emits its function_call pre-announcements here. */
  onTurnStart?: (turn: number, functionCalls: LlmFunctionCall[]) => Promise<void> | void;
  /** After ALL tools of the turn executed + message history threaded, BEFORE
   *  the continuation LLM call — the stream route flushes its log_update here
   *  so the GUI shows tool outcomes during the (potentially long) LLM wait. */
  onTurnToolsComplete?: (turn: number) => Promise<void> | void;
  /** After the continuation LLM call + token accumulation. */
  onTurnComplete?: (turn: number, info: { toolDurationMs: number; llmDurationMs: number; response: any }) => Promise<void> | void;
  /** #89 correction turn is about to run. */
  onCorrectionStart?: (failedToolCalls: number) => Promise<void> | void;
  /** #89 correction produced a non-empty replacement (correctionTurnUsed=true). */
  onCorrectionComplete?: (correctedResponse: any) => Promise<void> | void;
}

export interface AgenticLoopResult {
  /** The final LLM response (post-correction if #89 fired). Callers apply
   *  stop-reason handling and #90 to this. */
  currentResponse: any;
  toolCallResults: ToolCallRecord[];
  messageHistory: any[];
  totalUsage: AccumulatedUsage;
  turnCount: number;
  /** H2 invariant: captured at loop exit, PRE-correction — `stopReason ===
   *  'tool_use' && turnCount >= maxToolTurns`. (#89 only fires on end_turn so
   *  the two are mutually exclusive, but the capture point is pinned anyway.)
   *  NOTE: the result.json `toolLoop.hitMaxTurns` artifact field remains
   *  caller-computed as `turnCount >= maxToolTurns` (count-only), unchanged. */
  hitMaxTurns: boolean;
  correctionTurnUsed: boolean;
  /** Budget fail-fast (2026-07-04): an all-budget-rejected tool turn switched the continuation
   *  call to a final no-tools blocked-report turn (or its synthesized degrade). */
  budgetFailFastUsed: boolean;
  /** R4 Layer 1 (2026-07-16): a 'full' turn truncated at max_tokens with empty text and was
   *  re-issued once with raised maxTokens. `Recovered` = the retry produced text or a tool_use. */
  truncationRetryUsed: boolean;
  truncationRetryRecovered: boolean;
  /** Phase 2 (2026-07-05, C-1 resolution): the deliverable text = the FINAL turn's
   *  raw text (post-#89 correction, since `currentResponse` is replaced on correction).
   *  This is the SINGLE deliverable-text source both execution paths consume, so the
   *  engine (which always used last-turn `currentResponse.text`) and the stream
   *  (which formerly ACCUMULATED across turns) converge on identical deliverable text.
   *  It equals `currentResponse.text` verbatim — engine output stays byte-identical;
   *  the stream's saved deliverable changes from accumulated to last-turn. Callers still
   *  apply `finalizeTextForStopReason` + the #90 diagnostic-retry override to this. */
  assembledText: string;
}

/**
 * Run the full agentic tool loop. Behavior-identical to the two former inline
 * implementations, with these DOCUMENTED unifications (all cosmetic):
 *  - threading-error text uses the engine's em-dash variant
 *  - correction 'completed' pino carries the engine's richer field set
 *  - per-turn toolDurationMs starts AFTER onTurnStart observers (engine
 *    semantics; the stream formerly started its clock before its SSE writes)
 *  - the stream's initial-timing logs[] entry now happens after the P2 check
 *    (via onInitialResponse) instead of before it
 *  - the abort TIMER (caller-owned) now spans the correction turn on the
 *    engine path too (the stream always had it; the engine formerly cleared
 *    in a finally before #89 — converged to the safer placement)
 */
/**
 * R4 Layer 1 — in-loop truncation retry with headroom. When a `'full'` turn stops at `max_tokens`
 * with NO text (Sonnet-5 runs adaptive extended thinking BY DEFAULT, billed as output against
 * max_tokens; a heavy final turn can exhaust the ceiling mid-thinking → the R2 `TRUNCATED_NO_OUTPUT`
 * root cause), re-issue the IDENTICAL request ONCE with a raised `maxTokens`. The truncated turn is an
 * unsigned partial thinking block that cannot be re-submitted as conversation history, so the only
 * clean recovery is discard + re-ask with more room — done IN-LOOP so the retry's response flows back
 * through the normal while-guard (`tool_use` → the loop executes `task.complete`; `end_turn` → exit),
 * meaning a harness SYNTHESIZE actually reaches completion instead of stalling. Bounded ONCE per
 * execution (shared `state` across the three `'full'` sites; the retry does NOT push the truncated
 * turn to history and does NOT increment turnCount — it replaces a failed turn). Non-fatal: on
 * throw/abort/empty the truncated original is returned → the loop exits → R2 fires → Layer 2
 * escalates. The truncated attempt's usage is folded via `foldPriorUsage` (BYOK accounting of the
 * sunk thinking tokens). @see cline_docs/reviews/truncation-r4-2026-07-16/synthesis.md
 */
async function maybeRetryTruncatedFullTurn(
  response: any,
  state: { used: boolean; recovered: boolean },
  perCall: PerCallOptions,
  ctx: { prompt: string; cfg: NormalizedModelConfig; userId?: string; executionId: string },
  deps: AgenticLoopDeps,
  foldPriorUsage: (usage?: PartialUsage) => void,
): Promise<any> {
  const emptyText = !(((response?.text as string) ?? '').trim());
  if (response?.stopReason !== 'max_tokens' || !emptyText || state.used) return response;
  state.used = true;
  // cfg is post-normalize (model resolved-or-thrown upstream); the guard is a type-safe fallback —
  // if a ceiling can't be resolved, don't raise (retryMax = maxTokens = no headroom, harmless).
  const ceiling = ctx.cfg.model ? capabilitiesFor(ctx.cfg.model).outputCeiling : ctx.cfg.maxTokens;
  const retryMaxTokens = Math.min(ctx.cfg.maxTokens * 2, ceiling);
  deps.logger.warn(
    { executionId: ctx.executionId, truncatedOutputTokens: response?.usage?.outputTokens, retryMaxTokens },
    'R4 Layer 1: full turn truncated at max_tokens with empty text — retrying once with raised maxTokens'
  );
  try {
    const retry = await deps.generateText(
      ctx.prompt,
      buildLlmCallOptions({ ...ctx.cfg, maxTokens: retryMaxTokens }, 'full', perCall),
      ctx.userId,
    );
    // Fold the sunk truncated-attempt usage ONLY on success: on success the caller folds the RETRY's
    // usage (retry ≠ response) so both count once; on throw we return the ORIGINAL and the caller folds
    // it via its normal accumulation, so folding here too would double-count (ae-r4v Finding 1).
    foldPriorUsage(response?.usage);
    state.recovered = !!(((retry?.text as string) ?? '').trim()) || retry?.stopReason === 'tool_use';
    deps.logger.info(
      { executionId: ctx.executionId, recovered: state.recovered, retryStopReason: retry?.stopReason,
        retryOutputTokens: retry?.usage?.outputTokens },
      'R4 Layer 1: truncation retry completed'
    );
    return retry;
  } catch (err) {
    deps.logger.warn(
      { executionId: ctx.executionId, err: err instanceof Error ? err.message : String(err) },
      'R4 Layer 1: truncation retry threw — keeping the truncated response (→ R2 → Layer 2)'
    );
    return response;
  }
}

export async function runAgenticToolLoop(
  input: AgenticLoopInput,
  deps: AgenticLoopDeps,
  observers: AgenticLoopObservers = {}
): Promise<AgenticLoopResult> {
  const { prompt, cfg, mcpFunctions, maxToolTurns, signal, executionId, taskId, userId } = input;

  // R4 Layer 1 state — shared across the three 'full' call sites; the truncation retry fires at most
  // ONCE per execution.
  const truncationRetry = { used: false, recovered: false };
  let initialTruncatedPriorUsage: PartialUsage | undefined = undefined;

  // ── Initial LLM call ──
  const initialLlmStart = Date.now();
  let llmResponse = await deps.generateText(prompt, buildLlmCallOptions(cfg, 'full', {
    signal,
    mcpFunctions,
  }), userId);
  // R4 Layer 1: retry a truncated INITIAL turn (its prior usage is folded once totalUsage exists, below).
  llmResponse = await maybeRetryTruncatedFullTurn(
    llmResponse, truncationRetry, { signal, mcpFunctions },
    { prompt, cfg, userId, executionId }, deps, (u) => { initialTruncatedPriorUsage = u; },
  );
  const initialLlmDurationMs = Date.now() - initialLlmStart;

  // ── TURN NUMBERING CONTRACT (documented 2026-08-10; do NOT renumber) ──────────
  //   turn: 0    — THIS call. The initial LLM call, made BEFORE the loop, no tools executed yet.
  //   turn: 1..N — tool turns. `turnCount` starts at 0 and is incremented at the TOP of each
  //                loop iteration, so the FIRST tool turn is turn 1.
  // `turn: 1` is therefore ALREADY TAKEN. "Renumbering" this call to 1 collides two distinct
  // events onto one number — a real proposal on 2026-08-10, caught only by reading the increment
  // site first. Anyone querying "the first LLM call" wants **turn 0**.
  //
  // Cache counters are logged per turn so cross-execution cache behaviour is observable at all;
  // before this, cache reads/writes were visible ONLY as a per-execution sum in agent_executions,
  // which cannot distinguish a turn-1 prefix read from accumulated message-tail reads.
  // ⚠️ log level must stay `info`: prod resolves to info (lib/logger.ts:5) and LOG_LEVEL is set
  // nowhere in the deploy, so a `debug` line emits NOTHING in production.
  deps.logger.info({
    executionId, llmDurationMs: initialLlmDurationMs,
    inputTokens: llmResponse.usage?.inputTokens, outputTokens: llmResponse.usage?.outputTokens,
    cacheReadTokens: llmResponse.usage?.cacheReadTokens,
    cacheCreationTokens: llmResponse.usage?.cacheCreationTokens,
    model: cfg.model,
    stopReason: llmResponse.stopReason, turn: 0,
  }, 'Initial LLM call completed');

  // ── P2: early error detection ──
  // The provider catches SDK errors and returns {text: '', error: {...}}
  // rather than throwing — historically this hid auth failures, model-ID
  // rejections, and rate limits as generic "empty response" symptoms. Fail
  // loud with the real cause (see 2026-04-15 Demo Financial incident).
  if ((llmResponse as any)?.error?.message) {
    const apiErrMsg = (llmResponse as any).error.message;
    const apiErrCode = (llmResponse as any).error.code;
    deps.logger.error(
      {
        executionId,
        taskId,
        provider: llmResponse.provider,
        apiErrorCode: apiErrCode,
        apiErrorMessage: apiErrMsg,
        apiErrorDetails: (llmResponse as any).error.details,
      },
      'LLM provider returned error response — surfacing directly (was previously masked as empty-content)'
    );
    // WU-7 (SDK Phase 2): throw AppError carrying `.code` so the engine's errCode→errorCategory
    // plumbing (agentExecutionEngine errCode = error.code) surfaces the real category on error.json —
    // e.g. CONTEXT_WINDOW_EXCEEDED (the provider sets it for a model_context_window_exceeded 400),
    // plus any other provider code. Previously a plain Error hid the code in the message string only,
    // so errorCategory was always undefined for provider-layer failures.
    throw new AppError(
      `LLM call failed at provider layer: ${apiErrMsg}` +
        (apiErrCode ? ` (code: ${apiErrCode})` : '') +
        `. See pino logs for full error details.`,
      apiErrCode || 'LLM_PROVIDER_ERROR'
    );
  }

  if (observers.onInitialResponse) {
    await observers.onInitialResponse(llmResponse, initialLlmDurationMs);
  }

  // ── The loop ──
  const toolCallResults: ToolCallRecord[] = [];
  // read_more pager (Phase 1, memory-backed) — per-execution, S1-local. Truncated results stash their
  // full post-R9 string here; the model pages them via read_more (injected into mcpFunctions at the
  // two build sites, served by the name-interceptor in executeToolTurn). See READ_MORE_FUNCTION_DEF.
  const pager = createPagerState(maxToolTurns);
  const totalUsage = newAccumulatedUsage(llmResponse.usage);
  // R4 Layer 1: fold the sunk truncated-initial-turn usage now that totalUsage exists.
  if (initialTruncatedPriorUsage) addUsage(totalUsage, initialTruncatedPriorUsage);
  let currentResponse = llmResponse;
  const messageHistory: Array<any> = [{ role: 'user', content: prompt }];
  let turnCount = 0;
  // Budget fail-fast flag (follow-ups item 2): set when an all-budget-rejected turn switched
  // the continuation call into the final no-tools blocked-report turn.
  let budgetFailFastUsed = false;

  while (((currentResponse.stopReason === 'tool_use' && currentResponse.functionCalls?.length) ||
          currentResponse.stopReason === 'pause_turn') &&
         turnCount < maxToolTurns) {
    turnCount++;

    // WU-6 (SDK Phase 2): pause_turn — the model paused mid-turn (e.g., a long server-side tool such
    // as web_search). There are NO client tools to execute; re-send the accumulated assistant content
    // so the model continues. Without this branch pause_turn falls out of the loop and the execution
    // SILENTLY TRUNCATES at the pause point (agent-execution C2). Bounded by the same maxToolTurns cap.
    if (currentResponse.stopReason === 'pause_turn') {
      if (!currentResponse.rawContentBlocks) {
        throw new Error('rawContentBlocks missing on pause_turn — cannot continue the paused turn');
      }
      deps.logger.info({ executionId, turn: turnCount }, 'Agentic tool loop: continuing paused turn (pause_turn)');
      messageHistory.push({ role: 'assistant', content: currentResponse.rawContentBlocks });
      currentResponse = await deps.generateText(prompt, buildLlmCallOptions(cfg, 'full', {
        signal,
        mcpFunctions,
        messages: messageHistory as any,
      }), userId);
      currentResponse = await maybeRetryTruncatedFullTurn(
        currentResponse, truncationRetry, { signal, mcpFunctions, messages: messageHistory as any },
        { prompt, cfg, userId, executionId }, deps, (u) => addUsage(totalUsage, u),
      );
      addUsage(totalUsage, currentResponse.usage);
      continue;
    }

    // tool_use path — functionCalls is guaranteed non-empty by the while-guard above.
    const turnFunctionCalls = currentResponse.functionCalls!;
    deps.logger.info({ executionId, turn: turnCount, toolCount: turnFunctionCalls.length },
      'Agentic tool loop: starting turn');

    if (observers.onTurnStart) {
      await observers.onTurnStart(turnCount, turnFunctionCalls);
    }

    const toolPhaseStartTime = Date.now();

    const { toolResultBlocks, toolCallRecords } = await executeToolTurn(
      turnFunctionCalls,
      { getToolDefinition: deps.getToolDefinition, executeToolOnServer: deps.executeToolOnServer, logger: deps.logger },
      { executionId, userId, turn: turnCount },
      observers,
      pager
    );
    toolCallResults.push(...toolCallRecords);

    // Budget fail-fast (follow-ups item 2, reviewed 2026-07-04 at 92/93%): every tool call in
    // THIS turn was budget-rejected. The per-user hourly window will not admit these calls for
    // the rest of the window — another 'full' continuation turn can only bill a full-history
    // LLM call to watch identical rejections (observed live: 183K tokens over 4 such turns).
    // Predicate is strict-every on the TURN-LOCAL records (reviewed §5: a mixed turn proves the
    // window still has headroom for smaller calls — the run is not dead; do not widen without
    // prod evidence). The mode-switch below turns the EXISTING continuation call into one final
    // no-tools blocked-report turn; the loop then exits through the normal end_turn while-guard.
    const allBudgetRejected = toolCallRecords.length > 0 &&
      toolCallRecords.every(r => !r.success && typeof r.error === 'string' && BUDGET_ERROR_PATTERN.test(r.error));

    // Build message history with content blocks
    if (!currentResponse.rawContentBlocks) {
      throw new Error('rawContentBlocks missing from LLM response — cannot thread tool conversation');
    }
    messageHistory.push({ role: 'assistant', content: currentResponse.rawContentBlocks });
    // Fail-fast: thread the blocked-report request INSIDE the tool-results user message
    // (tool_results first, then text — the documented mixed-content shape; avoids
    // consecutive user messages).
    messageHistory.push({
      role: 'user',
      content: allBudgetRejected
        ? [...toolResultBlocks, { type: 'text', text: buildBudgetBlockedReportPrompt(toolCallRecords) }]
        : toolResultBlocks,
    });

    if (observers.onTurnToolsComplete) {
      await observers.onTurnToolsComplete(turnCount);
    }

    // Next LLM call WITH tool definitions AND signal — or, on budget fail-fast, the final
    // no-tools blocked-report turn ('reflection' hardcodes functions:[] + functionCall:'none';
    // omitting mcpFunctions is belt-and-braces). Degrade-to-(a): on throw, provider error, or
    // empty text, synthesize the terminal (non-fatal catch mirrors #89's — the tool records
    // already carry the forensics; do not fail the run over a lost report-polish call).
    const toolPhaseDurationMs = Date.now() - toolPhaseStartTime;
    const llmStartTime = Date.now();
    if (allBudgetRejected) {
      deps.logger.warn({ executionId, turn: turnCount, rejectedToolCalls: toolCallRecords.length },
        'Agentic tool loop: budget fail-fast — all tool calls this turn budget-rejected; requesting blocked report (no tools)');
      budgetFailFastUsed = true;
      try {
        currentResponse = await deps.generateText(prompt, buildLlmCallOptions(cfg, 'reflection', {
          signal,
          messages: messageHistory as any,
        }), userId);
      } catch (failFastErr) {
        deps.logger.warn({ executionId, turn: turnCount, err: failFastErr instanceof Error ? failFastErr.message : String(failFastErr) },
          'Agentic tool loop: budget fail-fast blocked-report turn failed — synthesizing terminal');
        currentResponse = null;
      }
      if (!currentResponse?.text?.trim() || currentResponse?.error) {
        const synthText = synthBlockedText(toolCallRecords, turnCount);
        currentResponse = {
          stopReason: 'end_turn',
          text: synthText,
          rawContentBlocks: [{ type: 'text', text: synthText }],
          usage: currentResponse?.usage,
        };
      }
    } else {
      currentResponse = await deps.generateText(prompt, buildLlmCallOptions(cfg, 'full', {
        signal,
        mcpFunctions,
        messages: messageHistory as any,
      }), userId);
      // R4 Layer 1: retry a truncated continuation turn (prior usage folded here; the retry's usage
      // is folded by the shared addUsage below).
      currentResponse = await maybeRetryTruncatedFullTurn(
        currentResponse, truncationRetry, { signal, mcpFunctions, messages: messageHistory as any },
        { prompt, cfg, userId, executionId }, deps, (u) => addUsage(totalUsage, u),
      );
    }
    const llmDurationMs = Date.now() - llmStartTime;

    // turn: 1..N — tool turns (see the numbering contract at the initial-call log above;
    // turn 0 is that call, so these start at 1). Cache counters logged per turn for the same
    // reason: a per-execution sum cannot separate a prefix read from message-tail reads.
    deps.logger.info({
      executionId, turn: turnCount,
      toolDurationMs: toolPhaseDurationMs, llmDurationMs,
      inputTokens: currentResponse.usage?.inputTokens, outputTokens: currentResponse.usage?.outputTokens,
      cacheReadTokens: currentResponse.usage?.cacheReadTokens,
      cacheCreationTokens: currentResponse.usage?.cacheCreationTokens,
      model: cfg.model,
      stopReason: currentResponse.stopReason,
    }, 'Agentic tool loop: turn completed');

    // Accumulate tokens (input/output + cache — see addUsage)
    addUsage(totalUsage, currentResponse.usage);

    if (observers.onTurnComplete) {
      await observers.onTurnComplete(turnCount, { toolDurationMs: toolPhaseDurationMs, llmDurationMs, response: currentResponse });
    }
  }

  // H2 invariant: capture PRE-correction. (#89 requires end_turn, so it cannot
  // flip this — pinned here regardless so a future refactor can't reorder it.)
  const hitMaxTurns = currentResponse.stopReason === 'tool_use' && turnCount >= maxToolTurns;

  // ── Task #89: anti-fabrication correction turn ──
  // When the LLM exits with end_turn AND tool calls failed, the narrative
  // often claims success contradicting the tool log (artifact-synthesis
  // 2026-04-16 incident). Trigger: end_turn + ≥1 failed tool + non-empty text
  // + NOT already budget-exhausted (regexes tuned to production error strings
  // — carry verbatim, per pipeline-harness review H1).
  let correctionTurnUsed = false;
  const _failedToolCallsForCorrection = toolCallResults.filter(t => !t.success);
  // (Budget fail-fast guarantees this flag on its path — the two features are coupled: a
  // fail-fast run always carries budget-rejected records, so #89 never adds a second call.)
  const _budgetExhaustedAlready = _failedToolCallsForCorrection.some(
    t => typeof t.error === 'string' && BUDGET_ERROR_PATTERN.test(t.error)
  );
  if (
    _failedToolCallsForCorrection.length > 0 &&
    currentResponse?.stopReason === 'end_turn' &&
    currentResponse?.text &&
    currentResponse.text.trim().length > 0 &&
    !_budgetExhaustedAlready
  ) {
    try {
      const failureList = _failedToolCallsForCorrection
        .map((t, i) => `${i + 1}. **${t.tool}** (turn ${t.turn ?? '?'}): ${t.error || 'unknown error'}`)
        .join('\n');
      const successCount = toolCallResults.length - _failedToolCallsForCorrection.length;
      const correctionPrompt =
        `**Ground-truth check before final response.**\n\n` +
        `Of the ${toolCallResults.length} tool calls in this execution, ${successCount} succeeded and ${_failedToolCallsForCorrection.length} failed:\n\n` +
        `${failureList}\n\n` +
        `Your previous response may have claimed actions or outcomes that did not actually happen — review it against the failures above and rewrite it so the narrative matches reality.\n\n` +
        `**Constraints:**\n` +
        `- Do not call any tools — none are available on this turn.\n` +
        `- Do not retry the failed actions; just describe accurately what completed and what did not.\n` +
        `- If the failures changed the outcome materially, say so explicitly (e.g., "X was attempted but failed because Y").\n` +
        `- Keep the structure and tone of your previous response; only correct the parts that were inaccurate.`;

      // Append the model's previous answer + the correction request.
      messageHistory.push({ role: 'assistant', content: currentResponse.rawContentBlocks ?? currentResponse.text });
      messageHistory.push({ role: 'user', content: [{ type: 'text', text: correctionPrompt }] });

      deps.logger.info({ executionId, failedToolCalls: _failedToolCallsForCorrection.length, totalToolCalls: toolCallResults.length },
        'Anti-fabrication correction turn: requesting narrative reconciliation');

      if (observers.onCorrectionStart) {
        await observers.onCorrectionStart(_failedToolCallsForCorrection.length);
      }

      const correctionStartTime = Date.now();
      // 'reflection' mode: functions [] + functionCall 'none' structurally
      // prevent loop re-entry; no thinking on a simple rewrite.
      const correctedResponse = await deps.generateText(prompt, buildLlmCallOptions(cfg, 'reflection', {
        signal,
        messages: messageHistory as any,
      }), userId);
      const correctionDurationMs = Date.now() - correctionStartTime;

      if (correctedResponse?.text && correctedResponse.text.trim().length > 0) {
        // Accumulate correction-turn tokens (NOT counted toward maxToolTurns — H2)
        addUsage(totalUsage, correctedResponse.usage);
        // Replace currentResponse so the callers' stopReason branching picks
        // up the corrected text via the same code path.
        currentResponse = correctedResponse;
        correctionTurnUsed = true;
        deps.logger.info({
          executionId,
          correctionDurationMs,
          correctedInputTokens: correctedResponse.usage?.inputTokens,
          correctedOutputTokens: correctedResponse.usage?.outputTokens,
          correctedStopReason: correctedResponse.stopReason,
        }, 'Anti-fabrication correction turn: completed');
        if (observers.onCorrectionComplete) {
          await observers.onCorrectionComplete(correctedResponse);
        }
      } else {
        deps.logger.warn({ executionId, correctionDurationMs },
          'Anti-fabrication correction turn returned empty — keeping original response');
      }
    } catch (correctionErr) {
      // Non-fatal: keep original response, log for forensics. The downstream
      // executionDegradation signals (P3/P4/P5) will still flag the artifact.
      deps.logger.warn({ err: correctionErr as any, executionId },
        'Anti-fabrication correction turn failed — keeping original response');
    }
  }

  return { currentResponse, assembledText: currentResponse.text, toolCallResults, messageHistory, totalUsage, turnCount, hitMaxTurns, correctionTurnUsed, budgetFailFastUsed, truncationRetryUsed: truncationRetry.used, truncationRetryRecovered: truncationRetry.recovered };
}
