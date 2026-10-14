#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage A WI-5 / WI-7 — the held-bytes store and the GC sweep, on a recording mock (the BC-#2 method).
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-5, WI-7, §8.
 *
 * The real-database proofs (the three-session GC race with v1's SQL as the positive control, and one row of every refusal
 * name through the real Prisma client) are WI-11's rehearsal script, run against the local DB — not CI.
 * CI-safe: no DB, no Prisma connection.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import {
  upsertHeldBlobs,
  gcHeldBlobs,
  gcBatchSql,
  validateHeldRow,
  guardInTxString,
  errorFacts,
  type HeldFileRefRow,
  type HeldCaptureRefusalRow,
} from '../lib/services/held-bytes-store';

console.log('🗄️  held-bytes store + GC (WI-5, WI-7)\n');

let passed = 0;
let failed = 0;
const pending: Array<{ d: string; fn: () => Promise<void> | void }> = [];
const test = (d: string, fn: () => Promise<void> | void) => { pending.push({ d, fn }); };
function eq(actual: unknown, expected: unknown, what = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(cond: unknown, what: string) { if (!cond) throw new Error(what); }

/** Recording db: collects every raw statement's SQL text and values. */
function recDb(behaviour: (sql: Prisma.Sql, i: number) => number | Promise<number> = () => 1) {
  const statements: Prisma.Sql[] = [];
  return {
    statements,
    db: { $executeRaw: async (q: Prisma.Sql) => { statements.push(q); return behaviour(q, statements.length - 1); } },
  };
}
const flat = (q: Prisma.Sql) => q.sql.replace(/\s+/g, ' ').trim();
const prismaRawError = (sqlstate: string) => Object.assign(
  new Error('Raw query failed. Code: `' + sqlstate + '`. Message: `ERROR: …`'),
  { name: 'PrismaClientKnownRequestError', code: 'P2010',
    meta: { code: sqlstate, message: 'update or delete on table "held_blobs" violates foreign key constraint DETAIL: Key (scope, sha256)=(cmpovX, ' + 'f'.repeat(64) + ') is still referenced' } },
);

const SHA = (c: string) => c.repeat(64);

// ── upsert ────────────────────────────────────────────────────────────────────────────────────────────────────────
test('upsert: ONE statement for N blobs; ON CONFLICT … DO UPDATE SET lastReferencedAt = now(); never DO NOTHING', async () => {
  const { db, statements } = recDb();
  const r = await upsertHeldBlobs(db, [
    { scope: 'p1', sha256: SHA('b'), content: 'x\n', storedByteLength: 2 },
    { scope: 'p1', sha256: SHA('a'), content: 'y\n', storedByteLength: 2 },
  ]);
  ok(r.ok, 'ok');
  eq(statements.length, 1, 'statements ');
  const sql = flat(statements[0]);
  ok(/^INSERT INTO held_blobs \(scope, sha256, content, "storedByteLength", "createdAt", "lastReferencedAt"\) VALUES/.test(sql), sql);
  ok(/ON CONFLICT \(scope, sha256\) DO UPDATE SET "lastReferencedAt" = now\(\)$/.test(sql), sql);
  ok(!/DO NOTHING/.test(sql), 'DO NOTHING');
  ok(/now\(\), now\(\)\)/.test(sql), 'createdAt and lastReferencedAt from the DB clock');
});
test('upsert: VALUES sorted by (scope, sha256) for a shuffled input (one lock order)', async () => {
  const { db, statements } = recDb();
  await upsertHeldBlobs(db, [
    { scope: 'p2', sha256: SHA('a'), content: '1', storedByteLength: 1 },
    { scope: 'p1', sha256: SHA('c'), content: '2', storedByteLength: 1 },
    { scope: 'p1', sha256: SHA('a'), content: '3', storedByteLength: 1 },
  ]);
  const v = statements[0].values;
  // 4 bound values per row: scope, sha256, content, storedByteLength
  eq([v[0], v[1], v[4], v[5], v[8], v[9]], ['p1', SHA('a'), 'p1', SHA('c'), 'p2', SHA('a')], 'sorted keys ');
});
test('upsert: a duplicated input key yields ONE VALUES row (DB-5: SQLSTATE 21000 otherwise)', async () => {
  const { db, statements } = recDb();
  const r = await upsertHeldBlobs(db, [
    { scope: 'p1', sha256: SHA('a'), content: 'x', storedByteLength: 1 },
    { scope: 'p1', sha256: SHA('a'), content: 'x', storedByteLength: 1 },
  ]);
  eq(statements[0].values.length, 4, 'one row of 4 values ');
  ok(r.ok && r.written.size === 1, 'written set');
});
test('upsert: content bound as an exact UTF-8 Buffer (bytea), never a string', async () => {
  const { db, statements } = recDb();
  await upsertHeldBlobs(db, [{ scope: 'p1', sha256: SHA('a'), content: 'x…\n', storedByteLength: 5 }]);
  const content = statements[0].values[2];
  ok(Buffer.isBuffer(content) && (content as Buffer).equals(Buffer.from('x…\n', 'utf8')), 'Buffer bind');
});
test('upsert: the bound storedByteLength is computed from the bytes, never the caller\'s claim (code review DB note)', async () => {
  const { db, statements } = recDb();
  await upsertHeldBlobs(db, [{ scope: 'p1', sha256: SHA('a'), content: 'x\u2026', storedByteLength: 999 }]);
  eq(statements[0].values[3], Buffer.byteLength('x\u2026', 'utf8'));
});
test('upsert: a failing statement RESOLVES with content-free error facts (never throws, never the DETAIL)', async () => {
  const { db } = recDb(() => { throw prismaRawError('21000'); });
  const r = await upsertHeldBlobs(db, [{ scope: 'p1', sha256: SHA('a'), content: 'x', storedByteLength: 1 }]);
  ok(!r.ok, 'not ok');
  if (r.ok) return;
  eq(r.fault, { name: 'PrismaClientKnownRequestError', code: 'P2010', metaCode: '21000' });
});
test('upsert: zero blobs ⇒ zero statements', async () => {
  const { db, statements } = recDb();
  await upsertHeldBlobs(db, []);
  eq(statements.length, 0);
});

// ── GC SQL shape (DB-1, arch B1) ──────────────────────────────────────────────────────────────────────────────────
const GC = flat(gcBatchSql('1 day', 1000));
test('GC shape 1: the grace predicate is ON THE DELETE TARGET (outer WHERE), re-checked by EvalPlanQual', () => {
  const outer = GC.slice(0, GC.indexOf('IN ('));
  ok(/DELETE FROM held_blobs t WHERE t\."lastReferencedAt" < now\(\) - \?::interval AND \(t\.scope, t\.sha256\) /.test(outer), outer);
});
test('GC shape 2: candidates are locked ORDER BY … LIMIT … FOR UPDATE SKIP LOCKED', () => {
  ok(/ORDER BY b\.scope, b\.sha256 LIMIT \? FOR UPDATE SKIP LOCKED\)$/.test(GC), GC);
});
test('GC shape 3: the anti-join is SCOPED (scope AND blobSha256), never a bare hash', () => {
  ok(/NOT EXISTS \(SELECT 1 FROM held_file_refs r WHERE r\.scope = b\.scope AND r\."blobSha256" = b\.sha256\)/.test(GC), GC);
});
test('GC: loops batches until one deletes fewer than LIMIT; no $transaction (autocommit per batch)', async () => {
  const counts = [1000, 1000, 7];
  const { db, statements } = recDb((_q, i) => counts[i]);
  const r = await gcHeldBlobs(db, {});
  eq([r.deleted, r.batches, statements.length], [2007, 3, 3]);
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'held-bytes-store.ts'), 'utf8');
  const gcBody = src.slice(src.indexOf('export async function gcHeldBlobs'));
  ok(!/\$transaction/.test(gcBody), 'no $transaction in gcHeldBlobs');
});
for (const [sqlstate, stop] of [['23503', 'fk-race'], ['40P01', 'deadlock'], ['57014', 'timeout'], ['XX000', 'other']] as const) {
  test(`GC error class ${sqlstate} on batch 2 ⇒ resolves { deleted: batch 1, stoppedOn: '${stop}' } — classified on meta.code`, async () => {
    const { db } = recDb((_q, i) => { if (i === 1) throw prismaRawError(sqlstate); return 1000; });
    const r = await gcHeldBlobs(db, {});
    eq([r.deleted, r.stoppedOn, r.fault?.metaCode], [1000, stop, sqlstate]);
    ok(!/DETAIL|Key \(/.test(JSON.stringify(r)), 'no DETAIL / key values in the result');
  });
}
test('errorFacts: name / code / metaCode only — never message or meta.message', () => {
  const f = errorFacts(prismaRawError('23503'));
  eq(Object.keys(f).sort(), ['code', 'metaCode', 'name']);
});

// ── guards and validators ────────────────────────────────────────────────────────────────────────────────────────
test('guardInTxString: refuses U+0000, a lone surrogate, over-length, non-strings; strips nothing', () => {
  eq([guardInTxString('ok'), guardInTxString('a\u0000b'), guardInTxString('a\ud800'), guardInTxString('x'.repeat(10), 5), guardInTxString(3)],
    ['ok', null, null, null, null]);
});
const REF: HeldFileRefRow = {
  scope: 'p1', blobSha256: SHA('a'), executionId: 'e1', kind: 'CAPTURE', legTaskId: null, rootTaskId: null,
  serviceId: 's1', serviceName: 'observability-readonly', sourceTool: 'get_otel_config', toolCallIndex: 2,
  selector: '/structuredContent/yaml', target: 'obs-otelcol', path: '/etc/otelcol/config.yaml', declaredBy: 'platform-default',
  descriptorVersion: 1, hashBasis: 'legacy-decoded-text', decodeVersion: 'paichart.text/1', redactorVersion: 'paichart.r10/2',
  redactedCount: 0, lineCount: 3, newline: null, bom: null, finalNewline: null, serviceReportsComplete: null,
  derivedRawByteLength: null, placeholderPreexistingCount: 0,
};
const REFUSAL: HeldCaptureRefusalRow = {
  executionId: 'e1', scope: 'p1', serviceId: null, serviceName: 'observability-readonly', identitySource: 'gateway-meta',
  sourceTool: 'get_ingress_config', toolCallIndex: 1, selector: null, target: null, path: null, refusal: 'is-error',
  detail: { level: 'envelope' }, declaredBy: 'platform-default', descriptorVersion: 1,
};
test('validateHeldRow(ref): a good row passes; each REQUIRED field undefined / null / a number / NUL-bearing ⇒ rejected', () => {
  ok(validateHeldRow('ref', REF), 'good ref');
  const required = ['scope', 'blobSha256', 'executionId', 'kind', 'serviceId', 'serviceName', 'sourceTool', 'selector', 'target',
    'path', 'declaredBy', 'hashBasis', 'decodeVersion', 'redactorVersion'] as const;
  for (const k of required) {
    for (const bad of [undefined, null, 7, 'a\u0000b']) {
      ok(!validateHeldRow('ref', { ...REF, [k]: bad } as HeldFileRefRow), `${k}=${JSON.stringify(bad)} accepted`);
    }
  }
  for (const k of ['toolCallIndex', 'redactedCount', 'lineCount', 'placeholderPreexistingCount'] as const) {
    for (const bad of [undefined, null, -1, 2 ** 31, 1.5, '3']) ok(!validateHeldRow('ref', { ...REF, [k]: bad } as unknown as HeldFileRefRow), `${k}=${bad} accepted`);
  }
});
test('validateHeldRow(refusal): nullable identity accepted (OA-20); detail OMITTED ok, null / {} / nested / NUL rejected', () => {
  ok(validateHeldRow('refusal', REFUSAL), 'good refusal');
  ok(validateHeldRow('refusal', { ...REFUSAL, serviceId: null, serviceName: null }), 'nullable identity');
  const { detail: _d, ...noDetail } = REFUSAL;
  ok(validateHeldRow('refusal', noDetail as HeldCaptureRefusalRow), 'detail omitted');
  for (const bad of [null, {}, { level: { x: 1 } }, { level: 'a\u0000' }, { level: -1 }]) {
    ok(!validateHeldRow('refusal', { ...REFUSAL, detail: bad } as unknown as HeldCaptureRefusalRow), `detail ${JSON.stringify(bad)} accepted`);
  }
  for (const k of ['executionId', 'identitySource', 'sourceTool', 'refusal', 'declaredBy'] as const) {
    ok(!validateHeldRow('refusal', { ...REFUSAL, [k]: undefined } as unknown as HeldCaptureRefusalRow), `${k} undefined accepted`);
  }
});

// ── static scans over lib/ and app/ ──────────────────────────────────────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p, out); }
    else if (/\.(ts|tsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
const ROOT = path.join(__dirname, '..');
const SOURCES = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'app'))]
  .map((f) => ({ f: path.relative(ROOT, f), src: fs.readFileSync(f, 'utf8') }));
const STORE = 'lib/services/held-bytes-store.ts';
test('static: no held-blob READ or write anywhere in lib/ or app/ outside the store module (no bare-hash lookup surface)', () => {
  const hits = SOURCES.filter(({ f, src }) => f !== STORE
    && /(heldBlob\s*\.\s*(find|create|update|upsert|delete)|held_blobs)/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  eq(hits.map((h) => h.f), [], 'files ');
});
test('static: every raw statement against held_blobs in the store names scope (no hash-only WHERE / ON CONFLICT)', () => {
  const src = fs.readFileSync(path.join(ROOT, STORE), 'utf8');
  const stmts = src.match(/Prisma\.sql`[\s\S]*?`/g) || [];
  const onBlobs = stmts.filter((s) => /held_blobs/.test(s));
  ok(onBlobs.length >= 2, `found ${onBlobs.length}`);
  for (const s of onBlobs) ok(/\bscope\b/.test(s), `statement without scope: ${s.slice(0, 80)}`);
});
test('static (sec-ops N-4): any heldFileRef query whose where names blobSha256 also names scope', () => {
  const bad: string[] = [];
  for (const { f, src } of SOURCES) {
    const re = /heldFileRef\s*\.\s*find(?:First|Many|Unique)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const w = src.slice(m.index, m.index + 600);
      if (/blobSha256/.test(w) && !/\bscope\b/.test(w)) bad.push(f);
    }
  }
  eq(bad, []);
});
test('static (WI-7): gcHeldBlobs is called ONLY from the resource manager midnight chain', () => {
  const callers = SOURCES.filter(({ f, src }) => f !== STORE && /gcHeldBlobs\(/.test(src)).map((x) => x.f);
  eq(callers, ['lib/services/mcp/resourceManager.ts'], 'callers ');
  const rm = SOURCES.find((x) => x.f === 'lib/services/mcp/resourceManager.ts')!.src;
  const chain = rm.slice(rm.indexOf('const scheduleMidnightArtifactCleanup'), rm.indexOf('scheduleMidnightArtifactCleanup();\n'));
  ok(/cleanupArtifactsByTask\(\)[\s\S]*gcHeldBlobs\(prisma/.test(chain), 'GC runs after cleanupArtifactsByTask inside the midnight chain');
  ok(/gcHeldBlobs[\s\S]*finally \{\s*scheduleMidnightArtifactCleanup\(\)/.test(chain), 'the re-arm stays in finally after the GC');
});
test('static (MI-13 🔴 12, EF NV-1): the inventory decodes the JSON Pointer ~1 BEFORE ~0 and anchors it at the envelope root', () => {
  const inv = fs.readFileSync(path.join(ROOT, 'scripts', 'report-mechanism-inventory.sh'), 'utf8');
  ok(/replace\(replace\(seg, '~1', '\/'\), '~0', '~'\)/.test(inv), 'decode order ~1 then ~0 (RFC 6901)');
  ok(inv.includes("ARRAY['result','content','0','data','result']"), 'anchored at result → content → 0 → data → result');
  ok(/🔴 11[^\n]*UNMEASURED/.test(inv), '🔴 11 prints UNMEASURED when the runner fails, never 0 (EF NV-2)');
});
test('static (SF-3): every logger call in the store and capture modules carries no err object, message or meta.message', () => {
  for (const f of ['lib/services/held-bytes-store.ts', 'lib/services/held-bytes-capture.ts']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue; // the capture helper lands in a later commit
    const code = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const calls = code.match(/\b(logger|log)\.(warn|info|error|debug)\(\{[^}]*\}/g) || [];
    for (const c of calls) {
      ok(!/\berr\b|\berror\b|\.message|meta\.message|\.meta\b/.test(c.replace(/errorFacts\(err\)/g, '')), `${f}: ${c.slice(0, 120)}`);
    }
  }
});

(async () => {
  for (const { d, fn } of pending) {
    try { await fn(); console.log(`✅ ${d}`); passed++; } catch (e) {
      console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   Error: ${e.message}`); failed++;
    }
  }
  console.log(`\n📊 Total Tests:  ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Total Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('✅ All tests passed!');
})();
