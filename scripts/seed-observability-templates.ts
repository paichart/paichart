/**
 * Seed script: Observability-Config specialist templates
 *
 * W2 of IMPLEMENTATION-PLAN v2 (cline_docs/reviews/observability-domain-2026-09-10/) — the 4
 * specialist templates for the observability-config-protocol (W1, seed-protocol-prompts.ts,
 * protocol 1.0.0). Mirrors seed-terraform-iac-templates.ts (which mirrors the k8s seed).
 *
 * Creates 4 agent templates for the observability-config-protocol. ⚠️ NAMES ARE A BINDING FACT:
 * the protocol's decomposition table assigns these templates BY NAME — the four names below must
 * byte-match the table in seed-protocol-prompts.ts (and IM-5: no `&`/HTML-escapable chars; exact-
 * string findFirst idempotency).
 *   0. Observability State Harvester        (ORCHESTRATOR) — Phase 0 (UNCONDITIONAL): self-provision + read-only stack harvest
 *   1. Observability Change Architect       (ARCHITECT)    — Phase 1: desired-state design + blast-radius call + collision check
 *   2. Observability Config Rollback Author (DOCUMENTER)   — Phase 2: full config files + validator facts + per-class rollback (the deliverable)
 *   3. Observability Change Reviewer        (REVIEWER)     — Phase 3: QA gate (collision/fit, validation-fact discipline, rollback-per-class)
 *
 * Roles — ALL FOUR REUSED (D2; zero new keys; the shared keys config_change_author +
 * change_reviewer become FOUR-domain with this script): infra_state_harvester,
 * infra_change_architect, config_change_author, change_reviewer. Observability-specific behavior
 * (witnessed-artifact taxonomy, per-class rollback provenance, validator citations, the
 * apply-governance note — whose TERM D9 promoted into the shared roles on 2026-09-12, so it no
 * longer papers over anything) rides in
 * the PROTOCOL, not the shared roles.
 *
 * SEEDING IS MANUAL (operative rule 2026-08-26): the deploy seeds PROTOCOLS only and never
 * re-seeds templates. Deliver template changes by re-running this script by hand after the deploy
 * lands, then `npm run report:template-freshness`. Freshness detects promptTemplate/modelParameters
 * drift ONLY — capabilities/constraints/tags/metadata.protocol are restore-only (a reseed rebuilds
 * them from here; nothing detects their drift). A shared-key role-guidance edit goes STALE in ALL
 * FOUR domains at once — deliver by running ALL owning seed scripts:
 * `grep -rln "defaultRole: '<role>'" scripts/seed-*.ts`.
 *
 * NO metadata.mcpToolConfiguration.selectedTools — inherit the default all-six grant (confinement
 * does not wire on the harness agent.assign path; see the network seed's note). The tool surface
 * lives in the service descriptor (observability-readonly-descriptor.json), which the Harvester
 * self-provisions from — the descriptor is the tool-surface source of truth, deliberately NOT
 * enumerated in `capabilities` (F-TS-3: capabilities is runtime-dead and freshness cannot detect
 * its drift; abstract statements only, per the terraform/network precedent).
 *
 * Pattern ref:  agent-template-gold-standard-pattern.md (Pattern #44)
 * Protocol ref: observability-config-protocol in agent_prompt_library (seed-protocol-prompts.ts)
 * Shape ref:    scripts/seed-terraform-iac-templates.ts (this mirrors it)
 *
 * Run locally:  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-observability-templates.ts
 * Run on prod:  NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-observability-templates.ts
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
    name: 'Observability State Harvester',
    description: 'Phase 0 of the observability-config-protocol — self-provisions the read-only observability service from the descriptor carried in the task (register → read-only call → teardown), then performs a READ-ONLY harvest of the live monitoring stack via narrow scoped reads of the surfaces the objective touches: the running Prometheus config, scrape-target health, loaded rule groups, the collector’s as-deployed config file, the dashboard inventory and any board the objective names. Quotes witnessed renderings verbatim; treats the datasource read as inventory (names/types/uids), never a config source; harvests secret metadata, never values. Hands the snapshot to the Observability Change Architect via auto-chained pipeline context. Read-only only — never a write, reload, or lifecycle verb. Reads observability-config-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ORCHESTRATOR,
    defaultRole: 'infra_state_harvester',
    tags: ['observability-config', 'provisioning', 'harvester', 'phase-0'],
    timeout: 600, // 10 min — self-provision lifecycle + the scoped read loop
    metadata: {
      // IM-6 analog — maxToolTurns decided CONSCIOUSLY: no override. The observability harvest
      // surface is 9 mostly zero-arg tools (self-provision lifecycle + one read per surface +
      // a few query_metric evidence calls) — a small loop, unlike the terraform large-estate case
      // (maxToolTurns: 60). The engine default suffices; revisit if Tier-1 rounds show turn
      // exhaustion (that would be a written finding, not a silent bump).
      modelParameters: COMMON_MODEL_PARAMS(600),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'observability-config-protocol', // Engine injects this protocol into system prompt (metadata.protocol path) — byte-matches the agent_prompt_library row name
    },
  },
  {
    name: 'Observability Change Architect',
    description: 'Phase 1 of the observability-config-protocol — produces the target desired-state design from the harvested stack state: which config FILES change (Prometheus config, rule files, collector pipeline, provisioned dashboards), the rationale per change, a per-target change list, an ordering map, and a blast-radius call naming the apply step each change requires (Prometheus reload vs collector restart vs provisioning re-scan) and what it interrupts. Checks name collisions against the harvest (existing job names, rule group names, dashboard uids) and carries the harvest’s baseline facts forward — the Author is two hops from the harvest. No stack contact. Hands the design to the Observability Config Rollback Author via auto-chained pipeline context. Reads observability-config-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ARCHITECT,
    defaultRole: 'infra_change_architect',
    tags: ['observability-config', 'provisioning', 'design', 'architect'],
    timeout: 300, // 5 min — design, no generation-heavy phase
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(300),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'observability-config-protocol',
    },
  },
  {
    name: 'Observability Config Rollback Author',
    description: 'Phase 2 of the observability-config-protocol — THE deliverable producer. Authors the change package: (a) FULL desired-state config files, new and modified — the package is a runbook and the operator applies whole files, never a bare diff; (b) deterministic validation FACTS — the offline validators cited with literal expected results as pre-apply steps the OPERATOR runs (promtool check config / promtool check rules, otelcol validate, a dashboard JSON schema check — the Author never runs them), plus post-apply checks phrased against the harvest surface; expected outputs quote witnessed renderings only, with the sanctioned presence/comparison shape for first-ever states; (c) a rollback plan per artifact class — prior file content VERBATIM from the witnessed rendering or the prior provisioned file; (d) change ordering plus an apply-governance note (the reload/re-scan step each file needs, its blast radius, the first post-apply check); (e) the baseline evidence it designed against, restated for independent Reviewer verification. Produces a change to be applied via a human-gated reload/re-scan, never an applied change. Reads observability-config-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.DOCUMENTER,
    defaultRole: 'config_change_author',
    tags: ['observability-config', 'provisioning', 'change-package', 'author', 'documenter'],
    timeout: 600, // 10 min — full-file config generation is the longest phase
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(600),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'observability-config-protocol',
    },
  },
  {
    name: 'Observability Change Reviewer',
    description: 'Phase 3 of the observability-config-protocol — independent QA gate (not the deliverable). Reviews the change package for collision/fit against its baseline evidence (duplicate job names, colliding rule or series names, dashboard uid collisions), validation-step fact discipline (validator citation plus literal expected output, or the sanctioned presence/comparison shape — never prose), rollback adequacy per artifact class (a dashboard rollback quoting the API model is blocking; datasource config quoting the redacted rendering is blocking), and apply-governance readiness; grades unverifiable provenance claims as observations, never asserted proof. Emits a clear verdict (approved / needs-revision) with named blocking issues, ending with the terminal VERDICT block. Does not soften ratings. Reads observability-config-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.REVIEWER,
    defaultRole: 'change_reviewer',
    tags: ['observability-config', 'provisioning', 'reviewer', 'quality', 'qa-gate'],
    timeout: 300, // 5 min — review is bounded, no generation
    metadata: {
      modelParameters: COMMON_MODEL_PARAMS(300),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'observability-config-protocol',
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
  console.log('Seeding observability-config templates...\n');

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
    // ROLE_GUIDANCE_LIBRARY entries (no generic fallback). The harvester (infra_state_harvester)
    // carries both bases (artifact_harvester + synthesis_source_acquirer) — preserved by this
    // exact replace().
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
      // Abstract statements ONLY (F-TS-3): capabilities is runtime-dead and its drift is
      // undetectable — the 9-tool surface lives in the service descriptor, never here.
      capabilities: {
        'Protocol-Driven': 'Reads observability-config-protocol from injected context before acting',
        'Context Chaining': 'Receives predecessor task output via pipeline context injection',
        'Config Change, Not Apply': 'Produces a reviewable observability config change package (full desired-state files + validator citations + per-class rollback) to be applied by a human-gated reload or provisioning re-scan — never applies anything',
      },
      constraints: {
        'Protocol First': 'Must read the injected protocol before beginning work',
        'Stay in Phase': 'Only perform the work for the specific phase assigned — do not skip ahead',
        'Read-Only Stack Contact': 'The Harvester is the only role that contacts the stack, read-only only — never a write, reload, or lifecycle verb; apply is out-of-band (human-gated config reload / provisioning re-scan)',
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

  console.log(`\nDone. ${TEMPLATES.length} observability-config templates seeded.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
