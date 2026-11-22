/**
 * Config sources STEP 3 slice P5 — join precondition 5, the THIRD call-chain link sec-ops proved by reading (P1 §5): the WEB ROUTE
 * above `orchestrationServiceCaller.callService`.
 *
 * KN6 route 3 (scripts/test-never-read-key-files.ts) calls `callService` directly with a hand-built context. This suite drives the
 * route itself, with nothing stood in:
 *
 *   the exported `POST` of app/api/workflows/run/route.ts (createHandler: rate limit, the real token check, the ADMIN role check)
 *     → handleRunWorkflow → executeOrchestrationWorkflow → the workflow engine → MCPOrchestrationHandler → the shared orchestration
 *     engine → orchestrationServiceCaller.callService → validateServiceCall (the unpinned file-read gate, route `admin-workflow-run`)
 *
 * against the real database: a real ADMIN user, a real access token signed by this install's key, and ONE registry row created for
 * the run — an UNPINNED file service whose endpoint answers nothing (127.0.0.1:9), so a call that gets PAST the gate fails at the
 * connection, a different failure from the gate's refusal. The row and every execution record of the run are deleted afterwards.
 *
 * WHAT IT PROVES: a step that reads a password or key file through the admin "run workflow" page is refused with the class's own
 * message although the request carries NO execution id (the route marker is what makes the gate apply); a step reading a
 * configuration file is not refused by this rule; a non-admin caller never reaches the gate (403).
 *
 * THE WHOLE-WORKFLOW RETRY, AND THE ONE THING THIS SUITE CHANGES: the workflow engine retries a FAILED workflow three more times
 * with a backoff of 30 s, 60 s and 120 s (workflowEngine.ts `executeWithRetries`; the route cannot switch it off), so every failing
 * run here — a refused step included — takes about four minutes of waiting: the first run of this suite took 17 minutes. The
 * suite therefore shortens exactly those waits: a `setTimeout` set FROM workflowEngine.ts whose delay is over 30,000 ms and at
 * most 150,000 ms (the backoff with its jitter; the engine's own run timeout is this suite's 8,000 ms) fires after 5 ms. Every
 * other timer is untouched. Every attempt is still made and still counted (W4). P5_ROUTE_REAL_BACKOFF=1 keeps the real waits.
 *
 * Requires the dev database + this install's JWT signing key (.env). NOT in the battery (it writes rows and signs a token).
 * Run: npm run test:admin-workflow-route-behavioral
 */
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/workflows/run/route';
import { signAccessToken } from '../lib/auth/token-manager';

/* eslint-disable @typescript-eslint/no-var-requires */
const policy = require('../lib/mcp/server/config/service-call-policy') as { NEVER_READ_KEY_FILE_MESSAGE: string; ADMIN_WORKFLOW_ROUTE: string };
/* eslint-enable @typescript-eslint/no-var-requires */

const prisma = new PrismaClient();
let pass = 0; let fail = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? '✅' : '❌'} ${n}${!ok && d ? `\n   ${d}` : ''}`); if (ok) pass++; else fail++; };
const KEYMSG = policy.NEVER_READ_KEY_FILE_MESSAGE;

// The whole-workflow backoff only (see the header). Counted, so the suite can say how many retries it shortened.
let shortened = 0;
if (process.env.P5_ROUTE_REAL_BACKOFF !== '1') {
  const realSetTimeout = global.setTimeout;
  (global as unknown as { setTimeout: unknown }).setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
    if (typeof ms === 'number' && ms > 30_000 && ms <= 150_000 && (new Error().stack ?? '').includes('workflowEngine')) { shortened++; return realSetTimeout(fn, 5, ...rest); }
    return realSetTimeout(fn, ms, ...rest);
  }) as unknown;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true, role: true } });
  if (!admin) throw new Error('the dev database has no ADMIN user');
  const plain = await prisma.user.findFirst({ where: { role: 'USER' }, select: { id: true, email: true, name: true, role: true } });
  const tag = `p5-acme-files-${Date.now() % 1_000_000}`;
  const started = new Date();
  const svc = await prisma.mCPTool.create({ data: {
    name: tag, description: 'STEP 3 P5 link test — an unpinned file service that answers nothing', version: '1.0.0',
    capabilities: { tools: ['get_file_contents'] },
    configuration: { ownerId: admin.id, endpoint: 'http://127.0.0.1:9/mcp', transport: 'streamable-http' },
    credentials: {}, permissions: { publicAccess: true },
  } as never, select: { id: true } });
  const tokenFor = (u: { id: string; email: string; name: string | null; role: string }) => signAccessToken({ userId: u.id, email: u.email, name: u.name ?? 'P5', role: u.role } as never);
  const run = async (token: string | null, path: string): Promise<{ status: number; text: string }> => {
    const req = new NextRequest('http://localhost/api/workflows/run', { method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ steps: [{ service: tag, tool: 'get_file_contents', arguments: { owner: 'acme', repo: 'infra', path } }], executionMode: 'sequential', timeout: 8000 }) });
    const res = await (POST as unknown as (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>)(req, { params: Promise.resolve({}) });
    return { status: res.status, text: await res.text() };
  };
  try {
    const adminToken = await tokenFor(admin);
    const key = await run(adminToken, 'tls/server.key');
    check('W1 the admin "run workflow" route, a step reading a KEY file: refused with the class\'s message — the request carries no execution id',
      key.text.includes(KEYMSG) && !/callingExecutionId/.test(key.text), `${key.status} ${key.text.slice(0, 500)}`);
    const pw = await run(adminToken, 'conf.d/.htpasswd');
    check('W1 the same route, a PASSWORD file: refused with the class\'s message', pw.text.includes(KEYMSG), `${pw.status} ${pw.text.slice(0, 500)}`);
    const conf = await run(adminToken, 'conf/app.yaml');
    check('W2 the same route, a configuration file: NOT refused by this rule (the step goes on to the service and fails at the connection)',
      conf.status === 200 && !conf.text.includes(KEYMSG) && !conf.text.includes('NEVER_READ'), `${conf.status} ${conf.text.slice(0, 500)}`);
    const state = await run(adminToken, 'terraform/terraform.tfstate');
    check('W2 the same route, a Terraform state file: refused by the OLDER never-read rule (its own wording), as for every caller',
      /Terraform state/.test(state.text) && !state.text.includes(KEYMSG), `${state.status} ${state.text.slice(0, 500)}`);
    const anon = await run(null, 'tls/server.key');
    check('W3 no token: 401 before anything runs', anon.status === 401, `${anon.status} ${anon.text.slice(0, 200)}`);
    if (plain) {
      const user = await run(await tokenFor(plain), 'tls/server.key');
      check('W3 a non-admin caller: 403 at the route — the gate is never reached', user.status === 403 && !user.text.includes(KEYMSG), `${user.status} ${user.text.slice(0, 200)}`);
    } else {
      console.log('⏭  SKIPPED W3 non-admin — the dev database has no USER-role user');
    }
    // the route's own records: every run of this suite wrote an execution row for the admin, none carrying a calling execution
    const rows = await prisma.mCPWorkflowExecution.findMany({ where: { createdAt: { gte: started } }, select: { id: true, steps: true, status: true } }).catch(() => []);
    const mine = rows.filter((r) => JSON.stringify(r.steps ?? '').includes(tag));
    // FACT, recorded: each of the four admin runs FAILED (three refusals, one dead endpoint) and the engine made 1 + 3 attempts of each
    // — a refused step is retried like any other failure. 16 rows; 12 backoff waits.
    check('W4 the runs are recorded by the route\'s own tracker: four admin runs, each attempted 1 + 3 times by the engine\'s whole-workflow retry', mine.length === 16,
      `${mine.length} of ${rows.length} rows since start name the fixture service`);
    if (process.env.P5_ROUTE_REAL_BACKOFF !== '1') check('W4 the suite shortened exactly the twelve backoff waits of those runs (3 a failing run) and no other timer', shortened === 12, `${shortened}`);
  } finally {
    const rows = await prisma.mCPWorkflowExecution.findMany({ where: { createdAt: { gte: started } }, select: { id: true, steps: true } }).catch(() => []);
    const ids = rows.filter((r) => JSON.stringify(r.steps ?? '').includes(tag)).map((r) => r.id);
    if (ids.length) await prisma.mCPWorkflowExecution.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await prisma.mCPInteraction.deleteMany({ where: { toolId: svc.id } }).catch(() => undefined);
    await prisma.mCPTool.delete({ where: { id: svc.id } }).catch(() => undefined);
  }
  console.log(`\nadmin workflow route (behavioural): ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error('script error:', e); await prisma.$disconnect(); process.exit(1); });
