#!/usr/bin/env ts-node
/**
 * Client-context trust-boundary regression test.
 *
 * `body.context` on the agent stream route is client-supplied and free-form
 * (AgentExecuteSchema uses safeRecord() — any keys allowed). It is the ONLY raw
 * client-context ingress, persisted verbatim into agent_executions.context.
 * Server-reserved control-flow keys (read for a DECISION downstream) must be
 * stripped at that ingress so a client can't inject a value a guard reads.
 *
 * Today's decision-readers: triggeredBy (retrigger reactor / config builder,
 * also overwritten server-side) and reactorGeneration (D-4 Guard 8). This test
 * pins: (a) both are in SERVER_RESERVED_CONTEXT_KEYS, (b) the strip helper
 * removes them, (c) the stream route applies the helper (not a raw passthrough).
 *
 * Source-text assertions only (no imports — agent-execution-create reaches
 * prisma; feedback_ci_database_url_transitive). CI-safe.
 *
 * Created: 2026-06-14 | Follow-up: client-context-trust-boundary-2026-06-14.md
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🛡️  Client-context trust boundary — reserved-key strip\n');

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
const create = fs.readFileSync(path.join(REPO, 'lib/services/agent-execution-create.ts'), 'utf-8');
const route = fs.readFileSync(path.join(REPO, 'app/api/pov/agent/execute/stream/route.ts'), 'utf-8');

// --- The reserved-key list must include the control-flow fields ---
test('SERVER_RESERVED_CONTEXT_KEYS includes the control-flow fields (triggeredBy + reactorGeneration)', () => {
  const m = create.match(/SERVER_RESERVED_CONTEXT_KEYS\s*=\s*\[([\s\S]*?)\]/);
  if (!m) throw new Error('SERVER_RESERVED_CONTEXT_KEYS not found');
  const list = m[1];
  // reactorGeneration is THE load-bearing one (D-4 control-flow field a client could inject).
  for (const key of ['triggeredBy', 'reactorGeneration', 'cascadeCompletedTaskId']) {
    if (!new RegExp(`['"]${key}['"]`).test(list)) {
      throw new Error(`reserved-key list is missing '${key}' — a client could inject it`);
    }
  }
});

// --- The strip helper actually deletes the reserved keys ---
test('stripReservedContextKeys deletes the reserved keys from a copy', () => {
  if (!/export function stripReservedContextKeys/.test(create)) {
    throw new Error('stripReservedContextKeys helper missing');
  }
  if (!/for \(const key of SERVER_RESERVED_CONTEXT_KEYS\) delete out\[key\]/.test(create)) {
    throw new Error('stripReservedContextKeys does not delete the reserved keys');
  }
  // Must operate on a COPY, not mutate the caller's object.
  if (!/const out: Record<string, any> = \{ \.\.\.ctx \}/.test(create)) {
    throw new Error('stripReservedContextKeys must copy ctx, not mutate the caller input');
  }
});

// --- The stream route applies the strip (and does NOT raw-pass body.context) ---
test('stream route strips body.context via stripReservedContextKeys (no raw passthrough)', () => {
  if (!/contextExtras:\s*stripReservedContextKeys\(\s*body\.context/.test(route)) {
    throw new Error('stream route does not pass body.context through stripReservedContextKeys');
  }
  // Guard against a regression to the old raw passthrough.
  if (/contextExtras:\s*\(body\.context as Record<string, any> \| undefined\)\s*\|\|\s*\{\}/.test(route)) {
    throw new Error('stream route reverted to raw body.context passthrough (no strip)');
  }
});

// --- P1: chokepoint defense-in-depth (non-reactor sources strip reserved keys) ---
test('SERVER_CONTEXT_SOURCES allowlist exists (reactor + system may set reserved keys)', () => {
  const m = create.match(/SERVER_CONTEXT_SOURCES[\s\S]*?=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error('SERVER_CONTEXT_SOURCES allowlist not found');
  for (const s of ['reactor-pipeline-retrigger', 'reactor-task-ready', 'system']) {
    if (!new RegExp(`['"]${s}['"]`).test(m[1])) throw new Error(`SERVER_CONTEXT_SOURCES missing '${s}'`);
  }
  // The 3 API/client sources must NOT be in the allowlist (they must get stripped).
  for (const s of ['api-pov-stream', 'api-task-execute', 'mcp-direct']) {
    if (new RegExp(`['"]${s}['"]`).test(m[1])) throw new Error(`API source '${s}' must NOT be in SERVER_CONTEXT_SOURCES`);
  }
});

test('createAgentExecution strips reserved keys at the chokepoint for non-reactor sources', () => {
  if (!/!SERVER_CONTEXT_SOURCES\.has\(validatedTriggeredBy\.source\)/.test(create)) {
    throw new Error('chokepoint guard (P1) missing — non-reactor creates do not strip reserved keys');
  }
  if (!/args\.contextExtras = stripReservedContextKeys\(ce\)/.test(create)) {
    throw new Error('chokepoint guard does not actually strip');
  }
});

console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=====================================');
if (failed > 0) process.exit(1);
