# Pipeline Harness — Architecture

**Version**: 2.4 | **Updated**: 2026-07-16

How the harness works internally — execution flow, component interactions, data model, and key decisions.

> **Scope**: this doc describes the **single-pipeline** harness internals. Two layers built on top of it are
> documented elsewhere and pointed to below, not duplicated here: the **program / composition layer**
> (pipeline-of-pipelines — see the new section right after System Overview) and **terminalization & the
> non-terminal family** (the settled-but-mute escalation classes — see under Execution Invariants).

---

## System Overview

The Pipeline Harness is a meta-agent that orchestrates specialist agents. It runs as a regular agent execution (same engine, same tools) but its prompt instructs it to create/manage OTHER agents rather than doing work itself.

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Client                           │
│         (Claude Desktop / ChatGPT / CLI)                │
│                                                         │
│  perform(action: "agent.execute", taskId: "PIPELINE")   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│              MCP Task Action Handler                     │
│         agent-execute-handler.ts                         │
│                                                          │
│  1. Validate POV access                                  │
│  2. Detect PIPELINE type → auto-assign harness template  │
│  3. Create agentExecution record (PENDING)               │
│  4. Return executionId to client                         │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│              Agent Execution Engine                       │
│         agentExecutionEngine.ts                          │
│                                                          │
│  Polling loop (every 10s):                               │
│    1. Clean up stale executions (>20min → FAILED)        │
│    2. Find PENDING executions                            │
│    3. For each: CAS claim (PENDING→RUNNING)              │
│    4. Build prompt (template + context + tools)          │
│    5. Call Anthropic SDK with tools                      │
│    6. Process tool calls in loop (up to maxToolTurns)    │
│    7. Store artifacts (result.json + report.md)          │
│    8. Post auto-comment on task                          │
│    9. Mark execution SUCCESS/FAILED                      │
└──────────────────────┬───────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌───────────┐ ┌───────────┐ ┌───────────┐
    │ Tool Call │ │ Tool Call │ │ Tool Call │
    │ project() │ │ perform() │ │ template()│
    │           │ │           │ │           │
    │ Read POV  │ │ Create    │ │ List      │
    │ context   │ │ tasks,    │ │ available │
    │           │ │ assign,   │ │ templates │
    │           │ │ execute   │ │           │
    └───────────┘ └───────────┘ └───────────┘
```

**Key insight**: The harness uses the SAME MCP tools that a human would use. It calls `project()`, `perform()`, `template()` — the same tools available in Claude Desktop or ChatGPT. The harness is just an agent with a prompt that says "orchestrate other agents" instead of "do work."

### Two Execution Paths

The same MCP actions are served through two different paths:

```
PATH 1: EMBEDDED (TypeScript, in-process)
  Who: Agent execution engine (harness + child specialists)
  Process: paichart-web (PM2, port 3000)
  Flow: agentExecutionEngine → mcpServerManager → embedded-server.ts
        → tasks-action-router.ts → handlers/agent/*.ts → Prisma
  Auth: User JWT passed in-memory
  Rate limit: NONE (bypasses HTTP entirely)
  Handlers: Lean — direct Prisma queries, POV access validation

PATH 2: MCP SERVER (JavaScript entry, TypeScript handlers via ts-node)
  Who: Claude Desktop, ChatGPT, Gemini, CLI users
  Process: paichart-mcp (PM2, port 8080)
  Flow: AI client → mcp-server-http-clean.js → sdk-native-advanced-tools.js
        → advanced/*.js → router-bridge.js → tasks-action-router.ts (Tier 1)
        (falls back to apiClient HTTP only if Tier 1 is unavailable, which
         should now be a dead path — watch for `tier:'http-fallback'` logs)
  Auth: OAuth / API key
  Rate limit: 300/min (MCP middleware) + 300/min (writeOperationLimiter)
  Handlers: Rich — fuzzy search, parameter normalization, error recovery
```

**Why two paths** (updated Apr 8 2026 after Phase 2 proper / Bug Class 73
eradication): the JS MCP handler layer still exists because it adds MCP-
specific concerns that agent-internal code doesn't need (fuzzy template
matching, friendly human-facing errors, parameter intelligence). But the
old claim "pure JS, no ts-node, can't import TypeScript directly" is
**false as of Apr 8 2026**. `mcp-server-http-clean.js` now registers
`ts-node` + `tsconfig-paths` at startup, so extensionless `require()`
of any `lib/**/*.ts` file resolves through the CJS hook transparently.
This is how Tier 1 (in-process direct Prisma) is now active in the MCP
worker — the whole dual TS/JS drift eradication workstream was the fix
for this. See `.claude/knowledge/domain/mcp/bug-class-registry.md` #73
and `cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/`.

**Important**: `lib/mcp/server/tools/advanced/agent-results-handler.js` is NOT a duplicate of `lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts` — they serve different paths.

### Execution Trigger: Fire-and-Forget + Parallel Polling

When `agent.execute` is called (via MCP or GUI), the handler creates a PENDING execution record then fires `agentExecutionEngine.executeById()` **without await** (fire-and-forget). The handler returns immediately with "RUNNING" status.

```
agent.execute MCP call
  → agent-execute-handler.ts creates PENDING execution record
  → calls executeById() WITHOUT await (fire-and-forget)
  → returns { status: "RUNNING", executionId } immediately
  → executeById() runs in background: CAS claim → build prompt → LLM call → store artifacts

Polling loop (separate, every 10s):
  → finds PENDING executions (from agent.execute calls that haven't been claimed yet)
  → Promise.allSettled: runs up to 5 in PARALLEL
  → each uses CAS claim (PENDING→RUNNING) to prevent double-execution
```

**Multi-user parallelism**: With 5 users each calling `agent.execute` independently, each gets a fire-and-forget launch via `executeById()`. If any executions are still PENDING when the 10s poll fires, the polling loop picks them up in parallel via `Promise.allSettled`. The CAS pattern prevents an execution from being claimed by both paths.

**Single-client serialization**: The MCP JS handler (Path 2) auto-polls for results before returning to the caller. This means a single MCP client sending 5 sequential `agent.execute` calls will wait for each to complete — appearing serial even though the server is parallel-capable. With separate clients (real multi-user), executions overlap naturally.

**Cross-process reactor race (added 2026-04-29 per Run 6 forensics)**: pipeline cascade is reactor-driven via PostgreSQL `NOTIFY`/`LISTEN`. Both pm2 processes (`paichart-mcp` id=0 and `paichart-web` id=1) subscribe to the same channel and run the same reactor service code. **Only the user-initiated FIRST execution** (the harness's CREATE, triggered via MCP `agent.execute`) is bound to whichever process received the MCP call. Everything after that — children executing as deps clear, and the harness re-firing for SYNTHESIZE — fires from `NOTIFY` events delivered to BOTH processes simultaneously. Both processes try to claim the work; the **active-execution-unique-constraint partial index** (Invariant 1 below) lets only one INSERT succeed; the loser logs an idempotency-skip via `logReactorDuplicateSkip` and exits silently. Which process wins is non-deterministic — depends on which event loop is less busy at the millisecond the notify lands. A single pipeline can flip processes mid-cascade. Empirical evidence (Run 6, 2026-04-29): harness CREATE in mcp; Phase 0 + Editor in mcp; Reviewer + harness SYNTHESIZE in web. Two implications: (1) **defense-in-depth, intentional** — single-process-crash mid-cascade is recoverable because the other process picks up the next reactor event; (2) **forensic implication** — when investigating a pipeline, always grep BOTH log streams (`/var/log/paichart/{mcp,web}-combined-*.log*`); pre-2026-04-29 framing of "95% of pipeline logs in paichart-mcp" was empirically wrong. See `pipeline-harness-specialist.md` §4a + `PIPELINE-OBSERVABILITY-GUIDE.md` PM2 playbook for the full architectural exposition.

---

## Program / Composition Layer (pipeline-of-pipelines)

Everything below in this doc describes ONE pipeline. A **program** (the `pov-program` protocol, seeded in
`scripts/seed-protocol-prompts.ts`) composes multiple pipelines: a Program Architect turns one design
artifact into a plan + a binding **interface contract**; a human releases a plan-approval gate; N domain
pipelines run (parallel or DAG-sequenced) against the contract; a program integration reviewer (Node C)
checks cross-pipeline conformance; and release is stamped as a deterministic `programReleasable` fact a human
converts into the release decision. Its CREATE spans **two harness executions** (PLAN → PLAN-SPAWN) — a
mechanical consequence of the contract being accepted only at `task.create` and pipeline children starting
only via dependency-completion.

This layer is **not duplicated here** (it would drift). The canonical docs, all under
`.claude/knowledge/pipelines/`:
- [`PROGRAM-HARNESS-USER-GUIDE.md`](../../pipelines/PROGRAM-HARNESS-USER-GUIDE.md) — how to run a program (launch, PLAN→PLAN-SPAWN, gate release, read result, failure semantics).
- [`PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md`](../../pipelines/PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md) — the 6-phase procedure to design one.
- [`PROGRAM-COMPOSITION-CATALOG.md`](../../pipelines/PROGRAM-COMPOSITION-CATALOG.md) — the shape map (S0 single / S1 parallel+contract / S2 sequenced+DAG / S3 grouped) + selection axes.
- [`PROGRAM-RUN-FORENSICS-GUIDE.md`](../../pipelines/PROGRAM-RUN-FORENSICS-GUIDE.md) — composition-layer forensics.
- [`firewall-policy-use-case.md`](../../pipelines/firewall-policy-use-case.md) — the canonical worked example.

Design rationale (D1–D12 / CC1–CC8) + acceptance ledger: `cline_docs/reviews/program-architect-design-2026-07-15/{design-proposal.md, PROGRAM-TEST-PLAN.md}`. Two engine touch-points this layer added that DO live in the single-pipeline code: the retrigger self-ID check (`lib/services/pipelineRetriggerReactorService.ts`, so a completing child retriggers its program parent) and the context-chainer PIPELINE-predecessor branch (`lib/agents/harness/context-chainer.ts`, chains an upstream pipeline's `report.md` into a downstream one's §6).

## Mode Detection

The harness has three modes — CREATE, ORCHESTRATE, SYNTHESIZE — derived from a single piece of metadata (`task.metadata.pipelineStageId`) plus the state of the child stage it points to:

- No `pipelineStageId` (or it points to an empty stage) → **CREATE** — first run, plans the pipeline.
- `pipelineStageId` set, child stage has tasks but some lack template assignment or dependency wiring → **ORCHESTRATE** — finish setup; rare.
- `pipelineStageId` set, all children terminal → **SYNTHESIZE** — aggregate and complete.
- `pipelineStageId` set, some children running → **in-flight** branch of ORCHESTRATE — agent posts "in flight" comment and exits.

**Pre-2026-04-26**: the agent detected its own mode via `project(action: "task.details")` + `project(action: "task.list", stageId: ...)` tool calls and branched per protocol prose. Under budget exhaustion this mis-classified at ~3/30-days production rate.

**Since 2026-04-26**: the engine resolves mode from DB state via `lib/services/harnessModeResolver.ts` BEFORE the LLM turn starts. The resolver runs as a pure read (PK-indexed) at engine outer scope (after auth check at line 638, before `buildSystemPrompt` at line 664) and the resolved mode is injected into the system prompt as a `## Harness Context (Platform-Resolved)` block above the protocol injection. The agent reads the resolved mode rather than detecting one. The post-execution `pipelineProtocolValidator.detectHarnessMode()` runs as a SECONDARY signal — its mode (derived from the agent's actual tool log) is recorded alongside the resolver's mode in the artifact for forensic agreement checks. See `cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/`.

## Execution Flow: CREATE Mode

```
1. TRIGGER
   └─ User calls agent.execute on PIPELINE task (empty stage)
   └─ Engine loads harness prompt + POV context

2. PLAN (Harness tool calls)
   ├─ project(pov.details) → read POV context, phases, stages
   ├─ stage.create → new pipeline stage in appropriate phase
   ├─ task.create × N → create 3-7 typed tasks with dependencyIds
   ├─ agent.assign × N → assign specialist template to each task
   └─ task.comment → post pipeline plan on harness task

3. EXECUTE (Harness tool calls, sequential)
   For each task in dependency order:
   ├─ agent.execute → trigger specialist execution
   ├─ agent.status (poll) → wait for completion
   ├─ agent.results → read confidence score
   ├─ task.complete → mark done with confidence + summary
   └─ (if confidence < 70) → re-execute with feedback

4. VERIFY (self-completion guard)
   ├─ project(task.list, stageId) → query all children
   ├─ Check every child's status === 'COMPLETED'
   ├─ If all complete → go to REPORT (success path)
   └─ If any still OPEN/BLOCKED → go to REPORT (incomplete path)

5. REPORT
   ├─ Success path:    task.comment → summary with all confidence scores
   └─ Incomplete path: task.comment → incomplete report with resume commands,
                        names of unfinished children, and escalation context
```

**Why the VERIFY step matters**: Without it, the harness can write a celebratory summary that looks exactly like a normal successful completion while leaving most of the pipeline unexecuted. The guard was added after an early run consumed 22 of its 30-turn budget executing one of five children, then returned with confidence 88/100 and a structured auto-comment that visually matched a successful run.

## Execution Flow: ORCHESTRATE Mode

```
1. TRIGGER
   └─ User calls agent.execute on PIPELINE task (stage has siblings)
   └─ Engine loads harness prompt + POV context (includes taskId, stageId)

2. DETECT
   ├─ project(task.list, stageId) → find sibling tasks
   └─ Filter out own task → siblings = work tasks

3. ASSIGN & WIRE
   ├─ Read each sibling's description → infer template type
   ├─ agent.assign × N → assign specialist templates
   ├─ task.update × N → wire dependencyIds
   │   (from description references + type hierarchy fallback)
   └─ task.comment → post orchestration plan

4. EXECUTE (same as CREATE mode step 3)

5. VERIFY (same as CREATE mode step 4 — self-completion guard)

6. REPORT (same as CREATE mode step 5 — success path or incomplete path)
```

---

## Component Map

### Mode Resolver (Added 2026-04-26)

`lib/services/harnessModeResolver.ts` — pure read function called at engine outer scope before prompt assembly. For PIPELINE-typed tasks, reads `tasks.type`, `tasks.povId`, `tasks.metadata`, `stages.phase.povId`, and the child stage's task list to produce a `ResolvedHarnessContext`:

```
{
  mode: 'CREATE' | 'ORCHESTRATE' | 'SYNTHESIZE' | 'NOT_PIPELINE'
       | 'CROSS_TENANT_DETECTED' | 'UNKNOWN',
  reasonCode: 'no-pipelineStageId' | 'empty-stage' | 'all-terminal'
            | 'partial-terminal' | 'in-flight' | 'missing-stage'
            | 'cross-tenant-detected' | 'not-pipeline' | 'resolver-error',
  reason: string,           // human-readable explanation
  resolvedAt: ISO timestamp,
  pipelineStageId: string | null,
  childStageTaskCount?: number,
  childStageTerminalCount?: number,
}
```

**Failure handling**: try/catch around the Prisma reads; on error returns `{ mode: 'UNKNOWN', reasonCode: 'resolver-error', ... }` AND emits `pino.warn`. Fail-loud-without-crash — the LLM turn proceeds, the agent sees UNKNOWN in the prompt and follows the protocol's UNKNOWN handler clause (post forensic comment + exit).

**Cross-tenant guard**: if the resolved stage's `phase.povId !== task.povId`, returns `CROSS_TENANT_DETECTED` and emits `pino.warn` with `securityEvent: true`. Defense-in-depth alongside the daily-email's `STAGE_CROSSTENANT_7D` metric.

**Persistence**: the resolver result is written into the success-path `pipeline-index.json` artifact as `content.resolvedMode` + `content.resolvedReasonCode`. The 7th signal type in the agent-output-trustworthiness defense stack (alongside `protocolValidation`, `executionDegradation`, `errorCategory`, `commentValidation`, `qualityMetrics`, `confidenceScore`).

**Dual-path parity**: both engine (`agentExecutionEngine.ts`) and stream-route (`app/api/pov/agent/execute/stream/route.ts`) call the resolver and inject the HarnessContext block before protocol injection. Enforced by `scripts/test-mode-resolver-injection.ts` (20 source-read parity assertions).

**Tests**: `scripts/test-harness-mode-resolver.ts` (8 real-DB integration cases including in-flight, cross-tenant, missing-stage, resolver-error).

### Prompt Assembly

```
┌─────────────────────────────────────────────────────┐
│                  Final Agent Prompt                   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ SYSTEM PROMPT (template-owned)                   │ │
│  │                                                   │ │
│  │ • Platform structure (POV → Phase → Stage → Task) │ │
│  │ • Harness specialization (conductor, not player)  │ │
│  │ • Two modes (CREATE vs ORCHESTRATE)               │ │
│  │ • Template type roster (8 types)                  │ │
│  │ • Dependency type hierarchy                       │ │
│  │ • Mode detection procedure                        │ │
│  │ • Section A: CREATE mode workflow                 │ │
│  │ • Section B: ORCHESTRATE mode workflow            │ │
│  │ • Completion loop (confidence gating)             │ │
│  │ • Self-completion guard                           │ │
│  │ • Role-specific guidance                          │ │
│  │                                                   │ │
│  │ Source: scripts/seed-harness-template.ts           │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ CONTEXTUAL INFORMATION (engine-injected)         │ │
│  │                                                   │ │
│  │ • POV: title, customer, objective, solution       │ │
│  │ • Phase: name, type                               │ │
│  │ • Stage: name, ID, order                          │ │
│  │ • Task: title, ID, priority                       │ │
│  │ • Stage ID (for sibling detection)                │ │
│  │ • Team context                                    │ │
│  │ • Available tools                                 │ │
│  │                                                   │ │
│  │ Source: shared buildContextSummary()               │ │
│  │         (Axis 3 — merged both paths)               │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ USER PROMPT — §8 Output Requirements             │ │
│  │ (engine-owned, applies to ALL agents)            │ │
│  │                                                   │ │
│  │ • 5-band calibrated confidence rubric (95-100,     │ │
│  │   80-94, 60-79, 40-59, <40) with examples         │ │
│  │ • Structured output format                        │ │
│  │                                                   │ │
│  │ Source: agentExecutionEngine.ts                    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ §6 PIPELINE CONTEXT (if task has dependencies)   │ │
│  │                                                   │ │
│  │ • Predecessor task title, role, confidence        │ │
│  │ • Full predecessor output (finalResponse)         │ │
│  │ • "Build on what was produced"                    │ │
│  │                                                   │ │
│  │ Source: lib/agents/harness/context-chainer.ts      │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Pattern #51 (Prompt Section Ownership)**: System prompt = template-owned (harness prompt). User prompt = engine-owned (§8 output requirements). This ensures every agent reports confidence regardless of template.

### Protocol Injection (Apr 2026)

The execution engine can inject orchestration protocol content from the
`agent_prompt_library` database into an agent's system prompt at assembly
time. This enables **plug-and-play orchestration strategies** — adding a new
planning protocol is a DB seed, not a code change.

```
Template metadata: { loadProtocols: 'composed' } ← PIPELINE tasks (2026-08-17; 'true' = legacy load-all, the rollback path)
                 or { protocol: 'specific-name' } ← Specialist tasks
                            ↓
Engine queries agent_prompt_library WHERE tags has 'protocol'
                            ↓
Prepends "## Available Orchestration Protocols" before template content
                            ↓
Harness matches TASK DESCRIPTION to best-fit protocol
  (explicit: "protocol: artifact-synthesis" in title → deterministic)
  (implicit: LLM reads descriptions → inferred match)
                            ↓
Decomposes according to matched protocol's phases
```

**Two injection modes — different kinds of protocol, different purposes**:

| Mode | Applied to | Purpose | Currently |
|------|-----------|---------|-----------|
| `loadProtocols: 'composed'` (since 2026-08-17; `true` = legacy load-all rollback) | Harness templates (Pipeline Harness) | Compose the `protocol-base`-tagged orchestration base + the ONE protocol the task's `metadata.protocol` stamp names (platform-resolved from the title token at first execution — never a model-side pick) (default: pipeline-orchestrator-protocol) | 1 template uses this |
| `protocol: 'name'` | Specialist templates in a multi-phase workflow (Artifact Harvester, Editorial Writer, Publication Reviewer) | Inject ONE specific protocol that coordinates cross-task behavior (shared vocab, output contracts, decision rules) | 3 templates use this, all binding artifact-synthesis-protocol |
| Neither | All other templates (~17) | Zero injection — runs with role guidance only | Most templates |

**Critical rule**: children of a vanilla pipeline NEVER inherit `pipeline-orchestrator-protocol`. That protocol contains orchestrator-side instructions (decompose/assign/synthesize) meant for the harness, not its children. Verified empirically 2026-04-17 — 4 recent non-synthesis pipelines used vanilla specialists (Solution Architect, Security Analyst, etc.) with no `metadata.protocol`, and that's correct behavior.

**When a workflow needs a child-side protocol** (the ≥3-of-5 rule — see Pattern #45 §4b):
1. Same template runs multiple phases with different behavior
2. Tight output shape contract between phases
3. Cross-task decision rules
4. Shared quality constraints across tasks
5. Mandatory phase sequence

Synthesis exhibits all 5; vanilla pipelines exhibit NONE. If your new workflow exhibits fewer than 3, don't write a protocol — role guidance + task descriptions will suffice.

**The key insight**: a protocol does NOT add coordination data between tasks. Outputs are the same with or without. The protocol adds **shared reasoning** — each specialist's LLM has the same workflow document loaded, so they interpret each other's outputs consistently.

**Both execution paths covered**: `agentExecutionEngine.ts:buildSystemPrompt()` (MCP/fire-and-forget) AND `stream/route.ts` (GUI Execute button).

**Fallback**: If DB query fails, `logger.warn` and harness proceeds with its existing 9-bullet role guidance. The protocol enhances planning; its absence degrades to the status quo, not to failure.

**Universal Template fallback**: `buildSystemPrompt()` Priority 3 (`resolvePAIchartUniversalTemplate`) is unused in production — verified 2026-04-16: 0 of 128 recent executions used the Universal Template path. Planned null-template guard (see `cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md` §6) will formally close this fallback bypass.

**Pattern refs**:
- `.claude/knowledge/patterns/prompt-library-gold-standard-pattern.md` §4a/4b/4c (Pattern #45) — the two-kinds taxonomy + decision rule + key insight
- `.claude/agents/pipeline-harness-specialist.md` §2a/2b — specialist's view

### Tool Resolution Chain (`agentExecutionEngine.ts:493-509`)

Every agent execution gets a list of MCP tools made available to its LLM as `function`s. The engine resolves the per-execution tool list via a 3-tier fallback chain:

```typescript
let rawTools = mcpConfig.tools?.map(...).filter(Boolean)   // 1. task.mcpContext.tools
            || config.mcpTools                              // 2. execution.config.mcpTools
            || [];                                          // 3. fall through to default

if (mcpToolNames.length === 0) {
  mcpToolNames = [...CONSOLIDATED_TOOLS];                  // Default: full set
}
```

| Tier | Source | Storage | Typically populated by | Frequency |
|---|---|---|---|---|
| 1 | `task.mcpContext.tools` | `tasks.mcpContext` JSONB column | Direct API calls passing `mcpContext` explicitly | Rarely — most callers don't set it |
| 2 | `execution.config.mcpTools` | `agent_executions.config` JSONB | Some legacy execute paths | Rarely set per-template |
| 3 | `CONSOLIDATED_TOOLS` constant | Hard-coded in engine | Engine default | **~All executions fall through here** |

`CONSOLIDATED_TOOLS` is a fixed list of 9 tools (`project`, `perform`, `search`, `fetch`, `services`, `registry`, `analytics`, `prompt_command`, `template`). Every agent — Editor, Reviewer, Architect, Acquirer — gets the same set unless tier 1 or 2 is populated.

**Templates DO NOT participate in tool resolution today.** `agent_templates.metadata Json?` and `agent_templates.constraints Json?` exist in the schema; currently `metadata.protocol` (specialist-bound protocol injection) and `metadata.loadProtocols` (harness composition mode: `'composed'` = base + stamped delta since 2026-08-17; `true` = legacy load-all) are read by the engine. Nothing reads tool restrictions from `metadata` or `constraints`.

**Schema-aligned future direction (deferred 2026-04-29)**: extend the tool-resolution chain to read `template.metadata.tools` as a 2nd-priority source, allowing per-template tool restrictions (e.g., editorial_writer + artifact_harvester restricted to a subset that excludes `agent.results` to architecturally prevent the chained-context-prefer non-compliance pattern documented in war story #6). Cost: ~30-60 LOC engine + per-template seed updates + tests. The schema is already set up; only the integration is missing. See `cline_docs/TODO-POST-RUN7-FOLLOWUPS.md` Path B2 for the full design + decision context. Until that lands, tool restrictions are not a configuration option — they're prose-only via role-guidance discipline (the Reviewer's `4fa3fafa` precedent + Editor/Harvester `11aa7871` extension).

**Pattern refs**:
- `.claude/agents/pipeline-harness-specialist.md` §6 — two-execution-path hazard (`mcpFunctions` parity between engine and stream-route)
- `.claude/knowledge/domain/harness/post-run7-empirical-findings.md` — empirical baseline of which roles call which tools
- `cline_docs/TODO-POST-RUN7-FOLLOWUPS.md` Path B — deferred B1 (runtime guard) + B2 (template-level restriction, recommended)

### Anti-Fabrication Defense (Three Layers + 4-Point Invariant)

Three independent layers prevent the harness from fabricating its own completion. The handler-layer invariant was extended from 3 points to 4 points on 2026-04-25 to close a silent-corruption clobber-detection gap.

| Layer | Where | What it enforces |
|---|---|---|
| **Protocol rule** | `pipeline-orchestrator-protocol` (DB, v3.6.0 as of 2026-04-26) + harness template role guidance | Agent never calls `task.complete` when pipeline incomplete; escalate via comment + leave IN_PROGRESS |
| **Handler invariant (4-point)** | ONE shared copy: `lib/tasks/services/complete-task-terminally.ts` `assertPipelineCompletionInvariant` (completion-path unification 2026-07-24 — both handler copies deleted; ALL human write-sites inherit, incl. web + bulk) | (1) `metadata.pipelineStageId` set; (2) child stage has ≥1 task; (3) every child terminal; (4) child stage's `metadata.harnessTaskId` matches the calling task's id (or null = legacy stage soft-warn allow) |
| **Engine skip** | `agentExecutionEngine.ts:1604,1614` AND `app/api/pov/agent/execute/stream/route.ts:1444,1450` (re-verified 2026-06-10) | Both execution paths check `isPipelineTask` and omit `status: COMPLETED` from on-success update. Engine never auto-completes a PIPELINE — only explicit `task.complete` can, and only after passing the 4-point invariant. |

**The 4th invariant point — clobber detection** (2026-04-25)

The bidirectional pointer integrity check defends against silent corruption where `task.metadata.pipelineStageId` is changed mid-run to point at a stage owned by a different harness. Two pieces:

```
task.metadata.pipelineStageId  →  stage.id           (existing forward pointer)
stage.metadata.harnessTaskId   →  task.id            (NEW back-pointer, server-stamped)
```

**Server-side back-pointer write site:**
- `lib/mcp/tasks/action/handlers/task/task-update-handler.ts:503-area` — when a PIPELINE harness records its `pipelineStageId` via `task.update`, the handler ALSO writes `stage.metadata.harnessTaskId` via `tx.stage.update` inside the same transaction. Atomic. No agent action required (the LLM doesn't manage this field).

**Reactor mirror (defense-in-depth):**
- `lib/services/pipelineRetriggerReactorService.ts` Guard 3.5 — between Guard 3 (harness-found) and Guard 4 (child-count). Soft-warns legacy stages; `logReactorMismatchSkip('pipeline-retrigger', ...)` on actual mismatch (no throw — reactor is best-effort).

**Typed error + MCP boundary preservation:**
- `lib/errors.ts` — `PipelineStageMismatchError extends AppError` with `code: 'PIPELINE_STAGE_MISMATCH'`
- `app/api/mcp/tasks/action/route.ts:404-421` — `instanceof AppError` check before generic catch preserves `.code` and `.details` to MCP HTTP clients
- `lib/mcp/server/tools/advanced/task-action-handler.js:651-660` — extracts `error.code` into `_meta.errorCode` for stdio MCP clients

**Forward-only protection:**
Legacy stages predating the 2026-04-25 deploy don't have `harnessTaskId` set. Those produce a soft-warn at completion (`reason: 'no-back-pointer-or-non-string'` for handler, `'legacy-stage-no-back-pointer'` for reactor) rather than a hard fail. Sentinel evaluation scheduled 2026-05-25 — if zero soft-warns for 14 consecutive days, propose flipping legacy soft-warn to hard-fail.

**Regression tests (lock in defense reachability):**
- `scripts/test-pipeline-engine-skip.ts` — Layer 1 pattern test, 5 tests. Verifies the `isPipelineTask` skip exists in both engine + stream paths. If a future refactor removes either skip, PIPELINE tasks would auto-complete via the engine and bypass the handler defense — this test catches that drift.
- `scripts/test-mcp-boundary-error-codes.ts` — Layer 1 pattern test, 10 tests. Verifies `extends AppError` contract + boundary preservation on both HTTP and stdio MCP paths.

**Audit trail uplift (forensic actionability):**
`task-update-handler.ts:503-area` `_pendingMetadataMerge` block captures merge keys + before/after values inside the tx, returns them in the tx result, then iterates `logFieldChange` calls AFTER `await prisma.$transaction(...)` returns. Critical: `logFieldChange` uses the global Prisma singleton, NOT `tx` — calling it inside the tx would persist activity rows on rollback. Pattern: `transaction-atomicity-pattern.md` § "Post-Transaction Side-Effects".

**Pattern + protocol refs:**
- `.claude/knowledge/patterns/transaction-atomicity-pattern.md` — atomicity discipline for the back-pointer write
- `.claude/knowledge/patterns/dual-execution-path-parity-pattern.md` — engine-skip parity test grounding
- `.claude/knowledge/protocols/bug-class-eradication-protocol.md` § "Two-axis sweep checklist" — BC2 audit methodology that surfaced the underlying jsonb whole-replace bug at `phase.ts:updateStage`
- `cline_docs/reviews/harness-clobber-detection-2026-04-25/` — full review artifacts (current-state-validation, implementation-plan, execution-checklist, sweep-results)

### Context Chaining

```
Task A executes
    │
    ▼
result.json stored as artifact
    │ { finalResponse, confidenceScore, qualityMetrics, ... }
    │
    ▼
context-chainer.ts reads result.json
    │ Extracts: finalResponse, confidenceScore, qualityMetrics
    │
    ▼
Injects into Task B's inputContext as §6 Pipeline Context
    │
    ▼
Task B's prompt includes full predecessor output
    │ "Build on what was produced — do not repeat or re-derive it"
    │
    ▼
Task B executes with full upstream context
```

**Design note**: Full predecessor output is injected deliberately. Research (Omni-SimpleMem, 2026) found full text outperforms summaries by 53%. Selective access is deferred until pipelines exceed 10 tasks with fan-in dependencies.

### PIPELINE Auto-Assign

```
agent-execute-handler.ts (around line 123)

if task.type === 'PIPELINE'
  AND no template assigned
  AND no custom config:
    → Find "Pipeline Harness" template in DB
    → Update task with templateId + defaultRole
    → Log: "Auto-assigned Pipeline Harness template"
```

*Note: line numbers drift with file edits; search for "Auto-assign Pipeline Harness" to find the current location.*

### Orphaned Execution Watchdog

```
agentExecutionEngine.ts — two-layer cleanup:

1. STARTUP (server restart):
   → Find RUNNING executions older than 2 minutes
   → Mark FAILED + reset task executionStatus
   → Purpose: PM2 restart kills in-flight executions

2. POLL CYCLE (every 10s):
   → Find PENDING/RUNNING executions older than 20 minutes
   → Mark FAILED + reset task executionStatus
   → Purpose: catch executions that hang or crash
```

### Rate Limiting

```
Two separate rate limit layers:

1. writeOperationLimiter (lib/utils/rate-limiter.ts) — 300 req/min per user
   Applied to: task-action-handler.js (called from MCP `perform` tool) — ALL
     MCP actions (reads AND writes) via three-tier dispatch
   Identifier: userId from enriched JWT context (was 'direct' per-IP until
     fixed Apr 7 2026 in TODO-RATE-LIMIT-FIX.md Bug 2; keyed from userId
     now, so concurrent users no longer collide in one bucket)
   Observability: fires `module:'RateLimiter'` pino entry on every denial
     from inside RateLimiter.checkLimit (fixed Apr 8 2026 / Finding #10 —
     previously silent on MCP path)
   Note: As of Phase 2 proper Apr 8 2026 (Bug Class 73 eradication),
     BOTH paichart-web AND paichart-mcp execute `perform` via Tier 1
     in-process direct Prisma (no HTTP round-trip). Internal agent tool
     calls also bypass HTTP via mcpServerManager. Tier 2 HTTP fallback
     is a dead path — watch for `tier:'http-fallback'` logs as regression.

2. MCP HTTP middleware (lib/auth/mcp-http-middleware.ts) — 300 req/min per client
   Applied to: MCP HTTP server (port 8080) — external AI clients
   Identifier: user ID or IP
```

### Dependency Enforcement

```
agent-execute-handler.ts — pre-execution check:

Before executing any task:
  → Query taskDependency records for this task
  → For each dependency: check task.status === 'COMPLETED'
  → If any not complete: throw error with list of blockers
  → "Cannot execute — 1 dependency task(s) not yet complete"
```

### Elicitation Prompts (User Surface)

`agent.results` responses include a `## 💭 Suggested Next Steps` section
appended to the markdown, generated by `ElicitationPromptsGenerator`. Four
rule families fire over execution metadata and artifact contents:

- **Performance** — success-rate, average-duration, and template-usage
  signals computed from execution metadata
- **Category** — cross-category comparative prompts when multiple template
  categories appear in the result set
- **Database context** — POV/task-level context hints from a Prisma query
- **Artifact-aware** *(Apr 2026)* — per-execution prompts based on parsed
  `confidenceScore` and artifact size:
  - Confidence < 50: escalation diagnostic prompt (HIGH priority)
  - Confidence 50-69: retry-band investigation prompt (HIGH)
  - Confidence 70-79: bounded-confidence limitation prompt (MEDIUM)
  - Artifact size > 50 KB: TL;DR summary prompt (MEDIUM)
  - Batch ≥ 3 executions: cross-execution synthesis prompt (MEDIUM)

**Surface, not capability.** Elicitation prompts are a *user-facing surface*
on top of the harness's outputs. They are not consumed by the harness LLM
itself — the harness already has access to the same `confidenceScore`,
`finalResponse`, and artifact contents via context chaining and the §3.4
algorithm's retry/escalation thresholds. Feeding the prompts back into the
harness as input would double-count signals it already reads. The benefit is
to the human (or downstream MCP client) reading the result, who otherwise
would have to parse multiple `result.json` files by hand to find the one
child that landed in the bounded band.

**Deferred: harness-as-consumer.** A future "Option B" path would have the
harness read elicitation prompts during pipeline execution and treat them as
input to its retry diagnostic loop (e.g., extending the §3.4 algorithm
line 15 to inject artifact-elicitation hints alongside `diagnostic_feedback`).
We considered and explicitly deferred this in Apr 2026 because the current
rules are *thresholding rules over data the harness already reads* — there
is no information gain. Option B becomes worth implementing only when the
generator gains rules that contribute *new* information (cross-execution
pattern detection, drift signals, external context the harness does not
fetch on its own). When that happens, the right algorithmic shape is:

```
15:     retry_execute(v, diagnostic_feedback ∪ artifact_elicitation_prompts(v))
```

— making elicitation prompts a true input to self-evaluation rather than a
parallel surface.

---

## Data Model

### Key Models (Prisma)

```
POV
 ├─ id, title, objective, customerName, country
 ├─ phases: Phase[]
 └─ tasks: Task[]

Phase
 ├─ id, name, type (PLANNING/EXECUTION/REVIEW)
 └─ stages: Stage[]

Stage
 ├─ id, name, order, description
 └─ tasks: Task[]

Task
 ├─ id, title, description, status (OPEN/IN_PROGRESS/COMPLETED/BLOCKED)
 ├─ type: TaskType (ACTION/DECISION/MILESTONE/APPROVAL/DOCUMENT/MCP_SERVICE/PIPELINE)
 ├─ agentTemplateId → AgentTemplate
 ├─ agentRole: string
 ├─ stageId → Stage
 ├─ povId → POV
 ├─ inputContext: JSON (receives pipeline context from chainer)
 ├─ dependencies: TaskDependency[] (what this task depends ON)
 └─ dependents: TaskDependency[] (what depends on THIS task)

TaskDependency
 ├─ taskId → Task (the dependent)
 └─ dependsOnId → Task (the prerequisite)

AgentTemplate
 ├─ id, name, description, status
 ├─ templateType: TemplateType (ARCHITECT/BUILDER/ANALYST/REVIEWER/OPERATOR/DOCUMENTER/ORCHESTRATOR/GENERALIST)
 ├─ promptTemplate: string
 ├─ defaultRole: string
 └─ metadata: JSON (modelParameters, maxToolTurns, etc.)

AgentExecution
 ├─ id, taskId → Task
 ├─ status (PENDING/RUNNING/SUCCESS/FAILED)
 ├─ config, context: JSON
 ├─ startTime, endTime
 └─ logs: string[]

AgentArtifact
 ├─ id, executionId → AgentExecution
 ├─ name (result.json / report.md)
 ├─ type (application/json / text/markdown)
 └─ content: string
```

### Task Lifecycle

```
OPEN → IN_PROGRESS → COMPLETED (terminal)
                  ↘ BLOCKED (if dependency not met)

OPEN:        Created, not yet executing
IN_PROGRESS: Execution started (set by engine on agent.execute)
COMPLETED:   Execution succeeded + task.complete called with confidence — terminal, no transitions allowed
BLOCKED:     Dependency enforcement prevents execution (resolved when deps complete)
```

The terminal-COMPLETED rule is enforced by `validateTaskStatusTransition()` in `lib/tasks/services/status-transitions.ts` (extracted from `task.ts` 2026-07-24, completion-path unification P1-C1; `task.ts` re-exports it) and applies uniformly across all task types including PIPELINE. Re-running a completed PIPELINE task requires creating a fresh PIPELINE task rather than reopening — the underlying architecture (multiple `AgentExecution` rows per task, prune-on-complete keeping 5+5) would support in-place re-run, but 4-specialist review (2026-04-11) identified field leakage at MCP handlers, harness mode detection flip on re-run, analytics oscillation across 15-30 consumer sites, and 5 open semantic questions. See `TODO-PIPELINE-INPLACE-RERUN.md` for the deferred enhancement proposal.

### Execution Lifecycle

```
PENDING → RUNNING → SUCCESS
                  ↘ FAILED

PENDING:  Created by agent.execute handler, waiting for poll cycle pickup
RUNNING:  Claimed by CAS (compare-and-swap), LLM call in progress
SUCCESS:  LLM completed, artifacts stored, auto-comment posted
FAILED:   Error, timeout, or orphan cleanup
```

---

## Token Flow and Cost

```
One pipeline run (3 tasks, orchestrate mode):

HARNESS (Sonnet):
  ~15 tool calls × ~2K tokens each = ~30K tokens
  Orchestration overhead: ~30K tokens
  Cost: ~$0.15

SPECIALIST 1 (Haiku):
  ~5 tool calls × ~1K tokens each = ~5K tokens
  Response: ~8K tokens
  Cost: ~$0.02

SPECIALIST 2 (Haiku):
  ~5 tool calls + pipeline context (~8K) = ~13K tokens
  Response: ~8K tokens
  Cost: ~$0.03

SPECIALIST 3 (Haiku):
  ~5 tool calls + pipeline context (~16K) = ~21K tokens
  Response: ~8K tokens
  Cost: ~$0.04

TOTAL: ~100K tokens, ~$0.25, ~3.8 minutes
```

**Note**: Costs are approximate. Context chaining means each successive specialist receives more input tokens (predecessor outputs accumulate). This is why selective context access becomes important at 10+ tasks.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Harness model | Sonnet (not Haiku) | Orchestration requires planning and reasoning; Haiku is for specialist execution |
| Specialist model | Haiku (not Sonnet) | Cost efficiency; specialists follow clear instructions, don't need deep reasoning |
| Dependency inference | Prompt-level (not engine) | LLM can read descriptions and infer context-aware deps; engine can't do NLP |
| Context chaining | Full injection (not selective) | Research shows full text > summaries by 53%; defer selective until 10+ tasks |
| Self-completion | Prompt guard (not engine enforcement) | Engine can't know if "all children done" without understanding pipeline semantics |
| Mode detection | Sibling check via task.list | Simple, reliable; no new metadata or flags needed |
| Auto-assign | Type-based (PIPELINE → harness template) | Zero-config for users; just set type: PIPELINE |
| Rate limit | 300 req/min (configurable) | Harness fires rapid API calls; 100 was too low |
| Token budget | 1M/hr, 10M/day | Supports ~20 pipeline runs/day during development |
| Confidence calibration | 5-band rubric with examples + objective guard | Uncalibrated scores clustered 85–95; rubric shifted to 78–82. Guard caps at 60 if >50% tool calls fail |
| Active-execution uniqueness | Partial UNIQUE DB constraint (post-2026-04-18) | Runtime CAS checks were necessary but not sufficient — raced on 2.3-second windows. DB constraint makes it structurally impossible. |
| Harness autostart semantics | Explicit-only (agent.execute or dep-retrigger); no assign-time queuing | Pre-2026-04-18 assign-time queueing conflated specialist and harness lifecycles; the two require different trigger rules |
| Child-linkage FK | Metadata-based (`pipelineStageId`), not `parentTaskId` | The FK field exists but is deliberately unused — metadata indirection gives harness flexibility (ORCHESTRATE-mode mid-run stage changes etc.) without FK churn |
| Execution retention | 10 per status per task (raised from 5 on 2026-04-20) | 5 was tight for iterative harness flows; 10 gives margin without meaningful DB bloat (≤2 MB per task at full saturation) |
| Artifact scope (GUI) | Multi-execution aggregation (post-2026-04-20) | Single-execution scope hid prior runs' artifacts; on racy/retry-heavy histories (like the Apr 16 smoke test) the "latest" is often the least useful |

---

## Execution Invariants & Storage Bounds (Added 2026-04-18 / 2026-04-20)

This section documents the **DB-level and engine-level guarantees** the harness runtime relies on. These invariants became load-bearing during the 2026-04-18 race-fix session — before that date the rules existed informally as reactor discipline; they are now **structurally enforced**.

### Invariant 1 — One active execution per task (DB-enforced)

A partial UNIQUE index `idx_agent_executions_active_per_task` on `agent_executions ("taskId") WHERE status IN ('PENDING','RUNNING')` guarantees at the database layer that no task can have more than one active execution simultaneously. The constraint is applied via raw SQL (Prisma cannot express partial unique indexes in schema) per the `sanctioned-db-push-exception-ops-script-pattern`. Implementation: `scripts/create-agent-execution-active-unique-index.sh`.

**Consequences for harness review**:
- **Pre-L3 (pre-2026-04-18) assumption "duplicate concurrent harness executions on the same task are possible"** → **no longer true.** The 2026-04-16 smoke-test race on task `cmo10k1cp0001yxlgn6b61ll6` (two CREATE executions 2.3 seconds apart) is structurally impossible post-L3.
- Terminal states are excluded from the predicate — `SUCCESS`, `FAILED`, `SCHEDULED` rows are free of the constraint. Re-execution after a failed attempt (normal operation) works identically.
- Creates that race the constraint fail with Prisma `P2002`. The central `lib/services/agent-execution-create.ts` wrapper catches this and throws the typed `DuplicateActiveExecutionError` (code `DUPLICATE_ACTIVE_EXECUTION`). Reactors catch and silent-no-op via `logReactorDuplicateSkip()`; direct-execute paths rethrow as `ApiError(DUPLICATE_RECORD)` → HTTP 409.

### Invariant 2 — Harness autostart via explicit execute or dep-completion retrigger only

Pre-session, the `maybeQueueIfDepFree` reactor fired on ALL tasks with a template and no dependencies — including harnesses. This was the root of the assign×execute race: `agent.assign` triggered the reactor, which queued a PENDING execution, simultaneously with the caller's explicit `agent.execute`.

**Post-2026-04-18**: `agent-assign-handler.ts` guards the reactor call with `if (task.type !== 'PIPELINE')`. Harnesses execute only via:
- **Explicit `agent.execute`** from an operator / MCP client
- **Dep-completion retrigger** from `pipelineRetriggerReactorService` (children terminal → SYNTHESIZE)

Plus a secondary runtime guard in `taskReadyReactorService.ts` that short-circuits when `task.executionStatus IN ('PENDING','RUNNING','READY')` — closes the ms-window between `agentTaskService`'s CAS and its `agent_executions` INSERT. This L2 guard becomes a P2002-noise-reducer once L3 ships; it prevents the constraint from firing on the common race case.

### Invariant 3 — Typed errors carry .code for GUI routing

Both guards (L3 + null-template) throw typed errors extending `AppError` with a `readonly code: string` discriminator. The engine's outer catch at `agentExecutionEngine.ts:1631` reads `error.code` into `execution.errorCategory` on the error.json artifact, enabling the GUI to render targeted banners. Canonical codes:

| Code | Class | Thrown by | Consumer |
|---|---|---|---|
| `DUPLICATE_ACTIVE_EXECUTION` | `DuplicateActiveExecutionError` | `agent-execution-create.ts` on P2002 match | Reactors (silent no-op) / direct-execute (HTTP 409) |
| `NO_TEMPLATE_ASSIGNED` | `NoTemplateAssignedError` | `agentExecutionEngine.ts:570` (re-verified 2026-06-10) if `resolvedTemplate` is null | Outer catch → `errorCategory` on error.json |
| `DUPLICATE_RECORD` | `ApiError` | Caller-rethrow from `agentTaskService.ts` after catching `DuplicateActiveExecutionError` | MCP clients + HTTP responses (status 409) |
| `DUPLICATE_ACTIVE_EXECUTION_PHANTOM` | (log only, not a throw) | `agent-execution-create.ts` if P2002 matches constraint but no active row findable | Forensic alarm — signals Prisma error-shape drift |

### Invariant 4 — Engine-level `status` ≠ agent-reported outcome

A critical semantic distinction introduced by the same session. Two layers encode "did the work succeed":

| Layer | Where | Meaning |
|---|---|---|
| Engine | `agent_executions.status` | Did the LLM turn complete without exception? `SUCCESS` means the agent responded; does NOT mean the agent's work landed correctly. |
| Agent | `agent_artifacts.content` (`finalResponse`, `protocolValidation`, `errorCategory`) | Did the agent accomplish its stated goal? A harness can report "no pipeline state created, token budget exhausted" while the engine status is `SUCCESS`. |

**Observed on task `cmo10k1cp0001yxlgn6b61ll6` execution `cmo10q2fx005yyxlaojiei0in`**: `status=SUCCESS`, but `finalResponse` says "No pipeline state created. This is a first-run attempt." Children had already succeeded via earlier executions; the retrigger misclassified its own mode because budget-exhausted tool calls prevented it from reading `task.metadata`.

Specialist reviewers should explicitly ask "engine SUCCESS or agent SUCCESS?" when triaging harness artifacts.

### Storage Bounds — Execution Retention Policy

Per-task pruning enforced at execution-commit time (`agentExecutionEngine.ts`, transaction-safe):

```typescript
// Flip 2 (2026-07-06): moved to the shared lib/services/execution-retention.ts
export const PRUNE_ON_COMPLETE_RETENTION = { maxSuccess: 10, maxFailed: 10 }; // in-tx cap (both paths)
export const RM_DAILY_RETENTION          = { maxSuccess: 4,  maxFailed: 4  }; // daily midnight-UTC settle
```

Pruning order: `agentArtifact.deleteMany` first (FK safety) then `agentExecution.deleteMany` for executions beyond the cap. Keeps the per-task DB footprint bounded:
- **Harness tasks**: 10 × ~1 × pipeline-index.json (~5 KB – 250 KB each) ≈ 2 MB worst case
- **Specialist tasks**: 10 × 2 × (report.md + result.json, <200 KB combined) ≈ 2 MB worst case

A normal pipeline run on a harness is 2 executions (CREATE + SYNTHESIZE); 10 gives comfortable margin for iterative loops, user retries, and comparison history.

### Invariant 5 — Terminalization & the non-terminal family (2026-07)

A well-behaved harness (single pipeline OR program) **never hangs**: a task that can no longer make progress
is *terminalized* and escalated at an **event anchor — the persist transaction — not a timer**. The recurring
failure shape is "**settled children, but the harness must be told**": a task's dependents are all resolved,
yet nothing re-enters the reactor to move it, so it sits `IN_PROGRESS` forever. Four members, each a distinct
trigger with one shared cure (mark the forward cone terminal so the owner can escalate):

| Class | Trigger | Terminal outcome |
|---|---|---|
| **F16 — can-never-run** | a task whose upstream FAILED can never execute | the task + its forward cone → `executionStatus=FAILED` + `metadata.blockedByUpstreamFailure`; program escalates naming the root leg |
| **F17 — duplicate-halt** | a redundant halt on a leg that produced nothing / has no children | leg `executionStatus=FAILED`, cone marked **once** (the R4 cone-gap fold) |
| **F20 — escalated leg** | a reviewer stamps `qualityGate.outcome='escalated'` (`reviewerScore 0`) with all children terminal | escalation is an OUTCOME, not a hang → leg **COMPLETES** so the program can escalate; blocks release |
| **R4 — truncation-stall** | a SYNTHESIZE turn returns `stop_reason:max_tokens` with empty text | auto-recovered in-loop; any residual → leg `executionStatus=FAILED` + `metadata.truncationStall` + cone |

**The forward-cone walk** (`markForwardConeBlocked`, `lib/services/mark-forward-cone.ts`) is a depth-bounded
recursive CTE over `task_dependencies` (`MAX_CONE_DEPTH = 20`, mirroring `GraphLimits.MAX_DEPTH`). It is
**forward-only** from the failed task (D4 gate semantics: a parked *upstream* plan-approval gate is
structurally unreachable, but a template-less gate *inside* the cone IS marked — its dependency can never
complete), and carries `ORDER BY t.id` for a **deterministic lock order** so two overlapping cone walks cannot
deadlock (db P-DB-1). Sole-writer race safety: the ready-dependents reactor can never queue a cone task
because its SQL requires every upstream `status='COMPLETED'` and the failed task's status stays
`OPEN`/`IN_PROGRESS`. The helper is deliberately **prisma-free** (type-only `@prisma/client` import, `tx.*`
only, no `@/lib/prisma`, no logger) so `execution-terminal-persist` can call it without dragging the Prisma
client into pure-mock persist tests — the **CI-transitive-DB trap** (a value-import that transitively loads
`lib/prisma` fails a mock test with exit 1 *behind* a green pass-count).

**Layer-2 terminalization** lives in `runTerminalSuccessTx` (`lib/services/execution-terminal-persist.ts`),
and the **ordering is load-bearing**: F17/F20 program-leg outcomes are computed **FIRST**, so an escalated leg
with a stamped terminal verdict WINS (F20 → `status='COMPLETED'`) over the truncation branch — the overlap is
real because the `escalated` gate is metadata written by a mid-run tool call, so one leg can stamp escalated
*and* truncate its SYNTHESIZE turn. The truncation branch then fires only when `isPipelineTask &&
input.truncationStalled && status !== 'COMPLETED' && !programLegCompletion.{status,executionStatus}` — i.e.
never over an already-decided leg. The cone is marked (`coneStageIdToMark`) for program legs only.

**How the truncation case is detected and recovered** (three layers, the R1–R4 work):
- **The masking bug it fixes**: `finalizeTextForStopReason` (`lib/services/llm/finalize-response.ts`) glues a
  ~56-char `max_tokens` note onto empty output, so the empty-and-zero-tools content guard and `EMPTY_DELIVERABLE`
  both saw *non-empty* and skipped — a truncation was recorded as an unqualified SUCCESS (silent green). Root
  cause: **Sonnet-5 adaptive extended-thinking bills as output tokens against `max_tokens`**, and a heavy final
  SYNTHESIZE turn exhausts the ceiling mid-thinking → `stop_reason:max_tokens`, zero visible text.
- **Layer 0 — headroom (R1)**: `STANDARD_AGENT_LIMIT` 8000 → **24000** (`lib/services/llm/types.ts`), so most
  turns never approach the ceiling.
- **Layer 1 — in-loop retry (R4)**: `maybeRetryTruncatedFullTurn` (`lib/agents/harness/agentic-tool-loop.ts`)
  fires when `stopReason==='max_tokens' && emptyText && !state.used` — **once per execution** — re-running the
  same 'full' turn with `retryMaxTokens = min(cfg.maxTokens*2, capabilitiesFor(model).outputCeiling)`. The
  truncated attempt's usage is folded via `foldPriorUsage` **inside the try** (so a retry-path throw can't
  double-count). Wired at all three 'full' call sites; surfaces `truncationRetryUsed`/`truncationRetryRecovered`.
- **Layer 2 — classification + terminalization (R2/R4)**: if a residual empty-truncation survives,
  `assessExecutionQuality` (`lib/agents/harness/execution-quality.ts`) stamps `errorCategory:
  'TRUNCATED_NO_OUTPUT'` when `stopReason==='max_tokens' && rawDeliverableEmpty` — judged on the **pre-note**
  text, firing **before** `EMPTY_DELIVERABLE` and **independent of tool-count and task.type** (it must catch a
  0-tool PIPELINE SYNTHESIZE leg; a legitimate thin CREATE setup-and-exit is safe because its stopReason is
  `tool_use`/`end_turn`, never `max_tokens`). It is **additive** (Protocol-10 ship-the-fact — never flips
  SUCCESS/FAILED), and is consumed by keep-best selection (R3, so a truncated-empty retry can't supersede a
  real prior deliverable) and by the SYNTHESIZE persist path (so a stalled leg isn't read as a satisfied source).

The **settledness predicate (F18)** — a PIPELINE dependent waits until an upstream's deliverable is fully
persisted — is what lets inter-pipeline chaining never chain a half-built design. Full design + findings:
`cline_docs/reviews/nonterminal-family-2026-07-16/synthesis.md` and the R1–R6 truncation work in
`cline_docs/reviews/truncation-stall-2026-07-16/`. How these classes read in a run's forensic record:
[`PROGRAM-RUN-FORENSICS-GUIDE.md`](../../pipelines/PROGRAM-RUN-FORENSICS-GUIDE.md) §5.

---

## Harness → Child Linkage (Canonical Mapping)

Documenting the metadata-based child linkage that has been the operative rule but was only implicit in `pipelineRetriggerReactorService.ts:16-33`:

```
                      harness task                   child tasks
                     ┌─────────────────┐          ┌─────────────────┐
                     │ stage-A         │          │ stage-B         │
 Phase ──────────▶   │ ┌─────────────┐ │          │ ┌─────────────┐ │
                     │ │ HARNESS     │ │          │ │ Child 1     │ │
                     │ │ type=PIPELINE│ │ ──stageId──▶  │             │ │
                     │ │ metadata:   │ │    match  │ │ Child 2     │ │
                     │ │  pipelineStageId: cmo10lent000jyxlgdo68dzmj │ │
                     │ └─────────────┘ │          │ │ Child 3     │ │
                     └─────────────────┘          │ │ Child 4     │ │
                                                   │ └─────────────┘ │
                                                   └─────────────────┘
```

**Rules**:
- A harness (`type=PIPELINE`) lives in one stage; its children live in a **separate** stage
- The harness's `metadata.pipelineStageId` holds the id of the child stage
- Children are tasks where `task.stageId === <some-harness>.metadata.pipelineStageId` (same POV)
- **`parentTaskId` FK on Task exists but is deliberately NOT USED for harness→child** — `pipelineRetriggerReactorService.ts:16-33` documents the rationale

**Queries that depend on this mapping**:
- `pipelineRetriggerReactorService.ts:111` — find harness for a completed child (child stageId → harness pipelineStageId)
- `agentExecutionConfigBuilder.ts:190` — resolve `triggeredBy` from parent harness's execution context
- `/api/pov/[povId]/phase/[phaseId]/pipeline-context` — classify CHILD role + fetch siblings (new endpoint, 2026-04-18)

All three queries use `metadata->>'pipelineStageId'` in `$queryRaw`. The **A6 partial JSONB expression index** `idx_tasks_pipeline_stage_id ON tasks ((metadata->>'pipelineStageId')) WHERE type = 'PIPELINE'` accelerates them. Applied via the sanctioned `db push` exception ops script (`scripts/create-tasks-pipeline-stage-jsonb-index.sh`). Prod EXPLAIN verified: seq-scan of 358 rows → index-scan with 4 buffer hits on the hottest two-hop query.

**Spatial-separation consequence**: if the harness's `pipelineStageId` is ever null or points to the wrong stage, the entire automation loop breaks — SYNTHESIZE retrigger can't find the harness, `task.list`-based sibling detection returns empty, completion gating stalls. Smoke-test 3 (see `PIPELINE-HARNESS-USER-GUIDE.md`) exists specifically to catch this at ship time.

---

## Known Issues & Fixes

### Fixed 2026-04-18 — `agent.assign` × `agent.execute` race

**Symptom**: MCP client calls `perform(action: "agent.assign", taskId: T, templateId: X)` immediately followed by `perform(action: "agent.execute", taskId: T)` on a dep-free harness. Two PENDING `agent_executions` rows created within ~2.3 seconds. Engine picks up both; both run concurrently in CREATE mode. Pipeline-Harness protocol's name-collision retry-with-suffix salvaged `stage.create` collisions, but the harness did ~2× the LLM work.

**Root cause**: `maybeQueueIfDepFree` reactor was designed for specialist children but also fired on harnesses. Thread A (reactor, fire-and-forget from `agent.assign`) and Thread B (explicit execute) both observed "no existing execution" because the check-then-insert was not atomic.

**Observed instance**: task `cmo10k1cp0001yxlgn6b61ll6` (Apr 16 2026 smoke test) — 3 executions: #1 at 05:03:41 CREATE success, #2 at 05:03:44 duplicate CREATE, #3 at 05:07:51 retrigger that budget-exhausted and misclassified itself as first-run.

**Three-layer fix** (all shipped):
1. **L1 (semantic)** — `agent-assign-handler.ts` skips `maybeQueueIfDepFree` for `type='PIPELINE'` tasks
2. **L2 (runtime)** — `taskReadyReactorService.ts` early-exits when `task.executionStatus IN ('PENDING','RUNNING','READY')`
3. **L3 (DB)** — partial UNIQUE index on `agent_executions ("taskId") WHERE status IN ('PENDING','RUNNING')`

Reference: `cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md`

### Fixed 2026-04-26 — Harness mode mis-classification under budget exhaustion

**Pre-fix (2026-03 → 2026-04-26)**: the harness detected its own mode (CREATE / ORCHESTRATE / SYNTHESIZE) by reading `task.metadata` and calling `task.list` on the child stage. When tool calls all failed (e.g., token budget hit), the harness couldn't read either, and declared "first-run attempt / no pipeline state created" even when state existed. Non-destructive — the earlier CREATE execution's state was intact, children had already run — but the artifact was misleading and SYNTHESIZE was abandoned. Triage signature: `content.finalResponse` containing "first-run attempt" on a task with pre-existing `metadata.pipelineStageId`. Production rate: 3/30 days; canonical incident `cmo10q2fx005yyxlaojiei0in`.

**Resolution**: option (b) from the original triage list — deterministic pre-LLM mode check independent of agent tool calls. `lib/services/harnessModeResolver.ts` (NEW 2026-04-26) reads `tasks.metadata` and the child stage's task list directly via Prisma at engine outer scope, before `buildSystemPrompt`. The resolved mode is injected into the system prompt as a `## Harness Context (Platform-Resolved)` block above the protocol injection, AND persisted to the success-path `pipeline-index.json` artifact as `resolvedMode` + `resolvedReasonCode` fields. Both engine and stream-route paths covered.

**Verification (UAT 2026-04-26)**: 4/4 resolver firings correct across CREATE × 2 + SYNTHESIZE × 2 (executions `cmof11ebw0009yx1t95mx2icx`, `cmof144ki002lyx1trgojvctd`, `cmof6izk20007yxbs0uqxvraf`, `cmof6l6g9001myxbt62m4rhvl`). 0/3 forensic disagreement between resolver and post-execution validator on happy path. Crucial demonstration: a clean run produced an artifact with `protocolValidation = null` (the validator returns null when there are no missing-step issues to flag) but `resolvedMode = 'CREATE'` correctly populated — exactly the failure mode the resolver was designed to fix.

**Pattern**: third application of the trust-direction-shift (after the engine-owned task lifecycle and the clobber-detection back-pointer at commit `8f225353`). Bug-class registry entry: Bug Class 74. See `cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/` for the full review trail (5 specialists + 3-specialist re-review, 94.7% post-fix average confidence).

### Known — Pipeline Results tab data plane depends on A6 index

The Pipeline Results tab's `CHILDREN (N)` and `PEERS (N)` blocks rely on the A6 JSONB index for efficient lookup. Without A6, the `/api/pov/[povId]/phase/[phaseId]/pipeline-context` endpoint falls back to seq-scan on `tasks` — still correct, just slower at scale.

If A6 is ever dropped (e.g., during a DB migration that reshapes `tasks`), the tab continues to function but performance degrades. The ops script `scripts/create-tasks-pipeline-stage-jsonb-index.sh` can recreate it idempotently.

---

## Architectural Mechanisms Reference

Quick-reference table mapping the six load-bearing architectural mechanisms to their implementing components, file locations, and the patterns they follow. Use this as a navigation aid when modifying the harness — each row points at the file you would need to edit.

| Mechanism | What it does | Component | File / function | Pattern |
|---|---|---|---|---|
| **Dual execution** | Same MCP actions served in-process (for agents) and over HTTP (for external clients), with consistent behaviour across both paths | Task action handler · MCP HTTP server | `agent-execute-handler.ts` · `sdk-native-advanced-tools.js` | #50 |
| **Context chaining** | Full predecessor output injected as §6 Pipeline Context into downstream specialists with no summarization | Context chainer · execution engine | `context-chainer.ts` · `agentExecutionEngine.ts` | — |
| **Dependency enforcement** | Pre-execution check blocks tasks whose prerequisites are still OPEN, returning a clear error listing the blockers | Execute handler · TaskDependency model | `agent-execute-handler.ts` · `TaskDependency` (Prisma) | #52 |
| **Pipeline auto-assign** | PIPELINE-typed tasks auto-receive the harness template at execution time with zero configuration | Execute handler · template seeder | `agent-execute-handler.ts` (around line 123) · `seed-harness-template.ts` | — |
| **Execution safety** | CAS claim (PENDING→RUNNING) prevents double-execution races; orphan watchdog cleans stuck or crashed runs | Execution engine (poll loop + startup cleanup) | `agentExecutionEngine.ts` (lines ~83 startup, ~168 poll cycle) | — |
| **Prompt assembly** | Template owns the system prompt; the §8 Output Requirements user-prompt section (applies to every agent regardless of template) is built by the shared `buildAgentPromptBody` since B1-S2 — the engine's `buildAgentPrompt` delegates to it | Shared builder · harness template | `lib/agents/harness/build-agent-prompt-body.ts` (§8) · shared `buildContextSummary()` for `${contextualInformation}` (Axis 3 — merged both paths; engine `buildContextualInformation` deleted) | #51 |
| **Confidence calibration** | 5-band rubric with anchored examples in §8; objective guard caps score at 60 when >50% tool calls fail | §8 rubric in shared builder; post-parse guard in engine | `lib/agents/harness/build-agent-prompt-body.ts` (§8 rubric) · `agentExecutionEngine.ts` (~line 915 guard) | — |

A static HTML version of this table with interactive `sendPrompt()` handlers (for use in Claude Desktop artifact viewers) is at `architectural_mechanisms_reference.html` in this directory. The HTML version is for ad-hoc inspection by readers connected to a live MCP server; the markdown table here is the canonical reference for contributors reading the document.

**Note on terminology**: The mechanisms in this table are different from the *six capabilities* discussed in the whitepaper §3.1 (task decomposition, typed specialization, knowledge transfer, self-evaluation, persistence, context awareness). This table is the implementation view — what code paths exist to support the architecture. The whitepaper's six capabilities are the conceptual view — what properties the system must have to be a goal-directed autonomous delivery platform. Both views describe the same system at different levels of abstraction.

---

## Patterns Applied

| # | Pattern | Where |
|---|---------|-------|
| 49 | MCP Parameter Three-Layer | New params need tool schema + validation + handler |
| 50 | Dual Execution Path Parity | Engine + streaming route must have same includes |
| 51 | Prompt Section Ownership | System = template, User = engine (§8) |
| 52 | Side-Effect-Only Update | dependencyIds bypasses NO_EFFECT check |
