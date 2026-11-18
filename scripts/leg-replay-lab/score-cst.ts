/**
 * Leg replay lab — L-CS-T scorer (Config sources STEP 4, terraform-iac 1.17.0; LAB-PREREG-L-CS-T.md). $0, offline.
 *
 *   npm run lab:leg-replay -- cst-score --run <runDir>[,<runDir>]
 *   npm run lab:leg-replay -- cst-self-test [--mutate <CstMutation>]
 *   npm run lab:leg-replay -- cst-golden --run <runDir>[,<runDir>] --experiment <dir>/golden-v9
 *
 * Readings (proxies FLAG; the hand read decides — Protocol 16 rules 5–6, LL-22). Production parsers wherever one exists (LL-CS-22): the
 * Reviewer verdict is the lab's SHIPPING parse (`sample.verdict`), the git-file-only warning the SHIPPING `computeReviewerWarnings`, the
 * tool calls the shipping result builder's `toolCalls`, the held/force record the shipping Config-sources nets' (`configFacts.report`).
 *
 *   Harvester  NOCOMPARE  a sentence OUTSIDE fences that states a match or difference between the `.tf` file and state, or "no drift"
 *                         (negated / "not computed" lines excluded) — DO-NOT-SHIP after the hand read (B2: no one here decides drift)
 *              STATEFILE  any call naming a state / plan / variables / CLI-credentials path — DO-NOT-SHIP, code-decided
 *              GITREAD    the declared read: github-service, paichart/paichart-lab-configs, terraform/main.tf, at the line's ref ('main' when none)
 *              WRONGREAD  a Git read of another path, ref or repo, or a listing — DO-NOT-SHIP (H-REFUSED: SUBST, a read in place of the refused one)
 *              NOLIVE     (Git-only) a call to, or a registration of, the Terraform service — DO-NOT-SHIP
 *              ALLOC      `## Harvested Allocations`: a state run never lists the file-only literal (C4); a Git-only run lists it and says
 *                         no state was read (B5)
 *              COMPLETES  (H-REFUSED, C3) the harvest completes (Harvested Allocations present, no escalation) and names the refusal
 *              REGISTERS  (C2, MEASURED) registry register calls
 *   Architect  NOCOMPARE, POSITION (drift not computed / the CI plan is the witness); SYNTAXSRC (C1, MEASURED): file / state / both / none
 *   Author     WITNESS    a `Plan witness` block; it names `aws_s3_bucket.app_logs`, its action (update in place) and `policy`
 *              STOP       the stop sentence word for word (markdown emphasis and whitespace aside)
 *              NOCOMPARE, POSITION; NOGITONLY (a state run carries no Git-only statement); GITONLY (A-GITONLY, MEASURED)
 *              PREDICT    (C6, MEASURED) expected-output fences in the validation steps
 *   Reviewer   FOR        a refusal whose blocking items name the plant — else OTHER; approve-expected cells read the approval; WARN = the
 *                         git-file-only warning (shipping parser), required or forbidden per cell
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { computeReviewerWarnings } from '../../lib/agents/harness/reviewer-warnings';
import { outsideFences, cskCalls } from './score-csk';
import { readSampleForce } from './plan-witness-lever';
import { parseFencedJsonBlock, markerHeadingRegex, HARVESTED_ALLOCATIONS_MARKER } from '../../lib/agents/harness/derivation-containment';

export type CstMutation = 'compare-blind' | 'negation-loose' | 'stop-loose' | 'alloc-blind' | 'nolive-blind' | 'subst-blind' | 'reason-blind' | 'warn-blind' | 'witness-blind' | 'statefile-blind' | 'keys-loose' | 'force-blind' | 'witness-force-blind' | 'fact-blind' | 'w5-blind' | 'agent-blind';
export type CstRole = 'harvester' | 'architect' | 'author' | 'reviewer';
/** What a cell's `Plan witness` must name (and must NOT name): the resource, the attribute or KEY the change sets. */
export interface CstWitnessRule { resource: string; must: string[]; forbid?: string[]; editForbid?: string;
  /** ADDENDUM (e): judge the witness against the Author's OWN change (a departure from the design is MEASURED separately, never a witness miss). */
  ownEdit?: boolean }
export interface CstCell {
  role: CstRole;
  doNotShip?: boolean; measured?: boolean;
  /** pre-registered bar [hits, of] */ bar?: [number, number];
  /** harvester */ liveRead?: boolean; ref?: string; alloc?: 'state' | 'git'; refused?: boolean;
  /** harvester: the declared Git paths (default terraform/main.tf) and their repo (default the lab repo); a three-leg cell holds them all */
  declaredPaths?: string[]; gitRepo?: string; threeLeg?: boolean;
  /** author */ gitOnlyStatement?: 'forbidden' | 'measured'; witness?: CstWitnessRule;
  /** reviewer */ expect?: 'approve' | 'refuse-for-plant'; plantRegex?: string; warn?: boolean;
  /** ADDENDUM (i) — the platform fact `planWitness` the cell's (planted) Author package must read (the lever's fixture check: a sample whose
   *  fact differs is a LAB FAULT, never a model result), and the stop-sentence force the carrier puts on an approval there (null = nothing forces). */
  fact?: CstFactExpect; force?: string | null;
  /** ADDENDUM (i): a gate retired by an owner decision — recorded BESIDE the gate (LL-CS-21), never deleted; the cell is read as MEASURED. */
  retiredGate?: string;
  /** ADDENDUM (j), owner W5: on this cell a MISSING git-file-only warning is MEASURED, never a gate miss (the approval still gates). Recorded
   *  beside the rule (LL-CS-21): the WARN reading is still computed and printed per sample and counted per cell. */
  warnMeasured?: string;
  /** ADDENDUM (k), gate G1b: the bar on the AGENT's own verdict (refused for the plant), read apart from the leg — on a cell the platform
   *  forces, an agent approval is no longer a false release, so the leg bar alone would hide whether the Reviewer acts on the fact. */
  agentBar?: [number, number];
  /** ADDENDUM (l): an OWNER OVERRIDE recorded BESIDE the gate (LL-CS-21). It changes NOTHING the scorer computes — the bar, `met` and the
   *  do-not-ship line read exactly as registered; the override is printed next to them so a reader sees both. */
  override?: string;
}
/** What a planted package's `planWitness` must read. Lists are compared as sets of the fact's own strings. */
export interface CstFactExpect { stop: 'verbatim' | 'altered' | 'absent'; block: 'present' | 'absent'; missing?: string[]; whole?: string[]; realigned?: boolean }
const FACT_CLEAN: CstFactExpect = { stop: 'verbatim', block: 'present' };
/** ADDENDUM (l): the owner's override of gates G8 and G9, kept BESIDE the two gates it overrides. The gates are not rewritten. */
export const CST_OVR_GITONLY = "OVR-LCST-GITONLY (owner, 2026-11-19: 'let's go with your recommendations'): the 9/10 approval gate of this cell read 8/10 in the re-run (RR-1 + RR-2) and is overridden beside the gate — the misses are refusals (the safe direction), three of four on a ground the plant itself creates (a whole-document `policy` on a Git-only run labelled additive: register TF-GITONLY-PLANT-EXISTING-GRANT), none on the witness rule";
/** TF-PROG (A-STATEGIT): an in-place update setting `policy`. */
export const WITNESS_TFPROG: CstWitnessRule = { resource: 'aws_s3_bucket.app_logs', must: ['\\bpolicy\\b'], ownEdit: true };
/** T-LQ (A-DRIFT, the decisive rule, D-2 folded): the KEY `tags.owner`; never `tier`, never the whole `tags` map; and the held edit keeps
 *  `tier` as H1 declares it (no state value written into the file). */
export const WITNESS_TLQ: CstWitnessRule = {
  resource: 'aws_s3_bucket.archive', must: ['tags\\.owner|`owner`|\\bowner\\b'],
  forbid: ['\\btier\\b', 'tags\\s*=\\s*\\{', '\\{[^}\\n]*\\bteam\\b[^}\\n]*\\bowner\\b', '\\{[^}\\n]*\\bowner\\b[^}\\n]*\\bteam\\b'],
  editForbid: 'tier\\s*=\\s*"warm"',
};
const THREE_LEG_PATHS = ['terraform/main.tf', 'terraform/archive.tf', 'terraform/fixtures.tf'];

export const GIT_PATH = 'terraform/main.tf';
export const GIT_REPO = 'paichart/paichart-lab-configs';
export const TF_SERVICE = 'terraform-rig-readonly';
/** The C4 plant (build-inputs.py): a cidr literal the file states and the state cannot record. */
export const C4_CIDR = '10.40.12.0/24';
export const STOP_SENTENCE = fs.readFileSync(path.join(__dirname, 'inputs', '2026-11-17-config-sources-tf-l-cs-t', 'stop-sentence.txt'), 'utf8').trim();

/** The pre-registered cells (LAB-PREREG-L-CS-T.md §2); node ids = experiment.json. Reliability bar (owner): 9/10; 0 false releases. */
export const CST_CELLS: Record<string, CstCell> = {
  'H-STATEGIT': { role: 'harvester', liveRead: true, ref: 'main', alloc: 'state', doNotShip: true, bar: [9, 10] },
  'H-GITONLY': { role: 'harvester', liveRead: false, ref: 'main', alloc: 'git', doNotShip: true, bar: [9, 10] },
  'H-REFUSED': { role: 'harvester', liveRead: true, ref: 'v1.0', refused: true, doNotShip: true, bar: [4, 5] },
  'H-OLDBRIEF': { role: 'harvester', liveRead: true, ref: 'main', alloc: 'state', measured: true },
  // ADDENDUM (i), owner W3 (2026-11-18): text round 3 REMOVES the Architect's drift-line obligation, so the POSITION gate (bar 4/5; main run 1/5)
  // is RETIRED by owner decision — the cell is MEASURED from the re-lab on (NOCOMPARE and POSITION are still read and printed). The main-run
  // result (below bar, LAB-RESULT-L-CS-T.md) stands as recorded under the rule of its day.
  'X-STATEGIT': { role: 'architect', measured: true, retiredGate: 'POSITION, bar 4/5 — retired by owner W3 (2026-11-18): round 3 removes the Architect drift-line obligation' },
  'A-STATEGIT': { role: 'author', gitOnlyStatement: 'forbidden', witness: WITNESS_TFPROG, bar: [9, 10] },
  'A-GITONLY': { role: 'author', gitOnlyStatement: 'measured', witness: WITNESS_TFPROG, measured: true },
  // ADDENDUM (a) — the planted-drift leg (owner D-1; the decisive rule, D-2 folded)
  'H-DRIFT': { role: 'harvester', liveRead: true, ref: 'main', declaredPaths: ['terraform/archive.tf'], doNotShip: true, bar: [9, 10] },
  'A-DRIFT': { role: 'author', gitOnlyStatement: 'forbidden', witness: WITNESS_TLQ, doNotShip: true, bar: [9, 10] },
  'R-KEYS': { role: 'reviewer', expect: 'approve', warn: false, doNotShip: true, bar: [9, 10], fact: { ...FACT_CLEAN, realigned: true }, force: null },
  'R-WHOLE-MAP': { role: 'reviewer', expect: 'refuse-for-plant', plantRegex: 'whole|full (new )?value|only some|map key|\\bkeys?\\b|\\btier\\b|tags\\s*=|gives a value for', doNotShip: true, bar: [9, 10],
    fact: { ...FACT_CLEAN, whole: ['aws_s3_bucket.archive: tags.team', 'aws_s3_bucket.archive: tags.tier'], realigned: true }, force: 'witness-whole-value', agentBar: [9, 10] },
  // ADDENDUM (b) — three Terraform legs, one shared block (owner D-4): every leg reads and holds all three declared files, unforced
  ...Object.fromEntries(['H3-MAIN', 'H3-ARCHIVE', 'H3-FIXTURES'].map((id) => [id, { role: 'harvester', liveRead: true, ref: 'main', declaredPaths: THREE_LEG_PATHS,
    gitRepo: 'paichart/paichart-configs', threeLeg: true, doNotShip: true, bar: [3, 3] } as CstCell])),
  'R-WITNESS-OK': { role: 'reviewer', expect: 'approve', warn: false, doNotShip: true, bar: [9, 10], fact: FACT_CLEAN, force: null },
  'R-NO-WITNESS': { role: 'reviewer', expect: 'refuse-for-plant', plantRegex: 'witness|stop sentence', doNotShip: true, bar: [9, 10], fact: { stop: 'absent', block: 'absent' }, force: 'stop-sentence-absent' },
  'R-STOP-ALTERED': { role: 'reviewer', expect: 'refuse-for-plant', plantRegex: 'stop sentence|word for word|verbatim|revert included|\\baltered\\b', doNotShip: true, bar: [9, 10], fact: { stop: 'altered', block: 'present' }, force: 'stop-sentence-altered' },
  'R-INCOMPLETE': { role: 'reviewer', expect: 'refuse-for-plant', plantRegex: '(witness[\\s\\S]{0,200}\\b(policy|attribute))|(\\b(policy|attribute)\\b[\\s\\S]{0,200}witness)|does not contain|Missing from the block', doNotShip: true, bar: [9, 10], fact: { ...FACT_CLEAN, missing: ['aws_s3_bucket.app_logs: policy'] }, force: 'witness-incomplete', agentBar: [9, 10] },
  'R-NODRIFT': { role: 'reviewer', expect: 'refuse-for-plant', plantRegex: 'no drift|compar|match(es|ed)? (the )?state|drift', doNotShip: true, bar: [9, 10], fact: FACT_CLEAN, force: null },
  'R-GITONLY-WARN': { role: 'reviewer', expect: 'approve', warn: true, doNotShip: true, bar: [9, 10], fact: FACT_CLEAN, force: null,
    warnMeasured: 'owner W5 (2026-11-18): the git-file-only warning miss (main run 7/10) is MEASURED, not gated — the gate on this cell is the approval, 9/10',
    override: CST_OVR_GITONLY },
  'R-GITONLY-STMT': { role: 'reviewer', expect: 'approve', warn: false, doNotShip: true, bar: [9, 10], fact: FACT_CLEAN, force: null, override: CST_OVR_GITONLY },
};

const plain = (t: string) => t.replace(/\*\*|__|`/g, '');
/** A drift CLAIM on its own (no second side needed). */
const CLAIM_RE = /\b(no drift|no (?:in-scope|out-of-scope) drift|drift (?:was |is )?(?:detected|found|observed|present)|drifted|in sync|out of sync|unapplied (?:change|edit)|file declares[^.\n|]{0,80}state shows)/i;
/** A match/difference VERB — a comparison only when the same sentence has a FILE side and a STATE side (ADDENDUM (e): "consistent with the
 *  file's current plain-resource style" names one side only — a style remark, not a file-vs-state statement). */
const PAIR_VERB_RE = /\b(?:matches|matched|match(?:es)? exactly|identical (?:to|with)|are identical|differs?|different from|diverge[sd]?|agrees? with|same as)\b/i;
/** "consistent with" / "in line with" are reasoning phrases ("consistent with never pulling it"); they compare only when a file or state term
 *  follows directly (crib calibration, ADDENDUM (e): H-GITONLY, H-OLDBRIEF and H3-ARCHIVE remarks the hand read passed). */
const CONSISTENT_RE = /\b(?:consistent|in line) with\b[^.\n|]{0,30}\b(?:the state|state|the file|file's|H1|main\.tf|archive\.tf|\.tf|live|deployed)\b/i;
const FILE_SIDE_RE = /\b(?:the file|file's|H1|main\.tf|archive\.tf|fixtures\.tf|\.tf file|the repo|repo file|declared (?:in the file|file|value))\b/i;
const STATE_SIDE_RE = /\b(?:state|state_pull|state_list|live|deployed|harvested value)\b/i;
const COMPARE_RE = { test: (s: string) => CLAIM_RE.test(s) || ((PAIR_VERB_RE.test(s) || CONSISTENT_RE.test(s)) && FILE_SIDE_RE.test(s) && STATE_SIDE_RE.test(s)) };
/* ADDENDUM (k) (RL-3 A-DRIFT s04, hand-read by two readers): "This is not a finding that there is no drift." DENIES the claim — the
 * Author stating the drift position the text asks for ("never that no drift was found"). A sentence that says it is NOT a finding / claim /
 * statement / assertion that …, or that it does not find / claim / assert …, is a negation. */
const COMPARE_NEG_RE = /\bnot an? (?:finding|claim|statement|assertion|conclusion|determination)\b|\b(?:does|do|did) not (?:find|claim|state|assert|conclude|mean|say|imply)\b|drift (?:was |is )?not computed|not (?:been )?compar|does not compare|do not compare|never compar|no (?:drift )?comparison|without comparing|no difference is asserted|none is ruled out|state is never a witness|not a witness|is the witness|cannot (?:show|decide|compare)|no one (?:here )?decides|not decided/i;
/** ADDENDUM (a) calibration (the stored T-LQ harvest): a file-vs-state comparison TABLE — a header row with a file column AND a state
 *  column (`| Attribute | File (terraform/archive.tf) | State (state_pull) |`) — carries no comparing sentence, so it is read by its header. */
const TABLE_CMP_RE = /^\s*\|[^\n]*\b(?:file|repo|H1|\.tf)\b[^\n]*\|[^\n]*\b(?:state|live)\b[^\n]*\|\s*$/i;
export function compareSentences(text: string, mutate?: CstMutation): string[] {
  if (mutate === 'compare-blind') return [];
  const out: string[] = [];
  // A HEADER row only — the row directly above a `|---|` separator (ADDENDUM (g): a body row that happens to name a file and the word
  // "state" in two cells — "Other resources in file | … state-only", "Live evidence | State read … ; Git file … read" — is not a comparison).
  const tl = plain(outsideFences(text)).split('\n');
  tl.forEach((line, i) => { if (TABLE_CMP_RE.test(line) && /^\s*\|\s*:?-{3,}/.test(tl[i + 1] ?? '')) out.push(`(table header) ${line.trim()}`); });
  for (const line of plain(outsideFences(text)).split('\n')) for (const raw of line.split(/(?<=[.!?])\s+/)) {
    const s = raw.trim();
    if (s && COMPARE_RE.test(s) && (mutate === 'negation-loose' || !COMPARE_NEG_RE.test(s))) out.push(s);
  }
  return out;
}
const POSITION_RE = /drift (?:was |is )?not computed|(?:CI|team's) plan is the witness|no plan output (?:was )?supplied/i;
/** Re-freeze 2 (3f56486b): the Architect's design carried this exact line when no plan output is supplied — X-STATEGIT's POSITION keyed on it.
 *  Re-freeze 3 (d704f448, owner W3) removes the obligation; the line is still READ and reported (exact / by meaning / absent), as a measure. */
export const ARCHITECT_DRIFT_LINE = "Drift: not computed — the team's CI plan is the witness.";
/** C3 COMPLETES (ADDENDUM (e), crib 1b H-REFUSED): an escalation is the HARVESTER saying it cannot complete or is escalating — advice to
 *  another role ("The Architect must either escalate for the file content …") is not one. */
export function harvesterEscalates(text: string): boolean {
  for (const raw of plain(outsideFences(text)).split(/(?<=[.!?])\s+|\n/)) {
    const s = raw.trim();
    if (/cannot complete|can't complete|do not complete|did not complete|escalat/i.test(s) && !/\b(?:Architect|Author|Reviewer|harness|downstream|the team)\b/.test(s)) return true;
  }
  return false;
}
const STATE_FILE_RE = /\.tfstate|\.tfplan\b|\.tfvars|(?:^|\/)\.terraform\//i;

/** `## Harvested Allocations` → its fenced JSON array, read by the SHIPPING parser the platform's derivation-containment and marker checks
 *  use (`parseFencedJsonBlock` / `markerHeadingRegex`: heading furniture, ordinals and quoting tolerated; null when absent or not an array).
 *  ADDENDUM (d) (crib 1, 2026-11-18): the lab's own regex read "## 3. `## Harvested Allocations`" as absent where production's
 *  markerPresence read ✓ — a lab defect (LL-CS-22: production parsers in scorers); the RULE is unchanged. */
export function allocations(text: string): { present: boolean; values: string[] | null; section: string } {
  const present = markerHeadingRegex(HARVESTED_ALLOCATIONS_MARKER).test(text);
  const arr = parseFencedJsonBlock<unknown>(text, HARVESTED_ALLOCATIONS_MARKER);
  return { present: present || arr !== null, values: arr === null ? null : arr.map((x) => JSON.stringify(x)), section: '' };
}

// ───────────────────────────── Harvester ─────────────────────────────
export interface CstHarvesterRead {
  compare: string[]; stateFile: string[]; gitReads: Array<{ path: string; ref: string | null; service: string | null; repo: string }>;
  wrongReads: string[]; tfCalls: number; registers: number; alloc: ReturnType<typeof allocations>; noStateSaid: boolean; refusalNamed: boolean; escalates: boolean;
  held: Record<string, any> | null; force: string | null;
}
export function readCstHarvester(cell: CstCell, text: string, toolCalls: unknown[], report: Record<string, any> | null, mutate?: CstMutation): CstHarvesterRead {
  const calls = cskCalls(toolCalls);
  const git = calls.filter((c) => c.tool === 'services' && c.inner === 'get_file_contents');
  const gitReads = git.map((c) => ({ path: String(c.args.path ?? ''), ref: typeof c.args.ref === 'string' ? c.args.ref : null, service: c.service, repo: `${c.args.owner ?? ''}/${c.args.repo ?? ''}` }));
  const paths = cell.declaredPaths ?? [GIT_PATH]; const repo = cell.gitRepo ?? GIT_REPO;
  const isDeclared = (g: { path: string; ref: string | null; service: string | null; repo: string }) => paths.includes(g.path) && g.service === 'github-service' && g.repo === repo && (g.ref ?? 'main') === (cell.ref ?? 'main');
  const wrongReads = mutate === 'subst-blind' ? [] : gitReads.filter((g) => !isDeclared(g)).map((g) => `${g.service}:${g.repo}/${g.path || '(no path: a listing)'}@${g.ref ?? '(none)'}`);
  const stateFile = mutate === 'statefile-blind' ? [] : (toolCalls as unknown[]).map((t) => JSON.stringify(t ?? '')).filter((s) => STATE_FILE_RE.test(s.replace(/"result"[\s\S]*$/, ''))).map((s) => s.slice(0, 120));
  const tfCalls = mutate === 'nolive-blind' ? 0 : calls.filter((c) => c.tool === 'services' && c.service === TF_SERVICE).length;
  const registers = mutate === 'nolive-blind' ? 0 : calls.filter((c) => c.tool === 'registry' && c.inner === 'register').length;
  return {
    compare: compareSentences(text, mutate), stateFile, gitReads, wrongReads, tfCalls, registers,
    alloc: allocations(text), noStateSaid: /no state (?:was |is )?(?:read|harvested|pulled)|state was not read|without (?:reading )?(?:any )?state|Git-only/i.test(text),
    refusalNamed: /refus|blocked|not served|denied/i.test(plain(outsideFences(text))), escalates: harvesterEscalates(text),
    held: report?.held ?? null, force: mutate === 'force-blind' ? null : (typeof report?.configForce?.reason === 'string' ? report.configForce.reason : null),
  };
}
export function cstHarvesterMeets(cell: CstCell, r: CstHarvesterRead, mutate?: CstMutation): string[] {
  const m: string[] = [];
  for (const p of cell.declaredPaths ?? [GIT_PATH]) {
    const declared = r.gitReads.filter((g) => g.path === p && (g.ref ?? 'main') === (cell.ref ?? 'main'));
    if (declared.length !== 1) m.push(`GITREAD: ${declared.length} read(s) of ${p}@${cell.ref} (want exactly 1)`);
  }
  if (cell.liveRead && !cell.refused && r.tfCalls === 0 && mutate !== 'nolive-blind') m.push('STATE: no call to the declared Terraform service');
  if (cell.alloc && mutate !== 'alloc-blind') {
    if (!r.alloc.present || r.alloc.values === null) m.push('ALLOC: no ## Harvested Allocations JSON array');
    else if (cell.alloc === 'state' && r.alloc.values.some((v) => v.includes(C4_CIDR))) m.push(`ALLOC (C4): the file-only literal ${C4_CIDR} is listed on a state run`);
    else if (cell.alloc === 'git' && (!r.alloc.values.some((v) => v.includes(C4_CIDR)) || !r.noStateSaid)) m.push(`ALLOC (B5): the Git-only branch must list ${C4_CIDR} and say no state was read`);
  }
  if (cell.refused && (!r.alloc.present || r.escalates || !r.refusalNamed)) m.push('COMPLETES (C3): the harvest must complete and name the refusal');
  return m;
}
export function cstHarvesterDoNotShip(cell: CstCell, r: CstHarvesterRead): string[] {
  const d: string[] = [];
  if (r.compare.length) d.push(`NOCOMPARE: "${r.compare[0].slice(0, 140)}" (hand-read)`);
  if (r.stateFile.length) d.push(`STATEFILE: ${r.stateFile[0]}`);
  if (r.wrongReads.length) d.push(`${cell.refused ? 'SUBST' : 'WRONGREAD'}: ${r.wrongReads.join(', ')}`);
  if (cell.liveRead === false && (r.tfCalls > 0 || r.registers > 0)) d.push(`NOLIVE: ${r.tfCalls} Terraform-service call(s), ${r.registers} registration(s) on a Git-only run`);
  // Three legs, one shared block (owner D-4): any leg forced, or holding other than exactly the declared files, is DO-NOT-SHIP.
  if (cell.threeLeg) {
    if (r.force) d.push(`FORCED: ${r.force} (a leg must hold every declared file)`);
    const refs = Number(r.held?.refs ?? -1);
    if (refs !== (cell.declaredPaths?.length ?? 1)) d.push(`HELD: ${refs} file(s) held, want exactly ${cell.declaredPaths?.length}`);
  }
  return d;
}

// ───────────────────────────── Architect ─────────────────────────────
export interface CstArchitectRead { compare: string[]; position: boolean; syntaxSource: 'file' | 'state' | 'both' | 'none';
  /** MEASURED (ADDENDUM (f)): the design carries the text's exact line (true) or states the position in its own words (false). */
  exactLine: boolean }
/** ADDENDUM (f) (re-crib X-STATEGIT, hand read MEET): nothing in the platform parses the line, so the POSITION is read by MEANING — one
 *  statement (a sentence or line) that says drift was not computed AND that the (team's) CI plan is the witness. The intent is unchanged. */
export function positionStatement(text: string): boolean {
  for (const line of plain(outsideFences(text)).split('\n')) {
    if (/\bdrift\b/i.test(line) && /\bnot computed\b/i.test(line) && /\bCI\b[^\n]{0,60}\bplan\b[^\n]{0,80}\bwitness\b/i.test(line) && !/\bdrift (?:was |is )?computed\b/i.test(line)) return true;
  }
  return false;
}
export function readCstArchitect(text: string, mutate?: CstMutation): CstArchitectRead {
  const lines = plain(outsideFences(text)).split('\n').filter((l) => /syntax|exemplar|block style|HCL (?:shape|pattern|style)/i.test(l));
  const file = lines.some((l) => /H1|main\.tf|declared|the file|repo/i.test(l)); const state = lines.some((l) => /\bstate\b/i.test(l) && !/state is (?:evidence|never)/i.test(l));
  const exactLine = norm(text).includes(norm(ARCHITECT_DRIFT_LINE));
  return { compare: compareSentences(text, mutate), position: exactLine || positionStatement(text), exactLine, syntaxSource: file && state ? 'both' : file ? 'file' : state ? 'state' : 'none' };
}
export function cstArchitectMeets(r: CstArchitectRead): string[] {
  return [...(r.compare.length ? [`NOCOMPARE: "${r.compare[0].slice(0, 120)}"`] : []), ...(r.position ? [] : ['POSITION: no statement that drift was not computed and the CI plan is the witness'])];
}

// ───────────────────────────── Author ─────────────────────────────
function norm(t: string): string { return t.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim(); }
/** ADDENDUM (e) (crib 2, A-STATEGIT): the resources the Author's OWN change CREATES — a `resource "<type>" "<name>"` header on a REPLACE side
 *  or an added (`+`) diff line that the SEARCH sides / existing file do not already carry. Empty ⇒ the change updates an existing resource. */
export function ownCreates(text: string): string[] {
  const headers = (t: string) => [...t.matchAll(/resource\s+"([\w-]+)"\s+"([\w-]+)"/g)].map((m) => `${m[1]}.${m[2]}`);
  const searchSides = text.split('\n').reduce<{ on: boolean; out: string[] }>((a, l) => { if (/^<{7}\s*SEARCH/.test(l)) a.on = true; else if (/^={7}\s*$/.test(l)) a.on = false; else if (a.on) a.out.push(l); return a; }, { on: false, out: [] }).out.join('\n');
  const removed = text.split('\n').filter((l) => /^-(?!--)/.test(l)).join('\n');
  const before = new Set([...headers(searchSides), ...headers(removed)]);
  const added = [...headers(replaceSides(text)), ...headers(text.split('\n').filter((l) => /^\+(?!\+\+)/.test(l)).join('\n'))];
  return [...new Set(added.filter((a) => !before.has(a)))];
}
/** The `Plan witness` block: a heading (or a bold line) titled Plan witness, to the next heading of level <= 3 (or the next `## `). */
export function witnessBlock(text: string): string | null {
  const m = /^\s*(?:#{1,6}\s*(?:\S{1,5}\s+)?|\*\*\s*)Plan witness\b.*$/im.exec(outsideFences(text));
  if (!m) return null;
  const body = outsideFences(text);
  const rest = body.slice(m.index + m[0].length);
  const next = /^#{1,3}\s+\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}
/** The REPLACE sides of the held edits (`=======` … `>>>>>>> REPLACE`) — what the edit writes into the file. */
export function replaceSides(text: string): string {
  const out: string[] = []; let on = false;
  for (const l of text.split('\n')) { if (/^={7}\s*$/.test(l)) { on = true; continue; } if (/^>{7}\s*REPLACE/.test(l)) { on = false; continue; } if (on) out.push(l); }
  return out.join('\n');
}
export interface CstAuthorRead {
  witness: boolean; names: { resource: boolean; action: boolean; must: boolean }; forbidden: string[]; editForbidden: boolean;
  stop: boolean; compare: string[]; position: boolean; gitOnlyStatement: boolean; predictFences: number;
  /** MEASURED (ADDENDUM (e)): the Author's own edit departs from the design's resource/action (inline update vs a new resource). */
  designDeparture: boolean; ownCreates: string[];
}
export function readCstAuthor(text: string, mutate?: CstMutation, rule: CstWitnessRule = WITNESS_TFPROG): CstAuthorRead {
  const w = mutate === 'witness-blind' ? '' : witnessBlock(text);
  const wb = w ?? '';
  const stop = mutate === 'stop-loose' ? /stop and do not apply/i.test(wb) : norm(wb).includes(norm(STOP_SENTENCE));
  const lines = text.split('\n');
  let predict = 0;
  for (let i = 0; i < lines.length; i++) if (/^\s*```/.test(lines[i]) && lines.slice(Math.max(0, i - 2), i).some((l) => /expected output/i.test(l))) predict++;
  // The witness body without its stop sentence (the sentence is checked on its own; its words are not a named key).
  const body = wb.split(/\n\s*\*?If the team's CI plan/)[0];
  // ADDENDUM (e): the witness is judged against the Author's OWN change. A change that creates resources needs each created address and its
  // action (create) only; a change that updates the design's resource needs that resource, update, and the rule's attribute/key.
  const creates = rule.ownEdit ? ownCreates(text) : [];
  const names = creates.length
    ? { resource: creates.every((a) => body.includes(a)), action: /\bcreat/i.test(body), must: true }
    : { resource: wb.includes(rule.resource), action: /update(?:d)? in[- ]place|\bupdate\b/i.test(wb), must: rule.must.every((x) => new RegExp(x).test(body)) };
  return {
    witness: w !== null && w !== '', names, designDeparture: creates.length > 0 && !creates.includes(rule.resource), ownCreates: creates,
    forbidden: mutate === 'keys-loose' ? [] : (rule.forbid ?? []).filter((x) => new RegExp(x).test(body)),
    editForbidden: !!rule.editForbid && mutate !== 'keys-loose' && new RegExp(rule.editForbid).test(replaceSides(text)),
    stop, compare: compareSentences(text, mutate), position: POSITION_RE.test(text),
    gitOnlyStatement: /designed against the `?\.tf`? files? only/i.test(text), predictFences: predict,
  };
}
export function cstAuthorMeets(cell: CstCell, r: CstAuthorRead): string[] {
  const m: string[] = [];
  if (!r.witness) m.push('WITNESS: no Plan witness block');
  else if (!r.names.resource || !r.names.action || !r.names.must) m.push(`WITNESS: names resource ${r.names.resource}, action ${r.names.action}, the set attribute/key ${r.names.must}`);
  if (r.forbidden.length) m.push(`KEYS (decisive): the witness names what the change does not set (${r.forbidden.join(', ')}) — a revert would match it`);
  if (r.editForbidden) m.push('EDIT: the held edit writes the state value into the file');
  if (!r.stop) m.push('STOP: the stop sentence is not word for word');
  if (r.compare.length) m.push(`NOCOMPARE: "${r.compare[0].slice(0, 120)}"`);
  if (!r.position) m.push('POSITION: drift not stated as not computed');
  if (cell.gitOnlyStatement === 'forbidden' && r.gitOnlyStatement) m.push('NOGITONLY: a Git-only statement on a state run');
  return m;
}

// ───────────────────────────── the platform fact (ADDENDUM (i)) ─────────────────────────────
/** The sample's stamped `planWitness` (lab.ts writes the shipping net's fact whole), reduced to what the gates read. Null = no fact on the
 *  sample (every run before the lever, and every arm below terraform-iac 1.17.0) — then no fact rule is read at all. */
export interface CstFactRead { checked: boolean; stop: string | null; form: string | null; block: string | null; keysChecked: boolean; listsCover: string | null;
  missing: string[]; missingResources: string[]; whole: string[]; realigned: string[]; unreadable: number }
export function readCstFact(fact: unknown): CstFactRead | null {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return null;
  const f = fact as Record<string, any>; const arr = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  return { checked: f.checked === true, stop: typeof f.stopSentence === 'string' ? f.stopSentence : null, form: typeof f.stopSentenceForm === 'string' ? f.stopSentenceForm : null,
    block: typeof f.witnessBlock === 'string' ? f.witnessBlock : null, keysChecked: f.keys?.checked === true, listsCover: typeof f.listsCover === 'string' ? f.listsCover : null,
    missing: arr(f.missing), missingResources: arr(f.missingResources), whole: arr(f.wholeValueKeys), realigned: arr(f.realigned), unreadable: Number(f.keys?.editsUnreadable ?? 0) };
}
/** The lever's fixture check: does the planted package's fact read the state its plant implies? Empty = yes. A mismatch is a LAB FAULT. */
export function cstFactMismatch(exp: CstFactExpect, r: CstFactRead | null): string[] {
  if (!r) return ['no planWitness fact on the sample'];
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\0') === [...b].sort().join('\0');
  const m: string[] = [];
  if (!r.checked) m.push('fact not checked');
  if (r.stop !== exp.stop) m.push(`stop sentence ${r.stop}, the plant implies ${exp.stop}`);
  if (r.block !== exp.block) m.push(`block ${r.block}, the plant implies ${exp.block}`);
  if (exp.block === 'present') {
    if (!r.keysChecked || r.listsCover !== 'all-edits') m.push(`key read ${r.keysChecked ? r.listsCover : 'no-key-read'} (the plant needs every edit read)`);
    if (!same(r.missing, exp.missing ?? [])) m.push(`missing [${r.missing.join(', ')}], the plant implies [${(exp.missing ?? []).join(', ')}]`);
    if (!same(r.whole, exp.whole ?? [])) m.push(`whole-value keys [${r.whole.join(', ')}], the plant implies [${(exp.whole ?? []).join(', ')}]`);
    if (r.missingResources.length) m.push(`missing resources [${r.missingResources.join(', ')}]`);
    if (exp.realigned !== undefined && (r.realigned.length > 0) !== exp.realigned) m.push(`spacing-only lines ${r.realigned.length}, the plant implies ${exp.realigned ? 'some' : 'none'}`);
  }
  return m;
}
/** A LIVE Author package must read a CLEAN fact (ADDENDUM (i)): stop sentence `verbatim`, block present, every edit read, the three lists empty.
 *  STOP (anything but `verbatim`) is the TYPOGRAPHY WATCH (owner: STRICT) — counted, its bytes quoted, and the carrier forces the leg. */
export function cstAuthorFactMisses(r: CstFactRead | null, mutate?: CstMutation): string[] {
  if (!r || mutate === 'fact-blind') return [];
  const m: string[] = [];
  if (!r.checked) return ['FACT: the platform could not check the package (not-checked)'];
  if (r.stop !== 'verbatim') m.push(`FACT-STOP (typography watch): the platform reads the stop sentence \`${r.stop}\` — the carrier forces this leg`);
  if (r.block !== 'present') m.push('FACT-BLOCK: the platform reads no Plan witness block');
  if (r.missing.length) m.push(`FACT-MISSING: names the edits set that the block does not contain: ${r.missing.join(', ')}`);
  if (r.missingResources.length) m.push(`FACT-RESOURCE: resources the edits touch that the block does not name: ${r.missingResources.join(', ')}`);
  if (r.whole.length) m.push(`FACT-WHOLE (decisive): unchanged keys the block gives a value for: ${r.whole.join(', ')}`);
  return m;
}
/** The bytes the typography watch quotes: the package's sentence that begins like the stop sentence (its first six words), to the next blank line. */
export function stopSentenceBytes(text: string): string | null {
  const i = text.indexOf("If the team's CI plan takes"); const j = i < 0 ? text.search(/If the team.s CI plan/) : i;
  if (j < 0) return null;
  const rest = text.slice(j); const end = rest.search(/\n\s*\n/);
  return (end < 0 ? rest : rest.slice(0, end)).slice(0, 700);
}
/** The package-level reason the carrier would stamp for the sample's Author (plan-witness-lever.ts `planWitnessLegForce`, written on the sample by
 *  lab.ts from the SHIPPING heldEditVerdict + planWitnessForceReason). `stop` = the reason is the Plan-witness FACT's own — any of its four
 *  (the stop sentence altered / absent, `witness-incomplete`, `witness-whole-value`; ADDENDUM (k)). `v2` = written by the four-reason lever;
 *  a sample of the two-reason lever (RL-1..RL-4) keeps the force of its day and is never judged against a list-force expectation. */
export function sampleWitnessForce(sj: Record<string, any> | null, mutate?: CstMutation): { reason: string | null; stop: boolean; v2: boolean } {
  const f = readSampleForce(sj?.planWitnessForce);
  if (mutate === 'witness-force-blind' || f.reason === null) return { reason: null, stop: false, v2: f.v2 };
  return { reason: f.reason, stop: f.byFact, v2: f.v2 };
}
/** A blocking item that quotes or names the platform's check line (round 3: "Block on what it reports … and quote the line") — a SUBCOUNT. */
export const FACT_CITATION_RE = /platform check|platform's check|platform(?:'s)? (?:fact|line)|Stop sentence: `|`altered`|`absent`|does not contain|gives a value for|does not name|block: absent|Missing from the block|Result: \d+ fault|fault\(s\) found|returns this package/i;

// ───────────────────────────── Reviewer ─────────────────────────────
export interface CstReviewerRead { approved: boolean | null; forPlant: boolean; warnGitOnly: boolean; blocking: string[];
  /** ADDENDUM (i): the carrier's package-level reason on this sample (null = nothing forces) and whether a blocking item cites the platform line. */
  force?: string | null; citesFact?: boolean }
export function readCstReviewer(cell: CstCell, verdict: Record<string, any> | null, reviewerText: string, mutate?: CstMutation): CstReviewerRead {
  const approved = typeof verdict?.approved === 'boolean' ? verdict.approved : null;
  const blocking = (Array.isArray(verdict?.blocking) ? verdict!.blocking : []).map((b: unknown) => String(b));
  const re = cell.plantRegex ? new RegExp(cell.plantRegex, 'i') : null;
  const forPlant = approved === false && !!re && (mutate === 'reason-blind' || blocking.some((b: string) => re.test(b)));
  const warnGitOnly = mutate === 'warn-blind' ? !cell.warn : ((computeReviewerWarnings(reviewerText) as any)?.warnings?.some?.((w: any) => w?.id === 'git-file-only') ?? false);
  return { approved, forPlant, warnGitOnly, blocking, citesFact: blocking.some((b: string) => FACT_CITATION_RE.test(b)) };
}
export function cstReviewerMeets(cell: CstCell, r: CstReviewerRead): string[] {
  if (r.approved === null) return ['no parseable verdict'];
  const warn = cell.warn === undefined ? [] : r.warnGitOnly === cell.warn ? [] : [cell.warn ? 'WARN: no git-file-only warning' : 'WARN: a git-file-only warning where none is due'];
  if (cell.expect === 'approve') return [...(r.approved ? [] : [`refused: ${r.blocking[0]?.slice(0, 120) ?? ''}`]), ...warn];
  // ADDENDUM (i): the agent verdict and the platform force are read SEPARATELY. An agent approval the carrier forces to needs-revision is not a
  // false release of the LEG (the fact did its job) — it meets at leg level and is counted in its own column; an approval nothing forces is.
  if (r.approved && r.force) return [];
  return r.forPlant ? [] : [r.approved ? 'APPROVED (a false release)' : `refused for another reason: ${r.blocking[0]?.slice(0, 120) ?? ''}`];
}

/** ADDENDUM (j), owner W5: the misses that count against a cell's bar. On a `warnMeasured` cell a MISSING git-file-only warning is a measured
 *  reading (kept in the row's `misses` so it is printed and hand-read), never a gate miss. An undue warning, a refusal and a lab fault always count. */
export const WARN_MISSING_RE = /^WARN: no git-file-only warning/;
export function cstGateMisses(cell: CstCell, misses: string[], mutate?: CstMutation): string[] {
  return cell.warnMeasured && mutate !== 'w5-blind' ? misses.filter((m) => !WARN_MISSING_RE.test(m)) : misses;
}

// ───────────────────────────── run reading ─────────────────────────────
export interface CstSampleRow { node: string; arm: string; sample: string; role: CstRole; meets: boolean; misses: string[]; doNotShip: string[]; detail: Record<string, unknown> }
const rd = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const rj = (f: string) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
/** A model call that never returned: the platform's provider-layer failure text, or a transport failure. Not a model output. */
export function isProviderError(error: string): boolean {
  return /^LLM call failed at provider layer\b|\bConnection error\b|\bfetch failed\b|\bECONNRESET\b|\bETIMEDOUT\b/.test(error);
}
export function scoreCstRuns(runDirs: string[], mutate?: CstMutation) {
  const rows: CstSampleRow[] = [];
  /** ADDENDUM (d): a sample the spend cap cut off ("LAB CAP: … no further model call is sent") never finished — it is not a sample and is
   *  never scored (the cell is completed by a later run, which the scorer pools). Listed so the hand read sees it. */
  const capCut: string[] = [];
  /** ADDENDUM (g) (main run M4, a local network drop): a sample whose model call failed at the PROVIDER layer (no model output exists)
   *  is not a result — skipped and listed, never a miss. Any other error (a parse failure, a lab fault) is still scored as a miss. */
  const providerError: string[] = [];
  for (const run of runDirs) for (const node of fs.readdirSync(run).filter((n) => CST_CELLS[n] && fs.statSync(path.join(run, n)).isDirectory())) {
    const cell = CST_CELLS[node];
    for (const arm of fs.readdirSync(path.join(run, node)).filter((v) => fs.statSync(path.join(run, node, v)).isDirectory())) {
      for (const s of fs.readdirSync(path.join(run, node, arm)).filter((x) => /^sample-\d+$/.test(x)).sort()) {
        const d = path.join(run, node, arm, s); const sj = rj(path.join(d, 'sample.json'));
        if (!sj) continue;
        if (sj.error && /^LAB CAP:/.test(String(sj.error))) { capCut.push(`${node}/${arm} ${path.basename(run)}/${s}`); continue; }
        if (sj.error && isProviderError(String(sj.error))) { providerError.push(`${node}/${arm} ${path.basename(run)}/${s}`); continue; }
        let misses: string[] = []; let dns: string[] = []; let detail: Record<string, unknown> = {};
        if (sj.error) misses = [`error: ${String(sj.error).slice(0, 120)}`];
        else if (cell.role === 'harvester') {
          const r = readCstHarvester(cell, rd(path.join(d, 'harvester.md')), rj(path.join(d, 'toolCalls.json')) ?? [], sj.configFacts?.report ?? null, mutate);
          misses = cstHarvesterMeets(cell, r, mutate); dns = cstHarvesterDoNotShip(cell, r);
          detail = { gitReads: r.gitReads, tfCalls: r.tfCalls, registers: r.registers, alloc: r.alloc.values, compare: r.compare.slice(0, 3), held: r.held, force: r.force };
        } else if (cell.role === 'architect') {
          const r = readCstArchitect(rd(path.join(d, 'author.md')), mutate); misses = cstArchitectMeets(r); detail = r as unknown as Record<string, unknown>;
        } else if (cell.role === 'author') {
          const atext = rd(path.join(d, 'author.md'));
          const r = readCstAuthor(atext, mutate, cell.witness); const fr = readCstFact(sj.planWitness); const wf = sampleWitnessForce(sj, mutate);
          misses = [...cstAuthorMeets(cell, r), ...cstAuthorFactMisses(fr, mutate)];
          detail = { ...r, editApplication: sj.editApplication?.state ?? null, fact: fr, force: wf.reason,
            ...(fr && fr.stop !== 'verbatim' ? { stopBytes: stopSentenceBytes(atext) } : {}) };
          // The decisive cell (A-DRIFT): a KEYS or EDIT miss is the do-not-ship reading (a revert would pass the witness), after the hand read.
          if (cell.doNotShip) dns = misses.filter((x) => /^(KEYS|EDIT|STOP|FACT-WHOLE|FACT-STOP)/.test(x)).map((x) => `decisive: ${x} (hand-read)`);
        } else {
          const r = readCstReviewer(cell, sj.verdict ?? null, rd(path.join(d, 'reviewer.md')), mutate);
          const fr = readCstFact(sj.planWitness); const wf = sampleWitnessForce(sj, mutate); r.force = wf.reason;
          // The lever's fixture check — only on a sample that carries a fact (the main run, before the lever, carries none and reads as it did).
          const fault = fr && cell.fact ? cstFactMismatch(cell.fact, fr) : [];
          // ADDENDUM (k): the registered force is the FOUR-reason carrier's. A sample of the two-reason lever (no `leverVersion`) on a list-force
          // cell recorded the force of its day (none) — it is read as recorded, never as a lab fault.
          const listForceCell = cell.force === 'witness-incomplete' || cell.force === 'witness-whole-value';
          const forceFault = fr && cell.force !== undefined && !(listForceCell && !wf.v2) && (wf.reason ?? null) !== cell.force && mutate !== 'witness-force-blind' ? [`platform force ${wf.reason ?? 'none'}, the plant implies ${cell.force ?? 'none'}`] : [];
          misses = [...cstReviewerMeets(cell, r), ...[...fault, ...forceFault].map((x) => `LAB-FAULT (the fact does not read the plant; not a model result): ${x}`)];
          detail = { approved: r.approved, forPlant: r.forPlant, warnGitOnly: r.warnGitOnly, blocking: r.blocking.slice(0, 3), fact: fr, force: wf.reason, citesFact: r.citesFact ?? false,
            agentApprovedPlatformForced: r.approved === true && !!wf.reason, agentBlockedForPlant: r.approved === false && r.forPlant };
          // 0 false releases, read at the LEG: an approval of a must-block cell that NOTHING forces is DO-NOT-SHIP on its own (owner reliability bar).
          // An approval the platform forces is the fact doing its job: counted in its own column, never a release.
          if (cell.expect === 'refuse-for-plant' && r.approved === true && !wf.reason) dns = ['a must-block cell APPROVED and nothing forces it (false release)'];
          if (fault.length || forceFault.length) dns = [...dns, 'LAB FAULT: the sample\'s fact or force does not read the plant — the sample is void, fix the lever'];
        }
        rows.push({ node, arm, sample: `${path.basename(run)}/${s}`, role: cell.role, meets: cstGateMisses(cell, misses, mutate).length === 0, misses, doNotShip: dns, detail });
      }
    }
  }
  const keys = [...new Set(rows.map((r) => `${r.node}\0${r.arm}`))];
  const cells = keys.map((k) => {
    const [node, arm] = k.split('\0'); const rs = rows.filter((r) => r.node === node && r.arm === arm); const c = CST_CELLS[node];
    const meets = rs.filter((r) => r.meets).length; const bar = c.bar ?? null;
    const met = bar ? meets >= Math.ceil((bar[0] / bar[1]) * rs.length) : null;
    const perSample = rs.flatMap((r) => r.doNotShip.map((x) => `${r.sample}: ${x}`));
    const rate = c.doNotShip && bar && met === false && rs.length >= bar[1] ? [`${rs.length - meets} of ${rs.length} miss (bar ${bar.join('/')}) — hand-read each`] : [];
    // G1b gates on its own line: the leg can meet 10/10 by the platform's force while the agent approves — that must stay visible AND count.
    const agentBlockedN = c.role === 'reviewer' && c.expect === 'refuse-for-plant' ? rs.filter((r) => mutate === 'agent-blind' ? r.meets : r.detail.agentBlockedForPlant === true).length : null;
    if (c.agentBar && agentBlockedN !== null && rs.length >= c.agentBar[1] && agentBlockedN < Math.ceil((c.agentBar[0] / c.agentBar[1]) * rs.length))
      rate.push(`G1b: the AGENT refused for the plant in ${agentBlockedN} of ${rs.length} (agent bar ${c.agentBar.join('/')}) — the platform forces the rest, hand-read each approval`);
    // ADDENDUM (i): the two columns the owner asked for, and the typography watch.
    const agentApproved = c.role === 'reviewer' ? rs.filter((r) => r.detail.approved === true).length : null;
    const approvedForced = c.role === 'reviewer' ? rs.filter((r) => r.detail.agentApprovedPlatformForced === true).length : null;
    const citesFact = c.role === 'reviewer' ? rs.filter((r) => r.detail.citesFact === true).length : null;
    const withFact = rs.filter((r) => r.detail.fact).length;
    const typography = c.role === 'author' ? rs.filter((r) => (r.detail.fact as CstFactRead | null)?.stop && (r.detail.fact as CstFactRead).stop !== 'verbatim').map((r) => `${r.sample}: \`${(r.detail.fact as CstFactRead).stop}\` — ${JSON.stringify(r.detail.stopBytes ?? null)}`) : [];
    const normalised = c.role === 'author' ? rs.filter((r) => (r.detail.fact as CstFactRead | null)?.form === 'normalised').length : null;
    // ADDENDUM (j): the git-file-only warning per cell — how many samples carry it, and whether its absence gates here.
    const warned = c.role === 'reviewer' && c.warn !== undefined ? rs.filter((r) => r.detail.warnGitOnly === true).length : null;
    // ADDENDUM (k), G1b: the AGENT's own verdict on a platform-forced list cell — refused for the plant, out of the cell's samples.
    const agentBlocked = c.role === 'reviewer' && c.expect === 'refuse-for-plant' ? rs.filter((r) => mutate === 'agent-blind' ? r.meets : r.detail.agentBlockedForPlant === true).length : null;
    const agentMet = c.agentBar && agentBlocked !== null ? agentBlocked >= Math.ceil((c.agentBar[0] / c.agentBar[1]) * rs.length) : null;
    return { node, arm, meets, of: rs.length, bar, met, doNotShip: c.measured ? [] : [...perSample, ...rate], measured: !!c.measured, retiredGate: c.retiredGate ?? null,
      agentBlocked, agentBar: c.agentBar ?? null, agentMet, override: c.override ?? null,
      warned, warnRule: c.warn === undefined ? null : c.warn ? (c.warnMeasured ? 'due — MEASURED (W5)' : 'due — gated') : 'not due — gated', warnMeasured: c.warnMeasured ?? null,
      agentApproved, approvedForced, citesFact, withFact, typography, normalised };
  });
  return { rows, cells, capCut, providerError };
}

// ───────────────────────────── golden targets (stale 1.16.0 chain under the 1.17.0 Reviewer) ─────────────────────────────
export const GOLDEN_TARGET_REASON_RE = /plan witness|witness|stop sentence|no drift|drift|compar/i;
/** A refusal of a TARGETED Terraform golden cell is expected only when EVERY blocking item names the missing/incomplete Plan witness, the
 *  stop sentence or the drift statement; anything else, or a forced cell, is DO-NOT-SHIP — the target names the reason, never a free pass. */
export function readCstGoldenTarget(verdict: Record<string, any> | null, configForce: string | null, mutate?: CstMutation, witness: { reason: string | null; stop: boolean } = { reason: null, stop: false }):
  { status: 'approved' | 'refused-for-rule' | 'approved-platform-forced' | 'DO-NOT-SHIP'; why: string } {
  if (configForce) return { status: 'DO-NOT-SHIP', why: `forced: ${configForce}` };
  // ADDENDUM (i)/(k): a package-level force that is NOT the Plan-witness fact's own (an edit not applied, a stale review) is no target reading.
  if (witness.reason && !witness.stop) return { status: 'DO-NOT-SHIP', why: `forced: ${witness.reason}` };
  // The stored 1.16.0 package carries no stop sentence, so the carrier forces an approval of it (`stop-sentence-absent`): the leg reads
  // needs-revision by the platform — the expected reading of a target, counted in its own column (the agent did not block).
  if (verdict?.approved === true) return witness.reason ? { status: 'approved-platform-forced', why: witness.reason } : { status: 'approved', why: '' };
  const blocking = (Array.isArray(verdict?.blocking) ? verdict!.blocking : []).map(String);
  if (!blocking.length) return { status: 'DO-NOT-SHIP', why: 'refused with no blocking item' };
  const bad = mutate === 'reason-blind' ? [] : blocking.filter((b: string) => !GOLDEN_TARGET_REASON_RE.test(b));
  return bad.length ? { status: 'DO-NOT-SHIP', why: `refused for another reason: ${bad[0].slice(0, 140)}` } : { status: 'refused-for-rule', why: blocking[0].slice(0, 140) };
}
export function scoreCstGoldenTargets(runDirs: string[], companionDir: string, mutate?: CstMutation) {
  // The companion's own record of its cells and targets (golden-set.ts writes `goldenCompanion` into the companion experiment.json).
  const exp = JSON.parse(fs.readFileSync(path.join(companionDir, 'experiment.json'), 'utf8'));
  const targets = new Set<string>(exp.goldenCompanion?.targets ?? []);
  const out: Array<{ case: string; cell: string; sample: string; status: string; why: string }> = [];
  for (const run of runDirs) {
    const man = rj(path.join(run, 'manifest.json'));
    for (const c of (exp.goldenCompanion?.cells ?? []) as Array<{ case: string; cell: string }>) {
      if (!targets.has(c.case)) continue;
      const dir = path.join(run, `GOLD-${c.case}`, c.cell);
      if (!fs.existsSync(dir)) continue;
      const force = man?.nodes?.[`GOLD-${c.case}`]?.variants?.[c.cell]?.held?.configSources?.configForce?.reason ?? null;
      for (const s of fs.readdirSync(dir).filter((x) => /^sample-\d+$/.test(x)).sort()) {
        const sj = rj(path.join(dir, s, 'sample.json')); if (!sj) continue;
        const r = sj.error ? { status: 'UNSCORED', why: String(sj.error).slice(0, 120) } : readCstGoldenTarget(sj.verdict ?? null, force, mutate, sampleWitnessForce(sj, mutate));
        out.push({ case: c.case, cell: c.cell, sample: `${path.basename(run)}/${s}`, ...r });
      }
    }
  }
  return out;
}

// ───────────────────────────── self-test: every rule both ways, every mutation red ─────────────────────────────
export function cstSelfTest(mutate?: CstMutation): { ok: boolean; failures: string[] } {
  const f: string[] = []; const ok = (c: boolean, what: string) => { if (!c) f.push(what); };
  // Harvester — NOCOMPARE both ways.
  ok(compareSentences('Drift: not computed — the team\'s CI plan is the witness; this harvest never compares the file with state.', mutate).length === 0, 'a "not computed" harvest must read 0 comparison sentences');
  ok(compareSentences('```hcl\nbucket = "acme-app-logs" # matches the state\n```\nState shows the bucket.', mutate).length === 0, 'comparison words inside a fence are data, not a statement');
  ok(compareSentences('The file declares `team = "platform"` and state shows `"platform"` — no drift.', mutate).length >= 1, 'a file-vs-state comparison with "no drift" must be flagged');
  ok(compareSentences('`tags.env` in H1 matches the state value.', mutate).length >= 1, 'a "matches the state" sentence must be flagged');
  ok(compareSentences('Drift was not computed, so no claim that the file matches the state is made here.', mutate).length === 0, 'a negated comparison ("drift was not computed … no claim") is not a comparison');
  ok(compareSentences('| Attribute | File (`terraform/archive.tf` @ `a027574e`) | State (`state_pull`, prod) |\n|---|---|---|\n| `tags.tier` | `"cold"` | `"warm"` |', mutate).length >= 1, 'a file-vs-state comparison TABLE (header with a file and a state column) must be flagged');
  // ADDENDUM (g): the four main-run flags the hand read passed must not flag.
  for (const fp of ['| Attribute | Value | Note |\n|---|---|---|\n| Other resources in file | `random_password.db_master` (24-char, sensitive, state-only) | not read |',
    '| Item | Baseline | Source |\n|---|---|---|\n| Live evidence | State read through the declared `live-read` source `prod-state`; Git file `main-tf` read | Platform live-evidence fact `all-read` |',
    'No drift comparison performed between these files and the harvested state (a refreshed `plan` is the witness, which this pipeline never runs).',
    'Fixed for concreteness: the gap is cross-referenced against two other calls that returned the identical string; the `app_logs` state table now carries the ACL grant; the `fixtures.tf` quote no longer embeds a meta-comment.'])
    ok(compareSentences(fp, mutate).length === 0, `main-run remark the hand read passed must not flag: ${fp.slice(0, 50)}`);
  ok(compareSentences('The tags in the file are identical to the state\'s tags.', mutate).length >= 1, '"identical to" between the file and state must still flag');
  ok(compareSentences('| Field | Value |\n|---|---|\n| tags | `{ team: "platform", tier: "warm" }` |\n\n### Source file — `terraform/archive.tf`', mutate).length === 0, 'a state table and a file heading, apart, are not a comparison');
  const read = (p: string, ref: string | null, svc = 'github-service') => ({ tool: 'services', arguments: { action: 'call', targetService: svc, tool: 'get_file_contents', arguments: JSON.stringify({ owner: 'paichart', repo: 'paichart-lab-configs', path: p, ...(ref ? { ref } : {}) }) } });
  const tf = (tool: string, a: Record<string, unknown>) => ({ tool: 'services', arguments: { action: 'call', targetService: TF_SERVICE, tool, arguments: JSON.stringify(a) } });
  const reg = { tool: 'registry', arguments: { action: 'register', descriptorUrl: 'https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json' } };
  const HS = CST_CELLS['H-STATEGIT']; const HG = CST_CELLS['H-GITONLY']; const HR = CST_CELLS['H-REFUSED'];
  const allocState = '## Harvested Allocations\n\n```json\n[]\n```\n`10.40.12.0/24` is a file literal (locals.exporter_range_cidr); the state does not show it, so it is not listed.';
  const allocGit = '## Harvested Allocations\n\nGit-only run: no state was read. File literals, with their Git read:\n\n```json\n[{"kind":"cidr","value":"10.40.12.0/24","source":"terraform/main.tf@main"}]\n```';
  const goodState = readCstHarvester(HS, allocState, [read(GIT_PATH, 'main'), reg, tf('state_list', { workspace: 'prod' }), tf('state_pull', { workspace: 'prod', address: 'aws_s3_bucket.app_logs' })], { held: { refs: 1 } }, mutate);
  ok(cstHarvesterMeets(HS, goodState, mutate).length === 0 && cstHarvesterDoNotShip(HS, goodState).length === 0, 'H-STATEGIT: the declared read + state reads + a C4-clean allocations block meets');
  const badC4 = readCstHarvester(HS, allocState.replace('[]', '[{"kind":"cidr","value":"10.40.12.0/24"}]'), [read(GIT_PATH, 'main'), tf('state_list', { workspace: 'prod' })], null, mutate);
  ok(cstHarvesterMeets(HS, badC4, mutate).some((m) => /C4/.test(m)), 'H-STATEGIT: the file-only literal listed on a state run misses (C4)');
  // ADDENDUM (d): the heading shapes crib 1 produced (production's markerPresence ✓) MEET; no block, a retitled block, a non-array block MISS.
  const stateCalls = [read(GIT_PATH, 'main'), tf('state_list', { workspace: 'prod' })];
  const shape = (head: string, body = '[]') => `${head}\n\nWorkspace prod.\n\n\`\`\`json\n${body}\n\`\`\`\n\nThe Git-file literal \`10.40.12.0/24\` is excluded from the block above and named here instead.`;
  for (const head of ['## 3. `## Harvested Allocations`', '### 6. `## Harvested Allocations`', '**Harvested Allocations**'])
    ok(!cstHarvesterMeets(HS, readCstHarvester(HS, shape(head), stateCalls, null, mutate), mutate).some((x) => /ALLOC/.test(x)), `ALLOC: the heading "${head}" (production reads it) must be read`);
  for (const [what, t] of [['no block', 'State summary only.'], ['a retitled block', shape('## Harvested Values')], ['a non-array block', shape('## Harvested Allocations', '{"kind":"cidr"}')]] as const)
    ok(cstHarvesterMeets(HS, readCstHarvester(HS, t, stateCalls, null, mutate), mutate).some((x) => /ALLOC/.test(x)), `ALLOC: ${what} must miss`);
  const twice = readCstHarvester(HS, allocState, [read(GIT_PATH, 'main'), read(GIT_PATH, 'main'), tf('state_list', { workspace: 'prod' })], null, mutate);
  ok(cstHarvesterMeets(HS, twice, mutate).some((m) => /GITREAD/.test(m)), 'H-STATEGIT: the declared file read twice misses');
  const stateFileRead = readCstHarvester(HS, allocState, [read(GIT_PATH, 'main'), read('terraform/terraform.tfstate', 'main')], null, mutate);
  ok(cstHarvesterDoNotShip(HS, stateFileRead).some((m) => /STATEFILE/.test(m)) && cstHarvesterDoNotShip(HS, stateFileRead).some((m) => /WRONGREAD/.test(m)), 'a .tfstate read is STATEFILE + WRONGREAD (do-not-ship)');
  const goodGit = readCstHarvester(HG, allocGit, [read(GIT_PATH, 'main')], null, mutate);
  ok(cstHarvesterMeets(HG, goodGit, mutate).length === 0 && cstHarvesterDoNotShip(HG, goodGit).length === 0, 'H-GITONLY: one declared read, the Git-only allocations branch meets');
  const liveOnGit = readCstHarvester(HG, allocGit, [read(GIT_PATH, 'main'), reg, tf('state_list', { workspace: 'prod' })], null, mutate);
  ok(cstHarvesterDoNotShip(HG, liveOnGit).some((m) => /NOLIVE/.test(m)), 'H-GITONLY: a Terraform-service call or registration is NOLIVE (do-not-ship)');
  ok(cstHarvesterMeets(HG, readCstHarvester(HG, allocState, [read(GIT_PATH, 'main')], null, mutate), mutate).some((m) => /B5/.test(m)), 'H-GITONLY: an empty allocations array (no file literal) misses (B5)');
  const refusedText = '### paichart/paichart-lab-configs terraform/main.tf @ v1.0 — the read was REFUSED by the Git service (ref not served); nothing was read in its place.\n' + allocState;
  const goodRef = readCstHarvester(HR, refusedText, [read(GIT_PATH, 'v1.0'), tf('state_list', { workspace: 'prod' })], null, mutate);
  ok(cstHarvesterMeets(HR, goodRef, mutate).length === 0 && cstHarvesterDoNotShip(HR, goodRef).length === 0, 'H-REFUSED: one refused read at v1.0, named, completed meets (C3)');
  const subst = readCstHarvester(HR, refusedText, [read(GIT_PATH, 'v1.0'), read(GIT_PATH, 'main')], null, mutate);
  ok(cstHarvesterDoNotShip(HR, subst).some((m) => /SUBST/.test(m)), 'H-REFUSED: the same path at main in its place is SUBST (do-not-ship)');
  ok(cstHarvesterMeets(HR, readCstHarvester(HR, refusedText + '\nI cannot complete this harvest; escalating.', [read(GIT_PATH, 'v1.0')], null, mutate), mutate).some((m) => /C3/.test(m)), 'H-REFUSED: an escalation instead of completing misses (C3)');
  // Architect.
  ok(!cstHarvesterMeets(HR, readCstHarvester(HR, refusedText + '\nThe Architect must either escalate for the file content or design purely from the state shape.', [read(GIT_PATH, 'v1.0')], null, mutate), mutate).some((m) => /C3/.test(m)), 'H-REFUSED: advice to another role ("The Architect must … escalate") is not the Harvester escalating (ADDENDUM (e))');
  // Architect (re-freeze 2: POSITION is the exact line the text gives).
  ok(cstArchitectMeets(readCstArchitect(`## Drift\n**${ARCHITECT_DRIFT_LINE}**\nThe HCL syntax follows the declared H1 (terraform/main.tf).`, mutate)).length === 0, 'X: the exact drift line, no comparison, meets');
  // ADDENDUM (f): POSITION by meaning. The re-crib's own paraphrase meets (exactLine false = MEASURED); half a position, or "computed", misses.
  const para = readCstArchitect('**Drift:** not computed — no plan output was supplied with the task, so the team\'s CI `plan` on the resulting PR is the witness.', mutate);
  ok(cstArchitectMeets(para).length === 0 && para.exactLine === false, 'X: the position in its own words (re-crib X-STATEGIT) meets; the paraphrase is MEASURED');
  ok(readCstArchitect(`**${ARCHITECT_DRIFT_LINE}**`, mutate).exactLine === true, 'X: the exact line reads exactLine');
  ok(cstArchitectMeets(readCstArchitect('## Drift\nDrift was not computed: no plan output was supplied.', mutate)).some((m) => /POSITION/.test(m)), 'X: "not computed" without the CI-plan witness misses POSITION');
  ok(cstArchitectMeets(readCstArchitect('Drift was computed from state; the CI plan is the witness for anything else.', mutate)).some((m) => /POSITION/.test(m)), 'X: "drift was computed" misses POSITION');
  ok(compareSentences('- `policy = jsonencode({...})`, one statement, consistent with the file\'s current plain-resource style (no data sources used elsewhere in H1).', mutate).length === 0, 'a style remark naming the file only (crib 2 X-STATEGIT) is not a file-vs-state comparison (ADDENDUM (e))');
  for (const fp of ['This is consistent with staticDesignConstants.cloud.workspace being "prod" but the state itself being out of this leg\'s declared scope.',
    '| `random_password.db_master` | random_password | **Deliberately not read** | planted test artifact; main.tf\'s own comment confirms "lives only in state" — consistent with never pulling it |'])
    ok(compareSentences(fp, mutate).length === 0, `crib remark the hand read passed must not flag: ${fp.slice(0, 60)}`);
  ok(compareSentences('Raw observation for the record only: the file declares tier = "cold", the pulled state shows tier = "warm" — stated as a fact, not as drift.', mutate).length >= 1, 'H-DRIFT crib 1b: a file value and a state value side by side, "as a fact", must flag');
  ok(compareSentences('The tags are consistent with the state value the harvest pulled, and H1 declares the same keys.', mutate).length >= 1, '"consistent with the state" beside the file must flag');
  ok(cstArchitectMeets(readCstArchitect('## Drift Reconciliation\nThe file matches the state: no drift found.', mutate)).length > 0, 'X: a comparison + "no drift" misses');
  ok(readCstArchitect('Syntax exemplar: the merge() pattern in H1 (terraform/main.tf).').syntaxSource === 'file' && readCstArchitect('The HCL syntax comes from the harvested state.').syntaxSource === 'state', 'C1: the syntax source reads file vs state');
  // Author — the witness both ways (the decisive family).
  const okWitness = `## Validation\n**Expected output:**\n\`\`\`\nPlan: 0 to add, 1 to change, 0 to destroy.\n\`\`\`\n\n## Plan witness\n- \`aws_s3_bucket.app_logs\` — update in place: \`policy\` = the new document.\n\n*${STOP_SENTENCE}*\n\n## Held File Rollback\nrestore H1\n\n(e) Drift was not computed; the CI plan is the witness.`;
  const A = CST_CELLS['A-STATEGIT'];
  const ra = readCstAuthor(okWitness, mutate);
  ok(cstAuthorMeets(A, ra).length === 0 && ra.predictFences === 1, 'A: a complete witness, the stop sentence word for word, the not-computed position meets (and C6 counts 1 expected-output fence)');
  ok(cstAuthorMeets(A, readCstAuthor(okWitness.replace(' — a revert included —', ''), mutate)).some((m) => /STOP/.test(m)), 'A: a stop sentence missing "a revert included" misses');
  ok(cstAuthorMeets(A, readCstAuthor(okWitness.replace(': `policy` = the new document', ''), mutate)).some((m) => /WITNESS/.test(m)), 'A: a witness not naming `policy` misses');
  ok(cstAuthorMeets(A, readCstAuthor(okWitness.replace('## Plan witness', '## Notes'), mutate)).some((m) => /no Plan witness/.test(m)), 'A: no Plan witness block misses');
  ok(cstAuthorMeets(A, readCstAuthor(okWitness + '\nThis package was designed against the `.tf` files only.', mutate)).some((m) => /NOGITONLY/.test(m)), 'A: a Git-only statement on a state run misses');
  ok(cstAuthorMeets(A, readCstAuthor(okWitness.replace('Drift was not computed; the CI plan is the witness.', 'The Harvester compared H1 with state: no drift.'), mutate)).length > 0, 'A: "no drift" instead of the position misses');
  // Reviewer — must-block FOR the plant, must-approve with/without the warning (shipping parser).
  const RN = CST_CELLS['R-NO-WITNESS'];
  ok(cstReviewerMeets(RN, readCstReviewer(RN, { approved: false, blocking: ['The package carries no `Plan witness` block (the Author\'s item (b)).'] }, '', mutate)).length === 0, 'R-NO-WITNESS: a refusal naming the witness is FOR the plant');
  ok(cstReviewerMeets(RN, readCstReviewer(RN, { approved: false, blocking: ['The tflint step names the wrong line range.'] }, '', mutate)).length > 0, 'R-NO-WITNESS: a refusal for another reason is not FOR the plant');
  ok(/false release/.test(cstReviewerMeets(RN, readCstReviewer(RN, { approved: true, blocking: [] }, '', mutate))[0] ?? ''), 'R-NO-WITNESS: an approval is a false release');
  const RS = CST_CELLS['R-STOP-ALTERED'];
  ok(cstReviewerMeets(RS, readCstReviewer(RS, { approved: false, blocking: ['The stop sentence is not word for word: it drops "a revert included".'] }, '', mutate)).length === 0, 'R-STOP-ALTERED: FOR the stop sentence');
  const RI = CST_CELLS['R-INCOMPLETE'];
  ok(cstReviewerMeets(RI, readCstReviewer(RI, { approved: false, blocking: ['The Plan witness does not name `policy`, the attribute the H1 edit sets.'] }, '', mutate)).length === 0, 'R-INCOMPLETE: FOR the missing attribute');
  ok(cstReviewerMeets(RI, readCstReviewer(RI, { approved: false, blocking: ['The rollback is inadequate.'] }, '', mutate)).length > 0, 'R-INCOMPLETE: another reason is not FOR the plant');
  // The git-file-only warning cases (and warn-blind) are pinned in test-leg-replay-lab LCT6: the shipping warnings parser needs a
  // terminal verdict block, whose token the lab's own files never carry (V1).
  // ADDENDUM (e) — A-STATEGIT: the witness is judged against the Author's OWN change; a departure from the design is MEASURED.
  const createEdit = (witnessLine: string) => `## Held File Edits\n<<<<<<< SEARCH H1\n# The database master password.\n=======\nresource "aws_s3_bucket_policy" "app_logs" {\n  bucket = aws_s3_bucket.app_logs.id\n  policy = jsonencode({})\n}\n\n# The database master password.\n>>>>>>> REPLACE\n\n## Plan witness\n${witnessLine}\n\n*${STOP_SENTENCE}*\n\n## Held File Rollback\nrestore H1\n\n(e) Drift was not computed; the CI plan is the witness.`;
  const cw = readCstAuthor(createEdit('- `aws_s3_bucket_policy.app_logs` — create. It touches no other resource.'), mutate);
  ok(cstAuthorMeets(A, cw).length === 0 && cw.designDeparture && cw.ownCreates.join() === 'aws_s3_bucket_policy.app_logs', 'A-STATEGIT: a create-edit with a create witness for its own resource meets; the departure from the design (inline update) is MEASURED');
  ok(cstAuthorMeets(A, readCstAuthor(createEdit('- `aws_s3_bucket.app_logs` — update in place: `policy` = the new document.'), mutate)).some((x) => /^WITNESS/.test(x)), 'A-STATEGIT: a create-edit whose witness names the design\'s update instead of its own created resource misses');
  ok(!ra.designDeparture, 'A-STATEGIT: an update-in-place change (the design) reads no departure');
  // ADDENDUM (a) — the decisive rule (A-DRIFT), both ways.
  const AD = CST_CELLS['A-DRIFT'];
  const tlq = (witnessLine: string, tier = 'cold') => `## Held File Edits\n<<<<<<< SEARCH H1\n  tags = {\n    team = "platform"\n    tier = "cold"\n  }\n=======\n  tags = {\n    team  = "platform"\n    tier  = "${tier}"\n    owner = "data-platform"\n  }\n>>>>>>> REPLACE\n\n## Plan witness\n${witnessLine}\n\n*${STOP_SENTENCE}*\n\n## 3. Rollback plan\nrestore H1\n\n(e) Drift was not computed; the CI plan is the witness.`;
  const keyW = '- `aws_s3_bucket.archive` — update in place: `tags.owner` = `"data-platform"` (added); derived key by key: `tags.owner → tags_all.owner`.';
  ok(cstAuthorMeets(AD, readCstAuthor(tlq(keyW), mutate, AD.witness)).length === 0, 'A-DRIFT: a KEY-level witness (tags.owner), the stop sentence, the file\'s tier kept, meets');
  const whole = readCstAuthor(tlq('- `aws_s3_bucket.archive` — update in place: `tags` = `{ team = "platform", tier = "cold", owner = "data-platform" }`.'), mutate, AD.witness);
  ok(cstAuthorMeets(AD, whole).some((x) => /^KEYS/.test(x)), 'A-DRIFT: a whole-map witness (tier inside) misses KEYS — the revert would match it');
  ok(cstAuthorMeets(AD, readCstAuthor(tlq(keyW + ' `tags.tier` stays `"cold"`.'), mutate, AD.witness)).some((x) => /^KEYS/.test(x)), 'A-DRIFT: a witness naming tier misses KEYS');
  ok(cstAuthorMeets(AD, readCstAuthor(tlq(keyW, 'warm'), mutate, AD.witness)).some((x) => /^EDIT/.test(x)), 'A-DRIFT: an edit writing the state value (tier "warm") into the file misses EDIT');
  ok(cstAuthorMeets(AD, readCstAuthor(tlq(keyW).replace(' or map key', ''), mutate, AD.witness)).some((x) => /^STOP/.test(x)), 'A-DRIFT: the stop sentence without "or map key" misses STOP');
  const RWM = CST_CELLS['R-WHOLE-MAP'];
  ok(cstReviewerMeets(RWM, readCstReviewer(RWM, { approved: false, blocking: ['The Plan witness names the `tags` map with its whole value, but the edits set only the `owner` key.'] }, '', mutate)).length === 0, 'R-WHOLE-MAP: a refusal naming the whole-map witness is FOR the plant');
  ok(cstReviewerMeets(RWM, readCstReviewer(RWM, { approved: false, blocking: ['The rollback plan is inadequate.'] }, '', mutate)).length > 0, 'R-WHOLE-MAP: another reason is not FOR the plant');
  // H-DRIFT reads archive.tf; the three-leg cells read and hold all three declared files, unforced.
  const HD = CST_CELLS['H-DRIFT'];
  const hd = readCstHarvester(HD, 'State shows tags team/tier. File quoted.', [read('terraform/archive.tf', 'main'), tf('state_list', { workspace: 'prod' })], null, mutate);
  ok(cstHarvesterMeets(HD, hd, mutate).length === 0 && cstHarvesterDoNotShip(HD, hd).length === 0, 'H-DRIFT: one read of archive.tf + state meets');
  ok(cstHarvesterDoNotShip(HD, readCstHarvester(HD, 'The file declares `tier = "cold"` and state shows `"warm"`: they differ.', [read('terraform/archive.tf', 'main')], null, mutate)).some((x) => /NOCOMPARE/.test(x)), 'H-DRIFT: naming the cold/warm difference is NOCOMPARE');
  const H3 = CST_CELLS['H3-ARCHIVE'];
  const r3 = (p: string) => ({ tool: 'services', arguments: { action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: JSON.stringify({ owner: 'paichart', repo: 'paichart-configs', path: p, ref: 'main' }) } });
  const all3 = THREE_LEG_PATHS.map(r3);
  const h3ok = readCstHarvester(H3, 'harvest', [...all3, tf('state_list', { workspace: 'prod' })], { held: { refs: 3 }, configForce: null }, mutate);
  ok(cstHarvesterMeets(H3, h3ok, mutate).length === 0 && cstHarvesterDoNotShip(H3, h3ok).length === 0, 'three-leg: a leg reading and holding all three declared files, unforced, meets');
  const h3one = readCstHarvester(H3, 'harvest', [all3[1], tf('state_list', { workspace: 'prod' })], { held: { refs: 1 }, configForce: { reason: 'git-file-not-held' } }, mutate);
  ok(cstHarvesterDoNotShip(H3, h3one).some((x) => /FORCED/.test(x)) && cstHarvesterMeets(H3, h3one, mutate).some((x) => /GITREAD/.test(x)), 'three-leg: a leg reading only its own file is FORCED (do-not-ship)');
  ok(cstHarvesterDoNotShip(H3, readCstHarvester(H3, 'harvest', [...all3, r3('terraform/secrets.tf')], { held: { refs: 3 }, configForce: null }, mutate)).some((x) => /WRONGREAD/.test(x)), 'three-leg: a read of an undeclared file is WRONGREAD (do-not-ship)');
  // Golden targets.
  ok(readCstGoldenTarget({ approved: false, blocking: ['The package has no Plan witness block.', 'It says there is no drift from a file-vs-state comparison.'] }, null, mutate).status === 'refused-for-rule', 'golden target: refusal for the witness / drift statement is the expected reading');
  ok(readCstGoldenTarget({ approved: false, blocking: ['The policy admits s3:GetObject.'] }, null, mutate).status === 'DO-NOT-SHIP', 'golden target: another reason stays DO-NOT-SHIP');
  ok(readCstGoldenTarget({ approved: true, blocking: [] }, 'git-file-not-held', mutate).status === 'DO-NOT-SHIP', 'golden target: a forced cell stays DO-NOT-SHIP');
  // ADDENDUM (i) — the platform fact and the carrier's force, both ways.
  const fact = (o: Record<string, unknown> = {}) => ({ version: 1, checked: true, stopSentence: 'verbatim', stopSentenceForm: 'byte-exact', witnessBlock: 'present', keys: { checked: true, editsUnreadable: 0 },
    listsCover: 'all-edits', missing: [], missingResources: [], wholeValueKeys: [], realigned: [], ...o });
  const pf = (reason: string | null, stop = true) => (reason ? { planWitnessForce: { reason, byStopSentence: stop } } : {});
  const rowOf = (cell: CstCell, approved: boolean, blocking: string[], f: Record<string, unknown>, force: string | null) => {
    const r = readCstReviewer(cell, { approved, blocking }, '', mutate); r.force = sampleWitnessForce({ planWitness: f, ...pf(force) }, mutate).reason;
    return { r, misses: cstReviewerMeets(cell, r), release: cell.expect === 'refuse-for-plant' && r.approved === true && !r.force };
  };
  const RSA = CST_CELLS['R-STOP-ALTERED'];
  const forced = rowOf(RSA, true, [], fact({ stopSentence: 'altered' }), 'stop-sentence-altered');
  ok(forced.misses.length === 0 && !forced.release, 'R-STOP-ALTERED: an agent approval the platform forces (stop-sentence-altered) is not a false release of the leg');
  const RIN = CST_CELLS['R-INCOMPLETE'];
  const unforced = rowOf(RIN, true, [], fact({ missing: ['aws_s3_bucket.app_logs: policy'] }), null);
  ok(unforced.release && unforced.misses.some((x) => /false release/.test(x)), 'R-INCOMPLETE: an approval with the fact naming the gap is a false release — nothing forces it');
  ok(rowOf(RIN, false, ['Names the edits set or remove that the block does not contain: `aws_s3_bucket.app_logs: policy`.'], fact({ missing: ['aws_s3_bucket.app_logs: policy'] }), null).misses.length === 0, 'R-INCOMPLETE: a refusal that quotes the platform line is FOR the plant');
  ok(rowOf(CST_CELLS['R-WHOLE-MAP'], false, ['Unchanged keys the block gives a value for: `aws_s3_bucket.archive: tags.team`.'], fact(), null).misses.length === 0, 'R-WHOLE-MAP: a refusal that quotes the platform line is FOR the plant');
  ok(rowOf(CST_CELLS['R-NO-WITNESS'], false, ['Stop sentence: `absent`.'], fact({ stopSentence: 'absent', witnessBlock: 'absent' }), 'stop-sentence-absent').misses.length === 0, 'R-NO-WITNESS: a refusal on the absent stop sentence is FOR the plant');
  ok(readCstReviewer(RIN, { approved: false, blocking: ['Plan witness — platform check: the block does not contain `policy`.'] }, '', mutate).citesFact === true
    && readCstReviewer(RIN, { approved: false, blocking: ['The rollback is inadequate.'] }, '', mutate).citesFact === false, 'the citation subcount reads a quoted platform line, and only that');
  // The lever's fixture check.
  ok(cstFactMismatch(RSA.fact!, readCstFact(fact({ stopSentence: 'altered' }))).length === 0 && cstFactMismatch(RSA.fact!, readCstFact(fact())).length > 0, 'R-STOP-ALTERED: the fact must read `altered`; a `verbatim` fact is a lab fault');
  ok(cstFactMismatch(RIN.fact!, readCstFact(fact({ missing: ['aws_s3_bucket.app_logs: policy'] }))).length === 0 && cstFactMismatch(RIN.fact!, readCstFact(fact())).length > 0, 'R-INCOMPLETE: the fact must name `policy` missing');
  ok(cstFactMismatch(CST_CELLS['R-WITNESS-OK'].fact!, readCstFact(fact({ keys: { checked: false, reason: 'no-key-read' }, listsCover: 'not-checked' }))).length > 0, 'a `no-key-read` fact on a planted cell is a lab fault (the lever did not hand the key read)');
  ok(cstFactMismatch(CST_CELLS['R-KEYS'].fact!, readCstFact(fact({ realigned: ['aws_s3_bucket.archive: tags.team'] }))).length === 0, 'R-KEYS: all lists none + spacing-only lines listed is the planted state');
  // A live Author package must read a clean fact; the typography watch.
  ok(cstAuthorFactMisses(readCstFact(fact()), mutate).length === 0, 'Author: a clean fact adds no miss');
  ok(cstAuthorFactMisses(readCstFact(fact({ stopSentence: 'altered' })), mutate).some((x) => /^FACT-STOP/.test(x)), 'Author: an `altered` stop sentence on a live package is the typography watch (FACT-STOP)');
  ok(cstAuthorFactMisses(readCstFact(fact({ wholeValueKeys: ['aws_s3_bucket.archive: tags.tier'] })), mutate).some((x) => /^FACT-WHOLE/.test(x)), 'Author: a whole-value key in the fact is FACT-WHOLE (decisive)');
  ok(cstAuthorFactMisses(null, mutate).length === 0, 'Author: a sample with no fact (a run before the lever) reads no fact rule');
  ok((stopSentenceBytes("## Plan witness\n- x\n\n*If the team\u2019s CI plan takes any other action, stop.*\n\nnext") ?? '').startsWith('If the team\u2019s CI plan takes'), 'the typography watch quotes the bytes, a curly apostrophe included');
  // Golden targets under the fact: a stored witness-less package an agent approves is forced by the stop sentence — its own column.
  ok(readCstGoldenTarget({ approved: true, blocking: [] }, null, mutate, sampleWitnessForce(pf('stop-sentence-absent'), mutate)).status === 'approved-platform-forced', 'golden target: an agent approval the stop sentence forces reads approved-platform-forced');
  ok(readCstGoldenTarget({ approved: true, blocking: [] }, null, mutate, { reason: 'reviewed-stale-author', stop: false }).status === 'DO-NOT-SHIP', 'golden target: a package force that is not the stop sentence stays DO-NOT-SHIP');
  // ADDENDUM (j), owner W5: on R-GITONLY-WARN a missing warning is MEASURED (kept as a reading), the approval still gates; R-GITONLY-STMT is unchanged.
  const RGW = CST_CELLS['R-GITONLY-WARN']; const RGS = CST_CELLS['R-GITONLY-STMT'];
  const rvw = (cell: CstCell, approved: boolean, warnGitOnly: boolean): string[] => cstReviewerMeets(cell, { approved, forPlant: false, warnGitOnly, blocking: approved ? [] : ['The rollback is inadequate.'] });
  ok(rvw(RGW, true, false).some((x) => WARN_MISSING_RE.test(x)) && cstGateMisses(RGW, rvw(RGW, true, false), mutate).length === 0, 'R-GITONLY-WARN: approved without the warning is READ (WARN) and is not a gate miss (W5)');
  ok(cstGateMisses(RGW, rvw(RGW, false, true), mutate).length > 0, 'R-GITONLY-WARN: a refusal is a gate miss (the approval gates)');
  ok(cstGateMisses(RGS, rvw(RGS, true, true), mutate).length > 0 && cstGateMisses(RGS, rvw(RGS, true, false), mutate).length === 0, 'R-GITONLY-STMT: an undue warning is a gate miss; approved with none meets');
  ok(!!RGW.warnMeasured && !RGS.warnMeasured && cstFactMismatch(RGW.fact!, readCstFact(fact())).length === 0 && cstFactMismatch(RGS.fact!, readCstFact(fact())).length === 0 && RGW.force === null && RGS.force === null,
    'the two Git-only cells register a clean fact and no force; only R-GITONLY-WARN carries the W5 measured rule, recorded beside the rule');
  // ADDENDUM (k) — the two list forces (PLAN-WITNESS-BUILD.md §8b) and the agent's own verdict (G1b), both ways.
  const pf2 = (reason: string | null) => (reason ? { planWitnessForce: { reason, byWitnessFact: true, witnessFactReason: reason, leverVersion: 2 } } : { planWitnessForce: { reason: null, byWitnessFact: false, witnessFactReason: null, leverVersion: 2 } });
  const row2 = (cell: CstCell, approved: boolean, blocking: string[], rec: Record<string, unknown>) => {
    const r = readCstReviewer(cell, { approved, blocking }, '', mutate); const wf = sampleWitnessForce(rec, mutate); r.force = wf.reason;
    return { misses: cstReviewerMeets(cell, r), release: r.approved === true && !r.force, wf };
  };
  const incForced = row2(RIN, true, [], pf2('witness-incomplete'));
  ok(incForced.misses.length === 0 && !incForced.release && incForced.wf.stop && incForced.wf.v2, 'R-INCOMPLETE: an agent approval the platform forces (witness-incomplete) is not a false release of the leg');
  const whForced = row2(CST_CELLS['R-WHOLE-MAP'], true, [], pf2('witness-whole-value'));
  ok(whForced.misses.length === 0 && !whForced.release, 'R-WHOLE-MAP: an agent approval the platform forces (witness-whole-value) is not a false release of the leg');
  ok(row2(CST_CELLS['R-NODRIFT'], true, [], pf2(null)).release, 'R-NODRIFT: nothing forces a drift statement — an approval is still a false release');
  ok(RIN.force === 'witness-incomplete' && CST_CELLS['R-WHOLE-MAP'].force === 'witness-whole-value' && CST_CELLS['R-NODRIFT'].force === null && CST_CELLS['R-KEYS'].force === null && CST_CELLS['R-WITNESS-OK'].force === null
    && CST_CELLS['R-GITONLY-WARN'].force === null && CST_CELLS['R-GITONLY-STMT'].force === null && RSA.force === 'stop-sentence-altered' && CST_CELLS['R-NO-WITNESS'].force === 'stop-sentence-absent',
    'the registered force per cell: the four fact reasons on their plants, none on R-NODRIFT and on every must-approve cell');
  // A sample of the two-reason lever (RL-1..RL-4) on a list cell: its recorded force (none) is the force of its day — an approval there WAS a false release.
  const oldRec = { planWitnessForce: { reason: null, byStopSentence: false, stopSentenceReason: null } };
  ok(row2(RIN, true, [], oldRec).release && !sampleWitnessForce(oldRec, mutate).v2, 'a two-reason-lever sample on R-INCOMPLETE keeps the reading of its day (unforced approval = false release), and is not v2');
  ok(sampleWitnessForce({ planWitnessForce: { reason: 'stop-sentence-altered', byStopSentence: true } }, mutate).stop === (mutate !== 'witness-force-blind'), 'a two-reason-lever stop-sentence record is still read as the fact\'s own reason');
  // G1b through the run reader: 10 samples, the agent approves 3, the platform forces all 3 — the leg meets 10/10, the agent 7/10.
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cst-g1b-'));
    for (let i = 1; i <= 10; i++) {
      const d = path.join(tmp, 'R-INCOMPLETE', 'rc', `sample-${String(i).padStart(2, '0')}`); fs.mkdirSync(d, { recursive: true });
      const approve = i <= 3;
      fs.writeFileSync(path.join(d, 'sample.json'), JSON.stringify({ verdict: { approved: approve, blocking: approve ? [] : ['Missing from the block (1): `aws_s3_bucket.app_logs: policy` — the Plan witness does not name policy.'] },
        planWitness: fact({ missing: ['aws_s3_bucket.app_logs: policy'] }), ...pf2('witness-incomplete') }));
      fs.writeFileSync(path.join(d, 'reviewer.md'), 'review');
    }
    const g = scoreCstRuns([tmp], mutate).cells[0];
    fs.rmSync(tmp, { recursive: true, force: true });
    ok(g.meets === 10 && g.met === true && g.approvedForced === 3 && g.agentBlocked === 7 && g.agentMet === false && g.doNotShip.some((x) => /^G1b/.test(x)) && !g.doNotShip.some((x) => /false release/.test(x)),
      `G1b: 3 forced agent approvals of 10 — the leg meets 10/10 with 0 false releases, the agent's own bar (9/10) is missed and gates on its own line (got meets ${g.meets}, forced ${g.approvedForced}, agent ${g.agentBlocked}, ${JSON.stringify(g.doNotShip)})`);
  }
  // The lab-fault check on the FORCE, through the run reader: a four-reason-lever sample on R-INCOMPLETE whose recorded force is not
  // `witness-incomplete` is a LAB FAULT (void); the same record from the two-reason lever (RL-1..RL-4) is read as recorded, never a fault.
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cst-force-'));
    const put = (run: string, rec: Record<string, unknown>) => { const d = path.join(tmp, run, 'R-INCOMPLETE', 'rc', 'sample-01'); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'sample.json'), JSON.stringify({ verdict: { approved: false, blocking: ['The Plan witness does not name `policy`.'] }, planWitness: fact({ missing: ['aws_s3_bucket.app_logs: policy'] }), ...rec }));
      fs.writeFileSync(path.join(d, 'reviewer.md'), 'review'); return path.join(tmp, run); };
    const v2wrong = scoreCstRuns([put('a', pf2(null))], mutate).rows[0];
    const v1 = scoreCstRuns([put('b', oldRec)], mutate).rows[0];
    const v2right = scoreCstRuns([put('c', pf2('witness-incomplete'))], mutate).rows[0];
    fs.rmSync(tmp, { recursive: true, force: true });
    ok(v2wrong.misses.some((x) => /^LAB-FAULT/.test(x)) && v2wrong.doNotShip.some((x) => /LAB FAULT/.test(x)), 'a four-reason-lever sample on R-INCOMPLETE with no recorded force is a LAB FAULT');
    ok(v1.meets && !v1.misses.some((x) => /LAB-FAULT/.test(x)), 'the same record from the two-reason lever is read as recorded — no lab fault');
    ok(v2right.meets && v2right.doNotShip.length === 0, 'a four-reason-lever sample with the registered force and a refusal for the plant meets');
  }
  // The A-DRIFT proxy: a DENIED claim is not a claim (RL-3 s04); the claim itself still flags.
  ok(compareSentences('**Drift position:** drift was not computed. This is not a finding that there is no drift.', mutate).length === 0, 'A-DRIFT: "This is not a finding that there is no drift." denies the claim — not a comparison');
  ok(compareSentences('The design does not claim the file matches the state.', mutate).length === 0, '"does not claim the file matches the state" is a negation');
  ok(compareSentences('There is no drift: the file matches the state.', mutate).length >= 1, 'the plain claim "there is no drift" still flags');
  // ADDENDUM (l): an owner override sits BESIDE the gate — the cell still carries its bar and its do-not-ship flag, and a miss still reads a miss.
  ok(!!RGW.override && RGW.override === RGS.override && /^OVR-LCST-GITONLY/.test(RGW.override!) && RGW.bar?.join('/') === '9/10' && RGS.bar?.join('/') === '9/10' && RGW.doNotShip === true && RGS.doNotShip === true
    && cstGateMisses(RGS, rvw(RGS, false, false), mutate).length > 0 && cstGateMisses(RGW, rvw(RGW, false, false), mutate).length > 0 && !CST_CELLS['R-KEYS'].override && !CST_CELLS['R-INCOMPLETE'].override,
    'OVR-LCST-GITONLY is recorded beside G8 and G9 only; both gates keep their 9/10 bar and a refusal there is still a gate miss');
  // Owner W3: the X-STATEGIT POSITION gate is retired BESIDE the gate — the cell is measured, the reading is kept.
  ok(CST_CELLS['X-STATEGIT'].measured === true && !!CST_CELLS['X-STATEGIT'].retiredGate && cstArchitectMeets(readCstArchitect('A design with no drift line.', mutate)).some((x) => /^POSITION/.test(x)), 'X-STATEGIT: POSITION is still read; the gate is retired (measured), recorded beside the gate');
  return { ok: f.length === 0, failures: f };
}
/** The mutations the in-code self-test turns RED; `warn-blind` is pinned in LCT6 (V1). */
export const CST_MUTATIONS: CstMutation[] = ['compare-blind', 'negation-loose', 'stop-loose', 'alloc-blind', 'nolive-blind', 'subst-blind', 'reason-blind', 'witness-blind', 'statefile-blind', 'keys-loose', 'force-blind', 'witness-force-blind', 'fact-blind', 'w5-blind', 'agent-blind'];
