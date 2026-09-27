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

test('NTF-F18.1 (H-5 widened): reactor dep-satisfaction SQL carries the settledness clause for EVERY upstream type', () => {
  // 2026-09-09: the clause used to be scoped `upstream.type = 'PIPELINE' AND EXISTS(...)`; an ACTION
  // Harvester that self-completed mid-execution slipped through and its consumer chained EMPTY.
  assert(!/upstream\.type = 'PIPELINE'\s*AND EXISTS/.test(readySrc), 'settledness re-scoped to PIPELINE only — H-5 reopened');
  const i = readySrc.indexOf(`upstream.status != 'COMPLETED'`);
  const win = readySrc.slice(i, i + 1400); // the predicate carries its own SQL comment block (H-5) — window past it
  // RWF A1 (2026-09-26): the status set comes from the shared ACTIVE_EXECUTION_STATUSES constant, rendered as a
  // SQL LITERAL (Prisma.raw), never bind parameters — the BC67 partial index is only provable against a literal.
  assert(win.includes('ae2.status IN (${ACTIVE_STATUSES_SQL_LITERAL})'), 'active-execution subquery missing from the unsatisfied predicate');
  assert(/const ACTIVE_STATUSES_SQL_LITERAL = Prisma\.raw\(ACTIVE_EXECUTION_STATUSES\.map/.test(readySrc),
    'the in-flight status set is no longer the shared constant rendered as a literal (Prisma.join would bind parameters and lose the partial index)');
});
test('NTF-F18.2: manual agent.execute gate blocks on unsettled PIPELINE dependencies', () => {
  assert(execHandlerSrc.includes('completed but not yet settled'), 'manual-gate settledness block missing');
  assert(execHandlerSrc.includes(`status: { in: ['PENDING', 'RUNNING'] }`), 'active-exec check missing');
});
test('NTF-F18.3 (H-5 widened): chainer never chains a stale in-flight predecessor of ANY type (detector fact)', () => {
  assert(chainerSrc.includes(`'pipeline-synthesis-in-flight'`), 'in-flight notChained reason missing');
  assert(chainerSrc.includes(`'execution-in-flight'`), 'ACTION in-flight reason missing');
  assert(!/if \(depTask\.type === 'PIPELINE'\) \{\s*\n\s*const activeExec/.test(chainerSrc), 'in-flight guard re-scoped to PIPELINE — H-5 reopened');
});
test('NTF-F18.4 (F-B): the chainer in-flight arm is gated on a COMPLETED dependency — a not-yet-completed upstream is the ordinary case, never "in-flight"', () => {
  assert(/if \(depTask\.status === 'COMPLETED'\) \{\s*\n\s*const activeExec/.test(chainerSrc), 'in-flight arm no longer gated on COMPLETED (F-B reopened)');
});
// RWF 1.1 (2026-09-26): the in-flight (H-6) arm now lives ONCE in lib/services/child-stage-settled.ts and is
// WIDER — any task status, not only COMPLETED (a FAILED child being re-run is briefly IN_PROGRESS+FAILED with a
// PENDING row). Pin the property there, and pin that Guard 4 reads it rather than a local copy.
const settledSrc = read('lib/services/child-stage-settled.ts');
test('NTF-H6: a child with a PENDING/RUNNING execution is NON-terminal (shared predicate; Guard 4 reads it)', () => {
  assert(settledSrc.includes(`export const ACTIVE_EXECUTION_STATUSES = ['PENDING', 'RUNNING'] as const`), 'in-flight status set changed');
  assert(/\{ executions: \{ some: \{ status: \{ in: \[\.\.\.ACTIVE_EXECUTION_STATUSES\] \} \} \} \}/.test(settledSrc),
    'in-flight arm missing from the shared predicate — SYNTHESIZE would read a pre-persist snapshot (H-6 reopened)');
  assert(!/status: 'COMPLETED',\s*\n?\s*executions: \{ some/.test(settledSrc), 'in-flight arm narrowed back to COMPLETED-only (RWF F-e reopened)');
  const i = retriggerSrc.indexOf('const nonTerminalChildren');
  assert(i > 0 && retriggerSrc.slice(i, i + 200).includes('countUnsettledChildren(prisma, completed.stageId)'),
    'Guard 4 no longer reads the shared settledness predicate');
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
  // Anchored on the escalated branch itself, not a fixed window from the block start (a comment edit
  // pushed the old 2,600-char window past the count — RWF 2026-09-26).
  const esc = persistSrc.indexOf(`legGate?.outcome === 'escalated'`);
  const escWin = persistSrc.slice(esc, esc + 1600);
  assert(esc > 0 && escWin.includes('countUnsettledChildren(tx, legStageId)') && escWin.includes('nonTerminalChildren === 0'),
    'all-children-settled guard missing (never complete a mid-flight leg) — must read the shared predicate in-tx');
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
// NTF-CONST.1 — the standing constraint (F16 synthesis 2026-07-16): the family terminalizes by WRITING
// executionStatus='FAILED' and relies on every terminal predicate counting FAILED (and COMPLETED) as terminal.
// It used to pin the Guard 4 and resolver literals verbatim. RWF 1.1 (2026-09-26, Steve-approved plan) moved
// both onto ONE shared predicate and ADDED an in-flight arm; the PROPERTY the constraint protects is pinned
// here instead. The added arm cannot catch a family member: F16 creates no execution row, and the cone walk
// marks only tasks with no PENDING/RUNNING/SUCCESS execution (mark-forward-cone.ts).
test('NTF-CONST.1: terminal = COMPLETED or executionStatus FAILED, in the ONE shared predicate every site reads', () => {
  assert(/\{ status: \{ not: 'COMPLETED' \} \}/.test(settledSrc) &&
    /\{ OR: \[\{ executionStatus: null \}, \{ executionStatus: \{ not: 'FAILED' \} \}\] \}/.test(settledSrc),
    'the not-terminal arm changed — FAILED (the family\'s terminalization write) or COMPLETED no longer counts as terminal');
  assert(retriggerSrc.includes('countUnsettledChildren('), 'Guard 4 does not read the shared predicate');
  assert(resolverSrc.includes('countUnsettledChildren('), 'mode resolver does not read the shared predicate');
});

// ── R4 Layer 2 — truncation-stall terminalization (cline_docs/reviews/truncation-r4-2026-07-16) ──
const loopSrc = read('lib/agents/harness/agentic-tool-loop.ts');
const coneSrc = read('lib/services/mark-forward-cone.ts');

test('NTF-R4L2.1: truncation branch marks a stalled SYNTHESIZE executionStatus=FAILED, gated on the R2 fact + fresh-status != COMPLETED', () => {
  // RWF A3 (2026-09-26): anchored on the R4 BRANCH's own gate — the first mention of the fact is now the
  // dead-end exemption block that precedes it, so a first-occurrence anchor measured the wrong code.
  const idx = persistSrc.indexOf('    input.truncationStalled &&\n    !deadEndExempt');
  assert(idx > 0, 'truncation branch missing');
  const win = persistSrc.slice(idx - 120, idx + 700);
  assert(win.includes(`currentTaskType?.status !== 'COMPLETED'`), 'fresh in-tx status guard missing (a completed-then-truncated leg must be untouched)');
  assert(win.includes(`executionStatus: 'FAILED'`), 'stalled leg must be marked FAILED');
  assert(win.includes('truncationStall'), 'metadata.truncationStall honesty record missing');
});
test('NTF-R4L2.2: F20-wins — the F17/F20 program-leg block PRECEDES the truncation branch, which is gated on !programLegCompletion (escalated-COMPLETED verdict wins)', () => {
  const f17f20 = persistSrc.indexOf('legMeta.duplicateHalt');
  const trunc = persistSrc.indexOf('    input.truncationStalled &&\n    !deadEndExempt');
  assert(f17f20 > 0 && trunc > f17f20, 'F17/F20 must be computed BEFORE the truncation branch (es-r4v/db-r4v F1 — a stamped escalated verdict must win over truncation-FAILED)');
  const win = persistSrc.slice(trunc - 200, trunc + 400);
  assert(win.includes('!programLegCompletion.status') && win.includes('!programLegCompletion.executionStatus'),
    'truncation branch must yield to an already-terminalized leg');
});
test('NTF-R4L2.3: both FAILED branches (truncation + F17 duplicate-halt) walk the shared forward cone; truncation cone is program-legs-only', () => {
  assert(persistSrc.includes('markForwardConeBlocked'), 'shared cone helper not called from terminal persist');
  // RWF A3 (2026-09-26): anchored on the R4 BRANCH's own gate — the first mention of the fact is now the
  // dead-end exemption block that precedes it, so a first-occurrence anchor measured the wrong code.
  const truncIdx = persistSrc.indexOf('    input.truncationStalled &&\n    !deadEndExempt');
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
// The function body, start to its closing brace — a fixed-width window silently stops covering the
// budget lines as the function grows (it grew 2026-09-25).
const r4FnIdx = loopSrc.indexOf('async function maybeRetryTruncatedFullTurn');
const r4FnSrc = loopSrc.slice(r4FnIdx, loopSrc.indexOf('\n}\n', r4FnIdx));

// NTF-R4L1.1 — AMENDED 2026-09-25 (register E1, design §1.4), not deleted: the ceiling gained a third
// term. Was `Math.min(ctx.cfg.maxTokens * 2, <ceiling>)`; a 96K retry after a full 48K attempt cannot
// fit a 30-turn watchdog, so the raise is also bounded by the time left before it.
test('NTF-R4L1.1: Layer-1 retry raises maxTokens to min(2×, model ceiling, time budget) and is bounded once per execution', () => {
  assert(loopSrc.includes('maybeRetryTruncatedFullTurn') && r4FnIdx > 0, 'Layer-1 retry helper missing');
  const m = r4FnSrc.match(/Math\.min\(([^;]*)\);/);
  assert(!!m && m[1].includes('ctx.cfg.maxTokens * 2') && m[1].includes('ceiling') && m[1].includes('timeBudget'),
    'retry must raise maxTokens to min(2×, model ceiling, time budget) — a bare re-ask re-truncates and an un-budgeted raise dies at the watchdog');
  assert(r4FnSrc.includes('outputCeiling'), 'the ceiling term must come from the model capability map');
  assert(r4FnSrc.includes('ctx.deadlineAt'), 'the time budget must read the watchdog deadline');
  assert(r4FnSrc.includes('state.used') && r4FnSrc.includes(`stopReason !== 'max_tokens'`), 'bounded-once guard + max_tokens trigger missing');
});
// NTF-R4L1.4 (2026-09-25): A2 RE-OPENED — partial text qualifies. A future "restore the empty-text
// gate" would silently re-open the mid-text-truncation class (register E1), so pin its absence.
test('NTF-R4L1.4: the retry trigger does NOT require empty text (A2 re-opened) and the discard is stamped', () => {
  const guard = r4FnSrc.split('\n').find(l => l.includes(`stopReason !== 'max_tokens'`)) ?? '';
  assert(guard.length > 0 && !/emptyText|\.trim\(\)/.test(guard), `trigger must not gate on empty text: ${guard.trim()}`);
  assert(r4FnSrc.includes('state.discardedChars =') && r4FnSrc.includes('state.retryStopReason ='),
    'a returned retry must stamp the discarded chars and its own stop reason');
});
test('NTF-R4L1.2: a below-headroom budget SKIPS with a stamped reason — never a bare re-ask', () => {
  assert(r4FnSrc.includes(`'INSUFFICIENT_TIME'`) && r4FnSrc.includes(`'AT_MODEL_CEILING'`), 'both stamped skip reasons must exist in the retry');
  assert(r4FnSrc.includes('TRUNCATION_RETRY_MIN_HEADROOM'), 'the headroom gate must use the named constant');
  assert(!/maxTokens:\s*ctx\.cfg\.maxTokens\b/.test(r4FnSrc), 'no generateText call may be built with maxTokens: ctx.cfg.maxTokens (the bare re-ask shape)');
  const skipIdx = r4FnSrc.indexOf('state.skippedReason =');
  const callIdx = r4FnSrc.indexOf('deps.generateText(');
  assert(skipIdx > 0 && callIdx > skipIdx, 'the skip decision must precede the retry call');
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

test('NTF-SDE.1: the dead-end conjunction covers BOTH shapes — absent link (CREATE) OR synthesizeDeadEnd', () => {
  const idx = persistSrc.indexOf('HARNESS_NO_OUTPUT Layer 2 (2026-07-17, 3-lens');
  assert(idx > -1, 'Layer-2 branch missing');
  const win = persistSrc.slice(idx, idx + 4200);
  assert(win.includes('input.synthesizeDeadEnd'), 'SYNTHESIZE dead-end disjunct missing — a SYNTHESIZE with all children terminal hangs forever (prod cmu0yl664006kyx0e3olnguqe)');
  assert(win.includes('pipelineStageId'), 'the ABSENT-LINK (CREATE) disjunct must SURVIVE the widening — it is the shape being loosened');
});

test('NTF-SDE.2: the fact is derived caller-side and mode-gated (same shape as truncationStalled)', () => {
  const coreSrc = read('lib/services/execution-core.ts');
  assert(/const synthesizeDeadEnd\s*=/.test(coreSrc), 'caller-side derivation missing');
  const i = coreSrc.indexOf('const synthesizeDeadEnd');
  assert(coreSrc.slice(i, i + 400).includes(`'SYNTHESIZE'`),
    'mode gate missing — an empty ORCHESTRATE is harmless and an empty CREATE is the other disjunct');
  assert(coreSrc.includes('synthesizeDeadEnd,'), 'derived fact never passed to the persist input');
});

test('NTF-SDE.3: the cone reason PHRASE branches — "never linked a child stage" is FALSE of the SYNTHESIZE shape', () => {
  assert(persistSrc.includes('no cascade left to fire'),
    'cone phrase does not distinguish the shapes; a program LEG would be told the link was absent when it was present');
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
