/**
 * task.create / task.update boundary — behavioural proof through the REAL router (dev DB, no LLM).
 * Requires dev DB + TEST_POV_ID.
 * Run: npm run test:task-create-boundary-behavioral
 *
 * T — task.create + any template key THROWS and creates NO task row (and no stage: the rejection is at
 *     the router's schema boundary, before the handler's stage resolution can auto-create one).
 * U — task.update + agentTemplateName (name only) WRITES the template (was resolved-then-discarded).
 *
 * Review: cline_docs/reviews/perform-template-param-2026-09-25/mcp-tool-architecture-advisory.md
 */
import { PrismaClient } from '@prisma/client';
import { TasksActionRouter } from '../lib/mcp/tasks/action/tasks-action-router';

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); ok ? pass++ : fail++; };

async function main() {
  const povId = process.env.TEST_POV_ID;
  if (!povId) { console.error('TEST_POV_ID not set'); process.exit(1); }
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true, role: true } });
  const token: any = { userId: admin!.id, email: admin!.email, name: admin!.name ?? 'boundary', role: admin!.role };
  const phase = await prisma.phase.findFirst({ where: { povId }, select: { id: true } });
  const tmpl = await prisma.agentTemplate.findFirst({ where: { NOT: { name: 'Pipeline Harness' } }, select: { id: true, name: true } });
  const router = new TasksActionRouter();
  const stamp = `BOUNDARY-${Date.now()}`;
  const cleanup: string[] = [];

  try {
    // ── T: template keys on task.create ──
    const stagesBefore = await prisma.stage.count({ where: { phase: { povId } } });
    for (const [key, value] of [
      ['agentTemplateId', tmpl!.id], ['agent_template_id', tmpl!.id], ['templateId', tmpl!.id],
      ['agentTemplateName', tmpl!.name], ['agent_template_name', tmpl!.name],
    ] as const) {
      const title = `${stamp} T ${key}`;
      let err = '';
      try {
        await router.route('task.create', { povId, phaseId: phase!.id, title, stageName: `${stamp} auto-stage`, [key]: value }, token, `boundary-${key}`);
      } catch (e: any) { err = e?.message ?? String(e); }
      const rows = await prisma.task.count({ where: { title } });
      check(`T1 task.create + ${key} → throws naming ${key}`, err.includes(`${key} was not applied and no task was created`), err.slice(0, 90));
      check(`T2 task.create + ${key} → NO task row`, rows === 0, `rows=${rows}`);
    }
    const stagesAfter = await prisma.stage.count({ where: { phase: { povId } } });
    check('T3 no stage auto-created by any rejected call', stagesAfter === stagesBefore, `${stagesBefore}→${stagesAfter}`);

    // ── U: task.update name-only template path ──
    const stage = await prisma.stage.findFirst({ where: { phaseId: phase!.id }, select: { id: true } });
    const t = await prisma.task.create({
      data: { title: `${stamp} U`, description: 'boundary', status: 'IN_PROGRESS', // not OPEN → reactor never queues
        pov: { connect: { id: povId } }, phase: { connect: { id: phase!.id } }, stage: { connect: { id: stage!.id } } } as any,
      select: { id: true },
    });
    cleanup.push(t.id);
    let uErr = '';
    try {
      await router.route('task.update', { taskId: t.id, agentTemplateName: tmpl!.name }, token, 'boundary-u1');
    } catch (e: any) { uErr = e?.message ?? String(e); }
    const after = await prisma.task.findUnique({ where: { id: t.id }, select: { agentTemplateId: true } });
    check('U1 task.update + agentTemplateName only → template written', !uErr && after?.agentTemplateId === tmpl!.id,
      uErr ? `threw: ${uErr.slice(0, 80)}` : `agentTemplateId=${after?.agentTemplateId}`);
    const execs = await prisma.agentExecution.count({ where: { taskId: t.id } });
    check('U2 not-OPEN task → no execution queued by the update', execs === 0, `executions=${execs}`);

    // ── N: task.create person assignee by name (was silently stripped → POV owner) ──
    const pov = await prisma.pOV.findUnique({ where: { id: povId }, select: { ownerId: true, team: { select: { members: { select: { userId: true } } } } } });
    const memberIds = new Set([pov!.ownerId, ...(pov!.team?.members ?? []).map(m => m.userId)].filter(Boolean) as string[]);
    const other = await prisma.user.findFirst({ where: { id: { not: pov!.ownerId ?? undefined } }, select: { id: true, name: true, email: true } });
    for (const key of ['assignee_name', 'assignee'] as const) {
      const title = `${stamp} N1 ${key}`;
      let err = '';
      try {
        await router.route('task.create', { povId, phaseId: phase!.id, stageId: stage!.id, title, status: 'IN_PROGRESS', [key]: other!.email }, token, `boundary-n1-${key}`);
      } catch (e: any) { err = e?.message ?? String(e); }
      const row = await prisma.task.findFirst({ where: { title }, select: { assigneeId: true } });
      check(`N1 task.create + ${key} (email, ADMIN caller) → assigned to that user, NOT the owner`, !err && row?.assigneeId === other!.id,
        err ? `threw: ${err.slice(0, 80)}` : `assigneeId=${row?.assigneeId} want=${other!.id} owner=${pov!.ownerId}`);
    }
    {
      const title = `${stamp} N2 unknown`;
      let err = '';
      try {
        await router.route('task.create', { povId, phaseId: phase!.id, stageId: stage!.id, title, assignee_name: `no-such-user-${stamp}` }, token, 'boundary-n2');
      } catch (e: any) { err = e?.message ?? String(e); }
      const rows = await prisma.task.count({ where: { title } });
      check('N2 unresolvable name → throws "was not applied and no task was created"', err.includes('was not applied and no task was created') && err.includes('User not found'), err.slice(0, 90));
      check('N3 unresolvable name → NO task row', rows === 0, `rows=${rows}`);
    }
    {
      const title = `${stamp} N4 id-wins`;
      await router.route('task.create', { povId, phaseId: phase!.id, stageId: stage!.id, title, status: 'IN_PROGRESS', assigneeId: pov!.ownerId, assignee: other!.email }, token, 'boundary-n4');
      const row = await prisma.task.findFirst({ where: { title }, select: { assigneeId: true } });
      check('N4 assigneeId + assignee → assigneeId wins (task.assign parity)', row?.assigneeId === pov!.ownerId, `assigneeId=${row?.assigneeId}`);
    }
    // Non-admin caller (the POV owner, role USER) naming a user outside the POV team → M2 check, no row.
    const outsider = await prisma.user.findFirst({ where: { id: { notIn: [...memberIds] } }, select: { id: true, email: true } });
    if (outsider && pov!.ownerId) {
      const title = `${stamp} N5 outsider`;
      const ownerUser = await prisma.user.findUnique({ where: { id: pov!.ownerId }, select: { id: true, email: true, name: true } });
      const userToken: any = { userId: ownerUser!.id, email: ownerUser!.email, name: ownerUser!.name ?? 'owner', role: 'USER' };
      let err = '';
      try {
        await router.route('task.create', { povId, phaseId: phase!.id, stageId: stage!.id, title, assignee: outsider.email }, userToken, 'boundary-n5');
      } catch (e: any) { err = e?.message ?? String(e); }
      const rows = await prisma.task.count({ where: { title } });
      check('N5 non-admin + non-team-member name → throws (task.assign M2 parity), NO row', err.includes('not a member of this POV team') && rows === 0, `${err.slice(0, 70)} rows=${rows}`);
    } else {
      console.log('⚪ N5 skipped — no user outside the POV team in this dev DB (unmeasured, not passed)');
    }

    // ── I: ignoredParameters fact through the real router ──
    {
      const title = `${stamp} I1`;
      const res: any = await router.route('task.create', { povId, phaseId: phase!.id, stageId: stage!.id, title, status: 'IN_PROGRESS', prompt: 'not a task.create field' }, token, 'boundary-i1',
        { reportIgnoredParameters: true, unappliedTopLevelKeys: ['action2'] });
      const row = await prisma.task.findFirst({ where: { title }, select: { id: true } });
      check('I1 opted-in success result carries ignoredParameters (nested + top-level, sorted); task still created',
        JSON.stringify(res.ignoredParameters) === JSON.stringify(['action2', 'prompt']) && !!row, JSON.stringify(res.ignoredParameters));
      const clean: any = await router.route('task.create', { povId, phaseId: phase!.id, stageId: stage!.id, title: `${stamp} I2`, status: 'IN_PROGRESS' }, token, 'boundary-i2',
        { reportIgnoredParameters: true, unappliedTopLevelKeys: [] });
      check('I2 opted-in clean call → [] (measured, none ignored)', Array.isArray(clean.ignoredParameters) && clean.ignoredParameters.length === 0, JSON.stringify(clean.ignoredParameters));
      const unmeasured: any = await router.route('task.create', { povId, phaseId: phase!.id, stageId: stage!.id, title: `${stamp} I3`, status: 'IN_PROGRESS', prompt: 'x' }, token, 'boundary-i3');
      check('I3 NOT opted in → field ABSENT (unmeasured is never stamped [])', !('ignoredParameters' in unmeasured), JSON.stringify(unmeasured.ignoredParameters));
    }
    {
      // I4 — END TO END through the outer perform dispatcher (Tier 1), args parsed by the real L1 schema
      // exactly as wrapWithSchema does. Nested params + a top-level junk key + a nested unknown key.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { CONSOLIDATED_SCHEMAS } = require('../lib/mcp/server/config/tool-schemas');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { TaskActionHandler } = require('../lib/mcp/server/tools/advanced/task-action-handler');
      const quiet = { debug() {}, info() {}, warn() {}, error() {} };
      const handler = new TaskActionHandler({ logger: quiet, enhanceActionResultWithResourceContext: async (r: any) => r });
      const title = `${stamp} I4`;
      const l1 = CONSOLIDATED_SCHEMAS.perform.inputSchema.parse({
        action: 'task.create', action2: 'junk',
        parameters: { povId, phaseId: phase!.id, stageId: stage!.id, title, status: 'IN_PROGRESS', prompt: 'x' },
      });
      const ctx = { authenticated: true, user: { id: admin!.id, email: admin!.email, role: admin!.role, name: admin!.name } };
      const out: any = await handler.handle(l1, ctx);
      const text: string = out?.content?.[0]?.text ?? '';
      check('I4a _meta.ignoredParameters = ["action2","prompt"] on the client response',
        JSON.stringify(out?._meta?.ignoredParameters) === JSON.stringify(['action2', 'prompt']), JSON.stringify(out?._meta?.ignoredParameters) + (out?.isError ? ` isError: ${text.slice(0, 80)}` : ''));
      check('I4b text leads with the fact line', text.startsWith('Parameters not applied by task.create: action2, prompt\n'), text.slice(0, 80));
      const l1clean = CONSOLIDATED_SCHEMAS.perform.inputSchema.parse({ action: 'task.create', parameters: { povId, phaseId: phase!.id, stageId: stage!.id, title: `${stamp} I5`, status: 'IN_PROGRESS' } });
      const outClean: any = await handler.handle(l1clean, ctx);
      check('I5 clean end-to-end call → _meta.ignoredParameters [] and NO fact line in text',
        Array.isArray(outClean?._meta?.ignoredParameters) && outClean._meta.ignoredParameters.length === 0 && !String(outClean?.content?.[0]?.text).startsWith('Parameters not applied'),
        JSON.stringify(outClean?._meta?.ignoredParameters));
    }
  } finally {
    const stray = await prisma.task.findMany({ where: { title: { startsWith: stamp } }, select: { id: true } });
    const ids = [...new Set([...cleanup, ...stray.map(s => s.id)])];
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
    await prisma.comment.deleteMany({ where: { taskId: { in: ids } } }).catch(() => {});
    await prisma.task.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    await prisma.stage.deleteMany({ where: { name: { startsWith: stamp } } }).catch(() => {});
  }
  console.log(`\ntask boundary behavioral: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('boundary script error:', e); prisma.$disconnect(); process.exit(1); });
