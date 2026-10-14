#!/usr/bin/env ts-node
/**
 * TEST — reflection calls keep a replayed thinking block's PREFIX intact (Opus 5.5 loop audit, C1 + C2, 2026-10-07)
 *
 * Preserved thinking (Opus 5.5, Fable 5.1): a `thinking` block's signature binds the top-level `system`, the SET OF
 * TOOLS, and every message before the block. A later request that changes any of them invalidates every replayed
 * block — a 400 on accounts created on/after 2026-08-31 (under BYOK: any customer org), or wherever
 * `prefix_mismatch_behavior` is set. This suite is that rule, mechanised against a scripted fake LLM:
 *
 *   For every call an execution makes — initial, continuation, #89 correction, budget fail-fast, form correction,
 *   #90 diagnostic retry — and for every thinking block the call REPLAYS (identified by a per-response signature):
 *     · the call's `messages[0..k)` equal, deep, the messages of the call that PRODUCED that block   (prefix rule)
 *     · the call's tool set (names, order) equals the producing call's tool set                       (tool rule)
 *     · the call's `systemPrompt` equals the producing call's                                          (system rule)
 *
 * The prefix rule is what catches C2: when #89 is attempted but not adopted, its two messages used to stay in the
 * history, so a later form-correction / #90 pass appended the final turn a SECOND time after a dangling prompt — the
 * second copy of that block then sat behind a different prefix. The tool rule is what catches C1: 'reflection' calls
 * sent no tools at all.
 *
 * Sonnet 5 does not run the check; its reflection calls MUST keep the legacy no-tools shape (byte-identical — the
 * wire-level golden is in test-llm-call-options §3c). The Sonnet arm here asserts the legacy shape is still sent, and
 * that the prefix rule (C2 is universal) holds for it too.
 *
 * S8–S10 (same day, follow-on): an ERRORED reflection call at any of the four sites is a FACT —
 * `toolLoop.reflectionErrors: [{site, status, errorType, errorCode}]`, nested (E3b), only when non-empty — plus one
 * warn line, because the binding 400 only ever bites customer orgs (created on/after 2026-08-31), never ours.
 *
 * Mutation-verified 2026-10-07: reverting the gate in buildLlmCallOptions fails every Opus tool-rule assertion;
 * removing the C2 truncation fails the S5/S6/S7 prefix assertions.
 *
 * CI-safe: scripted LLM, stubbed tools, no DB, no network. Run: npm run test:reflection-history-binding
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
import * as fs from 'fs';
import * as path from 'path';
import { runAgenticToolLoop, normalizeModelConfig, NormalizedModelConfig } from '../lib/agents/harness/agentic-tool-loop';
import { runFormCorrection } from '../lib/agents/harness/form-correction';
import { runDiagnosticRetry } from '../lib/agents/harness/diagnostic-retry';
import { buildExecutionResultJson, RESULT_JSON_SUMMARY_KEYS, pickResultJsonSummary } from '../lib/services/execution-artifacts';

let passed = 0, failed = 0;
const failures: string[] = [];
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; failures.push(m); console.log(`  ❌ ${m}`); } };

const F2 = fs.readFileSync(path.join(__dirname, 'fixtures', 'form-check', 'f2-tf-undercount-cmusyaobr.md'), 'utf8');
const PROMPT = 'author the change package';
const TOOLS = [
  { name: 'perform', description: 'p', parameters: { type: 'object', properties: {} } },
  { name: 'project', description: 'q', parameters: { type: 'object', properties: {} } },
  { name: 'read_more', description: 'r', parameters: { type: 'object', properties: {} } },
] as any;
const silent = { info: () => {}, warn: () => {}, error: () => {} };

/** One recorded LLM call: a DEEP snapshot taken at call time (the loop mutates messageHistory in place). */
interface Rec { label: string; messages: any[]; tools: string[]; systemPrompt: string | undefined; functionCall: unknown; sig: string | null }

/**
 * Scripted LLM. Each scripted response gets a unique thinking-block signature `SIG-<n>` prepended to its content —
 * exactly what the API returns — so a later call that replays it can be traced back to the call that produced it.
 * `null` script entries return an EMPTY response (a non-adopted reflection).
 */
function recorder(script: Array<{ label: string; resp: any | null }>) {
  const recs: Rec[] = [];
  let i = 0;
  const generateText = async (prompt: string, o: any) => {
    if (i >= script.length) throw new Error(`LLM script exhausted at call ${i + 1}`);
    const { label, resp } = script[i];
    const sig = resp ? `SIG-${i + 1}` : null;
    // The provider sends `[{role:'user', content: prompt}]` when no messages are passed (the initial call).
    const effective = o.messages ? o.messages : [{ role: 'user', content: prompt }];
    recs.push({
      label, messages: JSON.parse(JSON.stringify(effective)),
      tools: (o.functions ?? []).map((f: any) => f.name), systemPrompt: o.systemPrompt, functionCall: o.functionCall, sig,
    });
    i++;
    if (resp instanceof Error) throw resp;
    if (resp && resp.providerError) return PROVIDER_400;
    if (!resp) return { text: '', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 0 }, rawContentBlocks: [] };
    const blocks = [{ type: 'thinking', thinking: '', signature: sig }, ...(resp.blocks ?? [{ type: 'text', text: resp.text }])];
    return { text: resp.text ?? '', stopReason: resp.stopReason ?? 'end_turn', functionCalls: resp.functionCalls,
      usage: { inputTokens: 100, outputTokens: 50 }, rawContentBlocks: blocks };
  };
  return { recs, generateText };
}
/** The provider layer's ERROR RESPONSE for an Anthropic 400 (anthropic-sdk-provider.ts catch: it RETURNS, never
 *  throws) — `details` is the SDK APIError: `.status` + the `{type:'error', error:{type,message}, request_id}` envelope. */
const PROVIDER_400 = { text: '', provider: 'anthropic_sdk', error: { message: 'messages.3.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation.', code: 'unknown_error',
  details: { status: 400, error: { type: 'error', error: { type: 'invalid_request_error', message: 'bound to a different conversation' }, request_id: 'req_test' } } } };
const ERR400 = { providerError: true };
function warnSink() {
  const warns: Array<{ obj: any; msg: string }> = [];
  return { warns, logger: { info: () => {}, error: () => {}, warn: (obj: any, msg: string) => warns.push({ obj, msg }) } };
}
const toolUse = (id: string, name = 'perform') => ({
  stopReason: 'tool_use', text: '',
  functionCalls: [{ id, name, arguments: '{}' }],
  blocks: [{ type: 'tool_use', id, name, input: {} }],
});
const final = (text: string) => ({ text });

/**
 * The binding rule over a whole execution. For each call j and each thinking block it replays (signature SIG-n, at
 * message index k), the producing call p (whose response carried SIG-n) must have sent exactly messages[0..k) of
 * call j, the same tool set, and the same system prompt. `toolRule` is enforced only for the flagged model.
 */
function assertBinding(recs: Rec[], label: string, toolRule: boolean) {
  const producer = new Map<string, Rec>();
  for (const r of recs) if (r.sig) producer.set(r.sig, r);
  let replays = 0, prefixBad = 0, toolBad = 0, sysBad = 0;
  const seen = new Map<string, number>();
  for (const r of recs) {
    r.messages.forEach((m, k) => {
      if (m.role !== 'assistant' || !Array.isArray(m.content)) return;
      for (const b of m.content) {
        if (b?.type !== 'thinking') continue;
        replays++;
        seen.set(b.signature, (seen.get(b.signature) ?? 0) + 1);
        const p = producer.get(b.signature);
        if (!p) { prefixBad++; continue; }
        if (JSON.stringify(r.messages.slice(0, k)) !== JSON.stringify(p.messages)) prefixBad++;
        if (JSON.stringify(r.tools) !== JSON.stringify(p.tools)) toolBad++;
        if (r.systemPrompt !== p.systemPrompt) sysBad++;
      }
    });
  }
  // A block appearing twice in ONE call's history is the C2 duplicate (the second copy cannot share the first's prefix).
  const dupInOneCall = recs.some(r => {
    const s = r.messages.flatMap((m: any) => Array.isArray(m.content) ? m.content.filter((b: any) => b?.type === 'thinking').map((b: any) => b.signature) : []);
    return new Set(s).size !== s.length;
  });
  ok(replays > 0, `${label}: the execution replays thinking blocks (${replays}) — the assertions below are not vacuous`);
  ok(prefixBad === 0 && !dupInOneCall, `${label}: every replayed block sits behind EXACTLY the prefix it was produced with (bad: ${prefixBad}, duplicate-in-one-call: ${dupInOneCall})`);
  ok(sysBad === 0, `${label}: every call replaying a block sends the producing call's systemPrompt (bad: ${sysBad})`);
  if (toolRule) ok(toolBad === 0, `${label}: every call replaying a block sends the producing call's TOOL SET (bad: ${toolBad})`);
}

const cfgFor = (model: string): NormalizedModelConfig =>
  normalizeModelConfig({ model, cacheControl: { type: 'ephemeral' } }, { apiKey: 'sk-test-FAKE-binding' }, 'SYSTEM PROMPT');

async function loop(cfg: NormalizedModelConfig, gen: any, exec: (t: string) => Promise<unknown>, logger: any = silent) {
  return runAgenticToolLoop({
    prompt: PROMPT, cfg, mcpFunctions: TOOLS, maxToolTurns: 30, signal: new AbortController().signal,
    deadlineAt: Date.now() + 3_600_000, agentRole: null, executionId: 'exec-binding', taskId: 'task-binding', userId: 'u1',
  }, {
    getToolDefinition: async (name: string) => ({ serverName: `srv-${name}`, tool: { name } } as any),
    executeToolOnServer: async (_s: string, t: string) => exec(t),
    generateText: gen, logger,
  });
}
const okTool = async () => ({ ok: true });
const throwTool = async () => { throw new Error('device unreachable'); };
const budgetTool = async () => { throw new Error('Hourly limit reached: budget exceeded for this user'); };

function formPass(cfg: NormalizedModelConfig, gen: any, l: any, text: string, logger: any = silent) {
  return runFormCorrection({
    text, currentResponse: l.currentResponse, messageHistory: l.messageHistory, totalUsage: l.totalUsage,
    prompt: PROMPT, normalizedLlmConfig: cfg, mcpFunctions: TOOLS, executionId: 'exec-binding', userId: 'u1', force: true,
  }, { generateText: gen, logger });
}
function diagPass(cfg: NormalizedModelConfig, gen: any, l: any, text: string, logger: any = silent) {
  return runDiagnosticRetry({
    confidenceScore: 60, confidenceCapped: false, correctionTurnUsed: l.correctionTurnUsed, formCorrectionAttempted: false,
    text, currentResponse: l.currentResponse, messageHistory: l.messageHistory, totalUsage: l.totalUsage,
    prompt: PROMPT, normalizedLlmConfig: cfg, mcpFunctions: TOOLS, executionId: 'exec-binding', userId: 'u1',
  }, { generateText: gen, logger });
}

async function main() {
  console.log('\n🔗 TEST — reflection calls keep the replayed-thinking prefix (AUDIT C1 + C2)\n');
  const OPUS = cfgFor('claude-opus-5-5');
  const SONNET = cfgFor('claude-sonnet-5');

  // ── S1. #89 correction (adopted) ──
  console.log('── S1: #89 anti-fabrication correction (opus-5-5) ──');
  {
    const llm = recorder([
      { label: 'initial', resp: toolUse('a') },
      { label: 'continuation', resp: final('Done: the change was applied. Confidence: 80/100') },
      { label: '#89', resp: final('Corrected: the tool failed; nothing was applied. Confidence: 40/100') },
    ]);
    const l = await loop(OPUS, llm.generateText, throwTool);
    ok(l.correctionTurnUsed === true && llm.recs.length === 3, 'S1: #89 fired and was adopted (3 calls)');
    ok(llm.recs[2].functionCall === 'none', "S1: the #89 call is tool_choice 'none'");
    assertBinding(llm.recs, 'S1', true);
  }

  // ── S2. budget fail-fast ──
  console.log('\n── S2: budget fail-fast blocked-report turn (opus-5-5) ──');
  {
    const llm = recorder([
      { label: 'initial', resp: toolUse('a') },
      { label: 'fail-fast', resp: final('Blocked: the hourly budget is exhausted.') },
    ]);
    const l = await loop(OPUS, llm.generateText, budgetTool);
    ok(l.budgetFailFastUsed === true && llm.recs.length === 2, 'S2: fail-fast fired (2 calls)');
    ok(llm.recs[1].functionCall === 'none', "S2: the fail-fast call is tool_choice 'none'");
    assertBinding(llm.recs, 'S2', true);
  }

  // ── S3. form correction ──
  console.log('\n── S3: form correction (opus-5-5) ──');
  {
    const llm = recorder([
      { label: 'initial', resp: toolUse('a', 'project') },
      { label: 'continuation', resp: final(F2) },
      { label: 'form', resp: final(F2.replace('@@ -0,0 +1,33 @@', '@@ -0,0 +1,36 @@')) },
    ]);
    const l = await loop(OPUS, llm.generateText, okTool);
    const fc = await formPass(OPUS, llm.generateText, l, l.assembledText);
    ok(fc.correction.attempted === true && llm.recs.length === 3, 'S3: form correction attempted (3 calls)');
    ok(llm.recs[2].functionCall === 'none', "S3: the form-correction call is tool_choice 'none'");
    assertBinding(llm.recs, 'S3', true);
  }

  // ── S4. #90 diagnostic retry ──
  console.log('\n── S4: #90 diagnostic retry (opus-5-5) ──');
  {
    const llm = recorder([
      { label: 'initial', resp: toolUse('a') },
      { label: 'continuation', resp: final('Package. Confidence: 60/100') },
      { label: '#90', resp: final('Improved package. Confidence: 75/100') },
    ]);
    const l = await loop(OPUS, llm.generateText, okTool);
    const d = await diagPass(OPUS, llm.generateText, l, l.assembledText);
    ok(d.diagnosticRetryUsed === true && llm.recs.length === 3, 'S4: #90 fired (3 calls)');
    ok(llm.recs[2].functionCall === 'none', "S4: the #90 call is tool_choice 'none'");
    assertBinding(llm.recs, 'S4', true);
  }

  // ── S5. C2: #89 attempted but NOT adopted, then form correction ──
  console.log('\n── S5: #89 not adopted → form correction (opus-5-5, C2) ──');
  {
    const llm = recorder([
      { label: 'initial', resp: toolUse('a') },
      { label: 'continuation', resp: final(F2) },
      { label: '#89 (empty)', resp: null },
      { label: 'form', resp: final(F2.replace('@@ -0,0 +1,33 @@', '@@ -0,0 +1,36 @@')) },
    ]);
    const l = await loop(OPUS, llm.generateText, throwTool);
    ok(l.correctionTurnUsed === false, 'S5: #89 ran and was NOT adopted');
    ok(l.messageHistory.length === 3, `S5: the two #89 messages were removed again (history ${l.messageHistory.length}, expect 3: prompt, tool_use, tool_results)`);
    await formPass(OPUS, llm.generateText, l, l.assembledText);
    ok(llm.recs.length === 4, 'S5: 4 calls (initial, continuation, #89, form)');
    assertBinding(llm.recs, 'S5', true);
  }

  // ── S6. C2 with #90 instead of form correction ──
  console.log('\n── S6: #89 empty (not adopted) → #90 (opus-5-5, C2) ──');
  {
    const llm = recorder([
      { label: 'initial', resp: toolUse('a') },
      { label: 'continuation', resp: final('Package. Confidence: 60/100') },
      { label: '#89 (empty)', resp: null },
      { label: '#90', resp: final('Improved. Confidence: 70/100') },
    ]);
    const l = await loop(OPUS, llm.generateText, throwTool);
    await diagPass(OPUS, llm.generateText, l, l.assembledText);
    ok(llm.recs.length === 4, 'S6: 4 calls (initial, continuation, #89, #90)');
    assertBinding(llm.recs, 'S6', true);
  }

  // ── S7. Sonnet 5 control: legacy no-tools reflection is STILL sent; prefix rule (C2) holds ──
  console.log('\n── S7: sonnet-5 control (legacy reflection shape unchanged) ──');
  {
    const llm = recorder([
      { label: 'initial', resp: toolUse('a') },
      { label: 'continuation', resp: final(F2) },
      { label: '#89 (empty)', resp: null },
      { label: 'form', resp: final(F2.replace('@@ -0,0 +1,33 @@', '@@ -0,0 +1,36 @@')) },
    ]);
    const l = await loop(SONNET, llm.generateText, throwTool);
    await formPass(SONNET, llm.generateText, l, l.assembledText);
    ok(llm.recs[0].tools.length === 3 && llm.recs[1].tools.length === 3, 'S7: sonnet full calls carry the tool set');
    ok(llm.recs[2].tools.length === 0 && llm.recs[3].tools.length === 0,
      'S7: sonnet reflection calls (#89, form) still send NO tools — the legacy shape, byte-identical (golden: test-llm-call-options §3c)');
    assertBinding(llm.recs, 'S7', false);
  }

  // ── S8. An ERRORED reflection call is a visible FACT + a warn, at every site (AUDIT 2026-10-07 follow-on) ──
  // The binding 400 bites only customer orgs created on/after 2026-08-31 (BYOK) — never the platform's own — so the
  // graceful fallback must not be silent. Shape: {site, status, errorType, errorCode}, read structurally.
  console.log('\n── S8: errored reflection calls are stamped + warned (all four sites) ──');
  {
    const want = (f: any, site: string) => f && f.site === site && f.status === 400 && f.errorType === 'invalid_request_error' && f.errorCode === 'unknown_error';
    const reflectionWarn = (w: any[]) => w.filter(x => /Reflection call errored/.test(x.msg));
    // #89 — provider error response
    {
      const ws = warnSink();
      const llm = recorder([{ label: 'initial', resp: toolUse('a') }, { label: 'continuation', resp: final('Applied.') }, { label: '#89 (400)', resp: ERR400 }]);
      const l = await loop(OPUS, llm.generateText, throwTool, ws.logger);
      ok(l.reflectionErrors.length === 1 && want(l.reflectionErrors[0], 'correction'), `S8 #89: loop returns reflectionErrors [{site:'correction', status:400, errorType:'invalid_request_error'}] (got ${JSON.stringify(l.reflectionErrors)})`);
      ok(reflectionWarn(ws.warns).length === 1 && /bound to a different conversation/.test(reflectionWarn(ws.warns)[0].obj.apiErrorMessage), 'S8 #89: one warn line carrying the API message');
      ok(l.correctionTurnUsed === false && l.messageHistory.length === 3, 'S8 #89: the prior response stands and the #89 messages are removed (C2)');
    }
    // #89 — a THROW (abort/transport) is stamped with status null
    {
      const ws = warnSink();
      const llm = recorder([{ label: 'initial', resp: toolUse('a') }, { label: 'continuation', resp: final('Applied.') }, { label: '#89 (throw)', resp: new Error('socket hang up') }]);
      const l = await loop(OPUS, llm.generateText, throwTool, ws.logger);
      ok(l.reflectionErrors.length === 1 && l.reflectionErrors[0].site === 'correction' && l.reflectionErrors[0].status === null, 'S8 #89 throw: stamped with status null (not a provider status)');
    }
    // budget fail-fast — provider error response
    {
      const ws = warnSink();
      const llm = recorder([{ label: 'initial', resp: toolUse('a') }, { label: 'fail-fast (400)', resp: ERR400 }]);
      const l = await loop(OPUS, llm.generateText, budgetTool, ws.logger);
      ok(l.budgetFailFastUsed && l.reflectionErrors.length === 1 && want(l.reflectionErrors[0], 'budget_failfast'), 'S8 fail-fast: stamped {site:budget_failfast, status:400}');
      ok(reflectionWarn(ws.warns).length === 1, 'S8 fail-fast: one warn line');
    }
    // form correction — provider error response (formCheck already says llm-error; now the call's status is a fact too)
    {
      const ws = warnSink();
      const llm = recorder([{ label: 'initial', resp: toolUse('a') }, { label: 'continuation', resp: final(F2) }, { label: 'form (400)', resp: ERR400 }]);
      const l = await loop(OPUS, llm.generateText, okTool, ws.logger);
      const fc = await formPass(OPUS, llm.generateText, l, l.assembledText, ws.logger);
      ok(fc.correction.notAdoptedReason === 'llm-error' && want(fc.reflectionError, 'form_correction'), 'S8 form: notAdoptedReason llm-error AND reflectionError {site:form_correction, status:400}');
      ok(reflectionWarn(ws.warns).length === 1, 'S8 form: one warn line');
    }
    // #90 — provider error response
    {
      const ws = warnSink();
      const llm = recorder([{ label: 'initial', resp: toolUse('a') }, { label: 'continuation', resp: final('P. Confidence: 60/100') }, { label: '#90 (400)', resp: ERR400 }]);
      const l = await loop(OPUS, llm.generateText, okTool, ws.logger);
      const d = await diagPass(OPUS, llm.generateText, l, l.assembledText, ws.logger);
      ok(d.diagnosticRetryUsed === false && want(d.reflectionError, 'diagnostic_retry'), 'S8 #90: prior response kept AND reflectionError {site:diagnostic_retry, status:400}');
      ok(reflectionWarn(ws.warns).length === 1, 'S8 #90: one warn line');
    }
    // A clean run stamps nothing.
    {
      const llm = recorder([{ label: 'initial', resp: toolUse('a') }, { label: 'continuation', resp: final('P. Confidence: 60/100') }, { label: '#90', resp: final('Q. Confidence: 70/100') }]);
      const l = await loop(OPUS, llm.generateText, okTool);
      const d = await diagPass(OPUS, llm.generateText, l, l.assembledText);
      ok(l.reflectionErrors.length === 0 && d.reflectionError === undefined, 'S8 clean: no reflectionErrors anywhere');
    }
  }

  // ── S9. result.json: toolLoop.reflectionErrors NESTED (E3b), only when non-empty; no new top-level key ──
  console.log('\n── S9: result.json placement (nested in toolLoop, absent when empty) ──');
  {
    const base = {
      taskId: 'cmh5taskid12345', taskTitle: 'T', agentRole: 'config_change_author', modelUsed: 'claude-opus-5-5',
      finalResponse: 'x. Confidence: 80/100', confidenceScore: 80, turnCount: 1, maxToolTurns: 30, toolCallResults: [],
      successfulToolCalls: 0, failedToolCalls: 0, executionTime: 1, tokensUsed: 1, correctionTurnUsed: false,
      executionId: 'cmh5execid12345', logger: silent,
    } as any;
    const facts = [{ site: 'form_correction', status: 400, errorType: 'invalid_request_error', errorCode: 'unknown_error' }];
    const clean: any = buildExecutionResultJson(base);
    const empty: any = buildExecutionResultJson({ ...base, reflectionErrors: [] });
    const withErr: any = buildExecutionResultJson({ ...base, reflectionErrors: facts });
    const noTime = (o: any) => JSON.stringify({ ...o, generatedAt: null });
    ok(!('reflectionErrors' in clean.toolLoop) && noTime(empty) === noTime(clean),
      'absent or empty → toolLoop has no reflectionErrors key and the artifact is byte-identical');
    ok(JSON.stringify(withErr.toolLoop.reflectionErrors) === JSON.stringify(facts), 'non-empty → toolLoop.reflectionErrors carries the facts verbatim');
    ok(!(RESULT_JSON_SUMMARY_KEYS as readonly string[]).includes('reflectionErrors') && !('reflectionErrors' in withErr),
      'NOT a top-level key and NOT in RESULT_JSON_SUMMARY_KEYS (nested, E3b)');
    const summary: any = pickResultJsonSummary(withErr);
    ok(JSON.stringify(summary?.toolLoop?.reflectionErrors) === JSON.stringify(facts), 'survives the summary pick (toolLoop is copied verbatim)');
  }

  // ── S10. The core collects all four sites and hands them to the builder (source pin — the core persists, so it
  // cannot be driven without a DB; test-form-correction-core drives it with I/O stubbed for the form path) ──
  console.log('\n── S10: execution-core wiring (source pin) ──');
  {
    const core = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'execution-core.ts'), 'utf8');
    ok(/const reflectionErrors = \[\.\.\.\(loopResult\.reflectionErrors \?\? \[\]\)\];/.test(core), 'core seeds the list from the loop (#89 + fail-fast)');
    ok(/if \(_fc\.reflectionError\) reflectionErrors\.push\(_fc\.reflectionError\);/.test(core), 'core appends the form-correction fact');
    ok(/if \(_retry\.reflectionError\) reflectionErrors\.push\(_retry\.reflectionError\);/.test(core), 'core appends the #90 fact');
    const b = core.indexOf('buildExecutionResultJson({');
    ok(/\.\.\.\(reflectionErrors\.length \? \{ reflectionErrors \} : \{\}\)/.test(core.slice(b, core.indexOf('});', b))), 'core passes the list to the result.json builder only when non-empty');
    // 2 → 3 (2026-10-09, 2b): the requirements form correction is a third reflection call and carries the tool set too.
    ok((core.match(/mcpFunctions, executionId, userId/g) ?? []).length === 3, 'core passes mcpFunctions to ALL THREE reflection turns — form correction, requirements form correction, #90 (C1)');
  }

  console.log(`\n${'─'.repeat(50)}\n  Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) { console.log(`\n  Failures:\n${failures.map(f => `   - ${f}`).join('\n')}`); process.exit(1); }
  console.log('  ✅ reflection-history binding: GREEN\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
