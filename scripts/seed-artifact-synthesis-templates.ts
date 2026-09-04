/**
 * Seed script: Artifact Synthesis specialist templates
 *
 * Creates 4 agent templates for the artifact-synthesis-protocol:
 *   1. Synthesis Source Acquirer (ACQUIRER) — Phase 0 (conditional): Source Acquisition [added 2026-04-27]
 *   2. Artifact Harvester (ANALYST) — Phases 1-2: Harvest + Map [renamed 2026-04-15]
 *   3. Editorial Writer (DOCUMENTER) — Phases 3, 5-6: Annotate + Restructure + Integrate
 *   4. Publication Reviewer (REVIEWER) — Phases 4, 7: Self-Critique + Assess
 *
 * These templates are assigned by the Pipeline Harness when it decomposes an
 * artifact-synthesis objective. Each reads the artifact-synthesis-protocol from
 * its injected context (via metadata.protocol engine injection).
 *
 * Phase 0 (Synthesis Source Acquirer) fires CONDITIONALLY — only when the task
 * description names external MCP services (GitHub, Sentry, Jira, Slack, etc.)
 * or uses acquisition phrases ("pull from", "fetch from", "using the X MCP").
 * For local source material the harness emits a 3-child decomposition starting
 * at Phase 1 (Harvester). The harness LLM picks the shape from the protocol
 * body's decomposition table at runtime — no engine code change governs this.
 *
 * Pattern ref: agent-template-gold-standard-pattern.md (Pattern #44)
 * Protocol ref: artifact-synthesis-protocol in agent_prompt_library
 * Design doc: cline_docs/path2-phase0-source-acquisition-implementation-plan.md
 *
 * DECISION GUIDE — Synthesis Source Acquirer vs Artifact Harvester (GS8 differentiation):
 *   Task asks to GATHER raw events from external MCP services
 *     (GitHub PRs, Sentry events, Jira tickets, Slack threads)
 *   → Synthesis Source Acquirer (THIS seed script, defaultRole: synthesis_source_acquirer)
 *
 *   Task asks to EXTRACT findings from existing local source material
 *     (git logs, session history, meeting notes, project docs)
 *     OR from a normalized event list produced by Phase 0
 *   → Artifact Harvester (THIS seed script, defaultRole: artifact_harvester)
 *
 *   Task asks to ANALYZE a topic / system / situation and produce findings
 *     (infrastructure audit, red-team analysis, compliance review, market study)
 *   → Research Analyst (seed-agent-templates.ts, defaultRole: research_analyst)
 *
 * GS7 migration: task #81 renamed the narrow harvester role from "Research Analyst"
 * to "Artifact Harvester" and introduced a separate generic Research Analyst.
 * The LEGACY_NAME constant below handles the in-place rename for existing prod rows.
 *
 * Run locally:  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-artifact-synthesis-templates.ts
 * Run on prod:  NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-artifact-synthesis-templates.ts
 */

import { PrismaClient, AgentCategory, AgentPriority, TemplateType } from '@prisma/client';
import {
  PAICHART_UNIVERSAL_BASE_TEMPLATE,
  getRoleSpecificGuidance
} from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { AGENT_MODELS } from '../lib/agents/model-tiers';
import { DEFAULT_MAX_TOKENS } from '../lib/services/llm/types';

const prisma = new PrismaClient();

interface TemplateSeed {
  name: string;
  description: string;
  category: AgentCategory;
  templateType: TemplateType;
  defaultRole: string;
  tags: string[];
  timeout: number;
  metadata: Record<string, any>;
}

// GS7: LEGACY_NAME handles the 2026-04-15 rename of the narrow harvest role.
// Prior rows in prod were keyed as "Research Analyst"; the migration block in
// main() renames them in place to "Artifact Harvester" before the idempotent
// upsert runs. Existing task.agentTemplateId references remain valid because
// we keep the same row (update, not delete+create).
const HARVESTER_LEGACY_NAME = 'Research Analyst';
const HARVESTER_NAME = 'Artifact Harvester';
const ACQUIRER_NAME = 'Synthesis Source Acquirer';

const TEMPLATES: TemplateSeed[] = [
  {
    name: ACQUIRER_NAME,
    description: 'Phase 0 of the artifact-synthesis-protocol — gathers raw events from external MCP services (GitHub, Sentry, Jira, Slack, Linear, etc.), normalizes them into a flat event table, and hands off to the Artifact Harvester via auto-chained pipeline context. Conditional phase: fires only when source material lives in external services rather than locally (git logs, session transcripts, project docs). Iterative call-look-decide pattern; explicitly NOT services.workflow.execute. Default count budget 100 events, hard ceiling 300, parameterizable via task description. Succeeds-with-partial if one source is unhealthy. Reads artifact-synthesis-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ACQUIRER,
    defaultRole: 'synthesis_source_acquirer',
    tags: ['synthesis', 'artifact', 'acquisition', 'source', 'mcp', 'phase-0'],
    timeout: 600, // 10 min — multi-source acquisition with pagination can take 5-10 min
    metadata: {
      modelParameters: {
        provider: 'anthropic_sdk',
        model: AGENT_MODELS.synthesis,
        temperature: 0.3,
        maxTokens: DEFAULT_MAX_TOKENS,  // never a literal — see test-seed-model-params-guard
        useSystemPrompt: true,
        maxRetries: 2,
        timeout: 600,
      },
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'artifact-synthesis-protocol',
    },
  },
  {
    name: HARVESTER_NAME,
    description: 'Phases 1-2 of the artifact-synthesis-protocol — extracts structured findings from source material and maps each finding to the target artifact section. Source material can be local (session history, git logs, research notes, meeting transcripts, customer interviews, support tickets) OR auto-chained from a Phase 0 Synthesis Source Acquirer when sources live in external MCP services. Scope is explicitly narrow — for analytical research tasks without existing source material (infrastructure audits, competitive analysis, etc.) use the generic Research Analyst template instead. Reads artifact-synthesis-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ANALYST,
    defaultRole: 'artifact_harvester',
    tags: ['synthesis', 'artifact', 'harvest', 'harvester'],
    timeout: 300, // 5 min — harvesting is bounded by finding count (max 15)
    metadata: {
      modelParameters: {
        provider: 'anthropic_sdk',
        model: AGENT_MODELS.synthesis,
        temperature: 0.3,
        maxTokens: DEFAULT_MAX_TOKENS,  // never a literal — see test-seed-model-params-guard
        useSystemPrompt: true,
        maxRetries: 2,
        timeout: 300,
      },
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'artifact-synthesis-protocol', // Engine injects this protocol into system prompt
    },
  },
  {
    name: 'Editorial Writer',
    description: 'Transforms extracted findings into polished output — annotated drafts, restructured sections, and final prose. Phases 3, 5-6 of the artifact-synthesis-protocol: Annotate findings onto the artifact, restructure conflated sections, then integrate into final prose. Reads artifact-synthesis-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.DOCUMENTER,
    defaultRole: 'editorial_writer',
    tags: ['synthesis', 'artifact', 'editorial', 'writer', 'documenter'],
    timeout: 600, // 10 min — prose generation is the longest phase
    metadata: {
      modelParameters: {
        provider: 'anthropic_sdk',
        model: AGENT_MODELS.synthesis,
        temperature: 0.3,
        maxTokens: DEFAULT_MAX_TOKENS,  // never a literal — see test-seed-model-params-guard
        useSystemPrompt: true,
        maxRetries: 2,
        timeout: 600,
      },
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'artifact-synthesis-protocol',
    },
  },
  {
    name: 'Publication Reviewer',
    description: 'Assesses quality and publication readiness of synthesized artifacts. Phases 4, 7 of the artifact-synthesis-protocol: Self-critique for conflated lessons (Phase 4) and publishable-bar assessment with severity-rated gap list (Phase 7). Does not soften ratings. Reads artifact-synthesis-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.REVIEWER,
    defaultRole: 'publication_reviewer',
    tags: ['synthesis', 'artifact', 'reviewer', 'quality', 'publication'],
    timeout: 300, // 5 min — review is bounded, no generation
    metadata: {
      modelParameters: {
        provider: 'anthropic_sdk',
        model: AGENT_MODELS.synthesis,
        temperature: 0.3,
        maxTokens: DEFAULT_MAX_TOKENS,  // never a literal — see test-seed-model-params-guard
        useSystemPrompt: true,
        maxRetries: 2,
        timeout: 300,
      },
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'artifact-synthesis-protocol',
    },
  },
];

async function main() {
  console.log('Seeding artifact synthesis templates...\n');

  // GS7 migration (2026-04-15, task #81): rename the narrow harvest role from
  // "Research Analyst" to "Artifact Harvester". Idempotent — no-op if already
  // migrated OR if the legacy row never existed in this DB. Scoped by tags so
  // we don't accidentally rename a user-created template that happened to
  // share the name.
  const legacyHarvester = await prisma.agentTemplate.findFirst({
    where: {
      name: HARVESTER_LEGACY_NAME,
      tags: { hasEvery: ['synthesis', 'artifact'] },
    },
  });
  if (legacyHarvester) {
    console.log(`GS7 migration: renaming "${HARVESTER_LEGACY_NAME}" → "${HARVESTER_NAME}" (id: ${legacyHarvester.id})`);
    await prisma.agentTemplate.update({
      where: { id: legacyHarvester.id },
      data: {
        name: HARVESTER_NAME,
        defaultRole: 'artifact_harvester',
      },
    });
    console.log(`  → migrated. Row id preserved; existing task.agentTemplateId references remain valid.\n`);
  }

  for (const template of TEMPLATES) {
    console.log(`Seeding: "${template.name}"...`);

    // GS7: Idempotent — findFirst + update/create
    const existing = await prisma.agentTemplate.findFirst({
      where: { name: template.name },
    });

    // Resolve the prompt template with role-specific guidance
    const promptTemplate = PAICHART_UNIVERSAL_BASE_TEMPLATE.replace(
      '${roleSpecificGuidance}',
      getRoleSpecificGuidance(template.defaultRole)
    );

    const data = {
      name: template.name,
      description: template.description,
      category: template.category,
      templateType: template.templateType,
      defaultRole: template.defaultRole,
      promptTemplate,
      capabilities: {
        'Protocol-Driven': 'Reads artifact-synthesis-protocol from injected context before acting',
        'Context Chaining': 'Receives predecessor task output via pipeline context injection',
        'Structured Output': 'Produces artifacts at specified file paths with clear section structure',
      },
      constraints: {
        'Protocol First': 'Must read the injected protocol before beginning work',
        'Stay in Phase': 'Only perform the work for the specific phase(s) assigned — do not skip ahead',
        'Anchor in Evidence': 'Every claim must reference a verifiable detail from the source material',
      },
      maxRetries: 2,
      timeout: template.timeout,
      priority: AgentPriority.HIGH,
      isDefault: false,
      tags: template.tags,
      metadata: template.metadata,
    };

    if (existing) {
      console.log(`  Already exists (id: ${existing.id}) — updating...`);
      await prisma.agentTemplate.update({
        where: { id: existing.id },
        data: {
          ...data,
          status: 'ACTIVE',
          version: '1.0.0',
          updatedAt: new Date(),
        },
      });
      console.log(`  Updated: ${template.name}`);
    } else {
      console.log(`  Creating: ${template.name}`);
      const created = await prisma.agentTemplate.create({
        data: {
          ...data,
          status: 'ACTIVE',
          version: '1.0.0',
          usageCount: 0,
          createdBy: 'system',
        },
      });
      console.log(`  Created: ${created.id} — ${template.name}`);
    }
  }

  console.log(`\nDone. ${TEMPLATES.length} artifact synthesis templates seeded.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
