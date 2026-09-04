# Continuation Prompt: Harness V3 — Full Pipeline Completion & Stage Orchestration

**Previous Sessions**: 2026-04-03 (35 commits) + 2026-04-04 (8+ commits across 4 sessions)
**Status**: Orchestrate mode implemented and deployed, validated in Test E (partial — token budget hit), two bugs found and fixed, dependency type hierarchy decided as prompt-level only

---

## What Was Built Across All Sessions (don't repeat this work)

### Session 1 (Apr 3): Template System + Pipeline Harness V1
- TemplateType enum (8 types: ARCHITECT, BUILDER, ANALYST, REVIEWER, OPERATOR, DOCUMENTER, ORCHESTRATOR, GENERALIST)
- 16 active templates, 3 deprecated, all with templateType assigned
- AgentCategory consolidated: 15→11 (5 MCP categories → MCP_SERVICE)
- Pipeline Harness template (`scripts/seed-harness-template.ts`) — meta-agent using claude-sonnet-4-5
- Automatic context chaining (`lib/agents/harness/context-chainer.ts`)
- Dependency creation + enforcement via MCP
- Confidence score parsing + §8 Output Requirements
- Configurable MAX_TOOL_TURNS (harness: 100), token budget: 500K/hr, 2M/day
- Patterns #49-51 documented (MCP Three-Layer, Dual Execution Parity, Prompt Section Ownership)

### Session 2 (Apr 4, early): TaskType Rationalization + Execution Fixes + Harness v3
- **TaskType 13→7**: Dropped 4 browser types, consolidated 4 MCP→1 (`MCP_SERVICE`), added `PIPELINE`
- **PIPELINE auto-assign**: `agent-execute-handler.ts:121-135` — PIPELINE task with no template auto-assigns Pipeline Harness
- **OPEN→IN_PROGRESS fix**: Execution start transitions task status (both engine + streaming route)
- **z.nativeEnum(TaskType)**: Fixed `mcp-action-validation.ts` — was hardcoded `z.enum()` blocking PIPELINE
- **Harness prompt v3**: Self-check gate, execution enforcement, parallel task guidance
- **Production DB migrated**: Enum recreated with 7 values, SQL migration at `scripts/migrate-task-types.sql`

### Session 3 (Apr 4, mid): Bug Fixes from Ground Truth Testing
- **Orphaned execution watchdog** (`agentExecutionEngine.ts`): Two-layer cleanup — startup (>2min) + poll cycle (>20min)
- **Dependency FK validation** (`task-create-handler.ts`, `task-update-handler.ts`): Validates dependencyIds exist before `createMany`
- **Root cause**: PM2 restart killed harness + child mid-flight, leaving zombie RUNNING records

### Session 4 (Apr 4, current): Orchestrate Mode + Research Review
- **Harness prompt v2.0** (`scripts/seed-harness-template.ts`): Dual-mode — CREATE vs ORCHESTRATE
  - Auto-detection: siblings in stage → orchestrate, no siblings → create
  - Dependency Type Hierarchy for inference fallback (ARCHITECT→BUILDER→REVIEWER→ANALYST→DOCUMENTER)
  - Token efficiency: no `verbose: true` on agent.results
  - Explicit `dependencyIds` format guidance (top-level, not nested in `parameters`)
- **Stage include added to execution engine** (`agentExecutionEngine.ts`): Both `processPendingExecutions` and `executeById` now include `stage: { id, name, order }` — query parity maintained
- **TaskId + StageId in contextual information**: Agent prompt now includes task ID, stage ID, and stage name so harness can detect its own stage and filter siblings
- **Dependency-only update fix** (`task-update-handler.ts`): NO_EFFECT check now allows updates with only `dependencyIds` — previously threw error because `dependencyIds` is handled in transaction, not in `updateData`
- **Template reseeded to production**: v2.0.0 with orchestrate mode + all fixes
- **Arxiv paper reviewed**: "Meta-Harness" (Stanford/MIT, 2026) — 6 actionable insights extracted

### Session 5 (Apr 5): Rate Limit Fixes + Self-Completion Guard
- **Token budget raised**: 500K→1M/hr, 2M→10M/day (`lib/services/llm/types.ts`)
- **Token budget hourly reset fix** (`tokenManager.ts`): `lastReset` now updates on hourly reset (was stale — window never slid)
- **MCP rate limit raised**: 100→300 req/min, configurable via `MCP_RATE_LIMIT_MAX_REQUESTS` env var (`mcp-http-middleware.ts`)
- **Premature self-completion guard** in harness prompt: harness must check ALL children COMPLETED before reporting success; if any remain OPEN, must list them with exact resume commands
- **Template reseeded to production**: v2.1.0 with self-completion guard
- **Root cause diagnosis**: "Rate limit exceeded" during Test F was the MCP HTTP rate limiter (100 req/min), NOT the token budget — the harness fires 10+ rapid API calls during orchestration

### Design Decision: Dependency Type Hierarchy — Prompt-Level Only
**Decision**: Keep the dependency type hierarchy in the harness PROMPT, not in engine code.
**Rationale**:
1. The override is the hard part — when a task description says "using the vulnerability audit findings," the harness wires to the REVIEWER task specifically. That's LLM reasoning; engine code can't do it without NLP.
2. Two sources of truth is worse than one — if engine auto-wires AND prompt tells LLM to wire, they'll conflict.
3. Risk is bounded — the template pins the model to `claude-sonnet-4-5`. If someone changes to a weaker model and the hierarchy isn't followed, the failure is obvious (no deps wired) and the fix is clear.
**Validation**: Test E confirmed the harness correctly inferred parallel Tasks 1+2, fan-in Task 3 (depends on 1+2), and final Task 4 (depends on 1+2+3) from descriptions alone.

---

## Ground Truth Test Results

### Test A (Session 1): Demo Financial Corp — "Assess data governance readiness"
- 4 tasks created + executed in 6.8 min, all SUCCESS
- Friction found: no new stage (prompt v2), tasks not COMPLETED, MCP validation blocked PIPELINE

### Test B (Session 2): Pipeline Test Corp — "Assess cloud migration readiness"
- PIPELINE type accepted, auto-assign worked, 3 new stages across 2 phases
- 6 tasks created, Australia context detected (ASD Essential Eight, APRA CPS 234)
- Issue: harness planned but didn't execute children → fixed in prompt v3

### Test C (Session 3): Demo Financial Corp — "Assess regulatory compliance readiness"
- 6 tasks created AND executed, 100% completion, 8.1 minutes, zero manual intervention
- Prompt v3 execution follow-through confirmed
- Orphaned execution watchdog confirmed (2 zombies cleaned)

### Test D (Session 4): Manual Pipeline Setup — Orchestrate Mode Thinking
- Created 4 tasks manually in a stage + 1 PIPELINE task as sibling
- Documented 6 design insights: sibling detection, template inference, dependency inference, taskId/stageId gap, mode auto-detection, context chaining compatibility
- Identified need for stage include + taskId in contextual info → implemented

### Test E (Session 4): Pipeline Test Corp — Orchestrate Mode Live Test
- **ORCHESTRATE MODE VALIDATED** — harness detected 4 siblings, switched to orchestrate
- **Template inference 4/4 correct**: Solution Architect, Security Analyst, Business Analyst, Technical Writer
- **Dependency graph correct**: Parallel Tasks 1+2 → fan-in Task 3 → final Task 4
- **All 4 templates assigned in single turn** (parallel tool calls)
- **Task 1 executed**: 39 seconds, confidence 82/100 (Solution Architect)
- **Dependency wiring failed**: `dependencyIds` nested in `parameters` → NO_EFFECT error → **fixed**
- **Token budget hit at 127s** (518K > 500K) — couldn't complete Tasks 2-4
- **Token waste identified**: harness requested `verbose: true` pulling 94K artifact → **fixed in prompt**

### Test F (Session 5): Pipeline Test Corp — Orchestrate Mode (Post-Fixes)
- **Fresh stage**: "Test F — Orchestrate Mode Full Completion" (`cmnkrtym2001xyx1atrwq9v17`)
- **3 work tasks + 1 PIPELINE** — simpler pipeline to fit within budget
- **PIPELINE auto-assign worked** — type: PIPELINE triggered automatic template assignment
- **Orchestrate mode detected** — harness identified 3 siblings
- **Template assignment 3/3 correct**: Solution Architect, Security Analyst, Technical Writer
- **Dependency inference correct**: linear chain (1→2→3)
- **Dependency wiring failed** — same API issue (deploy may not have reached production yet, or harness still nesting)
- **MCP rate limit hit** — 100 req/min limit blocked child execution (NOT token budget)
- **Premature self-completion** — harness marked itself COMPLETED with all 3 children still OPEN
- **Fixes deployed**: Rate limit raised to 300, budget raised to 1M/hr + 10M/day, self-completion guard added

### Test G (Session 5): Pipeline Test Corp — Full Orchestrate Mode SUCCESS
- **Fresh stage**: "Test G — Full Orchestrate Verification" (`cmnksp3rt0003yxhjhiaj8dky`)
- **3 work tasks + 1 PIPELINE** — data migration assessment
- **ALL FIXES VALIDATED**:
  - Rate limit (300/min): **no errors** — harness fired rapid calls without hitting limit
  - Token budget (1M/hr): **no errors** — full pipeline completed within budget
  - Self-completion guard: **PASS** — harness only marked itself COMPLETED after all 3 children done
- **Template assignment 3/3 correct**: Solution Architect, Security Analyst, Technical Writer
- **All 3 children executed to COMPLETION**: 100% completion rate
- **Context chaining verified**: Task 2 used Task 1's output, Task 3 used both
- **Total time: 228 seconds (3.8 minutes)** — zero manual intervention
- **4/4 tasks COMPLETED** — first fully successful orchestrate mode pipeline run

---

## Research: Meta-Harness Paper (Stanford/MIT, 2026)

**Paper**: "Meta-Harness: End-to-End Optimization of Model Harnesses" (arxiv 2603.28052v1)
**Project page**: yoonholee.com/meta-harness/ (reviewed — no additional insights beyond the 6 below)
**Core finding**: Automated harness search outperforms hand-tuned approaches by 7.7 points with 4x fewer tokens.
**Key stat from project page**: 10M tokens diagnostic context per step vs 26K for prior methods — the insight is "more context but navigable," not "less context." Reinforces #1 below but doesn't change our plan.
**Email sent**: Option A to yoonho@cs.stanford.edu, CC okhattab@mit.edu (Apr 5, 2026)

## Research: Omni-SimpleMem (UNC/Penn/Berkeley/Cisco, 2026)

**Paper**: "Omni-SimpleMem: Autoresearch-Guided Discovery of Lifelong Multimodal Agent Memory" (arxiv 2604.01007v2)
**Reviewed**: Apr 5, 2026 — assessed for relevance, not deeply applied
**Verdict**: Two actionable ideas, one reinforcement. Not enough overlap for author outreach.

**Takeaways for pAIchart:**
- **PIVOT logic**: Their PROCEED/ITERATE/PIVOT decision framework adds a concept we lack. Our completion loop re-executes or escalates — it never changes approach. A "pivot" would mean trying a different template type or reframing the task description when re-execution doesn't improve confidence. Consider for a future completion loop enhancement.
- **Full-text over summaries (+53% F1)**: They found original text outperformed LLM summaries. Caution for our selective context TODO — manifest + fetch-for-full-text is safer than summary-only. Don't throw away full predecessor output.
- **Bug fixes > tuning (+175%)**: Biggest gains from data pipeline bugs, not parameter optimization. Reinforces our hypothesis-driven re-execution — low confidence is more likely a bad task description or wrong template than a model issue.

### Actionable Insights for pAIchart (Meta-Harness)

| # | Insight | pAIchart Application | Priority |
|---|---------|---------------------|----------|
| 1 | **Selective context access** — agents grep what they need from filesystem, don't get everything injected | Context chainer currently injects FULL predecessor output. For large pipelines, store as inspectable artifacts, let agents pull selectively | Medium — future scalability |
| 2 | **Non-Markovian history** — proposer references 20+ prior candidates, not just parent | Store pipeline execution metadata (template, confidence, tokens, time). Show past runs when planning similar objectives | Medium — meta-learning |
| 3 | **Pareto frontier** — quality vs cost trade-off, not single-objective | Track confidence vs token cost per pipeline. Let users choose: fast/cheap vs thorough/expensive | Low — optimization |
| 4 | **Hypothesis-driven re-execution** — diagnose WHY confidence is low, provide specific feedback | Already in prompt v2 ("read the artifact, form a hypothesis"). Needs validation in a re-execution test | High — already implemented |
| 5 | **Interface validation** — contract checking before evaluation | Validate artifact structure against expected format (DOCUMENTER → markdown with sections, ANALYST → quantified findings) | Medium — quality gates |
| 6 | **Causal isolation** — when regression occurs, isolate which change caused it | Compare pipeline runs with similar objectives — what changed? Different templates? Different topology? | Low — future learning |

---

## What's Been Verified (all passing)

- [x] PIPELINE type accepted by task.create
- [x] Auto-assign triggers (no manual agent.assign needed)
- [x] New pipeline stages created correctly (create mode)
- [x] Dependencies wired correctly (create mode)
- [x] Templates assigned to children (create mode)
- [x] IN_PROGRESS status on execution start
- [x] Prompt v3 execution follow-through (create mode, Test C)
- [x] Child tasks marked COMPLETED with confidence scores (create mode)
- [x] Orphaned execution watchdog (zombie cleanup on startup + poll)
- [x] Dependency FK validation (graceful handling of non-existent IDs)
- [x] Integrity tests — 27/27 passing
- [x] **Orchestrate mode detection** — detects siblings, switches mode (Tests E, F, G)
- [x] **Template inference from descriptions** — 10/10 correct across Tests E, F, G
- [x] **Dependency graph inference** — correct topology from descriptions (Tests E, F, G)
- [x] **Stage include in execution queries** — both paths have parity
- [x] **TaskId + StageId in agent context** — harness can identify itself
- [x] **Full orchestrate pipeline completion** — 3/3 children executed, 100% (Test G)
- [x] **Raised rate limit (300/min)** — no rate limit errors (Test G)
- [x] **Raised token budget (1M/hr)** — no budget errors (Test G)
- [x] **Self-completion guard** — harness only completed after all children done (Test G)
- [x] **Context chaining in orchestrate mode** — predecessor output in successor prompt (Test G)

### Test H (Session 5): Single-Task Create Mode Regression — PASS
- **Cheap test** (~$0.05 vs $4 for full pipeline) — single Haiku specialist, no harness orchestration
- **Verified taskId in context**: `cmnku5fq1003hyxhjqcwx7663` — agent confirmed it could see its own ID
- **Verified stageId in context**: `cmnksp3rt0003yxhjhiaj8dky` — stage include working
- **Verified POV context**: `cmnk4srxh0001yxw9vnlhadic` — no regression
- **12 seconds, confidence 95/100** — engine changes confirmed working for non-harness execution
- **No regression** in create-mode execution path

## What Needs Testing Next Session

### No blocking tests remain
All critical paths verified (Tests A-H). Next work is feature development, not verification.

---

## Key Files

| File | What |
|------|------|
| `prisma/schema.prisma` | TaskType enum (7 values including PIPELINE) |
| `lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts` | PIPELINE auto-assign + IN_PROGRESS fix |
| `lib/mcp/tasks/action/handlers/task/task-update-handler.ts` | Dependency-only update fix (NO_EFFECT) |
| `lib/services/agentExecutionEngine.ts` | Stage include, taskId/stageId in context, execution engine |
| `app/api/pov/agent/execute/stream/route.ts` | Streaming route (already had stage include) |
| `scripts/seed-harness-template.ts` | Harness prompt v2.0 (dual-mode: CREATE + ORCHESTRATE) |
| `lib/agents/harness/context-chainer.ts` | Automatic context chaining |
| `lib/validation/mcp-action-validation.ts` | z.nativeEnum(TaskType) |
| `lib/utils/taskTypes.ts` | TaskType labels, icons, colors (7 types) |

## Key Documents

All harness docs are consolidated in `/.claude/knowledge/domain/harness/`:

| Doc | What |
|-----|------|
| `pipelines/PIPELINE-HARNESS-USER-GUIDE.md` | User guide v2.1 (both modes, troubleshooting, perf data) |
| `domain/harness/VISION.md` | Full harness vision (Phases 0-4, AGI dimension) |
| `domain/harness/PLATFORM-POSITIONING.md` | Six capabilities framing + competitive landscape |
| `domain/harness/TODO-EVENT-DRIVEN-PIPELINES.md` | Phase 3 spec (event-driven auto-execution) |
| `domain/harness/TODO-SELECTIVE-CONTEXT-ACCESS.md` | Phase 7 spec (deferred — not needed yet) |
| `/.claude/knowledge/patterns/PATTERN-REGISTRY.md` | 52 patterns (#49-52 are harness-related) |

## Test POVs

**Pipeline Test Corp - Cloud Migration Readiness**
- POV ID: `cmnk4srxh0001yxw9vnlhadic`
- Country: Australia
- Phases: Planning (`cmnk4sryp0006yxw9hqqpw5uf`), Execution (`cmnk4sryv0008yxw9t5cyozn9`), Review (`cmnk4sryx000ayxw9e7mtsshw`)
- Test E stage: `cmnk9mtzj00ajyxujslfukl13` (Manual Pipeline Test — API Security Review)
- Test F stage: `cmnkrtym2001xyx1atrwq9v17` (Test F — Orchestrate Mode Full Completion)
- Test G stage: `cmnksp3rt0003yxhjhiaj8dky` (Test G — Full Orchestrate Verification — SUCCESS)

**Demo Financial Corp** (used in Tests A + C)
- Separate POV, used for create-mode testing

---

## Big Ideas (Updated Apr 5, 2026)

| Idea | Impact | Effort | Status |
|------|--------|--------|--------|
| 3. Auto-execution on PIPELINE type | High — zero-touch | Low | **TODO spec written** → Phase 3 |
| 6. Pipeline templates (reusable) | High — reusability | Medium | **Next after Phase 3** → Phase 4 |
| 1. Every stage is a pipeline | High — unifies model | Medium | Design only |
| 2. Cascading across stages | High — full POV automation | Medium | Enabled by Phase 3 |
| 5. POV as executable program | Transformative | High | Design only |
| 4. Types as dependencies | Medium — removes manual wiring | Low | **Decided: prompt-level only** |
| 7. stage.orchestrate action | Medium — simpler UX | Medium | Maybe |

### Research Paper Ideas
| Idea | Source | Status |
|------|--------|--------|
| Selective context access | Meta-Harness paper | **DEFERRED** — full-text wins for current scale (Omni-SimpleMem: +53% F1) |
| Cross-pipeline learning | Meta-Harness paper | Future (Phase 7) |
| Pareto pipeline optimization | Meta-Harness paper | Future |
| Artifact structure validation | Meta-Harness paper | Future |
| PIVOT decision logic | Omni-SimpleMem paper | Future — completion loop enhancement |

---

## Production Proof Points (Updated Apr 5, 2026)

| Metric | Value |
|--------|-------|
| Pipeline decomposition | ~30 seconds |
| Full 4-task pipeline (Test A, create mode) | ~6.8 minutes |
| Full 6-task pipeline (Test C, create mode) | ~8.1 minutes |
| **Full 3-task pipeline (Test G, orchestrate mode)** | **~3.8 minutes, 100% completion** |
| Orchestrate mode detection | Working (Tests E, F, G) |
| Template inference accuracy | **10/10 (100%)** across Tests E, F, G |
| Dependency graph inference | Correct topology in all tests |
| PIPELINE auto-assign | Working (Tests B, C, E, F, G) |
| Confidence score parsing | 100% success |
| Context chaining | 100% — both create and orchestrate modes |
| Dependency enforcement | 100% (blocks out-of-order execution) |
| Self-completion guard | Working (Test G — harness waits for all children) |
| Token budget | 1M/hr, 10M/day (raised from 500K/2M) |
| MCP rate limit | 300 req/min (raised from 100, configurable) |
| TaskType values | 7 (was 13) |
| Active specialist templates | 16 across 8 functional types |
| Harness prompt version | v2.1.0 (dual-mode + self-completion guard) |
| Patterns documented | 52 |

---

## Completed End-of-Session Tasks (Session 5, Apr 5)

1. ~~Update PIPELINE-HARNESS-USER-GUIDE.md with orchestrate mode~~ — **Done** (v2.1)
2. ~~Document Pattern #52~~ — **Done** (side-effect-only-update-pattern, 94% confidence)
3. ~~Update positioning doc with orchestrate mode evidence~~ — **Done** (Test G results added)
4. ~~Write TODO specs~~ — **Done** (event-driven pipelines + selective context access)
5. ~~Assess selective context access~~ — **Deferred** (full-text wins, savings too small)

---

## Recommended Next Session Plan

### Pre-Step: Read Context
Before anything else, load the strategic context from the harness directory:
- `/.claude/knowledge/domain/harness/PLATFORM-POSITIONING.md` — six capabilities framing
- `/.claude/knowledge/domain/harness/VISION.md` — full harness vision (Phases 0-4)
- `/.claude/knowledge/domain/harness/TODO-EVENT-DRIVEN-PIPELINES.md` — Phase 3 spec (if implementing)

### Step 1: Phase 4 — Pipeline Templates (Recommended Next)
Both modes are solid (Test G passed). Pipeline Templates deliver the most visible user value:
- Reusable pipeline definitions (e.g., "Security Posture Assessment" = 4 tasks pre-configured)
- Apply a template to a stage → tasks appear with types, descriptions, and dependency hints
- Add a PIPELINE task → orchestrate mode runs the pre-configured pipeline
- Builds directly on orchestrate mode — the highest-leverage next step

**Design questions to resolve:**
- Where do pipeline templates live? New DB model? JSON in metadata? Seed scripts?
- How does the user apply a template to a stage? New MCP action `stage.applyTemplate`?
- Does applying a template auto-create a PIPELINE task, or does the user add one?
- Can pipeline templates be shared across POVs?

### Step 2: Phase 3 — Event-Driven Auto-Execution (After Templates)
With templates making pipeline setup instant, auto-execution makes pipeline triggering automatic:
- PIPELINE task with `autoExecute: true` auto-triggers when stage preconditions met
- Full spec: `/.claude/knowledge/domain/harness/TODO-EVENT-DRIVEN-PIPELINES.md`
- Together with templates: user applies template → tasks created → PIPELINE auto-fires → results delivered

### Step 3: Update Docs
After new features, update positioning doc and user guide with evidence.

### The Vision Progression

```
✅ Phase 0: Template System (8 types, 16 templates)
✅ Phase 1: Pipeline Harness — CREATE mode (decompose + execute)
✅ Phase 2: Pipeline Harness — ORCHESTRATE mode (read + assign + execute)
→  Phase 3: Event-driven pipelines (auto-execution on PIPELINE detection)
→  Phase 4: Pipeline Templates (reusable pipeline definitions)
→  Phase 5: Cascading pipelines (stage→stage→stage automation)
→  Phase 6: POV as executable program (single "execute POV" command)
→  Phase 7: Cross-pipeline learning + selective context (DEFERRED)
→  Phase 8: Agent-to-agent evaluation (customer's AI evaluates via MCP)
```

**Current position**: Phase 2 complete. Both Phases 3 and 4 are ready to implement.
**Recommendation**: Phase 4 (templates) first — delivers user value immediately.
Phase 3 (auto-execution) second — makes templates fire-and-forget.
Together they enable: apply template → walk away → results delivered.
