#!/usr/bin/env ts-node
/**
 * replay-completion-anchored.ts — COMPLETE-THEN-FAIL phase-1 acceptance replay (DESIGN-v2 §7 "Replay acceptance").
 *
 * READ-ONLY against production. Refuses to run unless the session reports `default_transaction_read_only = on`
 * (pass the option in the URL: `?options=-c%20default_transaction_read_only%3Don`). Nothing is written to the
 * preserved fixture or anywhere else on prod: the persist half runs through a RECORDING tx whose reads pass through
 * and whose writes are captured in memory only.
 *
 *   --builder [legId ...]   (prod, read-only)
 *       1. builder half: run `buildCompletionAnchoredResult` (the rescue's DB-only builder, no writes) over the leg and
 *          compare each leg-synthesize net key BYTE-FOR-BYTE with `scripts/replay-nets.ts` output for the same leg;
 *       2. second specimen: for a normally-SYNTHESIZEd leg, compare the builder's net keys with the LIVE stamped keys
 *          on its authoritative pipeline-index.json (proves no fork of net inputs);
 *       3. report.md: run the SHARED success-tx body (runTerminalSuccessTx) through the recording tx and compare the
 *          report.md it would write with the extraction of the source's authoritative result.json.
 *       Writes a bundle (rows + the builder's artifacts) to --out for the chainer half.
 *   --chainer <bundle.json> (LOCAL database)
 *       4. chainer half: materialize the bundle into a fresh local POV (the leg, its program stage siblings that the
 *          consumers depend on, the producer and Node C), add the builder's artifacts as a new SUCCESS execution of the
 *          leg, and assert producer + Node C chain `source: 'report.md'`, `degraded: false`, `degradedPredecessors: 0`,
 *          and that agent.results names the rescued execution as authoritative and carries derivationContainment.
 *          The local POV is deleted afterwards.
 *
 * The predicate is deliberately NOT proven here: the fixture predates the anchor stamp, and injecting it into a
 * snapshot is the §5b hazard. The predicate is pinned by test-post-completion-rescue.ts, which writes the stamp
 * through completeTaskTerminally.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { buildCompletionAnchoredResult, buildPostCompletionFailureFact } from '../lib/services/execution-completion-anchored';
import { runTerminalSuccessTx, stripPreHeadingPreamble } from '../lib/services/execution-terminal-persist';
import { selectAuthoritativeExecution, CHAIN_SELECTION_OPTIONS } from '../lib/services/execution-selection';
import { AGENTIC_LOOP_PARTIAL_BRAND, type AgenticLoopPartial } from '../lib/agents/harness/agentic-tool-loop';

const FIXTURE_LEG = 'cmutguolg0013yx0gjnhituqp';
const FIXTURE_SOURCE_TASK = 'cmutj3u4600efyx0fgyr55ds4';
const FIXTURE_SOURCE_EXEC = 'cmutj4yn500flyx0f8otwz0yc';
const FIXTURE_FAILED_EXEC = 'cmutj9uay0059yx0gxfr1t69a';
const SPECIMEN_LEG = 'cmutnfqg300z0yx0fy912l1el';
const CONSUMERS = ['cmutgw1tv002kyx0g05ulo280', 'cmutgw1vl002syx0gg8n8lu9v']; // producer, Node C
const NETS = ['derivationContainment', 'dialectLint', 'contractPropagation', 'rollbackContainment', 'verdictFreshness'];

const silent = { info() {}, warn() {}, error() {}, debug() {} };
let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** A synthetic partial: the nets never read it; it only feeds counts in the built object. */
const PARTIAL: AgenticLoopPartial = {
  brand: AGENTIC_LOOP_PARTIAL_BRAND, toolCallResults: [], failedToolCalls: 0,
  totalUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  servingModel: null, turnCount: 0, finalStopReason: null, phase: 'continuation', turn: 0,
  causeClass: 'provider', providerErrorType: 'overloaded_error', requestId: null,
};

async function assertReadOnly(p: PrismaClient) {
  const r = await p.$queryRawUnsafe<Array<{ default_transaction_read_only: string }>>('SHOW default_transaction_read_only');
  if (r[0]?.default_transaction_read_only !== 'on') {
    throw new Error('REFUSING: the session is not read-only. Add ?options=-c%20default_transaction_read_only%3Don to DATABASE_URL.');
  }
}

/** A tx whose READS pass through to the real client and whose WRITES are recorded in memory only. */
function recordingTx(p: PrismaClient, writes: Array<{ op: string; args: any }>) {
  const WRITE = new Set(['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']);
  return new Proxy(p as any, {
    get(target, model: string) {
      if (model === '$executeRaw' || model === '$executeRawUnsafe') return (...a: any[]) => { writes.push({ op: model, args: a }); return Promise.resolve(1); };
      const d = target[model];
      if (!d || typeof d !== 'object') return d;
      return new Proxy(d, {
        get(dt, method: string) {
          if (WRITE.has(method)) {
            return (args: any) => {
              writes.push({ op: `${model}.${method}`, args });
              if (method === 'createMany' || method === 'updateMany' || method === 'deleteMany') return Promise.resolve({ count: 1 });
              return Promise.resolve({ id: `recorded-${writes.length}`, ...(args?.data ?? {}) });
            };
          }
          const f = dt[method];
          return typeof f === 'function' ? f.bind(dt) : f;
        },
      });
    },
  });
}

async function buildFor(p: PrismaClient, legId: string, executionId: string) {
  const task = await p.task.findUniqueOrThrow({ where: { id: legId },
    select: { id: true, type: true, title: true, metadata: true, inputContext: true, povId: true, createdAt: true, agentRole: true, completedAt: true } });
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const fact = buildPostCompletionFailureFact({ err: Object.assign(new Error('replay'), { code: 'LLM_PROVIDER_OVERLOADED' }),
    partial: PARTIAL, taskCompletedAt: task.completedAt, failedAt: new Date('2026-10-04T08:04:00Z') });
  const built = await buildCompletionAnchoredResult(p, {
    executionId, execution: { id: executionId, createdAt: null, context: {} },
    task: { id: task.id, type: task.type, metadata: task.metadata, povId: task.povId, title: task.title, createdAt: task.createdAt, inputContext: task.inputContext },
    config: {}, agentRole: task.agentRole ?? 'AI Assistant', harnessContext: { mode: 'SYNTHESIZE', reasonCode: 'replay' } as never,
    maxToolTurns: 100, mcpFunctions: [], modelFallback: null, partial: PARTIAL, fact,
    deliverableSourceTaskId: String(meta.deliverableSourceTaskId ?? ''), startTime: new Date('2026-10-04T08:02:51Z'),
    endTime: new Date('2026-10-04T08:04:00Z'), logger: silent as never,
  });
  return { task, built };
}

/** Parse `replay-nets.ts <leg>` output: `▶ <name>` followed by an indented JSON block. */
function replayNetsOutput(legId: string): Record<string, string> {
  const out = execFileSync('npx', ['ts-node', '--compiler-options', '{"module":"commonjs"}', 'scripts/replay-nets.ts', legId],
    { encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const res: Record<string, string> = {};
  const lines = out.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {2}▶ (\w+)$/.exec(lines[i]);
    if (!m) continue;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length && lines[j].startsWith('    '); j++) block.push(lines[j].slice(4));
    res[m[1]] = block.join('\n');
  }
  return res;
}

async function builderMode(legs: string[], outPath: string) {
  const p = new PrismaClient();
  await assertReadOnly(p);
  console.log('session read-only: on\n');
  const bundle: any = { legs: {} };

  for (const legId of legs) {
    console.log(`── ${legId} ──`);
    const { built } = await buildFor(p, legId, legId === FIXTURE_LEG ? FIXTURE_FAILED_EXEC : 'replay-specimen');
    const replay = replayNetsOutput(legId);
    // 1. byte identity with replay-nets.ts
    for (const net of NETS) {
      const mine = net in built.resultJson ? JSON.stringify(built.resultJson[net], null, 2) : null;
      const theirs = replay[net] ?? null;
      check(mine !== null && mine === theirs, `[replay-nets] ${net} byte-identical`,
        mine === theirs ? `${(mine ?? '').length} bytes` : `builder ${mine?.length ?? 'absent'} vs replay-nets ${theirs?.length ?? 'absent'}`);
    }
    // 2. LIVE stamps (specimen only — the fixture never had a SYNTHESIZE persist)
    if (legId !== FIXTURE_LEG) {
      const { execution } = await selectAuthoritativeExecution(p, legId, CHAIN_SELECTION_OPTIONS);
      const art = execution ? await p.agentArtifact.findFirst({ where: { executionId: execution.id, name: 'pipeline-index.json' }, select: { content: true } }) : null;
      const live = art ? JSON.parse(art.content) : {};
      for (const net of NETS) {
        const a = JSON.stringify(built.resultJson[net]); const b = JSON.stringify(live[net]);
        check(a === b, `[live stamp ${execution?.id}] ${net} equal`, a === b ? `${a.length} bytes` : `builder ${a?.length} vs live ${b?.length}`);
      }
    }
    // 3. report.md via the SHARED success-tx body through a recording tx (reads real, writes captured)
    const writes: Array<{ op: string; args: any }> = [];
    const task = await p.task.findUniqueOrThrow({ where: { id: legId }, select: { id: true, type: true, metadata: true, povId: true, title: true } });
    await runTerminalSuccessTx(recordingTx(p, writes) as never, {
      executionId: legId === FIXTURE_LEG ? FIXTURE_FAILED_EXEC : 'replay-specimen',
      task, finalText: built.finalText, resultJson: built.resultJson, logs: [], endTime: new Date('2026-10-04T08:04:00Z'),
      executionCreatedAt: null, executionStartTime: null, usage: undefined, servingModel: null, supersededById: null,
      truncationStalled: false, synthesizeDeadEnd: false, harnessNoOutput: false, agentRole: 'AI Assistant', confidenceScore: null,
      toolCallsTotal: 0, toolCallsSucceeded: 0, toolCallsFailed: 0, commentUserId: 'system', prune: false, fireReactors: false,
      logger: silent as never,
      // anchored:false — the fixture carries no anchor stamp, and the in-tx re-assert would (correctly) refuse it.
      // The report.md decision + extraction code is the SAME code on both settings; only the extraction-FAILURE
      // fallback body branches on `anchored` (pinned in test-terminal-persist-shape).
    });
    const created = writes.find((w) => w.op === 'agentArtifact.createMany')?.args?.data ?? [];
    const reportMd = created.find((d: any) => d.name === 'report.md')?.content ?? null;
    const indexJson = created.find((d: any) => d.name === 'pipeline-index.json')?.content ?? null;
    const writeOps = [...new Set(writes.map((w) => w.op))];
    console.log(`  · recorded (NOT executed) write ops: ${writeOps.join(', ')}`);
    if (legId === FIXTURE_LEG) {
      const src = await p.agentArtifact.findFirst({ where: { executionId: FIXTURE_SOURCE_EXEC, name: 'result.json' }, select: { content: true } });
      const { execution: auth } = await selectAuthoritativeExecution(p, FIXTURE_SOURCE_TASK, { requireNonEmptyArtifact: true });
      check(auth?.id === FIXTURE_SOURCE_EXEC, `source's authoritative execution is ${FIXTURE_SOURCE_EXEC}`, String(auth?.id));
      const expected = stripPreHeadingPreamble(JSON.parse(src!.content).finalResponse).text;
      check(reportMd === expected, 'report.md === the extraction of the source authoritative result.json', `${reportMd?.length ?? 'absent'} vs ${expected.length} chars`);
      const idx = JSON.parse(indexJson);
      check(idx.reportMdSource?.mode === 'upstream' && idx.reportMdSource.sourceTaskId === FIXTURE_SOURCE_TASK && !idx.reportMdSource.extractFailureReason,
        'pipeline-index.json reportMdSource: upstream, extracted', JSON.stringify(idx.reportMdSource));
      bundle.builtArtifacts = { pipelineIndex: indexJson, reportMd };
    } else {
      const { execution } = await selectAuthoritativeExecution(p, legId, CHAIN_SELECTION_OPTIONS);
      const liveReport = execution ? await p.agentArtifact.findFirst({ where: { executionId: execution.id, name: 'report.md' }, select: { content: true } }) : null;
      check(!!liveReport && reportMd === liveReport.content, 'specimen: report.md === its LIVE report.md', `${reportMd?.length} vs ${liveReport?.content.length}`);
    }
    console.log('');
  }

  // Rows for the chainer half (read-only SELECTs).
  const ids = new Set<string>([FIXTURE_LEG, ...CONSUMERS]);
  const deps = await p.taskDependency.findMany({ where: { taskId: { in: CONSUMERS } }, select: { taskId: true, dependsOnId: true } });
  deps.forEach((d) => ids.add(d.dependsOnId));
  const tasks = await p.task.findMany({ where: { id: { in: [...ids] } },
    select: { id: true, title: true, type: true, status: true, executionStatus: true, metadata: true, inputContext: true, agentRole: true, stageId: true, createdAt: true } });
  const execs: any[] = []; const arts: any[] = [];
  for (const t of tasks) {
    const { execution } = await selectAuthoritativeExecution(p, t.id, CHAIN_SELECTION_OPTIONS);
    if (!execution) continue;
    const row = await p.agentExecution.findUniqueOrThrow({ where: { id: execution.id }, select: { id: true, taskId: true, status: true, createdAt: true } });
    execs.push(row);
    arts.push(...await p.agentArtifact.findMany({ where: { executionId: row.id, name: { in: ['pipeline-index.json', 'report.md', 'result.json'] } },
      select: { executionId: true, name: true, type: true, content: true } }));
  }
  const failedExec = await p.agentExecution.findUniqueOrThrow({ where: { id: FIXTURE_FAILED_EXEC }, select: { id: true, taskId: true, status: true, createdAt: true } });
  Object.assign(bundle, { tasks, deps, execs, arts, failedExec });
  fs.writeFileSync(outPath, JSON.stringify(bundle));
  console.log(`bundle → ${outPath} (${tasks.length} tasks, ${execs.length} executions, ${arts.length} artifacts)`);
  await p.$disconnect();
}

async function chainerMode(bundlePath: string) {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
  const { chainDependencyContext } = require('../lib/agents/harness/context-chainer');
  const { handleAgentResults } = require('../lib/mcp/tasks/action/handlers/agent/agent-results-handler');
  /* eslint-enable @typescript-eslint/no-var-requires */
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost:5432|127\.0\.0\.1:5432|\/var\/run\/postgresql/.test(url) || /15432/.test(url)) throw new Error('REFUSING: --chainer writes; it runs against the LOCAL database only');
  const b = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
  const country = await prisma.country.findFirst({ select: { id: true } });
  const now = new Date(); const future = new Date(now.getTime() + 30 * 86400000);
  const pov = await prisma.pOV.create({ data: { title: `__replay_ctf_${Date.now()}`, description: 'COMPLETE-THEN-FAIL chainer replay (local restore)',
    ownerId: owner!.id, status: 'PROJECTED', startDate: now, endDate: future, salesTheatre: 'NORTH_AMERICA', countryId: country!.id } });
  const phase = await prisma.phase.create({ data: { name: 'P', type: 'EXECUTION', povId: pov.id, order: 0, description: '', startDate: now, endDate: future } });
  const stageIds = new Set<string>(b.tasks.map((t: any) => t.stageId).filter(Boolean));
  try {
    let o = 0;
    for (const sid of stageIds) {
      const existing = await prisma.stage.findUnique({ where: { id: sid } });
      if (existing) throw new Error(`REFUSING: stage ${sid} already exists locally — a previous replay was not cleaned up`);
      await prisma.stage.create({ data: { id: sid, name: `Program: replay ${o}`, phaseId: phase.id, order: o++ } });
    }
    for (const t of b.tasks) {
      await prisma.task.create({ data: { id: t.id, title: t.title, type: t.type, status: t.status,
        // The O4 world: the fixture leg's task column after this batch is NULL (it was written FAILED before O4).
        executionStatus: t.id === FIXTURE_LEG ? null : t.executionStatus,
        metadata: t.metadata ?? undefined, inputContext: t.inputContext ?? undefined, agentRole: t.agentRole, stageId: t.stageId, povId: pov.id, createdAt: new Date(t.createdAt) } });
    }
    for (const d of b.deps) await prisma.taskDependency.create({ data: { taskId: d.taskId, dependsOnId: d.dependsOnId } });
    for (const e of [...b.execs, b.failedExec]) {
      await prisma.agentExecution.create({ data: { id: e.id, taskId: e.taskId, status: e.status, createdAt: new Date(e.createdAt), config: {}, context: {}, logs: [] } });
    }
    for (const a of b.arts) await prisma.agentArtifact.create({ data: { executionId: a.executionId, name: a.name, type: a.type, content: a.content } });

    // BEFORE materializing: today's world — the S3 leg chains its CREATE-time index and F19 marks it degraded.
    const before = await chainDependencyContext(CONSUMERS[1], prisma);
    const beforeS3 = before?.chainedFrom?.find((e: any) => e.taskId === FIXTURE_LEG);
    check(beforeS3?.source === 'pipeline-index.json' && beforeS3?.degraded === true, 'BEFORE (control): Node C chains the S3 CREATE index, degraded',
      JSON.stringify({ source: beforeS3?.source, degraded: beforeS3?.degraded }));

    // Materialize the builder's artifacts as the rescued SUCCESS execution (after the FAILED one).
    const rescued = await prisma.agentExecution.create({ data: { taskId: FIXTURE_LEG, status: 'SUCCESS', config: {}, context: {}, logs: [],
      createdAt: new Date(new Date(b.failedExec.createdAt).getTime() + 1000) } });
    await prisma.agentArtifact.create({ data: { executionId: rescued.id, name: 'pipeline-index.json', type: 'application/json', content: b.builtArtifacts.pipelineIndex } });
    await prisma.agentArtifact.create({ data: { executionId: rescued.id, name: 'report.md', type: 'text/markdown', content: b.builtArtifacts.reportMd } });
    await prisma.task.update({ where: { id: FIXTURE_LEG }, data: { executionStatus: 'SUCCESS' } });

    for (const consumer of CONSUMERS) {
      const ctx = await chainDependencyContext(consumer, prisma);
      const s3 = ctx?.chainedFrom?.find((e: any) => e.taskId === FIXTURE_LEG);
      check(s3?.source === 'report.md' && s3?.degraded === false, `[${consumer}] S3 leg chains report.md, degraded:false`, JSON.stringify({ source: s3?.source, degraded: s3?.degraded }));
      check(ctx?.pipelineMetadata?.degradedPredecessors === 0, `[${consumer}] degradedPredecessors: 0`, String(ctx?.pipelineMetadata?.degradedPredecessors));
    }
    const res = await handleAgentResults({ taskId: FIXTURE_LEG }, { userId: owner!.id, email: owner!.email, role: 'ADMIN' } as never, 'replay');
    const text = JSON.stringify(res);
    check(text.includes(rescued.id), 'agent.results names the rescued execution', rescued.id);
    check(text.includes('derivationContainment'), 'agent.results carries derivationContainment');
    check(text.includes('postCompletionFailure'), 'agent.results carries postCompletionFailure (the whitelist entry is the hoist)');
  } finally {
    const taskIds = b.tasks.map((t: any) => t.id);
    await prisma.agentExecution.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.taskDependency.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { povId: pov.id } });
    await prisma.stage.deleteMany({ where: { phase: { povId: pov.id } } });
    await prisma.phase.deleteMany({ where: { povId: pov.id } });
    await prisma.pOV.delete({ where: { id: pov.id } });
  }
}

(async () => {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : '/tmp/ctf-replay-bundle.json';
  if (argv[0] === '--builder') {
    const legs = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--out');
    await builderMode(legs.length ? legs : [FIXTURE_LEG, SPECIMEN_LEG], outPath);
  } else if (argv[0] === '--chainer') {
    await chainerMode(argv[1]);
  } else {
    console.error('usage: replay-completion-anchored.ts --builder [legId ...] [--out bundle.json] | --chainer <bundle.json>');
    process.exit(2);
  }
  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
