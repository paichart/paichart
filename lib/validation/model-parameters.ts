/**
 * Shared model-parameters schema — single source of truth for the validated
 * shape of `modelParameters` across every write path (REST agent.execute,
 * MCP agent.configure, nested task input). Co-locates the runtime ceilings
 * (RUNTIME_LIMITS) so a value that passes validation cannot exceed what the
 * execution engine / LLM API will honor at runtime.
 *
 * Two exports for the two prior postures:
 *  - ModelParametersSchema            — strict (z.object default: unknown keys
 *                                       stripped). Drop-in where the prior schema
 *                                       was a closed z.object
 *                                       (AgentExecuteSchema.parameters).
 *  - ModelParametersPassthroughSchema — passthrough + stripDangerousKeys, the
 *                                       drop-in for safeRecord()/safePassthrough()
 *                                       write paths (task-shapes, mcp-action) that
 *                                       historically stored forward-compat keys.
 *                                       Caps the KNOWN keys, preserves unknown
 *                                       keys, strips __proto__/constructor/prototype
 *                                       (BC27 prototype-pollution defense).
 *
 * Discovery: .claude/knowledge/discoveries/runtime-limits-discovery.md
 */
import { z } from 'zod';
import { stripDangerousKeys } from '@/lib/utils/sanitize-keys';
import { RUNTIME_LIMITS } from './runtime-limits';

/**
 * The capped known modelParameters fields — the LLM-CALL params (passed to the
 * Anthropic API per call): model, temperature, maxTokens, topP, thinkingBudget.
 * These are template-default + per-task overridable. `systemPrompt`/`useSystemPrompt`
 * are NOT listed (they carry through the passthrough variant unchanged).
 *
 * `maxToolTurns` is DELIBERATELY ABSENT (D-1, 2026-06-18). It is an ORCHESTRATION/
 * budget param — it shapes the engine's agentic loop + executionTimeoutMs
 * (180_000 + turns*30_000), and is never sent to the LLM. It is read from the
 * TEMPLATE row only (agentExecutionEngine.ts:765, stream/route.ts:613), so the
 * template author owns it. Per-task writes are now REJECTED with a clear signal
 * (rejectTemplateControlledKeys) instead of the prior silent-accept-and-ignore.
 * (Verified 2026-06-18: nothing in the codebase sends maxToolTurns on a write
 * path — the reject is a signal change with zero functional regression.)
 */
const modelParametersShape = {
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  // Schema admits up to the GLOBAL max (Opus 128K); the runtime clamp
  // (maxOutputTokensForModel at normalizeModelConfig) enforces the real per-model
  // ceiling. The schema can't see the resolved model, so capping at 64K here would
  // reject a legitimate Opus request (the static-cap under-cap). 2026-06-18.
  maxTokens: z.number().int().min(1).max(RUNTIME_LIMITS.MAX_OUTPUT_TOKENS_OPUS).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  // stopSequences (2026-06-20 shape sweep): a real model-tuning param (→ `stop_sequences`, carried by
  // NormalizedModelConfig + LLMRequestOptions + buildAnthropicRequest) that was NOT a known key — so it
  // was stripped on the strict agent.execute path and unvalidated on passthrough. Now a capped known key
  // (consistent handling on both paths). Bounded for DoS (Anthropic accepts only a few short sequences).
  stopSequences: z.array(z.string().max(500)).max(20).nullable().optional(),
  // effort (SDK Phase 2, WU-2): reasoning depth → output_config.effort. An LLM-CALL param
  // (template-default + task-overridable) — deliberately NOT in rejectTemplateControlledKeys.
  // Capped enum here; the provider drops/clamps it per-model via the capability map (Haiku
  // omits it; xhigh/max gated per tier).
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).nullable().optional(),
  thinkingBudgetTokens: z.number().int().min(0).max(RUNTIME_LIMITS.MAX_OUTPUT_TOKENS_OPUS).nullable().optional(),
  // webSearch/cacheControl are OBJECTS at runtime (LLMRequestOptions + the Agent Builder form),
  // not booleans — the prior z.boolean() 400'd any task that configured either via the form
  // ("Expected boolean, received object"), the same class of bug as inputContext. Accept the
  // canonical object shape (mirrors lib/services/llm/types.ts LLMRequestOptions); keep boolean as
  // a backward-compat legacy on/off toggle; nullable for the form's `null` empty state. 2026-06-19.
  webSearch: z.union([
    z.boolean(),
    z.object({
      maxUses: z.number().int().min(1).max(50).optional(),
      allowedDomains: z.array(z.string()).max(100).optional(),
      blockedDomains: z.array(z.string()).max(100).optional(),
      userLocation: z.object({ type: z.literal('approximate') }).passthrough().optional(),
    }),
  ]).nullable().optional(),
  // Finding G (2026-07-08): narrowed to the real Anthropic API shape — 'persistent'/'id' were
  // never valid wire values (they 400). Booleans stay: true = legacy on, false = the explicit
  // opt-out sentinel (the GUI writes false on toggle-off; null/absent = default-ON at
  // normalizeCacheControl). Prod audit: zero stored 'persistent' values exist.
  cacheControl: z.union([
    z.boolean(),
    z.object({
      type: z.literal('ephemeral'),
    }),
  ]).nullable().optional(),
  functions: z.any().nullable().optional(),
  functionCall: z.any().nullable().optional(),
};

const KNOWN_KEYS = Object.keys(modelParametersShape);
/** The known model-parameter keys (RWF D1): the ONLY modelParameters keys a pipeline child's agent.execute may carry. */
export const MODEL_PARAMETER_KEYS: readonly string[] = KNOWN_KEYS;

/**
 * D-1 template-lock (2026-06-18): reject orchestration/budget params the template
 * author owns from any per-task/execution write path, with a clear client-facing
 * signal (Protocol 10 — a fact, not a silent-ignore). Today that's `maxToolTurns`;
 * `maxRetries`/`timeout` live in their own schemas — add them here only if they
 * ever migrate into modelParameters.
 */
function rejectTemplateControlledKeys(data: unknown, ctx: z.RefinementCtx): void {
  if (data && typeof data === 'object' && (data as Record<string, unknown>).maxToolTurns != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxToolTurns'],
      message:
        'maxToolTurns is controlled by the agent template, not per task/execution — set it on the template metadata.',
    });
  }
}

/**
 * X15 (RWF, 2026-09-27; sec-ops D1 review F1): keys the EXECUTION CONFIG owns, which a modelParameters object must never
 * carry. agentTaskService builds the config as `{ agentRole, prompt, inputContext, …, priority, ...modelParameters }`, so
 * a modelParameters `prompt`/`agentRole` silently REPLACED the task's directive and role (the engine reads
 * config.agentRole; the prompt body reads config.prompt). Rejected loudly at every write/override boundary that uses these
 * schemas (Protocol 10: a clear signal, never a silent strip), and stripped again in agentTaskService for anything
 * already stored. Measured 2026-09-27: 0 tasks, 0 templates, 0 executions (60d) carry any of them.
 * NOT here: `systemPrompt`/`useSystemPrompt`/`maxRetries`/`timeout` — the template path puts those in modelParameters on
 * purpose (template-model-params.ts), and 50 tasks store systemPrompt legitimately.
 */
export const EXECUTION_IDENTITY_KEYS = ['agentRole', 'prompt', 'inputContext', 'priority'] as const;

function rejectExecutionIdentityKeys(data: unknown, ctx: z.RefinementCtx): void {
  if (!data || typeof data !== 'object') return;
  for (const k of EXECUTION_IDENTITY_KEYS) {
    // PRESENCE, not non-null (boundary-contract B1): `prompt: null` spread over the config blanks the task's directive.
    if (Object.prototype.hasOwnProperty.call(data, k) && (data as Record<string, unknown>)[k] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message: `modelParameters.${k} is not a model parameter — it would replace the execution's ${k}. Set ${k} on the task (or, for agent.execute, as overrideConfig.${k}).`,
      });
    }
  }
}

/** Restore strict strip-unknowns after passthrough+refine (drops any key not in the cap list). */
const pickKnownKeys = (obj: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of KNOWN_KEYS) if (k in obj) out[k] = obj[k];
  return out;
};

/**
 * Strict (AgentExecuteSchema.parameters): rejects template-controlled keys (clean
 * 400) and strips all other unknowns — same closed-shape result as the prior
 * `z.object`, plus the maxToolTurns signal.
 */
/**
 * X16 nested (validation-engine F1): `maxRetries`/`timeout` are NOT model parameters (not in the shape — adding them would
 * put them on the pipeline-child allowlist), but they ride inside modelParameters on the template path and are spread OVER
 * the bounded top-level values. Bound their TYPE and SIZE here, unit-agnostically: a nested timeout is in seconds on the
 * template path (stored 300–900) and may be ms elsewhere. null passes (readers use `??`).
 */
function boundNestedRunControls(data: unknown, ctx: z.RefinementCtx): void {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;
  const bad = (k: string, msg: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: msg });
  if (d.maxRetries != null && !(Number.isInteger(d.maxRetries) && (d.maxRetries as number) >= 0 && (d.maxRetries as number) <= RUNTIME_LIMITS.MAX_RETRIES)) {
    bad('maxRetries', `modelParameters.maxRetries must be an integer 0..${RUNTIME_LIMITS.MAX_RETRIES}`);
  }
  if (d.timeout != null && !(Number.isInteger(d.timeout) && (d.timeout as number) >= 1 && (d.timeout as number) <= RUNTIME_LIMITS.MAX_TASK_TIMEOUT_MS)) {
    bad('timeout', `modelParameters.timeout must be an integer 1..${RUNTIME_LIMITS.MAX_TASK_TIMEOUT_MS}`);
  }
}

export const ModelParametersSchema = z
  .object(modelParametersShape)
  .passthrough()
  .superRefine(rejectTemplateControlledKeys)
  .superRefine(rejectExecutionIdentityKeys)
  .superRefine(boundNestedRunControls)
  .transform(pickKnownKeys);

/**
 * Passthrough + proto-strip: caps the known keys, rejects template-controlled
 * keys, preserves unknown forward-compat keys, strips dangerous keys. Drop-in for
 * the safeRecord()/safePassthrough() task-config write paths.
 */
export const ModelParametersPassthroughSchema = z
  .object(modelParametersShape)
  .passthrough()
  .superRefine(rejectTemplateControlledKeys)
  .superRefine(rejectExecutionIdentityKeys)
  .superRefine(boundNestedRunControls)
  .transform(stripDangerousKeys);
