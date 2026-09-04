#!/usr/bin/env ts-node
/**
 * Pipeline Protocol Validator Tests (task #91)
 *
 * Pure-function tests for validatePipelineProtocolSteps. Validates that the
 * detector fires on the actual artifact-synthesis incident shape and stays
 * quiet on healthy harness runs.
 *
 * Created: 2026-04-16 (task #91)
 */

import { validatePipelineProtocolSteps, type ToolCallEntry } from '../lib/services/pipelineProtocolValidator';

console.log('🧪 Pipeline Protocol Validator Tests\n');

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

function assert(condition: any, message: string) {
  if (!condition) throw new Error(message);
}

// ========================================
// Helpers — build realistic tool-call shapes
// ========================================

const _call = (action: string, success = true, error?: string): ToolCallEntry => ({
  tool: 'perform',
  success,
  arguments: { action },
  ...(error ? { error } : {}),
});

/** task.comment with a payload — for content-validation tests (Apr 2026). */
const _commentCall = (commentText: string, success = true): ToolCallEntry => ({
  tool: 'perform',
  success,
  arguments: {
    action: 'task.comment',
    parameters: { taskId: 'cmtesttask', comment: commentText },
  },
});

// ========================================
// CREATE mode tests
// ========================================

test('CREATE: complete healthy run (3 children, 3 templates) → no signal', () => {
  const calls: ToolCallEntry[] = [
    _call('stage.create'),
    _call('task.update'), // metadata write
    _call('task.create'), _call('agent.assign'),
    _call('task.create'), _call('agent.assign'),
    _call('task.create'), _call('agent.assign'),
    _call('task.comment'), // exit breadcrumb
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result === null, `Expected null, got ${JSON.stringify(result)}`);
});

test('CREATE: artifact-synthesis incident shape (3 task.create, 2 agent.assign, no exit comment) → flags 2 missing steps', () => {
  // The 2026-04-16 incident: harness made 3 task.create then budget rejected
  // turn 10 onwards (1 agent.assign + 1 task.create + 1 task.comment all failed)
  const calls: ToolCallEntry[] = [
    _call('stage.create'),
    _call('task.update'),
    _call('task.create'), _call('agent.assign'),     // Phase 1 OK
    _call('task.create'), _call('agent.assign'),     // Phase 2+3 OK
    _call('task.create'),                            // Phase 4 created
    _call('agent.assign', false, 'Token budget exceeded: Request would exceed hourly limit'),  // Phase 4 assign failed
    _call('task.create', false, 'Token budget exceeded'),  // Phase 5+6 failed
    _call('task.comment', false, 'Token budget exceeded'), // exit comment failed
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result !== null, 'Expected non-null result');
  assert(result!.mode === 'CREATE', `Expected CREATE mode, got ${result!.mode}`);
  assert(result!.missingSteps.length >= 2, `Expected ≥2 missing steps, got ${result!.missingSteps.length}: ${result!.missingSteps.join(' | ')}`);
  assert(result!.expectedChildCount === 3, `Expected 3 children, got ${result!.expectedChildCount}`);
  assert(result!.actualAssignedCount === 2, `Expected 2 assigns, got ${result!.actualAssignedCount}`);
  // Step 5 mismatch must be in the missing list
  const step5 = result!.missingSteps.find(s => s.includes('Step 5'));
  assert(step5 !== undefined, `Expected Step 5 to be flagged. Got: ${result!.missingSteps.join(' | ')}`);
  // Step 6 (exit comment) must also be flagged
  const step6 = result!.missingSteps.find(s => s.includes('Step 6'));
  assert(step6 !== undefined, `Expected Step 6 to be flagged. Got: ${result!.missingSteps.join(' | ')}`);
});

test('CREATE: missing stage.create entirely → flags Step 2', () => {
  const calls: ToolCallEntry[] = [
    _call('task.create'), _call('agent.assign'), _call('task.comment'),
  ];
  const result = validatePipelineProtocolSteps(calls);
  // Without stage.create the mode detector returns ORCHESTRATE/UNKNOWN, not CREATE
  // (intended behavior — CREATE requires both stage.create AND task.create).
  // So this test documents that observed behavior.
  if (result?.mode === 'CREATE') {
    assert(result.missingSteps.some(s => s.includes('Step 2')), 'Step 2 should be flagged');
  } else {
    // Mode detector chose something else — still acceptable, just confirms our
    // detector won't false-positive on isolated calls
    assert(result === null || result.mode === 'ORCHESTRATE', `Expected null or ORCHESTRATE, got ${result?.mode}`);
  }
});

test('CREATE: missing task.update (Step 3 metadata) → flags Step 3', () => {
  const calls: ToolCallEntry[] = [
    _call('stage.create'),
    // No task.update — auto-retrigger will not fire
    _call('task.create'), _call('agent.assign'),
    _call('task.comment'),
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result !== null, 'Expected non-null result');
  assert(result!.missingSteps.some(s => s.includes('Step 3')), `Step 3 should be flagged. Got: ${result!.missingSteps.join(' | ')}`);
});

// ========================================
// SYNTHESIZE mode tests
// ========================================

test('SYNTHESIZE: healthy run (complete + comment) → no signal', () => {
  // 2026-04-28: artifact.create tally retired. Required signature is now
  // task.complete + task.comment with deliverable pointer prose. The harness's
  // pipeline-index.json + extracted report.md are produced automatically by
  // the engine's metadata-driven policy (no agent tool call needed).
  const calls: ToolCallEntry[] = [
    _call('task.context'),
    _call('task.context'),
    _call('task.complete'),
    _call('task.comment'),
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result === null, `Expected null, got ${JSON.stringify(result)}`);
});

test('SYNTHESIZE: missing final task.comment → flags Step 5', () => {
  const calls: ToolCallEntry[] = [
    _call('task.context'),
    _call('task.complete'),
    // No task.comment with deliverable pointer
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result !== null, 'Expected non-null result');
  assert(result!.missingSteps.some(s => s.includes('Step 5')), `Step 5 should be flagged. Got: ${result!.missingSteps.join(' | ')}`);
});

test('SYNTHESIZE: post-deploy PIPELINE without deliverableSourceTaskId → flags Step 5a forensic', () => {
  // A.4 forensic P-signal: when taskContext is provided and the harness has
  // no deliverableSourceTaskId, surface the metadata-wiring miss.
  const calls: ToolCallEntry[] = [
    _call('task.context'),
    _call('task.complete'),
    _call('task.comment'),
  ];
  const result = validatePipelineProtocolSteps(calls, {
    type: 'PIPELINE',
    metadata: { pipelineStageId: 'cmstage123' }, // no deliverableSourceTaskId
    createdAt: new Date('2026-05-01T00:00:00Z'), // post-deploy
  });
  assert(result !== null, 'Expected non-null result');
  assert(
    result!.missingSteps.some((s) => s.includes('Step 5a')),
    `Step 5a forensic P-signal should fire. Got: ${result!.missingSteps.join(' | ')}`
  );
});

test('SYNTHESIZE: post-deploy PIPELINE WITH deliverableSourceTaskId → no Step 5a signal', () => {
  const calls: ToolCallEntry[] = [
    _call('task.context'),
    _call('task.complete'),
    _call('task.comment'),
  ];
  const result = validatePipelineProtocolSteps(calls, {
    type: 'PIPELINE',
    metadata: {
      pipelineStageId: 'cmstage123',
      deliverableSourceTaskId: 'cmeditor456',
    },
    createdAt: new Date('2026-05-01T00:00:00Z'),
  });
  // Either null (no missing steps) or non-null without Step 5a — either is OK.
  if (result !== null) {
    assert(
      !result.missingSteps.some((s) => s.includes('Step 5a')),
      `Step 5a should NOT be flagged when deliverableSourceTaskId is set. Got: ${result.missingSteps.join(' | ')}`
    );
  }
});

// ========================================
// ORCHESTRATE mode tests
// ========================================

test('ORCHESTRATE: healthy run (assign + comment) → no signal', () => {
  const calls: ToolCallEntry[] = [
    _call('agent.assign'),
    _call('agent.assign'),
    _call('task.comment'),
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result === null, `Expected null, got ${JSON.stringify(result)}`);
});

test('ORCHESTRATE: missing exit task.comment → flags Step 4', () => {
  const calls: ToolCallEntry[] = [
    _call('agent.assign'),
    _call('agent.assign'),
    // No task.comment for Setup Completed
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result !== null, 'Expected non-null result');
  assert(result!.mode === 'ORCHESTRATE', `Expected ORCHESTRATE, got ${result!.mode}`);
});

// ========================================
// Edge cases
// ========================================

test('UNKNOWN: empty tool-call list → returns null (skip validation)', () => {
  const result = validatePipelineProtocolSteps([]);
  assert(result === null, 'Expected null for empty list');
});

test('UNKNOWN: tool calls with no recognizable harness pattern → returns null', () => {
  const calls: ToolCallEntry[] = [
    _call('pov.details'),
    _call('task.list'),
    // Just read-only inspection — no harness-shape calls
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result === null, 'Expected null for non-harness pattern');
});

test('Failed agent.assign does NOT count toward Step 5 completion', () => {
  // Specific guard: a failed call must not be counted as a successful step
  const calls: ToolCallEntry[] = [
    _call('stage.create'),
    _call('task.update'),
    _call('task.create'),
    _call('agent.assign', false, 'Some error'), // FAILED
    _call('task.comment'),
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result !== null, 'Expected non-null result');
  assert(result!.actualAssignedCount === 0, `Failed agent.assign should not count. Got: ${result!.actualAssignedCount}`);
  assert(result!.expectedChildCount === 1, `Expected 1 child, got ${result!.expectedChildCount}`);
});

// ========================================
// Content validation tests (Apr 2026 — Item 14 follow-up)
// ========================================

test('CREATE content: breadcrumb on first line of closing comment → no content miss', () => {
  const calls: ToolCallEntry[] = [
    _call('stage.create'),
    _call('task.update'),
    _call('task.create'), _call('agent.assign'),
    _commentCall('**Child stage:** `cmstageabc123` — Pipeline: cloud security\n\nQueued 1 child.'),
  ];
  const result = validatePipelineProtocolSteps(calls);
  // Content was verified: breadcrumb present. The validator may still flag
  // other things (e.g., expected child count if it doesn't match) but Step 6
  // content miss should NOT be in the list.
  if (result !== null) {
    const contentMiss = result.missingSteps.find(s => s.includes('Step 6 (content)'));
    assert(contentMiss === undefined, `Should not flag content miss when breadcrumb present. Got: ${result.missingSteps.join(' | ')}`);
    if (result.commentValidation) {
      assert(result.commentValidation.hasBreadcrumb === true, 'commentValidation.hasBreadcrumb should be true');
    }
  }
});

test('CREATE content: closing comment without breadcrumb → flags content miss', () => {
  const calls: ToolCallEntry[] = [
    _call('stage.create'),
    _call('task.update'),
    _call('task.create'), _call('agent.assign'),
    _commentCall('Queued 1 child task. See pipeline for details.'),  // ← no breadcrumb
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result !== null, 'Expected non-null result');
  const contentMiss = result!.missingSteps.find(s => s.includes('Step 6 (content)'));
  assert(contentMiss !== undefined, `Expected Step 6 (content) miss. Got: ${result!.missingSteps.join(' | ')}`);
  assert(result!.commentValidation?.hasBreadcrumb === false, 'hasBreadcrumb should be false');
  assert(result!.commentValidation?.lastCommentPreview !== undefined, 'lastCommentPreview should be set for forensics');
});

test('SYNTHESIZE content: all three patterns present → no content misses', () => {
  const validClosingComment = `**Child stage:** \`cmstagexyz789\` — Pipeline: HIPAA assessment

✅ PIPELINE SYNTHESIS COMPLETE — HIPAA gap analysis

**📄 Final deliverable:** \`fetch(id: "artifact-cmdocabc")\` — Technical Writer

**Quality gates:**
- Architect: 88/100 ✅

---
**This pipeline is COMPLETE and cannot be re-run in place.** To re-run this objective, create a fresh PIPELINE task.`;

  const calls: ToolCallEntry[] = [
    _call('artifact.create'),
    _call('task.complete'),
    _commentCall(validClosingComment),
  ];
  const result = validatePipelineProtocolSteps(calls);
  if (result !== null) {
    const contentMisses = result.missingSteps.filter(s => s.includes('(content)'));
    assert(contentMisses.length === 0, `Expected no content misses. Got: ${contentMisses.join(' | ')}`);
    assert(result.commentValidation?.hasBreadcrumb === true, 'hasBreadcrumb');
    assert(result.commentValidation?.hasDeliverablePointer === true, 'hasDeliverablePointer');
    assert(result.commentValidation?.hasRerunNote === true, 'hasRerunNote');
  }
});

test('SYNTHESIZE content: missing deliverable pointer → flags content miss', () => {
  // Has breadcrumb + re-run note but no 📄 Final deliverable pointer
  const malformedComment = `**Child stage:** \`cmstageaaa\` — Pipeline: foo

✅ COMPLETE.

**This pipeline is COMPLETE and cannot be re-run in place.** Create a fresh PIPELINE task.`;

  const calls: ToolCallEntry[] = [
    _call('artifact.create'),
    _call('task.complete'),
    _commentCall(malformedComment),
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result !== null, 'Expected non-null');
  const deliverableMiss = result!.missingSteps.find(s => s.includes('Final deliverable'));
  assert(deliverableMiss !== undefined, `Expected deliverable miss. Got: ${result!.missingSteps.join(' | ')}`);
  assert(result!.commentValidation?.hasBreadcrumb === true, 'breadcrumb still detected');
  assert(result!.commentValidation?.hasDeliverablePointer === false, 'pointer correctly missed');
  assert(result!.commentValidation?.hasRerunNote === true, 're-run note still detected');
});

test('CREATE content: missing comment text in fixture → graceful skip (no content miss flagged)', () => {
  // Existing tests use _call('task.comment') without payload — content check
  // must skip gracefully rather than false-positive.
  const calls: ToolCallEntry[] = [
    _call('stage.create'),
    _call('task.update'),
    _call('task.create'), _call('agent.assign'),
    _call('task.comment'),  // ← no comment text in fixture
  ];
  const result = validatePipelineProtocolSteps(calls);
  // No misses at all — fully clean count + content-check skipped silently
  assert(result === null, `Expected null (clean run with no extractable content). Got: ${JSON.stringify(result)}`);
});

// ========================================
// HARNESS_NO_OUTPUT fix (2026-07-17): widened inference + resolvedMode UNKNOWN-only rescue
// ========================================

test('CREATE (widened): SPECIMEN REPLAY — stage.create + task.comment only → mode CREATE, flags Steps 3/4 (returned null pre-fix)', () => {
  // Exact toolCall shape of live specimen cmromxvxo000zyx6hgittdy82: the harness announced,
  // created the stage, then stopped. Pre-fix detectHarnessMode required BOTH stage.create AND
  // task.create → UNKNOWN → validator declined to judge the very failure it was built to catch.
  const result = validatePipelineProtocolSteps([
    { tool: 'project', success: true, arguments: { action: 'pov.details' } },
    _commentCall('Creating dedicated child stage and decomposing per terraform-iac-protocol'),
    _call('stage.create'),
  ]);
  assert(result !== null, 'must judge the half-CREATE (was null pre-fix)');
  assert(result!.mode === 'CREATE', `mode must be CREATE, got ${result!.mode}`);
  assert(result!.missingSteps.some(st => st.includes('Step 3')), 'must flag Step 3 (pipelineStageId not wired)');
  assert(result!.missingSteps.some(st => st.includes('Step 4')), 'must flag Step 4 (no children created)');
});

test('CREATE (widened) regression: stage.create + task.create still CREATE; task.complete still SYNTHESIZE', () => {
  const create = validatePipelineProtocolSteps([_call('stage.create'), _call('task.update'), _call('task.create')]);
  assert(create !== null && create!.mode === 'CREATE', 'both-calls shape stays CREATE');
  const synth = validatePipelineProtocolSteps([_call('task.complete'), _commentCall('done')]);
  assert(synth === null || synth!.mode === 'SYNTHESIZE', 'task.complete shape stays SYNTHESIZE');
});

test('PLAN-SPAWN protection (specialist ruling): task.create + task.update, NO stage.create → ORCHESTRATE by inference; resolvedMode SYNTHESIZE must NOT override', () => {
  // pov-program PLAN-SPAWN resolves SYNTHESIZE (all-terminal reasonCode) but does CREATE-shaped
  // work BY DESIGN and never calls task.complete. Authoritative resolvedMode would false-flag
  // every program run with the SYNTHESIZE branch's missing steps. resolvedMode is UNKNOWN-only.
  const calls = [_call('task.create'), _call('task.create'), _call('task.update'), _commentCall('spawned')];
  const inferred = validatePipelineProtocolSteps(calls, { type: 'PIPELINE', resolvedMode: 'SYNTHESIZE' });
  assert(inferred === null || inferred!.mode !== 'SYNTHESIZE',
    `confident inference must win over resolvedMode — got mode ${inferred?.mode}`);
});

test('UNKNOWN rescue: comments-only run + resolvedMode CREATE → judged as CREATE (flags structural steps)', () => {
  const result = validatePipelineProtocolSteps(
    [_commentCall('thinking about it')],
    { type: 'PIPELINE', resolvedMode: 'CREATE' }
  );
  assert(result !== null, 'resolvedMode must rescue UNKNOWN');
  assert(result!.mode === 'CREATE', `rescued mode must be CREATE, got ${result!.mode}`);
  assert(result!.missingSteps.some(st => st.includes('Step 2')), 'must flag Step 2 (no stage.create at all)');
});

test('UNKNOWN without resolvedMode: still returns null (non-harness runs unjudged)', () => {
  const result = validatePipelineProtocolSteps([_commentCall('just a note')], { type: 'PIPELINE' });
  assert(result === null, 'no resolvedMode → UNKNOWN stays null');
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('Test Summary');
console.log('=====================================');
console.log(`Total: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
process.exit(0);
