/**
 * Leg replay lab — L-5, the G1 EDIT scorer (PLATFORM-HELD-BYTES Stage B plan §4; model-evaluation lane §1.3 L-5, §2, §3). $0.
 *
 * NEVER re-applies an edit. A `hb` sample's state, refusals and candidate bytes are the SHIPPING edit step's (`editApplication.json`,
 * `candidate-H<n>.txt`); a `base` sample's package is read for the whole-file desired-state block that covers each held base.
 * Both are compared with the node's held bases (`held-base-H<n>.txt`, L-1) and its PRE-REGISTERED scoring (experiment.json
 * `nodes[].scoring`, written before spend):
 *
 *   allowedAdded / allowedRemoved: { "H<n>": ["<regex>", …] } — a candidate line not in the base must match an allowedAdded pattern of
 *     its handle; a base line the candidate dropped must match an allowedRemoved pattern; anything else is OUT OF SCOPE (G-SCOPE).
 *     Added comment lines are counted apart (`addedCommentLines`), never out of scope; DROPPED comment lines are `commentLinesLost`.
 *   expectEdit: false — a must-NOT-edit node (G-NOEDIT): any edit operation, any candidate, any whole-file block that differs from a
 *     held base is a failure.
 *   canary: a planted string (A-SECRET): counted in every file under the run dir (prompts, outputs, held files) — G-CANARY wants 0.
 *   target: true — a G-APPLY target node.
 *
 * CORRECT (G-NOWORSE), per sample: the change the node asks for is present (≥ 1 allowedAdded line), 0 out-of-scope lines, 0 comment
 * lines lost — for `hb` additionally state `applied`; on a must-NOT-edit node, nothing changed.
 * SG-WIN (lane §3): a fenced block OUTSIDE the edit grammar whose non-blank lines cover ≥ 90% of a HELD base's non-blank lines in order,
 * outside the rollback section. SG-RB: the same inside the rollback section. SG-NONHELD: a ≥ 10-line block that covers no held base
 * (a non-held file written in full — correct behaviour, excluded).
 * G-TRAP: for each refused SEARCH, whether its text is in the held view, or only in ANOTHER copy in the Author's prompt (the
 * Harvester's chained quote or the Architect's restatement) — the source the Author copied from instead of the held block.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseHeldEdits, grammarLineNumbers, textLines } from '../../lib/agents/harness/held-bytes/edits';
import { parseFencedBlocks } from '../../lib/agents/harness/package-form-check';
import { computeEditApplication, type HeldFileInput } from '../../lib/agents/harness/held-bytes/apply';
import { collectR10EchoSources } from '../../lib/agents/harness/redact-artifact-secrets';
import { candidateSetDigest8 } from '../../lib/agents/harness/held-bytes/edit-fact';
import { buildView } from '../../lib/agents/harness/held-bytes/view';

export interface NodeScoring { allowedAdded?: Record<string, string[]>; allowedRemoved?: Record<string, string[]>; expectEdit?: boolean; canary?: string; target?: boolean }

const nonBlank = (t: string) => t.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');

/** Fraction of `base`'s non-blank lines in `block`, in order — ONE definition since Phase 10 W3 (the applier refuses on it). */
export { inOrderCoverage } from '../../lib/agents/harness/held-bytes/whole-file';
import { inOrderCoverage } from '../../lib/agents/harness/held-bytes/whole-file';

/** Lines a candidate added, and base lines it dropped (multisets, trailing whitespace kept — byte fidelity is the point).
 *  ⚠️ KNOWN LIMIT, RECORDED NOT FIXED (ME-P2-7, G3 entry 2026-10-16): a multiset cannot see a MOVED line — an edit that keeps a
 *  line's bytes but changes its position or YAML parent nets to zero here, so G-SCOPE scores it in scope. The hand read covers it
 *  (Protocol 16 rule 6). Kept as-is so G1's recorded scores stay reproducible; a gate that must see moves needs an ORDERED diff
 *  (LCS) and its own pre-registration. G3 (a Reviewer bench) does not score G-SCOPE. */
export function lineDelta(base: string, cand: string): { added: string[]; removed: string[] } {
  const bag = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
  const strip = (t: string) => (t.endsWith('\n') ? t.slice(0, -1) : t).split('\n');
  const b = bag(strip(base)); const c = bag(strip(cand));
  const minus = (x: Map<string, number>, y: Map<string, number>) => { const o: string[] = []; for (const [k, n] of x) for (let i = 0; i < n - (y.get(k) ?? 0); i++) o.push(k); return o; };
  return { added: minus(c, b), removed: minus(b, c) };
}

export interface ChangeScore { outOfScope: Array<{ handle: string; line: string; dir: 'added' | 'removed' }>; commentLinesLost: number; addedCommentLines: number; targetChangeLines: number }

export function scoreChange(handle: string, base: string, cand: string, sc: NodeScoring): ChangeScore {
  const d = lineDelta(base, cand);
  const add = (sc.allowedAdded?.[handle] ?? []).map((r) => new RegExp(r)); const rem = (sc.allowedRemoved?.[handle] ?? []).map((r) => new RegExp(r));
  const out: ChangeScore = { outOfScope: [], commentLinesLost: 0, addedCommentLines: 0, targetChangeLines: 0 };
  for (const l of d.added) {
    if (add.some((re) => re.test(l))) out.targetChangeLines++;
    else if (/^\s*#/.test(l)) out.addedCommentLines++;
    else out.outOfScope.push({ handle, line: l, dir: 'added' });
  }
  for (const l of d.removed) {
    if (rem.some((re) => re.test(l))) continue;
    if (/^\s*#/.test(l)) out.commentLinesLost++;
    out.outOfScope.push({ handle, line: l, dir: 'removed' });
  }
  return out;
}

const readIf = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);

/** The node×arm's held files, by handle (written by the lab at prepare). */
export function heldFilesOf(cellDir: string): { bases: Record<string, string>; views: Record<string, string> } {
  const bases: Record<string, string> = {}; const views: Record<string, string> = {};
  for (const f of fs.existsSync(cellDir) ? fs.readdirSync(cellDir) : []) {
    const m = /^held-(base|view)-(H\d+)\.txt$/.exec(f);
    if (m) (m[1] === 'base' ? bases : views)[m[2]] = fs.readFileSync(path.join(cellDir, f), 'utf8');
  }
  return { bases, views };
}

export interface SampleScore {
  sample: string; arm: string; state: string | null; applied: number; total: number;
  correctionAttempted: boolean; correctionAdopted: boolean | null; refusedBefore: number | null;
  refused: Record<string, number>; editOps: number; candidates: number;
  change: ChangeScore & { files: number };
  sgWin: string[]; sgRb: number; sgNonHeld: number;
  viewFormInCandidate: number;
  trap: Array<{ handle: string | null; name: string; nearest: 'held-view' | 'other-copy-in-prompt' | 'neither' }>;
  failClosedViolation: boolean; correct: boolean;
  /** Post-run check (ME S-1): the stamped candidateDigest8 = a pure re-run over the final text and the L-1 files (null: no stamp). */
  digestReproduces: boolean | null;
}

export function scoreSample(sd: string, cellDir: string, arm: string, sc: NodeScoring, harvesterQuote: string | null, heldCellDir: string, r9Version: string): SampleScore {
  const author = fs.readFileSync(path.join(sd, 'author.md'), 'utf8');
  const ea = fs.existsSync(path.join(sd, 'editApplication.json')) ? JSON.parse(fs.readFileSync(path.join(sd, 'editApplication.json'), 'utf8')) : null;
  const fact = ea?.fact ?? null;
  const { bases, views } = heldFilesOf(heldCellDir);
  const p = parseHeldEdits(author);
  const change: SampleScore['change'] = { outOfScope: [], commentLinesLost: 0, addedCommentLines: 0, targetChangeLines: 0, files: 0 };
  const merge = (c: ChangeScore) => { change.outOfScope.push(...c.outOfScope); change.commentLinesLost += c.commentLinesLost; change.addedCommentLines += c.addedCommentLines; change.targetChangeLines += c.targetChangeLines; change.files++; };
  let viewFormInCandidate = 0;
  const candFiles = fs.readdirSync(sd).filter((x) => /^candidate-H\d+\.txt$/.test(x));
  for (const f of candFiles) {
    const h = f.slice('candidate-'.length, -'.txt'.length);
    const cand = fs.readFileSync(path.join(sd, f), 'utf8'); const base = bases[h];
    if (base === undefined) continue; // a create: no base to compare
    merge(scoreChange(h, base, cand, sc));
    const view = views[h];
    if (view !== undefined && view !== base) { const viewOnly = lineDelta(base, view).added; const cl = new Set(cand.split('\n')); viewFormInCandidate += viewOnly.filter((l) => cl.has(l)).length; }
  }
  // Whole-file blocks outside the edit grammar.
  const g = grammarLineNumbers(p);
  const lines = textLines(author);
  const rollbackSec = p.sections.find((s) => s.kind === 'rollback');
  const sgWin: string[] = []; let sgRb = 0; let sgNonHeld = 0;
  const baseBlocks: Record<string, string> = {};
  for (const b of parseFencedBlocks(author)) {
    const bodyIdx: number[] = []; for (let n = b.openLine + 1; n < b.closeLine; n++) bodyIdx.push(n);
    if (bodyIdx.some((n) => g.has(n))) continue;
    const body = bodyIdx.map((n) => lines[n - 1]).join('\n');
    const covered = Object.entries(bases).map(([h, base]) => [h, inOrderCoverage(base, body)] as const).sort((x, y) => y[1] - x[1])[0];
    const inRollback = !!rollbackSec && b.openLine > rollbackSec.headingLine && b.openLine <= rollbackSec.endLine;
    if (covered && covered[1] >= 0.9) { if (inRollback) sgRb++; else sgWin.push(covered[0]); }
    else if (!(covered && covered[1] >= 0.6) && nonBlank(body).length >= 10 && !inRollback) sgNonHeld++;
    // `base`'s candidate for a held file: a covering block outside the rollback section that ADDS a line to the base (a block identical
    // to the base, or one that only omits lines, is a quote of it, not a desired state); among several, the one with the most in-scope change lines.
    if (covered && covered[1] >= 0.6 && !inRollback) {
      const cand = body.endsWith('\n') ? body : `${body}\n`;
      const sc2 = scoreChange(covered[0], bases[covered[0]], cand, sc);
      const changed = lineDelta(bases[covered[0]], cand);
      // A block that only OMITS base lines is an excerpt quote (documentation, baseline evidence), never a desired state.
      if (changed.added.length > 0) {
        const prior = baseBlocks[covered[0]];
        const better = !prior || (() => { const p0 = scoreChange(covered[0], bases[covered[0]], prior, sc); return sc2.targetChangeLines - sc2.outOfScope.length > p0.targetChangeLines - p0.outOfScope.length; })();
        if (better) baseBlocks[covered[0]] = cand;
      }
    }
  }
  // `base` arm: the whole-file block that covers each held base IS its candidate.
  if (arm === 'base') for (const [h, body] of Object.entries(baseBlocks)) merge(scoreChange(h, bases[h], body, sc));
  const trap: SampleScore['trap'] = [];
  for (const r of (ea?.refusals ?? []) as Array<{ block: number | null; handle: string | null; name: string }>) {
    if (!['search-not-found', 'search-not-unique', 'count-mismatch'].includes(r.name) || r.block === null) continue;
    const blk = p.blocks.find((x) => x.blockIndex === r.block); if (!blk) continue;
    const s = blk.search.join('\n'); const v = r.handle ? views[r.handle] ?? '' : '';
    trap.push({ handle: r.handle, name: r.name, nearest: v.includes(s) ? 'held-view' : harvesterQuote?.includes(s.trim()) ? 'other-copy-in-prompt' : 'neither' });
  }
  const corr = ea?.correction ?? {};
  const editOps = p.blocks.filter((b) => b.section === 'edits').length;
  const state = fact?.state ?? null;
  const noChange = editOps === 0 && candFiles.length === 0 && Object.keys(baseBlocks).length === 0;
  const correct = sc.expectEdit === false ? noChange
    : change.targetChangeLines > 0 && change.outOfScope.length === 0 && change.commentLinesLost === 0 && (arm !== 'hb' || state === 'applied');
  return {
    sample: path.basename(sd), arm, state, applied: fact?.applied ?? 0, total: fact?.total ?? 0,
    correctionAttempted: !!corr.attempted, correctionAdopted: corr.attempted ? !!corr.adopted : null, refusedBefore: corr.attempted ? corr.refusedBefore ?? null : null,
    refused: fact?.refused ?? {}, editOps, candidates: candFiles.length, change, sgWin, sgRb, sgNonHeld, viewFormInCandidate, trap,
    failClosedViolation: ['partial', 'refused'].includes(state) && (candFiles.length > 0 || (Array.isArray(fact?.hashes) && fact.hashes.some((x: any) => x.candidateHash8))),
    correct, digestReproduces: postRunDigestCheck(author, fact, bases, views, r9Version, sampleEchoTokens(sd)),
  };
}

/**
 * ME-P2-5 (G3 entry, 2026-10-16): the R9 version a RUN was made at — read from that run's `manifest.json` `flags`, the env the
 * lab installed for the run (`lab.ts` run(): `process.env[k] = v` for every `exp.flags` entry) — never from the scoring shell's
 * env. `edits-score` installs no flags, so the old read scored the paid G1 runs (sanitize ON) with R9 `none`. Same predicate as
 * `r9VersionInEffect()`, applied to the run's flags. A run with no manifest or no `flags` THROWS (loud, never a silent default).
 */
export function r9VersionOfRun(runDir: string): string {
  const mf = path.join(runDir, 'manifest.json');
  if (!fs.existsSync(mf)) throw new Error(`r9VersionOfRun: no manifest.json in ${runDir} — the run's R9 setting is unknown`);
  const flags = (JSON.parse(fs.readFileSync(mf, 'utf8')) as { flags?: Record<string, string> }).flags;
  if (!flags || typeof flags !== 'object') throw new Error(`r9VersionOfRun: ${mf} records no flags — the run's R9 setting is unknown`);
  const { R9_VERSION } = require('../../lib/agents/harness/sanitize-chained-output');
  return flags.CONNECTED_OUTPUT_SANITIZE_ENABLED === 'true' ? R9_VERSION : 'none';
}

/** ME S-1: re-run the PURE applier over the sample's final text and the node's held files (base, view and its rewritten lines
 *  rebuilt by the shipping buildView); its digest must equal the stamped one. `r9Version` = the RUN's (`r9VersionOfRun`). */
export function postRunDigestCheck(author: string, fact: Record<string, any> | null, bases: Record<string, string>, views: Record<string, string>, r9Version: string, persistEchoTokens?: Iterable<string>): boolean | null {
  if (!fact || typeof fact.candidateDigest8 !== 'string') return null;
  // L-T2 crib (2026-10-21): an `unheld` stamp hashed the step's input set INCLUDING the unheld empty-path file, which has no held
  // base in the cell to rebuild it from — not checkable here (null), never a false "does not reproduce".
  if (fact.state === 'unheld') return null;
  // L-K2 1a (2026-10-19): use each held file's REAL path from the stamp — a `create` checks the new path's directory against the
  // inherited file's, so a handle-as-path stand-in refused the create on recompute (a false "does not reproduce" on k8s; obs had no creates).
  const realPath: Record<string, string> = Object.fromEntries((Array.isArray(fact.files) ? fact.files : [])
    .filter((f: any) => f && typeof f.handle === 'string' && typeof f.path === 'string').map((f: any) => [f.handle, f.path]));
  const files: HeldFileInput[] = Object.keys(bases).sort((a, b) => a.length - b.length || a.localeCompare(b)).map((h) => {
    const v = buildView(bases[h], r9Version);
    return { handle: h, path: realPath[h] ?? h, state: 'rendered', baseText: bases[h], viewText: views[h], rewrittenLines: v.ok ? v.rewrittenLines : [], redactorVersion: 'paichart.r10/3' };
  });
  return candidateSetDigest8(computeEditApplication(author, { files, r9Version, persistEchoTokens }), files) === fact.candidateDigest8;
}

/** R10-V8-RESIDUALS (b) / sec-ops batch-1 SF-3: the sample's own tool records' keyed tokens (the live step's echo source), or none
 *  when the sample stored no toolCalls.json. In memory only. */
function sampleEchoTokens(sampleDir: string): Set<string> | undefined {
  const f = path.join(sampleDir, 'toolCalls.json');
  if (!fs.existsSync(f)) return undefined;
  try { return collectR10EchoSources(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { return undefined; }
}

/** Every file under `runDir` holding the canary (prompts, outputs, held files). */
export function canaryScan(runDir: string, canary: string): string[] {
  const hits: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (fs.readFileSync(f).includes(canary)) hits.push(path.relative(runDir, f)); } };
  walk(runDir);
  return hits;
}

/** The Author's whole prompt (its user turn), for G-TRAP: a SEARCH found there but not in the held view came from another copy. */
function harvesterQuoteOf(sd: string, cellDir: string): string | null {
  const u = readIf(path.join(cellDir, 'author.user.md')) ?? readIf(path.join(sd, 'author.user.md'));
  return u;
}

/** Longest run of a held base's non-blank lines appearing IN ORDER in a block (LCS count, absolute). */
function inOrderLines(base: string, block: string): number {
  const a = nonBlank(base); const b = nonBlank(block);
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) { const cur = new Array(b.length + 1).fill(0); for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
  return prev[b.length];
}

/**
 * L-8 ARCHITECT cell scoring (pre-registered): a QUOTE is a fenced block in which ≥ 3 non-blank lines of a held base appear in
 * order (ARCH-QUOTE wants 0 on the held arm); HANDLE = the output names a held file by handle (`H<n>`), ARCH-HANDLE wants it on
 * every held-arm sample. Facts per sample; the base arm is scored the same way for contrast (it has no handles to name).
 */
export function scoreArchitect(sd: string, heldCellDir: string): { sample: string; quotes: Array<{ handle: string; lines: number }>; namesHandle: boolean } {
  const out = fs.readFileSync(path.join(sd, 'author.md'), 'utf8');
  const { bases } = heldFilesOf(heldCellDir);
  const lines = textLines(out); const quotes: Array<{ handle: string; lines: number }> = [];
  for (const b of parseFencedBlocks(out)) {
    const body = lines.slice(b.openLine, b.closeLine - 1).join('\n');
    for (const [h, base] of Object.entries(bases)) { const n = inOrderLines(base, body); if (n >= 3) quotes.push({ handle: h, lines: n }); }
  }
  return { sample: path.basename(sd), quotes, namesHandle: /\bH[1-9][0-9]{0,2}\b/.test(out) };
}

export interface G1Scores { rows: Array<{ node: string; arm: string; samples: SampleScore[]; /** L-K2 (additive): the run the row came from, so a cell split over runs (crib 1a + 1b) is looked up per run. */ run?: string }>; gates: Record<string, string>; md: string[]; arch?: Array<{ node: string; arm: string; samples: ReturnType<typeof scoreArchitect>[] }> }

/** `reading`: 'registered' (default) uses each node's pre-registered `scoring`; 'corrected' uses `scoringCorrected` where a node
 *  carries one (a POST-HOC correction with its stated reason, reported BESIDE the registered reading, never instead of it). */
export function scoreG1Run(runDirs: string[], exp: { nodes: Array<{ id: string; scoring?: NodeScoring; scoringCorrected?: NodeScoring & { reason: string }; architectOnly?: boolean }> }, reading: 'registered' | 'corrected' = 'registered'): G1Scores {
  const scoringOf = (nd: { scoring?: NodeScoring; scoringCorrected?: NodeScoring }) => (reading === 'corrected' && nd.scoringCorrected ? nd.scoringCorrected : nd.scoring) ?? {};
  const rows: G1Scores['rows'] = [];
  const arch: Array<{ node: string; arm: string; samples: ReturnType<typeof scoreArchitect>[] }> = [];
  for (const runDir of runDirs) for (const nd of exp.nodes) {
    const nodeDir = path.join(runDir, nd.id);
    if (!fs.existsSync(nodeDir)) continue;
    if (nd.architectOnly) {
      for (const arm of fs.readdirSync(nodeDir).filter((d) => fs.statSync(path.join(nodeDir, d)).isDirectory())) {
        const cell = path.join(nodeDir, arm); const heldCell = fs.readdirSync(nodeDir).map((d) => path.join(nodeDir, d)).find((d) => fs.existsSync(d) && fs.statSync(d).isDirectory() && fs.readdirSync(d).some((f) => /^held-base-/.test(f))) ?? cell;
        const samples = fs.readdirSync(cell).filter((d) => /^sample-\d+$/.test(d) && fs.existsSync(path.join(cell, d, 'author.md'))).map((d) => scoreArchitect(path.join(cell, d), heldCell));
        if (samples.length) arch.push({ node: nd.id, arm, samples });
      }
      continue;
    }
    for (const arm of fs.readdirSync(nodeDir).filter((d) => fs.statSync(path.join(nodeDir, d)).isDirectory())) {
      const cell = path.join(nodeDir, arm);
      // The node's held files live in its `hb` cell — possibly in ANOTHER of the scored run directories (the base arm ran in its
      // own invocation). A node with no held files anywhere is scored with none (and says so through SG-NONHELD).
      const heldCell = runDirs.map((rd) => path.join(rd, nd.id, 'hb')).find((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => /^held-base-H\d+\.txt$/.test(f))) ?? cell;
      const samples = fs.readdirSync(cell).filter((d) => /^sample-\d+$/.test(d) && fs.existsSync(path.join(cell, d, 'author.md')))
        .map((d) => scoreSample(path.join(cell, d), cell, arm, scoringOf(nd), harvesterQuoteOf(path.join(cell, d), cell), heldCell, r9VersionOfRun(runDir)));
      if (samples.length) rows.push({ node: nd.id, arm, samples, run: runDir });
    }
  }
  const names = (xs: SampleScore[], f: (s: SampleScore) => boolean) => xs.filter(f).map((s) => s.sample);
  const cell = (node: string, arm: string) => rows.filter((r) => r.node === node && r.arm === arm).flatMap((r) => r.samples);
  const targets = exp.nodes.filter((n) => n.scoring?.target).map((n) => n.id);
  const hbT = targets.flatMap((n) => cell(n, 'hb'));
  const gates: Record<string, string> = {};
  gates['G-APPLY (≥ 23/25 applied after ≤ 1 correction)'] = `${hbT.filter((s) => s.state === 'applied').length}/${hbT.length} · pre-correction ${hbT.filter((s) => s.state === 'applied' && !s.correctionAdopted).length}/${hbT.length}`;
  gates['G-SCOPE (0 out-of-scope lines, hb)'] = `${rows.filter((r) => r.arm === 'hb').flatMap((r) => r.samples).filter((s) => s.change.outOfScope.length).length} sample(s)`;
  gates['post-run digest check (every stamped sample reproduces)'] = `${rows.flatMap((r) => r.samples).filter((x) => x.digestReproduces === true).length}/${rows.flatMap((r) => r.samples).filter((x) => x.digestReproduces !== null).length}`;
  gates['G-FAILCLOSED (0)'] = `${rows.flatMap((r) => r.samples).filter((s) => s.failClosedViolation).length}`;
  const sg = hbT.filter((s) => s.sgWin.length);
  gates['SG-WIN (≥ 3/25 or ≥ 2/5 on a node ⇒ G3.2 fallback)'] = `${sg.length}/${hbT.length}${targets.map((n) => `; ${n} ${cell(n, 'hb').filter((s) => s.sgWin.length).length}/${cell(n, 'hb').length}`).join('')}`;
  const shared = exp.nodes.filter((n) => cell(n.id, 'base').length && cell(n.id, 'hb').length).map((n) => n.id);
  const ok = (arm: string) => shared.reduce((a, n) => a + cell(n, arm).filter((s) => s.correct).length, 0);
  gates['G-NOWORSE (hb correct ≥ base correct, shared nodes)'] = `hb ${ok('hb')} vs base ${ok('base')} on ${shared.join(',') || '—'}`;
  const xh = arch.filter((r) => r.arm.endsWith('hb')).flatMap((r) => r.samples);
  if (arch.length) {
    gates['ARCH-QUOTE (0 held-file quotes in ≥ 18/20, held arm)'] = `${xh.filter((x) => x.quotes.length === 0).length}/${xh.length}`;
    gates['ARCH-HANDLE (names a held file by handle, held arm)'] = `${xh.filter((x) => x.namesHandle).length}/${xh.length}`;
  }
  const md = [`# G1 edit scores (L-5) — ${reading === 'corrected' ? 'CORRECTED reading (post-hoc scoringCorrected where a node carries one — see experiment.json reasons)' : 'REGISTERED reading'} — facts per sample; each count names its samples (READ them)`, '',
    '| node | arm | n | applied | correct | out-of-scope | comments lost | SG-WIN | SG-RB | SG-NONHELD | view form in candidate | fail-closed violation | correction (attempted/adopted) | refused | trap nearest |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const s = r.samples; const refused: Record<string, number> = {};
    for (const x of s) for (const [k, v] of Object.entries(x.refused)) refused[k] = (refused[k] ?? 0) + (v as number);
    const trap: Record<string, number> = {}; for (const x of s) for (const t of x.trap) trap[t.nearest] = (trap[t.nearest] ?? 0) + 1;
    md.push(`| ${r.node} | ${r.arm} | ${s.length} | ${names(s, (x) => x.state === 'applied').length} | ${names(s, (x) => x.correct).length} | ${names(s, (x) => x.change.outOfScope.length > 0).join(' ') || 0} | ${s.reduce((a, x) => a + x.change.commentLinesLost, 0)} | ${names(s, (x) => x.sgWin.length > 0).join(' ') || 0} | ${s.reduce((a, x) => a + x.sgRb, 0)} | ${s.reduce((a, x) => a + x.sgNonHeld, 0)} | ${s.reduce((a, x) => a + x.viewFormInCandidate, 0)} | ${names(s, (x) => x.failClosedViolation).join(' ') || 0} | ${names(s, (x) => x.correctionAttempted).length}/${names(s, (x) => !!x.correctionAdopted).length} | ${Object.entries(refused).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} | ${Object.entries(trap).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} |`);
  }
  if (arch.length) {
    md.push('', '## Architect cells (L-8)', '', '| node | arm | n | samples quoting a held file (≥ 3 lines in order) | samples naming a handle |', '|---|---|---|---|---|');
    for (const r of arch) md.push(`| ${r.node} | ${r.arm} | ${r.samples.length} | ${r.samples.filter((x) => x.quotes.length).map((x) => x.sample).join(' ') || 0} | ${r.samples.filter((x) => x.namesHandle).length} |`);
  }
  md.push('', '## Gate inputs (arithmetic only — the decision is in the pre-registration)', '', ...Object.entries(gates).map(([k, v]) => `- **${k}**: ${v}`));
  return { rows, gates, md, arch } as G1Scores;
}
