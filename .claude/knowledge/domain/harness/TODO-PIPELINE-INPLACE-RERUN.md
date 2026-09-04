# TODO: Enable In-Place Re-Run for Completed PIPELINE Tasks

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

> **Created**: 2026-04-11 | **Status**: Deferred — specialist review complete, semantic questions unresolved
> **Priority**: Low (workaround exists — create fresh PIPELINE task)
> **Average specialist confidence**: 82/100 (below 85% proceed threshold)

---

## Problem Statement

Pipeline Harness completes mark their PIPELINE-type tasks as `status: COMPLETED`. The task status state machine (`VALID_TASK_TRANSITIONS` in `lib/tasks/services/task.ts:20-25`) treats COMPLETED as terminal — no transitions allowed. This blocks re-running a completed pipeline in place.

**Current workaround**: Create a fresh PIPELINE task **in a new stage** with the same objective. The harness will execute it as a new CREATE-mode run with its own child stage and artifacts.

**Why the workaround is imperfect**:
- Stages accumulate duplicate tasks (`HIPAA Analysis`, `HIPAA Analysis (re-run)`, `HIPAA Analysis (re-run 2)`, ...)
- Each task has its own 5-execution retention window — can't compare run 1 vs run 10 within one task
- Deleting old tasks cascades to delete their artifacts (no archive)
- Awkward for high-frequency use cases (calibration testing, regression runs)
- **Stage trap footgun**: if the new PIPELINE task is created in the *same stage* as the completed original, the harness's sibling-count mode detection flips to ORCHESTRATE mode. The new harness then tries to re-execute the completed original sibling, hits the terminal-COMPLETED validator, and escalates. Symptom: "new pipeline ran but did nothing." The workaround requires always creating a fresh stage for re-runs. This is the same root cause as blocker B2 but surfaces in the *current workaround* as well as the proposed in-place re-run.

---

## Specialist Review Summary (2026-04-11)

Four specialists reviewed the proposed change (allow `COMPLETED → OPEN` transition for `type: PIPELINE` tasks). Review follows `specialist-review-protocol.md` v1.1 with Phase 0 current-state validation.

### Confidence Scores

| Specialist | Score | Verdict |
|-----------|-------|---------|
| architectural-review | 86/100 | Proceed with Option B + KPI exclusions + docs |
| task-services | 86/100 | Proceed with Option B + paired execute-handler fix |
| agent-execution | 78/100 | Caution — harness mode detection flip is a silent failure |
| boundary-contract | 78/100 | Caution — field leakage at MCP handler is a hard blocker |
| **Average** | **82/100** | **Below 85% proceed threshold** |

### Consensus Findings

**All four specialists independently converged on:**

1. **Option B is the right shape** — not the parameter approach I originally proposed. Use a table-driven `VALID_TRANSITIONS_BY_TYPE` map so per-type policy is data, not conditional branches:
   ```typescript
   const DEFAULT_TRANSITIONS = { OPEN: [...], IN_PROGRESS: [...], BLOCKED: [...], COMPLETED: [] };
   const PIPELINE_TRANSITIONS = { ...DEFAULT_TRANSITIONS, COMPLETED: ['OPEN'] };
   const TRANSITIONS_BY_TYPE: Partial<Record<TaskType, typeof DEFAULT_TRANSITIONS>> = {
     PIPELINE: PIPELINE_TRANSITIONS,
   };
   ```

2. **The validator change alone is insufficient**. Four additional load-bearing changes required.

3. **Smoke test A3** (`adversarial-business-logic-smoke-test.md:53-94`) must be updated: assert PIPELINE-exemption is a positive case, non-PIPELINE still rejects.

4. **Whitepaper line 271** (`WHITEPAPER-REFERENCE-v1.md`) documents the state machine as a formal guarantee — must be amended.

### Critical Blockers Identified

| # | Blocker | Source | Severity |
|---|---------|--------|----------|
| B1 | Field leakage at `task-update-handler.ts:374` — Prisma select omits `type`, so exemption silently doesn't fire on MCP path | boundary-contract | HIGH |
| B2 | Harness mode detection flip — on re-run, old children are detected as siblings, harness switches to ORCHESTRATE mode and tries to re-execute completed children, recursively hitting the validator | agent-execution | HIGH |
| B3 | `agent-execute-handler.ts:164-168` only transitions OPEN → IN_PROGRESS. A reopened COMPLETED task never flips to IN_PROGRESS, so validator change alone is dead code | task-services | HIGH |
| B4 | 15-30 analytics consumer sites filter on `status === 'COMPLETED'` — reopened PIPELINE tasks will oscillate KPI denominators, distort cycle-time metrics | architectural + boundary-contract | MEDIUM |

### Open Semantic Questions (must be answered before implementation)

1. **Ownership** — Can team members re-open a PIPELINE task, or is this owner/admin-only?
2. **Input context preservation** — Does re-run inherit the prior `inputContext`/prompt verbatim, or reload from the template?
3. **Re-run cap** — Whitepaper §3.6 caps re-executions at 2 — does that apply per-run or lifetime?
4. **`completedAt` semantics** — Does reopen clear `completedAt`, bump it, or leave stale?
5. **Workflow engine interaction** — If a workflow engine advances stages on COMPLETED, does reopening a PIPELINE leave stage state inconsistent?

---

## Required Implementation Scope (if revived)

**Not 30 minutes — ~5 hours across 4 domains**.

### Code Changes

| Change | Files | Effort |
|--------|-------|--------|
| Option B: `VALID_TRANSITIONS_BY_TYPE` table + refactored validator | `lib/tasks/services/task.ts` | 20 min |
| Add `type: true` to Prisma select at both MCP handlers | `lib/mcp/tasks/action/handlers/task/task-update-handler.ts:374`, `task-complete-handler.ts:131` | 10 min |
| Pass `existingTask.type` into validator at all 3 call sites | 3 files | 10 min |
| Use `TaskType.PIPELINE` enum from `@prisma/client`, not string literal | validator | 5 min |
| **Paired execute-handler change**: allow COMPLETED→IN_PROGRESS reset for PIPELINE type | `lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts:164-168` | 30 min |
| **Harness prompt update**: force CREATE mode on re-run regardless of sibling detection | `scripts/seed-harness-template.ts` (Section A mode detection) | 30 min |
| **Context injection**: expose `priorExecutionCount` to harness via the shared `buildContextSummary()` (Axis 3 — was engine `buildContextualInformation`, now merged) | `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` | 45 min |
| Exclude `type === 'PIPELINE'` from KPI denominators | `lib/services/taskAnalyticsService.ts` (12 sites), `lib/pov/services/kpi-calculators.ts`, `app/api/analytics/domains/tasks/insights.ts`, `performance.ts`, `app/api/analytics/domains/admin/portfolio-health.ts`, `recommendations.ts`, `health-history.ts` | 1 hour |
| Reset `completedAt` semantics — decision + implementation | `lib/tasks/services/task.ts` (`TaskService.updateTask`) | 30 min |
| New `PIPELINE_REOPENED` TaskActivity type | `lib/validation/activity-validation.ts`, `lib/tasks/services/taskActivityService.ts` | 20 min |

### Documentation Changes

| Change | File |
|--------|------|
| Update smoke test A3 (pin to non-PIPELINE) + add A3b (positive case for PIPELINE) | `.claude/knowledge/smoke-tests/adversarial-business-logic-smoke-test.md:53-94` |
| Update whitepaper line 271 with PIPELINE exemption clause | `.claude/knowledge/domain/harness/WHITEPAPER-REFERENCE-v1.md` |
| Update pipeline harness guide to re-add in-place re-run as a working path | `.claude/knowledge/domain/harness/PROMPT-PIPELINE-HARNESS-GUIDE.md` |
| Add safety test: re-run PIPELINE task with old child stage present, verify fresh stage created | new test |

### Re-Review Required

After implementation, re-review with at least:
- **agent-execution-specialist** (to confirm mode detection fix works, target ≥90%)
- **boundary-contract-specialist** (to confirm field leakage closed, target ≥90%)

---

## Alternative Designs Considered and Rejected

| Option | Description | Reason Rejected |
|--------|-------------|-----------------|
| **A. Parameter** | Add `taskType?` param to validator, inline bypass | Conflates type policy with generic validator. Sets precedent for ad-hoc exemptions |
| **B. Table-driven** ✅ | `VALID_TRANSITIONS_BY_TYPE` map | **Recommended** but blocked by open questions and paired change scope |
| **C. New state** | Introduce `COMPLETED_REPEATABLE` TaskStatus enum value | Prisma migration, 30+ analytics rewrites, UI filter updates, whitepaper churn. Huge blast radius for marginal semantic gain |
| **D. Remove rule** | Let engine decide, drop transition validation | Destroys whitepaper guarantee and adversarial smoke test. Undermines audit integrity |
| **E. Force fresh tasks** (current workaround) | Accept stage clutter, create new PIPELINE task per run | Works today. Imperfect but safe |

Current decision: **Stay on Option E** until a real use case justifies the 5-hour cross-domain change.

---

## Decision Criteria for Reviving This Work

Revisit this TODO when **any** of the following are true:

1. A user frequently needs to compare 5+ runs of the same pipeline (calibration testing, regression analysis)
2. Stage clutter from duplicate PIPELINE tasks becomes a navigation problem
3. The KPI service (see `TODO-CONTEXT7-KPI-INTEGRATION.md`) needs to track pipeline health across many re-runs of the same objective
4. A customer demonstration exposes the "create fresh task each time" workflow as awkward
5. Someone else volunteers to answer the 5 open semantic questions and do the 5-hour implementation

---

## Related Files (Reference)

### Code touched by proposed change
- `/home/steve/copov15/lib/tasks/services/task.ts` (validator, lines 20-43, 645-655)
- `/home/steve/copov15/lib/mcp/tasks/action/handlers/task/task-update-handler.ts` (lines 370-379)
- `/home/steve/copov15/lib/mcp/tasks/action/handlers/task/task-complete-handler.ts` (lines 128-135)
- `/home/steve/copov15/lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts` (lines 163-201)
- `/home/steve/copov15/lib/services/agentExecutionEngine.ts` (lines 996-1056)
- `/home/steve/copov15/lib/agents/harness/context-chainer.ts` (line 87)
- `/home/steve/copov15/scripts/seed-harness-template.ts` (mode detection lines 80-89)
- `/home/steve/copov15/prisma/schema.prisma` (TaskType enum lines 784-791)

### Analytics consumers affected (Option B ripple)
- `/home/steve/copov15/lib/services/taskAnalyticsService.ts` (12 COMPLETED filter sites)
- `/home/steve/copov15/lib/pov/services/kpi-calculators.ts` (lines 95, 106)
- `/home/steve/copov15/lib/services/workflow/workflowEngine.ts`
- `/home/steve/copov15/app/api/analytics/domains/tasks/insights.ts`
- `/home/steve/copov15/app/api/analytics/domains/tasks/performance.ts`
- `/home/steve/copov15/app/api/analytics/domains/admin/portfolio-health.ts`
- `/home/steve/copov15/app/api/analytics/domains/admin/recommendations.ts`
- `/home/steve/copov15/app/api/analytics/domains/admin/health-history.ts`

### Documentation affected
- `/home/steve/copov15/.claude/knowledge/domain/harness/WHITEPAPER-REFERENCE-v1.md` (line 271)
- `/home/steve/copov15/.claude/knowledge/smoke-tests/adversarial-business-logic-smoke-test.md` (lines 53-94)
- `/home/steve/copov15/.claude/knowledge/domain/harness/PROMPT-PIPELINE-HARNESS-GUIDE.md`

### Specialist reviews (session artifacts)
Four specialist reviews were completed as part of this decision. They are not stored as persistent artifacts but the full findings are captured in this document's "Consensus Findings" and "Critical Blockers" sections.

---

**Last Updated**: 2026-04-11 after specialist review
**Next Review Trigger**: User request or one of the 5 decision criteria above
