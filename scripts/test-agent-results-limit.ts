/**
 * test:agent-results-limit — X2 (2026-10-31): agent.results honours limit / includeAll / includeOutput, and honouring
 * `limit` never hides the AUTHORITATIVE (keep-best) execution.
 *
 * Pins, no database:
 *   1. the schema KEEPS the three parameters (it used to strip them) and coerces the string forms agents send
 *      ("1", "true"), and rejects out-of-range / malformed values;
 *   2. the handler keeps newest-first order (executions[0] unchanged — the harness's Step 1 reads a child's latest
 *      failure there) and APPENDS the authoritative execution when the limit cut it off — the 2026-10-04 shape
 *      (newest FAILED, older authoritative SUCCESS, read with limit "1");
 *   3. the router passes the parsed parameters to handleAgentResults (no second strip).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
import * as fs from 'fs';
import * as path from 'path';
const { MCPParameterSchemas } = require('../lib/validation/mcp-action-validation') as typeof import('../lib/validation/mcp-action-validation');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CONSOLIDATED_SCHEMAS } = require('../lib/mcp/server/config/tool-schemas');

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.log(`❌ ${name}\n   ${(e as Error).message}`); failed++; }
}
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }

const schema = (MCPParameterSchemas as Record<string, { safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> } }>)['agent.results'];
const TASK = 'cmutguolg0013yx0gjnhituqp';

test('schema keeps limit/includeAll/includeOutput (no longer stripped)', () => {
  const r = schema.safeParse({ taskId: TASK, limit: 1, includeAll: true, includeOutput: false });
  ok(r.success, 'rejected valid input');
  ok(r.data!.limit === 1 && r.data!.includeAll === true && r.data!.includeOutput === false, `stripped: ${JSON.stringify(r.data)}`);
});
test('schema coerces the string forms agents send ("1", "true", "false") — the 2026-10-04 call sent limit "1"', () => {
  const r = schema.safeParse({ taskId: TASK, limit: '1', includeAll: 'false', includeOutput: 'true' });
  ok(r.success, 'rejected string forms');
  ok(r.data!.limit === 1 && r.data!.includeAll === false && r.data!.includeOutput === true, `not coerced: ${JSON.stringify(r.data)}`);
});
test('schema rejects out-of-range / malformed values', () => {
  for (const bad of [{ limit: 0 }, { limit: 21 }, { limit: '1.5' }, { limit: 'abc' }, { includeAll: 'yes' }]) {
    ok(!schema.safeParse({ taskId: TASK, ...bad }).success, `accepted ${JSON.stringify(bad)}`);
  }
});
test('schema: absent parameters stay absent (the handler defaults apply)', () => {
  const r = schema.safeParse({ taskId: TASK });
  ok(r.success && !('limit' in r.data!) && !('includeAll' in r.data!), `defaults leaked: ${JSON.stringify(r.data)}`);
});

const root = path.join(__dirname, '..');
const handler = fs.readFileSync(path.join(root, 'lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts'), 'utf8');
const router = fs.readFileSync(path.join(root, 'lib/mcp/tasks/action/tasks-action-router.ts'), 'utf8');
// L1 (review B1/B2): the protocols' FLAT call shape must survive the OUTER perform schema with limit hoisted into
// parameters — otherwise it never reaches the router schema at all (the waitForCompletion trap).
test('L1: the protocol FLAT shape hoists limit into parameters, then L3 coerces it to 1', () => {
  const l1 = CONSOLIDATED_SCHEMAS.perform.inputSchema.safeParse({ action: 'agent.results', taskId: TASK, verbose: true, limit: '1' });
  ok(l1.success, 'perform schema rejected the protocol shape');
  ok(l1.data.parameters && l1.data.parameters.limit === '1' && !('limit' in l1.data), `limit not hoisted: ${JSON.stringify(l1.data)}`);
  const l3 = schema.safeParse(l1.data.parameters);
  ok(l3.success && l3.data!.limit === 1, `L3 did not coerce: ${JSON.stringify(l3)}`);
});
test('L1: includeAll / includeOutput are hoisted the same way', () => {
  const l1 = CONSOLIDATED_SCHEMAS.perform.inputSchema.safeParse({ action: 'agent.results', taskId: TASK, includeAll: 'true', includeOutput: false });
  ok(l1.success && l1.data.parameters.includeAll === 'true' && l1.data.parameters.includeOutput === false, `not hoisted: ${JSON.stringify(l1.data)}`);
});
test('handler: the appended row is marked appendedAsAuthoritative', () => {
  ok(/appendedAsAuthoritative: exec\.id === appendedAuthoritativeId \? true : undefined/.test(handler), 'marker missing');
});

test('handler: order stays newest-first (executions[0] unchanged for the harness Step 1)', () => {
  ok(/orderBy: \[\{ createdAt: 'desc' \}, \{ id: 'desc' \}\],\s*\n\s*take: limit/.test(handler), 'newest-first + take: limit not found');
});
test('handler: the authoritative (keep-best) execution is APPENDED when the limit cut it off', () => {
  ok(/if \(authoritativeExecutionId && !executions\.some\(\(e\) => e\.id === authoritativeExecutionId\)\)/.test(handler), 'no presence check');
  ok(/executions = \[\.\.\.executions, auth\]/.test(handler), 'not appended after the newest-first list');
});
test('router: the parsed parameters reach handleAgentResults unchanged', () => {
  ok(/handleAgentResults\(parameters, user, actionId,/.test(router), 'router call changed');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
