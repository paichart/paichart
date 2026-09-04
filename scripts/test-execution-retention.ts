#!/usr/bin/env ts-node
/**
 * TEST — execution-retention (Flip 2 Increment 2): the SHARED status-aware retention selector + the
 * midnight scheduler helper. Pure logic (no DB). Covers the status-blind data-loss FIX, the keep-best
 * inversion, non-terminal exclusion, tier-1 equivalence, and the UTC midnight math.
 *
 * CI-safe: stub DATABASE_URL (execution-retention imports no Prisma, but keep the guard for parity).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
import {
  selectExecutionsToDelete, msUntilNextMidnightUTC,
  PRUNE_ON_COMPLETE_RETENTION, RM_DAILY_RETENTION, type RetentionExecRow,
} from '@/lib/services/execution-retention';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };
const eqSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

const t0 = Date.parse('2026-07-01T00:00:00Z');
// createdAt = t0 + i minutes → higher i is NEWER.
const row = (id: string, status: string, i: number, supersededById: string | null = null): RetentionExecRow =>
  ({ id, status, supersededById, createdAt: new Date(t0 + i * 60_000) });

console.log('\n🧪 TEST — execution-retention (status-aware selector + midnight scheduler)\n');

console.log('── budgets ──');
ok(PRUNE_ON_COMPLETE_RETENTION.maxSuccess === 10 && PRUNE_ON_COMPLETE_RETENTION.maxFailed === 10, 'in-tx budget = 10/10');
ok(RM_DAILY_RETENTION.maxSuccess === 4 && RM_DAILY_RETENTION.maxFailed === 4, 'daily budget = 4/4');

console.log('\n── THE status-blind data-loss FIX ──');
{
  // 1 OLD authoritative SUCCESS + 3 NEWER FAILED retries, budget 4/4 → nothing deleted (the old status-blind
  // keep-3 would have deleted the SUCCESS and kept the 3 FAILED).
  const execs = [row('S', 'SUCCESS', 0), row('F1', 'FAILED', 1), row('F2', 'FAILED', 2), row('F3', 'FAILED', 3)];
  ok(selectExecutionsToDelete(execs, RM_DAILY_RETENTION).length === 0, 'old SUCCESS + 3 newer FAILED (4/4) → nothing deleted');
}
{
  // Over budget on FAILED: SUCCESS still survives; only the OLDEST failures beyond the budget are pruned.
  const execs = [row('S', 'SUCCESS', 0), ...[1, 2, 3, 4, 5, 6].map((i) => row(`F${i}`, 'FAILED', i))];
  const del = selectExecutionsToDelete(execs, RM_DAILY_RETENTION);
  ok(!del.includes('S'), 'authoritative SUCCESS NEVER deleted even when newer FAILED exceed the budget');
  ok(eqSet(del, ['F1', 'F2']), 'the 2 OLDEST failed pruned (keep the 4 newest), SUCCESS untouched');
}

console.log('\n── non-terminal rows NEVER deleted (RUNNING/PENDING excluded) ──');
{
  const execs = [row('S', 'SUCCESS', 0), row('R', 'RUNNING', 10), row('P', 'PENDING', 11), row('F', 'FAILED', 1)];
  const del = selectExecutionsToDelete(execs, { maxSuccess: 0, maxFailed: 0 }); // aggressive: delete everything permitted
  ok(!del.includes('R') && !del.includes('P'), 'RUNNING/PENDING are never selected for deletion');
  ok(eqSet(del, ['S', 'F']), 'only terminal rows (SUCCESS/FAILED) are eligible');
}

console.log('\n── keep-best inversion within the SUCCESS budget (I-PRUNE-1) ──');
{
  // S_new is NEWER but superseded; S_old is older but authoritative. budget maxSuccess 1 → delete the superseded
  // loser, keep the authoritative winner (recency alone would wrongly delete S_old).
  const execs = [row('S_old', 'SUCCESS', 0), row('S_new', 'SUCCESS', 5, 'winner')];
  const del = selectExecutionsToDelete(execs, { maxSuccess: 1, maxFailed: 10 });
  ok(eqSet(del, ['S_new']), 'superseded loser pruned before the older authoritative winner');
}

console.log('\n── tier-1 equivalence (10/10, no supersession) ──');
{
  const succ = Array.from({ length: 15 }, (_, i) => row(`S${i}`, 'SUCCESS', i)); // S0 oldest … S14 newest
  const fail = Array.from({ length: 8 }, (_, i) => row(`F${i}`, 'FAILED', i));
  const del = selectExecutionsToDelete([...succ, ...fail], PRUNE_ON_COMPLETE_RETENTION);
  ok(eqSet(del, ['S0', 'S1', 'S2', 'S3', 'S4']), '15S+8F @10/10 → the 5 OLDEST SUCCESS pruned, all FAILED kept');
}

console.log('\n── msUntilNextMidnightUTC (fixed clock) ──');
{
  const H = 60 * 60 * 1000;
  ok(msUntilNextMidnightUTC(new Date('2026-07-06T23:00:00Z')) === H, '23:00 UTC → 1h to next midnight');
  ok(msUntilNextMidnightUTC(new Date('2026-07-06T00:00:00Z')) === 24 * H, 'exactly midnight → full 24h (next midnight, not now)');
  ok(msUntilNextMidnightUTC(new Date('2026-07-06T12:30:00Z')) === 11 * H + 30 * 60 * 1000, '12:30 UTC → 11h30m');
}

console.log('\n── shared-both-read-it: both pruners import the selector ──');
{
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const t1 = fs.readFileSync(path.join(__dirname, '..', 'lib/services/execution-terminal-persist.ts'), 'utf8');
  const rm = fs.readFileSync(path.join(__dirname, '..', 'lib/services/mcp/resourceManager.ts'), 'utf8');
  ok(/selectExecutionsToDelete/.test(t1) && /execution-retention/.test(t1), 'prune-on-complete reads the shared selector');
  ok(/selectExecutionsToDelete/.test(rm) && /execution-retention/.test(rm), 'RM cleanupArtifactsByTask reads the shared selector');
}

console.log(`\n${'─'.repeat(50)}\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('  ✅ execution-retention: GREEN\n');
