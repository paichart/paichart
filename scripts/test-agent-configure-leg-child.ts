#!/usr/bin/env ts-node
/**
 * RWF X17 (2026-09-27; sec-ops D1 review F3): agent.configure from inside an agent run may not rewrite a PIPELINE CHILD's
 * configuration (it writes role + prompt permanently, and synthesises a prompt when none is given). Humans are unaffected.
 * Through the real handler on a fake Prisma client that THROWS on anything unmodelled and records every write.
 */
// CI guard: the handler imports lib/prisma.ts, whose module init needs a DATABASE_URL.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub?sslmode=disable';
}
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const prismaModule = require('@/lib/prisma') as typeof import('@/lib/prisma');

type Call = { delegate: string; op: string; args: unknown };
let calls: Call[] = [];
const writes = () => calls.filter((c) => /^(update|updateMany|create|createMany|upsert|delete|deleteMany)$/.test(c.op));
function fakeDelegate(name: string, impl: Record<string, (args: any) => unknown>) {
  return new Proxy({}, { get(_t, op: string) {
    return async (args: unknown) => {
      calls.push({ delegate: name, op, args });
      const fn = impl[op];
      if (!fn) throw new Error(`UNMODELLED prisma.${name}.${op}`);
      return fn(args);
    };
  } });
}
const OWNER = 'cmowner00000000000000000b';
const FOREIGN = 'cmforeign000000000000000a';
const TASK = 'cmtask00000000000000000001';
function install(opts: { backPointer?: boolean; ownedViaPipelineStageId?: boolean; stageId?: string | null }) {
  const p = prismaModule.prisma as any;
  const replace = (key: string, value: unknown) => Object.defineProperty(p, key, { value, configurable: true, writable: true });
  replace('task', fakeDelegate('task', {
    findUnique: () => ({ id: TASK, stageId: opts.stageId === undefined ? 'cmstage00000000000000001' : opts.stageId,
      pov: { id: 'cmpov00000000000000000001', ownerId: OWNER, metadata: {}, team: { members: [] } } }),
  }));
  replace('stage', fakeDelegate('stage', { findUnique: () => ({ metadata: opts.backPointer ? { harnessTaskId: 'cmh' } : {} }) }));
  // A call that is NOT refused proceeds to the template lookup; stop it there, provably PAST the X17 check.
  const stop = () => { throw new Error('REACHED_TEMPLATE_LOOKUP'); };
  replace('agentTemplate', fakeDelegate('agentTemplate', { findUnique: stop, findFirst: stop }));
  replace('$queryRaw', async (...args: unknown[]) => { calls.push({ delegate: '$queryRaw', op: 'query', args }); return opts.ownedViaPipelineStageId ? [{ id: TASK }] : []; });
}
const user = (id: string) => ({ userId: id, email: `${id}@example.test`, role: 'USER' } as any);
let passed = 0; const failed: string[] = [];
async function test(name: string, fn: () => Promise<void>) {
  calls = [];
  try { await fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
async function outcome(run: () => Promise<unknown>): Promise<any> { try { await run(); return null; } catch (e) { return e; } }

(async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { handleAgentConfigure } = require('@/lib/mcp/tasks/action/handlers/agent/agent-configure-handler') as
    typeof import('@/lib/mcp/tasks/action/handlers/agent/agent-configure-handler');
  const loop = { callingExecutionId: 'cmexec00000000000000000001' };
  const params = { taskId: TASK, agentTemplateId: 'cmtpl000000000000000000001' }; // the observed template-only shape
  console.log('\n🧪 X17 — agent.configure on a pipeline child from inside an agent run\n');

  await test('C1 agent run + pipeline child (stage back-pointer), template-only call: refused 400, ZERO writes, before any template lookup', async () => {
    install({ backPointer: true });
    const e = await outcome(() => handleAgentConfigure(params, user(OWNER), 'c1', loop));
    assert(e?.code === 'LEG_CHILD_CONFIGURE_REFUSED' && e.statusCode === 400, `got ${e?.code}/${e?.statusCode}: ${e?.message}`);
    assert(/agent\.assign/.test(e.message), 'the refusal must name the sanctioned verb');
    assert(writes().length === 0 && !calls.some((c) => c.delegate === 'agentTemplate'), `calls: ${calls.map((c) => c.delegate + '.' + c.op).join(',')}`);
  });
  await test('C2 agent run + child owned via pipelineStageId (no back-pointer) + role/prompt: refused', async () => {
    install({ backPointer: false, ownedViaPipelineStageId: true });
    const e = await outcome(() => handleAgentConfigure({ ...params, role: 'x', prompt: 'y' }, user(OWNER), 'c2', loop));
    assert(e?.code === 'LEG_CHILD_CONFIGURE_REFUSED', `got ${e?.code}: ${e?.message}`);
  });
  await test('C3 a HUMAN (no callingExecutionId) configuring a pipeline child is NOT refused, and runs no child query', async () => {
    install({ backPointer: true });
    const e = await outcome(() => handleAgentConfigure(params, user(OWNER), 'c3'));
    assert(e?.message === 'REACHED_TEMPLATE_LOOKUP', `human call did not proceed past the check: ${e?.code} ${e?.message}`);
    assert(!calls.some((c) => c.delegate === 'stage' || c.delegate === '$queryRaw'), 'a human call must not pay the child query');
  });
  await test('C4 an agent run configuring a STANDALONE task is NOT refused', async () => {
    install({ backPointer: false, ownedViaPipelineStageId: false });
    const e = await outcome(() => handleAgentConfigure(params, user(OWNER), 'c4', loop));
    assert(e?.message === 'REACHED_TEMPLATE_LOOKUP', `standalone did not proceed past the check: ${e?.code} ${e?.message}`);
  });
  await test('C5 cross-tenant: refused by ACCESS first — the child check never runs on a foreign task', async () => {
    install({ backPointer: true });
    const e = await outcome(() => handleAgentConfigure(params, user(FOREIGN), 'c5', loop));
    assert(e && e.code !== 'LEG_CHILD_CONFIGURE_REFUSED' && /access/i.test(e.message), `got: ${e?.message}`);
    assert(!calls.some((c) => c.delegate === 'stage'), 'the child check ran before the access check');
  });
  await test('C6 the router passes routeOpts to agent.configure (or callingExecutionId never arrives)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib/mcp/tasks/action/tasks-action-router.ts'), 'utf8');
    assert(/handleAgentConfigure\(parameters, user, actionId, routeOpts\)/.test(src), 'router drops routeOpts for agent.configure');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
