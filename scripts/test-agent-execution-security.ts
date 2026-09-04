#!/usr/bin/env ts-node
/**
 * Agent Execution Security Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Validation — Grep-based code audits
 *   - G1: apiKey substring must not appear in logger.*(...) / throw new Error(...) calls within lib/services/llm/
 *   - G8: prisma.agentExecution.create(...) must only appear inside lib/services/agent-execution-create.ts
 *
 * Layer 2: Behavior Validation — TriggeredBySchema actually rejects the drift shapes
 *   - Rejects bare-string (the original 2026-04-15 reactor bug shape)
 *   - Rejects object missing `source`
 *   - Rejects object with non-CUID id
 *   - Accepts well-formed {id, source}
 *   - `.strict()` rejects unknown keys (typo defense + prototype pollution defense)
 *
 * Created: 2026-04-16 (task #85 — reactor userId propagation)
 * Tests: 5 pattern + 8 behavior = 13 total
 *
 * Related:
 *   - sec-ops-specialist SEC-3 (apiKey logging prevention)
 *   - boundary-contract-specialist BC-3, BC-8 (wrapper enforcement + schema regression)
 *   - agent-execution-specialist (extractUserId warn-log contract)
 */

console.log('🧪 Agent Execution Security Tests (Dual-Layer)\n');

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
    toBeTruthy() {
      if (!value) throw new Error(`Expected truthy, got ${value}`);
    },
    toBeFalsy() {
      if (value) throw new Error(`Expected falsy, got ${value}`);
    },
  };
}

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Recursively find all .ts files in a directory, excluding node_modules and test files.
 */
function walkTs(dir: string, excludeFiles: string[] = []): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
      out.push(...walkTs(full, excludeFiles));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      if (excludeFiles.some((ex) => full.endsWith(ex))) continue;
      out.push(full);
    }
  }
  return out;
}

// ========================================
// LAYER 1: Pattern Validation
// ========================================

console.log('=====================================');
console.log('LAYER 1: Code Pattern Validation');
console.log('=====================================\n');

// --- G1: apiKey substring in logger / throw calls ---

test('G1 Pattern: no `apiKey` substring in logger.{info,warn,error}(...) calls in lib/services/llm/', () => {
  const llmFiles = walkTs(path.join(REPO_ROOT, 'lib', 'services', 'llm'));
  const violations: string[] = [];
  for (const file of llmFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    // Look for logger calls containing "apiKey" as a substring within their argument list.
    // Conservative regex: matches `logger.(info|warn|error|debug)(` and captures up to the matching `)` at paren depth 0.
    const loggerRegex = /\blog(?:ger)?\s*\.\s*(?:info|warn|error|debug|fatal|trace)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
    let match;
    while ((match = loggerRegex.exec(content)) !== null) {
      const args = match[1];
      // Only flag if `apiKey` appears as a standalone token, not embedded in a word
      // (e.g., `apiKeyHash` is fine because we hash before log).
      if (/\bapiKey\b/.test(args) && !/apiKeyHash|apiKeyMetadata/.test(args)) {
        const line = content.substring(0, match.index).split('\n').length;
        violations.push(`${path.relative(REPO_ROOT, file)}:${line}`);
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`Found ${violations.length} apiKey-in-logger violation(s):\n   ${violations.join('\n   ')}`);
  }
  layer1Passed++;
});

test('G1 Pattern: no `apiKey` substring in `throw new Error(...)` bodies in lib/services/llm/', () => {
  const llmFiles = walkTs(path.join(REPO_ROOT, 'lib', 'services', 'llm'));
  const violations: string[] = [];
  for (const file of llmFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const throwRegex = /throw\s+new\s+(?:Error|AppError|AuthError|ValidationError|BoundaryContractViolation)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
    let match;
    while ((match = throwRegex.exec(content)) !== null) {
      const args = match[1];
      // Flag if `apiKey` appears as a standalone token — the error message shouldn't leak
      // any apiKey value (neither bare, masked substring, nor prefix hints).
      if (/\bapiKey\b/.test(args) && !/apiKey\s+required|apiKey\?\.?/.test(args)) {
        const line = content.substring(0, match.index).split('\n').length;
        violations.push(`${path.relative(REPO_ROOT, file)}:${line}`);
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`Found ${violations.length} apiKey-in-throw violation(s):\n   ${violations.join('\n   ')}`);
  }
  layer1Passed++;
});

test('G1 Pattern: no `apiKey.substring(`, `.slice(`, `.substr(` partial-key logging patterns in lib/services/llm/', () => {
  const llmFiles = walkTs(path.join(REPO_ROOT, 'lib', 'services', 'llm'));
  const violations: string[] = [];
  for (const file of llmFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (/apiKey\.(substring|slice|substr)\s*\(/.test(content)) {
      violations.push(path.relative(REPO_ROOT, file));
    }
  }
  if (violations.length > 0) {
    throw new Error(`Found partial-key exposure pattern in: ${violations.join(', ')}`);
  }
  layer1Passed++;
});

// --- G8: raw agentExecution.create outside the wrapper ---

test('G8 Pattern: `prisma.agentExecution.create(` only appears in lib/services/agent-execution-create.ts', () => {
  const searchRoots = [
    path.join(REPO_ROOT, 'lib'),
    path.join(REPO_ROOT, 'app'),
  ];
  const allowedFile = path.join(REPO_ROOT, 'lib', 'services', 'agent-execution-create.ts');
  const violations: string[] = [];
  for (const root of searchRoots) {
    const files = walkTs(root);
    for (const file of files) {
      if (file === allowedFile) continue;
      const content = fs.readFileSync(file, 'utf-8');
      // Match actual function calls, not comments or JSDoc references.
      // `prisma.agentExecution.create(` preceded by whitespace/operator, not inside `//` or within `/** ... */` block
      const lines = content.split('\n');
      let inBlockComment = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Track block comments
        if (line.includes('/*')) inBlockComment = true;
        if (line.includes('*/')) {
          inBlockComment = false;
          continue;
        }
        if (inBlockComment) continue;
        // Skip line comments
        const codeOnly = line.replace(/\/\/.*$/, '');
        if (/\bprisma\.agentExecution\.create\s*\(/.test(codeOnly)) {
          violations.push(`${path.relative(REPO_ROOT, file)}:${i + 1}`);
        }
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Found ${violations.length} raw-create violation(s) — must funnel through createAgentExecution wrapper:\n   ${violations.join('\n   ')}`
    );
  }
  layer1Passed++;
});

test('G8 Pattern: `tx.agentExecution.create(` (transactional variant) only in allowed sites', () => {
  // tx.agentExecution.create is legitimate WITHIN lib/services/agent-execution-create.ts (the wrapper
  // may internally use a transaction in the future) and within agentExecutionEngine.ts's safety-net
  // transaction (which creates an error.json artifact alongside status update — not a new execution).
  // Anywhere else is a violation.
  const searchRoots = [
    path.join(REPO_ROOT, 'lib'),
    path.join(REPO_ROOT, 'app'),
  ];
  const allowedFiles = [
    path.join(REPO_ROOT, 'lib', 'services', 'agent-execution-create.ts'),
    // Note: agentExecutionEngine.ts uses tx.agentExecution.update inside transactions — not .create.
    // If a .create slips in there during future edits, this test will catch it.
  ];
  const violations: string[] = [];
  for (const root of searchRoots) {
    const files = walkTs(root);
    for (const file of files) {
      if (allowedFiles.includes(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      let inBlockComment = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('/*')) inBlockComment = true;
        if (line.includes('*/')) {
          inBlockComment = false;
          continue;
        }
        if (inBlockComment) continue;
        const codeOnly = line.replace(/\/\/.*$/, '');
        if (/\btx\.agentExecution\.create\s*\(/.test(codeOnly)) {
          violations.push(`${path.relative(REPO_ROOT, file)}:${i + 1}`);
        }
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Found ${violations.length} tx.agentExecution.create violation(s) outside allowed sites:\n   ${violations.join('\n   ')}`
    );
  }
  layer1Passed++;
});

// ========================================
// LAYER 2: Behavior Validation
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Schema Behavior Validation');
console.log('=====================================\n');

import { TriggeredBySchema, isTriggeredBy } from '../lib/services/types/triggered-by';

test('Behavior: TriggeredBySchema rejects bare-string (the original 2026-04-15 bug shape)', () => {
  // The original bug: reactor wrote `context.triggeredBy = "cmnzq6g5j000s..."` (a task ID).
  // With the schema in place, this write would throw at the wrapper boundary instead of
  // silently persisting and failing downstream with a masked "empty LLM response".
  const result = TriggeredBySchema.safeParse('cmnzq6g5j000syx0b7z9axajs');
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: TriggeredBySchema rejects object missing `source`', () => {
  // Before 2026-04-16, agentTaskService wrote `{ id: userId }` without a source field.
  // The required `source` enum catches this class of drift — `source` cannot be inferred,
  // so callers must explicitly tag each execution with its origin code path.
  const result = TriggeredBySchema.safeParse({ id: 'cmh86xj81002tyxmi5k2qv1ls' });
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: TriggeredBySchema rejects non-CUID id (would have caught the task-ID-as-userId confusion)', () => {
  // A free-string id would pass a `z.string()` check but fail `.cuid()`. The original bug
  // wrote a CUID that happened to be a task ID — that specific case needs a DIFFERENT defense
  // (the required `source` field above). But free-strings/emails/uuids ARE caught here.
  const result = TriggeredBySchema.safeParse({ id: 'not-a-cuid', source: 'mcp-direct' });
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: TriggeredBySchema rejects unknown keys (.strict() — typo defense + prototype pollution defense)', () => {
  // .strict() serves double duty: catches typos like `parentExecId` (instead of parentExecutionId),
  // AND blocks prototype-pollution attempts via `__proto__` at the JSONB write boundary.
  const result = TriggeredBySchema.safeParse({
    id: 'cmh86xj81002tyxmi5k2qv1ls',
    source: 'mcp-direct',
    unknownKey: 'should-be-rejected',
  });
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: TriggeredBySchema accepts well-formed {id, source}', () => {
  const result = TriggeredBySchema.safeParse({
    id: 'cmh86xj81002tyxmi5k2qv1ls',
    source: 'mcp-direct',
  });
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: TriggeredBySchema accepts full record with lineage', () => {
  // Reactor-queued children use this shape: propagated userId + reactor source +
  // parentExecutionId for audit-trail forensics.
  const result = TriggeredBySchema.safeParse({
    id: 'cmh86xj81002tyxmi5k2qv1ls',
    source: 'reactor-task-ready',
    parentExecutionId: 'cmnzr9m7w001tyx0bvvsfnaty',
    parentTaskId: 'cmnzq67w0000myx0byu3d72z5',
  });
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: isTriggeredBy type guard narrows correctly for valid input', () => {
  const valid: unknown = { id: 'cmh86xj81002tyxmi5k2qv1ls', source: 'mcp-direct' };
  expect(isTriggeredBy(valid)).toBe(true);
  layer2Passed++;
});

test('Behavior: isTriggeredBy returns false for legacy JSONB rows (bare-string shape)', () => {
  // Legacy rows from pre-2026-04-16 reactors will fail this guard; the engine's
  // extractUserId handles them via the fallback to task.assigneeId (with a WARN log).
  const legacy: unknown = 'cmnzq6g5j000syx0b7z9axajs';
  expect(isTriggeredBy(legacy)).toBe(false);
  layer2Passed++;
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('Test Summary');
console.log('=====================================');
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed} (Layer 1: ${layer1Passed}, Layer 2: ${layer2Passed})`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
process.exit(0);
