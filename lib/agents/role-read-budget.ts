/**
 * Per-ROLE read budget for the agentic tool loop's `read_more` pager (2026-10-12, size plan owner decision R1).
 *
 * The pager caps how much of a truncated tool result an agent can read: the first window (MAX_TOOL_RESULT_LENGTH,
 * 8,000) plus `pagesPerDocument` read_more windows of at most READ_MORE_WINDOW_BOUNDS.max (7,000) per result, and
 * `pagesPerRun` windows per execution across all results. The run cap is further bounded by the tool-turn cap:
 * `min(pagesPerRun, floor(0.25 × maxToolTurns))` (createPagerState) — so a pagesPerRun above 25% of a role's
 * maxToolTurns buys nothing.
 *
 * Every role reads the default (today's constants, byte-identical prompts and tool results). The ONLY departure is the
 * Program Architect, which must read a whole answered requirements.md (≈ 50–57K delivered) plus a topology file:
 * 9 pages per document → 8,000 + 9 × 7,000 = 71,000 readable; 12 per run. Owner decision R1 (Steve, 2026-10-12):
 * cline_docs/reviews/size-plan-2026-10-12/ARCHITECT-READ-BUDGET.md §7.
 *
 * `value_chain_architect` carries the same budget: its guidance is the SAME constant as program_architect's
 * (pAIchartUniversalTemplate.ts ROLE_GUIDANCE_LIBRARY, pinned ===) and it fetches the same spec. Its only row is
 * DEPRECATED and cannot execute today (bound to a DEPRECATED protocol → NAMED_PROTOCOL_NOT_FOUND), so the entry
 * changes no live behaviour; it keeps the reading allowance tied to the reading instructions if the row is revived.
 *
 * The size checks (requirements-size-lint.ts / requirements-rules.py) must measure against the PROGRAM ARCHITECT's
 * budget — import PROGRAM_ARCHITECT_READ_BUDGET, never retype the numbers.
 *
 * Side-effect free and relative-imported on purpose (seed/check scripts run under ts-node).
 * Pinned by `npm run test:role-read-budget` (every role default except the two, trailer math at 9 pages).
 */

export interface ReadBudget {
  /** read_more windows served for ONE truncated result (per-origin cap). */
  pagesPerDocument: number;
  /** read_more windows served per execution, across all results — an upper bound; the tool-turn cap also binds. */
  pagesPerRun: number;
}

/** Today's constants — every role not listed below. */
export const DEFAULT_READ_BUDGET: Readonly<ReadBudget> = Object.freeze({ pagesPerDocument: 6, pagesPerRun: 8 });

/** The Program Architect (owner decision R1): 71,000 readable per document, 12 windows per run. */
export const PROGRAM_ARCHITECT_READ_BUDGET: Readonly<ReadBudget> = Object.freeze({ pagesPerDocument: 9, pagesPerRun: 12 });

/** Roles that depart from the default. Keep this small: every entry is an owner decision, recorded above. */
export const ROLE_READ_BUDGETS: Readonly<Record<string, Readonly<ReadBudget>>> = Object.freeze({
  program_architect: PROGRAM_ARCHITECT_READ_BUDGET,
  value_chain_architect: PROGRAM_ARCHITECT_READ_BUDGET,
});

/** The read budget for the executing agent's resolved role. EXACT key match; anything else gets the default. */
export function readBudgetFor(role: string | null | undefined): Readonly<ReadBudget> {
  return (role && Object.prototype.hasOwnProperty.call(ROLE_READ_BUDGETS, role) ? ROLE_READ_BUDGETS[role] : undefined)
    ?? DEFAULT_READ_BUDGET;
}
