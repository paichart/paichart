#!/usr/bin/env ts-node
/**
 * Wave 7 Phase 7.0a — MCP method classifier tests.
 *
 * Covers `lib/auth/mcp-method-classifier.ts` invariants exposed by Round 1
 * specialist review (mcp-protocol-debug C2 — `ping` was in MCP_PUBLIC_METHODS
 * but missing from VALID_MCP_METHODS dispatch list).
 *
 * Pure classifier-level tests. Runtime dispatch verification (the actual
 * switch-case fixes for ping + notifications/message + notifications/progress)
 * is covered by Phase 7.0a Quartet gate leg 4 (curl smoke against deployed prod).
 */

import { MCP_PUBLIC_METHODS, isProtectedMethod } from '../lib/auth/mcp-method-classifier';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assertEqual(actual: unknown, expected: unknown, msg: string): void {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(`${msg} — expected: ${JSON.stringify(expected)}, actual: ${JSON.stringify(actual)}`);
    console.log(`  ❌ ${msg} — expected: ${JSON.stringify(expected)}, actual: ${JSON.stringify(actual)}`);
  }
}

function assertTrue(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

console.log('\n🧪 MCP method classifier tests (Wave 7 Phase 7.0a)\n');

// ─── Test 1: ping is in MCP_PUBLIC_METHODS (C-PRE-2 dispatch precondition) ───
console.log('Test 1: ping membership in MCP_PUBLIC_METHODS');
{
  assertTrue(
    (MCP_PUBLIC_METHODS as readonly string[]).includes('ping'),
    "Test 1: 'ping' is in MCP_PUBLIC_METHODS (was already correct; verifies the dispatch-side fix has a matching auth-side classification)"
  );
}

// ─── Test 2: isProtectedMethod('ping') returns false ──────────────────
console.log('\nTest 2: isProtectedMethod treats ping as public');
{
  assertEqual(isProtectedMethod('ping'), false, "Test 2: isProtectedMethod('ping') === false (public, no auth required per MCP spec §6.4)");
}

// ─── Test 3: notifications/initialized remains public (regression guard) ─
console.log('\nTest 3: notifications/initialized regression guard');
{
  assertEqual(
    isProtectedMethod('notifications/initialized'),
    false,
    "Test 3: isProtectedMethod('notifications/initialized') === false (was already correct, no regression)"
  );
}

// ─── Test 4: notifications/message still requires auth ───────────────
// IMPORTANT: This test pins the auth contract. notifications/message is NOT in
// MCP_PUBLIC_METHODS — only the DISPATCH side (processMCPRequest switch) was
// the bug. Auth side has always correctly required authentication for this
// method. C-PRE-1 fix added the 202 dispatch response; auth classification
// was always correct.
console.log('\nTest 4: notifications/message auth classification unchanged');
{
  assertEqual(
    isProtectedMethod('notifications/message'),
    true,
    "Test 4: isProtectedMethod('notifications/message') === true (auth still required; C-PRE-1 fix was DISPATCH-only, not classifier)"
  );
}

// ─── Test 5: notifications/progress still requires auth ──────────────
console.log('\nTest 5: notifications/progress auth classification unchanged');
{
  assertEqual(
    isProtectedMethod('notifications/progress'),
    true,
    "Test 5: isProtectedMethod('notifications/progress') === true (same as Test 4; classifier already correct)"
  );
}

// ─── Test 6: secure-by-default for unknown method ────────────────────
// Bonus regression guard for the broader classifier contract.
console.log('\nTest 6: secure-by-default for unknown methods');
{
  assertEqual(
    isProtectedMethod('unknown/spec/method'),
    true,
    'Test 6: isProtectedMethod returns TRUE (requires auth) for unknown methods (secure default)'
  );
  assertEqual(isProtectedMethod(null), true, "Test 6: isProtectedMethod(null) === true");
  assertEqual(isProtectedMethod(undefined), true, "Test 6: isProtectedMethod(undefined) === true");
  assertEqual(isProtectedMethod(''), true, "Test 6: isProtectedMethod('') === true");
}

// ─── Test 7: case-insensitive matching ───────────────────────────────
console.log('\nTest 7: case-insensitive matching');
{
  assertEqual(isProtectedMethod('PING'), false, "Test 7: isProtectedMethod('PING') === false (case-insensitive per classifier contract)");
  assertEqual(isProtectedMethod('Tools/List'), false, "Test 7: mixed-case 'Tools/List' is public");
}

// ──────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n❌ FAILURES:\n');
  failures.forEach((f) => console.log(`  - ${f}\n`));
  process.exit(1);
}
console.log('✅ All MCP method classifier tests passed');
process.exit(0);
