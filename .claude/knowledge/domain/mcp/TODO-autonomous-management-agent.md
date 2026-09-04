# TODO: Autonomous Management Agent — Strategic Implementation Plan

> **Status**: Phase 1.5 COMPLETE, Phase 2 planned | **Priority**: High | **Estimated Effort**: 2-3 weeks (5 phases)
> **Current Value Score**: 8.5/10 | **Target Score**: 9.5/10
> **Last Updated**: 2026-03-14
> **Depends On**: P6 embedded server migration (COMPLETE ✅, apiClient fully removed 2026-03-14)

## Executive Summary

The embedded server has three powerful systems that are **disconnected**:

1. **Recommendation Engine** — Analyzes tasks, POVs, team patterns, generates intelligent suggestions
2. **Agent Execution Engine** — 10-second polling loop, LLM-powered task execution, artifact generation
3. **External Service Orchestration** — Connection-pooled SDK calls to external MCP services (Sentry, etc.)

Connecting these three systems creates an **autonomous management agent** that monitors POV health, detects issues, takes corrective action within approved boundaries, and escalates only when needed.

### The Missing Link

```
After Phase 1 (bridge connected):
  Recommendations ──→ Action Mapper ──→ TasksActionRouter ──→ Results ✅
  Recommendations ──→ Action Mapper ──→ Service calls (queued) ✅
  Recommendations ──→ Action Mapper ──→ Workflows (queued) ✅
  Agent Execution  ──→ Polls queue ──→ No work queued automatically
  External Services ──→ Ready ──→ Nobody calling programmatically

Phase 1.5 COMPLETE (2026-03-14):
  4 data-driven generators replace hardcoded templates
  All actions are valid WorkflowStep format with real task/POV targets
  Recommendations persisted to DB with per-user dedup
  Preview endpoint shows actions before execution
  Graduated execution (LOW-risk only / Execute All)

Target (connected):
  Recommendations ──→ Action Mapper ──→ Execution Queue ──→ Results
       ↑                                       ↓
       └──────── Feedback Loop ←──── Outcome Scoring
```

---

## Current Architecture Reference

### Recommendation System (Two Generators)

**User-Context** (`/api/mcp/recommendations/route.ts`) — **REWRITTEN Phase 1.5**:
- 4 data-driven generators: stale tasks, unassigned tasks, approaching deadlines, POV progress reports
- 9+2 parallel queries (context + generator sub-queries), 3 DB round trips total
- Persisted to DB with per-user dedup (generatorKey + userId + toolId, 24h window)
- All actions are valid `WorkflowStep` format: `{ service: 'paichart', tool: 'execute_task_action', arguments: { action, ... } }`
- Preview endpoint: `GET /api/mcp/recommendations/[id]/preview` (dry-run action mapping)
- Graduated execution: `?riskFilter=LOW` on implement endpoint
- Security: `createHandler` with `requireAuth` + `rateLimit: 'write'`, Zod validation, `validatePOVAccess`, PENDING cap (50/user)
- System MCPTool: `paichart-recommendation-engine` (category: ai-intelligence)

**Admin Portfolio** (`/api/analytics/domains/admin/recommendations.ts`):
- Generates 14 portfolio-wide recommendations
- Source-data: risk, bottlenecks, resource allocation, tool performance, team efficiency
- Activity-based: stale tasks, assignment volatility, comment-heavy tasks, agent retries

### Agent Execution Engine (`lib/services/agentExecutionEngine.ts`)

- **Queue**: `AgentExecution` table, status-based state machine (PENDING → RUNNING → SUCCESS/FAILED)
- **Polling**: 10-second interval, processes up to 5 per cycle
- **Race prevention**: Atomic `updateMany` with status condition
- **Two entry paths**: Fire-and-forget (`executeById`) + background polling (fallback)
- **Output**: `AgentArtifact` records (markdown, JSON, structured data)

### External Service Orchestration

- **ServiceConnectionPool**: Singleton, max 20 connections, LRU eviction, 5min idle timeout
- **Trust levels**: INTERNAL → TRUSTED → OWNER → TEAM_MEMBER → SCOPED → ANONYMOUS
- **Resilient calls**: 30s timeout, auto-retry on stale connections, promise deduplication
- **Orchestration engine**: Sequential/parallel/conditional modes, variable chaining (`{{step.N.output.field}}`), failure strategies (stop/continue/rollback)

### Perform Tool Actions (14 available)

```
pov.create, task.create, task.update, task.assign, task.complete,
task.comment, stage.create, agent.configure, agent.assign,
agent.execute, agent.status, agent.results, analytics.generate
```

### The Implement Endpoint (`/api/mcp/recommendations/[id]/implement/route.ts`) — FIXED ✅

**Phase 1 complete** (2026-03-13): Endpoint now executes real actions via Action Mapper:
- `perform` actions → `TasksActionRouter.route()` (immediate execution)
- `service_call` actions → queued for MCP server context
- `workflow` actions → queued for orchestration engine
- Updates `MCPWorkflowExecution` with real status (COMPLETED/FAILED) and timing
- Updates `MCPRecommendation.status` to IMPLEMENTED with `implementedAt`/`implementedBy`
- Returns real execution results with per-step details
- BC28 IDOR fix preserved, BC50 transaction fix preserved
- **Production-tested**: Successfully implemented alpha-vantage TOOL_LIST recommendation

---

## Phase 1: Fix the Implement Bridge — COMPLETE ✅

> **Completed**: 2026-03-13 | **Commits**: `783069b7`, `a7fc98e6`

### What Was Built

**1.1 — Action Mapper Service** ✅ `lib/services/mcp/recommendation-action-mapper.ts`
- Maps `WorkflowStep[]` to 3 execution paths: `perform`, `service_call`, `workflow`
- Risk classification: HIGH (pov.create, agent.execute), MEDIUM (task.create, task.assign, task.complete, etc.), LOW (rest)
- Single-step actions route individually; multi-step become workflows (minimum MEDIUM risk)
- Pattern detection: `execute_task_action` tool or `paichart` service with `arguments.action`

**1.2 — Implement Endpoint Rewritten** ✅ `app/api/mcp/recommendations/[id]/implement/route.ts`
- `perform` → `new TasksActionRouter().route()` with identity-preserving token forwarding
- `service_call` → queued with log (requires MCP server's ServiceConnectionPool)
- `workflow` → queued for orchestration engine
- Sequential execution with continue-on-error (WO-8: independent actions don't block each other)
- Transaction: MCPInteraction + MCPWorkflowExecution + MCPRecommendation update
- Uses `recommendation.toolId` (not hardcoded) for FK constraint compliance

**1.3 — Frontend: Real Results** ✅ `components/mcp/IntelligentTaskAutomation.tsx`
- Loading spinner during execution, DONE badge for implemented
- Toast shows real execution details (steps, timing, risk level)

**1.4 — Production Tested** ✅
- Successfully implemented alpha-vantage TOOL_LIST recommendation
- Fixed FK constraint error (P2003) — `toolId` must reference existing MCPTool

### What Was NOT Built (Deferred)
- No `executionId` field added to schema (link via MCPWorkflowExecution query instead)
- No execution status polling for async operations (service_call/workflow are queued, not polled)
- No unit tests yet (production-tested manually)

---

## Phase 1.5: Granular Actionable Recommendations — COMPLETE ✅

> **Goal**: Replace hardcoded template recommendations with data-driven, executable actions
> **Completed**: 2026-03-14 | **Commits**: `d9f038b3`, `9dba9dd1`, `4baee1a1`, `30a978db`, `6b5399db`
> **Reviewed by**: 5 specialists (arch, db, security, boundary, api-efficiency) + 2 follow-up (workflow-orchestration, mcp-hub)
> **Implementation plan**: `cline_docs/reviews/phase-1.5-granular-recommendations/IMPLEMENTATION-PLAN.md`

### What Was Built

**1.5.1 — Recommendation Generator Rewrite** ✅ `app/api/mcp/recommendations/route.ts`
- Deleted 5 hardcoded templates with fake action types (`workflow_automation`, `phase_automation`, `ai_assignment`)
- Replaced with 4 data-driven generators that query actual user data:
  - **Stale Tasks**: Tasks with no update in 7+ days → `task.comment` reminders (LOW risk)
  - **Unassigned Tasks**: Tasks unassigned for 3+ days → `task.assign` with least-loaded team member (MEDIUM risk)
  - **Approaching Deadlines**: Tasks due within 3 days, not started → `task.comment` warnings (LOW risk)
  - **POV Progress Reports**: POVs with no recent analytics → `analytics.generate` (LOW risk)
- All actions are valid `WorkflowStep` format: `{ service: 'paichart', tool: 'execute_task_action', arguments: { action, ... } }`
- 9+2 parallel queries (context + generator sub-queries), 3 DB round trips total
- Persist-on-generate with per-user dedup (generatorKey + userId + toolId, 24h window)
- PENDING cap at 50 per user (pagination-safety-cap-pattern)
- `createHandler` with `requireAuth` + `rateLimit: 'write'`
- Zod `safeParse` for CUID validation on `taskId`/`povId` query params
- `validatePOVAccess` when `povId` is provided

**1.5.2 — Preview Endpoint** ✅ `app/api/mcp/recommendations/[id]/preview/route.ts`
- `GET /api/mcp/recommendations/[id]/preview` — dry-run action mapping
- Returns: action list with descriptions, risk levels, counts, benefits, time/cost savings
- `createHandler` with `requireAuth`, `validatePOVAccess` with `throwOnDeny: false`
- IDOR prevention: returns NOT_FOUND for unauthorized POVs

**1.5.3 — Graduated Execution** ✅ `app/api/mcp/recommendations/[id]/implement/route.ts`
- `?riskFilter=LOW|MEDIUM|HIGH` URL param with Zod validation
- Filters actions by risk before execution
- Continue-on-error for independent actions (WO-8: task #7 deleted shouldn't block #8-50)
- `validatePOVAccess` replaces manual team membership query (WO-13 + SEC LOW-4)

**1.5.4 — Frontend** ✅ `components/mcp/IntelligentTaskAutomation.tsx`
- Preview panel: action list with play icon + description + risk badge (green/yellow/red)
- Summary line with action counts by risk level
- "Execute LOW-risk" and "Execute All" buttons (graduated execution)
- Service template detection: `source !== 'data-driven'` → TEMPLATE badge (no action buttons)
- `fetchPreview` on expand with caching

**1.5.5 — Bug Fixes & Security Hardening** ✅
- Feedback endpoint: Added SUPER_ADMIN role check, Zod validation (rating 1-5, comment max 2000), use `recommendation.toolId` instead of hardcoded string
- `task.create` reclassified as MEDIUM risk (was implicitly LOW)
- System MCPTool `paichart-recommendation-engine` registered (category: ai-intelligence)

**1.5.6 — Schema Changes** ✅ `prisma/schema.prisma`
- Added `userId` to MCPRecommendation with `@@index([userId, toolId, status])`
- Added Task indexes: `@@index([assigneeId, status, updatedAt])`, `@@index([status, dueDate])`

### Production Test Results (2026-03-14)
- GET /api/mcp/recommendations → 200, 2 data-driven recs (48 stale tasks, 3 unassigned)
- GET /api/mcp/recommendations/{id}/preview → 200, 48 LOW-risk actions mapped correctly
- Recommendations persisted with real CUIDs and userId populated
- Dedup working via `context.generatorKey` Json path query

### What Was NOT Built (Deferred)
- **Generator 5 (Phase Transitions)** — over-scoped, `phaseService` doesn't exist, creates entities
- **Review Each mode** — per-action approval workflow (Phase 3)
- **WorkflowStep Zod validation on DB deserialization** — mitigated by server-generated data + action mapper whitelist
- **GET/POST split** for recommendations endpoint — documented tech debt, dedup + try/catch make GET-with-writes acceptable
- **Rate limiting beyond createHandler** — per-user PENDING cap handles the primary concern

---

## Phase 2: Continuous Awareness (3-4 days)

> **Goal**: Scheduled recommendation generation + auto-queue for low-risk actions

### 2.1 — Recommendation Scheduler

**File**: `lib/services/mcp/recommendation-scheduler.ts`

**Purpose**: Periodically generate and evaluate recommendations without user interaction.

**Design**:
```typescript
class RecommendationScheduler {
  private interval: NodeJS.Timer;

  start(intervalMs: number = 3600000) // Default: every hour
  stop()

  async runCycle(): Promise<void> {
    // 1. Generate recommendations for all active POVs
    // 2. Persist new recommendations to DB
    // 3. Auto-execute LOW risk recommendations (if enabled)
    // 4. Queue MEDIUM risk for user review
    // 5. Log cycle results
  }
}
```

**Integration point**: Start scheduler in `server.ts` alongside the agent execution engine.

### 2.2 — SLA Threshold Monitoring

**File**: `lib/services/mcp/sla-monitor.ts`

**Purpose**: Detect POV health issues proactively.

**Monitors**:
| Metric | Threshold | Action |
|--------|-----------|--------|
| Task stale > 7 days | Generate recommendation | Auto-comment reminder |
| Phase overdue | Generate recommendation | Notify owner |
| Team workload imbalance > 2x | Generate recommendation | Suggest reassignment |
| Agent execution failure rate > 30% | Generate recommendation | Alert admin |
| POV completion < 50% at phase midpoint | Generate recommendation | Risk escalation |

### 2.3 — Auto-Queue Configuration

**Database**: Add `AutomationPolicy` model or use POV metadata.

**Per-POV settings**:
```json
{
  "autoExecute": {
    "enabled": true,
    "maxRiskLevel": "LOW",
    "allowedActions": ["task.comment", "task.update"],
    "excludedActions": ["pov.create", "task.assign"],
    "dailyLimit": 20,
    "requiresDigest": true
  }
}
```

### 2.4 — Digest Notifications

After each auto-execution cycle, create a digest:
- What was auto-executed
- What's queued for review
- What was skipped and why
- Link to dashboard for review

---

## Phase 3: Autonomous Operation (1-2 weeks)

> **Goal**: Approval workflows, feedback loops, external service integration

### 3.1 — Approval Workflow

**For HIGH risk actions**:
1. Recommendation generated with risk assessment
2. Queued in `MCPWorkflowExecution` with status `AWAITING_APPROVAL`
3. Dashboard shows pending approvals with risk explanation
4. Manager approves/rejects with optional modifications
5. On approval: execute via action mapper
6. On rejection: record feedback, adjust future scoring

### 3.2 — Recommendation Scoring & Feedback Loop

**Track outcomes**:
```typescript
interface RecommendationOutcome {
  recommendationId: string;
  executionId: string;
  wasImplemented: boolean;
  wasSuccessful: boolean;
  actualTimeSaved: number;     // Measured, not estimated
  userSatisfaction: number;    // From feedback endpoint
  sideEffects: string[];       // Unexpected consequences
}
```

**Use outcomes to**:
- Adjust confidence scores for similar future recommendations
- Learn which recommendation types users actually accept
- Identify which auto-executions produce good results
- Prune recommendation types with consistently low acceptance

### 3.3 — External Service Triggers

**Connect to registered MCP services**:
| Trigger | Service | Action |
|---------|---------|--------|
| Task marked blocked | Sentry | Create issue with context |
| POV at risk | Notification service | Alert stakeholders |
| Recurring task pattern detected | paichart perform | Create template |
| Stale task detected | paichart perform | Auto-comment reminder |

### 3.4 — Cross-POV Pattern Detection

Detect patterns that span multiple POVs:
- Same task types failing across teams → systemic issue
- Phase bottleneck common to a region → process problem
- Resource overallocation → portfolio rebalancing needed

---

## Phase 4: Full Autonomy (Future — 2-4 weeks)

> **Goal**: Self-monitoring, self-correcting management agent

### 4.1 — Continuous Execution Loop

**Architecture**:
```
┌────────────────────────────────────────────────┐
│              Autonomous Manager Agent           │
│                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Monitor  │→ │ Analyze  │→ │   Execute    │ │
│  │ (SLA)    │  │ (Recs)   │  │ (Actions)    │ │
│  └──────────┘  └──────────┘  └──────────────┘ │
│       ↑                            ↓           │
│  ┌──────────┐                ┌──────────────┐ │
│  │  Learn   │← ────────── ← │   Report     │ │
│  │(Outcomes)│                │  (Digest)    │ │
│  └──────────┘                └──────────────┘ │
└────────────────────────────────────────────────┘
         ↕                           ↕
   External MCP Services      Dashboard UI
   (Sentry, notifications)    (Human oversight)
```

### 4.2 — The Manager Agent

An always-on agent that:
- Runs recommendation cycles on schedule
- Auto-executes within approved boundaries
- Escalates when confidence is low or risk is high
- Reports daily/weekly digests
- Learns from outcomes to improve over time
- Coordinates with external services for enriched context

**How it runs continuously**:
The agent execution engine already has a 10-second polling loop. The recommendation scheduler adds an hourly cycle. Together they form the continuous execution backbone. No new infrastructure needed — just a scheduler that periodically creates `AgentExecution` records with a "management review" template.

### 4.3 — Human-in-the-Loop Guardrails

Even at full autonomy, humans control:
- Which action types are auto-executable (per POV policy)
- Daily execution limits
- Risk threshold for auto-execution
- Emergency stop (disable automation per POV or globally)
- Override any recommendation or execution

---

## Implementation Priority Matrix

| Task | Phase | Effort | Impact | Priority | Status |
|------|-------|--------|--------|----------|--------|
| Action mapper service | P1 | 4h | HIGH | 🔴 Critical | ✅ Done |
| Fix implement endpoint | P1 | 3h | HIGH | 🔴 Critical | ✅ Done |
| Frontend real results | P1 | 2h | MEDIUM | 🟡 Important | ✅ Done |
| Recommendation generator rewrite | P1.5 | 6h | HIGH | 🔴 Critical | ✅ Done |
| Preview before execute | P1.5 | 4h | HIGH | 🔴 Critical | ✅ Done |
| Graduated execution modes | P1.5 | 3h | MEDIUM | 🟡 Important | ✅ Done |
| Recommendation scheduler | P2 | 6h | HIGH | 🟡 Important | |
| SLA threshold monitoring | P2 | 4h | HIGH | 🟡 Important | |
| Auto-queue config | P2 | 4h | MEDIUM | 🟡 Important | |
| Approval workflow | P3 | 8h | HIGH | 🟢 Strategic | |
| Feedback/scoring loop | P3 | 6h | HIGH | 🟢 Strategic | |
| External service triggers | P3 | 6h | MEDIUM | 🟢 Strategic | |
| Continuous manager agent | P4 | 2w | VERY HIGH | 🔵 Vision | |

---

## Value Progression

| Phase | Score | What Changes |
|-------|-------|-------------|
| ~~Current~~ | ~~7/10~~ | ~~Three disconnected systems, stub implement endpoint~~ |
| ~~Phase 1~~ | ~~7.5/10~~ | ~~Bridge works for DB-stored recommendations; base recs still hardcoded templates~~ |
| Phase 1.5 ✅ | 8.5/10 | Data-driven recs with specific actions, preview before execute, graduated execution |
| Phase 2 | 9/10 | Continuous monitoring, auto-queue for safe actions |
| Phase 3 | 9.3/10 | Approval workflows, feedback loops, external triggers |
| Phase 4 | 9.5/10 | Fully autonomous management with human guardrails |

---

## Key Files Reference

| Component | File |
|-----------|------|
| Implement endpoint (live) | `app/api/mcp/recommendations/[id]/implement/route.ts` |
| Preview endpoint (Phase 1.5) | `app/api/mcp/recommendations/[id]/preview/route.ts` |
| Action mapper | `lib/services/mcp/recommendation-action-mapper.ts` |
| Recommendation generator (Phase 1.5) | `app/api/mcp/recommendations/route.ts` |
| Service registration | `scripts/register-internal-services.ts` |
| Admin recommendations | `app/api/analytics/domains/admin/recommendations.ts` |
| Recommendation UI | `components/mcp/IntelligentTaskAutomation.tsx` |
| Agent execution engine | `lib/services/agentExecutionEngine.ts` |
| Service connection pool | `lib/mcp/server/utils/service-connection-pool.js` |
| Orchestration engine | `lib/services/workflow/core/orchestration-engine.js` |
| Perform action router | `lib/mcp/tasks/action/tasks-action-router.ts` |
| Hub tools handler | `lib/mcp/server/tools/hub-tools-handler.js` |
| Service call handler | `lib/mcp/server/tools/hub/service-call-handler.js` |
| Resilient call utility | `lib/mcp/server/utils/resilient-call.js` |
| Trust level determination | `lib/services/workflow/security/trust-level.js` |
| Recommendation DB model | `prisma/schema.prisma` (MCPRecommendation) |
| Agent execution DB model | `prisma/schema.prisma` (AgentExecution) |
| Workflow execution DB model | `prisma/schema.prisma` (MCPWorkflowExecution) |

---

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Auto-execution creates unintended changes | Risk levels + daily limits + emergency stop |
| Recommendation quality too low for automation | Start with LOW risk only, expand based on outcomes |
| External service costs from frequent calls | Rate limiting per service, budget caps |
| Feedback loop creates echo chamber | Periodic human review of scoring model |
| Scheduler adds server load | Configurable intervals, off-peak scheduling |
| Race conditions in concurrent execution | Existing atomic compare-and-swap pattern |

---

## Success Metrics

| Metric | Phase 1 ✅ | Phase 1.5 | Phase 2 | Phase 3 | Phase 4 |
|--------|-----------|-----------|---------|---------|---------|
| Recommendations executed/month | 10+ | 30+ | 50+ | 200+ | 500+ |
| Actions with real targets | 0 (templates) | 100% ✅ | 100% | 100% | 100% |
| Auto-execution success rate | N/A | N/A | 90%+ | 95%+ | 97%+ |
| Time saved per POV/week | 5min | 30min | 2h | 5h | 10h+ |
| User satisfaction (feedback) | 3/5 | 4/5 | 4.0/5 | 4.3/5 | 4.5/5 |
| Issues caught before user notice | 0 | 0 | 5/month | 20/month | 50/month |
