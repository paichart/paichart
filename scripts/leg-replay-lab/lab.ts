#!/usr/bin/env ts-node
/**
 * LEG REPLAY LAB — does a protocol text change lower refusals? Measured offline, without a live program run.
 *
 * For a chosen persisted `config_change_author` execution (a NODE), the lab rebuilds the Author's exact prompt with
 * the platform's own builders, substitutes a CANDIDATE protocol text, calls the real model N times, runs the
 * shipping nets on each package, chains it into the REAL Reviewer prompt (rebuilt the same way), runs the Reviewer,
 * and parses its verdict with the shipping parser. Old and new texts run on the same nodes, so the refusal counts
 * are comparable.
 *
 *   npm run lab:leg-replay -- build-candidates --experiment <dir> [--refresh-baseline]   # pin baseline texts, materialize variants
 *   npm run lab:leg-replay -- fidelity --experiment <dir>                               # rebuild vs what ran; $0
 *   npm run lab:leg-replay -- run --experiment <dir>                                    # DRY RUN (default): prompts + controls + estimate, $0
 *   npm run lab:leg-replay -- run --experiment <dir> --spend [--max-usd 40] [--n 5] [--only O5,O7] [--variants baseline,gap1] [--concurrency 4]
 *   npm run lab:leg-replay -- run --node <authorExecutionId> --protocol-text <file> [--spend]   # ad hoc: one node, one candidate text
 *   npm run lab:leg-replay -- summarize --run <runDir>                                   # re-summarize saved samples, $0
 *   npm run lab:leg-replay -- snapshot (--experiment <dir> | --nodes a,b) [--refresh]      # prefetch / re-fetch node snapshots (read-only), one line each
 *   npm run lab:leg-replay -- score-self-test --experiment <dir>                       # requirements scorer reproduces stage A, $0
 *   npm run lab:leg-replay -- score --run <runDir> --experiment <dir>                  # requirements scores + gate inputs, $0
 *   npm run lab:leg-replay -- blind --run <runDir> --out <dir>                         # arm-blind copies for the hand read, $0
 *   npm run lab:leg-replay -- z49-self-test --experiment <dir>                         # Z49 stanza/row scorer on persisted + planted drafts, $0
 *   npm run lab:leg-replay -- z49-score --run <runDir>[,<runDir>] --experiment <dir>   # Z49 gate inputs (G-STANZA, G-ROW, G-NOWORSE), $0
 *   npm run lab:leg-replay -- g4-self-test --experiment <dir>                          # group 4 scorer on persisted + planted drafts, $0
 *   npm run lab:leg-replay -- g4-score --run <runDir>[,<runDir>] --experiment <dir>    # group 4 gate inputs (G-ITEM, G-SCOPE, G-EMPTY, G-COLL, G-PREMISE, G-NOWORSE), $0
 *   npm run lab:leg-replay -- g4-noworse-dump --experiment <dir> --check-at <c> --out <f>  # P8: G-NOWORSE findings under this tree's code, $0
 *   npm run lab:leg-replay -- quote-self-test --experiment <dir>                       # harvester quote score on persisted + planted harvests, $0
 *
 * DISCIPLINE: dry run unless `--spend`; the cost estimate prints before any call; `--max-usd` stops the run when the
 * running cost would exceed it; every output is saved (rule 8: diff ONE failing case before believing a rate); the
 * run manifest records the code commit, the dirty tracked files, the flags and the sha256 of every input text, and
 * re-checks them at the end (rule 7: know which code produced a number). Production is read-only throughout.
 */
// The platform modules reach lib/prisma.ts transitively. The lab never queries it (the nets use replay-prisma.ts),
// so a dry run needs no database; a placeholder URL makes any accidental real query fail loudly instead.
// lib/prisma.ts connects EAGERLY at import and process.exit(1)s on failure; PAICHART_SKIP_DB_CONNECT is its documented
// opt-out for processes that import it transitively and never query it (2026-07-27).
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://leg-replay-lab:never@127.0.0.1:1/never_connects';
if (!process.env.PAICHART_SKIP_DB_CONNECT) process.env.PAICHART_SKIP_DB_CONNECT = 'true';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { loadSnapshot, fetchProtocolRows, fetchTemplateRows, utc, type Snapshot } from './snapshot';
import { rebuildPrompt, fidelityChecks, parsedResult, persistedSingleCallInput, sha256, templateTextAsRun, type ProtocolText, type RebuiltPrompt } from './rebuild';
import { runAuthorLeafNets, runLegSynthesizeNets, summarizeFacts } from './nets';
import { patchReviewerContext } from './chain';
import type { LiveResult } from './live';
import { storedCallsOf, createRecordedToolServer, recordedToolsReport, isFileCall, type StoredCall } from './recorded-tools';
import { scoreHarvesterQuotes } from './score-quote';
import { findCommitForVersion, protocolTextAtCommit } from './protocol-history';
import { parseReviewerVerdict, locateTerminalVerdict } from '../../lib/agents/harness/parse-verdict';
import { buildExecutionResultJson } from '../../lib/services/execution-artifacts';
import { appendReviewerWarningsSection } from '../../lib/services/report-warnings-section';
import { parseConfidenceScore } from '../../lib/agents/harness/parse-confidence';
import { costForExecution } from '../../lib/services/llm/model-pricing';
import { capabilitiesFor } from '../../lib/services/llm/model-capabilities';
import { isRequirementsFormCheckEligible } from '../../lib/agents/harness/requirements-form-check';
import { computeRequirementsFormCheckStamp, failingTriggerChecks, requirementsInputsFromHarnessRow, REQUIREMENTS_FORM_CORRECTION_FLAG } from '../../lib/agents/harness/requirements-form-correction';
import { harnessRowWithOwnerMap, readOwnerMap } from './score-requirements';
import { applyEdits, type EditSpec } from './edits';
import { snapshotWithInputEdits } from './input-edits';
import { useCheckDataAt, checkDataLabel } from './check-at';
export { applyEdits };

const REPO = path.resolve(__dirname, '..', '..');
const RUNS_DIR = path.join(__dirname, 'runs');

// ───────────────────────────── experiment config ─────────────────────────────

/** `authorPlant` (L0b, 2026-10-08): an EditSpec file (appliesTo `author:<authorExecutionId>`) applied with the same
 *  exactly-once replace ops to the Author package BEFORE the leaf nets and the chain — a planted defect or restatement
 *  on an otherwise real package. A non-unique or missing anchor fails the dry run. */
/** `reviewerExecutionId` (L-R1, 2026-10-09): name the node's reviewer instead of deriving it (the snapshot pairs by the
 *  shipping REVIEWER_ROLES set otherwise). `ownerRowItemMap` (requirements_author): a v1 owner-map JSON file, placed in a
 *  COPY of the harness row's `metadata.requirementsRowItemMap` for the in-run form check only — never in a prompt. */
/** `inputEdits` (L-Z1, 2026-10-10): an EditSpec applied exactly once to each of its targets (`leg:description`,
 *  `author-task:description`, `reviewer-task:description`) on a DEEP COPY of the cached snapshot — what the node's agents
 *  were GIVEN changes, in every variant alike (see input-edits.ts). */
/** `harvesterOnly` + `tools: 'recorded'` (2026-10-13, VERBATIM-QUOTE-OMISSION group C): the node's execution (named in
 *  `authorExecutionId`, the snapshot's subject slot) is a HARVESTER, replayed alone — no Reviewer, no chain — with every
 *  tool call served from its production record (recorded-tools.ts). Scored offline by score-quote.ts. `tools` defaults to
 *  the stub; `recorded` is allowed on any node but only a harvester has calls worth serving. */
interface NodeSpec { id: string; authorExecutionId: string; kind: string; originalVersion?: string; variants: string[]; why?: string; authorPlant?: string; expect?: string; reviewerExecutionId?: string; ownerRowItemMap?: string; n?: number; nByVariant?: Record<string, number>; inputEdits?: string; harvesterOnly?: boolean; tools?: 'stub' | 'recorded' }
interface Measure { name: string; kind: 'count' | 'expected-output-blocks'; regex?: string; flags?: string; contentRegex?: string; lineRegex?: string; why?: string }
interface Experiment {
  label: string; n: number; flags: Record<string, string>;
  baseline: {
    protocols: Record<string, { file: string; version: string; sha256: string }>;
    /** TODAY's template rows, pinned by id (build-candidates fetches them read-only from production). When the node's
     *  Reviewer (or Author) ran on a template listed here, that pinned text is its system base in EVERY variant —
     *  instead of the copy a past pre-fix node froze — and `templateEdits` apply on top of it (L0c, 2026-10-08). */
    templates?: Record<string, { file: string; name: string; role: string; sha256: string }>;
  };
  /** `edits` change the PROTOCOL text (appliesTo: protocol names); `templateEdits` change the role GUIDANCE inside the
   *  frozen template promptTemplate (appliesTo: `role:<agentRole>`) — e.g. the gap-2 qualifier READ.md §6 says must be in
   *  the replayed prompt. Both use the same exactly-once replace ops. */
  /** `authorSource: 'persisted'` (L0a, 2026-10-08): no Author call is made — the persisted package (plus the node's
   *  `authorPlant`, if any) stands in, with its persisted confidence / qualityMetrics / formCheck. $0, no variance:
   *  the Reviewer is the only thing that varies. Default 'live'. */
  /** `requirementsFormCorrection` (L-R3, 2026-10-09): the 2b correction turn ON/OFF for THIS arm, independent of the
   *  process env — so `opusBase` vs `opusLoop` differ only in this lever. Unset ⇒ the env (REQUIREMENTS_FORM_CORRECTION_ENABLED).
   *  Setting it on any arm while `flags` also sets the env is refused (two sources for one lever). */
  /** `requirementsCheckAt` (L-Z2, 2026-10-10): the in-run requirements check (and its scoring) runs on the generated
   *  registry + template data AT THIS COMMIT for this arm; unset ⇒ HEAD's. Groups of different data run one after the
   *  other, never interleaved (check-at.ts). */
  variants: Record<string, { edits: string[]; templateEdits?: string[]; dropTemplateDirective?: boolean; authorModel?: string; reviewerModel?: string; authorEffort?: string; reviewerEffort?: string; authorSource?: 'live' | 'persisted'; requirementsFormCorrection?: boolean; requirementsCheckAt?: string }>;
  nodes: NodeSpec[]; measures: Measure[];
}

/** MODEL OVERRIDE (2026-10-07): a variant may run the Author and/or Reviewer on a different model than the persisted run.
 *  The model is the load-bearing identity in normalizeModelConfig, so it is set on BOTH the rebuilt prompt's `model` and its
 *  `llmConfigSource.model`; capabilitiesFor() is called here so an unknown model fails LOUD in the $0 dry run, not mid-spend.
 *  maxTokens is clamped to the model's ceiling downstream exactly as in production. Every call's served model is recorded
 *  (sample.json calls[].model), and the variant's models are in the run manifest (nodes.<id>.variants.<v>.models). */
export function withModel(p: RebuiltPrompt, model: string | null, effort: string | null = null): RebuiltPrompt {
  if (!model && !effort) return p;
  const m = model ?? p.model;
  const caps = capabilitiesFor(m);
  // EFFORT OVERRIDE (2026-10-07): production's tool loop sends `effort ?? 'high'` for every model, so an unset effort IS
  // high. An override must be a level the model accepts EXACTLY — no silent clamp (clampEffort would turn a typo into a
  // different experiment). Recorded in llmConfigSource.effort, which normalizeModelConfig reads.
  if (effort && !caps.allowedEfforts.includes(effort as any)) throw new Error(`effort "${effort}" is not accepted by ${m} (allowed: ${caps.allowedEfforts.join(', ') || 'none'})`);
  return { ...p, model: m, llmConfigSource: { ...p.llmConfigSource, model: m, ...(effort ? { effort } : {}) } };
}
function effortOf(p: RebuiltPrompt): string { return ((p.llmConfigSource as any)?.effort as string) ?? 'high'; }
function shortModel(m: string | null | undefined): string { return (m ?? '?').replace(/^claude-/, ''); }

function loadExperiment(dir: string): Experiment { return JSON.parse(fs.readFileSync(path.join(dir, 'experiment.json'), 'utf8')); }

function variantFile(exp: Experiment, name: string, variant: string): string {
  const b = exp.baseline.protocols[name];
  return variant === 'baseline' ? b.file : b.file.replace(/\.baseline\.md$/, `.${variant}.md`);
}

/** Pin the baseline texts (from the CURRENT prod rows, read-only) and materialize every variant from its edits. */
function buildCandidates(dir: string, refresh: boolean) {
  const exp = loadExperiment(dir);
  const names = Object.keys(exp.baseline.protocols);
  const missing = names.filter((n) => refresh || !fs.existsSync(path.join(dir, exp.baseline.protocols[n].file)));
  if (missing.length) {
    const rows = fetchProtocolRows(missing);
    for (const n of missing) {
      const row = rows.find((r) => r.name === n);
      if (!row) throw new Error(`${n}: no production row`);
      if (row.version !== exp.baseline.protocols[n].version) throw new Error(`${n}: production is ${row.version}, the experiment pins ${exp.baseline.protocols[n].version} — update the experiment deliberately`);
      fs.mkdirSync(path.dirname(path.join(dir, exp.baseline.protocols[n].file)), { recursive: true });
      fs.writeFileSync(path.join(dir, exp.baseline.protocols[n].file), row.promptText);
      console.log(`  pinned ${n}@${row.version} from the production row (updatedAt ${row.updatedAt})`);
    }
  }
  const manifest: Record<string, unknown> = {};
  for (const n of names) {
    const base = fs.readFileSync(path.join(dir, exp.baseline.protocols[n].file), 'utf8');
    exp.baseline.protocols[n].sha256 = sha256(base);
    manifest[`${n}:baseline`] = { file: exp.baseline.protocols[n].file, sha256: sha256(base), chars: base.length };
    for (const [v, spec] of Object.entries(exp.variants)) {
      if (v === 'baseline') continue;
      const edits: EditSpec[] = spec.edits.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      const { text, applied } = applyEdits(base, edits, n);
      if (!applied.length) continue;
      const f = variantFile(exp, n, v);
      fs.writeFileSync(path.join(dir, f), text);
      manifest[`${n}:${v}`] = { file: f, sha256: sha256(text), chars: text.length, edits: applied, deltaChars: text.length - base.length };
      console.log(`  ${n} ${v}: ${applied.join('+')} → ${f} (+${text.length - base.length} chars)`);
    }
  }
  // Templates (L0c): pin today's rows, then prove every variant's templateEdits apply exactly once to each pinned row
  // of the role they target (the anchors fail HERE, at $0, rather than mid-run).
  const tpls = exp.baseline.templates ?? {};
  const tIds = Object.keys(tpls);
  const tMissing = tIds.filter((id) => refresh || !fs.existsSync(path.join(dir, tpls[id].file)));
  if (tMissing.length) {
    const rows = fetchTemplateRows(tMissing);
    for (const id of tMissing) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`template ${id}: no production row`);
      if (row.name !== tpls[id].name || row.defaultRole !== tpls[id].role) throw new Error(`template ${id}: production is "${row.name}"/${row.defaultRole}, the experiment pins "${tpls[id].name}"/${tpls[id].role}`);
      fs.mkdirSync(path.dirname(path.join(dir, tpls[id].file)), { recursive: true });
      fs.writeFileSync(path.join(dir, tpls[id].file), row.promptTemplate);
      console.log(`  pinned template ${row.name} (${id}) from the production row (updatedAt ${row.updatedAt})`);
    }
  }
  for (const id of tIds) {
    const base = fs.readFileSync(path.join(dir, tpls[id].file), 'utf8');
    tpls[id].sha256 = sha256(base);
    manifest[`template:${id}:baseline`] = { file: tpls[id].file, name: tpls[id].name, sha256: sha256(base), chars: base.length };
    for (const [v, spec] of Object.entries(exp.variants)) {
      if (!spec.templateEdits?.length) continue;
      const edits: EditSpec[] = spec.templateEdits.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      const { text, applied } = applyEdits(base, edits, `role:${tpls[id].role}`);
      if (!applied.length) continue;
      manifest[`template:${id}:${v}`] = { sha256: sha256(text), chars: text.length, edits: applied, deltaChars: text.length - base.length };
      console.log(`  template ${tpls[id].name} ${v}: ${applied.join('+')} (+${text.length - base.length} chars)`);
    }
  }
  // Plants (L0b): each must apply exactly once to its node's persisted package.
  for (const nd of exp.nodes.filter((x) => x.authorPlant)) {
    const r = plantFor(dir, nd, parsedResult(loadSnapshot(nd.authorExecutionId).author)!.finalResponse);
    manifest[`plant:${nd.id}`] = { file: nd.authorPlant, edit: r.editId, sha256: sha256(r.text), deltaChars: r.deltaChars };
    console.log(`  plant ${nd.id}: ${nd.authorPlant} (${r.deltaChars >= 0 ? '+' : ''}${r.deltaChars} chars)`);
  }
  // Input edits (L-Z1): each must apply exactly once to every target it names, on a copy of the snapshot.
  for (const nd of exp.nodes.filter((x) => x.inputEdits)) {
    const r = snapshotWithInputEdits(dir, nd, loadSnapshot(nd.authorExecutionId, { reviewerExecutionId: nd.reviewerExecutionId ?? null })).report!;
    manifest[`inputEdits:${nd.id}`] = r;
    console.log(`  input edit ${nd.id}: ${r.edit} → ${Object.entries(r.targets).map(([t, x]) => `${t} ${x.beforeChars}→${x.afterChars}`).join(' · ')}`);
  }
  // Check data (L-Z2): every pinned commit must resolve and carry the generated data.
  for (const [v, spec] of Object.entries(exp.variants)) {
    if (!spec.requirementsCheckAt) continue;
    const d = useCheckDataAt(spec.requirementsCheckAt);
    useCheckDataAt(null);
    manifest[`requirementsCheckAt:${v}`] = { commit: spec.requirementsCheckAt, ...d };
    console.log(`  ${v}: in-run check data ${d.source} (registry ${d.registrySha256.slice(0, 12)}, template ${d.templateSha256.slice(0, 12)})`);
  }
  fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(exp, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'protocols', 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✅ candidates built; sha256 pinned in experiment.json and protocols/MANIFEST.json`);
}

/** The protocol text a node runs under for a variant. Verifies the pinned sha and re-derives the variant from its edits. */
function protocolFor(exp: Experiment, dir: string, snap: Snapshot, variant: string): ProtocolText {
  const pi = parsedResult(snap.author)?.protocolInjection;
  const name: string | undefined = pi?.delta?.name;
  if (!name) throw new Error(`${snap.author.exec.id}: no persisted protocol binding`);
  if (variant === 'historical') {
    const ver = pi.delta.version;
    const b = exp.baseline.protocols[name];
    if (b && b.version === ver) return { name, version: ver, text: fs.readFileSync(path.join(dir, b.file), 'utf8'), source: `historical=baseline-file@${ver}` };
    const c = findCommitForVersion(name, ver, utc(snap.author.exec.startTime).toISOString());
    if (!c) throw new Error(`historical: no seed commit renders ${name}@${ver} (commits before 88a3939c are not renderable)`);
    return { name, version: ver, text: protocolTextAtCommit(name, c).text, source: `historical=commit:${c.slice(0, 12)}@${ver}` };
  }
  const b = exp.baseline.protocols[name];
  if (!b) throw new Error(`experiment pins no baseline for ${name}`);
  const base = fs.readFileSync(path.join(dir, b.file), 'utf8');
  if (b.sha256 && sha256(base) !== b.sha256) throw new Error(`${b.file}: sha256 differs from the pinned value — the baseline file was edited`);
  if (variant === 'baseline') return { name, version: b.version, text: base, source: `baseline:${b.file}` };
  const spec = exp.variants[variant];
  if (!spec) throw new Error(`no variant ${variant}`);
  const edits: EditSpec[] = spec.edits.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const derived = applyEdits(base, edits, name);
  // A variant whose protocol edits do not target this protocol (or a guidance-only variant) runs the baseline text.
  if (!derived.applied.length) return { name, version: b.version, text: base, source: `${variant}:baseline-text (no protocol edit for ${name})` };
  const f = path.join(dir, variantFile(exp, name, variant));
  if (!fs.existsSync(f)) throw new Error(`${f} missing — run build-candidates`);
  if (fs.readFileSync(f, 'utf8') !== derived.text) throw new Error(`${f} differs from baseline + edits — rebuild candidates (a hand edit to the materialized file is not a candidate)`);
  return { name, version: `${b.version}+${variant}`, text: derived.text, source: `${variant}:${variantFile(exp, name, variant)}` };
}

/** L0b: the node's planted package. The EditSpec must target `author:<authorExecutionId>` and apply exactly once. */
export function plantFor(dir: string, node: Pick<NodeSpec, 'id' | 'authorExecutionId' | 'authorPlant'>, persisted: string): { text: string; editId: string | null; deltaChars: number } {
  if (!node.authorPlant) return { text: persisted, editId: null, deltaChars: 0 };
  const spec: EditSpec = JSON.parse(fs.readFileSync(path.join(dir, node.authorPlant), 'utf8'));
  const r = applyEdits(persisted, [spec], `author:${node.authorExecutionId}`);
  if (!r.applied.length) throw new Error(`${node.id}: plant ${node.authorPlant} does not target author:${node.authorExecutionId}`);
  return { text: r.text, editId: spec.id, deltaChars: r.text.length - persisted.length };
}

/** The pinned template text for a template id, sha-checked (null when the experiment pins none for it). */
function pinnedTemplate(exp: Experiment, dir: string, templateId: string | null | undefined): string | null {
  const t = templateId ? exp.baseline.templates?.[templateId] : undefined;
  if (!t) return null;
  const text = fs.readFileSync(path.join(dir, t.file), 'utf8');
  if (t.sha256 && sha256(text) !== t.sha256) throw new Error(`${t.file}: sha256 differs from the pinned value — the template file was edited`);
  return text;
}

/** The Reviewer's result.json `reviewerVerdict` exactly as production builds it — the SHIPPING builder
 *  (buildExecutionResultJson), so `warnings` / `untranscribedLabelLines` / `evidenceGrading` nest as they do live. */
export function shippingReviewerVerdict(finalResponse: string, role = 'change_reviewer'): Record<string, any> | null {
  const rj = buildExecutionResultJson({
    taskId: 'lab', taskTitle: 'lab', agentRole: role, modelUsed: 'lab', finalResponse, confidenceScore: null,
    turnCount: 0, maxToolTurns: 1, toolCallResults: [], successfulToolCalls: 0, failedToolCalls: 0,
    executionTime: 0, tokensUsed: 0, correctionTurnUsed: false,
  } as any);
  return (rj.reviewerVerdict as Record<string, any>) ?? null;
}

/** The Author's stamped result as the chainer would carry it, for a PERSISTED package (L0a), optionally planted. */
function persistedAuthorResult(snap: Snapshot, text: string, leafStamped: Record<string, Record<string, unknown>>) {
  const ares = parsedResult(snap.author)!;
  const qm = ares.qualityMetrics ? { ...ares.qualityMetrics, responseLength: text.length } : null;
  return {
    finalResponse: text, confidenceScore: ares.confidenceScore ?? null, qualityMetrics: qm,
    markerPresence: leafStamped.markerPresence ?? null, rollbackContainment: leafStamped.rollbackContainment ?? null, derivationContainment: null,
    toolLoop: { formCheck: ares.toolLoop?.formCheck ?? null },
  };
}

// ───────────────────────────── reviewer warning measures (L0e, 2026-10-08) ─────────────────────────────

const LABEL_LINE = /NON-BLOCKING WARNING \(/;
/** Per-sample LEXICAL measures on the Reviewer's output for WARNINGS-INVISIBLE batch 2 (BATCH2-DRAFT §10.1 L0e).
 *  Facts about the text, never a verdict; every count names samples to READ. */
export function reviewerWarningMeasures(text: string, rv: Record<string, any> | null) {
  const lines = text.split('\n');
  const count = (re: RegExp) => lines.filter((l) => re.test(l)).length;
  const warnings: Array<{ id: string; text: string }> = Array.isArray(rv?.warnings) ? rv!.warnings : [];
  const blocking: string[] = Array.isArray(rv?.blocking) ? rv!.blocking : [];
  const term = locateTerminalVerdict(text);
  const body = term ? text.slice(0, term.index) : text;
  const IP = '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}';
  // Own enumeration proxy: an address range/span written out (a.b.c.d – a.b.c.d, or .N–.M), or one line naming ≥ 3
  // distinct IPv4 addresses (a member set). A proxy for "the reviewer built its own span" — read, never believe.
  const rangeRe = new RegExp(`${IP}(?:/\\d{1,2})?\\s*(?:–|—|-|to|through|\\.\\.)\\s*(?:${IP}|\\.\\d{1,3}\\b)|\\.\\d{1,3}\\s*(?:–|—)\\s*\\.\\d{1,3}\\b`);
  const ownEnumeration = body.split('\n').filter((l) => rangeRe.test(l) || new Set(l.match(new RegExp(IP, 'g')) ?? []).size >= 3).length;
  const restated = warnings.filter((w) => w.id === 'restated-conclusion');
  // D7 (arch M3) — hand read only: does the warning attribute the claim to the package, or restate it as the reviewer's own?
  const attribution = restated.map((w) => ({
    text: w.text,
    attribution: /\b(the package|the author|package['’]s|author['’]s)\b|\b(package|author)\b.{0,60}\b(states?|stated|restat\w*|says|claims?|asserts?|gloss\w*|writes|repeats?)\b/i.test(w.text) ? 'attributes-to-package' : 'unattributed',
  }));
  return {
    restatedLabel: count(/^NON-BLOCKING WARNING \(restated-conclusion\):/),
    reachLabel: count(/^NON-BLOCKING WARNING \(reachability-after-suppression\):/),
    restatedTranscribed: restated.length,
    reachTranscribed: warnings.filter((w) => w.id === 'reachability-after-suppression').length,
    otherTranscribed: warnings.filter((w) => w.id !== 'restated-conclusion' && w.id !== 'reachability-after-suppression').map((w) => w.id),
    labelInBlocking: blocking.filter((b) => /^\W*NON-BLOCKING WARNING/.test(b)).length,
    negatedLabel: lines.filter((l) => LABEL_LINE.test(l) && /\bnone\b|no restat|does not apply|not applicable|not warranted|no warning|\bno\b\W{0,3}NON-BLOCKING WARNING/i.test(l)).length,
    untranscribedLabelLines: typeof rv?.untranscribedLabelLines === 'number' ? rv!.untranscribedLabelLines : null,
    ownEnumeration,
    attribution,
    // Blocking-item proxies for D2 / D6 / H1 — READ each flagged sample.
    blockingOnlyRestatement: rv?.approved === false && blocking.length > 0 && blocking.every((b) => /restat|self-?verif|self-?assess|self-?grad|certif|narrative|gloss|conclusion/i.test(b)),
    blockingNamesMissingStep: blocking.some((b) => /acceptance check|no (?:validation )?step|missing (?:a )?(?:validation )?step|not proven|unproven|no step proves|validation step/i.test(b)),
    blockingSelfGradeWords: blocking.some((b) => /self-?verif|verification table|\btable\b/i.test(b)),
  };
}

/** §10.4 P-REACH pass, per sample: exactly one reach line → transcribed → leg fact registered → section line, no prefix. */
export function reachChainPass(m: ReturnType<typeof reviewerWarningMeasures>, legFact: Record<string, any> | null, section: string): boolean {
  const reg = (legFact?.reviewers ?? []).some((r: any) => (r.warnings ?? []).some((w: any) => w.id === 'reachability-after-suppression' && w.registered === true));
  return m.reachLabel === 1 && m.reachTranscribed === 1 && m.labelInBlocking === 0 && (legFact?.count ?? 0) >= 1 && reg
    && section.includes('- reachability-after-suppression — ') && !section.includes('NON-BLOCKING WARNING (');
}

// ───────────────────────────── measures, grouping ─────────────────────────────

export function computeMeasures(text: string, measures: Measure[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of measures) {
    if (m.kind === 'count') out[m.name] = (text.match(new RegExp(m.regex!, m.flags?.includes('g') ? m.flags : `${m.flags ?? ''}g`)) ?? []).length;
    else {
      const content = new RegExp(m.contentRegex!, 'im');
      let n = 0;
      // Fenced blocks introduced within 3 lines of an "Expected output/result" label.
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/^\s*```/.test(lines[i])) continue;
        let j = i + 1; while (j < lines.length && !/^\s*```/.test(lines[j])) j++;
        const label = lines.slice(Math.max(0, i - 3), i).join('\n');
        if (/expected\s+(output|result)/i.test(label) && content.test(lines.slice(i + 1, j).join('\n'))) n++;
        i = j;
      }
      if (m.lineRegex) n += (text.match(new RegExp(m.lineRegex, 'gi')) ?? []).length;
      out[m.name] = n;
    }
  }
  return out;
}

/** LAB HEURISTIC, labelled as such: groups blocking items by subject for the summary. Items are saved verbatim. */
// Order is precedence. Calibrated on the 7 persisted verdicts of the 2026-10-07 nodes (each lands where READ.md §1 puts it:
// O1 self-comparison, O4 access-control coverage, O5/O7 validation form); a NEW item may land wrong — read the verbatim list.
export const BLOCKING_GROUPS: Array<[string, RegExp]> = [
  ['machine-parsed-block', /Consumed Values|Derived Values|Harvested Allocations|machine-parsed/i],
  ['self-comparison', /self-comparison|tautolog|can never fail|compares? .{0,40}(with|to) (a copy of )?itself/i],
  ['access-control-coverage', /admitted[- ]sender|denied[- ]sender|admitted (and|\/) denied|\badmitted\b.{0,60}\bprobe|negative probe|per (granted )?(port|listener)/i],
  ['validation-form', /expected output|literal|prose|presence|comparison shape|describ|character-for-character|quotable|PASS|FAIL|validation step/i],
  ['rollback', /rollback|restore/i],
  ['provenance-evidence', /harvest|evidence|unsourced|provenance|source/i],
];
export function groupOf(item: string): string {
  for (const [g, re] of BLOCKING_GROUPS) if (re.test(item)) return g;
  return 'other';
}

// ───────────────────────────── estimate ─────────────────────────────

/** Tokens-per-char measured on this node where the persisted execution was one LLM call; else the lab default. */
const DEFAULT_CHARS_PER_TOKEN = 2.67; // measured 2026-10-07: O7 author 154,104 prompt chars / 57,689 tokens
function promptChars(p: RebuiltPrompt) { return p.system.length + p.user.length + JSON.stringify(p.tools).length; }

function estimateCall(p: RebuiltPrompt, outTokens: number, charsPerToken: number, cached: boolean, model: string) {
  const inTok = Math.round(promptChars(p) / charsPerToken);
  const prefix = Math.round((p.system.length + JSON.stringify(p.tools).length) / charsPerToken);
  const tokens = cached
    ? { inputTokens: inTok - prefix, cacheReadTokens: prefix, cacheCreationTokens: 0, outputTokens: outTokens }
    : { inputTokens: inTok - prefix, cacheReadTokens: 0, cacheCreationTokens: prefix, outputTokens: outTokens };
  return { inTok, cost: costForExecution(tokens, model, new Date()).costUsd ?? 0 };
}

// ───────────────────────────── manifest (rule 7) ─────────────────────────────

function codeState() {
  const head = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD']).toString().trim();
  const dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--', 'lib', 'scripts', 'prisma']).toString()
    .split('\n').filter(Boolean).filter((l) => !l.includes('scripts/leg-replay-lab/') && !l.includes('scripts/test-leg-replay-lab.ts'));
  const dirtyHashes: Record<string, string> = {};
  for (const l of dirty) {
    const f = l.slice(3).trim();
    try { dirtyHashes[f] = sha256(fs.readFileSync(path.join(REPO, f), 'utf8')); } catch { dirtyHashes[f] = 'unreadable'; }
  }
  return { head, dirty: dirtyHashes };
}

// ───────────────────────────── run ─────────────────────────────

interface PersistedAuthor { text: string; plantId: string | null; chainExecutionId: string; leafStamped: Record<string, Record<string, unknown>>; reviewer: RebuiltPrompt }
interface Job { node: NodeSpec; variant: string; protocol: ProtocolText; snap: Snapshot; author: RebuiltPrompt; reviewerBase: RebuiltPrompt | null; reviewerTemplate: string | null; dropTemplateDirective: boolean; reviewerModel: string | null; reviewerEffort: string | null;
  /** L0a: set when the variant's authorSource is 'persisted' — the package, its leaf stamps and the exact Reviewer prompt. */
  persistedAuthor: PersistedAuthor | null;
  /** L-R3: the arm's correction flag (null ⇒ the env decides). */
  requirementsFormCorrection: boolean | null;
  /** The harness row the in-run requirements check reads (the node's owner map placed in a copy); null for other roles. */
  requirementsHarnessRow: Record<string, any> | null;
  /** L-Z2: the commit whose in-run check data this arm runs (null ⇒ HEAD's). */
  checkAt: string | null;
  /** Recorded tools: the node's production calls (null ⇒ the stub). */
  stored: StoredCall[] | null }

async function prepare(exp: Experiment, dir: string, nodes: NodeSpec[], variants: string[] | null, out: string, protocolOverride?: ProtocolText) {
  const jobs: Job[] = [];
  const nodeReports: Record<string, any> = {};
  for (const node of nodes) {
    if (node.harvesterOnly) {
      const h = await prepareHarvester(exp, dir, node, variants, out);
      jobs.push(...h.jobs); nodeReports[node.id] = h.report;
      continue;
    }
    const { snap, report: inputEditReport } = snapshotWithInputEdits(dir, node, loadSnapshot(node.authorExecutionId, { reviewerExecutionId: node.reviewerExecutionId ?? null }));
    if (!snap.reviewer) throw new Error(`${node.id}: no reviewer execution reviewed this author execution`);
    const nodeDir = path.join(out, node.id);
    fs.mkdirSync(nodeDir, { recursive: true });

    // ── CONTROL PASS, $0: the PERSISTED Author package through the shipping nets, the chain patch and the Reviewer
    //    rebuild; the PERSISTED Reviewer output through the shipping parser. Each step is compared with what ran.
    const ares = parsedResult(snap.author)!;
    const rres = parsedResult(snap.reviewer)!;
    const leaf = await runAuthorLeafNets(snap, ares.agentRole, ares.finalResponse, snap.author.exec.id);
    // L-R2 (2026-10-09): a net that does not APPLY to this role (markerPresence / rollbackContainment exclude ^requirements_)
    // and that production did not stamp either is a PASS, reported as n/a — not a mismatch and not a silent null===null.
    // E1 (2026-10-13 02:56:30Z, VERBATIM-QUOTE-OMISSION): every checked rollbackContainment stamp gains `witness`, and its
    // witness became the harvest's RAW tool results. A persisted stamp WITHOUT `witness` predates the cut: it is compared
    // with `witness` set aside, and a count that moved is a by-construction E1 move (BUILD-A-E.md §4), reported by name.
    const e1Strip = (k: string, f: any) => (k === 'rollbackContainment' && f && ares[k] && !('witness' in ares[k]) ? (({ witness, ...rest }: any) => rest)(f) : f);
    const factEq = (k: string) => JSON.stringify(e1Strip(k, leaf.stamped[k]) ?? null) === JSON.stringify(ares[k] ?? null);
    const leafNa = (k: string) => leaf.notApplicable.includes(k) && ares[k] == null && leaf.stamped[k] == null;
    const identityCtx = patchReviewerContext(snap, {
      executionId: snap.author.exec.id, finalResponse: ares.finalResponse, confidenceScore: ares.confidenceScore ?? null,
      qualityMetrics: ares.qualityMetrics ?? null, markerPresence: ares.markerPresence ?? null,
      rollbackContainment: ares.rollbackContainment ?? null, derivationContainment: ares.derivationContainment ?? null,
    });
    const rv = parseReviewerVerdict(rres.finalResponse);
    const persistedVerdict = rres.reviewerVerdict ?? null;
    const anyProtocol = protocolOverride ?? protocolFor(exp, dir, snap, node.variants[0]); // identity is protocol-independent
    const rFrozen = await rebuildPrompt(snap, 'reviewer', anyProtocol);
    const rPatched = await rebuildPrompt(snap, 'reviewer', anyProtocol, { inputContextOverride: identityCtx });
    // L0d control: the leg-synthesize reviewerWarnings net COMPUTES through replay-prisma (its fact, not its errorFact),
    // fed the persisted Author and the persisted Reviewer text with its verdict rebuilt by the SHIPPING builder.
    const ctlVerdict = shippingReviewerVerdict(rres.finalResponse, rres.agentRole ?? 'change_reviewer');
    const ctlLeg = await runLegSynthesizeNets(snap, [
      { taskId: snap.author.task.id, executionId: 'lab-control-a', resultJson: { finalResponse: ares.finalResponse } },
      { taskId: snap.reviewer.task.id, executionId: 'lab-control-r', resultJson: { finalResponse: rres.finalResponse, reviewerVerdict: ctlVerdict } },
    ]);
    const rwFact = (ctlLeg?.stamped.reviewerWarnings ?? null) as Record<string, any> | null;
    const rwNa = !!ctlLeg && ctlLeg.notApplicable.includes('reviewerWarnings') && !rwFact && (snap.leg?.metadata?.reviewerWarnings ?? null) == null;
    const rwOk = rwNa || (!!rwFact && !ctlLeg!.errors.reviewerWarnings && rwFact.reason !== 'enrichment-error' && rwFact.checked === true);
    // requirements_author: the in-run form check computes on the PERSISTED draft with the node's inputs (objective from
    // the harness row, owner map when the node names one) — the same stamp a live sample gets.
    const reqRow = isRequirementsFormCheckEligible(ares.agentRole, snap.author.task.type) ? harnessRowWithOwnerMap(snap, readOwnerMap(dir, node.ownerRowItemMap)) : null;
    let reqControl: Record<string, any> | null = null;
    if (reqRow) {
      const inputs = requirementsInputsFromHarnessRow(reqRow);
      const st: any = computeRequirementsFormCheckStamp({ text: ares.finalResponse, stopReason: 'end_turn', textSource: 'loop', inputs });
      const wantMap = node.ownerRowItemMap ? 'present' : 'absent';
      reqControl = { ok: st.checked === true && inputs.objectiveResolved && st.inputs.ownerRowItemMap === wantMap && st.clauses?.itemMapSource === (node.ownerRowItemMap ? 'owner-map' : 'draft-citations'),
        ownerRowItemMap: st.inputs.ownerRowItemMap, itemMapSource: st.clauses?.itemMapSource ?? null, objectiveChars: st.inputs.objectiveChars,
        persistedDraft: { view: st.size?.programViewDelivered ?? null, failing: st.checked ? failingTriggerChecks(st) : ['not-checked'] } };
    }
    if (rwFact) fs.writeFileSync(path.join(nodeDir, 'control.report-section.md'), appendReviewerWarningsSection('', rwFact).content);
    // L0b: the planted package (identity when the node has no plant).
    const plant = plantFor(dir, node, ares.finalResponse);
    if (plant.editId) fs.writeFileSync(path.join(nodeDir, 'planted.author.md'), plant.text);
    nodeReports[node.id] = {
      authorExecutionId: snap.author.exec.id, reviewerExecutionId: snap.reviewer.exec.id, kind: node.kind,
      persisted: { approved: persistedVerdict?.approved ?? null, blocking: persistedVerdict?.blocking ?? null, authorOutputTokens: snap.author.exec.outputTokens, reviewerOutputTokens: snap.reviewer.exec.outputTokens },
      controls: {
        leafNetsReproducePersisted: { markerPresence: factEq('markerPresence'), rollbackContainment: factEq('rollbackContainment'), errors: leaf.errors,
          rollbackContainmentPreE1: !!ares.rollbackContainment && !('witness' in ares.rollbackContainment),
          notApplicable: ['markerPresence', 'rollbackContainment'].filter(leafNa) },
        chainPatchIdentity: rFrozen.user === rPatched.user,
        shippingParserReproducesPersistedVerdict: !!rv && !!persistedVerdict && rv.approved === persistedVerdict.approved && JSON.stringify(rv.blocking) === JSON.stringify(persistedVerdict.blocking),
        legReviewerWarningsComputes: rwOk,
        legReviewerWarningsNotApplicable: rwNa,
        requirementsFormCheckComputes: reqControl,
      },
      legReviewerWarningsControl: { fact: rwFact ? { checked: rwFact.checked, reason: rwFact.reason, renderScope: rwFact.renderScope, count: rwFact.count, ids: rwFact.ids } : null, error: ctlLeg?.errors.reviewerWarnings ?? null, otherLegNetErrors: ctlLeg ? Object.keys(ctlLeg.errors).filter((k) => k !== 'reviewerWarnings') : null },
      plant: plant.editId ? { file: node.authorPlant, edit: plant.editId, deltaChars: plant.deltaChars, sha256: sha256(plant.text) } : null,
      inputEdits: inputEditReport ? { ...inputEditReport, sha256: sha256(fs.readFileSync(path.join(dir, inputEditReport.file), 'utf8')),
        approximation: 'the harness is not replayed: the edit writes into each child brief what the harness transcribes there' } : null,
      measuresOnPersisted: computeMeasures(ares.finalResponse, exp.measures),
      variants: {},
    };
    fs.writeFileSync(path.join(nodeDir, 'persisted.author.md'), ares.finalResponse);
    fs.writeFileSync(path.join(nodeDir, 'persisted.reviewer.md'), rres.finalResponse);

    // ── per variant: the Author prompt (saved) and the Reviewer's system prompt under that text ──
    // `historical` (the text the node ORIGINALLY ran under) is available to every node on request: it is the
    // reproduction check — does the lab, under the original text, refuse at the rate production did?
    const wanted = protocolOverride ? ['custom']
      : [...node.variants, ...(variants?.includes('historical') ? ['historical'] : [])].filter((x) => !variants || variants.includes(x));
    for (const v of wanted) {
      let protocol: ProtocolText;
      try { protocol = protocolOverride ?? protocolFor(exp, dir, snap, v); }
      catch (e) { if (v !== 'historical') throw e; nodeReports[node.id].variants[v] = { skipped: (e as Error).message }; console.log(`   · ${node.id} historical skipped — ${(e as Error).message}`); continue; }
      if (v === 'historical' && node.variants.includes('baseline') && sha256(protocol.text) === sha256(protocolFor(exp, dir, snap, 'baseline').text)) {
        nodeReports[node.id].variants[v] = { skipped: 'identical to baseline (the node ran under the pinned baseline text) — read its baseline row' };
        console.log(`   · ${node.id} historical skipped — identical to baseline`); continue;
      }
      const tplFor = (which: 'author' | 'reviewer') => {
        const files = exp.variants[v]?.templateEdits ?? [];
        const b = which === 'author' ? snap.author : snap.reviewer!;
        // L0c: a template pinned in the experiment (today's prod row) is the base in every variant, edited or not.
        const pinned = pinnedTemplate(exp, dir, b.template?.id);
        if (!files.length) return pinned;
        const role = parsedResult(b)?.agentRole ?? b.exec.config?.agentRole;
        const edits: EditSpec[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
        const r = applyEdits(pinned ?? templateTextAsRun(b), edits, `role:${role}`); // never an own-prompt task's directive
        return r.applied.length ? r.text : pinned;
      };
      const authorTemplate = tplFor('author');
      const reviewerTemplate = tplFor('reviewer');
      const armFlag = exp.variants[v]?.requirementsFormCorrection;
      if (typeof armFlag === 'boolean' && exp.flags?.[REQUIREMENTS_FORM_CORRECTION_FLAG] !== undefined) {
        throw new Error(`variant ${v} sets requirementsFormCorrection while experiment.flags sets ${REQUIREMENTS_FORM_CORRECTION_FLAG} — one lever, two sources; remove the flag`);
      }
      const checkAt = exp.variants[v]?.requirementsCheckAt ?? null;
      const authorModel = exp.variants[v]?.authorModel ?? null;
      const reviewerModel = exp.variants[v]?.reviewerModel ?? null;
      const authorEffort = exp.variants[v]?.authorEffort ?? null;
      const reviewerEffort = exp.variants[v]?.reviewerEffort ?? null;
      const author = withModel(await rebuildPrompt(snap, 'author', protocol, { templatePromptOverride: authorTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective }), authorModel, authorEffort);
      const reviewerBase = withModel(await rebuildPrompt(snap, 'reviewer', protocol, { templatePromptOverride: reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective }), reviewerModel, reviewerEffort);
      const vd = path.join(nodeDir, v);
      fs.mkdirSync(vd, { recursive: true });
      fs.writeFileSync(path.join(vd, 'author.system.md'), author.system);
      fs.writeFileSync(path.join(vd, 'author.user.md'), author.user);
      fs.writeFileSync(path.join(vd, 'reviewer.system.md'), reviewerBase.system);
      fs.writeFileSync(path.join(vd, 'protocol.md'), protocol.text);
      const fid = fidelityChecks(snap, 'author', author);
      nodeReports[node.id].variants[v] = {
        protocol: { name: protocol.name, version: protocol.version, source: protocol.source, sha256: sha256(protocol.text) },
        models: { author: author.model, reviewer: reviewerBase.model, authorEffort: effortOf(author), reviewerEffort: effortOf(reviewerBase), authorOverridden: !!(authorModel || authorEffort), reviewerOverridden: !!(reviewerModel || reviewerEffort) },
        authorPromptSha: author.hashes, reviewerSystemSha: reviewerBase.hashes.system,
        authorPreambleChars: author.fact.preambleChars, persistedPreambleChars: ares.protocolInjection?.preambleChars ?? null,
        fidelityFailures: fid.filter((c) => c.ok === false && c.name !== 'protocolInjection.preambleChars' && c.name !== 'protocolInjection.delta').map((c) => `${c.name}: ${c.detail}`),
        notes: author.notes,
        ...(reqRow ? { requirementsFormCorrection: typeof armFlag === 'boolean' ? `arm:${armFlag ? 'on' : 'off'}` : `env:${process.env[REQUIREMENTS_FORM_CORRECTION_FLAG] === 'true' ? 'on' : 'off'}`,
          ownerRowItemMap: node.ownerRowItemMap ? { file: node.ownerRowItemMap, sha256: sha256(fs.readFileSync(path.join(dir, node.ownerRowItemMap), 'utf8')) } : null,
          requirementsCheck: checkDataLabel(checkAt) } : {}),
      };
      if (authorTemplate) fs.writeFileSync(path.join(vd, 'author.template.md'), authorTemplate);
      if (reviewerTemplate) fs.writeFileSync(path.join(vd, 'reviewer.template.md'), reviewerTemplate);
      nodeReports[node.id].variants[v].templateOverride = { author: authorTemplate ? sha256(authorTemplate) : null, reviewer: reviewerTemplate ? sha256(reviewerTemplate) : null };
      // L0a: a persisted Author is deterministic, so the Reviewer's EXACT prompt (package, leaf stamps, chain) is built
      // here at $0 and saved — the dry run shows the very bytes a --spend run sends.
      let persistedAuthor: PersistedAuthor | null = null;
      if (exp.variants[v]?.authorSource === 'persisted') {
        const chainExecutionId = plant.editId ? `lab-${node.id}-plant-a` : snap.author.exec.id;
        const leafP = await runAuthorLeafNets(snap, ares.agentRole, plant.text, chainExecutionId);
        const ctx = patchReviewerContext(snap, { executionId: chainExecutionId, ...persistedAuthorResult(snap, plant.text, leafP.stamped) } as any);
        const reviewer = withModel(await rebuildPrompt(snap, 'reviewer', protocol, { inputContextOverride: ctx, templatePromptOverride: reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective }), reviewerModel, reviewerEffort);
        fs.writeFileSync(path.join(vd, 'reviewer.user.md'), reviewer.user);
        persistedAuthor = { text: plant.text, plantId: plant.editId, chainExecutionId, leafStamped: leafP.stamped, reviewer };
        nodeReports[node.id].variants[v].authorSource = { source: 'persisted', plant: plant.editId, leafFacts: summarizeFacts(leafP.stamped), leafNetErrors: leafP.errors, reviewerPromptSha: reviewer.hashes };
      }
      jobs.push({ node, variant: v, protocol, snap, author, reviewerBase, reviewerTemplate, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective, reviewerModel, reviewerEffort, persistedAuthor,
        requirementsFormCorrection: typeof armFlag === 'boolean' ? armFlag : null, requirementsHarnessRow: reqRow, checkAt,
        stored: node.tools === 'recorded' ? storedCallsOf(snap.author) : null });
    }
  }
  return { jobs, nodeReports };
}

/**
 * A HARVESTER node (2026-10-13): no Reviewer, no chain. CONTROL PASS, $0: the persisted harvest through the SHIPPING
 * leaf nets with its persisted tool calls — `quoteFidelity` (harvest point) must compute (checked, no enrichment error)
 * and the lab's quote score must read the persisted harvest. The record a recorded-tools sample is served from is
 * summarised (calls, file calls, any persist-truncated result, which cannot be served).
 */
async function prepareHarvester(exp: Experiment, dir: string, node: NodeSpec, variants: string[] | null, out: string): Promise<{ jobs: Job[]; report: Record<string, any> }> {
  if (node.authorPlant || node.inputEdits || node.reviewerExecutionId || node.ownerRowItemMap) throw new Error(`${node.id}: a harvesterOnly node takes no plant, input edit, reviewer or owner map`);
  const snap = loadSnapshot(node.authorExecutionId);
  const ares = parsedResult(snap.author)!;
  if (!/harvester$/.test(ares.agentRole ?? '')) throw new Error(`${node.id}: harvesterOnly, but ${node.authorExecutionId} ran as ${ares.agentRole}`);
  const nodeDir = path.join(out, node.id);
  fs.mkdirSync(nodeDir, { recursive: true });
  const stored = storedCallsOf(snap.author);
  const leaf = await runAuthorLeafNets(snap, ares.agentRole, ares.finalResponse, snap.author.exec.id, ares.toolCalls ?? []);
  const qf = (leaf.stamped.quoteFidelity ?? null) as Record<string, any> | null;
  const score = scoreHarvesterQuotes(ares.finalResponse, ares.toolCalls ?? []);
  fs.writeFileSync(path.join(nodeDir, 'persisted.harvester.md'), ares.finalResponse);
  const report: Record<string, any> = {
    authorExecutionId: snap.author.exec.id, reviewerExecutionId: null, kind: node.kind, harvesterOnly: true, tools: node.tools ?? 'stub',
    persisted: { approved: null, blocking: null, authorOutputTokens: snap.author.exec.outputTokens, reviewerOutputTokens: null, chars: ares.finalResponse.length, stopReason: ares.toolLoop?.finalStopReason ?? null },
    controls: {
      leafNetsReproducePersisted: { markerPresence: JSON.stringify(leaf.stamped.markerPresence ?? null) === JSON.stringify(ares.markerPresence ?? null), rollbackContainment: true, errors: leaf.errors, notApplicable: leaf.notApplicable },
      quoteFidelityComputes: !!qf && qf.checked === true && !leaf.errors.quoteFidelity,
      // No Reviewer and no chain on a harvester node: those controls do not exist here (null, never a borrowed ✓).
      chainPatchIdentity: null, shippingParserReproducesPersistedVerdict: null, legReviewerWarningsComputes: null, legReviewerWarningsNotApplicable: null, requirementsFormCheckComputes: null,
    },
    persistedQuoteFidelity: qf ? { reason: qf.reason, disposition: qf.quoteFidelityDisposition?.disposition, blocks: qf.blocks, lanes: qf.lanes, claims: qf.claims } : null,
    persistedQuoteScore: { ...score, blocks: score.blocks.filter((b) => b.tool) },
    record: { calls: stored.length, fileCalls: stored.filter((c) => isFileCall(c.tool, c.args)).length, truncatedAtPersist: stored.filter((c) => c.truncatedAtPersist).length, failed: stored.filter((c) => !c.success).length },
    measuresOnPersisted: computeMeasures(ares.finalResponse, exp.measures),
    variants: {},
  };
  const jobs: Job[] = [];
  for (const v of node.variants.filter((x) => !variants || variants.includes(x))) {
    const protocol = protocolFor(exp, dir, snap, v);
    if (exp.variants[v]?.templateEdits?.length || exp.variants[v]?.authorSource === 'persisted' || exp.variants[v]?.reviewerModel) throw new Error(`${node.id}/${v}: a harvester node takes protocol edits and an authorModel/authorEffort only`);
    const author = withModel(await rebuildPrompt(snap, 'author', protocol, { templatePromptOverride: pinnedTemplate(exp, dir, snap.author.template?.id), dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective }),
      exp.variants[v]?.authorModel ?? null, exp.variants[v]?.authorEffort ?? null);
    const vd = path.join(nodeDir, v);
    fs.mkdirSync(vd, { recursive: true });
    fs.writeFileSync(path.join(vd, 'author.system.md'), author.system);
    fs.writeFileSync(path.join(vd, 'author.user.md'), author.user);
    fs.writeFileSync(path.join(vd, 'protocol.md'), protocol.text);
    const fid = fidelityChecks(snap, 'author', author);
    report.variants[v] = {
      protocol: { name: protocol.name, version: protocol.version, source: protocol.source, sha256: sha256(protocol.text) },
      models: { author: author.model, reviewer: null, authorEffort: effortOf(author), reviewerEffort: null, authorOverridden: !!(exp.variants[v]?.authorModel || exp.variants[v]?.authorEffort), reviewerOverridden: false },
      authorPromptSha: author.hashes, reviewerSystemSha: null,
      authorPreambleChars: author.fact.preambleChars, persistedPreambleChars: ares.protocolInjection?.preambleChars ?? null,
      fidelityFailures: fid.filter((c) => c.ok === false && c.name !== 'protocolInjection.preambleChars' && c.name !== 'protocolInjection.delta').map((c) => `${c.name}: ${c.detail}`),
      notes: author.notes,
    };
    jobs.push({ node, variant: v, protocol, snap, author, reviewerBase: null, reviewerTemplate: null, dropTemplateDirective: !!exp.variants[v]?.dropTemplateDirective, reviewerModel: null, reviewerEffort: null,
      persistedAuthor: null, requirementsFormCorrection: null, requirementsHarnessRow: null, checkAt: exp.variants[v]?.requirementsCheckAt ?? null,
      stored: node.tools === 'recorded' ? stored : null });
  }
  return { jobs, report };
}

function estimate(jobs: Job[], defaultN: number, nOverride?: number) {
  let upper = 0; let expected = 0; let calls = 0;
  const rows: string[] = [];
  const cptByNode = new Map<string, number>();
  for (const j of jobs) {
    // Calibrated ONCE per node, on its first job's prompt, against the persisted single-call token count (when the
    // persisted execution was one call) — so a variant's longer text shows up as more tokens, not as the same number.
    if (!cptByNode.has(j.node.id)) {
      const single = persistedSingleCallInput(j.snap.author);
      cptByNode.set(j.node.id, single ? promptChars(j.author) / single : DEFAULT_CHARS_PER_TOKEN);
    }
    const cpt = cptByNode.get(j.node.id)!;
    const n = nOverride ?? j.node.nByVariant?.[j.variant] ?? j.node.n ?? defaultN;
    const aOut = j.snap.author.exec.outputTokens ?? 12000;
    if (!j.reviewerBase) {
      // A harvester node: one role, MANY turns (its calls are served). The single-call formula would undershoot by the
      // turn count, so the estimate is the PERSISTED execution's own token mix priced on the arm's model — per sample.
      const e = j.snap.author.exec;
      const per = costForExecution({ inputTokens: e.inputTokens ?? 0, outputTokens: e.outputTokens ?? aOut, cacheReadTokens: e.cacheReadTokens ?? 0, cacheCreationTokens: e.cacheCreationTokens ?? 0 }, j.author.model, new Date()).costUsd ?? 0;
      const n = nOverride ?? j.node.nByVariant?.[j.variant] ?? j.node.n ?? defaultN;
      upper += n * per; expected += n * per; calls += n * Math.max(1, (parsedResult(j.snap.author)?.toolLoop?.totalTurns ?? 0) + 1);
      rows.push(`  ${j.node.id.padEnd(7)} ${j.variant.padEnd(9)} harvester[${shortModel(j.author.model)}/${effortOf(j.author)}, tools ${j.stored ? `recorded (${j.stored.length} stored calls)` : 'stub'}] persisted mix ${e.inputTokens ?? 0} in/${e.cacheCreationTokens ?? 0} write/${e.cacheReadTokens ?? 0} read/${e.outputTokens ?? 0} out · ${n}× ≈ $${(n * per).toFixed(2)}`);
      continue;
    }
    const rOut = j.snap.reviewer!.exec.outputTokens ?? 6000;
    // The Reviewer prompt grows by the replayed package; use the persisted package size as the expectation.
    // L0a: a persisted Author costs nothing, and the Reviewer's exact prompt (package included) is already built.
    const zero = { inTok: 0, cost: 0 };
    const rp = j.persistedAuthor?.reviewer ?? j.reviewerBase!;
    const aFirst = j.persistedAuthor ? zero : estimateCall(j.author, aOut, cpt, false, j.author.model);
    const aRest = j.persistedAuthor ? zero : estimateCall(j.author, aOut, cpt, true, j.author.model);
    const rFirst = estimateCall(rp, rOut, cpt, false, rp.model);
    const rRest = estimateCall(rp, rOut, cpt, true, rp.model);
    // L-R3: an arm with the 2b correction ON may add one full-document re-emission per sample. Priced as one more cached
    // Author call with the deliverable turn's output (the R4 rule's own conservative estimate) — counted as if EVERY
    // sample triggers (stage A: every Opus draft on these nodes would).
    const corr = j.requirementsFormCorrection === true && !j.persistedAuthor ? estimateCall(j.author, aOut, cpt, true, j.author.model) : zero;
    const jobUpper = n * (aFirst.cost + rFirst.cost + corr.cost);
    const jobExpected = aFirst.cost + rFirst.cost + (n - 1) * (aRest.cost + rRest.cost) + n * corr.cost;
    upper += jobUpper; expected += jobExpected; calls += ((j.persistedAuthor ? 1 : 2) + (corr.cost ? 1 : 0)) * n;
    rows.push(`  ${j.node.id.padEnd(7)} ${j.variant.padEnd(9)} author[${j.persistedAuthor ? `PERSISTED${j.persistedAuthor.plantId ? `+plant ${j.persistedAuthor.plantId}` : ''}, $0]` : `${shortModel(j.author.model)}/${effortOf(j.author)}] ~${aFirst.inTok} in/${aOut} out${corr.cost ? ' +2b correction' : ''}`} · reviewer[${shortModel(j.reviewerBase.model)}/${effortOf(j.reviewerBase)}] ~${rFirst.inTok} in/${rOut} out · ${n}× ≈ $${jobExpected.toFixed(2)} (≤ $${jobUpper.toFixed(2)} uncached)`);
  }
  return { upper, expected, calls, rows };
}

async function pool<T>(items: T[], k: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, k) }, async () => { while (i < items.length) { const t = items[i++]; await fn(t); } }));
}

async function run(args: Args) {
  const dir = args.experiment ? path.resolve(args.experiment) : null;
  let exp: Experiment;
  let nodes: NodeSpec[];
  let protocolOverride: ProtocolText | undefined;
  if (dir) {
    exp = loadExperiment(dir);
    nodes = exp.nodes.filter((nd) => !args.only || args.only.includes(nd.id));
  } else if (args.node) {
    if (!args.protocolText) throw new Error('--node needs --protocol-text <file>');
    const snap = loadSnapshot(args.node);
    const pi = parsedResult(snap.author)?.protocolInjection;
    const text = fs.readFileSync(args.protocolText, 'utf8');
    protocolOverride = { name: pi.delta.name, version: `${pi.delta.version}+file`, text, source: `file:${args.protocolText}` };
    exp = { label: 'adhoc', n: 5, flags: { CONNECTED_OUTPUT_SANITIZE_ENABLED: 'true', FORM_CORRECTION_ENABLED: 'true' }, baseline: { protocols: {} }, variants: {}, nodes: [], measures: [] };
    nodes = [{ id: args.node.slice(0, 10), authorExecutionId: args.node, kind: 'adhoc', variants: ['custom'] }];
  } else throw new Error('run needs --experiment <dir> or --node <authorExecutionId> --protocol-text <file>');
  const n = args.n ?? exp.n;
  for (const [k, v] of Object.entries(exp.flags)) process.env[k] = v;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = args.out ? path.resolve(args.out) : path.join(RUNS_DIR, `${stamp}-${exp.label}${args.spend ? '' : args.fakeLlm ? '-fake' : '-dry'}`);
  fs.mkdirSync(out, { recursive: true });
  const code = codeState();
  console.log(`🧪 leg replay lab — ${exp.label} · ${args.spend ? 'LIVE (--spend)' : args.fakeLlm ? 'FAKE MODEL, $0' : 'DRY RUN, $0'} · n=${n} · out ${path.relative(REPO, out)}`);
  console.log(`   code ${code.head.slice(0, 12)}${Object.keys(code.dirty).length ? ` + ${Object.keys(code.dirty).length} modified/untracked file(s) under lib/ scripts/ prisma/ (lab excluded): ${Object.keys(code.dirty).join(', ')}` : ' (clean)'}`);

  const { jobs, nodeReports } = await prepare(exp, dir ?? '', nodes, args.variants ?? null, out, protocolOverride);
  for (const [id, r] of Object.entries(nodeReports)) {
    const c = r.controls;
    if (r.harvesterOnly) {
      const q = r.persistedQuoteFidelity; const sc = r.persistedQuoteScore;
      console.log(`   ${id.padEnd(7)} harvester control pass: markerPresence reproduces ${c.leafNetsReproducePersisted.markerPresence ? '✓' : '✗'} · quoteFidelity computes on the persisted harvest ${c.quoteFidelityComputes ? '✓' : '✗'} (${q?.reason ?? '—'}, ${q?.disposition ?? '—'}) · quote score: file blocks ${sc.fileBlocks}, strict-clean ${sc.fileBlocksStrictClean}, prometheus ${sc.prometheusBlocks}, edited ${sc.editedLines} · tools ${r.tools} — record ${r.record.calls} calls, ${r.record.fileCalls} file, ${r.record.truncatedAtPersist} truncated at persist, ${r.record.failed} failed`);
      for (const [v, vr] of Object.entries<any>(r.variants)) if (vr.fidelityFailures?.length) console.log(`      ⚠️ ${v}: ${vr.fidelityFailures.join(' | ')}`);
      continue;
    }
    const na = (k: string) => (c.leafNetsReproducePersisted.notApplicable ?? []).includes(k) ? 'n/a ✓' : (c.leafNetsReproducePersisted[k] ? '✓' : '✗');
    const rq = c.requirementsFormCheckComputes;
    console.log(`   ${id.padEnd(7)} control pass: leaf nets reproduce persisted [markerPresence ${na('markerPresence')} rollbackContainment ${na('rollbackContainment')}] · chain patch identity ${c.chainPatchIdentity ? '✓' : '✗'} · shipping parser = persisted verdict ${c.shippingParserReproducesPersistedVerdict ? '✓' : '✗'} · leg reviewerWarnings computes ${c.legReviewerWarningsNotApplicable ? 'n/a ✓' : c.legReviewerWarningsComputes ? '✓' : '✗'}${rq ? ` · requirements form check computes ${rq.ok ? '✓' : '✗'} (map ${rq.ownerRowItemMap}/${rq.itemMapSource}, persisted view ${rq.persistedDraft.view}, failing ${rq.persistedDraft.failing.join(',') || 'none'})` : ''}${r.plant ? ` · plant ${r.plant.edit} (${r.plant.deltaChars >= 0 ? '+' : ''}${r.plant.deltaChars})` : ''} (persisted ${r.persisted.approved === true ? 'APPROVED' : r.persisted.approved === false ? 'REFUSED' : '—'})`);
    for (const [v, vr] of Object.entries<any>(r.variants)) if (vr.requirementsFormCorrection) console.log(`      ${v}: author ${shortModel(vr.models?.author)}/${vr.models?.authorEffort} · 2b correction ${vr.requirementsFormCorrection} · ${vr.requirementsCheck}`);
    if (r.inputEdits) console.log(`      input edit ${r.inputEdits.edit}: ${Object.entries<any>(r.inputEdits.targets).map(([t, x]) => `${t} ${x.beforeChars}→${x.afterChars}`).join(' · ')}`);
    for (const [v, vr] of Object.entries<any>(r.variants)) if (vr.fidelityFailures?.length) console.log(`      ⚠️ ${v}: ${vr.fidelityFailures.join(' | ')}`);
  }
  const est = estimate(jobs, n, args.n);
  console.log(`\n💲 ESTIMATE (${jobs.length} node×variant, ${est.calls} model calls + any 50-69 diagnostic retries / form corrections):`);
  est.rows.forEach((r) => console.log(r));
  console.log(`   total ≈ $${est.expected.toFixed(2)} expected with prompt caching within a node×variant · ≤ $${est.upper.toFixed(2)} if nothing caches`);

  const manifest = {
    label: exp.label, startedAt: new Date().toISOString(), spend: !!args.spend, fakeLlm: args.fakeLlm ?? null, n, flags: exp.flags,
    code, experimentDir: dir ? path.relative(REPO, dir) : null, nodes: nodeReports, estimate: { expectedUsd: est.expected, upperUsd: est.upper, calls: est.calls },
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (!args.spend && !args.fakeLlm) {
    console.log(`\n✅ dry run complete — prompts, protocol texts and control results saved under ${path.relative(REPO, out)}. No model was called.`);
    console.log('   Add --spend (and ANTHROPIC_API_KEY in your shell) to run it; --max-usd caps the spend.');
    return;
  }

  // --fake-llm persisted (TEST ONLY, $0): the "model" answers every Author call with the PERSISTED Author package and
  // every Reviewer call with the PERSISTED review, so the whole live path — loop, post-loop, nets, chain patch,
  // Reviewer rebuild, verdict parse, leg nets, summary — runs and must reproduce the persisted verdicts.
  if (args.fakeLlm && args.fakeLlm !== 'persisted') throw new Error('--fake-llm supports only "persisted"');
  if (args.fakeLlm && args.spend) throw new Error('--fake-llm and --spend are exclusive');
  const apiKey = args.fakeLlm ? 'fake' : (process.env.ANTHROPIC_API_KEY ?? '');
  if (!args.fakeLlm && !apiKey.startsWith('sk-ant-')) throw new Error('ANTHROPIC_API_KEY is not set to an Anthropic key in this shell — refusing to spend');
  const maxUsd = args.maxUsd ?? Math.ceil(est.upper * 1.25);
  console.log(args.fakeLlm ? '\n▶ FAKE model (persisted outputs) — $0, exercises the live path only' : `\n▶ spending, cap $${maxUsd} (--max-usd) · concurrency ${args.concurrency ?? 4}`);
  const { runLive, fakeGenerateText } = await import('./live');
  const fake = (b: 'author' | 'reviewer', snap: Snapshot) => args.fakeLlm
    ? fakeGenerateText(parsedResult(b === 'author' ? snap.author : snap.reviewer)!.finalResponse, (b === 'author' ? snap.author : snap.reviewer!).exec.modelUsed) : undefined;
  let spent = 0;
  let stopped = false;
  const samples: Array<{ job: Job; i: number }> = [];
  // A node may carry its own n (e.g. Z1 n=3), or one per variant (`nByVariant`, 2026-10-12 group 4: base TZ n=1 beside
  // g4 TZ n=3); --n on the command line overrides every node.
  for (const job of jobs) for (let i = 1; i <= (args.n ?? job.node.nByVariant?.[job.variant] ?? job.node.n ?? n); i++) samples.push({ job, i });
  // L-Z2: samples whose arms run different in-run check data never interleave — one data group at a time, HEAD's data
  // restored after each. Groups run in first-appearance order of their arms.
  const groups = new Map<string, Array<{ job: Job; i: number }>>();
  for (const s of samples) { const k = s.job.checkAt ?? ''; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }
  const checkGroups: Array<{ checkAt: string | null; registrySha256: string; templateSha256: string; samples: number }> = [];
  for (const [k, groupSamples] of groups) {
  const installed = useCheckDataAt(k || null);
  checkGroups.push({ checkAt: k || null, registrySha256: installed.registrySha256, templateSha256: installed.templateSha256, samples: groupSamples.length });
  if (groups.size > 1 || k) console.log(`   ▸ in-run check data ${installed.source} (registry ${installed.registrySha256.slice(0, 12)}) — ${groupSamples.length} sample(s)`);
  await pool(groupSamples, args.concurrency ?? 4, async ({ job, i }) => {
    if (stopped) return;
    if (spent >= maxUsd) { stopped = true; console.log(`   ⛔ cap reached ($${spent.toFixed(2)} ≥ $${maxUsd}) — stopping before further calls`); return; }
    const sd = path.join(out, job.node.id, job.variant, `sample-${String(i).padStart(2, '0')}`);
    fs.mkdirSync(sd, { recursive: true });
    const sample: Record<string, any> = { node: job.node.id, variant: job.variant, i, startedAt: new Date().toISOString() };
    if (!job.reviewerBase) {
      try { spent += await runHarvesterSample(job, i, sd, sample, apiKey, !!args.fakeLlm); }
      catch (e) { sample.error = e instanceof Error ? e.message : String(e); console.log(`   💥 ${job.node.id} ${job.variant} #${i}: ${sample.error}`); }
      fs.writeFileSync(path.join(sd, 'sample.json'), JSON.stringify(sample, null, 2));
      return;
    }
    try {
      const pa = job.persistedAuthor;
      let aId = `lab-${job.node.id}-${job.variant}-${i}-a`;
      let a: LiveResult;
      let leaf: { stamped: Record<string, Record<string, unknown>>; errors: Record<string, string> };
      let authorResult: Record<string, any>;
      let reviewer: RebuiltPrompt;
      if (pa) {
        // L0a: no Author call. The persisted (planted) package, its leaf stamps and the Reviewer prompt were fixed at prepare.
        aId = pa.chainExecutionId;
        const ares = parsedResult(job.snap.author)!;
        a = { finalResponse: pa.text, finalStopReason: ares.toolLoop?.finalStopReason ?? null, turns: 0, toolCalls: [], formCheck: ares.toolLoop?.formCheck ?? null,
          requirementsFormCheck: ares.toolLoop?.requirementsFormCheck ?? null, toolCallRecords: [],
          confidenceScore: ares.confidenceScore ?? null, diagnosticRetryUsed: false, correctionTurnUsed: false, truncationRetryUsed: false, calls: [], costUsd: 0, durationMs: 0 };
        leaf = { stamped: pa.leafStamped, errors: {} };
        authorResult = persistedAuthorResult(job.snap, pa.text, pa.leafStamped);
        reviewer = pa.reviewer;
      } else {
        a = await runLive(job.author, { executionId: aId, taskId: job.snap.author.task.id, taskType: job.snap.author.task.type, apiKey,
          requirementsHarnessRow: job.requirementsHarnessRow ?? job.snap.leg, generateTextOverride: fake('author', job.snap),
          ...(job.requirementsFormCorrection !== null ? { requirementsFormCorrectionEnabled: job.requirementsFormCorrection } : {}) });
        spent += a.costUsd;
        leaf = await runAuthorLeafNets(job.snap, job.author.role, a.finalResponse, aId);
        authorResult = {
          finalResponse: a.finalResponse, confidenceScore: a.confidenceScore,
          qualityMetrics: { totalTurns: a.turns, hitMaxTurns: a.turns >= job.author.maxToolTurns, responseLength: a.finalResponse.length, toolCallSuccess: { total: a.toolCalls.length, failed: 0, succeeded: a.toolCalls.length } },
          markerPresence: leaf.stamped.markerPresence ?? null, rollbackContainment: leaf.stamped.rollbackContainment ?? null, derivationContainment: null,
          toolLoop: { formCheck: a.formCheck, ...(a.requirementsFormCheck ? { requirementsFormCheck: a.requirementsFormCheck } : {}) },
        };
        const ctx = patchReviewerContext(job.snap, { executionId: aId, ...authorResult } as any);
        reviewer = withModel(await rebuildPrompt(job.snap, 'reviewer', job.protocol, { inputContextOverride: ctx, templatePromptOverride: job.reviewerTemplate, dropTemplateDirective: job.dropTemplateDirective }), job.reviewerModel, job.reviewerEffort);
      }
      fs.writeFileSync(path.join(sd, 'author.md'), a.finalResponse);
      if (a.requirementsCorrection) {
        // The read needs both sides of every attempted correction, adopted or not (author.md is the deliverable).
        fs.writeFileSync(path.join(sd, 'author.pre-correction.md'), a.requirementsCorrection.preCorrectionText);
        if (a.requirementsCorrection.correctionPrompt !== null) fs.writeFileSync(path.join(sd, 'correction-message.md'), a.requirementsCorrection.correctionPrompt);
        if (a.requirementsCorrection.correctedRaw !== null) fs.writeFileSync(path.join(sd, 'author.correction-raw.md'), a.requirementsCorrection.correctedRaw);
      }
      fs.writeFileSync(path.join(sd, 'reviewer.user.md'), reviewer.user);
      const rId = `lab-${job.node.id}-${job.variant}-${i}-r`;
      const r = await runLive(reviewer, { executionId: rId, taskId: job.snap.reviewer!.task.id, taskType: job.snap.reviewer!.task.type, apiKey, generateTextOverride: fake('reviewer', job.snap) });
      spent += r.costUsd;
      fs.writeFileSync(path.join(sd, 'reviewer.md'), r.finalResponse);
      const verdict = parseReviewerVerdict(r.finalResponse);
      // The Reviewer's stamped verdict as production nests it (warnings included) — what the leg nets read (L0d).
      const rVerdict = shippingReviewerVerdict(r.finalResponse, reviewer.role);
      const leg = await runLegSynthesizeNets(job.snap, [
        { taskId: job.snap.author.task.id, executionId: aId, resultJson: authorResult },
        { taskId: job.snap.reviewer!.task.id, executionId: rId, resultJson: { finalResponse: r.finalResponse, reviewerVerdict: rVerdict } },
      ]);
      const rwFact = (leg?.stamped.reviewerWarnings ?? null) as Record<string, any> | null;
      const section = rwFact ? appendReviewerWarningsSection('', rwFact).content : '';
      fs.writeFileSync(path.join(sd, 'report-section.md'), section);
      const wm = reviewerWarningMeasures(r.finalResponse, rVerdict);
      const persistedFirst = persistedSingleCallInput(job.snap.author);
      const firstIn = a.calls[0] ? a.calls[0].inputTokens + a.calls[0].cacheReadTokens + a.calls[0].cacheCreationTokens : null;
      Object.assign(sample, {
        verdict: verdict ? { approved: verdict.approved, blocking: verdict.blocking, warnings: rVerdict?.warnings ?? null, untranscribedLabelLines: rVerdict?.untranscribedLabelLines ?? null } : null,
        authorSource: pa ? { source: 'persisted', plant: pa.plantId } : { source: 'live' },
        warningMeasures: wm,
        legReviewerWarnings: rwFact, legReviewerWarningsError: leg?.errors.reviewerWarnings ?? null,
        reachChainPass: reachChainPass(wm, rwFact, section),
        reviewerConfidence: parseConfidenceScore(r.finalResponse),
        author: { confidence: a.confidenceScore, stopReason: a.finalStopReason, turns: a.turns, toolCalls: a.toolCalls, diagnosticRetryUsed: a.diagnosticRetryUsed, formCheck: a.formCheck, chars: a.finalResponse.length,
          ...(a.requirementsFormCheck ? { requirementsFormCheck: a.requirementsFormCheck, requirementsFormCorrectionEnabledSource: a.requirementsFormCorrectionEnabledSource ?? null } : {}), durationMs: a.durationMs },
        reviewer: { stopReason: r.finalStopReason, turns: r.turns, toolCalls: r.toolCalls, diagnosticRetryUsed: r.diagnosticRetryUsed },
        leafFacts: summarizeFacts(leaf.stamped), leafNetErrors: leaf.errors,
        legFacts: leg ? summarizeFacts(leg.stamped) : null, legNetErrors: leg?.errors ?? null,
        measures: computeMeasures(a.finalResponse, exp.measures),
        tokenFidelity: { persistedSingleCallInput: persistedFirst, replayFirstCallInput: firstIn,
          comparable: job.variant === 'baseline' && job.protocol.version === (parsedResult(job.snap.author)?.protocolInjection?.delta?.version) },
        calls: [...a.calls.map((c) => ({ role: 'author', ...c })), ...r.calls.map((c) => ({ role: 'reviewer', ...c }))],
        costUsd: a.costUsd + r.costUsd,
      });
      console.log(`   ${verdict?.approved === true ? '✅' : verdict?.approved === false ? '❌' : '❔'} ${job.node.id} ${job.variant} #${i} · ${verdict ? (verdict.approved ? 'APPROVED' : `REFUSED (${verdict.blocking.length} blocking)`) : 'NO PARSEABLE VERDICT'} · $${(a.costUsd + r.costUsd).toFixed(3)} · running $${spent.toFixed(2)}`);
    } catch (e) {
      sample.error = e instanceof Error ? e.message : String(e);
      console.log(`   💥 ${job.node.id} ${job.variant} #${i}: ${sample.error}`);
    }
    fs.writeFileSync(path.join(sd, 'sample.json'), JSON.stringify(sample, null, 2));
  });
  }
  useCheckDataAt(null);
  const end = codeState();
  const drift = end.head !== code.head || JSON.stringify(end.dirty) !== JSON.stringify(code.dirty);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ ...manifest, endedAt: new Date().toISOString(), spentUsd: spent, codeAtEnd: end, codeChangedDuringRun: drift, checkGroups }, null, 2));
  if (drift) console.log('   ⚠️ RULE 7: the code or a dirty tracked file CHANGED during the run — the results describe a moving target; re-run before quoting them.');
  summarize(out, exp.measures);
}

/**
 * ONE harvester sample: the shipping loop with recorded (or stub) tools, the shipping result.json `toolCalls` builder over
 * the loop's records, the shipping leaf nets with those calls (the stamped `quoteFidelity`), and the lab quote score.
 * BYTES CHECK, every sample: each served result is compared with the stored one it came from — the bytes the loop received
 * must be the bytes production stored, and where production stamped R9 facts the replayed stamp must equal them.
 * `fake` ($0): the model re-issues the PRODUCTION calls in production order, then answers with the persisted harvest.
 */
async function runHarvesterSample(job: Job, i: number, sd: string, sample: Record<string, any>, apiKey: string, fake: boolean): Promise<number> {
  const { runLive, fakeGenerateText, fakeReplayToolCalls, TOOL_STUB_RESULT } = await import('./live');
  const ares = parsedResult(job.snap.author)!;
  const server = job.stored ? createRecordedToolServer(job.stored, TOOL_STUB_RESULT) : null;
  const gen = fake ? (job.stored ? fakeReplayToolCalls(ares.toolCalls ?? [], ares.finalResponse, job.snap.author.exec.modelUsed) : fakeGenerateText(ares.finalResponse, job.snap.author.exec.modelUsed)) : undefined;
  const hId = `lab-${job.node.id}-${job.variant}-${i}-h`;
  const a = await runLive(job.author, { executionId: hId, taskId: job.snap.author.task.id, taskType: job.snap.author.task.type, apiKey, toolServer: server, generateTextOverride: gen });
  const toolCalls = (buildExecutionResultJson({
    taskId: job.snap.author.task.id, taskTitle: 'lab', agentRole: job.author.role, modelUsed: job.author.model, finalResponse: a.finalResponse, confidenceScore: a.confidenceScore,
    turnCount: a.turns, maxToolTurns: job.author.maxToolTurns, toolCallResults: a.toolCallRecords as any, successfulToolCalls: a.toolCallRecords.filter((t) => t.success).length,
    failedToolCalls: a.toolCallRecords.filter((t) => !t.success).length, executionTime: a.durationMs, tokensUsed: 0, correctionTurnUsed: a.correctionTurnUsed,
  } as any).toolCalls ?? []) as Array<Record<string, any>>;
  const leaf = await runAuthorLeafNets(job.snap, job.author.role, a.finalResponse, hId, toolCalls);
  const report = server ? recordedToolsReport(server.log, job.stored!) : null;
  // Bytes check: served entries are matched to the loop records in call order (one log entry per executeToolOnServer call;
  // read_more never reaches the server, so it is skipped on the record side).
  const recs = (a.toolCallRecords as Array<Record<string, any>>).filter((t) => t.tool !== 'read_more');
  const bytes = { served: 0, identical: 0, r9Compared: 0, r9Equal: 0, mismatches: [] as string[] };
  if (server) server.log.forEach((e, k) => {
    if (e.storedIndex === null || e.tier === 'unserved-truncated') return;
    const st = job.stored![e.storedIndex]; const rec = recs[k];
    if (!st.success) return;
    bytes.served++;
    if (rec && JSON.stringify(rec.result) === JSON.stringify(st.result)) bytes.identical++; else bytes.mismatches.push(`call ${k} ← stored ${e.storedIndex}: result differs`);
    const prodRec = (ares.toolCalls ?? [])[e.storedIndex];
    if (rec && typeof prodRec?.rewritten === 'boolean') {
      bytes.r9Compared++;
      if (rec.rewritten === prodRec.rewritten && JSON.stringify(rec.rewriteClasses ?? []) === JSON.stringify(prodRec.rewriteClasses ?? [])
        && rec.resultTruncatedForLlm === prodRec.resultTruncatedForLlm && rec.resultChars === prodRec.resultChars) bytes.r9Equal++;
      else bytes.mismatches.push(`call ${k} ← stored ${e.storedIndex}: R9/LLM-cap facts differ (rewritten ${rec.rewritten}/${prodRec.rewritten}, chars ${rec.resultChars}/${prodRec.resultChars})`);
    }
  });
  const score = scoreHarvesterQuotes(a.finalResponse, toolCalls);
  const qf = (leaf.stamped.quoteFidelity ?? null) as Record<string, any> | null;
  const prodChars = ares.finalResponse.length;
  fs.writeFileSync(path.join(sd, 'harvester.md'), a.finalResponse);
  fs.writeFileSync(path.join(sd, 'toolCalls.json'), JSON.stringify(toolCalls, null, 2));
  Object.assign(sample, {
    harvesterOnly: true,
    valid: report ? report.valid : null,
    recordedTools: report ? { ...report, log: report.log.map((e) => `${e.tool}${e.innerTool ? `.${e.innerTool}` : e.action ? `.${e.action}` : ''}:${e.tier}${e.storedIndex !== null ? `@${e.storedIndex}` : ''}`) } : null,
    servedBytes: server ? bytes : null,
    quoteFidelity: qf, quoteScore: score,
    overLength: { chars: a.finalResponse.length, productionChars: prodChars, overTwiceProduction: a.finalResponse.length > 2 * prodChars, maxTokensStop: a.finalStopReason === 'max_tokens' },
    leafFacts: summarizeFacts(leaf.stamped), leafNetErrors: leaf.errors,
    author: { confidence: a.confidenceScore, stopReason: a.finalStopReason, turns: a.turns, toolCalls: a.toolCalls, diagnosticRetryUsed: a.diagnosticRetryUsed, chars: a.finalResponse.length, durationMs: a.durationMs },
    calls: a.calls.map((c) => ({ role: 'harvester', ...c })),
    costUsd: a.costUsd,
  });
  const qfs = qf ? `${qf.reason}` : 'no fact';
  console.log(`   ${score.faithful ? '✅' : '⚠️'} ${job.node.id} ${job.variant} #${i} · quoteFidelity ${qfs} · file blocks ${score.fileBlocksStrictClean}/${score.fileBlocks} strict-clean · edited ${score.editedLines} · prom ${score.prometheusBlocks} (verbatim ${score.prometheusVerbatimLabelled})${report ? ` · tools ${report.fileServed}/${report.fileCalls} file served${report.valid ? '' : ' — INVALID'}` : ''}${server ? ` · bytes ${bytes.identical}/${bytes.served}` : ''} · $${a.costUsd.toFixed(3)}`);
  return a.costUsd;
}

// ───────────────────────────── summary ─────────────────────────────

function summarize(out: string, measures?: Measure[]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  const rows: Array<Record<string, any>> = [];
  for (const node of Object.keys(manifest.nodes)) {
    const nd = path.join(out, node);
    for (const v of fs.readdirSync(nd).filter((d) => fs.statSync(path.join(nd, d)).isDirectory())) {
      const samples = fs.readdirSync(path.join(nd, v)).filter((d) => d.startsWith('sample-'))
        .map((d) => ({ dir: path.join(nd, v, d), s: JSON.parse(fs.readFileSync(path.join(nd, v, d, 'sample.json'), 'utf8')) }));
      if (!samples.length) continue;
      const ok = samples.filter((x) => !x.s.error);
      const refused = ok.filter((x) => x.s.verdict?.approved === false);
      const approved = ok.filter((x) => x.s.verdict?.approved === true);
      const noVerdict = ok.filter((x) => !x.s.verdict);
      if (refused.length + approved.length + noVerdict.length !== ok.length) throw new Error(`${node}/${v}: verdict buckets do not sum`);
      const groups: Record<string, number> = {};
      let items = 0;
      for (const x of refused) for (const b of x.s.verdict.blocking) { groups[groupOf(b)] = (groups[groupOf(b)] ?? 0) + 1; items++; }
      if (Object.values(groups).reduce((a, b) => a + b, 0) !== items) throw new Error(`${node}/${v}: blocking groups do not sum`);
      const verbatim = refused.flatMap((x) => x.s.verdict.blocking.map((b: string) => `${path.basename(x.dir)} [${groupOf(b)}] ${b}`));
      const meas: Record<string, string> = {};
      for (const m of Object.keys(ok[0]?.s.measures ?? {})) {
        const vals = ok.map((x) => x.s.measures[m] as number);
        meas[m] = `${vals.filter((x) => x > 0).length}/${vals.length} (Σ${vals.reduce((a, b) => a + b, 0)})`;
      }
      const facts: Record<string, Record<string, number>> = {};
      for (const x of ok) for (const [k, val] of Object.entries<string>({ ...(x.s.leafFacts ?? {}), ...Object.fromEntries(Object.entries(x.s.legFacts ?? {}).map(([kk, vv]) => [`leg.${kk}`, vv])) })) {
        facts[k] = facts[k] ?? {}; facts[k][val] = (facts[k][val] ?? 0) + 1;
      }
      const toolAsks = ok.reduce((s, x) => s + (x.s.author?.toolCalls?.length ?? 0) + (x.s.reviewer?.toolCalls?.length ?? 0), 0);
      const tok = ok.flatMap((x) => x.s.calls ?? []).reduce((a: any, c: any) => ({ in: a.in + c.inputTokens + c.cacheReadTokens + c.cacheCreationTokens, out: a.out + c.outputTokens }), { in: 0, out: 0 });
      const fid = ok.map((x) => x.s.tokenFidelity).filter((t) => t?.comparable && t.persistedSingleCallInput && t.replayFirstCallInput);
      // L0e: per-cell warning measures (samples named so each count can be READ; lexical proxies are flagged as such).
      const wmOf = (x: any) => x.s.warningMeasures ?? null;
      const withWm = ok.filter((x) => wmOf(x));
      const names = (f: (x: any) => boolean) => withWm.filter(f).map((x) => path.basename(x.dir));
      const sum = (f: (x: any) => number) => withWm.reduce((acc, x) => acc + (f(x) || 0), 0);
      const warn = withWm.length ? {
        samples: withWm.length,
        approvedWithRestatedTranscribed: names((x) => x.s.verdict?.approved === true && wmOf(x).restatedTranscribed >= 1).length,
        restatedLabelSamples: names((x) => wmOf(x).restatedLabel > 0).length, restatedLabelSum: sum((x) => wmOf(x).restatedLabel),
        restatedTranscribedSum: sum((x) => wmOf(x).restatedTranscribed),
        reachLabelSamples: names((x) => wmOf(x).reachLabel > 0).length, reachChainPass: names((x) => x.s.reachChainPass === true).length,
        labelInBlockingSum: sum((x) => wmOf(x).labelInBlocking), negatedLabelSum: sum((x) => wmOf(x).negatedLabel),
        untranscribedLabelLinesSum: sum((x) => wmOf(x).untranscribedLabelLines ?? 0),
        ownEnumerationSamples: names((x) => wmOf(x).ownEnumeration > 0).length,
        attributesToPackage: sum((x) => (wmOf(x).attribution ?? []).filter((a: any) => a.attribution === 'attributes-to-package').length),
        unattributed: sum((x) => (wmOf(x).attribution ?? []).filter((a: any) => a.attribution === 'unattributed').length),
        refusedOnlyRestatement_READ: names((x) => wmOf(x).blockingOnlyRestatement),
        refusedNamingMissingStep_READ: names((x) => x.s.verdict?.approved === false && wmOf(x).blockingNamesMissingStep),
        refusedSelfGradeWords_READ: names((x) => x.s.verdict?.approved === false && wmOf(x).blockingSelfGradeWords),
        otherIds: [...new Set(withWm.flatMap((x) => wmOf(x).otherTranscribed ?? []))],
        legFactComputed: names((x) => x.s.legReviewerWarnings && !x.s.legReviewerWarningsError && x.s.legReviewerWarnings.reason !== 'enrichment-error').length,
      } : null;
      rows.push({
        node, variant: v, kind: manifest.nodes[node].kind, n: samples.length, errors: samples.length - ok.length,
        refused: refused.length, approved: approved.length, noVerdict: noVerdict.length, groups, measures: meas, facts, toolAsks,
        tokensIn: tok.in, tokensOut: tok.out, costUsd: ok.reduce((s, x) => s + (x.s.costUsd ?? 0), 0),
        tokenFidelity: fid.map((t) => `${t.replayFirstCallInput - t.persistedSingleCallInput >= 0 ? '+' : ''}${t.replayFirstCallInput - t.persistedSingleCallInput}`).join(','),
        diffThisFirst: refused[0] ? path.relative(out, refused[0].dir) : null, verbatim, warn,
      });
    }
  }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(rows, null, 2));
  // OLD vs NEW at a glance: one row per node, one column per variant (refused / samples with a verdict).
  const vnames = [...new Set(rows.map((r) => r.variant))];
  const pivot = [`| node | kind | persisted | ${vnames.join(' | ')} |`, `|---|---|---|${vnames.map(() => '---').join('|')}|`];
  for (const node of [...new Set(rows.map((r) => r.node))]) {
    const p = manifest.nodes[node].persisted.approved;
    pivot.push(`| ${node} | ${manifest.nodes[node].kind} | ${p === true ? 'approved' : p === false ? 'REFUSED' : '—'} | ${vnames.map((v) => {
      const r = rows.find((x) => x.node === node && x.variant === v);
      return r ? `${r.refused} / ${r.n - r.errors - r.noVerdict}${r.noVerdict ? ` (+${r.noVerdict} no verdict)` : ''}${r.errors ? ` (+${r.errors} err)` : ''}` : '—';
    }).join(' | ')} |`);
  }
  const md: string[] = [`# Leg replay lab — ${manifest.label}`, '', `code ${manifest.code.head.slice(0, 12)} · dirty ${Object.keys(manifest.code.dirty).length} · flags ${JSON.stringify(manifest.flags)} · spent $${(manifest.spentUsd ?? 0).toFixed(2)}${manifest.codeChangedDuringRun ? ' · ⚠️ CODE CHANGED DURING RUN' : ''}`, '',
    '## Refusals: old vs new (refused / samples with a parsed verdict)', '', ...pivot, '', '## Per node × variant', '',
    '| node | kind | variant | refused / n | no verdict | errors | blocking groups (lab heuristic) | tool asks | tokens in/out | $ | first-call token Δ vs persisted | diff first |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) md.push(`| ${r.node} | ${r.kind} | ${r.variant} | **${r.refused} / ${r.n - r.errors}** | ${r.noVerdict} | ${r.errors} | ${Object.entries(r.groups).map(([g, c]) => `${g} ${c}`).join(', ') || '—'} | ${r.toolAsks} | ${r.tokensIn}/${r.tokensOut} | ${r.costUsd.toFixed(2)} | ${r.tokenFidelity || '—'} | ${r.diffThisFirst ?? '—'} |`);
  md.push('', '## Measures (samples with a non-zero count / samples, Σ count)', '', `| node | variant | ${rows[0] ? Object.keys(rows[0].measures).join(' | ') : ''} |`, `|---|---|${rows[0] ? Object.keys(rows[0].measures).map(() => '---').join('|') : ''}|`);
  for (const r of rows) md.push(`| ${r.node} | ${r.variant} | ${Object.values(r.measures).join(' | ')} |`);
  if (rows.some((r) => r.warn)) {
    md.push('', '## Reviewer warnings (L0e — counts over samples; lexical proxies marked _READ are lists to read, never results)', '',
      '| node | variant | approved / n | approved + restated transcribed | restatedLabel (samples, Σ) | reachLabel samples | P-REACH chain pass | labelInBlocking Σ | negatedLabel Σ | untranscribed Σ | ownEnumeration samples | D7 attributes / unattributed (hand read) | refused, only restatement | refused, names missing step | refused, self-grade words | other ids | leg fact computed |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) if (r.warn) {
      const w = r.warn;
      md.push(`| ${r.node} | ${r.variant} | ${r.approved} / ${r.n - r.errors} | ${w.approvedWithRestatedTranscribed} | ${w.restatedLabelSamples}, Σ${w.restatedLabelSum} | ${w.reachLabelSamples} | ${w.reachChainPass} | ${w.labelInBlockingSum} | ${w.negatedLabelSum} | ${w.untranscribedLabelLinesSum} | ${w.ownEnumerationSamples} | ${w.attributesToPackage} / ${w.unattributed} | ${w.refusedOnlyRestatement_READ.join(' ') || '—'} | ${w.refusedNamingMissingStep_READ.join(' ') || '—'} | ${w.refusedSelfGradeWords_READ.join(' ') || '—'} | ${w.otherIds.join(' ') || '—'} | ${w.legFactComputed}/${w.samples} |`);
    }
  }
  // Harvester nodes (2026-10-13): quote score per cell. VALID samples only in the score columns; invalid ones are counted.
  const hv: string[] = [];
  for (const node of Object.keys(manifest.nodes).filter((k) => manifest.nodes[k].harvesterOnly)) {
    const nd = path.join(out, node);
    for (const v of fs.readdirSync(nd).filter((d) => fs.statSync(path.join(nd, d)).isDirectory())) {
      const ss = fs.readdirSync(path.join(nd, v)).filter((d) => d.startsWith('sample-')).map((d) => ({ name: d, s: JSON.parse(fs.readFileSync(path.join(nd, v, d, 'sample.json'), 'utf8')) }));
      if (!ss.length) continue;
      const ok = ss.filter((x) => !x.s.error);
      const valid = ok.filter((x) => x.s.valid !== false);
      const q = (f: (x: any) => boolean) => valid.filter((x) => f(x.s)).map((x) => x.name);
      const reasons: Record<string, number> = {};
      for (const x of valid) { const r = x.s.quoteFidelity?.reason ?? 'none'; reasons[r] = (reasons[r] ?? 0) + 1; }
      const bytes = ok.reduce((a, x) => ({ served: a.served + (x.s.servedBytes?.served ?? 0), identical: a.identical + (x.s.servedBytes?.identical ?? 0), r9c: a.r9c + (x.s.servedBytes?.r9Compared ?? 0), r9e: a.r9e + (x.s.servedBytes?.r9Equal ?? 0) }), { served: 0, identical: 0, r9c: 0, r9e: 0 });
      const tiers: Record<string, number> = {};
      for (const x of ok) for (const [t, c] of Object.entries<number>(x.s.recordedTools?.tiers ?? {})) tiers[t] = (tiers[t] ?? 0) + c;
      const list = (xs: string[]) => `${xs.length}${xs.length ? ` (${xs.join(' ')})` : ''}`;
      hv.push(`| ${node} | ${v} | ${ss.length} | ${ss.length - ok.length} | ${ok.length - valid.length} | ${list(q((s) => s.quoteScore?.faithful))} | ${Object.entries(reasons).map(([r, c]) => `${r} ${c}`).join(', ')} | ${list(q((s) => (s.quoteScore?.editedLines ?? 0) > 0))} | ${list(q((s) => (s.quoteScore?.addedInVerbatimFile ?? 0) > 0))} | ${list(q((s) => (s.quoteScore?.markerHeadings ?? 0) > 0))} | ${list(q((s) => s.overLength?.overTwiceProduction || s.overLength?.maxTokensStop))} | ${list(q((s) => (s.quoteScore?.prometheusVerbatimLabelled ?? 0) > 0))} | ${list(q((s) => (s.quoteScore?.prometheusChangedLines ?? 0) > 0))} | ${list(q((s) => (s.quoteScore?.verbatimLabelledExcerpts ?? 0) > 0))} | ${bytes.identical}/${bytes.served} · R9 ${bytes.r9e}/${bytes.r9c} | ${Object.entries(tiers).map(([t, c]) => `${t} ${c}`).join(', ') || '—'} |`);
    }
  }
  if (hv.length) md.push('', '## Harvester quote score (score columns over VALID samples; each count names its samples — READ them)', '',
    '| node | variant | n | errors | invalid (<90% file calls served) | faithful (strict, ≥1 file block) | quoteFidelity reason | edited line | added in verbatim file block | marker heading | over 2× / max_tokens | prometheus labelled verbatim | prometheus edited | verbatim-labelled excerpt | served bytes identical · R9 facts equal | tool tiers |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...hv);
  md.push('', '## Blocking items, verbatim (the groups above are a lab heuristic — these are the evidence)', '');
  for (const r of rows) if (r.verbatim.length) { md.push(`### ${r.node} ${r.variant}`, ''); for (const b of r.verbatim) md.push(`- ${b.replace(/\n/g, ' ')}`); md.push(''); }
  md.push('', '## Net facts (value → samples)', '');
  for (const r of rows) md.push(`- **${r.node} ${r.variant}**: ${Object.entries(r.facts).map(([k, m]) => `${k} {${Object.entries(m as Record<string, number>).map(([vv, c]) => `${vv}: ${c}`).join('; ')}}`).join(' · ')}`);
  if (measures) md.push('', '## Measure definitions', '', ...measures.map((m) => `- \`${m.name}\` — ${m.why ?? ''}`));
  fs.writeFileSync(path.join(out, 'summary.md'), md.join('\n') + '\n');
  console.log('\n' + md.slice(0, 6 + pivot.length).join('\n'));
  console.log(`\n📄 ${path.relative(REPO, path.join(out, 'summary.md'))} · per-sample outputs under each node/variant/sample-NN`);
}

// ───────────────────────────── fidelity ─────────────────────────────

async function fidelity(args: Args): Promise<number> {
  const ids: string[] = args.experiment ? loadExperiment(path.resolve(args.experiment)).nodes.map((x) => x.authorExecutionId) : (args.nodes ?? []);
  const exp = args.experiment ? loadExperiment(path.resolve(args.experiment)) : null;
  let failures = 0;
  for (const id of ids) {
    const snap = loadSnapshot(id);
    let protocol: ProtocolText;
    try { protocol = protocolFor(exp ?? ({ baseline: { protocols: {} } } as any), args.experiment ? path.resolve(args.experiment) : '', snap, 'historical'); }
    catch (e) { console.log(`· ${id}: text it ran under is not recoverable — ${(e as Error).message}`); continue; }
    for (const which of ['author', 'reviewer'] as const) {
      const r = await rebuildPrompt(snap, which, protocol);
      const checks = fidelityChecks(snap, which, r);
      const bad = checks.filter((c) => c.ok === false && !c.name.startsWith('template.') && !c.name.startsWith('inputContext.'));
      failures += bad.length;
      console.log(`${bad.length ? '✗' : '✓'} ${id} ${which.padEnd(8)} ${protocol.source} · ${checks.filter((c) => c.ok === true).length} exact, ${checks.filter((c) => c.ok === null).length} not checkable` +
        `${bad.length ? ` · FAIL ${bad.map((c) => `${c.name} (${c.detail})`).join('; ')}` : ''}`);
      for (const c of checks.filter((x) => x.ok === false && (x.name.startsWith('template.') || x.name.startsWith('inputContext.')))) console.log(`     ⚠️ ${c.name}: ${c.detail}`);
    }
  }
  return failures;
}

// ───────────────────────────── snapshot (prefetch + one line per node, $0, read-only) ─────────────────────────────

function snapshotInfo(args: Args) {
  const ids: string[] = args.experiment ? [...new Set(loadExperiment(path.resolve(args.experiment)).nodes.map((x) => x.authorExecutionId))] : (args.nodes ?? []);
  for (const id of ids) {
    const s = loadSnapshot(id, { refresh: !!args.refresh });
    const a = parsedResult(s.author); const r = parsedResult(s.reviewer);
    console.log(`${id} ${a?.protocolInjection?.delta?.name ?? '?'}@${a?.protocolInjection?.delta?.version ?? '?'} · started ${s.author.exec.startTime}`
      + ` · reviewer ${s.reviewer?.exec.id ?? '—'} (${s.reviewer?.template?.name ?? '?'} ${s.reviewer?.template?.id ?? ''})`
      + ` · persisted ${r?.reviewerVerdict ? (r.reviewerVerdict.approved ? 'APPROVED' : 'REFUSED') : '—'} · leg ${s.leg?.id ?? '—'} ${s.leg?.metadata?.protocol ?? ''}`);
  }
}

// ───────────────────────────── CLI ─────────────────────────────

interface Args { refresh?: boolean; cmd: string; experiment?: string; node?: string; nodes?: string[]; protocolText?: string; spend?: boolean; fakeLlm?: string; n?: number; only?: string[]; variants?: string[]; out?: string; maxUsd?: number; concurrency?: number; refreshBaseline?: boolean; run?: string }
function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: argv[0] ?? 'help' };
  const val = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  a.experiment = val('--experiment'); a.node = val('--node'); a.protocolText = val('--protocol-text'); a.out = val('--out'); a.run = val('--run');
  a.spend = argv.includes('--spend'); a.fakeLlm = val('--fake-llm'); a.refreshBaseline = argv.includes('--refresh-baseline'); a.refresh = argv.includes('--refresh');
  if (val('--n')) a.n = Number(val('--n'));
  if (val('--max-usd')) a.maxUsd = Number(val('--max-usd'));
  if (val('--concurrency')) a.concurrency = Number(val('--concurrency'));
  if (val('--only')) a.only = val('--only')!.split(',');
  if (val('--variants')) a.variants = val('--variants')!.split(',');
  if (val('--nodes')) a.nodes = val('--nodes')!.split(',');
  return a;
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    if (args.cmd === 'build-candidates') return buildCandidates(path.resolve(args.experiment!), !!args.refreshBaseline);
    if (args.cmd === 'fidelity') { const f = await fidelity(args); process.exit(f ? 1 : 0); }
    if (args.cmd === 'run') return run(args);
    if (args.cmd === 'summarize') return summarize(path.resolve(args.run!));
    if (args.cmd === 'snapshot') return snapshotInfo(args);
    if (args.cmd === 'score-self-test') {
      const { scoreSelfTest } = await import('./score-requirements');
      const r = scoreSelfTest(path.resolve(args.experiment!));
      console.log('| gen | served | view | coverage (registry-caused) | citations | clauses | lint | residue {{/🗑/author | failing | turn (flag ON) |\n|---|---|---|---|---|---|---|---|---|---|');
      r.rows.forEach((x) => console.log(x));
      console.log(`\nL-R5 report.md − Author text (program view delivered): ${r.reportDeltas.map((d) => `gen ${d.gen} ${d.delta >= 0 ? '+' : ''}${d.delta}`).join(' · ')} · max ${Math.max(...r.reportDeltas.map((d) => d.delta))}`);
      if (r.mismatches.length) { console.log(`\n❌ ${r.mismatches.length} mismatch(es) against stage A:\n  ${r.mismatches.join('\n  ')}`); process.exit(1); }
      console.log('\n✅ scorer reproduces stage A on all gens');
      return;
    }
    if (args.cmd === 'score') {
      const { scoreRun } = await import('./score-requirements');
      const r = scoreRun(path.resolve(args.run!), path.resolve(args.experiment!));
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'z49-self-test') {
      const { z49SelfTest } = await import('./score-z49');
      const r = z49SelfTest(path.resolve(args.experiment!));
      console.log('| case | mode | stanza blocks/parse | statements (effect:keys) | forbidden keys | G-STANZA | request-path rows (leg:form/tier) | G-ROW | G-NOWORSE inputs |\n|---|---|---|---|---|---|---|---|---|');
      r.rows.forEach((x) => console.log(x));
      if (r.mismatches.length) { console.log(`\n❌ ${r.mismatches.length} mismatch(es):\n  ${r.mismatches.join('\n  ')}`); process.exit(1); }
      console.log('\n✅ Z49 scorer reads every case as pre-registered');
      return;
    }
    if (args.cmd === 'z49-score') {
      const { z49ScoreRun } = await import('./score-z49');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const r = z49ScoreRun(runs, path.resolve(args.experiment!));
      fs.writeFileSync(path.join(runs[0], 'z49-scores.json'), JSON.stringify(r, null, 2));
      fs.writeFileSync(path.join(runs[0], 'z49-scores.md'), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'g4-self-test') {
      const { g4SelfTest } = await import('./score-g4');
      const r = g4SelfTest(path.resolve(args.experiment!));
      console.log('| case | item rows/viol. | restates/asks | enforcer-scope form:option | part hits | empty cites/no-change | premise | collateral | G-NOWORSE cov·cit·clauses·lint |\n|---|---|---|---|---|---|---|---|---|');
      r.rows.forEach((x) => console.log(x));
      if (r.mismatches.length) { console.log(`\n❌ ${r.mismatches.length} mismatch(es):\n  ${r.mismatches.join('\n  ')}`); process.exit(1); }
      console.log('\n✅ g4 scorer reads every case as pre-registered');
      return;
    }
    if (args.cmd === 'g4-score') {
      const { g4ScoreRun } = await import('./score-g4');
      const runs = args.run!.split(',').map((r) => path.resolve(r));
      const r = g4ScoreRun(runs, path.resolve(args.experiment!));
      fs.writeFileSync(path.join(runs[0], 'g4-scores.json'), JSON.stringify(r, null, 2));
      fs.writeFileSync(path.join(runs[0], 'g4-scores.md'), r.md.join('\n') + '\n');
      console.log(r.md.join('\n'));
      return;
    }
    if (args.cmd === 'g4-noworse-dump') {
      // P8: run in BOTH trees with the same --check-at; the two files must be identical.
      const { g4NoWorseDump } = await import('./score-g4');
      const at = process.argv[process.argv.indexOf('--check-at') + 1];
      if (!process.argv.includes('--check-at') || !at || !args.out) throw new Error('usage: g4-noworse-dump --experiment <dir> --check-at <commit> --out <file>');
      const r = g4NoWorseDump(path.resolve(args.experiment!), at);
      fs.writeFileSync(path.resolve(args.out), JSON.stringify(r, null, 2) + '\n');
      console.log(`✅ ${Object.keys(r).length} drafts → ${args.out}`);
      return;
    }
    if (args.cmd === 'blind') {
      const { blindCopies } = await import('./score-requirements');
      console.log(`✅ ${blindCopies(path.resolve(args.run!), path.resolve(args.out!))} blind copies → ${args.out} (key: ${path.join(args.run!, 'blind-key.json')} — keep it from the reader)`);
      return;
    }
    console.log('usage: lab.ts build-candidates|fidelity|run|summarize — see the header of scripts/leg-replay-lab/lab.ts');
    process.exit(args.cmd === 'help' ? 0 : 1);
  })().catch((e) => { console.error(e); process.exit(1); });
}
