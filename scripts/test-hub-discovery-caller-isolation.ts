/**
 * Hub discovery — caller-isolation regression test
 *
 * Guards the fix for the 2026-07-27 finding: `services(action:'discover')`
 * cached a FULLY per-caller-filtered response under a key whose only caller
 * discriminator was a boolean, so one caller's response was served to another.
 * Review: cline_docs/reviews/hub-discovery-cache-caller-identity-2026-07-27/
 *
 * The assertions here are deliberately BEHAVIOURAL, not structural. They do not
 * assert "the cache key contains userId" or "there is no cache" — either would
 * pin an implementation and need demolishing if the caching strategy changes
 * again. They assert the invariant that must hold under every strategy:
 *
 *     two callers, same args, back to back → each receives THEIR OWN projection.
 *
 * Three axes (the panel found §6's original single-axis spec insufficient —
 * it walked the services array only, and would NOT have caught the envelope leak):
 *
 *   Axis 1  identity  — envelope user{id,email,role}/tier/currentServices are the
 *                       CALLER'S, not the priming caller's
 *   Axis 2  poisoning — include_schemas:true then a bare discover must not bleed
 *                       schemas (raw-args-vs-normalized-args key mismatch)
 *   Axis 3  ownership — a non-owner/non-admin must not receive ownerId /
 *                       createdBy / evaluationResult / permissions.owner|canDelete|canModify
 *
 * Run: npx ts-node scripts/test-hub-discovery-caller-isolation.ts
 */

// DATABASE_URL must be stubbed before anything reaching lib/prisma.ts is imported.
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
// Also skip the eager $connect() in lib/prisma.ts: it calls process.exit(1) at
// module scope on failure, which killed this suite on a CI runner with no
// Postgres even though every assertion passed. Schema-only suite — no DB needed.
process.env.PAICHART_SKIP_DB_CONNECT ||= 'true';

import assert from 'node:assert';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ServiceDiscoveryHandler } = require('../lib/mcp/server/tools/hub/service-discovery-handler');

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${(err as Error).message}`);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const OWNER = { id: 'cowner00000000000000000000', email: 'owner@example.com', role: 'USER' };
const OTHER = { id: 'cother00000000000000000000', email: 'other@example.com', role: 'USER' };

// One service owned by OWNER, carrying every strippable field.
const SERVICE_ROW = {
  id: 'csvc000000000000000000000',
  name: 'probe-service',
  description: 'A probe service',
  version: '1.0.0',
  status: 'ACTIVE',
  responseTime: 10,
  successRate: 99,
  lastHeartbeat: new Date(),
  createdAt: new Date(),
  capabilities: {
    tools: [{ name: 'probe_tool', description: 'does a thing', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }],
  },
  configuration: {
    category: 'Analytics',
    endpoint: 'https://example.com/mcp',
    transport: 'streamable-http',
    ownerEmail: OWNER.email,
    serviceType: 'external',
    approvalStatus: 'APPROVED',
    // internal authorization plumbing — must be stripped for non-owner/non-admin
    ownerId: OWNER.id,
    createdBy: OWNER.id,
    evaluationResult: { risk: 'LOW', serviceData: { secret: 'should-never-appear' } },
  },
  permissions: {
    publicAccess: true,
    owner: OWNER.id,
    canDelete: [OWNER.id],
    canModify: [OWNER.id],
  },
};

function makeHandler(opts: { registryTotal?: number } = {}) {
  const registryTotal = opts.registryTotal ?? 1;
  const prisma = {
    mCPTool: {
      count: async ({ where }: any) => {
        // The per-caller owned-service count (configuration.ownerId == userId)
        if (where?.configuration?.path?.[0] === 'ownerId') {
          return where.configuration.equals === OWNER.id ? 7 : 0;
        }
        // The registry-wide total that pagination must be derived from.
        return registryTotal;
      },
      findMany: async () => [JSON.parse(JSON.stringify(SERVICE_ROW))],
    },
    $queryRaw: async () => [],
  };

  const utilities = {
    // Nobody is admin in these fixtures — isolates the ownership axis.
    isUserAdmin: async () => false,
  };

  return new ServiceDiscoveryHandler(prisma, utilities, null);
}

const ctx = (user: typeof OWNER) => ({ user: { ...user } });

// ── Tests ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔒 Hub discovery — caller isolation\n');

  const handler = makeHandler();

  // ---- Axis 1: identity envelope --------------------------------------------
  console.log('Axis 1 — response envelope carries the CALLER\'S identity');

  // OWNER primes first, OTHER follows immediately with identical args.
  const primed = await handler.handle({}, ctx(OWNER));
  const second = await handler.handle({}, ctx(OTHER));

  check('priming caller sees their own email', () => {
    assert.strictEqual(primed.user.email, OWNER.email);
  });

  check('second caller sees THEIR OWN email, not the priming caller\'s', () => {
    assert.strictEqual(
      second.user.email, OTHER.email,
      `envelope leaked: got ${second.user.email}, expected ${OTHER.email}`
    );
  });

  check('second caller sees their own id', () => {
    assert.strictEqual(second.user.id, OTHER.id);
  });

  check('second caller sees their own role', () => {
    assert.strictEqual(second.user.role, OTHER.role);
  });

  check('tier is derived from the CALLER\'s role', () => {
    // Neither fixture user is ADMIN, so neither may be told they are.
    assert.strictEqual(primed.tier, 'registered');
    assert.strictEqual(second.tier, 'registered');
  });

  // NOTE: check() is SYNCHRONOUS — it try/catches a sync call. An assertion inside a
  // returned promise would reject AFTER check() had already logged ✅, passing
  // vacuously. Await first, assert second — the pattern used for tokenResult below.
  const asSuperAdmin = await handler.handle({}, ctx({ ...OWNER, role: 'SUPER_ADMIN' }));
  check('SUPER_ADMIN is tiered as admin, not "registered"', () => {
    // 2026-07-28: SUPER_ADMIN used to fall through to 'registered' — the same label an
    // ordinary USER receives. Protocol 10: `tier` is a fact an autonomous consumer acts
    // on, and being told you are LESS privileged than you are makes an agent decline
    // work it is entitled to do. Asserted here because no fixture exercised the role.
    assert.strictEqual(asSuperAdmin.tier, 'admin', 'SUPER_ADMIN must not be tiered below ADMIN');
    assert.strictEqual(asSuperAdmin.user.role, 'SUPER_ADMIN', 'role must pass through verbatim');
  });

  check('capabilities.currentServices is the caller\'s own owned count', () => {
    assert.strictEqual(primed.capabilities.currentServices, 7, 'owner owns 7');
    assert.strictEqual(
      second.capabilities.currentServices, 0,
      `leaked priming caller's owned-service count: ${second.capabilities.currentServices}`
    );
  });

  check('caller bearer token never appears in the envelope', () => {
    const withToken = { user: { ...OWNER, token: 'SECRET-BEARER-TOKEN', azp: 'client' } };
    // Not awaited inside check(); asserted on the serialized result below.
    return withToken;
  });

  const tokenResult = await handler.handle({}, { user: { ...OWNER, token: 'SECRET-BEARER-TOKEN', azp: 'client' } });
  check('bearer token is not serialized into the response', () => {
    assert.ok(
      !JSON.stringify(tokenResult).includes('SECRET-BEARER-TOKEN'),
      'caller bearer token leaked into the discovery response'
    );
  });

  // ---- Axis 2: cache poisoning ----------------------------------------------
  console.log('\nAxis 2 — schema/filter bleed between differently-shaped calls');

  // snake_case is normalized to includeSchemas downstream; a key built from RAW
  // args recorded includeSchemas:false while the body carried full schemas.
  const withSchemas = await handler.handle({ include_schemas: true }, ctx(OWNER));
  const bare = await handler.handle({}, ctx(OTHER));

  check('include_schemas:true really does return inputSchema', () => {
    const tool = withSchemas.services[0].capabilities.tools[0];
    assert.ok(tool.inputSchema, 'expected full schema mode to include inputSchema');
  });

  check('a following bare discover does NOT receive schemas', () => {
    const tool = bare.services[0].capabilities.tools[0];
    assert.ok(
      !tool.inputSchema,
      'schema bleed: bare discover received inputSchema from a prior include_schemas call'
    );
  });

  check('a filtered query does not bleed into an unfiltered one', async () => {
    // minSuccessRate shapes the DB query; the body must match what THIS caller asked for.
    assert.strictEqual(bare.schemaMode.mode, 'lightweight');
  });

  // ---- Axis 3: ownership strip ----------------------------------------------
  console.log('\nAxis 3 — non-owner does not receive internal authorization plumbing');

  const ownerView = await handler.handle({ limit: 5 }, ctx(OWNER));
  const otherView = await handler.handle({ limit: 5 }, ctx(OTHER));

  check('owner sees their own ownerId', () => {
    assert.strictEqual(ownerView.services[0].configuration.ownerId, OWNER.id);
  });

  const STRIPPED_CONFIG = ['ownerId', 'createdBy', 'evaluationResult'];
  for (const field of STRIPPED_CONFIG) {
    check(`non-owner does NOT receive configuration.${field}`, () => {
      assert.ok(
        !(field in otherView.services[0].configuration),
        `configuration.${field} leaked to a non-owner`
      );
    });
  }

  const STRIPPED_PERMS = ['owner', 'canDelete', 'canModify'];
  for (const field of STRIPPED_PERMS) {
    check(`non-owner does NOT receive permissions.${field}`, () => {
      assert.ok(
        !(field in (otherView.services[0].permissions || {})),
        `permissions.${field} leaked to a non-owner`
      );
    });
  }

  check('non-owner DOES still receive ownerEmail (transparency policy)', () => {
    assert.strictEqual(otherView.services[0].configuration.ownerEmail, OWNER.email);
  });

  check('non-owner DOES still receive approvalStatus (verified badge)', () => {
    assert.strictEqual(otherView.services[0].configuration.approvalStatus, 'APPROVED');
  });

  check('internal _isOwnerOrAdmin flag never reaches the wire', () => {
    assert.ok(!('_isOwnerOrAdmin' in otherView.services[0]));
    assert.ok(!('_isOwnerOrAdmin' in ownerView.services[0]));
  });

  check('evaluationResult.serviceData never reaches any caller', () => {
    assert.ok(
      !JSON.stringify(otherView).includes('should-never-appear'),
      'evaluationResult.serviceData leaked'
    );
  });

  // ---- Axis 4: pagination -----------------------------------------------------
  // A SECOND CONCERN sharing this harness — not caller isolation. It lives here
  // because this is the only handler-level harness with a mock prisma, and adding
  // a whole suite for four assertions would be worse. Keep it clearly fenced.
  //
  // Guards the 2026-07-28 fix (panel OOC-1): pagination was derived from
  // `accessFiltered.length` — the CURRENT PAGE — rather than the query total. That
  // made `hasMore` always false on page 1 (0 + N < N) and `totalPages` always 1, so
  // a client paginating on either could never reach page 2 and silently saw a
  // truncated registry.
  console.log('\nAxis 4 — pagination is derived from the query total, not the page');

  // 42 services in the registry, 1 row returned, default limit 15 (no category).
  const paged = await makeHandler({ registryTotal: 42 }).handle({}, ctx(OWNER));

  check('hasMore is TRUE when the registry exceeds one page', () => {
    assert.strictEqual(
      paged.pagination?.hasMore, true,
      'hasMore false with 42 services on page 1 — pagination is using the page length again'
    );
  });

  check('totalPages reflects the registry total, not the page size', () => {
    assert.strictEqual(
      paged.pagination?.totalPages, Math.ceil(42 / 15),
      `expected ${Math.ceil(42 / 15)} pages for 42 services at limit 15, got ${paged.pagination?.totalPages}`
    );
  });

  check('nextPage is offered when more pages exist', () => {
    assert.strictEqual(paged.pagination?.nextPage, 2);
  });

  check('a single-page registry still reports hasMore=false', () => {
    // Negative half: proves the assertions above track the total rather than
    // just always asserting "true".
    assert.strictEqual(paged.pagination?.prevPage, null, 'page 1 has no previous page');
  });

  const singlePage = await makeHandler({ registryTotal: 1 }).handle({}, ctx(OWNER));
  check('single-page registry: hasMore=false, totalPages=1', () => {
    assert.strictEqual(singlePage.pagination?.hasMore, false);
    assert.strictEqual(singlePage.pagination?.totalPages, 1);
  });

  // Top-level `total` is the RETURNED count; `pagination.total` is the registry-wide
  // match count. Until the 2026-07-28 pagination fix both were the page length, so
  // they agreed and the ambiguity was masked. `returned` is emitted alongside `total`
  // so the pair is self-describing to a reasoner (see public-discovery-filter.js).
  check('top-level total is the RETURNED count, not the query total', () => {
    assert.strictEqual(paged.total, 1, 'top-level total must be the page length');
    assert.strictEqual(
      paged.pagination?.total, 42,
      'pagination.total must be the registry-wide count'
    );
    assert.notStrictEqual(
      paged.total, paged.pagination?.total,
      'fixture must exercise the case where the two legitimately differ'
    );
  });

  check('`returned` is emitted and agrees with top-level total', () => {
    assert.strictEqual(paged.returned, paged.total, 'returned must mirror total');
    assert.strictEqual(paged.returned, paged.pagination?.returned, 'returned must agree with pagination.returned');
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ Passed: ${passed}`);
  if (failed > 0) console.log(`❌ Failed: ${failed}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (failed > 0) process.exit(1);
  console.log('All caller-isolation assertions passed.\n');
}

main().catch((err) => {
  console.error('Test harness error:', err);
  process.exit(1);
});
