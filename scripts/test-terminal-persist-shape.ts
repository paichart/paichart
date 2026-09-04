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
} from '../lib/services/execution-terminal-persist';
import { sanitizeLLMForMarkdown } from '../lib/services/execution-artifacts';

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
  /** rollUpAndDeleteExecutions' DELETE…RETURNING rows (the deleted set the rollup increments from) */
  rollupRows?: any[];
  /** failure CAS result */
  flippedCount?: number;
  /** povId-guard task lookup result */
  sourceTaskInPov?: boolean;
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
          return Promise.resolve(fixture.sourceArtifactContent != null
            ? { content: fixture.sourceArtifactContent, executionId: 'srcexec1' } : null);
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
      findUnique: (args: any) => {
        calls.push({ op: 'task.findUnique', args });
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

await test('BYTE PIN: result.json artifact = truncate(JSON.stringify({...resultJson, reportMdSource}, null, 2)); report.md = sanitizeLLMForMarkdown(finalText)', async () => {
  const calls: RecordedCall[] = [];
  const input = successInput();
  await runTerminalSuccessTx(makeMockTx({}, calls), input);
  const createMany = calls.find(c => c.op === 'agentArtifact.createMany')!.args.data;
  assertEq(createMany[0].name, 'result.json', 'json artifact name for non-PIPELINE');
  assertEq(createMany[0].content, JSON.stringify({ ...RESULT_JSON, reportMdSource: { mode: 'self' } }, null, 2), 'result.json bytes');
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
  const qIdx = ops.indexOf('$queryRaw'), eIdx = ops.indexOf('$executeRaw');
  assert(qIdx !== -1 && eIdx > qIdx, 'rollup increment ($executeRaw) runs after the DELETE … RETURNING (rollup-from-returned-rows, I-PRUNE-2)');
  // tasks row still LAST.
  const taskUpdateIdx = ops.indexOf('task.update');
  assert(qIdx < taskUpdateIdx && eIdx < taskUpdateIdx, 'prune (delete + rollup) before the tasks row (task.update LAST)');
});

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
  assertEq(calls.map(c => c.op), ['agentExecution.updateMany', 'task.update', 'agentArtifact.create'], 'CAS-hit statement set');
  const cas = calls[0].args;
  assertEq(cas.where.status.in, ['PENDING', 'RUNNING'], 'CAS non-terminal set');
  assertEq(cas.data.status, 'FAILED', 'flips to FAILED');
  assert(cas.data.endTime === T2 && cas.data.updatedAt === T2, 'endTime/updatedAt single const');
  assertEq(cas.data.inputTokens, 50, 'partial spend persisted on FAILED');
  assertEq(calls[1].args.data.executionStatus, 'FAILED', 'task executionStatus FAILED');
  assert(result.persisted === true && result.errorArtifactId === 'art1', 'persisted + artifact id returned');

  const errJson = JSON.parse(calls[2].args.data.content);
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
  assert(JSON.parse(calls[2].args.data.content).errorCategory === undefined, 'errorCategory drops from error.json');
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
  assert(!/status:\s*'RUNNING'/.test(coreSrc), 'no status-claim write');
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

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
