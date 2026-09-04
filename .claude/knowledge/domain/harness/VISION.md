# Vision: Distributed Agent Harness

**Created**: 2026-04-03
**Revised**: 2026-04-03 (v2 — informed by claw-code/clawhip/OmX/OmO research)
**Status**: Vision document — not yet planned for implementation
**Prerequisite**: Template rationalization + type system (DONE: `template-type-system-design-2026-04-03.md`)

---

## The Core Insight

> "The code was never the product. The system that wrote it is."
> — Sigrid Jin on claw-code

The claw-code project demonstrated that a coordinated agent team — Architect, Executor, Reviewer — can port an entire codebase while the developer sleeps. The developer's contribution was ten sentences in Discord. The output was 117,000 GitHub stars.

**The lesson for pAIchart**: Our platform already has the primitives — task decomposition, template types, agent execution, artifact chaining, MCP service orchestration. What we lack is the **coordination layer** that wires them into a self-driving development loop. This document is the vision for that layer.

---

## What We Learned from the Ecosystem

### The claw-code Stack (3 components)

| Component | Role | pAIchart Equivalent |
|-----------|------|-------------------|
| **oh-my-codex (OmX)** | Workflow keywords ($architect, $team, $ralph) that decompose intent into structured multi-step work | Task descriptions + template assignment |
| **clawhip** | Event daemon that routes git/GitHub/agent lifecycle events to Discord — **outside the agent's context window** | PostgreSQL NOTIFY/LISTEN + WebSocket (partially exists) |
| **oh-my-openagent (OmO)** | Multi-agent coordinator: Sisyphus orchestrates, routes by task category, manages handoffs and the "Ralph Loop" for persistence | **This is the gap.** The harness template. |

### Key Architecture Patterns Worth Adopting

**1. Separation of Notification from Execution (clawhip pattern)**
Agents should never manage their own status reporting. clawhip watches agent lifecycle events and routes notifications to channels. This keeps the agent's context window focused on the actual work. pAIchart already has this partially — our PostgreSQL NOTIFY/LISTEN system broadcasts events, and the UI picks them up. But agents themselves still report via task.comment, which consumes their token budget.

**Implication**: The harness should own progress reporting. Agents do work. The harness tells the world.

**2. Category-Based Routing, Not Model Selection (OmO pattern)**
oh-my-openagent doesn't ask "which model should handle this?" It asks "what category of work is this?" The harness routes to `visual-engineering`, `deep`, `quick`, or `ultrabrain` categories, and the system maps categories to optimal models automatically.

**Implication**: This maps directly to our `TemplateType` enum. The harness doesn't pick a template by name — it picks by type. ARCHITECT for design work, BUILDER for implementation, REVIEWER for validation. The category→model mapping is already in our seed scripts (haiku for most, sonnet for workflow orchestration).

**3. The Ralph Loop — Persistence Until Completion (OmX pattern)**
$ralph doesn't fire-and-forget. It maintains a single agent ownership model that runs verification cycles, adapts to failures, and persists until the task is done or explicitly abandoned. The system reactivates incomplete work.

**Implication**: Our current execution is single-shot — agent runs, produces artifacts, stops. The harness should implement a completion loop: execute → verify → if incomplete, re-execute with feedback. This is the difference between "an agent ran" and "the work got done."

**4. The Development Loop (claw-code pattern)**
```
Architect → Executor → Reviewer → (if issues) → Architect → ...
```
This isn't a linear pipeline. It's a **loop** that iterates until the Reviewer passes. The loop is the product. Individual agent executions are just steps within it.

**Implication**: The harness must model cycles, not just sequences. Task dependencies in pAIchart are currently DAGs (directed acyclic graphs). A loop requires either: (a) the harness creating new tasks dynamically per iteration, or (b) a re-execution mechanism on the same task with updated context.

**5. Text-Based Leadership, Not Micromanagement (claw-code philosophy)**
The developer typed "$team implement the core runtime" and walked away. Not "write function X in file Y with these parameters." The agents decomposed the intent themselves.

**Implication**: The harness template's prompt should accept high-level objectives ("Build and deploy the authentication module") and decompose them into typed tasks. The human's job is **architectural clarity and task decomposition** — knowing what to build and why. The agents handle how.

---

## pAIchart's Unique Position

We're not building another agent framework. We're building a **PoV delivery system** where the harness orchestrates agents to deliver customer value. This gives us constraints that generic frameworks don't have:

| Generic Framework | pAIchart Harness |
|------------------|-----------------|
| Writes code | Delivers PoV outcomes (analysis, architecture, security assessments, deployment plans) |
| Output is files in a repo | Output is task comments, artifacts, and customer-facing deliverables |
| Developer is the user | Sales Engineer is the user; customer is the audience |
| Success = code compiles | Success = customer's compelling event for purchase advances |
| Agents share a filesystem | Agents share a POV context (objective, solution, team, timeline) |

This is what makes our harness different from OmX/clawhip/OmO. They solve "write code while I sleep." We solve "run a Proof of Value while I focus on the customer relationship."

---

## Architecture: The Three Layers

### Layer 1: Orchestration (the Harness)

A meta-agent that receives a high-level objective and produces a plan of typed tasks.

```
Human: "Assess the security posture of Acme Corp's cloud infrastructure
        and produce a remediation roadmap"

Harness decomposes:
  1. [ARCHITECT] Design security assessment framework for Acme's AWS/Azure environment
  2. [REVIEWER]  Run security audit against CIS benchmarks + ASD Essential Eight
  3. [ANALYST]   Analyze findings, quantify risk, calculate remediation ROI
  4. [DOCUMENTER] Produce executive remediation roadmap with timeline
  5. [REVIEWER]  Review roadmap for completeness and accuracy
```

The harness:
- Creates tasks with appropriate `templateType` assignments
- Sets dependencies (2 blocked by 1, 3 blocked by 2, etc.)
- Chains artifacts: each task's result.json feeds the next task's inputContext
- Monitors completion and handles the feedback loop (step 5 fails → back to step 4)
- Reports progress without consuming agent context

**Implementation**: A new template with `templateType: HARNESS` (9th type, added to enum). Its promptTemplate instructs the LLM to use MCP tools (project, perform) to create and manage child tasks.

### Layer 2: Coordination (the Event Router)

Inspired by clawhip — a system that watches agent lifecycle events and routes them appropriately, **outside the agent's context window**.

What we already have:
- PostgreSQL NOTIFY/LISTEN broadcasts task status changes
- WebSocket pushes updates to the UI
- Agent execution emits events (started, completed, failed)

What we need:
- Event aggregation: "3 of 5 tasks complete, 1 in progress, 1 blocked"
- Escalation rules: "if task blocked > 30 minutes, notify human"
- Progress rendering: dashboard view of the full pipeline
- Human mention: "Security audit found 3 critical issues — @steve review before proceeding"

**Implementation**: Extend existing event system. No new daemon — leverage PostgreSQL NOTIFY + a harness-aware progress aggregator in the UI.

### Layer 3: Execution (the Agent Team)

This is what we already have and just rationalized:

| Type | Role in Pipeline | Autonomy |
|------|-----------------|----------|
| ARCHITECT | Receives objective, produces structured plan | Medium — proposes, doesn't commit |
| BUILDER | Receives plan, implements | Medium — implements within scope |
| REVIEWER | Receives implementation, validates | Low — reports, doesn't modify |
| ANALYST | Receives data, derives insights | Medium — interprets and quantifies |
| OPERATOR | Manages deployment and coordination | High — manages execution flow |
| DOCUMENTER | Receives findings, produces deliverables | Medium — formats and structures |
| ORCHESTRATOR | Calls external MCP services | High — autonomous service interaction |
| GENERALIST | Handles miscellaneous tasks | Medium — adapts to context |

Each type maps to 1-3 templates with clear swim lanes (see `template-type-system-design-2026-04-03.md`).

---

## The Completion Loop (Ralph Pattern for pAIchart)

The critical innovation from $ralph: **don't stop until the work is done**.

### Current Flow (single-shot)
```
Task created → Agent executes → Artifacts produced → Done
```
No verification. No retry. The human checks quality manually.

### Harness Flow (completion loop)
```
Task created → Agent executes → Artifacts produced
    ↓
Harness inspects result (confidence score, completeness check)
    ↓
[Pass] → Mark complete, feed artifacts to next task
[Fail] → Create feedback context, re-execute (max N iterations)
[Block] → Escalate to human with specific question
```

The harness uses the confidence score already embedded in every agent output (per Universal Template's "End with a confidence score 0-100") as the gate. Below threshold → re-execute with feedback. Above threshold → advance the pipeline.

---

## What Exists vs What's Needed

| Capability | Status | Gap |
|-----------|--------|-----|
| Template types (ARCHITECT, BUILDER, etc.) | **DONE** | None |
| Task decomposition (parent/child, dependencies) | Exists | Harness automates creation |
| Artifact pipeline (result.json, report.md) | Exists | Automatic chaining needed |
| Agent execution engine (30-turn agentic loop) | Exists | No changes needed |
| MCP service orchestration | Exists | No changes needed |
| Event system (NOTIFY/LISTEN + WebSocket) | Exists | Aggregation + escalation needed |
| Harness template (meta-agent prompt) | **MISSING** | The core deliverable |
| Completion loop (Ralph pattern) | **MISSING** | Re-execution with feedback |
| Automatic context chaining | **MISSING** | Artifact → inputContext pipeline |
| Pipeline progress dashboard | **MISSING** | UI for multi-task visibility |

---

## Implementation Roadmap

### Phase 0: Manual Proof of Concept (no code changes, 1 session)
- Pick a real PoV workflow: ARCHITECT → BUILDER → REVIEWER
- Create 3 tasks manually with typed templates
- Manually chain inputContext (copy result.json content between tasks)
- Document: what's painful, what works, where the human spends time
- **Outcome**: Real friction data. Validates the pipeline concept.

### Phase 1: Automatic Context Chaining (1 session)
- Build helper: reads prior task's latest result.json artifact
- Auto-populates next dependent task's inputContext before execution
- Wire into agent-execute-handler (pre-execution hook)
- **Outcome**: Tasks chain without manual copy-paste. The pipeline flows.

### Phase 2: Harness Template (1-2 sessions)
- Add `HARNESS` to TemplateType enum
- Design the harness meta-prompt (with prompt-construction-specialist)
- The prompt instructs the LLM to:
  - Decompose an objective into typed tasks using `perform(action: "task.create")`
  - Set dependencies between tasks
  - Monitor status via `project(action: "task.list")`
  - Implement the completion loop (check confidence, re-execute or advance)
- Create the harness template with role guidance
- Test with a real POV workflow
- **Outcome**: One agent orchestrates a multi-task pipeline end-to-end.

### Phase 3: Event Aggregation & Dashboard (1 session)
- Pipeline progress view in the UI
- Event aggregation: "Pipeline: 3/5 tasks complete"
- Escalation: blocked task → notification to POV owner
- **Outcome**: Humans can observe multi-agent progress without checking each task.

### Phase 4: Production Hardening (ongoing)
- Completion loop tuning (confidence thresholds, max iterations, cost caps)
- Parallel execution (independent tasks run simultaneously)
- Human approval gates (harness proposes plan, human approves before execution)
- Cross-POV patterns (template pipelines: "run this 5-task security assessment on every new POV")
- Cost observability (token spend per pipeline, per task, per iteration)

---

## Phase 0 Results: Manual Proof of Concept (2026-04-04)

**POV**: Demo Financial Corp - Cloud Security Posture Review (production)
**Pipeline**: ARCHITECT → REVIEWER → ANALYST (3 tasks, sequential with manual context chaining)

### Execution Summary

| Step | Type | Template | Duration | Confidence | Artifacts |
|------|------|----------|----------|------------|-----------|
| 1 | ARCHITECT | Solution Architect | 94s | 92/100 | 160K |
| 2 | REVIEWER | Security Analyst | 49s | *not reported* | 93K |
| 3 | ANALYST | Business Analyst | 231s | *not reported* | 335K |
| **Total** | | | **374s (~6 min)** | | **589K** |

### What Worked
- All 3 tasks executed successfully, zero failures, zero retries needed
- Task 2 picked up the framework from Task 1 ("I now have the assessment framework from the Solution Architect") — context chaining works
- Template types matched the work correctly — ARCHITECT designed, REVIEWER audited, ANALYST synthesized
- New artifact format confirmed working in production — `finalResponse`, `qualityMetrics`, `confidenceScore` fields present in result.json
- Total pipeline time: ~6 minutes for a comprehensive 3-agent security assessment producing ~589K of structured output

### Friction Points

| # | Friction | Severity | Harness Fix |
|---|---------|----------|-------------|
| 1 | `inputContext` can't be set via MCP `agent.configure` alone — validation requires role/template/prompt | HIGH | Harness operates at service layer, bypasses MCP validation |
| 2 | Confidence score missing from 2 of 3 agents — regex parser found nothing in prose output | HIGH | Add structured `submit_result` tool call to Universal Template |
| 3 | Manual context chaining required SSH + raw SQL — no MCP tool for "feed Task A's output to Task B" | HIGH | Phase 1 deliverable: automatic context chaining |
| 4 | Only metadata passed between tasks, not the actual `finalResponse` text | MEDIUM | Harness reads result.json, extracts finalResponse, injects into inputContext |
| 5 | MCP execute timeout (5 min) too short for long-running agents (Task 3 = 231s + overhead) | LOW | Harness uses service layer directly, no MCP timeout |
| 6 | Dependencies are informational, not enforced — Task 2 could execute before Task 1 finishes | MEDIUM | Harness checks dependency completion before dispatching |

### Key Insight

**The pipeline works. The agents produce real, useful, chainable output.** The bottleneck is entirely plumbing — getting output from one task into the next. Agent quality is good. The confidence score gap is the biggest concern for the completion loop.

### Phase 0 → Phase 1 Priorities (informed by real friction)

1. **Automatic context chaining** — Read result.json from completed task, inject finalResponse into next task's inputContext. Eliminates friction 1, 3, 4.
2. **Structured confidence reporting** — `submit_result` tool call with `{ confidence: number, summary: string }` so agents report programmatically. Eliminates friction 2.
3. **Dependency enforcement** — Check `getEnhancedTask(includeDependencies)` before dispatching. Eliminates friction 6.

---

## Phase 1 Implementation Status (2026-04-04)

### What's Built and Deployed

| Component | Status | Commit |
|-----------|--------|--------|
| Automatic context chaining | **DEPLOYED** | `480f5916` |
| Structured pipeline context in prompt (§6) | **DEPLOYED** | `f140b73b` |
| `dependencyIds` on task.create MCP action | **DEPLOYED** | `0bdb0185` |
| `dependencyIds` on task.update MCP action | **DEPLOYED** | `0bdb0185` |
| MCP tool schema advertises dependencies + confidence | **DEPLOYED** | `f140b73b`, `36033c2c` |
| Confidence score parsing (6 regex patterns) | **DEPLOYED** | `0bdb0185` |
| Structured confidence on task.complete | **DEPLOYED** | `36033c2c` |
| Auto-comment with artifact fetch commands | **DEPLOYED** | `36033c2c` |
| §8 Output Requirements (template-independent confidence) | **DEPLOYED** | `5188e5e5` |
| Task status → COMPLETED on execution success | **DEPLOYED** | `0bdb0185` |
| DEFAULT_MAX_TOKENS raised to 8000 | **DEPLOYED** | `0bdb0185` |
| Artifact restructure (clean report.md + complete result.json) | **DEPLOYED** | `c01a1b43` |
| Execution retention increased to 5 | **DEPLOYED** | `c01a1b43` |
| Template type system (8 types) | **DEPLOYED** | `8c6b38b3` |
| Graph depth limit 20 + topologicalSort | **DEPLOYED** | `600ee091` |
| Specialist knowledge updated (4 files) | **DEPLOYED** | `d8b68131` |

### How Pipeline Execution Works Today (UX)

**Creating a pipeline via MCP** (no SQL, no SSH):
```
// Step 1: Create tasks with typed templates and dependencies
perform(action: "task.create", parameters: {
  povId: "...", title: "Design security framework", stageId: "..."
})
// → returns taskId: "task-A"

perform(action: "agent.assign", taskId: "task-A", agentTemplateName: "Solution Architect")

perform(action: "task.create", parameters: {
  povId: "...", title: "Execute security audit", stageId: "...",
  dependencyIds: ["task-A"]
})
// → returns taskId: "task-B"

perform(action: "agent.assign", taskId: "task-B", agentTemplateName: "Security Analyst")

// Step 2: Execute first task
perform(action: "agent.execute", taskId: "task-A")
// → agent runs, produces result.json with finalResponse + confidenceScore

// Step 3: Execute second task (context chains automatically)
perform(action: "agent.execute", taskId: "task-B")
// → context chainer reads task-A's result.json
// → injects finalResponse into task-B's inputContext
// → agent sees structured "Pipeline Context" section in prompt
// → agent builds on previous output without manual intervention
```

**What the agent sees in its prompt (section §6)**:
```markdown
## Pipeline Context (from previous tasks)

*Pipeline: 1 of 1 predecessor tasks completed.*

### Previous Task: Design security assessment framework
- **Agent Role**: solution_architect
- **Confidence Score**: 92/100

**Output:**
[full deliverable text from the architect]

**Use the above output to inform your work. Build on what was produced — do not repeat or re-derive it.**
```

**Zero tool turns wasted** on discovering previous work. The harness feeds the agent.

### What's Still Needed for Phase 2

| Gap | Priority | Status |
|-----|----------|--------|
| **Harness template** (the meta-agent orchestrator) | HIGH | **DONE** — `Pipeline Harness` template, commit `6d3e3cf7` |
| **Harness production test** | HIGH | **DONE** — first autonomous run, see results below |
| **Tool turn limit for harness** | MEDIUM | 30 turns tight for 5-task pipelines — see options below |
| **Pipeline progress dashboard** | LOW | Not started — UI for multi-task pipeline status |

### E2E Test Results (2026-04-04) — All Pass

| Test | Result |
|------|--------|
| Dependencies via MCP (`dependencyIds` on task.create) | **PASS** — record created atomically |
| Dependency enforcement (execute blocked task) | **PASS** — clear error listing incomplete deps |
| Task A: auto-comment with fetch commands | **PASS** — role, duration, tool calls, confidence, artifact URIs |
| Task A: confidence score parsed (§8 instruction) | **PASS** — 92/100 |
| Task A: status synced to COMPLETED | **PASS** |
| Task B: context auto-chained from dependency | **PASS** — inputContext populated with `chainedFrom` |
| Task B: pipeline context rendered in agent prompt | **PASS** — structured §6 with previous output |
| Task B: confidence score parsed | **PASS** — 88/100 |

Pipeline: ARCHITECT (92/100, 145s) → ANALYST (88/100, 370s). Fully automatic context flow, zero manual intervention.

### First Autonomous Harness Run (2026-04-04)

**Objective given**: "Assess cloud security posture and produce remediation roadmap for Demo Financial Corp"

**What the harness did autonomously** (222 seconds, 22 tool calls, confidence 88/100):

1. Called `project(pov.details)` to understand the customer context
2. Decomposed the objective into **5 typed tasks**:
   - PIPELINE-1: Design security assessment framework (ARCHITECT → Solution Architect)
   - PIPELINE-2: Gather cloud infrastructure data (ORCHESTRATOR → MCP Service Orchestrator)
   - PIPELINE-3: Execute security audit against benchmarks (REVIEWER → Security Analyst)
   - PIPELINE-4: Produce remediation roadmap with ROI (ANALYST → Business Analyst)
   - PIPELINE-5: Create executive summary and report (DOCUMENTER → Technical Writer)
3. Wired dependencies: 1→2→3→4→5
4. Posted a detailed plan as a task comment with all IDs and dependency mapping
5. Executed PIPELINE-1 (Solution Architect) — completed with SUCCESS
6. Posted execution progress update

**Result**: 5 tasks created, assigned, dependency-wired, 1 executed. The remaining 4 are ready — created with correct templates and dependencies.

### Tool Turn Limit: Design Decision Needed

The harness used 22 of 30 tool turns and could only fully execute 1 of 5 child tasks. Each child task execution requires ~4 tool calls (create + assign + execute + status/results). A 5-task pipeline needs ~25 calls minimum for creation + 20 for execution = 45 total.

**Options**:

| Option | Approach | Pros | Cons |
|--------|---------|------|------|
| **A: Increase MAX_TOOL_TURNS** | Raise from 30 to 60 for harness executions | Simple, harness completes in one pass | Higher cost, longer timeout needed |
| **B: Two-phase execution** | Harness creates all tasks in first run, then re-execute to continue pipeline | Works within 30 turns, natural checkpoint | Requires re-execution, human must trigger phase 2 |
| **C: Create-only harness + separate executor** | Harness only decomposes and creates; a separate mechanism executes | Clean separation of planning vs execution | More complex, two templates needed |
| **D: Event-driven continuation** | Harness creates tasks, engine auto-executes when dependencies are met | Fully automatic, no re-execution needed | Requires new event-driven execution trigger (not yet built) |

**Recommendation**: Option A for immediate use (simple, the harness is already expensive with sonnet). Option D for the long-term vision — the event system can trigger executions when all dependencies complete, removing the need for the harness to manually execute each task.

**Confidence reporting**: Addressed via three complementary mechanisms:
1. §8 Output Requirements instructs ALL agents (template-independent) to end with "Confidence: N/100"
2. 6-pattern regex parser extracts score into result.json `confidenceScore` field
3. `task.complete` accepts optional `confidence` param stored in task metadata (harness/manual use)
4. Context chainer prefers structured metadata confidence over regex-parsed

---

## Specialist Consultation: Existing Infrastructure Mapping

*Six specialists consulted (2026-04-03): discovery-scout, mcp-hub-specialist, event-system-specialist, agent-execution-specialist, workflow-orchestration-specialist, architectural-review-specialist.*

**Headline finding: ~80% of the infrastructure already exists.** The harness is an integration project, not a greenfield build.

### What Already Exists (leverage directly, no changes needed)

| Component | File | Harness Use |
|-----------|------|-------------|
| Task creation + dependencies | `lib/tasks/services/task.ts` | Create typed sub-tasks, wire DAG atomically |
| Template type lookup | `prisma.agentTemplate.findFirst({ where: { templateType } })` | Auto-assign templates by type |
| Agent execution trigger | `AgentTaskService.executeAgentOnTask()` | Programmatic fire-and-forget dispatch with CAS guard |
| Artifact storage | `AgentArtifact` table (result.json + report.md) | Read completed output for chaining |
| Chained context injection | `task.inputContext` → prompt section §6 | Write previous output; engine injects automatically |
| OrchestrationEngine | `lib/services/workflow/core/orchestration-engine.js` | `{{step.N.output.field}}` variable chaining, sequential/parallel/conditional |
| InternalServiceRouter | `lib/mcp/server/tools/internal/InternalServiceRouter.js` | Zero-latency in-process dispatch |
| Event system | `SecureExecutionEvents` (PostgreSQL NOTIFY/LISTEN) | Reactive completion detection |
| SharedEventConnectionPool | `lib/events/shared-connection-pool.ts` | Register harness as first-class event consumer |
| PENDING_REVIEW status | `ExecutionStatus` enum | Human escalation gate — already in schema + GUI |
| Workflow tracking | `OrchestrationTracker` + `MCPWorkflowExecution` | Pipeline audit trail for free |
| TasksActionRouter | `lib/mcp/tasks/action/tasks-action-router.ts` | Single dispatch point for all task/agent actions |
| System actor identity | `userId: 'system'` | Activity service already handles this |
| TaskSubscriptionService | `lib/services/taskSubscriptionService.ts` | In-process pub/sub for task state changes |
| Progress calculation | `lib/pov/utils/progressCalculation.ts` | Reusable completion percentage functions |

### What Must Be Built (3 new components)

**1. Pipeline Orchestrator** (`lib/agents/harness/pipeline-orchestrator.ts`)
The meta-agent coordinator. Decomposes objectives into typed tasks, wires dependencies, tracks pipeline state, drives the completion loop. Uses all the primitives above but the coordination logic is new. The OrchestrationEngine's `callService` injection pattern is the foundation — plug in an agent-execution adapter.

**2. Confidence Score Parser**
Extracts the 0-100 confidence score from `result.json` to gate the completion loop. Two options: (a) regex parse from prose output, or (b) instruct agents to call a `submit_result` tool with `{ confidence: number, summary: string }` for structured extraction. Option (b) is cleaner and should be added to the Universal Template's output contract.

**3. Escalation Trigger**
Sets `executionStatus: 'PENDING_REVIEW'` and fires a `TaskNotification` when the harness determines a task is blocked (repeated low confidence, repeated failures, dependency deadlock). The notification infrastructure exists in `taskNotificationService.ts`; only the trigger logic is missing.

### The "Aha" Discovery: OrchestrationEngine as Foundation

All specialists independently pointed to the OrchestrationEngine as the most directly reusable component. Its `callService` injection pattern means we can plug in an agent-execution adapter without touching the engine. The variable chaining already handles data flow. The harness becomes:

```
Harness Meta-Agent
  → decomposes objective into steps
  → calls OrchestrationEngine.execute(steps, agentCallService)
  → agentCallService triggers executeAgentOnTask() per step
  → engine chains outputs via {{step.N.output}} references
  → harness checks REVIEWER confidence score
  → if low: re-invoke engine with feedback context
  → if high: advance pipeline, report completion
```

This mirrors how MCP workflows work today — the only difference is that steps call agents instead of external services.

### Architectural Constraints and Recommendations

Six constraints were identified. All are addressable with targeted changes:

**1. Graph depth limit (MAX_DEPTH=10)**
- *Impact*: Linear pipelines >10 steps throw in `checkDependencyCycle()`
- *Location*: `lib/utils/graph.ts`, exported `GraphLimits.MAX_DEPTH`
- *Recommendation*: Increase to 20 for harness pipelines. The constant is already exported and easy to change. Alternatively, make it configurable per-call so human-created task graphs keep the safety limit while harness pipelines use a higher one.

**2. Artifact pruning (keep last 2 successful executions)**
- *Impact*: If the harness lazy-reads artifacts from a predecessor task, they may be pruned
- *Location*: `lib/services/agentExecutionEngine.ts`, ~line 873
- *Recommendation*: Increase to keep last 5 successful executions (same as failed). This is a single constant change. Additionally, the harness should copy relevant output to `task.inputContext` on downstream tasks immediately at pipeline-advance time as a belt-and-suspenders measure.

**3. No native loop-back in OrchestrationEngine**
- *Impact*: Engine is single-pass; REVIEWER feedback loop requires re-invocation
- *Location*: `lib/services/workflow/core/orchestration-engine.js`
- *Recommendation*: Don't modify the engine. The harness orchestrator wraps it with an external loop — invoke engine per pass, check REVIEWER output, re-invoke with feedback if needed. This keeps the engine simple and the harness owns iteration logic. Max iterations (e.g., 3) are a harness configuration, not an engine concern.

**4. No push notifications for workflow step completion**
- *Impact*: The OrchestrationEngine caller currently polls; no event fired per step
- *Location*: `lib/events/execution-events.ts`
- *Recommendation*: Register the harness with `SharedEventConnectionPool` on the `execution_updates` channel. Task-level execution events ARE pushed via NOTIFY/LISTEN. The harness subscribes to `execution_${executionId}` events for reactive completion detection. No new notification infrastructure needed — use what exists at the task level, not the workflow level.

**5. Actor identity (harness has no JWT)**
- *Impact*: HTTP API handlers require JWT for `validatePOVAccess`
- *Location*: All route handlers in `app/api/`
- *Recommendation*: The harness must operate at the service layer (`TaskService`, `AgentTaskService`), never through HTTP handlers. These service functions accept `userId: 'system'` without JWT validation. This is the correct architectural boundary — the harness is infrastructure, not a user.

**6. No topological sort for execution order**
- *Impact*: `checkDependencyCycle()` validates DAGs but doesn't return execution order
- *Location*: `lib/utils/graph.ts`
- *Recommendation*: Add a `topologicalSort(taskId, prisma)` function alongside `checkDependencyCycle`. ~30 lines of BFS. Returns task IDs in execution order. The harness calls this after wiring all dependencies to derive its dispatch sequence.

### Constraint Summary

| # | Constraint | Effort | Type |
|---|-----------|--------|------|
| 1 | Graph depth limit | 1 line | Config change |
| 2 | Artifact pruning | 1 line | Config change |
| 3 | No loop-back | 0 lines | Design pattern (external loop) |
| 4 | No push notifications | 0 lines | Use existing NOTIFY/LISTEN |
| 5 | Actor identity | 0 lines | Use service layer directly |
| 6 | No topological sort | ~30 lines | New utility function |

**Total new code to address all constraints: ~30 lines.** The rest is design decisions.

---

## Design Principles

Drawn from the claw-code ecosystem and adapted for pAIchart:

1. **The human provides direction, not labor.** The Sales Engineer types "assess Acme's security posture" and focuses on the customer relationship. The agents deliver.

2. **Notification is not the agent's job.** Progress reporting lives outside the execution context. Agents focus on their work. The harness and event system handle communication.

3. **Route by type, not by name.** The harness picks REVIEWER, not "Security Analyst." The type system handles the mapping. This decouples orchestration logic from template inventory.

4. **Loops, not lines.** Real work iterates. The Reviewer sends the Builder back. The Architect refines the plan. The completion loop is the product; individual executions are just steps.

5. **Persistence over perfection.** The Ralph pattern: don't stop halfway. An incomplete first pass with a feedback loop beats a single perfect attempt. Set a confidence threshold and iterate.

6. **Architectural clarity is the bottleneck.** When execution is cheap, the scarce skill is knowing what to build and why. The harness amplifies clear thinking. It also amplifies unclear thinking — faster. Garbage in, garbage out, at scale.

---

## Open Questions

1. **Approval gates**: Should the harness auto-execute or propose a plan for human approval?
   - *Lean*: Auto-execute for low-risk (ANALYST, DOCUMENTER). Human approval for BUILDER, OPERATOR.
   - *Research*: OmO uses `$ralplan` for plan approval before `$ralph` execution. Two-phase.

2. **Failure recovery**: If a task fails after max iterations, does the harness skip it, block the pipeline, or escalate?
   - *Lean*: Escalate with context. "Security audit failed 3 times. Last error: [X]. @steve — proceed or abort?"

3. **Cost control**: Multi-agent pipelines multiply LLM costs. What are the guardrails?
   - *Lean*: Per-pipeline token budget. Harness tracks cumulative spend. Hard stop at threshold.
   - *Research*: OmO uses haiku for "quick" category, sonnet/opus only for "deep" and "ultrabrain."

4. **Context window discipline**: How do we prevent context bloat across a 5-task pipeline?
   - *Lean*: Each task gets a clean context. Only result.json summaries chain forward, not full histories.
   - *Research*: clawhip solved this by moving notifications out. OmO solved it with skill-scoped MCP servers that spin up and down.

5. **Scope boundary**: Where's the line between "automated orchestration" and overreach?
   - *Lean*: The harness creates tasks and chains context. It does NOT modify POV structure, create phases, or interact with customers. Human owns strategy; harness owns execution.

---

## Addendum: Vision Maturity Assessment

**Rating: 7.5/10 — Strong vision, known gaps remain**

### Strengths (8-9/10)

- **Pattern adoption**: The 5 patterns from claw-code (notification separation, category routing, Ralph loop, development loops, text-based leadership) map cleanly to pAIchart primitives without forcing.
- **Differentiation**: "PoV delivery, not code generation" is the right framing. Prevents building Yet Another Agent Framework.
- **Completion loop**: The single most important idea. Transforms agents from fire-and-forget to persistent-until-done.
- **Type system bridge**: TemplateType → harness routing connects the implemented type system to the future harness. This wasn't in v1.
- **Phased roadmap**: Each phase delivers value independently. Phase 0 requires zero code changes.

### Known Gaps (6-7/10)

1. **Harness prompt is hand-wavy.** We say "the LLM decomposes objectives into typed tasks" but haven't specified how. OmX solved this with explicit workflow keywords ($architect, $team). We need our equivalent — likely a structured decomposition format in the harness system prompt.

2. **Parallel execution glossed over.** OmO runs 5+ background specialists concurrently. Our engine is single-task. Phase 4 mentions parallel execution but doesn't address the hard problem: how do parallel agents share intermediate results without blocking?

3. **Human interface undefined.** claw-code's breakthrough was Discord — type a sentence, walk away. What's pAIchart's? The GUI? A chat input? MCP from Claude Desktop? "SE types one sentence" but where?

4. **No failure taxonomy.** "Escalate" is too vague. Real failures are different species: garbage output (model problem), tool inaccessible (infrastructure), quality rejected (needs iteration), task impossible (scope problem). Each needs a different response. OmO has category-specific error handling.

5. **Cost model absent.** A 5-task pipeline with 2 iterations = 10 executions. The harness itself likely needs sonnet/opus. What's the per-pipeline cost? What's acceptable for a PoV?

### Recommended Next Research

| Topic | Why | Source |
|-------|-----|--------|
| **OmO's Sisyphus prompt** | How the orchestrator actually decides task categories and manages the loop | oh-my-openagent source, AGENTS.md |
| **CrewAI process modes** | `sequential`, `hierarchical`, `consensual` — we only cover sequential + loop | [CrewAI docs](https://docs.crewai.com/) |
| **A2A protocol** | Google's Agent-to-Agent standard for inter-agent communication — should artifacts flow via A2A rather than custom inputContext? | Google A2A spec |
| **Real cost data** | Run Phase 0 and measure actual token usage. Replaces speculation with data. | Internal — no external research needed |

### What Would Reach 9/10

1. A concrete harness prompt draft showing objective decomposition
2. A worked example: full pipeline trace from objective → typed tasks → completion loop → deliverable
3. Cost model with real numbers from Phase 0
4. Decision on human interface (where the SE types that one sentence)

### Recommended Next Step

**Run Phase 0.** Don't research more — simulate the pipeline manually with a real PoV. Feel the friction. That will answer more questions than additional reading.

---

## The Two-Sided Harness: Trusted Advisor + AI Customer

### The Missing Dimension

The harness vision above is **one-sided**: our agents produce deliverables, the SE presents them to the customer. But a real POV is a **partnership**. The SE's goal isn't just to deliver work — it's to build the customer's confidence that they're working with a trusted advisor. Every interaction, every deliverable, every response time signal contributes to or erodes that trust.

This changes what the harness optimises for. A one-sided harness optimises for throughput (get the work done). A two-sided harness optimises for **trust** (get the right work done, framed for this customer's concerns, delivered at the right moment in their evaluation timeline).

### Customer Context Layer

The harness needs more than "what work needs doing." It needs:

- **Customer decision criteria** — What does this specific buyer care about? Cost? Security? Time-to-value? Compliance?
- **Compelling event timeline** — When is their purchase decision? Which deliverables are time-sensitive?
- **Stakeholder map** — Who reads the output? CTO needs architecture depth. CFO needs ROI numbers. Procurement needs compliance checkboxes.
- **Competitive context** — What are they comparing us against? Which differentiators to emphasise?

This context already lives in the POV model (objective, solution, team, timeline). The harness should use it to **frame** every deliverable, not just produce them. An architecture document for a finance customer in the EU should automatically emphasise GDPR compliance and data sovereignty. The same document for a US healthcare customer should lead with HIPAA.

**Implication for template types**: This suggests a 9th type might be needed — **ADVISOR** — whose job is specifically to frame and contextualise deliverables for the customer's perspective. Or it's a capability the harness itself provides, wrapping each deliverable in customer-appropriate framing before handing it to the SE.

### The AI-as-Customer Scenario

Here's where it gets transformative. The customer's "partner" in the POV evaluation may not be a human. Enterprises are increasingly using AI agents for:

- **Vendor evaluation** — AI agents that consume technical documentation and score vendors against requirements
- **Procurement analysis** — AI that evaluates proposals, checks compliance claims, compares pricing
- **Technical due diligence** — AI that reads architecture docs, identifies risks, generates follow-up questions
- **Security assessment** — AI that audits vendor security postures against frameworks

When the customer's evaluator is an AI agent, the trust model inverts:

| Human Customer | AI Customer |
|---------------|-------------|
| Trust built through relationship and credibility | Trust built through **verifiability** and **structured data** |
| Deliverables are PDFs and presentations | Deliverables are machine-readable structured formats |
| "Persuade and present" | "Expose and let them verify" |
| Response time signals attentiveness | API availability signals reliability |
| The SE is the interface | The **MCP server** is the interface |

This means:
1. **Deliverables need dual formats** — human-readable (markdown, PDF) and machine-readable (JSON, structured schemas) produced from the same pipeline
2. **Claims need evidence chains** — "We meet CIS Benchmark Level 2" backed by verifiable audit artifacts, not just prose
3. **The MCP server becomes the customer-facing channel** — pAIchart already exposes POV data via MCP to Claude Desktop and ChatGPT. A customer's AI could connect and evaluate directly.
4. **A2A protocol becomes the inter-agent communication layer** — our harness agents talk to the customer's evaluation agents via a standard protocol

### What This Means for the Harness

The harness isn't just orchestrating **our** agents. In the AI-customer scenario, it's mediating a conversation between **our agents and theirs**. This is fundamentally different from anything in the claw-code ecosystem, which is entirely inward-facing (developer → agents → code).

```
Current vision (one-sided):
  SE → Harness → [Our Agents] → Deliverables → SE presents to Customer

Two-sided (human customer):
  SE → Harness → [Our Agents] → Deliverables framed for customer context
                                        ↕
                              Customer feedback loop
                              (questions, concerns, new requirements)

Two-sided (AI customer):
  SE → Harness → [Our Agents] → Structured deliverables + evidence
                                        ↕  (A2A / MCP)
                              [Customer's AI Agents]
                              (evaluation, verification, scoring)
```

The third model is where pAIchart could be genuinely differentiated. No POV platform today supports agent-to-agent evaluation. The customer's AI asks our agents questions, verifies claims, requests additional evidence — all without the SE manually shuttling documents.

### Roadmap Impact

This doesn't change Phases 0-4 (the internal harness). It adds:

**Phase 5: Customer Context Integration**
- Harness uses POV objective, customer region, and stakeholder roles to frame deliverables
- Deliverables include customer-specific compliance callouts automatically
- ADVISOR type or harness framing layer produces customer-facing summaries

**Phase 6: Dual-Format Deliverables**
- Agent output includes both human-readable and machine-readable formats
- Structured schemas for common deliverable types (security assessment, architecture review, ROI analysis)
- Evidence chain linking claims to supporting artifacts

**Phase 7: Agent-to-Agent POV Interface**
- Expose POV deliverables via MCP resources with structured schemas
- Implement A2A protocol endpoints for external agent communication
- Customer's AI can query, verify, and score without human intermediation
- Trust model based on verifiable evidence, signed artifacts, audit trails

### Research Required

| Topic | Why | Source |
|-------|-----|--------|
| **A2A protocol (Google)** | Standard for cross-organisation agent communication. How do agents from different parties authenticate, exchange structured data, and maintain conversation state? | [Google A2A spec](https://github.com/google/A2A) |
| **Agent trust models** | How does an AI evaluator "gain confidence" in an AI advisor? Academic work on verifiable computation, signed attestations, and evidence chains for AI systems. | Academic papers on AI trust, W3C Verifiable Credentials |
| **Enterprise AI procurement patterns** | How are enterprises actually using AI in vendor evaluation today? What formats do they consume? What signals trust? | Gartner, Forrester reports on AI-assisted procurement |
| **MCP as customer interface** | Our MCP server already serves Claude Desktop/ChatGPT. What would it take to serve a customer's AI? Authentication, scoping, rate limiting for external agents. | Internal — extend existing MCP server |
| **Structured deliverable schemas** | What does a machine-readable security assessment look like? OSCAL (NIST), SARIF (security), CycloneDX (SBOM) are existing standards. | NIST OSCAL, OASIS SARIF |
| **Competitive landscape** | Is anyone else building agent-to-agent POV evaluation? First-mover analysis. | Market research — likely no direct competitors yet |

---

## References

### External
- [claw-code](https://github.com/instructkr/claw-code) — The showcase of clawhip-based orchestration
- [clawhip](https://github.com/Yeachan-Heo/clawhip) — Event daemon, notification routing outside agent context
- [oh-my-codex (OmX)](https://github.com/Yeachan-Heo/oh-my-codex) — Workflow keywords, $ralph persistent loops, $team parallel execution
- [oh-my-openagent (OmO)](https://github.com/code-yeongyu/oh-my-openagent) — Sisyphus orchestrator, category-based routing, hash-anchored edits
- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) — 19 specialized agents for Claude Code
- [harness1 fork](https://github.com/steveterryp/harness1) — Clean-room harness reimplementation study

### Internal
- `cline_docs/template-type-system-design-2026-04-03.md` — Template types (prerequisite, DONE)
- `lib/services/agentExecutionEngine.ts` — Agent execution engine
- `lib/services/workflow/core/orchestration-engine.js` — MCP workflow orchestration
- `lib/utils/graph.ts` — Task dependency graph
- `/.claude/knowledge/patterns/agent-template-gold-standard-pattern.md` — Pattern #44 (GS1-GS8)
- `/.claude/knowledge/patterns/agent-prompt-assembly-pattern.md` — Prompt assembly pipeline
