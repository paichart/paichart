/**
 * Requirements PROGRAM VIEW + SIZE + HARVESTED-STATE LINT — TypeScript port of the in-run parts of
 * ~/paichart/scripts/requirements-rules.py (2026-10-09; lint as of `2bf2843`, Z39 + Z40).
 *
 * Ported: `bounds`, `program_view` (+ the CLI's stray-rule-citation refusal), `delivered_estimate`, the size limits,
 * `--size-check`, `lint` and `--lint`. NOT ported: `--check` / `--insert` / `--skeleton` (operator tools; the in-run
 * size check does not need the writing rules — the program view REPLACES that section with READING_NOTES, so the view
 * is computable from the draft alone, whatever the section holds).
 *
 * ⚠️ `deliveredEstimate` is `len(json.dumps(json.dumps(text))) - 2 + ENVELOPE` with Python's ensure_ascii escaping.
 * Verified 2026-10-09 against Program Run 14's MEASURED 67,093 delivered chars (estimate 67,009; a JS-style
 * non-escaping estimator gives 64,921). Do NOT replace it with JSON.stringify — the delivery path escapes non-ASCII.
 *
 * The limits mirror the read mechanism in agentic-tool-loop.ts; scripts/test-requirements-form-check.ts pins them
 * against that file so a cap change there fails here instead of silently passing documents that cannot be read.
 * Since 2026-10-12 (owner decision R1) the page caps are per role, and these checks measure against the PROGRAM
 * ARCHITECT's budget (the one reader of the whole spec), imported from role-read-budget.ts — never retyped: 9 pages per
 * document → 71,000 physically readable; the CHECKED limit is one page lower (64,000), so an estimate that undercounts
 * by up to a page still reads to the end; 12 pages per run (8 for a 64,000 spec + 1–2 for topology).
 *
 * PURE: the template text (lint allowlist) arrives as an argument; the in-run caller passes the generated constant.
 */
import { PROGRAM_ARCHITECT_READ_BUDGET } from '../role-read-budget';
import { cpLen, pyCommas, pyFinditer, pyJsonDumpsStr, pyLjust, pyLstrip, pyMatch, pyRstrip, pyRe, pyRepr, pyRjust, pySearch, pyStrip, cpSlice, reEscape } from './requirements-pysem';

export const FIRST_WINDOW = 8000;
export const PAGE_MAX = 7000;
export const PAGES_PER_DOC = PROGRAM_ARCHITECT_READ_BUDGET.pagesPerDocument; // 9
export const PAGES_PER_RUN = PROGRAM_ARCHITECT_READ_BUDGET.pagesPerRun; // 12
/** What the Program Architect can physically read of one document. */
export const PHYSICAL_MAX = FIRST_WINDOW + PAGES_PER_DOC * PAGE_MAX; // 71,000
/** One page of reserve under the physical read (owner R1: ≈ 7K margin). */
export const READ_MARGIN = PAGE_MAX;
/** The CHECKED limit. */
export const PER_FILE_MAX = PHYSICAL_MAX - READ_MARGIN; // 64,000
export const WARN_HEADROOM = 5000;
export const ENVELOPE = 2500;

export const WRITING_RULES_HEADING = '## Writing rules';

export const READING_NOTES = `## Writing rules — omitted from this program view

*Program view.* This section is omitted deliberately — it is not a truncated read. The Writing
rules bind this document's author and reviewer; they are published in full in the companion
\`requirements.md\`, which is not an input to this run. Every other section is byte-identical to it, except that the
rows of *Decisions needed from the owner* ruled not applicable are listed only there.
Where a section cites a rule by number: #1 and #2 (deterministic validation; shipping every cited
artefact) are obligations of each leg's own protocol; #6 means an existence assumption is a BRANCH
decided by the leg's own harvest, never a statement of today's state.

Two properties of this document carry over:

1. **Expected values stated here are reference data, never evidence.** They describe intent; what
   is true is what a run's own harvest observes.
2. **A value that crosses between legs is the value its named producing leg derives at run time**,
   never a literal written here. A crossing value or scope word that can be read two ways producing
   different work is an ambiguity in this document, not a decision.`;
export const GLOSSED_RULES = [1, 2, 6];

function isTop(line: string): boolean { return line.startsWith('## ') && !line.startsWith('###'); }

/** Port of `bounds(lines)` — [start, end) of the Writing rules section, or [null, null]. */
export function writingRulesBounds(lines: string[]): [number, number] | [null, null] {
  const start = lines.findIndex(l => l.startsWith(WRITING_RULES_HEADING));
  if (start < 0) return [null, null];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (isTop(lines[i])) { end = i; break; }
  return [start, end];
}

/** Port of `delivered_estimate(text)`. */
export function deliveredEstimate(text: string): number {
  return pyJsonDumpsStr(pyJsonDumpsStr(text)).length - 2 + ENVELOPE;
}

// Phase 4 group 3a (2026-10-12) — port of `drop_not_applicable`: the owner section's not-applicable rows (for the
// owner's review; no leg acts on them) are replaced in the program view by one line. The full requirements.md keeps them.
const OWNER_HEADING = pyRe('^## Decisions needed from the owner\\b');
const NA_ROW = pyRe('^\\s*(?:[-*]\\s+)?`?[a-z0-9-]+\\.[a-z0-9.<>-]+`?\\s*—.*\\btier:\\s*`?not-applicable');
export const naNote = (n: number) => `*Program view.* ${n} rows ruled not applicable to this program are listed, each with its reason, only in the `
  + 'full `requirements.md` (they are for the owner\'s review; no leg acts on them).';
/** Port of `drop_not_applicable(lines)`. */
export function dropNotApplicable(lines: string[]): { lines: string[]; removedChars: number; rows: number } {
  const s = lines.findIndex(l => !!pyMatch(OWNER_HEADING, l));
  if (s < 0) return { lines, removedChars: 0, rows: 0 };
  let e = lines.length;
  for (let i = s + 1; i < lines.length; i++) if (lines[i].startsWith('## ')) { e = i; break; }
  const keep: string[] = [];
  let removed = 0, n = 0, first = -1;
  for (let i = s + 1; i < e; i++) {
    if (pyMatch(NA_ROW, lines[i])) { removed += cpLen(lines[i]) + 1; n++; if (first < 0) first = keep.length; }
    else keep.push(lines[i]);
  }
  if (!n) return { lines, removedChars: 0, rows: 0 };
  keep.splice(first, 0, naNote(n));
  removed -= cpLen(naNote(n)) + 1;
  return { lines: [...lines.slice(0, s + 1), ...keep, ...lines.slice(e)], removedChars: removed, rows: n };
}

/** Port of `program_view(lines)`: the view text and the code points removed, or null without a Writing rules section. */
export function programView(text: string): { view: string; removedChars: number } | null {
  const lines = text.split('\n');
  const [s, e] = writingRulesBounds(lines);
  if (s === null) return null;
  let removed = 0;
  for (const l of lines.slice(s, e)) removed += cpLen(l) + 1;
  const na = dropNotApplicable([...lines.slice(0, s), ...READING_NOTES.split('\n'), '', ...lines.slice(e)]);
  return { view: na.lines.join('\n'), removedChars: removed + na.removedChars };
}

const RULE_CITE_ONE = pyRe('Writing rules\\*?\\s*#\\s*(\\d+)');
const RULE_CITE_LIST = pyRe('Writing rules\\*?\\s*#\\s*\\d+(?:\\s*(?:,|and)\\s*#?\\s*\\d+)+');
const DIGITS = pyRe('\\d+');
/** The CLI's refusal: rule numbers the body cites that READING_NOTES does not gloss (a dangling citation in a view). */
export function strayRuleCitations(text: string): number[] {
  const cited = new Set<number>();
  for (const m of pyFinditer(RULE_CITE_ONE, text)) cited.add(parseInt(m[1], 10));
  for (const m of pyFinditer(RULE_CITE_LIST, text)) for (const d of pyFinditer(DIGITS, m[0])) cited.add(parseInt(d[0], 10));
  return [...cited].filter(n => !GLOSSED_RULES.includes(n)).sort((a, b) => a - b);
}

/** `--program-view SRC DST` stdout + exit (the view text is returned for the byte comparison with the file Python wrote). */
export function renderProgramViewCli(src: string, dst: string, body: string): { stdout: string; exit: number; view: string | null } {
  const stray = strayRuleCitations(body);
  if (stray.length) {
    return {
      stdout: `✗ ${src}: the body cites Writing rules #[${stray.join(', ')}] — READING_NOTES glosses only #[${GLOSSED_RULES.join(', ')}].\n`
        + '  Extend READING_NOTES (and GLOSSED_RULES) before writing a program view, or the citation dangles.\n',
      exit: 1, view: null,
    };
  }
  const pv = programView(body);
  if (!pv) return { stdout: `✗ ${src}: no '${WRITING_RULES_HEADING}' section found — nothing to replace.\n`, exit: 1, view: null };
  return {
    stdout: `✓ ${dst}: program view written — ${pyCommas(cpLen(pv.view))} chars (removed ${pyCommas(pv.removedChars)} chars: writing rules + not-applicable owner rows).\n`,
    exit: 0, view: pv.view,
  };
}

export interface SizeFile { raw: number; delivered: number; pages: number; headroom: number; fits: boolean }
export function sizeOf(text: string): SizeFile {
  const d = deliveredEstimate(text);
  return { raw: cpLen(text), delivered: d, pages: Math.max(0, Math.ceil((d - FIRST_WINDOW) / PAGE_MAX)), headroom: PER_FILE_MAX - d, fits: d <= PER_FILE_MAX };
}

/** `--size-check FILE [FILE]` stdout + exit. */
export function renderSizeCheckCli(files: Array<{ path: string; text: string }>): { stdout: string; exit: number } {
  const out: string[] = [];
  let fail = false, warn = false, pages = 0;
  for (const { path, text } of files) {
    const s = sizeOf(text);
    pages += s.pages;
    const flag = s.delivered > PER_FILE_MAX ? '✗' : (s.headroom < WARN_HEADROOM ? '⚠️' : '✓');
    fail = fail || s.delivered > PER_FILE_MAX;
    warn = warn || (0 <= s.headroom && s.headroom < WARN_HEADROOM);
    out.push(`  ${flag} raw ${pyRjust(pyCommas(s.raw), 7)}  delivered~${pyRjust(pyCommas(s.delivered), 7)}  pages ${s.pages}/${PAGES_PER_DOC}  headroom ${pyRjust(pyCommas(s.headroom), 7)}  ${path}`);
  }
  out.push(`  run pages ${pages}/${PAGES_PER_RUN}`);
  if (fail || pages > PAGES_PER_RUN) {
    out.push(`✗ a Program Architect cannot read all of this: each file must be <= ~${pyCommas(PER_FILE_MAX)} delivered chars`);
    out.push(`  (${pyCommas(FIRST_WINDOW)} + ${PAGES_PER_DOC} pages x ${pyCommas(PAGE_MAX)} = ${pyCommas(PHYSICAL_MAX)}, less a ${pyCommas(READ_MARGIN)} margin) and all files together <= ${PAGES_PER_RUN} read_more pages.`);
    out.push('  Use the program view, or shorten the document — never raise a cap to fit one document.');
    return { stdout: out.join('\n') + '\n', exit: 1 };
  }
  if (warn) {
    out.push(`⚠️  fits, but a file has under ${pyCommas(WARN_HEADROOM)} chars of headroom: trim author-facing prose from the body first;`);
    out.push('   the page caps are an owner decision (R1, 2026-10-12) — never raise one to fit a document.');
  }
  out.push("✓ readable within the Program Architect's read budget.");
  return { stdout: out.join('\n') + '\n', exit: 0 };
}

// ── --lint ────────────────────────────────────────────────────────────────────────────────────────────────────────
const IPV4 = pyRe('(?<![\\w.])\\d{1,3}(?:\\.\\d{1,3}){3}(?:/\\d{1,2})?(?!\\w|\\.\\w)');
const ABBREV = pyRe('(?<![\\w.\\d])\\.\\d{1,3}(?:\\s*(?:,|/|and|or)\\s*\\.\\d{1,3})+');
const PORT = pyRe('(?i)(?:\\bport\\s+|\\b(?:tcp|udp)[\\s/:]+|(?<=[a-z0-9\\]]):)(\\d{2,5})\\b');
const ARN = pyRe('\\barn:aws[\\w-]*:[^\\s`\\\'")|]+');
const BUCKET = pyRe('(?:--bucket\\s+|s3://)([a-z0-9][a-z0-9.-]{2,62})');
const S3_ARN = pyRe('^arn:aws[\\w-]*:s3:::([a-z0-9][a-z0-9.-]{2,62})(?:/|$)');
const TF_ADDR = pyRe('\\b(?:aws|azurerm|azuread|google|random|kubernetes|helm|null|local|tls|time|cloudflare|github)_[a-z0-9_]+\\.[a-z0-9_-]+\\b');
// `(?<!item )` (2026-10-09, stage A — mirrors requirements-rules.py): "item 21 blocks …" is an owner item number, not a count.
const COUNT = pyRe('(?i)(?<!item )(?<!items )\\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)\\s+'
  + '(?:harvested\\s+|exporter\\s+|existing\\s+|live\\s+)?'
  + '(exporters?|addresses|loopbacks|pods|devices|interfaces|members|workloads|servers|blocks|buckets|namespaces)\\b');
const SYNTHETIC = pyRe('(?i)\\bsynthetic\\b');
const DERIVED = pyRe('\\(derived\\s+—\\s+basis:([^)]*)\\)');
const BASIS_NUM = pyRe('(?i)(?<!phase )\\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|single|\\d+)\\s+([\\w./:-]+)');
const SHELL_VAR = pyRe('\\$\\{?[A-Za-z_]');

export type LintKind = 'address' | 'abbreviated address' | 'port' | 'ARN' | 'bucket' | 'resource address' | 'count' | 'count in derived basis';
export interface LintHit { line: number; kind: LintKind; token: string; context: string }

const SHAPES: Array<[LintKind, RegExp, number]> = [
  ['address', IPV4, 0], ['abbreviated address', ABBREV, 0], ['port', PORT, 1], ['ARN', ARN, 0], ['bucket', BUCKET, 1],
  ['resource address', TF_ADDR, 0], ['count', COUNT, 0],
];

function declaredName(name: string, allowedText: string): boolean {
  return pySearch(pyRe('(?<![A-Za-z0-9.-])' + reEscape(name) + '(?![A-Za-z0-9.-])'), allowedText) !== null;
}

/** Port of `_names_own_blocks` (2026-10-12, lab L11 rerun 2): the deeper lines UNDER the line at `i` (to a blank line or
 *  a line at its indent or shallower; never the line itself) name BOTH "input block" and "result block" — the template's two deliverable
 *  blocks, so "two blocks" there is the template's structure, not a harvested count. */
function namesOwnBlocks(scan: string[], i: number): boolean {
  const indentOf = (l: string) => cpLen(l) - cpLen(pyLstrip(l));
  const indent = indentOf(scan[i]);
  const text: string[] = []; // the lines UNDER the count only, never its own line (execution-facts review)
  for (const nxt of scan.slice(i + 1)) {
    if (!pyStrip(nxt) || indentOf(nxt) <= indent) break;
    text.push(nxt);
  }
  const low = text.join(' ').toLowerCase();
  return low.includes('input block') && low.includes('result block');
}

/** Port of `lint(doc_lines, allowed_text)`. */
export function lintHarvestedState(docText: string, allowedText: string): LintHit[] {
  const lines = docText.split('\n');
  const [s, e] = writingRulesBounds(lines);
  const scan = s === null ? lines : [...lines.slice(0, s), ...new Array<string>(e - s).fill(''), ...lines.slice(e)];
  const hits: LintHit[] = [];
  let inExample = false, exampleIndent = 0, declared = false, listLead = false;
  scan.forEach((line, idx) => {
    const n = idx + 1;
    const indent = cpLen(line) - cpLen(pyLstrip(line));
    // A block the document DECLARES synthetic (2026-10-09, stage A — mirrors requirements-rules.py): opened by a line
    // saying "synthetic", may span blank lines, ends at a heading, a bullet at its indent or shallower, or a shallower
    // line. NOT a documentation-range exemption: rigs use RFC 5737 ranges as real values (measured, rejected).
    // A lead-in ending with a colon introduces a list (2026-10-10, Z53): its bullets at the lead-in's indent stay exempt
    // until a blank line; after that a sibling bullet ends the block as before.
    if (line.includes('Verify by arithmetic')) { inExample = true; exampleIndent = indent; declared = false; }
    else if (SYNTHETIC.test(line) && !inExample) { inExample = true; exampleIndent = indent; declared = true; listLead = pyRstrip(line).endsWith(':'); }
    else if (inExample && !declared && (!pyStrip(line) || (pyLstrip(line).startsWith('- ') && indent <= exampleIndent))) inExample = false;
    else if (inExample && declared && !pyStrip(line)) listLead = false;
    else if (inExample && declared && (pyLstrip(line).startsWith('#') || indent < exampleIndent
      || (pyLstrip(line).startsWith('- ') && indent <= exampleIndent && !listLead))) inExample = false;
    if (inExample) return;
    const ctx = cpSlice(pyStrip(line), 140);
    for (const [kind, rx, grp] of SHAPES) {
      for (const m of pyFinditer(rx, line)) {
        const tok = m[grp];
        if (tok === '0.0.0.0/0' || tok === '0.0.0.0' || (tok !== undefined && (tok.includes('<') || pySearch(SHELL_VAR, tok)))) continue;
        if (kind === 'count' && tok.toLowerCase() === 'two blocks' && namesOwnBlocks(scan, idx)) continue;
        if (kind === 'ARN') {
          const arn = pyMatch(S3_ARN, tok);
          if (arn && declaredName(arn[1], allowedText)) continue;
        }
        if (tok && !allowedText.includes(tok)) hits.push({ line: n, kind, token: tok, context: ctx });
      }
    }
    for (const d of pyFinditer(DERIVED, line)) {
      for (const m of pyFinditer(BASIS_NUM, d[1])) {
        if (!allowedText.includes(m[0])) hits.push({ line: n, kind: 'count in derived basis', token: m[0], context: ctx });
      }
    }
  });
  return hits;
}

/** `--lint PATH [--declared OBJ]` stdout + exit. `template` is the lint allowlist base (requirements.template.md). */
export function renderLintCli(path: string, doc: string, template: string, declared: string | null): { stdout: string; exit: number } {
  const out: string[] = [];
  let allowed = template;
  if (declared !== null) allowed += '\n' + declared;
  else out.push('⚠️  no --declared objective given: values the owner declared will be listed too.');
  const hits = lintHarvestedState(doc, allowed);
  if (!hits.length) {
    out.push(`✓ ${path}: 0 state-shaped tokens outside the template and the declared objective.`);
    out.push('  A pre-filter only — it cannot see harvested names or paraphrased state. Read the whole draft.');
    return { stdout: out.join('\n') + '\n', exit: 0 };
  }
  out.push(`✗ ${path}: ${hits.length} state-shaped token(s) the document did not get from the template or the objective:`);
  for (const h of hits) out.push(`  line ${pyRjust(String(h.line), 4)}  ${pyLjust(h.kind, 20)} ${pyLjust(pyRepr(h.token), 22)} ${h.context}`);
  out.push('  Each is a CANDIDATE — read it. A harvested value belongs nowhere in the document: regenerate, never hand-edit.');
  return { stdout: out.join('\n') + '\n', exit: 1 };
}
