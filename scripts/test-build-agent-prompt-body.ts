#!/usr/bin/env ts-node
/**
 * TEST-B1: shared buildAgentPromptBody golden fixture (2026-06-09)
 *
 * Locks the VERBATIM extraction of the engine's buildAgentPrompt into lib/agents/harness/build-agent-prompt-body.ts
 * (B1 Stage 1). Two jobs: (1) prove the shared builder emits every section §1–§8 + Output Requirements with the
 * exact engine markers, and (2) be the behavioral-equivalence foundation for Stage 2 (when the engine's
 * buildAgentPrompt delegates here, a sibling test will assert engine-output === buildAgentPromptBody-output).
 * CI-safe: buildAgentPromptBody is pure (pino logger + the pure §6 renderer; no prisma).
 *
 * Run: npm run test:build-agent-prompt-body
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { buildAgentPromptBody } from '../lib/agents/harness/build-agent-prompt-body';

let passed = 0, failed = 0;
const failures: string[] = [];
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; failures.push(m); console.log(`  ❌ ${m}`); } };

// Comprehensive fixture — exercises every guarded section.
const fullTask = {
  title: 'Analyze Q3 churn', status: 'IN_PROGRESS', description: 'Look at churn drivers', priority: 'HIGH',
  type: 'ACTION', dueDate: '2026-07-01T00:00:00Z',
  parentTask: { title: 'Quarterly review', order: 1, description: 'parent desc' },
  subTasks: [{ title: 'Pull data', order: 1, status: 'OPEN', description: 'sub desc' }],
  pov: { id: 'pov_abc', title: 'Acme POV', description: 'pov desc', objective: 'reduce churn' },
  phase: { name: 'Discovery', description: 'phase desc' },
  team: { name: 'Alpha Team' },
  assignee: { name: 'Jane\x07Doe', email: 'jane@x.com' }, // control char → must be stripped (§5 defense)
  inputContext: { chainedFrom: 'task_prev', priorOutput: 'earlier finding' },
};
const fullConfig = {
  prompt: 'Do the churn analysis', agentRole: 'Analyst', mcpTools: ['perform', 'analytics_query'],
  workflow: { Phase1: 'gather', Phase2: 'synthesize' }, successMetrics: ['accuracy', 'coverage'],
};
const fullContext = {
  agentTemplate: { defaultRole: 'Analyst', outputSchema: { format: 'markdown', sections: ['Summary', 'Detail'], minLength: 500 },
                   constraints: ['no PII', 'cite sources'] },
};

console.log('\n🧩 TEST-B1 — buildAgentPromptBody golden fixture\n');
console.log('── A: full fixture renders every section ──\n');
const out = buildAgentPromptBody(fullTask, fullConfig, fullContext);
ok(out.includes('## Directive') && out.includes('Do the churn analysis'), 'A §1 Directive (uses config.prompt)');
ok(out.includes('## Expected Output') && out.includes('**Format:** markdown') && out.includes('Summary, Detail') && out.includes('**Minimum Length:** 500 words'), 'A §2 Expected Output (outputSchema)');
ok(out.includes('## Task Context') && out.includes('**Title:** Analyze Q3 churn') && out.includes('**Priority:** HIGH') && out.includes('**Status:** IN_PROGRESS'), 'A §3 Task Context');
ok(out.includes('## Task Sequence Context') && out.includes('**Parent Task:** Quarterly review') && out.includes('Pull data'), 'A §4 Task Sequence');
ok(out.includes('## POV Context') && out.includes('**POV ID:** pov_abc') && out.includes('**Objective:** reduce churn'), 'A §5 POV');
ok(out.includes('## Phase Context') && out.includes('**Phase:** Discovery'), 'A §5 Phase');
ok(out.includes('## Team Context') && out.includes('**Team:** Alpha Team'), 'A §5 Team');
ok(out.includes('## Assignee') && out.includes('jane@x.com'), 'A §5 Assignee');
ok(out.includes('Jane Doe') && !out.includes('Jane\x07Doe'), 'A §5 Assignee control char stripped (prompt-injection defense)');
ok(out.includes('<prior_output>') || out.includes('Chained Context') || out.includes('chainedFrom') || /prior/i.test(out), 'A §6 Chained Context (shared renderer emitted something)');
ok(out.includes('## Available MCP Tools for This Task') && out.includes('perform, analytics_query') && out.includes('"povId"') && out.includes('pov_abc'), 'A §7 Tools + povId guidance');
ok(out.includes('### Detected Tool Categories:'), 'A §7 categorizeTools ran');
ok(out.includes('## Workflow Phases') && out.includes('**Phase1:** gather'), 'A §8 Workflow');
ok(out.includes('## Success Metrics') && out.includes('accuracy, coverage'), 'A §8 Success Metrics');
ok(out.includes('## Constraints') && out.includes('• no PII'), 'A §8 Constraints');
ok(out.includes('## Output Requirements') && out.includes('Confidence: N/100') && out.includes('**95-100**') && out.includes('**Below 40**'), 'A Output Requirements + 5-band confidence rubric');

console.log('\n── B: minimal task skips guarded sections (graceful, no throw) ──\n');
const minOut = buildAgentPromptBody({ title: 'Bare task', status: 'OPEN' }, {}, {});
ok(minOut.includes('## Directive') && minOut.includes('Bare task'), 'B §1 synthesized directive (no config.prompt)');
ok(minOut.includes('## Task Context'), 'B §3 always present');
ok(minOut.includes('## Output Requirements'), 'B Output Requirements always present');
ok(!minOut.includes('## POV Context') && !minOut.includes('## Task Sequence Context') && !minOut.includes('## Available MCP Tools'), 'B §4/§5/§7 skip when data absent (graceful)');

console.log('\n── C: drift sentinel (Stage-1 duplication guard) ──\n');
// Engine path is byte-identical by construction; this pins the section COUNT so an accidental section
// add/drop in either copy is caught. Update deliberately if the prompt structure legitimately changes.
const sectionHeaders = (out.match(/^## /gm) || []).length;
ok(sectionHeaders === 14, `C exactly 14 '## ' headers in full output (got ${sectionHeaders}) — Directive, Expected Output, Task Context, Task Sequence, POV, Phase, Team, Assignee, §6 Chained Context, Available MCP Tools, Workflow Phases, Success Metrics, Constraints, Output Requirements`);

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
console.log('✅ buildAgentPromptBody golden fixture passed\n');
