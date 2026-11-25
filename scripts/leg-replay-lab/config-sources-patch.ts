/**
 * Leg replay lab — L-CS-K levers (Config sources STEP 2, code push slice 4; plan §2.2a first bullet, §3.5). $0, no model call, and
 * NO SERVICE CALL: the platform's drift call is made through `runPlatformDriftCalls` with a caller that answers from a file.
 *
 * Production (slices 2–3b, inert until kubernetes-gitops 1.19.0): on a Config-sources leg the first execution snapshots the leg's
 * `## Config sources` declaration; the Harvester's persist holds only DECLARED Git files, the platform then calls the read-only
 * cluster service's compare tool once per held file, and the Harvester is stamped
 *     configSourceReads   (operator fact)            liveEvidence   (the Config arm, `lane: 'config'`)
 *     platformDriftCalls  (operator call record)     gitLiveDrift   (computed FROM that record)
 * The Author TRANSCRIBES `liveEvidence` and `gitLiveDrift`; the chainer carries `liveEvidence` to the Architect, the Author and the
 * leg Reviewer, and `gitLiveDrift` (only when `checked`) to the Architect and the leg Reviewer.
 *
 * Every stored Kubernetes leg predates all of it, so a 1.19.0 candidate cell needs four levers, each built from SHIPPING code over
 * a snapshot COPY (the cached snapshot is never written):
 *
 *   L-CS-K-a  `withFirstExecutionConfigSnapshot`  the snapshot production's writer WOULD take at the leg's first execution, over the
 *             (input-edited) leg row: the same resolver, the same contract key, takenAt = the leg's stamped `protocolResolvedAt`,
 *             re-read through the shipping reader and the shipping governing rule. Refused when the leg already carries one.
 *   L-CS-K-b  `labPlatformDriftCalls`             the platform call RECORD, made by the SHIPPING `runPlatformDriftCalls` with the
 *             same inputs the core passes (the governing declaration, the capture's held files, the Harvester's tool calls, the R10
 *             placeholder, the hub's manifest limit, `redaction-off`) and a FIXTURE caller (`driftCallerFor`). The caller answers
 *             with a result in the PROBED shape of the compare tool — the committed contract fixture, a real result of the tool —
 *             or with a named outcome (`no-compare-tool`, `refused`, …). It never answers with a fact: the node spec has no field
 *             for one, and an unknown field is refused by name.
 *   L-CS-K-c  `withComputedConfigFacts`           the four Harvester stamps, taken from the SHIPPING leaf nets (`runLeafNetsFor` →
 *             `MECHANICAL_NETS`), their ctx primed with what the core primes (config-sources-arm.ts, nets.ts) — so the population
 *             rule, the registry entries and the enrichments are production's. Each stamp is then cross-checked against the SHIPPING
 *             pure function (`computeConfigSourceReads`, `computeConfigLiveEvidence`, `computeGitLiveDrift`); a difference throws.
 *             Every stored copy of the Harvester's result.json is patched and re-read (LK11).
 *   L-CS-K-d  the CARRY is not here: the Author's transcription is the shipping Author leaf net reading the patched Harvester
 *             through replay-prisma; chain.ts `chainEntryFromResult` carries both facts by the chainer's own rules; lab.ts puts the
 *             Harvester stamps on the Architect's and the Author's Harvester entry.
 *
 * The force (`configForce`) reported per cell is the SHIPPING `configSourceForce` over the lab store's capture refs — what the
 * carrier would decide for this leg (a leg holding every declared file is not forced; a leg missing one is, by label).
 *
 * STEP 3 SLICE L (2026-11-23, observability-config 1.12.0 — a protocol the PLATFORM compares, `gitLiveDriftPlatformCompares`):
 *   - L-CS-K-a asks the SHIPPING `configSnapshotDecision` (none / write / remove) and writes the snapshot IT returns, `labelCheck`
 *     included. A `runs-undeclared` leg with no block gets NO snapshot (`not-taken-undeclared`) and governs `not-config-source-leg`.
 *   - the capture is taken under `labCaptureScopes` (the SHIPPING `captureScopesFor`: Git lane, Config scope and its protocol as ONE
 *     object) WITH its served-side evidence (`prepareHeldCaptureWithEvidence`); the evidence never leaves this function.
 *   - L-CS-O-b  the comparison RECORD `fileSourceCompare` is made by the SHIPPING `runLegFileSourceCompare` with the inputs the core
 *     passes, then `finaliseFileSourceCompare` over the lab store. No service is called and no fixture caller is built: the
 *     platform compares two texts it holds. A `platformDrift` plant on such a leg is refused (it can never reach a prompt), and an
 *     observability leaf must never carry `platformDriftCalls` (asserted).
 *   - L-CS-O-c  `gitLiveDrift`, `configSourceReads`, `liveEvidence` and the stamped `fileSourceCompare` come from the SHIPPING nets,
 *     handed the record, and are cross-checked against `computeFileGitLiveDrift`, `computeFileConfigSourceReads`,
 *     `computeConfigLiveEvidenceFromReadRecord` and `validFileCompareRecord`. NEVER `computeConfigLiveEvidence(sources, toolCalls)`
 *     on such a leg — it throws on a `service-held` row by design (register CONFIG-SOURCES-OBS-JOIN-PRECONDITIONS item 30).
 *   - the NO-BLOCK arm (`isUndeclaredRunsLeg`): the leg's `not-config-source-leg` resolution is passed THROUGH as production passes
 *     it (every consumer keys on the STATE, never on truthiness); the Git lane is OFF; the nets get a RESOLVED owning leg and the
 *     capture's `heldBytes` digest, and stamp `configSourceReads` with the `undeclared` key and NOTHING else — cross-checked against
 *     `undeclaredConfigSourceReads`.
 *
 * BASE ARM = PRODUCTION TODAY: `armConfigSources` is null below the released Config-sources version, and every function here then
 * returns the snapshot object it was given (`not-stamped-version`), so a base arm's bytes cannot move.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { Snapshot } from './snapshot';
import { buildLabHeldStore, buildLabCapture, buildLabCaptureFromResult, frozenHarvesterEntry, type LabHeldStore } from './held-store';
import { runLeafNetsFor } from './nets';
import { armConfigSources, configLegOf, labCaptureScopes, legProtocolStamped } from './config-sources-arm';
import { isHeldCapableLeg, isUndeclaredRunsLeg } from '../../lib/agents/harness/held-bytes/variant';
import { LIVE_EVIDENCE_READERS, GIT_DEVICE_COMPARISON_READERS } from '../../lib/agents/harness/context-chainer';
import { readConfigSourcesSnapshot, sameConfigDeclaration, CONFIG_SOURCES_SNAPSHOT_KEY } from '../../lib/agents/harness/config-sources';
import { governingConfigSources, configSnapshotDecision, type LegConfigSourcesResolution } from '../../lib/agents/harness/config-sources-read';
import { computeConfigSourceReads, computeConfigLiveEvidence, computeFileConfigSourceReads, computeConfigLiveEvidenceFromReadRecord,
  undeclaredConfigSourceReads } from '../../lib/agents/harness/config-source-facts';
import { computeGitLiveDrift, computeFileGitLiveDrift, gitLiveDriftCallsService, gitLiveDriftPlatformCompares, validFileCompareRecord,
  validateCompareResult, type PlatformDriftCall } from '../../lib/agents/harness/git-live-drift';
import { finaliseFileSourceCompare } from '../../lib/agents/harness/file-source-compare';
import { quotableLine } from '../../lib/agents/harness/file-compare-quote-seam';
import { runLegFileSourceCompare } from '../../lib/services/file-source-compare-run';
import { liveEvidenceVersionApplies } from '../../lib/agents/harness/live-evidence';
import { buildHeldBytesDigest } from '../../lib/agents/harness/held-bytes/held-bytes-fact';
import { runPlatformDriftCalls, type DriftCaller, type DriftCallOutcome, type HeldFileForDrift } from '../../lib/agents/harness/platform-drift-run';
import { configSourceForce, type ConfigForce } from '../../lib/agents/harness/held-bytes/config-source-scope';
import { PLACEHOLDER, isR10Disabled } from '../../lib/agents/harness/redact-artifact-secrets';
// The hub's manifest limit — a constants-only module (requires `crypto` alone); the lab never loads the hub or its caller.
import * as hubDriftConfig from '../../lib/mcp/server/config/platform-drift-call';
const PLATFORM_DRIFT_MANIFEST_MAX_BYTES: number = hubDriftConfig.PLATFORM_DRIFT_MANIFEST_MAX_BYTES;

const sha = (t: string) => createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');
const HARVESTER_ROLE = 'infra_state_harvester';
/** The stamps a Config-sources Harvester gets, in the registry's order: four for a protocol whose drift method is a service call
 *  or none (Kubernetes, Terraform), and `fileSourceCompare` — the platform's own comparison record — in place of
 *  `platformDriftCalls` for a protocol the platform compares (observability; STEP 3 slice L, P3-BUILD §8a item 12). */
export const CONFIG_FACT_KEYS = ['liveEvidence', 'configSourceReads', 'platformDriftCalls', 'gitLiveDrift', 'fileSourceCompare'] as const;
export type ConfigFactKey = typeof CONFIG_FACT_KEYS[number];
/** The committed contract fixture: one REAL result of the compare tool (make_contract_fixture.py; checked by the tool's own tests). */
export const CONTRACT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'git-live-drift', 'compare-result.json');

// ───────────────────────────── L-CS-K-a: the first-execution snapshot ─────────────────────────────

export interface ConfigSnapshotReport { state: 'taken' | 'no-leg' | 'not-config-source-protocol' | 'already-snapshotted' | 'not-taken-undeclared';
  protocol?: string; contractKey?: string; resolution?: string; source?: string; entries?: number; takenAt?: string;
  /** the stored label check's state (`resolved` / `problem`), when the protocol has a label table and the block parsed */ labelCheck?: string | null }

/**
 * STEP 3 slice L (P3-BUILD §8a item 9): the snapshot is production's — the SHIPPING `configSnapshotDecision` decides
 * (none / write / remove) and builds the snapshot object, `labelCheck` included; the lab copies no rule. It is asked with an EMPTY
 * awaiting list ("as if the row's text had shipped" — the defaulted parameter every reader of the list takes), because the node
 * exists to model the leg's first execution UNDER the Config-sources text; an arm below that text never reads the key.
 *   write   ⇒ `taken` (the decision's own snapshot, read back through the shipping reader and governing rule)
 *   remove  ⇒ `not-taken-undeclared`: a `runs-undeclared` leg (observability) with no block gets NO snapshot and governs
 *             `not-config-source-leg` — it runs as it did before the protocol had a Config lane. The snapshot is returned unchanged.
 */
export function withFirstExecutionConfigSnapshot(snap: Snapshot): { snap: Snapshot; report: ConfigSnapshotReport } {
  const leg = snap.leg as Record<string, any> | null;
  if (!leg || leg.type !== 'PIPELINE') return { snap, report: { state: 'no-leg' } };
  const c = configLegOf(leg);
  if (!c) return { snap, report: { state: 'not-config-source-protocol' } };
  if (c.snapshot !== undefined && c.snapshot !== null) return { snap, report: { state: 'already-snapshotted', protocol: c.protocol } };
  const meta = (leg.metadata ?? {}) as Record<string, any>;
  if (typeof meta.protocolResolvedAt !== 'string') throw new Error(`L-CS-K-a: leg ${leg.id} has no stamped protocolResolvedAt (the snapshot's takenAt)`);
  const decision = configSnapshotDecision({ type: leg.type, protocol: c.protocol, description: c.description, interfaceContract: c.contract, takenAt: meta.protocolResolvedAt }, []);
  if (decision.action === 'none') throw new Error(`L-CS-K-a: configSnapshotDecision answers "none" for ${c.protocol} on leg ${leg.id} — the lane table and the decision disagree`);
  if (decision.action === 'remove') {
    const gov = governingConfigSources({ description: c.description, contract: c.contract, snapshot: null, protocolStamped: legProtocolStamped(leg) }, c.protocol);
    if (gov.state !== 'not-config-source-leg') throw new Error(`L-CS-K-a: an undeclared leg must govern not-config-source-leg, it reads ${gov.state}`);
    return { snap, report: { state: 'not-taken-undeclared', protocol: c.protocol, contractKey: c.contractKey, resolution: 'absent' } };
  }
  const resolution = decision.snapshot.resolution;
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  const cl = copy.leg as Record<string, any>;
  cl.metadata = { ...(cl.metadata ?? {}), [CONFIG_SOURCES_SNAPSHOT_KEY]: decision.snapshot };
  const back = readConfigSourcesSnapshot(cl.metadata);
  if (!back || back === 'unreadable') throw new Error(`L-CS-K-a: the simulated snapshot does not read back (${String(back)})`);
  const stamped = legProtocolStamped(cl);
  const gov = governingConfigSources({ description: c.description, contract: c.contract, snapshot: cl.metadata[CONFIG_SOURCES_SNAPSHOT_KEY], protocolStamped: stamped }, c.protocol);
  if (gov.state === 'not-config-source-leg' || gov.state === 'could-not-check' || gov.state.startsWith('snapshot-')) {
    throw new Error(`L-CS-K-a: governing declaration reads ${gov.state} right after the snapshot${stamped ? '' : ` — leg ${leg.id} carries no metadata.protocol stamp, so production reads a snapshot on it as unreadable (rule A9); a first-execution snapshot is modelled only on a stamped leg`}`);
  }
  // A stored label check that names a problem governs as `unparseable` with THAT problem (rule A1) — the governing rule's answer, not a lab fault.
  const labelProblem = decision.snapshot.labelCheck?.state === 'problem' && resolution.state === 'parsed';
  if (!labelProblem && !sameConfigDeclaration(gov as never, resolution)) throw new Error('L-CS-K-a: governing declaration differs from the snapshot');
  return { snap: copy, report: { state: 'taken', protocol: c.protocol, contractKey: c.contractKey, resolution: resolution.state,
    source: (resolution as { source?: string }).source, entries: resolution.state === 'parsed' ? resolution.entries.length : 0, takenAt: meta.protocolResolvedAt,
    ...(decision.snapshot.labelCheck ? { labelCheck: decision.snapshot.labelCheck.state } : {}) } };
}

// ───────────────────────────── L-CS-K-b: the platform drift call record, fixture caller ─────────────────────────────

const OUTCOME_KINDS = ['no-compare-tool', 'refused', 'foreign-service', 'tool-refused', 'failed'] as const;
export type DriftOutcomeKind = typeof OUTCOME_KINDS[number];
/** What the compare tool "answers" in a cell. NEVER a fact, never a call record: a tool-shaped RESULT, or a named call outcome. */
export type DriftPlant =
  | { caller: 'contract-fixture' }
  | { caller: 'result'; file: string }
  | { caller: 'outcome'; outcome: DriftOutcomeKind };
export interface DriftPlantSpec { default?: DriftPlant; byLabel?: Record<string, DriftPlant> }

function checkPlant(p: unknown, where: string): DriftPlant {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error(`${where}: a drift plant is an object { caller: 'contract-fixture' | 'result' | 'outcome' }`);
  const o = p as Record<string, unknown>;
  const allowed = o.caller === 'contract-fixture' ? ['caller'] : o.caller === 'result' ? ['caller', 'file'] : o.caller === 'outcome' ? ['caller', 'outcome'] : null;
  if (!allowed) throw new Error(`${where}: caller must be 'contract-fixture', 'result' or 'outcome' (got ${JSON.stringify(o.caller)})`);
  const extra = Object.keys(o).filter((k) => !allowed.includes(k));
  // A hand-built fact (or call record) has no field here: the fact is only ever computed by the shipping function from a tool-shaped result.
  if (extra.length) throw new Error(`${where}: field(s) ${extra.join(', ')} refused — a drift plant names what the compare tool ANSWERS (a result file in the tool's shape, or a call outcome); the call record and the fact are computed by the shipping code, never supplied`);
  if (o.caller === 'result' && (typeof o.file !== 'string' || !o.file)) throw new Error(`${where}: caller 'result' needs a file`);
  if (o.caller === 'outcome' && !OUTCOME_KINDS.includes(o.outcome as DriftOutcomeKind)) throw new Error(`${where}: outcome must be one of ${OUTCOME_KINDS.join(', ')}`);
  return o as unknown as DriftPlant;
}
export function checkDriftPlantSpec(spec: unknown, where: string): DriftPlantSpec {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`${where}: platformDrift is an object { default?, byLabel? }`);
  const o = spec as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => k !== 'default' && k !== 'byLabel');
  if (extra.length) throw new Error(`${where}: platformDrift field(s) ${extra.join(', ')} refused — only 'default' and 'byLabel' (a hand-built fact or call record is never accepted)`);
  const out: DriftPlantSpec = {};
  if (o.default !== undefined) out.default = checkPlant(o.default, `${where}.default`);
  if (o.byLabel !== undefined) {
    if (!o.byLabel || typeof o.byLabel !== 'object' || Array.isArray(o.byLabel)) throw new Error(`${where}.byLabel: an object keyed by the declared file label`);
    out.byLabel = Object.fromEntries(Object.entries(o.byLabel as Record<string, unknown>).map(([k, v]) => [k, checkPlant(v, `${where}.byLabel.${k}`)]));
  }
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** The tool-shaped result of a fixture file (`{ manifest?, redactedMarker?, result }`, the contract fixture's own layout). */
export function loadCompareResult(file: string): Obj {
  const j = JSON.parse(fs.readFileSync(file, 'utf8')) as Obj;
  if (!isObj(j) || !isObj(j.result)) throw new Error(`L-CS-K-b: ${file} carries no "result" object (the contract fixture's layout: { manifest, redactedMarker, result })`);
  return j.result;
}

/**
 * PROBED SHAPE: a result file other than the contract fixture must be the tool's shape as the fixture shows it — the same top-level
 * keys, every object carrying only keys the fixture's objects of the SAME state carry, every difference entry `{ difference, path }`
 * — and must pass the SHIPPING validator once the sha echo is set. A file that is not is refused by name: a cell fed an invented
 * shape would measure a result the tool cannot return.
 */
/** L-CS-K (2026-11-16): the not-compared reasons the tool decides AFTER it has set the object's `namespace` (declared_compare.py
 *  `compare_manifest`: `entry["namespace"]` is written before `get_live`, so `name-or-namespace-invalid`, `live-read-failed` and
 *  `too-many-declared-fields` carry it for a namespaced kind). The contract fixture shows only not-compared objects decided BEFORE
 *  that line (a Secret, a non-allowlisted kind), so its key union lacks `namespace` for this state. Pinned to the tool's source
 *  order in LCK8 — a reorder there turns this allowance red. `detail` is NOT allowed (it must never reach a render; sec-ops). */
export const NAMESPACED_NOT_COMPARED_REASONS: readonly string[] = ['name-or-namespace-invalid', 'live-read-failed', 'too-many-declared-fields'];
export function probedShapeProblems(result: Obj, contract: Obj = loadCompareResult(CONTRACT_FIXTURE)): string[] {
  const out: string[] = [];
  const keys = (o: Obj) => Object.keys(o).sort().join(',');
  if (keys(result) !== keys(contract)) out.push(`top-level keys ${keys(result)} ≠ the contract fixture's ${keys(contract)}`);
  const byState = new Map<string, Set<string>>();
  for (const o of (Array.isArray(contract.objects) ? contract.objects : []) as Obj[]) {
    const s = String(o.state); const set = byState.get(s) ?? new Set<string>(); for (const k of Object.keys(o)) set.add(k); byState.set(s, set);
  }
  (Array.isArray(result.objects) ? (result.objects as Obj[]) : []).forEach((o, i) => {
    const base = byState.get(String(o?.state));
    if (!base) { out.push(`objects[${i}]: state ${JSON.stringify(o?.state)} is not one the contract fixture shows`); return; }
    const known = o.state === 'not-compared' && NAMESPACED_NOT_COMPARED_REASONS.includes(String(o.reason)) ? new Set([...base, 'namespace']) : base;
    const stray = Object.keys(o).filter((k) => !known.has(k));
    if (stray.length) out.push(`objects[${i}] (${String(o.state)}): key(s) ${stray.join(', ')} the tool does not return for that state`);
    for (const d of (Array.isArray(o.differing) ? o.differing : []) as Obj[]) if (!isObj(d) || keys(d) !== 'difference,path') out.push(`objects[${i}].differing: an entry is not { difference, path }`);
  });
  return out;
}

export interface DriftCallerLog { label: string; path: string; plant: string; manifestSha256: string; manifestBytes: number }

/**
 * The FIXTURE caller. It is the only thing the lab puts in the place of the hub call, and it calls nothing: it reads a file (or
 * names an outcome) and returns. For a tool-shaped result it sets ONE field, `manifestSha256`, to the sha of the bytes it was
 * handed — the echo the tool computes from its input (sec-ops C1); every other field is the file's. A file whose result then
 * fails the SHIPPING validator, or is not the probed shape, throws out of the lever (never a `call-failed` that hides it).
 */
export function driftCallerFor(spec: DriftPlantSpec, dir: string | null, labelOfPath: (manifestSha: string) => { label: string; path: string } | null,
  log: DriftCallerLog[], problems: string[]): DriftCaller {
  return async ({ manifest }): Promise<DriftCallOutcome> => {
    const manifestSha256 = sha(manifest);
    const who = labelOfPath(manifestSha256);
    const label = who?.label ?? '?';
    const plant = (who && spec.byLabel?.[who.label]) ?? spec.default ?? null;
    if (!plant) { problems.push(`${label}: the platform would call the compare tool for this held file, and the node names no platformDrift plant for it (never stubbed)`); return { kind: 'failed' }; }
    log.push({ label, path: who?.path ?? '?', plant: plant.caller === 'outcome' ? `outcome:${plant.outcome}` : plant.caller === 'result' ? `result:${plant.file}` : 'contract-fixture', manifestSha256, manifestBytes: Buffer.byteLength(manifest, 'utf8') });
    if (plant.caller === 'outcome') return { kind: plant.outcome };
    const file = plant.caller === 'contract-fixture' ? CONTRACT_FIXTURE : path.resolve(dir ?? '.', plant.file);
    const result = { ...loadCompareResult(file), manifestSha256 };
    if (plant.caller === 'result') { const p = probedShapeProblems(result); if (p.length) problems.push(`${label}: ${plant.file} is not the compare tool's probed shape — ${p.join('; ')}`); }
    const v = validateCompareResult(result, manifestSha256);
    if (!v.ok) problems.push(`${label}: ${plant.caller === 'result' ? plant.file : 'the contract fixture'} does not pass the shipping validator (${v.reason})`);
    return { kind: 'result', result };
  };
}

/** (Named `noGitLiveMethod` until STEP 3 slice L: observability HAS a method — one the platform computes itself — and still makes
 *  no service call, so the old name said the wrong thing.)
 *  Production's own test in `runLegPlatformDrift` (platform-drift.ts), by the SHIPPING no-call guard (`gitLiveDriftCallsService`,
 *  Config sources STEP 3 P3 / plan W4): a NAMED protocol for which the platform makes no service call — one with no Git-vs-live
 *  method (terraform-iac) or one whose method the platform computes itself (observability-config: `platform-compare`). An omitted
 *  or empty protocol keeps the lab's older meaning (the Kubernetes arm), unlike production, where the protocol is now required. */
export function noDriftServiceCall(protocol: string | null | undefined): boolean {
  return typeof protocol === 'string' && protocol !== '' && !gitLiveDriftCallsService(protocol);
}

export function heldFilesForDrift(store: LabHeldStore): HeldFileForDrift[] {
  return store.refs.filter((r) => typeof r.target === 'string' && typeof r.path === 'string')
    .map((r) => ({ target: r.target as string, path: r.path as string, content: r.content, sha256: r.blobSha256 }));
}

/** The call record production's `runLegPlatformDrift` would build — `undefined` unless the declaration is `parsed` (nothing is
 *  called, nothing is stamped). The lab passes the SAME inputs; only `call` differs.
 *  `protocol` (Config sources STEP 4 slice 4, D-T1): the OWNING LEG's Config-sources protocol — what the core passes
 *  `runLegPlatformDrift` (`owningLeg.configSourceProtocol`). The method decision is the SHIPPING `gitLiveDriftCallsService`, never a lab
 *  copy: a protocol with no Git-vs-live method (terraform-iac) ⇒ `undefined`, in the same order production tests it (after the
 *  parsed test, before any caller is built) — no fixture caller runs, no record exists, no held byte is "sent". Omitted ⇒ the lab's Kubernetes arm
 *  (production REQUIRES the protocol since STEP 3 P3 and makes no call without one). The lab cannot call `runLegPlatformDrift` itself: it loads the hub. */
export async function labPlatformDriftCalls(input: { sources: LegConfigSourcesResolution; store: LabHeldStore; toolCalls: readonly unknown[]; spec: DriftPlantSpec | null; dir: string | null; protocol?: string | null }):
  Promise<{ calls: PlatformDriftCall[] | undefined; log: DriftCallerLog[] }> {
  if (input.sources.state !== 'parsed') return { calls: undefined, log: [] };
  if (noDriftServiceCall(input.protocol)) return { calls: undefined, log: [] };
  const heldFiles = heldFilesForDrift(input.store);
  const log: DriftCallerLog[] = []; const problems: string[] = [];
  const bySha = new Map(heldFiles.map((f) => [sha(f.content), f]));
  const gitLines = input.sources.entries.filter((e) => e.kind === 'git-file') as Array<{ label: string; path: string }>;
  const who = (s: string) => { const f = bySha.get(s); const l = f ? gitLines.find((x) => `/${x.path}` === f.path) : undefined; return l ? { label: l.label, path: l.path } : null; };
  const calls = await runPlatformDriftCalls({
    sources: input.sources, heldFiles, toolCalls: input.toolCalls, redactedMarker: PLACEHOLDER,
    maxManifestBytes: PLATFORM_DRIFT_MANIFEST_MAX_BYTES, blocked: isR10Disabled() ? 'redaction-off' : null,
    call: driftCallerFor(input.spec ?? {}, input.dir, who, log, problems),
  });
  if (problems.length) throw new Error(`L-CS-K-b: ${problems.join(' | ')}`);
  return { calls: calls ?? undefined, log };
}

// ───────────────────────────── L-CS-K-c: the Harvester stamps, by the shipping nets ─────────────────────────────

export interface ConfigFactsReport {
  state: 'not-config-source-leg' | 'not-stamped-version' | 'already-stamped' | 'computed';
  protocol?: { name: string; version: string } | null;
  harvesterExecutionId?: string; copies?: number;
  declaration?: string; lines?: number;
  /** STEP 3 slice L: the leg is a `runs-undeclared` leg that declares nothing (`isUndeclaredRunsLeg`) — it stamps `configSourceReads`
   *  with the `undeclared` key and nothing else, and nothing is forced. */
  undeclared?: boolean;
  liveEvidence?: { checked: boolean; summary: string | null; reason: string | null };
  gitLiveDrift?: { checked: boolean; reason: string | null; filesCompared: number | null; filesNotChecked: number | null };
  platformDriftCalls?: { outcomes: string[]; fixtureCalls: DriftCallerLog[] } | null;
  /** STEP 3 slice L: the platform's file comparison, per declared label — state and reason only (never a line, a path or a sha). */
  fileSourceCompare?: { files: Array<{ label: string; state: string; reason: string | null }>; capture: Array<{ label: string; outcome: string }> } | null;
  held?: { refs: number; notDeclared: number; serviceNotDeclared?: number; evidenceOnly?: number };
  configForce?: ConfigForce | null;
}
export interface ConfigFactsResult {
  snap: Snapshot; report: ConfigFactsReport;
  /** the Harvester's stamps (null when the arm does not read Config sources) */
  facts: Partial<Record<ConfigFactKey, Record<string, unknown>>> | null;
  sources: LegConfigSourcesResolution | null;
  /** the lab store under the Config scope (declared files only) — the caller's held view must be built from THIS store */
  store: LabHeldStore | null;
  /** the platform call record the stamps were computed from (undefined: nothing was planned — the declaration is not `parsed`) */
  calls?: PlatformDriftCall[];
  /** STEP 3 slice L: the comparison record the stamps were computed from (undefined: none was made) — the nets' `fileSourceCompare` input */
  fileSourceCompare?: Record<string, unknown>;
  /** STEP 3 slice L: the capture's `heldBytes` digest — the nets' `held.heldBytes` input. On EVERY arm since 2026-11-23
   *  (LAB-HELDBYTES-DIGEST-DECLARED-CELLS): it was passed on a no-block `runs-undeclared` leg only, so a declared cell's leaf
   *  `heldBytes` read the net's own `no-capture` fallback beside a capture that held files. The net stamps it only on a held-capable leg. */
  heldBytes?: Record<string, unknown>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** STEP 3 slice L: the `heldBytes` digest of a lab capture, by the SHIPPING builder — what the core stamps on a held-capable
 *  Harvester (execution-core.ts `digestFor('committed')`), or the named no-capture stamp when nothing was planned. */
export function labHeldBytesDigest(store: LabHeldStore, planned: boolean): Record<string, unknown> {
  if (!planned) return { held: 0, refused: {}, reason: 'no-files' };
  return buildHeldBytesDigest({ refs: store.refs as never, refusals: store.refusals as never, storedBytes: store.storedBytes }, undefined, { refWrite: 'committed' }) as unknown as Record<string, unknown>;
}

/**
 * `opts.protocol` — the ARM's composed protocol (every lab.ts call site passes it). `opts.drift` — the node's `platformDrift` plant
 * spec (null ⇒ none: refused by name if the platform WOULD call). `direct.toolCalls` — compute over THESE calls (a live or lab-sample
 * harvest's served calls) with a store built from them, and patch nothing: the snapshot is used only for the leg declaration.
 */
export async function withComputedConfigFacts(snap: Snapshot, opts: { protocol: { name: string; version: string } | null; drift?: DriftPlantSpec | null; dir?: string | null },
  direct?: { toolCalls: unknown[]; executionId: string; taskId: string; text: string }): Promise<ConfigFactsResult> {
  if (!configLegOf(snap.leg)) return { snap, report: { state: 'not-config-source-leg' }, facts: null, sources: null, store: null };
  const injection = opts.protocol ? { delta: { name: opts.protocol.name, version: opts.protocol.version } } : undefined;
  const sources = armConfigSources(snap.leg, injection);
  if (!sources) return { snap, report: { state: 'not-stamped-version', protocol: opts.protocol }, facts: null, sources: null, store: null };
  // STEP 4 D-T1: the leg's Config-sources protocol decides whether the platform calls at all (the core's `configSourceProtocol`).
  const legProtocol = configLegOf(snap.leg)!.protocol;
  // STEP 3 slice L: the two per-protocol answers, each the SHIPPING predicate — never truthiness of `sources`, never a lab table.
  const platformCompares = gitLiveDriftPlatformCompares(legProtocol);
  const undeclared = isUndeclaredRunsLeg(legProtocol, sources.state);
  const arm = { protocolInjection: injection };

  const h = direct ? { executionId: direct.executionId, taskId: direct.taskId } : frozenHarvesterEntry(snap);
  const hTask = (snap.children ?? []).find((c) => c.id === h.taskId) ?? (direct && snap.author.task.id === h.taskId ? snap.author.task : undefined);
  if (!hTask) throw new Error(`L-CS-K-c: the Harvester task ${h.taskId} is not among the snapshot's children`);
  const copy: Snapshot = direct ? snap : JSON.parse(JSON.stringify(snap));
  const arts = direct ? [] : copy.childArtifacts.filter((a) => a.executionId === h.executionId && a.name === 'result.json');
  if (!direct && !arts.length) throw new Error(`L-CS-K-c: the snapshot carries no result.json for the frozen Harvester ${h.executionId}`);
  const stored = direct ? null : JSON.parse(arts[0].content) as Record<string, any>;
  if (stored && CONFIG_FACT_KEYS.some((k) => k !== 'liveEvidence' && stored[k] !== undefined && stored[k] !== null)) {
    // A leg that ran on the Config-sources text carries production's own stamps: left alone, never recomputed over. That holds for the
    // comparison record too (plan §5.2: a replay and the lab hand the STORED record back; neither recomputes it).
    const facts = Object.fromEntries(CONFIG_FACT_KEYS.filter((k) => stored[k] && typeof stored[k] === 'object').map((k) => [k, stored[k]]));
    return { snap, report: { state: 'already-stamped', protocol: opts.protocol, harvesterExecutionId: h.executionId, ...(undeclared ? { undeclared: true } : {}) }, facts, sources, store: buildLabHeldStore(snap, arm),
      ...(isRec(stored.fileSourceCompare) ? { fileSourceCompare: stored.fileSourceCompare } : {}), ...(isRec(stored.heldBytes) ? { heldBytes: stored.heldBytes } : {}) };
  }
  const toolCalls: unknown[] = direct ? direct.toolCalls : (Array.isArray(stored!.toolCalls) ? stored!.toolCalls : []);
  const text: string = direct ? direct.text : String(stored!.finalResponse ?? '');
  const role = direct ? HARVESTER_ROLE : (typeof stored!.agentRole === 'string' ? stored!.agentRole : HARVESTER_ROLE);
  if (role !== HARVESTER_ROLE) throw new Error(`L-CS-K-c: the Harvester ran as ${role}`);

  // The capture under the arm's scopes (the SHIPPING capture and the SHIPPING `captureScopesFor`: an undeclared Git file is refused,
  // never held; a served file of a Git-based label is evidence, never held; a no-block `runs-undeclared` leg reads no Git lane).
  const cap = direct
    ? buildLabCaptureFromResult({ executionId: h.executionId, taskId: h.taskId, povId: (snap.author.task.pov_id as string | null) ?? null,
        resultJson: JSON.stringify({ toolCalls }), scopes: labCaptureScopes(snap.leg, injection) })
    : buildLabCapture(snap, arm);
  const store = cap.store;
  const drift = opts.drift ? checkDriftPlantSpec(opts.drift, 'platformDrift') : null;
  if (drift && noDriftServiceCall(legProtocol)) throw new Error(`L-CS-K-b: platformDrift refused — the platform makes no service call for ${legProtocol} (GIT_LIVE_DRIFT_METHODS: no method, or one the platform computes itself), so a compare-tool answer can never reach a prompt (a plant that cannot reach its reader)`);
  const { calls, log } = await labPlatformDriftCalls({ sources, store, toolCalls, spec: drift, dir: opts.dir ?? null, protocol: legProtocol });

  // L-CS-O-b: the platform's OWN comparison (no service, no caller) — the SHIPPING entry, the inputs the core passes it, then the
  // core's finalise step over what the (lab) store took. `undefined` unless the declaration is `parsed` and the protocol's method is
  // `platform-compare` (the entry's own population test). A warning from it is a lab fault, never swallowed.
  let fileSourceCompare: Record<string, unknown> | undefined;
  if (platformCompares) {
    const warned: string[] = [];
    fileSourceCompare = runLegFileSourceCompare({ sources, protocol: legProtocol, isHarvester: true, versionApplies: liveEvidenceVersionApplies(injection),
      plan: cap.plan as never, evidence: cap.evidence, toolCalls, executionId: h.executionId, logger: { warn: (o) => { warned.push(JSON.stringify(o)); } } });
    if (warned.length) throw new Error(`L-CS-O-b: the shipping file comparison warned on ${h.executionId} — never stubbed: ${warned.join('; ')}`);
    if (fileSourceCompare && isHeldCapableLeg(snap.leg as never)) fileSourceCompare = finaliseFileSourceCompare(fileSourceCompare, cap.plan ? { refs: store.refs, refusals: store.refusals } : null);
    if (sources.state === 'parsed' && !fileSourceCompare) throw new Error(`L-CS-O-b: a parsed ${legProtocol} declaration at its Config-sources version produced no comparison record`);
  }
  // The capture's `heldBytes` digest, as the core stamps it on a held-capable Harvester (execution-core.ts `digestFor('committed')`).
  // The no-block arm reads its file count from it (never a re-extraction); a declared arm's leaf `heldBytes` is now this digest too.
  const heldBytes = labHeldBytesDigest(store, cap.plan !== null);

  // The stamps from the SHIPPING nets, their ctx primed as the core primes it.
  const leaf = await runLeafNetsFor(copy, hTask as never, role, text, h.executionId, toolCalls, injection, {}, undefined, calls,
    { ...(fileSourceCompare ? { fileSourceCompare } : {}), ...(heldBytes ? { heldBytes } : {}) });
  const bad = CONFIG_FACT_KEYS.filter((k) => leaf.errors[k]);
  if (bad.length) throw new Error(`L-CS-K-c: the shipping Harvester nets errored on ${bad.map((k) => `${k} (${leaf.errors[k]})`).join(', ')} — never stubbed`);
  const facts: Partial<Record<ConfigFactKey, Record<string, unknown>>> = {};
  for (const k of CONFIG_FACT_KEYS) if (leaf.stamped[k] !== undefined) facts[k] = leaf.stamped[k];
  // Cross-check: each stamp IS the shipping pure function's answer over these inputs (a lever that drifted from it throws).
  if (undeclared) {
    // L-CS-O (the no-block arm): ONE stamp, with the `undeclared` key, and nothing else — as a resolved `runs-undeclared` leg stamps.
    if (!same(facts.configSourceReads, undeclaredConfigSourceReads(heldBytes))) throw new Error('L-CS-O-c: configSourceReads from the shipping nets ≠ undeclaredConfigSourceReads(heldBytes) on a no-block runs-undeclared leg (is the owning leg resolved at the leaf point?)');
    if (!isRec(facts.configSourceReads) || !isRec(facts.configSourceReads.undeclared)) throw new Error('L-CS-O-c: the no-block stamp carries no `undeclared` key');
    const extra = CONFIG_FACT_KEYS.filter((k) => k !== 'configSourceReads' && facts[k] !== undefined);
    if (extra.length) throw new Error(`L-CS-O-c: a no-block runs-undeclared leg stamped ${extra.join(', ')} — production stamps configSourceReads only`);
  } else if (platformCompares) {
    const wantReads = computeFileConfigSourceReads(sources, fileSourceCompare);
    if (!same(facts.configSourceReads, wantReads)) throw new Error('L-CS-O-c: configSourceReads from the shipping nets ≠ computeFileConfigSourceReads(sources, fileSourceCompare)');
    if (!same(facts.liveEvidence, computeConfigLiveEvidenceFromReadRecord(wantReads))) throw new Error('L-CS-O-c: liveEvidence from the shipping nets ≠ computeConfigLiveEvidenceFromReadRecord(the files read record)');
    if (!same(facts.gitLiveDrift, computeFileGitLiveDrift(fileSourceCompare, sources.state, quotableLine))) throw new Error('L-CS-O-c: gitLiveDrift from the shipping nets ≠ computeFileGitLiveDrift(fileSourceCompare, state)');
    const wantRecord = sources.state === 'parsed' ? validFileCompareRecord(fileSourceCompare, quotableLine) ?? undefined : undefined;
    if (!same(facts.fileSourceCompare, wantRecord)) throw new Error('L-CS-O-c: the stamped fileSourceCompare is not the validated comparison record');
    if (sources.state === 'parsed' && !wantRecord) throw new Error('L-CS-O-c: the comparison record does not pass the shipping validator (validFileCompareRecord)');
    if (facts.platformDriftCalls !== undefined || calls !== undefined) throw new Error(`L-CS-O-c: ${legProtocol} carries a platformDriftCalls record — the platform makes no service call for it`);
  } else {
    const wantReads = computeConfigSourceReads(sources, toolCalls);
    if (!same(facts.configSourceReads, wantReads)) throw new Error('L-CS-K-c: configSourceReads from the shipping nets ≠ computeConfigSourceReads(sources, toolCalls)');
    if (!same(facts.liveEvidence, computeConfigLiveEvidence(sources, toolCalls))) throw new Error('L-CS-K-c: liveEvidence from the shipping nets ≠ computeConfigLiveEvidence(sources, toolCalls)');
    // The shipping net passes the OWNING LEG's Config-sources protocol (k8s value-lane P1, git-live-drift-enrichment.ts `methodProtocol`) — so does the cross-check.
    if (!same(facts.gitLiveDrift, computeGitLiveDrift(calls, legProtocol))) throw new Error('L-CS-K-c: gitLiveDrift from the shipping nets ≠ computeGitLiveDrift(platformDriftCalls, protocol)');
    if (calls === undefined ? facts.platformDriftCalls !== undefined : !same(facts.platformDriftCalls, { version: 1, calls })) throw new Error('L-CS-K-c: the stamped platformDriftCalls is not the call record');
    if (facts.fileSourceCompare !== undefined) throw new Error(`L-CS-K-c: ${legProtocol} stamped a fileSourceCompare record — only a protocol the platform compares has one`);
  }

  for (const a of arts) {
    const parsed = JSON.parse(a.content) as Record<string, unknown>;
    a.content = JSON.stringify({ ...parsed, ...facts });
    const back = JSON.parse(a.content) as Record<string, unknown>;
    for (const k of CONFIG_FACT_KEYS) if (!same(back[k], facts[k])) throw new Error(`L-CS-K-c: re-read of ${h.executionId} result.json does not carry the computed ${k}`);
  }
  const le = (facts.liveEvidence ?? {}) as Record<string, any>; const gl = (facts.gitLiveDrift ?? {}) as Record<string, any>;
  const count = (name: string) => store.refusals.filter((r) => r.refusal === name).length;
  const recFiles = isRec(fileSourceCompare) && Array.isArray(fileSourceCompare.files) ? (fileSourceCompare.files as Array<Record<string, unknown>>) : null;
  const recCapture = isRec(fileSourceCompare) && Array.isArray(fileSourceCompare.capture) ? (fileSourceCompare.capture as Array<Record<string, unknown>>) : [];
  return {
    snap: copy, facts, sources, store, ...(calls ? { calls } : {}), ...(fileSourceCompare ? { fileSourceCompare } : {}), ...(heldBytes ? { heldBytes } : {}),
    report: {
      state: 'computed', protocol: opts.protocol, harvesterExecutionId: h.executionId, copies: arts.length,
      declaration: sources.state, lines: sources.state === 'parsed' ? sources.entries.length : 0, ...(undeclared ? { undeclared: true } : {}),
      liveEvidence: { checked: le.checked === true, summary: le.summary ?? null, reason: le.reason ?? null },
      gitLiveDrift: { checked: gl.checked === true, reason: gl.reason ?? null, filesCompared: gl.filesCompared ?? null, filesNotChecked: gl.filesNotChecked ?? null },
      platformDriftCalls: calls ? { outcomes: calls.map((c) => `${c.label}:${c.outcome}`), fixtureCalls: log } : null,
      ...(platformCompares ? { fileSourceCompare: recFiles ? { files: recFiles.map((f) => ({ label: String(f.label), state: String(f.state), reason: typeof f.reason === 'string' ? f.reason : null })),
        capture: recCapture.map((c) => ({ label: String(c.label), outcome: String(c.outcome ?? c.kind) })) } : null } : {}),
      held: { refs: store.refs.length, notDeclared: count('git-file-not-declared'),
        ...(platformCompares ? { serviceNotDeclared: count('service-file-not-declared'), evidenceOnly: count('served-file-evidence-only') } : {}) },
      // THE Config-sources force (the SHIPPING `configSourceForce`, both lists): `git-file-not-held` precedes `service-held-not-held`;
      // null on a leg that declares nothing.
      configForce: configSourceForce(sources, store.refs.map((r) => ({ target: r.target ?? undefined, path: r.path ?? undefined }))),
    },
  };
}

/** The Harvester-entry fields a consumer of the given role is carried (context-chainer.ts: `liveEvidence` to LIVE_EVIDENCE_READERS,
 *  whatever `checked` says; `gitLiveDrift` only when `checked`, to GIT_DEVICE_COMPARISON_READERS). Uses the SHIPPING reader sets. */
export function configEntryFieldsFor(role: string, facts: ConfigFactsResult['facts']): Record<string, unknown> {
  if (!facts) return {};
  const le = facts.liveEvidence; const gl = facts.gitLiveDrift;
  return {
    ...(le && typeof le === 'object' && !Array.isArray(le) && LIVE_EVIDENCE_READERS.has(role) ? { liveEvidence: le } : {}),
    ...(gl && typeof gl === 'object' && !Array.isArray(gl) && gl.checked === true && GIT_DEVICE_COMPARISON_READERS.has(role) ? { gitLiveDrift: gl } : {}),
  };
}
