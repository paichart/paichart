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
 * Production is read-only throughout: `golden-pin` reads today's protocol and template rows through snapshot.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { applyEdits, type EditSpec } from './edits';
import { sha256 } from './rebuild';
import { AGENT_MODELS } from '../../lib/agents/model-tiers';
import { heldEditVerdict } from '../../lib/agents/harness/held-edit-carrier';

export const GOLDEN_DIR = path.join(__dirname, 'golden');

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
  shape?: 'change' | 'value';
  runSheet: string; why: string; caveat?: string;
}
/** The two roles a case's node replays: the persisted/live "Author" slot and the Reviewer. */
export function caseRoles(c: Pick<GoldenCase, 'shape'>): { author: string; reviewer: string } {
  return c.shape === 'value' ? { author: 'derivation_architect', reviewer: 'derivation_reviewer' } : { author: 'config_change_author', reviewer: 'change_reviewer' };
}
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
  refreezes?: Array<{ version: string; date: string; decision: string; added: string[]; excluded: Array<{ leg: string; why: string }>; pinsMoved: string[] }>;
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
    if ((gs.heldJoinSeedByProtocol[c.protocol] === null) !== (c.shape === 'value')) throw new Error(`golden set: case ${c.id} — a value leg (and only a value leg) runs a protocol with no held binding`);
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
export interface CompanionReport { lab: string; labLabel: string; goldenVersion: string; cells: CompanionCell[]; unreached: Array<{ case: string; arm: string; why: string }>; optedOut: string[]; targets: string[] }

/**
 * Build the golden COMPANION of a lab: `<labDir>/golden-<version>/experiment.json` plus its pinned baselines, the lab's edit files
 * and the materialized variant texts. Deterministic for a given lab + golden set (a re-build is byte-identical).
 */
export function buildGoldenCompanion(labDir: string, gs: GoldenSet = loadGoldenSet(), goldenDir = GOLDEN_DIR): { dir: string; report: CompanionReport; experiment: Record<string, any> } {
  const lab = JSON.parse(fs.readFileSync(path.join(labDir, 'experiment.json'), 'utf8')) as LabExperiment;
  if (lab.goldenCompanion) throw new Error(`${labDir} is itself a golden companion`);
  const problems = validateGoldenDeclaration(lab, gs);
  if (problems.length) throw new Error(`golden-build refused:\n  - ${problems.join('\n  - ')}`);
  const out = path.join(labDir, `golden-${gs.version}`);
  fs.rmSync(out, { recursive: true, force: true });
  for (const d of ['protocols', 'templates', 'edits']) fs.mkdirSync(path.join(out, d), { recursive: true });

  // The lab's protocol edits apply to the golden PIN of the same protocol; the lab must have pinned the same text.
  for (const [name, b] of Object.entries(lab.baseline.protocols)) {
    const pin = gs.pins.protocols[name];
    if (!pin) continue; // a protocol no golden case runs (e.g. requirements-authoring)
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
  for (const [arm, v] of Object.entries(lab.variants)) {
    const levers = armLevers(v);
    if (!levers.length) continue;
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
      const authorModelReach = (v.authorModel || v.authorEffort) && c.shape !== 'value';
      const reachA = [protoReach && 'protocol', authTplReach && 'author-template', authorModelReach && 'author-model'].filter(Boolean) as string[];
      const dom = c.domain;
      const seed = gs.heldJoinSeedByProtocol[c.protocol];
      const base = {
        dropTemplateDirective: true, ...(seed ? { heldJoinSeed: seed } : {}),
        edits: (v.edits ?? []).map((f) => copyEdit(arm, f)),
        ...(v.templateEdits?.length ? { templateEdits: v.templateEdits.map((f) => copyEdit(arm, f)) } : {}),
        reviewerModel: v.reviewerModel ?? AGENT_MODELS.infra, reviewerEffort: v.reviewerEffort ?? 'high',
      };
      const add = (cell: string, form: 'persisted' | 'live', reach: string[], spec: Record<string, unknown>) => {
        variants[cell] = variants[cell] ?? { ...base, ...spec, comment: `golden ${gs.version}: arm ${arm} on ${dom} (${form} Author)` };
        nodeVariants.set(c.id, [...(nodeVariants.get(c.id) ?? []), cell]);
        cells.push({ case: c.id, arm, cell, form, reach });
      };
      let any = false;
      if (reachR.length) { add(`g${arm}${dom}r`, 'persisted', reachR, { authorSource: 'persisted' }); any = true; }
      if (reachA.length && c.authorForms.includes('live') && v.authorSource !== 'persisted') {
        add(`g${arm}${dom}a`, 'live', reachA, { authorModel: v.authorModel ?? (c.shape === 'value' ? AGENT_MODELS.infra : AGENT_MODELS.infraAuthor), authorEffort: v.authorEffort ?? 'high', heldEditCorrection: v.heldEditCorrection ?? true });
        any = true;
      }
      if (!any) unreached.push({ case: c.id, arm, why: reachA.length ? 'the lever reaches only the Author, and this case is scored on the persisted Author'
        : (v.authorModel || v.authorEffort) && c.shape === 'value' ? `arm ${arm}'s Author model lever is the config_change_author tier; this value leg's Author is a derivation_architect`
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
  const nodes = gs.cases.filter((c) => nodeVariants.has(c.id)).map((c) => ({
    id: `GOLD-${c.id}`, authorExecutionId: c.authorExecutionId, reviewerExecutionId: c.reviewerExecutionId,
    kind: `golden ${c.class} (${c.domain}) — expect leg ${c.expected.legOutcome}`, variants: nodeVariants.get(c.id)!,
    expect: `${c.expected.legOutcome} (agent ${c.expected.agentApproved ? 'approved' : 'refused'}${c.expected.platformReason ? `, platform ${c.expected.platformReason}` : ''})`,
    why: c.why, n: 1,
  }));
  const report: CompanionReport = { lab: path.basename(labDir), labLabel: lab.label, goldenVersion: gs.version, cells, unreached,
    optedOut: [...optedOut], targets: (d.targets ?? []).map((t) => t.case) };
  const experiment = {
    label: `golden-${gs.version}-${lab.label}`,
    purpose: `GOLDEN COMPANION of ${lab.label} (Protocol 16 § The standing no-regression rule). Each golden case must reproduce its stored outcome under every arm of the lab that reaches it; one flip is DO-NOT-SHIP unless the lab's pre-registration names the case in goldenSet.targets. Read with golden-score. Generated by golden-build — never hand-edited.`,
    n: 1, flags: { ...gs.flags, ...lab.flags },
    baseline: { protocols, templates }, variants, nodes, measures: [],
    goldenCompanion: report,
  };
  fs.writeFileSync(path.join(out, 'experiment.json'), JSON.stringify(experiment, null, 2) + '\n');
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
  status: 'REPRODUCED' | 'FLIPPED' | 'MASKED-TOWARD-APPROVAL' | 'MASKED-TOWARD-REFUSAL' | 'UNSCORED'; direction?: string; target: boolean }

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

export function readGoldenSample(c: GoldenCase, carrierModelled: boolean, s: Record<string, any>, name: string): GoldenSampleRead {
  if (s.error) return { sample: name, agentApproved: null, platformReason: null, legOutcome: null, error: String(s.error) };
  const approved = typeof s.verdict?.approved === 'boolean' ? s.verdict.approved as boolean : null;
  if (approved === null) return { sample: name, agentApproved: null, platformReason: null, legOutcome: null, error: 'no parseable verdict' };
  const reason = samplePlatformReason(c, carrierModelled, s.editApplication ?? null, `lab-${s.node}-${s.variant}-${s.i}-a`);
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

export function goldenVerdict(cells: GoldenCellScore[]): { verdict: 'PASS' | 'DO-NOT-SHIP' | 'INCOMPLETE'; reasons: string[] } {
  const bad = cells.filter((x) => !x.target && (x.status === 'FLIPPED' || x.status === 'MASKED-TOWARD-APPROVAL'));
  const unscored = cells.filter((x) => x.status === 'UNSCORED');
  if (bad.length) return { verdict: 'DO-NOT-SHIP', reasons: bad.map((x) => `${x.case} ${x.cell}: ${x.status} ${x.direction ?? ''}`) };
  if (unscored.length) return { verdict: 'INCOMPLETE', reasons: unscored.map((x) => `${x.case} ${x.cell}: UNSCORED (${x.samples.map((s) => s.error).filter(Boolean).join('; ') || 'no samples'}) — re-run the cell`) };
  return { verdict: 'PASS', reasons: [] };
}

/** Score one or more run folders of a companion. `stored(case)` returns the stored leg's qualityGate (carrier modelled iff it
 *  carries `heldEdit`) and the stored Author's `editApplication` (the fact a PERSISTED-Author sample carries: the lab re-uses the
 *  stored package, so its stamp is the stored one). A live sample's own stamp is its `editApplication.json` (written by the run). */
export function scoreGolden(runDirs: string[], companionDir: string, stored: (c: GoldenCase) => { qualityGate: Record<string, any> | null; editApplication: Record<string, any> | null }, gs: GoldenSet = loadGoldenSet()): { cells: GoldenCellScore[]; unreached: CompanionReport['unreached']; verdict: ReturnType<typeof goldenVerdict> } {
  const exp = JSON.parse(fs.readFileSync(path.join(companionDir, 'experiment.json'), 'utf8'));
  const report = exp.goldenCompanion as CompanionReport;
  if (!report) throw new Error(`${companionDir} is not a golden companion`);
  if (report.goldenVersion !== gs.version) throw new Error(`companion built for golden ${report.goldenVersion}, the set is ${gs.version}`);
  const targets = new Set(report.targets);
  const cells: GoldenCellScore[] = [];
  for (const cell of report.cells) {
    const c = gs.cases.find((x) => x.id === cell.case)!;
    const st = stored(c);
    const carrier = !!st.qualityGate?.heldEdit;
    const reads: GoldenSampleRead[] = [];
    for (const rd of runDirs) {
      const d = path.join(rd, `GOLD-${c.id}`, cell.cell);
      if (!fs.existsSync(d)) continue;
      for (const s of fs.readdirSync(d).filter((x) => x.startsWith('sample-')).sort()) {
        const f = path.join(d, s, 'sample.json');
        if (!fs.existsSync(f)) continue;
        const sample = JSON.parse(fs.readFileSync(f, 'utf8'));
        const eaFile = path.join(d, s, 'editApplication.json');
        const ea = sample.editApplication ?? (fs.existsSync(eaFile) ? JSON.parse(fs.readFileSync(eaFile, 'utf8')).fact : null)
          ?? (cell.form === 'persisted' ? st.editApplication : null);
        reads.push(readGoldenSample(c, carrier, { ...sample, editApplication: ea }, `${path.basename(rd)}/${s}`));
      }
    }
    cells.push({ case: c.id, cell: cell.cell, arm: cell.arm, form: cell.form, expected: c.expected, samples: reads, target: targets.has(c.id), ...classifyCell(c, reads) });
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
