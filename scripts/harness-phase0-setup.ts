/**
 * Harness Phase 0: Manual Pipeline Setup
 *
 * Creates 3 typed tasks in the demo POV to test the ARCHITECT → REVIEWER → ANALYST pipeline.
 * After running this script, execute each task manually via the GUI or MCP, then
 * copy result.json output into the next task's inputContext to simulate harness chaining.
 *
 * Run: npx ts-node --project prisma/tsconfig.seed.json scripts/harness-phase0-setup.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const POV_ID = 'cmgiwwuq60014cj0y6tc48ixu'; // Demo Retail Solutions - Cloud Security
const ARCH_DESIGN_STAGE = 'cmgiwwuqu001ecj0y03ztqqsx'; // Architecture Design stage
const SECURITY_REVIEW_STAGE = 'cmgiwwusi001wcj0y1y28q35t'; // Security Configuration Review stage
const USER_ID = 'cmey6s7e90000cj6gd0r1sewf'; // demo@paichart.com

const TEMPLATES = {
  ARCHITECT: 'cmez0bayx000acjbihsklxk7m', // Solution Architect
  REVIEWER: 'cmez0bay70005cjbi51c4ao4n',  // Security Analyst
  ANALYST: 'cmez0baxw0002cjbiphjmwiqt',   // Business Analyst
};

async function setup() {
  console.log('=== Harness Phase 0: Pipeline Setup ===\n');

  // Get the planning phase for proper phase assignment
  const archStage = await prisma.stage.findUnique({
    where: { id: ARCH_DESIGN_STAGE },
    select: { phaseId: true },
  });
  const secStage = await prisma.stage.findUnique({
    where: { id: SECURITY_REVIEW_STAGE },
    select: { phaseId: true },
  });

  if (!archStage || !secStage) {
    throw new Error('Stages not found — check IDs');
  }

  // Task 1: ARCHITECT — Design security assessment framework
  const task1 = await prisma.task.create({
    data: {
      title: '[HARNESS-P0] Design security assessment framework for cloud infrastructure',
      description: `You are the first agent in a 3-agent pipeline testing the distributed harness concept.

OBJECTIVE: Design a security assessment framework for a retail company's cloud infrastructure (AWS/Azure hybrid).

DELIVERABLES:
1. Assessment scope definition (which cloud services, which compliance frameworks)
2. Security domain breakdown (IAM, network, data, compute, logging)
3. For each domain: what to check, what tools/queries to use, what "good" looks like
4. Risk scoring methodology (how to weight findings)
5. Recommended compliance frameworks (CIS Benchmarks, ASD Essential Eight, PCI-DSS for retail)

Your output will be consumed by a Security Analyst (REVIEWER) who will execute the actual audit.
Structure your output so it can be directly used as an audit checklist.`,
      type: 'ACTION',
      status: 'OPEN',
      priority: 'HIGH',
      povId: POV_ID,
      phaseId: archStage.phaseId,
      stageId: ARCH_DESIGN_STAGE,
      agentTemplateId: TEMPLATES.ARCHITECT,
      agentRole: 'solution_architect',
      order: 100,
      assigneeId: USER_ID,
    },
  });
  console.log(`Task 1 (ARCHITECT): ${task1.id} — ${task1.title}`);

  // Task 2: REVIEWER — Execute security audit
  const task2 = await prisma.task.create({
    data: {
      title: '[HARNESS-P0] Execute security audit against CIS benchmarks',
      description: `You are the second agent in a 3-agent pipeline. The Solution Architect has designed the assessment framework.

OBJECTIVE: Execute the security audit using the framework provided in your input context.

DELIVERABLES:
1. For each security domain in the framework: finding, severity (Critical/High/Medium/Low), evidence, remediation
2. Compliance gap analysis against the specified frameworks
3. Risk score per domain using the methodology from the framework
4. Overall security posture score (0-100)
5. Top 5 critical findings requiring immediate attention

Your output will be consumed by a Business Analyst (ANALYST) who will produce the remediation roadmap.
Include quantified risk data (likelihood x impact) so the analyst can calculate ROI.`,
      type: 'ACTION',
      status: 'OPEN',
      priority: 'HIGH',
      povId: POV_ID,
      phaseId: secStage.phaseId,
      stageId: SECURITY_REVIEW_STAGE,
      agentTemplateId: TEMPLATES.REVIEWER,
      agentRole: 'security_analyst',
      order: 200,
      assigneeId: USER_ID,
    },
  });
  console.log(`Task 2 (REVIEWER):  ${task2.id} — ${task2.title}`);

  // Task 3: ANALYST — Produce remediation roadmap
  const task3 = await prisma.task.create({
    data: {
      title: '[HARNESS-P0] Produce remediation roadmap with ROI analysis',
      description: `You are the third and final agent in a 3-agent pipeline. The Security Analyst has completed the audit.

OBJECTIVE: Translate the security findings into a business-ready remediation roadmap.

DELIVERABLES:
1. Executive summary (2-3 paragraphs, CxO audience)
2. Remediation priority matrix (effort vs impact, quick wins identified)
3. For each critical/high finding: remediation action, estimated effort, cost, risk reduction
4. ROI analysis: cost of remediation vs cost of breach (use industry benchmarks)
5. Implementation timeline (30/60/90 day plan)
6. Success metrics the customer can track post-remediation

Frame everything for a retail CTO making a purchase decision.
This is the final deliverable — it should be customer-presentation ready.`,
      type: 'ACTION',
      status: 'OPEN',
      priority: 'HIGH',
      povId: POV_ID,
      phaseId: secStage.phaseId,
      stageId: SECURITY_REVIEW_STAGE,
      agentTemplateId: TEMPLATES.ANALYST,
      agentRole: 'business_analyst',
      order: 300,
      assigneeId: USER_ID,
    },
  });
  console.log(`Task 3 (ANALYST):   ${task3.id} — ${task3.title}`);

  // Wire dependencies: Task 2 depends on Task 1, Task 3 depends on Task 2
  await prisma.taskDependency.createMany({
    data: [
      { taskId: task2.id, dependsOnId: task1.id },
      { taskId: task3.id, dependsOnId: task2.id },
    ],
  });
  console.log(`\nDependencies wired: Task2 → Task1, Task3 → Task2`);

  console.log(`
=== Pipeline Ready ===

Execution order:
  1. Run Task 1 (ARCHITECT): ${task1.id}
  2. Copy result.json output → Task 2 inputContext
  3. Run Task 2 (REVIEWER): ${task2.id}
  4. Copy result.json output → Task 3 inputContext
  5. Run Task 3 (ANALYST): ${task3.id}

Document:
  - How long does each execution take?
  - What's painful about manual context chaining?
  - Is the output quality sufficient without manual intervention?
  - Does the confidence score in result.json reflect actual quality?
  - Would you need to re-run any task (completion loop scenario)?
`);

  await prisma.$disconnect();
}

setup().catch(console.error);
