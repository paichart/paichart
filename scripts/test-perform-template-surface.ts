/**
 * perform template-surface pins (2026-09-25, perform-template-param review — Steve ruling).
 *
 * Pure (no DB). Locks:
 *   D — description facts: agent.assign's start rule incl. "a PIPELINE task never starts on assign";
 *       task.assign = PERSON assignee; task.update documents its template path; task.create's
 *       advertised field list == the L3 task.create shape (pov.update "Supports N fields" precedent,
 *       scripts/test-mcp-pov-update.ts parity-audit shape).
 *   A — templateId alias at the perform tool layer (L1) → agentTemplateId, never clobbering an explicit
 *       agentTemplateId; the template TOOL's own templateId is untouched.
 *   R — task.create rejects every template key at L3, naming the key the caller sent (facts only).
 *
 * Behavioural (DB) half — no task row created on rejection: scripts/test-task-create-boundary-behavioral.ts
 * Review: cline_docs/reviews/perform-template-param-2026-09-25/mcp-tool-architecture-advisory.md
 */
// lib/prisma throws at module load without DATABASE_URL (CI has none) and tool-schemas.js reaches it
// transitively; a stub URL is enough — nothing here connects. MUST run before the requires below, which is
// why they are requires, not hoisted imports (same pattern as test-context-chainer-inflight.ts).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true'; // lib/prisma's eager connect probe would exit(1) on the stub URL
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  MCPParameterSchemas, getActionSchemaShapeKeys, TASK_CREATE_TEMPLATE_KEYS,
} = require('../lib/validation/mcp-action-validation') as typeof import('../lib/validation/mcp-action-validation');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CONSOLIDATED_SCHEMAS } = require('../lib/mcp/server/config/tool-schemas');

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.log(`❌ ${name}\n   ${e instanceof Error ? e.message : String(e)}`); failed++; }
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }

const desc: string = CONSOLIDATED_SCHEMAS.perform.description;
const flat = desc.replace(/\s+/g, ' ');
const performSchema = CONSOLIDATED_SCHEMAS.perform.inputSchema;
const templateSchema = CONSOLIDATED_SCHEMAS.template.inputSchema;
const taskCreate: any = MCPParameterSchemas['task.create'];
const POV = 'cmabcdefghijklmnopqrstuvw';
const TPL = 'cmtplabcdefghijklmnopqrst';

console.log('━━━ D: description facts ━━━');
test('D1 agent.assign states a PIPELINE task never starts on assign (run it with agent.execute)', () => {
  assert(flat.includes('A PIPELINE task never starts on assign: run it with agent.execute'), 'PIPELINE sentence missing');
});
test('D2 agent.assign states the full start rule (OPEN, not PIPELINE, no unsatisfied deps; existing-execution skip)', () => {
  assert(flat.includes('If the task is OPEN, not type PIPELINE, and has no unsatisfied dependencies, an execution is queued immediately'), 'start-rule sentence missing');
  assert(flat.includes('PENDING, RUNNING, or SUCCESS execution'), 'existing-execution clause missing');
  assert(flat.includes('A task that is not OPEN is not started.'), 'not-OPEN clause missing');
});
test('D3 the old "attach AND start it now" / "attach AND run now" wording is gone', () => {
  assert(!flat.includes('AND start it now') && !flat.includes('attach AND run now'), 'stale wording still present');
});
test('D4 task.assign = PERSON assignee, with the forward pointer to agent.assign (and reverse pointer present)', () => {
  assert(flat.includes('task.assign - Change the PERSON assignee (to attach an agent template use agent.assign)'), 'task.assign line');
  assert(flat.includes('To change the PERSON assignee use task.assign.'), 'reverse pointer on agent.assign');
});
test('D5 task.update documents it can set agentTemplateId / agentTemplateName / templateId', () => {
  assert(flat.includes('task.update can also attach an agent template (agentTemplateId, agentTemplateName, or templateId)'), 'task.update template line');
});
test('D6 task.create says it does NOT attach templates and names both attaching actions', () => {
  assert(flat.includes('task.create does NOT attach an agent template'), 'no-template line');
  assert(flat.includes('Attach one afterwards with agent.assign or agent.configure.'), 'pointer');
});

// Parity: the advertised "Fields:" list == L3 task.create shape, modulo a named allowlist.
const NOT_ADVERTISED: Record<string, string> = {
  parentTask: 'declared at L3 but never read by task-create-handler ("future use") — advertising it would promise an effect',
  assignee_name: 'alias of assignee — stated in prose on the assignee line, not in the field list',
  assigneeName: 'alias of assignee — stated in prose on the assignee line, not in the field list',
};
test('D7 task.create advertised field list == L3 shape (parity, both directions)', () => {
  const m = desc.match(/task\.create - [^\n]*\n\s*Fields: ([^\n]+)\./);
  assert(m, 'could not find the task.create "Fields:" line');
  const advertised = m[1].split(',').map(s => s.trim()).filter(Boolean);
  const shape = getActionSchemaShapeKeys('task.create');
  assert(shape, 'task.create shape did not unwrap to a ZodObject');
  const missingFromDesc = shape.filter(k => !advertised.includes(k) && !(k in NOT_ADVERTISED));
  const notInSchema = advertised.filter(k => !shape.includes(k));
  assert(missingFromDesc.length === 0, `in L3 shape but not advertised (add to Fields: or allowlist with reason): ${missingFromDesc.join(', ')}`);
  assert(notInSchema.length === 0, `advertised but NOT in L3 shape (would be silently stripped): ${notInSchema.join(', ')}`);
});
test('D8 no template key is in the task.create L3 shape (rejection happens on raw input, not by declaring them)', () => {
  const shape = getActionSchemaShapeKeys('task.create')!;
  const leaked = TASK_CREATE_TEMPLATE_KEYS.filter(k => shape.includes(k));
  assert(leaked.length === 0, `template keys declared in shape: ${leaked.join(', ')}`);
});

console.log('\n━━━ A: templateId alias (perform tool layer) ━━━');
for (const action of ['task.update', 'agent.assign', 'agent.configure']) {
  test(`A1 ${action}: flat templateId → parameters.agentTemplateId`, () => {
    const r = performSchema.safeParse({ action, taskId: 'cmtaskabcdefghijklmnopqrs', templateId: TPL });
    assert(r.success, `perform parse failed: ${JSON.stringify(r.error?.errors)}`);
    assert(r.data.parameters.agentTemplateId === TPL, `agentTemplateId=${r.data.parameters.agentTemplateId}`);
    const l3 = (MCPParameterSchemas as any)[action].safeParse(r.data.parameters);
    assert(l3.success, `L3 ${action} rejected the aliased params: ${JSON.stringify(l3.error?.errors)}`);
    assert(l3.data.agentTemplateId === TPL, `L3 ${action} dropped agentTemplateId`);
  });
}
test('A2 nested parameters.templateId aliases too', () => {
  const r = performSchema.safeParse({ action: 'agent.assign', parameters: { taskId: 'cmtaskabcdefghijklmnopqrs', templateId: TPL } });
  assert(r.success && r.data.parameters.agentTemplateId === TPL, 'nested alias');
});
test('A3 an explicit agentTemplateId is never clobbered by templateId', () => {
  const r = performSchema.safeParse({ action: 'agent.assign', parameters: { taskId: 'cmtaskabcdefghijklmnopqrs', agentTemplateId: 'cmexplicitabcdefghijklmno', templateId: TPL } });
  assert(r.success && r.data.parameters.agentTemplateId === 'cmexplicitabcdefghijklmno', `clobbered: ${r.data?.parameters?.agentTemplateId}`);
});
test('A4 template(action:"details", templateId) — a different tool — keeps templateId and gains no agentTemplateId', () => {
  const r = templateSchema.safeParse({ action: 'details', templateId: TPL });
  assert(r.success, `template details parse failed: ${JSON.stringify(r.error?.errors)}`);
  assert(r.data.templateId === TPL, `templateId changed: ${r.data.templateId}`);
  assert(r.data.agentTemplateId === undefined, 'template tool gained agentTemplateId');
});

console.log('\n━━━ R: task.create rejects template keys (L3) ━━━');
for (const key of TASK_CREATE_TEMPLATE_KEYS) {
  test(`R1 task.create + ${key} → rejected, message names ${key}, says not applied + no task created`, () => {
    const r = taskCreate.safeParse({ title: 'x', povId: POV, [key]: key.includes('ame') ? 'Some Template' : TPL });
    assert(!r.success, 'accepted');
    const msg = r.error.errors.map((e: any) => e.message).join(' ');
    assert(msg.includes(`; ${key} was not applied and no task was created`), `message: ${msg}`);
    assert(msg.includes('agent.assign') && msg.includes('agent.configure'), 'pointer to attaching actions');
    assert(!/meant|probably|confidence/i.test(msg), 'verdict-shaped wording (Protocol 10)');
  });
}
test('R2 end-to-end perform(task.create, templateId) → L3 rejection names templateId, not the tool-layer copy', () => {
  const l1 = performSchema.safeParse({ action: 'task.create', povId: POV, title: 'x', templateId: TPL });
  assert(l1.success, 'L1 parse');
  assert(l1.data.parameters.agentTemplateId === TPL, 'precondition: L1 copied templateId');
  const r = taskCreate.safeParse(l1.data.parameters);
  assert(!r.success, 'accepted');
  const msg = r.error.errors[0].message;
  assert(msg.includes('; templateId was not applied'), `message: ${msg}`);
});
test('R3 template error is reported even when another field is also invalid (raw-input first stage)', () => {
  const r = taskCreate.safeParse({ povId: POV, agentTemplateId: TPL }); // no title
  assert(!r.success, 'accepted');
  assert(r.error.errors.some((e: any) => e.message.includes('agentTemplateId was not applied')), 'template error not reported');
});
test('R4 a clean task.create still parses', () => {
  const r = taskCreate.safeParse({ title: 'x', povId: POV, dependencyIds: [] });
  assert(r.success, JSON.stringify(r.error?.errors));
});

console.log(`\nperform template surface: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
