/**
 * Requirements CITATION gate — TypeScript port of scripts/check-requirements-citations.py (2026-10-09).
 *
 * Python is the rule source (read its docstring); this is the in-run copy, held to it by
 * scripts/test-requirements-form-check-parity.ts, which compares the FULL CLI stdout and exit code — the Python keeps
 * all of its logic in main(), so the rendered text is the only complete observable. Findings are strings because the
 * Python's are; the fact carries them verbatim (with the line number the string already names).
 *
 * PURE: objective + draft text in, findings out.
 */
import { cpSlice, pyFind, pyFinditer, pyRe, pySplit } from './requirements-pysem';

const CITE = pyRe('\\(?declared — item (\\d+)(?::\\s*"([^"]*)")?\\)?');
const TOKENS = ['network-provisioning', 'kubernetes-gitops', 'terraform-iac', 'observability-config'];
const ITEM_RE = pyRe('^\\s*(\\d{1,2})\\.\\s(.*?)(?=^\\s*\\d{1,2}\\.\\s|\\n\\n|\\Z)', { m: true, s: true });
const TRAIL = pyRe('[.;,]$');
const ITEM_REF = pyRe('\\bitems?\\s+(\\d{1,2})(?:\\s*[–-]\\s*(\\d{1,2}))?\\b');
const EXTRA = pyRe('(?<!declared — )\\bitem (\\d+):\\s*"([^"]*)"');
// A row is DECLARED when its SOURCE cell (the last) says so — never the word anywhere in the row (the `target-absent`
// question text reads "the declared target …"; 2026-10-11, mirrors check-requirements-citations.py).
const DECLARED_ROW = pyRe('^\\|[^|\\n]+\\|.*\\|\\s*\\(?declared\\b[^|\\n]*\\|[ \\t]*$', { m: true });

function norm(s: string): string {
  return pySplit(s.split('\\`').join('`').split('`').join('').split('—').join('-').split('–').join('-')).join(' ');
}

/** Port of `items_of` (citations' own `norm`: backticks dropped, em/en dash → '-'). First occurrence of a number wins. */
export function citationItems(objective: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of pyFinditer(ITEM_RE, objective)) {
    const n = parseInt(m[1], 10);
    if (!out.has(n)) out.set(n, norm(m[2]));
  }
  return out;
}

/** Port of `quote_ok` — null if the quote passes, else the reason. */
export function quoteOk(quote: string, item: string): string | null {
  if (quote.includes('{{')) return 'template placeholder inside the quote';
  if (quote.includes('…') || quote.includes('...')) return 'ellipsis join (a quote must be one contiguous span)';
  let q = norm(quote);
  q = q.replace(new RegExp(TRAIL.source, TRAIL.flags + 'g'), '');
  if (!q) return 'empty quote';
  if (item.includes(q)) return null;
  const cps = Array.from(q);
  const rest = cps.slice(1).join('');
  if (item.includes((cps[0] || '').toLowerCase() + rest) || item.includes((cps[0] || '').toUpperCase() + rest)) return null;
  return 'not a verbatim span of the item';
}

/** One counted citation, keyed for the correction ADOPTION rule (Z66, 2026-10-12; TS-only — no Python counterpart,
 *  because the publish pass has no adoption rule and the CLI output is unchanged). `scope` is the citing row's leg token
 *  for a citation on a Design decisions table row (stable when the row is re-keyed `<token>.item-<N>` or merged with
 *  another row citing the same item), else the enclosing `## ` heading (stable: a correction may not change headings). */
export interface CitedUnit {
  item: number;
  scope: string;
  verbatim: boolean;
  /** Verbatim units only (Z66 review F1): the item WORDS the quote covers — [first word index, word count] in the
   *  normalized item text. A scope's union of these may not shrink on adoption, so merging two quotes of one item into
   *  one quote that spans both is neutral, while dropping half an item's text is not. */
  words?: [number, number];
}

/** The item words a passing quote covers (the same match quoteOk makes): [first word, count], or null if not found. */
export function quoteWordSpan(quote: string, item: string): [number, number] | null {
  let q = norm(quote);
  q = q.replace(new RegExp(TRAIL.source, TRAIL.flags + 'g'), '');
  if (!q) return null;
  const cps = Array.from(q);
  const rest = cps.slice(1).join('');
  let at = item.indexOf(q);
  if (at < 0) at = item.indexOf((cps[0] || '').toLowerCase() + rest);
  if (at < 0) at = item.indexOf((cps[0] || '').toUpperCase() + rest);
  if (at < 0) return null;
  const end = at + q.length;
  let first = -1, count = 0, pos = 0;
  item.split(' ').forEach((w, i) => {
    const ws = pos, we = pos + w.length;
    pos = we + 1;
    if (we > at && ws < end) { if (first < 0) first = i; count++; }
  });
  return first < 0 ? null : [first, count];
}

export interface CitationResult {
  total: number;
  verbatim: number;
  /** Every counted citation, in document order (total === cited.length; verbatim === the count with verbatim true). */
  cited: CitedUnit[];
  /** [token, has premise branch] — only for legs whose table carries `<token>.admitted-principal`. */
  premise: Array<[string, boolean]>;
  findings: string[];
}

/** The citation's scope (see CitedUnit). */
function citationScope(draft: string, at: number, inTable: boolean): string {
  if (inTable) {
    const ls = draft.lastIndexOf('\n', at - 1) + 1;
    const le = draft.indexOf('\n', at);
    const line = draft.slice(ls, le < 0 ? draft.length : le);
    if (line.trimStart().startsWith('|')) {
      const cell = (line.split('|')[1] ?? '').split('`').join('').trim();
      if (cell) return `row:${cell.split('.')[0]}`;
    }
  }
  const h = draft.lastIndexOf('\n## ', at);
  const hs = h >= 0 ? h + 1 : (draft.startsWith('## ') && at > 0 ? 0 : -1);
  if (hs < 0) return 'section:(preamble)';
  const he = draft.indexOf('\n', hs);
  return `section:${draft.slice(hs + 3, he < 0 ? draft.length : he).trim()}`;
}

function countNl(s: string, end: number): number {
  let n = 0;
  for (let i = s.indexOf('\n'); i >= 0 && i < end; i = s.indexOf('\n', i + 1)) n++;
  return n;
}

export function checkCitations(objective: string, draft: string): CitationResult {
  const items = citationItems(objective);
  const findings: string[] = [];
  const cited: CitedUnit[] = [];
  let total = 0, ok = 0;
  const t0 = pyFind(draft, '## Design decisions');
  const t1 = t0 >= 0 ? pyFind(draft, '\n## ', t0 + 5) : -1;
  for (const m of pyFinditer(CITE, draft)) {
    const inTable = t0 >= 0 && t0 <= m.index && m.index < (t1 > 0 ? t1 : draft.length);
    if (m[2] === undefined && !inTable) continue;
    total++;
    const n = parseInt(m[1], 10), quote = m[2];
    const line = countNl(draft, m.index) + 1;
    let isVerbatim = false;
    if (!items.has(n)) findings.push(`line ${line}: item ${n} does not exist in the objective`);
    else if (quote === undefined) findings.push(`line ${line}: item ${n} cited with no quote`);
    else {
      const why = quoteOk(quote, items.get(n)!);
      if (why) findings.push(`line ${line}: item ${n} — ${why}: "${cpSlice(quote, 90)}"`);
      else { ok++; isVerbatim = true; }
    }
    const words = isVerbatim ? quoteWordSpan(quote!, items.get(n)!) : null;
    cited.push({ item: n, scope: citationScope(draft, m.index, inTable), verbatim: isVerbatim, ...(words ? { words } : {}) });
  }

  const w = pyFind(draft, '## Writing rules');
  const body = w >= 0 ? draft.slice(0, w) : draft;
  const top = items.size ? Math.max(...items.keys()) : 0;
  const seenBad = new Set<string>();
  for (const m of pyFinditer(ITEM_REF, body)) {
    for (const g of [m[1], m[2]]) {
      if (g && !items.has(parseInt(g, 10)) && !seenBad.has(`${parseInt(g, 10)}@${m.index}`)) {
        seenBad.add(`${parseInt(g, 10)}@${m.index}`);
        findings.push(`line ${countNl(body, m.index) + 1}: item ${g} is referenced but the objective has items 1–${top}`);
      }
    }
  }
  for (const m of pyFinditer(EXTRA, body)) {
    const n = parseInt(m[1], 10);
    if (items.has(n)) {
      const why = quoteOk(m[2], items.get(n)!);
      if (why) findings.push(`line ${countNl(body, m.index) + 1}: item ${n} (extra citation) — ${why}: "${cpSlice(m[2], 90)}"`);
    }
  }

  const s = pyFind(draft, '## Design decisions');
  const e = s >= 0 ? pyFind(draft, '\n## ', s + 5) : -1;
  const table = s >= 0 && e > 0 ? draft.slice(s, e) : '';
  const rest = s >= 0 && e > 0 ? draft.slice(0, s) + draft.slice(e) : draft;
  const premise: Array<[string, boolean]> = [];
  for (const t of TOKENS) {
    if (table.includes(`${t}.admitted-principal`)) {
      const has = rest.includes(`${t}.principal-unseen`);
      premise.push([t, has]);
      if (!has) findings.push(`${t}: authorisation leg with no premise branch citing \`${t}.principal-unseen\` outside the table`);
    }
  }
  const declaredRows = pyFinditer(DECLARED_ROW, table).length;
  if (total === 0 && declaredRows) {
    findings.push(`${declaredRows} declared row(s) in the Design decisions table but 0 citations parsed — the citation form drifted; a zero here is NOT clean`);
  }
  return { total, verbatim: ok, cited, premise, findings };
}

/** The Python CLI's stdout and exit code, byte for byte (the parity observable). */
export function renderCitationsCli(r: CitationResult): { stdout: string; exit: number } {
  const lines = [`citations: ${r.total} total, ${r.verbatim} verbatim, ${r.total - r.verbatim} failing`];
  lines.push('premise branches: ' + (r.premise.map(([t, v]) => `${t} ${v ? '✓' : '✗'}`).join(', ') || 'no authorisation legs found'));
  if (r.findings.length) {
    lines.push(`❌ NOT publishable — ${r.findings.length} finding(s):`);
    for (const f of r.findings) lines.push(`  - ${f}`);
    return { stdout: lines.join('\n') + '\n', exit: 1 };
  }
  lines.push('✅ citation + premise gate clean (the Reviewer still owns: does each quote select the same option as the item?)');
  return { stdout: lines.join('\n') + '\n', exit: 0 };
}
