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
 *
 * ── v3: DEVICE-READ CLAIMS (QUOTEFIDELITY-DEVICE-REBUILT-BLOCK, held-network step 3 P6, 2026-10-25) ─────────────────
 * A fenced block whose heading-bounded label says it IS a device read (`device-read`, `running-config`, `fetch_data`,
 * `config getter`, `from the device`, `device config|output`; a Git/file label — with "no git-file" stripped — opts out)
 * claims to be what the device RETURNED. Its config lines must appear IN ORDER and with their EXACT INDENTATION in one
 * document an `other`-lane read served (never a file-lane read: a Git file presented as the device read is the class).
 * Bare `!` and elision markers are skipped; a block of fewer than 3 such lines is not read. SECRETS are normalised on BOTH
 * sides (R10's plain arm, then a placeholder — R10's or an `<angle>` one — is a wildcard), because a quote writes
 * `community <value>` where the served config carries the value (the lab scorer's false positive). A line moved between
 * parents (re-indented), reordered, added or rebuilt reads `deviceReads.rebuilt`, and ESCALATES (needs-node-c) like any
 * quote finding — never blocks. Corpus (lab, 115 network samples): 30 device-claimed blocks, the 2 known rebuilt blocks
 * (L-N1 rev 7 BOTH sample-03), 0 others.
 *
 * ── v4: the claim is a REBUILT TEXT CONFIGURATION, nothing wider (QUOTEFIDELITY-V3-DEVICE-CLAIM-FP, step 3 batch 2a) ──────
 * The production replay of v3 (3,087 tasks, STEP3-BATCH1-BUILD §8) read 13 findings: 0 fabricated, 5 detector false
 * positives in two shapes, 8 honest values under an overclaimed label. Owner decision 2026-10-26: a rendering of a
 * STRUCTURED result, or a block whose label says normalized / rendering, is not a verbatim claim (an EXCERPT label is — owner
 * H-1, 2026-10-26, below). So, per block:
 *  (a) a LEADING comment line that only names a device (`! sw1`, `! sw1 (AS 65001)`) is a label, not a quote line;
 *  (b) a block the classifier kinds `command` / `rollback`, or one with restore intent, is never a device-read claim,
 *      whatever the nearby prose says ("restored … byte-for-byte");
 *  (c) a label saying normalized / an API|JSON|structured rendering opts the block out, counted per word
 *      (`excluded['label-normalized' | 'label-rendering']`). An EXCERPT label does NOT (owner decision H-1, 2026-10-26, on sec-ops
 *      batch-2a SF-7): (e) already accepts an honest picked/stitched excerpt, so the label could only ever waive a block that is
 *      not one, and observability 1.9.0 defines EXCERPT as a verbatim subset;
 *  (d) a block the pairing check (rules 1–8) already reports is judged THERE — one block, one finding;
 *  (e) STANZAS (an unindented line and its indented continuation) must each reproduce, in order and with exact indentation,
 *      INSIDE ONE SERVED STANZA (from a served line the head matches up to the next served line at the head's indentation or
 *      less; for a run of siblings, shallower than both) of ONE served document — the block may pick and order whole stanzas (an excerpt may stitch), but a line moved to another
 *      parent (re-parented) or re-indented — the rev 7 class — fails, because it is not inside that served stanza (sec-ops
 *      batch-2a SF-1). The stanza pass is bounded by DEVICE_MATCH_BUDGET comparisons per leaf; past it the block is a finding
 *      with `budgetExceeded` (escalates, never faithful — sec-ops batch-2a B-2);
 *  (f) a block that fails and whose lines are mostly RENDERINGS of served structured scalars (the line carries the
 *      scalar's NON-EMPTY value and its last two key names as whole tokens: `Ethernet1.description = "…"` from
 *      `…interfaces.Ethernet1.description`) is a structured rendering, not a rebuilt text configuration
 *      (`excluded['structured-rendering']`).
 *  (g) v5 (held-network push 2, the hierarchy-form audit — config-hierarchy.ts, the ONE classifier shared with the Git-vs-device
 *      comparison): the stanza rule (e) reads hierarchy from INDENTATION, which it recovers for the `indent` (IOS / NX-OS / EOS / XR),
 *      indented `braces` and flat `set` forms (a `set` statement carries its whole path, so re-parenting changes its text). A served
 *      document in `braces-unindented` form (the hierarchy lives only in the braces) is NOT matched against — a line re-parented between
 *      its brace blocks would read as reproduced. A block that does not reproduce from the parsed documents but whose stanza head is
 *      found in such a document is excluded by name (`excluded['hierarchy-form-not-parsed']`), never called faithful and never
 *      called rebuilt. The BLOCK's own form needs no rule: its lines must match served lines with exact indentation.
 * (b), (c), (d), (f) and (g) are decided only for a block that does not reproduce from the parsed documents — a block that reproduces
 * stays `faithful` whatever its label. Every exclusion is NAMED and counted in `deviceReads.excluded`
 * (claimed = faithful + rebuilt); `deviceReads` is present whenever a block's label claimed a device read
 * (claimed + excluded > 0), so its presence never moves with the narrowing.
 */
import { fencedBlockLines, type BlockKind, type BlockLabel } from './dialect-lint';
import { extractRawToolDocuments, acceptableForms, normLine, type RawToolDocument } from './raw-tool-witness';
import { FILE_DESCRIPTOR_TOOLS, PLATFORM_DEFAULT_DESCRIPTORS } from './held-bytes/descriptors';
import { redactArtifactSecrets } from './redact-artifact-secrets';
import { sanitizeChainedOutput } from './sanitize-chained-output';
import { configHierarchyForm } from './config-hierarchy';

/** Bump on any change to pairing, alignment, the claim rule, the exemptions or the LANE — the series key (never time).
 *  2 (held-k8s 1e, 2026-10-18): the lane converged on the held-bytes descriptor table (OA-22, decided: bump) — see
 *  FILE_LANE_KEYS. Every recomputed stamp moves on `version`; `lane` moves only where the two rules disagree.
 *  3 (held-network step 3 P6, 2026-10-25): device-read claims (`deviceReads`, the v3 header note). Every stamp moves on
 *  `version`; a stamp with a device-claimed block also gains `deviceReads` and may move reason/disposition.
 *  4 (step 3 batch 2a, 2026-10-26): the device claim narrowed to rebuilt TEXT configurations (the v4 header note) and
 *  `deviceReads.excluded` added. Bumped because stored v3 stamps (deployed 2026-10-25 07:26Z) carry the wider rule's
 *  findings, 38% of them false: a reader must be able to tell which rule produced a stored `deviceFindings`.
 *  5 (held-network step 3 push 2, 2026-10-26): (g) a served document in `braces-unindented` form is not matched against, and a
 *  block that could only have reproduced from one is excluded by name (`hierarchy-form-not-parsed`). Bumped because a v4 stamp of
 *  that shape could read `faithful` where v5 reads excluded; on every other shape v5 = v4 (the nets replay proves which moved).
 *  6 (QUOTE-FIDELITY-EXCERPT-BLIND, 2026-10-31): a FILE-LANE block LABELLED as an excerpt (observability 1.9.0 C1: "label a
 *  partial quote `excerpt`, mark each gap `# [elided: …]`") is now read strictly — like a verbatim block — so an UNMARKED gap,
 *  an added line or a stripped inline comment is a finding there; named elisions, whole-unit cuts and comments beside the
 *  excerpt stay exempt (the same rule the lab's strict scorer validated, `score-quote.ts`). Before v6 such a block read as a
 *  free narrowing, so a silent cut under an "excerpt" label passed clean and the stamped rate FELL by construction after 1.9.0.
 *  `claim: 'excerpt'` and `claims.excerpt` (present only when > 0) are new.
 *  v6 also fixes the ALIGNMENT (QUOTE-ALIGNMENT-AMBIGUITY, same unshipped version — the v6 nets replay found it: 2 of 124
 *  stamped legs moved, both false). Through v5 each quote line took its FIRST in-order occurrence, so a block quoting a
 *  REPEATED stanza (`server {}` twice) or key (`metrics:`) was aligned to the first one and the lines between were read as
 *  omitted; verbatim blocks carried the same exposure. Now a few candidate alignments are judged (alignmentCandidates:
 *  first-occurrence = v5, last-occurrence, and forward/backward from each occurrence of the first/last anchoring line):
 *  the most in-order matched lines wins, then the fewest raw lines inside the span that no quote line or named marker
 *  accounts for (`gapCost` — deliberately blind to the exemption rules, which an alignment could otherwise game: moving the
 *  span turns a dropped header into "adjacent to an excerpt"); a tie keeps v5's. And a "lines X–Y" range in the label
 *  (labelLineRange) is the span the block CLAIMS: honoured only when an alignment inside it matches as many lines as the
 *  best anywhere (a wrong range is ignored, never trusted), its own unquoted edge lines are omissions, and comments beyond
 *  it are `adjacentToExcerpt`. A finding under an honoured range carries `span.labelRange`.
 *  7 (QUOTE-PAIRING-TIE, 2026-11-01): DOCUMENT ties. Through v6 a block paired with the FIRST document holding the most of its
 *  lines, so when a device read and the declared Git file both held every quoted line, the earlier one won and its extra
 *  lines (comments, a different stanza order) read as omitted. Now each tied document is aligned and the most in-order
 *  matched lines wins, then the lowest gapCost; a remaining tie keeps the first. Measured first
 *  (cline_docs/reviews/quote-pairing-tie-measure-2026-11-01/RESULT.md): 17 ties, all network; 1 outcome mover, hand-read correct.
 *  8 (QUOTEFIDELITY-PAIRING-COST, 2026-11-01): the pairing path is BOUNDED by PAIRING_MATCH_BUDGET per leaf, like the device
 *  matcher. Below the budget v8 = v7 output-for-output (every scan was made index-driven first: non-blank index, occurrence
 *  ranges, the gap indexes, a per-segment cursor); past it a block is a `budgetExceeded` finding (NOT CHECKED, escalating) where
 *  v7 would have decided after seconds-to-hours. Bumped because that block CAN read differently; the nets replay showed no
 *  stored stamp near it (every stamp moves on `version` only). */
export const QUOTE_FIDELITY_VERSION = 8;

/** The obs rig's file-tool LEAVES in table order — pinned ['get_ingress_config', 'get_otel_config'] (ORDER matters:
 *  score-quote.ts:89; recorded-tools.ts spreads it). Kept for the lab only; the lane no longer reads it (v2). */
export const FILE_ARTIFACT_TOOLS: readonly string[] = FILE_DESCRIPTOR_TOOLS;

/** The lane where the file IS the artifact (owner A2): every `<service>.<tool>` whose descriptor declares files — the
 *  SAME table held-bytes capture reads (P3 §6.3: one lane source). A later render selects `lane === 'file-artifact'`.
 *  v2 (held-k8s 1e) replaced two v1 arms, both MOVERS, named in the replay allow-list:
 *   - the tool-LEAF arm (any service exposing `get_otel_config` / `get_ingress_config`) — a user-registered copy of the
 *     rig now reads `other` (the M2 population); the platform rig keeps the lane whether addressed by name or by id,
 *     because the key is the RESOLVED service (RawToolDocument.resolvedService), never the caller's spelling;
 *   - the `files.` PATH arm (any `…files.<name>` key in any result) — RETIRED: the descriptor, not a key name, says
 *     what a file is (gap 7).
 *  `github-service.get_file_contents` joins the lane here (held-k8s). */
export const FILE_LANE_KEYS: readonly string[] = Object.freeze(
  PLATFORM_DEFAULT_DESCRIPTORS.filter((d) => (d.files?.length ?? 0) > 0 && !d.notAFile).map((d) => `${d.service}.${d.tool}`),
);

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
 * QUOTE_FIDELITY_VERSION stayed 1 for this: it landed before the first deploy, so no stamped series existed to cut.
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
/** v6: a block whose label calls it an EXCERPT (negation-aware via claimsVerbatim's rule). Read strictly in the file lane. */
export const EXCERPT_CLAIM_RE = /\bexcerpts?\b/i;
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
function similarity(a: string, b: string, charge?: (units: number) => void): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n || m > MAX_SIMILARITY_CHARS || n > MAX_SIMILARITY_CHARS) return 0;
  if (Math.min(m, n) / Math.max(m, n) < CHANGED_MIN_SIMILARITY) return 0;
  charge?.(1 + ((m * n) >> 4));
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

export function laneOf(doc: Pick<RawToolDocument, 'tool' | 'resolvedService'>): QuoteLane {
  if (!doc.resolvedService) return 'other';
  const toolLeaf = doc.tool.split('.').pop() ?? '';
  return FILE_LANE_KEYS.includes(`${doc.resolvedService}.${toolLeaf}`) ? 'file-artifact' : 'other';
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
  /** v3 (sec-ops batch-1, QUOTEFIDELITY-PERLINE-CONTEXT-REDACT): `body` as it reads in the deliverable redacted IN CONTEXT (same
   *  length). Every quote line this fact EMITS comes from here; absent (a fixture calling analyseBlock directly) ⇒ per-line R10. */
  bodyRedacted?: string[];
  /** Up to three preceding non-blank lines, nearest first. */
  label: string;
}

export interface BlockFinding {
  blockLine: number;
  claim: 'verbatim' | 'excerpt' | 'none';
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
  /** v8: the leaf's PAIRING_MATCH_BUDGET ran out before this block was decided — NOT CHECKED (span 0–0, nothing listed), escalates. */
  budgetExceeded?: true;
  /** Does this block drive `needs-node-c`? False when its only findings sit on a truncated source (rule 7). */
  escalates: boolean;
}

export type BlockResult =
  | { pairable: false }
  | { pairable: true; finding: BlockFinding | null; lane: QuoteLane; claim: 'verbatim' | 'excerpt' | 'none'; elisions: BlockFinding['elisions'] };

/** v6: "lines 25–37" / "line 7-19" / "lines 7 to 19" in a block's label — the NEAREST label line carrying one, which must
 *  carry exactly one. Returned as 0-indexed inclusive raw bounds; null when absent, ambiguous or outside the document. */
const LABEL_RANGE_RE = /\blines?\s+(\d{1,6})\s*(?:[-‐-―]|to)\s*(\d{1,6})\b/gi;
export function labelLineRange(label: string, rawLength: number): [number, number] | null {
  for (const line of label.split('\n')) {
    const ms = [...line.matchAll(LABEL_RANGE_RE)];
    if (!ms.length) continue;
    if (ms.length > 1) return null;
    const x = Number(ms[0][1]), y = Number(ms[0][2]);
    return x >= 1 && x <= y && y <= rawLength ? [x - 1, y - 1] : null;
  }
  return null;
}

const ALIGN_ANCHOR_CAP = 16;
/** QUOTEFIDELITY-PAIRING-COST (2026-11-01): the raw indices of a document's NON-BLANK lines, ascending, computed once per
 *  document. Every scan of a raw range in the gap analysis below keeps only non-blank lines, so it walks this index instead
 *  of the range — same lines, same order, same result — and a served document padded with blank lines costs its content,
 *  not its length (60,000 blank lines: ~4.3 s → milliseconds). No version bump: output-identical by construction. */
const nonBlankIndex = new WeakMap<string[], number[]>();
function nonBlankOf(raw: string[]): number[] {
  let idx = nonBlankIndex.get(raw);
  if (!idx) {
    idx = [];
    for (let k = 0; k < raw.length; k++) if (raw[k].trim()) idx.push(k);
    nonBlankIndex.set(raw, idx);
  }
  return idx;
}
/** First position in the ascending `xs` whose value is >= `v`. */
function lowerBound(xs: number[], v: number): number {
  let a = 0, b = xs.length;
  while (a < b) { const m = (a + b) >> 1; if (xs[m] < v) a = m + 1; else b = m; }
  return a;
}
/**
 * v8 (QUOTEFIDELITY-PAIRING-COST, 2026-11-01): the pairing gap analysis is BOUNDED per leaf, the way DEVICE_MATCH_BUDGET
 * bounds the device matcher. A unit is one raw line a scan visits; each candidate alignment is charged the document's length
 * (its linear passes) and a similarity table one unit per 16 cells. Past the budget the block being analysed — and every
 * later block of the leaf — is a finding with `budgetExceeded: true`: NOT CHECKED, escalating, never a pass and never
 * `complete`. Every scan below is index-driven first, so an honest quote does not come near it: the whole production
 * replay (2026-11-01) never exceeded it.
 */
export const PAIRING_MATCH_BUDGET = 4_000_000;
export interface PairingMeter { left: number }
const PAIRING_OVER_BUDGET = Symbol('quoteFidelity pairing budget exceeded');

/** Per document: non-blank raw indices keyed by the three window-free predicates of the gap analysis — the inline-comment
 *  stripped form (only where stripping changes a non-empty line), the whitespace-collapsed form, and the head token. Each list
 *  is ascending, so "the first unused window line satisfying P" is the first unused entry of P's list inside the window —
 *  the same line the linear window scan finds. */
interface GapIndex { strip: Map<string, number[]>; ws: Map<string, number[]>; head: Map<string, number[]> }
const gapIndexes = new WeakMap<string[][], GapIndex>();
function gapIndexOf(forms: string[][], nonBlank: number[]): GapIndex {
  let gi = gapIndexes.get(forms);
  if (!gi) {
    gi = { strip: new Map(), ws: new Map(), head: new Map() };
    const add = (m: Map<string, number[]>, key: string, k: number) => { const a = m.get(key); if (a) a.push(k); else m.set(key, [k]); };
    for (const k of nonBlank) {
      const f = forms[k][0];
      const st = stripInline(f);
      if (st !== f && st !== '') add(gi.strip, st, k);
      add(gi.ws, collapseWs(f), k);
      add(gi.head, f.split(/\s+/)[0], k);
    }
    gapIndexes.set(forms, gi);
  }
  return gi;
}
const positionIndex = new WeakMap<string[][], Map<string, number[]>>();
function positionsOf(forms: string[][]): Map<string, number[]> {
  let idx = positionIndex.get(forms);
  if (!idx) {
    idx = new Map();
    forms.forEach((fs, k) => { for (const f of new Set(fs)) { const a = idx!.get(f); if (a) a.push(k); else idx!.set(f, [k]); } });
    positionIndex.set(forms, idx);
  }
  return idx;
}

/**
 * v6 candidate alignments of the quote lines `qn` onto raw lines [from, to], each in order (a bare separator never anchors):
 *  0. forward greedy from `from` — every line takes its FIRST occurrence (the v5 alignment, so it wins every tie);
 *  1. backward greedy from `to` — every line takes its LAST occurrence (the tightest span ending at the block's last line);
 *  2. forward greedy from each occurrence of the first anchoring line, and backward greedy from each occurrence of the last
 *     (≤ ALIGN_ANCHOR_CAP each) — a repeated stanza head (`server {`) or key (`metrics:`) is tried at every place it occurs.
 * Duplicates are dropped. The caller judges each by its findings.
 */
export function alignmentCandidates(qn: string[], forms: string[][], from: number, to: number): Array<Array<number | null>> {
  const idx = positionsOf(forms);
  // QUOTEFIDELITY-PAIRING-COST: each quote line's occurrences inside [from, to] are a RANGE [a, b) of its ascending position
  // list, found by binary search — never a filtered copy, and every "first occurrence at or after / last at or before" lookup
  // below is a binary search inside that range. Same alignments as the linear scans they replace (a document of 60,000
  // identical lines against a 6,000-line quote of that line took ~15 s; quadratic in occurrences × quote lines).
  type Occ = { ps: number[]; a: number; b: number };
  const NONE: Occ = { ps: [], a: 0, b: 0 };
  const anchors: Occ[] = qn.map((q) => {
    const ps = lineClass(q) === 'separator' ? undefined : idx.get(q);
    return ps ? { ps, a: lowerBound(ps, from), b: lowerBound(ps, to + 1) } : NONE;
  });
  const forward = (start: number): Array<number | null> => {
    let pos = start;
    return anchors.map(({ ps, a, b }) => {
      const j = Math.max(a, lowerBound(ps, pos));
      if (j >= b) return null;
      pos = ps[j] + 1;
      return ps[j];
    });
  };
  const backward = (end: number): Array<number | null> => {
    let pos = end;
    const out: Array<number | null> = new Array(anchors.length).fill(null);
    for (let i = anchors.length - 1; i >= 0; i--) {
      const { ps, a, b } = anchors[i];
      const j = Math.min(b, lowerBound(ps, pos + 1)) - 1;
      if (j < a) continue;
      out[i] = ps[j];
      pos = ps[j] - 1;
    }
    return out;
  };
  const firstAnchor = anchors.find((o) => o.b > o.a) ?? NONE;
  const lastAnchor = [...anchors].reverse().find((o) => o.b > o.a) ?? NONE;
  const cands = [
    forward(from),
    backward(to),
    ...firstAnchor.ps.slice(firstAnchor.a, Math.min(firstAnchor.b, firstAnchor.a + ALIGN_ANCHOR_CAP)).map(forward),
    ...lastAnchor.ps.slice(Math.max(lastAnchor.a, lastAnchor.b - ALIGN_ANCHOR_CAP), lastAnchor.b).map(backward),
  ];
  const seen = new Set<string>();
  return cands.filter((a) => { const key = a.join(','); if (seen.has(key)) return false; seen.add(key); return true; });
}

/** Analyse ONE block against the prepared raw documents. Exported for the fixtures. */
export function analyseBlock(block: QuoteBlock, prepared: PreparedDoc[], meter: PairingMeter = { left: PAIRING_MATCH_BUDGET }): BlockResult {
  const nb = block.body.filter((l) => l.trim());
  if (nb.length < MIN_PAIR_LINES) return { pairable: false };
  const qn = nb.map(qnorm);

  let best: PreparedDoc | null = null;
  let bestM = 0;
  const counts = prepared.map((p) => {
    let m = 0;
    for (const q of qn) if (p.set.has(q)) m++;
    if (m > bestM) { best = p; bestM = m; }
    return m;
  });
  if (!best || bestM < MIN_PAIR_LINES || bestM * 2 < nb.length) return { pairable: false };

  // v7 (QUOTE-PAIRING-TIE): when several documents reach the best line-set count, each is aligned and the one with the most
  // in-order matched lines wins, then the lowest gapCost - the SAME order v6 uses between alignments inside one document. A
  // remaining tie keeps the first document (v6's choice). gapCost alone is NOT enough: on the live instance the wrong document
  // (a Git file whose stanza order differs from the device the quote was taken from) has the LOWER gapCost.
  const tied = prepared.filter((_, i) => counts[i] === bestM);
  try {
    let win = alignToDocument(block, nb, qn, tied[0], meter);
    for (const p of tied.slice(1)) {
      const c = alignToDocument(block, nb, qn, p, meter);
      if (c.matched > win.matched || (c.matched === win.matched && c.gapCost < win.gapCost)) win = c;
    }
    return win.result;
  } catch (e) {
    if (e !== PAIRING_OVER_BUDGET) throw e;
    return overBudget(block, tied[0]);
  }
}

/** v8: the block's claim, decided by its label and first two lines against the paired document's lane (unchanged rule). */
function claimOf(block: QuoteBlock, lane: QuoteLane): 'verbatim' | 'excerpt' | 'none' {
  return claimsVerbatim(block.label) || claimsVerbatim(block.body.slice(0, 2).join('\n')) ? 'verbatim'
    : lane === 'file-artifact' && (claimsVerbatim(block.label, EXCERPT_CLAIM_RE) || claimsVerbatim(block.body.slice(0, 2).join('\n'), EXCERPT_CLAIM_RE)) ? 'excerpt'
      : 'none';
}

/** v8: a block the pairing budget ran out on. Nothing was decided, so nothing is listed: an empty finding naming the paired
 *  document, `budgetExceeded`, escalating (never a pass, never `complete`, even on a truncated source). */
function overBudget(block: QuoteBlock, p: PreparedDoc): BlockResult {
  const lane = laneOf(p.doc);
  const claim = claimOf(block, lane);
  const elisions = { wholeUnit: 0, named: 0, placeholder: 0, reordered: 0, whitespaceOnly: 0, adjacentToExcerpt: 0 };
  const doc = p.doc;
  const sourceTruncated: BlockFinding['sourceTruncated'] = doc.persistTruncated ? 'persist' : doc.llmTruncated ? 'llm' : undefined;
  const finding: BlockFinding = {
    blockLine: block.blockLine,
    claim,
    source: { origin: doc.origin, call: doc.call, tool: doc.tool, path: doc.path, lane },
    span: { rawFrom: 0, rawTo: 0, wholeDoc: false },
    omitted: { comment: [], content: [], adjacentComment: [] },
    changed: [],
    added: [],
    totals: { omittedComment: 0, omittedContent: 0, adjacentComment: 0, changed: 0, added: 0 },
    elisions,
    ...(doc.rewritten ? { sourceRewritten: true as const } : {}),
    ...(sourceTruncated ? { sourceTruncated } : {}),
    budgetExceeded: true,
    escalates: true,
  };
  return { pairable: true, finding, lane, claim, elisions };
}

/** v7: the v6 alignment + gap analysis of ONE block against ONE candidate document. Returns the block result and the winning
 *  alignment's score, which the caller compares across the documents tied on the line-set count. */
function alignToDocument(
  block: QuoteBlock, nb: string[], qn: string[], best: PreparedDoc, meter: PairingMeter,
): { result: BlockResult; matched: number; gapCost: number } {
  const charge = (units: number) => { meter.left -= units; if (meter.left < 0) throw PAIRING_OVER_BUDGET; };
  const raw = best.doc.lines;
  const nonBlank = nonBlankOf(raw);
  const forms = best.forms;
  const gi = gapIndexOf(forms, nonBlank);
  /** The first entry of an ascending index list inside (lo, hi) that no quote line has used — charged per entry visited. */
  let used = new Set<number>();
  /** Per evaluation: for each (index list, window start) the first position not yet used. `used` only grows inside one
   *  evaluation and every unaligned line of a segment shares the segment's window, so the cursor only moves forward — the
   *  lines consumed by earlier quote lines are skipped once, not once per quote line (amortised; each skip is charged). */
  let cursors = new Map<number[], Map<number, number>>();
  const freeFrom = (list: number[], j0: number, hi: number): number => {
    let m = cursors.get(list);
    if (!m) cursors.set(list, (m = new Map()));
    let j = m.get(j0) ?? j0;
    while (j < list.length && list[j] < hi && used.has(list[j])) { charge(1); j++; }
    m.set(j0, j);
    return j;
  };
  /** The first entry of an ascending index list inside (lo, hi) that no quote line has used. */
  const firstUnused = (list: number[] | undefined, lo: number, hi: number): number | undefined => {
    if (!list) return undefined;
    const j = freeFrom(list, lowerBound(list, lo + 1), hi);
    charge(1);
    return j < list.length && list[j] < hi ? list[j] : undefined;
  };
  const lane = laneOf(best.doc);
  // v6: an excerpt-LABELLED block in the FILE lane is read strictly (same counting as verbatim); elsewhere it stays a free narrowing.
  const claim = claimOf(block, lane);
  const strict = claim !== 'none';
  // S1 (review 2026-10-13): every raw line this fact EMITS is shown in the form the model was shown. `raw` is the PRE-R9
  // persisted payload, and this fact is whitelisted (agent.results returns it), so emitting a rewritten call's raw line
  // would re-materialise an injection R9 neutralised — the F9-s7 class, widened. Matching is unchanged.
  // v3 (sec-ops batch-1, QUOTEFIDELITY-PERLINE-CONTEXT-REDACT): an emitted raw line is taken from its document redacted IN CONTEXT
  // (one R10 plain-arm pass per document, lazily, line-preserving) — a context-only secret (a Junos `snmp { community … }` value)
  // never reaches the fact; then the R9 form when the call was rewritten (S1).
  let rawRedacted: string[] | null = null;
  const shownAt = (k: number): string => {
    const l = (rawRedacted ??= redactArtifactSecrets(raw.join('\n')).redacted.split('\n'))[k] ?? raw[k];
    return cap(best!.doc.rewritten ? acceptableForms(l, true).slice(-1)[0] ?? l.trim() : l.trim());
  };
  const nbIdx = block.body.map((_, j) => j).filter((j) => block.body[j].trim());
  const quoteAt = (i: number): string =>
    cap((block.bodyRedacted ? block.bodyRedacted[nbIdx[i]] ?? '' : redactArtifactSecrets(nb[i]).redacted).trim());

  // v6 alignment (QUOTE-ALIGNMENT-AMBIGUITY): the in-order alignment is no longer the FIRST occurrence of each line. A small
  // set of candidate alignments (header note) is each judged by the gap analysis below: the most in-order matched lines, then
  // the fewest unaccounted raw lines inside the span (`gapCost`); a tie keeps the v5 alignment (candidate 0).
  const range = labelLineRange(block.label, raw.length);

  const evaluate = (aligned: Array<number | null>, scope: [number, number] | null) => {
    charge(1 + aligned.length);
    used = new Set<number>(aligned.filter((k): k is number => k !== null));
    cursors = new Map();
    const matched = used.size;

    const elisions = { wholeUnit: 0, named: 0, placeholder: 0, reordered: 0, whitespaceOnly: 0, adjacentToExcerpt: 0 };
    // An R10 placeholder that aligned through the wildcard normalisation is still a substitution — counted, never silent.
    elisions.placeholder += qn.filter((q, i) => aligned[i] !== null && q.includes(REDACTION_TOKEN)).length;
    const changed: BlockFinding['changed'] = [];
    const added: string[] = [];
    /** Raw ranges (exclusive bounds) a named elision marker covers: between its neighbouring aligned lines. */
    const namedRanges: Array<[number, number]> = [];

    // The nearest aligned raw index before / after each quote line, precomputed (`aligned` is fixed for this evaluation; was a
    // per-line walk, quadratic in the block's length). Same values as the walks they replace.
    const prevA: number[] = new Array(aligned.length);
    const nextA: number[] = new Array(aligned.length);
    for (let j = 0, last = -1; j < aligned.length; j++) { prevA[j] = last; if (aligned[j] !== null) last = aligned[j] as number; }
    for (let j = aligned.length - 1, last = raw.length; j >= 0; j--) { nextA[j] = last; if (aligned[j] !== null) last = aligned[j] as number; }
    const prevAligned = (i: number) => prevA[i];
    const nextAligned = (i: number) => nextA[i];

    for (let i = 0; i < nb.length; i++) {
      if (aligned[i] !== null || lineClass(qn[i]) === 'separator') continue;
      const q = nb[i];
      const qN = qn[i];
      const lo = prevAligned(i), hi = nextAligned(i);
      // The window — the unused non-blank raw lines in (lo, hi), ascending — is never materialised (v8): the two checks that
      // must test every window line walk it lazily, the other three walk their index list (gapIndexOf). Same lines, same
      // order, same first match; every visit is charged to the leaf's PAIRING_MATCH_BUDGET.
      const p0 = freeFrom(nonBlank, lowerBound(nonBlank, lo + 1), hi);

      if (ELISION_MARKER_RE.test(q)) { namedRanges.push([lo, hi]); elisions.named++; continue; }
      if (best!.set.has(qN)) { elisions.reordered++; continue; }
      const ph = placeholderRegex(qN);
      if (ph) {
        let k: number | undefined;
        for (let p = p0; p < nonBlank.length && nonBlank[p] < hi; p++) {
          charge(1);
          const kk = nonBlank[p];
          if (!used.has(kk) && forms[kk].some((f) => ph.test(f))) { k = kk; break; }
        }
        if (k !== undefined) { used.add(k); elisions.placeholder++; continue; }
      }
      // A redaction the HARVESTER applied itself can garble the rest of its line (live: cmtbc6nj4…, `secret sha512
      // <<REDACTED-SECRET>> user-secret-hash>`), so everything from the first token on is a wildcard — anchored on a
      // literal prefix long enough that it cannot pair an unrelated line in the window.
      // N2 (review 2026-10-13): a SHORT prefix (`allow `, `psk `, `key `) is accepted only when exactly one window line
      // carries it, so it can never choose between two candidates.
      const prefix = qN.split(REDACTION_TOKEN)[0];
      if (qN.includes(REDACTION_TOKEN) && prefix.trim().length >= MIN_SHORT_REDACTION_PREFIX) {
        // The first candidate decides a long prefix; a short one needs to know only whether a SECOND exists.
        const want = prefix.trim().length >= MIN_REDACTION_PREFIX ? 1 : 2;
        const cands: number[] = [];
        for (let p = p0; p < nonBlank.length && nonBlank[p] < hi && cands.length < want; p++) {
          charge(1);
          const kk = nonBlank[p];
          if (!used.has(kk) && forms[kk].some((f) => f.startsWith(prefix))) cands.push(kk);
        }
        const k = want === 1 || cands.length === 1 ? cands[0] : undefined;
        if (k !== undefined) { used.add(k); elisions.placeholder++; continue; }
      }
      const kInline = firstUnused(gi.strip.get(stripInline(qN)), lo, hi);
      if (kInline !== undefined) {
        used.add(kInline);
        changed.push({ quote: quoteAt(i), raw: shownAt(kInline), kind: 'inline-comment-stripped' });
        continue;
      }
      const kWs = firstUnused(gi.ws.get(collapseWs(qN)), lo, hi);
      if (kWs !== undefined) { used.add(kWs); elisions.whitespaceOnly++; continue; }
      const head = qN.split(/\s+/)[0];
      let kEd: number | undefined;
      let bestSim = 0;
      const sameHead = gi.head.get(head) ?? [];
      for (let j = freeFrom(sameHead, lowerBound(sameHead, lo + 1), hi); j < sameHead.length && sameHead[j] < hi; j++) {
        charge(1);
        const kk = sameHead[j];
        if (used.has(kk)) continue;
        const f = forms[kk][0];
        if (lineClass(f) !== lineClass(qN)) continue;
        const s = similarity(f, qN, charge);
        if (s >= CHANGED_MIN_SIMILARITY && s > bestSim) { bestSim = s; kEd = kk; }
      }
      if (kEd !== undefined) {
        used.add(kEd);
        changed.push({ quote: quoteAt(i), raw: shownAt(kEd), kind: 'edited' });
        continue;
      }
      added.push(quoteAt(i));
    }

    const keptIdx = [...used].sort((a, b) => a - b);
    const lo = keptIdx[0];
    const hi = keptIdx[keptIdx.length - 1];
    const base = Math.min(...keptIdx.map((k) => indentOf(raw[k])));
    const omitted: BlockFinding['omitted'] = { comment: [], content: [], adjacentComment: [] };

    for (let g = 0; g + 1 < keptIdx.length; g++) {
      const a = keptIdx[g], b = keptIdx[g + 1];
      if (b === a + 1) continue;
      // raw line INDICES (emitted through shownAt). Non-blank only (v8): a blank line is neither content, comment nor separator,
      // so it never reached any list below.
      const gap: number[] = [];
      for (let p = lowerBound(nonBlank, a + 1); p < nonBlank.length && nonBlank[p] < b; p++) gap.push(nonBlank[p]);
      charge(1 + gap.length + namedRanges.length);
      const content = gap.filter((k) => lineClass(raw[k]) === 'content');
      // A bare `#` / `!` INSIDE a comment run is part of it (run 2's header carries one); alone it is punctuation.
      const hasComment = gap.some((k) => lineClass(raw[k]) === 'comment');
      const comments = hasComment ? gap.filter((k) => lineClass(raw[k]) === 'comment' || lineClass(raw[k]) === 'separator') : [];
      if (!content.length && !comments.length) continue;
      if (namedRanges.some(([rl, rh]) => rl <= a && b <= rh)) continue; // counted once, at the marker
      if (content.length) {
        if (indentOf(raw[content[0]]) <= base && indentOf(raw[b]) <= base) { elisions.wholeUnit++; continue; }
        omitted.content.push(...content.map(shownAt));
        omitted.comment.push(...comments.map(shownAt));
      } else {
        omitted.comment.push(...comments.map(shownAt));
      }
    }

    // The run of non-content raw lines adjacent to the span, walked over the NON-BLANK index (v8): its non-blank members (in
    // walking order) and its far edge — the raw line after the content line that stops it, or the document's end. The same
    // run the per-line walk produced, without visiting the blank lines inside it.
    const adjRun = (step: -1 | 1): { nb: number[]; edge: number } => {
      const nb: number[] = [];
      let p = step < 0 ? lowerBound(nonBlank, lo) - 1 : lowerBound(nonBlank, hi + 1);
      for (; p >= 0 && p < nonBlank.length; p += step) {
        charge(1);
        if (lineClass(raw[nonBlank[p]]) === 'content') break;
        nb.push(nonBlank[p]);
      }
      const stop = p >= 0 && p < nonBlank.length ? nonBlank[p] : step < 0 ? -1 : raw.length;
      return { nb, edge: stop - step };
    };
    const preRun = adjRun(-1);
    const postRun = adjRun(1);
    const pre = preRun.nb;
    const post = postRun.nb;
    // No non-blank raw line before the run's far edge (or the span when the run is empty) nor after the other.
    const preStart = preRun.edge <= lo - 1 ? preRun.edge : lo;
    const postEnd = postRun.edge >= hi + 1 ? postRun.edge + 1 : hi + 1;
    const outsideEmpty = lowerBound(nonBlank, preStart) === 0 && lowerBound(nonBlank, postEnd) === nonBlank.length;
    const preNamed = namedRanges.some(([rl]) => rl < lo);
    const postNamed = namedRanges.some(([, rh]) => rh > hi);
    // v6: a LABEL RANGE ("lines 25–37") is the span the block claims. Its own lines outside the quoted span are omissions
    // (content as content, comments as adjacent comments) unless a named marker covers that edge; what lies beyond the
    // range is an excerpt boundary, so adjacent comments there are counted `adjacentToExcerpt`, never findings.
    const wholeDoc = outsideEmpty && (!scope || (lowerBound(nonBlank, scope[0]) === 0 && lowerBound(nonBlank, scope[1] + 1) === nonBlank.length));
    if (scope) {
      const nonBlankIn = (from: number, to: number): number[] => { // raw [from, to), non-blank, ascending
        const out: number[] = [];
        for (let p = lowerBound(nonBlank, from); p < nonBlank.length && nonBlank[p] < to; p++) { charge(1); out.push(nonBlank[p]); }
        return out;
      };
      const edges: Array<[number[], boolean]> = [
        [nonBlankIn(scope[0], lo), preNamed],
        [nonBlankIn(hi + 1, scope[1] + 1), postNamed],
      ];
      for (const [ks, named] of edges) {
        if (named) continue;
        for (const k of ks) {
          const c = lineClass(raw[k]);
          if (c === 'content') omitted.content.push(shownAt(k));
          else if (c === 'comment') omitted.adjacentComment.push(shownAt(k));
        }
      }
    }
    for (const [run, named] of [[pre, preNamed], [post, postNamed]] as Array<[number[], boolean]>) {
      const outRun = scope ? run.filter((k) => k < scope[0] || k > scope[1]) : run;
      const comments = outRun.some((k) => lineClass(raw[k]) === 'comment')
        ? outRun.filter((k) => lineClass(raw[k]) !== 'blank').map((k) => shownAt(k))
        : [];
      if (!comments.length || named) continue;
      if (wholeDoc) omitted.adjacentComment.push(...(run === pre ? comments.reverse() : comments));
      else elisions.adjacentToExcerpt += comments.length;
    }

    const findingCount = strict
      ? omitted.comment.length + omitted.content.length + omitted.adjacentComment.length + changed.length + added.length
      : changed.filter((c) => c.kind === 'edited').length;
    // The alignment's own COST, independent of every exemption rule (an exemption-aware score would let an alignment buy a
    // clean reading by moving the span — run 2's header became "adjacent to an excerpt" that way): raw lines inside the
    // span that no quote line accounts for and no named marker covers.
    let gapCost = 0;
    for (let p = lowerBound(nonBlank, lo + 1); p < nonBlank.length && nonBlank[p] < hi; p++) {
      charge(1 + namedRanges.length);
      const k = nonBlank[p];
      if (!used.has(k) && !namedRanges.some(([a, b]) => a < k && k < b)) gapCost++;
    }
    return { matched, gapCost, findingCount, lo, hi, wholeDoc, omitted, changed, added, elisions, scope };
  };

  type Evaluated = ReturnType<typeof evaluate>;
  const pick = (cands: Array<Array<number | null>>, scope: [number, number] | null): Evaluated | null => {
    let chosen: Evaluated | null = null;
    for (const a of cands) {
      if (!a.some((k) => k !== null)) continue;
      const e = evaluate(a, scope);
      if (!chosen || e.matched > chosen.matched || (e.matched === chosen.matched && e.gapCost < chosen.gapCost)) chosen = e;
    }
    return chosen;
  };
  let ev = pick(alignmentCandidates(qn, forms, 0, raw.length - 1), null)!;
  if (range) {
    // Honoured only when the range can hold the block: an alignment inside it must match as many lines as the best
    // alignment anywhere. A range that cannot (a wrong or differently-numbered range) is ignored, never trusted.
    const scoped = pick(alignmentCandidates(qn, forms, range[0], range[1]), range);
    if (scoped && scoped.matched >= ev.matched) ev = scoped;
  }
  const { findingCount, lo, hi, wholeDoc, omitted, changed, added, elisions } = ev;
  const doc = best.doc;
  const sourceTruncated: BlockFinding['sourceTruncated'] = doc.persistTruncated ? 'persist' : doc.llmTruncated ? 'llm' : undefined;

  const score = { matched: ev.matched, gapCost: ev.gapCost };
  if (findingCount === 0) return { result: { pairable: true, finding: null, lane, claim, elisions }, ...score };

  const listCap = <T>(xs: T[]) => xs.slice(0, LIST_CAP);
  const finding: BlockFinding = {
    blockLine: block.blockLine,
    claim,
    source: { origin: doc.origin, call: doc.call, tool: doc.tool, path: doc.path, lane },
    span: { rawFrom: lo + 1, rawTo: hi + 1, wholeDoc, ...(ev.scope ? { labelRange: [ev.scope[0] + 1, ev.scope[1] + 1] as [number, number] } : {}) },
    omitted: strict
      ? { comment: listCap(omitted.comment), content: listCap(omitted.content), adjacentComment: listCap(omitted.adjacentComment) }
      : { comment: [], content: [], adjacentComment: [] },
    changed: listCap(strict ? changed : changed.filter((c) => c.kind === 'edited')),
    added: strict ? listCap(added) : [],
    totals: strict
      ? { omittedComment: omitted.comment.length, omittedContent: omitted.content.length, adjacentComment: omitted.adjacentComment.length, changed: changed.length, added: added.length }
      : { omittedComment: 0, omittedContent: 0, adjacentComment: 0, changed: changed.filter((c) => c.kind === 'edited').length, added: 0 },
    elisions,
    ...(doc.rewritten ? { sourceRewritten: true as const } : {}),
    ...(sourceTruncated ? { sourceTruncated } : {}),
    escalates: !sourceTruncated,
  };
  return { result: { pairable: true, finding, lane, claim, elisions }, ...score };
}

/** Group `fencedBlockLines` output back into blocks (consecutive document lines, same axes). */
type ClassifiedBlock = QuoteBlock & { kind: BlockKind; restoreIntent: boolean; labelAxis: BlockLabel; ancestry: string; claimLabel: string; fenceInfo: string; bodyLines: number[] };

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
      // v3: the DEVICE-CLAIM label is HEADING-BOUNDED (the dialect-lint rule, heading included): the 3-line window above crosses
      // into the previous section's prose ("both a git-file and a device-read source …") and would opt a device block out.
      const claim: string[] = [];
      for (let k = fence - 2; k >= 0 && claim.length < 3; k--) {
        if (/^\s*```/.test(lines[k])) break;
        if (lines[k].trim()) claim.push(lines[k]);
        if (/^\s{0,3}#{1,6}\s/.test(lines[k])) break;
      }
      blocks.push({ blockLine: fence, body: [], label: label.join('\n'), kind: b.kind, restoreIntent: b.restoreIntent, labelAxis: b.label, ancestry: b.ancestry, claimLabel: claim.join('\n'), fenceInfo: (lines[fence - 1] ?? '').replace(/^\s*`+/, '').trim(), bodyLines: [] });
    }
    blocks[blocks.length - 1].body.push(b.text);
    blocks[blocks.length - 1].bodyLines.push(b.line);
    prev = b.line;
  }
  return blocks;
}

// ── v3: device-read claims ───────────────────────────────────────────────────────────────────────────────────────
export const DEVICE_CLAIM_RE = /device[- ]?read|running[- ]config|fetch_data|config getter|from the device|device (?:config|output)/i;
export const GIT_CLAIM_RE = /git[- ]?file|github|\.cfg\b|\bcommit\b|from (?:the )?file/i;
const NEGATED_GIT_RE = /\bno git[- ]?file\b[^.)\n]*/gi;
const DEVICE_SKIP_RE = /^\s*(?:!|\.\.\.|…)\s*$/;
const DEVICE_PLACEHOLDER_SPLIT = new RegExp(`${REDACTION_TOKEN}|<[A-Za-z][^<>]{0,40}>`, 'g');
const DEVICE_FINDING_CAP = 6;
/** v4 (a): a comment line that only NAMES the device — one token, optionally a parenthetical (`! sw1`, `# sw1 (AS 65001)`). */
const DEVICE_LABEL_LINE_RE = /^\s*(?:!|#|\/\/)\s*[A-Za-z0-9][\w.-]*(?:\s*\([^()\n]{0,80}\))?\s*$/;
/** v4 (c): owner decision 2026-10-26 — a block labelled normalized / rendering makes no verbatim claim (an excerpt label still
 *  does — owner H-1). Per word, so each share is counted. `rendering` is only an API / JSON / structured rendering or "rendering of" (sec-ops batch-2a N-1: "the
 *  running-config as rendered by the device" IS a verbatim claim). */
const LABEL_WORDS: ReadonlyArray<[DeviceExclusion, RegExp]> = [
  ['label-normalized', /normali[sz](?:ed|ation)/i],
  ['label-rendering', /\b(?:api|json|structured)\s+rendering\b|\brendering\s+of\b|\brendered\s+(?:from|by)\s+(?:the\s+)?(?:api|json|structured)/i],
];
export const NOT_VERBATIM_LABEL_RE = new RegExp(LABEL_WORDS.map(([, re]) => `(?:${re.source})`).join('|'), 'i');
/** v4 (f): bound the structured-scalar scan (it runs only on a block that already failed). */
const STRUCTURED_LEAF_CAP = 20000;
/** v4 (e) / sec-ops batch-2a B-2: matcher comparisons the stanza pass may spend per leaf (all blocks, all documents). */
export const DEVICE_MATCH_BUDGET = 2_000_000;
export type DeviceExclusion = 'command-or-rollback' | 'label-normalized' | 'label-rendering' | 'quote-finding' | 'structured-rendering' | 'hierarchy-form-not-parsed';

/** Does the block's (heading-bounded) label claim it IS a device read? Exported for the fixtures. */
export function claimsDeviceRead(claimLabel: string): boolean {
  const l = claimLabel.replace(NEGATED_GIT_RE, '');
  return DEVICE_CLAIM_RE.test(l) && !GIT_CLAIM_RE.test(l);
}

/** NFKC, trailing whitespace off, LEADING whitespace KEPT (indentation is the parent context), R10's plain arm, and every
 *  R10 placeholder spelling folded to one token — applied to BOTH sides. */
function deviceNorm(s: string): string {
  const t = s.normalize('NFKC').replace(/\s+$/, '');
  return redactArtifactSecrets(t).redacted.replace(/\s+$/, '').replace(REDACTION_RE, REDACTION_TOKEN);
}
/** A quote line as a matcher: exact, or — when it carries a placeholder — a LINEAR glob whose placeholders each match one or more
 *  characters. sec-ops batch-1 B-1: this was a `^a.+?b.+?…$` regex, polynomial in the placeholder count against an untrusted served
 *  line (6 placeholders × 80 chars = 1.9 s; 8 did not finish) on the persist's event loop. Now: an anchored prefix, each middle literal
 *  found with indexOf (leftmost placement is optimal when the end is anchored), the last literal anchored at the end — O(line) per
 *  pair, whatever the quote holds. Adjacent placeholders collapse into one gap of ≥ n characters. */
/** The exact normalised form of a quote line, or null when it carries a placeholder (then only `deviceMatcher` decides). */
function deviceExact(q: string): string | null {
  const n = deviceNorm(q);
  return n.includes(REDACTION_TOKEN) || ANGLE_PLACEHOLDER_RE.test(n) ? null : n;
}
export function deviceMatcher(q: string): (r: string) => boolean {
  let n = deviceNorm(q);
  if (!n.includes(REDACTION_TOKEN) && !ANGLE_PLACEHOLDER_RE.test(n)) return (r) => r === n;
  // Rule 6: from an R10 placeholder to the end of the line is a wildcard (a self-redaction may garble the tail).
  const at = n.indexOf(REDACTION_TOKEN);
  const tail = at >= 0;
  if (tail) n = n.slice(0, at);
  const parts = n.split(DEVICE_PLACEHOLDER_SPLIT);
  const lits: string[] = [parts[0]];
  const gaps: number[] = []; // gaps[i] = minimum characters between lits[i] and lits[i + 1]
  let g = 1;
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === '' && i < parts.length - 1) { g++; continue; }
    lits.push(parts[i]); gaps.push(g); g = 1;
  }
  return (r) => globMatch(r, lits, gaps, tail);
}

function globMatch(r: string, lits: string[], gaps: number[], tail: boolean): boolean {
  if (!r.startsWith(lits[0])) return false;
  let pos = lits[0].length;
  const last = lits.length - 1;
  for (let i = 1; i < last; i++) {
    const idx = r.indexOf(lits[i], pos + gaps[i - 1]);
    if (idx < 0) return false;
    pos = idx + lits[i].length;
  }
  if (last === 0) return tail ? r.length > pos : r.length === pos;
  const lastLit = lits[last];
  const gap = gaps[last - 1];
  if (tail) {
    const idx = r.indexOf(lastLit, pos + gap);
    return idx >= 0 && idx + lastLit.length < r.length;
  }
  return r.endsWith(lastLit) && r.length - lastLit.length >= pos + gap;
}

export interface DeviceReadFinding {
  blockLine: number;
  /** Config lines in the block (bare `!` / elision markers excluded). */
  lines: number;
  /** The first block line (R10-redacted, capped) past the longest in-order exact run in any served device document. */
  firstUnmatched: string;
  /** No `other`-lane document was served to compare against at all. */
  noDeviceRead?: true;
  /** A served device document was cut at persist (> 50 KB preview): the block cannot be proven rebuilt — recorded, not escalated. */
  sourceTruncated?: 'persist';
  /** v4: the stanza pass ran out of DEVICE_MATCH_BUDGET before deciding — not proven faithful, so it escalates. */
  budgetExceeded?: true;
  escalates: boolean;
}

/** v4 (e): kept-line indices grouped into stanzas — an unindented line opens one; indented lines continue it. */

function stanzasOf(body: string[]): number[][] {
  const out: number[][] = [];
  body.forEach((l, i) => {
    if (!/^\s/.test(l) || out.length === 0) out.push([i]); else out[out.length - 1].push(i);
  });
  return out;
}

/** v4 (f): is the failed block mostly renderings of served structured SCALARS? A served single-line document is a scalar
 *  leaf; a block line renders it when it carries the scalar's value AND the last two segments of its key path. Linear in
 *  lines × leaves (both bounded); `includes` only, never a regex over served text. */
function isStructuredRendering(body: string[], dev: RawToolDocument[]): boolean {
  const toks = body.map((l) => new Set(l.split(/[^A-Za-z0-9_-]+/).filter(Boolean)));
  const all = new Set<string>(); for (const t of toks) for (const x of t) all.add(x);
  const leaves: Array<{ value: string; k1: string; k2: string }> = [];
  for (const d of dev) {
    if (leaves.length >= STRUCTURED_LEAF_CAP) break;
    if (d.lines.length !== 1) continue;
    const value = d.lines[0].trim();
    if (!value) continue; // sec-ops batch-2a N-2: an empty scalar renders nothing
    const segs = d.path.split('.').filter(Boolean).map((x) => x.replace(/\[\d+\]$/, ''));
    if (segs.length < 2) continue;
    const k1 = segs[segs.length - 1]; const k2 = segs[segs.length - 2];
    if (!k1 || !k2 || !all.has(k1) || !all.has(k2)) continue; // prefilter: both key names appear in the block as whole tokens
    leaves.push({ value, k1, k2 });
  }
  if (!leaves.length) return false;
  let renders = 0;
  for (let i = 0; i < body.length; i++) {
    if (leaves.some((f) => toks[i].has(f.k1) && toks[i].has(f.k2) && body[i].includes(f.value))) renders++;
    if (renders * 2 > body.length) return true;             // decided
    if ((renders + body.length - 1 - i) * 2 <= body.length) return false; // cannot reach a majority
  }
  return false;
}

/** v3/v4: each device-claimed block against the `other`-lane documents (stanzas in order, exact indentation, secrets
 *  normalised). `findingBlocks`: the blocks the pairing check already reports (v4 (d)). */
function checkDeviceReads(blocks: ClassifiedBlock[], docs: RawToolDocument[], deliverable: string, findingBlocks: Set<number>): { claimed: number; faithful: number; findings: DeviceReadFinding[]; excluded: Partial<Record<DeviceExclusion, number>> } {
  const dev = docs.filter((d) => laneOf(d) === 'other');
  // sec-ops batch-1 SF-2: the per-line normalisation (R10 + NFKC, R9 on rewritten documents) runs only once a block claims a device
  // read — never on a leaf that has none (the common case).
  let formsMemo: string[][][] | null = null;
  const forms = (): string[][][] => (formsMemo ??= dev.map((d) => d.lines.map((l) => {
    const f = [deviceNorm(l)];
    if (d.rewritten) { const s = deviceNorm(sanitizeChainedOutput(l).text); if (s !== f[0]) f.push(s); }
    return f;
  })));
  // sec-ops batch-1 B-2: the emitted line is taken from the WHOLE deliverable redacted IN CONTEXT (R10's block-context rules — a
  // Junos `snmp { community … }` — do not fire on one line alone). R10 is line-preserving, so a document line number maps across.
  let redactedMemo: string[] | null = null;
  const redactedLine = (docLine: number): string => (redactedMemo ??= redactArtifactSecrets(deliverable).redacted.split('\n'))[docLine - 1] ?? '';
  // Rule 7 for a CLAIM check: only a PERSIST truncation excuses (the full document is not held). An in-loop (8 KB) truncation
  // never does: the check runs against the WHOLE persisted document, and a quote that fails against the whole document cannot
  // be explained by the model having seen less of it (lab: every L-N1 running-config was cut for the model, incl. the rebuilt pair).
  const truncated: DeviceReadFinding['sourceTruncated'] = dev.some((d) => d.persistTruncated) ? 'persist' : undefined;
  let claimed = 0; let faithful = 0;
  const findings: DeviceReadFinding[] = [];
  const excluded: Partial<Record<DeviceExclusion, number>> = {};
  const exclude = (why: DeviceExclusion) => { excluded[why] = (excluded[why] ?? 0) + 1; };
  let budget = DEVICE_MATCH_BUDGET;
  // v5 (g): a served document whose hierarchy lives only in braces is never matched against (config-hierarchy.ts).
  const unparsedMemo = new Map<number, boolean>();
  const docUnparsed = (di: number): boolean => {
    let u = unparsedMemo.get(di);
    if (u === undefined) { u = configHierarchyForm(dev[di].lines.join('\n')) === 'braces-unindented'; unparsedMemo.set(di, u); }
    return u;
  };
  const indexMemo = new Map<number, Map<string, number[]>>();
  const headIndex = (di: number, fd: string[][]): Map<string, number[]> => {
    let m = indexMemo.get(di);
    if (!m) {
      m = new Map();
      fd.forEach((forms, x) => { for (const f of forms) { const a = m!.get(f); if (a) a.push(x); else m!.set(f, [x]); } });
      indexMemo.set(di, m);
    }
    return m;
  };
  for (const b of blocks) {
    // A JSON block (a marker block, structured data) is never a device-config quote, whatever its label says (lab: a
    // `## Harvested Allocations` block under prose naming the device read).
    if (/^json\b/i.test(b.fenceInfo) || !claimsDeviceRead(b.claimLabel)) continue;
    const keep = b.body.map((l, i) => i).filter((i) => b.body[i].trim() && !DEVICE_SKIP_RE.test(b.body[i]));
    // v4 (a): a leading line that only names the device is the block's label, not a quoted line.
    if (keep.length && DEVICE_LABEL_LINE_RE.test(b.body[keep[0]])) keep.shift();
    const body = keep.map((i) => b.body[i]);
    if (body.length < MIN_PAIR_LINES) continue;
    const ms = body.map(deviceMatcher);
    // (e) each block stanza inside ONE served stanza of ONE document, stanzas in any order, each line inside its block parent's
    // served sub-stanza. Exact heads are found through an index (O(1)); a placeholder head scans. Every step — scan, candidate,
    // match, blank skip, stop — is charged to the leaf's budget (sec-ops post-fold item 1). (No unbounded in-order fast path:
    // it accepted a line re-parented in document order — v3's weakness, sec-ops batch-2a SF-1.)
    let best = { matched: -1, first: 0 };
    let overBudget = false;
    let ok = false;
    let unparsedHit = false;
    {
      const stanzas = stanzasOf(body);
      const exact = body.map(deviceExact);
      ok = forms().some((fd, di) => {
        if (overBudget) return false;
        const idx = headIndex(di, fd);
        if (docUnparsed(di)) {
          // v5 (g): never matched against — only noted when a stanza head of the block is found in it (charged to the budget).
          for (const st of stanzas) {
            const h = st[0];
            if (exact[h] !== null) { if ((idx.get(exact[h] as string) ?? []).length) { unparsedHit = true; break; } continue; }
            for (let x = 0; x < fd.length && !unparsedHit; x++) { if (--budget < 0) { overBudget = true; return false; } if (fd[x].some(ms[h])) unparsedHit = true; }
            if (unparsedHit) break;
          }
          return false;
        }
        let matched = 0; let first = -1;
        for (const st of stanzas) {
          const h = st[0];
          const cands: number[] = [];
          if (exact[h] !== null) cands.push(...(idx.get(exact[h] as string) ?? []));
          else for (let x = 0; x < fd.length; x++) { if (--budget < 0) { overBudget = true; return false; } if (fd[x].some(ms[h])) cands.push(x); }
          // The SERVED stanza ends at the next non-blank served line at the head's indentation or less — or, when the block stanza
          // is a run of SIBLINGS (no child deeper than its first line: an excerpt that starts mid-stanza), at one shallower than both.
          const hInd = indentOf(body[h]);
          const cInd = st.length > 1 ? st.slice(1).reduce((m, x) => Math.min(m, indentOf(body[x])), Infinity) : hInd + 1;
          const ends = (served: string): boolean => served !== '' && (cInd > hInd ? indentOf(served) <= hInd : indentOf(served) < Math.min(hInd, cInd));
          // sec-ops post-fold item 2: a deeper line must also stay inside its OWN block parent's served sub-stanza — it stops at the
          // next served line at its parent's indentation or less (vrf B's neighbor shown under vrf A fails). pInd[i] = the indentation
          // of the nearest preceding block line of the stanza shallower than st[i]; none (a sibling of the head) ⇒ the stanza rule.
          const pInd: Array<number | undefined> = st.map((x, i) => {
            const ix = indentOf(body[x]);
            for (let j = i - 1; j >= 0; j--) { const ij = indentOf(body[st[j]]); if (ij < ix) return ij; }
            return undefined;
          });
          const stopsAt = (i: number, served: string): boolean => served !== '' && (ends(served) || (pInd[i] !== undefined && indentOf(served) <= (pInd[i] as number)));
          let reach = 0;
          for (const s0 of cands) {
            // sec-ops post-fold item 1 (B-2 budget bypass): EVERY step is charged — the candidate, each matched line, each blank skip
            // and each stop — so partial-prefix candidates and blank-line runs cannot run free.
            if (--budget < 0) { overBudget = true; return false; }
            let k = s0 + 1; let i = 1;
            for (; i < st.length; i++) {
              while (k < fd.length && !stopsAt(i, fd[k][0]) && (fd[k][0] === '' || !fd[k].some(ms[st[i]]))) {
                if (--budget < 0) { overBudget = true; return false; }
                k++;
              }
              if (--budget < 0) { overBudget = true; return false; }
              if (k >= fd.length || stopsAt(i, fd[k][0])) break;
              k++;
            }
            if (i > reach) reach = i;
            if (reach === st.length) break;
          }
          matched += reach;
          if (reach < st.length && first < 0) first = st[Math.min(reach, st.length - 1)];
        }
        if (matched > best.matched) best = { matched, first: first < 0 ? 0 : first };
        return first < 0;
      });
    }
    if (ok) { claimed++; faithful++; continue; }
    // v4 (b) / (c) / (d) / (f): a block that does NOT reproduce, but makes no rebuilt-text claim — each named and counted.
    // Decided only for a FAILED block, so a block that reproduces stays `faithful` whatever its label (no faithful stamp moves).
    if (b.restoreIntent || b.kind === 'command' || b.kind === 'rollback') { exclude('command-or-rollback'); continue; }
    const word = LABEL_WORDS.find(([, re]) => re.test(b.claimLabel));
    if (word) { exclude(word[0]); continue; }
    if (findingBlocks.has(b.blockLine)) { exclude('quote-finding'); continue; }
    if (!overBudget && unparsedHit) { exclude('hierarchy-form-not-parsed'); continue; }
    if (!overBudget && isStructuredRendering(body, dev)) { exclude('structured-rendering'); continue; }
    claimed++;
    findings.push({
      blockLine: b.blockLine, lines: body.length,
      firstUnmatched: cap(redactedLine(b.bodyLines[keep[best.first]]).trim()),
      ...(dev.length === 0 ? { noDeviceRead: true as const } : {}),
      ...(truncated ? { sourceTruncated: truncated } : {}),
      ...(overBudget ? { budgetExceeded: true as const } : {}),
      escalates: !truncated || overBudget,
    });
  }
  return { claimed, faithful, findings, excluded };
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
  let deliverableRedacted: string[] | null = null;
  const findings: BlockFinding[] = [];
  const lanes = { fileArtifact: 0, other: 0 };
  const claims: { verbatim: number; none: number; excerpt?: number } = { verbatim: 0, none: 0 };
  const elisions = { wholeUnit: 0, named: 0, placeholder: 0, reordered: 0, whitespaceOnly: 0, adjacentToExcerpt: 0 };
  let pairable = 0;
  let complete = 0;
  let budgetExceeded = 0;
  const meter: PairingMeter = { left: PAIRING_MATCH_BUDGET };
  for (const b of inScope) {
    // QUOTEFIDELITY-PERLINE-CONTEXT-REDACT: the block's lines as the deliverable reads redacted IN CONTEXT (one pass, lazily).
    const docRedacted = (deliverableRedacted ??= redactArtifactSecrets(input.deliverable ?? '').redacted.split('\n'));
    const r = analyseBlock({ ...b, bodyRedacted: b.bodyLines.map((n) => docRedacted[n - 1] ?? '') }, prepared, meter);
    if (!r.pairable) continue;
    pairable++;
    if (r.lane === 'file-artifact') lanes.fileArtifact++; else lanes.other++;
    if (r.claim === 'excerpt') claims.excerpt = (claims.excerpt ?? 0) + 1; else claims[r.claim]++;
    for (const k of Object.keys(elisions) as Array<keyof typeof elisions>) elisions[k] += r.elisions[k];
    if (r.finding) findings.push(r.finding); else complete++;
    if (r.finding?.budgetExceeded) budgetExceeded++;
  }

  // v3/v4: device-read claims, over the same in-scope blocks. Runs after the pairing loop: a block the pairing check already
  // reports is judged there (v4 (d)); a rebuilt block may not pair at all.
  const device = checkDeviceReads(inScope, docs, input.deliverable ?? '', new Set(findings.map((f) => f.blockLine)));
  const deviceExcluded = Object.keys(device.excluded).length ? { excluded: device.excluded } : {};
  const deviceReads = { claimed: device.claimed, faithful: device.faithful, rebuilt: device.findings.length,
    escalating: device.findings.filter((f) => f.escalates).length, ...deviceExcluded };
  const devicePart = device.claimed > 0 || Object.keys(device.excluded).length
    ? { deviceReads, ...(device.findings.length ? { deviceFindings: device.findings.slice(0, DEVICE_FINDING_CAP) } : {}),
      ...(device.findings.length > DEVICE_FINDING_CAP ? { deviceFindingsNotListed: device.findings.length - DEVICE_FINDING_CAP } : {}) }
    : {};

  const blocks = { ...scopeCounts, pairable, complete, withFindings: findings.length };
  if (pairable === 0 && device.claimed === 0) {
    return withDisposition({ ...base, checked: false, reason: 'no-pairable-quotes', blocks, ...devicePart, ...excludedPart, witness });
  }
  const escalating = findings.filter((f) => f.escalates);
  return withDisposition({
    ...base,
    checked: true,
    reason: escalating.length || deviceReads.escalating ? 'quote-omits-or-changes-lines' : 'all-quotes-complete',
    blocks: { ...blocks, escalating: escalating.length, sourceTruncated: findings.length - escalating.length, ...(budgetExceeded ? { budgetExceeded } : {}) },
    ...devicePart,
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
