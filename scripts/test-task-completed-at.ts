#!/usr/bin/env ts-node
/**
 * Guards the Task.completedAt derivation (taskCompletedAtExtension), which wraps EVERY task write —
 * so its transition logic must be correct. Pure-function test, no DB.
 */
// CI guard: the module imports the Prisma namespace; stub DATABASE_URL just in case.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub?sslmode=disable';
}

import { applyCompletedAt } from '@/lib/database/task-completed-at-extension';

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error(`❌ ${msg}`); }
}

const NOW = new Date('2026-01-01T00:00:00.000Z');

let d: any = { status: 'COMPLETED' };
applyCompletedAt(d, NOW);
check(d.completedAt === NOW, 'status COMPLETED → completedAt = now');

d = { status: { set: 'COMPLETED' } };
applyCompletedAt(d, NOW);
check(d.completedAt === NOW, 'status { set: COMPLETED } → completedAt = now');

d = { status: 'IN_PROGRESS' };
applyCompletedAt(d, NOW);
check(d.completedAt === null, 'status IN_PROGRESS → completedAt = null (reopened)');

d = { assigneeId: 'x' };
applyCompletedAt(d, NOW);
check(d.completedAt === undefined, 'no status in payload → completedAt untouched');

const explicit = new Date('2025-05-05T00:00:00.000Z');
d = { status: 'COMPLETED', completedAt: explicit };
applyCompletedAt(d, NOW);
check(d.completedAt === explicit, 'explicit completedAt is respected (e.g. backfill)');

let threw = false;
try { applyCompletedAt(null, NOW); applyCompletedAt(undefined, NOW); applyCompletedAt(42 as any, NOW); }
catch { threw = true; }
check(!threw, 'null/undefined/garbage data does not throw');

console.log(failed === 0 ? `✅ task-completed-at: ${passed} passed` : `❌ task-completed-at: ${failed} failed / ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
