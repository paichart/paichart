#!/usr/bin/env ts-node
/**
 * Model-resolution two-axis parity test (2026-06-18 cleanup, Protocol 2 reviewed).
 *
 * Pins the invariant that MODEL resolves from the template/task ONLY and FAILS LOUD
 * when absent — across BOTH execution-path builders (agentTaskService = direct/user
 * path, agentExecutionConfigBuilder = reactor path), which share
 * `buildTemplateModelParameters`. The bug this guards: a hardcoded 'claude-haiku-4-5'
 * base in those builders SHADOWED the real resolution (a model-less template silently
 * ran Haiku even when the configured model said otherwise). The two paths diverged —
 * stream never injected Haiku, engine did — a live dual-path break.
 * See cline_docs/reviews/model-resolution-cleanup-2026-06-18/.
 *
 * Behavioral assertions (import the real helpers) + a source-text guard against
 * re-drift. CI-safe: the imported modules don't reach prisma (same as
 * test-llm-call-options, which already imports normalizeModelConfig in CI).
 *
 * Created: 2026-06-18
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildTemplateModelParameters } from '@/lib/services/llm/template-model-params';
import { normalizeModelConfig } from '@/lib/agents/harness/agentic-tool-loop';
import { maxOutputTokensForModel } from '@/lib/validation/runtime-limits';
import { ModelParametersSchema, ModelParametersPassthroughSchema } from '@/lib/validation/model-parameters';
import { DEFAULT_MAX_TOKENS } from '@/lib/services/llm/types';

let passed = 0, failed = 0;
function test(d: string, fn: () => void) {
  try { fn(); console.log(`✅ ${d}`); passed++; }
  catch (e: any) { console.error(`❌ ${d}\n   ${e.message}`); failed++; }
}
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

console.log('🔁 Model-resolution two-axis parity\n');

// ── Behavioral: the shared builder injects NO hardcoded model/temperature/provider ──
test('builder: template WITH model → carries that model', () => {
  const mp = buildTemplateModelParameters({ metadata: { modelParameters: { model: 'claude-sonnet-4-6' } } });
  ok(mp.model === 'claude-sonnet-4-6', 'template-set model is carried through');
});
test('builder: model-less template → NO model/temperature/provider/maxTokens injected', () => {
  const mp = buildTemplateModelParameters({ metadata: { modelParameters: {} } });
  ok(mp.model === undefined, 'no model injected when the template omits it');
  ok(JSON.stringify(mp).includes('claude') === false, 'NO hardcoded claude literal in builder output');
  ok(mp.temperature === undefined, 'no hardcoded temperature (resolves to DEFAULT_MODEL_PARAMS downstream)');
  ok(mp.provider === undefined, 'no hardcoded provider (resolves from userLLMSettings downstream)');
  ok(mp.maxTokens === undefined, 'no timeout-derived maxTokens formula (resolves to DEFAULT_MAX_TOKENS downstream)');
});

// ── maxTokens: model-aware ceiling + DEFAULT resolution (2026-06-18) ──
test('maxOutputTokensForModel: Opus 128K, Sonnet/Haiku/unknown 64K', () => {
  ok(maxOutputTokensForModel('claude-opus-4-8') === 128000, 'Opus → 128K');
  ok(maxOutputTokensForModel('claude-opus-4-6') === 128000, 'Opus 4.6 → 128K');
  ok(maxOutputTokensForModel('claude-sonnet-4-6') === 64000, 'Sonnet → 64K');
  ok(maxOutputTokensForModel('claude-haiku-4-5') === 64000, 'Haiku → 64K');
  ok(maxOutputTokensForModel(undefined) === 64000, 'unknown/undefined → conservative 64K');
});
test('normalize: maxTokens defaults to DEFAULT_MAX_TOKENS when template omits it', () => {
  const cfg = normalizeModelConfig({ model: 'claude-haiku-4-5' }, {}, undefined);
  ok(cfg.maxTokens === DEFAULT_MAX_TOKENS, 'no source maxTokens → DEFAULT_MAX_TOKENS (24000), not the old 4000 formula');
});
test('normalize: Opus gets its full 128K; Sonnet clamps to 64K', () => {
  const opus = normalizeModelConfig({ model: 'claude-opus-4-8', maxTokens: 100000 }, {}, undefined);
  ok(opus.maxTokens === 100000, 'Opus request of 100K is honored (not under-capped at 64K)');
  const sonnet = normalizeModelConfig({ model: 'claude-sonnet-4-6', maxTokens: 100000 }, {}, undefined);
  ok(sonnet.maxTokens === 64000, 'Sonnet request of 100K clamps to its 64K ceiling');
});

// ── D-1 template-lock: maxToolTurns REJECTED on task-path writes (orchestration param) ──
test('schema: both variants REJECT maxToolTurns (template-controlled), strict + passthrough', () => {
  ok(ModelParametersPassthroughSchema.safeParse({ maxToolTurns: 50 }).success === false, 'passthrough rejects maxToolTurns');
  ok(ModelParametersSchema.safeParse({ maxToolTurns: 50 }).success === false, 'strict rejects maxToolTurns');
  // the LLM-call params still pass (the lock is targeted, not a blanket reject)
  const okPass = ModelParametersPassthroughSchema.safeParse({ model: 'claude-opus-4-8', temperature: 0.5, maxTokens: 8000 });
  ok(okPass.success === true && (okPass as any).data.model === 'claude-opus-4-8', 'LLM-call params still accepted');
  // null/absent maxToolTurns is a no-op (not a reject)
  ok(ModelParametersPassthroughSchema.safeParse({ model: 'm', maxToolTurns: null }).success === true, 'null maxToolTurns is a no-op');
});

// ── Behavioral: normalize fails loud on model-less builder output; resolves when present ──
test('normalize: model-less template output → throws MODEL_UNRESOLVED', () => {
  let code = '';
  try { normalizeModelConfig(buildTemplateModelParameters({ metadata: {} }), {}, undefined); }
  catch (e: any) { code = e?.code; }
  ok(code === 'MODEL_UNRESOLVED', 'fail-loud fires for a model-less template (no silent Haiku)');
});
test('normalize: template-with-model output → resolves that model end-to-end', () => {
  const cfg = normalizeModelConfig(
    buildTemplateModelParameters({ metadata: { modelParameters: { model: 'claude-sonnet-4-6' } } }), {}, undefined);
  ok(cfg.model === 'claude-sonnet-4-6', 'template model resolves end-to-end');
});

// ── Source-text guard: both builders share the resolver; neither hardcodes a model ──
const REPO = path.resolve(__dirname, '..');
const directPath = fs.readFileSync(path.join(REPO, 'lib/services/agentTaskService.ts'), 'utf-8');
const reactorPath = fs.readFileSync(path.join(REPO, 'lib/services/agentExecutionConfigBuilder.ts'), 'utf-8');
test('BOTH builders use buildTemplateModelParameters (one shared resolver — no re-drift)', () => {
  ok(/buildTemplateModelParameters\(task\.agentTemplate\)/.test(directPath), 'agentTaskService uses the shared resolver');
  ok(/buildTemplateModelParameters\(task\.agentTemplate\)/.test(reactorPath), 'agentExecutionConfigBuilder uses the shared resolver');
});
test('NEITHER builder hardcodes a claude-haiku-4-5 literal', () => {
  ok(directPath.includes("'claude-haiku-4-5'") === false, 'agentTaskService has no claude-haiku-4-5 literal');
  ok(reactorPath.includes("'claude-haiku-4-5'") === false, 'agentExecutionConfigBuilder has no claude-haiku-4-5 literal');
});

// ── THIRD wiring site (UAT hotfix 2026-07-04): the stream route resolves live
// (not via a frozen execution.config), so it must ALSO use the shared resolver
// as its template layer. The 2026-06-18 cleanup missed this site — every GUI
// run of a task relying on the TEMPLATE-level model died MODEL_UNRESOLVED
// while the engine ran the same task fine (task cmque5dgl000qyxg42e06zy5z).
const streamPath = fs.readFileSync(path.join(REPO, 'app/api/pov/agent/execute/stream/route.ts'), 'utf-8');
test('stream route reads the FROZEN execution.config — its live chain is retired (5b-iii, I-10)', () => {
  // The 506ddd91 3rd-wiring-site fix (live chain with non-empty guards) moved to the
  // createAgentExecution chokepoint; the stream reading execution.config makes a
  // missed wiring site structurally impossible for every FUTURE create path too.
  ok(streamPath.includes('(execution.config as Record<string, any> | null) ?? {}'), 'stream reads the frozen config');
  ok(!streamPath.includes('buildTemplateModelParameters'), 'a live stream chain re-introduced — the 506ddd91 class returns');
  ok(!streamPath.includes('nonEmptyParams'), 'stream-local chain helper re-introduced');
});
test('the ONE chain (with non-empty guards) lives at the chokepoint resolver', () => {
  const leaf = fs.readFileSync(path.join(REPO, 'lib/services/llm/template-model-params.ts'), 'utf-8');
  ok(leaf.includes('export function resolveExecutionModelParams'), 'chokepoint resolver missing');
  ok(/nonEmpty\(taskMeta\)\s*\|\|\s*nonEmpty\(input\.explicitParams\)\s*\|\|/.test(leaf), 'non-empty-guarded precedence chain missing (bare {} must fall through)');
  const createSrc = fs.readFileSync(path.join(REPO, 'lib/services/agent-execution-create.ts'), 'utf-8');
  ok(createSrc.includes('resolveExecutionModelParams({'), 'createAgentExecution does not call the chain');
});

console.log(`\n=====================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`=====================================`);
if (failed > 0) process.exit(1);
