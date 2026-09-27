#!/usr/bin/env ts-node
/**
 * RWF A2 (2026-09-26) — Guard 8 budget exhaustion TERMINALIZES (tiered), instead of hanging IN_PROGRESS.
 *
 * Part 1 — source pins (no database; CI): the reactor tiers the budget via the shared protocol resolver,
 *   warns roots at 80%, and calls the terminalization handler on exhaustion (not a bare skip).
 * Part 2 — the handler against a real database (skipped without DATABASE_URL):
 *   H1 standalone harness → FAILED + keyed stamp + comment, NO cone
 *   H2 program LEG → FAILED + its same-stage forward cone marked
 *   H3 a live (PENDING) harness execution → nothing written (a rescue run must never be FAILED + coned)
 *   H4 a newer harness execution than the one Guard 8 counted → 'stale', nothing written
 *   H5 second call → idempotent (one comment)
 *   H6 a COMPLETED harness → nothing written
 * Plan: cline_docs/reviews/rwf-stage1-2026-09-26/PLAN.md §2 A.3.
 */
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

(async () => {
  console.log('🧪 RWF A2 — reactor budget exhaustion terminalizes\n');
  console.log('Part 1 — source pins');
  const reactor = stripComments(fs.readFileSync(path.join(ROOT, 'lib/services/pipelineRetriggerReactorService.ts'), 'utf8'));

  await test('P1 two budgets: legs default 10, program roots default 25 (env-tunable)', () => {
    assert(/MAX_HARNESS_REACTOR_GENERATIONS \?\? 10/.test(reactor), 'leg budget default changed');
    assert(/MAX_PROGRAM_ROOT_REACTOR_GENERATIONS \?\? 25/.test(reactor), 'program-root budget missing or changed');
  });
  await test('P2 tier comes from the shared protocol resolver (stamp-first), not a hand-rolled title test', () => {
    assert(/isProgramHarnessTask\(\{ title: harness\.title, metadata: harness\.metadata \}\)/.test(reactor), 'tier not resolved via isProgramHarnessTask');
  });
  await test('P3 exhaustion calls the terminalization handler (not a bare skip)', () => {
    const i = reactor.indexOf('if (priorGeneration >= budget)');
    assert(i > 0, 'tiered budget check missing');
    const win = reactor.slice(i, i + 900);
    assert(win.includes('logReactorBudgetSkip(') && win.includes('await handleReactorBudgetExhausted('), 'exhaustion no longer terminalizes');
    assert(win.includes('evaluatedExecutionId: priorExecRows[0].id'), 'the handler must be told which execution Guard 8 counted from');
  });
  await test('P4 program roots warn at 80% of their budget', () => {
    assert(/PROGRAM_ROOT_BUDGET_WARN_FRACTION = 0\.8/.test(reactor), 'warn fraction changed');
    assert(reactor.includes(`'HARNESS_GENERATION_BUDGET_APPROACHING'`), 'approaching-budget warn missing');
  });

  console.log('\nPart 2 — handler behaviour (real database)');
  if (!process.env.DATABASE_URL) {
    console.log('  ⏭️  skipped — DATABASE_URL not set (real-DB integration; run locally with .env loaded)');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { handleReactorBudgetExhausted } = require('../lib/services/reactor-budget-exhausted-persist') as
      typeof import('../lib/services/reactor-budget-exhausted-persist');

    const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
    const country = await prisma.country.findFirst({ select: { id: true } });
    if (!owner || !country) throw new Error('fixture needs an ADMIN user and a Country');
    const now = new Date(); const future = new Date(now.getTime() + 30 * 86400000);
    const pov = await prisma.pOV.create({ data: { title: `__test_budget_${Date.now()}`, description: 'RWF A2 fixture',
      ownerId: owner.id, status: 'PROJECTED', startDate: now, endDate: future, salesTheatre: 'NORTH_AMERICA', countryId: country.id } });
    const phase = await prisma.phase.create({ data: { name: 'P', type: 'EXECUTION', povId: pov.id, order: 0, description: '', startDate: now, endDate: future } });
    let n = 0;
    const stage = (name: string) => prisma.stage.create({ data: { name, phaseId: phase.id, order: n++ } });
    const harnessIn = async (stageId: string, data: Record<string, unknown> = {}) =>
      prisma.task.create({ data: { title: `h${n++}`, povId: pov.id, stageId, type: 'PIPELINE' as any, status: 'IN_PROGRESS', executionStatus: 'SUCCESS' as any, ...data } });
    const exec = (taskId: string, status: string) =>
      prisma.agentExecution.create({ data: { taskId, status, config: {}, context: {}, logs: [] } });
    const call = (harnessTaskId: string, evaluatedExecutionId: string) => handleReactorBudgetExhausted({
      harnessTaskId, evaluatedExecutionId, generation: 10, budget: 10, tier: 'leg',
      cascadeCompletedTaskId: 'cmchild00000000000000000001', commentUserId: owner.id,
    });
    const comments = (taskId: string) => prisma.comment.count({ where: { taskId } });

    try {
      await test('H1 standalone harness at budget → FAILED, keyed stamp, one comment, NO cone', async () => {
        const s = await stage('Pipeline: standalone');
        const h = await harnessIn(s.id); const e = await exec(h.id, 'SUCCESS');
        const dep = await prisma.task.create({ data: { title: 'dependent', povId: pov.id, stageId: s.id, type: 'ACTION' as any } });
        await prisma.taskDependency.create({ data: { taskId: dep.id, dependsOnId: h.id } });
        const r = await call(h.id, e.id);
        assert(r === 'terminalized', `expected terminalized, got ${r}`);
        const row = await prisma.task.findUnique({ where: { id: h.id }, select: { executionStatus: true, status: true, metadata: true } });
        assert(row?.executionStatus === 'FAILED' && row.status === 'IN_PROGRESS', `expected IN_PROGRESS+FAILED, got ${row?.status}/${row?.executionStatus}`);
        const stamp = (row?.metadata as any)?.reactorBudgetExhausted;
        assert(stamp?.harnessExecutionId === e.id && stamp?.budget === 10 && stamp?.tier === 'leg', `stamp missing/wrong: ${JSON.stringify(stamp)}`);
        assert(await comments(h.id) === 1, 'expected exactly one honesty comment');
        const d = await prisma.task.findUnique({ where: { id: dep.id }, select: { executionStatus: true } });
        assert(d?.executionStatus !== 'FAILED', 'a standalone pipeline must NOT walk the cone');
      });
      await test('H2 program LEG at budget → FAILED and its same-stage forward cone marked', async () => {
        const s = await stage('Program: fixture');
        const h = await harnessIn(s.id); const e = await exec(h.id, 'SUCCESS');
        const dep = await prisma.task.create({ data: { title: 'node-c', povId: pov.id, stageId: s.id, type: 'ACTION' as any } });
        await prisma.taskDependency.create({ data: { taskId: dep.id, dependsOnId: h.id } });
        const r = await call(h.id, e.id);
        assert(r === 'terminalized', `expected terminalized, got ${r}`);
        const d = await prisma.task.findUnique({ where: { id: dep.id }, select: { executionStatus: true, metadata: true } });
        assert(d?.executionStatus === 'FAILED', 'the leg\'s forward cone must be marked FAILED');
        assert((d?.metadata as any)?.blockedByUpstreamFailure, 'cone task missing blockedByUpstreamFailure');
      });
      await test('H3 a live (PENDING) harness execution → nothing written (rescue run is never FAILED)', async () => {
        const s = await stage('Pipeline: live');
        const h = await harnessIn(s.id); const e = await exec(h.id, 'PENDING');
        const r = await call(h.id, e.id);
        assert(r === 'already-handled', `expected no-op, got ${r}`);
        const row = await prisma.task.findUnique({ where: { id: h.id }, select: { executionStatus: true } });
        assert(row?.executionStatus === 'SUCCESS', 'a harness with a live execution was marked FAILED');
        assert(await comments(h.id) === 0, 'no comment may be written');
      });
      await test('H4 a newer harness execution than the one counted → stale, nothing written', async () => {
        const s = await stage('Pipeline: stale');
        const h = await harnessIn(s.id); const counted = await exec(h.id, 'SUCCESS');
        await new Promise((res) => setTimeout(res, 5));
        await exec(h.id, 'SUCCESS'); // a human re-execute landed in the gap (and finished)
        const r = await call(h.id, counted.id);
        assert(r === 'stale', `expected stale, got ${r}`);
        const row = await prisma.task.findUnique({ where: { id: h.id }, select: { executionStatus: true } });
        assert(row?.executionStatus === 'SUCCESS', 'a stale budget decision terminalized the harness');
      });
      await test('H5 a second call is idempotent (one comment, still FAILED)', async () => {
        const s = await stage('Pipeline: twice');
        const h = await harnessIn(s.id); const e = await exec(h.id, 'SUCCESS');
        assert(await call(h.id, e.id) === 'terminalized', 'first call should terminalize');
        const r2 = await call(h.id, e.id);
        assert(r2 === 'already-handled', `second call should no-op, got ${r2}`);
        assert(await comments(h.id) === 1, 'the second call wrote another comment');
      });
      await test('H6 a COMPLETED harness → nothing written', async () => {
        const s = await stage('Pipeline: done');
        const h = await harnessIn(s.id, { status: 'COMPLETED' }); const e = await exec(h.id, 'SUCCESS');
        const r = await call(h.id, e.id);
        assert(r === 'already-handled', `expected no-op, got ${r}`);
        const row = await prisma.task.findUnique({ where: { id: h.id }, select: { executionStatus: true } });
        assert(row?.executionStatus === 'SUCCESS', 'a COMPLETED harness was marked FAILED');
      });
    } finally {
      await prisma.comment.deleteMany({ where: { task: { povId: pov.id } } });
      await prisma.taskDependency.deleteMany({ where: { task: { povId: pov.id } } });
      await prisma.task.deleteMany({ where: { povId: pov.id } });
      await prisma.stage.deleteMany({ where: { phase: { povId: pov.id } } });
      await prisma.phase.deleteMany({ where: { povId: pov.id } });
      await prisma.pOV.delete({ where: { id: pov.id } });
      await prisma.$disconnect();
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
