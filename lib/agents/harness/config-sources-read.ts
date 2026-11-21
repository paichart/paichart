/**
 * Config sources STEP 2 (2026-11-15) — the ONE read of a leg's declared Config sources (the impure half of config-sources.ts;
 * the `device-sources-read.ts` shape, for the separate table and the separate contract field — owner decision (b)).
 *
 * Reads, only when the owning leg declares Config sources today (`OwningLegResolution.configSourceProtocol`), ONE PK read of the
 * leg row's `description`, `inputContext -> 'interfaceContract'` (a jsonb projection) and `metadata -> 'configSourcesSnapshot'`.
 * Every other leg reads nothing. NEVER THROWS: a read failure is `could-not-check`.
 *
 * The declaration that GOVERNS is the IMMUTABLE SNAPSHOT taken at the leg's first execution (prepare-task-for-execution.ts), never
 * the live description an agent can edit. The live declaration is resolved too, only to detect a change: no snapshot ⇒
 * `snapshot-absent`; an invalid one, or one taken for another protocol ⇒ `snapshot-unreadable`; the live text no longer resolving
 * to it ⇒ `snapshot-changed`. Each holds nothing and forces (fail closed, named).
 */
import { Prisma } from '@prisma/client';
import {
  CONFIG_SOURCES_GRAMMAR_VERSION, buildConfigSourcesSnapshot, configLabelTableOf, contractConfigSourcesValue, readConfigSourcesSnapshot,
  resolveLegConfigSources, sameConfigDeclaration, type ConfigSourcesSnapshot, type LegConfigSources,
} from './config-sources';
import { CONFIG_SOURCE_AWAITING_TEXT, CONFIG_SOURCE_LANES, assertNeverConfigLane, assertNeverConfigNoBlock, configSourceLaneOf,
  hasConfigSourcesSnapshotObject, type OwningLegResolution } from './held-bytes/variant';
import { resolveConfigLabels } from './held-bytes/config-label';
import { canonicalProtocolName } from './program-protocol';

export type LegConfigSourcesResolution =
  | LegConfigSources
  | { state: 'not-config-source-leg' }
  | { state: 'could-not-check'; grammarVersion: number; reason: 'owning-leg-unresolved' | 'read-threw' | 'leg-row-missing' }
  | { state: 'snapshot-absent' | 'snapshot-unreadable' | 'snapshot-changed'; grammarVersion: number }
  /** STEP 3 P2 (plan §13 A7): a `runs-undeclared` leg that carries a snapshot object while its protocol's row AWAITS its text — the
   *  leg declared sources and the text that governs them is not live (a revert). Capture holds nothing; the carrier forces by name. */
  | { state: 'snapshot-text-reverted'; grammarVersion: number };

type Db = { $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T> };

/** The leg row's columns the governing rule reads. `protocolStamped` (STEP 3, plan §13 A9): is `metadata.protocol` a string — did
 *  the leg ever reach the stamp writer? REQUIRED, so a caller that builds a row by hand must say (a forgotten field fails tsc). */
export interface GoverningConfigRow { description: string | null; contract: unknown; snapshot: unknown; protocolStamped: boolean }

/**
 * The governing declaration from the leg row's columns — PURE (shared by the read, the replay tooling and the lab).
 *
 * THE PER-LEG RULE (Config sources STEP 3, plan v2.1 §2 — the ONE function that holds snapshot, description and contract):
 *   - `noBlock: 'forced'` (Kubernetes, Terraform): no snapshot ⇒ `snapshot-absent`. Unchanged.
 *   - `noBlock: 'runs-undeclared'` (observability): no snapshot AND no live block ⇒ `not-config-source-leg` — the leg runs exactly
 *     as it did before the protocol had a Config lane; no snapshot and a live block ⇒ `snapshot-absent` (forced, named); a
 *     snapshot ⇒ the rules below.
 *   - A9: a snapshot on a leg with NO protocol stamp ⇒ `snapshot-unreadable`. The stamp writer is the only thing that takes — or
 *     removes — a snapshot; a leg that never reached it (scheduled and override executions) cannot have one of the platform's.
 *   - A stored `absent` snapshot on a `runs-undeclared` leg ⇒ `snapshot-unreadable` (the platform never writes one).
 *   - (A7, P2: the awaiting-list layer is `governingConfigSourcesAsOf` below — this function is the rule of a SHIPPED text.)
 *   - A1: a snapshot whose stored LABEL check named a problem governs as `unparseable` with THAT problem — after the sameness test
 *     on the two grammar resolutions, so an edited description still reads `snapshot-changed`.
 */
export function governingConfigSources(row: GoverningConfigRow, protocol: string): LegConfigSourcesResolution {
  const g = CONFIG_SOURCES_GRAMMAR_VERSION;
  const p = canonicalProtocolName(protocol);
  const lane = CONFIG_SOURCE_LANES[p];
  if (!lane) return { state: 'not-config-source-leg' };
  const present = row.snapshot !== null && row.snapshot !== undefined;
  const snap = readConfigSourcesSnapshot(present ? { configSourcesSnapshot: row.snapshot } : null);
  const live = (): LegConfigSources => resolveLegConfigSources({ protocol: p, contractValue: contractConfigSourcesValue(row.contract, lane.contractKey), taskBody: row.description });
  if (snap === null) {
    switch (lane.noBlock) {
      case 'forced': return { state: 'snapshot-absent', grammarVersion: g };
      case 'runs-undeclared': return live().state === 'absent' ? { state: 'not-config-source-leg' } : { state: 'snapshot-absent', grammarVersion: g };
      default: return assertNeverConfigNoBlock(lane.noBlock);
    }
  }
  if (!row.protocolStamped) return { state: 'snapshot-unreadable', grammarVersion: g };   // A9, fail closed
  if (snap === 'unreadable' || snap.protocol !== p) return { state: 'snapshot-unreadable', grammarVersion: g };
  // Review fix (architectural F5): the platform never stores an `absent` snapshot for a `runs-undeclared` protocol (the decision is
  // `remove`), so one on the row is forged or left over. Governing by it would force `config-sources-absent` on a leg that declares
  // nothing — the very words that mean "runs undeclared" for this protocol. Fail closed, by the unreadable name.
  if (lane.noBlock === 'runs-undeclared' && snap.resolution.state === 'absent') return { state: 'snapshot-unreadable', grammarVersion: g };
  if (!sameConfigDeclaration(live(), snap.resolution)) return { state: 'snapshot-changed', grammarVersion: g };
  if (snap.labelCheck?.state === 'problem' && snap.resolution.state === 'parsed') {
    return { state: 'unparseable', grammarVersion: snap.resolution.grammarVersion, source: snap.resolution.source,
      problem: snap.labelCheck.problem, lineIndex: snap.labelCheck.lineIndex };
  }
  return snap.resolution;
}

/**
 * STEP 3 P2 (plan §13 A7 — the rollback hole): the governing declaration AS OF an awaiting list. `governingConfigSources` above is
 * the rule of a protocol whose text HAS shipped (the corpus replay, the lab and every P1 case ask it directly); production's reader
 * asks THIS, with the shipped awaiting list.
 *
 * While the protocol's row AWAITS its text no leg of it is a Config-sources leg — except a `runs-undeclared` leg that carries a
 * snapshot OBJECT (the same test `legHasConfigDeclarationToGovern` makes from metadata). That leg declared sources under a text
 * that is not live: it governs as `snapshot-text-reverted`, whatever the snapshot says and whatever the description says now.
 * A `forced` protocol's awaiting row is unchanged — not governed (the recorded scope limit).
 */
export function governingConfigSourcesAsOf(row: GoverningConfigRow, protocol: string, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): LegConfigSourcesResolution {
  const p = canonicalProtocolName(protocol);
  const lane = CONFIG_SOURCE_LANES[p];
  if (lane && awaiting.includes(p)) {
    switch (lane.noBlock) {
      case 'forced': return { state: 'not-config-source-leg' };
      case 'runs-undeclared': return hasConfigSourcesSnapshotObject({ configSourcesSnapshot: row.snapshot })
        ? { state: 'snapshot-text-reverted', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION } : { state: 'not-config-source-leg' };
      default: return assertNeverConfigNoBlock(lane.noBlock);
    }
  }
  return governingConfigSources(row, protocol);
}

export async function readLegConfigSources(db: Db, owningLeg: OwningLegResolution | null, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): Promise<LegConfigSourcesResolution> {
  if (!owningLeg || owningLeg.kind === 'could-not-check') {
    return { state: 'could-not-check', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION, reason: 'owning-leg-unresolved' };
  }
  if (owningLeg.kind === 'no-leg' || !owningLeg.configSourceProtocol) return { state: 'not-config-source-leg' };
  try {
    const rows = await db.$queryRaw<Array<GoverningConfigRow>>(Prisma.sql`
      SELECT description, ("inputContext" -> 'interfaceContract') AS contract, (metadata -> 'configSourcesSnapshot') AS snapshot,
             (jsonb_typeof(metadata -> 'protocol') = 'string') AS "protocolStamped"
      FROM tasks WHERE id = ${owningLeg.legId}`);
    if (!Array.isArray(rows) || rows.length !== 1) {
      return { state: 'could-not-check', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION, reason: 'leg-row-missing' };
    }
    // `jsonb_typeof(NULL) = 'string'` is SQL NULL when the key is absent: only a real `true` counts as stamped.
    return governingConfigSourcesAsOf({ ...rows[0], protocolStamped: rows[0].protocolStamped === true }, owningLeg.configSourceProtocol, awaiting);
  } catch {
    return { state: 'could-not-check', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION, reason: 'read-threw' };
  }
}

/**
 * Config sources STEP 3 (plan W5 row 1, W7, §3.3) — what the stamp writer does with a leg's Config-sources snapshot at the FIRST
 * prepare that reaches it. ONE function, used by the prepare step (prepare-task-for-execution.ts) and the lab. PURE.
 *
 *   none     the task is not a PIPELINE leg, or its protocol has no Config lane today (off the table, or awaiting its text) —
 *            the stamp statement is byte-identical to the one before Config sources.
 *   write    the leg's declaration is snapshotted. `forced` protocols: whatever it resolves to (an `absent` block is a state the
 *            harness stops on). `runs-undeclared`: only when it is NOT `absent`. With a `labelCheck` when the protocol has a
 *            label table and the block parsed.
 *   remove   `runs-undeclared`, resolution `absent`: any `configSourcesSnapshot` ALREADY on the row is removed by the same
 *            statement (a snapshot nothing of the platform's took), so the leg reads `not-config-source-leg`.
 */
export type ConfigSnapshotDecision = { action: 'none' } | { action: 'write'; snapshot: ConfigSourcesSnapshot } | { action: 'remove' };
export function configSnapshotDecision(
  input: { type: string | null | undefined; protocol: string | null | undefined; description: string | null; interfaceContract: unknown; takenAt: string },
  awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT,
): ConfigSnapshotDecision {
  if (input.type !== 'PIPELINE' || !input.protocol) return { action: 'none' };
  const lane = configSourceLaneOf(input.protocol, awaiting);
  if (lane === null) return { action: 'none' };
  const p = canonicalProtocolName(input.protocol);
  const row = CONFIG_SOURCE_LANES[p];
  switch (lane) {
    case 'change': {
      const resolution = resolveLegConfigSources({ protocol: p, contractValue: contractConfigSourcesValue(input.interfaceContract, row.contractKey), taskBody: input.description });
      switch (row.noBlock) {
        case 'forced': break;
        case 'runs-undeclared': if (resolution.state === 'absent') return { action: 'remove' }; break;
        default: return assertNeverConfigNoBlock(row.noBlock);
      }
      const table = configLabelTableOf(p);
      const labelCheck = table !== null && resolution.state === 'parsed' ? resolveConfigLabels(resolution.entries, table) : null;
      return { action: 'write', snapshot: buildConfigSourcesSnapshot(p, resolution, input.takenAt, labelCheck) };
    }
    default: return assertNeverConfigLane(lane);
  }
}

/** A memo resolving at most once per persist: primed with the core's answer, or resolving lazily (rescue, replays, the lab). */
export function legConfigSourcesMemo(
  db: Db, owningLeg: () => Promise<OwningLegResolution>, primed?: LegConfigSourcesResolution | null,
): () => Promise<LegConfigSourcesResolution> {
  let p: Promise<LegConfigSourcesResolution> | null = primed ? Promise.resolve(primed) : null;
  return () => (p ??= owningLeg().then((leg) => readLegConfigSources(db, leg), () => readLegConfigSources(db, null)));
}
