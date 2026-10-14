#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage A WI-11 — GC race rehearsal + real-DB insert proof. LOCAL ONLY, not CI.
 *
 * Creates a THROWAWAY database on the local Postgres (refuses unless DATABASE_URL's host is localhost / 127.0.0.1),
 * `prisma db push`es the schema into it, runs four cases against the SHIPPING SQL, and drops it. Nothing else is touched.
 * The one parent row the refs need (an agent_executions row) is inserted with `session_replication_role = replica` so its
 * own task FK is skipped; every constraint under test (refs → blobs RESTRICT, refs/refusals → executions CASCADE) is live.
 *
 *   1. Deterministic three-session interleave (panel DB-1 / arch B1). PASS = 0 persist-side errors on the v2 SQL.
 *      POSITIVE CONTROL: the same sequence on v1's SQL (grace only in the subquery, no SKIP LOCKED) MUST reproduce the
 *      persist-side 23503 — if it does not, this rehearsal is not exercising the race and its PASS means nothing (STOP).
 *      Plus each v2 layer ALONE (DB NEW-3): target predicate only; SKIP LOCKED only. Each must keep the blob.
 *   2. Mode 1 — production grace, burst: captures that re-reference the pre-aged blobs themselves, interleaved with GC runs
 *      from two clients. PASS = 0 persist-side errors; every referenced blob present; every untouched pre-aged blob gone.
 *   3. Mode 2 — grace forced to 0 s: MEASURES the window the 1-day grace closes. Not a STOP.
 *   4. Real Prisma insert proof: one held_capture_refusals row of EVERY Stage A refusal name + one held_file_refs row,
 *      inside an interactive $transaction with the SAVEPOINT; then a bad row ⇒ ROLLBACK TO SAVEPOINT and the rows around
 *      it commit (panel DB-3(c) shape; BC-A1 fix 6). Only Prisma itself proves the Json / required-field behaviour.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/rehearse-held-gc-race.ts
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-11.
 */
import { execSync } from 'child_process';
import { Client } from 'pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { upsertHeldBlobs, gcHeldBlobs, gcBatchSql } from '../lib/services/held-bytes-store';

const results: Array<{ name: string; pass: boolean; note: string }> = [];
const record = (name: string, pass: boolean, note: string) => { results.push({ name, pass, note }); console.log(`${pass ? '✅' : '❌'} ${name} — ${note}`); };
/** A Client whose late 'error' events (e.g. the throwaway DB being dropped) never crash the process. */
const quiet = (c: Client): Client => { c.on('error', () => undefined); return c; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SCOPE = 'cmpovREHEARSAL';
const EXEC = 'cmexecREHEARSAL';
const hex = (c: string) => c.repeat(64);

const V1_GC = `DELETE FROM held_blobs WHERE (scope, sha256) IN (
  SELECT b.scope, b.sha256 FROM held_blobs b WHERE b."lastReferencedAt" < now() - interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r.scope = b.scope AND r."blobSha256" = b.sha256) LIMIT 1000)`;
const TARGET_ONLY_GC = `DELETE FROM held_blobs t WHERE t."lastReferencedAt" < now() - interval '1 day' AND (t.scope, t.sha256) IN (
  SELECT b.scope, b.sha256 FROM held_blobs b WHERE b."lastReferencedAt" < now() - interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r.scope = b.scope AND r."blobSha256" = b.sha256)
    ORDER BY b.scope, b.sha256 LIMIT 1000)`;
const SKIP_ONLY_GC = `DELETE FROM held_blobs t WHERE (t.scope, t.sha256) IN (
  SELECT b.scope, b.sha256 FROM held_blobs b WHERE b."lastReferencedAt" < now() - interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r.scope = b.scope AND r."blobSha256" = b.sha256)
    ORDER BY b.scope, b.sha256 LIMIT 1000 FOR UPDATE SKIP LOCKED)`;
const v2 = gcBatchSql('1 day', 1000);
const V2_GC = { text: v2.text, values: v2.values as unknown[] };

const UPSERT_ONE = `INSERT INTO held_blobs (scope, sha256, content, "storedByteLength", "createdAt", "lastReferencedAt")
  VALUES ($1, $2, $3, $4, now(), now()) ON CONFLICT (scope, sha256) DO UPDATE SET "lastReferencedAt" = now()`;
const REF_INSERT = `INSERT INTO held_file_refs (id, scope, "blobSha256", "executionId", kind, "serviceId", "serviceName",
  "sourceTool", "toolCallIndex", selector, target, path, "declaredBy", "hashBasis", "decodeVersion", "redactorVersion",
  "redactedCount", "lineCount", "placeholderPreexistingCount")
  VALUES ($1, $2, $3, '${EXEC}', 'CAPTURE', 's', 'observability-readonly', 'get_otel_config', 0, '/structuredContent/yaml',
  'obs-otelcol', '/etc/otelcol/config.yaml', 'platform-default', 'legacy-decoded-text', 'paichart.text/1', 'paichart.r10/2', 0, 1, 0)`;

async function seedAgedBlob(c: Client, sha: string): Promise<void> {
  await c.query(`INSERT INTO held_blobs (scope, sha256, content, "storedByteLength", "createdAt", "lastReferencedAt")
    VALUES ($1, $2, $3, 1, now() - interval '3 days', now() - interval '2 days')`, [SCOPE, sha, Buffer.from('x')]);
}
const blobExists = async (c: Client, sha: string) =>
  (await c.query('SELECT 1 FROM held_blobs WHERE scope = $1 AND sha256 = $2', [SCOPE, sha])).rowCount === 1;

/** U touches x and holds the transaction; G runs the GC; U commits; then the ref insert. */
async function interleave(url: string, gc: string | { text: string; values: unknown[] }, sha: string): Promise<{ kept: boolean; refErr: string | null }> {
  const U = quiet(new Client({ connectionString: url })); const G = quiet(new Client({ connectionString: url })); const R = quiet(new Client({ connectionString: url }));
  await Promise.all([U.connect(), G.connect(), R.connect()]);
  try {
    await seedAgedBlob(R, sha);
    await U.query('BEGIN');
    await U.query(UPSERT_ONE, [SCOPE, sha, Buffer.from('x'), 1]);
    const gcRun = typeof gc === 'string' ? G.query(gc) : G.query(gc.text, gc.values);
    await sleep(700);
    await U.query('COMMIT');
    await gcRun;
    const kept = await blobExists(R, sha);
    let refErr: string | null = null;
    try {
      await R.query('BEGIN');
      await R.query(REF_INSERT, [`ref_${sha.slice(0, 6)}_${Date.now()}`, SCOPE, sha]);
      await R.query('COMMIT');
    } catch (e) { refErr = (e as { code?: string }).code ?? 'unknown'; await R.query('ROLLBACK'); }
    return { kept, refErr };
  } finally { await Promise.all([U.end(), G.end(), R.end()]); }
}

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL not set');
  const u = new URL(base.replace(/^postgres(ql)?:/, 'http:'));
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error(`refusing: DATABASE_URL host is ${u.hostname}, not localhost`);
  const db = `phb_rehearsal_${process.pid}`;
  // Keep the query string (socket host, sslmode — code review DB note); only the database name changes.
  const adminUrl = base.replace(/\/[^/?]+(\?.*)?$/, '/postgres$1');
  const url = base.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
  const admin = quiet(new Client({ connectionString: adminUrl }));
  await admin.connect();
  await admin.query(`CREATE DATABASE ${db}`);
  console.log(`throwaway database ${db} created; pushing schema…`);
  let prisma: PrismaClient | null = null;
  try {
    execSync('npx prisma db push --skip-generate', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
    const c = quiet(new Client({ connectionString: url })); await c.connect();
    await c.query('SET session_replication_role = replica');
    await c.query(`INSERT INTO agent_executions (id, "taskId", status, config, context, logs, "createdAt", "updatedAt")
      VALUES ('${EXEC}', 'cmtaskREHEARSAL', 'SUCCESS', '{}', '{}', '{}', now(), now())`);
    await c.query('SET session_replication_role = origin');
    await c.end();

    // ── case 1 ──────────────────────────────────────────────────────────────────────────────────────────────────
    const ctl = await interleave(url, V1_GC, hex('1'));
    record('case 1 POSITIVE CONTROL (v1 SQL reproduces the race)', !ctl.kept && ctl.refErr === '23503',
      `v1: blob kept=${ctl.kept}, ref insert error=${ctl.refErr} (must be deleted + 23503, else this rehearsal tests nothing)`);
    const v2r = await interleave(url, V2_GC, hex('2'));
    record('case 1 v2 SQL (shipping)', v2r.kept && v2r.refErr === null, `kept=${v2r.kept}, ref error=${v2r.refErr}`);
    const tOnly = await interleave(url, TARGET_ONLY_GC, hex('3'));
    record('case 1 layer: target predicate ALONE (EvalPlanQual path)', tOnly.kept && tOnly.refErr === null, `kept=${tOnly.kept}, ref error=${tOnly.refErr}`);
    const sOnly = await interleave(url, SKIP_ONLY_GC, hex('4'));
    record('case 1 layer: SKIP LOCKED ALONE (no outer predicate)', sOnly.kept && sOnly.refErr === null, `kept=${sOnly.kept}, ref error=${sOnly.refErr}`);

    // ── cases 2 and 3: bursts through the SHIPPING store functions on two Prisma clients ─────────────────────────
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const prisma2 = new PrismaClient({ datasources: { db: { url } } });
    const burst = async (grace: string) => {
      const s = quiet(new Client({ connectionString: url })); await s.connect();
      await s.query('DELETE FROM held_file_refs'); await s.query('DELETE FROM held_blobs');
      const aged = Array.from({ length: 20 }, (_, i) => (i + 1).toString(16).padStart(64, 'a'));
      for (const sha of aged) await seedAgedBlob(s, sha);
      const touched = aged.slice(0, 10); // re-referenced by the captures (AE S1: the SAME pre-aged blobs)
      let persistErrors = 0; let gcFk = 0;
      const capture = async (i: number) => {
        const sha = touched[i % touched.length];
        const up = await upsertHeldBlobs(prisma!, [{ scope: SCOPE, sha256: sha, content: 'x', storedByteLength: 1 }]);
        if (!up.ok) { persistErrors++; return; }
        try {
          await prisma!.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(REF_INSERT, `ref_b_${i}_${Date.now()}`, SCOPE, sha);
          });
        } catch { persistErrors++; }
      };
      const gcs = async (client: PrismaClient) => { const r = await gcHeldBlobs(client, { graceInterval: grace }); if (r.stoppedOn === 'fk-race') gcFk++; };
      const jobs: Promise<void>[] = [];
      for (let i = 0; i < 20; i++) { jobs.push(capture(i)); jobs.push(gcs(i % 2 ? prisma! : prisma2)); }
      await Promise.all(jobs);
      await gcHeldBlobs(prisma!, { graceInterval: grace }); // a final sweep
      const present = (await s.query('SELECT sha256 FROM held_blobs WHERE scope = $1', [SCOPE])).rows.map((r) => r.sha256 as string);
      const referenced = (await s.query('SELECT DISTINCT "blobSha256" FROM held_file_refs')).rows.map((r) => r.blobSha256 as string);
      await s.end();
      return { persistErrors, gcFk, present, referenced, aged, touched };
    };
    let m1: Awaited<ReturnType<typeof burst>>;
    try { m1 = await burst('1 day'); } catch (e) {
      const ee = e as { message?: string; code?: string };
      record('case 2 mode 1 (1-day grace burst)', false, `CRASHED: ${ee.code ?? ''} ${String(ee.message ?? e).slice(0, 300)}`);
      throw e;
    }
    const untouchedGone = m1.aged.filter((a) => !m1.touched.includes(a)).every((a) => !m1.present.includes(a));
    const refsHaveBlobs = m1.referenced.every((r) => m1.present.includes(r));
    record('case 2 mode 1 (1-day grace burst)', m1.persistErrors === 0 && refsHaveBlobs && untouchedGone,
      `persist errors ${m1.persistErrors}; referenced blobs present ${refsHaveBlobs}; untouched pre-aged gone ${untouchedGone}; GC fk-race ${m1.gcFk}`);
    const m2 = await burst('0 seconds');
    record('case 3 mode 2 (0 s grace) — MEASURES the window, not a STOP', true,
      `persist-side errors ${m2.persistErrors}, GC fk-race ${m2.gcFk} (the window the 1-day grace closes)`);
    await prisma2.$disconnect();

    // ── case 4: real Prisma insert proof inside the savepoint ─────────────────────────────────────────────────
    const s4 = quiet(new Client({ connectionString: url })); await s4.connect();
    await s4.query('DELETE FROM held_capture_refusals'); await s4.query('DELETE FROM held_file_refs');
    await seedAgedBlob(s4, hex('c'));
    const NAMES: Array<[string, Record<string, string | number> | undefined]> = [
      ['not-declared', undefined], ['no-scope', undefined], ['is-error', { level: 'threw' }], ['raw-digest-present', { field: 'sha256' }],
      ['over-cap', { capScope: 'count', files: 3 }], ['descriptor-mismatch', { reason: 'not-a-string' }], ['path-invalid', { field: 'path' }],
      ['nul-byte', undefined], ['lone-surrogate', undefined], ['decode-violated', undefined], ['legacy-bom', undefined],
      ['line-map-broken', undefined], ['escaped-secret-residual', undefined], ['store-error', { class: 'db' }],
    ];
    const refusalRow = (name: string, detail?: Record<string, string | number>) => ({
      executionId: EXEC, scope: name === 'no-scope' ? null : SCOPE, serviceId: null, serviceName: 'observability-readonly',
      identitySource: 'arguments', sourceTool: 'get_otel_config', toolCallIndex: 0, selector: null, target: null, path: null,
      refusal: name, ...(detail ? { detail } : {}), declaredBy: 'platform-default', descriptorVersion: 1,
    });
    const refRow = {
      scope: SCOPE, blobSha256: hex('c'), executionId: EXEC, kind: 'CAPTURE', legTaskId: null, rootTaskId: null, serviceId: 's1',
      serviceName: 'observability-readonly', sourceTool: 'get_otel_config', toolCallIndex: 0, selector: '/structuredContent/yaml',
      target: 'obs-otelcol', path: '/etc/otelcol/config.yaml', declaredBy: 'platform-default', descriptorVersion: 1,
      hashBasis: 'legacy-decoded-text', decodeVersion: 'paichart.text/1', redactorVersion: 'paichart.r10/2', redactedCount: 0,
      lineCount: 1, newline: null, bom: null, finalNewline: null, serviceReportsComplete: null, derivedRawByteLength: null,
      placeholderPreexistingCount: 0,
    };
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SAVEPOINT held_capture`;
      await tx.heldFileRef.createMany({ data: [refRow] });
      await tx.heldCaptureRefusal.createMany({ data: NAMES.map(([n, d]) => refusalRow(n, d)) as Prisma.HeldCaptureRefusalCreateManyInput[] });
      await tx.$executeRaw`RELEASE SAVEPOINT held_capture`;
    });
    const nRef = Number((await s4.query('SELECT count(*) FROM held_file_refs')).rows[0].count);
    const names = (await s4.query('SELECT refusal, detail IS NULL AS no_detail FROM held_capture_refusals')).rows;
    const absentDetailOk = names.filter((r) => NAMES.find(([n, d]) => n === r.refusal && !d)).every((r) => r.no_detail === true);
    record('case 4a every refusal name + one ref insert through the REAL client', nRef === 1 && names.length === NAMES.length && absentDetailOk,
      `refs ${nRef}, refusals ${names.length}/${NAMES.length}, omitted detail stored as NULL: ${absentDetailOk}`);
    // 4b: a bad batch inside the savepoint — rolled back, the rows around it commit.
    await s4.query('DELETE FROM held_capture_refusals');
    await prisma.$transaction(async (tx) => {
      await tx.heldCaptureRefusal.createMany({ data: [refusalRow('not-declared')] as Prisma.HeldCaptureRefusalCreateManyInput[] }); // before
      await tx.$executeRaw`SAVEPOINT held_capture`;
      try {
        await tx.heldFileRef.createMany({ data: [{ ...refRow, blobSha256: hex('d') }] }); // FK to a missing blob
        await tx.$executeRaw`RELEASE SAVEPOINT held_capture`;
      } catch { await tx.$executeRaw`ROLLBACK TO SAVEPOINT held_capture`; }
      await tx.$executeRaw`SAVEPOINT held_capture`;
      try {
        await tx.heldCaptureRefusal.createMany({ data: [{ ...refusalRow('is-error'), executionId: undefined }] as unknown as Prisma.HeldCaptureRefusalCreateManyInput[] });
        await tx.$executeRaw`RELEASE SAVEPOINT held_capture`;
      } catch { await tx.$executeRaw`ROLLBACK TO SAVEPOINT held_capture`; }
      await tx.heldCaptureRefusal.createMany({ data: [refusalRow('store-error', { class: 'db' })] as Prisma.HeldCaptureRefusalCreateManyInput[] }); // after
    });
    const kept = (await s4.query('SELECT refusal FROM held_capture_refusals ORDER BY refusal')).rows.map((r) => r.refusal);
    const badRef = Number((await s4.query(`SELECT count(*) FROM held_file_refs WHERE "blobSha256" = $1`, [hex('d')])).rows[0].count);
    record('case 4b FK error and a missing required field roll back to the savepoint; the rows around them commit',
      JSON.stringify(kept) === JSON.stringify(['not-declared', 'store-error']) && badRef === 0, `kept ${JSON.stringify(kept)}, bad ref rows ${badRef}`);
    // 4c: the cascade — deleting the execution removes its refs and refusals; the blob is then GC-able.
    await s4.query(`DELETE FROM agent_executions WHERE id = '${EXEC}'`);
    const leftRefs = Number((await s4.query('SELECT count(*) FROM held_file_refs')).rows[0].count);
    const leftRefusals = Number((await s4.query('SELECT count(*) FROM held_capture_refusals')).rows[0].count);
    record('case 4c execution delete cascades to refs and refusals', leftRefs === 0 && leftRefusals === 0, `refs ${leftRefs}, refusals ${leftRefusals}`);
    await s4.end();
  } finally {
    if (prisma) await prisma.$disconnect();
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await admin.end();
    console.log(`throwaway database ${db} dropped`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} cases pass`);
  if (failed.length) {
    if (failed.some((f) => f.name.includes('POSITIVE CONTROL'))) console.log('STOP: the positive control did not reproduce the race — fix the rehearsal before trusting any PASS.');
    process.exit(1);
  }
}

main().catch((e) => { console.error('❌ rehearsal crashed:', e instanceof Error ? e.message : e); process.exit(1); });
