/**
 * Leg replay lab — REQUIREMENTS SCORER (L-R4 + L-R5, 2026-10-09). $0: no model call, no database (snapshots are cached).
 *
 *   npm run lab:leg-replay -- score-self-test --experiment <dir>      # reproduce stage A on the 9 persisted trial drafts
 *   npm run lab:leg-replay -- score --run <runDir> --experiment <dir>  # score every saved requirements sample + the gates
 *   npm run lab:leg-replay -- blind --run <runDir> --out <dir>         # arm-blind copies for the hand read (key kept in runDir)
 *
 * ONE SCORER, THE SHIPPING ONE. Every mechanical count is the TypeScript port the platform runs in-run
 * (`computeRequirementsFormCheckStamp`: program-view size, coverage with the stage-A (b) registry exclusion, citations
 * incl. the item-N-exists check, the owner-map dropped-clause check, the harvested-state lint with the declared-synthetic
 * exemption, template residue). The corpus PARITY test holds it to the Python operator scripts; the lab defines no
 * check of its own. The objective is the node's harness task description (what the in-run check reads), and the owner
 * map is the node's `ownerRowItemMap` file (what the skill will carry in `metadata.requirementsRowItemMap`).
 *
 * L-R5 — THE PUBLISHED FILE IS NOT THE AUTHOR TEXT. The publish pass splices the harness `report.md`. The size conjunct
 * of "publishable" therefore asks `programViewDelivered + SIZE_ALLOWANCE_CHARS <= limit`. The review (A2) estimated
 * +404…+702 RAW chars and proposed 1,000; the self-test measures the real delta in the DELIVERED program view on every
 * committed trial report.md: +0 on the 4 APPROVED gens, +296 on the 5 refused ones (the harness's "NOT RELEASED"
 * banner). A primary-passing sample is approved, so its expected delta is 0; 500 covers the banner plus margin for a
 * future harness addition. Set BEFORE any spend (2026-10-09), from that measurement. The in-run size check (no
 * allowance) is reported beside it, never instead of it.
 *
 * Protocol 10: the scorer reports COUNTS and the pre-registered conjunctions over them. `publishable` here is the
 * experiment's pre-registered reading, not a platform fact (PORT-NOTE §5 deliberately ships no such field).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import { loadSnapshot, utc, type Snapshot } from './snapshot';
import { parsedResult } from './rebuild';
import { snapshotWithInputEdits } from './input-edits';
import { useCheckDataAt } from './check-at';
import { PER_FILE_MAX } from '../../lib/agents/harness/requirements-size-lint';
import {
  computeRequirementsFormCheckStamp, decideRequirementsFormCorrection, estimateRequirementsCorrectionTime,
  failingTriggerChecks, requirementsInputsFromHarnessRow, parseOwnerRowItemMap, OWNER_ROW_ITEM_MAP_KEY,
  type RequirementsFormInputs,
} from '../../lib/agents/harness/requirements-form-correction';

export const SIZE_ALLOWANCE_CHARS = 500;
const REPO = path.resolve(__dirname, '..', '..');

// ───────────────────────────── inputs ─────────────────────────────

export function readOwnerMap(dir: string, file: string | null | undefined): Record<string, unknown> | null {
  if (!file) return null;
  const v = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const p = parseOwnerRowItemMap(v);
  if (p.state !== 'present') throw new Error(`owner map ${file}: ${p.state}${p.detail ? ` (${p.detail})` : ''} — the in-run check would ignore it`);
  return v;
}

/** The harness row the in-run check reads, with the node's owner map placed where the skill will write it. A COPY:
 *  the snapshot (and so every rebuilt prompt) is untouched — the map never reaches the Author's input. */
export function harnessRowWithOwnerMap(snap: Snapshot, ownerMap: Record<string, unknown> | null): Record<string, any> | null {
  if (!snap.leg) return null;
  if (!ownerMap) return snap.leg;
  const meta = (snap.leg.metadata && typeof snap.leg.metadata === 'object') ? snap.leg.metadata : {};
  return { ...snap.leg, metadata: { ...meta, [OWNER_ROW_ITEM_MAP_KEY]: ownerMap } };
}

export function nodeInputs(snap: Snapshot, ownerMap: Record<string, unknown> | null): RequirementsFormInputs {
  return requirementsInputsFromHarnessRow(harnessRowWithOwnerMap(snap, ownerMap));
}

// ───────────────────────────── one text ─────────────────────────────

export interface TextScore {
  checked: boolean;
  itemMapSource: string | null;
  view: number | null;
  limit: number | null;
  coverage: number | null;
  coverageAuthorActionable: number | null;
  coverageRegistryCaused: number | null;
  citations: number | null;
  clausesDropped: number | null;
  clausesChecked: number | null;
  droppedItems: number[];
  lint: number | null;
  residue: { placeholders: number; deleteMarks: number; authorAddressed: number } | null;
  failing: string[];
  /** All in-run trigger checks pass (the 2b trigger set: coverage = author-actionable, residue = `{{` and 🗑 only). */
  mechanicalPass: boolean;
  /** The in-run size check plus the L-R5 allowance for the harness report.md. */
  sizeWithAllowance: boolean;
  /** PORT-NOTE §5's conjunct with coverage.errorsTotal (registry-caused findings INCLUDED) — secondary, reported only. */
  strictConjunct: boolean;
  formFailures: { citations: number; placeholders: number; deleteMarks: number };
}

export function scoreText(text: string, inputs: RequirementsFormInputs): TextScore {
  const f: any = computeRequirementsFormCheckStamp({ text, stopReason: 'end_turn', textSource: 'loop', inputs });
  const failing = f.checked ? failingTriggerChecks(f) : ['not-checked'];
  const view = f.size?.programViewDelivered ?? null;
  const limit = f.size?.limit ?? null;
  const sizeWithAllowance = view !== null && limit !== null && view + SIZE_ALLOWANCE_CHARS <= limit;
  const mechanicalPass = !!f.checked && failing.length === 0;
  return {
    checked: !!f.checked, itemMapSource: f.clauses?.itemMapSource ?? null, view, limit,
    coverage: f.coverage?.errorsTotal ?? null, coverageAuthorActionable: f.coverage?.authorActionableTotal ?? null,
    coverageRegistryCaused: f.coverage ? f.coverage.errorsTotal - f.coverage.authorActionableTotal : null,
    citations: f.citations?.findingsTotal ?? null,
    clausesDropped: f.clauses?.droppedTotal ?? null, clausesChecked: f.clauses?.checked ?? null,
    droppedItems: (f.clauses?.dropped ?? []).map((d: any) => d.item),
    lint: f.lint?.hitsTotal ?? null,
    residue: f.residue ? { placeholders: f.residue.placeholders, deleteMarks: f.residue.deleteMarks, authorAddressed: f.residue.authorAddressed } : null,
    failing, mechanicalPass, sizeWithAllowance,
    strictConjunct: mechanicalPass && (f.coverage?.errorsTotal ?? 1) === 0,
    formFailures: { citations: f.citations?.findingsTotal ?? 0, placeholders: f.residue?.placeholders ?? 0, deleteMarks: f.residue?.deleteMarks ?? 0 },
  };
}

// ───────────────────────────── self-test (stage A) ─────────────────────────────

interface SelfTestGen { gen: number; authorExecutionId: string; ownerMap: boolean; reportDir?: string;
  expect: { served: string; view: number; coverage: number; citations: number; clauses: string; lint: number; residue: string; failing: string[]; turn: boolean } }

export function scoreSelfTest(expDir: string): { mismatches: string[]; rows: string[]; reportDeltas: Array<{ gen: number; authorView: number; reportView: number; delta: number }> } {
  const cfg = JSON.parse(fs.readFileSync(path.join(expDir, 'scorer-self-test.json'), 'utf8'));
  // L-Z2 (2026-10-10): the trial drafts were written, and stage A was computed, under the check data of their day — a
  // later registry row (Z49 request-path) adds a finding to every one of them by construction. `checkAt` pins that data.
  useCheckDataAt(cfg.checkAt ?? null);
  try { return scoreSelfTestUnder(expDir, cfg); } finally { useCheckDataAt(null); }
}

/** Is `commit` in this tree's history? (0 = yes, 1 = no; anything else — an unknown commit — fails loud.) */
function inHistory(commit: string): boolean {
  try { execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: REPO, stdio: 'pipe' }); return true; }
  catch (e) { if ((e as any).status === 1) return false; throw new Error(`movedBy commit ${commit} is not resolvable in ${REPO}: ${(e as Error).message}`); }
}

/** Stage A's `expect` is the historical record and is never edited. A shipped CODE change that moves a value by
 *  construction (check DATA is pinned by `checkAt`; code is not) is a `movedBy` entry — commit, reason, new values per
 *  gen — applied in order when its commit is in this tree's history. So one file reads right in every tree the lab runs
 *  from (the g4 lab's base tree at production code, its g4 tree at the local build), and an unexplained move stays a
 *  mismatch. Added 2026-10-12 (group 4 lab P0).
 *  `whenSizeLimit` (2026-10-12, R1 size-check half) is the alternative key for a move caused by the checked size LIMIT:
 *  it applies when this tree's PER_FILE_MAX equals it. The limit is one constant, so its value names the code state
 *  exactly — and the commit that changes it cannot name itself. An entry carries exactly one of the two keys. */
export function selfTestExpect(cfg: any, gen: number, base: Record<string, unknown>): { expect: Record<string, unknown>; applied: string[] } {
  const expect = { ...base }; const applied: string[] = [];
  for (const m of cfg.movedBy ?? []) {
    const mv = m.gens?.[String(gen)];
    if (!mv) continue;
    if ((m.commit === undefined) === (m.whenSizeLimit === undefined)) throw new Error(`movedBy entry needs exactly one of commit / whenSizeLimit: ${JSON.stringify(m.what ?? m)}`);
    if (m.commit !== undefined ? !inHistory(m.commit) : PER_FILE_MAX !== m.whenSizeLimit) continue;
    Object.assign(expect, mv); applied.push(m.commit !== undefined ? String(m.commit).slice(0, 8) : `size limit ${m.whenSizeLimit}`);
  }
  return { expect, applied };
}

function scoreSelfTestUnder(expDir: string, cfg: any): { mismatches: string[]; rows: string[]; reportDeltas: Array<{ gen: number; authorView: number; reportView: number; delta: number }> } {
  const ownerMap = readOwnerMap(expDir, cfg.ownerMap);
  const mismatches: string[] = [];
  const rows: string[] = [];
  const reportDeltas: Array<{ gen: number; authorView: number; reportView: number; delta: number }> = [];
  for (const g of cfg.gens as SelfTestGen[]) {
    const snap = loadSnapshot(g.authorExecutionId);
    const ares = parsedResult(snap.author)!;
    const inputs = nodeInputs(snap, g.ownerMap ? ownerMap : null);
    const s = scoreText(ares.finalResponse, inputs);
    // The stage-A decision: flag ON, the R4 time rule on the execution's own duration and output tokens.
    const durMs = utc(snap.author.exec.endTime).getTime() - utc(snap.author.exec.startTime).getTime();
    const out = snap.author.exec.outputTokens ?? 0;
    const fact: any = computeRequirementsFormCheckStamp({ text: ares.finalResponse, stopReason: 'end_turn', textSource: 'loop', inputs });
    const d = decideRequirementsFormCorrection({ fact, correctionTurnUsed: false, budgetFlagged: false, enabled: true, objectiveResolved: inputs.objectiveResolved,
      time: () => estimateRequirementsCorrectionTime({ deadlineAt: cfg.watchdogMs, now: durMs, loopStartedAt: 0, draftChars: ares.finalResponse.length, lastTurnOutputTokens: out, totalOutputTokens: out }) });
    const got = {
      served: snap.author.exec.modelUsed, view: s.view, coverage: s.coverage, citations: s.citations,
      clauses: `${s.clausesDropped}/${s.clausesChecked}`, lint: s.lint,
      residue: s.residue ? `${s.residue.placeholders}/${s.residue.deleteMarks}/${s.residue.authorAddressed}` : null,
      failing: s.failing, turn: d.attempted,
    };
    const ex = selfTestExpect(cfg, g.gen, g.expect);
    for (const [k, v] of Object.entries(ex.expect)) {
      if (JSON.stringify((got as any)[k]) !== JSON.stringify(v)) mismatches.push(`gen ${g.gen} ${k}: expected ${JSON.stringify(v)}${ex.applied.length ? ` (stage A moved by ${ex.applied.join(', ')})` : ''}, scorer ${JSON.stringify((got as any)[k])}`);
    }
    if (g.ownerMap && s.itemMapSource !== 'owner-map') mismatches.push(`gen ${g.gen}: itemMapSource ${s.itemMapSource} (the owner map did not reach the check)`);
    // L-R5: the committed harness report.md, scored the same way, against the Author text.
    if (g.reportDir && cfg.trialDir) {
      const rp = path.join(REPO, cfg.trialDir, g.reportDir, 'report.md');
      if (fs.existsSync(rp)) {
        const r = scoreText(fs.readFileSync(rp, 'utf8'), inputs);
        if (r.view !== null && s.view !== null) reportDeltas.push({ gen: g.gen, authorView: s.view, reportView: r.view, delta: r.view - s.view });
      }
    }
    rows.push(`| ${g.gen} | ${got.served} | ${got.view} | ${got.coverage} (${s.coverageRegistryCaused} registry) | ${got.citations} | ${got.clauses} | ${got.lint} | ${got.residue} | ${got.failing.join(',') || 'none'} | ${got.turn ? 'yes' : `no (${d.notAttemptedReason})`} |`);
  }
  return { mismatches, rows, reportDeltas };
}

// ───────────────────────────── a run ─────────────────────────────

export interface SampleScore {
  node: string; variant: string; sample: string;
  error: string | null;
  approved: boolean | null;
  score: TextScore | null;
  /** The pre-registered PRIMARY: release-true (Reviewer approved) AND publishable (every in-run trigger check passes
   *  AND the size fits with the L-R5 allowance) — in ONE run. */
  primary: boolean;
  correction: { attempted: boolean; notAttemptedReason: string | null; adopted: boolean | null; notAdoptedReason: string | null;
    failingBefore: string[]; improved: string[]; regressed: string[]; durationMs: number | null; outputTokens: number | null } | null;
  /** The scorer's recount equals the stamp the live step wrote (a lab consistency control; null when no stamp). */
  stampAgrees: boolean | null;
  servedFallbackCalls: number;
  maxTokensStops: number;
  authorMaxCallOutputTokens: number;
  authorCostUsd: number; reviewerCostUsd: number; correctionCostUsd: number;
  authorDurationMs: number | null;
}

export function scoreSample(sampleDir: string, inputs: RequirementsFormInputs, requestedAuthorModel: string | null): SampleScore {
  const s = JSON.parse(fs.readFileSync(path.join(sampleDir, 'sample.json'), 'utf8'));
  const base: SampleScore = {
    node: s.node, variant: s.variant, sample: path.basename(sampleDir), error: s.error ?? null, approved: s.verdict?.approved ?? null,
    score: null, primary: false, correction: null, stampAgrees: null, servedFallbackCalls: 0, maxTokensStops: 0,
    authorMaxCallOutputTokens: 0, authorCostUsd: 0, reviewerCostUsd: 0, correctionCostUsd: 0, authorDurationMs: s.author?.durationMs ?? null,
  };
  const ap = path.join(sampleDir, 'author.md');
  if (s.error || !fs.existsSync(ap)) return base;
  const text = fs.readFileSync(ap, 'utf8');
  const score = scoreText(text, inputs);
  const calls: any[] = s.calls ?? [];
  const aCalls = calls.filter((c) => c.role === 'author');
  const stamp = s.author?.requirementsFormCheck ?? null;
  const c = stamp?.correction ?? null;
  const pick = (f: any) => f ? JSON.stringify([f.size?.programViewDelivered, f.coverage?.errorsTotal, f.coverage?.authorActionableTotal, f.citations?.findingsTotal, f.clauses?.droppedTotal, f.clauses?.itemMapSource, f.lint?.hitsTotal, f.residue?.placeholders, f.residue?.deleteMarks, f.residue?.authorAddressed]) : null;
  const recount: any = computeRequirementsFormCheckStamp({ text, stopReason: 'end_turn', textSource: 'loop', inputs });
  return {
    ...base, score,
    primary: s.verdict?.approved === true && score.mechanicalPass && score.sizeWithAllowance,
    correction: c ? {
      attempted: !!c.attempted, notAttemptedReason: c.notAttemptedReason ?? null, adopted: c.attempted ? !!c.adopted : null,
      notAdoptedReason: c.notAdoptedReason ?? null, failingBefore: c.failingChecks ?? [], improved: c.improvedChecks ?? [],
      regressed: c.regressedMeasures ?? [], durationMs: c.durationMs ?? null, outputTokens: c.outputTokens ?? null,
    } : null,
    stampAgrees: stamp ? pick(stamp) === pick(recount) : null,
    servedFallbackCalls: requestedAuthorModel ? aCalls.filter((x) => x.model && x.model !== requestedAuthorModel).length : 0,
    maxTokensStops: calls.filter((x) => x.stopReason === 'max_tokens').length,
    authorMaxCallOutputTokens: aCalls.reduce((m, x) => Math.max(m, x.outputTokens ?? 0), 0),
    authorCostUsd: aCalls.reduce((n, x) => n + (x.costUsd ?? 0), 0),
    reviewerCostUsd: calls.filter((x) => x.role === 'reviewer').reduce((n, x) => n + (x.costUsd ?? 0), 0),
    correctionCostUsd: aCalls.filter((x) => x.purpose === 'requirements-form-correction').reduce((n, x) => n + (x.costUsd ?? 0), 0),
  };
}

const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };

export function scoreRun(runDir: string, expDir: string) {
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
  const exp = JSON.parse(fs.readFileSync(path.join(expDir, 'experiment.json'), 'utf8'));
  const all: SampleScore[] = [];
  for (const node of Object.keys(manifest.nodes)) {
    const nd = exp.nodes.find((x: any) => x.id === node);
    if (!nd) throw new Error(`${node}: not in ${expDir}/experiment.json`);
    // L-Z1: the node's input edits (the objective of record) apply to the scorer exactly as to the run.
    const snap = snapshotWithInputEdits(expDir, nd, loadSnapshot(nd.authorExecutionId)).snap;
    const inputs = nodeInputs(snap, readOwnerMap(expDir, nd.ownerRowItemMap));
    const ndir = path.join(runDir, node);
    for (const v of fs.readdirSync(ndir).filter((d) => fs.statSync(path.join(ndir, d)).isDirectory())) {
      const requested = manifest.nodes[node].variants?.[v]?.models?.author ?? null;
      // L-Z2: score each arm under the check data it ran (scoring is synchronous, so the swap is exact).
      useCheckDataAt(exp.variants?.[v]?.requirementsCheckAt ?? null);
      try {
        for (const sd of fs.readdirSync(path.join(ndir, v)).filter((d) => d.startsWith('sample-'))) all.push(scoreSample(path.join(ndir, v, sd), inputs, requested));
      } finally { useCheckDataAt(null); }
    }
  }
  // Per cell.
  const cells: Record<string, any> = {};
  for (const s of all) {
    const k = `${s.node}|${s.variant}`;
    (cells[k] = cells[k] ?? { node: s.node, variant: s.variant, samples: [] as SampleScore[] }).samples.push(s);
  }
  const cellRows = Object.values(cells).map((c: any) => {
    const ok: SampleScore[] = c.samples.filter((x: SampleScore) => !x.error && x.score);
    const att = ok.filter((x) => x.correction?.attempted);
    const fails: Record<string, number> = {};
    for (const x of ok) for (const f of x.score!.failing) fails[f] = (fails[f] ?? 0) + 1;
    const drops: Record<string, number> = {};
    for (const x of ok) for (const i of new Set(x.score!.droppedItems)) drops[i] = (drops[i] ?? 0) + 1;
    const nar: Record<string, number> = {};
    for (const x of ok) { const r = x.correction ? (x.correction.attempted ? (x.correction.adopted ? 'adopted' : `rejected:${x.correction.notAdoptedReason}`) : `not-attempted:${x.correction.notAttemptedReason}`) : 'no-stamp'; nar[r] = (nar[r] ?? 0) + 1; }
    return {
      node: c.node, variant: c.variant, n: c.samples.length, errors: c.samples.length - ok.length,
      primary: ok.filter((x) => x.primary).length, approved: ok.filter((x) => x.approved === true).length,
      mechanicalPass: ok.filter((x) => x.score!.mechanicalPass).length, sizeWithAllowance: ok.filter((x) => x.score!.sizeWithAllowance).length,
      strictConjunct: ok.filter((x) => x.score!.strictConjunct).length,
      viewMedian: med(ok.map((x) => x.score!.view ?? 0)), viewMax: ok.reduce((m, x) => Math.max(m, x.score!.view ?? 0), 0),
      failing: fails, droppedItems: drops, clausesDroppedPerSample: ok.map((x) => x.score!.clausesDropped ?? 0),
      formFailureSamples: ok.filter((x) => x.score!.formFailures.citations + x.score!.formFailures.placeholders + x.score!.formFailures.deleteMarks > 0).length,
      registryCausedCoverage: ok.reduce((n, x) => n + (x.score!.coverageRegistryCaused ?? 0), 0),
      correction: { attempted: att.length, adopted: att.filter((x) => x.correction!.adopted).length, outcomes: nar,
        durationMaxMs: att.reduce((m, x) => Math.max(m, x.correction!.durationMs ?? 0), 0),
        costMeanUsd: att.length ? att.reduce((n, x) => n + x.correctionCostUsd, 0) / att.length : 0 },
      authorDurationMaxMs: ok.reduce((m, x) => Math.max(m, x.authorDurationMs ?? 0), 0),
      stampDisagreements: ok.filter((x) => x.stampAgrees === false).map((x) => x.sample),
      servedFallbackCalls: ok.reduce((n, x) => n + x.servedFallbackCalls, 0), maxTokensStops: ok.reduce((n, x) => n + x.maxTokensStops, 0),
      authorMaxCallOutputTokens: ok.reduce((m, x) => Math.max(m, x.authorMaxCallOutputTokens), 0),
      costMeanUsd: ok.length ? ok.reduce((n, x) => n + x.authorCostUsd + x.reviewerCostUsd, 0) / ok.length : 0,
    };
  });
  fs.writeFileSync(path.join(runDir, 'requirements-scores.json'), JSON.stringify({ sizeAllowanceChars: SIZE_ALLOWANCE_CHARS, samples: all, cells: cellRows }, null, 2));
  const md = [
    `# Requirements scores — ${manifest.label}`, '',
    `Scorer: the shipping TS port (computeRequirementsFormCheckStamp). primary = Reviewer approved AND every in-run trigger check passes AND view + ${SIZE_ALLOWANCE_CHARS} ≤ limit (L-R5). Gates are read against experiment.json \`purpose\`; the blind hand read (G-B/C) is NOT here.`, '',
    '| node | variant | primary / n | approved | mech pass | size+allow | strict | view med / max | failing checks | dropped items (samples) | form-fail samples | registry cov Σ | correction att / adopted · outcomes | corr max s | corr $ mean | author max s | fallback calls | max_tokens | max call out | $ mean | stamp ≠ recount |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...cellRows.map((r) => `| ${r.node} | ${r.variant} | **${r.primary} / ${r.n - r.errors}**${r.errors ? ` (+${r.errors} err)` : ''} | ${r.approved} | ${r.mechanicalPass} | ${r.sizeWithAllowance} | ${r.strictConjunct} | ${r.viewMedian} / ${r.viewMax} | ${Object.entries(r.failing).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} | ${Object.entries(r.droppedItems).map(([k, v]) => `${k}:${v}`).join(' ') || '—'} | ${r.formFailureSamples} | ${r.registryCausedCoverage} | ${r.correction.attempted} / ${r.correction.adopted} · ${Object.entries(r.correction.outcomes).map(([k, v]) => `${k} ${v}`).join(', ')} | ${Math.round(r.correction.durationMaxMs / 1000)} | ${r.correction.costMeanUsd.toFixed(2)} | ${Math.round(r.authorDurationMaxMs / 1000)} | ${r.servedFallbackCalls} | ${r.maxTokensStops} | ${r.authorMaxCallOutputTokens} | ${r.costMeanUsd.toFixed(2)} | ${r.stampDisagreements.join(' ') || '—'} |`),
  ];
  fs.writeFileSync(path.join(runDir, 'requirements-scores.md'), md.join('\n') + '\n');
  return { samples: all, cells: cellRows, md };
}

// ───────────────────────────── blind copies (A6) ─────────────────────────────

/** Arm-blind copies of every sample's final Author text for the hand read. The KEY is written into the run dir (never
 *  the blind dir); the reader gets only `<out>/<code>/author.md`. Pre-correction drafts and correction messages are NOT
 *  copied — they would reveal the loop arm; the diff read of adopted corrections is a separate, unblinded read. */
export function blindCopies(runDir: string, outDir: string) {
  const key: Record<string, string> = {};
  fs.mkdirSync(outDir, { recursive: true });
  const entries: string[] = [];
  for (const node of fs.readdirSync(runDir).filter((d) => fs.statSync(path.join(runDir, d)).isDirectory())) {
    for (const v of fs.readdirSync(path.join(runDir, node)).filter((d) => fs.statSync(path.join(runDir, node, d)).isDirectory())) {
      for (const sd of fs.readdirSync(path.join(runDir, node, v)).filter((d) => d.startsWith('sample-'))) {
        const ap = path.join(runDir, node, v, sd, 'author.md');
        if (fs.existsSync(ap)) entries.push(ap);
      }
    }
  }
  // Shuffle so directory order reveals nothing either.
  for (const ap of entries.map((e) => ({ e, r: crypto.randomBytes(8).toString('hex') })).sort((a, b) => a.r.localeCompare(b.r)).map((x) => x.e)) {
    const code = crypto.randomBytes(4).toString('hex');
    const rel = path.relative(runDir, path.dirname(ap));
    key[code] = rel;
    fs.mkdirSync(path.join(outDir, code), { recursive: true });
    // Node id stays visible on purpose: the reader scores against that node's objective (A6 reads per node).
    fs.writeFileSync(path.join(outDir, code, 'node.txt'), rel.split(path.sep)[0] + '\n');
    fs.copyFileSync(ap, path.join(outDir, code, 'author.md'));
  }
  fs.writeFileSync(path.join(runDir, 'blind-key.json'), JSON.stringify(key, null, 2));
  return Object.keys(key).length;
}
