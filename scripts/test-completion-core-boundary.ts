/**
 * test-completion-core-boundary — completion-path unification contract pins (Phase 1, 2026-07-24).
 *
 * Analog of test-execution-core-boundary.ts for the completion core
 * (lib/tasks/services/complete-task-terminally.ts). Decision record:
 * cline_docs/reviews/completion-path-unification-2026-07-24/SYNTHESIS.md.
 *
 * Sections:
 *   SWEEP   — grep-DERIVED write-site enumeration (never copied from a review table): every file
 *             that can write task.status must be in the allowlist. A new route that writes status
 *             fails here at commit time ("a guard on N-1 paths is no guard").
 *   PURITY  — the core module's boundary rules (no auth, no prisma value-import, no tx/reactors
 *             in Phase 1); status-transitions.ts stays zero-import; predicate SQL single-source.
 *   WIRING  — each of the 6 human adapters calls the shared guards (lands RED at P1-C1 by design;
 *             green after P1-C2).
 *
 * Phase-2 pins to ADD when the spine lands (see IMPLEMENTATION-PLAN 3.1-3.3): single
 * status:'COMPLETED' writer in the core; fireReactors threaded-not-hardcoded; reactor markers
 * forbidden inside tx spans (MARKERS in test-serialization-retry-boundary.ts); statement-shape
 * fixture.
 */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
function test(description: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${description}`); }
  catch (e) { failed++; console.log(`❌ ${description}\n   ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"`])\/\/.*$/gm, '$1');
}

const ROOT = path.join(__dirname, '..');
function read(rel: string): string {
  return stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

// ---------------------------------------------------------------------------------------------
// The six human write-site adapters (SYNTHESIS §1.1 — re-derived below by the SWEEP, not trusted)
// ---------------------------------------------------------------------------------------------
const ADAPTERS = {
  mcpComplete: 'lib/mcp/tasks/action/handlers/task/task-complete-handler.ts',
  mcpUpdate: 'lib/mcp/tasks/action/handlers/task/task-update-handler.ts',
  updateTask: 'lib/tasks/services/task.ts',
  bulk: 'lib/services/taskBulkService.ts',
  move: 'app/api/pov/[povId]/phase/[phaseId]/task/[taskId]/move/route.ts',
  povPut: 'lib/pov/handlers/put.ts',
};
const CORE = 'lib/tasks/services/complete-task-terminally.ts';
const TRANSITIONS = 'lib/tasks/services/status-transitions.ts';
const REACTOR_SVC = 'lib/services/taskReadyReactorService.ts';

// Files legitimately writing task.status OUTSIDE the six adapters + core:
//   - engine spine (exempt, rationale in SYNTHESIS §2-Q4) and claim sites (IN_PROGRESS literal only)
const EXEMPT_STATUS_WRITERS = new Set([
  'lib/services/execution-terminal-persist.ts',   // engine spine — the ONLY exempt terminal writer
  'lib/services/agent-execution-create.ts',       // claim: OPEN→IN_PROGRESS literal
  'lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts', // claim literal
  'app/api/pov/agent/execute/stream/route.ts',    // claim literal
  'app/api/tasks/[taskId]/agent/execute/route.ts',// claim literal
  // 'lib/services/workflowEngine.ts' REMOVED 2026-07-25 (F1 panel finding). The path was wrong —
  // the real file is lib/services/workflow/workflowEngine.ts — so the entry exempted nothing and
  // silently always had. It is not repathed because no exemption is warranted: workflowEngine
  // writes status THROUGH EnhancedTaskService→updateTask (adapter 3), so the sweep's
  // `.task.update(` scan never reaches it. If it ever inlines a direct write, firing is CORRECT.
  'lib/services/taskService.ts',                  // EnhancedTaskService funnel → updateTask (adapter 3)
  'lib/tasks/handlers/task.ts',                   // phase-scoped web handler funnel → updateTask (adapter 3)
  'lib/mcp/tasks/action/handlers/task/task-create-handler.ts', // creation (not a transition); PIPELINE born-COMPLETED rejected (P1-C2)
  'scripts/setup-demo-mode.ts',                   // resets to OPEN (non-terminal, dev tooling)
  'lib/services/agentExecutionEngine.ts',         // engine family: executionStatus/sweep writes (spread-flagged), never task.status terminal
  'lib/services/mark-forward-cone.ts',            // engine family: executionStatus=FAILED + metadata (F16 cone walk) — terminal-FAMILY, not status
  'lib/services/task-can-never-run-persist.ts',   // engine family: executionStatus=FAILED chokepoint (F16) — terminal-FAMILY, not status
  'app/api/pov/[povId]/phase/[phaseId]/task/reorder/route.ts', // order-only write (verified 2026-07-24); spread-heuristic false positive
  'scripts/migrate-mcp-tool-names.ts',            // mcpContext/mcpToolId migration; nested spread only (verified 2026-07-24)
]);

// ---------- SWEEP: grep-derived enumeration ----------
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(rel);
  }
  return out;
}

test('SWEEP: every file writing task status is a known adapter, the core, or exempt (grep-derived)', () => {
  // scripts/test-* are test fixtures, not prod paths; other scripts stay in scope (prod-callable).
  const candidates = [...walk('lib'), ...walk('app'), ...walk('scripts')]
    .filter((rel) => !rel.split(path.sep).join('/').startsWith('scripts/test-'));
  const offenders: string[] = [];
  for (const rel of candidates) {
    const src = read(rel);
    // Per-call analysis: for each task.update(Many) call, examine its argument slice. A write is
    // status-CAPABLE when the data block contains `status:` OR a spread (`...x`) — a spread can
    // smuggle status in (the E2 class), so spread-writers must be enumerated too.
    let statusCapable = false;
    const callRe = /\.task\.update(?:Many)?\(/g;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(src)) !== null) {
      const slice = src.slice(m.index, m.index + 700);
      const dataIdx = slice.indexOf('data:');
      if (dataIdx === -1) continue;
      const dataSlice = slice.slice(dataIdx, dataIdx + 500);
      if (/[^.]status:\s*/.test(dataSlice) || /\.\.\.[a-zA-Z_$]/.test(dataSlice)) {
        statusCapable = true;
        break;
      }
    }
    if (!statusCapable) continue;
    const norm = rel.split(path.sep).join('/');
    const known = norm === CORE
      || Object.values(ADAPTERS).includes(norm)
      || EXEMPT_STATUS_WRITERS.has(norm);
    if (!known) offenders.push(norm);
  }
  assert(offenders.length === 0,
    `Unenumerated status-capable task writers found — wire them through the core or add to the exempt list WITH RATIONALE:\n  ${offenders.join('\n  ')}`);
});

test('SWEEP: no raw-SQL UPDATE on tasks touches status (the $queryRaw evasion)', () => {
  const candidates = [...walk('lib'), ...walk('app')];
  const offenders: string[] = [];
  for (const rel of candidates) {
    const src = read(rel);
    if (/UPDATE\s+"?tasks"?\s/i.test(src) && /\bstatus\b/i.test(src.match(/UPDATE\s+"?tasks"?[\s\S]{0,300}/i)?.[0] ?? '')) {
      offenders.push(rel.split(path.sep).join('/'));
    }
  }
  assert(offenders.length === 0,
    `Raw-SQL task UPDATE mentioning status found:\n  ${offenders.join('\n  ')}`);
});

test('SWEEP: claim sites write IN_PROGRESS literals only (never terminal)', () => {
  for (const rel of [
    'lib/services/agent-execution-create.ts',
    'app/api/pov/agent/execute/stream/route.ts',
    'app/api/tasks/[taskId]/agent/execute/route.ts',
  ]) {
    const src = read(rel);
    assert(!/status:\s*'COMPLETED'/.test(src), `${rel} must never write status COMPLETED (claim site)`);
  }
});

// ---------- PURITY: module boundary rules ----------
const coreSrc = read(CORE);
const transitionsSrc = read(TRANSITIONS);
const reactorSrc = read(REACTOR_SVC);

test('PURITY: status-transitions.ts imports nothing but the leaf error module (pure/sync)', () => {
  // The invariant is "nothing that can cycle back into task.ts or the core" — originally enforced
  // as zero-import. F4 (2026-07-25) needed the module to throw a TYPED error, so exactly one
  // import is now allowed: '@/lib/errors'. That is safe ONLY because errors.ts is itself
  // import-free and therefore cannot participate in a cycle — asserted below, so the exemption
  // cannot rot into a real dependency later.
  const imports = transitionsSrc.match(/^\s*import\s.*$/gm) || [];
  const illegal = imports.filter(l => !/from '@\/lib\/errors'/.test(l));
  assert(illegal.length === 0,
    `status-transitions.ts may import ONLY '@/lib/errors' (found: ${illegal.join(' | ')}) — any other import risks a cycle back into task.ts/the core`);
  assert(!/^\s*import\s/m.test(read('lib/errors.ts')),
    'lib/errors.ts gained an import — it must stay a LEAF for the status-transitions exemption above to be cycle-safe. Either revert it, or restore status-transitions.ts to zero-import.');
  assert(/VALID_TASK_TRANSITIONS/.test(transitionsSrc) && /validateTaskStatusTransition/.test(transitionsSrc),
    'status-transitions.ts must own the transition map + validator');
  assert(/throw new InvalidTransitionError\(/.test(transitionsSrc),
    'the validator must throw the TYPED InvalidTransitionError — consumers match by instanceof, not by message substring (F4)');
});

test('PURITY: core contains zero auth/POV-access logic (adapter duty — C-4 analog)', () => {
  assert(!/validatePOVAccess|withPOVAccess|requireWrite|getServerSession|verifyToken/.test(coreSrc),
    'auth/access stays adapter-side; the core never authorizes');
});

test('PURITY: core has no prisma value-import (guards take the caller\'s client)', () => {
  assert(!/from '@\/lib\/prisma'/.test(coreSrc),
    'core must not import the prisma singleton — clients are passed in (mark-forward-cone lesson)');
});

test('SPINE: core owns exactly ONE terminal status write, and it is the CAS updateMany', () => {
  const writes = coreSrc.match(/status:\s*'COMPLETED'/g) || [];
  assert(writes.length === 1, `core must contain exactly ONE status:'COMPLETED' write (found ${writes.length})`);
  assert(/updateMany\(\{\s*where:\s*\{\s*id:\s*taskId,\s*status:\s*existing\.status\s*\}/.test(coreSrc),
    'the terminal write must be the CAS updateMany gated on the validated status');
  assert(/CompletionConflictError/.test(coreSrc), 'CAS count-0 must throw CompletionConflictError');
});

test('SPINE: Layer 1 is side-effect-free (no reactors, no $transaction, no comment/activity)', () => {
  const l1Start = coreSrc.indexOf('export async function runTaskCompletionTx');
  const l1End = coreSrc.indexOf('export interface CompleteTaskOptions');
  assert(l1Start > 0 && l1End > l1Start, 'Layer 1 / Layer 2 boundary must exist');
  const l1 = coreSrc.slice(l1Start, l1End);
  assert(!/maybeQueueReadyDependents|maybeRetriggerPipelineHarness/.test(l1),
    'Layer 1 must contain no reactor calls (post-commit tail only)');
  assert(!/\$transaction/.test(l1), 'Layer 1 never opens a tx — it RECEIVES the tx client');
  assert(!/comment\.create|logTaskCompleted/.test(l1), 'comment/activity are post-commit tail effects');
});

test('SPINE: fireReactors is THREADED, never hardcoded (a literal = accidental Flip A)', () => {
  assert(/input\.fireReactors/.test(coreSrc), 'the tail must gate on input.fireReactors');
  assert(!/fireReactors:\s*(true|false)/.test(coreSrc),
    'core must NOT hardcode fireReactors — adapters thread it; Flips A/B are param-only diffs');
});

test('SPINE: reactor + activity imports are fire-time DYNAMIC (route-bundle contamination)', () => {
  assert(/await import\('@\/lib\/services\/pipelineRetriggerReactorService'\)/.test(coreSrc),
    'retrigger must be dynamically imported');
  assert(/await import\('@\/lib\/services\/taskReadyReactorService'\)/.test(coreSrc),
    'TaskReady must be dynamically imported in the tail');
  const staticImports = coreSrc.split('\n').filter((l) => /^import .*from/.test(l)).join('\n');
  assert(!/pipelineRetriggerReactorService/.test(staticImports),
    'no static import of the retrigger service');
});

test('SPINE: F9 deferral lives in the tail — PIPELINE + active-execution predicate + WARN fallback', () => {
  const tail = coreSrc.slice(coreSrc.indexOf('export async function fireCompletionEffects'));
  assert(/agentExecution\.count/.test(tail) && /PENDING.*RUNNING|'PENDING', 'RUNNING'/.test(tail),
    'F9 predicate (active PENDING/RUNNING execution) must gate the PIPELINE TaskReady fire');
  assert(/F9 deferral count failed/.test(coreSrc.replace(/\n/g, ' ')) || /count failed/i.test(tail),
    'the count-failure WARN + immediate-fire fallback must be present');
});

test('PURITY: dep-predicate SQL is single-source in taskReadyReactorService', () => {
  assert(/function unsatisfiedDepExistsSql/.test(reactorSrc) && /function upstreamUnsatisfiedCondSql/.test(reactorSrc),
    'predicate + factored condition must live in the reactor service');
  assert(/export async function hasUnsatisfiedDeps/.test(reactorSrc) && /export async function listUnsatisfiedDeps/.test(reactorSrc),
    'the exported wrappers are the only sanctioned access');
  // No other file may re-declare the predicate's distinctive join.
  const candidates = [...walk('lib'), ...walk('app')];
  const copies = candidates.filter((rel) => {
    const norm = rel.split(path.sep).join('/');
    if (norm === REACTOR_SVC) return false;
    return /task_dependencies d2/.test(read(rel));
  });
  assert(copies.length === 0, `predicate SQL copied outside the reactor service:\n  ${copies.join('\n  ')}`);
});

test('PURITY: guard scope is the module constant, APPROVAL-only (never an adapter parameter)', () => {
  assert(/DEP_GUARD_ENFORCED_TYPES[\s\S]{0,80}new Set\(\['APPROVAL'\]\)/.test(coreSrc),
    'DEP_GUARD_ENFORCED_TYPES must be the module-level APPROVAL-only constant');
});

// ---------- WIRING: the six adapters call the shared guards (RED until P1-C2) ----------
test('WIRING: MCP task.complete is a THIN ADAPTER over completeTaskTerminally (P2 wave 2)', () => {
  const src = read(ADAPTERS.mcpComplete);
  assert(/completeTaskTerminally\(/.test(src), 'complete-handler must delegate to the core');
  assert(/fireReactors:\s*true/.test(src), 'complete-handler threads fireReactors:true (preserves today; the only cascading human path until Flip A)');
  assert(!/harnessTaskId/.test(src), 'inline 4-point copy must stay deleted');
  assert(!/task\.update\(/.test(src), 'the adapter performs NO direct task write — the core owns it');
  assert(!/maybeQueueReadyDependents|maybeRetriggerPipelineHarness/.test(src),
    'reactor calls live in the core tail, not the adapter');
  assert(/validatePOVAccess/.test(src), 'auth stays adapter-side (C-4 analog)');
});

test('WIRING: MCP task.update COMPOSES Layer 1 in its own tx + fires the tail post-commit (P2 wave 5)', () => {
  const src = read(ADAPTERS.mcpUpdate);
  assert(/runTaskCompletionTx\(tx,/.test(src), 'update-handler must compose Layer 1 INSIDE its existing tx');
  assert(/fireCompletionEffects\(prisma,/.test(src), 'the post-commit tail must run on bare prisma AFTER the handler commit');
  assert(/fireReactors:\s*true/.test(src), 'FLIP A: task.update completions fire the cascade');
  assert(!/assertCompletionDependenciesSatisfied|assertPipelineCompletionInvariant/.test(src),
    'guards are core-internal now — the adapter must not call them directly');
  // recordedHarnessId is the invariant-CHECK variable; the back-pointer WRITE (harnessTaskId
  // stamp at metadata-merge time) legitimately stays in this handler.
  assert(!/recordedHarnessId/.test(src), 'the invariant clone (back-pointer CHECK) must stay deleted');
  // Ordering: the non-status write precedes the Layer-1 composition (fresh read sees the merge).
  const writeIdx = src.indexOf('data: updateData');
  const composeIdx = src.indexOf('runTaskCompletionTx(tx,');
  assert(writeIdx > 0 && composeIdx > writeIdx, 'non-status update must run BEFORE Layer 1 in the tx');
});

test('WIRING: TaskService.updateTask routes terminal transitions through the core, cascade ON (Flip A)', () => {
  const src = read(ADAPTERS.updateTask);
  assert(/completeTaskTerminally\(/.test(src), 'updateTask must delegate terminal transitions to the core');
  assert(/fireReactors:\s*true/.test(src), 'FLIP A: the web funnel fires the cascade');
  assert(!/INTERIM_TERMINAL_REJECT|interim policy/.test(src), 'the interim reject must be GONE (Flip A)');
  assert(!/assertCompletionDependenciesSatisfied|assertPipelineCompletionInvariant/.test(src),
    'guards are core-internal — no direct calls remain');
});

test('WIRING: bulk — per-row core + FLIP B post-batch coalesced fan-out', () => {
  const src = read(ADAPTERS.bulk);
  assert(/validateTaskStatusTransition\(/.test(src), 'bulk must run the transition machine per row');
  // 2026-08-19: the inline override strip centralized into stripAuditFacts (protected-task-
  // metadata.ts, platform-run-keys panel) — the literal left this file while the behavior stayed
  // (pinned behaviorally in test-platform-run-keys P6). Pin the centralized call, not the literal.
  assert(/stripAuditFacts\(/.test(src), 'bulk must strip inbound audit facts (centralized guard call)');
  assert(/completeTaskTerminally\(/.test(src), 'ALL terminal rows route through the core (interim gone at Flip B)');
  assert(!/interim policy/.test(src), 'the bulk interim reject must be GONE (Flip B)');
  assert(/fireReactors:\s*false/.test(src), 'per-row tail stays OFF by design — the post-batch fan-out is the cascade');
  assert(/fireCompletionReactors\(/.test(src), 'FLIP B: the post-batch fan-out fires via the single-copy reactor sub-tail');
  assert(/stagesFired/.test(src), 'retrigger must be deduped by stage');
  assert(/topoSortByInducedDeps/.test(src), 'terminal batches must topo-sort BEFORE batch-split (TD4/TD7)');
  const sortIdx = src.indexOf('topoSortByInducedDeps(validTaskIds)');
  const splitIdx = src.indexOf('createBatches(validTaskIds');
  assert(sortIdx > 0 && splitIdx > sortIdx, 'topo sort must run before createBatches');
});

test('WIRING: kanban move route — ALL terminal drags route through the core, cascade ON (Flip A)', () => {
  const src = read(ADAPTERS.move);
  assert(/validateTaskStatusTransition\(/.test(src), 'move route must run the transition machine');
  assert(/completeTaskTerminally\(/.test(src), 'terminal drags must route through the core');
  assert(/fireReactors:\s*true/.test(src), 'FLIP A: kanban terminal drags fire the cascade');
  assert(!/INTERIM_TERMINAL_REJECT/.test(src), 'the interim reject must be GONE (Flip A)');
});

test('WIRING: POV-PUT nested writes reject terminal status and never persist client executionStatus (path 9 + §1.9)', () => {
  const src = read(ADAPTERS.povPut);
  assert(/validateTaskStatusTransition\(/.test(src), 'POV-PUT nested task status changes must be transition-validated');
  assert(!/executionStatus:/.test(src),
    'POV-PUT must not assign client-supplied executionStatus (engine single-writer invariant — SYNTHESIS §1.9)');
});

test('CONTRACT: POV-PUT never persists client agentLog / outputArtifacts (engine-owned evidence)', () => {
  // outputArtifacts is EVIDENCE on the deliverable path: resourceManager registers MCP artifact
  // resources from it, agent-results reads it as LLM output, and nothing marks provenance — so a
  // client-written entry is indistinguishable from an engine-written one after the fact. Same
  // ownership rule as executionStatus (§1.9), enforced the same way: the schema still ACCEPTS the
  // fields (the POV editor round-trips the whole task entity) and the HANDLER declines to persist.
  // Note the fields must be OMITTED, not written as null — writing null is precisely the BC76
  // read-swap regression that nulled 164 rows.
  const src = read(ADAPTERS.povPut);
  assert(!/updateData\.outputArtifacts\s*=/.test(src),
    'POV-PUT must not assign client-supplied outputArtifacts — forgeable evidence on the deliverable path');
  assert(!/updateData\.agentLog\s*=/.test(src),
    'POV-PUT must not assign client-supplied agentLog — engine-owned narrative provenance');
  assert(!/^\s*outputArtifacts: task\.outputArtifacts,/m.test(src),
    'POV-PUT nested CREATE must not persist client outputArtifacts — a task cannot be BORN with agent output');
  assert(!/^\s*agentLog: task\.agentLog,/m.test(src),
    'POV-PUT nested CREATE must not persist client agentLog');
});

test('CONTRACT: POV-PUT deletes omitted tasks only when explicitly asked (F5 — opt-in destruction)', () => {
  const src = read(ADAPTERS.povPut);
  assert(/const deleteMissing = validated\.deleteMissing === true;/.test(src),
    'POV-PUT must read an explicit deleteMissing flag (F5) — delete-by-omission destroyed every task a partial request left out');
  assert(/deleteMissing\s*\n?\s*\?\s*existingTasks\.filter/.test(src),
    'the tasksToDelete set must be GATED on deleteMissing, not merely logged (F5)');
  const schema = read('lib/validation/pov.ts');
  assert(/deleteMissing: FormField\.optional\(z\.boolean\(\)\)/.test(schema),
    'UpdatePOVSchemaComprehensive must declare deleteMissing, or the handler can never receive it (silently stripped — the MCP three-layer rule)');
  assert(!/deleteMissing:\s*FormField\.optional\(z\.boolean\(\)\)\.default\(true\)/.test(schema),
    'deleteMissing must NOT default to true — destruction is opt-in (F5)');
  // F5 follow-up (2026-07-25, found by live probe): deleteMissing is a CONTROL FLAG. The handler
  // spreads validated POV fields into prisma.pOV.update(), so a declared-but-unexcluded flag
  // reaches Prisma as an unknown column and 500s the request. The default path hid it (the flag is
  // absent), so only the opt-in branch broke — safe direction, broken escape hatch.
  assert(/'deleteMissing',/.test(src),
    'deleteMissing must be listed in nonScalarOrHandledFields — otherwise it flows into prisma.pOV.update() as an unknown argument and the opt-in branch 500s (F5)');
});

// F2 (2026-07-25) — completedAt-restamp guards, one per NON-core status-write site.
//
// taskCompletedAtExtension stamps completedAt=now on ANY write payload containing
// status:'COMPLETED'. It runs AT the write, so the pre-image is unavailable and it CANNOT
// distinguish a real transition from a re-send of the status the row already has. Every site that
// writes a status must therefore omit it when unchanged, or it silently moves the forensic
// completion time (prod damage found and repaired 2026-07-25: 53 rows, worst 20.0 days, caused by
// three POV saves flattening every completed task in their POV to now()).
//
// The completion CORE needs no guard — its CAS write is an idempotent no-op on an already-terminal
// row, so it never re-writes. Create paths need none either: a create has no prior completedAt to
// corrupt. Bulk is structurally safe (processTerminalBatch strips status; the non-terminal batch
// never carries COMPLETED). The behavioral suite covers the TaskService and MCP paths live (B11 /
// B11b); these static pins cover the two the behavioral rig cannot reach.
test('CONTRACT: every non-core status-write site omits an UNCHANGED status (F2 — completedAt stability)', () => {
  const moveSrc = read(ADAPTERS.move);
  const moveAssignments = (moveSrc.match(/updateData\.status\s*=/g) || []).length;
  assert(moveAssignments === 1,
    `move route has ${moveAssignments} status assignments, expected exactly 1 (the transition branch). A second one is the same-status re-write that restamps completedAt — F2.`);
  assert(/newStatus\s*!==\s*task\.status/.test(moveSrc),
    'move route must guard its status assignment on an ACTUAL change (newStatus !== task.status) — F2');

  const putSrc = read(ADAPTERS.povPut);
  assert(/task\.status === existingRow\.status \? \{\} : \{ status: task\.status \}/.test(putSrc),
    'POV-PUT nested UPDATE must omit an unchanged status — the POV editor round-trips the whole task entity, so without this ONE save restamps completedAt on EVERY completed task in the POV (F2)');

  const taskSrc = read('lib/tasks/services/task.ts');
  assert(/updateData\.status === existingTask\.status\)\s*\{\s*\n\s*delete updateData\.status/.test(taskSrc),
    'TaskService.updateTask must delete an unchanged status before the ordinary write (F2)');

  const mcpSrc = read('lib/mcp/tasks/action/handlers/task/task-update-handler.ts');
  assert(/statusChangingToCompleted \|\| statusIsUnchanged/.test(mcpSrc),
    'MCP task.update must drop status when UNCHANGED as well as when delegating to the core — a same-status re-send takes the ordinary-write branch and restamps (F2)');
});

// F1 (2026-07-25) — the SCHEMA-side half of the §1.9 invariant. The pin above is handler-side
// (POV-PUT must not assign the field); this one closes the layer earlier, at the client trust
// boundary itself. Both are load-bearing: the schema pin stops the value entering, the handler
// pin stops a future handler persisting one that did.
//
// executionStatus is an ENGINE-DERIVED fact — its value may only originate from server-side
// state (an execution's lifecycle, a reaper's observation, a claim CAS, or a workflow result).
// The Zod validators are the ONLY membrane where "came from the wire" is distinguishable from
// "came from server code": TaskService stays deliberately value-transparent because
// workflowEngine (lib/services/workflow/workflowEngine.ts) is a legitimate caller that hands it
// an untyped literal and never passes through Zod. So the strip belongs here, NOT in the service.
test('CONTRACT: no client-input schema declares executionStatus (F1 — engine-owned field)', () => {
  for (const [file, schema, re] of [
    ['lib/validation/task-validation.ts', 'CreateTaskSchema', /export const CreateTaskSchema = z\.object\(\{([\s\S]*?)\}\);/],
    ['lib/validation/task-validation.ts', 'UpdateTaskSchema', /export const UpdateTaskSchema = z\.object\(\{([\s\S]*?)\}\)\.refine/],
    ['lib/validation/task-shapes.ts', 'NestedTaskInputSchema', /export const NestedTaskInputSchema = z\.object\(\{([\s\S]*?)\n\}\);/],
  ] as const) {
    const block = read(file).match(re);
    assert(!!block, `${schema} block not found in ${file} — pin cannot verify, treat as a failure`);
    assert(!/\bexecutionStatus:/.test(block![1]),
      `${schema} declares executionStatus — client-input schemas must not accept the engine-owned ` +
      `terminal-family fact (F1, 2026-07-25). A client stamping FAILED freezes a task out of the ` +
      `reactor cascade; SUCCESS forges terminal state past the dependency gate. If a new internal ` +
      `caller needs to set it, pass a typed object to TaskService directly — do not re-open the wire.`);
  }
});

test('CONTRACT: MCP task action validators never accept executionStatus (F1)', () => {
  assert(!/executionStatus/.test(read('lib/validation/mcp-action-validation.ts')),
    'MCP action validation accepts executionStatus — the MCP surface must stay closed (F1). Agents ' +
    'signal terminal-family membership via the metadata.cannotRun state channel, which the platform ' +
    'CONSUMES to derive the status server-side; they never set the value directly.');
});

test('WIRING: web status route maps DependencyNotSatisfiedError to a structured 4xx (no 500 masquerade)', () => {
  const src = read('app/api/tasks/[taskId]/status/route.ts');
  assert(/DependencyNotSatisfiedError|DEPENDENCY_NOT_SATISFIED/.test(src),
    'status route must map the typed dep-guard error to DEPENDENCY_NOT_SATISFIED');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
