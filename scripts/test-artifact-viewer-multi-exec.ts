#!/usr/bin/env ts-node
/**
 * ArtifactViewer Multi-Execution Tests — Option B
 *
 * Layer-1 pattern validation for the ArtifactViewer rewrite that surfaces
 * artifacts from ALL executions for a task, not just the latest denormalized
 * on task.outputArtifacts.
 *
 * Regression guards against:
 *   - Reintroducing the single-executionId model
 *   - Dropping the execution-grouped subheaders
 *   - Dropping the "Execution:" / "Exec status:" lines from the detail panel
 *   - Dropping the per-execution empty state
 *
 * Created: 2026-04-20
 * Context: Steve reported seeing only 1 pipeline-index.json on a harness
 *   task that actually has 3 executions (2 from the 2026-04-16 assign×execute
 *   race + 1 budget-exhausted retry). Option B flattens all 3 into the
 *   Agents → Artifacts view, grouped by execution with self-identifying
 *   detail lines.
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('📜 ArtifactViewer Multi-Execution Tests (Option B pattern validation)\n');

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
const source = fs.readFileSync(
  path.join(REPO_ROOT, 'components/poveditor/pov/components/ArtifactViewer.tsx'),
  'utf-8'
);

// ========================================
// A: Multi-execution fetch
// ========================================

console.log('--- A: Multi-execution fetch ---\n');

test('A1: fetches /api/agent-executions for all executions of the task', () => {
  expect(source).toMatch(/\/api\/agent-executions\?taskId=\$\{encodeURIComponent\(task\.id\)\}/);
});

test('A2: uses Promise.all to fetch artifacts per execution in parallel', () => {
  expect(source).toMatch(/Promise\.all\(\s*execs\.map/);
});

test('A3: flattens into an ArtifactWithExecution[] carrying executionId + executionStatus', () => {
  expect(source).toMatch(/ArtifactWithExecution\[\]/);
  expect(source).toMatch(/executionId:\s*e\.id/);
  expect(source).toMatch(/executionStatus:\s*e\.status/);
});

test('A4: state shape includes executions + allArtifacts (not task.outputArtifacts)', () => {
  expect(source).toMatch(/useState<ExecutionRowLite\[\]>\(/);
  expect(source).toMatch(/useState<ArtifactWithExecution\[\]>\(/);
});

test('A5: does NOT fall back to legacy task.outputArtifacts-based fetch loop', () => {
  // The old code watched task.executionStatus === 'SUCCESS' and set isLoading
  // inside a needsFetch branch. That pattern was single-execution only and
  // has been replaced by the multi-exec fetch.
  if (/task\.executionStatus\s*===\s*'SUCCESS'\s*&&\s*executionId/.test(source)) {
    throw new Error('Legacy single-execution needsFetch branch still present');
  }
});

test('A6: does NOT extract executionId from task.agentLog regex patterns', () => {
  // The old code had 4 regex patterns to extract executionId from agentLog.
  // The new flow fetches executions directly from the API instead.
  if (/Execution started with ID:\s*\(\[a-zA-Z0-9-\]\+\)/.test(source)) {
    throw new Error('Legacy agentLog regex extraction still present');
  }
});

// ========================================
// L: List panel (grouped by execution)
// ========================================

console.log('\n--- L: List panel grouped by execution ---\n');

test('L1: list panel shows per-execution subheaders (exec:... prefix)', () => {
  expect(source).toContain("exec:");
});

test('L2: subheader displays execution status with color', () => {
  // Status mapping: SUCCESS green, FAILED red, RUNNING amber
  expect(source).toMatch(/exec\.status\s*===\s*['"]SUCCESS['"]/);
  expect(source).toMatch(/exec\.status\s*===\s*['"]FAILED['"]/);
});

test('L3: subheader displays execution startTime via formatDate', () => {
  // `exec.startTime` and `formatDate(exec.startTime)` appear across JSX
  // lines — use [\s\S] to span newlines.
  expect(source).toMatch(/exec\.startTime[\s\S]{0,200}formatDate\(exec\.startTime\)/);
});

test('L4: per-execution empty-state message when that execution has no artifacts', () => {
  expect(source).toContain('No artifacts for this execution');
});

test('L5: overall empty-state message when no executions at all', () => {
  expect(source).toContain('No executions found for this task');
});

test('L6: list scroll container (max-h) to handle many executions', () => {
  expect(source).toMatch(/max-h-\[\d+px\]\s+overflow-y-auto/);
});

test('L7: header shows "across N executions" when >1', () => {
  expect(source).toMatch(/executions\.length\s*>\s*1/);
  expect(source).toContain('across');
});

// ========================================
// D: Detail panel (self-identifying artifact)
// ========================================

console.log('\n--- D: Detail panel Execution + Exec status lines ---\n');

test('D1: detail panel renders Execution: line with mono-formatted id', () => {
  // Label + mono span + executionId interpolation span multiple JSX lines.
  expect(source).toMatch(/Execution:[\s\S]{0,200}font-mono[\s\S]{0,100}selectedArtifact\.executionId/);
});

test('D2: detail panel renders Exec status: line', () => {
  expect(source).toContain('Exec status:');
});

test('D3: SUCCESS exec status renders in green', () => {
  expect(source).toMatch(/executionStatus\s*===\s*['"]SUCCESS['"][\s\S]{0,100}text-green-400/);
});

test('D4: FAILED exec status renders in red', () => {
  expect(source).toMatch(/executionStatus\s*===\s*['"]FAILED['"][\s\S]{0,100}text-red-400/);
});

test('D5: Execution + Exec status lines only render when executionId present', () => {
  // Defensive — if an artifact somehow lacks executionId (shouldn't, but), the
  // lines gate on the field's presence.
  expect(source).toMatch(/selectedArtifact\.executionId\s*&&/);
});

test('D6: Mode line extracts from content.protocolValidation.mode (harness only)', () => {
  // 2026-04-20 addition: surface harness mode (CREATE / ORCHESTRATE / SYNTHESIZE)
  // from the parsed pipeline-index.json content. Must use try/catch so
  // non-JSON content (report.md) doesn't throw.
  expect(source).toContain('selectedArtifactMode');
  expect(source).toMatch(/protocolValidation\?\.mode/);
  expect(source).toMatch(/JSON\.parse\(selectedArtifact\.content\)/);
  // Must be gracefully omitted for non-harness artifacts (no mode)
  expect(source).toMatch(/selectedArtifactMode\s*&&/);
});

test('D7: Mode line appears BETWEEN Created and Execution (correct order)', () => {
  // Layout requirement from Steve: Created → Mode → Execution → Exec status
  const createdIdx = source.indexOf('Created:');
  const modeIdx = source.indexOf('Mode:');
  const executionIdx = source.indexOf('Execution:');
  if (createdIdx < 0 || modeIdx < 0 || executionIdx < 0) {
    throw new Error('One of Created:/Mode:/Execution: labels not found');
  }
  if (!(createdIdx < modeIdx && modeIdx < executionIdx)) {
    throw new Error(
      `Detail panel label order wrong. Expected Created < Mode < Execution, got ${createdIdx}/${modeIdx}/${executionIdx}`
    );
  }
});

// ========================================
// E: Execution-retention limits (the SHARED execution-retention.ts module — Flip 2 Increment 2)
// ========================================
// Raising the in-tx retention cap matters for the ArtifactViewer UX (prevents the "where did the
// older pipeline run go?" surprise). The prune budget moved from inline constants in the
// terminal-persist core to the shared status-aware execution-retention module
// (PRUNE_ON_COMPLETE_RETENTION = the in-tx cap; RM_DAILY_RETENTION = the daily settle).

console.log('\n--- E: Execution-retention limits ---\n');

const retentionSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/execution-retention.ts'),
  'utf-8'
);

test('E1: PRUNE_ON_COMPLETE_RETENTION.maxSuccess is ≥ 10 (supports iterative harness + retries)', () => {
  const m = retentionSource.match(/PRUNE_ON_COMPLETE_RETENTION[^=]*=\s*\{[^}]*maxSuccess:\s*(\d+)/);
  if (!m) throw new Error('PRUNE_ON_COMPLETE_RETENTION.maxSuccess not found');
  const val = parseInt(m[1], 10);
  if (val < 10) {
    throw new Error(`PRUNE_ON_COMPLETE_RETENTION.maxSuccess = ${val}; should be ≥ 10 post 2026-04-20`);
  }
});

test('E2: PRUNE_ON_COMPLETE_RETENTION maxFailed matches maxSuccess', () => {
  const s = retentionSource.match(/PRUNE_ON_COMPLETE_RETENTION[^=]*=\s*\{[^}]*maxSuccess:\s*(\d+)/);
  const f = retentionSource.match(/PRUNE_ON_COMPLETE_RETENTION[^=]*=\s*\{[^}]*maxFailed:\s*(\d+)/);
  if (!s || !f) throw new Error('PRUNE_ON_COMPLETE_RETENTION budgets not found');
  if (s[1] !== f[1]) {
    throw new Error(`caps should match: success=${s[1]}, failed=${f[1]}`);
  }
});

// ========================================
// P: Canonical default-selection preference (#2 — 2026-04-20)
// ========================================

console.log('\n--- P: Canonical artifact preference ---\n');

test('P1: pickCanonicalArtifact helper exists', () => {
  expect(source).toContain('function pickCanonicalArtifact');
});

test('P2: preference order SYNTHESIZE > CREATE > SUCCESS > newest', () => {
  // Check all four fallback stages are present in pickCanonicalArtifact
  const helperMatch = source.match(/function pickCanonicalArtifact[\s\S]{0,2000}\n\s*\}/);
  if (!helperMatch) throw new Error('pickCanonicalArtifact body not locatable');
  const body = helperMatch[0];
  if (!/x\.mode\s*===\s*'SYNTHESIZE'\s*&&\s*x\.artifact\.executionStatus\s*===\s*'SUCCESS'/.test(body)) {
    throw new Error('Preference stage 1 (SYNTHESIZE + SUCCESS) not in helper');
  }
  if (!/x\.mode\s*===\s*'CREATE'\s*&&\s*x\.artifact\.executionStatus\s*===\s*'SUCCESS'/.test(body)) {
    throw new Error('Preference stage 2 (CREATE + SUCCESS) not in helper');
  }
  if (!/x\.artifact\.executionStatus\s*===\s*'SUCCESS'/.test(body)) {
    throw new Error('Preference stage 3 (any SUCCESS) not in helper');
  }
  if (!/artifacts\[0\]/.test(body)) {
    throw new Error('Preference stage 4 (fallback to newest) not in helper');
  }
});

test('P3: helper parses content.protocolValidation.mode per artifact', () => {
  expect(source).toMatch(/JSON\.parse\(a\.content\)[\s\S]{0,200}protocolValidation\?\.mode/);
});

test('P4: default-select calls pickCanonicalArtifact (not just flat[0])', () => {
  expect(source).toMatch(/setSelectedArtifactId\(\(prev\)\s*=>\s*prev\s*\?\?\s*pickCanonicalArtifact\(flat\)\.id\)/);
});

// ========================================
// C: Compatibility (Option B doesn't break existing download/copy/icons)
// ========================================

console.log('\n--- C: Compatibility with existing helpers ---\n');

test('C1: download path still uses AgentService.downloadArtifact with executionId', () => {
  expect(source).toMatch(/AgentService\.downloadArtifact\(executionId/);
});

test('C2: copy still functional', () => {
  expect(source).toMatch(/handleCopy/);
});

test('C3: icon helper still referenced per artifact', () => {
  expect(source).toMatch(/getArtifactIcon\(artifact\.type,\s*artifact\.name\)/);
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
