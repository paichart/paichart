/**
 * ignoredParameters fact (2026-09-25) — pure, no DB.
 *
 * Every fixture goes through the REAL perform tool schema (L1: flat hoist + alias copies) and the REAL
 * L3 shape keys, exactly as the router sees them, then computeIgnoredParameters.
 *   C — clean calls report [] (incl. alias-applied keys and post-routing consumers).
 *   G — genuinely unapplied keys are reported, in the CALLER's vocabulary (never the layer's copy).
 *   P — the per-action allowlist is per-action (waitForCompletion ignored off agent.execute).
 *   S — static: only the perform Tier-1 site opts in; the REST route (pre-validated) never does.
 * Behavioural half (router → result.ignoredParameters): scripts/test-task-create-boundary-behavioral.ts (I*).
 */
import * as fs from 'fs';
import * as path from 'path';
// lib/prisma throws at module load without DATABASE_URL (CI has none) and tool-schemas.js reaches it
// transitively; a stub URL is enough — nothing here connects. MUST run before the requires below, which is
// why they are requires, not hoisted imports (same pattern as test-context-chainer-inflight.ts).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true'; // lib/prisma's eager connect probe would exit(1) on the stub URL
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getActionSchemaShapeKeys } = require('../lib/validation/mcp-action-validation') as typeof import('../lib/validation/mcp-action-validation');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  computeIgnoredParameters, POST_ROUTING_CONSUMERS, LAYER_COPY_ALIASES,
} = require('../lib/mcp/tasks/action/utilities/ignored-parameters') as typeof import('../lib/mcp/tasks/action/utilities/ignored-parameters');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CONSOLIDATED_SCHEMAS } = require('../lib/mcp/server/config/tool-schemas');

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.log(`❌ ${name}\n   ${e instanceof Error ? e.message : String(e)}`); failed++; }
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }

const T = 'cmtaskabcdefghijklmnopqrs', P = 'cmpovabcdefghijklmnopqrst', TPL = 'cmtplabcdefghijklmnopqrst';

/** What the router's computation sees for a perform call: L1-parsed `parameters`. */
function ignoredFor(args: Record<string, unknown>): string[] {
  const r = CONSOLIDATED_SCHEMAS.perform.inputSchema.safeParse(args);
  if (!r.success) throw new Error(`L1 rejected fixture: ${JSON.stringify(r.error.errors)}`);
  const shape = getActionSchemaShapeKeys(String(args.action));
  if (!shape) throw new Error(`no shape for ${args.action}`);
  return computeIgnoredParameters(String(args.action), r.data.parameters, shape);
}
const eq = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

console.log('━━━ C: clean calls report [] ━━━');
const CLEAN: Array<[string, Record<string, unknown>]> = [
  ['task.create minimal', { action: 'task.create', povId: P, title: 'x' }],
  ['task.create full (nested)', { action: 'task.create', parameters: { povId: P, title: 'x', stageId: T, dependencyIds: [T], interfaceContract: { a: 1 }, assignee_name: 'Rika' } }],
  ['task.update status', { action: 'task.update', taskId: T, status: 'COMPLETED' }],
  ['task.update templateId (alias applied)', { action: 'task.update', taskId: T, templateId: TPL }],
  ['task.assign by name', { action: 'task.assign', taskId: T, assignee_name: 'Rika' }],
  ['task.complete', { action: 'task.complete', taskId: T, summary: 's', confidence: 90 }],
  ['task.comment', { action: 'task.comment', taskId: T, comment: 'c' }],
  ['stage.create', { action: 'stage.create', phaseId: T, name: 'S' }],
  ['agent.assign agent_template_id (alias applied)', { action: 'agent.assign', taskId: T, agent_template_id: TPL }],
  ['agent.assign templateId (alias applied)', { action: 'agent.assign', taskId: T, templateId: TPL }],
  ['agent.configure role (both declared)', { action: 'agent.configure', taskId: T, role: 'r', prompt: 'p' }],
  ['agent.execute + waitForCompletion (post-routing consumer)', { action: 'agent.execute', parameters: { taskId: T, waitForCompletion: false } }],
  ['agent.results + verbose (post-routing consumer)', { action: 'agent.results', taskId: T, verbose: true }],
  ['analytics.generate', { action: 'analytics.generate', analyticsType: 'performance' }],
  // N2-f2 (2026-09-25): task.update now DECLARES a person assignee by name/email (shared resolver) — no longer unapplied.
  ['task.update + assignee NAME (declared since N2-f2)', { action: 'task.update', taskId: T, assignee_name: 'Rika' }],
];
for (const [name, args] of CLEAN) {
  test(`C ${name} → []`, () => { const got = ignoredFor(args); assert(got.length === 0, `got ${JSON.stringify(got)}`); });
}

console.log('\n━━━ G: unapplied keys reported in the caller\'s vocabulary ━━━');
const GENUINE: Array<[string, Record<string, unknown>, string[]]> = [
  ['task.create + role → role (not the layer copy agentRole)', { action: 'task.create', povId: P, title: 'x', role: 'r' }, ['role']],
  ['task.create + prompt', { action: 'task.create', povId: P, title: 'x', prompt: 'p' }, ['prompt']],
  ['task.create double-nested parameters (after nothing hoisted)', { action: 'task.create', parameters: { povId: P, title: 'x', parameters: { foo: 1 } } }, ['parameters']],
  ['task.update + interfaceContract (task.create-only field)', { action: 'task.update', parameters: { taskId: T, interfaceContract: { a: 1 } } }, ['interfaceContract']],
  ['agent.results + format (not declared at L3 for agent.results)', { action: 'agent.results', taskId: T, format: 'detailed' }, ['format']],
  ['agent.assign + templateId AND a DIFFERENT explicit agentTemplateId → templateId unapplied', { action: 'agent.assign', parameters: { taskId: T, agentTemplateId: TPL, templateId: 'cmotherabcdefghijklmnopqr' } }, ['templateId']],
];
for (const [name, args, want] of GENUINE) {
  test(`G ${name}`, () => { const got = ignoredFor(args); assert(eq(got, want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); });
}

console.log('\n━━━ P: per-action allowlist is per-action ━━━');
test('P1 waitForCompletion is REPORTED on task.create (only agent.execute consumes it)', () => {
  const got = ignoredFor({ action: 'task.create', parameters: { povId: P, title: 'x', waitForCompletion: false } });
  assert(eq(got, ['waitForCompletion']), `got ${JSON.stringify(got)}`);
});
test('P2 allowlist table is exactly the two outer-dispatcher consumers', () => {
  assert(eq(Object.keys(POST_ROUTING_CONSUMERS).sort(), ['agent.execute', 'agent.results']), JSON.stringify(POST_ROUTING_CONSUMERS));
  const src = fs.readFileSync(path.join(__dirname, '../lib/mcp/server/tools/advanced/task-action-handler.js'), 'utf8');
  for (const keys of Object.values(POST_ROUTING_CONSUMERS)) for (const k of keys) {
    assert(src.includes(`finalParameters.${k}`), `outer dispatcher no longer reads finalParameters.${k} — drop it from the allowlist`);
  }
});
test('P3 every LAYER_COPY_ALIASES pair is a copy the perform tool schema actually makes (source kept)', () => {
  for (const [src, tgt] of LAYER_COPY_ALIASES) {
    const r = CONSOLIDATED_SCHEMAS.perform.inputSchema.safeParse({ action: 'task.update', taskId: T, [src]: TPL });
    assert(r.success && r.data.parameters[tgt] === TPL && r.data.parameters[src] === TPL, `${src}→${tgt} is not a kept-source copy`);
  }
});

console.log('\n━━━ S: only the perform Tier-1 site opts in ━━━');
test('S1 reportIgnoredParameters: true appears exactly once in lib/ + app/ (task-action-handler.js)', () => {
  const hits: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(f); }
    else if (/\.(ts|js)$/.test(e.name) && fs.readFileSync(f, 'utf8').includes('reportIgnoredParameters: true')) hits.push(path.relative(path.join(__dirname, '..'), f));
  } };
  walk(path.join(__dirname, '../lib')); walk(path.join(__dirname, '../app'));
  assert(eq(hits, ['lib/mcp/server/tools/advanced/task-action-handler.js']), `opt-in sites: ${JSON.stringify(hits)}`);
});

console.log(`\nignoredParameters: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
