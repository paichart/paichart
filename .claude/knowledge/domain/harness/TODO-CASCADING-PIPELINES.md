# TODO: Cascading Pipelines (Cross-Stage Automation)

**Status**: Planned → **LARGELY EXISTS via dependency edges — proven live 2026-07-14.** Phase-0 probe:
a top-level PIPELINE task with `dependencyIds` on another task **auto-queued 3s after that dependency
completed** and ran unattended (harness template pre-assigned; probe pair `cmrkmxux6…` → `cmrkmy4z6…`).
**CORRECTION (2026-07-15 panel): the forward cascade IS stage-scoped (`taskReadyReactorService.ts:156`) —
the probe pair shared a stage. Cross-stage dependency edges silently never fire; wire cascading pipelines
as SIBLINGS in one stage** (see `cline_docs/reviews/program-architect-design-2026-07-15/design-proposal.md` D3). The stage-completion trigger designed below is
therefore mostly redundant — cross-stage cascade = wire a dependency edge from the next stage's PIPELINE
task to the prior stage's tasks (+ pre-assign the harness template). Remaining gap vs this design:
`autoExecute` flag semantics / template auto-assign on the reactor path (probe required a pre-assigned
template). See TODO-POV-EXECUTABLE-PROGRAM.md "2026-07-14 reframe".

**Probe ALSO found + fixed the cascade's one real bug (2026-07-14/15):** the auto-queued harness ran
CREATE with task status still **OPEN** (only the `agent.execute` MCP handler did the OPEN→IN_PROGRESS
transition), so the pipeline-retrigger reactor's Guard 3 (`status='IN_PROGRESS'`) silently never queued
SYNTHESIZE — all 4 children completed, harness sat stuck 22 min (run `cmrkmy4z6…`; task.complete would
also have rejected OPEN→COMPLETED). FIX: `createAgentExecution` now does the OPEN→IN_PROGRESS transition
at the row-creation chokepoint (all entry paths inherit; idempotent with the handler's), and the reactor's
Guard 3b logs LOUDLY when a harness is found in a non-IN_PROGRESS status instead of silently returning.
Cascaded pipelines now complete end-to-end.
**Phase**: 5
**Created**: 2026-04-05
**Estimated Effort**: Medium (1-2 sessions)
**Dependencies**: Phase 3 (event-driven auto-execution) — planned, Phase 4 (pipeline templates) — planned

---

## Introduction

Phases 3 and 4 give us auto-executing pipelines within a single stage. Phase 5 chains them: when one stage's pipeline completes, the next stage's pipeline starts automatically. The POV structure (phases → stages) becomes a cascading sequence of pipelines.

Today, each stage is independent. There's no mechanism for "Stage 2 starts when Stage 1 finishes." The human must notice Stage 1 completed, then trigger Stage 2. Phase 5 removes that gap.

## Objective

When all tasks in Stage N are COMPLETED, and Stage N+1 contains a PIPELINE task with `autoExecute: true`, the system automatically triggers Stage N+1's pipeline.

**End state**: A multi-stage POV runs itself. Each stage's pipeline feeds the next through cross-stage context chaining.

## How It Would Work

```
Planning Phase
  ├── Stage 1: Requirements Gathering (pipeline)
  │   ├── [PIPELINE autoExecute:true] Orchestrate
  │   ├── Stakeholder analysis (ANALYST)
  │   └── Scope definition (ARCHITECT)
  │       ↓ all tasks COMPLETED → auto-triggers Stage 2
  ├── Stage 2: Solution Design (pipeline)
  │   ├── [PIPELINE autoExecute:true] Orchestrate
  │   ├── Architecture design (ARCHITECT)
  │   └── Security review (REVIEWER)
  │       ↓ all tasks COMPLETED → auto-triggers Stage 3

Execution Phase
  ├── Stage 3: Implementation (pipeline)
  │   ├── [PIPELINE autoExecute:true] Orchestrate
  │   ...
```

## Key Design Decisions

### What triggers the cascade?

**Option A: Stage completion event**
- When all tasks in a stage reach COMPLETED status, emit an event
- The event-driven engine (Phase 3) detects PIPELINE tasks in subsequent stages and triggers them
- Natural extension of Phase 3's polling logic — just expand "predecessor stages complete" check

**Option B: Explicit stage dependencies**
- Stages have a `dependsOnStageId` field
- More flexible (allows non-sequential stage dependencies)
- Requires schema change

**Recommendation**: Option A for v1. Stage ordering (`order` field) already defines sequence. No schema change needed. Option B for future if non-linear stage dependencies arise.

### Cross-stage context chaining

Currently the context chainer works within a stage (task dependencies). For cascading pipelines, the last task of Stage N should feed context to the first task of Stage N+1.

**Options:**
- **Automatic**: Context chainer looks for the last COMPLETED task in the previous stage and injects its output into the first task of the next stage
- **Via PIPELINE task**: The PIPELINE task in Stage N+1 receives a summary of Stage N's results as part of its orchestration context (it already reads POV context which includes completed stages)
- **Via dependency**: Create a cross-stage dependency (Task in Stage N+1 depends on Task in Stage N)

**Recommendation**: Via PIPELINE task is simplest — the harness already reads POV context which includes completed task history. The orchestrating harness in Stage N+1 naturally sees what Stage N produced. No new mechanism needed.

### Phase boundaries

Should cascading cross phase boundaries? (e.g., Planning Phase → Execution Phase)

**Recommendation**: Yes, but only within auto-execute scope. If a phase has stages with `autoExecute: true` PIPELINE tasks, they cascade. Phase transitions are a natural checkpoint where a human might want to review before proceeding. Support it but don't force it.

## Implementation Procedure

### Step 1: Extend Phase 3 Predecessor Check
- Currently Phase 3 checks: "Are all predecessor stages complete?"
- Extend to: "Are all TASKS in predecessor stages COMPLETED?"
- This is a query change, not an architectural change

### Step 2: Cross-Stage Context Signal
- When the harness in Stage N+1 starts, it should know Stage N completed
- The POV context already includes phase/stage structure with task counts
- The harness can call `task.list` on the previous stage to see completed outputs
- May want to add a "Previous stage summary" section to the orchestration context

### Step 3: Test
- Create a 2-stage POV with PIPELINE tasks in both stages (autoExecute: true)
- Manually trigger Stage 1
- Verify Stage 2 auto-triggers when Stage 1 completes
- Verify Stage 2's harness can reference Stage 1's outputs

## Related Context

- **Phase 3 TODO**: `TODO-EVENT-DRIVEN-PIPELINES.md` — the auto-execution engine this builds on
- **Stage ordering**: Stages have `order` field in Prisma schema — defines sequence within a phase
- **Context chainer**: `lib/agents/harness/context-chainer.ts` — currently handles within-stage dependency chaining
- **POV context**: the shared `pAIchartUniversalTemplate.ts:buildContextSummary()` (Axis 3 — was engine `buildContextualInformation`, now merged for both paths) — includes phase/stage info

## Success Criteria

- [ ] Stage N completion triggers Stage N+1's PIPELINE task automatically
- [ ] Works across stages within a phase
- [ ] Works across phase boundaries (optional, human-reviewable)
- [ ] Stage N+1's harness can reference Stage N's outputs
- [ ] Cascading stops if any stage's pipeline fails or escalates
- [ ] POV-level view shows cascade progress

## Risks

- **Cost cascade**: A 5-stage POV with auto-execute could consume significant tokens without human checkpoints. Mitigation: budget guards (Phase 3), opt-in per stage.
- **Failure propagation**: Stage 1 produces low-quality output → Stage 2 builds on bad foundations. Mitigation: confidence threshold gate — only cascade if Stage N's average confidence > threshold (e.g., 70).
- **Infinite loops**: If a stage somehow re-triggers its predecessor. Mitigation: only cascade forward (higher order stages), never backward.
