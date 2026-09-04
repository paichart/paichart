# Agent Template Gold Standard Pattern

**Type**: Excellence Pattern (builds on seed-agent-templates.ts baseline)
**Confidence**: 95% (production-validated Apr 2026)
**Status**: Complete - derived from MCP Service Orchestrator + Workflow Orchestrator builds
**Created**: April 2, 2026
**Pattern #**: 44

---

## Overview

This pattern captures **best-of-breed practices** for creating and maintaining agent templates. Each gold standard was identified from real template creation sessions, naming failures, and prompt effectiveness testing against live MCP services.

**8 Gold Standards**:
1. Naming Convention (A+) - Clear, non-overlapping names
2. Role Guidance (A) - Actionable rules, not motivational prose; Deliverable/Coordination subsections
3. Prompt Template (A) - Complete workflow, not just capabilities
4. Category Alignment (A-) - Category matches purpose, not history
5. Pre-flight Checks (A) - Schema/health verification before action
6. Output Rules (A) - **Deliverable Contract**: `finalResponse` is the delivery channel; comments are coordination only
7. Seed Script (A) - Idempotent with migration support
8. Template Differentiation (A) - Clear swim lanes, no overlap

**Use this pattern to**:
1. Create new agent templates at gold standard level
2. Review existing templates for gaps
3. Rename or consolidate overlapping templates
4. Decide between creating a new template vs extending an existing one

---

## Template Classification: The 3 Axes (Apr 2026)

Every template is classified along three **independent, orthogonal** axes that answer different questions and are read by different consumers. Understanding this model prevents misassignment and keeps the template registry coherent as it grows.

| Axis | Question it answers | Who reads it at runtime | Example |
|------|---------------------|--------------------------|---------|
| `role` / `agentRole` | What persona does the agent claim? | The LLM itself (via `${agentRole}` interpolation in system prompt) | `qa_test_engineer` |
| `templateType` | What kind of work does this template do? | GUI/template surfaces + harness decomposition semantics (the P9 verb-stem scope matcher was RETIRED 2026-07-17 — ~60 firings, 0 true positives) | `REVIEWER` |
| `category` | What domain is this template for? | Recommendations engine (`/api/agent-templates/recommendations`), API filter params, template compatibility warnings | `TESTING` |

### The axes are orthogonal — templates intersect, don't duplicate

Two templates can share one axis while differing on another:

| Template | templateType | category | note |
|---|---|---|---|
| QA Test Engineer | REVIEWER | TESTING | |
| Security Analyst | REVIEWER | SECURITY | *same type, different domain* |
| Solution Architect | ARCHITECT | DEVELOPMENT | |
| Senior Software Developer | BUILDER | DEVELOPMENT | *different type, same domain* |

Both REVIEWERs — QA tests quality; Security audits threats. Both DEVELOPMENT — Architects design; Builders write code. Each axis serves a different purpose.

### Load-bearing vs cosmetic

- **`templateType` is load-bearing** for P9 harness task-to-template routing. Wrong templateType = wrong-scope warnings at runtime. Must be set correctly for harness-created children.
- **`category` is soft-runtime** — used by recommendations, API filters, ChatGPT connector display. Not directly consumed by the execution engine. Missing or wrong category degrades discoverability but doesn't break execution.
- **`role` drives prompt interpolation** — appears verbatim in the system prompt's opening line ("You are a ${agentRole}..."). Affects LLM identity framing.

### Related cross-axis fields

- **`defaultRole`** is the template's provisioning-time role key (e.g., `'qa_test_engineer'`) used by the seed script when baking role guidance. At runtime, the execution config's `agentRole` can override `defaultRole` per-execution.
- **`metadata.protocol`** is a 4th optional classification (child-side protocol binding). See Pattern #45 §4a.
- **`metadata.loadProtocols`** marks orchestrator templates (currently only Pipeline Harness): `'composed'` (since 2026-08-17) composes the orchestration base + the task's ONE stamped protocol — the platform, not the model, chooses; legacy `true` loaded ALL protocols for a runtime model-side choice (kept as the rollback value). ⚠️ GUI round-trips must preserve the RAW value (a `=== true` coercion silently wipes `'composed'` — see buildMetadata, agent-templates-adapter.ts).

### ⚠️ The `role` guidance is baked at SEED time — the most-missed, silently-degrading step

The `role` axis drives **two** things, and the second is the trap:
1. **Runtime** — the literal role string interpolates into the system-prompt opening (`${agentRole}` → "You are a qa_test_engineer…"). This is the "read at runtime" entry in the table above.
2. **Seed time** — the role's `ROLE_GUIDANCE_LIBRARY` entry (the 7–10 GS2 bullets) is **baked into `promptTemplate`** by the seed: `BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance(role))`. That frozen prompt is what the agent actually runs — the runtime path that would re-read the library was deleted (commit `4077c049`). So "`ROLE_GUIDANCE_LIBRARY` is dead at runtime" is true but **misleading: it means *baked*, not *unimportant*.**

**Why this bites:** `getRoleSpecificGuidance(role)` returns a thin GENERIC fallback for any role NOT in the library — **silently, no error**. A new `defaultRole` with no entry bakes weak guidance into a quietly-degraded agent. And because the entry lives in a *different file* (`pAIchartUniversalTemplate.ts`) than the seed, the common "mirror an existing seed file" authoring move **structurally skips it**. (Exactly what nearly shipped in the 2026-06-16 network-provisioning spike — 4 templates authored, the role step missed until an explicit re-ask.)

**Consequences for authors:**
- A `ROLE_GUIDANCE_LIBRARY` entry for every new `defaultRole` is **required** (GS2), not optional polish.
- **Changing a role entry requires RE-SEEDING** the affected templates — the live row holds the old bake until then.
- **CI enforces it**: `validate:role-guidance-coverage` (pre-commit + `test:all-validation`) fails if a seeded role has neither an entry nor a documented `INTENTIONALLY_GENERIC_ROLES` exemption; `validate:role-guidance` enforces entry *shape*.
- Chain-consumer roles (a specialist reading a predecessor's output) must also carry the chained-context discipline in their entry — read §6 Pipeline Context, never `agent.results(verbose:true)` on a predecessor (the 50KB-truncation / 28.6% failure mode).

**Full procedure:** `.claude/knowledge/pipelines/ADD-A-PIPELINE-HARNESS-AGENT.md`.

---

## Template Ownership Model (Apr 2026)

**Source of truth for templates is the GUI (Agent Builder at `/agents`), not the `.ts` files.** Seed scripts are provisioning-only.

### Lifecycle

1. **Provisioning**: Seed scripts run ONCE to create initial templates. They set ALL fields — `promptTemplate`, `category`, `templateType`, `capabilities`, `constraints`, `tags`, `defaultRole`, `version`, model parameters, `metadata.protocol` where applicable.
2. **Ongoing edits**: Done via Agent Builder. Edits write directly to the DB through `AgentTemplateService.updateTemplate()`. No seed script involvement.
3. **Seed scripts are provisioning-only**: Do NOT re-run seed scripts against a DB with GUI-edited templates. The seed script's upsert pattern (`findFirst + update`) overwrites ALL fields including `promptTemplate`, silently destroying user edits. No `isUserModified` guard exists (as of Apr 2026); protection is convention-based.

### Agent Builder field coverage (as of Apr 2026)

| Editable via GUI | NOT editable via GUI (seed-script or psql only) |
|------------------|--------------------------------------------------|
| `role` (agentRole) | `capabilities` (JSON object) |
| `prompt` (promptTemplate — the full system prompt) | `constraints` (JSON object) |
| `description` | `tags` (string array) |
| `templateType` | `defaultRole` |
| `category` | `version` |
| `metadata.protocol` (child-side protocol dropdown) | `priority` |
| `modelParameters.provider`, `.model`, `.temperature`, `.maxTokens`, `.stopSequences`, `.webSearch`, `.cacheControl`, `.thinkingBudgetTokens` | `maxRetries`, `timeout`, `inputSchema`, `outputSchema`, `contextTemplate` |

The unexposed fields are mostly display/advisory metadata with sensible defaults. Adding them to the form is straightforward (simple types, schema already accepts) — not yet wired because current usage doesn't require it.

### ROLE_GUIDANCE_LIBRARY at runtime

`ROLE_GUIDANCE_LIBRARY` in `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` is **provisioning-only** infrastructure at runtime. Verified 2026-04-16: 0 of 128 recent executions used the Universal Template fallback path (`buildSystemPrompt()` Priority 3) that would consult the library at runtime. Every production execution uses a named template with baked role guidance.

Planned null-template execution guard (see `cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md` §6) will formally close the Universal Template fallback bypass.

### Split-source anti-pattern (see GS2)

Most templates use `ROLE_GUIDANCE_LIBRARY`; one (Pipeline Harness) uses a local `ROLE_GUIDANCE` constant in its seed script because its entire `PROMPT_TEMPLATE` is custom. Both paths are valid — but never maintain a library entry AND a local constant for the same role key. See GS2 §"Split-source Role Guidance."

---

## Gold Standard 1: Naming Convention (A+ Standard)

**Source**: MCP Service Orchestrator rename (Apr 2026)
**Apply to**: All template names

### What Makes It Gold Standard

Template names must pass three tests:
1. **Describes the output, not the mechanism** — "Orchestrator" (coordinates calls) not "Tester" (validates responses)
2. **Non-overlapping** — any task can be assigned to exactly one template without ambiguity
3. **Forms a readable pipeline** — names within a domain should read as a natural progression

### Gold Standard Example

```
MCP Service Discovery     →  MCP Service Orchestrator    →  MCP Workflow Orchestrator
"Find the right service"     "Call it, reason on results"    "Chain 3 services declaratively"
```

### Anti-Pattern: Name Implies Wrong Purpose

```
BAD:  "MCP Service Integration Tester"
      → Used for production service calls, not just testing
      → LLM interprets "Tester" literally and produces PASS/FAIL reports
         when the task asks for analysis

GOOD: "MCP Service Orchestrator"
      → Covers single-call, multi-call, and synthesis tasks
      → No artificial scope constraint from the name
```

### Checklist

- [ ] Name describes the deliverable (analysis, orchestration, report) not the mechanism (testing, calling)
- [ ] Name doesn't overlap with another template in the same domain
- [ ] Template names within a domain form a readable pipeline
- [ ] Name doesn't accidentally constrain the agent's behaviour

---

## Gold Standard 2: Role Guidance (A Standard)

**Source**: ROLE_GUIDANCE_LIBRARY in pAIchartUniversalTemplate.ts
**Apply to**: Every role entry in the library

### What Makes It Gold Standard

Role guidance must be:
1. **Actionable instructions**, not motivational statements
2. **Tool-specific** — reference exact tool names and parameter patterns
3. **Anti-pattern aware** — call out the common mistakes for this role
4. **Concise** — 7-10 bullet points maximum

### Gold Standard Example

```typescript
'mcp_service_orchestrator': `
As an MCP Service Orchestrator:
- Always call registry(action: "tools") BEFORE calling a service — confirm parameter names
- Check services(action: "health") before each call — do not proceed against unhealthy endpoints
- Match argument keys exactly to the inputSchema (case-sensitive); wrong names cause silent failures
- You may call multiple services in sequence, reasoning on each result before the next call
- Synthesise insights across service responses; do not just report raw data
- If a call fails, inspect the error message before retrying — common causes: wrong arg name, missing field

**Deliverable**: write the synthesis (results table + synthesis paragraph for multi-service, concise paragraph for single-service) as your final assistant response — this becomes report.md / result.json.finalResponse.
**Coordination**: use perform(action: "task.comment") ONLY for short status updates ("starting service calls...", error escalations). Never as the delivery channel.`
```

### Anti-Pattern: Motivational Prose

```
BAD:
'mcp_service_orchestrator': `
As an MCP Service Orchestrator:
- You are an expert at coordinating services
- Always strive for excellence
- Provide helpful and accurate results`

GOOD: (see example above — every line is a concrete instruction with tool names)
```

### Anti-Pattern: Split-source Role Guidance (added 2026-04-16, task #83)

A template's role guidance lives in ONE source of truth, not two. The split-source pattern — where some role guidance is in the `ROLE_GUIDANCE_LIBRARY` (interpolated via `${roleSpecificGuidance}`) AND some is hardcoded directly in the `promptTemplate` string — creates invisible divergence:

- Reviewers reading `ROLE_GUIDANCE_LIBRARY` miss the hardcoded half and over-estimate GS2 conformance
- Refreshing one source doesn't propagate to the other
- Audits under-count templates needing GS2 rework (this exact mistake was caught and called out in the task #83 audit — artifact-synthesis templates scored partial-credit because the library had the high-quality content but templates didn't interpolate it)

**Pick ONE source per template**:
- **Library** (preferred): `ROLE_GUIDANCE_LIBRARY[roleKey]` holds the guidance; the template's `promptTemplate` ends with `${roleSpecificGuidance}` which the seed script interpolates via `getRoleSpecificGuidance(roleKey)`. Standard path for all legacy templates + MCP Service Orchestrator + MCP Workflow Orchestrator (they import and call `getRoleSpecificGuidance` from this library).
- **Hardcoded**: Role guidance lives inside the template's own seed script as a local `const`. Acceptable ONLY for custom-prompt templates whose `promptTemplate` is fundamentally different from the Universal base AND where no code path calls `getRoleSpecificGuidance(roleKey)` for this role (e.g., Pipeline Harness — its seed script uses a local `ROLE_GUIDANCE` constant and nothing queries the library for that role key).

**Do NOT keep a library entry you don't use.** If no seed script / runtime code calls `getRoleSpecificGuidance('your_role_key')`, don't leave a stale entry in `ROLE_GUIDANCE_LIBRARY`. It's dead code that drifts silently from the canonical hardcoded version and becomes a trap if anyone ever switches the template to interpolate from the library. Verified violation (removed 2026-04-16 task #83): Pipeline Harness had a library entry that contradicted the hardcoded `ROLE_GUIDANCE` in its seed script — "Monitor each execution" (library, stale) vs "EXIT after setup. Do NOT monitor" (hardcoded, current v3.0.0).

**Audit rule**: when scoring a template against GS2:
1. Find the seed script's `promptTemplate` or `PROMPT_TEMPLATE` constant
2. Check whether it contains `${roleSpecificGuidance}` and whether the script calls `getRoleSpecificGuidance(someKey)` to fill it
3. If YES — single source of truth is the library entry for `someKey`. Score GS2 from there.
4. If NO — single source of truth is the hardcoded role-guidance constant in the seed script. Score GS2 from there. Grep the library for `'someKey':` — if an entry exists, it's dead code and should be deleted.

### Checklist

- [ ] Every bullet is an actionable instruction (verb first)
- [ ] References specific tool names: `registry(action: "tools")`, `services(action: "call")`
- [ ] Calls out 2+ common mistakes with this role
- [ ] 7-10 bullets maximum (not 3, not 20)
- [ ] No motivational prose ("strive for excellence", "be thorough")
- [ ] ONE source of truth for role guidance (library OR hardcoded, not both diverging)

---

## Gold Standard 3: Prompt Template (A Standard)

**Source**: MCP Service Orchestrator prompt (Apr 2026)
**Apply to**: All custom prompt templates

### What Makes It Gold Standard

A gold standard prompt template has these sections in order:

1. **Platform Structure** — POV/Phase/Stage/Task context (standard boilerplate)
2. **Your Context** — `${contextualInformation}` injection point
3. **Deliverable Contract** — `finalResponse` is the deliverable channel; `task.comment` is coordination only (added 2026-04-26)
4. **Your Specialization** — 2-3 sentences defining the agent's job
5. **Tool Workflow** — numbered steps with exact tool call syntax
6. **Reference sections** — argument format, common pitfalls, mode tables
7. **Output Rules** — required format example, synthesis expectations (length is bounded by model context, not by `task.comment`)
8. **Role-Specific Guidance** — `${roleSpecificGuidance}` injection point with **Deliverable** + **Coordination** subsections

### Critical Section: Tool Workflow

The Tool Workflow is the most important section. It must:
- Show the **complete sequence** from discovery to reporting
- Include **exact tool call syntax** (not descriptions of what to do)
- Cover the **decision point** — what determines the next step

```markdown
## Tool Workflow

Follow this sequence for every service involved in the task:

1. **Inspect schemas** — call `registry(action: "tools", service_name: "...")`
2. **Health check** — call `services(action: "health", service_name: "...")`
3. **Execute** — call `services(action: "call", targetService: "...", tool: "...", arguments: {...})`
4. **Reason** — analyse the result; decide whether you need another service call
5. **Deliver** — write the synthesised result as your **final assistant response** (becomes `report.md` / `result.json.finalResponse`); use `perform(action: "task.comment")` ONLY for short status/coordination updates if needed
```

### Anti-Pattern: Capabilities Without Workflow

```
BAD:
"You can discover services, call services, and report results."
→ No sequence, no tool names, agent guesses the order

GOOD:
"1. Inspect schemas — call registry(action: 'tools')"
→ Exact step, exact tool, no ambiguity
```

### Checklist

- [ ] All 8 sections present in order (Platform → Context → **Deliverable Contract** → Specialization → Workflow → Reference → Output Rules → Role)
- [ ] Tool Workflow has 4+ numbered steps with exact tool call syntax
- [ ] At least one code block showing argument format
- [ ] Common pitfalls section (3+ items)
- [ ] Output Rules state finalResponse-as-deliverable + comments-as-coordination (NOT a 2000 char comment limit — superseded 2026-04-26)
- [ ] `${roleSpecificGuidance}` placeholder present at end

---

## Gold Standard 4: Category Alignment (A- Standard)

**Source**: MCP Service Orchestrator category fix (Apr 2026)
**Apply to**: All template category assignments

### What Makes It Gold Standard

The category must reflect the template's **current purpose**, not its history.

### Anti-Pattern: Inherited Category

```
BAD:
Template: "MCP Service Orchestrator"
Category: MCP_SERVICE_INTEGRATION  ← inherited from old "Integration Tester" name

GOOD:
Template: "MCP Service Orchestrator"
Category: MCP_ORCHESTRATION  ← matches what it actually does
```

### Available Categories (as of Apr 2026)

Source of truth: `prisma/schema.prisma` enum `AgentCategory` (line ~1232).

| Category | Use for |
|----------|---------|
| GENERAL | Versatile, no domain specialization (e.g. Sales Engineer, Universal) |
| DEVELOPMENT | Code, architecture, technical design (e.g. Senior Software Dev, Solution Architect) |
| TESTING | QA, validation, test engineering (e.g. QA Test Engineer) |
| DOCUMENTATION | Technical writing, API docs (e.g. Technical Writer) |
| ANALYSIS | Data/business/research analysis (e.g. Data Analyst, Business Analyst, Research Analyst, Marketing Strategist) |
| AUTOMATION | Coordination/process roles (e.g. Project Manager, Pipeline Harness, Artifact Harvester/Editorial Writer/Publication Reviewer) |
| REVIEW | Audit, review (less used; most review work lives under REVIEWER templateType within another category) |
| DEPLOYMENT | DevOps, infrastructure (e.g. DevOps Engineer) |
| MONITORING | Observability, alerting (niche; most monitoring work is OPERATOR templateType in DEPLOYMENT) |
| SECURITY | Security analysis, compliance (e.g. Security Analyst) |
| MCP_SERVICE | All MCP-related templates — registry, discovery, orchestration, QA (consolidated Apr 2026 from 4 separate MCP_* categories) |

**Historical note**: Prior to April 2026 the schema had `MCP_SERVICE_REGISTRY`, `MCP_SERVICE_DISCOVERY`, `MCP_SERVICE_INTEGRATION`, `MCP_SERVICE_QA`, and `MCP_ORCHESTRATION` as separate categories. They were consolidated into the single `MCP_SERVICE` category because the category didn't drive meaningful behavior differentiation — templateType + name did that work. The legacy MCP categories may still appear in some MCP tool schema definitions; DB source of truth is the consolidated `MCP_SERVICE`.

### Checklist

- [ ] Category matches the template's current name and purpose
- [ ] Category wasn't inherited from a previous template name
- [ ] If renaming a template, verify category still fits

---

## Gold Standard 5: Pre-flight Checks (A Standard)

**Source**: MCP Service Orchestrator pre-call workflow (Apr 2026); generalized Apr 2026 (task #83 template audit) to include artifact/predecessor-output consumers.
**Apply to**: All templates that interact with external services, APIs, OR consume artifacts/predecessor task outputs.

### What Makes It Gold Standard

**Hard pre-flight** — templates that call external services MUST include:
1. **Schema inspection** — confirm parameter names before constructing calls
2. **Health/availability check** — verify the target is reachable
3. **Explicit "do not guess" instruction** — LLMs will guess parameter names if not told otherwise

**Soft pre-flight** — templates that consume upstream artifacts or predecessor task outputs MUST include:
1. **Verify dependencies exist before acting on them** — call `project(action: "task.context")` for predecessor outputs, `fetch(id: "artifact-...")` for referenced artifacts. Do NOT assume content; read it.
2. **Explicit "do not assume" instruction** — agents default to plausible-sounding fabrication when upstream data is missing; the prompt must tell them to verify first.

The soft pre-flight is implemented as a shared step in the Universal Template's Tool Workflow (v2.1.0, added task #83). Individual role templates inherit it automatically; per-template prompts should reinforce it for their specific consumer pattern (e.g., Editorial Writer MUST read the Harvester's output before generating prose).

### Gold Standard Example

```markdown
## Pre-Workflow Checklist

Before constructing calls, complete these checks for **every service**:

1. **Inspect schemas** — call `registry(action: "tools", service_name: "...")`
   for each service to get exact tool names and parameter structures
2. **Health check** — call `services(action: "health", service_name: "...")`
   to confirm each service is reachable and healthy
3. **Map data flow** — identify which fields from each response feed into the next call

Only proceed once schemas and health are confirmed for all services.
```

### Lesson Learned

Without pre-flight checks in the prompt, agents guess parameter schemas based on tool names.
This causes one wasted call per service (the `validateToolArguments` error recovery catches it,
but it's an avoidable round-trip). With pre-flight checks, agents hit 100% first-attempt success
on service calls.

### Checklist

- [ ] Prompt includes explicit schema inspection step before calling
- [ ] Prompt includes health check step
- [ ] Prompt says "do not guess parameter names" or equivalent
- [ ] Steps are numbered and in correct order (inspect → health → call)

---

## Gold Standard 6: Output Rules — Deliverable Contract (A Standard)

**Source**: Engine §8 rewrite + universal template + MCP orchestrator templates (commits `d0c0f2d8`, `04fb7630`, `ff5a6bf0`, `d652a630`, 2026-04-26)
**Apply to**: All templates

### What Makes It Gold Standard

Output Rules must enforce the **Deliverable Contract**: the LLM agent's last assistant message (`finalResponse`) is the single canonical deliverable channel. It becomes:
- `report.md` for leaf tasks (zero downstream dependents) — customer-facing
- The chained-context input for downstream specialists in a pipeline

`task.comment` is for short coordination/status updates, never the delivery channel. The pre-2026-04-26 pattern of splitting deliverables across multiple 2,000-char comments is gone.

Rules must specify:
1. **Deliverable channel statement** — "Final response is your deliverable channel" prose, with explicit pointer to where it ends up (`report.md` / `result.json.finalResponse`)
2. **Coordination boundary** — `task.comment` is for short status updates only ("workflow submitted, polling...", error escalations); never the delivery channel
3. **Format example** — a concrete results-table-then-synthesis pattern the agent writes into the final assistant response (NOT into comments)
4. **Synthesis expectation** — "synthesise insights" vs "dump raw data"

Length is bounded by the model's context window, NOT by `task.comment`.

### Gold Standard Example

```markdown
## Output Rules

- **Synthesise, don't just report**: connect service outputs to the task objective; raw data dumps are not enough
- **Final response is your deliverable channel**: write the full synthesis (results table + synthesis paragraph) as your final assistant response. The platform persists this verbatim as `report.md` (for leaf tasks) AND as the `finalResponse` field in `result.json` (which downstream tasks chain on).
- **Multi-service format** — results table followed by synthesis paragraph:

  | Service | Tool | Status | Key Data |
  |---------|------|--------|----------|
  | eia-service | get_state_profile | PASS | TX: 68% gas, $0.089/kWh |
  | weather-service | forecast | PASS | TX next 5 days: 38-42C |

  *Synthesis: High temperatures → elevated cooling demand → spot price pressure likely...*

- **Single-service format**: concise paragraph with key data points, no table required
- **Coordination only**: use `perform(action: "task.comment")` ONLY for short status/coordination updates if needed (e.g., "starting service calls...", error escalations) — never as the delivery channel
```

### Anti-Pattern: Comment-as-delivery (pre-2026-04-26 pattern)

```
BAD:
"Report your findings via task.comment, splitting across multiple comments
 if your output exceeds 2000 characters."
→ Agent splits a 6,000-char deliverable across 3 comments. report.md ends
  up with engine meta-prose pointing at the comments. Downstream chained
  context only sees the LLM's last sentence, not the deliverable. Customer
  has to reassemble the deliverable from comment thread.

GOOD:
"Write the full synthesis as your final assistant response. The platform
 persists this verbatim as report.md."
→ Agent writes one complete deliverable. report.md = the deliverable
  verbatim. Downstream chained context sees the same text. Customer reads
  report.md and is done.
```

### Anti-Pattern: Engine-side tool dump leak

The engine USED to concatenate per-turn `## Tool Execution (Turn N)` markdown blocks (with full Args/Result JSON) onto `finalResponse`, polluting both `report.md` and chained context. Removed in commit `d652a630`. Tool forensics now live ONLY in `result.json.toolCalls` (structured). If you see this pattern reappear in any prompt or template ("the engine appends a tool execution summary to your output"), flag it — the engine no longer does this.

### Checklist

- [ ] "Final response is your deliverable channel" prose present
- [ ] Explicit pointer to `report.md` / `result.json.finalResponse` as where the deliverable lands
- [ ] Coordination boundary stated: `task.comment` is for short status only
- [ ] At least one concrete format example (table + synthesis paragraph)
- [ ] Synthesis expectation stated ("don't dump raw data")
- [ ] No mention of a 2,000-char `task.comment` limit as if it's the delivery cap (superseded 2026-04-26)

---

## Gold Standard 7: Seed Script (A Standard)

**Source**: seed-mcp-service-integration-template.ts migration pattern (Apr 2026)
**Apply to**: All template seed scripts

### What Makes It Gold Standard

Seed scripts must be:
1. **Idempotent** — safe to run multiple times (findFirst → update, not just create)
2. **Migration-aware** — handle renames via legacy name lookup
3. **Environment-agnostic** — works locally and with `NODE_ENV=production`
4. **Self-documenting** — JSDoc header explains what the template is for

### Gold Standard Example

```typescript
const TEMPLATE_NAME = 'MCP Service Orchestrator';
const LEGACY_NAME   = 'MCP Service Integration Tester';

async function seed() {
  // Migration: rename existing record if found under old name
  const legacy = await prisma.agentTemplate.findFirst({
    where: { name: LEGACY_NAME }
  });

  if (legacy) {
    console.log(`Migrating "${LEGACY_NAME}" → "${TEMPLATE_NAME}"...`);
    await prisma.agentTemplate.update({
      where: { id: legacy.id },
      data: { name: TEMPLATE_NAME, ...templateData }
    });
    return;
  }

  // Idempotent: update if already exists under new name
  const existing = await prisma.agentTemplate.findFirst({
    where: { name: TEMPLATE_NAME }
  });

  if (existing) {
    await prisma.agentTemplate.update({ where: { id: existing.id }, data: templateData });
    return;
  }

  // Fresh create
  await prisma.agentTemplate.create({ data: { name: TEMPLATE_NAME, ...templateData } });
}
```

### Anti-Pattern: Non-idempotent Script

```
BAD:
await prisma.agentTemplate.create({ data: { name: TEMPLATE_NAME, ... } });
→ Fails on second run with unique constraint violation

BAD:
await prisma.agentTemplate.deleteMany({});  // ← WIPES ALL TEMPLATES
→ Destroys user-created templates and other seed scripts' records
```

### Checklist

- [ ] findFirst by name before create (idempotent)
- [ ] LEGACY_NAME constant if template was renamed
- [ ] Migration path: legacy → update with new name
- [ ] Runs on both local and production (`NODE_ENV=production`)
- [ ] Does NOT deleteMany or truncate the table
- [ ] Console output shows created/updated/migrated status

---

## Gold Standard 8: Template Differentiation (A Standard)

**Source**: MCP template pipeline design (Apr 2026)
**Apply to**: Any domain with 2+ templates

### What Makes It Gold Standard

Templates within the same domain must have **clear swim lanes**:
1. Each template covers a distinct use case
2. Any given task maps to exactly one template
3. The templates form a logical pipeline (optional but preferred)

### Gold Standard Example: MCP Hub Domain

```
┌──────────────────────┐     ┌──────────────────────────┐     ┌──────────────────────────┐
│  MCP Service         │     │  MCP Service             │     │  MCP Workflow            │
│  Discovery           │ →   │  Orchestrator            │ →   │  Orchestrator            │
├──────────────────────┤     ├──────────────────────────┤     ├──────────────────────────┤
│ "Which service?"     │     │ "Call it, reason on it"  │     │ "Chain 3+ declaratively" │
│                      │     │                          │     │                          │
│ services(discover)   │     │ services(call)           │     │ services(workflow.execute)│
│ → recommendations    │     │ → synthesised insights   │     │ → formal step execution  │
│                      │     │                          │     │                          │
│ Category:            │     │ Category:                │     │ Category:                │
│ MCP_SERVICE_DISCOVERY│     │ MCP_ORCHESTRATION        │     │ MCP_ORCHESTRATION        │
└──────────────────────┘     └──────────────────────────┘     └──────────────────────────┘
```

### Decision Guide: Which Template to Assign

| Task description says... | Template |
|---|---|
| "Find a service that can..." | MCP Service Discovery |
| "Call the EIA service and get..." | MCP Service Orchestrator |
| "Call weather + EIA + notifications to..." | MCP Service Orchestrator |
| "Build a 3-step sequential workflow with variable chaining..." | MCP Workflow Orchestrator |
| "Execute the daily-energy-weather named workflow" | MCP Workflow Orchestrator |

### Anti-Pattern: Overlapping Scope

```
BAD:
"MCP Service Caller"       - calls individual services
"MCP Service Integrator"   - calls individual services and validates
"MCP Multi-Service Agent"  - calls multiple services
→ Three templates, unclear which to pick for "call EIA and weather"

GOOD:
"MCP Service Orchestrator" - calls one or more services, reasons between calls
→ One template, covers all agentic service-calling tasks
```

### Decision Guide Required For (added 2026-04-16, task #83 template audit)

Some category/templateType cells have multiple templates that looked distinct at seed time but produce ambiguous task-routing in practice. These clusters MUST have explicit swim-lane statements in each template's role guidance (the "**Swim lane**:" opening bullet pattern established in task #83):

| Cluster | Templates | Resolution |
|---|---|---|
| **DEVELOPMENT / ARCHITECT** | Technical Consultant, Solution Architect | Consultant = pre-decision options + trade-off analysis; Architect = post-decision chosen-design implementation spec. Each entry includes "flag the mismatch" instruction if the task asks for the sibling's work. |
| **ANALYSIS / ANALYST** | Business Analyst, Data Analyst, Research Analyst | Business = translation layer (WHO + WHY); Data = grounded POV metrics (WHAT is the data saying); Research = analytical research on a topic/system (audits, landscape studies). Each entry references the other two by name. |
| **AUTOMATION / ANALYST** (synthesis siblings) | Research Analyst ↔ Artifact Harvester | Research Analyst ANALYZES a topic and produces findings; Artifact Harvester EXTRACTS findings from existing source material. Cross-references via `artifact_harvester` swim-lane entry. |

**When to add to this table**: Any time two templates in the same `(category, templateType)` cell have task routing ambiguity observed in practice (harness assignment landing on the wrong template, operators hand-editing assignments, etc.). Swim-lane statements in role guidance are the fix; the pattern doc records the cluster so future templates in that cell inherit the discipline.

### Checklist

- [ ] Each template has a one-sentence scope statement
- [ ] No two templates in the same domain cover the same task type
- [ ] If the template shares a `(category, templateType)` cell with another template, its role guidance opens with a `**Swim lane**:` bullet referencing the siblings by name
- [ ] Decision guide exists: "if task says X, use template Y"
- [ ] Templates form a pipeline (optional but preferred)

---

## Template Creation Checklist (Complete)

When creating or maintaining an agent template, verify all 8 gold standards:

### Naming & Identity
- [ ] **GS1**: Name describes deliverable, not mechanism
- [ ] **GS1**: Name doesn't overlap with other templates
- [ ] **GS4**: Category matches current purpose (not inherited from old name)
- [ ] **GS8**: Clear swim lane — no ambiguity with sibling templates

### Role Guidance
- [ ] **GS2**: Entry in ROLE_GUIDANCE_LIBRARY (pAIchartUniversalTemplate.ts)
- [ ] **GS2**: 7-10 actionable bullets with tool names
- [ ] **GS2**: 2+ common mistakes called out

### Prompt Template
- [ ] **GS3**: All 7 sections present (Platform → Context → Specialization → Workflow → Reference → Output → Role)
- [ ] **GS3**: Tool Workflow with 4+ numbered steps and exact tool syntax
- [ ] **GS5**: Pre-flight checks (schema + health) before any external calls
- [ ] **GS6**: Output Rules carry the Deliverable Contract — finalResponse is the delivery channel, comments are coordination only, format example, synthesis expectation (replaces 2000-char comment-limit framing 2026-04-26)

### Seed Script
- [ ] **GS7**: Idempotent (findFirst → update, not blind create)
- [ ] **GS7**: Migration-aware (LEGACY_NAME if renamed)
- [ ] **GS7**: Works on both local and production

### Domain Coherence
- [ ] **GS8**: Decision guide exists for template selection
- [ ] **GS8**: Templates form a logical pipeline within the domain

---

## Model Selection Guide

🔴 **Do not write a model literal into a seed script.** Since 2026-08-09 the model is selected by
**tier**, from the single source of truth `lib/agents/model-tiers.ts`:

```ts
import { AGENT_MODELS } from '../lib/agents/model-tiers';
modelParameters: { provider: 'anthropic_sdk', model: AGENT_MODELS.infra, temperature: 0.3, ... }
```

| Template purpose | Tier | Resolves to (2026-08-09) |
|---|---|---|
| Device/state-reaching domain specialists (k8s, network, terraform) | `AGENT_MODELS.infra` | `claude-haiku-4-5` |
| Legacy / general / MCP service-integration | `AGENT_MODELS.generic` | `claude-haiku-4-5` |
| Cognition + writing-quality work, where the prose IS the deliverable | `AGENT_MODELS.synthesis` | `claude-sonnet-5` |
| Meta-agents that decompose and synthesize (harness, program architect) | `AGENT_MODELS.orchestrator` | `claude-sonnet-5` |

**Why a tier and not a literal**: the value was previously duplicated 15× across 9 seed scripts,
so a migration that edited one succeeded, reported success, and left the fleet half-moved with
nothing to detect it. Choosing a tier makes a fleet-wide model change one line with visible
completeness. **Changing what a tier resolves to is the supported operation; flattening the tiers
to one value is a capability regression.**

⚠️ **The prompt-cache floor is model-dependent and NOT monotonic** — Opus 5 / Fable 5 need 512
tokens, Haiku 4.5 needs 4,096 (the *newest* models have the *lowest* minimum). Changing a tier
changes the cache floor for every template on it; re-run `scripts/measure-preamble-tokens.ts` after.

_(Superseded 2026-08-09: this section previously recommended bare literals and named
`claude-sonnet-4-5`, which is not in the current model lineup.)_

---

## Quick Reference: Current MCP Templates

| Template | Role Key | Category | Model |
|---|---|---|---|
| MCP Service Discovery | mcp_service_discovery_specialist | MCP_SERVICE_DISCOVERY | haiku |
| MCP Service Registry | mcp_service_registrar | MCP_SERVICE_REGISTRY | haiku |
| MCP Service Orchestrator | mcp_service_orchestrator | MCP_ORCHESTRATION | haiku |
| MCP Workflow Orchestrator | mcp_workflow_orchestrator | MCP_ORCHESTRATION | sonnet |

---

## Related

- Stack map: `.claude/knowledge/domain/harness/autonomous-delivery-stack.md` — where templates sit in the automation stack (Layer 3: Seed Scripts)
- Pattern #45: `prompt-library-gold-standard-pattern.md` — Protocol authoring (including GS8: Template + Protocol Separation — no contradictions between the two)
- Pattern #46: `orchestration-reactor-pattern.md` — Reactors that act on the outputs of template-driven executions
- **Protocol 13 (Program Workflow Evolution)**: `.claude/knowledge/protocols/program-workflow-evolution-protocol.md` — this pattern is the authoring standard when its finding→fix loop classifies a fix to the **role-guidance / template** layer; GS2's seed-time bake is the re-seed coupling that protocol's ship step turns on (a role-guidance change rides the template re-bake, never a plain deploy).
