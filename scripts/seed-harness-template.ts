/**
 * Seed script: Distributed Harness agent template
 *
 * Creates the "Pipeline Harness" template — a meta-agent that decomposes
 * high-level objectives into typed tasks, assigns templates, wires
 * dependencies, and orchestrates execution. It does NOT do the work itself.
 *
 * Execution model:
 *   The harness runs in one of THREE modes, auto-detected at each execution:
 *     - CREATE     — first run: set up the pipeline (plan, stage, tasks, deps, templates, exit)
 *     - ORCHESTRATE — rare: finish incomplete setup (assign missing templates, wire deps, exit)
 *     - SYNTHESIZE  — auto-retriggered: children complete, aggregate results, finish self
 *
 *   Detailed playbook for each mode lives in the pipeline-orchestrator-protocol
 *   in the agent_prompt_library table — see scripts/seed-protocol-prompts.ts.
 *   The harness reads this protocol at execution time (via loadProtocols: true
 *   metadata flag). Template = role + context; protocol = step-by-step.
 *
 * Design (Option A — metadata-based child-stage linkage):
 *   The harness lives in one stage, creates a separate "Pipeline: X" child
 *   stage for its children, and records the child stage's id in its own
 *   metadata.pipelineStageId. The auto-retrigger reactor detects "all children
 *   terminal" by looking up this metadata link.
 *   See: .claude/knowledge/domain/harness/automation-loop-closure-architecture.md
 *
 * Run locally:  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-harness-template.ts
 * Run on prod:  NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-harness-template.ts
 */

import { PrismaClient, AgentCategory, AgentPriority, TemplateType } from '@prisma/client';
import { AGENT_MODELS } from '../lib/agents/model-tiers';
import { DEFAULT_MAX_TOKENS } from '../lib/services/llm/types';
// Template TEXT lives in a side-effect-free module so report:template-freshness can import and
// verify it — this script calls seed() at module level and can never itself be imported.
import { buildHarnessPromptTemplate } from '../lib/agents/harness-template';

const prisma = new PrismaClient();

const TEMPLATE_NAME = 'Pipeline Harness';

async function seed() {
  console.log(`Seeding template: "${TEMPLATE_NAME}"...`);

  const existing = await prisma.agentTemplate.findFirst({
    where: { name: TEMPLATE_NAME }
  });

  const templateData = {
    name: TEMPLATE_NAME,
    description: 'Meta-agent that orchestrates pipelines in three modes: CREATE (decompose objective into typed tasks in a dedicated child stage), ORCHESTRATE (finish incomplete setup — rare), and SYNTHESIZE (aggregate child results into a final deliverable, auto-triggered when children complete). Uses Option A metadata-based linkage: harness records child stage id in metadata.pipelineStageId.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.OPERATOR,
    defaultRole: 'pipeline_harness_orchestrator',
    promptTemplate: buildHarnessPromptTemplate(),
    capabilities: {
      'Three-Mode Operation': 'Auto-detects CREATE / ORCHESTRATE / SYNTHESIZE from metadata.pipelineStageId state',
      'Pipeline Decomposition': 'Breaks high-level objectives into 3-7 typed tasks with dependency wiring',
      'Template Assignment': 'Maps task descriptions to specialist templates using type inference',
      'Dependency Wiring': 'Sets dependencyIds at task.create time using explicit references or type hierarchy fallback',
      'Setup-and-Exit': 'CREATE/ORCHESTRATE modes configure the pipeline and exit — the engine runs children',
      'Aggregation': 'SYNTHESIZE mode aggregates child results into a final deliverable',
      'Quality Gating': 'Confidence-score-driven re-execution for low-confidence results',
      'Progress Reporting': 'Posts pipeline status updates as task comments for human visibility',
    },
    constraints: {
      'Decomposition Limit': '3-7 tasks per pipeline — split larger objectives into sub-pipelines',
      'Re-execution Limit': 'Maximum 1 re-execution per child before escalating to human',
      'Confidence Threshold': '>= 70 to proceed, 50-69 re-execute once (fresh attempt on same inputs; record a diagnostic rationale for the audit trail), < 50 escalate',
      'No Direct Work': 'The harness NEVER does the work itself — it only orchestrates specialists',
      'No Direct Execution': 'The harness NEVER calls agent.execute — the engine runs children in dependency order',
      'No Stage Mixing': 'Children MUST live in a dedicated "Pipeline: X" child stage, not the harness stage',
      'No Self-Completion on Failure': 'Never call task.complete on self if any child is FAILED — escalate instead',
    },
    maxRetries: 2,
    timeout: 900, // 15 min — per-mode budget is smaller (~20 turns) but allow headroom
    priority: AgentPriority.HIGH,
    isDefault: false,
    tags: ['harness', 'pipeline', 'orchestration', 'meta-agent', 'three-mode', 'auto-retrigger'],
    metadata: {
      modelParameters: {
        provider: 'anthropic_sdk',
        model: AGENT_MODELS.orchestrator,
        temperature: 0.3,
        // NEVER a literal — single source DEFAULT_MAX_TOKENS (R1's own subject was harness
        // SYNTHESIZE truncation, yet this literal sat at 8000 for a month after the raise).
        maxTokens: DEFAULT_MAX_TOKENS,
        maxToolTurns: 100,
        useSystemPrompt: true,
        maxRetries: 2,
        timeout: 900,
      },
      hasModelParameters: true,
      modelParamsVersion: '3.0.0',
      loadProtocols: true, // Engine injects protocol-tagged prompts; pipeline-orchestrator-protocol is the playbook
    },
  };

  if (existing) {
    console.log(`Template already exists (id: ${existing.id}) — updating...`);
    const updated = await prisma.agentTemplate.update({
      where: { id: existing.id },
      data: {
        ...templateData,
        status: 'ACTIVE',
        version: '3.0.0',
        updatedAt: new Date(),
      },
    });
    console.log(`Updated: ${updated.id} — ${updated.name}`);
  } else {
    console.log(`Creating template: ${TEMPLATE_NAME}`);
    const created = await prisma.agentTemplate.create({
      data: {
        ...templateData,
        status: 'ACTIVE',
        version: '3.0.0',
        usageCount: 0,
        createdBy: 'system',
      },
    });
    console.log(`Created: ${created.id} — ${created.name}`);
  }

  await prisma.$disconnect();
}

seed().catch(console.error);
