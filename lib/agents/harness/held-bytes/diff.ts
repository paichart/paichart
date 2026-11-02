/**
 * PLATFORM-HELD-BYTES Stage B V-3 — `renderEditDiff`: the diff the Reviewer reads (plan STAGE-B-PLAN.md v4.1 §3 V-3; V-6
 * renders it into the Reviewer's §6 from a SERVER-SIDE recompute, never from text an agent supplied). PURE and env-free.
 *
 * Per file, one hunk per applied edit occurrence: `-` lines are the SEARCH lines (lines of V, which equal B there by the
 * applier's construction), `+` lines are the REPLACE lines VERBATIM, context lines come from V. Width: the WHOLE file when it
 * is ≤ 200 lines (one block, every hunk in place), otherwise each hunk with its enclosing top-level section (from the nearest
 * line at column 0 above the hunk to the line before the next one below it). The header states facts only — handle, the path
 * through R9's defang, mode, applied n/m, +added/−removed, refused names, `rollback: restore H<n>` — and, for a `diff-only`
 * file, how many context lines carry a redaction placeholder (the platform holds those bytes; they cannot be applied from
 * the diff). Pinned: the `+` lines are the candidate's lines; applying the hunks to the base yields the candidate.
 * A REFUSED file is a header-only block (`· not applied · refused: …`, PC-P2-1): named, with no hunks.
 */
import { sanitizeChainedOutput } from '../sanitize-chained-output';
import { textLines } from './edits';
import { countPlaceholders } from './canonical-text';
import type { EditApplication, FileApplication } from './apply';

export const DIFF_WHOLE_FILE_MAX_LINES = 200;

const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ');
const defang = (s: string) => oneLine(sanitizeChainedOutput(s).text).slice(0, 256);

function viewBody(v: string): string[] {
  const ls = textLines(v);
  if (v.endsWith('\n')) ls.pop();
  return v === '' ? [] : ls;
}

/** The enclosing top-level section of 1-based lines [a, z] in `lines`: from the nearest column-0 line at or above `a`
 *  to the line before the next column-0 line below `z`. A blank line is not a section start. */
function enclosing(lines: string[], a: number, z: number): [number, number] {
  const top = (l: string) => l.length > 0 && !/^\s/.test(l);
  let s = a; while (s > 1 && !top(lines[s - 1])) s--;
  let e = z; while (e < lines.length && !top(lines[e])) e++;
  return [s, e];
}

export interface RenderedFileDiff { handle: string; header: string; lines: string[] }

export function renderFileDiff(viewText: string, f: FileApplication, extras: { refused?: string[]; rollback?: boolean } = {}): RenderedFileDiff {
  const v = viewBody(viewText);
  const hunks = f.hunks ?? [];
  const parts = [
    `${f.handle} — ${defang(f.path)}`, f.op === 'create' ? `create on ${f.onHandle}` : null, `mode ${f.mode}`,
    `applied ${f.applied}/${f.total}`, `+${f.addedLines} −${f.removedLines}`,
    extras.refused?.length ? `refused: ${extras.refused.join(', ')}` : null,
    extras.rollback ? `rollback: restore ${f.handle}` : null,
  ].filter(Boolean);
  const header = parts.join(' · ');
  const out: string[] = [];
  if (f.op === 'create') {
    out.push('@@ new file @@');
    for (const l of textLines(f.candidateText ?? '').slice(0, (f.candidateText ?? '').endsWith('\n') ? -1 : undefined)) out.push(`+${l}`);
    return { handle: f.handle, header, lines: out };
  }
  const emit = (from: number, to: number, hs: typeof hunks) => {
    let n = from;
    for (const h of hs) {
      for (; n < h.start; n++) out.push(` ${v[n - 1]}`);
      out.push(`@@ edit block ${h.block} · V lines ${h.start}–${h.start + h.searchLen - 1} @@`);
      for (let j = 0; j < h.searchLen; j++) out.push(`-${v[h.start - 1 + j]}`);
      for (const r of h.replace) out.push(`+${r}`);
      n = h.start + h.searchLen;
    }
    for (; n <= to; n++) out.push(` ${v[n - 1]}`);
  };
  if (v.length <= DIFF_WHOLE_FILE_MAX_LINES) emit(1, v.length, hunks);
  else {
    // Merge hunks whose enclosing sections touch, so a section is never printed twice.
    const groups: Array<{ s: number; e: number; hs: typeof hunks }> = [];
    for (const h of hunks) {
      const [s, e] = enclosing(v, h.start, h.start + h.searchLen - 1);
      const g = groups[groups.length - 1];
      if (g && s <= g.e + 1) { g.e = Math.max(g.e, e); g.hs.push(h); } else groups.push({ s, e, hs: [h] });
    }
    for (const g of groups) { out.push(`@@ section V lines ${g.s}–${g.e} @@`); emit(g.s, g.e, g.hs); }
  }
  if (f.mode === 'diff-only') {
    const ph = out.filter((l) => l.startsWith(' ') && countPlaceholders(l) > 0).length;
    out.push(`(${ph} context line(s) shown carry a redaction placeholder: the platform holds those bytes; this file is applied from the platform's held copy, never from this diff)`);
  }
  return { handle: f.handle, header, lines: out };
}

/** The whole package's diff text, file by file in handle order of the application. `views` maps handle → V. */
export function renderEditDiff(views: Record<string, string>, app: EditApplication): string {
  const blocks: string[] = [];
  const refusedBy = new Map<string, string[]>();
  for (const r of app.refusals) if (r.handle) refusedBy.set(r.handle, [...(refusedBy.get(r.handle) ?? []), r.name]);
  const rolled = new Set(app.rollback.map((r) => r.handle));
  for (const f of app.files) {
    // PC-P2-1 (G3 entry, decision 2, 2026-10-16): a file the platform REFUSED is named — header only, no hunks — so the Reviewer
    // sees which file and which refusal; before, it appeared nowhere. Applied files render exactly as before.
    if (f.state === 'refused') {
      const names = refusedBy.get(f.handle);
      blocks.push(`#### ${[`${f.handle} — ${defang(f.path)}`, f.op === 'create' ? `create on ${f.onHandle}` : null, 'not applied',
        names?.length ? `refused: ${names.join(', ')}` : null].filter(Boolean).join(' · ')}`);
      continue;
    }
    if (f.state !== 'applied') continue;
    const d = renderFileDiff(views[f.op === 'create' ? (f.onHandle as string) : f.handle] ?? '', f, { refused: refusedBy.get(f.handle), rollback: rolled.has(f.handle) });
    // The fence is longer than the longest backtick run in the diff, so file content can never close it.
    const run = Math.max(2, ...d.lines.map((l) => Math.max(0, ...(l.match(/`+/g) ?? []).map((m) => m.length))));
    const fence = '`'.repeat(run + 1);
    blocks.push([`#### ${d.header}`, `${fence}diff`, ...d.lines, fence].join('\n'));
  }
  for (const h of rolled) if (!app.files.some((f) => f.handle === h && f.state === 'applied')) blocks.push(`#### ${h} · rollback: restore ${h} (no edit applied to this file)`);
  return blocks.join('\n\n');
}
