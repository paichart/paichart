# pipeline-harness-specialist — Domain Library

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

> **Created 2026-06-11** (Protocol 12 soft-band trim). Depth evicted from the agent file; verbatim;
> the paired discovery's proven greps outrank this file.

## [evicted] Core Knowledge and Expertise

### 1. Three-Mode Execution Model (CREATE / ORCHESTRATE / SYNTHESIZE)

Every harness execution auto-detects one of three modes by inspecting `task.metadata.pipelineStageId` and the state of the child stage it points to:

| Mode | Trigger condition | Action | Exit behavior |
|------|------|------|------|
| **CREATE** | No `pipelineStageId` OR it points to an empty stage | Plan 3-7 tasks, create dedicated `Pipeline: X (Run YYYYMMDD-HHMM)` child stage, record its id in own metadata, create children with deps + templates, comment, EXIT | Harness stays IN_PROGRESS; first dep-free child auto-queued by `taskReadyReactorService.maybeQueueIfDepFree` |
| **ORCHESTRATE** | Child stage has ≥1 task but some lack `agentTemplateId` and are OPEN | Finish setup (assign missing templates, wire missing deps), EXIT | Same as CREATE |
| **SYNTHESIZE** | Every task in child stage is terminal (status=COMPLETED OR executionStatus=FAILED) | Quality-gate each child's confidence score, aggregate findings, call `task.complete` on self | Harness COMPLETED with confidence score in metadata |

Mode is decided by **metadata + DB state only** — never by comment history or agent narrative. This is enforced in the protocol and called out in the Universal Agent Rules preamble ("Trust Verified State Over Narrative").

**As of 2026-04-26**: mode is **platform-resolved via `lib/services/harnessModeResolver.ts`** before the LLM turn starts. The resolver reads `task.metadata.pipelineStageId` + child-stage state directly via Prisma and writes the result into the system prompt as a `## Harness Context (Platform-Resolved)` block above the protocol injection. The agent reads it; the agent does NOT detect mode itself. This is the third application of the trust-direction-shift pattern (after the clobber-detection back-pointer at commit `8f225353`). Failure mode it fixes: budget-exhausted runs that couldn't read metadata via tool calls used to mis-classify as "first-run attempt" (~3/30 days production rate, exec `cmo10q2fx005yyxlaojiei0in`); now resolver provides authoritative mode regardless of agent tool-call success. The `resolvedMode` + `resolvedReasonCode` are also persisted to the `pipeline-index.json` artifact for forensic queryability — joins the agent-output-trustworthiness defense stack as a 7th signal type. See `cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/`.

**Deploy-order coupling note**: the resolver wiring (engine + stream-route + GUI) and the protocol prose update ("Your mode has been resolved by the platform... Harness Context block above") MUST ship together OR resolver-first. Future changes that touch the prose without touching the resolver wiring (or vice versa) MUST consider deploy-order coupling — see `cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/architectural-review-specialist-review.md` § C1 for the canonical analysis. The architectural-review specialist's "Self-Referential Coupling Discipline" standing prior applies.

The harness NEVER calls `agent.execute`. Children are run by the engine's 10s poller after being queued by `taskReadyReactorService`; SYNTHESIZE is queued by `pipelineRetriggerReactorService` when the last child terminates. The harness is a setup-and-exit component in CREATE/ORCHESTRATE, and a read-aggregate-complete component in SYNTHESIZE.

> **🟠 Stream-route reactor gap (DEFERRED 2026-06-09, parity sweep).** The normal pipeline path runs children via
> the engine poller, which fires `maybeRetriggerPipelineHarness` + `maybeQueueReadyDependents` INLINE
> (`agentExecutionEngine.ts:1639-1640` post-extraction 2026-06-10). But a user CAN manually run a pipeline child via the GUI SSE stream
> (`app/api/pov/agent/execute/stream/route.ts`), which fires NEITHER reactor inline. Common case is still covered:
> the child agent calling `perform(task.complete)` re-triggers the harness via `task-complete-handler.ts:349-350`.
> The gap is the engine's inline SAFETY NET the stream lacks — a GUI-executed child whose agent FAILS to call
> task.complete won't re-trigger the harness (the engine's inline fire would have). Deferred: GUI execution of a
> pipeline child is unusual (children normally run via the poller), and the fix touches the real-pipeline
> completion path. If revisited, mirror the engine's two fire-and-forget reactor calls in the stream success path.
> See `dual-execution-path-parity-pattern.md` (Post-completion reactors row) + `agent-execution-specialist.md`.

### 2. Template + Protocol Split (THIN template, protocol is source of truth)

The `Pipeline Harness` template (`scripts/seed-harness-template.ts`, v3.0.0) is deliberately thin: role identity, platform structure, template-type roster, dependency defaults, output rules. It does NOT contain step-by-step procedures.

The `pipeline-orchestrator-protocol` (v3.6.0 in `scripts/seed-protocol-prompts.ts` as of 2026-04-26) contains mode detection prose (post-Deploy-2: references the platform-resolved Harness Context block rather than agent-side detection), tool-call sequences, pre-flight checklist, and quality-gate thresholds. The engine injects protocol-tagged prompts into the harness's system prompt at execution time via the template's `loadProtocols: true` metadata flag.

**See Pattern #45 GS8 (`/.claude/knowledge/patterns/prompt-library-gold-standard-pattern.md`) for the rule** — "no contradictions between template and protocol" — and the v2-era bug that forced this split. Do not restate procedures in the template when adding new behavior; extend the protocol instead.

#### 2a. Two kinds of protocols — harness-side vs child-side (Apr 2026)

Two protocols exist in `agent_prompt_library` (tag = 'protocol'), loaded through **two distinct mechanisms** that serve different purposes. Understanding the split prevents misassignment:

| Protocol | Used by | Injection mechanism | Purpose |
|---|---|---|---|
*(⚠️ superseded 2026-08-17: `loadProtocols: 'composed'` — base + the task's ONE stamped protocol; the description below is the pre-composition record)* | `pipeline-orchestrator-protocol` | Pipeline Harness template | `metadata.loadProtocols: true` — engine injects ALL `tag=protocol` prompts, harness picks one at runtime from task title | **Harness-side** — tells the orchestrator how to decompose, assign, monitor, synthesize |
| `artifact-synthesis-protocol` | Artifact Harvester / Editorial Writer / Publication Reviewer | `metadata.protocol: 'artifact-synthesis-protocol'` — engine injects THIS one specific protocol at execution time | **Child-side** — tells specialists how to coordinate across phases of a synthesis pipeline |

**Critical distinction**: children of a pipeline NEVER inherit `pipeline-orchestrator-protocol`. That protocol is for the orchestrator; specialists would be confused by its "decompose / assign / synthesize" instructions. Verified empirically 2026-04-17: 4 recent non-synthesis pipelines (Meridian cloud security, blast radius, etc.) used vanilla specialists (Solution Architect, Security Analyst, Research Analyst, Business Analyst, Technical Writer) with **no `metadata.protocol`** — and that's correct behavior. Vanilla pipelines don't need a child-side protocol.

#### 2b. What a child-side protocol actually adds (and when one is needed)

**The key insight**: a protocol does NOT add coordination data flowing between tasks. The output of each task is the same whether a protocol is present or not — `task.context` still carries predecessor outputs as before. The protocol adds **shared reasoning** — each specialist's LLM has the same workflow document loaded, so they interpret each other's outputs consistently and produce outputs the next specialist can parse.

**What a child-side protocol adds (on top of task I/O)**:

1. **Shared vocabulary** — "Phase 3: Annotate" means the same thing to the Editorial Writer as it did when the Harvester mapped findings to "the Editorial Writer's Phase 3 input." Both tasks' LLMs reference the same phase names.
2. **Shape expectations** — Editorial Writer knows exactly what format to expect from the Harvester (markdown with `## Finding N` sections) because the protocol specifies both sides of the contract.
3. **Cross-task constraints** — "anchor every claim in evidence from the harvest" applies to all three specialists; written once in the protocol, not three times in role guidance.
4. **Decision rules** — "if Publication Reviewer flags conflations in Phase 4, Editorial Writer triggers restructure in Phase 5" — cross-task logic that each specialist knows their part of.
5. **Phase awareness** — the SAME template (Editorial Writer) runs Phases 3, 5, AND 6 with different behavior each time; the protocol tells it which phase it's in and what to do differently.

**When a workflow needs a child-side protocol**: if ≥3 of these 5 properties apply, a protocol is warranted. Synthesis exhibits all 5. Vanilla pipelines exhibit NONE — each child is a different template, produces its natural role deliverable, no retry loops, no shared-across-tasks constraints, no mandatory phase sequence. Role guidance + task description suffices; a protocol would be overkill and would inject orchestration-style content into specialists that don't need it.

### 3. Metadata-Based Child-Stage Linkage (Option A)

The harness lives in one stage and creates a **dedicated** child stage for its children, named `Pipeline: <objective> (Run <YYYYMMDD-HHMM>)`. The child stage's id is written to `task.metadata.pipelineStageId` on the harness task.

This single pointer is what:
- `pipelineRetriggerReactorService` uses to detect "all children of THIS harness are terminal" (looks up PIPELINE tasks whose `metadata.pipelineStageId` equals the completed child's `stageId`)
- `task-complete-handler.ts` uses in the 4-point invariant (see §5)
- `task-update-handler.ts` mirrors in its bypass-seal invariant

**If `pipelineStageId` is missing or points at the wrong stage, the entire automation loop is broken** — SYNTHESIZE never fires, completion is blocked. Test 3 in the smoke test is specifically for this linkage.

### 4. Reactor Integration (2 reactors, 6 call sites)

The harness depends on two reactors — neither is owned by this specialist (that's `event-system-specialist`) but the harness does not function without them. **See Pattern #46 (`/.claude/knowledge/patterns/orchestration-reactor-pattern.md`) for the reactor shape** — don't restate it here.

| Reactor | Service file | Purpose for the harness |
|------|------|------|
| `taskReadyReactorService` | `lib/services/taskReadyReactorService.ts` | Kicks off the first dep-free OR born-ready child (`maybeQueueIfDepFree` via `agent.assign` / `task.create` / `task.update` — gap (e) fix 2026-07-18, shared `unsatisfiedDepExistsSql` predicate, PIPELINE-with-deps skipped per CC6) and cascades dependents as each child completes (`maybeQueueReadyDependents` via task-COMPLETED) |
| `pipelineRetriggerReactorService` | `lib/services/pipelineRetriggerReactorService.ts` | Re-enters the harness in SYNTHESIZE mode when the last child transitions to terminal |

**Call-site inventory (6 total — audit all 6 when changing harness completion semantics):**

| Location | Reactors fired | Trigger | Grep anchor |
|------|------|------|------|
| `lib/services/agentExecutionEngine.ts` success path | Both | After successful task COMPLETED tx | search for `maybeRetriggerPipelineHarness` + `maybeQueueReadyDependents` together |
| `lib/services/agentExecutionEngine.ts` failure path | pipelineRetrigger only | After executionStatus=FAILED tx | `maybeRetriggerPipelineHarness` (second occurrence) |
| `lib/mcp/tasks/action/handlers/task/task-complete-handler.ts` | Both | After MCP task.complete | both `maybe...` imports at top |
| `lib/mcp/tasks/action/handlers/task/task-create-handler.ts` | taskReady (`maybeQueueIfDepFree`) | After atomic create + deps wiring (rare path) | `maybeQueueIfDepFree` |
| `lib/mcp/tasks/action/handlers/agent/agent-assign-handler.ts` | taskReady (`maybeQueueIfDepFree`) | After template attached to existing task (common harness path) | `maybeQueueIfDepFree` |
| `lib/mcp/tasks/action/handlers/task/task-update-handler.ts` | taskReady (`maybeQueueIfDepFree`) | After dep rewrite / template attach commits (gap (e) door 2026-07-18; PIPELINE + FAILED call-site guards) | `maybeQueueIfDepFree` |

`agent-assign` is the harness's common kickstart path — the harness pattern is create-task-first-then-attach-template, so the template isn't present at create time.

#### 4a. Dual-process reactor architecture (PostgreSQL NOTIFY/LISTEN race)

Both pm2 processes (`paichart-mcp` id=0 and `paichart-web` id=1) subscribe to the same PostgreSQL NOTIFY channels and run the same reactor service code. **Pipeline cascade is reactor-driven, not process-bound** — only the user-initiated FIRST execution (the harness's CREATE, triggered via MCP `agent.execute`) is bound to whichever process received the MCP call. Everything after that — children executing as deps clear, and the harness re-firing for SYNTHESIZE — fires from PostgreSQL `NOTIFY` events delivered to both processes simultaneously.

When a notify lands (e.g., a child task hits terminal status), the cascade race goes:
1. Both processes' reactor handlers receive the event simultaneously
2. Both call into the engine to claim the work
3. The **active-execution-unique-constraint partial index** (third-layer race guard from `HARNESS-MENTAL-MODEL.md` Chapter 2) lets only one INSERT succeed
4. The loser logs an idempotency-skip via `logReactorDuplicateSkip` and exits silently
5. The winner runs the execution to completion in its process

**Which process wins is non-deterministic** — depends on which event loop is less busy at the millisecond the notify lands. A single pipeline can flip processes mid-cascade. Empirical evidence (Run 6, 2026-04-29):

| Run 6 execution | Triggered by | Process |
|---|---|---|
| Harness CREATE | User (MCP agent.execute) | paichart-mcp ✓ (only mcp could — direct call) |
| Phase 0 Acquirer | reactor (dep-free auto-queue) | mcp |
| Phase 3-6 Editor | reactor (dep-completion) | mcp |
| Phase 4+7 Reviewer | reactor (dep-completion) | **web** ⚠️ |
| Harness SYNTHESIZE | reactor (pipeline retrigger) | **web** ⚠️ |

**Two implications**:

(a) **Defense-in-depth, intentional**: if one process crashes mid-cascade, the other picks up the next reactor event seamlessly. No single-point-of-failure for the cascade. The 20-minute stale-execution watchdog in `agentExecutionEngine.ts:162-218` provides another layer for the rarer "neither process processes the event" case.

(b) **Forensic implication, easy to get wrong**: when investigating a pipeline you cannot assume "MCP-triggered runs live in paichart-mcp logs." Only CREATE does. The `PIPELINE-OBSERVABILITY-GUIDE.md` PM2 playbook now defaults to `grep ... /var/log/paichart/{mcp,web}-combined-*.log*` for this reason. The pre-2026-04-29 framing ("95% of pipeline-relevant logs live in paichart-mcp") was empirically wrong.

If you're modifying reactor service code, **changes apply uniformly to both processes** — there's no opt-out. If you need a process-specific behavior (extremely rare), wire it explicitly via process-startup flags rather than reactor logic.

### 5. Anti-Fabrication Three Layers + 4-Point Invariant

The harness must never fabricate its own completion. Three independent layers enforce this, with the handler-layer invariant now extended to a 4-point check (2026-04-25 — clobber-detection defense):

| Layer | Where | What it enforces |
|------|------|------|
| **Protocol rule** | `pipeline-orchestrator-protocol` (DB, v3.6.0 as of 2026-04-26) + harness template role guidance | Agent instructed never to call `task.complete` on self when pipeline incomplete; escalate via comment + leave IN_PROGRESS |
| **Handler invariant** (4-point) | `task-complete-handler.ts` (inside `handleTaskComplete`) + `task-update-handler.ts` (inside `handleTaskUpdate` around the status-transition block) | **4-point check**: (1) metadata.pipelineStageId set; (2) child stage has ≥1 task; (3) every child terminal (status=COMPLETED OR executionStatus=FAILED); **(4) child stage's `metadata.harnessTaskId` matches the calling task's id**. Sunset 2026-04-25: legacy soft-warn was flipped to hard-fail same-day as Deploy 2 after a 5-stage UAT backfill cleared the legacy population. Both `task.complete` and `task.update{status: COMPLETED}` paths are gated — the update path exists specifically to seal the bypass. Any 4th-point miss (mismatch OR missing/non-string back-pointer) throws `PipelineStageMismatchError` with `code: 'PIPELINE_STAGE_MISMATCH'` AND emits `log.warn({securityEvent: true, ...})` BEFORE the throw. Grep anchor: `"PIPELINE task completion invariant verified — all 4 points pass"` log string appears in both files on the passing path |
| **Engine skip** | `agentExecutionEngine.ts:1604,1614` success path + `app/api/pov/agent/execute/stream/route.ts:1444,1450` (mirror, see §6; re-verified 2026-06-10 post-extraction) | Both execution paths check `isPipelineTask` and omit `status: COMPLETED` from the on-success task update. The engine does not auto-complete a PIPELINE task when its LLM returns end_turn — only explicit `task.complete` can complete it, and only after passing the invariant. Grep anchor: `isPipelineTask` appears in both files. **`scripts/test-pipeline-engine-skip.ts` regression test locks this in** — if a future refactor removes either skip, defense reachability silently vanishes |

Removing or weakening any one of these three layers is a regression, even if the other two still hold. The protocol can be misread; the engine skip can be forgotten on one path; the handler invariant is the final gate.

**The 4th invariant point is the clobber-detection guard.** It defends against silent corruption where `task.metadata.pipelineStageId` is changed mid-run to point at a stage owned by a different harness. The back-pointer (`stages.metadata.harnessTaskId`) is written server-side by `task-update-handler.ts:503` whenever a PIPELINE task records its `pipelineStageId` — no agent action required. Originally launched with a forward-only soft-warn for pre-deploy legacy stages; sunset early on 2026-04-25 (UAT context + same-day backfill of 5 known legacy stages). Now any 4th-point miss (mismatch OR missing/non-string back-pointer) is a hard-fail. The reactor mirrors the check at `pipelineRetriggerReactorService.ts` Guard 3.5 (defense-in-depth via `logReactorMismatchSkip`). See: `cline_docs/reviews/harness-clobber-detection-2026-04-25/` + `project_harness_clobber_sentinel.md` memory entry (sunset closure).

**Reusable backfill+flip procedure** (applicable to any future "legacy data needs a default value retrofit" scenario):

1. **Quantify the legacy population** with a single SQL query joining the parent table to the dependent table on the missing key.
2. **Decide cost**: if the population is small enough to backfill in one `UPDATE` (<1000 rows is usually trivial), and a sane default exists (e.g., the matching task id), backfill is cheaper than waiting.
3. **Backfill inside `BEGIN; ... ; SELECT verification ; COMMIT;`** — verify the post-update count drops to zero before committing.
4. **Flip the soft-warn paths** to throw/skip — same fix sites as the original soft-warn (search `reason: 'no-back-pointer-or-non-string'` and `reason: 'legacy-stage-no-back-pointer'`).
5. **Update memory entries** so future invocations don't re-evaluate the closed sunset (rewrite `project_*_sentinel.md` as CLOSED with the backfill story).
6. **Update protocol/specialist prose** to remove the soft-warn framing — knowledge bases drift fast if the "transient state" language outlasts the transient state.

The general principle: conservative sunsets are sized for *production-shaped volume*; UAT contexts almost always justify shorter windows. When backfill is cheap, the calendar window should compress to zero.

### 6. Two-Execution-Path Hazard

> **⚠️ CRITICAL WARNING:** The agent tool loop is implemented TWICE — once in `lib/services/agentExecutionEngine.ts` (queued/polled path, used by reactor-fired executions including all cascaded children) and once inline in `app/api/pov/agent/execute/stream/route.ts` (streaming path, used when a user clicks Execute in the GUI). These have silently drifted at least three times: `MAX_TOOL_TURNS` hardcoded in stream vs template-configurable in engine; PIPELINE auto-complete skip missing in stream; completion reactor hooks missing in stream. **Any rule that applies to agent execution — turn budgets, completion semantics, reactor hooks, PIPELINE-type guards — must be audited against BOTH paths.**
>
> This warning is a cross-reference to agent-execution-specialist's authoritative callout (see `/.claude/agents/agent-execution-specialist.md` §Streaming Route — grep `CRITICAL WARNING`). When you touch harness behavior at the execution layer, stop at that callout and audit both paths. The harness debugging cycles of 2026-04-14 lost ~8 iterations to this drift before `grep -rn 'MAX_TOOL_TURNS' lib/ app/` revealed it.

### 7. Turn-Budget Reality (Configuration Integrity)

The harness template sets `metadata.modelParameters.maxToolTurns: 100` (v3.0.0). Both execution paths now read this from template metadata (stream route was fixed in commit `e008aba2` — it previously hardcoded `10`). Per-mode soft budgets in the template role guidance are CREATE ~20, ORCHESTRATE ~15, SYNTHESIZE ~20; approaching 80 is the "stop and escalate" threshold.

If you see the harness hitting a 10-turn wall again, treat it as a drift regression in the stream route BEFORE blaming the protocol. The 2026-04-14 retrospective is explicit: when any resource limit looks wrong, `grep` the entire repo for its name first.

### 7a. SYNTHESIZE-mode Quality-Gate Retry (Harness-level cascade-time recovery)

**Documented in protocol prose** at `seed-protocol-prompts.ts:282-288` (Pipeline Orchestrator Protocol, Step 3 Quality Gate). The harness in SYNTHESIZE mode reads each child's `confidenceScore` from its `result.json` and applies a quality gate:

| Child confidence | Documented action | Mechanism |
|------------------|-------------------|-----------|
| **≥ 70** | Accept; proceed to Step 4 (synthesise) | No retry; the deliverable is already good enough |
| **50-69** | Re-execute the child once with diagnostic feedback | Harness LLM posts `**HARNESS DIAGNOSTIC**` comment on the child task naming the root cause + specific corrective feedback, then calls `perform(action: "agent.execute", taskId: <child id>)`; harness exits; pipeline-retrigger reactor brings harness back when the child re-completes; SYNTHESIZE retries the gate against the new score |
| **< 50** | Escalate; do NOT synthesise; leave harness IN_PROGRESS for human triage | Per documented protocol |

> ⚠️ **Corrected 2026-09-27 — the 50-69 row above is historical in two respects.** (1) "with diagnostic feedback" was
> never true of the CHILD: the `**HARNESS DIAGNOSTIC**` comment does not reach the re-run's prompt (F1, known since
> 2026-07-04), so the retry is a BLIND re-roll — and RWF Stage 3, the findings-carrying retry that would have changed
> that, was STOPPED on measurement 2026-09-27 (see § "2026-09-27" at the end). (2) The re-execution is now bounded at
> the chokepoint (RWF Wave C, `orchestrator-reexecution.ts`): one ORCHESTRATOR re-execution per child per harness run,
> a reviewer refused on a provably same-input re-roll, and since RWF D1/X18 the harness may not change the child's
> prompt, role, inputContext, model or provider on that re-run. The `< 50` improvised-retry pattern below is subject
> to the same cap.

**Empirically observed extension to `< 50` cases** (Run 2, 2026-04-28, task `cmohyjjzr0011yxagg4hecbtz`): the harness LLM diagnosed a `< 50` failure as a recoverable I/O-pattern issue and re-executed rather than escalating. Specifically the Publication Reviewer scored 25/100 because it tried to call `project(action: "task.context")` to read the Editorial Writer's article (returns metadata, not artifact content) and "fabricated critique without reading article" when that returned nothing useful. The harness identified the root cause from the Reviewer's own `result.json.finalResponse` self-disclosure ("could not access artifact-..., reviewer could not read article"), posted a structured diagnostic comment naming both the cause AND the corrective behaviour ("**The Editorial Writer's article IS in your §6 Pipeline Context as auto-chained finalResponse**. Read it there — do NOT try to fetch the artifact by ID"), then re-executed. Recovery: 25/100 → 92/100. Total wall-clock impact: ~1m20s for the retry execution.

This `< 50` retry is **NOT in the documented protocol** — the protocol says < 50 escalates. The harness LLM made a judgment call that the failure was recoverable and acted on it. The judgment was correct in this case (verified empirical recovery). Whether to make this canonical (update the protocol prose to allow "< 50 with identifiable cause → retry") or treat it as emergent flexibility worth preserving without prescribing is an architectural call worth a future review pass. For now, the behaviour is observed-and-beneficial; the harness specialist file documents it as a recognised pattern.

**Distinct from engine-level intervention #90**: the engine has its own diagnostic retry inside the LLM tool loop (`agentExecutionEngine.ts:~981` post-extraction, ships `toolLoop.diagnosticRetryUsed: true` flag) for the 50-69 band. That fires BEFORE the execution row commits and produces a single execution. The harness-level retry fires AFTER the execution row commits and produces a SECOND execution row. Both can fire on the same child in the same pipeline — Run 2's Reviewer had intervention #90 fire (lowering 70-band → 25), then the harness-level retry fire (recovering 25 → 92). Forensic signature for distinguishing them:

- **One execution row, `toolLoop.diagnosticRetryUsed: true`** → intervention #90 only
- **Two execution rows, first < 70, second >= 70, with a `**HARNESS DIAGNOSTIC**` comment between them** → harness-level retry only (with or without intervention #90 firing within either execution)
- **Two execution rows, first row has `diagnosticRetryUsed: true`, with the harness diagnostic comment** → both layers fired

**See agent-execution-specialist.md** §"Two cascade-time retry layers" for the engine-level mechanics.

### 8. Reactor Auth Propagation (Triggering-User Model)

> **⚠️ CRITICAL INVARIANT (Apr 2026):** Every reactor-queued execution MUST inherit the triggering user's identity, NOT the task assignee. Reactor children run LLM calls billed to the human who launched the pipeline.

**The contract** (`lib/services/types/triggered-by.ts`):

```ts
{
  id: <CUID userId>,        // triggering user — propagated from harness root execution
  source: <TriggeredBySourceEnum>,  // discriminator: mcp-direct | reactor-task-ready-initial | reactor-task-ready | reactor-pipeline-retrigger | ...
  parentExecutionId?: <CUID>,  // forensic lineage for reactor-queued children
  parentTaskId?: <CUID>,       // parent harness task
}
```

`.strict()` Zod schema + `.cuid()` on `id` + required `source` enum. Written via `createAgentExecution()` wrapper in `lib/services/agent-execution-create.ts` — **no raw `prisma.agentExecution.create` anywhere else in the repo** (enforced by `scripts/test-agent-execution-security.ts` G8 tests). **(2026-06-07, commit 6c640337) `createAgentExecution()` also runs dependency context chaining BEFORE the INSERT — via `lib/agents/harness/prepare-task-for-execution.ts` — so EVERY path (incl. the reactor cascade and SSE stream) gets §6 chained context, not just explicit `agent.execute`. Chained §6 is capped 128KB/predecessor, 512KB total; `pipelineMetadata.anyTruncated` is the queryable truncation tripwire.**

**Where reactor lineage is resolved** — `resolveTriggeredByFromParent(child, reactorSource)` in `agentExecutionConfigBuilder.ts`. Uses parameterized `$queryRaw` with a 2-hop SQL lookup: child.stageId → PIPELINE task → latest execution's `context.triggeredBy`. Tri-state policy:

| State | Action |
|---|---|
| Parent PIPELINE found + triggeredBy valid | Propagate with new `source` (reactor-task-ready / reactor-task-ready-initial / reactor-pipeline-retrigger) + parent lineage |
| No parent PIPELINE found | Legitimate non-harness reactor — fall back to `{id: task.assigneeId, source: 'child-assignee-fallback'}`, log INFO |
| Parent found but triggeredBy malformed/missing | Corruption — log WARN, skip queuing |
| Parent deleted mid-read | Race — log DEBUG, skip queuing |

**Engine pre-flight** (`agentExecutionEngine.ts` just after line 566) — before any LLM call, checks `userLLMSettings.apiKey` is non-empty. If empty, throws `AuthError('USER_CONFIG_REQUIRED')`. Error artifact JSON carries `errorCategory: 'USER_CONFIG_REQUIRED'` so the GUI can render a "Fix settings" banner with deep-link to `/settings/llm` instead of generic "execution failed".

**No env-var fallback anywhere.** Anthropic SDK's silent `process.env.ANTHROPIC_API_KEY` autodiscovery is closed by throwing BEFORE `new Anthropic(...)` when no apiKey is present (`anthropic-sdk-provider.ts` C2 guard). Removed from `ecosystem.config.js` as defence in depth.

**Forensic audit trail** — every wrapper write fires a fire-and-forget `logActivityWithDetails()` in a separate transaction with `{authMethod, triggeredBySource, parentExecutionId, parentTaskId, povId, executionId}`. If the audit write fails, loud-log but never swallow; the execution is authoritative.

**Prod-verified lineage shapes** (task #85 smoke test, 2026-04-15):

```
Harness CREATE  → { id: userId, source: 'mcp-direct' }
  ├─ Child 1    → { id: userId, source: 'reactor-task-ready-initial', parentTaskId, parentExecutionId }
  ├─ Child 2    → { id: userId, source: 'reactor-task-ready-initial', parentTaskId, parentExecutionId }
  ├─ Child 3    → { id: userId, source: 'reactor-task-ready',         parentTaskId, parentExecutionId }
  └─ Harness SYNTHESIZE → { id: userId, source: 'reactor-pipeline-retrigger', parentTaskId, parentExecutionId }
```

All 5 executions carried the MCP-session user's userId. Zero fallbacks to `task.assigneeId` (POV owner). Engine pre-flight passed cleanly; no AuthError events.

**Debug signals when auth breaks**:

| Symptom | Likely cause |
|---|---|
| Empty LLM response + "No API key configured" in artifact | Triggering user has no apiKey in UserSettings — direct user to `/settings/llm` |
| `extractUserId` warn-log in pino (`falling back to task.assigneeId`) | Reactor wrote `triggeredBy` in a non-schema-compliant shape (legacy row or new drift site) — check `grep triggeredBy: lib/services/*Reactor*` |
| `BoundaryContractViolation` thrown at wrapper | New caller assembled `triggeredBy` wrong — fix the caller, don't weaken the schema |
| Cross-user billing (POV owner billed for MCP user's work) | Pre-fix regression — verify the wrapper is deployed (`git log 0ac5cc93.. -- lib/services/agent-execution-create.ts` on prod) |

**Related patterns**:
- `orchestration-reactor-pattern.md` (Pattern #46) — the reactor shape + "Context Field Shape Drift Across Reactor Boundary" pitfall
- `boundary-contract-wrapper-enforcement-pattern.md` (the wrapper + schema + grep-test triad)

### 9. Protocol Step Validator (P8, Apr 2026)

> **⚠️ INVARIANT:** A harness execution that exits cleanly (status=SUCCESS) but skipped required protocol steps must be flagged with structured evidence. Status stays SUCCESS — but the `protocolValidation` field surfaces what the harness left unfinished.

**Architectural role — sibling, not duplicate, of the handler invariant (§5):**

The handler invariant **enforces** structural correctness — it throws on `task.complete` if the 4 points fail (pipelineStageId set + child stage non-empty + all-children-terminal + back-pointer match). The validator **detects** procedural drift — it audits the post-execution tool log and reports which protocol steps the agent skipped, even when the execution exited SUCCESS. Different layers, different purposes:

| Layer | Lives in | Triggers on | Effect on execution |
|---|---|---|---|
| Handler invariant (§5) | `task-complete-handler.ts` / `task-update-handler.ts` | `task.complete` / `task.update status=COMPLETED` | Throws — blocks completion |
| Engine skip (§5) | `agentExecutionEngine.ts` / `stream/route.ts` | LLM `end_turn` on PIPELINE task | Refuses to set status: COMPLETED — invariant must fire instead |
| Protocol validator (this section) | `pipelineProtocolValidator.ts` | Engine post-LLM-turn (after toolCallResults stable) | Additive metadata — never blocks; surfaces gaps in `result.json.protocolValidation` |

**Architectural constraint** (declared at `pipelineProtocolValidator.ts:127-128`): the validator only sees `toolCallResults`, NOT DB state. It can count `task.update` calls but cannot inspect what `metadata.pipelineStageId` was set to. The 4th invariant point (back-pointer match) is structurally unreachable here — that's why it lives in the handler, not the validator.

**The 2026-04-16 artifact-synthesis incident** drove the original validator: harness made 3 `task.create` calls, then 2 `agent.assign` calls, then 1 failed `agent.assign` (budget rejected), then exited. Pipeline stalled with the third child untemplated forever. Engine status: SUCCESS. Reactor: skipped (correctly — child has no agentTemplateId). No system signal flagged the structural defect.

**Defense — engine-side post-execution validator** (`lib/services/pipelineProtocolValidator.ts`):

Pure function. Runs ONLY for `task.type === 'PIPELINE'`. Tallies successful tool calls by `arguments.action`, detects mode from tool-call signature, compares to required step signature, AND (added 2026-04-25) inspects the LAST `task.comment` content for protocol-mandated patterns.

**Mode detection from tool log** (not from task.metadata — tool calls are the authoritative record of what the agent actually did):

| Mode | Hallmark tool calls |
|---|---|
| CREATE | `stage.create` AND `task.create` |
| SYNTHESIZE | `task.complete` |
| ORCHESTRATE | only `agent.assign` and/or `task.update` (no stage.create, no task.complete) |
| UNKNOWN | none of the above — likely non-PIPELINE or degenerate run |

**Required step signatures** (count check — derived from `scripts/seed-protocol-prompts.ts`):

| Mode | Required calls |
|---|---|
| CREATE | `stage.create` (1) + `task.update` (1, for metadata.pipelineStageId) + `task.create` (N) + `agent.assign` (N — must equal task.create count) + `task.comment` (1, exit breadcrumb) |
| SYNTHESIZE | `artifact.create` (1+) + `task.complete` (1) + `task.comment` (1, deliverable pointer) |
| ORCHESTRATE | `task.comment` (1, exit breadcrumb) — minimal because variable shape |

**Failed calls do NOT count toward step completion** — a failed `agent.assign` is exactly what we want to detect. The 2026-04-16 incident: 2 successful assigns + 1 failed assign yields `agent.assign: 2` in the summary, mismatched against `task.create: 3`.

**Comment-content inspection (added 2026-04-25, commit `d3c309be`):**

The count check knows that a `task.comment` was made; it doesn't know what was IN it. Phase 0 production data showed only ~30% of pipeline comments matched the required breadcrumb format despite emphatic protocol wording. The validator now greps the LAST successful `task.comment`'s text for three protocol-mandated patterns:

| Pattern | Required in | Why it matters |
|---|---|---|
| Breadcrumb on first line: `**Child stage:** \`<id>\`` | CREATE / ORCHESTRATE / SYNTHESIZE | GUI Pipeline Children panel parses this string; missing → panel doesn't render |
| 📄 Final deliverable pointer | SYNTHESIZE only | Users have no unambiguous way to find THE customer-facing deliverable artifact |
| Re-run note (near-verbatim) | SYNTHESIZE only | Prevents users flipping the task back to OPEN instead of creating a fresh PIPELINE task |

Misses are pushed into `missingSteps` with a `(content)` marker (so they're distinguishable from tool-count misses) AND surfaced in the structured `commentValidation` field.

**Graceful skip**: if the comment text isn't extractable from the ToolCallEntry payload (test fixtures sometimes strip it; production records carry it), the content check is silently skipped — the count check above already covered "no comment at all."

**Output shape:**

```typescript
protocolValidation: {
  mode: 'CREATE' | 'ORCHESTRATE' | 'SYNTHESIZE' | 'UNKNOWN',
  missingSteps: string[],                    // tool-count + content misses; (content) marker distinguishes
  toolCallSummary: Record<string, number>,
  expectedChildCount?: number,                // CREATE only
  actualAssignedCount?: number,               // CREATE only
  commentValidation?: {                       // populated when last task.comment is inspectable
    inspected: true,
    lastCommentPreview?: string,              // first 200 chars for forensics
    hasBreadcrumb?: boolean,                  // CREATE/ORCHESTRATE/SYNTHESIZE
    hasDeliverablePointer?: boolean,          // SYNTHESIZE only
    hasRerunNote?: boolean,                   // SYNTHESIZE only
  }
}
```

Plus `errorCategory: 'PROTOCOL_STEP_SKIPPED'` is set only if no higher-priority category matched (BUDGET_EXHAUSTED etc. are more specific). Both `errorCategory` and `protocolValidation` can co-occur — they answer different questions.

**Test coverage:** `scripts/test-pipeline-protocol-validator.ts` — **17 tests** (12 original tool-count tests + 5 added 2026-04-25 for comment-content). Includes the artifact-synthesis incident shape as a regression test. Wired into `npm run test:all-validation`.

> ⚠️ **Updated 2026-09-27 (MI-1, `34f3bc8d`) — the "17 tests" count and the two SYNTHESIZE-only rows above are stale.**
> The suite is 55 at 2026-09-27 (quote a floor, never an exact count). The content checks changed twice:
> - **`RERUN_NOTE_RE` gained a property arm** — an explicit "cannot be re-run" (hyphen optional, `can't`/`can not`
>   too). The mechanism inventory found **28 of 46** re-run-note flags false: the protocol permits a
>   "near-verbatim" note and the regex accepted two exact phrasings. Replayed over 437 prod SYNTHESIZE comments, 0
>   regressions. A bare "fresh PIPELINE task" arm was deliberately NOT added — it also matches advice.
> - **An escalated exit (`result.escalatedExit`) is no longer asked for the deliverable pointer or the re-run note** —
>   both are FALSE on a task the protocol leaves IN_PROGRESS ("Escalate. Do NOT synthesize."). 9 escalated exits since
>   2026-09-16 had been flagged for it. The breadcrumb is still demanded, and `hasDeliverablePointer` /
>   `hasRerunNote` are still RECORDED. This **reverses the 2026-09-16 "escalated exit is NARROW" test's premise**
>   (that both checks "remain meaningful" on an escalation) — against the protocol's own text. Every
>   PROTOCOL_STEP_SKIPPED count before 2026-09-27 (e.g. "61 in 30d") is inflated by both defects.

**When extending:** if you add a new harness mode or required step, update `validatePipelineProtocolSteps` AND add a regression test. Mode detection lives in `detectHarnessMode()`; per-mode signatures in the body of `validatePipelineProtocolSteps()`. Content patterns live as module-level regex constants (`BREADCRUMB_RE`, `DELIVERABLE_POINTER_RE`, `RERUN_NOTE_RE`). **Be strict about the FACT, never about the DECORATION** (corrected 2026-09-15): `BREADCRUMB_RE` demanded `**Child stage:** \`<id>\`` and rejected a comment that literally began `Child stage: cmty0x9jo...`, emitting a false degradation into a gate input. Nothing parses these strings — the GUI Pipeline Children panel is metadata-only. A pattern that asserts markdown while appearing to assert semantics does not sharpen the signal, it manufactures noise. Loose patterns dilute; format-bound patterns misfire. Match what the step must ACHIEVE.

**Pattern:** part of the agent-output-trustworthiness defense stack (`agent-output-trustworthiness-defense-stack-pattern.md`). One signal among 7; co-occurs with cascade.

**Sentinel synergy:** the `commentValidation` field exists primarily so the future sentinel-style evaluations can distinguish "agent forgot the breadcrumb" (formatting drift, low concern) from "agent fabricated completion" (real issue). Without `commentValidation`, missing comment formatting would be invisible to forensic queries; with it, content rules become measurable instead of aspirational.

### 10. Clobber-Detection Forensic Playbook (Apr 2026)

**Use this when** a `PIPELINE_STAGE_MISMATCH` alert fires in production. The mechanism is described in §5 above; this section is operational — what to actually do when an alert lands.

**Alert surfaces** (any of these = the same underlying event):

| Surface | Where to look | Distinguishing fields |
|---------|--------------|----------------------|
| MCP boundary | HTTP 409 response | `errorCode: 'PIPELINE_STAGE_MISMATCH'` in `_meta`, also in body |
| Handler log | `mcpLogger.warn` | `securityEvent: true, errorCode: 'PIPELINE_STAGE_MISMATCH'` — emitted **before** the throw |
| Reactor skip log | `pino` (module: `ReactorSkipCounter`) | `errorCode: 'PIPELINE_STAGE_MISMATCH', reason: 'pipeline-stage-mismatch', securityEvent: true` from `logReactorMismatchSkip` |

If you see one, you don't need to confirm via the others — they're the same event surfaced through different paths.

**Triage tree** (benign vs real):

1. **Pull the alert payload** — capture `taskId` (the calling harness), `pipelineStageId` (the stage in question), and `recordedHarnessId` (whoever the back-pointer claims owns the stage).
2. **Is `recordedHarnessId === null` or missing?** → Almost always a **legacy stage** (created before the 2026-04-25 deploy). Sunset closed 2026-04-25 with UAT backfill, so post-sunset this should be impossible — if you see it, it's a back-pointer-write bug, not a clobber. Investigate `task-update-handler.ts:629-area`.
3. **Is `recordedHarnessId !== null` and `!== taskId`?** → A different harness owns the stage. **This is the real clobber case.** Continue to forensic queries.

**Forensic queries** (run via psql; `stage_activities` is the primary forensic surface added 2026-04-26).

> **Column naming reminder:** `stages` table uses camelCase (`"phaseId"`, `"updatedAt"` — quoted), but `stage_activities`, `task_activities`, and `tasks` use a mix. Activity tables (`stage_activities`, `task_activities`) are fully snake_case (`stage_id`, `user_id`, `task_id`) per their `@map` annotations. The `tasks` table is mixed: `stage_id`/`assignee_id`/`pov_id`/`created_at`/`updated_at` are snake_case (mapped); `"executionStatus"`/`"parentTaskId"` are camelCase (unmapped, need quotes). See `.claude/knowledge/domain/mcp/bug-class-registry.md` § "Naming convention reminder."

```sql
-- Q1. Current ownership state of the disputed stage
SELECT id, name, status, metadata->>'harnessTaskId' AS recorded_owner, "updatedAt"
FROM stages WHERE id = '<pipelineStageId>';

-- Q2. Full history of harnessTaskId writes to this stage (THE smoking gun query)
-- Each row = one harness claimed ownership at this time. Multiple rows from
-- different user_ids or with rapidly-changing newValue = clobber pattern.
SELECT timestamp, user_id, details->>'oldValue' AS prev_owner,
       details->>'newValue' AS new_owner
FROM stage_activities
WHERE stage_id = '<pipelineStageId>'
  AND details->>'fieldName' = 'metadata.harnessTaskId'
ORDER BY timestamp ASC;

-- Q3. Profile of each claimed harness — what was each one trying to do?
SELECT id, title, status, "executionStatus", created_at,
       metadata->>'pipelineStageId' AS claimed_stage
FROM tasks WHERE id IN ('<taskId>', '<recordedHarnessId>');

-- Q4. What did each harness's children look like? (was either pipeline real?)
SELECT t.id, t.title, t.status, t."executionStatus", t.stage_id AS in_stage,
       p.title AS pipeline_owner
FROM tasks t
JOIN tasks p ON p.id = t."parentTaskId"
WHERE p.id IN ('<taskId>', '<recordedHarnessId>')
ORDER BY p.id, t.created_at;

-- Q5. Task activity timeline for the calling harness (corroborates Q2)
SELECT timestamp, action, details->>'fieldName' AS field,
       details->>'newValue' AS new_value
FROM task_activities
WHERE task_id = '<taskId>'
ORDER BY timestamp ASC;
```

**Smoking-gun patterns:**

| Q2 result shape | Likely cause |
|-----------------|--------------|
| Single row, your taskId | False positive — investigate the alert's payload extraction |
| Two rows, different userIds, seconds apart | Two users started PIPELINE tasks against the same stage by mistake — UI/UX issue, not a security event |
| Two rows, same userId, rapid succession | Race condition between concurrent harness re-execution attempts — likely a reactor or engine bug |
| Multiple rows over hours/days, `prev_owner` chain looks consistent | Legitimate stage re-use across retries — the latest writer wins, defense fired correctly |
| Two rows, second one immediately follows by an unrelated user (e.g., via a different POV) | Cross-tenant clobber attempt — escalate as a security event |

**Resolution paths:**

- **Legitimate retry / UI confusion**: no code action; consider tightening UI affordance to prevent the double-start. The defense did its job.
- **Race condition between paths**: file a bug for the racing path. Defense holds the line; fix the upstream.
- **Cross-tenant attempt**: treat as security incident — preserve logs, query across the affected tenant, audit access.
- **Bug in the platform's own back-pointer write**: rare; check for recent changes to `task-update-handler.ts:629` block and `task-complete-handler.ts` 4th-invariant block.

**Reference**: full mechanism in §5 above; review artifacts in `cline_docs/reviews/harness-clobber-detection-2026-04-25/`. The `stage_activities` write side ships in commit `989d097e` (Apr 26 2026) — read side (REST/UI) deferred until a non-forensic consumer requests it.


## [evicted] Key Information

### My Pattern Library

- **Pattern #45** (`prompt-library-gold-standard-pattern.md`) — GS7 (Universal Agent Rules preamble) + GS8 (Template/Protocol Separation). The harness is the canonical instance of GS8 — pointer only, do not duplicate here.
- **Pattern #46** (`orchestration-reactor-pattern.md`) — both reactors the harness depends on; shape, guards, call-site audit checklist, common pitfalls.
- **Pattern #44** (`agent-template-gold-standard-pattern.md`) — template baseline the harness template conforms to (thin role + explicit capabilities/constraints).

### Critical Files

**Harness content (DB-backed, seeded):**
- `scripts/seed-harness-template.ts` — Pipeline Harness template (v3.0.0, thin — role + types + dep defaults + output rules)
- `scripts/seed-protocol-prompts.ts` — **source of truth** for three seed entries:
  - `pipeline-orchestrator-protocol` (v3.6.0 as of 2026-04-26, three-mode playbook with platform-resolved mode detection; agent-injected at execution time via `loadProtocols: true`)
  - `artifact-synthesis-protocol` (v1.1.2, synthesis ETL; domain-specific override)
  - `pipeline_harness_guide` (v2.0.0, **user-facing GUI prompt** invoked by Claude Desktop / ChatGPT MCP via `/prompt pipeline_harness_guide` — interactive walkthrough for creating and running a PIPELINE task; renderer supports `{{var}}` + single-level `{{#if}}` blocks)
  - All three share `UNIVERSAL_AGENT_RULES` preamble (the protocols do — the GUI guide does not)
- `/.claude/knowledge/domain/harness/PROMPT-PIPELINE-HARNESS-GUIDE.md` — **human-readable mirror of the GUI prompt**, NOT the source of truth. Edit the seed script, then update this doc to match. Do NOT hand-edit the GUI entry in the database.

**Reactors (infrastructure — owned by event-system-specialist):**
- `lib/services/pipelineRetriggerReactorService.ts` (463 lines, 2026-07-18)
- `lib/services/taskReadyReactorService.ts` (486 lines, 2026-07-18 — born-ready branch + shared `unsatisfiedDepExistsSql`)

**Handler invariants (server-side enforcement):**
- `lib/mcp/tasks/action/handlers/task/task-complete-handler.ts` — primary 4-point invariant inside `handleTaskComplete` (back-pointer match added 2026-04-25); grep `PIPELINE task completion invariant verified`
- `lib/mcp/tasks/action/handlers/task/task-update-handler.ts` — bypass-seal invariant on `status=COMPLETED` path inside `handleTaskUpdate`; same log string

**Engine integration:**
- `lib/services/agentExecutionEngine.ts` — PIPELINE skip + reactor fires on success; reactor fire on failure. Grep `isPipelineTask` and `maybeRetriggerPipelineHarness`
- `app/api/pov/agent/execute/stream/route.ts` — auto-assigns Pipeline Harness to PIPELINE tasks on first execute (grep `Auto-assigned Pipeline Harness template`); mirrors PIPELINE skip on success (grep `isPipelineTask`)

**Validation:**
- `/.claude/knowledge/smoke-tests/pipeline-harness-e2e-test.md` — 10-test end-to-end suite with Failure Triage table

### Common Tasks You Handle

- Diagnosing a PIPELINE task that won't progress (mode detection? reactor fire? invariant trip?)
- Reviewing proposed changes to harness template or protocol against the GS8 separation rule
- Auditing reactor call-site coverage after any change to execution lifecycle
- Validating that new PIPELINE-type rules were mirrored across both execution paths AND both handler paths
- Extending the smoke test suite when a new harness behavior ships
- Coordinating a multi-specialist change that touches the harness AND one of its neighbors (engine, reactors, protocol, handlers)
- Updating the user-facing `pipeline_harness_guide` GUI prompt when harness behavior changes — edit the `PIPELINE_HARNESS_GUIDE` constant in `scripts/seed-protocol-prompts.ts` (source of truth), re-run the seed script, then mirror the change into `/.claude/knowledge/domain/harness/PROMPT-PIPELINE-HARNESS-GUIDE.md`. Never hand-edit the DB entry.

### When to Use This Specialist

**Use me when:**
- The concern is "the harness as a whole" — cross-layer, end-to-end
- You need to decide which specialist actually owns a sub-concern
- A harness smoke-test Failure Triage row points at multiple layers
- Proposed changes might violate the template/protocol split or the three-layer defense

**Don't use me when** (hand to the right specialist directly):
- Internals of the agentic tool loop → `agent-execution-specialist`
- Authoring a new reactor or refactoring reactor guards → `event-system-specialist` (Pattern #46)
- Writing or updating the protocol's step-by-step content → `prompt-construction-specialist` (Pattern #45)
- Refactoring the harness template's role/capabilities/constraints → `template-system-specialist` (Pattern #44)
- Deep changes to task-complete or task-update handler beyond the PIPELINE invariant → `task-services-specialist`


## [evicted] Learning Notes

### 2026-04-14 — End-to-end inner loop shipped and validated

What went live that day:
- **Three-mode execution model** in the template (v3.0.0) and protocol (v3.3.0) — CREATE / ORCHESTRATE / SYNTHESIZE auto-detected from `metadata.pipelineStageId` + child-stage state
- **Two reactors deployed**: `pipelineRetriggerReactorService` (metadata-based SYNTHESIZE retrigger) and `taskReadyReactorService` (dep-free kickstart + dependent cascade, two entry points)
- **5 reactor call sites wired** across engine (success + failure), task-complete handler, task-create handler, agent-assign handler
- **Handler invariants**: 4-point PIPELINE completion check in `task-complete-handler.ts`, mirrored in `task-update-handler.ts` to seal the `status=COMPLETED` bypass path. Point 4 is the clobber-detection back-pointer match (added 2026-04-25)
- **Engine skips**: both execution paths now omit `status: COMPLETED` for PIPELINE tasks on successful-LLM-end-turn
- **stream-route `MAX_TOOL_TURNS` fix** (commit `e008aba2`) — now reads from template metadata (100) instead of hardcoded 10
- **Unique child-stage naming** (timestamped `Pipeline: X (Run YYYYMMDD-HHMM)`) to prevent collision with prior runs
- **First successful end-to-end run**: harness COMPLETED with confidence 84/100, 4 specialists executed in dependency order, all reactors fired on expected events, no manual nudges

### Hindsight lessons (per `automation-loop-closure-architecture.md` §Hindsight Lessons)

- **Grep for ALL references to any suspected resource limit.** ~8 iterations were spent diagnosing a protocol problem that was actually a hardcoded `MAX_TOOL_TURNS = 10` duplicated in the stream route.
- **Two execution paths is a class of bug.** Engine + stream route drift silently. Any PIPELINE-specific rule must be audited on both.
- **Prisma raw-SQL column naming** — unmapped fields like `agentTemplateId` are case-sensitive camelCase in Postgres and MUST be double-quoted in `$queryRaw`. A version that passed typecheck with `t.agent_template_id` blew up at runtime. Applies to both reactors.

### 2026-04-18 / 2026-04-20 — Race-fix + artifact-viewer session

Observed on the harness task `cmo10k1cp0001yxlgn6b61ll6` (Apr 16 smoke test): `agent.assign` + `agent.execute` on the same harness produced **duplicate PENDING agent_executions rows 2.3 seconds apart**, both ran concurrently in CREATE mode, both succeeded on `stage.create` via the retry-with-suffix protocol. Shipped a three-layer defense to close that class of bug, plus downstream typed-error and UI work. Additions relevant to specialist reviews:

**Structural invariants added to the harness runtime:**
- **L3 — DB-level "one active execution per task"** via a partial UNIQUE index:
  ```sql
  CREATE UNIQUE INDEX CONCURRENTLY idx_agent_executions_active_per_task
    ON agent_executions ("taskId")
    WHERE status IN ('PENDING', 'RUNNING');
  ```
  Applied via `scripts/create-agent-execution-active-unique-index.sh` (sanctioned `db push` exception — pattern `sanctioned-db-push-exception-ops-script-pattern.md`). **Pre-L3 assumptions about "duplicate active harness runs are possible" are now outdated.** Re-execution after terminal states (SUCCESS/FAILED) still works — the partial predicate excludes them.
- **L1 semantic guard** — `agent-assign-handler.ts` now skips `maybeQueueIfDepFree` when `task.type === 'PIPELINE'`. Harnesses execute ONLY via explicit `agent.execute` or `pipelineRetriggerReactorService`. The task-ready reactor was designed for specialist children; this is the previously-unstated rule made structural.
- **L1 complement — auto-promote (2026-04-28)** — same `agent-assign-handler.ts` now auto-promotes `task.type` from `ACTION` → `PIPELINE` when the assigned template's `defaultRole === 'pipeline_harness_orchestrator'`. Closes the upstream UX trap: a harness assigned to a default-typed task previously misclassified as a leaf in the artifact policy and produced `report.md` instead of `pipeline-index.json` (5 occurrences observed in prod before the fix; the cmogk5o2k Trial A run on 2026-04-27 was the most recent). Combined with the existing L1 guard, the assign handler now enforces both **type-correctness** AND **execution-path-correctness** — no caller (human or agent) can land a harness in the wrong artifact-policy branch by omitting fields. Idempotent on already-PIPELINE; logs WARN if type is exotic (DECISION/APPROVAL/etc.) without overwriting.
- **L2 runtime guard** — `taskReadyReactorService.ts` short-circuits when `task.executionStatus IN ('PENDING','RUNNING','READY')`. Closes the ms-window between `agentTaskService`'s CAS and its `agent_executions` INSERT.

**Typed errors with `.code` discriminator for GUI routing** (`lib/errors.ts`):
- `DuplicateActiveExecutionError` (carries `taskId` + `existingExecutionId`) — thrown by the central `agent-execution-create.ts` wrapper on P2002 from the L3 constraint. Reactors catch + silent no-op via `logReactorDuplicateSkip()`; direct-execute paths surface as `ApiError(DUPLICATE_RECORD)` → HTTP 409.
- `NoTemplateAssignedError` (carries `executionId` + `taskId`) — thrown at `agentExecutionEngine.ts:570` if an execution reaches prompt resolution without a resolved template. Stream-route mirror at `:420`. Priority 3 (Universal-Template fallback) was REMOVED 2026-06-10 (commit `4077c049`) after the observation window showed zero prod hits.

**Semantic distinction worth naming in reviews — "engine-level SUCCESS" ≠ "agent-reported outcome":**
- `agent_executions.status = 'SUCCESS'` means *"the LLM turn completed without exception"* — engine layer
- The artifact's `finalResponse` / `protocolValidation` / `errorCategory` fields carry the *agent's* self-assessment
- A harness execution can log `SUCCESS` while its artifact says "no pipeline state created, token budget exhausted" (observed on execution `cmo10q2fx005yyxlaojiei0in`). Children ran correctly because they only depend on the CREATE execution's output, not on subsequent harness runs' self-classification.

**Known bug class — harness mode mis-classification under budget exhaustion:**
- When the harness's tool calls all fail (e.g., token budget hit), it cannot read `task.metadata` and mis-detects its own mode, declaring "first-run attempt" even when pipeline state exists. Confusing but non-destructive (children have already run via earlier executions). Triage: look for `finalResponse` containing "first-run attempt" on tasks with pre-existing `metadata.pipelineStageId` + live child tasks.

**Retention policy** (shared `lib/services/execution-retention.ts`, Flip 2 2026-07-06):
- Two-tier, status-aware: in-tx prune-on-complete `PRUNE_ON_COMPLETE_RETENTION = 10/10` (SUCCESS/FAILED) + daily
  midnight-UTC RM sweep `RM_DAILY_RETENTION = 4/4` + age >90d. ONE shared `selectExecutionsToDelete` (both paths).
- Deletes via `rollUpAndDeleteExecutions` — an atomic `DELETE … RETURNING` that rolls token cost into
  `token_usage_daily` from the rows THIS tx removed (BC-#2 exactly-once). Artifacts cascade (`onDelete: Cascade`).
- Non-terminal rows (RUNNING/PENDING) are NEVER pruned; the keep-best inversion protects the authoritative SUCCESS.
- Normal pipeline run = 2 harness executions (CREATE + SYNTHESIZE); 10 in-tx gives margin for iterative flows.

**`pipeline-index.json` artifact structure** (the canonical harness artifact):
- Top-level keys: `taskId`, `taskTitle`, `agentRole`, `generatedAt`, `modelUsed`, `finalResponse`, `protocolValidation`, `executionDegradation`, `qualityMetrics`, `confidenceScore`, `toolLoop`, `toolCalls`, `tokensUsed`, `executionTime`, `errorCategory`, `mcpToolsProvided`, **`resolvedMode`**, **`resolvedReasonCode`** (added 2026-04-26 by `harnessModeResolver.ts` — survives budget exhaustion that blanks `protocolValidation`)
- **Mode discriminators** (read in priority order): `resolvedMode` (authoritative — pre-execution, platform-resolved) > `content.protocolValidation.mode` (LLM-detected during turn) > absent. ArtifactViewer reads `resolvedMode ?? protocolValidation.mode`
- **Deliverable Contract (2026-04-26, commit `d652a630`)**: `finalResponse` is pure LLM prose — no `## Tool Execution (Turn N)` blocks appended. Tool-call forensics are structured in `pipeline-index.json.toolCalls` exactly the same way as in non-PIPELINE `result.json`.

**Customer deliverable `report.md` (added 2026-04-28)**: PIPELINE harness root tasks now ADDITIONALLY produce a customer-facing `report.md` when the harness in CREATE mode set `metadata.deliverableSourceTaskId` (Step 5a of `pipeline-orchestrator-protocol` v3.7.0). The engine extracts the source task's `result.json.finalResponse` (typically the Editor's article in synthesis pipelines) and writes it as the harness's `report.md` at SYNTHESIZE-commit time. Companion field `metadata.suppressDefaultReportMd: true` set by the harness on the leaf disables the leaf's default report.md (Reviewer leaves carry only result.json with the QA review). On extraction failure, the engine produces an error-header `report.md` (fail-loud) plus structured pino warn/error logs — never silently degrades to coordination-prose content. The `result.json.reportMdSource` field (`{mode, sourceTaskId?, extractFailureReason?}`) is the queryable provenance signal. Pre-existing pipelines (no metadata) work unchanged — the harness still produces only `pipeline-index.json`. See `cline_docs/reviews/report-md-policy-rework-2026-04-28/` for the architecture; the engine extraction is at `lib/services/agentExecutionEngine.ts` (success-path transaction) mirrored at `app/api/pov/agent/execute/stream/route.ts`.
- **`protocolValidation` absent on budget-exhausted runs** — graceful-omit semantics apply. `resolvedMode` is the survival signal here: it's written before the LLM turn so a budget-exhausted run still tells you what mode it was *supposed* to run in

**`task.outputArtifacts` denormalization semantics:**
- Holds ONLY the LATEST execution's artifact summaries (id + name + type + createdAt; no content)
- On a racy or retry-heavy history, "latest" can be a misleading degraded run
- Source of truth for full artifact history is `agent_artifacts` joined to `agent_executions` by taskId
- As of 2026-04-20, `ArtifactViewer.tsx` fetches across ALL executions (Option B) — any review that previously assumed single-execution artifact scope should re-check against the new flow

**Reactor-skip distinguishability (`reactorSource` field on `logReactorDuplicateSkip`):**
- `'task-ready-depfree'` — `maybeQueueIfDepFree` firing after agent.assign / task.create
- `'task-ready-depcompletion'` — `maybeQueueReadyDependents` firing after a child completes
- `'pipeline-retrigger'` — `pipelineRetriggerReactorService` firing SYNTHESIZE on harness retrigger
- Three reactor paths → three grepable signatures. Harness-retrigger races diagnose different bugs than task-ready races


## [evicted] Related Specialists

The harness spans four other specialists' domains. Division of concerns:

| Specialist | Owns | Harness touch-point |
|------|------|------|
| `agent-execution-specialist` | Agent execution engine internals, streaming route, agentic tool loop, the two-path hazard callout | PIPELINE auto-complete skip, reactor hook sites in engine paths, `maxToolTurns` reading |
| `event-system-specialist` | Reactor pattern (Pattern #46), PostgreSQL NOTIFY/LISTEN, connection pooling, event-driven architecture | Authoritative for `pipelineRetriggerReactorService` + `taskReadyReactorService` as reactor instances |
| `prompt-construction-specialist` | Protocol authoring (Pattern #45 GS1-GS7), `UNIVERSAL_AGENT_RULES`, Handlebars safety, protocol vs interactive vs workflow typing | Authoritative for `pipeline-orchestrator-protocol` content (not structure — structure is GS8) |
| `template-system-specialist` | Template authoring (Pattern #44), `agentTemplate` table, capabilities/constraints authoring | Authoritative for Pipeline Harness template role text, capabilities, constraints |
| `task-services-specialist` | Triple-layer task architecture, MCP task handlers generally | Authoritative for task-complete / task-update handler internals beyond the PIPELINE invariant |

**Handover shape:** when a finding touches one of these specialists' authoritative areas, hand the piece there; keep the coordinating view here. The harness only works when all five layers stay in lock-step.




---

## Evicted 2026-09-19 (Protocol 12, trigger-bound rule) — program-tier shipping history

*Moved from `.claude/agents/pipeline-harness-specialist.md`. The config keeps the TRIGGERS (what to do,
at what moment); this is the reasoning and the incident record behind them.*

- **T4-hardening findings shipped (2026-07-15)**: F11 double-nest (router hoist), F12 structural
  loud-fail (prepare-task-for-execution, keyed on the parent title token `(protocol: pov-program`, NOT
  template metadata — program reuses the generic Pipeline Harness template), F14 above. Protocol at
  v1.0.5. F13 open (contract-missing loud-fail is log-only, not surfaced as task status/comment).
- **Non-terminal-family + truncation (2026-07-16, F16-F21 + R1-R5)**: a program leg that ends
  settled-but-not-COMPLETED HANGS the program (Guard-4 never satisfied). All classes are terminalized
  at the leg's persist tx (event-anchored, no timer): F16 can-never-run, F17 duplicate-halt, F20
  escalated-as-outcome, **R4 truncation-stall** (a SYNTHESIZE that persists `TRUNCATED_NO_OUTPUT` +
  IN_PROGRESS — the FOURTH member, "settled-children, harness-mute"). R4 also adds an in-loop
  retry-with-headroom (Layer 1) so a truncated SYNTHESIZE usually reaches `task.complete` and the stall
  never forms; F20-escalated-COMPLETED WINS over truncation-FAILED in the persist ordering. Forward cone
  = shared `mark-forward-cone.ts`; F17 duplicate-halt cone-gap folded in. Root cause: Sonnet-5 adaptive
  thinking exhausting `max_tokens` (STANDARD_AGENT_LIMIT 8000→24000). R5: `fetch(id:...)` is NOT an agent
  tool — dependency outputs arrive via §6 Pipeline Context.
  `cline_docs/reviews/{nonterminal-family,truncation-stall,truncation-r4}-2026-07-16/`.
- **2026-07-18 batch (runs 8-11; ratified invariant: non-terminal = waiting-for-a-human, always)**:
  (0) ⚠️ **SIX members — a 7th (`harnessSynthesizeUnclosed`) shipped 2026-09-15 and was REVERTED
  2026-09-16.** Corpus: 33 matches, **0 genuine hangs** — all protocol-SANCTIONED exits (base protocol
  says an escalating harness leaves IN_PROGRESS and exits; the 50-69 band re-executes a child and
  exits awaiting retrigger). **Do not re-propose without a NEW live hang.** Standing lesson: before any
  harness-layer rule, state what it does to PLAN-SPAWN **and to every sanctioned exit** — "it armed a
  future event rather than creating one" is the shape that defeats tool-call predicates (`task.create`
  for spawn, `agent.execute` for re-run-and-wait). Check-design lessons:
  `pipelines/CHECK-DESIGN-DISCIPLINE.md` §5b-5d. OPEN POLICY CONFLICT (mine): base protocol says
  escalated ⇒ leave IN_PROGRESS; four domain protocols say `task.complete` on EVERY outcome.
  (1) **PRE_FLIGHT_BAIL — SIXTH family member**: a leg that bails in its own pre-flight (stamps
  `metadata.cannotRun` — MANDATED on every bail, orchestrator 3.9.1 — and/or `escalated` with no
  child stage) is terminalized FAILED in `runTerminalSuccessTx` (race-free vs the SUCCESS write;
  F20-escalated-COMPLETED still wins); cone reason is now FOUR-way (+`UPSTREAM_PRE_FLIGHT_BAIL`);
  a `task.update` belt hook (`handleAgentStampedCannotRun`, allowFlipFromSuccess) covers at-rest
  stamps. Live-proven on run 9 (machine-driven escalation, transitive root attribution — pov-program
  1.0.12 step-1 follows `failedDependencyTaskId` to the first non-casualty). (2) **Confidence OUT of
  gate semantics at every tier** (calibration study: approved/NN carries verdict direction, not
  correctness) — programReleasable gates on outcomes + `derivationContainment` facts (surfaced via
  the agent.results card's `**Facts:**` line) + Node C + coverage; derivation-existence is checked
  BEFORE the harvest anchor (finding f).
  ⚠️ **The reason taxonomy is MECHANISED and is NOT yours to re-derive.** `no-derived-values-block`,
  `harvest-block-missing-or-unparseable` and the rest are computed into
  `derivationContainment.containmentDisposition` `{blocking | benign | needs-node-c, reason, inputs}`
  — **owned by `execution-facts-specialist` since 2026-09-11**; depth:
  `.claude/knowledge/domain/execution-facts/execution-facts-library.md` §2. READ THE STAMP: if a
  prose reading contradicts it, that is a DEFECT to report, not a judgement to exercise. Absence
  fails closed (`ABSENT ⇒ treat as blocking`). When a fact seems ignored at the gate, suspect the
  render seam first and hand it to the child — two live 2026-08-03 gate defects were exactly that.
  Green pass = run 11 / VT-10. (3) **Gaps (e)+(b) FIXED same day (second session)**: born-ready tasks
  queue via the shared `unsatisfiedDepExistsSql` predicate at create/assign/update (PIPELINE-with-deps
  keeps the blanket skip — CC6; update door carries a FAILED frozen-cone guard); superseded-probe
  disposal = pov-program 1.0.13 supersession contract (cannotRun state channel → FIX-A terminalization,
  supersede-before-wiring). (4) **A6 no-reviewer approved rule** (orchestrator 3.9.2 + HOWTO 2.4.5):
  fact-derived approval + `reviewerPresent` provenance + roster-defect/misroute guards; T6 narrowed to
  "when a reviewer exists". `cline_docs/reviews/{confidence-gate-demotion,reactor-cascade-audit,born-ready-gap-e}-2026-07-18/`.


---

## Evicted 2026-09-19 — contract inheritance / IGP-T1 R12 narrative

*Config keeps the do-not-re-propose triggers and the open successor problem; this is the record.*

## 🆕 2026-08-26 — contract inheritance SHIPPED and LIVE-PROVEN (IGP-T1 R12); the successor problem named

**The defect:** the interface contract was delivered to a LEG and never to the leg's children.
Measured across every archived leg that carried one: **7 of 7 lossy, 0 of N children ever holding
it.** So a reviewer instructed to "check transcription mechanically, token by token" held only a
paraphrase missing 9 of 10 canonical lines — an **UNSATISFIABLE PREDICATE**, and it could only accept
the package's word. Fixed: `inheritInterfaceContractIfAbsent` (write-if-absent from the qualified
owning leg, sanitized, 64 KB cap, atomic conditional write) at `prepare-task-for-execution.ts`;
orchestrator base **v3.13.0** (no-restate); network-provisioning **v1.6.0** (both clauses now name
the `## Program Interface Contract` block as the source and define absent-block behaviour).

**R12 result — four legs applied VERBATIM to live cEOS: 0 config-syntax defects, 0 device
rejections, 4/4 children holding the contract on every leg** (R11: 0/4, 2 canonical lines omitted).

🔴 **DELIVERY ALONE FIXED TRANSCRIPTION. Do not re-propose a deterministic config renderer or a
`canonicalStanza`-as-array schema** — both were proposed mid-arc and dropped as premature, on the
grounds that no author had ever failed while HOLDING the complete exemplar. R12 vindicates dropping
them. Re-propose only on a NEW live failure where the author held the complete stanza.

**THE SUCCESSOR PROBLEM (open, no design yet):** the author can predict what it **CONFIGURES** but
not what the device **DISPLAYS** — its harvest shows pre-change rendering only and it never sees the
device's reply to its own config. Four R12 instances: System Id renders as hostname; `distance 90`
renders as two per-level lines; a template omitted EOS's real `Instance`/`VRF` columns; a parity
table equated OSPF *path cost* with IS-IS *interface metric*. ⚠️ Not cosmetic — the fourth propagated
a wrong number into a **blocking** defect. **Letting the author validate against the device
(`configure session` + abort) is RULED OUT — read-only stays (Steve, 2026-08-26). Do not re-propose.**

**Three things R12 proved about our own guards, all worth carrying:**
- **Two of the three are dialect-lint findings** (the FALSE BLOCK on a removal leg — it has no
  notion of leg intent, and the prose reviewer got it right where the mechanical check got it
  wrong; and the PRESENCE half's by-construction unreliability across rounds). **Owned by
  `execution-facts-specialist` since 2026-09-11**; depth:
  `.claude/knowledge/domain/execution-facts/execution-facts-library.md` §3. Carry the consumption
  lesson: "mechanical beats prose" is a prior in this domain, not a law.
- **Node C has NO contract.** Inheritance walks child → owning LEG; Node C's parent is the program
  root, which never holds one (the Architect *creates* it). It reported the absence and graded
  ACCEPTED-FROM-CLAIMS exactly as v1.6.0 prescribes — the clause working, and revealing the next gap.

**And our own prose did not bind:** v3.13.0's no-restate rule was ignored (the brief carried all 10
lines anyway). Mechanical delivery is what worked.

Open items, all earned live: `cline_docs/follow-ups/igp-t1-r12-followups-2026-08-26.md`
(incl. packages not mandating PERSISTENCE — R12's migration was running-config only and a reboot
would revert all four legs; left unrepaired so the package defect stays visible).

---

## Duplicate-check clearance — the operator technique (2026-09-24, live-validated twice)

The pipeline and program harnesses both halt on a **duplicate stage for the same objective in the same
phase**, and a human releases them through TASK STATE (a comment reply never clears it). Two forms are
accepted by the protocol: `metadata.duplicateAcknowledged` (**canonical**) or a trailing
`PRE-FLIGHT CLEARANCE:` block in the task description (the human-readable backup). The check resolves
**only if the clearance names the duplicate the harness actually detected** — an unbound clearance is
stale and does not clear.

**The technique, in order:**

1. **Prefer the metadata form, and on a customer-facing POV use nothing else.** The description is the
   only channel that reaches every child brief verbatim, and it is what a customer reads — a clearance
   block puts run history into both. The metadata form reaches the harness and nothing else.
2. **Name the stage the harness DETECTS, which is the `Pipeline: …` child stage** created by the prior
   run's CREATE — not the parent stage the prior task sits in. Evidence: Revision 2's pre-flight comment,
   *"duplicate stage `cmuepqcp9000vyx2bf11u8k7i` ("Pipeline: Telemetry Export Requirements Authoring …")
   found … metadata.duplicateAcknowledged matches this exact stage id — clearance resolved"*. Find it from
   the prior task: `tasks.metadata->>'pipelineStageId'`.
3. **With MORE THAN ONE prior run, use an ARRAY of every prior pipeline stage id.** The harness reports
   every duplicate it finds and binds the clearance to each; a single id is then guaranteed to leave one
   unmatched and halt. Live 2026-09-24 (Revision 3): *"duplicate pipelines found in this phase (Revision 1
   stage …, Revision 2 stage …). My task metadata carries `duplicateAcknowledged: [...]`, matching both
   detected duplicates exactly — clearance is bound and resolved."*
   ⚠️ **The list is now DOCUMENTED (orchestrator 3.15.1, pov-program 1.8.2, HOWTO 2.6.3 — 2026-09-24),
   but the match is still made by the model reading its own metadata, not by platform code.** The
   harness accepted the list live before the text allowed it (n=1); the text was then aligned to it. **No platform code matches it**: the only code read is `agent-status-handler.ts:141`
   (`resolved: tMeta.duplicateAcknowledged != null`, a status-report flag); `protected-task-metadata.ts`
   marks the key human-written; everything else is the model. If a harness ever rejects the array, it halts BEFORE creating anything and
   names the stage it wanted — one `task.update` recovers.
4. **A re-run needs a NEW stage when the title is unchanged.** `task.create` deduplicates by title within
   a stage: it silently returns the existing task (it did — the prior COMPLETED task came back, unmodified).
   Create a fresh stage, then the task in it.
5. **Verify persistence, then read the resolution.** `task.update` reporting success does not prove the
   field survived the MCP parameter layers — read `metadata->'duplicateAcknowledged'` and its
   `jsonb_typeof` from the row (an array must come back `array`). After CREATE, the harness's mode comment
   states whether and how it resolved the clearance — read it before assuming the run is past pre-flight.

**Program legs are a separate case** (agent file § "Program re-run duplicate-halt"): a program leg's
duplicate-halt is TERMINAL with a frozen forward cone, so the clearance must be PRE-ARMED on each pipeline
child in the PLAN-SPAWN → gate-approval window, and a halted leg needs a fresh task.


## Evicted 2026-09-27 (Protocol 12, X14 — specialist was 556 lines)

Moved verbatim from `.claude/agents/pipeline-harness-specialist.md`; the agent keeps a compressed live-invariant line and a pointer here.

### Retry-band keep-best Phase 1 (2026-07-04)

- **Retry-band keep-best (Phase 1 SHIPPED `d2544f5a`)**: the orchestrator's 50-69 retry re-executes on BYTE-IDENTICAL inputs (F1 — the diagnostic comment never reaches the child prompt; retries are blind re-rolls), so a retry can REGRESS. FIX: a stamped retry that catastrophically degrades vs its target self-supersedes at terminal persist; every authoritative consumer (chainer/report-md/policy) now filters via the shared selectAuthoritativeExecution. The BAND SURVIVES ON PROBATION — its text was corrected (stop implying feedback reaches the retry, seed-protocol-prompts.ts orchestrator protocol, the ONE canonical policy domain protocols inherit) but the narrow-or-drop verdict is Phase 3, earned from suppression-log instrumentation. Phase 3 also wires F1 (real feedback into the child) — yours. Design you led: `cline_docs/reviews/retry-band-keep-best-2026-07-04/`.

  *(Annotation 2026-09-27, not part of the evicted text: "Phase 3 also wires F1" did not happen. The findings-carrying
  retry became RWF; Stage 1 shipped the prerequisites, Stage 3 — the retry itself — was STOPPED on the Stage 2
  numbers. The band remains a blind re-roll, now capped by Wave C. See § "2026-09-27" below.)*

### Reading a CHILD's deliverable body — F14 history (2026-07-15 → 07-23)

- **Reading a CHILD's deliverable body (F14 gotcha, T4b live 2026-07-15; retrieval verb corrected
  2026-07-23, v1.0.14)**: a parent harness reading its child's plan/report (e.g. PLAN-SPAWN reading the
  Architect's plan) must **actively retrieve the artifact BODY** — the child is a CHILD, not a §6
  dependency, so its output is NOT auto-chained. The route is `perform(action:"agent.results",
  taskId:"<child id>", verbose:true, limit:1)` — `verbose:true` is load-bearing (without it the 3KB
  dispatch cap returns a lean card whose only body pointers are CLIENT-only `fetch(id:)` hints, a dead
  end for the engine; the live cmrvlnn2… PLAN-SPAWN failure). `task.context` returns only the POINTER
  (metadata + comments — the completion comment's `report.md → fetch(id:)` line is for HUMANS in Desktop).
  A harness that stops at task.context expecting the body inline finds the contract absent and stalls
  (T4b; v1.0.5 fixed the diagnosis but prescribed the client-only `fetch` verb — every PLAN-SPAWN
  1.0.5→1.0.13 paid a failed-fetch turn recovered by LLM improvisation; 4-panel review
  `plan-spawn-fetch-and-start-semantics-2026-07-23/`). The same rule applies to ANY
  parent-reads-child-artifact path.
  ⚠ **Load-bearing precondition (softened by the v1.0.14 route)**: the Architect HAS a `report.md` only
  because it runs during PLAN with ZERO dependents (the plan-gate is created later, in PLAN-SPAWN) —
  `report.md` is gated to leaf (zero-dependent) non-PIPELINE tasks. The `agent.results` envelope carries
  ALL artifacts (result.json first, report.md second — insertion order, `execution-terminal-persist.ts`),
  so if the choreography ever collapses CREATE into one execution (no report.md), the same call still
  serves the plan via `result.json.finalResponse` — the fallback is now in-envelope, not a different read.

### Mechanics surfaced by the k8s design review (2026-06-27) — full text

**Mechanics surfaced by the k8s design review (2026-06-27; depth in `cline_docs/reviews/kubernetes-gitops-design-2026-06-27/`):**
- **Three caps, distinct:** 8 KB Tier-1 per-tool-result (`agentic-tool-loop.ts:298` `MAX_TOOL_RESULT_LENGTH`, `truncateForLlm` `:307`) **binds harvest
  strategy** (broad reads clip before the LLM sees them → mandate many narrow reads — and since 2026-07-08 the
  runtime AUTO-NUDGES: the truncation marker directs a narrower re-read, **offers a `read_more(ref, offset)` continuation** to page the SAME result's tail when no narrower form exists (Phase 1 SHIPPED 2026-07-10 `3264e28f` — memory-backed loop pager `:399 READ_MORE_FUNCTION_DEF`, injected into `mcpFunctions`, NOT a registered/6-consolidated tool; verified live exec `cmrdz81ll`, forensics §7c), or flag-the-gap; the record
  carries `resultTruncatedForLlm`/`resultChars` for the operator grep; SoT: `/.claude/knowledge/domain/harness/harvest-truncation-safety.md` §1/§3/§6 — §3 incl. the one-TARGET-per-read rule, 2026-07-08); 128 KB/512 KB §6
  chain (`context-chainer.ts:30-31`); 50 KB persist (only the `agent.results(verbose)` anti-pattern).
  - **Authoring a new protocol:** the `read_more` pointer lives in `UNIVERSAL_AGENT_RULES` (prepended to every protocol at seed time), so a new protocol INHERITS it — don't duplicate it in the body. For a protocol with a device-harvest / scoped-read section, DO add the domain-specific "no-narrower-form → `read_more`" pointer (as `network-provisioning-protocol` v1.1.2 does for the no-getter case, e.g. run-3's `spanning-tree`). Keep the fact-not-imperative framing (Protocol 10): "cheaper *when* a narrower form exists," never a blanket "prefer scoping" (right for config reads, wrong for holistic list reads — see forensics §7c).
- **Teardown-on-escalation (F, 2026-07-08):** a quality-gate escalation (child < 50 → harness escalates instead
  of approving) previously exited WITHOUT the self-provision teardown — a live multicast-VLAN run orphaned its
  `ceos-lab-readonly` registration. Fixed in the seeded prose (network v1.1.1 / k8s v1.0.1 / terraform v1.0.1
  step-5 + SYNTHESIZE sections + the harness guide): teardown runs on approval AND escalation — "escalation skips
  the APPROVAL, never the cleanup". When auditing an escalated run, CHECK the registry for the dangling row.
- **Embedded-envelope bloat (E) — SHIPPED + LIVE-VERIFIED 2026-07-08 (`803ec916`):** `embedded-server.ts` used to
  decorate every agent tool result with a schema-echo ≈ a second copy of the data (45–49% of every services
  response; why Test B's scoped reads all crossed Tier-1). Now leaned producer-side (all three branches, −746
  lines); verified live: truncations 10/14→2/13, specialists −40% input. Guard: `test:embedded-envelope`.
  Bundle: `cline_docs/reviews/services-envelope-bloat-2026-07-08/`. Prompt caching (G, `dc5645d5`) then took
  family uncached input 2.16M→114 tokens (−78% input cost) — run economics changed materially 2026-07-08.
- **ROLE_GUIDANCE_LIBRARY reality:** trace every reuse to the role's *actual text*, not a "neutral"
  claim. **BOTH `change_reviewer` AND `config_change_author` are SHARED KEYS — each ships to FOUR
  templates across network / terraform / k8s / observability** (`Config Change-Package Author` +
  `HCL Rollback Author` + `Manifest Rollback Author` + the observability author; `Change Reviewer` +
  `Plan Policy Reviewer` + `GitOps Change Reviewer` + `Observability Change Reviewer`),
  ⚠️ this file said THREE until 2026-09-14 — observability shipped 2026-09-10 and the stale count was
  repeated twice in one session before a panel lens caught it. Re-verify with
  `grep -rn "defaultRole: '<role>'" scripts/seed-*.ts` rather than trusting the list,
  so **every edit to either is a FOUR-domain edit**. That is real leverage — the 2026-08-25
  satisfiability rule was earned by an IS-IS migration and now guards HCL and manifests — and a real
  hazard: both entries have carried network-isms, and the satisfiability rule itself was authored with
  a routing-only example that meant nothing to an HCL author (caught in review, 2026-08-25). State the
  property abstractly; example per-domain or none. The keys now carry that warning in-file at the edit
  site. Confirm blast radius with `npm run report:template-freshness` (all three rows of a key go STALE
  together); deliver with the TARGETED reseed, never the full seed. The original network harvester had
  **no key** (generic fallback) — network now repoints onto `infra_state_harvester` (2026-07-01). A §6-PRODUCING **tool-using** harvester role draws on **BOTH** bases:
  `artifact_harvester` (§6-producing + escalate-don't-fabricate) **AND** `synthesis_source_acquirer`
  (the iterative scoped `services.call` loop + succeed-with-partial + `## Acquisition Summary` — the
  **tool-loop discipline lives in the acquirer**, NOT artifact_harvester). In-place neutralization of a
  shipped role is gated by a **dry-run of its live pipeline**, not string tests.
- **services-gateway R9 invariant** (convention, not runtime-enforced): a connected service reached as a
  bespoke tool bypasses R9 (site A gates on `toolCall.name==='services'`) — a design-review gate.
- **Expected-denial channel — `isError` vs throw (NOT "denials degrade").** A verb-enum/RBAC denial
  returned as an MCP `isError:true` tool-result is recorded `success:true` **by construction** (mcpService
  RETURNS isError; the loop sets success on the normal path), so a confined harvest **does not self-degrade**
  (#89/executionDegradation key off `!success`). Only a genuine **throw** → `success:false` → degrades. So the
  fix is a **contract** (the service returns isError, not a throw), not engine calibration. Pinned:
  `test-security-invariants.ts` §L. And **"build CI for the customer's half" is a WS3-category smell** —
  test our half, spec + self-cert theirs.

### Canonical Artifact Builder for Trust Signals (May 2026) — SUPERSEDED: since execution-path convergence `buildExecutionResultJson` has ONE caller (`execution-core.ts`), so the two-path/stream-not-passing claim below no longer holds (verified 2026-09-27)

### Canonical Artifact Builder for Trust Signals (May 2026)

`result.json` / `pipeline-index.json` artifact construction was extracted
to `lib/services/execution-artifacts.ts:buildExecutionResultJson` in
commit `e480a5c0`. Both execution paths call it.

Trust-signal fields the harness LLM relies on (`resolvedMode`,
`resolvedReasonCode`, `protocolValidation`, `executionDegradation`,
`templateScopeMismatch`, `confidenceCapped`+`originalConfidence`) flow
through the helper's conditional-emission logic. When investigating
"why didn't the harness see signal X on a stream-launched child?" —
check whether stream is passing the input. The 2026-05-14 audit found
stream wasn't passing `confidenceCapped`/`originalConfidence` because
it doesn't implement the cap logic yet (followup B in
`cline_docs/types-cleanup-followups-2026-05-13.md`).


## 2026-09-27 — what a harness can and cannot do to its children (the agent-run config-guard family), and the day's other shipped mechanics

Protocol 11 self-update; every claim grep-confirmed against the tree on 2026-09-27. Greps with expectations: paired
discovery § "2026-09-27". Register rows: RWF, RWF-X (X11, X15–X21), MI-13, EG-1/EG-2, EF-DL1/EF-DL2
(`cline_docs/follow-ups/OPEN-REGISTER-2026-09-23.md`).

### The config-guard family — one module, `lib/services/leg-child-override.ts`

A **pipeline child** (`isLegChild`) = its stage's `metadata.harnessTaskId` is a string, OR a PIPELINE task claims the
stage via `metadata.pipelineStageId` (reuses `harnessOwnedTaskIds` — literal `type='PIPELINE'`, index-backed). That
covers a harness's children, a program's legs and Node C. No query runs unless a disallowed key is present.

| Guard | Commit | Door | Refuses | Caller scope | Code |
|---|---|---|---|---|---|
| **D1** | `3090ed42` | `agent.execute` `overrideConfig` (`agent-execute-handler.ts`) | any key but `modelParameters`, and any `modelParameters` key outside `MODEL_PARAMETER_KEYS`; `prompt` (replaces the directive), `inputContext` incl. `{}` (suppresses re-chaining AND skips the interface-contract guard), `agentRole` (changes the key the verdict parser reads), `maxRetries`/`timeout` | **everyone** — the hazard belongs to the task | `LEG_CHILD_OVERRIDE_REFUSED` |
| **X18** | `465d63a7` | same | `modelParameters.model` and `.provider` (either selects the model) | everyone | same |
| **X15** | `ba188432` | every execution-config build | `EXECUTION_IDENTITY_KEYS` = `agentRole`, `prompt`, `inputContext`, `priority` — STRIPPED from `modelParameters` (presence-based, so `null` too) at all three merge sites: `agentTaskService`, `agentExecutionConfigBuilder` (how pipeline children run), `resolveExecutionModelParams` (the frozen snapshot); both model-parameter schemas also reject them early | **every task**, not only children | warn `MODEL_PARAMETERS_IDENTITY_KEY_STRIPPED` |
| **X16** | `ba188432` | MCP `agent.execute` `overrideConfig` | untyped values: `maxRetries` int 0..10, `timeout` int 1000..`MAX_TASK_TIMEOUT_MS` (3,600,000 ms), and `prompt`/`agentRole`/`inputContext`/`mcp*` typed by the SAME object the REST route uses (`AGENT_EXECUTE_OVERRIDE_FIELDS`); the nested `modelParameters.timeout/maxRetries` bypass closed | everyone | validation error |
| **X17** | `3a5d2b6a` | `agent.configure` (`agent-configure-handler.ts`) | any call on a pipeline child from inside an agent run — after the access check, before any template lookup or write | **agent runs only** (`routeOpts.callingExecutionId`) | `LEG_CHILD_CONFIGURE_REFUSED` |
| **X21** | `26a7ad05` | `task.create` / `task.update` (`tasks-action-router.ts`, after validation, before any handler) | `modelParameters` anywhere — top level, `metadata`, a JSON-string `metadata`, nested updates | **agent runs only**; on ANY task | `AGENT_MODEL_PARAMETERS_REFUSED` |

All three codes map to **400** (`lib/errors.ts` — an unmapped code defaults to 500, the D1 review's F5).

**So, today — a harness CAN:** create children, `agent.assign` their templates (the sanctioned verb), execute a child
with known model-tuning keys, re-execute a child within the Wave C cap, comment, and complete its own task.
**It CANNOT:** change a child's prompt, role, inputContext, model or provider — per run (D1/X18), persistently via
`agent.configure` (X17), or by pinning `modelParameters` on any task (X21); nor can any `modelParameters` object
anywhere carry an identity key (X15).

**Why each was built, measured first:**
- **X18 (Steve, option B):** the judged party choosing its judge's model was the one self-interested lever D1 left
  open — a harness re-running its own reviewer on a weaker model. Option C (harness-only) was rejected to keep the
  rule caller-independent. The model is set on the task or template instead — a visible, persistent, human act.
- **X17:** 816 harness runs in 90 days set `prompt`/`agentRole` on a child **zero** times; they called `agent.configure`
  twice (2026-08-27), both template-only — and `agent.configure` with no prompt **synthesises one**, so both calls
  silently replaced the child's prompt. A human configuring a child is not refused.
- **X21 (seed-is-truth, Steve 2026-09-27):** 59 tasks carry their own prompt (51 synthesised by configure saves) and
  50 pin a model (0 matching their template); both outrank the template at run time, so **a reseed never reached
  them**. `report:template-freshness` now prints a "tasks overriding their template" FACT section (exit code
  unchanged). 0 of 1,445 agent `task.update` calls in 90 days set `modelParameters`. `agent.configure` stays on MCP by
  decision.
- **X15:** sec-ops' suggested fixes (spread known keys only / move the spread) would have broken the template path,
  which puts `systemPrompt`, `useSystemPrompt`, `maxRetries` and `timeout` into `modelParameters` on purpose — hence
  a strip of four named keys, not an allowlist. Prod: 0 tasks / templates / 60-day executions carried any of them.

⚠️ **The agent-only guards key on `routeOpts.callingExecutionId`, which ONLY the tool loop threads.** A new
agent-reachable entry path that does not pass `routeOpts` exempts itself silently (the router threading is pinned by
`test:agent-configure-leg-child`). REST and stream routes are human-only, which is why they are out of scope.

### Adjacent RWF-X fixes the harness depends on

- **X19 `d0fb4e4f` — an execution config's `timeout` is SECONDS.** 994 of 994 prod executions (30 days) recorded
  300–900: the template's seconds always won the merge over the task column's milliseconds. `tasks.timeout` and
  `overrideConfig.timeout` (ms by contract) now convert through ONE helper, `msToExecutionTimeoutSeconds`
  (`template-model-params.ts`), at both builders and the engine default; a sub-1000 ms value is treated as absent. An
  explicit per-run override now wins over the template. Nothing reads `config.timeout` yet — the unit is fixed before
  anything does.
- **X20 `9c037761` — `overrideConfig.mcpToolId`/`mcpWorkflowId`: NO ownership check, deliberately.** Nothing
  dereferences them (tool selection is `config.mcpTools`, by name); 0 of 2,132 executions and 0 tasks carry either.
  The trigger is written AT the field (`task-validation.ts`): any code that starts resolving them ships the
  caller-may-use check.
- **X11 `7d81b2b9` — surrogate-safe cuts, well-formed JSON persist.** A 197-unit description cut through an emoji's
  surrogate pair put a lone `\ud83d` into a `task.list` tool result, which persisted into a `pipeline-index.json` as
  invalid jsonb — **any query casting the table threw**. `lib/utils/surrogate-safe.js` (`sliceSurrogateSafe`,
  `stringifyWellFormed`) now backs the cut sites, and the terminal persist serialises the JSON artifact and
  `error.json` well-formed (U+FFFD, count logged; byte-identical on well-formed input, key order preserved). Rows
  persisted BEFORE the fix can still carry the escape — the mechanism inventory filters them before its `::jsonb`
  cast and counts them.

### RWF Stage 2 measured → Stage 3 STOPPED (Steve, 2026-09-27)

`cline_docs/reviews/rwf-stage2-2026-09-27/RESULTS.md` (`c0cb13d3`, read-only, window 2026-09-10 → 09-27):
- **M1** strict reach of the proposed findings-carrying retry (clause-(f)-class only): **2 of 38 infra NEEDS-REVISION
  verdicts (5%)**; 24% on the broad reading. The largest non-eligible group is **U** — legs with nothing to review
  because the harvest service was unreachable.
- **M2** Alternative B (strip the design's containment conclusion before the Author sees it): the conclusion is SPREAD
  across 2–7 headed sections in 11 of 12 Architect outputs ⇒ not delimitable ⇒ **dropped**.
- **M3** of 16 non-releasable programs, **0** were sunk by write-up legs alone (the synthesis predicted ≈34% from an
  independence assumption).
- **M4** one failed pipeline-child execution in 18 days (a deploy reload) ⇒ **no X12 "re-run a FAILED child" verb**.

**Decision:** Stage 3 not built, the tag-grammar soak not built, Alternative B dropped, no X12 verb. **Re-open only on
NEW evidence on a fresh window:** strict (clause-(f)-only) reach ≥ 10% of infra NR verdicts, OR ≥ 1 program
non-releasable solely through write-up legs. Recurring classes route to source fixes instead (U harvest availability ·
N quotable validation commands · E/P evidence + provenance · GS-R5-M14 pt 3). **Consequence for this specialist:** the
50–69 retry stays a blind re-roll; Stage 1 (the chokepoint cap, keep-best like-with-like, verdict freshness, the D
guards) is the shipped state and is what to reason from.

### MI-13 — the mechanism inventory, now a quarterly script

`scripts/report-mechanism-inventory.sh` (read-only against prod, ~30s; CLAUDE.md health-run item). Baseline 2026-09-27
(`cline_docs/reviews/mechanism-inventory-2026-09-16/INVENTORY.md`): 38 alive · 14 dormant (trigger recomputed, absent) ·
1 partially blind · 5 unmeasurable. Every 🔴 line is 0 by construction; each ⚪ is its control. Findings, all mine:
- **MI-1 `34f3bc8d`** — the partially-blind one: the re-run-note validator (see § 9's 2026-09-27 note).
- **MI-2 `66a0f8d2`** — two drifted documented greps in the paired discovery (Wave C moved the `chainedPredecessors`
  assignment; the `harnessTaskId` reader count rose). Audit 257/0/0 at the time.
- **MI-3 `ab760ea2`** — the "stuck leg" was **Steve's preserved test fixture**: program root
  `cmu0x9d1m000kyx0dloebjb3u`, the only specimen of the SYNTHESIZE dead-end class
  (`cline_docs/reviews/synthesize-empty-turn-hang-2026-09-14/`). `runDisposition` gained **`preserved`** (closed set
  `abandoned | superseded | preserved`, still fails closed on any coined state) — `abandoned` was the dangerous lie, it
  invites the next tidy-up to re-run it. `report:run-liveness` has its own `preserved (deliberate specimen — do not
  re-run)` bucket; the inventory names fixtures in section 0. **Never re-run it**: execution retention is count-based,
  so two more runs evict the failing execution and destroy the specimen. Recorded on prod 2026-09-27; verified live
  (preserved 1, SETTLED 0, UNEXPLAINED 0).
- **MI-4** — the five 09-25/26 mechanisms (`verdictFreshness`, `reExecutionExit`, REACTOR_BUDGET_EXHAUSTED, REAPED,
  `TRUNCATED_PARTIAL_OUTPUT`) are re-measured at the next health-run: dormant-by-age is where a mechanism turns out
  to be inert.

### Reviewer remit and the dialect lint (pointers — production is execution-facts', consumption is mine)

- **EG-1 `4d1d21d7` (the evidence-grading soak decision, prod live + reseeded 2026-09-27):** over 41 `change_reviewer`
  verdicts since 2026-09-20, NEITHER fell 26–27% → **0%**, and copy FIDELITY was never once genuinely verified (0
  blocking items). So evidence **PRESENCE** stays the reviewer's (section present, source named, source permitted —
  may block); **FIDELITY** is judged only WHERE the source is in context (the source wins); otherwise it is not
  graded, raised or blocked on, and never asserted as fabrication. Protocols: network 1.15.0, kubernetes 1.13.0,
  terraform 1.7.0, observability 1.4.0; Node C unchanged (its harvest-authority duty IS the source-in-context case).
  ⚠️ **Series break:** the ACCEPTED-line rate falls by construction after this reseed — never compare across the cut.
  A leg reviewer that still raises fidelity is now a guidance violation; the provenance tripwire's string test still
  applies.
- **EG-2 CLOSED, no build:** contracts omit `platformDialect` exactly where there is no dialect defect class
  (kubernetes + terraform: 0 dialect defects ever, by any catcher). Re-open trigger: a dialect defect that ESCAPES
  review on a leg whose contract lacked `platformDialect`.
- **EF-DL1 `44855220`:** the ABSENCE half no longer flags a banned token inside a grep-family quoted pattern (a check
  FOR the token). Nested `searchPatternExempt`, emitted only when non-empty.
- **EF-DL2 (open, execution-facts, panel in progress at
  `cline_docs/reviews/ef-dl2-dialect-lint-classification-2026-09-27/`):** the FALSE-NEGATIVE direction — the prose
  window does not stop at a heading, so real config in a harvested-labelled section is scanned by neither half
  (block kinds move in 66 of 100 contracted packages when bounded). Until it lands, a **clean** dialect-lint fact is
  weaker evidence than it reads — the R12 "mechanical beats prose is a prior" caveat now cuts in both directions.

### Deploy mechanics learned 2026-09-27

- **A docs-only push does NOT deploy.** `production-deploy.yml` `paths-ignore`: `.github/**`, `*.md`, `docs/**`,
  `cline_docs/**`, `.claude/**`, `.gitignore`. A fix whose only changed paths are there needs a code-bearing push (or a
  manual trigger — ask first) before "live" can be claimed. (The MI-3 deploy was first missed this way.)
- **The memory pre-flight refuses below 5120 MB available** (`blue-green-deploy.sh`), fail-closed. On 2026-09-27 it
  refused at **5027 MB** on a transient process. `9faec7dd` corrected the refusal text — it used to advise tearing down
  rigs that no longer live on prod (rigs run on devext since 2026-09-27; never stop cloudflared). The gate itself is
  unchanged.
- Protocols go live at deploy; **templates wait for the manual reseed of the owning seeds** — do not leave them
  disagreeing (EG-1 and D2 both reseeded the four `change_reviewer` rows immediately: 0 STALE / 40 CURRENT).
