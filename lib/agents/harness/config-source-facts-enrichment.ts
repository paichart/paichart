/**
 * Config sources STEP 2 — the IMPURE half of `configSourceReads` (config-source-facts.ts).
 *
 * Population: a Harvester leaf whose owning leg declares Config sources today (variant.ts CONFIG_SOURCE_PROTOCOLS — empty until a
 * protocol's Config-sources text ships). Every other leaf gets NOT_STAMPED (a population answer), so every stored and every
 * non-Config-sources result.json is byte-identical. The declaration is the net context's memo — PRIMED with the same object capture
 * used (execution-core), or read lazily once through the same reader.
 *
 * AND (owner decision 2026-11-15, G4-a) the persisting execution composed the protocol at or above its released Config-sources text
 * version — the ONE version table (`LIVE_EVIDENCE_MIN_VERSIONS`, kubernetes-gitops 1.19.0) through the ONE test
 * (`liveEvidenceVersionApplies`) that `liveEvidence`, `gitLiveDrift`, `platformDriftCalls` and the platform drift call (sec-ops F6)
 * already use. Without it, the day kubernetes-gitops leaves CONFIG_SOURCE_AWAITING_TEXT a replay of every STORED pre-1.19.0
 * Kubernetes Harvester would gain this key (measured: four specimens red on test:net-registry-equivalence E2a).
 */
import type { NetContext } from './net-registry';
import { NOT_STAMPED } from './net-registry';
import { readLegConfigSources, type LegConfigSourcesResolution } from './config-sources-read';
import { resolveOwningLegProtocol } from './held-bytes/variant';
import { computeConfigSourceReads } from './config-source-facts';
import { liveEvidenceVersionApplies } from './live-evidence';

export async function configDeclarationFor(ctx: NetContext): Promise<LegConfigSourcesResolution> {
  if (ctx.configSources) return ctx.configSources();
  const leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
  return readLegConfigSources(ctx.prisma as never, leg);
}

export async function computeConfigSourceReadsFact(ctx: NetContext): Promise<Record<string, unknown>> {
  // The version test first: a population answer that needs no read (the order `gitLiveDrift`'s inPopulation uses).
  if (!liveEvidenceVersionApplies(ctx.protocolInjection)) return NOT_STAMPED;
  const src = await configDeclarationFor(ctx);
  if (src.state === 'not-config-source-leg') return NOT_STAMPED;
  return ctx.configSourceReadRecord ? ctx.configSourceReadRecord() : computeConfigSourceReads(src, ctx.toolCalls);
}
