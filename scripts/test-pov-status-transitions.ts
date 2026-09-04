#!/usr/bin/env ts-node
/**
 * POV Status Transition — State-Machine Structure Tests
 *
 * Verifies the transition TABLE in lib/pov/services/status.ts (Changes A–F, 2026-06-22 review):
 *  - the new recovery/terminal edges exist (C: STALLED→IN_PROGRESS, D: STALLED→LOST,
 *    E: VALIDATION→IN_PROGRESS)
 *  - WON and LOST stay terminal (zero outgoing edges)
 *  - every non-terminal state is reachable and has an exit (no dead-ends — the original
 *    STALLED dead-end bug #1 is gone)
 *  - illegal shortcuts are still rejected (STALLED→VALIDATION, STALLED→WON)
 *
 * This exercises the PURE `getAvailableTransitions` (no DB). The blocked-task PREDICATE
 * (povHasBlockedTask — Changes A/B/F, the F4/C1 fixes) needs real Task rows with varying
 * phaseId/stageId and is covered by the live walk on Saltwater Dreaming (plan §6) plus the
 * validation-engine spot-check — not here.
 *
 * Created: 2026-06-22 (review implementation)
 */

// CI has no DATABASE_URL; status.ts transitively imports lib/prisma. Stub before import so
// the Prisma client instantiates without throwing. getAvailableTransitions never queries, so
// no connection is attempted. (See memory: feedback_ci_database_url_transitive.)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';

import { POVStatus } from '@prisma/client';
import { statusService } from '../lib/pov/services/status';

console.log('🧪 POV Status Transition — State-Machine Structure\n');

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}`);
  }
}

const avail = (from: POVStatus) => statusService.getAvailableTransitions(from);
const has = (from: POVStatus, to: POVStatus) => avail(from).includes(to);

// ── Existing forward edges ──
check('PROJECTED → IN_PROGRESS exists', has(POVStatus.PROJECTED, POVStatus.IN_PROGRESS));
check('IN_PROGRESS → VALIDATION exists', has(POVStatus.IN_PROGRESS, POVStatus.VALIDATION));
check('IN_PROGRESS → STALLED exists', has(POVStatus.IN_PROGRESS, POVStatus.STALLED));
check('VALIDATION → WON exists', has(POVStatus.VALIDATION, POVStatus.WON));
check('VALIDATION → LOST exists', has(POVStatus.VALIDATION, POVStatus.LOST));

// ── New edges (Changes C, D, E) ──
check('Change C: STALLED → IN_PROGRESS exists (resume)', has(POVStatus.STALLED, POVStatus.IN_PROGRESS));
check('Change D: STALLED → LOST exists (abandon)', has(POVStatus.STALLED, POVStatus.LOST));
check('Change E: VALIDATION → IN_PROGRESS exists (rework)', has(POVStatus.VALIDATION, POVStatus.IN_PROGRESS));

// ── Terminality preserved ──
check('WON is terminal (no outgoing edges)', avail(POVStatus.WON).length === 0);
check('LOST is terminal (no outgoing edges)', avail(POVStatus.LOST).length === 0);

// ── No dead-ends: every non-terminal state has at least one exit ──
for (const s of [POVStatus.PROJECTED, POVStatus.IN_PROGRESS, POVStatus.STALLED, POVStatus.VALIDATION]) {
  check(`${s} has at least one exit (no dead-end)`, avail(s).length > 0);
}

// ── Illegal shortcuts still rejected ──
check('STALLED → VALIDATION rejected (must resume first)', !has(POVStatus.STALLED, POVStatus.VALIDATION));
check('STALLED → WON rejected', !has(POVStatus.STALLED, POVStatus.WON));
check('PROJECTED → WON rejected', !has(POVStatus.PROJECTED, POVStatus.WON));
check('PROJECTED → VALIDATION rejected', !has(POVStatus.PROJECTED, POVStatus.VALIDATION));

console.log(`\n${failed === 0 ? '✅' : '❌'} Passed: ${passed}  Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
