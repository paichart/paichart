# Pipeline Harness User Guide

**Version**: 3.1 | **Updated**: 2026-06-29
**Status**: Production — three-mode (CREATE + ORCHESTRATE + SYNTHESIZE), platform-resolved

> **This guide = how to RUN/USE the harness.** To **design + add a new domain pipeline** (the triage → decompose → build → validate → promote process), see the sibling [`PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md`](./PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md). Which domains exist + why they fit: [`PIPELINE-DOMAIN-FIT-CATALOG.md`](./PIPELINE-DOMAIN-FIT-CATALOG.md). To compose MULTIPLE pipelines into a plan-gated **program** (pipeline-of-pipelines): [`PROGRAM-HARNESS-USER-GUIDE.md`](./PROGRAM-HARNESS-USER-GUIDE.md).

---

## What Is the Pipeline Harness?

The Pipeline Harness is a **meta-agent** that orchestrates other agents. It operates in **three modes**, **platform-resolved per execution** (since 2026-04-26 via `harnessModeResolver.ts`):

**CREATE mode** — You give the harness a high-level objective and it:
1. **Decomposes** the objective into 3-7 typed tasks (in a fresh child stage)
2. **Assigns** the right specialist template to each task
3. **Wires** dependencies so tasks execute in the right order
4. **Wires Step 5a deliverable metadata** (`deliverableSourceTaskId` on self + `suppressDefaultReportMd` on the leaf) so the engine can extract the customer-facing `report.md` later
5. **Posts a "Pipeline Queued" breadcrumb comment** and **EXITS**

The harness does NOT execute children itself — reactors do that. The harness exits after CREATE; reactors cascade children one-by-one as deps clear.

**ORCHESTRATE mode** — Rare. Fires when a CREATE was interrupted (child stage exists but some tasks lack templates or dependencies). The harness finishes the partial setup and exits.

**SYNTHESIZE mode** — Auto-fired by `pipelineRetriggerReactorService` when ALL children of the harness's child stage are terminal (COMPLETED or FAILED). The harness:
1. Reads each child's `result.json` (confidence, qualityMetrics, errorCategory)
2. Applies the quality gate (≥70 accept, 50-69 retry, <50 escalate)
3. Composes `pipeline-index.json` (the forensic harness summary) — quality gates table, audit trail, deliverable pointer with `{{HARNESS_REPORT_MD_ID}}` placeholder
4. Calls `task.complete` on itself (gated by 4-point invariant server-side)

The engine then post-processes (still inside the same transaction): extracts the source child's `finalResponse` into the harness's `report.md`, and substitutes the placeholder for the actual `report.md` artifact ID.

**Mode resolution is platform-driven, not agent-detected.** The harness reads its own `metadata.pipelineStageId` (absent → CREATE; present + child stage all terminal → SYNTHESIZE; present + partial setup → ORCHESTRATE) via the resolver running BEFORE the LLM turn starts. The resolved mode is injected into the system prompt as a `## Harness Context (Platform-Resolved)` block. Pre-2026-04-26 logic (sibling-detection in the harness's own stage) is retired.

**The human provides direction. The agents provide labor. Reactors provide loop closure.**

---

## Domain Pipelines (connected-service) — network, k8s, Terraform

Beyond generic objective-decomposition, the harness runs **domain-specific connected-service pipelines** that produce an **approved-but-unapplied infrastructure change** against a customer's *real* state — read-only by construction. Shipped/validated domains: **network provisioning**, **Kubernetes/GitOps**, and **Terraform/Cloud-IaC** — each selected by a `(protocol: <name>)` tag in the task title (the harness matches the protocol's description against the task intent).

How they differ from a generic pipeline:

- **Self-provision lifecycle.** A conditional Phase-0 *Harvester* registers a **customer-governed read-only MCP service** from a descriptor carried in the task (register → read-only call → teardown). pAIchart stores no infrastructure credentials.
- **The cognition/actuation seam — it never actuates.** The deliverable is a change *to be applied* (a config / manifest / HCL diff + validation facts + rollback); applying it is the customer's **out-of-band, human-gated** run (a deterministic applier / Argo-Flux reconcile / `terraform apply`).
- **Read-only floor + secret discipline.** The customer service enforces a read-only verb-enum + redacts secrets at the source; pAIchart's *own* guards back it up — **R9** (`CONNECTED_OUTPUT_SANITIZE_ENABLED`) sanitizes harvested output before the reasoner, **R10** (`ARTIFACT_SECRET_REDACT_ENABLED`) redacts secrets from the persisted artifacts. Both are **enabled in prod** (2026-06-29).

**References:** [`PIPELINE-DOMAIN-FIT-CATALOG.md`](./PIPELINE-DOMAIN-FIT-CATALOG.md) (which domains fit + why) · the per-domain RFCs under `network-provisioning/` · `kubernetes-gitops/` · `terraform-iac/` (decomposition + the customer integration spec + a validation-rig `DEMO-RUN-GUIDE`) · [`../domain/harness/harness-output-guards.md`](../domain/harness/harness-output-guards.md) (R9/R10). To **add** a new domain, follow the [Use-Case Design Playbook](./PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md).

---

## Quick Start

### Option A: PIPELINE Task Type (simplest — auto-assigns harness)

```
// 1. Create a PIPELINE task — harness template auto-assigns
perform(action: "task.create", parameters: {
  povId: "YOUR_POV_ID",
  title: "Assess cloud security posture and produce remediation roadmap",
  stageId: "YOUR_STAGE_ID",
  type: "PIPELINE"
})

// 2. Execute — auto-assign detects PIPELINE type and assigns the harness
perform(action: "agent.execute", taskId: "PIPELINE_TASK_ID")

// 3. Watch progress
perform(action: "agent.status", taskId: "PIPELINE_TASK_ID")
```

This triggers **CREATE mode**: the harness decomposes the objective, creates a new pipeline stage, assigns specialists, and executes.

### Option B: Orchestrate Existing Tasks — DEPRECATED post-2026-04-26

This workflow described a pre-resolver pattern: pre-author work tasks in a parent stage + add a PIPELINE task to the same parent stage + harness "detects siblings" → ORCHESTRATE mode. **It no longer works**. Under `harnessModeResolver.ts`, mode is decided by the harness's own `metadata.pipelineStageId` (pointing at the harness's CHILD stage), not by parent-stage sibling detection. A fresh PIPELINE task with no `pipelineStageId` resolves to CREATE — and the harness creates its own fresh child stage in Step 2, ignoring any pre-authored sibling tasks in its parent stage.

**ORCHESTRATE mode** is now an **interrupted-CREATE recovery mode** — it fires only when `pipelineStageId` is set AND the child stage has tasks but some lack templates or dependencies (e.g., a CREATE was killed mid-flight). It's not user-invocable.

**For the original Option B use case** (user pre-authors tasks, wants harness to orchestrate them):
- Use Option A or Option C instead — give the harness an objective, let it decompose. The harness's CREATE mode is far more capable than the pre-2026-04-26 ORCHESTRATE mode.
- If you genuinely need to bring pre-authored tasks under harness orchestration, do it as a CREATE-mode reference: include the pre-authored task IDs in your PIPELINE task description (e.g., "*Build on the existing Solution Architect deliverable in task `<id>` and the Security Audit in task `<id>`...*"). The harness will pick this up via `task.context` reads + integrate. This is the supported pattern post-rework.

### Option C: Create Mode with Manual Template Assignment

```
// 1. Create a task for the harness
perform(action: "task.create", parameters: {
  povId: "YOUR_POV_ID",
  title: "Assess cloud security posture and produce remediation roadmap",
  stageId: "YOUR_STAGE_ID"
})

// 2. Assign the Pipeline Harness template manually
perform(action: "agent.assign", taskId: "HARNESS_TASK_ID",
  agentTemplateName: "Pipeline Harness")

// 3. Execute
perform(action: "agent.execute", taskId: "HARNESS_TASK_ID")
```

Same as Option A but without the PIPELINE type — useful if the task was created before the type was set.

Each CREATE mode run creates its own stage, so multiple runs are cleanly separated:
```
Review & Validation Phase
  ├── Security Configuration Review (existing)
  ├── Pipeline: Cloud Security Assessment (harness run 1)
  ├── Pipeline: Migration Readiness (harness run 2)
  └── Pipeline: Compliance Audit (harness run 3)
```

### Option D: Manual Pipeline (you control each step)

```
// 1. Create Task A (no dependencies)
perform(action: "task.create", parameters: {
  povId: "...", title: "Design security framework", stageId: "..."
})
// → taskId: "TASK_A"

// 2. Assign a specialist
perform(action: "agent.assign", taskId: "TASK_A",
  agentTemplateName: "Solution Architect")

// 3. Create Task B (depends on Task A)
perform(action: "task.create", parameters: {
  povId: "...", title: "Execute security audit", stageId: "...",
  dependencyIds: ["TASK_A"]
})
// → taskId: "TASK_B"

perform(action: "agent.assign", taskId: "TASK_B",
  agentTemplateName: "Security Analyst")

// 4. Execute Task A
perform(action: "agent.execute", taskId: "TASK_A")
// Wait for completion...

// 5. Execute Task B (context auto-chained from Task A)
perform(action: "agent.execute", taskId: "TASK_B")
// Task B's agent automatically receives Task A's output in its prompt
```

---

## Template Types — Which Specialist for Which Task?

| Type | When the Task Requires | Templates Available |
|------|----------------------|-------------------|
| **ARCHITECT** | Evaluating options, designing solutions | Solution Architect, Technical Consultant |
| **BUILDER** | Writing code, implementing | Senior Software Developer |
| **ANALYST** | Data analysis, business case, ROI | Business Analyst, Data Analyst, Marketing Strategist |
| **REVIEWER** | Testing, auditing, security validation | QA Test Engineer, Security Analyst |
| **OPERATOR** | Deploying, coordinating, timelines | DevOps Engineer, Project Manager |
| **DOCUMENTER** | Documentation, guides | Technical Writer |
| **ORCHESTRATOR** | Calling external MCP services | MCP Service Orchestrator, MCP Workflow Orchestrator |

---

## How Automatic Context Chaining Works

When Task B depends on Task A (`dependencyIds: ["TASK_A"]`):

1. Task A executes and produces `result.json` with `finalResponse`, `confidenceScore`, `qualityMetrics`
2. Before Task B executes, the **context chainer** automatically:
   - Reads Task A's `result.json`
   - Extracts `finalResponse`, `confidenceScore`, `qualityMetrics`
   - Injects them into Task B's `inputContext`
3. Task B's agent sees this in its prompt as **Pipeline Context (§6)**:

```markdown
## Pipeline Context (from previous tasks)

*Pipeline: 1 of 1 predecessor tasks completed.*

### Previous Task: Design security framework
- **Agent Role**: solution_architect
- **Confidence Score**: 92/100

**Output:**
[full deliverable text from the architect]

**Use the above output to inform your work.
Build on what was produced — do not repeat or re-derive it.**
```

**Zero tool turns wasted.** The agent immediately has the full context.

**Design note**: The full predecessor output is injected deliberately — research (Omni-SimpleMem, 2026) found that full text outperforms summaries by 53%. For small pipelines (3-6 tasks) this is the right trade-off. Selective context access (manifest + on-demand fetch) is designed but deferred until pipelines exceed 10 tasks with fan-in dependencies.

---

## Auto-Comments and Artifacts

After every successful agent execution, the engine automatically posts a task comment:

```markdown
## Agent Execution Complete
- **Role**: solution_architect
- **Duration**: 145s
- **Tool Calls**: 9 (9 succeeded, 0 failed)
- **Confidence**: 92/100
- **Artifacts**:
  - result.json → `fetch(id: "artifact-cmxyz123")`
```

**Per-execution artifact policy** (post-2026-04-28 rework, `agentArtifactPolicy.ts:getReportMdDecision`):

| Task type | dependents | metadata signal | JSON artifact | report.md? |
|-----------|-----------|------------------|---------------|------------|
| **PIPELINE** (harness root) | any | `metadata.deliverableSourceTaskId` set + source SUCCESS | `pipeline-index.json` | ✅ — engine extracts source's `finalResponse` (the customer deliverable) |
| **PIPELINE** (harness root) | any | metadata set, source NOT yet SUCCESS | `pipeline-index.json` | ❌ — Option A defense (prevents harness CREATE writing misleading content) |
| **PIPELINE** (harness root) | any | (no metadata) | `pipeline-index.json` | ❌ — pre-existing pipelines or skipped Step 5a |
| Non-PIPELINE, **leaf** | 0 | `metadata.suppressDefaultReportMd: true` | `result.json` | ❌ — leaf is QA gate; harness publishes the deliverable |
| Non-PIPELINE, **leaf** | 0 | (no metadata) | `result.json` | ✅ — `report.md = finalResponse` verbatim |
| Non-PIPELINE, **intermediate** | 1+ | n/a | `result.json` | ❌ — chained context only |

**Artifacts explained:**
- `result.json` — Machine-readable: `finalResponse`, `confidenceScore`, `qualityMetrics`, `toolCalls`, optional `reportMdSource` provenance field, execution metadata
- `report.md` — Human-readable customer deliverable: the LLM's `finalResponse` rendered verbatim (no `## Generated Content` wrapper, no metadata headings)
- `pipeline-index.json` — Harness-only: forensic summary (the harness's own `finalResponse`) with quality gates, child roster, deliverable pointer

**The customer-facing deliverable is on the harness root post-rework**: `fetch(id: "artifact-<harness's report.md>")`. Per-child `result.json` files are forensic deep-dive material, not customer-facing.

**To read an artifact:**
```
fetch(id: "artifact-cmxyz123")
```

---

## Confidence Scores and the Completion Loop

Every agent is instructed to end with "Confidence: N/100". The engine parses this and stores it in `result.json`.

### For Manual Pipelines

Check confidence after each execution:
```
perform(action: "agent.results", taskId: "...")
// Look for confidenceScore in the response
```

### For the Pipeline Harness

The harness automates the completion loop:

| Confidence | Harness Action |
|-----------|---------------|
| **>= 70** | Accept result, proceed to next task |
| **50-69** | Re-execute once with feedback comment |
| **< 50** | Escalate to human — post comment asking for review |
| **Failed** | Retry once, then escalate |

Maximum **1 re-execution per task** at the protocol level (per `pipeline-orchestrator-protocol` Step 3: *"Re-execute each child AT MOST ONCE. If a child's re-execution is also < 70, escalate."*). Plus a soft-fail retry on FAILED-status executions before escalation.

**Hypothesis-driven feedback**: When re-executing a low-confidence task, the harness reads the artifact and diagnoses what's specifically weak (e.g., "the risk analysis lacks industry benchmarks") rather than just saying "try again." This produces better second attempts. Empirically observed in Run 2 (2026-04-28, harness `cmohyjjzr0011yxagg4hecbtz`): a Reviewer scored 25/100 was diagnosed by the harness ("Reviewer fabricated critique without reading article"), corrected via a structured `**HARNESS DIAGNOSTIC**` comment, and re-executed to 92/100.

---

## Incomplete Pipeline Handling

If the harness runs out of budget or hits rate limits before finishing all tasks, it will:
1. List which tasks completed and which are still OPEN
2. Explain why (rate limit, budget, error)
3. Provide exact `agent.execute` commands for each remaining task
4. State clearly: "Pipeline incomplete — N of M tasks executed"

It will **not** write a success summary if children are unfinished. This prevents you from thinking the work is done when it isn't.

---

## Dependency Enforcement

If you try to execute a task before its dependencies are complete, you'll get a clear error:

```
Cannot execute — 1 dependency task(s) not yet complete:

  - "Design security framework" (status: OPEN, execution: none)

Execute the dependency tasks first, then retry.
```

This prevents invalid pipeline states.

---

## Managing Dependencies

### Set dependencies at creation time
```
perform(action: "task.create", parameters: {
  ...,
  dependencyIds: ["TASK_A_ID", "TASK_B_ID"]
})
```

### Update dependencies on existing task
```
perform(action: "task.update", taskId: "TASK_C_ID",
  dependencyIds: ["TASK_A_ID", "TASK_B_ID"])
```
This replaces all existing dependencies.

---

## Common Pipeline Patterns

### Security Assessment Pipeline (validated empirically by Run 7, 2026-04-29)
```
ARCHITECT (Solution Architect) → Design assessment framework
    ↓
REVIEWER (Security Analyst) → Execute audit against framework
    ↓
ANALYST (Business Analyst) → Produce remediation roadmap with ROI  ⭐ deliverable producer (Step 5a target — leaf)
```

### Development Pipeline
```
ARCHITECT (Solution Architect) → Design architecture
    ↓
BUILDER (Senior Software Developer) → Implement
    ↓
REVIEWER (QA Test Engineer) → Test and validate  ← may need suppress if Documenter is the customer-facing leaf
    ↓
DOCUMENTER (Technical Writer) → Document  ⭐ deliverable producer (Step 5a target — leaf)
```

### Go-to-Market Pipeline
```
ANALYST (Data Analyst) → Market analysis and sizing
    ↓ (parallel)
ANALYST (Marketing Strategist) → Competitive positioning
    ↓
ANALYST (Business Analyst) → Business case with ROI
    ↓
DOCUMENTER (Technical Writer) → Executive presentation  ⭐ deliverable producer (Step 5a target — leaf)
```

**In default pipelines, the LEAF child is the deliverable producer** (the harness wires `metadata.deliverableSourceTaskId = <leaf id>` AND `metadata.suppressDefaultReportMd = true` on the same leaf). Net effect: customer fetches harness's `report.md` (= leaf's finalResponse extracted by engine), single artifact location instead of two competing report.md files. Validated empirically by Run 7 (Security Assessment, 2026-04-29). For synthesis pipelines (Acquirer → Harvester → Editor → Reviewer), the deliverable producer is the **Editor (intermediate)**, not the leaf — see `artifact-synthesis-protocol` for that shape.

---

## Known Limitations

### Token Budget

The harness uses `claude-sonnet-4-5` with a **1M token/hour budget** and **10M token/day budget** (configurable in `lib/services/llm/types.ts`). Each child task execution consumes tokens for both the harness's orchestration calls AND the child agent's execution.

A 6-task pipeline typically completes in 8-10 minutes and ~400-500K tokens. These limits support ~20 pipeline runs per day during active development.

There is also an **MCP rate limit of 300 requests/minute** (configurable via `MCP_RATE_LIMIT_MAX_REQUESTS` env var). The harness fires many rapid API calls during orchestration — this limit provides headroom.

**What happens**: If budget or rate limits are hit, the harness lists completed and remaining tasks with exact resume commands.

**How to resume**: After the hourly budget resets, execute remaining tasks manually:
```
// Check pipeline status
project(action: "task.list", povId: "...", status: "OPEN")

// Execute remaining tasks in dependency order
perform(action: "agent.execute", taskId: "REMAINING_TASK_ID")
```

Context chaining is automatic — each task will receive its dependency's output even when executed manually.

### Tool Turn Limit

The harness has a **100-turn tool call limit** (configurable via `maxToolTurns` in template metadata). Each child task requires ~4-5 tool calls. A 6-task pipeline needs ~50-60 calls, well within the limit. Pipelines of 10+ tasks may approach the limit.

### Self-Completion Guard Dependency on Tool-Use Mechanism

The self-completion guard (§3.5 in the whitepaper) is a **prompt-level** instruction that tells the harness to call `task.list` and verify all children are COMPLETED before reporting success. This works when the native `tool_use` mechanism is functional. If the LLM is invoked with no tool definitions (e.g., `mcpToolRegistry` empty in the hosting process), the model emits tool calls as text instead of native blocks, and the guard's own verification call is hallucinated — making every prompt-level safety check fail simultaneously. Since Apr 10 2026, an **engine-level hard-fail guard** in `agentExecutionEngine.ts` catches this class of failure before the LLM is ever called: if `getToolDefinitions()` returns empty, the execution throws immediately with a diagnostic error naming the likely cause. This defense-in-depth layer means the prompt-level guard no longer needs to be the last line of defense.

### Artifact Retention

Per-task artifact retention is capped at **10 successful + 10 failed executions** (raised from 5/5 on 2026-04-20 — see comment at `agentExecutionEngine.ts:1840-1841`). Older executions and their artifacts are hard-deleted on every new completion. Auto-comments posted during the pruned execution remain (they are keyed on `taskId`, not `executionId`) but their `fetch(id: "artifact-...")` references become dangling pointers after the artifact is deleted. A design proposal for an `AgentExecutionArchive` model to preserve pruned execution metadata is at `.claude/knowledge/domain/harness/TODO-ARTIFACT-RETENTION-ARCHIVE.md`.

### Re-running a Completed Pipeline

Once a PIPELINE task reaches `status: COMPLETED`, it cannot be re-executed in place. The task status state machine enforces COMPLETED as terminal (`VALID_TASK_TRANSITIONS` in `lib/tasks/services/task.ts:20`), and both the MCP `task.update` and web GUI paths reject the `COMPLETED → OPEN` transition. The only working re-run path is to **create a fresh PIPELINE task** with the same objective — the harness will execute it as a new CREATE-mode run, producing its own fresh child stage.

**Stage reuse is safe under the post-2026-04-26 resolver** (`harnessModeResolver.ts`). Mode is determined by the new harness's own `metadata.pipelineStageId` (absent → CREATE) — NOT by sibling presence in the harness's parent stage. Each fresh PIPELINE task creates its own child stage in CREATE Step 2, so old completed pipelines and new runs cannot cross-contaminate even if both parent PIPELINE tasks live in the same parent stage. The pre-2026-04-26 "stage trap" (sibling-detection flipping mode to ORCHESTRATE on a fresh re-run) is gone.

Enabling in-place re-run on the SAME PIPELINE task is a separately tracked enhancement, deferred after 4-specialist review (82/100 average confidence, below the 85% proceed threshold) due to field leakage at MCP handlers, ~5 hours of cross-domain work, and 5 unanswered semantic questions. See `TODO-PIPELINE-INPLACE-RERUN.md` for the full findings.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Dependencies not created | `dependencyIds` missing from task.create | Verify parameter is included in the MCP call |
| Dependency-only update fails with NO_EFFECT | `dependencyIds` nested inside `parameters` object | Pass `dependencyIds` at the top level: `perform(action: "task.update", taskId: "...", dependencyIds: [...])` |
| Context not chained | Dependency task not marked COMPLETED | Check task status — execution should auto-set COMPLETED |
| Confidence score null | Agent didn't include "Confidence: N/100" in output | §8 instruction should prompt this; check if custom template overrides output rules |
| Task B executed before Task A | Dependency enforcement only applies via MCP agent.execute handler | Direct API calls bypass the check |
| Auto-comment missing | Execution failed before artifact creation | Check agent logs for errors |
| Harness didn't execute all tasks | Token budget or tool turn limit exceeded | See "Known Limitations" — execute remaining tasks manually |
| Orchestrate mode not triggered | Mode is `harnessModeResolver`-driven (post-2026-04-26): ORCHESTRATE only fires when `metadata.pipelineStageId` is set AND the child stage has tasks but some lack templates or dependencies (interrupted-CREATE recovery). It is NOT a user-invocable mode. | If you want a fresh decomposition, ensure `metadata.pipelineStageId` is absent on the PIPELINE task (e.g., create a new PIPELINE task) — that resolves to CREATE. Manual ORCHESTRATE-mode invocation isn't supported. |
| PIPELINE auto-assign didn't work | Task type not set to PIPELINE | Create with `type: "PIPELINE"` or manually assign via `agent.assign` |
| `agent.execute` on COMPLETED task returns "Invalid task status transition" | COMPLETED is terminal in the state machine — no in-place re-run | Create a fresh PIPELINE task in a NEW stage (not the old one). See "Re-running a Completed Pipeline" and `TODO-PIPELINE-INPLACE-RERUN.md` |
| New PIPELINE task escalates instead of decomposing | Pre-2026-04-26 "stage trap" caused this under the old sibling-detection logic. Post-resolver: shouldn't happen — fresh PIPELINE tasks resolve to CREATE regardless of parent-stage neighbors. | If you observe this post-2026-04-26, check `harnessModeResolver` logs for the resolved mode. Fresh PIPELINE tasks should always resolve to CREATE. |
| Pipeline SUCCESS but zero child tasks created (hallucinated pipeline) | `mcpToolRegistry` empty in the process hosting agent execution — LLM invoked with no tool definitions, emits Cline-style XML text instead of native `tool_use`, engine loop never fires | Verify `initializeMCPServices()` runs at startup in the process hosting agent execution. Since Apr 10 2026 Fix 2 (`e4a9c9ef`), `mcp-server-http-clean.js` calls this. If this regresses, `agentExecutionEngine.ts` will throw: "Agent execution requires MCP tools but none resolved from the tool registry" (Fix 1 `1f1c6477`). |
| Self-completion guard reports all children complete but some are still OPEN | Tool-use mechanism broken (model emitting XML text) — guard's own `task.list` verification call is also hallucinated | This is a deeper failure than the guard can catch alone. Fix 1's engine-level hard-fail on empty tools prevents this scenario from reaching the guard at all. |

---

## Production Performance

From real pipeline runs on production (Apr 2026):

| Metric | Value |
|--------|-------|
| Pipeline decomposition (harness planning) | ~30 seconds |
| Single specialist execution | 30-60 seconds |
| Full 4-task pipeline (create mode) | ~6.8 minutes |
| Full 6-task pipeline (create mode) | ~8.1 minutes |
| **Full 3-task pipeline (orchestrate mode)** | **~3.8 minutes** |
| Template inference accuracy (orchestrate mode) | 100% (10/10 across 3 tests) |
| Confidence score parsing | 100% success rate |
| Context chaining | 100% — both create and orchestrate modes |

---

## Architecture Reference

The harness lifecycle is **three modes plus engine post-processing**, with reactors providing loop closure between modes. The harness itself does NOT execute children — it composes structure (CREATE), then exits. Reactors cascade child execution. The harness re-enters once for SYNTHESIZE when all children are terminal.

### CREATE Mode (user-triggered first run)
```
Human triggers agent.execute on PIPELINE task
    ↓
harnessModeResolver.ts (pre-LLM): metadata.pipelineStageId absent → resolve mode = CREATE
    ↓
Pipeline Harness (sonnet) reads Harness Context block
    ↓ project(action: "pov.details") — POV context
    ↓ stage.create — fresh child stage; engine writes harnessTaskId back-pointer onto stage.metadata
    ↓ task.update self — record metadata.pipelineStageId
    ↓ task.create × N — typed children with dependencyIds
    ↓ agent.assign × N — templates per child
    ↓ task.update self — Step 5a: metadata.deliverableSourceTaskId = <deliverable producer child id>
    ↓ task.update <leaf> — Step 5a: metadata.suppressDefaultReportMd = true
    ↓ task.comment — PIPELINE QUEUED breadcrumb (first-line **Child stage:** id — name)
    ↓
Harness EXITS. pipeline-index.json written by engine (no report.md — Option A).
```

### Cascade Phase (reactor-driven, no harness involvement)
```
taskReadyReactorService queues dep-free children (children with no upstream deps)
    ↓
Each child executes via agentExecutionEngine
    ↓ Child receives §6 Pipeline Context — upstream's result.json.finalResponse auto-injected
    ↓ Child produces finalResponse → result.json (engine wraps)
    ↓ For unsuppressed leaves: also report.md (= finalResponse verbatim)
    ↓
On child completion → reactors fire:
    • maybeQueueReadyDependents — unblocks next children with satisfied deps
    • maybeRetriggerPipelineHarness — checks if all children of harness's child stage are terminal
    ↓
Children cascade until ALL terminal (COMPLETED or FAILED).
```

### SYNTHESIZE Mode (reactor-triggered)
```
pipelineRetriggerReactorService: harness's child stage all-terminal → queue harness execution
    ↓
harnessModeResolver.ts (pre-LLM): pipelineStageId set + all children terminal → resolve mode = SYNTHESIZE
    ↓
Pipeline Harness (sonnet) reads Harness Context block
    ↓ Reads each child's confidenceScore (via task.context or chained context)
    ↓ Applies quality gate: ≥70 accept; 50-69 retry once with diagnostic; <50 escalate
    ↓ Composes synthesis prose: breadcrumb + quality gates table + audit trail + deliverable pointer
    ↓ Pointer uses placeholder: "**📄 Final deliverable:** fetch(id: "artifact-{{HARNESS_REPORT_MD_ID}}")"
    ↓ task.complete (4-point invariant gate at server)
    ↓ task.comment — final SYNTHESIZE comment
    ↓
Harness EXITS.
    ↓
Engine post-processing (still inside same prisma.$transaction):
    ↓ getReportMdDecision — sees decision.source === 'upstream'
    ↓ Extraction: tx.agentArtifact.findFirst on source's result.json (POV-scoped)
    ↓ Writes harness's report.md = source's finalResponse content
    ↓ Substitution: scans pipeline-index.json content for {{HARNESS_REPORT_MD_ID}}
    ↓ Replaces with just-created report.md artifact ID via tx.agentArtifact.update
    ↓ Adds reportMdSource forensic field to result.json
    ↓
Transaction commits. Harness COMPLETED.
Customer fetches: fetch(id: "artifact-<harness's report.md>") → clean prose deliverable.
```

### ORCHESTRATE Mode (rare — interrupted CREATE recovery)

Fires only when `metadata.pipelineStageId` is set AND child stage has tasks but some lack templates or dep wiring (e.g., a CREATE was killed mid-flight by pm2 restart). The harness finishes the partial setup and exits. Same as CREATE for cascade + SYNTHESIZE downstream.

**Key files:**
- `lib/services/agentArtifactPolicy.ts` — `getReportMdDecision()` discriminated-union policy gate (post-2026-04-28)
- `lib/services/harnessModeResolver.ts` — pre-LLM mode resolution (since 2026-04-26)
- `lib/services/agentExecutionEngine.ts` — Execution engine + artifact creation + **engine extraction at lines ~1685-1730** + **substitution at lines ~1810-1851** + **20-min stale-execution watchdog at lines 162-218** + **hard-fail guard on empty tool registry** (Apr 10 2026)
- `lib/services/pipelineRetriggerReactorService.ts` — Auto-fires SYNTHESIZE when all children terminal
- `lib/agents/harness/context-chainer.ts` — Automatic §6 Pipeline Context chaining
- `lib/services/agentTaskService.ts` — Pre-execution chaining hook
- `lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts` — Dependency enforcement at MCP entry
- `lib/services/pipelineProtocolValidator.ts` — Post-execution protocol-step validator (forensic; non-blocking)
- `lib/server-init.ts` — `initializeMCPServices()` — embedded MCP server + tool registry bootstrap
- `mcp-server-http-clean.js` — paichart-mcp entrypoint; **calls `initializeMCPServices()` at startup** since Fix 2 (`e4a9c9ef`, Apr 10 2026)
- `scripts/seed-harness-template.ts` — Pipeline Harness template definition
- `scripts/seed-protocol-prompts.ts` — protocol prose: `pipeline-orchestrator-protocol` v3.7.1, `artifact-synthesis-protocol` v1.3.0

**See also**: `HARNESS-MENTAL-MODEL.md` (concepts), `PIPELINE-DATAFLOW-REFERENCE.md` (per-role I/O), `PIPELINE-OBSERVABILITY-GUIDE.md` (admin runtime investigation).
