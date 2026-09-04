# TODO: Event-Driven Pipeline Auto-Execution

**Status**: Planned (Phase 3 roadmap — next up)
**Created**: 2026-04-05
**Source**: Vision doc Idea #3 + natural progression from orchestrate mode
**Estimated Effort**: Low-Medium (1-2 sessions)

---

## Introduction

Today, every pipeline execution requires a human to click "execute." The flow is:

```
Human creates PIPELINE task → Human assigns template (or auto-assign) → Human executes → Harness runs
```

Phase 3 removes the last manual step. The execution engine already polls every 10 seconds for PENDING executions. By extending this polling loop to detect ready PIPELINE tasks, the system can auto-trigger pipelines when their preconditions are met.

This is the difference between a task management tool and an autonomous delivery system. The human designs the POV structure, sets up the stages, and walks away. The system executes each pipeline as its prerequisites are satisfied.

## Objective

When a PIPELINE-type task exists in a stage, and that stage's preconditions are met, the system automatically creates an execution record and triggers the harness — without human intervention.

**End state**: A user sets up a multi-stage POV, each stage containing a PIPELINE task. As each stage completes, the next stage's pipeline auto-fires. The POV delivers itself.

## How It Works Today

```
Execution engine polls every 10s:
  → Find agentExecution records with status: PENDING
  → Execute each one

PIPELINE tasks sit as OPEN with no execution record until a human:
  1. Calls agent.execute (MCP)
  2. Or clicks Execute in the GUI
  → This creates the agentExecution record
  → The polling loop picks it up
```

The gap: nobody creates the execution record for PIPELINE tasks automatically.

## Proposed Design

### Core Logic (Added to Polling Loop)

```
Every poll cycle (10s), AFTER processing PENDING executions:

1. Find all tasks where:
   - type = PIPELINE
   - status = OPEN
   - metadata.autoExecute = true (opt-in flag)
   - agentTemplateId IS NOT NULL (auto-assign should have fired, or manual assign)
   - No active execution exists (PENDING or RUNNING)

2. For each candidate PIPELINE task:
   a. Check stage preconditions:
      - Are all predecessor stages COMPLETED? (stages with lower order in the same phase)
      - OR: Is this the first stage in its phase? (no predecessors)
   b. Check sibling readiness (for ORCHESTRATE mode):
      - Are there sibling tasks in the stage? (orchestrate mode)
      - If yes, are they all in a stable state? (OPEN — ready to be orchestrated)
      - If no siblings, proceed (create mode)

3. If preconditions met:
   a. Auto-assign Pipeline Harness template if not already assigned
   b. Create agentExecution record with status: PENDING
   c. Log: "Auto-triggered PIPELINE task [id] in stage [name]"
   d. The existing polling loop picks it up on the next cycle

4. If preconditions NOT met:
   → Skip, check again next cycle
```

### Opt-In Flag

Auto-execution is **opt-in** to prevent accidental triggers and uncontrolled spending:

```
// Opt-in via task metadata when creating:
perform(action: "task.create", parameters: {
  povId: "...",
  title: "Orchestrate security assessment",
  stageId: "...",
  type: "PIPELINE",
  metadata: { autoExecute: true }
})

// Or opt-in later via task.update:
perform(action: "task.update", taskId: "...",
  metadata: { autoExecute: true })
```

Default is `autoExecute: false` — existing behavior preserved. Human must explicitly opt in.

### Budget Guard

Before auto-triggering, check the POV's execution budget:

```
// Optional: POV-level budget in metadata
POV.metadata.maxAutoExecutionCostPerDay = 20.00  // USD
POV.metadata.autoExecutionSpentToday = 12.50

// If spent >= max, skip auto-execution and log warning
```

This is optional for v1 — the opt-in flag provides the primary safety gate. Budget guard can be added in a follow-up.

## Implementation Procedure

### Step 1: Add Auto-Execution Check to Polling Loop
- File: `lib/services/agentExecutionEngine.ts` in `processPendingExecutions()`
- Add a new section AFTER the pending execution processing
- Query for eligible PIPELINE tasks (type, status, autoExecute flag, no active execution)
- This is ~30 lines of code

### Step 2: Add Stage Predecessor Check
- Query stages in the same phase with lower order
- Check if all tasks in those stages are COMPLETED
- If any predecessor stage has OPEN/IN_PROGRESS tasks, skip
- Edge case: first stage in a phase has no predecessors — always eligible

### Step 3: Add autoExecute to Task Metadata Handling
- File: `lib/mcp/tasks/action/handlers/task/task-create-handler.ts`
- File: `lib/mcp/tasks/action/handlers/task/task-update-handler.ts`
- Pass through `metadata.autoExecute` (metadata is already a JSON field — no schema change needed)

### Step 4: Add Validation Schema Support
- File: `lib/validation/mcp-action-validation.ts`
- Ensure `metadata` accepts `autoExecute: boolean` in task.create and task.update schemas

### Step 5: Test
- Create a 2-stage POV:
  - Stage 1: 2 tasks + PIPELINE (autoExecute: true)
  - Stage 2: 2 tasks + PIPELINE (autoExecute: true)
- Execute Stage 1's pipeline manually (first trigger)
- When Stage 1 completes, verify Stage 2 auto-fires
- Verify: auto-assign, mode detection, template assignment, execution, completion

### Step 6: Update User Guide
- Add Option E: "Auto-Execute Pipeline" to the harness guide
- Document the opt-in flag, precondition logic, and budget considerations

## Related Context

- **Execution engine polling**: `agentExecutionEngine.ts:117-128` — `processPendingExecutions()` runs every 10s
- **PIPELINE auto-assign**: `agent-execute-handler.ts:124-142` — auto-assigns harness template for PIPELINE tasks
- **Orphaned execution watchdog**: Already cleans up stale RUNNING records — will work with auto-triggered executions
- **Stage ordering**: Stages have an `order` field — predecessor = lower order in same phase
- **Task metadata**: JSON field on Task model — no migration needed for autoExecute flag
- **Vision doc Idea #2**: Cascading pipelines across stages — Phase 3 enables this naturally

## Risks and Considerations

- **Accidental execution**: User creates a PIPELINE task with autoExecute while still designing the stage. Mitigation: only trigger if sibling tasks exist (orchestrate) or task has a substantive description (create).
- **Cost runaway**: Auto-execution consumes tokens without human approval. Mitigation: opt-in flag (primary), POV budget guard (future).
- **Cascading failures**: Stage 1 pipeline fails → Stage 2 auto-fires anyway → produces garbage. Mitigation: only auto-fire if predecessor stage tasks are ALL COMPLETED (not just some). If any predecessor task is OPEN or failed, skip.
- **Race conditions**: Two poll cycles detect the same eligible PIPELINE task. Mitigation: use the existing CAS (compare-and-swap) pattern — `updateMany where status: OPEN` to atomically claim.
- **PM2 restart**: In-flight auto-triggered execution killed by restart. Mitigation: orphaned execution watchdog already handles this.

## Success Criteria

- [ ] PIPELINE task with `autoExecute: true` auto-triggers when stage preconditions met
- [ ] Default behavior (no flag) is unchanged — manual execution required
- [ ] Stage predecessor check works (Stage 2 waits for Stage 1 completion)
- [ ] CAS prevents double-trigger on same PIPELINE task
- [ ] Works with both CREATE and ORCHESTRATE modes
- [ ] Orphaned execution watchdog handles auto-triggered executions
- [ ] User guide updated with auto-execution option

## Future Extensions (Not in Scope for Phase 3)

- **POV-level budget guard**: Cap auto-execution cost per day per POV
- **Cascading across phases**: Phase 2 auto-starts when Phase 1 completes
- **Notification on auto-trigger**: Post a comment or send notification when auto-execution fires
- **Scheduled execution**: Auto-execute at a specific time rather than on precondition
- **Approval gates**: Require human approval between stages while still auto-preparing the next pipeline

## Dependencies

- Phase 2 (orchestrate mode) must be complete — **DONE**
- PIPELINE auto-assign must work — **DONE**
- Self-completion guard must work (harness reports accurately) — **DONE**
