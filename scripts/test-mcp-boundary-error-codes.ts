#!/usr/bin/env ts-node
/**
 * MCP Boundary Error.code Preservation — Regression Test
 *
 * Layer 1 pattern test that locks in the typed-error discriminator
 * preservation across both MCP boundaries:
 *
 *   1. HTTP boundary (`app/api/mcp/tasks/action/route.ts`)
 *   2. stdio MCP tool boundary (`lib/mcp/server/tools/advanced/task-action-handler.js`)
 *
 * Pre-fix behavior: every `AppError` subclass thrown from a handler was
 * flattened to `code: 'INTERNAL_ERROR'` at the HTTP boundary, and the MCP
 * tool boundary read only `error.message` (never `error.code`). MCP clients
 * (ChatGPT, Claude Desktop, Gemini) had no way to discriminate between
 * `DUPLICATE_ACTIVE_EXECUTION`, `PIPELINE_STAGE_MISMATCH`,
 * `NO_TEMPLATE_ASSIGNED`, etc. without parsing message strings.
 *
 * Post-fix: both boundaries surface `error.code` to the client. This test
 * fails if either preservation path is removed.
 *
 * Created: 2026-04-25
 * Plan: cline_docs/reviews/harness-clobber-detection-2026-04-25/implementation-plan.md §Item 3g
 * Reviews: boundary-contract (96%)
 *
 * CI behavior: pure source-read (no DB needed). Always runs.
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 MCP Boundary Error.code Preservation Test (Item 3g)\n');

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

function expect(value: any) {
  return {
    toMatch(re: RegExp) {
      if (typeof value !== 'string' || !re.test(value)) {
        throw new Error(`Expected source to match ${re}`);
      }
    },
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected source to contain "${substring}"`);
      }
    },
  };
}

const HTTP_ROUTE_PATH = path.resolve(
  __dirname,
  '../app/api/mcp/tasks/action/route.ts'
);
const TOOL_HANDLER_PATH = path.resolve(
  __dirname,
  '../lib/mcp/server/tools/advanced/task-action-handler.js'
);
const ERRORS_PATH = path.resolve(__dirname, '../lib/errors.ts');

const httpSource = fs.readFileSync(HTTP_ROUTE_PATH, 'utf-8');
const toolSource = fs.readFileSync(TOOL_HANDLER_PATH, 'utf-8');
const errorsSource = fs.readFileSync(ERRORS_PATH, 'utf-8');

// ============================================================================
// errors.ts — typed error contract (foundation)
// ============================================================================

test('errors.ts: PipelineStageMismatchError extends AppError', () => {
  expect(errorsSource).toMatch(
    /export\s+class\s+PipelineStageMismatchError\s+extends\s+AppError/
  );
});

test('errors.ts: PipelineStageMismatchError carries PIPELINE_STAGE_MISMATCH code', () => {
  expect(errorsSource).toContain("'PIPELINE_STAGE_MISMATCH'");
});

test("errors.ts: ErrorCode enum includes PIPELINE_STAGE_MISMATCH entry", () => {
  expect(errorsSource).toMatch(
    /PIPELINE_STAGE_MISMATCH:\s*['"]PIPELINE_STAGE_MISMATCH['"]/
  );
});

// ============================================================================
// HTTP boundary — app/api/mcp/tasks/action/route.ts
// ============================================================================

test('HTTP boundary: imports AppError + PipelineStageMismatchError', () => {
  expect(httpSource).toMatch(/import\s*\{[^}]*AppError[^}]*\}\s*from\s*['"]@\/lib\/errors['"]/);
  expect(httpSource).toMatch(/PipelineStageMismatchError/);
});

test('HTTP boundary: instanceof AppError check before generic catch', () => {
  // The check must:
  // 1. Use instanceof (not duck-typing)
  // 2. Return error.code (not flatten to INTERNAL_ERROR)
  expect(httpSource).toMatch(/if\s*\(\s*error\s+instanceof\s+AppError\s*\)/);
  expect(httpSource).toMatch(/code:\s*error\.code/);
});

test('HTTP boundary: tags securityEvent on PipelineStageMismatchError path', () => {
  // Option A polish from boundary-contract specialist: log-query parity
  // between the inner pre-throw warn (at task-complete-handler.ts) and
  // the boundary warn here.
  expect(httpSource).toMatch(/error\s+instanceof\s+PipelineStageMismatchError/);
  expect(httpSource).toMatch(/securityEvent:\s*true/);
});

test('HTTP boundary: generic INTERNAL_ERROR fallback still exists for non-AppError', () => {
  // Defensive: the new typed-error branch must NOT replace the generic
  // catch — it adds a branch BEFORE the existing fallback.
  expect(httpSource).toContain("code: 'INTERNAL_ERROR'");
});

// ============================================================================
// MCP tool boundary — task-action-handler.js
// ============================================================================

test('MCP tool boundary: extracts error.code into _meta.errorCode', () => {
  // Must use a defensive type guard (not just `error.code`) since `error`
  // could be a string, plain object, or non-Error throw.
  expect(toolSource).toMatch(
    /(['"]code['"]\s*in\s*error|error\.code\s*&&\s*typeof\s+error\.code\s*===\s*['"]string['"]|errorCode\s*=\s*error\s*&&\s*typeof\s+error\s*===\s*['"]object['"])/
  );
  // And must spread errorCode into _meta when present
  expect(toolSource).toMatch(/errorCode\s*\?\s*\{\s*errorCode\s*\}\s*:\s*\{\s*\}/);
});

test('MCP tool boundary: originalError still surfaces error.message (preserved)', () => {
  // Defensive: the new errorCode addition must not displace originalError
  // (existing consumers depend on it).
  expect(toolSource).toMatch(
    /originalError:\s*error\s+instanceof\s+Error\s*\?\s*error\.message\s*:\s*String\(error\)/
  );
});

// ============================================================================
// Cross-boundary contract documentation
// ============================================================================

test('Both boundaries reference the cline_docs review for context', () => {
  expect(httpSource).toContain('harness-clobber-detection-2026-04-25');
  expect(toolSource).toContain('harness-clobber-detection-2026-04-25');
});

// ============================================================================
// ASYNC surface — the un-swept sibling of everything above (2026-07-25)
// ============================================================================
//
// Everything above locks the SYNCHRONOUS path: an AppError thrown out of a handler keeps
// its `.code` across both MCP boundaries. That contract was never extended to the ASYNC
// path — a fire-and-forget execution that fails LATER has no throw to preserve, so its
// code has to be persisted and then projected by a read surface. Until 2026-07-25 it was
// neither: `agent.status` reported `progress` and `error`, two fields backed by columns
// that have never existed on agent_executions, and the real code sat unexposed in
// error.json. Panel: cline_docs/reviews/agent-error-code-surface-2026-07-25/.
//
// NOTE ON SCOPE: the WRITE-side shape (dispatch catch delegates to the shared persist,
// fireReactors:false, the ExecutionNotClaimableError guard staying ABOVE that call, and
// errorCode landing in the same statement as the terminal status flip) is pinned in
// scripts/test-failed-persist-cas.ts + scripts/test-terminal-persist-shape.ts, which
// already own those sites. Not duplicated here — this file owns the CLIENT-VISIBLE code.

const STATUS_HANDLER_PATH = path.resolve(
  __dirname, '../lib/mcp/tasks/action/handlers/agent/agent-status-handler.ts'
);
const RESULTS_HANDLER_PATH = path.resolve(
  __dirname, '../lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts'
);
const FORMATTERS_PATH = path.resolve(__dirname, '../lib/mcp/server/utils/formatters.js');

/**
 * Strip comments before asserting.
 *
 * Learned the hard way on 2026-07-25: a source-level pin cannot tell CODE from PROSE. A
 * pin added the same day failed against correct source because the explanatory comment
 * above the fix quoted the old call verbatim. Every assertion below that says "this code
 * is GONE" must run on stripped source, or the comment documenting its removal will
 * resurrect it.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')                       // block comments
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l))                  // whole-line // and jsdoc *
    .join('\n');
}

const statusSource = stripComments(fs.readFileSync(STATUS_HANDLER_PATH, 'utf-8'));
const resultsSource = stripComments(fs.readFileSync(RESULTS_HANDLER_PATH, 'utf-8'));
const formattersSource = stripComments(fs.readFileSync(FORMATTERS_PATH, 'utf-8'));

test('agent.status: no `any[]` execution buffer — the type erasure that enabled the phantom fields', () => {
  // THE root cause. `let executions: any[]` discards Prisma's inferred payload type, which
  // is the only reason exec.progress / exec.error ever compiled. Fixing the fields without
  // this leaves the next phantom field free to land identically.
  if (/let\s+executions\s*:\s*any\[\]/.test(statusSource)) {
    throw new Error('agent-status-handler re-declared executions as any[] — the phantom-field enabling condition is back');
  }
  expect(statusSource).toMatch(/satisfies\s+Prisma\.AgentExecutionSelect/);
  expect(statusSource).toMatch(/Prisma\.AgentExecutionGetPayload/);
});

test('agent.status: emits NO progress field (it was always 0 — a false fact on the polling surface)', () => {
  if (/^\s*progress\s*:/m.test(statusSource)) {
    throw new Error('agent.status emits a progress field again — it has no backing column, so it can only report a false 0');
  }
});

test('agent.status: emits NO error field (always undefined; the real code is errorCode)', () => {
  if (/^\s*error\s*:\s*exec\./m.test(statusSource)) {
    throw new Error('agent.status emits exec.error again — no such column');
  }
});

test('agent.status: projects and emits errorCode', () => {
  expect(statusSource).toMatch(/errorCode:\s*true/);          // in the select
  expect(statusSource).toMatch(/errorCode:\s*exec\.errorCode\s*\?\?\s*null/); // on the wire, null-not-placeholder
});

test('agent.status: does NOT join artifact content (this is the 10-30s poll path)', () => {
  if (/artifacts\s*:\s*\{/.test(statusSource)) {
    throw new Error('agent.status now joins artifacts — a content join on the hot polling path is the worst place for it (use agent.results)');
  }
});

test('agent.status: failed-path nextSteps no longer tells agents to review logs it does not return', () => {
  if (/Review logs for failure cause/.test(statusSource)) {
    throw new Error('the unactionable "Review logs for failure cause" instruction is back on a surface that returns no logs');
  }
});

test('agent.results: no `any[]`, and errorCategory is hoisted from the already-loaded error.json', () => {
  if (/let\s+executions\s*:\s*any\[\]/.test(resultsSource)) {
    throw new Error('agent-results-handler re-declared executions as any[] — same erasure, same latent class');
  }
  expect(resultsSource).toMatch(/satisfies\s+Prisma\.AgentExecutionSelect/);
  expect(resultsSource).toMatch(/a\.name === 'error\.json'/);
  expect(resultsSource).toMatch(/errorCategory\s*=\s*typeof\s+parsed\?\.errorCategory\s*===\s*'string'/);
});

test('agent.results: the four phantom reads stay dead', () => {
  for (const [field, re] of [
    ['exec.output', /exec\.output/],
    ['exec.metrics', /exec\.metrics/],
    ['exec.error', /exec\.error\b/],
    ['exec.task.outputArtifacts', /exec\.task\?\.outputArtifacts/],
  ] as const) {
    if (re.test(resultsSource)) {
      throw new Error(`agent-results-handler reads ${field} again — no such column (or, for outputArtifacts, not in this handler's projection)`);
    }
  }
});

test('formatters: agent.results RENDERS the hoisted errorCategory (a field nobody renders is still suppressed)', () => {
  // Live-verification finding 2026-07-26: the handler hoisted errorCategory correctly and
  // every gate was green, but the results formatter had no branch for it — so in the text an
  // agent reads, the code appeared ONLY inside the raw error.json artifact preview. Hoisting a
  // fact out of an artifact and then not rendering it leaves the agent exactly where it started.
  // The GUARD and the EMIT must be asserted together. First cut of this pin checked only the
  // `formatted +=` line, so disabling the branch (`if (false)`) left it GREEN — a pin passing
  // while the bug sat one line above it. Caught by negative-controlling the pin itself.
  if (!/if \(exec\.errorCategory\)\s*\{\s*\n\s*formatted \+= `• Failure code: \$\{sanitizeForResponse\(String\(exec\.errorCategory\)\)\}/.test(formattersSource)) {
    throw new Error('agent.results formatter does not render errorCategory (branch missing, disabled, or emitting something else) — the hoist is invisible to the agent');
  }
});

test('formatters: the dead progress/error render branches stay deleted, replaced by the failure code', () => {
  if (/if\s*\(exec\.progress\)/.test(formattersSource)) {
    throw new Error('the permanently-dead exec.progress render branch is back');
  }
  if (/if\s*\(exec\.error\)/.test(formattersSource)) {
    throw new Error('the permanently-dead exec.error render branch is back');
  }
  expect(formattersSource).toMatch(/if\s*\(exec\.errorCode\)/);
});

test('Bug Class 80 sweep: the phantom fields stay gone at the swept sites', () => {
  // 2026-07-26 drift sweep. Each of these read a column that has never existed on
  // agent_executions. Two hid from the first sweep's grep by being cast-wrapped
  // (`(execution as any).progress`) — the pattern `execution\.progress` cannot see them —
  // so this pin greps by FIELD, not by the expression shape that happened to be used.
  const swept: Array<[string, RegExp[]]> = [
    ['app/api/mcp/automations/route.ts',            [/as any\)\.progress/, /as any\)\.output/]],
    ['lib/mcp/simple-resource-manager.js',          [/progress:\s*execution\.progress/]],
    ['lib/mcp/server/utils/execution-analytics.js', [/calculateAverageProgress/, /e\.progress/]],
    ['lib/mcp/server/mcp-core.ts',                  [/exec\.error\b/, /exec\.result\b/, /exec\.completedAt\b/]],
    // External MCP-client wire (sendProgressNotification -> sendLoggingMessage). A false
    // ZERO here is worse than an absent field: the client has no `(est.)` affordance.
    ['lib/mcp/server/streaming/execution-streaming.js', [/execution\.progress/, /execution\.responseLength/, /execution\.executionTimeMs/]],
    ['mcp-server-v5.js',                            [/progress:\s*update\.progress/]],
  ];
  for (const [rel, patterns] of swept) {
    const src = stripComments(fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8'));
    for (const re of patterns) {
      if (re.test(src)) throw new Error(`${rel}: phantom read ${re} is back — no such column on agent_executions (Bug Class 80)`);
    }
  }
  // The 1070-line orphan that held six of them must stay deleted.
  if (fs.existsSync(path.resolve(__dirname, '../lib/mcp/server/utils/execution-streaming.js'))) {
    throw new Error('lib/mcp/server/utils/execution-streaming.js is back — it was a zero-importer orphan whose own require() pointed at a missing module');
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
