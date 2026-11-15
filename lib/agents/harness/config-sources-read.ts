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
  CONFIG_SOURCES_GRAMMAR_VERSION, contractConfigSourcesValue, readConfigSourcesSnapshot, resolveLegConfigSources, sameConfigDeclaration,
  type LegConfigSources,
} from './config-sources';
import { CONFIG_SOURCE_LANES, type OwningLegResolution } from './held-bytes/variant';
import { canonicalProtocolName } from './program-protocol';

export type LegConfigSourcesResolution =
  | LegConfigSources
  | { state: 'not-config-source-leg' }
  | { state: 'could-not-check'; grammarVersion: number; reason: 'owning-leg-unresolved' | 'read-threw' | 'leg-row-missing' }
  | { state: 'snapshot-absent' | 'snapshot-unreadable' | 'snapshot-changed'; grammarVersion: number };

type Db = { $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T> };

/** The governing declaration from the leg row's three columns — PURE (shared by the read, the replay tooling and the lab). */
export function governingConfigSources(row: { description: string | null; contract: unknown; snapshot: unknown }, protocol: string): LegConfigSourcesResolution {
  const g = CONFIG_SOURCES_GRAMMAR_VERSION;
  const p = canonicalProtocolName(protocol);
  const lane = CONFIG_SOURCE_LANES[p];
  if (!lane) return { state: 'not-config-source-leg' };
  const snap = readConfigSourcesSnapshot(row.snapshot === null || row.snapshot === undefined ? null : { configSourcesSnapshot: row.snapshot });
  if (snap === null) return { state: 'snapshot-absent', grammarVersion: g };
  if (snap === 'unreadable' || snap.protocol !== p) return { state: 'snapshot-unreadable', grammarVersion: g };
  const live = resolveLegConfigSources({ protocol: p, contractValue: contractConfigSourcesValue(row.contract, lane.contractKey), taskBody: row.description });
  if (!sameConfigDeclaration(live, snap.resolution)) return { state: 'snapshot-changed', grammarVersion: g };
  return snap.resolution;
}

export async function readLegConfigSources(db: Db, owningLeg: OwningLegResolution | null): Promise<LegConfigSourcesResolution> {
  if (!owningLeg || owningLeg.kind === 'could-not-check') {
    return { state: 'could-not-check', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION, reason: 'owning-leg-unresolved' };
  }
  if (owningLeg.kind === 'no-leg' || !owningLeg.configSourceProtocol) return { state: 'not-config-source-leg' };
  try {
    const rows = await db.$queryRaw<Array<{ description: string | null; contract: unknown; snapshot: unknown }>>(Prisma.sql`
      SELECT description, ("inputContext" -> 'interfaceContract') AS contract, (metadata -> 'configSourcesSnapshot') AS snapshot
      FROM tasks WHERE id = ${owningLeg.legId}`);
    if (!Array.isArray(rows) || rows.length !== 1) {
      return { state: 'could-not-check', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION, reason: 'leg-row-missing' };
    }
    return governingConfigSources(rows[0], owningLeg.configSourceProtocol);
  } catch {
    return { state: 'could-not-check', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION, reason: 'read-threw' };
  }
}

/** A memo resolving at most once per persist: primed with the core's answer, or resolving lazily (rescue, replays, the lab). */
export function legConfigSourcesMemo(
  db: Db, owningLeg: () => Promise<OwningLegResolution>, primed?: LegConfigSourcesResolution | null,
): () => Promise<LegConfigSourcesResolution> {
  let p: Promise<LegConfigSourcesResolution> | null = primed ? Promise.resolve(primed) : null;
  return () => (p ??= owningLeg().then((leg) => readLegConfigSources(db, leg), () => readLegConfigSources(db, null)));
}
