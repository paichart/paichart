#!/usr/bin/env ts-node
/**
 * TEST: buildLlmCallOptions / normalizeModelConfig (Phase 1, tool-loop extraction)
 *
 * Gate G1 (cline_docs/agent-tool-loop-implementation-plan-v1.md) — must be GREEN
 * before ANY of the 8 call-site flips. Folds review conditions:
 *   S1 (anti-bleed), B2 (exhaustive sentinel + reflection delta),
 *   B1 (normalization defaults incl. D-E provider chain), D-D (no model literal).
 * Review battery: cline_docs/reviews/tool-loop-extraction-2026-06-10/
 *
 * CI-safe: module is pure (no prisma, no logger). Fixture keys are obviously fake (S2).
 *
 * Run: npm run test:llm-call-options
 */
import {
  normalizeModelConfig,
  normalizeCacheControl,
  buildLlmCallOptions,
  NormalizedModelConfig,
} from '../lib/agents/harness/agentic-tool-loop';
import { LLMProvider, DEFAULT_MAX_TOKENS } from '../lib/services/llm/types';

let passed = 0, failed = 0;
const failures: string[] = [];
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; failures.push(m); console.log(`  ❌ ${m}`); } };

const FAKE_KEY_A = 'sk-test-FAKE-user-a';
const FAKE_KEY_B = 'sk-test-FAKE-user-b';
const signal = new AbortController().signal;

console.log('\n🔧 TEST — buildLlmCallOptions / normalizeModelConfig\n');

// ── 1. S1 anti-bleed: two builds with different apiKeys, no cross-contamination ──
console.log('── 1: anti-bleed (S1) ──');
{
  // Model now resolves from SOURCE (template/task), not user settings (two-axis, 2026-06-18).
  const cfgA = normalizeModelConfig({ temperature: 0.1, model: 'claude-sonnet-4-6' }, { apiKey: FAKE_KEY_A }, 'sys-a');
  const cfgB = normalizeModelConfig({ temperature: 0.9, model: 'claude-haiku-4-5' }, { apiKey: FAKE_KEY_B }, 'sys-b');
  const outA = buildLlmCallOptions(cfgA, 'full', { signal });
  const outB = buildLlmCallOptions(cfgB, 'full', { signal });
  ok(outA.apiKey === FAKE_KEY_A && outB.apiKey === FAKE_KEY_B, 'each build carries its own apiKey');
  ok(outA.model === 'claude-sonnet-4-6' && outB.model === 'claude-haiku-4-5', 'each build carries its own model');
  // Re-build A AFTER B — no state can have bled (module-level state would surface here)
  const outA2 = buildLlmCallOptions(cfgA, 'full', { signal });
  ok(outA2.apiKey === FAKE_KEY_A && outA2.temperature === 0.1, 're-build of A after B is unchanged (zero module state)');
  ok(outA !== outA2, 'each call returns a fresh object (no shared reference)');
}

// ── 2. B2 exhaustive sentinel: every persistent field reaches FULL output ──
console.log('\n── 2: exhaustive sentinel (B2) ──');
{
  const sentinelCfg: NormalizedModelConfig = {
    maxTokens: 11111,
    temperature: 0.42,
    topP: 0.77,
    stopSequences: ['SENTINEL_STOP'],
    systemPrompt: 'SENTINEL_SYSTEM',
    provider: LLMProvider.ANTHROPIC_SDK,
    model: 'SENTINEL_MODEL',
    apiKey: 'sk-test-FAKE-sentinel',
    webSearch: { maxUses: 7 },
    cacheControl: { type: 'ephemeral' },
    thinkingBudgetTokens: 2048,
  };
  const fns = [{ name: 'sentinel_tool', description: 'x', parameters: {} }] as any;
  const msgs = [{ role: 'user', content: 'SENTINEL_MSG' }] as any;
  const out = buildLlmCallOptions(sentinelCfg, 'full', { signal, mcpFunctions: fns, messages: msgs });
  ok(out.maxTokens === 11111, 'maxTokens');
  ok(out.temperature === 0.42, 'temperature');
  ok(out.topP === 0.77, 'topP');
  ok(JSON.stringify(out.stopSequences) === '["SENTINEL_STOP"]', 'stopSequences');
  ok(out.systemPrompt === 'SENTINEL_SYSTEM', 'systemPrompt');
  ok(out.provider === LLMProvider.ANTHROPIC_SDK, 'provider');
  ok(out.model === 'SENTINEL_MODEL', 'model');
  ok(out.apiKey === 'sk-test-FAKE-sentinel', 'apiKey');
  ok((out.webSearch as any)?.maxUses === 7, 'webSearch');
  ok(out.cacheControl?.type === 'ephemeral', 'cacheControl');
  ok(out.thinkingBudgetTokens === 2048, 'thinkingBudgetTokens');
  ok(out.functions === fns, 'functions (per-call)');
  ok(out.functionCall === 'auto', "functionCall 'auto' when functions provided");
  ok(out.messages === msgs, 'messages (per-call)');
  ok(out.signal === signal, 'signal (per-call)');
}

// ── 3. B2/A2 reflection delta: differs from FULL in EXACTLY 4 fields ──
console.log('\n── 3: reflection delta (B2/A2) ──');
{
  const cfg = normalizeModelConfig(
    { model: 'claude-haiku-4-5', webSearch: { maxUses: 3 }, thinkingBudgetTokens: 1024 },
    { apiKey: FAKE_KEY_A },
    'sys'
  );
  const fns = [{ name: 't', description: 'x', parameters: {} }] as any;
  const msgs = [{ role: 'user', content: 'm' }] as any;
  const full = buildLlmCallOptions(cfg, 'full', { signal, mcpFunctions: fns, messages: msgs });
  const refl = buildLlmCallOptions(cfg, 'reflection', { signal, mcpFunctions: fns, messages: msgs });

  ok(Array.isArray(refl.functions) && refl.functions.length === 0, "reflection: functions === []");
  ok(refl.functionCall === 'none', "reflection: functionCall === 'none'");
  ok(refl.thinkingBudgetTokens === undefined, 'reflection: thinkingBudgetTokens undefined');
  ok(!('webSearch' in refl), 'reflection: webSearch key OMITTED (matches former inline objects)');
  ok(refl.cacheControl === undefined, 'reflection: cacheControl undefined (terminal call — never cached, Finding G)');
  // every OTHER field identical — cacheControl added as the 5th documented delta 2026-07-08
  // (reflection never caches; full mode caches when tools are present)
  const deltaKeys = new Set(['functions', 'functionCall', 'thinkingBudgetTokens', 'webSearch', 'cacheControl']);
  const allKeys = new Set([...Object.keys(full), ...Object.keys(refl)]);
  let unexpectedDelta = '';
  for (const k of allKeys) {
    if (deltaKeys.has(k)) continue;
    if (JSON.stringify((full as any)[k]) !== JSON.stringify((refl as any)[k])) unexpectedDelta = k;
  }
  ok(unexpectedDelta === '', `reflection differs in EXACTLY the 5 documented fields (unexpected: '${unexpectedDelta || 'none'}')`);
}

// ── 4. two-axis model resolution: model fails loud; tuning defaults; provider/key axis ──
// (2026-06-18 cleanup) MODEL resolves from the template/task ONLY — never user settings,
// never a hardcoded literal. No source.model ⇒ throw MODEL_UNRESOLVED. Replaces the old
// D-D "model chain ends undefined" invariant (model is now load-bearing, not optional).
console.log('\n── 4: two-axis model resolution (fail-loud + defaults) ──');
{
  // No source.model → FAIL LOUD, even if a STALE user-settings model is present at
  // runtime (the field was dropped from the type, but pre-cleanup rows may still carry
  // it — `as any` simulates that; it must be runtime-ignored, not used).
  let threw = false, code = '';
  try { normalizeModelConfig({}, { model: 'user-model', apiKey: FAKE_KEY_B } as any, 'sys'); }
  catch (e: any) { threw = true; code = e?.code; }
  ok(threw && code === 'MODEL_UNRESOLVED', 'no source.model → throws MODEL_UNRESOLVED (user-settings model is NOT a model source)');

  // With a source model, the rest of the chain resolves; tuning defaults apply; no literal.
  const ok1 = normalizeModelConfig({ model: 'claude-haiku-4-5' }, {}, undefined);
  ok(ok1.provider === LLMProvider.ANTHROPIC_SDK, 'provider chain ends ANTHROPIC_SDK (D-E)');
  ok(ok1.model === 'claude-haiku-4-5', 'source (template/task) model used');
  // Anti-injection (D-D): a DIFFERENT source model flows through verbatim — proves no hardcoded
  // model literal is injected. (Was a `!includes('claude')` check, obsolete now that capabilitiesFor
  // requires a known/real claude model; the source-text grep guard covers the "no literal in code" axis.)
  ok(normalizeModelConfig({ model: 'claude-opus-4-8' }, {}, undefined).model === 'claude-opus-4-8',
    'a different source model is used verbatim — no hardcoded model literal injected');
  ok(ok1.temperature === 0.3, 'temperature default 0.3 (DEFAULT_MODEL_PARAMS) — Haiku accepts temperature');
  ok(ok1.maxTokens === DEFAULT_MAX_TOKENS, 'maxTokens default DEFAULT_MAX_TOKENS');
  ok(ok1.apiKey === undefined, 'apiKey undefined passes through verbatim — no fallback (S3)');

  // Provider/key axis STILL resolves from user settings; model does NOT (stale model `as any`).
  const prov = normalizeModelConfig({ model: 'claude-haiku-4-5' }, { provider: LLMProvider.ANTHROPIC_SDK, model: 'user-model', apiKey: FAKE_KEY_B } as any, 'sys');
  ok(prov.model === 'claude-haiku-4-5', 'user-settings model is IGNORED — model is template/task-only (two-axis)');
  ok(prov.apiKey === FAKE_KEY_B, 'user-settings apiKey honored (provider/key axis)');
}

// ── 5. adapter parity: engine-shaped and stream-shaped sources → identical output ──
console.log('\n── 5: source-shape parity (B1) ──');
{
  // engine `config.*` and stream `modelParameters.*` carry the same field names;
  // one normalize function serves both. Assert equivalent inputs → deep-equal output.
  const engineShaped = { maxTokens: 5000, temperature: 0.5, topP: 0.9, model: 'claude-haiku-4-5', webSearch: { maxUses: 2 } };
  const streamShaped = { maxTokens: 5000, temperature: 0.5, topP: 0.9, model: 'claude-haiku-4-5', webSearch: { maxUses: 2 } };
  const a = normalizeModelConfig(engineShaped, { apiKey: FAKE_KEY_A }, 'sys');
  const b = normalizeModelConfig(streamShaped, { apiKey: FAKE_KEY_A }, 'sys');
  ok(JSON.stringify(a) === JSON.stringify(b), 'identical inputs through the single adapter → identical outputs');
}

// ── 6. initial-call shape: no messages key when not provided ──
console.log('\n── 6: per-call key presence ──');
{
  const cfg = normalizeModelConfig({ model: 'claude-haiku-4-5' }, { apiKey: FAKE_KEY_A }, 'sys');
  const initial = buildLlmCallOptions(cfg, 'full', { signal });
  ok(!('messages' in initial), 'initial call: messages key absent (matches former inline objects)');
  ok(initial.functions === undefined && initial.functionCall === undefined, 'toolless full call: functions/functionCall undefined');
}


// ── prompt caching resolution (Finding G, 2026-07-08) ──
console.log('\n── cacheControl normalization + per-mode gating ──');
{
  ok(normalizeCacheControl(false) === undefined, 'false → OFF (explicit opt-out survives the default)');
  ok(normalizeCacheControl(null)?.type === 'ephemeral', 'null → DEFAULT-ON (prod nulls are form residue)');
  ok(normalizeCacheControl(undefined)?.type === 'ephemeral', 'undefined → DEFAULT-ON');
  ok(normalizeCacheControl(true)?.type === 'ephemeral', 'true (legacy boolean) → ephemeral');
  ok(normalizeCacheControl({ type: 'persistent', id: 'x' })?.type === 'ephemeral',
    'legacy persistent object → normalized to ephemeral (never reaches the wire as-is)');
  ok(normalizeCacheControl('yes') === undefined, 'junk string → OFF (untyped-metadata tolerance)');
  process.env.PROMPT_CACHE_DISABLED = 'true';
  ok(normalizeCacheControl(null) === undefined, 'kill-switch env → OFF regardless of default');
  delete process.env.PROMPT_CACHE_DISABLED;

  const cfg = normalizeModelConfig({ model: 'claude-sonnet-4-6' }, {}, 'sys');
  ok(cfg.cacheControl?.type === 'ephemeral', 'normalizeModelConfig: default-ON lands in cfg');
  const cfgOff = normalizeModelConfig({ model: 'claude-sonnet-4-6', cacheControl: false }, {}, 'sys');
  ok(cfgOff.cacheControl === undefined, 'normalizeModelConfig: explicit false stays OFF');

  const fnList = [{ name: 'f', description: 'd', parameters: { type: 'object' } }] as any;
  const full = buildLlmCallOptions(cfg, 'full', { signal, mcpFunctions: fnList });
  ok(full.cacheControl?.type === 'ephemeral', 'full mode WITH tools → cached');
  const fullNoTools = buildLlmCallOptions(cfg, 'full', { signal });
  ok(fullNoTools.cacheControl === undefined, 'full mode WITHOUT tools → not cached (single-call guard)');
  const refl = buildLlmCallOptions(cfg, 'reflection', { signal });
  ok(refl.cacheControl === undefined, 'reflection mode → never cached (terminal call)');
}

console.log(`\n${'─'.repeat(50)}\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) { console.log(`\n  Failures:\n${failures.map(f => `   - ${f}`).join('\n')}`); process.exit(1); }
console.log('  ✅ G1 gate: GREEN\n');
