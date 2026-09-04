/**
 * DEPRECATED (2026-05-31) — superseded by scripts/seed-named-workflows.ts.
 *
 * The 6 workflows this file used to seed (pov-status-report, blocked-task-escalation,
 * screenshot-documentation, competitor-price-monitor, task-completion-notify,
 * weekly-pov-digest) are all live in prod and are now captured in the complete prod
 * snapshot scripts/named-workflows.json, applied by scripts/seed-named-workflows.ts
 * (upsert by name, status-faithful, all 18 named workflows).
 *
 * Two seeds for the same workflows risks drift, so this one is retired. The richer inline
 * descriptions that used to live here are NOT the live prod copy (prod's are leaner) —
 * recover from git history if ever needed, then push via named-workflows.json + reseed.
 *
 * This stub is intentionally a no-op so any existing reference or accidental run does
 * nothing (it does NOT touch the database).
 */

console.log('[seed-example-workflows] DEPRECATED — superseded by scripts/seed-named-workflows.ts');
console.log('  Run instead:  npx ts-node -r tsconfig-paths/register scripts/seed-named-workflows.ts');
process.exit(0);
