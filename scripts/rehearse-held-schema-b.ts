#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage B push 1 (P1-1) — scratch-DB proof of the B schema on the EXACT model text. LOCAL ONLY, not CI.
 *
 * Creates a THROWAWAY database on the local Postgres (refuses unless DATABASE_URL's host is localhost / 127.0.0.1),
 * `prisma db push`es the CURRENT schema.prisma into it, runs the cases below, and drops it. Nothing else is touched.
 * The one parent row the refs need (an agent_executions row) is inserted with `session_replication_role = replica`.
 *
 *   1. scripts/check-held-bytes-schema.sql reads ALL OK (every assertion, incl. the Stage B additions).
 *   2. A BASE ref (the 4 relaxed columns NULL, id from newHeldRefId, fromRefId = its CAPTURE) and a CANDIDATE ref
 *      (fromRefId = its BASE) insert through the REAL Prisma client; a CAPTURE ref still inserts as before.
 *   3. POSITIVE CONTROL for MI-13's 🔴 "CAPTURE ref with a NULL in the 4 relaxed columns": the DB accepts such a row (the rule
 *      is a measured invariant, not a constraint), and the inventory's OWN SQL for that line, extracted from the script,
 *      counts it (1), while the BASE / CANDIDATE rows with the same NULLs count 0.
 *   4. held_views: INSERT … ON CONFLICT DO NOTHING twice ⇒ one row; rewrittenLines (int[]) round-trips through Prisma; a view
 *      for a missing blob ⇒ 23503.
 *   5. GC (the SHIPPING gcBatchSql): an aged blob with NO ref but a view is deleted AND its view cascades; an aged blob held
 *      only by a BASE ref (kind-blind) is kept.
 *
 * The Stage A rehearsal (scripts/rehearse-held-gc-race.ts) is the other half of the rollback rehearsal: it runs Stage A's
 * shipping SQL against whatever schema.prisma holds, so run it on the B schema too.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/rehearse-held-schema-b.ts
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-B-PLAN.md P1-1.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { gcBatchSql, newHeldRefId } from '../lib/services/held-bytes-store';

const results: Array<{ name: string; pass: boolean; note: string }> = [];
const record = (name: string, pass: boolean, note: string) => { results.push({ name, pass, note }); console.log(`${pass ? '✅' : '❌'} ${name} — ${note}`); };
const quiet = (c: Client): Client => { c.on('error', () => undefined); return c; };
const SCOPE = 'cmpovREHEARSALB';
const EXEC = 'cmexecREHEARSALB';
const hex = (c: string) => c.repeat(64);
const ROOT = path.join(__dirname, '..');

const capture = (id: string | undefined, sha: string, over: Partial<Prisma.HeldFileRefCreateManyInput> = {}): Prisma.HeldFileRefCreateManyInput => ({
  ...(id ? { id } : {}), scope: SCOPE, blobSha256: sha, executionId: EXEC, kind: 'CAPTURE', serviceId: 's', serviceName: 'observability-readonly',
  sourceTool: 'get_otel_config', toolCallIndex: 0, selector: '/structuredContent/yaml', target: 'obs-otelcol', path: '/etc/otelcol/config.yaml',
  declaredBy: 'platform-default', descriptorVersion: 1, hashBasis: 'legacy-decoded-text', decodeVersion: 'paichart.text/1',
  redactorVersion: 'paichart.r10/2', redactedCount: 0, lineCount: 1, placeholderPreexistingCount: 0, ...over,
});

/** The MI-13 line's own SQL, extracted from the inventory script so this proves the shipped text, not a copy. */
function mi13NullLineSql(): string {
  const inv = fs.readFileSync(path.join(ROOT, 'scripts', 'report-mechanism-inventory.sh'), 'utf8');
  const m = inv.match(/'🔴 a CAPTURE ref with a NULL in the 4 relaxed columns[^']*', (count\(\*\)::text FROM held_file_refs WHERE [^\n]*)/);
  if (!m) throw new Error('MI-13 line not found');
  return `SELECT ${m[1]}`;
}

async function seedBlob(c: Client, sha: string, aged: boolean): Promise<void> {
  await c.query(`INSERT INTO held_blobs (scope, sha256, content, "storedByteLength", "createdAt", "lastReferencedAt")
    VALUES ($1, $2, $3, 1, now() - interval '3 days', ${aged ? "now() - interval '2 days'" : 'now()'})`, [SCOPE, sha, Buffer.from('x')]);
}

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL not set');
  const u = new URL(base.replace(/^postgres(ql)?:/, 'http:'));
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error(`refusing: DATABASE_URL host is ${u.hostname}, not localhost`);
  const db = `phb_schema_b_${process.pid}`;
  const adminUrl = base.replace(/\/[^/?]+(\?.*)?$/, '/postgres$1');
  const url = base.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
  // psql cannot read Prisma's query parameters (pgbouncer, pool_timeout …): give it the bare URL.
  const psqlUrl = url.replace(/\?.*$/, '');
  const admin = quiet(new Client({ connectionString: adminUrl }));
  await admin.connect();
  await admin.query(`CREATE DATABASE ${db}`);
  console.log(`throwaway database ${db} created; pushing schema…`);
  let prisma: PrismaClient | null = null;
  try {
    execSync('npx prisma db push --skip-generate', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });

    // ── case 1 ──────────────────────────────────────────────────────────────────────────────────────────────────
    const out = execSync(`psql "${psqlUrl}" -X -q -A -t -F '|' -v ON_ERROR_STOP=1 -f scripts/check-held-bytes-schema.sql`, { cwd: ROOT, encoding: 'utf8' });
    const rows = out.trim().split('\n').filter((l) => l.includes('|')).map((l) => l.split('|'));
    const bad = rows.filter(([, ok]) => ok !== 't').map(([n]) => n);
    const summary = rows.find(([n]) => n.startsWith('held_bytes_schema:'));
    record('case 1 check-held-bytes-schema.sql', bad.length === 0 && summary?.[0] === 'held_bytes_schema: ALL OK' && rows.length === 18,
      `${rows.length - 1} assertions, failing: ${JSON.stringify(bad)}, summary: ${summary?.[0]}`);

    const c = quiet(new Client({ connectionString: url })); await c.connect();
    await c.query('SET session_replication_role = replica');
    await c.query(`INSERT INTO agent_executions (id, "taskId", status, config, context, logs, "createdAt", "updatedAt")
      VALUES ('${EXEC}', 'cmtaskREHEARSALB', 'SUCCESS', '{}', '{}', '{}', now(), now())`);
    await c.query('SET session_replication_role = origin');
    for (const ch of ['a', 'b', 'c']) await seedBlob(c, hex(ch), false);

    // ── case 2 ──────────────────────────────────────────────────────────────────────────────────────────────────
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const capId = newHeldRefId(); const baseId = newHeldRefId(); const candId = newHeldRefId();
    await prisma.$transaction(async (tx) => {
      await tx.heldFileRef.createMany({ data: [capture(undefined, hex('a'))] }); // CAPTURE keeps the column default id
      await tx.heldFileRef.createMany({ data: [capture(capId, hex('a'))] });
      await tx.heldFileRef.createMany({ data: [
        capture(baseId, hex('a'), { kind: 'BASE', sourceTool: null, toolCallIndex: null, selector: null, declaredBy: null, descriptorVersion: null, fromRefId: capId }),
        capture(candId, hex('b'), { kind: 'CANDIDATE', sourceTool: null, toolCallIndex: null, selector: null, declaredBy: null, descriptorVersion: null,
          fromRefId: baseId, hashBasis: 'platform-candidate-text', decodeVersion: 'none' }),
      ] });
    });
    const got = await prisma.heldFileRef.findMany({ where: { scope: SCOPE }, select: { id: true, kind: true, sourceTool: true, toolCallIndex: true, selector: true, declaredBy: true, fromRefId: true }, orderBy: { kind: 'asc' } });
    const baseRow = got.find((r) => r.id === baseId); const candRow = got.find((r) => r.id === candId);
    const defaultId = got.find((r) => r.kind === 'CAPTURE' && r.id !== capId)?.id ?? '';
    record('case 2 BASE + CANDIDATE with NULL call provenance + fromRefId, through the REAL client',
      got.length === 4 && !!baseRow && baseRow.sourceTool === null && baseRow.toolCallIndex === null && baseRow.selector === null
        && baseRow.declaredBy === null && baseRow.fromRefId === capId && candRow?.fromRefId === baseId && /^c[a-z0-9]{24}$/.test(defaultId),
      `rows ${got.length}; BASE nulls ${baseRow ? [baseRow.sourceTool, baseRow.toolCallIndex, baseRow.selector, baseRow.declaredBy].every((v) => v === null) : 'missing'}; chain CAPTURE→BASE→CANDIDATE ${baseRow?.fromRefId === capId && candRow?.fromRefId === baseId}; default CAPTURE id shape ok ${/^c[a-z0-9]{24}$/.test(defaultId)}`);

    // ── case 3 ──────────────────────────────────────────────────────────────────────────────────────────────────
    const lineSql = mi13NullLineSql();
    const before = (await c.query(lineSql)).rows[0].count;
    await prisma.heldFileRef.createMany({ data: [capture(undefined, hex('a'), { toolCallIndex: 9, selector: null })] });
    const after = (await c.query(lineSql)).rows[0].count;
    record('case 3 POSITIVE CONTROL: MI-13 🔴 CAPTURE-null line (its own SQL) — 0 with BASE/CANDIDATE NULLs present, 1 after a NULL-selector CAPTURE',
      before === '0' && after === '1', `before ${before}, after ${after}`);
    await c.query(`DELETE FROM held_file_refs WHERE kind = 'CAPTURE' AND selector IS NULL`);

    // ── case 4 ──────────────────────────────────────────────────────────────────────────────────────────────────
    const VIEW = `INSERT INTO held_views (scope, "baseSha256", "r9Version", "viewVersion", "viewText", "lineCount", "rewrittenLines")
      VALUES ($1, $2, 'paichart.r9/1', 'paichart.view/1', $3, 2, $4) ON CONFLICT DO NOTHING`;
    const n1 = (await c.query(VIEW, [SCOPE, hex('a'), 'x\ny', [2]])).rowCount;
    const n2 = (await c.query(VIEW, [SCOPE, hex('a'), 'CHANGED', [1, 2]])).rowCount;
    const v = await prisma.heldView.findMany({ where: { scope: SCOPE } });
    let fkErr: string | null = null;
    try { await c.query(VIEW, [SCOPE, hex('9'), 'x', []]); } catch (e) { fkErr = (e as { code?: string }).code ?? 'unknown'; }
    record('case 4 held_views: DO NOTHING keeps the first row; int[] round-trips; a view for a missing blob ⇒ 23503',
      n1 === 1 && n2 === 0 && v.length === 1 && v[0].viewText === 'x\ny' && JSON.stringify(v[0].rewrittenLines) === '[2]' && fkErr === '23503',
      `inserts ${n1}/${n2}, rows ${v.length}, viewText kept ${v[0]?.viewText === 'x\ny'}, rewrittenLines ${JSON.stringify(v[0]?.rewrittenLines)}, missing-blob ${fkErr}`);

    // ── case 5 ──────────────────────────────────────────────────────────────────────────────────────────────────
    await seedBlob(c, hex('d'), true); // aged, no ref, one view ⇒ GC deletes it and the view cascades
    await c.query(VIEW, [SCOPE, hex('d'), 'v', []]);
    await seedBlob(c, hex('e'), true); // aged, held ONLY by a BASE ref ⇒ kept (gcBatchSql is kind-blind)
    await prisma.heldFileRef.createMany({ data: [capture(newHeldRefId(), hex('e'), { kind: 'BASE', sourceTool: null, toolCallIndex: null, selector: null, declaredBy: null, descriptorVersion: null })] });
    await prisma.$executeRaw(gcBatchSql('1 day', 1000));
    const blobs = (await c.query(`SELECT sha256 FROM held_blobs WHERE scope = $1 ORDER BY sha256`, [SCOPE])).rows.map((r) => r.sha256[0]);
    const views = (await c.query(`SELECT "baseSha256" FROM held_views WHERE scope = $1`, [SCOPE])).rows.map((r) => r.baseSha256[0]);
    record('case 5 GC: unreferenced aged blob + its view gone (cascade); aged blob held only by a BASE ref kept',
      !blobs.includes('d') && !views.includes('d') && blobs.includes('e') && views.includes('a'),
      `blobs ${JSON.stringify(blobs)}, views ${JSON.stringify(views)}`);
    await c.end();
  } finally {
    if (prisma) await prisma.$disconnect();
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await admin.end();
    console.log(`throwaway database ${db} dropped`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} cases pass`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error('❌ rehearsal crashed:', e instanceof Error ? e.message : e); process.exit(1); });
