/**
 * Config sources STEP 2 — the IMPURE half of `platformDriftCalls` and `gitLiveDrift` (git-live-drift.ts, platform-drift-run.ts).
 *
 * Population: a leaf of a Config-sources leg at its released Config-sources text version (the `liveEvidence` version table —
 * kubernetes-gitops 1.19.0). Every other leaf gets NOT_STAMPED, so every stored and every non-Config-sources result.json is
 * byte-identical.
 *   Harvester point  — `platformDriftCalls`: the call record the core made (or the STORED record on a replay — a replay never calls);
 *                      `gitLiveDrift`: computed from that record, validated on every read.
 *   Author point     — `gitLiveDrift` only: the leg's Harvester stamp TRANSCRIBED (never recomputed), read from the execution the
 *                      chainer hands on, so the leg Reviewer reads exactly what the Architect read.
 *
 * k8s value-lane P1 (2026-11-20): the Git-vs-live METHOD is the OWNING LEG's (its Config-sources protocol — the one the core gates
 * the platform call on, execution-core.ts), at BOTH points. Before P1 both read the persisting LEAF's composed protocol, so the call
 * gate and the fact could name two different protocols for one leg. Only when the leg cannot be resolved does the leaf's own
 * composed protocol decide (`methodProtocol`) — the value every stamp had before.
 */
import type { NetContext } from './net-registry';
import { NOT_STAMPED } from './net-registry';
import { configDeclarationFor } from './config-source-facts-enrichment';
import { computeGitLiveDrift, gitLiveDriftMethodOf, GIT_LIVE_DRIFT_VERSION } from './git-live-drift';
import { liveEvidenceVersionApplies } from './live-evidence';
import { readAuthoritativeResultField } from './authoritative-result-read';
import { HELD_HARVESTER_ROLE } from './held-bytes-nets';
import { resolveOwningLegProtocol } from './held-bytes/variant';

const STAGE_CHILD_SCAN_CAP = 50;

/** The persisting execution's composed protocol (`protocolInjection.delta.name`), or null. */
function composedProtocol(ctx: NetContext): string | null {
  const pi = ctx.protocolInjection as { delta?: { name?: unknown } } | null | undefined;
  return pi && pi.delta && typeof pi.delta.name === 'string' ? pi.delta.name : null;
}

/** The protocol that decides the Git-vs-live method: the OWNING LEG's Config-sources protocol. The fallback — the leaf's composed
 *  protocol — applies only when the resolution carries no Config-sources protocol: a leg that could not be read (`could-not-check`,
 *  which the population test admits), or a context primed with a declaration and no leg (the lab's leaf point). */
async function methodProtocol(ctx: NetContext): Promise<string | null> {
  const leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
  if ((leg.kind === 'self' || leg.kind === 'leg') && leg.configSourceProtocol) return leg.configSourceProtocol;
  return composedProtocol(ctx);
}

async function inPopulation(ctx: NetContext): Promise<boolean> {
  if (!liveEvidenceVersionApplies(ctx.protocolInjection)) return false;
  return (await configDeclarationFor(ctx)).state !== 'not-config-source-leg';
}

/** The call record itself (operator tail). `null`/absent ⇒ NOT_STAMPED: nothing was planned, so there is nothing to store. */
export async function stampPlatformDriftCalls(ctx: NetContext): Promise<Record<string, unknown>> {
  if (!(await inPopulation(ctx))) return NOT_STAMPED;
  if (!Array.isArray(ctx.platformDriftCalls)) return NOT_STAMPED;
  return { version: 1, calls: ctx.platformDriftCalls };
}

export async function computeGitLiveDriftHarvesterFact(ctx: NetContext): Promise<Record<string, unknown>> {
  if (!(await inPopulation(ctx))) return NOT_STAMPED;
  return computeGitLiveDrift(Array.isArray(ctx.platformDriftCalls) ? ctx.platformDriftCalls : undefined, await methodProtocol(ctx));
}

export async function transcribeGitLiveDriftFact(ctx: NetContext): Promise<Record<string, unknown>> {
  if (!(await inPopulation(ctx))) return NOT_STAMPED;
  // STEP 4 D-T1: the method of the leg's protocol (Kubernetes: the compare tool, unchanged; Terraform: null).
  const base = { version: GIT_LIVE_DRIFT_VERSION, method: gitLiveDriftMethodOf(await methodProtocol(ctx)), point: 'author-transcription' };
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
  const harvest = siblings.find((c) => c.agentRole === HELD_HARVESTER_ROLE);
  if (!harvest) return { ...base, checked: false, reason: 'no-harvester-sibling' };
  const read = await readAuthoritativeResultField(ctx.prisma as never, harvest.id, 'gitLiveDrift');
  if (!read.value) return { ...base, checked: false, reason: 'harvester-not-stamped', harvesterExecutionId: read.executionId };
  let parsed: unknown;
  try { parsed = JSON.parse(read.value); } catch { return { ...base, checked: false, reason: 'harvester-stamp-unreadable', harvesterExecutionId: read.executionId }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...base, checked: false, reason: 'harvester-stamp-unreadable', harvesterExecutionId: read.executionId };
  return { ...(parsed as Record<string, unknown>), point: 'author-transcription', harvesterExecutionId: read.executionId };
}
