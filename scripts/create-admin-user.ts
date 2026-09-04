/**
 * db:admin — create the first (SUPER_ADMIN) account on a fresh install.
 *
 * Rewritten 2026-09-04 (D7, panel: cline_docs/reviews/self-host-rbac-bootstrap-2026-09-04/):
 *   - NO literal credentials. `ADMIN_EMAIL` is required; `ADMIN_PASSWORD` is taken from env or
 *     GENERATED (24 chars, printed ONCE) when absent. A password from env is never echoed.
 *   - Validated with the repo's strongest policy (CreateUserSchema.password: 12+, mixed classes,
 *     common-password blocklist) so the blocklisted defaults are impossible by construction.
 *   - SUPER_ADMIN, not ADMIN: an ADMIN cannot create a SUPER_ADMIN (lib/admin/handlers/user.ts
 *     roleHierarchy) nor edit the ADMIN row of the permission table (app/api/admin/permissions/
 *     route.ts) — an ADMIN-first install is stuck without psql. Use this account for
 *     administration only; create an ADMIN for day-to-day work (SUPER_ADMIN is excluded from
 *     POV teams and bypasses the permission table).
 *   - Idempotent WITHOUT rotation: an existing account exits 0 untouched. `--reset-password`
 *     is the explicit opt-in to rotate it.
 *   - Fails loud: any error → non-zero exit (the old script swallowed P2002 and exited 0).
 *
 * Usage:  ADMIN_EMAIL=you@example.com npm run db:admin                 # generates + prints a password once
 *         ADMIN_EMAIL=… ADMIN_PASSWORD='…' npm run db:admin            # uses yours (not echoed)
 *         ADMIN_EMAIL=… ADMIN_PASSWORD='…' npm run db:admin -- --reset-password
 */
/* eslint-disable no-console -- CLI bootstrap script */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UserRole } from '../lib/types/auth';
import { CreateUserSchema } from '../lib/validation/admin-user-validation';

const prisma = new PrismaClient();
const RESET = process.argv.includes('--reset-password');

function generatePassword(): string {
  // 24 chars from a 64-symbol alphabet that always satisfies the policy's class requirements.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  const bytes = randomBytes(24);
  let pw = '';
  for (let i = 0; i < 24; i++) pw += alphabet[bytes[i] % alphabet.length];
  // Guarantee one of each class regardless of the draw.
  return pw.slice(0, 20) + 'Aa7!';
}

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) {
    throw new Error('ADMIN_EMAIL is required (the first account\'s login). Example: ADMIN_EMAIL=you@example.com npm run db:admin');
  }
  const emailCheck = CreateUserSchema.shape.email.safeParse(email);
  if (!emailCheck.success) throw new Error(`ADMIN_EMAIL rejected: ${emailCheck.error.issues[0]?.message}`);

  const fromEnv = process.env.ADMIN_PASSWORD;
  const password = fromEnv || generatePassword();
  const pwCheck = CreateUserSchema.shape.password.safeParse(password);
  if (!pwCheck.success) {
    throw new Error(`ADMIN_PASSWORD rejected by the password policy: ${pwCheck.error.issues.map(i => i.message).join('; ')}`);
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (existing && !RESET) {
    console.log(`✓ ${email} already exists (${existing.role}) — nothing done. Pass --reset-password to rotate its password.`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hashed, role: UserRole.SUPER_ADMIN, isVerified: true, verifiedAt: new Date(), status: 'ACTIVE' },
    create: {
      email,
      name: process.env.ADMIN_NAME || 'Administrator',
      password: hashed,
      role: UserRole.SUPER_ADMIN,
      isVerified: true,
      verifiedAt: new Date(),
      status: 'ACTIVE',
    },
    select: { id: true, email: true, role: true },
  });

  console.log(`✓ ${existing ? 'Password reset for' : 'Created'} ${user.role} ${user.email} (${user.id})`);
  if (!fromEnv) {
    console.log('');
    console.log('  Generated password (shown ONCE — store it now):');
    console.log(`  ${password}`);
    console.log('');
  }
  console.log('  Use this account for administration only; create an ADMIN in /admin/users for daily work.');
}

main()
  .catch((e) => { console.error('db:admin FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
