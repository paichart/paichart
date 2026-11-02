#!/usr/bin/env ts-node
/**
 * held-k8s K-3 (2026-10-18) — scratch-DB proof of the `held_file_refs.sourceRevision` ROLLBACK RULE. LOCAL ONLY, not CI.
 *
 * DB review SF-4 (cline_docs/reviews/held-k8s-2026-10-18/REVIEW-database-manager.md): the column landed in its own schema commit
 * (44c51e63f) and must NEVER be reverted. This proves why, on the exact model text:
 *   1. push the CURRENT schema.prisma into a throwaway DB; a CAPTURE ref with a 40-hex sourceRevision inserts through Prisma;
 *   2. push a copy of schema.prisma with the sourceRevision field REMOVED, WITHOUT --accept-data-loss ⇒ the push REFUSES
 *      (non-zero exit) and the column + value survive — i.e. a "code revert" that drags the schema with it blocks the deploy;
 *   3. control: on a fresh throwaway DB whose sourceRevision is all NULL, the same reverted push DROPS the column silently —
 *      the other wrong outcome the rule exists to prevent.
 * Refuses unless DATABASE_URL's host is localhost / 127.0.0.1. Creates and drops its own databases; touches nothing else.
 * Run: npx ts-node -r tsconfig-paths/register scripts/rehearse-held-source-revision.ts
 */
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from 'pg';

const ROOT = path.join(__dirname, '..');
const SCOPE = 'cmpovREHEARSALK3';
const EXEC = 'cmexecREHEARSALK3';
const REV = '0ea432e751cc622ffab91d7a90386c66cadf8733';
const results: Array<{ name: string; pass: boolean; note: string }> = [];
const record = (name: string, pass: boolean, note: string) => { results.push({ name, pass, note }); console.log(`${pass ? '✅' : '❌'} ${name} — ${note}`); };
const quiet = (c: Client): Client => { c.on('error', () => undefined); return c; };

function revertedSchemaFile(): string {
  const src = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const lines = src.split('\n');
  const out = lines.filter((l) => !/^\s*sourceRevision\s+String\?/.test(l));
  if (out.length !== lines.length - 1) throw new Error('expected exactly one sourceRevision field line in schema.prisma');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k3-schema-'));
  const f = path.join(dir, 'schema.prisma');
  fs.writeFileSync(f, out.join('\n'));
  return f;
}

async function seed(url: string, withRevision: boolean): Promise<void> {
  const c = quiet(new Client({ connectionString: url })); await c.connect();
  await c.query('SET session_replication_role = replica');
  await c.query(`INSERT INTO agent_executions (id, "taskId", status, config, context, logs, "createdAt", "updatedAt")
    VALUES ('${EXEC}', 'cmtaskREHEARSALK3', 'SUCCESS', '{}', '{}', '{}', now(), now())`);
  await c.query('SET session_replication_role = origin');
  await c.query(`INSERT INTO held_blobs (scope, sha256, content, "storedByteLength", "createdAt", "lastReferencedAt") VALUES ($1, $2, $3, 1, now(), now())`,
    [SCOPE, 'a'.repeat(64), Buffer.from('x')]);
  await c.query(`INSERT INTO held_file_refs (id, scope, "blobSha256", "executionId", kind, "serviceId", "serviceName", "sourceTool", "toolCallIndex",
      selector, target, path, "declaredBy", "descriptorVersion", "hashBasis", "decodeVersion", "redactorVersion", "redactedCount", "lineCount",
      "placeholderPreexistingCount", "sourceRevision")
    VALUES ('cmrefREHEARSALK3aaaaaaaaa', $1, $2, $3, 'CAPTURE', 'github-service', 'github-service', 'get_file_contents', 0, '/content/1/resource/text',
      'github:paichart:paichart-lab-configs', '/k8s/sample-workloads.yaml', 'platform-default', 1, 'legacy-decoded-text', 'paichart.text/1',
      'paichart.r10/3', 0, 1, 0, $4)`, [SCOPE, 'a'.repeat(64), EXEC, withRevision ? REV : null]);
  await c.end();
}

async function columnState(url: string): Promise<{ exists: boolean; value: string | null }> {
  const c = quiet(new Client({ connectionString: url })); await c.connect();
  const col = await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'held_file_refs' AND column_name = 'sourceRevision'`);
  const exists = (col.rowCount ?? 0) > 0;
  const value = exists ? ((await c.query(`SELECT "sourceRevision" AS v FROM held_file_refs WHERE scope = $1`, [SCOPE])).rows[0]?.v ?? null) : null;
  await c.end();
  return { exists, value };
}

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL not set');
  const u = new URL(base.replace(/^postgres(ql)?:/, 'http:'));
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error(`refusing: DATABASE_URL host is ${u.hostname}, not localhost`);
  const adminUrl = base.replace(/\/[^/?]+(\?.*)?$/, '/postgres$1').replace(/\?.*$/, '');
  const reverted = revertedSchemaFile();
  const admin = quiet(new Client({ connectionString: adminUrl })); await admin.connect();
  const dbs: string[] = [];
  try {
    for (const [label, withRevision] of [['value present', true], ['all NULL (control)', false]] as const) {
      const db = `phb_k3_${withRevision ? 'v' : 'n'}_${process.pid}`; dbs.push(db);
      await admin.query(`CREATE DATABASE ${db}`);
      const url = base.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
      const pgUrl = url.replace(/\?.*$/, '');
      execSync('npx prisma db push --skip-generate', { cwd: ROOT, env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
      await seed(pgUrl, withRevision);
      const before = await columnState(pgUrl);
      const push = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--schema', reverted], { cwd: ROOT, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
      const after = await columnState(pgUrl);
      const said = `${push.stdout ?? ''}${push.stderr ?? ''}`;
      if (withRevision) {
        record(`case ${label}: a reverted-schema push REFUSES and the value survives`,
          before.exists && before.value === REV && push.status !== 0 && after.exists && after.value === REV && /data loss|lose|accept-data-loss/i.test(said),
          `exit ${push.status}; column ${after.exists ? 'present' : 'GONE'}; value ${after.value === REV ? 'intact' : String(after.value)}`);
      } else {
        record(`case ${label}: a reverted-schema push DROPS the all-NULL column silently (the other wrong outcome)`,
          before.exists && push.status === 0 && !after.exists,
          `exit ${push.status}; column ${after.exists ? 'present' : 'dropped'}`);
      }
    }
  } finally {
    for (const db of dbs) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => undefined);
    await admin.end();
    fs.rmSync(path.dirname(reverted), { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${failed ? '❌' : '✅'} rehearse-held-source-revision: ${results.length - failed}/${results.length}`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
