#!/usr/bin/env ts-node
/**
 * Seed the THREE requirements-authoring agent templates.
 *
 *   Requirements State Harvester  — Phase 0, CONDITIONAL — `infra_state_harvester`  (REUSED, unedited)
 *   Requirements Author           — Phase 1, deliverable producer — `requirements_author`   (MINT)
 *   Requirements Reviewer         — Phase 2, QA gate — `requirements_reviewer`       (MINT)
 *
 * The Pipeline Harness assigns these BY NAME (the protocol's decomposition table names them
 * literally, not by verb-stem inference), and each reads `requirements-authoring-protocol` via
 * metadata.protocol engine injection.
 *
 * ⚠️ THE PROTOCOL ROW IS SEEDED status:'DRAFT' ON PURPOSE (seed-protocol-prompts.ts) — the named
 * injection lookup filters status:'ACTIVE', so until V3/V4 run these templates resolve with NO
 * domain protocol. That is the intended pre-validation state: the row reserves the name while
 * staying out of every prompt. Do not "fix" it here.
 *
 * ROLE REUSE — `infra_state_harvester` is REUSED UNEDITED and ships to FOUR other templates
 * (network / terraform / k8s / observability). Its two situational mismatches for this domain (it
 * names a "downstream Architect"; it says "the descriptor" singular) are RE-BOUND IN THE PROTOCOL's
 * Phase 0, never in the role. Ruling 2026-09-21 (template-system, adopted by the design fold): a
 * protocol may re-bind a shared key's SITUATION but may NOT redefine its JOB, and the OUTPUT
 * CONTRACT is part of the JOB — which is why the protocol conforms to the role's `## State Summary`
 * header rather than overriding it, and why the author/reviewer pair is MINTED rather than bent out
 * of the 4-domain `config_change_author` / `change_reviewer` keys.
 * Record: cline_docs/reviews/requirements-authoring-review-2026-09-21/template-system.md.
 *
 * NO metadata.mcpToolConfiguration.selectedTools — these templates inherit the default all-six
 * consolidated grant (project/perform/analytics/template/services/registry), exactly as all four
 * infra domains do. ⚠️ THIS IS NOT A CONTROL AND MUST NOT BE WRITTEN AS ONE: `selectedTools` does
 * not reach the runtime grant on the harness `agent.assign` path (the engine reads
 * task.mcpContext.tools, which agent.assign never populates → deriveMcpToolNames falls back to all
 * six — lib/services/execution-hub-guidance.ts:58). Only `agent.configure` populates it, and the
 * harness does not call it. Confinement here is COOPERATIVE and lives in the prompt: both minted
 * roles carry a "you need no tool calls / reaching an external service is out of lane" bullet.
 * Real enforcement needs the parked executor-allowlist gate —
 * cline_docs/follow-ups/REQ-agent-tool-confinement-engine-2026-06-16.md (D1 flip DECLINED, Steve
 * 2026-06-16). Adding a decorative list here would read as enforcement in review and enforce
 * nothing.
 *
 * Pattern ref:  agent-template-gold-standard-pattern.md (Pattern #44)
 * Protocol ref: requirements-authoring-protocol in agent_prompt_library (seed-protocol-prompts.ts)
 * Shape ref:    scripts/seed-observability-templates.ts (this mirrors it)
 *
 * Run locally:  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-requirements-authoring-templates.ts
 * Run on prod:  NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-requirements-authoring-templates.ts
 */

import { PrismaClient, AgentCategory, AgentPriority, TemplateType } from '@prisma/client';
import {
  PAICHART_UNIVERSAL_BASE_TEMPLATE,
  getRoleSpecificGuidance
} from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { AGENT_MODELS } from '../lib/agents/model-tiers';
import { expectedMaxTokens } from '../lib/agents/role-model-params';

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

// No personal address in code: SEED_OWNER_EMAIL (hosted deploy pins it) → ADMIN_EMAIL → 'system'.
const SEED_OWNER_EMAIL = (process.env.SEED_OWNER_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();

// NEVER a maxTokens literal here — the value comes from the per-role table (lib/agents/role-model-params.ts),
// which falls back to DEFAULT_MAX_TOKENS; report:template-freshness reads the same table
// (guarded by scripts/test-seed-model-params-guard.ts + test:role-model-params).
const MODEL_PARAMS = (tier: 'infra' | 'synthesis', timeout: number, role: string) => ({
  provider: 'anthropic_sdk',
  model: AGENT_MODELS[tier],
  temperature: 0.3,
  maxTokens: expectedMaxTokens(role),
  useSystemPrompt: true,
  maxRetries: 2,
  timeout,
});

const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Requirements State Harvester',
    description: 'Phase 0 of the requirements-authoring-protocol (CONDITIONAL — skipped when the task supplies the infrastructure state inline). Self-provisions the read-only service from EACH descriptor the task carries (register → read-only call → teardown), then performs a READ-ONLY harvest via narrow scoped reads of the surfaces the stated objective touches, emitting one clearly labelled section per domain. Unlike every prior use of this role the task may name SEVERAL descriptors from DIFFERENT domains; the protocol re-binds the lifecycle to repeat per descriptor and re-binds the consumer to the Requirements Author (this pipeline has no design phase). Harvests secret metadata, never values. Read-only only — never a mutating or privilege-escalating verb. Reads requirements-authoring-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.ORCHESTRATOR,
    defaultRole: 'infra_state_harvester', // REUSED, UNEDITED — see the header note; editing it is a 5-template edit
    tags: ['requirements-authoring', 'harvester', 'phase-0', 'conditional'],
    timeout: 600, // 10 min — the self-provision lifecycle runs once PER DESCRIPTOR, so this is the
                  // one phase whose cost scales with the task; revisit only on observed exhaustion.
    metadata: {
      // maxToolTurns decided CONSCIOUSLY: no override. The per-descriptor loop is the same shape as
      // the observability harvest (lifecycle + a few scoped reads), repeated — the engine default
      // suffices. V3's multi-descriptor dry-run is what would justify a bump, as a written finding.
      modelParameters: MODEL_PARAMS('infra', 600, 'infra_state_harvester'), // 'infra' tier: this is the one state-reaching role here
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'requirements-authoring-protocol', // byte-matches the agent_prompt_library row name
    },
  },
  {
    name: 'Requirements Author',
    description: 'Phase 1 of the requirements-authoring-protocol — THE deliverable producer. Authors a complete candidate requirements.md for a pov-program run by filling the program-artifacts template from the harvested state (§6) plus the stated objective: every placeholder resolved, every strip-register authoring note removed, requirements stated as testable properties rather than task lists, and every acceptance criterion that can carry a command and an expected output carrying them. Emits the Writing rules section as its marker ONLY — the rules are spliced in mechanically afterwards, because every authoring pass that transcribed them altered them. Never synthesizes an absence claim from harvest silence: absences are human declarations and are named as gaps. Produces a DRAFT SPECIFICATION for human review — never an approved document and never a launched program. Reads requirements-authoring-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.DOCUMENTER,
    defaultRole: 'requirements_author', // MINT
    tags: ['requirements-authoring', 'author', 'documenter', 'deliverable-producer'],
    timeout: 600, // 10 min — authoring a full template-shaped document is the longest phase
    metadata: {
      // 'synthesis' tier, not 'infra': this role reaches nothing and its output PROSE is the
      // deliverable, which is that tier's stated definition (lib/agents/model-tiers.ts). Both tiers
      // resolve to the same model today, so this is an intent declaration, not a behaviour change —
      // it is what a future tier split would act on.
      modelParameters: MODEL_PARAMS('synthesis', 600, 'requirements_author'),
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'requirements-authoring-protocol',
    },
  },
  {
    name: 'Requirements Reviewer',
    description: 'Phase 2 of the requirements-authoring-protocol — independent QA gate (not the deliverable; the harness sets suppressDefaultReportMd on it, so it produces result.json only). Grades the drafted requirements.md against the TEMPLATE CONTRACT rather than against prose taste: no surviving placeholders, no surviving strip-register notes, the Writing rules section carrying its marker and not retyped rules, every acceptance criterion checkable by someone who did not write the document, every absence claim declared as a declaration or named as a gap rather than inferred from harvest silence, the described decomposition coherent, and the document specifying a program without smuggling in its execution. Holds no mechanical conformance checker and says so rather than claiming a check it could not run. Ends with the terminal VERDICT block. Does not soften ratings. Reads requirements-authoring-protocol before beginning work.',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.REVIEWER,
    defaultRole: 'requirements_reviewer', // MINT — also added to REVIEWER_ROLES (parse-verdict.ts),
                                          // without which no structured reviewerVerdict fact is emitted
    tags: ['requirements-authoring', 'reviewer', 'quality', 'qa-gate'],
    timeout: 300, // 5 min — review is bounded, no generation
    metadata: {
      modelParameters: MODEL_PARAMS('synthesis', 300, 'requirements_reviewer'), // reaches nothing; grades a document
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      protocol: 'requirements-authoring-protocol',
    },
  },
];

async function main() {
  console.log('Seeding requirements-authoring templates...\n');

  const owner = SEED_OWNER_EMAIL
    ? await prisma.user.findUnique({ where: { email: SEED_OWNER_EMAIL }, select: { id: true } })
    : null;
  const createdBy = owner?.id ?? 'system';
  if (!owner) {
    console.warn(`  Owner ${SEED_OWNER_EMAIL || '(unset)'} not found — using 'system' sentinel for createdBy`);
  }

  for (const template of TEMPLATES) {
    console.log(`Seeding: "${template.name}"...`);

    // GS7: Idempotent — findFirst + update/create. No LEGACY_NAME: all three names are net-new
    // (verified against the 36 names across every seed-*templates*.ts, 2026-09-21).
    const existing = await prisma.agentTemplate.findFirst({
      where: { name: template.name },
    });

    // Bake role guidance into promptTemplate. All three roles HAVE ROLE_GUIDANCE_LIBRARY entries,
    // so the silent GENERIC fallback in getRoleSpecificGuidance() cannot fire here —
    // `npm run validate:role-guidance-coverage` is the pre-commit gate that keeps that true.
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
      // Abstract statements ONLY: `capabilities` is runtime-dead (hydrated, never rendered into a
      // prompt) and its drift is undetectable, so anything concrete here rots unobserved.
      capabilities: {
        'Protocol-Driven': 'Reads requirements-authoring-protocol from injected context before acting',
        'Context Chaining': 'Receives predecessor task output via pipeline context injection',
        'Specification, Not Execution': 'Produces a draft specification a human reviews and approves at a plan gate — never launches, applies, or acts on the program it describes',
      },
      constraints: {
        'Protocol First': 'Must read the injected protocol before beginning work',
        'Stay in Phase': 'Only perform the work for the specific phase assigned — do not skip ahead',
        'Read-Only Contact': 'The Harvester is the only role that contacts an external system, read-only only — the Author and Reviewer are pure cognition and reach nothing',
        'Draft, Never Approved': 'The deliverable is a candidate for human review; it is structurally incomplete until a person splices the writing rules in and runs the conformance check',
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

  console.log(`\nDone. ${TEMPLATES.length} requirements-authoring templates seeded.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
