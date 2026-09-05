/**
 * Seed script: Terraform / Cloud-IaC specialist templates
 *
 * Phase-6 WP-B (2026-06-29) — the 4 specialist templates for the terraform-iac-protocol
 * (WP-A, seed-protocol-prompts.ts). Mirrors seed-kubernetes-gitops-templates.ts.
 *
 * The customer's half (R1 read-only verb-enum + arg-confinement, the §4 sandboxed plan/validate runner,
 * K1 state-secret default-deny, R8) lives in the customer's Terraform service per the published Terraform
 * integration spec (TERRAFORM-SERVICE-INTEGRATION-SPEC.md, the WS4 analog) — pAIchart does NOT own/CI-test
 * it (WS3). pAIchart hardens its own side (R9 + R10 incl. the JSON-quoted-key TF family, shipped). See
 * .claude/knowledge/pipelines/terraform-iac/{terraform-iac-pipeline,IMPLEMENTATION-PLAN-v2}.md +
 * cline_docs/reviews/terraform-iac-design-2026-06-29/REVIEW.md.
 *
 * Creates 4 agent templates for the terraform-iac-protocol:
 *   0. IaC State Harvester       (ORCHESTRATOR) — Phase 0 (conditional): self-provision + read-only state harvest
 *   1. Infrastructure Architect  (ARCHITECT)    — Phase 1: desired-state design + drift call + dependency map
 *   2. HCL Rollback Author       (DOCUMENTER)   — Phase 2: HCL/module diff (a PR) + expected validation facts + rollback (the deliverable)
 *   3. Plan Policy Reviewer      (REVIEWER)     — Phase 3: QA gate (policy / destroy-bound / rollback / drift)
 *
 * Roles — ALL FOUR REUSED (no pAIchartUniversalTemplate edit; the k8s work neutralized them):
 *   infra_state_harvester, infra_change_architect, config_change_author, change_reviewer.
 *   TF-specific behavior (no-plan/validate, destroy-bound, drift, named-artifact restatement) rides in the
 *   PROTOCOL (WP-A), not the shared role — per REVIEW.md (role-reuse holds; protocol carries the nuance).
 *
 * IM-5: NO `&` in template names — names are matched by exact-string findFirst, and an HTML-escaping
 *   write/display path would turn `&` into `&amp;` and defeat the GS7 idempotent lookup → duplicate. The
 *   k8s seed dropped the `&` for the same reason; we keep names ampersand-free ("HCL Rollback Author").
 * IM-6: the Harvester gets an explicit maxToolTurns (below) — a real estate's state ≫ a lab, and the
 *   address-scoped read loop (state list → many targeted state pull + self-provision) needs more turns
 *   than the engine default; set consciously rather than inheriting by omission.
 *
 * NO metadata.mcpToolConfiguration.selectedTools — inherit the default all-six grant (confinement is
 * cooperative). For TF the real guard is NOT tool-confinement but the customer service's verb-enum +
 * arg-confinement (a stray `plan` is a state-locking/code-exec side-effect, not "an extra read") — see
 * TERRAFORM-SERVICE-INTEGRATION-SPEC.md §3/§8 (the service self-defends for ANY caller stage).
 *
 * Pattern ref:  agent-template-gold-standard-pattern.md (Pattern #44)
 * Protocol ref: terraform-iac-protocol in agent_prompt_library (seed-protocol-prompts.ts, WP-A)
 * Shape ref:    scripts/seed-kubernetes-gitops-templates.ts (this mirrors it)
 *
 * Run locally:  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-terraform-iac-templates.ts
 * Run on prod:  NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-terraform-iac-templates.ts
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
    name: 'IaC State Harvester',
    description: 'Phase 0 of the terraform-iac-protocol (conditional) — self-provisions the read-only Terraform service from the descriptor carried in the task (register → call), then performs READ-ONLY state collection via many narrow, address-scoped reads (state list for the addresses, then targeted state pull per address — which render saved state and launch NO providers), capturing resource shape + addresses + drift, sensitive metadata not values. Hands the snapshot to the Infrastructure Architect via auto-chained pipeline context. Read-only render only: never a mutating verb, never runs plan/validate/init (they launch providers = arbitrary code + a state lock). Fires only when current (redacted) state is not already supplied in the task. Reads terraform-iac-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ORCHESTRATOR,
    defaultRole: 'infra_state_harvester',
    tags: ['terraform-iac', 'provisioning', 'harvester', 'phase-0'],
    timeout: 600, // 10 min — self-provision lifecycle + many address-scoped read calls
    metadata: {
      // IM-6: explicit maxToolTurns for the large-estate read loop (state list → many targeted state
      // pull + self-provision register/call/teardown). > engine default; set consciously, not by omission.
      modelParameters: { ...COMMON_MODEL_PARAMS(600), maxToolTurns: 60 },
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'terraform-iac-protocol', // Engine injects this protocol into system prompt (metadata.protocol path)
    },
  },
  {
    name: 'Infrastructure Architect',
    description: 'Phase 1 of the terraform-iac-protocol — produces the target desired-state design from the harvested Terraform state: which resources change or are added, the rationale per change, a per-target change list, a dependency/ordering map, and a destroy/replace-risk call. Handles drift as a first-class input — reconciles in-scope drift with an explicit callout, but halts (flags for needs-revision) on out-of-scope drift rather than silently absorbing it. Carries the plan-bounds, drift decision, and policy/constraint baseline forward into its output (the Author is two hops from the harvest). No backend contact. Hands the design to the HCL Rollback Author via auto-chained pipeline context. Reads terraform-iac-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ARCHITECT,
    defaultRole: 'infra_change_architect',
    tags: ['terraform-iac', 'provisioning', 'design', 'architect'],
    timeout: 300, // 5 min — design, no generation-heavy phase
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(300),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'terraform-iac-protocol',
    },
  },
  {
    name: 'HCL Rollback Author',
    description: 'Phase 2 of the terraform-iac-protocol — THE deliverable producer. Authors the HCL change package: (a) a declarative HCL/module diff as a PR — never imperative terraform CLI commands; (b) EXPECTED validation facts (the terraform validate / tflint / expected plan add-change-destroy counts / OPA/conftest/Sentinel checks the team CI will run, with expected results) — does NOT run plan/validate/init/tflint itself (they lock state + launch providers on authored HCL); (c) a rollback plan (revert the HCL + apply / state rollback); (d) recommended change ordering; (e) restates the harvested policy/constraint baseline — the OPA/Sentinel/conftest policies, tag/naming standards, provider quotas, and target workspace — so the Reviewer can verify constraint-fit independently. Produces a change to be applied via a governed terraform apply run, never an applied change — apply is out-of-band. Reads terraform-iac-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.DOCUMENTER,
    defaultRole: 'config_change_author',
    tags: ['terraform-iac', 'provisioning', 'hcl', 'change-package', 'author', 'documenter'],
    timeout: 600, // 10 min — HCL generation is the longest phase
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(600),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'terraform-iac-protocol',
    },
  },
  {
    name: 'Plan Policy Reviewer',
    description: 'Phase 3 of the terraform-iac-protocol — independent QA gate (not the deliverable). Reviews the change package for policy compliance, plan diff-boundedness (flags any unintended destroy/replace in the expected plan), rollback adequacy, and drift handling (in-scope reconciled, out-of-scope halted); checks that each validation step is a real expected fact (validate/tflint/plan-counts/OPA), not prose; emits a clear verdict (approved / needs-revision) with confidence and named blocking issues. Does not soften ratings. Reads terraform-iac-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.REVIEWER,
    defaultRole: 'change_reviewer',
    tags: ['terraform-iac', 'provisioning', 'reviewer', 'quality', 'qa-gate'],
    timeout: 300, // 5 min — review is bounded, no generation
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(300),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'terraform-iac-protocol',
    },
  },
];

// createdBy is a CUID user id, NOT an email. Resolve the seed owner's real id at
// runtime (env-portable — ids differ per environment). Falls back to the 'system'
// sentinel (a real User row; excluded from the orphan sweep) if the owner isn't present.
const SEED_OWNER_EMAIL = '<maintainer-email>';

async function main() {
  console.log('Seeding terraform-iac templates...\n');

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

    // Resolve the prompt template with role-specific guidance. All four roles are REUSED and HAVE
    // ROLE_GUIDANCE_LIBRARY entries (no generic fallback). The harvester (infra_state_harvester) carries
    // both bases (artifact_harvester + synthesis_source_acquirer) — preserved by this exact replace().
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
        'Protocol-Driven': 'Reads terraform-iac-protocol from injected context before acting',
        'Context Chaining': 'Receives predecessor task output via pipeline context injection',
        'HCL Change, Not Apply': 'Produces a reviewable HCL change package (a PR) to be applied by a governed terraform apply run — never applies anything',
      },
      constraints: {
        'Protocol First': 'Must read the injected protocol before beginning work',
        'Stay in Phase': 'Only perform the work for the specific phase assigned — do not skip ahead',
        'No State Mutation, No Plan/Validate': 'No mutating verb anywhere; the Harvester is read-only render only (state list / state pull); no specialist runs terraform plan/validate/init (state lock + provider code-exec); apply is out-of-band',
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

  console.log(`\nDone. ${TEMPLATES.length} terraform-iac templates seeded.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
