/**
 * SF-1 (held-network step 2 sec-ops, 2026-10-25) — an AGENT may delete or update only a service row THIS RUN registered.
 *
 * The defect: `registry register` with `descriptorUrl` from the same owner and the same descriptor bytes answers `adopted`
 * and reuses the customer's long-lived row. The leg's SYNTHESIZE teardown then deleted it by name, because the launching
 * user owns the row (refuseAgentMutationOfPlatformRow admits that). Guard: refuseAgentMutationOfRowNotProvisionedByRun
 * (hub-shared-middleware.js) — the caller must be the row's registering execution (configuration.provisionedByExecutionId),
 * or an execution of the PIPELINE task stamped as configuration.provisionedByRunScope AT REGISTRATION (the leg harness).
 * The scope is stamped at create, never re-derived (sec-ops build review SF-1: a harness task.update can rebind a stage
 * back-pointer). Not another child of the leg, a sibling leg or the program root. Fail closed.
 *
 * Pinned against a fake prisma (no DB), at BOTH handlers, plus the adoption branch of the register handler:
 *   - an agent deleting its own run's row → allowed (the Harvester's own execution, and the leg harness's later pass);
 *   - an agent deleting an adopted / human-registered row → refused, nothing written, value-free message;
 *   - an agent deleting another run's row (another leg, the program root, a sibling leg) → refused;
 *   - a human → allowed;
 *   - a lookup error, an evicted execution, an embedded call with no execution id → refused;
 *   - update: the same rule;
 *   - an adopted registration writes NOTHING (provisionedByExecutionId is never overwritten by the adopting run).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ci:ci@localhost:5432/ci_stub';
export {};

const { ServiceDeleteHandler } = require('../lib/mcp/server/tools/hub/service-delete-handler');
const { ServiceUpdateHandler } = require('../lib/mcp/server/tools/hub/service-update-handler');
const { ServiceRegistrationHandler } = require('../lib/mcp/server/tools/hub/service-registration-handler');
const regDecl = require('../lib/mcp/server/tools/hub/registrant-declaration');
// The delete limiter (10/min per user) is not under test here; every case below would otherwise trip it after ten calls.
require('../lib/utils/rate-limiter').sensitiveOperationLimiter.checkLimit = async () => true;

const USER = 'cmcustomeruser00000000001';

// Run topology: program root R (PIPELINE) → its stage SR holds legs L1 and L2 (PIPELINE).
// L1's child stage S1 (harnessTaskId = L1) holds its Harvester H1; L2's child stage S2 holds H2. A standalone task T has no stage.
const T_R = 'cmtaskroot000000000000001', T_L1 = 'cmtaskleg1000000000000001', T_L2 = 'cmtaskleg2000000000000001';
const T_H1 = 'cmtaskharv100000000000001', T_H2 = 'cmtaskharv200000000000001', T_T = 'cmtaskstandalone000000001';
const S_R = 'cmstageroot00000000000001', S_1 = 'cmstageleg100000000000001', S_2 = 'cmstageleg200000000000001';
const E_R = 'cmexecroot000000000000001';
const E_L1_PLAN = 'cmexecl1plan0000000000001', E_L1_SYN = 'cmexecl1syn00000000000001';
const E_H1 = 'cmexech100000000000000000', E_H1_RERUN = 'cmexech1rerun000000000001';
const E_L2_SYN = 'cmexecl2syn00000000000001', E_H2 = 'cmexech200000000000000000';
const E_T1 = 'cmexect100000000000000000', E_T2 = 'cmexect200000000000000000';
const E_GONE = 'cmexecevicted000000000001';

const RUN_ROW = 'cmrowrun00000000000000001';       // registered by L1's Harvester
const HUMAN_ROW = 'cmrowhuman000000000000001';     // the customer's long-lived row (registered by a human; the adopted row)
const OTHER_RUN_ROW = 'cmrowotherrun000000000001'; // registered by L2's Harvester
const EVICTED_ROW = 'cmrowevicted0000000000001';   // stamped with an execution that no longer exists
const STANDALONE_ROW = 'cmrowstandalone0000000001';
const LEGACY_ROW = 'cmrowlegacy00000000000001';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function row(id: string, name: string, provisionedBy?: string, runScope?: string) {
  return { id, name, status: 'ACTIVE', configuration: { ownerId: USER, endpoint: `https://${name}.example.com/mcp`,
    ...(provisionedBy ? { provisionedByExecutionId: provisionedBy } : {}), ...(runScope ? { provisionedByRunScope: runScope } : {}) } };
}

function fakePrisma(opts: { throwOnExecutionRead?: boolean; rebindStage1To?: string } = {}) {
  const tools: Record<string, any> = {
    [RUN_ROW]: row(RUN_ROW, 'leg1-device-reader', E_H1, T_L1),
    [HUMAN_ROW]: row(HUMAN_ROW, 'customer-device-reader'),
    [OTHER_RUN_ROW]: row(OTHER_RUN_ROW, 'leg2-device-reader', E_H2, T_L2),
    [EVICTED_ROW]: row(EVICTED_ROW, 'evicted-reader', E_GONE, T_L1),
    [STANDALONE_ROW]: row(STANDALONE_ROW, 'standalone-reader', E_T1),            // a standalone task: no leg, no scope
    [LEGACY_ROW]: row(LEGACY_ROW, 'legacy-reader', E_H1),                         // created before the scope stamp existed
  };
  const executions: Record<string, string> = {
    [E_R]: T_R, [E_L1_PLAN]: T_L1, [E_L1_SYN]: T_L1, [E_H1]: T_H1, [E_H1_RERUN]: T_H1,
    [E_L2_SYN]: T_L2, [E_H2]: T_H2, [E_T1]: T_T, [E_T2]: T_T,
  };
  const tasks: Record<string, any> = {
    [T_R]: { id: T_R, type: 'PIPELINE', stageId: null },
    [T_L1]: { id: T_L1, type: 'PIPELINE', stageId: S_R },
    [T_L2]: { id: T_L2, type: 'PIPELINE', stageId: S_R },
    [T_H1]: { id: T_H1, type: 'ACTION', stageId: S_1 },
    [T_H2]: { id: T_H2, type: 'ACTION', stageId: S_2 },
    [T_T]: { id: T_T, type: 'ACTION', stageId: null },
  };
  const stages: Record<string, any> = {
    [S_R]: { metadata: { harnessTaskId: T_R } },
    [S_1]: { metadata: { harnessTaskId: opts.rebindStage1To ?? T_L1 } },
    [S_2]: { metadata: { harnessTaskId: T_L2 } },
  };
  const writes: string[] = [];
  const reads: string[] = [];
  const prisma = {
    mCPTool: {
      findUnique: async ({ where }: any) => { const r = tools[where.id]; return r ? { ...r, interactions: [], recommendations: [] } : null; },
      delete: async ({ where }: any) => { writes.push(`delete:${where.id}`); return tools[where.id]; },
      update: async ({ where, data }: any) => { writes.push(`update:${where.id}`); return { ...tools[where.id], ...data, updatedAt: new Date() }; },
    },
    mCPInteraction: { deleteMany: async ({ where }: any) => { writes.push(`interactions:${where.toolId}`); return { count: 0 }; } },
    mCPRecommendation: { deleteMany: async ({ where }: any) => { writes.push(`recommendations:${where.toolId}`); return { count: 0 }; } },
    activity: { create: async () => ({}) },
    agentExecution: {
      findUnique: async ({ where }: any) => {
        reads.push(`execution:${where.id}`);
        if (opts.throwOnExecutionRead) throw new Error('connection reset');
        return executions[where.id] ? { taskId: executions[where.id] } : null;
      },
    },
    task: { findUnique: async ({ where }: any) => { reads.push(`task:${where.id}`); return tasks[where.id] ?? null; } },
    stage: { findUnique: async ({ where }: any) => { reads.push(`stage:${where.id}`); return stages[where.id] ?? null; } },
  };
  return { prisma, writes, reads };
}

const utilities = { isUserAdmin: async () => false, checkPermission: async () => true };

function ctx(executionId?: string) {
  return { user: { id: USER, email: 'customer@example.com', role: 'USER' }, authenticated: true, ...(executionId ? { callingExecutionId: executionId } : {}) };
}

async function outcome(fn: () => Promise<any>): Promise<{ error?: string; result?: any }> {
  try { return { result: await fn() }; } catch (e: any) { return { error: String(e?.message ?? e) }; }
}

async function del(serviceId: string, context: any, o: { transport?: string; throwOnExecutionRead?: boolean; confirm?: boolean; rebindStage1To?: string } = {}) {
  const { prisma, writes, reads } = fakePrisma({ throwOnExecutionRead: o.throwOnExecutionRead, rebindStage1To: o.rebindStage1To });
  const h = new ServiceDeleteHandler(prisma, utilities, null);
  const r = await outcome(() => h.handle({ serviceId, confirm: o.confirm ?? true }, context, { transport: o.transport }));
  return { ...r, writes, reads };
}

async function upd(serviceId: string, context: any) {
  const { prisma, writes, reads } = fakePrisma();
  const h = new ServiceUpdateHandler(prisma, utilities, null);
  const r = await outcome(() => h.handle({ serviceId, updates: { description: 'changed by the caller' } }, context));
  return { ...r, writes, reads };
}

const DELETED = (o: any, id: string) => !o.error && o.result?.success === true && o.writes.includes(`delete:${id}`);
const REFUSED = (o: any, code: string) => !!o.error && o.error.includes(code) && o.writes.length === 0;

async function main() {
  console.log('\n🧪 SF-1 — an agent deletes or updates only a service its run registered\n');

  // ---- delete: allowed ----
  {
    const o = await del(RUN_ROW, ctx(E_H1));
    check('delete: the registering execution itself ⇒ deleted', DELETED(o, RUN_ROW), o.error ?? o.writes.join(','));
    check('delete: …decided with no run-scope reads (same execution)', o.reads.length === 0, o.reads.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx(E_L1_SYN));
    check('delete: the leg harness SYNTHESIZE pass tears down what its own Harvester registered ⇒ deleted', DELETED(o, RUN_ROW), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx(E_L1_PLAN));
    check('delete: another pass of the same leg harness ⇒ deleted', DELETED(o, RUN_ROW), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(EVICTED_ROW, ctx(E_L1_SYN));
    check('delete: the registering execution was evicted by retention, scope stamped ⇒ the leg harness still tears it down', DELETED(o, EVICTED_ROW), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(LEGACY_ROW, ctx(E_H1));
    check('delete: a pre-scope row, by its registering execution ⇒ deleted', DELETED(o, LEGACY_ROW), o.error ?? o.writes.join(','));
  }

  // ---- delete: refused ----
  {
    const o = await del(HUMAN_ROW, ctx(E_L1_SYN));
    check('delete: an agent on the adopted / human-registered row ⇒ AGENT_DELETE_NOT_PROVISIONED_BY_RUN, nothing written',
      REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
    check('delete: …the message says not registered by this run and left in place',
      !!o.error && o.error.includes('was not registered by this run') && o.error.includes('left in place'), o.error ?? '');
    check('delete: …and echoes no value (no service name, no ids)',
      !!o.error && !o.error.includes('customer-device-reader') && !/cm[a-z0-9]{20,}/.test(o.error), o.error ?? '');
  }
  {
    const o = await del(HUMAN_ROW, ctx(E_L1_SYN), { confirm: false });
    check('delete: the confirm:false preview of a human row is refused to an agent too', REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? JSON.stringify(o.result));
  }
  {
    const o = await del(OTHER_RUN_ROW, ctx(E_L1_SYN));
    check('delete: leg 1\'s harness on leg 2\'s row ⇒ refused', REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx(E_L2_SYN));
    check('delete: a sibling leg\'s harness on leg 1\'s row ⇒ refused (CONCURRENT-SELF-PROVISION)', REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx(E_R));
    check('delete: the program root on a leg\'s row ⇒ refused (the scope is the leg, not the program tree)', REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx(E_T1));
    check('delete: an unrelated standalone execution on a leg\'s row ⇒ refused', REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx(E_L1_SYN), { throwOnExecutionRead: true });
    check('delete: a run-scope lookup error ⇒ refused (fail closed), nothing written', REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
    check('delete: …the message says the platform could not confirm', !!o.error && o.error.includes('could not confirm'), o.error ?? '');
  }
  {
    const o = await del(RUN_ROW, ctx(E_L2_SYN), { rebindStage1To: T_L2 });
    check('delete: leg 2 rebinds leg 1\'s stage back-pointer to itself, then deletes leg 1\'s row ⇒ refused (scope is the create-time stamp)',
      REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx(E_H1_RERUN));
    check('delete: another CHILD of the same leg (a Harvester re-run) ⇒ refused (only the registering execution or the leg harness)',
      REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(STANDALONE_ROW, ctx(E_T2));
    check('delete: a standalone task\'s later execution on a row with no leg scope ⇒ refused (could not confirm)',
      REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN') && o.error!.includes('could not confirm'), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(LEGACY_ROW, ctx(E_L1_SYN));
    check('delete: a pre-scope row, by the leg harness ⇒ refused (could not confirm; fail closed)',
      REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN') && o.error!.includes('could not confirm'), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx('cmexecunknown000000000001'));
    check('delete: the CALLING execution has no row ⇒ refused (could not confirm)',
      REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN') && o.error!.includes('could not confirm'), o.error ?? o.writes.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx(), { transport: 'embedded' });
    check('delete: the embedded agent transport with no execution id ⇒ refused', REFUSED(o, 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
  }

  // ---- delete: humans unchanged ----
  {
    const o = await del(HUMAN_ROW, ctx());
    check('delete: a HUMAN on their own long-lived row ⇒ deleted', DELETED(o, HUMAN_ROW), o.error ?? o.writes.join(','));
    check('delete: …with no run-scope reads', o.reads.length === 0, o.reads.join(','));
  }
  {
    const o = await del(RUN_ROW, ctx());
    check('delete: a HUMAN on a run-registered row ⇒ deleted (operator cleanup of an orphan)', DELETED(o, RUN_ROW), o.error ?? o.writes.join(','));
  }

  // ---- update: the same rule ----
  {
    const o = await upd(RUN_ROW, ctx(E_H1));
    check('update: the registering Harvester attaching tools to its own row ⇒ updated', !o.error && o.writes.includes(`update:${RUN_ROW}`), o.error ?? o.writes.join(','));
  }
  {
    const o = await upd(RUN_ROW, ctx(E_L1_SYN));
    check('update: the same leg\'s harness ⇒ updated', !o.error && o.writes.includes(`update:${RUN_ROW}`), o.error ?? o.writes.join(','));
  }
  {
    const o = await upd(HUMAN_ROW, ctx(E_H1));
    check('update: an agent on the adopted / human row ⇒ AGENT_UPDATE_NOT_PROVISIONED_BY_RUN, nothing written',
      REFUSED(o, 'AGENT_UPDATE_NOT_PROVISIONED_BY_RUN') && o.error!.includes('left unchanged'), o.error ?? o.writes.join(','));
  }
  {
    const o = await upd(OTHER_RUN_ROW, ctx(E_H1));
    check('update: an agent on another run\'s row ⇒ refused', REFUSED(o, 'AGENT_UPDATE_NOT_PROVISIONED_BY_RUN'), o.error ?? o.writes.join(','));
  }
  {
    const o = await upd(HUMAN_ROW, ctx());
    check('update: a HUMAN on their own row ⇒ updated', !o.error && o.writes.includes(`update:${HUMAN_ROW}`), o.error ?? o.writes.join(','));
  }

  // ---- provisionedRunScope: the create-time stamp ----
  {
    const { provisionedRunScope } = require('../lib/mcp/server/tools/hub/hub-shared-middleware');
    const { prisma } = fakePrisma();
    check('scope: a Harvester (child) execution ⇒ its leg', (await provisionedRunScope(prisma, E_H1)) === T_L1);
    check('scope: a leg harness execution ⇒ the leg itself', (await provisionedRunScope(prisma, E_L1_SYN)) === T_L1);
    check('scope: a program root execution ⇒ the root (a PIPELINE task)', (await provisionedRunScope(prisma, E_R)) === T_R);
    check('scope: a standalone task ⇒ none', (await provisionedRunScope(prisma, E_T1)) === null);
    check('scope: an unknown execution ⇒ none', (await provisionedRunScope(prisma, E_GONE)) === null);
    const { prisma: bad } = fakePrisma({ throwOnExecutionRead: true });
    check('scope: a read error ⇒ none (never throws into the registration)', (await provisionedRunScope(bad, E_H1)) === null);
  }

  // ---- adoption never overwrites the stamp ----
  {
    const RAW = 'b'.repeat(64);
    const existing = { id: HUMAN_ROW, name: 'customer-device-reader', status: 'ACTIVE', descriptorSha256: RAW,
      configuration: { ownerId: USER, endpoint: 'https://customer-device-reader.example.com/mcp' } };
    const writes: string[] = [];
    const prisma = {
      mCPTool: {
        count: async () => 1,
        findUnique: async () => null, // no id clash
        findFirst: async () => existing,
        findMany: async () => [existing],
        create: async () => { writes.push('create'); return {}; },
        update: async () => { writes.push('update'); return {}; },
        upsert: async () => { writes.push('upsert'); return {}; },
      },
    };
    const original = regDecl.resolveFromDescriptor;
    regDecl.resolveFromDescriptor = async () => ({
      ok: true,
      validatedArgs: { name: 'customer-device-reader', endpoint: 'https://customer-device-reader.example.com/mcp', description: 'Read-only device reader', category: 'automation', capabilities: { tools: ['show_running_config'] } },
      heldFiles: undefined,
      provenance: { url: 'https://example.com/descriptor.json', rawSha256: RAW, fetchedAt: new Date() },
    });
    try {
      const h = new ServiceRegistrationHandler(prisma, utilities, null, null);
      const o = await outcome(() => h.handle({ descriptorUrl: 'https://example.com/descriptor.json' }, ctx(E_H1)));
      check('register: same owner + same descriptor bytes from an agent run ⇒ adopted', !o.error && o.result?.adopted === true, o.error ?? JSON.stringify(o.result));
      check('register: …the adoption writes nothing (no create / update / upsert)', writes.length === 0, writes.join(','));
      check('register: …the row still carries no provisionedByExecutionId (the adopting run never stamps it)',
        existing.configuration && !('provisionedByExecutionId' in existing.configuration), JSON.stringify(existing.configuration));
      // …and therefore the adopting run's teardown is refused (the end-to-end defect, closed).
      const { prisma: p2, writes: w2 } = fakePrisma();
      const d = await outcome(() => new ServiceDeleteHandler(p2, utilities, null).handle({ serviceId: HUMAN_ROW, confirm: true }, ctx(E_L1_SYN)));
      check('register → teardown: the adopting leg\'s teardown of the adopted row is refused', !!d.error && d.error.includes('AGENT_DELETE_NOT_PROVISIONED_BY_RUN') && w2.length === 0, d.error ?? w2.join(','));
    } finally {
      regDecl.resolveFromDescriptor = original;
    }
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} Passed: ${passed}  Failed: ${failed}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
