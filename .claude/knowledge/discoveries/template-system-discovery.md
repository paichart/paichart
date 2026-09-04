# Template System Discovery Task

**Last Updated**: 2026-04-03  
**Status**: Enhanced v3.0 — Gold Standard integrated, rationalization added  
**Confidence**: Very High - Validated Apr 2026
**Last Validated**: 2026-04-03 — All file paths, greps, categories verified

## Objective
Map and understand the complete agent template system in pAIchart, including data flow, storage patterns, UI components, and the ongoing metadata.agentConfig refactoring.

## Context
The agent template system is central to pAIchart's AI capabilities. It provides structured agent configurations including roles, capabilities, constraints, prompt templates, and MCP tool configurations. The system involves complex data transformations between frontend components and backend services, with templates stored in typed database fields but managed through rich UI forms. Understanding this comprehensive system is critical for maintaining agent functionality, enabling template reuse, and supporting the agent execution engine.

## Discovery Scope

### 1. Template Data Architecture
- [ ] Map all template-related models in Prisma schema
- [ ] Document template field structure and types
- [ ] Identify metadata vs typed field usage
- [ ] Trace template inheritance patterns
- [ ] Find template category definitions and usage

### 2. Frontend Template Components
- [ ] Map template editor components
- [ ] Identify state management patterns
- [ ] Document form validation logic
- [ ] Find data transformation points
- [ ] Trace template selection flows

### 3. Backend Services
- [ ] Document AgentTemplateService methods
- [ ] Map API routes for templates
- [ ] Find template validation logic
- [ ] Identify template application patterns
- [ ] Trace template-to-task relationships

### 4. Data Flow Analysis
- [ ] Frontend form → metadata.agentConfig transformation
- [ ] API layer data handling
- [ ] Service layer transformations
- [ ] Database storage patterns
- [ ] Template application to tasks
- [ ] **Field → prompt-section map** (which template field lands in which prompt part): the authoritative map
  lives in `template-system-specialist.md` §"Template Data Architecture" (source of truth =
  `execution-hydration.ts` `EXECUTION_TEMPLATE_SELECT`). Key runtime facts to re-verify each pass:
  ```bash
  grep -nE "promptTemplate|defaultRole|constraints|outputSchema|capabilities" lib/services/execution-hydration.ts  # the 11-field select
  grep -n "renderConstraintsBlock" lib/services/execution-system-prompt.ts   # constraints → SYS-TAIL (Axis 5, DOUBLE w/ §8)
  ```
  ⚠ Two latent/dead cells (do NOT assume live): `outputSchema`→§2 is LATENT (0 templates set it); `capabilities`
  is hydrated but consumed NOWHERE (dead — candidate to drop from the select). Objects, not arrays.

### 5. Integration Points
- [ ] MCP tool configurations in templates
- [ ] Model parameter settings
- [ ] Template usage in agent execution
- [ ] Template selection in POV editor
- [ ] Default template mechanisms

## Search Strategies

### 1. Core Template Patterns
```bash
# Core template patterns with context
grep -r "agentTemplate\|AgentTemplate\|agent-template" --include="*.ts" --include="*.tsx" -B 2 -A 5 | head -50
grep -r "model AgentTemplate\|interface AgentTemplate" --include="*.ts" --include="*.tsx" -B 2 -A 10

# Metadata and config patterns
grep -r "metadata\.agentConfig\|metadata\.mcpToolConfiguration" --include="*.ts" --include="*.tsx" -B 2 -A 2
grep -r "setField\(\['agentConfig'\]\|setField\(\['metadata'" --include="*.ts" --include="*.tsx" -A 3
grep -r "getFieldValue\(\['agentConfig'\]\|getFieldValue\(\['metadata'" --include="*.ts" --include="*.tsx" -A 3
```

### 2. Service and Import Discovery
```bash
# Service layer
grep -r "AgentTemplateService" --include="*.ts" -l | head -20
grep -r "from '@/lib/services/agentTemplate" --include="*.ts" --include="*.tsx" -B 1 -A 1
grep -r "agentTemplateService\." --include="*.ts" --include="*.tsx" -B 2 -A 2

# Component imports
grep -r "from '@/components/poveditor/template" --include="*.tsx" -l
grep -r "TemplateEditor.*Context\|useTemplateEditor" --include="*.tsx" -B 2 -A 5
```

### 3. Type System Analysis
```bash
# Type definitions and interfaces
grep -r "interface.*AgentTemplate\|type.*AgentTemplate" --include="*.ts" -B 2 -A 10
grep -r ": AgentTemplate\[\]\|: AgentTemplate\s*;" --include="*.ts" --include="*.tsx"
grep -r "<AgentTemplate>\|AgentTemplate>" --include="*.ts" --include="*.tsx" -B 1 -A 1

# Enums and categories
grep -r "enum AgentCategory\|AgentCategory\." --include="*.ts" -B 2 -A 10
grep -r "DEVELOPMENT\|TESTING\|DOCUMENTATION\|DEPLOYMENT" --include="*.ts" | grep -i category
```

### 4. Data Transformation Patterns
```bash
# Nested data access with context
grep -r "data\.agentConfig\.\|metadata\.agentConfig\." --include="*.ts" --include="*.tsx" -B 3 -A 3

# Spread operations
grep -r "\.\.\.agentConfig\|\.\.\.metadata\|\.\.\.template" --include="*.ts" --include="*.tsx" -B 2 -A 2

# Conditional access patterns
grep -r "agentConfig\?\.\|template\?\.\|metadata\?\." --include="*.ts" --include="*.tsx" -B 1 -A 1

# Array operations on templates
grep -r "templates\.\(map\|filter\|reduce\|find\|forEach\)" --include="*.ts" --include="*.tsx" -B 2 -A 3
```

### 5. Component Architecture
```bash
# Find all template components
find components -name "*[Tt]emplate*" -o -name "*[Aa]gent[Cc]onfig*" | grep -v node_modules | sort

# Template editor components
find components/poveditor/template -name "*.tsx" | xargs ls -la
grep -r "TemplateEditorProvider\|useTemplateEditor" components/ -l

# Template management UI
find components/admin/templates -name "*.tsx" | xargs ls -la
```

### 6. API Routes and Database
```bash
# API routes discovery
find app/api -path "*agent-template*" -o -path "*agent_template*" | xargs ls -la
grep -r "route\(AgentTemplate\)\|/agent-templates" app/api --include="*.ts" -l

# Database operations
grep -r "prisma\.agentTemplate\." --include="*.ts" -B 2 -A 5
grep -r "include:.*{.*agentTemplate" --include="*.ts" -B 2 -A 5
grep -r "create.*agentTemplate\|update.*agentTemplate" --include="*.ts" -B 2 -A 5
```

### 7. Template Builder Discovery
```bash
# Builder service patterns
grep -r "AgentTemplateBuilderService\|agentTemplateBuilder" lib/services/ -B 2 -A 5
grep -r "createTemplate.*builder\|buildTemplate" --include="*.ts" -B 2 -A 5
find lib/services -name "*templateBuilder*" -type f | xargs ls -la

# Builder API endpoints
grep -r "/api/agent-templates/builder" --include="*.ts" --include="*.tsx" -B 2 -A 2
```

### 8. Prompt Library Integration
```bash
# Prompt library API and service
grep -r "/api/agent-templates/prompt-library" --include="*.ts" --include="*.tsx" -B 2 -A 2
grep -r "getPromptSuggestions\|promptLibrary" --include="*.ts" -B 2 -A 5
grep -r "promptTemplate.*library\|library.*promptTemplate" --include="*.ts" -B 2 -A 2

# Template variables
grep -r "{{.*}}\|handlebars\|template.*variable" --include="*.ts" --include="*.tsx" | grep -i prompt
```

### 9. Template-Task Relationships
```bash
# Task application patterns
grep -r "agentTemplateId.*task\|task.*agentTemplateId" --include="*.ts" -B 2 -A 2
# configureAgentForTask was deleted 2026-06-08 (dead code); the live configure path is the MCP handler:
grep -rn "agent-configure-handler\|agent\.configure" --include="*.ts" -B 2 -A 5

# Template loading in execution
grep -r "loadAgentTemplate\|getAgentTemplate" --include="*.ts" -B 2 -A 5
```

### 10. Model Parameter Configuration
```bash
# LLM parameters in templates
grep -r "modelParameters.*temperature\|modelParameters.*provider" --include="*.ts" -B 3 -A 5
grep -r "LLMProvider\|ANTHROPIC_SDK\|OPENAI" --include="*.ts" | grep -i template
grep -r "maxTokens.*template\|temperature.*template" --include="*.ts" -B 2 -A 2

# Provider configuration
grep -r "metadata.*modelParameters" --include="*.ts" --include="*.tsx" -B 2 -A 5
```

### 11. Template Validation
```bash
# Validation functions
grep -r "validateTemplate\|isValidTemplate\|templateSchema" --include="*.ts" -B 2 -A 5
grep -r "template.*validation\|validate.*template" --include="*.ts" -B 2 -A 5
grep -r "zod.*template\|yup.*template" --include="*.ts" -B 2 -A 5

# Error handling
grep -r "TemplateError\|InvalidTemplate" --include="*.ts" -B 2 -A 5
```

### 12. Template Operations
```bash
# CRUD operations
grep -r "createTemplate\|updateTemplate\|deleteTemplate" --include="*.ts" -B 2 -A 5
grep -r "duplicateTemplate\|copyTemplate\|cloneTemplate" --include="*.ts" -B 2 -A 5

# Template selection
grep -r "selectTemplate\|selectedTemplate\|templateSelector" --include="*.ts" --include="*.tsx" -B 2 -A 2
```

### 13. MCP Tool Integration
```bash
# MCP tool configuration in templates
grep -r "metadata\.mcpToolConfiguration" --include="*.ts" --include="*.tsx" -B 2 -A 5
grep -r "selectedTools.*template\|template.*selectedTools" --include="*.ts" -B 2 -A 3
grep -r "enabledTools\|toolConfigurations" --include="*.ts" | grep -i template

# Static tools integration
grep -r "staticTools.*template\|template.*staticTool" --include="*.ts" -B 2 -A 5
grep -r "STATIC_SERVER_TOOLS" lib/services/mcp/ | grep -B 2 -A 2 template
```

### 14. Template Categories and Organization
```bash
# Category usage
grep -r "category:.*DEVELOPMENT\|category:.*TESTING" --include="*.ts" --include="*.tsx" -B 2 -A 2
grep -r "filterByCategory\|categoryFilter" --include="*.ts" --include="*.tsx" -B 2 -A 5

# Tags and metadata
grep -r "tags.*template\|template.*tags" --include="*.ts" --include="*.tsx" -B 2 -A 2
grep -r "template.*priority\|AgentPriority" --include="*.ts" -B 2 -A 2
```

### 15. Performance and Analytics
```bash
# Template usage tracking
grep -r "template.*usage\|usage.*template" --include="*.ts" | grep -v node_modules | head -20
grep -r "templateId.*metrics\|analytics.*template" --include="*.ts" -B 2 -A 2

# Performance configuration
grep -r "timeout.*template\|maxRetries.*template" --include="*.ts" -B 2 -A 2
grep -r "template.*performance\|optimize.*template" --include="*.ts" -B 2 -A 2
```

### 16. System Health Check
```bash
echo "=== Template System Health Check ==="
echo "1. Template service exists: $([ -f lib/services/agentTemplateService.ts ] && echo '✅ YES' || echo '❌ NO')"
echo "2. Template API routes: $(find app/api -name "*agent-template*" 2>/dev/null | wc -l)"
echo "3. Template components: $(find components -name "*[Tt]emplate*" 2>/dev/null | grep -v node_modules | wc -l)"
echo "4. Prisma model defined: $(grep -c "model AgentTemplate" prisma/schema.prisma 2>/dev/null || echo '0')"
echo "5. Template editor exists: $([ -d components/poveditor/template ] && echo '✅ YES' || echo '❌ NO')"
echo "6. Admin UI exists: $([ -d components/admin/templates ] && echo '✅ YES' || echo '❌ NO')"
echo "7. MCP integration refs: $(grep -c "mcpToolConfiguration" --include="*.ts" -r . 2>/dev/null || echo '0')"
echo "8. Category enum entries: $(grep -A20 'enum AgentCategory' prisma/schema.prisma | grep '^\s\+\w' | wc -l)"
echo "9. Builder services: $(find lib/services/agentTemplateBuilder -name "*.ts" 2>/dev/null | wc -l)"
echo "10. Gold standard pattern: $([ -f .claude/knowledge/patterns/agent-template-gold-standard-pattern.md ] && echo '✅ YES' || echo '❌ NO')"

# Configuration check
echo -e "\n=== Template Configuration ==="
echo "Model parameters refs: $(grep -c "modelParameters" --include="*.ts" -r . 2>/dev/null || echo '0')"
echo "Prompt template refs: $(grep -c "promptTemplate" --include="*.ts" -r . 2>/dev/null || echo '0')"
echo "Capabilities refs: $(grep -c "capabilities.*template" --include="*.ts" -r . 2>/dev/null || echo '0')"
echo "Constraints refs: $(grep -c "constraints.*template" --include="*.ts" -r . 2>/dev/null || echo '0')"

# Gold Standard Health
echo -e "\n=== Gold Standard Health ==="
echo "ROLE_GUIDANCE entries: $(grep -oP "^\s+'[a-z_]+'" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts 2>/dev/null | wc -l)"
echo "Template roles: $(grep -oP "defaultRole:\s*'[^']+'" scripts/seed-agent-templates.ts 2>/dev/null | sort -u | wc -l)"
echo "GENERAL templates: $(grep -c "AgentCategory.GENERAL" scripts/seed-agent-templates.ts 2>/dev/null || echo '0') (target: reduce)"
echo "Legacy metadata.agentConfig refs: $(grep -rc "metadata\.agentConfig" --include="*.ts" lib/ app/ 2>/dev/null | grep -v ':0$' | wc -l) files (target: 0)"
```

### 17. Template Inventory & Rationalization (NEW — Apr 2026)

**Purpose**: Generate a complete inventory for rationalization against Gold Standard Pattern #44.
**Reference**: `/.claude/knowledge/patterns/agent-template-gold-standard-pattern.md`

```bash
echo "=== TEMPLATE INVENTORY ==="

# Complete template list with name, category, role
echo "--- All Templates (name + category + role) ---"
grep -A8 "name:" scripts/seed-agent-templates.ts | \
  grep -E "name:|category:|defaultRole:" | \
  paste - - - 2>/dev/null | head -40

echo ""
echo "--- Category Distribution ---"
grep -oP "AgentCategory\.\w+" scripts/seed-agent-templates.ts | sort | uniq -c | sort -rn

echo ""
echo "--- Separate Seed Scripts (MCP/KPI templates) ---"
find scripts -name "*seed*template*" -o -name "*seed*mcp*" -o -name "*seed*kpi*" | sort

echo ""
echo "--- Empty Categories (enum exists but no templates) ---"
for cat in $(grep -oP '\w+' <<< "$(grep -A20 'enum AgentCategory' prisma/schema.prisma | grep '^\s\+\w' | tr -d ' ')"); do
  count=$(grep -c "AgentCategory\.$cat" scripts/seed-agent-templates.ts 2>/dev/null || echo 0)
  if [ "$count" = "0" ]; then
    echo "  ⚠️ $cat: 0 templates (dead enum or separate seed script?)"
  fi
done
```

### 18. Gold Standard Audit — GS2: Role Guidance Coverage

> **CI now enforces coverage (2026-06-19 pairing-diff):** `validate:role-guidance-coverage` (pre-commit +
> `test:all-validation`) FAILS if a seeded `defaultRole` has neither a `ROLE_GUIDANCE_LIBRARY` entry nor a
> documented `INTENTIONALLY_GENERIC_ROLES` exemption. (Distinct from `validate:role-guidance` below, which
> checks the Deliverable *Contract* of existing entries.) **Why it matters:** role guidance is BAKED into the
> template's `promptTemplate` at seed time (`BASE_TEMPLATE.replace('${roleSpecificGuidance}', …)`), so a
> missing entry silently bakes the thin GENERIC fallback, and changing an entry needs a RE-SEED to take effect.
> Adding the entry is a required step of template creation — see `ADD-A-PIPELINE-HARNESS-AGENT.md`.

```bash
echo "=== GS2: ROLE GUIDANCE COVERAGE AUDIT ==="

echo "--- Roles defined in templates (ALL seed scripts — not just the main one; the synthesis + infra roles live in separate scripts) ---"
grep -hoP "defaultRole:\s*'\K[^']+" scripts/seed-*templates*.ts scripts/seed-harness-template.ts 2>/dev/null | sort -u > /tmp/template_roles.txt
cat /tmp/template_roles.txt

echo ""
echo "--- Roles in ROLE_GUIDANCE_LIBRARY ---"
grep -oP "^\s+'\K[a-z_]+" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts | sort -u > /tmp/guidance_roles.txt
cat /tmp/guidance_roles.txt

echo ""
echo "--- ⚠️ Template roles WITHOUT guidance (get generic fallback) ---"
comm -23 /tmp/template_roles.txt /tmp/guidance_roles.txt

echo ""
echo "--- Guidance roles WITHOUT templates (orphaned entries) ---"
comm -13 /tmp/template_roles.txt /tmp/guidance_roles.txt

rm -f /tmp/template_roles.txt /tmp/guidance_roles.txt
```

### 18b. Infrastructure-Provisioning Roles + Role↔Protocol Pairing (Jun 2026)

> The connected-service pipelines (network / k8s / terraform) added FIVE roles + a 3-layer prompt model the
> older audits don't cover. The role guidance (`pAIchartUniversalTemplate.ts`) is the **neutral** layer; the
> **domain protocol** (`seed-protocol-prompts.ts`, injected at runtime via TEMPLATE `metadata.protocol`) is the domain
> layer; they can DRIFT, so audit the pairing. ⚠️ WS2 Phase A (2026-08-17): `task.metadata.protocol`
> now ALSO exists — a PLATFORM-WRITTEN routing stamp (title token resolved at first execution,
> write-protected, merge-preserved), NOT this template injection key. Same name, different object,
> different semantics — never conflate; `ws2-phase-a-2026-08-17/` is the record. Concept ref: `template-system-specialist.md` →
> "Infrastructure-Provisioning Roles + the Reuse Pattern".

```bash
echo "=== INFRA ROLES + PROTOCOL PAIRING AUDIT ==="

echo "--- the 4 domain-neutral infra-provisioning roles (network repointed onto these 2026-07-01; network_* keys retired) ---"
grep -nE "'(infra_state_harvester|infra_change_architect|config_change_author|change_reviewer)':" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts

echo ""
echo "--- the reuse PROOF: which templates reuse each neutral role ---"
grep -rhoE "defaultRole: '(infra_state_harvester|infra_change_architect|config_change_author|change_reviewer)'" scripts/seed-*templates*.ts | sort | uniq -c
# Expect: config_change_author / change_reviewer reused across network + k8s + terraform (×3 each);
# infra_state_harvester / infra_change_architect across k8s + terraform (×2). Terraform reused all 4 UNEDITED.

echo ""
echo "--- terminal-verdict grammar coupling (2026-07-14): grammar canonical in change_reviewer entry ONLY ---"
grep -c "## VERDICT: APPROVED | NEEDS-REVISION" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts   # expect 1
grep -c "## VERDICT: APPROVED | NEEDS-REVISION" scripts/seed-protocol-prompts.ts                                  # expect 0 (protocols reference, never redefine)
npm run test:parse-verdict   # 15 pass — fixtures are LIFTED from the change_reviewer entry; an entry edit that
                             # moves the marker fails here. Entry edits ⇒ re-seed the 3 reviewer templates.

echo ""
echo "--- the domain protocols that layer ON TOP of these roles ---"
grep -nE "name: '(network-provisioning|kubernetes-gitops|terraform-iac)-protocol'" scripts/seed-protocol-prompts.ts

echo ""
echo "--- PAIRING DRIFT CHECK: a 'neutral' role carrying a domain-ism the protocol should own ---"
grep -n "maintenance-window\|maintenance window" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts
# Known residual: config_change_author still says 'maintenance-window' (a network-ism, off for IaC — the
# protocol owns the apply mechanism). A hit here = a drift candidate to neutralize.
```

**What to verify:**
- All 4 neutral roles are reused by ≥2 domains' seed scripts — the reuse pattern (a new infra domain should add a protocol + templates, NOT new roles).
- Each pipeline role has a matching protocol whose "what each specialist produces" **restates (never contradicts)** the role's job. A role↔protocol disagreement is the GS2 split-source anti-pattern at pipeline scale — reconcile per **Protocol 11** (the pairing rule); the Pipeline Harness case (library vs hardcoded) is the precedent.
- The Deliverable Contract (`deliverableSourceTaskId` producer / `suppressDefaultReportMd` gate) appears in the base, the role, AND the protocol — confirm they agree on the producer (Author/DOCUMENTER) and the gate (Reviewer/REVIEWER).

### 19. Gold Standard Audit — GS4: Category Alignment

```bash
echo "=== GS4: CATEGORY ALIGNMENT CHECK ==="

# GENERAL category templates — potential recategorization targets
echo "--- GENERAL Templates (13 — review each for better fit) ---"
grep -B2 "AgentCategory.GENERAL" scripts/seed-agent-templates.ts | grep "name:" | head -15

echo ""
echo "--- Category decision question for each GENERAL template ---"
echo "Ask: Does this template's name/purpose better fit ANALYSIS, AUTOMATION, REVIEW, etc.?"
echo "Example: 'Sales Engineering Support' → should this be ANALYSIS or GENERAL?"
echo "Example: 'Multi-Agent Workflow Coordination' → should this be AUTOMATION or MCP_ORCHESTRATION?"
```

### 20. Gold Standard Audit — GS8: Template Differentiation

```bash
echo "=== GS8: TEMPLATE DIFFERENTIATION (OVERLAP DETECTION) ==="

# Templates in same category — check for overlapping scope
echo "--- Templates grouped by category (look for overlap) ---"
for cat in GENERAL DEVELOPMENT ANALYSIS TESTING SECURITY DOCUMENTATION DEPLOYMENT AUTOMATION; do
  count=$(grep -c "AgentCategory\.$cat" scripts/seed-agent-templates.ts 2>/dev/null || echo 0)
  if [ "$count" -gt "1" ]; then
    echo ""
    echo "=== $cat ($count templates) — check for swim lane overlap ==="
    grep -B2 "AgentCategory\.$cat" scripts/seed-agent-templates.ts | grep "name:"
    echo "→ Can a task be assigned to exactly ONE of these without ambiguity?"
  fi
done

echo ""
echo "--- Decision Guide Check ---"
echo "For each category with 2+ templates, create a decision guide:"
echo "  'If task says X, use template Y'"
echo "  'If task says Z, use template W'"
echo "See GS8 in agent-template-gold-standard-pattern.md for examples"
```

### 21. Gold Standard Audit — GS3/5/6: Prompt Quality

```bash
echo "=== GS3/5/6: PROMPT QUALITY AUDIT ==="

echo "--- GS3: Check prompt template structure (7 sections) ---"
echo "Required sections: Platform Structure, Your Context, Your Specialization,"
echo "  Tool Workflow, Reference sections, Output Rules, Role-Specific Guidance"
echo ""

# Check which templates have custom promptTemplate (vs generic)
echo "Templates with custom promptTemplate:"
grep -c "promptTemplate:" scripts/seed-agent-templates.ts 2>/dev/null
grep -B1 "promptTemplate:" scripts/seed-agent-templates.ts 2>/dev/null | grep "name:" | head -10

echo ""
echo "--- GS5: Pre-flight checks in MCP templates ---"
echo "MCP templates MUST include schema inspection + health check before calls"
grep -l "registry.*tools\|health.*check\|pre.flight\|inspect.*schema" \
  scripts/seed-mcp-*.ts 2>/dev/null

echo ""
echo "--- GS6: Deliverable Contract in templates (2026-04-26) ---"
echo "Templates MUST carry the Deliverable Contract: finalResponse is the delivery channel; comments are coordination only."
echo "Hits — templates correctly stating finalResponse-as-deliverable-channel:"
grep -l "deliverable channel\|final assistant response\|comments are coordination\|task.comment.*coordination" \
  scripts/seed-agent-templates.ts scripts/seed-mcp-*.ts \
  lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts 2>/dev/null

echo "Anti-pattern — templates still framing 2000-char comment-limit AS the deliverable cap (should be ZERO; superseded 2026-04-26):"
grep -lE "2000.*task\.comment|task\.comment.*2000|comment.*limit.*2000|split.*comment.*if.*long" \
  scripts/seed-agent-templates.ts scripts/seed-mcp-*.ts \
  lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts 2>/dev/null

echo "Engine §8 prose — should mention finalResponse as deliverable channel (commit d0c0f2d8):"
grep -n "deliverable channel\|finalResponse is the\|comments are coordination" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts | head -5

echo "Universal template Deliverable Contract section (commit 04fb7630):"
grep -n "Deliverable Contract\|deliverable channel\|comments are coordination" \
  /home/steve/copov15/lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts | head -10
```

### 22. Per-Role Deliverable Contract Audit (added 2026-04-26)

The greps above are file-level — they confirm `pAIchartUniversalTemplate.ts` mentions the contract somewhere, but a single role-guidance entry can have stale framing ("Output to the path...", "Report results via task.comment") while the file as a whole still passes. The 2026-04-26 regression discovered exactly this: 9 roles in `ROLE_GUIDANCE_LIBRARY` had drifted from the contract while the file-level grep showed green. Run the per-role audit to catch this:

```bash
# Asserts every role in ROLE_GUIDANCE_LIBRARY contains:
#   - **Deliverable**: subsection marker
#   - **Coordination**: subsection marker
# AND does NOT contain anti-patterns like:
#   - "Output to the path"
#   - "markdown file at the path"
#   - "Report results via task.comment"
#   - "Post a summary first, then follow-up comments"
#   - "task.comment accepts a maximum"
# Exits 1 if any role fails.
npm run validate:role-guidance

# Or invoke directly:
npx ts-node --transpile-only scripts/audit-role-guidance-contract.ts
```

**Expected**: `✓ All role-guidance entries carry the Deliverable Contract` with all roles ✅. If any role fails, the script prints `❌ <role>` with the missing markers and/or anti-pattern hits — fix per Pattern #44 GS6 (add subsections, remove legacy framing) before continuing the discovery.

**When to run**: any time `pAIchartUniversalTemplate.ts` is touched, before re-seeding any template that interpolates from this library, and at the start of any GS2/GS6 audit. The audit is fast (<3s) and has zero deps beyond `ts-node`.

**What it doesn't catch** (deliberate scope):
- Role-guidance entries that are correctly subsection-marked but factually wrong about the role's work
- Anti-patterns we haven't observed yet (the regex list is conservative — extend it as new drift patterns appear)
- Drift in prompt content OUTSIDE the role-guidance entries (e.g., engine §8 prose) — those are caught by the file-level greps in section 21

## Special Attention Areas

1. **GENERAL Category Bloat**: 13 templates in GENERAL — many likely belong in ANALYSIS, AUTOMATION, or domain-specific categories. Prime rationalization target.
2. **Role Guidance Gaps**: 3 template roles (`mcp_service_discovery_specialist`, `mcp_service_registrar`, `strategic_technical_advisor`) have no ROLE_GUIDANCE_LIBRARY entry — agents get generic fallback only.
3. **Empty Categories**: MCP_SERVICE_INTEGRATION and MCP_SERVICE_QA have enum values but zero templates — confirm if dead or planned.
4. **Handlebars Template Processing**: Variable substitution secured via `applyTemplateSafe()` in `lib/security/prompt-injection-prevention.ts` (809 lines). Verify all substitution points use it.
5. **Token Limits**: Prompt template size vs model token limits could cause execution failures.
6. **metadata.agentConfig Legacy**: Nearly eliminated (2 files remain with WARN logging). New code must use root-level fields.
7. **Gold Standard Compliance**: When reviewing templates, apply all 8 standards from Pattern #44. GS1 (naming) and GS8 (differentiation) catch the most issues.
8. **Performance Optimization**: `PerformanceOptimizationService` exists in builder — use for token optimization, prompt compression.
9. **Seed Script Safety**: Must use upsert pattern (GS7). Never `deleteMany`. Separate seed scripts for MCP/KPI templates must not be wiped.

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: Template System Discovery
════════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Core Template Patterns
□ Section 2: Service and Import Discovery
□ Section 3: Type System Analysis
□ Section 4: Data Transformation Patterns
□ Section 5: Component Architecture
□ Section 6: API Routes and Database
□ Section 7: Template Builder Discovery
□ Section 8: Prompt Library Integration
□ Section 9: Template-Task Relationships
□ Section 10-16: Additional Analyses

Current Status: 🚀 Starting Discovery
Commands: 0/91 executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Core Template Patterns [██████████] 100%
   Commands: 10/10 | Found: 47 template files, 3 services
🔄 Section 2: Service Discovery [███░░░░░░░] 30%
   Commands: 4/12 | Analyzing service methods...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** 47/47 template files ✅
⚠️ **Critical Issues:** 3 refactoring blockers
🔍 **Areas Investigated:** 
   - ✅ Template data architecture mapped
   - ✅ Frontend components cataloged
   - ⚠️ metadata.agentConfig migration needed
   - ❌ Template versioning missing

## Context for Specialist:
- Key Finding: metadata.agentConfig used in 32 components
- Risk Area: Data transformation happens in 5 different places
- Focus Needed: Coordinate refactoring across all touchpoints

Delegating to: template-specialist
Reason: Deep template architecture expertise required
Priority: Complete metadata.agentConfig migration plan

--- ACTIVATING TEMPLATE-SPECIALIST ---
```

### Specialist Reception Template
```markdown
--- TEMPLATE-SPECIALIST ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** 47/47 template files ✅
⚠️ **Issues:** 3 refactoring blockers acknowledged
🔍 **Focus Areas:** metadata.agentConfig migration priority

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Analyzing data transformations...
[████░░░░░░] 40% → Mapping component dependencies...
[██████████] 100% → Migration plan complete ✅

## Specialist Findings:
1. Safe migration path: UI → Service → DB
2. 32 components need coordinated updates
3. Rollback strategy: Feature flag approach
```

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact |
|------|----------|------------|---------|
| Metadata.agentConfig refactor breaking UI | Critical | High | All template editors fail |
| MCP tool configuration migration | High | Medium | Agent tools unavailable |
| Template versioning conflicts | Medium | Low | Data inconsistency |
| Prompt template validation bypass | High | Low | Security vulnerability |
| Category enum changes | Low | Medium | UI filtering breaks |
| Handlebars injection | Critical | Medium | Arbitrary code execution |
| Token limit exceeded | Medium | High | Agent execution failures |
| Concurrent edit conflicts | Medium | Medium | Data loss/corruption |
| Permission escalation via capabilities | High | Low | Unauthorized access |
| Template marketplace security | High | Medium | Malicious templates spread |

## Expected Outputs

### 1. Architecture Diagram
```
Template System Architecture
├── Frontend Layer
│   ├── Template Editor System
│   │   ├── TemplateEditor.tsx (orchestrator)
│   │   ├── TemplateEditorProvider (context)
│   │   └── Editor Tabs
│   │       ├── AgentConfigTab (basic config)
│   │       ├── PromptTemplateTab (prompt editor)
│   │       └── MCPToolsTab (tool selection)
│   ├── Template Management
│   │   ├── AgentTemplatesTab (list view)
│   │   ├── AgentTemplateCard (display)
│   │   └── AgentTemplateSelector (dropdown)
│   └── Shared Components
│       ├── MCPToolsSelector
│       └── PromptLibrary
├── API Layer
│   ├── CRUD Operations
│   │   ├── GET /api/agent-templates
│   │   ├── POST /api/agent-templates
│   │   ├── PUT /api/agent-templates/[id]
│   │   └── DELETE /api/agent-templates/[id]
│   ├── Specialized Endpoints
│   │   ├── /api/agent-templates/builder
│   │   └── /api/agent-templates/prompt-library
│   └── MCP Integration
│       └── /api/mcp/tasks/action (agent.configure)
├── Service Layer
│   ├── AgentTemplateService (CRUD + validation)
│   ├── AgentTemplateBuilder (specialized creation)
│   ├── AgentExecutionEngine (template application)
│   └── PromptLibrary (suggestions)
├── Database Layer (PostgreSQL + Prisma)
│   ├── AgentTemplate Model
│   │   ├── Typed Fields (name, role, category)
│   │   ├── JSON Fields (capabilities, constraints)
│   │   └── Metadata (modelParams, mcpTools)
│   └── Relationships
│       ├── Tasks (via agentTemplateId)
│       └── POVs (via defaultAgentTemplateId)
```

### 2. Data Flow Map
```markdown
## Creation Flow
1. UI Form Input → TemplateEditorProvider state
2. Form validation → Transform to API format
3. POST /api/agent-templates → AgentTemplateService.create()
4. Prisma create → Database storage
5. Return created template → UI update

## Application Flow
1. Task selection → agent.configure action
2. Load template → `lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts` (the live path; the old `AgentTaskService.configureAgentForTask` was deleted 2026-06-08 as dead code)
3. Apply to task → Update task.agentTemplateId
4. Execute → AgentExecutionEngine.executeTaskWithAgent()
```

### 3. Template Categories Analysis
- Available categories from AgentCategory enum
- Category usage distribution across templates
- Category-specific validation rules
- Default templates per category

### 4. MCP Tool Configuration Analysis
```markdown
## Storage Location
- Templates: metadata.mcpToolConfiguration.selectedTools
- Tasks: task.mcpContext (after application)

## Tool Selection Flow
1. MCPToolsTab → MCPToolsSelector component
2. Fetch tools from /api/mcp/tools
3. User selects tools → Update selectedTools array
4. Save to metadata.mcpToolConfiguration

## Integration Points
- Static tools auto-registered on startup
- No connection required for tool availability
- Unified registry access
```

### 5. Template Builder Analysis
- Builder service capabilities and patterns
- Default template generation logic
- Template suggestions based on category
- Integration with prompt library

### 6. Prompt Library Integration
- Library API endpoints and data structure
- Suggestion mechanisms based on category
- Template variable system ({{role}}, {{capabilities}})
- Handlebars processing locations

### 7. Performance Metrics
```markdown
## Template Metrics
- Average template size: [bytes]
- Token usage patterns: [avg, min, max]
- Execution timeouts: [distribution]
- Retry configurations: [success rates]
- Template usage frequency: [by category]
```

### 8. Security Assessment
- Prompt injection vulnerabilities
- Capability restriction mechanisms
- Tool access control implementation
- Template validation layers
- Permission escalation risks

## Key Questions to Answer

### Architecture Questions
1. How are templates applied to tasks via agent.configure?
2. What validation exists at each layer (UI, API, Service, DB)?
3. How do MCP tools integrate with templates and execution?
4. How does template selection work in POV editor?
5. What caching exists for template performance?

### Rationalization Questions (Gold Standard — NEW)
6. Which of the 13 GENERAL templates should be recategorized?
7. Which template roles lack ROLE_GUIDANCE_LIBRARY entries? (currently 3)
8. Are there templates with overlapping scope in the same category?
9. Do MCP templates include pre-flight checks (GS5)?
10. Do templates carry the Deliverable Contract — finalResponse-as-deliverable-channel + comments-as-coordination — in their Output Rules (GS6, 2026-04-26)? Any template still framing the 2000-char comment-limit as the delivery cap is non-conformant.
11. Should MCP_SERVICE_INTEGRATION and MCP_SERVICE_QA enums be removed or populated?
12. Can the 36 templates be reduced through consolidation (GS8)?

### Legacy Questions (mostly resolved)
13. Where does legacy metadata.agentConfig transformation happen? (2 files remain with WARN logging)
14. Where is Handlebars template processing done? (secured via applyTemplateSafe)

## Output Format

```markdown
# Template System Discovery Report

## Summary
- Total template files: X
- Frontend components: X  
- API routes: X
- Services: X
- Types/Interfaces: X
- MCP integration points: X
- Risk areas identified: X

## Detailed Findings

### Frontend Components
#### Template Editor System
##### /components/poveditor/template/TemplateEditor.tsx
- **Purpose**: Main orchestrator for template editing
- **Data Access**: Manages overall template state
- **Key Features**: Tab navigation, save/load operations
- **Refactor Impact**: High - Central component

##### /components/poveditor/template/context/TemplateEditorProvider.tsx
- **Purpose**: Context provider for template state
- **State Management**: Formik integration
- **Data Transformations**: [specific transformations]
- **Refactor Impact**: Critical - All editors depend on this

[Continue for all components...]

### API Routes
#### CRUD Operations
##### POST /api/agent-templates
- **Purpose**: Create new template
- **Request Schema**: [TypeScript interface]
- **Validation**: [List validations]
- **Response**: Created template with ID

##### PUT /api/agent-templates/[templateId]
- **Purpose**: Update existing template
- **Partial Updates**: Supported fields
- **Validation**: [Update-specific validations]

[Continue for all routes...]

### Service Layer
#### AgentTemplateService
- **Location**: /lib/services/agentTemplateService.ts
- **Key Methods**:
  - createTemplate(): Validation + DB insert
  - updateTemplate(): Partial update support
  - findTemplateById(): Include relations
  - searchTemplates(): Category/tag filtering
- **Data Transformations**: [List transformations]
- **Performance**: Query optimizations

[Continue for all services...]

### Template Categories Analysis
```
GENERAL: X templates (Y%)
DEVELOPMENT: X templates (Y%)
TESTING: X templates (Y%)
[... all categories]

Most used: [category]
Least used: [category]
```

### MCP Tool Integration
#### Configuration Storage
- Template level: metadata.mcpToolConfiguration
- Selected tools array: string[]
- Tool configurations: Record<string, any>

#### Tool Discovery Flow
1. MCPToolsTab renders
2. Fetches from /api/mcp/tools
3. Shows available tools by server
4. Updates selectedTools on change
5. Saves to metadata

### Data Flow Analysis
#### Template Creation
1. User fills form → Formik state
2. Validation → Transform for API
3. POST request → Service layer
4. Prisma create → PostgreSQL
5. Return → Update UI

#### Template Application (agent.configure)
1. Select template → Get templateId
2. POST /api/mcp/tasks/action
3. Load template → Extract config
4. Apply to task → Update task record
5. Ready for execution

### Security Vulnerabilities
1. **Prompt Injection**: [Details and locations]
2. **Capability Escalation**: [How it could happen]
3. **Token Overflow**: [Risk areas]
4. **Handlebars Injection**: [Template processing]

### Performance Bottlenecks
1. **Large Templates**: No pagination
2. **Token Counting**: Missing implementation
3. **Template Search**: No indexing
4. **Category Filtering**: Full table scan

### Technical Debt
1. **No Versioning**: Templates overwritten
2. **No Inheritance**: Code duplication
3. **Missing Validation**: [Specific areas]
4. **Hard-coded Defaults**: [Locations]

## Recommendations

### Immediate Actions (Critical)
1. Add template size validation
2. Implement token counting
3. Add security validation layer
4. Fix concurrent edit handling

### Short-term Improvements (1-2 weeks)
1. Add template versioning
2. Implement caching layer
3. Add performance monitoring
4. Create template inheritance

### Long-term Enhancements (1-2 months)
1. Template marketplace
2. Advanced permissions system
3. Template analytics dashboard
4. AI-powered optimization

## Test Scenarios
1. Create template > 8K tokens
2. Concurrent template editing
3. Invalid Handlebars syntax
4. MCP tool permission bypass
5. Category enum changes
```

## Deliverables

1. Complete template component inventory with UI hierarchy and data flow
2. Template data transformation map from UI through API to database
3. MCP tool configuration patterns, storage, and integration points
4. Template validation rules catalog at UI, API, service, and DB layers
5. Template-to-task application mechanisms via agent.configure
6. Model parameter configuration analysis and provider support
7. Template category usage patterns and distribution metrics
8. Security vulnerability assessment with severity ratings
9. Performance optimization opportunities with benchmarks
10. Migration plan for metadata.agentConfig refactor with rollback strategy
11. Template versioning implementation strategy and design
12. Default template mechanisms, seeding patterns, and updates

## Success Criteria

- All template components mapped with complete data access patterns documented
- Data transformation points identified with before/after schemas
- MCP tool integration fully understood with execution flow mapped
- Template validation rules cataloged at all layers with gap analysis
- Performance bottlenecks identified with quantitative metrics
- Security risks assessed with CVSS scores and mitigation plans
- Refactoring impact analysis completed with LOE estimates
- Test coverage gaps identified with specific test scenarios
- Migration strategy documented with step-by-step rollback plan
- Template usage analytics captured with frequency metrics
- Handlebars processing locations identified with security analysis
- Caching opportunities documented with performance impact

## Debugging Helpers

```bash
# Quick template system debug
echo "=== Template Debug Info ==="
echo "Latest modified template component: $(find components -name "*[Tt]emplate*" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
echo "Total template DB records: $(grep -A 20 "model AgentTemplate" prisma/schema.prisma | grep -c "@" || echo 'Model not found')"
echo "MCP tool config references: $(grep -r "mcpToolConfiguration" --include="*.ts" --include="*.tsx" . 2>/dev/null | wc -l)"
echo "Metadata.agentConfig usage: $(grep -r "metadata\.agentConfig" --include="*.ts" --include="*.tsx" . 2>/dev/null | wc -l)"

# Find potential issues
echo -e "\n=== Potential Issues ==="
echo "TODOs in template code: $(grep -r "TODO.*template\|FIXME.*template" --include="*.ts" --include="*.tsx" . 2>/dev/null | wc -l)"
echo "Type 'any' in templates: $(grep -r "any.*template\|template.*any" --include="*.ts" . 2>/dev/null | grep -v "//\|node_modules" | wc -l)"
echo "Console.logs in production: $(grep -r "console\.log.*template" --include="*.ts" --include="*.tsx" . 2>/dev/null | wc -l)"

# Performance check
echo -e "\n=== Performance Indicators ==="
echo "Templates using Promise.all: $(grep -r "Promise\.all.*template" --include="*.ts" . 2>/dev/null | wc -l)"
echo "Templates with pagination: $(grep -r "limit.*offset.*template\|skip.*take.*template" --include="*.ts" . 2>/dev/null | wc -l)"
echo "Cached template refs: $(grep -r "cache.*template\|templateCache" --include="*.ts" . 2>/dev/null | wc -l)"

# ⭐ Variable Security Audit (Nov 2025)
echo -e "\n=== VARIABLE SECURITY ANALYSIS ==="
echo "applyTemplateSafe usage: $(grep -r "applyTemplateSafe" lib app --include="*.ts" --include="*.js" | wc -l)"
echo "Unsafe variable substitution: $(grep -r "\.replace.*{{.*}}" lib app --include="*.js" | wc -l)"
echo "Security layer location:"
ls -la lib/security/prompt-injection-prevention.ts 2>/dev/null || echo "  ⚠️  Security layer not found"

# Find all variable substitution patterns
echo "Variable substitution patterns:"
grep -rn "{{.*}}\|promptText.*replace\|content.*replace" lib/mcp lib/services --include="*.js" | \
  cut -d: -f1 | sort -u

# Check which use secure vs unsafe substitution
echo "Secure (applyTemplateSafe):"
grep -l "applyTemplateSafe" lib/services/agentTemplateService.ts lib/mcp/server/prompts/prompt-registry.js 2>/dev/null
echo "Unsafe (direct replace):"
grep -l "\.replace.*{{" lib/**/*.js 2>/dev/null | grep -v "applyTemplateSafe"
```

---

## Agent Config & Normalizer Investigation (Apr 2026)

Added Apr 2026 after field leakage bug (`agentTemplateId` missing from normalizer.ts). Use these commands to verify new fields are properly propagated through the full pipeline: Prisma select → API response → normalizer.ts → React state → GUI display.

```bash
# CRITICAL: Which normalizer is ACTUALLY used by the provider?
grep -rn "normalizeApiData" components/poveditor/pov/context/PovEditorProvider.tsx

# Normalizer field coverage — verify all task fields in normalizer.ts match Prisma schema
grep -n "task\." components/poveditor/pov/context/utils/normalizer.ts | head -40

# Dead code detection — functions in PovEditorContext.tsx that are NOT exported
grep -n "^function\|^async function" components/poveditor/pov/context/PovEditorContext.tsx

# Verify agentTemplateId is in normalizer (was missing before Apr 2026)
grep -n "agentTemplateId" components/poveditor/pov/context/utils/normalizer.ts

# Role guidance library entries — what roles have specific guidance?
grep -n "'[a-z_]*':" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts | head -10

# Seed script safety — check for upsert vs destructive patterns
grep -B2 -A5 "deleteMany\|findFirst\|LEGACY_NAME" scripts/seed-*.ts | head -40

# Config score calculation — what gives points?
grep -n "score += \|hasSystemPrompt\|hasTemplate\|hasAgentPrompt\|hasModelParameters" app/api/mcp/tasks/context/route.ts

# Template model params — how are they resolved at execution time?
grep -n "config\.model\|config\.temperature\|userLLMSettings" lib/services/agentExecutionEngine.ts | head -10
```

## Prompt-claim validation (added 2026-07-25)

```bash
# Mechanical claim check — quoted error messages, error codes, and MCP action names in every
# agent-facing prompt must exist in the codebase. Fails the build for agent-EXECUTED prompts.
npm run validate:prompt-claims
```

**Expect**: `✅ Every checkable prompt claim is backed by the codebase.` — a non-zero exit IS a
finding (Protocol 11 Part C: prove-before-write). Warnings on human-facing guides are visible but
non-blocking.

**Then judge what the tool cannot**: semantic claims ("returns within 30s", "#195 is open", "this
field is always set") are not mechanically decidable. Spot-check several against the tree — that
judgement is the reason this discovery is run by a specialist and not just by CI.

## Template freshness (added 2026-08-04)

```bash
npm run report:template-freshness            # expect 0 STALE, 0 UNVERIFIABLE
npm run report:template-freshness -- --verbose
```
`agent_templates` rows are seeded MANUALLY — the deploy does not re-seed them, deliberately, to protect GUI
template edits. So a library fix can sit undelivered indefinitely with nothing measuring the gap.
**NOT COMPARABLE means unmeasured, NOT clean.** Baseline 2026-08-04 (prod and local identical): 0 STALE ·
0 UNVERIFIABLE · 3 NOT COMPARABLE · 32 CURRENT. Deliver a fix with a targeted, refusing reseed
(run the OWNING seed script(s); `grep -rln "defaultRole: '<role>'" scripts/seed-*.ts` names them) — never the generic seed-agent-templates.ts for a domain role.

## 🆕 2026-08-17 — WS1 Phase C loadProtocols round-trip tripwires

```bash
grep -c "loadProtocols" lib/pov/api/agent-templates-adapter.ts               # expect 15 — raw round-trip everywhere
grep -c "loadProtocols: template.metadata?.loadProtocols === true" lib/pov/api/agent-templates-adapter.ts  # expect 0 — the coercion form is retired (a reappearance is the 'composed'-wipe bug)
grep -c "flip-harness-protocol-mode" .github/workflows/production-deploy.yml # expect 1 — the gate's error text names the sanctioned flip path
```
