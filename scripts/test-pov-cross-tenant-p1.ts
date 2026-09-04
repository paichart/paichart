/**
 * P1 POV Cross-Tenant Security Tests
 * Tests POV access validation for agent and CRUD endpoints
 *
 * Dual-Layer Testing (per validation-testing-architecture.md):
 * - Layer 1: Pattern validation (helper/middleware usage in code)
 * - Layer 2: Behavior validation (cross-POV attacks actually blocked)
 *
 * @see /.claude/knowledge/domain/testing/validation-testing-architecture.md
 * @see cline_docs/reviews/quarterly-review-2025-11-26/P1-FINAL-APPROVED-PLAN.md
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 Testing P1 POV Cross-Tenant Security\n');

let passed = 0;
let failed = 0;

// ===== LAYER 1: Pattern Validation (Code Analysis) =====
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('LAYER 1: Pattern Validation (Code Analysis)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

/**
 * Test if a file contains a specific pattern
 */
function testFileHasPattern(filePath: string, pattern: string | RegExp, testName: string): boolean {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');

    const hasPattern = typeof pattern === 'string'
      ? content.includes(pattern)
      : pattern.test(content);

    if (hasPattern) {
      console.log(`✅ ${testName}`);
      passed++;
      return true;
    } else {
      console.log(`❌ ${testName}`);
      console.log(`   Expected pattern: ${pattern}`);
      failed++;
      return false;
    }
  } catch (error) {
    console.log(`❌ ${testName} - Error reading file`);
    console.log(`   ${error instanceof Error ? error.message : 'Unknown error'}`);
    failed++;
    return false;
  }
}

console.log('Agent Endpoints (Pattern 4: Manual validatePOVAccess):\n');

// Test 1: Agent execute (streaming) uses getPOVFromTask
testFileHasPattern(
  'app/api/pov/agent/execute/stream/route.ts',
  'getPOVFromTask',
  'Test 1: execute uses getPOVFromTask helper'
);

// Test 2: Agent execute (streaming) has validatePOVAccess
testFileHasPattern(
  'app/api/pov/agent/execute/stream/route.ts',
  /validatePOVAccess\(user!?, pov,/,
  'Test 2: execute validates POV access'
);

// Test 3: Agent cancel uses getPOVFromExecution
testFileHasPattern(
  'app/api/pov/agent/cancel/[executionId]/route.ts',
  'getPOVFromExecution',
  'Test 3: cancel uses getPOVFromExecution helper'
);

// Test 4: Agent status validates POV access
testFileHasPattern(
  'app/api/pov/agent/status/[executionId]/route.ts',
  /validatePOVAccess\(user!?, pov,/,
  'Test 4: status validates POV access'
);

// Test 5: Agent execute/stream uses helper
testFileHasPattern(
  'app/api/pov/agent/execute/stream/route.ts',
  'getPOVFromTask',
  'Test 5: execute/stream uses getPOVFromTask helper'
);

console.log('\nCRUD Endpoints (Pattern 1: withPOVAccess middleware):\n');

// Test 6 was: Launch endpoint uses withPOVAccess
// Removed 2026-05-14 — launch routes deleted (orphaned after UI cleanup
// in 7b5c8018). Test renumbering preserved for stability of downstream
// references in the report.

// Test 7 was: Phase reorder uses withPOVAccess
// Removed 2026-05-14 — orphaned route deleted (double-body-read bug,
// zero frontend callers; canonical phase-reorder is /api/pov/[povId]/phases).

console.log('\nRate Limiting:\n');

// Test 8: Agent execute (streaming) has rate limiting
testFileHasPattern(
  'app/api/pov/agent/execute/stream/route.ts',
  'agentExecutionLimiter',
  'Test 8: execute has rate limiting (10/min)'
);

// Test 9: Agent cancel has rate limiting
testFileHasPattern(
  'app/api/pov/agent/cancel/[executionId]/route.ts',
  'agentOperationsLimiter',
  'Test 9: cancel has rate limiting (50/min)'
);

// Test 10: Support feature has rate limiting
testFileHasPattern(
  'app/api/support/feature/route.ts',
  'featureRequestLimiter',
  'Test 10: feature request has rate limiting (5/hour)'
);

// ===== LAYER 2: Behavior Validation (Runtime Testing) =====
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('LAYER 2: Behavior Validation (Simulated)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('Note: Runtime tests require running server + test data');
console.log('These are manual test cases to run after deployment:\n');

/**
 * Simulated behavior tests (documented test cases)
 */
const behaviorTests = [
  {
    name: 'Test 11: Cross-POV agent execution blocked (403)',
    description: 'User A tries to execute agent on User B\'s task',
    endpoint: 'POST /api/pov/agent/execute',
    expectedResult: '403 Forbidden with [SECURITY] log',
    manual: true
  },
  {
    name: 'Test 12: Cross-POV execution cancel blocked (403)',
    description: 'User A tries to cancel User B\'s execution',
    endpoint: 'POST /api/pov/agent/cancel/[executionId]',
    expectedResult: '403 Forbidden with [SECURITY] log',
    manual: true
  },
  {
    name: 'Test 13: Cross-POV status view blocked (403)',
    description: 'User A tries to view User B\'s execution status',
    endpoint: 'GET /api/pov/agent/status/[executionId]',
    expectedResult: '403 Forbidden with [SECURITY] log',
    manual: true
  },
  {
    name: 'Test 14: Cross-POV artifact download blocked (403)',
    description: 'User A tries to download User B\'s artifact',
    endpoint: 'GET /api/pov/agent/artifacts/[executionId]/[artifactId]/download',
    expectedResult: '403 Forbidden',
    manual: true
  },
  {
    name: 'Test 15: Same-POV access works (200)',
    description: 'User A executes agent on their own task',
    endpoint: 'POST /api/pov/agent/execute',
    expectedResult: '200 OK with execution created',
    manual: true
  },
  {
    name: 'Test 16: DEMO_USER can access demo POVs (200)',
    description: 'Demo user executes agent on demo POV task',
    endpoint: 'POST /api/pov/agent/execute',
    expectedResult: '200 OK (metadata.isDemo bypass)',
    manual: true
  },
  {
    name: 'Test 17: Rate limiting enforced (429)',
    description: 'User makes 11 agent execute calls in 1 minute',
    endpoint: 'POST /api/pov/agent/execute',
    expectedResult: '429 Too Many Requests on 11th call',
    manual: true
  }
];

behaviorTests.forEach((test, index) => {
  console.log(`📋 ${test.name}`);
  console.log(`   Endpoint: ${test.endpoint}`);
  console.log(`   Test: ${test.description}`);
  console.log(`   Expected: ${test.expectedResult}`);
  console.log(`   Status: Manual test required after deployment\n`);
});

// ===== SUMMARY =====
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`✅ Layer 1 (Pattern): ${passed} passed, ${failed} failed`);
console.log(`📋 Layer 2 (Behavior): ${behaviorTests.length} manual tests documented\n`);

const totalTests = passed + failed + behaviorTests.length;
console.log(`📊 Total Tests: ${totalTests}`);
console.log(`   - Automated (Pattern): ${passed + failed}`);
console.log(`   - Manual (Behavior): ${behaviorTests.length}\n`);

if (failed === 0) {
  console.log('🎉 All automated tests passed!');
  console.log('\nNext Steps:');
  console.log('1. Deploy P1 fixes to staging');
  console.log('2. Run manual behavior tests (Tests 11-17)');
  console.log('3. Verify [SECURITY] logs for blocked attempts');
  console.log('4. Test rate limiting (11th request should fail)');
  console.log('5. Deploy to production after validation\n');

  console.log('Manual Test Commands:');
  console.log('  curl -X POST https://staging/api/pov/agent/execute \\');
  console.log('    -H "Authorization: Bearer $USER_A_TOKEN" \\');
  console.log('    -d \'{"taskId": "user_b_task_id", ...}\'');
  console.log('  # Expected: 403 Forbidden\n');

  process.exit(0);
} else {
  console.log('⚠️ Some pattern tests failed. Review implementation.\n');
  process.exit(1);
}
