/**
 * Leg replay lab — the L-K2 scorer (held-k8s step 3, the join; LAB-PREREG-L-K2.md). $0: reads saved samples, never calls a model,
 * never re-runs the shipping edit step (the stamped state, refusals and candidate bytes are the SHIPPING step's).
 *
 * ADDITIVE over score-edits.ts (G1's `scoreG1Run`, unchanged, so G1's recorded scores stay reproducible). What k8s adds:
 *
 *   SG-DOC (k8s, SYNTHESIS v3 §6.2 verbatim): a fenced block OUTSIDE the edit grammar and outside the rollback section that is a
 *     COMPLETE object of ONE document of a held file — it carries that document's `kind:` line and its `metadata.name` line, covers
 *     ≥ 0.90 of the document's non-blank lines in order, and ADDS a line found in neither the held base nor its view. A block that
 *     covers the WHOLE file is SG-WIN (G1), not SG-DOC. Each hit is hand-read and classed RETYPE (a desired-state object written out
 *     instead of edited) or EVIDENCE (a live object quoted in the repo's own layout) — the class is the hand read's, never the proxy's.
 *   SG-DIFF: a unified-diff block whose `+++` path names a held file, on a held arm (the held file changed outside the edit grammar;
 *     the platform reads such a package `no-edits` ⇒ out of scope ⇒ not forced).
 *   BASE DIFF CANDIDATE: a `base` sample with no whole-file block is scored on the candidate its unified diffs produce, applied in
 *     order by a STRICT applier (each hunk's `-a,b +c,d` counts must equal its body — `git apply` rejects a miscounted hunk, the
 *     K8S-HUNK-COUNT class; context must match at the stated line or at ONE other offset). A diff that does not apply is not correct.
 *   G-AMBIG (independent of the applier): every SEARCH of an APPLIED sample occurs exactly once in the held base (or exactly N times
 *     under `count=N`). The applier refuses a non-unique SEARCH; this re-derives it from the bytes so a regression in the applier
 *     would show here.
 *   ROLLBACK FORM: `restore H<n>` present for every edited handle; `git revert` / `prior revision` mentioned inside the rollback
 *     section of a held arm (measured: the window briefs still say "prior revision / git revert").
 *   NON-ADMIN: grammar blocks or restores naming an UNHELD empty-path handle (state `unheld`, path '') — G-NONADMIN wants 0; the
 *     carrier reading uses the shipping `heldPackageOutOfScope` (out of scope ⇒ the carrier does not force).
 *   reflectionPassSpentBy (AE N-5): the shipping precedence (`execution-artifacts.reflectionPassSpentBy`) over the sample's saved
 *     formCheck / edit correction / diagnostic retry; plus "edit correction starved": a correctable refusal whose correction was not
 *     attempted because the pass was already spent.
 *   DRIFT-CAUSE (Harvester cells): proxies `namesCause` and `citesWitness` (the last-applied-configuration annotation).
 *
 * Refinements 2026-10-19 (LAB-RESULT-L-K2 "carried forward"; each re-scored on the L-K2 runs and now equal to its hand read):
 *   DRIFT-CAUSE negation (NOWIT 0/5 → 4/5; WIT 5/5 kept, s04's cause vocabulary added) · ARCH-QUOTE k8s document reading (a new
 *   object is not a quote; 15/20 → 19/20) · collateral rendered-count citation (R-K-COLLATERAL 4/5 → 5/5). The two gate readings
 *   print BESIDE the registered ones; mutations negation-blind / newdoc-quote / count-blind turn the self-test red.
 *
 * Every count names its samples. Proxies flag; the hand read decides (Protocol 16 rules 5–6; LL-22).
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseHeldEdits, grammarLineNumbers, textLines } from '../../lib/agents/harness/held-bytes/edits';
import { parseFencedBlocks } from '../../lib/agents/harness/package-form-check';
import { inOrderCoverage } from '../../lib/agents/harness/held-bytes/whole-file';
import { heldPackageOutOfScope } from '../../lib/agents/harness/held-bytes/scope';
import { EDIT_REFUSAL_CLASS } from '../../lib/agents/harness/held-bytes/apply';
import { reflectionPassSpentBy } from '../../lib/services/execution-artifacts';
import { lineDelta, scoreChange, heldFilesOf, canaryScan, scoreG1Run, type NodeScoring } from './score-edits';

export type K2Mutation = 'sgdoc-blind' | 'diff-lenient' | 'cause-blind' | 'ambig-blind' | 'negation-blind' | 'newdoc-quote' | 'count-blind';
const nonBlank = (t: string) => t.split('\n').filter((l) => l.trim() !== '');

// ───────────────────────────── k8s documents ─────────────────────────────

export interface K8sDoc { index: number; kind: string | null; name: string | null; text: string }
export function k8sDocs(file: string): K8sDoc[] {
  const docs: K8sDoc[] = []; let cur: string[] = [];
  const flush = () => { const text = cur.join('\n'); const kind = /^kind:[ \t]*(\S+)/m.exec(text)?.[1] ?? null;
    const name = /^metadata:[ \t]*\n(?:[ \t]+.*\n)*?[ \t]+name:[ \t]*(\S+)/m.exec(text + '\n')?.[1] ?? null;
    docs.push({ index: docs.length, kind, name, text }); cur = []; };
  for (const l of file.split('\n')) { if (/^---[ \t]*$/.test(l)) flush(); else cur.push(l); }
  flush();
  return docs.filter((d) => d.kind && d.name);
}

export interface SgDocHit { handle: string; doc: string; coverage: number; addedLines: number; blockOpenLine: number }
/** SG-DOC over one package. `bases`/`views` by handle. Blocks inside the grammar, inside the rollback section, or SG-WIN (≥ 0.90 of
 *  the WHOLE file) are excluded. */
export function sgDocHits(author: string, bases: Record<string, string>, views: Record<string, string>, mutate?: K2Mutation, threshold = 0.9): SgDocHit[] {
  if (mutate === 'sgdoc-blind') return [];
  const p = parseHeldEdits(author); const g = grammarLineNumbers(p); const lines = textLines(author);
  const rb = p.sections.find((s) => s.kind === 'rollback');
  const hits: SgDocHit[] = [];
  for (const b of parseFencedBlocks(author)) {
    const idx: number[] = []; for (let n = b.openLine + 1; n < b.closeLine; n++) idx.push(n);
    if (idx.some((n) => g.has(n))) continue;
    if (rb && b.openLine > rb.headingLine && b.openLine <= rb.endLine) continue;
    const body = idx.map((n) => lines[n - 1]).join('\n');
    for (const [h, base] of Object.entries(bases)) {
      if (inOrderCoverage(base, body) >= 0.9) continue; // SG-WIN, counted by G1
      const known = new Set([...base.split('\n'), ...(views[h] ?? '').split('\n')]);
      for (const d of k8sDocs(base)) {
        if (!new RegExp(`^\\s*kind:\\s*${d.kind}\\s*$`, 'm').test(body) || !new RegExp(`^\\s*name:\\s*${d.name!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(body)) continue;
        const cov = inOrderCoverage(d.text, body);
        if (cov < threshold) continue;
        const added = lineDelta(d.text, body.endsWith('\n') ? body : `${body}\n`).added.filter((l) => l.trim() !== '' && !known.has(l));
        if (added.length) hits.push({ handle: h, doc: `${d.kind}/${d.name}`, coverage: Math.round(cov * 100) / 100, addedLines: added.length, blockOpenLine: b.openLine });
      }
    }
  }
  return hits;
}

/** Unified-diff blocks whose `+++` path names a held file (path compared without a leading `a/`, `b/` or `/`). */
export function sgDiffBlocks(author: string, heldPaths: string[]): number {
  const norm = (p: string) => p.replace(/^[ab]\//, '').replace(/^\/+/, '');
  const want = new Set(heldPaths.map(norm));
  return (author.match(/^\+\+\+ (\S+)/gm) ?? []).map((l) => norm(l.slice(4))).filter((p) => want.has(p)).length;
}

// ───────────────────────────── strict unified-diff applier (base arm) ─────────────────────────────

export interface DiffApply { ok: boolean; candidate: string | null; reason: string | null; hunks: number }
/** Apply every unified-diff hunk for `heldPath` in document order to `base`. STRICT: header counts must equal the body; context must
 *  match at the stated line, else at exactly one other offset. `diff-lenient` (self-test mutation) skips the count check. */
export function applyUnifiedDiffs(author: string, base: string, heldPath: string, mutate?: K2Mutation): DiffApply {
  const norm = (p: string) => p.replace(/^[ab]\//, '').replace(/^\/+/, '');
  const lines = author.split('\n');
  let cur = base.split('\n'); let hunks = 0; let inFile = false;
  for (let i = 0; i < lines.length; i++) {
    const pp = /^\+\+\+ (\S+)/.exec(lines[i]);
    if (pp) { inFile = norm(pp[1]) === norm(heldPath); continue; }
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]);
    if (!h || !inFile) continue;
    const [oldStart, oldN, , newN] = [Number(h[1]), h[2] === undefined ? 1 : Number(h[2]), Number(h[3]), h[4] === undefined ? 1 : Number(h[4])];
    const oldL: string[] = []; const newL: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (/^(@@ |--- |\+\+\+ |```|~~~)/.test(l)) break;
      if (l.startsWith('\\')) continue;
      if (l.startsWith('+')) newL.push(l.slice(1));
      else if (l.startsWith('-')) oldL.push(l.slice(1));
      else if (l.startsWith(' ') || l === '') { oldL.push(l.slice(1)); newL.push(l.slice(1)); }
      else break;
    }
    // A trailing blank line before the fence is the block's end, not a context line.
    while (oldL.length > oldN && newL.length > newN && oldL[oldL.length - 1] === '' && newL[newL.length - 1] === '') { oldL.pop(); newL.pop(); }
    if (mutate !== 'diff-lenient' && (oldL.length !== oldN || newL.length !== newN)) return { ok: false, candidate: null, reason: `hunk-count @@ -${oldStart},${oldN} +…,${newN} @@ (body ${oldL.length}/${newL.length})`, hunks };
    const at = (k: number) => oldL.every((x, q) => cur[k + q] === x);
    let pos = oldStart - 1;
    if (!at(pos)) { const others: number[] = []; for (let k = 0; k + oldL.length <= cur.length; k++) if (at(k)) others.push(k); if (others.length !== 1) return { ok: false, candidate: null, reason: `context-mismatch at ${oldStart} (${others.length} other matches)`, hunks }; pos = others[0]; }
    cur = [...cur.slice(0, pos), ...newL, ...cur.slice(pos + oldL.length)];
    hunks++; i = j - 1;
  }
  return hunks ? { ok: true, candidate: cur.join('\n'), reason: null, hunks } : { ok: false, candidate: null, reason: 'no-hunks', hunks: 0 };
}

// ───────────────────────────── G-AMBIG (independent) ─────────────────────────────

export function ambiguityViolations(author: string, bases: Record<string, string>, mutate?: K2Mutation): Array<{ block: number; handle: string; occurrences: number; count: number | null }> {
  if (mutate === 'ambig-blind') return [];
  const p = parseHeldEdits(author); const out: Array<{ block: number; handle: string; occurrences: number; count: number | null }> = [];
  for (const b of p.blocks) {
    if (b.section !== 'edits' || b.op !== 'replace' || !bases[b.handle]) continue;
    const needle = b.search.join('\n'); if (!needle) continue;
    const occ = bases[b.handle].split(needle).length - 1;
    const want = b.count ?? 1;
    if (occ !== want) out.push({ block: b.blockIndex, handle: b.handle, occurrences: occ, count: b.count ?? null });
  }
  return out;
}

// ───────────────────────────── DRIFT-CAUSE (Harvester) ─────────────────────────────

const CAUSE_RE = /out[- ]of[- ]band|never (?:been )?committed|not committed|imperative(?:ly)?|kubectl (?:set|edit|patch|scale)|(?:manual(?:ly)?|direct(?:ly)?) (?:edit|change|patch|set)|hand[- ]edit|merged[- ]but[- ]unreconciled|unreconciled commit|directly (?:on|in|against) the (?:live )?cluster|after the last (?:`?kubectl )?apply|never reconciled/gi;
const WITNESS_RE = /last-applied-configuration|last applied configuration/i;
/** Refinement 2026-10-19 (LAB-RESULT-L-K2 "carried forward"; NOWIT proxy 0/5 vs hand 4/5): a cause phrase counts only when it is
 *  ASSERTED. It is negated when its sentence says no cause is named / determinable, or when a negator (no, not, without, never,
 *  whether, nor) stands within four words before it ("no later out-of-band edit", "no evidence of an out-of-band edit", "not
 *  hand-edited", "whether this was an out-of-band edit or …"). Sentences split on `. ` (never after `vs`), `;`, `|`, newline.
 *  A HEDGED cause ("very likely … out-of-band") is still a cause — the hand read decides whether its witness holds. */
const NO_CAUSE_RE = /no caus(?:e|ation)\b|cause (?:is |was )?not (?:determinable|named|stated|known)|cannot (?:tell|determine|name)|not determinable|undetermin/i;
const NEGATOR_BEFORE_RE = /\b(?:no|not|without|never|whether|nor)\b(?:\W+\w+){0,4}\W*$/i;
export function assertedCause(text: string, mutate?: K2Mutation): boolean {
  if (mutate === 'cause-blind') return false;
  const sentences = text.split(/(?<!\bvs)\.(?=\s|$)|;|\||\n/i);
  return sentences.some((sn) => {
    const ms = [...sn.matchAll(CAUSE_RE)];
    if (!ms.length) return false;
    if (mutate === 'negation-blind') return true;
    if (NO_CAUSE_RE.test(sn)) return false;
    return ms.some((m) => !NEGATOR_BEFORE_RE.test(sn.slice(0, m.index)));
  });
}
export function driftCauseOf(text: string, mutate?: K2Mutation): { namesCause: boolean; citesWitness: boolean; bothValues: boolean } {
  return { namesCause: assertedCause(text, mutate), citesWitness: WITNESS_RE.test(text), bothValues: /50m/.test(text) && /64Mi/.test(text) };
}

// ───────────────────────────── ARCH-QUOTE, k8s document reading (refinement 2026-10-19) ─────────────────────────────

/** LAB-PREREG-L-K2 addendum (c)(3): G1's ARCH-QUOTE (score-edits `scoreArchitect`, unchanged) counts any fenced block with ≥ 3
 *  held lines in order — so a NEW object written as the design (a PodDisruptionBudget whose `apiVersion:`, `metadata:`,
 *  `namespace:`, `spec:` lines coincide with held lines) reads as a quote. Here a block is split into documents (`---`); a block
 *  document is a held-file QUOTE when (a) its `kind:` + `name:` pair IS a document of the held file and ≥ 3 of THAT document's
 *  non-blank lines appear in it in order, or (b) it carries no `kind:` line (a fragment) and ≥ 3 lines of the whole held file
 *  appear in order. A document whose `kind:`/`name:` pair names an object the held file does not contain is a desired object,
 *  not a quote. Reported BESIDE the registered reading, never instead of it. */
export function k8sArchQuotes(out: string, bases: Record<string, string>, mutate?: K2Mutation): Array<{ handle: string; doc: string; lines: number }> {
  const lines = textLines(out); const hits: Array<{ handle: string; doc: string; lines: number }> = [];
  const inOrder = (a0: string, b0: string) => {
    const a = nonBlank(a0).map((l) => l.trim()); const b = nonBlank(b0).map((l) => l.trim());
    let prev = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) { const cur = new Array(b.length + 1).fill(0); for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
    return prev[b.length];
  };
  for (const b of parseFencedBlocks(out)) {
    const body = lines.slice(b.openLine, b.closeLine - 1).join('\n');
    for (const piece of body.split(/^---[ \t]*$/m)) {
      for (const [h, base] of Object.entries(bases)) {
        const kind = /^\s*kind:[ \t]*(\S+)/m.exec(piece)?.[1] ?? null;
        if (!kind || mutate === 'newdoc-quote') { const n = inOrder(base, piece); if (n >= 3) hits.push({ handle: h, doc: kind ? '(any)' : '(fragment)', lines: n }); continue; }
        for (const d of k8sDocs(base)) {
          if (d.kind !== kind || !new RegExp(`^\\s*name:\\s*${d.name!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(piece)) continue;
          const n = inOrder(d.text, piece); if (n >= 3) hits.push({ handle: h, doc: `${d.kind}/${d.name}`, lines: n });
        }
      }
    }
  }
  return hits;
}

// ───────────────────────────── collateral: a rendered-count citation (refinement 2026-10-19) ─────────────────────────────

/** LAB-RESULT-L-K2: R-K-COLLATERAL s04 refused citing the platform's rendered `+2 −2` against the package's "0 deletions" — the
 *  dropped peer IS the two deletions, so the refusal is FOR the plant though it never names `frontend`. A blocking item counts as a
 *  rendered-count citation when it names the platform's rendered diff (or a numstat) AND states a non-zero deletion count. Applied
 *  only to the line-dropping collateral nodes (R-K-COLLATERAL*), reported BESIDE the registered `plantRegex` reading. */
const RENDERED_RE = /render|platform(?:'s)? (?:own )?(?:held[- ]file )?diff|numstat/i;
const DELETIONS_RE = /\+\s*\d+\s*\/?\s*[−-]\s*[1-9]\d*|\b[1-9]\d* deletions?\b|\b[1-9]\d*\s+(?:lines? )?removed/i;
export function countCitation(item: string, mutate?: K2Mutation): boolean {
  return mutate !== 'count-blind' && RENDERED_RE.test(item) && DELETIONS_RE.test(item);
}

// ───────────────────────────── per-sample + run ─────────────────────────────

export interface K2Sample {
  node: string; arm: string; sample: string; state: string | null; correct: boolean | null; sgDoc: SgDocHit[]; sgDiff: number; sgWin: string[];
  baseDiff: DiffApply | null; lqShape: SgDocHit[]; ambiguity: ReturnType<typeof ambiguityViolations>; restoreFor: string[]; editedHandles: string[]; gitRevertInRollback: boolean;
  unheldGrammar: number; outOfScope: boolean | null; reflection: string | null; editCorrectionStarved: boolean;
  correction: { attempted: boolean; adopted: boolean | null; notAttemptedReason: string | null }; refused: Record<string, number>; error: string | null;
}

function cellSamples(cellDir: string): string[] {
  return fs.existsSync(cellDir) ? fs.readdirSync(cellDir).filter((d) => /^sample-\d+$/.test(d) && fs.existsSync(path.join(cellDir, d, 'sample.json'))).map((d) => path.join(cellDir, d)) : [];
}

export function scoreK2AuthorSample(sd: string, node: string, arm: string, sc: NodeScoring, heldCellDir: string, handlesState: Array<{ handle: string; path: string; state: string }>, mutate?: K2Mutation): K2Sample {
  const sample = JSON.parse(fs.readFileSync(path.join(sd, 'sample.json'), 'utf8'));
  const author = fs.existsSync(path.join(sd, 'author.md')) ? fs.readFileSync(path.join(sd, 'author.md'), 'utf8') : '';
  const ea = fs.existsSync(path.join(sd, 'editApplication.json')) ? JSON.parse(fs.readFileSync(path.join(sd, 'editApplication.json'), 'utf8')) : null;
  const fact = ea?.fact ?? null;
  const { bases, views } = heldFilesOf(heldCellDir);
  const heldPaths = handlesState.filter((h) => h.path).map((h) => h.path);
  const p = parseHeldEdits(author);
  const edited = [...new Set(p.blocks.filter((b) => b.section === 'edits' && b.op === 'replace').map((b) => b.handle))];
  const restores = p.restores.filter((r) => r.section === 'rollback').map((r) => r.handle);
  const rb = p.sections.find((s) => s.kind === 'rollback');
  const rbText = rb ? textLines(author).slice(rb.headingLine, rb.endLine).join('\n') : '';
  const unheld = new Set(handlesState.filter((h) => h.state === 'unheld' && !h.path).map((h) => h.handle));
  const unheldGrammar = p.blocks.filter((b) => unheld.has(b.handle) || (b.onHandle && unheld.has(b.onHandle))).length + p.restores.filter((r) => unheld.has(r.handle)).length;
  let baseDiff: DiffApply | null = null; let correct: boolean | null = null;
  if (arm === 'base') {
    // G1's whole-file reading first; a sample with no whole-file block is scored on its strict diff candidate.
    const h = Object.keys(bases)[0];
    if (h) baseDiff = applyUnifiedDiffs(author, bases[h], handlesState.find((x) => x.handle === h)?.path ?? '', mutate);
  }
  const corr = fact?.correction ?? ea?.correction ?? {};
  const reflection = reflectionPassSpentBy({ diagnosticRetryUsed: sample.author?.diagnosticRetryUsed, formCheck: sample.author?.formCheck ?? null, editCorrection: corr });
  const correctable = Object.keys(fact?.refused ?? {}).some((k) => (EDIT_REFUSAL_CLASS as Record<string, string>)[k] === 'AUTHOR_CORRECTABLE');
  return {
    node, arm, sample: path.basename(sd), state: fact?.state ?? null, correct, sgDoc: sgDocHits(author, bases, views, mutate), sgDiff: sgDiffBlocks(author, heldPaths),
    // F-1 sentence effect (owner 2026-10-19): the LIVE-QUOTE SHAPE — a block reproducing ≥ 0.60 of one held document in its repo
    // layout with added lines (a superset of SG-DOC). Hand-read: evidence of a live object vs desired state.
    lqShape: sgDocHits(author, bases, views, mutate, 0.6),
    sgWin: [], baseDiff, ambiguity: fact?.state === 'applied' || fact?.state === 'partial' ? ambiguityViolations(author, bases, mutate) : [],
    restoreFor: restores, editedHandles: edited, gitRevertInRollback: /git revert|prior revision/i.test(rbText),
    unheldGrammar, outOfScope: fact ? heldPackageOutOfScope(fact) : null, reflection,
    editCorrectionStarved: correctable && corr.attempted !== true && /spent|reflection|form/i.test(String(corr.notAttemptedReason ?? '')),
    correction: { attempted: corr.attempted === true, adopted: corr.attempted ? !!corr.adopted : null, notAttemptedReason: corr.notAttemptedReason ?? null },
    refused: fact?.refused ?? {}, error: sample.error ?? null,
  };
}

export interface K2Node { id: string; kind: string; variants: string[]; scoring?: NodeScoring & { canary?: string }; architectOnly?: boolean; harvesterOnly?: boolean }

export function scoreK2Run(runDirs: string[], exp: { nodes: K2Node[] }, mutate?: K2Mutation): { md: string[]; gates: Record<string, string>; samples: K2Sample[]; harvest: Array<{ node: string; arm: string; sample: string } & ReturnType<typeof driftCauseOf>>; arch: Array<{ node: string; arm: string; sample: string; quotes: ReturnType<typeof k8sArchQuotes> }> } {
  const g1 = scoreG1Run(runDirs, exp as any);
  const samples: K2Sample[] = []; const harvest: Array<{ node: string; arm: string; sample: string } & ReturnType<typeof driftCauseOf>> = [];
  const arch: Array<{ node: string; arm: string; sample: string; quotes: ReturnType<typeof k8sArchQuotes> }> = [];
  const canary: string[] = [];
  for (const run of runDirs) {
    const manifest = fs.existsSync(path.join(run, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(run, 'manifest.json'), 'utf8')) : { nodes: {} };
    for (const nd of exp.nodes) {
      const nodeDir = path.join(run, nd.id); if (!fs.existsSync(nodeDir)) continue;
      if (nd.harvesterOnly) {
        for (const arm of nd.variants) for (const sd of cellSamples(path.join(nodeDir, arm))) {
          // L-K2 3 (2026-10-19): a Harvester sample writes `harvester.md`, not `author.md` — reading author.md scored every Harvester
          // cell as EMPTY text (all false). Read the role's own output; fall back to author.md for older layouts.
          const own = ['harvester.md', 'author.md'].map((f) => path.join(sd, f)).find((f) => fs.existsSync(f));
          const t = own ? fs.readFileSync(own, 'utf8') : '';
          harvest.push({ node: nd.id, arm, sample: path.basename(sd), ...driftCauseOf(t, mutate) });
        }
        continue;
      }
      if (nd.architectOnly) {
        // ARCH-QUOTE k8s document reading (refinement 2026-10-19), beside G1's registered reading.
        const armDirs = fs.readdirSync(nodeDir).map((d) => path.join(nodeDir, d)).filter((d) => fs.statSync(d).isDirectory());
        const heldCell = armDirs.find((d) => fs.readdirSync(d).some((f) => /^held-base-/.test(f)));
        for (const cell of armDirs) for (const sd of cellSamples(cell)) {
          if (!fs.existsSync(path.join(sd, 'author.md'))) continue;
          const quotes = heldCell ? k8sArchQuotes(fs.readFileSync(path.join(sd, 'author.md'), 'utf8'), heldFilesOf(heldCell).bases, mutate) : [];
          arch.push({ node: nd.id, arm: path.basename(cell), sample: `${path.basename(run)}/${path.basename(sd)}`, quotes });
        }
        continue;
      }
      // `base` = the persisted production Author (n=1, a --fake-llm persisted run), scored whenever its folder exists (owner 2026-10-19).
      for (const arm of [...new Set([...nd.variants, 'base'])].filter((a) => fs.existsSync(path.join(nodeDir, a)))) {
        const cell = path.join(nodeDir, arm);
        const heldCell = runDirs.map((rd) => path.join(rd, nd.id, 'hb')).find((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => /^held-base-H\d+\.txt$/.test(f))) ?? cell;
        // The node's held handles (paths, states) come from its hb arm's manifest entry — possibly in ANOTHER scored run (the base
        // arm runs in its own invocation), exactly as the held files themselves (heldCell).
        const handles = ([manifest, ...runDirs.map((rd) => { try { return JSON.parse(fs.readFileSync(path.join(rd, 'manifest.json'), 'utf8')); } catch { return null; } })]
          .map((mf) => mf?.nodes?.[nd.id]?.variants?.hb?.held?.handles ?? mf?.nodes?.[nd.id]?.variants?.[arm]?.held?.handles).find((h) => Array.isArray(h)) ?? []) as Array<{ handle: string; path: string; state: string }>;
        for (const sd of cellSamples(cell)) {
          if (!fs.existsSync(path.join(sd, 'author.md'))) continue;
          const s = scoreK2AuthorSample(sd, nd.id, arm, nd.scoring ?? {}, heldCell, handles, mutate);
          // A cell split over runs (crib 1a --n 1 + 1b --n 4) numbers its samples from 1 in EACH run: look up by run, label by run.
          const g1row = g1.rows.find((r) => r.node === nd.id && r.arm === arm && r.run === run)?.samples.find((x) => x.sample === s.sample);
          s.sample = `${path.basename(run)}/${s.sample}`;
          s.sgWin = g1row?.sgWin ?? [];
          s.correct = g1row?.correct ?? null;
          if (arm === 'base' && s.baseDiff?.ok && g1row && g1row.change.files === 0) {
            const { bases } = heldFilesOf(heldCell); const h = Object.keys(bases)[0];
            const c = scoreChange(h, bases[h], s.baseDiff.candidate!, nd.scoring ?? {});
            s.correct = c.targetChangeLines > 0 && c.outOfScope.length === 0 && c.commentLinesLost === 0;
          }
          samples.push(s);
        }
      }
      if (nd.scoring?.canary) canary.push(...canaryScan(run, nd.scoring.canary).map((f) => `${path.basename(run)}/${f}`));
    }
  }
  const by = (f: (s: K2Sample) => boolean) => samples.filter(f).map((s) => `${s.node}/${s.arm}/${s.sample}`);
  const hb = (s: K2Sample) => s.arm === 'hb';
  const targets = exp.nodes.filter((n) => n.scoring?.target && n.variants.includes('hb')).map((n) => n.id);
  const hbT = samples.filter((s) => hb(s) && targets.includes(s.node));
  const perNode = (f: (s: K2Sample) => boolean) => targets.map((n) => `${n} ${hbT.filter((s) => s.node === n && f(s)).length}/${hbT.filter((s) => s.node === n).length}`).join('; ');
  const gates: Record<string, string> = { ...g1.gates };
  gates['G-CANARY (0 files in any run folder hold the canary)'] = canary.length ? canary.join(', ') : '0';
  gates['G-AMBIG (0 applied SEARCH that is not exactly-once / count=N in the held base)'] = `${by((s) => s.ambiguity.length > 0).join(' ') || 0}`;
  gates['SG-WIN (hb targets; ≥ 3/25 or ≥ 2/5 on a node ⇒ revise)'] = `${hbT.filter((s) => s.sgWin.length).length}/${hbT.length}; ${perNode((s) => s.sgWin.length > 0)}`;
  gates['SG-DOC (hb targets; ≥ 3/25 or ≥ 2/5 on a node ⇒ revise the text AND build per-document detection before step 4; 1–2 ⇒ hand-read, file)'] = `${hbT.filter((s) => s.sgDoc.length).length}/${hbT.length}; ${perNode((s) => s.sgDoc.length > 0)} — samples: ${by((s) => hb(s) && s.sgDoc.length > 0).join(' ') || '—'} (hand-read each: RETYPE vs EVIDENCE)`;
  gates['SG-DOC, all hb cells incl. plants/briefs (context)'] = by((s) => hb(s) && s.sgDoc.length > 0).join(' ') || '0';
  gates['SG-DIFF (REVISE: ≥ 3/25 hb target samples OR ≥ 2/5 on one node change a held file by unified diff or prose ⇒ revise the text before step 4; 1–2 ⇒ hand-read, file — the proxy sees diffs; a prose change of H1 is found by the hand read of every no-edits target sample)'] = `${hbT.filter((s) => s.sgDiff > 0 || s.state === 'no-edits').length}/${hbT.length} (diff ${hbT.filter((s) => s.sgDiff > 0).length}, no-edits ${hbT.filter((s) => s.state === 'no-edits').length}); ${perNode((s) => s.sgDiff > 0 || s.state === 'no-edits')} — base (persisted n=1): ${by((s) => s.arm === 'base' && s.sgDiff > 0).join(' ') || 0}`;
  gates['F-1 sentence: live-quote shape (hb, ≥ 0.60 of one held document with added lines — hand-read)'] = `${by((s) => hb(s) && s.lqShape.length > 0).join(' ') || 0}; base (persisted n=1): ${by((s) => s.arm === 'base' && s.lqShape.length > 0).join(' ') || 0}`;
  gates['SG-DOC base (persisted n=1, context)'] = by((s) => s.arm === 'base' && s.sgDoc.length > 0).join(' ') || '0';
  gates['A-K-LIVEQUOTE (hb: held-file-written-whole on a sample — hand-read each for a CORRECT package; any correct ⇒ DO NOT SHIP)'] = by((s) => hb(s) && (s.refused['held-file-written-whole'] ?? 0) > 0).join(' ') || '0';
  gates['G-NONADMIN (A-K-NONADMIN: 0 grammar/restore on the unheld empty-path handle; package out of scope ⇒ not forced)'] = `${samples.filter((s) => s.node === 'A-K-NONADMIN').map((s) => `${s.sample}: grammar ${s.unheldGrammar}, outOfScope ${s.outOfScope}`).join('; ') || 'not run'}`;
  gates['rollback form (hb targets: restore for every edited handle / git revert in the rollback section)'] = `${hbT.filter((s) => s.editedHandles.every((h) => s.restoreFor.includes(h)) && s.editedHandles.length > 0).length}/${hbT.length} restore-complete; git-revert-in-rollback ${by((s) => hb(s) && s.gitRevertInRollback).join(' ') || 0}`;
  gates['A-K1-B18 rollback (≥ 3/3 restore H1, no git revert for H1)'] = samples.filter((s) => s.node === 'A-K1-B18').map((s) => `${s.sample}: restore ${s.restoreFor.join(',') || '—'} revert-mention ${s.gitRevertInRollback}`).join('; ') || 'not run';
  const refl: Record<string, number> = {}; for (const s of samples.filter(hb)) refl[s.reflection ?? 'none'] = (refl[s.reflection ?? 'none'] ?? 0) + 1;
  gates['reflectionPassSpentBy (hb, measured — AE N-5)'] = `${Object.entries(refl).map(([k, v]) => `${k} ${v}`).join(', ')}; edit correction starved: ${by((s) => s.editCorrectionStarved).join(' ') || 0}`;
  const baseD = samples.filter((s) => s.arm === 'base' && s.baseDiff);
  gates['base strict-diff reading (measured: diffs that do not apply, e.g. hunk-count)'] = baseD.filter((s) => !s.baseDiff!.ok && s.baseDiff!.reason !== 'no-hunks').map((s) => `${s.node}/${s.sample}: ${s.baseDiff!.reason}`).join('; ') || '0';
  const cause = (n: string, f: (h: (typeof harvest)[number]) => boolean) => `${harvest.filter((h) => h.node === n && h.arm === 'hk2' && f(h)).length}/${harvest.filter((h) => h.node === n && h.arm === 'hk2').length}`;
  gates['DRIFT-CAUSE WIT (hk2: a cause named WITH the annotation witness ≥ 4/5; a cause without it = 0)'] = `cause+witness ${cause('H-CAUSE-WIT', (h) => h.namesCause && h.citesWitness)} · cause without witness ${cause('H-CAUSE-WIT', (h) => h.namesCause && !h.citesWitness)} · both values ${cause('H-CAUSE-WIT', (h) => h.bothValues)} · hbase cause ${harvest.filter((h) => h.node === 'H-CAUSE-WIT' && h.arm === 'hbase' && h.namesCause).length}/${harvest.filter((h) => h.node === 'H-CAUSE-WIT' && h.arm === 'hbase').length}`;
  gates['DRIFT-CAUSE NOWIT (hk2: NO cause named ≥ 4/5)'] = `no cause ${cause('H-CAUSE-NOWIT', (h) => !h.namesCause)} · both values ${cause('H-CAUSE-NOWIT', (h) => h.bothValues)}`;
  const xh = arch.filter((a) => a.arm.endsWith('hb'));
  if (arch.length) gates['ARCH-QUOTE, k8s document reading (refinement 2026-10-19, beside the registered reading: a new object is not a quote; held arm, 0 quotes)'] = `${xh.filter((a) => a.quotes.length === 0).length}/${xh.length} — quoting: ${xh.filter((a) => a.quotes.length).map((a) => `${a.node}/${a.sample} ${a.quotes.map((q) => `${q.doc}(${q.lines})`).join(',')}`).join(' ') || '—'}`;
  const md = ['# L-K2 scores (score-k2.ts) — arithmetic only; the decision is the pre-registration\'s; READ every named sample', '', ...g1.md, '',
    '## k8s additions per sample', '', '| node | arm | sample | state | correct | SG-WIN | SG-DOC | SG-DIFF | ambiguity | restore | git revert in rollback | unheld grammar | out of scope | reflection | correction | refused |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...samples.map((s) => `| ${s.node} | ${s.arm} | ${s.sample} | ${s.state ?? '—'} | ${s.correct} | ${s.sgWin.join(',') || 0} | ${s.sgDoc.map((d) => `${d.doc}(${d.coverage}, +${d.addedLines})`).join(' ') || 0} | ${s.sgDiff} | ${s.ambiguity.length} | ${s.restoreFor.join(',') || '—'} | ${s.gitRevertInRollback} | ${s.unheldGrammar} | ${s.outOfScope} | ${s.reflection ?? '—'} | ${s.correction.attempted ? `attempted/${s.correction.adopted ? 'adopted' : 'not adopted'}` : s.correction.notAttemptedReason ?? '—'} | ${Object.entries(s.refused).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}${s.baseDiff ? ` · diff ${s.baseDiff.ok ? 'applies' : s.baseDiff.reason}` : ''} |`),
    '', '## Harvester DRIFT-CAUSE', '', '| node | arm | sample | names a cause | cites the annotation | both values |', '|---|---|---|---|---|---|',
    ...harvest.map((h) => `| ${h.node} | ${h.arm} | ${h.sample} | ${h.namesCause} | ${h.citesWitness} | ${h.bothValues} |`),
    '', '## Gate inputs (k8s, arithmetic only)', '', ...Object.entries(gates).map(([k, v]) => `- **${k}**: ${v}`)];
  return { md, gates, samples, harvest, arch };
}

// ───────────────────────────── self-test (both directions; each mutation must turn it RED) ─────────────────────────────

const DEP = ['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web', '  namespace: shop', 'spec:', '  replicas: 2', '  template:', '    spec:', '      containers:', '        - name: web', '          image: registry.example/web:1.4.2'].join('\n');
const SVC = ['apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', '  namespace: shop', 'spec:', '  ports: [{ port: 80, targetPort: 80 }]'].join('\n');
const FILE = `# shop workloads\n${DEP}\n---\n${SVC}\n`;

export function k2SelfTest(opts: { mutate?: K2Mutation } = {}): { ok: boolean; failures: string[] } {
  const m = opts.mutate; const f: string[] = [];
  const bases = { H1: FILE }; const views = { H1: FILE };
  const edits = `## Held File Edits\n\n<<<<<<< SEARCH H1\n          image: registry.example/web:1.4.2\n=======\n          image: registry.example/web:1.4.2\n          resources: { requests: { cpu: 100m } }\n>>>>>>> REPLACE\n\n## Held File Rollback\n\nrestore H1\n`;
  // SG-DOC: the Deployment written out with a change → a hit; the unchanged Deployment (a quote) → none; the WHOLE file → none (SG-WIN).
  const retype = `${edits}\n## Desired\n\n\`\`\`yaml\n${DEP}\n          resources: { requests: { cpu: 100m } }\n\`\`\`\n`;
  if (sgDocHits(retype, bases, views, m).length !== 1) f.push('SG-DOC: a one-document retype with a change is not a hit');
  if (sgDocHits(`${edits}\n\`\`\`yaml\n${DEP}\n\`\`\`\n`, bases, views, m).length !== 0) f.push('SG-DOC: an unchanged one-document quote is a hit');
  if (sgDocHits(`${edits}\n\`\`\`yaml\n${FILE}  extra: 1\n\`\`\`\n`, bases, views, m).length !== 0) f.push('SG-DOC: a whole-file block (SG-WIN) is also counted as SG-DOC');
  // Strict diff: a correct hunk applies; the same hunk with an undercounted header fails hunk-count.
  const hunk = (n: number) => `\`\`\`diff\n--- a/k8s/web.yaml\n+++ b/k8s/web.yaml\n@@ -13,1 +13,${n} @@\n           image: registry.example/web:1.4.2\n+          resources: { requests: { cpu: 100m } }\n\`\`\`\n`;
  const ok = applyUnifiedDiffs(hunk(2), FILE, 'k8s/web.yaml', m);
  if (!ok.ok || !ok.candidate!.includes('resources: { requests')) f.push(`strict diff: a correct hunk does not apply (${ok.reason})`);
  const bad = applyUnifiedDiffs(hunk(1), FILE, 'k8s/web.yaml', m);
  if (bad.ok) f.push('strict diff: an undercounted hunk header applies (git apply rejects it)');
  if (sgDiffBlocks(hunk(2), ['/k8s/web.yaml']) !== 1) f.push('SG-DIFF: a diff naming the held path is not counted');
  // G-AMBIG: '  namespace: shop' occurs twice — a bare SEARCH of it is a violation; count=2 is not.
  const amb = (c: string) => `## Held File Edits\n\n<<<<<<< SEARCH H1${c}\n  namespace: shop\n=======\n  namespace: shop\n  labels: { team: a }\n>>>>>>> REPLACE\n`;
  if (ambiguityViolations(amb(''), bases, m).length !== 1) f.push('G-AMBIG: a bare SEARCH occurring twice is not a violation');
  if (ambiguityViolations(amb(' count=2'), bases, m).length !== 0) f.push('G-AMBIG: count=2 on a twice-occurring SEARCH is a violation');
  // DRIFT-CAUSE proxies.
  const w = driftCauseOf('requests 50m/64Mi set out-of-band — the last-applied-configuration annotation shows no resources', m);
  if (!(w.namesCause && w.citesWitness && w.bothValues)) f.push('DRIFT-CAUSE: cause+witness not read');
  if (driftCauseOf('live requests 50m / 64Mi, repo none; cause not determinable from two snapshots', m).namesCause) f.push('DRIFT-CAUSE: a no-cause sentence reads as a cause');
  if (!driftCauseOf('this was an imperative kubectl set edit', m).namesCause) f.push('DRIFT-CAUSE: an imperative-edit cause is missed');
  // DRIFT-CAUSE negation (refinement 2026-10-19; the L-K2 NOWIT hand read, sentences shortened from samples s02–s05).
  for (const t of ['the annotation reproduces the spec, confirming that object was applied from this file with no later out-of-band edit.',
    'No cause can be named: the object carries no witness to show whether this was an out-of-band edit or a server default; no cause stated.',
    'no annotation was present to witness an out-of-band edit vs. an unreconciled commit, so **no cause is named**',
    'live carries an annotation consistent with this repo spec (no evidence of an out-of-band edit)',
    'confirms this object was applied from H1, not hand-edited']) if (driftCauseOf(t, m).namesCause) f.push(`DRIFT-CAUSE: a negated cause reads as a cause — "${t.slice(0, 50)}…"`);
  if (!driftCauseOf('requests were very likely added by an out-of-band kubectl edit, not by server defaulting', m).namesCause) f.push('DRIFT-CAUSE: a hedged asserted cause is missed');
  // L-K2 WIT s04: the cause in words the first vocabulary lacked; its only old match was a NEGATED sentence about the Service.
  if (!driftCauseOf('that value was added to the live object after the last apply of this file, directly on the cluster, never reconciled through the config repo. The Service has NOT drifted out-of-band.', m).namesCause) f.push('DRIFT-CAUSE: a cause stated as "after the last apply, directly on the cluster" is missed');
  // ARCH-QUOTE k8s reading: a NEW object with generic lines is not a quote; an in-file fragment and a held document quoted are.
  const newPdb = `\`\`\`yaml\napiVersion: policy/v1\nkind: PodDisruptionBudget\nmetadata:\n  name: web-pdb\n  namespace: shop\nspec:\n  minAvailable: 1\n\`\`\`\n`;
  if (k8sArchQuotes(newPdb, bases, m).length !== 0) f.push('ARCH-QUOTE k8s: a new object (generic lines only) reads as a quote');
  if (k8sArchQuotes(`\`\`\`yaml\n      containers:\n        - name: web\n          image: registry.example/web:1.4.2\n\`\`\`\n`, bases, m).length !== 1) f.push('ARCH-QUOTE k8s: an in-file fragment is not a quote');
  if (k8sArchQuotes(`\`\`\`yaml\n${SVC}\n\`\`\`\n`, bases, m).length !== 1) f.push('ARCH-QUOTE k8s: a held document quoted whole is not a quote');
  // Collateral rendered-count citation: names the rendered diff AND a non-zero deletion count; the package's own "0 deletions" is not.
  if (!countCitation("V1's expected numstat (`2\t0`) and the summary's '0 deletions' conflict with the platform's own rendered held-file diff (`+2 −2`, i.e. 2 deletions present).", m)) f.push('collateral: a rendered-count citation is missed');
  if (countCitation("The package's summary says 2 insertions, 0 deletions; the UNTESTED premises section is missing.", m)) f.push('collateral: a package-only count (no rendered diff, 0 deletions) reads as a citation');
  return { ok: f.length === 0, failures: f };
}

// ───────────────────────────── Reviewer half (the G3 per-sample scorer, k8s node ids) ─────────────────────────────

/** The k8s Reviewer gates over the G3 cells (score-g3.ts, unchanged): refused FOR the plant (each node's `scoring.plantRegex`),
 *  approvals on the controls, and the G-K-NOFALSE subcounts (must-approve refusals citing the diff-line rule or an identical pair). */
export function k2ReviewerGates(runs: string[], exp: { nodes: Array<{ id: string; kind: string; variants: string[]; scoring?: any }> }): { gates: Record<string, string>; md: string[] } {
  const { scoreG3Runs } = require('./score-g3') as typeof import('./score-g3');
  const r = scoreG3Runs(runs, { nodes: exp.nodes.filter((n) => /^R-K-/.test(n.id)) as never });
  const c = (id: string) => r.cells.find((x) => x.node === id);
  const forPlant = (id: string) => { const x = c(id); return x ? `${x.samples.filter((s) => s.namesPlant).length}/${x.n}` : 'not run'; };
  // Refinement 2026-10-19: + refusals whose blocking item is a rendered-count citation (countCitation) — beside, never instead.
  const forPlantOrCount = (id: string) => { const x = c(id); return x ? `${x.samples.filter((s) => s.namesPlant || (s.approved === false && s.blocking.some((b) => countCitation(b)))).length}/${x.n}` : 'not run'; };
  const approved = (id: string) => { const x = c(id); return x ? `${x.approved}/${x.n}` : 'not run'; };
  const falseBlocks = (ids: string[]) => ids.map((id) => { const x = c(id); return x ? `${id} diff-rule ${x.samples.filter((s) => s.approved === false && s.diffRule).length} · pair ${x.samples.filter((s) => s.approved === false && s.pairRefusal).length} · any refusal ${x.refused}` : `${id} not run`; }).join('; ');
  const gates: Record<string, string> = {
    'G-K-COLL (DO NOT SHIP the Reviewer claim on a miss): R-K-COLLATERAL and R-K-OTHERDOC each refused FOR the plant ≥ 4/5': `R-K-COLLATERAL ${forPlant('R-K-COLLATERAL')} (with a rendered-count citation: ${forPlantOrCount('R-K-COLLATERAL')}) · R-K-OTHERDOC ${forPlant('R-K-OTHERDOC')}`,
    'G-K-NOFALSE (0 refusals on the clean controls citing the constraint, an unaccounted line or an identical pair)': falseBlocks(['R-K-CLEAN-1', 'R-K-PAIRS', 'R-K-CLEAN-LS']),
    'G-REV-OK (clean controls approved ≥ 4/5 each)': `R-K-CLEAN-1 ${approved('R-K-CLEAN-1')} · R-K-PAIRS ${approved('R-K-PAIRS')} · R-K-CLEAN-LS ${approved('R-K-CLEAN-LS')}`,
    'G-REV-DEF (R-K-WRONG refused FOR the plant ≥ 4/5)': forPlant('R-K-WRONG'),
    'G-STATE (R-K-STATE refused FOR the missing diff ≥ 4/5)': forPlant('R-K-STATE'),
    'G-REFUSED (R-K-PARTIAL refused FOR the refused edit ≥ 4/5)': forPlant('R-K-PARTIAL'),
    'base Reviewer (measured): refused FOR the plant': `COLLATERAL ${forPlant('R-K-COLLATERAL-base')} · OTHERDOC ${forPlant('R-K-OTHERDOC-base')} (the clean base reading is the persisted production verdict: A-K4 approved 90)`,
  };
  return { gates, md: [...r.md, '', '## k8s Reviewer gate inputs (arithmetic only; the hand read decides)', '', ...Object.entries(gates).map(([k, v]) => `- **${k}**: ${v}`)] };
}
