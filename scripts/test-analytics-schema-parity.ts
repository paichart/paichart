#!/usr/bin/env ts-node
/**
 * ARCH-ANALYTICS-1: BC71 schema-parity CI test
 *
 * Detects drift between Zod enum schemas and the actual types that
 * recommendation generators emit. Catches both directions:
 *
 *   1. SCHEMA-MISSING-EMIT: schema enum lacks a type that generators emit
 *      → user filtering by that type gets L1 rejection on valid data.
 *      Real production case: BUG-ANALYTICS-007 (PERFORMANCE_ENHANCEMENT +
 *      QUALITY_IMPROVEMENT missing from recommendationTypeSchema).
 *
 *   2. SCHEMA-HAS-UNUSED: schema declares a type that NO generator emits
 *      → user-facing tool docs advertise a value that's unreachable.
 *      Real case: RESOURCE_ALLOCATION (RESOURCE_ALLOCATION recs come from
 *      a static stub; not actively generated today — verify before removal).
 *
 * Sibling of BC71 (Untrusted Input in Response-Text Interpolation):
 * same phantom-canonical pattern at the schema-vs-emitting-code layer.
 *
 * Run: npm run test:analytics-schema-parity
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

// Import the schema enums from tool-schemas.js
// Note: bare-node can't load tool-schemas.js (Prisma dep) so we grep the
// source directly. This is intentional — the test treats the schema file
// as a string artifact, matching the comparison strategy.
const TOOL_SCHEMAS_PATH = path.join(__dirname, '../lib/mcp/server/config/tool-schemas.js');
const RECOMMENDATIONS_ROUTE = path.join(__dirname, '../app/api/mcp/recommendations/route.ts');
const RECOMMENDATION_GENERATOR = path.join(__dirname, '../lib/mcp/recommendation-generator.ts');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assertEqual(actual: unknown, expected: unknown, msg: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(`${msg}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
    console.log(`  ❌ ${msg}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
  }
}

function assertSubset(subset: string[], superset: string[], msg: string): void {
  const missing = subset.filter((v) => !superset.includes(v));
  if (missing.length === 0) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(`${msg}\n     missing from superset: ${missing.join(', ')}`);
    console.log(`  ❌ ${msg}`);
    console.log(`     missing from superset: ${missing.join(', ')}`);
  }
}

/**
 * Extract the literal values inside a z.enum([...]) call by NAME.
 * Returns sorted unique values.
 */
function extractZodEnum(source: string, schemaName: string): string[] {
  // Match `const NAME = z.enum([ ... ])` allowing multiline + comments
  const re = new RegExp(
    `const\\s+${schemaName}\\s*=\\s*z\\.enum\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`,
    'm'
  );
  const m = source.match(re);
  if (!m) return [];
  // Extract single-quoted strings; ignore comments
  const literalRe = /'([A-Z][A-Z0-9_]*)'/g;
  const values = new Set<string>();
  let match;
  while ((match = literalRe.exec(m[1])) !== null) {
    values.add(match[1]);
  }
  return Array.from(values).sort();
}

/**
 * Extract all `type: 'XXX'` literal emissions from a source file.
 * Filters to ALL-CAPS-WITH-UNDERSCORES values to match enum convention.
 */
function extractEmittedTypes(source: string): string[] {
  const re = /type:\s*'([A-Z][A-Z0-9_]*)'/g;
  const values = new Set<string>();
  let match;
  while ((match = re.exec(source)) !== null) {
    values.add(match[1]);
  }
  return Array.from(values).sort();
}

function extractEmittedImpacts(source: string): string[] {
  const re = /impact:\s*'([A-Z][A-Z0-9_]*)'/g;
  const values = new Set<string>();
  let match;
  while ((match = re.exec(source)) !== null) {
    values.add(match[1]);
  }
  return Array.from(values).sort();
}

// ──────────────────────────────────────────────────────────────────────
console.log('\n🧪 ARCH-ANALYTICS-1 — Analytics Schema Parity Test\n');

const schemasSrc = fs.readFileSync(TOOL_SCHEMAS_PATH, 'utf-8');
const routeSrc = fs.readFileSync(RECOMMENDATIONS_ROUTE, 'utf-8');
const generatorSrc = fs.readFileSync(RECOMMENDATION_GENERATOR, 'utf-8');

// ──────────────────────────────────────────────────────────────────────
// Part A: recommendationTypeSchema parity
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part A: recommendationTypeSchema vs generator emit sites ──\n');

const schemaTypes = extractZodEnum(schemasSrc, 'recommendationTypeSchema');
const routeEmittedTypes = extractEmittedTypes(routeSrc);
const generatorEmittedTypes = extractEmittedTypes(generatorSrc);
const allEmitted = Array.from(new Set([...routeEmittedTypes, ...generatorEmittedTypes])).sort();

console.log(`  Schema declares: ${schemaTypes.join(', ')}`);
console.log(`  Generators emit: ${allEmitted.join(', ')}`);

assertSubset(
  allEmitted,
  schemaTypes,
  'A1: every emitted type is in the schema (catches BUG-ANALYTICS-007 class)'
);

// Reverse drift: schema-declared values must be reachable.
// This is a SOFTER check — a value can be declared for future use OR
// because it was emitted by deleted/refactored code. We allow declared-but-
// unemitted but log it for awareness.
const unusedInSchema = schemaTypes.filter((v) => !allEmitted.includes(v));
if (unusedInSchema.length > 0) {
  console.log(`  ⚠️  Schema declares values with no current generator emit: ${unusedInSchema.join(', ')}`);
  console.log(`      (Soft warning — may be intentional for forward-compat. Verify with a grep before removing.)`);
}

// ──────────────────────────────────────────────────────────────────────
// Part B: impactLevelSchema parity
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part B: impactLevelSchema vs generator emit sites ──\n');

const schemaImpacts = extractZodEnum(schemasSrc, 'impactLevelSchema');
const routeEmittedImpacts = extractEmittedImpacts(routeSrc);
const generatorEmittedImpacts = extractEmittedImpacts(generatorSrc);
const allEmittedImpacts = Array.from(new Set([...routeEmittedImpacts, ...generatorEmittedImpacts])).sort();

console.log(`  Schema declares: ${schemaImpacts.join(', ')}`);
console.log(`  Generators emit: ${allEmittedImpacts.join(', ')}`);

assertSubset(
  allEmittedImpacts,
  schemaImpacts,
  'B1: every emitted impact is in the schema'
);

const unusedImpacts = schemaImpacts.filter((v) => !allEmittedImpacts.includes(v));
if (unusedImpacts.length > 0) {
  console.log(`  ⚠️  Schema declares impacts with no current generator emit: ${unusedImpacts.join(', ')}`);
}

// ──────────────────────────────────────────────────────────────────────
// Part C: regression guard for BUG-ANALYTICS-007 specific values
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part C: BUG-ANALYTICS-007 regression guard ──\n');

assertEqual(
  schemaTypes.includes('PERFORMANCE_ENHANCEMENT'),
  true,
  'C1: PERFORMANCE_ENHANCEMENT still in schema (BUG-ANALYTICS-007 fix)'
);
assertEqual(
  schemaTypes.includes('QUALITY_IMPROVEMENT'),
  true,
  'C2: QUALITY_IMPROVEMENT still in schema (BUG-ANALYTICS-007 fix)'
);

// ──────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n❌ FAILURES:\n');
  failures.forEach((f) => console.log(`  - ${f}\n`));
  console.log('\n💡 Fix shape:');
  console.log('  - Schema-missing-emit: add the missing type to recommendationTypeSchema');
  console.log('    or impactLevelSchema in lib/mcp/server/config/tool-schemas.js.');
  console.log('  - Schema-has-unused (soft warning): grep for the value to confirm no');
  console.log('    consumer reads it; if truly orphaned, remove with a [[feedback_defend_vs_delete_dead_code]]');
  console.log('    audit note in the commit.');
  process.exit(1);
}
console.log('✅ All analytics schema-parity checks passed');
process.exit(0);
