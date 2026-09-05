/**
 * Seed script: Kubernetes/GitOps specialist templates
 *
 * Phase-6 WP-A5 (2026-06-27) — the 4 specialist templates for the kubernetes-gitops-protocol
 * (WP-B, seed-protocol-prompts.ts). Mirrors seed-network-provisioning-templates.ts.
 *
 * The customer's half (R1 read-only verb-enum + R2 RBAC) lives in the customer's k8s service per the
 * published k8s integration spec (WP-E1, the WS4 analog) — pAIchart does NOT own/CI-test it (C3/WS3).
 * pAIchart hardens its own side (R9 + R10, shipped/flag-gated). See
 * .claude/knowledge/pipelines/kubernetes-gitops/{kubernetes-gitops-pipeline,IMPLEMENTATION-PLAN}.md.
 *
 * Creates 4 agent templates for the kubernetes-gitops-protocol:
 *   0. Cluster State Harvester        (ORCHESTRATOR) — Phase 0 (conditional): self-provision + read-only cluster harvest
 *   1. Workload Architect             (ARCHITECT)    — Phase 1: desired-state design + dependency map
 *   2. Manifest Rollback Author     (DOCUMENTER)   — Phase 2: declarative manifests + validation facts + rollback (the deliverable)
 *   3. Change Reviewer                (REVIEWER)     — Phase 3: QA gate (policy/blast-radius/rollback)
 *
 * Roles (all have ROLE_GUIDANCE_LIBRARY entries — no generic fallback):
 *   infra_state_harvester + infra_change_architect — NEW, added WP-A3/A4 (domain-neutral infra chain).
 *   config_change_author + change_reviewer         — REUSED (shared with network-provisioning), neutralized in place WP-A1/A2.
 *
 * The Pipeline Harness assigns these BY templateType when it decomposes a kubernetes-gitops
 * objective; each reads the kubernetes-gitops-protocol via metadata.protocol engine injection.
 *
 * NO metadata.mcpToolConfiguration.selectedTools — inherit the default all-six grant (confinement
 * is cooperative; acceptable because the cluster service is read-only by construction (R1∧R2) so the
 * worst case is an extra read — IMPLEMENTATION-PLAN.md K5). The Harvester needs services+registry for
 * self-provision and has them via the default grant.
 *
 * Pattern ref:  agent-template-gold-standard-pattern.md (Pattern #44)
 * Protocol ref: kubernetes-gitops-protocol in agent_prompt_library (seed-protocol-prompts.ts, WP-B)
 * Shape ref:    scripts/seed-network-provisioning-templates.ts (this mirrors it)
 *
 * Run locally:  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-kubernetes-gitops-templates.ts
 * Run on prod:  NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-kubernetes-gitops-templates.ts
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
  // NEVER a maxTokens literal here — single source is DEFAULT_MAX_TOKENS (see the
  // network-provisioning seed's note; guarded by scripts/test-seed-model-params-guard.ts).
  maxTokens: DEFAULT_MAX_TOKENS,
  useSystemPrompt: true,
  maxRetries: 2,
  timeout,
});

const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Cluster State Harvester',
    description: 'Phase 0 of the kubernetes-gitops-protocol (conditional) — self-provisions the read-only k8s service from the descriptor carried in the task (register → call), then performs READ-ONLY state collection via many narrow, scoped reads (manifests/values for the target scope, workload inventory, quota/policy baseline, secret metadata — names/keys, never values) and hands the snapshot to the Workload Architect via auto-chained pipeline context. Read-only only: never a mutating verb, never escalates privilege. Fires only when current cluster state is not already supplied in the task. Reads kubernetes-gitops-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ORCHESTRATOR,
    defaultRole: 'infra_state_harvester',
    tags: ['kubernetes-gitops', 'provisioning', 'harvester', 'phase-0'],
    timeout: 600, // 10 min — self-provision lifecycle + many narrow read calls
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(600),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'kubernetes-gitops-protocol', // Engine injects this protocol into system prompt (metadata.protocol path)
    },
  },
  {
    name: 'Workload Architect',
    description: 'Phase 1 of the kubernetes-gitops-protocol — produces the target desired-state design from the harvested cluster state: which resources change or are added, the rationale per change, a per-target change list, and a dependency/ordering map. No cluster contact. Hands the design to the Manifest Rollback Author via auto-chained pipeline context. Reads kubernetes-gitops-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ARCHITECT,
    defaultRole: 'infra_change_architect',
    tags: ['kubernetes-gitops', 'provisioning', 'design', 'architect'],
    timeout: 300, // 5 min — design, no generation-heavy phase
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(300),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'kubernetes-gitops-protocol',
    },
  },
  {
    name: 'Manifest Rollback Author',
    description: 'Phase 2 of the kubernetes-gitops-protocol — THE deliverable producer. Authors the GitOps change package: (a) declarative artifacts (manifest / kustomize overlay / Helm-values diff) — never imperative kubectl patch/scale; (b) deterministic validation facts (kubeconform schema, kustomize build, conftest/OPA policy — offline, never kubectl diff/server dry-run); (c) a rollback plan (prior revision / git revert); (d) recommended change ordering. Produces a change to be applied via GitOps reconcile, never an applied change — apply is out-of-band. Reads kubernetes-gitops-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.DOCUMENTER,
    defaultRole: 'config_change_author',
    tags: ['kubernetes-gitops', 'provisioning', 'manifest', 'change-package', 'author', 'documenter'],
    timeout: 600, // 10 min — manifest generation is the longest phase
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(600),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'kubernetes-gitops-protocol',
    },
  },
  {
    name: 'GitOps Change Reviewer',
    description: 'Phase 3 of the kubernetes-gitops-protocol — independent QA gate (not the deliverable). Reviews the change package for policy compliance, blast-radius, rollback adequacy, and approval readiness; checks that each validation step is a real fact (kubeconform/kustomize/OPA), not prose; emits a clear verdict (approved / needs-revision) with confidence and named blocking issues. Does not soften ratings. Reads kubernetes-gitops-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.REVIEWER,
    defaultRole: 'change_reviewer',
    tags: ['kubernetes-gitops', 'provisioning', 'reviewer', 'quality', 'qa-gate'],
    timeout: 300, // 5 min — review is bounded, no generation
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(300),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'kubernetes-gitops-protocol',
    },
  },
];

// createdBy is a CUID user id, NOT an email. Resolve the seed owner's real id at
// runtime (env-portable — ids differ per environment). Falls back to the 'system'
// sentinel (a real User row; excluded from the orphan sweep) if the owner isn't present.
// No personal address in code (open-source, 2026-09-06): SEED_OWNER_EMAIL (hosted deploy pins it) →
// ADMIN_EMAIL (self-host) → '' → the 'system' sentinel.
const SEED_OWNER_EMAIL = (process.env.SEED_OWNER_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();

async function main() {
  console.log('Seeding kubernetes-gitops templates...\n');

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

    // Resolve the prompt template with role-specific guidance. All four roles HAVE
    // ROLE_GUIDANCE_LIBRARY entries (infra_state_harvester + infra_change_architect added
    // WP-A3/A4; config_change_author + change_reviewer reused), so none falls back to generic.
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
        'Protocol-Driven': 'Reads kubernetes-gitops-protocol from injected context before acting',
        'Context Chaining': 'Receives predecessor task output via pipeline context injection',
        'GitOps Change, Not Apply': 'Produces a reviewable declarative change to be reconciled — never applies anything to a cluster',
      },
      constraints: {
        'Protocol First': 'Must read the injected protocol before beginning work',
        'Stay in Phase': 'Only perform the work for the specific phase assigned — do not skip ahead',
        'No Cluster Mutation': 'No mutating/write verb anywhere in this pipeline; the Harvester is read-only, apply is out-of-band (GitOps reconcile)',
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

  console.log(`\nDone. ${TEMPLATES.length} kubernetes-gitops templates seeded.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
