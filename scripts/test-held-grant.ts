/**
 * INTERNAL-FIT IF-3 (2026-10-24) — the hosted owner-written POV grant (lib/mcp/server/config/held-grant.js) and the eligibility
 * values it feeds (held-eligibility.js). Offline: prisma.$queryRaw is a fake that records each statement.
 * Design: cline_docs/reviews/held-network-2026-10-22/IF3-SHARED-ELIGIBILITY-DESIGN.md v2/v3.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const g = require('../lib/mcp/server/config/held-grant.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const he = require('../lib/mcp/server/config/held-eligibility.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mw = require('../lib/mcp/server/tools/hub/hub-shared-middleware.js');

let passed = 0; let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed++; console.log(`  ❌ ${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, msg = '') { const A = JSON.stringify(a); const B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} expected ${B}, got ${A}`); }

const POV = 'cmpovaaaaaaaaaaaaaaaaaaaaa1';
const POV2 = 'cmpovbbbbbbbbbbbbbbbbbbbbb2';
const OWNER = 'cmowner00000000000000000001';
const CALLER = 'cmcaller0000000000000000001';
const EXEC = 'cmexec00000000000000000001';
const row = (grants: string[] = [POV], owner: string | null = OWNER) => ({ id: 'cmsvc000000000000000000001', name: 'acme-nornir', configuration: owner ? { ownerId: owner } : {}, heldGrantPovIds: grants });

/** A fake $queryRaw answering the decideGrant statement with one row, or throwing. */
function fakeDb(answer: Record<string, unknown> | null | 'throw', calls: { n: number } = { n: 0 }) {
  return { $queryRaw: async () => { calls.n++; if (answer === 'throw') throw new Error('db down'); return answer ? [answer] : []; } };
}
const okRow = (o: Record<string, unknown> = {}) => ({ povId: POV, povOwnerId: 'cmsomeoneelse0000000000001', povMetadata: {}, ownerRole: 'USER', callerOnTeam: true, ownerOnTeam: true, ...o });

(async () => {
  console.log('\n── grantApplies: the zero-extra-query guard ──');
  await test('no grants ⇒ no statement', async () => { const c = { n: 0 }; eq(await g.decideGrant(fakeDb(okRow(), c), row([]), CALLER, EXEC), null); eq(c.n, 0); });
  await test('caller IS the owner ⇒ no statement', async () => { const c = { n: 0 }; eq(await g.decideGrant(fakeDb(okRow(), c), row(), OWNER, EXEC), null); eq(c.n, 0); });
  await test('no calling execution (a direct human call) ⇒ no statement', async () => { const c = { n: 0 }; eq(await g.decideGrant(fakeDb(okRow(), c), row(), CALLER, undefined), null); eq(c.n, 0); });
  await test('platform (ownerless) row ⇒ no statement', async () => { const c = { n: 0 }; eq(await g.decideGrant(fakeDb(okRow(), c), row([POV], null), CALLER, EXEC), null); eq(c.n, 0); });

  console.log('\n── decideGrant: the four conditions, fail closed ──');
  await test('GRANTED: execution POV in the list, caller + owner on the team, not demo, owner not DEMO_USER', async () => eq(await g.decideGrant(fakeDb(okRow()), row(), CALLER, EXEC), { povId: POV }));
  await test('membership by POV ownership counts (caller owns the POV, no TeamMember row)', async () => eq(await g.decideGrant(fakeDb(okRow({ povOwnerId: CALLER, callerOnTeam: false })), row(), CALLER, EXEC), { povId: POV }));
  await test('the execution POV is NOT in the list ⇒ not granted', async () => eq(await g.decideGrant(fakeDb(okRow({ povId: POV2 })), row(), CALLER, EXEC), null));
  await test('demo POV ⇒ not granted', async () => eq(await g.decideGrant(fakeDb(okRow({ povMetadata: { isDemo: true } })), row(), CALLER, EXEC), null));
  await test('owner is a DEMO_USER ⇒ not granted', async () => eq(await g.decideGrant(fakeDb(okRow({ ownerRole: 'DEMO_USER' })), row(), CALLER, EXEC), null));
  await test('owner is a service account (@paichart.system) ⇒ not granted', async () => eq(await g.decideGrant(fakeDb(okRow({ ownerEmail: 'Monitor@PaiChart.system' })), row(), CALLER, EXEC), null));
  await test('caller not a literal member ⇒ not granted', async () => eq(await g.decideGrant(fakeDb(okRow({ callerOnTeam: false })), row(), CALLER, EXEC), null));
  await test('owner LEFT the team (re-checked every call) ⇒ not granted', async () => eq(await g.decideGrant(fakeDb(okRow({ ownerOnTeam: false })), row(), CALLER, EXEC), null));
  await test('unknown execution (no row) ⇒ not granted', async () => eq(await g.decideGrant(fakeDb(null), row(), CALLER, EXEC), null));
  await test('a DB error ⇒ not granted (fail closed), never throws', async () => eq(await g.decideGrant(fakeDb('throw'), row(), CALLER, EXEC), null));

  console.log('\n── checkGrantWrite: owner-only, human-only, members-only, ≤ 20, no demo ──');
  const writeDb = (povs: Array<Record<string, unknown>>, role = 'USER') => ({ $queryRaw: async (strings: TemplateStringsArray) => (strings.join('?').includes('FROM "User"') ? [{ role }] : povs) });
  const pov = (id: string, o: Record<string, unknown> = {}) => ({ id, povMetadata: {}, povOwnerId: 'cmx0000000000000000000001', ownerOnTeam: true, ...o });
  for (const [label, args, code] of [
    ['an agent caller', [row(), OWNER, [POV], true], 'GRANT_AGENT_REFUSED'],
    ['a platform row', [row([], null), OWNER, [POV], false], 'GRANT_PLATFORM_ROW'],
    ['not the owner (an admin too)', [row(), CALLER, [POV], false], 'GRANT_NOT_OWNER'],
    ['a non-CUID id', [row(), OWNER, ['POV-1'], false], 'GRANT_INVALID_ID'],
    ['a duplicate id', [row(), OWNER, [POV, POV], false], 'GRANT_DUPLICATE_ID'],
    ['more than 20', [row(), OWNER, Array.from({ length: 21 }, (_, i) => `cmpov${String(i).padStart(22, '0')}`), false], 'GRANT_TOO_MANY'],
  ] as const) {
    await test(`refused by name: ${label}`, async () => eq((await g.checkGrantWrite(writeDb([pov(POV)]), ...(args as [unknown, string, string[], boolean]))).code, code));
  }
  await test('refused: an unknown POV', async () => eq((await g.checkGrantWrite(writeDb([]), row(), OWNER, [POV], false)).code, 'GRANT_UNKNOWN_POV'));
  await test('refused: a demo POV', async () => eq((await g.checkGrantWrite(writeDb([pov(POV, { povMetadata: { isDemo: true } })]), row(), OWNER, [POV], false)).code, 'GRANT_DEMO_POV'));
  await test('refused: a POV the owner is not a member of (the squatting defence)', async () => eq((await g.checkGrantWrite(writeDb([pov(POV, { ownerOnTeam: false })]), row(), OWNER, [POV], false)).code, 'GRANT_NOT_A_MEMBER'));
  await test('refused: a DEMO_USER owner', async () => eq((await g.checkGrantWrite(writeDb([pov(POV)], 'DEMO_USER'), row(), OWNER, [POV], false)).code, 'GRANT_OWNER_NOT_ELIGIBLE'));
  await test('refused: a service-account owner (@paichart.system — sec-ops N-1)', async () => {
    const db = { $queryRaw: async (strings: TemplateStringsArray) => (strings.join('?').includes('FROM "User"') ? [{ role: 'USER', email: 'monitor@paichart.system' }] : [pov(POV)]) };
    eq((await g.checkGrantWrite(db, row(), OWNER, [POV], false)).code, 'GRANT_OWNER_NOT_ELIGIBLE');
  });
  await test('accepted: the owner, a human, POVs it belongs to (team or POV owner)', async () => eq(await g.checkGrantWrite(writeDb([pov(POV), pov(POV2, { povOwnerId: OWNER, ownerOnTeam: false })]), row(), OWNER, [POV, POV2], false), { ok: true, povIds: [POV, POV2] }));
  await test('accepted: an empty list revokes every grant (no DB read)', async () => eq(await g.checkGrantWrite({ $queryRaw: async () => { throw new Error('must not query'); } }, row(), OWNER, [], false), { ok: true, povIds: [] }));
  await test('a DB error refuses the write by name', async () => eq((await g.checkGrantWrite({ $queryRaw: async () => { throw new Error('x'); } }, row(), OWNER, [POV], false)).code, 'GRANT_CHECK_FAILED'));

  console.log('\n── eligibility values ──');
  await test('granted carries the ONE granting POV; validFact enforces grantPovId ⇔ granted', () => {
    const f = he.factFor(row(), CALLER, { grantPovId: POV });
    eq([f.eligibility, f.grantPovId, he.validFact(f)], ['granted', POV, true]);
    eq(he.validFact({ ...f, grantPovId: undefined }), false);
    eq(he.validFact({ ...he.factFor(row(), OWNER), grantPovId: POV }), false);
  });
  await test('install-wide (self-host env) ⇒ install, never own; unset ⇒ foreign', () => {
    const prev = process.env.HELD_ELIGIBILITY_INSTALL_WIDE;
    delete process.env.HELD_ELIGIBILITY_INSTALL_WIDE; const a = he.factFor(row(), CALLER).eligibility;
    process.env.HELD_ELIGIBILITY_INSTALL_WIDE = 'true'; const b = he.factFor(row(), CALLER).eligibility; const c = he.factFor(row([POV], null), CALLER).eligibility;
    if (prev === undefined) delete process.env.HELD_ELIGIBILITY_INSTALL_WIDE; else process.env.HELD_ELIGIBILITY_INSTALL_WIDE = prev;
    eq([a, b, c], ['foreign', 'install', 'platform']);
  });
  await test('HOLDS is exactly own · granted · install', () => eq([...he.HOLDS], ['own', 'granted', 'install']));

  console.log('\n── an agent may mutate only a row its LAUNCHING user owns (mcp-hub SF-3) ──');
  const svc = (owner: string | null) => ({ id: 's', name: 'acme-nornir', configuration: owner ? { ownerId: owner } : {} });
  const threw = (fn: () => void) => { try { fn(); return null; } catch (e) { return (e as Error).message.split(':')[0]; } };
  await test('agent run on a colleague\'s row (even admin-launched) ⇒ AGENT_MUTATION_NOT_OWNER', () => eq(threw(() => mw.refuseAgentMutationOfPlatformRow(svc(OWNER), { callingExecutionId: EXEC, user: { id: CALLER, role: 'ADMIN' } }, 'delete')), 'AGENT_MUTATION_NOT_OWNER'));
  await test('agent run on its launching user\'s own row ⇒ allowed', () => eq(threw(() => mw.refuseAgentMutationOfPlatformRow(svc(OWNER), { callingExecutionId: EXEC, user: { id: OWNER } }, 'delete')), null));
  await test('agent run on a platform row ⇒ PLATFORM_SERVICE_AGENT_MUTATION_REFUSED (unchanged)', () => eq(threw(() => mw.refuseAgentMutationOfPlatformRow(svc(null), { callingExecutionId: EXEC, user: { id: OWNER } }, 'update')), 'PLATFORM_SERVICE_AGENT_MUTATION_REFUSED'));
  await test('the embedded agent transport counts as an agent with no execution id', () => eq(threw(() => mw.refuseAgentMutationOfPlatformRow(svc(OWNER), { user: { id: CALLER } }, 'update', { transport: 'embedded' })), 'AGENT_MUTATION_NOT_OWNER'));
  await test('a HUMAN (no execution, http) is never refused here (ownership is validateOwnership\'s job)', () => eq(threw(() => mw.refuseAgentMutationOfPlatformRow(svc(OWNER), { user: { id: CALLER } }, 'update', { transport: 'http' })), null));

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
