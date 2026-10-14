/**
 * quote-fidelity.ts — does a quote in a deliverable reproduce the span of the raw tool result it pairs with?
 * Pure, zero-DB. VERBATIM-QUOTE-OMISSION, built 2026-10-13 (owner decisions A1–A3, E1;
 * cline_docs/reviews/verbatim-quote-omission-2026-10-13/MEASURE-AND-PROPOSAL.md §8, BUILD-A-E.md).
 *
 * WHY CODE (Path 1 — escaped defects). In the observability file lane, where the FILE is the artifact
 * (`get_ingress_config`, `get_otel_config`), 28 of 42 Harvester executions dropped at least one comment line from a
 * quote they labelled verbatim, and three copied `$remote_addr` as `$remote_actr` / `$remote_actor` — a typo every later
 * tier then treated as a fact about the deployed file (2026-10-01: "PRESERVED VERBATIM INCLUDING TYPO", approved).
 * "Each quoted line is in the harvest" passes all of these by construction; the reviewer never sees the raw result
 * (Invariant 6). Only a comparison against what the tool RETURNED can see them.
 *
 * ONE QUESTION (the 2026-09-20 ruling — a fact answers one question). For each fenced block that pairs with a raw
 * document this execution (or, at the Author point, this leg's Harvester) received: which raw lines inside the quoted
 * span are missing, and which quote lines differ from the raw? It says nothing about provenance, completeness of the
 * package, or whether a deviation MATTERS — materiality is a lane property, recorded (`lane`) for the reader, never
 * judged here. `rollbackContainment` keeps its own question (membership of restore lines); the two share only the
 * witness extractor (raw-tool-witness.ts).
 *
 * PROTOCOL 10 — a FACT. A finding ESCALATES (`needs-node-c`) and never blocks (owner A1): there is no measured outcome
 * base rate for "a comment-less quote caused a bad release". Only a could-not-check where the check should have run
 * fails closed. Nothing consumes this fact (owner B3: no gate conjunct), and it is deliberately UNRENDERED — no lean-card
 * segment, no §6 line — until the Group C lab (owner B1/B2). It is whitelisted, so `agent.results` returns it in its
 * JSON (the reviewer evidence-grading precedent: whitelisted is not rendered).
 *
 * ── THE FALSE-POSITIVE RULES (each one named and counted in the fact, never a silent pass) ──────────────────────────
 *  1. CLAIM. A block is `verbatim` when its label (three preceding non-blank lines) or first two lines say so
 *     (verbatim / as-deployed / byte-for-byte / full file …). Only a verbatim block's OMISSIONS, ADDED lines and
 *     STRIPPED INLINE COMMENTS are findings. An UNLABELLED block is an excerpt the author may narrow freely; only a
 *     CHANGED line (a raw line reproduced with different characters — the `$remote_actr` class) is a finding there.
 *  2. WHOLE-UNIT ELISION. A gap that removes whole top-level units (stanzas/sections at or above the quote's base
 *     indentation) is an excerpt, not an omission — exempt, counted `wholeUnit`.
 *  3. NAMED ELISION. A quote line that marks an elision (`...`, `…`, `[elided …]`, `# [LINE EXCLUDED …]`) exempts the
 *     gap it sits in, counted `named`.
 *  4. ADJACENT COMMENTS (the run-2 header shape) are a finding only when the quote covers the document's whole content
 *     span; beside an excerpt they are counted `adjacentToExcerpt`.
 *  5. R9 (site A). The persisted raw is PRE-R9; the model saw the sanitised form. A raw line of a `rewritten` call
 *     matches either form (shipping sanitiser, per line). The block carries `sourceRewritten`.
 *  6. R10 / placeholders. `<<REDACTED-SECRET>>` (any of its quoted/angle variants) is a wildcard on both sides, and from
 *     its first occurrence to the end of a quote line (a self-redaction may garble the tail); an angle placeholder
 *     (`<device NET>`) in a quote line is a wildcard for one raw line. Counted `placeholder`.
 *  7. TRUNCATED SOURCE. A raw document cut at persist (>50 KB → preview) or for the model (8 KB in-loop) cannot prove an
 *     omission: its findings are recorded with `sourceTruncated` and do NOT escalate.
 *  8. Reordered lines (present in the raw, out of order) and whitespace-only reflows are counted, not findings.
 */
import { fencedBlockLines, type BlockKind, type BlockLabel } from './dialect-lint';
import { extractRawToolDocuments, acceptableForms, normLine, type RawToolDocument } from './raw-tool-witness';
import { FILE_DESCRIPTOR_TOOLS } from './held-bytes/descriptors';

/** Bump on any change to pairing, alignment, the claim rule or the exemptions — the series key (never time). */
export const QUOTE_FIDELITY_VERSION = 1;

/** The lane where the file IS the artifact (owner A2). A later render selects findings with `lane === 'file-artifact'`.
 *  Derived from the held-bytes descriptor table since 2026-10-14 (PLATFORM-HELD-BYTES Stage A WI-3), in table order —
 *  pinned equal to the former literal ['get_ingress_config', 'get_otel_config'] (ORDER matters: score-quote.ts:89).
 *  laneOf below is deliberately UNCHANGED, including its `files.` path arm: a named departure from owner decision Q3,
 *  decided OA-22 — converge in Stage B with a QUOTE_FIDELITY_VERSION bump, never silently. */
export const FILE_ARTIFACT_TOOLS: readonly string[] = FILE_DESCRIPTOR_TOOLS;

const MIN_PAIR_LINES = 3;
const LIST_CAP = 12;
const BLOCK_LIST_CAP = 12;
const LINE_CAP = 200;
const CHANGED_MIN_SIMILARITY = 0.75;
const MIN_REDACTION_PREFIX = 8;
const MIN_SHORT_REDACTION_PREFIX = 3;
const MAX_SIMILARITY_CHARS = 400;

export const VERBATIM_CLAIM_RE =
  /verbatim|as[- ]deployed|byte[- ]for[- ]byte|byte[- ]identical|unmodified|exact(ly)? as (deployed|witnessed|returned)|full (file|content|config)|entire (file|config)|whole[- ]file/i;
/**
 * N1 (review 2026-10-13): a NEGATED claim is not a claim — "Not verbatim — summary …", "Excerpt (not the full file)".
 * A match counts only when none of not/never/isn't/no/non sits within the 20 characters before it on its line.
 * QUOTE_FIDELITY_VERSION stays 1: this landed before the first deploy, so no stamped series exists to cut.
 */
export function claimsVerbatim(text: string, claimRe: RegExp = VERBATIM_CLAIM_RE): boolean {
  const re = new RegExp(claimRe.source, 'gi');
  for (const m of text.matchAll(re)) {
    const lineStart = text.lastIndexOf('\n', m.index ?? 0) + 1;
    const before = text.slice(Math.max(lineStart, (m.index ?? 0) - 20), m.index);
    if (!/\b(not|never|isn'?t|no|non)\b[\s-]*(a |an |the )?\S*\s*$/i.test(before)) return true;
  }
  return false;
}
/** Author point: an expected-output block is a REPRODUCTION only when it says it must be identical to the baseline. */
const IDENTITY_CLAIM_RE =
  /byte[- ]?(for[- ]byte|identical)|identical to (the )?(baseline|harvest|as[- ]deployed|prior|original|pre[- ]change)|verbatim|unchanged from/i;
/** Author point: a heading that names the section as the package's DESIRED state (read on the ancestry only). */
export const DESIRED_STATE_HEADING_RE = /desired[- ]?state|candidate|proposed|target[- ](config|state|file)|\bas applied\b/i;
/** Tested only on a quote line that did NOT align with the raw, so a real config comment that happens to say
 *  "(truncated …)" is aligned first and never read as a marker. */
const ELISION_MARKER_RE =
  /^\s*(?:#|\/\/|;|!|<!--)?\s*(?:\.{3,}|…)\s*(?:[[(].*)?(?:-->)?\s*$|[[(][^\])\n]*?\b(?:elided|omitted|excluded|truncated|snipped|trimmed|abridged)\b/i;
const REDACTION_RE = /["']?<{1,2}REDACTED[-_A-Z]*>{1,2}["']?/gi;
const REDACTION_TOKEN = '\u2039R\u203a';
const ANGLE_PLACEHOLDER_RE = /<[A-Za-z][^<>]{0,40}>/;

type LineClass = 'blank' | 'separator' | 'comment' | 'content';

export function lineClass(t: string): LineClass {
  const s = t.trim();
  if (!s) return 'blank';
  if (['!', '#', '---', '//', ';', '...'].includes(s)) return 'separator';
  if (/^(#|\/\/|;|!\s*\S|<!--|--\s)/.test(s)) return 'comment';
  return 'content';
}

const qnorm = (s: string) => normLine(s).replace(REDACTION_RE, REDACTION_TOKEN);
const stripInline = (s: string) => s.replace(/\s+(#|\/\/).*$/, '').trim();
const collapseWs = (s: string) => s.replace(/\s+/g, ' ');
const indentOf = (s: string) => s.length - s.replace(/^[ \t]+/, '').length;
const cap = (s: string) => (s.length > LINE_CAP ? `${s.slice(0, LINE_CAP)}…` : s);

/** Edit-distance similarity. BOUNDED: a minified one-line JSON quote would make the O(m·n) table stall a persist, and a
 *  length ratio already rules most pairs out — so very long or very unequal lines are simply "not edited". */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n || m > MAX_SIMILARITY_CHARS || n > MAX_SIMILARITY_CHARS) return 0;
  if (Math.min(m, n) / Math.max(m, n) < CHANGED_MIN_SIMILARITY) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

function placeholderRegex(q: string): RegExp | null {
  if (!ANGLE_PLACEHOLDER_RE.test(q)) return null;
  const parts = q.split(/<[A-Za-z][^<>]{0,40}>/g).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('.+?')}$`);
}

export type QuoteLane = 'file-artifact' | 'other';

export function laneOf(doc: Pick<RawToolDocument, 'tool' | 'path'>): QuoteLane {
  const toolLeaf = doc.tool.split('.').pop() ?? '';
  if (FILE_ARTIFACT_TOOLS.includes(toolLeaf)) return 'file-artifact';
  if (/(^|\.)files\./.test(doc.path)) return 'file-artifact';
  return 'other';
}

interface PreparedDoc {
  doc: RawToolDocument & { origin: 'self' | 'harvest' };
  forms: string[][];
  set: Set<string>;
}

function prepare(docs: Array<RawToolDocument & { origin: 'self' | 'harvest' }>): PreparedDoc[] {
  const out: PreparedDoc[] = [];
  for (const doc of docs) {
    if (doc.lines.filter((l) => l.trim()).length < MIN_PAIR_LINES) continue;
    const forms = doc.lines.map((l) => (l.trim() ? acceptableForms(l, doc.rewritten).map((f) => f.replace(REDACTION_RE, REDACTION_TOKEN)) : []));
    const set = new Set<string>();
    for (const f of forms) for (const x of f) set.add(x);
    out.push({ doc, forms, set });
  }
  return out;
}

export interface QuoteBlock {
  /** 1-indexed line of the opening fence in the deliverable. */
  blockLine: number;
  body: string[];
  /** Up to three preceding non-blank lines, nearest first. */
  label: string;
}

export interface BlockFinding {
  blockLine: number;
  claim: 'verbatim' | 'none';
  /** `origin` — whose call returned it: `self` (this execution) or, at the Author point, `harvest` (the leg's Harvester). */
  source: { origin: 'self' | 'harvest'; call: number; tool: string; path: string; lane: QuoteLane };
  span: { rawFrom: number; rawTo: number; wholeDoc: boolean };
  omitted: { comment: string[]; content: string[]; adjacentComment: string[] };
  changed: Array<{ quote: string; raw: string; kind: 'edited' | 'inline-comment-stripped' }>;
  added: string[];
  /** Full counts behind the lists above, which are capped at LIST_CAP: a capped list never hides how much it withheld. */
  totals: { omittedComment: number; omittedContent: number; adjacentComment: number; changed: number; added: number };
  elisions: { wholeUnit: number; named: number; placeholder: number; reordered: number; whitespaceOnly: number; adjacentToExcerpt: number };
  sourceRewritten?: true;
  sourceTruncated?: 'persist' | 'llm';
  /** Does this block drive `needs-node-c`? False when its only findings sit on a truncated source (rule 7). */
  escalates: boolean;
}

export type BlockResult =
  | { pairable: false }
  | { pairable: true; finding: BlockFinding | null; lane: QuoteLane; claim: 'verbatim' | 'none'; elisions: BlockFinding['elisions'] };

/** Analyse ONE block against the prepared raw documents. Exported for the fixtures. */
export function analyseBlock(block: QuoteBlock, prepared: PreparedDoc[]): BlockResult {
  const nb = block.body.filter((l) => l.trim());
  if (nb.length < MIN_PAIR_LINES) return { pairable: false };
  const qn = nb.map(qnorm);

  let best: PreparedDoc | null = null;
  let bestM = 0;
  for (const p of prepared) {
    let m = 0;
    for (const q of qn) if (p.set.has(q)) m++;
    if (m > bestM) { best = p; bestM = m; }
  }
  if (!best || bestM < MIN_PAIR_LINES || bestM * 2 < nb.length) return { pairable: false };

  const raw = best.doc.lines;
  const forms = best.forms;
  const claim: 'verbatim' | 'none' =
    claimsVerbatim(block.label) || claimsVerbatim(block.body.slice(0, 2).join('\n')) ? 'verbatim' : 'none';
  const lane = laneOf(best.doc);
  // S1 (review 2026-10-13): every raw line this fact EMITS is shown in the form the model was shown. `raw` is the PRE-R9
  // persisted payload, and this fact is whitelisted (agent.results returns it), so emitting a rewritten call's raw line
  // would re-materialise an injection R9 neutralised — the F9-s7 class, widened. Matching is unchanged.
  const shown = (l: string): string => cap(best!.doc.rewritten ? acceptableForms(l, true).slice(-1)[0] ?? l.trim() : l.trim());

  // In-order greedy alignment (trimmed, NFKC, R9 alternate, R10 wildcard).
  const aligned: Array<number | null> = [];
  let pos = 0;
  for (const q of qn) {
    // A bare separator (`!`, `#`, `---`) is punctuation: it never anchors the alignment (live: cmtbc6nj4…, a leading `!`
    // matched the raw's FIRST `!`, ahead of the line it separated, and emptied the window of the line after it).
    if (lineClass(q) === 'separator') { aligned.push(null); continue; }
    let found: number | null = null;
    for (let k = pos; k < raw.length; k++) {
      if (forms[k].includes(q)) { found = k; break; }
    }
    aligned.push(found);
    if (found !== null) pos = found + 1;
  }
  const used = new Set<number>(aligned.filter((k): k is number => k !== null));

  const elisions = { wholeUnit: 0, named: 0, placeholder: 0, reordered: 0, whitespaceOnly: 0, adjacentToExcerpt: 0 };
  // An R10 placeholder that aligned through the wildcard normalisation is still a substitution — counted, never silent.
  elisions.placeholder += qn.filter((q, i) => aligned[i] !== null && q.includes(REDACTION_TOKEN)).length;
  const changed: BlockFinding['changed'] = [];
  const added: string[] = [];
  /** Raw ranges (exclusive bounds) a named elision marker covers: between its neighbouring aligned lines. */
  const namedRanges: Array<[number, number]> = [];

  const prevAligned = (i: number) => { for (let j = i - 1; j >= 0; j--) if (aligned[j] !== null) return aligned[j] as number; return -1; };
  const nextAligned = (i: number) => { for (let j = i + 1; j < aligned.length; j++) if (aligned[j] !== null) return aligned[j] as number; return raw.length; };

  for (let i = 0; i < nb.length; i++) {
    if (aligned[i] !== null || lineClass(qn[i]) === 'separator') continue;
    const q = nb[i];
    const qN = qn[i];
    const lo = prevAligned(i), hi = nextAligned(i);
    const window: number[] = [];
    for (let k = lo + 1; k < hi; k++) if (!used.has(k) && raw[k].trim()) window.push(k);

    if (ELISION_MARKER_RE.test(q)) { namedRanges.push([lo, hi]); elisions.named++; continue; }
    if (best.set.has(qN)) { elisions.reordered++; continue; }
    const ph = placeholderRegex(qN);
    if (ph) {
      const k = window.find((kk) => forms[kk].some((f) => ph.test(f)));
      if (k !== undefined) { used.add(k); elisions.placeholder++; continue; }
    }
    // A redaction the HARVESTER applied itself can garble the rest of its line (live: cmtbc6nj4…, `secret sha512
    // <<REDACTED-SECRET>> user-secret-hash>`), so everything from the first token on is a wildcard — anchored on a
    // literal prefix long enough that it cannot pair an unrelated line in the window.
    // N2 (review 2026-10-13): a SHORT prefix (`allow `, `psk `, `key `) is accepted only when exactly one window line
    // carries it, so it can never choose between two candidates.
    const prefix = qN.split(REDACTION_TOKEN)[0];
    if (qN.includes(REDACTION_TOKEN) && prefix.trim().length >= MIN_SHORT_REDACTION_PREFIX) {
      const cands = window.filter((kk) => forms[kk].some((f) => f.startsWith(prefix)));
      const k = prefix.trim().length >= MIN_REDACTION_PREFIX || cands.length === 1 ? cands[0] : undefined;
      if (k !== undefined) { used.add(k); elisions.placeholder++; continue; }
    }
    const kInline = window.find((kk) => {
      const f = forms[kk][0];
      const s = stripInline(f);
      return s !== f && s !== '' && s === stripInline(qN);
    });
    if (kInline !== undefined) {
      used.add(kInline);
      changed.push({ quote: cap(q.trim()), raw: shown(raw[kInline]), kind: 'inline-comment-stripped' });
      continue;
    }
    const kWs = window.find((kk) => collapseWs(forms[kk][0]) === collapseWs(qN));
    if (kWs !== undefined) { used.add(kWs); elisions.whitespaceOnly++; continue; }
    const head = qN.split(/\s+/)[0];
    let kEd: number | undefined;
    let bestSim = 0;
    for (const kk of window) {
      const f = forms[kk][0];
      if (f.split(/\s+/)[0] !== head || lineClass(f) !== lineClass(qN)) continue;
      const s = similarity(f, qN);
      if (s >= CHANGED_MIN_SIMILARITY && s > bestSim) { bestSim = s; kEd = kk; }
    }
    if (kEd !== undefined) {
      used.add(kEd);
      changed.push({ quote: cap(q.trim()), raw: shown(raw[kEd]), kind: 'edited' });
      continue;
    }
    added.push(cap(q.trim()));
  }

  const keptIdx = [...used].sort((a, b) => a - b);
  const lo = keptIdx[0];
  const hi = keptIdx[keptIdx.length - 1];
  const base = Math.min(...keptIdx.map((k) => indentOf(raw[k])));
  const omitted: BlockFinding['omitted'] = { comment: [], content: [], adjacentComment: [] };

  for (let g = 0; g + 1 < keptIdx.length; g++) {
    const a = keptIdx[g], b = keptIdx[g + 1];
    if (b === a + 1) continue;
    const gap = raw.slice(a + 1, b);
    const content = gap.filter((l) => lineClass(l) === 'content');
    // A bare `#` / `!` INSIDE a comment run is part of it (run 2's header carries one); alone it is punctuation.
    const hasComment = gap.some((l) => lineClass(l) === 'comment');
    const comments = hasComment ? gap.filter((l) => lineClass(l) === 'comment' || lineClass(l) === 'separator') : [];
    if (!content.length && !comments.length) continue;
    if (namedRanges.some(([rl, rh]) => rl <= a && b <= rh)) continue; // counted once, at the marker
    if (content.length) {
      if (indentOf(content[0]) <= base && indentOf(raw[b]) <= base) { elisions.wholeUnit++; continue; }
      omitted.content.push(...content.map(shown));
      omitted.comment.push(...comments.map(shown));
    } else {
      omitted.comment.push(...comments.map(shown));
    }
  }

  const adjRun = (from: number, step: number): number[] => {
    const run: number[] = [];
    for (let k = from; k >= 0 && k < raw.length; k += step) {
      if (lineClass(raw[k]) === 'content') break;
      run.push(k);
    }
    return run;
  };
  const pre = adjRun(lo - 1, -1);
  const post = adjRun(hi + 1, 1);
  const outside = [
    ...raw.slice(0, pre.length ? Math.min(...pre) : lo),
    ...raw.slice(post.length ? Math.max(...post) + 1 : hi + 1),
  ].filter((l) => l.trim());
  const wholeDoc = outside.length === 0;
  const preNamed = namedRanges.some(([rl]) => rl < lo);
  const postNamed = namedRanges.some(([, rh]) => rh > hi);
  for (const [run, named] of [[pre, preNamed], [post, postNamed]] as Array<[number[], boolean]>) {
    const comments = run.some((k) => lineClass(raw[k]) === 'comment')
      ? run.filter((k) => lineClass(raw[k]) !== 'blank').map((k) => shown(raw[k]))
      : [];
    if (!comments.length || named) continue;
    if (wholeDoc) omitted.adjacentComment.push(...(run === pre ? comments.reverse() : comments));
    else elisions.adjacentToExcerpt += comments.length;
  }

  const findingCount = claim === 'verbatim'
    ? omitted.comment.length + omitted.content.length + omitted.adjacentComment.length + changed.length + added.length
    : changed.filter((c) => c.kind === 'edited').length;
  const doc = best.doc;
  const sourceTruncated: BlockFinding['sourceTruncated'] = doc.persistTruncated ? 'persist' : doc.llmTruncated ? 'llm' : undefined;

  if (findingCount === 0) return { pairable: true, finding: null, lane, claim, elisions };

  const listCap = <T>(xs: T[]) => xs.slice(0, LIST_CAP);
  const finding: BlockFinding = {
    blockLine: block.blockLine,
    claim,
    source: { origin: doc.origin, call: doc.call, tool: doc.tool, path: doc.path, lane },
    span: { rawFrom: lo + 1, rawTo: hi + 1, wholeDoc },
    omitted: claim === 'verbatim'
      ? { comment: listCap(omitted.comment), content: listCap(omitted.content), adjacentComment: listCap(omitted.adjacentComment) }
      : { comment: [], content: [], adjacentComment: [] },
    changed: listCap(claim === 'verbatim' ? changed : changed.filter((c) => c.kind === 'edited')),
    added: claim === 'verbatim' ? listCap(added) : [],
    totals: claim === 'verbatim'
      ? { omittedComment: omitted.comment.length, omittedContent: omitted.content.length, adjacentComment: omitted.adjacentComment.length, changed: changed.length, added: added.length }
      : { omittedComment: 0, omittedContent: 0, adjacentComment: 0, changed: changed.filter((c) => c.kind === 'edited').length, added: 0 },
    elisions,
    ...(doc.rewritten ? { sourceRewritten: true as const } : {}),
    ...(sourceTruncated ? { sourceTruncated } : {}),
    escalates: !sourceTruncated,
  };
  return { pairable: true, finding, lane, claim, elisions };
}

/** Group `fencedBlockLines` output back into blocks (consecutive document lines, same axes). */
type ClassifiedBlock = QuoteBlock & { kind: BlockKind; restoreIntent: boolean; labelAxis: BlockLabel; ancestry: string };

function groupFenced(doc: string): ClassifiedBlock[] {
  const lines = doc.split('\n');
  const flat = fencedBlockLines(doc);
  const blocks: ClassifiedBlock[] = [];
  let prev = -99;
  for (const b of flat) {
    const cur = blocks[blocks.length - 1];
    if (!cur || b.line !== prev + 1) {
      const fence = b.line - 1; // 1-indexed fence line
      const label: string[] = [];
      for (let k = fence - 2; k >= 0 && label.length < 3; k--) {
        if (/^\s*```/.test(lines[k])) break;
        if (lines[k].trim()) label.push(lines[k]);
      }
      blocks.push({ blockLine: fence, body: [], label: label.join('\n'), kind: b.kind, restoreIntent: b.restoreIntent, labelAxis: b.label, ancestry: b.ancestry });
    }
    blocks[blocks.length - 1].body.push(b.text);
    prev = b.line;
  }
  return blocks;
}

export type QuotePoint = 'harvest' | 'author';

/** Why an Author block was not compared. Every exclusion is NAMED and counted. */
export type AuthorExclusion = 'desired-state' | 'expected-output-not-identity' | 'command' | 'other';

/**
 * Author point (owner A3): only blocks that claim to REPRODUCE the baseline — rollback (restoreIntent), baseline
 * evidence (`harvested-state`), and expected output labelled identical to the baseline. Desired state is EXCLUDED by the
 * dialect-lint classifier, never by a regex: an Author's desired-state file legitimately rewrites a brownfield header.
 */
function authorScope(b: ClassifiedBlock): AuthorExclusion | null {
  if (b.restoreIntent) return null;
  // The classifier's `harvested-state` is decided from the block's own LABEL, and an Author's desired-state file is
  // routinely labelled "replaces the baseline above in full" (live: cmuoy0ssa…, L86, under "## Desired-State Config
  // File"). The heading ancestry outranks that label here: a block under a desired-state section is never a reproduction.
  if (DESIRED_STATE_HEADING_RE.test(b.ancestry)) return 'desired-state';
  if (b.kind === 'harvested-state') return null;
  if (b.kind === 'expected-output' || b.labelAxis === 'expected-output') {
    return claimsVerbatim(b.label, IDENTITY_CLAIM_RE) || claimsVerbatim(b.body.slice(0, 2).join('\n'), IDENTITY_CLAIM_RE) ? null : 'expected-output-not-identity';
  }
  if (b.kind === 'candidate-config') return 'desired-state';
  if (b.kind === 'command') return 'command';
  return 'other';
}

export interface QuoteFidelityInput {
  point: QuotePoint;
  deliverable: string | null | undefined;
  /** This execution's own `toolCalls` (result.json shape). */
  toolCalls: unknown;
  /** Author point only: the leg Harvester's `toolCalls` (its authoritative execution), and that child's task id. */
  harvestToolCalls?: unknown;
  harvestSource?: string | null;
}

/** The pure check. The enrichment resolves `toolCalls`; nothing here reads the world. */
export function computeQuoteFidelity(input: QuoteFidelityInput): Record<string, unknown> {
  const withDisposition = (fact: Record<string, unknown>) => {
    fact.quoteFidelityDisposition = computeQuoteFidelityDisposition(fact);
    return fact;
  };
  const docs = [
    ...extractRawToolDocuments(input.harvestToolCalls).map((d) => ({ ...d, origin: 'harvest' as const })),
    ...extractRawToolDocuments(input.toolCalls).map((d) => ({ ...d, origin: 'self' as const })),
  ];
  const callKey = (d: { origin: string; call: number }) => `${d.origin}:${d.call}`;
  const witness = {
    calls: new Set(docs.map(callKey)).size,
    persistTruncatedCalls: new Set(docs.filter((d) => d.persistTruncated).map(callKey)).size,
    llmTruncatedCalls: new Set(docs.filter((d) => d.llmTruncated).map(callKey)).size,
    rewrittenCalls: new Set(docs.filter((d) => d.rewritten).map(callKey)).size,
    ...(input.point === 'author' ? { harvestSource: input.harvestSource ?? null } : {}),
  };
  const base = { version: QUOTE_FIDELITY_VERSION, point: input.point };

  const all = groupFenced(input.deliverable ?? '');
  const excluded: Partial<Record<AuthorExclusion, number>> = {};
  const inScope = input.point === 'author'
    ? all.filter((b) => {
      const why = authorScope(b);
      if (why) excluded[why] = (excluded[why] ?? 0) + 1;
      return why === null;
    })
    : all;
  const scopeCounts = { fenced: all.length, inScope: inScope.length };
  const excludedPart = input.point === 'author' ? { excluded } : {};

  if (all.length === 0) {
    return withDisposition({ ...base, checked: false, reason: 'no-fenced-blocks', blocks: scopeCounts, ...excludedPart, witness });
  }
  if (inScope.length === 0) {
    return withDisposition({ ...base, checked: false, reason: 'no-in-scope-blocks', blocks: scopeCounts, ...excludedPart, witness });
  }
  // Author point: the witness is the HARVEST's raw. Its absence is a could-not-check (fails closed) even when the
  // Author made calls of its own — those cannot stand in for what the leg witnessed.
  if (input.point === 'author' && !docs.some((d) => d.origin === 'harvest')) {
    return withDisposition({ ...base, checked: false, reason: 'no-harvest-tool-results', blocks: scopeCounts, ...excludedPart, witness });
  }
  if (docs.length === 0) {
    return withDisposition({ ...base, checked: false, reason: 'no-raw-tool-results', blocks: scopeCounts, ...excludedPart, witness });
  }

  const prepared = prepare(docs);
  const findings: BlockFinding[] = [];
  const lanes = { fileArtifact: 0, other: 0 };
  const claims = { verbatim: 0, none: 0 };
  const elisions = { wholeUnit: 0, named: 0, placeholder: 0, reordered: 0, whitespaceOnly: 0, adjacentToExcerpt: 0 };
  let pairable = 0;
  let complete = 0;
  for (const b of inScope) {
    const r = analyseBlock(b, prepared);
    if (!r.pairable) continue;
    pairable++;
    if (r.lane === 'file-artifact') lanes.fileArtifact++; else lanes.other++;
    claims[r.claim]++;
    for (const k of Object.keys(elisions) as Array<keyof typeof elisions>) elisions[k] += r.elisions[k];
    if (r.finding) findings.push(r.finding); else complete++;
  }

  const blocks = { ...scopeCounts, pairable, complete, withFindings: findings.length };
  if (pairable === 0) {
    return withDisposition({ ...base, checked: false, reason: 'no-pairable-quotes', blocks, ...excludedPart, witness });
  }
  const escalating = findings.filter((f) => f.escalates);
  return withDisposition({
    ...base,
    checked: true,
    reason: escalating.length ? 'quote-omits-or-changes-lines' : 'all-quotes-complete',
    blocks: { ...blocks, escalating: escalating.length, sourceTruncated: findings.length - escalating.length },
    lanes,
    claims,
    elisions,
    // File-artifact findings first, so a capped list never drops the lane the later render selects.
    findings: [...findings].sort((a, b) => (a.source.lane === b.source.lane ? a.blockLine - b.blockLine : a.source.lane === 'file-artifact' ? -1 : 1))
      .slice(0, BLOCK_LIST_CAP),
    ...(findings.length > BLOCK_LIST_CAP ? { findingsNotListed: findings.length - BLOCK_LIST_CAP } : {}),
    ...excludedPart,
    witness,
  });
}

/**
 * A could-not-reach-the-witness fact for the Author point (no stage / no harvest child), built here so the enrichment
 * never hand-assembles a fact shape. The in-scope count is real (the pure scope ran first); nothing else was read.
 */
export function quoteFidelityMiss(reason: string, deliverable: string | null | undefined): Record<string, unknown> {
  const f = computeQuoteFidelity({ point: 'author', deliverable, toolCalls: [] });
  const fact: Record<string, unknown> = {
    version: f.version, point: 'author', checked: false, reason,
    blocks: f.blocks, excluded: f.excluded,
  };
  fact.quoteFidelityDisposition = computeQuoteFidelityDisposition(fact);
  return fact;
}

/** Author point: does the package contain any block this fact compares? Pure; decides whether the harvest is read. */
export function authorHasInScopeBlocks(deliverable: string | null | undefined): boolean {
  return groupFenced(deliverable ?? '').some((b) => authorScope(b) === null);
}

export type QuoteFidelityDispositionState = 'benign' | 'blocking' | 'needs-node-c';

/**
 * COMPUTED, never judged. Benign is an ALLOWLIST: an unrecognised reason falls through to blocking VISIBLY. A finding
 * ESCALATES and never blocks (owner A1). Only a could-not-check where the check should have run fails closed: the
 * Author quoted in-scope content and its harvest's raw results are unreadable, or the enrichment threw.
 */
export function computeQuoteFidelityDisposition(fact: Record<string, unknown>): { disposition: QuoteFidelityDispositionState; reason: string; inputs: Record<string, unknown> } {
  const reason = typeof fact.reason === 'string' ? fact.reason : null;
  const blocks = (fact.blocks ?? {}) as Record<string, unknown>;
  const inputs = {
    reason,
    pairable: typeof blocks.pairable === 'number' ? blocks.pairable : 0,
    escalating: typeof blocks.escalating === 'number' ? blocks.escalating : 0,
  };
  if (fact.checked === true) {
    return reason === 'quote-omits-or-changes-lines'
      ? { disposition: 'needs-node-c', reason: 'quote-omits-or-changes-lines', inputs }
      : reason === 'all-quotes-complete'
        ? { disposition: 'benign', reason: 'all-quotes-complete', inputs }
        : { disposition: 'blocking', reason: 'hard-gap', inputs };
  }
  switch (reason) {
    case 'no-fenced-blocks':
    case 'no-in-scope-blocks':
    case 'no-pairable-quotes':
    // A Harvester that received no text has nothing a quote could reproduce. Whether its quotes are WITNESSED at all is
    // a provenance question, which this fact deliberately does not answer.
    case 'no-raw-tool-results':
      return { disposition: 'benign', reason, inputs };
    default:
      return { disposition: 'blocking', reason: 'hard-gap', inputs };
  }
}
