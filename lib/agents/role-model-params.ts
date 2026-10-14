/**
 * Per-ROLE model parameters — the one place a role departs from the tier defaults (2026-09-29).
 *
 * Both the owning seed script and `report:template-freshness` read `expectedMaxTokens(role)`, so the
 * value a seed writes and the value the freshness report expects cannot diverge (template-system
 * review, cline_docs/reviews/requirements-author-output-budget-2026-09-29/). A role with no entry gets
 * DEFAULT_MAX_TOKENS, exactly as before this module existed.
 *
 * `maxToolTurns` (2026-10-12) follows the same rule: the owning seed writes it into metadata.modelParameters (where
 * the engine and the stream route read it — agentExecutionEngine.ts / stream/route.ts, clamped to
 * RUNTIME_LIMITS.MAX_TOOL_TURNS) and the freshness report expects it. A role with no entry writes NO key and runs the
 * engine default (RUNTIME_LIMITS.DEFAULT_TOOL_TURNS, 30). Two per-ROW literals stay in their seeds, not here: the Pipeline
 * Harness's 100 (its own generator) and the terraform harvester row's 60 (IM-6 — infra_state_harvester has five owners
 * and only that row departs, so a per-role entry would move four rows nobody decided to move).
 *
 * Side-effect free and relative-imported on purpose: seed scripts run under ts-node and import this.
 * Pinned by `npm run test:role-model-params` (watchdog fit, model ceiling, single source, reviewer default, tool turns).
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

/**
 * Tool-turn cap for the Program Architect (owner decision R1 option A, 2026-10-12 —
 * cline_docs/reviews/size-plan-2026-10-12/ARCHITECT-READ-BUDGET.md §7, R1-ENGINE.md).
 *
 * The read_more pager's per-run cap is min(pagesPerRun, floor(0.25 × maxToolTurns)) (createPagerState). The Architect's
 * read budget is 12 per run (role-read-budget.ts); at the default 30 turns it gets 7. 48 is the SMALLEST turn cap that
 * reaches 12 (47 → 11). Cost: the execution watchdog is 180 s + turns × 30 s, so 1,080 s → 1,620 s for this role.
 * `value_chain_architect` carries it too — same guidance constant and same read budget; its only row is DEPRECATED.
 */
export const PROGRAM_ARCHITECT_MAX_TOOL_TURNS: number = 48;

export interface RoleModelParams {
  maxTokens?: number;
  /** Written into metadata.modelParameters.maxToolTurns; absent = no key = engine default (30). */
  maxToolTurns?: number;
}

/** Roles that depart from the defaults. Keep this small: every entry is a measured need or owner decision, recorded above. */
export const ROLE_MODEL_PARAMS: Readonly<Record<string, RoleModelParams>> = Object.freeze({
  requirements_author: { maxTokens: LONG_DOCUMENT_MAX_TOKENS },
  program_architect: { maxToolTurns: PROGRAM_ARCHITECT_MAX_TOOL_TURNS },
  value_chain_architect: { maxToolTurns: PROGRAM_ARCHITECT_MAX_TOOL_TURNS },
});

function ownEntry(role: string | null | undefined): RoleModelParams | undefined {
  return role && Object.prototype.hasOwnProperty.call(ROLE_MODEL_PARAMS, role) ? ROLE_MODEL_PARAMS[role] : undefined;
}

/** The maxTokens a template row for `role` should carry — the seed writes it, the freshness report expects it. */
export function expectedMaxTokens(role: string | null | undefined): number {
  return ownEntry(role)?.maxTokens ?? DEFAULT_MAX_TOKENS;
}

/** The maxToolTurns a template row for `role` should carry; undefined = the row carries no key (engine default). */
export function expectedMaxToolTurns(role: string | null | undefined): number | undefined {
  return ownEntry(role)?.maxToolTurns;
}

/** Spread into a seed's modelParameters: `{ maxToolTurns }` for a role with an entry, `{}` (no key) otherwise. */
export function roleToolTurnParams(role: string | null | undefined): { maxToolTurns?: number } {
  const turns = expectedMaxToolTurns(role);
  return turns === undefined ? {} : { maxToolTurns: turns };
}
