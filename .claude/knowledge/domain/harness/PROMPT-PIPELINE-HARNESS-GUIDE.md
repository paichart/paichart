# Pipeline Harness Implementation Guide — MCP Prompt

> **⚠️ SOURCE OF TRUTH has moved (2026-04-15)**: The deployed GUI prompt is now seeded from `scripts/seed-protocol-prompts.ts` (constant `PIPELINE_HARNESS_GUIDE` + the `pipeline_harness_guide` entry in `PROTOCOLS[]`). **Do NOT hand-edit the GUI entry** — run the seed script (`npx ts-node --project prisma/tsconfig.seed.json scripts/seed-protocol-prompts.ts`). This document is a human-readable mirror for reference and review; edits should be made in the seed script, then this doc updated to match.

**Purpose**: Human-readable reference for the `pipeline_harness_guide` GUI prompt
**Created**: 2026-04-10
**Updated**: 2026-04-15 (v2.0 — three-mode execution model aligned with shipped v3.3.0 protocol: CREATE/ORCHESTRATE/SYNTHESIZE; metadata-based child-stage linkage replaces own-stage-sibling detection; "stage trap" is gone; harness does NOT execute children (reactors cascade); re-run is now a fresh PIPELINE task with no stage constraint. Source-of-truth moved to seed-protocol-prompts.ts. v1.5 — flattened Handlebars template. v1.4 — stage trap warning. v1.3 — corrected re-run guidance. v1.2 — fetch artifact docs, confidence rubric, troubleshooting.)

---

## GUI Field Values

| Field | Value |
|-------|-------|
| **Name** | `pipeline_harness_guide` |
| **Description** | Interactive guide for implementing autonomous multi-specialist pipelines using the Pipeline Harness — from objective to execution |
| **Category** | `AUTOMATION` |
| **Complexity** | `MEDIUM` |
| **Tags** | `mcp` (required for MCP visibility) |
| **Is Public** | `true` |
| **Status** | `ACTIVE` |
| **Use Case** | `pipeline_orchestration` |
| **Estimated Time** | `10 minutes` |
| **Version** | `2.0` |
| **Created By** | `steve.terry@paichart.com` |

## Variables (JSON)

```json
{
  "objective": {
    "type": "string",
    "description": "The high-level objective for the pipeline (e.g., 'assess cloud security posture and produce remediation roadmap'). If not provided, the guide walks through setup interactively.",
    "required": false
  },
  "pov_name": {
    "type": "string",
    "description": "Name of the POV to run the pipeline against (e.g., 'Meridian Health Systems'). The guide will look up the POV ID automatically.",
    "required": false
  },
  "phase_name": {
    "type": "string",
    "description": "Name of the phase to create the pipeline stage in (e.g., 'Assessment and Validation'). The guide will look up the phase ID and create a stage automatically. If not provided, defaults to the last phase.",
    "required": false
  },
  "mode": {
    "type": "string",
    "description": "Pipeline mode: 'create' (harness decomposes objective into a child stage). Mode is auto-detected from task.metadata.pipelineStageId and child-stage state — you normally only trigger CREATE; SYNTHESIZE auto-fires once children complete.",
    "required": false,
    "default": "create"
  }
}
```

## Prompt Text (copy everything below the line into the GUI promptText field)

---

# Pipeline Harness — Implementation Guide

> **What this does**: Walk you through setting up and running an autonomous multi-specialist pipeline. You provide an objective, the Pipeline Harness decomposes it into typed specialist tasks, wires dependencies, executes each specialist in order, chains outputs between tasks, and gates quality via confidence scores.

---

## What is the Pipeline Harness?

The Pipeline Harness is a **meta-agent** — it doesn't do work itself. Instead, it orchestrates other specialist agents. Give it a one-sentence objective like "assess cloud security posture and produce a remediation roadmap" and it will:

1. Read your POV context (customer, country, objective, solution)
2. Decompose the objective into 3-7 typed specialist tasks **in a dedicated child stage**
3. Assign the right specialist template to each (Security Analyst, Solution Architect, Business Analyst, etc.)
4. Wire dependencies so tasks execute in the right order
5. Exit — **reactors** cascade execution child-by-child as dependencies clear (the harness does NOT call `agent.execute` on children)
6. Auto-retrigger once all children are terminal, then synthesize the final artifact and mark itself COMPLETED

**You provide direction. The agents provide labor. Reactors provide loop closure.**

---

## Three Modes (auto-detected)

The harness runs in one of three modes per invocation — **you don't pick**. Mode is detected from `task.metadata.pipelineStageId` and the state of the child stage:

- **CREATE** — `metadata.pipelineStageId` is absent. The harness creates a new child stage, decomposes the objective into typed tasks with templates and dependencies, then exits. First reactor trigger.
- **ORCHESTRATE** — `metadata.pipelineStageId` exists but the child stage has tasks missing templates or dependencies. The harness finishes the partial setup, then exits. (Rare — usually only hit if a previous CREATE was interrupted.)
- **SYNTHESIZE** — `metadata.pipelineStageId` exists and all children are terminal (COMPLETED or FAILED). The harness reads child artifacts, composes the final synthesis, and only then calls `task.complete` on itself.

**Typical path**: user triggers CREATE once → reactors cascade children → last child completion auto-retriggers harness in SYNTHESIZE → pipeline done. You usually never have to think about ORCHESTRATE or SYNTHESIZE.

---

{{#if objective}}
## Your Pipeline: "{{objective}}"

Let's set this up. Here's what I'll do:

1. Look up your POV (`{{pov_name}}`) and find the right phase
2. Create a new stage called "Pipeline: {{objective}}" in phase `{{phase_name}}` (or the last phase if not specified)
3. Create a PIPELINE task with your objective
4. Execute the harness — it will decompose the objective, assign specialists, wire dependencies, and run the pipeline

If any of pov_name, phase_name are missing, I'll prompt you for them first. Otherwise, just say "go" and I'll start.

```
project(action: "pov.details", pov_name: "{{pov_name}}")
```

**Ready to proceed?** Just say "go" and I'll start.
{{/if}}

{{#if objective}}{{else}}
## Getting Started

**What would you like to do?** Pick one:

1. **"I have an objective"** — Tell me what you want to accomplish, which POV, and which phase. I'll set up and run the pipeline.
2. **"Show me an example"** — I'll walk through a security assessment pipeline step by step
3. **"Explain the specialist types"** — See what kinds of specialists are available

**Example**: *"Run a security assessment on the Meridian Health Systems POV in the Assessment and Validation phase"*

Just say a number or describe what you need in plain language.
{{/if}}

---

## Quick Start: CREATE Mode (Simplest Path)

### Step 1 — Find your POV by name
```
project(action: "pov.details", pov_name: "<your POV name>")
```

This returns the POV ID, phases, stages, and team. Note the POV ID and your target phase.

### Step 2 — Create a stage for the pipeline
```
perform(action: "stage.create", parameters: {
  povId: "<POV ID from step 1>",
  phaseName: "<phase name, e.g. 'Assessment and Validation'>",
  name: "Pipeline: <short description>"
})
```

### Step 3 — Create a PIPELINE task (harness auto-assigns)
```
perform(action: "task.create", parameters: {
  povId: "<POV ID>",
  stageId: "<stage ID from step 2>",
  title: "<your objective in one sentence>",
  type: "PIPELINE",
  priority: "HIGH"
})
```

The `type: "PIPELINE"` is the key — it triggers auto-assignment of the Pipeline Harness template.

**Protocol selection** (optional): The harness has access to orchestration protocols that guide its decomposition strategy. By default it uses the `pipeline-orchestrator-protocol` (standard 3-7 task decomposition). For specific workflows, include the protocol name in the title:

```
// Standard decomposition (default protocol auto-selected):
title: "Assess cloud security posture and produce remediation roadmap"

// Explicit protocol selection (deterministic):
title: "Produce a case study from execution history (protocol: artifact-synthesis)"
```

The harness's prompt carries the orchestration BASE plus (when the task is stamped) the ONE bound protocol — never the whole library, and never a model-side choice (composed injection, 2026-08-17). Naming a protocol in the title is how you bind one; leaving it off is a first-class default, not a fallback.

> Protocols come in two flavours — harness-side (platform-resolved, one per task via the title token) and specialist-side (bind one per template). See **About Protocols: Two Injection Modes** below for the full picture.

### Step 4 — Execute
```
perform(action: "agent.execute", taskId: "<PIPELINE task ID>")
```

The harness will decompose, assign, wire, and execute. This takes 4-8 minutes for a typical pipeline.

### Step 5 — Check progress
```
perform(action: "agent.status", taskId: "<PIPELINE task ID>")
```

### Step 6 — Get results
```
perform(action: "agent.results", taskId: "<PIPELINE task ID>")
```

The results response returns a short preview plus **fetch IDs for the full artifacts** (typically `result.json` and `report.md`). Use those fetch IDs to read the full content.

### Step 7 — Fetch the full artifacts
```
fetch(id: "artifact-<id from step 6>")
```

The full pipeline report (`report.md`) contains the execution summary, task roster, confidence scores, deliverables, and dependency chain visualization. The `result.json` artifact contains the machine-readable output with `finalResponse`, `qualityMetrics`, `toolCalls`, and per-task artifacts.

**Where to find fetch IDs**: They appear in two places:
1. **`agent.results` response** — the preview lists them as `fetch(id: "artifact-...")` commands ready to copy-paste
2. **Task comments** — the harness auto-posts a completion comment on the PIPELINE task that includes fetch references for every artifact. Use `project(action: "task.context", taskId: "...", includeHistory: true)` to read comments and extract fetch IDs for past runs.

**Artifact retention**: Only the 5 most recent executions per task retain their artifacts. Older runs are pruned, but their completion comments survive with now-stale fetch IDs — if fetch returns "not found," the artifact was pruned.

---

## Re-running a Completed Pipeline

Once a pipeline task reaches `status: COMPLETED`, **it cannot be re-run in place**. The task status state machine enforces `COMPLETED` as a terminal state — `task.update status=OPEN` is rejected by validation (error: *"Invalid task status transition: COMPLETED → OPEN"*).

**To re-run a pipeline, create a fresh PIPELINE task** (same pattern as Step 2-4 of the Quick Start):

```
perform(action: "task.create", parameters: {
  povId: "<POV ID>",
  stageId: "<any stage — same or different is fine>",
  title: "<your objective> (re-run N)",
  type: "PIPELINE",
  priority: "HIGH"
})

perform(action: "agent.execute", taskId: "<new PIPELINE task ID>")
```

**Stage reuse is safe in v3.3.0**: Runs are isolated by `task.metadata.pipelineStageId` — each CREATE produces its own child stage, so old and new runs cannot cross-contaminate even if both parent PIPELINE tasks sit in the same stage. (The "stage trap" from earlier versions is gone.)

**Why a fresh task is the only re-run path**:
- The terminal-COMPLETED rule exists for audit integrity across the task system
- Each re-run creates its own child stage, execution history, artifacts, and auto-comments — cleanly separated for comparison
- Deleting an old PIPELINE task will cascade-delete its executions and artifacts, so keep old tasks around if you want to compare runs

**Known limitation**: Re-running via a fresh task is awkward for high-frequency use cases (e.g. calibration testing that runs the same pipeline 10 times). Enabling in-place re-runs for PIPELINE-type tasks is a tracked enhancement — see `TODO-PIPELINE-INPLACE-RERUN.md` in the harness knowledge directory.

---

## About ORCHESTRATE and SYNTHESIZE (auto-only)

In v3.3.0, you **never manually trigger** ORCHESTRATE or SYNTHESIZE modes — they fire automatically:

- **SYNTHESIZE** fires when the last terminal child completes. The `taskReadyReactorService` + `pipelineRetriggerReactorService` detect the all-children-terminal condition and re-invoke the harness. The harness sees `pipelineStageId` + all-terminal state and switches to SYNTHESIZE mode to compose the final artifact.
- **ORCHESTRATE** only fires on the rare edge case of an interrupted CREATE (child stage exists but some tasks lack templates or dependencies). Re-executing the same PIPELINE task will resume the setup and exit. Normally you won't see this.

**If you have pre-authored work tasks** that you want orchestrated: just create them as regular tasks in any stage, then create a PIPELINE task whose title references them — the harness, running in CREATE mode, will pick a protocol that points at those existing tasks and attach templates/deps. There is no separate "pre-author then ORCHESTRATE" flow in v3.3.0.

---

## About Protocols: Two Injection Modes

The harness and its specialists both draw from a shared **protocol library**, but use it differently. Understanding the distinction matters when you're authoring a new workflow — especially one where several specialists need to coordinate.

**Harness-side (platform-resolved, composed)**: The platform resolves each PIPELINE task's protocol ONCE — from the `(protocol: <name>)` token in the title at first execution — and stamps it on the task. At every execution the harness prompt is COMPOSED from the orchestration base plus that one stamped protocol (or the base alone when no token was given). The resolution is frozen with the stamp: the same on retries, on SYNTHESIZE re-entry, and after any title edit. The harness never reads a protocol menu and never matches "When to Use" prose — the title token at create time binds it, deterministically.

**Specialist-side (bind one)**: A specialist template (e.g., Research Analyst, Editorial Writer, Publication Reviewer) can have a specific protocol name bound in its own configuration. That one protocol is injected into every execution of that template — no runtime selection. This is how several specialists coordinate on a shared workflow: same vocabulary, same output contracts, same decision rules, so each specialist's LLM reads the same document and interprets the others' outputs consistently.

**When you care**:
- *Standard pipeline*: the default `pipeline-orchestrator-protocol` fires automatically. Don't think about it.
- *Named workflow* (e.g., artifact synthesis's 7-phase ETL): include `(protocol: name)` in the task title AT CREATE TIME — the platform stamps it at first execution and the binding is deterministic and frozen.
- *New multi-phase workflow with coordinated specialists*: this requires new specialist templates with a protocol bound — server-side engineering work, not something you configure per-pipeline.

**Critical rule — don't conflate the two sides**: Children of a standard pipeline **never** inherit the harness's orchestration protocol. The orchestrator's protocol describes orchestrator-side behavior (decompose, assign, synthesise) and would confuse a specialist trying to do concrete work. A specialist only carries a protocol if its own template has one bound. If you see a vanilla specialist (Solution Architect, Security Analyst, etc.) behaving like it's trying to orchestrate, that's a template-configuration bug, not the designed behavior.

---

## Available Specialist Types

| Type | Best For | Example Templates |
|------|----------|-------------------|
| **ARCHITECT** | Evaluating options, designing solutions | Solution Architect, Technical Consultant |
| **BUILDER** | Writing code, implementing | Senior Software Developer |
| **ANALYST** | Data analysis, business case, ROI | Business Analyst, Data Analyst, Marketing Strategist |
| **REVIEWER** | Testing, auditing, security validation | QA Test Engineer, Security Analyst |
| **OPERATOR** | Deploying, coordinating, timelines | DevOps Engineer, Project Manager |
| **DOCUMENTER** | Documentation, guides | Technical Writer |
| **ORCHESTRATOR** | Calling external MCP services | MCP Service Orchestrator |

The harness selects specialists by functional type, not by name. You don't need to know template names — the harness infers the right one from each task's description.

---

## What Happens During Execution

```
[CREATE invocation — user-triggered]
Harness reads POV context (customer, country, objective)
    ↓
Creates a child stage, stores stageId in task.metadata.pipelineStageId
    ↓
Decomposes objective into 3-7 typed tasks in the child stage
    ↓
Assigns specialist template to each + wires dependencies
    ↓
Harness EXITS (does NOT call agent.execute on children)

[Cascade phase — reactor-driven, no harness involvement]
taskReadyReactorService queues dependency-free children
    ↓
Each child executes via agentExecutionEngine
    ↓
On child completion → reactors fire:
  • maybeQueueReadyDependents (unblocks next children)
  • maybeRetriggerPipelineHarness (checks all-terminal)
    ↓
Children cascade until all are terminal (COMPLETED or FAILED)

[SYNTHESIZE invocation — reactor-triggered]
Harness re-invoked automatically
    ↓
Detects all-terminal state, reads child artifacts
    ↓
Composes final synthesis (report.md + result.json)
    ↓
Harness calls task.complete → 3-point invariant gate passes → COMPLETED
```

**Context chaining**: Each child specialist automatically receives its dependencies' full output — no summarization, no information loss. The architect's complete framework is in the reviewer's prompt before it starts.

**Anti-fabrication**: `task.complete` on the PIPELINE task is gated by a 3-point invariant (pipelineStageId set + child stage non-empty + all children terminal). If the harness tries to claim completion prematurely it is rejected by the handler. The same gate mirrors on `task.update status=COMPLETED`.

**Confidence handling** happens per-child during cascade:
- **≥ 70**: Accept, reactor queues next
- **50-69**: Re-execute once with diagnostic feedback (bounded)
- **< 50**: Mark as escalated; SYNTHESIZE still fires and reports honestly

**Self-completion guard**: The harness will NOT mark itself COMPLETED if any child is still running. It will either SYNTHESIZE with an honest "incomplete" report, or simply not transition if the 3-point invariant fails.

---

## Interpreting Confidence Scores

Agents use a calibrated five-band rubric when scoring their work. Understanding the bands helps you read the results correctly — a healthy pipeline on a simulated or context-limited task will typically land in the **78-82** range, not 90+.

| Band | Meaning | Example |
|------|---------|---------|
| **95-100** | Complete solution, all tool calls succeeded, output verified, no assumptions | "Queried all sources, cross-referenced results, covered every requirement" |
| **80-94** | Solid solution, 1-2 reasonable assumptions that couldn't be verified | "Analysis complete but I assumed Q3 data format matches Q2 — endpoint timed out" |
| **60-79** | Core problem addressed, gaps remain, some tool calls failed or unexpected | "Risk assessment done but 2 of 5 data sources unavailable, covers 60% of portfolio" |
| **40-59** | Partial progress, significant blockers, output is a starting point | "Identified schema but couldn't execute migration — permissions denied. Plan attached" |
| **Below 40** | Blocked, could not progress meaningfully — escalate | "API credentials invalid and all alternative approaches failed" |

**What the harness does with the scores**:
- **≥ 70**: Accept and proceed to next task
- **50-69**: Re-execute once with diagnostic feedback
- **< 50**: Escalate to human

**Why scores cluster at 78-82 for most real pipelines**: Agents honestly reflect that simulated POVs, context-limited analysis, and assumption-based estimates fall short of "complete verified solution" (95-100). A score of 78 doesn't mean something is wrong — it means the agent is calibrated and honest about what it couldn't verify.

**Objective guard**: If more than half of a specialist's tool calls fail, the engine automatically caps the confidence score at 60 regardless of what the LLM reports. You'll see `confidenceCapped: true` and `originalConfidence` in the result.json when this fires — it catches the pathological case where an agent claims high confidence despite evidence of failure.

---

## Troubleshooting

| Symptom | What it means | What to do |
|---------|---------------|------------|
| Pipeline completes but confidence is 78 across all specialists | Normal — calibrated scores for simulated/context-limited work | No action needed. Read the artifacts — the rubric justifies each score |
| One specialist escalates at <50 | Real blocker: missing data, failed tools, invalid credentials | Read that specialist's `result.json` for the diagnostic. Fix the blocker, re-execute the blocked task manually |
| Harness reports "incomplete: X of N children completed" | Token budget or time limit hit mid-pipeline | Use the resume commands in the report. Context chaining works for manual execution |
| All scores ≥ 95 with no assumptions listed | Suspicious — possible hallucination if tool call count is zero | Check `qualityMetrics.toolCallSuccess` in result.json. Zero tool calls + high confidence = investigate |
| `confidenceCapped: true` in result.json | Objective guard fired — tool failure rate > 50% | Read the logs for `'Confidence capped'` entry. Diagnose why tool calls failed before re-running |
| Status stuck at RUNNING for > 15 minutes | Execution hung or engine restart lost state | Orphan watchdog will mark as FAILED at 20 min. Then re-execute |
| Task status COMPLETED but no artifacts | Rare — artifact storage failed | Check `agent.status` for error details. Re-execute |
| `agent.execute` on COMPLETED task returns "Invalid task status transition" | Task status state machine: COMPLETED is terminal, cannot be reopened | Create a fresh PIPELINE task (see "Re-running a Completed Pipeline" section) |
| Harness completes CREATE but children never start | Reactor gap — `taskReadyReactorService` not firing (check pino logs for `maybeQueueReadyDependents`) | Verify engine + handler reactor hooks are wired. Manually `agent.execute` on a dep-free child to unblock |
| Pipeline runs forever — children complete but harness never re-fires | Reactor gap — `pipelineRetriggerReactorService` not firing on last child's task.complete | Check the handler's reactor call site. Manually `agent.execute` on the PIPELINE task to force SYNTHESIZE |
| `task.complete` on PIPELINE rejected with "invariant failed" | 3-point gate: missing pipelineStageId, empty child stage, or non-terminal child | This is the anti-fabrication defense working. Check `metadata.pipelineStageId` and children's statuses |
| `fetch(id: "artifact-...")` returns "not found" | Artifact was pruned (only 5 most recent per task retained) | Re-execute the task to generate fresh artifacts, or create a new pipeline task |

---

## Resuming an Incomplete Pipeline

In v3.3.0 the reactor cascade usually recovers itself — if a child fails, the reactor still fires on terminal status and eventually retriggers SYNTHESIZE. If something genuinely gets stuck (reactor not firing, orphan execution), you can force progress manually:

```
// Check which children are still open
project(action: "task.list", povId: "<POV ID>", status: "OPEN")

// Manually execute a dep-free child to unblock the cascade
perform(action: "agent.execute", taskId: "<next OPEN task ID>")

// Or force a SYNTHESIZE pass on the PIPELINE task if all children are terminal
perform(action: "agent.execute", taskId: "<PIPELINE task ID>")
```

Context chaining works for manual execution too — each child receives its dependencies' output automatically. The PIPELINE task's 3-point completion invariant still applies, so a forced SYNTHESIZE will only complete if the child stage is genuinely terminal.

---

## Common Pipeline Patterns

**Security Assessment**
```
ARCHITECT → Design assessment framework
REVIEWER → Execute security audit
ANALYST → Produce remediation roadmap with ROI
```

**Development Pipeline**
```
ARCHITECT → Design architecture
BUILDER → Implement
REVIEWER → Test and validate
DOCUMENTER → Document
```

**Go-to-Market**
```
ANALYST → Market analysis
ANALYST → Competitive positioning (parallel)
ANALYST → Business case with ROI
DOCUMENTER → Executive presentation
```

**Artifact Synthesis** *(protocol: artifact-synthesis)*
```
ANALYST (Artifact Harvester) → Harvest findings from source material
DOCUMENTER (Editorial Writer) → Annotate, restructure, produce prose
REVIEWER (Publication Reviewer) → Critique quality + assess publishability
```
Use when producing a deliverable (whitepaper, case study, blog post) from unstructured source material. Include `(protocol: artifact-synthesis)` in the task title for deterministic selection. The harness follows the 7-phase ETL workflow from the artifact-synthesis-protocol.

---

## Emergent Capabilities

The harness surfaces capabilities you didn't ask for:

- **Regional compliance inference**: A US hospital network POV automatically produces HIPAA and HITRUST-mapped findings with specific CFR citations (45 CFR §164). An Australian POV surfaces ASD Essential Eight and APRA CPS 234. No frameworks are in the harness prompt — they emerge from country + sector context.

- **Non-linear dependency graphs**: The harness can create parallel roots feeding synthesis tasks, not just linear chains.

- **Graceful degradation under constraints**: When rate-limited or budget-exhausted, the harness produces a structured escalation plan with honest 0/100 confidence.

---

## Tool Reference

| Action | Tool | What It Does |
|--------|------|-------------|
| Find POVs | `project(action: "pov.list")` | Browse your POVs |
| POV details | `project(action: "pov.details", povId: "...")` | Get phases, stages, team |
| List tasks | `project(action: "task.list", povId: "...")` | See pipeline tasks |
| Create task | `perform(action: "task.create", ...)` | Create work or PIPELINE task |
| Execute | `perform(action: "agent.execute", taskId: "...")` | Launch the harness |
| Check status | `perform(action: "agent.status", taskId: "...")` | Poll execution |
| Get results preview | `perform(action: "agent.results", taskId: "...")` | Preview + fetch IDs for full artifacts |
| Fetch full artifact | `fetch(id: "artifact-...")` | Read full `report.md` or `result.json` content |
| Read task comments | `project(action: "task.context", taskId: "...", includeHistory: true)` | See harness completion comments with fetch IDs |
| Re-run a completed pipeline | Create a new PIPELINE task (see "Re-running a Completed Pipeline" section) | In-place re-run is blocked by terminal COMPLETED status |
| Assign template | `perform(action: "agent.assign", taskId: "...", agentTemplateName: "...")` | Manual template assignment |
| Add dependencies | `perform(action: "task.update", taskId: "...", dependencyIds: [...])` | Wire task dependencies |

---

## Related Prompts

- **mcp_platform_showcase** — Full platform capability walkthrough
- **getting_started** — Interactive onboarding (role-based paths)
- **workflow_guide** — Multi-service workflow orchestration
