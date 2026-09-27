# template-system-specialist — Domain Library

> **Created 2026-09-27** (Protocol 12 — the agent file was 598 lines, soft budget 500; now 477). Depth evicted
> from `.claude/agents/template-system-specialist.md`, moved **VERBATIM** — dated claims inside the moved blocks are
> history, not current fact; where a block is known stale, a ⚠ note above it says so and says what is true today.
> Greppable, never auto-loaded. **The paired discovery (`.claude/knowledge/discoveries/template-system-discovery.md`)
> and its PROVEN greps, plus Pattern #44 (`agent-template-gold-standard-pattern.md`), outrank this file.**

## What stays in the agent file (the live invariants)

Source of truth = owning seed + `ROLE_GUIDANCE_LIBRARY` + `model-tiers.ts`; delivery = re-run the owning seed(s)
after deploy; freshness report first. The field→prompt-section map. The injection-exclusion SHAPE decision for a
new `defaultRole`. The RWF execution-config precedence + locks (D1/X15–X21). `change_reviewer` grammar + remit
(D2, EG-1). P10 + `templateType`'s `isReviewerSet` consumer. Three dated blocks (WS1 Phase C, prompt-claim
validation, freshness).

## Claim corrections made during the 2026-09-27 eviction (Protocol 11 Part C, each verified against the tree)

| Old claim (agent file) | What is true (2026-09-27) |
|---|---|
| 3 MCP templates (Registry, Service Orchestrator, Workflow Orchestrator); two `seed-mcp-*` scripts | 1 — MCP Service Registry, in `seed-agent-templates.ts`. The other two + their seeds removed `d6bdd038` (2026-09-25) |
| "37 total" templates; seed list without program / requirements-authoring | 40 ACTIVE rows (local freshness); 10 agent-template seeds (`seed-kpi-templates.ts` is KPI, not agent) |
| "the four infra roles each have four" owners | `infra_state_harvester` has 5 (requirements-authoring); the other three 4 |
| `templateType` → P9 `evaluateTemplateScopeMatch` | P9 deleted 2026-07-17; `templateType` is read by `isReviewerSet` (RWF C1–C3) |
| Library "only for the Universal Template fallback path (planned to be guarded)" | Fallback DELETED 2026-06-10 (`NoTemplateAssignedError`) |
| `change_reviewer` holds "the ONE grammar definition"; `test:parse-verdict` "fails CI" | 2 copies (change_reviewer + requirements_reviewer, 2026-09-21); `test:parse-verdict` is OUTSIDE `test:all-validation` |
| `config_change_author` maintenance-window backlog | RESOLVED 2026-09-12 `02db1d8b` (apply-governance note) |
| Model defaults hardcoded in `agentTaskService.ts` (anthropic_sdk / claude-haiku-4-5) | No hardcoded model since 2026-06-18; `buildTemplateModelParameters` + `AGENT_MODELS` |
| Freshness baseline 2026-08-04 0/0/3/32 | 2026-09-27 local 0/0/0/40; prod 0 STALE / 40 CURRENT after EG-1 reseed |
| Prompt-claim block "this file is 508 lines" | File 477 lines after eviction; the block was kept (Steve's 2026-07-25 decision) |
| prompt-registry.js uses `applyTemplateSafe` (Nov 2025 block) | Import removed 2025-11-25 `847b7153`; see the ⚠ note on that block |

## Evicted 2026-09-27 (Protocol 12)

### Agent Builder field coverage gap (Apr 2026) (agent file lines 143-156 as of 2026-09-27)

**Agent Builder field coverage gap** (as of Apr 2026): The Agent Builder form (`components/agents/AgentBuilderForm.tsx`) only exposes a SUBSET of the template's DB fields:

| Editable via GUI | NOT editable via GUI (seed-script-only, or edit via psql/Prisma Studio) |
|---|---|
| `role` (agentRole string) | `category` (AgentCategory enum) |
| `prompt` (promptTemplate — the full system prompt including baked role guidance) | `templateType` (TemplateType enum) |
| `description` | `capabilities` (JSON object) |
| `provider`, `model` | `constraints` (JSON object) |
| `temperature`, `maxTokens`, `stopSequences` | `tags` (string array) |
| `webSearch`, `cacheControl`, `thinkingBudgetTokens` | `defaultRole` (string) |
| | `version` (string) |
| | `priority` (AgentPriority enum) |

The unexposed fields are set at provisioning time by the seed script and can only be changed afterwards via psql or Prisma Studio. Adding them to the Agent Builder form is straightforward (simple field types: enums, strings, arrays, JSON objects) — just not yet wired. If Steve wants to "fully change all fields" per-model via the GUI, those fields need to be added to the form.

### MCP Template Pipeline (Apr 2026) (agent file lines 195-199 as of 2026-09-27)

> ⚠ **STALE since 2026-09-25 (`d6bdd038`)**: MCP Service Orchestrator and MCP Workflow Orchestrator were removed (0 tasks, 0 executions since 2026-04-01), with their two seed scripts and library entries. Only **MCP Service Registry** remains, seeded by `scripts/seed-agent-templates.ts`.

### MCP Template Pipeline (Apr 2026)
- 3 MCP templates: Service Registry, Service Orchestrator, Workflow Orchestrator (Discovery deprecated)
- Category: `MCP_SERVICE` (consolidated from 5 separate MCP categories)
- Decision guide: "register a service" → Service Registry, "call services" → Service Orchestrator, "chain 3+ services" → Workflow Orchestrator
- Gold standard: Pattern #44 `agent-template-gold-standard-pattern.md`

### Template Category Inventory snapshot (Apr–Sep 2026) (agent file lines 201-221 as of 2026-09-27)

> ⚠ **STALE SNAPSHOT.** Verified 2026-09-27: `seed-mcp-service-integration-template.ts` and `seed-mcp-workflow-orchestration-template.ts` no longer exist (`d6bdd038`); the MCP_SERVICE row is 1 template; the seed list omits `seed-program-templates.ts`, `seed-requirements-authoring-templates.ts`; local freshness counts **40 ACTIVE** rows, not 37. `AgentCategory` has 11 values incl. REVIEW and MONITORING (the table lists 9). The live set is `template(action:list)` / `npm run report:template-freshness`.

### Template Category Inventory (Rationalized — Apr 2026, updated task #83)

**11 categories** in `AgentCategory` enum (was 15 — 5 MCP categories consolidated to `MCP_SERVICE`). **~34 active templates** (Jun 2026 — the count drifts as pipeline domains land; query `template(action:list)` for the live set. The per-category counts below are a stale-prone snapshot.)

| Category | Count | Key Templates |
|----------|-------|-----------|
| GENERAL | 2 | pAIchart Universal (GENERALIST), Sales Engineer (OPERATOR — fixed from ARCHITECT in task #83) |
| DEVELOPMENT | 3 | Technical Consultant (ARCHITECT), Solution Architect (ARCHITECT), Senior Software Developer (BUILDER) |
| ANALYSIS | 4 | Business Analyst (ANALYST), Data Analyst (ANALYST), Research Analyst (ANALYST), Marketing Strategist (ANALYST) |
| MCP_SERVICE | 3 | MCP Service Registry (ORCHESTRATOR), MCP Service Orchestrator (ORCHESTRATOR), MCP Workflow Orchestrator (ORCHESTRATOR) |
| AUTOMATION | ~18 | Pipeline Harness (ORCHESTRATOR), Project Manager, the artifact-synthesis quartet (Source Acquirer/ACQUIRER, Artifact Harvester, Editorial Writer, Publication Reviewer) + **the pipeline specialist templates** — network-provisioning, kubernetes-gitops, terraform-iac, each a 4-stage set (State Harvester/ORCHESTRATOR · Architect/ARCHITECT · Author/DOCUMENTER · Reviewer/REVIEWER). The pipeline templates now dominate this category. |
| TESTING | 1 | QA Test Engineer (REVIEWER) |
| SECURITY | 1 | Security Analyst (REVIEWER) |
| DOCUMENTATION | 1 | Technical Writer (DOCUMENTER) |
| DEPLOYMENT | 1 | DevOps Engineer (OPERATOR) |

**Deprecated**: General Purpose Assistant, Customer Success Specialist, MCP Service Discovery

**TemplateType enum** (9 values): ARCHITECT, BUILDER, ANALYST, REVIEWER, OPERATOR, DOCUMENTER, ORCHESTRATOR, GENERALIST, ACQUIRER (added for the synthesis/harvest source-acquirer role). Category = domain, Type = functional approach.

**Seed scripts**: Main (`seed-agent-templates.ts`, 15 templates) + `seed-artifact-synthesis-templates.ts` (3) + `seed-harness-template.ts` (1) + `seed-mcp-service-integration-template.ts` (1) + `seed-mcp-workflow-orchestration-template.ts` (1) + the **infra-provisioning quartet** `seed-network-provisioning-templates.ts` / `seed-kubernetes-gitops-templates.ts` / `seed-terraform-iac-templates.ts` / `seed-observability-templates.ts` (4 templates each = 16) = **37 total** (Sep 2026; protocols are seeded separately via `seed-protocol-prompts.ts`)

### Infra roles — the maintenance-window backlog and the 2026-07-01 consolidation (agent file lines 239-241 as of 2026-09-27)

> ✅ **Backlog RESOLVED 2026-09-12 (`02db1d8b`)**: the maintenance-window slot became an APPLY-GOVERNANCE note across all four domains (`config_change_author` item (d); `change_reviewer` judges the REASON, never requires a window). The remaining `maintenance-window` hits in `pAIchartUniversalTemplate.ts` are that neutralization and its measurement comment.

**Backlog — a residual domain-ism to scrub when these roles are next touched**: `config_change_author` still carries a "maintenance-window note" — a network-ism that reads off for IaC (a governed `terraform apply`, not a maintenance window). Flagged by the prompt-construction reviewer during the Terraform review; the protocol papers over it. A ~2-line neutralization, non-urgent.

**Consolidation — DONE 2026-07-01**: `network_design_architect` was a redundant subset of `infra_change_architect`, so network was repointed onto the shared neutral roles and the `network_*` keys retired. The VLAN/SVI/routing domain framing now lives solely in the network-provisioning protocol (rig re-validation on the cEOS rig is the close-out gate).

### Template Scope Checking — P9 + P10 (Apr 2026), full text (agent file lines 264-304 as of 2026-09-27)

> P9 was RETIRED 2026-07-17 and `templateScopeMatcher.ts` DELETED — the verb-stem table and the "When extending verb stems" instruction below describe code that no longer exists. P10 remains live; the agent file keeps its compressed form.

### Template Scope Checking — P9 + P10 (Apr 2026)

> Two layered detectors catch wrong-template assignments at different points: **P9** before LLM dispatch (verb-pattern heuristic), **P10** during execution (agent self-identifies via escape hatch). Both are additive signals — see umbrella pattern `agent-output-trustworthiness-defense-stack-pattern.md`.

**P9 — Pre-execution scope check** — **RETIRED 2026-07-17** (`templateScopeMatcher.ts` DELETED)

The single-signal MVP shipped explicitly to gather empirical FPR data before committing to the heavier multi-signal design. The data decided AGAINST it: ~60 firings in system history, ZERO true positives — every firing was a deliberate protocol assignment ('harvest' on ORCHESTRATOR legs, 'author' on DOCUMENTER, 'assessment' on ARCHITECT) whose title vocabulary the hand-written verb table didn't cover. At ~100% FPR occupying 95% of the executionDegradation channel it trained readers to ignore the field (Protocol 10 trust-erosion). Retired: matcher deleted, P9 promotion removed, GUI keeps a tolerant READ path for historical artifacts. The heavier multi-signal design was NOT built (machinery for an unobserved failure mode). Revisit trigger: the first ACTUAL wrong-template incident observed in the wild. P10's [TEMPLATE_MISMATCH] agent self-report escape hatch remains (different mechanism, agent-attested).

Per-templateType verb stems:

| templateType | Expected verb stems |
|---|---|
| ARCHITECT | `design`, `architect`, `plan`, `evaluate`, `choose`, `option`, `framework`, `blueprint`, `strateg` |
| BUILDER | `implement`, `build`, `create`, `write`, `code`, `develop`, `fix`, `refactor`, `add` |
| ANALYST | `analy`, `investigate`, `research`, `measure`, `quantif`, `roi`, `metric`, `data`, `insight`, `harvest`, `extract` |
| REVIEWER | `review`, `critiqu`, `audit`, `verif`, `validat`, `test`, `check`, `assess`, `evaluat`, `inspect`, `gap`, `compliance` |
| OPERATOR | `deploy`, `coordinate`, `schedul`, `monitor`, `operate`, `manage`, `roll out` |
| DOCUMENTER | `document`, `documentation`, `write`, `guide`, `manual`, `explain`, `report`, `narrative`, `case study`, `prose`, `integrate`, `annotat`, `editor` |
| ORCHESTRATOR | `orchestrat`, `workflow`, `pipeline`, `sync`, `integrate`, `compose` |
| GENERALIST | (wildcard — never flags) |

**Critical regression case:** Publication Reviewer template (REVIEWER) + "Phase 4 — Self-Critique: Conflation detection pass" task. The substring stem `critiqu` matches the token `critique` → MATCH, no false-positive flag. This case drove the MVP scope decision (away from full multi-signal scoring).

**Skip conditions** — pre-empts noise:
- Template has no `templateType` → skip
- templateType is GENERALIST → skip (wildcard)
- Task has < 5 distinct meaningful words (after stop-word filter) → skip (sparse task; absence isn't meaningful)

**MVP-vs-full-design rationale (2026-04-16):** template-system-specialist proposed 5-signal scoring with `metadata.applicableTaskPatterns` (regex array). Rejected for MVP because (a) no empirical false-positive data yet, (b) metadata authoring/maintenance burden across ~16 templates, (c) the parent-lineage signal (highest weight) has no data — verified prod query: harness children carry only `confidenceScore` + `completionSummary` in metadata. Single-signal MVP with title verbs handles confirmed false-positive case correctly. Full design deferred until empirical FPR > 15% justifies it.

**P10 — In-execution escape hatch** (engine + stream route system prompt append)

Universal Scope Self-Check instruction appended to EVERY agent's system prompt. Tells agents to return only the structured marker `[TEMPLATE_MISMATCH]` if assignment is wrong-scope, with `Reason:` + `Suggested role:` lines. Detection regex `/^\s*(?:```\s*)?\[TEMPLATE_MISMATCH\]/i` (NOT multiline) on first 300 chars of finalResponse — anchored to prevent false-positive when agent quotes the marker syntax in normal prose.

P10 OVERRIDES other categories when fired (highest signal-to-noise — agent's own admission).

**Different errorCategory values** for P9 vs P10 let the reactor distinguish:
- ~~`TEMPLATE_SCOPE_MISMATCH`~~ (P9) → RETIRED 2026-07-17; in historical artifacts treat as noise (~100% FPR)
- `TEMPLATE_MISMATCH_SELF_REPORTED` (P10, agent admission) → trust agent, reassign immediately

**When extending verb stems:** add to `TEMPLATE_TYPE_VERBS` in `templateScopeMatcher.ts`; add a regression test in `scripts/test-template-scope-matcher.ts` exercising both true-positive and true-negative cases for the new stem.

### My Pattern Library — admin-ui clone pattern (agent file lines 308-315 as of 2026-09-27)

### My Pattern Library
- `/.claude/knowledge/patterns/admin-ui-quick-wins-pattern.md` (98% confidence, Nov 25, 2025)
  - Pattern 3: Clone Functionality (30 min implementation)
  - One-click cloning: fetch original → create copy → open in edit mode
  - Clone naming: `${original.name}_copy_${Date.now()}` for uniqueness
  - Clone status: Start as DRAFT to prevent accidental use
  - Proven: 50% reduction in creation time, validated on prompt library
  - Applicable to: Agent templates, POVs, Phases, Teams, Tasks

### Common Tasks — Template Rationalization (COMPLETED Apr 2026) (agent file lines 330-338 as of 2026-09-27)

2. **Template Rationalization** ✅ COMPLETED (Apr 2026)
   - Inventory: 17→16 active (3 deprecated, 2 added: Sales Engineer + Marketing Strategist)
   - GENERAL: 4→2 (General Purpose consolidated into Universal, Customer Success removed)
   - MCP categories: 5→1 (MCP_SERVICE consolidation)
   - Recategorized: Project Manager (GENERAL→AUTOMATION)
   - Role guidance: 14→18 entries (4 added, 0 gaps remaining)
   - Template type system: 9-value TemplateType enum added to schema (ACQUIRER added for synthesis/harvest)
   - Decision guides: per-category swim lanes documented in `template-type-system-design-2026-04-03.md`
   - See: `cline_docs/template-type-system-design-2026-04-03.md` for full design

### Variable Security Integration Discovery (Nov 2025) (agent file lines 484-531 as of 2026-09-27)

> ⚠ **CLAIM-STALE (verified 2026-09-27)**: `lib/mcp/server/prompts/prompt-registry.js` NO LONGER imports `applyTemplateSafe` — it was removed on 2025-11-25 (`847b7153`, "Remove prompt-injection-prevention dependency (module not found)"), weeks after the integration below. Current importers: `lib/services/agentTemplateService.ts`, `lib/validation/agent-template-validation.ts` (and the module itself, now 852 lines). The integration pattern is history; whether prompt-library argument substitution is protected today is an OPEN question, not a fact.

#### ⭐ Variable Security Integration Discovery (Nov 2025)

**Critical Finding**: Prompt library was vulnerable, agent templates were protected

**Existing Security**: `/lib/security/prompt-injection-prevention.ts` (808 lines)
- applyTemplateSafe() with 5-layer protection
- 25+ injection patterns (IGNORE INSTRUCTIONS, system:, etc.)
- Production-tested since Oct 30, 2025

**Integration Pattern** (Prompt Registry):
```javascript
// lib/mcp/server/prompts/prompt-registry.js
const { applyTemplateSafe } = require('../../security/prompt-injection-prevention');

const application = applyTemplateSafe(prompt.promptText, args, {
  strictMode: true,         // Block CRITICAL + HIGH
  validateInjection: true,  // 25+ patterns
  maxValueLength: 2000      // DoS prevention
});

if (!application.success) {
  throw new Error(`Injection blocked: ${application.errors.join(', ')}`);
}
return application.result;  // Sanitized
```

**Impact**: Saved 5.5 hours by discovering existing solution vs rebuilding

**Discovery Commands**:
```bash
# Find applyTemplateSafe usage
grep -r "applyTemplateSafe" lib app --include="*.ts" --include="*.js"

# Find variable substitution patterns
grep -r "{{.*}}\|prompt.*variable" lib app --include="*.js" --include="*.ts"

# Find injection prevention
grep -r "detectPromptInjection\|sanitizeTemplateVariable" lib --include="*.ts"

# Check security layer exists
ls -la lib/security/prompt-injection-prevention.ts
```

**Pattern for All Template Systems**:
1. **Check if security exists** before building new
2. **Reuse applyTemplateSafe()** for any variable substitution
3. **Same security** for agent templates AND prompt templates
4. **Consistent protection** across all template types

### Learning Notes — two superseded lines (agent file lines 372/374 as of 2026-09-27)

> Both were stale when evicted: GENERAL holds 2 templates after the Apr 2026 rationalization, and `agentTaskService.ts` has had no hardcoded provider/model since the 2026-06-18 cleanup (`buildTemplateModelParameters`).

- **Rationalization signal**: 13 templates in GENERAL category is a code smell — many should be recategorized to ANALYSIS, AUTOMATION, or domain-specific categories
- **Model defaults**: Template fallback in `agentTaskService.ts` hardcodes `provider: 'anthropic_sdk'` and `model: 'claude-haiku-4-5'`. When creating templates, these are the effective defaults if `metadata.modelParameters` is not set.

### Success Metrics (aspirational, never measured) (agent file lines 376-391 as of 2026-09-27)

#### Success Metrics

### Template System Health
- Template creation success rate > 98%
- Data transformation error rate < 2%
- Template application success rate > 95%

### Migration Success
- Zero breaking changes during migrations
- Backward compatibility maintained 100%
- Performance improvement > 15% post-migration

### User Experience
- Template editor load time < 3 seconds
- Form validation response time < 500ms
- Template save success rate > 99%

### Handover Confidence Calculation (agent file lines 401-407 as of 2026-09-27)

### Confidence Calculation:
```
if (template_size > 30000) confidence = 95
else if (template_size > 20000) confidence = 85
else if (template_complexity === 'high') confidence = 80
else confidence = 70
```
