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
 *                             blobSha256 (both computed from the same stored leaf); (iii) HELD-CAPTURE-COMPARE-ELIGIBILITY
 *                             (2026-10-25): declaredBy + declarationSha256 compared; eligibility predicted `platform` on an
 *                             ownerless row and compared, membership-checked on an owned row (not reconstructable — not
 *                             persisted); `unverifiable (eligibility)` / `unverifiable (echo)` instead of a false ❌ — the
 *                             logic is the pure scripts/held-capture-compare.ts. Exit 1 on any mismatch.
 *   --compare-all             --compare over EVERY execution that wrote a CAPTURE ref or a capture refusal (the step-3 gate form;
 *                             was a hand-built id list)
 *   --device-sources          held-network step 3 batch 2b: the SHIPPING Device sources grammar over every network leg (states/problems)
 *   --device-lane             … the device-read lane + deviceSourceReads + gitDeviceComparison over every stored network Harvester
 *   HELD_REPLAY_DEVICE_LANE=off  predict WITHOUT the device lane (what the pre-lane tree predicted) — the "nothing else moved" compare
 *   HELD_REPLAY_ASSUME_SNAPSHOT=live  push 2: predict a leg with no first-execution snapshot as if snapshotted from its CURRENT
 *                             declaration (a measurement knob; production holds nothing there — `device-sources-snapshot-absent`)
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
import { tableFromDeclarations, type HeldDescriptorTable } from '../lib/services/held-descriptor-table';
import { hydrateToolCallGatewayMeta } from '../lib/services/mcp/gateway-meta';
import { extractDeclaredFiles, withDeviceEvidenceOnly } from '../lib/agents/harness/held-bytes/extract';
import { countPlaceholders } from '../lib/agents/harness/held-bytes/canonical-text';
import { redactSecretsDeep } from '../lib/agents/harness/redact-artifact-secrets';
import { buildHeldBytesDigest } from '../lib/agents/harness/held-bytes/held-bytes-fact';
import type { HeldFileRefRow, HeldCaptureRefusalRow } from '../lib/services/held-bytes-store';
import { resolveOwningLegProtocol, type OwningLegResolution } from '../lib/agents/harness/held-bytes/variant';
import { readLegDeviceSources, governingDeviceSources, type LegDeviceSourcesResolution } from '../lib/agents/harness/device-sources-read';
import { deviceReadForce } from '../lib/agents/harness/held-edit-carrier';
import { buildDeviceReadScope, type DeviceReadScope } from '../lib/agents/harness/held-bytes/device-read-scope';
import { computeDeviceSourceReads, computeGitDeviceComparison } from '../lib/agents/harness/device-source-facts';
import { resolveLegDeviceSources, contractDeviceSourcesValue } from '../lib/agents/harness/device-sources';
import { isDeviceSourceLeg } from '../lib/agents/harness/held-bytes/variant';
import { compareCapture, type PredictedRow, type StoredRow } from './held-capture-compare';

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

interface Row { id: string; taskId: string; povId: string | null; status: string; supersededById: string | null; content: string;
  taskType: string | null; taskTitle: string | null; taskMetadata: unknown }

/** 2026-10-22 (post-deploy regression, TF-TEXT-BATCH-NEXT / TF-PATH-RULE-GAPS): the replay never passed `gitFileSourceLeg`, so
 *  every Git-file-source capture (k8s, terraform) was predicted as NOTHING at every tree — only obs captures were ever compared.
 *  Production decides it from the owning leg (`execution-core.ts`: kind leg|self ∧ gitFileSource). The replay now calls the SAME
 *  resolver through a read-only adapter over this client (no copy of the ladder), memoised per task. */
const legMemo = new Map<string, OwningLegResolution>();
async function legOf(c: Client, row: Row): Promise<OwningLegResolution> {
  const hit = legMemo.get(row.taskId);
  if (hit !== undefined) return hit;
  const db = {
    task: { findUnique: async (a: { where: { id: string } }) =>
      (await c.query('SELECT stage_id AS "stageId", title, metadata FROM tasks WHERE id = $1', [a.where.id])).rows[0] ?? null },
    stage: { findUnique: async (a: { where: { id: string } }) =>
      (await c.query('SELECT metadata FROM stages WHERE id = $1', [a.where.id])).rows[0] ?? null },
  };
  const r = await resolveOwningLegProtocol(db, { id: row.taskId, type: row.taskType, title: row.taskTitle, metadata: row.taskMetadata });
  legMemo.set(row.taskId, r);
  return r;
}
async function gitFileSourceLegOf(c: Client, row: Row): Promise<boolean> {
  const r = await legOf(c, row);
  return (r.kind === 'leg' || r.kind === 'self') && r.gitFileSource === true;
}

/** held-network step 3 batch 2b (P3): the leg's declared Device sources, through the SHIPPING reader over a read-only adapter
 *  (production: execution-core reads it once per persist on a Device-sources leg). Undefined off such a leg — and when
 *  HELD_REPLAY_DEVICE_LANE=off, which predicts exactly what the pre-lane tree predicted (the "nothing else moved" half of a compare). */
const DEVICE_LANE_OFF = process.env.HELD_REPLAY_DEVICE_LANE === 'off';
/** push 2 (O-2): production governs from the leg's first-execution SNAPSHOT, so every leg first executed before push 2 reads
 *  `snapshot-absent` and holds nothing — the default prediction (the production truth). HELD_REPLAY_ASSUME_SNAPSHOT=live predicts
 *  instead as if each such leg had been snapshotted from its CURRENT declaration — a measurement knob only (what the lane's other
 *  rules would hold on stored legs), never what production does; every line it touches says `(assumed snapshot)`. */
const ASSUME_SNAPSHOT = process.env.HELD_REPLAY_ASSUME_SNAPSHOT === 'live';
const devSrcMemo = new Map<string, LegDeviceSourcesResolution | null>();
async function deviceSourcesOf(c: Client, row: Row): Promise<LegDeviceSourcesResolution | null> {
  if (DEVICE_LANE_OFF) return null;
  if (devSrcMemo.has(row.taskId)) return devSrcMemo.get(row.taskId)!;
  const leg = await legOf(c, row);
  const ro = { $queryRaw: async (q: { text: string; values: unknown[] }) => (await c.query(q.text, q.values)).rows } as never;
  let v = (leg.kind === 'leg' || leg.kind === 'self') && leg.deviceSource === true ? await readLegDeviceSources(ro, leg) : null;
  if (v && v.state === 'snapshot-absent' && ASSUME_SNAPSHOT && (leg.kind === 'leg' || leg.kind === 'self')) {
    const r = (await c.query(`SELECT description, ("inputContext" -> 'interfaceContract') AS contract FROM tasks WHERE id = $1`, [leg.legId])).rows[0];
    if (r) v = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(r.contract), taskBody: r.description });
  }
  devSrcMemo.set(row.taskId, v);
  return v;
}
async function deviceScopeOf(c: Client, row: Row, tc: unknown[] | null): Promise<DeviceReadScope | undefined> {
  const s = await deviceSourcesOf(c, row);
  return s && tc ? buildDeviceReadScope(s, tc) : undefined;
}

async function loadHarvesters(c: Client, ids?: string[]): Promise<Row[]> {
  const where = ids
    ? `e.id = ANY($1)`
    : `a."createdAt" >= $1 AND (a.content LIKE '%get_otel_config%' OR a.content LIKE '%get_ingress_config%')`;
  const r = await c.query(
    `SELECT e.id, e."taskId", t.pov_id AS "povId", e.status, e."supersededById", a.content,
            t.type AS "taskType", t.title AS "taskTitle", t.metadata AS "taskMetadata"
       FROM agent_artifacts a JOIN agent_executions e ON e.id = a."executionId" JOIN tasks t ON t.id = e."taskId"
      WHERE a.name = 'result.json' AND a.content LIKE '{%' AND ${where}
      ORDER BY a."createdAt"`, [ids ?? SINCE]);
  return r.rows as Row[];
}

/** The stored toolCalls, with each record's gateway meta re-attached from the `toolCallGatewayMeta` tail key by index
 *  (Stage B P1-4) — so a failed call addressed by registry id yields the SAME refusal row replayed as it did live. */
function toolCallsOf(content: string): unknown[] | null {
  try {
    const j = JSON.parse(content);
    if (!Array.isArray(j.toolCalls)) return null;
    hydrateToolCallGatewayMeta(j.toolCalls, j.toolCallGatewayMeta);
    return j.toolCalls;
  } catch { return null; }
}

/** The plan's files and refusals as the rows the I/O half would build (no DB). */
function planRows(plan: NonNullable<ReturnType<typeof prepareHeldCapture>>): { refs: HeldFileRefRow[]; refusals: HeldCaptureRefusalRow[] } {
  return {
    refs: plan.files.map((f) => ({
      scope: plan.scope ?? '', blobSha256: f.sha256, executionId: 'replay', kind: 'CAPTURE', legTaskId: null, rootTaskId: null,
      serviceId: f.serviceId, serviceName: f.serviceName, sourceTool: f.sourceTool, toolCallIndex: f.toolCallIndex, selector: f.selector,
      target: f.target, path: f.path, declaredBy: f.declaredBy, descriptorVersion: f.descriptorVersion, declarationSha256: f.declarationSha256 ?? null, eligibility: f.eligibility ?? null, grantPovId: f.grantPovId ?? null, hashBasis: f.hashBasis,
      decodeVersion: f.decodeVersion, redactorVersion: f.redactorVersion, redactedCount: f.redactedCount, lineCount: f.lineCount,
      newline: null, bom: null, finalNewline: null, serviceReportsComplete: null, derivedRawByteLength: null,
      placeholderPreexistingCount: f.placeholderPreexistingCount,
      sourceRevision: f.sourceRevision, // held-k8s 1a: required on the row type (a forgotten builder must fail tsc)
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
    const gitLeg = await gitFileSourceLegOf(c, row);
    const storedTable = await storedHeldTable(c, row.id); // WI-B10 — BEFORE t0 (I/O is not the pure half's CPU)
    const devScope = await deviceScopeOf(c, row, tc); // held-network step 3 batch 2b — BEFORE t0, as above
    const t0 = process.hrtime.bigint();
    let plan: ReturnType<typeof prepareHeldCapture>;
    try {
      plan = prepareHeldCapture({ toolCallResults: tc, task: { id: row.taskId, povId: row.povId }, gitFileSourceLeg: gitLeg, heldTable: storedTable, live: false, ...(devScope ? { deviceRead: devScope } : {}), logger: { warn: (o) => { unexpected.push(`${row.id}:${JSON.stringify(o)}`); }, info: () => undefined } });
    } catch (e) { unexpected.push(`${row.id}:threw:${(e as Error).name}`); continue; }
    cpu.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (!plan) continue;
    const ex = extractDeclaredFiles(tc, storedTable?.table ?? undefined, { gitFileSourceLeg: gitLeg, ...(devScope ? { deviceRead: devScope } : {}), unavailableShas: storedTable?.unavailableShas, invalidShas: storedTable?.invalidShas });
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

/** WI-B10 (design §9.1 E, §10 A-8): the SAME table a live capture used, rebuilt from what the execution STORED — the
 *  (serviceId, declarationSha256) pairs on its CAPTURE refs and refusals + the immutable held_declarations snapshots. Stored
 *  records carry no call-time stamp, so the replay is LEGACY (live: false): registrant entries match by serviceId. Null when the
 *  execution holds nothing under a registrant declaration, or the database predates WI-B10 (column absent). */
let declColumnPresent: boolean | null = null;
async function storedHeldTable(c: Client, executionId: string): Promise<HeldDescriptorTable | null> {
  if (declColumnPresent === null) {
    declColumnPresent = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'held_file_refs' AND column_name = 'declarationSha256'`)).rowCount === 1;
  }
  if (!declColumnPresent) return null;
  const pairs = (await c.query(`SELECT DISTINCT "serviceId" AS "serviceId", "declarationSha256" AS sha FROM (
      SELECT "serviceId", "declarationSha256" FROM held_file_refs WHERE "executionId" = $1 AND kind = 'CAPTURE' AND "declarationSha256" IS NOT NULL
      UNION ALL SELECT "serviceId", "declarationSha256" FROM held_capture_refusals WHERE "executionId" = $1 AND "declarationSha256" IS NOT NULL AND "serviceId" IS NOT NULL) x`, [executionId])).rows as Array<{ serviceId: string; sha: string }>;
  if (pairs.length === 0) return null;
  const snaps = (await c.query(`SELECT sha256, "heldFiles" AS "heldFiles" FROM held_declarations WHERE sha256 = ANY($1)`, [[...new Set(pairs.map((p) => p.sha))]])).rows as Array<{ sha256: string; heldFiles: unknown }>;
  return tableFromDeclarations(pairs, snaps);
}

function predictedSet(row: Row, gitFileSourceLeg: boolean, heldTable: HeldDescriptorTable | null = null, deviceRead?: DeviceReadScope): { lines: string[]; hashes: Map<string, string>; rows: PredictedRow[] } {
  const tc = toolCallsOf(row.content);
  const plan = tc ? prepareHeldCapture({ toolCallResults: tc, task: { id: row.taskId, povId: row.povId }, gitFileSourceLeg, logger: silent, heldTable, live: false, ...(deviceRead ? { deviceRead } : {}) }) : null;
  const hashes = new Map<string, string>();
  if (!plan) return { lines: [], hashes, rows: [] };
  for (const f of plan.files) hashes.set(`${f.toolCallIndex}\t${f.selector}`, f.sha256);
  const rows: PredictedRow[] = [
    ...plan.files.map((f) => ({ i: f.toolCallIndex, s: f.selector ?? '', outcome: 'held', hash: f.sha256, serviceId: f.serviceId,
      declaredBy: f.declaredBy ?? null, declarationSha256: f.declarationSha256 ?? null })),
    ...plan.refusals.map((r) => ({ i: r.toolCallIndex, s: r.selector ?? '', outcome: r.refusal, hash: null, serviceId: r.serviceId,
      declaredBy: r.declaredBy ?? null, declarationSha256: r.declarationSha256 ?? null })),
  ];
  return {
    lines: [
      ...plan.files.map((f) => `${f.toolCallIndex}\t${f.selector}\theld`),
      ...plan.refusals.map((r) => `${r.toolCallIndex}\t${r.selector ?? ''}\t${r.refusal}`),
    ].sort(),
    hashes,
    rows,
  };
}

async function predict(c: Client, ids: string[]): Promise<number> {
  for (const row of await loadHarvesters(c, ids)) {
    console.log(`# ${row.id}`);
    for (const line of predictedSet(row, await gitFileSourceLegOf(c, row), await storedHeldTable(c, row.id), await deviceScopeOf(c, row, toolCallsOf(row.content))).lines) console.log(line);
  }
  return 0;
}

/** §11.3 (i) set equality, (ii) bytes and (iii) declaration + eligibility, against the live tables. The prediction runs the
 *  SHIPPING extractor over the STORED leaf, so (ii) compares two hashes of the same text — any difference is a capture defect.
 *  (iii) is the pure compareCapture (HELD-CAPTURE-COMPARE-ELIGIBILITY): see scripts/held-capture-compare.ts for what is and is not
 *  reconstructable. Eligibility columns are read only when the IF-3 schema is present (else every row is pre-IF-3). */
let eligColumnPresent: boolean | null = null;
async function compare(c: Client, ids: string[]): Promise<number> {
  if (eligColumnPresent === null) {
    eligColumnPresent = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'held_file_refs' AND column_name = 'eligibility'`)).rowCount === 1;
  }
  if (declColumnPresent === null) {
    declColumnPresent = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'held_file_refs' AND column_name = 'declarationSha256'`)).rowCount === 1;
  }
  const elig = eligColumnPresent ? `eligibility e, "grantPovId" g` : `NULL::text e, NULL::text g`;
  const decl = declColumnPresent ? `"declaredBy" db, "declarationSha256" ds` : `NULL::text db, NULL::text ds`;
  const ownerMemo = new Map<string, string | null | undefined>();
  let bad = 0; let unverifiable = 0;
  for (const row of await loadHarvesters(c, ids)) {
    const pred = predictedSet(row, await gitFileSourceLegOf(c, row), await storedHeldTable(c, row.id), await deviceScopeOf(c, row, toolCallsOf(row.content)));
    const refs = (await c.query(`SELECT "toolCallIndex" i, coalesce(selector, '') s, "blobSha256" h, "serviceId" sid, ${decl}, ${elig} FROM held_file_refs WHERE "executionId" = $1 AND kind = 'CAPTURE'`, [row.id])).rows;
    const refu = (await c.query(`SELECT "toolCallIndex" i, coalesce(selector, '') s, refusal r, "serviceId" sid, ${decl}, ${elig} FROM held_capture_refusals WHERE "executionId" = $1`, [row.id])).rows;
    const actual: StoredRow[] = [
      ...refs.map((x) => ({ i: x.i, s: x.s, outcome: 'held', hash: x.h, serviceId: x.sid ?? null, declaredBy: x.db ?? null, declarationSha256: x.ds ?? null, eligibility: x.e ?? null, grantPovId: x.g ?? null })),
      ...refu.map((x) => ({ i: x.i, s: x.s, outcome: x.r, hash: null, serviceId: x.sid ?? null, declaredBy: x.db ?? null, declarationSha256: x.ds ?? null, eligibility: x.e ?? null, grantPovId: x.g ?? null })),
    ];
    const sids = [...new Set([...actual, ...pred.rows].map((r) => r.serviceId).filter((x): x is string => !!x && !ownerMemo.has(x)))];
    if (sids.length) {
      const owners = (await c.query(`SELECT id, configuration->>'ownerId' o FROM mcp_tools WHERE id = ANY($1)`, [sids])).rows as Array<{ id: string; o: string | null }>;
      for (const sid of sids) { const o = owners.find((x) => x.id === sid); ownerMemo.set(sid, o ? (o.o ? o.o : null) : undefined); }
    }
    const u = (await c.query(`SELECT coalesce(e.context->'triggeredBy'->>'id', t.assignee_id) uid FROM agent_executions e JOIN tasks t ON t.id = e."taskId" WHERE e.id = $1`, [row.id])).rows[0]?.uid ?? null;
    const r = compareCapture(pred.rows, actual, { rowOwner: (sid) => (sid ? ownerMemo.get(sid) : undefined), executionUserId: u });
    if (!r.ok) bad++;
    unverifiable += r.unverifiable.length;
    console.log(`${r.ok ? '✅' : '❌'} ${row.id}: predicted ${pred.rows.length}, rows ${actual.length}, missing ${r.missing.length}, extra ${r.extra.length}, store-error excused ${r.storeErrorExcused}, hash mismatches ${r.hashMismatches.length}, declaration mismatches ${r.declarationMismatches.length}, eligibility mismatches ${r.eligibilityMismatches.length}, unverifiable ${r.unverifiable.length}`);
    for (const l of [...r.missing.map((m) => '  missing ' + m), ...r.extra.map((x) => '  extra ' + x), ...r.hashMismatches.map((x) => '  hash ' + x),
      ...r.declarationMismatches.map((x) => '  declaration ' + x), ...r.eligibilityMismatches.map((x) => '  eligibility ' + x),
      ...r.unverifiable.map((x) => '  ' + x), ...r.eligibilityNotes.map((x) => '  · ' + x)]) console.log(l);
  }
  if (unverifiable) console.log(`⚪ ${unverifiable} row(s) unverifiable by construction (named above) — not a pass, not a fail`);
  return bad > 0 ? 1 : 0;
}

/** held-network step 3 batch 2b — CORPUS: the SHIPPING Device sources grammar over every network leg (PIPELINE task on a
 *  Device-sources protocol) since HELD_REPLAY_SINCE: states, sources, problems by name. Prints ids and problem names only, never
 *  task text. */
async function deviceSourcesCorpus(c: Client): Promise<number> {
  const rows = (await c.query(`SELECT id, title, metadata, description, ("inputContext" -> 'interfaceContract') AS contract
                                 FROM tasks WHERE type = 'PIPELINE' AND created_at >= $1 ORDER BY created_at`, [SINCE])).rows as
    Array<{ id: string; title: string | null; metadata: unknown; description: string | null; contract: unknown }>;
  const legs = rows.filter((r) => isDeviceSourceLeg(r));
  const by: Record<string, number> = {};
  const governs: Record<string, number> = {};
  const odd: string[] = [];
  for (const l of legs) {
    // push 2 (O-2): what GOVERNS capture (the first-execution snapshot) beside what the live text declares
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    const g = governingDeviceSources({ description: l.description, contract: l.contract, snapshot: meta.deviceSourcesSnapshot ?? null });
    governs[g.state] = (governs[g.state] ?? 0) + 1;
    if (g.state === 'snapshot-changed' || g.state === 'snapshot-unreadable') odd.push(`${l.id} governing ${g.state}`);
    const r = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(l.contract), taskBody: l.description });
    const k = r.state === 'parsed' ? `parsed (${r.source}, ${new Set(r.entries.map((e) => e.device)).size} devices, kinds ${[...new Set(r.entries.map((e) => e.kind))].sort().join('+')})`
      : r.state === 'unparseable' ? `unparseable (${r.source}: ${r.problem})` : r.state;
    by[k] = (by[k] ?? 0) + 1;
    if (r.state === 'unparseable' || r.state === 'conflict') odd.push(`${l.id} ${r.state}${r.state === 'unparseable' ? ` ${r.problem} line ${r.lineIndex}` : ''}`);
    // the protocol's own heading appearing without a parse is the case to read by hand
    if (r.state === 'absent' && /Device sources/i.test(l.description ?? '')) odd.push(`${l.id} absent-but-mentions-heading`);
  }
  console.log(`══ DEVICE SOURCES CORPUS (shipping grammar v1) — network legs created >= ${SINCE}: ${legs.length} (of ${rows.length} PIPELINE tasks)`);
  for (const [k, n] of Object.entries(by).sort()) console.log(`  ${n}\t${k}`);
  console.log(`  governing declaration (the snapshot, push 2): ${JSON.stringify(governs)}`);
  for (const o of odd) console.log(`  READ BY HAND: ${o}`);
  return 0;
}

/** held-network step 3 batch 2b — CORPUS: the device lane + the two Harvester facts over every stored network Harvester that called
 *  the device lane's getter. Per execution: predicted device-lane rows by outcome, deviceSourceReads, gitDeviceComparison. */
async function deviceLaneCorpus(c: Client): Promise<number> {
  const rows = (await c.query(
    `SELECT e.id, e."taskId", t.pov_id AS "povId", e.status, e."supersededById", a.content, t.type AS "taskType", t.title AS "taskTitle", t.metadata AS "taskMetadata"
       FROM agent_artifacts a JOIN agent_executions e ON e.id = a."executionId" JOIN tasks t ON t.id = e."taskId"
      WHERE a.name = 'result.json' AND a.content LIKE '{%' AND a."createdAt" >= $1 AND (a.content LIKE '%fetch_data%' OR a.content LIKE '%get_file_contents%') AND t."agentRole" ~* 'harvest'
      ORDER BY a."createdAt"`, [SINCE])).rows as Row[];
  const totals: Record<string, number> = {};
  let n = 0;
  for (const row of rows) {
    const src = await deviceSourcesOf(c, row);
    if (!src) continue;
    n++;
    const tc = toolCallsOf(row.content) ?? [];
    const ex = extractDeclaredFiles(tc, undefined, { gitFileSourceLeg: true, deviceRead: buildDeviceReadScope(src, tc) });
    const lane = [...ex.files.filter((f) => f.target.startsWith('device:')).map(() => 'held'),
      ...ex.refusals.filter((r) => r.refusal.startsWith('device-') || r.sourceTool === 'fetch_data').map((r) => r.refusal)];
    const counts: Record<string, number> = {};
    for (const o of lane) { counts[o] = (counts[o] ?? 0) + 1; totals[o] = (totals[o] ?? 0) + 1; }
    totals.notAConfigRead = (totals.notAConfigRead ?? 0) + ex.stats.notAConfigRead;
    // push 2: what CAPTURE holds after the one-base-per-device rule, and what the O-4 force would read from those refs
    const cap = withDeviceEvidenceOnly(ex, buildDeviceReadScope(src, tc));
    const bases = cap.files.map((f) => (f.target.startsWith('device:') ? f.target : `git ${f.path}`));
    const evidenceOnly = cap.refusals.filter((r) => r.refusal === 'device-read-evidence-only').length;
    const force = deviceReadForce(src, cap.files.map((f) => ({ target: f.target, path: f.path })));
    totals['evidence-only'] = (totals['evidence-only'] ?? 0) + evidenceOnly;
    if (force) totals[`O-4 ${force.reason}`] = (totals[`O-4 ${force.reason}`] ?? 0) + 1;
    // push 3 (D-1): the carrier's reason over what the replay can see — source-not-pinned (a capture refusal) beats the device force;
    // stage-rebind / author-not-of-leg need the write and the Author, so they are not predicted here.
    const notPinned = cap.refusals.some((r) => r.refusal === 'source-not-pinned');
    const carrier = notPinned ? 'source-not-pinned' : force ? force.reason : 'none';
    totals[`carrier ${carrier}`] = (totals[`carrier ${carrier}`] ?? 0) + 1;
    const reads = computeDeviceSourceReads(src, tc) as Record<string, any>;
    const cmp = computeGitDeviceComparison(src, tc) as Record<string, any>;
    const cmpText = cmp.checked ? (cmp.devices as Array<Record<string, any>>).map((d) => `${d.device}:${d.state}${d.state === 'compared' ? ` diff ${d.differencesTotal} devOnly ${d.deviceOnlyLines}` : ''}`).join(', ') : cmp.reason;
    if (process.env.HELD_REPLAY_VERBOSE === '1' && cmp.checked) {
      for (const d of cmp.devices as Array<Record<string, any>>) for (const x of d.differences ?? []) console.log(`    ${d.device} ${x.kind}: ${x.line} | git ${JSON.stringify(x.gitParents)}${x.deviceParents ? ` | device ${JSON.stringify(x.deviceParents)}` : ''}`);
    }
    console.log(`${row.id} decl ${src.state}${src.state === 'parsed' ? `/${src.source}` : ''}${ASSUME_SNAPSHOT ? ' (assumed snapshot)' : ''} · lane ${JSON.stringify(counts)} notAConfigRead ${ex.stats.notAConfigRead} · reads ${reads.checked ? `notRead ${reads.notRead} undeclared ${reads.undeclaredDeviceConfigReads}` : reads.reason} · comparison ${cmpText} · held bases [${bases.join(', ')}] evidence-only ${evidenceOnly} · O-4 ${force ? `${force.reason}${force.gitFileDevicesNotHeld ? ` git[${force.gitFileDevicesNotHeld.join(',')}]` : ''}${force.devicesNotHeld ? ` read[${force.devicesNotHeld.join(',')}]` : ''}` : 'none'} · carrier ${carrier}`);
  }
  console.log(`══ DEVICE LANE CORPUS — network Harvesters with a fetch_data or get_file_contents call, created >= ${SINCE}: ${n} (of ${rows.length} candidate rows)`);
  console.log(`  totals: ${JSON.stringify(totals)}`);
  return 0;
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
    else if (args[0] === '--compare-all') {
      const ids = (await c.query(`SELECT "executionId" id FROM held_file_refs WHERE kind = 'CAPTURE'
                                  UNION SELECT "executionId" FROM held_capture_refusals`)).rows.map((r) => r.id as string);
      console.log(`# --compare-all: ${ids.length} executions with a CAPTURE ref or a capture refusal`);
      rc = ids.length ? await compare(c, ids) : 0;
    }
    else if (args[0] === '--check-held') rc = await checkHeld(c);
    else if (args[0] === '--device-sources') rc = await deviceSourcesCorpus(c);
    else if (args[0] === '--device-lane') rc = await deviceLaneCorpus(c);
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
