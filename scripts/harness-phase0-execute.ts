/**
 * Harness Phase 0: Execute a task and wait for completion
 *
 * Usage: npx ts-node --project prisma/tsconfig.seed.json scripts/harness-phase0-execute.ts <taskId>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function execute() {
  const taskId = process.argv[2];
  if (!taskId) {
    console.error('Usage: harness-phase0-execute.ts <taskId>');
    process.exit(1);
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, agentRole: true, agentTemplateId: true, status: true, executionStatus: true },
  });

  if (!task) {
    console.error(`Task ${taskId} not found`);
    process.exit(1);
  }

  console.log(`Task: ${task.title}`);
  console.log(`Role: ${task.agentRole}`);
  console.log(`Status: ${task.status} / Execution: ${task.executionStatus || 'none'}`);
  console.log(`\nTo execute this task:`);
  console.log(`  1. Open the GUI at http://localhost:3000`);
  console.log(`  2. Navigate to the Demo Retail Solutions POV`);
  console.log(`  3. Find the task: ${task.title}`);
  console.log(`  4. Click "Execute Agent"`);
  console.log(`\nOr use MCP (Claude Desktop / ChatGPT):`);
  console.log(`  perform(action: "agent.execute", taskId: "${taskId}")`);
  console.log(`\nAfter execution completes, run:`);
  console.log(`  npx ts-node --project prisma/tsconfig.seed.json scripts/harness-phase0-chain.ts ${taskId} <nextTaskId>`);

  // Check if there's already a completed execution
  const latestExec = await prisma.agentExecution.findFirst({
    where: { taskId, status: 'SUCCESS' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, createdAt: true },
  });

  if (latestExec) {
    console.log(`\n--- Existing successful execution found: ${latestExec.id} (${latestExec.createdAt.toISOString()}) ---`);

    const artifacts = await prisma.agentArtifact.findMany({
      where: { executionId: latestExec.id },
      select: { id: true, name: true, type: true, content: true },
    });

    for (const artifact of artifacts) {
      console.log(`\n=== ${artifact.name} (${artifact.type}) ===`);
      if (artifact.name === 'result.json') {
        const parsed = JSON.parse(artifact.content);
        console.log(`  Confidence Score: ${parsed.confidenceScore ?? 'not found'}`);
        console.log(`  Quality Metrics:`, JSON.stringify(parsed.qualityMetrics, null, 2));
        console.log(`  Response length: ${parsed.finalResponse?.length || 0} chars`);
        console.log(`  Tool calls: ${parsed.toolCalls?.length || 0}`);
      } else if (artifact.name === 'report.md') {
        console.log(`  Length: ${artifact.content.length} chars`);
        console.log(`  Preview: ${artifact.content.substring(0, 200)}...`);
      }
    }
  }

  await prisma.$disconnect();
}

execute().catch(console.error);
