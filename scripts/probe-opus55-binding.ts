#!/usr/bin/env ts-node
/**
 * V1 — Opus 5.5 preserved-thinking BINDING PROBE (Opus 5.5 loop audit, 2026-10-07).
 * Design + expected results: cline_docs/reviews/opus55-loop-audit-2026-10-07/V1-V2-VERIFICATION.md
 *
 * Answers two questions with ONE paid call:
 *   1. Does the API reject the shapes the audit says it rejects, and accept the shipped fix? (account-independent:
 *      every probe except (e) opts INTO enforcement with `prefix_mismatch_behavior: 'error'`).
 *   2. Is THIS key's org enforced by default? (probe (e) — no beta header, no field).
 *
 * Step 1 (PAID, ~$0.01–0.05 per attempt, ≤ 3 attempts): the REAL production request path — normalizeModelConfig →
 *   buildLlmCallOptions('full') → AnthropicSdkProvider.generateText (stream().finalMessage(), server-side fallback
 *   beta) — on claude-opus-5-5 at effort high, with a two-tool set and a prompt that needs a little reasoning before
 *   calling a tool. Retried (≤ 3) until the response carries a signed `thinking` block AND a `tool_use`.
 * Step 2 (FREE): `messages.countTokens` runs the SAME history-editing check. Each probe is a body variant:
 *   (a) tool_result appended; same system + tools                     — the continuation shape        → expect OK
 *   (b) + final-turn reflection, tools OMITTED (pre-C1 shape)          — the bug                       → expect 400
 *   (c) + reflection, SAME tools, tool_choice none                     — the C1 fix                    → expect OK
 *   (d) (c) with `system` as a plain string instead of the cached block array (representation only)  → expect OK
 *   (f) the ACTUAL shipped reflection body: buildLlmCallOptions('reflection') → buildAnthropicRequest  → expect OK
 *   (e) (b) WITHOUT the beta header and field — the org's DEFAULT: 400 naming the header ⇒ enforced by default;
 *       OK ⇒ not enforced for this org (customers on newer orgs still are — C1 is required regardless)
 *
 * Usage:   ANTHROPIC_API_KEY=<the triggering user's BYOK key> npx ts-node -r tsconfig-paths/register \
 *            scripts/probe-opus55-binding.ts --spend
 * Without --spend it prints this plan + the cost bound and exits 2 (no network). --key-env NAME reads another var.
 * Read-only against pAIchart: no DB, no writes (DATABASE_URL is stubbed for the provider's transitive import).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
import Anthropic from '@anthropic-ai/sdk';
import { normalizeModelConfig, buildLlmCallOptions } from '../lib/agents/harness/agentic-tool-loop';
import { AnthropicSdkProvider, buildAnthropicRequest } from '../lib/services/llm/anthropic-sdk-provider';
import { LLMProvider } from '../lib/services/llm/types';

const MODEL = 'claude-opus-5-5';
const BINDING_BETA = 'thinking-binding-controls-2026-08-01';
const MAX_ATTEMPTS = 3;
const MAX_TOKENS = 2048;
// Opus 5.5 list price: $4/M input, $20/M output. Input ≈ 1.5K tokens (system + 2 tools + prompt); output ≤ MAX_TOKENS.
const COST_PER_ATTEMPT_MAX = (1500 * 4 + MAX_TOKENS * 20) / 1e6;

const SYSTEM = 'You are a network change author. Use the provided tools when the task asks you to record a result.';
const PROMPT =
  'Three subnets are 10.20.0.0/24, 10.20.1.0/24 and 10.20.2.0/24. Work out the smallest single CIDR that contains all ' +
  'three, then call record_aggregate with it. Do not answer in text before calling the tool.';
const TOOLS = [
  { name: 'record_aggregate', description: 'Record the derived aggregate CIDR.',
    parameters: { type: 'object', properties: { cidr: { type: 'string' } }, required: ['cidr'] } },
  { name: 'read_more', description: 'Page a truncated result (unused here; present so the tool SET has two members).',
    parameters: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } },
] as any;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const spend = process.argv.includes('--spend');
  const keyEnv = arg('--key-env') ?? 'ANTHROPIC_API_KEY';
  console.log(`\nV1 — ${MODEL} preserved-thinking binding probe`);
  console.log(`  paid step: ≤ ${MAX_ATTEMPTS} × ≤ $${COST_PER_ATTEMPT_MAX.toFixed(3)} = ≤ $${(MAX_ATTEMPTS * COST_PER_ATTEMPT_MAX).toFixed(2)} (usually one attempt, ~$0.01–0.03)`);
  console.log('  probes (a)(b)(c)(d)(e)(f): messages.countTokens — free');
  if (!spend) {
    console.log('\nREFUSING: pass --spend to make the paid call (and set the BYOK key in $' + keyEnv + ').\n');
    process.exit(2);
  }
  const apiKey = process.env[keyEnv];
  if (!apiKey) { console.error(`REFUSING: $${keyEnv} is not set.`); process.exit(2); }

  // ── Step 1: the production full-mode request on the real provider ──
  const cfg = normalizeModelConfig({ model: MODEL, maxTokens: MAX_TOKENS, cacheControl: { type: 'ephemeral' }, effort: 'high' },
    { provider: LLMProvider.ANTHROPIC_SDK, apiKey }, SYSTEM);
  const provider = new AnthropicSdkProvider();
  let resp: any = null;
  let spent = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r: any = await provider.generateText(PROMPT, buildLlmCallOptions(cfg, 'full', { signal: new AbortController().signal, mcpFunctions: TOOLS }));
    const u = r?.usage ?? {};
    spent += ((u.inputTokens ?? 0) * 4 + (u.cacheCreationTokens ?? 0) * 5 + (u.cacheReadTokens ?? 0) * 0.2 + (u.outputTokens ?? 0) * 20) / 1e6;
    if (r?.error) { console.error(`  attempt ${attempt}: provider error — ${r.error.message ?? JSON.stringify(r.error)}`); process.exit(1); }
    const blocks: any[] = r?.rawContentBlocks ?? [];
    const thinking = blocks.find(b => b.type === 'thinking' && typeof b.signature === 'string' && b.signature.length > 0);
    const toolUse = blocks.find(b => b.type === 'tool_use');
    console.log(`  attempt ${attempt}: served by ${r?.metadata?.model}, stop ${r?.stopReason}, blocks [${blocks.map(b => b.type).join(', ')}]`);
    if (thinking && toolUse) { resp = r; break; }
  }
  console.log(`  paid step spent ≈ $${spent.toFixed(4)}`);
  if (!resp) { console.error('  no response carried BOTH a signed thinking block and a tool_use — nothing to probe. Stop.'); process.exit(1); }

  const blocks: any[] = resp.rawContentBlocks;
  const toolUse = blocks.find(b => b.type === 'tool_use');
  const history: any[] = [
    { role: 'user', content: PROMPT },
    { role: 'assistant', content: blocks },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'recorded' }] },
  ];
  // Reflection shape: the audit's paths append the final assistant turn + a user prompt. The final turn here is the
  // SAME produced turn (a block that is replayed is the point), so append only a user text after the tool_result.
  const reflectHistory = [...history.slice(0, 2), { role: 'user', content: [
    { type: 'tool_result', tool_use_id: toolUse.id, content: 'recorded' },
    { type: 'text', text: 'Reflection: restate the aggregate you recorded in one sentence. Do not call tools.' },
  ] }];

  // The full-mode body the block was produced under (system as the cached block array + the tool set).
  const fullBody: any = buildAnthropicRequest(buildLlmCallOptions(cfg, 'full', { signal: new AbortController().signal, mcpFunctions: TOOLS }) as any,
    [{ role: 'user', content: PROMPT }], { stream: false, fallbackModel: MODEL });
  const toolsWire = fullBody.tools;
  const systemWire = fullBody.system;
  const bind = { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'error' } };
  const client = new Anthropic({ apiKey });

  type Probe = { id: string; expect: 'OK' | '400'; body: any; beta: boolean; note: string };
  const shippedReflection: any = buildAnthropicRequest(
    buildLlmCallOptions(cfg, 'reflection', { signal: new AbortController().signal, mcpFunctions: TOOLS, messages: reflectHistory as any }) as any,
    reflectHistory, { stream: false, fallbackModel: MODEL });
  const probes: Probe[] = [
    { id: '(a)', expect: 'OK', beta: true, note: 'continuation: tool_result appended, same system + tools',
      body: { system: systemWire, tools: toolsWire, messages: history } },
    { id: '(b)', expect: '400', beta: true, note: 'pre-C1 reflection: tools OMITTED, string system',
      body: { system: SYSTEM, messages: reflectHistory } },
    { id: '(c)', expect: 'OK', beta: true, note: 'C1 fix: same tools + tool_choice none',
      body: { system: systemWire, tools: toolsWire, tool_choice: { type: 'none' }, messages: reflectHistory } },
    { id: '(d)', expect: 'OK', beta: true, note: '(c) with system as a plain string (representation only)',
      body: { system: SYSTEM, tools: toolsWire, tool_choice: { type: 'none' }, messages: reflectHistory } },
    { id: '(f)', expect: 'OK', beta: true, note: 'the SHIPPED reflection body (buildLlmCallOptions → buildAnthropicRequest)',
      body: { system: shippedReflection.system, tools: shippedReflection.tools, tool_choice: shippedReflection.tool_choice, messages: shippedReflection.messages } },
    { id: '(e)', expect: '400', beta: false, note: 'pre-C1 shape WITHOUT header/field — is this org enforced by default?',
      body: { system: SYSTEM, messages: reflectHistory } },
  ];

  console.log('\n  probe  expect  result');
  const results: Record<string, string> = {};
  for (const p of probes) {
    const params: any = { model: MODEL, ...p.body, ...(p.beta ? { thinking: bind, betas: [BINDING_BETA] } : {}) };
    let result: string;
    try {
      const r: any = await client.beta.messages.countTokens(params);
      result = `OK (${r.input_tokens} input tokens)`;
    } catch (e: any) {
      const msg = String(e?.error?.error?.message ?? e?.message ?? e);
      result = `${e?.status ?? 'ERR'} — ${msg.slice(0, 220)}`;
    }
    results[p.id] = result;
    const pass = p.expect === 'OK' ? result.startsWith('OK') : result.startsWith('400');
    console.log(`  ${p.id}    ${p.expect.padEnd(4)}   ${pass ? '✓' : '✗'} ${result}\n         ${p.note}`);
  }

  const e = results['(e)'] ?? '';
  console.log('\n  READING');
  console.log(`  · C1 confirmed by the API:  ${results['(b)']?.startsWith('400') && results['(c)']?.startsWith('OK') && results['(f)']?.startsWith('OK') ? 'YES' : 'NO — read the rows above'}`);
  console.log(`  · this org enforced by default: ${e.startsWith('400') ? (/binding|header|prefix/i.test(e) ? 'YES (400 names the binding controls)' : 'a 400 that does not name the header — read it') : 'NO (the API accepted an edited history without opt-in)'}`);
  console.log('  · if countTokens rejected `block_binding` itself (a 400 on (a)), re-run the six bodies as max_tokens:1 messages calls — cents.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
