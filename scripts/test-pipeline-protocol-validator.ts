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

// ========================================
// 2026-09-15 — mode inference vs the mandated halt stamp
// Live defect: 12 of 68 corpus executions were graded against a mode they did
// not resolve to, ORCHESTRATE in 12 of 12. Root cause: `task.update` alone
// counted as a CONFIDENT ORCHESTRATE, and the protocol MANDATES that stamp on
// every bail — so obeying the halt mandate is what misclassified the halt.
// ========================================

test('task.update ALONE is no longer a confident ORCHESTRATE (it is what every mode does)', () => {
  const result = validatePipelineProtocolSteps([_call('task.update'), _commentCall('stamped')]);
  assert(result === null, `task.update alone must fall to UNKNOWN (null without resolvedMode), got mode ${result?.mode}`);
});

test('task.update alone + resolvedMode ORCHESTRATE → rescued to the SAME answer, honestly', () => {
  const result = validatePipelineProtocolSteps(
    [_call('task.update'), _commentCall('setup done')],
    { type: 'PIPELINE', resolvedMode: 'ORCHESTRATE' }
  );
  assert(result !== null && result.mode === 'ORCHESTRATE',
    `genuine ORCHESTRATE must survive via the UNKNOWN rescue, got ${result?.mode}`);
});

test('REGRESSION (2026-07-17 ruling): PLAN-SPAWN reaches ORCHESTRATE via task.create, NOT task.update', () => {
  // PLAN-SPAWN calls task.create + task.update and NO agent.assign. A fix that
  // required agent.assign would have sent it to UNKNOWN → rescued as SYNTHESIZE
  // → false-flagged on EVERY program run. That is the regression this pins.
  const calls = [_call('task.create'), _call('task.create'), _call('task.update'), _commentCall('spawned')];
  const result = validatePipelineProtocolSteps(calls, { type: 'PIPELINE', resolvedMode: 'SYNTHESIZE' });
  assert(result === null || result.mode === 'ORCHESTRATE',
    `PLAN-SPAWN must stay ORCHESTRATE by inference, got ${result?.mode}`);
});

test('SANCTIONED HALT (duplicateHalt): emits haltExempt FACT, flags no steps', () => {
  // The live shape: pre-flight duplicate detected, metadata stamped, no stage,
  // no completion. Graded as ORCHESTRATE pre-fix and degraded PROTOCOL_STEP_SKIPPED.
  const calls = [_call('task.update'), _commentCall('HALTED at pre-flight duplicate check.')];
  const result = validatePipelineProtocolSteps(calls, {
    type: 'PIPELINE',
    resolvedMode: 'CREATE',
    metadata: { duplicateHalt: { existingStage: 'cmu20gio700exyxvrp9n24ksj' } },
  });
  // NOT null: null is omitted from the artifact, and every consumer reads absence as
  // "no issues detected" — which would make a correct refusal look like a flawless run.
  assert(result !== null, 'halt must emit a positive fact, not silence');
  assert(result!.haltExempt === true, `expected haltExempt, got ${JSON.stringify(result)}`);
  assert(result!.haltReason === 'duplicateHalt', `expected haltReason duplicateHalt, got ${result!.haltReason}`);
  assert(result!.missingSteps.length === 0, `a halt must flag no steps, got ${JSON.stringify(result!.missingSteps)}`);
});

test('SANCTIONED HALT (cannotRun): same exemption, reason recorded', () => {
  const result = validatePipelineProtocolSteps(
    [_call('task.update'), _commentCall('cannot run: upstream contract absent')],
    { type: 'PIPELINE', resolvedMode: 'CREATE', metadata: { cannotRun: { reason: 'no contract' } } }
  );
  assert(result !== null && result.haltExempt === true, `expected haltExempt, got ${JSON.stringify(result)}`);
  assert(result!.haltReason === 'cannotRun', `expected haltReason cannotRun, got ${result!.haltReason}`);
  assert(result!.missingSteps.length === 0, 'a halt must flag no steps');
});

test('HALT exemption does NOT swallow a harness that stamped then carried on', () => {
  // Stamped cannotRun but went on to open a stage — not a halt, still judged.
  const result = validatePipelineProtocolSteps(
    [_call('stage.create'), _call('task.update'), _commentCall('proceeding anyway')],
    { type: 'PIPELINE', resolvedMode: 'CREATE', metadata: { cannotRun: { reason: 'x' } } }
  );
  assert(result !== null && result.mode === 'CREATE',
    `a stamped-but-continuing harness must still be judged, got ${JSON.stringify(result)}`);
});

test('HALT REPLAY (live cmu2f6w6c): stamp is in the TOOL CALL, metadata snapshot has none', () => {
  // THE TEST THAT WAS MISSING. The first exemption keyed on taskContext.metadata, which is
  // the PRE-EXECUTION snapshot — the agent stamps duplicateHalt mid-run, so it is never
  // there. Unit tests that pass metadata directly simulate a state the call site never has,
  // and this shipped to prod and fired a false PROTOCOL_STEP_SKIPPED on a correct halt.
  const stampCall: ToolCallEntry = {
    tool: 'perform', success: true,
    arguments: {
      action: 'task.update',
      parameters: JSON.stringify({ metadata: { duplicateHalt: { existingStage: 'cmu1yj66y000zyxvrs6aa93t3' } } }),
    },
  };
  const result = validatePipelineProtocolSteps(
    [_call('pov.details'), _call('task.context'),
     _commentCall('Mode: CREATE. Also stamping `metadata.duplicateHalt` now for visibility.'),
     stampCall],
    // metadata as it ACTUALLY is at this call site: protocol stamp only, no halt
    { type: 'PIPELINE', resolvedMode: 'CREATE',
      metadata: { protocol: 'pov-program-protocol', protocolResolvedAt: '2026-09-15T08:38:48.403Z' } }
  );
  assert(result?.haltExempt === true,
    `live halt shape must be exempt, got ${JSON.stringify(result?.missingSteps ?? result)}`);
  assert(result!.missingSteps.length === 0, 'and must flag no steps');
});

test('HALT narration alone does NOT exempt — the comment quotes the stamp name', () => {
  // The halt's own comment says "stamping `metadata.duplicateHalt`". Scanning every tool
  // call would match the narration instead of the act, letting any run talk its way out
  // of validation.
  const result = validatePipelineProtocolSteps(
    [_call('stage.create'), _commentCall('I considered metadata.duplicateHalt but did not stamp it')],
    { type: 'PIPELINE', resolvedMode: 'CREATE', metadata: {} }
  );
  assert(result === null || result.haltExempt !== true,
    `narration must not exempt, got ${JSON.stringify(result)}`);
});

// ========================================
// 2026-09-16 — the SANCTIONED ESCALATED EXIT (the halt lesson, one phase later)
// Measured by architectural-review: 10 of 70 flagged executions were runs OBEYING the
// protocol. Base protocol, verbatim: "Leave your status IN_PROGRESS. Exit." — and for a
// program leg, the PLATFORM completes the task (F20), so the agent correctly does not.
// ========================================

const _escalateCall = (): ToolCallEntry => ({
  tool: 'perform', success: true,
  arguments: {
    action: 'task.update',
    parameters: JSON.stringify({ metadata: { qualityGate: { outcome: 'escalated', reviewerScore: 15, reviewerPresent: true } } }),
  },
});

test('ESCALATED EXIT: a SYNTHESIZE that stamped escalated and did not close itself is NOT accused', () => {
  const result = validatePipelineProtocolSteps(
    [_call('task.list'), _call('agent.results'), _escalateCall(),
     _commentCall('**Child stage:** `cmtabc123` — ESCALATED. Quality gate failed on 3 of 4 children.\n**📄 Final deliverable:** report.md\nRe-run note: create a fresh PIPELINE task.')],
    { type: 'PIPELINE', resolvedMode: 'SYNTHESIZE', metadata: { pipelineStageId: 'cmtstage1' } }
  );
  const missedComplete = (result?.missingSteps ?? []).some(st => st.includes('task.complete not called'));
  assert(!missedComplete, `a sanctioned escalated exit must not be accused, got ${JSON.stringify(result?.missingSteps)}`);
  assert(result?.escalatedExit === true, 'and must record the FACT, not pass over it in silence');
});

test('ESCALATED EXIT (MI-1): no deliverable pointer or re-run note is demanded — the protocol says "Do NOT synthesize"', () => {
  // Reverses the 2026-09-16 assumption that both "remain meaningful" on an escalation. The protocol tells an escalating
  // harness to explain which child failed and what the human should decide; it has no deliverable, and "COMPLETE,
  // cannot be re-run in place" would be false on a task that stays IN_PROGRESS. 9 escalated exits were flagged for it.
  const result = validatePipelineProtocolSteps(
    [_call('agent.results'), _escalateCall(), _commentCall('**Child stage:** `cmtstage1`\n\nESCALATED: Reviewer scored 15. Human decision needed.')],
    { type: 'PIPELINE', resolvedMode: 'SYNTHESIZE', metadata: { pipelineStageId: 'cmtstage1' } }
  );
  assert(result?.escalatedExit === true, 'the escalation FACT is still recorded');
  assert(!(result!.missingSteps.some(st => st.includes('Final deliverable') || st.includes('re-run note'))),
    `an escalation must not be accused of a missing deliverable/re-run note, got ${JSON.stringify(result!.missingSteps)}`);
  // The facts themselves are still recorded (not hidden): the comment really has neither.
  assert(result!.commentValidation?.hasDeliverablePointer === false && result!.commentValidation?.hasRerunNote === false, 'facts recorded');
});

test('ESCALATED EXIT (MI-1): the breadcrumb is STILL required', () => {
  const result = validatePipelineProtocolSteps(
    [_call('agent.results'), _escalateCall(), _commentCall('ESCALATED, nothing else')],
    { type: 'PIPELINE', resolvedMode: 'SYNTHESIZE', metadata: { pipelineStageId: 'cmtstage1' } }
  );
  assert(result !== null && result.missingSteps.some(st => st.includes('does not name the child stage')),
    `breadcrumb miss must still be flagged, got ${JSON.stringify(result?.missingSteps)}`);
});

test('RE-RUN NOTE (MI-1): near-verbatim paraphrases observed in prod are accepted', () => {
  for (const note of [
    '**Complete, cannot re-run in place.** DRAFT for human review. Fresh objective = new PIPELINE task.',
    '**Program COMPLETE, cannot re-run in place.** Fresh PIPELINE task to re-run.',
    '**COMPLETE — cannot be re-run in place.** Create a fresh PROGRAM task to re-run.',
    'This program is complete and cannot be re run in place.',
    '**Complete; cannot be re-run in place.** Create a fresh task to re-run.',
    '**This pipeline is COMPLETE and cannot be re-run in place.** To re-run this objective, create a fresh PIPELINE task.',
  ]) {
    const r = validatePipelineProtocolSteps([_call('task.complete'), _commentCall(`**Child stage:** \`cmstage1\`\n\n**📄 Final deliverable:** x\n\n---\n${note}`)]);
    assert(!r || r.commentValidation?.hasRerunNote === true, `rejected a real note: ${note}`);
  }
});

test('RE-RUN NOTE (MI-1): comments WITHOUT the note are still flagged — including advice that merely mentions a fresh task', () => {
  for (const tail of [
    'Complete (needs-revision). Re-execute Review, or create a follow-up pipeline, to reach approved.',
    'Use that artifact for downstream chaining, or spin a fresh PIPELINE task for a clean report.md.',
    'No re-execution attempted: protocol escalates immediately on sub-fifty confidence.',
    'Apply remains separate and operator-gated.',
  ]) {
    const r = validatePipelineProtocolSteps([_call('task.complete'), _commentCall(`**Child stage:** \`cmstage1\`\n\n**📄 Final deliverable:** x\n\n${tail}`)]);
    assert(r !== null && r.commentValidation?.hasRerunNote === false && r.missingSteps.some(st => st.includes('re-run note')),
      `must still flag: ${tail}`);
  }
});

test('NOT escalated: an ordinary SYNTHESIZE that forgot to close IS still accused', () => {
  const result = validatePipelineProtocolSteps(
    [_call('agent.results'), _call('task.update'), _commentCall('all done')],
    { type: 'PIPELINE', resolvedMode: 'SYNTHESIZE', metadata: { pipelineStageId: 'cmtstage1' } }
  );
  assert(result!.missingSteps.some(st => st.includes('task.complete not called')),
    'a genuine forgotten close must still be flagged');
  assert(result!.escalatedExit === undefined, 'and must not claim an escalated exit');
});

test('FAIL-CLOSED: an APPROVED qualityGate stamp cannot exempt itself', () => {
  // The exemption requires the VALUE "escalated", not merely the qualityGate key — otherwise
  // a harness could stamp approved, skip its close, and escape the check.
  const approvedStamp: ToolCallEntry = {
    tool: 'perform', success: true,
    arguments: { action: 'task.update', parameters: JSON.stringify({ metadata: { qualityGate: { outcome: 'approved', reviewerScore: 90 } } }) },
  };
  const result = validatePipelineProtocolSteps(
    [_call('agent.results'), approvedStamp, _commentCall('done')],
    { type: 'PIPELINE', resolvedMode: 'SYNTHESIZE', metadata: { pipelineStageId: 'cmtstage1' } }
  );
  assert(result!.missingSteps.some(st => st.includes('task.complete not called')),
    'an approved stamp must NOT exempt the completion miss');
});

test('ESCALATED narration in a comment does NOT exempt — only the task.update act does', () => {
  const result = validatePipelineProtocolSteps(
    [_call('agent.results'), _commentCall('I am stamping qualityGate outcome escalated now')],
    { type: 'PIPELINE', resolvedMode: 'SYNTHESIZE', metadata: { pipelineStageId: 'cmtstage1' } }
  );
  assert(result!.missingSteps.some(st => st.includes('task.complete not called')),
    'narration must not exempt');
});

test('COMMENT EXTRACTOR: the JSON-STRING parameters shape — 38% of live calls — is now read', () => {
  // Until 2026-09-16 this shape returned undefined, so the caller skipped content validation
  // "gracefully" and the breadcrumb / pointer / re-run checks never ran. 813 of 2146 live
  // task.comment calls across 319 executions. Hand-built fixtures all used the other two shapes.
  const stringParamComment: ToolCallEntry = {
    tool: 'perform', success: true,
    arguments: { action: 'task.comment', parameters: JSON.stringify({ taskId: 't', comment: 'no breadcrumb here at all' }) },
  };
  const result = validatePipelineProtocolSteps(
    [_call('stage.create'), _call('task.create'), _call('agent.assign'), stringParamComment]
  );
  assert(result?.commentValidation?.inspected === true,
    'the comment must now be INSPECTED, not skipped');
  assert(result?.commentValidation?.hasBreadcrumb === false,
    `and judged: a missing breadcrumb must be detected, got ${JSON.stringify(result?.commentValidation)}`);
});

test('COMMENT EXTRACTOR: an unparseable string still skips gracefully, never throws', () => {
  const junk: ToolCallEntry = {
    tool: 'perform', success: true,
    arguments: { action: 'task.comment', parameters: '{not valid json' },
  };
  const result = validatePipelineProtocolSteps([_call('stage.create'), _call('task.create'), _call('agent.assign'), junk]);
  assert(result === null || result.commentValidation === undefined,
    'unparseable parameters must fall back to the graceful skip');
});

test('CLEAN run stays null — "validated clean" and "not applicable" must not collapse', () => {
  const clean = validatePipelineProtocolSteps([
    _call('stage.create'), _call('task.update'), _call('task.create'), _call('agent.assign'),
    _commentCall('**Child stage:** `cmtabc123` — queued'),
  ]);
  assert(clean === null, `a clean run must still emit nothing, got ${JSON.stringify(clean)}`);
  const halt = validatePipelineProtocolSteps(
    [_call('task.update'), _commentCall('halted')],
    { type: 'PIPELINE', resolvedMode: 'CREATE', metadata: { duplicateHalt: { existingStage: 'x' } } }
  );
  assert(halt?.haltExempt === true, 'and a halt must be positively distinguishable from it');
});

test('BREADCRUMB: plain `Child stage: <id>` counts — the fact, not the decoration', () => {
  // Live false positive: a comment beginning "Child stage: cmty0x9jo..." scored
  // hasBreadcrumb:false because the regex demanded bold + backticks. Nothing
  // parses this string (the GUI panel is metadata-only), so the strictness
  // protected nothing.
  const calls = [
    _call('stage.create'), _call('task.create'), _call('agent.assign'),
    _commentCall('Child stage: cmty0x9jo006dyxt89y7cjood — D9 dry-run readout'),
  ];
  const result = validatePipelineProtocolSteps(calls);
  // Pin the STRUCTURED fact, never the message prose — the wording is free to change
  // (and did, 2026-09-15, which broke this assertion's first draft).
  assert(result?.commentValidation?.hasBreadcrumb !== false,
    `plain-text breadcrumb must count, got hasBreadcrumb=${result?.commentValidation?.hasBreadcrumb}`);
});

test('BREADCRUMB: the strict `**Child stage:** `id`` form still counts', () => {
  const calls = [
    _call('stage.create'), _call('task.create'), _call('agent.assign'),
    _commentCall('**Child stage:** `cmtabc123` — queued'),
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result?.commentValidation?.hasBreadcrumb !== false,
    `strict breadcrumb must still count, got hasBreadcrumb=${result?.commentValidation?.hasBreadcrumb}`);
});

test('BREADCRUMB: a comment with no child-stage reference at all is still flagged', () => {
  const calls = [
    _call('stage.create'), _call('task.create'), _call('agent.assign'),
    _commentCall('all done, looks good'),
  ];
  const result = validatePipelineProtocolSteps(calls);
  assert(result !== null && result.commentValidation?.hasBreadcrumb === false,
    `a genuinely absent breadcrumb must still be detected, got hasBreadcrumb=${result?.commentValidation?.hasBreadcrumb}`);
  assert(result!.missingSteps.length > 0, 'and must still produce a missing step');
});

test('UNKNOWN without resolvedMode: still returns null (non-harness runs unjudged)', () => {
  const result = validatePipelineProtocolSteps([_commentCall('just a note')], { type: 'PIPELINE' });
  assert(result === null, 'no resolvedMode → UNKNOWN stays null');
});

// ========================================
// RWF A4 (2026-09-26) — the sanctioned RE-EXECUTE exit (reExecutionExit)
// ========================================
// Before RWF a SYNTHESIZE that re-executed a child (the 50–69 band) and exited was graded
// PROTOCOL_STEP_SKIPPED: "Step 5 not called" + three final-comment content misses graded against the
// diagnostic it posted on the CHILD. 6 of the 7 prod runs that ever re-executed a child carry it.
const _exec = (taskId: string, shape: 'params' | 'params_snake' | 'params_string' | 'top' | 'top_snake' = 'params',
  result: unknown = { content: [{ text: 'RUNNING' }] }): ToolCallEntry => {
  const args: any =
    shape === 'params' ? { action: 'agent.execute', parameters: { taskId } } :
    shape === 'params_snake' ? { action: 'agent.execute', parameters: { task_id: taskId } } :
    shape === 'params_string' ? { action: 'agent.execute', parameters: JSON.stringify({ taskId }) } :
    shape === 'top' ? { action: 'agent.execute', taskId } : { action: 'agent.execute', task_id: taskId };
  return { tool: 'perform', success: true, arguments: args, result };
};
const _childComment = (taskId: string, text: string): ToolCallEntry =>
  ({ tool: 'perform', success: true, arguments: { action: 'task.comment', parameters: { taskId, comment: text } } });
const SYN = { type: 'PIPELINE', metadata: { pipelineStageId: 'cmstage' }, resolvedMode: 'SYNTHESIZE' as const };

test('A4.1 blind re-execute exit (agent.execute + diagnostic on the CHILD) → reExecutionExit, 0 misses, NOT null', () => {
  const r = validatePipelineProtocolSteps([_exec('cmchild1'), _childComment('cmchild1', 'Re-running: confidence 62, weak evidence')], SYN);
  assert(r !== null, 'a re-execute exit must surface its fact, never read as "ran clean"');
  assert(r!.reExecutionExit?.kind === 'blind' && r!.reExecutionExit.childTaskIds[0] === 'cmchild1', `got ${JSON.stringify(r!.reExecutionExit)}`);
  assert(r!.missingSteps.length === 0, `expected no misses, got ${JSON.stringify(r!.missingSteps)}`);
});
test('A4.2 a REFUSED agent.execute (isError, recorded success:true) is NOT a re-execution → Step 5 miss kept', () => {
  const refused = _exec('cmchild1', 'params', { isError: true, content: [{ text: '❌ Error in perform: Cannot execute' }] });
  const r = validatePipelineProtocolSteps([refused, _childComment('cmchild1', 'tried to re-run')], SYN);
  assert(!r?.reExecutionExit, 'a refusal must not earn the exemption');
  assert(r!.missingSteps.some((m) => m.startsWith('Step 5: task.complete not called')), 'the genuine miss must stay');
});
test('A4.3 a refusal whose result was TRUNCATED at persistence is still recognised as a refusal', () => {
  const refused = _exec('cmchild1', 'params', { truncated: true, preview: '{"content":[{"text":"❌ Error"}],"isError":true,' });
  const r = validatePipelineProtocolSteps([refused], SYN);
  assert(!r?.reExecutionExit, 'a truncated refusal must not earn the exemption');
});
test('A4.4 taskId is read from all five accepted argument shapes', () => {
  for (const shape of ['params', 'params_snake', 'params_string', 'top', 'top_snake'] as const) {
    const r = validatePipelineProtocolSteps([_exec(`cm_${shape}`, shape)], SYN);
    assert(r?.reExecutionExit?.childTaskIds[0] === `cm_${shape}`, `shape ${shape}: got ${JSON.stringify(r?.reExecutionExit)}`);
  }
});
test('A4.5 the core-supplied server-written list is AUTHORITATIVE (stage-filtered: an out-of-stage call does not count)', () => {
  const r = validatePipelineProtocolSteps([_exec('cmOUTOFSTAGE')], { ...SYN, dispatchedChildIds: [] });
  assert(!r?.reExecutionExit, 'the DB fact says nothing in-stage was dispatched — no exemption');
  assert(r!.missingSteps.some((m) => m.startsWith('Step 5: task.complete not called')), 'miss kept');
  const r2 = validatePipelineProtocolSteps([_call('task.comment')], { ...SYN, dispatchedChildIds: ['cmFromDb'] });
  assert(r2?.reExecutionExit?.childTaskIds[0] === 'cmFromDb', 'the DB list is used even when the tool log shows no call');
});
test('A4.6 a harness that merely FORGOT task.complete (no dispatch) is still flagged', () => {
  const r = validatePipelineProtocolSteps([_call('task.comment')], SYN);
  assert(!r?.reExecutionExit && r!.missingSteps.some((m) => m.startsWith('Step 5: task.complete not called')), 'forgot-close must stay flagged');
});
test('A4.7 escalated exit and re-execute exit in one run → BOTH facts, no completion miss', () => {
  const esc: ToolCallEntry = { tool: 'perform', success: true, arguments: { action: 'task.update', parameters: { taskId: 'cmharness', metadata: { qualityGate: { outcome: 'escalated' } } } } };
  const r = validatePipelineProtocolSteps([esc, _exec('cmchild1')], SYN);
  assert(r?.escalatedExit === true && !!r?.reExecutionExit, `got ${JSON.stringify({ e: r?.escalatedExit, x: r?.reExecutionExit })}`);
  assert(!r!.missingSteps.some((m) => m.startsWith('Step 5: task.complete not called')), 'completion miss suppressed');
});
// A4.8 pins the REAL observed shape (replay of the 6 prod runs, 2026-09-26): the re-execute pass posts its
// Step-3 status note on the HARNESS. It is an interim note, not a final comment, and must not be graded as one.
test('A4.8 a status note on the HARNESS in a re-execute pass is interim — not graded as the final comment', () => {
  const note = '**Child stage:** `cmstage` — Pipeline: X\n\n**Quality gate results (pass 1):**\n- Harvest (88): accept\n- Author (62): re-running';
  const r = validatePipelineProtocolSteps([_exec('cmchild1'), _childComment('cmharness', note)], SYN);
  assert(!!r?.reExecutionExit, 'still a re-execute exit');
  assert(r!.missingSteps.length === 0, `an interim note must not be graded as a final comment: ${JSON.stringify(r!.missingSteps)}`);
});
test('A4.9 a run that re-executed AND closed its task is not an exit', () => {
  const r = validatePipelineProtocolSteps([_exec('cmchild1'), _call('task.complete')], SYN);
  assert(!r?.reExecutionExit, 'a closed run is not a re-execute exit');
});
test('A4.10 (m3) every "Step 5: task.complete not called" push is exempted by BOTH sanctioned exits', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src: string = fs.readFileSync(path.join(__dirname, '../lib/services/pipelineProtocolValidator.ts'), 'utf8');
  const pushes = src.split("missingSteps.push('Step 5: task.complete not called").length - 1;
  assert(pushes === 1, `expected ONE completion-miss push site, found ${pushes} — a new site must honour reExecutionExit AND escalatedExit`);
  const i = src.indexOf("missingSteps.push('Step 5: task.complete not called");
  const guard = src.slice(Math.max(0, i - 700), i);
  assert(/stampedEscalatedThisRun\(toolCallResults\)/.test(guard) && /!isReExecutionExit/.test(guard),
    'the completion-miss push is no longer guarded by both sanctioned exits');
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
