/**
 * HUB-DEAF-TO-DATABASE (2026-11-13) — the database liveness probe (lib/database/database-liveness.ts).
 *
 * What it must do, both directions each:
 *   - classify: the two engine-gone messages are `engine-dead`; a database that cannot be reached is `unreachable`; anything else
 *     (a validation error, a missing row) is NOT a database failure;
 *   - exit ONLY for an engine that is gone, ONLY after N consecutive probes, ONLY once — never for an unreachable database (the
 *     hub surviving a PostgreSQL restart is a verified property), never on one blip, never when the kill switch is set;
 *   - report: `unknown` before the first probe is not "down"; a failure is; a later success clears it;
 *   - /health: 200 `ok` when not down, 503 `degraded` when down, same body shape plus `database`.
 */
import http from 'http';
import express from 'express';
import {
  classifyDatabaseError, probeDatabaseOnce, getDatabaseLiveness, isDatabaseDown, __resetDatabaseLivenessForTests,
} from '../lib/database/database-liveness';
import { registerHealthRoutes } from '../lib/mcp/server/routes/health-routes';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => { if (ok) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); } };
const quiet = { warn() {}, fatal() {}, info() {} };
const named = (name: string, message: string, code?: string) => { const e: any = new Error(message); e.name = name; if (code) e.code = code; return e; };
const ENGINE_1 = named('PrismaClientUnknownRequestError', '\nInvalid `prisma.task.findUnique()` invocation:\n\n\nEngine is not yet connected.\nBacktrace []');
const ENGINE_2 = named('PrismaClientUnknownRequestError', '\nInvalid `prisma.$queryRaw()` invocation:\n\n\nResponse from the Engine was empty');
const DOWN_1 = named('PrismaClientInitializationError', "Can't reach database server at `localhost:5432`");
const DOWN_2 = named('PrismaClientKnownRequestError', 'x', 'P1001');

(async () => {
  console.log('classify');
  check('"Engine is not yet connected" → engine-dead', classifyDatabaseError(ENGINE_1) === 'engine-dead');
  check('"Response from the Engine was empty" → engine-dead', classifyDatabaseError(ENGINE_2) === 'engine-dead');
  check('a Rust panic → engine-dead', classifyDatabaseError(named('PrismaClientRustPanicError', 'boom')) === 'engine-dead');
  check('cannot reach the server → unreachable', classifyDatabaseError(DOWN_1) === 'unreachable' && classifyDatabaseError(DOWN_2) === 'unreachable');
  check('a wrapped engine error is found through `cause`', classifyDatabaseError(Object.assign(new Error('Invalid token'), { cause: ENGINE_1 })) === 'engine-dead');
  check('a validation error is NOT a database failure', classifyDatabaseError(named('PrismaClientValidationError', 'Argument `id` is missing')) === null);
  check('a missing row / bad token / a string / null are NOT database failures',
    classifyDatabaseError(named('NotFoundError', 'No User found')) === null && classifyDatabaseError(new Error('jwt expired')) === null
    && classifyDatabaseError('nope') === null && classifyDatabaseError(null) === null);

  console.log('probe and exit');
  __resetDatabaseLivenessForTests();
  check('before any probe: state unknown, NOT down', getDatabaseLiveness().state === 'unknown' && !isDatabaseDown());
  let exits = 0; const onFatal = () => { exits++; };
  await probeDatabaseOnce({ probe: async () => 1, logger: quiet, onFatal });
  check('a successful probe: ok, not down, lastOkAt set', getDatabaseLiveness().state === 'ok' && !isDatabaseDown() && !!getDatabaseLiveness().lastOkAt);

  await probeDatabaseOnce({ probe: async () => { throw ENGINE_1; }, logger: quiet, onFatal });
  check('ONE engine-dead probe: down, 1 failure, NO exit (a blip is not acted on)', isDatabaseDown() && getDatabaseLiveness().consecutiveFailures === 1 && exits === 0);
  await probeDatabaseOnce({ probe: async () => { throw ENGINE_2; }, logger: quiet, onFatal });
  check('TWO consecutive engine-dead probes: exit called once', exits === 1 && getDatabaseLiveness().state === 'engine-dead');
  await probeDatabaseOnce({ probe: async () => { throw ENGINE_1; }, logger: quiet, onFatal });
  check('a third engine-dead probe does not exit again', exits === 1);

  __resetDatabaseLivenessForTests(); exits = 0;
  for (let i = 0; i < 6; i++) await probeDatabaseOnce({ probe: async () => { throw DOWN_1; }, logger: quiet, onFatal });
  check('SIX unreachable probes: down, 6 failures, NEVER exits (PostgreSQL restarting is survived)', isDatabaseDown() && getDatabaseLiveness().state === 'unreachable' && getDatabaseLiveness().consecutiveFailures === 6 && exits === 0);
  await probeDatabaseOnce({ probe: async () => 1, logger: quiet, onFatal });
  check('the database comes back: ok, not down, failures reset', getDatabaseLiveness().state === 'ok' && !isDatabaseDown() && getDatabaseLiveness().consecutiveFailures === 0);

  __resetDatabaseLivenessForTests(); exits = 0;
  await probeDatabaseOnce({ probe: async () => { throw ENGINE_1; }, logger: quiet, onFatal });
  await probeDatabaseOnce({ probe: async () => { throw DOWN_1; }, logger: quiet, onFatal });
  await probeDatabaseOnce({ probe: async () => { throw ENGINE_1; }, logger: quiet, onFatal });
  check('engine-dead, unreachable, engine-dead: NOT consecutive ⇒ no exit', exits === 0 && getDatabaseLiveness().consecutiveFailures === 1);

  __resetDatabaseLivenessForTests(); exits = 0;
  process.env.DATABASE_LIVENESS_EXIT = 'false';
  for (let i = 0; i < 3; i++) await probeDatabaseOnce({ probe: async () => { throw ENGINE_1; }, logger: quiet, onFatal });
  delete process.env.DATABASE_LIVENESS_EXIT;
  check('kill switch DATABASE_LIVENESS_EXIT=false: reported down, never exits', isDatabaseDown() && exits === 0);

  __resetDatabaseLivenessForTests(); exits = 0;
  await probeDatabaseOnce({ probe: () => new Promise(() => {}), logger: quiet, onFatal, timeoutMs: 30 });
  check('a probe that never returns times out as unreachable (no exit)', getDatabaseLiveness().state === 'unreachable' && exits === 0);

  __resetDatabaseLivenessForTests(); exits = 0;
  await probeDatabaseOnce({ probe: async () => { throw new Error('something nobody classified'); }, logger: quiet, onFatal });
  await probeDatabaseOnce({ probe: async () => { throw new Error('something nobody classified'); }, logger: quiet, onFatal });
  check('an unrecognised probe failure is reported as unreachable and never exits', getDatabaseLiveness().state === 'unreachable' && exits === 0);

  console.log('/health');
  const app = express();
  const store = { getSessionCount: () => 1, getOAuthRequestCount: () => 0, getLimits: () => ({ maxSessions: 10, maxOAuthRequests: 10 }), getEvictionStats: () => ({}) };
  registerHealthRoutes({ app, sessionStore: store } as never);
  const server = http.createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const get = () => new Promise<{ status: number; body: any }>((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: '/health' }, res => { const c: Buffer[] = []; res.on('data', d => c.push(d)); res.on('end', () => resolve({ status: res.statusCode || 0, body: JSON.parse(Buffer.concat(c).toString('utf8')) })); }).on('error', reject); });
  __resetDatabaseLivenessForTests();
  let r = await get();
  check('before any probe: 200 ok, database.state unknown', r.status === 200 && r.body.status === 'ok' && r.body.database?.state === 'unknown');
  await probeDatabaseOnce({ probe: async () => 1, logger: quiet, onFatal });
  r = await get();
  check('healthy: 200 ok, database.state ok', r.status === 200 && r.body.status === 'ok' && r.body.database?.state === 'ok');
  await probeDatabaseOnce({ probe: async () => { throw ENGINE_1; }, logger: quiet, onFatal });
  r = await get();
  check('engine gone: 503 degraded, database.state engine-dead, the rest of the body still there', r.status === 503 && r.body.status === 'degraded' && r.body.database?.state === 'engine-dead' && r.body.transport === 'clean-http' && typeof r.body.mcp?.sessions === 'number');
  await probeDatabaseOnce({ probe: async () => { throw DOWN_1; }, logger: quiet, onFatal });
  r = await get();
  check('database unreachable: 503 degraded, database.state unreachable', r.status === 503 && r.body.database?.state === 'unreachable');
  await probeDatabaseOnce({ probe: async () => 1, logger: quiet, onFatal });
  r = await get();
  check('recovered: 200 ok again', r.status === 200 && r.body.status === 'ok');
  server.close();
  __resetDatabaseLivenessForTests();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
