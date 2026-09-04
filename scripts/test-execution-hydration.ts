#!/usr/bin/env ts-node
/**
 * Execution Hydration Tests — convergence Phase 5b-i gate
 *
 * The 5b-i behavior change is deliberate (panel-gated + Steve-gated 2026-07-05):
 * stream prompts gain §4/§5 context, and P9 activates on the engine for the first
 * time (the old 7-field template select omitted templateType, so the scope-match
 * signal was silently dead on the exact path — harness children — it was built for).
 * This gate pins:
 *   1. The 11-field template UNION select (TS-I1) — exact field set, no drift.
 *   2. All THREE hydration sites consume the shared shapes (engine poller,
 *      engine executeById, stream route) — single-source, no per-site select fork.
 *   3. AE-I1 position invariant (lifecycle): stream hydration stays at the route
 *      edge BEFORE execution-row creation; engine hydration stays in the
 *      poller/executeById, never inside executeAgent post-claim.
 *   4. P9 activation semantics: templateType present → signal computes;
 *      absent → null (the pre-5b-i engine state, kept as the negative control).
 *   5. §4/§5 enrichment through the REAL buildAgentPromptBody: canonical-shape
 *      relations render the sections; the bare (pre-5b-i stream) shape skips them.
 *   6. M0f: one matcher arg shape (stream passes the task row).
 *
 * CI-safe: stub DATABASE_URL before imports that reach lib/prisma.
 *
 * Created: 2026-07-05
 * Plan: phase-5-confidence-assessment.md §5b-i (TS-I1/TS-I2/AE-I1 dispositions)
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import * as fs from 'fs';
import * as path from 'path';
import { EXECUTION_TEMPLATE_SELECT, EXECUTION_TASK_CONTEXT_INCLUDE } from '../lib/services/execution-hydration';
import { buildAgentPromptBody } from '../lib/agents/harness/build-agent-prompt-body';

console.log('🧪 Execution Hydration Tests (Phase 5b-i gate)\n');

let passed = 0;
let failed = 0;
function test(d: string, fn: () => void) {
  try { fn(); console.log(`✅ ${d}`); passed++; }
  catch (e) { console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   ${e.message}`); failed++; }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

const engineSrc = fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');
const streamSrc = fs.readFileSync(path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts'), 'utf8');

// ── 1. The union select ──────────────────────────────────────────────────────

test('template select is EXACTLY the 11-field union (TS-I1) — engine 7 + templateType/outputSchema/maxRetries/timeout', () => {
  const expected = ['id', 'name', 'defaultRole', 'promptTemplate', 'capabilities', 'constraints', 'metadata',
    'templateType', 'outputSchema', 'maxRetries', 'timeout'].sort();
  const actual = Object.keys(EXECUTION_TEMPLATE_SELECT).sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `select fields drifted:\n   expected ${expected.join(',')}\n   actual   ${actual.join(',')}`);
  assert(Object.values(EXECUTION_TEMPLATE_SELECT).every(v => v === true), 'all select values must be true');
});

test('task-context include carries the §4/§5 superset relations (C-2) and NO agentTemplate', () => {
  const keys = Object.keys(EXECUTION_TASK_CONTEXT_INCLUDE).sort();
  assert(JSON.stringify(keys) === JSON.stringify(['assignee', 'parentTask', 'phase', 'pov', 'stage', 'subTasks', 'team']),
    `include relations drifted: ${keys.join(',')}`);
  assert((EXECUTION_TASK_CONTEXT_INCLUDE as any).subTasks.take === 10, 'subTasks take-10 context cap');
  assert(!('agentTemplate' in EXECUTION_TASK_CONTEXT_INCLUDE), 'template linkage is per-adapter policy — never in the task include');
});

// ── 2. Single-source consumption at all three sites ──────────────────────────

test('engine consumes the shared shapes at BOTH hydration sites (poller + executeById)', () => {
  const includeUses = (engineSrc.match(/task: \{ include: EXECUTION_TASK_CONTEXT_INCLUDE \}/g) || []).length;
  const selectUses = (engineSrc.match(/agentTemplate: \{ select: EXECUTION_TEMPLATE_SELECT \}/g) || []).length;
  assert(includeUses === 2, `expected 2 engine task-include uses, found ${includeUses}`);
  assert(selectUses === 2, `expected 2 engine template-select uses, found ${selectUses}`);
  assert(!/agentTemplate:\s*\{\s*select:\s*\{\s*id: true/.test(engineSrc), 'inline template select re-introduced in the engine');
});

test('stream consumes the shared shapes (spread include + template select; full-row agentTemplate: true is gone)', () => {
  assert(streamSrc.includes('...EXECUTION_TASK_CONTEXT_INCLUDE'), 'stream does not spread the canonical task include');
  assert(streamSrc.includes('agentTemplate: { select: EXECUTION_TEMPLATE_SELECT }'), 'stream does not use the union template select');
  assert(!streamSrc.includes('agentTemplate: true'), 'stream full-row template include re-introduced');
});

// ── 3. AE-I1 position invariant (lifecycle) ──────────────────────────────────

test('AE-I1: stream hydration stays at the route edge BEFORE execution-row creation', () => {
  const fetchIdx = streamSrc.indexOf('...EXECUTION_TASK_CONTEXT_INCLUDE');
  const createIdx = streamSrc.indexOf('createAgentExecution(');
  const iifeIdx = streamSrc.indexOf('(async () => {');
  assert(fetchIdx > 0 && createIdx > 0 && iifeIdx > 0, 'anchors missing');
  assert(fetchIdx < createIdx, 'stream task hydration moved AFTER execution-row creation — a transient hydration failure would burn a FAILED row instead of a retryable HTTP 5xx');
  assert(fetchIdx < iifeIdx, 'stream task hydration moved inside the SSE IIFE — same burnt-row hazard');
});

test('AE-I1: engine hydration stays in the poller/executeById (pre-claim) — never inside executeAgent', () => {
  const execAgentStart = engineSrc.indexOf('private async executeAgent');
  const execAgentEnd = engineSrc.indexOf('private buildAgentPrompt');
  const body = engineSrc.slice(execAgentStart, execAgentEnd);
  assert(execAgentStart > 0 && execAgentEnd > execAgentStart, 'executeAgent anchors missing');
  assert(!body.includes('EXECUTION_TASK_CONTEXT_INCLUDE'), 'task hydration moved inside executeAgent (post-claim) — a transient failure would flip the row FAILED instead of staying PENDING for retry');
});

// ── 4. P9 activation semantics — RETIRED 2026-07-17 ─────────────────────────
// The templateType×verbs matcher was deleted (~60 firings ever, 0 true positives —
// see execution-quality.ts retirement note). templateType stays in the UNION select
// (typed field, GUI/template surfaces read it). The former tests here pinned the
// matcher's activation; the retirement pin lives in test-execution-quality.ts.

// ── 5. §4/§5 enrichment through the real builder ─────────────────────────────

const baseTask = {
  id: 'cmtask000000000000000001', title: 'Design the topology', description: 'Produce the target design.',
  priority: 'MEDIUM', status: 'IN_PROGRESS', type: 'ACTION',
  pov: { id: 'cmpov1', title: 'Meridian', description: 'HFT fabric', objective: 'Low latency', customerName: 'Meridian', solution: 'Arista' },
  phase: { id: 'cmph1', name: 'Design', description: 'Design phase' },
};
const enrichedTask = {
  ...baseTask,
  assignee: { id: 'cmu1', name: 'Zq Fixture Assignee', email: 's@x.com' },
  team: { id: 'cmt1', name: 'ZqFixtureTeam' },
  subTasks: [{ id: 'cms1', title: 'ZqFixture port map', description: 'Allocate ports', status: 'OPEN', order: 1 }],
  parentTask: { id: 'cmp1', title: 'ZqFixture fabric program', description: 'Parent', order: 0 },
};
const cfg = { prompt: 'Design it.', agentRole: 'technical_consultant', mcpTools: ['project'] };

test('§4/§5 enrichment: canonical-shape relations RENDER; the bare pre-5b-i shape skips them (builder-guarded)', () => {
  const bare = buildAgentPromptBody(baseTask, cfg, {});
  const enriched = buildAgentPromptBody(enrichedTask, cfg, {});
  assert(enriched.length > bare.length, 'enriched prompt must be longer');
  for (const marker of ['ZqFixture port map', 'ZqFixture fabric program', 'Zq Fixture Assignee', 'ZqFixtureTeam']) {
    assert(enriched.includes(marker), `enriched prompt missing §4/§5 content: ${marker}`);
    assert(!bare.includes(marker), `bare prompt unexpectedly contains: ${marker}`);
  }
  // Token-delta sanity (AE Q4: +200-500 typical ≈ +800-2000 chars): the fixture's
  // small relations must land in a plausible sub-range — a blowup here means a
  // section is duplicating or the builder changed shape.
  const delta = enriched.length - bare.length;
  assert(delta > 50 && delta < 4000, `§4/§5 char delta implausible: ${delta}`);
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
