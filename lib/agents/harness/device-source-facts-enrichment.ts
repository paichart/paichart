/**
 * held-network step 3 batch 2b — the IMPURE half of `deviceSourceReads` and `gitDeviceComparison` (device-source-facts.ts).
 *
 * Population: a leaf whose owning leg declares Device sources (variant.ts DEVICE_SOURCE_PROTOCOLS — network-provisioning). Every
 * other leaf gets NOT_STAMPED (a population answer), so every other domain's result.json is byte-identical. The declaration is the
 * net context's memo — PRIMED with the same object capture used (execution-core), or read lazily once through the same reader.
 *
 *   Harvester point  — computed from the execution's OWN tool calls (`ctx.toolCalls`, the result.json shape).
 *   Author point     — gitDeviceComparison only: the leg's Harvester stamp TRANSCRIBED (never recomputed), read from the execution
 *                      the chainer hands on (readAuthoritativeResultField), so the Reviewer reads exactly what the Architect read.
 */
import type { NetContext } from './net-registry';
import { NOT_STAMPED } from './net-registry';
import { readLegDeviceSources, type LegDeviceSourcesResolution } from './device-sources-read';
import { resolveOwningLegProtocol } from './held-bytes/variant';
import { computeDeviceSourceReads, computeGitDeviceComparison } from './device-source-facts';
import { readAuthoritativeResultField } from './authoritative-result-read';
import { GIT_DEVICE_COMPARISON_METHOD, GIT_DEVICE_COMPARISON_VERSION } from './git-device-comparison';

const STAGE_CHILD_SCAN_CAP = 50;

async function declarationFor(ctx: NetContext): Promise<LegDeviceSourcesResolution> {
  if (ctx.deviceSources) return ctx.deviceSources();
  const leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
  return readLegDeviceSources(ctx.prisma as never, leg);
}

export async function computeDeviceSourceReadsFact(ctx: NetContext): Promise<Record<string, unknown>> {
  const src = await declarationFor(ctx);
  if (src.state === 'not-device-source-leg') return NOT_STAMPED;
  return computeDeviceSourceReads(src, ctx.toolCalls);
}

export async function computeGitDeviceComparisonHarvesterFact(ctx: NetContext): Promise<Record<string, unknown>> {
  const src = await declarationFor(ctx);
  if (src.state === 'not-device-source-leg') return NOT_STAMPED;
  return computeGitDeviceComparison(src, ctx.toolCalls);
}

export async function transcribeGitDeviceComparisonFact(ctx: NetContext): Promise<Record<string, unknown>> {
  const src = await declarationFor(ctx);
  if (src.state === 'not-device-source-leg') return NOT_STAMPED;
  const base = { version: GIT_DEVICE_COMPARISON_VERSION, method: GIT_DEVICE_COMPARISON_METHOD, point: 'author-transcription' };
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
  const harvest = siblings.find((c) => (c.agentRole ?? '').toLowerCase().includes('harvest') || c.title.toLowerCase().startsWith('harvest'));
  if (!harvest) return { ...base, checked: false, reason: 'no-harvester-sibling' };
  const read = await readAuthoritativeResultField(ctx.prisma as never, harvest.id, 'gitDeviceComparison');
  if (!read.value) return { ...base, checked: false, reason: 'harvester-not-stamped', harvesterExecutionId: read.executionId };
  let parsed: unknown;
  try { parsed = JSON.parse(read.value); } catch { return { ...base, checked: false, reason: 'harvester-stamp-unreadable', harvesterExecutionId: read.executionId }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...base, checked: false, reason: 'harvester-stamp-unreadable', harvesterExecutionId: read.executionId };
  return { ...(parsed as Record<string, unknown>), point: 'author-transcription', harvesterExecutionId: read.executionId };
}
