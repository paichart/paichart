/**
 * Two symbols the KEPT spec checks need (scripts/check-requirements-sources.ts), moved 2026-11-28 out of the retired requirements
 * Author's in-run check (requirements-coverage.ts, requirements-clauses.ts — deleted in parcel A;
 * cline_docs/reviews/author-sunset-2026-11-27/PARCEL-A-PLAN.md § 1). Side-effect free.
 */

/** The leg protocol tokens a spec's leg section can name (was requirements-coverage.ts LEG_TOKENS, unchanged). */
export const LEG_TOKENS = ['network-provisioning', 'kubernetes-gitops', 'terraform-iac', 'observability-config'] as const;

/** item number → the row ids the owner's ROW-ITEM-MAP keys to it. */
export type RowItemMap = Map<number, Set<string>>;

// Was a Python-regex emulation (`pyRe` / `pyMatch`, re.match ⇒ anchored at the start) of the same pattern; a native anchored
// regex reads it identically (proven equal on every stored answers file at the move, PARCEL-A-BUILD.md).
const MAP_ROW = /^\|\s*`([^`]+)`[^|]*\|\s*(\d+)\s*\|/;
/** The owner's row↔item map from an answers file: every `| \`<row id>\` … | <item> |` line after the `ROW-ITEM-MAP` marker. */
export function rowItemMapFromAnswers(answers: string): RowItemMap {
  const i = answers.indexOf('ROW-ITEM-MAP');
  const m: RowItemMap = new Map();
  for (const line of answers.slice(i).split('\n')) { // i = -1 → the LAST character, exactly as Python's answers[-1:]
    const r = MAP_ROW.exec(line);
    if (r) {
      const n = parseInt(r[2], 10);
      if (!m.has(n)) m.set(n, new Set());
      m.get(n)!.add(r[1]);
    }
  }
  return m;
}
