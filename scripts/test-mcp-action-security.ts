#!/usr/bin/env ts-node
/**
 * MCP Action Security Tests (Handler-Level Authorization) — pov.create
 *
 * Purpose: validate that `handlePOVCreate` enforces the POV-create capability gate.
 * Pattern: #30 (handler-level-authorization-pattern.md); sec-ops recommendation (2026-01-31).
 *
 * REWRITTEN 2026-10-04. The previous suite encoded a RETIRED policy (ADMIN-only, message
 * "Admin Access Required") and built callers with `.id` where the handler reads the MCP
 * TokenPayload's `.userId`; since the 2026-07-28 cache-key guard (lib/auth/cache.ts) refuses a
 * key with no user id, 8 of 11 cases failed on the fixture shape, not on behaviour.
 *
 * The policy is now READ FROM THE RolePermission TABLE at run time (PoV / CREATE), so a policy
 * change cannot silently make this suite assert the wrong thing again:
 *   - a role whose row is enabled  ⇒ must pass the gate (proved by reaching the country lookup,
 *     which rejects a deliberately unknown country — NO POV is ever created);
 *   - a role with no row or a disabled row ⇒ must be refused with the FORBIDDEN message naming
 *     the role, BEFORE any business logic.
 * Attack cases (missing role, lowercase 'admin', an unknown role) must be refused whatever the
 * table says. A table with no enabled row or no refused role makes the suite FAIL (it would
 * prove nothing).
 *
 * Requires DATABASE_URL (skipped in CI, run locally). WRITES permission-audit Activity rows — NEVER point it at prod.
 * Fixed invariants (sec-ops review 2026-10-04): DEMO_USER never creates; SUPER_ADMIN always passes.
 */

const DB_AVAILABLE = !!process.env.DATABASE_URL;

if (!DB_AVAILABLE) {
  // A SKIP STATES NO OUTCOME — never print a pass line when nothing was tested.
  console.log('⏭️  SKIPPED: MCP action security tests — NOTHING WAS VERIFIED');
  console.log('   Reason:  DATABASE_URL is not set');
  console.log('   To run:  DATABASE_URL=... npm run test:mcp-action-security');
  process.exit(0);
}

import { handlePOVCreate } from '../lib/mcp/tasks/action/handlers/pov/pov-create-handler';
import { UserRole, ResourceType, ResourceAction } from '../lib/types/auth';
import { prisma } from '../lib/prisma';

console.log('🔐 MCP Action Security Tests (pov.create)\n');

let passed = 0;
let failed = 0;

async function test(description: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

const FORBIDDEN_PREFIX = 'You do not have permission to create POVs.';
const UNKNOWN_COUNTRY = 'Zzz-No-Such-Country-For-Security-Test';

/** Call the handler and return the thrown message ('' if it did not throw — which is a failure here). */
async function attempt(user: any, countryName = UNKNOWN_COUNTRY): Promise<string> {
  try {
    await handlePOVCreate(
      { title: 'Security test POV (never created)', description: 'authorization probe', countryName },
      user,
      `sec-test-${Math.random().toString(36).slice(2, 8)}`
    );
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** A WELL-FORMED caller that the policy refuses must get FORBIDDEN naming its role — nothing else. */
function assertForbidden(msg: string, role: string) {
  if (!msg) throw new Error('handler did NOT throw — a POV may have been created');
  if (!(msg.includes(FORBIDDEN_PREFIX) && msg.includes(`Your role: ${role}`))) {
    throw new Error(`expected FORBIDDEN for ${role}, got: ${msg.slice(0, 200)}`);
  }
}

/** A MALFORMED caller (no user id / no role / no object) must be refused before any business logic. */
function assertMalformedRefused(msg: string) {
  if (!msg) throw new Error('handler did NOT throw — a POV may have been created');
  if (msg.includes('Country not found')) throw new Error(`malformed caller reached business logic: ${msg.slice(0, 200)}`);
}

function assertPassedGate(msg: string) {
  if (!msg) throw new Error('handler did NOT throw — the unknown country should have stopped it');
  if (msg.includes(FORBIDDEN_PREFIX)) throw new Error(`refused although the policy allows it: ${msg}`);
  if (!msg.includes('Country not found')) throw new Error(`did not reach the country lookup: ${msg.slice(0, 200)}`);
}

async function runTests() {
  // A real user id keeps the permission audit write (Activity FK) quiet; the ROLE under test is
  // carried in the token payload, which is what the gate reads.
  const anyUser = await prisma.user.findFirst({ select: { id: true } });
  if (!anyUser) throw new Error('no user in the database — seed it before running this suite');
  const uid = anyUser.id;

  const rows = await prisma.rolePermission.findMany({
    where: { resourceType: ResourceType.PoV as any, action: ResourceAction.CREATE as any },
    select: { role: true, enabled: true },
  });
  const allowed = new Set(rows.filter(r => r.enabled).map(r => String(r.role)));
  const roles = [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
  console.log(`Policy (role_permissions PoV/CREATE enabled): ${[...allowed].sort().join(', ') || '(none)'}\n`);

  // ---- policy sanity: the suite must be able to prove both directions -------------------------
  await test('Policy table allows at least one tested role and refuses at least one', async () => {
    if (!roles.some(r => allowed.has(r))) throw new Error('no tested role is allowed — the allow path is unproven');
    if (!roles.some(r => !allowed.has(r))) throw new Error('no tested role is refused — the deny path is unproven');
  });

  // ---- FIXED INVARIANTS, independent of the table (sec-ops R1, 2026-10-04) ----------------------
  // The table-derived cases prove the gate FOLLOWS the table; these prove the policy is SAFE. Any ADMIN
  // can upsert a DEMO_USER row (app/api/admin/permissions), and DEMO_USER is the self-signup default role
  // (registration-policy.ts) — a flipped row must turn this suite RED, never become a new expectation.
  await test('INVARIANT: DEMO_USER (self-signup default) can never create POVs, whatever the table says', async () => {
    if (allowed.has(UserRole.DEMO_USER)) throw new Error('role_permissions enables PoV/CREATE for DEMO_USER — policy drift');
    assertForbidden(await attempt({ userId: uid, role: UserRole.DEMO_USER }), UserRole.DEMO_USER);
  });
  await test('INVARIANT: SUPER_ADMIN always passes the gate (bypass)', async () => {
    assertPassedGate(await attempt({ userId: uid, role: UserRole.SUPER_ADMIN }));
  });

  // ---- each role behaves exactly as the table says --------------------------------------------
  // NOTE: every role reuses ONE uid inside the permission-cache TTL and USER runs before DEMO_USER, so
  // the DEMO_USER refusal here also exercises the 2026-07-28 role-in-key fix. That is order-dependent;
  // the dedicated pin is `test:permission-cache-role-key`.
  for (const role of roles) {
    if (allowed.has(role)) {
      await test(`${role}: allowed by the table ⇒ passes the gate (stops at the unknown country)`, async () => {
        assertPassedGate(await attempt({ userId: uid, role, email: 'sec@test.local' }));
      });
    } else {
      await test(`${role}: refused by the table ⇒ FORBIDDEN naming the role`, async () => {
        assertForbidden(await attempt({ userId: uid, role, email: 'sec@test.local' }), role);
      });
    }
  }

  // ---- ordering: authorization happens BEFORE business logic ----------------------------------
  const refusedRole = roles.find(r => !allowed.has(r));
  if (refusedRole) {
    await test(`Authorization runs before the country lookup (${refusedRole} + unknown country ⇒ FORBIDDEN, not "Country not found")`, async () => {
      const msg = await attempt({ userId: uid, role: refusedRole });
      assertForbidden(msg, refusedRole);
      if (msg.includes('Country not found')) throw new Error('business logic ran before authorization');
    });
  }

  // ---- attacks: refused whatever the table says -------------------------------------------------
  await test('Attack: a null user object is refused', async () => {
    assertMalformedRefused(await attempt(null));
  });
  await test('Attack: missing role is refused (fails closed)', async () => {
    assertMalformedRefused(await attempt({ userId: uid }));
  });
  await test("Attack: lowercase 'admin' does not match ADMIN", async () => {
    assertForbidden(await attempt({ userId: uid, role: 'admin' }), 'admin');
  });
  await test('Attack: an unknown role is refused', async () => {
    assertForbidden(await attempt({ userId: uid, role: 'CUSTOM_ROLE' }), 'CUSTOM_ROLE');
  });
  await test('Attack: a raw payload with .id but no .userId is refused (cache-key guard)', async () => {
    // ADMIN explicitly: SUPER_ADMIN bypasses the cache before any key is built, so it cannot
    // exercise the guard (an allowed, non-bypass role is what proves a raw payload is refused).
    const m = await attempt({ id: uid, role: UserRole.ADMIN });
    assertMalformedRefused(m);
    if (!m.includes('Permission cache key missing a discriminator')) throw new Error(`expected the cache-key guard, got: ${m.slice(0, 200)}`);
  });

  console.log('\n=====================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('=====================================\n');
  await prisma.$disconnect();
  if (failed > 0) {
    console.error('❌ Some tests failed!\n');
    process.exit(1);
  }
  console.log('✅ All MCP action security tests passed (pov.create gate follows role_permissions).\n');
  process.exit(0);
}

runTests().catch(async (error) => {
  console.error('Fatal error:', error);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
