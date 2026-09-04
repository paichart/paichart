#!/usr/bin/env ts-node
/**
 * RESOURCE-AUTHZ COVERAGE GATE (2026-06-13 — gated in validation-reusable.yml
 * beside test:demo-write-coverage; the two structural authz gates travel together)
 *
 * Pins the uniform boundary contract from
 * cline_docs/reviews/resource-boundary-contract-2026-06-13/IMPLEMENTATION-PLAN-v2.md
 * (boundary-contract 96/88, validation-engine 88, arch 93 GO, sec-ops 93 GO):
 *
 *  (a) every resource method the embedded dispatch exposes carries a
 *      CLASSIFICATION entry — a 9th method added without one FAILS CI;
 *  (b) every classified method still exists — rename/delete drift FAILS;
 *  (c) every method body calls assertResourceAuthz with ITS OWN resource name
 *      (comment-stripped pins — a comment can't satisfy the marker);
 *  (d) no method body contains the fabrication anti-patterns the contract
 *      eliminated (role:'ADMIN' fallback, ||/?? 'system' identity);
 *  (e) the INTERNAL_READ_ALLOWED method keeps the explicit if(userContext)
 *      Pattern-B guard + validateMCPPOVAccess;
 *  (f) the resourceManager cache sites keep the Phase-0 classification-aware
 *      skip (isCacheableResource) and the never-cache-error_result guard —
 *      the user-blind cache must never carry tenant content again.
 *
 * Static by design (fs.readFileSync, never import): the methods all reach
 * lib/prisma.ts, which breaks DATABASE_URL-less CI runners if imported.
 * Behavioral negative-control pins for assertResourceAuthz itself live in
 * scripts/test-security-invariants.ts §G (the helper is prisma-free).
 *
 * Fails closed: anything unclassified or missing its pin → build fails.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const EMBEDDED = path.join(ROOT, 'lib/mcp/embedded-server.ts');
const AUTHZ_MODULE = path.join(ROOT, 'lib/mcp/resource-authz.ts');
const RESOURCE_MANAGER = path.join(ROOT, 'lib/services/mcp/resourceManager.ts');

// Reason-carrying classification map — the ONLY hardcoded list in this gate.
// Must mirror RESOURCE_AUTHZ in lib/mcp/resource-authz.ts (assertion 1 checks).
const CLASSIFICATION: Record<string, { method: string; cls: 'TENANT' | 'INTERNAL_READ_ALLOWED' | 'PUBLIC'; reason: string }> = {
  'pov-database': { method: 'getPOVDatabaseContent', cls: 'TENANT', reason: 'row-level POV data; buildPOVAccessFilter scoping' },
  'task-database': { method: 'getTaskDatabaseContent', cls: 'TENANT', reason: 'row-level task data; buildTaskAccessFilter scoping' },
  'ai-recommendations': { method: 'getAIRecommendationsContent', cls: 'TENANT', reason: 'per-user activity-derived; was fabricate-system' },
  'team-performance': { method: 'getTeamPerformanceContent', cls: 'TENANT', reason: 'Finding 2 fix — option (a) accessible-POV scoping (Steve 2026-06-13)' },
  'agent-execution': { method: 'getAgentExecutionContent', cls: 'TENANT', reason: 'was fabricate-ADMIN; internal caller was a phantom (zero callers) — future internal caller needs sec-ops sign-off' },
  'agent-artifact': { method: 'getAgentArtifactContent', cls: 'INTERNAL_READ_ALLOWED', reason: 'documented mid-run internal read; explicit Pattern-B guard' },
  'agent-templates': { method: 'getAgentTemplatesContent', cls: 'PUBLIC', reason: 'global catalog — only nullable createdBy, no tenant' },
  'system-logs': { method: 'getSystemLogsContent', cls: 'PUBLIC', reason: 'mock/static data' },
};

function stripComments(c: string): string {
  return c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const failures: string[] = [];
const embeddedSrc = fs.readFileSync(EMBEDDED, 'utf8');
const embeddedCode = stripComments(embeddedSrc);

// ── 1. Derive the method universe from SOURCE (not the map) ──
// Every `private async get<X>Content(` declaration is a resource method.
const methodUniverse = new Set<string>();
for (const m of embeddedCode.matchAll(/private\s+async\s+(get\w+Content)\s*\(/g)) {
  methodUniverse.add(m[1]);
}
if (methodUniverse.size === 0) {
  failures.push('universe derivation broke — zero get*Content methods found in embedded-server.ts');
}

// Cross-check: the runtime map in resource-authz.ts must classify the same names.
const authzSrc = stripComments(fs.readFileSync(AUTHZ_MODULE, 'utf8'));
for (const name of Object.keys(CLASSIFICATION)) {
  if (!new RegExp(`['"]${name}['"]\\s*:`).test(authzSrc)) {
    failures.push(`'${name}' classified in this gate but MISSING from RESOURCE_AUTHZ in lib/mcp/resource-authz.ts`);
  }
}

// ── 2. Assertion (a): every source method is classified ──
const classifiedMethods = new Set(Object.values(CLASSIFICATION).map(c => c.method));
for (const method of methodUniverse) {
  if (!classifiedMethods.has(method)) {
    failures.push(`UNCLASSIFIED resource method '${method}' — add it to RESOURCE_AUTHZ (lib/mcp/resource-authz.ts) AND this gate's CLASSIFICATION map with a reason`);
  }
}

// ── 3. Assertion (b): every classified method still exists ──
for (const [name, { method }] of Object.entries(CLASSIFICATION)) {
  if (!methodUniverse.has(method)) {
    failures.push(`classified method '${method}' (resource '${name}') no longer exists in embedded-server.ts — rename/delete drift`);
  }
}

// ── 4. Per-method body pins (assertions c, d, e) ──
function methodBody(method: string): string | null {
  const declIdx = embeddedCode.indexOf(`private async ${method}(`);
  if (declIdx === -1) return null;
  const next = embeddedCode.slice(declIdx + 10).search(/\n\s{2}(private|public|async|\/\/ =====)\s/);
  return next === -1 ? embeddedCode.slice(declIdx) : embeddedCode.slice(declIdx, declIdx + 10 + next);
}

for (const [name, { method, cls }] of Object.entries(CLASSIFICATION)) {
  const body = methodBody(method);
  if (!body) continue; // assertion (b) already flagged it

  // (c) the method asserts its own classification, first-line-before-try
  if (!body.includes(`assertResourceAuthz('${name}'`)) {
    failures.push(`'${method}' does not call assertResourceAuthz('${name}', ...) — the boundary guard was removed or renamed`);
  }
  // guard must come BEFORE the try (catches swallow throws into benign payloads)
  const guardIdx = body.indexOf(`assertResourceAuthz('${name}'`);
  const tryIdx = body.indexOf('try {');
  if (guardIdx !== -1 && tryIdx !== -1 && guardIdx > tryIdx) {
    failures.push(`'${method}': assertResourceAuthz sits INSIDE the try block — its catch would swallow authz violations into a benign payload`);
  }

  // (d) fabrication anti-patterns must never return
  if (/role:\s*['"]ADMIN['"]/.test(body)) {
    failures.push(`'${method}' contains a fabricated role:'ADMIN' — the exact fail-open shape this contract eliminated`);
  }
  if (/(\|\||\?\?)\s*['"]system['"]/.test(body) || /userId:\s*['"]system['"]/.test(body)) {
    failures.push(`'${method}' contains a fabricated 'system' identity — the exact fail-open shape this contract eliminated`);
  }

  // (e) Pattern B stays explicit for the INTERNAL method
  if (cls === 'INTERNAL_READ_ALLOWED') {
    if (!body.includes('if (userContext)') || !body.includes('validateMCPPOVAccess')) {
      failures.push(`'${method}' (INTERNAL_READ_ALLOWED) lost its explicit if(userContext) + validateMCPPOVAccess Pattern-B guard`);
    }
  }
}

// ── 5. Assertion (f): Phase-0 cache pins in resourceManager.ts ──
const rmCode = stripComments(fs.readFileSync(RESOURCE_MANAGER, 'utf8'));
if (!rmCode.includes('isCacheableResource')) {
  failures.push('resourceManager.ts no longer consults isCacheableResource — the user-blind cache would carry tenant content again (Phase 0 / arch F1, sec-ops HIGH)');
} else {
  // both the read gate and the write gate must be classification-aware
  const cacheableUses = (rmCode.match(/cacheable\s*&&/g) || []).length;
  if (cacheableUses < 2) {
    failures.push(`resourceManager.ts has ${cacheableUses} cacheable-guarded cache site(s); expected 2 (read + write) — one side of the Phase-0 skip was removed`);
  }
}
if (!/type\s*===\s*['"]error_result['"]/.test(rmCode)) {
  failures.push('resourceManager.cacheContent lost the never-cache-error_result guard (Phase 0.3 — cached-error DoS)');
}

// ── 6. The dispatch guard is wired ──
if (!embeddedCode.includes('resolveResourceName(uri)')) {
  failures.push('embedded-server.readResource no longer resolves the resource name for the dispatch guard');
}

// ── Verdict ──
if (failures.length > 0) {
  console.error(`\n❌ resource-authz coverage gate FAILED (${failures.length}):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`✅ resource-authz coverage gate PASSED (${methodUniverse.size} methods classified: ${[...Object.entries(CLASSIFICATION)].map(([n, c]) => `${n}=${c.cls}`).join(', ')}; cache skip + error_result guard pinned)`);
