#!/usr/bin/env ts-node
/**
 * task.context — COMPLETION section rendering (formatTaskContext)
 *
 * Wired into npm run test:all-validation. Locks the 2026-06-09 change that
 * surfaces task.complete `summary` + `confidence` (stored as
 * metadata.completionSummary / metadata.confidenceScore) in a readable
 * COMPLETION section of project(action:'task.context'), instead of being
 * buried in the raw "Other keys" metadata dump.
 *
 * Asserts:
 *  1. COMPLETION section renders Summary + "Confidence Score: N/100"
 *  2. user-controlled completionSummary is sanitized (no raw <script>)
 *  3. completionSummary / confidenceScore are NOT also dumped in "Other keys"
 *  4. no empty COMPLETION header when neither field is present
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-task-context-completion-render.ts
 */

const { responseFormatter } = require('../lib/mcp/server/utils/formatters');

let passed = 0;
let failed = 0;

function check(desc: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`✅ ${desc}`);
    passed++;
  } else {
    console.log(`❌ ${desc}${detail ? `\n   ${detail}` : ''}`);
    failed++;
  }
}

function baseContext(metadata: Record<string, unknown>) {
  return {
    requestId: 'req-test',
    timestamp: '2026-06-09T00:00:00.000Z',
    contextDepth: 'standard',
    task: {
      core: {
        id: 'cmtasktest0001',
        title: 'Configure Source System Connectors',
        description: 'Wire POS/ERP/WMS feeds.',
        status: 'COMPLETED',
        priority: 'HIGH',
        type: 'TASK',
        metadata
      },
      context: { assignee: null, pov: null, phase: null, stage: null },
      relationships: { dependencies: [], dependents: [], blockedBy: [], blocking: [] }
    }
  };
}

console.log('🔒 task.context COMPLETION rendering\n');

// --- Case 1: summary (with XSS) + confidence present ---
const xss = '<script>alert(1)</script>';
const out1 = responseFormatter.formatTaskContext(
  baseContext({
    createdVia: 'mcp',
    actionId: 'act-1',
    completionSummary: `${xss} Connectors live; feeds flowing on schedule`,
    confidenceScore: 90
  })
);

check('1a. COMPLETION section renders', out1.includes('COMPLETION:'), out1);
check('1b. Summary text rendered', out1.includes('Connectors live; feeds flowing on schedule'));
check('1c. Confidence Score rendered as N/100', out1.includes('Confidence Score: 90/100'));
check('2.  completionSummary sanitized (no raw <script>)', !out1.includes('<script>'),
  'raw <script> leaked into task.context output');
check('3a. completionSummary key NOT dumped in Other keys', !out1.includes('"completionSummary"'));
check('3b. confidenceScore key NOT dumped in Other keys', !out1.includes('"confidenceScore"'));
check('3c. genuine other metadata still dumped (createdVia)', out1.includes('createdVia'));

// --- Case 2: neither field present → no empty COMPLETION header ---
const out2 = responseFormatter.formatTaskContext(
  baseContext({ createdVia: 'mcp', pipelineStageId: 'cmstage0001' })
);
check('4.  no COMPLETION header when neither field present', !out2.includes('COMPLETION:'), out2);

// --- Case 3: only confidence present ---
const out3 = responseFormatter.formatTaskContext(baseContext({ confidenceScore: 75 }));
check('5a. COMPLETION renders with only confidence', out3.includes('Confidence Score: 75/100'));
check('5b. no Summary line when summary absent', !out3.includes('• Summary:'));

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Total Passed: ${passed}`);
console.log(`Total Failed: ${failed}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

if (failed > 0) {
  console.log('\n❌ task.context COMPLETION rendering FAILED');
  process.exit(1);
}
console.log('\n✅ task.context COMPLETION rendering PASSED');
process.exit(0);
