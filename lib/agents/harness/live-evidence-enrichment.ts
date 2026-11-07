/**
 * Config-sources network push 1a — the IMPURE half of `liveEvidence` (live-evidence.ts). Three points, one fact:
 *
 *   Harvester leaf-persist   COMPUTED from the ctx memo's read record (`ctx.deviceSourceReadRecord`, shared with `deviceSourceReads`)
 *                            over the GOVERNING declaration — never from the sibling `deviceSourceReads` stamp (nets never read each
 *                            other's output: an order-dependent net is a defect).
 *   Author leaf-persist      the leg Harvester's stamp TRANSCRIBED (the `gitDeviceComparison` pattern), read from the execution the
 *                            chainer hands on, so the leg Reviewer — which chains the Author only — reads exactly what the Architect
 *                            and the Author read.
 *   leg-synthesize hoist     the AUTHORITATIVE Harvester's stamp through the ONE child selector (`selectLegChildStamp`, exact role
 *                            `infra_state_harvester`) — never "the last Harvester". A missing stamp is a NAMED reason, never absence.
 *
 * POPULATION (NOT_STAMPED, EF-S3/S4.8): only on an execution whose own stamped protocol version is a released Config-sources version
 * (`liveEvidenceVersionApplies`) AND whose owning leg declares Device sources. Every stored leg composed below 1.26.0, every value leg
 * (network-derivation is not in the version table) and every other domain gets NOT_STAMPED — a population answer — so every stored
 * result.json and every prompt replays byte-identical. The version check runs FIRST and reads nothing.
 */
import type { NetContext } from './net-registry';
import { NOT_STAMPED } from './net-registry';
import { declarationFor } from './device-source-facts-enrichment';
import { computeDeviceSourceReads } from './device-source-facts';
import { computeLiveEvidenceFromReadRecord, liveEvidenceVersionApplies, gitOnlyWordApplies, LIVE_EVIDENCE_VERSION, type LiveEvidenceOptions } from './live-evidence';
import { readAuthoritativeResultField } from './authoritative-result-read';
import { selectLegChildStamp, HELD_HARVESTER_ROLE } from './held-bytes-nets';
import { resolveOwningLegProtocol, assertNeverLane, DEVICE_SOURCE_LANES, type DeviceSourceLane, type OwningLegResolution } from './held-bytes/variant';
import { Prisma } from '@prisma/client';

const STAGE_CHILD_SCAN_CAP = 50;

/**
 * Contract-devices fold (2026-11-05): the owning leg's stored `inputContext.interfaceContract` — the contract the leg's children
 * read (create-time plan carry / Q2 heal write it on the LEG row; MCP `task.update` refuses `interfaceContract`, so it is immutable
 * like the declaration snapshot). ONE PK read, a jsonb projection (never the whole inputContext, which carries chained entries),
 * reached only at/above the released version on a Device-sources leg. A failed read is NAMED on the fact, never a throw (a throw
 * would stamp `errorFact` and lose the buckets the fact already computed).
 */
async function legInterfaceContract(ctx: NetContext): Promise<{ ok: true; contract: unknown; leg: OwningLegResolution } | { ok: false; leg: OwningLegResolution | null }> {
  let leg: OwningLegResolution | null = null;
  try {
    leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
    if (leg.kind !== 'self' && leg.kind !== 'leg') return { ok: false, leg };
    const db = ctx.prisma as never as { $queryRaw: <T = unknown>(q: Prisma.Sql) => Promise<T> };
    const rows = await db.$queryRaw<Array<{ contract: unknown }>>(Prisma.sql`
      SELECT ("inputContext" -> 'interfaceContract') AS contract FROM tasks WHERE id = ${leg.legId}`);
    if (!Array.isArray(rows) || rows.length !== 1) return { ok: false, leg };
    return { ok: true, contract: rows[0].contract, leg };
  } catch {
    return { ok: false, leg };
  }
}

/** VALUE-LEG-GIT: the fact's options from the owning leg's lane. Change lane: the contract fold skips the VALUE lane's keys (G4-b
 *  fallback — a value leg's switch list is never a change leg's scope). Value lane: the fold reads every key (the change legs' devices are
 *  devices the value may meet) and an all-Git leg reads `git-only` (G4-a). An unresolved leg reads as the change lane, never a guess. */
const VALUE_LANE_CONTRACT_KEYS: readonly string[] = Object.values(DEVICE_SOURCE_LANES).filter((x) => x.lane === 'value').map((x) => x.contractKey);
// Change lane `gitOnlyWord`: released with network-provisioning 1.27.0 (GIT_ONLY_WORD_MIN_VERSIONS), keyed on the HARVESTER's own
// composed delta — the only point that computes the word (the Author and the leg carry its stamp), so stored legs never move.
export function liveEvidenceOptionsFor(leg: OwningLegResolution | null, protocolInjection?: unknown): LiveEvidenceOptions {
  const lane: DeviceSourceLane = leg && (leg.kind === 'self' || leg.kind === 'leg') && leg.deviceSourceLane === 'value' ? 'value' : 'change';
  switch (lane) {
    case 'change': return { excludeContractKeys: VALUE_LANE_CONTRACT_KEYS, gitOnlyWord: gitOnlyWordApplies(protocolInjection) };
    case 'value': return { gitOnlyWord: true };
    default: return assertNeverLane(lane);
  }
}

export async function computeLiveEvidenceHarvesterFact(ctx: NetContext): Promise<Record<string, unknown>> {
  if (!liveEvidenceVersionApplies(ctx.protocolInjection)) return NOT_STAMPED;
  const src = await declarationFor(ctx);
  if (src.state === 'not-device-source-leg') return NOT_STAMPED;
  const record = ctx.deviceSourceReadRecord ? await ctx.deviceSourceReadRecord() : computeDeviceSourceReads(src, ctx.toolCalls);
  if (record.checked !== true) return computeLiveEvidenceFromReadRecord(record);
  const c = await legInterfaceContract(ctx);
  const fact = computeLiveEvidenceFromReadRecord(record, c.ok ? c.contract : undefined, liveEvidenceOptionsFor(c.leg, ctx.protocolInjection));
  return c.ok ? fact : { ...fact, contractDevices: { checked: false, reason: 'contract-read-failed' } };
}

export async function transcribeLiveEvidenceFact(ctx: NetContext): Promise<Record<string, unknown>> {
  if (!liveEvidenceVersionApplies(ctx.protocolInjection)) return NOT_STAMPED;
  const src = await declarationFor(ctx);
  if (src.state === 'not-device-source-leg') return NOT_STAMPED;
  const base = { version: LIVE_EVIDENCE_VERSION, point: 'author-transcription' };
  const prisma = ctx.prisma as never as {
    task: {
      findUnique: (a: unknown) => Promise<{ stageId: string | null } | null>;
      findMany: (a: unknown) => Promise<Array<{ id: string; title: string; agentRole: string | null }>>;
    };
  };
  const self = await prisma.task.findUnique({ where: { id: ctx.task.id }, select: { stageId: true } });
  if (!self?.stageId) return { ...base, checked: false, reason: 'no-stage' };
  const siblings = await prisma.task.findMany({
    where: { stageId: self.stageId }, select: { id: true, title: true, agentRole: true }, orderBy: { createdAt: 'asc' }, take: STAGE_CHILD_SCAN_CAP,
  });
  // The EXACT role, as the hoist's selector uses — one definition of "the leg's Harvester" across both readers.
  const harvest = siblings.find((c) => c.agentRole === HELD_HARVESTER_ROLE);
  if (!harvest) return { ...base, checked: false, reason: 'no-harvester-sibling' };
  const read = await readAuthoritativeResultField(ctx.prisma as never, harvest.id, 'liveEvidence');
  if (!read.value) return { ...base, checked: false, reason: 'harvester-not-stamped', harvesterExecutionId: read.executionId };
  let parsed: unknown;
  try { parsed = JSON.parse(read.value); } catch { return { ...base, checked: false, reason: 'harvester-stamp-unreadable', harvesterExecutionId: read.executionId }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...base, checked: false, reason: 'harvester-stamp-unreadable', harvesterExecutionId: read.executionId };
  }
  return { ...(parsed as Record<string, unknown>), point: 'author-transcription', harvesterExecutionId: read.executionId };
}

export async function hoistLiveEvidenceFact(ctx: NetContext): Promise<Record<string, unknown>> {
  if (!liveEvidenceVersionApplies(ctx.protocolInjection)) return NOT_STAMPED;
  const leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
  if (leg.kind === 'could-not-check') throw new Error(`owning-leg resolution: ${leg.reason}`);
  if (leg.kind === 'no-leg' || leg.deviceSource !== true) return NOT_STAMPED;
  const sel = await selectLegChildStamp(ctx.prisma as never, ctx.stageId, HELD_HARVESTER_ROLE, 'liveEvidence');
  if (sel.state === 'ok') return { ...sel.fact, point: 'leg', source: sel.taskId, harvesterExecutionId: sel.executionId };
  return {
    version: LIVE_EVIDENCE_VERSION, point: 'leg', checked: false, reason: `harvester-${sel.state}`,
    ...(sel.taskId ? { source: sel.taskId } : {}), ...(sel.executionId ? { harvesterExecutionId: sel.executionId } : {}),
  };
}
