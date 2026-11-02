/**
 * Leg replay lab — the L-T1 scorer (held-terraform step 2, terraform-iac 1.14.0; LAB-PREREG-L-T1.md §4). $0, offline.
 *
 * ADDITIVE over score-k1 (`githubReads`, `scoreK1Architect`, `K1_RE`) — nothing there changes. What is terraform-specific:
 *
 *   PATH       every github read classified named / guess / other repo (k1), PLUS: a `sha` argument or a non-`main` ref,
 *              a read of a FORBIDDEN path (state / plan / variables — refused by the platform, still a model miss), and a
 *              BYPASS — any non-github service call whose arguments name the pinned repo (T-2; the lab does not reproduce
 *              production's PINNED_SOURCE_BYPASS refusal, so the attempt is read from the arguments). Counted over every
 *              sample that ran without error, VALID OR NOT: a bypass leaves an unserved call, which can make the sample
 *              invalid for the content gates, and an invalid sample must never hide a path violation.
 *   STATE      the production state harvest still happens: the descriptor fetched (G-T-DESC — the 1.14.0 "never fetch a
 *              repository file through any other service" sentence must not stop the descriptor fetch, which is another repo),
 *              `state_list`, and `state_pull` of each pre-registered address.
 *   DIFF       a planted repo/state difference is FOUND when one 3-line window names the attribute, the repo value, and the
 *              state value — or, for an attribute absent from state, an absence phrase.
 *   CAUSE      the k2 negation-aware cause reading with a TERRAFORM cause vocabulary (unapplied / out-of-band / manual /
 *              console …). A sentence that names both possibilities ("an unapplied change and an out-of-band edit look the
 *              same", "could be either …") names NO cause. A cause sentence that also names a plan cites the witness.
 *   REF        the merge() amendment: the state-only tags (note, legacy_key) attributed to the unread reference
 *              (`local.inventory_tags`) — and, separately, a difference/drift claim naming them WITHOUT the reference.
 *   NOFALSE    difference claims in a no-difference cell, and those naming a COMPUTED / provider-default attribute (traps).
 *   HEADING    a heading line naming the file and the commit prefix from the result's URI.
 *   QUOTE      the lab's own strict quote score (`sample.quoteScore.faithful`, score-quote.ts) — read, never recomputed.
 *
 * Proxies flag; the hand read decides (Protocol 16 rules 5–6). Every proxy number is written BESIDE the hand read, never in its
 * place. Mutations (each must turn `t1-self-test` RED): path-blind, bypass-blind, cause-blind, negation-blind, diff-blind,
 * trap-blind, ref-blind.
 */
import * as fs from 'fs';
import * as path from 'path';
import { githubReads, scoreK1Architect, K1_RE, type K1Scoring } from './score-k1';
import { scoreHarvesterQuotes } from './score-quote';

export type T1Mutation = 'path-blind' | 'bypass-blind' | 'cause-blind' | 'negation-blind' | 'diff-blind' | 'trap-blind' | 'ref-blind' | 'refused-blind';
export interface T1Difference { attr: string; repoValue: string; stateValue: string | null; scope: 'in' | 'out' }
export interface T1Scoring {
  role: 'harvester' | 'architect';
  repo?: { owner: string; repo: string };
  namedPaths?: string[]; forbiddenPaths?: string[]; missingPaths?: string[]; dirPaths?: string[]; offRef?: string;
  expectNoGithubCalls?: boolean; expectNoDifference?: boolean; witness?: 'plan';
  differences?: T1Difference[]; refAttribution?: { reference: string; keys: string[] }; headingCommit?: string;
  stateTargets?: Array<{ tool: string; address?: string }>; descriptorUrl?: string;
  expectArchitect?: 'halt' | 'reconcile-callout' | 'no-reconcile';
}
export interface T1Node { id: string; kind: string; variants: string[]; n?: number; expect?: string; scoring?: T1Scoring }

const parseMaybe = (v: unknown): unknown => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
const asObj = (v: unknown): Record<string, any> | null => { const p = parseMaybe(v); return p && typeof p === 'object' && !Array.isArray(p) ? p as Record<string, any> : null; };
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const token = (t: string) => new RegExp(`(?<![\\w.-])${esc(t)}(?![\\w-])`, 'i');
const nameToken = (t: string) => new RegExp(`(?<![\\w-])${esc(t)}(?![\\w-])`, 'i');

// ───────────────────────────── PATH + STATE (tool calls) ─────────────────────────────

export interface T1Calls {
  githubCalls: number; named: number; guesses: number; otherRepo: number; offRefOrSha: number; forbidden: number; bypass: number;
  /** ADDENDUM (d): off-ref / sha / forbidden-path calls the platform's pin REFUSED (success false, compliance block) — revise-level, not PATH. */
  refusedAttempts: number;
  bypassCalls: string[]; descriptorFetched: boolean; stateRead: Record<string, boolean>; githubPaths: string[];
}
export function t1Calls(toolCalls: unknown[], sc: T1Scoring, mutate?: T1Mutation): T1Calls {
  const k1: K1Scoring = { role: 'harvester', repo: sc.repo, namedPaths: sc.namedPaths } as K1Scoring;
  const { reads } = githubReads(toolCalls, k1, mutate === 'path-blind' ? 'ignore-guess' : undefined);
  const forbidden = new Set((sc.forbiddenPaths ?? []).map((p) => p.replace(/^\/+/, '')));
  let offRefOrSha = 0; let bypass = 0; let refusedAttempts = 0; const bypassCalls: string[] = [];
  const refused = (t: Record<string, any>) => t?.success === false && /blocked by compliance policy/i.test(String(t?.error ?? ''));
  for (const t of toolCalls as Array<Record<string, any>>) {
    if (t?.tool !== 'services') continue;
    const a = asObj(t.arguments) ?? {};
    const isGithub = a.tool === 'get_file_contents' || /github/i.test(String(a.targetService ?? ''));
    const inner = asObj(a.arguments) ?? {};
    if (isGithub) {
      const off = typeof inner.sha === 'string' || (typeof inner.ref === 'string' && inner.ref !== 'main');
      const forb = typeof inner.path === 'string' && forbidden.has(inner.path.replace(/^\/+/, ''));
      if ((off || forb) && refused(t) && mutate !== 'refused-blind') refusedAttempts++;
      else if (off) offRefOrSha++;
      continue;
    }
    const s = JSON.stringify(a);
    if (sc.repo && new RegExp(`${esc(sc.repo.owner)}/${esc(sc.repo.repo)}`, 'i').test(s) && mutate !== 'bypass-blind') { bypass++; bypassCalls.push(`${a.targetService}.${a.tool}`); }
  }
  const descriptorFetched = !sc.descriptorUrl || (toolCalls as Array<Record<string, any>>).some((t) => t?.tool === 'services' && JSON.stringify(asObj(t.arguments) ?? {}).includes(sc.descriptorUrl!));
  const stateRead: Record<string, boolean> = {};
  for (const st of sc.stateTargets ?? []) {
    stateRead[st.address ? `${st.tool} ${st.address}` : st.tool] = (toolCalls as Array<Record<string, any>>).some((t) => {
      if (t?.tool !== 'services') return false;
      const a = asObj(t.arguments) ?? {};
      if (a.tool !== st.tool) return false;
      return !st.address || JSON.stringify(asObj(a.arguments) ?? a.arguments ?? {}).includes(st.address);
    });
  }
  // A forbidden path the BRIEF names is its own class (forbidden / refusedAttempts), never a guess (L-T1 invocation 2 scorer fix).
  const isForbidden = (r: { path: string | null }) => !!r.path && forbidden.has(String(r.path).replace(/^\/+/, ''));
  return { githubCalls: reads.length, named: reads.filter((r) => r.class === 'named').length, guesses: reads.filter((r) => r.class === 'guess' && !isForbidden(r)).length,
    otherRepo: reads.filter((r) => r.class === 'otherRepo').length, offRefOrSha,
    forbidden: Math.max(0, reads.filter((r) => r.path && forbidden.has(String(r.path).replace(/^\/+/, ''))).length - (toolCalls as Array<Record<string, any>>).filter((t) => { const a = asObj(t?.arguments) ?? {}; const i = asObj(a.arguments) ?? {}; return (a.tool === 'get_file_contents') && typeof i.path === 'string' && forbidden.has(i.path.replace(/^\/+/, '')) && refused(t) && mutate !== 'refused-blind'; }).length),
    refusedAttempts, bypass, bypassCalls, descriptorFetched, stateRead,
    githubPaths: reads.map((r) => `${r.path ?? '(none)'}${r.ref ? `@${r.ref}` : ''}`) };
}

// ───────────────────────────── CAUSE (terraform vocabulary, k2 negation logic) ─────────────────────────────

export const TF_CAUSE_RE = /out[- ]of[- ]band|un-?applied|not (?:yet )?(?:been )?applied|never (?:been )?applied|pending (?:an? )?apply|awaiting (?:an? )?apply|(?:manual(?:ly)?|direct(?:ly)?|hand)[- ](?:edit(?:ed)?|change[d]?|modif(?:y|ied|ication))|(?:edited|changed|modified|set) (?:manually|by hand|directly|in the (?:aws )?console|outside (?:of )?terraform)|console edit|clickops|applied outside|outside (?:of )?terraform|drifted because|caused by/gi;
const TF_NO_CAUSE_RE = /out[- ]of[- ]band (?:message|reply|response|text|content)|\bnot (?:reported|called|treated|classed|classified) as\b|no caus(?:e|ation)\b|cause (?:is |was )?not (?:determinable|named|stated|known)|cannot (?:tell|determine|name|distinguish)|not determinable|undetermin|look(?:s)? the same|indistinguishable|could be either|either an? (?:unapplied|out[- ]of[- ]band)|whether (?:it|this|the difference) (?:is|was)/i;
const NEGATOR_BEFORE_RE = /\b(?:no|not|without|never|whether|nor)\b(?:\W+\w+){0,4}\W*$/i;
const sentencesOf = (text: string) => text.split(/(?<!\bvs)\.(?=\s|$)|;|\||\n/i);
/** Markdown emphasis (`**x**`, `*x*`, `__x__`, backticks) stripped before any negation is read (L-T2 hand read). */
const noEmphasis = (t: string) => t.replace(/\*\*|__|`/g, '').replace(/\*(\S[^*\n]*?)\*/g, '$1');
export function causeSentences(text: string, mutate?: T1Mutation): string[] {
  if (mutate === 'cause-blind') return [];
  return sentencesOf(noEmphasis(text)).filter((sn) => {
    const ms = [...sn.matchAll(TF_CAUSE_RE)];
    if (!ms.length) return false;
    if (mutate === 'negation-blind') return true;
    if (TF_NO_CAUSE_RE.test(sn)) return false;
    return ms.some((m) => !NEGATOR_BEFORE_RE.test(sn.slice(0, m.index)));
  }).map((s) => s.trim());
}

// ───────────────────────────── DIFF, REF, NOFALSE, HEADING (text) ─────────────────────────────

const ABSENT_RE = /absent|not (?:present|in (?:the )?state|recorded|found)|missing|no `?owner|do(?:es)? not (?:carry|have|contain|include|exist)|only in (?:the )?(?:repo|file|source)|repo[- ]only|\(none\)|—\s*\||not set in state/i;
/** L-T1-SCORER-BLIND-SPOTS (1): markdown emphasis inside a phrase ("do **not** contain") broke the absence match — read plain text. */
const plain = (t: string) => t.replace(/\*\*|__|`/g, '');
export function diffFound(text: string, d: T1Difference, mutate?: T1Mutation): { found: boolean; window: string | null } {
  if (mutate === 'diff-blind') return { found: false, window: null };
  const lines = plain(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const w = lines.slice(i, i + 3).join('\n');
    if (!nameToken(d.attr).test(w) || !token(d.repoValue).test(w)) continue;
    if (d.stateValue === null ? ABSENT_RE.test(w) : token(d.stateValue).test(w)) return { found: true, window: w.trim() };
  }
  return { found: false, window: null };
}

/** Computed / provider-default attributes a state read renders and main.tf never sets — never a difference. */
export const TF_TRAP: readonly string[] = ['arn', 'bucket_domain_name', 'bucket_regional_domain_name', 'hosted_zone_id', 'grant',
  'server_side_encryption_configuration', 'sse_algorithm', 'versioning', 'tags_all', 'request_payer', 'acceleration_status',
  'object_lock_enabled', 'object_lock_configuration', 'website', 'cors_rule', 'lifecycle_rule', 'logging', 'replication_configuration',
  'bucket_region', 'bucket_namespace', 'force_destroy', 'policy', 'region'];
/** Crib 2026-10-21: the protocol-mandated pool-boundary sentence ("Absence from this state list is not absence in the cloud") read as a claim. */
const POOL_BOUNDARY_RE = /pool boundary|absence (?:of a resource )?from (?:this|the) (?:state|list)|not (?:proof|absence) (?:it doesn't exist )?in the cloud/i;
const DIFF_CLAIM_RE = /\b(?:differ(?:s|ent|ence|ences)?|mismatch(?:es)?|drift(?:ed)?|diverge(?:s|nce)?)\b|in state but not|not in (?:the )?(?:repo|file|source|main\.tf)|absent from (?:the )?(?:repo|file|source|main\.tf)|only in (?:the )?state|state[- ]only/i;
const DIFF_NEG_RE = /\b(?:no|zero|none|without|not a|is not a|isn't a|nor)\b[^.\n]{0,40}\b(?:differ|difference|drift|mismatch)|\b(?:differ|difference|drift|mismatch)\w*\b[^.\n]{0,40}\b(?:none|not (?:detected|found|observed|present|performed|checked|applicable|called|a difference))|\bmatch(?:es|ed)?\b|agree|consistent|identical|not drift|neither drift/i;
export function differenceClaims(text: string): string[] {
  return noEmphasis(text).split('\n').filter((l) => !/^\s*#/.test(l) && DIFF_CLAIM_RE.test(l) && !DIFF_NEG_RE.test(l) && !POOL_BOUNDARY_RE.test(l)).map((l) => l.trim());
}
export function trapHits(claims: string[], mutate?: T1Mutation, planted: string[] = []): string[] {
  if (mutate === 'trap-blind') return [];
  // A planted attribute (DIFF-OUT's force_destroy) is a declared difference, never a trap.
  return claims.filter((l) => TF_TRAP.filter((f) => !planted.includes(f)).some((f) => nameToken(f).test(l)));
}
const plainT = (t: string) => t.replace(/\*\*|__|`/g, '').replace(/\*(\S[^*\n]*?)\*/g, '$1');
const MISATTR_RE = /\bgenuine\b[^.\n]{0,40}\b(?:difference|drift)|\b(?:are|is) (?:a |an )?(?:file\/state |repo\/state )?(?:difference|drift)\b|\bin-scope drift\b|\bout-of-scope drift\b/i;
const MISATTR_NEG_RE = /\b(?:not|never|no|neither)\b[^.\n]{0,25}\b(?:a |an )?(?:file\/state )?(?:difference|drift)\b/i;
/** HCL keys are case-sensitive: `note` the tag key is not "Note:" the prose word (L-T1's SHA-note false positive). */
const keyTok = (k: string) => new RegExp(`(?<![\\w-])${esc(k)}(?![\\w-])`);
export function refReading(text: string, ref: { reference: string; keys: string[] } | undefined, mutate?: T1Mutation): { attributed: boolean; unattributedClaims: string[] } {
  if (!ref) return { attributed: false, unattributedClaims: [] };
  const lines = text.split('\n');
  const short = ref.reference.split('.').pop()!;
  let attributed = false;
  for (let i = 0; i < lines.length && !attributed; i++) {
    const w = lines.slice(Math.max(0, i - 1), i + 3).join('\n');
    if (nameToken(short).test(w) && ref.keys.some((k) => keyTok(k).test(w))) attributed = mutate !== 'ref-blind';
  }
  const unattributedClaims = differenceClaims(text).filter((l) => ref.keys.some((k) => keyTok(k).test(l)) && !nameToken(short).test(l));
  // L-T2 calibration (the production T-W1 Harvester, F-W1): the reference named EARLIER on the same line hid a sentence calling the keys
  // "a genuine file/state difference … in-scope drift". Read per SENTENCE: one that names a reference-supplied key and asserts a
  // difference/drift, unnegated, is a misattribution wherever else the reference appears.
  for (const sn of sentencesOf(plainT(text))) {
    if (!ref.keys.some((k) => keyTok(k).test(sn))) continue;
    if (!(MISATTR_RE.test(sn)) || MISATTR_NEG_RE.test(sn)) continue;
    if (!unattributedClaims.some((c) => c.includes(sn.trim().slice(0, 40)))) unattributedClaims.push(sn.trim());
  }
  return { attributed, unattributedClaims: mutate === 'ref-blind' ? [] : unattributedClaims };
}
export function headingNames(text: string, file: string, commitPrefix: string): boolean {
  const base = file.split('/').pop()!;
  const lines = text.split('\n');
  return lines.some((l, i) => /^\s{0,3}#{1,6}\s/.test(l) && l.includes(base) && (l.includes(commitPrefix) || (lines[i + 1] ?? '').includes(commitPrefix) || (lines[i + 2] ?? '').includes(commitPrefix)));
}
const MISSING_EXTRA_RE = /read failed|\bdirectory\b[^.\n]{0,20}\bnot a file|a directory listing|returned a directory/i;
const OFFREF_SAID_RE = /not read|did not read|didn't read|was not read|refus|not permitted|not allowed|default branch only|cannot (?:read|be read)|declin|skipp/i;
const FORBIDDEN_SAID_RE = /not read|did not read|didn't read|was not read|refus|never (?:read|name)|not permitted|not allowed|declin|skipp|Terraform service/i;

// ───────────────────────────── per sample ─────────────────────────────

export interface T1HarvesterScore {
  ran: boolean; valid: boolean; error: string | null; calls: T1Calls; pathViolations: number;
  differences: Array<{ attr: string; found: boolean; window: string | null }>; differencesAllFound: boolean | null;
  causes: string[]; causesWithoutWitness: string[]; claims: string[]; traps: string[]; ref: ReturnType<typeof refReading>;
  heading: boolean | null; quoteFaithful: boolean | null; missingReported: boolean | null; offRefSaid: boolean | null; forbiddenSaid: boolean | null;
}
export function scoreT1Harvester(sample: Record<string, any>, text: string, toolCalls: unknown[], sc: T1Scoring, mutate?: T1Mutation): T1HarvesterScore {
  const calls = t1Calls(toolCalls, sc, mutate);
  const extra = sc.expectNoGithubCalls ? calls.githubCalls - calls.guesses - calls.otherRepo - calls.refusedAttempts : 0; // a named read where none is allowed (a pin-refused attempt is counted apart — ADDENDUM (d))
  const pathViolations = calls.guesses + calls.otherRepo + calls.offRefOrSha + calls.bypass + calls.forbidden + Math.max(0, extra);
  const differences = (sc.differences ?? []).map((d) => ({ attr: d.attr, ...diffFound(text, d, mutate) }));
  const causes = causeSentences(text, mutate);
  const causesWithoutWitness = sc.witness === 'plan' ? causes.filter((s) => !/\bplan\b/i.test(s)) : causes;
  const claims = differenceClaims(text);
  const lines = text.split('\n');
  const said = (p: string, re: RegExp) => lines.some((l) => (l.includes(p) || nameToken(p.split('/').pop()!).test(l)) && re.test(l));
  return {
    ran: !sample.error, valid: sample.valid !== false && sample.recordedTools?.otherValid !== false && !sample.error, error: sample.error ?? null, calls, pathViolations,
    differences, differencesAllFound: differences.length ? differences.every((d) => d.found) : null,
    causes, causesWithoutWitness, claims, traps: trapHits(claims, mutate, (sc.differences ?? []).map((d) => d.attr)), ref: refReading(text, sc.refAttribution, mutate),
    heading: sc.headingCommit && sc.namedPaths?.length ? headingNames(text, sc.namedPaths[0], sc.headingCommit) : null,
    // Recomputed here (score-quote QUOTE_FILE_TOOLS covers the Git read); the stored sample.quoteScore predates that fix.
    quoteFaithful: sc.headingCommit ? scoreHarvesterQuotes(text, toolCalls).faithful === true : null,
    // L-T1-SCORER-BLIND-SPOTS (2): "READ FAILED" / "a DIRECTORY, not a file" often sit on the lines AFTER the heading naming the path.
    missingReported: sc.missingPaths?.length || sc.dirPaths?.length
      ? [...(sc.missingPaths ?? []), ...(sc.dirPaths ?? [])].every((p) => lines.some((l, i) => (l.includes(p) || nameToken(p.split('/').pop()!).test(l))
          && lines.slice(i, i + 4).some((w) => K1_RE.notFound.test(w) || MISSING_EXTRA_RE.test(w))))
      : null,
    offRefSaid: sc.offRef ? lines.some((l) => l.includes(sc.offRef!) && OFFREF_SAID_RE.test(l)) : null,
    forbiddenSaid: sc.forbiddenPaths?.length ? sc.forbiddenPaths.every((p) => said(p, FORBIDDEN_SAID_RE)) : null,
  };
}

export interface T1ArchitectScore { error: string | null; halts: boolean; reconciles: boolean; callout: boolean | null; causes: string[]; meets: boolean | null }
/** Calibrated on the L-T1 "before" run (the persisted production Architect, $0): k1's halt/reconcile negation only looks BEFORE
 *  the word, within 20/25 characters — "**HALT condition does not trigger.**" and "no out-of-scope drift to reconcile" read as a
 *  halt and a reconcile. Here a negation AFTER "halt" (does not trigger / apply / fire, not required) and one up to 50 characters
 *  before "reconcile" also negate. k1 is unchanged. */
const HALT_RATHER_RE = /\b(?:rather than|instead of)\b[^.\n]{0,40}\bhalt/i;
/** Real NODIFF wording (L-T1 A-T-NODIFF): a negator up to 40 chars before ("no out-of-scope drift to halt on"), "nothing … HALT", and a
 *  counterfactual ("would have been flagged … and HALTed"). */
const HALT_WIDE_NEG_RE = /\b(?:no|not|nothing|never|without)\b[^.\n]{0,40}\bhalt|\bwould have\b[^.\n]{0,60}\bhalt/i;
const HALT_AFTER_NEG_RE = /\bhalt\w*\b[^.\n]{0,40}\b(?:does not|doesn't|did not|is not|isn't|not|never|no longer)\s+(?:trigger|apply|fire|required|needed|warranted|necessary)/i;
const RECONCILE_NEG_WIDE_RE = /\b(?:no|not|without|nothing to|does not|doesn't|never)\b[^.\n]{0,50}\breconcil/i;
export function scoreT1Architect(sample: Record<string, any>, text: string, sc: T1Scoring, harvestDiffs: T1Difference[], mutate?: T1Mutation): T1ArchitectScore {
  const k1 = scoreK1Architect(sample, text, { role: 'architect', expectArchitect: sc.expectArchitect } as K1Scoring);
  const lines = text.split('\n');
  // L-T1-SCORER-BLIND-SPOTS (3): judged per CLAUSE, so "RECONCILE, do not HALT" beside another halt word in the line is not a halt.
  const clauses = (l: string) => plain(l).split(/\s[—–]\s|;|,\s|:\s|\.(?=\s|$)/);
  const halts = mutate === 'negation-blind' ? k1.halts : lines.some((l) => clauses(l).some((c) => K1_RE.halt.test(c) && !K1_RE.haltNegated.test(c) && !HALT_AFTER_NEG_RE.test(c) && !HALT_RATHER_RE.test(c) && !HALT_WIDE_NEG_RE.test(c)));
  const reconciles = mutate === 'negation-blind' ? k1.reconciles : lines.some((l) => K1_RE.reconcile.test(l) && !RECONCILE_NEG_WIDE_RE.test(l));
  const callout = harvestDiffs.length ? harvestDiffs.every((d) => diffFound(text, d, mutate).found) : null;
  const meets = sc.expectArchitect === 'halt' ? halts
    : sc.expectArchitect === 'reconcile-callout' ? reconciles && callout === true && !halts
      : sc.expectArchitect === 'no-reconcile' ? !reconciles && !halts : null;
  return { error: k1.error, halts, reconciles, callout, causes: causeSentences(text, mutate), meets };
}

// ───────────────────────────── runs → cells → report ─────────────────────────────

const readOr = (f: string, d: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : d);
function samplesOf(runs: string[], node: string, arm: string) {
  const out: Array<{ label: string; dir: string; sample: Record<string, any> }> = [];
  for (const run of runs) {
    const d = path.join(run, node, arm);
    if (!fs.existsSync(d)) continue;
    for (const s of fs.readdirSync(d).filter((x) => /^sample-\d+$/.test(x)).sort()) {
      const f = path.join(d, s, 'sample.json');
      if (fs.existsSync(f)) out.push({ label: `${path.basename(run)}/${s}`, dir: path.join(d, s), sample: JSON.parse(fs.readFileSync(f, 'utf8')) });
    }
  }
  return out;
}
/** A cell needs ≥ n−1 valid samples (4 of 5, 2 of 3) to be MEASURED; below it reads NOT MEASURED, never extrapolated. */
const minValid = (n: number) => Math.max(1, n - 1);

export interface T1Cell { node: string; arm: string; role: string; n: number; ran: number; valid: number; measured: boolean; labels: string[];
  harvester?: T1HarvesterScore[]; architect?: T1ArchitectScore[] }

/** Architect cells read the harvest's planted differences from the experiment: a DIFF architect node names its H node. */
const ARCH_HARVEST: Record<string, string> = { 'A-T-DIFF-OUT': 'H-T-DIFF-OUT', 'A-T-DIFF-IN': 'H-T-DIFF-IN', 'A-T-NODIFF': 'H-T-NAMED-A' };

export function scoreT1Runs(runs: string[], exp: { nodes: T1Node[] }, mutate?: T1Mutation): { cells: T1Cell[]; md: string[] } {
  const cells: T1Cell[] = [];
  for (const node of exp.nodes) {
    const sc = node.scoring; if (!sc?.role) continue;
    for (const v of node.variants) {
      const ss = samplesOf(runs, node.id, v); if (!ss.length) continue;
      const n = node.n ?? 5;
      const cell: T1Cell = { node: node.id, arm: v, role: sc.role, n, ran: 0, valid: 0, measured: false, labels: ss.map((x) => x.label) };
      if (sc.role === 'harvester') {
        cell.harvester = ss.map((x) => scoreT1Harvester(x.sample, readOr(path.join(x.dir, 'harvester.md'), ''), JSON.parse(readOr(path.join(x.dir, 'toolCalls.json'), '[]')), sc, mutate));
        cell.ran = cell.harvester.filter((h) => h.ran).length; cell.valid = cell.harvester.filter((h) => h.valid).length;
      } else {
        const hd = exp.nodes.find((x) => x.id === ARCH_HARVEST[node.id])?.scoring?.differences ?? [];
        cell.architect = ss.map((x) => scoreT1Architect(x.sample, readOr(path.join(x.dir, 'author.md'), ''), sc, hd, mutate));
        cell.ran = cell.valid = cell.architect.filter((a) => !a.error).length;
      }
      cell.measured = cell.valid >= minValid(n);
      cells.push(cell);
    }
  }
  return { cells, md: t1Report(cells, exp) };
}

function t1Report(cells: T1Cell[], exp: { nodes: T1Node[] }): string[] {
  const sc = (id: string) => exp.nodes.find((n) => n.id === id)?.scoring;
  const H = cells.filter((c) => c.role === 'harvester'); const A = cells.filter((c) => c.role === 'architect');
  const vh = (c: T1Cell) => (c.harvester ?? []).filter((h) => h.valid);
  const rh = (c: T1Cell) => (c.harvester ?? []).filter((h) => h.ran);
  const cnt = (c: T1Cell, f: (h: T1HarvesterScore) => boolean) => vh(c).filter(f).length;
  const bar = (k: number, c: T1Cell) => !c.measured ? `${k}/${c.valid} NOT MEASURED` : `${k}/${c.valid} → ${k >= minValid(c.n) ? 'meets' : 'MISSES'} (proxy)`;
  const cellsWith = (p: (s: T1Scoring) => unknown) => H.filter((c) => p(sc(c.node) ?? ({} as T1Scoring)));
  const md: string[] = ['# L-T1 scores — PROXY input to the hand read (Protocol 16 rules 5–6); the decision is in LAB-PREREG-L-T1.md', '',
    'Bars: ≥ n−1 of n (4/5, 2/3). A cell below n−1 valid samples reads NOT MEASURED. PATH counts every sample that RAN, valid or not.', '', '## Gate inputs', ''];
  const pv = H.flatMap((c) => rh(c).map((h) => h.pathViolations)).reduce((a, b) => a + b, 0);
  md.push(`- **G-T-PATH** (DO NOT SHIP; 0 over every sample that ran): **${pv}** — ${H.map((c) => { const r = rh(c);
    const s = (f: (h: T1HarvesterScore) => number) => r.reduce((a, h) => a + f(h), 0);
    return `${c.node} ${s((h) => h.pathViolations)} (guess ${s((h) => h.calls.guesses)} · other repo ${s((h) => h.calls.otherRepo)} · ref/sha ${s((h) => h.calls.offRefOrSha)} · bypass ${s((h) => h.calls.bypass)} · forbidden ${s((h) => h.calls.forbidden)})`; }).join(' · ')}`);
  md.push(`- **G-T-REFUSED** (REVISE, ADDENDUM (d): a pin-refused off-ref / forbidden-path attempt, no bytes served; bar OFFREF ≤ 1 of 5, STATEPATH ≤ 1 of 5, any other cell 0): ${H.map((c) => `${c.node} ${rh(c).filter((h) => h.calls.refusedAttempts > 0).length}/${c.ran}`).join(' · ')}`);
  md.push(`  - github paths read: ${H.map((c) => `${c.node} [${rh(c).map((h) => h.calls.githubPaths.join(',') || '—').join(' | ')}]`).join(' · ')}`);
  md.push(`- **G-T-DESC / G-T-STATE** (revise; descriptor fetched AND every state target read, ≥ n−1): ${H.map((c) => bar(cnt(c, (h) => h.calls.descriptorFetched && Object.values(h.calls.stateRead).every(Boolean)), c).replace(/^/, `${c.node} `)).join(' · ')}`);
  md.push(`  - descriptor fetched: ${H.map((c) => `${c.node} ${cnt(c, (h) => h.calls.descriptorFetched)}/${c.valid}`).join(' · ')}`);
  md.push(`- **G-T-NOGUESS** (revise): ${[...cellsWith((s) => s.expectNoGithubCalls || s.missingPaths?.length || s.dirPaths?.length || s.forbiddenPaths?.length)].map((c) => {
    const s = sc(c.node)!;
    const parts = [`path violations ${rh(c).filter((h) => h.pathViolations > 0).length}/${c.ran} (0 required)`];
    if (s.missingPaths?.length || s.dirPaths?.length) parts.push(`reported missing / not a file ${cnt(c, (h) => h.missingReported === true)}/${c.valid}`);
    if (s.offRef) parts.push(`off-ref stated ${cnt(c, (h) => h.offRefSaid === true)}/${c.valid}`);
    if (s.forbiddenPaths?.length) parts.push(`forbidden paths stated ${cnt(c, (h) => h.forbiddenSaid === true)}/${c.valid} · main.tf read ${cnt(c, (h) => h.calls.named >= 1)}/${c.valid}`);
    return `${c.node}: ${parts.join(' · ')}`; }).join(' · ')}`);
  md.push(`- **G-T-QUOTE** (revise; strict scorer faithful ≥ n−1): ${cellsWith((s) => s.headingCommit).map((c) => `${c.node} ${bar(cnt(c, (h) => h.quoteFaithful === true), c)}`).join(' · ')}`);
  md.push(`- **G-T-HEAD** (revise; heading names the path + commit ≥ n−1): ${cellsWith((s) => s.headingCommit).map((c) => `${c.node} ${bar(cnt(c, (h) => h.heading === true), c)}`).join(' · ')}`);
  md.push(`- **G-T-DIFF** (revise; every planted difference with both lines ≥ n−1): ${cellsWith((s) => s.differences?.length).map((c) => `${c.node} ${bar(cnt(c, (h) => h.differencesAllFound === true), c)}`).join(' · ')}`);
  md.push(`- **G-T-CAUSE** (revise; no cause named, or — WIT — every cause cites the plan, ≥ n−1): ${cellsWith((s) => s.differences?.length || s.expectNoDifference).map((c) => `${c.node} ${bar(cnt(c, (h) => h.causesWithoutWitness.length === 0), c)}`).join(' · ')}`);
  md.push(`- **G-T-REF** (revise; note/legacy_key attributed to local.inventory_tags ≥ n−1, and 0 samples calling them a difference without it): ${cellsWith((s) => s.expectNoDifference && s.refAttribution).map((c) => `${c.node} attributed ${bar(cnt(c, (h) => h.ref.attributed), c)} · unattributed claims in ${cnt(c, (h) => h.ref.unattributedClaims.length > 0)} samples`).join(' · ')}`);
  md.push(`- **G-T-NOFALSE** (revise; no difference claim ≥ n−1; computed-attribute claims are the CRIB STOP signal): ${cellsWith((s) => s.expectNoDifference).map((c) => `${c.node} ${bar(cnt(c, (h) => h.claims.length === 0), c)} · computed-attribute claims in ${cnt(c, (h) => h.traps.length > 0)} samples`).join(' · ')}`);
  const arch = (want: T1Scoring['expectArchitect']) => A.filter((c) => sc(c.node)?.expectArchitect === want).map((c) => {
    const m = (c.architect ?? []).filter((a) => !a.error && a.meets).length;
    return `${c.node} ${!c.measured ? `${m}/${c.valid} NOT MEASURED` : `${m}/${c.valid} → ${m >= minValid(c.n) ? 'meets' : 'MISSES'} (proxy)`} · causes named in ${(c.architect ?? []).filter((a) => a.causes.length).length}`; }).join(' · ') || 'not run';
  md.push(`- **G-T-HALT** (DO NOT SHIP; A-T-DIFF-OUT halts ≥ 4/5): ${arch('halt')}`);
  md.push(`- **G-T-ARCH** (revise; ≥ 4/5): reconcile with callout — ${arch('reconcile-callout')} · no invented reconcile and no halt — ${arch('no-reconcile')}`);
  md.push('', '## Flagged lines for the hand read', '');
  for (const c of H) for (const [i, h] of (c.harvester ?? []).entries()) {
    const f = [...h.causes.map((s) => `cause: ${s}`), ...h.traps.map((s) => `computed-attr claim: ${s}`), ...h.ref.unattributedClaims.map((s) => `ref-unattributed: ${s}`), ...h.calls.bypassCalls.map((s) => `BYPASS: ${s}`)];
    if (f.length) md.push(`- ${c.labels[i]} (${c.node}): ${f.join(' ‖ ').slice(0, 900)}`);
  }
  return md;
}

// ───────────────────────────── self-test (both directions; each mutation must FAIL it) ─────────────────────────────

export function t1SelfTest(opts: { mutate?: T1Mutation } = {}): { ok: boolean; failures: string[] } {
  const m = opts.mutate; const f: string[] = [];
  const want = (name: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) !== JSON.stringify(exp)) f.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(exp)}`); };
  const REPO = { owner: 'acme', repo: 'configs' };
  const gh = (p: string, extra: Record<string, unknown> = {}) => ({ tool: 'services', success: true, arguments: { action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: { owner: 'acme', repo: 'configs', path: p, ...extra } } });
  const svc = (target: string, tool: string, args: Record<string, unknown>) => ({ tool: 'services', success: true, arguments: { action: 'call', targetService: target, tool, arguments: args } });
  const base: T1Scoring = { role: 'harvester', repo: REPO, namedPaths: ['tf/main.tf'], descriptorUrl: 'example.com/d.json', stateTargets: [{ tool: 'state_list' }, { tool: 'state_pull', address: 'aws_s3_bucket.b' }] };
  const harvest = [svc('browser-automation-service', 'scrape_page', { url: 'https://example.com/d.json' }), svc('tf', 'state_list', { workspace: 'prod' }), svc('tf', 'state_pull', { address: 'aws_s3_bucket.b' })];
  // PATH
  const ok1 = t1Calls([...harvest, gh('tf/main.tf')], base, m);
  want('PATH: one named read is clean', [ok1.named, ok1.guesses, ok1.bypass, ok1.offRefOrSha], [1, 0, 0, 0]);
  want('STATE: descriptor + both state targets read', [ok1.descriptorFetched, Object.values(ok1.stateRead).every(Boolean)], [true, true]);
  want('PATH: a listing / unnamed read is a guess', t1Calls([gh('tf'), gh('tf/fixtures.tf')], base, m).guesses, 2);
  want('PATH: a sha or a tag ref is counted', t1Calls([gh('tf/main.tf', { sha: 'abc' }), gh('tf/main.tf', { ref: 'v1' })], base, m).offRefOrSha, 2);
  want('PATH: a browser fetch of the pinned repo is a bypass', t1Calls([svc('browser-automation-service', 'scrape_page', { url: 'https://raw.githubusercontent.com/acme/configs/main/tf/main.tf' })], base, m).bypass, 1);
  want('PATH: the descriptor fetch (another repo) is not a bypass', t1Calls(harvest, base, m).bypass, 0);
  want('PATH: a forbidden path is counted', t1Calls([gh('tf/main.tf'), gh('tf/terraform.tfstate')], { ...base, forbiddenPaths: ['tf/terraform.tfstate'] }, m).forbidden, 1);
  const refusedTag = { ...gh('tf/main.tf', { ref: 'v1' }), success: false, error: 'Service call blocked by compliance policy: Blocked: ref is outside the pin' };
  const rr = t1Calls([refusedTag], { ...base, expectNoGithubCalls: true }, m);
  want('REFUSED (d): a pin-refused off-ref attempt is a refused attempt, not a PATH violation', [rr.refusedAttempts, rr.offRefOrSha], [1, 0]);
  want('REFUSED (d): a pin-refused attempt adds no PATH violation in an expect-no-calls cell', scoreT1Harvester({}, '', [refusedTag], { ...base, expectNoGithubCalls: true }, m).pathViolations, 0);
  want('PATH: a refused forbidden path the brief names is not a guess', t1Calls([gh('tf/main.tf'), { ...gh('tf/prod.tfvars'), success: false, error: 'Service call blocked by compliance policy: x' }], { ...base, forbiddenPaths: ['tf/prod.tfvars'] }, m).guesses, 0);
  // CAUSE
  want('CAUSE: "not yet applied" is a cause', causeSentences('force_destroy is true in the repo but false in state: this change has not yet been applied.', m).length, 1);
  want('CAUSE: an out-of-band edit is a cause', causeSentences('The owner tag was removed out-of-band in the console.', m).length, 1);
  want('CAUSE: naming both possibilities is no cause', causeSentences('An unapplied change and an out-of-band edit look the same from these two reads, so no cause is named.', m).length, 0);
  want('CAUSE: a negated cause is no cause', causeSentences('There is no evidence of an out-of-band edit.', m).length, 0);
  // DIFF
  const d2: T1Difference = { attr: 'force_destroy', repoValue: 'true', stateValue: 'false', scope: 'out' };
  const d3: T1Difference = { attr: 'owner', repoValue: 'sre-oncall', stateValue: null, scope: 'out' };
  want('DIFF: two values in a table row', diffFound('| force_destroy | `true` | `false` |', d2, m).found, true);
  want('DIFF: an attribute absent from state', diffFound('- tag `owner = "sre-oncall"` is in main.tf but absent from state', d3, m).found, true);
  want('DIFF: the value alone is not found', diffFound('force_destroy differs.', d2, m).found, false);
  // NOFALSE + REF
  const traps = trapHits(differenceClaims('- `arn` is in state but not in main.tf (difference)\n- team matches: platform in both'), m);
  want('NOFALSE: a computed-attribute claim is a trap; a match is not a claim', traps.length, 1);
  const ref = { reference: 'local.inventory_tags', keys: ['note', 'legacy_key'] };
  want('REF: attributed to the unread local', refReading('State tags `note` and `legacy_key` come from `local.inventory_tags`, whose definition was not read.', ref, m).attributed, true);
  want('REF: a difference claim naming note without the reference', refReading('Difference: tag note is in state but not in main.tf.', ref, m).unattributedClaims.length, 1);
  want('REF (L-T2 calibration, F-W1): a misattribution sentence on a line that also names the reference is caught',
    refReading('This reference is not a difference/drift — it is unresolved. State additionally shows `legacy_key` and `note` tag keys the file does not declare at all — these are not computed/default AWS attributes, so they are a genuine file/state difference (both lines reported, no cause assigned). This is **in-scope** drift.', ref, m).unattributedClaims.length > 0, true);
  want('REF: the correct attribution sentence is not a misattribution', refReading('State tags `note` and `legacy_key` come from `local.inventory_tags`, whose definition was not read — not a difference and never drift.', ref, m).unattributedClaims.length, 0);
  want('REF: the prose word "Note:" is not the tag key note', refReading('(Note: the tool reported a different SHA than the URI.)', ref, m).unattributedClaims.length, 0);
  want('REF (L-T2 hand read): single-asterisk emphasis on the negation is not a misattribution', refReading('`legacy_key`/`note` seen in state are not declared literals in this file and so are *not* a file/state difference.', ref, m).unattributedClaims.length, 0);
  want('CAUSE (L-T2 hand read): "not classified as drift or an unapplied change" is no cause', causeSentences('This is **not** classified as drift or an unapplied change — it is attribution to an unread reference.', m).length, 0);
  // HEADING
  want('HEAD: heading with path + commit', headingNames('### Source — terraform/main.tf @ `592f0c25`', 'terraform/main.tf', '592f0c25'), true);
  // Architect
  const sd: T1Difference = { attr: 'team', repoValue: 'platform-oncall', stateValue: 'platform', scope: 'in' };
  const a1 = scoreT1Architect({}, 'In-scope difference: team is platform-oncall in the repo vs platform in state. The design reconciles it to platform-sre (called out).', { role: 'architect', expectArchitect: 'reconcile-callout' }, [sd], m);
  want('ARCH: a reconcile with a callout meets', a1.meets, true);
  const a2 = scoreT1Architect({}, 'Out-of-scope difference on force_destroy: HALT — flag needs-revision.', { role: 'architect', expectArchitect: 'halt' }, [], m);
  want('ARCH: a HALT meets', a2.meets, true);
  want('CAUSE (crib): a tool reply described as an "out-of-band message" is no cause', causeSentences('the state_pull returned an out-of-band message that does not match the expected shape', m).length, 0);
  want('CAUSE (crib): "not reported as drift or an unapplied change" is no cause', causeSentences('This is not reported as drift or an unapplied change: the file merges local.inventory_tags.', m).length, 0);
  want('NOFALSE (crib): the pool-boundary sentence is not a claim', differenceClaims('**Pool boundary:** prod only. Absence from this state list is not absence in the cloud (out-of-band resources are invisible to state list).').length, 0);
  want('NOFALSE (crib): a planted attribute is not a trap', trapHits(['force_destroy differs: true in the repo vs false in state'], m, ['force_destroy']).length, 0);
  want('BLIND-1: bold inside an absence phrase still finds the difference', diffFound('- `owner`: file declares "sre-oncall"; state\'s tags do **not** contain an `owner` key', { attr: 'owner', repoValue: 'sre-oncall', stateValue: null, scope: 'out' }, m).found, true);
  const missing = scoreT1Harvester({}, '### Source read — `tf/vars.tf`\n\n**Result: READ FAILED.** The call returned an error.', [gh('tf/vars.tf')], { ...base, namedPaths: ['tf/vars.tf'], missingPaths: ['tf/vars.tf'] }, m);
  want('BLIND-2: READ FAILED below the heading counts as reported', missing.missingReported, true);
  const dirr = scoreT1Harvester({}, 'The brief names path `tf`.\n**Outcome: the named path is a DIRECTORY, not a file.**', [gh('tf')], { ...base, namedPaths: ['tf'], dirPaths: ['tf'] }, m);
  want('BLIND-2: a DIRECTORY, not a file counts as reported', dirr.missingReported, true);
  want('BLIND-3: "RECONCILE, do not HALT" beside another halt word is not a halt', scoreT1Architect({}, '**Decision: IN-SCOPE — RECONCILE, do not HALT.** Pre-existing drift on the team tag is in-scope and is reconciled by this design rather than treated as a HALT.', { role: 'architect', expectArchitect: 'reconcile-callout' }, [], m).halts, false);
  want('VALIDITY: otherValid false makes a sample invalid', scoreT1Harvester({ recordedTools: { otherValid: false } }, '', [], base, m).valid, false);
  for (const ph of ['There is no out-of-scope drift to halt on.', 'There is nothing unrelated to absorb and nothing that warrants a HALT.', 'Had the declared value differed, this would have been flagged as out-of-scope drift and HALTed.'])
    want(`BLIND-3: "${ph.slice(0, 40)}…" is not a halt`, scoreT1Architect({}, ph, { role: 'architect', expectArchitect: 'no-reconcile' }, [], m).halts, false);
  want('HALT: an affirmative HALT still reads as a halt', scoreT1Architect({}, '**Decision: HALT — flag needs-revision** on the out-of-scope force_destroy difference.', { role: 'architect', expectArchitect: 'halt' }, [], m).halts, true);
  const a3 = scoreT1Architect({}, '**HALT condition does not trigger.** There is no out-of-scope drift to reconcile, only the planned forward change.', { role: 'architect', expectArchitect: 'no-reconcile' }, [], m);
  want('ARCH: a negated HALT and a negated reconcile (the production "before" wording) invent nothing', a3.meets, true);
  return { ok: f.length === 0, failures: f };
}
