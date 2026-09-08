/* eslint-disable no-console -- test script: prints its own ✅/❌ ledger by design */
/** test:semantic-mapping-scope — E23: `status` aliases are action-scoped (pov.* ≠ task.*), and a rejection names what the caller sent. */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
import * as fs from 'fs';
import * as path from 'path';
import { applySemanticMapping, MCPParameterSchemas } from '../lib/validation/mcp-action-validation';
let passed = 0; const fails: string[] = [];
const check = (l: string, c: boolean) => { c ? passed++ : fails.push(l); };
check("pov.create: DONE → WON (POV map)", applySemanticMapping('status', 'DONE', 'pov.create') === 'WON');
check("pov.update: closed → STALLED (POV map, case-insensitive)", applySemanticMapping('status', 'closed', 'pov.update') === 'STALLED');
check("task.update: DONE → COMPLETED (task map)", applySemanticMapping('status', 'DONE', 'task.update') === 'COMPLETED');
check("no action (legacy callers): task map unchanged", applySemanticMapping('status', 'DONE') === 'COMPLETED');
check("unknown alias passes through untouched", applySemanticMapping('status', 'BANANA', 'pov.create') === 'BANANA');
check("priority unaffected by action", applySemanticMapping('priority', 'URGENT', 'pov.create') === 'HIGH');
// every POV alias target is a real POVStatus the pov.create schema accepts
const sch = (MCPParameterSchemas as Record<string, { safeParse: (v: unknown) => { success: boolean } }>)['pov.create'];
for (const alias of ['DONE', 'TODO', 'REVIEW', 'CLOSED', 'FAILED', 'DOING']) {
  const v = applySemanticMapping('status', alias, 'pov.create');
  check(`POV alias ${alias} → ${v} is accepted by the pov.create schema`, sch.safeParse({ title: 'T', description: 'D', countryName: 'X', status: v }).success);
}
const router = fs.readFileSync(path.join(__dirname, '..', 'lib/mcp/tasks/action/tasks-action-router.ts'), 'utf8');
check('router passes the action to applySemanticMapping', /applySemanticMapping\(key, normalized\[key\], action\)/.test(router));
check('router rejection names the original value', /normalized from \$\{JSON\.stringify\(normalizedFrom\[top\]\)\}/.test(router));
console.log(`\n${fails.length ? '❌' : '✅'} test:semantic-mapping-scope — ${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log(`   ❌ ${f}`);
process.exit(fails.length ? 1 : 0);
