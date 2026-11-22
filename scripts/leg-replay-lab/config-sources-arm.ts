/**
 * Leg replay lab — L-CS-K-arm (Config sources STEP 2, code push slice 4; plan §2.2a): WHICH arm of a cell reads Config sources.
 *
 * WHEN THIS WAS WRITTEN (2026-11-15) production was inert twice over for Kubernetes: `CONFIG_SOURCE_AWAITING_TEXT`
 * (held-bytes/variant.ts) held `kubernetes-gitops`, and `LIVE_EVIDENCE_MIN_VERSIONS` keyed it at 1.19.0, which no released text
 * carried. Kubernetes left the list at 1.19.0 (2026-11-16) and Terraform at 1.17.0 (2026-11-18); the list holds
 * `observability-config` today, until its 1.12.0 text. The need is unchanged: a lab runs a base arm and a candidate arm of
 * different text versions on ONE tree, so it needs a per-arm answer:
 *
 *   armConfigSources(leg, protocolInjection)
 *     null                      ⇔ production's answer for this arm TODAY: the leg's protocol has no row in `CONFIG_SOURCE_LANES`, or
 *                                  the arm's composed protocol is below the released Config-sources version (the SHIPPING
 *                                  `liveEvidenceVersionApplies`). Every caller then passes nothing — the base arm's bytes stand.
 *     a governing declaration   ⇔ the arm composes the Config-sources text (≥ the table's version). The row's protocol is then, by the
 *                                  text commit's own rule, out of the awaiting list — so the lab reads the TABLE, not the list, and
 *                                  resolves the governing declaration with the SHIPPING pure rule `governingConfigSources` (snapshot
 *                                  first; `snapshot-absent` / `-unreadable` / `-changed` named) over the snapshot's leg row.
 *
 * NO `lib/` HOOK IS NEEDED (unlike the network kind gate, `__setLiveReadKindForLab`): every production consumer takes the resolution
 * as an INPUT — `buildNetContext({ configSources, platformDriftCalls, owningLeg })`, `prepareHeldCapture({ configSources })`,
 * `runPlatformDriftCalls({ sources, call })`, `configGitFileForce(sources, refs)` — and the awaiting list is read only where
 * production DERIVES it (owning-leg resolution, the first-execution snapshot writer, the carrier). The lab supplies the input instead
 * of the derivation. No module state: two arms with different answers can interleave.
 *
 * PURE. No service, no database, no model.
 */
import { CONFIG_SOURCE_LANES, isHeldCapableLeg, isGitFileSourceLeg, isDeviceSourceLeg, type OwningLegResolution } from '../../lib/agents/harness/held-bytes/variant';
import { governingConfigSources, type LegConfigSourcesResolution } from '../../lib/agents/harness/config-sources-read';
import { CONFIG_SOURCES_SNAPSHOT_KEY } from '../../lib/agents/harness/config-sources';
import { liveEvidenceVersionApplies } from '../../lib/agents/harness/live-evidence';
import { canonicalProtocolName, resolveTaskProtocol } from '../../lib/agents/harness/program-protocol';

type LegRow = { id?: string; title?: string | null; metadata?: unknown; description?: string | null; inputContext?: unknown } | null | undefined;

export interface ConfigLeg { legId: string; protocol: string; contractKey: string; description: string | null; contract: unknown; snapshot: unknown }

/** The leg's Config-sources row columns, when its protocol has a row in the SHIPPING lane table (whether or not its text shipped). */
export function configLegOf(leg: LegRow): ConfigLeg | null {
  if (!leg) return null;
  const p = resolveTaskProtocol(leg as never).protocol;
  if (!p) return null;
  const protocol = canonicalProtocolName(p);
  const lane = CONFIG_SOURCE_LANES[protocol];
  if (!lane) return null;
  const ic = typeof leg.inputContext === 'string' ? (() => { try { return JSON.parse(leg.inputContext as string); } catch { return null; } })() : leg.inputContext;
  const meta = (leg.metadata && typeof leg.metadata === 'object' ? leg.metadata : {}) as Record<string, unknown>;
  return { legId: String(leg.id ?? ''), protocol, contractKey: lane.contractKey, description: leg.description ?? null,
    contract: (ic as Record<string, unknown> | null)?.interfaceContract ?? null, snapshot: meta[CONFIG_SOURCES_SNAPSHOT_KEY] ?? null };
}

/** Does this arm (its composed protocol injection) read Config sources on this leg? */
export function armReadsConfigSources(leg: LegRow, protocolInjection: unknown): boolean {
  return configLegOf(leg) !== null && liveEvidenceVersionApplies(protocolInjection);
}

/** The arm's governing declaration, or null when production passes none for this arm (see the header). */
export function armConfigSources(leg: LegRow, protocolInjection: unknown): LegConfigSourcesResolution | null {
  if (!armReadsConfigSources(leg, protocolInjection)) return null;
  const c = configLegOf(leg)!;
  return governingConfigSources({ description: c.description, contract: c.contract, snapshot: c.snapshot, protocolStamped: true /* the lab's leg models a stamped leg (STEP 3 A9) */ }, c.protocol);
}

/** The owning-leg resolution production would hand the LEG's own nets once the text has shipped: `variant.ts` builds
 *  `{ kind: 'self', legId, heldCapable, gitFileSource, deviceSource, configSourceProtocol }` for a PIPELINE row. The first four come
 *  from the same shipping predicates; only the last field is supplied by the lab (the awaiting list would withhold it). Null when
 *  the arm does not read Config sources — the caller then primes nothing. */
export function armOwningLeg(leg: LegRow, protocolInjection: unknown): OwningLegResolution | null {
  if (!armReadsConfigSources(leg, protocolInjection)) return null;
  const c = configLegOf(leg)!;
  const l = leg as { title?: string | null; metadata?: unknown };
  return { kind: 'self', legId: c.legId, heldCapable: isHeldCapableLeg(l), gitFileSource: isGitFileSourceLeg(l), deviceSource: isDeviceSourceLeg(l), configSourceProtocol: c.protocol } as OwningLegResolution;
}
