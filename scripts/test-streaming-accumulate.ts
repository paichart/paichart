#!/usr/bin/env ts-node
/**
 * TEST — streaming-accumulate transport for AnthropicSdkProvider.generateText
 * (review pack: cline_docs/reviews/engine-streaming-accumulate-2026-07-04/ — Change 5)
 *
 * generateText now calls client.messages.stream().finalMessage() instead of
 * messages.create(). These tests pin: (5.1) LLMResponse shape equivalence incl. the
 * __json_buf serialization invariant, (5.2) no stream flag in the body, (5.3) beta-path
 * routing for serverSideFallback models, (5.4) error-mapping continuity against the REAL
 * SDK error envelope, (5.5) the 21,333-ceiling acceptance flip, (5.6) abort-signal
 * pass-through (part of the sole hang guard), (5.7) non-APIError rejection fallback.
 *
 * CI-safe: stub DATABASE_URL BEFORE importing the provider (it reaches lib/prisma transitively).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import { Anthropic } from '@anthropic-ai/sdk';
import { AnthropicSdkProvider } from '@/lib/services/llm/anthropic-sdk-provider';
import { SERVER_SIDE_FALLBACK_BETA, FALLBACK_MODEL } from '@/lib/services/llm/model-capabilities';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };

// ── fake client: stream() captures the call; finalMessage() resolves the fixture ──
interface Capture { variant?: 'standard' | 'beta'; body?: any; sdkOpts?: any; createCalled?: boolean }
function makeFakeClient(fixture: any, capture: Capture, rejectWith?: any) {
  const mkStream = (variant: 'standard' | 'beta') => (body: any, sdkOpts?: any) => {
    capture.variant = variant; capture.body = body; capture.sdkOpts = sdkOpts;
    return { finalMessage: () => (rejectWith ? Promise.reject(rejectWith) : Promise.resolve(fixture)) };
  };
  const boom = () => { capture.createCalled = true; throw new Error('create() must not be called under streaming-accumulate'); };
  return {
    messages: { stream: mkStream('standard'), create: boom },
    beta: { messages: { stream: mkStream('beta'), create: boom } },
  };
}

function makeProvider(fixture: any, capture: Capture, rejectWith?: any): AnthropicSdkProvider {
  const p = new AnthropicSdkProvider('test-key', 'claude-sonnet-5');
  (p as any).getClientForRequest = () => makeFakeClient(fixture, capture, rejectWith);
  return p;
}

// ── fixture: what finalMessage() resolves — shape-identical to a create() Message ──
// N-1 (TO): all four usage fields NON-ZERO — the provider maps `cache_* || undefined`,
// so zero values degenerate to undefined on both sides and prove nothing.
function baseFixture(overrides: Record<string, any> = {}) {
  const fx: any = {
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
    content: [
      { type: 'text', text: 'Hello world' },
      { type: 'tool_use', id: 'toolu_1', name: 'project', input: { action: 'task.list', povId: 'cmtestpov' } },
      { type: 'tool_use', id: 'toolu_2', name: 'perform', input: { action: 'task.comment', comment: 'assembled via input_json_delta' } },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1234, output_tokens: 567, cache_read_input_tokens: 89, cache_creation_input_tokens: 41 },
    ...overrides,
  };
  // I-2 (BC): mimic the SDK's non-enumerable JSON buffer on a streamed tool_use block —
  // the serialization pin below must show it does NOT survive JSON round-trip.
  if (fx.content?.[1]?.type === 'tool_use') {
    Object.defineProperty(fx.content[1], '__json_buf', { value: '{"action":"task.list"', enumerable: false });
  }
  return fx;
}

(async () => {
  console.log('\n🧪 TEST — streaming-accumulate (generateText via stream().finalMessage())\n');

  // ── 5.1 shape equivalence: text + multi-tool_use + usage + stopReason ──
  {
    const cap: Capture = {};
    const provider = makeProvider(baseFixture(), cap);
    const r = await provider.generateText('prompt', { apiKey: 'test-key', model: 'claude-sonnet-5', maxTokens: 4000 });
    ok(r.text === 'Hello world', '5.1 text extracted from text blocks');
    ok(r.functionCalls?.length === 2, '5.1 both tool_use blocks surfaced as functionCalls');
    ok(r.functionCalls?.[0].arguments === JSON.stringify({ action: 'task.list', povId: 'cmtestpov' }),
      '5.1 tool arguments = JSON string of ASSEMBLED input (the input_json_delta class), not "{}"');
    ok(r.functionCall?.id === 'toolu_1', '5.1 backward-compat singular functionCall = first');
    ok(r.usage?.inputTokens === 1234 && r.usage?.outputTokens === 567
      && r.usage?.cacheReadTokens === 89 && r.usage?.cacheCreationTokens === 41,
      '5.1 all FOUR usage fields non-zero and intact (R1 fixture)');
    ok(r.stopReason === 'tool_use', '5.1 stopReason normalized');
    ok(Array.isArray(r.rawContentBlocks) && r.rawContentBlocks.length === 3, '5.1 rawContentBlocks = response.content passthrough');
    ok(r.metadata?.model === 'claude-sonnet-5', '5.1 metadata.model = effectiveModel on standard path');
    ok(cap.createCalled !== true, '5.1 create() was never called');
    // I-2 (BC) serialization pin: rawContentBlocks cross 3 boundaries (re-sent to the API,
    // persisted to result.json, fed to retries) — JSON round-trip must yield plain input
    // objects with NO __json_buf residue. Keep equivalence at the LLMResponse level (F4):
    // do NOT "upgrade" this to raw-Message deep-equal.
    const roundTrip = JSON.parse(JSON.stringify(r.rawContentBlocks));
    ok(JSON.stringify(roundTrip[1]) === JSON.stringify({ type: 'tool_use', id: 'toolu_1', name: 'project', input: { action: 'task.list', povId: 'cmtestpov' } }),
      '5.1 serialization pin: tool_use round-trips to plain object, __json_buf does not survive');
  }

  // ── 5.1b stop_reason max_tokens + refusal variants ──
  {
    const cap: Capture = {};
    const r = await makeProvider(baseFixture({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'cut off mid' }] }), cap)
      .generateText('p', { apiKey: 'k', model: 'claude-sonnet-5' });
    ok(r.stopReason === 'max_tokens', '5.1b stop_reason max_tokens preserved (drives finalize-response note)');
  }
  {
    const cap: Capture = {};
    const r = await makeProvider(baseFixture({ stop_reason: 'refusal', content: [] }), cap)
      .generateText('p', { apiKey: 'k', model: 'claude-sonnet-5' });
    ok(r.stopReason === 'refusal', '5.1b stop_reason refusal preserved');
  }

  // ── 5.2 no-stream-flag invariant (builder hygiene; helper's spread overwrites anyway — F3) ──
  {
    const cap: Capture = {};
    await makeProvider(baseFixture(), cap).generateText('p', { apiKey: 'k', model: 'claude-sonnet-5' });
    ok(cap.body && !('stream' in cap.body), '5.2 body passed to stream() carries no stream key');
  }

  // ── 5.3 beta-path routing for serverSideFallback models (WU-10) ──
  {
    const cap: Capture = {};
    // Serving model in the fixture differs from the requested one — the beta accumulator's
    // relabel (verified at source, BetaMessageStream fallback case). metadata.model must
    // report the SERVING model (billing-correctness: I-2 TO / R2).
    const r = await makeProvider(baseFixture({ model: 'claude-opus-4-8' }), cap)
      .generateText('p', { apiKey: 'k', model: 'claude-fable-5' });
    ok(cap.variant === 'beta', '5.3 serverSideFallback model routes to beta.messages.stream');
    ok(Array.isArray(cap.body?.betas) && cap.body.betas.includes(SERVER_SIDE_FALLBACK_BETA), '5.3 betas rides the body');
    ok(cap.body?.fallbacks?.[0]?.model === FALLBACK_MODEL, '5.3 fallbacks rides the body');
    ok(r.metadata?.model === 'claude-opus-4-8', '5.3 metadata.model = SERVING model on rescue (cost-derivation input)');
  }
  {
    const cap: Capture = {};
    await makeProvider(baseFixture(), cap).generateText('p', { apiKey: 'k', model: 'claude-sonnet-5' });
    ok(cap.variant === 'standard' && !('betas' in (cap.body ?? {})), '5.3 non-fallback model stays on standard stream, no betas');
  }

  // ── 5.4 error-mapping continuity — REAL SDK envelope (C-1 re-spec) ──
  {
    // Build the rejection via the installed SDK's real error factory — NEVER a hand-rolled
    // inner {error:{type,message}} object (that shape doesn't exist on 0.109 and would pin
    // a phantom contract).
    const envelope = { type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long: exceeds the model context window' } };
    const apiErr = (Anthropic as any).APIError.generate(400, envelope, undefined, new Headers());
    const cap: Capture = {};
    const r = await makeProvider(baseFixture(), cap, apiErr).generateText('p', { apiKey: 'k', model: 'claude-sonnet-5' });
    // FLIPPED by the C-1 sibling fix (same-day): the mapping now unwraps the envelope one
    // level, so the keyed discriminators are ALIVE — a real context-window 400 categorizes.
    // (Pre-fix this asserted 'unknown_error'; the fixture itself is unchanged, exactly as
    // sdk-guru's confirmation predicted.)
    ok(r.error?.code === 'CONTEXT_WINDOW_EXCEEDED', '5.4 real-envelope context-window 400 → CONTEXT_WINDOW_EXCEEDED (C-1 fix live)');
    ok(typeof r.error?.message === 'string' && r.error.message.includes('Context window exceeded'), '5.4 categorized message');
    ok(r.text === '' && !r.functionCalls, '5.4 failed call yields empty text, no half-populated success');
  }

  // ── 5.4b second revived discriminator: Fable ZDR retention 400 → USER_CONFIG_REQUIRED ──
  {
    const envelope = { type: 'error', error: { type: 'invalid_request_error', message: 'Your organization has a zero data retention policy which is incompatible with this model' } };
    const apiErr = (Anthropic as any).APIError.generate(400, envelope, undefined, new Headers());
    const cap: Capture = {};
    const r = await makeProvider(baseFixture(), cap, apiErr).generateText('p', { apiKey: 'k', model: 'claude-fable-5' });
    ok(r.error?.code === 'USER_CONFIG_REQUIRED', '5.4b retention 400 → USER_CONFIG_REQUIRED (second discriminator alive)');
  }

  // ── 5.4c unknown 400s still fall through to the generic branch (no over-categorization) ──
  {
    const envelope = { type: 'error', error: { type: 'invalid_request_error', message: 'some unrelated validation problem' } };
    const apiErr = (Anthropic as any).APIError.generate(400, envelope, undefined, new Headers());
    const cap: Capture = {};
    const r = await makeProvider(baseFixture(), cap, apiErr).generateText('p', { apiKey: 'k', model: 'claude-sonnet-5' });
    ok(r.error?.code === 'unknown_error', '5.4c unrelated 400 stays unknown_error (no over-categorization)');
  }

  // ── 5.5 ceiling acceptance (the flip test: FAILS on create(), passes on stream()) ──
  {
    const cap: Capture = {};
    const r = await makeProvider(baseFixture(), cap).generateText('p', { apiKey: 'k', model: 'claude-sonnet-5', maxTokens: 32000 });
    ok(!r.error && cap.variant === 'standard', '5.5 maxTokens=32000 succeeds via stream() (no "Streaming is required")');
    // Document WHY: the real SDK guard still throws for a non-streaming call at 32000.
    let guardThrew = false;
    try { (new Anthropic({ apiKey: 'x' }) as any).calculateNonstreamingTimeout(32000, undefined); }
    catch { guardThrew = true; }
    ok(guardThrew, '5.5 installed SDK non-streaming guard still throws at 32000 (what this change routes around)');
  }

  // ── 5.6 abort-signal pass-through (F2: signal is part of the SOLE hang guard) ──
  {
    const cap: Capture = {};
    const ac = new AbortController();
    await makeProvider(baseFixture(), cap).generateText('p', { apiKey: 'k', model: 'claude-sonnet-5', signal: ac.signal });
    ok(cap.sdkOpts?.signal === ac.signal, '5.6 caller signal reaches stream(body, {signal})');
    const cap2: Capture = {};
    await makeProvider(baseFixture(), cap2).generateText('p', { apiKey: 'k', model: 'claude-sonnet-5' });
    ok(cap2.sdkOpts === undefined, '5.6 no signal → no sdkOpts (unchanged convention)');
  }

  // ── 5.7 non-APIError mid-stream rejection (N-3 AE: reachable via watchdog abort) ──
  {
    const cap: Capture = {};
    const r = await makeProvider(baseFixture(), cap, new Error('watchdog abort mid-stream'))
      .generateText('p', { apiKey: 'k', model: 'claude-sonnet-5' });
    ok(r.error?.code === 'unknown_error', '5.7 plain-Error rejection → generic unknown_error');
    ok(r.error?.message === 'watchdog abort mid-stream', '5.7 message preserved');
  }

  console.log(`\n──────────────────────────────────────────────────`);
  console.log(`  Passed: ${passed}  Failed: ${failed}`);
  console.log(failed === 0 ? '  ✅ streaming-accumulate: GREEN' : '  ❌ streaming-accumulate: RED');
  process.exit(failed === 0 ? 0 : 1);
})();
