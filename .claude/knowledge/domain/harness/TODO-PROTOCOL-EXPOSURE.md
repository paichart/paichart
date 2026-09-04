# TODO: Protocol-as-Resource Architecture — Plug-and-Play Harness Orchestration

**Created**: 2026-04-07
**Updated**: 2026-04-10 (expanded scope: standard harness as protocol + architectural context)
**Status**: Not started
**Estimated effort**: ~2-3 hours (Parts A-D with both protocols + local test)
**Owner**: TBD

---

## TL;DR — What This Changes and Why It Matters

Today the Pipeline Harness's orchestration intelligence is **hardcoded** in
a TypeScript template (`pAIchartUniversalTemplate.ts`, 9 bullets of role
guidance at line ~218). To change how the harness plans, you edit TypeScript,
re-seed the template, redeploy. Every harness execution uses the same
planning strategy regardless of what kind of work the objective describes.

After this TODO ships, the harness's planning strategy becomes a **swappable
markdown document** that the harness reads at runtime via MCP `resources/read`.
Different objective types get different planning protocols. Edit a markdown
file → next harness execution uses the updated strategy. No re-seeding, no
code deploy.

**Concrete example of the before/after**:

| | Before | After |
|---|---|---|
| Objective: "Assess cloud security" | Harness uses its 9 hardcoded bullets → ad-hoc decomposition | Harness reads `mcp://hub/protocols/pipeline-orchestrator` → structured default decomposition |
| Objective: "Produce a case study from session history" | Harness uses the same 9 bullets → ad-hoc decomposition (doesn't know about the 7-phase synthesis workflow) | Harness recognizes the trigger phrase → reads `mcp://hub/protocols/lived-experience-to-artifact` → decomposes into 7 protocol phases with purpose-built specialists |
| Adding a new orchestration strategy | Edit TypeScript, re-seed template, redeploy | Write a markdown protocol file, add one entry to `listResources()`, done |

---

## Key Architectural Concept: Protocol vs Engine

Understanding this separation is critical. The Pipeline Harness has two
layers that do different things:

**Protocol (the planning strategy)** — "How do I decompose this objective
into tasks? What phases? What order? What does 'done' look like per phase?"

This is what the LLM reasons about when planning. Today it's 9 bullets in
a TypeScript template. After this TODO it's a markdown document the LLM
reads at runtime. Different protocols describe different planning strategies
(sequential 7-phase synthesis, parallel security audit, iterative review
cycle, etc.).

**Engine (the execution mechanics)** — "Create a task row in the DB, call
Anthropic, stream the results, chain outputs between tasks, monitor for
completion."

This is code (`agentExecutionEngine.ts`, `agentTaskService.ts`). It's the
same regardless of which protocol is active. It doesn't know or care about
phases or strategies — it just executes tasks in dependency order, passes
context forward, and reports results.

**The protocol is the strategy. The engine is the mechanics. This TODO
makes the strategy swappable while the engine stays fixed.**

This means future orchestration patterns (parallel fan-out, iterative
review loops, etc.) only need:
1. A new protocol markdown file describing the strategy
2. The minimum engine extension required (if any — parallel fan-out already
   works via the existing dependency system)

You never rewrite the execution engine. You extend it.

---

## How This Affects the Current Standard Harness

The standard Pipeline Harness template (`pipeline_harness_orchestrator` in
`pAIchartUniversalTemplate.ts`) currently has 9 role-guidance bullets that
tell the LLM how to orchestrate. These bullets cover:

1. POV objective as north star
2. Read all sibling tasks before planning
3. Create a pipeline stage for child tasks
4. Decompose into 3-7 child tasks with clear done criteria
5. Wire dependencies for sequential execution
6. Assign specialist templates by type matching
7. Execute tasks in dependency order
8. Chain context between tasks (result.json of task A → input of task B)
9. Report aggregate confidence when all tasks complete

**What changes**: These 9 bullets get extracted into
`.claude/knowledge/protocols/pipeline-orchestrator-protocol.md` and exposed
as `mcp://hub/protocols/pipeline-orchestrator`. The harness's role guidance
becomes a single line: "Read your orchestration protocol at
`mcp://hub/protocols/pipeline-orchestrator` before planning."

**What does NOT change**:
- The execution engine (no code changes to `agentExecutionEngine.ts`)
- The template seeding pattern (still use `seed-harness-template.ts`)
- The task dependency system
- Context chaining between tasks
- Template type-based assignment (ANALYST, REVIEWER, DOCUMENTER, etc.)
- The MCP tool interface (`perform(action: "agent.execute", ...)`)

**Risk**: If `resources/read` fails (e.g., file missing, MCP resource
provider down), the harness would lose its planning guidance. Mitigation:
the role guidance still includes a minimal fallback: "If the protocol
resource is unavailable, decompose the objective into 3-5 sequential tasks
using your best judgment." The protocol enhances planning; its absence
degrades to the current ad-hoc behavior, not to failure.

---

## What This Does NOT Do (Future Roadmap, Not Current Scope)

These were considered during architectural discussion (2026-04-10) and
explicitly deferred. Documenting them here so the boundaries are clear.

### Multiple harness execution models (LangGraph, AutoGen, etc.)

The current harness is sequential with dependency-based ordering. Future
orchestration patterns might include:

| Pattern | What it enables | Engine change needed? |
|---|---|---|
| **Parallel fan-out/fan-in** | Tasks A and B run simultaneously, task C waits for both | ❌ None — dependency system + Promise.allSettled already support this. Only the protocol needs to tell the harness "create tasks without dependencies when they're independent." |
| **Conditional branching** | Execute task B if condition X, task C if condition Y | ✅ Small — engine needs a "skip this task" capability based on a condition evaluated from the prior task's output |
| **Iterative looping** | Reviewer says "not good enough" → send back to integrator | ✅ Medium — engine needs "re-execute task" or "create follow-up task" capability |
| **Agent-to-agent handoff** | Specialist A spawns specialist B mid-execution | ✅ Large + dangerous — introduces recursion, unbounded cost, debugging nightmares |

**Decision**: None of these require engine work today. The protocol-as-resource
pattern IS the extension point for all of them. When a concrete use case
arises, write the protocol, extend the engine minimally, ship.

**Gate for agent-to-agent handoff**: Do not implement until:
- 10+ successful pipeline runs at 85%+ average confidence
- A concrete use case where single-level orchestration demonstrably fails
- A "recommend, don't spawn" pattern is validated (specialists recommend
  follow-up tasks; the harness decides whether to approve)

### Exposing protocols as MCP prompts (user-facing)

MCP prompts appear in Claude Desktop's "+" menu. Protocols could be exposed
as prompts too, for human SEs who want to manually follow a protocol's
phases. This is a separate future task — the resource exposure in this TODO
is the agent-facing path (programmatic `resources/read`), not the human-
facing path (conversation injection via prompts).

---

## Objective (Updated)

Two protocols exposed as MCP resources, both readable by the Pipeline
Harness and any specialist agents:

1. **`mcp://hub/protocols/pipeline-orchestrator`** — the standard harness
   planning strategy (extracted from the current 9-bullet role guidance).
   This is the DEFAULT protocol the harness reads for any objective that
   doesn't match a domain-specific trigger.

2. **`mcp://hub/protocols/lived-experience-to-artifact`** — the 7-phase
   synthesis workflow for producing polished artifacts from raw session
   history. This is the FIRST domain-specific protocol, loaded when the
   objective matches "transforming raw experience into a deliverable."

The Pipeline Harness's role guidance is updated to:
- Read its default protocol at startup
- Recognize domain-specific trigger phrases and read the matching protocol
- Fall back to ad-hoc planning if no protocol resource is available

This is the **smallest possible validation** of the plug-and-play protocol
pattern. If both protocols work, adding a third (e.g., `security-audit-
pipeline`) is: write a markdown file, add one entry to `listResources()`.

---

## Scope Summary (Updated)

| Part | What | Effort | Dependencies |
|---|---|---|---|
| **A** | Add `getProtocolDocument()` to `HubResourceProvider` + expose both protocols in `listResources()` | ~45 min | None |
| **B** | Extract standard harness guidance into protocol markdown + update role guidance to read it | ~30 min | A |
| **C** | Local test (both protocols readable, path traversal defended, harness behavior unchanged) | ~30 min | A + B |
| **D** | Deploy + production verification | ~15 min | C |
| **E** | *(Separate session)* Build 3 synthesis specialist templates for the lived-experience protocol | ~2-3 hours | A-D validated |

Parts A-D ship together. Part E ships separately after A-D is validated
in production.

## Why a Resource (Not a Prompt)

MCP prompts are user-facing — they appear in Claude Desktop's "+" button menu and inject text into a conversation as a user-turn message. MCP resources are agent-facing — they are URI-addressable data that agents can read programmatically via `resources/read`. The Pipeline Harness needs the *agent-facing* path because it consults the protocol as part of its planning, not as something a human selects from a menu.

A separate (optional, deferred) future task could also expose the protocol as an MCP prompt for human SE discovery. That is **not** in scope for this TODO.

## Why HubResourceProvider (Not SimpleResourceManager)

`HubResourceProvider` (`lib/mcp/server/resources/hub-resources.js`) is the right home for **static, hand-curated resources** with hardcoded URIs — things that exist by virtue of being declared, not by being discovered from the database. The existing static resources in `HubResourceProvider` are the security compliance summary, the analytics rollups, and the workflow templates. The protocol document is the same kind of thing: a stable, hand-maintained markdown file that should always be available at a known URI.

`SimpleResourceManager` (`lib/mcp/simple-resource-manager.js`) is for **dynamic resources** discovered from the database — agent artifacts, execution records, browser workflows. Resources there have a 10-minute TTL and are registered via `discoverArtifactResources()` and similar methods. That model is wrong for a protocol document: it does not need to expire, it does not come from the database, and there is no discovery query that would find it.

## What HubResourceProvider Does Today

`HubResourceProvider` is a class in `lib/mcp/server/resources/hub-resources.js` (532 lines) with two public methods that the MCP server calls:

- **`listResources()`** — returns an array of resource descriptors (URI, name, description, mimeType). This is the array Claude Desktop sees when it sends `resources/list`. Currently returns 9 entries, all under the `mcp://hub/...` URI namespace. New entries are added by appending to the literal array at lines 43-98.

- **`readResource(uri)`** — receives a URI string, parses it, routes to a private handler method based on the path, and returns a `{contents: [...]}` object. The router is a chain of `if/else if` statements at lines 121-135. New URI patterns are added by inserting a new branch.

The class is instantiated once at MCP server startup (`mcp-server-http-clean.js`) and is wired into the JSON-RPC `resources/list` and `resources/read` handlers. After the MCP server restarts, any new resources declared in `listResources()` immediately appear in Claude Desktop's resource list and can be read via `resources/read`.

The closest existing precedent for what we are about to add is `getSecurityCompliance()` at line 419 — a method that returns a hardcoded `contents` array with no Prisma query, no pagination, no auth check. The protocol resource will follow the same shape, with the difference that its content comes from a file on disk rather than a JavaScript object literal.

---

## Implementation Checklist

### Part A — Add protocol resources to HubResourceProvider

- [ ] **A1.** Add `fs` and `path` requires to the top of `lib/mcp/server/resources/hub-resources.js` (after line 11). Two lines:
  ```js
  const fs = require('fs');
  const path = require('path');
  ```
  These are needed because the protocol content lives on disk and must be read at request time. We do *not* want to read the file at module load time (that would mean a server restart is required to pick up protocol edits).

- [ ] **A2.** Append **two** resource descriptors to the array returned by `listResources()` (`hub-resources.js`, after line 97 — i.e., after the closing brace of the `mcp://hub/security` entry, before the `]` that closes the array at line 98):
  ```js
  ,
  {
    uri: 'mcp://hub/protocols/pipeline-orchestrator',
    name: 'Pipeline Orchestrator Protocol (Default)',
    description: 'Standard planning strategy for the Pipeline Harness. Covers objective decomposition into 3-7 tasks, dependency wiring, template assignment by type, context chaining, and confidence aggregation. This is the DEFAULT protocol — the harness reads it for any objective that does not match a domain-specific protocol trigger.',
    mimeType: 'text/markdown'
  },
  {
    uri: 'mcp://hub/protocols/lived-experience-to-artifact',
    name: 'Lived-Experience-to-Artifact Synthesis Protocol',
    description: 'Seven-phase workflow for transforming raw session history (war stories, debugging logs, decision records) into a polished external artifact (whitepaper, case study, blog post). Use when an objective involves producing a structured deliverable from unstructured experience.',
    mimeType: 'text/markdown'
  }
  ```
  The `description` fields are the most important part — they're what the harness's planner reads when deciding which protocol to use. The pipeline-orchestrator is the DEFAULT; the lived-experience protocol is triggered by a specific phrase match.

- [ ] **A3.** Add a new branch to the router in `readResource()` (`hub-resources.js`, after line 132 `else if (path === 'security')` and before line 134 `} else {`). Two lines:
  ```js
  } else if (path.startsWith('protocols/')) {
    return this.getProtocolDocument(path.replace('protocols/', ''));
  ```
  This makes the URI namespace `mcp://hub/protocols/[name]` extensible — adding a future protocol does not require touching the router again, only adding a new entry to `listResources()` and a new file in the protocols directory.

- [ ] **A4.** Add a new method `getProtocolDocument(protocolName)` to the class. Insert it immediately after `getSecurityCompliance()` ends (`hub-resources.js`, currently around line 530 — find the closing brace of `getSecurityCompliance()` and add the new method before the class's closing brace). Approximately 25 lines:
  ```js
  /**
   * Get a protocol document as a markdown resource
   *
   * Reads the protocol file from .claude/knowledge/protocols/ at request time
   * (not module load time) so that protocol edits do not require a server restart.
   *
   * @param {string} protocolName - The protocol name without extension
   * @returns {Object} Resource content with mimeType: text/markdown
   * @throws {Error} If the protocol file does not exist or cannot be read
   */
  getProtocolDocument(protocolName) {
    // Defence: only allow alphanumeric, hyphen, underscore in protocol names
    // to prevent path traversal via mcp://hub/protocols/../../etc/passwd
    if (!/^[a-z0-9_-]+$/.test(protocolName)) {
      throw new Error(`Unknown hub resource: mcp://hub/protocols/${protocolName}`);
    }

    // Project root is 5 levels above this file:
    // lib/mcp/server/resources/hub-resources.js -> repo root
    const protocolPath = path.resolve(
      __dirname, '..', '..', '..', '..',
      '.claude', 'knowledge', 'protocols',
      `${protocolName}-protocol.md`
    );

    if (!fs.existsSync(protocolPath)) {
      throw new Error(`Unknown hub resource: mcp://hub/protocols/${protocolName}`);
    }

    const content = fs.readFileSync(protocolPath, 'utf8');

    return {
      contents: [{
        uri: `mcp://hub/protocols/${protocolName}`,
        mimeType: 'text/markdown',
        text: content
      }]
    };
  }
  ```
  The path traversal defence is non-negotiable. Without it, `mcp://hub/protocols/..%2F..%2Fetc%2Fpasswd` would let any authenticated MCP client read arbitrary files from the production server. The whitelist regex `^[a-z0-9_-]+$` is restrictive on purpose — protocol filenames in `.claude/knowledge/protocols/` already follow this convention, and tightening here costs nothing.

- [ ] **A5.** Run `npx next lint` to verify no syntax errors. Expected: clean. If lint fails, the most likely cause is a misplaced brace or comma in the array literal at A2.

### Part B — Extract standard harness guidance into protocol + update role guidance

This is the most conceptually important step. It takes the 9 hardcoded
orchestration bullets and moves them into a protocol file that the harness
reads at runtime. The role guidance becomes a thin pointer to the protocol.

- [ ] **B1.** Create `.claude/knowledge/protocols/pipeline-orchestrator-protocol.md`. This file should contain:
  - A header explaining the protocol's purpose (default orchestration strategy for the Pipeline Harness)
  - The 9 existing role-guidance bullets from `pAIchartUniversalTemplate.ts:218-228`, expanded into full prose with examples where helpful (e.g., "wire dependencies for sequential execution" → explain what dependency wiring means and when to create tasks WITHOUT dependencies for parallelism)
  - A "When to use" section: "This is the default protocol. The harness reads it for any objective that doesn't match a domain-specific protocol trigger."
  - A "When NOT to use" section listing domain-specific protocol triggers (e.g., "If the objective involves producing a deliverable from raw session history, use `mcp://hub/protocols/lived-experience-to-artifact` instead.")

  This file is the single source of truth for how the standard harness plans. Editing it changes harness behavior on the next execution without code changes.

- [ ] **B2.** Replace the 9 bullets in `pAIchartUniversalTemplate.ts` `pipeline_harness_orchestrator` entry with a compact pointer:
  ```
  You are a Pipeline Harness Orchestrator.
  - Before planning, read your orchestration protocol at mcp://hub/protocols/pipeline-orchestrator via resources/read. It contains your complete planning strategy (decomposition, dependency wiring, template assignment, context chaining, confidence reporting).
  - If the POV objective matches a domain-specific trigger (e.g., producing a deliverable from session history), check mcp://hub/protocols/ for a specialized protocol and use it instead.
  - If the protocol resource is unavailable, fall back to: decompose the objective into 3-5 sequential tasks with clear done criteria, assign templates by type, chain context between tasks, report aggregate confidence.
  ```
  The fallback bullet is critical — it ensures the harness degrades gracefully to the current ad-hoc behavior (which is what it's always done), not to failure.

- [ ] **B3.** Run `npx next lint` to verify the TypeScript template literal is well-formed.

### Part C — Test locally

- [ ] **C1.** Restart the MCP server locally (`npm run mcp:http:dev` or whatever the dev command is for the standalone MCP process). Wait for the startup logs to confirm `HubResourceProvider` initialized.

- [ ] **C2.** Connect any MCP client (Claude Desktop, ChatGPT, or `curl` against `localhost:8080`) and call `resources/list`. Verify that `mcp://hub/protocols/lived-experience-to-artifact` appears in the array with the correct name, description, and `mimeType: text/markdown`.

- [ ] **C3.** Call `resources/read` with `uri: "mcp://hub/protocols/lived-experience-to-artifact"`. Verify the response contains the full markdown content of the protocol document. Check that the content starts with `# Lived-Experience-to-Artifact Synthesis Protocol`.

- [ ] **C4.** Test the path traversal defence: call `resources/read` with `uri: "mcp://hub/protocols/..%2F..%2Fetc%2Fpasswd"` (or `mcp://hub/protocols/../../etc/passwd` if URL encoding is not needed). Verify the response is a clean "Unknown hub resource" error, not the contents of a system file.

- [ ] **C5.** Test that the harness picks it up. Re-seed the harness template via `npx ts-node --project prisma/tsconfig.seed.json scripts/seed-harness-template.ts` (the role guidance change in B1 means the next harness execution should include the new bullet in its prompt). Then run a test harness execution against an objective that *does not* match the protocol criteria (e.g., "assess cloud security posture") and verify the harness behaves normally. The new role guidance should not change behavior on unrelated objectives.

### Part D — Deploy to production

- [ ] **D1.** Commit the changes with a clear message naming both the resource exposure and the role guidance update.

- [ ] **D2.** Push to main, wait for GitHub Actions deployment to complete (typically 3-5 minutes after push).

- [ ] **D3.** SSH to production and re-seed the harness template:
  ```bash
  ssh <PROD_USER>@<PROD_HOST> \
    "cd /var/www/paichart-app/current && source .env.production && \
     npx ts-node --project prisma/tsconfig.seed.json scripts/seed-harness-template.ts"
  ```
  This is necessary because the role guidance change is in TypeScript (compiled into the harness template's `promptTemplate` field at seed time), not in a database row that hot-reloads.

- [ ] **D4.** Verify on production: connect Claude Desktop or ChatGPT to `https://paichart.app/mcp`, list resources, and confirm `mcp://hub/protocols/lived-experience-to-artifact` is present and readable.

- [ ] **D5.** Run a real harness execution where the protocol *does* apply — e.g., "produce a customer case study from this POV's execution history" — and observe whether the harness reads the protocol resource as part of its decomposition. Capture the resulting child task list and confidence scores. Note whether the harness explicitly references the protocol in its plan comment, or whether it applies the protocol implicitly without mentioning it.

### Part E — Build the three synthesis templates

Part E is a **separate, independently executable sub-project**. Parts A-D can ship without E, and E can be developed and tested in a later session. The goal of Part E is to give the Pipeline Harness a ready-made pipeline of typed specialists that implement the seven phases of the Lived-Experience-to-Artifact protocol, so that future objectives like "produce a customer case study from this POV" can be orchestrated autonomously instead of executed manually by a single operator over multiple sessions.

The three templates map to the protocol phases as follows:

| Template | Type | Phases Covered |
|---|---|---|
| **Research Analyst** | ANALYST | Phase 1 (Harvest), Phase 2 (Map) |
| **Editorial Writer** | DOCUMENTER | Phase 3 (Annotate), Phase 5 (Split/Merge), Phase 6 (Integrate) |
| **Publication Reviewer** | REVIEWER | Phase 4 (Self-Critique), Phase 7 (Assess) |

Three templates, seven phases. The Integrator is invoked three times in different modes (annotate → split → prose); the Reviewer is invoked twice (conflation detection → publishable-bar assessment). Mode is communicated via the task description, not via a template parameter, because the agent's reasoning needs to differ per mode in ways that are hard to express as structured parameters. This is consistent with how the Pipeline Harness already invokes specialists — each child task's description tells the specialist what it is for, and the template provides the domain expertise.

Each template must read `mcp://hub/protocols/lived-experience-to-artifact` via `fetch(id: "resource-...")` or the equivalent MCP resource-read path before beginning work. This is the explicit contract — the template's prompt instructs it to read the protocol document first, and its role guidance enforces the requirement. The protocol is the single source of truth; the templates are execution interfaces.

**Prerequisite**: Parts A and B must be complete (the protocol resource must be exposed, because the templates reference it).

- [ ] **E1.** Add three role guidance entries to `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts`, appended to the `ROLE_GUIDANCE_LIBRARY` object after the existing `pipeline_harness_orchestrator` entry (currently line 218-228 region). Each entry is a multi-line template literal with 8-10 actionable bullets. The three new keys:

  - **`research_analyst`** — guidance on extracting structured findings from unstructured source material (session history, research notes, project logs, meeting transcripts). Must emphasize: read the protocol first; focus on specific details (exact numbers, file paths, error messages, verbatim quotes); prefer unexpected events over confirmations; both failures and emergent successes count; stop at 5-15 findings per run; output to the path the task description specifies.

  - **`editorial_writer`** — guidance on transforming extracted findings into polished output (annotated drafts, restructured sections, final prose). Must emphasize: read the protocol first to understand the phase you are in (annotate vs restructure vs prose); resist writing final prose during annotation; anchor every point in a verifiable detail; keep prose clear and direct, not dramatic; integrate findings into existing structure, not as sidebars; length budget is 1-2 sentences for most points, 3-5 for the most important.

  - **`publication_reviewer`** — guidance on quality assessment and publication readiness. Must emphasize: read the protocol first to understand the phase; in critique mode the single question is "are two distinct lessons being conflated into one section?"; in assessment mode be honest about gaps; do not soften ratings to be encouraging; specific gaps with severity ratings, not vague "needs more polish" critiques.

  Each entry should be approximately the same length as the existing `pipeline_harness_orchestrator` guidance (about 10 lines including the opening role line). The total addition to this file is ~30-35 lines.

- [ ] **E2.** Create a new seed script at `scripts/seed-artifact-synthesis-templates.ts`. The script should follow the same shape as `scripts/seed-harness-template.ts` — idempotent findFirst + update/create pattern, three templates created in sequence. Do not add these templates to the main `scripts/seed-agent-templates.ts` seed script; keeping them in a dedicated file means we can re-run just this subset during development without touching the broader template registry.

  Each template follows the structure:

  ```typescript
  {
    name: '[template name]',
    description: '[one-paragraph description ending with "Reads mcp://hub/protocols/lived-experience-to-artifact before beginning work."]',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.[ANALYST|DOCUMENTER|REVIEWER],
    defaultRole: '[role key matching E1 entries]',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace(
      '${roleSpecificGuidance}',
      getRoleSpecificGuidance('[role key]')
    ),
    capabilities: { ... },
    constraints: { ... },
    maxRetries: 2,
    timeout: 300,  // harvester and reviewer: 300s is enough; integrator: 600s because prose generation is longer
    priority: AgentPriority.HIGH,
    isDefault: false,
    tags: ['synthesis', 'artifact', '[type]-specific-tag'],
    metadata: {
      modelParameters: {
        provider: 'anthropic_sdk',
        model: AGENT_MODELS.synthesis,  // sonnet tier for all three — harvesting requires judgment, integration requires writing quality, review requires honest assessment. NEVER a model/maxTokens literal in a seed (test-seed-model-params-guard; 2026-08-20 maxtokens-sonnet-flip review)
        temperature: 0.3,
        maxTokens: DEFAULT_MAX_TOKENS,
        useSystemPrompt: true,
        maxRetries: 2,
        timeout: 600,
      },
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
    },
  }
  ```

  The critical decisions captured in E2:

  1. **All three templates use sonnet, not haiku.** The existing specialist templates default to haiku for cost efficiency, but synthesis work requires judgment (harvesting surprises, detecting conflation, assessing publishability) that we have not validated haiku can do reliably. Sonnet is the conservative default. Downgrading to haiku can happen later if we measure confidence scores and find they are stable.

  2. **`category: AUTOMATION`** because this is tooling work (synthesizing artifacts from raw material), not domain work (analyzing customer data, reviewing security, etc.). Same category as the Pipeline Harness itself.

  3. **`templateType`** matches the phase mapping: Harvester=ANALYST, Integrator=DOCUMENTER, Reviewer=REVIEWER. The harness's type-based selection in ORCHESTRATE mode will route sibling tasks to the right template by functional role.

  4. **`timeout: 600` for Integrator**, `300` for Harvester and Reviewer. Prose generation in Phase 6 is the longest-running phase observed in the whitepaper session (the v3 rewrite took more elapsed time than the harvest or assessment).

  5. **No custom `maxToolTurns`** — these templates do not orchestrate other agents; they do their own work. The default 30-turn limit is sufficient.

- [ ] **E3.** Run the seed script locally to verify the templates create cleanly:
  ```bash
  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-artifact-synthesis-templates.ts
  ```
  Expected output: three "Created template: ..." log lines. Run it a second time and verify idempotency — expected output: three "Updating template: ..." log lines with no errors.

- [ ] **E4.** Verify the templates in the database via direct query:
  ```sql
  SELECT name, category, "templateType", status,
    (metadata::json->>'modelParameters')::json->>'model' as model
  FROM agent_templates
  WHERE name IN ('Research Analyst', 'Editorial Writer', 'Publication Reviewer');
  ```
  Expected: three rows, all ACTIVE, all claude-sonnet-4-5, types ANALYST/DOCUMENTER/REVIEWER respectively.

- [ ] **E5.** Test each template individually with a scoped task before wiring them into a pipeline. Create three standalone tasks (not managed by the harness) in a sandbox POV:
  1. A Research Analyst task: "Extract 5-10 key findings from the git log between commits 8c6b38b3 and e756dbff, following the artifact-synthesis-protocol Phase 1. Focus on unexpected events, concrete details (file paths, error messages, numbers), and both failures and emergent successes. Output to cline_docs/test-harvest.md."
  2. An Editorial Writer task: "Read cline_docs/test-harvest.md and the artifact at [path]. Apply Phase 3 (Annotate) of the artifact-synthesis-protocol. Anchor each finding in a verifiable detail. Output the annotated version to cline_docs/test-annotated.md."
  3. A Publication Reviewer task: "Read cline_docs/test-annotated.md and apply Phase 4 (Self-Critique) of the artifact-synthesis-protocol. Report conflations, redundancies, and weight imbalances as a comment on this task."

  Run each task individually and verify:
  - Each template reads the protocol resource before acting
  - Each template follows the phase-specific guidance
  - Each template produces output of the expected shape
  - Each template ends with a confidence score that reflects its actual completion state

- [ ] **E6.** Wire the three templates into a ORCHESTRATE-mode pipeline test. Create four tasks in a sandbox POV:
  1. PIPELINE task (type: PIPELINE, no dependencies) — the harness orchestrator
  2. "Harvest stories from session [session name]" (ARCHITECT/ANALYST description match)
  3. "Integrate stories into [artifact path]" (DOCUMENTER description match, depends on task 2)
  4. "Review [artifact path] against publishable bar" (REVIEWER description match, depends on task 3)

  Execute the PIPELINE task. Verify:
  - The harness detects three siblings
  - The harness assigns the correct templates (Harvester → Integrator → Reviewer)
  - Context chaining passes outputs between the three phases
  - The final output is a reviewed, annotated artifact with gap list
  - All three tasks complete with confidence scores ≥ 70

- [ ] **E7.** Deploy to production. This requires:
  1. Committing the new seed script and role guidance additions
  2. Pushing to main and waiting for GitHub Actions deployment
  3. SSH to production and run the seed script:
     ```bash
     ssh <PROD_USER>@<PROD_HOST> \
       "cd /var/www/paichart-app/current && source .env.production && \
        npx ts-node --project prisma/tsconfig.seed.json scripts/seed-artifact-synthesis-templates.ts"
     ```
  4. Verify the templates appear in production: `template(action: "list", agent_category: "AUTOMATION")` via MCP should return all three new templates alongside the Pipeline Harness and Project Manager.

- [ ] **E8.** Run one production integration test. Create a harness task with objective "Produce a case study from the [specific completed POV name] execution history, following the lived-experience-to-artifact protocol." The harness should:
  1. Read the POV details
  2. Create a pipeline stage
  3. Read the protocol resource (mcp://hub/protocols/lived-experience-to-artifact)
  4. Decompose into tasks matching the protocol's seven phases — expect 3-5 tasks (Harvester × 1 for Phase 1-2, Integrator × 1-2 for Phase 3/5/6, Reviewer × 1-2 for Phase 4/7)
  5. Assign the three new templates by type
  6. Execute the pipeline with context chaining
  7. Report the case study as output

  Capture the full execution trace in a `cline_docs/test-artifact-pipeline-YYYY-MM-DD.md` file for the next session.

---

## Files Changed Summary

**Parts A-D (protocol exposure + harness refactor):**

| Path | Change | Lines (approx) |
|---|---|---|
| `lib/mcp/server/resources/hub-resources.js` | Add `fs`/`path` requires (top), **two** entries to `listResources()` array (~line 97), one router branch in `readResource()` (~line 132), new `getProtocolDocument()` method (~line 530) | +40 |
| `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` | **Replace** 9-bullet role guidance with 3-line protocol pointer + fallback (line 218 region). Net line change is negative — the detail moves to the protocol file. | -6 |
| `.claude/knowledge/protocols/pipeline-orchestrator-protocol.md` | **New file** — the 9 bullets expanded into full prose with examples, plus "when to use" / "when not to use" sections | ~60 (new file) |

Subtotal: ~95 lines added across 3 files (one new, two modified).

**Part E (synthesis templates):**

| Path | Change | Lines (approx) |
|---|---|---|
| `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` | Append three role guidance entries (`research_analyst`, `editorial_writer`, `publication_reviewer`) to `ROLE_GUIDANCE_LIBRARY` after line 228 | +30-35 |
| `scripts/seed-artifact-synthesis-templates.ts` | New file — idempotent seed for three templates following the pattern of `seed-harness-template.ts` | ~180 (new file) |

Subtotal: ~215 lines added across 2 files (one new, one appended).

**Total across all parts**: ~310 lines.

---

## Risks & Mitigations

**Parts A-D risks:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| Path traversal via crafted URI | Medium without defence, near-zero with defence | A4 includes the regex whitelist `^[a-z0-9_-]+$` and an `existsSync` check before reading |
| Protocol file edited but server cached old version | Low | Reading at request time (not module load) means edits are picked up on the next `resources/read` call |
| Harness loses planning guidance if resource unavailable | Low | B2 includes a 3-line fallback that degrades to the current ad-hoc behavior (decompose into 3-5 tasks, assign by type, chain context). The protocol enhances planning; its absence degrades to the status quo, not to failure. |
| Lint or build break | Low | A5 and B2 catch this before commit |
| Production deploy without re-seeding harness template | Medium | D3 is explicit; failure mode is harmless (harness operates without the new bullet, no functional regression) |
| Resource appears but harness ignores it | Medium | D5 captures observability data from a real test; if the harness does not pick it up, the next iteration tightens the role guidance trigger language |

**Part E risks:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sonnet cost for three specialist templates | Medium | E2 documents the sonnet default as conservative; E8 captures real cost data; downgrade to haiku is a one-line change per template if the measurements support it |
| Templates produce output that does not follow the protocol | High initially, decreasing with iteration | E5 tests each template in isolation against verifiable criteria; failures in E5 require prompt refinement before moving to E6 |
| Harness's type-based selection picks wrong template in ORCHESTRATE mode | Medium | E6 explicitly verifies template assignment per task; if Harvester is assigned to a DOCUMENTER-shaped task, the task description language needs sharpening |
| Context chaining between three phases loses detail | Medium | The protocol requires complete-output chaining, not summaries; the context chainer already supports this pattern; E6 verifies it manifests correctly for these templates |
| Reviewer under-reports gaps to please the harness | Medium (honesty is hard to enforce) | E5 test #3 explicitly checks that the reviewer reports conflations when they exist; E8 integration test is the real validation — if the case study ships with unflagged gaps, the reviewer's role guidance needs tightening |
| Mode communication via task description is ambiguous | Medium | E2 documents the decision to communicate mode via task description rather than template parameter; E6 verifies the Integrator correctly identifies whether it is in annotate / split / prose mode from its task description alone |
| Total pipeline cost per case study | Medium | E8 captures full cost data from one real execution; if the per-case-study cost is unacceptable, the decision is whether to downgrade models (cheapest), consolidate templates (medium), or accept the cost as the price of autonomous production (most likely) |

---

## Out of Scope

These are explicitly *not* part of this TODO:

- Exposing protocols as MCP prompts for Claude Desktop's "+" menu (separate future task; the resource exposure in Parts A-D is the agent-facing path; a prompt-based path is the human-facing complement)
- Adding a `SKILL.md` wrapper for Claude Code skill compatibility (separate future task)
- Engine changes for conditional branching, loops, or agent-to-agent handoff (see "What This Does NOT Do" section above; the protocol-as-resource pattern IS the extension point for these when concrete use cases arise)
- Modifying `SimpleResourceManager` or `MCPResourceManager` (the in-memory and TypeScript variants — `HubResourceProvider` is the right home for static protocol documents)
- Building a meta-harness that designs new pipeline templates from protocol documents (Part E builds three concrete templates for one protocol; a meta-harness is a much larger future initiative)
- Measuring and optimizing per-pipeline cost (E8 captures one data point; systematic cost optimization is follow-up work)
- Downgrading Part E templates from sonnet to haiku (conservative default; wait for measurement data from E8)

---

## Done Criteria

**Parts A-D (minimum viable)**: This TODO is considered complete at the "plug-and-play protocol architecture validated" level when:

1. [ ] All checkboxes in Parts A, B, C, and D are checked
2. [ ] **BOTH** protocol resources are readable on production:
   - `mcp://hub/protocols/pipeline-orchestrator` (default strategy)
   - `mcp://hub/protocols/lived-experience-to-artifact` (first domain-specific protocol)
3. [ ] A harness execution against a **standard** objective (e.g., "assess cloud security posture") reads the pipeline-orchestrator protocol and decomposes normally (proving the extraction didn't break default behavior)
4. [ ] A harness execution against a **domain-specific** objective (e.g., "produce a case study from session history") reads the lived-experience protocol and decomposes into phases matching the protocol's 7-phase structure
5. [ ] If either harness execution does not read the protocol, a follow-up TODO has been created to refine the role guidance trigger language

**Part E (full capability)**: The extended done criteria for the three-template sub-project:

5. [ ] All checkboxes in Part E are checked
6. [ ] Three synthesis templates (Research Analyst, Editorial Writer, Publication Reviewer) are seeded on production and discoverable via `template(action: "list", agent_category: "AUTOMATION")`
7. [ ] Each template has been tested in isolation (E5) with a confidence score ≥ 70 on a realistic task
8. [ ] An ORCHESTRATE-mode pipeline test (E6) has run with the three templates and completed end-to-end with context chaining working between all phases
9. [ ] An E8 production integration test has run against a real POV, producing an artifact that the author judges to be "ready for editing" (not necessarily publishable without human editing, but demonstrably better than no-pipeline baseline)
10. [ ] Cost data from E8 has been captured and documented in a note for future optimization decisions

Parts A-D can be shipped without Part E. Part E should not be started until the criteria 1-4 are met and the harness has demonstrated it can read the resource. There is no value in building synthesis templates that reference a resource the harness cannot load.
