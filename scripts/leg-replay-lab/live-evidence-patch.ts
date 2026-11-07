/**
 * Leg replay lab — L-CS-a (Config sources network step; model-evaluation B1, DESIGN v2 §3.4): the network Harvester's `liveEvidence`
 * for a stored Harvester that PREDATES the fact (every stored network leg — the fact ships with push 1a).
 *
 * Same pattern as L-N2-c (device-comparison-patch.ts): production stamps `liveEvidence` at the Harvester's leaf-persist (`point:
 * 'harvester'`), the Author leaf TRANSCRIBES it (`point: 'author-transcription'` + `harvesterExecutionId`) and the leg hoists it; the
 * Architect, the Author and the leg Reviewer read it (§6). A golden cell or a bench node replays a frozen chain that carries none, so
 * the 1.26.0 Reviewer would never see the fact R1 v2 clause (b) keys on. This module computes the stamp with the SHIPPING pure function
 * over the frozen Harvester's stored `toolCalls` and the leg's declaration (through the shipping grammar, AFTER any input edit, under
 * the arm's bound kind gate) and returns a snapshot COPY whose Harvester result.json carries it — every stored copy, re-read (LK11).
 * An artifact that already carries the key is left alone. The cached snapshot is never written. Computing a platform fact over a
 * case's OWN stored inputs is legitimate (ME review Q2); feeding a new block is not.
 *
 * THE SEAM (execution-facts owns the function, built on branch cs-net-1a-facts; signature confirmed 2026-11-04):
 *   lib/agents/harness/live-evidence.ts
 *     export function computeLiveEvidence(sources: LegDeviceSourcesResolution, toolCalls: unknown, interfaceContract?: unknown): Record<string, unknown>
 *   CONTRACT-DEVICES FOLD (2026-11-05, owner option 1): the THIRD parameter is the owning leg's stored `inputContext.interfaceContract`
 *   (`deviceLegOf(...).contract` — the same contract production's Harvester enrichment reads off the leg row); the fact then carries
 *   `contractDevices` + `contractNotDeclared`. The loader pins arity 3, so a two-argument seam is refused rather than run contract-blind.
 *   pure; counts top level (items, liveDeclared, liveRead, liveNotRead[], gitOnly[], notApplicable, summary); non-parsed states pass
 *   through by name (checked:false, reason device-sources-<state>). NOT_STAMPED (off a network leg, value legs, version < 1.26.0) is the
 *   ENRICHMENT's decision, outside the pure function — the lab computes unconditionally on the legs it patches.
 * While that module is ABSENT from the tree (this branch, before S-2 — the merged 1a tree) the loader returns null and the patch reports
 * `not-built`: the snapshot is returned UNCHANGED (every existing experiment's bytes stand) and an experiment that sets
 * `requireLiveEvidence: true` is refused at the dry run. The fact is NEVER stubbed in a lab arm.
 *
 * CARRY (mirrors context-chainer.ts on cs-net-1a-facts a692e2542, read 2026-11-04): LIVE_EVIDENCE_READERS = Architect, Author, leg
 * Reviewer; carried from a LEAF dependency that stamped it, whatever `checked` says. The lab puts the computed Harvester stamp on the
 * Harvester entry of the Architect's and the Author's frozen context (lab.ts), and carries the replayed Author's leaf TRANSCRIPTION to the
 * Reviewer (chain.ts chainEntryFromResult; the leaf net reads the Harvester stamp through replay-prisma's `liveEvidence` projection).
 * Rendered by the shipping `renderLiveEvidenceForPrompt` through rebuildPrompt — the lab renders nothing itself.
 */
import * as path from 'path';
import { resolveLegDeviceSources, contractDeviceSourcesValue } from '../../lib/agents/harness/device-sources';
import { deviceSourceLaneOfLeg, deviceSourceContractKeyOf } from '../../lib/agents/harness/held-bytes/variant';
import { liveEvidenceOptionsFor } from '../../lib/agents/harness/live-evidence-enrichment';
import { resolveTaskProtocol } from '../../lib/agents/harness/program-protocol';
import { deviceLegOf, frozenHarvesterEntry } from './held-store';
import type { Snapshot } from './snapshot';

export type ComputeLiveEvidence = (sources: unknown, toolCalls: unknown, interfaceContract: unknown, opts?: Record<string, unknown>) => Record<string, unknown>;

/** VLG-LAB-TOOLING B9 (2026-11-07), ONE definition since 44cf00704: the leg's contract key, and the fact's options from the SHIPPING
 *  `liveEvidenceOptionsFor(owningLeg, protocolInjection)` (live-evidence-enrichment.ts) — change lane: skip the value lane's keys, and the
 *  `git-only` word from network-provisioning 1.27.0 (GIT_ONLY_WORD_MIN_VERSIONS, keyed on the HARVESTER's composed protocol); value lane:
 *  the word always. The owning-leg resolution is production's for the leg row itself (a PIPELINE row resolves to `self`; only its lane is
 *  read). Pinned against the shipping enrichment by LVLG8. */
export function laneOf(leg: { id?: string; title?: string | null; metadata?: unknown } | null | undefined, protocol?: { name: string; version: string } | null): { contractKey: string | undefined; opts: Record<string, unknown> } {
  const legProtocol = leg ? resolveTaskProtocol(leg as never).protocol : null;
  const lane = leg ? deviceSourceLaneOfLeg(leg as never) : null;
  const owning = leg ? { kind: 'self' as const, legId: String(leg.id ?? ''), heldCapable: false, deviceSource: lane !== null, ...(lane === 'value' ? { deviceSourceLane: 'value' as const } : {}) } : null;
  const opts = liveEvidenceOptionsFor(owning as never, protocol ? { delta: { name: protocol.name, version: protocol.version } } : undefined) as unknown as Record<string, unknown>;
  return { contractKey: deviceSourceContractKeyOf(legProtocol) ?? undefined, opts };
}
export type LiveEvidenceVersionApplies = (protocolInjection: unknown) => boolean;
export const LIVE_EVIDENCE_MODULE = path.join(__dirname, '..', '..', 'lib', 'agents', 'harness', 'live-evidence');

/** The shipping pure function, or null when the module is not in this tree. Any OTHER load failure (a syntax error, a missing or
 *  differently-shaped export) throws loudly — never a silent null. */
export function loadLiveEvidenceComputer(modulePath = LIVE_EVIDENCE_MODULE): ComputeLiveEvidence | null {
  let resolved: string;
  try { resolved = require.resolve(modulePath); } catch { return null; }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require(resolved) as { computeLiveEvidence?: unknown };
  if (typeof m.computeLiveEvidence !== 'function') throw new Error(`L-CS-a: ${resolved} does not export computeLiveEvidence(sources, toolCalls, interfaceContract) — the seam changed; re-read the module`);
  if ((m.computeLiveEvidence as (...a: unknown[]) => unknown).length !== 3) throw new Error(`L-CS-a: computeLiveEvidence takes ${(m.computeLiveEvidence as (...a: unknown[]) => unknown).length} parameters, the seam expects 3 (sources, toolCalls, interfaceContract)`);
  return m.computeLiveEvidence as ComputeLiveEvidence;
}

/** The shipping POPULATION rule (`liveEvidenceVersionApplies`, the enrichment's NOT_STAMPED-below-1.26.0 check), or null when the module
 *  is absent. ME-B4 gate (2026-11-04): without it the lab stamped the fact on 1.25.0 arms, which production never does — a golden
 *  companion on today's text rendered a §6 line the deployed platform would not send. */
export function loadLiveEvidenceVersionApplies(modulePath = LIVE_EVIDENCE_MODULE): LiveEvidenceVersionApplies | null {
  let resolved: string;
  try { resolved = require.resolve(modulePath); } catch { return null; }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require(resolved) as { liveEvidenceVersionApplies?: unknown };
  if (typeof m.liveEvidenceVersionApplies !== 'function') throw new Error(`L-CS-a: ${resolved} does not export liveEvidenceVersionApplies(protocolInjection) — the seam changed`);
  return m.liveEvidenceVersionApplies as LiveEvidenceVersionApplies;
}

export interface LiveEvidencePatchReport {
  state: 'not-device-source-leg' | 'not-built' | 'not-stamped-version' | 'already-stamped' | 'computed';
  /** the arm's composed protocol the population rule was asked about (null ⇒ the caller named none: computed unconditionally) */
  protocol?: { name: string; version: string } | null;
  harvesterExecutionId?: string;
  copies?: number;
  summary?: string | null;
  counts?: Record<string, unknown>;
}

/** `opts.protocol` — the ARM's composed protocol (name + the version production would stamp: the candidate's declared version on a
 *  candidate arm). When given, production's population rule decides first: below the released Config-sources version the fact is
 *  NOT_STAMPED in production, so the lab leaves the snapshot unchanged (`not-stamped-version`). Every lab.ts call site passes it. */
/** `direct.toolCalls` (L-CS-N ARCH-LR): compute over THESE calls (a lab-sample harvest's served calls) and return the fact without patching
 *  any artifact — the snapshot is used only for the leg declaration. */
export function withComputedLiveEvidence(snap: Snapshot, compute: ComputeLiveEvidence | null = loadLiveEvidenceComputer(),
  opts: { protocol?: { name: string; version: string } | null; versionApplies?: LiveEvidenceVersionApplies | null } = {},
  direct?: { toolCalls: unknown[] }): { snap: Snapshot; report: LiveEvidencePatchReport; fact: Record<string, unknown> | null } {
  const leg = deviceLegOf(snap.leg as never);
  if (!leg) return { snap, report: { state: 'not-device-source-leg' }, fact: null };
  if (!compute) return { snap, report: { state: 'not-built' }, fact: null };
  if (opts.protocol) {
    const applies = opts.versionApplies ?? loadLiveEvidenceVersionApplies();
    if (!applies) throw new Error('L-CS-a: computeLiveEvidence is present but liveEvidenceVersionApplies is not — the seam changed');
    if (!applies({ delta: { name: opts.protocol.name, version: opts.protocol.version } })) return { snap, report: { state: 'not-stamped-version', protocol: opts.protocol }, fact: null };
  }
  if (direct) {
    const ln = laneOf(snap.leg as never, opts.protocol ?? null);
    const sources = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(leg.contract, ln.contractKey), taskBody: leg.description });
    const computed = compute(sources, direct.toolCalls, leg.contract, ln.opts);
    const fact: Record<string, unknown> = 'point' in computed ? computed : { ...computed, point: 'harvester' };
    return { snap, fact, report: { state: 'computed', copies: 0, summary: (fact.summary as string) ?? null } };
  }
  const h = frozenHarvesterEntry(snap);
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  const arts = copy.childArtifacts.filter((a) => a.executionId === h.executionId && a.name === 'result.json');
  if (!arts.length) throw new Error(`L-CS-a: the snapshot carries no result.json for the frozen Harvester ${h.executionId}`);
  const first = JSON.parse(arts[0].content) as Record<string, unknown>;
  if (first.liveEvidence && typeof first.liveEvidence === 'object') {
    return { snap, report: { state: 'already-stamped', harvesterExecutionId: h.executionId }, fact: first.liveEvidence as Record<string, unknown> };
  }
  const ln = laneOf(snap.leg as never, opts.protocol ?? null);
  const sources = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(leg.contract, ln.contractKey), taskBody: leg.description });
  const computed = compute(sources, first.toolCalls ?? [], leg.contract, ln.opts);
  if (!computed || typeof computed !== 'object') throw new Error('L-CS-a: computeLiveEvidence returned no object');
  const fact: Record<string, unknown> = 'point' in computed ? computed : { ...computed, point: 'harvester' };
  for (const a of arts) {
    const parsed = JSON.parse(a.content) as Record<string, unknown>;
    a.content = JSON.stringify({ ...parsed, liveEvidence: fact });
    const back = JSON.parse(a.content) as Record<string, unknown>;
    if (JSON.stringify(back.liveEvidence) !== JSON.stringify(fact)) throw new Error(`L-CS-a: re-read of ${h.executionId} result.json does not carry the computed stamp`);
  }
  const counts: Record<string, unknown> = {};
  for (const k of ['items', 'liveDeclared', 'liveRead', 'liveNotRead', 'gitOnly', 'notApplicable']) if (k in fact) counts[k] = fact[k];
  return { snap: copy, fact, report: { state: 'computed', harvesterExecutionId: h.executionId, copies: arts.length, summary: (fact.summary as string) ?? null, counts } };
}
