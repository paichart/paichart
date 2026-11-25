/**
 * Leg replay lab — score-cso: the L-CS-O scorer's first piece (Config sources STEP 3, observability-config 1.12.0).
 *
 * W23 — THE TRIPWIRE (plan `STEP3-EF-IMPLEMENTATION-PLAN-v2.md` W23, §11.1; register CONFIG-SOURCES-OBS-JOIN-PRECONDITIONS item 12).
 * Rule 5 of the step: the MODEL never compares the Git file with the served file — the platform does, and states the result. The
 * lab's NO-COMPARE gate asks of a Harvester, Architect or Author output: did the agent write a comparison of its own?
 *
 *   countPairSentences(text, pairs)   PURE. For each declared label that has BOTH a Git base and a served file (a "pair"), the
 *                                     sentences that name the pair's Git path AND its served path. A sentence that names neither
 *                                     ("the Git copy and the live copy differ") is NOT counted — the predicate is weak by
 *                                     construction, which is why it is a lab scorer and not a stamped fact (§11.1).
 *   ownComparisonReading(text, pairs) the gate's PROXY: the pair sentences that also carry a comparison word, less the ones that
 *                                     negate the claim or attribute it to the platform. It FLAGS; the hand read decides (Protocol
 *                                     16 rules 5–6). Until a paid run shows a true positive and no false positive on real outputs
 *                                     it gates nothing by itself.
 *
 * WHERE IT LIVES — a named departure from the plan. W23 says "a pure exported scorer … so the scorer is shipping code". It is built
 * HERE, in the lab, not under `lib/`: it has no production reader and is not stamped (§11.1 — "no population", "weak by
 * construction"). It moves to `lib/` on the day it earns a stamp; nothing else changes then (it imports nothing).
 *
 * WHAT A SENTENCE IS. Markdown emphasis and code ticks are stripped first (they hid two negations in L-T2). The text is cut at
 * line ends and at `. ` / `! ` / `? ` — so a TABLE ROW or a list item is one sentence (table-form drift was an L-K1 scorer miss).
 * A fenced block is skipped: a quoted file is not the agent's statement.
 *
 * No real 1.12.0 output exists yet (no observability leg has read Git), so every case in `csoSelfTest` is written by hand from the
 * shapes the other three Config-sources labs produced. Calibrate on the first `--fake-llm persisted` before-run of stored 1.11.0
 * outputs (every flag there must read 0 — those legs read no Git file) and on the first crib; fix the proxy on real samples, both ways.
 */

export interface PairSpec { label: string; gitPath: string; servedPath: string }
export interface PairSentenceCount { sentences: number; byLabel: Record<string, number>; examples: Array<{ label: string; sentence: string }> }
export type CsoMutation = 'git-path-only' | 'emphasis-blind' | 'row-blind' | 'negation-blind' | 'attribution-blind' | 'fence-blind' | 'section-blind' | 'side-blind' | 'kind-blind' | 'handle-blind' | 'undeclared-blind' | 'heading-handle-blind' | 'context-heading-blind' | 'context-presented-blind' | 'context-quote-blind' | 'context-end-only';
export const CSO_MUTATIONS: readonly CsoMutation[] = ['git-path-only', 'emphasis-blind', 'row-blind', 'negation-blind', 'attribution-blind', 'fence-blind', 'section-blind', 'side-blind', 'kind-blind', 'handle-blind', 'undeclared-blind', 'heading-handle-blind', 'context-heading-blind', 'context-presented-blind', 'context-quote-blind', 'context-end-only'];
export const CSO_EXAMPLES_CAP = 10;
const SENTENCE_SHOWN_CHARS = 240;

/** Emphasis, ticks and a leading list / table marker removed; inner spaces collapsed. An underscore is emphasis only at a word edge —
 *  one inside a name (`_default.conf`, `otlp_ingress.conf`) is part of a path and stays. */
function plain(s: string, m?: CsoMutation): string {
  const t = m === 'emphasis-blind' ? s : s.replace(/[*`]+/g, '').replace(/(?<![A-Za-z0-9/.])_{1,3}(?=\S)|(?<=\S)_{1,3}(?![A-Za-z0-9/.])/g, '');
  return t.replace(/^\s*(?:[-+>]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim();
}

/** The agent's own sentences: fenced blocks dropped, one per line, a line cut again at sentence ends. */
export function sentencesOf(text: string, m?: CsoMutation): string[] {
  const out: string[] = [];
  let fenced = false;
  const lines = m === 'row-blind' ? [text.replace(/\n+/g, ' ')] : text.split(/\r?\n/);
  for (const raw of lines) {
    if (m !== 'fence-blind' && m !== 'row-blind' && /^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;
    for (const part of raw.split(/(?<=[.!?])\s+(?=[A-Z(`*"'|])/)) { const p = plain(part, m); if (p) out.push(p); }
  }
  return out;
}

const bare = (p: string): string => p.replace(/^\/+/, '');
const occurrences = (hay: string, needle: string): number => (needle ? hay.split(needle).length - 1 : 0);
/** Does the sentence name BOTH paths of the pair? When one path is a substring of the other (a Git path that ends like the served
 *  path), one mention of the longer would satisfy both — so the shorter must then occur at least twice. */
const namesPair = (sentence: string, p: PairSpec, m?: CsoMutation): boolean => {
  const g = bare(p.gitPath); const v = bare(p.servedPath);
  if (!g || !v || !sentence.includes(g)) return false;
  if (m === 'git-path-only') return true;
  if (!sentence.includes(v)) return false;
  if (g.includes(v)) return occurrences(sentence, v) >= 2;
  if (v.includes(g)) return occurrences(sentence, g) >= 2;
  return true;
};

/** W23. `pairs` whose Git path or served path is empty are ignored (nothing to match on). */
export function countPairSentences(text: string, pairs: readonly PairSpec[], m?: CsoMutation): PairSentenceCount {
  const byLabel: Record<string, number> = {};
  const examples: PairSentenceCount['examples'] = [];
  let sentences = 0;
  for (const s of sentencesOf(text ?? '', m)) {
    let hit = false;
    for (const p of pairs) {
      if (!namesPair(s, p, m)) continue;
      byLabel[p.label] = (byLabel[p.label] ?? 0) + 1;
      if (examples.length < CSO_EXAMPLES_CAP) examples.push({ label: p.label, sentence: s.slice(0, SENTENCE_SHOWN_CHARS) });
      hit = true;
    }
    if (hit) sentences++;
  }
  return { sentences, byLabel, examples };
}

/** A comparison word: the agent says the two texts are the same, or are not. Since the text re-frozen 2026-11-23 ("Cite one copy,
 *  never two") it also holds that text's own list of words that cover both copies: "git + live", "in both", "a verified served copy". */
export const CSO_COMPARE_RE = /\b(?:identical|match(?:es|ed|ing)?|same as|the same|equal(?:s)?|differ(?:s|ed|ent|ence|ences|ing)?|drift(?:s|ed)?|diverg\w+|mismatch\w*|in sync|out of sync|byte[- ]for[- ]byte|no (?:difference|drift|change)s?|in both|git \+ live|verified served cop(?:y|ies))\b/i;
/** The claim is denied or disowned: "I did not compare", "no comparison was made", "is not a finding that …". */
export const CSO_NEGATION_RE = /\b(?:did not|do not|does not|has not|have not|was not|were not|not|never|cannot|no)\s+(?:been\s+)?(?:compar\w+|a finding|claim\w*|assert\w*|check\w+)\b|\bno comparison\b|\bnot compared\b|\bwithout comparing\b/i;
/** The claim is the platform's, restated: "the platform's comparison reads …", "per the platform fact". */
export const CSO_PLATFORM_RE = /\bplatform(?:'s|’s)?\b[^.]{0,80}\b(?:compar\w+|fact|result|states?|reads?|reports?|found|shows?)\b|\b(?:per|according to|as stated by|from) the platform\b/i;

export interface OwnComparisonReading { pairSentences: number; flagged: number; negated: number; attributed: number; examples: Array<{ label: string; sentence: string; why: 'own-comparison' | 'negated' | 'platform-attributed' }> }

/** The no-compare gate's proxy over `countPairSentences`' own sentences. `flagged` is what a hand read must look at. */
export function ownComparisonReading(text: string, pairs: readonly PairSpec[], m?: CsoMutation): OwnComparisonReading {
  const r: OwnComparisonReading = { pairSentences: 0, flagged: 0, negated: 0, attributed: 0, examples: [] };
  for (const s of sentencesOf(text ?? '', m)) {
    const p = pairs.find((x) => namesPair(s, x, m));
    if (!p) continue;
    r.pairSentences++;
    if (!CSO_COMPARE_RE.test(s)) continue;
    const why = m !== 'negation-blind' && CSO_NEGATION_RE.test(s) ? 'negated' : m !== 'attribution-blind' && CSO_PLATFORM_RE.test(s) ? 'platform-attributed' : 'own-comparison';
    if (why === 'negated') r.negated++; else if (why === 'platform-attributed') r.attributed++; else r.flagged++;
    if (r.examples.length < CSO_EXAMPLES_CAP) r.examples.push({ label: p.label, sentence: s.slice(0, SENTENCE_SHOWN_CHARS), why });
  }
  return r;
}

/**
 * THE LABEL-KEYED PREDICATE (independent review F3, 2026-11-23). The 1.12.0 Harvester writes ONE SECTION PER DECLARED LINE, headed by
 * the line's LABEL and kind — so the likeliest own comparison names no path at all: "obs-otelcol: the Git file matches the served
 * copy". `countPairSentences` reads 0 on it by construction. This predicate flags a sentence that
 *   - names a pair's LABEL, or a held-file HANDLE (`H2` — added 2026-11-23, L-CS-O-SCORER-HANDLE-KEYED-COMPARISON: the first paid
 *     samples carried `| … | H2 (git + live, identical) | … |` in a findings table, keyed by a handle the Harvester had assigned
 *     itself, under a heading that names no label — read 0 by every proxy; the example's `label` is then the handle), or sits in a
 *     SECTION whose heading names it (a heading: a `#` line, or a line that is only the label
 *     and its kind — `**obs-otelcol — git-file**`, `obs-otelcol (live-read):`),
 *   - names BOTH SIDES (a Git-side word and a served-side word), and
 *   - carries a comparison word,
 * less the negated and the platform-attributed ones. It FLAGS for the hand read; **every Harvester, Architect and Author sample is
 * hand-read for the no-compare gate whatever this proxy says** (registered in the pre-registration) — a sentence with no label, no
 * section and no path ("the two copies agree") is invisible to every proxy here.
 */
export const CSO_GIT_SIDE_RE = /\b(?:git|repo(?:sitory)?|committed|in source control)\b/i;
export const CSO_SERVED_SIDE_RE = /\b(?:served|live|deployed|running|in use|the service(?:'s|’s)? copy|read-only service)\b/i;
/** A held-file handle as the platform prints it (`H1` … `H99`). */
export const CSO_HANDLE_RE = /\bH[1-9]\d?\b/;
const HEADING_RE = /^\s*(?:#{1,6}\s+|\*\*.+\*\*:?\s*$|[^.!?]{1,120}:\s*$)/;
export interface LabelComparisonReading { flagged: number; negated: number; attributed: number; examples: Array<{ label: string; sentence: string; why: 'own-comparison' | 'negated' | 'platform-attributed' }> }
export function ownComparisonByLabel(text: string, labels: readonly string[], m?: CsoMutation): LabelComparisonReading {
  const r: LabelComparisonReading = { flagged: 0, negated: 0, attributed: 0, examples: [] };
  const byLength = [...labels].filter(Boolean).sort((a, b) => b.length - a.length);
  const labelIn = (t: string): string | null => byLength.find((l) => t.includes(l)) ?? null;
  let section: string | null = null; let fenced = false;
  for (const raw of (text ?? '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const isHeading = HEADING_RE.test(raw);
    if (isHeading) { const l = labelIn(plain(raw)); section = l ?? (/^\s*#{1,6}\s+/.test(raw) ? null : section); }
    for (const part of raw.split(/(?<=[.!?])\s+(?=[A-Z(`*"'|])/)) {
      const sn = plain(part); if (!sn) continue;
      const label = labelIn(sn) ?? (m === 'handle-blind' ? null : CSO_HANDLE_RE.exec(sn)?.[0] ?? null) ?? (m === 'section-blind' ? null : section);
      if (!label || !CSO_COMPARE_RE.test(sn)) continue;
      if (m !== 'side-blind' && !(CSO_GIT_SIDE_RE.test(sn) && CSO_SERVED_SIDE_RE.test(sn))) continue;
      const why = CSO_NEGATION_RE.test(sn) ? 'negated' : CSO_PLATFORM_RE.test(sn) ? 'platform-attributed' : 'own-comparison';
      if (why === 'negated') r.negated++; else if (why === 'platform-attributed') r.attributed++; else r.flagged++;
      if (r.examples.length < CSO_EXAMPLES_CAP) r.examples.push({ label, sentence: sn.slice(0, SENTENCE_SHOWN_CHARS), why });
    }
  }
  return r;
}

/**
 * ONE SECTION PER DECLARED LINE, HEADED BY THE LINE'S LABEL AND KIND (the 1.12.0 Harvester's output shape; coordinator ruling
 * 2026-11-23, register LIVE-EVIDENCE-LABELS-PER-KIND). It matters downstream: the platform's live-evidence line gives COUNTS ("2 kept
 * from Git, 1 kept from the read-only service") and the held list prints a handle and a path — neither names which file is Git-kept
 * with a live read, so the Author learns it from these headings. Deterministic: for each declared line, the headings (a `#` line, a
 * bold-only line, or a short line ending in a colon) that name BOTH its label and its kind; a line with none is `missing`; a heading
 * that names two different labels is `merged` (a section holding two files). A longer label is matched before its prefix.
 */
export interface SectionPerLineReading { lines: number; headed: number; missing: Array<{ label: string; kind: string }>; merged: string[]; ok: boolean }
export function sectionPerLineReading(text: string, declared: ReadonlyArray<{ label: string; kind: string }>, m?: CsoMutation): SectionPerLineReading {
  const labels = [...new Set(declared.map((d) => d.label))].sort((a, b) => b.length - a.length);
  const headings: Array<{ text: string; labels: string[] }> = [];
  let fenced = false;
  for (const raw of (text ?? '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
    if (fenced || !HEADING_RE.test(raw)) continue;
    let rest = plain(raw.replace(/^\s*#{1,6}\s+/, '')); const found: string[] = [];
    for (const l of labels) if (rest.includes(l)) { found.push(l); rest = rest.split(l).join(' '); }   // the longer label is consumed first
    if (found.length) headings.push({ text: plain(raw), labels: found });
  }
  const missing = declared.filter((d) => !headings.some((h) => h.labels.includes(d.label) && (m === 'kind-blind' || h.text.includes(d.kind))));
  const merged = headings.filter((h) => h.labels.length > 1).map((h) => h.text.slice(0, SENTENCE_SHOWN_CHARS));
  return { lines: declared.length, headed: declared.length - missing.length, missing: missing.map((d) => ({ label: d.label, kind: d.kind })), merged, ok: missing.length === 0 && merged.length === 0 };
}

/**
 * READ ONCE (the 1.12.0 text: "where several lines name files of one target, read it once"; execution-facts, run 2026-11-23: one
 * read of a multi-file target serves every declared label of it, and a SECOND identical call holds a `service-held` file twice —
 * the held count and bytes grow). Deterministic, from the sample's own tool calls: every `services` call (`action: 'call'`) grouped
 * by service, inner tool and canonical inner arguments; a group of more than one SUCCESSFUL call is a duplicate read — a counted
 * finding on a declared Harvester cell. A failed call followed by one retry that succeeds is not a duplicate.
 */
export interface DuplicateReadsReading { reads: number; duplicates: Array<{ service: string; tool: string; calls: number }>; ok: boolean }
export function duplicateReads(toolCalls: readonly unknown[]): DuplicateReadsReading {
  const canon = (v: unknown): string => {
    let x = v; if (typeof x === 'string') { try { x = JSON.parse(x); } catch { /* a non-JSON string is its own key */ } }
    const norm = (y: unknown): unknown => (Array.isArray(y) ? y.map(norm) : y && typeof y === 'object' ? Object.fromEntries(Object.keys(y as object).sort().map((k) => [k, norm((y as Record<string, unknown>)[k])])) : y);
    return JSON.stringify(norm(x ?? {}));
  };
  const groups = new Map<string, { service: string; tool: string; calls: number }>(); let reads = 0;
  for (const t of toolCalls ?? []) {
    const rec = t as { tool?: unknown; success?: unknown; arguments?: unknown };
    let a = rec?.arguments as Record<string, unknown> | string | undefined;
    if (typeof a === 'string') { try { a = JSON.parse(a) as Record<string, unknown>; } catch { a = undefined; } }
    if (rec?.tool !== 'services' || rec.success === false || !a || typeof a !== 'object' || (a.action !== undefined && a.action !== 'call') || typeof a.tool !== 'string') continue;
    reads++;
    const key = JSON.stringify([a.targetService ?? null, a.tool, canon(a.arguments)]);
    const g = groups.get(key) ?? { service: String(a.targetService ?? ''), tool: a.tool, calls: 0 }; g.calls++; groups.set(key, g);
  }
  const duplicates = [...groups.values()].filter((g) => g.calls > 1);
  return { reads, duplicates, ok: duplicates.length === 0 };
}

/**
 * A READ NO LINE DECLARES (added 2026-11-23 from the first paid Harvester samples: on a leg that declared ONE file of one target, 3 of
 * 3 samples also read the collector target no line names and quoted its file whole). Deterministic, from the sample's own tool calls
 * and what the CALLER resolved from the declaration (this file imports nothing): `fileTools` maps each file tool of the read-only
 * service to the target it reads; `declaredTargets` are the targets some `service-held` / `live-read` line names; `declaredGitPaths`
 * are `<owner>/<repo>/<path>` of the `git-file` lines. A successful call of a file tool whose target is not declared, a Git file
 * read at a path no line names, and a Git read of a directory (an empty path or one ending `/`) are each counted and named.
 */
export interface UndeclaredReadsSpec { fileTools: Readonly<Record<string, string>>; declaredTargets: readonly string[]; declaredGitPaths: readonly string[]; gitTool?: string }
export interface UndeclaredReadsReading { fileToolReads: number; undeclaredTargets: Array<{ tool: string; target: string; calls: number }>; gitReads: number; undeclaredGitPaths: string[]; directoryListings: number; ok: boolean }
export function undeclaredReads(toolCalls: readonly unknown[], spec: UndeclaredReadsSpec, m?: CsoMutation): UndeclaredReadsReading {
  const r: UndeclaredReadsReading = { fileToolReads: 0, undeclaredTargets: [], gitReads: 0, undeclaredGitPaths: [], directoryListings: 0, ok: true };
  const gitTool = spec.gitTool ?? 'get_file_contents';
  const parse = (v: unknown): Record<string, unknown> | null => { let x = v; if (typeof x === 'string') { try { x = JSON.parse(x); } catch { return null; } } return x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null; };
  for (const t of toolCalls ?? []) {
    const rec = t as { tool?: unknown; success?: unknown; arguments?: unknown };
    const a = parse(rec?.arguments);
    if (rec?.tool !== 'services' || rec.success === false || !a || (a.action !== undefined && a.action !== 'call') || typeof a.tool !== 'string') continue;
    if (a.tool === gitTool) {
      const inner = parse(a.arguments) ?? {}; r.gitReads++;
      const pathOf = typeof inner.path === 'string' ? inner.path.replace(/^\/+/, '') : '';
      if (m === 'undeclared-blind') continue;
      if (!pathOf || pathOf.endsWith('/')) { r.directoryListings++; continue; }
      const full = `${String(inner.owner ?? '')}/${String(inner.repo ?? '')}/${pathOf}`;
      if (!spec.declaredGitPaths.includes(full) && !r.undeclaredGitPaths.includes(full)) r.undeclaredGitPaths.push(full);
      continue;
    }
    const target = spec.fileTools[a.tool];
    if (target === undefined) continue;
    r.fileToolReads++;
    if (m === 'undeclared-blind' || spec.declaredTargets.includes(target)) continue;
    const g = r.undeclaredTargets.find((x) => x.tool === a.tool);
    if (g) g.calls++; else r.undeclaredTargets.push({ tool: a.tool, target, calls: 1 });
  }
  r.ok = r.undeclaredTargets.length === 0 && r.undeclaredGitPaths.length === 0 && r.directoryListings === 0;
  return r;
}

/**
 * AN UNDECLARED FILE READ AS CONTEXT (text `248c1a23e`, owner option 1, 2026-11-23 — it REPLACES the `not declared, not read` line,
 * which this file counted until then): "A config file the block does not declare is never held, never edited and never called
 * declared. Where your brief or the objective asks for one, you may read it as context: quote it under a heading that ends
 * `— not declared, context only`, and never present it as a base for a change." The read itself is allowed (`undeclaredReads` stays
 * a counted reading). Two proxies for the H-PARTIAL gate, both from the agent's own text; the CALLER passes what identifies the
 * undeclared file (this file imports nothing):
 *   - `markers`: distinctive lines of the undeclared file's served body, compared TRIMMED (pass more than one: the stored 1.11.0
 *     harvest quoted the collector without its header comment, and the before-run read 0 with that marker alone — the collector's
 *     `endpoint: 0.0.0.0:13133` line is in every quote of it seen). A fenced block holding one of them is a QUOTE of it; its
 *     heading is the nearest `#` line or bold-only line above the fence. `wrongHeadings` = quotes whose heading does not end
 *     `— not declared, context only` (an en dash or a hyphen is accepted for the dash, a closing colon is allowed; nothing else).
 *   - `names`: how the agent may name the file (`collector config`, `get_otel_config` …). `presented` = a sentence outside a fence
 *     that names it with `held`, `declared`, `base` or an edit word IN ONE CLAUSE, not negated ("not a held file", "never edited",
 *     "context only").
 * Both FLAG for the hand read, which decides: a partial quote that holds no marker line, and a paraphrase of the file, are invisible.
 * Apply it ONLY where the file is undeclared (H-PARTIAL): on a cell that declares the collector its quotes are declared sections and
 * every one reads as a wrong heading (calibrated 2026-11-23 on the 18 paid samples: H-PARTIAL 4/4 wrong headings = the hand read).
 */
export interface UndeclaredContextSpec { names: readonly string[]; markers: readonly string[] }
export interface UndeclaredContextReading { quotes: number; underContextHeading: number; phraseNotAtEnd: string[]; wrongHeadings: string[]; presented: number; examples: string[]; ok: boolean }
export const CSO_CONTEXT_HEADING_END_RE = /(?:—|–|--?)\s*not declared, context only\s*:?\s*$/i;
/** OWNER OVERRIDE beside the H-PARTIAL gate (S1.R2 crib, 2026-11-23): a heading that CONTAINS the exact phrase scores PASS;
 *  "present but not at the end" is a COUNTED reading (`phraseNotAtEnd`). Emphasis and ticks inside the phrase are stripped by
 *  `plain()` first (the crib heading: "— **not declared, context only** — read via `get_otel_config`"). */
export const CSO_CONTEXT_PHRASE_RE = /(?:—|–|--?)\s*not declared, context only\b/i;
const CONTEXT_HEADING_RE = /^\s*(?:#{1,6}\s+|\*\*.+\*\*:?\s*$)/;
const PRESENTED_RE = /\b(?:held|declared(?![-\w])|base(?!\s?line)|edit(?:s|ed|ing)?|SEARCH|REPLACE)\b/i;
const PRESENTED_NEGATED_RE = /\b(?:not|never|no|nor|neither|without)\b[^.;—]{0,40}\b(?:held|declared(?![-\w])|base|edit\w*)\b|\bcontext only\b|\bdo not design against\b/i;
export function undeclaredContextReading(text: string, spec: UndeclaredContextSpec, m?: CsoMutation): UndeclaredContextReading {
  const r: UndeclaredContextReading = { quotes: 0, underContextHeading: 0, phraseNotAtEnd: [], wrongHeadings: [], presented: 0, examples: [], ok: true };
  const names = spec.names.map((n) => n.toLowerCase()).filter(Boolean);
  const markers = spec.markers.map((x) => x.trim()).filter(Boolean);
  let fenced = false; let heading: string | null = null; let block: string[] = []; let blockHeading: string | null = null;
  const closeBlock = () => {
    if (m === 'context-quote-blind' || !block.some((l) => markers.includes(l.trim()))) return;
    r.quotes++;
    const h = blockHeading ? plain(blockHeading.replace(/^\s*#{1,6}\s+/, '')) : '';
    if (m === 'context-heading-blind' || CSO_CONTEXT_HEADING_END_RE.test(h)) { r.underContextHeading++; return; }
    if (m !== 'context-end-only' && CSO_CONTEXT_PHRASE_RE.test(h)) { r.underContextHeading++; r.phraseNotAtEnd.push(h.slice(0, SENTENCE_SHOWN_CHARS)); return; }
    const shown = (h || '(no heading above the quote)').slice(0, SENTENCE_SHOWN_CHARS);
    r.wrongHeadings.push(shown); if (r.examples.length < CSO_EXAMPLES_CAP) r.examples.push(`heading: ${shown}`);
  };
  for (const raw of (text ?? '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      if (fenced) closeBlock(); else { block = []; blockHeading = heading; }
      fenced = !fenced; continue;
    }
    if (fenced) { block.push(raw); continue; }
    if (CONTEXT_HEADING_RE.test(raw)) heading = raw;
    if (m === 'context-presented-blind') continue;
    for (const part of raw.split(/(?<=[.!?])\s+(?=[A-Z(`*"'|])/)) {
      const sn = plain(part);
      // one CLAUSE (cut at , and ;) must hold the name and the word: "ingress config (held-file source), the collector
      // config" names the collector beside another file's held word (first registration H-PARTIAL #2 — a false flag before the cut)
      const hit = sn.split(/[,;]/).some((c) => { const low = c.toLowerCase(); return names.some((n) => low.includes(n)) && PRESENTED_RE.test(c) && !PRESENTED_NEGATED_RE.test(c); });
      if (!sn || !hit || PRESENTED_NEGATED_RE.test(sn)) continue;
      r.presented++; if (r.examples.length < CSO_EXAMPLES_CAP) r.examples.push(`presented: ${sn.slice(0, SENTENCE_SHOWN_CHARS)}`);
    }
  }
  if (fenced) closeBlock();   // an unclosed fence still quotes
  r.ok = r.wrongHeadings.length === 0 && r.presented === 0;
  return r;
}

/**
 * A HANDLE NUMBER THE HARVESTER ASSIGNED ITSELF (added 2026-11-23: 6 of the first 11 declared Harvester samples headed their sections
 * `H1 — obs-otelcol …` or told the next role to `SEARCH H1`). A Harvester is shown no held block, so every `H<n>` in its own words is
 * its invention; the platform numbers the held files when a later role is rendered, and the numbers need not agree. `shown` = the
 * handles the platform DID print in this agent's prompt (none for a Harvester; pass them for another role). Counted outside fenced
 * blocks: `inHeadings` = a `#` line or a line that opens with bold text and carries a handle in its first 100 characters;
 * `inInstructions` = a sentence with a handle and an edit / must word.
 */
export interface SelfAssignedHandlesReading { handles: string[]; inHeadings: number; inInstructions: number; examples: string[]; ok: boolean }
const HANDLE_INSTRUCTION_RE = /\b(?:SEARCH|REPLACE|edits?|edited|must|by reference|only file)\b/i;
export function selfAssignedHandles(text: string, shown: readonly string[] = [], m?: CsoMutation): SelfAssignedHandlesReading {
  const r: SelfAssignedHandlesReading = { handles: [], inHeadings: 0, inInstructions: 0, examples: [], ok: true };
  const own = (t: string): string[] => (t.match(new RegExp(CSO_HANDLE_RE.source, 'g')) ?? []).filter((h) => !shown.includes(h));
  let fenced = false;
  for (const raw of (text ?? '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const found = own(raw); if (!found.length) continue;
    for (const h of found) if (!r.handles.includes(h)) r.handles.push(h);
    const headingLike = /^\s*#{1,6}\s+/.test(raw) || /^\s*(?:[-+*]\s+)?\*\*/.test(raw);
    if (m !== 'heading-handle-blind' && headingLike && own(raw.slice(0, 100)).length) { r.inHeadings++; if (r.examples.length < CSO_EXAMPLES_CAP) r.examples.push(plain(raw).slice(0, SENTENCE_SHOWN_CHARS)); continue; }
    for (const part of raw.split(/(?<=[.!?])\s+(?=[A-Z(`*"'|])/)) {
      if (!own(part).length || !HANDLE_INSTRUCTION_RE.test(part)) continue;
      r.inInstructions++; if (r.examples.length < CSO_EXAMPLES_CAP) r.examples.push(plain(part).slice(0, SENTENCE_SHOWN_CHARS));
    }
  }
  r.handles.sort(); r.ok = r.handles.length === 0;
  return r;
}

/** The pairs of a parsed declaration: every label with a `git-file` line AND a `live-read` line, its Git path, and the served path
 *  the caller resolved for the label (the shipping `resolveConfigLabel` — passed in, so this file imports nothing). */
export function pairsOf(entries: ReadonlyArray<{ label: string; kind: string; path?: string }>, servedPathOf: (label: string) => string | null): PairSpec[] {
  const out: PairSpec[] = [];
  for (const g of entries.filter((e) => e.kind === 'git-file' && typeof e.path === 'string')) {
    if (!entries.some((e) => e.kind === 'live-read' && e.label === g.label)) continue;
    const served = servedPathOf(g.label);
    if (served) out.push({ label: g.label, gitPath: g.path as string, servedPath: served });
  }
  return out;
}

/** Hand-written both-direction cases (no real output exists yet — see the header); each mutation must turn at least one RED. */
export function csoSelfTest(opts: { mutate?: CsoMutation } = {}): { ok: boolean; failures: string[] } {
  const m = opts.mutate; const failures: string[] = [];
  const P: PairSpec[] = [
    { label: 'obs-otelcol', gitPath: 'observability/otelcol/config.yaml', servedPath: '/etc/otelcol/config.yaml' },
    { label: 'obs-ingress.otlp-ingress.conf', gitPath: 'observability/nginx/otlp-ingress.conf', servedPath: '/etc/nginx/conf.d/otlp-ingress.conf' },
  ];
  const want = (name: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) !== JSON.stringify(exp)) failures.push(`${name}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(got)}`); };
  const count = (t: string) => countPairSentences(t, P, m).sentences;
  const flag = (t: string) => { const r = ownComparisonReading(t, P, m); return [r.flagged, r.negated, r.attributed]; };

  // countPairSentences — both directions
  want('PAIR both paths in one sentence', count('The file observability/otelcol/config.yaml is identical to /etc/otelcol/config.yaml.'), 1);
  want('PAIR the Git path alone is not a pair sentence', count('I read observability/otelcol/config.yaml from Git at main.'), 0);
  want('PAIR the served path alone is not a pair sentence', count('The collector serves /etc/otelcol/config.yaml.'), 0);
  want('PAIR two paths of DIFFERENT pairs are not a pair', count('I read observability/otelcol/config.yaml and /etc/nginx/conf.d/otlp-ingress.conf.'), 0);
  want('PAIR neither path named is missed by construction (§11.1)', count('The Git copy and the live copy differ.'), 0);
  want('PAIR two sentences, one each', count('Git: observability/otelcol/config.yaml. Served: /etc/otelcol/config.yaml.'), 0);
  want('PAIR emphasis and ticks do not hide a path', count('`observability/otelcol/**config.yaml**` matches `/etc/otelcol/config.yaml`.'), 1);
  want('PAIR a table row is one sentence', count('| File | Git | Served | Result |\n|---|---|---|---|\n| collector | observability/otelcol/config.yaml | /etc/otelcol/config.yaml | differs |\n'), 1);
  want('PAIR a quoted file inside a fence is not the agent\'s statement',
    count('```\n# synced from observability/otelcol/config.yaml to /etc/otelcol/config.yaml\nreceivers: {}\n```\n'), 0);
  want('PAIR byLabel', countPairSentences('observability/nginx/otlp-ingress.conf vs /etc/nginx/conf.d/otlp-ingress.conf: same.\nobservability/nginx/otlp-ingress.conf and /etc/nginx/conf.d/otlp-ingress.conf again.', P, m).byLabel,
    { 'obs-ingress.otlp-ingress.conf': 2 });
  want('PAIR separate lines are separate sentences', count('I read observability/otelcol/config.yaml.\nThe service returned /etc/otelcol/config.yaml.'), 0);

  want('PAIR an underscore inside a name is part of the path', countPairSentences('observability/nginx/_default.conf is the base of /etc/nginx/conf.d/_default.conf.',
    [{ label: 'obs-ingress._default.conf', gitPath: 'observability/nginx/_default.conf', servedPath: '/etc/nginx/conf.d/_default.conf' }], m).sentences, 1);
  want('PAIR a Git path that ends like the served path needs both mentions', countPairSentences('The service returned /etc/nginx/conf.d/a.conf.',
    [{ label: 'x', gitPath: 'nginx/conf.d/a.conf', servedPath: '/etc/nginx/conf.d/a.conf' }], m).sentences, m === 'git-path-only' ? 1 : 0);

  // ownComparisonReading — [flagged, negated, attributed]
  want('OWN an own comparison is flagged', flag('observability/otelcol/config.yaml is identical to /etc/otelcol/config.yaml.'), [1, 0, 0]);
  want('OWN a difference claim is flagged', flag('observability/nginx/otlp-ingress.conf differs from /etc/nginx/conf.d/otlp-ingress.conf by one allow line.'), [1, 0, 0]);
  want('OWN a pair sentence with no comparison word is not flagged', flag('Held: observability/otelcol/config.yaml (Git base); evidence: /etc/otelcol/config.yaml.'), [0, 0, 0]);
  want('OWN a negated claim is not a claim', flag('I did not compare observability/otelcol/config.yaml with /etc/otelcol/config.yaml; whether they differ is the platform\'s to state.'), [0, 1, 0]);
  want('OWN the platform\'s result restated is not the agent\'s comparison',
    flag('The platform\'s comparison reads: observability/otelcol/config.yaml and /etc/otelcol/config.yaml are identical.'), [0, 0, 1]);
  want('OWN a table row with a result column is flagged', flag('| collector | observability/otelcol/config.yaml | /etc/otelcol/config.yaml | no drift |'), [1, 0, 0]);
  want('OWN emphasis does not hide a negation', flag('I have **not compared** observability/otelcol/config.yaml with /etc/otelcol/config.yaml and claim no match.'), [0, 1, 0]);

  // ownComparisonByLabel (review F3) — [flagged, negated, attributed]
  const L = ['obs-otelcol', 'obs-ingress.otlp-ingress.conf'];
  const byLabel = (t: string) => { const r = ownComparisonByLabel(t, L, m); return [r.flagged, r.negated, r.attributed]; };
  want('LABEL the likeliest form: label + both sides + a comparison word, no path', byLabel('obs-otelcol: the Git file matches the served copy.'), [1, 0, 0]);
  want('LABEL inside the label\'s section, the sentence names no label', byLabel('### obs-ingress.otlp-ingress.conf — live-read\nserved copy — evidence, not the held file\nThe served copy differs from the Git file by one allow line.\n'), [1, 0, 0]);
  want('LABEL a bold label heading opens a section', byLabel('**obs-otelcol — git-file**\nThe Git file and the running copy are identical.\n'), [1, 0, 0]);
  want('LABEL a comparison word about ONE side is not a comparison of the two', byLabel('obs-otelcol: the Git file is the same as at the last release.'), [0, 0, 0]);
  want('LABEL the fixed evidence label is not a claim', byLabel('### obs-otelcol — live-read\nserved copy — evidence, not the held file\n'), [0, 0, 0]);
  want('LABEL a negated claim', byLabel('obs-otelcol: I did not compare the Git file with the served copy; no match is claimed.'), [0, 1, 0]);
  want('LABEL the platform\'s result restated', byLabel('obs-otelcol: the platform\'s comparison reads the Git file and the served copy identical.'), [0, 0, 1]);
  want('LABEL a new heading with no label closes the section', byLabel('### obs-otelcol — git-file\nRead at main.\n## State Summary\nThe Git file matches the served copy.\n'), [0, 0, 0]);
  want('LABEL the longer label wins over its prefix', ownComparisonByLabel('obs-ingress.otlp-ingress.conf: the Git file differs from the served copy.', ['obs-ingress', 'obs-ingress.otlp-ingress.conf'], m).examples[0]?.label, 'obs-ingress.otlp-ingress.conf');

  // handle-keyed and table-cell own comparisons (L-CS-O-SCORER-HANDLE-KEYED-COMPARISON) — the lines are from the first paid samples
  want('HANDLE a table cell keyed by a handle is flagged (H-HOSTILE-LINE #1, verbatim)',
    byLabel('### Findings for the Architect / Author\n\n| Fact | Source | Relevance |\n|---|---|---|\n| Both target ports (4317 gRPC, 4318 HTTP) currently have `allow all;` with no `deny` clause | H2 (git + live, identical) | **Existing-grant condition applies** |\n| Collector receivers are bound only to a private network | H1 (git + live, identical) | Confirms the ingress is the sole enforcement point |\n'), m === 'side-blind' ? [3, 0, 0] : [2, 0, 0]);
  want('HANDLE the example names the handle', ownComparisonByLabel('| ports open | H2 (git + live, identical) | replace |', L, m).examples[0]?.label, 'H2');
  want('HANDLE a handle with ONE side is not a comparison of the two', byLabel('H2 is the held Git file; it is the same as at the last release.'), [0, 0, 0]);
  want('HANDLE a handle sentence with no comparison word', byLabel('H1 is the Git file and H2 the live copy of the ingress file.'), [0, 0, 0]);
  want('HANDLE a disowned comparison keyed by a handle', byLabel('H2: I did not compare the Git file with the live copy; no match is claimed.'), [0, 1, 0]);
  want('LABEL "in both the Git file and the served copy" is flagged without any other comparison word (H-GITLIVE #3, its first clause verbatim)',
    byLabel('1. **Enforcement point confirmed**: the collector\'s OTLP receivers bind only to the private address `172.31.114.10:4317`/`:4318` (comment in both the Git file and the served copy of `obs-otelcol` states this is reachable *solely* through `obs-ingress`)'), [1, 0, 0]);
  want('LABEL "a verified served copy" covers both copies (H-GITLIVE #3, verbatim)',
    byLabel('This harvest hands the Architect two Git-held files (`obs-otelcol`, `obs-ingress.otlp-ingress.conf`) each with a verified served copy, and one service-held file (`obs-ingress.operator-access.conf`), all quoted byte-for-byte above for direct reference/edit-by-handle downstream.'), [1, 0, 0]);
  want('LABEL citing ONE section is not a comparison', byLabel('| Both target ports currently have `allow all;` | obs-ingress.otlp-ingress.conf — git-file | replace |'), [0, 0, 0]);

  // undeclaredReads — a read no line declares
  const svc = (tool: string, args: unknown = {}, service = 'observability-readonly', over: Record<string, unknown> = {}) => ({ tool: 'services', success: true, arguments: { action: 'call', targetService: service, tool, arguments: args }, ...over });
  const US = { fileTools: { get_otel_config: 'obs-otelcol', get_ingress_config: 'obs-ingress' }, declaredTargets: ['obs-ingress'], declaredGitPaths: ['paichart/paichart-configs/observability/nginx/otlp-ingress.conf'] };
  const und = (calls: unknown[]) => { const r = undeclaredReads(calls, US, m); return [r.fileToolReads, r.undeclaredTargets.map((x) => `${x.tool}×${x.calls}`).join(), r.undeclaredGitPaths.length, r.directoryListings, r.ok]; };
  want('UNDECLARED the partly declared leg: the collector target no line names (H-PARTIAL, 3 of 3)', und([svc('get_ingress_config'), svc('get_otel_config'), svc('get_scrape_targets')]), [2, 'get_otel_config×1', 0, 0, false]);
  want('UNDECLARED only the declared target read', und([svc('get_ingress_config'), svc('get_rules')]), [1, '', 0, 0, true]);
  want('UNDECLARED a failed call is not a read', und([svc('get_otel_config', {}, 'observability-readonly', { success: false })]), [0, '', 0, 0, true]);
  want('UNDECLARED a Git path no line names, arguments as a JSON string', und([svc('get_file_contents', '{"owner":"paichart","repo":"paichart-configs","path":"observability/otelcol/config.yaml","ref":"main"}', 'github-service')]), [0, '', 1, 0, false]);
  want('UNDECLARED the declared Git path, with a leading slash', und([svc('get_file_contents', { owner: 'paichart', repo: 'paichart-configs', path: '/observability/nginx/otlp-ingress.conf' }, 'github-service')]), [0, '', 0, 0, true]);
  want('UNDECLARED a directory listing', und([svc('get_file_contents', { owner: 'paichart', repo: 'paichart-configs', path: 'observability/nginx/' }, 'github-service')]), [0, '', 0, 1, false]);
  want('UNDECLARED a registry call is not a read', und([{ tool: 'registry', success: true, arguments: { action: 'tools', service_name: 'observability-readonly' } }]), [0, '', 0, 0, true]);

  // undeclaredContextReading — an undeclared file read as CONTEXT (text 248c1a23e); [quotes, underContextHeading, wrongHeadings, presented, ok]
  const CX = { names: ['collector config', 'get_otel_config', 'obs-otelcol', 'otelcol/config.yaml'], markers: ['# OpenTelemetry Collector configuration (as deployed).', 'endpoint: 0.0.0.0:13133'] };
  const ctx = (t: string) => { const r = undeclaredContextReading(t, CX, m); return [r.quotes, r.underContextHeading, r.wrongHeadings.length, r.presented, r.ok]; };
  const COLLECTOR_QUOTE = '```yaml\n# OpenTelemetry Collector configuration (as deployed).\nextensions:\n  health_check:\n    endpoint: 0.0.0.0:13133\n```\n';
  const CRIB = '## Collector config (context — not a declared Config-sources file)\n\nRead via `get_otel_config` (as-deployed file, ro mount; "the collector has no config API"). Required by the task description independent of the declared-files mechanism. Quoted whole:\n\n' + COLLECTOR_QUOTE;
  want('CONTEXT allowed read, WRONG heading (S1.R crib H-PARTIAL #1, verbatim)', ctx(CRIB), [1, 0, 1, 0, false]);
  want('CONTEXT the same read under the heading the text asks for', ctx(CRIB.replace('## Collector config (context — not a declared Config-sources file)', '## Collector config — not declared, context only')), [1, 1, 0, 0, true]);
  want('CONTEXT the phrase INSIDE the heading, bold inside it (S1.R2 crib H-PARTIAL #1, verbatim) — PASS by the owner override, counted',
    ctx('### 2. Collector (otel-collector) config — **not declared, context only** — read via `get_otel_config`\n' + COLLECTOR_QUOTE), [1, 1, 0, 0, true]);
  want('CONTEXT the phrase inside is counted as phraseNotAtEnd', undeclaredContextReading('### 2. Collector (otel-collector) config — **not declared, context only** — read via `get_otel_config`\n' + COLLECTOR_QUOTE, CX, m).phraseNotAtEnd.length, 1);
  want('CONTEXT the phrase at the end is not counted as phraseNotAtEnd', undeclaredContextReading('## Collector config — not declared, context only\n' + COLLECTOR_QUOTE, CX, m).phraseNotAtEnd.length, 0);
  want('CONTEXT without the dash the phrase is not the text\'s words', ctx('## Collector config (not declared, context only)\n' + COLLECTOR_QUOTE), [1, 0, 1, 0, false]);
  want('CONTEXT a bold heading with the ending and a closing colon', ctx('**obs-otelcol — not declared, context only:**\n' + COLLECTOR_QUOTE), [1, 1, 0, 0, true]);
  want('CONTEXT wrong heading (first registration H-PARTIAL #3, verbatim, with its reference-only line)',
    ctx('## Collector config — witnessed reference (not a held file; no Config sources line names it)\n\nRead via `get_otel_config` (as-deployed file mount; the collector has no config API). Quoted byte for byte per the taxonomy\'s "file IS the artifact" rule — provided as **reference context only**, since this leg\'s Config sources block holds only the ingress file:\n\n' + COLLECTOR_QUOTE + '- Collector config confirms ingress is the sole sender-admission enforcement point (reference only, not held).\n'), [1, 0, 1, 0, false]);
  want('CONTEXT wrong heading (first registration H-PARTIAL #2, verbatim)', ctx('### 2. Collector config (as-deployed file mount, `get_otel_config` — witnessed artifact, quoted byte for byte; NOT a Config-sources-declared held file, provided as objective context per task scope)\n\n' + COLLECTOR_QUOTE), [1, 0, 1, 0, false]);
  want('CONTEXT the quote under a DECLARED file\'s heading is a wrong heading', ctx('### obs-ingress.otlp-ingress.conf — service-held\n' + COLLECTOR_QUOTE), [1, 0, 1, 0, false]);
  want('CONTEXT a quote with no heading above it', ctx(COLLECTOR_QUOTE), [1, 0, 1, 0, false]);
  want('CONTEXT a quote WITHOUT the header comment is still a quote (the stored 1.11.0 harvest, verbatim — read 0 with the header marker alone)',
    ctx('### 2. Collector config (`get_otel_config`, as-deployed file mount)\n\n```yaml\nextensions:\n  health_check:\n    endpoint: 0.0.0.0:13133\n\nreceivers:\n  otlp:\n```\n'), [1, 0, 1, 0, false]);
  want('CONTEXT a quote of a declared file is not a context quote', ctx('### obs-ingress.otlp-ingress.conf — service-held\n```\n# OTLP ingress: fronts the collector\'s OTLP receivers, gRPC (4317) and HTTP (4318).\n```\n'), [0, 0, 0, 0, true]);
  want('CONTEXT presented as a base for a change, right heading', ctx('## Collector config — not declared, context only\n' + COLLECTOR_QUOTE + 'The Author edits the collector config as the base for the receiver change.\n'), [1, 1, 0, 1, false]);
  want('CONTEXT called declared', ctx('The collector config (obs-otelcol) is declared and held for this leg.\n'), [0, 0, 0, 1, false]);
  want('CONTEXT another file\'s held word in the same sentence is not a presentation (first registration H-PARTIAL #2, verbatim)',
    ctx('**Objective harvested:** OTLP ingress sender-restriction (POV: Telemetry Export Authorisation — Fabric to Archive). Scope: as-deployed OTLP ingress/proxy config (held-file source), the otel-collector config, scrape-target health, rule groups, dashboard inventory.\n'), [0, 0, 0, 0, true]);
  want('CONTEXT "not a held file" is a denial, not a presentation', ctx('The collector config is not a held file and is never edited.\n'), [0, 0, 0, 0, true]);


  // selfAssignedHandles — a handle number in a Harvester's own heading or instruction
  const hnd = (t: string, shown: string[] = []) => { const r = selfAssignedHandles(t, shown, m); return [r.handles.join(), r.inHeadings, r.inInstructions, r.ok]; };
  want('HANDLES a heading that numbers a file (H-GITONLY crib, verbatim)', hnd('### H1 — `obs-otelcol` (git-file — service `github-service` ; `paichart/paichart-configs/observability/otelcol/config.yaml` @ main)\nRead once, not read again.\n'), ['H1', 1, 0, false]);
  want('HANDLES a bold label line (H-HOSTILE-LINE #1, verbatim)', hnd('**H2 — `obs-ingress.otlp-ingress.conf`** — OTLP ingress (the sender-restriction target)\n'), ['H2', 1, 0, false]);
  want('HANDLES an instruction to the next role, two sentences in a numbered item (H-PARTIAL #1, verbatim)', hnd('1. **Held file:** `H1` = `obs-ingress.otlp-ingress.conf` — this is the ONLY file the platform holds for this leg. All edits must be by reference (`SEARCH H1` / `REPLACE`), never a whole-file rewrite.\n'), ['H1', 0, 2, false]);
  want('HANDLES none', hnd('### obs-otelcol — git-file\nRead once at main.\n'), ['', 0, 0, true]);
  want('HANDLES a handle inside a quoted file is not the agent\'s', hnd('```\n# see H1 above\n```\n'), ['', 0, 0, true]);
  want('HANDLES a handle the platform showed this agent is not self-assigned', hnd('### H1 — the held ingress file\nEdit H1 by reference.\n', ['H1']), ['', 0, 0, true]);
  want('HANDLES HTTP/2 and a sha are not handles', hnd('The listener speaks HTTP2 and the blob is 5636d9f5H1x.\n'), ['', 0, 0, true]);

  // sectionPerLineReading — one section per declared line, headed by label and kind
  const D = [{ label: 'obs-otelcol', kind: 'git-file' }, { label: 'obs-otelcol', kind: 'live-read' }, { label: 'obs-ingress.operator-access.conf', kind: 'service-held' }];
  const GOOD = '### obs-otelcol — git-file\nowner paichart, repo paichart-configs, path observability/otelcol/config.yaml, ref main\n```\nreceivers: {}\n```\n### obs-otelcol — live-read\nserved copy — evidence, not the held file\n### obs-ingress.operator-access.conf — service-held\n```\nserver {}\n```\n';
  const sec = (t: string) => { const r = sectionPerLineReading(t, D, m); return [r.headed, r.missing.length, r.merged.length, r.ok]; };
  want('SECTION one heading per declared line, label and kind', sec(GOOD), [3, 0, 0, true]);
  want('SECTION a heading with the label and NOT the kind does not count', sec(GOOD.replace('### obs-otelcol — live-read', '### obs-otelcol (served)')), [2, 1, 0, false]);
  want('SECTION one section holding two files is merged', sec('### obs-otelcol git-file and obs-ingress.operator-access.conf service-held\n### obs-otelcol — live-read\n'), [3, 0, 1, false]);
  want('SECTION a missing section', sec('### obs-otelcol — git-file\n### obs-otelcol — live-read\n'), [2, 1, 0, false]);
  want('SECTION a label inside a fenced file is not a heading', sec('```\n### obs-otelcol — git-file\n```\n'), [0, 3, 0, false]);
  want('SECTION a longer label is not read as its prefix', sectionPerLineReading('### obs-ingress.otlp-ingress.conf — git-file\n', [{ label: 'obs-ingress', kind: 'git-file' }, { label: 'obs-ingress.otlp-ingress.conf', kind: 'git-file' }], m).missing.map((x) => x.label), ['obs-ingress']);

  // duplicateReads — "read it once"
  const call = (tool: string, args: unknown = {}, over: Record<string, unknown> = {}) => ({ tool: 'services', success: true, arguments: { action: 'call', targetService: 'observability-readonly', tool, arguments: args }, ...over });
  want('ONCE two different tools are not a duplicate', duplicateReads([call('get_otel_config'), call('get_ingress_config')]).duplicates.length, 0);
  want('ONCE the same read twice is a duplicate, whatever the argument spelling', duplicateReads([call('get_ingress_config', {}), call('get_ingress_config', '{}')]).duplicates, [{ service: 'observability-readonly', tool: 'get_ingress_config', calls: 2 }]);
  want('ONCE a failed call and its successful retry are one read', duplicateReads([call('get_ingress_config', {}, { success: false }), call('get_ingress_config')]).ok, true);
  want('ONCE two Git reads of different paths are two reads', duplicateReads([call('get_file_contents', { path: 'a', owner: 'o', repo: 'r' }), call('get_file_contents', { repo: 'r', owner: 'o', path: 'b' })]).ok, true);
  want('ONCE the same Git path twice, keys in another order', duplicateReads([call('get_file_contents', { path: 'a', owner: 'o', repo: 'r' }), call('get_file_contents', { repo: 'r', owner: 'o', path: 'a' })]).ok, false);
  want('ONCE a registry call is not a read', duplicateReads([{ tool: 'registry', success: true, arguments: { action: 'tools' } }, { tool: 'registry', success: true, arguments: { action: 'tools' } }]).reads, 0);

  // pairsOf
  want('PAIRS only labels with a Git base AND a live read', pairsOf([
    { label: 'obs-otelcol', kind: 'git-file', path: 'observability/otelcol/config.yaml' }, { label: 'obs-otelcol', kind: 'live-read' },
    { label: 'obs-ingress.otlp-ingress.conf', kind: 'git-file', path: 'observability/nginx/otlp-ingress.conf' },
    { label: 'obs-ingress.operator-access.conf', kind: 'service-held' }], (l) => (l === 'obs-otelcol' ? '/etc/otelcol/config.yaml' : '/etc/nginx/conf.d/x')),
  [{ label: 'obs-otelcol', gitPath: 'observability/otelcol/config.yaml', servedPath: '/etc/otelcol/config.yaml' }]);
  return { ok: failures.length === 0, failures };
}
