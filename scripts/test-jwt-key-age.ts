/**
 * test:jwt-key-age — admin jwt-status key age (lib/auth/jwt-key-age.ts).
 *
 * Pins the 2026-10-13 fix: the age comes from JWT_KEY_ROTATED_AT (exact day) when it is a valid
 * YYYY-MM-DD, and from the 1st of the kid's month otherwise. Before the fix the endpoint used the
 * month only and reported 12 days for a key rotated that morning.
 *
 * Pure functions with an injected clock: no DB, no env, no network.
 */
process.env.LOG_LEVEL = 'silent';

import { calculateKeyAge, calculateNextRotationDate } from '../lib/auth/jwt-key-age';

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${description}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${description}\n     ${(e as Error).message}`);
  }
}

function eq<T>(actual: T, expected: T, what: string) {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// The real case: rotated 2026-10-13, checked at 02:30Z the same day.
const ROTATION_DAY = new Date('2026-10-13T02:30:00Z');

console.log('\nJWT key age (admin jwt-status)\n');

test('exact JWT_KEY_ROTATED_AT on rotation day → age 0 (the 2026-10-13 bug read 12)', () => {
  eq(calculateKeyAge('paichart-2026-10', '2026-10-13', ROTATION_DAY), 0, 'age');
});

test('exact JWT_KEY_ROTATED_AT → next rotation 90 days later (2027-01-11, not 2026-12-30)', () => {
  eq(calculateNextRotationDate('paichart-2026-10', '2026-10-13', ROTATION_DAY), '2027-01-11', 'next rotation');
});

test('exact JWT_KEY_ROTATED_AT 83 days later → 83 (the July key on 2026-10-13)', () => {
  eq(calculateKeyAge('paichart-2026-07', '2026-07-22', ROTATION_DAY), 83, 'age');
});

test('JWT_KEY_ROTATED_AT unset → falls back to the 1st of the kid month (approximate, overstates)', () => {
  const age = calculateKeyAge('paichart-2026-10', undefined, ROTATION_DAY);
  // Local-time 1st of the month; 12 in any timezone from UTC-2 to UTC+14.
  if (age < 11 || age > 13) throw new Error(`expected ~12, got ${age}`);
});

test('empty JWT_KEY_ROTATED_AT → same fallback', () => {
  eq(calculateKeyAge('paichart-2026-10', '', ROTATION_DAY), calculateKeyAge('paichart-2026-10', undefined, ROTATION_DAY), 'age');
});

for (const bad of ['2026-10', '13/10/2026', '2026-10-13T00:00:00Z', '2026-02-30', '2026-13-01', 'yesterday']) {
  test(`invalid JWT_KEY_ROTATED_AT "${bad}" → falls back to the kid month, never trusted`, () => {
    eq(calculateKeyAge('paichart-2026-10', bad, ROTATION_DAY), calculateKeyAge('paichart-2026-10', undefined, ROTATION_DAY), 'age');
  });
}

test('JWT_KEY_ROTATED_AT in the future → 0 (brand-new key), unchanged edge case', () => {
  eq(calculateKeyAge('paichart-2026-10', '2026-10-20', ROTATION_DAY), 0, 'age');
});

test('malformed kid → -1 even with a valid JWT_KEY_ROTATED_AT (unchanged edge case)', () => {
  eq(calculateKeyAge('not-a-kid', '2026-10-13', ROTATION_DAY), -1, 'age');
  eq(calculateNextRotationDate('not-a-kid', '2026-10-13', ROTATION_DAY), 'Invalid key ID', 'next rotation');
});

test('kid month 13 / year 1999 → -1 (unchanged edge case)', () => {
  eq(calculateKeyAge('paichart-2026-13', undefined, ROTATION_DAY), -1, 'month');
  eq(calculateKeyAge('paichart-1999-10', undefined, ROTATION_DAY), -1, 'year');
});

test('age past 90 days → next rotation is today (never negative)', () => {
  eq(calculateNextRotationDate('paichart-2026-07', '2026-07-01', ROTATION_DAY), '2026-10-13', 'next rotation');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
