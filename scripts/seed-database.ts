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
  // E13 (devext 2026-09-07): the hub's own server instructions advertise `/prompt HOWTO-get-started` —
  // without this step a self-host answers "Prompt not found" to its first suggested command.
  ['Hub operational prompts (HOWTO-get-started, HOWTO-register-service, HOWTO-use-workflows, audits)', 'npx ts-node --project prisma/tsconfig.seed.json scripts/seed-operational-prompts.ts'],
  // E15 (devext clean-slate replay, 2026-09-08): a first install landed in a GUI with NO agent templates — db:seed
  // seeded protocols and prompts only, and the templates were an "optional next step" the run sheet never named.
  // A complete install needs them; every seed is idempotent (findFirst → update/create) and prod never runs
  // db:seed (prod re-seeds templates by hand after a deploy — that policy is unchanged).
  ['Agent templates — generic roles', 'npx ts-node -r tsconfig-paths/register scripts/seed-agent-templates.ts'],
  ['Pipeline Harness template', 'npx ts-node -r tsconfig-paths/register scripts/seed-harness-template.ts'],
  ['Artifact-synthesis templates', 'npx ts-node --project prisma/tsconfig.seed.json scripts/seed-artifact-synthesis-templates.ts'],
  ['Program templates (pipeline-of-pipelines)', 'npx ts-node -r tsconfig-paths/register scripts/seed-program-templates.ts'],
  ['Domain templates — network provisioning', 'npx ts-node -r tsconfig-paths/register scripts/seed-network-provisioning-templates.ts'],
  ['Domain templates — Terraform IaC', 'npx ts-node -r tsconfig-paths/register scripts/seed-terraform-iac-templates.ts'],
  ['Domain templates — Kubernetes GitOps', 'npx ts-node -r tsconfig-paths/register scripts/seed-kubernetes-gitops-templates.ts'],
  ['KPI templates', 'npx ts-node -r tsconfig-paths/register scripts/seed-kpi-templates.ts'],
  ['Phase templates', 'npx ts-node -r tsconfig-paths/register scripts/populate-phase-templates-improved.ts'],
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
  console.log('✅ db:seed complete — schema, grants, first SUPER_ADMIN, protocols, hub prompts, agent/harness/program/domain/phase templates. The Services registry starts EMPTY by design: register your own (docs/RUNNING.md → "Registering a service on your own network"; services/weather-service is the reference service).');
}

try {
  main();
} catch (e) {
  console.error('❌ db:seed FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
}
