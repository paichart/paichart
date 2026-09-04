#!/usr/bin/env ts-node
/**
 * TEST — buildAnthropicRequest (SDK-upgrade Phase 2, WU-4)
 *
 * The single model-conditional builder both provider paths (generateText/streamText) feed.
 * Two guarantees: (1) the two paths can never drift — stream output === non-stream output minus
 * `stream:true` (B1 equivalence); (2) per-tier request shaping is correct (Opus/Fable omit
 * temperature; Haiku omits effort; thinking is opt-in). A wrong shape here = a live 400.
 *
 * CI-safe: stub DATABASE_URL BEFORE importing the provider (it reaches lib/prisma transitively).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
import { buildAnthropicRequest, normalizeStopReason } from '@/lib/services/llm/anthropic-sdk-provider';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };
const msgs = [{ role: 'user', content: 'hi' }];
const fns = [{ name: 'f', description: 'd', parameters: { type: 'object' as const } }];
const build = (model: string, extra: any = {}, stream = false): any =>
  buildAnthropicRequest({ model, maxTokens: 4000, systemPrompt: 'sys', ...extra } as any, msgs, { stream, fallbackModel: 'claude-haiku-4-5' });

console.log('\n🧪 TEST — buildAnthropicRequest\n');

// ── B1 equivalence: stream === non-stream minus stream:true, across tiers + option shapes ──
console.log('── stream/non-stream equivalence ──');
for (const model of ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8']) {
  const extra = { temperature: 0.3, effort: 'high', functions: fns, functionCall: 'auto', webSearch: { maxUses: 2 } };
  const ns = build(model, extra, false);
  const st = build(model, extra, true);
  const { stream, ...stMinusStream } = st;
  ok(JSON.stringify(ns) === JSON.stringify(stMinusStream), `${model}: non-stream === stream minus stream:true`);
  ok(st.stream === true && !('stream' in ns), `${model}: stream:true only on the streaming path`);
}

// ── per-tier request shaping ──
console.log('\n── per-tier shaping ──');
{
  // Opus 4.8: temperature/top_p DROPPED even if passed (defense-in-depth); effort in output_config; opt-in thinking
  const opus = build('claude-opus-4-8', { temperature: 0.3, topP: 0.9, effort: 'xhigh' });
  ok(!('temperature' in opus) && !('top_p' in opus), 'opus-4-8: temperature/top_p DROPPED even if passed');
  ok(opus.output_config?.effort === 'xhigh', 'opus-4-8: effort → output_config.effort');
  ok(!('thinking' in opus), 'opus-4-8: NO thinking without the budget signal (opt-in preserved)');
  const opusThink = build('claude-opus-4-8', { thinkingBudgetTokens: 2048 });
  ok(opusThink.thinking?.type === 'adaptive', 'opus-4-8 + budget signal → thinking {type:adaptive}');

  // Haiku 4.5: temperature KEPT; effort DROPPED (errors); no thinking
  const haiku = build('claude-haiku-4-5', { temperature: 0.3, effort: 'high', thinkingBudgetTokens: 2048 });
  ok(haiku.temperature === 0.3, 'haiku-4-5: temperature KEPT');
  ok(!('output_config' in haiku), 'haiku-4-5: effort DROPPED (allowedEfforts empty — defense-in-depth)');
  ok(!('thinking' in haiku), 'haiku-4-5: NO thinking (thinkingMode none, even with budget)');

  // Sonnet 4.6: temperature + effort
  const sonnet = build('claude-sonnet-4-6', { temperature: 0.3, effort: 'high' });
  ok(sonnet.temperature === 0.3 && sonnet.output_config?.effort === 'high', 'sonnet-4-6: temperature + effort both present');

  // Sonnet 5 (WU-10): temperature/top_p DROPPED even if passed (rejects them — 400); effort kept incl xhigh;
  // no thinking config without the budget signal (Sonnet 5 defaults to adaptive server-side when omitted).
  const sonnet5 = build('claude-sonnet-5', { temperature: 0.3, topP: 0.9, effort: 'xhigh' });
  ok(!('temperature' in sonnet5) && !('top_p' in sonnet5), 'sonnet-5: temperature/top_p DROPPED even if passed');
  ok(sonnet5.output_config?.effort === 'xhigh', 'sonnet-5: effort xhigh → output_config.effort');
  ok(!('thinking' in sonnet5), 'sonnet-5: NO explicit thinking config without the budget signal (server default = adaptive)');

  // Fable 5: temperature DROPPED; thinking OMITTED (always-on, not our config); effort kept
  const fable = build('claude-fable-5', { temperature: 0.3, thinkingBudgetTokens: 2048, effort: 'max' });
  ok(!('temperature' in fable), 'fable-5: temperature DROPPED');
  ok(!('thinking' in fable), 'fable-5: thinking OMITTED (always-on — the API thinks, not our config)');
  ok(fable.output_config?.effort === 'max', 'fable-5: effort max');

  // top_p only when temperature absent (API rejects both) AND model accepts it
  const sonnetTopP = build('claude-sonnet-4-6', { topP: 0.8 });
  ok(sonnetTopP.top_p === 0.8 && !('temperature' in sonnetTopP), 'sonnet: top_p sent when temperature absent');
}

// ── fail-loud on unknown model (defense-in-depth at the last write before the wire) ──
console.log('\n── fail-loud ──');
{
  let threw = false;
  try { build('gpt-4o'); } catch { threw = true; }
  ok(threw, 'unknown model THROWS in the builder too (not just the chokepoint)');
}

// ── normalizeStopReason (WU-5): no laundering, loud on unknown, path fallback ──
console.log('\n── normalizeStopReason ──');
{
  for (const r of ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal'] as const) {
    ok(normalizeStopReason(r, 'end_turn') === r, `known reason "${r}" maps verbatim`);
  }
  ok(normalizeStopReason(null, 'end_turn') === 'end_turn', 'null → fallback (generate path)');
  ok(normalizeStopReason(null, 'tool_use') === 'tool_use', 'null → fallback (stream path: tool_use)');
  let threw = false;
  let result: any;
  try { result = normalizeStopReason('model_context_window_exceeded', 'end_turn'); } catch { threw = true; }
  ok(!threw && result === 'end_turn', 'UNKNOWN reason → fallback, does NOT throw (new SDK reason cannot crash a run)');
  ok(normalizeStopReason('weird_future_reason', 'tool_use') === 'tool_use', 'unknown → path fallback, not silently end_turn-laundered');
}


// ── prompt caching (Finding G, 2026-07-08 — 3-specialist review) ──
console.log('\n── prompt caching breakpoints ──');
{
  const cached = build('claude-sonnet-4-6', { cacheControl: { type: 'ephemeral' } });
  ok(Array.isArray(cached.system) && cached.system[0]?.cache_control?.type === 'ephemeral',
    'cacheControl on: system is a block array carrying cache_control (breakpoint 1: tools+system)');
  ok(cached.system[0]?.text === 'sys', 'system text preserved verbatim inside the block');
  ok((cached as any).cache_control?.type === 'ephemeral',
    'cacheControl on: TOP-LEVEL auto-cache param present (breakpoint 2 — server-side placement)');

  const uncached = build('claude-sonnet-4-6', {});
  ok(typeof uncached.system === 'string', 'cacheControl absent: system stays a plain string');
  ok(!('cache_control' in uncached), 'cacheControl absent: no top-level cache_control key');

  // THE zero-markers regression (agent-execution CRITICAL): the loop shares content-array
  // references across turns — the builder must NEVER write cache_control into messages.
  const multiMsgs = [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: [{ type: 'text', text: 'a' }, { type: 'tool_use', id: 't1', name: 'f', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'r' }] },
  ];
  const req = buildAnthropicRequest(
    { model: 'claude-sonnet-4-6', maxTokens: 4000, systemPrompt: 'sys', cacheControl: { type: 'ephemeral' } } as any,
    multiMsgs, { stream: false, fallbackModel: 'claude-haiku-4-5' }
  ) as any;
  const markerInMessages = JSON.stringify(req.messages).includes('cache_control');
  ok(!markerInMessages, 'ZERO cache_control markers inside messages (shared-ref mutation regression)');
  ok(req.messages === multiMsgs || JSON.stringify(req.messages) === JSON.stringify(multiMsgs),
    'messages pass through unmodified');
}

console.log(`\n${'─'.repeat(50)}\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('  ✅ buildAnthropicRequest: GREEN\n');
