#!/usr/bin/env ts-node
/**
 * replay-held-variant.ts — the PLATFORM-HELD-BYTES Stage B replay runner (plan v4.1 §3 V-0, built 2026-10-15).
 *
 * WHAT IT PRINTS, per task, the four surfaces the variant build must not move on non-variant data:
 *   1. NETS + LEAN CARD — exactly the block `replay-nets.ts` prints (it calls that runner's exported `replay`), i.e.
 *      what every applicable net would stamp at the task's point, and the card line.
 *   2. CHAINER — `JSON.stringify(entry)` for every `chainedFrom` entry the SHIPPING chainer would hand this task, plus
 *      its `pipelineMetadata`. The owning-leg injection is resolved exactly as `prepareTaskForExecution` resolves it
 *      (non-PIPELINE task, `resolveOwningLeg`, one leg only). Two clock fields are masked: `pipelineMetadata.chainedAt`
 *      and an injected entry's `inheritedAt` (both `new Date()` at chain time).
 *   3. §6 RENDER — `renderPipelineContextSection` over the stored `inputContext` with the fresh chain merged on top,
 *      the same top-level patch `applyChainedContext` writes. Nothing is written.
 * Read-only by construction (every call is a read; the driver also forces the session read-only).
 *
 *   npx ts-node -r tsconfig-paths/register scripts/replay-held-variant.ts <taskId> [<taskId> ...]
 *   npx ts-node -r tsconfig-paths/register scripts/replay-held-variant.ts --control <obsLegId>
 *
 * --control <legId> — THE POSITIVE CONTROL (plan V-0: "a leg built by the real stamp writer from a title carrying
 * `(protocol: observability-config-held)`"). It takes a REAL observability-config leg, rewrites its title's protocol
 * token to the variant's, and stamps `metadata.protocol` with the SHIPPING stamp writer (`resolveProtocolStamp`, the
 * function prepare-task-for-execution calls) — never a hand-typed value. The rewritten row is served by a Prisma
 * overlay passed BY INJECTION (`buildNetContext({ prisma })`, `chainDependencyContext(id, db)`, `resolveOwningLeg(db)`),
 * the substitution the global-prisma-singleton pattern sanctions — never by replacing the process-wide client (that
 * would hang the control on lib/prisma.ts's hot-reload cache, an implementation detail). This is only sound while
 * NO read on the nets/chain path bypasses the injected client: V-0 closed the one that did (`resolveRollbackLane`) and
 * `scripts/test-held-variant-golden.ts` pins the property, because a bypassing read would silently see the un-overlaid
 * row and the control would pass while testing nothing. Raw SQL cannot be overlaid; the control counts raw operations
 * and prints the count, so a blind spot is named rather than silent (0 on the nets/chain path today).
 * The control's output is compared with the same tasks replayed WITHOUT the overlay: the difference is the set of
 * protocol-keyed behaviours the variant reaches. `scripts/fixtures/held-variant-control-expected.json` records it per
 * build step (`--expect <step>` makes the comparison an assertion).
 */
import * as dotenv from 'dotenv';
dotenv.config();
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('tsconfig-paths/register');
import { PrismaClient } from '@prisma/client';

export const HELD_VARIANT_TOKEN = 'observability-config-held';
const BASE_TOKEN = 'observability-config';

type AnyRec = Record<string, unknown>;

/** Mask the two wall-clock fields the chainer stamps; everything else is a pure function of stored data. */
export function maskChainClock<T>(v: T): T {
  const c = JSON.parse(JSON.stringify(v)) as AnyRec;
  const pm = c.pipelineMetadata as AnyRec | undefined;
  if (pm && 'chainedAt' in pm) pm.chainedAt = '<masked>';
  for (const e of (c.chainedFrom as AnyRec[] | undefined) ?? []) if ('inheritedAt' in e) e.inheritedAt = '<masked>';
  return c as T;
}

/** Rewrite a title's protocol token to the variant's (append one when the title carries none). */
export function variantTitle(title: string): string {
  const re = new RegExp(`\\(protocol: ${BASE_TOKEN}\\)`);
  return re.test(title) ? title.replace(re, `(protocol: ${HELD_VARIANT_TOKEN})`) : `${title} (protocol: ${HELD_VARIANT_TOKEN})`;
}

/** Overlay: every result object whose `id` is the control leg gets the variant title + stamped metadata. */
function overlayClient(base: PrismaClient, legId: string, title: string, metadata: unknown, rawOps: { n: number; heads: Map<string, number> }) {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return v; }
    if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      const o = v as AnyRec;
      if (o.id === legId) {
        if ('title' in o) o.title = title;
        if ('metadata' in o) o.metadata = JSON.parse(JSON.stringify(metadata));
      }
      for (const k of Object.keys(o)) walk(o[k]);
    }
    return v;
  };
  // A Task read that SELECTS fields without `id` (resolveRollbackLane: `select: { title, metadata }`) returns rows the
  // id walk cannot recognise. For top-level Task operations, `id` is added to such a select, the rows patched, and `id`
  // removed again, so every printed shape is unchanged. (A Task selected NESTED under another model without its id is
  // not patched — none on the nets/chain path today; the leg's own stage/children reads select ids.)
  const stripIds = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(stripIds); else if (v && typeof v === 'object') delete (v as AnyRec).id;
  };
  return base.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (!model) {
          rawOps.n++;
          // Name each raw statement (its SQL head) so the blind spot is inspectable: a raw read of a task's title or
          // metadata would bypass the overlay and must be visible here, not inferred.
          const sql = (args as { strings?: string[]; sql?: string } | unknown[] | undefined);
          const text = Array.isArray(sql) ? String((sql[0] as { strings?: string[] })?.strings?.join('?') ?? sql[0])
            : String((sql as { strings?: string[] })?.strings?.join('?') ?? (sql as { sql?: string })?.sql ?? JSON.stringify(sql));
          const head = `${operation} ${text.replace(/\s+/g, ' ').trim().slice(0, 140)}`;
          rawOps.heads.set(head, (rawOps.heads.get(head) ?? 0) + 1);
        }
        const a = args as AnyRec | undefined;
        const sel = a?.select as AnyRec | undefined;
        if (model === 'Task' && /^find(Unique|First|Many)/.test(operation) && sel && typeof sel === 'object' && !('id' in sel)) {
          const r = walk(await query({ ...a, select: { ...sel, id: true } } as never));
          stripIds(r);
          return r;
        }
        return walk(await query(args));
      },
    },
  }) as unknown as PrismaClient;
}

async function chainSurfaces(taskId: string, db: PrismaClient) {
  // Required lazily so `--control` can fail fast on a bad leg id before loading the harness modules.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { chainDependencyContext } = require('../lib/agents/harness/context-chainer');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveOwningLeg } = require('../lib/agents/harness/program-protocol');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { renderPipelineContextSection } = require('../lib/agents/harness/render-pipeline-context');

  const task = await db.task.findUnique({
    where: { id: taskId }, select: { id: true, type: true, stageId: true, agentRole: true, inputContext: true },
  });
  if (!task) { console.log(`  CHAIN: no such task`); return; }

  // Same injection resolution as prepareTaskForExecution (non-PIPELINE, one owning leg).
  let inject: unknown = null;
  if (task.type !== 'PIPELINE' && task.stageId) {
    try {
      const leg = await resolveOwningLeg(db, task.stageId);
      if (leg.kind === 'one') inject = { legTaskId: leg.legTaskId, entries: leg.chainedFrom, childAgentRole: task.agentRole };
      else if (leg.kind === 'ambiguous') console.log(`  CHAIN: owning leg ambiguous — nothing injected (as prepare)`);
    } catch (e) { console.log(`  CHAIN: owning-leg resolution THREW — ${e instanceof Error ? e.message : String(e)}`); }
  }

  let chained: AnyRec | null;
  try { chained = await chainDependencyContext(task.id, db, { inject }); }
  catch (e) { console.log(`  CHAIN: THREW — ${e instanceof Error ? e.message : String(e)}`); return; }
  if (!chained) { console.log(`  CHAIN: null (no dependencies, nothing to inject)`); }
  else {
    const m = maskChainClock(chained);
    const entries = (m.chainedFrom as AnyRec[]) ?? [];
    console.log(`  CHAIN: ${entries.length} entries`);
    entries.forEach((e, i) => console.log(`  ENTRY[${i}] ${JSON.stringify(e)}`));
    console.log(`  META ${JSON.stringify(m.pipelineMetadata)}`);
  }

  const stored = (task.inputContext ?? {}) as AnyRec;
  const merged = chained ? { ...stored, ...maskChainClock(chained) } : stored;
  const lines: string[] = renderPipelineContextSection(merged);
  console.log(`  §6: ${lines.length} lines`);
  for (const l of lines) console.log(`  §6| ${l}`);
}

async function surfaces(taskId: string, db: PrismaClient) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { replay } = require('./replay-nets');
  await replay(taskId, null, false, db);
  await chainSurfaces(taskId, db);
}

async function control(legId: string, base: PrismaClient) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveProtocolStamp, resolveTaskProtocol, canonicalProtocolName } = require('../lib/agents/harness/program-protocol');
  const leg = await base.task.findUnique({ where: { id: legId }, select: { id: true, type: true, title: true, metadata: true } });
  if (!leg || leg.type !== 'PIPELINE') throw new Error(`control: ${legId} is not a PIPELINE leg`);
  const srcProto = resolveTaskProtocol(leg).protocol;
  if (srcProto !== canonicalProtocolName(BASE_TOKEN)) throw new Error(`control: ${legId} is ${srcProto}, not ${BASE_TOKEN}`);
  const title = variantTitle(leg.title);
  // THE REAL STAMP WRITER — the value prepare-task-for-execution would stamp for this title.
  const stamp = resolveProtocolStamp(title);
  const metadata = { ...((leg.metadata as AnyRec | null) ?? {}), protocol: stamp.protocol };
  const rawOps = { n: 0, heads: new Map<string, number>() };
  const db = overlayClient(base, legId, title, metadata, rawOps);

  const seen = resolveTaskProtocol((await db.task.findUnique({ where: { id: legId }, select: { title: true, metadata: true } }))!);
  console.log(`CONTROL leg=${legId} stamped=${stamp.protocol} tokenCount=${stamp.tokenCount} resolved=${seen.protocol} source=${seen.source}`);
  if (seen.protocol !== canonicalProtocolName(HELD_VARIANT_TOKEN) || seen.source !== 'stamp') throw new Error('control: overlay did not take');

  const stageId = (leg.metadata as AnyRec | null)?.pipelineStageId;
  const children = typeof stageId === 'string'
    ? await base.task.findMany({ where: { stageId }, select: { id: true }, orderBy: { id: 'asc' } }) : [];
  for (const id of [legId, ...children.map((c) => c.id)]) await surfaces(id, db);
  console.log(`CONTROL raw SQL operations (not overlaid): ${rawOps.n}`);
  for (const [h, n] of rawOps.heads) console.log(`CONTROL raw SQL ×${n}: ${h}`);
}

if (require.main === module) (async () => {
  const argv = process.argv.slice(2);
  // --report <file>: the report goes to its OWN file, written synchronously; stdout keeps the pino logs. pino and
  // console.log are two writers on fd 1, and node splits a long line across pipe writes, so a log line can land in the
  // middle of a report line — a filter then drops real output (2026-10-15, half a §6 table row). Every console.log in
  // this process (replay-nets' too) is re-pointed, so nothing reaches the report through the shared descriptor.
  const ri = argv.indexOf('--report');
  if (ri >= 0) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs'); const util = require('util');
    const fd = fs.openSync(argv[ri + 1], 'a');
    console.log = (...a: unknown[]) => { fs.writeSync(fd, util.format(...a) + '\n'); };
    argv.splice(ri, 2);
  }
  const base = new PrismaClient();
  const ci = argv.indexOf('--control');
  try {
    if (ci >= 0) await control(argv[ci + 1], base);
    else {
      const ids = argv.filter((a) => !a.startsWith('--'));
      if (!ids.length) { console.error('usage: replay-held-variant.ts <taskId>… | --control <obsLegId>'); process.exit(1); }
      for (const id of ids) await surfaces(id, base);
    }
  } finally { await base.$disconnect(); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
