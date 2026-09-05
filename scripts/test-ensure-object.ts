#!/usr/bin/env ts-node
/**
 * EnsureObject Utility Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Deployment Sweep — counts how many files import ensureObject
 *          at transport boundary sites, without hardcoding individual paths.
 *          Refactored 2026-04-08 (plan v4 improvement #7) from the previous
 *          per-file grep suite, which was fragile to file rename/deletion and
 *          codified the dual-file pattern we eradicated in Bug Class 73.
 *
 * Layer 2: Behavior Validation — tests ensureObject function correctness.
 *
 * Bug Class Reference: /.claude/knowledge/domain/mcp/bug-class-registry.md (Bug Class 1)
 * Pattern Reference: /.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md
 *
 * Created: 2026-02-16 | Refactored: 2026-04-08
 */

import * as fs from 'fs';
import * as path from 'path';

// Import the TypeScript version directly for Layer 2 testing
import { ensureObject } from '../lib/utils/ensure-object';

console.log('🧪 EnsureObject Transport Boundary Defense (Dual-Layer)\n');

let passed = 0;
let failed = 0;
let layer1Passed = 0;
let layer2Passed = 0;

const REPO_ROOT = path.resolve(__dirname, '..');

/** Recursively walk a directory, returning all files matching a predicate. */
function walkSync(dir: string, filter: (f: string) => boolean, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip heavy/uninteresting subtrees
      if (['node_modules', '.next', '.turbo', 'dist', 'build', 'coverage', '.git'].includes(entry.name)) continue;
      walkSync(full, filter, out);
    } else if (entry.isFile() && filter(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Count files under a root that reference ensureObject via any import style. */
function countEnsureObjectImporters(rootDirs: string[]): number {
  const pattern = /\b(require\s*\(\s*['"][^'"]*ensure-object['"]\s*\)|from\s+['"][^'"]*ensure-object['"])/;
  const tsJsFilter = (f: string) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && !f.endsWith('.d.ts');
  let count = 0;
  for (const root of rootDirs) {
    const abs = path.resolve(REPO_ROOT, root);
    if (!fs.existsSync(abs)) continue;
    for (const file of walkSync(abs, tsJsFilter)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (pattern.test(content)) count++;
      } catch { /* unreadable, skip */ }
    }
  }
  return count;
}

/** Count files under services/* that inline their own ensureObject function (they're published npm packages, can't share the lib). */
function countInlinedEnsureObject(rootDir: string): number {
  const abs = path.resolve(REPO_ROOT, rootDir);
  if (!fs.existsSync(abs)) return 0;
  const tsJsFilter = (f: string) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts');
  let count = 0;
  for (const file of walkSync(abs, tsJsFilter)) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (/function\s+ensureObject\s*\(/.test(content)) count++;
    } catch { /* skip */ }
  }
  return count;
}

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
      const a = JSON.stringify(value);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected ${b}, got ${a}`);
      }
    },
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected string containing "${substring}", got ${JSON.stringify(value)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof value !== 'number' || value <= expected) {
        throw new Error(`Expected > ${expected}, got ${value}`);
      }
    }
  };
}

// ========================================
// LAYER 1: Pattern Deployment Sweep
// Count how many files import or inline ensureObject at transport boundaries.
// Resilient to individual file renames/moves/deletions — only fails if the
// overall pattern coverage drops below threshold.
// ========================================

console.log('=====================================');
console.log('LAYER 1: Pattern Deployment Sweep');
console.log('=====================================\n');

// Two-tier threshold system (hardened 2026-04-10 against silent regression):
//
//   MIN_*      — absolute floor. Catastrophic drop indicator. Never lower
//                these without a deliberate architectural decision; lowering
//                means you're accepting that the transport boundary defense
//                has fundamentally shrunk and BC1/BC73 risk has increased.
//
//   BASELINE_* — last-known-good count. Updated forward only, by running
//                `npm run test:ensure-object -- --update-baseline` (or
//                manually editing these constants). If the current count
//                drops below BASELINE, the test fails with a regression
//                error — something was removed that was previously guarded.
//                If the current count rises above BASELINE, the test WARNS
//                (but does not fail) and asks you to bump the baseline.
//
// Rationale: a static floor (only MIN) tolerates silent coverage loss as
// long as it stays above MIN. A regression-detecting baseline catches any
// reduction from the last validated state, which is what you want — most
// "a Docker service stopped inlining ensureObject" bugs show as a -1 not
// a -10, so a pure floor at 5 would silently accept a drop from 7 to 5.
const MIN_SHARED_IMPORTERS = 8;      // absolute floor
const MIN_INLINED_SERVICES = 5;      // absolute floor
const BASELINE_SHARED_IMPORTERS = 20; // last updated 2026-06-09 (was 21 — lib/pov/services/metadata.ts ensureObject removed: updateMetadata converted to an atomic jsonb `||` UPDATE (BC19), so there is no app-side metadata read left to guard)
const BASELINE_INLINED_SERVICES = 7;  // last updated 2026-04-10 — current production state

test('Pattern: TypeScript utility exists (lib/utils/ensure-object.ts)', () => {
  const filePath = path.resolve(REPO_ROOT, 'lib/utils/ensure-object.ts');
  expect(fs.existsSync(filePath)).toBe(true);
  const content = fs.readFileSync(filePath, 'utf-8');
  expect(content.includes('export function ensureObject')).toBe(true);
  layer1Passed++;
});

test('Pattern: ensureObject runtime import resolves (smoke)', () => {
  // If this file ran at all, the top-of-file `import { ensureObject }` already
  // succeeded via ts-node resolution. Assert the imported symbol is a function.
  if (typeof ensureObject !== 'function') {
    throw new Error(`ensureObject must be a function, got ${typeof ensureObject}`);
  }
  layer1Passed++;
});

test(`Pattern: shared ensureObject deployed (floor=${MIN_SHARED_IMPORTERS}, baseline=${BASELINE_SHARED_IMPORTERS})`, () => {
  const count = countEnsureObjectImporters(['lib', 'app', 'mcp-server-v5.js']);
  console.log(`   (found ${count} files importing @/lib/utils/ensure-object)`);
  // Hard floor — catastrophic drop
  if (count < MIN_SHARED_IMPORTERS) {
    throw new Error(`CATASTROPHIC: only ${count} files importing ensure-object (absolute floor is ${MIN_SHARED_IMPORTERS})`);
  }
  // Regression detector — any drop from last-known-good
  if (count < BASELINE_SHARED_IMPORTERS) {
    throw new Error(
      `REGRESSION: ${count} files importing ensure-object, baseline was ${BASELINE_SHARED_IMPORTERS}. ` +
      `A transport boundary guard was removed since the baseline was last updated. ` +
      `Investigate: git log -p scripts/test-ensure-object.ts (for baseline history) and ` +
      `grep -rlE "require\\(.*ensure-object|from.*ensure-object" lib/ app/ (for current sites).`
    );
  }
  // Progress — allow but nudge to update baseline
  if (count > BASELINE_SHARED_IMPORTERS) {
    console.log(`   ⬆  coverage improved: ${BASELINE_SHARED_IMPORTERS} → ${count}. Consider bumping BASELINE_SHARED_IMPORTERS to ${count}.`);
  }
  layer1Passed++;
});

test(`Pattern: inlined ensureObject in service packages (floor=${MIN_INLINED_SERVICES}, baseline=${BASELINE_INLINED_SERVICES})`, () => {
  // Services under services/* are published MCP servers that can't share
  // lib/utils — each inlines its own defense-in-depth copy.
  const count = countInlinedEnsureObject('services');
  // Fork-safe (2026-09-05): the public export ships ONE reference service (weather), so a fixed
  // headcount floor asserts the private repo's inventory, not the property. When fewer service
  // packages are present than the floor, assert the PROPERTY instead — every package that is
  // there inlines the guard — and skip the private floors/baseline. (First public CI run failed here.)
  const servicesDir = path.resolve(__dirname, '..', 'services');   // same base as countInlinedEnsureObject
  const present = fs.existsSync(servicesDir)
    ? fs.readdirSync(servicesDir).filter(n => fs.statSync(path.join(servicesDir, n)).isDirectory()).length  // statSync follows symlinks
    : 0;
  console.log(`   (found ${count} service packages with inlined ensureObject; ${present} service packages present)`);
  if (present < MIN_INLINED_SERVICES) {
    if (count !== present) {
      throw new Error(`PROPERTY: ${count} of ${present} present service packages inline ensureObject — every published service package must`);
    }
    console.log(`   ↷ reduced service set (${present} < ${MIN_INLINED_SERVICES}) — property holds; private floor/baseline not applicable`);
    layer1Passed++;
    return;
  }
  if (count < MIN_INLINED_SERVICES) {
    throw new Error(`CATASTROPHIC: only ${count} services with inlined ensureObject (absolute floor is ${MIN_INLINED_SERVICES})`);
  }
  if (count < BASELINE_INLINED_SERVICES) {
    throw new Error(
      `REGRESSION: ${count} services have inlined ensureObject, baseline was ${BASELINE_INLINED_SERVICES}. ` +
      `A service was removed or stopped inlining the guard. ` +
      `Investigate: grep -rln "function ensureObject" services/ (for current sites).`
    );
  }
  if (count > BASELINE_INLINED_SERVICES) {
    console.log(`   ⬆  coverage improved: ${BASELINE_INLINED_SERVICES} → ${count}. Consider bumping BASELINE_INLINED_SERVICES to ${count}.`);
  }
  layer1Passed++;
});

// ========================================
// LAYER 2: Behavior Validation
// Test ensureObject function correctness
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Behavior Validation');
console.log('=====================================\n');

// --- Object passthrough ---

test('Behavior: Object passthrough (already an object)', () => {
  const input = { key: 'value', nested: { a: 1 } };
  const result = ensureObject(input);
  expect(result).toEqual(input);
  layer2Passed++;
});

test('Behavior: Empty object passthrough', () => {
  const result = ensureObject({});
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

// --- JSON string parsing ---

test('Behavior: Valid JSON string parsed to object', () => {
  const input = '{"key":"value","count":42}';
  const result = ensureObject(input);
  expect((result as any).key).toBe('value');
  expect((result as any).count).toBe(42);
  layer2Passed++;
});

test('Behavior: Nested JSON string parsed correctly', () => {
  const input = '{"outer":{"inner":{"deep":"value"}}}';
  const result = ensureObject(input);
  expect((result as any).outer.inner.deep).toBe('value');
  layer2Passed++;
});

// --- Null/undefined fallback ---

test('Behavior: null returns default fallback (empty object)', () => {
  const result = ensureObject(null);
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

test('Behavior: undefined returns default fallback (empty object)', () => {
  const result = ensureObject(undefined);
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

test('Behavior: null returns custom fallback', () => {
  const fallback = { default: true } as Record<string, unknown>;
  const result = ensureObject(null, fallback);
  expect((result as any).default).toBe(true);
  layer2Passed++;
});

// --- Invalid JSON fallback ---

test('Behavior: Invalid JSON string returns fallback', () => {
  const result = ensureObject('not-json');
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

test('Behavior: Partial JSON string returns fallback', () => {
  const result = ensureObject('{"incomplete');
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

// --- Array rejection ---

test('Behavior: Array input returns fallback (not treated as object)', () => {
  const result = ensureObject([1, 2, 3]);
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

test('Behavior: JSON array string returns fallback', () => {
  const result = ensureObject('[1, 2, 3]');
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

// --- Edge cases ---

test('Behavior: Number input returns fallback', () => {
  const result = ensureObject(42);
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

test('Behavior: Boolean input returns fallback', () => {
  const result = ensureObject(true);
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

test('Behavior: JSON "null" string returns fallback', () => {
  const result = ensureObject('null');
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

test('Behavior: JSON number string returns fallback', () => {
  const result = ensureObject('42');
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

test('Behavior: Empty string returns fallback', () => {
  const result = ensureObject('');
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

// --- Label warning (verify no throw) ---

test('Behavior: Label does not cause error on invalid input', () => {
  // This should not throw - just logs a warning
  const result = ensureObject('bad-json', {}, 'TestLabel');
  expect(JSON.stringify(result)).toBe('{}');
  layer2Passed++;
});

// --- Real-world transport boundary scenario ---

test('Behavior: Simulated MCP transport serialization (real-world scenario)', () => {
  // Simulate: Claude Desktop sends args as JSON string through stdio transport
  const originalArgs = { serviceId: 'svc-123', tool: 'get_data', arguments: { query: 'test' } };
  const serialized = JSON.stringify(originalArgs); // Transport serializes to string
  const recovered = ensureObject(serialized);
  expect((recovered as any).serviceId).toBe('svc-123');
  expect((recovered as any).tool).toBe('get_data');
  expect((recovered as any).arguments.query).toBe('test');
  layer2Passed++;
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('EnsureObject Defense Summary:');
console.log('=====================================');
console.log(`\n📊 Layer 1 (Pattern Sweep): ${layer1Passed}/4`);
console.log(`📊 Layer 2 (Behavior): ${layer2Passed}/18`);
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
