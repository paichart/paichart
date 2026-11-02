#!/usr/bin/env ts-node
/**
 * test-gateway-id-first.ts — PLATFORM-HELD-BYTES Stage B push 1, P1-5 (hub v3 N-a / N-b).
 *
 * The gateway resolves a `targetService` reference ID FIRST, then by name (lib/mcp/server/tools/hub/resolve-service-ref.js),
 * at all THREE resolvers: service-call-handler.js, workflow-tools-handler.js, lib/services/workflow/integrations/service-caller.ts.
 * An id hit is terminal whatever its status. Every mock below answers the OLD query (`findFirst` with OR id/name) with the
 * ADVERSARIAL row — the one NAMED after the other's id — so restoring the OR at any resolver turns its pin RED.
 *
 * Pins: the helper (A id=X + B name=X ⇒ A; no id ⇒ name; neither ⇒ null); service-call-handler (both ACTIVE ⇒ A, by the
 * resolved name in the failure text; INACTIVE A + ACTIVE B ⇒ "not active"); workflow + orchestration (INACTIVE A + ACTIVE B
 * ⇒ refused, never B); the sweep grep (exactly the two deliberate exclusions); registration refusals with their OWN text;
 * `updates: { name }` refused; the seed guards both arms incl. the self-match; static seed wiring; `<base>/mcp/<slug>` not
 * in the inbound audience accept-list. CI-safe: no DB.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ci:ci@localhost:5432/ci_stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true'; // no DB is touched; lib/prisma's eager $connect would process.exit(1) on the stub (a race)
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { assertSlugIdFree, assertByNameSeedOwnsRow } from './mcp-tool-seed-guard';

const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// Seed scripts other than weather/browser are PRIVATE (allowlist `- scripts/seed-*-service.ts`). In the private source repo (recognised
// as export-public.py's SOURCE GUARD does: cline_docs/ + CLAUDE.md) a missing seed is still a hard failure (read throws); in the public
// export a seed the allowlist excludes is skipped BY NAME (found by the 2026-11-02 export dry run).
const IS_PRIVATE_SOURCE = fs.existsSync(path.join(ROOT, 'cline_docs')) && fs.existsSync(path.join(ROOT, 'CLAUDE.md'));
const readSeed = (f: string): string | null => (IS_PRIVATE_SOURCE || fs.existsSync(path.join(ROOT, f)) ? read(f) : null);
const { findServiceByIdThenName } = require('../lib/mcp/server/tools/hub/resolve-service-ref');
const { ServiceCallHandler } = require('../lib/mcp/server/tools/hub/service-call-handler');
const { WorkflowToolsHandler } = require('../lib/mcp/server/tools/hub/workflow-tools-handler');
const { ServiceRegistrationHandler } = require('../lib/mcp/server/tools/hub/service-registration-handler');
const { ServiceUpdateHandlerInputSchema } = require('../lib/mcp/server/tools/hub/service-update-handler');

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
type Row = { id: string; name: string; status: string; capabilities?: unknown; configuration?: unknown; permissions?: unknown; isPublic?: boolean; endpoint?: string | null };

const X = 'svc-target';
const A = (status = 'ACTIVE'): Row => ({ id: X, name: 'Alpha Service', status, capabilities: { tools: ['t'] }, configuration: {}, permissions: { publicAccess: true }, isPublic: true, endpoint: null });
// B carries an endpoint, so a resolver that (wrongly) picks B gets PAST resolution — its failure then differs from the refusal.
const B: Row = { id: 'cbbbbbbbbbbbbbbbbbbbbbbbbb', name: X, status: 'ACTIVE', capabilities: { tools: ['t'] }, configuration: { endpoint: 'https://127.0.0.1:9/mcp' }, permissions: { publicAccess: true }, isPublic: true, endpoint: null };

/** A registry whose findUnique is exact and whose findFirst answers an OR id/name query ADVERSARIALLY (the name match). */
function registry(rows: Row[]) {
  const pick = (o: Row, select?: Record<string, boolean>) => select ? Object.fromEntries(Object.keys(select).map((k) => [k, (o as Record<string, unknown>)[k]])) : o;
  const matches = (r: Row, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => (r as Record<string, unknown>)[k] === v);
  return {
    findUnique: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const r = rows.find((x) => matches(x, where)); return r ? pick(r, select) : null;
    },
    findFirst: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const { OR, ...rest } = (where || {}) as { OR?: Array<Record<string, unknown>> };
      const ordered = [...rows].sort((p, q) => (OR && OR.some((c) => 'name' in c && c.name === p.name) ? -1 : 0) - (OR && OR.some((c) => 'name' in c && c.name === q.name) ? -1 : 0));
      const r = ordered.find((x) => matches(x, rest) && (!OR || OR.some((c) => matches(x, c))));
      return r ? pick(r, select) : null;
    },
  };
}

(async () => {
  console.log('🧭 gateway id-first resolution (Stage B P1-5)');

  // ── the helper ───────────────────────────────────────────────────────────────────────────────────────────────────
  check('helper: A id=X + B name=X ⇒ A', (await findServiceByIdThenName(registry([B, A()]), X))?.id === X);
  check('helper: INACTIVE A id=X + ACTIVE B name=X ⇒ A (terminal whatever its status)', (await findServiceByIdThenName(registry([B, A('INACTIVE')]), X))?.status === 'INACTIVE');
  check('helper: no id ⇒ the name', (await findServiceByIdThenName(registry([B]), X))?.id === B.id);
  check('helper: neither ⇒ null; empty / non-string ref ⇒ null', (await findServiceByIdThenName(registry([B]), 'nope')) === null
    && (await findServiceByIdThenName(registry([B]), '')) === null && (await findServiceByIdThenName(registry([B]), undefined)) === null);
  check('the adversarial mock is live: the OLD OR query returns B (so a restored OR turns the pins below RED)',
    (await registry([A('INACTIVE'), B]).findFirst({ where: { OR: [{ id: X }, { name: X }] } }))?.id === B.id);

  // ── 1. service-call-handler (the real handle) ────────────────────────────────────────────────────────────────────
  const callVia = async (rows: Row[]) => {
    const prisma = { mCPTool: registry(rows), activity: { create: async () => ({}) } };
    const h = new ServiceCallHandler(prisma, { checkServiceAccess: async () => true, trackServiceInteraction: async () => undefined });
    try { const r = await h.handle({ action: 'call', targetService: X, tool: 't', arguments: {} }, { user: { id: 'u', email: 'u@example.invalid', role: 'ADMIN' } }); return JSON.stringify(r); }
    catch (e) { return `THREW ${(e as Error).message}`; }
  };
  const both = await callVia([B, A()]);
  check('service-call-handler: both ACTIVE ⇒ the call goes to A (the failure names "Alpha Service", never the shadow row)',
    both.includes('Alpha Service') && !both.includes(B.id), both.slice(0, 160));
  const inactive = await callVia([B, A('INACTIVE')]);
  check('service-call-handler: INACTIVE A + ACTIVE B named A.id ⇒ "not active" (never falls through to B)',
    inactive.startsWith('THREW') && inactive.includes('is not active'), inactive.slice(0, 160));

  // ── 2. workflow-tools-handler (createServiceCaller → step) ───────────────────────────────────────────────────────
  const wf = new WorkflowToolsHandler({ mCPTool: registry([B, A('INACTIVE')]) }, { routeCall: async () => ({}) });
  const step = await wf.createServiceCaller({ user: { id: 'u', email: 'u@example.invalid', role: 'ADMIN' } })({ service: X, tool: 't', arguments: {} });
  check('workflow-tools-handler: INACTIVE A + ACTIVE B named A.id ⇒ refused not_found (never B)', step.success === false && step.errorType === 'not_found', JSON.stringify(step).slice(0, 160));

  // ── 3. service-caller (orchestration) — the shared prisma delegate, stubbed ──────────────────────────────────────
  const { prisma } = require('../lib/prisma');
  const reg = registry([B, A('INACTIVE')]);
  prisma.mCPTool.findUnique = reg.findUnique; prisma.mCPTool.findFirst = reg.findFirst;
  const { orchestrationServiceCaller } = require('../lib/services/workflow/integrations/service-caller');
  // Raced against 5 s: a resolver that (wrongly) picks B goes on past resolution (trust level, connection), which must read
  // as a failure, never as a hang. Under the restored-OR mutation it reaches the stub database and the run exits 1 (RED).
  // A throw or an unhandled rejection while it runs (a wrong pick reaches code that touches the stub database) is recorded
  // as THIS check failing, never a crash that skips the checks after it (code review mcp-hub N-1).
  let stray: unknown = null;
  const onStray = (e: unknown) => { stray = e; };
  process.on('unhandledRejection', onStray);
  let oc: { success: unknown; error?: string };
  try {
    oc = await Promise.race([
      orchestrationServiceCaller.callService({ user: { id: 'u', email: 'u@example.invalid', role: 'ADMIN' }, execution: { requestId: 'r' } }, X, 't', {}),
      new Promise((r) => setTimeout(() => r({ success: 'TIMED-OUT (it got past resolution)' }), 5000).unref()),
    ]) as { success: unknown; error?: string };
  } catch (e) {
    oc = { success: `THREW (it got past resolution): ${(e as Error).message?.slice(0, 80)}` };
  }
  await new Promise((r) => setTimeout(r, 50));
  process.off('unhandledRejection', onStray);
  if (stray) oc = { success: 'UNHANDLED REJECTION (it got past resolution)' };
  check('service-caller: INACTIVE A + ACTIVE B named A.id ⇒ "Service not found or inactive" (never B)', oc.success === false && String(oc.error).startsWith('Service not found or inactive'), JSON.stringify(oc).slice(0, 160));

  // ── 4. held-k8s SF-1: a Git file source is never a workflow step — both callers, addressed by NAME and by registry ID ──
  // The row carries an endpoint and the arguments satisfy the pin, so a caller WITHOUT the refusal gets past resolution and
  // the policy gate: its failure (connection / stub database / timeout) then differs from the refusal text (mutation-checked).
  const { GIT_FILE_SOURCE_WORKFLOW_REFUSAL } = require('../lib/mcp/server/config/git-file-source-pin');
  const GH_ID = 'cghghghghghghghghghghghgh';
  const GH: Row = { id: GH_ID, name: 'github-service', status: 'ACTIVE', capabilities: { tools: ['get_file_contents'] }, configuration: { endpoint: 'https://127.0.0.1:9/mcp' }, permissions: { publicAccess: false }, isPublic: false, endpoint: null };
  const ghArgs = { owner: 'paichart', repo: 'paichart-lab-configs', path: 'k8s/sample-workloads.yaml' };
  const raced = async (p: Promise<unknown>) => {
    let strayGh: unknown = null;
    const onStrayGh = (e: unknown) => { strayGh = e; };
    process.on('unhandledRejection', onStrayGh);
    let r: { success: unknown; error?: string; errorType?: string };
    try {
      r = await Promise.race([p, new Promise((res) => setTimeout(() => res({ success: 'TIMED-OUT (it got past the refusal)' }), 5000).unref())]) as typeof r;
    } catch (e) { r = { success: `THREW (it got past the refusal): ${(e as Error).message?.slice(0, 80)}` }; }
    await new Promise((res) => setTimeout(res, 50));
    process.off('unhandledRejection', onStrayGh);
    return strayGh ? { success: 'UNHANDLED REJECTION (it got past the refusal)' } : r;
  };
  for (const ref of ['github-service', GH_ID]) {
    const wfGh = new WorkflowToolsHandler({ mCPTool: registry([GH]) }, { routeCall: async () => ({}) });
    const s = await raced(wfGh.createServiceCaller({ user: { id: 'u', email: 'u@example.invalid', role: 'ADMIN' } })({ service: ref, tool: 'get_file_contents', arguments: ghArgs }));
    check(`SF-1 workflow-tools-handler: a github-service step (by ${ref === GH_ID ? 'registry id' : 'name'}) ⇒ policy_blocked with the ONE refusal text`,
      s.success === false && s.errorType === 'policy_blocked' && s.error === GIT_FILE_SOURCE_WORKFLOW_REFUSAL, JSON.stringify(s).slice(0, 160));
    const regGh = registry([GH]);
    prisma.mCPTool.findUnique = regGh.findUnique; prisma.mCPTool.findFirst = regGh.findFirst;
    const o = await raced(orchestrationServiceCaller.callService({ user: { id: 'u', email: 'u@example.invalid', role: 'ADMIN' }, execution: { requestId: 'r' } }, ref, 'get_file_contents', ghArgs));
    check(`SF-1 service-caller: a github-service step (by ${ref === GH_ID ? 'registry id' : 'name'}) ⇒ refused with the ONE refusal text`,
      o.success === false && o.error === GIT_FILE_SOURCE_WORKFLOW_REFUSAL, JSON.stringify(o).slice(0, 160));
  }

  // ── sweep grep ─────────────────────────────────────────────────────────────────────────────────────────────────
  // Either field order (code review mcp-hub N-2): an OR list that starts with `id:`, or starts with `name:` and has `id:` later.
  const sweep = execSync(`grep -rnPzl 'OR:\\s*\\[\\s*\\{\\s*(id:|name:[^\\]]*\\{\\s*id:)' lib app || true`, { cwd: ROOT, encoding: 'utf8' }).split(/[\0\n]/).map((s) => s.trim()).filter(Boolean).sort();
  check('sweep: OR-by-id resolvers left = exactly the two deliberate exclusions (Stage, User)',
    JSON.stringify(sweep) === JSON.stringify(['app/api/dashboard/team-activity/summary/route.ts', 'lib/agents/harness/plan-spawn-carry.ts']), JSON.stringify(sweep));
  for (const f of ['lib/mcp/server/tools/hub/service-call-handler.js', 'lib/mcp/server/tools/hub/workflow-tools-handler.js', 'lib/services/workflow/integrations/service-caller.ts']) {
    check(`static: ${path.basename(f)} resolves through findServiceByIdThenName`, /findServiceByIdThenName\((this\.)?prisma\.mCPTool/.test(read(f)));
  }

  // ── registration refusals ──────────────────────────────────────────────────────────────────────────────────────
  // The step right after the two new checks is the name-uniqueness findFirst: it throws a SENTINEL, so a name that passes
  // both checks stops there (no later step reaches a real database).
  const regErr = async (name: string, rows: Row[]) => {
    const prisma = { mCPTool: { ...registry(rows), count: async () => 0, findFirst: async () => { throw new Error('SENTINEL-AFTER-ID-CHECKS'); } } };
    const h = new ServiceRegistrationHandler(prisma, { trackServiceInteraction: async () => undefined, checkPermission: async () => true, isNewUser: async () => false });
    try { await h.handle({ name, endpoint: 'https://svc.example.com/mcp', description: 'A test service description', category: 'monitoring' }, { user: { id: 'u', email: 'u@example.invalid', role: 'ADMIN' } }); return 'NO ERROR'; }
    catch (e) { return (e as Error).message; }
  };
  const cuidName = await regErr('cabcdefghijklmnopqrstuvwx', []);
  check('registration: a cuid-shaped name ⇒ its OWN text ("shaped like a platform id … reserved"), never "already registered"',
    cuidName.includes('shaped like a platform id') && !cuidName.includes('already registered'), cuidName.slice(0, 200));
  const idName = await regErr(X, [A()]);
  check('registration: a name equal to an existing id ⇒ its OWN text ("equals the id of an existing service"), never "already registered"',
    idName.includes('equals the id of an existing service') && !idName.includes('already registered'), idName.slice(0, 200));
  const fine = await regErr('my-fresh-service', [A()]);
  check('registration: an ordinary free name passes both new checks (reaches the name-uniqueness step)', fine.includes('SENTINEL-AFTER-ID-CHECKS'), fine.slice(0, 200));

  // ── update cannot rename ───────────────────────────────────────────────────────────────────────────────────────
  const upd = ServiceUpdateHandlerInputSchema.safeParse({ action: 'update', service_name: 'x', updates: { name: X } });
  check('update: `updates: { name }` is REFUSED (strict schema) — any future rename path must add the id rule, by test', upd.success === false);

  // ── seed guards ───────────────────────────────────────────────────────────────────────────────────────────────
  const guardDb = (rows: Row[]) => ({ mCPTool: { findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v)) ?? null } });
  const refuses = async (p: Promise<void>) => { try { await p; return false; } catch { return true; } };
  check('seed create arm: a slug id equal to ANOTHER row\'s name ⇒ refused', await refuses(assertSlugIdFree(guardDb([B]) as never, X)));
  check('seed create arm: the row already exists under the slug id (update arm) ⇒ passes', !(await refuses(assertSlugIdFree(guardDb([A(), B]) as never, X))));
  check('seed create arm: nothing named the slug ⇒ passes', !(await refuses(assertSlugIdFree(guardDb([A()]) as never, 'fresh-slug'))));
  let t1 = false; try { assertByNameSeedOwnsRow({ id: 'cxxxxxxxxxxxxxxxxxxxxxxxx', name: 'cloudflare-service' }, 'cloudflare-service'); } catch { t1 = true; }
  check('seed by-name arm: the row named SERVICE_NAME has a different id ⇒ refused', t1);
  let t2 = false; try { assertByNameSeedOwnsRow({ id: 'cloudflare-service', name: 'cloudflare-service' }, 'cloudflare-service'); assertByNameSeedOwnsRow(null, 'cloudflare-service'); } catch { t2 = true; }
  check('seed by-name arm: the self-match (name = its own id) and an absent row pass', !t2);
  const BY_NAME_ARM = /findFirst\(\{ where: \{ name: SERVICE_NAME \} \}\);\n\s*\/\/[^\n]*\n\s*assertByNameSeedOwnsRow\(existing, SERVICE_NAME\);/;
  for (const [label, f] of [['cloudflare', 'scripts/seed-cloudflare-service.ts'], ['github', 'scripts/seed-github-service.ts']]) {
    const src = readSeed(f);
    if (src === null) { console.log(`  (public export: ${f} is excluded by design — skipped)`); continue; }
    check(`static: ${label} seed guards its by-name update arm`, BY_NAME_ARM.test(src));
  }
  for (const [f, n] of [['scripts/seed-browser-automation-service.ts', 1], ['scripts/seed-notification-service.ts', 1], ['scripts/seed-snowflake-service.ts', 1], ['scripts/register-internal-services.ts', 3]] as Array<[string, number]>) {
    const src = readSeed(f);
    if (src === null) { console.log(`  (public export: ${f} is excluded by design — skipped)`); continue; }
    check(`static: ${path.basename(f)} guards every upsert-by-id (${n})`, (src.match(/await assertSlugIdFree\(prisma, /g) || []).length === n && (src.match(/mCPTool\.upsert\(/g) || []).length === n);
  }

  // ── inbound audience ───────────────────────────────────────────────────────────────────────────────────────────
  const { LEGACY_AUDIENCES, MCP_FRONTDOOR_AUDIENCE } = require('../lib/auth/public-base-url');
  check('audience: no `<base>/mcp/<slug>` per-service audience is in the inbound accept-list',
    (LEGACY_AUDIENCES as string[]).every((a) => !a.startsWith(`${MCP_FRONTDOOR_AUDIENCE}/`)) && (LEGACY_AUDIENCES as string[]).length === 2);

  console.log(`\n📊 ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('❌ crashed:', e); process.exit(1); });
