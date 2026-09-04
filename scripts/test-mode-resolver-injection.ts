#!/usr/bin/env ts-node
/**
 * Mode Resolver Injection — dual-path parity regression test
 *
 * Pure source-read test (no DB needed). Locks in:
 *   - Both engine + stream-route paths import resolveHarnessMode
 *   - Both paths CALL resolveHarnessMode at the prompt-build stage
 *   - Both paths inject the `## Harness Context (Platform-Resolved)` block
 *     BEFORE protocol injection (locked decision per prompt-construction review)
 *   - Both paths write resolvedMode + resolvedReasonCode to the success-path
 *     pipeline-index.json artifact
 *
 * Why this test exists:
 *   The mode-resolver is dual-path (engine + stream). Per
 *   `dual-execution-path-parity-pattern.md` and the explicit pattern
 *   `two-execution-path-drift-pattern.md`, parity is only enforced if a
 *   structural CI check ASSERTS both paths follow the same shape. If a
 *   future refactor accidentally removes EITHER injection or EITHER artifact
 *   write, this test fails.
 *
 * Position assertion (per pipeline-harness re-review NTH#3 and agent-execution
 * re-review): the position assertion compares HarnessContext-injection vs
 * loadProtocols-branch WITHIN buildSystemPrompt (engine) and within the
 * stream-route handler. NOT a cross-function comparison.
 *
 * Created: 2026-04-26 (Deploy 3 — Item 6.2)
 * Pattern model: scripts/test-pipeline-engine-skip.ts
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 Mode Resolver Injection — Dual-Path Parity Test\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try { fn(); console.log(`✅ ${description}`); passed++; }
  catch (error) {
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

const ENGINE_PATH = path.resolve(__dirname, '../lib/services/agentExecutionEngine.ts');
const STREAM_PATH = path.resolve(
  __dirname, '../app/api/pov/agent/execute/stream/route.ts'
);
const RESOLVER_PATH = path.resolve(__dirname, '../lib/services/harnessModeResolver.ts');

const engineSource = fs.readFileSync(ENGINE_PATH, 'utf-8');
const streamSource = fs.readFileSync(STREAM_PATH, 'utf-8');
const resolverSource = fs.readFileSync(RESOLVER_PATH, 'utf-8');

// ============================================================================
// Resolver module — exists with required exports
// ============================================================================

test('resolver: exports resolveHarnessMode function', () => {
  expect(resolverSource).toMatch(/export\s+async\s+function\s+resolveHarnessMode\s*\(/);
});

test('resolver: exports ResolvedHarnessContext type', () => {
  expect(resolverSource).toMatch(/export\s+interface\s+ResolvedHarnessContext\b/);
});

test('resolver: exports ResolvedHarnessMode type with all 6 modes', () => {
  expect(resolverSource).toContain("'CREATE'");
  expect(resolverSource).toContain("'ORCHESTRATE'");
  expect(resolverSource).toContain("'SYNTHESIZE'");
  expect(resolverSource).toContain("'NOT_PIPELINE'");
  expect(resolverSource).toContain("'CROSS_TENANT_DETECTED'");
  expect(resolverSource).toContain("'UNKNOWN'");
});

test('resolver: includes povId guard for cross-tenant detection', () => {
  expect(resolverSource).toMatch(/stage\.phase\.povId\s*!==\s*task\.povId/);
});

test('resolver: returns UNKNOWN sentinel on Prisma error (not throw)', () => {
  expect(resolverSource).toContain("mode: 'UNKNOWN'");
  expect(resolverSource).toContain("reasonCode: 'resolver-error'");
});

// ============================================================================
// Engine path — agentExecutionEngine.ts
// ============================================================================

test('engine: imports resolveHarnessMode + ResolvedHarnessContext', () => {
  expect(engineSource).toContain("import { resolveHarnessMode, ResolvedHarnessContext }");
  expect(engineSource).toContain("'./harnessModeResolver'");
});

test('engine: calls resolveHarnessMode at executeAgent outer scope (not inside buildSystemPrompt)', () => {
  expect(engineSource).toMatch(/await\s+resolveHarnessMode\s*\(\s*task\.id\s*\)/);
});

test('engine: passes harnessContext to buildSystemPrompt (6th param; executionId follows since Phase C)', () => {
  // Phase C (2026-08-17) appended executionId after harnessContext (injection-identity logging),
  // so the pin asserts harnessContext is IN the arg list rather than terminal.
  expect(engineSource).toMatch(/buildSystemPrompt\([^)]*harnessContext\s*,/);
});

test('engine: buildSystemPrompt signature accepts harnessContext param', () => {
  expect(engineSource).toMatch(/harnessContext\?\s*:\s*ResolvedHarnessContext/);
});

test('engine: routes the injection tail through the shared module (Phase 5a)', () => {
  // The HarnessContext block + protocol injection moved to the SINGLE shared site
  // (lib/services/execution-system-prompt.ts); the engine inherits them by calling it.
  // Phase C: the engine consumes the fact-returning facade (protocolInjection threads to result.json).
  expect(engineSource).toContain("applySystemPromptInjectionsWithFact(prompt");
});

test('shared tail: injects ## Harness Context block BEFORE protocol injection (single site)', () => {
  // Position assertion (per pipeline-harness NTH#3 + agent-execution re-review),
  // retargeted to the shared module after the Phase-5a swap (harness F5): the
  // HarnessContext prepend must run before the loadProtocols branch so protocol
  // prose can reference the resolved mode (final layout: protocols → harness → HEAD).
  const sharedSource = fs.readFileSync(
    path.resolve(__dirname, '../lib/services/execution-system-prompt.ts'), 'utf-8');
  // Phase C (2026-08-17): assembly is ORDERED-COMPOSITION — order is DATA (the blocks array),
  // not statement sequence, and the harness block is deliberately BUILT after the protocol
  // branches (its composed binding line needs the resolved delta). The invariant this test
  // guards is the RENDERED position: protocol preamble renders before the Harness Context
  // block. Assert it on the block list literal (byte-order also pinned by
  // test-system-prompt-injections ORDER golden).
  const ctxIdx = sharedSource.indexOf("{ kind: 'harness', text: harnessBlock }");
  const protoIdx = sharedSource.indexOf('...preambleBlocks,');
  if (ctxIdx < 0) throw new Error('harness block-list entry not found in shared module');
  if (protoIdx < 0) throw new Error('preambleBlocks spread not found in shared module');
  if (protoIdx >= ctxIdx) {
    throw new Error(
      `HarnessContext block (idx ${ctxIdx}) must appear BEFORE loadProtocols branch (idx ${protoIdx})`
    );
  }
  // And exactly ONE injection site exists across the trio (drift-return lock):
  for (const [name, src] of [['engine', engineSource], ['stream', streamSource]] as const) {
    if (src.includes('## Harness Context (Platform-Resolved)')) {
      throw new Error(`${name}: inline HarnessContext block re-introduced — dual-site drift returns`);
    }
  }
});

test('engine: writes resolvedMode + resolvedReasonCode to artifact (via shared helper)', () => {
  // Post-2026-05-14 (commit e480a5c0): resultJson construction was extracted
  // to lib/services/execution-artifacts.ts. The literal spread is now in the
  // helper; engine just passes `harnessContext` as an input.
  // The semantic guarantee (resolvedMode emitted when harnessContext set) is
  // preserved — verified by test-execution-artifacts-parity.ts.
  // Phase 6: the artifact write (buildExecutionResultJson) moved into the shared core; the engine
  // adapter passes harnessContext INTO runExecutionCore, which passes it to the builder.
  const coreSource = fs.readFileSync(
    path.join(__dirname, '../lib/services/execution-core.ts'), 'utf-8');
  expect(coreSource).toContain("buildExecutionResultJson({");
  expect(engineSource).toMatch(/harnessContext,/);  // engine passes it into the core
  // Helper itself does the literal spread:
  const helperSource = fs.readFileSync(
    path.join(__dirname, '../lib/services/execution-artifacts.ts'),
    'utf8'
  );
  expect(helperSource).toMatch(/resolvedMode:\s*harnessContext\.mode/);
  expect(helperSource).toMatch(/resolvedReasonCode:\s*harnessContext\.reasonCode/);
});

// ============================================================================
// Stream-route path — app/api/pov/agent/execute/stream/route.ts
// ============================================================================

test('stream: imports resolveHarnessMode', () => {
  expect(streamSource).toContain("import { resolveHarnessMode }");
  expect(streamSource).toContain("'@/lib/services/harnessModeResolver'");
});

test('stream: calls resolveHarnessMode (mirror of engine)', () => {
  expect(streamSource).toMatch(/await\s+resolveHarnessMode\s*\(\s*task\.id\s*\)/);
});

test('stream: routes the injection tail through the shared module (Phase 5a — the MIRROR is retired)', () => {
  // Pre-5a the stream carried an inline MIRROR of the engine's injection block,
  // enforced by a comment pin. The mirror is now structurally impossible: both
  // paths call the ONE applySystemPromptInjections.
  // Phase C: the stream consumes the fact-returning facade (protocolInjection threads to result.json).
  expect(streamSource).toContain("applySystemPromptInjectionsWithFact(systemPrompt");
});

test('stream: writes resolvedMode + resolvedReasonCode to artifact (via the core + shared helper)', () => {
  // Phase 6b: the artifact write (buildExecutionResultJson) moved into the shared core;
  // the stream adapter passes harnessContext INTO runExecutionCore, which passes it to
  // the builder. Drift between engine and stream is structurally impossible — one core.
  const coreSource = fs.readFileSync(
    path.join(__dirname, '../lib/services/execution-core.ts'), 'utf-8');
  expect(coreSource).toContain("buildExecutionResultJson({");
  expect(streamSource).toMatch(/harnessContext,/);  // stream passes it into the core
});

// ============================================================================
// Cross-cutting parity assertions
// ============================================================================

test('parity: both paths use the same resolver module path (no fork)', () => {
  // Engine uses relative import; stream uses @/-aliased import — but both
  // resolve to the same file. Confirm both reference harnessModeResolver.
  expect(engineSource).toContain('harnessModeResolver');
  expect(streamSource).toContain('harnessModeResolver');
});

test('parity: both paths gate resolver call on task.type === PIPELINE', () => {
  // task?.type === 'PIPELINE' must appear in both paths (avoids resolver
  // firing on non-PIPELINE tasks; saves DB cost).
  expect(engineSource).toMatch(/task\?\.type\s*===\s*['"]PIPELINE['"]/);
  expect(streamSource).toMatch(/task\?\.type\s*===\s*['"]PIPELINE['"]/);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
