/**
 * test-completion-tx-shape — statement-shape fixture for runTaskCompletionTx (Phase 2, 2026-07-24).
 *
 * The test-terminal-persist-shape.ts analog for the completion core: drives Layer 1 with a
 * RECORDING mock tx and pins the in-tx statement ORDER + the CAS write shape. Catches silent
 * reorderings (guards after the write, reactor calls smuggled in-tx, CAS de-gated) that the
 * source-pattern boundary test cannot.
 */
// Stub BEFORE imports — the core's import graph reaches lib/prisma.ts transitively
// (taskReadyReactorService), which throws without DATABASE_URL (CI stub pattern).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://fake:fake@localhost:5432/fake';
process.env.LOG_LEVEL = 'silent';

import {
  runTaskCompletionTx,
  type TaskCompletionTxInput,
} from '../lib/tasks/services/complete-task-terminally';
import { DependencyNotSatisfiedError, CompletionConflictError } from '../lib/errors';

let passed = 0, failed = 0;
function test(desc: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`✅ ${desc}`); })
    .catch((e) => { failed++; console.log(`❌ ${desc}\n   ${e instanceof Error ? e.message : e}`); });
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

interface Call { op: string; args: any }

function makeMockTx(opts: {
  status?: string; type?: string; unsatisfied?: boolean; casCount?: number;
}) {
  const calls: Call[] = [];
  let findCount = 0;
  const row = {
    id: 't1', status: opts.status ?? 'IN_PROGRESS', type: opts.type ?? 'ACTION',
    metadata: null, title: 'fixture task',
  };
  const tx: any = {
    task: {
      findUnique: async (args: any) => {
        calls.push({ op: 'task.findUnique', args });
        findCount++;
        // 1st = fresh read; guard's own type read; final = post-write re-read
        if (args?.select?.type && !args?.select?.status && Object.keys(args.select).length === 1) {
          return { type: row.type };
        }
        return findCount === 1 ? row : { ...row, status: 'COMPLETED' };
      },
      updateMany: async (args: any) => {
        calls.push({ op: 'task.updateMany', args });
        return { count: opts.casCount ?? 1 };
      },
      count: async (args: any) => { calls.push({ op: 'task.count', args }); return 1; },
    },
    stage: {
      findUnique: async (args: any) => { calls.push({ op: 'stage.findUnique', args }); return { metadata: { harnessTaskId: 't1' } }; },
    },
    $queryRaw: async (..._a: any[]) => {
      calls.push({ op: '$queryRaw', args: null });
      // 1st raw = hasUnsatisfiedDeps; 2nd (only when unsatisfied) = listUnsatisfiedDeps
      const rawCalls = calls.filter((c) => c.op === '$queryRaw').length;
      if (rawCalls === 1) return [{ unsatisfied: opts.unsatisfied ?? false }];
      return [{ dependsOnId: 'u1', title: 'upstream', status: 'IN_PROGRESS', unsettledPipeline: false }];
    },
  };
  return { tx, calls };
}

const baseInput = (over: Partial<TaskCompletionTxInput> = {}): TaskCompletionTxInput => ({
  taskId: 't1',
  actor: { userId: 'user1', source: 'MCP' },
  ...over,
});

async function main() {
  await test('S1 order: fresh read → guard → CAS updateMany (status-gated) → re-read; APPROVAL scope no-ops for ACTION', async () => {
    const { tx, calls } = makeMockTx({ type: 'ACTION' });
    const res = await runTaskCompletionTx(tx, baseInput());
    assert(res.transitioned === true, 'must transition');
    const ops = calls.map((c) => c.op);
    assert(ops[0] === 'task.findUnique', 'first statement must be the fresh in-tx read');
    const um = ops.indexOf('task.updateMany');
    assert(um > 0, 'CAS updateMany must run');
    assert(ops.lastIndexOf('task.findUnique') > um, 'post-write re-read must follow the CAS');
    // ACTION task: dep-guard reads type then structurally no-ops — NO $queryRaw for out-of-scope types
    assert(!ops.includes('$queryRaw'), 'ACTION task must not pay the dep predicate (APPROVAL scope inside the guard)');
    const cas = calls.find((c) => c.op === 'task.updateMany')!.args;
    assert(cas.where.id === 't1' && cas.where.status === 'IN_PROGRESS', 'CAS where must gate on the validated status');
    assert(cas.data.status === 'COMPLETED', 'CAS data must set COMPLETED');
  });

  await test('S2 APPROVAL satisfied: predicate runs in-tx BEFORE the write', async () => {
    const { tx, calls } = makeMockTx({ type: 'APPROVAL', unsatisfied: false });
    const res = await runTaskCompletionTx(tx, baseInput());
    assert(res.transitioned === true, 'must transition');
    const ops = calls.map((c) => c.op);
    const raw = ops.indexOf('$queryRaw');
    const um = ops.indexOf('task.updateMany');
    assert(raw > 0 && um > raw, 'dep predicate must run in-tx and precede the CAS write');
  });

  await test('S3 APPROVAL dep-blocked: DependencyNotSatisfiedError, ZERO writes', async () => {
    const { tx, calls } = makeMockTx({ type: 'APPROVAL', unsatisfied: true });
    let threw: unknown = null;
    try { await runTaskCompletionTx(tx, baseInput()); } catch (e) { threw = e; }
    assert(threw instanceof DependencyNotSatisfiedError, `must throw DependencyNotSatisfiedError (got ${threw})`);
    assert(!calls.some((c) => c.op === 'task.updateMany'), 'a blocked completion must perform NO write');
  });

  await test('S4 already-COMPLETED: transitioned=false, no validation, no write (idempotent re-complete)', async () => {
    const { tx, calls } = makeMockTx({ status: 'COMPLETED' });
    const res = await runTaskCompletionTx(tx, baseInput());
    assert(res.transitioned === false, 'must report no transition');
    assert(calls.length === 1 && calls[0].op === 'task.findUnique', 'only the fresh read may run');
  });

  await test('S5 CAS raced (count 0): CompletionConflictError', async () => {
    const { tx } = makeMockTx({ casCount: 0 });
    let threw: unknown = null;
    try { await runTaskCompletionTx(tx, baseInput()); } catch (e) { threw = e; }
    assert(threw instanceof CompletionConflictError, `must throw CompletionConflictError (got ${threw})`);
  });

  await test('S6 builder attempting a status write is rejected (seam smuggling pin)', async () => {
    const { tx } = makeMockTx({});
    let threw: unknown = null;
    try {
      await runTaskCompletionTx(tx, baseInput({ buildUpdateData: () => ({ status: 'OPEN' }) }));
    } catch (e) { threw = e; }
    assert(threw instanceof Error && /must not set status/.test((threw as Error).message),
      'buildUpdateData returning status must hard-fail');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  // Explicit exit BOTH ways: the fake-DSN stub's prisma pool (initialized transitively via the
  // reactor-service import) fails async after the suite ends — without this, its unhandled
  // rejection turns a 6/6 green run into exit code 1.
  process.exit(failed > 0 ? 1 : 0);
}

main();
