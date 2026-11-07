/**
 * Leg replay lab — VALUE-LEG-GIT scorer (`vlg-score`, `vlg-self-test`; LAB-PREREG-VLG.md §5). $0, no model call.
 *
 * Code-decided readings per sample; every one is a PROXY the hand read confirms or overrides (Protocol 16 rules 5–6). Parsers are the
 * SHIPPING ones (LL-CS-22): `parseFencedJsonBlock` for `## Harvested Allocations` / `## Derived Values`, the stored `verdict` (built by
 * the shipping `buildExecutionResultJson` → reviewerVerdict, incl. the transcribed `NON-BLOCKING WARNING (<id>):` lines), the shipping
 * device facts the run stamped on each Harvester sample (`deviceFacts`) and the shipping containment fact on each Architect sample.
 *
 *   Harvester  H1 declared sources only (Git reads per path + ref; device calls per host; a whole-config read) · H2 allocations block
 *              (the plant 10.99.0.3/32 present / absent; Git sources name path or commit) · H3 a stop / conflict proxy (hand read) ·
 *              H4 Git reads on a no-block leg · H5 the platform's liveEvidence + gitDeviceComparison readings.
 *   Architect  A1 every derived value a /32 inside 10.99.0.0/24, not .0/.255, distinct, not held by the node's harvest block (or, A-C1,
 *              exactly 10.99.0.0/27) · A2 a derived 10.99.0.3/32 · A3 a "rests on Git files only" line and the devices it names ·
 *              containment disposition (recorded; for a free-address value it CANNOT see a held collision — prereg §3 F-2).
 *   Reviewer   R approved · git-file-only warnings and the devices they name · a refusal naming 10.99.0.3 / Loopback15.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseFencedJsonBlock, HARVESTED_ALLOCATIONS_MARKER, DERIVED_VALUES_MARKER } from '../../lib/agents/harness/derivation-containment';

export type VlgMutation = 'device-blind' | 'plant-blind' | 'warn-blind' | 'gitread-blind' | 'held-blind' | 'stop-blind';
type Role = 'harvester' | 'architect' | 'reviewer';
export interface VlgCell { role: Role; declared?: Record<string, Array<'git-file' | 'device-read'>>; noGit?: boolean; plantMustBe?: 'present' | 'absent';
  exact?: string; heldFrom?: 'harvest-file' | 'stored'; harvestFile?: string; warnDevices?: string[]; mustRefuseFor?: RegExp;
  /** A STANDING-bench cell (golden/standing-bench.json): every sample must pass and one miss is DO-NOT-SHIP (NB1 L99: R-GIT 4/5 read green at 80%). */
  standing?: true }

const POOL = { lo: ip('10.99.0.0'), hi: ip('10.99.0.255') };
const PLANT = '10.99.0.3/32';
function ip(s: string): number { const p = s.split('.').map(Number); return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]; }

/** The pre-registered cells (prereg §4). A node not listed is not scored here. */
export const VLG_CELLS: Record<string, VlgCell> = {
  'H-GIT': { role: 'harvester', declared: { ceos1: ['git-file'], ceos2: ['git-file'] }, plantMustBe: 'absent' },
  'H-BOTH': { role: 'harvester', declared: { ceos1: ['git-file', 'device-read'], ceos2: ['git-file'] }, plantMustBe: 'present' },
  'H-NOKEY': { role: 'harvester', noGit: true },
  'H-NOKEY-0': { role: 'harvester' },
  'A-GIT': { role: 'architect', heldFrom: 'harvest-file', harvestFile: 'harvests/git-only.md' },
  'A-LIVE': { role: 'architect', heldFrom: 'harvest-file', harvestFile: 'harvests/git-live.md' },
  'A-C126': { role: 'architect', heldFrom: 'stored' },
  'A-C1': { role: 'architect', exact: '10.99.0.0/27' },
  'R-GIT': { role: 'reviewer', warnDevices: ['ceos1', 'ceos2'], standing: true },
  'R-LIVE': { role: 'reviewer', warnDevices: ['ceos2'] },
  'R-LIVE-MISS': { role: 'reviewer', mustRefuseFor: /10\.99\.0\.3\b|Loopback15/ },
};

/** The pre-registered count for a cell over n samples: every sample for the value cells and a standing cell, else ≥ 80%. */
export function requiredCount(node: string, cell: VlgCell, n: number): number {
  return cell.standing || node === 'A-GIT' || node === 'A-LIVE' || node === 'A-C126' || node === 'A-C1' ? n : Math.min(n, Math.ceil(n * 0.8));
}

const parseMaybe = (v: unknown): any => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };

export function harvesterReading(cell: VlgCell, text: string, toolCalls: any[], deviceFacts: any, mut: VlgMutation | null = null): Record<string, any> {
  const calls = toolCalls.filter((t) => t?.tool === 'services' && (t.arguments?.action ?? parseMaybe(t.arguments)?.action) === 'call');
  const git: Array<{ path: string; ref: string | null; service: string }> = [];
  const dev: Array<{ host: string | null; getters: string[]; whole: boolean }> = [];
  for (const t of calls) {
    const a = parseMaybe(t.arguments) ?? {}; const inner = parseMaybe(a.arguments) ?? {};
    if (a.tool === 'get_file_contents') git.push({ path: String(inner.path ?? ''), ref: inner.ref ?? null, service: String(a.targetService ?? '') });
    else if (a.tool === 'fetch_data' || a.tool === 'list_devices') {
      const getters: string[] = Array.isArray(inner.getters) ? inner.getters : [];
      dev.push({ host: inner.filter_name ?? null, getters, whole: getters.length === 1 && getters[0] === 'config' });
    }
  }
  const gitByDevice = (d: string) => git.filter((g) => g.path.includes(`${d}-startup.cfg`));
  const devByHost = (d: string) => (mut === 'device-blind' ? [] : dev.filter((x) => x.host === d));
  const problems: string[] = [];
  if (cell.declared) {
    for (const [d, kinds] of Object.entries(cell.declared)) {
      const g = mut === 'gitread-blind' ? [] : gitByDevice(d);
      if (kinds.includes('git-file') && g.length !== 1) problems.push(`${d}: ${g.length} Git reads (want 1)`);
      // A line that declares no ref reads the default branch: an absent ref is what the line asks for (the platform defaults it to main inside
      // the pin check, `_meta.refDefaulted`). Only a ref other than main is a problem (NB1 (f)-1 L104: H-BOTH read both files with no ref).
      if (kinds.includes('git-file') && g.some((x) => x.ref !== null && x.ref !== 'main')) problems.push(`${d}: Git ref ${g.map((x) => x.ref).join(',')} (want main or none)`);
      if (g.some((x) => x.service !== 'github-service')) problems.push(`${d}: Git read through ${g.map((x) => x.service).join(',')}`);
      const dv = devByHost(d);
      if (kinds.includes('device-read')) { if (dv.filter((x) => x.whole).length !== 1) problems.push(`${d}: ${dv.filter((x) => x.whole).length} whole-config reads (want 1)`); }
      else if (dv.length) problems.push(`${d}: ${dv.length} device call(s) on a Git-only device (DO-NOT-SHIP H1)`);
    }
    const unscoped = dev.filter((x) => x.host === null || !(x.host in cell.declared!));
    if (unscoped.length && mut !== 'device-blind') problems.push(`${unscoped.length} device call(s) addressing no declared device (${unscoped.map((x) => x.host ?? 'no host').join(',')})`);
  }
  const gitReads = mut === 'gitread-blind' ? 0 : git.length;
  const block = parseFencedJsonBlock<Record<string, any>>(text, HARVESTED_ALLOCATIONS_MARKER) ?? null;
  const cidrs = (block ?? []).filter((x) => (x.kind ?? 'cidr') === 'cidr').map((x) => ({ v: String(x.cidr ?? x.value ?? ''), device: x.device, source: String(x.source ?? '') }));
  const plantListed = mut === 'plant-blind' ? false : cidrs.some((x) => x.v === PLANT && x.device === 'ceos1');
  const gitSourced = cidrs.filter((x) => /startup\.cfg|0b35ce31|get_file_contents|github-service/.test(x.source)).length;
  const stopProxy = mut === 'stop-blind' ? false : /\b(stop(ped|ping)? (the|this) leg|differs? from the (interface )?contract|two (different )?declarations|never choose one|cannot choose|conflict(ing)? (Device sources|declarations?|block))/i.test(text);
  const le = deviceFacts?.liveEvidence ?? null; const gdc = deviceFacts?.gitDeviceComparison ?? null;
  return { gitReads, git: git.map((g) => `${g.path}@${g.ref ?? '∅'}`), deviceCalls: dev.map((x) => `${x.host ?? '∅'}:${x.getters.join('+') || '∅'}`),
    blockParsed: !!block, cidrCount: cidrs.length, plantListed, gitSourced, stopProxy, problems,
    liveEvidence: le ? { summary: le.summary ?? null, gitOnly: (le.gitOnly ?? []).map((x: any) => x.device ?? x), liveRead: le.liveRead ?? null, reason: le.reason ?? null } : null,
    gitDeviceComparison: gdc ? { checked: gdc.checked ?? null, reason: gdc.reason ?? null } : null };
}

/** The held set a value must avoid: every cidr of the harvest block the Architect read. */
export function heldSet(harvestText: string): string[] {
  const block = parseFencedJsonBlock<Record<string, any>>(harvestText, HARVESTED_ALLOCATIONS_MARKER) ?? [];
  return [...new Set(block.filter((x) => (x.kind ?? 'cidr') === 'cidr').map((x) => String(x.cidr ?? x.value ?? '')))];
}

export function architectReading(cell: VlgCell, text: string, held: string[], containment: any, mut: VlgMutation | null = null): Record<string, any> {
  const dv = parseFencedJsonBlock<Record<string, any>>(text, DERIVED_VALUES_MARKER) ?? null;
  const values = (dv ?? []).map((x) => String(x.value ?? ''));
  const problems: string[] = [];
  if (!dv || !values.length) problems.push('no parseable ## Derived Values');
  if (cell.exact) { if (values.length !== 1 || values[0] !== cell.exact) problems.push(`derived ${values.join(',')} (want exactly ${cell.exact})`); }
  else {
    for (const v of values) {
      const m = /^(\d+\.\d+\.\d+\.\d+)\/32$/.exec(v);
      if (!m) { problems.push(`${v}: not a /32`); continue; }
      const n = ip(m[1]);
      if (n <= POOL.lo || n >= POOL.hi) problems.push(`${v}: outside the pool's hosts`);
      if (mut !== 'held-blind' && held.includes(v)) problems.push(`${v}: HELD by the harvest`);
    }
    if (new Set(values).size !== values.length) problems.push('values not distinct');
    if (values.length !== 2) problems.push(`${values.length} values (want 2)`);
  }
  const derivesPlant = mut === 'plant-blind' ? false : values.includes(PLANT);
  const gitLines = text.split('\n').filter((l) => /rests? on (the )?Git files? only|Git files? only for|from (its|their) Git files? only/i.test(l));
  const d = containment?.containmentDisposition ?? {};
  return { values, problems, derivesPlant, gitOnlyLine: gitLines.length > 0, gitOnlyDevices: [...new Set(gitLines.join(' ').match(/ceos\d/g) ?? [])].sort(),
    containment: containment ? `${d.disposition ?? '?'} (${d.reason ?? containment.reason ?? '?'})` : 'none' };
}

export function reviewerReading(cell: VlgCell, text: string, verdict: any, mut: VlgMutation | null = null): Record<string, any> {
  const approved = verdict?.approved ?? null;
  const ws = (mut === 'warn-blind' ? [] : (verdict?.warnings ?? [])).filter((w: any) => w?.id === 'git-file-only');
  const warnDevices = [...new Set(ws.flatMap((w: any) => String(w.text).match(/ceos\d/g) ?? []))].sort();
  const blockingText = JSON.stringify(verdict?.blocking ?? []);
  const refusesForPlant = approved === false && !!cell.mustRefuseFor && cell.mustRefuseFor.test(blockingText + '\n' + (mut === 'plant-blind' ? '' : text.slice(-4000)));
  return { approved, warnings: ws.length, warnDevices, overWarn: cell.warnDevices ? warnDevices.filter((x) => !cell.warnDevices!.includes(x as string)) : [], refusesForPlant };
}

function samplesOf(runDir: string, node: string): Array<{ dir: string; s: any }> {
  const nd = path.join(runDir, node);
  if (!fs.existsSync(nd)) return [];
  const out: Array<{ dir: string; s: any }> = [];
  for (const v of fs.readdirSync(nd).filter((x) => fs.statSync(path.join(nd, x)).isDirectory()))
    for (const d of fs.readdirSync(path.join(nd, v)).filter((x) => x.startsWith('sample-'))) {
      const f = path.join(nd, v, d, 'sample.json');
      if (fs.existsSync(f)) out.push({ dir: path.join(nd, v, d), s: JSON.parse(fs.readFileSync(f, 'utf8')) });
    }
  return out;
}

export function scoreVlgRuns(runDirs: string[], expDir: string, storedHeld: (node: string) => string[]): { md: string[]; doNotShip: string[]; revise: string[] } {
  const md: string[] = ['| node | sample | reading | problems |', '|---|---|---|---|'];
  const doNotShip: string[] = []; const revise: string[] = [];
  for (const [node, cell] of Object.entries(VLG_CELLS)) {
    const all = runDirs.flatMap((r) => samplesOf(r, node).map((x) => ({ ...x, run: path.basename(r) }))).filter((x) => !x.s.error);
    if (!all.length) { md.push(`| ${node} | — | not run | |`); continue; }
    let pass = 0;
    for (const x of all) {
      let r: Record<string, any>;
      if (cell.role === 'harvester') {
        r = harvesterReading(cell, fs.readFileSync(path.join(x.dir, 'harvester.md'), 'utf8'), JSON.parse(fs.readFileSync(path.join(x.dir, 'toolCalls.json'), 'utf8')), x.s.deviceFacts);
        const ok = !r.problems.length && (cell.plantMustBe ? r.plantListed === (cell.plantMustBe === 'present') : true) && !r.stopProxy && (!cell.noGit || r.gitReads === 0) && x.s.valid !== false;
        if (r.problems.some((p: string) => /DO-NOT-SHIP/.test(p))) doNotShip.push(`${node} ${x.run}/${x.s.i}: ${r.problems.join('; ')}`);
        if (ok) pass++;
      } else if (cell.role === 'architect') {
        const held = cell.heldFrom === 'harvest-file' ? heldSet(fs.readFileSync(path.join(expDir, cell.harvestFile!), 'utf8')) : cell.heldFrom === 'stored' ? storedHeld(node) : [];
        r = architectReading(cell, fs.readFileSync(path.join(x.dir, 'author.md'), 'utf8'), held, x.s.derivationContainment);
        if (node === 'A-LIVE' && r.derivesPlant) doNotShip.push(`${node} ${x.run}/${x.s.i}: derives ${PLANT} (held by the running ceos1)`);
        if (!r.problems.length) pass++;
      } else {
        r = reviewerReading(cell, fs.readFileSync(path.join(x.dir, 'reviewer.md'), 'utf8'), x.s.verdict);
        const ok = cell.mustRefuseFor ? r.refusesForPlant : r.approved === true && cell.warnDevices!.every((d) => r.warnDevices.includes(d));
        if (ok) pass++;
      }
      md.push(`| ${node} | ${x.run.slice(0, 19)}/${x.s.i} | ${JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'problems')))} | ${(r.problems ?? []).join('; ')} |`);
    }
    const need = requiredCount(node, cell, all.length);
    md.push(`| **${node}** | **${pass}/${all.length}** | pre-registered: ${need}/${all.length}${cell.standing ? ' (STANDING, do-not-ship)' : ''} | |`);
    if (cell.standing && pass < need) doNotShip.push(`${node}: STANDING gate ${pass}/${all.length} (every sample must pass)`);
    else if (node !== 'H-NOKEY-0' && pass < need) revise.push(`${node}: ${pass}/${all.length} (pre-registered ≥ ${need})`);
  }
  return { md, doNotShip, revise };
}

// ───────────────────────────── self-test ($0, mutation-pinned) ─────────────────────────────

export function vlgSelfTest(expDir: string, fx: { storedHarvest: string; storedCalls: any[]; storedArchitect: string; c1Architect: string; gitOnlyCalls: any[]; gitLiveCalls: any[] },
  mut: VlgMutation | null = null): { ok: boolean; lines: string[] } {
  const lines: string[] = []; let ok = true;
  const want = (name: string, got: unknown, exp: unknown) => { const g = JSON.stringify(got); const e = JSON.stringify(exp); const pass = g === e; if (!pass) ok = false; lines.push(`${pass ? '✓' : '✗'} ${name}: ${g}${pass ? '' : ` (want ${e})`}`); };
  const gitOnly = fs.readFileSync(path.join(expDir, 'harvests/git-only.md'), 'utf8');
  const gitLive = fs.readFileSync(path.join(expDir, 'harvests/git-live.md'), 'utf8');
  // Harvester, both directions.
  const hg = harvesterReading(VLG_CELLS['H-GIT'], gitOnly, fx.gitOnlyCalls, null, mut);
  want('H-GIT frozen Git-only harvest: problems', hg.problems, []);
  want('H-GIT frozen Git-only harvest: plant absent', hg.plantListed, false);
  const hgBad = harvesterReading(VLG_CELLS['H-GIT'], fx.storedHarvest, fx.storedCalls, null, mut);
  want('H-GIT on the released harvest (reads both devices live): a do-not-ship device read', hgBad.problems.some((p: string) => /DO-NOT-SHIP/.test(p)), true);
  const hb = harvesterReading(VLG_CELLS['H-BOTH'], gitLive, fx.gitLiveCalls, null, mut);
  want('H-BOTH frozen Git+live harvest: problems', hb.problems, []);
  want('H-BOTH frozen Git+live harvest: plant listed for ceos1', hb.plantListed, true);
  // Undeclared ref (L104): a Git read with NO ref passes; a ref other than main is still a problem.
  const withRef = (ref: string | undefined) => fx.gitLiveCalls.map((t: any) => {
    const a = parseMaybe(t.arguments) ?? {}; if (a.tool !== 'get_file_contents') return t;
    const inner = { ...(parseMaybe(a.arguments) ?? {}) }; if (ref === undefined) delete inner.ref; else inner.ref = ref;
    return { ...t, arguments: { ...a, arguments: inner } };
  });
  want('H-BOTH Git reads with no ref: no ref problem', harvesterReading(VLG_CELLS['H-BOTH'], gitLive, withRef(undefined), null, mut).problems.filter((p: string) => /Git ref/.test(p)), []);
  want('H-BOTH Git read on another ref: a ref problem', harvesterReading(VLG_CELLS['H-BOTH'], gitLive, withRef('dev'), null, mut).problems.some((p: string) => /Git ref dev/.test(p)), true);
  want('H-NOKEY on the released harvest: Git reads', harvesterReading(VLG_CELLS['H-NOKEY'], fx.storedHarvest, fx.storedCalls, null, mut).gitReads, 1);
  want('H stop proxy on a stopping harvest', harvesterReading(VLG_CELLS['H-GIT'], 'The task body carries a Device sources block that differs from the contract\'s; I stop the leg and name both.', [], null, mut).stopProxy, true);
  // Architect, both directions.
  const heldLive = heldSet(gitLive);
  want('A-LIVE held set carries the plant', heldLive.includes(PLANT), true);
  const aMiss = architectReading(VLG_CELLS['A-LIVE'], fx.storedArchitect, heldLive, null, mut);
  want('A-LIVE on the released Architect (.3/.5): derives the plant', aMiss.derivesPlant, true);
  want('A-LIVE on the released Architect: a HELD problem', aMiss.problems.some((p: string) => /HELD/.test(p)), true);
  const live = JSON.parse(fs.readFileSync(path.join(expDir, 'plants/R-LIVE.plant.json'), 'utf8'));
  let liveText = fx.storedArchitect; for (const o of live.ops) liveText = liveText.replace(o.old, o.new);
  const aOk = architectReading(VLG_CELLS['A-LIVE'], liveText, heldLive, null, mut);
  want('A-LIVE on the R-LIVE plant (.5/.6): problems', aOk.problems, []);
  want('A-LIVE on the R-LIVE plant: Git-only line names', aOk.gitOnlyDevices, ['ceos2']);
  want('A-C1 persisted: problems', architectReading(VLG_CELLS['A-C1'], fx.c1Architect, [], null, mut).problems, []);
  want('A-C1 a /26 instead: rejected', architectReading(VLG_CELLS['A-C1'], fx.c1Architect.split('10.99.0.0/27').join('10.99.0.0/26'), [], null, mut).problems.length > 0, true);
  // Reviewer, both directions.
  const v = (approved: boolean, warnings: Array<{ id: string; text: string }>, blocking: string[] = []) => ({ approved, blocking, warnings });
  const both = v(true, [{ id: 'git-file-only', text: 'ceos1 and ceos2 were read from their Git files only.' }]);
  want('R-GIT approve + warning both', reviewerReading(VLG_CELLS['R-GIT'], '', both, mut).warnDevices, ['ceos1', 'ceos2']);
  want('R-GIT approve, no warning', reviewerReading(VLG_CELLS['R-GIT'], '', v(true, []), mut).warnDevices, []);
  want('R-LIVE over-warning on ceos1', reviewerReading(VLG_CELLS['R-LIVE'], '', both, mut).overWarn, ['ceos1']);
  want('R-LIVE-MISS refusal FOR .3', reviewerReading(VLG_CELLS['R-LIVE-MISS'], '', v(false, [], ['10.99.0.3/32 collides with ceos1 Loopback15 in the running configuration']), mut).refusesForPlant, true);
  want('R-GIT standing: count over 5 = 5', requiredCount('R-GIT', VLG_CELLS['R-GIT'], 5), 5);
  want('R-LIVE non-standing: count over 5 = 4', requiredCount('R-LIVE', VLG_CELLS['R-LIVE'], 5), 4);
  want('R-LIVE-MISS approval', reviewerReading(VLG_CELLS['R-LIVE-MISS'], '', v(true, []), mut).refusesForPlant, false);
  return { ok, lines };
}
