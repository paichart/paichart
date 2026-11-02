/**
 * held-network step 3 push 2 (STEP3-INVENTORY §8, the hierarchy-form audit) — the ONE classifier of how a device configuration
 * TEXT expresses its hierarchy. Shared by the two checks that read hierarchy: the Git-file vs device comparison
 * (git-device-comparison.ts) and quoteFidelity's device-read stanza matcher (quote-fidelity.ts). PURE, vendor-agnostic: it reads the
 * text's SHAPE (indentation, braces, flat `set` statements), never a vendor keyword.
 *
 * FORMS (decided over the configuration STATEMENTS — blank lines, comment/separator lines, a top-level `end` and banner bodies are
 * not statements; the same skips the comparison applies):
 *   indent             at least one statement is indented and none opens a brace block — IOS / IOS-XE / NX-OS / EOS / IOS-XR style.
 *                      PARSED: a statement's parents are the nearest preceding less-indented statements.
 *   braces             at least one statement ends with `{`, and every brace block's first child is indented deeper than its opener
 *                      — the hierarchical display of a brace-structured configuration. PARSED by the same indentation rule
 *                      (closing-brace lines are structure, not statements).
 *   set                every statement is a flat `set …` / `delete …` statement — each carries its WHOLE path in its own text, so
 *                      there is no parent to lose: PARSED as flat statements (a statement under another path is another line).
 *   flat               no statement is indented, none opens a brace block, and the text is not `set` form — no hierarchy is
 *                      expressed (a few top-level lines). PARSED trivially.
 *   braces-unindented  a brace block whose child is NOT indented deeper than its opener — the hierarchy lives only in the braces,
 *                      which neither check walks. NOT PARSED: a check must report it by name, never compare it as if flat (a line
 *                      moved between brace blocks would read identical — a silent pass).
 *   empty              no statement at all.
 *
 * Real file/device PAIRS exist for one platform family only (indent form, EOS lab rig); every other form is proven by synthetic
 * fixtures (scripts/test-config-hierarchy.ts) — coverage stated honestly (register NETWORK-PLATFORM-PROFILE, NETWORK-SECOND-VENDOR-RIG).
 */

export type HierarchyForm = 'indent' | 'braces' | 'set' | 'flat' | 'braces-unindented' | 'empty';
export const CONFIG_HIERARCHY_VERSION = 1;

export interface ConfigStatement { indent: number; text: string }

/** Indentation width: a space is 1, a tab is 8 (one text is always measured against itself). */
export function indentWidth(raw: string): number {
  let n = 0;
  for (const ch of raw) { if (ch === ' ') n++; else if (ch === '\t') n += 8; else break; }
  return n;
}

const CLOSE_BRACE_RE = /^\}+;?$/;
const SET_STATEMENT_RE = /^(?:set|delete)\s+\S/;

/**
 * The statements of a configuration text, in order: trailing whitespace off; blank lines, comment/separator lines (first non-blank
 * character `!` or `#`), a top-level `end` and banner blocks dropped. Closing-brace lines ARE returned (`isClose`) so the form check
 * can see brace structure; consumers that compare lines skip them.
 */
export function configStatements(text: string): Array<ConfigStatement & { isClose: boolean }> {
  const out: Array<ConfigStatement & { isClose: boolean }> = [];
  let banner: { delim: string | null } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.replace(/\s+$/, '');
    const trimmed = t.trim();
    if (banner) {
      if (banner.delim === null ? trimmed === 'EOF' : trimmed.includes(banner.delim)) banner = null;
      continue;
    }
    if (trimmed === '') continue;
    if (trimmed.startsWith('!') || trimmed.startsWith('#')) continue;
    const indent = indentWidth(t);
    if (indent === 0 && trimmed === 'end') continue;
    const b = indent === 0 ? /^banner\s+\S+(?:\s+(.*))?$/i.exec(trimmed) : null;
    if (b) {
      const rest = (b[1] ?? '').trim();
      if (rest === '') { banner = { delim: null }; continue; }
      const delim = rest.startsWith('^') && rest.length >= 2 ? rest.slice(0, 2) : rest.slice(0, 1);
      if (!rest.slice(delim.length).includes(delim)) banner = { delim };
      continue;
    }
    out.push({ indent, text: trimmed, isClose: CLOSE_BRACE_RE.test(trimmed) });
  }
  return out;
}

/** The hierarchy form of a configuration text (see the module header). */
export function configHierarchyForm(text: string): HierarchyForm {
  return hierarchyFormOf(configStatements(text));
}

export function hierarchyFormOf(stmts: ReadonlyArray<ConfigStatement & { isClose: boolean }>): HierarchyForm {
  const open = stmts.filter((s) => !s.isClose);
  if (open.length === 0) return 'empty';
  if (open.every((s) => SET_STATEMENT_RE.test(s.text))) return 'set';
  let braces = false;
  for (let i = 0; i < stmts.length; i++) {
    if (stmts[i].isClose || !stmts[i].text.endsWith('{')) continue;
    braces = true;
    const next = stmts[i + 1];
    // An empty block (`x { }` split as `x {` then `}`) has no child to place; a child at or above its opener's indentation does
    // not express the hierarchy the braces carry.
    if (next && !next.isClose && next.indent <= stmts[i].indent) return 'braces-unindented';
  }
  if (braces) return 'braces';
  return open.some((s) => s.indent > 0) ? 'indent' : 'flat';
}

/** Forms whose hierarchy the indentation rule recovers (or that carry none to recover). */
export function isParsedForm(f: HierarchyForm): boolean {
  return f === 'indent' || f === 'braces' || f === 'set' || f === 'flat' || f === 'empty';
}

/**
 * May two PARSED texts be compared line-by-parent? Equal forms, or a `flat` text (no hierarchy expressed) against an indented or
 * brace-structured one. A `set` text against any other form expresses the same configuration in different statements — every line
 * would read absent — so it is not compared (named `hierarchy-forms-differ`), never reported as N differences.
 */
export function formsComparable(a: HierarchyForm, b: HierarchyForm): boolean {
  if (!isParsedForm(a) || !isParsedForm(b)) return false;
  if (a === b || a === 'empty' || b === 'empty') return true;
  const hier = (f: HierarchyForm) => f === 'indent' || f === 'braces';
  return (a === 'flat' && hier(b)) || (b === 'flat' && hier(a));
}
