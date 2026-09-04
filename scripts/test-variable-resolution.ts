#!/usr/bin/env ts-node
/**
 * Workflow Variable Resolution Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Validation - Checks orchestration-engine.js uses corrected regex
 * Layer 2: Behavior Validation - Tests actual variable resolution logic
 *
 * Created: 2026-03-05
 * Bug: BUG-004 (double-data prefix in variable chaining)
 * Tests: 4 pattern + 10 behavior = 14 total
 */

import * as fs from 'fs';

console.log('🧪 Workflow Variable Resolution Tests (Dual-Layer)\n');

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
    toEqual(expected: any) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected truthy, got ${JSON.stringify(value)}`);
      }
    },
    toBeUndefined() {
      if (value !== undefined) {
        throw new Error(`Expected undefined, got ${JSON.stringify(value)}`);
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

const engineSource = fs.readFileSync('lib/services/workflow/core/orchestration-engine.js', 'utf-8');

test('Pattern: Uses simple prefix regex (output|data) without compound output.data', () => {
  expect(engineSource.includes('(output|data)(?:')).toBe(true);
  // Compound prefix removed — it was stripping real .data path segments
  expect(engineSource.includes('output\\.data|output|data')).toBe(false);
  layer1Passed++;
});

test('Pattern: Uses boundary-safe group (?:\\.|$) not bare \\.?', () => {
  // The corrected regex uses (?:\.|$) to prevent false matches on field names like "dataField"
  expect(engineSource.includes('(?:\\.|$)')).toBe(true);
  layer1Passed++;
});

test('Pattern: Old regex with bare \\.? is NOT present', () => {
  // Ensure the buggy regex has been replaced at BOTH sites (line 167 and 183)
  const buggyRegex = /\^\(output\|data\)\\\.\?/;
  expect(buggyRegex.test(engineSource)).toBe(false);
  layer1Passed++;
});

test('Pattern: Debug logging exists in resolveVariableString', () => {
  expect(engineSource.includes('[Variable Resolution]')).toBe(true);
  layer1Passed++;
});

// ========================================
// LAYER 2: Behavior Validation
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Behavior Validation');
console.log('=====================================\n');

// Import the OrchestrationEngine
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OrchestrationEngine } = require('../lib/services/workflow/core/orchestration-engine');
const engine = new OrchestrationEngine();

// Mock step outputs simulating service responses
const stepOutputs = [
  {
    success: true,
    data: { location: 'Sydney', temperature: 22, conditions: 'Sunny' },
    executionTime: 45,
    service: 'weather-service',
    tool: 'get_weather'
  },
  {
    success: true,
    data: { items: [{ id: 'item1', name: 'First' }, { id: 'item2', name: 'Second' }], total: 2 },
    executionTime: 30,
    service: 'data-service',
    tool: 'list_items'
  }
];

test('Behavior: {{step.0.output.location}} resolves location field', () => {
  const result = engine.resolveVariableString('{{step.0.output.location}}', stepOutputs);
  expect(result).toBe('Sydney');
  layer2Passed++;
});

test('Behavior: {{step.0.data.location}} resolves location field', () => {
  const result = engine.resolveVariableString('{{step.0.data.location}}', stepOutputs);
  expect(result).toBe('Sydney');
  layer2Passed++;
});

test('Behavior: {{step.0.output.data.location}} navigates into .data field (BUG-004 fix)', () => {
  // Simulates real service response: { success, data: { location: "Sydney" }, summary }
  const serviceOutputs = [{ success: true, data: { success: true, data: { location: 'Sydney' }, summary: 'test' } }];
  const result = engine.resolveVariableString('{{step.0.output.data.location}}', serviceOutputs);
  expect(result).toBe('Sydney');
  layer2Passed++;
});

// 2026-07-28: expression corrected from `output.data.items[0].id` to
// `output.items[0].id`. NOT a behaviour change — the ENGINE is right and this
// assertion had been stale since 2026-03-05.
//
// History: 8d6188f1 added this test while the engine stripped a COMPOUND prefix
// (/^(output\.data|output|data)/), under which `output.data.items[0].id` reduced
// to `items[0].id` and resolved from stepResult.data. It passed. 65f31db2 (the
// BUG-004 double-data fix) then deliberately removed `output\.data` from that
// alternation, so `output.data.X` now means "strip output., THEN navigate into
// .data" — i.e. stepResult.data.data.X. Against this single-nested fixture that
// is correctly undefined. 65f31db2 updated other cases in this file and missed
// this one; `test:variable-resolution` is not in test:all-validation, so it went
// red for ~5 months unseen.
//
// The test's PURPOSE is array indexing, so the expression is what changes — not
// the fixture. Changing the fixture to double-nested would have made this a
// duplicate of the BUG-004 case above and silently dropped array coverage.
test('Behavior: {{step.1.output.items[0].id}} resolves nested array access', () => {
  const result = engine.resolveVariableString('{{step.1.output.items[0].id}}', stepOutputs);
  expect(result).toBe('item1');
  layer2Passed++;
});

// Companion added 2026-07-28: array indexing THROUGH the .data navigation that
// 65f31db2 introduced. That commit created this interaction and left it untested —
// the case that would actually catch a regression in the compound-prefix removal.
test('Behavior: {{step.N.output.data.items[0].id}} indexes an array under a nested .data', () => {
  const nested = [{ success: true, data: { data: { items: [{ id: 'deep1' }] } } }];
  const result = engine.resolveVariableString('{{step.0.output.data.items[0].id}}', nested);
  expect(result).toBe('deep1');
  layer2Passed++;
});

test('Behavior: {{step.0.output.dataField}} does NOT false-strip "data" from "dataField"', () => {
  const outputs = [{ success: true, data: { dataField: 'preserved', location: 'Test' } }];
  const result = engine.resolveVariableString('{{step.0.output.dataField}}', outputs);
  expect(result).toBe('preserved');
  layer2Passed++;
});

test('Behavior: {{step.0.output}} returns full data object', () => {
  const result = engine.resolveVariableString('{{step.0.output}}', stepOutputs);
  expect(result).toEqual(stepOutputs[0].data);
  layer2Passed++;
});

test('Behavior: {{step.0.data}} returns full data object', () => {
  const result = engine.resolveVariableString('{{step.0.data}}', stepOutputs);
  expect(result).toEqual(stepOutputs[0].data);
  layer2Passed++;
});

test('Behavior: {{step.0.output.data}} navigates into .data field (not compound prefix)', () => {
  const outputs = [{ success: true, data: { data: [1, 2, 3], meta: 'info' } }];
  const result = engine.resolveVariableString('{{step.0.output.data}}', outputs);
  // output is stripped, then navigates .data on stepResult.data
  expect(result).toEqual([1, 2, 3]);
  layer2Passed++;
});

test('Behavior: Embedded string interpolation works', () => {
  const result = engine.resolveVariableString('Total: {{step.1.output.total}} items', stepOutputs);
  expect(result).toBe('Total: 2 items');
  layer2Passed++;
});

test('Behavior: Invalid step reference returns error marker', () => {
  const result = engine.resolveVariableString('{{step.99.output.location}}', stepOutputs);
  expect(result && (result as any).__variableError).toBe(true);
  layer2Passed++;
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('Variable Resolution Summary:');
console.log('=====================================');
console.log(`\n📊 Layer 1 (Pattern): ${layer1Passed}/4`);
console.log(`📊 Layer 2 (Behavior): ${layer2Passed}/10`);
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
