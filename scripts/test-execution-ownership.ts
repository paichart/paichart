/**
 * Tests for execution ownership classification (lib/services/executionOwnership.ts).
 *
 * These pin the decision table that replaced the startup cleanup's age heuristic
 * (2026-07-31, Run 17 incident). The two cases that MUST NOT regress are the ones the age
 * rule got wrong in opposite directions:
 *   - a 22-second-old execution whose process is dead IS orphaned (the Run 17 stall)
 *   - a live sibling's execution is NEVER orphaned, at any age (the data-loss trap)
 *
 * Run: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-execution-ownership.ts
 */

import {
  classifyOwner,
  parseOwner,
  currentOwnerStamp,
  currentProcessIdentity,
  type ExecutionOwner,
  type ProcessIdentity,
} from '../lib/services/executionOwnership';

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`);
  }
}

const NOW = 1_800_000_000_000;

const SELF: ProcessIdentity = {
  pid: 4242,
  host: 'prod-app-1',
  bootId: 'boot-aaa',
  startedAtMs: NOW,
};

function owner(over: Partial<ExecutionOwner> = {}): ExecutionOwner {
  return { pid: 1111, host: 'prod-app-1', bootId: 'boot-aaa', claimedAt: NOW - 60_000, ...over };
}

const DEAD = () => false;
const ALIVE = () => true;

console.log('\n📋 Execution ownership classification\n');

// --- The Run 17 regression cases -------------------------------------------------------
check(
  'dead owner on this host is orphaned regardless of how recently it was claimed',
  classifyOwner(owner({ claimedAt: NOW - 22_000 }), SELF, DEAD),
  'orphaned'
);
check(
  'live sibling process is never orphaned, even claimed long ago',
  classifyOwner(owner({ claimedAt: NOW - 6 * 60 * 60 * 1000 }), SELF, ALIVE),
  'alive'
);

// --- Host scoping ----------------------------------------------------------------------
check(
  'owner on another host is left alone even when the local pid is dead',
  classifyOwner(owner({ host: 'prod-app-2' }), SELF, DEAD),
  'alive'
);

// --- Boot id ---------------------------------------------------------------------------
check(
  'claim from before a reboot is orphaned even if that pid is alive again now',
  classifyOwner(owner({ bootId: 'boot-OLD' }), SELF, ALIVE),
  'orphaned'
);
check(
  'same boot id falls through to the liveness probe',
  classifyOwner(owner({ bootId: 'boot-aaa' }), SELF, ALIVE),
  'alive'
);
check(
  'missing boot id on the stamp does not force an orphan verdict',
  classifyOwner(owner({ bootId: null }), SELF, ALIVE),
  'alive'
);
check(
  'missing boot id on self does not force an orphan verdict',
  classifyOwner(owner({ bootId: 'boot-OLD' }), { ...SELF, bootId: null }, ALIVE),
  'alive'
);

// --- pid reuse -------------------------------------------------------------------------
check(
  'our own pid, claimed before we started, is a reused pid and therefore orphaned',
  classifyOwner(owner({ pid: SELF.pid, claimedAt: NOW - 1000 }), SELF, ALIVE),
  'orphaned'
);
check(
  'our own pid claimed AFTER we started is our own live work',
  classifyOwner(owner({ pid: SELF.pid, claimedAt: NOW + 5000 }), SELF, ALIVE),
  'alive'
);
check(
  'our own pid with no usable claimedAt is not assumed orphaned',
  classifyOwner(owner({ pid: SELF.pid, claimedAt: 0 }), SELF, ALIVE),
  'alive'
);

// --- Unstamped rows --------------------------------------------------------------------
check('null owner is unknown, not orphaned', classifyOwner(null, SELF, DEAD), 'unknown');

// --- parseOwner tolerance --------------------------------------------------------------
check('parseOwner rejects null', parseOwner(null), null);
check('parseOwner rejects a non-object', parseOwner('nope'), null);
check('parseOwner rejects a missing pid', parseOwner({ host: 'h' }), null);
check('parseOwner rejects a non-integer pid', parseOwner({ pid: 1.5, host: 'h' }), null);
check('parseOwner rejects a zero pid', parseOwner({ pid: 0, host: 'h' }), null);
check('parseOwner rejects a missing host', parseOwner({ pid: 10 }), null);
check(
  'parseOwner defaults an absent bootId/claimedAt rather than rejecting the stamp',
  parseOwner({ pid: 10, host: 'h' }),
  { pid: 10, host: 'h', bootId: null, claimedAt: 0 }
);
check(
  'parseOwner round-trips a real stamp through JSON (the DB path)',
  parseOwner(JSON.parse(JSON.stringify(currentOwnerStamp()))) !== null,
  true
);

// --- Live self-consistency -------------------------------------------------------------
// The stamp this process writes must classify as alive when read back by this process.
// Guards against a host/bootId mismatch between the two functions.
check(
  'a stamp written by this process is classified alive by this process',
  classifyOwner(parseOwner(JSON.parse(JSON.stringify(currentOwnerStamp()))), currentProcessIdentity()),
  'alive'
);
// And the real liveness probe must agree that we exist.
check(
  'the default liveness probe finds this very process',
  classifyOwner(
    { pid: process.pid, host: currentProcessIdentity().host, bootId: currentProcessIdentity().bootId, claimedAt: Date.now() + 60_000 },
    currentProcessIdentity()
  ),
  'alive'
);
// A pid that cannot exist must probe as dead through the real (non-injected) path.
check(
  'the default liveness probe reports an impossible pid as orphaned',
  classifyOwner(
    { pid: 0x7fffffff, host: currentProcessIdentity().host, bootId: currentProcessIdentity().bootId, claimedAt: Date.now() },
    currentProcessIdentity()
  ),
  'orphaned'
);

console.log(`\n${failed === 0 ? '✅' : '❌'} Passed: ${passed}, Failed: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
