# Automation Loop-Closure Architecture

> ⚠ **ERRATA (2026-07-24/25 — completion-path unification; record:
> `cline_docs/reviews/completion-path-unification-2026-07-24/`)**: read this doc's completion-path
> claims and line refs with suspicion — (1) the 4-point PIPELINE invariant's inline copies in
> `task-complete-handler.ts` / `task-update-handler.ts` were DELETED; the ONE copy is
> `lib/tasks/services/complete-task-terminally.ts` `assertPipelineCompletionInvariant`, inherited by
> every human write-site incl. web + bulk; (2) the F9 TaskReady deferral and the F10
> programConfidence stamp moved core-side (`fireCompletionReactors` / `computeProgramConfidenceStamp`);
> (3) gate release is first-class from EITHER surface (GUI or MCP), cascades fire on all surfaces,
> and completion is dependency-ENFORCED — any "only MCP task.complete fires the reactor(s)" claim
> here is historical; (4) `validateTaskStatusTransition` lives in
> `lib/tasks/services/status-transitions.ts` (task.ts re-exports); (5)
> `AgentTaskService.updateExecution` was deleted (dead code).

**Status:** Active architectural pattern
**Created:** 2026-04-14
**Canonical Implementation:** `lib/services/pipelineRetriggerReactorService.ts`
**Pattern Reference:** `.claude/knowledge/patterns/orchestration-reactor-pattern.md` (Pattern #46)

---

## Core Insight

> **Automation = reactor coverage over human decision points.**

Every gap where a human currently decides *"now it's time for step N+1"* is a reactor we haven't built yet. Humans are the default orchestrator today. Reactors replace them one loop at a time.

When you find yourself asking *"why didn't X happen automatically when Y finished?"* — the answer is always the same: there's no reactor for the `Y → check conditions → trigger X` loop yet.

---

## How We Arrived Here

On 2026-04-13, we shipped v1 of the Pipeline Harness: a meta-agent that decomposes an objective into specialist sub-tasks, wires dependencies, and coordinates execution. On 2026-04-14, the first end-to-end test revealed a problem that wasn't a bug — it was an architectural gap.

The harness has two natural modes:
- **CREATE**: plan the pipeline, create sub-tasks, assign templates, wire deps
- **SYNTHESIZE**: after all children complete, aggregate their results, quality-gate, finish

The harness executed CREATE correctly, but SYNTHESIZE never ran. Nothing triggered it.

We considered three options:

| Option | Description | Assessment |
|---|---|---|
| A | Harness blocks in a tool-call loop, polling `agent.status` on each child | Broke the 100-tool-turn budget; LLM stuck waiting for minutes-long child executions |
| B | Human clicks Execute again after children finish | UX friction; defeats automation; doesn't scale past a few pipelines |
| C | The system reacts automatically when last child transitions to terminal | Fits the automation north star |

We chose C. But *how* we implemented C — a dedicated service called from completion hooks, with guards to prevent loops — is a pattern that will repeat across the platform. This doc names it, explains when to reach for it, and maps where it's coming next.

---

## The Reactor Pattern (Summary)

A reactor is not an engine, handler, or service in the traditional sense. It's a **bridge between lifecycles**: a piece of code that

1. **Hooks** into a domain event (a task transitions to a terminal state, an artifact is created, a confidence score is recorded)
2. **Checks guards** (is the target in a state where it wants this event? are we debouncing? is there already an in-flight action?)
3. **Queues an orchestration action** (inserts a PENDING execution row, schedules a workflow, emits a notification)
4. **Returns immediately** — never blocks the emitter, never throws outward
5. **Logs observably** — both the triggered case AND every skipped-because-X case

The call site is a **hook**, not a direct invocation. The reactor's output is **queued work**, not synchronous execution. See the pattern doc for the required shape and guard primitives.

---

## Event Catalogue

Domain events that exist in the codebase today, with their reactor status:

| Event | Emitted From | Reactor | Purpose |
|---|---|---|---|
| Task COMPLETED | `agentExecutionEngine.ts`, `task-complete-handler.ts` | ✅ `pipelineRetriggerReactorService` | Trigger harness SYNTHESIZE when last sibling terminal |
| Task COMPLETED | `agentExecutionEngine.ts`, `task-complete-handler.ts` | ✅ `taskReadyReactorService` | Queue executions for dependent tasks whose dependencies are now satisfied |
| Task created dep-free + with template | `task-create-handler.ts` | ✅ `taskReadyReactorService` (`maybeQueueIfDepFree`) | Kick off dep-free tasks created with their template attached (rare — usually handled by agent.assign below) |
| Template assigned to existing task | `agent-assign-handler.ts` | ✅ `taskReadyReactorService` (`maybeQueueIfDepFree`) | Kick off the initial wave when Pipeline Harness creates task FIRST, then attaches template — the common case |
| Task created WITH deps that are ALL already satisfied ("born-ready") | `task-create-handler.ts`, `agent-assign-handler.ts` | ✅ **FIXED 2026-07-18** — `taskReadyReactorService` (`maybeQueueIfDepFree` born-ready branch) | Gap (e) closed: for non-PIPELINE tasks the blanket has-deps skip was replaced with the dep-completion reactor's own satisfaction predicate, extracted into the shared `unsatisfiedDepExistsSql` Prisma.sql fragment (single definition of "satisfied", F18 settledness clause included; fail-closed — queues only on explicit `hasUnsatisfied=false`). PIPELINE tasks with deps deliberately keep the blanket skip (CC6/L1: dep-completion reactor is the only auto-start path for PIPELINE children — the pov-program plan-gate design depends on it; operator recovery stays `agent.execute`). 4-specialist review 90–93/100, zero blocking: `cline_docs/reviews/born-ready-gap-e-2026-07-18/`. **Residuals (tracked, not covered)**: (1) `task.update` that adds satisfied deps/template fires NO reactor — same gap one door over (task-dependency A3); (2) cross-stage: born-ready judges deps regardless of stage (deliberate), but the dep-completion re-fire is stage-scoped, so a task depending on an other-stage PIPELINE upstream created during its ~13s unsettled window can still strand (pre-existing scoping, strictly better than before — event-system F7). |
| Harness self-supersedes a persisted PIPELINE child ("probe") | pov-program protocol 1.0.13 (PLAN-SPAWN step 4) → `metadata.cannotRun` stamp → FIX-A hook (`task-update-handler`) | ✅ **CLOSED 2026-07-18 (gap (b))** — protocol wiring to existing FIX-A machinery | Run 7's probe (titled 'SUPERSEDED - do not execute', zero deps/executions/child stage) had NO terminal disposal surface — BLOCKED isn't terminal, COMPLETED rejected by the completion invariant (unlinked pipeline), no delete action; it blocked all-children-terminal until operator row-deletion. Fix: the protocol now mandates disposal via the `cannotRun` state channel ("superseded: <why>"), which the FIX-A write-path hook terminalizes (`executionStatus=FAILED`, OPEN+FAILED idiom — deliberately sidesteps the open gap (c) BLOCKED-terminality decision); title/comment disposal explicitly forbidden (not state channels). **Residual (filed with trigger)**: an ACTION-child supersession stamp is inert — the FIX-A hook is PIPELINE-scoped (PH5 ruling, reactor-cascade-audit-2026-07-18). Trigger to act: first observed ACTION-child supersession; the effector (`persistCanNeverRun`) is already type-agnostic, only the hook gate needs widening + review. |
| Task executionStatus=FAILED | `agentExecutionEngine.ts` | ✅ `pipelineRetriggerReactorService` | Trigger harness SYNTHESIZE to escalate |
| Task executionStatus=FAILED | `agentExecutionEngine.ts` | ⛔ intentionally not firing TaskReady | Failed upstream leaves downstream non-runnable until a human/harness decides |
| Agent execution COMPLETED (SUCCESS) | `agentExecutionEngine.ts` | None | Logged for monitoring only |
| Agent execution FAILED | `agentExecutionEngine.ts` | None (covered by task FAILED above) | — |
| Artifact created | `agentExecutionEngine.ts` (per-artifact `agentArtifact.create`) | None (roadmap) | Trigger downstream consumer when a specialist produces input for the next |
| Confidence scored (task.complete w/ confidence) | `task-complete-handler.ts:152-164` | None (roadmap) | Quality-gate: trigger reviewer if < 50, accept if ≥ 70 |
| Phase transitioned | `phase-*` handlers | None (roadmap) | Trigger phase-level orchestrator (next stage auto-fires) |
| Stage completed (all tasks terminal) | Derived, no explicit emitter | None (roadmap) | Trigger next stage's pipeline task |
| POV milestone reached (end date, etc.) | Cron / scheduled | None (roadmap) | Trigger customer notification pipeline |
| Template success rate drop | Derived from `usageCount` + outcomes | None (future) | Trigger template-improvement specialist |
| External MCP service signal | Per integration | Ad-hoc | Compensating pipeline (retry, fallback, alert) |

### How to read this table

A reactor of `None` means *the event fires but no code listens*. That's an automation gap — every `None` in the roadmap column is a future reactor. Prioritization is based on which gaps most commonly require human intervention today.

---

## Shipped Reactors

- **`pipelineRetriggerReactorService`** — `lib/services/pipelineRetriggerReactorService.ts` — closes the SYNTHESIZE loop. When the last non-terminal child of a PIPELINE harness transitions to terminal, queues the harness for re-execution in SYNTHESIZE mode. **Guard 8 (D-4, 2026-06-14)** caps the retrigger *chain* depth with a per-harness generation budget — see "Reactor Chain Depth" below.
- **`taskReadyReactorService`** — `lib/services/taskReadyReactorService.ts` — closes the CREATE→execute loop. Two surfaces:
  - `maybeQueueReadyDependents(completedTaskId)` — fires from task COMPLETED hooks; finds dependents in the same stage whose remaining dependencies are now satisfied, queues executions.
  - `maybeQueueIfDepFree(taskId)` — fires from `task.create`, `agent.assign`, AND (gap (e) door, 2026-07-18) `task.update` on dep-rewrite/template-attach. The harness pattern is create-task-first-then-attach-template, so the template isn't present at create time — the `agent.assign` firing is the common path. Since the gap (e) fix it covers BOTH dep-free tasks AND non-PIPELINE "born-ready" tasks (all deps already satisfied at fire time, judged by the shared `unsatisfiedDepExistsSql` predicate); PIPELINE-with-deps keeps the blanket skip (CC6).

### Reactor call sites (6 total)

| Location | Reactor | Trigger |
|---|---|---|
| `agentExecutionEngine.ts` success path | Both | After successful task COMPLETED tx |
| `agentExecutionEngine.ts` failure path | pipelineRetrigger only | After executionStatus=FAILED tx |
| `task-complete-handler.ts` | Both | After MCP task.complete |
| `task-create-handler.ts` | taskReady (`maybeQueueIfDepFree`) | After atomic create + deps wiring |
| `agent-assign-handler.ts` | taskReady (`maybeQueueIfDepFree`) | After template attached to existing task (call-site PIPELINE skip, L1) |
| `task-update-handler.ts` | taskReady (`maybeQueueIfDepFree`) | After dep rewrite / template attach commits (gap (e) door, 2026-07-18; call-site PIPELINE skip + executionStatus=FAILED frozen-cone guard) |

## Hindsight Lessons (from 10 harness runs on 2026-04-14)

### Lesson 1 — Grep for ALL references to any suspected resource limit

Spent ~8 iteration cycles diagnosing "agent hit max turns" as a protocol/agent-behavior problem when the root cause was a hardcoded `const MAX_TOOL_TURNS = 10` in the stream route, while the engine correctly read `maxToolTurns` from template metadata (up to 100). Two tool-loop implementations, two different constants, template config applied to only one of them. *(Historical, as-of 2026-04-14 — the hardcoded-10 has since been fixed: both paths now read `maxToolTurns || 30` from template — stream `route.ts:609`, engine `agentExecutionEngine.ts:755`.)*

The cost of not grepping: rewrote protocols, added turn-efficiency rules, and reorganized the harness execution model under the false premise that 10-turn starvation was the real budget. Many of those changes were valuable for other reasons, but the immediate symptom was orthogonal. A single `grep -rn 'MAX_TOOL_TURNS' lib/ app/` at diagnosis time would have found both and saved cycles.

**Rule of thumb:** when any constant looks wrong, grep the entire repo for its name before reasoning about behavior. Duplication of resource-limit constants across execution paths is a common drift shape.

### Lesson 2 — Two execution paths is a class of bug

The engine's `agentExecutionEngine.ts` and the stream route's inline tool loop are independent implementations of "agent runs LLM, gets tool calls, executes them, feeds results back." They had drifted in at least three ways:
1. `MAX_TOOL_TURNS` hardcoded in stream, template-configurable in engine
2. Stream route auto-completed PIPELINE tasks; engine had been fixed earlier
3. Stream route's failure handling had its own code path

When adding PIPELINE-specific rules, audit BOTH paths. When the harness exits cleanly, check that both completion paths preserve IN_PROGRESS for PIPELINE tasks. The stream route exists because Next.js streaming responses need their own lifecycle; the engine exists because queued executions need their own poller. Both are valid — they just need to stay in lock-step on business rules.

Ideal future state: extract the shared tool-loop into a function both paths call. Not today's work, but a recognized target.

## Ruling: BLOCKED stays NON-terminal, permanently (Steve ratified 2026-07-18)

The terminal set (`status=COMPLETED` OR `executionStatus=FAILED`) is CORRECT and closed — do not add
BLOCKED. Terminal is a promise to the machine ("nothing more happens here — build on it"); BLOCKED is
the opposite promise ("a human is holding this — more must happen"). The parking brake must never
double as the release lever: BLOCKED-as-terminal would let a parked/stuck task RELEASE its dependents
(run-10's stranded leg would have fired SYNTHESIZE against a child that never ran — fabrication
pressure), erase FAILED-with-attribution escalation narratives (run 9's transitive root attribution),
and turn any GUI BLOCK into a one-click dependency-hold bypass. When the machine knows a task will
never proceed, the honest channel is `executionStatus=FAILED` + a machine-readable reason
(cannotRun / duplicateHalt / supersession / pre-flight bail) — never a promoted human-hold state.
Decision record: `cline_docs/follow-ups/leg-reviewer-efficacy-2026-07-17.md` item (c).

## Common Pitfalls When Writing Reactors

### Prisma raw-SQL column naming

When using `prisma.$queryRaw` (as both shipped reactors do), column names depend on whether the field has `@map()` in `schema.prisma`:

| Schema | Postgres column | Raw SQL |
|---|---|---|
| `stageId String? @map("stage_id")` | `stage_id` | `t.stage_id` (no quotes) |
| `agentTemplateId String?` (no `@map`) | `"agentTemplateId"` | `t."agentTemplateId"` (double quotes, case-sensitive) |
| `taskId String?` (on TaskDependency) | `"taskId"` | `d."taskId"` |
| `createdAt` | `"createdAt"` | `t."createdAt"` |

**Always check the schema before adding raw SQL column references.** We shipped a version where `t.agent_template_id` passed typecheck but blew up at runtime with `column t.agent_template_id does not exist` — because `agentTemplateId` has no `@map`, the column is case-sensitive camelCase in Postgres.

The TypeScript return type should match the column name as-returned (e.g., `Array<{ agentTemplateId: string | null }>`, not `agent_template_id`).

### Two-path audit checklist for new invariants

When adding a PIPELINE-type (or any composite-type) behavior rule, check ALL these call sites for the same rule:
- `agentExecutionEngine.ts` success path (task update on completion)
- `agentExecutionEngine.ts` failure path (task update on failure)
- `app/api/pov/agent/execute/stream/route.ts` success path (parallel implementation)
- `task-complete-handler.ts` (MCP-invoked completion)
- `task-update-handler.ts` (MCP task.update with status=COMPLETED, for bypass seal)

Missing any of these leaves the invariant bypassable via an alternate path.

---

## Reactor Chain Depth — Guards Bound a Cycle, Not the Chain (D-4, 2026-06-14)

> **Design model distilled from the D-4 work (per-harness reactor-generation budget,
> shipped `148e321a`) + its 2-specialist review. The reactor-chain insights here are
> reusable across every future reactor, not D-4-specific.**

### The pitfall class: per-cycle guards ≠ a chain bound

`pipelineRetriggerReactorService` has 8 per-cycle guards (Guards 1–7 plus Guard 3.5
clobber-detection: find-harness, self-transition, terminal-children, empty-stage,
one-active-execution, debounce, malformed-context). **Every one of them bounds a *single*
retrigger.** None bounds the *number of consecutive retriggers* —
the chain depth. A reactor whose queued action can re-trigger the same reactor (directly,
or via the work it queues completing and firing the hook again) can loop **indefinitely**
even with perfect per-cycle guards.

The harness case: the retrigger inherits the triggerer through *"arbitrary reactor-chain
depth"* (`pipelineRetriggerReactorService.ts:299`). A SYNTHESIZE run that keeps creating a
new child stage → children complete → retrigger → repeat would loop forever.

**Generalizable rule:** if a reactor's action can lead (even transitively) to its own hook
firing again, the per-cycle guards are not enough — you also need a **chain/generation
bound**. Ask of every reactor: *"can the work I queue cause me to fire again? If so, what
stops the Nth firing?"*

### Concurrency vs Depth — two independent bounds (don't conflate them)

A reactor's blast radius has three separable dimensions; D-4 taught us to grade them apart:

| Dimension | Bounded by | For the harness reactors |
|---|---|---|
| **Fan-out (breadth)** | idempotency — one execution per task (BC67 partial-unique + `already-has-execution`/`task-already-claimed` skips) | ✅ bounded — a single pipeline enqueues ≤ (task count) rows; cannot balloon |
| **Concurrency (rate)** | the engine poller `processPendingExecutions` — single 10s interval, `take:5`, `Promise.allSettled` (`agentExecutionEngine.ts:258`) | ✅ ~5 reactor-driven executions run at once, **globally** (all pipelines, all users) |
| **Depth (cumulative total)** | nothing, until D-4's generation budget | ⚠️ was unbounded — the poller bounds *rate*, not *total* |

**The trap:** "bounded rate" reads like "bounded cost," but it isn't. A runaway reactor
clamped to `take:5` doesn't *spike* — it **bleeds**: it burns cost at a bounded rate,
indefinitely. A reactor can be perfectly safe on concurrency and still have unbounded
*cumulative* cost. Grade depth separately.

### Threading state through a reactor chain (the counter technique)

Each reactor firing is a **separate execution** (the poller spawns a fresh one), so there
is no in-memory state to carry a counter/accumulator across firings.

- **Wrong reflex:** copy the workflow engine's `maxTotalRetries`, which uses an in-memory
  shared `retryState` object (`orchestration-engine.js:313`). That works *only* because a
  workflow is ONE execution. A reactor chain is N executions — the in-memory counter resets
  every firing.
- **The technique:** persist the state in the execution's **`context` JSONB**; the next
  firing reads the *prior* execution's context. The retrigger already does this for
  `triggeredBy.id` (reads `priorContext` at `:317`); D-4 rides the same channel —
  `reactorGeneration` read from the prior link, incremented, written to the new execution's
  `contextExtras`. This generalizes to **any** chain state (counters, accumulators, flags).

### Why the chain counter is race-safe *by construction* (not by luck)

D-4's read-modify-write of the counter looks like a classic race (two child completions both
read gen=N, both write N+1, under-count). It is **exact-once anyway**, and the reason is
worth pinning because it's the reusable correctness argument:

> A per-chain counter is exact-once **iff each chain step has a one-row DB guarantee.**

Here: BC67's partial-unique (one active execution per task) + the one-active guard + debounce
⇒ **exactly one retrigger row per generation**. Generations are **strictly serial** — gen
N+1 cannot fire until gen N's children are terminal, which is downstream in time of gen N's
row. So N concurrent readers always race the **same** prior generation, and exactly one wins
the write. No advisory lock needed. **Caveat (pin it in code):** this depends entirely on the
one-row invariant — do **not** colocate such a counter with any feature that allows >1 active
execution per chain step.

### Trust boundary: read chain-state only from a server-written link

If the chain's *first* link is client-initiated (the interactive CREATE carries
client-supplied `body.context` → persisted verbatim, see
`client-context-trust-boundary-2026-06-14.md`), a counter must be read **only from a
server-written link** — D-4 reads `reactorGeneration` solely when the prior `source ===
'reactor-pipeline-retrigger'`, else treats it as 0. Otherwise a client seeds a high starting
value and self-trips the budget. General rule: **any chain-state field a control decision
reads must be ignored on a client-writable link.**

### Cost & the two execution paths (extends Lesson 2 — grading reactor/engine cost)

Lesson 2 named the two tool-loop paths as a *drift-bug* class. They are also a **cost/
concurrency** class, which drove the Finding B analysis:

- **Interactive path** (stream route / `api-task-execute`): runs the agentic loop **inline
  in the request** → each is its own concurrent LLM job, **NOT** clamped by the `take:5`
  poller.
- **Reactor path**: goes through the poller → `take:5` global clamp.

And the cost itself: **agent LLM calls bill the triggering user's OWN Anthropic key** (task
#85 BYOK, no platform fallback — `anthropic-sdk-provider.ts:67-74`). There is no shared
platform LLM budget. So a "concurrent-execution exhaustion" vector on the execution path
spends the **user's own money** — the only genuinely *shared* resource is server/runner
capacity (the inline path).

> **Grading lesson (worked example: Finding B deferral):** before treating concurrent
> executions as a *shared*-cost exhaustion vector, **verify who pays** against the LLM client
> construction. Finding B was scoped + 4-specialist-reviewed as a shared-LLM-cost vector that
> *didn't exist* because nobody checked the BYOK model. Who-pays is a claim; verify it.

### Design decisions & alternatives considered (D-4)

Mirrors the A/B/C table that opened this doc — the rejected paths are the durable knowledge:

| Decision | Chosen | Rejected alternatives & why |
|---|---|---|
| **Bound shape** | Per-harness **generation budget** (count chain depth) | Per-*user* backlog-row cap — keys on row count, can't be set without risking self-starvation of a legitimately deep pipeline. Generation budget keys on chain depth: a bounded-depth pipeline can never trip it; only a runaway does. |
| **Budget value** | **10** (env-tunable) | First scoped at ~50 on a *wrong* model ("legit generations ≈ stage count"). Review corrected it: the shipped harness retriggers **exactly once** (CREATE→SYNTHESIZE→`task.complete`; no stage-N+1 mode; once complete, the IN_PROGRESS guard can't re-fire) → legit max = 1. 10 = runaway headroom, and matches the `maxTotalRetries=10` precedent. |
| **Hard vs soft** | **Soft** (best-effort, no advisory lock) | A `pg_advisory_xact_lock` is unnecessary — the one-row-per-generation invariant already gives exact-once (see race-safety above). A lock would serialize per-harness creates for zero gain. |
| **Surfacing** | Route through `reactor-skip-counter.ts` (`logReactorBudgetSkip`) | A bare `log.warn` loses the first/100th/hourly escalation cadence and isn't grep-distinguishable from other skips. **No `securityEvent`** — a budget-stop is a benign runaway-guard (a *fact* signal, Protocol 10-clean), not an integrity violation like the clobber-mismatch skip. |
| **Whole feature: Finding B** (sibling per-user interactive ceiling) | **Deferred/dropped** | Justified as shared-LLM-cost exhaustion — false premise (BYOK, above). Real residual (server capacity) is self-funded + deliberate + modest. If capacity ever strains, the right tool is a server-level concurrency guard, not a per-user JSONB-counted cap. |

---

## Reactor Roadmap

Priority-ranked. Each entry is a future reactor following the same shape as the shipped ones above.

### 1. Next-Stage Auto-Fire Reactor (Highest — existing TODO)
**Tracked in:** `TODO-EVENT-DRIVEN-PIPELINES.md`
**Event:** All tasks in stage N terminal
**Guard:** stage N+1 exists AND contains a PIPELINE task AND it has no prior execution
**Action:** queue PENDING execution for stage N+1's PIPELINE task
**Value:** the POV delivers itself — user walks away after setup

### 2. Quality-Gate Reactor
**Event:** task.complete called with `confidence` score
**Guard:** confidence < 50 AND task has a reviewer template available AND no re-execution attempt recorded yet
**Action:** post diagnostic comment with the low score + specialist's summary; queue a reviewer execution
**Value:** poor outputs don't propagate; the harness doesn't need to wait-and-check

### 3. Artifact-Downstream Reactor
**Event:** `agentArtifact` created with a specific tag (e.g., `kind: "framework"` or `kind: "audit-finding"`)
**Guard:** a dependent task is OPEN and its prompt references this artifact kind
**Action:** inject artifact into the dependent task's `inputContext` via context-chainer, then queue execution
**Value:** context chaining becomes first-class and event-driven; no manual "pull artifact X into task Y"

### 4. Phase-Transition Reactor
**Event:** last stage in a phase marked terminal
**Guard:** next phase exists AND has a defined starting stage
**Action:** update POV phase pointer; if the next phase has a PIPELINE task, cascade to reactor #1
**Value:** multi-phase POVs advance without human phase-change clicks

### 5. POV-Milestone Reactor
**Event:** scheduled (endDate, forecastDate, etc.)
**Guard:** POV status not yet final; milestone-specific email not already sent
**Action:** send customer/internal notification with current status; optionally queue a status-report pipeline
**Value:** forecast drift, end-of-POV reviews, stakeholder updates happen without a PM remembering

### 6. Escalation Reactor
**Event:** task confidence < 50 AND one re-execution attempt already failed; OR task FAILED terminally; OR harness posts an `ESCALATE:` prefixed comment
**Guard:** escalation not already raised for this task
**Action:** notify POV owner (email / in-app); assemble relevant context into the notification (task, confidence, attempts, last error)
**Value:** humans get pulled in only when automation is genuinely blocked, and they get the context they need immediately

### 7. Template-Degradation Reactor
**Event:** template's rolling-window success rate drops below threshold (e.g., 60% over last 20 runs)
**Guard:** not currently in re-evaluation; sample size adequate
**Action:** queue a template-improvement specialist execution; collect failed runs as input context
**Value:** template quality stays high without periodic manual audits

---

## Observability Requirement

Every reactor MUST log:

1. **Triggered** — the event, the target, and what was queued
2. **Skipped-because-X** — every guard check that caused a skip, with the reason (`already-running`, `debounced`, `not-in-progress`, `no-siblings`, etc.)

Why both: when an automation loop *doesn't* close, the most common question is *"why didn't the reactor fire?"* Silent skips make that unanswerable. The existing `pipelineRetriggerReactorService` logs both cases at DEBUG level for skips and INFO for triggers — use this as the template.

Debug queries you should be able to answer from logs alone:
- "How many retriggers fired in the last hour?"
- "Why didn't the retrigger fire for task X?"
- "Are we hitting the debounce window a lot?" (if yes: tune it, or there's a loop)
- "Did a harness hit its generation budget?" (`errorCode: HARNESS_GENERATION_BUDGET_EXCEEDED`)

The skip taxonomy now has **three** kinds, all via `reactor-skip-counter.ts` with the same
escalation cadence: `DUPLICATE_ACTIVE_EXECUTION` (benign race), `PIPELINE_STAGE_MISMATCH`
(clobber — carries `securityEvent`), and `HARNESS_GENERATION_BUDGET_EXCEEDED` (D-4 runaway
guard — benign, no `securityEvent`). When adding a new reactor skip reason, add a kind here,
don't `log.warn` inline.

---

## Scaling Plan

**Today (≤ 3 reactors):** Inline hooks at the emission site, direct imports of the reactor service, fire-and-forget `.catch(() => {})` pattern. This is what `pipelineRetriggerReactorService` does.

**When we reach ~10 reactors:** Inline hooks become hook-sprawl — every `task.update({ status: ... })` call accumulates multiple reactor imports. At that point, migrate to **one of two** mechanisms:

### Option A: Typed in-process event emitter
A central `domainEvents` module with `emit()` and `on()` for each event type:

```ts
domainEvents.emit('task.completed', { taskId, stageId, confidenceScore });
```

Each reactor subscribes once at module load. Call sites emit events without knowing reactors exist.

**Pros:** Decoupled; easy to add/remove reactors; straightforward to test.
**Cons:** In-process only; if the server restarts during emission, events are lost (mitigable with the same PENDING-execution pattern we already use).

### Option B: PostgreSQL NOTIFY/LISTEN channel
The codebase already uses PG NOTIFY/LISTEN for real-time UI updates (search for `notify_execution_update` trigger in schema). Extend this to a `domain_events` channel:

```sql
NOTIFY domain_events, '{"type":"task.completed","taskId":"..."}'
```

Each reactor is a persistent LISTEN client in the Node process.

**Pros:** Cross-process (Main Server + MCP Server both receive); survives a single-process crash; leverages existing infrastructure.
**Cons:** More ceremony for local dev; requires a connection pool dedicated to listeners.

**Default choice:** Start with A (simpler), migrate to B if we need cross-process or persistence.

### Reactor execution-throughput ceiling (capacity headroom — not a bug)

Reactor-queued executions drain through the engine poller `processPendingExecutions` —
a single 10s interval taking `take:5` (`agentExecutionEngine.ts:258`). So the *start* rate
is ~5 every 10s = **~30 reactor-driven executions/min globally** (all pipelines, all users).
This is fine today and is the SAME clamp that bounds the chain-depth runaway cost-rate
(see § "Reactor Chain Depth"). It is the **rate** dimension; D-4 capped **depth**.

The binding constraint is co-gated: each execution runs an agentic loop (minutes), so at
steady state ~5 run concurrently and the 30/min is the *enqueue-to-start* rate, not the
completion rate. **Trigger to act (none yet):** if PENDING reactor-row backlog grows
unbounded or start-latency climbs under load, the levers are — raise `take:5`, shorten the
10s interval, make both env-configurable, or move to per-stage workers. Don't pre-optimize;
just know the headroom. (agent-execution-specialist owns the poller.)

---

## Anti-Patterns (What Reactors Are NOT)

- **Not a handler.** Handlers process requests (sync or async) and return a response. Reactors have no caller and no response — they're fire-and-forget.
- **Not a cron job.** Cron runs on schedule. Reactors run in response to domain events.
- **Not a workflow step.** Workflows are human-authored sequences of tool calls. Reactors are infrastructure that closes loops automatically.
- **Not business logic.** A reactor's *condition check* can touch business rules, but the action it queues should be a well-defined orchestration primitive (execute a task, send a notification, advance a phase). Don't make the reactor the place where business logic lives.

When the need is synchronous — e.g., "when the user clicks Complete, recalculate the task's ROI before returning" — that's a handler responsibility, not a reactor. Reactors are for loops that close *after* the emitting transaction commits.

---

## Strategic Implications

1. **The reactor is the unit of automation progress.** Measuring "how automated are we?" becomes "what fraction of our domain events have reactors?"
2. **Reactors decouple components.** The Pipeline Harness doesn't know about the agent execution engine's completion events. The engine doesn't know about the harness's mode model. The reactor bridges them. Future integrations (external MCP services, CRMs) can be reactor-mediated too — adding a new integration = adding a new reactor, not modifying 17 places in the core.
3. **Hook sprawl is a leading indicator of needing an event bus.** When we hit ~10 reactors, we formalize. Until then, inline hooks are fine and measurable.
4. **Observability-first.** Every reactor ships with its skip-reason taxonomy logged. Debugging "why didn't it automate?" must be tractable.

---

## References

- **Stack map (start here):** `autonomous-delivery-stack.md` — how reactors fit in the broader automation stack
- **Pattern doc:** `.claude/knowledge/patterns/orchestration-reactor-pattern.md` (Pattern #46)
- **Canonical impls:** `lib/services/pipelineRetriggerReactorService.ts`, `lib/services/taskReadyReactorService.ts`
- **Related TODOs:** `TODO-EVENT-DRIVEN-PIPELINES.md`, `TODO-CASCADING-PIPELINES.md`
- **Pipeline harness architecture:** `ARCHITECTURE.md`, `PIPELINE-HARNESS-USER-GUIDE.md`
