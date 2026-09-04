#!/usr/bin/env ts-node
/**
 * Form Field Patterns Tests (TypeScript with Real Imports)
 *
 * Tests the ACTUAL form-field-patterns helpers (not simulated)
 * Validates null → undefined transformation and type safety
 *
 * Created: 2025-11-08 (Enhanced from test-form-field-patterns.js)
 * Tests: 28 total
 */

import { z } from 'zod';
import {
  FormField,
  OptionalString,
  OptionalNumber,
  OptionalDateTime,
  OptionalArray,
  OptionalCUID,
  OptionalField
} from '../lib/validation/form-field-patterns';

console.log('🧪 Testing Form Field Patterns (Real Imports)\n');

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
    }
  };
}

// ==================== OptionalString Tests ====================
console.log('Testing OptionalString...\n');

test('OptionalString accepts undefined', () => {
  const schema = z.object({ field: OptionalString() });
  const result = schema.safeParse({ field: undefined });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalString accepts null and transforms to undefined', () => {
  const schema = z.object({ field: OptionalString() });
  const result = schema.safeParse({ field: null });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalString accepts valid string', () => {
  const schema = z.object({ field: OptionalString() });
  const result = schema.safeParse({ field: 'test value' });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe('test value');
  }
});

test('OptionalString rejects string exceeding maxLength', () => {
  const schema = z.object({ field: OptionalString(5) });
  const result = schema.safeParse({ field: 'toolong' });
  expect(result.success).toBe(false);
});

// ==================== OptionalNumber Tests ====================
console.log('\nTesting OptionalNumber...\n');

test('OptionalNumber accepts undefined', () => {
  const schema = z.object({ field: OptionalNumber() });
  const result = schema.safeParse({ field: undefined });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalNumber accepts null and transforms to undefined', () => {
  const schema = z.object({ field: OptionalNumber() });
  const result = schema.safeParse({ field: null });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalNumber accepts valid number', () => {
  const schema = z.object({ field: OptionalNumber() });
  const result = schema.safeParse({ field: 42 });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(42);
  }
});

test('OptionalNumber rejects number below min', () => {
  const schema = z.object({ field: OptionalNumber(10, 100) });
  const result = schema.safeParse({ field: 5 });
  expect(result.success).toBe(false);
});

test('OptionalNumber rejects number above max', () => {
  const schema = z.object({ field: OptionalNumber(0, 100) });
  const result = schema.safeParse({ field: 150 });
  expect(result.success).toBe(false);
});

// ==================== OptionalDateTime Tests ====================
console.log('\nTesting OptionalDateTime...\n');

test('OptionalDateTime accepts undefined', () => {
  const schema = z.object({ field: OptionalDateTime() });
  const result = schema.safeParse({ field: undefined });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalDateTime accepts null and transforms to undefined', () => {
  const schema = z.object({ field: OptionalDateTime() });
  const result = schema.safeParse({ field: null });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalDateTime accepts valid ISO datetime', () => {
  const schema = z.object({ field: OptionalDateTime() });
  const validDateTime = '2025-11-03T10:30:00.000Z';
  const result = schema.safeParse({ field: validDateTime });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(validDateTime);
  }
});

test('OptionalDateTime rejects invalid datetime', () => {
  const schema = z.object({ field: OptionalDateTime() });
  const result = schema.safeParse({ field: 'not-a-date' });
  expect(result.success).toBe(false);
});

// ==================== OptionalArray Tests ====================
console.log('\nTesting OptionalArray...\n');

test('OptionalArray accepts undefined', () => {
  const schema = z.object({ field: OptionalArray(z.string()) });
  const result = schema.safeParse({ field: undefined });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalArray accepts null and transforms to undefined', () => {
  const schema = z.object({ field: OptionalArray(z.string()) });
  const result = schema.safeParse({ field: null });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalArray accepts valid array', () => {
  const schema = z.object({ field: OptionalArray(z.string()) });
  const result = schema.safeParse({ field: ['a', 'b', 'c'] });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toEqual(['a', 'b', 'c']);
  }
});

test('OptionalArray accepts empty array', () => {
  const schema = z.object({ field: OptionalArray(z.string()) });
  const result = schema.safeParse({ field: [] });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toEqual([]);
  }
});

// ==================== OptionalCUID Tests ====================
console.log('\nTesting OptionalCUID...\n');

const validCUID = 'cmh4fnoe80000yxt5685r9flh';

test('OptionalCUID accepts undefined', () => {
  const schema = z.object({ field: OptionalCUID('test ID') });
  const result = schema.safeParse({ field: undefined });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalCUID accepts null and transforms to undefined', () => {
  const schema = z.object({ field: OptionalCUID('test ID') });
  const result = schema.safeParse({ field: null });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalCUID accepts valid CUID', () => {
  const schema = z.object({ field: OptionalCUID('test ID') });
  const result = schema.safeParse({ field: validCUID });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(validCUID);
  }
});

test('OptionalCUID accepts empty string and transforms to undefined', () => {
  const schema = z.object({ field: OptionalCUID('test ID') });
  const result = schema.safeParse({ field: '' });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalCUID accepts whitespace-only string as absent', () => {
  const schema = z.object({ field: OptionalCUID('test ID') });
  const result = schema.safeParse({ field: '   ' });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalCUID rejects invalid CUID', () => {
  const schema = z.object({ field: OptionalCUID('test ID') });
  const result = schema.safeParse({ field: 'invalid-cuid' });
  expect(result.success).toBe(false);
});

test('OptionalCUID rejects UUID format', () => {
  const schema = z.object({ field: OptionalCUID('test ID') });
  const invalidUUID = '550e8400-e29b-41d4-a716-446655440000';
  const result = schema.safeParse({ field: invalidUUID });
  expect(result.success).toBe(false);
});

// ==================== OptionalField Generic Tests ====================
console.log('\nTesting OptionalField (Generic)...\n');

test('OptionalField works with string schema', () => {
  const schema = z.object({ field: OptionalField(z.string().min(1)) });
  const result = schema.safeParse({ field: null });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalField works with number schema', () => {
  const schema = z.object({ field: OptionalField(z.number().min(0)) });
  const result = schema.safeParse({ field: null });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalField works with enum schema', () => {
  const CustomEnum = z.enum(['A', 'B', 'C']);
  const schema = z.object({ field: OptionalField(CustomEnum) });
  const result = schema.safeParse({ field: null });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe(undefined);
  }
});

test('OptionalField preserves valid values', () => {
  const schema = z.object({ field: OptionalField(z.string().min(1)) });
  const result = schema.safeParse({ field: 'test' });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.field).toBe('test');
  }
});

// ==================== Real-World Scenarios ====================
console.log('\nTesting Real-World Form Scenarios...\n');

test('Task creation form with null optional fields', () => {
  const TaskFormSchema = z.object({
    title: z.string().min(1),
    description: FormField.optionalString(5000),
    dueDate: FormField.optionalDateTime(),
    estimatedHours: FormField.optionalNumber(0, 1000),
    tags: FormField.optional(z.array(z.string()).max(10))
  });

  // Simulate form submission with null values
  const formData = {
    title: 'Test Task',
    description: null,
    dueDate: null,
    estimatedHours: null,
    tags: null
  };

  const result = TaskFormSchema.safeParse(formData);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.description).toBe(undefined);
    expect(result.data.dueDate).toBe(undefined);
    expect(result.data.estimatedHours).toBe(undefined);
    expect(result.data.tags).toBe(undefined);
  }
});

test('Form with mix of null and valid values', () => {
  const MixedFormSchema = z.object({
    required: z.string(),
    optionalString: FormField.optionalString(),
    optionalNumber: FormField.optionalNumber()
  });

  const formData = {
    required: 'value',
    optionalString: null,
    optionalNumber: 42
  };

  const result = MixedFormSchema.safeParse(formData);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.optionalString).toBe(undefined);
    expect(result.data.optionalNumber).toBe(42);
  }
});

// ==================== Test Summary ====================
console.log('\n=====================================');
console.log('Test Summary:');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);
console.log('=====================================');

if (failed > 0) {
  console.error('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  console.log('\nForm field patterns are working correctly:');
  console.log('  - ✅ Uses REAL FormField imports (not simulated)');
  console.log('  - ✅ Accepts null from forms');
  console.log('  - ✅ Transforms null to undefined');
  console.log('  - ✅ Type-safe inference');
  console.log('  - ✅ Ready for production use');
  process.exit(0);
}
