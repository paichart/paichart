/**
 * held-network step 3 batch 2b (P3 / S3-A) — the ONE read of a leg's declared Device sources (the impure half of
 * device-sources.ts). Used by capture (execution-core, before the pure capture half) and by the device nets (through the
 * net context's memo, primed with the core's answer), so both see the same declaration. Replays reach it through the same memo.
 *
 * Reads, only when the owning leg's protocol declares device sources (DEVICE_SOURCE_PROTOCOLS — network-provisioning):
 *   ONE PK read of the leg row's `description`, `inputContext -> 'interfaceContract'` (a jsonb projection — never the whole
 *   inputContext, which carries chained entries) and `metadata -> 'deviceSourcesSnapshot'`. Every other leg reads nothing.
 * NEVER THROWS: a read failure is `could-not-check` (capture then holds nothing on the device lane, named, and the net says so).
 *
 * push 2 (O-2, the J1 entry gate): the declaration that GOVERNS is the IMMUTABLE SNAPSHOT taken at the leg's first execution
 * (device-sources.ts DEVICE_SOURCES_SNAPSHOT_KEY), never the live description an agent can edit. The live declaration is resolved
 * too, only to detect a change: no snapshot ⇒ `snapshot-absent`; an invalid one ⇒ `snapshot-unreadable`; the live text no longer
 * resolving to it ⇒ `snapshot-changed`. Each holds nothing (fail closed, named).
 */
import { Prisma } from '@prisma/client';
import {
  contractDeviceSourcesValue, resolveLegDeviceSources, readDeviceSourcesSnapshot, sameDeclaration, DEVICE_SOURCES_GRAMMAR_VERSION,
  type LegDeviceSources,
} from './device-sources';
import type { OwningLegResolution } from './held-bytes/variant';

export type LegDeviceSourcesResolution =
  | LegDeviceSources
  | { state: 'not-device-source-leg' }
  | { state: 'could-not-check'; grammarVersion: number; reason: 'owning-leg-unresolved' | 'read-threw' | 'leg-row-missing' }
  | { state: 'snapshot-absent' | 'snapshot-unreadable' | 'snapshot-changed'; grammarVersion: number };

type Db = { $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T> };

/** The governing declaration from the leg row's three columns — PURE (shared by the read and the replay tooling). */
export function governingDeviceSources(row: { description: string | null; contract: unknown; snapshot: unknown }): LegDeviceSourcesResolution {
  const g = DEVICE_SOURCES_GRAMMAR_VERSION;
  const snap = readDeviceSourcesSnapshot(row.snapshot === null || row.snapshot === undefined ? null : { deviceSourcesSnapshot: row.snapshot });
  if (snap === null) return { state: 'snapshot-absent', grammarVersion: g };
  if (snap === 'unreadable') return { state: 'snapshot-unreadable', grammarVersion: g };
  const live = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(row.contract), taskBody: row.description });
  if (!sameDeclaration(live, snap.resolution)) return { state: 'snapshot-changed', grammarVersion: g };
  return snap.resolution;
}

export async function readLegDeviceSources(db: Db, owningLeg: OwningLegResolution | null): Promise<LegDeviceSourcesResolution> {
  if (!owningLeg || owningLeg.kind === 'could-not-check') {
    return { state: 'could-not-check', grammarVersion: DEVICE_SOURCES_GRAMMAR_VERSION, reason: 'owning-leg-unresolved' };
  }
  if (owningLeg.kind === 'no-leg' || owningLeg.deviceSource !== true) return { state: 'not-device-source-leg' };
  try {
    const rows = await db.$queryRaw<Array<{ description: string | null; contract: unknown; snapshot: unknown }>>(Prisma.sql`
      SELECT description, ("inputContext" -> 'interfaceContract') AS contract, (metadata -> 'deviceSourcesSnapshot') AS snapshot
      FROM tasks WHERE id = ${owningLeg.legId}`);
    if (!Array.isArray(rows) || rows.length !== 1) {
      return { state: 'could-not-check', grammarVersion: DEVICE_SOURCES_GRAMMAR_VERSION, reason: 'leg-row-missing' };
    }
    return governingDeviceSources(rows[0]);
  } catch {
    return { state: 'could-not-check', grammarVersion: DEVICE_SOURCES_GRAMMAR_VERSION, reason: 'read-threw' };
  }
}

/** A memo resolving at most once per persist: primed with the core's answer, or resolving lazily (rescue, replays, the lab). */
export function legDeviceSourcesMemo(
  db: Db, owningLeg: () => Promise<OwningLegResolution>, primed?: LegDeviceSourcesResolution | null,
): () => Promise<LegDeviceSourcesResolution> {
  let p: Promise<LegDeviceSourcesResolution> | null = primed ? Promise.resolve(primed) : null;
  return () => (p ??= owningLeg().then((leg) => readLegDeviceSources(db, leg), () => readLegDeviceSources(db, null)));
}
