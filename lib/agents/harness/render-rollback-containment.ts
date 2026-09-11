/**
 * §6 RENDER for `rollbackContainment` — the Reviewer's view of mechanical net #3, and the ONLY
 * surface on which a leg Reviewer can ever see this fact.
 *
 * The card render (`lean-card-facts.js`) is read by the program gate AFTER the leg synthesizes; the
 * Reviewer runs one leaf earlier and reads nothing but its own prompt. So a card-only fact is
 * invisible to exactly the party whose blindness this net exists to end — the same reasoning that
 * put `markerPresence` into §6 (H-4), and the same reasoning that moved this fact's computation to
 * the Author leaf's persist so it can arrive here BEFORE the review rather than after it.
 *
 * WHY ITS OWN MODULE rather than beside the computation (the `renderMarkerPresence` precedent):
 * `rollback-containment.ts` was under concurrent authorship by the net's owner while this render
 * was written, and one shared file forces one shared commit. The render's own seam — prompt prose —
 * has a different owner from the predicate, so the split follows the ownership boundary rather than
 * cutting across it. Nothing else changes: this is still a pure function of the stamped fact.
 *
 * PROTOCOL 10, and here the WORDING carries the load, not the data:
 *  - counts, named lines and the disposition BY NAME — never a recommendation, never a verdict;
 *  - `needs-node-c` / `unmatched-restore-lines` always renders with the framing that these are lines
 *    the check COULD NOT ADJUDICATE, never evidence of fabrication. Trimmed-exact-line matching
 *    legitimately misses a value the source never renders, a line re-wrapped past trimming, and a
 *    line outside the scoped harvest — and the measured base rate of true fabrication across the
 *    archived corpus is zero. A Reviewer reading "2 unmatched" as "2 fabricated" would reproduce the
 *    exact incident this net was built to end, with a platform fact as its evidence: strictly worse
 *    than rendering nothing at all;
 *  - a DELIBERATE no-check (`lane-not-supported`) and a FAILED check (`no-harvest-text` and the
 *    other could-not-check arms) get deliberately different sentences. They are the same silence to
 *    a careless reader, and a conclusion drawn from silence is how this class keeps recurring;
 *  - every rendered fact carries its own limits: matching is trimmed-exact-line against THIS leg's
 *    own harvest, and the fact says NOTHING about whether the package is COMPLETE. Completeness is
 *    the (a) lane and remains the Reviewer's judgement.
 *
 * The renderer is a PURE FUNCTION OF THE FACT it is handed. Which legs are eligible to see it is
 * decided once, upstream, and arrives as data — re-deriving a lane here would be a second lane
 * predicate, which is the two-extractor drift class this domain keeps paying for.
 *
 * @created 2026-09-11 (H3)
 */

/** How many unmatched lines the §6 block names before it says how many it withheld. */
const PROMPT_MISSING_LIST_CAP = 10;

/** @returns §6 lines (the caller pushes them), or null when there is no fact to render. */
export function renderRollbackContainmentForPrompt(
  fact: Record<string, unknown> | null | undefined
): string[] | null {
  if (!fact || typeof fact !== 'object') return null;
  const out: string[] = [];
  const disp = fact.rollbackDisposition as Record<string, unknown> | undefined;
  const dName = disp && typeof disp === 'object' && typeof disp.disposition === 'string'
    ? disp.disposition : null;
  const dReason = disp && typeof disp === 'object' && typeof disp.reason === 'string'
    ? disp.reason : null;
  const reason = typeof fact.reason === 'string' ? fact.reason : null;

  if (fact.checked === true) {
    const found = typeof fact.restoreLinesFound === 'number' ? fact.restoreLinesFound : 0;
    const total = typeof fact.restoreLinesTotal === 'number' ? fact.restoreLinesTotal : 0;
    const missing = Array.isArray(fact.missing) ? fact.missing : [];
    out.push(
      `- **Rollback provenance (platform fact)**: ${found} of ${total} restore line(s) in this package were found VERBATIM in the harvest this leg itself witnessed; ${missing.length} unmatched.`
    );
    if (missing.length > 0) {
      out.push(
        `  - **These unmatched lines are lines the check COULD NOT ADJUDICATE — they are NOT evidence of fabrication.** A line is unmatched when its trimmed text is absent from the witnessed harvest, which happens legitimately for a value the source never renders, for a line the author re-wrapped or re-indented beyond trimming, and for a line outside the harvest's scope. Treat them as lines to ASK about — name them and escalate — never as a proven non-quote:`
      );
      const shown = missing.slice(0, PROMPT_MISSING_LIST_CAP);
      for (const m of shown) {
        const line = m && typeof m === 'object' ? (m as Record<string, unknown>).line : m;
        const at = m && typeof m === 'object' ? (m as Record<string, unknown>).blockLine : null;
        out.push(`    - \`${String(line)}\`${typeof at === 'number' ? ` (package line ${at})` : ''}`);
      }
      // Truncation is STAMPED, never silent: an unnamed withheld line is the F7 defect (a count
      // denies the reader the subject) reintroduced by the renderer itself.
      if (missing.length > shown.length) {
        out.push(`    - …and ${missing.length - shown.length} further unmatched line(s) not listed here; the full set is on the leg's stamped fact.`);
      }
    }
  } else {
    out.push(`- **Rollback provenance (platform fact)**: NOT CHECKED (\`${reason ?? 'no reason given'}\`).`);
    if (reason === 'no-restore-blocks' || reason === 'no-restore-form-lines') {
      out.push('  - The package quoted no restore content for this check to adjudicate. **That is not an approval of anything** — whether the package is complete, and whether its evidence is present and restated, remains entirely your judgement.');
    } else if (reason === 'lane-not-supported') {
      // A DELIBERATE no-check, and it must not read like a failed one. In a desired-state lane the
      // rollback quotes what the package intends to exist, not a line any harvest ever rendered, so
      // the containment question does not apply — a different sentence from "the platform tried and
      // could not", and a reviewer that conflates them draws a conclusion from silence.
      out.push('  - This domain\'s rollbacks quote DESIRED state rather than witnessed state, so the containment question does not apply here and the platform deliberately did not ask it. This is not a failed check and not a finding — judge provenance as you would with no fact at all, under the rule above.');
    } else if (reason !== 'program-tier') {
      out.push('  - The check should have run here and could not, so it fails closed: the provenance question is OPEN and the platform has neither exonerated nor implicated this package. Judge it as you would with no fact at all.');
    }
  }

  if (dName) {
    out.push(`  - Disposition: \`${dName}\`${dReason ? ` (\`${dReason}\`)` : ''} — computed mechanically from the counts above, not a judgement about the package.`);
  }
  const excluded = fact.excluded as Record<string, unknown> | undefined;
  if (excluded && typeof excluded === 'object') {
    const pairs = Object.entries(excluded).filter(([, n]) => typeof n === 'number' && n > 0);
    if (pairs.length) {
      out.push(`  - Excluded from adjudication (named, non-blocking): ${pairs.map(([k, n]) => `${k} ${n}`).join(', ')}.`);
    }
  }
  out.push('  - Scope: matching is TRIMMED EXACT LINE against **this leg\'s own harvest only**, so it proves the line\'s provenance, not structural equivalence. It says NOTHING about whether the package is COMPLETE — missing or unrestated evidence remains a blocking issue for you to raise on its own merits.');
  return out;
}
