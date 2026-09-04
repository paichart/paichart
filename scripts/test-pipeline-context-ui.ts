#!/usr/bin/env ts-node
/**
 * Pipeline Context UI Tests — Commit 2 (Phase 2.0a + 3)
 *
 * Layer 1 pattern validation for the rewritten PipelineTab.tsx, new
 * PipelineSiblingsBlock.tsx, reconciled SignalTypes.ts, and the new
 * /api/pov/[povId]/phase/[phaseId]/pipeline-context endpoint.
 *
 * Regression guards against:
 *   - Reintroducing the "Sibling/children list deferred" dev-comment
 *     placeholder
 *   - SignalTypes.ts drift-bomb coming back (the old `children` /
 *     `childrenCount` shape)
 *   - Dropping the `← you` marker (memorable UX element)
 *   - Dropping POV-scoping defense-in-depth from the raw SQL (B4)
 *   - Dropping the taskId belongs-to-POV check (B3)
 *
 * Created: 2026-04-18
 * Plan: cline_docs/reviews/pipeline-context-a6-2026-04-18/implementation-plan.md §Phase 2+3
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🎛️  Pipeline Context UI Tests (Commit 2 pattern validation)\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    failed++;
  }
}

function expect(value: any) {
  return {
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected string to contain "${substring}"`);
      }
    },
    toMatch(re: RegExp) {
      if (typeof value !== 'string' || !re.test(value)) {
        throw new Error(`Expected string to match ${re}`);
      }
    },
    toNotContain(substring: string) {
      if (typeof value === 'string' && value.includes(substring)) {
        throw new Error(`Expected string NOT to contain "${substring}"`);
      }
    },
  };
}

const REPO_ROOT = path.resolve(__dirname, '..');

const signalTypesSource = fs.readFileSync(
  path.join(REPO_ROOT, 'components/poveditor/pov/components/tabs/signals/SignalTypes.ts'),
  'utf-8'
);
const tabSource = fs.readFileSync(
  path.join(REPO_ROOT, 'components/poveditor/pov/components/tabs/PipelineTab.tsx'),
  'utf-8'
);
const blockSource = fs.readFileSync(
  path.join(REPO_ROOT, 'components/poveditor/pov/components/tabs/signals/PipelineSiblingsBlock.tsx'),
  'utf-8'
);
const routeSource = fs.readFileSync(
  path.join(REPO_ROOT, 'app/api/pov/[povId]/phase/[phaseId]/pipeline-context/route.ts'),
  'utf-8'
);
const zodSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/validation/pipeline-context-schemas.ts'),
  'utf-8'
);

// ========================================
// T: SignalTypes.ts reconciliation (B2)
// ========================================

console.log('--- T: SignalTypes.ts reconciliation ---\n');

test('T1: PipelineContext is a discriminated union with role as discriminant', () => {
  // Must be a union type with HARNESS | CHILD | NONE branches.
  expect(signalTypesSource).toMatch(/export\s+type\s+PipelineContext\s*=/);
  expect(signalTypesSource).toMatch(/role:\s*['"]HARNESS['"]/);
  expect(signalTypesSource).toMatch(/role:\s*['"]CHILD['"]/);
  expect(signalTypesSource).toMatch(/role:\s*['"]NONE['"]/);
});

test('T2: Old shape fields childrenCount and `children?:` GONE from the PipelineContext type (comment mentions ok)', () => {
  // Drift-bomb fields must not exist as actual declarations. The JSDoc mentions
  // them in the "supersedes" explanation — that's fine. Target the TS syntax
  // so comments pass through.
  if (/^\s*childrenCount\s*[?:]/m.test(signalTypesSource)) {
    throw new Error('Found `childrenCount: ...` field declaration in SignalTypes.ts');
  }
  if (/^\s*children\s*\?:/m.test(signalTypesSource)) {
    throw new Error('Found `children?: ...` field declaration in SignalTypes.ts');
  }
});

test('T3: New SiblingRow, PipelineCounts, ParentHarnessSummary exported', () => {
  expect(signalTypesSource).toMatch(/export\s+interface\s+SiblingRow/);
  expect(signalTypesSource).toMatch(/export\s+interface\s+PipelineCounts/);
  expect(signalTypesSource).toMatch(/export\s+interface\s+ParentHarnessSummary/);
});

test('T4: ExecutionStatus enum values match Prisma schema (no CANCELLED/TIMEOUT)', () => {
  // ExecutionStatus is a client-side type literal union; must match server's enum.
  expect(signalTypesSource).toMatch(/['"]PENDING['"]/);
  expect(signalTypesSource).toMatch(/['"]SUCCESS['"]/);
  expect(signalTypesSource).toMatch(/['"]FAILED['"]/);
  // But not the phantom statuses (L3 session caught this on agent_executions;
  // same risk on tasks.executionStatus).
  const execStatusBlock = signalTypesSource.match(/export\s+type\s+ExecutionStatus\s*=[\s\S]*?;/);
  if (!execStatusBlock) throw new Error('ExecutionStatus type declaration not found');
  if (execStatusBlock[0].includes('CANCELLED')) {
    throw new Error('ExecutionStatus includes CANCELLED (phantom status — not on schema)');
  }
  if (execStatusBlock[0].includes('TIMEOUT')) {
    throw new Error('ExecutionStatus includes TIMEOUT (phantom status — not on schema)');
  }
});

// ========================================
// P: PipelineTab.tsx rewrite (Phase 3)
// ========================================

console.log('\n--- P: PipelineTab rewrite ---\n');

test('P1: deferred placeholder string is GONE (primary regression guard)', () => {
  expect(tabSource).toNotContain('Sibling/children list deferred');
  expect(tabSource).toNotContain('will populate after A6 JSONB index ships');
});

test('P2: imports PipelineSiblingsBlock', () => {
  expect(tabSource).toMatch(/import\s*\{[^}]*PipelineSiblingsBlock[^}]*\}\s*from/);
});

test('P3: fetches from new pipeline-context endpoint', () => {
  expect(tabSource).toContain('/pipeline-context?taskId=');
});

test('P4: uses graceful-degradation fallback on API failure', () => {
  expect(tabSource).toMatch(/localFallbackContext/);
});

test('P4a: ctx is ALWAYS initialized (no null-ctx render gap when props missing)', () => {
  // Bug caught 2026-04-20: if povId/phaseId/taskId falsy at mount, the
  // earlier effect returned early without calling setCtx, leaving ctx=null
  // and NOTHING pipeline-related rendering. Regression guard: ensure the
  // early-return path calls setCtx(localFallbackContext(...)) before return.
  const earlyReturnMatch = tabSource.match(
    /if\s*\(\s*!povId\s*\|\|\s*!phaseId\s*\|\|\s*!taskId\s*\)\s*\{[\s\S]*?return;?\s*\}/
  );
  if (!earlyReturnMatch) {
    throw new Error('Could not locate the prop-guard early-return in the effect');
  }
  if (!/setCtx\(localFallbackContext/.test(earlyReturnMatch[0])) {
    throw new Error(
      'Prop-guard early-return must call setCtx(localFallbackContext(...)) before returning — otherwise ctx stays null and nothing renders'
    );
  }
});

test('P5: role HUD render path exists', () => {
  expect(tabSource).toMatch(/PipelineRoleHUD/);
});

test('P6: HARNESS and CHILD render paths both use PipelineSiblingsBlock', () => {
  const harnessBlockMatch = /ctx\.role\s*===\s*['"]HARNESS['"][\s\S]{0,500}<PipelineSiblingsBlock/.test(tabSource);
  const childBlockMatch = /ctx\.role\s*===\s*['"]CHILD['"][\s\S]{0,500}<PipelineSiblingsBlock/.test(tabSource);
  if (!harnessBlockMatch) throw new Error('HARNESS role does not render PipelineSiblingsBlock');
  if (!childBlockMatch) throw new Error('CHILD role does not render PipelineSiblingsBlock');
});

test('P7: CHILD render path passes selfTaskId so PipelineSiblingsBlock shows ← you', () => {
  expect(tabSource).toMatch(/selfTaskId=\{taskId\}/);
});

test('P8: separate /stages fetch has been removed (childStageName now inline from endpoint)', () => {
  // The pre-A6 tab had a useEffect fetching /stages for childStageName. Post-A6
  // the pipeline-context endpoint returns it inline. Regression guard: ensure
  // the removed fetch doesn't come back.
  expect(tabSource).toNotContain('/stages`');
  expect(tabSource).toNotContain('setChildStageName');
});

// ========================================
// B: PipelineSiblingsBlock structure
// ========================================

console.log('\n--- B: PipelineSiblingsBlock ---\n');

test('B1: ← you marker literal present (memorable design regression guard)', () => {
  expect(blockSource).toContain('← you');
});

test('B2: uses Bloomberg constants (frontend-provocateur I4)', () => {
  expect(blockSource).toMatch(/import\s*\{[^}]*BLOOMBERG_COLORS[^}]*\}\s*from\s*['"]@\/lib\/constants\/bloomberg-styles['"]/);
});

test('B3: supports both CHILDREN and PEERS labels', () => {
  expect(blockSource).toMatch(/label:\s*['"]CHILDREN['"]\s*\|\s*['"]PEERS['"]/);
});

test('B4: scale behavior — overflow-y-auto when >20 rows', () => {
  expect(blockSource).toContain('max-h-[420px] overflow-y-auto');
});

test('B5: empty-state message when rows.length === 0', () => {
  expect(blockSource).toMatch(/rows\.length\s*===\s*0/);
  expect(blockSource).toContain('No child tasks templated yet');
});

test('B6: click handler wired via onSelectTask prop', () => {
  expect(blockSource).toMatch(/onSelectTask:\s*\(taskId:\s*string\)\s*=>\s*void/);
  expect(blockSource).toContain('onSelectTask(row.taskId)');
});

test('B7: truncated state renders a "more rows" indicator', () => {
  expect(blockSource).toMatch(/truncated\s*&&/);
});

// ========================================
// R: Route endpoint (POV-scoping + B3/B4/B5)
// ========================================

console.log('\n--- R: /pipeline-context endpoint ---\n');

test('R1: uses withPOVAccess middleware (not hand-rolled auth)', () => {
  expect(routeSource).toMatch(/import\s*\{[^}]*withPOVAccess[^}]*\}\s*from/);
  expect(routeSource).toMatch(/export\s+const\s+GET\s*=\s*withPOVAccess/);
});

test('R2 — B3 CRITICAL: validates taskId belongs to URL povId + phaseId', () => {
  // First Prisma query must be findFirst({where: {id: taskId, povId, phaseId}})
  // Returns 404 on mismatch (not 403) — don't leak cross-POV existence.
  expect(routeSource).toMatch(/prisma\.task\.findFirst[\s\S]*?where:\s*\{\s*id:\s*taskId[^}]*povId[^}]*phaseId/);
  expect(routeSource).toMatch(/status:\s*404/);
});

test('R3 — B4 CRITICAL: raw SQL includes explicit "pov_id" = povId predicate', () => {
  // Defense-in-depth even though withPOVAccess already validated POV.
  expect(routeSource).toMatch(/"pov_id"\s*=\s*\$\{povId\}/);
});

test('R4 — B5: nested-pipeline handling (HARNESS wins, parentHarness optional)', () => {
  // For a PIPELINE task that ALSO has a parent harness, role stays HARNESS
  // and parentHarness is set as optional. CHILD role only for non-PIPELINE.
  expect(routeSource).toContain('stays HARNESS');
  expect(routeSource).toMatch(/if\s*\(\s*task\.type\s*!==\s*['"]PIPELINE['"]\s*\)/);
});

test('R5: CUID format validation on taskId + phaseId', () => {
  expect(routeSource).toMatch(/validateCUIDFormat\(\s*taskId/);
  expect(routeSource).toMatch(/validateCUIDFormat\(\s*phaseId/);
});

test('R6: rate-limited via analyticsReadLimiter', () => {
  expect(routeSource).toContain('analyticsReadLimiter');
});

test('R7: cache headers set (max-age=15, Vary: Authorization)', () => {
  expect(routeSource).toContain('max-age=15');
  expect(routeSource).toContain("'Vary', 'Authorization'");
});

test('R8: Zod validation at the response boundary', () => {
  expect(routeSource).toMatch(/PipelineContextResponseSchema/);
  expect(routeSource).toMatch(/\.safeParse\(/);
});

test('R9: siblings capped at 50 with truncation flag', () => {
  expect(routeSource).toContain('SIBLINGS_CAP = 50');
  expect(routeSource).toMatch(/SIBLINGS_CAP\s*\+\s*1/);
});

// ========================================
// Z: Zod schemas file
// ========================================

console.log('\n--- Z: Zod schemas ---\n');

test('Z1: discriminated union matches SignalTypes.ts shape', () => {
  expect(zodSource).toMatch(/z\.discriminatedUnion\(\s*['"]role['"]/);
});

test('Z2: all three role variants (HARNESS, CHILD, NONE) declared', () => {
  expect(zodSource).toMatch(/z\.literal\(\s*['"]HARNESS['"]\s*\)/);
  expect(zodSource).toMatch(/z\.literal\(\s*['"]CHILD['"]\s*\)/);
  expect(zodSource).toMatch(/z\.literal\(\s*['"]NONE['"]\s*\)/);
});

test('Z3: SiblingRow includes errorCategory optional nullable', () => {
  expect(zodSource).toMatch(/errorCategory:\s*ErrorCategorySchema\.nullable\(\)\.optional\(\)/);
});

// ========================================
// H: HARNESS synthesis status (#1 — 2026-04-20)
// ========================================

console.log('\n--- H: Synthesis status indicator ---\n');

test('H1: PipelineContext HARNESS variant has synthesisStatus field', () => {
  expect(signalTypesSource).toMatch(/synthesisStatus\?:\s*'SYNTHESIZE'\s*\|\s*'CREATE'\s*\|\s*'ORCHESTRATE'\s*\|\s*null/);
});

test('H2: Zod schema enforces synthesisStatus enum', () => {
  expect(zodSource).toMatch(/synthesisStatus:\s*z\.enum\(\[\s*'SYNTHESIZE',\s*'CREATE',\s*'ORCHESTRATE'\s*\]\)\.nullable\(\)\.optional\(\)/);
});

test('H3: endpoint derives synthesisStatus from latest SUCCESS execution', () => {
  expect(routeSource).toContain("status: 'SUCCESS'");
  expect(routeSource).toMatch(/where:\s*\{\s*name:\s*'pipeline-index\.json'\s*\}/);
  expect(routeSource).toMatch(/protocolValidation\?\.mode/);
});

test('H4: endpoint degrades to null on parse failure (non-fatal)', () => {
  expect(routeSource).toMatch(/let\s+synthesisStatus[\s\S]{0,500}try[\s\S]{0,2500}catch/);
});

test('H5: PipelineRoleHUD renders "✓ synthesised" badge for SYNTHESIZE', () => {
  expect(tabSource).toMatch(/synthesisStatus\s*===\s*'SYNTHESIZE'/);
  expect(tabSource).toContain('synthesised');
  expect(tabSource).toContain('text-green-400');
});

test('H6: PipelineRoleHUD renders "⚠ SYNTHESIZE pending" for non-SYNTHESIZE states', () => {
  expect(tabSource).toMatch(/synthesisStatus\s*===\s*'CREATE'/);
  expect(tabSource).toContain('SYNTHESIZE pending');
});

test('H7: localFallbackContext initializes synthesisStatus to null', () => {
  expect(tabSource).toMatch(/synthesisStatus:\s*null/);
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=====================================');

if (failed > 0) {
  process.exit(1);
}
