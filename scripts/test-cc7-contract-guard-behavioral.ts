/**
 * F11/F12 behavioral proof (dev DB, no LLM):
 * A3 (router double-nest hoist) — via the router path — lands the contract.
 * Requires dev DB + TEST_POV_ID. Run: npx ts-node -r tsconfig-paths/register --transpile-only scripts/test-cc7-contract-guard-behavioral.ts
 * B1 (structural loud-fail) — a program pipeline child with NO contract THROWS at prepare,
 *    even with no requiresInterfaceContract flag; a NON-program pipeline child does NOT.
 */
import { PrismaClient } from '@prisma/client';
import { TasksActionRouter } from '../lib/mcp/tasks/action/tasks-action-router';
import { prepareTaskForExecution } from '../lib/agents/harness/prepare-task-for-execution';

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); ok ? pass++ : fail++; };

async function main() {
  const povId = process.env.TEST_POV_ID!;
  const user = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true, role: true } });
  const token: any = { userId: user!.id, email: user!.email, name: user!.name ?? 'F12', role: user!.role };
  const phase = await prisma.phase.findFirst({ where: { povId }, select: { id: true } });
  const stage = await prisma.stage.findFirst({ where: { phaseId: phase!.id }, select: { id: true } });
  const progTmpl = await prisma.agentTemplate.findFirst({ where: { name: 'Pipeline Harness' }, select: { id: true } });
  const cleanup: { tasks: string[]; stages: string[] } = { tasks: [], stages: [] };

  try {
    const contract = { asn: 65001, vlans: [100, 200], subnets: ['10.9.0.0/24'] };

    // A3: create via the ROUTER with the DOUBLE-NESTED contract shape (the harness bug)
    const router = new TasksActionRouter();
    const res: any = await router.route('task.create', {
      povId, phaseId: phase!.id, stageId: stage!.id, title: 'F12 A3 double-nest probe', description: 'F12', type: 'ACTION',
      parameters: { interfaceContract: contract },   // <-- double-nested, the F11 shape
    }, token, 'f12-a3');
    const a3id = res?.result?.task?.id ?? res?.task?.id;
    cleanup.tasks.push(a3id);
    const row = await prisma.task.findUnique({ where: { id: a3id }, select: { inputContext: true, metadata: true } });
    const ic = (row?.inputContext as any)?.interfaceContract;
    check('A3.1 router hoisted double-nested interfaceContract → persisted', ic?.asn === 65001 && ic?.subnets?.[0] === '10.9.0.0/24');
    check('A3.2 requiresInterfaceContract flag set from the hoisted value', (row?.metadata as any)?.requiresInterfaceContract === true);

    // B1: a PROGRAM stage owned by a pov-program-protocol parent harness
    const progStage = await prisma.stage.create({ data: { phaseId: phase!.id, name: `F12 program stage ${Date.now()%100000}`, order: 9998, status: 'PENDING' }, select: { id: true } });
    cleanup.stages.push(progStage.id);
    const progParent = await prisma.task.create({ data: { title: 'F12 program harness (protocol: pov-program)', description: 'F12', type: 'PIPELINE', status: 'IN_PROGRESS', pov: { connect: { id: povId } }, phase: { connect: { id: phase!.id } }, stage: { connect: { id: stage!.id } }, agentTemplate: { connect: { id: progTmpl!.id } }, metadata: { pipelineStageId: progStage.id } } as any, select: { id: true } });
    cleanup.tasks.push(progParent.id);

    // child pipeline in that program stage, NO contract, NO flag (the F11/F12 drop)
    const childNoIC = await prisma.task.create({ data: { title: 'F12 program pipeline child (no contract)', description: 'F12', type: 'PIPELINE', status: 'OPEN', pov: { connect: { id: povId } }, phase: { connect: { id: phase!.id } }, stage: { connect: { id: progStage.id } } } as any, select: { id: true } });
    cleanup.tasks.push(childNoIC.id);
    let threw = '';
    try { await prepareTaskForExecution(childNoIC.id); } catch (e: any) { threw = e?.message ?? String(e); }
    check('B1.1 program pipeline child w/ NO contract + NO flag → THROWS (structural arm)', threw.includes('INTERFACE_CONTRACT_MISSING'), threw.slice(0, 70));
    check('B1.2 error names the structural reason', threw.includes('structurally required'));

    // control: a NON-program pipeline child (parent template has no pov-program protocol) → must NOT throw
    const plainStage = await prisma.stage.create({ data: { phaseId: phase!.id, name: `F12 plain stage ${Date.now()%100000}`, order: 9997, status: 'PENDING' }, select: { id: true } });
    cleanup.stages.push(plainStage.id);
    const plainChild = await prisma.task.create({ data: { title: 'F12 standalone pipeline child', description: 'F12', type: 'PIPELINE', status: 'OPEN', pov: { connect: { id: povId } }, phase: { connect: { id: phase!.id } }, stage: { connect: { id: plainStage.id } } } as any, select: { id: true } });
    cleanup.tasks.push(plainChild.id);
    let threw2 = '';
    try { await prepareTaskForExecution(plainChild.id); } catch (e: any) { threw2 = e?.message ?? String(e); }
    check('B1.3 NON-program pipeline child (no program parent) → does NOT throw (false-positive guard)', !threw2.includes('INTERFACE_CONTRACT_MISSING'), threw2 ? threw2.slice(0,50) : 'no throw');
  } finally {
    await prisma.taskDependency.deleteMany({ where: { OR: [{ taskId: { in: cleanup.tasks } }, { dependsOnId: { in: cleanup.tasks } }] } }).catch(() => {});
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.comment.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.task.deleteMany({ where: { id: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.stage.deleteMany({ where: { id: { in: cleanup.stages } } }).catch(() => {});
    console.log('cleanup done');
  }
  console.log(`\nF11/F12 behavioral: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('F12 script error:', e); prisma.$disconnect(); process.exit(1); });
