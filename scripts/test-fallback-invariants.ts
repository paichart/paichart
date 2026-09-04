#!/usr/bin/env ts-node
/**
 * TEST — Fable server-side fallback invariants (WU-10 Step 5; sec-ops C2)
 *
 * The security invariant: `betas`/`fallbacks` may ONLY ride the per-request KEYED client
 * (getClientForRequest — BYOK isolation), never the placeholder singleton (`this.client`).
 * A violation would attach another user's fallback spend/betas to the wrong credential path.
 * Source-level tripwire (same style as the wrap-with-schema coverage test) + capability pins.
 *
 * CI-safe: reads source files; imports only model-capabilities (dependency-free).
 */
import * as fs from 'fs';
import * as path from 'path';
import { capabilitiesFor, FALLBACK_MODEL, SERVER_SIDE_FALLBACK_BETA } from '@/lib/services/llm/model-capabilities';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };

const providerSrc = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'services', 'llm', 'anthropic-sdk-provider.ts'), 'utf8');
const lines = providerSrc.split('\n');

console.log('\n🧪 TEST — fallback invariants (sec-ops C2)\n');

// ── 1. fallbacks/betas NEVER on the singleton ──
{
  ok(!providerSrc.includes('this.client.beta'), 'singleton NEVER uses the beta route (no this.client.beta)');
  // every line mentioning fallbacks:[...] must be inside a client.beta.messages call argument
  // (generateText attaches via .stream() since streaming-accumulate 2026-07-04; streamText
  // deleted same day), and `client` must be the keyed per-request one (assigned from
  // getClientForRequest above it).
  const fallbackLines = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.includes('fallbacks: [{ model: FALLBACK_MODEL }]'));
  // Exactly 1 since streamText was DELETED (2026-07-04, follow-ups item 4) — generateText's
  // stream().finalMessage() call is the sole attachment site. A second site reappearing means
  // someone added a new beta call path — review it against sec-ops C2 before accepting.
  ok(fallbackLines.length === 1, `exactly 1 fallback attachment site (generateText) — found ${fallbackLines.length}`);
  for (const { i } of fallbackLines) {
    const windowBack = lines.slice(Math.max(0, i - 12), i + 1).join('\n');
    ok(/client\.beta\.messages\s*\n?\s*\.(create|stream)\(/.test(windowBack) || windowBack.includes('client.beta.messages.create') || windowBack.includes('client.beta.messages\n'),
      `fallbacks@${i + 1}: attached via the keyed client's beta route (create or stream)`);
    const back40 = lines.slice(Math.max(0, i - 40), i + 1).join('\n');
    ok(back40.includes('getClientForRequest'), `fallbacks@${i + 1}: client is the per-request KEYED client (getClientForRequest in scope)`);
    ok(!back40.slice(back40.indexOf('getClientForRequest')).includes('this.client.'), `fallbacks@${i + 1}: no singleton use between keying and attach`);
  }
}

// ── 2. the dated beta string lives ONLY in the constant (no hand-typed copies) ──
{
  ok(!providerSrc.includes('server-side-fallback-'), 'provider has NO hardcoded beta-string literal (uses SERVER_SIDE_FALLBACK_BETA)');
  ok(SERVER_SIDE_FALLBACK_BETA === 'server-side-fallback-2026-06-01', 'beta constant pins the authoritative dated name');
  ok(FALLBACK_MODEL === 'claude-opus-4-8', 'fallback target pinned to claude-opus-4-8 (only supported target at launch)');
}

// ── 3. capability gate: the beta route is reachable ONLY for the refusal-bearing models ──
// (fable/mythos, plus opus-5 from 2026-08-05 — it carries the same cyber safeguards and can
//  return stop_reason:'refusal'. Everything else must never take the beta path.)
{
  for (const m of ['claude-fable-5', 'claude-mythos-5', 'claude-opus-5']) {
    ok(capabilitiesFor(m).serverSideFallback, `${m}: serverSideFallback true (the branch is reachable)`);
  }
  for (const m of ['claude-opus-4-8', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5']) {
    ok(!capabilitiesFor(m).serverSideFallback, `${m}: never routes via the beta/fallback path`);
  }
  // The rescue target must not itself be a fallback-routed model, or a refusal would try to
  // re-serve itself. Guards the two lists above from ever being edited into agreement.
  ok(!capabilitiesFor(FALLBACK_MODEL).serverSideFallback,
    `FALLBACK_MODEL (${FALLBACK_MODEL}) does not itself route via the fallback path`);
}

// ── 4. the singleton call site (isAvailable health probe) carries no fallback params ──
{
  const idx = providerSrc.indexOf('this.client.messages.create');
  ok(idx > -1, 'singleton health-probe site present (isAvailable)');
  const probeWindow = providerSrc.slice(idx, idx + 500);
  ok(!probeWindow.includes('fallbacks') && !probeWindow.includes('betas'), 'health probe carries NO betas/fallbacks');
}

console.log(`\n${'─'.repeat(50)}\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('  ✅ fallback invariants: GREEN\n');
