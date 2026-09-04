#!/usr/bin/env ts-node
/**
 * Null-Template Guard Tests — Concern B
 *
 * Layer 1 pattern validation for the null-template guards in the engine
 * and stream-route paths that close the Priority 3 (Universal Template)
 * bypass and the stream route's ad-hoc `"You are an AI assistant..."`
 * fallback.
 *
 * Engine guard: agentExecutionEngine.ts ~line 540 (after resolvedTemplate).
 * Stream guard: app/api/pov/agent/execute/stream/route.ts (before the
 *               three-branch prompt resolution; stricter engine guard vs.
 *               looser stream guard documented as intentional).
 *
 * Also validates:
 *   - NoTemplateAssignedError class exists in lib/errors.ts
 *   - SSE error event body shape matches GUI `sseUtils` consumer
 *     (boundary-contract CRITICAL #1 regression guard)
 *   - Priority 3 (Universal Template) fallback is REMOVED + replaced by a fail-loud throw (2026-06-09)
 *
 * Created: 2026-04-18
 * Plan: cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md §6
 * Reviews: boundary-contract-specialist-review.md (§B1, §B2, §B5, §B7)
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🚧 Null-Template Guard Tests (Concern B pattern validation)\n');

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
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected string to contain "${substring}"`);
      }
    },
    toMatch(re: RegExp) {
      if (typeof value !== 'string' || !re.test(value)) {
        throw new Error(`Expected string to match ${re}`);
      }
    },
    toNotContain(substring: string) {
      if (typeof value === 'string' && value.includes(substring)) {
        throw new Error(`Expected string NOT to contain "${substring}"`);
      }
    },
  };
}

const REPO_ROOT = path.resolve(__dirname, '..');

const errorsSource = fs.readFileSync(path.join(REPO_ROOT, 'lib/errors.ts'), 'utf-8');
const engineSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/agentExecutionEngine.ts'),
  'utf-8'
);
const streamSource = fs.readFileSync(
  path.join(REPO_ROOT, 'app/api/pov/agent/execute/stream/route.ts'),
  'utf-8'
);

// ========================================
// Typed error class — lib/errors.ts
// ========================================

console.log('--- Typed error class ---\n');

test('E1: NoTemplateAssignedError class is exported from lib/errors.ts', () => {
  expect(errorsSource).toMatch(/export\s+class\s+NoTemplateAssignedError\s+extends\s+AppError/);
});

test('E2: NoTemplateAssignedError code is NO_TEMPLATE_ASSIGNED', () => {
  expect(errorsSource).toContain("'NO_TEMPLATE_ASSIGNED'");
});

test('E3: NoTemplateAssignedError constructor takes executionId + taskId', () => {
  expect(errorsSource).toMatch(/constructor\(executionId:\s*string,\s*taskId:\s*string\)/);
});

test('E4: NoTemplateAssignedError passes details to super (for debugging)', () => {
  expect(errorsSource).toMatch(/\{\s*executionId,\s*taskId\s*\}/);
});

// ========================================
// Engine guard — agentExecutionEngine.ts
// ========================================

console.log('\n--- Engine path: agentExecutionEngine.ts ---\n');

test('G1: NoTemplateAssignedError is imported from @/lib/errors', () => {
  expect(engineSource).toMatch(
    /import\s*\{[^}]*NoTemplateAssignedError[^}]*\}\s*from\s*['"]@\/lib\/errors['"]/
  );
});

test('G2: guard throws NoTemplateAssignedError when resolvedTemplate is falsy', () => {
  expect(engineSource).toMatch(/if\s*\(\s*!\s*resolvedTemplate\s*\)\s*\{[\s\S]*?throw\s+new\s+NoTemplateAssignedError/);
});

test('G3: guard sits AFTER the resolvedTemplate computation', () => {
  const resolvedIdx = engineSource.indexOf('const resolvedTemplate = execution.agentTemplate');
  const throwIdx = engineSource.indexOf('throw new NoTemplateAssignedError');
  if (resolvedIdx < 0 || throwIdx < 0) {
    throw new Error('Could not locate resolvedTemplate or guard');
  }
  if (throwIdx < resolvedIdx) {
    throw new Error('Guard must come AFTER resolvedTemplate computation');
  }
  if (throwIdx - resolvedIdx > 3000) {
    throw new Error(`Guard is too far from resolvedTemplate (${throwIdx - resolvedIdx} chars) — may be in wrong context`);
  }
});

test('G4: stale 2026-04-15 comment was updated (execution.agentTemplate is NOT always null now)', () => {
  // pipeline-harness I2: the 536-539 comment claimed execution.agentTemplate
  // is ALWAYS null, which is stale post-2026-04-15. Updated comment should
  // reflect current reality.
  expect(engineSource).toNotContain('execution.agentTemplate is ALWAYS null in practice');
});

test('G5: Priority 3 (Universal Template) fallback is REMOVED, replaced by a fail-loud throw', () => {
  // 2026-06-09: the Priority-3 pAIchart Universal Template path was deleted as confirmed-dead — unreachable
  // because the null-template guard throws first AND promptTemplate is schema-non-nullable (0/24 prod empty),
  // so Priority 1 always fires. The else now throws loudly instead of silently resurrecting a deprecated template.
  if (engineSource.includes('Using pAIchart Universal Template')) {
    throw new Error('Priority 3 debug log still present — the dead Universal Template branch was supposed to be removed');
  }
  if (engineSource.includes('resolvePAIchartUniversalTemplate')) {
    throw new Error('resolvePAIchartUniversalTemplate still present — should be deleted (its only caller was Priority 3)');
  }
  // the else branch must FAIL LOUD (not silently fall through / use a default)
  if (!/else \{\s*throw new Error\(\s*[`'"]buildSystemPrompt: unreachable no-template path/.test(engineSource)) {
    throw new Error('buildSystemPrompt Priority-3 else is missing the fail-loud throw');
  }
});

// ========================================
// Stream-route guard — app/api/pov/agent/execute/stream/route.ts
// ========================================

console.log('\n--- Stream path: stream/route.ts ---\n');

test('S1: NoTemplateAssignedError is imported from @/lib/errors', () => {
  expect(streamSource).toMatch(
    /import\s*\{[^}]*NoTemplateAssignedError[^}]*\}\s*from\s*['"]@\/lib\/errors['"]/
  );
});

test('S2: pre-branch guard checks BOTH !storedSystemPrompt AND !task.agentTemplate', () => {
  // Looser than engine — intentional. Stream route preserves Priority 2
  // (user-configured stored prompt). See §6.2 and §6.5 documentation.
  expect(streamSource).toMatch(
    /if\s*\(\s*!\s*storedSystemPrompt\s*&&\s*!\s*task\.agentTemplate\s*\)/
  );
});

test('S3: guard throws NoTemplateAssignedError (typed error for SSE error.code)', () => {
  expect(streamSource).toMatch(
    /if\s*\(\s*!\s*storedSystemPrompt\s*&&\s*!\s*task\.agentTemplate\s*\)\s*\{[\s\S]*?throw\s+new\s+NoTemplateAssignedError/
  );
});

test('S4: guard sits BEFORE the three-branch prompt resolution', () => {
  const storedComputeIdx = streamSource.indexOf('const storedSystemPrompt = task.metadata');
  const guardIdx = streamSource.indexOf('throw new NoTemplateAssignedError');
  const branchIdx = streamSource.indexOf(
    'if (storedSystemPrompt && (task.metadata as any).modelParameters?.useSystemPrompt !== false)'
  );
  if (storedComputeIdx < 0 || guardIdx < 0 || branchIdx < 0) {
    throw new Error('Could not locate storedSystemPrompt compute, guard, or branching');
  }
  if (guardIdx < storedComputeIdx) {
    throw new Error('Guard cannot precede storedSystemPrompt computation');
  }
  if (guardIdx > branchIdx) {
    throw new Error('Guard must come BEFORE the three-branch resolution');
  }
});

test('S5: SSE error emission uses actual error.message (not hardcoded "Agent execution failed")', () => {
  // boundary-contract CRITICAL #1: GUI sseUtils.processSSEStream expects
  // `{type: 'error', error: {message, code?}}`. A hardcoded message
  // silently swallows NoTemplateAssignedError's specific text.
  expect(streamSource).toMatch(
    /error:\s*\{\s*message:\s*errMessage,\s*code:\s*errCode\s*\}/
  );
});

test('S6: SSE error shape preserves existing {type: "error"} discriminator', () => {
  // GUI consumer at lib/pov/api/agent-service.ts:701 switches on
  // event.data.type === 'error' — flat shapes bypass this handler.
  expect(streamSource).toMatch(/type:\s*'error'/);
});

test('S7: error.json artifact also uses actual error.message (dual-path parity)', () => {
  // §6.6: the error.json written for the outer catch must carry the extracted
  // message + typed error.code — not a hardcoded 'Agent execution failed'.
  // Phase 4b: the error.json write moved into the shared terminal-persist core
  // (ONE buildErrorJson shape for both paths); the stream feeds it the extracted
  // errMessage/errCode via persistTerminalFailure.
  expect(streamSource).toMatch(/errorMessage:\s*errMessage/);
  expect(streamSource).toMatch(/errorCode:\s*errCode/);
  const persistCoreSource = fs.readFileSync(
    path.join(REPO_ROOT, 'lib/services/execution-terminal-persist.ts'),
    'utf-8'
  );
  expect(persistCoreSource).toMatch(/error:\s*input\.errorMessage/);
  expect(persistCoreSource).toMatch(/errorCategory:\s*input\.errorCode/);
});

test('S8: error-message helper extracted once (not duplicated across sites)', () => {
  // Single source of truth for the extracted error message + code.
  const matches = streamSource.match(/const\s+errMessage\s*=/g) || [];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 'const errMessage =' declaration, found ${matches.length}`);
  }
});

test('S9: intentional engine-vs-stream parity gap is documented', () => {
  // boundary-contract B7: the stream guard is LOOSER than the engine guard
  // (stream accepts custom system prompts; engine doesn't). This is
  // intentional and must be documented so future readers don't "harmonize"
  // the guards by accident.
  expect(streamSource).toContain('LOOSER than');
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=====================================');

if (failed > 0) {
  process.exit(1);
}
