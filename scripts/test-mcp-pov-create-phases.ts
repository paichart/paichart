#!/usr/bin/env ts-node
/**
 * MCP pov.create — custom `phases` schema enforcement (Layer 2)
 *
 * Wired into npm run test:all-validation. Locks the 2026-06-09 fix for the
 * three-layer MCP-param gap: a caller-supplied `phases` array was SILENTLY
 * STRIPPED by MCPParameterSchemas['pov.create'] (no `phases` field declared),
 * so the handler fell back to the hardcoded default names ("Planning and
 * Design" / "Build and Deploy" / "Assessment and Validation") even though the
 * caller passed custom names.
 *
 * The regression guard is Test 1: a custom phase NAME must SURVIVE safeParse.
 * If `phases` is ever dropped from the validation schema again, that field
 * vanishes from parsed.data and this test fails loudly.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-mcp-pov-create-phases.ts
 *
 * Design review: mcp-tool-architecture-specialist + phase-stage-specialist
 * (2026-06-09). Schema shape: phases = z.array(z.object({ name, type, description? })
 * .strict()).max(20).optional(); type = z.nativeEnum(PhaseType) (no enum drift).
 */

import { MCPParameterSchemas } from '../lib/validation/mcp-action-validation';

console.log('🔒 MCP pov.create — custom phases validation (Layer 2)\n');

let passed = 0;
let failed = 0;

function test(description: string, testFn: () => void) {
  try {
    testFn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${description}`);
    if (error instanceof Error) console.log(`   Error: ${error.message}`);
    failed++;
  }
}

const schema = MCPParameterSchemas['pov.create' as keyof typeof MCPParameterSchemas];

const baseValid = {
  title: 'Helix S&OP Workflow Automation',
  description: 'A proof of value for the Helix S&OP platform.',
  countryName: 'Australia',
};

// 1. REGRESSION GUARD — custom phase names survive safeParse.
test('1. Custom phases survive safeParse (names NOT stripped)', () => {
  const result = schema.safeParse({
    ...baseValid,
    phases: [
      { name: 'Discovery & S&OP Workflow Design', type: 'PLANNING' },
      { name: 'Integration & Workflow Automation', type: 'EXECUTION' },
      { name: 'Validation & Value Realisation', type: 'REVIEW' },
    ],
  });
  if (!result.success) {
    throw new Error('Valid custom phases rejected: ' + JSON.stringify(result.error.flatten()));
  }
  const phases = (result.data as any).phases;
  if (!Array.isArray(phases) || phases.length !== 3) {
    throw new Error(`phases dropped/altered by Zod — got ${JSON.stringify(phases)}`);
  }
  if (phases[0].name !== 'Discovery & S&OP Workflow Design') {
    throw new Error(`custom name stripped — got "${phases[0].name}"`);
  }
});

// 2. Optional description is accepted and preserved.
test('2. Optional phase description preserved', () => {
  const result = schema.safeParse({
    ...baseValid,
    phases: [{ name: 'Discovery', type: 'PLANNING', description: 'Scope the engagement' }],
  });
  if (!result.success) throw new Error('rejected: ' + JSON.stringify(result.error.flatten()));
  if ((result.data as any).phases[0].description !== 'Scope the engagement') {
    throw new Error('description stripped');
  }
});

// 3. Invalid phase type rejected (z.nativeEnum(PhaseType)).
test('3. Invalid phase type rejected', () => {
  const result = schema.safeParse({
    ...baseValid,
    phases: [{ name: 'Discovery', type: 'DISCOVERY' }],
  });
  if (result.success) throw new Error('invalid type "DISCOVERY" should be rejected');
});

// 4. Missing required phase name rejected.
test('4. Phase without name rejected', () => {
  const result = schema.safeParse({
    ...baseValid,
    phases: [{ type: 'PLANNING' }],
  });
  if (result.success) throw new Error('phase missing name should be rejected');
});

// 5. .max(20) DoS cap enforced.
test('5. More than 20 phases rejected (.max(20))', () => {
  const phases = Array.from({ length: 21 }, (_, i) => ({ name: `Phase ${i}`, type: 'EXECUTION' }));
  const result = schema.safeParse({ ...baseValid, phases });
  if (result.success) throw new Error('21 phases should exceed .max(20)');
});

// 6. .strict() inner object rejects surplus keys (e.g. handler-owned `order`).
test('6. Surplus key in phase object rejected (.strict())', () => {
  const result = schema.safeParse({
    ...baseValid,
    phases: [{ name: 'Discovery', type: 'PLANNING', order: 5 }],
  });
  if (result.success) throw new Error('surplus key `order` should be rejected by .strict()');
});

// 7. Injection in phase name rejected (SimpleTextField refine).
test('7. Injection in phase name rejected', () => {
  const result = schema.safeParse({
    ...baseValid,
    phases: [{ name: '<script>alert(1)</script>', type: 'PLANNING' }],
  });
  if (result.success) throw new Error('injection in phase name should be rejected');
});

// 8. Omitting phases entirely still valid (default-path callers unaffected).
test('8. Omitting phases is still valid (no regression for default path)', () => {
  const result = schema.safeParse({ ...baseValid });
  if (!result.success) throw new Error('base payload without phases should parse');
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Total Passed: ${passed}`);
console.log(`Total Failed: ${failed}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (failed > 0) {
  console.log('\n❌ MCP pov.create phases validation FAILED');
  process.exit(1);
}

console.log('\n✅ MCP pov.create phases validation PASSED');
process.exit(0);
