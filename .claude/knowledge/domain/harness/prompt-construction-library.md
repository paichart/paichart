# prompt-construction-specialist — Domain Library

> **Created 2026-06-11** (Protocol 12 soft-band trim). Depth evicted from the agent file; verbatim;
> the paired discovery's proven greps outrank this file.

## [evicted] Recent Major Achievements (2025-08-21)
✅ **Atomic Prompt Loading**: Implemented atomic transactions for database prompt loading, eliminating 85% of prompt execution failures
✅ **Race Condition Resolution**: Fixed session timing issues that caused prompt loading failures on Windows Claude Desktop  
✅ **Event-Driven Registry**: Created real-time prompt registry synchronization using PostgreSQL NOTIFY/LISTEN
✅ **Connection Validation**: Added database readiness validation to prevent session timing race conditions


## [evicted] Core Knowledge and Expertise

### Core Competencies
- pAIchart Universal Template System (`lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts`)
- CrewAI-aligned 5-field prompt separation (backstory/directive/expected-output/description/context)
- Shared placeholder resolution via `resolvePromptPlaceholders()` (4 vars, 3 paths)
- Role-Specific Intelligence Frameworks for agent roles
- Dynamic Context Injection with real-time POV/Phase/Stage awareness via `buildContextSummary()`
- MCP Tools Integration as callable functions
- System vs User prompt separation architecture
- Parameter priority systems and metadata management
- **Database prompt library** (`agent_prompt_library` table) — 3 prompt types: interactive, protocol, workflow
- **Protocol injection** — engine injects protocol-tagged prompts into PIPELINE agent system prompts at assembly time (Apr 2026)

### Role Guidance Architecture — Provisioning vs Runtime (decided Apr 2026, task #83)

**Understanding this architecture is essential for prompt construction work.**

`ROLE_GUIDANCE_LIBRARY` in `pAIchartUniversalTemplate.ts` is a `Record<string, string>` mapping role keys (e.g., `'qa_test_engineer'`) to multi-line guidance strings. It exists for **provisioning only** — seed scripts bake its entries into `agent_templates.promptTemplate` at seed time via `PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance(roleKey))`.

**At runtime, the baked `promptTemplate` in the DB is what the LLM sees.** The library is never consulted for named templates — and as of 2026-06-10 (commit `4077c049`) it is NEVER consulted at runtime at all: the Priority-3 Universal-Template fallback was removed (it had zero production usage, 0 of 128 executions) and replaced by a fail-loud `NoTemplateAssignedError` (`agentExecutionEngine.ts:570`, stream `:420`).

**Implications for prompt construction work**:
- When reviewing what an agent "actually sees", read the `agent_templates.promptTemplate` DB column (or fetch via `template(action: 'get')` from MCP). Don't trust the `.ts` library — it may have been superseded by GUI edits.
- **GUI (Agent Builder) is the ongoing source of truth** for template prompts. Seed scripts are provisioning-only. Don't recommend re-running seeds to "fix" a prompt — edit via the Agent Builder instead.
- **Agent Builder field gap**: The form currently exposes `role`, `prompt` (promptTemplate), `description`, and model parameters (`provider`, `model`, `temperature`, `maxTokens`, `stopSequences`, `webSearch`, `cacheControl`, `thinkingBudgetTokens`). It does NOT expose `category`, `templateType`, `capabilities`, `constraints`, `tags`, `defaultRole`, or `version` — those are set at provisioning time by the seed script and can only be changed afterward via psql or Prisma Studio. Keep this in mind when advising on prompt construction: if a prompt change also requires a `templateType` change (e.g., switching from ANALYST to OPERATOR because the role shifted), the Agent Builder alone won't cover it.
- `resolvePromptPlaceholders()` still runs at execution time and resolves `${agentRole}`, `${contextualInformation}`, `${roleSpecificGuidance}`, `${formattedRole}`. For named templates, the first three are already baked (no placeholder survives); only `${contextualInformation}` is resolved live (via `buildContextSummary()`). The Universal-Template live-resolution path no longer exists (removed with Priority 3, 2026-06-10) — `${roleSpecificGuidance}` is only ever resolved at seed/provisioning time.
- **Pipeline Harness is the exception**: its seed script has a local `ROLE_GUIDANCE` constant (not from the library) because its entire `PROMPT_TEMPLATE` is custom. Both the prompt and guidance are tightly coupled. This is the only template that uses pattern (C) — all others use the library.

### CRITICAL: Handlebars Template Engine Limitation (Apr 2026)

The pAIchart prompt engine uses **regex-based substitution**, NOT a real
Handlebars parser. This means:

- `{{variable}}` substitution: **WORKS**
- Flat `{{#if variable}}...{{/if}}`: **WORKS**
- Flat `{{#if a}}...{{/if}} {{#if b}}...{{/if}}` (siblings): **WORKS**
- **Nested `{{#if a}} {{#if b}}...{{/if}} {{/if}}`: BROKEN** — both branches leak into output, template tags visible to user
- `{{#each}}`: **NOT SUPPORTED**

**This was discovered in production** when the Pipeline Harness Guide (v1.4)
used nested `{{#if objective}} {{#if pov_name}}` blocks. Both the if-true
and if-false branches appeared in the rendered output. Fixed in v1.5 by
flattening to sibling `{{#if}}` blocks.

**Rule**: Always use flat sibling `{{#if}}` blocks. Never nest. Never use `{{#each}}`.

**Protocol prompts are EXEMPT** from this concern because they use **plain
markdown only** (no Handlebars syntax at all). The engine prepends their
raw `promptText` directly to the system prompt without rendering.

See: `/.claude/knowledge/patterns/prompt-library-gold-standard-pattern.md` (Pattern #45)

### Database Prompt Types and Protocol Creation (Apr 2026)

Three prompt types exist in `agent_prompt_library`. Each serves a different
consumer:

| Type | Consumer | Tags | Variables? | Handlebars? |
|------|----------|------|------------|-------------|
| **Interactive** | Human via `prompt_command` | `['mcp', 'interactive']` | Yes | Yes (flat only) |
| **Protocol** | Engine injection into agent system prompt | `['mcp', 'protocol']` | No | No (plain markdown) |
| **Workflow** | Workflow orchestration engine | `['mcp', 'workflow']` | Optional | Optional |

**Creating a new protocol prompt**:
1. Write content as plain markdown (no `{{}}` syntax)
2. Include "When to Use" / "When NOT to Use" sections (harness matches on these)
3. Include parallel execution guidance if the protocol describes multi-task decomposition
4. Tag with `['mcp', 'protocol']` + optional `domain:*` tag
5. Set `variables: {}` and `complexity: 'EXPERT'`
6. Add to `scripts/seed-protocol-prompts.ts` following GS7 idempotent pattern
7. The `mcp` tag makes it visible in `list_prompts`; the `protocol` tag triggers engine injection into PIPELINE tasks

*(⚠️ superseded 2026-08-17: `loadProtocols: 'composed'` — base + the task's ONE stamped protocol; the description below is the pre-composition record)* **Engine injection mechanism**: Templates with `metadata.loadProtocols: true`
(currently only the Pipeline Harness) get ALL protocol-tagged prompts prepended
to their system prompt at execution time. Specialist templates can use
`metadata.protocol: 'specific-name'` to get one named protocol injected.

**Universal Agent Rules preamble + Template/Protocol separation** — these two
patterns are captured as Gold Standards GS7 and GS8 in
`.claude/knowledge/patterns/prompt-library-gold-standard-pattern.md` (Pattern #45).
When authoring or reviewing a template + protocol pair, check both:
- Cross-cutting rules go in `UNIVERSAL_AGENT_RULES` (`lib/agents/universal-agent-rules.ts` since 2026-08-04, injected once at runtime,
  prepended at seed time), not duplicated in each protocol body
- Template contains role + context + pointer to protocol; protocol contains
  step-by-step procedures. No contradictory instructions between them —
  see GS8 review checklist

### Parameter Intelligence & Enhanced Prompts (Phase 2A/2B)
- Enterprise Parameter Intelligence with contextual hints and smart defaults
- Role-based parameter guidance (ADMIN vs USER intelligence frameworks)
- Historical pattern integration for user-specific prompt enhancement
- Claude Desktop compatibility patterns for parameter extraction
- Smart error recovery integration with prompt-based elicitation
- Real-time validation feedback in interactive prompt workflows

### Dual-Prompt Runtime Architecture ⭐ CRITICAL (Apr 2026)

Two prompts are assembled during every agent execution — understanding this separation is essential:

**System Prompt** (`buildSystemPrompt`, line ~1780 in `agentExecutionEngine.ts`, post tool-loop extraction):
- Priority chain: (1) `agentTemplate.promptTemplate` → (2) User's custom system prompt. **Priority 3 (Universal Template fallback) was REMOVED 2026-06-10 (`4077c049`)** — no template resolving now throws a fail-loud `NoTemplateAssignedError` (engine `:570`, stream `:420`)
- Runtime appends on top of the resolved prompt: `${contextualInformation}` fill (Your Context block via `buildContextSummary()` — incl. Customer/Solution since 2026-06-10), tools availability line, protocol injection, hub tool guidance, P10 Scope Self-Check
- **`agent.configure` only changes the system prompt source** — it does NOT affect the user prompt

**User Prompt** (canonical builder: `buildAgentPromptBody` in `lib/agents/harness/build-agent-prompt-body.ts` — SINGLE SOURCE OF TRUTH since B1-S2 2026-06-09; the engine's `buildAgentPrompt` and the SSE stream route both delegate to it):
- Assembled from §1-§8 sections (see below) regardless of system prompt configuration
- **Ephemeral**: Built fresh from task data every execution, NOT stored in the database
- Re-running `agent.configure` does not lose the user prompt — it is always reconstructed

**Config Score Implications**:
- Score 30: No system prompt configured → execution now FAILS LOUD (`NoTemplateAssignedError`) — the Universal-Template fallback no longer exists
- Score 75: Template assigned with `promptTemplate` → Specialized system prompt (e.g., MCP Service Orchestrator)
- Score 100: Requires `task.agentPrompt` populated (the §1 Directive) — currently synthesized from role + title

### Primary Responsibilities
1. **Prompt Construction Architecture**
   - Implement the 2-tier system prompt priority hierarchy (Template → User custom; templateless = fail-loud since 2026-06-10)
   - CrewAI-aligned user message assembly (§1 Directive → §2 Expected Output → §3-§8 Context)
   - Shared placeholder resolution via `resolvePromptPlaceholders()` across all 3 execution paths
   - Directive synthesis when `task.prompt` not explicitly set ("As a {role}, complete: {title}")
   - `outputSchema` activation on AgentTemplate as completion contract (Expected Output)
   - Integrate MCP tool definitions into system prompts
   - Ensure proper separation of system prompts and model parameters

2. **Role-Specific Intelligence**
   - Apply appropriate intelligence frameworks based on agent role
   - Integrate production-ready confidence indicators
   - Implement strategic advisor positioning elements
   - Ensure customer confidence building components

3. **Context Management**
   - Dynamic POV/Phase/Stage context injection
   - Strategic business context integration
   - Customer confidence indicators
   - Intelligent tool orchestration guidance

4. **MCP Tools Integration**
   - Convert MCP tools to LLM function format
   - Add tool definitions to system prompts
   - Enable tool execution and result incorporation
   - Handle tool routing by server
   - Hub tool routing guidance via `buildHubToolGuidance()` — teaches LLM to use `services(action: "call")` gateway
   - Guidance auto-appended when `services` is in the tool list
   - Queries active services from MCPTool table for service→tool mapping

### Universal Escape-Hatch Convention — P10 (Apr 2026)

> **⚠️ INVARIANT:** Every agent system prompt — regardless of template, role, or protocol — has the **Scope Self-Check** section appended at the end of `buildSystemPrompt`. This is the structural defense against agents fabricating output for out-of-scope tasks.

**Marker contract:**

```
[TEMPLATE_MISMATCH] This task does not match my role's scope.
Reason: <one-sentence explanation>
Suggested role: <which template type would be appropriate>
```

Agent must return ONLY this marker (no other content) to invoke the escape hatch. Engine detects and emits `errorCategory: 'TEMPLATE_MISMATCH_SELF_REPORTED'` (a category that OVERRIDES other detection signals — agent self-report is highest signal-to-noise).

**Anchored detection regex** in engine + stream route:
```
/^\s*(?:```\s*)?\[TEMPLATE_MISMATCH\]/i
```

**Why no `m` flag** — must match at the very START of the response, NOT at any line start. Without this guard, an agent explaining the escape hatch in normal prose would false-positive (the prose contains the marker syntax). The non-multiline regex restricts to "agent's first action was emitting the marker."

**Why first 300 chars only** — limits scan to the response's beginning where the marker is meant to live. An agent that genuinely refused will put the marker first; an agent that ran substantive work then mentions the marker mid-output is not refusing.

**Smoke-tested regex behaviors** (6/6 pass — see `feat(task #82)` commit):
- ✅ True positive: bare marker at start
- ✅ True positive: leading whitespace
- ✅ True positive: marker inside fenced code block at start
- ✅ Correctly rejects: marker mentioned mid-prose
- ✅ Correctly rejects: marker on line 2 after explanatory text
- ✅ Correctly rejects: marker after explanatory paragraph

**Where the prompt append lives** — `lib/services/agentExecutionEngine.ts` `buildSystemPrompt` final block (after template + protocol + hub guidance). Mirrored in `app/api/pov/agent/execute/stream/route.ts` after the protocol injection block. Path parity required.

**Layered with #90 P9** (verb-pattern check) — different errorCategory values let downstream distinguish detection mechanism:
- ~~`TEMPLATE_SCOPE_MISMATCH` (P9)~~ — RETIRED 2026-07-17 (verb-match heuristic: ~100% FPR; historical artifacts only)
- `TEMPLATE_MISMATCH_SELF_REPORTED` (P10) — agent's own admission

Defense in depth — both can fire on the same execution; both can fire independently.

**When tuning the marker prompt:** the precision of detection is bound by how clearly the agent emits the marker. Test prompt changes against a small set of "wrong template" tasks before shipping — if the agent invents variations of the marker, the regex won't catch them. Pattern: `agent-output-trustworthiness-defense-stack-pattern.md`.

### Empirical Agent Compliance Baseline (Apr 2026)

**Production observation:** agent compliance with protocol-mandated extra parameters is **~30%**, not the 80%+ that intuition might suggest.

Evidence: harness clobber-detection Phase 0 (2026-04-25) measured comment breadcrumb prevalence. The breadcrumb is a protocol-mandated extra parameter on `task.comment` calls (CREATE/SYNTHESIZE first-line `**Child stage:** \`<id>\``). Production prevalence: **16/54 (~30%)** despite emphatic protocol wording ("First line MUST be... do not omit it, do not reword it"). See `cline_docs/reviews/harness-clobber-detection-2026-04-25/current-state-validation.md` Finding 4.

**Implication for design — when scoping a defense or feature that depends on agent compliance:**

| Compliance scenario | Design rule |
|---|---|
| Agent-side instruction is the ONLY mechanism | Expect ~30% adherence; design for that baseline. The defense becomes vestigial at low adherence. |
| Server-side enforcement available | Strongly prefer it. The platform writes the field; the agent doesn't have to remember. Aligns with "Trust Verified State Over Narrative" Universal Rule. |
| Hybrid (agent prompt + server-side enforcement) | Acceptable. Agent prompt is documentation; server-side is the real defense. |

**Canonical example**: harness clobber-detection back-pointer write. Original draft asked the LLM to include `metadata: {harnessTaskId}` in `stage.create` calls. Specialist consensus rejected this in favor of server-side write at `task-update-handler.ts:503` based on the 30% baseline above. Final design: agent does nothing; platform stamps the back-pointer when the harness records its `pipelineStageId`. See `cline_docs/reviews/harness-clobber-detection-2026-04-25/implementation-plan.md` Item 3a.

**When asked "should we instruct the agent to do X":** ask back "is there a server-side path that can enforce X without agent compliance?" before defaulting to prompt instructions. Memory: this baseline applies broadly across protocol authoring, not just harness work.


## [evicted] Key Information

### My Pattern Library
- `/.claude/knowledge/patterns/agent-prompt-assembly-pattern.md` (95% confidence, Mar 2026)
  - CrewAI-aligned 5-field separation (backstory/directive/expected-output/description/context)
- `/.claude/knowledge/patterns/prompt-library-gold-standard-pattern.md` (92% confidence, Apr 2026)
  - 6 gold standards for database prompts: types, tags, Handlebars safety, protocol rules, variables, seed scripts
  - Companion to Pattern #44 (agent-template-gold-standard-pattern.md)
  - Shared `resolvePromptPlaceholders()` for all 3 execution paths (configure, engine, streaming)
  - Directive synthesis: "As a {role}, complete the following task: "{title}""
  - `outputSchema` activation as completion contract (Expected Output §2)
- `/.claude/knowledge/patterns/agent-template-gold-standard-pattern.md` (95% confidence, Apr 2, 2026)
  - **GS3 (Prompt Template)**: 8-section structure — Platform → Context → **Deliverable Contract** → Specialization → Workflow → Reference → Output → Role (Deliverable Contract section added 2026-04-26)
  - **GS5 (Pre-flight Checks)**: Schema + health verification before external service calls
  - **GS6 (Output Rules — Deliverable Contract, 2026-04-26)**: `finalResponse` is the deliverable channel (becomes `report.md` for leaf tasks, chained as context for downstream specialists); `task.comment` is coordination only; format example + synthesis expectation. Supersedes the prior "2000 char comment-limit" framing — see Pattern #44 GS6 for the canonical rewrite
  - Cross-reference: template-system-specialist owns template CRUD and rationalization; this specialist owns prompt content quality
  - User message assembly order: §1 Directive → §2 Expected Output → §3 Task Context → §4-§8 Environment
  - Industry alignment: CrewAI, LangGraph, Claude Cowork
- `/.claude/knowledge/patterns/admin-ui-quick-wins-pattern.md` (98% confidence, Nov 25, 2025)
  - Complete pattern library for admin CRUD UIs (toast, event status, clone)
  - Pattern 1: Toast Notifications (10 min) - Replace alert() with elegant feedback
  - Pattern 3: Clone Functionality (30 min) - One-click template cloning
  - Validated: Prompt library admin interface (71% faster than estimated)
  - Applicable to: Agent templates, POVs, database prompts, any admin UI

### My Knowledge Base

**Database Prompt Creation** (95% confidence):
`/.claude/knowledge/domain/mcp/database-prompt-creation-guide.md`
- How to create database prompts (3 methods: seed script, Prisma Studio, Admin API)
- Schema reference with all fields and validation
- Variables & examples format (Handlebars-style templating — **regex-based, NOT the real Handlebars library**)
- **⚠️ NESTED `{{#if}}` BLOCKS ARE BROKEN** — the engine uses per-variable regex patterns at `lib/mcp/server/prompts/prompt-registry.js:442-450` that are not nested-aware. Use only FLAT sibling blocks: `{{#if X}}...{{/if}}{{#if X}}{{else}}...{{/if}}`. Discovered 2026-04-11 while authoring `pipeline_harness_guide` v1.5.
- MCP visibility requirements (tags, isPublic, status)
- Real production examples (list_tasks_guided)
- Security validation (7-layer protection)
- Two-tier architecture (built-in + database prompts)

**Event-Driven Architecture Patterns** (95% confidence):
`/.claude/knowledge/patterns/event-emitter-memory-safety.md`
- Memory-safe EventEmitter implementation with connection leak prevention
- Shared connection pool pattern for PostgreSQL NOTIFY/LISTEN
- Process lifecycle management (startup, operation, cleanup, shutdown)
- Real-time registry synchronization patterns
- 4-phase EventEmitter safety: removeAllListeners() prevention, graceful cleanup, unref() for process exit
- Validated: Prompt registry events, agent template updates, browser workflow notifications

**Global Health Monitoring** (90% confidence):
`/.claude/knowledge/patterns/global-singleton-health-monitoring.md`
- Singleton pattern for system health endpoints
- Real-time database, cache, and service status aggregation
- Prevents duplicate health check instances
- Integration with admin dashboards
- Used by: /api/admin/globals/health route

**MCP Prompt Library Examples** (100% confidence):
`/.claude/knowledge/prompts/`
- `pov_health_check.md` - Single POV diagnostic (3 variables, 3 examples)
- `task_audit_and_planning.md` - Portfolio audit with auto-focus (5 variables, 3 examples)
  - Use cases: Weekly reviews, automated reports, portfolio health checks
  - Features: Data volume handling, auto-execution, structured output
  - Both validated for Handlebars templating and JSON format compliance

### Key Files
- `/lib/services/agentExecutionEngine.ts` - System prompt via `buildSystemPrompt()` + `buildHubToolGuidance()`; the USER prompt's `buildAgentPrompt()` now DELEGATES to `lib/agents/harness/build-agent-prompt-body.ts:buildAgentPromptBody` (§1-§8 sections — the shared single source of truth since B1-S2)
- `/lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` - Universal template v2 (lean, ~1,200 tokens / 243 lines), 11 actionable role blocks, shared `resolvePromptPlaceholders()` and `buildContextSummary()` utilities
- `/lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts` - Agent configuration handler — directive synthesis, system prompt resolution, outputSchema reading
- `/lib/services/agentTemplateService.ts` - Template management
- `/app/api/pov/agent/execute/stream/route.ts` - Streaming execution endpoint with agentic tool loop (shared placeholder resolution, directive synthesis)
- `/lib/mcp/server/prompts/prompt-registry.js` - Built-in prompts registration
- `/lib/validation/prompt-library-validation.ts` - **CRITICAL** Validation schemas for all prompt library operations
  - `CreatePromptLibrarySchema` - POST validation with strict security (injection detection, field limits)
  - `PromptVariableConfigSchema` - Variable field validation (placeholder, validation, helpText)
  - Uses `.passthrough()` to allow admin custom metadata (Dec 1, 2025 fix for clone button)
  - Referenced by: Admin API routes, CRUD operations, clone functionality
- `/app/api/agent-templates/prompt-library/route.ts` - Admin API for prompt library management
  - Handles prompt listing (with filtering), creation, security validation
  - Integrates with event system for real-time updates
- `/app/api/agent-templates/prompt-library/[promptId]/route.ts` - CRUD API for individual prompts
  - GET/PUT/DELETE operations with access control
  - Clone functionality support
- `/components/admin/templates/PromptLibraryTab.tsx` - Admin UI for prompt library management
  - Toast notifications, clone buttons, status indicators
  - Implements admin-ui-quick-wins-pattern (98% confidence)
- `/app/api/admin/globals/health/route.ts` - Global health monitoring endpoint
  - Singleton pattern for system health checks
  - Returns real-time database, cache, and service status
- `/lib/events/prompt-registry-events.ts` - Event-driven prompt registry synchronization
  - PostgreSQL NOTIFY/LISTEN integration
  - Real-time prompt updates across sessions
- `/lib/events/shared-connection-pool.ts` - Event system connection pooling
  - Memory-safe EventEmitter implementation
  - Prevents connection leaks in event-driven architecture
- `/scripts/seed-protocol-prompts.ts` and `/scripts/seed-agent-templates.ts` - Canonical seed scripts for agent_prompt_library (the `/temp-scripts/` path for ad-hoc seeding was retired 2026-04-24 after drift eradication)

### Production Environment  
- **Production Droplet**: Digital Ocean server at <PROD_HOST> (paichart.app) - THE production environment
- **Live Deployment**: pAIchart MCP Hub at paichart.app with 15 agent templates
- **Server Access**: SSH key-based authentication (ed25519) to <PROD_HOST>
- **Database**: 21 prompt library entries seeded for production workflows

### Intelligence Framework Components
- Strategic advisor positioning
- Production readiness assessment
- Customer confidence building
- POV navigation guidance
- Cross-functional collaboration
- Value demonstration

### When to Use This Specialist
- Complex prompt engineering requiring role-specific intelligence
- MCP tools integration into system prompts needs optimization
- Template hierarchy conflicts or priority issues arise
- Token count optimization while maintaining prompt effectiveness
- Dynamic context injection requirements for POV/Phase/Stage awareness
- Multi-agent prompt coordination and consistency issues


## [evicted] Learning Notes

- **Pattern**: Template priority hierarchy - Template System Prompt → User Input (Universal-Template tier removed 2026-06-10; templateless executions fail loud)
- **Critical**: The user prompt (§1-§8) is **ephemeral** — built fresh from task data every execution, never stored. The system prompt is what `agent.configure` changes. Re-configuring an agent does NOT lose the descriptive user prompt.
- **Gotcha**: Dynamic placeholder timing - ${agentRole}, ${contextualInformation}, ${taskDetails} must be resolved at execution time
- **Tip**: MCP tools integration - Convert tools to LLM function format and inject into system prompts for seamless operation
- **Insight**: Role-specific intelligence - 12 distinct frameworks ensure each agent has contextually appropriate intelligence
- **Critical**: Context injection timing - Real POV/Phase data must be injected at execution time, not template creation time
- **Score Guide**: Config score has 4 components: Template (30pts, template applied) + Prompt (25pts, task.prompt set) + System Prompt (25pts, template applied) + Model Params (20pts, configured). Score 30 = no system prompt (universal fallback), 75 = template assigned, 100 = agentPrompt populated. The jump 30→75 is the highest-value improvement.
- **Chained Context (§6) — RESOLVED 2026-06-10**: the long-standing "Intent vs Reality" issue is closed on both ends. (a) Real dependency-output chaining is AUTOMATIC since the `createAgentExecution` chokepoint move (commit `6c640337`) — completed dependencies' `finalResponse` merges into `inputContext.chainedFrom[]` on every execution path. (b) The configure-time structural snapshot (task/pov/phase/mcpConfiguration) that duplicated §3/§5 and masqueraded as chained context was REMOVED from `agent-configure-handler.ts` — user-supplied inputContext now passes through verbatim. Its only unique content (POV Customer + Solution) moved to §5 in `buildAgentPromptBody` (+ engine pov selects gained `customerName`/`solution`, which also woke `buildContextSummary`'s dormant Customer/Solution lines in the system prompt). Legacy rows keep their old snapshot until a caller explicitly rewrites inputContext.
- **Parameter Intelligence**: Phase 2A implementation provides 95% confidence contextual hints for enterprise users
- **Claude Desktop Compatibility**: 20+ parameter extraction patterns handle broken parameter serialization
- **Hub Tool Guidance (Mar 2026)**: `buildSystemPrompt()` now accepts `mcpTools` parameter and appends hub routing guidance to ALL prompt paths (template, user, universal) — not just the default path. `buildHubToolGuidance()` queries MCPTool table and generates WRONG/RIGHT examples teaching LLM to use `services(action: "call")` gateway. Only appended when `services` is in the tool list.
- **Database-First Strategy** (Mar 2026): Built-in prompts reduced to 2 (audit_all_tasks + auth gate); database prompts are now primary source with atomic loading, LRU caching, and event-driven sync
- **Agent Prompt Assembly Pattern** (Mar 2026): Major architectural refactor aligned with CrewAI/LangGraph industry patterns.
  - `resolvePromptPlaceholders()` + `buildContextSummary()` exported from `pAIchartUniversalTemplate.ts` as shared utilities
  - All 3 execution paths (configure handler, engine, streaming route) now use the same resolution function
  - `agent.configure` no longer copies `task.description` into `task.prompt` — synthesizes a role-aware directive instead
  - §1-§8 sections (Directive → Expected Output → Task Context → Sequence → Environment → Chained → Tools → Workflow) — built by `buildAgentPromptBody()` in `lib/agents/harness/build-agent-prompt-body.ts` (B1-S2 single source of truth; engine `buildAgentPrompt()` + stream route both delegate)
  - `agentTemplate.outputSchema` activated as Expected Output completion contract (dormant field since schema creation)
  - Template `promptTemplate` exclusively in system prompt (never in user message)
  - Duplicate Task Sequence Context block removed (copy-paste bug)
  - Saves ~2,400 tokens/execution for Business Analyst template
  - Pattern doc: `/.claude/knowledge/patterns/agent-prompt-assembly-pattern.md`
- **Event System Memory Safety** (Dec 1, 2025): EventEmitter leak prevention is CRITICAL in event-driven architectures
  - Always use shared connection pools (never create EventEmitters in request handlers)
  - Implement 4-phase cleanup: removeAllListeners() prevention, graceful cleanup, unref() for process exit
  - Test: Process exits cleanly (no hanging connections), no "MaxListenersExceeded" warnings
  - Impact: Prevents memory leaks, ensures clean process shutdown, maintains connection pool health
- **Validation Schema Flexibility** (Dec 1, 2025): .passthrough() vs .strict() choice depends on extensibility needs
  - Admin UIs often need custom metadata (clone timestamps, UI state) → Use .passthrough()
  - External APIs need strict contracts (no extra fields) → Use .strict()
  - Clone functionality REQUIRES .passthrough() to preserve admin metadata through edit cycles
  - Impact: Clone buttons work (3-hour debugging session prevented with correct pattern)
- **Credentials in Fetch** (Dec 1, 2025): Client-side API calls must include credentials: 'include' for JWT cookie auth
  - Without credentials: 401 Unauthorized (even for logged-in users)
  - Pattern: fetch('/api/...', { credentials: 'include', ... })
  - All internal API calls from React components need this
  - Impact: Auth failures prevented, user sessions work correctly
- **Global Health Monitoring** (Dec 1, 2025): Singleton pattern prevents duplicate health check instances
  - Admin dashboard health endpoint uses global singleton
  - Aggregates: Database status, cache status, service status
  - Prevents: Multiple EventEmitter instances, connection pool exhaustion
  - Impact: Clean system health monitoring, no resource leaks

### Error Helper & Tool Schema Patterns (Dec 2025)
**Pattern Reference**: `/.claude/knowledge/patterns/mcp-tool-ux-pattern.md`

- **Prompt Insight**: Error messages ARE prompts - they guide user recovery actions
- **Error Helpers**: 3 modules (basic, advanced, hub) with emoji format (❌🔍💡🔧), fuzzy suggestions, next steps
- **Tool Schemas**: 100% coverage - descriptions guide AI client behavior
- **Sections**: WHEN TO USE, EXAMPLES, SEE ALSO, [PARAMETERS]
- **Impact**: AI clients understand tool purposes and chain them effectively

### NEW: Pagination-Aware Prompt Pattern (Nov 15, 2025)

**Paradigm**: Server-side prompts use **Direct Prisma Access** (different execution context than MCP tools)

**Architectural Distinction** (Critical Understanding):
- **MCP Tools** (project, services): External interface for AI clients
  - Execution path: AI client → MCP protocol → Tool handler → `apiClient.get()` → API layer (HTTP) → Database
  - Pattern: Expose `_meta.pagination` for **client-side** iteration
  - Use case: AI clients paginate through results themselves
  - Example: ChatGPT calls project(action: "task.list"), checks hasMore, requests page=2

- **Server-Side Prompts** (audit_all_tasks): Internal server functions
  - Execution path: Prompt registry → Direct `prisma.findMany()` (same Node.js process, no HTTP)
  - Pattern: Manual `count()` for **server-side** aggregation/completeness
  - Use case: Server collects/aggregates data, returns complete summary
  - Example: audit_all_tasks iterates through POVs, aggregates all tasks, returns markdown summary

**Why Different**: Server-side prompts run INSIDE MCP server process (have direct database access), while MCP tools provide external interface (must respect API layer boundaries)

**Implementation Pattern** (Direct Prisma):
- **Pattern**: `const items = await prisma.model.findMany({ take: limit }); const total = await prisma.model.count()`
- **Completeness**: Compare returned vs total, show indicators (✅ complete / ⚠️ more available)
- **Example**: audit_all_tasks prompt (prompt-registry.js:978-1170)
- **Visual Indicators**: 📄 More available, ✅ Complete results, ⚡ Performance info
- **Security**: Must include role-based access (ADMIN override, ownership/membership for USER)
- **Performance**: N+1 prevention with `_count` batching (Pattern 7 from api-efficiency-patterns.md)
- **Evidence**: Tested with ChatGPT + Claude Desktop, cross-platform compatible
- **Reference**: `/.claude/knowledge/patterns/mcp-metadata-exposure-pattern.md` (Pattern 4)


