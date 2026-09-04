#!/usr/bin/env ts-node
/**
 * Execution-Quality Cascade Tests — convergence Phase 1
 *
 * Dual-layer gate for lib/agents/harness/execution-quality.ts:
 *   Layer 1 (pattern): both paths call assessExecutionQuality; the inline
 *     cascade copies are GONE from both files (re-introduction = drift returns).
 *   Layer 2 (behavior): golden fixtures for every branch of the cascade
 *     (P5/P4/P3/P7/P9/P10/P8, priority interactions, none), locking the
 *     engine-canonical semantics both paths now share.
 *
 * Created: 2026-07-04
 * Plan: cline_docs/reviews/execution-path-convergence-2026-07-04/implementation-plan.md §Phase 1
 */

import * as fs from 'fs';
import * as path from 'path';
import { assessExecutionQuality, ExecutionQualityInput } from '../lib/agents/harness/execution-quality';
import type { ToolCallRecord } from '../lib/agents/harness/agentic-tool-loop';

console.log('🧪 Execution-Quality Cascade Tests (Phase 1)\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) console.error(`   ${error.message}`);
    failed++;
  }
}

function expectEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const call = (success: boolean, error?: string, action?: string): ToolCallRecord => ({
  turn: 1,
  tool: 'perform',
  arguments: action ? { action } : {},
  success,
  ...(error ? { error } : {}),
  durationMs: 10,
  timestamp: '2026-07-04T00:00:00.000Z',
});

function baseInput(overrides: Partial<ExecutionQualityInput> = {}): ExecutionQualityInput {
  return {
    toolCallResults: [],
    failedToolCalls: 0,
    text: 'All work completed successfully. Confidence: 90/100',
    stopReason: 'end_turn',
    task: { id: 'cmh5taskid12345', type: 'AGENT' },
    executionId: 'cmh5execid12345',
    turnCount: 3,
    ...overrides,
  };
}

// ---------- Layer 2: behavior ----------

test('none: healthy run → no degradation, no protocolValidation', () => {
  const r = assessExecutionQuality(baseInput());
  expectEq(r.executionDegradation, null, 'degradation');
  expectEq(r.protocolValidation, null, 'protocolValidation');
});

test('P5: budget error wins even with failing tail (priority over P4/P3)', () => {
  const calls = [call(false, 'Token budget exceeded for hour'), call(false, 'Token budget exceeded for hour')];
  const r = assessExecutionQuality(baseInput({ toolCallResults: calls, failedToolCalls: 2 }));
  expectEq(r.executionDegradation?.errorCategory, 'BUDGET_EXHAUSTED', 'category');
  expectEq(r.executionDegradation?.budgetError, 'Token budget exceeded for hour', 'budgetError');
  expectEq(r.executionDegradation?.consecutiveTailFailures, 2, 'tail');
  expectEq(r.executionDegradation?.toolFailureRate, 100, 'rate');
});

test('P4: ≥2 consecutive tail failures → TOOL_LOOP_DEGRADED with engine-canonical text', () => {
  const calls = [call(true), call(false, 'boom'), call(false, 'boom')];
  const r = assessExecutionQuality(baseInput({ toolCallResults: calls, failedToolCalls: 2 }));
  expectEq(r.executionDegradation?.errorCategory, 'TOOL_LOOP_DEGRADED', 'category');
  expectEq(
    r.executionDegradation?.degradationReason,
    'Last 2 tool calls all failed — LLM exited after consecutive failures',
    'reason (the d7751d35 canonical text)'
  );
});

test('P3: >50% failures without a ≥2 tail → TOOL_FAILURES', () => {
  const calls = [call(false, 'x'), call(false, 'x'), call(true)];
  const r = assessExecutionQuality(baseInput({ toolCallResults: calls, failedToolCalls: 2 }));
  expectEq(r.executionDegradation?.errorCategory, 'TOOL_FAILURES', 'category');
  expectEq(r.executionDegradation?.degradationReason, '2 of 3 tool calls failed (67%)', 'reason');
});

test('P7: inability statement in prefix + end_turn → SILENT_REFUSAL (canonical long text)', () => {
  const r = assessExecutionQuality(baseInput({ text: 'I am unable to complete this task because the repository is empty.' }));
  expectEq(r.executionDegradation?.errorCategory, 'SILENT_REFUSAL', 'category');
  expectEq(
    r.executionDegradation?.degradationReason,
    'Agent ended with an inability statement using end_turn instead of the refusal path — execution stored as SUCCESS but the agent reported it could not complete the work',
    'reason (the d7751d35 canonical text)'
  );
});

test('P7: inability phrase buried past 500 chars → NOT flagged (0.5f prefix rule)', () => {
  const r = assessExecutionQuality(baseInput({ text: 'Substantive work. '.repeat(40) + 'I was unable to complete one minor step.' }));
  expectEq(r.executionDegradation, null, 'degradation');
});

test('P7: does not fire on non-end_turn stopReason', () => {
  const r = assessExecutionQuality(baseInput({ text: 'I am unable to complete this.', stopReason: 'max_tokens' }));
  expectEq(r.executionDegradation, null, 'degradation');
});

test('P7: suppressed when a tool-failure category already matched', () => {
  const calls = [call(false, 'x'), call(false, 'x')];
  const r = assessExecutionQuality(baseInput({
    toolCallResults: calls, failedToolCalls: 2,
    text: 'I am unable to complete this task.',
  }));
  expectEq(r.executionDegradation?.errorCategory, 'TOOL_LOOP_DEGRADED', 'category');
});

// ---------- HARNESS_NO_OUTPUT (2026-07-17, 3-lens panel + harness-specialist) ----------

test('HNO: SPECIMEN REPLAY — PIPELINE, empty, end_turn, stage.create-only → P8 leads (PROTOCOL_STEP_SKIPPED), both facts true', () => {
  const r = assessExecutionQuality(baseInput({
    text: '', rawDeliverableText: '',
    task: { id: 'cmh5taskid12345', type: 'PIPELINE' },
    resolvedMode: 'CREATE',
    toolCallResults: [call(true, undefined, 'pov.details'), call(true, undefined, 'task.comment'), call(true, undefined, 'stage.create')],
  }));
  // Diagnosis outranks symptom: widened P8 mode inference claims the category with the
  // step-level diagnosis; HARNESS_NO_OUTPUT stays residual.
  expectEq(r.executionDegradation?.errorCategory, 'PROTOCOL_STEP_SKIPPED', 'category (P8 leads)');
  expectEq(r.harnessNoOutput, true, 'harnessNoOutput fact');
  expectEq(r.harnessCreateIncomplete, true, 'harnessCreateIncomplete fact (stage.create, no task.update)');
});

test('HNO: PIPELINE, empty, end_turn, ZERO tool calls → HARNESS_NO_OUTPUT (the residual hole P8 nulls on)', () => {
  const r = assessExecutionQuality(baseInput({
    text: '', rawDeliverableText: '',
    task: { id: 'cmh5taskid12345', type: 'PIPELINE' },
    toolCallResults: [],
  }));
  expectEq(r.executionDegradation?.errorCategory, 'HARNESS_NO_OUTPUT', 'category');
  expectEq(r.harnessNoOutput, true, 'fact');
});

test('HNO: PIPELINE thin-but-nonempty → nothing (protects the documented legitimate-thin setup-and-exit case)', () => {
  const r = assessExecutionQuality(baseInput({
    text: 'Done.', rawDeliverableText: 'Done.',
    task: { id: 'cmh5taskid12345', type: 'PIPELINE' },
    toolCallResults: [],
  }));
  expectEq(r.executionDegradation, null, 'no category');
  expectEq(r.harnessNoOutput, false, 'fact false');
});

test('HNO scope regression: NON-PIPELINE + empty + tools → still EMPTY_DELIVERABLE, not the new category', () => {
  const r = assessExecutionQuality(baseInput({
    text: '', rawDeliverableText: '',
    toolCallResults: [call(true)],
  }));
  expectEq(r.executionDegradation?.errorCategory, 'EMPTY_DELIVERABLE', 'category');
  expectEq(r.harnessNoOutput, false, 'fact false (non-PIPELINE)');
});

test('HNO specificity: PIPELINE + empty + max_tokens → still TRUNCATED_NO_OUTPUT (more specific cause wins)', () => {
  const r = assessExecutionQuality(baseInput({
    text: '', rawDeliverableText: '', stopReason: 'max_tokens',
    task: { id: 'cmh5taskid12345', type: 'PIPELINE' },
    toolCallResults: [],
  }));
  expectEq(r.executionDegradation?.errorCategory, 'TRUNCATED_NO_OUTPUT', 'category');
});

test('HNO pre-note pin: PIPELINE + glued max-TURNS note in text + empty rawDeliverableText → fires on raw (stopReason-independent)', () => {
  // The finalize glue covers max-turns too — judging post-note `text` would blind this
  // on exactly the R4-mesh cases. Note: end_turn is NOT the stop here, proving no stopReason gate.
  const r = assessExecutionQuality(baseInput({
    text: '\n\n[Response truncated: the agent hit the maximum tool-call turn limit.]',
    rawDeliverableText: '',
    stopReason: 'tool_use',
    task: { id: 'cmh5taskid12345', type: 'PIPELINE' },
    toolCallResults: [],
  }));
  expectEq(r.executionDegradation?.errorCategory, 'HARNESS_NO_OUTPUT', 'category (judged pre-note)');
});

test('HNO fact precision: harnessCreateIncomplete false when task.update succeeded (linked CREATE)', () => {
  const r = assessExecutionQuality(baseInput({
    text: 'Created stage and children.', rawDeliverableText: 'Created stage and children.',
    task: { id: 'cmh5taskid12345', type: 'PIPELINE' },
    resolvedMode: 'CREATE',
    toolCallResults: [call(true, undefined, 'stage.create'), call(true, undefined, 'task.update'), call(true, undefined, 'task.create')],
  }));
  expectEq(r.harnessCreateIncomplete, false, 'linked CREATE is not incomplete');
});

test('P9 RETIRED (2026-07-17): no code path emits TEMPLATE_SCOPE_MISMATCH anymore', () => {
  // The MVP's own decision rule was empirical FPR data: ~60 firings ever, ZERO true
  // positives (all deliberate protocol assignments the verb table did not cover).
  // Source pin so a re-add is a deliberate act, not drift. Historical artifacts
  // still carry the category; readers must tolerate it (schema keeps the enum value).
  const fs = require('fs'); const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/execution-quality.ts'), 'utf-8');
  expectEq(/errorCategory:\s*'TEMPLATE_SCOPE_MISMATCH'/.test(src), false, 'P9 promotion re-added — requires a new true-positive incident, see retirement rationale');
  expectEq(fs.existsSync(path.join(__dirname, '../lib/services/templateScopeMatcher.ts')), false, 'templateScopeMatcher.ts is back — same bar applies');
});

test('P10: anchored [TEMPLATE_MISMATCH] marker OVERRIDES prior categories', () => {
  const calls = [call(false, 'Token budget exceeded for hour')];
  const r = assessExecutionQuality(baseInput({
    toolCallResults: calls, failedToolCalls: 1,
    text: '[TEMPLATE_MISMATCH] This task asks for deployment; I am a research agent.',
  }));
  expectEq(r.executionDegradation?.errorCategory, 'TEMPLATE_MISMATCH_SELF_REPORTED', 'category');
});

test('P10: marker quoted mid-prose does NOT fire (anchored detection)', () => {
  const r = assessExecutionQuality(baseInput({
    text: 'When out of scope, agents return [TEMPLATE_MISMATCH] as instructed. Work done.',
  }));
  expectEq(r.executionDegradation, null, 'degradation');
});

test('EMPTY_DELIVERABLE: empty text + successful tools (non-PIPELINE) → additive signal', () => {
  const calls = [call(true, undefined, 'services.call'), call(true, undefined, 'services.call')];
  const r = assessExecutionQuality(baseInput({ text: '', toolCallResults: calls, failedToolCalls: 0 }));
  expectEq(r.executionDegradation?.errorCategory, 'EMPTY_DELIVERABLE', 'category');
});

test('EMPTY_DELIVERABLE: does NOT fire for PIPELINE (setup-and-exit legit; P8 owns it)', () => {
  const calls = [call(true, undefined, 'stage.create'), call(true, undefined, 'task.create')];
  const r = assessExecutionQuality(baseInput({ text: '', toolCallResults: calls, task: { id: 'cmh5taskid12345', type: 'PIPELINE' } }));
  if (r.executionDegradation?.errorCategory === 'EMPTY_DELIVERABLE') throw new Error('EMPTY_DELIVERABLE must not fire for PIPELINE tasks');
});

test('EMPTY_DELIVERABLE: does NOT fire when deliverable text present', () => {
  const calls = [call(true, undefined, 'services.call')];
  const r = assessExecutionQuality(baseInput({ toolCallResults: calls })); // baseInput text is non-empty
  expectEq(r.executionDegradation, null, 'degradation');
});

test('EMPTY_DELIVERABLE: does NOT fire without tool activity (empty+no-tools is the guard-throw case)', () => {
  const r = assessExecutionQuality(baseInput({ text: '', toolCallResults: [] }));
  expectEq(r.executionDegradation, null, 'degradation');
});

test('EMPTY_DELIVERABLE: suppressed when a higher-priority tool-failure category claimed', () => {
  const calls = [call(false, 'x'), call(false, 'x')]; // P4 TOOL_LOOP_DEGRADED wins
  const r = assessExecutionQuality(baseInput({ text: '', toolCallResults: calls, failedToolCalls: 2 }));
  expectEq(r.executionDegradation?.errorCategory, 'TOOL_LOOP_DEGRADED', 'category');
});

const TRUNC_NOTE = '\n\n> **Note**: Response was truncated due to token limit.';

test('TRUNCATED_NO_OUTPUT (R2): max_tokens + empty raw (non-PIPELINE) → additive signal', () => {
  const r = assessExecutionQuality(baseInput({ text: TRUNC_NOTE, rawDeliverableText: '', stopReason: 'max_tokens' }));
  expectEq(r.executionDegradation?.errorCategory, 'TRUNCATED_NO_OUTPUT', 'category');
});

test('TRUNCATED_NO_OUTPUT (R2): fires for PIPELINE with 0 tools (the harness SYNTHESIZE stall — unlike EMPTY_DELIVERABLE)', () => {
  const r = assessExecutionQuality(baseInput({
    text: TRUNC_NOTE, rawDeliverableText: '', stopReason: 'max_tokens',
    task: { id: 'cmh5taskid12345', type: 'PIPELINE' },
  }));
  expectEq(r.executionDegradation?.errorCategory, 'TRUNCATED_NO_OUTPUT', 'category (PIPELINE, 0 tools)');
});

test('TRUNCATED_NO_OUTPUT (R2): classifies on RAW text — the finalize note does NOT mask it', () => {
  // finalized `text` is the non-empty note; raw is empty → still fires (the whole point of R2).
  const r = assessExecutionQuality(baseInput({ text: TRUNC_NOTE, rawDeliverableText: '', stopReason: 'max_tokens' }));
  expectEq(r.executionDegradation?.errorCategory, 'TRUNCATED_NO_OUTPUT', 'note-masked emptiness still detected');
});

test('TRUNCATED_NO_OUTPUT (R2): does NOT fire when raw deliverable is non-empty (real content, just capped)', () => {
  const r = assessExecutionQuality(baseInput({ text: 'Real deliverable content.' + TRUNC_NOTE, rawDeliverableText: 'Real deliverable content.', stopReason: 'max_tokens' }));
  expectEq(r.executionDegradation, null, 'a truncation WITH content is not TRUNCATED_NO_OUTPUT');
});

test('TRUNCATED_NO_OUTPUT (R2): does NOT fire for a non-max_tokens empty (that is EMPTY_DELIVERABLE / guard territory)', () => {
  const calls = [call(true, undefined, 'services.call')];
  const r = assessExecutionQuality(baseInput({ text: '', rawDeliverableText: '', stopReason: 'end_turn', toolCallResults: calls, failedToolCalls: 0 }));
  expectEq(r.executionDegradation?.errorCategory, 'EMPTY_DELIVERABLE', 'end_turn empty → EMPTY_DELIVERABLE, not TRUNCATED');
});

test('TRUNCATED_NO_OUTPUT (R2): claims BEFORE EMPTY_DELIVERABLE (a truncation is the specific cause)', () => {
  const calls = [call(true, undefined, 'services.call')];
  const r = assessExecutionQuality(baseInput({ text: TRUNC_NOTE, rawDeliverableText: '', stopReason: 'max_tokens', toolCallResults: calls, failedToolCalls: 0 }));
  expectEq(r.executionDegradation?.errorCategory, 'TRUNCATED_NO_OUTPUT', 'truncation wins over EMPTY_DELIVERABLE');
});

test('TRUNCATED_NO_OUTPUT (R2): suppressed when a higher-priority tool-failure category claimed', () => {
  const calls = [call(false, 'x'), call(false, 'x')]; // P4 TOOL_LOOP_DEGRADED wins
  const r = assessExecutionQuality(baseInput({ text: TRUNC_NOTE, rawDeliverableText: '', stopReason: 'max_tokens', toolCallResults: calls, failedToolCalls: 2 }));
  expectEq(r.executionDegradation?.errorCategory, 'TOOL_LOOP_DEGRADED', 'tool-failure category still wins');
});

test('TRUNCATED_NO_OUTPUT (R2/R4): a RECOVERED run (Layer-1 retry produced text, stopReason end_turn) does NOT classify as truncated', () => {
  // Post-Layer-1 the raw text + stopReason are the POST-retry values; a recovered run reads
  // end_turn + non-empty, so R2 must not fire (else keep-best Arm 3 + Layer 2 falsely fail a healthy leg).
  const r = assessExecutionQuality(baseInput({ text: 'recovered deliverable body', rawDeliverableText: 'recovered deliverable body', stopReason: 'end_turn' }));
  expectEq(r.executionDegradation, null, 'recovered run is clean, not TRUNCATED_NO_OUTPUT');
});

test('Pattern: TRUNCATED_NO_OUTPUT signal present + max_tokens/raw-empty gated in the shared cascade', () => {
  const qualitySource = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/execution-quality.ts'), 'utf8');
  if (!qualitySource.includes("errorCategory: 'TRUNCATED_NO_OUTPUT'")) throw new Error('TRUNCATED_NO_OUTPUT signal missing from execution-quality cascade');
  if (!qualitySource.includes("stopReason === 'max_tokens' && rawDeliverableEmpty")) throw new Error('TRUNCATED_NO_OUTPUT must gate on max_tokens AND raw-empty');
});

test('P8: PIPELINE task with incomplete CREATE transcript → protocolValidation + PROTOCOL_STEP_SKIPPED', () => {
  const calls = [call(true, undefined, 'stage.create'), call(true, undefined, 'task.create')];
  const r = assessExecutionQuality(baseInput({
    toolCallResults: calls, failedToolCalls: 0,
    task: { id: 'cmh5taskid12345', type: 'PIPELINE' },
  }));
  if (!r.protocolValidation) throw new Error('protocolValidation should be populated for an incomplete CREATE transcript');
  expectEq(r.protocolValidation.mode, 'CREATE', 'mode');
  if (r.protocolValidation.missingSteps.length === 0) throw new Error('expected missing steps');
  expectEq(r.executionDegradation?.errorCategory, 'PROTOCOL_STEP_SKIPPED', 'category');
});

test('P8: protocolValidation facts populated even when another category claimed errorCategory', () => {
  const calls = [
    call(true, undefined, 'stage.create'), call(true, undefined, 'task.create'),
    call(false, 'x'), call(false, 'x'),
  ];
  const r = assessExecutionQuality(baseInput({
    toolCallResults: calls, failedToolCalls: 2,
    task: { id: 'cmh5taskid12345', type: 'PIPELINE' },
  }));
  expectEq(r.executionDegradation?.errorCategory, 'TOOL_LOOP_DEGRADED', 'category');
  if (!r.protocolValidation) throw new Error('protocolValidation facts must co-occur');
});

test('P8: does not run for non-PIPELINE tasks', () => {
  const calls = [call(true, undefined, 'stage.create'), call(true, undefined, 'task.create')];
  const r = assessExecutionQuality(baseInput({ toolCallResults: calls, task: { id: 't', type: 'AGENT' } }));
  expectEq(r.protocolValidation, null, 'protocolValidation');
});

test('logger: canonical warn fired with engine field set (P4 case)', () => {
  const logs: Array<{ obj: Record<string, unknown>; msg: string }> = [];
  const calls = [call(false, 'x'), call(false, 'x')];
  assessExecutionQuality(baseInput({
    toolCallResults: calls, failedToolCalls: 2,
    logger: { warn: (obj, msg) => logs.push({ obj, msg }) },
  }));
  expectEq(logs.length, 1, 'log count');
  expectEq(logs[0].msg, 'Execution degraded: consecutive tail failures in tool loop', 'msg');
  expectEq(logs[0].obj.totalToolCalls, 2, 'totalToolCalls field');
});

// ---------- Layer 1: pattern ----------

const engineSource = fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');
const streamSource = fs.readFileSync(path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts'), 'utf8');
// Phase 6: the engine path's post-loop (quality cascade + content-validation guard) moved into the
// shared core; the engine DELEGATES. Engine-path pattern pins retarget to the core.
const coreSource = fs.readFileSync(path.join(__dirname, '../lib/services/execution-core.ts'), 'utf8');

test('Pattern: the core calls assessExecutionQuality; both adapters delegate', () => {
  if (!coreSource.includes('assessExecutionQuality(')) throw new Error('core does not call assessExecutionQuality');
  // Phase 6b: both adapters now delegate — neither calls the cascade inline.
  if (streamSource.includes('assessExecutionQuality(')) throw new Error('stream re-introduced an inline assessExecutionQuality call (should delegate to the core)');
  if (!streamSource.includes('runExecutionCore(')) throw new Error('stream does not route through runExecutionCore');
});

test('Pattern: inline cascade copies are GONE from both files', () => {
  for (const [name, src] of [['engine', engineSource], ['stream', streamSource]] as const) {
    if (src.includes('inabilityPatterns')) throw new Error(`${name}: inline P7 pattern list re-introduced`);
    if (src.includes("errorCategory: 'TOOL_LOOP_DEGRADED'")) throw new Error(`${name}: inline P4 branch re-introduced`);
    if (src.includes('_templateMismatchPattern')) throw new Error(`${name}: inline P10 marker re-introduced`);
    if (src.includes('validatePipelineProtocolSteps(')) throw new Error(`${name}: inline P8 wiring re-introduced (the shared module owns it)`);
  }
});

test('Pattern: content-validation guard is engine-canonical (M3 — conjunct + apiError + message), core-owned', () => {
  // Phase 6b: BOTH adapters' guards moved into the shared core — the core is the ONE M3 site.
  for (const [name, src] of [['core', coreSource]] as const) {
    if (!src.includes('toolCallResults.length === 0')) throw new Error(`${name}: content-validation conjunct (toolCallResults.length === 0) missing — M3 regression`);
    if (!src.includes('apiErrorMessage')) throw new Error(`${name}: apiError enrichment missing from content-validation diag — M3 regression`);
    if (!src.includes('with no tool calls')) throw new Error(`${name}: engine-canonical throw message ("with no tool calls") missing — M3 regression`);
  }
  // The stream no longer carries an inline M3 guard.
  if (streamSource.includes('with no tool calls')) throw new Error('stream re-introduced an inline M3 content-validation guard (should delegate to the core)');
});

test('Pattern: EMPTY_DELIVERABLE companion signal present + NON-PIPELINE scoped in the shared cascade', () => {
  const qualitySource = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/execution-quality.ts'), 'utf8');
  if (!qualitySource.includes("errorCategory: 'EMPTY_DELIVERABLE'")) throw new Error('EMPTY_DELIVERABLE signal missing from execution-quality cascade');
  if (!qualitySource.includes("task.type !== 'PIPELINE'")) throw new Error('EMPTY_DELIVERABLE must be NON-PIPELINE scoped');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
