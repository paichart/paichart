#!/usr/bin/env ts-node
/**
 * P2.4 Admin Audit Coverage Regression Test
 *
 * Pins the contract that admin mutations + sensitive reads write DB-level
 * Activity rows. String-pinned per the pattern in test-auth-audit-coverage.ts
 * (P2.2) — fails CI if a future refactor accidentally drops a trackActivity call.
 *
 * Audit closure: cline_docs/reviews/saas-readiness-auth-2026-05-19/sec-ops-review.md
 * Axis 2 "Audit Logging Completeness" — was 4/17 admin endpoints; this commit
 * brings 9 additional sites under audit coverage (user UPDATE/DELETE, role
 * CREATE/UPDATE/DELETE, permission grant/revoke, JWT status read, artifact
 * cleanup, audit-log view).
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 P2.4 Admin Audit Coverage Regression Tests\n');

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
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');
}

// Pre-load all files
const userHandler = readFile('lib/admin/handlers/user.ts');
const roleHandler = readFile('lib/admin/handlers/role.ts');
const settingsHandler = readFile('lib/admin/handlers/settings.ts');
const permissionsRoute = readFile('app/api/admin/permissions/route.ts');
const jwtStatusRoute = readFile('app/api/admin/jwt-status/route.ts');
const cleanupRoute = readFile('app/api/admin/cleanup/artifacts/route.ts');
const auditRoute = readFile('app/api/admin/audit/route.ts');

console.log('=====================================');
console.log('User management mutations');
console.log('=====================================\n');

test('user handler imports trackActivity', () => {
  assertContains(userHandler, "from '@/lib/auth/audit'", 'audit import');
});

test('user CREATE writes audit row', () => {
  assertContains(userHandler, "'CREATE_USER'", 'CREATE_USER event');
});

test('user UPDATE writes audit row', () => {
  assertContains(userHandler, "'UPDATE_USER'", 'UPDATE_USER event');
});

test('user DELETE writes audit row', () => {
  assertContains(userHandler, "'DELETE_USER'", 'DELETE_USER event');
});

console.log('\n=====================================');
console.log('Role management mutations');
console.log('=====================================\n');

test('role handler imports trackActivity', () => {
  assertContains(roleHandler, 'from "@/lib/auth/audit"', 'audit import');
});

test('role CREATE writes audit row', () => {
  assertContains(roleHandler, "'CREATE_ROLE'", 'CREATE_ROLE event');
});

test('role UPDATE writes audit row', () => {
  assertContains(roleHandler, "'UPDATE_ROLE'", 'UPDATE_ROLE event');
});

test('role DELETE writes audit row', () => {
  assertContains(roleHandler, "'DELETE_ROLE'", 'DELETE_ROLE event');
});

console.log('\n=====================================');
console.log('Permission grants/revokes');
console.log('=====================================\n');

test('permissions route imports logPermissionChange', () => {
  assertContains(permissionsRoute, 'logPermissionChange', 'logPermissionChange import');
});

test('permissions route calls logPermissionChange after upsert', () => {
  // Pin order: must appear AFTER the upsert call
  const upsertIdx = permissionsRoute.indexOf('rolePermission.upsert');
  const logIdx = permissionsRoute.indexOf('logPermissionChange(user');
  if (upsertIdx === -1 || logIdx === -1 || logIdx < upsertIdx) {
    throw new Error('logPermissionChange must be called AFTER the upsert');
  }
});

console.log('\n=====================================');
console.log('Sensitive reads (JWT status + audit log views)');
console.log('=====================================\n');

test('jwt-status route writes VIEW audit row', () => {
  assertContains(jwtStatusRoute, "'JWT_STATUS'", 'JWT_STATUS type');
  assertContains(jwtStatusRoute, "'VIEW'", 'VIEW action');
});

test('audit-log viewer writes meta-audit (VIEW) row', () => {
  assertContains(auditRoute, "'AUDIT_LOG'", 'AUDIT_LOG type');
  assertContains(auditRoute, "'VIEW'", 'VIEW action');
});

console.log('\n=====================================');
console.log('Destructive operations');
console.log('=====================================\n');

test('artifact cleanup POST writes EXECUTE audit row', () => {
  assertContains(cleanupRoute, "'ARTIFACT_CLEANUP'", 'ARTIFACT_CLEANUP type');
  assertContains(cleanupRoute, "'EXECUTE'", 'EXECUTE action');
});

console.log('\n=====================================');
console.log('Settings (already-existed coverage)');
console.log('=====================================\n');

test('settings handler still calls trackActivity (regression guard)', () => {
  // Existed pre-P2.4 — this test guards against accidental removal
  assertContains(settingsHandler, 'trackActivity', 'trackActivity call');
  assertContains(settingsHandler, "'SETTINGS'", 'SETTINGS type');
});

console.log('\n=====================================');
console.log('Fire-and-forget pattern (new sites use void)');
console.log('=====================================\n');

test('user UPDATE/DELETE use void trackActivity (fire-and-forget)', () => {
  // The new P2.4 additions should be fire-and-forget. CREATE pre-existed and
  // uses await — not required to convert (separate cleanup if desired).
  const matches = userHandler.match(/void trackActivity/g) || [];
  if (matches.length < 2) {
    throw new Error(`expected ≥2 void trackActivity in user.ts, found ${matches.length}`);
  }
});

test('role handler uses void trackActivity (fire-and-forget)', () => {
  const matches = roleHandler.match(/void trackActivity/g) || [];
  if (matches.length < 3) {
    throw new Error(`expected ≥3 void trackActivity in role.ts, found ${matches.length}`);
  }
});

test('permissions route uses void logPermissionChange (fire-and-forget)', () => {
  assertContains(permissionsRoute, 'void logPermissionChange', 'void prefix');
});

console.log('\n=====================================');
console.log('P2.4 Admin Audit Coverage Summary:');
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
