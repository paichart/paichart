/**
 * Per-model request capabilities — the single source for "which request shape is legal
 * for this model" (SDK-upgrade Phase 2, WU-1). Replaces the substring `effectiveModel
 * .includes('sonnet-4'|'opus-4')` checks (anthropic-sdk-provider.ts) and the `/opus/i`
 * ceiling regex (runtime-limits.ts) — both of which silently mis-shaped any model that
 * didn't contain the magic substring (the exact bug that made `claude-opus-4-8` uncallable).
 *
 * FAIL-LOUD on an unknown model: a silent legacy request shape risks an Anthropic 400.
 *
 * Capability data sourced from the claude-api skill (model-migration.md), 2026-06-19; Sonnet 5 +
 * serverSideFallback added 2026-07-02 (WU-10, Fable/Sonnet-5 release wave):
 *  - `temperature`/`top_p`/`top_k` are REMOVED on Opus 4.7/4.8, Fable 5, AND Sonnet 5 → 400 if sent.
 *  - Thinking: adaptive on Opus 4.5+/Sonnet 4.6; adaptive-BY-DEFAULT on Sonnet 5 (omitting the config
 *    runs adaptive); always-on (omit config) on Fable 5; none on Haiku 4.5.
 *  - `effort` (low/medium/high/xhigh/max): ERRORS on Haiku 4.5 / Sonnet 4.5. `max` = Fable5/Opus4.6+/
 *    Sonnet4.6/Sonnet5. `xhigh` = Opus 4.7+/Fable 5/Sonnet 5. Hence the per-model ALLOWED SET, not a
 *    single ceiling (the levels are non-monotonic: Sonnet 4.6 has `max` but not `xhigh`).
 *  - Fable 5 refusals: opt into the server-side fallback beta by default (`serverSideFallback`) —
 *    a declined request is transparently re-served by FALLBACK_MODEL inside the same call.
 */
import { maxOutputTokensForModel } from '@/lib/validation/runtime-limits';

export type ThinkingMode = 'adaptive' | 'budget' | 'always-on' | 'none';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Ordinal order for clamping. */
export const EFFORT_ORDER: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export interface ModelCapabilities {
  /** false ⇒ MUST omit temperature/top_p (Opus 4.7/4.8, Fable 5) or the API 400s. */
  acceptsTemperature: boolean;
  /** how to send `thinking`: adaptive `{type:'adaptive'}`, budget `{type:'enabled',budget_tokens}`,
   *  always-on (omit thinking entirely — Fable), or none (omit — Haiku). */
  thinkingMode: ThinkingMode;
  /** the effort levels this model accepts; [] ⇒ effort is unsupported (omit `output_config.effort`). */
  allowedEfforts: EffortLevel[];
  /** real Anthropic output-token ceiling (from maxOutputTokensForModel). */
  outputCeiling: number;
  /** true ⇒ opt into the server-side refusal-fallback beta (Fable 5 / Mythos 5) — the provider routes
   *  via client.beta.messages.create with SERVER_SIDE_FALLBACK_BETA + fallbacks:[{model: FALLBACK_MODEL}].
   *  A rescued refusal re-bills at the fallback model's own rates. (WU-10, 2026-07-02) */
  serverSideFallback: boolean;
}

/** The model that re-serves a Fable refusal (the only supported fallback target at launch). */
export const FALLBACK_MODEL = 'claude-opus-4-8';
/** Exact beta string for server-side refusal fallbacks — the DATED name is authoritative; do not "update" it. */
export const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-06-01';

const FULL: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']; // Opus 4.7/4.8, Fable
const NO_XHIGH: EffortLevel[] = ['low', 'medium', 'high', 'max'];      // Sonnet 4.6, Opus 4.6
const NO_XHIGH_NO_MAX: EffortLevel[] = ['low', 'medium', 'high'];      // Opus 4.5

/**
 * Resolve request capabilities by model family. THROWS on an unknown model — never
 * silently returns a legacy shape (boundary-contract I2).
 */
export function capabilitiesFor(model: string): ModelCapabilities {
  const m = model.toLowerCase();
  const outputCeiling = maxOutputTokensForModel(model);
  // order matters: most-specific first
  if (/fable|mythos/.test(m))
    return { acceptsTemperature: false, thinkingMode: 'always-on', allowedEfforts: FULL, outputCeiling, serverSideFallback: true };
  // Opus 5 (2026-08-05): same request surface as Opus 4.8 — temperature/top_p REMOVED, FULL effort
  // set, 128K output — with two Opus-5-only notes:
  //  1. serverSideFallback TRUE. Opus 5 carries the same elevated cyber safeguards as Fable and can
  //     return stop_reason:'refusal'; cyber-category refusals route to FALLBACK_MODEL (opus-4-8),
  //     which is already our pinned target. Without this a refusal fails instead of being re-served.
  //     Uses the ARRAY fallback form + SERVER_SIDE_FALLBACK_BETA, same path as Fable (Steve's call,
  //     2026-08-05) — NOT the newer `fallbacks:'default'` form, which needs the -2026-07-01 header.
  //     Pairing either header with the other form is a 400, so keep the two forms from mixing.
  //  2. Thinking is ON BY DEFAULT (unlike 4.8/4.7, where omitting the config meant no thinking);
  //     'adaptive' sends {type:'adaptive'}, which is equivalent to the default — correct either way.
  // NOT modelled: Opus 5 400s on thinking:{type:'disabled'} at effort xhigh/max. We never send
  // disabled thinking (verified by grep, 2026-08-05), so the trap is unreachable and adding a
  // capability flag for it would be untested dead weight. Re-check if a disabled path is ever added.
  // Placed before opus-4-x: `claude-opus-4-5` does NOT contain the substring `opus-5`, so there is
  // no false match in either direction, but most-recent-first matches the file's convention.
  if (/opus-5/.test(m))
    return { acceptsTemperature: false, thinkingMode: 'adaptive', allowedEfforts: FULL, outputCeiling, serverSideFallback: true };
  // ⚠️ TWO MODELS, ONE BRANCH — and they are NOT interchangeable on every axis.
  // Verified identical on every field this interface carries TODAY (probed 2026-08-10:
  // capabilitiesFor('claude-opus-4-7') and ('-4-8') return byte-identical objects), which is why
  // the merge is currently harmless. They are NOT identical in general:
  //   minimum cacheable prefix — Opus 4.8 = 1024, Opus 4.7 = 2048 (claude-api skill,
  //   shared/prompt-caching.md). If a `minCacheablePrefixTokens` field is ever added to
  //   ModelCapabilities, THIS BRANCH MUST BE SPLIT FIRST or 4.7 silently gets 4.8's floor and a
  //   prefix between 1024 and 2048 tokens reports as cacheable when it is not — no error, just a
  //   permanently uncached prefix.
  // NOT split now, deliberately: neither model is selectable (`anthropicModels` offers fable-5 /
  // haiku-4-5 / opus-5 / sonnet-5), zero stored templates pin Opus 4.x (prod, 2026-08-10), and
  // FALLBACK_MODEL reaches the API as a STRING in the fallbacks array — the server re-serves, we
  // never resolve capabilities for it. Splitting an unreachable branch into two identical bodies
  // is the "untested dead weight" this file rejects elsewhere. **Split it as part of re-adding
  // Opus 4.x, not before.**
  // Same latent shape in /fable|mythos/ above: Mythos 5 = 512 but *Mythos Preview* = 2048. Also
  // unreachable today; same rule applies.
  if (/opus-4-(7|8)/.test(m))
    return { acceptsTemperature: false, thinkingMode: 'adaptive', allowedEfforts: FULL, outputCeiling, serverSideFallback: false };
  if (/opus-4-6/.test(m))
    return { acceptsTemperature: true, thinkingMode: 'adaptive', allowedEfforts: NO_XHIGH, outputCeiling, serverSideFallback: false };
  if (/opus-4-5/.test(m))
    return { acceptsTemperature: true, thinkingMode: 'adaptive', allowedEfforts: NO_XHIGH_NO_MAX, outputCeiling, serverSideFallback: false };
  // Sonnet 5 (2026-07-02): REJECTS temperature/top_p (the first non-Opus/Fable model to); adaptive
  // thinking by default; FULL effort set (first Sonnet with xhigh); 128K output. Checked before
  // sonnet-4-6; the pattern cannot false-match sonnet-4-5/4-6 (their substrings are sonnet-4-x).
  if (/sonnet-5/.test(m))
    return { acceptsTemperature: false, thinkingMode: 'adaptive', allowedEfforts: FULL, outputCeiling, serverSideFallback: false };
  if (/sonnet-4-6/.test(m))
    return { acceptsTemperature: true, thinkingMode: 'adaptive', allowedEfforts: NO_XHIGH, outputCeiling, serverSideFallback: false };
  if (/haiku-4-5/.test(m))
    return { acceptsTemperature: true, thinkingMode: 'none', allowedEfforts: [], outputCeiling, serverSideFallback: false };
  throw new Error(
    `Unknown model "${model}" — add it to capabilitiesFor() (model-capabilities.ts) before use. ` +
    `Sending the legacy request shape to an unknown model risks a silent Anthropic 400.`
  );
}

/** true if the model accepts any effort level. */
export function acceptsEffort(caps: ModelCapabilities): boolean {
  return caps.allowedEfforts.length > 0;
}

/**
 * Clamp a requested effort to what the model actually accepts. Returns null when effort
 * is unsupported (caller omits `output_config.effort`). When the requested level isn't in
 * the allowed set, falls to the highest allowed level NOT exceeding it (so `xhigh` on
 * Sonnet 4.6 → `high`, `max` on Opus 4.5 → `high`); if the request is below everything
 * allowed, returns the lowest allowed.
 */
export function clampEffort(requested: EffortLevel, caps: ModelCapabilities): EffortLevel | null {
  const allowed = caps.allowedEfforts;
  if (allowed.length === 0) return null;
  if (allowed.includes(requested)) return requested;
  const reqIdx = EFFORT_ORDER.indexOf(requested);
  const atOrBelow = allowed.filter((e) => EFFORT_ORDER.indexOf(e) <= reqIdx);
  if (atOrBelow.length > 0) {
    return atOrBelow.reduce((a, b) => (EFFORT_ORDER.indexOf(a) > EFFORT_ORDER.indexOf(b) ? a : b));
  }
  return allowed.reduce((a, b) => (EFFORT_ORDER.indexOf(a) < EFFORT_ORDER.indexOf(b) ? a : b));
}

/**
 * UI/gating predicate: does this model expose a user-configurable thinking BUDGET control?
 * TRUE only for `adaptive` models (the user opts in via a budget signal) — NOT for `always-on`
 * (Fable: thinking is always on, nothing to toggle) or `none` (Haiku: no thinking). Derives from
 * the capability map so UI gates can't drift on a model bump (WU-10: the old hardcoded
 * `includes('claude-sonnet-4')||includes('claude-opus-4')` gate wrongly hid the control for
 * Sonnet 5). Fail-SAFE (not fail-loud): an unknown/empty model → false. Unlike the request-build
 * boundary (where an unknown model MUST throw so a bad request never reaches the wire), a display
 * gate degrades correctly by simply hiding the control. Client-safe (this module's only transitive
 * import is the dependency-free runtime-limits), so UI components may import it directly.
 */
export function supportsThinkingBudget(model: string | undefined | null): boolean {
  if (!model) return false;
  try {
    return capabilitiesFor(model).thinkingMode === 'adaptive';
  } catch {
    return false;
  }
}
