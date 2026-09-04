# Orchestration Reactor Pattern

**Type**: Automation Pattern — Event-Driven Loop Closure
**Created**: 2026-04-14 (post-Pipeline-Harness v1 retrigger implementation)
**Confidence**: 90% — deployed in production as pipelineRetriggerReactorService
**Status**: First canonical instance shipped; pattern generalizes to 7+ upcoming reactors
**Related**: `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` (strategic overview)

---

## Pattern Overview

**Problem**: A domain event fires (task completes, artifact created, milestone reached) and another component needs to react — but adding the reaction inline couples the components, and making the reacting component poll or wait blows past LLM turn budgets and wastes resources.

**Solution**: A dedicated "reactor" service that hooks the event source, checks guards, and queues an orchestration action. Fire-and-forget, never throws outward, always logs both triggered and skipped-because-X cases.

**Results**: Closes automation loops without coupling components; LLM agents stop polling; automation coverage becomes measurable ("how many domain events have reactors?").

---

## The Complete Pattern

### Required shape

```ts
// File: lib/services/<domain>ReactorService.ts

import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';

const log = mcpLogger.child({ module: '<Domain>Reactor' });

// 1. Tunable guard thresholds as constants (not magic numbers scattered below)
const DEBOUNCE_MS = 30_000;

/**
 * Called after <event> to check whether <target action> should be queued.
 *
 * Safe to call fire-and-forget — all errors caught and logged internally.
 * Never throws (never blocks the caller's flow).
 */
export async function maybeReactTo<Event>(entityId: string): Promise<void> {
  try {
    // 2. Load the event entity — minimal select, just what guards need
    const entity = await prisma.<Model>.findUnique({
      where: { id: entityId },
      select: { /* guard-relevant fields only */ },
    });

    if (!entity) return;

    // 3. Identify the target (what to react about)
    const target = await findTarget(entity);
    if (!target) return;  // Nothing to react to

    // 4. Guard chain — each guard returns early with a log line
    if (!guard_is_target_ready(target)) {
      log.debug({ targetId: target.id, reason: 'target-not-ready' },
        'Reactor skipped: target not in actionable state');
      return;
    }

    if (await guard_is_action_already_in_flight(target)) {
      log.debug({ targetId: target.id, reason: 'already-in-flight' },
        'Reactor skipped: action already queued/running');
      return;
    }

    if (await guard_debounce(target, DEBOUNCE_MS)) {
      log.debug({ targetId: target.id, reason: 'debounce' },
        'Reactor skipped: recent action within debounce window');
      return;
    }

    // 5. All guards passed — queue the orchestration action
    const queued = await prisma.<queueTable>.create({
      data: {
        /* queued action with status: 'PENDING' */
      },
      select: { id: true },
    });

    log.info(
      { targetId: target.id, queuedId: queued.id, triggeredBy: entityId },
      '<Reactor name> triggered'
    );
  } catch (err) {
    // 6. Never throw — reactor is best-effort, caller must not be affected
    log.error({ err, entityId }, '<Reactor name> failed (non-fatal)');
  }
}
```

### Call-site hook shape

```ts
// At the emission site (e.g., a handler or engine that transitions state)

// Inside or at the end of the committing transaction:
await tx.<Model>.update({ where: { id }, data: { status: 'COMPLETED' } });
// ... other commits ...
}); // transaction ends

// Fire-and-forget reactor hook — AFTER the transaction commits
import { maybeReactTo<Event> } from '@/lib/services/<domain>ReactorService';
maybeReactTo<Event>(id).catch(() => {});  // Internal errors already logged
```

**Critical:** the hook runs AFTER transaction commit. Guards inside the reactor query for terminal state; if invoked inside the transaction, they'd see stale data.

---

## Canonical Example: `pipelineRetriggerReactorService`

**File:** `lib/services/pipelineRetriggerReactorService.ts` (168 lines)

**What it reacts to:** A child task transitions to terminal state (COMPLETED via `status`, or FAILED via `executionStatus`)

**What it triggers:** Queues a PENDING `AgentExecution` row for the parent PIPELINE harness task → engine's 10s poller picks it up → harness re-runs in SYNTHESIZE mode

**Parent detection:** metadata-based — finds the PIPELINE task whose `metadata.pipelineStageId` equals the completed task's `stageId`. This preserves the established "Pipeline: X" child-stage UX convention (harness lives in one stage, creates a dedicated child stage for its work).

**Guards (in order):**

| # | Guard | Why |
|---|---|---|
| 1 | Event entity loaded + has a stage | Can't retrigger without context |
| 2 | Event entity is NOT itself a PIPELINE task | Prevents self-loop |
| 3 | A PIPELINE harness exists whose metadata.pipelineStageId matches AND it's IN_PROGRESS | No harness owns this child stage / already complete → nothing to do |
| 4 | All tasks in the child stage are terminal (status=COMPLETED OR executionStatus=FAILED) | Pipeline not ready yet |
| 5 | Child stage has ≥ 1 task | Misconfigured harness — don't retry an empty pipeline |
| 6 | No existing PENDING/RUNNING execution for the harness | Don't stack duplicate runs |
| 7 | No execution created within last 30s (debounce) | Absorb near-simultaneous child completions |

**Call sites (hooks):**

| Location | Line | When |
|---|---|---|
| `lib/services/agentExecutionEngine.ts` | ~1073 | After successful task completion transaction commits |
| `lib/services/agentExecutionEngine.ts` | ~1175 | After failed-execution transaction commits |
| `lib/mcp/tasks/action/handlers/task/task-complete-handler.ts` | ~199 | After MCP task.complete path updates status |

All hooks use `.catch(() => {})` fire-and-forget — the reactor's internal error handling already logs failures.

---

## Canonical Example 2: `taskReadyReactorService`

**File:** `lib/services/taskReadyReactorService.ts`

**What it reacts to:** Two distinct events with a shared purpose — queue an agent execution when a task becomes runnable.

**Two entry points:**

```
maybeQueueReadyDependents(completedTaskId)
  ↳ Called from task-COMPLETED hooks (engine + MCP path)
  ↳ Finds dependents in the same stage whose remaining deps are now
    all COMPLETED, queues PENDING executions for each

maybeQueueIfDepFree(taskId)
  ↳ Called from BOTH task.create AND agent.assign
  ↳ If the task is OPEN, dep-free, has a template, and has no existing
    execution, queues a PENDING execution
  ↳ Agent.assign is the common path (harness creates task first,
    attaches template second); task.create is rare (direct creates
    with template at create time)
```

**Why this reactor is essential:** The protocol tells the Pipeline Harness to CREATE and exit. Without this reactor, the children would sit OPEN forever — the engine's poller only picks up PENDING `agent_executions` rows; it does NOT auto-create executions for runnable OPEN tasks.

**Scope note:** intentionally does NOT fire on `executionStatus=FAILED` upstream. A failed upstream leaves downstream non-runnable until a human or the harness decides. See architecture doc §Event Catalogue for the explicit "⛔ intentionally not firing" row.

**Guards (maybeQueueReadyDependents, expressed in a single raw SQL query):**

- Task is OPEN
- Task has agentTemplateId
- ALL direct dependencies are `status=COMPLETED` (NOT EXISTS any upstream != COMPLETED)
- No existing PENDING/RUNNING execution
- No execution created within 30s (debounce)

**Guards (maybeQueueIfDepFree):**

- Task is OPEN
- Task has agentTemplateId
- Deps satisfied: 0 dependencies, OR (gap (e) fix 2026-07-18, non-PIPELINE only) ALL deps already
  satisfied per the shared `unsatisfiedDepExistsSql` predicate (same definition the dep-completion
  scan uses, F18 settledness included; fail-closed — queues only on explicit `hasUnsatisfied=false`).
  PIPELINE-with-deps keeps the blanket skip (CC6 — dep-completion reactor is the only auto-start path)
- No existing execution (status in PENDING/RUNNING/SUCCESS)

**Log signatures:**

- `"Dep-free task auto-queued on creation"` — maybeQueueIfDepFree fired (dep-free branch)
- `"Born-ready task auto-queued on creation — all deps already satisfied"` — maybeQueueIfDepFree fired (born-ready branch)
- `"Task auto-queued for execution — dependencies satisfied"` — maybeQueueReadyDependents fired
- `"Reactor skipped: no dependents in this stage became runnable"` — cascade reached a terminal state

---

## Reading Retrigger Logs

- `"Pipeline harness auto-retriggered for SYNTHESIZE mode"` — retrigger reactor fired
- `"Reactor skipped: harness has active execution"` — guard 6 tripped
- `"Reactor skipped: within debounce window"` — guard 7 tripped
- `"Reactor skipped: harness metadata points to empty stage (misconfigured)"` — guard 5 tripped

---

## Guard Primitives Library

These guard shapes appear across reactors. Copy/adapt, don't reinvent.

### Status-gate guard
```ts
// Ensure target is in a state that wants this event
if (target.status !== 'IN_PROGRESS') return;
```

### In-flight guard
```ts
// Ensure no active action is already queued/running
const active = await prisma.<queueTable>.findFirst({
  where: { targetId: target.id, status: { in: ['PENDING', 'RUNNING'] } },
  select: { id: true, status: true },
});
if (active) {
  log.debug({ targetId: target.id, activeId: active.id }, 'Skipped: already in-flight');
  return;
}
```

### Debounce guard
```ts
// Absorb bursts of events that would all fire the reactor
const recent = await prisma.<queueTable>.findFirst({
  where: {
    targetId: target.id,
    createdAt: { gte: new Date(Date.now() - DEBOUNCE_MS) },
  },
  select: { id: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
});
if (recent) {
  log.debug({ targetId: target.id, ageMs: Date.now() - recent.createdAt.getTime() },
    'Skipped: debounce');
  return;
}
```

### Completeness guard (e.g., "all children terminal")
```ts
// Ensure the event satisfies the aggregate condition, not just one event
const pendingCount = await prisma.<ChildModel>.count({
  where: { <parentRef>: target.id, status: { notIn: [...TERMINAL_STATES] } },
});
if (pendingCount > 0) return;  // Not ready yet
```

### Sanity guard (e.g., "target isn't misconfigured")
```ts
// Some edge cases should skip silently rather than loop
const childCount = await prisma.<ChildModel>.count({
  where: { <parentRef>: target.id },
});
if (childCount === 0) {
  log.warn({ targetId: target.id }, 'Skipped: no children — misconfigured');
  return;
}
```

---

## When NOT to Use a Reactor

Reactors are for **asynchronous loop closure after a transaction commits**. They are the wrong tool when:

- **The logic must complete before responding to the caller** → that's a handler responsibility. If the user clicks Complete and expects the ROI recalculation to appear in the response, do it synchronously.
- **The action is deterministic and same-request** → don't wrap a simple "update X when Y updates" in a reactor; just update both in the same transaction.
- **There's no domain event** → if you're writing `setInterval` or a cron, that's a scheduler, not a reactor.
- **The logic is business rules, not orchestration** → reactors trigger *orchestration primitives* (queue an execution, send a notification, advance a phase). If you're encoding domain rules ("pricing tier changes when volume crosses X"), that belongs in the service layer.

**Sniff test:** if the emitting transaction needs to know whether the reactor succeeded, it's not a reactor — it's a handler call or a same-tx update.

---

## Testing a Reactor

Reactors are pure async functions that never throw — easy to test.

```ts
describe('pipelineRetriggerReactorService', () => {
  it('fires when last sibling transitions to COMPLETED', async () => {
    // Arrange: create harness + 2 children, 1 still in-progress
    const { harness, child1, child2 } = await seedPipeline();
    await prisma.task.update({ where: { id: child1.id }, data: { status: 'COMPLETED' } });
    const before = await prisma.agentExecution.count({ where: { taskId: harness.id } });

    // Act: the LAST child transitions
    await prisma.task.update({ where: { id: child2.id }, data: { status: 'COMPLETED' } });
    await maybeRetriggerPipelineHarness(child2.id);

    // Assert: one PENDING execution queued
    const after = await prisma.agentExecution.count({
      where: { taskId: harness.id, status: 'PENDING' },
    });
    expect(after).toBe(before + 1);
  });

  it('skips when harness already has RUNNING execution', async () => {
    // Arrange + pre-create a RUNNING execution
    // Act
    // Assert: no new PENDING execution created
  });

  it('skips within debounce window', async () => { /* ... */ });

  it('never throws even when DB errors', async () => { /* ... */ });
});
```

The guard chain should have one test per guard showing both the trigger and skip cases — this gives confidence that observability claims match behavior.

---

## Common Pitfalls

### Prisma raw-SQL column naming (case-sensitivity)

Reactors commonly use `prisma.$queryRaw` for compound queries (dependent-task lookups, JSONB path queries). Column names depend on whether the schema field has `@map()`:

| Schema | Postgres column | Raw SQL reference |
|---|---|---|
| `stageId String? @map("stage_id")` | `stage_id` | `t.stage_id` |
| `agentTemplateId String?` (no `@map`) | `"agentTemplateId"` | `t."agentTemplateId"` |
| `taskId`, `dependsOnId`, `createdAt` (common unmapped fields) | case-preserved | always double-quoted |

**Always verify** the actual column name in `schema.prisma` before referencing it in raw SQL. A missing `@map` means the column is case-sensitive camelCase in Postgres — must be double-quoted. We shipped a version with `t.agent_template_id` that passed typecheck but threw `column does not exist` at runtime. The TypeScript result type must match what the column returns (`Array<{ agentTemplateId: ... }>`, not `agent_template_id`).

### Multiple-execution-path drift

The reactor pattern relies on hooks at the event-emitting site. If two code paths independently handle the same event (e.g., `agentExecutionEngine.ts` and `app/api/pov/agent/execute/stream/route.ts` both handle task-completed transitions), you need hooks in BOTH. Missing one creates a bypass — the reactor appears to work most of the time and mysteriously fails when the bypass path runs.

**Audit checklist when adding a reactor hook** — trace "who sets this state?" across the codebase with `grep` before deciding call sites are complete. Two common places for the same event to fire:

| Event | Likely call sites |
|---|---|
| Task status transitions | Engine + Stream route + MCP handler + direct Prisma updates in bulk ops |
| Execution terminal states | Engine success path + Engine failure path + stale-cleanup sweeper |
| Task creation | Direct MCP handler + bulk import + workflow-engine spawns |

### Don't duplicate resource limits across execution paths

Related to the drift above — if you have two tool loops (one for streaming responses, one for queued polling), resource limits like `MAX_TOOL_TURNS` must read from the same configuration source. We had a bug where the engine read `template.metadata.modelParameters.maxToolTurns` (up to 100) but the stream route hardcoded 10 — the template setting was silently ignored for 95% of executions. Grep for the constant across the repo when introducing it and when debugging suspected limits.

### Context Field Shape Drift Across Reactor Boundary

Reactors queue downstream executions by writing a JSONB context blob the engine reads later. When N reactor sites independently assemble the same field, documentation-only shape rules don't survive N authors — one site gets the shape wrong, the record persists, and the bug surfaces as a masked downstream symptom (wrong user billed, empty LLM response, orphan execution).

The 2026-04-15 reactor-userId drift: `agent_executions.context.triggeredBy` had 6 writers (2 direct-path + 4 reactor). Two reactor sites wrote the correct shape `{id: userId}`, four wrote a bare string (`completedTaskId`). Engine's `extractUserId` returned `undefined` for the bare-string rows → silent fallback to `task.assigneeId` (POV owner) → POV owner's apiKey used → cross-user billing risk + masked failures.

**The reactor amplifies this class of bug** because the reactor site is far from the read site (temporally and in the call graph). The reactor queues an execution row; the engine reads it minutes later; by the time the bug symptom appears, the reactor logs are gone from the active debug view.

**Defense — boundary-contract wrapper enforcement** (see `boundary-contract-wrapper-enforcement-pattern.md`):

1. **Strict Zod schema** on the contract field:
   ```ts
   export const TriggeredBySchema = z.object({
     id: z.string().cuid('triggeredBy.id must be a CUID userId'),
     source: TriggeredBySourceEnum,  // required discriminator
     parentExecutionId: z.string().cuid().optional(),
     parentTaskId: z.string().cuid().optional(),
   }).strict();
   ```
   `.strict()` catches typos AND prototype-pollution-via-`__proto__`. `.cuid()` on `id` would have rejected a bare taskID-shaped string.

2. **Single wrapper function** (`createAgentExecution`) — all 6 write sites funnel through it. Parse throws BEFORE the DB write; no orphan row can exist with a drifted shape.

3. **Automated pattern test** — grep-based check that `prisma.agentExecution.create` only appears in the wrapper file. Fails CI if any new caller bypasses the wrapper.

4. **Asymmetric enforcement** — hard-throw at write, soft-warn at read. `extractUserId` uses `safeParse` with WARN log on failure + legacy fallback (don't break pre-schema JSONB rows).

**Grep audit for reactor-boundary drift risk**:

```bash
# JSONB context fields without typed shape
grep -rn "context: {" lib/services/*ReactorService.ts

# Bare `triggeredBy:` writes (must be an object, never a string)
grep -rn "triggeredBy:" lib/services/*Reactor* lib/services/agent-execution-create.ts

# Raw prisma.agentExecution.create outside the wrapper
grep -rn "prisma\.agentExecution\.create\s*(" lib/ app/ --include="*.ts" | grep -v "agent-execution-create.ts"
```

A reactor writing a loosely-typed JSONB field without a boundary wrapper is a latent bug waiting for the third author. Fix it structurally, not with docs.

---

## Observability Checklist

A reactor is not done until it emits all of these logs:

- [ ] **Triggered** — INFO level — entity that fired, target, queued action id
- [ ] **Skipped (per guard)** — DEBUG level — entity, target, reason tag (e.g., `reason: 'debounce'`)
- [ ] **Error** — ERROR level — captured exception, context to reproduce

The `reason: <tag>` field is critical: it makes *"why didn't this reactor fire?"* answerable from logs alone with a simple grep / jq.

---

## Scaling: When Reactors Become Hook Sprawl

Today, reactors are called via direct imports at emission sites. At ~10+ reactors, hook sprawl sets in: each `task.update({ status: ... })` accumulates multiple reactor imports, easy to miss one, drift creeps in.

**Migration path at scale:** swap direct imports for a typed event emitter or PG NOTIFY/LISTEN channel (see `automation-loop-closure-architecture.md` §Scaling Plan). Reactors become subscribers; emission sites just publish events.

Pattern users: don't pre-optimize. Stay with direct imports until we hit the sprawl threshold; the migration is mechanical.

---

## Pattern Confidence

- **Two canonical impls deployed** (2026-04-14):
  - `pipelineRetriggerReactorService.ts` — metadata-based detection; handles CHILD-TERMINAL → HARNESS-SYNTHESIZE loop
  - `taskReadyReactorService.ts` — task-dependency cascade + dep-free kickstart; handles OPEN → PENDING execution loop
- **4 call sites across the codebase** — engine success/failure paths, task-complete handler, task-create handler, agent-assign handler
- **End-to-end validation (2026-04-14)**: first Pipeline Harness run with both reactors live — CREATE mode completed cleanly, Task 1 auto-queued via `maybeQueueIfDepFree` on agent.assign, engine ran it, task COMPLETED. Raw-SQL column-name bug in the completion hooks (documented under Common Pitfalls) caught before the cascade fired — fix shipped same session.
- **Next validations:** quality-gate reactor, next-stage auto-fire reactor (both roadmap priority 1-2)

Confidence will climb to 95%+ once 3+ reactors using this shape are in production and one run has gone end-to-end through CREATE → cascade → SYNTHESIZE → task.complete without any reactor-level bug.

---

## References

- Stack map (how this fits): `.claude/knowledge/domain/harness/autonomous-delivery-stack.md`
- Strategic: `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md`
- Canonical impls: `lib/services/pipelineRetriggerReactorService.ts`, `lib/services/taskReadyReactorService.ts`
- Related TODOs: `TODO-EVENT-DRIVEN-PIPELINES.md`, `TODO-CASCADING-PIPELINES.md`
- Pattern registry: `.claude/knowledge/patterns/PATTERN-REGISTRY.md` (Pattern #46)
- **Protocol 13 (Program Workflow Evolution)**: `.claude/knowledge/protocols/program-workflow-evolution-protocol.md` — this pattern is the required implementation shape when its finding→fix loop classifies a fix to the **platform-code, event-driven** layer (born-ready and cascade-miss fixes were this shape).
