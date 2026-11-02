#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage B (V-1) — scratch-DB rehearsal of the variant STORE functions on the real schema. LOCAL ONLY,
 * not CI (needs a Postgres it may CREATE DATABASE on). Same harness as rehearse-held-schema-b.ts: refuses unless
 * DATABASE_URL's host is localhost / 127.0.0.1, `prisma db push`es the CURRENT schema into a throwaway database, drops it.
 *
 *   1. upsertHeldView: first write inserts; a second write with DIFFERENT text returns the STORED first row (DO NOTHING,
 *      never DO UPDATE); `rewrittenLines` [] is stored as '{}' (never NULL); a view for a missing blob ⇒ view-unavailable;
 *      the write touched the blob's lastReferencedAt.
 *   2. MI-13 "held_views rows with NULL rewrittenLines": its OWN SQL (extracted from the inventory) reads 0 after the
 *      shipping writes, and 1 after a planted raw NULL row (positive control).
 *   3. view-insert-vs-GC-cascade, both orders: (a) GC deletes the aged blob in an OPEN transaction; upsertHeldView blocks
 *      on the row, then finds it gone at commit ⇒ view-unavailable, no view row; (b) the view write commits first ⇒ the
 *      blob is touched, the GC keeps it (grace on the DELETE target) and the view survives.
 *   4. BASE-touch-vs-GC, both orders, same shape: GC first ⇒ the key is `missing` (base-not-held); touch first ⇒ kept.
 *      Plus: two keys requested, one absent ⇒ exactly that one missing (the per-file set difference).
 *   5. SAVEPOINT held_package under real Prisma interactive-transaction error states, statement order of V-5e (package
 *      refs, then the artifact write): an FK failure (CANDIDATE on a blob that is not held), a duplicate id (P2002) and a
 *      NUL byte (22021) each ⇒ 'rolled-back', the transaction continues, the artifact commits, no package ref exists; the
 *      happy path ⇒ 'committed' with the BASE → CANDIDATE chain.
 *   6. CANDIDATE orphaning after the rollback: the candidate blob (upserted pre-tx) is left unreferenced, and the SHIPPING
 *      gcBatchSql collects it once aged.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/rehearse-held-store-b.ts
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-B-PLAN.md §3 V-1.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import {
  gcBatchSql, newHeldRefId, upsertHeldView, touchHeldBases, insertHeldPackageRows, heldBlobKey, upsertHeldBlobs,
  validateHeldRow, HELD_VIEW_VERSION, CANDIDATE_HASH_BASIS, type HeldPackageRefRow,
} from '../lib/services/held-bytes-store';

const results: Array<{ name: string; pass: boolean; note: string }> = [];
const record = (name: string, pass: boolean, note: string) => { results.push({ name, pass, note }); console.log(`${pass ? '✅' : '❌'} ${name} — ${note}`); };
const quiet = (c: Client): Client => { c.on('error', () => undefined); return c; };
const SCOPE = 'cmpovREHEARSALS';
const EXEC = 'cmexecREHEARSALS';
const R9 = 'paichart.r9/1';
const hex = (c: string) => c.repeat(64);
const ROOT = path.join(__dirname, '..');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const logger = { warn: () => undefined };

function mi13NullViewLineSql(): string {
  const inv = fs.readFileSync(path.join(ROOT, 'scripts', 'report-mechanism-inventory.sh'), 'utf8');
  const m = inv.match(/'🔴 a held_views row with a NULL rewrittenLines[^']*', (count\(\*\)::text FROM held_views WHERE [^\n]*)/);
  if (!m) throw new Error('MI-13 NULL rewrittenLines line not found');
  return `SELECT ${m[1]}`;
}

async function seedBlob(c: Client, sha: string, aged: boolean): Promise<void> {
  await c.query(`INSERT INTO held_blobs (scope, sha256, content, "storedByteLength", "createdAt", "lastReferencedAt")
    VALUES ($1, $2, $3, 1, now() - interval '3 days', ${aged ? "now() - interval '2 days'" : 'now()'})`, [SCOPE, sha, Buffer.from('x')]);
}

const pkgRef = (id: string, kind: 'BASE' | 'CANDIDATE', sha: string, fromRefId: string | null, over: Partial<HeldPackageRefRow> = {}): HeldPackageRefRow => ({
  id, scope: SCOPE, blobSha256: sha, executionId: EXEC, kind, legTaskId: null, rootTaskId: null, serviceId: 's',
  serviceName: 'observability-readonly', sourceTool: null, toolCallIndex: null, selector: null, target: 'obs-otelcol',
  path: '/etc/otelcol/config.yaml', declaredBy: null, descriptorVersion: null, declarationSha256: null, eligibility: null, grantPovId: null,
  hashBasis: kind === 'BASE' ? 'legacy-decoded-text' : CANDIDATE_HASH_BASIS, decodeVersion: kind === 'BASE' ? 'paichart.text/1' : 'none',
  redactorVersion: 'paichart.r10/3', redactedCount: 0, lineCount: 1, newline: null, bom: null, finalNewline: null,
  serviceReportsComplete: null, derivedRawByteLength: null, placeholderPreexistingCount: 0, fromRefId,
  sourceRevision: null, // held-k8s 1a: required on the row type
  ...over,
});

/** Start `p`, prove it is BLOCKED (still pending after `ms`), then run `release` and return p's result. */
async function blockedThen<T>(p: Promise<T>, release: () => Promise<unknown>, ms = 400): Promise<{ blocked: boolean; value: T }> {
  let done = false; p.then(() => { done = true; }, () => { done = true; });
  await sleep(ms);
  const blocked = !done;
  await release();
  return { blocked, value: await p };
}

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL not set');
  const u = new URL(base.replace(/^postgres(ql)?:/, 'http:'));
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error(`refusing: DATABASE_URL host is ${u.hostname}, not localhost`);
  const db = `phb_store_b_${process.pid}`;
  const adminUrl = base.replace(/\/[^/?]+(\?.*)?$/, '/postgres$1');
  const url = base.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
  const admin = quiet(new Client({ connectionString: adminUrl }));
  await admin.connect();
  await admin.query(`CREATE DATABASE ${db}`);
  console.log(`throwaway database ${db} created; pushing schema…`);
  let prisma: PrismaClient | null = null;
  const c = quiet(new Client({ connectionString: url }));
  const gc = quiet(new Client({ connectionString: url }));
  try {
    execSync('npx prisma db push --skip-generate', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
    await c.connect(); await gc.connect();
    await c.query('SET session_replication_role = replica');
    await c.query(`INSERT INTO agent_executions (id, "taskId", status, config, context, logs, "createdAt", "updatedAt")
      VALUES ('${EXEC}', 'cmtaskREHEARSALS', 'SUCCESS', '{}', '{}', '{}', now(), now())`);
    await c.query('SET session_replication_role = origin');
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const gcSql = gcBatchSql('1 day', 1000);
    const runGcOpen = async () => { await gc.query('BEGIN'); await gc.query(gcSql.text, gcSql.values as unknown[]); };
    const lastRef = async (sha: string) => (await c.query(`SELECT "lastReferencedAt" > now() - interval '1 minute' AS fresh FROM held_blobs WHERE scope=$1 AND sha256=$2`, [SCOPE, sha])).rows[0]?.fresh;

    // ── case 1 ──
    await seedBlob(c, hex('a'), true);
    const key = { scope: SCOPE, baseSha256: hex('a'), r9Version: R9, viewVersion: HELD_VIEW_VERSION };
    const w1 = await upsertHeldView(prisma, { ...key, viewText: 'x\ny', lineCount: 2, rewrittenLines: [] });
    const w2 = await upsertHeldView(prisma, { ...key, viewText: 'CHANGED', lineCount: 1, rewrittenLines: [1] });
    const missing = await upsertHeldView(prisma, { ...key, baseSha256: hex('9'), viewText: 'x', lineCount: 1, rewrittenLines: [] });
    const raw = (await c.query(`SELECT "rewrittenLines" IS NULL AS isnull, "rewrittenLines"::text AS lit FROM held_views WHERE scope=$1`, [SCOPE])).rows;
    record('case 1 upsertHeldView: insert, DO NOTHING returns the STORED row, [] stored as {}, missing blob ⇒ view-unavailable, blob touched',
      w1.ok && w1.inserted && w2.ok && !w2.inserted && w2.view.viewText === 'x\ny' && JSON.stringify(w2.view.rewrittenLines) === '[]'
        && raw.length === 1 && raw[0].isnull === false && raw[0].lit === '{}' && !missing.ok && missing.state === 'view-unavailable'
        && (await lastRef(hex('a'))) === true,
      `w1 ${w1.ok && w1.inserted} · w2 stored ${w2.ok && w2.view.viewText === 'x\ny'} inserted ${w2.ok && w2.inserted} · literal ${raw[0]?.lit} · missing ${missing.ok ? 'ok?!' : missing.state}`);

    // ── case 2 ──
    const nullSql = mi13NullViewLineSql();
    const n0 = (await c.query(nullSql)).rows[0].count;
    await seedBlob(c, hex('b'), false);
    await c.query(`INSERT INTO held_views (scope, "baseSha256", "r9Version", "viewVersion", "viewText", "lineCount", "rewrittenLines") VALUES ($1,$2,$3,$4,'v',1,NULL)`,
      [SCOPE, hex('b'), R9, HELD_VIEW_VERSION]);
    const n1 = (await c.query(nullSql)).rows[0].count;
    await c.query(`DELETE FROM held_views WHERE scope=$1 AND "baseSha256"=$2`, [SCOPE, hex('b')]);
    record('case 2 MI-13 NULL rewrittenLines line (its own SQL): 0 after shipping writes, 1 after a planted NULL row', n0 === '0' && n1 === '1', `before ${n0}, planted ${n1}`);

    // ── case 3a: GC first (open tx) — the view write blocks, then finds the blob gone ──
    await seedBlob(c, hex('c'), true);
    await runGcOpen();
    const a3 = await blockedThen(upsertHeldView(prisma, { ...key, baseSha256: hex('c'), viewText: 'v', lineCount: 1, rewrittenLines: [] }), () => gc.query('COMMIT'));
    const v3a = (await c.query(`SELECT count(*)::int n FROM held_views WHERE scope=$1 AND "baseSha256"=$2`, [SCOPE, hex('c')])).rows[0].n;
    record('case 3a view-insert vs GC (GC first): blocked on the row, then view-unavailable, no view row',
      a3.blocked && !a3.value.ok && v3a === 0, `blocked ${a3.blocked} · result ${a3.value.ok ? 'ok?!' : a3.value.state} · rows ${v3a}`);
    // ── case 3b: view first — the GC keeps the touched blob and its view ──
    await seedBlob(c, hex('d'), true);
    const b3 = await upsertHeldView(prisma, { ...key, baseSha256: hex('d'), viewText: 'v', lineCount: 1, rewrittenLines: [] });
    await gc.query(gcSql.text, gcSql.values as unknown[]);
    const kept3 = (await c.query(`SELECT (SELECT count(*) FROM held_blobs WHERE scope=$1 AND sha256=$2)::int b, (SELECT count(*) FROM held_views WHERE scope=$1 AND "baseSha256"=$2)::int v`, [SCOPE, hex('d')])).rows[0];
    record('case 3b view-insert vs GC (view first): blob touched, GC keeps blob and view', b3.ok && kept3.b === 1 && kept3.v === 1, `view ${b3.ok} · blob ${kept3.b} · view rows ${kept3.v}`);

    // ── case 4 ──
    await seedBlob(c, hex('e'), true);
    await runGcOpen();
    const a4 = await blockedThen(touchHeldBases(prisma, [{ scope: SCOPE, sha256: hex('e') }]), () => gc.query('COMMIT'));
    await seedBlob(c, hex('f'), true);
    const b4 = await touchHeldBases(prisma, [{ scope: SCOPE, sha256: hex('f') }, { scope: SCOPE, sha256: hex('8') }]);
    await gc.query(gcSql.text, gcSql.values as unknown[]);
    const kept4 = (await c.query(`SELECT count(*)::int n FROM held_blobs WHERE scope=$1 AND sha256=$2`, [SCOPE, hex('f')])).rows[0].n;
    record('case 4 BASE touch vs GC: GC first ⇒ blocked then missing (base-not-held); touch first ⇒ kept; per-file set difference',
      a4.blocked && a4.value.ok && a4.value.missing.has(heldBlobKey(SCOPE, hex('e'))) && a4.value.touched.size === 0
        && b4.ok && b4.touched.has(heldBlobKey(SCOPE, hex('f'))) && b4.missing.size === 1 && b4.missing.has(heldBlobKey(SCOPE, hex('8'))) && kept4 === 1,
      `GC-first blocked ${a4.blocked} missing ${a4.value.ok ? a4.value.missing.size : 'fault'} · touch-first touched ${b4.ok ? b4.touched.size : 'fault'} missing ${b4.ok ? [...b4.missing].length : '-'} · kept ${kept4}`);

    // ── case 5 ──
    await seedBlob(c, hex('1'), false);       // the base
    const cand = await upsertHeldBlobs(prisma, [{ scope: SCOPE, sha256: hex('2'), content: 'cand', storedByteLength: 4 }]); // pre-tx candidate
    const artifact = async (tx: unknown, name: string) => (tx as PrismaClient).$executeRawUnsafe(
      `INSERT INTO agent_artifacts (id, "executionId", name, type, content, "createdAt") VALUES ('${newHeldRefId()}', '${EXEC}', '${name}', 'json', '{}', now())`);
    const capId = newHeldRefId(); const dupId = newHeldRefId();
    const variants: Array<[string, HeldPackageRefRow[], string]> = [
      ['FK (CANDIDATE on an unheld blob)', [pkgRef(newHeldRefId(), 'BASE', hex('1'), capId), pkgRef(newHeldRefId(), 'CANDIDATE', hex('7'), null)], 'fk'],
      ['duplicate id (P2002)', [pkgRef(dupId, 'BASE', hex('1'), capId), pkgRef(dupId, 'CANDIDATE', hex('2'), null)], 'dup'],
      ['NUL byte (22021)', [pkgRef(newHeldRefId(), 'BASE', hex('1'), capId, { path: 'a\u0000b' })], 'nul'],
    ];
    const outcomes: string[] = [];
    for (const [label, rows, tag] of variants) {
      const w = await prisma.$transaction(async (tx) => {
        const rw = await insertHeldPackageRows(tx as never, rows, logger, EXEC);
        await artifact(tx, `result-${tag}.json`);
        return rw;
      });
      const arts = (await c.query(`SELECT count(*)::int n FROM agent_artifacts WHERE name=$1`, [`result-${tag}.json`])).rows[0].n;
      const refs = (await c.query(`SELECT count(*)::int n FROM held_file_refs WHERE kind IN ('BASE','CANDIDATE')`)).rows[0].n;
      outcomes.push(`${label}: ${w}/artifact ${arts}/refs ${refs}`);
      if (!(w === 'rolled-back' && arts === 1 && refs === 0)) outcomes.push('  ↑ FAILED');
    }
    const bId = newHeldRefId(); const cId = newHeldRefId();
    const okRows = [pkgRef(bId, 'BASE', hex('1'), capId), pkgRef(cId, 'CANDIDATE', hex('2'), bId)];
    const allValid = okRows.every((r) => validateHeldRow('ref', r));
    const happy = await prisma.$transaction(async (tx) => { const rw = await insertHeldPackageRows(tx as never, okRows, logger, EXEC); await artifact(tx, 'result-ok.json'); return rw; });
    const chain = (await c.query(`SELECT kind, "fromRefId" FROM held_file_refs WHERE kind IN ('BASE','CANDIDATE') ORDER BY kind`)).rows;
    record('case 5 SAVEPOINT held_package under Prisma interactive-tx errors (FK / P2002 / 22021) ⇒ rolled-back, tx continues, artifact commits; happy ⇒ committed',
      cand.ok && !outcomes.some((o) => o.includes('FAILED')) && allValid && happy === 'committed' && chain.length === 2
        && chain[0].kind === 'BASE' && chain[0].fromRefId === capId && chain[1].fromRefId === bId,
      `${outcomes.join(' · ')} · happy ${happy}, chain ${JSON.stringify(chain.map((r) => r.kind))}, rows valid ${allValid}`);

    // ── case 6: a candidate blob left unreferenced by a rolled-back package is collected once aged ──
    await c.query(`DELETE FROM held_file_refs WHERE kind IN ('BASE','CANDIDATE')`);
    await c.query(`UPDATE held_blobs SET "lastReferencedAt" = now() - interval '2 days' WHERE scope=$1 AND sha256=$2`, [SCOPE, hex('2')]);
    await gc.query(gcSql.text, gcSql.values as unknown[]);
    const orphan = (await c.query(`SELECT count(*)::int n FROM held_blobs WHERE scope=$1 AND sha256=$2`, [SCOPE, hex('2')])).rows[0].n;
    record('case 6 CANDIDATE orphan (rolled-back package): unreferenced candidate blob collected by the shipping GC once aged', orphan === 0, `remaining ${orphan}`);
  } finally {
    if (prisma) await prisma.$disconnect();
    await c.end().catch(() => undefined); await gc.end().catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await admin.end();
    console.log(`throwaway database ${db} dropped`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} cases pass`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error('❌ rehearsal crashed:', e instanceof Error ? e.message : e); process.exit(1); });
