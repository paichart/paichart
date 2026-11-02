/**
 * PLATFORM-HELD-BYTES — the held-bytes store (Stage A WI-5, 2026-10-14). The ONLY module that writes or deletes
 * `held_blobs`, and the home of the row types, the string guard and the per-row validator the capture helper and the
 * terminal transaction share.
 *
 *   upsertHeldBlobs  ONE autocommit statement, its input de-duplicated (a duplicate key in one INSERT … ON CONFLICT DO
 *                    UPDATE is SQLSTATE 21000 — panel DB-5) and sorted by (scope, sha256) so concurrent upserts lock in one
 *                    order. `lastReferencedAt` is set by the DB clock (now()), never the app clock.
 *   upsertHeldView / readHeldView / touchHeldBases / insertHeldPackageRows — Stage B V-1 (views, the ordered BASE touch,
 *                    the SAVEPOINT held_package writer); see their section below.
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
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

// ── ids ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const HELD_REF_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Stage B (push 1, P1-1): the id of a BASE / CANDIDATE ref, minted pre-tx. `'c'` + 24 chars of `[a-z0-9]` from
 *  crypto.randomBytes (≈124 bits), so it passes every `^c[a-z0-9]{24}$` validator (`id-validation.ts`,
 *  `plan-spawn-carry.ts`) — the tree has no app-side cuid generator, and `@paralleldrive/cuid2` ids fail that pattern.
 *  Rejection sampling (bytes ≥ 252 are redrawn) keeps the 36 symbols uniform. CAPTURE rows keep the column default.
 *  Exported for its pin; this is the ONLY minter of held ref ids (plan STAGE-B-PLAN.md P1-1 "Ids"). */
export function newHeldRefId(): string {
  let out = 'c';
  while (out.length < 25) {
    for (const b of randomBytes(32)) {
      if (b >= 252) continue;
      out += HELD_REF_ID_ALPHABET[b % 36];
      if (out.length === 25) break;
    }
  }
  return out;
}

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
  /** WI-B10 — a REQUIRED key, the held_declarations sha a REGISTRANT capture was judged against (null otherwise). */
  declarationSha256: string | null;
  /** INTERNAL-FIT IF-3 — REQUIRED keys, the eligibility the capture was taken under (own, granted, install, platform or null)
   *  and the ONE granting POV (set exactly when the eligibility is granted). */
  eligibility: string | null;
  grantPovId: string | null;
  hashBasis: string;
  decodeVersion: string;
  redactorVersion: string;
  redactedCount: number;
  lineCount: number;
  placeholderPreexistingCount: number;
  /** K-3 — a REQUIRED key (DB SF-2), so a builder that forgets it fails tsc. Null means the source has no revision. */
  sourceRevision: string | null;
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
  /** WI-B10 — REQUIRED, the sha a registrant refusal was judged against (null otherwise). */
  declarationSha256: string | null;
  /** INTERNAL-FIT IF-3 — REQUIRED keys, as on the CAPTURE ref. */
  eligibility: string | null;
  grantPovId: string | null;
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
  /** WI-B10 — a REQUIRED key, the held_declarations sha a REGISTRANT capture was judged against (null otherwise). */
  declarationSha256: string | null;
  /** INTERNAL-FIT IF-3 — REQUIRED keys, the eligibility the capture was taken under (own, granted, install, platform or null)
   *  and the ONE granting POV (set exactly when the eligibility is granted). */
  eligibility: string | null;
  grantPovId: string | null;
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
  /** K-3: REQUIRED key (see PlannedHeldFile). */
  sourceRevision: string | null;
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
  declaredBy: true, descriptorVersion: true, declarationSha256: true, eligibility: true, grantPovId: true, hashBasis: true, decodeVersion: true, redactorVersion: true,
  redactedCount: true, lineCount: true, newline: true, bom: true, finalNewline: true, serviceReportsComplete: true,
  derivedRawByteLength: true, placeholderPreexistingCount: true, sourceRevision: true, createdAt: true,
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
/** K-3: null (the source has no revision) or exactly 40 lowercase hex (a Git SHA-1 commit). SHA-256 object-format repos are
 *  not admitted until one exists (SYNTHESIS v3 note 22). The value is transcribed from a service URI — refuse, never repair. */
export const SOURCE_REVISION_RE = /^[0-9a-f]{40}$/;
const optRev = (v: unknown) => v === null || (typeof v === 'string' && SOURCE_REVISION_RE.test(v));

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
export function validateHeldRow(kind: 'ref', row: HeldFileRefRow | HeldPackageRefRow): boolean;
export function validateHeldRow(kind: 'refusal', row: HeldCaptureRefusalRow): boolean;
export function validateHeldRow(kind: 'ref' | 'refusal', row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  // Stage B (V-1, plan §3.2): BASE / CANDIDATE refs have their own column contract (NULL call provenance, a minted id, a
  // fromRefId chain). A row that fails makes its file `unheld` pre-tx (V-5d). The CAPTURE path below is unchanged.
  if (kind === 'ref' && (r.kind === 'BASE' || r.kind === 'CANDIDATE')) return validPackageRef(r);
  if (kind === 'ref') {
    return reqStr(r.scope) && /^[0-9a-f]{64}$/.test(String(r.blobSha256)) && reqStr(r.executionId) && reqStr(r.kind)
      && optStr(r.legTaskId) && optStr(r.rootTaskId) && reqStr(r.serviceId) && reqStr(r.serviceName)
      && reqStr(r.sourceTool) && isInt(r.toolCallIndex) && reqStr(r.selector) && reqStr(r.target) && reqStr(r.path)
      && reqStr(r.declaredBy) && optInt(r.descriptorVersion) && declShaConsistent(r) && eligConsistent(r) && reqStr(r.hashBasis) && reqStr(r.decodeVersion)
      && reqStr(r.redactorVersion) && isInt(r.redactedCount) && isInt(r.lineCount) && optStr(r.newline)
      && optBool(r.bom) && optBool(r.finalNewline) && optBool(r.serviceReportsComplete)
      && optInt(r.derivedRawByteLength) && isInt(r.placeholderPreexistingCount) && optRev(r.sourceRevision);
  }
  return reqStr(r.executionId) && optStr(r.scope) && optStr(r.serviceId) && optStr(r.serviceName)
    && reqStr(r.identitySource) && reqStr(r.sourceTool) && isInt(r.toolCallIndex) && optStr(r.selector)
    && optStr(r.target) && optStr(r.path) && reqStr(r.refusal) && validDetail(r.detail) && reqStr(r.declaredBy)
    && optInt(r.descriptorVersion) && declShaConsistent(r) && eligConsistent(r);
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

// ── Stage B (V-1): views, the BASE touch, package refs ─────────────────────────────────────────────────────────────
// Plan STAGE-B-PLAN.md v4.1 §3 V-1 + §3.2. Every function here runs on a client the caller chooses: views and the BASE
// touch are AUTOCOMMIT on the base client (never inside a transaction — `chainDependencyContext` / `prepareHeldPackage`
// call them pre-tx), the package refs inside the terminal SUCCESS transaction under SAVEPOINT held_package.

/** The rendering contract version of a held view (`held_views.viewVersion`). A change to how `buildView` renders bumps it. */
export const HELD_VIEW_VERSION = 'paichart.view/1';

export interface HeldViewKey { scope: string; baseSha256: string; r9Version: string; viewVersion: string }
export interface HeldViewRow extends HeldViewKey { viewText: string; lineCount: number; rewrittenLines: number[] }
export type HeldViewResult =
  | { ok: true; view: HeldViewRow; inserted: boolean }
  | { ok: false; state: 'view-unavailable'; fault?: { name?: string; code?: string; metaCode?: string } };

/** The ONE spelling of an int[] bind: always a non-NULL array literal, `'{}'` when empty. `held_views."rewrittenLines"` is
 *  nullable in the database (a Prisma list column carries no NOT NULL), so the insert must never let it default
 *  (code review DB-CR-2; MI-13 counts NULL rows, 0 by construction). */
export function intArrayLiteral(xs: readonly number[]): string {
  if (!xs.every(isInt)) throw new Error('intArrayLiteral: not a list of non-negative 32-bit ints');
  return `{${xs.join(',')}}`;
}

/** The view is bounded by the per-view budget (64 KB, V-6) long before this; this is only the bindability gate. */
export const HELD_VIEW_TEXT_MAX = 6 * 1024 * 1024;

type RawQueryDb = RawDb & { $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T> };

/** Read one view by its FULL primary key (READ mode: V-5c's step and V-6's Reviewer path — never builds one). */
export async function readHeldView(db: RawQueryDb, k: HeldViewKey): Promise<HeldViewRow | null> {
  const rows = await db.$queryRaw<HeldViewRow[]>(Prisma.sql`
    SELECT scope, "baseSha256", "r9Version", "viewVersion", "viewText", "lineCount", "rewrittenLines"
      FROM held_views
     WHERE scope = ${k.scope} AND "baseSha256" = ${k.baseSha256} AND "r9Version" = ${k.r9Version} AND "viewVersion" = ${k.viewVersion}`);
  return rows[0] ?? null;
}

/** A held blob's text (UTF-8), keyed by (scope, sha256) — never the hash alone. The first reader of `content` (Stage A
 *  selected none — HELD_BLOB_META_SELECT); its one caller is the view build (held-bytes-views.ts, write mode). */
export async function readHeldBlobText(db: RawQueryDb, scope: string, sha256: string): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ content: Buffer }>>(Prisma.sql`
    SELECT content FROM held_blobs WHERE scope = ${scope} AND sha256 = ${sha256}`);
  return rows[0] ? Buffer.from(rows[0].content).toString('utf8') : null;
}

/**
 * Write a view if none exists for its key, then return the STORED row — never the caller's (a concurrent writer, or an
 * earlier build, may own the key; the stored row is what every reader of that key sees). ONE statement: the CTE touches
 * the blob's `lastReferencedAt` (DB clock) and the INSERT selects from it, so a view can only be inserted for a blob the
 * same statement just touched — the GC's grace predicate then protects it. Never `DO UPDATE`. Never throws.
 * A blob that is gone (never held, or GC'd — including the cascade race) leaves the CTE empty: zero rows ⇒ `view-unavailable`.
 */
export async function upsertHeldView(db: RawQueryDb, v: HeldViewRow): Promise<HeldViewResult> {
  if (guardInTxString(v.viewText, HELD_VIEW_TEXT_MAX) === null || !isInt(v.lineCount)
    || ![v.scope, v.baseSha256, v.r9Version, v.viewVersion].every((s) => guardInTxString(s) !== null)
    || !Array.isArray(v.rewrittenLines) || !v.rewrittenLines.every(isInt)) {
    return { ok: false, state: 'view-unavailable', fault: { name: 'invalid-view-row' } };
  }
  try {
    const inserted = await db.$executeRaw(Prisma.sql`
      WITH t AS (
        UPDATE held_blobs SET "lastReferencedAt" = now()
         WHERE scope = ${v.scope} AND sha256 = ${v.baseSha256}
        RETURNING scope, sha256)
      INSERT INTO held_views (scope, "baseSha256", "r9Version", "viewVersion", "viewText", "lineCount", "rewrittenLines", "createdAt")
      SELECT t.scope, t.sha256, ${v.r9Version}, ${v.viewVersion}, ${v.viewText}, ${v.lineCount}, ${intArrayLiteral(v.rewrittenLines)}::int[], now()
        FROM t
      ON CONFLICT DO NOTHING`);
    const stored = await readHeldView(db, v);
    return stored ? { ok: true, view: stored, inserted: inserted === 1 } : { ok: false, state: 'view-unavailable' };
  } catch (err) {
    return { ok: false, state: 'view-unavailable', fault: errorFacts(err) };
  }
}

export type TouchResult =
  | { ok: true; touched: Set<string>; missing: Set<string> }
  | { ok: false; fault: { name?: string; code?: string; metaCode?: string } };

/**
 * The BASE touch (V-5d `prepareHeldPackage`, pre-tx, autocommit): refresh `lastReferencedAt` on every base blob the
 * package names, locking them in ONE fixed order — `ORDER BY scope, sha256 FOR UPDATE` in the subquery — so two
 * packages touching overlapping sets cannot deadlock, and the GC (FOR UPDATE SKIP LOCKED, grace on its DELETE target)
 * either skips a locked row or, having deleted it first, leaves it out of the RETURNING set. `missing` = requested −
 * returned: each such file is `base-not-held` (per FILE, never the whole package). Never throws.
 */
export async function touchHeldBases(db: RawQueryDb, keys: ReadonlyArray<{ scope: string; sha256: string }>): Promise<TouchResult> {
  const want = new Map<string, { scope: string; sha256: string }>();
  for (const k of keys) want.set(heldBlobKey(k.scope, k.sha256), k);
  if (want.size === 0) return { ok: true, touched: new Set(), missing: new Set() };
  const vals = [...want.values()];
  try {
    const rows = await db.$queryRaw<Array<{ scope: string; sha256: string }>>(Prisma.sql`
      UPDATE held_blobs t SET "lastReferencedAt" = now()
       WHERE (t.scope, t.sha256) IN (
         SELECT b.scope, b.sha256 FROM held_blobs b
          WHERE (b.scope, b.sha256) IN (${Prisma.join(vals.map((k) => Prisma.sql`(${k.scope}, ${k.sha256})`))})
          ORDER BY b.scope, b.sha256
          FOR UPDATE)
      RETURNING t.scope, t.sha256`);
    const touched = new Set(rows.map((r) => heldBlobKey(r.scope, r.sha256)));
    return { ok: true, touched, missing: new Set([...want.keys()].filter((k) => !touched.has(k))) };
  } catch (err) {
    return { ok: false, fault: errorFacts(err) };
  }
}

/** A BASE or CANDIDATE ref (§3.2): minted pre-tx, call provenance NULL, a `fromRefId` chain. */
export interface HeldPackageRefRow {
  id: string;
  scope: string;
  blobSha256: string;
  executionId: string;
  kind: 'BASE' | 'CANDIDATE';
  legTaskId: string | null;
  rootTaskId: string | null;
  serviceId: string;
  serviceName: string;
  sourceTool: null;
  toolCallIndex: null;
  selector: null;
  target: string;
  path: string;
  declaredBy: null;
  descriptorVersion: null;
  /** WI-B10: never inherited — a BASE / CANDIDATE carries null. */
  declarationSha256: null;
  /** INTERNAL-FIT IF-3: never inherited — CAPTURE rows only. */
  eligibility: null;
  grantPovId: null;
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
  /** K-3: inherited — BASE from its CAPTURE, CANDIDATE from its BASE (a `create` from its onHandle base). REQUIRED key. */
  sourceRevision: string | null;
  /** BASE: its CAPTURE ref. CANDIDATE: its BASE ref, or NULL for a `create`. */
  fromRefId: string | null;
}

/** WI-B10: a registrant row carries its declaration sha (64 hex); any other row carries null (or, on a pre-WI-B10 caller, no key). */
function declShaConsistent(r: Record<string, unknown>): boolean {
  const sha = r.declarationSha256;
  if (r.declaredBy === 'registrant') return typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha);
  return sha === null || sha === undefined;
}

/** INTERNAL-FIT IF-3: eligibility is a closed set (or null), and grantPovId is set exactly when it is 'granted'. */
const STORED_ELIGIBILITY = ['own', 'granted', 'install', 'platform'];
function eligConsistent(r: Record<string, unknown>): boolean {
  const e = r.eligibility; const g = r.grantPovId;
  if (e === null || e === undefined) return g === null || g === undefined;
  if (typeof e !== 'string' || !STORED_ELIGIBILITY.includes(e)) return false;
  return e === 'granted' ? typeof g === 'string' && /^c[a-z0-9]{20,30}$/.test(g) : g === null || g === undefined;
}

export const HELD_REF_ID_RE = /^c[a-z0-9]{24}$/;
/** CANDIDATE `hashBasis` (§3.2): the platform rendered the text; nothing was decoded. */
export const CANDIDATE_HASH_BASIS = 'platform-candidate-text';

/** §3.2, the BASE / CANDIDATE half of `validateHeldRow`. CAPTURE validation is untouched (the branch above). */
function validPackageRef(r: Record<string, unknown>): boolean {
  const kind = r.kind;
  if (kind !== 'BASE' && kind !== 'CANDIDATE') return false;
  const provenanceNull = r.sourceTool === null && r.toolCallIndex === null && r.selector === null && r.declaredBy === null
    && r.descriptorVersion === null && (r.declarationSha256 === null || r.declarationSha256 === undefined)
    && (r.eligibility === null || r.eligibility === undefined) && (r.grantPovId === null || r.grantPovId === undefined);
  const idOk = typeof r.id === 'string' && HELD_REF_ID_RE.test(r.id);
  const fromOk = kind === 'BASE'
    ? typeof r.fromRefId === 'string' && HELD_REF_ID_RE.test(r.fromRefId)
    : r.fromRefId === null || (typeof r.fromRefId === 'string' && HELD_REF_ID_RE.test(r.fromRefId));
  const candidateEncoding = kind === 'BASE' || (r.hashBasis === CANDIDATE_HASH_BASIS && r.decodeVersion === 'none');
  return idOk && provenanceNull && fromOk && candidateEncoding
    && reqStr(r.scope) && /^[0-9a-f]{64}$/.test(String(r.blobSha256)) && reqStr(r.executionId)
    && optStr(r.legTaskId) && optStr(r.rootTaskId) && reqStr(r.serviceId) && reqStr(r.serviceName)
    && reqStr(r.target) && reqStr(r.path) && reqStr(r.hashBasis) && reqStr(r.decodeVersion) && reqStr(r.redactorVersion)
    && isInt(r.redactedCount) && isInt(r.lineCount) && optStr(r.newline) && optBool(r.bom) && optBool(r.finalNewline)
    && optBool(r.serviceReportsComplete) && optInt(r.derivedRawByteLength) && isInt(r.placeholderPreexistingCount)
    && optRev(r.sourceRevision);
}

export type HeldRefWrite = 'committed' | 'rolled-back';

/**
 * The package refs (BASE + CANDIDATE, V-5e), INSIDE the terminal SUCCESS transaction, bracketed by SAVEPOINT
 * held_package: any error between SAVEPOINT and RELEASE rolls back to it and the transaction continues, and the caller
 * picks the `refWrite: 'rolled-back'` variants of result.json and both manifests. Exactly one savepoint per batch. A variant
 * Author whose own reads ALSO produced a capture batch gets two independent savepoints — `held_package` before the artifacts,
 * `held_capture` after — and each rolls back only its own rows (push-2 code review DB-P2-4; the earlier "never" was false).
 * Rows are validated PRE-tx by the caller; this decides nothing.
 * The warn carries name / code / metaCode only (a Postgres DETAIL prints key values).
 */
export async function insertHeldPackageRows(
  tx: Prisma.TransactionClient,
  rows: HeldPackageRefRow[],
  logger: HeldStoreLogger,
  executionId: string,
): Promise<HeldRefWrite> {
  await tx.$executeRaw`SAVEPOINT held_package`;
  try {
    // HeldPackageRefRow is assignable to the create input by type (no cast). NB (DB SF-2, 2026-10-18): only a NOT NULL
    // column the schema adds fails tsc here — a NULLABLE one is optional in the create input, so it is caught only by a
    // REQUIRED key on HeldPackageRefRow / HeldFileRefRow / PlannedHeldFile (sourceRevision is one).
    if (rows.length > 0) await tx.heldFileRef.createMany({ data: rows satisfies Prisma.HeldFileRefCreateManyInput[] });
    await tx.$executeRaw`RELEASE SAVEPOINT held_package`;
    return 'committed';
  } catch (err) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT held_package`;
    logger.warn({ executionId, ...errorFacts(err), refs: rows.length },
      'held-bytes: package refs rolled back to savepoint (the SUCCESS persist continues; refWrite rolled-back)');
    return 'rolled-back';
  }
}
