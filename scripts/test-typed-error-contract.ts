#!/usr/bin/env ts-node
/**
 * Typed-Error Contract Enforcement Test
 *
 * Layer 1 pattern test that locks in the contract documented in
 * `boundary-contract-specialist.md` § "Typed-Error Discriminator Contract":
 *
 *   Every domain error class MUST extend `AppError` (directly or transitively
 *   via ValidationError / ApiError / etc.). Never raw `Error`.
 *
 * Why: AppError carries `.code` (string discriminator) and `.details` (forensic
 * payload). Catch sites (especially MCP HTTP boundary at
 * app/api/mcp/tasks/action/route.ts:404 and the MCP tool boundary at
 * lib/mcp/server/tools/advanced/task-action-handler.js:651) discriminate via
 * `instanceof AppError` and read `.code`. A class extending raw `Error` is
 * silently invisible to that boundary preservation — the .code is undefined
 * and the boundary flattens to INTERNAL_ERROR.
 *
 * The original PipelineStageMismatchError draft (during harness clobber-
 * detection planning) used `extends Error`. Boundary-contract specialist
 * caught it as Issue 1 of their review. This test prevents the same mistake
 * from recurring.
 *
 * Created: 2026-04-25
 *
 * Allowlist: lib/errors.ts itself, where AppError is the foundation that
 * extends Error. Plus a few historical legacy errors that extend Error for
 * structural reasons (e.g., subclassing built-in classes that don't accept
 * additional fields). Each allowlist entry needs a comment explaining why.
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 Typed-Error Contract Test\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) console.error(`   ${error.message}`);
    failed++;
  }
}

// Files allowed to define `extends Error` classes.
//
// `lib/errors.ts` defines AppError itself (which extends Error — the root
// of our typed hierarchy). Other entries should be rare and require a
// comment explaining the structural reason.
const ALLOWLIST = new Set<string>([
  'lib/errors.ts',
  // Wave 4 Phase 4.1 (2026-05-20): AuthMiddlewareReject is a control-flow
  // marker thrown by AuthManager.createMiddleware to signal "401 needed,
  // here's the response recipe". The server wrapper catches it and
  // serializes — it's NOT a domain error (no business semantic meaning).
  // Using AppError would imply this is reportable, but reject markers
  // are part of normal auth flow. Approved during Wave 4 v2 specialist
  // review (boundary-C3 fold).
  'lib/auth/oauth/auth-manager.ts',
]);

/**
 * Recursively walk a directory and yield TypeScript source files (excluding
 * node_modules, .next, and test scripts).
 */
function* walkTsFiles(root: string, prefix = ''): Generator<{ file: string; relPath: string }> {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const full = path.join(root, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      yield* walkTsFiles(full, rel);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      yield { file: full, relPath: rel };
    }
  }
}

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['lib', 'app'];

const violations: Array<{ relPath: string; line: number; match: string }> = [];

for (const scanRoot of SCAN_ROOTS) {
  const fullScanRoot = path.join(REPO_ROOT, scanRoot);
  if (!fs.existsSync(fullScanRoot)) continue;

  for (const { file, relPath } of walkTsFiles(fullScanRoot, scanRoot)) {
    if (ALLOWLIST.has(relPath)) continue;
    const source = fs.readFileSync(file, 'utf-8');
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // Match `export class FooError extends Error` (the bug shape).
      // Excludes valid forms:
      //   `extends AppError`, `extends ValidationError`, `extends ApiError`,
      //   `extends BoundaryContractViolation`, etc.
      // The `\bError\b` ensures we don't match longer names.
      const match = lines[i].match(/export\s+class\s+(\w+)\s+extends\s+Error\b/);
      if (match) {
        violations.push({ relPath, line: i + 1, match: lines[i].trim() });
      }
    }
  }
}

test('No domain error class extends raw Error (must extend AppError or descendant)', () => {
  if (violations.length === 0) return;
  const detail = violations
    .map(v => `   ${v.relPath}:${v.line}: ${v.match}`)
    .join('\n');
  throw new Error(
    `Found ${violations.length} class(es) extending raw Error outside the allowlist:\n${detail}\n\n` +
    `Each must extend AppError (directly) or a descendant (ValidationError, ApiError, etc.).\n` +
    `If a structural reason genuinely requires extends Error, add the file to ALLOWLIST in this test with a comment.`
  );
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
