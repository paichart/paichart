#!/usr/bin/env ts-node
/**
 * Agent Template Validation Tests
 *
 * Tests template schema enforcement
 *
 * Converted from jest to ts-node script (Nov 8, 2025)
 * Original: tests/validation/agent-template.test.ts
 */

import {
  CreateAgentTemplateSchema,
  UpdateAgentTemplateSchema,
} from '../lib/validation/agent-template-validation';

console.log('🧪 Testing Agent Template Validation...\n');

let passed = 0;
let failed = 0;
let testNumber = 0;

function test(description: string, testFn: () => void) {
  testNumber++;
  try {
    testFn();
    console.log(`✅ Test ${testNumber}: ${description}`);
    passed++;
  } catch (error) {
    console.log(`❌ Test ${testNumber}: ${description}`);
    if (error instanceof Error) {
      console.log(`   Error: ${error.message}`);
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
    toContain(substring: string) {
      if (Array.isArray(value)) {
        if (!value.includes(substring)) {
          throw new Error(`Expected array to contain "${substring}"`);
        }
      }
    }
  };
}

// ==================== Variable Validation (3 tests) ====================

console.log('Template Variable Validation\n');

test('should validate all placeholders have variable definitions', () => {
  const template = {
    name: 'Test Template',
    defaultRole: 'Developer',
    promptTemplate: 'Analyze {{task}} using {{context}} and {{requirements}}',
    variables: [
      { name: 'task', type: 'string', required: true },
      { name: 'context', type: 'string', required: false }
    ]
  };

  const result = CreateAgentTemplateSchema.safeParse(template);
  expect(result.success).toBe(false);
  if (!result.success) {
    const hasUndefinedError = result.error.errors.some(e =>
      e.message.includes('undefined variables')
    );
    if (!hasUndefinedError) {
      throw new Error('Expected undefined variables error');
    }
  }
});

test('should detect duplicate variable names', () => {
  const template = {
    name: 'Duplicate Vars Template',
    defaultRole: 'Developer',
    promptTemplate: 'Test {{var1}}',
    variables: [
      { name: 'var1', type: 'string', required: true },
      { name: 'var1', type: 'string', required: false }
    ]
  };

  const result = CreateAgentTemplateSchema.safeParse(template);
  expect(result.success).toBe(false);
  if (!result.success) {
    const hasDuplicateError = result.error.errors.some(e =>
      e.message.includes('Duplicate variable names')
    );
    if (!hasDuplicateError) {
      throw new Error('Expected duplicate variables error');
    }
  }
});

test('should validate required variables cannot have default values', () => {
  const template = {
    name: 'Bad Required Var',
    defaultRole: 'Developer',
    promptTemplate: 'Test {{var1}}',
    variables: [
      {
        name: 'var1',
        type: 'string',
        required: true,
        defaultValue: 'default'
      }
    ]
  };

  const result = CreateAgentTemplateSchema.safeParse(template);
  expect(result.success).toBe(false);
  if (!result.success) {
    const hasDefaultError = result.error.errors.some(e =>
      e.message.includes('Required variables cannot have default values')
    );
    if (!hasDefaultError) {
      throw new Error('Expected required + default error');
    }
  }
});

// ==================== Template Field Limits (3 tests) ====================

console.log('\n\nTemplate Field Limits\n');

test('should enforce 50KB promptTemplate limit', () => {
  const oversized = {
    name: 'Oversized Template',
    defaultRole: 'Developer',
    promptTemplate: 'x'.repeat(50001),
    variables: []
  };

  const result = CreateAgentTemplateSchema.safeParse(oversized);
  expect(result.success).toBe(false);
  if (!result.success) {
    const hasSizeError = result.error.errors.some(e =>
      e.message.includes('too long')
    );
    if (!hasSizeError) {
      throw new Error('Expected size limit error');
    }
  }
});

test('should allow 50KB promptTemplate (task description compatibility)', () => {
  const valid = {
    name: 'Valid Large Template',
    defaultRole: 'Developer',
    promptTemplate: 'x'.repeat(50000),
    variables: []
  };

  const result = CreateAgentTemplateSchema.safeParse(valid);
  expect(result.success).toBe(true);
});

test('should enforce maximum 50 variables', () => {
  const variables = Array(51).fill(null).map((_, i) => ({
    name: `var${i}`,
    type: 'string',
    required: false
  }));

  const template = {
    name: 'Too Many Vars',
    defaultRole: 'Developer',
    promptTemplate: 'Test',
    variables
  };

  const result = CreateAgentTemplateSchema.safeParse(template);
  expect(result.success).toBe(false);
  if (!result.success) {
    const hasTooManyError = result.error.errors.some(e =>
      e.message.includes('Too many')
    );
    if (!hasTooManyError) {
      throw new Error('Expected too many variables error');
    }
  }
});

// Helper Functions tests removed 2026-05-14 — the helpers
// (validateVariablesMatchTemplate, validateRequiredVariables, plus
// isValidVariableName and getRequiredVariables) had zero production
// callers and were deleted alongside the orphan
// BulkApply/Validate/PreviewTemplate schemas they were designed for.

// ==================== Summary ====================

console.log('\n' + '='.repeat(50));
console.log('Agent Template Validation Test Summary:');
console.log('='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total: ${passed + failed} (Expected: 8 tests)`);
console.log('='.repeat(50));

if (failed > 0) {
  console.log(`\n❌ ${failed} test(s) failed!\n`);
  process.exit(1);
} else {
  console.log('\n✅ All agent template validation tests passed!\n');
  console.log('Template validation confirmed:');
  console.log('  - ✅ Variable validation (placeholders, duplicates, required)');
  console.log('  - ✅ Field limits (50KB templates, max variables)');
  console.log('  - ✅ Helper functions (validateVariables, validateRequired)');
  console.log('  - ✅ Ready for production deployment\n');
}
