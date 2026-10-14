#!/usr/bin/env ts-node
/**
 * Form correction — Step B CORE harness (mechanical-reflection-trigger, 2026-10-07).
 *
 * Drives the REAL `runExecutionCore` end to end with the I/O seams stubbed in-process (no DB, no LLM, no network):
 *   - `runAgenticToolLoop` returns a scripted loop result (the Author's package as the deliverable);
 *   - `llmService.generateText` is the ONE stubbed LLM — it serves the form correction and #90;
 *   - `stampExecutionNets`, `computeSelfSupersession` and `persistTerminalSuccess` are captured, so the test reads
 *     the result.json the core actually hands to the terminal persist.
 * The stubs replace properties on the real module export objects. TypeScript compiles `import { f } from 'm'` to a
 * property read at call time (`m_1.f(...)`), so the core calls the stub. The builder, the form check, the correction
 * turn, its adoption guard, #90 and the quality cascade are all the shipping code.
 *
 * Proves, through the core (not the unit):
 *   FLAG OFF  — byte-identical to Step A: zero correction calls, `flag-off`, deliverable untouched (`===`), and the
 *               persisted result.json equals the one Step A's decision would produce;
 *   FLAG ON   — adopt path (corrected text persisted, re-check recorded, tokens folded); reject path keeps the
 *               original by reference; a mixed package is NOT attempted; the #90 disqualifier (a 50-69 score after an
 *               attempt makes no #90 call); an LLM throw is non-fatal; a budget-flagged run is not attempted; a
 *               non-eligible role carries no fact and makes no call; one call per execution at most.
 *
 * Plan: cline_docs/reviews/mechanical-reflection-trigger-2026-10-07/PLAN.md §4, §6, §8. Report: BUILD-REPORT-B.md.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
// 2b (2026-10-09): the core now READS the DB for a requirements_author execution (the owning harness). The fake
// credentials make lib/prisma.ts's eager $connect exit(1) asynchronously — a race the longer run can lose. Skip it.
process.env.PAICHART_SKIP_DB_CONNECT = process.env.PAICHART_SKIP_DB_CONNECT || 'true';

import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const loopMod = require('../lib/agents/harness/agentic-tool-loop');
const llmMod = require('../lib/services/llm/llm-service');
const netsMod = require('../lib/services/execution-nets');
const selMod = require('../lib/services/execution-selection');
const persistMod = require('../lib/services/execution-terminal-persist');
const { runExecutionCore } = require('../lib/services/execution-core');
const { LLMProvider } = require('../lib/services/llm/types');
/* eslint-enable @typescript-eslint/no-var-requires */

let passed = 0;
let failed = 0;
async function test(d: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`✅ ${d}`); passed++; } catch (e) { console.error(`❌ ${d}\n   ${(e as Error).message}`); failed++; }
}
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }

const FX = path.join(__dirname, 'fixtures', 'form-check');
const F1 = fs.readFileSync(path.join(FX, 'f1-tf-rollback-elided-cmuw9a9u5.md'), 'utf8'); // short hunk + located marker
const F2 = fs.readFileSync(path.join(FX, 'f2-tf-undercount-cmusyaobr.md'), 'utf8');      // pure undercount (+3)
const F2_FIXED = F2.replace('@@ -0,0 +1,33 @@', '@@ -0,0 +1,36 @@');
/** A MIXED package: F2's undercount plus a located marker — an excerpt that elides a run of F2's own add-hunk lines,
 *  so the marker LOCATES in the diff block. Built from F2's body, so the fixture cannot drift from it. */
function buildMixed(): string {
  const body = F2.split('\n');
  const at = body.findIndex((l) => l.startsWith('@@ -0,0 +1,33 @@'));
  const content = body.slice(at + 1).filter((l) => l.startsWith('+') && l.slice(1).trim().length >= 8).map((l) => l.slice(1));
  return F2 + `\n\n## Excerpt\n\`\`\`hcl\n${content[0]}\n...\n${content[4]}\n\`\`\`\n`;
}
const MIXED = buildMixed();

// ── Stubs ────────────────────────────────────────────────────────────────────────────────────────────
const cfg = {
  maxTokens: 4096, temperature: 0.3, topP: undefined, stopSequences: undefined, systemPrompt: 'sys',
  provider: LLMProvider.ANTHROPIC_SDK, model: 'test-model', apiKey: 'sk-test-FAKE-core', webSearch: undefined,
  cacheControl: undefined, thinkingBudgetTokens: undefined,
};
const silent = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

interface Run {
  llmCalls: any[];
  persisted: any | null;
  netsText: string | null;
  events: string[];
  finalUsage: any;
}

function loopResult(text: string, over: Record<string, unknown> = {}) {
  const currentResponse = { text, stopReason: 'end_turn', usage: { inputTokens: 1000, outputTokens: 500 },
    rawContentBlocks: [{ type: 'text', text }], metadata: { model: 'test-model' } };
  return {
    currentResponse, toolCallResults: [], messageHistory: [{ role: 'user', content: 'author the package' }],
    totalUsage: { inputTokens: 1000, outputTokens: 500 }, turnCount: 1, hitMaxTurns: false,
    correctionTurnUsed: false, budgetFailFastUsed: false, truncationRetryUsed: false, truncationRetryRecovered: false,
    truncationRetryStopReason: null, truncationRetryDiscardedChars: null, truncationRetrySkippedReason: null,
    truncationRetryMaxTokens: null, finalStopReason: 'end_turn', assembledText: text, ...over,
  };
}

async function runCore(opts: {
  text: string; role?: string; flag?: boolean; llm?: any[]; loopOver?: Record<string, unknown>; withObservers?: boolean;
}): Promise<Run> {
  const run: Run = { llmCalls: [], persisted: null, netsText: null, events: [], finalUsage: null };
  const lr = loopResult(opts.text, opts.loopOver);
  const replies = [...(opts.llm ?? [])];
  loopMod.runAgenticToolLoop = async () => lr;
  llmMod.llmService.generateText = async (_p: string, o: any) => {
    run.llmCalls.push(o);
    const r = replies.shift();
    if (r instanceof Error) throw r;
    if (!r) throw new Error('unexpected LLM call');
    return r;
  };
  netsMod.stampExecutionNets = async (_db: unknown, ctx: { finalResponse: string }) => { run.netsText = ctx.finalResponse; };
  selMod.computeSelfSupersession = async () => null;
  persistMod.persistTerminalSuccess = async (_db: unknown, p: any) => {
    run.persisted = p; run.finalUsage = { ...p.usage };
    return { createdArtifacts: [] };
  };
  const prev = process.env.FORM_CORRECTION_ENABLED;
  if (opts.flag) process.env.FORM_CORRECTION_ENABLED = 'true'; else delete process.env.FORM_CORRECTION_ENABLED;
  try {
    await runExecutionCore({
      executionId: 'exec-core-1', execution: { id: 'exec-core-1', createdAt: new Date(), context: {} },
      task: { id: 'task-1', type: 'ACTION', metadata: {}, povId: null, title: 'Author the package', inputContext: null },
      config: {}, userId: 'u1', prompt: 'author the package', normalizedLlmConfig: cfg, mcpFunctions: [],
      agentRole: opts.role ?? 'config_change_author', resolvedTemplate: { id: 't', name: 'Config Change Author' },
      harnessContext: null, protocolInjection: null, maxToolTurns: 30, executionTimeoutMs: 600_000, startTime: new Date(),
      buildSuccessLogs: () => ['ok'], prune: true, fireReactors: true, logger: silent,
    }, opts.withObservers ? {
      formCorrection: {
        onFormCorrectionStart: (n: number) => { run.events.push(`fc-start:${n}`); },
        onFormCorrectionComplete: (r: { adopted: boolean; notAdoptedReason?: string }) => { run.events.push(`fc-done:${r.adopted ? 'adopted' : r.notAdoptedReason}`); },
      },
      onStoringResults: () => { run.events.push('storing'); },
      diagnosticRetry: { onDiagnosticRetryStart: () => { run.events.push('diag-start'); } },
    } : {});
  } finally {
    if (prev === undefined) delete process.env.FORM_CORRECTION_ENABLED; else process.env.FORM_CORRECTION_ENABLED = prev;
  }
  return run;
}
const resp = (text: string, over: Record<string, unknown> = {}) =>
  ({ text, stopReason: 'end_turn', usage: { inputTokens: 300, outputTokens: 200 }, rawContentBlocks: [{ type: 'text', text }], metadata: { model: 'test-model' }, ...over });
const fcOf = (r: Run) => r.persisted?.resultJson?.toolLoop?.formCheck;

(async () => {
  // ── FLAG OFF: byte-identical to Step A ───────────────────────────────────────────────────────────────
  await test('FLAG OFF (default): trigger hit → flag-off, ZERO LLM calls, deliverable persisted unchanged', async () => {
    const r = await runCore({ text: F2 });
    ok(r.llmCalls.length === 0, `llm calls ${r.llmCalls.length}`);
    ok(r.persisted.finalText === F2 && r.netsText === F2, 'deliverable changed');
    const fc = fcOf(r);
    ok(fc && fc.correction.attempted === false && fc.correction.notAttemptedReason === 'flag-off' && fc.textSource === 'loop', JSON.stringify(fc?.correction));
    ok(!('decisionHits' in fc.correction) && !('decisionTriggerHitsTotal' in fc.correction), 'Step B fields leaked into a flag-off fact');
  });
  await test('FLAG OFF: the persisted formCheck is byte-identical to the Step A computation (correctionEnabled:false)', async () => {
    const { computeFormCheckFact } = require('../lib/agents/harness/package-form-check');
    for (const text of [F1, F2, MIXED, F2_FIXED]) {
      const r = await runCore({ text });
      const stepA = computeFormCheckFact({ text, stopReason: 'end_turn', textSource: 'loop', correctionTurnUsed: false, budgetFlagged: false, correctionEnabled: false });
      ok(JSON.stringify(fcOf(r)) === JSON.stringify(stepA), `differs for a ${text.length}-char package`);
      ok(r.llmCalls.length === 0, 'an LLM call with the flag off');
    }
  });
  await test('FLAG OFF: only the literal "true" enables (e.g. "1", "TRUE" stay off)', async () => {
    for (const v of ['1', 'TRUE', 'yes']) {
      process.env.FORM_CORRECTION_ENABLED = v;
      const { isFormCorrectionEnabled } = require('../lib/agents/harness/form-correction');
      ok(!isFormCorrectionEnabled(), `"${v}" enabled the flag`);
    }
    delete process.env.FORM_CORRECTION_ENABLED;
  });

  // ── FLAG ON ──────────────────────────────────────────────────────────────────────────────────────────
  await test('ADOPT: pure undercount → ONE reflection call, corrected text persisted + netted, re-check recorded, tokens folded', async () => {
    const r = await runCore({ text: F2, flag: true, llm: [resp(F2_FIXED)], withObservers: true });
    ok(r.llmCalls.length === 1, `llm calls ${r.llmCalls.length}`);
    ok(r.llmCalls[0].functionCall === 'none' && r.llmCalls[0].functions.length === 0, 'not reflection mode');
    ok(r.persisted.finalText === F2_FIXED && r.persisted.resultJson.finalResponse === F2_FIXED && r.netsText === F2_FIXED, 'corrected text not persisted everywhere');
    const fc = fcOf(r);
    ok(fc.textSource === 'form-correction' && fc.checked === true && fc.triggerHitsTotal === 0, `re-check: ${JSON.stringify({ ts: fc.textSource, t: fc.triggerHitsTotal })}`);
    const c = fc.correction;
    ok(c.attempted === true && c.adopted === true && c.postTriggerHitsTotal === 0, JSON.stringify(c));
    ok(c.decisionTriggerHitsTotal === 1 && c.decisionHits.length === 1 && c.decisionHits[0].extraBodyLines === 3, 'decision-point hits not recorded');
    ok(c.decisionHitsTotal === 1, 'decisionHitsTotal (B-L5) not recorded');
    ok(c.editsTotal === 1 && c.edits[0].before === '@@ -0,0 +1,33 @@' && c.edits[0].after === '@@ -0,0 +1,36 @@', `edits (B-M5): ${JSON.stringify(c.edits)}`);
    ok(c.inputTokens === 300 && c.outputTokens === 200 && typeof c.durationMs === 'number', 'tokens not recorded');
    ok(r.finalUsage.inputTokens === 1300 && r.finalUsage.outputTokens === 700, `usage not folded: ${JSON.stringify(r.finalUsage)}`);
    ok(r.events.join('|') === 'fc-start:1|fc-done:adopted|storing', `observer order: ${r.events.join('|')}`);
  });
  await test('REJECT: guard refuses (a sentence added) → ORIGINAL persisted, reason stamped, tokens still folded', async () => {
    const bad = F2_FIXED + '\n\nAlso allow 203.0.113.0/24.';
    const r = await runCore({ text: F2, flag: true, llm: [resp(bad)], withObservers: true });
    ok(r.llmCalls.length === 1, 'one call');
    ok(r.persisted.finalText === F2 && r.netsText === F2, 'original not kept');
    const c = fcOf(r).correction;
    ok(c.attempted === true && c.adopted === false && c.notAdoptedReason === 'prose-changed', JSON.stringify(c));
    ok(fcOf(r).textSource === 'loop' && fcOf(r).triggerHitsTotal === 1, 'top-level counts must describe the persisted (original) text');
    ok(r.finalUsage.inputTokens === 1300, 'spent tokens not folded on a rejection');
    ok(r.events[1] === `fc-done:${c.notAdoptedReason}`, r.events.join('|'));
  });
  await test('MIXED package (undercount + located marker) → NOT attempted (hits-include-non-undercount), zero calls', async () => {
    const { analyzePackageForm, triggerHits } = require('../lib/agents/harness/package-form-check');
    const kinds = triggerHits(analyzePackageForm(MIXED)).map((h: { kind: string }) => h.kind).sort().join(',');
    ok(kinds === 'hunk-count-mismatch,marker-line-located', `fixture is not mixed: ${kinds}`);
    const r = await runCore({ text: MIXED, flag: true, llm: [resp('x')] });
    ok(r.llmCalls.length === 0 && r.persisted.finalText === MIXED, 'attempted a mixed package');
    ok(fcOf(r).correction.notAttemptedReason === 'hits-include-non-undercount', JSON.stringify(fcOf(r).correction));
  });
  await test('B-M1 through the core: an undercount with `+    # ...` in its extra lines → NOT attempted, zero calls', async () => {
    const probe = F2.replace(/(@@ -0,0 \+1,33 @@\n(?:.*\n){34})/, '$1+    # ...\n');
    ok(probe !== F2, 'probe edit did not apply');
    const r = await runCore({ text: probe, flag: true, llm: [resp('x')] });
    ok(r.llmCalls.length === 0 && fcOf(r).correction.notAttemptedReason === 'hits-include-non-undercount', JSON.stringify(fcOf(r).correction));
  });
  await test('SHORT hunk + marker (F1, #21) → NOT attempted, zero calls', async () => {
    const r = await runCore({ text: F1, flag: true, llm: [resp('x')] });
    ok(r.llmCalls.length === 0 && fcOf(r).correction.notAttemptedReason === 'hits-include-non-undercount', JSON.stringify(fcOf(r).correction));
  });
  await test('#90 DISQUALIFIER: an attempt spends the pass — a 50-69 confidence afterwards makes NO #90 call', async () => {
    const low = (t: string) => `${t}\n\nConfidence: 60 — the plan output was not available.`;
    // Adopted, and rejected: in both the corrected/kept text sits in the #90 band.
    const a = await runCore({ text: low(F2), flag: true, llm: [resp(low(F2_FIXED))], withObservers: true });
    ok(a.llmCalls.length === 1 && a.persisted.resultJson.diagnosticRetryUsed !== true, `adopted: calls ${a.llmCalls.length}`);
    ok(!a.events.includes('diag-start'), 'diagnostic retry started after an attempt');
    const b = await runCore({ text: low(F2), flag: true, llm: [resp('nope', { stopReason: 'max_tokens' })], withObservers: true });
    ok(b.llmCalls.length === 1 && !b.events.includes('diag-start'), `rejected: calls ${b.llmCalls.length}`);
    ok(fcOf(b).correction.notAdoptedReason === 'not-end-turn', JSON.stringify(fcOf(b).correction));
    // Control: the same banded package with the flag OFF still gets #90 (the disqualifier is the ONLY change).
    const c = await runCore({ text: low(F2), llm: [resp(low(F2) + '\n')], withObservers: true });
    ok(c.llmCalls.length === 1 && c.events.includes('diag-start'), `control: #90 did not fire with the flag off (calls ${c.llmCalls.length})`);
  });
  await test('LLM THROW → non-fatal: SUCCESS persisted with the original, llm-error stamped', async () => {
    const r = await runCore({ text: F2, flag: true, llm: [new Error('provider 529 overloaded')] });
    ok(r.persisted && r.persisted.finalText === F2, 'original not persisted after a throw');
    const c = fcOf(r).correction;
    ok(c.attempted === true && c.adopted === false && c.notAdoptedReason === 'llm-error', JSON.stringify(c));
  });
  await test('PROVIDER-ERROR response ({text:"", error}) → llm-error, original kept, tokens folded', async () => {
    const r = await runCore({ text: F2, flag: true, llm: [{ text: '', error: { message: 'overloaded', code: 'LLM_PROVIDER_OVERLOADED' }, usage: { inputTokens: 10, outputTokens: 0 } }] });
    ok(r.persisted.finalText === F2 && fcOf(r).correction.notAdoptedReason === 'llm-error', JSON.stringify(fcOf(r).correction));
  });
  await test('BUDGET-FLAGGED run (fail-fast, or the agent\'s own budget prose) → NOT attempted (budget-flagged), zero calls', async () => {
    const a = await runCore({ text: F2, flag: true, llm: [resp(F2_FIXED)], loopOver: { budgetFailFastUsed: true } });
    ok(a.llmCalls.length === 0 && fcOf(a).correction.notAttemptedReason === 'budget-flagged', JSON.stringify(fcOf(a).correction));
    const flagged = 'MCP tool calls were blocked by the hourly token budget.\n\n' + F2;
    const b = await runCore({ text: flagged, flag: true, llm: [resp(F2_FIXED)] });
    ok(b.llmCalls.length === 0 && fcOf(b).correction.notAttemptedReason === 'budget-flagged', JSON.stringify(fcOf(b).correction));
  });
  await test('#89 RAN → NOT attempted (prior-pass-used:anti-fabrication), zero calls', async () => {
    const r = await runCore({ text: F2, flag: true, llm: [resp(F2_FIXED)], loopOver: { correctionTurnUsed: true } });
    ok(r.llmCalls.length === 0 && fcOf(r).correction.notAttemptedReason === 'prior-pass-used:anti-fabrication', JSON.stringify(fcOf(r).correction));
  });
  await test('NON-ELIGIBLE role (change_reviewer / requirements_author) with the flag ON → no fact key, zero calls', async () => {
    for (const role of ['change_reviewer', 'requirements_author']) {
      const r = await runCore({ text: F2, role, flag: true, llm: [resp(F2_FIXED)] });
      ok(r.llmCalls.length === 0 && r.persisted.finalText === F2, `${role}: attempted`);
      ok(!('formCheck' in (r.persisted.resultJson.toolLoop ?? {})), `${role}: carries formCheck`);
    }
  });
  await test('NOT end_turn (max_tokens deliverable) → not-checked, zero calls', async () => {
    const r = await runCore({ text: F2, flag: true, llm: [resp(F2_FIXED)], loopOver: { finalStopReason: 'max_tokens',
      currentResponse: { text: F2, stopReason: 'max_tokens', usage: {}, rawContentBlocks: [], metadata: {} } } });
    ok(r.llmCalls.length === 0 && fcOf(r).correction.notAttemptedReason === 'not-checked', JSON.stringify(fcOf(r).correction));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
