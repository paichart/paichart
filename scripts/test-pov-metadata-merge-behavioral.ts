/**
 * POV metadata MERGE — behavioral proof against the DEV database (out of the battery: needs DATABASE_URL).
 * Register: POV-UPDATE-METADATA-REPLACES-WHOLE (2026-11-28). Battery twin: scripts/test-pov-metadata-merge.ts.
 *
 *   B1  the SQL merge equals the JS reference (applyPovMetadataPlan) over a set of patches
 *   B2  concurrent merges of different keys all land (no lost update)
 *   B3  MCP pov.update via the router: { isDemo: false } keeps the seven other keys; result names the keys
 *   B4  MCP pov.update: a key sent as null is removed; the result says removed / not present
 *   B5  MCP pov.update: isDemo set true → false → absent, read back each time
 *   B6  web PUT (updatePoVHandler): a partial metadata body no longer drops the other keys
 *   B7  web PUT, non-admin: isDemo in the body cannot change or remove the stored flag (MA-1 kept)
 *
 * Run: npm run test:pov-metadata-merge-behavioral
 */
import { NextRequest } from 'next/server';
import { prisma } from '../lib/prisma';
import { TasksActionRouter } from '../lib/mcp/tasks/action/tasks-action-router';
import { updatePoVHandler } from '../lib/pov/handlers/put';
import { planPovMetadataPatch, applyPovMetadataPlan, mergePovMetadata } from '../lib/pov/metadata-merge';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.log(`❌ ${name}\n   ${e instanceof Error ? e.message : String(e)}`); failed++; }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const eq = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

const STORED = {
  actionId: 'act_1', customer: 'Acme', teamSize: '5', createdBy: 'u1', createdVia: 'mcp',
  successCriteria: 'x', technicalRequirements: 'y', isDemo: true,
};
const SEVEN = ['actionId', 'customer', 'teamSize', 'createdBy', 'createdVia', 'successCriteria', 'technicalRequirements'];

async function main() {
  console.log('🔒 POV metadata merge — behavioral (dev DB)\n');
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
  const plainUser = await prisma.user.findFirst({ where: { role: 'USER' }, select: { id: true, email: true } });
  const country = await prisma.country.findFirst({ select: { id: true } });
  if (!owner || !country) throw new Error('fixture needs an ADMIN user and a Country');
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 86400000);
  const pov = await prisma.pOV.create({
    data: {
      title: `__test_pov_meta_merge_${Date.now()}`, description: 'POV metadata merge fixture', ownerId: owner.id,
      status: 'PROJECTED', startDate: now, endDate: future, salesTheatre: 'NORTH_AMERICA', countryId: country.id,
      metadata: STORED,
    },
  });
  const reset = (m: Record<string, unknown> = STORED) => prisma.pOV.update({ where: { id: pov.id }, data: { metadata: m as any } });
  const stored = async () => ((await prisma.pOV.findUnique({ where: { id: pov.id }, select: { metadata: true } }))!.metadata as Record<string, unknown>);
  const admin = { userId: owner.id, id: owner.id, email: owner.email, role: 'ADMIN' } as any;
  const router = new TasksActionRouter();
  const mcp = async (metadata: Record<string, unknown>) => {
    const r: any = await router.route('pov.update', { povId: pov.id, metadata }, admin, `test-${Date.now()}`);
    return r.result ?? r;
  };

  try {
    await test('B1 SQL merge equals the JS reference', async () => {
      const patches: Record<string, unknown>[] = [
        { isDemo: false }, { teamSize: null }, { ghost: null }, { nested: { a: [1, { b: 2 }] } }, { customer: 'Acme' },
        { a: 1, b: null, c: 'x', isDemo: null }, { s: 'with \'quote\' and "dq" and \\ backslash' },
      ];
      for (const p of patches) {
        await reset();
        const plan = planPovMetadataPatch(p);
        const r = await prisma.$transaction((tx) => mergePovMetadata(tx, pov.id, plan));
        assert(r, 'no row');
        const expect = applyPovMetadataPlan(STORED, plan);
        assert(eq(r!.after, expect), `patch ${JSON.stringify(p)}: sql ${JSON.stringify(r!.after)} != js ${JSON.stringify(expect)}`);
        assert(eq(await stored(), expect), `patch ${JSON.stringify(p)}: stored row differs`);
      }
    });

    await test('B2 concurrent merges of different keys all land', async () => {
      await reset();
      const N = 8;
      await Promise.all(Array.from({ length: N }, (_, i) =>
        prisma.$transaction((tx) => mergePovMetadata(tx, pov.id, planPovMetadataPatch({ [`k${i}`]: i })))));
      const m = await stored();
      for (let i = 0; i < N; i++) assert(m[`k${i}`] === i, `k${i} lost: ${JSON.stringify(m)}`);
      for (const k of SEVEN) assert(m[k] === (STORED as any)[k], `${k} lost`);
    });

    await test('B3 MCP pov.update { isDemo: false } keeps the seven keys; result names the change', async () => {
      await reset();
      const res = await mcp({ isDemo: false });
      const m = await stored();
      for (const k of SEVEN) assert(m[k] === (STORED as any)[k], `${k} lost: ${JSON.stringify(m)}`);
      assert(m.isDemo === false, 'isDemo not false');
      assert(eq(res.summary?.metadata?.keysChanged, ['isDemo']), `report ${JSON.stringify(res.summary)}`);
      assert(res.summary.metadata.keysKeptCount === 7, `kept ${res.summary.metadata.keysKeptCount}`);
      assert(/metadata: changed isDemo; 7 other keys kept/.test(res.message), res.message);
      assert(res.summary.fieldsUpdated.includes('metadata'), 'fieldsUpdated lacks metadata');
    });

    await test('B4 MCP pov.update: null removes; result says removed / not present', async () => {
      await reset();
      const res = await mcp({ teamSize: null, ghost: null });
      const m = await stored();
      assert(!('teamSize' in m) && Object.keys(m).length === 7, JSON.stringify(m));
      assert(eq(res.summary.metadata.keysRemoved, ['teamSize']) && eq(res.summary.metadata.keysAlreadyAbsent, ['ghost']), JSON.stringify(res.summary.metadata));
      assert(/removed teamSize; not present ghost; 7 other keys kept/.test(res.message), res.message);
    });

    await test('B5 MCP pov.update: isDemo true → false → absent, read back each time', async () => {
      await reset({ customer: 'Acme' });
      await mcp({ isDemo: true }); assert((await stored()).isDemo === true, 'not true');
      await mcp({ isDemo: false }); assert((await stored()).isDemo === false, 'not false');
      await mcp({ isDemo: null }); const m = await stored();
      assert(!('isDemo' in m) && m.customer === 'Acme', JSON.stringify(m));
    });

    const put = async (user: any, body: Record<string, unknown>) => {
      const req = new NextRequest(`http://localhost/api/pov/${pov.id}`, {
        method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
      });
      const row = await prisma.pOV.findUnique({ where: { id: pov.id } });
      const r: any = await updatePoVHandler(req, { params: { povId: pov.id }, user, pov: row });
      return r;
    };

    await test('B6 web PUT: a partial metadata body keeps the other keys', async () => {
      await reset();
      const r = await put(admin, { metadata: { customer: 'NewCo', teamSize: null } });
      const status = r?.status ?? 200;
      assert(status < 400, `PUT status ${status}: ${r instanceof Response ? await r.text() : JSON.stringify(r)}`);
      const m = await stored();
      assert(m.customer === 'NewCo' && !('teamSize' in m), JSON.stringify(m));
      for (const k of SEVEN.filter((k) => k !== 'customer' && k !== 'teamSize')) assert(m[k] === (STORED as any)[k], `${k} lost`);
      assert(m.isDemo === true, 'isDemo lost');
    });

    await test('B7 web PUT, non-admin: isDemo in the body cannot change or remove the stored flag', async () => {
      if (!plainUser) { console.log('   (skipped: no USER-role user in dev DB)'); return; }
      await reset();
      // The owner is required for a non-admin write: make the plain user the owner for this case.
      await prisma.pOV.update({ where: { id: pov.id }, data: { ownerId: plainUser.id } });
      try {
        const u = { userId: plainUser.id, id: plainUser.id, email: plainUser.email, role: 'USER' } as any;
        for (const isDemo of [false, null]) {
          const r = await put(u, { metadata: { isDemo, customer: `c-${String(isDemo)}` } });
          const status = r?.status ?? 200;
          assert(status < 400, `PUT status ${status}: ${r instanceof Response ? await r.text() : JSON.stringify(r)}`);
          const m = await stored();
          assert(m.isDemo === true, `non-admin changed isDemo with ${String(isDemo)}: ${JSON.stringify(m)}`);
          assert(m.customer === `c-${String(isDemo)}`, 'other key not written');
        }
      } finally {
        await prisma.pOV.update({ where: { id: pov.id }, data: { ownerId: owner.id } });
      }
    });
  } finally {
    await prisma.pOV.delete({ where: { id: pov.id } }).catch((e) => console.warn('cleanup failed', e));
    await prisma.$disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
