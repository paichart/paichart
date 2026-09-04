# TODO: Pipeline Templates (Reusable Pipeline Definitions)

**Status**: Planned — recommended next implementation
**Phase**: 4
**Created**: 2026-04-05
**Estimated Effort**: Medium (2-3 sessions)
**Dependencies**: Phase 2 (ORCHESTRATE mode) — DONE

---

## Introduction

Today, every pipeline is built from scratch. Either the harness decomposes an objective (CREATE mode) or a human manually creates tasks and the harness orchestrates them (ORCHESTRATE mode). Both require design effort each time.

Pipeline Templates turn common assessment patterns into reusable, one-click deployable pipeline definitions. A "Security Posture Assessment" template contains 4 pre-configured tasks with types, descriptions, dependency hints, and template assignments. Apply it to a stage in any POV — tasks appear, add a PIPELINE task — it runs.

This is the equivalent of CrewAI's reusable crew definitions, but as a product feature accessible to non-developers via MCP.

## Objective

Create a system where:
1. Common pipeline patterns are saved as named templates
2. A user applies a template to a stage → tasks are created with types, descriptions, and dependency hints
3. A PIPELINE task is optionally auto-created in the same stage
4. The harness (ORCHESTRATE mode) runs the pre-configured pipeline
5. Templates are shareable across POVs and users

**End state**: `perform(action: "stage.applyTemplate", stageId: "...", templateName: "Security Posture Assessment")` → 4 tasks + 1 PIPELINE task created → harness auto-orchestrates.

## Example Pipeline Templates

### Security Posture Assessment (4 tasks)
```
1. ARCHITECT (Solution Architect): Design security assessment framework
   → Evaluate current controls, identify assessment scope, define evaluation criteria
   Dependencies: none

2. REVIEWER (Security Analyst): Execute security audit against framework
   → Audit against [COMPLIANCE_FRAMEWORKS] controls, test for gaps, produce findings
   Dependencies: [Task 1]

3. ANALYST (Business Analyst): Quantify risk exposure and remediation ROI
   → Using audit findings, calculate financial exposure, model remediation costs, produce business case
   Dependencies: [Task 1, Task 2]

4. DOCUMENTER (Technical Writer): Produce executive security summary
   → Synthesize architecture, audit, and risk analysis into CTO-ready briefing
   Dependencies: [Task 1, Task 2, Task 3]
```

### Cloud Migration Readiness (5 tasks)
```
1. ARCHITECT: Assess current infrastructure landscape
2. REVIEWER: Audit security and compliance gaps
3. ANALYST (parallel with 2): Evaluate operational maturity
4. ARCHITECT: Design migration strategy (depends on 1, 2, 3)
5. DOCUMENTER: Produce executive recommendation (depends on all)
```

### Technical Architecture Review (3 tasks)
```
1. ARCHITECT: Evaluate current architecture and constraints
2. REVIEWER: Validate against best practices and standards
3. ARCHITECT: Produce architecture decision record with recommendations (depends on 1, 2)
```

### Go-to-Market Assessment (4 tasks)
```
1. ANALYST (Data Analyst): Market analysis and sizing
2. ANALYST (Marketing Strategist): Competitive positioning (parallel with 1)
3. ANALYST (Business Analyst): Business case with ROI (depends on 1, 2)
4. DOCUMENTER: Executive presentation (depends on all)
```

## Design Questions

### Where do pipeline templates live?

**Option A: Database model (PipelineTemplate)**
- New Prisma model with name, description, tasks (JSON), metadata
- Queryable, versionable, user-owned
- Requires migration + CRUD endpoints
- Most flexible, most effort

**Option B: Seed scripts (like agent templates)**
- JSON/TypeScript definitions in `scripts/seed-pipeline-templates.ts`
- Seeded to DB on deploy, admin-managed
- Simpler, follows existing pattern (how agent templates work)
- Less flexible for user-created templates

**Option C: JSON in agent template metadata**
- Store pipeline definitions as metadata on a special "template" agent template
- No new model needed
- Hacky but fast

**Recommendation**: Option B for v1 (seed scripts — matches how agent templates work). Migrate to Option A when users need to create their own templates.

### How does the user apply a template?

**Option A: New MCP action `stage.applyTemplate`**
```
perform(action: "stage.applyTemplate", stageId: "...",
  templateName: "Security Posture Assessment",
  povId: "...",
  variables: { COMPLIANCE_FRAMEWORKS: "APRA CPS 234, ASD Essential Eight" })
```
- Clean, explicit, discoverable
- Requires new handler

**Option B: Extend `stage.create` with optional template**
```
perform(action: "stage.create", parameters: {
  povId: "...", phaseId: "...", name: "Security Assessment",
  pipelineTemplate: "Security Posture Assessment"
})
```
- One action creates stage + populates tasks
- More magical, less explicit

**Recommendation**: Option A — separate action is clearer and doesn't overload stage.create.

### Does applying a template auto-create the PIPELINE task?

**Option A: Yes** — template application creates all work tasks + one PIPELINE task (with autoExecute flag if desired)
**Option B: No** — template creates work tasks only, user adds PIPELINE task manually

**Recommendation**: Option A with a flag. Default: create PIPELINE task. Flag `includePipelineTask: false` to skip.

### Template variables

Templates should support variable substitution for customer-specific context:
- `{COMPLIANCE_FRAMEWORKS}` → "APRA CPS 234, ASD Essential Eight"
- `{CUSTOMER_NAME}` → "Pipeline Test Corp"
- `{INDUSTRY}` → "Financial Services"
- `{REGION}` → "Australia"

These could be auto-populated from POV metadata (customer name, country → region → compliance frameworks).

## Implementation Procedure

### Step 1: Define Pipeline Template Schema
```typescript
interface PipelineTemplate {
  name: string;
  description: string;
  version: string;
  tasks: Array<{
    title: string;          // supports {VARIABLE} substitution
    description: string;    // supports {VARIABLE} substitution
    templateType: TemplateType;
    agentTemplateName: string;
    dependsOn: number[];    // indices of tasks this depends on (0-based)
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  variables?: Array<{
    name: string;
    description: string;
    source?: 'pov.customerName' | 'pov.country' | 'manual';
    default?: string;
  }>;
  metadata?: {
    estimatedDuration?: string;  // "8-10 minutes"
    tokenEstimate?: number;      // ~500K tokens
    includePipelineTask?: boolean; // default true
    autoExecute?: boolean;        // default false (Phase 3 integration)
  };
}
```

### Step 2: Create Seed Script
- `scripts/seed-pipeline-templates.ts`
- Seed 4 initial templates (Security, Migration, Architecture, Go-to-Market)
- Store in a new `PipelineTemplate` model or as JSON in a config table

### Step 3: Create `stage.applyTemplate` MCP Action
- New handler: `lib/mcp/tasks/action/handlers/stage/stage-apply-template-handler.ts`
- Loads template by name
- Resolves variables from POV metadata + explicit overrides
- Creates tasks in the target stage with dependency wiring
- Optionally creates PIPELINE task

### Step 4: Add Validation Schema
- `lib/validation/mcp-action-validation.ts` — add `stage.applyTemplate` schema
- Validate: stageId required, templateName required, variables optional

### Step 5: Add to MCP Tool Registration
- Register `stage.applyTemplate` in the perform action enum
- Add to tool descriptions

### Step 6: Test
- Apply "Security Posture Assessment" to a stage
- Verify: 4 tasks created with correct types, descriptions, dependencies
- Verify: PIPELINE task created with correct template assignment
- Execute: harness orchestrates the pre-configured pipeline
- Measure: compare time-to-first-result vs manual setup

### Step 7: Update User Guide
- Add Option E: "Apply Pipeline Template" to the harness guide
- Document available templates with descriptions
- Document variable substitution

## Related Context

- **Agent templates**: `scripts/seed-harness-template.ts` — follows the same seed script pattern
- **Orchestrate mode**: Pipeline templates feed directly into orchestrate mode — tasks are pre-configured, harness reads and executes
- **POV metadata**: Customer name, country, objective are already in POV — can auto-populate template variables
- **Template system**: `lib/services/agentTemplateService.ts` — existing template management (for agent templates, not pipeline templates)
- **Positioning doc**: Pipeline templates are mentioned as a key differentiator vs CrewAI (product feature vs Python code)

## Success Criteria

- [ ] At least 4 pipeline templates seeded (Security, Migration, Architecture, Go-to-Market)
- [ ] `stage.applyTemplate` MCP action working
- [ ] Variable substitution from POV metadata working
- [ ] PIPELINE task auto-created with template assignment
- [ ] Harness orchestrate mode executes the pre-configured pipeline
- [ ] Time from "apply template" to "pipeline executing" < 30 seconds
- [ ] User guide updated with template documentation

## Future Extensions (Not in Scope for Phase 4)

- User-created pipeline templates via GUI
- Template marketplace (share across organizations)
- Template versioning and migration
- Template analytics (which templates produce highest confidence)
- Template recommendation based on POV objective
