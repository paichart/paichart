/**
 * DN1 behavioral proof (dev DB, no LLM) — the agent-stamped cannotRun consumer on a NON-PIPELINE harness child.
 * Run (dev DB + TEST_POV_ID; source .env first):
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/test-agent-stamped-cannot-run-behavioral.ts
 *
 * Reproduces the 2026-10-04 shape: a program root whose child stage holds a superseded duplicate Node C (a
 * template-less ACTION stamped `cannotRun: 'superseded: …'`). Before DN1 the stamp was never consumed (the
 * consumer was PIPELINE-only), the stage never settled and program SYNTHESIZE could not resolve.
 *
 * Drives the effector the task.update handler calls (handleAgentStampedCannotRun — the handler's call shape is
 * pinned by test-agent-stamped-cannot-run-scope.ts S4). Asserts:
 *   1. a NON-PIPELINE task OUTSIDE any harness is untouched (out of scope)
 *   2. a harness child with a RUNNING execution is untouched (never flipped in flight)
 *   3. a PIPELINE child is still terminalized (unchanged FIX-A behaviour)
 *   4. the superseded duplicate: executionStatus FAILED, status OPEN, agent stamp preserved, one comment,
 *      its forward cone marked FAILED + blockedByUpstreamFailure
 *   5. the child stage is SETTLED by the shared predicate (countUnsettledChildren = 0)
 *   6. exactly ONE program SYNTHESIZE retrigger queued
 *   7. fixpoint: a second consume writes nothing
 */
import { PrismaClient } from '@prisma/client';
import { handleAgentStampedCannotRun } from '../lib/services/task-can-never-run-persist';
import { countUnsettledChildren } from '../lib/services/child-stage-settled';

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); ok ? pass++ : fail++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const povId = process.env.TEST_POV_ID!;
  const user = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  const phase = await prisma.phase.findFirst({ where: { povId }, select: { id: true } });
  const parentStage = await prisma.stage.findFirst({ where: { phaseId: phase!.id }, select: { id: true } });
  const tmpl = await prisma.agentTemplate.findFirst({ where: { name: 'Pipeline Harness' }, select: { id: true } });
  const cleanup: { tasks: string[]; stages: string[] } = { tasks: [], stages: [] };

  // the task.update merge that precedes the effector: write the agent's stamp, then consume it
  const stampAndConsume = async (id: string, type: string, text: string) => {
    const row = await prisma.task.findUnique({ where: { id }, select: { metadata: true } });
    await prisma.task.update({ where: { id }, data: { metadata: { ...((row?.metadata as any) ?? {}), cannotRun: text } } });
    await handleAgentStampedCannotRun(id, text, user!.id, type);
  };

  try {
    const progParent = await prisma.task.create({ data: {
      title: 'DN1 program harness (protocol: pov-program)', description: 'DN1', type: 'PIPELINE', status: 'IN_PROGRESS',
      pov: { connect: { id: povId } }, phase: { connect: { id: phase!.id } }, stage: { connect: { id: parentStage!.id } },
      agentTemplate: { connect: { id: tmpl!.id } },
    } as any, select: { id: true } });
    cleanup.tasks.push(progParent.id);
    const progStage = await prisma.stage.create({ data: {
      phaseId: phase!.id, name: `DN1 program stage ${Date.now() % 100000}`, order: 9995, status: 'PENDING',
      metadata: { harnessTaskId: progParent.id },
    } as any, select: { id: true } });
    cleanup.stages.push(progStage.id);
    await prisma.task.update({ where: { id: progParent.id }, data: { metadata: { pipelineStageId: progStage.id } } });
    const old = new Date(Date.now() - 120_000); // prior PLAN-SPAWN stand-in, outside the retrigger debounce
    await prisma.agentExecution.create({ data: {
      taskId: progParent.id, agentTemplateId: tmpl!.id, status: 'SUCCESS', config: {},
      context: { triggeredBy: { id: user!.id, source: 'mcp-direct' } } as any,
      logs: [], createdAt: old, updatedAt: old, startTime: old, endTime: old,
    } });

    const mk = async (title: string, type: string, status: string, withTmpl: boolean, stageId: string, deps: string[] = []) => {
      const t = await prisma.task.create({ data: {
        title, description: 'DN1', type, status,
        pov: { connect: { id: povId } }, phase: { connect: { id: phase!.id } }, stage: { connect: { id: stageId } },
        ...(withTmpl ? { agentTemplate: { connect: { id: tmpl!.id } } } : {}),
      } as any, select: { id: true } });
      cleanup.tasks.push(t.id);
      for (const d of deps) await prisma.taskDependency.create({ data: { taskId: t.id, dependsOnId: d } });
      return t.id;
    };
    const legDone  = await mk('DN1 leg (done)', 'PIPELINE', 'COMPLETED', true, progStage.id);
    await prisma.task.update({ where: { id: legDone }, data: { executionStatus: 'SUCCESS' } });
    const pipeKid  = await mk('DN1 superseded PIPELINE leg', 'PIPELINE', 'OPEN', true, progStage.id);
    const dup      = await mk('DN1 superseded duplicate Node C (template-less)', 'ACTION', 'OPEN', false, progStage.id);
    const dupDep   = await mk('DN1 gate downstream of the duplicate', 'ACTION', 'OPEN', false, progStage.id, [dup]);
    const inflight = await mk('DN1 in-flight child', 'ACTION', 'IN_PROGRESS', true, progStage.id);
    await prisma.task.update({ where: { id: inflight }, data: { executionStatus: 'RUNNING' } });
    const runExec = await prisma.agentExecution.create({ data: {
      taskId: inflight, agentTemplateId: tmpl!.id, status: 'RUNNING', config: {},
      context: { triggeredBy: { id: user!.id, source: 'mcp-direct' } } as any, logs: [], startTime: new Date(),
    } , select: { id: true } });
    const outsider = await mk('DN1 ordinary POV task (no harness)', 'ACTION', 'OPEN', false, parentStage!.id);

    // 1. out of scope
    await stampAndConsume(outsider, 'ACTION', 'superseded: test');
    const o = await prisma.task.findUnique({ where: { id: outsider }, select: { executionStatus: true, status: true } });
    const oc = await prisma.comment.count({ where: { taskId: outsider } });
    check('1. non-PIPELINE task outside any harness: untouched', o?.executionStatus === null && o.status === 'OPEN' && oc === 0,
      `${o?.status}/${o?.executionStatus}/comments:${oc}`);

    // 2. in flight
    await stampAndConsume(inflight, 'ACTION', 'superseded: test');
    const f = await prisma.task.findUnique({ where: { id: inflight }, select: { executionStatus: true, status: true } });
    check('2. harness child with a RUNNING execution: untouched', f?.executionStatus === 'RUNNING' && f.status === 'IN_PROGRESS',
      `${f?.status}/${f?.executionStatus}`);

    // 3. PIPELINE child — unchanged FIX-A behaviour
    await stampAndConsume(pipeKid, 'PIPELINE', 'superseded: recreated as a fresh leg');
    const p = await prisma.task.findUnique({ where: { id: pipeKid }, select: { executionStatus: true, status: true } });
    check('3. PIPELINE child still terminalized (FAILED, status OPEN)', p?.executionStatus === 'FAILED' && p.status === 'OPEN',
      `${p?.status}/${p?.executionStatus}`);

    // the in-flight child's own terminal persist settles it (simulated)
    await prisma.agentExecution.update({ where: { id: runExec.id }, data: { status: 'SUCCESS', endTime: new Date() } });
    await prisma.task.update({ where: { id: inflight }, data: { status: 'COMPLETED', executionStatus: 'SUCCESS' } });
    await sleep(2500); // let step 3's retrigger (declined: stage unsettled then) drain
    const pendingBefore = await prisma.agentExecution.count({ where: { taskId: progParent.id, status: 'PENDING' } });

    // 4. the DN1 shape
    const stamp = 'superseded: recreated as a fresh Node C task with interfaceContract attached';
    await stampAndConsume(dup, 'ACTION', stamp);
    const d = await prisma.task.findUnique({ where: { id: dup }, select: { executionStatus: true, status: true, metadata: true } });
    check('4a. duplicate: executionStatus FAILED, status stays OPEN', d?.executionStatus === 'FAILED' && d.status === 'OPEN',
      `${d?.status}/${d?.executionStatus}`);
    check('4b. the agent\'s own stamp text is preserved + cannotRunPersistedAt written',
      (d?.metadata as any)?.cannotRun === stamp && !!(d?.metadata as any)?.cannotRunPersistedAt);
    const dc = await prisma.comment.count({ where: { taskId: dup, text: { contains: 'can never run' } } });
    check('4c. one refusal comment', dc === 1, `count:${dc}`);
    const dd = await prisma.task.findUnique({ where: { id: dupDep }, select: { executionStatus: true, metadata: true } });
    check('4d. forward cone: downstream gate FAILED + blockedByUpstreamFailure(→duplicate)',
      dd?.executionStatus === 'FAILED' && (dd?.metadata as any)?.blockedByUpstreamFailure?.failedDependencyTaskId === dup,
      `${dd?.executionStatus}`);

    // 5. settled
    const unsettled = await countUnsettledChildren(prisma, progStage.id);
    check('5. child stage SETTLED by the shared predicate', unsettled === 0, `unsettled:${unsettled}`);

    // 6. retrigger
    await sleep(2500);
    const pending = await prisma.agentExecution.findMany({ where: { taskId: progParent.id, status: 'PENDING' }, select: { config: true } });
    check('6. exactly ONE program SYNTHESIZE retrigger queued by the duplicate\'s consume',
      pendingBefore === 0 && pending.length === 1 && (pending[0]?.config as any)?.autoRetrigger === true,
      `before:${pendingBefore} after:${pending.length}`);

    // 7. fixpoint
    await handleAgentStampedCannotRun(dup, stamp, user!.id, 'ACTION');
    await sleep(1500);
    const dc2 = await prisma.comment.count({ where: { taskId: dup } });
    const pending2 = await prisma.agentExecution.count({ where: { taskId: progParent.id, status: 'PENDING' } });
    check('7. second consume is a fixpoint (no dup comment, no dup retrigger)', dc2 === 1 && pending2 === 1,
      `comments:${dc2} pending:${pending2}`);
  } finally {
    await prisma.taskDependency.deleteMany({ where: { OR: [{ taskId: { in: cleanup.tasks } }, { dependsOnId: { in: cleanup.tasks } }] } }).catch(() => {});
    await prisma.agentExecution.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.comment.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.task.deleteMany({ where: { id: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.stage.deleteMany({ where: { id: { in: cleanup.stages } } }).catch(() => {});
    console.log('cleanup done');
  }
  console.log(`\nDN1 agent-stamped cannotRun behavioral: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('DN1 script error:', e); prisma.$disconnect(); process.exit(1); });
