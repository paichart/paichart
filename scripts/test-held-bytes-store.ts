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
  newHeldRefId,
  upsertHeldView,
  readHeldView,
  touchHeldBases,
  insertHeldPackageRows,
  intArrayLiteral,
  heldBlobKey,
  HELD_VIEW_VERSION,
  CANDIDATE_HASH_BASIS,
  type HeldPackageRefRow,
  type HeldFileRefRow,
  type HeldCaptureRefusalRow,
} from '../lib/services/held-bytes-store';
import { ValidCUID, validateCUIDFormat } from '../lib/validation/id-validation';

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
test('GC shape 4 (Stage B P1-1): gcBatchSql is KIND-BLIND — any ref of any kind keeps its blob', () => {
  ok(!/\bkind\b/i.test(GC), 'gcBatchSql must not name kind (a BASE / CANDIDATE ref must hold its blob like a CAPTURE)');
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
  descriptorVersion: 1, declarationSha256: null, eligibility: null, grantPovId: null, hashBasis: 'legacy-decoded-text', decodeVersion: 'paichart.text/1', redactorVersion: 'paichart.r10/2',
  redactedCount: 0, lineCount: 3, newline: null, bom: null, finalNewline: null, serviceReportsComplete: null,
  derivedRawByteLength: null, placeholderPreexistingCount: 0, sourceRevision: null,
};
const REFUSAL: HeldCaptureRefusalRow = {
  executionId: 'e1', scope: 'p1', serviceId: null, serviceName: 'observability-readonly', identitySource: 'gateway-meta',
  sourceTool: 'get_ingress_config', toolCallIndex: 1, selector: null, target: null, path: null, refusal: 'is-error',
  detail: { level: 'envelope' }, declaredBy: 'platform-default', descriptorVersion: 1, declarationSha256: null, eligibility: null, grantPovId: null,
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
test('K-3 validateHeldRow(ref): sourceRevision null or exactly 40 lowercase hex; undefined / upper-case / short / 64-hex / a ref name refused', () => {
  ok(validateHeldRow('ref', { ...REF, sourceRevision: null }), 'null (no revision source)');
  ok(validateHeldRow('ref', { ...REF, sourceRevision: '0ea432e751cc622ffab91d7a90386c66cadf8733' }), '40 lowercase hex');
  for (const bad of [undefined, '0EA432E751CC622FFAB91D7A90386C66CADF8733', '0ea432e', 'f'.repeat(64), 'main', 'refs/heads/main', 3]) {
    ok(!validateHeldRow('ref', { ...REF, sourceRevision: bad } as never), `refused: ${String(bad)}`);
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

// ── ids (Stage B P1-1, DB SF-1) ─────────────────────────────────────────────────────────────────────────────────
test('newHeldRefId: 10,000 ids all match ^c[a-z0-9]{24}$, pass both platform CUID validators, and never repeat', () => {
  const seen = new Set<string>();
  const chars = new Set<string>();
  for (let i = 0; i < 10000; i++) {
    const id = newHeldRefId();
    ok(/^c[a-z0-9]{24}$/.test(id), `shape: ${id}`);
    ok(validateCUIDFormat(id, 'held ref id').valid, `validateCUIDFormat: ${id}`);
    ok(ValidCUID.safeParse(id).success, `ValidCUID (zod): ${id}`);
    ok(!seen.has(id), `repeat: ${id}`);
    seen.add(id);
    for (const ch of id.slice(1)) chars.add(ch);
  }
  eq(chars.size, 36, 'every symbol of [a-z0-9] drawn (alphabet not truncated) ');
});
test('static (P1-1): no @paralleldrive/cuid2 anywhere in lib/ or app/ (its ids fail ^c[a-z0-9]{24}$)', () => {
  // Tests run after every top-level const is initialised, so SOURCES (declared below) is in scope here.
  eq(SOURCES.filter(({ src }) => /(from\s+|require\(\s*)['"]@paralleldrive\/cuid2['"]/.test(src)).map((x) => x.f), [], 'importers ');
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
      // The call's own `where` object, brace-balanced (V-7, 2026-10-15: a fixed 600-char window read `blobSha256` from the
      // `.map()` AFTER a scope-free where-by-executionId and flagged it; scope must now be in the SAME where, not merely nearby).
      const w = whereObjectOf(src, m.index + m[0].length);
      if (w === null) { bad.push(`${f} (unparsed where)`); continue; }
      if (/blobSha256/.test(w) && !/\bscope\b/.test(w)) bad.push(f);
    }
  }
  eq(bad, []);
  // The extractor itself, both directions (so the pin cannot pass by reading nothing).
  eq(whereObjectOf("findMany({ where: { executionId: x, kind: 'CAPTURE' }, select: S }); x.map((r) => r.blobSha256)", 10), "{ executionId: x, kind: 'CAPTURE' }");
  eq(whereObjectOf('findFirst({ where: { blobSha256: h, a: { b: 1 } } })', 10), '{ blobSha256: h, a: { b: 1 } }');
  eq(whereObjectOf('findUnique({ select: S })', 11), '');
});
/** The `where: { … }` object of the call whose argument list opens at `from` (just past its `(`); '' when it has none; null when
 *  the argument list cannot be balanced. */
function whereObjectOf(src: string, from: number): string | null {
  let depth = 1; let end = -1;
  for (let i = from; i < src.length; i++) { const ch = src[i]; if (ch === '(') depth++; else if (ch === ')' && --depth === 0) { end = i; break; } }
  if (end < 0) return null;
  const args = src.slice(from, end);
  const k = args.search(/\bwhere\s*:\s*\{/);
  if (k < 0) return '';
  const open = args.indexOf('{', k);
  let d = 0;
  for (let i = open; i < args.length; i++) { if (args[i] === '{') d++; else if (args[i] === '}' && --d === 0) return args.slice(open, i + 1); }
  return null;
}
test('static (WI-7): gcHeldBlobs is called ONLY from the resource manager midnight chain', () => {
  const callers = SOURCES.filter(({ f, src }) => f !== STORE && /gcHeldBlobs\(/.test(src)).map((x) => x.f);
  eq(callers, ['lib/services/mcp/resourceManager.ts'], 'callers ');
  const rm = SOURCES.find((x) => x.f === 'lib/services/mcp/resourceManager.ts')!.src;
  const chain = rm.slice(rm.indexOf('const scheduleMidnightArtifactCleanup'), rm.indexOf('scheduleMidnightArtifactCleanup();\n'));
  ok(/cleanupArtifactsByTask\(\)[\s\S]*gcHeldBlobs\(prisma/.test(chain), 'GC runs after cleanupArtifactsByTask inside the midnight chain');
  ok(/gcHeldBlobs[\s\S]*finally \{\s*scheduleMidnightArtifactCleanup\(\)/.test(chain), 'the re-arm stays in finally after the GC');
});
test('static (held-k8s 1g, EF B-2): every MI-13 literal table equals its TypeScript source (a domain joins in BOTH or CI fails)', () => {
  const inv = fs.readFileSync(path.join(ROOT, 'scripts', 'report-mechanism-inventory.sh'), 'utf8');
  const { HELD_JOIN_VERSIONS, GIT_FILE_SOURCE_PROTOCOLS } = require('../lib/agents/harness/held-bytes/variant');
  const { PLATFORM_DEFAULT_DESCRIPTORS } = require('../lib/agents/harness/held-bytes/descriptors');
  const { GIT_FILE_SOURCE_PINS } = require('../lib/mcp/server/config/git-file-source-pin');
  const { GIT_LISTING_ELIDED_TEXT } = require('../lib/agents/harness/held-bytes/git-status-elision');
  const block = (start: string, end: string) => { const i = inv.indexOf(start); ok(i >= 0, `missing: ${start}`); return inv.slice(i, inv.indexOf(end, i)); };
  // _heldjoin ≡ HELD_JOIN_VERSIONS (name + version as an int[] literal)
  const hj = block('CREATE TEMP VIEW _heldjoin', ') v(name, minver)');
  const sqlJoin = [...hj.matchAll(/\('([a-z0-9-]+)', '\{(\d+),(\d+),(\d+)\}'::int\[\]\)/g)].map((m) => `${m[1]}@${m[2]}.${m[3]}.${m[4]}`).sort();
  eq(sqlJoin, Object.entries(HELD_JOIN_VERSIONS).map(([k, v]) => `${k}@${v}`).sort(), '_heldjoin vs HELD_JOIN_VERSIONS ');
  // 🔴 9/10 `declared` ≡ every descriptor entry with files (the quoteFidelity FILE_LANE_KEYS set)
  const dc = block('declared AS (SELECT * FROM (VALUES', ') d(svc, tool)');
  const sqlDeclared = [...dc.matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => `${m[1]}.${m[2]}`).sort();
  const tsDeclared = PLATFORM_DEFAULT_DESCRIPTORS.filter((d: any) => (d.files?.length ?? 0) > 0 && !d.notAFile).map((d: any) => `${d.service}.${d.tool}`).sort();
  eq(sqlDeclared, tsDeclared, 'declared pairs vs the descriptor table ');
  // _gitsrcleg ≡ GIT_FILE_SOURCE_PROTOCOLS
  const gs = block('CREATE TEMP VIEW _gitsrcleg', ') v(name)');
  eq([...gs.matchAll(/\('([a-z0-9-]+)'\)/g)].map((m) => m[1]).sort(), [...GIT_FILE_SOURCE_PROTOCOLS].sort(), '_gitsrcleg vs GIT_FILE_SOURCE_PROTOCOLS ');
  // the SQL pin re-derivation ≡ GIT_FILE_SOURCE_PINS (one Git source today; a second needs its own SQL arm)
  const pins = Object.entries(GIT_FILE_SOURCE_PINS) as Array<[string, any]>;
  eq(pins.length, 1, 'one Git file source — MI-13 re-derives exactly one pin ');
  const [svc, pin] = pins[0];
  const gp = block("g AS (SELECT *, regexp_replace(coalesce(sa->>'path'", "AS violates FROM g)");
  ok(inv.includes(`FROM gcalls WHERE svc = '${svc}'`), 'pin arm keyed on the pinned service name');
  ok(gp.includes(`lower(sa->>'owner') = '${pin.owner}'`) && gp.includes(`lower(sa->>'repo') = '${pin.repo}'`), 'owner/repo literals');
  ok(gp.includes(`IN (${pin.refs.map((r: string) => `'${r}'`).join(', ')})`), 'ref literals');
  // the R4 directory exemption names the G-1 listing placeholder exactly
  ok(inv.includes(`= '${GIT_LISTING_ELIDED_TEXT}'`), 'the 🔴 9/10 directory exemption carries the G-1 listing placeholder verbatim');
});
test('static (MI-13 🔴 12, EF NV-1): the inventory decodes the JSON Pointer ~1 BEFORE ~0 and anchors it at the envelope root', () => {
  const inv = fs.readFileSync(path.join(ROOT, 'scripts', 'report-mechanism-inventory.sh'), 'utf8');
  ok(/replace\(replace\(seg, '~1', '\/'\), '~0', '~'\)/.test(inv), 'decode order ~1 then ~0 (RFC 6901)');
  ok(inv.includes("ARRAY['result','content','0','data','result']"), 'anchored at result → content → 0 → data → result');
  ok(/🔴 11[^\n]*UNMEASURED/.test(inv), '🔴 11 prints UNMEASURED when the runner fails, never 0 (EF NV-2)');
});
test('static (Stage B P1-1): MI-13 per-line kind disposition — CAPTURE-scoped lines carry kind = CAPTURE, kind-blind lines do not', () => {
  const inv = fs.readFileSync(path.join(ROOT, 'scripts', 'report-mechanism-inventory.sh'), 'utf8');
  const line = (marker: string) => {
    const i = inv.indexOf(marker); ok(i >= 0, `marker not found: ${marker}`);
    return inv.slice(i, inv.indexOf('\n', i));
  };
  // kind = 'CAPTURE'
  for (const m of ["'⚪ captures by tool: '", "'⚪ captures by serviceId", "'🔴 6 duplicate refs", 'WITH he AS (', "'· refs whose source call carries rewritten:true"]) {
    const l = m.startsWith("'· refs whose") ? inv.slice(inv.indexOf(m), inv.indexOf('\n', inv.indexOf('\n', inv.indexOf(m)) + 1)) : line(m);
    ok(/kind = 'CAPTURE'/.test(l), `CAPTURE-scoped: ${m}`);
  }
  ok(/\(SELECT count\(\*\) \|\| ' \/ ' \|\| count\(DISTINCT[^\n]*r\.kind = 'CAPTURE'\)/.test(inv), 'dedup scoped to CAPTURE');
  const r12 = inv.slice(inv.indexOf('-- 🔴 12:'), inv.indexOf('leaves AS ('));
  eq((r12.match(/kind = 'CAPTURE'/g) || []).length, 2, '🔴 12 floor + refs both CAPTURE-scoped ');
  // split by kind
  ok(/'· refs with redactedCount > 0[^\n]*r\.kind = k\.kind[^\n]*VALUES \('CAPTURE'\), \('BASE'\), \('CANDIDATE'\)/.test(inv), 'redactedCount line split by kind (every kind prints, DB-CR-3)');
  // kind-blind by design
  for (const m of ["'⚪ held-bytes live since", "'🔴 2 a ref whose execution", "'🔴 3 a blob", "'🔴 4 a blob", "'🔴 8 a ref with redactorVersion", "'· unreferenced blobs"]) {
    ok(!/\bkind\b/.test(line(m)), `kind-blind: ${m}`);
  }
  const inner = inv.slice(inv.indexOf("SELECT '🔴 9 a SUCCESS"), inv.indexOf("UNION ALL SELECT '⚪ 9/10 control"));
  ok(!/\bkind\b/.test(inner), '🔴 9/10 inner NOT EXISTS kind-blind (any held row proves the execution was held)');
  ok(inv.includes("'⚪ refs by kind: ' || k.kind"), '⚪ refs by kind (every kind prints, DB-CR-3)');
  ok(/'🔴 a CAPTURE ref with a NULL in the 4 relaxed columns[^\n]*kind = 'CAPTURE' AND \("sourceTool" IS NULL OR "toolCallIndex" IS NULL OR selector IS NULL OR "declaredBy" IS NULL\)/.test(inv), '🔴 CAPTURE null in relaxed columns');
  const rp = fs.readFileSync(path.join(ROOT, 'scripts', 'replay-held-capture.ts'), 'utf8');
  ok(/FROM held_file_refs WHERE "executionId" = \$1 AND kind = 'CAPTURE'/.test(rp), 'replay --compare reads CAPTURE refs only');
  const chk = rp.slice(rp.indexOf('async function checkHeld'), rp.indexOf('(async () =>'));
  ok(!/\bkind\b/.test(chk), '--check-held is kind-blind (it covers CANDIDATE blobs)');
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

// ── Stage B V-1 (2026-10-15): views, the ordered BASE touch, package refs, the kind-aware validator ─────────────────────
// Real-database proofs (lock waits against the GC, ROLLBACK TO SAVEPOINT under Prisma error states, the MI-13 NULL line's own
// SQL) are scripts/rehearse-held-store-b.ts — local, not CI.

/** Recording db for the V-1 functions: $executeRaw + $queryRaw, each answered by `answer`. */
function recDb2(answer: (q: Prisma.Sql, kind: 'exec' | 'query') => unknown) {
  const statements: Array<{ kind: 'exec' | 'query'; q: Prisma.Sql }> = [];
  const run = async (kind: 'exec' | 'query', q: Prisma.Sql) => { statements.push({ kind, q }); const a = answer(q, kind); if (a instanceof Error) throw a; return a; };
  return { statements, db: { $executeRaw: (q: Prisma.Sql) => run('exec', q) as Promise<number>, $queryRaw: <T>(q: Prisma.Sql) => run('query', q) as Promise<T> } };
}
const VKEY = { scope: 'cmpovX', baseSha256: 'a'.repeat(64), r9Version: 'paichart.r9/1', viewVersion: HELD_VIEW_VERSION };
const STORED = { ...VKEY, viewText: 'stored', lineCount: 1, rewrittenLines: [] as number[] };

test('V-1 intArrayLiteral: never NULL — [] is {} (DB-CR-2); refuses non-ints', () => {
  eq(intArrayLiteral([]), '{}'); eq(intArrayLiteral([1, 20]), '{1,20}');
  for (const bad of [[-1], [1.5], [2 ** 31]]) { let threw = false; try { intArrayLiteral(bad); } catch { threw = true; } ok(threw, `accepted ${bad}`); }
});

test('V-1 upsertHeldView: ONE write statement (touch CTE → INSERT … SELECT FROM t, DO NOTHING, never DO UPDATE), then the STORED row is returned', async () => {
  const r = recDb2((q, k) => (k === 'exec' ? 0 : [STORED]));
  const out = await upsertHeldView(r.db as never, { ...VKEY, viewText: 'mine', lineCount: 1, rewrittenLines: [] });
  eq(r.statements.map((s) => s.kind), ['exec', 'query']);
  const w = flat(r.statements[0].q);
  ok(/^WITH t AS \( UPDATE held_blobs SET "lastReferencedAt" = now\(\)/.test(w), `touch CTE first: ${w.slice(0, 80)}`);
  ok(/INSERT INTO held_views .* SELECT t\.scope, t\.sha256, .* FROM t ON CONFLICT DO NOTHING$/.test(w), 'insert selects from the touch');
  ok(!/DO UPDATE/.test(w), 'never DO UPDATE');
  ok(r.statements[0].q.values.includes('{}'), 'rewrittenLines bound as the {} literal');
  ok(out.ok && out.view.viewText === 'stored' && out.inserted === false, 'the STORED row, not the caller\'s');
});

test('V-1 upsertHeldView: blob gone (no stored row) ⇒ view-unavailable; a 23503 ⇒ view-unavailable with content-free facts; never throws', async () => {
  const gone = await upsertHeldView(recDb2((q, k) => (k === 'exec' ? 0 : [])).db as never, { ...STORED });
  ok(!gone.ok && gone.state === 'view-unavailable' && !('fault' in gone && gone.fault), 'zero rows ⇒ view-unavailable');
  const fk = await upsertHeldView(recDb2(() => prismaRawError('23503')).db as never, { ...STORED });
  ok(!fk.ok && fk.fault?.metaCode === '23503' && !JSON.stringify(fk).includes('cmpovX'), 'fault is code-only');
  const bad = await upsertHeldView(recDb2(() => 1).db as never, { ...STORED, viewText: 'a\u0000b' });
  ok(!bad.ok && bad.fault?.name === 'invalid-view-row', 'an unbindable view is refused before any statement');
});

test('V-1 readHeldView reads by the FULL primary key', async () => {
  const r = recDb2(() => [STORED]);
  await readHeldView(r.db as never, VKEY);
  const w = flat(r.statements[0].q);
  for (const col of ['scope', '"baseSha256"', '"r9Version"', '"viewVersion"']) ok(w.includes(`${col} = ?`), `keyed on ${col}`);
});

test('V-1 touchHeldBases: one ordered statement (ORDER BY scope, sha256 FOR UPDATE — not SKIP LOCKED), de-duplicated input, per-file set difference', async () => {
  const keys = [{ scope: 'cmpovX', sha256: 'b'.repeat(64) }, { scope: 'cmpovX', sha256: 'a'.repeat(64) }, { scope: 'cmpovX', sha256: 'a'.repeat(64) }];
  const r = recDb2(() => [{ scope: 'cmpovX', sha256: 'a'.repeat(64) }]);
  const out = await touchHeldBases(r.db as never, keys);
  eq(r.statements.length, 1);
  const w = flat(r.statements[0].q);
  ok(/ORDER BY b\.scope, b\.sha256 FOR UPDATE\)/.test(w) && !/SKIP LOCKED/.test(w) && /RETURNING t\.scope, t\.sha256$/.test(w), w);
  eq(r.statements[0].q.values.length, 4, 'two distinct keys bound');
  ok(out.ok && out.touched.has(heldBlobKey('cmpovX', 'a'.repeat(64))) && [...out.missing].join() === heldBlobKey('cmpovX', 'b'.repeat(64)), 'missing = requested − returned');
  const none = await touchHeldBases(recDb2(() => { throw new Error('x'); }).db as never, []);
  ok(none.ok && none.touched.size === 0, 'empty input issues no statement');
  const err = await touchHeldBases(recDb2(() => prismaRawError('40P01')).db as never, keys);
  ok(!err.ok && err.fault.metaCode === '40P01', 'never throws');
});

const pkg = (kind: 'BASE' | 'CANDIDATE', over: Partial<HeldPackageRefRow> = {}): HeldPackageRefRow => ({
  id: newHeldRefId(), scope: 'cmpovX', blobSha256: 'a'.repeat(64), executionId: 'cmexecX', kind, legTaskId: 'cmlegX', rootTaskId: null,
  serviceId: 's', serviceName: 'observability-readonly', sourceTool: null, toolCallIndex: null, selector: null, target: 't', path: '/p',
  declaredBy: null, descriptorVersion: null, declarationSha256: null, eligibility: null, grantPovId: null, hashBasis: kind === 'BASE' ? 'legacy-decoded-text' : CANDIDATE_HASH_BASIS,
  decodeVersion: kind === 'BASE' ? 'paichart.text/1' : 'none', redactorVersion: 'paichart.r10/3', redactedCount: 0, lineCount: 3,
  newline: null, bom: null, finalNewline: null, serviceReportsComplete: null, derivedRawByteLength: null, placeholderPreexistingCount: 0,
  sourceRevision: null,
  fromRefId: newHeldRefId(), ...over,
});

test('V-1 validateHeldRow is kind-aware (§3.2): BASE / CANDIDATE / CANDIDATE create pass; each column-contract breach fails', () => {
  ok(validateHeldRow('ref', pkg('BASE')), 'BASE'); ok(validateHeldRow('ref', pkg('CANDIDATE')), 'CANDIDATE');
  ok(validateHeldRow('ref', pkg('CANDIDATE', { fromRefId: null })), 'CANDIDATE create (fromRefId NULL)');
  const breaches: Array<[string, HeldPackageRefRow]> = [
    ['BASE with call provenance', pkg('BASE', { sourceTool: 'get_otel_config' as never })],
    ['BASE with a toolCallIndex', pkg('BASE', { toolCallIndex: 0 as never })],
    ['BASE with a descriptorVersion', pkg('BASE', { descriptorVersion: 1 as never })],
    ['BASE without fromRefId', pkg('BASE', { fromRefId: null })],
    ['BASE with a non-cuid id', pkg('BASE', { id: 'not-an-id' })],
    ['CANDIDATE with a decode hashBasis', pkg('CANDIDATE', { hashBasis: 'legacy-decoded-text' })],
    ['CANDIDATE with a decodeVersion', pkg('CANDIDATE', { decodeVersion: 'paichart.text/1' })],
    ['planted-invalid CANDIDATE (NUL in path)', pkg('CANDIDATE', { path: 'a\u0000b' })],
    ['CANDIDATE with a bad fromRefId', pkg('CANDIDATE', { fromRefId: 'x' })],
  ];
  for (const [what, row] of breaches) ok(!validateHeldRow('ref', row), `accepted: ${what}`);
});

// DB-P2-4: a package batch AND a capture batch on one Author (two independent savepoints, order, each rolling back alone) are
// pinned where the persist harness lives — test-terminal-persist-shape.ts HELD I/J/K; this file pins the package helper alone.
test('V-1 insertHeldPackageRows: exactly one SAVEPOINT held_package; error ⇒ ROLLBACK TO it, rolled-back, warn content-free; ok ⇒ RELEASE, committed', async () => {
  const mk = (fail: boolean) => {
    const sql: string[] = []; const warns: Array<Record<string, unknown>> = [];
    const tx = {
      $executeRaw: async (strings: TemplateStringsArray) => { sql.push(strings.join('?')); return 0; },
      heldFileRef: { createMany: async () => { if (fail) throw prismaRawError('23503'); return { count: 2 }; } },
    };
    return { sql, warns, tx, logger: { warn: (o: Record<string, unknown>) => { warns.push(o); } } };
  };
  const bad = mk(true);
  eq(await insertHeldPackageRows(bad.tx as never, [pkg('BASE'), pkg('CANDIDATE')], bad.logger, 'cmexecX'), 'rolled-back');
  eq(bad.sql, ['SAVEPOINT held_package', 'ROLLBACK TO SAVEPOINT held_package']);
  ok(!JSON.stringify(bad.warns).includes('cmpovX') && bad.warns[0].metaCode === '23503', 'warn carries code facts only');
  const good = mk(false);
  eq(await insertHeldPackageRows(good.tx as never, [pkg('BASE')], good.logger, 'cmexecX'), 'committed');
  eq(good.sql, ['SAVEPOINT held_package', 'RELEASE SAVEPOINT held_package']);
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
