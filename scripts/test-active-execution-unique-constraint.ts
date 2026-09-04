#!/usr/bin/env ts-node
/**
 * Active-Execution-Unique-Constraint Tests — Concern A L3
 *
 * Layer 1 pattern validation for the L3 partial UNIQUE index's supporting
 * code (the P2002 wrapper in agent-execution-create.ts, the 6 caller
 * catches, the ops script, and the schema annotation). Regression guard:
 * if anyone rewrites the wrapper or strips a catch, this test fails.
 *
 * Runtime T1-T8b (concurrent create race, terminal-state exclusion,
 * RUNNING conflict, planner choice, phantom P2002, message-body fallback)
 * require a local database and are validated separately (plan §5.E.1).
 *
 * Created: 2026-04-18
 * Plan: cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md §5
 * Reviews: database-manager (§5.C.2 P2002 matcher), boundary-contract (B3, B6),
 *          event-system (I1 reactorSource field), dev-ops (§5.B.1 script)
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🔒 Active-Execution-Unique-Constraint Tests (L3 pattern validation)\n');

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
const wrapperSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/agent-execution-create.ts'),
  'utf-8'
);
const agentTaskSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/agentTaskService.ts'),
  'utf-8'
);
const reactorSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/taskReadyReactorService.ts'),
  'utf-8'
);
const retriggerSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/pipelineRetriggerReactorService.ts'),
  'utf-8'
);
const streamSource = fs.readFileSync(
  path.join(REPO_ROOT, 'app/api/pov/agent/execute/stream/route.ts'),
  'utf-8'
);
const restSource = fs.readFileSync(
  path.join(REPO_ROOT, 'app/api/tasks/[taskId]/agent/execute/route.ts'),
  'utf-8'
);
const counterSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/services/reactor-skip-counter.ts'),
  'utf-8'
);
const scriptSource = fs.readFileSync(
  path.join(REPO_ROOT, 'scripts/create-agent-execution-active-unique-index.sh'),
  'utf-8'
);
const schemaSource = fs.readFileSync(path.join(REPO_ROOT, 'prisma/schema.prisma'), 'utf-8');

// ========================================
// E: Typed error class
// ========================================

console.log('--- E: DuplicateActiveExecutionError class ---\n');

test('E1: DuplicateActiveExecutionError exported from lib/errors.ts', () => {
  expect(errorsSource).toMatch(/export\s+class\s+DuplicateActiveExecutionError\s+extends\s+AppError/);
});

test('E2: code = DUPLICATE_ACTIVE_EXECUTION', () => {
  expect(errorsSource).toContain("'DUPLICATE_ACTIVE_EXECUTION'");
});

test('E3: constructor accepts taskId + optional existingExecutionId', () => {
  expect(errorsSource).toMatch(
    /constructor\([\s\S]*?public\s+readonly\s+taskId:\s*string,[\s\S]*?public\s+readonly\s+existingExecutionId\?:\s*string[\s\S]*?\)/
  );
});

// ========================================
// W: agent-execution-create.ts wrapper
// ========================================

console.log('\n--- W: createAgentExecution wrapper ---\n');

test('W1: imports DuplicateActiveExecutionError from @/lib/errors', () => {
  expect(wrapperSource).toMatch(/import\s*\{[^}]*DuplicateActiveExecutionError[^}]*\}\s*from\s*['"]@\/lib\/errors['"]/);
});

test('W2: prisma.agentExecution.create is wrapped in try/catch', () => {
  // Target the ACTUAL invocation (`await prisma.agentExecution.create(`)
  // not the docstring references that mention the call for documentation.
  const createIdx = wrapperSource.indexOf('await prisma.agentExecution.create(');
  if (createIdx < 0) throw new Error('create invocation not found');
  const tryIdx = wrapperSource.lastIndexOf('try {', createIdx);
  if (tryIdx < 0 || createIdx - tryIdx > 500) {
    throw new Error('create is not inside a try block');
  }
  // And there must be a catch clause containing the P2002 branch logic
  // within 3000 chars after the create — proves the try/catch actually
  // handles duplicates, not just any try (e.g., for transaction rollback).
  const catchIdx = wrapperSource.indexOf('} catch (err)', createIdx);
  if (catchIdx < 0 || catchIdx - createIdx > 3000) {
    throw new Error('create has no nearby catch for DuplicateActiveExecutionError');
  }
});

test('W3: P2002 matcher has array-target arm', () => {
  expect(wrapperSource).toMatch(
    /Array\.isArray\(prismaErr\.meta\?\.target\)\s*&&\s*prismaErr\.meta\.target\.includes\(['"]taskId['"]\)/
  );
});

test('W4: P2002 matcher has string-target arm', () => {
  expect(wrapperSource).toMatch(
    /typeof\s+prismaErr\.meta\?\.target\s*===\s*['"]string['"][\s\S]*?includes\(['"]active_per_task['"]\)/
  );
});

test('W5: P2002 matcher has message-body fallback arm (boundary-contract B3)', () => {
  expect(wrapperSource).toMatch(
    /err\s+instanceof\s+Error\s*&&\s*err\.message\.includes\(['"]active_per_task['"]\)/
  );
});

test('W6: phantom-P2002 sanity check (DUPLICATE_ACTIVE_EXECUTION_PHANTOM log)', () => {
  expect(wrapperSource).toContain("'DUPLICATE_ACTIVE_EXECUTION_PHANTOM'");
  expect(wrapperSource).toMatch(/if\s*\(\s*!existing\s*\)/);
});

test('W7: monitoring hook — stable errorCode label before throw', () => {
  // §5.F.6 greps for 'errorCode":"DUPLICATE_ACTIVE_EXECUTION"' — label must be present.
  expect(wrapperSource).toMatch(/errorCode:\s*['"]DUPLICATE_ACTIVE_EXECUTION['"]/);
});

test('W8: uses validatedTriggeredBy.source (not args.source — boundary-contract B6)', () => {
  // Plan draft had `args.source` which doesn't exist; must use validatedTriggeredBy.source
  // (post-Zod, required field) or args.triggeredBy.source.
  expect(wrapperSource).toNotContain('args.source');
  expect(wrapperSource).toMatch(/validatedTriggeredBy\.source|args\.triggeredBy\.source/);
});

test('W9: throws DuplicateActiveExecutionError with existingExecutionId', () => {
  expect(wrapperSource).toMatch(
    /throw\s+new\s+DuplicateActiveExecutionError\(args\.taskId,\s*existing\.id\)/
  );
});

// ========================================
// C: Six caller catches
// ========================================

console.log('\n--- C: 6 callers handle DuplicateActiveExecutionError ---\n');

test('C1: agentTaskService.ts — MCP path throws ApiError(DUPLICATE_RECORD)', () => {
  expect(agentTaskSource).toMatch(/instanceof\s+DuplicateActiveExecutionError/);
  expect(agentTaskSource).toMatch(/ApiError\(\s*ErrorCode\.DUPLICATE_RECORD/);
});

test('C2: taskReadyReactorService.ts — dep-completion catch with reactorSource label', () => {
  expect(reactorSource).toContain("'task-ready-depcompletion'");
  expect(reactorSource).toMatch(/instanceof\s+DuplicateActiveExecutionError/);
});

test('C3: taskReadyReactorService.ts — dep-free catch with reactorSource label', () => {
  expect(reactorSource).toContain("'task-ready-depfree'");
});

test('C4: pipelineRetriggerReactorService.ts — retrigger catch with reactorSource label', () => {
  expect(retriggerSource).toContain("'pipeline-retrigger'");
  expect(retriggerSource).toMatch(/instanceof\s+DuplicateActiveExecutionError/);
});

test('C5: stream/route.ts — pre-stream HTTP 409 Response (writer not in scope)', () => {
  // boundary-contract CRITICAL #2: createAgentExecution is called BEFORE the
  // IIFE where writer is defined, so the catch must return a Response(409)
  // not attempt to write to the SSE stream.
  expect(streamSource).toMatch(/instanceof\s+DuplicateActiveExecutionError/);
  expect(streamSource).toMatch(/new\s+Response\(\s*JSON\.stringify\([\s\S]*?status:\s*409/);
});

test('C6: [taskId]/agent/execute/route.ts — uses createHandler return shape (not NextResponse.json)', () => {
  // boundary-contract CRITICAL #3: this file is wrapped by createHandler which
  // expects return-value of {error:{message,code}}. Never INVOKE NextResponse.json
  // (mentions in comments are fine; an actual call is not).
  expect(restSource).toMatch(/instanceof\s+DuplicateActiveExecutionError/);
  if (/return\s+NextResponse\.json\s*\(/.test(restSource)) {
    throw new Error('Found actual `return NextResponse.json(...)` invocation — should use createHandler return shape');
  }
});

test('C7: [taskId] REST route — existing ALREADY_RUNNING sites migrated to canonical code', () => {
  // boundary-contract CRITICAL #3 follow-up: both existing duplicate-
  // detection sites on this file (line 151, 234) must use the canonical
  // DUPLICATE_ACTIVE_EXECUTION code so the surface has a single code, not two.
  // Mentions in explanatory comments are fine; actual `code: 'ALREADY_RUNNING'`
  // emissions are not.
  if (/code:\s*['"]ALREADY_RUNNING['"]/.test(restSource)) {
    throw new Error('Found actual `code: "ALREADY_RUNNING"` emission — should be DUPLICATE_ACTIVE_EXECUTION');
  }
});

// ========================================
// R: Reactor-skip-counter helper
// ========================================

console.log('\n--- R: reactor-skip-counter (event-system I2) ---\n');

test('R1: helper file exports logReactorDuplicateSkip', () => {
  expect(counterSource).toMatch(/export\s+function\s+logReactorDuplicateSkip/);
});

test('R2: escalates at count===1 (first skip per source)', () => {
  expect(counterSource).toContain('state.count === 1');
});

test('R3: escalates every 100th skip', () => {
  expect(counterSource).toMatch(/state\.count\s*%\s*ESCALATE_EVERY\s*===\s*0|state\.count\s*%\s*100\s*===\s*0/);
});

test('R4: escalates hourly via lastInfoAt timestamp', () => {
  expect(counterSource).toContain('lastInfoAt');
  expect(counterSource).toMatch(/ESCALATE_HOURLY_MS|60\s*\*\s*60\s*\*\s*1000/);
});

test('R5: embeds stable errorCode label for log queries', () => {
  expect(counterSource).toContain("'DUPLICATE_ACTIVE_EXECUTION'");
});

// ========================================
// S: Schema annotation + ops script
// ========================================

console.log('\n--- S: schema.prisma + ops script ---\n');

test('S1: schema.prisma AgentExecution model documents the raw-SQL partial unique', () => {
  expect(schemaSource).toContain('idx_agent_executions_active_per_task');
  expect(schemaSource).toContain('scripts/create-agent-execution-active-unique-index.sh');
});

test('S2: ops script has ON_ERROR_STOP=1 (dev-ops 3.a)', () => {
  expect(scriptSource).toContain('ON_ERROR_STOP=1');
});

test('S3: ops script has automated duplicate pre-check (dev-ops 3.b)', () => {
  expect(scriptSource).toContain("HAVING COUNT(*) > 1");
  expect(scriptSource).toMatch(/if\s*\[\s*"\$DUPE_COUNT"\s*!=\s*"0"\s*\]/);
});

test('S4: ops script has INVALID-index cleanup (dev-ops 3.c)', () => {
  expect(scriptSource).toContain('indisvalid');
  expect(scriptSource).toContain('DROP INDEX CONCURRENTLY');
});

test('S5: ops script has post-create verification (indisvalid + WHERE clause)', () => {
  // dev-ops 3.d + event-system N1: catch the catastrophic case where a
  // non-partial unique index gets created (would block all re-executions).
  expect(scriptSource).toMatch(/WHERE\s*\\\(status\s*=\s*ANY/);
  expect(scriptSource).toContain('indisvalid');
});

test('S6: WHERE clause of the SQL does not include phantom CANCELLED/TIMEOUT statuses', () => {
  // Actual statuses on this table: PENDING/SCHEDULED/RUNNING/SUCCESS/FAILED only.
  // Documentation mentioning "CANCELLED/TIMEOUT do not exist on this table"
  // is useful for future maintainers; the CONSTRAINT predicate must not
  // include those phantom values. Check only the active-set WHERE clause.
  const whereMatch = scriptSource.match(/WHERE\s+status\s+IN\s+\([^)]*\)/i);
  if (!whereMatch) throw new Error('WHERE clause not found in script');
  const whereClause = whereMatch[0];
  if (whereClause.includes('CANCELLED') || whereClause.includes('TIMEOUT')) {
    throw new Error(`WHERE clause includes phantom statuses: ${whereClause}`);
  }
});

test('S7: ops script creates the correct SQL (partial UNIQUE on taskId WHERE active)', () => {
  expect(scriptSource).toMatch(
    /CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_agent_executions_active_per_task[\s\S]*?WHERE\s+status\s+IN\s+\(['"]PENDING['"],\s*['"]RUNNING['"]\)/
  );
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
