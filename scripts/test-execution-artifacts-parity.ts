#!/usr/bin/env ts-node
/**
 * Execution Artifacts Parity Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern - Both execution paths import from execution-artifacts.ts
 * Layer 2: Behavior - buildExecutionResultJson produces correct shape per inputs
 *
 * Locks in the structural defense against the May 2026 dual-execution-path
 * drift bug class (Bug Class 75 § Phantom Canonical Variant — though for
 * artifact construction rather than schema bypass).
 *
 * Pre-extraction this session: 5 drift sites between engine + stream resultJson
 * construction. Post-extraction (2026-05-14): both paths call the same helper.
 * This test prevents regression.
 *
 * Created: 2026-05-14
 * Test totals are COMPUTED at runtime — no hand-maintained count here. A previous
 * header claimed "37 total" while 46 ran, and the summary printed hardcoded layer
 * denominators ("29/27"): the same claim-drift class that let non-running tests hide
 * elsewhere (bottom-exit trap). The self-check below asserts every test() executed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildExecutionResultJson, ExecutionResultJsonInput, sanitizeLLMForMarkdown, countToolErrorResults, pickResultJsonSummary } from '../lib/services/execution-artifacts';

console.log('🧪 Execution Artifacts Parity (Dual-Layer)\n');

let passed = 0;
let failed = 0;
let layer1Passed = 0;
let layer2Passed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    failed++;
  }
}

function expect(value: unknown) {
  return {
    toBe(expected: unknown) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toBeUndefined() {
      if (value !== undefined) {
        throw new Error(`Expected undefined, got ${JSON.stringify(value)}`);
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected truthy, got ${JSON.stringify(value)}`);
      }
    },
    toHaveLength(n: number) {
      if (!Array.isArray(value)) throw new Error(`Expected array, got ${typeof value}`);
      if (value.length !== n) throw new Error(`Expected length ${n}, got ${value.length}`);
    },
  };
}

// Minimal logger that captures info() calls for assertion
const captureLogs: Array<{ data: Record<string, unknown>; msg: string }> = [];
const captureLogger = {
  info: (data: Record<string, unknown>, msg: string) => captureLogs.push({ data, msg }),
};

function baseInput(overrides: Partial<ExecutionResultJsonInput> = {}): ExecutionResultJsonInput {
  return {
    taskId: 'cmh5taskid12345',
    taskTitle: 'Test Task',
    agentRole: 'test_agent',
    modelUsed: 'claude-sonnet-4-6',
    finalResponse: 'Hello world. Confidence: 85/100',
    confidenceScore: 85,
    turnCount: 5,
    maxToolTurns: 30,
    toolCallResults: [],
    successfulToolCalls: 0,
    failedToolCalls: 0,
    executionTime: 1500,
    tokensUsed: 2400,
    correctionTurnUsed: false,
    executionId: 'cmh5execid12345',
    logger: captureLogger,
    ...overrides,
  };
}

// ========================================
// LAYER 1: Pattern Validation
// ========================================

console.log('=====================================');
console.log('LAYER 1: Code Pattern Validation');
console.log('=====================================\n');

const engineSource = fs.readFileSync(
  path.join(__dirname, '../lib/services/agentExecutionEngine.ts'),
  'utf8'
);
const streamSource = fs.readFileSync(
  path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts'),
  'utf8'
);
const helperSource = fs.readFileSync(
  path.join(__dirname, '../lib/services/execution-artifacts.ts'),
  'utf8'
);
// Phase 6: the ENGINE path's happy-path spine (loop → post-loop → resultJson/tokensUsed → persist)
// moved into the shared core. Engine-path pattern pins retarget here; the engine now DELEGATES.
const coreSource = fs.readFileSync(
  path.join(__dirname, '../lib/services/execution-core.ts'),
  'utf8'
);

test('Pattern: helper file exports buildExecutionResultJson', () => {
  expect(helperSource.includes('export function buildExecutionResultJson')).toBe(true);
  layer1Passed++;
});

test('Pattern: core (engine path) imports buildExecutionResultJson', () => {
  expect(coreSource.includes("from '@/lib/services/execution-artifacts'") ||
         coreSource.includes("from './execution-artifacts'") ||
         coreSource.includes("buildExecutionResultJson")).toBe(true);
  layer1Passed++;
});

test('Pattern: stream route delegates to the core (no inline buildExecutionResultJson)', () => {
  // Phase 6b: the stream no longer builds result.json inline — it routes through runExecutionCore.
  expect(streamSource.includes("buildExecutionResultJson")).toBe(false);
  expect(streamSource.includes("runExecutionCore(")).toBe(true);
  layer1Passed++;
});

test('Pattern: engine no longer has inline `const resultJson = {` followed by qualityMetrics', () => {
  // The inline construction is gone; engine should reference the helper instead.
  // This catches re-introduction of duplicate inline construction.
  const inlineMatches = engineSource.match(/const resultJson = \{[\s\S]*?qualityMetrics:/g);
  // We accept up to 1 match for the tool-call truncation site that uses `const resultJson = JSON.stringify(...)`.
  // The dual-path resultJson construction with qualityMetrics should be gone.
  expect((inlineMatches?.length ?? 0) <= 1).toBe(true);
  layer1Passed++;
});

test('Pattern: stream route no longer has inline `const resultJson = {` followed by qualityMetrics', () => {
  const inlineMatches = streamSource.match(/const resultJson = \{[\s\S]*?qualityMetrics:/g);
  expect((inlineMatches?.length ?? 0) <= 1).toBe(true);
  layer1Passed++;
});

test('Pattern: BOTH paths read loopResult.assembledText as the deliverable source (Phase 2, C-1)', () => {
  // Convergence: the loop owns ONE deliverable-text source (last-turn). The engine
  // reads it (byte-identical to its old currentResponse.text); the stream reads it
  // INSTEAD of accumulating across turns. Re-introducing the stream accumulation
  // (`generatedText += …`) regresses the C-1 divergence.
  expect(coreSource.includes('loopResult.assembledText')).toBe(true); // engine path: now in the core
  expect(streamSource.includes('loopResult.assembledText')).toBe(true);
  expect(streamSource.includes("generatedText += '\\n\\n' + info.response.text")).toBe(false);
  layer1Passed++;
});

test('Pattern: report.md sanitization lives at the SINGLE terminal-persist site (0.5d → Phase 4b)', () => {
  // Phase 4b: the report.md write (and its sanitize call) moved into the shared
  // terminal-persist core. Neither path may re-introduce an inline copy or a raw
  // report.md write — that regresses the stored-XSS parity hole.
  const persistCoreSource = fs.readFileSync(
    path.join(__dirname, '../lib/services/execution-terminal-persist.ts'), 'utf8');
  expect(helperSource.includes('export function sanitizeLLMForMarkdown')).toBe(true);
  expect(persistCoreSource.includes('sanitizeLLMForMarkdown(finalText)')).toBe(true);
  expect(engineSource.includes('sanitizeLLMForMarkdown(')).toBe(false);
  expect(streamSource.includes('const sanitizeLLMForMarkdown')).toBe(false);
  layer1Passed++;
});

test('Behavior: sanitizeLLMForMarkdown strips script/event-handler/iframe vectors (0.5d)', () => {
  const dirty = '<p onclick="steal()">hi</p><script>alert(1)</script><iframe src="x"></iframe>ok';
  const clean = sanitizeLLMForMarkdown(dirty);
  expect(clean.includes('<script')).toBe(false);
  expect(clean.includes('onclick')).toBe(false);
  expect(clean.includes('<iframe')).toBe(false);
  expect(clean.includes('ok')).toBe(true);
  layer2Passed++;
});

test('Pattern: P7 silent-refusal finds on the 500-char prefix at its single shared site (0.5f → Phase 1)', () => {
  // Drift shape (pre-0.5f): engine found on full text then re-tested against the
  // prefix — a deep-only match shadowed a prefix-matching sibling and suppressed
  // the flag. Phase 1 moved the detector to execution-quality.ts; the prefix-find
  // shape is pinned there, and neither path may re-introduce an inline copy
  // (test-execution-quality.ts owns the no-inline-copies pin).
  const qualitySource = fs.readFileSync(
    path.join(__dirname, '../lib/agents/harness/execution-quality.ts'), 'utf8');
  expect(qualitySource.includes('inabilityPatterns.find(p => p.test(prefix))')).toBe(true);
  expect(qualitySource.includes('.test(text))')).toBe(false);
  layer1Passed++;
});

test('Pattern: engine tokensUsed is computed AFTER the #90 retry fold (0.5b, token F1)', () => {
  // Fold-timing drift: a pre-retry snapshot under-reports result.json tokensUsed on
  // diagnosticRetryUsed runs. Phase 3 moved the retry (and its addUsage fold) into the
  // shared runDiagnosticRetry, which mutates totalUsage in place — so the invariant is
  // now "tokensUsed is computed AFTER the runDiagnosticRetry() call".
  const computeIdx = coreSource.indexOf('const tokensUsed = totalUsage.inputTokens + totalUsage.outputTokens');
  const retryCallIdx = coreSource.indexOf('await runDiagnosticRetry(');
  expect(computeIdx !== -1).toBe(true);
  expect(retryCallIdx !== -1).toBe(true);
  expect(computeIdx > retryCallIdx).toBe(true);
  layer1Passed++;
});

test('Pattern: core (engine path) tokensUsed uses raw-sum semantic (no `|| undefined` — 0 is a fact)', () => {
  expect(coreSource.includes('totalUsage.outputTokens || undefined')).toBe(false);
  layer1Passed++;
});

// ========================================
// LAYER 2: Behavior Validation
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Schema Behavior Validation');
console.log('=====================================\n');

test('Behavior: builds with minimum required inputs', () => {
  const result = buildExecutionResultJson(baseInput());
  expect((result as { taskId: string }).taskId).toBe('cmh5taskid12345');
  expect((result as { agentRole: string }).agentRole).toBe('test_agent');
  layer2Passed++;
});

test('Behavior: hitMaxTurns uses maxToolTurns parameter, NOT hardcoded 30', () => {
  // The drift bug we eradicated: stream used `turnCount >= 30` even when
  // template specified maxToolTurns=100. Verify the helper respects the input.
  const result = buildExecutionResultJson(baseInput({ turnCount: 35, maxToolTurns: 100 }));
  const qm = (result as { qualityMetrics: { hitMaxTurns: boolean } }).qualityMetrics;
  expect(qm.hitMaxTurns).toBe(false); // 35 < 100, NOT hit (the bug would say true)
  layer2Passed++;
});

test('Behavior: hitMaxTurns true when turnCount >= maxToolTurns', () => {
  const result = buildExecutionResultJson(baseInput({ turnCount: 100, maxToolTurns: 100 }));
  const qm = (result as { qualityMetrics: { hitMaxTurns: boolean } }).qualityMetrics;
  expect(qm.hitMaxTurns).toBe(true);
  layer2Passed++;
});

test('Behavior: toolLoop.hitMaxTurns also uses maxToolTurns (not hardcoded)', () => {
  const result = buildExecutionResultJson(baseInput({ turnCount: 35, maxToolTurns: 100 }));
  const tl = (result as { toolLoop: { hitMaxTurns: boolean } }).toolLoop;
  expect(tl.hitMaxTurns).toBe(false);
  layer2Passed++;
});

test('Behavior: tokensUsed of 0 passes through as 0 (raw-sum semantic, 0.5b)', () => {
  const result = buildExecutionResultJson(baseInput({ tokensUsed: 0 }));
  expect((result as { tokensUsed: number }).tokensUsed).toBe(0);
  layer2Passed++;
});

test('Behavior: tokensUsed reflects input value (NOT hardcoded 0)', () => {
  const result = buildExecutionResultJson(baseInput({ tokensUsed: 12345 }));
  expect((result as { tokensUsed: number }).tokensUsed).toBe(12345);
  layer2Passed++;
});

test('Behavior: executionTime reflects input value', () => {
  const result = buildExecutionResultJson(baseInput({ executionTime: 99999 }));
  expect((result as { executionTime: number }).executionTime).toBe(99999);
  layer2Passed++;
});

test('Behavior: confidenceCapped + originalConfidence emitted when cap fires', () => {
  const result = buildExecutionResultJson(baseInput({
    confidenceScore: 60,
    confidenceCapped: true,
    originalConfidence: 90,
  }));
  expect((result as { confidenceCapped: boolean }).confidenceCapped).toBe(true);
  expect((result as { originalConfidence: number }).originalConfidence).toBe(90);
  layer2Passed++;
});

test('Behavior: confidenceCapped + originalConfidence NOT emitted when cap did not fire', () => {
  const result = buildExecutionResultJson(baseInput({ confidenceScore: 85 }));
  expect((result as Record<string, unknown>).confidenceCapped).toBeUndefined();
  expect((result as Record<string, unknown>).originalConfidence).toBeUndefined();
  layer2Passed++;
});

test('Behavior: executionDegradation emitted when present', () => {
  const result = buildExecutionResultJson(baseInput({
    executionDegradation: { errorCategory: 'TOOL_LOOP_DEGRADED' },
  }));
  expect((result as { executionDegradation: unknown }).executionDegradation).toBeTruthy();
  expect((result as { errorCategory: string }).errorCategory).toBe('TOOL_LOOP_DEGRADED');
  layer2Passed++;
});

test('Behavior: executionDegradation NOT emitted when null', () => {
  const result = buildExecutionResultJson(baseInput({ executionDegradation: null }));
  expect((result as Record<string, unknown>).executionDegradation).toBeUndefined();
  expect((result as Record<string, unknown>).errorCategory).toBeUndefined();
  layer2Passed++;
});

test('Behavior: harnessContext → resolvedMode + resolvedReasonCode emitted', () => {
  const result = buildExecutionResultJson(baseInput({
    harnessContext: {
      mode: 'CREATE',
      reasonCode: 'empty-stage',
      reason: 'test fixture',
      resolvedAt: new Date().toISOString(),
      pipelineStageId: null,
    },
  }));
  expect((result as { resolvedMode: string }).resolvedMode).toBe('CREATE');
  expect((result as { resolvedReasonCode: string }).resolvedReasonCode).toBe('empty-stage');
  layer2Passed++;
});

test('Behavior: templateScopeMismatch RETIRED — never emitted (P9 retirement 2026-07-17)', () => {
  // ~60 firings ever, 0 true positives; field removed from result.json emission.
  // Historical artifacts still carry it — readers tolerate, writers never emit.
  const result = buildExecutionResultJson(baseInput());
  expect((result as Record<string, unknown>).templateScopeMismatch).toBeUndefined();
  layer2Passed++;
});

test('Behavior: diagnosticRetryUsed defaults to false when not provided', () => {
  const result = buildExecutionResultJson(baseInput());
  const tl = (result as { toolLoop: { diagnosticRetryUsed: boolean } }).toolLoop;
  expect(tl.diagnosticRetryUsed).toBe(false);
  layer2Passed++;
});

test('Behavior: diagnosticRetryUsed reflects input when true', () => {
  const result = buildExecutionResultJson(baseInput({ diagnosticRetryUsed: true }));
  const tl = (result as { toolLoop: { diagnosticRetryUsed: boolean } }).toolLoop;
  expect(tl.diagnosticRetryUsed).toBe(true);
  layer2Passed++;
});

test('Behavior: R4 truncationRetryUsed/Recovered default false and are emitted in toolLoop (before finalResponse)', () => {
  const result = buildExecutionResultJson(baseInput()) as { toolLoop: { truncationRetryUsed: boolean; truncationRetryRecovered: boolean }; finalResponse?: string };
  expect(result.toolLoop.truncationRetryUsed).toBe(false);
  expect(result.toolLoop.truncationRetryRecovered).toBe(false);
  // Field-order contract: toolLoop precedes finalResponse in the serialized object (head-slice visible).
  const keys = Object.keys(result);
  expect(keys.indexOf('toolLoop') < keys.indexOf('finalResponse')).toBe(true);
  layer2Passed++;
});

test('Behavior: R4 truncationRetryUsed/Recovered reflect input when true', () => {
  const result = buildExecutionResultJson(baseInput({ truncationRetryUsed: true, truncationRetryRecovered: true }));
  const tl = (result as { toolLoop: { truncationRetryUsed: boolean; truncationRetryRecovered: boolean } }).toolLoop;
  expect(tl.truncationRetryUsed).toBe(true);
  expect(tl.truncationRetryRecovered).toBe(true);
  layer2Passed++;
});

test('Behavior: mcpToolsProvided uses mcpFunctions list when provided', () => {
  const result = buildExecutionResultJson(baseInput({
    mcpFunctions: [{ name: 'project' }, { name: 'perform' }, { name: 'fetch' }],
  }));
  expect((result as { mcpToolsProvided: string[] }).mcpToolsProvided).toEqual(['project', 'perform', 'fetch']);
  layer2Passed++;
});

test('Behavior: mcpToolsProvided derives from toolCallResults when mcpFunctions absent', () => {
  const result = buildExecutionResultJson(baseInput({
    mcpFunctions: null,
    toolCallResults: [
      { success: true, tool: 'project', result: {} },
      { success: true, tool: 'perform', result: {} },
      { success: false, tool: 'fetch' }, // failures excluded
    ],
    successfulToolCalls: 2,
    failedToolCalls: 1,
  }));
  const tools = (result as { mcpToolsProvided: string[] }).mcpToolsProvided;
  expect(tools.includes('project')).toBe(true);
  expect(tools.includes('perform')).toBe(true);
  expect(tools.includes('fetch')).toBe(false);
  layer2Passed++;
});

test('Behavior: tool call results > 50KB are truncated with logger call', () => {
  captureLogs.length = 0;
  const bigResult = 'x'.repeat(60000);
  const result = buildExecutionResultJson(baseInput({
    toolCallResults: [{ success: true, tool: 'fetch', server: 'paichart', result: bigResult }],
  }));
  const toolCalls = (result as { toolCalls: Array<{ result: { truncated?: boolean; preview?: string } }> }).toolCalls;
  expect(toolCalls[0].result.truncated).toBe(true);
  expect(toolCalls[0].result.preview!.length < bigResult.length).toBe(true);
  expect(captureLogs.length).toBe(1);
  layer2Passed++;
});

test('Behavior: tool call results <= 50KB pass through untouched', () => {
  captureLogs.length = 0;
  const smallResult = { ok: true, data: 'hello' };
  const result = buildExecutionResultJson(baseInput({
    toolCallResults: [{ success: true, tool: 'fetch', result: smallResult }],
  }));
  const toolCalls = (result as { toolCalls: Array<{ result: unknown }> }).toolCalls;
  expect(toolCalls[0].result).toEqual(smallResult);
  expect(captureLogs.length).toBe(0);
  layer2Passed++;
});

test('Behavior: stream-only extensions (functionCall) emitted when provided', () => {
  const result = buildExecutionResultJson(baseInput({
    extensions: { functionCall: { name: 'test' } },
  }));
  expect((result as { functionCall: unknown }).functionCall).toEqual({ name: 'test' });
  layer2Passed++;
});

test('Behavior: stream-only extensions NOT emitted when not provided', () => {
  const result = buildExecutionResultJson(baseInput());
  expect((result as Record<string, unknown>).functionCall).toBeUndefined();
  expect((result as Record<string, unknown>).webSearchResults).toBeUndefined();
  expect((result as Record<string, unknown>).citations).toBeUndefined();
  expect((result as Record<string, unknown>).searchQueries).toBeUndefined();
  layer2Passed++;
});

test('Behavior: agentRole respects input (caller resolves; helper does not override)', () => {
  // Engine passes resolvedRole; stream now passes the same fallback chain output.
  // The helper does not implement resolution — callers do, then pass the result.
  const result = buildExecutionResultJson(baseInput({ agentRole: 'pipeline_harness_orchestrator' }));
  expect((result as { agentRole: string }).agentRole).toBe('pipeline_harness_orchestrator');
  layer2Passed++;
});

// ── reviewerVerdict (9th trust signal, 2026-07-14 verdict-misread fix) ─────────

const reviewerResponse =
  'I raise 3 blocking issues... on re-reading I retract all three.\n\n## VERDICT: APPROVED\nBlocking issues: none\nConfidence: 86';

test('Behavior: reviewerVerdict emitted for change_reviewer with terminal block', () => {
  const result = buildExecutionResultJson(baseInput({
    agentRole: 'change_reviewer',
    finalResponse: reviewerResponse,
    confidenceScore: 86,
  }));
  const v = (result as { reviewerVerdict?: { approved: boolean; blocking: string[] } }).reviewerVerdict;
  expect(v?.approved).toBe(true);
  expect((v?.blocking ?? ['MISSING']).length).toBe(0);
  layer2Passed++;
});

test('Behavior: reviewerVerdict ABSENT for non-reviewer roles even if text contains a block', () => {
  const result = buildExecutionResultJson(baseInput({ finalResponse: reviewerResponse }));
  expect((result as Record<string, unknown>).reviewerVerdict).toBeUndefined();
  layer2Passed++;
});

test('Behavior: reviewerVerdict ABSENT (never fabricated) when reviewer emits no block', () => {
  const result = buildExecutionResultJson(baseInput({
    agentRole: 'change_reviewer',
    finalResponse: 'Looks fine. Confidence: 90',
  }));
  expect((result as Record<string, unknown>).reviewerVerdict).toBeUndefined();
  layer2Passed++;
});

test('Behavior: FIELD ORDER contract — ALL compact fields BEFORE finalResponse; only bulky payloads after', () => {
  // Consumers read result.json through HEAD-SLICE caps (fetch 50KB → tool-loop 8KB); anything after
  // a long finalResponse is invisible on a single fetch (the 2026-07-14 incident mechanism).
  // Rule: the ONLY keys allowed at/after finalResponse are the bulky payloads.
  const BULKY = new Set(['finalResponse', 'toolCalls', 'functionCall', 'webSearchResults', 'citations', 'searchQueries']);
  const result = buildExecutionResultJson(baseInput({
    agentRole: 'change_reviewer',
    finalResponse: reviewerResponse,
    confidenceScore: 60,
    confidenceCapped: true,
    originalConfidence: 90,
    executionDegradation: { errorCategory: 'timeout' },
    harnessContext: { mode: 'SYNTHESIZE', reasonCode: 'test' } as never,
    chainedContext: { predecessors: 1, expectedPredecessors: 1, chainCapablePredecessors: 1, degradedPredecessors: 0, totalChars: 10, anyTruncated: false },
  }));
  const keys = Object.keys(result);
  const finalResponseIdx = keys.indexOf('finalResponse');
  expect(finalResponseIdx > -1).toBe(true);
  const misplaced = keys.filter((k, i) => i >= finalResponseIdx && !BULKY.has(k));
  expect(misplaced).toEqual([]);
  expect(keys.indexOf('toolCalls') > finalResponseIdx).toBe(true);
  layer2Passed++;
});

// ========================================

// ── F-NEW-3 (T6, 2026-07-17): toolErrorResultCount — a RETURNED MCP error must be countable ────────
// The §L/K4 expected-denial contract keeps success=true when a tool RETURNS an error envelope, so a
// dead connected service was invisible in structured facts (live: T6's terraform Harvester harvested
// nothing behind a 502 and toolCallSuccess still read {total:7, succeeded:7, failed:0}). These pin the
// fact WITHOUT disturbing `success` semantics.

// The exact envelope shape observed on the live T6 502 (result.isError=true, success=true).
const t6IsErrorResult = {
  content: [{ type: 'text', text: '❌ Service call to "terraform-rig-readonly" failed: Streamable HTTP error: Error 502: Bad gateway' }],
  isError: true,
  _meta: { error: 'Error 502: Bad gateway' },
};

test('F-NEW-3: countToolErrorResults counts a RETURNED isError envelope (success=true)', () => {
  const n = countToolErrorResults([{ success: true, tool: 'services', result: t6IsErrorResult }]);
  if (n !== 1) throw new Error(`expected 1, got ${n}`);
});

test('F-NEW-3: a genuine throw (success=false) is NOT counted — toolCallSuccess.failed already owns it', () => {
  const n = countToolErrorResults([{ success: false, tool: 'services', error: 'boom' }]);
  if (n !== 0) throw new Error(`expected 0, got ${n}`);
});

test('F-NEW-3: a clean success is not counted', () => {
  const n = countToolErrorResults([{ success: true, tool: 'services', result: { content: [], isError: false } }]);
  if (n !== 0) throw new Error(`expected 0, got ${n}`);
});

test('F-NEW-3: tolerates missing/non-object/null result without throwing', () => {
  const n = countToolErrorResults([
    { success: true, tool: 'a' },
    { success: true, tool: 'b', result: null },
    { success: true, tool: 'c', result: 'a string' },
    { success: true, tool: 'd', result: 42 },
  ]);
  if (n !== 0) throw new Error(`expected 0, got ${n}`);
});

test('F-NEW-3: mixed batch counts only the RETURNED errors', () => {
  const n = countToolErrorResults([
    { success: true, tool: 'services', result: t6IsErrorResult },
    { success: true, tool: 'services', result: t6IsErrorResult },
    { success: true, tool: 'project', result: { content: [], isError: false } },
    { success: false, tool: 'services', error: 'threw' },
  ]);
  if (n !== 2) throw new Error(`expected 2, got ${n}`);
});

test('F-NEW-3: builder emits toolLoop.toolErrorResultCount, and success semantics are UNTOUCHED', () => {
  const input: ExecutionResultJsonInput = {
    taskId: 't1', taskTitle: 'Harvest', agentRole: 'infra_state_harvester',
    modelUsed: 'claude-haiku-4-5', finalResponse: 'blocked', confidenceScore: 25,
    turnCount: 7, maxToolTurns: 100,
    toolCallResults: [
      { success: true, tool: 'services', result: t6IsErrorResult },
      { success: true, tool: 'project', result: { content: [], isError: false } },
    ],
    successfulToolCalls: 2, failedToolCalls: 0,
  } as ExecutionResultJsonInput;
  const r = buildExecutionResultJson(input) as Record<string, any>;
  if (r.toolLoop?.toolErrorResultCount !== 1) {
    throw new Error(`toolLoop.toolErrorResultCount expected 1, got ${r.toolLoop?.toolErrorResultCount}`);
  }
  // The whole point: the §L contract is NOT re-classified. failed stays 0.
  if (r.qualityMetrics?.toolCallSuccess?.failed !== 0) {
    throw new Error('REGRESSION: success semantics changed — toolCallSuccess.failed must stay 0');
  }
  if (r.qualityMetrics?.toolCallSuccess?.succeeded !== 2) {
    throw new Error('REGRESSION: toolCallSuccess.succeeded must stay 2');
  }
});

test('F-NEW-3: toolErrorResultCount is emitted BEFORE finalResponse (field-order contract)', () => {
  const input: ExecutionResultJsonInput = {
    taskId: 't1', taskTitle: 'x', agentRole: 'infra_state_harvester', modelUsed: 'm',
    finalResponse: 'body', confidenceScore: 50, turnCount: 1, maxToolTurns: 10,
    toolCallResults: [{ success: true, tool: 'services', result: t6IsErrorResult }],
    successfulToolCalls: 1, failedToolCalls: 0,
  } as ExecutionResultJsonInput;
  const keys = Object.keys(buildExecutionResultJson(input) as Record<string, unknown>);
  if (keys.indexOf('toolLoop') > keys.indexOf('finalResponse')) {
    throw new Error('toolLoop must precede finalResponse — head-slice consumers would lose the fact');
  }
});

test('E3c (2026-08-26): pickResultJsonSummary hoists contractPropagation — a gate must read it head-slice-safe', () => {
  const fact = {
    checked: true,
    canonicalLinesConsidered: 13,
    children: [{ taskId: 'c1', role: 'change_reviewer', hasInterfaceContract: false,
                 canonicalLinesAbsentFromBrief: ['address-family ipv4 unicast  [from canonicalStanza]'],
                 executed: true }],
  };
  const summary = pickResultJsonSummary({ taskId: 't1', contractPropagation: fact, finalResponse: 'x'.repeat(20000) } as unknown as Record<string, unknown>);
  if (!('contractPropagation' in summary)) {
    throw new Error('contractPropagation must be in RESULT_JSON_SUMMARY_KEYS pick — it reports whether a leg\'s children received the binding contract at all; a consumer reading it past a long finalResponse would never see it');
  }
  // Sub-fields must survive NESTED (the E3b lesson one level down): an unlisted SIBLING is stripped.
  const got = summary.contractPropagation as Record<string, unknown>;
  if (!Array.isArray(got.children) || (got.children as unknown[]).length !== 1) {
    throw new Error('contractPropagation.children must ride nested inside the whitelisted key');
  }
});

test('E3 (wave-2 2026-07-18): pickResultJsonSummary hoists derivationContainment from a pipeline-index-shaped object', () => {
  const fact = { checked: true, violations: [{ harvested: '10.99.0.3/32', derived: '10.99.0.0/30', reason: 'covered-not-member' }], unsupported: [], harvestedCount: 6, derivedCount: 1 };
  const summary = pickResultJsonSummary({ taskId: 't1', derivationContainment: fact, finalResponse: 'x'.repeat(20000) } as unknown as Record<string, unknown>);
  if (!('derivationContainment' in summary)) {
    throw new Error('derivationContainment must be in RESULT_JSON_SUMMARY_KEYS pick — the program gate conjunct reads it head-slice-safe (E1: pipeline executions persist pipeline-index.json)');
  }
  if (JSON.stringify((summary as Record<string, unknown>).derivationContainment) !== JSON.stringify(fact)) {
    throw new Error('derivationContainment must be hoisted verbatim');
  }
  const absent = pickResultJsonSummary({ taskId: 't1', finalResponse: 'y' } as unknown as Record<string, unknown>);
  if ('derivationContainment' in absent) {
    throw new Error('absent fact must not be fabricated by the picker');
  }
});

test('E3b (2026-08-04): containmentDisposition survives the pick — it rides NESTED, and a sibling would be stripped', () => {
  // WHY. `containmentDisposition` is what tells the program tier a decision was DELEGATED to it
  // (`needs-node-c`). It is not on RESULT_JSON_SUMMARY_KEYS and does not need to be: it is assigned
  // nested on the fact (`derivation-containment-enrichment.ts:301`) and rides on `derivationContainment`.
  // E3 above already pins verbatim hoisting — but its fixture predates the disposition and carries none,
  // so until this test nothing exercised a disposition-BEARING fact through the picker.
  const fact = {
    checked: false,
    reason: 'no-derived-values-block',
    violations: [],
    unsupported: [{ kind: 'vlan', value: '100' }],
    harvestedByKind: { asn: 2 },
    containmentDisposition: { disposition: 'needs-node-c', reason: 'unsupported-not-mechanically-covered' },
  };
  const summary = pickResultJsonSummary({ taskId: 't1', derivationContainment: fact } as unknown as Record<string, unknown>);
  const got = (summary as Record<string, unknown>).derivationContainment as Record<string, unknown> | undefined;
  if (!got || !got.containmentDisposition) {
    throw new Error('containmentDisposition must survive pickResultJsonSummary nested on the fact — without it the program tier is never told a decision was delegated to it');
  }
  if ((got.containmentDisposition as Record<string, unknown>).disposition !== 'needs-node-c') {
    throw new Error('the disposition value must survive verbatim, not merely the key');
  }

  // THE FAILURE THIS GUARDS. Promote it to a SIBLING and the strict whitelist drops it silently — no
  // error, no marker, the card simply stops mentioning it. Asserted as a fact rather than described in a
  // comment, so a future refactor that "tidies" the disposition up to the top level fails here first.
  const promoted = pickResultJsonSummary({
    taskId: 't1',
    derivationContainment: { checked: false, reason: 'no-derived-values-block' },
    containmentDisposition: { disposition: 'needs-node-c', reason: 'unsupported-not-mechanically-covered' },
  } as unknown as Record<string, unknown>);
  if ('containmentDisposition' in promoted) {
    throw new Error('EXPECTATION CHANGED: a top-level containmentDisposition is now retained. If that was deliberate, add it to RESULT_JSON_SUMMARY_KEYS and update the header comment there; if not, it is riding a path that was never whitelisted');
  }
});

// Summary
// ========================================

console.log('\n=====================================');
console.log('Execution Artifacts Parity Summary:');
console.log('=====================================');
// Claim-drift fix (2026-07-17): denominators were hardcoded (10/27) and drifted
// ("29/27"); 17 tests incremented NEITHER layer counter. Counters are informational
// only now; the load-bearing check is the executed-vs-declared self-check below.
console.log(`\n📊 Layer 1 (Pattern):  ${layer1Passed} counted`);
console.log(`📊 Layer 2 (Behavior): ${layer2Passed} counted`);
// SELF-CHECK: every test() declared in this file must have EXECUTED. Appending a
// test below the summary/process.exit means it silently never runs and the suite
// still prints success — this catches that structurally instead of by count-claim.
const __declaredTests = (require('fs').readFileSync(__filename, 'utf-8').match(/^test\(/gm) || []).length;
if (passed + failed !== __declaredTests) {
  console.error(`❌ SELF-CHECK: ${__declaredTests} test() declared but ${passed + failed} executed — tests below process.exit or a conditional never ran`);
  process.exit(1);
}
console.log(`\n✅ Total Passed: ${passed}`);
console.log(`❌ Total Failed: ${failed}`);
console.log(`📊 Total Tests:  ${passed + failed}`);
console.log('=====================================\n');

if (failed > 0) {
  console.error('❌ Some tests failed!\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
