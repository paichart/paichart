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
      const task = await tx.task.create({
        data: {
          title: 'SDE behavioural fixture', type: 'PIPELINE', status: 'IN_PROGRESS',
          povId: POV_ID!, stageId: stage.id,
          metadata: opts.pipelineStageIdPresent ? { pipelineStageId: 'stage-fixture-id' } : {},
        },
        select: { id: true, type: true, metadata: true, povId: true, title: true },
      });
      const exec = await tx.agentExecution.create({
        data: { taskId: task.id, status: 'RUNNING', config: {}, context: {}, logs: [], startTime: new Date() },
        select: { id: true },
      });

      const now = new Date();
      const input: TerminalSuccessInput = {
        executionId: exec.id, task, finalText: opts.finalText,
        resultJson: { resolvedMode: 'SYNTHESIZE', finalResponse: opts.finalText },
        logs: [], endTime: now, executionCreatedAt: now, executionStartTime: now,
        usage: undefined, servingModel: null, supersededById: null,
        truncationStalled: false,
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

  console.log(`\n${'='.repeat(45)}\nResults: ${passed} passed, ${failed} failed\n${'='.repeat(45)}`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
