#!/usr/bin/env ts-node
/**
 * Pipeline Engine-Skip Regression Test
 *
 * Layer 1 pattern test that locks in the engine-skip layer that gates
 * PIPELINE auto-complete. The harness clobber-detection 4-point invariant
 * (lib/mcp/tasks/action/handlers/task/task-complete-handler.ts) is reachable
 * ONLY because the engine refuses to set `status: COMPLETED` on PIPELINE
 * tasks via the on-success auto-complete path. The skip lives at:
 *
 *   - lib/services/agentExecutionEngine.ts      (queued/polled path)
 *   - app/api/pov/agent/execute/stream/route.ts (streaming path)
 *
 * If a future refactor accidentally removes EITHER skip, PIPELINE tasks
 * would auto-complete via the engine and bypass the handler 4-point
 * invariant — silent corruption returns through the same door we closed.
 *
 * This test fails if either skip is removed. Pattern grounding:
 * - dual-execution-path-parity-pattern.md (the regression test IS the parity
 *   enforcement — better than mirroring code because it catches inadvertent
 *   removal in either path)
 *
 * Created: 2026-04-25
 * Plan: cline_docs/reviews/harness-clobber-detection-2026-04-25/implementation-plan.md §Item 3f
 *
 * CI behavior: pure source-read (no DB needed). Always runs.
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 Pipeline Engine-Skip Regression Test (Item 3f)\n');

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

const ENGINE_PATH = path.resolve(__dirname, '../lib/services/agentExecutionEngine.ts');
const STREAM_PATH = path.resolve(
  __dirname,
  '../app/api/pov/agent/execute/stream/route.ts'
);

const PERSIST_CORE_PATH = path.resolve(
  __dirname,
  '../lib/services/execution-terminal-persist.ts'
);

// Phase 6: the engine path's post-loop (P8 quality wiring) + success persist route through the
// shared happy-path core; the engine DELEGATES via runExecutionCore.
const CORE_PATH = path.resolve(__dirname, '../lib/services/execution-core.ts');

const engineSource = fs.readFileSync(ENGINE_PATH, 'utf-8');
const streamSource = fs.readFileSync(STREAM_PATH, 'utf-8');
const persistCoreSource = fs.readFileSync(PERSIST_CORE_PATH, 'utf-8');
const coreSource = fs.readFileSync(CORE_PATH, 'utf-8');

// ============================================================================
// Engine path — agentExecutionEngine.ts
// ============================================================================

test('persist-core: declares isPipelineTask flag from currentTaskType (engine path routes through it)', () => {
  // Phase 4b: the engine's success-persist (and its PIPELINE skip) moved into the
  // shared terminal-persist core. The skip detects PIPELINE-type tasks via the
  // `isPipelineTask` boolean off a FRESH in-tx type read. If this declaration is
  // removed, the conditional below it will silently always set status: COMPLETED.
  expect(persistCoreSource).toMatch(
    /const\s+isPipelineTask\s*=\s*\w+\??\.type\s*===\s*['"]PIPELINE['"]/
  );
  // And the engine actually routes its terminal persist through the core (Phase 6: via runExecutionCore,
  // which calls persistTerminalSuccess — the engine no longer calls the persist helper directly):
  expect(engineSource).toContain('runExecutionCore(');
  expect(coreSource).toContain('persistTerminalSuccess(prisma');
});

test('persist-core: omits status:COMPLETED for PIPELINE on success path', () => {
  // The success-path task update spreads `{ status: 'COMPLETED' }` ONLY when
  // NOT a PIPELINE task. Pattern: `...(isPipelineTask ? {} : { status: 'COMPLETED' })`.
  // If anyone "simplifies" this back to a flat `status: 'COMPLETED'`, the
  // handler 4-point invariant becomes unreachable for every caller of the core.
  expect(persistCoreSource).toMatch(
    /isPipelineTask\s*\?\s*\{\s*\}\s*:\s*\{\s*status:\s*['"]COMPLETED['"]/
  );
  // No inline auto-complete may survive in the engine outside the core:
  if (/isPipelineTask\s*\?\s*\{\s*\}\s*:\s*\{\s*status:\s*['"]COMPLETED['"]/.test(engineSource)) {
    throw new Error('engine still carries an inline PIPELINE-skip task update — dual-site drift returns');
  }
});

// ============================================================================
// Stream route — app/api/pov/agent/execute/stream/route.ts
// ============================================================================

test('stream-route: routes its terminal persist through the shared core (Phase 4b)', () => {
  // The stream path lost this skip on at least one previous occasion when it was
  // inline-mirrored (see 2026-04-14 retrospective in pipeline-harness-specialist.md §6).
  // Post-6b the SUCCESS persist (persistTerminalSuccess, which owns the PIPELINE-skip)
  // lives in the core; the stream inherits it by routing through runExecutionCore. The
  // FAILURE persist (persistTerminalFailure) stays adapter-side in the catch.
  expect(streamSource).toContain('runExecutionCore(');
  expect(streamSource).toContain('persistTerminalFailure(prisma');
});

test('stream-route: no inline PIPELINE-skip task update survives (dual-site drift lock)', () => {
  if (/isPipelineTask\s*\?\s*\{\s*\}\s*:\s*\{\s*status:\s*['"]COMPLETED['"]/.test(streamSource)) {
    throw new Error('stream still carries an inline PIPELINE-skip task update — dual-site drift returns');
  }
});

// ============================================================================
// Cross-path documentation
// ============================================================================

test('single-site: the canonical skip shape exists EXACTLY ONCE, in the persist core', () => {
  // Phase 4b end-state: both paths persist through the core, so the skip has one
  // implementation. A second match anywhere in the trio is the drift returning.
  const coreMatches = persistCoreSource.match(
    /isPipelineTask\s*\?\s*\{\s*\}\s*:\s*\{\s*status:\s*['"]COMPLETED['"]/g
  );
  if (!coreMatches || coreMatches.length !== 1) {
    throw new Error('persist-core: expected exactly 1 canonical skip pattern');
  }
});

// 0.5c → Phase 1 retarget (harness F5): the P8 validator call moved to the
// SINGLE shared site in execution-quality.ts (with the taskContext arg both
// paths now get by construction). Both paths must route through it; a re-
// introduced inline validator call in either path is the drift coming back.
const validatorCallRe = /validatePipelineProtocolSteps\([^;]*?\[0\],\s*\{\s*type:/;
const qualitySource = fs.readFileSync(
  path.join(__dirname, '../lib/agents/harness/execution-quality.ts'), 'utf8');

test('execution-quality: single validator site carries the taskContext arg (0.5c invariant)', () => {
  if (!validatorCallRe.test(qualitySource)) {
    throw new Error('shared validatePipelineProtocolSteps call lost its taskContext arg — A.4 P-signal dies for both paths');
  }
});

test('both paths route P8 through assessExecutionQuality (no inline validator calls)', () => {
  // Phase 6b: the P8 wiring (assessExecutionQuality) lives ONLY in the core; both adapters delegate.
  for (const [name, src] of [['core', coreSource]] as const) {
    if (!src.includes('assessExecutionQuality(')) {
      throw new Error(`${name}: no assessExecutionQuality call — P8 wiring lost`);
    }
  }
  if (streamSource.includes('assessExecutionQuality(')) {
    throw new Error('stream-route: re-introduced an inline assessExecutionQuality call — should delegate to the core');
  }
  // No inline validator may be re-introduced anywhere (engine adapter, stream, or core).
  for (const [name, src] of [['engine', engineSource], ['stream-route', streamSource], ['core', coreSource]] as const) {
    if (src.includes('validatePipelineProtocolSteps(')) {
      throw new Error(`${name}: inline validatePipelineProtocolSteps call re-introduced — dual-site drift returns`);
    }
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
