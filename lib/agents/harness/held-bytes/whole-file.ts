/**
 * PLATFORM-HELD-BYTES Phase 10 W3 — the ONE whole-file-write detector (PHASE10-PLAN.md W3; owner decisions PH-3, PD-1).
 *
 * A held file must be edited by reference, never written whole. The applier refuses a package that writes one whole as
 * `held-file-written-whole` (class NOT_CORRECTABLE — panel D3(b): the leg is forced and no correction turn is spent).
 *
 * THE RULE: a fenced block that is NOT part of the edit grammar, sits OUTSIDE the rollback section, covers at least
 * `WHOLE_FILE_COVERAGE` of a held file's non-blank lines IN ORDER (LCS over lines), AND ADDS at least one line to it. A block that adds
 * no line is a QUOTE of the file (evidence of the current state), never a write — owner decision D5, 2026-10-17, the lab's own
 * candidate rule (`score-edits.ts`: "a block identical to the base, or one that only omits lines, is a quote of it").
 *
 * HOW IT DIFFERS FROM THE LAB'S SG-WIN (panel EF-N1 — stated, not "unchanged"): (1) it compares against BOTH texts the Author could have
 * copied (the held base and the view it was shown — the view is the R9-sanitised base, so they differ only on R9-rewritten lines);
 * (2) it fires for ANY handle at ≥ 0.90, not only the best one (stricter, the safe direction); (3) the quote exemption above.
 * The coverage function and the non-blank rule are the lab's, byte for byte (`inOrderCoverage`, trailing whitespace stripped).
 *
 * MEASURED (PHASE10-PLAN.md §3 W3 + the D5 count, 2026-10-17): 0 of 56 edit-by-reference Authors and 0 of 19 Prometheus/Grafana-only
 * Authors fire; of 34 pre-held whole-file packages, 20 reach ≥ 0.90 and 9 of those WRITE a changed file (11 only quote it unchanged,
 * now exempt). KNOWN LIMITS (recorded, accepted): a whole block that only DELETES or REORDERS lines adds none, so it reads as a quote
 * and ends `no-edits` ⇒ out of scope (re-review EF NOTE-2 — removal is a real obs change type; the Reviewer judges it as before held);
 * a write below 0.90 ends `no-edits` ⇒ out of scope ⇒ the Reviewer judges it as
 * before held; detection does not run in pre-states or platform states (precedence returns first). The "0 of 56" rests on 4 distinct
 * held files of 16–33 lines — re-measure at the first new descriptor or domain (PH-11; panel EF-N3). Do NOT lower the threshold into
 * the 0.65–0.77 band without a new measurement: a legitimate Author reached 0.68.
 *
 * PURE (no prisma, no I/O): the applier, the lab and the corpus runner share it.
 */
import { parseFencedBlocks } from '../package-form-check';
import { grammarLineNumbers, textLines, type ParsedHeldEdits } from './edits';

/** The coverage at or above which a fenced block IS the held file written whole (measured; see the header). */
export const WHOLE_FILE_COVERAGE = 0.9;

/** Non-blank lines, trailing whitespace stripped — EXACTLY the lab scorer's definition the W3 corpus was measured with. */
export const nonBlank = (s: string): string[] => s.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');

/** Fraction of `base`'s non-blank lines that appear, IN ORDER, in `block` (LCS over lines). */
export function inOrderCoverage(base: string, block: string): number {
  const a = nonBlank(base); const b = nonBlank(block);
  if (!a.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length] / a.length;
}

export interface FencedNonGrammarBlock { openLine: number; body: string; inRollback: boolean }

/** Every fenced block of `text` outside the edit grammar, with its body and whether it sits in the rollback section. */
export function nonGrammarFencedBlocks(text: string, parsed: ParsedHeldEdits): FencedNonGrammarBlock[] {
  const g = grammarLineNumbers(parsed);
  const lines = textLines(text);
  const rb = parsed.sections.find((s) => s.kind === 'rollback');
  const out: FencedNonGrammarBlock[] = [];
  for (const b of parseFencedBlocks(text)) {
    const idx: number[] = [];
    for (let n = b.openLine + 1; n < b.closeLine; n++) idx.push(n);
    if (idx.some((n) => g.has(n))) continue;
    out.push({ openLine: b.openLine, body: idx.map((n) => lines[n - 1]).join('\n'),
      inRollback: !!rb && b.openLine > rb.headingLine && b.openLine <= rb.endLine });
  }
  return out;
}

/** Does `block` carry at least one non-blank line that `base` does not? (No ⇒ the block is a QUOTE of the file, D5.) `base` may be
 *  several texts joined — a line counts as added only when none of them carries it. */
export function addsALine(base: string, block: string): boolean {
  const have = new Set(nonBlank(base));
  return nonBlank(block).some((l) => !have.has(l));
}

/** Handles of held files the package writes WHOLE (outside the rollback section), in first-seen order. `texts` per handle are
 *  the texts the Author could have copied from (the held base and the view it was shown); the best coverage counts. */
export function heldFilesWrittenWhole(text: string, parsed: ParsedHeldEdits, files: ReadonlyArray<{ handle: string; texts: string[] }>): string[] {
  const out: string[] = [];
  for (const blk of nonGrammarFencedBlocks(text, parsed)) {
    if (blk.inRollback) continue;
    for (const f of files) {
      if (out.includes(f.handle)) continue;
      // Re-review EF NEW-1 (2026-10-17): COVERED if ANY text the Author could have copied reaches the threshold; ADDS a line only if
      // that line is in NONE of them. Testing each text separately read an unchanged copy of the R9 view as "adds a line" against the
      // base (and the reverse), so a pure quote of a file with an R9-rewritten line was refused NOT_CORRECTABLE.
      const texts = f.texts.filter((t) => !!t);
      if (!texts.some((t) => inOrderCoverage(t, blk.body) >= WHOLE_FILE_COVERAGE)) continue;
      if (addsALine(texts.join('\n'), blk.body)) out.push(f.handle);
    }
  }
  return out;
}
