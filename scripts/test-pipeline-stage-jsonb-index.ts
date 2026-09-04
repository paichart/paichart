#!/usr/bin/env ts-node
/**
 * Pipeline-Stage JSONB Index Tests — A6
 *
 * Layer 1 pattern validation for the A6 partial JSONB expression index
 * and its supporting code (ops script, schema annotation). Regression guard:
 * if anyone weakens the script (removes hardening) or strips the partial
 * predicate from the SQL, this test fails.
 *
 * Runtime validation (EXPLAIN shows index use) is Phase 1.8 on prod — not
 * pattern-testable here because the planner's decision depends on table
 * statistics and the 358-row current size may not trigger index use in
 * EXPLAIN output (acceptable per dev-ops N-2).
 *
 * Created: 2026-04-18
 * Plan: cline_docs/reviews/pipeline-context-a6-2026-04-18/implementation-plan.md §Phase 1
 * Reviews: database-manager (97%), dev-ops (96%), arch-review synthesis (95.5%)
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🔎 Pipeline-Stage JSONB Index Tests (A6 pattern validation)\n');

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

const scriptSource = fs.readFileSync(
  path.join(REPO_ROOT, 'scripts/create-tasks-pipeline-stage-jsonb-index.sh'),
  'utf-8'
);
const schemaSource = fs.readFileSync(path.join(REPO_ROOT, 'prisma/schema.prisma'), 'utf-8');
const retriggerSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/pipelineRetriggerReactorService.ts'),
  'utf-8'
);
const configBuilderSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/agentExecutionConfigBuilder.ts'),
  'utf-8'
);

// ========================================
// S: Ops script
// ========================================

console.log('--- S: Ops script hardening ---\n');

test('S1: script has set -euo pipefail', () => {
  expect(scriptSource).toContain('set -euo pipefail');
});

test('S2: script has ON_ERROR_STOP=1 on psql calls', () => {
  expect(scriptSource).toContain('ON_ERROR_STOP=1');
});

test('S3: script requires DATABASE_URL', () => {
  expect(scriptSource).toMatch(/if\s*\[\s*-z\s*"\$\{DATABASE_URL:?-?\}?"\s*\]/);
});

test('S4: INVALID-index cleanup block present (prior failed CONCURRENTLY recovery)', () => {
  expect(scriptSource).toContain('indisvalid');
  expect(scriptSource).toContain('DROP INDEX CONCURRENTLY IF EXISTS idx_tasks_pipeline_stage_id');
});

test('S5: CREATE INDEX CONCURRENTLY with correct partial predicate', () => {
  expect(scriptSource).toMatch(
    /CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_tasks_pipeline_stage_id[\s\S]*?ON\s+tasks\s*\(\(metadata->>'pipelineStageId'\)\)[\s\S]*?WHERE\s+type\s*=\s*'PIPELINE'/
  );
});

test('S6 — B1 CRITICAL: post-create awk predicate checks WHERE (type = ...) literal', () => {
  // B1: wrong regex `/WHERE \(status = ANY/` (copied from L3) would silently
  // pass verification on a non-partial JSONB extraction index. The script
  // comment documents the L3 regex as "what NOT to use" — so we can't assert
  // its absence globally. Instead, extract the AWK block specifically and
  // confirm the active regex is the A6-correct one.
  const awkBlockMatch = scriptSource.match(/awk -F'\|'\s*'[\s\S]*?'/);
  if (!awkBlockMatch) throw new Error('Could not locate AWK verification block');
  const awkBlock = awkBlockMatch[0];
  // The AWK block's regex must check /WHERE \(type = / ...
  if (!/\$3\s*!~\s*\/WHERE\s*\\\(type\s*=\s*\//.test(awkBlock)) {
    throw new Error(`AWK block missing correct A6 regex. Block: ${awkBlock}`);
  }
  // ... and NOT the L3 regex
  if (/\$3\s*!~\s*\/WHERE\s*\\\(status\s*=\s*ANY/.test(awkBlock)) {
    throw new Error('AWK block still uses the L3 /WHERE \\(status = ANY/ regex — catastrophic if copied blindly');
  }
});

test('S7 — A4: informational stats log is present (replaces removed pre-check)', () => {
  expect(scriptSource).toContain('Baseline stats');
  expect(scriptSource).toContain('pipeline_rows');
  expect(scriptSource).toContain('pg_size_pretty');
});

test('S8 — O3: ANALYZE tasks post-create (planner stats refresh)', () => {
  expect(scriptSource).toContain('ANALYZE tasks');
});

test('S9: no duplicate pre-check (A6 is non-unique — duplicates are legal)', () => {
  // L3 had a duplicate pre-check for its UNIQUE constraint. A6 must NOT have one.
  expect(scriptSource).toNotContain('duplicate active executions');
});

// ========================================
// D: Schema doc annotation
// ========================================

console.log('\n--- D: Schema annotation ---\n');

test('D1: Task model in schema.prisma documents the raw-SQL partial index', () => {
  expect(schemaSource).toContain('idx_tasks_pipeline_stage_id');
  expect(schemaSource).toContain('scripts/create-tasks-pipeline-stage-jsonb-index.sh');
});

test('D2: annotation references the sanctioned db-push exception pattern', () => {
  expect(schemaSource).toContain('database-drift-elimination-pattern.md');
});

// ========================================
// Q: Reactor queries still include the literal partial predicate
// ========================================
// Database-manager's 3% hold: if a future Prisma refactor drops the literal
// `AND type = 'PIPELINE'` from the reactor queries, the partial-predicate
// match breaks silently and the queries revert to seq-scan. Grep-guard here.

console.log('\n--- Q: Reactor query literal-predicate preservation ---\n');

test('Q1: pipelineRetriggerReactorService.ts:111 query includes type = \'PIPELINE\' literal', () => {
  // The $queryRaw at line 111 must keep `t.type = 'PIPELINE'` literal so
  // Postgres's planner can match the partial-index predicate.
  expect(retriggerSource).toMatch(/t\.type\s*=\s*'PIPELINE'/);
});

test('Q2: agentExecutionConfigBuilder.ts:190 query includes type = \'PIPELINE\' literal', () => {
  expect(configBuilderSource).toMatch(/t\.type\s*=\s*'PIPELINE'/);
});

test('Q3: reactor queries use the metadata->>pipelineStageId JSONB extraction', () => {
  // Both queries extract pipelineStageId via ->>. If the extraction path
  // changes (e.g. ->'pipelineStageId' returning jsonb), the index type
  // mismatches and the planner won't use it.
  expect(retriggerSource).toMatch(/metadata->>'pipelineStageId'/);
  expect(configBuilderSource).toMatch(/metadata->>'pipelineStageId'/);
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
