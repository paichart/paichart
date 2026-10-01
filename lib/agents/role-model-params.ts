/**
 * Per-ROLE model parameters — the one place a role departs from the tier defaults (2026-09-29).
 *
 * Both the owning seed script and `report:template-freshness` read `expectedMaxTokens(role)`, so the
 * value a seed writes and the value the freshness report expects cannot diverge (template-system
 * review, cline_docs/reviews/requirements-author-output-budget-2026-09-29/). A role with no entry gets
 * DEFAULT_MAX_TOKENS, exactly as before this module existed.
 *
 * Side-effect free and relative-imported on purpose: seed scripts run under ts-node and import this.
 * Pinned by `npm run test:role-model-params` (watchdog fit, model ceiling, single source, reviewer default).
 */
import { DEFAULT_MAX_TOKENS } from '../services/llm/types';

/**
 * Output ceiling for a role whose deliverable is one long document written in a single call.
 *
 * Earned by `requirements_author` (Phase 1 decision inventory, 2026-09-28): single-call output of
 * 24.6K–48.0K tokens, ~73–84% of it adaptive thinking; one run truncated at 48000 (T1-zero,
 * TRUNCATED_PARTIAL_OUTPUT) and another used 44.5K (93%). The binding limit is the execution watchdog,
 * not the model (Sonnet 5 allows 128K): at the 90 tok/s throughput floor, 64000 takes ~711 s against
 * the 1080 s watchdog (180 s + 30 turns × 30 s). Do NOT raise this past what the watchdog fits — the
 * test derives the bound from RUNTIME_LIMITS and fails loudly. Deliberately NOT RUNTIME_LIMITS.MAX_OUTPUT_TOKENS
 * (64000 today, but it means a model ceiling, and an edit to it must not silently move this role).
 */
export const LONG_DOCUMENT_MAX_TOKENS = 64000;

export interface RoleModelParams {
  maxTokens?: number;
}

/** Roles that depart from the defaults. Keep this small: every entry is a measured need, recorded above. */
export const ROLE_MODEL_PARAMS: Readonly<Record<string, RoleModelParams>> = Object.freeze({
  requirements_author: { maxTokens: LONG_DOCUMENT_MAX_TOKENS },
});

/** The maxTokens a template row for `role` should carry — the seed writes it, the freshness report expects it. */
export function expectedMaxTokens(role: string | null | undefined): number {
  return (role ? ROLE_MODEL_PARAMS[role]?.maxTokens : undefined) ?? DEFAULT_MAX_TOKENS;
}
