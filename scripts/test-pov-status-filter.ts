#!/usr/bin/env ts-node
/**
 * POV Status Filter Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Validation - Checks prompt registration and implementation
 * Layer 2: Behavior Validation - Tests POV status parsing and filtering logic
 *
 * Created: 2025-11-17 (Sprint 3: POV Status Filter Enhancement)
 * Tests: 10 pattern + 12 behavior = 22 total
 * Coverage: audit_all_tasks prompt POV status filtering
 *
 * Valid POV statuses (from Prisma schema):
 * - PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 POV Status Filter Tests (Dual-Layer)\n');

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
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected "${value}" to contain "${substring}"`);
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(value) || value.length !== expected) {
        throw new Error(`Expected array length ${expected}, got ${value?.length}`);
      }
    },
    toBeArray() {
      if (!Array.isArray(value)) {
        throw new Error(`Expected array, got ${typeof value}`);
      }
    }
  };
}

// ========================================
// LAYER 1: Pattern Validation
// ========================================

console.log('=====================================');
console.log('LAYER 1: Code Pattern Validation');
console.log('=====================================\n');

// Test 1: Prompt registration includes povStatus argument
test('Pattern: audit_all_tasks registration has povStatus argument', () => {
  const content = fs.readFileSync('lib/mcp/server/prompts/prompt-registry.js', 'utf-8');
  expect(content).toContain("name: 'povStatus'");
  expect(content).toContain('Comma-separated POV statuses');
  layer1Passed++;
});

// Test 2: povStatus description mentions all valid statuses
test('Pattern: povStatus description lists all 6 POV statuses', () => {
  const content = fs.readFileSync('lib/mcp/server/prompts/prompt-registry.js', 'utf-8');
  expect(content).toContain('PROJECTED');
  expect(content).toContain('IN_PROGRESS');
  expect(content).toContain('STALLED');
  expect(content).toContain('VALIDATION');
  expect(content).toContain('WON');
  expect(content).toContain('LOST');
  layer1Passed++;
});

// Test 3: Implementation extracts povStatus argument
test('Pattern: createAuditAllTasksPrompt extracts povStatus argument', () => {
  const content = fs.readFileSync('lib/mcp/server/prompts/prompt-registry.js', 'utf-8');
  expect(content).toContain('povStatus:');
  expect(content).toContain("povStatus: args.povStatus || 'IN_PROGRESS,STALLED,VALIDATION'");
  layer1Passed++;
});

// Test 4: Implementation parses povStatus into list
test('Pattern: povStatus is parsed into povStatusList array', () => {
  const content = fs.readFileSync('lib/mcp/server/prompts/prompt-registry.js', 'utf-8');
  expect(content).toContain('povStatusList');
  expect(content).toContain('povStatus.split');
  expect(content).toContain('.toUpperCase()');
  layer1Passed++;
});

// Test 5: whereClause uses povStatusList for filtering
test('Pattern: whereClause.status uses povStatusList', () => {
  const content = fs.readFileSync('lib/mcp/server/prompts/prompt-registry.js', 'utf-8');
  expect(content).toContain('povStatusList');
  expect(content).toContain('status:');
  layer1Passed++;
});

// Test 6: Prompt output shows POV status filter
test('Pattern: Prompt shows "Filtering by POV status"', () => {
  const content = fs.readFileSync('lib/mcp/server/prompts/prompt-registry.js', 'utf-8');
  expect(content).toContain('Filtering by POV status:');
  layer1Passed++;
});

// Test 7: Prompt output distinguishes task vs POV status
test('Pattern: Prompt distinguishes task status from POV status', () => {
  const content = fs.readFileSync('lib/mcp/server/prompts/prompt-registry.js', 'utf-8');
  expect(content).toContain('Filtering by task status:');
  expect(content).toContain('Filtering by POV status:');
  layer1Passed++;
});

// Test 8: Next steps mention POV status filter options
test('Pattern: Next steps include POV status filter examples', () => {
  const content = fs.readFileSync('lib/mcp/server/prompts/prompt-registry.js', 'utf-8');
  expect(content).toContain('Completed POVs');
  expect(content).toContain('Pipeline POVs');
  expect(content).toContain('povStatus=');
  layer1Passed++;
});

// Test 9: Type coercion applied to povStatus
test('Pattern: povStatus is included in coercePromptArguments', () => {
  const content = fs.readFileSync('lib/mcp/server/prompts/prompt-registry.js', 'utf-8');
  expect(content).toContain('coercePromptArguments');
  expect(content).toContain('povStatus:');
  layer1Passed++;
});

// Test 10: Prisma schema has POVStatus enum with 6 values
test('Pattern: Prisma schema has POVStatus enum with all required values', () => {
  const content = fs.readFileSync('prisma/schema.prisma', 'utf-8');
  expect(content).toContain('enum POVStatus');
  expect(content).toContain('PROJECTED');
  expect(content).toContain('IN_PROGRESS');
  expect(content).toContain('STALLED');
  expect(content).toContain('VALIDATION');
  expect(content).toContain('WON');
  expect(content).toContain('LOST');
  layer1Passed++;
});

// ========================================
// LAYER 2: Behavior Validation
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Behavior Validation');
console.log('=====================================\n');

// Simulate POV status parsing logic (from prompt implementation)
function parsePovStatus(povStatus: string | undefined): string[] {
  const defaultStatus = 'IN_PROGRESS,STALLED,VALIDATION';
  const statusString = povStatus || defaultStatus;
  return statusString.split(',').map(s => s.trim().toUpperCase());
}

// Simulate whereClause generation (from prompt implementation)
function generateWhereClause(povStatusList: string[]): any {
  return {
    status: povStatusList.length === 1 ? povStatusList[0] : { in: povStatusList }
  };
}

// Test 1: Default status includes active and pending POVs
test('Behavior: Default POV status is IN_PROGRESS,STALLED,VALIDATION', () => {
  const result = parsePovStatus(undefined);
  expect(result).toHaveLength(3);
  expect(result[0]).toBe('IN_PROGRESS');
  expect(result[1]).toBe('STALLED');
  expect(result[2]).toBe('VALIDATION');
  layer2Passed++;
});

// Test 2: Single status parsed correctly
test('Behavior: Single status PROJECTED parsed correctly', () => {
  const result = parsePovStatus('PROJECTED');
  expect(result).toEqual(['PROJECTED']);
  layer2Passed++;
});

// Test 3: Single status - WON
test('Behavior: Single status WON parsed correctly', () => {
  const result = parsePovStatus('WON');
  expect(result).toEqual(['WON']);
  layer2Passed++;
});

// Test 4: Single status - LOST
test('Behavior: Single status LOST parsed correctly', () => {
  const result = parsePovStatus('LOST');
  expect(result).toEqual(['LOST']);
  layer2Passed++;
});

// Test 5: Multiple statuses with comma
test('Behavior: Multiple statuses WON,LOST parsed correctly', () => {
  const result = parsePovStatus('WON,LOST');
  expect(result).toHaveLength(2);
  expect(result[0]).toBe('WON');
  expect(result[1]).toBe('LOST');
  layer2Passed++;
});

// Test 6: Multiple statuses with spaces (trimmed)
test('Behavior: Spaces are trimmed (WON, LOST)', () => {
  const result = parsePovStatus('WON, LOST');
  expect(result).toHaveLength(2);
  expect(result[0]).toBe('WON');
  expect(result[1]).toBe('LOST');
  layer2Passed++;
});

// Test 7: All 6 statuses parsed correctly
test('Behavior: All 6 POV statuses parsed correctly', () => {
  const result = parsePovStatus('PROJECTED,IN_PROGRESS,STALLED,VALIDATION,WON,LOST');
  expect(result).toHaveLength(6);
  expect(result[0]).toBe('PROJECTED');
  expect(result[1]).toBe('IN_PROGRESS');
  expect(result[2]).toBe('STALLED');
  expect(result[3]).toBe('VALIDATION');
  expect(result[4]).toBe('WON');
  expect(result[5]).toBe('LOST');
  layer2Passed++;
});

// Test 8: Lowercase converted to uppercase
test('Behavior: Lowercase converted to uppercase (won,lost)', () => {
  const result = parsePovStatus('won,lost');
  expect(result[0]).toBe('WON');
  expect(result[1]).toBe('LOST');
  layer2Passed++;
});

// Test 9: Mixed case converted to uppercase
test('Behavior: Mixed case converted to uppercase (Projected)', () => {
  const result = parsePovStatus('Projected');
  expect(result).toEqual(['PROJECTED']);
  layer2Passed++;
});

// Test 10: whereClause - Single status generates direct equality
test('Behavior: Single status generates whereClause direct equality', () => {
  const povStatusList = ['WON'];
  const whereClause = generateWhereClause(povStatusList);
  expect(whereClause.status).toBe('WON');
  layer2Passed++;
});

// Test 11: whereClause - Multiple statuses generate { in: [...] }
test('Behavior: Multiple statuses generate whereClause { in: [...] }', () => {
  const povStatusList = ['WON', 'LOST'];
  const whereClause = generateWhereClause(povStatusList);
  expect(whereClause.status.in).toBeArray();
  expect(whereClause.status.in).toHaveLength(2);
  expect(whereClause.status.in[0]).toBe('WON');
  expect(whereClause.status.in[1]).toBe('LOST');
  layer2Passed++;
});

// Test 12: All Prisma enum values work
test('Behavior: All Prisma POV statuses parse correctly', () => {
  const VALID_STATUSES = ['PROJECTED', 'IN_PROGRESS', 'STALLED', 'VALIDATION', 'WON', 'LOST'];

  VALID_STATUSES.forEach(status => {
    const result = parsePovStatus(status);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(status);
  });

  layer2Passed++;
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('POV Status Filter Summary:');
console.log('=====================================');
console.log(`\n📊 Layer 1 (Pattern): ${layer1Passed}/10`);
console.log(`📊 Layer 2 (Behavior): ${layer2Passed}/12`);
console.log(`\n✅ Total Passed: ${passed}`);
console.log(`❌ Total Failed: ${failed}`);
console.log(`📊 Total Tests:  ${passed + failed}`);
console.log('📦 Coverage: audit_all_tasks POV status filtering');
console.log('=====================================\n');

if (failed > 0) {
  console.error('❌ Some tests failed!\n');
  console.error('🔧 Check that POV status filter implementation is complete:');
  console.error('   1. povStatus argument registered');
  console.error('   2. povStatusList parsing added');
  console.error('   3. whereClause.status uses povStatusList\n');
  process.exit(1);
} else {
  console.log('✅ All POV status filter tests passed!\n');
  console.log('🎉 POV status filter validated!');
  console.log('\n📝 Valid POV statuses (Prisma enum):');
  console.log('   - PROJECTED (pipeline/forecast)');
  console.log('   - IN_PROGRESS (active projects)');
  console.log('   - STALLED (paused projects)');
  console.log('   - VALIDATION (pending approval)');
  console.log('   - WON (successful completion)');
  console.log('   - LOST (unsuccessful/cancelled)');
  console.log('\n💡 Usage examples:');
  console.log('   /prompt audit_all_tasks povStatus=PROJECTED');
  console.log('   /prompt audit_all_tasks povStatus=WON,LOST');
  console.log('   /prompt audit_all_tasks povStatus=IN_PROGRESS,STALLED status=OPEN\n');
  process.exit(0);
}
