#!/usr/bin/env ts-node
/**
 * DEMO-WRITE COVERAGE GATE (2026-05-26, Protocol-2 reviewed — BLOCKING in production-deploy.yml)
 *
 * Enforces the invariant from the demo-write fix: every POV/child WRITE path must
 * either (a) go through `withPOVAccess` (which derives requireWrite from the HTTP
 * method), or (b) call validatePOVAccess/validateMCPPOVAccess with `requireWrite`,
 * or (c) be on the reason-carrying allowlist below. Any write path that does none
 * of these would let a DEMO viewer's `isDemo` flag grant a write (vandalism).
 *
 * The universe is FILESYSTEM-derived (every write-method route + every MCP action
 * handler + the .js hub/server tool layer), NOT "things that call the gate" — so
 * inline-isDemo checks, gate-absent routes, and delegating routes cannot be invisible
 * to the gate (that was v1's bug).
 *
 * 2026-05-27 (pentest G-2): Pass C extends coverage to lib/mcp/server (.ts + .js).
 * Previously the walk was .ts-only and never reached the hub/workflow .js layer, so a
 * demo-write reintroduced there passed CI green — the gate's blind spot coincided with
 * the .ts/.js seam where the riskiest divergent authz lived.
 *
 * Fails closed: anything not provably safe and not allowlisted → build fails.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const rel = (p: string) => path.relative(ROOT, p);

// Reason-carrying allowlist: write-method paths that legitimately need no requireWrite.
const ALLOWLIST: Record<string, string> = {
  'app/api/pov/route.ts': 'pov.create — capability-gated via checkPermission (DEMO=false); no instance to scope',
  'app/api/tasks/search/route.ts': 'POST-but-read (search); no mutation',
  'app/api/mcp/tasks/action/route.ts': 'delegates to TasksActionRouter → per-handler validatePOVAccess(requireWrite) (mcp-hub verified convergence)',
  'lib/mcp/tasks/action/handlers/agent/agent-status-handler.ts': 'read — execution status fetch',
  'lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts': 'read — results/artifacts fetch',
  'lib/mcp/tasks/action/handlers/analytics/analytics-generate-handler.ts': 'inline isDemo read-check; read-only report generation',
  'lib/mcp/tasks/action/handlers/pov/pov-create-handler.ts': 'pov.create — checkPermission capability gate (no validatePOVAccess)',
  // MCP infrastructure (service/tool/automation/recommendation), ADMIN- or checkPermission-gated,
  // NOT POV-content-scoped — out of scope for the isDemo demo-write (POV vandalism) fix.
  'app/api/pov/agent/execute-function/route.ts': 'ADMIN-gated whitelisted-function executor; no POV mutation',
  'app/api/mcp/automations/[id]/configure/route.ts': 'ADMIN-gated automation config; not POV-scoped',
  'app/api/mcp/automations/[id]/pause/route.ts': 'ADMIN-gated automation control; not POV-scoped',
  'app/api/mcp/automations/[id]/resume/route.ts': 'ADMIN-gated automation control; not POV-scoped',
  'app/api/mcp/recommendations/[id]/feedback/route.ts': 'ADMIN-gated recommendation feedback; not POV mutation',
  'app/api/mcp/servers/route.ts': 'ADMIN-gated MCP server registry; not POV-scoped',
  'app/api/mcp/servers/[serverId]/route.ts': 'ADMIN-gated MCP server registry; not POV-scoped',
  'app/api/mcp/servers/[serverId]/test/route.ts': 'ADMIN-gated MCP server test; not POV-scoped',
  'app/api/mcp/service-recommendations/route.ts': 'ADMIN-gated service recommendations; not POV-scoped',
  'app/api/mcp/tools/[toolId]/route.ts': 'MCP tool registry (checkPermission MCP_SERVICE, DEMO=false); not POV-scoped',
  'app/api/mcp/tools/[toolId]/test/route.ts': 'MCP tool registry test; not POV-scoped',
  'app/api/mcp/tools/discover/route.ts': 'MCP tool discovery (checkPermission MCP_SERVICE); not POV-scoped',
  'app/api/mcp/tools/register/route.ts': 'MCP tool registration (checkPermission MCP_SERVICE, DEMO=false); not POV-scoped',
  'app/api/mcp/tasks/recommendations/route.ts': 'recommendation generation — derived data, not shared-POV-content mutation',
  // 2026-05-27 (pentest G-2): the .js hub/server layer is now scanned (Pass C). This router's
  // 4 POV-access calls are all READS (handleGetPOVDetails/GetPOVPhases/ListTasks/GetTaskDetails,
  // dispatched from the read-only `project` tool) → requireWrite:false is correct (isDemo reads
  // demo POVs by design). Writes go through `handlePerform` → per-handler validatePOVAccess(requireWrite).
  'lib/mcp/server/tools/internal/InternalServiceRouter.js': 'read-only project-tool dispatch; requireWrite:false correct (isDemo demo-POV reads by design)',
};

function walk(dir: string, out: string[] = [], exts: string[] = ['.ts']): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, exts);
    else if (exts.some((x) => e.name.endsWith(x)) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.js'))
      out.push(p);
  }
  return out;
}

function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const cand of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

// Strip comments so marker checks reflect ACTUAL enforcement, not documentation
// (2026-05-27 pentest G-2: a comment that merely mentions requireWrite/withPOVAccess
// must NOT satisfy the gate — "audit the auditor"). Spares `://` in URLs.
function stripComments(c: string): string {
  return c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// in-file safety markers (operate on comment-stripped code)
const marksWrite = (c: string) => c.includes('withPOVAccess') || c.includes('requireWrite');

const failures: string[] = [];
const writeMethodRe = /export\s+(?:const|async\s+function)\s+(?:POST|PUT|PATCH|DELETE)\b/;

// ── Pass A: REST write-method route files ──
for (const g of ['app/api/pov', 'app/api/tasks', 'app/api/mcp']) {
  for (const file of walk(path.join(ROOT, g))) {
    const content = fs.readFileSync(file, 'utf8');
    const code = stripComments(content);
    if (!writeMethodRe.test(code)) continue;
    const r = rel(file);
    if (ALLOWLIST[r]) continue;
    if (marksWrite(code)) continue;
    // one-hop delegation: any imported symbol from a write-marking module that is USED
    // in this file (covers both `createHandler(X)` wrappers AND direct `await X(...)`).
    let safe = false;
    for (const m of code.matchAll(/import\s*(?:\{([^}]*)\}|(\w+)|\*\s*as\s*(\w+))\s*from\s*['"]([^'"]+)['"]/g)) {
      const target = resolveImport(file, m[4]);
      if (!target) continue;
      let tc: string;
      try { tc = fs.readFileSync(target, 'utf8'); } catch { continue; }
      if (!marksWrite(stripComments(tc))) continue;
      const names = m[1]
        ? m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        : [m[2] || m[3]].filter(Boolean);
      if (names.some((n) => (code.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length >= 2)) { safe = true; break; }
    }
    if (!safe) failures.push(`${r} — write method but no withPOVAccess / requireWrite / delegated-handler-with-requireWrite; not allowlisted`);
  }
}

// ── Pass B: MCP action handlers that call the gate must pass requireWrite ──
for (const file of walk(path.join(ROOT, 'lib/mcp/tasks/action/handlers'))) {
  const content = fs.readFileSync(file, 'utf8');
  const code = stripComments(content);
  if (!code.includes('validatePOVAccess(')) continue;
  const r = rel(file);
  if (ALLOWLIST[r]) continue;
  if (code.includes('requireWrite')) continue;
  failures.push(`${r} — MCP handler calls validatePOVAccess without requireWrite; not allowlisted (if read-only, add to allowlist with reason)`);
}

// ── Pass C: hub/server tool layer (.ts + .js) that calls POV-access must pass requireWrite ──
// 2026-05-27 (pentest G-2): this .js layer was previously INVISIBLE to the gate — the walk was
// `.ts`-only and never reached lib/mcp/server. The riskiest divergent authz code (the G-1
// phantom-canonical validatePOVAccess) lived on the wrong side of the .ts/.js seam, so a demo-write
// reintroduced there passed CI green. Now scanned with the same requireWrite heuristic as Pass B.
for (const file of walk(path.join(ROOT, 'lib/mcp/server'), [], ['.ts', '.js'])) {
  const content = fs.readFileSync(file, 'utf8');
  const code = stripComments(content);
  if (!/validate(?:MCP)?POVAccess\(/.test(code)) continue;
  const r = rel(file);
  if (ALLOWLIST[r]) continue;
  if (code.includes('requireWrite')) continue;
  failures.push(`${r} — hub/server tool calls POV-access without requireWrite; not allowlisted (if read-only, add to allowlist with reason)`);
}

if (failures.length) {
  console.error(`\n❌ demo-write coverage gate FAILED (${failures.length}) — write paths that could let isDemo grant a write:`);
  failures.forEach((f) => console.error('  - ' + f));
  console.error('\nFix: route through withPOVAccess, pass requireWrite:true to validatePOVAccess/validateMCPPOVAccess, or add to ALLOWLIST with a reason.\n');
  process.exit(1);
}
console.log('✅ demo-write coverage gate PASSED — every write path restricts isDemo (requireWrite / method-derived) or is allowlisted.');
process.exit(0);
