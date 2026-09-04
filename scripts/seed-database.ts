/**
 * db:seed — one-shot fresh-install bootstrap (the wrapper docs/RUNNING.md points at).
 *
 * Rewritten 2026-09-04 (D7): the previous version ran the deprecated migration command, the drift-creating
 * command this project abandoned for `db push`, and seeded five example accounts with committed
 * passwords (now archived under scripts/archive/dev-fixtures/). Every step below is idempotent;
 * the whole thing is safe to re-run on a live install (permissions are ensure-only, the admin is
 * never rotated without --reset-password).
 *
 * Required env: DATABASE_URL, ADMIN_EMAIL (ADMIN_PASSWORD optional → generated and printed once).
 */
/* eslint-disable no-console -- CLI bootstrap script */
// Scripts run via ts-node are env-blind; load .env here so `npm run db:seed` works exactly as RUNNING.md
// writes it (the 2026-09-04 end-to-end run needed a manual `source .env` before this fix). Children
// inherit process.env through execSync.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();
import { execSync } from 'child_process';

const steps: Array<[string, string]> = [
  ['Schema → database (db push; no migration files by design)', 'npx prisma db push --skip-generate'],
  ['Prisma client', 'npx prisma generate'],
  ['Raw-SQL indexes Prisma cannot express (one is correctness-bearing)', 'bash scripts/apply-raw-sql-indexes.sh'],
  ['Role → capability grants (ensure-present; --reset to restore defaults)', 'npx ts-node -r tsconfig-paths/register scripts/setup-permissions.ts'],
  ['First SUPER_ADMIN (ADMIN_EMAIL / ADMIN_PASSWORD)', 'npx ts-node -r tsconfig-paths/register scripts/create-admin-user.ts'],
  ['"system" sentinel user (Activity FK target for system-attributed audit rows)', 'npx ts-node -r tsconfig-paths/register scripts/ensure-system-user.ts'],
  ['Sales theatres / countries (POV creation needs them)', 'node scripts/seed-geographical-data.js'],
  ['Pipeline-harness protocols', 'npx ts-node --project prisma/tsconfig.seed.json scripts/seed-protocol-prompts.ts'],
];

function main(): void {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!process.env.ADMIN_EMAIL) throw new Error('ADMIN_EMAIL is required (first account). Example: ADMIN_EMAIL=you@example.com npm run db:seed');
  console.log(`db:seed — ${steps.length} steps\n`);
  steps.forEach(([label, cmd], i) => {
    console.log(`▶ ${i + 1}/${steps.length} ${label}`);
    execSync(cmd, { stdio: 'inherit' });
    console.log('');
  });
  console.log('✅ db:seed complete. Optional next: npm run db:agents (generic agent templates), npm run db:templates (phase templates).');
}

try {
  main();
} catch (e) {
  console.error('❌ db:seed FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
}
