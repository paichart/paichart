/**
 * Permission cache — role must be part of the key
 *
 * Guards the 2026-07-28 fix. `checkPermission` resolves the decision from
 * `user.role` (permissions.ts looks up rolePermission by role), but the cache was
 * keyed on `userId` alone. A demoted user therefore kept their cached `true`
 * grants for the full 5-minute TTL — privilege persistence after revocation.
 *
 * Why keying on role rather than invalidating on write: invalidation only fires
 * for code paths that change the role. A direct `UPDATE "User" SET role=...` —
 * the documented way to flip a role for testing (PRODUCTION_OPERATIONS_GUIDE) —
 * bypasses every hook. Keying self-heals however the role changed.
 *
 * Also pins the CACHE-KEY ESCALATION CLASS guard from security-discovery.md: a
 * caller passing a raw TokenPayload (`.userId`, no `.id`) used to build
 * "undefined:..." — one key shared by every caller. Now it throws.
 *
 * Run: npm run test:permission-cache-role-key
 */

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.PAICHART_SKIP_DB_CONNECT ||= 'true';

import assert from 'node:assert';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { permissionCache } = require('../lib/auth/cache');

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✅ ${name}`); })
    .catch((err: Error) => { failed++; console.log(`  ❌ ${name}\n     ${err.message}`); });
}

const BASE = {
  userId: 'cmh86xj81002tyxmi5k2qv1ls',
  resourceType: 'mcp-service' as const,
  resourceId: '*',
  action: 'view' as const,
};

async function main() {
  console.log('\n🔑 Permission cache — role in key\n');

  // ---- The defect this fix closes -------------------------------------------
  await check('a demoted user does NOT inherit the pre-demotion grant', async () => {
    permissionCache.clear?.();
    let resolverCalls = 0;

    // As ADMIN: resolver grants.
    const asAdmin = await permissionCache.get(
      { ...BASE, role: 'ADMIN' },
      async () => { resolverCalls++; return true; }
    );
    assert.strictEqual(asAdmin, true, 'ADMIN should be granted');

    // Same user, same resource, same action — now demoted. Must NOT hit the
    // ADMIN entry. Pre-fix this returned the cached `true` without consulting
    // the resolver at all.
    const asUser = await permissionCache.get(
      { ...BASE, role: 'USER' },
      async () => { resolverCalls++; return false; }
    );

    assert.strictEqual(
      asUser, false,
      'demoted user received the ADMIN grant — the role is not discriminating the key'
    );
    assert.strictEqual(
      resolverCalls, 2,
      `expected the resolver to run per role (2), ran ${resolverCalls} — a stale entry was served`
    );
  });

  // ---- Negative half: the cache must still actually cache --------------------
  await check('same user AND same role still hits the cache (not disabled)', async () => {
    permissionCache.clear?.();
    let resolverCalls = 0;
    const key = { ...BASE, role: 'ADMIN' as const };

    await permissionCache.get(key, async () => { resolverCalls++; return true; });
    const second = await permissionCache.get(key, async () => { resolverCalls++; return true; });

    assert.strictEqual(second, true);
    assert.strictEqual(
      resolverCalls, 1,
      `expected 1 resolver call for a repeat lookup, got ${resolverCalls} — caching is broken`
    );
  });

  // ---- Invalidation helpers must survive the key-shape change ----------------
  await check('invalidateUserPermissions still matches after role joined the key', async () => {
    permissionCache.clear?.();
    await permissionCache.get({ ...BASE, role: 'ADMIN' }, async () => true);
    permissionCache.invalidateUserPermissions(BASE.userId);

    let ran = false;
    await permissionCache.get({ ...BASE, role: 'ADMIN' }, async () => { ran = true; return false; });
    assert.ok(ran, 'entry survived invalidateUserPermissions — the userId prefix match broke');
  });

  await check('invalidateResourcePermissions still matches after the key-shape change', async () => {
    permissionCache.clear?.();
    await permissionCache.get({ ...BASE, role: 'ADMIN' }, async () => true);
    permissionCache.invalidateResourcePermissions(BASE.resourceType, BASE.resourceId);

    let ran = false;
    await permissionCache.get({ ...BASE, role: 'ADMIN' }, async () => { ran = true; return false; });
    assert.ok(ran, 'entry survived invalidateResourcePermissions — the substring match broke');
  });

  // ---- CACHE-KEY ESCALATION CLASS guard --------------------------------------
  await check('a missing userId THROWS rather than building a colliding key', async () => {
    await assert.rejects(
      () => permissionCache.get({ ...BASE, userId: undefined, role: 'ADMIN' }, async () => true),
      /missing a discriminator/,
      'undefined userId must fail loud, not collapse every caller onto one key'
    );
  });

  await check('a missing role THROWS rather than collapsing all roles', async () => {
    await assert.rejects(
      () => permissionCache.get({ ...BASE, role: undefined }, async () => true),
      /missing a discriminator/,
      'undefined role must fail loud — same escalation, different field'
    );
  });

  console.log(`\n${'─'.repeat(58)}`);
  console.log(`✅ Passed: ${passed}`);
  if (failed) console.log(`❌ Failed: ${failed}`);
  console.log(`${'─'.repeat(58)}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('Harness error:', e); process.exit(1); });
