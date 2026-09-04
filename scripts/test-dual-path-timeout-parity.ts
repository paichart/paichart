#!/usr/bin/env ts-node
/**
 * Dual-path tool-loop timeout parity test.
 *
 * The agent runs on TWO independent paths — the streaming route
 * (app/api/pov/agent/execute/stream/route.ts) and the engine poller
 * (lib/services/agentExecutionEngine.ts). The agentic-loop BODY is a shared
 * module (ebc20d27), but each path still computes its own execution-timeout
 * constants. These MUST stay in lock-step — a past MAX_TOOL_TURNS 10→30 drift
 * (engine changed, stream "never mirrored", route.ts:613 comment) cost ~8
 * diagnosis cycles (automation-loop-closure-architecture.md Lesson 1/2).
 *
 * This pins the four shared values equal across the two files until the timeout
 * setup is extracted into a shared helper. Source-text assertions only (no
 * imports) — CI-safe, no DATABASE_URL (feedback_ci_database_url_transitive).
 *
 * Created: 2026-06-14
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🔁 Dual-path tool-loop timeout parity\n');

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

const REPO = path.resolve(__dirname, '..');
const stream = fs.readFileSync(path.join(REPO, 'app/api/pov/agent/execute/stream/route.ts'), 'utf-8');
const engine = fs.readFileSync(path.join(REPO, 'lib/services/agentExecutionEngine.ts'), 'utf-8');
const runtimeLimits = fs.readFileSync(path.join(REPO, 'lib/validation/runtime-limits.ts'), 'utf-8');

/** Extract the RHS of `const NAME = <rhs>;` (first match), normalized. */
function constRHS(src: string, name: string): string {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`const ${name} = ... not found`);
  return m[1].replace(/\s+/g, ' ').trim();
}

const constants = [
  'rawToolTurns',        // Number(<param>.maxToolTurns)  — Finding B finite guard
  'requestedToolTurns',  // Number.isFinite(rawToolTurns) && >0 ? rawToolTurns : DEFAULT_TOOL_TURNS
  'MAX_TOOL_TURNS',      // Math.min(requestedToolTurns, RUNTIME_LIMITS.MAX_TOOL_TURNS)
  'TIMEOUT_BASE_MS',     // 180_000
  'TIMEOUT_PER_TURN_MS', // 30_000
];

for (const name of constants) {
  test(`${name} identical across stream route + engine`, () => {
    // Normalize the only legitimate difference: the param object name
    // (streamTemplateModelParams vs templateModelParams).
    const s = constRHS(stream, name).replace(/streamTemplateModelParams/g, 'TPL').replace(/templateModelParams/g, 'TPL');
    const e = constRHS(engine, name).replace(/streamTemplateModelParams/g, 'TPL').replace(/templateModelParams/g, 'TPL');
    if (s !== e) {
      throw new Error(`DRIFT: stream "${s}" !== engine "${e}" — the two tool-loop paths disagree on ${name}`);
    }
  });
}

test('BOTH paths coerce + finite-guard, defaulting to RUNTIME_LIMITS.DEFAULT_TOOL_TURNS', () => {
  // R-1 (2026-06-17) + Finding B (2026-06-18): the `|| 30` literal is now the shared
  // DEFAULT_TOOL_TURNS constant, reached via a Number()+isFinite guard so a non-numeric
  // template-metadata value can't become NaN. Pin both shapes + the constant's value.
  const raw = /rawToolTurns\s*=\s*Number\(\s*\w+\.maxToolTurns\s*\)/;
  const guard = /requestedToolTurns\s*=\s*Number\.isFinite\(rawToolTurns\)\s*&&\s*rawToolTurns\s*>\s*0\s*\?\s*rawToolTurns\s*:\s*RUNTIME_LIMITS\.DEFAULT_TOOL_TURNS\b/;
  for (const [label, src] of [['stream', stream], ['engine', engine]] as const) {
    if (!raw.test(src)) throw new Error(`${label} missing Number() coercion of maxToolTurns`);
    if (!guard.test(src)) throw new Error(`${label} missing isFinite finite-guard → DEFAULT_TOOL_TURNS`);
  }
  if (!/DEFAULT_TOOL_TURNS:\s*30\b/.test(runtimeLimits)) throw new Error('DEFAULT_TOOL_TURNS is no longer 30');
});

test('BOTH paths clamp MAX_TOOL_TURNS to the shared ceiling RUNTIME_LIMITS.MAX_TOOL_TURNS', () => {
  // R-1: the clamp is the actual enforcement (defends the uncapped ADMIN
  // template-metadata path + pre-cap rows). Both paths must clamp identically.
  const re = /MAX_TOOL_TURNS\s*=\s*Math\.min\(\s*requestedToolTurns\s*,\s*RUNTIME_LIMITS\.MAX_TOOL_TURNS\s*\)/;
  if (!re.test(stream)) throw new Error('stream route missing MAX_TOOL_TURNS ceiling clamp');
  if (!re.test(engine)) throw new Error('engine missing MAX_TOOL_TURNS ceiling clamp');
  if (!/MAX_TOOL_TURNS:\s*200\b/.test(runtimeLimits)) throw new Error('MAX_TOOL_TURNS ceiling is no longer 200');
});

test('executionTimeout formula identical (BASE + TURNS * PER_TURN)', () => {
  const re = /TIMEOUT_BASE_MS\s*\+\s*\(\s*MAX_TOOL_TURNS\s*\*\s*TIMEOUT_PER_TURN_MS\s*\)/;
  if (!re.test(stream)) throw new Error('stream route timeout formula drifted');
  if (!re.test(engine)) throw new Error('engine timeout formula drifted');
});

console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=====================================');
if (failed > 0) process.exit(1);
