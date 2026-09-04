# Portfolio Intelligence System

> **Last Updated**: January 2026
> **Status**: Production - Active in Admin Intelligence Tab
> **Confidence**: 95%

## Overview

The Portfolio Intelligence system provides **admin-level portfolio-wide pattern detection** across all POVs, tasks, agents, and teams. It generates **14 distinct recommendation types** based on real-time database analysis, designed for executive oversight and strategic decision-making.

**Recommendation Categories:**
- **Source Data Recommendations (1-8)**: Analyze POVs, tasks, agents, templates directly
- **Activity-Based Recommendations (9-14)**: Analyze TaskActivity patterns for temporal insights (Phase 7)

## Architecture

### Core Files

| File | Purpose | Lines |
|------|---------|-------|
| `app/api/analytics/domains/admin/recommendations.ts` | Main engine - 14 recommendation types | ~850 |
| `app/(authenticated)/dashboard/AdminRecommendationsTab.tsx` | Frontend display (PortfolioIntelligenceSection) | ~1550 |

### Data Flow

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Admin Dashboard    │────▶│  /api/analytics      │────▶│  Prisma Queries     │
│  (Admin Intelligence)│     │  ?domain=admin       │     │  (7 parallel)       │
└─────────────────────┘     │  &metrics=recommendations│   └─────────────────────┘
         │                  └──────────────────────┘             │
         │                           │                            │
         │                           ▼                            │
         │                  ┌──────────────────────┐              │
         │                  │ 14 Pattern Analyzers │◀─────────────┘
         │                  │ SOURCE DATA (1-8):   │
         │                  │ - Portfolio Risk     │
         │                  │ - Phase Bottleneck   │
         │                  │ - Resource Allocation│
         │                  │ - Tool Performance   │
         │                  │ - Team Efficiency    │
         │                  │ - Template Opt       │
         │                  │ - Geographic Insight │
         │                  │ - Cross-POV Pattern  │
         │                  │ ACTIVITY-BASED (9-14):│
         │                  │ - Stale Task Detection│
         │                  │ - Activity Bottleneck│
         │                  │ - Assignment Volatility│
         │                  │ - Comment Heavy Tasks│
         │                  │ - Agent Retry Pattern│
         │                  │ - Rapid Status Cycling│
         │                  └──────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────┐     ┌──────────────────────┐
│  Portfolio          │◀────│  JSON Response       │
│  Intelligence       │     │  - recommendations[] │
│  Section            │     │  - summary           │
└─────────────────────┘     │  - generatedAt       │
                            └──────────────────────┘
```

## API: `/api/analytics?domain=admin&metrics=recommendations`

### Endpoint

```
GET /api/analytics?domain=admin&metrics=recommendations
Authorization: Required (JWT, Admin role)
```

### Response Schema

```typescript
{
  data: {
    recommendations: AdminRecommendation[];
    summary: {
      total: number;
      byPriority: { priority: string; count: number }[];
      byType: { type: string; count: number }[];
    };
    generatedAt: Date;
  }
}
```

### AdminRecommendation Interface

```typescript
interface AdminRecommendation {
  id: string;                    // e.g., 'admin-rec-portfolio-risk-1703...'
  type: AdminRecommendationType; // 14 types (see below)
  priority: RecommendationPriority; // CRITICAL | HIGH | MEDIUM | LOW
  title: string;
  description: string;
  actionItems: string[];         // 4 specific action items
  scope: 'PORTFOLIO' | 'REGIONAL' | 'TEAM' | 'SYSTEM';
  affectedCount: number;
  affectedEntities?: {
    id: string;
    title: string;
    type: string;
  }[];
  metrics?: {
    current: number;
    threshold: number;
    trend?: 'improving' | 'declining' | 'stable';
  };
  generatedAt: Date;
}
```

## Data Collection Pipeline

Executes **7 parallel Prisma queries** to gather portfolio-wide context (follows [parallel-query-optimization-pattern](/.claude/knowledge/patterns/parallel-query-optimization-pattern.md)):

```typescript
const [
  activePOVs,        // POVs in IN_PROGRESS, STALLED, VALIDATION
  allTasks,          // All open/in-progress/blocked tasks (includes title)
  agentExecutions,   // Last 7 days of executions
  teamWorkload,      // Tasks grouped by assignee
  templates,         // Agent templates with usage counts
  // Phase 7: Activity-based recommendation queries
  activityPatterns,  // Grouped by task + action (last 14 days)
  recentActivities   // Last 24 hours for rapid cycling detection
] = await Promise.all([
  prisma.pOV.findMany({
    where: { status: { in: ['IN_PROGRESS', 'STALLED', 'VALIDATION'] } },
    include: { phases: { include: { tasks } }, owner }
  }),
  prisma.task.findMany({
    where: { status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } },
    select: { id, title, status, assigneeId, povId }
  }),
  prisma.agentExecution.findMany({
    where: { startTime: { gte: 7_days_ago } }
  }),
  prisma.task.groupBy({
    by: ['assigneeId'],
    where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
    _count: { id: true }
  }),
  prisma.agentTemplate.findMany({
    select: { id, name, category, _count: { select: { tasks } } }
  }),
  // Activity patterns for temporal analysis
  prisma.taskActivity.groupBy({
    by: ['taskId', 'action'],
    where: { timestamp: { gte: 14_days_ago } },
    _count: { id: true },
    _max: { timestamp: true }
  }),
  // Recent activities for rapid cycling detection
  prisma.taskActivity.findMany({
    where: {
      action: { in: ['STATUS_CHANGED', 'ASSIGNED', 'AGENT_EXECUTED'] },
      timestamp: { gte: 24_hours_ago }
    },
    select: { taskId, action, timestamp },
    take: 5000  // Performance limit
  })
]);
```

## The 14 Recommendation Types

### Source Data Recommendations (1-8)

### 1. PORTFOLIO_RISK

**Trigger**: > 3 POVs with overdue tasks
**Scope**: PORTFOLIO
**Priority**: CRITICAL (>5 POVs) or HIGH

```typescript
const atRiskPOVs = activePOVs.filter(pov => {
  const overdueTasks = pov.phases.flatMap(p => p.tasks).filter(t =>
    t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED'
  );
  return overdueTasks.length > 0;
});

if (atRiskPOVs.length > 3) {
  // Generate recommendation with:
  // - List of affected POVs
  // - Action items for review and resource reallocation
}
```

**Action Items**:
- Review the most critical POVs
- Identify common blockers across at-risk POVs
- Consider reallocating resources to critical POVs
- Schedule stakeholder reviews for high-risk deliverables

### 2. PHASE_BOTTLENECK

**Trigger**: > 5 POVs stuck on same phase type
**Scope**: PORTFOLIO
**Priority**: CRITICAL (≥8 POVs) or HIGH

Detects when a specific phase (e.g., "Implementation", "Testing") is blocking multiple POVs simultaneously, indicating a systemic issue.

**Action Items**:
- Investigate why the phase is consistently slow
- Consider adding dedicated resources
- Review phase requirements for simplification
- Create phase-specific playbooks or templates

### 3. RESOURCE_ALLOCATION

**Trigger**: Max workload > 1.5x average workload
**Scope**: TEAM
**Priority**: CRITICAL (>2x) or HIGH

```typescript
const avgWorkload = workloads.reduce((a, b) => a + b, 0) / workloads.length;
const maxWorkload = Math.max(...workloads);

if (maxWorkload > avgWorkload * 1.5) {
  // Generate recommendation for workload rebalancing
}
```

**Action Items**:
- Redistribute tasks from overloaded team members
- Review task assignments for upcoming sprints
- Consider skill-based task routing
- Implement workload visibility in standups

### 4. TOOL_PERFORMANCE

**Trigger**: Any tool with error rate > 30%
**Scope**: SYSTEM
**Priority**: CRITICAL (>50%) or HIGH

Analyzes agent execution logs to identify MCP tools with high failure rates.

```typescript
for (const exec of agentExecutions) {
  const tools = exec.context?.toolsUsed || [];
  const hasError = exec.status === 'FAILED';

  for (const tool of tools) {
    // Track tool success/failure rates
  }
}

// Flag tools with >30% error rate
```

**Action Items**:
- Review error logs for failing tools
- Check for API rate limits or authentication issues
- Consider implementing retry logic or fallbacks
- Update tool configuration or credentials

### 5. TEAM_EFFICIENCY

**Trigger**: Completion rate variance > 2x between POVs
**Scope**: PORTFOLIO
**Priority**: MEDIUM

Compares POV completion rates to identify high performers and opportunities for knowledge sharing.

```typescript
const povCompletionRates = activePOVs.map(pov => {
  const allTasks = pov.phases.flatMap(p => p.tasks);
  const completed = allTasks.filter(t => t.status === 'COMPLETED').length;
  return {
    pov,
    rate: allTasks.length > 0 ? (completed / allTasks.length) * 100 : 0
  };
});

if (maxRate > minRate * 2) {
  // Generate best-practices sharing recommendation
}
```

**Action Items**:
- Analyze practices from top-performing POVs
- Identify blockers in low-performing POVs
- Share best practices across teams
- Consider pairing high and low performers

### 6. TEMPLATE_OPTIMIZATION

**Trigger**: Templates with < 3 usages (unused templates > 5)
**Scope**: SYSTEM
**Priority**: LOW

Identifies unused or underutilized agent templates for potential cleanup.

**Action Items**:
- Review unused templates for potential archival
- Consolidate similar templates
- Promote useful templates to increase adoption
- Document template use cases for team awareness

### 7. GEOGRAPHIC_INSIGHT

**Trigger**: Regional health variance > 30%
**Scope**: REGIONAL
**Priority**: MEDIUM

Analyzes POV performance by sales theatre (AMERICAS, EMEA, APAC, etc.) to detect regional patterns.

```typescript
const theatreGroups = new Map<string, { povs[], overdueCount }>();

for (const pov of activePOVs) {
  const theatre = pov.salesTheatre || 'UNKNOWN';
  // Group and analyze by region
}

if (worstTheatre.overdueRate > bestTheatre.overdueRate * 1.5) {
  // Generate regional insight recommendation
}
```

**Action Items**:
- Investigate regional challenges
- Share best practices from better-performing regions
- Consider timezone or resource availability factors
- Review regional support and tooling parity

### 8. CROSS_POV_PATTERN

**Trigger**: > 3 POVs with blocked tasks
**Scope**: PORTFOLIO
**Priority**: HIGH (>5 POVs) or MEDIUM

Detects when multiple POVs share blocking patterns, suggesting common dependencies.

**Action Items**:
- Identify common blockers across POVs
- Escalate shared dependencies to leadership
- Create a blocker resolution task force
- Implement blocker tracking and alerts

---

### Activity-Based Recommendations (9-14) - Phase 7

These recommendations analyze **TaskActivity patterns** to detect temporal issues that source data alone cannot reveal. All use MEDIUM priority to avoid alert fatigue.

### 9. STALE_TASK_DETECTION

**Trigger**: 5+ tasks with no activity in 7+ days
**Scope**: PORTFOLIO
**Priority**: MEDIUM
**Data Source**: `activityPatterns` grouped by `_max.timestamp`

Detects open tasks that have gone silent, potentially forgotten or stuck without status update.

```typescript
const staleTasks = allTasks.filter(task => {
  const taskPatterns = taskActivityCounts.get(task.id);
  if (!taskPatterns) return true; // No activity at all

  let mostRecentActivity = null;
  for (const [, data] of taskPatterns) {
    if (data.lastActivity > mostRecentActivity) {
      mostRecentActivity = data.lastActivity;
    }
  }
  return !mostRecentActivity || mostRecentActivity < sevenDaysAgo;
});
```

**Action Items**:
- Review stale tasks for hidden blockers or dependencies
- Contact assignees to check task status
- Consider reassigning abandoned tasks
- Set up automated stale task alerts for future prevention

### 10. ACTIVITY_BOTTLENECK

**Trigger**: 3+ tasks with 5+ status changes
**Scope**: PORTFOLIO
**Priority**: MEDIUM
**Data Source**: `activityPatterns` counting `STATUS_CHANGED` per task

Detects tasks exhibiting "churn" - excessive status changes indicating unclear requirements or scope creep.

**Action Items**:
- Review requirements clarity for churning tasks
- Check for scope creep or changing priorities
- Consider breaking large tasks into smaller units
- Investigate if status definitions are understood by team

### 11. ASSIGNMENT_VOLATILITY

**Trigger**: 2+ tasks reassigned 3+ times
**Scope**: TEAM
**Priority**: MEDIUM
**Data Source**: `activityPatterns` counting `ASSIGNED` per task

Detects tasks with frequent ownership changes, indicating unclear assignment criteria or capacity issues.

**Action Items**:
- Review task assignment criteria and processes
- Check if skills match task requirements
- Consider workload balancing before assignment
- Establish clearer task ownership guidelines

### 12. COMMENT_HEAVY_TASKS

**Trigger**: 2+ tasks with 10+ comments
**Scope**: PORTFOLIO
**Priority**: MEDIUM
**Data Source**: `activityPatterns` counting `COMMENT_ADDED` per task

Detects tasks with excessive discussion, often indicating unclear requirements or need for synchronous resolution.

**Action Items**:
- Schedule brief meetings for heavily discussed tasks
- Review if task requirements need clarification
- Consider breaking complex tasks into subtasks
- Check if escalation to stakeholders is needed

### 13. AGENT_RETRY_PATTERN

**Trigger**: 2+ tasks with 3+ agent executions
**Scope**: SYSTEM
**Priority**: MEDIUM
**Data Source**: `activityPatterns` counting `AGENT_EXECUTED` per task

Detects tasks where agents are being re-executed repeatedly, suggesting failing automation or unclear prompts.

**Action Items**:
- Review agent execution logs for failure patterns
- Check if task prompts are clear and actionable
- Consider if tasks are appropriate for agent automation
- Investigate specific agent tool failures

### 14. RAPID_STATUS_CYCLING

**Trigger**: 1+ tasks with 3+ status changes in 24 hours
**Scope**: PORTFOLIO
**Priority**: MEDIUM
**Data Source**: `recentActivities` timestamp analysis

Detects tasks experiencing rapid back-and-forth status changes, requiring immediate attention.

```typescript
const rapidCyclingTasks = new Map<string, number>();
for (const activity of recentActivities) {
  if (activity.action === 'STATUS_CHANGED') {
    const count = rapidCyclingTasks.get(activity.taskId) || 0;
    rapidCyclingTasks.set(activity.taskId, count + 1);
  }
}
const rapidCyclers = [...rapidCyclingTasks.entries()]
  .filter(([, count]) => count >= 3);
```

**Action Items**:
- Contact task owners immediately for clarification
- Review if workflow process is understood
- Check for external blockers causing back-and-forth
- Consider task scope or requirement issues

## Priority System

| Priority | Typical Triggers | Response Time |
|----------|-----------------|---------------|
| **CRITICAL** | >5 at-risk POVs, >50% tool errors, 2x workload imbalance | Immediate |
| **HIGH** | 3-5 at-risk items, >30% tool errors, 1.5x imbalance | This week |
| **MEDIUM** | Efficiency gaps, regional variance, cross-POV patterns | This sprint |
| **LOW** | Template cleanup, optimization opportunities | Backlog |

## Scope Categories

| Scope | Description | Affected By |
|-------|-------------|-------------|
| **PORTFOLIO** | Entire portfolio health | Risk, bottleneck, efficiency, cross-POV |
| **REGIONAL** | Specific sales theatre | Geographic insights |
| **TEAM** | Team workload/efficiency | Resource allocation |
| **SYSTEM** | Tools and templates | Tool performance, template optimization |

## Frontend Display

### PortfolioIntelligenceSection

Located in `AdminRecommendationsTab.tsx`, displays:

- **Priority badges** (CRITICAL, HIGH, MEDIUM, LOW)
- **Type icons** per recommendation type
- **Affected entities** list with links
- **Metrics visualization** (current vs threshold)
- **Action items** as checklist

## Comparison with Other Sources

| Aspect | Portfolio Intelligence | IntelligentTaskAutomation | MCP Tool |
|--------|----------------------|---------------------------|----------|
| **Focus** | Portfolio-wide patterns | Individual task/POV optimization | Conversational AI queries |
| **Scope** | Admin oversight | Actionable automation | On-demand analysis |
| **Audience** | Executives, admins | End users | Claude Desktop/ChatGPT |
| **Rec Types** | 14 strategic types (8 source + 6 activity) | 5 operational types | 6 analysis types |
| **Actions** | High-level action items | One-click implement | Via perform(action: "execute") |
| **Priority** | CRITICAL to MEDIUM | Impact/Effort matrix | Confidence score |

## Key Differences from Other Recommendation Sources

1. **Strategic vs Tactical**: Portfolio Intelligence provides executive-level insights, while IntelligentTaskAutomation provides actionable task automation.

2. **Scope**: Analyzes ALL active POVs simultaneously rather than individual task/POV context.

3. **Pattern Detection**: Identifies cross-POV patterns (bottlenecks, blockers) that single-POV analysis would miss.

4. **Trigger-Based**: Each recommendation type has specific thresholds that must be met before generating.

## Security

- **Authentication**: Required via JWT
- **Authorization**: Admin/SuperAdmin role required
- **Data Access**: Queries all active POVs (no user filtering - admin view)

## Performance Considerations

- **7 parallel queries** via `Promise.all` (follows [parallel-query-optimization-pattern](/.claude/knowledge/patterns/parallel-query-optimization-pattern.md))
- **In-memory analysis** for pattern detection
- **No caching** (real-time data analysis)
- **Limited includes** (only necessary relations)
- **Activity query limits**: `take: 5000` for recent activities, `groupBy` for aggregations

## TaskActivity Integration (Phase 7 - Implemented)

> **Status**: PRODUCTION (January 2026)
> **Implementation**: Phase 7 of Rich Task Activity Details

### Data Sources

The Portfolio Intelligence system now queries **both source data AND activity data**:

**Source Data (Recommendations 1-8):**
- POVs with phases and tasks
- Agent executions (last 7 days)
- Team workload (tasks by assignee)
- Agent templates

**Activity Data (Recommendations 9-14):**
- `activityPatterns`: TaskActivity grouped by task + action (last 14 days)
- `recentActivities`: Recent activities for rapid cycling detection (last 24 hours)

### Activity-Based Pattern Detection

Activity data enables **time-based pattern detection** that source data alone cannot provide:

| Type | Trigger | Data Source |
|------|---------|-------------|
| **STALE_TASK_DETECTION** | 5+ tasks with no activity in 7+ days | `_max.timestamp` comparison |
| **ACTIVITY_BOTTLENECK** | 3+ tasks with 5+ status changes | `STATUS_CHANGED` count |
| **ASSIGNMENT_VOLATILITY** | 2+ tasks reassigned 3+ times | `ASSIGNED` count |
| **COMMENT_HEAVY_TASKS** | 2+ tasks with 10+ comments | `COMMENT_ADDED` count |
| **AGENT_RETRY_PATTERN** | 2+ tasks with 3+ agent executions | `AGENT_EXECUTED` count |
| **RAPID_STATUS_CYCLING** | 1+ tasks with 3+ status changes in 24h | Timestamp analysis |

### Performance Optimizations

Activity queries follow the [parallel-query-optimization-pattern](/.claude/knowledge/patterns/parallel-query-optimization-pattern.md):

- **`groupBy`** for aggregation (efficient, no N+1)
- **`take: 5000`** limit on recent activities (performance safety)
- **`taskTitleMap`** for O(1) title lookups (no extra queries)
- All 7 queries run in parallel via `Promise.all`

### Implementation Reference

See: `/cline_docs/reviews/task-activity-rich-details-2025-12-31/implementation-plan.md` for full implementation history.

## Related Documentation

- `/.claude/knowledge/domain/mcp/TODO-autonomous-management-agent.md` - Recommendation engine (Phase 1.5 complete)
- `/cline_docs/dashboard-rationalization.md` - Dashboard consolidation plan
