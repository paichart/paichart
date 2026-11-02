/**
 * PLATFORM-HELD-BYTES Stage B V-3 — THE edit-grammar parser (plan STAGE-B-PLAN.md v4.1 §3 V-3, D-H grammar v1; §0.1 A4,
 * A8, A9, A12). The ONE parser: the applier (`apply.ts`), the diff (`diff.ts`), the correction adoption rule, the dialect-lint
 * variant filter (A12) and rollbackContainment's `held-restore-directive` class (V-8a) all take sections, blocks, directives
 * and spans from here. PURE and env-free (Stage C exports it).
 *
 * GRAMMAR v1 (every string below is an exported constant; the Author-facing clause `HELD_EDIT_CLAUSE` is generated from them):
 *   - Two MACHINE HEADINGS, `Held File Edits` and `Held File Rollback`, each the exact title on its own ATX heading line at
 *     any `#` level. A section runs to the next heading whose level ≤ its own; and each machine heading ENDS the other's
 *     section whatever its level (A9). A per-file sub-heading must be one level DEEPER than its section heading to stay
 *     inside it. Headings are recognised only OUTSIDE fences and OUTSIDE blocks (a `# comment` in a config is not a heading).
 *   - Replace:  `<<<<<<< SEARCH H<n>` (or `… H<n> count=N`) / SEARCH lines / `=======` / REPLACE lines / `>>>>>>> REPLACE`.
 *   - Create:   `<<<<<<< create H<n> on H<k> <path>` / file lines / `>>>>>>> create`. (The plan names the directive
 *               `create H<n> on H<k> <path>`; this is its block form — AE N7 "define it in edits.ts before G1".)
 *   - Restore:  `restore H<n>` on its own line, legal ONLY under the rollback heading; stamped, never applied (so "restore
 *               with no prior candidate" never arises — AE N7). Elsewhere it is COUNTED (`restoreOutsideRollback`).
 *   - Fences: a block may sit inside a ``` / ~~~ fence or not; fence lines (CommonMark, `parseFencedBlocks` — no second
 *     fence parser, PC B-1) are never block content, and a fence line strictly INSIDE a block span is `ambiguous-markers`
 *     (it would silently drop a line of the file).
 *   - Block lines are never trimmed or right-stripped; lines are split on LF only (the applier refuses a CR in REPLACE text).
 *   - Blocks OUTSIDE both sections are counted (`editsOutsideSection`), never applied; blocks INSIDE the rollback section are
 *     `edit-in-rollback-section`.
 */
import { parseFencedBlocks } from '../package-form-check';

export const HELD_EDITS_HEADING = 'Held File Edits';
export const HELD_ROLLBACK_HEADING = 'Held File Rollback';
export const SEARCH_MARKER = '<<<<<<< SEARCH';
export const DIVIDER_MARKER = '=======';
export const REPLACE_MARKER = '>>>>>>> REPLACE';
export const CREATE_OPEN_MARKER = '<<<<<<< create';
export const CREATE_CLOSE_MARKER = '>>>>>>> create';
export const RESTORE_DIRECTIVE = 'restore';
export const HANDLE_RE_SOURCE = 'H[1-9][0-9]{0,2}';

const HANDLE = HANDLE_RE_SOURCE;
const SEARCH_RE = new RegExp(`^<<<<<<< SEARCH (${HANDLE})(?: count=([1-9][0-9]{0,3}))?$`);
const CREATE_RE = new RegExp(`^<<<<<<< create (${HANDLE}) on (${HANDLE}) (\\S(?:.*\\S)?)$`);
const RESTORE_RE = new RegExp(`^restore (${HANDLE})$`);
/** Anything that LOOKS like a marker: a near-miss inside a section is `ambiguous-markers`, never silently prose. */
const MARKERISH_RE = /^\s*(<{7}|>{7}|={7})/;
const ATX_RE = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;

export type SectionKind = 'edits' | 'rollback';
export interface HeldSection { kind: SectionKind; level: number; headingLine: number; startLine: number; endLine: number }

export interface ParsedBlock {
  /** 1-based, in document order over ALL blocks found (in and out of sections). */
  blockIndex: number;
  section: SectionKind | 'outside';
  op: 'replace' | 'create';
  handle: string;
  /** create only: the handle whose file identity (service, target, directory) the new file inherits. */
  onHandle?: string;
  /** create only. */
  path?: string;
  /** replace only, when given. */
  count?: number;
  /** SEARCH lines (replace) — verbatim. */
  search: string[];
  /** REPLACE lines (replace) or the file's lines (create) — verbatim. */
  replace: string[];
  /** 1-based line numbers of the content lines (fence lines excluded). */
  searchLines: number[];
  replaceLines: number[];
  /** 1-based lines of the block's own markers. */
  markerLines: number[];
  openLine: number;
  closeLine: number;
}

export interface ParsedDirective { section: SectionKind | 'outside'; handle: string; line: number }
export interface AmbiguousMarker { line: number; section: SectionKind | 'outside'; reason: string; blockIndex?: number }

export interface ParsedHeldEdits {
  sections: HeldSection[];
  blocks: ParsedBlock[];
  restores: ParsedDirective[];
  /** Marker problems INSIDE a section (outside both, a near-miss is prose). */
  ambiguous: AmbiguousMarker[];
  editsOutsideSection: number;
  restoreOutsideRollback: number;
  /** 1-based lines of every fence open/close in the text (from parseFencedBlocks). */
  fenceLines: number[];
}

function sectionAt(sections: HeldSection[], line: number): SectionKind | 'outside' {
  for (const s of sections) if (line > s.headingLine && line <= s.endLine) return s.kind;
  return 'outside';
}

/**
 * A heading's title as the grammar compares it: a leading SECTION NUMBER is not part of the title (`2. Held File Edits`,
 * `2) Held File Edits`, `3.1 Held File Edits`, `A1: Held File Edits` are the machine heading). The number is digits with optional
 * `.N` parts, optionally after ONE capital letter (Authors number sections `A1`, `V2`, `R1:` — 2026-10-15 corpus scan), then an
 * optional `.`, `)` or `:`, then whitespace. G1 lab (2026-10-15, owner decision): 6 of 50 Authors numbered their sections, every one
 * was refused `edits-outside-section`, and the correction that fixed the title was never adopted. Nothing else is forgiven: a word
 * (`Step 2.`, `Config:`), a bare letter (`A.`), two letters, or any text after the title is a different heading.
 *
 * L-K2 (2026-10-19, owner decision — SUPERSEDES the variant list above with the PROPERTY): the title is what identifies the
 * heading; ONE short LABEL token in front of it is decoration. The label is up to 5 non-space characters that contain at least one
 * NON-LETTER (a digit or punctuation) — `2.`, `3.1`, `A1:`, `B2.1)`, `(a)`, `a)`, `A.`, `iii)`, `§2` — followed by whitespace. A plain
 * WORD is not a label (`No `, `Old `, `Draft `, `Step 2. ` — the word is part of a different heading), and text after the title still
 * makes a different heading. Why: forgiving label styles one at a time (G1 numbers, then L-K2's `(a)`, 1 of 25 Authors) needed a paid
 * lab per variant, and the correction turn cannot rewrite a heading line (register HELD-CORRECTION-HEADING-GUARD) — the property
 * covers every label style at once.
 */
export function machineHeadingTitle(title: string): string {
  return title.replace(/^(?=\S{0,4}[^A-Za-z\s])\S{1,5}[ \t]+/, '');
}

/** Lines exactly as the applier and the diff count them. */
export const textLines = (t: string): string[] => (t ?? '').split('\n');

export function parseHeldEdits(text: string): ParsedHeldEdits {
  const lines = textLines(text);
  const fences = parseFencedBlocks(text ?? '');
  const fenceLineSet = new Set<number>();
  const inFence = new Set<number>();
  for (const f of fences) {
    fenceLineSet.add(f.openLine);
    if (f.closeLine !== f.openLine && f.closeLine <= lines.length) fenceLineSet.add(f.closeLine);
    for (let l = f.openLine + 1; l < f.closeLine; l++) inFence.add(l);
  }

  // Pass 1 — block spans (so headings inside a block body are not headings) and headings outside fences and blocks.
  type Raw = { open: number; close: number | null; kind: 'search' | 'create'; m: RegExpExecArray; divider: number | null; strays: number[] };
  const raws: Raw[] = [];
  const headings: Array<{ line: number; level: number; title: string }> = [];
  let cur: Raw | null = null;
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1; const l = lines[i];
    if (fenceLineSet.has(n)) { if (cur) cur.strays.push(n); continue; }
    if (cur) {
      if (cur.kind === 'search') {
        if (l === DIVIDER_MARKER) { if (cur.divider === null) { cur.divider = n; continue; } cur.strays.push(n); continue; }
        if (l === REPLACE_MARKER) { if (cur.divider !== null) { cur.close = n; raws.push(cur); cur = null; continue; } cur.strays.push(n); continue; }
        if (SEARCH_RE.test(l) || CREATE_RE.test(l)) { raws.push(cur); cur = null; i--; continue; } // unterminated; reopen below
        if (MARKERISH_RE.test(l)) { cur.strays.push(n); continue; }
        continue;
      }
      if (l === CREATE_CLOSE_MARKER) { cur.close = n; raws.push(cur); cur = null; continue; }
      if (SEARCH_RE.test(l) || CREATE_RE.test(l)) { raws.push(cur); cur = null; i--; continue; }
      if (MARKERISH_RE.test(l)) { cur.strays.push(n); continue; }
      continue;
    }
    const s = SEARCH_RE.exec(l);
    if (s) { cur = { open: n, close: null, kind: 'search', m: s, divider: null, strays: [] }; continue; }
    const c = CREATE_RE.exec(l);
    if (c) { cur = { open: n, close: null, kind: 'create', m: c, divider: null, strays: [] }; continue; }
    if (!inFence.has(n)) {
      const h = ATX_RE.exec(l);
      if (h) headings.push({ line: n, level: h[1].length, title: h[2] });
    }
  }
  if (cur) raws.push(cur);

  // Sections: a machine heading runs to the next heading of level ≤ its own, or to the other machine heading (A9).
  const sections: HeldSection[] = [];
  for (let k = 0; k < headings.length; k++) {
    const h = headings[k];
    const t = machineHeadingTitle(h.title);
    const kind: SectionKind | null = t === HELD_EDITS_HEADING ? 'edits' : t === HELD_ROLLBACK_HEADING ? 'rollback' : null;
    if (!kind) continue;
    let end = lines.length;
    for (let j = k + 1; j < headings.length; j++) {
      const o = headings[j];
      const ot = machineHeadingTitle(o.title);
      const otherMachine = (kind === 'edits' && ot === HELD_ROLLBACK_HEADING) || (kind === 'rollback' && ot === HELD_EDITS_HEADING);
      if (o.level <= h.level || otherMachine || ot === t) { end = o.line - 1; break; }
    }
    sections.push({ kind, level: h.level, headingLine: h.line, startLine: h.line + 1, endLine: end });
  }

  // Pass 2 — blocks, directives, near-miss markers.
  const blocks: ParsedBlock[] = [];
  const ambiguous: AmbiguousMarker[] = [];
  const blockLines = new Set<number>();
  for (const r of raws) {
    const section = sectionAt(sections, r.open);
    const close = r.close ?? lines.length;
    for (let x = r.open; x <= close; x++) blockLines.add(x);
    const content = (from: number, to: number) => {
      const ls: string[] = []; const ns: number[] = [];
      for (let x = from; x <= to; x++) if (!fenceLineSet.has(x)) { ls.push(lines[x - 1]); ns.push(x); }
      return { ls, ns };
    };
    const blockIndex = blocks.length + 1;
    const markers = [r.open, ...(r.divider ? [r.divider] : []), ...(r.close ? [r.close] : [])];
    let b: ParsedBlock;
    if (r.kind === 'search') {
      const searchEnd = (r.divider ?? close) - 1;
      const sp = content(r.open + 1, searchEnd);
      const rp = r.divider ? content(r.divider + 1, (r.close ?? lines.length + 1) - 1) : { ls: [], ns: [] };
      b = { blockIndex, section, op: 'replace', handle: r.m[1], ...(r.m[2] ? { count: Number(r.m[2]) } : {}),
        search: sp.ls, replace: rp.ls, searchLines: sp.ns, replaceLines: rp.ns, markerLines: markers, openLine: r.open, closeLine: close };
    } else {
      const cp = content(r.open + 1, (r.close ?? lines.length + 1) - 1);
      b = { blockIndex, section, op: 'create', handle: r.m[1], onHandle: r.m[2], path: r.m[3],
        search: [], replace: cp.ls, searchLines: [], replaceLines: cp.ns, markerLines: markers, openLine: r.open, closeLine: close };
    }
    blocks.push(b);
    if (section !== 'outside') {
      if (r.close === null) ambiguous.push({ line: r.open, section, reason: 'unterminated-block', blockIndex });
      if (r.strays.length) ambiguous.push({ line: r.strays[0], section, reason: 'marker-or-fence-inside-block', blockIndex });
    }
  }

  const restores: ParsedDirective[] = [];
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    if (blockLines.has(n) || fenceLineSet.has(n)) continue;
    const l = lines[i];
    const rm = RESTORE_RE.exec(l);
    if (rm) { restores.push({ section: sectionAt(sections, n), handle: rm[1], line: n }); continue; }
    const section = sectionAt(sections, n);
    if (section !== 'outside' && MARKERISH_RE.test(l)) ambiguous.push({ line: n, section, reason: 'stray-marker' });
  }

  return {
    sections, blocks, restores, ambiguous,
    editsOutsideSection: blocks.filter((b) => b.section === 'outside').length,
    restoreOutsideRollback: restores.filter((r) => r.section !== 'rollback').length,
    fenceLines: [...fenceLineSet].sort((a, b) => a - b),
  };
}

/** Every line the grammar owns — block content + markers, directives, fences — for the correction adoption rule (A8). */
export function grammarLineNumbers(p: ParsedHeldEdits): Set<number> {
  const s = new Set<number>(p.fenceLines);
  for (const b of p.blocks) for (let x = b.openLine; x <= b.closeLine; x++) s.add(x);
  for (const r of p.restores) s.add(r.line);
  return s;
}
