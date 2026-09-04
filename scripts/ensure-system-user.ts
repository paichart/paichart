/**
 * Ensure the 'system' sentinel User exists.
 *
 * Many non-user-triggered code paths attribute audit Activity / triggeredBy to
 * the documented 'system' sentinel (lib/services/types/triggered-by.ts) via a
 * `userId: 'system'` literal. Activity.userId is a NOT-NULL FK to User, so those
 * inserts were failing with:
 *   ERROR: insert or update on "Activity" violates FK "Activity_userId_fkey"
 *   DETAIL: Key (userId)=(system) is not present in table "User".
 * (~300/day — 2026-06-20 daily-summary forensic finding). This seeds the missing
 * sentinel so those audit rows persist instead of silently bouncing off the FK.
 *
 * Mirrors the @paichart.system service-account pattern (monitor@ / demo-owner@):
 * passwordless, never logs in, auto-excluded from team pickers by the email
 * suffix (lib/utils/team-member-guard.ts SYSTEM_ACCOUNT_EMAIL_SUFFIX).
 *
 * Idempotent — safe to re-run. Run on prod and on environment rebuild.
 */
import { prisma } from '@/lib/prisma';

async function main() {
  const user = await prisma.user.upsert({
    where: { id: 'system' },
    update: {},
    create: {
      id: 'system',
      name: 'System',
      email: 'system@paichart.system',
      role: 'USER',
      isVerified: true,
    },
    select: { id: true, email: true, role: true },
  });
  console.log(`✓ system sentinel user ensured: ${user.id} (${user.email}, ${user.role})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Failed to ensure system user:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
