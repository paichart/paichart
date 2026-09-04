/**
 * Harness Phase 0: Chain artifacts from one task to the next
 *
 * Reads result.json from a completed task and writes it to the next task's inputContext.
 * This is the manual version of what the harness will automate.
 *
 * Usage: npx ts-node --project prisma/tsconfig.seed.json scripts/harness-phase0-chain.ts <fromTaskId> <toTaskId>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function chain() {
  const fromTaskId = process.argv[2];
  const toTaskId = process.argv[3];

  if (!fromTaskId || !toTaskId) {
    console.error('Usage: harness-phase0-chain.ts <fromTaskId> <toTaskId>');
    process.exit(1);
  }

  // Find the latest successful execution of the source task
  const latestExec = await prisma.agentExecution.findFirst({
    where: { taskId: fromTaskId, status: 'SUCCESS' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!latestExec) {
    console.error(`No successful execution found for task ${fromTaskId}`);
    process.exit(1);
  }

  // Read result.json artifact
  const resultArtifact = await prisma.agentArtifact.findFirst({
    where: { executionId: latestExec.id, name: 'result.json' },
    select: { content: true },
  });

  if (!resultArtifact) {
    console.error(`No result.json artifact found for execution ${latestExec.id}`);
    process.exit(1);
  }

  const resultData = JSON.parse(resultArtifact.content);

  // Extract the meaningful output for chaining
  const chainedContext = {
    previousTask: {
      taskId: resultData.taskId,
      taskTitle: resultData.taskTitle,
      agentRole: resultData.agentRole,
      confidenceScore: resultData.confidenceScore,
    },
    previousOutput: resultData.finalResponse,
    qualityMetrics: resultData.qualityMetrics,
  };

  // Write to the destination task's inputContext
  await prisma.task.update({
    where: { id: toTaskId },
    data: {
      inputContext: chainedContext as any,
    },
  });

  const toTask = await prisma.task.findUnique({
    where: { id: toTaskId },
    select: { title: true },
  });

  console.log(`=== Context Chained ===`);
  console.log(`From: ${resultData.taskTitle} (${fromTaskId})`);
  console.log(`To:   ${toTask?.title} (${toTaskId})`);
  console.log(`Confidence: ${resultData.confidenceScore ?? 'not parsed'}`);
  console.log(`Output length: ${resultData.finalResponse?.length || 0} chars`);
  console.log(`\nNext: Execute task ${toTaskId}`);

  await prisma.$disconnect();
}

chain().catch(console.error);
