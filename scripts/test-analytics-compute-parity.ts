#!/usr/bin/env ts-node
/**
 * Analytics Compute Unification (Tier 3) — security/guard tests.
 *
 * 1. F-D fail-closed floor (assertAnalyticsScoped): an unscoped query must THROW; povId / povIds
 *    (including [] — a valid fail-closed scope → { in: [] } → zero rows) / { scope:'GLOBAL_ADMIN' }
 *    must pass. This is the SEC-I1 backstop: a forgotten scope becomes a loud error, not a silent
 *    cross-tenant leak.
 * 2. I-2 no-unscoped-caller invariant: every caller of TaskAnalyticsService.getTaskPerformance /
 *    getTaskInsights outside the service must be on the verified scoped-caller allowlist. A new
 *    caller fails CI until reviewed + added — a tripwire (negative-controlled by the count guard).
 *
 * NOTE: live schema-shape parity (adapter output → PerformanceResponseSchema/InsightsResponseSchema,
 * serialize-roundtripped) is covered by `npm run validate:schemas` against a running server PLUS the
 * tab's hard `.parse()` in AnalyticsSection.tsx — those need a DB so they are not re-run here. This
 * file is CI-safe (no live queries).
 */

// CI guard: assertAnalyticsScoped lives in taskAnalyticsService.ts, which imports lib/prisma.ts.
// Stub DATABASE_URL before the import so module init doesn't throw on DB-less CI runners. The test
// never queries the DB (assertAnalyticsScoped is pure). Top-of-file placement is load-bearing.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub?sslmode=disable';
}

import * as fs from 'fs';
import * as path from 'path';
import { assertAnalyticsScoped } from '@/lib/services/taskAnalyticsService';

let passed = 0;
let failed = 0;
function expectThrow(fn: () => void, msg: string) {
  try { fn(); failed++; console.error(`❌ expected throw: ${msg}`); }
  catch { passed++; }
}
function expectOk(fn: () => void, msg: string) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`❌ unexpected throw: ${msg}`, e); }
}
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error(`❌ ${msg}`); }
}

// ── 1. F-D fail-closed floor ────────────────────────────────────────────────
expectThrow(() => assertAnalyticsScoped({}), 'unscoped {} must throw');
expectThrow(() => assertAnalyticsScoped({}, {}), 'unscoped {} + empty opts must throw');
expectThrow(() => assertAnalyticsScoped({}, { scope: undefined }), 'undefined scope must throw');
expectOk(() => assertAnalyticsScoped({ povId: 'pov_x' }), 'single povId is scoped');
expectOk(() => assertAnalyticsScoped({ povIds: [] }), 'empty povIds [] IS a scope (fail-closed → zero rows)');
expectOk(() => assertAnalyticsScoped({ povIds: ['a', 'b'] }), 'povIds list is scoped');
expectOk(() => assertAnalyticsScoped({}, { scope: 'GLOBAL_ADMIN' }), 'GLOBAL_ADMIN sentinel is scoped');

// ── 2. I-2 no-unscoped-caller invariant ─────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const SERVICE_REL = 'lib/services/taskAnalyticsService.ts';
// Callers verified (this session) to pass a scope (povId / povIds / GLOBAL_ADMIN sentinel):
const SCOPED_CALLER_ALLOWLIST = new Set([
  'app/api/analytics/domains/tasks/performance.ts',     // adapter → scope: adminGlobal ? 'GLOBAL_ADMIN'
  'app/api/analytics/domains/tasks/insights.ts',        // adapter → scope: adminGlobal ? 'GLOBAL_ADMIN'
  'app/api/mcp/tasks/context/route.ts',                 // { povId: task.povId }
  'lib/mcp/tasks/action/handlers/analytics/analytics-generate-handler.ts', // analyticsOpts GLOBAL_ADMIN
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|js)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))];
const foundCallers = new Set<string>();
for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  if (rel === SERVICE_REL) continue;
  const src = fs.readFileSync(f, 'utf8');
  if (src.includes('TaskAnalyticsService.getTaskPerformance(') || src.includes('TaskAnalyticsService.getTaskInsights(')) {
    foundCallers.add(rel);
    assert(
      SCOPED_CALLER_ALLOWLIST.has(rel),
      `NEW caller of getTaskPerformance/getTaskInsights not on the scoped allowlist: ${rel}\n   → verify it passes povId/povIds/scope, then add it to SCOPED_CALLER_ALLOWLIST.`
    );
  }
}
// Negative control: the allowlist must reflect reality (catches a stale allowlist after a caller is removed).
for (const rel of SCOPED_CALLER_ALLOWLIST) {
  assert(foundCallers.has(rel), `allowlisted caller no longer calls the service (stale allowlist entry): ${rel}`);
}

// ── 3. Error-category facts (2026-07-25) ─────────────────────────────────────────────
//
// `analyzeErrorPatterns` categorized every failed execution from `execution.error` — a
// column that has never existed on agent_executions — so the categorizer received
// undefined every time and returned 'unknown' for all of them. The downstream
// "Address Common Error Patterns" recommendation (priority high, impact high, consumed by
// the admin system-health surface) therefore fired on ANY failure while asserting
// "recurring error patterns detected that can be prevented" with the single detail
// `error: 'unknown'`. That is a VERDICT resting on an absent fact (Protocol 10).
//
// Source-level pins only — deliberately NOT requiring execution-analytics.js here: it
// module-imports lib/prisma, and this suite is the CI-safe (DB-less) one.
{
  const analyticsSrc = fs.readFileSync(
    path.join(ROOT, 'lib/mcp/server/utils/execution-analytics.js'), 'utf8'
  );

  assert(
    !/categorizeError\(execution\.error\)/.test(analyticsSrc),
    'analyzeErrorPatterns still categorizes from execution.error — a column that does not exist, so every category is "unknown"'
  );
  assert(
    /categorizeError\(execution\.errorCode\)/.test(analyticsSrc),
    'analyzeErrorPatterns must categorize from the real errorCode column'
  );
  assert(
    /if \(\/\^\[A-Z\]\[A-Z0-9_\]\+\$\/\.test\(errorMessage\)\) return errorMessage;/.test(analyticsSrc),
    'categorizeError must return a recorded errorCode VERBATIM (it is a site-authored fact, not a bucket for the free-text heuristics)'
  );
  assert(
    /const identifiedErrors = errorPatterns\.commonErrors\.filter\(e => e\.type !== 'unknown'\);/.test(analyticsSrc)
      && /if \(identifiedErrors\.length > 0\) \{/.test(analyticsSrc),
    'the error_reduction recommendation must be gated on at least one IDENTIFIED category — an all-unknown set is the absence of a detected pattern and earns no "patterns detected" claim'
  );
  assert(
    /details: identifiedErrors\.slice\(0, 3\)/.test(analyticsSrc),
    'the recommendation details must be drawn from identifiedErrors, not from the unfiltered set (else "unknown" reappears as a detail)'
  );
}

console.log(
  failed === 0
    ? `✅ analytics-compute-parity: ${passed} passed (F-D floor + I-2 caller invariant + error-category facts)`
    : `❌ analytics-compute-parity: ${failed} failed / ${passed} passed`
);
process.exit(failed === 0 ? 0 : 1);
