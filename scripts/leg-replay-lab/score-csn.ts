/**
 * Leg replay lab — L-CS-N scorer (Config sources, network step; LAB-PREREG-L-CS-N.md §3–§6). $0, offline, additive over score-n1.
 *
 * THE SCOPE DEFINITION is the candidate text's own sentence (network-provisioning 1.26.0, `2175147a…`, Phase 3 **Coverage**), quoted
 * here VERBATIM and pinned by `csnSelfTest` against the experiment's materialized candidate text — one definition shared by the text, the
 * bench (each node's `scopeDevices` with quoted source lines) and this scorer:
 */
export const SCOPE_DEFINITION = "a derived value's SCOPE is every device the Program Interface Contract, the objective or the package names as able to hold an allocation the value could collide with.";
/** The registered warning id R1 v2 prints for a Git-only device (R1-g). */
export const GIT_ONLY_WARNING_PREFIX = 'NON-BLOCKING WARNING (git-file-only):';
/*
 * Readings (proxies FLAG; the hand read decides — Protocol 16 rules 5–6):
 *   Harvester  WHOLE      the live-read device's config read whole exactly once (score-n1 SHAPE `live-read` arm, reused)
 *              HELD       a line claiming the live-read device held / kept / a held copy / an H<n> handle (negations excluded) — do-not-ship
 *              ALLOC      every witness allocation (e.g. 10.99.0.2/32) listed in `## Harvested Allocations` for the live-read device
 *              FAIL       (LR-FAIL) the device reported unreadable, never held, and no Git read in its place
 *              REF-H5     every Git call carries `ref` = the line's ref, or 'main' when the line names none; targetService = the line's
 *              STAMP      the sample's own leaf `liveEvidence` stamped (the candidate arm's protocol injection reached the net)
 *   Author     NOPKG      no held-file edit / candidate block / restore naming the live-read device — do-not-ship
 *              LIMIT      the design's "not read / not performed" sentence quoted within the Derived Values neighbourhood, design named
 *   Architect  OVERLAP    the chosen derived CIDR overlaps NO allocation of the live-read device in the served fixture (code-decided)
 *              CITES      the design names the live-read device and live evidence
 *   Reviewer   FOR        a refusal whose blocking items name the plant (pool/device) AND a coverage basis — else a refusal is OTHER
 *              clauses    subcounts R1-a (quoted limit) · R1-b (declared, not read) · R1-c (no read shown) · R1-backstop (Node C rejected)
 *              WARN       the git-file-only warning id present
 *   VOID       R-FWA3's sampled 1.25.0 base refuses >= 2 of 3 (any reason) ⇒ the node does not discriminate
 */
import * as fs from 'fs';
import * as path from 'path';
import { n1Calls, type N1Scoring, type DeclaredSource } from './score-n1';
import { parseFencedJsonBlock, HARVESTED_ALLOCATIONS_MARKER, DERIVED_VALUES_MARKER } from '../../lib/agents/harness/derivation-containment';

export type CsnMutation = 'held-blind' | 'held-loose' | 'alloc-regex' | 'alloc-blind' | 'dv-regex' | 'ref-blind' | 'nopkg-blind' | 'limit-blind' | 'overlap-blind' | 'reason-blind' | 'void-blind' | 'warn-blind';
export interface CsnScoring {
  role: 'harvester' | 'author' | 'architect' | 'reviewer';
  cell: string;
  /** the live-read device (LR-EDGE, LR-FAIL, A-LR, ARCH-LR) */ liveReadDevice?: string;
  /** allocations the live-read device holds in the served fixture (ALLOC witness; ARCH-LR overlap set) */ allocations?: string[];
  /** score-n1 declaration (SHAPE / PATH / REF) */ declared?: Record<string, DeclaredSource[]> | null;
  failHost?: string;
  /** Reviewer: the plant terms (pool / device) and the coverage basis; a refusal is FOR the plant only when both match */
  plantRegex?: string; reasonRegex?: string; clauses?: string[];
  /** F3: the devices in scope, each with the verbatim line(s) that put it there and their source */
  scopeDevices?: Array<{ device: string; source: 'contract' | 'objective' | 'package'; quote: string }>;
  reviewerGate?: { gate: string; expect: 'refuse-for-plant' | 'approve' | 'measured'; bar?: [number, number]; doNotShip?: boolean; voidIfBaseRefuses?: [number, number]; baseArm?: string };
  /** R1-g: the warning is expected (true), forbidden (false) or not scored (undefined) */ expectGitOnlyWarning?: boolean;
}

const plain = (t: string) => t.replace(/\*\*|__|`/g, '');
const NEG_RE = /\b(?:not|never|no|nothing|isn't|is not|none)\b[^.\n]{0,30}\b(?:held|kept|keep|hold)\b|\b(?:held|kept)\b[^.\n]{0,12}\bnothing\b/i;
const tok = (d: string) => new RegExp(`(?<![\\w-])${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i');

// ───────────────────────────── harvester ─────────────────────────────
/**
 * HELD (tightened 2026-11-05, ADDENDUM (h)): "held" must be said OF the device. The old line-level rule read a line naming the device
 * anywhere next to "held" said of ANOTHER device ("ceos1 (device-read, held whole) + ceos2 (live-read, evidence only)") or of a score
 * ("the confidence score is held at its prior level") as a claim — LR-FAIL read 3/5 held when the hand read found 0/5.
 * Now: the SEGMENT from each device mention to the next clause boundary (sentence end, ` — `, ` + `, `;`) must carry held / kept / an
 * H<n> handle, not negated and not a score/level; or an H<n> handle labels the device (`H2 (ceos2 …)`, `H2: ceos2`).
 */
const SEG_END_RE = /[.;!?](?=\s|$)|\s[—–+]\s|;/;
const SCORE_HELD_RE = /\b(?:score|confidence|level)\b[^.\n]{0,40}\bheld\b|\bheld\b\s+(?:at|steady|constant|level)\b/i;
export function heldClaims(text: string, device: string, mutate?: CsnMutation): string[] {
  if (mutate === 'held-blind') return [];
  const lines = plain(text).split('\n');
  if (mutate === 'held-loose') return lines.filter((l) => tok(device).test(l) && /\b(?:held|kept)\b|\bheld (?:copy|base|file)\b|\bH\d+\b/.test(l) && !NEG_RE.test(l)).map((l) => l.trim().slice(0, 160));
  const dev = tok(device).source;
  const labelRe = new RegExp(`\\bH\\d+\\b\\s*[:(\\[]\\s*${dev}`, 'i');
  const out: string[] = [];
  for (const l of lines) {
    let hit = labelRe.test(l);
    const re = new RegExp(dev, 'gi');
    for (let m = re.exec(l); !hit && m; m = re.exec(l)) {
      const rest = l.slice(m.index);
      const end = rest.slice(1).search(SEG_END_RE);
      const seg = end < 0 ? rest : rest.slice(0, end + 1);
      if (/\b(?:held|kept)\b|\bH\d+\b/.test(seg) && !NEG_RE.test(seg) && !SCORE_HELD_RE.test(seg)) hit = true;
    }
    if (hit) out.push(l.trim().slice(0, 160));
  }
  return out;
}
/** ALLOC (2026-11-05, ADDENDUM (h)): the SHIPPING extractor (`parseFencedJsonBlock`, derivation-containment.ts) — it reads the
 *  fence-inverted shape (```json, then the heading, then the array) that the old lab regex missed (LR-EDGE read 2/5 for a true 5/5). */
export function allocationsBlock(text: string, mutate?: CsnMutation): unknown[] | null {
  if (mutate === 'alloc-regex') {
    const m = /##\s*Harvested Allocations[^\n]*\n+```[a-z]*\n([\s\S]*?)```/i.exec(text);
    if (!m) return null;
    try { const a = JSON.parse(m[1]); return Array.isArray(a) ? a : null; } catch { return null; }
  }
  return parseFencedJsonBlock<unknown>(text, HARVESTED_ALLOCATIONS_MARKER);
}
export function allocListed(text: string, device: string, cidr: string, mutate?: CsnMutation): boolean {
  if (mutate === 'alloc-blind') return true;
  const arr = allocationsBlock(text, mutate);
  if (!arr) return false;
  return arr.some((e) => JSON.stringify(e).includes(cidr) && tok(device).test(JSON.stringify(e)));
}
export function refH5Misses(toolCalls: unknown[], declared: Record<string, DeclaredSource[]>, mutate?: CsnMutation): string[] {
  const out: string[] = [];
  const lines = Object.values(declared).flat().filter((l): l is Extract<DeclaredSource, { kind: 'git-file' }> => l.kind === 'git-file');
  for (const t of toolCalls as Array<Record<string, any>>) {
    if (t?.tool !== 'services') continue;
    const a = typeof t.arguments === 'string' ? JSON.parse(t.arguments) : (t.arguments ?? {});
    if (a.tool !== 'get_file_contents') continue;
    const inner = typeof a.arguments === 'string' ? JSON.parse(a.arguments) : (a.arguments ?? {});
    const line = lines.find((l) => l.path === String(inner.path ?? '').replace(/^\/+/, ''));
    if (!line) continue;
    const want = line.ref ?? 'main';
    if (mutate !== 'ref-blind' && inner.ref !== want) out.push(`${line.path}: ref ${JSON.stringify(inner.ref ?? null)} (want ${want})`);
    if (a.targetService !== line.service) out.push(`${line.path}: through ${a.targetService} (want ${line.service})`);
  }
  return out;
}
export interface CsnHarvesterScore { whole: boolean | null; held: string[]; alloc: Record<string, boolean>; fail: boolean | null; refH5: string[]; stamped: boolean | null }
export function scoreCsnHarvester(text: string, toolCalls: unknown[], sc: CsnScoring, sample: Record<string, any> = {}, mutate?: CsnMutation): CsnHarvesterScore {
  const d = sc.liveReadDevice ?? null;
  const n1sc: N1Scoring = { role: 'harvester', cell: sc.cell, declared: sc.declared ?? null };
  const calls = sc.declared ? n1Calls(toolCalls, n1sc) : null;
  const whole = d && calls ? (sc.failHost === d ? null : (calls.configReads[d] ?? 0) === 1) : null;
  const held = d ? heldClaims(text, d, mutate) : [];
  const alloc: Record<string, boolean> = {};
  if (d && sc.failHost !== d) for (const c of sc.allocations ?? []) alloc[c] = allocListed(text, d, c, mutate);
  let fail: boolean | null = null;
  if (sc.failHost) {
    const lines = plain(text).split('\n');
    const reported = lines.some((l) => tok(sc.failHost!).test(l) && /unreachable|refused|no configuration|could not be read|cannot be read|failed|error|unavailable|502/i.test(l));
    const gitInPlace = (toolCalls as Array<Record<string, any>>).some((t) => JSON.stringify(t?.arguments ?? '').includes('get_file_contents'));
    fail = reported && !gitInPlace && heldClaims(text, sc.failHost, mutate).length === 0;
  }
  const refH5 = sc.declared ? refH5Misses(toolCalls, sc.declared, mutate) : [];
  const le = sample?.leafFacts?.liveEvidence ?? sample?.harvester?.leafFacts?.liveEvidence;
  return { whole, held, alloc, fail, refH5, stamped: le === undefined ? null : !/not stamped|NOT_STAMPED|n\/a/i.test(String(le)) };
}

// ───────────────────────────── author ─────────────────────────────
export function section(text: string, heading: RegExp): string {
  const lines = text.split('\n'); const i = lines.findIndex((l) => heading.test(l));
  if (i < 0) return '';
  const j = lines.findIndex((l, k) => k > i && /^#{1,3}\s/.test(l));
  return lines.slice(i, j < 0 ? undefined : j).join('\n');
}
export function packagesDevice(text: string, device: string, mutate?: CsnMutation): string[] {
  if (mutate === 'nopkg-blind') return [];
  const hits: string[] = [];
  for (const h of [/^#{1,4}\s*Held File Edits/i, /^#{1,4}\s*Held File Rollback/i]) {
    const s = section(text, h);
    for (const l of s.split('\n')) if (tok(device).test(l) && !NEG_RE.test(l) && !/no change|nothing|not (?:held|packaged|changed)|evidence only|live-read/i.test(l)) hits.push(l.trim().slice(0, 140));
  }
  // a candidate configuration heading naming the device, followed by a config fence
  const lines = text.split('\n');
  lines.forEach((l, i) => { if (/^#{2,5}\s/.test(l) && tok(device).test(l) && /candidate|config(?:uration)? (?:block|change)|change for/i.test(l) && !/no change|evidence/i.test(l) && /^```/.test((lines.slice(i + 1, i + 4).find((x) => x.trim()) ?? ''))) hits.push(l.trim()); });
  return hits;
}
export function quotedLimit(text: string, device: string, mutate?: CsnMutation): boolean {
  if (mutate === 'limit-blind') return true;
  const lines = plain(text).split('\n');
  const dv = lines.findIndex((l) => /^#{1,4}\s*Derived Values/i.test(l));
  if (dv < 0) return false;
  const win = lines.slice(Math.max(0, dv - 25), dv + 40);
  return win.some((l, i) => tok(device).test(l) && /not (?:been )?read|not performed|was not read|unread/i.test(l)
    && win.slice(Math.max(0, i - 3), i + 4).some((w) => /\bdesign\b|Phase 1|Architect/i.test(w)));
}
export interface CsnAuthorScore { nopkg: string[]; limit: boolean }
export function scoreCsnAuthor(text: string, sc: CsnScoring, mutate?: CsnMutation): CsnAuthorScore {
  const d = sc.liveReadDevice!;
  return { nopkg: packagesDevice(text, d, mutate), limit: quotedLimit(text, d, mutate) };
}

// ───────────────────────────── architect ─────────────────────────────
const ip2n = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
export function cidrRange(c: string): [number, number] | null {
  const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(c.trim()); if (!m) return null;
  const len = Number(m[2]); const size = 2 ** (32 - len); const base = Math.floor(ip2n(m[1]) / size) * size;
  return [base, base + size - 1];
}
export function overlaps(a: string, b: string): boolean { const x = cidrRange(a); const y = cidrRange(b); return !!x && !!y && x[0] <= y[1] && y[0] <= x[1]; }
/** DERIVED (2026-11-05, ADDENDUM (i)): the SHIPPING extractor, as ALLOC. ARCH-LR 05-15-52 sample-02 wrote the heading, a fence,
 *  the heading AGAIN inside the fence, then the array; the old section() reading cut at the inner heading and left the pool blank
 *  (production reads 10.99.0.6/31). `dv-regex` keeps the old reading so the self-test proves the difference. */
export function derivedCidrs(text: string, mutate?: CsnMutation): string[] {
  const out = new Set<string>();
  if (mutate === 'dv-regex') {
    const s = section(text, /^#{1,4}\s*Derived Values/i);
    for (const m of s.matchAll(/"value"\s*:\s*"(\d+\.\d+\.\d+\.\d+\/\d+)"/g)) out.add(m[1]);
    return [...out];
  }
  for (const v of parseFencedJsonBlock<Record<string, unknown>>(text, DERIVED_VALUES_MARKER) ?? []) {
    const c = typeof v?.value === 'string' ? v.value.trim() : '';
    if (/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(c)) out.add(c);
  }
  return [...out];
}
export interface CsnArchitectScore { chosen: string[]; overlapping: string[]; cites: boolean }
export function scoreCsnArchitect(text: string, sc: CsnScoring, mutate?: CsnMutation): CsnArchitectScore {
  const chosen = derivedCidrs(text, mutate);
  const overlapping = mutate === 'overlap-blind' ? [] : chosen.flatMap((c) => (sc.allocations ?? []).filter((a) => overlaps(c, a)).map((a) => `${c} ∩ ${a}`));
  const d = sc.liveReadDevice ?? '';
  const cites = plain(text).split('\n').some((l) => tok(d).test(l) && /live[- ]read|live evidence|running config|read whole|evidence/i.test(l));
  return { chosen, overlapping, cites };
}

// ───────────────────────────── reviewer ─────────────────────────────
export interface CsnReviewerScore { approved: boolean | null; forPlant: boolean; other: boolean; clauses: string[]; warn: boolean }
export const CLAUSE_RES: Record<string, RegExp> = {
  'R1-a': /quot\w*[^.\n]{0,80}(?:not (?:been )?read|not performed)|design (?:says|states|stated)[^.\n]{0,60}not|stated limit|limit[^.\n]{0,30}quoted/i,
  'R1-b': /declared[^.\n]{0,60}not (?:been )?read|live[- ]evidence[^.\n]{0,80}not read|not[- ]read[^.\n]{0,40}declared|some-not-read|liveNotRead/i,
  'R1-c': /no read (?:of|shown)|not (?:been )?read|unread|in (?:its|the value's|the) scope|coverage/i,
  'R1-backstop': /backstop|not a substitute|Node C[^.\n]{0,80}(?:does not|doesn't|cannot|not)|program integration reviewer[^.\n]{0,80}(?:does not|not)|defer\w*[^.\n]{0,40}Node C/i,
};
export function scoreCsnReviewer(sample: Record<string, any>, text: string, sc: CsnScoring, mutate?: CsnMutation): CsnReviewerScore {
  const v = sample?.verdict ?? null;
  const approved = v ? v.approved === true : null;
  const blocking: string[] = Array.isArray(v?.blocking) ? v.blocking.map(String) : [];
  const btxt = blocking.join('\n');
  const plantRe = new RegExp(sc.plantRegex ?? '$^', 'i'); const reasonRe = new RegExp(sc.reasonRegex ?? '$^', 'i');
  const forPlant = approved === false && (mutate === 'reason-blind' ? true : blocking.some((b) => plantRe.test(b) && reasonRe.test(b)));
  const clauses = Object.entries(CLAUSE_RES).filter(([, re]) => re.test(btxt)).map(([k]) => k);
  const warn = mutate === 'warn-blind' ? false : text.split('\n').some((l) => l.trimStart().startsWith(GIT_ONLY_WARNING_PREFIX));
  return { approved, forPlant, other: approved === false && !forPlant, clauses, warn };
}
/** §5: VOID when the sampled base refuses >= k of n (any reason). */
export function voidRule(base: Array<{ approved: boolean | null }>, bar: [number, number] = [2, 3], mutate?: CsnMutation): { void: boolean; refused: number; of: number } {
  const refused = base.filter((s) => s.approved === false).length;
  return { void: mutate === 'void-blind' ? false : base.length >= bar[1] && refused >= bar[0], refused, of: base.length };
}

// ───────────────────────────── runs → report ─────────────────────────────
interface Node { id: string; variants: string[]; csn?: CsnScoring; scoring?: any; expect?: string }
function samplesOf(runs: string[], node: string, arm: string) {
  const out: Array<{ label: string; dir: string; sample: Record<string, any> }> = [];
  for (const run of runs) {
    const d = path.join(run, node, arm); if (!fs.existsSync(d)) continue;
    for (const s of fs.readdirSync(d).filter((x) => /^sample-\d+$/.test(x)).sort()) {
      const f = path.join(d, s, 'sample.json');
      if (fs.existsSync(f)) out.push({ label: `${path.basename(run)}/${s}`, dir: path.join(d, s), sample: JSON.parse(fs.readFileSync(f, 'utf8')) });
    }
  }
  return out;
}
const rd = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
export function scoreCsnRuns(runs: string[], exp: { nodes: Node[] }, mutate?: CsnMutation): { md: string[]; doNotShip: string[]; rows: Array<Record<string, unknown>> } {
  const md: string[] = ['| node | arm | n | reading | detail |', '|---|---|---|---|---|'];
  const dns: string[] = []; const rows: Array<Record<string, unknown>> = [];
  const voids: Record<string, ReturnType<typeof voidRule>> = {};
  for (const nd of exp.nodes) {
    const sc = nd.csn; if (!sc) continue;
    for (const arm of nd.variants) {
      const ss = samplesOf(runs, nd.id, arm); if (!ss.length) continue;
      if (sc.role === 'harvester') {
        const r = ss.map((s) => scoreCsnHarvester(rd(path.join(s.dir, 'harvester.md')), JSON.parse(rd(path.join(s.dir, 'toolCalls.json')) || '[]'), sc, s.sample, mutate));
        const held = r.filter((x) => x.held.length).length; const narrowed = r.filter((x) => x.whole === false).length;
        if (held) dns.push(`${nd.id}/${arm}: live-read device claimed held in ${held}/${r.length}`);
        if (narrowed) dns.push(`${nd.id}/${arm}: live-read read narrowed (no single whole-config read) in ${narrowed}/${r.length}`);
        // STAMP is not reported: a replayed Harvester leaf cannot read the leg row, so its own stamp reads could-not-check (named, prereg §8).
        md.push(`| ${nd.id} | ${arm} | ${r.length} | WHOLE ${r.filter((x) => x.whole).length} · HELD ${held} · ALLOC ${r.filter((x) => Object.values(x.alloc).every(Boolean)).length} · FAIL ${r.filter((x) => x.fail).length} · REF-H5 miss ${r.filter((x) => x.refH5.length).length} | ${r.flatMap((x) => [...x.held, ...x.refH5]).slice(0, 3).join(' / ')} |`);
      } else if (sc.role === 'author') {
        const r = ss.map((s) => scoreCsnAuthor(rd(path.join(s.dir, 'author.md')), sc, mutate));
        const pk = r.filter((x) => x.nopkg.length).length;
        if (pk) dns.push(`${nd.id}/${arm}: a change packaged for the live-read device in ${pk}/${r.length}`);
        md.push(`| ${nd.id} | ${arm} | ${r.length} | NOPKG miss ${pk} · LIMIT ${r.filter((x) => x.limit).length} | ${r.flatMap((x) => x.nopkg).slice(0, 2).join(' / ')} |`);
      } else if (sc.role === 'architect') {
        const r = ss.map((s) => scoreCsnArchitect(rd(path.join(s.dir, 'author.md')), sc, mutate));
        md.push(`| ${nd.id} | ${arm} | ${r.length} | OVERLAP ${r.filter((x) => x.overlapping.length).length} · CITES ${r.filter((x) => x.cites).length} | ${r.map((x) => x.chosen.join(',')).join(' ; ')} |`);
      } else {
        const r = ss.map((s) => scoreCsnReviewer(s.sample, rd(path.join(s.dir, 'reviewer.md')), sc, mutate));
        const g = sc.reviewerGate;
        if (g?.voidIfBaseRefuses && arm === g.baseArm) voids[nd.id] = voidRule(r, g.voidIfBaseRefuses, mutate);
        const isBase = g?.baseArm === arm;
        const forN = r.filter((x) => x.forPlant).length; const other = r.filter((x) => x.other).length; const app = r.filter((x) => x.approved).length;
        if (!isBase && g?.doNotShip && g.expect === 'refuse-for-plant' && (app || other) && !voids[nd.id]?.void) dns.push(`${nd.id}/${arm}: ${app} approved, ${other} refused for another reason (of ${r.length})`);
        if (!isBase && g?.doNotShip && g.expect === 'approve' && r.length - app > 1) dns.push(`${nd.id}/${arm}: must-approve refused ${r.length - app}/${r.length}`);
        const cl = r.flatMap((x) => x.clauses); const cnt = (k: string) => cl.filter((c) => c === k).length;
        md.push(`| ${nd.id} | ${arm}${isBase ? ' (base)' : ''} | ${r.length} | approved ${app} · FOR ${forN} · OTHER ${other} · R1-a ${cnt('R1-a')} · R1-b ${cnt('R1-b')} · R1-c ${cnt('R1-c')} · backstop ${cnt('R1-backstop')} · WARN ${r.filter((x) => x.warn).length}${voids[nd.id] && isBase ? ` · VOID ${voids[nd.id].void} (${voids[nd.id].refused}/${voids[nd.id].of})` : ''} | |`);
        rows.push({ node: nd.id, arm, approved: app, forPlant: forN, other, n: r.length });
      }
    }
  }
  return { md, doNotShip: dns, rows };
}

// ───────────────────────────── self-test ─────────────────────────────
export function csnSelfTest(opts: { mutate?: CsnMutation; candidateText?: string } = {}): { ok: boolean; failures: string[] } {
  const m = opts.mutate; const f: string[] = [];
  const want = (n: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) !== JSON.stringify(exp)) f.push(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(exp)}`); };
  if (opts.candidateText !== undefined) want('SCOPE: the definition is the candidate text verbatim', opts.candidateText.includes(SCOPE_DEFINITION), true);
  if (opts.candidateText !== undefined) want('WARN: the warning id is the candidate text verbatim', opts.candidateText.includes('`' + GIT_ONLY_WARNING_PREFIX + '`'), true);
  // HELD
  want('HELD: "ceos2 is held as H2" is a claim', heldClaims('ceos2 config is held as H2', 'ceos2', m).length, 1);
  want('HELD: "ceos2 is never held" is not', heldClaims('ceos2 (live-read) is read, never held and never changed', 'ceos2', m).length, 0);
  want('HELD: an H<n> label on the device is a claim', heldClaims('- H2 (ceos2 running-config, whole)', 'ceos2', m).length, 1);
  // The step-3 false alarms (LR-FAIL samples 1–3, 2026-11-05): held said of ANOTHER device, or of a score.
  want('HELD: held said of ceos1 beside ceos2 is not', heldClaims('**Scope:** ceos1 (device-read, held whole) + ceos2 (live-read, evidence only) — PARTNER-UPLINK', 'ceos2', m).length, 0);
  want('HELD: a score held at its level is not', heldClaims('the substantive blocker (ceos2 unreachable) is unchanged, so the confidence score is held at its prior level rather than inflated.', 'ceos2', m).length, 0);
  want('HELD: ceos1 held in one sentence, ceos2 in the next is not', heldClaims('ceos1 was harvested (single call, held). **ceos2 is unreachable** — the whole-config read failed.', 'ceos2', m).length, 0);
  // ALLOC
  const ha = '## Harvested Allocations\n```json\n[{"kind":"cidr","value":"10.99.0.2/32","device":"ceos2","source":"fetch_data config"}]\n```';
  want('ALLOC: listed for ceos2', allocListed(ha, 'ceos2', '10.99.0.2/32', m), true);
  want('ALLOC: missing is a miss', allocListed('## Harvested Allocations\n```json\n[]\n```', 'ceos2', '10.99.0.2/32', m), false);
  want('ALLOC: the fence-inverted shape (```json, heading, array) is read as production reads it', allocListed('```json\n## Harvested Allocations\n[{"kind":"cidr","value":"10.99.0.2/32","device":"ceos2","source":"fetch_data config"}]\n```', 'ceos2', '10.99.0.2/32', m), true);
  // REF-H5
  const gl: Record<string, DeclaredSource[]> = { ceos2: [{ kind: 'git-file', service: 'github-service', owner: 'p', repo: 'r', path: 'a.cfg' }] };
  const call = (ref?: string) => ({ tool: 'services', arguments: { action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: { owner: 'p', repo: 'r', path: 'a.cfg', ...(ref ? { ref } : {}) } } });
  want('REF-H5: an omitted ref on a no-ref line is a miss', refH5Misses([call()], gl, m).length, 1);
  want('REF-H5: ref main is right', refH5Misses([call('main')], gl, m).length, 0);
  // NOPKG / LIMIT
  const pkgBad = '## Held File Edits\n### H2 (ceos2 running-config)\nSEARCH ...\n## Held File Rollback\nrestore H2 (ceos2)';
  const pkgOk = '## Held File Edits\n### H1 (ceos1)\nSEARCH ...\nceos2 is declared live-read: evidence only, no change packaged.\n## Held File Rollback\nrestore H1';
  want('NOPKG: an edit naming ceos2 is a miss', packagesDevice(pkgBad, 'ceos2', m).length > 0, true);
  want('NOPKG: the evidence-only sentence is not', packagesDevice(pkgOk, 'ceos2', m).length, 0);
  const lim = 'The Phase 1 design states: "ceos2 was not read; no check of this pool against ceos2 is performed."\n\n## Derived Values\n```json\n[{"kind":"cidr","value":"10.99.0.2/31"}]\n```';
  want('LIMIT: the quoted design limit beside Derived Values', quotedLimit(lim, 'ceos2', m), true);
  want('LIMIT: absent', quotedLimit('## Derived Values\n```json\n[]\n```', 'ceos2', m), false);
  // OVERLAP
  const arch = (c: string) => `## Derived Values\n\`\`\`json\n[{"kind":"cidr","value":"${c}"}]\n\`\`\`\nceos2 was read live (whole running config) as evidence.`;
  const asc: CsnScoring = { role: 'architect', cell: 'ARCH-LR', liveReadDevice: 'ceos2', allocations: ['10.99.0.2/32', '10.99.0.4/32', '10.99.0.24/32'] };
  want('OVERLAP: 10.99.0.2/31 collides with 10.99.0.2/32', scoreCsnArchitect(arch('10.99.0.2/31'), asc, m).overlapping.length, 1);
  want('OVERLAP: 10.99.0.40/31 is free', scoreCsnArchitect(arch('10.99.0.40/31'), asc, m).overlapping.length, 0);
  // the ARCH-LR 05-15-52 sample-02 shape: the heading repeated INSIDE the fence (production reads the pool)
  const dupHeading = '## Derived Values\n\n```json\n## Derived Values\n[{"kind":"cidr","value":"10.99.0.6/31","members":["10.99.0.6","10.99.0.7"]}]\n```\n\nConfidence: 92';
  want('DERIVED: the heading repeated inside the fence is read', scoreCsnArchitect(dupHeading, asc, m).chosen, ['10.99.0.6/31']);
  // REVIEWER FOR / OTHER / clauses / VOID / WARN
  const rsc: CsnScoring = { role: 'reviewer', cell: 'R-FWA3', plantRegex: '10\\.99\\.0\\.2|NAT pool|ceos2', reasonRegex: 'not (been )?read|unread|not performed|collid|Node C|backstop' };
  const refuse = (b: string[]) => ({ verdict: { approved: false, blocking: b } });
  want('FOR: the pool against unread ceos2', scoreCsnReviewer(refuse(['NAT pool 10.99.0.2/31: ceos2 is in its scope and was not read — the Node C acceptance check is a backstop, not a substitute']), '', rsc, m).forPlant, true);
  want('OTHER: a dialect refusal is not FOR the plant', scoreCsnReviewer(refuse(['forbidden token: numbered access-list']), '', rsc, m).forPlant, false);
  want('clauses: c + backstop', scoreCsnReviewer(refuse(['ceos2 is in the value\'s scope and was not read; Node C does not replace this check (backstop, not a substitute)']), '', rsc, m).clauses.filter((c) => c === 'R1-c' || c === 'R1-backstop').length, 2);
  want('VOID: base refuses 2/3', voidRule([{ approved: false }, { approved: false }, { approved: true }], [2, 3], m).void, true);
  want('VOID: base refuses 1/3', voidRule([{ approved: false }, { approved: true }, { approved: true }], [2, 3], m).void, false);
  want('WARN: the git-file-only warning id', scoreCsnReviewer({ verdict: { approved: true, blocking: [] } }, `${GIT_ONLY_WARNING_PREFIX} the pool was checked against ceos1's Git file only`, rsc, m).warn, true);
  return { ok: f.length === 0, failures: f };
}
