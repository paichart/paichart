#!/usr/bin/env ts-node
/**
 * X19 (2026-09-27): an execution config's `timeout` is SECONDS. The two millisecond sources (tasks.timeout,
 * agent.execute overrideConfig.timeout) are converted by ONE helper at every site that builds the config, and an
 * explicit per-run override wins over the template. Pure + source checks; no DB.
 */
import * as fs from 'fs';
import * as path from 'path';
import { msToExecutionTimeoutSeconds, DEFAULT_EXECUTION_TIMEOUT_SECONDS, buildTemplateModelParameters } from '../lib/services/llm/template-model-params';

let passed = 0; const failed: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const SITES = ['lib/services/agentTaskService.ts', 'lib/services/agentExecutionConfigBuilder.ts', 'lib/services/agentExecutionEngine.ts'];

console.log('\n🧪 X19 — execution config timeout is seconds\n');

test('T1 ms → seconds for real timeouts; a sub-1000 ms value (the two June rows: 60, 450) is ABSENT, not 0.06 s', () => {
  assert(msToExecutionTimeoutSeconds(300000) === 300 && msToExecutionTimeoutSeconds(900000) === 900, 'ms conversion');
  assert(msToExecutionTimeoutSeconds(1000) === 1, 'floor is inclusive');
  for (const v of [60, 450, 999, 0, -5, null, undefined, '300000', NaN]) {
    assert(msToExecutionTimeoutSeconds(v) === undefined, `${String(v)} must be absent`);
  }
  assert(DEFAULT_EXECUTION_TIMEOUT_SECONDS === 300, 'default is 300 seconds');
});
test('T2 the template path stays SECONDS (it is what every recorded execution carries)', () => {
  assert(buildTemplateModelParameters({ timeout: 600 }).timeout === 600, 'template seconds must pass through unchanged');
  assert(buildTemplateModelParameters({}).timeout === 300, 'template default is 300 seconds');
});
test('T3 no site still defaults an execution timeout to milliseconds (300000)', () => {
  for (const rel of SITES) {
    assert(!/timeout[^\n]*\?\?\s*300000/.test(read(rel)), `${rel} still falls back to 300000 ms`);
    assert(read(rel).includes('msToExecutionTimeoutSeconds(task.timeout)'), `${rel} does not convert the task column`);
  }
});
test('T4 agentTaskService: an explicit per-run override is converted and applied AFTER the modelParameters spread', () => {
  const src = read('lib/services/agentTaskService.ts');
  const iSpread = src.indexOf('...modelParameters,');
  const iOverride = src.indexOf('msToExecutionTimeoutSeconds(options.overrideConfig?.timeout)');
  assert(iSpread > 0 && iOverride > iSpread, `override ${iOverride} must follow the spread ${iSpread}`);
  assert(!/timeout:\s*options\.overrideConfig\?\.timeout\s*\?\?/.test(src), 'the raw-ms override fallback is still there');
});

console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
