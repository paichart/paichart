#!/usr/bin/env ts-node
/**
 * X15 + X16 (RWF follow-ups, 2026-09-27; sec-ops D1 review F1/F2; boundary-contract + validation-engine reviews).
 *
 * X15 — a modelParameters object must never carry the execution's identity keys (agentRole, prompt, inputContext,
 *   priority): both config builders spread it AFTER them, so `modelParameters.prompt` (even `null`) replaced the task's
 *   directive and role. The runtime control is ONE helper (withoutExecutionIdentityKeys) called at all three merge sites;
 *   the schemas reject the keys early on the fields they validate.
 * X16 — agent.execute overrideConfig: maxRetries/timeout typed and bounded; the other override fields typed exactly as the
 *   REST door types them; nested modelParameters.maxRetries/timeout bounded by type and size (unit-agnostic).
 *
 * Pure: schemas, the helper, and a both-builders source check. No DB.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ModelParametersSchema, ModelParametersPassthroughSchema, EXECUTION_IDENTITY_KEYS } from '../lib/validation/model-parameters';
import { withoutExecutionIdentityKeys, resolveExecutionModelParams } from '../lib/services/llm/template-model-params';
import { MCPParameterSchemas } from '../lib/validation/mcp-action-validation';
import { RUNTIME_LIMITS } from '../lib/validation/runtime-limits';

let passed = 0; const failed: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const execSchema = (MCPParameterSchemas as Record<string, any>)['agent.execute'];
const TASK = 'cmtask00000000000000000001';
const exec = (overrideConfig: unknown) => execSchema.safeParse({ taskId: TASK, overrideConfig });
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

console.log('\n🧪 X15/X16 — execution identity keys and bounded overrides\n');

test('X15a both schemas REJECT each identity key — for a string AND for null (presence, not value)', () => {
  for (const schema of [ModelParametersSchema, ModelParametersPassthroughSchema]) {
    for (const k of EXECUTION_IDENTITY_KEYS) {
      for (const v of ['x', null, '']) {
        const r = schema.safeParse({ temperature: 0.2, [k]: v });
        if (r.success) throw new Error(`${k}=${JSON.stringify(v)} accepted`);
        assert(r.error.issues.some((i) => i.path[0] === k && /not a model parameter/.test(i.message)), `${k}: ${JSON.stringify(r.error.issues)}`);
      }
    }
  }
});
test('X15b legitimate template-path keys still pass (systemPrompt/useSystemPrompt on 50 stored tasks; seconds-valued timeout)', () => {
  const r = ModelParametersPassthroughSchema.safeParse({ systemPrompt: 's', useSystemPrompt: true, temperature: 0.2, maxRetries: 3, timeout: 900 });
  assert(r.success, JSON.stringify(!r.success && r.error.issues));
});
test('X15c agent.execute refuses modelParameters.prompt at overrideConfig.modelParameters.prompt (one key at a time)', () => {
  for (const k of EXECUTION_IDENTITY_KEYS) {
    const r = exec({ modelParameters: { [k]: null } });
    if (r.success) throw new Error(`${k}: null accepted`);
    assert(r.error.issues.some((i: any) => i.path.join('.') === `overrideConfig.modelParameters.${k}`), `${k}: ${JSON.stringify(r.error.issues)}`);
  }
});
test('X15d the helper strips every identity key by PRESENCE (string, null, "") and keeps everything else', () => {
  const { params, stripped } = withoutExecutionIdentityKeys({ prompt: null, agentRole: '', inputContext: 'x', priority: 'HIGH',
    systemPrompt: 's', useSystemPrompt: true, maxRetries: 3, timeout: 300, temperature: 0.2 });
  assert(stripped.sort().join() === [...EXECUTION_IDENTITY_KEYS].sort().join(), `stripped ${stripped}`);
  for (const k of EXECUTION_IDENTITY_KEYS) assert(!(k in params), `${k} survived`);
  assert(params.systemPrompt === 's' && params.useSystemPrompt === true && params.maxRetries === 3 && params.timeout === 300 && params.temperature === 0.2, JSON.stringify(params));
  const clean = { temperature: 0.1 };
  assert(withoutExecutionIdentityKeys(clean).params === clean, 'a clean object must be returned as is');
});
test('X15e the frozen-snapshot resolver strips too (a stored prompt never reaches config)', () => {
  const r = resolveExecutionModelParams({ taskMetadata: { modelParameters: { prompt: null, temperature: 0.2 } }, explicitParams: undefined, template: null });
  assert(!('prompt' in r) && r.temperature === 0.2, JSON.stringify(r));
});
test('X15f BOTH execution-config builders call the helper before building the config (source check)', () => {
  for (const rel of ['lib/services/agentTaskService.ts', 'lib/services/agentExecutionConfigBuilder.ts']) {
    const src = read(rel);
    const iCall = src.indexOf('withoutExecutionIdentityKeys(modelParameters');
    const iConfig = src.search(/const (executionConfig|config): Record<string, any> = \{|const executionConfig = \{/);
    assert(iCall > 0 && iConfig > iCall, `${rel}: helper ${iCall} must precede the config ${iConfig}`);
    assert(src.includes("errorCode: 'MODEL_PARAMETERS_IDENTITY_KEY_STRIPPED'"), `${rel}: the strip must be loud`);
  }
});
test('X16a overrideConfig.maxRetries / .timeout: sane values and null pass', () => {
  for (const oc of [{ maxRetries: 3, timeout: 300000 }, { maxRetries: null, timeout: null }, { maxRetries: 0 }, { timeout: RUNTIME_LIMITS.MAX_TASK_TIMEOUT_MS }]) {
    const r = exec(oc); assert(r.success, `${JSON.stringify(oc)}: ${JSON.stringify(!r.success && r.error.issues)}`);
  }
});
test('X16b ...out-of-bounds or mistyped values are refused', () => {
  for (const oc of [{ maxRetries: RUNTIME_LIMITS.MAX_RETRIES + 1 }, { maxRetries: -1 }, { maxRetries: 1.5 }, { maxRetries: '3' },
    { timeout: RUNTIME_LIMITS.MAX_TASK_TIMEOUT_MS + 1 }, { timeout: 999 }, { timeout: 'forever' }]) {
    assert(!exec(oc).success, `accepted ${JSON.stringify(oc)}`);
  }
});
test('X16c the nested bypass is closed: modelParameters.timeout / .maxRetries are bounded by type and size', () => {
  assert(!exec({ timeout: 1000, modelParameters: { timeout: 'forever' } }).success, 'nested string timeout accepted');
  assert(!exec({ modelParameters: { maxRetries: 1e9 } }).success, 'nested huge maxRetries accepted');
  assert(!exec({ modelParameters: { timeout: RUNTIME_LIMITS.MAX_TASK_TIMEOUT_MS + 1 } }).success, 'nested huge timeout accepted');
  assert(exec({ modelParameters: { timeout: 900, maxRetries: 2 } }).success, 'stored seconds-valued timeout must still pass');
});
test('X16d the other override fields are typed exactly as on REST (they were untyped and live on MCP)', () => {
  assert(!exec({ prompt: { a: 1 } }).success, 'object prompt accepted');
  assert(!exec({ agentRole: 42 }).success, 'numeric agentRole accepted');
  assert(!exec({ mcpToolId: 'anything' }).success, 'non-CUID mcpToolId accepted');
  assert(exec({ prompt: 'Summarise the attached notes.', agentRole: 'analyst' }).success, 'a plain prompt/agentRole must pass');
});
test('X16e REST and MCP share ONE override-field object (parity cannot drift)', () => {
  const tv = read('lib/validation/task-validation.ts'); const mv = read('lib/validation/mcp-action-validation.ts');
  assert(/export const AGENT_EXECUTE_OVERRIDE_FIELDS = \{/.test(tv) && /\.\.\.AGENT_EXECUTE_OVERRIDE_FIELDS,/.test(tv), 'REST must spread the shared fields');
  assert(/\.\.\.AGENT_EXECUTE_OVERRIDE_FIELDS,/.test(mv), 'MCP must spread the shared fields');
});

console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
