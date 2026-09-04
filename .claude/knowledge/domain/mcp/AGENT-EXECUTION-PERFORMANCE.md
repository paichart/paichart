# Agent Execution Performance System

> **Last Updated**: December 2025
> **Status**: Production - Active in Operations Tab
> **Confidence**: 95%

## Overview

The Agent Execution Performance system provides **real-time operational metrics** for agent executions, queue health, tool performance, and template reliability. It answers the question: **"How well are agents performing?"**

Previously part of Admin Intelligence, now consolidated in the **Operations tab** alongside Infrastructure Status.

## Architecture

### Core Files

| File | Purpose | Lines |
|------|---------|-------|
| `app/api/analytics/domains/admin/system-health.ts` | Backend handler - execution metrics | ~422 |
| `app/(authenticated)/dashboard/AdminRecommendationsTab.tsx` | Frontend component (ExecutionPerformanceSection) | ~320 |
| `lib/mcp/server/utils/execution-analytics.js` | Analytics engine - pattern detection | ~600+ |

### Data Flow

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Operations Tab     │────▶│  /api/analytics      │────▶│  ExecutionAnalytics │
│  (Dashboard)        │     │  ?domain=admin       │     │  + Prisma Queries   │
└─────────────────────┘     │  &metrics=system-health│   └─────────────────────┘
         │                  └──────────────────────┘             │
         │                           │                            │
         │                           ▼                            │
         │                  ┌──────────────────────┐              │
         │                  │ Data Sources:        │◀─────────────┘
         │                  │ - AgentExecution     │
         │                  │ - context.toolsUsed  │
         │                  │ - AgentTemplate      │
         │                  └──────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────┐     ┌──────────────────────┐
│  UI Components:     │◀────│  JSON Response       │
│  - Health Gauge     │     │  - summary           │
│  - Queue Health     │     │  - toolHealth[]      │
│  - Tool Health      │     │  - templateHealth[]  │
│  - Recommendations  │     │  - recommendations[] │
│  - Insights         │     │  - insights[]        │
└─────────────────────┘     └──────────────────────┘
```

## API: `/api/analytics?domain=admin&metrics=system-health`

### Endpoint

```
GET /api/analytics?domain=admin&metrics=system-health
Authorization: Required (JWT, Admin role)
```

### Response Schema

```typescript
interface SystemHealthResult {
  summary: {
    overallHealth: number;      // 0-100 weighted score
    agentSuccessRate: number;   // Percentage
    avgExecutionTime: number;   // Milliseconds
    activeExecutions: number;   // Currently running
    errorRate: number;          // Percentage
    lastUpdated: Date;
  };
  toolHealth: ToolHealth[];
  templateHealth: TemplateHealth[];
  queueHealth: QueueHealth;
  trends: Trend[];
  recommendations: SystemRecommendation[];
  insights: Insight[];
}
```

## Data Sources (All Real)

### 1. ExecutionAnalytics Engine

```typescript
const analytics = new ExecutionAnalytics({
  defaultTimeRange: '7d',
  analysisDepth: 'detailed',
  minExecutionsForTrends: 5,
  confidenceThreshold: 0.7
});

const patterns = await analytics.analyzeExecutionPatterns('7d');
// Returns: performance, trends, templates, insights, errorPatterns, recommendations
```

The ExecutionAnalytics class queries `prisma.agentExecution.findMany()` with comprehensive joins to task, agentTemplate, and artifacts.

### 2. Queue Health (3 Parallel Prisma Queries)

```typescript
const [pendingExecutions, runningExecutions, stuckExecutions] = await Promise.all([
  prisma.agentExecution.count({
    where: { status: 'PENDING', createdAt: { gte: sevenDaysAgo } }
  }),
  prisma.agentExecution.count({
    where: { status: 'RUNNING' }
  }),
  prisma.agentExecution.count({
    where: { status: 'RUNNING', startTime: { lt: thirtyMinutesAgo } }
  })
]);
```

### 3. Tool Health (Built from Execution Context)

```typescript
for (const exec of recentExecutions) {
  const tools = exec.context?.toolsUsed || [];
  const hasError = exec.status === 'FAILED';

  for (const tool of tools) {
    // Track: total, success, errors, durations, recentErrors
  }
}
```

## Health Score Calculation

The overall health score is a weighted algorithm:

```typescript
function calculateOverallHealth(successRate, errorRate, queueHealth, templateHealth) {
  const successWeight = 0.35;   // 35% - Agent success rate
  const errorWeight = 0.25;     // 25% - Inverse of error rate
  const queueWeight = 0.20;     // 20% - Queue health score
  const templateWeight = 0.20;  // 20% - Avg template performance

  // Success rate score (0-100)
  const successScore = successRate;

  // Error rate score (100 = no errors, 0 = 100% errors)
  const errorScore = Math.max(0, 100 - errorRate);

  // Queue health score
  let queueScore = 100;
  if (queueHealth.stuckExecutions > 0) {
    queueScore -= queueHealth.stuckExecutions * 10;
  }
  if (queueHealth.pendingExecutions > 10) {
    queueScore -= Math.min(20, (queueHealth.pendingExecutions - 10) * 2);
  }

  // Template health score (avg performance)
  const templateScore = templateHealth.length > 0
    ? templateHealth.reduce((sum, t) => sum + t.performanceScore, 0) / templateHealth.length
    : 100;

  return Math.round(
    (successScore * successWeight) +
    (errorScore * errorWeight) +
    (queueScore * queueWeight) +
    (templateScore * templateWeight)
  );
}
```

## Metrics Displayed

### Summary Cards

| Metric | Source | Description |
|--------|--------|-------------|
| **Overall Health** | Calculated | Weighted score 0-100 |
| **Success Rate** | ExecutionAnalytics | % of successful executions |
| **Avg Duration** | ExecutionAnalytics | Average execution time |
| **Active** | Prisma count | Currently running executions |
| **Error Rate** | ExecutionAnalytics | % of failed executions |
| **Queue Depth** | Prisma count | Pending + running |

### Queue Health

| Metric | Query | Threshold |
|--------|-------|-----------|
| **Pending** | `status='PENDING'` | Warning at >10 |
| **Running** | `status='RUNNING'` | Info only |
| **Stuck** | `status='RUNNING' AND startTime < 30min ago` | Critical if >0 |
| **Avg Wait** | Calculated from pending | In seconds |

### Tool Health

Built from `agentExecution.context.toolsUsed`:

| Field | Description |
|-------|-------------|
| `toolName` | Tool identifier |
| `totalExecutions` | Count (filtered to ≥5) |
| `successCount` | Successful uses |
| `errorCount` | Failed uses |
| `errorRate` | `(errors/total) * 100` |
| `avgDuration` | Average in ms |
| `recentErrors` | Last 5 error messages |
| `trend` | improving/declining/stable |

### Template Health

From ExecutionAnalytics:

| Field | Description |
|-------|-------------|
| `name` | Template name |
| `category` | Template category |
| `totalExecutions` | Usage count |
| `successRate` | % successful |
| `avgDuration` | Average time |
| `reliability` | Consistency score |
| `performanceScore` | Combined metric |

## Dynamic Recommendations

Recommendations are generated based on actual thresholds:

| Type | Trigger | Priority |
|------|---------|----------|
| `queue_health` | `stuckExecutions > 0` | CRITICAL |
| `queue_backlog` | `pendingExecutions > 20` | HIGH |
| `tool_performance` | `tool.errorRate > 30%` | HIGH |
| `tool_performance` | `tool.errorRate > 50%` | CRITICAL |
| From ExecutionAnalytics | Pattern analysis | Various |

```typescript
if (stuckExecutions > 0) {
  recommendations.unshift({
    type: 'queue_health',
    priority: 'critical',
    title: `${stuckExecutions} stuck executions detected`,
    description: `Executions running for over 30 minutes.`,
    suggestion: 'Review stuck executions and consider terminating or restarting them.'
  });
}
```

## UI Components

### ExecutionPerformanceSection

Located in `AdminRecommendationsTab.tsx`, exported for use in Operations tab:

```tsx
export function ExecutionPerformanceSection() {
  // Fetches from /api/analytics?domain=admin&metrics=system-health
  // Displays: Health gauge, queue health, tool health, template health,
  //           recommendations, insights
}
```

### Visual Elements

- **Health Gauge**: Color-coded score display (green >80, yellow >60, orange >40, red)
- **Queue Health Grid**: 4-column display of queue metrics
- **Tool Health List**: Clickable items with error rate badges and trend indicators
- **Template Health List**: Success rate badges
- **Recommendations**: Priority-colored cards with suggestions
- **Insights**: Positive/concern/neutral categorized cards

## Dependencies & Considerations

### 1. Tool Health Depends on `context.toolsUsed`

Tool health metrics require agent executions to populate `context.toolsUsed` array:

```typescript
const tools = exec.context?.toolsUsed || [];
```

**Impact**: If executions don't include this field, tool health will show empty.
**Mitigation**: System gracefully handles with empty array (no error).

### 2. ExecutionAnalytics Fallback

If the analytics engine fails, the system uses fallback empty patterns:

```typescript
try {
  patterns = await analytics.analyzeExecutionPatterns('7d');
} catch (error) {
  patterns = {
    performance: { successRate: 0, total: 0, failed: 0 },
    recommendations: { recommendations: [] },
    templates: { templates: [] },
    // ...
  };
}
```

**Impact**: Section shows minimal data if analytics fails.
**Mitigation**: Fallback prevents UI crash; logs warning for debugging.

### 3. Template Health Requires Template Associations

Template health requires `agentTemplate` to be associated with executions:

```typescript
include: {
  agentTemplate: {
    select: { id: true, name: true, category: true, promptText: true }
  }
}
```

**Impact**: If no templates are linked, template health shows empty.
**Mitigation**: Section gracefully hides when no data.

### 4. Minimum Executions for Trends

ExecutionAnalytics requires minimum executions before generating trends:

```typescript
if (executions.length < this.options.minExecutionsForTrends) {
  return this.createMinimalAnalysis(executions, range);
}
```

**Default**: 5 executions minimum.

## Tab Placement

### Current: Operations Tab

```
Operations Tab
├── Infrastructure Status ("Are the servers running?")
│   └── Server connectivity, tool counts, response times
│
└── Execution Performance ("How well are agents performing?")
    └── Success rates, queue health, tool health, templates
```

### Rationale for Operations Tab

| Aspect | Infrastructure | Execution Performance |
|--------|---------------|----------------------|
| Focus | Connectivity | Performance |
| Question | "Is it running?" | "Is it working well?" |
| Data | Server status | Execution metrics |
| Together | Complete operational picture |

## Comparison with Other Systems

| Aspect | Execution Performance | Portfolio Intelligence | MCP Tool |
|--------|----------------------|------------------------|----------|
| **Focus** | Agent operations | Business patterns | AI queries |
| **Audience** | Technical admins | Business admins | AI users |
| **Question** | "How are agents doing?" | "How is portfolio doing?" | "Get recommendations" |
| **Data** | AgentExecution | POV/Task | Hybrid |
| **Location** | Operations tab | Admin Intelligence | Claude Desktop |

## Performance Considerations

- **Cache**: ExecutionAnalytics has 5-minute cache
- **Parallel queries**: Queue health uses `Promise.all` for 3 counts
- **Limited results**: Tool health capped at 15, templates at 15
- **Stale time**: Frontend uses 5-minute staleTime

## Security

- **Authentication**: Required via JWT
- **Authorization**: Admin role required (enforced in unified router)
- **Data scope**: Cross-system visibility (admin-level access)

## Related Documentation

- `/.claude/knowledge/domain/mcp/TODO-autonomous-management-agent.md` - Recommendation engine (Phase 1.5 complete)
- `/.claude/knowledge/domain/mcp/PORTFOLIO-INTELLIGENCE.md` - Portfolio pattern detection
- `/cline_docs/dashboard-rationalization.md` - Dashboard consolidation plan
