/**
 * Requirements DROPPED-CLAUSE scorer — TypeScript port of scripts/check-requirements-clauses.py (2026-10-09).
 *
 * Python is the rule source (read its docstring: B-1's obligation class only — an item obliging a package to STATE /
 * LIST / REPORT / PUBLISH / RECORD / NAME something; the object of that verb must reach the leg's section). Held to it
 * by scripts/test-requirements-form-check-parity.ts on `{checked, dropped}` (the CLI's --json).
 *
 * THE ITEM → ROW MAP. The Python reads the owner's `<!-- ROW-ITEM-MAP -->` from answers.md, which exists only in the
 * skill's work directory. In a run, two sources are possible and both are implemented here:
 *   - `rowItemMapFromAnswers(text)` — the owner's map (port of `row_map`); the in-run source when the launch carries it;
 *   - `rowItemMapFromDraft(draft)` — derived from the draft's own Design-decisions table: each row's LEADING citation
 *     `(declared — item N` / `(forced — item N`, plus any extra `item N: "…"` citation in the same cell.
 * The derived map is circular by construction (a row the Author never cited maps to nothing, so its item is skipped —
 * fail-OPEN for that item); its measured agreement with the owner's map is recorded in PORT-NOTE.md. `checkClauses`
 * takes the map, never a source, so the caller stamps which one it used.
 *
 * PURE.
 */
import { cpSlice, pyFind, pyFinditer, pyMatch, pyRe, pySplit } from './requirements-pysem';
import { DD_HEADING, mdSection, parseTableRows } from './requirements-coverage';

const TOKENS = ['network-provisioning', 'kubernetes-gitops', 'terraform-iac', 'observability-config'];

function norm(s: string): string {
  return pySplit(s.split('`').join('').split('–').join('-')).join(' ');
}

const ITEM_RE = pyRe('^\\s*(\\d{1,2})\\.\\s(.*?)(?=^\\s*\\d{1,2}\\.\\s|\\n\\n|\\Z)', { m: true, s: true });
export function clauseItems(objective: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of pyFinditer(ITEM_RE, objective)) {
    const n = parseInt(m[1], 10);
    if (!out.has(n)) out.set(n, norm(m[2]));
  }
  return out;
}

export type RowItemMap = Map<number, Set<string>>;

const MAP_ROW = pyRe('^\\|\\s*`([^`]+)`[^|]*\\|\\s*(\\d+)\\s*\\|');
/** Port of `row_map(answers)`. */
export function rowItemMapFromAnswers(answers: string): RowItemMap {
  const i = answers.indexOf('ROW-ITEM-MAP');
  const m: RowItemMap = new Map();
  for (const line of answers.slice(i).split('\n')) { // i = -1 → the LAST character, exactly as Python's answers[-1:]
    const r = pyMatch(MAP_ROW, line);
    if (r) {
      const n = parseInt(r[2], 10);
      if (!m.has(n)) m.set(n, new Set());
      m.get(n)!.add(r[1]);
    }
  }
  return m;
}

const LEAD_CITE = pyRe('^[(*\\s]*(?:declared|forced)\\s+—\\s+items?\\s+(\\d+)', { i: true });
const EXTRA_CITE = pyRe('(?<!declared — )\\bitem (\\d+):\\s*"');
/** The draft-derived map (in-run fallback; see the header). */
export function rowItemMapFromDraft(draft: string): RowItemMap {
  const dd = mdSection(draft, DD_HEADING);
  const m: RowItemMap = new Map();
  if (dd === null) return m;
  const add = (n: number, rid: string) => { if (!m.has(n)) m.set(n, new Set()); m.get(n)!.add(rid); };
  for (const row of parseTableRows(dd)) {
    const src = row.source.trim();
    const lead = pyMatch(LEAD_CITE, src);
    if (lead) add(parseInt(lead[1], 10), row.id);
    // extra citations: outside quoted spans only (an item number INSIDE a quote is the item's own text)
    const unquoted = src.replace(/"[^"]*"/g, '""');
    for (const x of pyFinditer(EXTRA_CITE, unquoted)) add(parseInt(x[1], 10), row.id);
  }
  return m;
}

const STOP = new Set(pySplit(`the a an and or of to in on for with by from at as is are be it its this that these those which who whom
whose not no nor only any each every all both either never also than then there their them they he she we you your our
was were has have had will would shall should may might must can could does did done do into onto over under after
before between within without about above below per via leg legs item items rule rules value values when where while
if else what whatever whose own same other another such more most less least one two first second`));

const LEG_HEAD = pyRe('^## Pipeline \\d+ objective\\b.*$', { m: true });
function legSections(draft: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of pyFinditer(LEG_HEAD, draft)) {
    const head = m[0];
    const tok = TOKENS.find(t => head.includes(t));
    if (!tok) continue;
    const end = m.index + head.length;
    const nx = pyFind(draft, '\n## ', end);
    out.set(tok, (out.get(tok) || '') + draft.slice(end, nx > 0 ? nx : draft.length));
  }
  return out;
}

const NA_LINE = pyRe('^\\s*(?:[-*]\\s+)?`?([a-z0-9-]+\\.[a-z0-9.-]+)`?\\s*—.*\\btier:\\s*`?not-applicable', { m: true });
function notApplicable(draft: string): Set<string> {
  const s = pyFind(draft, '## Decisions needed from the owner');
  const e = pyFind(draft, '\n## ', s + 5);
  const block = s >= 0 ? draft.slice(s, e) : ''; // e = -1 → slice(s, -1) drops the last char, as Python's [s:-1]
  return new Set(pyFinditer(NA_LINE, block).map(m => m[1]));
}

const THAT = pyRe('\\bthat\\b');
const ANCHOR_TOK = pyRe("[a-z0-9][a-z0-9'-]*");
// Group 2 (2026-10-11, Z61) — mirrors check-requirements-clauses.py: "one" is a determiner ("each one"); linking words
// ("instead", "rather") carry no obligation; `stem` folds verb forms; a sentence that names a leg obliges that leg only.
const ANCHOR_DROP = new Set(['the', 'a', 'an', 'this', 'and', 'its', 'own', 'as', 'each', 'every', 'any', 'that', 'one']);
const ANCHOR_LINKING_WORDS = new Set(['instead', 'rather']);
const ANCHOR_SKIP = pyRe('(?:\\d+|item|items|gap)$');
// Z48 / Z49 lab L10 (2026-10-10) — mirrors check-requirements-clauses.py: pronoun objects carry no anchor; anchors drop
// prepositions/pronouns (never the wider STOP set — item 21's real catch anchors on "what else"); an obligation verb
// after a determiner or modifier is a noun ("the same list the Allow uses").
const ANCHOR_FUNCTION_WORDS = new Set(['in', 'on', 'at', 'to', 'of', 'for', 'with', 'by', 'from', 'into', 'onto', 'them', 'it',
  'they', 'these', 'those', 'him', 'her', 'us',
  // checker fix 2: a copula carries no content ("what WAS absent" anchors "what absent")
  'is', 'are', 'was', 'were', 'be', 'been']);
const NOUN_BEFORE = new Set(['the', 'a', 'an', 'same', 'that', 'this', 'host', 'address', 'each', 'every', 'its', 'their', 'whose',
  'our', 'your', 'one', 'no']);
const PREV_WORD = pyRe('([A-Za-z]+)\\W*$');
function nounUse(text: string, start: number): boolean {
  const prev = pyFinditer(PREV_WORD, text.slice(0, start))[0];
  return !!prev && NOUN_BEFORE.has(prev[1].toLowerCase());
}

// Checker fix 2 (2026-10-12, lab L11) — mirrors check-requirements-clauses.py: the PARTICIPLE of an obligation verb
// ("reports a gap NAMING what was absent") opens a NESTED obligation; the outer object ends where it begins — never
// after a NOUN_BEFORE word ("publishes the RECORDING rules" is a noun phrase; execution-facts review C1).
const PARTICIPLES = 'stating|listing|reporting|publishing|recording|naming';
const NOT_AFTER_DETERMINER = [...NOUN_BEFORE].sort().map(w => `(?<!\\b${w})`).join('');
const OBLIGATION = pyRe("(?<!host )\\b(states?|lists?|reports?|publish(?:es)?|records?|names?|" + PARTICIPLES + ")\\b"
  + "(?:,? in [^,]*,)?\\s+(?:as \\w+ )?([^;.(),]+?)"
  + "(?=\\s+and\\s|" + NOT_AFTER_DETERMINER + "\\s+(?:" + PARTICIPLES + ")\\b|[;.(),]|$)", { i: true });

// Checker fix 2 (2026-10-12, lab L11) — mirrors check-requirements-clauses.py: a LOCATION phrase ("in its deliverable")
// says WHERE the leg writes, not WHAT; dropped from the anchor only when the object still yields two content words
// without it (a one-word anchor is near-vacuous: "names this effect in its package" keeps "effect package").
// A location is one or more determiners + a DOCUMENT place (execution-facts review C3): "the change in membership" and
// "in the audit log" are part of WHAT is reported.
const LOCATION = pyRe("\\b(?:in|into|inside|within)\\s+(?:(?:its|their|the|a|an|own|published|each|every)\\s+)+"
  + "(?:deliverable|package|report(?:\\.md)?|section|output|pr|notes?)\\b", { i: true });

function anchorWords(obj: string): string[] {
  const toks = pyFinditer(ANCHOR_TOK, obj.toLowerCase()).map(m => m[0]).filter(w => !ANCHOR_DROP.has(w));
  return toks.filter(w => !pyMatch(ANCHOR_SKIP, w) && !ANCHOR_FUNCTION_WORDS.has(w) && !ANCHOR_LINKING_WORDS.has(w));
}

function objectAnchor(obj: string): string {
  const t = pyFinditer(THAT, obj)[0];
  const o = t ? obj.slice(0, t.index) : obj;
  // re.sub(LOCATION, ' ', o)
  let unlocated = '', last = 0;
  for (const m of pyFinditer(LOCATION, o)) { unlocated += o.slice(last, m.index) + ' '; last = m.index + m[0].length; }
  unlocated += o.slice(last);
  const u = anchorWords(unlocated);
  return (u.length >= 2 ? u : anchorWords(o)).slice(0, 2).join(' ');
}

function stem(w: string): string {
  w = w.replace(/'+$/, '');
  let folded = false;
  for (const suf of ['ing', 'ed', 'es']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) { w = w.slice(0, -suf.length); folded = true; break; }
  }
  if (!folded && w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w.slice(0, 6);
}

/** Port of `named_legs`: the leg tokens named in the sentence holding the obligation at `start` (empty = every leg). */
function namedLegs(text: string, start: number): Set<string> {
  const a = Math.max(text.lastIndexOf('. ', start - 1), text.lastIndexOf('; ', start - 1));
  const ends = [text.indexOf('. ', start), text.indexOf('; ', start)].filter(i => i >= 0);
  const b = ends.length ? Math.min(...ends) : text.length;
  const sentence = text.slice(a >= 0 ? a + 1 : 0, b);
  return new Set(TOKENS.filter(t => sentence.includes(t)));
}

// False-alarm fixes (2026-10-12, size plan step 2) — mirrors check-requirements-clauses.py: two CLOSED synonym sets,
// folded on both sides: exactness (literal = verbatim = exact) and the leg's own output (package = deliverable =
// report.md; never "report" alone, "section" or "output").
// WHOLE WORDS only, folded before `stem` (review: on the stem, "delivered" / "delivery" counted as the package).
const SAME_WORD = new Map([['verbatim', 'literal'], ['exact', 'literal'],
  ['deliverable', 'package'], ['deliverables', 'package'], ["deliverable's", 'package']]);

function fold(words: string[]): string[] {
  const out = words.map(w => SAME_WORD.get(w) ?? w);
  return out.map((w, i) => (w === 'report' && i + 1 < out.length && out[i + 1] === 'md' ? 'package' : w));
}

function near(anchor: string, text: string, window = 6): boolean {
  const parts = fold(anchor.split(' ').filter(Boolean)).map(stem);
  const toks = fold(pyFinditer(ANCHOR_TOK, text).map(m => m[0])).map(stem);
  if (parts.length === 1) return toks.includes(parts[0]);
  const [a, b] = parts;
  const pa: number[] = [], pb: number[] = [];
  toks.forEach((w, i) => { if (w === a) pa.push(i); if (w === b) pb.push(i); });
  // two anchor words folded onto one word still need two places (review): never the one-word anchor fix 2 forbids
  return pa.some(i => pb.some(j => Math.abs(i - j) <= window && (a !== b || i !== j)));
}

export interface DroppedClause { item: number; leg: string; clause: string; anchor: string; missing: string[] }
export interface ClauseResult { checked: number; dropped: DroppedClause[] }

/** Port of `check(objective, answers, draft)` — with the item→row map passed in. */
export function checkClauses(objective: string, rowMap: RowItemMap, draft: string): ClauseResult {
  const items = clauseItems(objective), legs = legSections(draft), na = notApplicable(draft);
  const dropped: DroppedClause[] = [];
  let checked = 0;
  for (const n of [...items.keys()].sort((x, y) => x - y)) {
    const text = items.get(n)!;
    const rows = rowMap.get(n) || new Set<string>();
    const live = [...rows].filter(r => TOKENS.includes(r.split('.')[0]) && !na.has(r));
    if (!live.length) continue;
    const obligations = pyFinditer(OBLIGATION, text).filter(m => !nounUse(text, m.index))
      .map(m => [m[1], m[2], namedLegs(text, m.index)] as [string, string, Set<string>]);
    if (!obligations.length) continue;
    for (const tok of [...new Set(live.map(r => r.split('.')[0]))].sort()) {
      const sect = legs.get(tok);
      const low = sect !== undefined ? norm(sect).toLowerCase() : '';
      for (const [verb, obj, named] of obligations) {
        if (named.size && !named.has(tok)) continue;
        const anchor = objectAnchor(obj);
        if (!anchor) continue;
        checked++;
        if (sect === undefined || !near(anchor, low)) {
          dropped.push({ item: n, leg: tok, clause: cpSlice(`${verb} ${obj}`, 140), anchor, missing: sect === undefined ? ['no leg section'] : [anchor] });
        }
      }
    }
  }
  return { checked, dropped };
}
