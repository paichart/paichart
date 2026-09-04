/**
 * Phase 4 (2026-05-16) — Workflow Schema Alignment Contract Test
 *
 * Replaces the prose "KEEP IN SYNC" comments at:
 *   - `lib/mcp/server/config/tool-schemas.js` (top of file)
 *   - `lib/mcp/server/tools/hub/workflow-tools-handler.js:74-80`
 *
 * Asserts that the inline workflow-bound constants in the two `.js` files
 * (which can't directly import the `.ts` canonical due to bare-Node load
 * constraints — see [[feedback_bare_node_smoke_test]]) match the canonical
 * values at `lib/services/workflow/types/orchestration-params.ts`.
 *
 * Per the 4-specialist Phase 4 verdict matrix (2026-05-16, Option C, 85% avg
 * confidence): structural drift detection replaces comment-as-contract.
 *
 * Run: `npx tsx scripts/test-workflow-schema-alignment.ts`
 * Exit code 0 = aligned. Exit code 1 = drift detected, build should fail.
 */

import {
  EXECUTION_MODES,
  FAILURE_STRATEGIES,
  WORKFLOW_TIMEOUT_BOUNDS,
  WORKFLOW_RETRY_BUDGET_BOUNDS,
  WORKFLOW_STEPS_BOUNDS,
  STEP_RETRIES_BOUNDS,
  STEP_RETRY_DELAY_BOUNDS,
} from '../lib/services/workflow/types/orchestration-params';

import * as fs from 'fs';
import * as path from 'path';

type Check = { name: string; canonical: unknown; inline: unknown; file: string };

const failures: Check[] = [];

function compare(check: Check) {
  const c = JSON.stringify(check.canonical);
  const i = JSON.stringify(check.inline);
  const ok = c === i;
  console.log(`${ok ? '✅' : '❌'} ${check.name}`);
  if (!ok) {
    console.log(`   canonical (${check.file}): ${c}`);
    console.log(`   inline copy:               ${i}`);
    failures.push(check);
  }
}

// Read the inline copies from the two .js files via regex extraction (we
// can't `require` them because they pull in the full Zod schema graph).
// This keeps the test pure-data — no module side effects.
function extractConst(filePath: string, name: string): string | null {
  const src = fs.readFileSync(filePath, 'utf-8');
  const re = new RegExp(`const ${name}\\s*=\\s*([^;]+);`, 'm');
  const m = src.match(re);
  return m ? m[1].trim() : null;
}

const TOOL_SCHEMAS = path.join(__dirname, '../lib/mcp/server/config/tool-schemas.js');
const WORKFLOW_HANDLER = path.join(__dirname, '../lib/mcp/server/tools/hub/workflow-tools-handler.js');

// === Tool-schemas (L1 dispatch boundary) ===

compare({
  name: 'L1 (tool-schemas.js) WORKFLOW_EXECUTION_MODES matches engine EXECUTION_MODES',
  canonical: [...EXECUTION_MODES],
  inline: eval(extractConst(TOOL_SCHEMAS, 'WORKFLOW_EXECUTION_MODES') || 'null'),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L1 (tool-schemas.js) WORKFLOW_FAILURE_STRATEGIES matches engine FAILURE_STRATEGIES',
  canonical: [...FAILURE_STRATEGIES],
  inline: eval(extractConst(TOOL_SCHEMAS, 'WORKFLOW_FAILURE_STRATEGIES') || 'null'),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L1 (tool-schemas.js) WORKFLOW_STEPS_MAX matches engine WORKFLOW_STEPS_BOUNDS.max',
  canonical: WORKFLOW_STEPS_BOUNDS.max,
  inline: parseInt(extractConst(TOOL_SCHEMAS, 'WORKFLOW_STEPS_MAX') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L1 (tool-schemas.js) WORKFLOW_RETRY_BUDGET_MIN matches engine',
  canonical: WORKFLOW_RETRY_BUDGET_BOUNDS.min,
  inline: parseInt(extractConst(TOOL_SCHEMAS, 'WORKFLOW_RETRY_BUDGET_MIN') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L1 (tool-schemas.js) WORKFLOW_RETRY_BUDGET_MAX matches engine',
  canonical: WORKFLOW_RETRY_BUDGET_BOUNDS.max,
  inline: parseInt(extractConst(TOOL_SCHEMAS, 'WORKFLOW_RETRY_BUDGET_MAX') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L1 (tool-schemas.js) WORKFLOW_RETRY_BUDGET_DEFAULT matches engine',
  canonical: WORKFLOW_RETRY_BUDGET_BOUNDS.default,
  inline: parseInt(extractConst(TOOL_SCHEMAS, 'WORKFLOW_RETRY_BUDGET_DEFAULT') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L1 (tool-schemas.js) STEP_RETRIES_MIN matches engine',
  canonical: STEP_RETRIES_BOUNDS.min,
  inline: parseInt(extractConst(TOOL_SCHEMAS, 'STEP_RETRIES_MIN') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L1 (tool-schemas.js) STEP_RETRIES_MAX matches engine',
  canonical: STEP_RETRIES_BOUNDS.max,
  inline: parseInt(extractConst(TOOL_SCHEMAS, 'STEP_RETRIES_MAX') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L1 (tool-schemas.js) STEP_RETRY_DELAY_MIN matches engine',
  canonical: STEP_RETRY_DELAY_BOUNDS.min,
  inline: parseInt(extractConst(TOOL_SCHEMAS, 'STEP_RETRY_DELAY_MIN') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L1 (tool-schemas.js) STEP_RETRY_DELAY_MAX matches engine',
  canonical: STEP_RETRY_DELAY_BOUNDS.max,
  inline: parseInt(extractConst(TOOL_SCHEMAS, 'STEP_RETRY_DELAY_MAX') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

// === Workflow-tools-handler (L3 handler boundary) ===

compare({
  name: 'L3 (workflow-tools-handler.js) WORKFLOW_EXECUTION_MODES matches engine',
  canonical: [...EXECUTION_MODES],
  inline: eval(extractConst(WORKFLOW_HANDLER, 'WORKFLOW_EXECUTION_MODES') || 'null'),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L3 (workflow-tools-handler.js) WORKFLOW_FAILURE_STRATEGIES matches engine',
  canonical: [...FAILURE_STRATEGIES],
  inline: eval(extractConst(WORKFLOW_HANDLER, 'WORKFLOW_FAILURE_STRATEGIES') || 'null'),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L3 (workflow-tools-handler.js) WORKFLOW_STEPS_MAX matches engine',
  canonical: WORKFLOW_STEPS_BOUNDS.max,
  inline: parseInt(extractConst(WORKFLOW_HANDLER, 'WORKFLOW_STEPS_MAX') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L3 (workflow-tools-handler.js) WORKFLOW_TIMEOUT_MIN matches engine',
  canonical: WORKFLOW_TIMEOUT_BOUNDS.min,
  inline: parseInt(extractConst(WORKFLOW_HANDLER, 'WORKFLOW_TIMEOUT_MIN') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L3 (workflow-tools-handler.js) WORKFLOW_TIMEOUT_MAX matches engine',
  canonical: WORKFLOW_TIMEOUT_BOUNDS.max,
  inline: parseInt(extractConst(WORKFLOW_HANDLER, 'WORKFLOW_TIMEOUT_MAX') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L3 (workflow-tools-handler.js) WORKFLOW_TIMEOUT_DEFAULT matches engine',
  canonical: WORKFLOW_TIMEOUT_BOUNDS.default,
  inline: parseInt(extractConst(WORKFLOW_HANDLER, 'WORKFLOW_TIMEOUT_DEFAULT') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L3 (workflow-tools-handler.js) WORKFLOW_RETRY_BUDGET_MIN matches engine',
  canonical: WORKFLOW_RETRY_BUDGET_BOUNDS.min,
  inline: parseInt(extractConst(WORKFLOW_HANDLER, 'WORKFLOW_RETRY_BUDGET_MIN') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L3 (workflow-tools-handler.js) WORKFLOW_RETRY_BUDGET_MAX matches engine',
  canonical: WORKFLOW_RETRY_BUDGET_BOUNDS.max,
  inline: parseInt(extractConst(WORKFLOW_HANDLER, 'WORKFLOW_RETRY_BUDGET_MAX') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

compare({
  name: 'L3 (workflow-tools-handler.js) WORKFLOW_RETRY_BUDGET_DEFAULT matches engine',
  canonical: WORKFLOW_RETRY_BUDGET_BOUNDS.default,
  inline: parseInt(extractConst(WORKFLOW_HANDLER, 'WORKFLOW_RETRY_BUDGET_DEFAULT') || '0', 10),
  file: 'lib/services/workflow/types/orchestration-params.ts',
});

console.log('');
if (failures.length > 0) {
  console.error(`\n❌ DRIFT DETECTED: ${failures.length} bound(s) diverge from canonical.`);
  console.error('Fix: update the inline copy in the .js file to match orchestration-params.ts');
  process.exit(1);
} else {
  console.log(`✅ All workflow schema bounds aligned across L1 + L3 + engine.`);
  process.exit(0);
}
