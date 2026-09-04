/**
 * Build the synthetic `modelParameters` for an execution from an agent template's
 * own fields — WITHOUT injecting hardcoded provider/model/temperature defaults.
 *
 * 2026-06-18 (model-resolution cleanup, Protocol 2 reviewed):
 * The two synthetic config builders (agentTaskService + agentExecutionConfigBuilder)
 * used to seed `provider:'anthropic_sdk', model:'claude-haiku-4-5', temperature:0.7`
 * here. That hardcoded base SHADOWED the real resolution — a non-undefined
 * `source.model`/`source.provider` pre-empts `userLLMSettings` (the provider/key
 * axis) at `normalizeModelConfig`, so a model-less template silently ran Haiku even
 * when the configured provider/model said otherwise.
 *
 * Now we emit ONLY the template's actual values. `model`/`temperature`/`provider`
 * are left to resolve downstream:
 *   - model      → template metadata.modelParameters.model (spread below), else FAIL LOUD
 *   - temperature→ DEFAULT_MODEL_PARAMS.temperature (0.3) at normalizeModelConfig
 *   - provider   → userLLMSettings.provider (the provider/key axis) at normalizeModelConfig
 *
 * NOTE: the timeout-derived maxTokens cap (`Math.min(timeout*100, 4000)`) is preserved
 * VERBATIM — its replacement is a deferred decision (see the deferrals doc), NOT this change.
 */
export function buildTemplateModelParameters(template: {
  promptTemplate?: string | null;
  maxRetries?: number | null;
  timeout?: number | null;
  metadata?: unknown;
}): Record<string, any> {
  const meta =
    typeof template.metadata === 'object' &&
    template.metadata !== null &&
    !Array.isArray(template.metadata)
      ? (template.metadata as any).modelParameters || {}
      : {};

  return {
    // provider / model / temperature / maxTokens intentionally OMITTED — resolved
    // downstream (maxTokens → DEFAULT_MAX_TOKENS, currently STANDARD_AGENT_LIMIT 24000, at normalizeModelConfig).
    // The old `Math.min(timeout*100, 4000)` formula was a category error (output-token
    // budget derived from a clock-seconds timeout; *100 unit-less; any timeout >= 40
    // saturated the 4000 floor) — removed 2026-06-18 so maxTokens follows the same
    // template → DEFAULT pattern as the other params.
    systemPrompt: template.promptTemplate || '',
    useSystemPrompt: true,
    maxRetries: template.maxRetries ?? 3,
    timeout: template.timeout ?? 300,
    // The template's OWN modelParameters win — this is where a template that
    // explicitly sets model/temperature/provider/maxTokens supplies them.
    ...meta,
  };
}


/**
 * The ONE model-parameter precedence chain (I-10, convergence Phase 5b-iii —
 * the post-506ddd91 order the SSE stream previously re-computed live and the
 * rich config builders pre-computed caller-side):
 *   1. task.metadata.modelParameters (non-empty)  — explicit per-task override
 *   2. explicit caller params (non-empty)          — e.g. GUI body.agentConfig.parameters
 *   3. buildTemplateModelParameters(template)      — the template's own model config
 * The non-empty guards matter: a bare `{}` must FALL THROUGH to the template,
 * not shadow it (the 506ddd91 GUI-blocker class). Resolved ONCE at the
 * createAgentExecution chokepoint and frozen into `execution.config`; both
 * execution paths read the frozen row. Pure + leaf-module (no prisma import) —
 * fixture-tested in scripts/test-execution-config-snapshot.ts.
 */
export function resolveExecutionModelParams(input: {
  taskMetadata: unknown;
  explicitParams: unknown;
  template: { promptTemplate?: string | null; maxRetries?: number | null; timeout?: number | null; metadata?: unknown } | null | undefined;
}): Record<string, any> {
  const nonEmpty = (o: unknown): Record<string, any> | null =>
    o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o as object).length > 0
      ? (o as Record<string, any>)
      : null;
  const taskMeta =
    input.taskMetadata && typeof input.taskMetadata === 'object' && !Array.isArray(input.taskMetadata)
      ? (input.taskMetadata as any).modelParameters
      : null;
  return (
    nonEmpty(taskMeta) ||
    nonEmpty(input.explicitParams) ||
    (input.template ? buildTemplateModelParameters(input.template) : {})
  );
}
