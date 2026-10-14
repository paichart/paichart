/**
 * PLATFORM-HELD-BYTES — the held-bytes store (Stage A WI-5, 2026-10-14). The ONLY module that writes or deletes
 * `held_blobs`, and the home of the row types, the string guard and the per-row validator the capture helper and the
 * terminal transaction share.
 *
 *   upsertHeldBlobs  ONE autocommit statement, its input de-duplicated (a duplicate key in one INSERT … ON CONFLICT DO
 *                    UPDATE is SQLSTATE 21000 — panel DB-5) and sorted by (scope, sha256) so concurrent upserts lock in one
 *                    order. `lastReferencedAt` is set by the DB clock (now()), never the app clock.
 *   gcHeldBlobs      the nightly sweep: one autocommit DELETE per batch. The 1-day grace sits ON THE DELETE TARGET so
 *                    EvalPlanQual re-checks it against a row an upsert touched after the GC's snapshot, and candidates are
 *                    locked FOR UPDATE SKIP LOCKED so the GC never waits on a row (panel DB-1 / arch B1 — the v1 SQL, grace
 *                    in the subquery only, deleted a just-touched blob and failed the Harvester's ref insert).
 *
 * Errors: Prisma reports every raw-SQL error as code 'P2010' with the Postgres SQLSTATE in `err.meta.code` (panel DB
 * NEW-1). Classify on that. LOG ONLY name / code / metaCode — never `err`, `err.message` or `meta.message`: a Postgres
 * DETAIL prints `Key (scope, sha256)=(<povId>, <hash>)` (panel SF-3).
 *
 * Tenant scope: every key is (scope, sha256) — never sha256 alone.
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-5 / §7 / §8.
 */
import { Prisma } from '@prisma/client';

// ── rows and plans (the contract between the capture helper and the terminal transaction) ───────────────────────────

/** One file the pure half accepted: everything a ref needs except the execution, leg and root ids. */
export interface PlannedHeldFile {
  sha256: string;
  /** B — the text to hold (R10 output, or C when R10 is off). */
  content: string;
  storedByteLength: number;
  serviceId: string;
  serviceName: string;
  sourceTool: string;
  toolCallIndex: number;
  selector: string;
  target: string;
  path: string;
  declaredBy: string;
  descriptorVersion: number | null;
  hashBasis: string;
  decodeVersion: string;
  redactorVersion: string;
  redactedCount: number;
  lineCount: number;
  placeholderPreexistingCount: number;
}

/** One refusal the pure half decided: everything but the execution id. */
export interface PlannedRefusal {
  scope: string | null;
  serviceId: string | null;
  serviceName: string | null;
  identitySource: string;
  sourceTool: string;
  toolCallIndex: number;
  selector: string | null;
  target: string | null;
  path: string | null;
  refusal: string;
  detail?: Record<string, string | number>;
  declaredBy: string;
  descriptorVersion: number | null;
}

/** The pure half's output: strings, numbers and booleans only — nothing in it aliases a loop record. */
export interface HeldCapturePlan {
  scope: string | null;
  files: PlannedHeldFile[];
  refusals: PlannedRefusal[];
  stats: Record<string, number>;
}

export interface HeldFileRefRow {
  scope: string;
  blobSha256: string;
  executionId: string;
  kind: string;
  legTaskId: string | null;
  rootTaskId: string | null;
  serviceId: string;
  serviceName: string;
  sourceTool: string;
  toolCallIndex: number;
  selector: string;
  target: string;
  path: string;
  declaredBy: string;
  descriptorVersion: number | null;
  hashBasis: string;
  decodeVersion: string;
  redactorVersion: string;
  redactedCount: number;
  lineCount: number;
  newline: string | null;
  bom: boolean | null;
  finalNewline: boolean | null;
  serviceReportsComplete: boolean | null;
  derivedRawByteLength: number | null;
  placeholderPreexistingCount: number;
}

export interface HeldCaptureRefusalRow extends PlannedRefusal {
  executionId: string;
}

/** What the terminal transaction inserts. Built and validated pre-tx; the transaction decides nothing. */
export interface HeldCaptureBatch {
  refs: HeldFileRefRow[];
  refusals: HeldCaptureRefusalRow[];
  stats: Record<string, number>;
}

/** Content-free selects: no Stage A caller reads blobs, but Stage B's first reader must not pull `content` by accident. */
export const HELD_BLOB_META_SELECT = {
  scope: true, sha256: true, storedByteLength: true, createdAt: true, lastReferencedAt: true,
} as const;
export const HELD_REF_SELECT = {
  id: true, scope: true, blobSha256: true, executionId: true, kind: true, legTaskId: true, rootTaskId: true,
  serviceId: true, serviceName: true, sourceTool: true, toolCallIndex: true, selector: true, target: true, path: true,
  declaredBy: true, descriptorVersion: true, hashBasis: true, decodeVersion: true, redactorVersion: true,
  redactedCount: true, lineCount: true, newline: true, bom: true, finalNewline: true, serviceReportsComplete: true,
  derivedRawByteLength: true, placeholderPreexistingCount: true, createdAt: true,
} as const;

// ── guards ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const HELD_STRING_MAX = 2048;
const INT_MAX = 2 ** 31 - 1;

/** The string itself when it is safe to bind inside the terminal transaction, else null. Strips nothing: a string with
 *  U+0000, a lone surrogate, or over `max` is refused whole (Postgres rejects U+0000 in text/jsonb and an unpaired
 *  surrogate escape in jsonb — either would abort the transaction). */
export function guardInTxString(s: unknown, max: number = HELD_STRING_MAX): string | null {
  if (typeof s !== 'string') return null;
  if (s.length > max || s.indexOf('\u0000') >= 0 || !s.isWellFormed()) return null;
  return s;
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= INT_MAX;
const reqStr = (v: unknown) => guardInTxString(v) !== null;
const optStr = (v: unknown) => v === null || guardInTxString(v) !== null;
const optInt = (v: unknown) => v === null || isInt(v);
const optBool = (v: unknown) => v === null || typeof v === 'boolean';

function validDetail(d: unknown): boolean {
  if (d === undefined) return true; // omitted when empty — never null (panel D1)
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return false;
  const entries = Object.entries(d as Record<string, unknown>);
  if (entries.length === 0) return false; // an empty detail must be OMITTED, not written as {}
  return entries.every(([k, v]) => guardInTxString(k, 64) !== null
    && ((typeof v === 'string' && guardInTxString(v, 256) !== null) || isInt(v)));
}

/** True when every required column is present and typed, every string bindable, every Int in range. A row that fails is
 *  DROPPED and counted by the caller — a required column is never nulled (panel arch S2, DB-3). */
export function validateHeldRow(kind: 'ref', row: HeldFileRefRow): boolean;
export function validateHeldRow(kind: 'refusal', row: HeldCaptureRefusalRow): boolean;
export function validateHeldRow(kind: 'ref' | 'refusal', row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  if (kind === 'ref') {
    return reqStr(r.scope) && /^[0-9a-f]{64}$/.test(String(r.blobSha256)) && reqStr(r.executionId) && reqStr(r.kind)
      && optStr(r.legTaskId) && optStr(r.rootTaskId) && reqStr(r.serviceId) && reqStr(r.serviceName)
      && reqStr(r.sourceTool) && isInt(r.toolCallIndex) && reqStr(r.selector) && reqStr(r.target) && reqStr(r.path)
      && reqStr(r.declaredBy) && optInt(r.descriptorVersion) && reqStr(r.hashBasis) && reqStr(r.decodeVersion)
      && reqStr(r.redactorVersion) && isInt(r.redactedCount) && isInt(r.lineCount) && optStr(r.newline)
      && optBool(r.bom) && optBool(r.finalNewline) && optBool(r.serviceReportsComplete)
      && optInt(r.derivedRawByteLength) && isInt(r.placeholderPreexistingCount);
  }
  return reqStr(r.executionId) && optStr(r.scope) && optStr(r.serviceId) && optStr(r.serviceName)
    && reqStr(r.identitySource) && reqStr(r.sourceTool) && isInt(r.toolCallIndex) && optStr(r.selector)
    && optStr(r.target) && optStr(r.path) && reqStr(r.refusal) && validDetail(r.detail) && reqStr(r.declaredBy)
    && optInt(r.descriptorVersion);
}

// ── errors and logging ───────────────────────────────────────────────────────────────────────────────────────────

/** Content-free error facts. NEVER `message` or `meta.message` — a Postgres DETAIL carries the key values. */
export function errorFacts(err: unknown): { name?: string; code?: string; metaCode?: string } {
  const e = (err ?? {}) as { name?: unknown; code?: unknown; meta?: { code?: unknown } };
  const out: { name?: string; code?: string; metaCode?: string } = {};
  if (typeof e.name === 'string') out.name = e.name.slice(0, 64);
  if (typeof e.code === 'string') out.code = e.code.slice(0, 16);
  if (e.meta && typeof e.meta.code === 'string') out.metaCode = e.meta.code.slice(0, 16);
  return out;
}

export interface HeldStoreLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
  info?: (obj: Record<string, unknown>, msg: string) => void;
}

type RawDb = { $executeRaw: (query: Prisma.Sql) => Promise<number> };

// ── upsert ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface HeldBlobInput {
  scope: string;
  sha256: string;
  /** B as a string; bound as exact bytea (UTF-8). */
  content: string;
  /** Informational only: the bound length is computed from the bytes themselves (code review DB note), never trusted. */
  storedByteLength: number;
}

export type UpsertResult =
  | { ok: true; written: Set<string> }
  | { ok: false; fault: { name?: string; code?: string; metaCode?: string } };

export const heldBlobKey = (scope: string, sha256: string) => `${scope}\u0001${sha256}`;

/** De-duplicates and sorts its own input, then ONE autocommit statement. Never throws: a failure is returned as
 *  content-free error facts and the caller refuses every file `store-error`. */
export async function upsertHeldBlobs(db: RawDb, blobs: readonly HeldBlobInput[]): Promise<UpsertResult> {
  const byKey = new Map<string, HeldBlobInput>();
  for (const b of blobs) byKey.set(heldBlobKey(b.scope, b.sha256), b);
  const rows = [...byKey.values()].sort((a, b) =>
    a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0);
  if (rows.length === 0) return { ok: true, written: new Set() };
  try {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO held_blobs (scope, sha256, content, "storedByteLength", "createdAt", "lastReferencedAt")
      VALUES ${Prisma.join(rows.map((r) => { const buf = Buffer.from(r.content, 'utf8'); return Prisma.sql`(${r.scope}, ${r.sha256}, ${buf}, ${buf.length}, now(), now())`; }))}
      ON CONFLICT (scope, sha256) DO UPDATE SET "lastReferencedAt" = now()`);
    return { ok: true, written: new Set(byKey.keys()) };
  } catch (err) {
    return { ok: false, fault: errorFacts(err) };
  }
}

// ── GC ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type GcStop = 'fk-race' | 'deadlock' | 'timeout' | 'other';

/** `fault` holds content-free error facts (errorFacts), never the error itself. */
export interface GcResult { deleted: number; batches: number; stoppedOn?: GcStop; fault?: { name?: string; code?: string; metaCode?: string } }

function classifyGcError(err: unknown): GcStop {
  const metaCode = errorFacts(err).metaCode;
  if (metaCode === '23503') return 'fk-race';
  if (metaCode === '40P01') return 'deadlock';
  if (metaCode === '57014') return 'timeout';
  return 'other';
}

/** One batch of the nightly sweep. Exported so the SQL shape can be pinned and rehearsed. */
export function gcBatchSql(graceInterval: string, batch: number): Prisma.Sql {
  return Prisma.sql`
    DELETE FROM held_blobs t
     WHERE t."lastReferencedAt" < now() - ${graceInterval}::interval
       AND (t.scope, t.sha256) IN (
         SELECT b.scope, b.sha256 FROM held_blobs b
          WHERE b."lastReferencedAt" < now() - ${graceInterval}::interval
            AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r.scope = b.scope AND r."blobSha256" = b.sha256)
          ORDER BY b.scope, b.sha256
          LIMIT ${batch}
          FOR UPDATE SKIP LOCKED)`;
}

/** Never throws. Stops at the first error (named by SQLSTATE) or when a batch deletes fewer than `batch` rows. */
export async function gcHeldBlobs(
  db: RawDb,
  opts: { graceInterval?: string; batch?: number; maxBatches?: number } = {},
): Promise<GcResult> {
  const graceInterval = opts.graceInterval ?? '1 day';
  const batch = opts.batch ?? 1000;
  const maxBatches = opts.maxBatches ?? 50;
  let deleted = 0;
  let batches = 0;
  for (; batches < maxBatches; ) {
    let n: number;
    try {
      n = await db.$executeRaw(gcBatchSql(graceInterval, batch));
    } catch (err) {
      return { deleted, batches, stoppedOn: classifyGcError(err), fault: errorFacts(err) };
    }
    batches++;
    deleted += n;
    if (n < batch) break;
  }
  return { deleted, batches };
}
