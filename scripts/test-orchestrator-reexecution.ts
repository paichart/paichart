#!/usr/bin/env ts-node
/**
 * RWF C.1 (2026-09-26): orchestrator re-execution at the create chokepoint. Covers the per-child cap, the Reviewer
 * rule, the per-execution chained record, the explicit stamps, and the pre-prepare short-circuit.
 *
 * Part 1: pure + source locks (no DB, always runs).
 * Part 2: behaviour through the REAL createAgentExecution against a real database (skipped without DATABASE_URL).
 *   Each created execution is immediately flipped to SUCCESS with a result.json, as if it ran, so it becomes the
 *   authoritative run and frees the one-active-execution slot.
 *
 * Plan: cline_docs/reviews/rwf-stage1-2026-09-26/PLAN.md §4 C.1, §6 rows "Cap", "Reviewer rule", "Chained record".
 */
import * as fs from 'fs';
import * as path from 'path';
// Dependency-light import ONLY: agent-execution-create reaches lib/prisma, which throws in CI (no DATABASE_URL).
import { buildExecutionContext } from '../lib/services/execution-context-build';
import { projectChainedPredecessors, recordFromChained, readChainedRecord } from '../lib/agents/harness/chained-predecessors';

const ROOT = path.resolve(__dirname, '..');
let passed = 0; const failed: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const j = (x: unknown) => JSON.stringify(x);
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

(async () => {
  console.log('\n🧪 RWF C.1 — orchestrator re-execution at the create chokepoint\n\nPart 1 — pure + source locks');

  await test('P1 stamps are written EXPLICITLY after the extras spread: stale copies in contextExtras never survive', () => {
    const stale = { reExecutionOfExecutionId: 'old', orchestratorReExecution: { harnessTaskId: 'x', harnessExecutionId: 'y' },
      chainedPredecessors: { status: 'chained', ids: { a: 'old' } }, keep: 1 };
    const ctx = buildExecutionContext(stale, { id: 'u', source: 'reactor-task-ready' } as any,
      { orchestratorReExecution: null, chainedPredecessors: { status: 'not-chained', reason: 'no-deps' } });
    assert(!('reExecutionOfExecutionId' in ctx) && !('orchestratorReExecution' in ctx), `stale stamps survived: ${j(ctx)}`);
    assert(j(ctx.chainedPredecessors) === j({ status: 'not-chained', reason: 'no-deps' }) && ctx.keep === 1, j(ctx));
  });
  await test('P2 projection: own edges only (inheritedFromLeg excluded); an empty chain records nothing-chained, never vacuous "chained"', () => {
    const ic = { chainedFrom: [{ taskId: 'a', executionId: 'ea' }, { taskId: 'b', executionId: 'eb', inheritedFromLeg: 'leg' }] };
    assert(j(projectChainedPredecessors(ic)) === j({ a: 'ea' }), j(projectChainedPredecessors(ic)));
    assert(projectChainedPredecessors({}) === null, 'no chainedFrom ⇒ null');
    assert(j(recordFromChained({ chainedFrom: [{ taskId: 'b', executionId: 'eb', inheritedFromLeg: 'leg' }] }))
      === j({ status: 'not-chained', reason: 'nothing-chained' }), 'only-inherited must not read as chained');
  });
  await test('P3 record read order: stamped context > legacy frozen config > absent', () => {
    const rec = { status: 'chained', ids: { a: 'e1' } };
    assert(readChainedRecord({ context: { chainedPredecessors: rec }, config: { inputContext: { chainedFrom: [{ taskId: 'a', executionId: 'e2' }] } } }).source === 'context', 'context first');
    const legacy = readChainedRecord({ context: {}, config: { inputContext: { chainedFrom: [{ taskId: 'a', executionId: 'e2' }] } } });
    assert(legacy.source === 'legacy-config' && j(legacy.record) === j({ status: 'chained', ids: { a: 'e2' } }), j(legacy));
    assert(readChainedRecord({ context: {}, config: {} }).source === 'absent', 'absent');
  });
  await test('P4 source lock: short-circuit, classification and rules all run BEFORE prepare (a refusal writes nothing)', () => {
    const src = strip(fs.readFileSync(path.join(ROOT, 'lib/services/agent-execution-create.ts'), 'utf8'));
    const iShort = src.indexOf("status: { in: ['PENDING', 'RUNNING'] } }, select: { id: true },");
    const iClassify = src.indexOf('classifyOrchestratorReExecution(prisma');
    const iEnforce = src.indexOf('enforceOrchestratorReExecutionRules(prisma');
    const iPrepare = src.indexOf('prepareTaskForExecutionWithRecord(args.taskId');
    assert(iShort > 0 && iClassify > iShort && iEnforce > iClassify && iPrepare > iEnforce,
      `order short=${iShort} classify=${iClassify} enforce=${iEnforce} prepare=${iPrepare}`);
    assert(/context: buildExecutionContext\(/.test(src), 'the create must build context through buildExecutionContext');
  });
  await test('P5 both new stamps are server-reserved (stripped from any client/non-reactor context)', () => {
    // Source scan (importing agent-execution-create would reach lib/prisma — see the import note above).
    const src = fs.readFileSync(path.join(ROOT, 'lib/services/agent-execution-create.ts'), 'utf8');
    const list = src.slice(src.indexOf('export const SERVER_RESERVED_CONTEXT_KEYS = ['), src.indexOf('] as const;', src.indexOf('export const SERVER_RESERVED_CONTEXT_KEYS = [')));
    for (const k of ['orchestratorReExecution', 'chainedPredecessors', 'reExecutionOfExecutionId']) {
      assert(list.includes(`'${k}'`), `${k} not reserved`);
    }
  });

  console.log('\nPart 2 — behaviour through createAgentExecution (real database)');
  if (!process.env.DATABASE_URL) {
    console.log('  ⏭️  skipped — DATABASE_URL not set');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAgentExecution } = require('../lib/services/agent-execution-create') as typeof import('../lib/services/agent-execution-create');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OrchestratorReExecutionRefusedError, DuplicateActiveExecutionError } = require('../lib/errors') as typeof import('../lib/errors');

    const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
    const country = await prisma.country.findFirst({ select: { id: true } });
    const reviewerTemplate = await prisma.agentTemplate.findFirst({ where: { templateType: 'REVIEWER' }, select: { id: true } });
    const builderTemplate = await prisma.agentTemplate.findFirst({ where: { templateType: 'BUILDER' }, select: { id: true } });
    if (!owner || !country || !reviewerTemplate || !builderTemplate) throw new Error('fixture needs an ADMIN, a Country, a REVIEWER and a BUILDER template');
    const now = new Date(); const future = new Date(now.getTime() + 30 * 86400000);
    const pov = await prisma.pOV.create({ data: { title: `__test_c1_${Date.now()}`, description: 'RWF C.1 fixture',
      ownerId: owner.id, status: 'PROJECTED', startDate: now, endDate: future, salesTheatre: 'NORTH_AMERICA', countryId: country.id } });
    const phase = await prisma.phase.create({ data: { name: 'P', type: 'EXECUTION', povId: pov.id, order: 0, description: '', startDate: now, endDate: future } });
    let n = 0;
    const stage = () => prisma.stage.create({ data: { name: `S${n++}`, phaseId: phase.id, order: n } });
    const task = (stageId: string, data: Record<string, unknown>) =>
      prisma.task.create({ data: { title: `t${n++}`, povId: pov.id, stageId, type: 'ACTION' as any, status: 'IN_PROGRESS', ...data } as any });
    let clock = Date.now() - 3_600_000;
    const tick = () => new Date((clock += 1000));
    /** A harness execution, created directly (these are the CALLERS, not what is under test). */
    const harnessExec = (taskId: string, source: string) => prisma.agentExecution.create({ data: { taskId, status: 'SUCCESS',
      config: {}, context: { triggeredBy: { id: owner.id, source } }, logs: [], createdAt: tick() } });
    /** Create through the chokepoint, then settle it as a SUCCESS with a deliverable. */
    const run = async (taskId: string, parentExecutionId?: string, extra: Record<string, unknown> = {}) => {
      const { execution } = await createAgentExecution({ taskId, status: 'PENDING', config: {},
        triggeredBy: { id: owner.id, source: 'mcp-direct', ...(parentExecutionId ? { parentExecutionId } : {}) }, ...extra } as any);
      await prisma.agentExecution.update({ where: { id: execution.id }, data: { status: 'SUCCESS', createdAt: tick() } });
      await prisma.agentArtifact.create({ data: { executionId: execution.id, name: 'result.json', type: 'application/json',
        content: JSON.stringify({ taskId, finalResponse: `deliverable of ${execution.id}` }) } });
      return prisma.agentExecution.findUniqueOrThrow({ where: { id: execution.id } });
    };
    const refused = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as any; } };
    const ctxOf = (e: { context: unknown }) => e.context as Record<string, any>;

    try {
      const kids = await stage(); const home = await stage();
      const H = await prisma.task.create({ data: { title: 'harness', povId: pov.id, stageId: home.id, type: 'PIPELINE' as any,
        status: 'IN_PROGRESS', metadata: { pipelineStageId: kids.id } } });
      // A template makes A chain-CAPABLE: a template-less dependency is a gate/hold and is never chained (F19).
      const A = await task(kids.id, { agentRole: 'config_change_author', agentTemplateId: builderTemplate.id });
      const R = await task(kids.id, { agentRole: 'change_reviewer' });
      await prisma.taskDependency.create({ data: { taskId: R.id, dependsOnId: A.id } });
      await harnessExec(H.id, 'mcp-direct'); // CREATE — the run epoch
      const syn1 = await harnessExec(H.id, 'reactor-pipeline-retrigger');

      let a1: any, a2: any;
      await test('D1 a first run from the harness (kickstart) is NOT a re-execution: allowed, unstamped; record no-deps', async () => {
        a1 = await run(A.id, syn1.id);
        assert(!ctxOf(a1).orchestratorReExecution, `stamped: ${j(ctxOf(a1).orchestratorReExecution)}`);
        const rec = ctxOf(a1).chainedPredecessors;
        assert(rec?.status === 'not-chained' && rec.reason === 'no-deps', j(rec));
      });
      await test('D2 the owning harness re-executes a child once: allowed and stamped {harnessTaskId, harnessExecutionId}', async () => {
        a2 = await run(A.id, syn1.id);
        assert(j(ctxOf(a2).orchestratorReExecution) === j({ harnessTaskId: H.id, harnessExecutionId: syn1.id }), j(ctxOf(a2)));
        assert(ctxOf(a2).reExecutionOfExecutionId === a1.id, 'retry provenance still stamped');
      });
      await test('D3 a SECOND re-execution in the same run is refused (CAP), before anything is written', async () => {
        const syn2 = await harnessExec(H.id, 'reactor-pipeline-retrigger'); // a later SYNTHESIZE of the SAME run
        const before = await prisma.agentExecution.count({ where: { taskId: A.id } });
        const e = await refused(() => run(A.id, syn2.id));
        assert(e instanceof OrchestratorReExecutionRefusedError && e.code === 'ORCHESTRATOR_REEXECUTION_CAP', `got ${e?.code ?? e}`);
        assert(/ORCHESTRATOR_REEXECUTION_CAP/.test(e.message) && /the answer, not an error to retry/.test(e.message), 'prose keys on the text');
        assert(await prisma.agentExecution.count({ where: { taskId: A.id } }) === before, 'a refusal must write no row');
      });
      await test('D4 a HUMAN re-execution (no parentExecutionId) is outside the cap: allowed, unstamped (m10)', async () => {
        const h = await run(A.id);
        assert(!ctxOf(h).orchestratorReExecution, j(ctxOf(h)));
      });
      await test('D5 a human re-execute of the HARNESS opens a new run epoch: the child may be re-executed once more', async () => {
        await harnessExec(H.id, 'mcp-direct');
        const syn3 = await harnessExec(H.id, 'reactor-pipeline-retrigger');
        const e = await run(A.id, syn3.id);
        assert(ctxOf(e).orchestratorReExecution?.harnessExecutionId === syn3.id, j(ctxOf(e)));
      });
      await test('D6 a PIPELINE that does not own the child stage is not an owner: allowed, not stamped, not capped', async () => {
        const other = await prisma.task.create({ data: { title: 'other', povId: pov.id, stageId: home.id, type: 'PIPELINE' as any,
          metadata: { pipelineStageId: (await stage()).id } } });
        const ox = await harnessExec(other.id, 'reactor-pipeline-retrigger');
        const e1 = await run(A.id, ox.id); const e2 = await run(A.id, ox.id);
        assert(!ctxOf(e1).orchestratorReExecution && !ctxOf(e2).orchestratorReExecution, 'a non-owner must not be stamped');
      });

      // ── Reviewer rule. A is COMPLETED so the reviewer chains it. ──
      await prisma.task.update({ where: { id: A.id }, data: { status: 'COMPLETED' } });
      await harnessExec(H.id, 'mcp-direct');
      const synR = await harnessExec(H.id, 'reactor-pipeline-retrigger');
      let r1: any;
      await test('D7 chained record: a reviewer that chained its Author records {chained, ids: {author: <authoritative exec>}}', async () => {
        r1 = await run(R.id); // human first run
        const rec = ctxOf(r1).chainedPredecessors;
        const authAuth = await prisma.agentExecution.findFirst({ where: { taskId: A.id, status: 'SUCCESS' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
        assert(rec?.status === 'chained' && rec.ids[A.id] === authAuth!.id, `${j(rec)} vs ${authAuth!.id}`);
      });
      await test('D8 Reviewer rule: a same-input re-roll is refused (every predecessor still authoritative)', async () => {
        const e = await refused(() => run(R.id, synR.id));
        assert(e instanceof OrchestratorReExecutionRefusedError && e.code === 'REVIEWER_SAME_INPUT_REEXECUTION', `got ${e?.code ?? e}`);
        assert(/the verdict decides/.test(e.message), 'prose keys on the text');
      });
      await test('D9 Reviewer rule: a STALE verdict (the Author re-ran since) is allowed', async () => {
        await run(A.id); // human Author re-run ⇒ new authoritative Author
        const e = await run(R.id, synR.id);
        assert(ctxOf(e).orchestratorReExecution?.harnessTaskId === H.id, 'allowed and stamped');
      });
      await test('D10 Reviewer rule: a FAILED reviewer (no authoritative SUCCESS) is allowed to recover', async () => {
        const R2 = await task(kids.id, { agentRole: 'change_reviewer' });
        await prisma.agentExecution.create({ data: { taskId: R2.id, status: 'FAILED', config: {}, context: {}, logs: [], createdAt: tick() } });
        const e = await run(R2.id, synR.id);
        assert(ctxOf(e).orchestratorReExecution, 'allowed');
      });
      await test('D11 Reviewer rule covers a REVIEWER-type template outside REVIEWER_ROLES (publication_reviewer shape)', async () => {
        const P = await task(kids.id, { agentRole: 'publication_reviewer', agentTemplateId: reviewerTemplate.id });
        await prisma.taskDependency.create({ data: { taskId: P.id, dependsOnId: A.id } });
        await run(P.id);
        const e = await refused(() => run(P.id, synR.id));
        assert(e?.code === 'REVIEWER_SAME_INPUT_REEXECUTION', `got ${e?.code ?? e}`);
      });
      await test('D12 a non-reviewer same-input re-execution is NOT refused by the Reviewer rule (only the cap applies)', async () => {
        const B = await task(kids.id, { agentRole: 'technical_writer' });
        await prisma.taskDependency.create({ data: { taskId: B.id, dependsOnId: A.id } });
        await run(B.id);
        const e = await run(B.id, synR.id);
        assert(ctxOf(e).orchestratorReExecution, 'allowed');
      });

      await test('D15 Reviewer rule: UNKNOWN inputs (its verdict ran with chaining skipped) are allowed — unknown is never "same" (N8)', async () => {
        const R3 = await task(kids.id, { agentRole: 'change_reviewer' });
        await prisma.taskDependency.create({ data: { taskId: R3.id, dependsOnId: A.id } });
        await run(R3.id, undefined, { skipChaining: true });
        const e = await run(R3.id, synR.id);
        assert(ctxOf(e).orchestratorReExecution, 'unknown must be allowed');
      });

      // ── Record states ──
      await test('D13 record: skipChaining ⇒ not-chained/skip-chaining; SCHEDULED ⇒ not-chained/scheduled', async () => {
        const T = await task(kids.id, {});
        const s1 = await run(T.id, undefined, { skipChaining: true });
        assert(ctxOf(s1).chainedPredecessors?.reason === 'skip-chaining', j(ctxOf(s1).chainedPredecessors));
        const { execution: sch } = await createAgentExecution({ taskId: T.id, status: 'SCHEDULED', config: {},
          triggeredBy: { id: owner.id, source: 'mcp-direct' }, scheduledFor: future } as any);
        assert((sch.context as any).chainedPredecessors?.reason === 'scheduled', j((sch.context as any).chainedPredecessors));
      });
      await test('D14 short-circuit: a create that would collide with an ACTIVE execution is refused BEFORE it re-chains the task row', async () => {
        const T = await task(kids.id, {});
        await prisma.taskDependency.create({ data: { taskId: T.id, dependsOnId: A.id } });
        await prisma.agentExecution.create({ data: { taskId: T.id, status: 'RUNNING', config: {}, context: {}, logs: [] } });
        const before = (await prisma.task.findUniqueOrThrow({ where: { id: T.id }, select: { inputContext: true } })).inputContext;
        const e = await refused(() => createAgentExecution({ taskId: T.id, status: 'PENDING', config: {},
          triggeredBy: { id: owner.id, source: 'mcp-direct' } } as any));
        assert(e instanceof DuplicateActiveExecutionError, `got ${e?.code ?? e}`);
        const after = (await prisma.task.findUniqueOrThrow({ where: { id: T.id }, select: { inputContext: true } })).inputContext;
        assert(j(after) === j(before), 'the running execution\'s task row was re-chained under it');
      });
    } finally {
      await prisma.agentArtifact.deleteMany({ where: { execution: { task: { povId: pov.id } } } });
      await prisma.agentExecution.deleteMany({ where: { task: { povId: pov.id } } });
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
