/**
 * SF-5 (held-k8s step 1d, 2026-10-18) — an AGENT may not delete or update a PLATFORM service row.
 *
 * A platform row has no `configuration.ownerId` (seed scripts leave it unset on purpose). An agent call carries
 * `context.callingExecutionId`, which only mcpService sets (server-side, for a tool call inside an execution's tool
 * loop). By-name lookups already filter on `ownerId = caller`, so the hole was BY ID: validateOwnership admits any
 * admin, and an admin-launched agent sees a platform service's id in every gateway envelope.
 *
 * What this pins, at BOTH handlers, against a fake prisma (no DB):
 *   - agent + platform row ⇒ refused with PLATFORM_SERVICE_AGENT_MUTATION_REFUSED, and NOTHING is written
 *     (delete: no deleteMany, no delete — even the confirm:false preview is refused; update: no update);
 *   - a human admin (no callingExecutionId) keeps the path — the same row is deleted / updated;
 *   - an agent mutating a row it OWNS keeps the path (the k8s teardown's own cluster service);
 *   - an empty-string ownerId counts as a platform row (never as "owned by nobody, so anyone").
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ci:ci@localhost:5432/ci_stub';
export {}; // a MODULE: without it a whole-folder tsc treats this file as a global script and its names collide

const { ServiceDeleteHandler } = require('../lib/mcp/server/tools/hub/service-delete-handler');
const { ServiceUpdateHandler } = require('../lib/mcp/server/tools/hub/service-update-handler');
const { refuseAgentMutationOfPlatformRow } = require('../lib/mcp/server/tools/hub/hub-shared-middleware');

const ADMIN = 'cmadminuser00000000000001';
const OTHER = 'cmotheruser00000000000002';
const PLATFORM_ID = 'cmplatformrow000000000001';
const OWNED_ID = 'cmownedrow000000000000001';
const EXEC = 'cmexecution00000000000001';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function rows() {
  return {
    [PLATFORM_ID]: { id: PLATFORM_ID, name: 'github-service', configuration: { endpoint: 'http://localhost:3110/mcp' } },
    // provisionedByExecutionId = the calling execution: since SF-1 (held-network step 2) an agent mutates only a row ITS RUN registered.
    [OWNED_ID]: { id: OWNED_ID, name: 'k8s-cluster-run-1', configuration: { ownerId: ADMIN, endpoint: 'http://localhost:3120/mcp', provisionedByExecutionId: EXEC } },
  } as Record<string, any>;
}

function fakePrisma() {
  const db = rows();
  const writes: string[] = [];
  const prisma = {
    mCPTool: {
      findUnique: async ({ where }: any) => {
        const r = db[where.id];
        return r ? { ...r, interactions: [], recommendations: [] } : null;
      },
      delete: async ({ where }: any) => { writes.push(`delete:${where.id}`); return db[where.id]; },
      update: async ({ where, data }: any) => { writes.push(`update:${where.id}`); return { ...db[where.id], ...data, updatedAt: new Date() }; },
    },
    mCPInteraction: { deleteMany: async ({ where }: any) => { writes.push(`interactions:${where.toolId}`); return { count: 0 }; } },
    mCPRecommendation: { deleteMany: async ({ where }: any) => { writes.push(`recommendations:${where.toolId}`); return { count: 0 }; } },
    activity: { create: async () => ({}) },
  };
  return { prisma, writes };
}

const utilities = { isUserAdmin: async (id: string) => id === ADMIN };

function ctx(userId: string, agent: boolean) {
  return {
    user: { id: userId, email: `${userId}@example.com`, role: userId === ADMIN ? 'ADMIN' : 'USER' },
    authenticated: true,
    ...(agent ? { callingExecutionId: EXEC } : {}),
  };
}

async function outcome(fn: () => Promise<any>): Promise<{ error?: string; result?: any }> {
  try { return { result: await fn() }; } catch (e: any) { return { error: String(e?.message ?? e) }; }
}

async function main() {
  console.log('\n🧪 SF-5 — agent mutation of a platform service row\n');

  // ---- unit: the predicate ----
  const refuses = (svc: any, c: any) => { try { refuseAgentMutationOfPlatformRow(svc, c, 'delete'); return false; } catch { return true; } };
  check('unit: agent + no ownerId ⇒ refused', refuses({ name: 'x', configuration: {} }, { callingExecutionId: EXEC }));
  check('unit: agent + null configuration ⇒ refused', refuses({ name: 'x', configuration: null }, { callingExecutionId: EXEC }));
  check('unit: agent + empty-string ownerId ⇒ refused', refuses({ name: 'x', configuration: { ownerId: '' } }, { callingExecutionId: EXEC }));
  // INTERNAL-FIT IF-3 (mcp-hub SF-3): an agent may mutate ONLY a row its LAUNCHING user owns — an unknown launcher is refused.
  check('unit: agent + row owned by its launching user ⇒ allowed', !refuses({ name: 'x', configuration: { ownerId: ADMIN } }, { callingExecutionId: EXEC, user: { id: ADMIN } }));
  check('unit: agent + owned row, launching user unknown ⇒ refused (IF-3)', refuses({ name: 'x', configuration: { ownerId: ADMIN } }, { callingExecutionId: EXEC }));
  check('unit: agent + row owned by ANOTHER user ⇒ refused (IF-3)', refuses({ name: 'x', configuration: { ownerId: 'cmother0000000000000000001' } }, { callingExecutionId: EXEC, user: { id: ADMIN } }));
  // sec-ops IF-3 build SF-2: the API-forwarded path (apiUserContext) identifies the launcher too — its OWN row is allowed.
  check('unit: agent on the apiUserContext path + its own row ⇒ allowed (SF-2)', !refuses({ name: 'x', configuration: { ownerId: ADMIN } }, { callingExecutionId: EXEC, apiUserContext: { userId: ADMIN } }));
  check('unit: the handler-resolved userId wins (opts.userId)', (() => { try { refuseAgentMutationOfPlatformRow({ name: 'x', configuration: { ownerId: ADMIN } }, { callingExecutionId: EXEC }, 'delete', { userId: ADMIN }); return true; } catch { return false; } })());
  check('unit: human + no ownerId ⇒ allowed', !refuses({ name: 'x', configuration: {} }, { user: { id: ADMIN } }));
  check('unit: no context ⇒ allowed (the guard keys on the agent fact only)', !refuses({ name: 'x', configuration: {} }, undefined));

  // ---- delete handler ----
  {
    const { prisma, writes } = fakePrisma();
    const h = new ServiceDeleteHandler(prisma, utilities, null);
    const o = await outcome(() => h.handle({ serviceId: PLATFORM_ID, confirm: true }, ctx(ADMIN, true)));
    check('delete: admin AGENT by id on a platform row ⇒ refused with the named code',
      !!o.error && o.error.includes('PLATFORM_SERVICE_AGENT_MUTATION_REFUSED'), o.error ?? JSON.stringify(o.result));
    check('delete: …and nothing was written (no cascade, no delete)', writes.length === 0, writes.join(','));
  }
  {
    const { prisma, writes } = fakePrisma();
    const h = new ServiceDeleteHandler(prisma, utilities, null);
    const o = await outcome(() => h.handle({ serviceId: PLATFORM_ID, confirm: false }, ctx(ADMIN, true)));
    check('delete: the confirm:false preview is refused too (no platform-row preview to an agent)',
      !!o.error && o.error.includes('PLATFORM_SERVICE_AGENT_MUTATION_REFUSED') && writes.length === 0, o.error ?? JSON.stringify(o.result));
  }
  {
    const { prisma, writes } = fakePrisma();
    const h = new ServiceDeleteHandler(prisma, utilities, null);
    const o = await outcome(() => h.handle({ serviceId: PLATFORM_ID, confirm: true }, ctx(ADMIN, false)));
    check('delete: a HUMAN admin by id on the same row ⇒ deleted',
      !o.error && o.result?.success === true && writes.includes(`delete:${PLATFORM_ID}`), o.error ?? writes.join(','));
  }
  {
    const { prisma, writes } = fakePrisma();
    const h = new ServiceDeleteHandler(prisma, utilities, null);
    const o = await outcome(() => h.handle({ serviceId: OWNED_ID, confirm: true }, ctx(ADMIN, true)));
    check('delete: an AGENT deleting a row it owns ⇒ deleted (the teardown path stays open)',
      !o.error && o.result?.success === true && writes.includes(`delete:${OWNED_ID}`), o.error ?? writes.join(','));
  }
  {
    const { prisma, writes } = fakePrisma();
    const h = new ServiceDeleteHandler(prisma, utilities, null);
    const o = await outcome(() => h.handle({ serviceId: PLATFORM_ID, confirm: true }, ctx(OTHER, true)));
    check('delete: a non-admin agent on a platform row is still refused by ownership first (unchanged)',
      !!o.error && o.error.includes('Access denied') && writes.length === 0, o.error ?? '');
  }

  // ---- update handler ----
  {
    const { prisma, writes } = fakePrisma();
    const h = new ServiceUpdateHandler(prisma, utilities, null);
    const o = await outcome(() => h.handle({ serviceId: PLATFORM_ID, updates: { description: 'repointed by an agent' } }, ctx(ADMIN, true)));
    check('update: admin AGENT by id on a platform row ⇒ refused with the named code',
      !!o.error && o.error.includes('PLATFORM_SERVICE_AGENT_MUTATION_REFUSED'), o.error ?? JSON.stringify(o.result));
    check('update: …and nothing was written', writes.length === 0, writes.join(','));
  }
  {
    const { prisma, writes } = fakePrisma();
    const h = new ServiceUpdateHandler(prisma, utilities, null);
    const o = await outcome(() => h.handle({ serviceId: PLATFORM_ID, updates: { description: 'edited by a human admin' } }, ctx(ADMIN, false)));
    check('update: a HUMAN admin by id on the same row ⇒ updated',
      !o.error && writes.includes(`update:${PLATFORM_ID}`), o.error ?? writes.join(','));
  }
  {
    const { prisma, writes } = fakePrisma();
    const h = new ServiceUpdateHandler(prisma, utilities, null);
    const o = await outcome(() => h.handle({ serviceId: OWNED_ID, updates: { description: 'owned by this run, updated by its agent' } }, ctx(ADMIN, true)));
    check('update: an AGENT updating a row it owns ⇒ updated',
      !o.error && writes.includes(`update:${OWNED_ID}`), o.error ?? writes.join(','));
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} Passed: ${passed}  Failed: ${failed}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
