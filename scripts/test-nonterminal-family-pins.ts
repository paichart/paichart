#!/usr/bin/env ts-node
/**
 * Non-terminal-family source pins (F17/F18/F19/F20 + F10 + F21) — CI-safe, no DB.
 * Design: cline_docs/reviews/nonterminal-family-2026-07-16/synthesis.md
 * Behavioral proof (dev DB): scripts/test-f16-frozen-cone-behavioral.ts (F16 base) +
 * the T4f live re-run planned in PROGRAM-TEST-PLAN.md.
 */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
function test(desc: string, fn: () => void) {
  try { fn(); console.log(`✅ ${desc}`); passed++; }
  catch (e) { console.log(`❌ ${desc}\n   ${e instanceof Error ? e.message : e}`); failed++; }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const readySrc = read('lib/services/taskReadyReactorService.ts');
const execHandlerSrc = read('lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts');
const chainerSrc = read('lib/agents/harness/context-chainer.ts');
const persistSrc = read('lib/services/execution-terminal-persist.ts');
const guardSrc = read('lib/agents/harness/verdict-mismatch-guard.ts');
const completeSrc = read('lib/mcp/tasks/action/handlers/task/task-complete-handler.ts');
const retriggerSrc = read('lib/services/pipelineRetriggerReactorService.ts');
const resolverSrc = read('lib/services/harnessModeResolver.ts');

console.log('🔒 Non-terminal-family source pins\n');

test('NTF-F18.1: reactor dep-satisfaction SQL carries the PIPELINE settledness clause', () => {
  assert(/upstream\.type = 'PIPELINE'/.test(readySrc), 'settledness type scope missing');
  const win = readySrc.slice(readySrc.indexOf(`upstream.type = 'PIPELINE'`), readySrc.indexOf(`upstream.type = 'PIPELINE'`) + 400);
  assert(win.includes(`ae2.status IN ('PENDING', 'RUNNING')`), 'active-execution subquery missing');
});
test('NTF-F18.2: manual agent.execute gate blocks on unsettled PIPELINE dependencies', () => {
  assert(execHandlerSrc.includes('completed but not yet settled'), 'manual-gate settledness block missing');
  assert(execHandlerSrc.includes(`status: { in: ['PENDING', 'RUNNING'] }`), 'active-exec check missing');
});
test('NTF-F18.3: chainer never chains a stale in-flight PIPELINE predecessor (detector fact)', () => {
  assert(chainerSrc.includes(`'pipeline-synthesis-in-flight'`), 'in-flight notChained reason missing');
});
test('NTF-F19.1: chainer computes chainCapablePredecessors (PIPELINE or templated) + skips non-capable BEFORE notChained', () => {
  assert(chainerSrc.includes('chainCapablePredecessors'), 'fact missing');
  assert(/d\.type === 'PIPELINE' \|\| d\.agentTemplateId != null/.test(chainerSrc), 'chain-capable definition changed');
  const skipIdx = chainerSrc.indexOf('isChainCapable(depTask)');
  const notChainedFirstPush = chainerSrc.indexOf('notChained.push');
  assert(skipIdx > 0 && skipIdx < notChainedFirstPush, 'non-capable skip must precede all notChained bookkeeping');
});
test('NTF-F19.2: degraded = PIPELINE promised a deliverable (deliverableSourceTaskId) AND chained non-report.md', () => {
  assert(chainerSrc.includes('degradedPredecessors'), 'fact missing');
  const win = chainerSrc.slice(chainerSrc.indexOf('promised-but-absent') , chainerSrc.indexOf('degradedPredecessors++') + 30);
  assert(win.includes('deliverableSourceTaskId'), 'degradation must key on the PROMISE (deliverableSourceTaskId), not raw source — index-handoff pipelines are not degraded');
  assert(win.includes(`source !== 'report.md'`), 'non-deliverable source test missing');
});
test('NTF-F19.3: expectedPredecessors/totalDependencies keeps its raw all-edges meaning (Protocol 10 — no silent redefinition)', () => {
  assert(chainerSrc.includes('totalDependencies: dependencies.length'), 'totalDependencies redefined — must stay the raw edge count');
});
test('NTF-F20.1: terminal persist completes an ESCALATED program leg only with Program:-prefix + all-children-terminal guards', () => {
  const idx = persistSrc.indexOf('programLegCompletion');
  assert(idx > 0, 'program-leg block missing');
  const win = persistSrc.slice(idx - 200, idx + 2600);
  assert(win.includes(`startsWith('Program: ')`), 'stage-prefix discriminator missing (standalone pipelines must stay IN_PROGRESS)');
  assert(win.includes(`outcome === 'escalated'`), 'escalated-outcome guard missing');
  assert(win.includes('nonTerminalChildren'), 'all-children-terminal guard missing (never complete a mid-flight leg)');
});
test('NTF-F17.1: terminal persist marks a duplicate-halted program leg executionStatus=FAILED (not COMPLETED)', () => {
  const idx = persistSrc.indexOf('legMeta.duplicateHalt');
  assert(idx > 0, 'duplicateHalt branch missing');
  const win = persistSrc.slice(idx, idx + 300);
  assert(win.includes(`executionStatus: 'FAILED'`), 'duplicate-halt must join the F16 can-never-run taxonomy (FAILED), not COMPLETED');
});
test('NTF-F21.1: verdict-mismatch guard resolves siblings by the stageId COLUMN, never the metadata path', () => {
  assert(!/metadata:\s*\{\s*path:\s*\['pipelineStageId'\]/.test(guardSrc), 'metadata-path sibling filter still present (matches no real children — the guard would stay dead)');
  const idx = guardSrc.indexOf('const siblings');
  const win = guardSrc.slice(idx, idx + 220);
  assert(win.includes('stageId: stageId'), 'stageId column filter missing');
});
test('NTF-F10.1: program confidence is engine-computed ADDITIVELY (programConfidence) from authoritative artifacts, never clobbering confidenceScore', () => {
  // 2026-07-24 (completion-path P2 wave 2): F10 hoisted CORE-side (panel contradiction 3 —
  // adapter-side left the fact vanishing on 3/4 paths). Pin follows the code.
  const coreSrc = read('lib/tasks/services/complete-task-terminally.ts');
  assert(coreSrc.includes('programConfidence'), 'fact missing');
  assert(coreSrc.includes('selectAuthoritativeExecution'), 'must read child scores via the shared selector (BC-3 trap otherwise)');
  assert(coreSrc.includes('PROGRAM_CONFIDENCE_DIVERGENCE'), 'divergence flag missing (flag-first discipline)');
  const stampIdx = coreSrc.indexOf('programConfidence: Math.min(...scores)');
  assert(stampIdx > 0, 'MIN computation missing');
  assert(!coreSrc.includes('confidenceScore: Math.min'), 'computed MIN must not write confidenceScore (two writers, one field)');
  assert(!completeSrc.includes('selectAuthoritativeExecution'), 'the adapter must NOT retain an F10 copy (core-owned now)');
});
test('NTF-CONST.1: terminal predicates verbatim-untouched (Guard 4 + mode resolver — standing constraint)', () => {
  assert(retriggerSrc.includes(`{ executionStatus: { notIn: ['FAILED'] } }`), 'Guard 4 predicate changed');
  assert(resolverSrc.includes(`c.status === 'COMPLETED' || c.executionStatus === 'FAILED'`), 'resolver predicate changed');
});

// ── R4 Layer 2 — truncation-stall terminalization (cline_docs/reviews/truncation-r4-2026-07-16) ──
const loopSrc = read('lib/agents/harness/agentic-tool-loop.ts');
const coneSrc = read('lib/services/mark-forward-cone.ts');

test('NTF-R4L2.1: truncation branch marks a stalled SYNTHESIZE executionStatus=FAILED, gated on the R2 fact + fresh-status != COMPLETED', () => {
  const idx = persistSrc.indexOf('input.truncationStalled');
  assert(idx > 0, 'truncation branch missing');
  const win = persistSrc.slice(idx - 120, idx + 700);
  assert(win.includes(`currentTaskType?.status !== 'COMPLETED'`), 'fresh in-tx status guard missing (a completed-then-truncated leg must be untouched)');
  assert(win.includes(`executionStatus: 'FAILED'`), 'stalled leg must be marked FAILED');
  assert(win.includes('truncationStall'), 'metadata.truncationStall honesty record missing');
});
test('NTF-R4L2.2: F20-wins — the F17/F20 program-leg block PRECEDES the truncation branch, which is gated on !programLegCompletion (escalated-COMPLETED verdict wins)', () => {
  const f17f20 = persistSrc.indexOf('legMeta.duplicateHalt');
  const trunc = persistSrc.indexOf('input.truncationStalled');
  assert(f17f20 > 0 && trunc > f17f20, 'F17/F20 must be computed BEFORE the truncation branch (es-r4v/db-r4v F1 — a stamped escalated verdict must win over truncation-FAILED)');
  const win = persistSrc.slice(trunc - 200, trunc + 400);
  assert(win.includes('!programLegCompletion.status') && win.includes('!programLegCompletion.executionStatus'),
    'truncation branch must yield to an already-terminalized leg');
});
test('NTF-R4L2.3: both FAILED branches (truncation + F17 duplicate-halt) walk the shared forward cone; truncation cone is program-legs-only', () => {
  assert(persistSrc.includes('markForwardConeBlocked'), 'shared cone helper not called from terminal persist');
  const truncIdx = persistSrc.indexOf('input.truncationStalled');
  const truncWin = persistSrc.slice(truncIdx, truncIdx + 1200);
  assert(truncWin.includes('coneStageIdToMark = isProgramLeg ?'), 'truncation cone must be program-legs-only (standalone = leg-mark-only)');
  const dupIdx = persistSrc.indexOf('if (legMeta.duplicateHalt)');
  assert(persistSrc.slice(dupIdx, dupIdx + 700).includes('coneStageIdToMark'), 'F17 duplicate-halt must now walk the cone (the folded cone-gap fix)');
});
test('NTF-R4L2.4: the shared cone walk is deterministic-ordered (ORDER BY t.id) to avoid concurrent-walk deadlock (db-r4v P-DB-1)', () => {
  const cteIdx = coneSrc.indexOf('WITH RECURSIVE cone');
  assert(cteIdx > 0, 'cone CTE missing from the shared helper');
  assert(coneSrc.slice(cteIdx, cteIdx + 900).includes('ORDER BY t.id'), 'cone SELECT must ORDER BY t.id (deterministic lock order across concurrent overlapping walks)');
});
test('NTF-R4L1.1: Layer-1 retry raises maxTokens (min 2× ceiling-clamped) and is bounded once per execution', () => {
  assert(loopSrc.includes('maybeRetryTruncatedFullTurn'), 'Layer-1 retry helper missing');
  const idx = loopSrc.indexOf('function maybeRetryTruncatedFullTurn');
  const win = loopSrc.slice(idx, idx + 1400);
  assert(win.includes('Math.min(ctx.cfg.maxTokens * 2') && win.includes('outputCeiling'), 'retry must raise maxTokens to min(2×, ceiling) — a bare re-ask re-truncates');
  assert(win.includes('state.used') && win.includes(`stopReason !== 'max_tokens'`), 'bounded-once guard + max_tokens trigger missing');
});

// ---- NTF member 5: HARNESS_NO_OUTPUT (2026-07-17 — the silent-green empty-harness stall) ----
// A PIPELINE CREATE that half-ran (stage.create, no link, no children, empty finalResponse,
// normal stop) persisted SUCCESS with degradation null and hung IN_PROGRESS forever, minting
// an orphan stage. Evaded R2/R4 (normal stop), EMPTY_DELIVERABLE (NON-PIPELINE scope), and
// pre-fix P8 (mode UNKNOWN on stage.create-only). Live specimen cmromxvxo000zyx6hgittdy82.

test('NTF-HNO.1: quality layer computes the HARNESS_NO_OUTPUT residual + harnessCreateIncomplete facts', () => {
  const qualitySrc = read('lib/agents/harness/execution-quality.ts');
  assert(/errorCategory:\s*'HARNESS_NO_OUTPUT'/.test(qualitySrc), 'HARNESS_NO_OUTPUT residual category missing');
  assert(qualitySrc.includes('harnessCreateIncomplete'), 'dead-end CREATE fact missing');
});

test('NTF-HNO.2: terminal persist conjoins the fact with fresh in-tx facts (dead-end conjunction, F17/F20-gated)', () => {
  assert(persistSrc.includes('input.harnessNoOutput'), 'persist does not consume the fact');
  const idx = persistSrc.indexOf('HARNESS_NO_OUTPUT Layer 2 (2026-07-17, 3-lens');
  assert(idx > -1, 'Layer-2 branch missing');
  const win = persistSrc.slice(idx, idx + 4200);
  assert(win.includes(`currentTaskType?.status !== 'COMPLETED'`), 'COMPLETED guard missing (protects completed-then-mute)');
  assert(win.includes('pipelineStageId'), 'fresh in-tx !pipelineStageId conjunct missing (protects legitimate empty-but-linked)');
  assert(win.includes('!programLegCompletion.status') && win.includes('!programLegCompletion.executionStatus'),
    'F17/F20 gates missing (es/db F1 ruling: escalated verdicts win)');
  assert(win.includes('DELETE that orphan stage first'), 'recovery comment must warn re-run re-mints the orphan');
});

test('NTF-HNO.3: cone reason UPSTREAM_HARNESS_NO_OUTPUT wired (four-way since 2026-07-18, truncation most specific)', () => {
  assert(persistSrc.includes(`'UPSTREAM_HARNESS_NO_OUTPUT'`), 'cone reasonCode missing');
});

test('NTF-PFB.1: pre-flight-bail branch exists (6th family member) — cannotRun/escalated + no child stage ⇒ FAILED, F17/F20-gated', () => {
  const idx = persistSrc.indexOf('PRE_FLIGHT_BAIL terminalization');
  assert(idx > -1, 'PRE_FLIGHT_BAIL branch comment missing');
  const win = persistSrc.slice(idx, idx + 2600);
  assert(win.includes('legMeta.cannotRun'), 'cannotRun trigger missing');
  assert(win.includes("outcome === 'escalated'"), 'escalated-no-stage trigger missing (A1 belt-and-braces)');
  assert(win.includes('pipelineStageId'), 'no-child-stage conjunct missing');
  assert(win.includes('!programLegCompletion.status') && win.includes('!programLegCompletion.executionStatus'),
    'F17/F20 gates missing (es/db F1: escalated-COMPLETED wins)');
  assert(win.includes('cannotRunPersistedAt'), 'persist stamp missing');
});

test('NTF-PFB.2: cone reason four-way includes UPSTREAM_PRE_FLIGHT_BAIL (E6 — bail must not mislabel as duplicate-halt)', () => {
  assert(persistSrc.includes(`'UPSTREAM_PRE_FLIGHT_BAIL'`), 'cone reasonCode missing');
  assert(persistSrc.includes('isPreFlightBail'), 'branch flag missing — deriving from input facts is impossible for this member');
  assert(
    persistSrc.indexOf(`'UPSTREAM_PRE_FLIGHT_BAIL'`) < persistSrc.indexOf(`'UPSTREAM_DUPLICATE_HALT'`),
    'pre-flight-bail must be checked BEFORE the duplicate-halt fallback'
  );
});

test('NTF-HNO.4: P8 mode inference widened — stage.create alone classifies CREATE (the inverted-detector fix)', () => {
  const validatorSrc = read('lib/services/pipelineProtocolValidator.ts');
  const idx = validatorSrc.indexOf('function detectHarnessMode');
  const win = validatorSrc.slice(idx, idx + 1200);
  assert((win.match(/return 'CREATE'/g) || []).length >= 2, 'stage.create-only CREATE branch missing — half-CREATE goes UNKNOWN again');
  assert(validatorSrc.includes('resolvedMode') && validatorSrc.includes("mode === 'UNKNOWN' && (rm === 'CREATE'"),
    'resolvedMode UNKNOWN-only rescue missing — and it must NEVER be authoritative (PLAN-SPAWN false-flag)');
});

console.log(`\n${'='.repeat(45)}\nResults: ${passed} passed, ${failed} failed\n${'='.repeat(45)}`);
process.exit(failed > 0 ? 1 : 0);
