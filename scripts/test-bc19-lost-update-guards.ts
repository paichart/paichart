#!/usr/bin/env ts-node
/**
 * TEST-BC19: lost-update guards for the 2026-06-08 sweep (BC19 + BC47).
 *
 * Six sites that did app-side read-modify-write inside a plain $transaction (which does NOT
 * prevent lost-update) were fixed with either an ATOMIC single statement (jsonb `||` / jsonb_set)
 * or a `FOR UPDATE` row lock. This is a SOURCE regression guard (raw SQL can't be unit-run without
 * a live DB) — same approach as test-task-input-context-merge. CI-safe (no prisma import).
 *
 * Run: npm run test:bc19-lost-update-guards
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
const failures: string[] = [];
const pass = (m: string) => { passed++; console.log(`  ✅ ${m}`); };
const fail = (m: string, d?: string) => { failed++; failures.push(d ? `${m} — ${d}` : m); console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('\n🔒 TEST-BC19 — lost-update guards (sweep 2026-06-08)\n');

// 1. kpi addKPIHistory → atomic jsonb array append (no more push+update RMW)
{
  const s = read('lib/pov/services/kpi.ts');
  if (/COALESCE\(history, '\[\]'::jsonb\) \|\| \$\{JSON\.stringify\(newEntry\)\}::jsonb/.test(s)) pass('1 kpi.ts: atomic jsonb history append');
  else fail('1 kpi atomic append missing');
  if (!/currentHistory\.push/.test(s)) pass('1b kpi.ts: old push-then-update RMW removed');
  else fail('1b kpi old RMW still present');
}

// 2. crm-sync → atomic status + jsonb merge
{
  const s = read('app/api/admin/crm/sync/route.ts');
  if (/COALESCE\(details, '\{\}'::jsonb\) \|\|/.test(s)) pass('2 crm-sync: atomic details merge');
  else fail('2 crm-sync atomic merge missing');
}

// 3. recordStep → atomic jsonb_set append into metadata.steps
{
  const s = read('lib/services/workflow/tracking/orchestration-tracker.ts');
  if (/jsonb_set\(/.test(s) && /'\{steps\}'/.test(s) && /COALESCE\(metadata->'steps', '\[\]'::jsonb\) \|\|/.test(s)) pass('3 recordStep: atomic jsonb_set append into metadata.steps');
  else fail('3 recordStep atomic jsonb_set missing');
}

// 4. complete/fail → FOR UPDATE on the execution row (+ workflow row in complete)
{
  const s = read('lib/services/workflow/tracking/orchestration-tracker.ts');
  const execLocks = (s.match(/FROM mcp_workflow_executions WHERE id = \$\{executionId\} FOR UPDATE/g) || []).length;
  const wfLock = /FROM mcp_workflows WHERE id = \$\{execution\.workflowId\} FOR UPDATE/.test(s);
  if (execLocks >= 2 && wfLock) pass(`4 complete/fail: FOR UPDATE on execution row (${execLocks}) + workflow-stats row`);
  else fail('4 complete/fail FOR UPDATE locks missing', `execLocks=${execLocks} wfLock=${wfLock}`);
}

// 5. team/members → FOR UPDATE on the POV row
{
  const s = read('app/api/pov/[povId]/team/members/route.ts');
  if (/FROM "POV" WHERE id = \$\{params\.povId\} FOR UPDATE/.test(s)) pass('5 team/members: FOR UPDATE on POV row (serializes team-create)');
  else fail('5 team/members FOR UPDATE missing');
}

// 6. EMA → FOR UPDATE on the mcp_tools row
{
  const s = read('lib/mcp/server/tools/hub/hub-utilities.js');
  if (/FROM mcp_tools WHERE id = \$\{serviceId\} FOR UPDATE/.test(s)) pass('6 EMA: FOR UPDATE on mcp_tools row');
  else fail('6 EMA FOR UPDATE missing');
}

// 7. order-race (BC47 #3/#4): task-order default-append must lock the parent stage row
{
  const tch = read('lib/mcp/tasks/action/handlers/task/task-create-handler.ts');
  const route = read('app/api/pov/[povId]/phase/[phaseId]/stage/[stageId]/task/route.ts');
  if (/SELECT id FROM stages WHERE id = \$\{finalStageId\} FOR UPDATE/.test(tch)) pass('7 task-create: FOR UPDATE on stage before order recalc (BC47 #3)');
  else fail('7 task-create order-race lock missing');
  if (/SELECT id FROM stages WHERE id = \$\{stageId\} FOR UPDATE/.test(route)) pass('7b stage→task route: FOR UPDATE on stage before order recalc (BC47 #4)');
  else fail('7b stage→task route order-race lock missing');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
console.log('✅ BC19 lost-update guards present\n');
