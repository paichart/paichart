/**
 * Shared runtime ceilings for validation↔runtime alignment.
 *
 * A validation `.max()` and the runtime's hard cap MUST read the same constant,
 * or a value passes validation then explodes at runtime (timeout balloon, loop
 * starvation, LLM-API hard-reject). This is the runtime-ceiling analogue of
 * FIELD_LIMITS (lib/validation/field-limits.ts — the string-size analogue).
 *
 * Imported on BOTH sides of every boundary: the validation schemas
 * (model-parameters.ts, mcp-action-validation.ts, task-*.ts,
 * agent-template-validation.ts) AND the runtime read sites
 * (agentExecutionEngine.ts, stream/route.ts, agentic-tool-loop.ts clamp against
 * these same numbers).
 *
 * Discovery: .claude/knowledge/discoveries/runtime-limits-discovery.md
 * Review:    cline_docs/reviews/runtime-limits-alignment-2026-06-17/
 *
 * Keep this module dependency-free so it is safe to import from any layer.
 */
export const RUNTIME_LIMITS = {
  /**
   * Agentic tool-loop hard ceiling. The engine DEFAULT when unset is 30
   * (DEFAULT_TOOL_TURNS); this is the MAX a template may request. The Pipeline
   * Harness template legitimately sets 100, so the ceiling must stay >= 100;
   * 200 = 2x headroom, bounding the worst-case execution timeout at
   * 180_000 + 200*30_000 ~= 102 min. Read by agentExecutionEngine.ts:755 +
   * stream/route.ts:613 (Math.min clamp) and capped in ModelParametersSchema.
   */
  MAX_TOOL_TURNS: 200,
  DEFAULT_TOOL_TURNS: 30,

  /**
   * Per-execution retry ceiling. The runtime enforces NO retry max (it reads
   * `config.maxRetries ?? task.maxRetries ?? 3`); validation IS the only
   * ceiling. Unified to 10 (2026-06-17) from a 5-vs-10 drift across 8 schema
   * sites (the lone `max(5)` at mcp-action-validation.ts agent.execute had no
   * runtime justification).
   */
  MAX_RETRIES: 10,
  DEFAULT_RETRIES: 3,

  /**
   * Per-tool-call timeout ceiling for connected-service calls (F-NEW-5, 2026-07-17).
   *
   * THE AUTHORITY: a service's own `configuration.maxExecutionTime` (set at registration).
   * This is only the HARD CAP that clamps it — the exact role `HARD_TIMEOUT_CAP` plays in
   * service-call-handler.js, which now reads THIS constant so the two can never drift.
   * That drift is this module's whole reason to exist.
   *
   * WHY 300_000 and not the agent loop's old 30_000: the 30s literal in agentic-tool-loop.ts
   * was DECORATIVE SINCE BIRTH (2025-07-31, a0956cb5) — never once reached an SDK call on any
   * branch, so there is no historical behavior to "restore". Enforcing it now would be the
   * FIRST-EVER ceiling on a hot path, and the single live datapoint falsifies it: a legitimate
   * Browser Automation scrape needs > 60s (it died at the SDK's 60s default mid-harvest).
   * Per Protocol 10 a ceiling is a VERDICT; 30s is an unearned one. The per-service value is
   * an EARNED verdict (declared by the registrant, already validated at
   * service-update-handler.js:138). Borrow the earned one; cap it here.
   *
   * A 300s call still fits the loop's aggregate budget (engine watchdog = 180_000 +
   * turns*30_000; a 30-turn execution allows 1080s), so this cannot starve an execution.
   */
  TOOL_CALL_TIMEOUT_MS: 300_000,
  DEFAULT_TOOL_CALL_TIMEOUT_MS: 30_000,

  /**
   * Execution watchdog envelope: BASE + turns×PER_TURN (M2 decision, 2026-07-17).
   * Formerly bare literals duplicated in agentExecutionEngine.ts and
   * stream/route.ts (the exact drift shape that cost 8 diagnosis cycles when
   * MAX_TOOL_TURNS went 10→30 on one path only — test-dual-path-timeout-parity).
   * The watchdog aborts at LLM-call boundaries only; it cannot interrupt a
   * tool call in flight (the loop's tool await consumes no signal).
   */
  EXECUTION_TIMEOUT_BASE_MS: 180_000,
  EXECUTION_TIMEOUT_PER_TURN_MS: 30_000,

  /**
   * Stale-execution reaper thresholds (M2 decision, 2026-07-17 — panel-reviewed).
   *
   * TWO TIERS because the reaper does double duty:
   * - PENDING: a row that never claimed within 20 min is definitionally dead
   *   (claiming is instant) — keep the tight bound.
   * - RUNNING: must exceed the MAX admissible watchdog envelope
   *   (BASE + MAX_TOOL_TURNS×PER_TURN = 180k + 200×30k = 6,180s ≈ 103 min),
   *   else a legitimate long run (Pipeline Harness = 100 turns → 53 min
   *   envelope) gets flipped to FAILED mid-flight: a FALSE terminal fact that
   *   fires dependent reactors and resets task status while the run is alive
   *   (the SUCCESS persist later overwrites it — transient, but a false signal
   *   to every observer; BC79's exact theme). The old single 20-min literal
   *   predates the high-turn templates and violated this ordering.
   *   INVARIANT (pinned by test:sdk-request-options): REAPER_RUNNING_MS >
   *   EXECUTION_TIMEOUT_BASE_MS + MAX_TOOL_TURNS×EXECUTION_TIMEOUT_PER_TURN_MS.
   *   Cost accepted: crash-without-restart zombies now linger ~105 min instead
   *   of 20 (the common pm2-reload case is handled by the STARTUP cleanup; the
   *   periodic reaper has fired at most once in system history).
   *
   *   2026-07-31 CORRECTION: that parenthetical was FALSE when written. The
   *   startup cleanup gated on row age (`createdAt < now − 2min`), so it skipped
   *   exactly the executions a reload kills most often — the young ones. Run 17
   *   lost a 22-second-old execution that way and its task stalled until cleared
   *   by hand. The M2 cost/benefit above was therefore computed against a
   *   guarantee the code did not provide. The startup path now reaps on OWNER
   *   LIVENESS instead of age (lib/services/executionOwnership.ts), which is
   *   what makes the parenthetical true. The thresholds below are unchanged and
   *   were never the bug — do not lower them to chase a lingering zombie.
   */
  EXECUTION_REAPER_PENDING_MS: 1_200_000,
  EXECUTION_REAPER_RUNNING_MS: 6_300_000,

  /**
   * Slow-tool-call OBSERVATION threshold (M2 decision, 2026-07-17). A WARN-log
   * fact-emitter, NOT enforcement — the M2 panel unanimously declined to mint
   * an embedded per-call timeout (every embedded p99 < 4s, max organic 10.1s,
   * zero attributable hangs ever; a ceiling would be an unearned verdict per
   * Protocol 10). This threshold generates the dataset that could EARN one:
   * 30s = 3× the max organic embedded call ever observed. If these warns start
   * appearing, that evidence — not a guess — sets any future ceiling.
   */
  SLOW_TOOL_CALL_WARN_MS: 30_000,

  /**
   * Output-token ceiling for the CONSERVATIVE/default tier — Haiku 4.5 and
   * Sonnet 4.6 both cap at 64K output (per the claude-api skill, 2026-06-18).
   * The default model is claude-haiku-4-5. Used as the per-model ceiling for any
   * non-Opus (or unknown) model, and as the floor of `maxOutputTokensForModel`.
   */
  MAX_OUTPUT_TOKENS: 64000,

  /**
   * Output-token ceiling for Opus 4.x (4.6/4.7/4.8 = 128K output). This is the
   * global maximum across the configured model set, so it is the SCHEMA cap on
   * maxTokens (model-parameters.ts) — the schema can't know the resolved model,
   * so it admits up to the largest ceiling and the runtime clamp
   * (`maxOutputTokensForModel`, normalizeModelConfig) enforces the real per-model
   * limit. A non-Opus request above 64K passes the schema, then gets clamped at
   * the runtime chokepoint (a tuning-knob clamp, not a hard reject).
   */
  MAX_OUTPUT_TOKENS_OPUS: 128000,
} as const;

/**
 * The real Anthropic output-token ceiling for a resolved model (confirmed via the
 * claude-api skill): Opus 4.x AND Fable 5 / Mythos 5 = 128K; Haiku 4.5 / Sonnet 4.6 =
 * 64K. Unknown models get the conservative 64K. This replaces the static
 * MAX_OUTPUT_TOKENS clamp so an Opus/Fable template can use its full 128K budget while
 * a Sonnet/Haiku request is still capped at 64K (the model-aware fix for the
 * static-cap Opus under-cap). Kept SEPARATE from the `anthropicModels` registry
 * table (types.ts) deliberately — this is the runtime clamp's source of truth; the
 * table is display/registry metadata (now corrected to the same real ceilings).
 * (Fable/Mythos added 2026-06-19, SDK Phase-2 WU-1 — `/opus/i` alone clamped Fable to 64K.
 * Sonnet 5 added 2026-07-02, WU-10 — 128K output per the claude-api skill; the `sonnet-5`
 * pattern cannot false-match `claude-sonnet-4-5`/`4-6`, whose substrings are `sonnet-4-x`.)
 *
 * Streaming-accumulate (2026-07-04): with the provider on stream().finalMessage(), the SDK's
 * former non-streaming transport ceiling (maxTokens ≤ 21,333, the 10-min duration guard) is
 * GONE — this model ceiling is once again the real REQUEST bound. The COMPLETION bound is now
 * the execution watchdog (180s + 30s/turn ≈ 35-45K output tokens on a default-30-turn
 * template); a 64K/128K generation needs a turns≥100 template or a reviewed formula change.
 * See cline_docs/reviews/engine-streaming-accumulate-2026-07-04/ (R4).
 */
export function maxOutputTokensForModel(model: string | undefined): number {
  if (model && /opus|fable|mythos|sonnet-5/i.test(model)) return RUNTIME_LIMITS.MAX_OUTPUT_TOKENS_OPUS;
  return RUNTIME_LIMITS.MAX_OUTPUT_TOKENS;
}
