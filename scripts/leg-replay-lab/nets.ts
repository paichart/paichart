/**
 * Leg replay lab — the SHIPPING mechanical nets over a replayed package.
 *
 * Two invocation points, exactly as production runs them (lib/services/execution-nets.ts `stampExecutionNets`):
 *   - `leaf-persist` on the Author (markerPresence, rollbackContainment compute half) — these are the facts the
 *     chainer carries into the Reviewer's §6, so they are computed BEFORE the Reviewer is rebuilt;
 *   - `leg-synthesize` on the owning leg, after the review (derivationContainment, dialectLint, contractPropagation,
 *     rollbackContainment hoist) — what the leg's card and the program gate would read.
 * Both run `runNetsAtPoint` over `MECHANICAL_NETS` with a context from the shipping `buildNetContext`; the only lab
 * part is the Prisma client (replay-prisma.ts), which serves the snapshot with the replayed executions added.
 *
 * `verdictFreshness` is EXCLUDED by design: it compares the Reviewer's frozen chained input against later Author
 * runs of the same task, which is a statement about production history that a replay cannot make true or false.
 *
 * `computeFormCheckFact` (toolLoop.formCheck, not a registry net) is stamped by the live runner at the same point
 * execution-core stamps it — see live.ts.
 */
import { MECHANICAL_NETS } from '../../lib/agents/harness/mechanical-nets';
import { runNetsAtPoint } from '../../lib/agents/harness/net-registry';
import { buildNetContext } from '../../lib/agents/harness/net-context';
import { isProgramHarnessTask } from '../../lib/agents/harness/program-protocol';
import { buildReplayPrisma, taskRowToPrisma, type ReplaySubstitution, type ReplayPrismaOptions } from './replay-prisma';
import type { Snapshot } from './snapshot';
import { armConfigSources, armOwningLeg, armLeafOwningLeg } from './config-sources-arm';

/** What a lab caller hands a leaf's nets beside the text. `platformDriftCalls` and `fileSourceCompare` are lab-only CARRIER fields
 *  (each is its own ctx input in production, never inside `held`); every other field is the core's `held` object.
 *  `fileSourceCompare` (STEP 3 slice L): the platform's file-comparison record for a Harvester of a `platform-compare` protocol —
 *  the record the lab made with the SHIPPING `runLegFileSourceCompare`, or the STORED record of a persisted Harvester (a replay hands
 *  it back and never recomputes it, plan §5.2). `editHunkFiles` / `storedEditFacts`: the Author point's inputs for `baseMatch` and
 *  the overlap fact (net-registry.ts `held`). */
export interface LabNetHeld { editApplication?: Record<string, unknown> | null; heldBytes?: Record<string, unknown> | null; baseHeldHandles?: readonly string[] | null;
  platformDriftCalls?: readonly unknown[] | null; fileSourceCompare?: unknown;
  editHunkFiles?: readonly unknown[] | null; storedEditFacts?: ReadonlyMap<string, { baseMatch?: unknown; editOverlap?: unknown }> | null;
  /** planWitness lever (plan-witness-lever.ts): the core's key read, absent below terraform-iac 1.17.0 */ planWitnessKeys?: unknown }
const CARRIER_KEYS = ['platformDriftCalls', 'fileSourceCompare'] as const;

export const LEG_NETS_EXCLUDED: Record<string, string> = {
  verdictFreshness: 'compares the Reviewer\'s frozen chained input with later production Author runs — not meaningful for a replay',
};

export interface NetRun {
  point: 'leaf-persist' | 'leg-synthesize';
  stamped: Record<string, Record<string, unknown>>;
  /** Nets whose enrichment THREW (stub-unsupported shapes included) — their stamped value is the net's errorFact. */
  errors: Record<string, string>;
  notApplicable: string[];
  queries: string[];
}

/** `toolCalls` (2026-10-13): the node execution's own result.json `toolCalls`, as production hands them to the nets
 *  (execution-nets.ts reads them off the BUILT resultJson). Omitted ⇒ `[]`, as before — the stubbed Author's calls carry
 *  nothing a net reads; a recorded-tools Harvester passes its served calls so `quoteFidelity` (harvest point) has its witness. */
/** `held` (PLATFORM-HELD-BYTES Stage B): the variant stamps the core builds pre-tx and hands the nets (`editApplication` on a
 *  held-variant Author) — absent on every other node, exactly as in production. */
/** `protocolInjection` (L-CS-N O-2(a), 2026-11-05): the replayed execution's OWN composed protocol injection, as execution-nets.ts hands
 *  it (`resultJson.protocolInjection`) — `{delta: {name, version}}`. Read today only by liveEvidence's population rule (NOT_STAMPED below
 *  network-provisioning 1.26.0). Undefined ⇒ the net ctx carries none (every replay before this lever: NOT_STAMPED). */
/** Config sources STEP 2 (L-CS-K, slice 4): on an arm that composes the Config-sources text (`armConfigSources` — null on every arm
 *  below it, so nothing is passed and every earlier replay is byte-identical) the ctx is PRIMED with the leg's governing declaration,
 *  the object production's core reads once and hands the nets (`buildNetContext({ configSources })`). `held.platformDriftCalls` is the
 *  platform's drift call record the core builds BEFORE the Harvester's persist (config-sources-patch.ts makes it with a fixture
 *  caller); absent ⇒ the ctx carries none, exactly as on every execution that is not a Config-sources Harvester. */
export async function runAuthorLeafNets(snap: Snapshot, role: string, text: string, replayExecutionId: string, toolCalls?: unknown,
  held?: LabNetHeld,
  protocolInjection?: unknown, opts: ReplayPrismaOptions = {}): Promise<NetRun> {
  const { client, queries } = buildReplayPrisma(snap, [{ taskId: snap.author.task.id, executionId: replayExecutionId, resultJson: { finalResponse: text, ...(toolCalls !== undefined ? { toolCalls } : {}) } }], opts);
  const t = taskRowToPrisma(snap.author.task);
  const ctx = buildNetContext({
    prisma: client, task: { id: t.id, type: t.type, metadata: t.metadata, inputContext: snap.author.exec.config?.inputContext ?? t.inputContext },
    agentRole: role, harnessMode: null, finalResponse: text, programTier: false, executionId: replayExecutionId,
    ...(toolCalls !== undefined ? { toolCalls } : {}),
    ...heldInput(held),
    ...(protocolInjection !== undefined ? { protocolInjection } : {}),
    ...labNetConfigInput(snap, protocolInjection, held?.platformDriftCalls, false, held?.fileSourceCompare),
  });
  return runPoint('leaf-persist', ctx, queries);
}

/** VALUE-LEG-GIT (L-VLG-a): the SHIPPING leaf nets for ANY child task row of the snapshot (the Harvester of a value-leg node whose
 *  `author` is its Architect), the replayed text added as that task's newest SUCCESS execution. `legReads` lets the device-source facts
 *  and the value-leg containment net read the leg row (replay-prisma). Same buildNetContext + runNetsAtPoint as runAuthorLeafNets. */
export async function runLeafNetsFor(snap: Snapshot, taskRow: Record<string, any>, role: string, text: string, replayExecutionId: string,
  toolCalls: unknown | undefined, protocolInjection: unknown | undefined, opts: ReplayPrismaOptions = {}, inputContext?: unknown,
  /** Config sources STEP 2: the platform's drift call record for a Config-sources Harvester (see runAuthorLeafNets). */
  platformDriftCalls?: readonly unknown[] | null,
  /** STEP 3 slice L: the Harvester's `fileSourceCompare` record and its `heldBytes` digest (the no-block arm's file count). */
  extra?: { fileSourceCompare?: unknown; heldBytes?: Record<string, unknown> | null }): Promise<NetRun> {
  const { client, queries } = buildReplayPrisma(snap, [{ taskId: String(taskRow.id), executionId: replayExecutionId, resultJson: { finalResponse: text, ...(toolCalls !== undefined ? { toolCalls } : {}) } }], opts);
  const t = taskRowToPrisma(taskRow);
  const ctx = buildNetContext({
    prisma: client, task: { id: t.id, type: t.type, metadata: t.metadata, inputContext: inputContext ?? t.inputContext },
    agentRole: role, harnessMode: null, finalResponse: text, programTier: false, executionId: replayExecutionId,
    ...(toolCalls !== undefined ? { toolCalls } : {}),
    ...(protocolInjection !== undefined ? { protocolInjection } : {}),
    ...(extra?.heldBytes ? { held: { heldBytes: extra.heldBytes } } : {}),
    ...labNetConfigInput(snap, protocolInjection, platformDriftCalls, false, extra?.fileSourceCompare),
  });
  return runPoint('leaf-persist', ctx, queries);
}

/** The leg's SYNTHESIZE view with the replayed Author (and Reviewer, when given) as the authoritative children. */
export async function runLegSynthesizeNets(snap: Snapshot, subs: ReplaySubstitution[], protocolInjection?: unknown): Promise<NetRun | null> {
  if (!snap.leg) return null;
  const { client, queries } = buildReplayPrisma(snap, subs);
  const leg = taskRowToPrisma(snap.leg);
  const programTier = leg.type === 'PIPELINE' && isProgramHarnessTask(leg as never);
  const ctx = buildNetContext({
    prisma: client, task: { id: leg.id, type: leg.type, metadata: leg.metadata, inputContext: leg.inputContext },
    agentRole: leg.agentRole, harnessMode: 'SYNTHESIZE', finalResponse: null, programTier, executionId: 'lab-leg-synthesize',
    ...(protocolInjection !== undefined ? { protocolInjection } : {}),
    ...labNetConfigInput(snap, protocolInjection, undefined, true),
  });
  return runPoint('leg-synthesize', ctx, queries);
}

/** The `held` object the core hands the nets, WITHOUT the lab-only carrier field (`platformDriftCalls` is its own ctx input). */
function heldInput(held?: LabNetHeld): Record<string, unknown> {
  if (!held) return {};
  if (!CARRIER_KEYS.some((k) => k in held)) return { held }; // every caller before slice 4: the object as passed
  const rest: Record<string, unknown> = { ...held };
  for (const k of CARRIER_KEYS) delete rest[k];
  return Object.keys(rest).length ? { held: rest } : {};
}
/** Config sources STEP 2: the ctx inputs production's core supplies on a Config-sources leg at its text version — `{}` on every
 *  other arm (config-sources-arm.ts). `legPoint`: the leg's own SYNTHESIZE also gets the owning-leg resolution the hoist reads. */
/** STEP 3 slice L — THE LEAF POINT'S OWNING LEG (P3-BUILD §8a item 11): production resolves the owning leg for EVERY leaf, and since
 *  this slice so does the lab, on every arm that reads Config sources: `{ kind: 'leg', …, configSourceProtocol }` at a leaf point,
 *  `{ kind: 'self', … }` at the leg's own. A `runs-undeclared` leg with no block NEEDS it (the no-block arm of `configSourceReads`
 *  and the `liveEvidence` hoist stamp only for a RESOLVED leg). For a `forced` protocol it names the protocol the leaf's composed
 *  protocol named before ("a declaration and no leg" — the fallback of `methodProtocol` / `configFactProtocol`), so no earlier cell
 *  moves: MEASURED at the slice (LCK / LCT 21 of 21, and every golden prompt and protocol file byte-identical to `main`). */
export function labNetConfigInput(snap: Snapshot, protocolInjection: unknown, platformDriftCalls?: readonly unknown[] | null, legPoint = false, fileSourceCompare?: unknown): Record<string, unknown> {
  const configSources = armConfigSources(snap.leg, protocolInjection);
  if (!configSources) {
    if (platformDriftCalls !== undefined && platformDriftCalls !== null) throw new Error('lab nets: a platform drift call record was passed on an arm that does not read Config sources — production makes no call there');
    if (fileSourceCompare !== undefined && fileSourceCompare !== null) throw new Error('lab nets: a file-comparison record was passed on an arm that does not read Config sources — production makes none there');
    return {};
  }
  const owningLeg = legPoint ? armOwningLeg(snap.leg, protocolInjection) : armLeafOwningLeg(snap.leg, protocolInjection, snap.author.task.stage_id as string | null);
  return { configSources, ...(platformDriftCalls !== undefined ? { platformDriftCalls } : {}),
    ...(fileSourceCompare !== undefined && fileSourceCompare !== null ? { fileSourceCompare } : {}), ...(owningLeg ? { owningLeg } : {}) };
}

async function runPoint(point: 'leaf-persist' | 'leg-synthesize', ctx: ReturnType<typeof buildNetContext>, queries: string[]): Promise<NetRun> {
  const nets = MECHANICAL_NETS.filter((n) => n.point === point && !LEG_NETS_EXCLUDED[n.name]);
  const notApplicable = nets.filter((n) => !n.appliesTo(ctx)).map((n) => n.name);
  const stamped: Record<string, Record<string, unknown>> = {};
  const errors: Record<string, string> = {};
  await runNetsAtPoint(point, ctx, nets, (n, f) => { stamped[n] = f as Record<string, unknown>; },
    (n, e) => { errors[n] = e instanceof Error ? e.message : String(e); });
  return { point, stamped, errors, notApplicable, queries };
}

/** One line per net for a report row: the disposition / reason / counts, never a verdict. */
export function summarizeFacts(stamped: Record<string, Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, f] of Object.entries(stamped)) {
    if (name === 'markerPresence') {
      out[name] = ['harvestedAllocations', 'derivedValues', 'consumedValues'].map((k) => `${k}:${f[k] === true ? '✓' : f[k] === false ? '✗' : '?'}`).join(' ');
    } else if (name === 'rollbackContainment') {
      const d = (f.rollbackDisposition ?? {}) as Record<string, unknown>;
      out[name] = `${d.disposition ?? '?'} (${d.reason ?? f.reason ?? '?'}) found ${f.restoreLinesFound ?? '-'}/${f.restoreLinesTotal ?? '-'}`;
    } else if (name === 'derivationContainment') {
      const d = (f.containmentDisposition ?? {}) as Record<string, unknown>;
      out[name] = `${d.disposition ?? '?'} (${d.reason ?? f.reason ?? '?'}) violations ${Array.isArray(f.violations) ? f.violations.length : '-'}`;
    } else if (name === 'dialectLint') {
      out[name] = `checked ${f.checked} ${f.reason ?? ''} violations ${Array.isArray(f.violations) ? f.violations.length : '-'}`.trim();
    } else if (name === 'contractPropagation') {
      out[name] = `checked ${f.checked} ${f.reason ?? ''}`.trim();
    } else if (name === 'quoteFidelity') {
      const b = (f.blocks ?? {}) as Record<string, unknown>;
      const d = (f.quoteFidelityDisposition ?? {}) as Record<string, unknown>;
      out[name] = `${d.disposition ?? '?'} (${f.reason ?? '?'}) pairable ${b.pairable ?? '-'} complete ${b.complete ?? '-'} escalating ${b.escalating ?? '-'}`;
    } else if (name === 'reviewerWarnings') {
      out[name] = `checked ${f.checked} ${f.reason ?? ''} count ${f.count ?? '-'} ids [${Array.isArray(f.ids) ? f.ids.join(',') : ''}]`;
    } else {
      out[name] = `checked ${f.checked ?? '?'} ${f.reason ?? ''}`.trim();
    }
  }
  return out;
}
