/**
 * NO-REGRESSION GOLDEN SET (Protocol 16 § "The standing no-regression rule", owner decision 2026-10-31; register
 * NO-REGRESSION-GOLDEN-SET). A FROZEN set of real legs whose outcomes are known correct, replayed in EVERY agent-text or
 * model lab. It is fixed for all labs and never chosen per lab.
 *
 * The set lives in `golden/golden-set.json` (cases, provenance, expected outcomes) with today's production texts pinned
 * beside it (`golden/protocols/`, `golden/templates/`). A lab never edits it. The lab's arms are carried onto the golden
 * cases as a COMPANION experiment, generated here (`golden-build`) and run with the ordinary `run` command, so the
 * golden cells are built by the same prompt rebuild, held binding, nets and verdict parser as every other cell:
 *
 *   npm run lab:leg-replay -- golden-build --experiment <lab dir>          # writes <lab dir>/golden-v<N>/ ($0, deterministic)
 *   npm run lab:leg-replay -- run --experiment <lab dir>/golden-v<N> [--fake-llm persisted | --spend --max-usd <cap>]
 *   npm run lab:leg-replay -- golden-score --run <run dir>[,<run dir>] --experiment <lab dir>/golden-v<N>
 *   npm run lab:leg-replay -- golden-self-test                              # $0: the stored outcomes recompute from the stored stamps
 *   npm run lab:leg-replay -- golden-pin                                    # owner re-freeze only: re-pin today's texts (read-only)
 *
 * ONE COMPANION PER GIT PIN (v10, 2026-11-19). `golden-build` writes `<lab dir>/golden-v<N>/` for the cases that ran under the lab
 * scripts' Git pin and `<lab dir>/golden-v<N>-pin-<owner>-<repo>/` for each other pin a reached case declares (`gitFileSourcePin`).
 * Each companion carries `requireGitFileSourcePin` and runs in its OWN process under that pin (`GIT_FILE_SOURCE_PIN=<pin> npx ts-node
 * -r tsconfig-paths/register scripts/leg-replay-lab/lab.ts run …` — the npm script always sets the lab pin). `golden-score` takes the
 * run folders of all of them and ANY one companion folder; a companion with no run reads INCOMPLETE, never PASS. The pin check
 * itself is unchanged. See GOLDEN_DEFAULT_GIT_PIN below.
 * `golden-pin` re-pins EVERY protocol and template that moved in production. A re-freeze that is approved for one domain keeps only
 * that domain's move and names the others it left stale in `refreezes.pinsMoved` (v10 left kubernetes-gitops and requirements-authoring).
 *
 * WHICH CELLS RUN. For each candidate arm of the lab (an arm with any lever: protocol edits, template edits, a model or an
 * effort) and each golden case, the companion carries:
 *   - a REVIEWER cell (`g-<arm>-<domain>-r`): the persisted Author, the arm's Reviewer — when the arm's lever reaches the
 *     case's Reviewer prompt (its protocol edit applies to the case's protocol, its template edit to the case's Reviewer
 *     template, or it sets a Reviewer model/effort);
 *   - an AUTHOR cell (`g-<arm>-<domain>-a`): a live Author under the arm, then the Reviewer — when the lever reaches the
 *     case's Author prompt and the case is scored with a live Author (`authorForms` includes `live`).
 * A case the arm's lever does not reach runs today's production text unchanged; it is listed as UNREACHED (reproduced by
 * construction, $0) — the post-deploy canary (rule 3), not the lab, re-measures today's production.
 * VALUE LEGS (v2): a case with `shape: 'value'` (network-derivation) replays the persisted derivation_architect and the
 * derivation_reviewer that chained it, with no held binding. A Reviewer model lever reaches it (derivation_reviewer shares
 * change_reviewer's `infra` tier — fail-closed; opt it out with a reason when the lever is change_reviewer-only); an Author
 * model lever does not (`infraAuthor` is config_change_author only). It is scored on the persisted Author only: its leg
 * outcome is also decided by the derivation-containment net, which this scorer does not model for a live derivation.
 *
 * REQUIREMENTS LEGS (v7, owner 2026-11-09, REQ-GOLDEN-CASES): a case with `shape: 'requirements'` (requirements-authoring) replays the
 * persisted requirements_author and the requirements_reviewer that reviewed it, with no held binding and no carrier (its leg outcome is
 * the harness row's qualityGate). Persisted Author only: a live Requirements Author needs the whole owner-answer input set and its
 * correction turn reads the wall clock. A Reviewer model lever reaches it (fail-closed, as for value legs); an Author model lever does
 * not (`requirementsAuthor` is its own tier). `ownerRowItemMap` names the run's stored owner map, copied into the node so the lab's
 * in-run form-check control reads the map the run had (no prompt byte depends on it).
 *
 * RE-FREEZE (owner decision only): add a case when a program releases or a window passes, with a hand-read verdict and
 * provenance; record it in `refreezes` (what was added, what was left out and why, which pins moved) and bump `version`
 * whenever the case list or a pin changes — a lab declares the version it ran, and a companion built for an older version
 * is refused by golden-score.
 *
 * SCORING (golden-score). Per case and cell, each sample is read on two levels:
 *   - the LEG OUTCOME of record = the agent verdict AND the platform's held-edit carrier (held-edit-carrier.ts): a run-level
 *     reason (a pin refusal, a declared device without a held base) is an INPUT the lab holds fixed (the Harvester is not
 *     replayed), so it is carried from the stored stamp; a package-level reason is recomputed from the sample's own
 *     `editApplication` with the SHIPPING `heldEditVerdict`. The carrier is modelled only where the stored leg carries a
 *     `qualityGate.heldEdit` (it did not exist for pre-join legs).
 *   - the AGENT VERDICT (the Reviewer's `approved`).
 * Verdict per cell: REPRODUCED, or FLIPPED (approved → needs-revision, or needs-revision → approved) — one flip is
 * DO-NOT-SHIP unless the lab's pre-registration names the case as its target (`goldenSet.targets`). On a case whose
 * outcome a platform reason decides, an agent flip the platform masks is read asymmetrically (decided 2026-10-31, fail-closed):
 * a masked flip TOWARD approval is DO-NOT-SHIP (the agent-layer defence was lost; only the backstop held), a masked flip
 * toward refusal is recorded and read (the safe direction). A sample with no parseable verdict or an error is UNSCORED,
 * which blocks a PASS until it is re-run.
 *
 * NEEDS-READ (owner 2026-11-08, after NB1 L106/L107): a LIVE-Author cell of an approve-expected case whose Reviewer REFUSES (agent
 * refusal, no platform force) is not auto-read as a text flip when the refusal points at package content the STORED package does
 * not have. The test: some line of the live package that contains a span the blocking item quotes in backticks is absent from the
 * stored package, or the blocking quotes nothing. The live Author wrote a different package, so the stored approval does not decide
 * whether this refusal is right. NEEDS-READ is NEVER a pass: the golden result is NEEDS-READ until a hand read records one of:
 * - the refusal is wrong for that package (= FLIPPED, do-not-ship unless the owner overrides beside the gate);
 * - the live package is genuinely defective (an Author regression, do-not-ship);
 * - the package differs legitimately and the refusal is right (recorded with the reason).
 * A refusal whose quoted lines all occur in the stored package stays FLIPPED.
 *
 * Production is read-only throughout: `golden-pin` reads today's protocol and template rows through snapshot.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { applyEdits, type EditSpec } from './edits';
import { sha256 } from './rebuild';
import { AGENT_MODELS } from '../../lib/agents/model-tiers';
import { heldEditVerdict } from '../../lib/agents/harness/held-edit-carrier';
import { readSampleForce } from './plan-witness-lever';
import { gitLiveDriftCallsService } from '../../lib/agents/harness/git-live-drift';

export const GOLDEN_DIR = path.join(__dirname, 'golden');
/** v7: the one protocol a `requirements` case runs (no held binding). */
export const REQUIREMENTS_PROTOCOL = 'requirements-authoring-protocol';

/** v10 (2026-11-19): THE GIT FILE SOURCE PIN OF A CASE. Production's pin moved from `paichart/paichart-lab-configs` to
 *  `paichart/paichart-configs` on 2026-11-11 and is not stored per execution; the lab's held store is rebuilt from a stored Harvester's own
 *  reads and checks each against the ONE pin the process loads (read at module load from GIT_FILE_SOURCE_PIN) — so no single process
 *  replays cases from both sides of that cut (proved at $0: either pin aborts on the other side's Harvester with `pinViolations`).
 *  The pin check is NOT relaxed. Instead a case DECLARES the pin in force when its leg ran (`gitFileSourcePin`; absent = the default,
 *  the lab scripts' own pin), `golden-build` writes ONE COMPANION PER PIN, each carrying `requireGitFileSourcePin` (lab.ts refuses to
 *  run it under another pin), each companion runs in its own process, and `golden-score` reads every companion of the lab: a
 *  companion with no run leaves its cells UNSCORED ⇒ INCOMPLETE, never PASS. A declaration is DERIVED-AND-COMPARED at build
 *  (`derivedCasePin`): a wrong one fails at golden-build, not at replay. */
export const GOLDEN_DEFAULT_GIT_PIN = 'paichart/paichart-lab-configs';
export const casePin = (c: Pick<GoldenCase, 'gitFileSourcePin'>): string => c.gitFileSourcePin ?? GOLDEN_DEFAULT_GIT_PIN;
/** The companion folder of one pin: the default pin keeps `golden-<version>` (every earlier path stands). */
export const companionDirName = (version: string, pin: string): string => (pin === GOLDEN_DEFAULT_GIT_PIN ? `golden-${version}` : `golden-${version}-pin-${pin.replace(/[^A-Za-z0-9]+/g, '-')}`);

export type GoldenOutcome = 'approved' | 'needs-revision';
export interface GoldenCase {
  id: string; domain: string; protocol: string; legTaskId: string; authorExecutionId: string; reviewerExecutionId: string;
  class: 'released-program' | 'window-approved' | 'correct-refusal' | 'forced';
  expected: { legOutcome: GoldenOutcome; agentApproved: boolean; platformReason: string | null };
  /** `persisted`: the Reviewer is judged on the stored package. `live`: a live Author under the arm must reach the outcome too —
   *  only for cases whose outcome the INPUTS decide (a correct release, a refusal any Author must earn), never for a refusal of
   *  one Author's defect (a better Author may fix it: that is an improvement, not a regression). */
  authorForms: Array<'persisted' | 'live'>;
  /** `value` (v2, 2026-10-31): a VALUE leg (network-derivation) — its node is the persisted derivation_architect and the
   *  derivation_reviewer that chained it, no held binding (heldJoinSeedByProtocol maps its protocol to null), no carrier.
   *  Omitted = a change leg (config_change_author + change_reviewer). */
  shape?: 'change' | 'value' | 'requirements';
  /** requirements (v7): the run's stored owner row→item map (a file under golden/), carried into the node for the form-check control. */
  ownerRowItemMap?: string;
  /** v8 (owner 2026-11-15, Config sources STEP 2): the case's FROZEN Config-sources declaration — the `## Config sources` block a leg of
   *  this case would carry from the protocol's Config-sources text on (`fromVersion`), and what the cluster service's compare tool
   *  ANSWERS the platform's drift call (a tool-shaped result file under golden/, made by the tool's own `compare_manifest` over the
   *  stored Harvester's recorded reads — k8s-drift-from-recorded.py). golden-build carries it onto every node whose cell composes the
   *  protocol at ≥ `fromVersion` (block appended to the leg row, the first-execution snapshot, the drift plant); below it nothing is
   *  carried and the cell is byte-identical to before. */
  configSources?: GoldenConfigSources;
  /** v10: the Git file source pin in force when this leg ran (`owner/repo`); absent = GOLDEN_DEFAULT_GIT_PIN. Derived-and-compared at build. */
  gitFileSourcePin?: string;
  runSheet: string; why: string; caveat?: string;
}
/** The two roles a case's node replays: the persisted/live "Author" slot and the Reviewer. */
export function caseRoles(c: Pick<GoldenCase, 'shape'>): { author: string; reviewer: string } {
  if (c.shape === 'requirements') return { author: 'requirements_author', reviewer: 'requirements_reviewer' };
  return c.shape === 'value' ? { author: 'derivation_architect', reviewer: 'derivation_reviewer' } : { author: 'config_change_author', reviewer: 'change_reviewer' };
}
/** v9 (Config sources STEP 4, owner 2026-11-17): `platformDrift` is REQUIRED for a protocol whose method is a service call (Kubernetes) and
 *  FORBIDDEN for every other (terraform-iac: no method; observability-config: the platform compares — the SHIPPING `gitLiveDriftCallsService` decides): production makes no drift call there, so a
 *  compare-tool answer could never reach a prompt, and the lab refuses such a plant (config-sources-patch.ts). */
export interface GoldenConfigSources { fromVersion: string; block: string[]; platformDrift?: { default: { caller: 'result'; file: string } }; provenance: string }
export interface GoldenSet {
  version: string; frozenAt: string; owner: string; rule: string;
  /** null = the protocol's legs are not held (a value leg): its cells carry no held binding. */
  heldJoinSeedByProtocol: Record<string, string | null>;
  /** Production flags the companion runs with (a lab's own flags are laid over them). */
  flags: Record<string, string>;
  pins: {
    protocols: Record<string, { version: string; file: string; sha256: string }>;
    templates: Record<string, { name: string; role: string; file: string; sha256: string }>;
  };
  cases: GoldenCase[];
  notReplayable: Array<{ id: string; what: string; why: string; followUp: string }>;
  costBasis: Record<string, unknown>;
  /** Owner re-freezes, newest last: what each version added or left out, and the decision that made it. */
  refreezes?: Array<{ version: string; date: string; decision: string; added: string[]; /** v10: cases a re-freeze REMOVED from the set (each explained in `excluded`) */ retired?: string[]; /** v10: shapes with no case yet */ owedShapes?: string[]; excluded: Array<{ leg: string; why: string }>; pinsMoved: string[]; /** v6: a companion-only change (no case or pin moved) */ companion?: string[]; /** v7: the $0 proof recorded with the decision */ proof?: string[] }>;
}
/** The declaration every agent-text / model lab's experiment.json carries (refused at --spend without it). */
export interface GoldenDeclaration { version: string; targets?: Array<{ case: string; reason: string }>; optOut?: Array<{ case: string; reason: string }> }

/** A carrier reason that the run's INPUTS decide (the authoritative Harvester's capture, the declaration, a stage write) — the lab
 *  replays no Harvester and writes no stage, so the stored reason is carried. Mirrors the precedence in applyHeldEditCarrier. */
export function isRunLevelReason(r: string | null): boolean {
  if (!r) return false;
  return r === 'stage-rebind' || r === 'source-not-pinned' || r === 'git-file-not-held' || r === 'device-read-not-held' || r.startsWith('device-sources-');
}

export function loadGoldenSet(dir = GOLDEN_DIR): GoldenSet {
  const gs = JSON.parse(fs.readFileSync(path.join(dir, 'golden-set.json'), 'utf8')) as GoldenSet;
  const ids = new Set<string>();
  for (const c of gs.cases) {
    if (ids.has(c.id)) throw new Error(`golden set: duplicate case ${c.id}`);
    ids.add(c.id);
    if (!gs.pins.protocols[c.protocol]) throw new Error(`golden set: case ${c.id} runs ${c.protocol}, which has no pin`);
    if (!(c.protocol in gs.heldJoinSeedByProtocol)) throw new Error(`golden set: no heldJoinSeed entry for ${c.protocol}`);
    if ((gs.heldJoinSeedByProtocol[c.protocol] === null) !== (c.shape === 'value' || c.shape === 'requirements')) throw new Error(`golden set: case ${c.id} — a value leg or a requirements leg (and only those) runs a protocol with no held binding`);
    if ((c.shape === 'requirements') !== (c.protocol === REQUIREMENTS_PROTOCOL)) throw new Error(`golden set: case ${c.id} — a requirements case (and only a requirements case) runs ${REQUIREMENTS_PROTOCOL}`);
    if (c.shape === 'requirements' && c.authorForms.join() !== 'persisted') throw new Error(`golden set: case ${c.id} — a requirements case is scored with the persisted Author only`);
    if (c.ownerRowItemMap && c.shape !== 'requirements') throw new Error(`golden set: case ${c.id} — ownerRowItemMap is for a requirements case only`);
    if (c.ownerRowItemMap && !fs.existsSync(path.join(dir, c.ownerRowItemMap))) throw new Error(`golden set: case ${c.id} owner map ${c.ownerRowItemMap} missing`);
    if (c.gitFileSourcePin !== undefined && (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(c.gitFileSourcePin) || c.gitFileSourcePin === GOLDEN_DEFAULT_GIT_PIN)) throw new Error(`golden set: case ${c.id} gitFileSourcePin must be "owner/repo" and is written only when it is NOT the default ${GOLDEN_DEFAULT_GIT_PIN}`);
    if (c.gitFileSourcePin !== undefined && gs.heldJoinSeedByProtocol[c.protocol] === null) throw new Error(`golden set: case ${c.id} declares a Git pin on ${c.protocol}, which holds no file`);
    if (c.configSources) {
      const cs = c.configSources;
      if (!gs.heldJoinSeedByProtocol[c.protocol]) throw new Error(`golden set: case ${c.id} carries configSources on ${c.protocol}, which has no held binding`);
      if (!/^\d+\.\d+\.\d+$/.test(cs.fromVersion) || !Array.isArray(cs.block) || !cs.block.length || cs.block.some((l) => typeof l !== 'string' || !l.trim() || l.includes('\n'))) throw new Error(`golden set: case ${c.id} configSources needs fromVersion x.y.z and a non-empty block of single lines`);
      if (!gitLiveDriftCallsService(c.protocol)) {   // STEP 3 P3 (plan W4): the shipping no-call guard — no method, or one the platform computes itself
        if (cs.platformDrift !== undefined) throw new Error(`golden set: case ${c.id} configSources.platformDrift is forbidden on ${c.protocol}: the platform makes no service call for it (GIT_LIVE_DRIFT_METHODS: no method, or one the platform computes itself)`);
      } else {
        const keys = Object.keys(cs.platformDrift ?? {});
        if (keys.join() !== 'default' || cs.platformDrift!.default.caller !== 'result' || !fs.existsSync(path.join(dir, cs.platformDrift!.default.file))) throw new Error(`golden set: case ${c.id} configSources.platformDrift must be { default: { caller: 'result', file } } with the file under golden/`);
      }
      if (!cs.provenance || cs.provenance.length < 20) throw new Error(`golden set: case ${c.id} configSources needs its provenance in words`);
    }
    const want: GoldenOutcome = c.expected.agentApproved && !c.expected.platformReason ? 'approved' : 'needs-revision';
    if (want !== c.expected.legOutcome) throw new Error(`golden set: case ${c.id} expects ${c.expected.legOutcome}, but its agent verdict + platform reason give ${want}`);
    if (c.authorForms.includes('live') && c.class === 'correct-refusal' && !isRunLevelReason(c.expected.platformReason)) {
      throw new Error(`golden set: case ${c.id} is a refusal of one Author's package — it is scored with the persisted Author only`);
    }
  }
  for (const [name, p] of Object.entries(gs.pins.protocols)) checkPinned(dir, `protocol ${name}`, p.file, p.sha256);
  for (const [id, t] of Object.entries(gs.pins.templates)) checkPinned(dir, `template ${t.name} (${id})`, t.file, t.sha256);
  return gs;
}
/** Owner RE-FREEZE only (a release or a passed window adds a case; a protocol/template deploy moves a pin): re-pin today's
 *  production rows, read-only, for every protocol and template the set names. Prints what moved; the caller commits. */
export function pinGolden(dir = GOLDEN_DIR): string[] {
  const { fetchProtocolRows, fetchTemplateRows } = require('./snapshot') as typeof import('./snapshot');
  const gs = JSON.parse(fs.readFileSync(path.join(dir, 'golden-set.json'), 'utf8')) as GoldenSet;
  const moved: string[] = [];
  const rows = fetchProtocolRows(Object.keys(gs.pins.protocols));
  for (const [name, p] of Object.entries(gs.pins.protocols)) {
    const row = rows.find((r) => r.name === name);
    if (!row) throw new Error(`golden-pin: no production row for ${name}`);
    const file = `protocols/${name}@${row.version}.md`;
    fs.mkdirSync(path.join(dir, 'protocols'), { recursive: true });
    fs.writeFileSync(path.join(dir, file), row.promptText);
    const sha = sha256(row.promptText);
    if (p.version !== row.version || p.sha256 !== sha) moved.push(`${name}: ${p.version || '—'} → ${row.version} (${sha.slice(0, 12)}, updatedAt ${row.updatedAt})`);
    if (p.file && p.file !== file && fs.existsSync(path.join(dir, p.file))) fs.unlinkSync(path.join(dir, p.file));
    gs.pins.protocols[name] = { version: row.version, file, sha256: sha };
  }
  const trows = fetchTemplateRows(Object.keys(gs.pins.templates));
  for (const [id, t] of Object.entries(gs.pins.templates)) {
    const row = trows.find((r) => r.id === id);
    if (!row) throw new Error(`golden-pin: no production template row ${id}`);
    if (row.name !== t.name || row.defaultRole !== t.role) throw new Error(`golden-pin: template ${id} is "${row.name}"/${row.defaultRole} in production, the set names "${t.name}"/${t.role}`);
    fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(dir, t.file), row.promptTemplate);
    const sha = sha256(row.promptTemplate);
    if (t.sha256 !== sha) moved.push(`template ${t.name}: ${t.sha256 ? t.sha256.slice(0, 12) : '—'} → ${sha.slice(0, 12)} (updatedAt ${row.updatedAt})`);
    t.sha256 = sha;
  }
  fs.writeFileSync(path.join(dir, 'golden-set.json'), JSON.stringify(gs, null, 2) + '\n');
  return moved;
}

function checkPinned(dir: string, what: string, file: string, sha: string) {
  const f = path.join(dir, file);
  if (!fs.existsSync(f)) throw new Error(`golden set: ${what} pin ${file} missing — run golden-pin (owner re-freeze)`);
  if (sha256(fs.readFileSync(f, 'utf8')) !== sha) throw new Error(`golden set: ${what} pin ${file} was edited (sha256 differs) — the set is frozen`);
}

// ───────────────────────────── the lab side ─────────────────────────────

type Variant = { edits?: string[]; templateEdits?: string[]; authorModel?: string; reviewerModel?: string; authorEffort?: string; reviewerEffort?: string;
  authorSource?: 'live' | 'persisted'; authorOnly?: boolean; heldEditCorrection?: boolean; protocolName?: string; dropTemplateDirective?: boolean; [k: string]: unknown };
type LabExperiment = { label: string; flags: Record<string, string>; baseline: { protocols: Record<string, { file: string; version: string; sha256: string }> };
  variants: Record<string, Variant>; goldenSet?: GoldenDeclaration; goldenCompanion?: unknown };

/** A CANDIDATE arm: it moves something an agent reads or which model reads it. A base arm (no lever) is not carried. */
export function armLevers(v: Variant): string[] {
  const l: string[] = [];
  if (v.edits?.length) l.push('protocol-edits');
  if (v.templateEdits?.length) l.push('template-edits');
  if (v.authorModel || v.authorEffort) l.push('author-model');
  if (v.reviewerModel || v.reviewerEffort) l.push('reviewer-model');
  return l;
}
/** Does the golden rule apply to this experiment? Any arm with a lever ⇒ yes. A companion is never itself re-carried. */
export function labNeedsGolden(exp: LabExperiment): boolean {
  return !exp.goldenCompanion && Object.values(exp.variants).some((v) => armLevers(v).length > 0);
}

/** The pre-registration check (refused at `--spend`): the lab names the golden version it runs, and any case it does not
 *  replay or expects to move is named WITH a reason. Returns the problems (empty = valid). */
export function validateGoldenDeclaration(exp: LabExperiment, gs: GoldenSet): string[] {
  const d = exp.goldenSet;
  if (!d) return [`experiment.json declares no "goldenSet" — every agent-text/model lab replays the golden set (Protocol 16 § The standing no-regression rule). Add {"goldenSet": {"version": "${gs.version}"}} to the pre-registration, then golden-build`];
  const out: string[] = [];
  if (d.version !== gs.version) out.push(`goldenSet.version ${d.version} ≠ the frozen set ${gs.version}`);
  const known = new Set(gs.cases.map((c) => c.id));
  for (const [k, list] of [['optOut', d.optOut ?? []], ['targets', d.targets ?? []]] as const) {
    for (const e of list) {
      if (!known.has(e.case)) out.push(`goldenSet.${k} names ${e.case}, which is not a golden case`);
      if (!e.reason || e.reason.trim().length < 10) out.push(`goldenSet.${k} ${e.case}: a reason is required (pre-registered, in words)`);
    }
  }
  return out;
}

export interface CompanionCell { case: string; arm: string; cell: string; form: 'persisted' | 'live'; reach: string[] }
export interface CompanionSibling { dir: string; pin: string; cells: number }
export interface CompanionReport { /** v10: this companion's Git pin and EVERY companion of the lab (itself included), by folder name beside it */ pin?: string; companions?: CompanionSibling[];
  /** v10: standing cases this companion's arms reach but cannot run (their legs ran under another pin) — carried by the named sibling, checked by the lock */ standingCoveredBy?: Array<{ case: string; companion: string }>;
  lab: string; labLabel: string; goldenVersion: string; cells: CompanionCell[]; unreached: Array<{ case: string; arm: string; why: string }>; optedOut: string[]; targets: string[]; /** B12: the standing cases carried as nodes (case → node id) */ standing?: Array<{ case: string; node: string }> }

/**
 * Build the golden COMPANION of a lab: `<labDir>/golden-<version>/experiment.json` plus its pinned baselines, the lab's edit files
 * and the materialized variant texts. Deterministic for a given lab + golden set (a re-build is byte-identical).
 */
export function buildGoldenCompanion(labDir: string, gs: GoldenSet = loadGoldenSet(), goldenDir = GOLDEN_DIR): { dir: string; report: CompanionReport; experiment: Record<string, any>;
  /** v10: every companion written, one per Git pin (the first entry is `dir`) */ companions: Array<{ pin: string; dir: string; report: CompanionReport; experiment: Record<string, any> }> } {
  const lab = JSON.parse(fs.readFileSync(path.join(labDir, 'experiment.json'), 'utf8')) as LabExperiment;
  if (lab.goldenCompanion) throw new Error(`${labDir} is itself a golden companion`);
  const problems = validateGoldenDeclaration(lab, gs);
  if (problems.length) throw new Error(`golden-build refused:\n  - ${problems.join('\n  - ')}`);
  // Stale companions of this version (a pin that no longer has a reached case) never survive a rebuild.
  for (const f of fs.readdirSync(labDir)) if (f === `golden-${gs.version}` || f.startsWith(`golden-${gs.version}-pin-`)) fs.rmSync(path.join(labDir, f), { recursive: true, force: true });
  // One companion per pin, the default pin first; a pin whose cases the lab does not reach writes nothing.
  const pins = [GOLDEN_DEFAULT_GIT_PIN, ...[...new Set(gs.cases.map(casePin))].filter((x) => x !== GOLDEN_DEFAULT_GIT_PIN).sort()];
  const built: Array<{ pin: string; dir: string; report: CompanionReport; experiment: Record<string, any> }> = [];
  const droppedUnreached: CompanionReport['unreached'] = []; // a pin whose cases the lab does not reach writes no companion; its UNREACHED rows are still reported
  for (const pin of pins) {
    const sub = { ...gs, cases: gs.cases.filter((c) => casePin(c) === pin) };
    if (!sub.cases.length) continue;
    const one = buildOneCompanion(labDir, lab, sub, goldenDir, path.join(labDir, companionDirName(gs.version, pin)), pin);
    if (!one.report.cells.length) { fs.rmSync(one.dir, { recursive: true, force: true }); droppedUnreached.push(...one.report.unreached); continue; }
    built.push({ pin, ...one });
  }
  if (!built.length) throw new Error(`golden-build: the lab reaches no golden case under any pin`);
  built[0].report.unreached.push(...droppedUnreached);
  // DERIVE-AND-COMPARE (v10): the pin a reached case declares must be the pin its stored Harvester's own reads name.
  for (const b of built) for (const id of new Set(b.report.cells.map((x) => x.case))) {
    const c = gs.cases.find((x) => x.id === id)!;
    const d = derivedCasePin(c);
    if (d.pin !== null && d.pin !== casePin(c)) throw new Error(`golden-build: case ${c.id} declares the Git pin ${casePin(c)}${c.gitFileSourcePin ? '' : ' (the default)'}, but its stored Harvester's ${d.evidence} name ${d.pin} — set "gitFileSourcePin": "${d.pin}" on the case (the pin in force when the leg ran), or the cell would abort at replay`);
  }
  // Every companion names its pin, requires it at run time, and lists the whole family (so a missing run reads INCOMPLETE at score).
  const family: CompanionSibling[] = built.map((b) => ({ dir: path.basename(b.dir), pin: b.pin, cells: b.report.cells.length }));
  const standingHome = built.find((b) => b.pin === GOLDEN_DEFAULT_GIT_PIN);
  for (const b of built) {
    b.report.pin = b.pin; b.report.companions = family;
    // A standing case this companion's arms reach but could not carry (its leg ran under the default pin): covered by the default-pin
    // companion, where golden-build carried it on an arm with the same Reviewer-side levers — standing-bench.ts checks exactly that.
    if (b.pin !== GOLDEN_DEFAULT_GIT_PIN) {
      const sbm = require('./standing-bench') as typeof import('./standing-bench');
      const reached = sbm.loadStandingBench().cases.filter((sc) => sbm.reachingArms(b.experiment as any, b.dir, sc).length);
      const missing = reached.filter((sc) => !standingHome?.report.standing?.some((x) => x.case === sc.id));
      if (missing.length) throw new Error(`golden-build: the ${b.pin} companion reaches standing case(s) ${missing.map((x) => x.id).join(', ')}, and no ${GOLDEN_DEFAULT_GIT_PIN} companion of this lab carries them`);
      if (reached.length) b.report.standingCoveredBy = reached.map((sc) => ({ case: sc.id, companion: path.basename(standingHome!.dir) }));
    }
    b.experiment.requireGitFileSourcePin = b.pin; b.experiment.goldenCompanion = b.report;
    fs.writeFileSync(path.join(b.dir, 'experiment.json'), JSON.stringify(b.experiment, null, 2) + '\n');
  }
  return { dir: built[0].dir, report: built[0].report, experiment: built[0].experiment, companions: built };
}

/** The pin a case's STORED leg names (v10): the `github:<owner>:<repo>` targets of its Harvester's held rows; where it held no Git file
 *  (a refused read), the repo its Git reads asked for; `null` when the leg read no Git file at all (no evidence — any pin replays it).
 *  Read from the cached snapshot only. Two different repos in one leg is an error (no single pin could have been in force). */
export function derivedCasePin(c: GoldenCase): { pin: string | null; evidence: string } {
  if (c.shape === 'value' || c.shape === 'requirements') return { pin: null, evidence: 'no held binding' };
  const { loadSnapshot } = require('./snapshot') as typeof import('./snapshot');
  const snap = loadSnapshot(c.authorExecutionId, { reviewerExecutionId: c.reviewerExecutionId ?? null }) as any;
  const chain = snap.author?.exec?.config?.inputContext?.chainedFrom;
  const h = (Array.isArray(chain) ? chain : []).find((e: any) => typeof e?.agentRole === 'string' && /harvester$/.test(e.agentRole));
  if (!h) return { pin: null, evidence: 'no Harvester entry' };
  const art = (snap.childArtifacts ?? []).find((a: any) => a.executionId === h.executionId && a.name === 'result.json');
  if (!art) throw new Error(`golden set: case ${c.id} — the cached snapshot carries no result.json for its Harvester ${h.executionId}`);
  const res = JSON.parse(art.content);
  const held = new Set<string>();
  for (const r of (res.heldBytes?.rows ?? []) as Array<{ target?: unknown }>) { const m = /^github:([^:]+):([^:]+)$/.exec(String(r.target ?? '')); if (m) held.add(`${m[1]}/${m[2]}`); }
  const asked = new Set<string>();
  for (const tc of (res.toolCalls ?? []) as Array<{ arguments?: any }>) {
    const a = tc.arguments ?? {}; if (a.targetService !== 'github-service') continue;
    let inner = a.arguments; if (typeof inner === 'string') { try { inner = JSON.parse(inner); } catch { inner = null; } }
    if (inner && typeof inner.owner === 'string' && typeof inner.repo === 'string') asked.add(`${inner.owner}/${inner.repo}`);
  }
  const set = held.size ? held : asked; const evidence = held.size ? 'held Git refs' : 'Git reads (none held)';
  if (set.size > 1) throw new Error(`golden set: case ${c.id} — its stored Harvester's ${evidence} name ${[...set].join(' and ')}; no single pin was in force`);
  return { pin: set.size ? [...set][0] : null, evidence };
}

function buildOneCompanion(labDir: string, lab: LabExperiment, gs: GoldenSet, goldenDir: string, out: string, pin: string): { dir: string; report: CompanionReport; experiment: Record<string, any> } {
  fs.rmSync(out, { recursive: true, force: true });
  for (const d of ['protocols', 'templates', 'edits']) fs.mkdirSync(path.join(out, d), { recursive: true });

  // The lab's protocol edits apply to the golden PIN of the same protocol; the lab must have pinned the same text.
  for (const [name, b] of Object.entries(lab.baseline.protocols)) {
    const pin = gs.pins.protocols[name];
    if (!pin) continue; // a protocol no golden case runs
    const edited = Object.values(lab.variants).some((v) => (v.edits ?? []).some((f) => readEdit(labDir, f).appliesTo.includes(name)));
    if (!edited) continue;
    const labText = fs.readFileSync(path.join(labDir, b.file), 'utf8');
    if (b.version !== pin.version || sha256(labText) !== pin.sha256) {
      throw new Error(`golden-build: the lab edits ${name} from ${b.version} (${sha256(labText).slice(0, 12)}), the golden set pins ${pin.version} (${pin.sha256.slice(0, 12)}) — the candidate must be built on today's production text, or the set re-frozen by owner decision`);
    }
  }
  const protocols: Record<string, { file: string; version: string; sha256: string }> = {};
  for (const [name, p] of Object.entries(gs.pins.protocols)) {
    const file = `protocols/${name}@${p.version}.baseline.md`;
    fs.copyFileSync(path.join(goldenDir, p.file), path.join(out, file));
    protocols[name] = { file, version: p.version, sha256: p.sha256 };
  }
  const templates: Record<string, { file: string; name: string; role: string; sha256: string }> = {};
  for (const [id, t] of Object.entries(gs.pins.templates)) {
    const file = `templates/${path.basename(t.file)}`;
    fs.copyFileSync(path.join(goldenDir, t.file), path.join(out, file));
    templates[id] = { file, name: t.name, role: t.role, sha256: t.sha256 };
  }
  const pinText = (name: string) => fs.readFileSync(path.join(goldenDir, gs.pins.protocols[name].file), 'utf8');
  const tplText = (id: string) => fs.readFileSync(path.join(goldenDir, gs.pins.templates[id].file), 'utf8');
  const tplIdsOf = (c: GoldenCase) => {
    const snapIds = caseTemplateIds(c, gs);
    for (const id of [snapIds.author, snapIds.reviewer]) if (!gs.pins.templates[id]) throw new Error(`golden set: case ${c.id} template ${id} has no pin`);
    return snapIds;
  };

  const d = lab.goldenSet!;
  const optedOut = new Set((d.optOut ?? []).map((e) => e.case));
  const variants: Record<string, Record<string, unknown>> = {};
  const nodeVariants = new Map<string, string[]>();
  const cells: CompanionCell[] = [];
  const unreached: CompanionReport['unreached'] = [];
  const editCopies = new Map<string, string>();
  const copyEdit = (arm: string, f: string) => {
    const k = `${arm}\0${f}`;
    if (!editCopies.has(k)) {
      const rel = `edits/${arm}/${f.replace(/[\\/]/g, '__')}`;
      fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
      fs.copyFileSync(path.join(labDir, f), path.join(out, rel));
      editCopies.set(k, rel);
    }
    return editCopies.get(k)!;
  };
  // L-CS-N (2026-11-05): arms whose levers are IDENTICAL (same edit bytes, template edits, models/efforts, kind gate, composed version)
  // measure the same golden cells — build them ONCE, under the arm that can carry a live Author (a persisted-Author arm's cells are a
  // subset). The others are reported as `sameAs`, never silently dropped.
  const leverKey = (v: (typeof lab.variants)[string]) => JSON.stringify({
    e: (v.edits ?? []).map((f) => fs.readFileSync(path.join(labDir, f), 'utf8')), t: (v.templateEdits ?? []).map((f) => fs.readFileSync(path.join(labDir, f), 'utf8')),
    am: v.authorModel ?? null, ae: v.authorEffort ?? null, rm: v.reviewerModel ?? null, re: v.reviewerEffort ?? null,
    lr: (v as any).liveReadKind ?? null, cv: (v as any).composedVersion ?? null });
  const representative = new Map<string, string>();
  for (const [arm, v] of Object.entries(lab.variants)) {
    if (!armLevers(v).length) continue;
    const k = leverKey(v); const cur = representative.get(k);
    if (!cur || (lab.variants[cur].authorSource === 'persisted' && v.authorSource !== 'persisted')) representative.set(k, arm);
  }
  for (const [arm, v] of Object.entries(lab.variants)) {
    const levers = armLevers(v);
    if (!levers.length) continue;
    const rep = representative.get(leverKey(v))!;
    if (rep !== arm) { for (const c of gs.cases) if (!optedOut.has(c.id)) unreached.push({ case: c.id, arm, why: `sameAs ${rep}: identical levers — the cells run once, under ${rep}` }); continue; }
    if (!/^[A-Za-z0-9]+$/.test(arm)) throw new Error(`golden-build: arm name ${arm} must be alphanumeric (it names companion cells)`);
    const pEdits = (v.edits ?? []).map((f) => readEdit(labDir, f));
    const tEdits = (v.templateEdits ?? []).map((f) => readEdit(labDir, f));
    for (const c of gs.cases) {
      if (optedOut.has(c.id)) continue;
      const ids = tplIdsOf(c);
      const protoReach = applyEdits(pinText(c.protocol), pEdits, c.protocol).applied.length > 0;
      const revTplReach = applyEdits(tplText(ids.reviewer), tEdits, `role:${gs.pins.templates[ids.reviewer].role}`).applied.length > 0;
      const authTplReach = applyEdits(tplText(ids.author), tEdits, `role:${gs.pins.templates[ids.author].role}`).applied.length > 0;
      const reachR = [protoReach && 'protocol', revTplReach && 'reviewer-template', (v.reviewerModel || v.reviewerEffort) && 'reviewer-model'].filter(Boolean) as string[];
      // An Author model/effort lever is the `infraAuthor` tier — config_change_author ONLY (model-tiers.ts) — so it never
      // reaches a value leg's derivation_architect (tier `infra`). A Reviewer model lever reaches every case: change_reviewer
      // and derivation_reviewer share the `infra` tier (fail-closed; a lab whose lever is change_reviewer-only opts the value
      // case out WITH a reason).
      const authorModelReach = (v.authorModel || v.authorEffort) && c.shape !== 'value' && c.shape !== 'requirements';
      const reachA = [protoReach && 'protocol', authTplReach && 'author-template', authorModelReach && 'author-model'].filter(Boolean) as string[];
      const dom = c.domain;
      const seed = gs.heldJoinSeedByProtocol[c.protocol];
      const base = {
        dropTemplateDirective: true, ...(seed ? { heldJoinSeed: seed } : {}),
        edits: (v.edits ?? []).map((f) => copyEdit(arm, f)),
        ...(v.templateEdits?.length ? { templateEdits: v.templateEdits.map((f) => copyEdit(arm, f)) } : {}),
        reviewerModel: v.reviewerModel ?? AGENT_MODELS.infra, reviewerEffort: v.reviewerEffort ?? 'high',
        // L-CS-N: the text's companion levers travel with it — the kind gate the text commit flips and the version the text ships as
        // (production's liveEvidence population rule reads it; L-CS-a computes the fact only at a released version).
        ...((v as any).liveReadKind ? { liveReadKind: (v as any).liveReadKind } : {}),
        // L-CS-K (2026-11-16): the composed version is the version of the EDITED protocol's text, so it travels only onto cells of a
        // case whose protocol the arm's edits reach. Before this it travelled onto every cell the arm reached (a model lever reaches
        // every domain): a network cell would have been stamped as composing network-provisioning "1.19.0" — below its own
        // Config-sources version — and lost the liveEvidence line production renders (test:golden-set GS8 pins it).
        ...((v as any).composedVersion && protoReach ? { composedVersion: (v as any).composedVersion } : {}),
        // NB1 (G15): `constraintsSeed` does NOT travel — a golden value cell is a persisted-Author Reviewer node (the Architect prompt is
        // never sent; the Reviewer's rows are unchanged), and the lever is built for architectOnly cells only.
      };
      const add = (cell: string, form: 'persisted' | 'live', reach: string[], spec: Record<string, unknown>) => {
        variants[cell] = variants[cell] ?? { ...base, ...spec, comment: `golden ${gs.version}: arm ${arm} on ${dom} (${form} Author)` };
        nodeVariants.set(c.id, [...(nodeVariants.get(c.id) ?? []), cell]);
        cells.push({ case: c.id, arm, cell, form, reach });
      };
      let any = false;
      if (reachR.length) { add(`g${arm}${dom}r`, 'persisted', reachR, { authorSource: 'persisted' }); any = true; }
      if (reachA.length && c.authorForms.includes('live') && v.authorSource !== 'persisted') {
        add(`g${arm}${dom}a`, 'live', reachA, { authorModel: v.authorModel ?? (c.shape === 'value' ? AGENT_MODELS.infra : c.shape === 'requirements' ? AGENT_MODELS.requirementsAuthor : AGENT_MODELS.infraAuthor), authorEffort: v.authorEffort ?? 'high', heldEditCorrection: v.heldEditCorrection ?? true });
        any = true;
      }
      if (!any) unreached.push({ case: c.id, arm, why: reachA.length ? 'the lever reaches only the Author, and this case is scored on the persisted Author'
        : (v.authorModel || v.authorEffort) && c.shape === 'value' ? `arm ${arm}'s Author model lever is the config_change_author tier; this value leg's Author is a derivation_architect`
        : (v.authorModel || v.authorEffort) && c.shape === 'requirements' ? `arm ${arm}'s Author model lever is the config_change_author tier; this requirements leg's Author is a requirements_author (persisted only)`
        : `arm ${arm}'s levers (${levers.join(', ')}) do not reach ${c.protocol} or its templates` });
    }
  }
  // Materialize every cell's protocol text exactly as protocolFor re-derives it (baseline file name with the cell name).
  for (const [cell, spec] of Object.entries(variants)) {
    const edits = ((spec.edits as string[]) ?? []).map((f) => readEdit(out, f));
    for (const [name, p] of Object.entries(protocols)) {
      const r = applyEdits(fs.readFileSync(path.join(out, p.file), 'utf8'), edits, name);
      if (r.applied.length) fs.writeFileSync(path.join(out, p.file.replace(/\.baseline\.md$/, `.${cell}.md`)), r.text);
    }
  }
  // GOLDEN-REVIEWER-BYTE-FIDELITY (a) (2026-11-09): a HELD case whose stored Author carries `editApplication` — production's edit step
  // stamped it and the leaf nets read it with the held handles — sets `persistedEditApplication` on its node, so the persisted Reviewer
  // cell sees production's rollback-provenance line (`restore-is-held-base`), not `no-restore-blocks`. Per case, never per arm: a case
  // with no stored stamp (K8S-AK5, pre-join) is refused the flag by the lab. Read from the cached snapshot (the stored Author row).
  const pea = (authorExecutionId: string, reviewerExecutionId: string | undefined, held: boolean): boolean => {
    if (!held) return false;
    const { loadSnapshot } = require('./snapshot') as typeof import('./snapshot');
    const { parsedResult } = require('./rebuild') as typeof import('./rebuild');
    const ea = parsedResult(loadSnapshot(authorExecutionId, { reviewerExecutionId: reviewerExecutionId ?? null }).author)?.editApplication;
    return !!ea && typeof ea === 'object';
  };
  // v7: a requirements case's stored owner map, copied beside the companion (the node path is relative to it).
  const copyOwnerMap = (f: string) => { const rel = `owner-maps/${path.basename(f)}`; fs.mkdirSync(path.join(out, 'owner-maps'), { recursive: true }); fs.copyFileSync(path.join(goldenDir, f), path.join(out, rel)); return rel; };
  // v8 (owner 2026-11-15): a case's FROZEN Config-sources declaration travels onto its node when ANY of the node's cells composes the
  // protocol at ≥ the declaration's version (the arm's `composedVersion`, the version production's population rule reads). The block
  // is appended to the leg row (an input edit written here, against the cached leg description), the first-execution snapshot is
  // simulated, and the drift plant is the case's tool-shaped result file. Below the version nothing is carried: the cells stay
  // byte-identical to before (the levers return null below the version anyway; this keeps the companion itself unchanged).
  const semverGte = (a: string, b: string) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); } return true; };
  const configCarry = (c: GoldenCase): Record<string, unknown> => {
    const cs = c.configSources;
    if (!cs) return {};
    // v10: a cell with no `composedVersion` of its own composes the golden PIN of the protocol (today's production text), so the pin's
    // version decides for it. Before v10 no pin was at or above a declaration's version, so this changes no earlier companion; from the
    // terraform-iac 1.17.0 pin on, a model-lever cell of TF-TL4 carries its declaration too — without it the cell read
    // `config-sources-snapshot-absent` (a leg that declares nothing), not the stored leg's refused read.
    const pinVersion = gs.pins.protocols[c.protocol].version;
    const reaching = (nodeVariants.get(c.id) ?? []).some((cell) => semverGte(typeof variants[cell]?.composedVersion === 'string' ? variants[cell].composedVersion as string : pinVersion, cs.fromVersion));
    if (!reaching) return {};
    const { loadSnapshot } = require('./snapshot') as typeof import('./snapshot');
    const desc = loadSnapshot(c.authorExecutionId, { reviewerExecutionId: c.reviewerExecutionId ?? null }).leg?.description;
    if (typeof desc !== 'string' || !desc) throw new Error(`golden-build: case ${c.id} — the cached leg row has no description to carry its Config sources block onto`);
    fs.mkdirSync(path.join(out, 'config-sources'), { recursive: true });
    const editRel = `config-sources/${c.id}.block.json`;
    fs.writeFileSync(path.join(out, editRel), JSON.stringify({ id: `golden-${gs.version}-${c.id}-config-sources`, appliesTo: ['leg:description'],
      ops: [{ type: 'replace', old: desc, new: `${desc}\n\n## Config sources\n${cs.block.join('\n')}\n` }] }, null, 2) + '\n');
    // v9: no drift plant for a protocol with no Git-vs-live method (the validator guarantees `platformDrift` is absent there).
    if (!cs.platformDrift) return { inputEdits: editRel, configSourcesSnapshot: 'first-execution' };
    const resultRel = `config-sources/${path.basename(cs.platformDrift.default.file)}`;
    fs.copyFileSync(path.join(goldenDir, cs.platformDrift.default.file), path.join(out, resultRel));
    return { inputEdits: editRel, configSourcesSnapshot: 'first-execution', platformDrift: { default: { caller: 'result', file: resultRel } } };
  };
  const nodes = gs.cases.filter((c) => nodeVariants.has(c.id)).map((c) => ({
    id: `GOLD-${c.id}`, authorExecutionId: c.authorExecutionId, reviewerExecutionId: c.reviewerExecutionId,
    ...(pea(c.authorExecutionId, c.reviewerExecutionId, gs.heldJoinSeedByProtocol[c.protocol] !== null) ? { persistedEditApplication: true } : {}),
    ...configCarry(c),
    ...(c.ownerRowItemMap ? { ownerRowItemMap: copyOwnerMap(c.ownerRowItemMap) } : {}),
    kind: `golden ${c.class} (${c.domain}) — expect leg ${c.expected.legOutcome}`, variants: nodeVariants.get(c.id)!,
    expect: `${c.expected.legOutcome} (agent ${c.expected.agentApproved ? 'approved' : 'refused'}${c.expected.platformReason ? `, platform ${c.expected.platformReason}` : ''})`,
    why: c.why, n: 1,
  }));
  // VLG-LAB-TOOLING B12 (2026-11-07): carry every STANDING case the companion REACHES (the role-keyed lock rule, standing-bench.ts) as a
  // node on its persisted-Author reaching arms, built from the CASE (never the lab's copy): the case's executions, provenance, gate and —
  // for a planted case — its sha-pinned inputs referenced in place. A live-Author arm is covered by the persisted arm with the same
  // Reviewer-side levers (the lock's rule). The companion then passes the lock without a hand edit.
  const sbm = require('./standing-bench') as typeof import('./standing-bench');
  const standingNodes: Array<Record<string, unknown>> = [];
  const standingDecl: Array<{ case: string; node: string }> = [];
  const pre = { variants, nodes, standingBench: [] as Array<{ case: string; node: string }> };
  // v10: the standing cases' legs ran under the default pin, so only the default-pin companion can carry them; another pin's companion
  // names the sibling that covers it (buildGoldenCompanion) and the lock verifies the cover.
  for (const sc of pin === GOLDEN_DEFAULT_GIT_PIN ? sbm.loadStandingBench().cases : []) {
    // Carry it on a persisted-Author cell of the case's OWN protocol (the domain binding the node needs), one per distinct Reviewer-side
    // lever set; every other reaching cell is covered by the lock's same-lever rule.
    const reaching = sbm.reachingArms(pre as any, out, sc);
    if (!reaching.length) continue;
    const cellProto = new Map(cells.map((x) => [x.cell, gs.cases.find((c) => c.id === x.case)!.protocol]));
    const seen = new Set<string>(); const arms: string[] = [];
    for (const a of reaching.filter((x) => (variants[x] as any).authorSource === 'persisted' && cellProto.get(x) === sc.protocol)) {
      const k = sbm.reviewerLeverKey(pre as any, out, a); if (!seen.has(k)) { seen.add(k); arms.push(a); }
    }
    const uncovered = reaching.filter((a) => !seen.has(sbm.reviewerLeverKey(pre as any, out, a)));
    if (uncovered.length) throw new Error(`golden-build: standing case ${sc.id} is reached by ${uncovered.join(', ')}, and no persisted ${sc.protocol} cell of the companion carries the same Reviewer-side levers — carry it in the lab, or opt the arm's value out with a reason`);
    const g = sbm.caseGate(sc);
    const rel = (f: string) => path.relative(out, path.join(sbm.LAB_DIR, f));
    const pn = sc.node ?? {};
    const id = `STAND-${sc.id}`;
    standingNodes.push({ id, authorExecutionId: sc.authorExecutionId, reviewerExecutionId: sc.reviewerExecutionId,
      ...(sc.provenance.kind !== 'production' ? { provenance: sc.provenance.kind } : {}),
      kind: `STANDING BENCH ${sc.id} (carried by golden-build, B12) — reader ${sc.reader}`, variants: arms, n: 1,
      expect: g.expect === 'refuse-for-plant' ? `refuse — ${sc.correctOutcome}` : `APPROVE + NON-BLOCKING WARNING (${g.warningId}) naming ${(g.devices ?? []).join(' and ')} — ${sc.correctOutcome}`,
      scoring: { reviewerGate: { gate: id, ...g, bar: [1, 1] } },
      ...(pn.inputEdits ? { inputEdits: rel(pn.inputEdits.file) } : {}),
      ...(pn.deviceSourcesSnapshot ? { deviceSourcesSnapshot: pn.deviceSourcesSnapshot } : {}),
      ...(pn.valueHarvest ? { valueHarvest: { text: rel(pn.valueHarvest.text.file), toolCalls: rel(pn.valueHarvest.toolCalls.file) } } : {}),
      ...(pn.authorPlant ? { authorPlant: rel(pn.authorPlant.file) } : {}),
      // GOLDEN-REVIEWER-BYTE-FIDELITY (a): the same per-case rule for an UNPLANTED standing case on a held protocol (a planted one's
      // Author is the plant, re-stamped by the lab).
      ...(!pn.authorPlant && pea(sc.authorExecutionId, sc.reviewerExecutionId, gs.heldJoinSeedByProtocol[sc.protocol] !== null && gs.heldJoinSeedByProtocol[sc.protocol] !== undefined) ? { persistedEditApplication: true } : {}) });
    standingDecl.push({ case: sc.id, node: id });
  }
  const report: CompanionReport = { lab: path.basename(labDir), labLabel: lab.label, goldenVersion: gs.version, cells, unreached,
    optedOut: [...optedOut], targets: (d.targets ?? []).map((t) => t.case), standing: standingDecl };
  const experiment = {
    label: `golden-${gs.version}-${lab.label}`,
    purpose: `GOLDEN COMPANION of ${lab.label} (Protocol 16 § The standing no-regression rule). Each golden case must reproduce its stored outcome under every arm of the lab that reaches it; one flip is DO-NOT-SHIP unless the lab's pre-registration names the case in goldenSet.targets. Read with golden-score. Generated by golden-build — never hand-edited.`,
    n: 1, flags: { ...gs.flags, ...lab.flags },
    baseline: { protocols, templates }, variants, nodes: [...nodes, ...standingNodes], measures: [],
    ...(standingDecl.length ? { standingBench: standingDecl } : {}),
    goldenCompanion: report,
  };
  // experiment.json is written by buildGoldenCompanion, once the companion family is known.
  return { dir: out, report, experiment };
}

function readEdit(dir: string, f: string): EditSpec { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }

/** The case's Author and Reviewer template ids: the pinned template of the case's role (caseRoles) whose file names its domain. */
export function caseTemplateIds(c: GoldenCase, gs: GoldenSet): { author: string; reviewer: string } {
  const found = Object.entries(gs.pins.templates);
  const byRole = (role: string, domainHint: string) => found.filter(([, t]) => t.role === role && t.file.includes(domainHint)).map(([id]) => id);
  const roles = caseRoles(c);
  const a = byRole(roles.author, c.domain); const r = byRole(roles.reviewer, c.domain);
  if (a.length !== 1 || r.length !== 1) throw new Error(`golden set: case ${c.id} needs exactly one pinned author and reviewer template for ${c.domain} (found ${a.length}/${r.length})`);
  return { author: a[0], reviewer: r[0] };
}

// ───────────────────────────── scoring ─────────────────────────────

export interface GoldenSampleRead { sample: string; agentApproved: boolean | null; platformReason: string | null; legOutcome: GoldenOutcome | null; error: string | null }
export interface GoldenCellScore { case: string; cell: string; arm: string; form: string; expected: GoldenCase['expected']; samples: GoldenSampleRead[];
  status: 'REPRODUCED' | 'FLIPPED' | 'MASKED-TOWARD-APPROVAL' | 'MASKED-TOWARD-REFUSAL' | 'NEEDS-READ' | 'UNSCORED'; direction?: string; target: boolean }

/** NEEDS-READ test: does a refusal point at live-package content the stored package lacks? Spans = backticked text (≥ 4 chars) in the
 *  blocking items; a pointed line = a live-package line containing a span; "lacks" = that line (whitespace-normalised) is not a stored
 *  line. No span quoted, or no stored text ⇒ true (the scorer cannot tell; the hand read must). */
export function refusalPointsAtLiveOnly(blocking: unknown[], liveText: string, storedText: string | null): boolean {
  if (!storedText) return true;
  const spans = [...new Set(blocking.flatMap((b) => String(b).match(/`([^`]{4,})`/g) ?? []).map((x) => x.slice(1, -1)))];
  if (!spans.length) return true;
  const norm = (l: string) => l.split(/\s+/).filter(Boolean).join(' ');
  const stored = new Set(storedText.split('\n').map(norm));
  return spans.some((sp) => liveText.split('\n').some((l) => l.includes(sp) && !stored.has(norm(l))));
}

/** The platform's carrier reason for one sample. Run-level ⇒ the stored reason (an input the lab holds fixed); otherwise the
 *  shipping `heldEditVerdict` over the sample's own `editApplication`, with the Reviewer taken to have seen the platform's
 *  rendering of THAT Author (true by construction: the lab chains its own Author to its Reviewer). */
export function samplePlatformReason(c: GoldenCase, carrierModelled: boolean, editApplication: Record<string, unknown> | null | undefined, execId: string): string | null {
  if (!carrierModelled) return null;
  if (isRunLevelReason(c.expected.platformReason)) return c.expected.platformReason;
  const author = editApplication ? { state: 'ok' as const, taskId: 'lab', executionId: execId, fact: editApplication } : null;
  const digest = editApplication?.candidateDigest8;
  const reviewer = { state: 'ok' as const, taskId: 'lab', executionId: 'lab-r', fact: { state: 'rendered', authorExecutionId: execId, ...(typeof digest === 'string' ? { candidateDigest8: digest } : {}) } };
  return heldEditVerdict(author, reviewer).reason;
}

/** v8: the Config force a cell's leg would carry (`configGitFileForce` over the frozen declaration and the cell's held files, reported
 *  by the lab per cell in the run manifest: `nodes[<node>].variants[<cell>].held.configSources.configForce`). It is a RUN-LEVEL reason
 *  — decided by the declaration and the Harvester's reads, both inputs the cell holds fixed — so it outranks the package-level
 *  recompute, as in the shipping carrier. Null when the cell does not read Config sources or nothing is forced. */
export function cellConfigForce(manifest: Record<string, any> | null, node: string, cell: string): string | null {
  const f = manifest?.nodes?.[node]?.variants?.[cell]?.held?.configSources?.configForce;
  return f && typeof f === 'object' && typeof f.reason === 'string' ? f.reason : null;
}
export function readGoldenSample(c: GoldenCase, carrierModelled: boolean, s: Record<string, any>, name: string, configForce: string | null = null): GoldenSampleRead {
  if (s.error) return { sample: name, agentApproved: null, platformReason: null, legOutcome: null, error: String(s.error) };
  const approved = typeof s.verdict?.approved === 'boolean' ? s.verdict.approved as boolean : null;
  if (approved === null) return { sample: name, agentApproved: null, platformReason: null, legOutcome: null, error: 'no parseable verdict' };
  // planWitness (2026-11-18): the carrier's LAST reason — the stop sentence (`stop-sentence-altered` / `stop-sentence-absent`), written on the
  // sample by lab.ts from the shipping pieces (plan-witness-lever.ts). It fires only where nothing above it forces; absent on every sample
  // below terraform-iac 1.17.0 and on every run before the lever, so their reading is unchanged.
  // §8b: the fact's own reason is any of four (the stop sentence, `witness-incomplete`, `witness-whole-value`); `readSampleForce` reads both lever versions.
  const pwf = readSampleForce(s.planWitnessForce);
  const pw = carrierModelled && pwf.byFact ? pwf.reason : null;
  const reason = configForce ?? samplePlatformReason(c, carrierModelled, s.editApplication ?? null, `lab-${s.node}-${s.variant}-${s.i}-a`) ?? pw;
  return { sample: name, agentApproved: approved, platformReason: reason, legOutcome: approved && !reason ? 'approved' : 'needs-revision', error: null };
}

export function classifyCell(c: GoldenCase, reads: GoldenSampleRead[]): Pick<GoldenCellScore, 'status' | 'direction'> {
  if (!reads.length || reads.some((r) => r.error)) return { status: 'UNSCORED' };
  const e = c.expected;
  const legFlip = reads.find((r) => r.legOutcome !== e.legOutcome);
  if (legFlip) return { status: 'FLIPPED', direction: `${e.legOutcome} → ${legFlip.legOutcome} (${legFlip.sample})` };
  const agentFlip = reads.find((r) => r.agentApproved !== e.agentApproved);
  if (agentFlip) {
    return agentFlip.agentApproved
      ? { status: 'MASKED-TOWARD-APPROVAL', direction: `agent refused → approved, the platform still forces ${agentFlip.platformReason} (${agentFlip.sample})` }
      : { status: 'MASKED-TOWARD-REFUSAL', direction: `agent approved → refused under a platform force (${agentFlip.sample}) — safe direction, read it` };
  }
  return { status: 'REPRODUCED' };
}

export function goldenVerdict(cells: GoldenCellScore[]): { verdict: 'PASS' | 'DO-NOT-SHIP' | 'INCOMPLETE' | 'NEEDS-READ'; reasons: string[] } {
  const bad = cells.filter((x) => !x.target && (x.status === 'FLIPPED' || x.status === 'MASKED-TOWARD-APPROVAL'));
  const unscored = cells.filter((x) => x.status === 'UNSCORED');
  const read = cells.filter((x) => !x.target && x.status === 'NEEDS-READ');
  if (bad.length) return { verdict: 'DO-NOT-SHIP', reasons: [...bad, ...read].map((x) => `${x.case} ${x.cell}: ${x.status} ${x.direction ?? ''}`) };
  if (unscored.length) return { verdict: 'INCOMPLETE', reasons: unscored.map((x) => `${x.case} ${x.cell}: UNSCORED (${x.samples.map((s) => s.error).filter(Boolean).join('; ') || 'no samples'}) — re-run the cell`) };
  if (read.length) return { verdict: 'NEEDS-READ', reasons: read.map((x) => `${x.case} ${x.cell}: NEEDS-READ ${x.direction ?? ''} — hand read decides: FLIPPED (refusal wrong for that package), Author regression (package defective), or a recorded legitimate refusal; never a pass`) };
  return { verdict: 'PASS', reasons: [] };
}

/** v10: the report of the WHOLE companion family of a lab, read from any one of its companions: the cells and unreached lists of every
 *  companion (one per Git pin) joined. A sibling folder that is missing on disk is an error (rebuild); a sibling with no RUN simply has no
 *  samples, so its cells read UNSCORED and the verdict INCOMPLETE — a lab can never PASS on one pin's companion alone. */
export function companionFamilyReport(companionDir: string): CompanionReport {
  const read = (d: string): CompanionReport => {
    const f = path.join(d, 'experiment.json');
    if (!fs.existsSync(f)) throw new Error(`golden-score: the companion ${d} is missing — run golden-build again (a lab's golden set is every companion it lists)`);
    const r = JSON.parse(fs.readFileSync(f, 'utf8')).goldenCompanion as CompanionReport | undefined;
    if (!r) throw new Error(`${d} is not a golden companion`);
    return r;
  };
  const own = read(companionDir);
  const fam = own.companions?.length ? own.companions : [{ dir: path.basename(companionDir), pin: own.pin ?? GOLDEN_DEFAULT_GIT_PIN, cells: own.cells.length }];
  const all = fam.map((x) => read(path.join(path.dirname(companionDir), x.dir)));
  for (const r of all) if (r.goldenVersion !== own.goldenVersion || r.lab !== own.lab) throw new Error(`golden-score: the companions beside ${companionDir} are not one family (${r.lab} ${r.goldenVersion} vs ${own.lab} ${own.goldenVersion})`);
  return { ...own, cells: all.flatMap((r) => r.cells), unreached: all.flatMap((r) => r.unreached), standing: all.flatMap((r) => r.standing ?? []) };
}

/** Score one or more run folders of a companion. `stored(case)` returns the stored leg's qualityGate (carrier modelled iff it
 *  carries `heldEdit`) and the stored Author's `editApplication` (the fact a PERSISTED-Author sample carries: the lab re-uses the
 *  stored package, so its stamp is the stored one). A live sample's own stamp is its `editApplication.json` (written by the run). */
export function scoreGolden(runDirs: string[], companionDir: string, stored: (c: GoldenCase) => { qualityGate: Record<string, any> | null; editApplication: Record<string, any> | null; authorText?: string | null }, gs: GoldenSet = loadGoldenSet()): { cells: GoldenCellScore[]; unreached: CompanionReport['unreached']; verdict: ReturnType<typeof goldenVerdict> } {
  const report = companionFamilyReport(companionDir);
  if (report.goldenVersion !== gs.version) throw new Error(`companion built for golden ${report.goldenVersion}, the set is ${gs.version}`);
  const targets = new Set(report.targets);
  const cells: GoldenCellScore[] = [];
  for (const cell of report.cells) {
    const c = gs.cases.find((x) => x.id === cell.case)!;
    const st = stored(c);
    const carrier = !!st.qualityGate?.heldEdit;
    const reads: GoldenSampleRead[] = [];
    const pointsLiveOnly: Record<string, boolean> = {};
    for (const rd of runDirs) {
      const d = path.join(rd, `GOLD-${c.id}`, cell.cell);
      if (!fs.existsSync(d)) continue;
      const mf = path.join(rd, 'manifest.json');
      const force = cellConfigForce(fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : null, `GOLD-${c.id}`, cell.cell);
      for (const s of fs.readdirSync(d).filter((x) => x.startsWith('sample-')).sort()) {
        const f = path.join(d, s, 'sample.json');
        if (!fs.existsSync(f)) continue;
        const sample = JSON.parse(fs.readFileSync(f, 'utf8'));
        const eaFile = path.join(d, s, 'editApplication.json');
        const ea = sample.editApplication ?? (fs.existsSync(eaFile) ? JSON.parse(fs.readFileSync(eaFile, 'utf8')).fact : null)
          ?? (cell.form === 'persisted' ? st.editApplication : null);
        const name = `${path.basename(rd)}/${s}`;
        reads.push(readGoldenSample(c, carrier, { ...sample, editApplication: ea }, name, force));
        const af = path.join(d, s, 'author.md');
        if (cell.form === 'live' && sample.verdict?.approved === false && fs.existsSync(af))
          pointsLiveOnly[name] = refusalPointsAtLiveOnly(sample.verdict?.blocking ?? [], fs.readFileSync(af, 'utf8'), st.authorText ?? null);
      }
    }
    let cls = classifyCell(c, reads);
    // NEEDS-READ: every flipped sample is an agent refusal (no platform force) of an approve-expected case that points at live-only content.
    const flips = reads.filter((x) => x.legOutcome !== c.expected.legOutcome);
    if (cls.status === 'FLIPPED' && cell.form === 'live' && c.expected.legOutcome === 'approved' && flips.length
      && flips.every((x) => x.agentApproved === false && !x.platformReason && pointsLiveOnly[x.sample] === true)) {
      cls = { status: 'NEEDS-READ', direction: `live Author's package differs from the stored one where the refusal points (${flips.map((x) => x.sample).join(', ')})` };
    }
    cells.push({ case: c.id, cell: cell.cell, arm: cell.arm, form: cell.form, expected: c.expected, samples: reads, target: targets.has(c.id), ...cls });
  }
  return { cells, unreached: report.unreached, verdict: goldenVerdict(cells) };
}

/** $0 self-test over the STORED legs: the stored Reviewer verdict and the stored carrier stamp must recompute the stored outcome,
 *  and the case's expectation must equal what production stored. A failure is a golden-set fault (or a moved stamp shape). */
export function goldenStoredSelfTest(load: (authorExecutionId: string) => { leg: Record<string, any> | null; reviewer: { exec: Record<string, any>; resultJson: string | null } | null; author: { resultJson: string | null } }, gs: GoldenSet = loadGoldenSet()): Array<{ case: string; ok: boolean; detail: string }> {
  return gs.cases.map((c) => {
    try {
      const snap = load(c.authorExecutionId);
      if (snap.reviewer?.exec.id !== c.reviewerExecutionId) return { case: c.id, ok: false, detail: `snapshot reviewer ${snap.reviewer?.exec.id} ≠ ${c.reviewerExecutionId}` };
      if (snap.leg?.id !== c.legTaskId) return { case: c.id, ok: false, detail: `snapshot leg ${snap.leg?.id} ≠ ${c.legTaskId}` };
      const qg = snap.leg?.metadata?.qualityGate ?? {};
      const rv = JSON.parse(snap.reviewer!.resultJson ?? '{}').reviewerVerdict;
      const ar = JSON.parse(snap.author.resultJson ?? '{}');
      const stored = { legOutcome: qg.outcome, agentApproved: rv?.approved, platformReason: qg.heldEdit?.reason ?? null };
      if (JSON.stringify(stored) !== JSON.stringify(c.expected)) return { case: c.id, ok: false, detail: `stored ${JSON.stringify(stored)} ≠ expected ${JSON.stringify(c.expected)}` };
      // The scorer's own route over the stored package must give the stored leg outcome.
      const read = readGoldenSample(c, !!qg.heldEdit, { node: 'stored', variant: 'stored', i: 0, verdict: { approved: rv?.approved }, editApplication: ar.editApplication ?? null }, 'stored');
      if (read.legOutcome !== qg.outcome) return { case: c.id, ok: false, detail: `scorer route gives ${read.legOutcome} (reason ${read.platformReason}), stored ${qg.outcome}` };
      return { case: c.id, ok: true, detail: `${qg.outcome} = agent ${rv?.approved ? 'approved' : 'refused'}${read.platformReason ? ` + platform ${read.platformReason}` : ''}` };
    } catch (e) { return { case: c.id, ok: false, detail: (e as Error).message }; }
  });
}

export function printGoldenScore(r: ReturnType<typeof scoreGolden>, log: (s: string) => void = console.log) {
  log('| case | cell | Author | expected leg | samples (leg / agent / platform) | status |');
  log('|---|---|---|---|---|---|');
  for (const x of r.cells) {
    log(`| ${x.case}${x.target ? ' (TARGET)' : ''} | ${x.cell} | ${x.form} | ${x.expected.legOutcome} | ${x.samples.map((s) => s.error ? `ERR ${s.error}` : `${s.legOutcome} / ${s.agentApproved ? 'A' : 'R'} / ${s.platformReason ?? '—'}`).join(', ') || '—'} | ${x.status}${x.direction ? ` — ${x.direction}` : ''} |`);
  }
  if (r.unreached.length) log(`\nUNREACHED (today's production text, reproduced by construction, $0): ${r.unreached.map((u) => `${u.case}×${u.arm}`).join(', ')}`);
  log(`\nGolden result: ${r.verdict.verdict}${r.verdict.reasons.length ? `\n  - ${r.verdict.reasons.join('\n  - ')}` : ''}`);
}
