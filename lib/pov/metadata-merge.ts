/**
 * POV metadata MERGE (2026-11-28, register POV-UPDATE-METADATA-REPLACES-WHOLE).
 *
 * `POV.metadata` used to be written WHOLE by MCP `pov.update` and the web PUT: a caller that sent
 * only `{ isDemo: false }` silently dropped every other key (2026-11-12: actionId, customer,
 * teamSize, createdBy, createdVia, successCriteria, technicalRequirements on two projects), and the
 * result said "1 field changed". `metadata.isDemo` is the demo-access flag, so the same call could
 * also change who may read the project.
 *
 * Semantics now (one place, both write surfaces):
 *   - a key sent with a value is SET (top-level, shallow — a nested object replaces that key's value);
 *   - a key sent as `null` is REMOVED;
 *   - a key not sent is KEPT.
 *
 * Atomicity: the merge runs in SQL (`(stored - removed) || set`), never as a JS read-modify-write,
 * so a concurrent writer's keys are never lost (BC19 shape; same as MetadataService.updateMetadata
 * and mergeTaskInputContext). The row is read `FOR UPDATE` first, inside the caller's transaction,
 * ONLY to report what changed — the report is a fact about the row this write replaced.
 *
 * Reserved-key policy (`sanitizePovMetadata`, pentest MA-1) is the CALLER's job and stays where it
 * was: run it on the patch before calling here.
 */

export type PovMetadataPatch = Record<string, unknown>;

export interface PovMetadataPlan {
  /** Keys sent with a non-null value — written. */
  set: Record<string, unknown>;
  /** Keys sent as null — removed. */
  remove: string[];
}

export interface PovMetadataReport {
  /** Sent with a value that differs from the stored one, or was absent before. */
  keysChanged: string[];
  /** Sent with the value already stored (written, no change). */
  keysUnchanged: string[];
  /** Sent as null and present before — now absent. */
  keysRemoved: string[];
  /** Sent as null but not present before — nothing to remove. */
  keysAlreadyAbsent: string[];
  /** Stored keys the request did not name — kept as they were. */
  keysKeptCount: number;
}

/** Split a patch into keys to set and keys to remove (null ⇒ remove). Pure. */
export function planPovMetadataPatch(patch: PovMetadataPatch): PovMetadataPlan {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) remove.push(k);
    else if (v !== undefined) set[k] = v;
  }
  return { set, remove };
}

/** True when the plan writes nothing. */
export function isEmptyPovMetadataPlan(plan: PovMetadataPlan): boolean {
  return plan.remove.length === 0 && Object.keys(plan.set).length === 0;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * The same merge in JS — the reference the SQL must equal (tests pin it), and a fallback reader's
 * model of the result. Pure.
 */
export function applyPovMetadataPlan(before: unknown, plan: PovMetadataPlan): Record<string, unknown> {
  const out: Record<string, unknown> = { ...asObject(before) };
  for (const k of plan.remove) delete out[k];
  Object.assign(out, plan.set);
  return out;
}

/**
 * Report what a merge did, from the row before and the row after (both as read from the database,
 * so jsonb key order is canonical on both sides and JSON.stringify compares values). Pure.
 */
export function reportPovMetadataMerge(before: unknown, after: unknown, plan: PovMetadataPlan): PovMetadataReport {
  const b = asObject(before);
  const a = asObject(after);
  const keysChanged: string[] = [];
  const keysUnchanged: string[] = [];
  for (const k of Object.keys(plan.set)) {
    if (k in b && JSON.stringify(b[k]) === JSON.stringify(a[k])) keysUnchanged.push(k);
    else keysChanged.push(k);
  }
  const keysRemoved = plan.remove.filter((k) => k in b);
  const keysAlreadyAbsent = plan.remove.filter((k) => !(k in b));
  const named = new Set([...Object.keys(plan.set), ...plan.remove]);
  const keysKeptCount = Object.keys(b).filter((k) => !named.has(k)).length;
  return { keysChanged, keysUnchanged, keysRemoved, keysAlreadyAbsent, keysKeptCount };
}

/** One result-line clause, e.g. `metadata: changed isDemo; removed foo; 6 other keys kept`. A fact list, no judgement. */
export function describePovMetadataReport(r: PovMetadataReport): string {
  const parts: string[] = [];
  if (r.keysChanged.length) parts.push(`changed ${r.keysChanged.join(', ')}`);
  if (r.keysUnchanged.length) parts.push(`same value ${r.keysUnchanged.join(', ')}`);
  if (r.keysRemoved.length) parts.push(`removed ${r.keysRemoved.join(', ')}`);
  if (r.keysAlreadyAbsent.length) parts.push(`not present ${r.keysAlreadyAbsent.join(', ')}`);
  parts.push(`${r.keysKeptCount} other key${r.keysKeptCount === 1 ? '' : 's'} kept`);
  return `metadata: ${parts.join('; ')}`;
}

/** Minimal client surface: a Prisma transaction client (or the base client). */
interface RawClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Merge a patch into one POV's metadata atomically and report it. Call inside the caller's
 * `$transaction` so the `FOR UPDATE` lock spans the read and the write. Returns null when the POV
 * row does not exist. An empty plan writes nothing (and bumps nothing).
 */
export async function mergePovMetadata(
  client: RawClient,
  povId: string,
  plan: PovMetadataPlan,
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown>; report: PovMetadataReport } | null> {
  const locked = await client.$queryRaw<Array<{ metadata: unknown }>>`
    SELECT metadata FROM "POV" WHERE id = ${povId} FOR UPDATE`;
  if (locked.length === 0) return null;
  const before = asObject(locked[0].metadata);
  if (isEmptyPovMetadataPlan(plan)) {
    return { before, after: before, report: reportPovMetadataMerge(before, before, plan) };
  }
  // A stored non-object (never written by any current path) is treated as {} — it cannot hold keys.
  const rows = await client.$queryRaw<Array<{ metadata: unknown }>>`
    UPDATE "POV"
       SET metadata = (
             CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END
             - ${plan.remove}::text[]
           ) || ${JSON.stringify(plan.set)}::jsonb,
           "updatedAt" = NOW()
     WHERE id = ${povId}
     RETURNING metadata`;
  if (rows.length === 0) return null;
  const after = asObject(rows[0].metadata);
  return { before, after, report: reportPovMetadataMerge(before, after, plan) };
}
