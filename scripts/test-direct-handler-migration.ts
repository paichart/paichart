#!/usr/bin/env ts-node
/**
 * Direct Handler Migration Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Validation - Checks code for three-tier fallback patterns
 * Layer 2: Behavior Validation - Tests buildTokenPayload security guarantees
 *
 * Created: 2026-03-09
 * Tests: 14 pattern + 14 behavior = 28 total
 *
 * Validates the perform tool direct handler migration:
 * - buildTokenPayload security (role validation, empty-string guards)
 * - Three-tier fallback pattern (direct → authenticated HTTP → fail-closed)
 * - Router bridge audit logging
 * - mcp-logging.ts action mapping completeness
 */

import * as fs from 'fs';
import * as path from 'path';

// Direct import of the module under test
const { buildTokenPayload, VALID_ROLES } = require('../lib/mcp/server/utils/build-token-payload');

console.log('🧪 Direct Handler Migration Tests (Dual-Layer)\n');

let passed = 0;
let failed = 0;
let layer1Passed = 0;
let layer2Passed = 0;

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

function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toThrow(expectedMessage?: string) {
      // value should be a function
      if (typeof value !== 'function') {
        throw new Error('Expected a function for toThrow');
      }
      try {
        value();
        throw new Error('Expected function to throw but it did not');
      } catch (err: any) {
        if (expectedMessage && !err.message.includes(expectedMessage)) {
          throw new Error(`Expected error containing "${expectedMessage}", got "${err.message}"`);
        }
      }
    },
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected string containing "${substring}"`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (value < expected) {
        throw new Error(`Expected ${value} >= ${expected}`);
      }
    },
    toInclude(item: string) {
      if (!Array.isArray(value) || !value.includes(item)) {
        throw new Error(`Expected array to include "${item}"`);
      }
    }
  };
}

// ========================================
// LAYER 1: Code Pattern Validation
// ========================================

console.log('=====================================');
console.log('LAYER 1: Code Pattern Validation');
console.log('=====================================\n');

// --- Three-tier fallback patterns in handlers ---

test('Pattern: task-action-handler.js has three-tier fallback (Tier 1, 2, 3)', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/tools/advanced/task-action-handler.js'), 'utf-8');
  expect(content.includes('TIER 1')).toBe(true);
  expect(content.includes('TIER 2')).toBe(true);
  expect(content.includes('TIER 3')).toBe(true);
  layer1Passed++;
});

test('Pattern: agent-results-handler.js has three-tier fallback', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/tools/advanced/agent-results-handler.js'), 'utf-8');
  expect(content.includes('routeAction')).toBe(true);
  expect(content.includes('buildTokenPayload')).toBe(true);
  expect(content.includes('Authentication required')).toBe(true);
  layer1Passed++;
});

test('Pattern: team-performance-handler.js has three-tier fallback', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/tools/advanced/analytics/team-performance-handler.js'), 'utf-8');
  expect(content.includes('routeAction')).toBe(true);
  expect(content.includes('buildTokenPayload')).toBe(true);
  expect(content.includes('Authentication required')).toBe(true);
  layer1Passed++;
});

// --- Router bridge patterns ---

test('Pattern: router-bridge.js exists and requires TasksActionRouter', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/tasks/action/router-bridge.js'), 'utf-8');
  expect(content.includes("require('./tasks-action-router')")).toBe(true);
  expect(content.includes("require('./utilities/mcp-logging')")).toBe(true);
  layer1Passed++;
});

test('Pattern: router-bridge.js has skipLogging support for polling', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/tasks/action/router-bridge.js'), 'utf-8');
  expect(content.includes('skipLogging')).toBe(true);
  expect(content.includes('logMCPInteraction')).toBe(true);
  layer1Passed++;
});

test('Pattern: router-bridge.js uses relative logger path (R1)', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/tasks/action/router-bridge.js'), 'utf-8');
  // Uses relative path, NOT @/lib/logger in require()
  expect(content.includes("require('../../../logger')")).toBe(true);
  // Ensure no require('@/lib/logger') — the comment mentioning it is fine
  expect(content.includes("require('@/lib/logger')")).toBe(false);
  layer1Passed++;
});

// --- buildTokenPayload patterns ---

test('Pattern: build-token-payload.js validates all 4 roles', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/utils/build-token-payload.js'), 'utf-8');
  expect(content.includes("'USER'")).toBe(true);
  expect(content.includes("'DEMO_USER'")).toBe(true);
  expect(content.includes("'ADMIN'")).toBe(true);
  expect(content.includes("'SUPER_ADMIN'")).toBe(true);
  layer1Passed++;
});

test('Pattern: build-token-payload.js guards against empty-string userId', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/utils/build-token-payload.js'), 'utf-8');
  expect(content.includes('trim()')).toBe(true);
  expect(content.includes('userId is missing or empty')).toBe(true);
  layer1Passed++;
});

test('Pattern: build-token-payload.js maps user.id to userId', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/utils/build-token-payload.js'), 'utf-8');
  expect(content.includes('user.id || user.userId')).toBe(true);
  layer1Passed++;
});

// --- mcp-logging.ts completeness ---

test('Pattern: mcp-logging.ts has all 13 router actions in ACTION_TO_SERVICE', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/tasks/action/utilities/mcp-logging.ts'), 'utf-8');
  const requiredActions = [
    'task.create', 'task.update', 'task.assign', 'task.complete', 'task.comment',
    'agent.configure', 'agent.execute', 'agent.assign', 'agent.status', 'agent.results',
    'analytics.generate', 'pov.create', 'stage.create'
  ];
  for (const action of requiredActions) {
    expect(content.includes(`'${action}'`)).toBe(true);
  }
  layer1Passed++;
});

// --- P0 revert verification ---

test('Pattern: api-client.js has NO writeEndpoints block (P0 reverted)', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/utils/api-client.js'), 'utf-8');
  expect(content.includes('writeEndpoints')).toBe(false);
  expect(content.includes('isWriteEndpoint')).toBe(false);
  layer1Passed++;
});

test('Pattern: api-client.js admin auth fallback is hardened to throw', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/utils/api-client.js'), 'utf-8');
  expect(content.includes('admin fallback disabled')).toBe(true);
  expect(content.includes('getAuthHeaders')).toBe(false);
  layer1Passed++;
});

// --- Polling skip ---

test('Pattern: task-action-handler.js skips logging for status/results polls', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/tools/advanced/task-action-handler.js'), 'utf-8');
  expect(content.includes('skipLogging: true')).toBe(true);
  layer1Passed++;
});

// --- Tier 2 architectural decision ---
//
// Pre-2026-05-19: a TODO(2026-04-01) tracked future removal of Tier 2 after
// direct-path stability was confirmed.
//
// 2026-05-19 (U2 Phase D site #11): sec-ops Option a determined Tier 2 should
// be KEPT indefinitely as defence-in-depth — the standalone paichart-mcp
// process still needs an HTTP fallback even though ts-node is now loaded
// (commit a7db9a35). The 2026-04-01 TODO is retired, not deferred. This test
// asserts the new architectural decision is recorded in-file.

test('Pattern: task-action-handler.js documents Tier 2 retention decision (sec-ops Option a)', () => {
  const content = fs.readFileSync(path.resolve('lib/mcp/server/tools/advanced/task-action-handler.js'), 'utf-8');
  expect(content.includes('KEEP Tier 2 per sec-ops Option a')).toBe(true);
  layer1Passed++;
});

// ========================================
// LAYER 2: Behavior Validation
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Behavior Validation');
console.log('=====================================\n');

// --- buildTokenPayload: valid inputs ---

test('Behavior: Valid MCP context { id, email, role } returns correct TokenPayload', () => {
  const result = buildTokenPayload({
    user: { id: 'cmgws12345abc', email: 'user@example.com', role: 'USER' }
  });
  expect(result.userId).toBe('cmgws12345abc');
  expect(result.email).toBe('user@example.com');
  expect(result.role).toBe('USER');
  layer2Passed++;
});

test('Behavior: userId fallback from user.userId (API context shape)', () => {
  const result = buildTokenPayload({
    user: { userId: 'cmgws12345abc', email: 'user@example.com', role: 'USER' }
  });
  expect(result.userId).toBe('cmgws12345abc');
  layer2Passed++;
});

test('Behavior: tenantId maps when present', () => {
  const result = buildTokenPayload({
    user: { id: 'cmgws12345abc', email: 'user@example.com', role: 'USER', tenantId: 'tenant1' }
  });
  expect(result.tenantId).toBe('tenant1');
  layer2Passed++;
});

test('Behavior: tenantId is undefined when absent', () => {
  const result = buildTokenPayload({
    user: { id: 'cmgws12345abc', email: 'user@example.com', role: 'USER' }
  });
  expect(result.tenantId).toBe(undefined);
  layer2Passed++;
});

test('Behavior: All 4 valid roles accepted', () => {
  for (const role of ['USER', 'DEMO_USER', 'ADMIN', 'SUPER_ADMIN']) {
    const result = buildTokenPayload({
      user: { id: 'cmgws12345abc', email: 'user@example.com', role }
    });
    expect(result.role).toBe(role);
  }
  layer2Passed++;
});

// --- buildTokenPayload: security rejections ---

test('Behavior: Missing user (null context) throws "Authentication required"', () => {
  expect(() => buildTokenPayload(null)).toThrow('Authentication required');
  expect(() => buildTokenPayload({})).toThrow('Authentication required');
  expect(() => buildTokenPayload(undefined)).toThrow('Authentication required');
  layer2Passed++;
});

test('Behavior: Empty-string userId throws "userId is missing or empty" (AR-1)', () => {
  expect(() => buildTokenPayload({
    user: { id: '', email: 'user@example.com', role: 'USER' }
  })).toThrow('userId is missing or empty');
  layer2Passed++;
});

test('Behavior: Whitespace-only userId throws', () => {
  expect(() => buildTokenPayload({
    user: { id: '   ', email: 'user@example.com', role: 'USER' }
  })).toThrow('userId is missing or empty');
  layer2Passed++;
});

test('Behavior: null userId throws', () => {
  expect(() => buildTokenPayload({
    user: { id: null, email: 'user@example.com', role: 'USER' }
  })).toThrow('userId is missing or empty');
  layer2Passed++;
});

test('Behavior: Missing email throws "Incomplete user context"', () => {
  expect(() => buildTokenPayload({
    user: { id: 'cmgws12345abc', role: 'USER' }
  })).toThrow('Incomplete user context');
  layer2Passed++;
});

test('Behavior: Missing role throws "Incomplete user context"', () => {
  expect(() => buildTokenPayload({
    user: { id: 'cmgws12345abc', email: 'user@example.com' }
  })).toThrow('Incomplete user context');
  layer2Passed++;
});

test('Behavior: Invalid role "HACKER" throws "Invalid user role"', () => {
  expect(() => buildTokenPayload({
    user: { id: 'cmgws12345abc', email: 'user@example.com', role: 'HACKER' }
  })).toThrow('Invalid user role');
  layer2Passed++;
});

test('Behavior: Numeric userId (type coercion attack) throws', () => {
  expect(() => buildTokenPayload({
    user: { id: 12345, email: 'user@example.com', role: 'USER' }
  })).toThrow('userId is missing or empty');
  layer2Passed++;
});

test('Behavior: VALID_ROLES exports exactly 4 roles', () => {
  expect(VALID_ROLES.length).toBe(4);
  expect(VALID_ROLES).toInclude('USER');
  expect(VALID_ROLES).toInclude('DEMO_USER');
  expect(VALID_ROLES).toInclude('ADMIN');
  expect(VALID_ROLES).toInclude('SUPER_ADMIN');
  layer2Passed++;
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('Direct Handler Migration Test Summary:');
console.log('=====================================');
console.log(`\n📊 Layer 1 (Pattern): ${layer1Passed}/14`);
console.log(`📊 Layer 2 (Behavior): ${layer2Passed}/14`);
console.log(`\n✅ Total Passed: ${passed}`);
console.log(`❌ Total Failed: ${failed}`);
console.log(`📊 Total Tests:  ${passed + failed}`);
console.log('=====================================\n');

if (failed > 0) {
  console.error('❌ Some tests failed!\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
