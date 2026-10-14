#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage A WI-10 — the archive capture replay (G0, $0). Runs the SHIPPING pure capture half
 * (prepareHeldCapture: extractor + canonical + caps) and the WI-9 digest builder over STORED Harvester result.json
 * toolCalls. Read-only: run it through scripts/replay-held-capture.sh, which fetches the prod URL into memory, tunnels, forces
 * `default_transaction_read_only=on` and proves a write is refused before anything runs. Nothing is written anywhere.
 *
 * Modes:
 *   (default)                 the §11.2 archive replay report + PASS / STOP / ABSENCE verdict
 *   --predict <execId> …      the predicted set (toolCallIndex, selector, held | refusal-name) per execution
 *   --compare <execId> …      §11.3 G-CAP-live (i): the predicted set vs the table rows, symmetric diff (store-error
 *                             excused, named); and (ii) for each held prediction, the predicted baseHash vs the row's
 *                             blobSha256 (both computed from the same stored leaf). Exit 1 on any mismatch.
 *   --check-held              MI-13 🔴 11: held blobs on which R10's deep walk redacts more than the stored text carries;
 *                             prints `candidates N hits M`, or `UNMEASURED` (exit 2) when it cannot run — never a bare 0
 *
 * LIMITS (read before trusting a number):
 *   - Stored toolCalls were already R10-deep-walked at persist, so the archive replay re-applies R10 to R10 output. Its
 *     "B == stored leaf" check is R10 IDEMPOTENCE on archive leaves — NOT capture fidelity (§11.2). The live check is
 *     --predict + MI-13 🔴 12.
 *   - Archive `redactedCount > 0` is structurally ~0, and archive `placeholderPreexistingCount` reads the PERSIST-TIME
 *     redaction count — live it reads genuine pre-existing placeholders. ARCHIVE AND LIVE COLUMNS ARE NOT COMPARABLE.
 *   - A stored entry over 50 KB is an 8 KB preview (`truncated: true`): counted BY NAME as not replayable.
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-10, §11.2, §11.3, §12.2.
 */
process.env.HELD_BYTES_CAPTURE_ENABLED = 'true';      // the runner exercises the capture regardless of the shell
process.env.ARTIFACT_SECRET_REDACT_ENABLED = 'true';  // and R10 ON, as in production (EF S-4: never the operator's shell)

import { Client } from 'pg';
import { prepareHeldCapture } from '../lib/services/held-bytes-capture';
import { extractDeclaredFiles } from '../lib/agents/harness/held-bytes/extract';
import { countPlaceholders } from '../lib/agents/harness/held-bytes/canonical-text';
import { redactSecretsDeep } from '../lib/agents/harness/redact-artifact-secrets';
import { buildHeldBytesDigest } from '../lib/agents/harness/held-bytes/held-bytes-fact';
import type { HeldFileRefRow, HeldCaptureRefusalRow } from '../lib/services/held-bytes-store';

const SINCE = process.env.HELD_REPLAY_SINCE || '2026-08-01';
const MIN_POPULATION = 20;
const FILE_TOOLS = ['get_otel_config', 'get_ingress_config'];
const RIG_FORBIDDEN = new Set(['raw-digest-present', 'path-invalid', 'descriptor-mismatch', 'not-declared', 'escaped-secret-residual']);
const silent = { warn: () => undefined, info: () => undefined };

const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

async function connect(): Promise<Client> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set (run through scripts/replay-held-capture.sh)');
  const c = new Client({ connectionString: url });
  c.on('error', () => undefined);
  await c.connect();
  try { await c.query('CREATE TEMP TABLE _held_ro_probe(x int)'); throw new Error('ABORT: a write was NOT refused — the session is not read-only'); }
  catch (e) {
    if (String((e as Error).message).startsWith('ABORT')) throw e;
    // ONLY "read-only transaction" (SQLSTATE 25006) counts as refused — any other error is not proof (code review N3).
    if ((e as { code?: string }).code !== '25006') throw new Error(`ABORT: the write probe failed with ${(e as { code?: string }).code ?? '?'}, not 25006 — read-only not proven`);
  }
  return c;
}

interface Row { id: string; taskId: string; povId: string | null; status: string; supersededById: string | null; content: string }

async function loadHarvesters(c: Client, ids?: string[]): Promise<Row[]> {
  const where = ids
    ? `e.id = ANY($1)`
    : `a."createdAt" >= $1 AND (a.content LIKE '%get_otel_config%' OR a.content LIKE '%get_ingress_config%')`;
  const r = await c.query(
    `SELECT e.id, e."taskId", t.pov_id AS "povId", e.status, e."supersededById", a.content
       FROM agent_artifacts a JOIN agent_executions e ON e.id = a."executionId" JOIN tasks t ON t.id = e."taskId"
      WHERE a.name = 'result.json' AND a.content LIKE '{%' AND ${where}
      ORDER BY a."createdAt"`, [ids ?? SINCE]);
  return r.rows as Row[];
}

function toolCallsOf(content: string): unknown[] | null {
  try { const j = JSON.parse(content); return Array.isArray(j.toolCalls) ? j.toolCalls : null; } catch { return null; }
}

/** The plan's files and refusals as the rows the I/O half would build (no DB). */
function planRows(plan: NonNullable<ReturnType<typeof prepareHeldCapture>>): { refs: HeldFileRefRow[]; refusals: HeldCaptureRefusalRow[] } {
  return {
    refs: plan.files.map((f) => ({
      scope: plan.scope ?? '', blobSha256: f.sha256, executionId: 'replay', kind: 'CAPTURE', legTaskId: null, rootTaskId: null,
      serviceId: f.serviceId, serviceName: f.serviceName, sourceTool: f.sourceTool, toolCallIndex: f.toolCallIndex, selector: f.selector,
      target: f.target, path: f.path, declaredBy: f.declaredBy, descriptorVersion: f.descriptorVersion, hashBasis: f.hashBasis,
      decodeVersion: f.decodeVersion, redactorVersion: f.redactorVersion, redactedCount: f.redactedCount, lineCount: f.lineCount,
      newline: null, bom: null, finalNewline: null, serviceReportsComplete: null, derivedRawByteLength: null,
      placeholderPreexistingCount: f.placeholderPreexistingCount,
    })),
    refusals: plan.refusals.map((r) => ({ ...r, executionId: 'replay' })),
  };
}

async function archive(c: Client): Promise<number> {
  const rows = await loadHarvesters(c);
  const byTool: Record<string, { calls: number; files: number; held: number }> = {};
  const refusalsByName: Record<string, number> = {};
  const truncated: string[] = [];
  const superseded: string[] = [];
  const unexpected: string[] = [];
  const idempotenceBreaks: string[] = [];
  const lineMapBroken: string[] = [];
  const rigForbidden: string[] = [];
  const sizes: number[] = []; const lines: number[] = []; const digestSizes: number[] = []; const cpu: number[] = [];
  let withDeclared = 0; let undeclaredFailed = 0; let rowsOmitted = 0; let truncatedFields = 0;
  const blobsPerScope = new Map<string, Set<string>>(); let refsTotal = 0;
  for (const row of rows) {
    const tc = toolCallsOf(row.content);
    if (!tc) continue;
    if (row.supersededById) superseded.push(row.id);
    tc.forEach((r, i) => {
      const rr = r as Record<string, unknown>;
      const res = rr.result as Record<string, unknown> | undefined;
      const tool = (rr.arguments as Record<string, unknown> | undefined)?.tool;
      if (rr.tool === 'services' && FILE_TOOLS.includes(String(tool)) && res && res.truncated === true) truncated.push(`${row.id}#${i}`);
    });
    const t0 = process.hrtime.bigint();
    let plan: ReturnType<typeof prepareHeldCapture>;
    try {
      plan = prepareHeldCapture({ toolCallResults: tc, task: { id: row.taskId, povId: row.povId }, logger: { warn: (o) => { unexpected.push(`${row.id}:${JSON.stringify(o)}`); }, info: () => undefined } });
    } catch (e) { unexpected.push(`${row.id}:threw:${(e as Error).name}`); continue; }
    cpu.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (!plan) continue;
    const ex = extractDeclaredFiles(tc);
    undeclaredFailed += ex.stats.undeclaredFailed;
    if (plan.stats.declaredCalls > 0) withDeclared++;
    for (const f of ex.files) {
      const t = (byTool[f.sourceTool] ??= { calls: 0, files: 0, held: 0 });
      t.files++;
    }
    const callsSeen = new Set(ex.files.map((f) => `${f.sourceTool}#${f.toolCallIndex}`));
    for (const k of callsSeen) byTool[k.split('#')[0]].calls++;
    for (const f of plan.files) {
      byTool[f.sourceTool].held++;
      sizes.push(f.storedByteLength); lines.push(f.lineCount); refsTotal++;
      const set = blobsPerScope.get(plan.scope ?? '') ?? new Set<string>(); set.add(f.sha256); blobsPerScope.set(plan.scope ?? '', set);
      const C = ex.files.find((x) => x.toolCallIndex === f.toolCallIndex && x.selector === f.selector)?.text;
      if (f.redactedCount === 0 && C !== undefined && f.content !== C) idempotenceBreaks.push(`${row.id}#${f.toolCallIndex}${f.selector}`);
    }
    for (const r of plan.refusals) {
      refusalsByName[r.refusal] = (refusalsByName[r.refusal] ?? 0) + 1;
      if (r.refusal === 'line-map-broken') lineMapBroken.push(row.id);
      if (RIG_FORBIDDEN.has(r.refusal)) rigForbidden.push(`${row.id}:${r.refusal}#${r.toolCallIndex}`);
    }
    const { refs, refusals } = planRows(plan);
    const d = buildHeldBytesDigest({ refs, refusals, storedBytes: plan.files.reduce((a, f) => a + f.storedByteLength, 0) });
    const ds = JSON.stringify(d).length; digestSizes.push(ds);
    if (d.rowsOmitted) rowsOmitted++;
    if (d.rows.some((x) => x.truncatedFields)) truncatedFields++;
  }
  const files = Object.values(byTool).reduce((a, t) => a + t.files, 0);
  const held = Object.values(byTool).reduce((a, t) => a + t.held, 0);
  const distinct = [...blobsPerScope.values()].reduce((a, s) => a + s.size, 0);
  console.log('══ ARCHIVE CAPTURE REPLAY (shipping prepareHeldCapture over stored result.json) ══');
  console.log(`window: result.json created >= ${SINCE}; candidate executions (EVERY role whose result.json names a file tool): ${rows.length}; with a declared call: ${withDeclared}`);
  console.log('⚠️  ARCHIVE AND LIVE COLUMNS ARE NOT COMPARABLE (stored leaves are already R10 output).');
  for (const [tool, t] of Object.entries(byTool)) console.log(`  ${tool}: successful declared calls ${t.calls}, files ${t.files}, would-hold ${t.held}`);
  console.log(`  refusals by name: ${JSON.stringify(refusalsByName)}`);
  console.log(`  failed calls to a pair absent from the table (context, never a STOP): ${undeclaredFailed}`);
  console.log(`  truncated stored entries (not replayable, by name): ${truncated.length}${truncated.length ? ' ' + truncated.join(', ') : ''}`);
  console.log(`  superseded executions (counted separately): ${superseded.length}`);
  console.log(`  dedup: ${refsTotal} refs over ${distinct} distinct (scope, sha256)`);
  console.log(`  storedByteLength p50/p95/max: ${pct(sizes, 50)}/${pct(sizes, 95)}/${Math.max(0, ...sizes)}; lineCount p50/p95/max: ${pct(lines, 50)}/${pct(lines, 95)}/${Math.max(0, ...lines)}`);
  console.log(`  digest size p50/p95/max: ${pct(digestSizes, 50)}/${pct(digestSizes, 95)}/${Math.max(0, ...digestSizes)}; rowsOmitted ${rowsOmitted}; truncatedFields ${truncatedFields}`);
  console.log(`  pure-half CPU ms p50/p95/max (CPU only — no SELECT, no upsert): ${pct(cpu, 50).toFixed(1)}/${pct(cpu, 95).toFixed(1)}/${Math.max(0, ...cpu).toFixed(1)}`);
  const stops: string[] = [];
  if (unexpected.length) stops.push(`pure half warned/threw on ${unexpected.length}: ${unexpected.slice(0, 5).join(' | ')}`);
  if (lineMapBroken.length) stops.push(`line-map-broken on ${lineMapBroken.join(', ')}`);
  if (idempotenceBreaks.length) stops.push(`R10 idempotence (archive) broken on ${idempotenceBreaks.slice(0, 5).join(', ')}`);
  if (rigForbidden.length) stops.push(`rig shapes that must not occur: ${rigForbidden.slice(0, 5).join(', ')}`);
  if (pct(digestSizes, 95) > 600) stops.push(`digest p95 ${pct(digestSizes, 95)} > 600`);
  if (Math.max(0, ...digestSizes) > 1024) stops.push(`a digest over 1,024 (builder defect)`);
  if (pct(cpu, 95) > 500) stops.push(`pure-half CPU p95 ${pct(cpu, 95).toFixed(1)} ms > 500`);
  if (stops.length) { console.log('\n⛔ STOP:'); for (const s of stops) console.log('  - ' + s); return 1; }
  if (withDeclared < MIN_POPULATION) { console.log(`\n⚪ ABSENCE: ${withDeclared} executions with a declared call < minimum ${MIN_POPULATION}. Not a PASS.`); return 3; }
  const rate = files ? held / files : 0;
  console.log(`\nwould-hold ${held}/${files} files = ${(rate * 100).toFixed(1)}% (PASS needs ≥ 95%; read each remaining file by hand)`);
  if (rate < 0.95) { console.log('⛔ STOP: would-hold below 95% of files'); return 1; }
  console.log('✅ PASS (archive replay)');
  return 0;
}

function predictedSet(row: Row): { lines: string[]; hashes: Map<string, string> } {
  const tc = toolCallsOf(row.content);
  const plan = tc ? prepareHeldCapture({ toolCallResults: tc, task: { id: row.taskId, povId: row.povId }, logger: silent }) : null;
  const hashes = new Map<string, string>();
  if (!plan) return { lines: [], hashes };
  for (const f of plan.files) hashes.set(`${f.toolCallIndex}\t${f.selector}`, f.sha256);
  return {
    lines: [
      ...plan.files.map((f) => `${f.toolCallIndex}\t${f.selector}\theld`),
      ...plan.refusals.map((r) => `${r.toolCallIndex}\t${r.selector ?? ''}\t${r.refusal}`),
    ].sort(),
    hashes,
  };
}

async function predict(c: Client, ids: string[]): Promise<number> {
  for (const row of await loadHarvesters(c, ids)) {
    console.log(`# ${row.id}`);
    for (const line of predictedSet(row).lines) console.log(line);
  }
  return 0;
}

/** §11.3 (i) set equality and (ii) bytes, against the live tables. The prediction runs the SHIPPING extractor over the
 *  STORED leaf, so (ii) compares two hashes of the same text — any difference is a capture defect. */
async function compare(c: Client, ids: string[]): Promise<number> {
  let bad = 0;
  for (const row of await loadHarvesters(c, ids)) {
    const pred = predictedSet(row);
    const refs = (await c.query(`SELECT "toolCallIndex" i, selector s, "blobSha256" h FROM held_file_refs WHERE "executionId" = $1`, [row.id])).rows;
    const refu = (await c.query(`SELECT "toolCallIndex" i, coalesce(selector, '') s, refusal r FROM held_capture_refusals WHERE "executionId" = $1`, [row.id])).rows;
    const actual = [...refs.map((x) => `${x.i}\t${x.s}\theld`), ...refu.map((x) => `${x.i}\t${x.s}\t${x.r}`)].sort();
    const missing = pred.lines.filter((l) => !actual.includes(l));
    const extra = actual.filter((l) => !pred.lines.includes(l) && !l.endsWith('\tstore-error'));
    const excused = actual.filter((l) => l.endsWith('\tstore-error'));
    const hashBad = refs.filter((x) => pred.hashes.has(`${x.i}\t${x.s}`) && pred.hashes.get(`${x.i}\t${x.s}`) !== x.h);
    const ok = missing.length === 0 && extra.length === 0 && hashBad.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? '✅' : '❌'} ${row.id}: predicted ${pred.lines.length}, rows ${actual.length}, missing ${missing.length}, extra ${extra.length}, store-error excused ${excused.length}, hash mismatches ${hashBad.length}`);
    for (const l of [...missing.map((m) => '  missing ' + m), ...extra.map((x) => '  extra ' + x)]) console.log(l);
  }
  return bad > 0 ? 1 : 0;
}

async function checkHeld(c: Client): Promise<number> {
  const r = await c.query(`SELECT scope, sha256, content FROM held_blobs
                            WHERE octet_length(content) > 40 AND position('\\x5c6e'::bytea IN content) > 0`);
  let hits = 0;
  for (const row of r.rows as Array<{ content: Buffer }>) {
    const B = row.content.toString('utf8');
    const deep = (redactSecretsDeep({ l: B }).value as { l: unknown }).l;
    if (countPlaceholders(typeof deep === 'string' ? deep : B) > countPlaceholders(B)) hits++;
  }
  console.log(`candidates ${r.rowCount} hits ${hits}`);
  return hits > 0 ? 1 : 0;
}

(async () => {
  const args = process.argv.slice(2);
  let c: Client | null = null;
  try {
    c = await connect();
    let rc: number;
    if (args[0] === '--predict') rc = await predict(c, args.slice(1));
    else if (args[0] === '--compare') rc = await compare(c, args.slice(1));
    else if (args[0] === '--check-held') rc = await checkHeld(c);
    else rc = await archive(c);
    await c.end();
    process.exit(rc);
  } catch (e) {
    if (args[0] === '--check-held') { console.log('UNMEASURED'); process.exit(2); }
    console.error('❌ replay failed:', e instanceof Error ? e.message : e);
    if (c) await c.end().catch(() => undefined);
    process.exit(2);
  }
})();
