#!/usr/bin/env ts-node
/**
 * Terminal-Persist Shape Tests — convergence Phase 4b equivalence gate
 *
 * The B1 method applied to the terminal transactions: BEFORE swapping either
 * execution path onto lib/services/execution-terminal-persist.ts, this suite
 * pins the core's FULL persist shape against a tx-recording mock — the ordered
 * statement set, the exact update payloads, and the artifact content BYTES —
 * with expectations hand-derived from the inline engine/stream code being
 * replaced. After the swap, this is the drift-lock on the single implementation.
 *
 * Layers:
 *   1. Runtime statement-set fixtures (recording mock): engine-config success
 *      (prune on), stream-config success (prune off), PIPELINE upstream
 *      extraction + pointer substitution, PRUNE over-cap with keep-best
 *      inversion + in-tx rollup ordering, failure CAS hit / CAS miss.
 *   2. Byte pins: result.json / report.md artifact content, completion-comment
 *      text, error.json via buildErrorJson.
 *   3. Unit: buildErrorJson union (optional-field dropping), resolveAgentRole
 *      chain (engine-canonical), timing-fact derivation.
 *   4. Source pins on the core file: CAS shape + count guard, reactor asymmetry
 *      (success → both, failure → retrigger-only, fire-time dynamic import),
 *      rollUpAndDeleteExecutions (atomic rollup+delete) stays IN the success tx
 *      (I-PRUNE-2 / BC-#2), zero agentExecution.create (G8).
 *
 * CI-safe: stub DATABASE_URL before any import that reaches lib/prisma.
 *
 * Created: 2026-07-05
 * Plan: cline_docs/reviews/execution-path-convergence-2026-07-04/implementation-plan.md §Phase 4
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
process.env.ARTIFACT_SECRET_REDACT_ENABLED = 'false'; // byte pins need redaction OFF — and since
// 2026-08-28 R10 is DEFAULT-ON, so deleting the var would ENABLE it and change the pinned bytes.

import * as fs from 'fs';
import * as path from 'path';
import {
  buildErrorJson,
  resolveAgentRole,
  runTerminalSuccessTx,
  persistTerminalSuccess,
  runTerminalFailureTx,
  persistTerminalFailure,
  TerminalSuccessInput,
  TerminalFailureInput,
  writeTerminatedExecutionTaskStatus,
  PostCompletionAnchorError,
  ANCHORED_EXTRACTION_FALLBACK_BODY,
} from '../lib/services/execution-terminal-persist';
import { sanitizeLLMForMarkdown, orderResultJsonForPersist } from '../lib/services/execution-artifacts';

console.log('🧪 Terminal-Persist Shape Tests (Phase 4b equivalence gate)\n');

let passed = 0;
let failed = 0;
function test(d: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`✅ ${d}`); passed++; })
    .catch((e) => { console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   ${e.message}`); failed++; });
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }
function assertEq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual); const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}:\n   expected ${b}\n   actual   ${a}`);
}

// ── tx-recording mock ────────────────────────────────────────────────────────

interface RecordedCall { op: string; args: any }

interface MockFixture {
  taskDependencyCount?: number;
  /** PRUNE reads */
  successRows?: Array<{ id: string; supersededById: string | null }>;
  failedRows?: Array<{ id: string }>;
  /** selectAuthoritativeExecution candidates for the upstream source task */
  sourceCandidates?: Array<{ id: string; status: string; createdAt: Date; supersededById: null }>;
  /** upstream source artifacts by name */
  sourceArtifactContent?: string;
  /** CTF: what the C4 EXTRACTION read sees, when it must differ from the selector's floor read (extraction failure). */
  extractionArtifactContent?: string;
  /** rollUpAndDeleteExecutions' DELETE…RETURNING rows (the deleted set the rollup increments from) */
  rollupRows?: any[];
  /** failure CAS result */
  flippedCount?: number;
  /** povId-guard task lookup result */
  sourceTaskInPov?: boolean;
  /** COMPLETE-THEN-FAIL: the task row the in-tx reads return (status/metadata/stage) — defaults keep old fixtures. */
  taskRow?: { type?: string; status?: string; metadata?: Record<string, unknown>; stageId?: string | null; title?: string; stage?: { name: string } | null };
  /** PLATFORM-HELD-BYTES WI-6: make one held createMany throw a REAL Prisma error shape. */
  heldThrow?: { on: 'ref' | 'refusal'; err: unknown };
}

function makeMockTx(fixture: MockFixture, calls: RecordedCall[]) {
  let artifactSeq = 0;
  const createdArtifactRows: Array<{ id: string; name: string; type: string; createdAt: Date; content: string }> = [];
  const ARTIFACT_CREATED_AT = new Date('2026-07-05T00:00:10Z');

  const tx: any = {
    agentExecution: {
      update: (args: any) => { calls.push({ op: 'agentExecution.update', args }); return Promise.resolve({}); },
      updateMany: (args: any) => {
        calls.push({ op: 'agentExecution.updateMany', args });
        return Promise.resolve({ count: fixture.flippedCount ?? 1 });
      },
      findMany: (args: any) => {
        calls.push({ op: 'agentExecution.findMany', args });
        if (args.where?.id?.in) return Promise.resolve(fixture.rollupRows ?? []); // legacy id.in read (rollup now uses $queryRaw)
        if (args.where?.supersededById === null) return Promise.resolve(fixture.sourceCandidates ?? []); // selector
        if (args.where?.status?.in) {
          // Increment 2: prune-on-complete's ONE combined terminal query (status IN [SUCCESS,FAILED]).
          // Synthesize status + distinct createdAt onto the fixtures so the shared selectExecutionsToDelete ranks them.
          const base = new Date('2026-07-05T00:00:00Z').getTime();
          const s = (fixture.successRows ?? []).map((r: any, i: number) => ({ status: 'SUCCESS', createdAt: new Date(base + i * 1000), ...r }));
          const f = (fixture.failedRows ?? []).map((r: any, i: number) => ({ status: 'FAILED', createdAt: new Date(base + i * 1000), ...r }));
          return Promise.resolve([...s, ...f]);
        }
        if (args.where?.status === 'SUCCESS') return Promise.resolve(fixture.successRows ?? []);
        if (args.where?.status === 'FAILED') return Promise.resolve(fixture.failedRows ?? []);
        return Promise.resolve([]);
      },
      deleteMany: (args: any) => { calls.push({ op: 'agentExecution.deleteMany', args }); return Promise.resolve({ count: args.where.id.in.length }); },
    },
    agentArtifact: {
      createMany: (args: any) => {
        calls.push({ op: 'agentArtifact.createMany', args });
        for (const d of args.data) {
          createdArtifactRows.push({ id: `art${++artifactSeq}`, name: d.name, type: d.type, createdAt: ARTIFACT_CREATED_AT, content: d.content });
        }
        return Promise.resolve({ count: args.data.length });
      },
      create: (args: any) => {
        calls.push({ op: 'agentArtifact.create', args });
        return Promise.resolve({ id: `art${++artifactSeq}`, ...args.data });
      },
      findFirst: (args: any) => {
        calls.push({ op: 'agentArtifact.findFirst', args });
        const name = args.where?.name;
        if (name === 'report.md') {
          const row = createdArtifactRows.find(r => r.name === 'report.md');
          return Promise.resolve(row ? { id: row.id } : null);
        }
        if (name === 'pipeline-index.json') {
          const row = createdArtifactRows.find(r => r.name === 'pipeline-index.json');
          return Promise.resolve(row ? { id: row.id, content: row.content } : null);
        }
        if (name === 'result.json') {
          // upstream source result.json read (C4 extraction site)
          const c = fixture.extractionArtifactContent ?? fixture.sourceArtifactContent;
          return Promise.resolve(c != null ? { content: c, executionId: 'srcexec1' } : null);
        }
        if (name?.in) {
          // selector's non-empty-artifact floor check
          return Promise.resolve(fixture.sourceArtifactContent != null
            ? { content: fixture.sourceArtifactContent } : null);
        }
        return Promise.resolve(null);
      },
      findMany: (args: any) => {
        calls.push({ op: 'agentArtifact.findMany', args });
        return Promise.resolve(createdArtifactRows.map(({ id, name, type, createdAt }) => ({ id, name, type, createdAt })));
      },
      update: (args: any) => { calls.push({ op: 'agentArtifact.update', args }); return Promise.resolve({}); },
      deleteMany: (args: any) => { calls.push({ op: 'agentArtifact.deleteMany', args }); return Promise.resolve({}); },
    },
    task: {
      update: (args: any) => { calls.push({ op: 'task.update', args }); return Promise.resolve({}); },
      // COMPLETE-THEN-FAIL O4: the status-predicated writes. `applied` records which one the row lock admits, so a
      // pin can assert the OUTCOME (FAILED vs NULL) and not just the statement text.
      updateMany: (args: any) => {
        const st = fixture.taskRow?.status ?? 'IN_PROGRESS';
        const w = args.where?.status;
        const hit = w === undefined ? true : (typeof w === 'string' ? w === st : (w?.not !== undefined ? w.not !== st : true));
        calls.push({ op: 'task.updateMany', args: { ...args, applied: hit } });
        return Promise.resolve({ count: hit ? 1 : 0 });
      },
      findUnique: (args: any) => {
        calls.push({ op: 'task.findUnique', args });
        if (fixture.taskRow) return Promise.resolve({ type: 'PIPELINE', metadata: {}, stageId: null, title: 'T', stage: null, ...fixture.taskRow });
        return Promise.resolve({ type: fixture === PIPELINE_FIXTURE ? 'PIPELINE' : 'IMPLEMENTATION' });
      },
      findFirst: (args: any) => {
        calls.push({ op: 'task.findFirst', args });
        return Promise.resolve(fixture.sourceTaskInPov ? { id: args.where.id } : null);
      },
    },
    taskDependency: {
      count: (args: any) => { calls.push({ op: 'taskDependency.count', args }); return Promise.resolve(fixture.taskDependencyCount ?? 0); },
    },
    // 2026-07-15 (finding 5): final-comment placeholder substitution — the harness's SYNTHESIZE
    // comment carries {{HARNESS_REPORT_MD_ID}}; the persist now rewrites it alongside the
    // pipeline-index.json substitution. One fixture comment with the token exercises the path.
    comment: {
      findMany: (args: any) => {
        calls.push({ op: 'comment.findMany', args });
        return Promise.resolve([{ id: 'cmt1', text: '📄 Final deliverable: fetch(id: "artifact-{{HARNESS_REPORT_MD_ID}}")' }]);
      },
      update: (args: any) => { calls.push({ op: 'comment.update', args }); return Promise.resolve({}); },
    },
    // 2026-08-23 (FW-A3 campaign): task.comment DUAL-WRITES — the activities copy (details.comment)
    // is what task.context/the activity feed render, and it kept the literal token for a month
    // while the Comment row was substituted. One fixture activity with the token + a sibling
    // details key pins BOTH the substitution and the no-clobber (jsonb read-modify-write) property.
    taskActivity: {
      findMany: (args: any) => {
        calls.push({ op: 'taskActivity.findMany', args });
        return Promise.resolve([{ id: 'act1', details: { comment: '📄 Final deliverable: fetch(id: "artifact-{{HARNESS_REPORT_MD_ID}}")', agentName: 'keep-me' } }]);
      },
      update: (args: any) => { calls.push({ op: 'taskActivity.update', args }); return Promise.resolve({}); },
    },
    // PLATFORM-HELD-BYTES WI-6: the held rows. `heldThrow` injects a real Prisma error shape (P2003 with meta, or a
    // client validation error with no code) to prove the savepoint rollback.
    heldFileRef: {
      createMany: (args: any) => {
        calls.push({ op: 'heldFileRef.createMany', args });
        return fixture.heldThrow?.on === 'ref' ? Promise.reject(fixture.heldThrow.err) : Promise.resolve({ count: args.data.length });
      },
    },
    heldCaptureRefusal: {
      createMany: (args: any) => {
        calls.push({ op: 'heldCaptureRefusal.createMany', args });
        return fixture.heldThrow?.on === 'refusal' ? Promise.reject(fixture.heldThrow.err) : Promise.resolve({ count: args.data.length });
      },
    },
    $executeRaw: (...args: any[]) => { calls.push({ op: '$executeRaw', args: String(args[0]?.raw ?? args[0]).slice(0, 60) }); return Promise.resolve(1); },
    // rollUpAndDeleteExecutions' DELETE … RETURNING (BC-#2). args[1] = the executionIds bound into ANY(${…}).
    // Returns the "deleted rows" the rollup increments from (fixture.rollupRows).
    $queryRaw: (...args: any[]) => { calls.push({ op: '$queryRaw', args }); return Promise.resolve(fixture.rollupRows ?? []); },
  };
  return tx;
}

function makeMockDb(fixture: MockFixture, calls: RecordedCall[]) {
  const tx = makeMockTx(fixture, calls);
  return {
    $transaction: async (fn: (t: any) => Promise<any>) => fn(tx),
    comment: {
      create: (args: any) => { calls.push({ op: 'comment.create', args }); return Promise.resolve({}); },
    },
  } as any;
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const T0 = new Date('2026-07-05T00:00:00Z');       // execution.createdAt
const T1 = new Date('2026-07-05T00:00:02Z');       // startTime (claim)
const T2 = new Date('2026-07-05T00:01:02Z');       // endTime — executionMs 60000, queuedMs 2000

const RESULT_JSON: Record<string, unknown> = {
  taskId: 'cmtask000000000000000001',
  taskTitle: 'Fixture Task',
  agentRole: 'analyst',
  finalResponse: 'Deliverable body. Confidence: 88/100',
  confidenceScore: 88,
  tokensUsed: 1234,
};

function successInput(overrides: Partial<TerminalSuccessInput> = {}): TerminalSuccessInput {
  return {
    executionId: 'cmexec000000000000000001',
    task: { id: 'cmtask000000000000000001', type: 'IMPLEMENTATION', metadata: {}, povId: 'cmpov0000000000000000001', title: 'Fixture Task' },
    finalText: 'Deliverable body. Confidence: 88/100',
    resultJson: RESULT_JSON,
    logs: ['Agent execution started', 'Agent execution completed successfully'],
    endTime: T2,
    executionCreatedAt: T0,
    executionStartTime: T1,
    usage: { inputTokens: 1000, outputTokens: 234, cacheReadTokens: 10, cacheCreationTokens: 5 },
    servingModel: 'claude-sonnet-5',
    supersededById: null,
    agentRole: 'analyst',
    confidenceScore: 88,
    toolCallsTotal: 4,
    toolCallsSucceeded: 3,
    toolCallsFailed: 1,
    commentUserId: 'system',
    truncationStalled: false,
    harnessNoOutput: false,
    synthesizeDeadEnd: false,
    prune: false,
    fireReactors: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    ...overrides,
  };
}

const PIPELINE_FIXTURE: MockFixture = {
  sourceCandidates: [{ id: 'srcexec1', status: 'SUCCESS', createdAt: T0, supersededById: null }],
  sourceArtifactContent: JSON.stringify({ finalResponse: 'Upstream deliverable content, long enough to avoid the <100-char warning path — padding padding padding padding padding.' }),
  sourceTaskInPov: true,
};

(async () => {

// ── Layer 3: units ───────────────────────────────────────────────────────────

await test('buildErrorJson: full union in canonical key order', () => {
  const json = JSON.parse(buildErrorJson({
    errorMessage: 'boom', errorCode: 'USER_CONFIG_REQUIRED', source: 'executeAgent',
    taskId: 't1', taskTitle: 'Title', executionTimeMs: 60000, timestamp: T2,
  }));
  assertEq(Object.keys(json), ['error', 'errorCategory', 'source', 'taskId', 'taskTitle', 'executionTimeMs', 'timestamp'], 'key order');
  assertEq(json.errorCategory, 'USER_CONFIG_REQUIRED', 'errorCategory from typed .code');
  assertEq(json.timestamp, T2.toISOString(), 'timestamp ISO');
});

await test('buildErrorJson: optional fields DROP when absent (engine pre-4b shape minus taskTitle compat)', () => {
  const json = JSON.parse(buildErrorJson({
    errorMessage: 'boom', source: 'safety-net', taskId: 't1', timestamp: T2,
  }));
  assertEq(Object.keys(json), ['error', 'source', 'taskId', 'timestamp'], 'only required keys');
  assert(!('errorCategory' in json) && !('executionTimeMs' in json) && !('taskTitle' in json), 'undefined dropped');
});

await test('resolveAgentRole: engine-canonical chain config > template > task > AI Assistant', () => {
  assertEq(resolveAgentRole('cfg', 'tpl', 'task'), 'cfg', 'config wins');
  assertEq(resolveAgentRole(undefined, 'tpl', 'task'), 'tpl', 'template beats task (the stream mis-mirror had these swapped)');
  assertEq(resolveAgentRole(undefined, undefined, 'task'), 'task', 'task role');
  assertEq(resolveAgentRole(undefined, null, ''), 'AI Assistant', "floor is 'AI Assistant' (engine), not 'custom' (old stream)");
});

// ── Layer 1/2: SUCCESS statement-set + byte pins ─────────────────────────────

await test('stream-config success (prune off): canonical statement order — status-first, artifacts, findMany after substitution region, fresh type read, tasks row LAST', async () => {
  const calls: RecordedCall[] = [];
  const input = successInput();
  await runTerminalSuccessTx(makeMockTx({}, calls), input);
  assertEq(calls.map(c => c.op), [
    'agentExecution.update',     // I-7: status-first (stream's order)
    'task.findUnique',           // LIVE-class metadata read, hoisted 2026-09-16 — feeds BOTH
                                 // getReportMdDecision and the verdict banner. `task.metadata`
                                 // in scope is a PRE-CLAIM snapshot and misses anything the
                                 // agent stamped during its own run.
    'taskDependency.count',      // getReportMdDecision leaf path
    'agentArtifact.createMany',
    'agentArtifact.findMany',    // createdArtifacts — after pointer-substitution region
    'task.findUnique',           // engine's fresh in-tx type read
    'task.update',               // tasks row LAST (deadlock-safe)
  ], 'ordered statement set');
});

await test('success exec-update payload: SUCCESS + endTime + logs + updatedAt=endTime + ONE token-column spread, no supersededById when null', async () => {
  const calls: RecordedCall[] = [];
  const input = successInput();
  await runTerminalSuccessTx(makeMockTx({}, calls), input);
  const data = calls[0].args.data;
  assertEq(data.status, 'SUCCESS', 'status');
  assert(data.endTime === T2 && data.updatedAt === T2, 'endTime/updatedAt = the single endTime const (M11)');
  assertEq(data.logs, input.logs, 'logs adapter-shaped passthrough');
  assertEq(
    { i: data.inputTokens, o: data.outputTokens, cr: data.cacheReadTokens, cc: data.cacheCreationTokens, m: data.modelUsed },
    { i: 1000, o: 234, cr: 10, cc: 5, m: 'claude-sonnet-5' },
    'buildTokenUsageColumns spread'
  );
  assert(!('supersededById' in data), 'no supersededById key when null');
});

await test('keep-best: supersededById lands in the SAME terminal update when set', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({}, calls), successInput({ supersededById: 'cmexecPRIOR0000000000001' }));
  assertEq(calls[0].args.data.supersededById, 'cmexecPRIOR0000000000001', 'supersededById in terminal update');
});

await test('BYTE PIN: result.json artifact = truncate(JSON.stringify(orderResultJsonForPersist({...resultJson, reportMdSource}), null, 2)); report.md = sanitizeLLMForMarkdown(finalText)', async () => {
  const calls: RecordedCall[] = [];
  const input = successInput();
  await runTerminalSuccessTx(makeMockTx({}, calls), input);
  const createMany = calls.find(c => c.op === 'agentArtifact.createMany')!.args.data;
  assertEq(createMany[0].name, 'result.json', 'json artifact name for non-PIPELINE');
  // RWF C.3: the persisted bytes are the ORDERED object — reportMdSource (appended at persist) now precedes the bulky tail.
  assertEq(createMany[0].content, JSON.stringify(orderResultJsonForPersist({ ...RESULT_JSON, reportMdSource: { mode: 'self' } }), null, 2), 'result.json bytes');
  assertEq(createMany[1].name, 'report.md', 'report.md produced for leaf');
  assertEq(createMany[1].content, sanitizeLLMForMarkdown(input.finalText), 'report.md bytes');
});

await test('empty finalText → report.md is the literal *No response generated.* fallback', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({}, calls), successInput({ finalText: '' }));
  const createMany = calls.find(c => c.op === 'agentArtifact.createMany')!.args.data;
  assertEq(createMany[1].content, '*No response generated.*', 'fallback body');
});

await test('task.update payload: executionStatus SUCCESS, status COMPLETED for non-PIPELINE, agentLog, outputArtifacts from in-tx list, updatedAt=endTime', async () => {
  const calls: RecordedCall[] = [];
  const input = successInput();
  await runTerminalSuccessTx(makeMockTx({}, calls), input);
  const data = calls.find(c => c.op === 'task.update')!.args.data;
  assertEq(data.executionStatus, 'SUCCESS', 'executionStatus');
  assertEq(data.status, 'COMPLETED', 'non-PIPELINE auto-complete');
  assertEq(data.agentLog, `Execution started with ID: ${input.executionId}\nAgent execution completed successfully\nArtifacts generated: 2 files`, 'agentLog string');
  assertEq(data.outputArtifacts.map((a: any) => a.name), ['result.json', 'report.md'], 'outputArtifacts from in-tx createdArtifacts');
  assert(data.updatedAt === T2, 'updatedAt = endTime');
});

await test('PIPELINE upstream extraction: pipeline-index.json name, upstream body verbatim (no re-sanitise), pointer substitution, NO task.status write (engine-skip)', async () => {
  const calls: RecordedCall[] = [];
  const placeholderResult = { ...RESULT_JSON, finalResponse: 'See {{HARNESS_REPORT_MD_ID}} for the deliverable.' };
  const input = successInput({
    task: { id: 'cmtask000000000000000001', type: 'PIPELINE', metadata: { deliverableSourceTaskId: 'cmtaskSRC000000000000001' }, povId: 'cmpov0000000000000000001', title: 'Harness' },
    resultJson: placeholderResult,
  });
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, calls), input);

  const createMany = calls.find(c => c.op === 'agentArtifact.createMany')!.args.data;
  assertEq(createMany[0].name, 'pipeline-index.json', 'PIPELINE json artifact name');
  const upstreamBody = JSON.parse(PIPELINE_FIXTURE.sourceArtifactContent!).finalResponse;
  assertEq(createMany[1].content, upstreamBody, 'upstream extraction verbatim — no double-sanitise');
  assert(JSON.parse(createMany[0].content).reportMdSource.mode === 'upstream', 'reportMdSource upstream');

  const artUpdate = calls.find(c => c.op === 'agentArtifact.update');
  assert(artUpdate, 'pointer substitution fired');
  assert(!artUpdate!.args.data.content.includes('{{HARNESS_REPORT_MD_ID}}'), 'placeholder replaced');

  // Finding 5 (2026-07-15): the SYNTHESIZE final COMMENT's placeholder is substituted too.
  const cmtUpdate = calls.find(c => c.op === 'comment.update');
  assert(cmtUpdate, 'comment pointer substitution fired');
  assert(!cmtUpdate!.args.data.text.includes('{{HARNESS_REPORT_MD_ID}}'), 'comment placeholder replaced');
  assert(cmtUpdate!.args.data.text.includes('artifact-'), 'comment carries a real artifact pointer');

  // 2026-08-23 (FW-A3): the ACTIVITIES copy of the comment (details.comment — what task.context
  // and the activity feed render) is substituted too, WITHOUT clobbering sibling details keys
  // (jsonb read-modify-write, never whole-replace of one key).
  const actUpdate = calls.find(c => c.op === 'taskActivity.update');
  assert(actUpdate, 'task_activities comment substitution fired');
  assert(!String(actUpdate!.args.data.details.comment).includes('{{HARNESS_REPORT_MD_ID}}'), 'activities placeholder replaced');
  assert(String(actUpdate!.args.data.details.comment).includes('artifact-'), 'activities copy carries a real artifact pointer');
  assertEq(actUpdate!.args.data.details.agentName, 'keep-me', 'sibling details keys preserved (no jsonb clobber)');

  const taskUpdate = calls.find(c => c.op === 'task.update')!;
  assert(!('status' in taskUpdate.args.data), 'PIPELINE task NOT auto-completed (isPipelineTask skip)');
  assertEq(taskUpdate.args.data.executionStatus, 'SUCCESS', 'executionStatus still SUCCESS');
});

await test('engine-config PRUNE over cap: keep-best inversion prunes superseded losers first; delete+rollup is ONE atomic RETURNING in-tx (BC-#2); tasks row LAST', async () => {
  const calls: RecordedCall[] = [];
  // 11 SUCCESS rows newest-first; the 2nd-newest is a superseded loser. Cap 10 ⇒ exactly one
  // pruned: the SUPERSEDED one (inversion), not the oldest non-superseded.
  const successRows = Array.from({ length: 11 }, (_, i) => ({
    id: `s${i}`, supersededById: i === 1 ? 'winner' : null,
  }));
  // rollupRows = the DELETE…RETURNING set the atomic prune rolls up (one priced row → one bucket increment).
  const rollupRows = [{ startTime: new Date('2026-07-05T00:00:00Z'), inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, modelUsed: 'claude-sonnet-5', povId: 'cpov1' }];
  await runTerminalSuccessTx(makeMockTx({ successRows, failedRows: [], rollupRows }, calls), successInput({ prune: true }));

  const ops = calls.map(c => c.op);
  const delQuery = calls.find(c => c.op === '$queryRaw');
  assert(!!delQuery, 'prune deletes via $queryRaw (DELETE … RETURNING), not a bare deleteMany');
  // I-PRUNE-1 inversion: the SUPERSEDED loser (s1) is the id bound into the atomic delete.
  assertEq(delQuery!.args[1], ['s1'], 'superseded loser pruned, winners kept (I-PRUNE-1 inversion)');
  // BC-#2: no bare deleteMany reopening the concurrent double-count race; artifacts cascade (onDelete: Cascade).
  assert(!ops.includes('agentExecution.deleteMany'), 'no bare agentExecution.deleteMany — the atomic RETURNING owns the delete');
  assert(!ops.includes('agentArtifact.deleteMany'), 'no explicit artifact deleteMany — artifacts cascade');
  // I-PRUNE-2: the rollup increment fires FROM the returned rows, AFTER the delete, in the same tx.
  // Re-keyed 2026-10-14 (PLATFORM-HELD-BYTES WI-6, stated not silent): the rollup is located by its recorded statement
  // text, not as "the first $executeRaw" — a capture fixture's SAVEPOINT is also an $executeRaw. Identical here.
  const isSavepointOp = (c: RecordedCall) => /^\s*(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)\b/.test(String(c.args));
  const qIdx = ops.indexOf('$queryRaw'), eIdx = calls.findIndex(c => c.op === '$executeRaw' && !isSavepointOp(c));
  assert(qIdx !== -1 && eIdx > qIdx, 'rollup increment ($executeRaw) runs after the DELETE … RETURNING (rollup-from-returned-rows, I-PRUNE-2)');
  // tasks row still LAST.
  const taskUpdateIdx = ops.indexOf('task.update');
  assert(qIdx < taskUpdateIdx && eIdx < taskUpdateIdx, 'prune (delete + rollup) before the tasks row (task.update LAST)');
});

// Scoped to NO-CAPTURE fixtures (PLATFORM-HELD-BYTES WI-6): a capture fixture adds SAVEPOINT/RELEASE $executeRaws by design.
await test('prune=false (stream config): ZERO prune statements', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({ successRows: Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, supersededById: null })) }, calls), successInput({ prune: false }));
  assert(!calls.some(c => c.op === '$queryRaw' || c.op === '$executeRaw' || c.op === 'agentExecution.deleteMany' || c.op === 'agentArtifact.deleteMany'), 'no prune writes when prune=false');
});

await test('BYTE PIN: completion comment text + substring cap + userId; timing facts queuedMs=2000/executionMs=60000 (I-6 row-timestamp pair)', async () => {
  const calls: RecordedCall[] = [];
  const input = successInput();
  const result = await persistTerminalSuccess(makeMockDb({}, calls), input);
  assertEq(result.queuedMs, 2000, 'queuedMs = startTime − createdAt');
  assertEq(result.executionMs, 60000, 'executionMs = endTime − startTime');
  assertEq(result.createdArtifacts.map(a => a.name), ['result.json', 'report.md'], 'createdArtifacts returned for adapter reuse (N-2)');

  const comment = calls.find(c => c.op === 'comment.create')!;
  const expected = `## Agent Execution Complete` +
    `\n- **Role**: analyst` +
    `\n- **Duration**: 60s` +
    `\n- **Tool Calls**: 4 (3 succeeded, 1 failed)` +
    `\n- **Confidence**: 88/100` +
    `\n- **Artifacts**:\n  - result.json → \`fetch(id: "artifact-art1")\`\n  - report.md → \`fetch(id: "artifact-art2")\``;
  assertEq(comment.args.data.text, expected, 'comment bytes (engine-canonical template)');
  assertEq(comment.args.data.userId, 'system', 'commentUserId');
  assertEq(comment.args.data.taskId, input.task.id, 'comment taskId');
});

await test('comment failure is LOGGED (N-1, engine-canonical) and never thrown', async () => {
  const calls: RecordedCall[] = [];
  const warns: string[] = [];
  const db = makeMockDb({}, calls);
  db.comment.create = () => Promise.reject(new Error('comment boom'));
  const result = await persistTerminalSuccess(db, successInput({
    logger: { info: () => {}, warn: (_d, m) => warns.push(m), error: () => {} },
  }));
  assert(result.createdArtifacts.length === 2, 'persist result still returned');
  assertEq(warns, ['Failed to create completion comment — non-blocking'], 'warn logged');
});

// ── failure path ─────────────────────────────────────────────────────────────

function failureInput(overrides: Partial<TerminalFailureInput> = {}): TerminalFailureInput {
  return {
    executionId: 'cmexec000000000000000001',
    taskId: 'cmtask000000000000000001',
    taskTitle: 'Fixture Task',
    errorMessage: 'LLM exploded',
    errorCode: 'USER_CONFIG_REQUIRED',
    source: 'executeAgent',
    logs: ['prior log', 'Error occurred after 60000ms: LLM exploded', 'Agent execution failed'],
    endTime: T2,
    executionCreatedAt: T0,
    executionStartTime: T1,
    usage: { inputTokens: 50, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    servingModel: 'claude-sonnet-5',
    fireReactors: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    ...overrides,
  };
}

await test('failure CAS HIT: updateMany(status IN PENDING,RUNNING) → task flip → error.json; payload carries token columns + logs + endTime/updatedAt', async () => {
  const calls: RecordedCall[] = [];
  const result = await runTerminalFailureTx(makeMockTx({ flippedCount: 1 }, calls), failureInput());
  // COMPLETE-THEN-FAIL O4: the task side is the shared helper's TWO status-predicated statements.
  assertEq(calls.map(c => c.op), ['agentExecution.updateMany', 'task.updateMany', 'task.updateMany', 'agentArtifact.create'], 'CAS-hit statement set');
  const cas = calls[0].args;
  assertEq(cas.where.status.in, ['PENDING', 'RUNNING'], 'CAS non-terminal set');
  assertEq(cas.data.status, 'FAILED', 'flips to FAILED');
  assert(cas.data.endTime === T2 && cas.data.updatedAt === T2, 'endTime/updatedAt single const');
  assertEq(cas.data.inputTokens, 50, 'partial spend persisted on FAILED');
  // O4: on a NON-COMPLETED task the applied write is FAILED (the fixture default task is IN_PROGRESS).
  const appliedTaskWrites = calls.filter(c => c.op === 'task.updateMany' && c.args.applied);
  assertEq(appliedTaskWrites.map(c => c.args.data.executionStatus), ['FAILED'], 'task executionStatus FAILED on a non-COMPLETED task');
  assert(result.persisted === true && result.errorArtifactId === 'art1', 'persisted + artifact id returned');

  const errJson = JSON.parse(calls[3].args.data.content);
  assertEq(errJson, {
    error: 'LLM exploded',
    errorCategory: 'USER_CONFIG_REQUIRED',
    source: 'executeAgent',
    taskId: 'cmtask000000000000000001',
    taskTitle: 'Fixture Task',
    executionTimeMs: 60000,
    timestamp: T2.toISOString(),
  }, 'error.json union bytes');

  // errorCode column (2026-07-25): written in the SAME statement as the terminal status flip,
  // from the SAME input value that feeds error.json `errorCategory` — one value, one tx, so the
  // branchable column and the forensic artifact cannot drift.
  assertEq(cas.data.errorCode, 'USER_CONFIG_REQUIRED', 'errorCode on the status-flip statement');
  assertEq(cas.data.errorCode, errJson.errorCategory, 'errorCode === error.json errorCategory (no drift surface)');
});

await test('failure with no code: errorCode column is literal null (never a synthesized placeholder)', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalFailureTx(makeMockTx({ flippedCount: 1 }, calls), failureInput({ errorCode: undefined }));
  const cas = calls[0].args;
  assert('errorCode' in cas.data, 'errorCode key present even with no code');
  assertEq(cas.data.errorCode, null, 'null means "no code recorded" — Protocol 10: never UNKNOWN');
  assert(JSON.parse(calls.find(c => c.op === 'agentArtifact.create')!.args.data.content).errorCategory === undefined, 'errorCategory drops from error.json');
});

await test('failure CAS MISS (row already terminal): ONLY the updateMany — no task flip, no error.json, persisted=false', async () => {
  const calls: RecordedCall[] = [];
  const result = await runTerminalFailureTx(makeMockTx({ flippedCount: 0 }, calls), failureInput());
  assertEq(calls.map(c => c.op), ['agentExecution.updateMany'], 'no follow-on writes on CAS miss');
  assert(result.persisted === false && result.errorArtifactId === null, 'persisted=false, null artifact');
});

await test('persistTerminalFailure (wrapper, reactors off): returns tx result through the $transaction boundary', async () => {
  const calls: RecordedCall[] = [];
  const result = await persistTerminalFailure(makeMockDb({ flippedCount: 1 }, calls), failureInput());
  assert(result.persisted === true, 'persisted');
  assertEq(result.executionMs, 60000, 'executionMs fact');
});

// ── COMPLETE-THEN-FAIL (2026-10-05, DESIGN-v2 §4/§5/§7) ───────────────────────
const CTF_EXEC = 'cmexec000000000000000001';
const CTF_TASK_ROW = {
  type: 'PIPELINE', status: 'COMPLETED',
  metadata: { deliverableSourceTaskId: 'cmtaskSRC000000000000001', pipelineStageId: 'cmstage00000000000000001', completedByExecutionId: CTF_EXEC },
  stageId: 'cmstageP0000000000000001', title: 'Leg', stage: { name: 'Program: X' },
};
const ctfInput = (o: Partial<TerminalSuccessInput> = {}) => successInput({
  executionId: CTF_EXEC,
  task: { id: 'cmtask000000000000000001', type: 'PIPELINE', metadata: { deliverableSourceTaskId: 'cmtaskSRC000000000000001' }, povId: 'cmpov0000000000000000001', title: 'Leg' },
  finalText: '[Platform-authored record — not model output. This SYNTHESIZE run\'s closing turn did not run.]',
  anchored: true,
  ...o,
});

await test('CTF anchored statement set: exec CAS updateMany(status RUNNING) → index + report.md → task executionStatus SUCCESS; NO error.json', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({ ...PIPELINE_FIXTURE, taskRow: CTF_TASK_ROW }, calls), ctfInput());
  const ops = calls.map(c => c.op);
  assertEq(ops[0], 'agentExecution.updateMany', 'first statement is the anchored CAS');
  assertEq(calls[0].args.where, { id: CTF_EXEC, status: 'RUNNING' }, 'CAS predicate: still RUNNING');
  assertEq(calls[0].args.data.status, 'SUCCESS', 'flips to SUCCESS');
  assert(!ops.includes('agentExecution.update'), 'no unconditional exec update on the anchored path');
  const names = calls.find(c => c.op === 'agentArtifact.createMany')!.args.data.map((d: any) => d.name);
  assertEq(names, ['pipeline-index.json', 'report.md'], 'index + report.md');
  assert(!ops.includes('agentArtifact.create'), 'no error.json');
  const taskUpdate = calls.filter(c => c.op === 'task.update').pop()!;
  assertEq(taskUpdate.args.data.executionStatus, 'SUCCESS', 'task executionStatus SUCCESS');
});

await test('CTF normal path unchanged: the unconditional exec update (no CAS) — the documented reliance, D2 filed', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, calls), ctfInput({ anchored: undefined }));
  assertEq(calls[0].op, 'agentExecution.update', 'normal path keeps agentExecution.update');
});

await test('CTF anchored CAS count 0 ⇒ throws PostCompletionAnchorError; ZERO artifact/task/comment statements issued', async () => {
  const calls: RecordedCall[] = [];
  let thrown: unknown = null;
  try { await persistTerminalSuccess(makeMockDb({ ...PIPELINE_FIXTURE, taskRow: CTF_TASK_ROW, flippedCount: 0 }, calls), ctfInput()); }
  catch (e) { thrown = e; }
  assert(thrown instanceof PostCompletionAnchorError && (thrown as PostCompletionAnchorError).code === 'POST_COMPLETION_CAS_MISS', 'CAS miss throws the anchor error');
  assertEq(calls.map(c => c.op), ['agentExecution.updateMany'], 'nothing after the CAS — no artifacts, no task write, no comment');
});

await test('CTF in-tx predicate re-assert: task no longer COMPLETED-by-this-execution ⇒ throws inside the tx (rollback), no post-commit comment', async () => {
  for (const row of [
    { ...CTF_TASK_ROW, status: 'IN_PROGRESS' },
    { ...CTF_TASK_ROW, metadata: { ...CTF_TASK_ROW.metadata, completedByExecutionId: 'cmOTHER00000000000000001' } },
  ]) {
    const calls: RecordedCall[] = [];
    let thrown: unknown = null;
    try { await persistTerminalSuccess(makeMockDb({ ...PIPELINE_FIXTURE, taskRow: row }, calls), ctfInput()); }
    catch (e) { thrown = e; }
    assert(thrown instanceof PostCompletionAnchorError && (thrown as PostCompletionAnchorError).code === 'POST_COMPLETION_PREDICATE_MISMATCH', 'mismatch throws');
    assert(!calls.some(c => c.op === 'task.update' || c.op === 'comment.create'), 'no task write and no comment after the mismatch');
  }
});

await test('CTF extraction failure in anchored mode ⇒ the dedicated fallback body, never the platform text', async () => {
  const calls: RecordedCall[] = [];
  const input = ctfInput();
  await runTerminalSuccessTx(makeMockTx({ ...PIPELINE_FIXTURE, extractionArtifactContent: 'not json {', taskRow: CTF_TASK_ROW }, calls), input);
  const report = calls.find(c => c.op === 'agentArtifact.createMany')!.args.data.find((d: any) => d.name === 'report.md');
  assert(report.content.startsWith('# ⚠️ Report Extraction Failed'), 'error header kept');
  assert(report.content.endsWith(ANCHORED_EXTRACTION_FALLBACK_BODY), 'fixed fallback body');
  assert(!report.content.includes('Platform-authored record'), 'the platform text is NOT the deliverable body');
  // Normal path: the fallback body is still the finalText (unchanged).
  const calls2: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({ ...PIPELINE_FIXTURE, extractionArtifactContent: 'not json {' }, calls2), ctfInput({ anchored: undefined, finalText: 'harness prose' }));
  const r2 = calls2.find(c => c.op === 'agentArtifact.createMany')!.args.data.find((d: any) => d.name === 'report.md');
  assert(r2.content.endsWith('harness prose'), 'normal path fallback body unchanged');
});

// ── WARNINGS-INVISIBLE (2026-10-08): the reviewer-warnings section is rendered FROM THE STAMP on resultJson ──────
const RW_FACT = {
  checked: true, reason: 'transcribed', tier: 'leg', renderScope: 'leg-section', count: 1, ids: ['reachability-after-suppression'],
  reviewers: [{ taskId: 'cmrev', executionId: 'cmrevexec', role: 'change_reviewer', inFlight: false,
    warnings: [{ id: 'reachability-after-suppression', registered: true, text: 'no step proves 10.0.0.1 stays reachable <script>x</script> AKIAIOSFODNN7EXAMPLE' }] }],
};
const rwInput = (fact: unknown, o: Partial<TerminalSuccessInput> = {}) => ctfInput({
  anchored: undefined, finalText: 'harness prose',
  resultJson: fact === undefined ? RESULT_JSON : { ...RESULT_JSON, reviewerWarnings: fact } as any, ...o,
});
const reportOf = (calls: RecordedCall[]) => calls.find(c => c.op === 'agentArtifact.createMany')!.args.data.find((d: any) => d.name === 'report.md').content as string;
const indexOf = (calls: RecordedCall[]) => JSON.parse(calls.find(c => c.op === 'agentArtifact.createMany')!.args.data[0].content);

await test('RW1 section appended after the body from the stamp; statement set identical to the same persist without warnings (no reviewer read in the tx)', async () => {
  const withW: RecordedCall[] = []; const without: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, withW), rwInput(RW_FACT));
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, without), rwInput({ ...RW_FACT, count: 0, ids: [], reviewers: [{ ...RW_FACT.reviewers[0], warnings: [] }] }));
  assertEq(withW.map(c => c.op), without.map(c => c.op), 'same in-tx statement sequence');
  const r = reportOf(withW);
  assert(r.startsWith(reportOf(without).replace(/\s*$/, '')), 'the body is unchanged and a prefix');
  assert(r.includes('## Reviewer warnings (non-blocking)'), 'heading');
  assert(r.includes('- reachability-after-suppression — no step proves 10.0.0.1 stays reachable'), 'line');
  assertEq(indexOf(withW).reportMdSource.reviewerWarningsAppended, 1, 'provenance: appended count');
});

await test('RW2 zero warnings ⇒ report.md byte-identical to a persist with no fact at all; no fact ⇒ not-stamped provenance', async () => {
  const zero: RecordedCall[] = []; const none: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, zero), rwInput({ ...RW_FACT, count: 0, reviewers: [{ ...RW_FACT.reviewers[0], warnings: [] }] }));
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, none), rwInput(undefined));
  assertEq(reportOf(zero), reportOf(none), 'report.md bytes');
  assertEq(indexOf(none).reportMdSource.reviewerWarnings, 'not-stamped', 'absent stamp is named');
  assert(indexOf(zero).reportMdSource.reviewerWarningsAppended === undefined, 'nothing appended ⇒ no appended count');
});

await test('RW3 the section is sanitised (script) and R10-redacted (AKIA) — appended BEFORE redaction', async () => {
  const calls: RecordedCall[] = [];
  const prev = process.env.ARTIFACT_SECRET_REDACT_ENABLED;
  process.env.ARTIFACT_SECRET_REDACT_ENABLED = 'true'; // this suite runs with R10 OFF for its byte pins; on for this test
  try { await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, calls), rwInput(RW_FACT)); }
  finally { process.env.ARTIFACT_SECRET_REDACT_ENABLED = prev; }
  const r = reportOf(calls);
  assert(!r.includes('<script>'), 'script stripped');
  assert(!r.includes('AKIAIOSFODNN7EXAMPLE'), 'secret redacted by R10');
});

await test('RW4 extraction-failure arm and anchored arm both carry the section', async () => {
  const fail: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({ ...PIPELINE_FIXTURE, extractionArtifactContent: 'not json {' }, fail), rwInput(RW_FACT));
  assert(reportOf(fail).startsWith('# ⚠️ Report Extraction Failed') && reportOf(fail).includes('## Reviewer warnings (non-blocking)'), 'failure arm');
  const anch: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({ ...PIPELINE_FIXTURE, taskRow: CTF_TASK_ROW }, anch), ctfInput({ resultJson: { ...RESULT_JSON, reviewerWarnings: RW_FACT } as any }));
  assert(reportOf(anch).includes('## Reviewer warnings (non-blocking)'), 'anchored arm');
});

await test('RW5 fact-only scope (requirements, value legs) ⇒ report.md byte-identical even with warnings', async () => {
  const a: RecordedCall[] = []; const b: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, a), rwInput({ ...RW_FACT, renderScope: 'fact-only' }));
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, b), rwInput(undefined));
  assertEq(reportOf(a), reportOf(b), 'report.md bytes');
});

await test('RW6 source pin: the section is rendered only in execution-terminal-persist.ts (never the engine or stream adapters)', () => {
  const fs = require('fs');
  const hits = (f: string) => (fs.readFileSync(f, 'utf8').match(/appendReviewerWarningsSection/g) || []).length;
  assertEq(hits('lib/services/execution-terminal-persist.ts'), 2, 'import + one call');
  assertEq(hits('lib/services/agentExecutionEngine.ts'), 0, 'engine');
  assertEq(hits('app/api/pov/agent/execute/stream/route.ts'), 0, 'stream');
});

await test('CTF auto-comment: the rescue appends ONE line naming postCompletionFailure; absent on a normal persist', async () => {
  const calls: RecordedCall[] = [];
  await persistTerminalSuccess(makeMockDb({ ...PIPELINE_FIXTURE, taskRow: CTF_TASK_ROW }, calls), ctfInput({ autoCommentNote: 'NOTE-postCompletionFailure' }));
  const c = calls.find(x => x.op === 'comment.create')!.args.data.text as string;
  assert(c.endsWith('\n- NOTE-postCompletionFailure'), 'note appended last');
});

await test('CTF O4: failure tx on a COMPLETED task ⇒ executionStatus NULL; on IN_PROGRESS ⇒ FAILED (outcome, not text)', async () => {
  for (const [status, expected] of [['COMPLETED', null], ['IN_PROGRESS', 'FAILED'], ['OPEN', 'FAILED']] as const) {
    const calls: RecordedCall[] = [];
    await runTerminalFailureTx(makeMockTx({ flippedCount: 1, taskRow: { status } }, calls), failureInput());
    const applied = calls.filter(c => c.op === 'task.updateMany' && c.args.applied);
    assertEq(applied.length, 1, `exactly one task write applies (${status})`);
    assertEq(applied[0].args.data.executionStatus, expected, `task executionStatus on ${status}`);
    assert(!calls.some(c => c.op === 'task.update'), 'no unconditional task.update (would be FAILED or untouched — both wrong)');
  }
});

await test('CTF O4 helper: predicate lives in the WHERE (two statements, no read)', async () => {
  const calls: RecordedCall[] = [];
  await writeTerminatedExecutionTaskStatus(makeMockTx({ taskRow: { status: 'COMPLETED' } }, calls), 't1', T2);
  assertEq(calls.map(c => c.op), ['task.updateMany', 'task.updateMany'], 'two writes, no findUnique');
  assertEq(calls[0].args.where, { id: 't1', status: { not: 'COMPLETED' } }, 'FAILED arm guard');
  assertEq(calls[1].args.where, { id: 't1', status: 'COMPLETED' }, 'NULL arm guard');
});

await test('CTF O4 grep pin: the TWO failure-path sinks write the task side ONLY through the helper', () => {
  const persistSrc = fs.readFileSync(path.join(__dirname, '../lib/services/execution-terminal-persist.ts'), 'utf8');
  const failTx = persistSrc.slice(persistSrc.indexOf('export async function runTerminalFailureTx'), persistSrc.indexOf('export function readPostCompletionRescue'));
  assert(failTx.includes('await writeTerminatedExecutionTaskStatus(tx, input.taskId, input.endTime)'), 'runTerminalFailureTx uses the helper');
  assert(!/executionStatus:\s*'FAILED'/.test(failTx), 'runTerminalFailureTx writes no literal FAILED');
  const engineSrc = fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');
  const net = engineSrc.slice(engineSrc.indexOf('Safety net: the CRASH-ONLY backstop'), engineSrc.indexOf("'Safety net update also failed'"));
  assert(net.length > 0 && net.includes('await writeTerminatedExecutionTaskStatus(tx, execution.taskId, safetyNetEndTime)'), 'safety net uses the helper');
  assert(!/executionStatus:\s*'FAILED'/.test(net), 'safety net writes no literal FAILED');
});

await test('CTF Q1(a): a COMPLETED program leg with a stale duplicateHalt ⇒ no executionStatus FAILED, no cone walk', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({ taskRow: {
    type: 'PIPELINE', status: 'COMPLETED', metadata: { duplicateHalt: { at: 'x' } }, stageId: 'cmstageP0000000000000001', stage: { name: 'Program: X' },
  } }, calls), successInput({ task: { id: 'cmtask000000000000000001', type: 'PIPELINE', metadata: {}, povId: 'p', title: 'Leg' } }));
  const tu = calls.filter(c => c.op === 'task.update').pop()!;
  assertEq(tu.args.data.executionStatus, 'SUCCESS', 'executionStatus SUCCESS — not FAILED');
  assert(!calls.some(c => c.op === 'comment.create' || c.op === '$executeRaw'), 'no cone marks');
  // Control: the SAME halt on an IN_PROGRESS leg still fails it (F17 unchanged where it applies).
  const calls2: RecordedCall[] = [];
  let coneTouched = false;
  // Build review PH-F9: the control carries a stage id, so the cone WALK is asserted too — the gate must not have
  // disabled the walk where the halt applies. markForwardConeBlocked's recursive CTE is a tx.$queryRaw.
  const tx2 = makeMockTx({ taskRow: { type: 'PIPELINE', status: 'IN_PROGRESS', metadata: { duplicateHalt: { at: 'x' } }, stageId: 'cmstageP0000000000000001', stage: { name: 'Program: X' } } }, calls2);
  await runTerminalSuccessTx(tx2, successInput({ task: { id: 'cmtask000000000000000001', type: 'PIPELINE', metadata: {}, povId: 'p', title: 'Leg' } }));
  coneTouched = calls2.filter(c => c.op === 'task.update').pop()!.args.data.executionStatus === 'FAILED';
  assert(coneTouched, 'control: an IN_PROGRESS duplicate-halted leg is still marked FAILED');
  assert(calls2.some(c => c.op === '$queryRaw'), 'control: the forward-cone walk ran (markForwardConeBlocked)');
  assert(!calls.some(c => c.op === '$queryRaw'), 'the COMPLETED leg ran no cone walk');
});

await test('CTF Q1(b): the can-never-run CAS carries the COMPLETED guard UNCONDITIONALLY', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/services/task-can-never-run-persist.ts'), 'utf8');
  assert(/OR: \[[\s\S]*?\],[\s\S]{0,800}?\n\s*status: \{ not: 'COMPLETED' as const \},/.test(src), 'unconditional status guard in the flip WHERE');
  assert(!/allowFlipFromSuccess \? \{ status:/.test(src), 'the guard is no longer conditional on allowFlipFromSuccess');
});

await test('CTF error.json: postCompletionRescue transcribed from originalError; absent otherwise (byte-identical)', async () => {
  const calls: RecordedCall[] = [];
  const err: any = new Error('LLM exploded');
  err.postCompletionRescue = { attempted: false, declinedReason: 'no-deliverable-source', failedWith: null };
  await runTerminalFailureTx(makeMockTx({ flippedCount: 1 }, calls), failureInput({ originalError: err }));
  const ej = JSON.parse(calls.find(c => c.op === 'agentArtifact.create')!.args.data.content);
  assertEq(ej.postCompletionRescue, err.postCompletionRescue, 'outcome transcribed verbatim');
  const calls2: RecordedCall[] = [];
  await runTerminalFailureTx(makeMockTx({ flippedCount: 1 }, calls2), failureInput({ originalError: new Error('plain') }));
  assert(!('postCompletionRescue' in JSON.parse(calls2.find(c => c.op === 'agentArtifact.create')!.args.data.content)), 'absent when not attached');
});

// ── Layer 4: source pins on the core file ────────────────────────────────────

const coreSrc = fs.readFileSync(path.join(__dirname, '../lib/services/execution-terminal-persist.ts'), 'utf8');

await test('source: FAILED persist is the CAS shape + flipped.count===0 guard (Phase 4a survives the extraction)', () => {
  assert(/updateMany\(\{\s*where:\s*\{\s*id:[^}]*status:\s*\{\s*in:\s*\[\s*'PENDING',\s*'RUNNING'\s*\]/.test(coreSrc), 'CAS updateMany present');
  assert(coreSrc.includes('if (flipped.count === 0)'), 'count guard present');
  assert(!/tx\.agentExecution\.update\(\{[\s\S]{0,200}?status:\s*'FAILED'/.test(coreSrc), 'no un-guarded FAILED update');
});

await test('source: reactor wiring — success fires BOTH; failure fires retrigger + the finding-9 TaskReady safety net (status-guarded), via fire-time dynamic imports', () => {
  const successBlock = coreSrc.slice(coreSrc.indexOf('export async function persistTerminalSuccess'), coreSrc.indexOf('export interface TerminalFailureInput'));
  const failureBlock = coreSrc.slice(coreSrc.indexOf('export async function persistTerminalFailure'));
  assert(successBlock.includes("await import('./pipelineRetriggerReactorService')") && successBlock.includes("await import('./taskReadyReactorService')"), 'success imports both reactors at fire time');
  assert(failureBlock.includes("await import('./pipelineRetriggerReactorService')"), 'failure imports retrigger at fire time');
  // Finding 9 (2026-07-15): failure ALSO fires TaskReady as the safety net for the
  // task-complete-handler deferral (a SYNTHESIZE that completed its PIPELINE task then
  // failed before persist must not strand dependents). The historic asymmetry policy
  // ("dependents never queue off a failure") is preserved INSIDE the reactor:
  // maybeQueueReadyDependents no-ops unless task.status === 'COMPLETED'.
  assert(failureBlock.includes("await import('./taskReadyReactorService')"), 'failure fires the TaskReady safety net (finding 9)');
  assert(failureBlock.includes('SAFETY NET'), 'failure-path TaskReady fire carries the finding-9 rationale comment');
});

await test('source: prune routes its delete through the atomic rollUpAndDeleteExecutions in-tx (I-PRUNE-2 / BC-#2)', () => {
  const txBody = coreSrc.slice(coreSrc.indexOf('export async function runTerminalSuccessTx'), coreSrc.indexOf('export async function persistTerminalSuccess'));
  assert(txBody.includes('await rollUpAndDeleteExecutions(tx, allToDelete)'), 'prune uses the atomic rollup+delete (rollup-from-RETURNING)');
  assert(!/agentExecution\.deleteMany/.test(txBody), 'no bare agentExecution.deleteMany in the tx body — a pre-read + separate delete reopens the concurrent double-count race (BC-#2)');
});

await test('source: G8 — core contains ZERO agentExecution.create / status-claim writes', () => {
  assert(!/agentExecution\.create\s*\(/.test(coreSrc), 'no agentExecution.create');
  // COMPLETE-THEN-FAIL (2026-10-05): the ONE permitted `status: 'RUNNING'` is the anchored success CAS's WHERE
  // predicate (it READS RUNNING to flip to SUCCESS — not a claim write). Any other occurrence is still a claim.
  const anchoredCasWhere = "where: { id: executionId, status: 'RUNNING' }";
  assert(coreSrc.split(anchoredCasWhere).length - 1 === 1, 'anchored CAS where-predicate present exactly once');
  assert(!/status:\s*'RUNNING'/.test(coreSrc.split(anchoredCasWhere).join('')), 'no status-claim write');
});

await test('source: report.md verdict banner — fresh-read gated, fact-transcription only, upstream path', () => {
  const persistSrc = fs.readFileSync(path.join(process.cwd(), 'lib/services/execution-terminal-persist.ts'), 'utf8');
  // The banner must read the FRESH task metadata (the in-scope task predates the run's
  // qualityGate stamp) and gate on a non-approved outcome — never fire on approved runs.
  assert(persistSrc.includes("gate?.outcome && gate.outcome !== 'approved'"),
    'banner is gated on a fresh non-approved qualityGate outcome');
  const bannerIdx = persistSrc.indexOf('NOT RELEASED — quality gate');
  assert(bannerIdx > 0, 'banner text present');
  const freshIdx = persistSrc.indexOf('const freshTask = await tx.task.findUnique');
  assert(freshIdx > 0 && freshIdx < bannerIdx, 'banner reads FRESH in-tx metadata (pre-claim task object would miss this run\'s stamp)');
  // Fact-transcription contract: no imperative language in the banner (Steve\'s 2026-08-18 ruling —
  // the banner transcribes stamped facts, it does not instruct the reader).
  const bannerRegion = persistSrc.slice(bannerIdx, bannerIdx + 500);
  assert(!/do not implement|must not|forbidden/i.test(bannerRegion), 'banner carries facts, not imperatives');
});

await test('source: HARNESS_NO_OUTPUT branch sits AFTER the truncation branch (more-specific cause wins) and BOTH are F17/F20-gated', () => {
  const persistSrc = fs.readFileSync(path.join(process.cwd(), 'lib/services/execution-terminal-persist.ts'), 'utf8');
  const truncIdx = persistSrc.indexOf('input.truncationStalled &&');
  const hnoIdx = persistSrc.indexOf('input.harnessNoOutput &&');
  assert(truncIdx > -1 && hnoIdx > -1, 'both Layer-2 branches present');
  assert(truncIdx < hnoIdx, 'truncation (more specific) must be evaluated first — HNO is gated on !programLegCompletion so truncation wins when both facts are true');
});

// RWF C.3 (2026-09-26): PERSIST-TIME key order, pinned on the PERSISTED artifact. Keys appended after the
// builder (net stamps, supersession) must land BEFORE the bulky payloads, or a head-slice reader never sees them.
await test('C3 KEY ORDER: every compact key in the persisted result.json precedes finalResponse/toolCalls — incl. keys appended after the builder', async () => {
  const calls: RecordedCall[] = [];
  const appended = { ...RESULT_JSON, finalResponse: 'x'.repeat(200), toolCalls: [{ tool: 't' }],
    derivationContainment: { checked: true }, supersession: { skipped: 'changed-input' }, verdictFreshness: { checked: false } };
  await persistTerminalSuccess(makeMockDb({}, calls), successInput({ resultJson: appended as any }));
  const writes = calls.filter((c) => c.op === 'agentArtifact.createMany').flatMap((c) => c.args.data);
  const art = writes.find((d: any) => d.name === 'result.json');
  assert(!!art, 'result.json was written');
  const keys = Object.keys(JSON.parse(art.content));
  const firstBulky = Math.min(...['finalResponse', 'toolCalls'].map((k) => keys.indexOf(k)).filter((i) => i >= 0));
  const late = keys.filter((k, i) => i > firstBulky && !['finalResponse', 'toolCalls', 'functionCall', 'webSearchResults', 'citations', 'searchQueries'].includes(k));
  assert(late.length === 0, `compact keys persisted AFTER the bulky payloads: ${late.join(', ')}`);
  assert(keys.indexOf('finalResponse') < keys.indexOf('toolCalls'), 'bulky payloads keep their builder order');
  for (const k of ['derivationContainment', 'supersession', 'verdictFreshness']) assert(keys.includes(k), `${k} was dropped`);
});

// ── PLATFORM-HELD-BYTES Stage A WI-6 (2026-10-14): held rows inside SAVEPOINT held_capture ─────────────────────
const HELD_REF = (i: number) => ({
  scope: 'cmpov0000000000000000001', blobSha256: (i ? 'b' : 'a').repeat(64), executionId: 'cmexec000000000000000001',
  kind: 'CAPTURE', legTaskId: null, rootTaskId: null, serviceId: 'svc1', serviceName: 'observability-readonly',
  sourceTool: 'get_otel_config', toolCallIndex: 2, selector: '/structuredContent/yaml', target: 'obs-otelcol',
  path: '/etc/otelcol/config.yaml', declaredBy: 'platform-default', descriptorVersion: 1, hashBasis: 'legacy-decoded-text',
  decodeVersion: 'paichart.text/1', redactorVersion: 'paichart.r10/2', redactedCount: 0, lineCount: 3, newline: null,
  bom: null, finalNewline: null, serviceReportsComplete: null, derivedRawByteLength: null, placeholderPreexistingCount: 0,
});
const HELD_REFUSAL = {
  executionId: 'cmexec000000000000000001', scope: 'cmpov0000000000000000001', serviceId: null, serviceName: 'observability-readonly',
  identitySource: 'gateway-meta', sourceTool: 'get_ingress_config', toolCallIndex: 1, selector: null, target: null, path: null,
  refusal: 'is-error', detail: { level: 'envelope' }, declaredBy: 'platform-default', descriptorVersion: 1,
};
const BATCH_A = { refs: [HELD_REF(0), HELD_REF(1)], refusals: [HELD_REFUSAL], stats: {} } as any;
const NO_CAPTURE_ORDER = ['agentExecution.update', 'task.findUnique', 'taskDependency.count', 'agentArtifact.createMany', 'agentArtifact.findMany', 'task.findUnique', 'task.update'];
const opsOf = (calls: RecordedCall[]) => calls.map(c => c.op === '$executeRaw' ? `$executeRaw ${String(c.args).trim().split(/\s+/).slice(0, 2).join(' ')}` : c.op);
const artifactData = (calls: RecordedCall[]) => JSON.stringify(calls.filter(c => c.op === 'agentArtifact.createMany').map(c => c.args.data));

await test('HELD A: capture rows sit in SAVEPOINT held_capture right after agentArtifact.createMany, before findMany; artifacts byte-equal', async () => {
  const base: RecordedCall[] = [], calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({}, base), successInput());
  await runTerminalSuccessTx(makeMockTx({}, calls), successInput({ heldCaptures: BATCH_A }));
  assertEq(opsOf(calls), ['agentExecution.update', 'task.findUnique', 'taskDependency.count', 'agentArtifact.createMany',
    '$executeRaw SAVEPOINT held_capture', 'heldFileRef.createMany', 'heldCaptureRefusal.createMany', '$executeRaw RELEASE SAVEPOINT',
    'agentArtifact.findMany', 'task.findUnique', 'task.update'], 'ordered statement set with capture');
  assertEq(artifactData(calls), artifactData(base), 'artifact CONTENT byte-equal to the no-capture persist (EF S-6.2)');
});
await test('HELD A (prune on): the rollup pin, re-keyed on statement text, still finds the rollup after the DELETE … RETURNING', async () => {
  const calls: RecordedCall[] = [];
  const successRows = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, supersededById: null }));
  const rollupRows = [{ startTime: new Date('2026-07-05T00:00:00Z'), inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, modelUsed: 'claude-sonnet-5', povId: 'cpov1' }];
  await runTerminalSuccessTx(makeMockTx({ successRows, failedRows: [], rollupRows }, calls), successInput({ prune: true, heldCaptures: BATCH_A }));
  const isSp = (c: RecordedCall) => /^\s*(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)\b/.test(String(c.args));
  const sp = calls.findIndex(c => c.op === '$executeRaw' && isSp(c));
  const rollup = calls.findIndex(c => c.op === '$executeRaw' && !isSp(c));
  const q = calls.findIndex(c => c.op === '$queryRaw');
  assert(sp !== -1 && sp < q && rollup > q, 'savepoint before the prune; rollup after the DELETE … RETURNING');
});
await test('HELD B: the blob upsert is NOT in the transaction — the only raw statements are SAVEPOINT/RELEASE', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({}, calls), successInput({ heldCaptures: { refs: [HELD_REF(0)], refusals: [], stats: {} } as any }));
  const raws = calls.filter(c => c.op === '$executeRaw').map(c => String(c.args));
  assert(raws.length === 2 && raws.every(r => /SAVEPOINT/.test(r)), `raw statements: ${JSON.stringify(raws)}`);
  assert(!raws.some(r => /held_blobs/.test(r)), 'no INSERT INTO held_blobs in the tx');
  assert(!calls.some(c => c.op === 'heldCaptureRefusal.createMany'), 'no refusal createMany when there are no refusals');
});
await test('HELD C: an EMPTY batch issues ZERO new statements (no savepoint) — identical to no capture', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({}, calls), successInput({ heldCaptures: { refs: [], refusals: [], stats: {} } as any }));
  assertEq(calls.map(c => c.op), NO_CAPTURE_ORDER, 'ordered statement set');
});
for (const [label, err] of [
  ['P2003 FK error (real shape)', Object.assign(new Error('Foreign key constraint failed DETAIL: Key (scope, "blobSha256")=(cmpov, aaaa) is not present'), { name: 'PrismaClientKnownRequestError', code: 'P2003', meta: { code: '23503', message: 'DETAIL: Key (scope, sha256)=(cmpov, aaaa)' } })],
  ['client validation error (no code)', Object.assign(new Error('Argument `serviceId` is missing.'), { name: 'PrismaClientValidationError' })],
] as const) {
  await test(`HELD D: ${label} ⇒ ROLLBACK TO SAVEPOINT, the transaction continues, the warn carries name/code/metaCode only`, async () => {
    const calls: RecordedCall[] = [];
    const warns: Array<{ o: any; m: string }> = [];
    const logger = { info: () => {}, warn: (o: any, m: string) => { warns.push({ o, m }); }, error: () => {} };
    const base: RecordedCall[] = [];
    await runTerminalSuccessTx(makeMockTx({}, base), successInput());
    const res = await runTerminalSuccessTx(makeMockTx({ heldThrow: { on: 'ref', err } }, calls), successInput({ heldCaptures: BATCH_A, logger }));
    assert(!!res, 'the function resolved');
    const ops = opsOf(calls);
    assert(ops.includes('$executeRaw ROLLBACK TO'), `rollback recorded: ${ops.join(', ')}`);
    assert(!ops.includes('$executeRaw RELEASE SAVEPOINT'), 'no RELEASE after a rollback');
    assertEq(ops.slice(ops.indexOf('$executeRaw ROLLBACK TO') + 1), ['agentArtifact.findMany', 'task.findUnique', 'task.update'], 'every later op still runs, task.update LAST');
    assertEq(artifactData(calls), artifactData(base), 'artifacts byte-equal');
    const w = warns.find(x => /held-bytes/.test(x.m));
    assert(!!w, 'a held-bytes warn was logged');
    const keys = Object.keys(w!.o).sort();
    assert(keys.every(k => ['code', 'executionId', 'metaCode', 'name', 'refs', 'refusals'].includes(k)), `warn keys: ${keys.join(',')}`);
    assert(!/DETAIL|Key \(/.test(JSON.stringify(w!.o)), 'no Postgres DETAIL / key values in the warn');
  });
}
await test('HELD brackets pin: between SAVEPOINT and RELEASE there are ONLY the two held createMany calls', async () => {
  const calls: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx({}, calls), successInput({ heldCaptures: BATCH_A }));
  const ops = opsOf(calls);
  const inside = ops.slice(ops.indexOf('$executeRaw SAVEPOINT held_capture') + 1, ops.indexOf('$executeRaw RELEASE SAVEPOINT'));
  assertEq(inside, ['heldFileRef.createMany', 'heldCaptureRefusal.createMany'], 'savepoint contents');
});
await test('HELD PIPELINE fixture: pipeline-index.json + report.md content byte-equal with and without capture', async () => {
  const mk = (held: boolean) => successInput({
    task: { id: 'cmtask000000000000000001', type: 'PIPELINE', metadata: { deliverableSourceTaskId: 'cmtaskSRC000000000000001' }, povId: 'cmpov0000000000000000001', title: 'Harness' },
    ...(held ? { heldCaptures: BATCH_A } : {}),
  });
  const a: RecordedCall[] = [], b: RecordedCall[] = [];
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, a), mk(false));
  await runTerminalSuccessTx(makeMockTx(PIPELINE_FIXTURE, b), mk(true));
  assertEq(artifactData(b), artifactData(a), 'PIPELINE artifacts byte-equal');
  assert(b.some(c => c.op === 'heldFileRef.createMany'), 'capture rows written');
});
await test('HELD source: no held rows on the failure path (rows ⇔ SUCCESS)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'services', 'execution-terminal-persist.ts'), 'utf8');
  const fail = src.slice(src.indexOf('export async function runTerminalFailureTx('));
  assert(!/heldFileRef|heldCaptureRefusal|insertHeldCaptureRows/.test(fail.slice(0, fail.indexOf('\nexport ', 10) > 0 ? fail.indexOf('\nexport ', 10) : fail.length)), 'failure tx writes held rows');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
