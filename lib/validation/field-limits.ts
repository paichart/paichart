/**
 * Shared field size limits for cross-boundary consistency.
 *
 * Using shared constants prevents "field limit alignment" bugs where
 * data passes validation at the source boundary but fails at the
 * destination boundary due to mismatched limits.
 *
 * @see /.claude/knowledge/patterns/PATTERN-REGISTRY.md (boundary field leakage)
 *
 * Categories:
 * - CONTENT: Large rich-text fields (task descriptions, agent prompts,
 *   template promptTemplate — must all agree on max size)
 * - METADATA: Object descriptions, help text, comments
 * - TITLE: Page/object titles (longer than NAME)
 * - NAME: Object names, labels, emails, filenames
 * - LABEL: Short categorical labels ("type" fields, status hints)
 * - ID: Inline string IDs (non-CUID), version strings
 * - SHORT_TEXT: Variable descriptions, hints, tags
 * - SEARCH_QUERY: Search and filter inputs
 * - URL: API endpoints, webhook URLs, OAuth redirect URIs
 * - SECRET: API keys, tokens, client secrets
 */
export const FIELD_LIMITS = {
  /** Task descriptions, agent prompts, template promptTemplate, prompt library text (50KB).
   *  This is a validated-INPUT ceiling — intentionally distinct from (and NOT coupled to)
   *  execution-artifacts.ts MAX_STORED_TOOL_RESULT_BYTES (50000, a storage-truncation point).
   *  See runtime-limits-sweep §5 "document-as-distinct, do NOT unify" (2026-06-17). */
  CONTENT: 50_000,

  /** inputContext, extended descriptions, use cases (10KB) */
  EXTENDED_CONTENT: 10_000,

  /** Object descriptions, help text, comments (5KB) */
  METADATA: 5_000,

  /** Phase/stage descriptions, task description summaries (2KB) */
  DESCRIPTION: 2_000,

  /** Stage descriptions, moderate text fields (1KB) */
  MODERATE_TEXT: 1_000,

  /** Variable descriptions, hints, validation help text, tags (500 chars) */
  SHORT_TEXT: 500,

  /** Page/object titles (POV title, task title, template title) — longer than NAME (500 chars) */
  TITLE: 500,

  /** Object names, labels, emails, filenames (255 chars) */
  NAME: 255,

  /** Short categorical labels ("type" fields, status hints, category codes) (100 chars) */
  LABEL: 100,

  /** Inline string IDs (non-CUID, e.g. form-row identifiers), version strings (50 chars) */
  ID: 50,

  /** API endpoints, webhook URLs, OAuth redirect URIs (short, base-endpoint URLs) */
  URL: 500,

  /**
   * Arbitrary link / attachment / storage URLs (2048 chars). Distinct from URL
   * (short endpoints): these can carry signed tokens and long query strings, so
   * they use the de-facto browser/standard URL ceiling. Consumers: task
   * attachment storageUrl, support request attachments.
   */
  URL_LONG: 2_048,

  /** API keys, tokens, client secrets */
  SECRET: 500,

  /** Search/filter query inputs */
  SEARCH_QUERY: 500,

  /**
   * Byte-length cap on stringified service call arguments (BC30 protection).
   * Per Phase 3 migration from mcp-hub-validation.ts:135 — sec-ops Finding C
   * notes this measures JSON.stringify length, not memory; depth/item-count
   * caps below are the memory-cost complement (added 2026-05-17).
   */
  SERVICE_CALL_ARGS: 25_000,

  /**
   * Maximum nesting depth in services.call.arguments and services.steps[].arguments
   * (sec-ops Finding C, 2026-05-17). Calibrated 2.6× over p99=3 from a 66-sample
   * production survey of mcp_workflow_executions.input->'steps'.
   * @see lib/validation/args-shape.js for the refine factory enforcing this.
   */
  SERVICE_CALL_ARGS_MAX_DEPTH: 8,

  /**
   * Maximum leaf-value count in services.call.arguments and services.steps[].arguments
   * (sec-ops Finding C, 2026-05-17). Calibrated 14× over p99=7 — accommodates
   * future array-heavy payloads (Alpha Vantage multi-symbol, EIA multi-state)
   * while rejecting the 100K-flat-string-totaling-24KB DoS bypass.
   * Quarterly recalibration if p99 ever exceeds 33.
   * @see lib/validation/args-shape.js
   */
  SERVICE_CALL_ARGS_MAX_LEAVES: 100,
} as const;

export type FieldLimitKey = keyof typeof FIELD_LIMITS;
