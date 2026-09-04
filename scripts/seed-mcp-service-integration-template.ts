/**
 * Seed script: MCP Service Orchestrator agent template
 *
 * Creates (or migrates from "MCP Service Integration Tester") the
 * "MCP Service Orchestrator" template in agent_templates.
 *
 * Purpose: agent-driven service orchestration — call one or more registered
 * MCP Hub services, reason between calls, and synthesise results. Covers:
 *   - Single service calls (get Texas energy profile from EIA)
 *   - Multi-service agentic loops (energy + weather + commodity → trading signals)
 *
 * For declarative workflows with explicit step arrays and variable chaining,
 * use the MCP Workflow Orchestrator template instead.
 *
 * Run locally:  npx ts-node scripts/seed-mcp-service-integration-template.ts
 * Run on prod:  NODE_ENV=production npx ts-node scripts/seed-mcp-service-integration-template.ts
 */

import { PrismaClient, AgentCategory, AgentPriority, TemplateType } from '@prisma/client';
import { getRoleSpecificGuidance } from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { AGENT_MODELS } from '../lib/agents/model-tiers';
import { DEFAULT_MAX_TOKENS } from '../lib/services/llm/types';

const prisma = new PrismaClient();

const TEMPLATE_NAME = 'MCP Service Orchestrator';
const LEGACY_NAME   = 'MCP Service Integration Tester';

const PROMPT_TEMPLATE = `You are a \${agentRole} working within pAIchart, a multi-agent project management system for Proof of Value (PoV) customer trials.

## Platform Structure

- **POV**: A customer trial with objective, solution, owner (Sales Engineer), technical team, and revenue target
- **Phase**: Planning → Execution → Review
- **Stage**: Logical grouping of related tasks within a phase
- **Task**: Your current unit of work (this execution)

## Your Context

\${contextualInformation}

## Your Specialization

You are the MCP Hub service orchestration specialist. You call registered external services to gather data, reason across their outputs, and deliver meaningful insights — not just raw responses. You may call a single service or chain multiple services together, letting earlier results guide later calls.

## Tool Workflow

Follow this sequence for every service involved in the task:

1. **Inspect schemas** — call \`registry(action: "tools", service_name: "...")\` for each service you plan to use; do not guess parameter names
2. **Health check** — call \`services(action: "health", service_name: "...")\` before calling; do not proceed if the service is unhealthy
3. **Execute** — call \`services(action: "call", targetService: "...", tool: "...", arguments: {...})\` using exact parameter names from the inputSchema
4. **Reason** — analyse the result; decide whether you need another service call, a different tool, or a follow-up query
5. **Deliver** — write your synthesised insights as your **final assistant response** (this becomes the customer-facing \`report.md\` for leaf tasks and the chained context for downstream tasks). Use \`perform(action: "task.comment")\` ONLY for short status/coordination updates if needed (e.g., "starting service calls...", error escalations) — never as the delivery channel.

For tasks involving 3+ services with explicit data dependencies, consider using \`services(action: "workflow.execute")\` to run them as a declarative workflow instead of individual calls.

## Argument Format Reference

\`\`\`
services(action: "call", {
  targetService: "weather-service",
  tool: "current_weather",
  arguments: {
    "location": "Sydney, AU",
    "units": "metric"
  }
})
\`\`\`

**Common pitfalls:**
- Parameter names are case-sensitive and service-specific — always confirm from inputSchema
- Wrapper-pattern services (e.g., Alpha Vantage TOOL_CALL) require arguments as a nested JSON string
- If a call fails with argument errors, re-check the inputSchema — do not retry with the same arguments
- If a required parameter is missing from the task description, use a reasonable default and note it

## Multi-Service Reasoning

When a task involves multiple services:
- Call the data-gathering services first, then use their outputs to inform analysis calls
- You do not need to pre-plan all calls upfront — let each result guide the next step
- Synthesise across responses: connect the data to the task objective, identify patterns, draw conclusions
- If results from two services conflict or seem inconsistent, note it explicitly

## Output Rules

- **Synthesise, don't just report**: connect service outputs to the task objective; raw data dumps are not enough
- **Final response is your deliverable channel**: write the full synthesis (results table + synthesis paragraph) as your final assistant response. The platform persists this verbatim as \`report.md\` (for leaf tasks) AND as the \`finalResponse\` field in \`result.json\` (which downstream tasks chain on). Length is bounded by your model's context, NOT by task.comment.
- **Multi-service format** — use a results table followed by a synthesis paragraph:

  | Service | Tool | Status | Key Data |
  |---------|------|--------|----------|
  | eia-service | get_state_electricity_profile_summary | ✅ | TX: 68% gas, avg $0.089/kWh |
  | weather-service | forecast | ✅ | TX next 5 days: 38-42°C |

  *Synthesis: High temperatures forecast → elevated cooling demand → spot price pressure likely...*

- **Single-service format**: concise paragraph with key data points, no table required
- **Error escalation**: if a service is unhealthy or calls consistently fail, flag it for the MCP Hub administrator

## Role-Specific Guidance

\${roleSpecificGuidance}`;

async function seed() {
  console.log(`Seeding template: "${TEMPLATE_NAME}"...`);

  // Migration: rename existing "MCP Service Integration Tester" → new name
  const legacy = await prisma.agentTemplate.findFirst({
    where: { name: LEGACY_NAME }
  });

  if (legacy) {
    console.log(`Migrating legacy template "${LEGACY_NAME}" (id: ${legacy.id}) → "${TEMPLATE_NAME}"...`);
    const updated = await prisma.agentTemplate.update({
      where: { id: legacy.id },
      data: {
        name: TEMPLATE_NAME,
        description: 'Call one or more registered MCP Hub services, reason across their outputs, and synthesise insights — from single-service lookups to multi-service agentic loops',
        category: AgentCategory.MCP_SERVICE,
        templateType: TemplateType.ORCHESTRATOR,
        defaultRole: 'mcp_service_orchestrator',
        promptTemplate: PROMPT_TEMPLATE.replace(
          '${roleSpecificGuidance}',
          getRoleSpecificGuidance('mcp_service_orchestrator')
        ),
        capabilities: {
          'Service Calling': 'services(call) with schema-validated arguments for any registered Hub service',
          'Multi-Service Reasoning': 'Sequential calls across multiple services; each result informs the next call',
          'Schema Inspection': 'registry(tools) pre-flight to confirm exact parameter names before calling',
          'Synthesis': 'Cross-service insight generation — connects data to the task objective'
        },
        constraints: {
          'Pre-call schema check': 'Always inspect inputSchema via registry(tools) before calling; never guess parameters',
          'Reporting': 'Synthesise results in your final assistant response (becomes report.md/finalResponse) — do not dump raw responses; comments are for short status updates only'
        },
        maxRetries: 3,
        timeout: 300,
        priority: AgentPriority.HIGH,
        tags: ['mcp', 'hub', 'service-calling', 'orchestration', 'multi-service', 'synthesis'],
        metadata: {
          modelParameters: {
            provider: 'anthropic_sdk',
            model: AGENT_MODELS.generic,
            temperature: 0.3,
            maxTokens: DEFAULT_MAX_TOKENS,  // was a pre-Phase-0-era 6000 literal; never a literal — see test-seed-model-params-guard
            useSystemPrompt: true,
            maxRetries: 3,
            timeout: 300,
          },
          hasModelParameters: true,
          modelParamsVersion: '1.0.0'
        },
        updatedAt: new Date()
      }
    });
    console.log(`✅ Migrated: ${updated.id} — ${updated.name}`);
    return;
  }

  // No legacy — check if new name already exists (idempotent re-run)
  const existing = await prisma.agentTemplate.findFirst({
    where: { name: TEMPLATE_NAME }
  });

  if (existing) {
    console.log(`Template already exists (id: ${existing.id}) — updating...`);
    const updated = await prisma.agentTemplate.update({
      where: { id: existing.id },
      data: {
        description: 'Call one or more registered MCP Hub services, reason across their outputs, and synthesise insights — from single-service lookups to multi-service agentic loops',
        category: AgentCategory.MCP_SERVICE,
        templateType: TemplateType.ORCHESTRATOR,
        defaultRole: 'mcp_service_orchestrator',
        promptTemplate: PROMPT_TEMPLATE.replace(
          '${roleSpecificGuidance}',
          getRoleSpecificGuidance('mcp_service_orchestrator')
        ),
        capabilities: {
          'Service Calling': 'services(call) with schema-validated arguments for any registered Hub service',
          'Multi-Service Reasoning': 'Sequential calls across multiple services; each result informs the next call',
          'Schema Inspection': 'registry(tools) pre-flight to confirm exact parameter names before calling',
          'Synthesis': 'Cross-service insight generation — connects data to the task objective'
        },
        constraints: {
          'Pre-call schema check': 'Always inspect inputSchema via registry(tools) before calling; never guess parameters',
          'Reporting': 'Synthesise results in your final assistant response (becomes report.md/finalResponse) — do not dump raw responses; comments are for short status updates only'
        },
        maxRetries: 3,
        timeout: 300,
        priority: AgentPriority.HIGH,
        tags: ['mcp', 'hub', 'service-calling', 'orchestration', 'multi-service', 'synthesis'],
        metadata: {
          modelParameters: {
            provider: 'anthropic_sdk',
            model: AGENT_MODELS.generic,
            temperature: 0.3,
            maxTokens: DEFAULT_MAX_TOKENS,  // was a pre-Phase-0-era 6000 literal; never a literal — see test-seed-model-params-guard
            useSystemPrompt: true,
            maxRetries: 3,
            timeout: 300,
          },
          hasModelParameters: true,
          modelParamsVersion: '1.0.0'
        },
        updatedAt: new Date()
      }
    });
    console.log(`✅ Updated: ${updated.id} — ${updated.name}`);
    return;
  }

  const created = await prisma.agentTemplate.create({
    data: {
      name: TEMPLATE_NAME,
      description: 'Call one or more registered MCP Hub services, reason across their outputs, and synthesise insights — from single-service lookups to multi-service agentic loops',
      category: AgentCategory.MCP_SERVICE,
      templateType: TemplateType.ORCHESTRATOR,
      defaultRole: 'mcp_service_orchestrator',
      promptTemplate: PROMPT_TEMPLATE.replace(
        '${roleSpecificGuidance}',
        getRoleSpecificGuidance('mcp_service_orchestrator')
      ),
      capabilities: {
        'Service Calling': 'services(call) with schema-validated arguments for any registered Hub service',
        'Multi-Service Reasoning': 'Sequential calls across multiple services; each result informs the next call',
        'Schema Inspection': 'registry(tools) pre-flight to confirm exact parameter names before calling',
        'Synthesis': 'Cross-service insight generation — connects data to the task objective'
      },
      constraints: {
        'Pre-call schema check': 'Always inspect inputSchema via registry(tools) before calling; never guess parameters',
        'Reporting': 'Synthesise results in your final assistant response (becomes report.md/finalResponse) — do not dump raw responses; comments are for short status updates only'
      },
      maxRetries: 3,
      timeout: 300,
      priority: AgentPriority.HIGH,
      isDefault: false,
      tags: ['mcp', 'hub', 'service-calling', 'orchestration', 'multi-service', 'synthesis'],
      metadata: {
        modelParameters: {
          provider: 'anthropic_sdk',
          model: AGENT_MODELS.generic,
          temperature: 0.3,
          maxTokens: DEFAULT_MAX_TOKENS,  // was a pre-Phase-0-era 6000 literal; never a literal — see test-seed-model-params-guard
          useSystemPrompt: true,
          maxRetries: 3,
          timeout: 300,
        },
        hasModelParameters: true,
        modelParamsVersion: '1.0.0'
      }
    }
  });

  console.log(`✅ Created: ${created.id} — ${created.name} (category: ${created.category})`);
}

seed()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
