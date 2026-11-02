/**
 * PLATFORM-HELD-BYTES Stage B V-2 — the held VIEW: what an Author is shown of a held file, and the line map the applier
 * checks edits against (plan STAGE-B-PLAN.md v4.1 §3 V-2). PURE and env-free (Stage C exports it): the R9 version is an
 * INPUT, never read from the environment here.
 *
 * V = R9(base) — the same sanitizer every chained text passes through (`sanitizeChainedOutput`), so the Author sees the held
 * file exactly as it would see any chained text, and the platform knows WHICH lines R9 changed: an edit whose SEARCH touches
 * one is refused (`touches-rewritten-line`), because the bytes under it are not the bytes the Author was shown.
 *
 * The map is LINE-FOR-LINE, by construction or not at all: when R9 changes the line COUNT (a multi-line injection span
 * neutralized to one marker, or a text emptied to the full-block marker) there is no honest map, and the view is the named
 * state `view-line-map-unstable` — content-triggerable, expected, fail-closed (the file cannot be edited by reference).
 * A view that is not a well-formed UTF-16 string, or carries U+0000, cannot be stored or rendered: `view-not-rendered`.
 *
 * R9 off (`r9Version === 'none'`): V = base, no line rewritten — the chainer delivers raw text in that posture too.
 */
import { sanitizeChainedOutput } from '@/lib/agents/harness/sanitize-chained-output';
import { countLines } from './canonical-text';

/** The rendering contract version of a held view (`held_views.viewVersion`). A change to how this module renders bumps it. */
export const HELD_VIEW_VERSION = 'paichart.view/1';

export type BuiltView =
  | { ok: true; viewText: string; lineCount: number; rewrittenLines: number[]; r9Version: string; viewVersion: string }
  | { ok: false; state: 'view-line-map-unstable' | 'view-not-rendered'; r9Version: string; viewVersion: string };

/** Lines as the applier and the diff count them: split on LF only (a CR stays part of its line — `replace-unbindable`
 *  refuses an edit carrying one; a LONE CR is refused at decode, so a CR only ever ends a CRLF line). 1-based numbering. */
export const splitLines = (t: string): string[] => t.split('\n');

export function buildView(baseText: string, r9Version: string): BuiltView {
  const viewVersion = HELD_VIEW_VERSION;
  const viewText = r9Version === 'none' ? baseText : sanitizeChainedOutput(baseText).text;
  if (!viewText.isWellFormed() || viewText.includes('\u0000')) return { ok: false, state: 'view-not-rendered', r9Version, viewVersion };
  const b = splitLines(baseText), v = splitLines(viewText);
  if (b.length !== v.length) return { ok: false, state: 'view-line-map-unstable', r9Version, viewVersion };
  const rewrittenLines: number[] = [];
  for (let i = 0; i < v.length; i++) if (v[i] !== b[i]) rewrittenLines.push(i + 1);
  // lineCount by Stage A's definition (the ref's own count — a final newline closes the last line, it opens none).
  return { ok: true, viewText, lineCount: countLines(viewText), rewrittenLines, r9Version, viewVersion };
}
