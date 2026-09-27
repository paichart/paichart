#!/usr/bin/env ts-node
/**
 * RWF "A, agent-only" (Steve, 2026-09-27): task.create / task.update may not set modelParameters from inside an agent run
 * (the call carries callingExecutionId). Humans on MCP keep the capability; the GUI route is separate and untouched.
 * The refusal fires at the router, after validation and before any handler, so these cases need no database.
 */
// CI guard: the router's handler imports reach lib/prisma.ts, whose module init needs a DATABASE_URL. No DB is queried here.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub?sslmode=disable';
}
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { modelParametersWritePaths, refuseAgentLoopModelParameters } = require('@/lib/services/leg-child-override') as
  typeof import('@/lib/services/leg-child-override');

let passed = 0; const failed: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const silent = { warn: () => {} };
const LOOP = 'cmexec00000000000000000001';
const TASK = 'cmtask00000000000000000001';
const refused = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return e as any; } };

(async () => {
  console.log('\n🧪 Agent runs may not set model parameters (task.create / task.update)\n');

  await test('P1 detector finds every place modelParameters can hide (incl. a JSON-string metadata and nested updates)', () => {
    assert(modelParametersWritePaths({ metadata: { modelParameters: { model: 'x' } } }).join() === 'metadata.modelParameters', 'metadata');
    assert(modelParametersWritePaths({ metadata: JSON.stringify({ modelParameters: {} }) }).join() === 'metadata.modelParameters', 'string metadata');
    assert(modelParametersWritePaths({ updates: { metadata: { modelParameters: {} } } }).join() === 'updates.metadata.modelParameters', 'nested');
    assert(modelParametersWritePaths({ modelParameters: { model: 'x' } }).join() === 'modelParameters', 'top-level');
    assert(modelParametersWritePaths({ metadata: { qualityGate: { outcome: 'approved' } } }).length === 0, 'harness metadata stamps must not match');
  });
  await test('P2 refused for an agent run on task.update AND task.create — 400, the path named', () => {
    for (const action of ['task.update', 'task.create']) {
      const e = refused(() => refuseAgentLoopModelParameters(action, { metadata: { modelParameters: { model: 'cheap' } } }, LOOP, silent));
      assert(e?.code === 'AGENT_MODEL_PARAMETERS_REFUSED' && e.statusCode === 400 && /metadata\.modelParameters/.test(e.message), `${action}: ${e?.message}`);
    }
  });
  await test('P3 NOT refused: a human caller (no callingExecutionId), other metadata from an agent, other actions', () => {
    assert(!refused(() => refuseAgentLoopModelParameters('task.update', { metadata: { modelParameters: { model: 'x' } } }, undefined, silent)), 'human refused');
    assert(!refused(() => refuseAgentLoopModelParameters('task.update', { metadata: { qualityGate: { outcome: 'approved' } } }, LOOP, silent)), 'harness stamp refused');
    assert(!refused(() => refuseAgentLoopModelParameters('agent.assign', { modelParameters: { model: 'x' } }, LOOP, silent)), 'other action refused');
  });
  await test('R1 the router calls the refusal BEFORE the handler switch (source check)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib/mcp/tasks/action/tasks-action-router.ts'), 'utf8');
    const iRefuse = src.indexOf('refuseAgentLoopModelParameters(action, parameters, routeOpts?.callingExecutionId, log)');
    const iSwitch = src.indexOf('switch (action) {');
    assert(iRefuse > 0 && iSwitch > iRefuse, `refuse ${iRefuse} must precede the switch ${iSwitch}`);
  });

  await test('R2 through the REAL router: an agent run task.update with metadata.modelParameters is refused before any handler', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TasksActionRouter } = require('@/lib/mcp/tasks/action/tasks-action-router') as typeof import('@/lib/mcp/tasks/action/tasks-action-router');
    const user = { userId: 'cmuser00000000000000000001', email: 'u@example.test', role: 'USER' } as any;
    let err: any = null;
    // Raced: without the refusal the call reaches the handler, which would wait on the (stub) database — that must read
    // as a failure here, not as a hang.
    const call = new TasksActionRouter().route('task.update', { taskId: TASK, metadata: { modelParameters: { model: 'cheap' } } }, user, 'r1', { callingExecutionId: LOOP });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('REACHED_HANDLER (no refusal within 10s)')), 10_000));
    try { await Promise.race([call, timeout]); } catch (e) { err = e; }
    assert(err?.code === 'AGENT_MODEL_PARAMETERS_REFUSED', `got ${err?.code}: ${err?.message}`);
  });
  console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0); // explicit: a stray DB connection attempt must not keep the process alive
})();
