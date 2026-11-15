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
 */
import type { NetContext } from './net-registry';
import { NOT_STAMPED } from './net-registry';
import { configDeclarationFor } from './config-source-facts-enrichment';
import { computeGitLiveDrift, GIT_LIVE_DRIFT_METHOD, GIT_LIVE_DRIFT_VERSION } from './git-live-drift';
import { liveEvidenceVersionApplies } from './live-evidence';
import { readAuthoritativeResultField } from './authoritative-result-read';
import { HELD_HARVESTER_ROLE } from './held-bytes-nets';

const STAGE_CHILD_SCAN_CAP = 50;

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
  return computeGitLiveDrift(Array.isArray(ctx.platformDriftCalls) ? ctx.platformDriftCalls : undefined);
}

export async function transcribeGitLiveDriftFact(ctx: NetContext): Promise<Record<string, unknown>> {
  if (!(await inPopulation(ctx))) return NOT_STAMPED;
  const base = { version: GIT_LIVE_DRIFT_VERSION, method: GIT_LIVE_DRIFT_METHOD, point: 'author-transcription' };
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
