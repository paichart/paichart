/**
 * SYNTHESIZE dead-end behavioural proof (dev DB, no LLM).
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/test-synthesize-dead-end-behavioral.ts
 *
 * Drives the REAL chokepoint — `runTerminalSuccessTx` — rather than asserting on source text, so it
 * proves the predicate FIRES rather than that the code contains a disjunction. Every case builds its
 * fixtures inside a transaction that is then ROLLED BACK, so the suite leaves nothing behind and
 * needs no cleanup path (a cleanup path that silently no-ops is its own failure mode).
 *
 * Specimen: prod cmu0yl664006kyx0e3olnguqe (2026-09-14) — a program SYNTHESIZE whose continuation
 * LLM call died on an undici body timeout, persisted SUCCESS with an empty deliverable, never called
 * task.complete, and hung IN_PROGRESS forever because every child had already cascaded.
 *
 * @see cline_docs/reviews/synthesize-empty-turn-hang-2026-09-14/CONTAINMENT-SPEC.md
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { runTerminalSuccessTx, type TerminalSuccessInput } from '@/lib/services/execution-terminal-persist';

const prisma = new PrismaClient();
let passed = 0, failed = 0;
const assert = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.error(`  ❌ ${m}`); } };

const POV_ID = process.env.TEST_POV_ID;
const silentLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

class Rollback extends Error {}

/** Build a PIPELINE task + its execution, run the terminal tx, hand back the resulting row. */
async function drive(opts: {
  stageName: string;
  pipelineStageIdPresent: boolean;
  synthesizeDeadEnd: boolean;
  harnessNoOutput: boolean;
  finalText: string;
  /** RWF A3: build a REAL child stage (pipelineStageId points at it) with these children. */
  children?: Array<{ status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'; executionStatus?: 'FAILED' | 'SUCCESS';
    exec?: { status: string; source?: string; parentIsThisRun?: boolean } }>;
  /** RWF A3: a child OUTSIDE the harness's child stage, dispatched by this run (must not count). */
  outOfStageDispatch?: boolean;
  truncationStalled?: boolean;
}): Promise<{ executionStatus: string | null; status: string; metadata: any } | null> {
  let out: any = null;
  try {
    await prisma.$transaction(async (tx) => {
      const phase = await tx.phase.findFirst({ where: { povId: POV_ID! }, select: { id: true } });
      if (!phase) throw new Error('no phase on TEST_POV_ID');
      const anyUser = await tx.user.findFirst({ select: { id: true } });
      if (!anyUser) throw new Error('no user in dev DB');
      const userId = anyUser.id;
      const stage = await tx.stage.create({ data: { name: opts.stageName, phaseId: phase.id, order: 999 } });
      const childStage = opts.children
        ? await tx.stage.create({ data: { name: 'Pipeline: SDE child stage', phaseId: phase.id, order: 998 } })
        : null;
      const task = await tx.task.create({
        data: {
          title: 'SDE behavioural fixture', type: 'PIPELINE', status: 'IN_PROGRESS',
          povId: POV_ID!, stageId: stage.id,
          metadata: opts.pipelineStageIdPresent
            ? { pipelineStageId: childStage ? childStage.id : 'stage-fixture-id', keepMe: 'preserved' }
            : {},
        },
        select: { id: true, type: true, metadata: true, povId: true, title: true },
      });
      const exec = await tx.agentExecution.create({
        data: { taskId: task.id, status: 'RUNNING', config: {}, context: {}, logs: [], startTime: new Date() },
        select: { id: true },
      });
      const triggered = (source: string, parentIsThisRun: boolean) =>
        ({ triggeredBy: { id: userId, source, ...(parentIsThisRun ? { parentExecutionId: exec.id } : {}) } });
      for (const [i, c] of (opts.children ?? []).entries()) {
        const child = await tx.task.create({ data: { title: `SDE child ${i}`, type: 'ACTION', status: c.status,
          executionStatus: c.executionStatus ?? null, povId: POV_ID!, stageId: childStage!.id } });
        if (c.exec) {
          await tx.agentExecution.create({ data: { taskId: child.id, status: c.exec.status, config: {}, logs: [],
            context: triggered(c.exec.source ?? 'mcp-direct', !!c.exec.parentIsThisRun) } });
        }
      }
      if (opts.outOfStageDispatch) {
        const elsewhere = await tx.task.create({ data: { title: 'SDE out-of-stage child', type: 'ACTION',
          status: 'COMPLETED', povId: POV_ID!, stageId: stage.id } });
        await tx.agentExecution.create({ data: { taskId: elsewhere.id, status: 'SUCCESS', config: {}, logs: [],
          context: triggered('mcp-direct', true) } });
      }

      const now = new Date();
      const input: TerminalSuccessInput = {
        executionId: exec.id, task, finalText: opts.finalText,
        resultJson: { resolvedMode: 'SYNTHESIZE', finalResponse: opts.finalText },
        logs: [], endTime: now, executionCreatedAt: now, executionStartTime: now,
        usage: undefined, servingModel: null, supersededById: null,
        truncationStalled: opts.truncationStalled ?? false,
        harnessNoOutput: opts.harnessNoOutput,
        synthesizeDeadEnd: opts.synthesizeDeadEnd,
        agentRole: 'pipeline_harness_orchestrator', confidenceScore: null,
        toolCallsTotal: 1, toolCallsSucceeded: 1, toolCallsFailed: 0,
        commentUserId: userId, prune: false, fireReactors: false,
        logger: silentLogger, createdArtifacts: [], queuedMs: null, executionMs: 1,
      };

      await runTerminalSuccessTx(tx, input);
      out = await tx.task.findUnique({
        where: { id: task.id }, select: { executionStatus: true, status: true, metadata: true },
      });
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

async function main() {
  if (!POV_ID) { console.log('⏭️  SKIPPED: TEST_POV_ID not set — NOTHING WAS VERIFIED'); console.log('   To run:  set -a; source .env; set +a'); process.exit(0); }
  console.log('🧪 SYNTHESIZE dead-end — behavioural (real terminal tx, rolled back)\n');

  console.log('SDE-1: the specimen shape — SYNTHESIZE, empty deliverable, LINK PRESENT, children spent');
  const a = await drive({ stageName: 'Program: fixture', pipelineStageIdPresent: true, synthesizeDeadEnd: true, harnessNoOutput: true, finalText: '' });
  assert(a?.executionStatus === 'FAILED', 'terminalized FAILED (without this it hangs IN_PROGRESS forever)');
  assert(!!(a?.metadata as any)?.harnessNoOutput, 'metadata.harnessNoOutput stamped for forensics');

  console.log('\nSDE-2: REGRESSION PIN — the CREATE shape this widening loosens must stay alive');
  const b = await drive({ stageName: 'Program: fixture', pipelineStageIdPresent: true, synthesizeDeadEnd: false, harnessNoOutput: true, finalText: '' });
  assert(b?.executionStatus !== 'FAILED', 'an empty-but-LINKED non-SYNTHESIZE run is NOT terminalized (children may still cascade)');

  console.log('\nSDE-3: the original CREATE dead-end (absent link) still fires — no regression');
  const c = await drive({ stageName: 'Program: fixture', pipelineStageIdPresent: false, synthesizeDeadEnd: false, harnessNoOutput: true, finalText: '' });
  assert(c?.executionStatus === 'FAILED', 'absent-link dead end still terminalized (the 2026-07-17 behaviour)');

  console.log('\nSDE-4: a healthy SYNTHESIZE with real output is untouched');
  const d = await drive({ stageName: 'Program: fixture', pipelineStageIdPresent: true, synthesizeDeadEnd: false, harnessNoOutput: false, finalText: '# Deliverable\n\nreal content' });
  assert(d?.executionStatus !== 'FAILED', 'a run that produced a deliverable is never terminalized');

  // ── RWF A3 (2026-09-26): the premise "SYNTHESIZE ⇒ nothing in flight" is now CHECKED ──────────────
  const dead = { stageName: 'Program: fixture', pipelineStageIdPresent: true, synthesizeDeadEnd: true, harnessNoOutput: true, finalText: '' };

  console.log('\nSDE-5 (A3): a child re-run still in flight → NOT terminalized, deadEndExempt child-unsettled');
  const e = await drive({ ...dead, children: [{ status: 'COMPLETED', exec: { status: 'RUNNING', parentIsThisRun: true } }] });
  assert(e?.executionStatus !== 'FAILED', 'an empty SYNTHESIZE with a child in flight must NOT be FAILED (+ cone)');
  assert((e?.metadata as any)?.deadEndExempt?.reason === 'child-dispatched-this-run' || (e?.metadata as any)?.deadEndExempt?.reason === 'child-unsettled',
    `deadEndExempt stamped (got ${JSON.stringify((e?.metadata as any)?.deadEndExempt)})`);

  console.log('\nSDE-6 (A3, the A.1b hole): the child this run dispatched ALREADY settled → still NOT terminalized');
  const f = await drive({ ...dead, children: [{ status: 'COMPLETED', exec: { status: 'SUCCESS', parentIsThisRun: true } }] });
  assert(f?.executionStatus !== 'FAILED', 'a wakeup is owed (it died at Guard 6) — the self-check delivers it; FAILED here is the E3 defect');
  assert((f?.metadata as any)?.deadEndExempt?.reason === 'child-dispatched-this-run', 'reason names the dispatch');
  assert((f?.metadata as any)?.keepMe === 'preserved' && typeof (f?.metadata as any)?.pipelineStageId === 'string',
    'the atomic merge kept the existing metadata (no lost update)');

  console.log('\nSDE-7 (A3): PLAN-SPAWN shape — fresh OPEN children → NOT terminalized (they ARE future events)');
  const g = await drive({ ...dead, children: [{ status: 'OPEN' }, { status: 'OPEN' }] });
  assert(g?.executionStatus !== 'FAILED', 'an empty PLAN-SPAWN is not a dead end');
  assert((g?.metadata as any)?.deadEndExempt?.reason === 'child-unsettled', 'reason names the unsettled stage');

  console.log('\nSDE-8 (A3 control): every child settled, nothing dispatched this run → STILL terminalized');
  const h = await drive({ ...dead, children: [{ status: 'COMPLETED', exec: { status: 'SUCCESS', parentIsThisRun: false } }] });
  assert(h?.executionStatus === 'FAILED', 'the genuine dead end still fires (no over-exemption)');
  assert(!(h?.metadata as any)?.deadEndExempt, 'no exemption stamped on a genuine dead end');

  console.log('\nSDE-9 (A3): a dispatch OUTSIDE the harness\'s own child stage does not exempt');
  const i = await drive({ ...dead, children: [{ status: 'COMPLETED' }], outOfStageDispatch: true });
  assert(i?.executionStatus === 'FAILED', 'an out-of-stage dispatch must not hold a dead end open (it would hang)');

  console.log('\nSDE-10 (A3): a REACTOR-sourced row naming this execution as parent is not a dispatch');
  const j = await drive({ ...dead, children: [{ status: 'COMPLETED', exec: { status: 'SUCCESS', source: 'reactor-pipeline-retrigger', parentIsThisRun: true } }] });
  assert(j?.executionStatus === 'FAILED', 'only mcp-direct dispatches count');

  console.log('\nSDE-11 (A3): R4 truncation stall with a child in flight → NOT terminalized');
  const k = await drive({ ...dead, synthesizeDeadEnd: false, harnessNoOutput: false, truncationStalled: true,
    children: [{ status: 'IN_PROGRESS', executionStatus: 'FAILED', exec: { status: 'PENDING', parentIsThisRun: true } }] });
  assert(k?.executionStatus !== 'FAILED', 'R4 must not FAIL a leg whose re-run is in flight');
  assert(!!(k?.metadata as any)?.deadEndExempt, 'R4 decline stamped too');

  console.log(`\n${'='.repeat(45)}\nResults: ${passed} passed, ${failed} failed\n${'='.repeat(45)}`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
