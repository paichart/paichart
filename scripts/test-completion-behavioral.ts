/**
 * test-completion-behavioral — LIVE-DB behavioral suite for the completion core (3.3b, 2026-07-24).
 *
 * Runs against the LOCAL dev DB (never prod): creates a scratch POV/phase/stage + tasks,
 * exercises completeTaskTerminally end-to-end on real rows, then deletes everything it made.
 * NOT in the CI battery (needs a live DB) — run locally at each adapter-migration commit:
 *   npm run test:completion-behavioral
 *
 * fireReactors stays FALSE throughout: the behavioral surface under test is guards + write +
 * facts, not cascade load (reactor behavior is pinned by test-reactor-race-guard + live probes).
 */
import { prisma } from '../lib/prisma';
import {
  completeTaskTerminally,
} from '../lib/tasks/services/complete-task-terminally';
import { DependencyNotSatisfiedError, PipelineInvariantError, InvalidTransitionError } from '../lib/errors';

let passed = 0, failed = 0;
function ok(desc: string) { passed++; console.log(`✅ ${desc}`); }
function bad(desc: string, detail?: unknown) { failed++; console.log(`❌ ${desc}${detail ? `\n   ${detail}` : ''}`); }
async function test(desc: string, fn: () => Promise<void>) {
  try { await fn(); ok(desc); } catch (e) { bad(desc, e instanceof Error ? e.message : e); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) { console.log('no user in dev DB — cannot run'); process.exit(1); }
  const actor = { userId: user.id, source: 'API' as const };

  // ── scratch rig ──
  const country = await prisma.country.findFirst({ select: { id: true } });
  if (!country) { console.log('no country in dev DB — cannot run'); process.exit(1); }
  const pov = await prisma.pOV.create({
    data: { title: `behavioral-probe ${Date.now()}`, description: 'completion-core behavioral probe (scratch)', salesTheatre: 'APJ', countryId: country.id, ownerId: user.id, startDate: new Date(), endDate: new Date() },
  });
  const phase = await prisma.phase.create({
    data: { name: 'probe', description: 'probe', povId: pov.id, type: 'PLANNING', order: 1, startDate: new Date(), endDate: new Date() },
  });
  const stage = await prisma.stage.create({ data: { name: 'probe', phaseId: phase.id, order: 1000 } });
  const mk = (title: string, data: Record<string, unknown> = {}) =>
    prisma.task.create({
      data: { title, povId: pov.id, phaseId: phase.id, stageId: stage.id, order: 1000, status: 'IN_PROGRESS', type: 'ACTION', ...data } as any,
    });

  try {
    const upstream = await mk('B upstream (IN_PROGRESS)');
    const gate = await mk('B gate', { type: 'APPROVAL' });
    await prisma.taskDependency.create({ data: { taskId: gate.id, dependsOnId: upstream.id } });

    await test('B1 dep-blocked APPROVAL gate throws DependencyNotSatisfiedError; row untouched', async () => {
      let threw: unknown = null;
      try { await completeTaskTerminally(prisma as any, { taskId: gate.id, actor, fireReactors: false }); }
      catch (e) { threw = e; }
      assert(threw instanceof DependencyNotSatisfiedError, `expected dep-block, got ${threw}`);
      const row = await prisma.task.findUnique({ where: { id: gate.id }, select: { status: true, completedAt: true } });
      assert(row!.status === 'IN_PROGRESS' && row!.completedAt === null, 'blocked gate must remain untouched');
    });

    await test('B2 override completes + stamps the enriched audit fact in the SAME write', async () => {
      const r = await completeTaskTerminally(prisma as any, {
        taskId: gate.id, actor, fireReactors: false,
        dependencyOverride: { reason: 'behavioral probe override' },
      });
      assert(r.transitioned, 'must transition');
      const row = await prisma.task.findUnique({ where: { id: gate.id }, select: { status: true, completedAt: true, metadata: true } });
      assert(row!.status === 'COMPLETED' && row!.completedAt !== null, 'completed + completedAt (extension)');
      const fact = (row!.metadata as any)?.completedWithDependencyOverride;
      assert(fact && fact.by === user.id && fact.reason === 'behavioral probe override'
        && Array.isArray(fact.unsatisfiedDepIds) && fact.unsatisfiedDepIds.includes(upstream.id),
        `enriched fact malformed: ${JSON.stringify(fact)}`);
    });

    await test('B3 ripe completion: builder metadata + completion comment land; completedAt set', async () => {
      const t = await mk('B ripe task');
      const r = await completeTaskTerminally(prisma as any, {
        taskId: t.id, actor, fireReactors: false,
        completionNote: 'behavioral note',
        buildUpdateData: (_tx, existing) => ({
          metadata: { ...((existing.metadata as any) || {}), completionSummary: 'behavioral summary' },
        }),
      });
      assert(r.transitioned, 'must transition');
      const row = await prisma.task.findUnique({ where: { id: t.id }, select: { status: true, completedAt: true, metadata: true } });
      assert(row!.status === 'COMPLETED' && row!.completedAt !== null, 'status + completedAt');
      assert((row!.metadata as any)?.completionSummary === 'behavioral summary', 'builder metadata merged');
      const comment = await prisma.comment.findFirst({ where: { taskId: t.id }, select: { text: true } });
      assert(comment?.text === 'behavioral note', 'post-commit completion comment persisted');
    });

    await test('B4 idempotent re-complete: transitioned=false, row untouched', async () => {
      const t = await mk('B idempotent', { status: 'COMPLETED' });
      const before = await prisma.task.findUnique({ where: { id: t.id }, select: { updatedAt: true } });
      const r = await completeTaskTerminally(prisma as any, { taskId: t.id, actor, fireReactors: false });
      assert(r.transitioned === false, 'must be a no-op');
      const after = await prisma.task.findUnique({ where: { id: t.id }, select: { updatedAt: true } });
      assert(after!.updatedAt.getTime() === before!.updatedAt.getTime(), 'no write on the no-op path');
    });

    await test('B5 stage-less PIPELINE rejected by the invariant; no write', async () => {
      const t = await mk('B pipeline', { type: 'PIPELINE' });
      let threw: unknown = null;
      try { await completeTaskTerminally(prisma as any, { taskId: t.id, actor, fireReactors: false }); }
      catch (e) { threw = e; }
      assert(threw instanceof PipelineInvariantError && (threw as PipelineInvariantError).point === 'no-child-stage',
        `expected no-child-stage invariant, got ${threw}`);
      const row = await prisma.task.findUnique({ where: { id: t.id }, select: { status: true } });
      assert(row!.status === 'IN_PROGRESS', 'blocked pipeline must remain untouched');
    });

    await test('B7 bulk intra-batch dependent pair, dependent listed FIRST — both complete (topo sort)', async () => {
      const { TaskBulkService } = await import('../lib/services/taskBulkService');
      const depUp = await mk('B7 upstream');
      const depDown = await mk('B7 dependent');
      await prisma.taskDependency.create({ data: { taskId: depDown.id, dependsOnId: depUp.id } });
      // Dependent listed FIRST. For an ACTION pair this case would pass even with a broken sort,
      // because the dependency guard is APPROVAL-scoped and would never fire — so the test would
      // prove nothing. Making the dependent an APPROVAL gate is what gives the sort teeth: if the
      // batch commits in list order, the gate is evaluated before its upstream and dep-blocks.
      await prisma.task.update({ where: { id: depDown.id }, data: { type: 'APPROVAL' } });
      // FLIP B: BOTH rows now complete — the topo sort commits the upstream first, so the
      // gate's dep-guard passes and it flows through the core (a dep-block here = sort broke).
      const res = await (TaskBulkService as any).bulkUpdateTasks({
        taskIds: [depDown.id, depUp.id], updates: { status: 'COMPLETED' },
        userId: user.id, options: { logActivity: false },
      });
      assert(res.successfulUpdates === 2, `both rows must complete (Flip B): ${JSON.stringify(res.errors)}`);
      const up = await prisma.task.findUnique({ where: { id: depUp.id }, select: { status: true } });
      const down = await prisma.task.findUnique({ where: { id: depDown.id }, select: { status: true, completedAt: true } });
      assert(up!.status === 'COMPLETED' && down!.status === 'COMPLETED' && down!.completedAt !== null,
        'upstream AND dependent gate both COMPLETED in dependency order');
    });

    await test('B8 bulk TERMINAL path strips a forged override key (strip runs BEFORE the delegation)', async () => {
      const { TaskBulkService } = await import('../lib/services/taskBulkService');
      const t = await mk('B8 forgery target');
      const res = await (TaskBulkService as any).bulkUpdateTasks({
        taskIds: [t.id],
        updates: { status: 'COMPLETED', metadata: { completedWithDependencyOverride: { by: 'FORGED' }, b8Marker: 'yes' } },
        userId: user.id, options: { logActivity: false },
      });
      assert(res.successfulUpdates === 1, `row must complete: ${JSON.stringify(res.errors)}`);
      const row = await prisma.task.findUnique({ where: { id: t.id }, select: { metadata: true } });
      const meta = row!.metadata as any;
      assert(meta?.b8Marker === 'yes', 'sibling metadata key must persist (merge ran)');
      assert(meta?.completedWithDependencyOverride === undefined,
        `forged override key must be STRIPPED on the terminal path: ${JSON.stringify(meta?.completedWithDependencyOverride)}`);
    });

    await test('B9 updateTask terminal delegation (wave 4): generic completes via core; APPROVAL interim-rejected; mixed fields ride the ONE write', async () => {
      const { TaskService } = await import('../lib/tasks/services/task');
      const t = await mk('B9 generic via updateTask');
      const updated = await (TaskService as any).updateTask(
        t.id, { status: 'COMPLETED', priority: 'HIGH', metadata: { b9: 'rode-along' } }, user.id
      );
      const row = await prisma.task.findUnique({ where: { id: t.id }, select: { status: true, priority: true, completedAt: true, metadata: true } });
      assert(row!.status === 'COMPLETED' && row!.completedAt !== null, 'must complete via the core');
      assert(row!.priority === 'HIGH', 'non-status field must ride the same write');
      assert((row!.metadata as any)?.b9 === 'rode-along', 'metadata must ride the same write');
      assert(updated?.id === t.id, 'updateTask must still return the hydrated task');

      // FLIP A: a ripe APPROVAL now COMPLETES via the web funnel (interim reject gone; the
      // cascade fires — a no-op on this dependent-less scratch gate).
      const gate2 = await mk('B9 approval via updateTask', { type: 'APPROVAL' });
      await (TaskService as any).updateTask(gate2.id, { status: 'COMPLETED' }, user.id);
      const g2row = await prisma.task.findUnique({ where: { id: gate2.id }, select: { status: true, completedAt: true } });
      assert(g2row!.status === 'COMPLETED' && g2row!.completedAt !== null,
        'FLIP A: ripe APPROVAL must complete via updateTask (GUI gate release is first-class)');
    });

    await test('B11 (F2) completedAt is a STABLE forensic fact — a same-status re-write must not move it', async () => {
      const { TaskService } = await import('../lib/tasks/services/task');
      const t = await mk('B11 completedAt stability');

      await (TaskService as any).updateTask(t.id, { status: 'COMPLETED' }, user.id);
      const first = await prisma.task.findUnique({ where: { id: t.id }, select: { completedAt: true } });
      assert(first!.completedAt !== null, 'precondition: the completion must stamp completedAt');

      // Wall-clock gap so a restamp is unambiguously detectable (the extension writes `now`).
      await new Promise((r) => setTimeout(r, 1100));

      // The same-status re-PATCH: pre.status === 'COMPLETED' so updateTask does NOT route to the
      // core (no transition) — it falls through to the ordinary tx, where assembleUpdateData used
      // to re-include status:'COMPLETED'. The completedAt query extension stamps `now` on ANY
      // payload containing status:'COMPLETED' and cannot see the row's prior status (it runs at
      // the write; the pre-image is unavailable), so the re-write silently moved the timestamp.
      await (TaskService as any).updateTask(t.id, { status: 'COMPLETED', priority: 'LOW' }, user.id);

      const second = await prisma.task.findUnique({ where: { id: t.id }, select: { completedAt: true, priority: true, status: true } });
      assert(second!.priority === 'LOW', 'the non-status field must still apply (we omit status, not the whole write)');
      assert(second!.status === 'COMPLETED', 'status must remain COMPLETED');
      assert(second!.completedAt?.getTime() === first!.completedAt?.getTime(),
        `completedAt MOVED ${first!.completedAt?.toISOString()} → ${second!.completedAt?.toISOString()} — F2 regression. completedAt exists to be the real completion time (schema.prisma:308); a same-status re-write must omit status from the payload so the extension leaves it alone.`);
    });

    await test('B11b (F2) MCP task.update — same-status COMPLETED re-send must not move completedAt', async () => {
      const { handleTaskUpdate } = await import('../lib/mcp/tasks/action/handlers/task/task-update-handler');
      const t = await mk('B11b MCP completedAt stability');
      await handleTaskUpdate({ taskId: t.id, status: 'COMPLETED' }, { userId: user.id } as any, 'behavioral-b11b-1');
      const first = await prisma.task.findUnique({ where: { id: t.id }, select: { completedAt: true } });
      assert(first!.completedAt !== null, 'precondition: the completion must stamp completedAt');

      await new Promise((r) => setTimeout(r, 1100));

      // Distinct site from B11: this handler dropped `status` only when TRANSITIONING to
      // COMPLETED (delegating to the core). A same-status re-send took the ordinary-write branch
      // with status still in the payload, so the extension restamped.
      await handleTaskUpdate(
        { taskId: t.id, status: 'COMPLETED', description: 'b11b re-send' },
        { userId: user.id } as any, 'behavioral-b11b-2'
      );
      const second = await prisma.task.findUnique({ where: { id: t.id }, select: { completedAt: true, description: true } });
      assert(second!.description === 'b11b re-send', 'the non-status field must still apply');
      assert(second!.completedAt?.getTime() === first!.completedAt?.getTime(),
        `completedAt MOVED via MCP task.update ${first!.completedAt?.toISOString()} → ${second!.completedAt?.toISOString()} — F2 regression at the MCP site.`);
    });

    await test('B12 (F3) dependency rewrite is ATOMIC — a failing edge leaves the ORIGINAL set intact', async () => {
      const { TaskService } = await import('../lib/tasks/services/task');
      const target = await mk('B12 rewrite target');
      const depA = await mk('B12 dep A');
      const depB = await mk('B12 dep B');
      await prisma.taskDependency.create({ data: { taskId: target.id, dependsOnId: depA.id } });

      const before = await prisma.taskDependency.findMany({ where: { taskId: target.id }, select: { dependsOnId: true } });
      assert(before.length === 1 && before[0].dependsOnId === depA.id, 'precondition: exactly one edge (A)');

      // Rewrite [A] → [B, <nonexistent>]. The bogus id fails the FK on create, AFTER the delete of
      // A has already been issued. Pre-F3 the delete was a separate round-trip and had already
      // COMMITTED, so the failure left the task with ZERO edges — silently un-gating it, since
      // assertCompletionDependenciesSatisfied now enforces these edges on human completion.
      // In one tx the whole rewrite rolls back and A survives.
      let threw: unknown = null;
      try {
        await (TaskService as any).updateTask(target.id, { dependencyIds: [depB.id, 'cnonexistent0000000000000'] }, user.id);
      } catch (e) { threw = e; }
      assert(threw !== null, 'the bogus dependency id must surface as an error, not be swallowed');

      const after = await prisma.taskDependency.findMany({ where: { taskId: target.id }, select: { dependsOnId: true } });
      assert(after.length === 1 && after[0].dependsOnId === depA.id,
        `dependency rewrite was NOT atomic — edges are now [${after.map(d => d.dependsOnId).join(', ')}], expected the original [A]. A partial rewrite can leave a gate wrongly completable (edges lost) or wrongly blocked.`);
    });

    await test('B10 task.update handler (wave 5): metadata+COMPLETED one call — merge visible to guards, single atomic completion', async () => {
      const { handleTaskUpdate } = await import('../lib/mcp/tasks/action/handlers/task/task-update-handler');
      const t = await mk('B10 via task.update handler');
      const res = await handleTaskUpdate(
        { taskId: t.id, status: 'COMPLETED', metadata: { b10Marker: 'merged-in-same-call' } },
        { userId: user.id } as any,
        'behavioral-b10'
      );
      assert(res?.result?.task?.status === 'COMPLETED', `handler response must show COMPLETED: ${JSON.stringify(res?.result?.task?.status)}`);
      const row = await prisma.task.findUnique({ where: { id: t.id }, select: { status: true, completedAt: true, metadata: true } });
      assert(row!.status === 'COMPLETED' && row!.completedAt !== null, 'completed + completedAt');
      assert((row!.metadata as any)?.b10Marker === 'merged-in-same-call', 'metadata merge must ride the same tx as the completion');

      // Status-ONLY call — the commonest agent shape; after the wave-5 status-delete the
      // ordinary write's data can be slim/empty, which must remain a legal Prisma update
      // (audit-5 probe pinned here).
      const tOnly = await mk('B10 status-only');
      const resOnly = await handleTaskUpdate({ taskId: tOnly.id, status: 'COMPLETED' }, { userId: user.id } as any, 'behavioral-b10c');
      const rowOnly = await prisma.task.findUnique({ where: { id: tOnly.id }, select: { status: true, completedAt: true } });
      assert(rowOnly!.status === 'COMPLETED' && rowOnly!.completedAt !== null && resOnly?.result?.task?.status === 'COMPLETED',
        'status-only task.update must complete via the composition');

      const gate3 = await mk('B10 dep-blocked gate', { type: 'APPROVAL' });
      const up3 = await mk('B10 upstream open', { status: 'IN_PROGRESS' });
      await prisma.taskDependency.create({ data: { taskId: gate3.id, dependsOnId: up3.id } });
      let threw: unknown = null;
      try { await handleTaskUpdate({ taskId: gate3.id, status: 'COMPLETED' }, { userId: user.id } as any, 'behavioral-b10b'); }
      catch (e) { threw = e; }
      assert(threw instanceof DependencyNotSatisfiedError, `dep-blocked APPROVAL via handler must throw typed dep-block, got ${threw}`);
      const gateRow = await prisma.task.findUnique({ where: { id: gate3.id }, select: { status: true } });
      assert(gateRow!.status === 'IN_PROGRESS', 'blocked gate untouched — the whole tx (incl. any field writes) rolled back');
    });

    await test('B6 OPEN task rejected by the transition machine; no write', async () => {
      const t = await mk('B open', { status: 'OPEN' });
      let threw: unknown = null;
      try { await completeTaskTerminally(prisma as any, { taskId: t.id, actor, fireReactors: false }); }
      catch (e) { threw = e; }
      // F4 (2026-07-25): typed. Asserts the CODE and the structured facts too — a message-only
      // check would still pass if the error class regressed to a plain Error.
      assert(threw instanceof InvalidTransitionError, `expected InvalidTransitionError, got ${threw}`);
      const te = threw as InvalidTransitionError;
      assert(te.code === 'INVALID_TRANSITION', `expected code INVALID_TRANSITION, got ${te.code}`);
      assert(te.from === 'OPEN' && te.to === 'COMPLETED', `expected OPEN→COMPLETED facts, got ${te.from}→${te.to}`);
      assert(/Invalid task status transition/.test(te.message),
        'message text must stay byte-stable — the seeded protocol prompts quote it to agents');
    });
  } finally {
    // ── teardown (FK order) ──
    await prisma.comment.deleteMany({ where: { task: { povId: pov.id } } });
    await prisma.taskDependency.deleteMany({ where: { task: { povId: pov.id } } });
    await prisma.taskActivity.deleteMany({ where: { task: { povId: pov.id } } });
    await prisma.task.deleteMany({ where: { povId: pov.id } });
    await prisma.stage.delete({ where: { id: stage.id } }).catch(() => {});
    await prisma.phase.delete({ where: { id: phase.id } }).catch(() => {});
    await prisma.pOV.delete({ where: { id: pov.id } }).catch(() => {});
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
