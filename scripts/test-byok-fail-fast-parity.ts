#!/usr/bin/env ts-node
/**
 * BYOK Fail-Fast Parity Test — convergence Phase 0.5e (agent-execution I-2)
 *
 * Both execution paths must throw a typed `USER_CONFIG_REQUIRED` AuthError
 * pre-LLM when the triggering user has no configured API key. The provider
 * hard-rejects keyless requests anyway (task #85 — no env-var fallback), so
 * a path that "proceeds on default config" only burns template/MCP-discovery
 * work and loses the errorCategory the GUI's "configure your API key" banner
 * keys on. The stream path did exactly that until 0.5e.
 *
 * Layer 1 source pins (route handler not instantiable in CI).
 *
 * Created: 2026-07-04
 * Plan: cline_docs/reviews/execution-path-convergence-2026-07-04/implementation-plan.md §Phase 0.5e
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🔑 BYOK Fail-Fast Parity Tests (0.5e pattern validation)\n');

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

const engineSource = fs.readFileSync(
  path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');
const streamSource = fs.readFileSync(
  path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts'), 'utf8');

// The guard shape: a missing-apiKey check that throws with the typed code.
const guardRe = /if\s*\(!userLLMSettings\.apiKey\)\s*\{\s*throw new AuthError\([\s\S]{0,400}?'USER_CONFIG_REQUIRED'/;

test('engine: throws typed USER_CONFIG_REQUIRED when apiKey missing', () => {
  if (!guardRe.test(engineSource)) {
    throw new Error('engine BYOK guard (missing apiKey → AuthError USER_CONFIG_REQUIRED) not found');
  }
});

test('stream-route: throws typed USER_CONFIG_REQUIRED when apiKey missing (0.5e)', () => {
  if (!guardRe.test(streamSource)) {
    throw new Error('stream BYOK guard not found — keyless GUI runs would regress to a generic provider error without the errorCategory banner signal');
  }
});

test('stream-route: no silent proceed-on-default-config after settings resolution', () => {
  if (streamSource.includes('Using default LLM service configuration')) {
    throw new Error('the pre-0.5e "Using default LLM service configuration" proceed path is back');
  }
});

test('stream-route: guard sits BEFORE the tool-loop setup (fail fast, no burned work)', () => {
  const guardIdx = streamSource.search(guardRe);
  // Phase 6b: the stream hands the tool loop to the core — the guard must still precede the handoff.
  const loopIdx = streamSource.indexOf('runExecutionCore(');
  if (guardIdx === -1 || loopIdx === -1) throw new Error('anchor not found');
  if (guardIdx > loopIdx) throw new Error('BYOK guard fires after the core handoff — must be pre-LLM');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
