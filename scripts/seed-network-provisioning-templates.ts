/**
 * Seed script: Network-Provisioning specialist templates
 *
 * Shipped 2026-06-24 (promoted from the 2026-06-16 spike). The 4 specialist templates for
 * the network-provisioning-protocol. R1/R2a/R8/R10 are the CUSTOMER device service's
 * responsibility per the published integration spec (WS4); pAIchart hardens its own side
 * (R9 + the artifact-redaction backstop, shipped). See
 * cline_docs/network-provisioning-promotion/ROADMAP.md.
 *
 * Creates 4 agent templates for the network-provisioning-protocol:
 *   0. Network State Harvester      (ORCHESTRATOR) — Phase 0 (conditional): self-provision + read-only state harvest
 *   1. Network Design Architect     (ARCHITECT)    — Phase 1: target design + dependency map
 *   2. Config Change-Package Author (DOCUMENTER) — Phase 2: per-device config + validation + rollback (the deliverable)
 *   3. Change Reviewer              (REVIEWER)     — Phase 3: QA gate (risk/standards/blast-radius)
 *
 * The Pipeline Harness assigns these BY templateType when it decomposes a
 * network-provisioning objective. Each reads the network-provisioning-protocol
 * from its injected context (via metadata.protocol engine injection).
 *
 * NO metadata.mcpToolConfiguration.selectedTools — these templates inherit the
 * default all-six consolidated grant (project/perform/analytics/template/services/
 * registry). Per-template tool confinement was descoped (2026-06-16): it does not
 * wire on the harness agent.assign path anyway (engine reads task.mcpContext.tools,
 * which agent.assign never populates → all-six fallback; see
 * cline_docs/reviews/network-provisioning-design-2026-06-16/ and parked
 * REQ-agent-tool-confinement-engine-2026-06-16.md). The Harvester needs
 * services+registry for self-provision and has them via the default grant.
 *
 * Pattern ref:  agent-template-gold-standard-pattern.md (Pattern #44)
 * Protocol ref: network-provisioning-protocol in agent_prompt_library (seed-protocol-prompts.ts)
 * Shape ref:    scripts/seed-artifact-synthesis-templates.ts (this mirrors it)
 *
 * Run locally:  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-network-provisioning-templates.ts
 * Run on prod:  NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-network-provisioning-templates.ts
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

const COMMON_MODEL_PARAMS = (timeout: number) => ({
  provider: 'anthropic_sdk',
  model: AGENT_MODELS.infra,
  temperature: 0.3,
  // NEVER a maxTokens literal here — single source is DEFAULT_MAX_TOKENS (R1 ceiling-not-target;
  // a literal left this fleet pinned at 8000 for a month after the 2026-07-16 raise, truncating a
  // program-tier verdict on 2026-08-20). Guarded by scripts/test-seed-model-params-guard.ts.
  // A default bump still reaches prod only via a hand-run targeted reseed.
  maxTokens: DEFAULT_MAX_TOKENS,
  useSystemPrompt: true,
  maxRetries: 2,
  timeout,
});

const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Network State Harvester',
    description: 'Phase 0 of the network-provisioning-protocol (conditional) — self-provisions the device read service from the descriptor carried in the task (register → update → call), then performs READ-ONLY state collection (running config, VLAN/IP allocation, topology/neighbours, software versions) and hands the snapshot to the Network Design Architect via auto-chained pipeline context. Read-only only: never runs a mutating device command, never escalates privilege. Fires only when current device state is not already supplied in the task. Reads network-provisioning-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ORCHESTRATOR,
    defaultRole: 'infra_state_harvester',
    tags: ['network-provisioning', 'provisioning', 'harvester', 'phase-0'],
    timeout: 600, // 10 min — self-provision lifecycle + read calls
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(600),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'network-provisioning-protocol', // Engine injects this protocol into system prompt
    },
  },
  {
    name: 'Network Design Architect',
    description: 'Phase 1 of the network-provisioning-protocol — produces the target design from the harvested state: whatever device-config changes the objective requires (e.g. addressing/VLAN, routing OSPF/BGP, ACLs/firewall, QoS, load-balancing — as applicable, not an exhaustive list), a per-device change list, and an inter-device dependency/ordering map (what must change first). No device contact. Hands the design to the Config Change-Package Author via auto-chained pipeline context. Reads network-provisioning-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ARCHITECT,
    defaultRole: 'infra_change_architect',
    tags: ['network-provisioning', 'provisioning', 'design', 'architect'],
    timeout: 300, // 5 min — design, no generation-heavy phase
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(300),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'network-provisioning-protocol',
    },
  },
  {
    name: 'Config Change-Package Author',
    description: 'Phase 2 of the network-provisioning-protocol — THE deliverable producer. Authors the change package: (a) per-device candidate configuration blocks; (b) deterministic validation steps (the exact show command(s) and expected output that prove each change — facts the apply step will run, never "verify it looks correct"); (c) a rollback plan per device; (d) recommended change ordering + maintenance-window note. Produces a change to be applied, never an applied change — apply is out-of-band. Reads network-provisioning-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.DOCUMENTER,
    defaultRole: 'config_change_author',
    tags: ['network-provisioning', 'provisioning', 'config', 'change-package', 'author', 'documenter'],
    timeout: 600, // 10 min — config generation is the longest phase
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(600),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'network-provisioning-protocol',
    },
  },
  {
    name: 'Change Reviewer',
    description: 'Phase 3 of the network-provisioning-protocol — independent QA gate (not the deliverable). Reviews the change package for standards/lint, blast-radius, rollback adequacy, and approval/maintenance-window readiness; emits a clear verdict (approved / needs-revision) with confidence and named blocking issues. Does not soften ratings. Reads network-provisioning-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.REVIEWER,
    defaultRole: 'change_reviewer',
    tags: ['network-provisioning', 'provisioning', 'reviewer', 'quality', 'qa-gate'],
    timeout: 300, // 5 min — review is bounded, no generation
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(300),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'network-provisioning-protocol',
    },
  },
];

// createdBy is a CUID user id, NOT an email. Resolve the seed owner's real id at
// runtime (env-portable — ids differ per environment). Falls back to the 'system'
// sentinel (a real User row; excluded from the orphan sweep) if the owner isn't
// present, so a fresh environment never re-introduces an email-in-createdBy dangle.
const SEED_OWNER_EMAIL = 'steve.terry@paichart.com';

async function main() {
  console.log('Seeding network-provisioning templates...\n');

  const owner = await prisma.user.findUnique({
    where: { email: SEED_OWNER_EMAIL },
    select: { id: true },
  });
  const createdBy = owner?.id ?? 'system';
  if (!owner) {
    console.warn(`  Owner ${SEED_OWNER_EMAIL} not found — using 'system' sentinel for createdBy`);
  }

  for (const template of TEMPLATES) {
    console.log(`Seeding: "${template.name}"...`);

    // GS7: Idempotent — findFirst + update/create
    const existing = await prisma.agentTemplate.findFirst({
      where: { name: template.name },
    });

    // Resolve the prompt template with role-specific guidance. The four roles are
    // new; getRoleSpecificGuidance falls back to generic guidance for unknown
    // roles (the injected protocol carries the domain-specific instructions).
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
        'Protocol-Driven': 'Reads network-provisioning-protocol from injected context before acting',
        'Context Chaining': 'Receives predecessor task output via pipeline context injection',
        'Change Package, Not Apply': 'Produces a reviewable change to be applied — never applies anything to a device',
      },
      constraints: {
        'Protocol First': 'Must read the injected protocol before beginning work',
        'Stay in Phase': 'Only perform the work for the specific phase assigned — do not skip ahead',
        'No Device Mutation': 'No mutating device command anywhere in this pipeline; the Harvester is read-only, apply is out-of-band',
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
          createdBy,
        },
      });
      console.log(`  Created: ${created.id} — ${template.name}`);
    }
  }

  console.log(`\nDone. ${TEMPLATES.length} network-provisioning templates seeded.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
