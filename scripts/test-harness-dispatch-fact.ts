#!/usr/bin/env ts-node
/**
 * RWF A3 (2026-09-26) — the lost-wakeup self-check (harness-dispatch-fact.ts) and its Guard-7 bypass.
 *
 * No database: a stub client answers the harness read, the dispatch query and the settledness count; the
 * reactor module is replaced (require.cache) by a recorder, so the test sees exactly what would be fired.
 * The in-tx DECLINE (the dead-end/R4 branches) is proven against the real terminal tx in
 * test-synthesize-dead-end-behavioral.ts SDE-5..11.
 */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub?sslmode=disable';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

let passed = 0;
const failed: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

// Recorder in place of the reactor (fire-time dynamic import resolves through require.cache).
const fired: Array<{ id: string; opts: unknown }> = [];
const reactorPath = require.resolve('@/lib/services/pipelineRetriggerReactorService');
require.cache[reactorPath] = { id: reactorPath, filename: reactorPath, loaded: true, exports: {
  maybeRetriggerPipelineHarness: async (id: string, opts: unknown) => { fired.push({ id, opts }); },
} } as any;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { maybeSelfCheckLostWakeup } = require('@/lib/services/harness-dispatch-fact') as
  typeof import('@/lib/services/harness-dispatch-fact');

function stubDb(o: { type?: string; childStageId?: string | null; dispatched?: string[]; anyChild?: string | null; unsettled?: number }) {
  return {
    task: {
      findUnique: async () => ({ type: o.type ?? 'PIPELINE', metadata: o.childStageId === null ? {} : { pipelineStageId: o.childStageId ?? 'cmstage' } }),
      findFirst: async () => (o.anyChild === null ? null : { id: o.anyChild ?? 'cmanychild' }),
      count: async () => o.unsettled ?? 0,
    },
    $queryRaw: async () => (o.dispatched ?? []).map((taskId) => ({ taskId })),
  } as any;
}
const run = (db: any, resolvedMode: string | null, tail: 'success' | 'failure') =>
  maybeSelfCheckLostWakeup(db, { taskId: 'cmharness', executionId: 'cmexec', resolvedMode, tail });
const flush = () => new Promise((r) => setImmediate(r));

(async () => {
  console.log('🧪 RWF A3 — lost-wakeup self-check\n');

  await test('S1 success tail, SYNTHESIZE, dispatched a child → fires for that child with bypassDebounce', async () => {
    fired.length = 0; await run(stubDb({ dispatched: ['cmchildA'] }), 'SYNTHESIZE', 'success'); await flush();
    assert(fired.length === 1 && fired[0].id === 'cmchildA', `fired ${JSON.stringify(fired)}`);
    assert((fired[0].opts as any)?.bypassDebounce === true, 'the self-check must bypass Guard 7');
  });
  await test('S2 success tail, SYNTHESIZE, NO dispatch → does not fire (a harness that forgot task.complete cannot loop)', async () => {
    fired.length = 0; await run(stubDb({ dispatched: [], unsettled: 0 }), 'SYNTHESIZE', 'success'); await flush();
    assert(fired.length === 0, `fired ${JSON.stringify(fired)}`);
  });
  await test('S3 success tail, CREATE, stage settled during the run → fires (Q4)', async () => {
    fired.length = 0; await run(stubDb({ dispatched: [], unsettled: 0, anyChild: 'cmc1' }), 'CREATE', 'success'); await flush();
    assert(fired.length === 1 && fired[0].id === 'cmc1', `fired ${JSON.stringify(fired)}`);
  });
  await test('S4 success tail, ORCHESTRATE, stage still unsettled → does not fire (the child\'s own persist will)', async () => {
    fired.length = 0; await run(stubDb({ dispatched: [], unsettled: 2 }), 'ORCHESTRATE', 'success'); await flush();
    assert(fired.length === 0, `fired ${JSON.stringify(fired)}`);
  });
  await test('S5 failure tail, dispatched a child → fires', async () => {
    fired.length = 0; await run(stubDb({ dispatched: ['cmchildB'] }), null, 'failure'); await flush();
    assert(fired.length === 1 && fired[0].id === 'cmchildB', `fired ${JSON.stringify(fired)}`);
  });
  await test('S6 failure tail, stage settled but NO dispatch → does not fire (no mode arm on failure: loop guard)', async () => {
    fired.length = 0; await run(stubDb({ dispatched: [], unsettled: 0 }), 'CREATE', 'failure'); await flush();
    assert(fired.length === 0, `fired ${JSON.stringify(fired)}`);
  });
  await test('S7 a non-PIPELINE task, or a PIPELINE with no child stage → does nothing', async () => {
    fired.length = 0;
    await run(stubDb({ type: 'ACTION', dispatched: ['x'] }), 'SYNTHESIZE', 'success');
    await run(stubDb({ childStageId: null, dispatched: ['x'] }), 'SYNTHESIZE', 'success');
    await flush();
    assert(fired.length === 0, `fired ${JSON.stringify(fired)}`);
  });
  await test('S8 a failing DB read never throws out of the self-check', async () => {
    const bad = { task: { findUnique: async () => { throw new Error('db down'); } }, $queryRaw: async () => [] } as any;
    await run(bad, 'SYNTHESIZE', 'success');
  });

  const reactorSrc = stripComments(fs.readFileSync(path.join(ROOT, 'lib/services/pipelineRetriggerReactorService.ts'), 'utf8'));
  await test('P1 bypassDebounce is read ONLY by Guard 7', () => {
    const reads = reactorSrc.split('bypassDebounce').length - 1;
    assert(/const recentExecution = opts\?\.bypassDebounce \? null :/.test(reactorSrc), 'Guard 7 does not honour the option');
    assert(reads === 2, `expected the option declared once and read once, found ${reads} mentions`);
  });
  await test('P2 bypassDebounce: true is passed at exactly ONE call site (the self-check), never by reapers', () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|js)$/.test(e.name) ? [path.join(d, e.name)] : []);
    const sites = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'app'))]
      .flatMap((f) => (stripComments(fs.readFileSync(f, 'utf8')).match(/bypassDebounce: true/g) ?? []).map(() => path.relative(ROOT, f)));
    assert(sites.length === 1 && sites[0] === 'lib/services/harness-dispatch-fact.ts', `bypassDebounce: true at: ${sites.join(', ') || 'nowhere'}`);
  });
  await test('P3 both persist tails call the self-check (success with its mode, failure with the dispatch fact only)', () => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, 'lib/services/execution-terminal-persist.ts'), 'utf8'));
    assert(/maybeSelfCheckLostWakeup\(db, \{[\s\S]{0,200}tail: 'success'/.test(src), 'success tail missing');
    assert(/maybeSelfCheckLostWakeup\(db, \{[\s\S]{0,200}resolvedMode: null, tail: 'failure'/.test(src), 'failure tail missing or carries a mode');
  });
  await test('P4 the dispatch fact is read from server-written rows, mcp-direct only, stage-filtered', () => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, 'lib/services/harness-dispatch-fact.ts'), 'utf8'));
    assert(src.includes(`'triggeredBy' ->> 'source' = 'mcp-direct'`), 'source filter missing (the retrigger reactor also writes parentExecutionId)');
    assert(src.includes(`'triggeredBy' ->> 'parentExecutionId' = \${args.executionId}`), 'parentExecutionId key missing');
    assert(src.includes('t.stage_id = ${args.childStageId}'), 'stage filter missing (an out-of-stage dispatch would hang the leg)');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
