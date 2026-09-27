#!/usr/bin/env ts-node
/**
 * RWF A1 (2026-09-26) — the ONE shared "child stage settled" predicate, every site that reads it, the reapers
 * that must wake a harness, and the manual-execute PIPELINE-upstream rule (m18).
 *
 * Part 1 — source locks (no database; always runs, CI included):
 *   L1 single source: no stage-scoped child count re-implements the predicate outside child-stage-settled.ts
 *   L2 every site reads it: Guard 4, the mode resolver, the 4-point invariant (pt 3), F20
 *   L3 every reaper-class site that fires the ready-dependents reactor also fires the harness retrigger
 *   L4 manual agent.execute: a PIPELINE upstream counts only when COMPLETED
 *   L5 RWF-X4: both reapers write the task side through writeReapedTaskStatuses (reaped-task-persist.ts),
 *      and the engine writes no task executionStatus of its own on a reap
 * Part 2 — behaviour against a real database (skipped without DATABASE_URL, like the resolver suite):
 *   the predicate's states (incl. F-e and SCHEDULED), the resolver, invariant point 3, and (X4) the reaped-
 *   task rule: which tasks are harness-owned, and every branch of writeReapedTaskStatuses including the
 *   residual it deliberately leaves (a dependent of a reaped pipeline child stays OPEN).
 *
 * Plan + reviews: cline_docs/reviews/rwf-stage1-2026-09-26/ (PLAN §2 A.1, §6).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

let passed = 0;
const failed: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

const MODULE = 'lib/services/child-stage-settled.ts';

(async () => {
  console.log('🧪 RWF A1 — shared child-stage settledness predicate\n');
  console.log('Part 1 — source locks');

  await test('L1 single source: no stage-scoped child count re-implements the not-terminal arm outside the module', () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : /\.(ts|js)$/.test(e.name) ? [p] : [];
    });
    // The shape of a copy: a task count scoped to a stage that filters on executionStatus.
    const COPY = /\.task\.count\(\{[\s\S]{0,300}?stageId[\s\S]{0,400}?executionStatus/;
    const offenders = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'app'))]
      .map((f) => path.relative(ROOT, f))
      .filter((f) => f !== MODULE && COPY.test(stripComments(read(f))));
    assert(offenders.length === 0, `re-inlined settledness predicate in: ${offenders.join(', ')}`);
  });

  await test('L1b positive control: the detector matches the pre-RWF inline shape', () => {
    const old = `const n = await tx.task.count({ where: { stageId: legStageId, AND: [ { status: { not: 'COMPLETED' } },
      { OR: [{ executionStatus: null }, { executionStatus: { notIn: ['FAILED'] } }] } ] } });`;
    assert(/\.task\.count\(\{[\s\S]{0,300}?stageId[\s\S]{0,400}?executionStatus/.test(old), 'L1 detector no longer matches the shape it guards');
  });

  await test('L2 Guard 4, resolver, invariant pt 3 and F20 all read countUnsettledChildren', () => {
    const sites: Array<[string, RegExp]> = [
      ['lib/services/pipelineRetriggerReactorService.ts', /countUnsettledChildren\(prisma, completed\.stageId\)/],
      ['lib/services/harnessModeResolver.ts', /countUnsettledChildren\(tx, pipelineStageId\)/],
      ['lib/tasks/services/complete-task-terminally.ts', /countUnsettledChildren\(client, pipelineStageId\)/],
      ['lib/services/execution-terminal-persist.ts', /countUnsettledChildren\(tx, legStageId\)/],
    ];
    const missing = sites.filter(([f, re]) => !re.test(stripComments(read(f)))).map(([f]) => f);
    assert(missing.length === 0, `sites not reading the shared predicate: ${missing.join(', ')}`);
  });

  await test('L2b the in-flight arm covers ANY task status (F-e), and SCHEDULED is not in flight', () => {
    const src = stripComments(read(MODULE));
    assert(src.includes(`export const ACTIVE_EXECUTION_STATUSES = ['PENDING', 'RUNNING'] as const`), 'active status set changed');
    assert(/\{ executions: \{ some: \{ status: \{ in: \[\.\.\.ACTIVE_EXECUTION_STATUSES\] \} \} \} \}/.test(src), 'in-flight arm missing');
    assert(!/status: 'COMPLETED',\s*executions/.test(src), 'in-flight arm narrowed to COMPLETED-only');
  });

  await test('L3 every reaper-class ready-dependents fire in the engine also fires the harness retrigger', () => {
    const src = stripComments(read('lib/services/agentExecutionEngine.ts'));
    const ready = src.split('maybeQueueReadyDependents(').length - 1;
    const retrig = src.split('maybeRetriggerPipelineHarness(').length - 1;
    assert(ready === 3, `expected 3 reaper-class maybeQueueReadyDependents calls, found ${ready} — re-read the sites`);
    assert(retrig === ready, `each reaper site must wake the harness: ${retrig} retrigger vs ${ready} ready-dependents calls`);
  });

  await test('L4 manual agent.execute: a PIPELINE upstream is satisfied only when COMPLETED (m18)', () => {
    const src = stripComments(read('lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts'));
    assert(/d\.dependsOn\.status !== 'COMPLETED' &&\s*\(d\.dependsOn\.type === 'PIPELINE' \|\| d\.dependsOn\.executionStatus !== 'SUCCESS'\)/.test(src),
      'the executionStatus=SUCCESS escape applies to PIPELINE upstreams again');
  });

  await test('L5 RWF-X4: both reapers write the task side through the ONE shared module', () => {
    const src = stripComments(read('lib/services/agentExecutionEngine.ts'));
    const calls = src.split('writeReapedTaskStatuses(').length - 1;
    assert(calls === 2, `expected writeReapedTaskStatuses at the startup + periodic reapers (2), found ${calls}`);
    assert(!/executionStatus: null/.test(src), 'the engine writes executionStatus:null itself again — a reap bypassing the X4 rule');
    assert(/if \(flipped\.count > 0\) reaped\.push\(/.test(src), 'startup reaper must pass only executions it actually flipped');
  });

  console.log('\nPart 2 — behaviour (real database)');
  if (!process.env.DATABASE_URL) {
    console.log('  ⏭️  skipped — DATABASE_URL not set (real-DB integration; run locally with .env loaded)');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const settled = require('../lib/services/child-stage-settled') as typeof import('../lib/services/child-stage-settled');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveHarnessMode } = require('../lib/services/harnessModeResolver') as typeof import('../lib/services/harnessModeResolver');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { assertPipelineCompletionInvariant } = require('../lib/tasks/services/complete-task-terminally') as
      typeof import('../lib/tasks/services/complete-task-terminally');

    const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
    const country = await prisma.country.findFirst({ select: { id: true } });
    if (!owner || !country) throw new Error('fixture needs an ADMIN user and a Country');
    const now = new Date(); const future = new Date(now.getTime() + 30 * 86400000);
    const pov = await prisma.pOV.create({ data: { title: `__test_settled_${Date.now()}`, description: 'RWF A1 fixture',
      ownerId: owner.id, status: 'PROJECTED', startDate: now, endDate: future, salesTheatre: 'NORTH_AMERICA', countryId: country.id } });
    const phase = await prisma.phase.create({ data: { name: 'P', type: 'EXECUTION', povId: pov.id, order: 0, description: '', startDate: now, endDate: future } });
    let n = 0;
    const newStage = () => prisma.stage.create({ data: { name: `S${n++}`, phaseId: phase.id, order: n } });
    const child = (stageId: string, data: Record<string, unknown>) =>
      prisma.task.create({ data: { title: `c${n++}`, povId: pov.id, stageId, type: 'ACTION' as any, ...data } });
    const exec = (taskId: string, status: string) =>
      prisma.agentExecution.create({ data: { taskId, status, config: {}, context: {}, logs: [] } });

    try {
      await test('D1 COMPLETED child with no active execution → settled', async () => {
        const s = await newStage(); await child(s.id, { status: 'COMPLETED' });
        assert(await settled.countUnsettledChildren(prisma, s.id) === 0, 'expected settled');
      });
      await test('D2 COMPLETED child with a RUNNING execution → unsettled (H-6)', async () => {
        const s = await newStage(); const c = await child(s.id, { status: 'COMPLETED' }); await exec(c.id, 'RUNNING');
        assert(await settled.countUnsettledChildren(prisma, s.id) === 1, 'expected 1 unsettled');
      });
      await test('D3 IN_PROGRESS + executionStatus FAILED + a PENDING execution → unsettled (F-e, the widening)', async () => {
        const s = await newStage(); const c = await child(s.id, { status: 'IN_PROGRESS', executionStatus: 'FAILED' }); await exec(c.id, 'PENDING');
        assert(await settled.countUnsettledChildren(prisma, s.id) === 1, 'a FAILED child being re-run must be unsettled');
      });
      await test('D4 IN_PROGRESS + executionStatus FAILED, no active execution → settled (FAILED is terminal — the F16 contract)', async () => {
        const s = await newStage(); await child(s.id, { status: 'IN_PROGRESS', executionStatus: 'FAILED' });
        assert(await settled.countUnsettledChildren(prisma, s.id) === 0, 'FAILED must stay terminal');
      });
      await test('D5 OPEN child → unsettled', async () => {
        const s = await newStage(); await child(s.id, { status: 'OPEN' });
        assert(await settled.countUnsettledChildren(prisma, s.id) === 1, 'expected unsettled');
      });
      await test('D6 COMPLETED child with only a SCHEDULED execution → settled, and counted by name', async () => {
        const s = await newStage(); const c = await child(s.id, { status: 'COMPLETED' }); await exec(c.id, 'SCHEDULED');
        assert(await settled.countUnsettledChildren(prisma, s.id) === 0, 'SCHEDULED must not count as in flight');
        assert(await settled.countScheduledChildren(prisma, s.id) === 1, 'the scheduled child must be reported by name');
      });
      await test('D7 resolver: a stage whose only child is COMPLETED with a RUNNING re-run does NOT resolve SYNTHESIZE', async () => {
        const s = await newStage(); const c = await child(s.id, { status: 'COMPLETED' }); await exec(c.id, 'RUNNING');
        const h = await prisma.task.create({ data: { title: 'harness', povId: pov.id, stageId: (await newStage()).id,
          type: 'PIPELINE' as any, metadata: { pipelineStageId: s.id } } });
        const r = await resolveHarnessMode(h.id);
        assert(r.mode !== 'SYNTHESIZE', `resolved ${r.mode} (${r.reasonCode}) while a child is still running`);
      });
      await test('D8 resolver: the same stage once the re-run has settled → SYNTHESIZE (control)', async () => {
        const s = await newStage(); const c = await child(s.id, { status: 'COMPLETED' }); await exec(c.id, 'SUCCESS');
        const h = await prisma.task.create({ data: { title: 'harness', povId: pov.id, stageId: (await newStage()).id,
          type: 'PIPELINE' as any, metadata: { pipelineStageId: s.id } } });
        const r = await resolveHarnessMode(h.id);
        assert(r.mode === 'SYNTHESIZE', `expected SYNTHESIZE, got ${r.mode}`);
      });
      await test('D9 invariant point 3 refuses task.complete while a child has a RUNNING execution (E2)', async () => {
        const s = await newStage(); const c = await child(s.id, { status: 'COMPLETED' }); await exec(c.id, 'RUNNING');
        let err: any = null;
        try { await assertPipelineCompletionInvariant(prisma, { id: 'h', type: 'PIPELINE', metadata: { pipelineStageId: s.id } }); }
        catch (e) { err = e; }
        assert(err?.point === 'non-terminal-children', `expected non-terminal-children, got ${err?.point ?? err}`);
        assert(err?.details?.inFlightChildren === 1, `expected inFlightChildren=1 in details, got ${JSON.stringify(err?.details)}`);
      });
      await test('D10 invariant point 3 passes once settled (the next check, point 4, is what throws — control)', async () => {
        const s = await newStage(); await child(s.id, { status: 'COMPLETED' });
        let err: any = null;
        try { await assertPipelineCompletionInvariant(prisma, { id: 'h', type: 'PIPELINE', metadata: { pipelineStageId: s.id } }); }
        catch (e) { err = e; }
        assert(err && err.point !== 'non-terminal-children', `point 3 should pass on a settled stage, got ${err?.point ?? 'no error'}`);
      });
      await test('D11 X4: a pipeline child is harness-owned; a root harness and an unowned task are not', async () => {
        const childStage = await newStage(); const home = await newStage();
        const c = await child(childStage.id, { status: 'IN_PROGRESS' });
        const h = await prisma.task.create({ data: { title: 'harness', povId: pov.id, stageId: home.id,
          type: 'PIPELINE' as any, metadata: { pipelineStageId: childStage.id } } });
        const loose = await child((await newStage()).id, { status: 'IN_PROGRESS' });
        const owned = await settled.harnessOwnedTaskIds(prisma, [c.id, h.id, loose.id]);
        assert(owned.has(c.id), 'pipeline child must be harness-owned');
        assert(!owned.has(h.id), 'a root harness is not owned by anything');
        assert(!owned.has(loose.id), 'a task in an unowned stage is not harness-owned');
        assert((await settled.harnessOwnedTaskIds(prisma, [])).size === 0, 'empty input ⇒ empty set');
      });

      // ── writeReapedTaskStatuses: one fixture per branch of the rule (reaped-task-persist.ts) ──
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { writeReapedTaskStatuses } = require('../lib/services/reaped-task-persist') as
        typeof import('../lib/services/reaped-task-persist');
      /** A harness owning a fresh child stage; returns that stage. */
      const ownedStage = async () => {
        const s = await newStage();
        await prisma.task.create({ data: { title: `h${n++}`, povId: pov.id, stageId: (await newStage()).id,
          type: 'PIPELINE' as any, metadata: { pipelineStageId: s.id } } });
        return s;
      };
      /** Seed a RUNNING execution, flip it FAILED (the reaper's CAS), then run the task side. */
      const reap = async (taskId: string) => {
        const e = await prisma.agentExecution.create({ data: { taskId, status: 'RUNNING', config: {},
          context: { triggeredBy: { id: owner.id, type: 'user' } }, logs: [] } });
        await prisma.agentExecution.update({ where: { id: e.id }, data: { status: 'FAILED' } });
        return prisma.$transaction((tx) => writeReapedTaskStatuses(tx, [{ executionId: e.id, taskId }], new Date()));
      };
      const es = async (id: string) => (await prisma.task.findUnique({ where: { id }, select: { executionStatus: true } }))!.executionStatus;

      await test('D12 X4: a reaped harness child → FAILED + a comment, and its stage SETTLES (the live hang, closed)', async () => {
        const s = await ownedStage(); const c = await child(s.id, { status: 'IN_PROGRESS', executionStatus: 'RUNNING' });
        const r = await reap(c.id);
        assert(r.decisions[c.id]?.decision === 'failed', JSON.stringify(r.decisions));
        assert(await es(c.id) === 'FAILED', `expected FAILED, got ${await es(c.id)}`);
        assert(await settled.countUnsettledChildren(prisma, s.id) === 0, 'the stage must settle so Guard 4 can wake the harness');
        assert(await prisma.comment.count({ where: { taskId: c.id } }) === 1, 'the FAILED write must say why');
      });
      await test('D13 X4 (F1): a reaped COMPLETED harness child → null, never FAILED (step 1 would abort an approved leg)', async () => {
        const s = await ownedStage(); const c = await child(s.id, { status: 'COMPLETED', executionStatus: 'RUNNING' });
        const r = await reap(c.id);
        assert(r.decisions[c.id]?.decision === 'null' && await es(c.id) === null, `${JSON.stringify(r.decisions)} / ${await es(c.id)}`);
      });
      await test('D14 X4: a reaped task outside any harness → null (unchanged behaviour)', async () => {
        const c = await child((await newStage()).id, { status: 'IN_PROGRESS', executionStatus: 'RUNNING' });
        await reap(c.id);
        assert(await es(c.id) === null, `expected null, got ${await es(c.id)}`);
      });
      await test('D15 X4 (F4): a reaped task with ANOTHER execution in flight is untouched', async () => {
        // BC67 allows ONE active execution per task, so the real shape is: the reaper's CAS flips the old row
        // FAILED, a re-execute inserts a new PENDING row, THEN the reaper's task side runs.
        const s = await ownedStage(); const c = await child(s.id, { status: 'IN_PROGRESS', executionStatus: 'PENDING' });
        const old = await prisma.agentExecution.create({ data: { taskId: c.id, status: 'FAILED', config: {}, context: {}, logs: [] } });
        await exec(c.id, 'PENDING');
        const r = await prisma.$transaction((tx) => writeReapedTaskStatuses(tx, [{ executionId: old.id, taskId: c.id }], new Date()));
        assert(r.decisions[c.id]?.decision === 'untouched-active', JSON.stringify(r.decisions));
        assert(await es(c.id) === 'PENDING', `the live run owns the status; got ${await es(c.id)}`);
      });
      await test('D16 X4 (F2): a reaped LEG harness whose own children are still running → null (they will wake it)', async () => {
        const programStage = await ownedStage(); const legKids = await newStage();
        await child(legKids.id, { status: 'OPEN' });
        const leg = await prisma.task.create({ data: { title: 'leg', povId: pov.id, stageId: programStage.id,
          type: 'PIPELINE' as any, status: 'IN_PROGRESS', metadata: { pipelineStageId: legKids.id } } });
        const r = await reap(leg.id);
        assert(r.decisions[leg.id]?.decision === 'null' && await es(leg.id) === null, `${JSON.stringify(r.decisions)} / ${await es(leg.id)}`);
      });
      await test('D17 X4 (F3a): a reaped PROGRAM LEG with settled children → FAILED + its same-stage cone marked UPSTREAM_REAPED', async () => {
        const programStage = await prisma.stage.create({ data: { name: `Program: t${n++}`, phaseId: phase.id, order: n } });
        await prisma.task.create({ data: { title: 'root', povId: pov.id, stageId: (await newStage()).id,
          type: 'PIPELINE' as any, metadata: { pipelineStageId: programStage.id } } });
        const legKids = await newStage(); await child(legKids.id, { status: 'COMPLETED' });
        const leg = await prisma.task.create({ data: { title: 'leg', povId: pov.id, stageId: programStage.id,
          type: 'PIPELINE' as any, status: 'IN_PROGRESS', metadata: { pipelineStageId: legKids.id } } });
        const nodeC = await child(programStage.id, { status: 'OPEN' });
        await prisma.taskDependency.create({ data: { taskId: nodeC.id, dependsOnId: leg.id } });
        const r = await reap(leg.id);
        assert(await es(leg.id) === 'FAILED', `leg: ${await es(leg.id)}`);
        assert(r.conedTaskIds.includes(nodeC.id) && await es(nodeC.id) === 'FAILED', `cone: ${JSON.stringify(r.conedTaskIds)}`);
        const meta = (await prisma.task.findUnique({ where: { id: nodeC.id }, select: { metadata: true } }))!.metadata as any;
        assert(meta?.blockedByUpstreamFailure?.reasonCode === 'UPSTREAM_REAPED', JSON.stringify(meta));
        assert(await settled.countUnsettledChildren(prisma, programStage.id) === 0, 'the program stage must settle');
      });
      await test('D18 X4 RESIDUAL (pinned, not fixed): a reaped pipeline Author with a dependent Reviewer → Author FAILED, Reviewer left OPEN', async () => {
        const s = await ownedStage();
        const author = await child(s.id, { status: 'IN_PROGRESS', executionStatus: 'RUNNING' });
        const reviewer = await child(s.id, { status: 'OPEN' });
        await prisma.taskDependency.create({ data: { taskId: reviewer.id, dependsOnId: author.id } });
        const r = await reap(author.id);
        assert(await es(author.id) === 'FAILED', 'author FAILED');
        assert(r.conedTaskIds.length === 0 && await es(reviewer.id) === null,
          'pipeline children are NOT cone-marked (same as an ordinary failure; keeps the re-execute cascade)');
        assert(await settled.countUnsettledChildren(prisma, s.id) === 1,
          'the residual: the stage stays unsettled until a human re-executes the Author — change this pin only with the policy');
      });
    } finally {
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
