/**
 * Leg replay lab — L-CS-K-arm (Config sources STEP 2, code push slice 4; plan §2.2a): WHICH arm of a cell reads Config sources.
 *
 * WHY: a protocol's Config-sources code ships before its text. While its row is on `CONFIG_SOURCE_AWAITING_TEXT`
 * (held-bytes/variant.ts) production treats no leg of it as a Config-sources leg, and `LIVE_EVIDENCE_MIN_VERSIONS` keys the facts
 * at a version no released text carries yet. (History: Kubernetes left the list at 1.19.0, 2026-11-16; Terraform at 1.17.0,
 * 2026-11-18; the list holds `observability-config` until its 1.12.0 text.) A lab runs a base arm and a candidate arm of
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
import { CONFIG_SOURCE_LANES, isHeldCapableLeg, isGitFileSourceLeg, isDeviceSourceLeg, captureScopesFor, type OwningLegResolution } from '../../lib/agents/harness/held-bytes/variant';
import { governingConfigSources, type LegConfigSourcesResolution } from '../../lib/agents/harness/config-sources-read';
import { configSourcesReadRuleDecision, CONFIG_SOURCES_READ_RULE_PROTOCOLS, type ConfigSourcesReadRuleDecision } from '../../lib/agents/harness/config-sources-read-rule';
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
  return governingConfigSources({ description: c.description, contract: c.contract, snapshot: c.snapshot, protocolStamped: legProtocolStamped(leg) }, c.protocol);
}

/**
 * STEP 3 slice L (P3-BUILD §8a item 10) — `protocolStamped` as PRODUCTION derives it (`config-sources-read.ts`:
 * `jsonb_typeof(metadata -> 'protocol') = 'string'`): did the leg ever reach the stamp writer. Never a constant: `configLegOf`
 * accepts a protocol resolved by the TITLE fallback, so a hand-built leg carrying a snapshot and no `metadata.protocol` must read
 * `snapshot-unreadable` here as it does in production (rule A9). Only a real string counts.
 */
export function legProtocolStamped(leg: LegRow): boolean {
  const meta = leg && leg.metadata && typeof leg.metadata === 'object' && !Array.isArray(leg.metadata) ? (leg.metadata as Record<string, unknown>) : null;
  return !!meta && typeof meta.protocol === 'string';
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

/**
 * STEP 3 slice L (P3-BUILD §8a item 11, as corrected): the owning-leg resolution production hands a LEAF's nets on this arm —
 * `{ kind: 'leg', legId, heldCapable, ownStageId, gitFileSource, deviceSource, configSourceProtocol }` (variant.ts
 * `resolveOwningLegProtocol` for a child of the leg's stage). The facts of a `runs-undeclared` leg with no block need a RESOLVED
 * leg carrying `configSourceProtocol`: the no-block arm of `configSourceReads` stamps only for one (a leaf with no leg also reads
 * `not-config-source-leg`, and must stamp nothing). Null when the arm does not read Config sources.
 */
export function armLeafOwningLeg(leg: LegRow, protocolInjection: unknown, ownStageId: string | null | undefined): OwningLegResolution | null {
  if (!armReadsConfigSources(leg, protocolInjection)) return null;
  const c = configLegOf(leg)!;
  const l = leg as { title?: string | null; metadata?: unknown };
  return { kind: 'leg', legId: c.legId, heldCapable: isHeldCapableLeg(l), ownStageId: String(ownStageId ?? ''), gitFileSource: isGitFileSourceLeg(l), deviceSource: isDeviceSourceLeg(l), configSourceProtocol: c.protocol } as OwningLegResolution;
}

/** What held capture takes from a leg: the Git-lane switch, the Config scope and the protocol the scope belongs to — ONE object. */
export interface LabCaptureScopes { gitFileSourceLeg: boolean; configSources: LegConfigSourcesResolution | null; configSourceProtocol: string | null }

/**
 * STEP 3 slice L (register CONFIG-SOURCES-OBS-JOIN-PRECONDITIONS item 8; P3-BUILD §8 item 1) — THE ONE lab answer to "what does
 * held capture take from this leg on this arm": the SHIPPING `captureScopesFor`, asked with the arm's owning-leg resolution and the
 * arm's governing declaration. No lab file decides the Git lane or the Config scope any other way.
 *
 *   - An arm that reads Config sources (`armReadsConfigSources`): production's three values, as they come. For a `runs-undeclared`
 *     protocol (observability) the Git lane is ON only for a declaration that is not `not-config-source-leg`; a leg that declares
 *     nothing reads no Git lane and passes its `not-config-source-leg` resolution through as the scope (production's shape).
 *   - Every other arm: production's answer for a leg with NO Config-sources protocol on its resolution — the Git lane by name
 *     (`isGitFileSourceLeg`), no scope, no protocol. This is `captureScopesFor` too (asked with a resolution carrying no
 *     `configSourceProtocol`), so a base arm's store is byte-identical to the one the lab built before this helper.
 *   - No leg: nothing (the Git lane off, no scope) — `captureScopesFor(null, null)`.
 */
export function labCaptureScopes(leg: LegRow, protocolInjection: unknown): LabCaptureScopes {
  if (!leg) return captureScopesFor<LegConfigSourcesResolution>(null, null);
  const l = leg as { title?: string | null; metadata?: unknown };
  const reads = armReadsConfigSources(leg, protocolInjection);
  const owning = { kind: 'self', legId: String(leg.id ?? ''), heldCapable: isHeldCapableLeg(l), gitFileSource: isGitFileSourceLeg(l), deviceSource: isDeviceSourceLeg(l),
    ...(reads ? { configSourceProtocol: configLegOf(leg)!.protocol } : {}) } as OwningLegResolution;
  return captureScopesFor<LegConfigSourcesResolution>(owning, reads ? armConfigSources(leg, protocolInjection) : null);
}

/** Fail closed (precondition 8): a Config scope travels WITH its protocol, or the store is not built. `captureScopesFor` returns
 *  them together; a hand-built object that carries one without the other is refused by name. */
export function assertCaptureScopes(scopes: LabCaptureScopes, where: string): LabCaptureScopes {
  if ((scopes.configSources === null) !== (scopes.configSourceProtocol === null)) {
    throw new Error(`${where}: capture scopes carry ${scopes.configSources ? 'a Config scope with NO protocol' : 'a protocol with NO Config scope'} — the scope and its protocol travel as ONE object (captureScopesFor), never apart`);
  }
  return scopes;
}

/**
 * Config sources read rule (2026-11-25) — the lab's answer to the SHIPPING gate (`configSourcesReadRuleDecision`,
 * lib/agents/harness/config-sources-read-rule.ts) for a LEAF of this leg, from the snapshot alone (no DB). The owning-leg resolution
 * is the one `resolveOwningLegProtocol` builds for a child of the leg's stage with today's (empty) awaiting list — the protocol from
 * the leg's stamp, present only when its protocol has a Config lane — and the declaration is the SHIPPING pure rule
 * `governingConfigSources` over the stored leg row, as `readLegConfigSources` reads it. Independent of the arm's text version: the
 * production gate has no version test either.
 */
export function labLeafConfigSourcesReadRule(leg: LegRow, task: { type?: string | null; stage_id?: string | null }, agentRole: string | null | undefined): ConfigSourcesReadRuleDecision {
  const c = configLegOf(leg);
  const l = (leg ?? {}) as { title?: string | null; metadata?: unknown };
  const owningLeg = c ? ({ kind: 'leg', legId: c.legId, heldCapable: isHeldCapableLeg(l), ownStageId: String(task.stage_id ?? ''), gitFileSource: isGitFileSourceLeg(l),
    deviceSource: isDeviceSourceLeg(l), configSourceProtocol: c.protocol } as OwningLegResolution) : null;
  const sources = c ? governingConfigSources({ description: c.description, contract: c.contract, snapshot: c.snapshot, protocolStamped: legProtocolStamped(leg) }, c.protocol) : null;
  return configSourcesReadRuleDecision({ taskType: task.type, agentRole, owningLeg, sources });
}

/**
 * Read rule WIDENING CONTROLS (2026-11-26, LAB-PREREG-L-OBS-MLH ADDENDUM B, schedule item 7) — MEASUREMENT ONLY. The shipping gate's
 * answer for a leaf of this leg with exactly ONE of its refusals set aside: `protocol-not-on-allow-list`. Everything else is still the
 * SHIPPING decision: it is asked a second time with the owning leg's protocol replaced by the first allow-listed protocol
 * (`CONFIG_SOURCES_READ_RULE_PROTOCOLS[0]`, read from lib, never a lab copy) and every other input unchanged — the leg's governing
 * declaration is still the one `governingConfigSources` resolves under the leg's OWN protocol. So the Harvester role, the declared
 * Config-source leg and the `parsed` declaration still decide; only the allow-list does not.
 *   `applies: false` — the first answer was not `protocol-not-on-allow-list` (ON already, or another refusal): nothing is set aside.
 *   `applies: true`  — `decision` is the second answer; ON means every other condition holds.
 * The shipping allow-list and gate are never edited; production renders no rule for an unlisted protocol.
 */
export function labLeafConfigSourcesReadRulePastAllowList(leg: LegRow, task: { type?: string | null; stage_id?: string | null }, agentRole: string | null | undefined):
  { first: ConfigSourcesReadRuleDecision; applies: boolean; decision: ConfigSourcesReadRuleDecision; unlistedProtocol: string | null } {
  const first = labLeafConfigSourcesReadRule(leg, task, agentRole);
  if (first.reason !== 'protocol-not-on-allow-list') return { first, applies: false, decision: first, unlistedProtocol: null };
  const c = configLegOf(leg)!; // the first answer passed condition 3, so the leg has a Config-sources protocol
  const l = (leg ?? {}) as { title?: string | null; metadata?: unknown };
  const listed = CONFIG_SOURCES_READ_RULE_PROTOCOLS[0];
  const owningLeg = { kind: 'leg', legId: c.legId, heldCapable: isHeldCapableLeg(l), ownStageId: String(task.stage_id ?? ''), gitFileSource: isGitFileSourceLeg(l),
    deviceSource: isDeviceSourceLeg(l), configSourceProtocol: listed } as OwningLegResolution;
  const sources = governingConfigSources({ description: c.description, contract: c.contract, snapshot: c.snapshot, protocolStamped: legProtocolStamped(leg) }, c.protocol);
  return { first, applies: true, decision: configSourcesReadRuleDecision({ taskType: task.type, agentRole, owningLeg, sources }), unlistedProtocol: c.protocol };
}

/** 2026-11-26 (descriptor-fetch.ts): the `service` of every DECLARED live-read line of this leg's governing declaration (empty when the
 *  leg declares nothing or the declaration does not parse). The same resolution the read-rule answer uses. */
export function declaredLiveReadServices(leg: LegRow): string[] {
  const c = configLegOf(leg);
  if (!c) return [];
  const g = governingConfigSources({ description: c.description, contract: c.contract, snapshot: c.snapshot, protocolStamped: legProtocolStamped(leg) }, c.protocol) as LegConfigSourcesResolution & { entries?: Array<{ kind: string; service?: string }> };
  if (g.state !== 'parsed') return [];
  return ((g.entries ?? []) as Array<{ kind: string; service?: unknown }>).filter((e) => e.kind === 'live-read' && typeof e.service === 'string').map((e) => e.service as string);
}
