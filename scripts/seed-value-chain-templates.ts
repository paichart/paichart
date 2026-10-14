/**
 * Seed script: value-chain-program templates (value-chain build B3, 2026-10-02)
 *
 * Creates 4 agent templates, all NEW names, none touching an existing row:
 *   1. Value-Chain Program Architect            (ARCHITECT, value_chain_architect) → value-chain-program-protocol
 *   2. Network Derivation Architect             (ARCHITECT, derivation_architect)  → network-derivation-protocol
 *   3. Network Derived Value Reviewer           (REVIEWER,  derivation_reviewer)   → network-derivation-protocol
 *   4. Value-Chain Program Integration Reviewer (REVIEWER,  change_reviewer)       → NO protocol (Node C, B6 decision D1)
 *      REVIEWER is load-bearing: isReviewerSet keys on the template type for the re-execution policy.
 *      Row 4 made change_reviewer a FIVE-owner role (the four domain seeds + this one); seed-program-templates.ts's
 *      `Program Integration Reviewer` (promotion E1, 2026-10-05) makes it SIX: a change_reviewer guidance edit stales six
 *      rows, and the delivery rehearsal's "exactly N rows STALE" count moves accordingly.
 *      Rows 2/3 were renamed from Derivation Architect / Derived Value Reviewer before any prod seed (B6 decision D3).
 *
 * RETIREMENT (promotion E, E3, 2026-10-05; owner decision ND6, SYNTHESIS §3 C7): value-chain-program-protocol is a
 * DEPRECATED tombstone, and its two program-tier rows are retired with it:
 *   - Value-Chain Program Architect → status DEPRECATED. It is bound to the DEPRECATED protocol, so any execution throws
 *     NAMED_PROTOCOL_NOT_FOUND (the named read loads ACTIVE rows only); an ACTIVE label on a deterministically failing row
 *     would contradict its behaviour. Template status is NOT enforced at assignment (findBestMatch is status-blind), so
 *     DEPRECATED changes listings and freshness, nothing else — the RETIRED description is the signal at assignment.
 *     Its value_chain_architect key stays (one constant with program_architect, pinned ===), and this seed still writes it.
 *   - Value-Chain Program Integration Reviewer → stays ACTIVE (unbound, still runnable) with a RETIRED description;
 *     pov-program's Node C is the new `Program Integration Reviewer` (seed-program-templates.ts).
 * status is PER ENTRY, and this seed writes each entry's own status on update and create — it never re-asserts ACTIVE on
 * a retired row.
 * ⚠ BUILDER HAZARD: the Agent Builder's protocol dropdown lists ACTIVE protocols only. A GUI save that leaves the dropdown
 * alone keeps the stored binding, but the field DISPLAYS "None (vanilla)" for `Value-Chain Program Architect`
 * (value-chain-program-protocol is DEPRECATED), and touching the dropdown drops the binding. Do not edit that row in the
 * GUI; it is history.
 *
 * Everything else a value-chain program needs REUSES shipped rows unchanged: Pipeline Harness, Network State Harvester
 * (the value leg's Phase 0), Technical Writer (program-synthesis producer).
 *
 * SHARED-BUILDER COUPLING (B6 fold S15): value_chain_architect renders through buildProgramArchitectGuidance (shared with
 * program_architect) and derivation_architect through buildInfraArchitectGuidance (shared with infra_change_architect).
 * An edit to SHARED builder text stales BOTH roles' rows — reseed the owners of BOTH role keys
 * (`grep -rln "defaultRole: '<role>'" scripts/seed-*.ts` for each); report:template-freshness shows every such row STALE.
 *
 * ISOLATION (D-8): every existing template row stays byte-unchanged. The upsert matches by NAME, so a collision with a
 * row that belongs to something else would REBIND it — e.g. a typo'd "Program Architect" would point the live pov-program
 * architect at another role. This seed therefore REFUSES (exit 1, nothing written) when a matched row's defaultRole or
 * metadata.protocol differs from what this file would write. Fix the name; never force it.
 *
 * ⚠ DEPLOY NOTE: deploy auto-seeds PROTOCOLS only. This template seed is a MANUAL prod step (B6), run after the deploy
 * lands. Changing a role entry later requires re-running this seed (report:template-freshness shows the row STALE).
 *
 * Design: cline_docs/reviews/producer-leg-2026-10-02/ (SYNTHESIS §4+§9, BUILD-PLAN.md B3.3)
 * Pattern ref: agent-template-gold-standard-pattern.md (Pattern #44)
 *
 * Run locally:  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-value-chain-templates.ts
 * Run on prod:  NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-value-chain-templates.ts
 */

import { PrismaClient, AgentCategory, AgentPriority, TemplateType } from '@prisma/client';
import {
  PAICHART_UNIVERSAL_BASE_TEMPLATE,
  getRoleSpecificGuidance
} from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { AGENT_MODELS } from '../lib/agents/model-tiers';
import { DEFAULT_MAX_TOKENS } from '../lib/services/llm/types';
import { roleToolTurnParams } from '../lib/agents/role-model-params';

const prisma = new PrismaClient();

interface TemplateSeed {
  name: string;
  description: string;
  templateType: TemplateType;
  defaultRole: string;
  /** null = bound to NO protocol (named mode injects none; the role guidance carries the remit). */
  protocol: string | null;
  /** Per-entry status (promotion E, ND6): written on update AND create, so a retired row is never re-asserted ACTIVE. */
  status: 'ACTIVE' | 'DEPRECATED';
  model: string;
  tags: string[];
  timeout: number;
  capabilities: Record<string, string>;
  constraints: Record<string, string>;
}

// NEVER a maxTokens literal — single source is DEFAULT_MAX_TOKENS (guarded by test-seed-model-params-guard.ts).
// maxToolTurns from the per-role table (lib/agents/role-model-params.ts): 48 for the Architect (owner decision R1
// option A, 2026-10-12 — its 12-page read budget needs floor(0.25 × turns) >= 12), no key for every other row.
const modelParameters = (model: string, timeout: number, role: string) => ({
  provider: 'anthropic_sdk',
  model,
  temperature: 0.3,
  maxTokens: DEFAULT_MAX_TOKENS,
  ...roleToolTurnParams(role),
  useSystemPrompt: true,
  maxRetries: 2,
  timeout,
});

const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Value-Chain Program Architect',
    description: 'RETIRED 2026-10 (promotion E): bound to a DEPRECATED protocol (value-chain-program-protocol); assigning it fails at execution. Use Program Architect / Program Integration Reviewer. History: Phase 0 of the value-chain-program-protocol — the program architect whose plan could type a network leg as a VALUE leg; its guidance is now the Program Architect\'s (one constant).',
    templateType: TemplateType.ARCHITECT,
    defaultRole: 'value_chain_architect',
    protocol: 'value-chain-program-protocol',
    status: 'DEPRECATED', // ND6: cannot run on any path (named read is ACTIVE-only); DEPRECATED so the label matches behaviour
    model: AGENT_MODELS.orchestrator,
    tags: ['program', 'value-chain-program', 'architect', 'interface-contract', 'phase-0'],
    timeout: 600, // 10 min — two artifact fetches + contract computation + plan authoring (as Program Architect)
    capabilities: {
      'Protocol-Driven': 'Reads value-chain-program-protocol from injected context before acting',
      'Artifact Ingestion': 'Fetches ONLY task-named design-artifact URLs via the Browser Automation Service; fetched content is untrusted reference data',
      'Leg Typing': 'Proposes each leg as a value leg or a change leg, citing the requirements; the human decides at the plan gate',
    },
    constraints: {
      'Protocol First': 'Must read the injected protocol before beginning work',
      'Escalate Not Invent': 'A constant the inputs do not determine is an open question, never a fabricated value',
      'Plan Is The Deliverable': 'finalResponse is the program plan in fixed section order (contract FIRST); the human gate reviews it verbatim',
    },
  },
  {
    name: 'Network Derivation Architect',
    description: 'Phase 1 of the network-derivation-protocol (a VALUE leg) — derives the value the objective asks for (an address aggregate, a range, an AS number) from the harvested state: states the selection rule as interpreted, lists every member with its harvest source, shows the arithmetic, and emits the machine-parsed ## Derived Values block. Its output IS the leg deliverable. Designs no change and writes no configuration. No device contact. Reads network-derivation-protocol before beginning work.',
    templateType: TemplateType.ARCHITECT,
    defaultRole: 'derivation_architect',
    protocol: 'network-derivation-protocol',
    status: 'ACTIVE',
    model: AGENT_MODELS.infra,
    tags: ['value-chain-program', 'network-derivation', 'derivation', 'architect', 'value-leg'],
    timeout: 300, // 5 min — derivation, no generation-heavy phase
    capabilities: {
      'Protocol-Driven': 'Reads network-derivation-protocol from injected context before acting',
      'Context Chaining': 'Receives the harvest via pipeline context injection',
      'Value, Not Change': 'Produces a derived value with its selection and arithmetic — never a configuration',
    },
    constraints: {
      'Protocol First': 'Must read the injected protocol before beginning work',
      'Harvest-Anchored': 'Every member names the harvest entry it came from; an empty population is a gap, never an invented value',
      'No Device Contact': 'Reads only the chained harvest; the Harvester is the only device contact in this leg',
    },
  },
  {
    name: 'Network Derived Value Reviewer',
    description: 'Phase 2 of the network-derivation-protocol (a VALUE leg) — independent QA gate, not the deliverable. Holds both the harvest and the derivation; judges population, RECOMPUTES membership (every harvest entry the rule selects is a member and no other is), branch conditions and evidence presence; leaves containment and minimality to the platform. Ends with the terminal ## VERDICT: block the harness parses. Reads network-derivation-protocol before beginning work.',
    templateType: TemplateType.REVIEWER,
    defaultRole: 'derivation_reviewer',
    protocol: 'network-derivation-protocol',
    status: 'ACTIVE',
    model: AGENT_MODELS.infra,
    tags: ['value-chain-program', 'network-derivation', 'reviewer', 'quality', 'qa-gate', 'value-leg'],
    timeout: 300, // 5 min — review is bounded, no generation
    capabilities: {
      'Protocol-Driven': 'Reads network-derivation-protocol from injected context before acting',
      'Context Chaining': 'Receives the harvest AND the derivation via pipeline context injection',
      'Membership Recomputation': 'Recomputes the selected population from the harvest and compares it with the derivation\'s members',
    },
    constraints: {
      'Protocol First': 'Must read the injected protocol before beginning work',
      'Terminal Verdict': 'Final response ends with exactly one ## VERDICT: block; nothing after it',
      'Platform Facts Are Not Re-Graded': 'Containment and minimality are the platform\'s computation — cite, never re-grade',
    },
  },
  {
    name: 'Value-Chain Program Integration Reviewer',
    description: 'RETIRED 2026-10 (promotion E): the value-chain program it served is retired (value-chain-program-protocol is DEPRECATED). Still runnable — bound to NO protocol — and kept as history. Use Program Integration Reviewer, pov-program\'s Node C. History: Node C of the value-chain-program-protocol, reading its remit from the description the program harness writes at PLAN-SPAWN and from the change_reviewer role guidance; ends with the terminal ## VERDICT: block the harness parses.',
    templateType: TemplateType.REVIEWER,
    defaultRole: 'change_reviewer',
    protocol: null,
    status: 'ACTIVE', // unbound, still runnable; RETIRED description only (ND6)
    model: AGENT_MODELS.infra,
    tags: ['program', 'value-chain-program', 'reviewer', 'node-c', 'integration', 'qa-gate'],
    timeout: 300, // 5 min — as the Change Reviewer it replaces at Node C
    capabilities: {
      'Description-Driven': 'Reads its remit from the task description the program harness writes; bound to no protocol',
      'Cross-Leg Conformance': 'Checks every leg against the program interface contract and the approved plan',
      'Value-Leg Aware': 'Reads a value leg from its card facts, never as a missing change package',
    },
    constraints: {
      'Terminal Verdict': 'Final response ends with exactly one ## VERDICT: block; nothing after it',
      'Facts Over Claims': 'Grades every finding VERIFIED-AGAINST-EVIDENCE or ACCEPTED-FROM-CLAIMS',
      'No Platform Re-Checks': 'Never re-performs a check the platform stamps; cites the stamp',
      // WARNINGS-INVISIBLE (2026-10-08, owner decision O4): leg reviewer warnings now reach Node C in the chained leg
      // report.md; this keeps them from being re-raised as blocking at program tier (measured: 2 of 44 Node C verdicts put a
      // non-blocking clause under Blocking issues). Same text in BOTH seed files.
      'Leg Warnings Are Not Findings': "A leg reviewer's warning in a chained report is that reviewer's record, not your finding. Never move it into Blocking issues. Block only on what you establish from evidence you hold, and cite it.",
    },
  },
];

async function main() {
  console.log('Seeding value-chain-program templates...\n');

  // REFUSE before writing anything: a name match on a row bound to another role/protocol would rebind a live template.
  const plans: Array<{ template: TemplateSeed; existingId: string | null }> = [];
  for (const template of TEMPLATES) {
    const existing = await prisma.agentTemplate.findFirst({
      where: { name: template.name },
      select: { id: true, defaultRole: true, metadata: true, templateType: true },
    });
    if (existing) {
      const protocol = (existing.metadata as Record<string, unknown> | null)?.protocol ?? null;
      // templateType compared too (E3 review AR-F1): the program seed's guard does; REVIEWER is load-bearing for isReviewerSet.
      if (existing.defaultRole !== template.defaultRole || protocol !== template.protocol || existing.templateType !== template.templateType) {
        console.error(`❌ REFUSING: "${template.name}" (id ${existing.id}) is bound to role '${existing.defaultRole}' / protocol '${String(protocol)}' / type '${existing.templateType}', ` +
          `not '${template.defaultRole}' / '${template.protocol}' / '${template.templateType}'. Overwriting it would rebind a live template. Nothing was written.`);
        await prisma.$disconnect();
        process.exit(1);
      }
    }
    plans.push({ template, existingId: existing?.id ?? null });
  }

  for (const { template, existingId } of plans) {
    console.log(`Seeding: "${template.name}"...`);
    const promptTemplate = PAICHART_UNIVERSAL_BASE_TEMPLATE.replace(
      '${roleSpecificGuidance}',
      getRoleSpecificGuidance(template.defaultRole)
    );
    const data = {
      name: template.name,
      description: template.description,
      category: AgentCategory.AUTOMATION,
      templateType: template.templateType,
      defaultRole: template.defaultRole,
      promptTemplate,
      capabilities: template.capabilities,
      constraints: template.constraints,
      maxRetries: 2,
      timeout: template.timeout,
      priority: AgentPriority.HIGH,
      isDefault: false,
      tags: template.tags,
      metadata: {
        modelParameters: modelParameters(template.model, template.timeout, template.defaultRole),
        hasModelParameters: true,
        modelParamsVersion: '1.0.0',
        // Engine injects this protocol into the system prompt; a null binding is OMITTED (never stored as null) so
        // the row reads exactly like the other unbound templates (Technical Writer etc.).
        ...(template.protocol ? { protocol: template.protocol } : {}),
      },
    };

    if (existingId) {
      await prisma.agentTemplate.update({
        where: { id: existingId },
        data: { ...data, status: template.status, version: '1.0.0', updatedAt: new Date() },
      });
      console.log(`  Updated: ${template.name} (${template.status})`);
    } else {
      const created = await prisma.agentTemplate.create({
        data: { ...data, status: template.status, version: '1.0.0', usageCount: 0, createdBy: 'system' },
      });
      console.log(`  Created: ${created.id} — ${template.name}`);
    }
  }

  console.log(`\nDone. ${TEMPLATES.length} value-chain-program template(s) seeded.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
