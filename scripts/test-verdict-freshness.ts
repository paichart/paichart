#!/usr/bin/env ts-node
/**
 * RWF C.3 (2026-09-26): verdict freshness (the leg-synthesize net + the read-time card fact, one function) and
 * the agent.results surface (order, hidden-but-listed superseded retries, authoritativeExecutionId, m1).
 *
 * Part 1: the verdictFreshness net over a stub client (no DB, always runs).
 * Part 2: agent.results THROUGH THE ROUTER against a real database (skipped without DATABASE_URL).
 *
 * Plan: cline_docs/reviews/rwf-stage1-2026-09-26/PLAN.md §4 C.3; execution-facts review §4/§5; §11 I31.
 */
import { authoritativeReadStub, type StubExecution } from './fixtures/authoritative-read-stub';
import { computeVerdictFreshnessFact } from '../lib/agents/harness/verdict-freshness-enrichment';
import { pickResultJsonSummary } from '../lib/services/execution-artifacts';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leanFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts');

let passed = 0; const failed: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const j = (x: unknown) => JSON.stringify(x);

(async () => {
  console.log('\n🧪 RWF C.3 — verdict freshness + agent.results\n\nPart 1 — the verdictFreshness net (stub)');
  let t = 0;
  const at = () => new Date(1_700_000_000_000 + (t++) * 1000);
  const ok = (taskId: string, extra: Partial<StubExecution> = {}): StubExecution =>
    ({ id: `${taskId}-${t}`, taskId, createdAt: at(), result: { taskId, finalResponse: 'body' }, ...extra });
  const net = (execs: StubExecution[], reviewers: string[], opts: { programTier?: boolean; deps?: Record<string, string[]> } = {}) =>
    computeVerdictFreshnessFact({
      task: { findMany: async () => reviewers.map((id) => ({ id })) },
      ...authoritativeReadStub(execs, { deps: opts.deps }),
    } as any, { stageId: 'stage', programTier: opts.programTier });

  await test('N1 same: the reviewer judged the Author execution that is still authoritative ⇒ checked, match same', async () => {
    const a = ok('author'); const r = ok('rev', { context: { chainedPredecessors: { status: 'chained', ids: { author: a.id } } } });
    const f = await net([a, r], ['rev']);
    assert(f.checked === true && f.match === 'same' && f.reason === 'compared', j(f));
  });
  await test('N2 different: the Author re-ran after the review ⇒ match different, the changed predecessor named', async () => {
    const a1 = ok('author'); const r = ok('rev', { context: { chainedPredecessors: { status: 'chained', ids: { author: a1.id } } } });
    const a2 = ok('author');
    const f = await net([a1, r, a2], ['rev']);
    const p = (f.predecessors as any[])[0];
    assert(f.match === 'different' && p.taskId === 'author' && p.reviewedExecutionId === a1.id && p.authoritativeExecutionId === a2.id, j(f));
  });
  await test('N3 an R8-EMPTY newer Author does not make the verdict stale (the chainer would not chain it)', async () => {
    const a1 = ok('author'); const r = ok('rev', { context: { chainedPredecessors: { status: 'chained', ids: { author: a1.id } } } });
    const empty = ok('author', { result: { taskId: 'author', finalResponse: '' } });
    const f = await net([a1, r, empty], ['rev']);
    assert(f.match === 'same', j(f));
  });
  await test('N4 unknown: a reviewer with no record (pre-C.1) ⇒ NOT checked, no-chained-record — absence is never clean', async () => {
    const a = ok('author'); const r = ok('rev');
    const f = await net([a, r], ['rev']);
    assert(f.checked === false && f.reason === 'no-chained-record' && f.match === null, j(f));
  });
  await test('N5 createdAt fallback can PROVE different for a pre-C.1 reviewer (a predecessor ran after it)', async () => {
    const r = ok('rev'); const a = ok('author');
    const f = await net([r, a], ['rev'], { deps: { rev: ['author'] } });
    assert(f.match === 'different' && f.checked === true, j(f));
  });
  await test('N6 no reviewer / no verdict / program tier are named states', async () => {
    assert((await net([], [])).reason === 'no-reviewer', 'no-reviewer');
    assert((await net([], ['rev'])).reason === 'no-reviewer-verdict', 'no-reviewer-verdict');
    assert((await net([], ['rev'], { programTier: true })).reason === 'program-tier', 'program-tier');
  });

  await test('W1 whitelist: supersession and verdictFreshness SURVIVE the summary pick (they reach the card)', () => {
    const picked = pickResultJsonSummary({ supersession: { skipped: 'changed-input' }, verdictFreshness: { match: 'same' }, finalResponse: 'x' });
    assert(j(picked.supersession) === j({ skipped: 'changed-input' }) && j(picked.verdictFreshness) === j({ match: 'same' }), j(picked));
  });
  await test('W2 card render-WHAT: a lost retry names its winner; a skip says it stays authoritative; keep-best-error is named', () => {
    assert(/supersession: superseded by exec-1 \(structural-collapse\)/.test(leanFactsLine({ supersession: { supersededById: 'exec-1', reasons: ['structural-collapse: x'] } }) ?? ''), 'lost');
    assert(/comparison skipped \(changed-input\)/.test(leanFactsLine({ supersession: { skipped: 'changed-input' } }) ?? ''), 'skipped');
    assert(/NOT compared \(keep-best-error\)/.test(leanFactsLine({ supersession: { checked: false, reason: 'keep-best-error' } }) ?? ''), 'error');
  });
  await test('W3 card: absence renders NOTHING (never "not superseded" / never "fresh")', () => {
    assert(leanFactsLine({}) === null, 'an empty exec must render no facts');
    assert(!/verdictFreshness/.test(leanFactsLine({ verdictFreshness: { checked: false, reason: 'no-reviewer' } }) ?? ''), 'no-reviewer is silent');
  });

  console.log('\nPart 2 — agent.results through the router (real database)');
  if (!process.env.DATABASE_URL) {
    console.log('  ⏭️  skipped — DATABASE_URL not set');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TasksActionRouter } = require('../lib/mcp/tasks/action/tasks-action-router') as typeof import('../lib/mcp/tasks/action/tasks-action-router');
    const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
    const country = await prisma.country.findFirst({ select: { id: true } });
    if (!owner || !country) throw new Error('fixture needs an ADMIN and a Country');
    const user = { userId: owner.id, email: owner.email, role: 'ADMIN' } as any;
    const router = new TasksActionRouter();
    const results = async (taskId: string) => {
      const r: any = await router.route('agent.results', { taskId }, user, `test-${Date.now()}`);
      return r.result ?? r.data?.result ?? r;
    };
    const now = new Date(); const future = new Date(now.getTime() + 30 * 86400000);
    const pov = await prisma.pOV.create({ data: { title: `__test_c3_${Date.now()}`, description: 'RWF C.3 fixture',
      ownerId: owner.id, status: 'PROJECTED', startDate: now, endDate: future, salesTheatre: 'NORTH_AMERICA', countryId: country.id } });
    const phase = await prisma.phase.create({ data: { name: 'P', type: 'EXECUTION', povId: pov.id, order: 0, description: '', startDate: now, endDate: future } });
    const stage = await prisma.stage.create({ data: { name: 'S', phaseId: phase.id, order: 1 } });
    let clock = Date.now() - 3_600_000;
    const exec = async (taskId: string, status: string, extra: Record<string, unknown> = {}, finalResponse = 'body') => {
      const e = await prisma.agentExecution.create({ data: { taskId, status, config: {}, context: {}, logs: [],
        createdAt: new Date((clock += 1000)), ...extra } as any });
      if (status === 'SUCCESS') await prisma.agentArtifact.create({ data: { executionId: e.id, name: 'result.json', type: 'application/json',
        content: JSON.stringify({ taskId, finalResponse }) } });
      return e;
    };
    try {
      const A = await prisma.task.create({ data: { title: 'author', povId: pov.id, stageId: stage.id, type: 'ACTION' as any, agentRole: 'config_change_author' } });
      const e0 = await exec(A.id, 'FAILED'); // OLDEST, reaped before it started: startTime NULL
      const e1 = await exec(A.id, 'SUCCESS', { startTime: new Date(clock) });
      const e2 = await exec(A.id, 'SUCCESS', { startTime: new Date(clock) });
      await prisma.agentExecution.update({ where: { id: e2.id }, data: { supersededById: e1.id } }); // a retry that LOST
      const e3 = await exec(A.id, 'FAILED', { startTime: new Date(clock) }); // newest

      await test('R1 order is createdAt DESC: an OLDER never-started row (NULL startTime) does not jump ahead of the newest', async () => {
        const r = await results(A.id);
        assert(r.executions[0].id === e3.id, `first=${r.executions[0]?.id} (e0, the old NULL-startTime row, is ${e0.id})`);
      });
      await test('R2 the latest FAILED execution stays visible (the harness Step 1 reads it)', async () => {
        const r = await results(A.id);
        assert(r.executions.some((x: any) => x.id === e3.id && x.status === 'FAILED'), 'FAILED hidden');
      });
      await test('R3 a superseded retry is HIDDEN from the list but LISTED in supersededRetries — never invisible', async () => {
        const r = await results(A.id);
        assert(!r.executions.some((x: any) => x.id === e2.id), 'superseded row still listed');
        assert(j(r.supersededRetries) === j([{ id: e2.id, supersededById: e1.id }]), j(r.supersededRetries));
      });
      await test('R4 authoritativeExecutionId is the chainer\'s selection (the original, not the lost retry nor the FAILED run)', async () => {
        const r = await results(A.id);
        assert(r.authoritativeExecutionId === e1.id, `${r.authoritativeExecutionId} vs ${e1.id}`);
      });

      const R = await prisma.task.create({ data: { title: 'reviewer', povId: pov.id, stageId: stage.id, type: 'ACTION' as any, agentRole: 'change_reviewer' } });
      await test('R5 verdictFresh on a reviewer card: yes while its Author is unchanged, no after the Author re-runs', async () => {
        await exec(R.id, 'SUCCESS', { context: { chainedPredecessors: { status: 'chained', ids: { [A.id]: e1.id } } } });
        const before = await results(R.id);
        assert(before.executions[0].verdictFresh === 'yes', `before: ${before.executions[0].verdictFresh}`);
        await exec(A.id, 'SUCCESS'); // the Author re-runs ⇒ a new authoritative Author
        const after = await results(R.id);
        assert(after.executions[0].verdictFresh === 'no', `after: ${after.executions[0].verdictFresh}`);
        assert(after.executions[0].verdictFreshPredecessors?.some((p: any) => p.taskId === A.id && p.match === false), j(after.executions[0].verdictFreshPredecessors));
      });
      await test('R6 a non-reviewer card carries no verdictFresh at all', async () => {
        const r = await results(A.id);
        assert(r.executions.every((x: any) => x.verdictFresh === undefined), 'author card has verdictFresh');
      });

      await test('R7 m1: a leg with an interim SYNTHESIZE (S#1) and a later one (S#2) — agent.results leads with S#2 and names it authoritative', async () => {
        const H = await prisma.task.create({ data: { title: 'leg', povId: pov.id, stageId: stage.id, type: 'PIPELINE' as any,
          status: 'IN_PROGRESS', metadata: { pipelineStageId: stage.id } } });
        const s1 = await exec(H.id, 'SUCCESS', { context: { deadEndExempt: true } }, 'interim S#1 — a child was re-executed');
        const s2 = await exec(H.id, 'SUCCESS', {}, 'final S#2');
        const r = await results(H.id);
        assert(r.executions[0].id === s2.id && r.authoritativeExecutionId === s2.id, `first=${r.executions[0]?.id} auth=${r.authoritativeExecutionId} s1=${s1.id}`);
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
