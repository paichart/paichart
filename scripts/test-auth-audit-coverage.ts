#!/usr/bin/env ts-node
/**
 * P2.2 Auth Audit Coverage Regression Test
 *
 * Pins the contract that login / OAuth-callback / logout routes write
 * DB-level Activity rows for SOC 2 CC6.1 evidence (vs pino-only logs
 * which rotate every 14 days and don't survive customer-security-team
 * queries about activity 90+ days ago).
 *
 * The string-presence pattern is borrowed from scripts/test-pov-field-filtering.ts
 * and scripts/validate-id-format.ts — string-pinned tests that fail loudly if
 * future refactors accidentally drop the trackActivity call.
 *
 * Audit closure: cline_docs/reviews/saas-readiness-auth-2026-05-19/sec-ops-review.md
 * Gap A (DB-level audit coverage for login + admin events).
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 P2.2 Auth Audit Coverage Regression Tests\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    failed++;
  }
}

function assertContains(haystack: string, needle: string, msg: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`${msg}: expected "${needle}" in file`);
  }
}

function readFile(relPath: string): string {
  const fullPath = path.resolve(__dirname, '..', relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

console.log('=====================================');
console.log('Layer 1: trackActivity import present');
console.log('=====================================\n');

const loginRoute = readFile('app/api/auth/login/route.ts');
const oauthRoute = readFile('app/api/auth/oauth/callback/[provider]/route.ts');
const logoutRoute = readFile('app/api/auth/logout/route.ts');

test('login/route.ts imports trackActivity', () => {
  assertContains(loginRoute, "from '@/lib/auth/audit'", 'audit import');
  assertContains(loginRoute, 'trackActivity', 'trackActivity symbol');
});

test('oauth/callback/[provider]/route.ts imports trackActivity', () => {
  assertContains(oauthRoute, "from '@/lib/auth/audit'", 'audit import');
  assertContains(oauthRoute, 'trackActivity', 'trackActivity symbol');
});

test('logout/route.ts imports trackActivity', () => {
  assertContains(logoutRoute, "from '@/lib/auth/audit'", 'audit import');
  assertContains(logoutRoute, 'trackActivity', 'trackActivity symbol');
});

console.log('\n=====================================');
console.log('Layer 2: required event types present');
console.log('=====================================\n');

test('login route writes LOGIN_SUCCESS audit row', () => {
  assertContains(loginRoute, "'LOGIN_SUCCESS'", 'LOGIN_SUCCESS event');
});

test('login route writes LOGIN_FAILED audit row (when user exists)', () => {
  assertContains(loginRoute, "'LOGIN_FAILED'", 'LOGIN_FAILED event');
});

test('oauth callback writes OAUTH_LOGIN_SUCCESS audit row', () => {
  assertContains(oauthRoute, "'OAUTH_LOGIN_SUCCESS'", 'OAUTH_LOGIN_SUCCESS event');
});

test('logout route writes LOGOUT audit row', () => {
  assertContains(logoutRoute, "'LOGOUT'", 'LOGOUT event');
});

console.log('\n=====================================');
console.log('Layer 3: fire-and-forget invocation');
console.log('=====================================\n');

test('login route uses void trackActivity (fire-and-forget)', () => {
  assertContains(loginRoute, 'void trackActivity', 'void prefix on call');
});

test('oauth callback uses void trackActivity (fire-and-forget)', () => {
  assertContains(oauthRoute, 'void trackActivity', 'void prefix on call');
});

test('logout route uses void trackActivity (fire-and-forget)', () => {
  assertContains(logoutRoute, 'void trackActivity', 'void prefix on call');
});

console.log('\n=====================================');
console.log('Layer 4: AUTHENTICATION type is consistent');
console.log('=====================================\n');

test('all three routes use AUTHENTICATION as Activity.type', () => {
  // Centralized type makes daily-summary.sh + admin/audit UI filters trivial
  for (const [name, content] of [
    ['login', loginRoute],
    ['oauth', oauthRoute],
    ['logout', logoutRoute],
  ] as const) {
    if (!content.includes("'AUTHENTICATION'")) {
      throw new Error(`${name} route should use 'AUTHENTICATION' type`);
    }
  }
});

console.log('\n=====================================');
console.log('P2.2 Auth Audit Coverage Summary:');
console.log('=====================================\n');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total:  ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
}

console.log('\n✅ All tests passed!');
process.exit(0);
