#!/usr/bin/env ts-node
/**
 * DN1 (2026-10-05) — the agent-stamped `metadata.cannotRun` consumer's SCOPE. CI-safe (no DB).
 *
 * The at-rest consumer (task.update → handleAgentStampedCannotRun) was gated on `task.type === 'PIPELINE'`, so a
 * NON-PIPELINE program child stamped cannotRun (the superseded duplicate Node C cmutnhcsy…, 2026-10-04) stayed
 * non-terminal, its child stage never settled, and program SYNTHESIZE could not resolve. Pins:
 *   S1-S3  the pure scope decision (pipeline / harness-child / out-of-scope)
 *   S4     the handler no longer gates on PIPELINE before calling the effector, and passes the task type
 *   S5     a harness-child flip carries the not-in-flight clause INSIDE the CAS where (and only that scope)
 *   S6     the effector decides harness ownership through the shared helper (never an inline copy)
 * The live-DB proof is scripts/test-agent-stamped-cannot-run-behavioral.ts (dev DB, out of CI).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
process.env.PAICHART_SKIP_DB_CONNECT = 'true'; // the effector module reaches lib/prisma; this suite never touches a DB

import * as fs from 'fs';
import * as path from 'path';
import { agentStampedCannotRunScope } from '../lib/services/task-can-never-run-persist';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.error(`❌ ${name}\n   ${(e as Error).message}`); failed++; }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

const persistSrc = fs.readFileSync(path.join(__dirname, '../lib/services/task-can-never-run-persist.ts'), 'utf8');
const handlerSrc = fs.readFileSync(path.join(__dirname, '../lib/mcp/tasks/action/handlers/task/task-update-handler.ts'), 'utf8');

test('S1 — a PIPELINE is consumed as before, whatever its ownership', () => {
  assert(agentStampedCannotRunScope('PIPELINE', false) === 'pipeline', 'PIPELINE, not owned');
  assert(agentStampedCannotRunScope('PIPELINE', true) === 'pipeline', 'PIPELINE, owned');
});

test('S2 — a NON-PIPELINE task inside a harness is consumed (the DN1 hang)', () => {
  for (const t of ['ACTION', 'APPROVAL', 'MILESTONE', null, undefined]) {
    assert(agentStampedCannotRunScope(t as any, true) === 'harness-child', `type ${String(t)} owned`);
  }
});

test('S3 — a NON-PIPELINE task outside every harness stays out of scope (nothing waits on it)', () => {
  for (const t of ['ACTION', 'APPROVAL', null, undefined]) {
    assert(agentStampedCannotRunScope(t as any, false) === 'out-of-scope', `type ${String(t)} not owned`);
  }
});

test('S4 — the handler calls the effector WITHOUT a PIPELINE type gate, and passes the task type', () => {
  const i = handlerSrc.indexOf("import('@/lib/services/task-can-never-run-persist')");
  assert(i > 0, 'effector import present');
  const guard = handlerSrc.slice(Math.max(0, i - 400), i);
  assert(guard.includes("mergedMetadataLog?.keys.includes('cannotRun')"), 'cannotRun-newly-written guard present');
  assert(!/type\s*===\s*'PIPELINE'/.test(guard), 'no PIPELINE type gate in front of the consumer');
  assert(/user\.userId,\s*\n\s*task\?\.type \?\? null\s*\n\s*\)\.catch/.test(handlerSrc.slice(i, i + 900)), 'task type passed to the effector');
});

test('S5 — the not-in-flight clause sits INSIDE the flip CAS and is switched on for harness-child only', () => {
  const cas = persistSrc.slice(persistSrc.indexOf('const flipped = await tx.task.updateMany('), persistSrc.indexOf("data: { executionStatus: 'FAILED', updatedAt: now }"));
  assert(cas.length > 0, 'CAS located');
  assert(/opts\?\.requireNotInFlight\s*\n?\s*\?\s*\{\s*executions:\s*\{\s*none:\s*\{\s*status:\s*\{\s*in:\s*\[\.\.\.ACTIVE_EXECUTION_STATUSES\]/.test(cas),
    'executions.none(ACTIVE) in the where, keyed on requireNotInFlight');
  assert(/requireNotInFlight: scope === 'harness-child'/.test(persistSrc), 'requireNotInFlight is the harness-child scope');
});

test('S6 — ownership comes from the shared harnessOwnedTaskIds helper (no inline pipelineStageId SQL)', () => {
  assert(/harnessOwnedTaskIds\(prisma, \[taskId\]\)/.test(persistSrc), 'shared helper called');
  assert(!/pipelineStageId' = /.test(persistSrc), 'no inline ownership SQL copy');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
