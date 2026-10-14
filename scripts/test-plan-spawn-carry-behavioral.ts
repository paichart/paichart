/**
 * C2-a + C3-a behavioral proof on REAL Postgres (dev DB, no LLM) — the local control v2 §5.2 (BC-M5) asks
 * for: every new SQL statement runs on real Postgres before push. Extra proof, not the CI guard (the CI
 * guards are scripts/test-plan-spawn-carry.ts, test-cc7-contract-guard.ts, test-task-input-context-merge.ts).
 *
 * Requires dev DB + TEST_POV_ID. Run: npm run test:plan-spawn-carry-behavioral
 *
 * Fixture (built in a FRESH phase, removed in `finally`):
 *   phase ─ stage "Pipeline: c23 prior"  (created FIRST)
 *         ─ stage "Program: c23"         (the program stage: Architect, legs, Node C …)
 *         ─ stage "Pipeline: c23 after"  (created AFTER the program stage — must NOT be carried)
 *         ─ stage "c23 root stage"       (the program root lives here)
 *   root  PIPELINE "(protocol: pov-program)", metadata.pipelineStageId = program stage,
 *         duplicateAcknowledged = "<prior id>, <root stage id>"  (a comma-joined cuid string)
 *   Architect (Program Architect template) with a SUCCESS execution whose result.json carries the plan.
 *   A second program (re-run Architect after PLAN-SPAWN) for the Q5 path and the QS6 (ii) REPAIR child.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { TasksActionRouter } from '../lib/mcp/tasks/action/tasks-action-router';
import { prepareTaskForExecution } from '../lib/agents/harness/prepare-task-for-execution';
import { writeInterfaceContractIfAbsent } from '../lib/tasks/services/inputContext';
import { canonicalContractSha, carryProgramClearance } from '../lib/agents/harness/plan-spawn-carry';

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => {
  console.log(`${ok ? '✅' : '❌'} ${n}${!ok && d !== undefined ? ' — ' + JSON.stringify(d) : ''}`);
  if (ok) pass++; else fail++;
};
const FENCE = '`'.repeat(3);
const planText = (c: unknown) => `## Interface Contract\n\n${FENCE}json\n${JSON.stringify(c, null, 2)}\n${FENCE}\n\n## Intent\n\nx\n`;
const meta = async (id: string) => ((await prisma.task.findUnique({ where: { id }, select: { metadata: true } }))?.metadata ?? {}) as any;
const ic = async (id: string) => ((await prisma.task.findUnique({ where: { id }, select: { inputContext: true } }))?.inputContext ?? null) as any;

async function main() {
  const povId = process.env.TEST_POV_ID!;
  const user = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true, role: true } });
  const token: any = { userId: user!.id, email: user!.email, name: user!.name ?? 'C23', role: user!.role };
  const harnessTmpl = await prisma.agentTemplate.findFirst({ where: { name: 'Pipeline Harness' }, select: { id: true } });
  const archTmpl = await prisma.agentTemplate.findFirst({ where: { name: 'Program Architect' }, select: { id: true } });
  // Promotion E (TS-L2): pov-program's Node C is the unbound `Program Integration Reviewer` row (E1) — looked up FIRST by
  // EXACT name; the retired value-chain Node C row and any change_reviewer row remain only as fallbacks for a dev DB
  // seeded before E1.
  const reviewerTmpl = await prisma.agentTemplate.findFirst({ where: { name: 'Program Integration Reviewer' }, select: { id: true } })
    ?? await prisma.agentTemplate.findFirst({ where: { name: 'Value-Chain Program Integration Reviewer' }, select: { id: true } })
    ?? await prisma.agentTemplate.findFirst({ where: { templateType: 'REVIEWER', defaultRole: 'change_reviewer' }, select: { id: true } });
  const qaTmpl = await prisma.agentTemplate.findFirst({ where: { templateType: 'REVIEWER', defaultRole: 'qa_test_engineer' }, select: { id: true } });
  const writerTmpl = await prisma.agentTemplate.findFirst({ where: { templateType: 'DOCUMENTER' }, select: { id: true } });
  if (!archTmpl || !reviewerTmpl || !harnessTmpl) throw new Error('dev DB lacks the program templates (seed-program-templates / seed-value-chain-templates)');

  const tag = `c23-${Date.now() % 1_000_000}`;
  const cleanup = { tasks: [] as string[], stages: [] as string[], phases: [] as string[] };
  const router = new TasksActionRouter();
  try {
    const phase = await prisma.phase.create({ data: { povId, name: `${tag} phase`, description: 'C2/C3 fixture', startDate: new Date(), endDate: new Date(), order: 9990 } as any, select: { id: true } });
    cleanup.phases.push(phase.id);
    const mkStage = async (name: string, at: number) => {
      const s = await prisma.stage.create({ data: { phaseId: phase.id, name, order: at, status: 'PENDING', createdAt: new Date(Date.now() - 100_000 + at) } as any, select: { id: true } });
      cleanup.stages.push(s.id); return s.id;
    };
    const prior = await mkStage(`Pipeline: ${tag} prior`, 1);
    const prog = await mkStage(`Program: ${tag}`, 2);
    const after = await mkStage(`Pipeline: ${tag} after`, 3);
    const rootStage = await mkStage(`${tag} root stage`, 4);
    const prog2 = await mkStage(`Program: ${tag} two`, 5);

    const mkTask = async (data: Record<string, unknown>) => {
      const t = await prisma.task.create({ data: { description: 'C23', status: 'OPEN', pov: { connect: { id: povId } }, phase: { connect: { id: phase.id } }, ...data } as any, select: { id: true } });
      cleanup.tasks.push(t.id); return t.id;
    };
    const root = await mkTask({ title: `${tag} root (protocol: pov-program)`, type: 'PIPELINE', stage: { connect: { id: rootStage } },
      agentTemplate: { connect: { id: harnessTmpl.id } }, metadata: { pipelineStageId: prog, duplicateAcknowledged: `${prior}, ${rootStage}` } });
    const root2 = await mkTask({ title: `${tag} root two (protocol: pov-program)`, type: 'PIPELINE', stage: { connect: { id: rootStage } },
      agentTemplate: { connect: { id: harnessTmpl.id } }, metadata: { pipelineStageId: prog2 } });
    void root2;

    const PLAN = { asn: 65001, subnets: ['10.9.0.0/24'], naming: { prefix: 'edge', 'a/b': 'x~y' } };
    const PARA = { asn: 65001, subnets: ['10.9.0.0/24'] };
    const mkArchitect = async (stageId: string, title: string) => mkTask({ title, type: 'ACTION', stage: { connect: { id: stageId } }, agentTemplate: { connect: { id: archTmpl.id } }, agentRole: 'program_architect' });
    const addExec = async (taskId: string, finalResponse: string, ageMs: number) => {
      const e = await prisma.agentExecution.create({ data: { taskId, status: 'SUCCESS', config: {}, context: {}, startTime: new Date(Date.now() - ageMs), createdAt: new Date(Date.now() - ageMs) } as any, select: { id: true } });
      await prisma.agentArtifact.create({ data: { executionId: e.id, name: 'result.json', type: 'json', content: JSON.stringify({ finalResponse }) } });
      return e.id;
    };
    const arch = await mkArchitect(prog, `${tag} architect`);
    const archExec = await addExec(arch, planText(PLAN), 50_000);
    const planSha = canonicalContractSha(PLAN);

    // ── C2-a create site ───────────────────────────────────────────────────────────────────────
    const create = async (title: string, type: string, stageId: string, interfaceContract?: unknown) => router.route('task.create', {
      povId, phaseId: phase.id, stageId, title, description: 'C23 child', type, ...(interfaceContract ? { interfaceContract } : {}),
    }, token, `c23-${title}`) as any;
    const r1 = await create(`${tag} leg one (protocol: network-provisioning)`, 'PIPELINE', prog, PARA);
    const leg1 = r1?.result?.task?.id; cleanup.tasks.push(leg1);
    const m1 = await meta(leg1);
    check('C2 create: a PARAPHRASED supply stores the PLAN', canonicalContractSha((await ic(leg1))?.interfaceContract) === planSha, (await ic(leg1))?.interfaceContract);
    check('C2 create: fact source plan, suppliedMatched false, the dropped key named', m1.interfaceContractSource?.source === 'plan'
      && m1.interfaceContractSource?.suppliedMatched === false && JSON.stringify(m1.interfaceContractSource?.suppliedDiffPaths) === '["/naming"]', m1.interfaceContractSource);
    check('C2 create: storedAtWriteSha256 = planSha256 = canonical(live); architect ids recorded', m1.interfaceContractSource?.storedAtWriteSha256 === planSha
      && m1.interfaceContractSource?.planSha256 === planSha && m1.interfaceContractSource?.architectTaskId === arch && m1.interfaceContractSource?.architectExecutionId === archExec);
    check('C2 create: requiresInterfaceContract still set', m1.requiresInterfaceContract === true);
    check('C2 create: the task.create RESULT carries neither the fact nor the plan-only key (PC-F1)',
      !JSON.stringify(r1).includes('interfaceContractSource') && !JSON.stringify(r1).includes('naming') && r1?.result?.created === true);

    const r2 = await create(`${tag} leg two (protocol: network-provisioning)`, 'PIPELINE', prog, PLAN);
    const leg2 = r2?.result?.task?.id; cleanup.tasks.push(leg2);
    const m2 = await meta(leg2);
    check('C2 create: an exact supply → suppliedMatched true, legBaseline equalsPlan true', m2.interfaceContractSource?.suppliedMatched === true
      && m2.interfaceContractSource?.legBaseline?.equalsPlan === true, m2.interfaceContractSource);

    const rDup = await create(`${tag} leg one (protocol: network-provisioning)`, 'PIPELINE', prog, PARA);
    check('C2 create: duplicate title → existing row returned, nothing written, no fact in the result',
      rDup?.result?.created === false && rDup?.result?.task?.id === leg1 && !JSON.stringify(rDup).includes('interfaceContractSource'));

    const plainStage = await mkStage(`${tag} plain`, 6);
    const rPlain = await create(`${tag} standalone child`, 'ACTION', plainStage, PARA);
    const plainId = rPlain?.result?.task?.id; cleanup.tasks.push(plainId);
    check('C2 create: NOT a program stage → supplied stored, NO key', JSON.stringify((await ic(plainId))?.interfaceContract) === JSON.stringify(PARA)
      && !('interfaceContractSource' in (await meta(plainId))));

    // ── C2-a reviewer arm ──────────────────────────────────────────────────────────────────────
    const nodeC = await mkTask({ title: `${tag} Node C`, type: 'ACTION', stage: { connect: { id: prog } }, agentTemplate: { connect: { id: reviewerTmpl.id } }, agentRole: 'change_reviewer' });
    const ctx = await prepareTaskForExecution(nodeC);
    const nm = await meta(nodeC); const nic = await ic(nodeC);
    check('C2 inherit: a contract-less Node C inherits the PLAN (every leg holds it)', canonicalContractSha(nic?.interfaceContract) === planSha, nic);
    check('C2 inherit: inputContext carries exactly the three existing keys (+ any chain keys)', nic?.interfaceContractInheritedFrom === arch && typeof nic?.interfaceContractInheritedAt === 'string');
    check('C2 inherit: fact source plan-inherited stamped by the winning write', nm.interfaceContractSource?.source === 'plan-inherited' && nm.interfaceContractSource?.arm === 'inherit', nm.interfaceContractSource);
    check("C2 inherit (D4′): a dep-free reviewer's RETURNED context holds the contract", !!(ctx as any)?.interfaceContract);
    const before = (await prisma.task.findUnique({ where: { id: nodeC }, select: { updatedAt: true } }))!.updatedAt;
    await prepareTaskForExecution(nodeC);
    check('C2 inherit: re-prep is a no-op (write-if-absent)', (await prisma.task.findUnique({ where: { id: nodeC }, select: { updatedAt: true } }))!.updatedAt.getTime() === before.getTime());

    const lost = await writeInterfaceContractIfAbsent(nodeC, { other: 1 }, 'cnobody', { interfaceContractSource: { forged: true } });
    check('T3 lost race: a write onto a task that already holds a contract → 0 rows, NO stamp', lost === null && (await meta(nodeC)).interfaceContractSource?.forged === undefined);
    const onLeg = await writeInterfaceContractIfAbsent(leg1, { other: 1 }, 'cnobody');
    check("AE-F1: the shared writer refuses a PIPELINE task in-statement", onLeg === null);
    const contractLessLeg = await mkTask({ title: `${tag} bare pipeline`, type: 'PIPELINE', stage: { connect: { id: plainStage } } });
    check("AE-F1: …even a contract-LESS PIPELINE task (the type guard, not the absence guard)",
      (await writeInterfaceContractIfAbsent(contractLessLeg, { other: 1 }, 'cnobody')) === null && !(await ic(contractLessLeg))?.interfaceContract);

    if (qaTmpl) {
      const qa = await mkTask({ title: `${tag} GUI reviewer`, type: 'ACTION', stage: { connect: { id: prog } }, agentTemplate: { connect: { id: qaTmpl.id } }, agentRole: 'qa_test_engineer' });
      await prepareTaskForExecution(qa);
      check('TSY-F4: a generic REVIEWER-typed template in a program stage ALSO inherits (breadth pinned)', canonicalContractSha((await ic(qa))?.interfaceContract) === planSha);
    }
    const producer = await mkTask({ title: `${tag} producer`, type: 'ACTION', stage: { connect: { id: prog } }, ...(writerTmpl ? { agentTemplate: { connect: { id: writerTmpl.id } } } : {}), agentRole: 'technical_writer' });
    await prepareTaskForExecution(producer);
    check('Q3: the producer (not reviewer-set) is untouched', !(await ic(producer))?.interfaceContract && !('interfaceContractSource' in (await meta(producer))));

    const healed = await mkTask({ title: `${tag} flagged Node C`, type: 'ACTION', stage: { connect: { id: prog } }, agentTemplate: { connect: { id: reviewerTmpl.id } }, agentRole: 'change_reviewer', metadata: { requiresInterfaceContract: true } });
    let threw = '';
    try { await prepareTaskForExecution(healed); } catch (e: any) { threw = e?.message ?? String(e); }
    check('AE-F8: a FLAGGED child that lost its contract is healed (no F16 throw), source plan-inherited', !threw && (await meta(healed)).interfaceContractSource?.source === 'plan-inherited', threw);

    // ── Q5 refusal + QS6 (ii): an Architect re-run AFTER PLAN-SPAWN ───────────────────────────
    const arch2 = await mkArchitect(prog2, `${tag} architect two`);
    await addExec(arch2, planText(PLAN), 60_000);
    const r3 = await create(`${tag} p2 leg (protocol: network-provisioning)`, 'PIPELINE', prog2, PLAN);
    const p2leg = r3?.result?.task?.id; cleanup.tasks.push(p2leg);
    const PLAN_V2 = { ...PLAN, asn: 65002 };
    await addExec(arch2, planText(PLAN_V2), 1_000);   // the re-run: newer, so authoritative
    const p2nodeC = await mkTask({ title: `${tag} p2 Node C`, type: 'ACTION', stage: { connect: { id: prog2 } }, agentTemplate: { connect: { id: reviewerTmpl.id } }, agentRole: 'change_reviewer' });
    await prepareTaskForExecution(p2nodeC);
    const p2m = await meta(p2nodeC);
    check('Q5: legs hold the OLD plan → Node C REFUSES (plan-differs-from-legs), source none stamped, no contract',
      !(await ic(p2nodeC))?.interfaceContract && p2m.interfaceContractSource?.source === 'none' && p2m.interfaceContractSource?.planResolution === 'plan-differs-from-legs', p2m.interfaceContractSource);
    const rRepair = await create(`${tag} p2 REPAIR leg (protocol: network-provisioning)`, 'PIPELINE', prog2, PLAN);
    const repair = rRepair?.result?.task?.id; cleanup.tasks.push(repair);
    const rm = await meta(repair);
    check('QS6 (ii): the REPAIR child stores the CURRENT plan and stamps legBaseline.equalsPlan false',
      canonicalContractSha((await ic(repair))?.interfaceContract) === canonicalContractSha(PLAN_V2) && rm.interfaceContractSource?.source === 'plan'
      && rm.interfaceContractSource?.legBaseline?.equalsPlan === false, rm.interfaceContractSource);

    // ── C3-a clearance carry ───────────────────────────────────────────────────────────────────
    await prepareTaskForExecution(leg1);
    const c1 = await meta(leg1);
    check('C3: a leg with NO clearance gets root tokens ∪ prior (the comma root split; "after" stage excluded)',
      JSON.stringify(c1.duplicateAcknowledged) === JSON.stringify([prior, rootStage]) && !JSON.stringify(c1.duplicateAcknowledged).includes(after), c1.duplicateAcknowledged);
    const carry = c1.duplicateAcknowledgedCarry;
    check('C3: carry fact — every key, from=root, basis, carries 1, added = appended, lastAttempt wrote',
      carry && ['fromTaskId', 'basis', 'rootClearance', 'rootClearanceSha256', 'priorPipelineStageIds', 'added', 'lastAdded', 'carries', 'firstAt', 'at', 'lastAttempt'].every((k) => k in carry)
      && carry.fromTaskId === root && carry.carries === 1 && JSON.stringify(carry.added) === JSON.stringify([prior, rootStage])
      && JSON.stringify(carry.priorPipelineStageIds) === JSON.stringify([prior]) && carry.lastAttempt?.outcome === 'wrote'
      && carry.rootClearance === `${prior}, ${rootStage}` && c1.duplicateAcknowledgedFrom === root, carry);

    const ua = (await prisma.task.findUnique({ where: { id: leg1 }, select: { updatedAt: true } }))!.updatedAt;
    await prepareTaskForExecution(leg1);
    check('C3: re-prep of a superset leg writes NOTHING (no updated_at bump, carries still 1)',
      (await prisma.task.findUnique({ where: { id: leg1 }, select: { updatedAt: true } }))!.updatedAt.getTime() === ua.getTime() && (await meta(leg1)).duplicateAcknowledgedCarry.carries === 1);

    await prisma.$executeRaw`UPDATE tasks SET metadata = metadata || jsonb_build_object('duplicateAcknowledged', ${prior}::text) WHERE id = ${leg2}`;
    await prepareTaskForExecution(leg2);
    const c2 = await meta(leg2);
    check('C3: a NARROWER string clearance is folded VERBATIM first, the missing token APPENDED', JSON.stringify(c2.duplicateAcknowledged) === JSON.stringify([prior, rootStage])
      && JSON.stringify(c2.duplicateAcknowledgedCarry.added) === JSON.stringify([rootStage]), c2);

    await prisma.$executeRaw`UPDATE tasks SET metadata = metadata || jsonb_build_object('duplicateAcknowledged', jsonb_build_array(${prior}::text)) WHERE id = ${leg1}`;
    await prepareTaskForExecution(leg1);
    const c1b = await meta(leg1);
    check('TS-F5: a reverted list is RESTORED at the next prep; added is CUMULATIVE; carries 2',
      JSON.stringify(c1b.duplicateAcknowledged) === JSON.stringify([prior, rootStage]) && c1b.duplicateAcknowledgedCarry.carries === 2
      && JSON.stringify(c1b.duplicateAcknowledgedCarry.added) === JSON.stringify([prior, rootStage, rootStage]) && c1b.duplicateAcknowledgedCarry.firstAt === carry.firstAt, c1b.duplicateAcknowledgedCarry);

    const mkLeg = async (title: string, m: Record<string, unknown>) => mkTask({ title, type: 'PIPELINE', stage: { connect: { id: prog } }, inputContext: { interfaceContract: PLAN }, metadata: m });
    const commaLeg = await mkLeg(`${tag} comma leg`, { duplicateAcknowledged: `${rootStage},${prior}` });
    await prepareTaskForExecution(commaLeg);
    check('C3: a comma-joined cuid STRING already covering the target → no write, value untouched', (await meta(commaLeg)).duplicateAcknowledged === `${rootStage},${prior}` && !('duplicateAcknowledgedCarry' in (await meta(commaLeg))));
    const nullLeg = await mkLeg(`${tag} null leg`, { duplicateAcknowledged: null });
    await prepareTaskForExecution(nullLeg);
    check('C3: JSON null is treated as ABSENT', JSON.stringify((await meta(nullLeg)).duplicateAcknowledged) === JSON.stringify([prior, rootStage]));
    const nameLeg = await mkLeg(`${tag} name leg`, { duplicateAcknowledged: ['Pipeline: some, named stage'] });
    await prepareTaskForExecution(nameLeg);
    check('C3: a comma NAME is one opaque token, kept verbatim', JSON.stringify((await meta(nameLeg)).duplicateAcknowledged) === JSON.stringify(['Pipeline: some, named stage', prior, rootStage]));
    const shapeLeg = await mkLeg(`${tag} shape leg`, { duplicateAcknowledged: { odd: true } });
    await prepareTaskForExecution(shapeLeg);
    const sm = await meta(shapeLeg);
    check('C3: an existing value of another shape is never written over; lastAttempt {skipped, existing-shape} on a full skeleton',
      JSON.stringify(sm.duplicateAcknowledged) === '{"odd":true}' && sm.duplicateAcknowledgedCarry?.lastAttempt?.reason === 'existing-shape'
      && sm.duplicateAcknowledgedCarry?.carries === null && Object.keys(sm.duplicateAcknowledgedCarry).length === 11, sm.duplicateAcknowledgedCarry);

    // A comma-bearing stage NAME in the root clearance: the coverage rule must read it as ONE token. A rule that
    // split it would see the leg's verbatim copy as not covering the root and append a duplicate.
    const commaName = `Pipeline: ${tag} a, b`;
    await mkStage(commaName, 7);
    await prisma.$executeRaw`UPDATE tasks SET metadata = metadata || jsonb_build_object('duplicateAcknowledged', jsonb_build_array(${prior}::text, ${rootStage}::text, ${commaName}::text)) WHERE id = ${root}`;
    const coveredLeg = await mkLeg(`${tag} comma-name covered leg`, { duplicateAcknowledged: [commaName, prior, rootStage] });
    await prepareTaskForExecution(coveredLeg);
    const cm = await meta(coveredLeg);
    check('C3: a leg already holding a comma-bearing stage NAME is covered (one token) → no write',
      JSON.stringify(cm.duplicateAcknowledged) === JSON.stringify([commaName, prior, rootStage]) && !('duplicateAcknowledgedCarry' in cm), cm);

    // S7 unbound root + a description-only root, on real Postgres.
    await prisma.$executeRaw`UPDATE tasks SET metadata = metadata || jsonb_build_object('duplicateAcknowledged', 'cmzzzzzzzzzzzzzzzzzzzzzzz') WHERE id = ${root}`;
    const unboundLeg = await mkLeg(`${tag} unbound leg`, {});
    await prepareTaskForExecution(unboundLeg);
    const um = await meta(unboundLeg);
    check('S7: an UNBOUND root clearance is not carried — lastAttempt {skipped, root-clearance-unbound}',
      um.duplicateAcknowledged === undefined && um.duplicateAcknowledgedCarry?.lastAttempt?.reason === 'root-clearance-unbound', um);
    await prisma.$executeRaw`UPDATE tasks SET metadata = metadata - 'duplicateAcknowledged', description = ${'PRE-FLIGHT CLEARANCE: ' + prior} WHERE id = ${root}`;
    const descLeg = await mkLeg(`${tag} desc leg`, {});
    const r = await carryProgramClearance(prisma as any, { taskId: descLeg, stageId: prog, legMetadata: {} });
    check('BC-M2: a description-only root clearance is NOT carried (no write, no key)', r.outcome === 'no-root-clearance' && !('duplicateAcknowledgedCarry' in (await meta(descLeg))));
  } finally {
    await prisma.taskDependency.deleteMany({ where: { OR: [{ taskId: { in: cleanup.tasks } }, { dependsOnId: { in: cleanup.tasks } }] } }).catch(() => {});
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.comment.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.agentExecution.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.task.deleteMany({ where: { id: { in: cleanup.tasks } } }).catch(() => {});
    await prisma.stage.deleteMany({ where: { id: { in: cleanup.stages } } }).catch(() => {});
    await prisma.phase.deleteMany({ where: { id: { in: cleanup.phases } } }).catch(() => {});
    console.log('cleanup done');
  }
  console.log(`\nC2/C3 behavioral: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error('C23 behavioral script error:', e); await prisma.$disconnect(); process.exit(1); });
