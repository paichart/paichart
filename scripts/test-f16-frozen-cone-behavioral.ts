/**
 * F16 frozen-cone behavioral proof (dev DB, no LLM) — mirrors the finding-9 /
 * CC7-behavioral shape. Run:
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/test-f16-frozen-cone-behavioral.ts
 * Requires dev DB + TEST_POV_ID (auto-loaded from .env).
 *
 * Reproduces the T4b' topology (program cmrm6an89006wyxcyokapxks8, 2026-07-15):
 *   plan-gate(COMPLETED) → { network leg (COMPLETED), terraform leg (no contract) }
 *   → downstream gate (template-less, OPEN) → producer → Node C
 * and drives the refused queue attempt through the REAL chokepoint
 * (createAgentExecution → prepareTaskForExecution CC7 throw → handleCanNeverRunTask).
 *
 * Asserts the full F16 fix:
 *   1. the refusal is the typed CanNeverRunError (CAN_NEVER_RUN)
 *   2. leg: executionStatus=FAILED, execs:0, metadata.cannotRun, comment (F13)
 *   3. forward cone (downstream gate + producer + Node C): executionStatus=FAILED +
 *      metadata.blockedByUpstreamFailure + comment — INCLUDING the template-less
 *      downstream gate (v1.0.2 multi-gate topologies re-hang without this)
 *   4. the UPSTREAM plan gate + COMPLETED sibling leg are untouched (D4 protection
 *      is the walk's forward direction)
 *   5. exactly ONE program retrigger queued (PENDING, autoRetrigger config)
 *   6. idempotency/fixpoint: a second refusal writes nothing (no dup comments/executions)
 *
 * @see cline_docs/reviews/f16-frozen-cone-2026-07-16/synthesis.md
 */
import { PrismaClient } from '@prisma/client';
import { createAgentExecution } from '../lib/services/agent-execution-create';
import { CanNeverRunError } from '../lib/errors';

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

  try {
    // ── fixture: program parent + child stage (back-pointer set for Guard 3.5) ──
    const progParent = await prisma.task.create({ data: {
      title: 'F16 program harness (protocol: pov-program)', description: 'F16', type: 'PIPELINE', status: 'IN_PROGRESS',
      pov: { connect: { id: povId } }, phase: { connect: { id: phase!.id } }, stage: { connect: { id: parentStage!.id } },
      agentTemplate: { connect: { id: tmpl!.id } },
    } as any, select: { id: true } });
    cleanup.tasks.push(progParent.id);
    const progStage = await prisma.stage.create({ data: {
      phaseId: phase!.id, name: `F16 program stage ${Date.now() % 100000}`, order: 9996, status: 'PENDING',
      metadata: { harnessTaskId: progParent.id },
    } as any, select: { id: true } });
    cleanup.stages.push(progStage.id);
    await prisma.task.update({ where: { id: progParent.id }, data: { metadata: { pipelineStageId: progStage.id } } });

    // prior program execution (PLAN-SPAWN stand-in): valid triggeredBy, outside the 30s debounce
    const old = new Date(Date.now() - 120_000);
    await prisma.agentExecution.create({ data: {
      taskId: progParent.id, agentTemplateId: tmpl!.id, status: 'SUCCESS', config: {},
      context: { triggeredBy: { id: user!.id, source: 'mcp-direct' } } as any,
      logs: [], createdAt: old, updatedAt: old, startTime: old, endTime: old,
    } });

    // ── children ──
    const mk = async (title: string, type: string, status: string, withTmpl: boolean, deps: string[] = []) => {
      const t = await prisma.task.create({ data: {
        title, description: 'F16', type, status,
        pov: { connect: { id: povId } }, phase: { connect: { id: phase!.id } }, stage: { connect: { id: progStage.id } },
        ...(withTmpl ? { agentTemplate: { connect: { id: tmpl!.id } } } : {}),
      } as any, select: { id: true } });
      cleanup.tasks.push(t.id);
      for (const d of deps) await prisma.taskDependency.create({ data: { taskId: t.id, dependsOnId: d } });
      return t.id;
    };
    const planGate = await mk('F16 plan gate (upstream, released)', 'ACTION', 'COMPLETED', false);
    const network  = await mk('F16 network leg', 'PIPELINE', 'COMPLETED', true, [planGate]);
    const leg      = await mk('F16 terraform leg (no contract)', 'PIPELINE', 'OPEN', true, [planGate]);
    const downGate = await mk('F16 downstream gate (template-less, in cone)', 'ACTION', 'OPEN', false, [leg]);
    const producer = await mk('F16 producer', 'ACTION', 'OPEN', true, [network, downGate]);
    const nodeC    = await mk('F16 Node C', 'ACTION', 'OPEN', true, [producer]);
    await prisma.task.update({ where: { id: network }, data: { executionStatus: 'SUCCESS' } });

    // ── drive the refused queue attempt through the REAL chokepoint ──
    let caught: any = null;
    try {
      await createAgentExecution({
        taskId: leg, agentTemplateId: tmpl!.id, status: 'PENDING', config: {},
        triggeredBy: { id: user!.id, source: 'reactor-task-ready' },
      });
    } catch (e) { caught = e; }

    check('1. refusal is the typed CanNeverRunError', caught instanceof CanNeverRunError && caught.code === 'CAN_NEVER_RUN',
      caught ? `${caught.name}/${caught.code}` : 'no throw');

    const legRow = await prisma.task.findUnique({ where: { id: leg }, select: { executionStatus: true, status: true, metadata: true, _count: { select: { executions: true } } } });
    check('2a. leg executionStatus=FAILED, status stays OPEN, execs:0',
      legRow?.executionStatus === 'FAILED' && legRow.status === 'OPEN' && legRow._count.executions === 0,
      `${legRow?.status}/${legRow?.executionStatus}/execs:${legRow?._count.executions}`);
    check('2b. leg metadata.cannotRun stamped', !!(legRow?.metadata as any)?.cannotRun);
    const legComments = await prisma.comment.count({ where: { taskId: leg, text: { contains: 'can never run' } } });
    check('2c. leg refusal comment posted (F13)', legComments === 1, `count:${legComments}`);

    for (const [name, id] of [['downstream gate', downGate], ['producer', producer], ['Node C', nodeC]] as const) {
      const row = await prisma.task.findUnique({ where: { id }, select: { executionStatus: true, metadata: true } });
      const meta = (row?.metadata as any)?.blockedByUpstreamFailure;
      check(`3. cone: ${name} FAILED + blockedByUpstreamFailure(→leg)`,
        row?.executionStatus === 'FAILED' && meta?.failedDependencyTaskId === leg,
        `${row?.executionStatus}/${JSON.stringify(meta)?.slice(0, 60)}`);
    }

    const upGateRow = await prisma.task.findUnique({ where: { id: planGate }, select: { executionStatus: true, status: true } });
    check('4a. UPSTREAM plan gate untouched', upGateRow?.status === 'COMPLETED' && upGateRow.executionStatus === null,
      `${upGateRow?.status}/${upGateRow?.executionStatus}`);
    const netRow = await prisma.task.findUnique({ where: { id: network }, select: { executionStatus: true, status: true } });
    check('4b. COMPLETED sibling leg untouched', netRow?.status === 'COMPLETED' && netRow.executionStatus === 'SUCCESS');

    await sleep(2000); // retrigger is post-commit fire-and-forget
    const progExecs = await prisma.agentExecution.findMany({ where: { taskId: progParent.id, status: 'PENDING' }, select: { id: true, config: true } });
    check('5. exactly ONE program SYNTHESIZE retrigger queued', progExecs.length === 1 && (progExecs[0]?.config as any)?.autoRetrigger === true,
      `pending:${progExecs.length}`);

    // ── 6. idempotency / fixpoint: second refusal writes nothing ──
    let caught2: any = null;
    try {
      await createAgentExecution({
        taskId: leg, agentTemplateId: tmpl!.id, status: 'PENDING', config: {},
        triggeredBy: { id: user!.id, source: 'reactor-task-ready' },
      });
    } catch (e) { caught2 = e; }
    await sleep(1500);
    const legComments2 = await prisma.comment.count({ where: { taskId: leg } });
    const progExecs2 = await prisma.agentExecution.count({ where: { taskId: progParent.id, status: 'PENDING' } });
    check('6. second refusal is a fixpoint (throws, no dup comment, no dup retrigger)',
      caught2 instanceof CanNeverRunError && legComments2 === 1 && progExecs2 === 1,
      `comments:${legComments2} pending:${progExecs2}`);
  } finally {
    await prisma.taskDependency.deleteMany({ where: { OR: [{ taskId: { in: cleanup.tasks } }, { dependsOnId: { in: cleanup.tasks } }] } }).catch(() => {});
    await prisma.agentExecution.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.comment.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.task.deleteMany({ where: { id: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.stage.deleteMany({ where: { id: { in: cleanup.stages } } }).catch(() => {});
    console.log('cleanup done');
  }
  console.log(`\nF16 frozen-cone behavioral: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('F16 script error:', e); prisma.$disconnect(); process.exit(1); });
