#!/usr/bin/env ts-node
/**
 * TEST-B1-S2: engine ⇄ shared prompt-builder EQUIVALENCE GATE (2026-06-09)
 *
 * Proves `agentExecutionEngine.buildAgentPrompt(t,c,x)` is BYTE-IDENTICAL to the shared
 * `buildAgentPromptBody(t,c,x)` across every emitting branch. This is the landing gate for B1-S2 (making the
 * engine delegate to the shared builder): it MUST be GREEN *before* the delegation edit — that proves the copy
 * is output-identical TODAY, so the one-line replacement is a provable no-op on every pipeline's prompt. After
 * the edit it is trivially equal (same function); the permanent content lock stays in test-build-agent-prompt-body.ts.
 *
 * WHY THIS TEST IMPORTS THE ENGINE (unlike its sibling parity tests, which fs.readFileSync the source): a
 * source-string compare only proves the two BODIES are textually equal — vacuous post-delegation. A RUNTIME
 * byte-for-byte OUTPUT compare is the stronger proof and the only one that gates output-equivalence. Do NOT
 * "fix" this to the source-string pattern. (5-specialist GO 96/96/95/94/93.)
 *
 * Author-time invariants (per re-confirm round):
 *  - Same object instance fed to BOTH calls per fixture (so Object.entries order / JSON.stringify /
 *    toLocaleDateString cancel out — they're deterministic within one process).
 *  - Assert engineOut === bodyOut ONLY. NEVER assert against a baked literal (locale/TZ-fragile).
 *  - DATABASE_URL stub is the literal first statement (engine import → lib/prisma eager createPrismaClient()).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://fake:fake@127.0.0.1:5432/fake_test_db?schema=public';

import { agentExecutionEngine } from '../lib/services/agentExecutionEngine';
import { buildAgentPromptBody } from '../lib/agents/harness/build-agent-prompt-body';

const engineBuild = (t: any, c: any, x: any): string => (agentExecutionEngine as any).buildAgentPrompt(t, c, x);

let passed = 0, failed = 0;
const failures: string[] = [];

function firstDiff(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}
function assertEqual(name: string, task: any, config: any, context: any) {
  // SAME instance to both calls (invariant) — do not clone per call.
  const e = engineBuild(task, config, context);
  const b = buildAgentPromptBody(task, config, context);
  if (e === b) { passed++; console.log(`  ✅ ${name} (${e.length} chars)`); return; }
  failed++;
  const i = firstDiff(e, b);
  const ctx = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
  const msg = `${name} — first diff at index ${i}\n      engine: ${ctx(e)}\n      shared: ${ctx(b)}`;
  failures.push(msg);
  console.log(`  ❌ ${msg}`);
}

const T = (over: any = {}) => ({ title: 'Analyze Q3 churn', status: 'IN_PROGRESS', ...over });

const FIXTURES: Array<{ name: string; task: any; config: any; context: any }> = [
  // Full
  { name: 'full', task: T({ description: 'd', priority: 'HIGH', type: 'ACTION', dueDate: '2026-07-01T00:00:00Z',
      parentTask: { title: 'P', order: 1, description: 'pd' }, subTasks: [{ title: 'S', order: 1, status: 'OPEN', description: 'sd' }],
      pov: { id: 'pov_abc', title: 'Acme', description: 'pd', objective: 'reduce churn' }, phase: { name: 'Discovery', description: 'phd' },
      team: { name: 'Alpha' }, assignee: { name: 'Jane\x07Doe', email: 'j@x.com' }, inputContext: { chainedFrom: 't1', priorOutput: 'o' } }),
    config: { prompt: 'Do it', agentRole: 'Analyst', mcpTools: ['perform', 'analytics'], workflow: { P1: 'g' }, successMetrics: ['acc'] },
    context: { agentTemplate: { defaultRole: 'Analyst', outputSchema: { format: 'md', sections: ['A', 'B'], minLength: 500 }, constraints: ['no PII'] } } },
  // §1 directive — 5 permutations
  { name: 's1-explicit', task: T(), config: { prompt: 'Explicit directive' }, context: {} },
  { name: 's1-config-role', task: T(), config: { agentRole: 'Strategist' }, context: {} },
  { name: 's1-template-role', task: T(), config: {}, context: { agentTemplate: { defaultRole: 'Engineer' } } },
  { name: 's1-task-role', task: T({ agentRole: 'QA' }), config: {}, context: {} },
  { name: 's1-roleless', task: T(), config: {}, context: {} },
  // §2 outputSchema variants
  { name: 's2-absent', task: T(), config: {}, context: { agentTemplate: {} } },
  { name: 's2-empty', task: T(), config: {}, context: { agentTemplate: { outputSchema: {} } } },
  { name: 's2-format-only', task: T(), config: {}, context: { agentTemplate: { outputSchema: { format: 'json' } } } },
  { name: 's2-sections-scalar', task: T(), config: {}, context: { agentTemplate: { outputSchema: { sections: 'OnlyOne' } } } },
  { name: 's2-minlength', task: T(), config: {}, context: { agentTemplate: { outputSchema: { minLength: 200 } } } },
  { name: 's2-extra-keys', task: T(), config: {}, context: { agentTemplate: { outputSchema: { tone: 'formal', meta: { a: 1, b: [2] } } } } },
  // §3 priority/type defaults (omitted)
  { name: 's3-defaults', task: T({ description: 'only desc' }), config: {}, context: {} },
  { name: 's3-no-desc', task: T(), config: {}, context: {} },
  // §4 parent-only / subs-only / both / inner-desc-absent
  { name: 's4-parent-only-nodesc', task: T({ parentTask: { title: 'P', order: 2 } }), config: {}, context: {} },
  { name: 's4-subs-only-nodesc', task: T({ subTasks: [{ title: 'S', order: 1, status: 'OPEN' }] }), config: {}, context: {} },
  { name: 's4-both-desc', task: T({ parentTask: { title: 'P', order: 1, description: 'pd' }, subTasks: [{ title: 'S', order: 1, status: 'DONE', description: 'sd' }] }), config: {}, context: {} },
  // §5 pov w/o desc+objective; phase w/o desc; team; assignee null-name / ctrl-char / absent
  { name: 's5-minimal-pov-phase', task: T({ pov: { id: 'p1', title: 'P' }, phase: { name: 'Ph' }, team: { name: 'T' } }), config: {}, context: {} },
  { name: 's5-pov-with-desc-obj', task: T({ pov: { id: 'p2', title: 'P2', description: 'pd', objective: 'obj' } }), config: {}, context: {} },
  { name: 's5-assignee-null-name', task: T({ assignee: { name: null, email: 'n@x.com' } }), config: {}, context: {} },
  { name: 's5-assignee-ctrl', task: T({ assignee: { name: 'A\x01\x1fB', email: 'a@x.com' } }), config: {}, context: {} },
  // §6 generic (string) / structured (array) / absent
  { name: 's6-generic-string', task: T({ inputContext: { chainedFrom: 't_prev', priorOutput: 'earlier' } }), config: {}, context: {} },
  { name: 's6-structured-array', task: T({ inputContext: { chainedFrom: [{ taskTitle: 'T', agentRole: 'R', confidenceScore: 90, finalResponse: 'fr' }], pipelineMetadata: { depth: 1 } } }), config: {}, context: {} },
  { name: 's6-absent', task: T(), config: {}, context: {} },
  // §7 tools+categories+pov / tools-no-category-no-pov (fallbacks) / defensive guards / no tools
  { name: 's7-tools-pov', task: T({ pov: { id: 'pv', title: 'P' } }), config: { mcpTools: ['perform', 'analytics_query'] }, context: {} },
  { name: 's7-tools-nopov-nocat', task: T(), config: { mcpTools: ['zzz', 'qqq'] }, context: {} },
  { name: 's7-guards', task: T(), config: { mcpTools: [null as any, 123 as any, 'pov_list'] }, context: {} },
  { name: 's7-no-tools', task: T(), config: { mcpTools: [] }, context: {} },
  // §8 array constraints / object constraints / workflow+metrics / empties
  { name: 's8-constraints-array', task: T(), config: {}, context: { agentTemplate: { constraints: ['c1', 'c2'] } } },
  { name: 's8-constraints-object', task: T(), config: {}, context: { agentTemplate: { constraints: { scope: 'narrow', tone: 'formal' } } } },
  { name: 's8-workflow-metrics', task: T(), config: { workflow: { Phase1: 'gather', Phase2: 'synth' }, successMetrics: ['accuracy', 'coverage'] }, context: {} },
  { name: 's8-empties', task: T(), config: { workflow: {}, successMetrics: [] }, context: {} },
  // bare minimal
  { name: 'minimal', task: T(), config: {}, context: {} },
];

console.log(`\n🔁 TEST-B1-S2 — engine ⇄ shared buildAgentPromptBody byte-equivalence (${FIXTURES.length} fixtures)\n`);
for (const f of FIXTURES) assertEqual(f.name, f.task, f.config, f.context);

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'} (of ${FIXTURES.length})`);
if (failed > 0) {
  console.log('\nByte-equivalence FAILURES (engine inline ≠ shared copy — DO NOT delegate until resolved):\n  • ' + failures.join('\n  • '));
  process.exit(1);
}
console.log('✅ engine inline body is BYTE-IDENTICAL to buildAgentPromptBody across all branches — delegation is provably a no-op\n');
// Force clean exit: importing the engine eagerly created a Prisma pool (fake DATABASE_URL stub).
process.exit(0);
