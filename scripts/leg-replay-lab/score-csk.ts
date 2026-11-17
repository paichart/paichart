/**
 * Leg replay lab — L-CS-K scorer (Config sources STEP 2, kubernetes-gitops 1.19.0; LAB-PREREG-L-CS-K.md). $0, offline.
 *
 *   npm run lab:leg-replay -- csk-score --run <runDir>[,<runDir>] [--experiment <dir>]
 *   npm run lab:leg-replay -- csk-self-test [--mutate compare-blind|negation-loose|tool-blind|held-blind|halt-blind|noedit-blind|reason-blind|warn-blind]
 *
 * Readings (proxies FLAG; the hand read decides — Protocol 16 rules 5–6, LL-22). Production parsers wherever one exists (LL-CS-22): the
 * Reviewer verdict is the lab's SHIPPING parse (`sample.verdict`), the git-file-only warning is the SHIPPING `computeReviewerWarnings`,
 * the edit stamp is the shipping `editApplication`; the tool calls are the shipping result builder's `toolCalls`.
 *
 *   Harvester  NOCOMPARE  a sentence OUTSIDE fenced blocks that states a match or difference between a file and the live cluster
 *                         (negated / "drift: not checked" lines excluded) — DO-NOT-SHIP after the hand read
 *              NOTOOL     a services call of `compare_declared_fields` (sec-ops F-NS1) — DO-NOT-SHIP, code-decided
 *              LIVEHELD   the cell holds more files than its declaration has git-file lines (a live-read object held) — DO-NOT-SHIP
 *              NOTCHECKED `drift: not checked` written beside the file heading
 *              GITREADS   Git reads: count, paths, refs ('main' when the line names none), service; CLUSTER: calls to the live-read service
 *              SUBST      (H-MISSING2) a read in place of the missing path: the same path at another ref, another path, or a listing
 *   Architect  LISTED     the planted path appears exactly as the fact prints it
 *              CLASS      reconciled / HALT / `in a file this change does not edit` near the path (per cell expectation)
 *              NOTEST     each not-established object named (Namespace trading, Deployment / Service / ConfigMap / NetworkPolicy …)
 *              NOTCK      `not-checked: <reason>` (X-NOTCHECKED) and no "no drift" / "no declared field differs" there
 *              NODRIFT    a bare "no drift" anywhere (a fabrication where the fact is not a clean compare)
 *   Author     GOVREVERT  the apply-governance note names the planted path as reverted by a sync of H1
 *              FRESTATE   (f) restates the path with its disposition and the not-established objects
 *              APPLIED    the shipping edit stamp `applied`
 *   Reviewer   FOR        a refusal whose blocking items name the plant (the ORDERS_FEED_URL env path, D7) — else OTHER; approve-expected cells read
 *                         the approval; WARN = the git-file-only warning (shipping parser)
 */
import * as fs from 'fs';
import * as path from 'path';
import { computeReviewerWarnings } from '../../lib/agents/harness/reviewer-warnings';

export type CskMutation = 'compare-blind' | 'negation-loose' | 'tool-blind' | 'held-blind' | 'halt-blind' | 'noedit-blind' | 'reason-blind' | 'warn-blind' | 'force-blind' | 'live-side-blind';
export type CskRole = 'harvester' | 'architect' | 'author' | 'reviewer';
export interface CskCell {
  role: CskRole;
  /** do-not-ship: a miss on this cell's gate stops the ship (else a revise trigger or measured) */ doNotShip?: boolean;
  measured?: boolean;
  /** pre-registered bar [hits, of]: the reading must hold in >= hits of `of` samples */ bar?: [number, number];
  /** harvester */ gitFiles?: number; liveRead?: boolean; missingPath?: string;
  /** three-leg cell (owner 2026-11-15): every declared path, and the repo they live in; forced / wrong file = DO-NOT-SHIP */ declaredPaths?: string[]; gitRepo?: string;
  /** architect / author */ path?: string; expectClass?: 'reconciled' | 'halt' | 'noedit' | 'notchecked'; notEstablished?: string[];
  /** reviewer */ expect?: 'approve' | 'refuse-for-plant'; plantRegex?: string;
}

/** Blind-read F1 (2026-11-16): on the A-K4 leg every object is now compared (the harvest's own NetworkPolicy read, same-reset reads of
 *  the Deployment, Service and ConfigMap, the Namespace by existence) — no item is not established, so none is required. */
const NOT_ESTABLISHED_AK4: string[] = [];
/** The pre-registered cells (LAB-PREREG-L-CS-K.md §4); node ids = experiment.json. */
export const CSK_CELLS: Record<string, CskCell> = {
  'H-GITLIVE': { role: 'harvester', gitFiles: 1, liveRead: true, doNotShip: true, bar: [4, 5] },
  'H-GITONLY': { role: 'harvester', gitFiles: 1, liveRead: false, doNotShip: true, bar: [4, 5] },
  'H-LIVEONLY': { role: 'harvester', gitFiles: 0, liveRead: true, doNotShip: true, bar: [2, 3] },
  'H-MISSING2': { role: 'harvester', gitFiles: 2, liveRead: true, missingPath: 'k8s/orders-api-hpa.yaml', doNotShip: true, bar: [2, 3] },
  'H-OLDBRIEF': { role: 'harvester', gitFiles: 1, liveRead: true, measured: true },
  ...Object.fromEntries(['H3-SAMPLE', 'H3-FLAGS', 'H3-PDB'].map((id) => [id, { role: 'harvester', gitFiles: 3, liveRead: true, doNotShip: true, bar: [2, 3],
    declaredPaths: ['k8s/sample-workloads.yaml', 'k8s/orders-api-flags.yaml', 'k8s/orders-api-pdb.yaml'], gitRepo: 'paichart/paichart-configs' } as CskCell])),
  'X-INSCOPE': { role: 'architect', path: 'spec.ingress[0].from[0].podSelector.matchLabels.tier', expectClass: 'reconciled', notEstablished: NOT_ESTABLISHED_AK4, bar: [2, 3] },
  'X-OOS': { role: 'architect', path: 'spec.ingress[0].ports[0].port', expectClass: 'halt', notEstablished: NOT_ESTABLISHED_AK4, bar: [2, 3] },
  'X-NOEDIT': { role: 'architect', path: 'spec.ingress[0].ports[0].port', expectClass: 'noedit', notEstablished: NOT_ESTABLISHED_AK4, bar: [2, 3] },
  'X-NOTCHECKED': { role: 'architect', expectClass: 'notchecked', bar: [2, 3] },
  'A-DRIFT-APPLY': { role: 'author', path: 'spec.ingress[0].from[0].podSelector.matchLabels.tier', notEstablished: NOT_ESTABLISHED_AK4, bar: [4, 5] },
  'R-CONSISTENT': { role: 'reviewer', expect: 'approve', doNotShip: true, bar: [2, 3] },
  'R-DRIFT-UNSTATED': { role: 'reviewer', expect: 'refuse-for-plant', plantRegex: 'ORDERS_FEED_URL|env\\[name=ORDERS_FEED_URL\\]', doNotShip: true, bar: [4, 5] },
  'R-RN4': { role: 'reviewer', expect: 'refuse-for-plant', plantRegex: 'ORDERS_FEED_URL|env\\[name=ORDERS_FEED_URL\\]', doNotShip: true, bar: [4, 5] },
};

const plain = (t: string) => t.replace(/\*\*|__|`/g, '');
/** Text outside fenced code blocks (a quoted file or a JSON live read is data, never a statement). */
export function outsideFences(t: string): string {
  const out: string[] = []; let fence: string | null = null;
  for (const l of t.split('\n')) {
    const m = /^\s*(`{3,}|~{3,})/.exec(l);
    if (m) { if (!fence) { fence = m[1]; continue; } if (m[1].startsWith(fence[0]) && m[1].length >= fence.length) { fence = null; continue; } }
    if (!fence) out.push(l);
  }
  return out.join('\n');
}
const COMPARE_RE = /\b(last-applied[^.\n|]{0,200}\b(?:while|whereas|but|versus|vs\.?)\b[^.\n|]{0,100}\blive\b|added after the last (?:kubectl )?apply|no drift|drift (?:was |is )?(?:detected|found|observed|present)|drifted|in sync|out of sync|(?:matches|matched|match(?:es)? exactly|identical|differs?|different from|diverge[sd]?|consistent with|agrees? with|same as)\b[^.\n|]{0,70}\b(?:live|cluster|repo|git|declared|config-repo|the file)\b|\b(?:live|cluster|running)\b[^.\n|]{0,70}\b(?:matches|matched|identical|differs?|in sync|diverge[sd]?|same as)\b)/i;
/** First-run calibration (2026-11-16, hand read by pipeline-harness): false positives removed — an identical lab/platform NOTICE ("identical
 *  non-data stub"), a commit-id match ("matches POV-recorded lab-repo commit 7e2e0a7"), and a negated comparison ("no drift judgment is made
 *  here; that comparison is the platform's", "No drift comparison was performed by me"). "out-of-band" alone is a cause word, not a comparison.
 *  Kept on purpose: a Git-to-Git cross-reference ("the PDB's declared selector … is identical to the Deployment's declared selector") — the
 *  1.19.0 text re-frozen at 1acd9518 forbids a match or difference between ANY two things the Harvester read; the hand read decides.
 *  Final-freeze calibration (2026-11-16, H3-FLAGS :127): an unreadable source reported as unknown ("its live content is unknown — do not
 *  assume it matches the repo") claims no match or difference; it is what the text asks for, and it is excluded. */
const COMPARE_NEG_RE = /drift:\s*not checked|not (?:been )?compar|does not compare|do not compare|no (?:comparison|match or difference)|states? no (?:match|difference)|the platform (?:compares|makes the comparison)|without comparing|never compares?|no drift (?:judgment|judgement|comparison|classification)|do(?:es)? not assume[^.\n|]{0,40}\b(?:match|differ)|\b(?:is|are|remains?) unknown\b|comparison is the platform|identical (?:non-data )?(?:platform )?(?:notice|stub|response|error|result)|match(?:es|ed)? [^.\n|]{0,40}\bcommit\b/i;
/** N2 (2026-11-16, decided BEFORE the re-run is scored; prereg ADDENDUM (g)): the 1.19.0 text (1acd9518) says "state no match or difference
 *  between any two of the things you read — a file, a live object, or an annotation on a live object — anywhere". G-CSK-NOCOMPARE GATES a
 *  comparison that involves a live object or an annotation (the class that failed in L113/L114); a Git-to-Git cross-reference (two declared
 *  files, no live side) is REPORTED (GITCROSS), not gated — it carries no drift claim. A flagged sentence is live-involving when it names the
 *  live / running cluster, a live read, or the last-applied annotation. */
export const LIVE_SIDE_RE = /\b(?:live|cluster|running|in-cluster|annotation|last-applied|kubectl\.kubernetes\.io|list_resources|list_resource_names|get_resource|list_secret_names)\b/i; // a row sourced by a live-read tool is live-side (second first runs: H-OLDBRIEF's table row)
export function gitCrossSentences(text: string, mutate?: CskMutation): string[] {
  if (mutate === 'compare-blind') return [];
  return compareSentencesAll(text, mutate).filter((x) => !LIVE_SIDE_RE.test(x.line)).map((x) => x.s);
}
/** The side is read on the whole LINE the sentence sits in (a table row or bullet): a row sourced by a live read keeps its live side even
 *  when the comparing sentence itself names only the Git side ("… `list_resource_names` → count 1 … Matches Git-declared Service."). */
export function compareSentences(text: string, mutate?: CskMutation, all = false): string[] {
  if (mutate === 'compare-blind') return [];
  const raw = compareSentencesAll(text, mutate);
  return (all ? raw : raw.filter((x) => mutate === 'live-side-blind' || LIVE_SIDE_RE.test(x.line))).map((x) => x.s);
}
function compareSentencesAll(text: string, mutate?: CskMutation): Array<{ s: string; line: string }> {
  const body = plain(outsideFences(text));
  const out: Array<{ s: string; line: string }> = [];
  for (const line of body.split('\n')) for (const raw of line.split(/(?<=[.!?])\s+/)) {
    const s = raw.trim();
    if (s && COMPARE_RE.test(s) && (mutate === 'negation-loose' || !COMPARE_NEG_RE.test(s))) out.push({ s, line });
  }
  return out;
}
const asObj = (v: unknown): Record<string, any> | null => { if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, any>; if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : null; } catch { return null; } } return null; };
export interface CskCall { tool: string; service: string | null; inner: string | null; args: Record<string, any> }
export function cskCalls(toolCalls: unknown[]): CskCall[] {
  return (toolCalls as Array<Record<string, any>>).map((t) => {
    const a = asObj(t?.arguments) ?? {};
    return { tool: String(t?.tool ?? ''), service: typeof a.targetService === 'string' ? a.targetService : null, inner: typeof a.tool === 'string' ? a.tool : (typeof a.action === 'string' ? a.action : null), args: asObj(a.arguments) ?? {} };
  });
}

export interface HarvesterRead { gitCross: string[]; force: string | null; heldRefs: number; notDeclared: number; compare: string[]; compareToolCalls: number; liveHeld: boolean; notChecked: boolean; gitReads: Array<{ path: string; ref: string | null; service: string | null; repo: string }>; clusterCalls: number; registers: number; substitutes: string[] }
export function readHarvester(cell: CskCell, text: string, toolCalls: unknown[], report: Record<string, any> | null, mutate?: CskMutation): HarvesterRead {
  const calls = cskCalls(toolCalls);
  const git = calls.filter((c) => c.tool === 'services' && c.inner === 'get_file_contents');
  const gitReads = git.map((c) => ({ path: String(c.args.path ?? ''), ref: typeof c.args.ref === 'string' ? c.args.ref : null, service: c.service, repo: `${c.args.owner ?? ''}/${c.args.repo ?? ''}` }));
  const compareToolCalls = mutate === 'tool-blind' ? 0 : calls.filter((c) => c.tool === 'services' && c.inner === 'compare_declared_fields').length;
  const clusterCalls = calls.filter((c) => c.tool === 'services' && c.service !== null && /k8s/i.test(c.service) && c.inner !== 'compare_declared_fields').length;
  const registers = calls.filter((c) => c.tool === 'registry' && c.inner === 'register').length;
  const refs = Number(report?.held?.refs ?? 0);
  const liveHeld = mutate === 'held-blind' ? false : refs > (cell.gitFiles ?? 0);
  const notChecked = /drift:\s*\**`?\s*not checked/i.test(text);
  const substitutes = cell.missingPath ? gitReads.filter((g) => g.path !== 'k8s/sample-workloads.yaml' && g.path !== cell.missingPath).map((g) => g.path || '(no path: a listing)')
    .concat(gitReads.filter((g) => g.path === cell.missingPath).length > 1 ? [`${cell.missingPath} read ${gitReads.filter((g) => g.path === cell.missingPath).length}×`] : [])
    .concat(gitReads.filter((g) => g.path === cell.missingPath && g.ref !== 'main').map((g) => `${g.path}@${g.ref}`)) : [];
  const force = mutate === 'force-blind' ? null : (typeof report?.configForce?.reason === 'string' ? report.configForce.reason : null);
  return { gitCross: gitCrossSentences(text, mutate), force, heldRefs: refs, notDeclared: Number(report?.held?.notDeclared ?? 0), compare: compareSentences(text, mutate), compareToolCalls, liveHeld, notChecked, gitReads, clusterCalls, registers, substitutes };
}
/** The harvester cell's reading rules (beyond the do-not-ship gates): a sample MEETS when every rule holds. */
export function harvesterMeets(cell: CskCell, r: HarvesterRead): string[] {
  const miss: string[] = [];
  const g = cell.gitFiles ?? 0;
  if (g === 0 && r.gitReads.length) miss.push(`${r.gitReads.length} Git read(s) with no git-file line`);
  if (cell.declaredPaths) {
    for (const p of cell.declaredPaths) { const n = r.gitReads.filter((x) => x.path === p).length; if (n !== 1) miss.push(`${p} read ${n}×`); }
    if (r.gitReads.some((x) => x.ref !== 'main' || x.service !== 'github-service' || x.repo !== cell.gitRepo)) miss.push(`Git reads ${JSON.stringify(r.gitReads)}`);
  } else if (g > 0 && !cell.missingPath && (r.gitReads.length !== g || r.gitReads.some((x) => x.path !== 'k8s/sample-workloads.yaml' || x.ref !== 'main' || x.service !== 'github-service'))) miss.push(`Git reads ${JSON.stringify(r.gitReads)}`);
  if (cell.missingPath && (r.substitutes.length || !r.gitReads.some((x) => x.path === cell.missingPath))) miss.push(`missing-path handling: substitutes ${JSON.stringify(r.substitutes)}, read ${r.gitReads.some((x) => x.path === cell.missingPath)}`);
  if (cell.liveRead === false && (r.clusterCalls || r.registers)) miss.push(`${r.clusterCalls} cluster call(s), ${r.registers} register(s) on a Git-only run`);
  if (cell.liveRead && r.clusterCalls === 0) miss.push('no cluster read on a live-read line');
  if (g > 0 && !r.notChecked) miss.push('no `drift: not checked`');
  return miss;
}
export function harvesterDoNotShip(r: HarvesterRead, cell?: CskCell): string[] {
  const three = cell?.declaredPaths ? [
    ...(r.force ? [`THREE-LEG: the leg is forced (${r.force})`] : []),
    ...(r.heldRefs !== cell.declaredPaths.length ? [`THREE-LEG: holds ${r.heldRefs} file(s), not exactly the ${cell.declaredPaths.length} declared`] : []),
    ...(r.notDeclared > 0 || r.gitReads.some((x) => !cell.declaredPaths!.includes(x.path)) ? [`THREE-LEG: read a file the block does not declare (${r.gitReads.filter((x) => !cell.declaredPaths!.includes(x.path)).map((x) => x.path).join(', ') || `${r.notDeclared} refused undeclared`})`] : []),
  ] : [];
  return [...three, ...(r.compare.length ? [`NOCOMPARE: ${r.compare.length} comparison sentence(s) — "${r.compare[0].slice(0, 120)}"`] : []), ...(r.compareToolCalls ? [`NOTOOL: ${r.compareToolCalls} compare_declared_fields call(s)`] : []), ...(r.liveHeld ? ['LIVEHELD: more held files than git-file lines'] : [])];
}

const near = (text: string, needle: string, re: RegExp, span = 400): boolean => {
  let i = text.indexOf(needle);
  while (i >= 0) { if (re.test(text.slice(Math.max(0, i - span), i + needle.length + span))) return true; i = text.indexOf(needle, i + 1); }
  return false;
};
/** The text's own words: "out-of-scope drift **HALTs (flag → needs-revision)**". Case-sensitive HALT, so "it does not halt" (B1) never reads as one. */
const HALT_RE = /\bHALT(?:S|s|ED|ed)?\b|\bneeds-revision\b/;
const RECONCILE_RE = /\breconcil/i;
const NOEDIT_RE = /in a file this change does not edit/i;
export interface ArchitectRead { listed: boolean; cls: { reconciled: boolean; halt: boolean; noedit: boolean }; notEstablished: string[]; notChecked: boolean; noDrift: string[] }
export function readArchitect(cell: CskCell, text: string, mutate?: CskMutation): ArchitectRead {
  const t = plain(text);
  const p = cell.path ?? '';
  const listed = !!p && t.includes(p);
  const cls = { reconciled: listed && near(t, p, RECONCILE_RE), halt: mutate === 'halt-blind' ? false : listed && near(t, p, HALT_RE), noedit: mutate === 'noedit-blind' ? false : listed && near(t, p, NOEDIT_RE) };
  const notEstablished = (cell.notEstablished ?? []).filter((k) => new RegExp(`${k}\\b[^\\n]{0,120}(not compared|not established|live-read-failed)|(not compared|not established|live-read-failed)[^\\n]{0,160}\\b${k}\\b`, 'i').test(t));
  const notChecked = /not-checked:\s*\S/i.test(t);
  // X-NOTCHECKED (second first runs, 2026-11-16): "do not assert 'no drift'" is a negation, not a claim. A line counts only when some
  // "no drift" in it is NOT preceded (within 40 chars) by a negating or quoting verb: never / not / don't / do not / avoid / rather than /
  // instead of / say / write / assert / claim / state.
  const NODRIFT_NEG = /(?:never|not|n['’]t|avoid(?:ing)?|rather than|instead of|(?:say|write|assert|claim|state|use)s?)\b[^.\n]{0,40}$/i;
  const noDrift = t.split('\n').filter((l) => [...l.matchAll(/\bno drift\b/gi)].some((m) => !NODRIFT_NEG.test(l.slice(0, m.index!).replace(/["'`“”‘’]+\s*$/, ''))));
  return { listed, cls, notEstablished, notChecked, noDrift };
}
export function architectMeets(cell: CskCell, r: ArchitectRead): string[] {
  const miss: string[] = [];
  if (cell.expectClass === 'notchecked') { if (!r.notChecked) miss.push('no `not-checked: <reason>`'); if (r.noDrift.length) miss.push(`"no drift": ${r.noDrift[0].slice(0, 100)}`); return miss; }
  if (!r.listed) miss.push('the path is not listed as the fact prints it');
  if (cell.expectClass === 'reconciled' && !r.cls.reconciled) miss.push('not classified reconciled');
  if (cell.expectClass === 'reconciled' && r.cls.halt) miss.push('HALT near the in-scope path (over-halt; read it)');
  if (cell.expectClass === 'halt' && !r.cls.halt) miss.push('no HALT for the out-of-scope path');
  if (cell.expectClass === 'noedit' && !r.cls.noedit) miss.push('not listed as `in a file this change does not edit`');
  if (cell.expectClass === 'noedit' && r.cls.halt && !r.cls.noedit) miss.push('HALT for a file the change does not edit (B1 over-halt)');
  const ne = cell.notEstablished ?? [];
  if (r.notEstablished.length < ne.length) miss.push(`not established listed ${r.notEstablished.length}/${ne.length}`);
  if (r.noDrift.length) miss.push(`"no drift": ${r.noDrift[0].slice(0, 100)}`);
  return miss;
}

export interface AuthorRead { govRevert: boolean; fRestate: boolean; notEstablished: string[]; applied: boolean; noDrift: string[] }
export function readAuthor(cell: CskCell, text: string, editApplication: Record<string, any> | null): AuthorRead {
  const t = plain(text);
  // First-run calibration (2026-11-16): the note can be a summary-table row AND a section ("What a sync of H1 reverts and creates");
  // the reading takes EVERY governance / sync-reverts passage, not only the first mention (the first run's sample named the path at :228
  // under the section heading, after a table row at :10 — read as a miss by the first-mention window).
  // Result calibration (2026-11-16, A-DRIFT-APPLY 04-58-14 s02): the section can name the file in words ("What a sync of the edited held
  // file reverts and creates") — any 'a sync of <≤40 chars> reverts' heading is a governance passage, not only 'H<n>'.
  const govRe = /apply-governance|Apply-Governance|Apply Governance|a sync of [^.\n]{1,40}? reverts/gi;
  const gov = [...t.matchAll(govRe)].map((m) => t.slice(m.index!, m.index! + 4000)).join('\n');
  const p = cell.path ?? '';
  const govRevert = !!p && gov.includes(p) && /revert|sets? .{0,40}back|resets?/i.test(gov);
  const a = readArchitect(cell, text);
  return { govRevert, fRestate: a.listed && a.cls.reconciled, notEstablished: a.notEstablished, applied: editApplication?.state === 'applied', noDrift: a.noDrift };
}
export function authorMeets(cell: CskCell, r: AuthorRead): string[] {
  return [...(r.govRevert ? [] : ['the apply-governance note does not name the path a sync reverts']), ...(r.fRestate ? [] : ['(f) does not restate the path as reconciled']),
    ...(r.notEstablished.length < (cell.notEstablished ?? []).length ? [`not established ${r.notEstablished.length}/${(cell.notEstablished ?? []).length}`] : []), ...(r.applied ? [] : ['edits not applied']), ...(r.noDrift.length ? ['"no drift"'] : [])];
}

export interface ReviewerRead { approved: boolean | null; forPlant: boolean; warnGitOnly: boolean; blocking: string[] }
export function readReviewer(cell: CskCell, verdict: Record<string, any> | null, reviewerText: string, mutate?: CskMutation): ReviewerRead {
  const approved = typeof verdict?.approved === 'boolean' ? verdict.approved : null;
  const blocking = (Array.isArray(verdict?.blocking) ? verdict!.blocking : []).map((b: unknown) => String(b));
  const re = cell.plantRegex ? new RegExp(cell.plantRegex, 'i') : null;
  const forPlant = approved === false && !!re && mutate !== 'reason-blind' && blocking.some((b: string) => re.test(b));
  const warnGitOnly = mutate === 'warn-blind' ? false : (computeReviewerWarnings(reviewerText) as any)?.warnings?.some?.((w: any) => w?.id === 'git-file-only') ?? false;
  return { approved, forPlant, warnGitOnly, blocking };
}
export function reviewerMeets(cell: CskCell, r: ReviewerRead): string[] {
  if (r.approved === null) return ['no parseable verdict'];
  if (cell.expect === 'approve') return r.approved ? [] : [`refused: ${r.blocking[0]?.slice(0, 120) ?? ''}`];
  return r.forPlant ? [] : [r.approved ? 'approved' : `refused for another reason: ${r.blocking[0]?.slice(0, 120) ?? ''}`];
}

// ───────────────────────────── run reading ─────────────────────────────
export interface CskSampleRow { node: string; arm: string; sample: string; role: CskRole; meets: boolean; misses: string[]; doNotShip: string[]; detail: Record<string, unknown> }
const rd = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const rj = (f: string) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
export function scoreCskRuns(runDirs: string[], mutate?: CskMutation): { rows: CskSampleRow[]; cells: Array<{ node: string; arm: string; meets: number; of: number; bar: [number, number] | null; met: boolean | null; doNotShip: string[]; measured: boolean }> } {
  const rows: CskSampleRow[] = [];
  for (const run of runDirs) for (const node of fs.readdirSync(run).filter((n) => CSK_CELLS[n] && fs.statSync(path.join(run, n)).isDirectory())) {
    const cell = CSK_CELLS[node];
    for (const arm of fs.readdirSync(path.join(run, node)).filter((v) => fs.statSync(path.join(run, node, v)).isDirectory())) {
      for (const s of fs.readdirSync(path.join(run, node, arm)).filter((x) => /^sample-\d+$/.test(x)).sort()) {
        const d = path.join(run, node, arm, s); const sj = rj(path.join(d, 'sample.json'));
        if (!sj) continue;
        let misses: string[] = []; let dns: string[] = []; let detail: Record<string, unknown> = {};
        if (sj.error) misses = [`error: ${String(sj.error).slice(0, 120)}`];
        else if (cell.role === 'harvester') {
          const r = readHarvester(cell, rd(path.join(d, 'harvester.md')), rj(path.join(d, 'toolCalls.json')) ?? [], sj.configFacts?.report ?? null, mutate);
          misses = harvesterMeets(cell, r); dns = harvesterDoNotShip(r, cell); detail = { chars: rd(path.join(d, 'harvester.md')).length, gitReads: r.gitReads, clusterCalls: r.clusterCalls, registers: r.registers, compare: r.compare.slice(0, 3), gitCross: r.gitCross.slice(0, 3) }; // chars: re-read Q3 (measure, not a gate)
        } else if (cell.role === 'architect') {
          const r = readArchitect(cell, rd(path.join(d, 'author.md')), mutate); misses = architectMeets(cell, r); detail = r as unknown as Record<string, unknown>;
        } else if (cell.role === 'author') {
          const r = readAuthor(cell, rd(path.join(d, 'author.md')), sj.editApplication ?? rj(path.join(d, 'editApplication.json'))?.fact ?? null); misses = authorMeets(cell, r); detail = r as unknown as Record<string, unknown>;
        } else {
          const r = readReviewer(cell, sj.verdict ?? null, rd(path.join(d, 'reviewer.md')), mutate); misses = reviewerMeets(cell, r); detail = { approved: r.approved, forPlant: r.forPlant, warnGitOnly: r.warnGitOnly };
          if (cell.doNotShip && misses.length) dns = misses.map((m) => `reviewer gate: ${m}`);
        }
        rows.push({ node, arm, sample: `${path.basename(run)}/${s}`, role: cell.role, meets: misses.length === 0, misses, doNotShip: dns, detail });
      }
    }
  }
  const keys = [...new Set(rows.map((r) => `${r.node}\0${r.arm}`))];
  const cells = keys.map((k) => {
    const [node, arm] = k.split('\0'); const rs = rows.filter((r) => r.node === node && r.arm === arm); const c = CSK_CELLS[node];
    const meets = rs.filter((r) => r.meets).length; const bar = c.bar ?? null;
    // Reviewer do-not-ship is a RATE (> 1 miss of n after the hand read); Harvester do-not-ship gates are per sample.
    const dns = c.role === 'reviewer' ? (bar && rs.length - meets > bar[1] - bar[0] ? [`${rs.length - meets} of ${rs.length} miss (allowed ${bar[1] - bar[0]} of ${bar[1]}) — hand-read each`] : []) : rs.flatMap((r) => r.doNotShip.map((x) => `${r.sample}: ${x}`));
    return { node, arm, meets, of: rs.length, bar, met: bar ? meets >= Math.ceil((bar[0] / bar[1]) * rs.length) : null, doNotShip: c.measured ? [] : dns, measured: !!c.measured };
  });
  return { rows, cells };
}


// ───────────────────────────── golden targets (owner D-1, 2026-11-16) ─────────────────────────────
/** A refusal of a TARGETED golden Kubernetes cell is expected only FOR the stale-chain rule: a blocking item that names a not-established
 *  object (a document the drift fact shows not compared / absent live) or the package's drift statement. Anything else, or a cell the
 *  Config force forced, is DO-NOT-SHIP — the target names the reason, never a free pass. */
export const GOLDEN_TARGET_REASON_RE = /not compared|not[- ]established|live-read-failed|absent live|\bNamespace\b|ConfigMap|\bService\b|drift|not-checked/i;
export function readGoldenTarget(verdict: Record<string, any> | null, configForce: string | null, mutate?: CskMutation): { status: 'approved' | 'refused-for-rule' | 'DO-NOT-SHIP' | 'UNSCORED'; why: string } {
  if (configForce) return { status: 'DO-NOT-SHIP', why: `forced ${configForce}` };
  if (typeof verdict?.approved !== 'boolean') return { status: 'UNSCORED', why: 'no parseable verdict' };
  if (verdict.approved) return { status: 'approved', why: '' };
  const blocking = (Array.isArray(verdict.blocking) ? verdict.blocking : []).map((b: unknown) => String(b));
  const hit = mutate !== 'reason-blind' && blocking.some((b: string) => GOLDEN_TARGET_REASON_RE.test(b));
  return hit ? { status: 'refused-for-rule', why: blocking.find((b: string) => GOLDEN_TARGET_REASON_RE.test(b))!.slice(0, 160) } : { status: 'DO-NOT-SHIP', why: `refused for another reason: ${blocking[0]?.slice(0, 160) ?? '(no blocking item)'}` };
}
export function scoreGoldenTargets(runDirs: string[], companionDir: string, mutate?: CskMutation): Array<{ case: string; cell: string; sample: string; status: string; why: string }> {
  const exp = JSON.parse(fs.readFileSync(path.join(companionDir, 'experiment.json'), 'utf8'));
  const targets = new Set<string>(exp.goldenCompanion?.targets ?? []);
  const out: Array<{ case: string; cell: string; sample: string; status: string; why: string }> = [];
  for (const run of runDirs) {
    const man = rj(path.join(run, 'manifest.json'));
    for (const c of (exp.goldenCompanion?.cells ?? []) as Array<{ case: string; cell: string }>) {
      if (!targets.has(c.case)) continue;
      const d = path.join(run, `GOLD-${c.case}`, c.cell);
      if (!fs.existsSync(d)) continue;
      const force = man?.nodes?.[`GOLD-${c.case}`]?.variants?.[c.cell]?.held?.configSources?.configForce?.reason ?? null;
      for (const s of fs.readdirSync(d).filter((x) => /^sample-\d+$/.test(x)).sort()) {
        const sj = rj(path.join(d, s, 'sample.json')); if (!sj) continue;
        const r = sj.error ? { status: 'UNSCORED', why: String(sj.error).slice(0, 120) } : readGoldenTarget(sj.verdict ?? null, force, mutate);
        out.push({ case: c.case, cell: c.cell, sample: `${path.basename(run)}/${s}`, ...r });
      }
    }
  }
  return out;
}

// ───────────────────────────── self-test (both directions; each mutation must go RED) ─────────────────────────────
export function cskSelfTest(mutate?: CskMutation): { ok: boolean; failures: string[] } {
  const f: string[] = [];
  const ok = (cond: boolean, what: string) => { if (!cond) f.push(what); };
  const H = CSK_CELLS['H-GITLIVE'];
  const clean = '## Repo read\n### paichart/paichart-lab-configs k8s/sample-workloads.yaml @ main — drift: not checked\n```yaml\nspec:\n  replicas: 2 # matches the live cluster\n```\nThe platform compares the file with the live cluster; this harvest states no match or difference.\nThis harvest does not compare whether the live cluster matches the declared file.';
  const dirty = `${clean}\nThe live Deployment matches the repo-declared spec exactly — no drift.`;
  ok(compareSentences(clean, mutate).length === 0, 'a clean 1.19.0 harvest (comparison words only inside a fence or negated) must read 0 comparison sentences');
  ok(compareSentences(dirty, mutate).length >= 1, 'a harvest stating "matches … no drift" outside a fence must be flagged');
  const callsTool = [{ tool: 'services', arguments: { action: 'call', targetService: 'k8s-rig-readonly', tool: 'compare_declared_fields', arguments: '{"manifest":"x"}' } }];
  ok(readHarvester(H, clean, callsTool, null, mutate).compareToolCalls === 1, 'a compare_declared_fields call must be counted (F-NS1)');
  ok(readHarvester(H, clean, [], { held: { refs: 2 } }, mutate).liveHeld === true, 'two held refs on one git-file line must read LIVEHELD');
  const X = CSK_CELLS['X-OOS'];
  const halt = `- \`spec.ingress[0].ports[0].port\` (value-differs) — out-of-scope drift in H1: **HALT** (flag → needs-revision).\nNot established: Namespace trading not compared (live-read-failed); Deployment trading/orders-api not compared; Service trading/orders-api not compared; ConfigMap trading/orders-api-config not compared.`;
  ok(architectMeets(X, readArchitect(X, halt, mutate)).length === 0, 'X-OOS: a listed path with HALT and every not-established object must meet');
  ok(architectMeets(X, readArchitect(X, halt.replace('**HALT** (flag → needs-revision)', 'reconciled'), mutate)).length > 0, 'X-OOS: an absorbed out-of-scope path must miss');
  const XN = CSK_CELLS['X-NOEDIT'];
  const noedit = halt.replace('out-of-scope drift in H1: **HALT** (flag → needs-revision)', 'in a file this change does not edit (listed; it does not halt)');
  ok(architectMeets(XN, readArchitect(XN, noedit, mutate)).length === 0, 'X-NOEDIT: listed as "in a file this change does not edit" must meet');
  const R = CSK_CELLS['R-RN4'];
  ok(reviewerMeets(R, readReviewer(R, { approved: false, blocking: ['`spec.template.spec.containers[name=orders-api].env[name=ORDERS_FEED_URL].value` on Deployment/trading/orders-api is out-of-scope drift in H1, stated as reconciled'] }, '', mutate)).length === 0, 'R-RN4: a refusal naming the ORDERS_FEED_URL env path is FOR the plant');
  ok(reviewerMeets(R, readReviewer(R, { approved: false, blocking: ['the Namespace is not stated'] }, '', mutate)).length > 0, 'R-RN4: a refusal for another reason is not FOR the plant');
  ok(readGoldenTarget({ approved: false, blocking: ['Namespace trading is shown not compared by the drift fact and the package does not state it'] }, null, mutate).status === 'refused-for-rule', 'D-1: a refusal naming a not-established object is the expected reading');
  ok(readGoldenTarget({ approved: false, blocking: ['the NetworkPolicy port list admits TCP 4319'] }, null, mutate).status === 'DO-NOT-SHIP', 'D-1: a refusal for another reason stays DO-NOT-SHIP');
  ok(readGoldenTarget({ approved: true, blocking: [] }, 'git-file-not-held', mutate).status === 'DO-NOT-SHIP', 'D-1: a forced target cell stays DO-NOT-SHIP');
  const H3 = CSK_CELLS['H3-FLAGS'];
  const g3 = (p: string) => ({ tool: 'services', arguments: { action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: JSON.stringify({ owner: 'paichart', repo: 'paichart-configs', path: p, ref: 'main' }) } });
  const all3 = ['k8s/sample-workloads.yaml', 'k8s/orders-api-flags.yaml', 'k8s/orders-api-pdb.yaml'].map(g3);
  const r3 = readHarvester(H3, clean, all3, { held: { refs: 3, notDeclared: 0 }, configForce: null }, mutate);
  ok(harvesterMeets(H3, r3).filter((m) => !/cluster read/.test(m)).length === 0 && harvesterDoNotShip(r3, H3).length === 0, 'three-leg: a leg reading and holding all three declared files meets, unforced');
  const r1 = readHarvester(H3, clean, [all3[1]], { held: { refs: 1, notDeclared: 0 }, configForce: { reason: 'git-file-not-held' } }, mutate);
  ok(harvesterDoNotShip(r1, H3).some((m) => /forced/.test(m)), 'three-leg: a leg reading only its own file is forced ⇒ DO-NOT-SHIP');
  const rw = readHarvester(H3, clean, [...all3, g3('k8s/secret-fixture.yaml')], { held: { refs: 3, notDeclared: 1 }, configForce: null }, mutate);
  ok(harvesterDoNotShip(rw, H3).some((m) => /does not declare/.test(m)), 'three-leg: a read of an undeclared file ⇒ DO-NOT-SHIP');
  // First-run false positives must not flag; the true ones must.
  for (const fp of ['Self-provisioning succeeded; all live-cluster reads failed with an identical non-data platform notice (quoted below).',
    'Quoted verbatim (ref …/sha/7e2e0a7…/contents/k8s/sample-workloads.yaml, matches POV-recorded lab-repo commit 7e2e0a7):',
    'This is reported as a raw observation only — no drift judgment is made here; that comparison is the platform\'s Git-vs-live fact.',
    'No drift comparison was performed by me (by design) — the annotation is quoted as evidence only against the live cluster.'])
    ok(compareSentences(fp, mutate).length === 0, `first-run false positive flagged: ${fp.slice(0, 60)}`);
  for (const tp of ['| last-applied-configuration | present, consistent with live spec (ports/selector) |',
    'Last-applied annotation (verbatim): {"spec":{"ports":[{"port":80}]}} — matches the repo declaration exactly.',
    'Note: the last-applied annotation shows no `resources` block at all for the container, while the live object shows `requests` populated.'])
    ok(compareSentences(tp, mutate).length >= 1, `first-run true comparison not flagged: ${tp.slice(0, 60)}`);
  const gitGit = "- Selector-fit, confirmed from Git alone: the PDB's declared spec.selector.matchLabels (app: orders-api) is identical to the Deployment's declared spec.selector.matchLabels.";
  ok(compareSentences(gitGit, mutate).length === 0 && gitCrossSentences(gitGit, mutate).length === 1, 'N2: a Git-to-Git cross-reference is REPORTED (GITCROSS), not gated');
  ok(compareSentences('| **Service** | `list_resource_names` → count **1**: `orders-api`. Matches Git-declared Service. |', mutate).length === 1, 'N2: a live-read-tool row matched to Git is live-side (gated)');
  ok(compareSentences("- **Primary target unreadable live:** both list and get returned `403 Forbidden`. Its declared (git) content is quoted above; its *live* content is unknown — do not assume it matches the repo.", mutate).length === 0, 'an unreadable source reported as unknown is not a comparison');
  const A = CSK_CELLS['A-DRIFT-APPLY'];
  const twoPlace = '| (d) | Ordering + apply-governance | One step. The sync also puts back the file\'s value (see (f)) |\n' + 'x\n'.repeat(300)
    + '**What a sync of H1 reverts and creates:**\n- it sets `spec.ingress[0].from[0].podSelector.matchLabels.tier` back to the file\'s value, replacing the live one.';
  ok(readAuthor(A, twoPlace, null).govRevert === true, 'A-DRIFT-APPLY: a path named in the sync-reverts SECTION after a governance table row is the reading');
  const wordsFile = '**Ordering:** one step.\n' + 'y\n'.repeat(200) + '**What a sync of the edited held file reverts and creates** (from the design):\n- **Reverts:** `NetworkPolicy trading/orders-api-ingress: spec.ingress[0].from[0].podSelector.matchLabels.tier`. The live value is overwritten with the declared `web`.';
  ok(readAuthor(A, wordsFile, null).govRevert === true, 'A-DRIFT-APPLY: a sync-reverts heading that names the file in words is a governance passage');
  ok(readAuthor(A, '**What a sync of the edited held file reverts:** nothing listed.', null).govRevert === false, 'A-DRIFT-APPLY: the heading alone, without the path, is not the reading');
  const XNC = CSK_CELLS['X-NOTCHECKED'];
  ok(readArchitect(XNC, "H1: `not-checked: call-failed`. I do not assert 'no drift' for this file.", mutate).noDrift.length === 0, 'NODRIFT: a negated "no drift" is not a claim');
  ok(readArchitect(XNC, 'H1: no drift found.', mutate).noDrift.length === 1, 'NODRIFT: a bare "no drift" claim is a hit');
  // warn-blind is pinned in test-leg-replay-lab LCK9 (the shipping warnings parser needs a terminal verdict block, whose token the
  // lab's own files never carry — V1).
  return { ok: f.length === 0, failures: f };
}
