/**
 * Config sources STEP 2 — the IMPURE half of `configSourceReads` (config-source-facts.ts).
 *
 * Population: a Harvester leaf whose owning leg declares Config sources today (variant.ts CONFIG_SOURCE_PROTOCOLS — empty until a
 * protocol's Config-sources text ships). Every other leaf gets NOT_STAMPED (a population answer), so every stored and every
 * non-Config-sources result.json is byte-identical. The declaration is the net context's memo — PRIMED with the same object capture
 * used (execution-core), or read lazily once through the same reader.
 */
import type { NetContext } from './net-registry';
import { NOT_STAMPED } from './net-registry';
import { readLegConfigSources, type LegConfigSourcesResolution } from './config-sources-read';
import { resolveOwningLegProtocol } from './held-bytes/variant';
import { computeConfigSourceReads } from './config-source-facts';

export async function configDeclarationFor(ctx: NetContext): Promise<LegConfigSourcesResolution> {
  if (ctx.configSources) return ctx.configSources();
  const leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
  return readLegConfigSources(ctx.prisma as never, leg);
}

export async function computeConfigSourceReadsFact(ctx: NetContext): Promise<Record<string, unknown>> {
  const src = await configDeclarationFor(ctx);
  if (src.state === 'not-config-source-leg') return NOT_STAMPED;
  return ctx.configSourceReadRecord ? ctx.configSourceReadRecord() : computeConfigSourceReads(src, ctx.toolCalls);
}
