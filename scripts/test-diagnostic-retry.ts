#!/usr/bin/env ts-node
/**
 * Diagnostic-Retry (#90) Tests — convergence Phase 3
 *
 * Behavior lock for lib/agents/harness/diagnostic-retry.ts (the extracted 50-69
 * band reflection pass), proven GREEN against the shared function BEFORE the two
 * inline copies are swapped out (B1 pattern), plus caller pins.
 *
 * Created: 2026-07-05
 * Plan: cline_docs/reviews/execution-path-convergence-2026-07-04/implementation-plan.md §Phase 3
 */

import * as fs from 'fs';
import * as path from 'path';
import { runDiagnosticRetry, DiagnosticRetryInput } from '../lib/agents/harness/diagnostic-retry';
import { LLMProvider } from '../lib/services/llm/types';

console.log('🔁 Diagnostic-Retry (#90) Tests (Phase 3)\n');

let passed = 0;
let failed = 0;

function test(d: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`✅ ${d}`); passed++; })
    .catch((e) => { console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   ${e.message}`); failed++; });
}
function ok(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const silentLogger = { info: () => {}, warn: () => {} };
function capturingLogger() {
  const entries: Array<{ level: string; obj: any; msg: string }> = [];
  return { entries, logger: { info: (o: any, m: string) => entries.push({ level: 'info', obj: o, msg: m }), warn: (o: any, m: string) => entries.push({ level: 'warn', obj: o, msg: m }) } };
}

const cfg = {
  maxTokens: 4096, temperature: 0.3, topP: undefined, stopSequences: undefined,
  systemPrompt: 'sys', provider: LLMProvider.ANTHROPIC_SDK, model: 'test-model',
  apiKey: 'sk-test-FAKE-diag', webSearch: undefined, cacheControl: undefined, thinkingBudgetTokens: undefined,
} as any;

function scriptedLLM(responses: any[]) {
  const calls: any[] = [];
  let i = 0;
  return { calls, generateText: async (_p: string, o: any, _u?: string) => { calls.push(o); const r = responses[i++]; if (r instanceof Error) throw r; return r; } };
}
const mkResp = (over: Record<string, unknown> = {}) => ({
  text: 'improved answer. Confidence: 80/100', stopReason: 'end_turn',
  usage: { inputTokens: 40, outputTokens: 20 },
  rawContentBlocks: [{ type: 'text', text: 'improved answer' }], ...over,
});

function baseInput(over: Partial<DiagnosticRetryInput> = {}): DiagnosticRetryInput {
  return {
    confidenceScore: 60, confidenceCapped: false, correctionTurnUsed: false,
    text: 'prior response. Confidence: 60/100',
    currentResponse: { text: 'prior response', rawContentBlocks: [{ type: 'text', text: 'prior response' }], stopReason: 'end_turn' },
    messageHistory: [{ role: 'user', content: 'do the task' }],
    totalUsage: { inputTokens: 100, outputTokens: 50 } as any,
    prompt: 'do the task', normalizedLlmConfig: cfg,
    executionId: 'exec-diag-1', userId: 'user-a', ...over,
  };
}

async function main() {
  // ── Fires in-band, updates text/response/confidence, folds tokens, pushes history ──
  await test('band 50-69 clean → retry fires, updates text/confidence, folds tokens', async () => {
    const llm = scriptedLLM([mkResp()]);
    const inp = baseInput();
    const r = await runDiagnosticRetry(inp, { generateText: llm.generateText, logger: silentLogger });
    ok(r.diagnosticRetryUsed === true, 'diagnosticRetryUsed true');
    ok(r.text === 'improved answer. Confidence: 80/100', 'text replaced by retry output');
    ok(r.confidenceScore === 80, 're-parsed confidence 80');
    ok(inp.totalUsage.inputTokens === 140 && inp.totalUsage.outputTokens === 70, 'retry tokens folded into totalUsage');
    ok(inp.messageHistory.length === 3, 'assistant + diagnostic-user pushed onto messageHistory');
    ok(inp.messageHistory[1].role === 'assistant' && inp.messageHistory[2].role === 'user', 'push order: assistant then user');
    ok(llm.calls.length === 1 && llm.calls[0].functions?.length === 0 || llm.calls[0].functionCall === undefined, 'reflection call has no tools (no loop re-entry)');
  });

  // ── Disqualifiers: each independently suppresses the retry ──
  await test('confidenceCapped → no retry', async () => {
    const llm = scriptedLLM([mkResp()]);
    const r = await runDiagnosticRetry(baseInput({ confidenceCapped: true }), { generateText: llm.generateText, logger: silentLogger });
    ok(r.diagnosticRetryUsed === false && llm.calls.length === 0, 'no retry, no LLM call');
    ok(r.confidenceScore === 60 && r.text === 'prior response. Confidence: 60/100', 'outputs unchanged');
  });
  await test('correctionTurnUsed → no retry', async () => {
    const llm = scriptedLLM([mkResp()]);
    const r = await runDiagnosticRetry(baseInput({ correctionTurnUsed: true }), { generateText: llm.generateText, logger: silentLogger });
    ok(r.diagnosticRetryUsed === false && llm.calls.length === 0, 'no retry');
  });
  await test('confidence out of band (49 / 70 / null) → no retry', async () => {
    for (const c of [49, 70, null]) {
      const llm = scriptedLLM([mkResp()]);
      const r = await runDiagnosticRetry(baseInput({ confidenceScore: c as any }), { generateText: llm.generateText, logger: silentLogger });
      ok(r.diagnosticRetryUsed === false && llm.calls.length === 0, `c=${c}: no retry`);
    }
  });

  // ── Budget self-flag decline ──
  await test('agent self-flagged budget → declined, observer called, canonical log', async () => {
    const llm = scriptedLLM([mkResp()]);
    const cap = capturingLogger();
    let declined = '';
    const r = await runDiagnosticRetry(
      baseInput({ text: 'I hit the hourly token budget and all MCP tools are rate-limited. Confidence: 60/100' }),
      { generateText: llm.generateText, logger: cap.logger },
      { onDiagnosticRetryDeclined: (reason) => { declined = reason; } },
    );
    ok(r.diagnosticRetryUsed === false && llm.calls.length === 0, 'no retry on budget self-flag');
    ok(declined === 'budget_exhaustion_detected', 'onDiagnosticRetryDeclined fired with reason');
    ok(cap.entries.some(e => e.msg.includes('skipped') && e.obj.reason === 'budget_exhaustion_detected'), 'canonical decline log with reason field');
  });

  // ── Empty / throw are non-fatal, keep prior ──
  await test('retry returns empty text → keep prior, not used', async () => {
    const llm = scriptedLLM([mkResp({ text: '   ' })]);
    const r = await runDiagnosticRetry(baseInput(), { generateText: llm.generateText, logger: silentLogger });
    ok(r.diagnosticRetryUsed === false, 'not used');
    ok(r.text === 'prior response. Confidence: 60/100' && r.confidenceScore === 60, 'prior kept');
  });
  await test('retry throws → non-fatal, keep prior', async () => {
    const llm = scriptedLLM([new Error('provider 500')]);
    const cap = capturingLogger();
    const r = await runDiagnosticRetry(baseInput(), { generateText: llm.generateText, logger: cap.logger });
    ok(r.diagnosticRetryUsed === false && r.confidenceScore === 60, 'prior kept on throw');
    ok(cap.entries.some(e => e.level === 'warn' && e.msg.includes('failed')), 'warn logged');
  });

  // ── Observer order: start BEFORE complete ──
  await test('observers fire onDiagnosticRetryStart before onDiagnosticRetryComplete', async () => {
    const llm = scriptedLLM([mkResp()]);
    const events: string[] = [];
    await runDiagnosticRetry(baseInput(), { generateText: llm.generateText, logger: silentLogger }, {
      onDiagnosticRetryStart: () => { events.push('start'); },
      onDiagnosticRetryComplete: (t) => { events.push(`complete:${t.slice(0, 8)}`); },
    });
    ok(events.join('|') === 'start|complete:improved', `order (got ${events.join('|')})`);
  });

  // ── Overconfident drop → warn ──
  await test('retry drops >20 points → warn-level "LARGE NEGATIVE DELTA"', async () => {
    const llm = scriptedLLM([mkResp({ text: 'honest downgrade. Confidence: 30/100' })]);
    const cap = capturingLogger();
    const r = await runDiagnosticRetry(baseInput(), { generateText: llm.generateText, logger: cap.logger });
    ok(r.confidenceScore === 30, 're-parsed to 30');
    ok(cap.entries.some(e => e.level === 'warn' && e.msg.includes('LARGE NEGATIVE DELTA')), 'warn on >20 drop');
  });

  // ── Layer 1: caller pins (filled after the swap; assert shared usage) ──
  const engineSrc = fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');
  const streamSrc = fs.readFileSync(path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts'), 'utf8');
  // Phase 6: the engine path's #90 retry runs in the shared core; the engine delegates.
  const coreSrc = fs.readFileSync(path.join(__dirname, '../lib/services/execution-core.ts'), 'utf8');
  await test('the core calls runDiagnosticRetry; both adapters delegate; no inline diagnosticPrompt anywhere', async () => {
    ok(coreSrc.includes('runDiagnosticRetry('), 'core calls runDiagnosticRetry');
    // Phase 6b: the stream now delegates — no inline runDiagnosticRetry call.
    ok(!streamSrc.includes('runDiagnosticRetry('), 'stream delegates (no inline runDiagnosticRetry)');
    ok(streamSrc.includes('runExecutionCore('), 'stream routes through runExecutionCore');
    ok(!engineSrc.includes('const diagnosticPrompt ='), 'engine inline diagnosticPrompt gone');
    ok(!streamSrc.includes('const diagnosticPrompt ='), 'stream inline diagnosticPrompt gone');
    ok(!coreSrc.includes('const diagnosticPrompt ='), 'core inline diagnosticPrompt gone');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
