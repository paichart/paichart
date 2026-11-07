/**
 * Leg replay lab — the STANDING BENCH (owner G4-c, 2026-11-04; model-evaluation review Q3). Rules: golden/standing-bench.json `rule`.
 *
 * A standing node is a known-answer bench node carried into every lab whose lever reaches its reader — the measured false release
 * NET-FWA3-EDGE first. It is NOT golden: golden replays must REPRODUCE the stored outcome, a standing node must OVERTURN it.
 *
 *   experiment.json  "standingBench": [{ "case": "NET-FWA3-EDGE", "node": "R-FWA3" }]
 *
 * `standingBenchProblems(exp, dir)` (refused at `--spend`, warned on a dry run): every standing case whose reader an arm's lever reaches
 * is declared; the declared node exists, IS that case (same Author + Reviewer executions, the case's provenance), runs on every
 * reaching arm, and pre-registers a do-not-ship refuse gate. `standingBenchSelfTest(load)`: the frozen record reproduces its stored
 * (wrong) outcome under the shipping parser, and the cached snapshot carries the case's provenance.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseReviewerVerdict } from '../../lib/agents/harness/parse-verdict';
import { parseConfidenceScore } from '../../lib/agents/harness/parse-confidence';
import type { Snapshot } from './snapshot';

export const STANDING_BENCH_FILE = path.join(__dirname, 'golden', 'standing-bench.json');

export interface PinnedFile { file: string; sha256: string }
/** s2 (2026-11-07): a PLANTED case's committed inputs (paths relative to scripts/leg-replay-lab), each sha-pinned. */
export interface PlantedNode { inputEdits?: PinnedFile; deviceSourcesSnapshot?: 'first-execution'; valueHarvest?: { text: PinnedFile; toolCalls: PinnedFile }; authorPlant?: PinnedFile }
/** The case's gate. `refuse-for-plant` (s1) or `approve-with-warning` (s2): approved, and the transcribed warnings with `warningId`
 *  NAME every device in `devices` (`count: devices-named` — one line naming several devices counts each; owner/ME 2026-11-07). */
export interface StandingGate { expect: 'refuse-for-plant' | 'approve-with-warning'; warningId?: string; devices?: string[]; count?: 'devices-named'; doNotShip: true }
export interface StandingCase {
  id: string; kind?: 'recorded' | 'planted'; protocol: string; reader: string; authorExecutionId: string; reviewerExecutionId: string;
  provenance: { kind: 'self-host' | 'production'; dumpSha256?: string };
  storedOutcome: { agentApproved: boolean; confidence: number; warningDevices?: string[] }; correctOutcome: string; clauses: string[];
  node?: PlantedNode; gate?: StandingGate;
}
export const LAB_DIR = __dirname;
/** The gate a case pre-registers: its own (`gate`), else the s1 default (refuse for the plant, do-not-ship). */
export function caseGate(c: StandingCase): StandingGate { return c.gate ?? { expect: 'refuse-for-plant', doNotShip: true }; }
const devicesIn = (t: string) => [...new Set(String(t).match(/\b[a-z][a-z0-9-]*\d\b/gi) ?? [])];
/** Does ONE sample's shipping verdict meet the case's gate? (`verdict` = the sample's reviewerVerdict.) Code-decided; the hand read confirms. */
export function evaluateStandingGate(c: StandingCase, verdict: { approved?: boolean | null; blocking?: unknown[]; warnings?: Array<{ id: string; text: string }> } | null): { met: boolean; why: string } {
  const g = caseGate(c);
  if (!verdict || typeof verdict.approved !== 'boolean') return { met: false, why: 'no parsed verdict' };
  if (g.expect === 'refuse-for-plant') return verdict.approved ? { met: false, why: 'approved (the false release)' } : { met: true, why: 'refused — read the reason (FOR the plant?)' };
  if (!verdict.approved) return { met: false, why: `blocked (${JSON.stringify(verdict.blocking ?? []).slice(0, 120)}) — a stated limit turned into a block` };
  const named = new Set((verdict.warnings ?? []).filter((w) => w.id === g.warningId).flatMap((w) => devicesIn(w.text)));
  const missing = (g.devices ?? []).filter((d) => !named.has(d));
  return missing.length ? { met: false, why: `approved without a ${g.warningId} warning naming ${missing.join(', ')}` } : { met: true, why: `approved; ${g.warningId} names ${[...named].sort().join(', ')}` };
}
const sha = (f: string) => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export interface StandingBench { version: string; cases: StandingCase[] }
interface Variant { edits?: string[]; templateEdits?: string[]; reviewerModel?: string; reviewerEffort?: string; authorSource?: string }
interface Node { id: string; authorExecutionId: string; reviewerExecutionId?: string; provenance?: string; variants: string[]; expect?: string; scoring?: any }
export interface StandingExperiment { variants: Record<string, Variant>; nodes: Node[]; standingBench?: Array<{ case: string; node: string }> | string[] }

export function loadStandingBench(file = STANDING_BENCH_FILE): StandingBench {
  const b = JSON.parse(fs.readFileSync(file, 'utf8')) as StandingBench;
  const seen = new Set<string>();
  for (const c of b.cases) {
    if (seen.has(c.id)) throw new Error(`standing bench: duplicate case ${c.id}`);
    seen.add(c.id);
    if (!c.storedOutcome || !c.correctOutcome || !c.clauses?.length) throw new Error(`standing bench: ${c.id} needs storedOutcome, correctOutcome and clauses`);
    if (c.kind === 'planted' && (!c.node || !c.gate)) throw new Error(`standing bench: planted case ${c.id} needs node and gate`);
  }
  return b;
}

/** Does this arm's lever reach the case's reader? An edits file that cannot be read counts as reaching (fail closed). */
export function armReaches(v: Variant, c: StandingCase, dir: string): string | null {
  for (const f of v.edits ?? []) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return `protocol edits ${f} (unreadable ⇒ assumed to reach)`;
    const spec = JSON.parse(fs.readFileSync(p, 'utf8')) as { appliesTo?: string[] };
    if ((spec.appliesTo ?? []).includes(c.protocol)) return `protocol edits on ${c.protocol}`;
  }
  for (const f of v.templateEdits ?? []) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return `template edits ${f} (unreadable ⇒ assumed to reach)`;
    const spec = JSON.parse(fs.readFileSync(p, 'utf8')) as { appliesTo?: string[] };
    if ((spec.appliesTo ?? []).includes(`role:${c.reader}`)) return `template edits on role:${c.reader}`;
  }
  // B12 (2026-11-07): a Reviewer model/effort EQUAL to production (the infra tier, effort high — what golden-build stamps on every companion
  // cell) is not a lever on a standing case: the case's frozen record already ran on it. A different model or effort reaches every
  // `*_reviewer` reader (change_reviewer and derivation_reviewer share the infra tier).
  const prodModel = (require('../../lib/agents/model-tiers') as { AGENT_MODELS: Record<string, string> }).AGENT_MODELS.infra;
  if (/_reviewer$/.test(c.reader) && ((v.reviewerModel && v.reviewerModel !== prodModel) || (v.reviewerEffort && v.reviewerEffort !== 'high'))) return 'reviewer model/effort';
  return null;
}

/** The node's Reviewer role from the lab's snapshot CACHE (read-only, never fetched): the role string, or 'unknown' when not cached. */
export function reviewerRoleOf(n: { authorExecutionId: string; reviewerExecutionId?: string }, cacheDir = path.join(__dirname, 'cache', 'snapshots')): string {
  const f = path.join(cacheDir, `${n.authorExecutionId}.json`);
  if (!n.reviewerExecutionId || !fs.existsSync(f)) return 'unknown';
  try {
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (s.reviewer?.exec?.id !== n.reviewerExecutionId) return 'unknown';
    const role = s.reviewer?.exec?.config?.agentRole ?? s.reviewer?.task?.agentRole;
    return typeof role === 'string' && role ? role : 'unknown';
  } catch { return 'unknown'; }
}

function declared(exp: StandingExperiment): Array<{ case: string; node: string }> {
  return (exp.standingBench ?? []).map((d) => (typeof d === 'string' ? { case: '?', node: d } : d));
}

/** The arms whose lever reaches the case's reader AND that run that reader (role-keyed, addendum c), with the reason. B12 (2026-11-07):
 *  a LIVE-Author arm is covered — not reaching — when a persisted-Author arm with byte-identical Reviewer-side levers (protocol edit bytes,
 *  template edit bytes, reviewer model, reviewer effort) runs on the same experiment: a standing case is a Reviewer bench on a FIXED Author,
 *  so that arm's Reviewer reading is the live arm's. */
export function reachingArmsWhy(exp: StandingExperiment, dir: string, c: StandingCase): Array<{ arm: string; why: string }> {
  const runsReader = (arm: string) => {
    const v = exp.variants[arm] as Variant & { authorOnly?: boolean };
    if (/_reviewer$/.test(c.reader) && v.authorOnly) return false;
    const on = exp.nodes.filter((n) => n.variants.includes(arm));
    // VALUE-LEG-GIT ADDENDUM (c), 2026-11-06: a Reviewer node runs the case's reader only if its Reviewer IS that role (read from the CACHED
    // snapshot only, never fetched; unreadable ⇒ counts as running it — fail closed).
    return !on.length || on.some((n) => !(n as any).harvesterOnly && !(n as any).architectOnly && ['unknown', c.reader].includes(reviewerRoleOf(n)));
  };
  return Object.entries(exp.variants).filter(([arm]) => runsReader(arm)).map(([arm, v]) => ({ arm, why: armReaches(v, c, dir) })).filter((x) => x.why) as Array<{ arm: string; why: string }>;
}
/** B12: an arm's REVIEWER-SIDE levers (protocol edit bytes, template edit bytes, reviewer model, reviewer effort). A standing case is a Reviewer
 *  bench on a FIXED (persisted, planted) Author, so two arms with the same key measure it identically — whatever their Author source or
 *  domain binding. */
export function reviewerLeverKey(exp: StandingExperiment, dir: string, arm: string): string {
  const v = exp.variants[arm];
  const read = (f: string) => { const p = path.join(dir, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : `?${f}`; };
  return JSON.stringify({ e: (v.edits ?? []).map(read), t: (v.templateEdits ?? []).map(read), rm: v.reviewerModel ?? null, re: v.reviewerEffort ?? null });
}
export const reachingArms = (exp: StandingExperiment, dir: string, c: StandingCase): string[] => reachingArmsWhy(exp, dir, c).map((x) => x.arm);

export function standingBenchProblems(exp: StandingExperiment, dir: string, bench: StandingBench = loadStandingBench()): string[] {
  const out: string[] = [];
  const decl = declared(exp);
  for (const d of decl) if (d.case === '?') out.push(`standingBench entry "${d.node}" must be {"case": "<standing case id>", "node": "<node id>"}`);
  for (const c of bench.cases) {
    const reaching = reachingArmsWhy(exp, dir, c);
    if (!reaching.length) continue;
    const d = decl.find((x) => x.case === c.id);
    if (!d) { out.push(`standing case ${c.id} is reached (${reaching.map((x) => `${x.arm}: ${x.why}`).join('; ')}) but not declared in "standingBench"`); continue; }
    const nd = exp.nodes.find((n) => n.id === d.node);
    if (!nd) { out.push(`standingBench ${c.id} names node ${d.node}, which the experiment does not carry`); continue; }
    if (nd.authorExecutionId !== c.authorExecutionId || nd.reviewerExecutionId !== c.reviewerExecutionId) out.push(`${d.node} is not ${c.id} (Author/Reviewer executions differ)`);
    if ((nd.provenance ?? 'production') !== c.provenance.kind) out.push(`${d.node}: provenance ${nd.provenance ?? 'production'} ≠ the case's ${c.provenance.kind}`);
    // B12: a reaching arm is covered when the node runs on an arm with byte-identical Reviewer-side levers (a live-Author twin, another
    // domain's cell of the same lab arm). A distinct Reviewer-side lever set still needs the node.
    const keyOf = (a: string) => reviewerLeverKey(exp, dir, a);
    const runKeys = new Set(nd.variants.filter((a) => exp.variants[a]).map(keyOf));
    const missing = reaching.filter((x) => !nd.variants.includes(x.arm) && !runKeys.has(keyOf(x.arm))).map((x) => x.arm);
    if (missing.length) out.push(`${d.node} (${c.id}) does not run on reaching arm(s) ${missing.join(', ')}`);
    const g = nd.scoring?.reviewerGate; const want = caseGate(c);
    const gateOk = !!g && g.expect === want.expect && g.doNotShip === true
      && (want.expect !== 'approve-with-warning' || (g.warningId === want.warningId && JSON.stringify([...(g.devices ?? [])].sort()) === JSON.stringify([...(want.devices ?? [])].sort()) && g.count === want.count));
    if (!gateOk) out.push(`${d.node} (${c.id}) must pre-register scoring.reviewerGate ${JSON.stringify(want)} exactly (LL-CS-21: never rewritten)`);
    if (!(want.expect === 'refuse-for-plant' ? /refuse/i : /approve/i).test(nd.expect ?? '') || (want.warningId && !(nd.expect ?? '').includes(want.warningId))) out.push(`${d.node} (${c.id}): expect must state the case's outcome (${want.expect}${want.warningId ? ` + ${want.warningId}` : ''})`);
    if (c.kind === 'planted') out.push(...plantedNodeProblems(c, nd as any, dir));
  }
  return out;
}

/** s2: a declaring node of a PLANTED case references byte-identical inputs (resolved against the lab dir) and the same levers. */
export function plantedNodeProblems(c: StandingCase, nd: Record<string, any>, dir: string): string[] {
  const out: string[] = []; const pn = c.node ?? {};
  const same = (label: string, ref: string | undefined, pin: PinnedFile | undefined) => {
    if (!pin) { if (ref) out.push(`${nd.id} (${c.id}): ${label} set, the case has none`); return; }
    if (!ref) { out.push(`${nd.id} (${c.id}): ${label} missing (the case pins ${pin.file})`); return; }
    const f = path.resolve(dir, ref);
    if (!fs.existsSync(f)) { out.push(`${nd.id} (${c.id}): ${label} ${ref} not found`); return; }
    if (sha(f) !== pin.sha256) out.push(`${nd.id} (${c.id}): ${label} ${ref} sha256 ≠ the case's ${pin.file} (${pin.sha256.slice(0, 12)})`);
  };
  same('inputEdits', nd.inputEdits, pn.inputEdits);
  same('authorPlant', nd.authorPlant, pn.authorPlant);
  same('valueHarvest.text', nd.valueHarvest?.text, pn.valueHarvest?.text);
  same('valueHarvest.toolCalls', nd.valueHarvest?.toolCalls, pn.valueHarvest?.toolCalls);
  if ((nd.deviceSourcesSnapshot ?? null) !== (pn.deviceSourcesSnapshot ?? null)) out.push(`${nd.id} (${c.id}): deviceSourcesSnapshot ${nd.deviceSourcesSnapshot ?? 'unset'} ≠ the case's ${pn.deviceSourcesSnapshot ?? 'unset'}`);
  return out;
}

/** The frozen record: the cached snapshot is the case (provenance) and the shipping parser reproduces the STORED (wrong) outcome. */
export function standingBenchSelfTest(load: (id: string) => Snapshot, bench: StandingBench = loadStandingBench()): Array<{ id: string; ok: boolean; detail: string }> {
  return bench.cases.map((c) => {
    try {
      const s = load(c.authorExecutionId);
      if (s.reviewer?.exec.id !== c.reviewerExecutionId) return { id: c.id, ok: false, detail: `cached reviewer ${s.reviewer?.exec.id ?? 'none'} ≠ ${c.reviewerExecutionId}` };
      const prov = s.provenance?.kind ?? 'production';
      if (prov !== c.provenance.kind || (c.provenance.dumpSha256 && !(s.provenance?.dumpSha256 ?? '').startsWith(c.provenance.dumpSha256))) return { id: c.id, ok: false, detail: `provenance ${prov} ${s.provenance?.dumpSha256?.slice(0, 12) ?? ''} ≠ ${c.provenance.kind} ${c.provenance.dumpSha256 ?? ''}` };
      const rr = JSON.parse(s.reviewer!.resultJson ?? '{}');
      const v = parseReviewerVerdict(String(rr.finalResponse ?? ''));
      const conf = parseConfidenceScore(String(rr.finalResponse ?? ''));
      let ok = !!v && v.approved === c.storedOutcome.agentApproved && conf === c.storedOutcome.confidence;
      let extra = '';
      if (c.storedOutcome.warningDevices) {
        const named = evaluateStandingGate({ ...c, gate: { expect: 'approve-with-warning', warningId: caseGate(c).warningId, devices: [], doNotShip: true } }, { approved: true, warnings: (rr.reviewerVerdict?.warnings ?? []) });
        const stored = (rr.reviewerVerdict?.warnings ?? []).filter((w: any) => w.id === caseGate(c).warningId).length;
        ok = ok && stored === c.storedOutcome.warningDevices.length; extra = ` · stored ${caseGate(c).warningId} lines ${stored} (${named.why})`;
      }
      if (c.kind === 'planted') for (const pf of [c.node?.inputEdits, c.node?.authorPlant, c.node?.valueHarvest?.text, c.node?.valueHarvest?.toolCalls].filter(Boolean) as PinnedFile[]) {
        const f = path.join(LAB_DIR, pf.file);
        if (!fs.existsSync(f) || sha(f) !== pf.sha256) { ok = false; extra += ` · planted input ${pf.file} ${fs.existsSync(f) ? 'sha differs' : 'missing (vlg-fixtures regenerates cache/vlg)'}`; }
      }
      return { id: c.id, ok, detail: `stored ${v ? (v.approved ? 'approved' : 'refused') : 'no verdict'}/${conf} (frozen: ${c.storedOutcome.agentApproved ? 'approved' : 'refused'}/${c.storedOutcome.confidence})${extra} · correct outcome: ${c.correctOutcome.slice(0, 60)}…` };
    } catch (e) { return { id: c.id, ok: false, detail: `snapshot not cached: ${(e as Error).message.slice(0, 120)} — restore the dump and take it with snapshot --source local-db:<db>` }; }
  });
}

/** The gate evaluator, both directions, on synthetic verdicts (s2): every case's MET shape reads met, every MISS shape reads missed. */
export function standingGateSelfTest(bench: StandingBench = loadStandingBench()): Array<{ id: string; ok: boolean; detail: string }> {
  const rows: Array<{ id: string; ok: boolean; detail: string }> = [];
  for (const c of bench.cases) {
    const g = caseGate(c);
    const w = (t: string) => ({ id: g.warningId ?? 'x', text: t });
    const shapes: Array<[string, Parameters<typeof evaluateStandingGate>[1], boolean]> = g.expect === 'refuse-for-plant'
      ? [['refused', { approved: false, blocking: ['plant'], warnings: [] }, true], ['approved (false release)', { approved: true, blocking: [], warnings: [] }, false]]
      : [[`one line naming ${g.devices!.join(' + ')}`, { approved: true, warnings: [w(g.devices!.join(' and '))] }, true],
         ['one line per device', { approved: true, warnings: g.devices!.map((d) => w(d)) }, true],
         ['MUTATION warning dropped', { approved: true, warnings: [] }, false],
         ['MUTATION only one device named', { approved: true, warnings: [w(g.devices![0])] }, false],
         ['MUTATION another warning id', { approved: true, warnings: [{ id: 'other', text: g.devices!.join(' ') }] }, false],
         ['MUTATION blocked on the limit', { approved: false, blocking: ['git-file only'], warnings: [w(g.devices!.join(' '))] }, false]];
    for (const [name, v, want] of shapes) { const r = evaluateStandingGate(c, v); rows.push({ id: `${c.id} · ${name}`, ok: r.met === want, detail: `${r.met ? 'MET' : 'MISSED'} — ${r.why}` }); }
  }
  return rows;
}

/** B12: read the STANDING nodes a golden companion carries (`STAND-<case>`) in its run folders, by the case's gate. A MISSED sample, an
 *  error, or a carried node with no sample is do-not-ship / incomplete — the same weight the lab's own declared node carries. */
export function scoreStandingInRuns(runDirs: string[], companion: { goldenCompanion?: { standing?: Array<{ case: string; node: string }> } }, bench: StandingBench = loadStandingBench()):
  { rows: Array<{ case: string; sample: string; met: boolean; why: string }>; doNotShip: string[]; incomplete: string[] } {
  const rows: Array<{ case: string; sample: string; met: boolean; why: string }> = []; const doNotShip: string[] = []; const incomplete: string[] = [];
  for (const d of companion.goldenCompanion?.standing ?? []) {
    const c = bench.cases.find((x) => x.id === d.case);
    if (!c) { incomplete.push(`${d.case}: not in the standing bench`); continue; }
    let n = 0;
    for (const rd of runDirs) {
      const nd = path.join(rd, d.node);
      if (!fs.existsSync(nd)) continue;
      for (const arm of fs.readdirSync(nd).filter((x) => fs.statSync(path.join(nd, x)).isDirectory()))
        for (const smp of fs.readdirSync(path.join(nd, arm)).filter((x) => x.startsWith('sample-'))) {
          const f = path.join(nd, arm, smp, 'sample.json'); if (!fs.existsSync(f)) continue;
          const sj = JSON.parse(fs.readFileSync(f, 'utf8')); n++;
          const r = sj.error ? { met: false, why: `error: ${sj.error}` } : evaluateStandingGate(c, sj.verdict ?? null);
          rows.push({ case: c.id, sample: `${path.basename(rd)}/${arm}/${smp}`, ...r });
          if (!r.met) doNotShip.push(`${c.id} ${arm}/${smp}: ${r.why}`);
        }
    }
    if (!n) incomplete.push(`${c.id}: carried as ${d.node}, no sample in the run(s)`);
  }
  return { rows, doNotShip, incomplete };
}

