/**
 * PLATFORM-HELD-BYTES Phase 10 — THE ONE "out of scope" predicate (phase10-panel/SYNTHESIS.md §1a; owner decisions D1, D2, 2026-10-17).
 *
 * A held-capable leg's Author package is OUT OF SCOPE — never forced by the held rule; the Reviewer judges it as a full-file package —
 * iff BOTH hold:
 *   1. its stamped `editApplication.state` is in the EXPLICIT D1 list below (package-scoped states). Run-scoped failures —
 *      binding-mismatch, variant-protocol-not-injected, could-not-check, r10-disabled, binding-invalid — are NOT in it: they are about
 *      the run, not the package, and keep forcing. Never derive this list as "PLATFORM_STATE minus …" (audit N-5);
 *   2. the package carries NO held grammar: no parsed block in ANY section (a SEARCH placed under Held File Rollback counts, audit A-M1),
 *      no edit or restore outside its section, nothing refused, and no rollback-section `restore` — EXCEPT that a rollback restore is
 *      harmless when the state is `no-edits` (a base exists and the restore named a known handle; an unknown one is already refused).
 *      That exception is D2, limited to `no-edits` (audit A-M1): under no-base / demo-pov / a platform state a restore points at nothing.
 *
 * READERS (six, one predicate): the carrier (held-edit-carrier.ts) and the Reviewer render (held-chain.ts → render-held.ts) call this
 * function; MI-13 re-derives the same rule in SQL from the Author stamp (report-mechanism-inventory.sh, never from `inScope`); the
 * SYNTHESIZE line, the Reviewer bullet and the Node C / lean-card text state it in words. A change here is a change to all six.
 *
 * FAIL-CLOSED: an unreadable or truncated stamp (`digestTruncated`) is IN scope. Legacy stamps without `blocksTotal` /
 * `rollbackRestores` read those as 0, and `total` (the edits-section block count, always stamped) still counts.
 *
 * Accepted limits (recorded): whole-file detection does not run in pre-states or platform states (precedence returns first) or below
 * 0.90 coverage — such a package is out of scope and falls back to pre-held behaviour; a whole block that only deletes or reorders
 * lines is a quote (whole-file.ts, D5); the platform's held-files line is rendered on the out-of-scope render only (re-review PC N-C).
 */

/** D1 — explicit, package-scoped. */
export const HELD_OUT_OF_SCOPE_STATES: readonly string[] = Object.freeze([
  'no-edits', 'no-base', 'demo-pov',
  'view-not-rendered', 'view-over-budget', 'view-line-map-unstable', 'unheld', 'handle-ambiguous', 'base-superseded', 'base-not-held',
  'handle-namespace-ambiguous', 'diff-over-budget',
]);

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Does the stamped package carry any held grammar (or a refusal)? The D2 exception is applied by the caller's state. */
export function stampHasHeldGrammar(fact: Record<string, unknown>): boolean {
  const state = typeof fact.state === 'string' ? fact.state : '';
  return n(fact.blocksTotal) > 0 || n(fact.total) > 0 || n(fact.editsOutsideSection) > 0 || n(fact.restoreOutsideRollback) > 0
    || n(fact.refusedTotal) > 0 || (n(fact.rollbackRestores) > 0 && state !== 'no-edits');
}

/** THE predicate over a stamped `editApplication` fact. */
export function heldPackageOutOfScope(fact: unknown): boolean {
  if (!fact || typeof fact !== 'object') return false;
  const f = fact as Record<string, unknown>;
  if (f.digestTruncated === true) return false;
  if (typeof f.state !== 'string' || !HELD_OUT_OF_SCOPE_STATES.includes(f.state)) return false;
  return !stampHasHeldGrammar(f);
}
