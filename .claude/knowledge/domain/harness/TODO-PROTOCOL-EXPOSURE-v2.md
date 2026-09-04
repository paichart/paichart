# TODO: Protocol-as-Prompt Architecture — Plug-and-Play Harness Orchestration (v2.2)

**Created**: 2026-04-07 (v1 — file-based MCP resource approach)
**Updated**: 2026-04-10 (v2 — database prompt) | 2026-04-10 (v2.1 — engine injection) | 2026-04-10 (v2.2 — protocol matching via task description, not POV objective)
**Status**: SHIPPED (2026-04, load-all form) → SUPERSEDED 2026-08-17 by COMPOSED injection (`loadProtocols: 'composed'`: base + the task's ONE stamped protocol; model-side matching retired). This doc is the original design record; current mechanics: `lib/services/execution-system-prompt.ts` + `cline_docs/reviews/ws1-phase-c-2026-08-17/SYNTHESIS.md`
**Estimated effort**: ~2 hours (Parts A-E with both protocols + engine change + test)
**Owner**: TBD
**Supersedes**: `TODO-PROTOCOL-EXPOSURE.md` (v1, file-based approach — retained for reference)

---

## TL;DR — What This Changes and Why It Matters

Today the Pipeline Harness has **one generic planning strategy** hardcoded
in TypeScript (9 bullets in `pAIchartUniversalTemplate.ts`). It decomposes
every objective the same way — 3-7 ad-hoc tasks — regardless of whether
the objective is "assess cloud security" or "produce a case study from
session history." It has no domain-specific workflow knowledge.

After this TODO ships:
- **Domain-specific protocols** are stored as database prompts
- The execution engine **automatically injects all protocol-tagged prompts**
  into PIPELINE tasks at prompt-assembly time
- The harness sees its default strategy PLUS all available domain protocols,
  matches the objective to the best one, and decomposes accordingly
- Adding a new orchestration strategy = **seed one new DB row**. Zero code
  changes, zero template edits, zero deploys.

**Concrete before/after** (protocol selection is based on the **PIPELINE task
description** — the one-sentence title you write when creating the task —
NOT the POV objective):

| PIPELINE task title | Before | After |
|---|---|---|
| "Assess cloud security posture and produce remediation roadmap" | Ad-hoc 3-7 tasks | Same — matches default protocol, decomposes normally |
| "Produce a case study from this POV's execution history" | Ad-hoc 3-7 tasks (harness has no idea about the 7-phase synthesis workflow) | **Follows artifact-synthesis-protocol** — creates Harvest → Map → Annotate → Critique → Split → Integrate → Assess phase-specific tasks |
| "Produce a case study (protocol: artifact-synthesis)" | Same ad-hoc | **Explicit match** — user named the protocol in the task title, harness picks it deterministically |
| Adding a 3rd strategy (e.g., security-audit-protocol) | Edit TypeScript, re-seed template, redeploy | Seed one new DB row. Next harness execution automatically sees it. |

---

## Critical Finding: Agents Cannot Call prompt_command

During design review (2026-04-10) we discovered that executing agents
**cannot call `prompt_command` or `list_prompts`**. The embedded server
(`lib/mcp/embedded-server.ts:1648-1656`) registers only 6 tools:

```
project, perform, analytics, template, services, registry
```

`prompt_command` and `list_prompts` are external-client-only tools available
to Claude Desktop and ChatGPT via `mcp-server-http-clean.js`, but NOT to
agents running through the execution engine.

**This ruled out the original v2 approach** (agents call `prompt_command`
at runtime). The solution: **engine-side injection** — the execution engine
reads protocol prompts from the DB and injects them into the agent's system
prompt at assembly time. This is architecturally superior anyway:

| | Agent calls prompt_command (rejected) | Engine injection (chosen) |
|---|---|---|
| Protocol delivery | Agent must decide to call the tool — could skip it | **Guaranteed** — always in the prompt |
| Extra tool turns | 1-2 turns per protocol read (tokens + latency) | **Zero** — injected before turn 1 |
| New tools to register | Yes — need standalone DB prompt loader | **None** |
| Token cost | Same (protocol content in context either way) | Same |

---

## Key Architectural Concept: Protocol vs Engine

The Pipeline Harness has two layers:

**Protocol (the planning strategy)** — "How do I decompose this objective?
What phases? What order? What does 'done' look like?"

This is what the LLM reasons about. Today it's 9 hardcoded bullets. After
this TODO it's one or more database prompts injected into the system prompt.

**Engine (the execution mechanics)** — "Create a task row, call Anthropic,
stream results, chain outputs between tasks, monitor completion."

This is code. Same regardless of which protocol is active. The only engine
change in this TODO is ~25 lines to read and inject protocol prompts.

**The protocol is the strategy. The engine is the mechanics. This TODO
makes the strategy pluggable while the engine stays fixed.**

---

## How Protocol Injection Works

### For PIPELINE tasks (harness orchestrator)

The harness template metadata includes `{ loadProtocols: true }`. At
prompt-assembly time, the execution engine:

1. Queries `agent_prompt_library WHERE 'protocol' = ANY(tags) AND status = 'ACTIVE'`
2. Reads all matching prompts' `promptText` fields
3. Prepends them to the agent's system prompt as a "## Available Protocols" section
4. The harness's role guidance says: "Match your TASK DESCRIPTION to the
   most applicable protocol and follow its phases for decomposition. If no
   domain-specific protocol matches, use the default pipeline-orchestrator."

The harness sees ALL available protocols and chooses the right one. Adding
a new protocol = seed a new DB row. The next PIPELINE execution
automatically picks it up.

**Token budget**: Each protocol is ~3,000-4,000 tokens. At 5 protocols =
~15-20K tokens. The harness prompt is already ~10-15K. Total ~30K out of
200K context window = ~15% utilization. Even at 10 protocols (~40K), still
well within budget. This only affects PIPELINE tasks.

### For specialist tasks (optional, per-template)

A specialist template can optionally name ONE protocol in its metadata:
`{ protocol: 'artifact-synthesis-protocol' }`. The engine reads that
specific prompt and injects just that one. This gives specialists their
phase-specific guidance without loading every protocol.

Most specialists won't have this field and get zero protocol injection —
they work exactly as they do today.

### Summary of injection logic (~25 lines of engine change)

```
if (template.metadata.loadProtocols === true) {
  // PIPELINE task: inject ALL protocol-tagged prompts
  const protocols = await prisma.agentPromptLibrary.findMany({
    where: { tags: { has: 'protocol' }, status: 'ACTIVE' },
    select: { name: true, description: true, promptText: true }
  });
  systemPrompt = formatProtocols(protocols) + systemPrompt;
}
else if (template.metadata.protocol) {
  // Specialist task: inject ONE named protocol
  const protocol = await prisma.agentPromptLibrary.findFirst({
    where: { name: template.metadata.protocol, status: 'ACTIVE' },
    select: { promptText: true }
  });
  if (protocol) systemPrompt = protocol.promptText + '\n\n' + systemPrompt;
}
// else: no protocol injection (current behavior, zero change)
```

---

## How the Harness Selects a Protocol

**The decision criteria is the PIPELINE task description, not the POV objective.**

The POV objective (e.g., "Cloud Security Posture Review") is a broad
business goal that stays the same across all pipeline runs on that POV.
Multiple pipeline runs on the same POV can do completely different things
— one might run a standard assessment while the next produces a case study.
The PIPELINE task's title is what distinguishes them:

```
perform(action: "task.create", parameters: {
  povId: "<POV ID>",
  stageId: "<stage ID>",
  title: "Produce a case study from this POV's execution history",  ← THIS
  type: "PIPELINE"
})
```

**The matching flow**:

```
User creates PIPELINE task with title:
  "Produce a case study from this POV's execution history"
    ↓
Engine injects all protocol-tagged prompts into harness system prompt
    ↓
Harness reads its own TASK DESCRIPTION (title + any description field)
    ↓
Matches against each protocol's description:
  - pipeline-orchestrator: "default decomposition..." → weak match
  - artifact-synthesis: "producing a deliverable from unstructured
    source material" → STRONG MATCH
    ↓
Follows artifact-synthesis-protocol phases for decomposition
```

**Two matching modes — implicit and explicit**:

| Mode | Task title example | How it works |
|---|---|---|
| **Implicit** (LLM decides) | "Produce a case study from execution history" | Harness reads all protocol descriptions, infers best match |
| **Explicit** (user decides) | "Produce a case study (protocol: artifact-synthesis)" | Harness sees the explicit protocol name in the title, deterministic selection |

Both work with the same engine code. Explicit naming is more deterministic
but requires the user to know the protocol name. Implicit is more natural
but relies on the LLM's judgment.

**Enhancement to the pipeline creation guide** (PROMPT-PIPELINE-HARNESS-GUIDE.md):
After Parts A-E ship, the guide can be updated to show users the available
protocols at Step 3 (the guide runs as an external Claude Desktop client
so it CAN call `list_prompts`):

```
Before creating the PIPELINE task, here are the available orchestration protocols:

1. **pipeline-orchestrator** (default) — Standard 3-7 task decomposition
2. **artifact-synthesis** — 7-phase ETL for producing deliverables from raw material

Which would you like? Or just describe your objective and the harness
will auto-select.
```

This is a future enhancement to the guide, not a blocker for this TODO.

---

## How This Affects the Current Standard Harness

The `pipeline_harness_orchestrator` role guidance (9 bullets in
`pAIchartUniversalTemplate.ts:218`) stays mostly the same. It gets ONE
additional line:

```
- You have been given one or more orchestration protocols in your context.
  Read your TASK DESCRIPTION (title) and match it to the most applicable
  protocol. If the task title explicitly names a protocol (e.g., "protocol:
  artifact-synthesis"), use that one. Otherwise, match based on the task
  description and each protocol's "when to use" criteria. If no domain-
  specific protocol matches, follow the default pipeline-orchestrator.
  Do not ignore protocol-specific phases — they represent proven workflows.
```

**What changes**:
- Harness template metadata: add `loadProtocols: true`
- Role guidance: add one bullet about protocol matching
- At runtime: harness sees protocol content in its system prompt that it
  didn't have before → decomposes differently when a domain protocol matches

**What does NOT change**:
- The execution engine's task creation, dependency wiring, context chaining
- Template type-based assignment (ANALYST, REVIEWER, DOCUMENTER)
- The 6 MCP tools available to agents
- The template seeding pattern
- Behavior on objectives that DON'T match any domain protocol (same as today)

**There is still ONE orchestrator template**, not multiple. The template
just gains the `loadProtocols: true` flag in its metadata so the engine
knows to inject protocols.

---

## What This Does NOT Do (Future Roadmap)

### Iterative improvement loops

The current harness supports:
- ✅ **Retry on failure** (maxRetries in template config)
- ✅ **Human handoff** (tasks assigned to humans, BLOCKED status)
- ✅ **Human-in-the-loop** (human reviews plan before execution)

What it does NOT support:
- ❌ **Revision cycles** — agent B reviews, says "needs work", agent A
  revises, agent B re-reviews. This directed cycle doesn't exist today.
  The current flow is one-directional: A → B → C → done.

This is deferred. The protocol-as-prompt pattern is the extension point:
a future "iterative-review-protocol" could describe the revision cycle,
and the engine would need one small addition ("re-execute a task").

### Agent-to-agent handoff, conditional branching, LangGraph-style graphs

All deferred. See v1 doc for the full roadmap table. Gate for agent-to-agent:
10+ successful pipelines at 85%+ confidence first.

---

## Implementation Checklist

### Part A — Seed the two protocol prompts

- [ ] **A1.** Create `scripts/seed-protocol-prompts.ts` following the idempotent
  findFirst + update/create pattern from `seed-harness-template.ts`. Seeds two rows:

  **Protocol 1: Pipeline Orchestrator (default)**
  ```typescript
  {
    name: 'pipeline-orchestrator-protocol',
    description: 'Default planning strategy for the Pipeline Harness. Covers
      objective decomposition, dependency wiring, template assignment, context
      chaining, and confidence aggregation. The harness follows this protocol
      when no domain-specific protocol matches the POV objective.',
    category: 'GENERAL',
    promptText: `# Pipeline Orchestrator Protocol (Default)\n\n...`,
    // Content: the 9 existing bullets from pAIchartUniversalTemplate.ts:218-228,
    // expanded into full prose with examples + "When to use" / "When NOT to use"
    tags: ['mcp', 'protocol'],
    variables: {},
    useCase: 'Default orchestration strategy. Automatically injected into
      PIPELINE tasks. Domain-specific protocols override this when matched.',
    complexity: 'ADVANCED',
    version: '1.0.0',
    isPublic: true,
    status: 'ACTIVE',
  }
  ```

  **Protocol 2: Artifact Synthesis**
  ```typescript
  {
    name: 'artifact-synthesis-protocol',
    description: 'Seven-phase ETL workflow for transforming raw unstructured
      input (war stories, debugging logs, decision records, research notes)
      into a polished structured artifact (whitepaper, case study, blog post,
      documentation). Use when the POV objective involves producing a
      deliverable from unstructured source material.',
    category: 'GENERAL',
    promptText: `[Content of /.claude/knowledge/protocols/lived-experience-to-artifact-protocol.md]`,
    // Loaded from the markdown file by the seed script at seed time
    tags: ['mcp', 'protocol', 'domain:synthesis'],
    variables: {},
    useCase: 'Domain-specific protocol for artifact synthesis. Overrides
      default pipeline-orchestrator when the objective involves producing
      a structured deliverable from raw material.',
    complexity: 'ADVANCED',
    version: '1.0.0',
    isPublic: true,
    status: 'ACTIVE',
  }
  ```

  The seed script reads the markdown file from disk at seed time (not at
  runtime) and stores its content in `promptText`. This gives us git-versioned
  source files + database-served runtime content.

- [ ] **A2.** Add npm script: `"seed:protocols": "npx ts-node --project prisma/tsconfig.seed.json scripts/seed-protocol-prompts.ts"`

- [ ] **A3.** Run `npm run seed:protocols` locally. Verify idempotency (run twice).

- [ ] **A4.** Verify via direct query:
  ```sql
  SELECT name, status, version, array_to_string(tags, ',') as tags,
    LENGTH("promptText") as content_length
  FROM agent_prompt_library WHERE 'protocol' = ANY(tags) ORDER BY name;
  ```
  Expected: 2 rows, both ACTIVE, both tagged `mcp,protocol`, content > 1000 chars.

### Part B — Add protocol injection to the execution engine

This is the ~25-line engine change that makes protocols available to agents.

- [ ] **B1.** Identify the prompt-assembly location in the execution engine.
  This is where the agent's system prompt is built from the template's
  `promptTemplate` + role guidance + task context. Most likely in
  `lib/services/agentExecutionEngine.ts` or `lib/services/agentTaskService.ts`
  in the method that prepares the LLM call.

- [ ] **B2.** Add the protocol injection logic (see pseudocode in "How Protocol
  Injection Works" above). Two code paths:
  - `loadProtocols: true` → query all protocol-tagged prompts → prepend all
  - `protocol: 'specific-name'` → query one → prepend one
  - Neither → skip (zero change to current behavior)

  Format the injected protocols clearly:
  ```
  ## Available Orchestration Protocols

  ### Protocol: pipeline-orchestrator-protocol
  [Default planning strategy...]

  ### Protocol: artifact-synthesis-protocol
  [Seven-phase ETL workflow...]

  ---
  [Rest of the agent's normal system prompt follows]
  ```

- [ ] **B3.** Run `npx next lint` to verify no syntax errors.

### Part C — Update harness template metadata + role guidance

- [ ] **C1.** Add `loadProtocols: true` to the Pipeline Harness template's
  metadata in `scripts/seed-harness-template.ts`:
  ```typescript
  metadata: {
    ...existingMetadata,
    loadProtocols: true,  // Engine injects all protocol-tagged prompts
  }
  ```

- [ ] **C2.** Add one bullet to the `pipeline_harness_orchestrator` role
  guidance in `pAIchartUniversalTemplate.ts` (after the existing 9 bullets):
  ```
  - You have been given one or more orchestration protocols in your context.
    Read your TASK DESCRIPTION (title) and match it to the most applicable
    protocol. If the task title explicitly names a protocol (e.g., "protocol:
    artifact-synthesis"), use that one. Otherwise, match based on the task
    description and each protocol's "when to use" criteria. If no domain-
    specific protocol matches, follow the default pipeline-orchestrator.
    Do not ignore protocol-specific phases — they represent proven workflows.
  ```

- [ ] **C3.** Re-seed the harness template locally:
  ```bash
  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-harness-template.ts
  ```

### Part D — Test

- [ ] **D1.** Verify protocol injection by running a test agent execution.
  Create a PIPELINE task and execute it. Check the execution logs for
  evidence that protocols were injected into the system prompt (add a
  `logger.info` in the injection code path that logs protocol names + sizes).

- [ ] **D2.** Test with a **standard** objective (e.g., "assess cloud security
  posture"). Verify the harness decomposes normally — it should follow the
  default pipeline-orchestrator-protocol and create 3-7 generic tasks, same
  as today.

- [ ] **D3.** Test with a **domain-specific** objective (e.g., "produce a case
  study from this POV's execution history"). Verify the harness recognizes
  the artifact-synthesis-protocol is applicable and decomposes into tasks
  matching its 7-phase structure.

- [ ] **D4.** Test with a **non-PIPELINE task** (regular specialist). Verify
  zero protocols are injected (no `loadProtocols` flag in metadata).

### Part E — Deploy to production

- [ ] **E1.** Commit all changes.

- [ ] **E2.** Push to main, wait for deployment.

- [ ] **E3.** SSH to production, seed protocols + re-seed harness template:
  ```bash
  ssh <PROD_USER>@<PROD_HOST> \
    "cd /var/www/paichart-app/current && source .env.production && \
     npx ts-node --project prisma/tsconfig.seed.json scripts/seed-protocol-prompts.ts && \
     npx ts-node --project prisma/tsconfig.seed.json scripts/seed-harness-template.ts"
  ```

- [ ] **E4.** Verify both protocols appear via `list_prompts` from Claude Desktop.

- [ ] **E5.** Run a real harness execution with a domain-specific objective and
  capture the task decomposition. Document results.

### Part F — Build the three synthesis templates (separate session)

Unchanged from v1 — see `TODO-PROTOCOL-EXPOSURE.md` Part E. The only
difference: specialist template metadata uses `{ protocol: 'artifact-synthesis-protocol' }`
for engine injection, instead of agents calling `prompt_command`.

---

## Files Changed Summary

**Parts A-E (protocols + engine injection + harness update):**

| Path | Change | Lines |
|---|---|---|
| `scripts/seed-protocol-prompts.ts` | **New** — seed 2 protocol prompts | ~120 |
| `lib/services/agentExecutionEngine.ts` or `agentTaskService.ts` | Protocol injection at prompt-assembly time | ~25 |
| `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` | Add 1 bullet to harness role guidance | +3 |
| `scripts/seed-harness-template.ts` | Add `loadProtocols: true` to metadata | +1 |
| `package.json` | Add `seed:protocols` script | +1 |

Total: ~150 lines across 5 files (one new, four modified).

**Part F (synthesis templates) — separate session:**

| Path | Change | Lines |
|---|---|---|
| `pAIchartUniversalTemplate.ts` | 3 role guidance entries | +30-35 |
| `scripts/seed-artifact-synthesis-templates.ts` | New seed file | ~180 |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Protocol content too large for system prompt | Very low | 5 protocols ≈ 20K tokens, well within 200K window. Only PIPELINE tasks get all protocols. |
| Harness ignores injected protocols | Medium | D3 tests this explicitly. If it ignores them, tighten the role guidance bullet. The protocol content is IN the prompt — the LLM has to actively ignore it. |
| Protocol prompt deleted from DB | Low | Engine handles null gracefully (skip injection). Harness falls back to ad-hoc decomposition — same as today's behavior. |
| Specialist template references nonexistent protocol | Low | Engine logs a warning and continues without injection. Specialist works fine on role guidance alone. |
| Protocol edit via admin API introduces bad content | Medium | `version` field tracks changes. `updatedAt` provides audit timestamp. Future: add changelog JSON field. |
| Non-PIPELINE template accidentally has loadProtocols | Low | Injection is opt-in via metadata flag. Only the harness seed script sets it. |

---

## Done Criteria

**Parts A-E (minimum viable)**:

1. [ ] 2 protocol prompts seeded and ACTIVE in `agent_prompt_library`
2. [ ] Engine injection code deployed (loadProtocols + single-protocol paths)
3. [ ] Harness template has `loadProtocols: true` in metadata
4. [ ] Standard-objective harness execution decomposes normally (regression test)
5. [ ] Domain-specific-objective harness execution follows artifact-synthesis phases
6. [ ] Non-PIPELINE task verified to receive zero protocol injection

**Part F (full capability)**: See v1 done criteria 5-10.

Parts A-E can ship without Part F. Part F should not start until criteria
1-6 are met.

---

## Evolution History

| Version | Date | Approach | Why it changed |
|---|---|---|---|
| v1 | 2026-04-07 | File on disk → `HubResourceProvider.getProtocolDocument()` → agents read via `resources/read` | Initial design |
| v2 | 2026-04-10 | Database prompt → agents read via `prompt_command` at runtime | Simpler (zero engine code), editable without deploy |
| v2.1 | 2026-04-10 | Database prompt → **engine injects at prompt-assembly time** | Agents can't call `prompt_command` (only 6 tools in embedded server). Engine injection is guaranteed delivery, zero extra tool turns, architecturally cleaner. PIPELINE tasks get ALL protocols; specialists get one or none. |
| **v2.2** | 2026-04-10 | Same as v2.1 + **matching via PIPELINE task description, not POV objective** | Steve identified that POV objective ("Cloud Security Posture Review") is too broad to select a protocol — two pipeline runs on the same POV can do completely different things. The PIPELINE task title is the right granularity. Added implicit matching (LLM infers from description) and explicit matching (user names protocol in title). Pipeline creation guide enhancement tracked as follow-up. |
