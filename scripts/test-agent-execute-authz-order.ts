#!/usr/bin/env ts-node
/**
 * S0 (2026-09-26) — agent.execute writes NOTHING and echoes no task content before (or instead of)
 * passing the POV access check, and a dependency-refused call writes nothing either.
 *
 * Behavioural half of the S0 pins (the positional half is section O of test-security-invariants.ts).
 * Before S0 the handler auto-assigned the Pipeline Harness template, echoed the task title in a
 * "not configured" error, and flipped OPEN→IN_PROGRESS — all BEFORE validatePOVAccess — so any
 * authenticated caller holding another tenant's task id could modify it and learn its title. The early
 * flip also stranded AUTHORIZED callers: a dependency-refused task was left IN_PROGRESS, and the task-ready
 * reactor only queues OPEN tasks.
 * Review: cline_docs/reviews/rwf-stage1-2026-09-26/sec-ops-S0-review.md §5 (T4, T5).
 *
 * No database: the prisma singleton's delegates are replaced by recording fakes. Every write the handler
 * attempts is recorded; unmodelled delegate calls THROW, so a new pre-auth read or write cannot pass by
 * silently returning nothing.
 */

// CI guard: the handler imports lib/prisma.ts, whose module init needs a DATABASE_URL.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub?sslmode=disable';
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const prismaModule = require('@/lib/prisma') as typeof import('@/lib/prisma');

type Call = { delegate: string; op: string; args: unknown };
let calls: Call[] = [];
const writes = () => calls.filter((c) => /^(update|updateMany|create|createMany|upsert|delete|deleteMany)$/.test(c.op));

function fakeDelegate(name: string, impl: Record<string, (args: any) => unknown>) {
  return new Proxy({}, {
    get(_t, op: string) {
      return async (args: unknown) => {
        calls.push({ delegate: name, op, args });
        const fn = impl[op];
        if (!fn) throw new Error(`UNMODELLED prisma.${name}.${op} — add it to the fake or the handler gained a call`);
        return fn(args);
      };
    },
  });
}

const TITLE = 'Tenant-B confidential task title';
const OWNER = 'cmowner00000000000000000b';
const FOREIGN = 'cmforeign000000000000000a';

function install(opts: { taskType: string; configured: boolean; deps?: Array<Record<string, unknown>>; activeDepExec?: boolean;
  /** RWF D1: the task's stage, whether that stage names an owning harness, and whether a PIPELINE claims it. */
  stageId?: string | null; backPointer?: boolean; ownedViaPipelineStageId?: boolean }) {
  const task = {
    id: 'cmtask00000000000000000001', title: TITLE, type: opts.taskType, status: 'OPEN', stageId: opts.stageId ?? null,
    agentTemplateId: opts.configured ? 'cmtpl000000000000000000001' : null,
    agentRole: opts.configured ? 'role' : null, prompt: opts.configured ? 'p' : null,
    pov: { id: 'cmpov00000000000000000001', ownerId: OWNER, metadata: {}, team: { members: [] } },
  };
  const p = prismaModule.prisma as any;
  const replace = (key: string, value: unknown) => Object.defineProperty(p, key, { value, configurable: true, writable: true });
  replace('task', fakeDelegate('task', { findUnique: () => task, update: () => task, updateMany: () => ({ count: 1 }) }));
  replace('agentTemplate', fakeDelegate('agentTemplate', {
    findFirst: () => ({ id: 'cmtplharness0000000000001', name: 'Pipeline Harness', defaultRole: 'pipeline_harness_orchestrator' }),
  }));
  replace('taskDependency', fakeDelegate('taskDependency', { findMany: () => opts.deps ?? [] }));
  replace('stage', fakeDelegate('stage', {
    findUnique: () => ({ metadata: opts.backPointer ? { harnessTaskId: 'cmharness0000000000000001' } : {} }),
  }));
  replace('$queryRaw', async (...args: unknown[]) => {
    calls.push({ delegate: '$queryRaw', op: 'query', args });
    return opts.ownedViaPipelineStageId ? [{ id: task.id }] : [];
  });
  replace('agentExecution', fakeDelegate('agentExecution', {
    findMany: () => (opts.activeDepExec ? [{ taskId: 'cmdep000000000000000000001' }] : []),
  }));
}

const user = (userId: string, role: string) => ({ userId, email: `${userId}@example.test`, role } as any);

let passed = 0;
const failed: string[] = [];
async function test(name: string, fn: () => Promise<void>) {
  calls = [];
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

async function expectRefusal(run: () => Promise<unknown>): Promise<Error> {
  try { await run(); } catch (e) { return e as Error; }
  throw new Error('expected the call to be refused, but it returned');
}

(async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { handleAgentExecute } = require('@/lib/mcp/tasks/action/handlers/agent/agent-execute-handler') as
    typeof import('@/lib/mcp/tasks/action/handlers/agent/agent-execute-handler');

  console.log('🧪 S0 — agent.execute authorisation order\n');

  await test('T4a cross-tenant USER on an OPEN template-less PIPELINE task: refused, zero writes, no title', async () => {
    install({ taskType: 'PIPELINE', configured: false });
    const err = await expectRefusal(() => handleAgentExecute({ taskId: 'cmtask00000000000000000001' }, user(FOREIGN, 'USER'), 'a1'));
    assert(/access/i.test(err.message), `expected an access denial, got: ${err.message}`);
    assert(writes().length === 0, `expected no writes, got ${JSON.stringify(writes().map((c) => `${c.delegate}.${c.op}`))}`);
    assert(!err.message.includes(TITLE), 'the refusal echoed the foreign task title');
    assert(!calls.some((c) => c.delegate === 'taskDependency'), 'dependency read ran before the access check');
    assert(!calls.some((c) => c.delegate === 'agentTemplate'), 'template lookup ran before the access check');
  });

  await test('T4b cross-tenant USER on an OPEN template-less non-PIPELINE task: refused, no "not configured" title echo', async () => {
    install({ taskType: 'ACTION', configured: false });
    const err = await expectRefusal(() => handleAgentExecute({ taskId: 'cmtask00000000000000000001' }, user(FOREIGN, 'USER'), 'a2'));
    assert(/access/i.test(err.message), `expected an access denial, got: ${err.message}`);
    assert(!err.message.includes(TITLE), 'the refusal echoed the foreign task title');
    assert(writes().length === 0, 'expected no writes');
  });

  await test('T4c cross-tenant USER on an OPEN configured task: refused, zero writes (no status flip)', async () => {
    install({ taskType: 'ACTION', configured: true });
    await expectRefusal(() => handleAgentExecute({ taskId: 'cmtask00000000000000000001' }, user(FOREIGN, 'USER'), 'a3'));
    assert(writes().length === 0, 'expected no writes');
  });

  await test('T4d DEMO_USER on a demo POV they do not own: refused before any write (demo-write fix preserved)', async () => {
    install({ taskType: 'PIPELINE', configured: false });
    (prismaModule.prisma as any).task = fakeDelegate('task', {
      findUnique: () => ({ id: 'cmtask00000000000000000001', title: TITLE, type: 'PIPELINE', status: 'OPEN',
        agentTemplateId: null, agentRole: null, prompt: null,
        pov: { id: 'cmpov00000000000000000001', ownerId: OWNER, metadata: { isDemo: true }, team: { members: [] } } }),
    });
    const err = await expectRefusal(() => handleAgentExecute({ taskId: 'cmtask00000000000000000001' }, user(FOREIGN, 'DEMO_USER'), 'a4'));
    assert(/access|read-only|demo/i.test(err.message), `expected a denial, got: ${err.message}`);
    assert(writes().length === 0, 'expected no writes');
  });

  await test('T5a OWNER, dependency incomplete: refused on dependencies, zero writes (no template, no status)', async () => {
    install({ taskType: 'PIPELINE', configured: false,
      deps: [{ dependsOn: { id: 'cmdep000000000000000000001', title: 'Upstream', type: 'ACTION', status: 'IN_PROGRESS', executionStatus: 'RUNNING' } }] });
    const err = await expectRefusal(() => handleAgentExecute({ taskId: 'cmtask00000000000000000001' }, user(OWNER, 'USER'), 'a5'));
    assert(/dependency/i.test(err.message), `expected a dependency refusal, got: ${err.message}`);
    assert(writes().length === 0, `expected no writes, got ${JSON.stringify(writes().map((c) => `${c.delegate}.${c.op}`))}`);
  });

  // ── RWF D1 (2026-09-26; sec-ops-D1-review.md): a pipeline child may override only known modelParameters keys ──
  const OWNER_USER = () => user(OWNER, 'USER');
  const blockDeps = [{ dependsOn: { id: 'cmdep000000000000000000001', title: 'Upstream', type: 'ACTION', status: 'IN_PROGRESS', executionStatus: 'RUNNING' } }];
  const leg = (extra: Record<string, unknown> = {}) => install({ taskType: 'ACTION', configured: true, stageId: 'cmstage00000000000000001', backPointer: true, deps: blockDeps, ...extra });
  const exec = (overrideConfig?: unknown) => handleAgentExecute({ taskId: 'cmtask00000000000000000001', overrideConfig }, OWNER_USER(), 'd1');

  await test('D1a pipeline child (stage names its harness) + overrideConfig.prompt: refused 400 before the dependency read, zero writes', async () => {
    leg();
    const err: any = await expectRefusal(() => exec({ prompt: 'do something else' }));
    assert(err.code === 'LEG_CHILD_OVERRIDE_REFUSED' && err.statusCode === 400, `got ${err.code}/${err.statusCode}: ${err.message}`);
    assert(!calls.some((c) => c.delegate === 'taskDependency'), 'the dependency read ran before the refusal');
    assert(writes().length === 0, 'expected no writes');
  });
  await test('D1b child whose stage has NO back-pointer but a PIPELINE claims it (pipelineStageId) + inputContext: {} — refused', async () => {
    leg({ backPointer: false, ownedViaPipelineStageId: true });
    const err: any = await expectRefusal(() => exec({ inputContext: {} }));
    assert(err.code === 'LEG_CHILD_OVERRIDE_REFUSED', `got ${err.code}: ${err.message}`);
    assert(/suppresses re-chaining/.test(err.message), 'the inputContext effect must be stated');
  });
  await test('D1c modelParameters carrying prompt/agentRole (the F1 bypass) is refused, and names both', async () => {
    leg();
    const err: any = await expectRefusal(() => exec({ modelParameters: { prompt: 'x', agentRole: 'y', temperature: 0.2 } }));
    assert(err.code === 'LEG_CHILD_OVERRIDE_REFUSED' && /modelParameters\.prompt/.test(err.message) && /modelParameters\.agentRole/.test(err.message), err.message);
  });
  await test('D1d a PIPELINE leg in a program stage + agentRole: refused (legs and Node C are pipeline children too)', async () => {
    install({ taskType: 'PIPELINE', configured: true, stageId: 'cmprogstage000000000001', backPointer: true, deps: blockDeps });
    const err: any = await expectRefusal(() => exec({ agentRole: 'change_reviewer' }));
    assert(err.code === 'LEG_CHILD_OVERRIDE_REFUSED', `got ${err.code}: ${err.message}`);
  });
  await test('D1e maxRetries/timeout are NOT on the allowlist (nothing reads or bounds them — sec-ops F2)', async () => {
    leg();
    const err: any = await expectRefusal(() => exec({ maxRetries: 999, timeout: 99999999 }));
    assert(err.code === 'LEG_CHILD_OVERRIDE_REFUSED', `got ${err.code}: ${err.message}`);
  });
  await test('D1f known modelParameters keys pass the D1 check (the call proceeds to the dependency check)', async () => {
    leg();
    const err: any = await expectRefusal(() => exec({ modelParameters: { temperature: 0.2 } }));
    assert(/dependency/i.test(err.message) && err.code !== 'LEG_CHILD_OVERRIDE_REFUSED', `expected the dependency refusal, got: ${err.message}`);
  });
  await test('D1g a STANDALONE task keeps its overrides (the rule belongs to pipeline children)', async () => {
    install({ taskType: 'ACTION', configured: true, stageId: 'cmstage00000000000000001', backPointer: false, ownedViaPipelineStageId: false, deps: blockDeps });
    const err: any = await expectRefusal(() => exec({ prompt: 'x' }));
    assert(/dependency/i.test(err.message), `expected the dependency refusal, got: ${err.message}`);
  });
  await test('D1h a plain { taskId } call runs NO pipeline-child query (sec-ops F4)', async () => {
    leg();
    await expectRefusal(() => exec(undefined));
    assert(!calls.some((c) => c.delegate === 'stage' || c.delegate === '$queryRaw'), `queried: ${calls.map((c) => c.delegate).join(',')}`);
  });
  await test('D1i cross-tenant caller with overrides is refused by ACCESS first — the D1 refusal never reaches a foreign task', async () => {
    leg();
    const err: any = await expectRefusal(() => handleAgentExecute({ taskId: 'cmtask00000000000000000001', overrideConfig: { prompt: 'x' } }, user(FOREIGN, 'USER'), 'd1i'));
    assert(/access/i.test(err.message) && err.code !== 'LEG_CHILD_OVERRIDE_REFUSED', `got: ${err.message}`);
    assert(!calls.some((c) => c.delegate === 'stage'), 'the pipeline-child check ran before the access check');
  });
  await test('D1k X18 (Steve, option B): modelParameters.model AND .provider are refused on a pipeline child — the model is set on the task, not per run', async () => {
    leg();
    const m: any = await expectRefusal(() => exec({ modelParameters: { model: 'some-cheaper-model' } }));
    assert(m.code === 'LEG_CHILD_OVERRIDE_REFUSED' && /modelParameters\.model/.test(m.message) && /set it on the task or template/.test(m.message), m.message);
    leg();
    const p: any = await expectRefusal(() => exec({ modelParameters: { provider: 'other' } }));
    assert(p.code === 'LEG_CHILD_OVERRIDE_REFUSED' && /modelParameters\.provider/.test(p.message), p.message);
  });
  await test('D1l a STANDALONE task may still choose its model per run (X18 is about pipeline children)', async () => {
    install({ taskType: 'ACTION', configured: true, stageId: 'cmstage00000000000000001', backPointer: false, ownedViaPipelineStageId: false, deps: blockDeps });
    const err: any = await expectRefusal(() => exec({ modelParameters: { model: 'x' } }));
    assert(/dependency/i.test(err.message), `expected the dependency refusal, got: ${err.message}`);
  });
  await test('D1j refusal text is bounded: at most 5 names, each at most 64 chars, the rest counted (sec-ops F6)', async () => {
    const { legChildRefusalMessage } = require('@/lib/services/leg-child-override');
    const msg: string = legChildRefusalMessage(Array.from({ length: 9 }, (_, i) => `k${i}${'x'.repeat(100)}`));
    const names = [...msg.matchAll(/`(k\d[^`]*)`/g)].map((m) => m[1]);
    assert(names.length === 5 && names.every((n) => n.length <= 64) && /\(\+4 more\)/.test(msg), msg);
  });

  await test('T5b OWNER, dependency COMPLETED but unsettled (active execution): refused, zero writes', async () => {
    install({ taskType: 'PIPELINE', configured: false, activeDepExec: true,
      deps: [{ dependsOn: { id: 'cmdep000000000000000000001', title: 'Upstream', type: 'ACTION', status: 'COMPLETED', executionStatus: 'SUCCESS' } }] });
    const err = await expectRefusal(() => handleAgentExecute({ taskId: 'cmtask00000000000000000001' }, user(OWNER, 'USER'), 'a6'));
    assert(/not yet settled/i.test(err.message), `expected a settledness refusal, got: ${err.message}`);
    assert(writes().length === 0, 'expected no writes');
  });

  await test('T5d OWNER, PIPELINE upstream IN_PROGRESS with executionStatus SUCCESS (mid-run leg): refused (RWF m18)', async () => {
    install({ taskType: 'PIPELINE', configured: true,
      deps: [{ dependsOn: { id: 'cmdep000000000000000000001', title: 'Upstream leg', type: 'PIPELINE', status: 'IN_PROGRESS', executionStatus: 'SUCCESS' } }] });
    const err = await expectRefusal(() => handleAgentExecute({ taskId: 'cmtask00000000000000000001' }, user(OWNER, 'USER'), 'a8'));
    assert(/dependency/i.test(err.message), `a mid-run PIPELINE upstream must block, got: ${err.message}`);
    assert(writes().length === 0, 'expected no writes');
  });

  await test('T5c OWNER, deps satisfied, template-less PIPELINE: template auto-assigned, NO status write, reaches dispatch', async () => {
    install({ taskType: 'PIPELINE', configured: false });
    // Stop at dispatch: the agent task service is imported dynamically, so the fake below ends the run
    // with a sentinel once every check has passed.
    const svcPath = require.resolve('@/lib/services/agentTaskService');
    require.cache[svcPath] = { id: svcPath, filename: svcPath, loaded: true, exports: {
      AgentTaskService: { executeAgentOnTask: async () => { throw new Error('SENTINEL_REACHED_DISPATCH'); } },
    } } as any;
    const err = await expectRefusal(() => handleAgentExecute({ taskId: 'cmtask00000000000000000001' }, user(OWNER, 'USER'), 'a7'));
    assert(err.message === 'SENTINEL_REACHED_DISPATCH', `expected to reach dispatch, got: ${err.message}`);
    const w = writes();
    assert(w.length === 1 && w[0].delegate === 'task' && w[0].op === 'update', `expected exactly the template write, got ${JSON.stringify(w)}`);
    const data = (w[0].args as any)?.data ?? {};
    assert(!('status' in data), 'the handler wrote a status — the claim belongs to createAgentExecution');
    assert(data.agentTemplateId === 'cmtplharness0000000000001', 'the Pipeline Harness template was not assigned');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
