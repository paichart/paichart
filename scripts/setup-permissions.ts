// BOOTSTRAP ONLY — initial RolePermission defaults.
//
// The RolePermission table is the authoritative gate for ROLE-LEVEL CAPABILITY
// decisions only — "can this role do X-kind-of-thing at all?" — with no
// per-instance scoping (that lives in validatePOVAccess / service-ownership).
// The grants below are the COMPLETE set that checkPermission actually reads
// (verified closed call-set 2026-05-25): mcp-service create/view (hub) and
// POV create. (Task-list is no longer gated by the table — the get.ts query
// scopes rows per role; its checkPermission gate was removed in Batch A.)
//
// SUPER_ADMIN is bypassed in code (lib/auth/permissions.ts) so it needs no rows.
//
// Re-run semantics (2026-09-04, D7): DEFAULT mode ensures every enforced row EXISTS and never
// overwrites — the admin GUI (/admin/permissions) stays authoritative, so re-running on a
// customised install is safe. `--reset` WIPES the table and rebuilds the shipped defaults
// (atomic), discarding GUI customisation — use it deliberately.

import { PrismaClient } from '@prisma/client';
import { ResourceAction, ResourceType, UserRole } from '../lib/types/auth';

const prisma = new PrismaClient();

// (role, resourceType, action) → enabled. ONLY grants checkPermission consults.
const ENFORCED_GRANTS = [
  // mcp-service: hub registration + health (role-level capability). Instance
  // edit/delete are gated by service-ownership, NOT this table.
  { role: UserRole.ADMIN,     resourceType: ResourceType.MCP_SERVICE, action: ResourceAction.CREATE, enabled: true },
  { role: UserRole.ADMIN,     resourceType: ResourceType.MCP_SERVICE, action: ResourceAction.VIEW,   enabled: true },
  { role: UserRole.USER,      resourceType: ResourceType.MCP_SERVICE, action: ResourceAction.CREATE, enabled: true },
  { role: UserRole.USER,      resourceType: ResourceType.MCP_SERVICE, action: ResourceAction.VIEW,   enabled: true },
  { role: UserRole.DEMO_USER, resourceType: ResourceType.MCP_SERVICE, action: ResourceAction.CREATE, enabled: true },
  { role: UserRole.DEMO_USER, resourceType: ResourceType.MCP_SERVICE, action: ResourceAction.VIEW,   enabled: true },

  // POV create: role-level capability (a new POV has no instance to scope).
  // ADMIN + USER may create; DEMO_USER blocked (explicit enabled:false row).
  { role: UserRole.ADMIN,     resourceType: ResourceType.PoV, action: ResourceAction.CREATE, enabled: true },
  { role: UserRole.USER,      resourceType: ResourceType.PoV, action: ResourceAction.CREATE, enabled: true },
  { role: UserRole.DEMO_USER, resourceType: ResourceType.PoV, action: ResourceAction.CREATE, enabled: false },
];

const RESET = process.argv.includes('--reset');

async function setupPermissions() {
  // 2026-09-04 (D7): default mode is SEED-ONLY-MISSING — upsert on the composite key with
  // update:{} so a re-run never reverts an operator's /admin/permissions edits (the admin GUI
  // upserts into this same table). A missing row is a DENY (lib/auth/permissions.ts), so
  // ensuring presence is what a fresh install needs. `--reset` restores the old behaviour:
  // wipe + rebuild to the shipped defaults, discarding customisation. Both run in ONE
  // transaction — a crash must never leave the table empty (fail-closed for every
  // non-SUPER_ADMIN capability check).
  console.log(`Seeding enforced RolePermission grants (${RESET ? 'RESET to defaults' : 'ensure-present, keep customisation'})...`);

  if (RESET) {
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({}),
      prisma.rolePermission.createMany({ data: ENFORCED_GRANTS }),
    ]);
  } else {
    await prisma.$transaction(
      ENFORCED_GRANTS.map((g) =>
        prisma.rolePermission.upsert({
          where: { role_resourceType_action: { role: g.role, resourceType: g.resourceType, action: g.action } },
          create: g,
          update: {},
        })
      )
    );
  }

  console.log(`${RESET ? 'Reset' : 'Ensured'} ${ENFORCED_GRANTS.length} grants.`);

  // Post-seed verify. Default mode asserts PRESENCE (a customised value is legitimate);
  // --reset asserts the shipped VALUES (catches enum/PascalCase drift that would silently un-grant).
  const assertGrant = async (
    role: UserRole, resourceType: ResourceType, action: ResourceAction, expected: boolean
  ) => {
    const row = await prisma.rolePermission.findUnique({
      where: { role_resourceType_action: { role, resourceType, action } },
    });
    if (!row) throw new Error(`Post-seed verify FAILED: ${role}/${resourceType}/${action} row missing`);
    if (RESET && row.enabled !== expected) {
      throw new Error(
        `Post-seed verify FAILED: ${role}/${resourceType}/${action} enabled=${row.enabled}, expected ${expected}`
      );
    }
  };
  await assertGrant(UserRole.ADMIN, ResourceType.PoV, ResourceAction.CREATE, true);
  await assertGrant(UserRole.USER, ResourceType.PoV, ResourceAction.CREATE, true);
  await assertGrant(UserRole.DEMO_USER, ResourceType.PoV, ResourceAction.CREATE, false);
  await assertGrant(UserRole.USER, ResourceType.MCP_SERVICE, ResourceAction.CREATE, true);

  console.log('Post-seed verify passed. Permissions setup complete.');
}

setupPermissions()
  .catch(e => {
    console.error('Error setting up permissions:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
