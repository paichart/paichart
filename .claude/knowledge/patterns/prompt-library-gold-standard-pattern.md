# Prompt Library Gold Standard Pattern

**Type**: Excellence Pattern (builds on agent-template-gold-standard-pattern.md baseline)
**Confidence**: 92% (production-validated Apr 2026)
**Status**: Complete — derived from Pipeline Harness Guide, Protocol Prompts, and interactive prompt builds
**Created**: April 10, 2026
**Pattern #**: 45

---

## Overview

This pattern captures best practices for creating and maintaining prompts in the `agent_prompt_library` database table. Companion to Pattern #44 (Agent Template Gold Standard) which covers agent templates.

**10 Gold Standards**:
1. Prompt Types — know which type you're creating
2. Tags — correct tagging for visibility and engine behavior
3. Handlebars Safety — the regex engine limitation
4. Protocol Prompt Rules — plain markdown, no variables
5. Variable Definitions — structured schema for interactive prompts
6. Seed Script — idempotent with GS7 compliance
7. Universal Agent Rules Preamble — cross-cutting rules in one constant, prepended to every protocol (Apr 2026)
8. Template + Protocol Separation — no contradictions between template and protocol (Apr 2026)
9. **Naming Convention** — HOWTO-/DEMO-/ABOUT-/snake_case/*-protocol with DOCUMENTATION enum for educational prompts (Apr 2026, locked during rationalisation 2026-04-24)
10. **Lifecycle & Stale-Seed Safety** — protocol-tag exemption from usageCount-based deletion, hard-delete preferred, canonical-seed-only policy, deploy-before-seed-run sequencing (Apr 2026)

---

## Gold Standard 1: Prompt Types

Three distinct prompt types exist in the library. Each serves a different consumer and has different rules.

| Type | Consumer | Example | Tags | Has Variables? | Has Handlebars? |
|------|----------|---------|------|----------------|-----------------|
| **Interactive** | Human via Claude Desktop/ChatGPT `prompt_command` | `pipeline_harness_guide`, `select_pov`, `task_audit_and_planning` | `['mcp', 'interactive']` | Yes | Yes (flat only) |
| **Protocol** | Engine injection into agent system prompts | `pipeline-orchestrator-protocol`, `artifact-synthesis-protocol` | `['mcp', 'protocol']` | No | No (plain markdown) |
| **Workflow** | Workflow orchestration engine | (no live examples today — reserved for future workflow-engine prompts) | `['mcp', 'workflow']` | Optional | Optional |

**Decision guide**: "Who reads this prompt?"
- Human picks it from a menu OR invokes it via `/prompt <name>` (including auto-execute analytics prompts that run without further interaction once invoked) → **Interactive**
- Engine injects it into an agent's context (via `metadata.protocol`, or the harness composition modes `loadProtocols: 'composed'`/legacy `true`) → **Protocol**
- Workflow engine chains it across services as part of a multi-service composition → **Workflow**

The key distinction between Interactive and Workflow: **who initiates the invocation?** A `/prompt <name>` invocation is always Interactive (even if the prompt runs autonomously afterwards). Only prompts invoked by the `services(action: "workflow.execute")` workflow engine are Workflow.

### Checklist
- [ ] Prompt type identified before writing content
- [ ] Tags match the type (see GS2)
- [ ] Content format matches the type (see GS3 and GS4)

---

## Gold Standard 2: Tags

The `tags` field is a `String[]` on `agent_prompt_library`. Tags control visibility and behavior.

### Required tags

| Tag | What it does | Required for |
|-----|-------------|--------------|
| `mcp` | Makes the prompt visible in `list_prompts` and callable via `prompt_command` | ALL prompts (without this tag, the prompt is invisible to MCP clients) |

### Type tags (exactly one per prompt)

| Tag | Meaning |
|-----|---------|
| `protocol` | Engine queries `WHERE tags has 'protocol'` to inject into PIPELINE tasks |
| `interactive` | Human-facing prompt with variables and conditional sections |
| `workflow` | Workflow-engine prompt for cross-service orchestration |

### Domain tags (optional, for filtering)

| Tag | Example usage |
|-----|---------------|
| `domain:synthesis` | Artifact synthesis protocol |
| `domain:security` | Security audit protocol (future) |
| `domain:finance` | Financial analysis prompts |
| `domain:general` | No specific domain |

### Example tag sets

```
Interactive prompt:  ['mcp', 'interactive', 'domain:general']
Protocol prompt:     ['mcp', 'protocol']
Domain protocol:     ['mcp', 'protocol', 'domain:synthesis']
Workflow prompt:     ['mcp', 'workflow', 'domain:finance']
```

### Checklist
- [ ] `mcp` tag present (visibility requirement)
- [ ] Exactly one type tag (`protocol`, `interactive`, or `workflow`)
- [ ] Domain tags added where applicable
- [ ] No invented tags that duplicate existing ones

---

## Gold Standard 3: Handlebars Safety (CRITICAL)

The pAIchart prompt engine uses **regex-based substitution**, NOT a real Handlebars parser. This has one critical limitation:

### The Rule: No Nested `{{#if}}` Blocks

```
BROKEN (nested):
{{#if objective}}
  Your objective is: {{objective}}
  {{#if pov_name}}              <-- NESTED inside outer {{#if}}
    POV: {{pov_name}}
  {{/if}}
{{/if}}

Result: Both branches leak into the output. Template tags visible to user.
```

```
CORRECT (flat siblings):
{{#if objective}}
Your objective is: {{objective}}
{{/if}}

{{#if pov_name}}
POV: {{pov_name}}
{{/if}}
```

**Flat sibling `{{#if}}` blocks are safe. Nested blocks are not.**

This was discovered in production (PROMPT-PIPELINE-HARNESS-GUIDE v1.5, Apr 2026) when both branches of a nested conditional leaked into the rendered output.

### What works

| Syntax | Safe? | Notes |
|--------|-------|-------|
| `{{variable}}` | Yes | Simple substitution |
| `{{#if variable}}...{{/if}}` | Yes | Flat conditional |
| `{{#if a}}...{{/if}} {{#if b}}...{{/if}}` | Yes | Flat siblings |
| `{{#if a}} {{#if b}}...{{/if}} {{/if}}` | **NO** | Nested — both branches leak |
| `{{#each}}` | **NO** | Not supported by regex engine |
| `{{#each ... where <filter>}}` | **NO** | Neither `{{#each}}` nor filter syntax is supported; both appear as literal text to the LLM |
| `{{else}}` | Yes | Inside flat `{{#if}}` only |

### Literal `{{...}}` in code-fenced examples

A prompt body may contain code-fenced examples (bash, typescript, etc.) that show users how to invoke tools with variable placeholders. These are NOT GS3 failures even if they look Handlebars-shaped, because the regex renderer leaves undeclared braces as literal text:

```bash
# Example (literal text, not a variable):
/prompt my_prompt {{step.N.output}}
```

**Guidance when authoring example blocks**:
- Prefer angle-bracket placeholders (`<execution-id>`) over double-brace placeholders (`{{execution_id}}`) to avoid author-intent ambiguity. Angle-brackets read as clearly non-rendering to both humans and the linter.
- If you MUST use double-brace syntax in a code-fenced example (e.g., documenting a client that does its own Handlebars rendering), name the variable differently from any `variables:` frontmatter entry so the renderer can't accidentally match it.

Scoring rule: literal `{{...}}` inside fenced code blocks is 🟢 pass for GS3. Only `{{...}}` outside code fences counts for nested-block detection.

### Anti-pattern: Handlebars output-templates

This is the specific authoring mistake that produced three production prompts carrying GS3 failures (`pov_health_check`, `energy_operations_optimizer`, `weather_commodity_trading_signals` — caught during the 2026-04-24 rationalisation compliance audit).

**Do NOT embed Handlebars-shaped templates as a way to show the LLM what the output should look like.** Author intent is "here is the shape I want rendered"; engine behavior is "leave these tags as literal text for the LLM to puzzle over." The output is garbled template fragments in the rendered response.

```
ANTIPATTERN (don't do this):
## Recommendations Table

{{#each RECOMMENDATIONS}}
- **{{priority}}**: {{summary}}
  {{#each details}}
  - {{this}}
  {{/each}}
{{/each}}
```

The regex engine leaves all of this as literal output. The LLM reads the template-shaped text as part of the prompt and produces confused output.

```
CORRECT (prose instruction to the LLM):
## Recommendations Table

Produce a markdown table with columns: Priority, Summary, Details.
One row per recommendation. Details column should be a bulleted list
inline within the row, joined with line breaks.
```

The prose is unambiguous to the LLM, produces the intended output, and has zero engine-side rendering risk.

**Rule**: if you find yourself writing `{{#each}}` or nested `{{#if}}` to describe OUTPUT shape, convert it to prose. Only use Handlebars for INPUT substitution (`{{variable}}`) and simple flat conditionals (`{{#if variable}}...{{/if}}`).

### Checklist
- [ ] Zero nested `{{#if}}` blocks (search for `{{#if` outside code fences — count should match `{{/if}}` with no nesting)
- [ ] No `{{#each}}` usage outside code fences
- [ ] No `{{#each ... where}}` or other invented filter syntax
- [ ] No Handlebars output-templates (use prose for describing output shape)
- [ ] Literal `{{...}}` inside code fences uses angle-bracket placeholders where possible
- [ ] Tested rendered output with variables set AND unset to verify no tag leakage

---

## Gold Standard 4: Protocol Prompt Rules

Protocol prompts are **static reference documents** that the execution engine injects into agent system prompts. They are NOT interactive prompts.

### 4a. Two kinds of protocol — harness-side vs child-side (Apr 2026)

Before writing a new protocol, identify which kind it is. The two kinds serve different purposes, use different injection mechanisms, and apply to different template categories:

| Kind | Used by | Injection mechanism | Purpose |
|------|---------|---------------------|---------|
| **Harness-side** | Pipeline Harness template | `metadata.loadProtocols: 'composed'` (2026-08-17) — engine composes the `protocol-base` row + the ONE protocol the task's stamp names (resolved from the title token at first execution, frozen; legacy `true` = inject-all rollback). Never a runtime model-side pick from task title | Tells the orchestrator how to decompose, assign, monitor, synthesize |
| **Child-side** | Specialist templates (e.g., Artifact Harvester) | `metadata.protocol: 'name'` — engine injects THIS one specific protocol | Tells coordinated specialists how to do their phase in a multi-phase workflow |

**Examples in the library today**:
- `pipeline-orchestrator-protocol` — harness-side (one, the default)
- `artifact-synthesis-protocol` — child-side (one, for the 3 synthesis specialists)

**Critical rule**: children of a pipeline NEVER inherit harness-side protocols. A harness-side protocol contains "decompose / assign / synthesize" instructions meant for the orchestrator. Injecting it into a specialist confuses the LLM. Verified empirically 2026-04-17 — 4 recent non-synthesis pipelines used vanilla specialists (Solution Architect, Security Analyst, etc.) with no `metadata.protocol`; this is correct behavior.

### 4b. When a child-side protocol is warranted

Most workflows DON'T need a child-side protocol. Role guidance + task description is enough if children just pass I/O between independent deliverables.

A child-side protocol is warranted when the workflow exhibits **≥3 of these 5 properties**:

1. **Same template runs multiple phases** with different behavior (e.g., Editorial Writer runs Phases 3, 5, 6 — different work in each)
2. **Tight output shape contract between phases** (e.g., Harvester's `## Finding N` markdown is the REQUIRED input shape for Editorial Writer's Phase 3)
3. **Cross-task decision rules** (e.g., "if Phase 4 flags conflations, Phase 5 triggers restructure")
4. **Shared quality constraints across tasks** (e.g., "anchor every claim in evidence from the harvest" applies to all three specialists)
5. **Mandatory phase sequence** — inherent ordering, not arbitrary decomposition (harvest → annotate → integrate)

**Artifact synthesis** exhibits all 5 → needs a protocol. **Vanilla pipelines** (Meridian cloud security, blast radius, etc.) exhibit NONE — each child is a different template, produces its natural role deliverable, no retry loops, no shared-across-tasks constraints. Role guidance + task description suffices.

**Decision rule**: walk the 5 properties. ≥3 apply → write a child-side protocol. ≤2 → vanilla specialists + harness orchestration is the right shape.

### 4c. The key insight: protocols add SHARED REASONING, not coordination data

A protocol does NOT add data flowing between tasks. `task.context` still carries predecessor outputs as before. Task outputs are the same whether a protocol is present or not.

The protocol adds **shared reasoning** — each specialist's LLM has the same workflow document loaded, so they interpret each other's outputs consistently and produce outputs the next specialist can parse.

If you find yourself writing role guidance that duplicates cross-specialist coordination rules across 3 templates, that's the signal to extract into a protocol. If each role's guidance is self-contained (just "do your role's work"), you don't need one.

**Further reading**: `.claude/agents/pipeline-harness-specialist.md` §2a/2b for the specialist view of this taxonomy.

---

### Content rules

| Rule | Reason |
|------|--------|
| **Plain markdown only** | Engine prepends raw `promptText` to system prompt — no template rendering |
| **No `{{variable}}` placeholders** | Protocol content goes through `prompt_command` rendering path when called by external clients — Handlebars would try to substitute non-existent variables |
| **No `{{#if}}` conditionals** | Same reason — and the regex engine would break on nested blocks anyway |
| **Clear "When to Use" / "When NOT to Use" sections** | The harness matches protocols by reading these sections against the task description |
| **Numbered steps with exact tool syntax** | Agents need concrete instructions, not vague guidance (same principle as GS2 in template gold standard) |
| **Include parallel execution guidance** | When tasks are independent, explicitly say "do NOT add dependencies — the engine runs them in parallel." Without this, agents default to sequential wiring. |

### Parallel execution in protocols

Protocols that describe multi-task decomposition should explicitly address parallelism:

```markdown
### Step 3: Wire Dependencies
If two tasks are independent (neither needs the other's output), do NOT
add dependencies between them. The execution engine uses Promise.allSettled
to run independent tasks in parallel — wiring unnecessary dependencies
forces sequential execution and wastes time.

Example — parallel:
  Task A: "Market analysis" (no dependency)
  Task B: "Competitive positioning" (no dependency)
  Task C: "Business case" (depends on A and B — waits for both)

Example — sequential (only when required):
  Task A: "Harvest findings" (no dependency)
  Task B: "Annotate artifact" (depends on A — needs A's output)
  Task C: "Review quality" (depends on B — needs B's output)
```

### Checklist
- [ ] Zero `{{` characters in `promptText` (grep check: `grep -c '{{' protocol-content`)
- [ ] "When to Use" section present with specific trigger criteria
- [ ] "When NOT to Use" section present listing other protocols
- [ ] Numbered steps with tool call syntax where applicable
- [ ] Parallel vs sequential guidance included if protocol describes multi-task work
- [ ] Tags include `['mcp', 'protocol']` plus optional `domain:*`

---

## Gold Standard 5: Variable Definitions (Interactive Prompts Only)

Interactive prompts use the `variables` JSON field to define user-configurable parameters.

### Schema shape

```json
{
  "variable_name": {
    "type": "string",
    "description": "Human-readable description shown in the UI",
    "required": false,
    "default": "optional default value"
  }
}
```

### Supported types
- `string` — free text
- `boolean` — true/false toggle
- `number` — numeric input

### Gold standard example (from pipeline_harness_guide)

```json
{
  "objective": {
    "type": "string",
    "description": "The high-level objective for the pipeline",
    "required": false
  },
  "pov_name": {
    "type": "string",
    "description": "Name of the POV to run against",
    "required": false
  },
  "mode": {
    "type": "string",
    "description": "Pipeline mode: 'create' or 'orchestrate'",
    "required": false,
    "default": "create"
  }
}
```

### Protocol prompts: variables = `{}`

Protocol prompts MUST set `variables: {}` (empty object). They have no user-configurable parameters — they're static reference documents.

### Checklist
- [ ] Every variable has `type` and `description`
- [ ] Optional variables have `required: false` (default)
- [ ] Variables with defaults have `default` field set
- [ ] Protocol prompts have `variables: {}` (empty)

---

## Gold Standard 6: Seed Script

Same as GS7 from Agent Template Gold Standard (Pattern #44):

1. **Idempotent** — findFirst by name + update/create
2. **Environment-agnostic** — works with local DB and `NODE_ENV=production`
3. **Self-documenting** — JSDoc header with run instructions
4. **Console output** — shows created/updated status per row

### Protocol seed pattern

```typescript
const existing = await prisma.agentPromptLibrary.findFirst({
  where: { name: protocol.name },
});

if (existing) {
  await prisma.agentPromptLibrary.update({
    where: { id: existing.id },
    data: { ...data, updatedAt: new Date() },
  });
} else {
  await prisma.agentPromptLibrary.create({ data });
}
```

### Checklist
- [ ] findFirst by name before create
- [ ] Update path for existing rows
- [ ] Console output shows created vs updated
- [ ] Runs on both local and production
- [ ] Does NOT deleteMany or truncate

---

## Gold Standard 7: Universal Agent Rules Preamble

Cross-cutting rules that apply to ANY agent reading ANY protocol live in a single `UNIVERSAL_AGENT_RULES` string constant in `lib/agents/universal-agent-rules.ts` (⚠️ MOVED there 2026-08-04 by rec #9; it was in `scripts/seed-protocol-prompts.ts`). The seed script prepends this constant to the `promptText` of every entry in the `PROTOCOLS[]` array before writing to the DB. Every protocol automatically inherits these rules.

### The three rule categories (Apr 2026)

1. **Turn Efficiency**
   - Use literal IDs (not placeholders like `"current"` or fake CUIDs)
   - Read IDs from tool responses directly — don't re-query
   - Load context once per execution
   - Always filter `task.list` with `stageId` or `phaseId` — unfiltered returns 100 tasks
   - Batch related tool calls without narrating between them

2. **Trust Verified State Over Narrative**
   - Comments on your task from prior runs are NOT current state
   - RECENT ACTIVITY in `task.details` is history, not state — status/executionStatus/metadata are authoritative
   - If a tool query returns "not found" for a reference in an old comment, that chain is stale — disregard

3. **Never Fabricate — Report What Is True**
   - Verify deliverables exist with live tool calls in THIS execution before calling `task.complete`
   - For PIPELINE-type tasks: `metadata.pipelineStageId` set AND child stage has ≥ 1 task AND every task is terminal (enforced server-side in `task-complete-handler.ts` + `task-update-handler.ts`)
   - On verification failure, post escalation and exit IN_PROGRESS — don't complete

### Adding to UNIVERSAL_AGENT_RULES

When you identify a new cross-cutting rule (applies to multiple protocols/agents):
1. Edit `lib/agents/universal-agent-rules.ts` (⚠️ **MOVED 2026-08-04** — it was a constant in the
   seed script until rec #9)
2. Add ONE canonical changelog note on `pipeline-orchestrator-protocol` — the other protocol-tagged
   prompts share the constant and are **not** separately bumped
3. **No re-seed is needed for the rules themselves.** They are injected at RUNTIME
   (`execution-system-prompt.ts`), not baked into each stored `promptText`
4. Every protocol-reading agent picks it up on the next deploy

### GUI-authored protocols caveat

⚠️ **THIS CAVEAT IS OBSOLETE as of 2026-08-04 (rec #9) — do NOT act on it.** GUI-authored protocols
NOW DO receive `UNIVERSAL_AGENT_RULES`, because the preamble is injected once at runtime for any
injected protocol rather than concatenated at seed time. **Pasting it manually into a GUI-authored
protocol would now DUPLICATE it.** Retained only so anyone who memorised the old caveat finds its
retraction. Original text: GUI-authored protocols do NOT auto-inherit `UNIVERSAL_AGENT_RULES` — the preamble is a seed-script-time concatenation, invisible to the GUI's `promptText` field. If a GUI-authored protocol needs those rules, either paste them manually at the top, or promote the protocol to the seed script (see "Choosing an Authoring Path" below).

### Checklist
- [ ] Cross-cutting rules go in `UNIVERSAL_AGENT_RULES`, not duplicated in each protocol body
- [ ] Protocol bodies contain only protocol-SPECIFIC rules
- [ ] ~~GUI-authored protocols that need the universal rules paste them manually~~ **obsolete 2026-08-04** — they now receive them by runtime injection; pasting duplicates

---

## Gold Standard 8: Template + Protocol Separation (No Contradictions)

**Scope note for auditors**: GS8 is a *cross-artifact* check. Scoring it rigorously requires reading BOTH `agent_prompt_library.promptText` (for the protocol) AND `agent_templates.promptTemplate` (for the template) and diffing them for duplicated procedures or contradictory statements. A content-only audit of the library side can score internal consistency of the protocol text but cannot detect template-vs-protocol contradictions. If you are scoring GS8 without access to the `agent_templates` table, mark it "not fully verified" rather than "pass."

When authoring both an agent template AND its corresponding protocol, keep the split clean:

| Artifact | Contains | Example |
|---|---|---|
| **Template** (`promptTemplate` on `AgentTemplate`) | High-level role, context placeholders (`${contextualInformation}`, `${roleSpecificGuidance}`), template-type roster (for meta-agents), cross-cutting constraints (output rules, role-level turn budgets) | "You are the Pipeline Harness..." / "You operate in three modes..." |
| **Protocol** (`promptText` on `AgentPromptLibrary`) | Step-by-step procedures, mode-detection logic, tool-call sequences, quality-gate thresholds, pre-flight checklists, specific tool examples | "Step 1: Read your task.details... Step 2: Branch on metadata..." |

**At execution time**: the template becomes the system prompt; protocol content is prepended via `metadata.loadProtocols: 'composed'` (base + the task's stamped protocol), legacy `true` (all), or `metadata.protocol: 'xxx'` (named single).

### The critical rule: NO CONTRADICTIONS

Template and protocol MUST NOT contain contradictory instructions. We shipped a version where the Pipeline Harness template said "create children in a new pipeline stage" while the protocol said "create children in your own stage" — the template won (because it's the system-prompt core) and the protocol was effectively ignored. Fixed in commit `e73440d3` by moving ALL step-by-step procedures into the protocol and making the template thin (role + context + "read the injected protocol").

### How to avoid contradictions

- **Template references the protocol explicitly**: "Your step-by-step procedures are in the injected pipeline-orchestrator-protocol. Read it before acting."
- **Step-by-step instructions live in ONE place (the protocol)** — not duplicated in the template
- **Mode names must match** — CREATE/ORCHESTRATE/SYNTHESIZE in both, not ORCHESTRATE in template and SYNTHESIZE in protocol

### Review checklist

When reviewing a template + protocol pair:
- [ ] Grep template and protocol for shared mode names — they match exactly
- [ ] Tool call sequences appear in ONE artifact (the protocol), not both
- [ ] Template is substantially shorter than protocol (if they're similar length, procedures are being duplicated)
- [ ] Template contains at least one explicit "see the injected [protocol-name]" reference
- [ ] No conflicting statements about where children go, how to detect mode, what triggers completion

---

## Gold Standard 9: Naming Convention (Apr 2026)

The prompt's `name` field is user-visible in `/prompt` menus on Claude Desktop / ChatGPT. Users do NOT see the `category` enum or the `tags` array — those are admin-only. The name is the primary signal for "what kind of prompt is this?"

The convention (locked 2026-04-24 during the rationalisation project — see `cline_docs/reviews/prompt-library-rationalisation-2026-04-24/`):

| Prefix | Kind | User intent answered | Example |
|--------|------|----------------------|---------|
| `HOWTO-<topic>` | Instructional guide | "tell me **how to** do X" | `HOWTO-register-service` |
| `DEMO-<topic>` | Showcase / walkthrough | "**show** me X" | `DEMO-mcp-platform` |
| `ABOUT-<topic>` | Reference / explanation | "tell me **about** X" | `ABOUT-trust-levels` |
| `<snake_case>` | Execution prompt (no prefix) | "do / compute / analyse" | `energy_operations_optimizer` |
| `<domain>-<topic>-protocol` | Engine-injected protocol | "orchestrate / coordinate" | `artifact-synthesis-protocol` |

**Prefix format rules**:
- ALL-CAPS prefix with trailing hyphen (`HOWTO-`, `DEMO-`, `ABOUT-`)
- Body is kebab-case after the prefix (`HOWTO-use-pipeline-harness`, not `HOWTO_use_pipeline_harness`)
- Execution prompts stay snake_case (no prefix — the absence of `HOWTO/DEMO/ABOUT` is itself the signal)
- Protocols keep the `-protocol` suffix (kebab-case throughout)

**Classification heuristic** (use this when authoring or reclassifying a prompt):

| Verb the prompt answers | Prefix | Example |
|-------------------------|--------|---------|
| teach / guide / step-me-through | `HOWTO-` | `HOWTO-configure-X` |
| show / walk-me-through / demo | `DEMO-` | `DEMO-X` |
| define / describe / explain | `ABOUT-` | `ABOUT-X` |
| do / analyse / compute / run | none | `X_optimiser` |
| orchestrate / coordinate / decompose | `-protocol` suffix | `X-protocol` |

**Category enum mapping**:

| Prompt kind | `AgentCategory` enum value |
|-------------|----------------------------|
| HOWTO-* | `DOCUMENTATION` |
| DEMO-* | `DOCUMENTATION` — "a demo is documentation of capability by example" |
| ABOUT-* | `DOCUMENTATION` |
| Execution | keep the domain-specific category (`ANALYSIS`, `SECURITY`, etc.) |
| Protocol | keep existing (usually `GENERAL`) |

The decision to collapse all three educational prefixes into `DOCUMENTATION` rather than add new `GUIDE` / `DEMO` enum values is deliberate: user-visible differentiation comes from the name prefix; admin-side category is for coarse filtering only. If finer admin-side granularity becomes necessary later, `GUIDE` and `DEMO` can be added as enum values — Prisma enum-value addition is a cheap `db push` with no data migration.

### Anti-patterns to reject

- Mixed-case prefixes (`Howto-X`, `howto-x`) — break the ALL-CAPS signal
- Prefixes on execution prompts (`RUN-X`, `EXEC-X`) — execution is identified by the ABSENCE of an educational prefix
- Title-Case with spaces (`"Customer Value Demonstration"`) — was the display-name antipattern of the pre-rationalisation era; hard-retired 2026-04-24
- Unix-timestamp suffixes (`X_copy_1764634784361`) — admin-UI clone artifact
- `-copy` / `-v2` / `_new` suffixes — drift candidates; use `version` column or delete the old

### Checklist

- [ ] Name has the correct prefix for its kind
- [ ] Body after prefix uses the right separator (kebab for HOWTO/DEMO/ABOUT/protocol, snake for execution)
- [ ] Category enum value matches the kind (DOCUMENTATION for all three educational kinds; domain-specific for execution; unchanged for protocols)
- [ ] Not one of the banned anti-patterns above
- [ ] If renaming an existing prompt, cross-reference updates applied to any other prompt bodies that mention the old name (word-boundary regex replacement)

---

## Gold Standard 10: Lifecycle & Stale-Seed Safety (Apr 2026)

Derived from the rationalisation project's Phase 4a (deletions) and Phase 5 (seed consolidation) lessons, 2026-04-24.

### 10a. Protocol-tag exemption from usageCount-based deletion

`agent_prompt_library.usageCount` increments only on the `/prompt` render path (two call sites: `prompt-registry.js#trackPromptUsage` and `embedded-server.ts#trackPromptUsage`). Protocol injection via `metadata.protocol` or `loadProtocols: true` does NOT increment the counter. A protocol prompt consumed on every Pipeline Harness execution can legitimately show `usageCount == 0`.

**Rule**: never use `usageCount == 0` as a deletion signal for prompts where `tags` includes `'protocol'`. The exemption is automatic for any future protocol-tagged addition.

Alternative invocation evidence for protocol-tagged prompts:
- `mcp_interactions` table (per-request log) — authoritative but retention-bound
- `agent_executions.context` JSON — records which protocol was loaded per harness execution
- Grep the codebase for hard-coded name references in `loadProtocols` / `metadata.protocol` callsites

### 10b. Hard-delete preferred over soft-delete

The `AgentTemplateStatus` enum includes `DELETED` for soft-delete. Use it ONLY as a 14-day monitoring window for high-confidence deletions of prompts with `usageCount > 0` — a belt-and-braces observation for "did we miss a consumer?" For zero-use prompts, hard-delete is the default. The library should shrink when cleaning up, not bloat with tombstone rows.

### 10c. Canonical-seed-only policy

**No ad-hoc seed scripts in `/temp-scripts/`.** The path was retired 2026-04-24 after the rationalisation project found four obsolete files there seeding 13 prompts that either never existed in production or were later renamed/deleted via admin UI. Any new prompt that needs a durable seed goes into one of the canonical scripts:

| Seed script | Scope |
|-------------|-------|
| `scripts/seed-protocol-prompts.ts` | Orchestration protocols + one GUI guide (`HOWTO-use-pipeline-harness`) |
| `scripts/seed-agent-templates.ts` | Agent template backstories (rows consumed via `agent_templates.promptTemplate`) |
| `scripts/seed-operational-prompts.ts` | User-facing HOWTO-/DEMO-/ABOUT- guides + snake_case auto-execute analytics prompts |

If a new prompt doesn't fit any of these three, create a new `scripts/seed-<domain>-prompts.ts` — do NOT create it in `/temp-scripts/`.

### 10d. Deploy-before-seed-run sequencing (stale-seed resurrection guard)

Observed 2026-04-24: running a seed script on production immediately after pushing a scrub commit resurrected 8 rows we had just deleted. Root cause: production's release symlink still pointed at a pre-commit release, so the production seed file was stale. The upsert logic re-created the rows because their names were still in the stale array.

**Rule — mandatory sequencing**:
1. Push seed-source code change to `origin/main`
2. Wait for deploy (release symlink updates to the new commit)
3. Verify production seed file reflects the intended state:
   ```bash
   ssh root@PROD "grep -c 'name: .<removed-name>.' /var/www/paichart-app/current/scripts/seed-<script>.ts"
   # Expected: 0
   ```
4. Only then run the seed script on production

**Alternative (code-level fix) — deferred**: extend seed scripts with a `--delete-orphans` flag that removes DB rows not present in the seed array. Eliminates the stale-seed failure mode but risks accidental deletion if an entry is temporarily removed. Process fix is lower-risk and currently preferred.

### 10e. Rename workflow (when renaming an existing prompt)

1. Update the seed array's `name:` field to the new name
2. Apply word-boundary regex replacement (`\y<old>\y`) to all template literals that reference the old name by content (cross-ref fix in seeded prompts)
3. Commit + push the seed change (follow 10d sequencing)
4. Execute DB-direct `UPDATE agent_prompt_library SET name=..., category=..., "promptText"=regexp_replace(...)` for the renamed rows + any rows whose `promptText` references the old name by word-boundary
5. Verify `SELECT name FROM agent_prompt_library WHERE "promptText" ~ '\y<old-name>\y'` returns zero rows

### Checklist

- [ ] `usageCount == 0` is NOT used as deletion evidence for any `protocol`-tagged prompt
- [ ] Hard-delete is the default; soft-delete (`status = 'DELETED'`) is used only for a bounded monitoring window
- [ ] New seed entries land in `scripts/seed-*.ts`, never in `/temp-scripts/`
- [ ] Before running seed on production: push → wait for deploy → grep-verify production file → run
- [ ] Renames apply word-boundary regex to prompt bodies, not just the `name` column
- [ ] After any seed change, verify no DB row references a removed/renamed name in any `promptText` body

---

## Choosing an Authoring Path

Protocols can reach the `agent_prompt_library` DB table via TWO valid paths. Both are supported; they serve different cases.

| Path | How | When to use |
|------|-----|-------------|
| **Seed script** (`scripts/seed-protocol-prompts.ts`) | Add a TS string constant and an entry in `PROTOCOLS[]`. Run `npm run seed:protocols` to push to DB. | Foundational protocols that other code depends on by name. Changes benefit from PR review. Must survive DB reset / new dev environments. Load-bearing protocols referenced via `metadata.protocol: "name"` or `loadProtocols: true` filters. |
| **GUI** (Prompt Library → New Prompt) | Paste content, set name/description/tags, save directly to DB. No commit or deploy needed. | Experimental, single-use, or domain-specific protocols. Fast iteration matters more than review. Named uniquely so seed script never touches it. |

**Coexistence works.** The seed script's update logic is `findFirst + update-or-create` keyed on `name`. So GUI-created protocols (e.g., `my-experimental-protocol`) are untouched by `npm run seed:protocols` — only the names the seed script knows about get touched.

**Promotion path.** If a GUI-authored protocol becomes important enough that other code depends on it, copy its content into the seed script as a new string constant and add it to `PROTOCOLS[]`. From that point on, the seed script is the source of truth and the DB row will track any seed-script edits.

### Authoring Rules Apply to BOTH Paths

**This pattern doc (Pattern #45) is the authoritative rule set, regardless of authoring path.** The GUI does NOT validate Handlebars safety, tag correctness, or protocol-specific content rules — it trusts the author. That means:

- If you author via the seed script: you (and PR reviewers) apply this pattern's checklists before merging
- If you author via the GUI: **you must read and apply this pattern before clicking Save**

The GUI form's only validations are length bounds (10 chars min, 50KB max for `promptText`) and basic required-field checks. It will happily save a protocol with nested `{{#if}}` blocks that silently leak both branches at render time. Catching that is on you.

When in doubt, consult this pattern's checklists in Gold Standards 1-6 before saving any prompt.

---

## Quick Reference: Current Protocol Prompts

As of 2026-04-14, both foundational protocols are authored inline in the seed script (`scripts/seed-protocol-prompts.ts`) as TypeScript string constants. The seed script is the single source of truth for THESE two protocols. Additional protocols authored via the GUI are also valid — see "Choosing an Authoring Path" above.

| Name | Tags | Content Source | Chars (v3.2.0 + universal prefix) |
|------|------|---------------|-------|
| `pipeline-orchestrator-protocol` | `mcp, protocol` | Inline `PIPELINE_ORCHESTRATOR_PROTOCOL` in seed script | ~13,000 |
| `artifact-synthesis-protocol` | `mcp, protocol, domain:synthesis` | Inline `ARTIFACT_SYNTHESIS_PROTOCOL` in seed script | ~23,000 |

⚠️ **CORRECTED 2026-08-04**: the preamble is injected ONCE at runtime, not prepended at seed time.
A PIPELINE task loading six protocols previously carried six copies (~30 KB, ~7,600 tokens per turn);
it now carries one. Every protocol-reading agent receives `UNIVERSAL_AGENT_RULES` — cross-cutting rules (turn efficiency, trust-verified-state, never fabricate completion) that apply to any agent reading any protocol. The universal rules are also a TS string constant in the seed script.

**Note (CORRECTED 2026-08-04):** GUI-authored protocols DO now receive the `UNIVERSAL_AGENT_RULES` prefix — runtime injection covers them. The former note said they did not. If a GUI-authored protocol would benefit from those rules, paste them manually at the top of your `promptText`, or consider promoting the protocol to the seed script so it gets the prefix automatically.

## Quick Reference: Prompt Type Decision

```
"Who reads this?"
  ├── Human picks from menu → Interactive prompt
  │     Tags: ['mcp', 'interactive']
  │     Variables: yes, Handlebars: yes (flat only)
  │
  ├── Engine injects into agent → Protocol prompt
  │     Tags: ['mcp', 'protocol']
  │     Variables: no, Handlebars: no (plain markdown)
  │
  └── Workflow engine chains → Workflow prompt
        Tags: ['mcp', 'workflow']
        Variables: optional, Handlebars: optional
```

---

## Related Patterns

- Stack map: `.claude/knowledge/domain/harness/autonomous-delivery-stack.md` — where protocols + templates sit in the full automation stack
- Pattern #44: `agent-template-gold-standard-pattern.md` — Agent template creation standards
- Pattern #46: `orchestration-reactor-pattern.md` — reactor services that fire on protocol-driven state transitions
- `agent-prompt-assembly-pattern.md` — How system/user prompts are assembled at execution time
- `pino-structured-logging-pattern.md` — Logging standards for prompt-related events
