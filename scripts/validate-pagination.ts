#!/usr/bin/env ts-node
/**
 * Pagination Safety Cap Validation
 *
 * Scans all findMany calls in app/ and lib/ to ensure they have `take` safety caps.
 * Reports bounded vs unbounded calls and flags any unbounded calls not in the allowlist.
 *
 * Created: 2026-02-20 (Phase 5 - Pagination Gap Remediation)
 *
 * Usage:
 *   npm run validate:pagination
 *   npx ts-node scripts/validate-pagination.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// ============================================================
// Allowlist: Intentionally unbounded findMany calls
// Each entry: "relative/path.ts:lineNumber" or pattern
//
// ⚠️ Entries are keyed by FILE PATH, not path:line — allowlisting a file exempts
// EVERY unbounded findMany in it, including ones added later. Prefer adding a
// `take` over an allowlist entry; when allowlisting, state WHY the complete set is
// required, so the next reader can tell "needs all rows" from "nobody got round to it".
// ============================================================

const INTENTIONALLY_UNBOUNDED: Record<string, string> = {
  // --- Export endpoints (full data by design) ---
  'app/api/tasks/[taskId]/activities/export/route.ts': 'Export endpoint — full data needed',
  'app/api/phase-templates/export/route.ts': 'Export endpoint — full template data needed',

  // --- Small static/reference tables (<50 rows) ---
  'app/api/admin/permissions/route.ts': 'Small static table — rolePermission (~20 rows)',
  'lib/admin/services/role.ts': 'Small static table — roles (~10 rows)',

  // --- Graph traversal (needs full subgraph) ---
  'app/api/pov/check-circular-dependency/route.ts': 'Dependency graph — needs full graph for cycle detection',
  'lib/utils/graph.ts': 'Topological sort — capping allTasks would corrupt the adjacency list, not merely truncate it (sibling allDeps query IS take-bounded at 5000)',

  // --- Complete-set-or-wrong-answer (2026-07-28 audit) ---
  // These are NOT "we forgot a take". Each is scoped to a single parent entity AND
  // produces an aggregate/invariant that a cap would silently CORRUPT rather than
  // shorten — the same silent-truncation class as the discovery pagination bug
  // fixed the same day. Adding `take` here to satisfy a coverage number would
  // manufacture the defect the gate exists to prevent.
  'lib/tasks/services/complete-task-terminally.ts': 'Scoped by stageId — ALL PIPELINE children needed; a cap yields a wrong aggregate quality-gate score',
  'lib/agents/harness/context-chainer.ts': 'Scoped by taskId — the tail-first trim invariant ("earliest/most-foundational output survives whole", CC2b) requires the complete ordered list',
  'lib/agents/harness/verdict-mismatch-guard.ts': 'Scoped by stageId — needs all siblings to detect PIPELINE tier (F21); a partial set silently mis-tiers the guard',

  // --- Bounded by IN clause (array of known IDs from paginated parent) ---
  'app/api/tasks/bulk/move/route.ts': 'Bounded by { in: taskIds } or { in: povIds }',
  'app/api/tasks/bulk/update/route.ts': 'Bounded by { in: taskIds } or { in: povIds }',
  'app/api/pov/[povId]/team/members/batch/route.ts': 'Bounded by { in: emails } or scoped by teamId',
  'lib/tasks/services/taskActivityService.ts': 'Bounded by { in: topUserIds } from take:5 query',

  // --- Scoped by specific entity ID (single-entity lookups) ---
  'app/api/pov/[povId]/phase/[phaseId]/task/[taskId]/dependencies/route.ts': 'Scoped by taskId — small result set',
  'app/api/pov/agent/artifacts/[executionId]/route.ts': 'Scoped by executionId — typically <20 artifacts',
  'app/api/pov/agent/execute/stream/route.ts': 'Post-create fetch — bounded by just-created artifacts',
  'app/api/tasks/[taskId]/activities/summary/route.ts': 'Scoped by taskId — activity summary',
  'app/api/tasks/[taskId]/agent/route.ts': 'Scoped by taskId — agent executions for one task',
  'app/api/pov/[povId]/phase-templates/route.ts': 'Scoped by povId — phase templates for one POV',
  'app/api/phase-templates/[id]/route.ts': 'Reference check — POVs using a specific template',
  'app/api/tasks/agent/executions/route.ts': 'Scoped by taskId — completed executions for one task',

  // --- POV route batch lookups (bounded by result set IDs) ---
  'app/api/pov/route.ts': 'Batch lookups bounded by { in: ids } from paginated parent query',

  // --- Admin CRM sync (needs all POV IDs for sync) ---
  'app/api/admin/crm/sync/route.ts': 'CRM sync — needs all POV IDs, admin-only endpoint',

  // --- MCP consent policy (scoped by userId) ---
  'lib/mcp/server/config/user-consent-policy.js': 'Scoped by userId — user consent records',

  // --- Date-bounded analytics/aggregation (WHERE gte: startDate) ---
  'app/api/analytics/domains/agents/summary.ts': 'Date-bounded aggregation — startTime >= startDate',
  'app/api/analytics/domains/overview/index.ts': 'Date-bounded aggregation — createdAt/startTime >= startDate',
  'app/api/analytics/domains/tasks/insights.ts': 'Date-bounded aggregation — scoped by POV + date filters',
  'app/api/analytics/domains/tasks/performance.ts': 'Date-bounded aggregation — scoped by POV + status filters',
  'app/api/analytics/domains/team/activity.ts': 'Team-scoped aggregation — bounded by team membership',
  'app/api/tasks/global/activities/summary/route.ts': 'Date-bounded aggregation — activity summary',

  // --- Batch lookups from paginated parent query (IN-clause bounded) ---
  'lib/tasks/handlers/get.ts': 'Batch lookups bounded by { in: ids } from paginated task query; main query has take',
  'lib/tasks/services/task.ts': 'Team members scoped by teamId — small per-team result set',
};

// ============================================================
// Scanner
// ============================================================

interface FindManyCall {
  file: string;
  line: number;
  code: string;
  hasTake: boolean;
}

function scanFile(filepath: string): FindManyCall[] {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const results: FindManyCall[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('.findMany(')) continue;

    // Skip comments
    const stripped = line.trim();
    if (stripped.startsWith('//') || stripped.startsWith('*') || stripped.startsWith('/*')) continue;

    // Find the matching closing paren/brace by tracking depth
    const lineStart = lines.slice(0, i).reduce((acc, l) => acc + l.length + 1, 0);
    const findManyIdx = content.indexOf('.findMany(', lineStart);
    if (findManyIdx === -1) continue;

    const parenStart = content.indexOf('(', findManyIdx + '.findMany'.length);
    if (parenStart === -1) continue;

    let depth = 0;
    let block = '';
    for (let j = parenStart; j < Math.min(parenStart + 2000, content.length); j++) {
      const c = content[j];
      block += c;
      if (c === '(' || c === '{') depth++;
      else if (c === ')' || c === '}') {
        depth--;
        if (depth === 0) break;
      }
    }

    // Match both `take: N` (explicit) and `take,` or `take }` (shorthand property)
    const hasTake = /take\s*:/.test(block) || /[,{\s]take[,}\s]/.test(block);

    results.push({
      file: filepath,
      line: i + 1,
      code: stripped.substring(0, 120),
      hasTake,
    });
  }

  return results;
}

// ============================================================
// Main
// ============================================================

console.log('🔍 Pagination Safety Cap Validation\n');

const sourceFiles = glob.sync('{app,lib}/**/*.{ts,js}', {
  ignore: ['**/node_modules/**', '**/.next/**'],
  cwd: path.join(__dirname, '..'),
});

let totalCalls = 0;
let boundedCalls = 0;
let unboundedAllowed = 0;
let unboundedGaps: FindManyCall[] = [];

const fileResults: FindManyCall[] = [];

for (const file of sourceFiles) {
  // Skip dead code
  if (file.includes('pov-original.ts')) continue;

  const fullPath = path.join(__dirname, '..', file);
  const calls = scanFile(fullPath);
  fileResults.push(...calls.map(c => ({ ...c, file })));
}

for (const call of fileResults) {
  totalCalls++;
  if (call.hasTake) {
    boundedCalls++;
  } else {
    // Check if file is in the allowlist
    const isAllowed = Object.keys(INTENTIONALLY_UNBOUNDED).some(
      pattern => call.file.includes(pattern)
    );
    if (isAllowed) {
      unboundedAllowed++;
    } else {
      unboundedGaps.push(call);
    }
  }
}

// ============================================================
// Report
// ============================================================

const boundedPct = ((boundedCalls / totalCalls) * 100).toFixed(1);
const allowedPct = (((boundedCalls + unboundedAllowed) / totalCalls) * 100).toFixed(1);

console.log('=====================================');
console.log('Pagination Coverage Summary');
console.log('=====================================\n');

console.log(`📊 Total findMany calls:     ${totalCalls}`);
console.log(`✅ Bounded (has take):        ${boundedCalls} (${boundedPct}%)`);
console.log(`📋 Intentionally unbounded:   ${unboundedAllowed}`);
console.log(`⚠️  Remaining gaps:            ${unboundedGaps.length}`);
console.log(`📈 Effective coverage:        ${allowedPct}%`);
console.log();

if (unboundedGaps.length > 0) {
  console.log('=====================================');
  console.log('Remaining Gaps (need take or allowlist)');
  console.log('=====================================\n');

  // Group by directory
  const byDir: Record<string, FindManyCall[]> = {};
  for (const gap of unboundedGaps) {
    const dir = path.dirname(gap.file);
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push(gap);
  }

  for (const [dir, gaps] of Object.entries(byDir).sort()) {
    console.log(`  ${dir}/`);
    for (const gap of gaps.sort((a, b) => a.line - b.line)) {
      console.log(`    ${path.basename(gap.file)}:${gap.line}  ${gap.code.substring(0, 80)}`);
    }
    console.log();
  }
}

console.log('=====================================');
console.log('Validation Result');
console.log('=====================================\n');

// Thresholds
const COVERAGE_TARGET = 90; // % of calls that should be bounded or allowlisted
const effectiveCoverage = ((boundedCalls + unboundedAllowed) / totalCalls) * 100;

if (effectiveCoverage >= COVERAGE_TARGET) {
  console.log(`✅ Pagination coverage: ${effectiveCoverage.toFixed(1)}% (target: ${COVERAGE_TARGET}%)`);
  console.log('✅ Pagination validation PASSED\n');
  process.exit(0);
} else {
  console.log(`❌ Pagination coverage: ${effectiveCoverage.toFixed(1)}% (target: ${COVERAGE_TARGET}%)`);
  console.log(`❌ Need ${(COVERAGE_TARGET - effectiveCoverage).toFixed(1)}% more coverage`);
  console.log('❌ Pagination validation FAILED\n');
  process.exit(1);
}
