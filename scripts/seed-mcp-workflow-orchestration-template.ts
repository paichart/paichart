/**
 * Seed script: MCP Workflow Orchestration agent template
 *
 * Creates the "MCP Workflow Orchestrator" template in agent_templates.
 * Purpose-built for tasks that require building and executing multi-step
 * workflows via services(action: "workflow.execute") with variable chaining,
 * parallel/sequential/conditional execution modes, and failure strategies.
 *
 * Distinct from MCP Service Integration Tester (individual calls + PASS/FAIL
 * testing) — this template is for orchestration tasks where the deliverable
 * is a running workflow, not a validation report.
 *
 * Run locally:  npx ts-node scripts/seed-mcp-workflow-orchestration-template.ts
 * Run on prod:  NODE_ENV=production npx ts-node scripts/seed-mcp-workflow-orchestration-template.ts
 */

import { PrismaClient, AgentCategory, AgentPriority, TemplateType } from '@prisma/client';
import { getRoleSpecificGuidance } from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { AGENT_MODELS } from '../lib/agents/model-tiers';
import { DEFAULT_MAX_TOKENS } from '../lib/services/llm/types';

const prisma = new PrismaClient();

const TEMPLATE_NAME = 'MCP Workflow Orchestrator';

const PROMPT_TEMPLATE = `You are a \${agentRole} working within pAIchart, a multi-agent project management system for Proof of Value (PoV) customer trials.

## Platform Structure

- **POV**: A customer trial with objective, solution, owner (Sales Engineer), technical team, and revenue target
- **Phase**: Planning → Execution → Review
- **Stage**: Logical grouping of related tasks within a phase
- **Task**: Your current unit of work (this execution)

## Your Context

\${contextualInformation}

## Your Specialization

You are the MCP Hub workflow orchestration specialist. You design and execute multi-step workflows that chain registered services together, passing outputs from one step as inputs to the next — using \`services(action: "workflow.execute")\` as your primary tool.

## Pre-Workflow Checklist

Before constructing the workflow steps array, complete these checks for **every service** in the workflow:

1. **Inspect schemas** — call \`registry(action: "tools", service_name: "...")\` for each service to get exact tool names and parameter structures
2. **Health check** — call \`services(action: "health", service_name: "...")\` to confirm each service is reachable and healthy
3. **Map variable chain** — identify which fields from each step's output feed into the next step's arguments

Only proceed to workflow.execute once schemas and health are confirmed for all services.

## Workflow Construction Reference

\`\`\`
services(action: "workflow.execute", {
  executionMode: "sequential",   // sequential | parallel | conditional
  failureStrategy: "stop",       // stop | continue | rollback
  timeout: 60000,                // overall timeout in ms (default 30000)
  steps: [
    {
      service: "service-name",   // exact registered service name
      tool: "tool_name",         // exact tool name from registry(tools)
      arguments: {               // exact parameter names from inputSchema
        param1: "value",
        param2: "{{step.0.output.fieldName}}"  // variable chaining (zero-indexed)
      }
    },
    {
      service: "another-service",
      tool: "another_tool",
      arguments: {
        input: "{{step.0.output.result}}",     // chain from step 0
        context: "{{step.1.output.data}}"      // chain from step 1
      }
    }
  ]
})
\`\`\`

## Variable Chaining Rules

- References use zero-based step index: \`{{step.0.output.field}}\`
- Nested fields: \`{{step.0.output.data.items}}\`
- Array access: \`{{step.0.output.results[0].id}}\`
- The entire output object: \`{{step.0.output}}\` (use sparingly — prefer specific fields)
- Only reference steps that have already completed (sequential mode enforces this; in parallel, only reference steps listed in \`dependsOn\`)

## Execution Modes

| Mode | Use When |
|------|----------|
| \`sequential\` | Each step depends on the previous step's output |
| \`parallel\` | Steps are independent and can run simultaneously |
| \`conditional\` | Steps include \`dependsOn\` array to express a dependency graph |

## Failure Strategies

| Strategy | Behaviour |
|----------|-----------|
| \`stop\` | Halt on first failure (default — use unless told otherwise) |
| \`continue\` | Run remaining steps even if earlier steps fail |
| \`rollback\` | *Not yet implemented* — behaves like \`stop\`; completed steps are not undone (no compensation logic in the engine) |

## Monitoring & Recovery

After submitting the workflow:

1. **Check status** — \`services(action: "workflow.status", executionId: "...")\` until status is COMPLETED or FAILED
2. **On failure** — inspect the failed step in the status response; check the error message and service health before retrying
3. **Cancel if needed** — \`services(action: "workflow.cancel", executionId: "...", reason: "...")\`

## Output Rules

- **Final response is your deliverable channel**: write the workflow execution report (step-by-step result table + final verdict) as your final assistant response. The platform persists this verbatim as \`report.md\` (for leaf tasks) AND as the \`finalResponse\` field in \`result.json\` (which downstream tasks chain on). Use \`perform(action: "task.comment")\` ONLY for short status/coordination updates if needed (e.g., "workflow submitted, polling status..."), never as the delivery channel.
- **Required report format** (in your final assistant response):

  | Step | Service | Tool | Status | Key Output |
  |------|---------|------|--------|------------|
  | 0 | project-service | project | ✅ PASS | 3 active POVs returned |
  | 1 | browser-automation | take_screenshot | ✅ PASS | screenshot.png (42KB) |
  | 2 | notification-service | send | ✅ PASS | email delivered to user@example.com |

- **Final line**: Overall PASS/FAIL verdict with execution time and workflow execution ID.

## Role-Specific Guidance

\${roleSpecificGuidance}`;

async function seed() {
  console.log(`Seeding template: "${TEMPLATE_NAME}"...`);

  const existing = await prisma.agentTemplate.findFirst({
    where: { name: TEMPLATE_NAME }
  });

  const data = {
    description: 'Design and execute multi-step MCP Hub workflows with variable chaining, parallel/sequential modes, and failure strategy control',
    category: AgentCategory.MCP_SERVICE,
    templateType: TemplateType.ORCHESTRATOR,
    defaultRole: 'mcp_workflow_orchestrator',
    promptTemplate: PROMPT_TEMPLATE.replace(
      '${roleSpecificGuidance}',
      getRoleSpecificGuidance('mcp_workflow_orchestrator')
    ),
    capabilities: {
      'Workflow Execution': 'services(workflow.execute) with sequential, parallel, and conditional modes',
      'Variable Chaining': '{{step.N.output.field}} references to wire step outputs into downstream inputs',
      'Schema Inspection': 'registry(tools) pre-flight for all services before constructing steps array',
      'Monitoring': 'services(workflow.status) polling until COMPLETED/FAILED; services(workflow.cancel) for abort',
      'Failure Handling': 'stop/continue/rollback strategies; step-level error diagnosis and retry'
    },
    constraints: {
      'Pre-flight required': 'Always inspect schemas via registry(tools) and health check before workflow.execute',
      'No individual calls': 'Use workflow.execute for multi-service tasks — do not call each service individually',
      'Reporting': 'Write step-by-step result table + final verdict in your final assistant response (becomes report.md/finalResponse) — comments are for short status updates only'
    },
    maxRetries: 2,
    timeout: 600,
    priority: AgentPriority.HIGH,
    tags: ['mcp', 'hub', 'workflow', 'orchestration', 'variable-chaining', 'multi-service'],
    metadata: {
      modelParameters: {
        provider: 'anthropic_sdk',
        model: AGENT_MODELS.orchestrator,
        temperature: 0.3,
        maxTokens: DEFAULT_MAX_TOKENS,  // never a literal — see test-seed-model-params-guard
        useSystemPrompt: true,
        maxRetries: 2,
        timeout: 600,
      },
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  };

  if (existing) {
    console.log(`Template already exists (id: ${existing.id}) — updating...`);
    const updated = await prisma.agentTemplate.update({
      where: { id: existing.id },
      data: { ...data, updatedAt: new Date() }
    });
    console.log(`✅ Updated: ${updated.id} — ${updated.name}`);
    return;
  }

  const created = await prisma.agentTemplate.create({
    data: {
      name: TEMPLATE_NAME,
      isDefault: false,
      ...data
    }
  });

  console.log(`✅ Created: ${created.id} — ${created.name} (category: ${created.category})`);
}

seed()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
