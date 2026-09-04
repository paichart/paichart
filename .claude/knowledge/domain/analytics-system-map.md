# Analytics System Resource Map

**Purpose:** Comprehensive reference for all analytics-related resources grouped by domain.

**Last Updated:** 2025-12-13

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Analytics Page                               │
│  /app/(authenticated)/analytics/page.tsx                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ AnalyticsProvider (Context + URL Sync)                   │   │
│  │ ┌─────┬─────┬─────────┬─────────┬─────────┐             │   │
│  │ │Over-│Tasks│Insights │AI/Agents│Tools/ROI│  ← Tabs     │   │
│  │ │view │     │         │         │         │             │   │
│  │ └─────┴─────┴─────────┴─────────┴─────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              Unified Analytics Endpoint                          │
│  GET /api/analytics?domain=X&metrics=Y&metrics=Z                │
│  ┌─────────┬─────────┬─────────┬─────────┬─────────┐           │
│  │overview │ tasks   │ agents  │  team   │   mcp   │ ← Domains │
│  └─────────┴─────────┴─────────┴─────────┴─────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Unified Endpoint

| Resource | Path | Description |
|----------|------|-------------|
| **Main Route** | `/app/api/analytics/route.ts` | Consolidated endpoint with domain routing |
| **Query Schema** | `/lib/validation/task-validation.ts` | `UnifiedAnalyticsQuerySchema` |

**Query Parameters:**
- `domain`: overview | tasks | agents | team | mcp
- `metrics`: array (max 10) or 'all'
- `timeRange`: 7d | 30d | 90d | 1y
- `povId`: CUID (optional, 'all' for aggregate)
- `phaseId`, `teamId`, `toolId`: CUID filters

---

## Domain: Overview

**Purpose:** High-level KPIs and health metrics across all POVs.

### API
| Resource | Path |
|----------|------|
| Handler | `/app/api/analytics/domains/overview/index.ts` |
| Function | `handleOverviewDomain(params, user)` |

### Response Shape
```typescript
{
  data: {
    povCount: number;
    taskCompletionRate: number;      // "Project Health"
    agentSuccessRate: number;        // "AI Reliability"
    hoursSaved: number;              // "Automation ROI"
    povTrend: number;
    taskTrend: number;
    agentTrend: number;
    roiTrend: number;
  }
}
```

### Components
| Component | Path | Purpose |
|-----------|------|---------|
| OverviewTab | `/components/analytics/tabs/OverviewTab.tsx` | 4 metric cards + RiskDashboard |
| RiskDashboard | `/components/analytics/tabs/RiskDashboard.tsx` | Tasks at risk/blocked widget |
| MetricCard | `/components/analytics/core/MetricCard.tsx` | Reusable metric display |

### Hooks
| Hook | Path | Usage |
|------|------|-------|
| useOverviewAnalytics | `/components/analytics/hooks/useAnalyticsQuery.ts` | Fetches overview metrics |

---

## Domain: Tasks

**Purpose:** Task performance metrics, insights, and AI recommendations.

### API
| Resource | Path |
|----------|------|
| Handler | `/app/api/analytics/domains/tasks/index.ts` |
| Performance | `/app/api/analytics/domains/tasks/performance.ts` |
| Insights | `/app/api/analytics/domains/tasks/insights.ts` |

### Metrics Available
- `performance`: Completion rates, status distribution, trends
- `insights`: Risks, workload, bottlenecks, recommendations

### Response Shape - Performance
```typescript
{
  data: {
    performance: {
      summary: {
        totalTasks: number;
        completedTasks: number;
        completionRate: number;
        avgCompletionTime: number;
        onTimeRate: number;
        overdueTasks: number;
      };
      distribution: {
        byStatus: Array<{ status: string; _count: number }>;
        byPriority: Array<{ priority: string; _count: number }>;
        byType: Array<{ type: string; _count: number }>;
      };
      trends: { activityTrends: Array<...> };
      topPerformers: Array<...>;
    }
  }
}
```

### Response Shape - Insights
```typescript
{
  data: {
    insights: {
      summary: {
        tasksAtRisk: number;
        blockedTasks: number;
        productivityTrend: number;
        averageWorkload: number;
      };
      risks: {
        tasksAtRisk: Array<{ id, title, dueDate, status, assignee }>;
        blockedTasks: Array<{ id, title, status, assignee }>;
      };
      workload: {
        distribution: Array<{ assignee, activeTasks }>;
        imbalanceScore: number;
      };
      bottlenecks: Array<{ phase, incompleteTasks }>;
      recommendations: Array<{
        type: 'RISK_MITIGATION' | 'WORKLOAD_BALANCING' |
              'PRODUCTIVITY_IMPROVEMENT' | 'BOTTLENECK_RESOLUTION';
        priority: 'HIGH' | 'MEDIUM' | 'LOW';
        title: string;
        description: string;
        actionItems: string[];
      }>;
    }
  }
}
```

### Components
| Component | Path | Purpose |
|-----------|------|---------|
| InsightsTab | `/components/analytics/tabs/InsightsTab.tsx` | AI recommendations & risks |
| TaskMetricsCard | `/components/analytics/tabs/TaskMetricsCard.tsx` | Performance metrics card |
| RecommendationCard | `/components/analytics/core/RecommendationCard.tsx` | Styled recommendation display |
| NoRecommendationsCard | `/components/analytics/core/RecommendationCard.tsx` | Success state |

### Hooks
| Hook | Path | Usage |
|------|------|-------|
| useTaskInsights | `/components/analytics/hooks/useAnalyticsQuery.ts` | Fetches insights (requires POV) |
| useTaskPerformance | `/components/analytics/hooks/useAnalyticsQuery.ts` | Fetches performance metrics |
| useTaskAnalytics | `/components/analytics/hooks/useAnalyticsQuery.ts` | Both performance + insights |

### Types
| Type | Path |
|------|------|
| TaskInsightsResponse | `/components/analytics/hooks/useAnalyticsQuery.ts` |
| Recommendation | `/components/analytics/core/RecommendationCard.tsx` |
| RecommendationType | `/components/analytics/core/RecommendationCard.tsx` |
| RecommendationPriority | `/components/analytics/core/RecommendationCard.tsx` |

### Services
| Service | Path | Methods |
|---------|------|---------|
| TaskAnalyticsService | `/lib/services/taskAnalyticsService.ts` | getTaskPerformance, getTaskInsights, getTaskDistribution |

### Validation Schemas
| Schema | Path |
|--------|------|
| PerformanceResponseSchema | `/lib/validation/analytics-response.ts` |
| InsightsResponseSchema | `/lib/validation/analytics-response.ts` |

---

## Domain: Agents

**Purpose:** AI agent execution statistics and history.

### API
| Resource | Path |
|----------|------|
| Handler | `/app/api/analytics/domains/agents/index.ts` |
| Summary | `/app/api/analytics/domains/agents/summary.ts` |

### Response Shape
```typescript
{
  data: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    successRate: number;
    avgExecutionTime: number;
    executionsByStatus: Array<{ status: string; count: number }>;
    executionsByAgent: Array<{ agent: string; count: number }>;
    dailyTrends: Array<{ date: string; count: number }>;
    tokenUsage: { estimated: number };
    recentActivity: Array<...>;
  }
}
```

### Components
| Component | Path | Purpose |
|-----------|------|---------|
| AgentHistoryView | `/components/poveditor/pov/components/AgentHistoryView.tsx` | Execution timeline |

### Validation Schemas
| Schema | Path |
|--------|------|
| AgentExecutionsResponseSchema | `/lib/validation/analytics-response.ts` |

---

## Domain: Team

**Purpose:** Team activity metrics and collaboration analytics.

### API
| Resource | Path |
|----------|------|
| Handler | `/app/api/analytics/domains/team/index.ts` |
| Activity | `/app/api/analytics/domains/team/activity.ts` |

### Response Shape
```typescript
{
  data: {
    items: Array<{
      id: string;
      action: string;
      timestamp: string;
      user: { id, name, email };
      task: { id, title };
    }>;
    analytics: {
      byType: Array<{ type: string; count: number }>;
      byUser: Array<{ user: string; count: number }>;
      trends: Array<{ date: string; count: number }>;
    };
    pagination: { total, page, pageSize };
  }
}
```

### Components
| Component | Path | Purpose |
|-----------|------|---------|
| TaskActivityTimeline | `/components/tasks/TaskActivityTimeline.tsx` | Activity feed |

### Services
| Service | Path | Methods |
|---------|------|---------|
| TaskAnalyticsService | `/lib/services/taskAnalyticsService.ts` | getTeamPerformance |

---

## Domain: MCP — ❌ REMOVED 2026-06-24

> Removed with the Tools & ROI tab: the `domain=mcp` handler, `MCPAnalyticsQuerySchema`, the
> deprecated `/api/mcp/analytics` wrapper, and `MCPAnalyticsDashboard` are all deleted. MCP tool
> metrics live in **Operations** via `MCPToolDashboard` (`/api/mcp/metrics`). The shapes below are
> retained for history only.

**Purpose:** MCP tool performance, ROI metrics, and automation analytics.

### API
| Resource | Path |
|----------|------|
| Handler | `/app/api/analytics/domains/mcp/index.ts` |
| Query Schema | `/lib/validation/task-validation.ts` → MCPAnalyticsQuerySchema |

### Response Shape
```typescript
{
  data: {
    toolPerformance: Array<{
      toolId: string;
      toolName: string;
      executions: number;
      successRate: number;
      avgResponseTime: number;
    }>;
    roi: {
      timeSaved: {
        total: number;
        thisMonth: number;
        trend: number;
        breakdown: Array<{ tool: string; hours: number }>;
      };
      costReduction: number;
      productivityGain: number;
      errorReduction: number;
    };
    reliability: {
      uptime: number;
      errorRate: number;
      healthScore: number;
    };
  }
}
```

### Components
| Component | Path | Purpose |
|-----------|------|---------|
| MCPAnalyticsDashboard | `/components/admin/MCPAnalyticsDashboard.tsx` | Tool analytics dashboard |

---

## Shared Components

### Core Components (`/components/analytics/core/`)
| Component | Purpose |
|-----------|---------|
| MetricCard | Displays metric with title, value, icon, trend |
| AnalyticsCard | Basic card wrapper |
| RecommendationCard | Priority-styled recommendation with actions |
| NoRecommendationsCard | Green success state |
| ExportButton | Multi-format export (CSV, PDF, JSON) |

### Skeleton Components (`/components/analytics/core/MetricCardSkeleton.tsx`)
| Component | Purpose |
|-----------|---------|
| MetricCardSkeleton | Single card loading state |
| MetricGridSkeleton | Grid of skeleton cards |
| ContentSkeleton | Generic content area |
| InsightsSkeleton | Full insights tab skeleton |
| ChartSkeleton | Chart area skeleton |

---

## Context & State Management

| Resource | Path | Purpose |
|----------|------|---------|
| AnalyticsContext | `/components/analytics/AnalyticsContext.tsx` | Global state provider |
| AnalyticsProvider | `/components/analytics/AnalyticsContext.tsx` | Context wrapper |
| useAnalyticsContext | `/components/analytics/AnalyticsContext.tsx` | Hook to access state |
| POVSelector | `/components/analytics/POVSelector.tsx` | POV dropdown selector |

**State Shape:**
```typescript
{
  selectedPOVId: string | 'all';
  setSelectedPOVId: (id: string | 'all') => void;
  timeRange: string;
  setTimeRange: (range: string) => void;
}
```

---

## Unified Hooks (`/components/analytics/hooks/`)

| Hook | Purpose | Returns |
|------|---------|---------|
| useAnalyticsQuery<T> | Generic analytics fetching with Zod validation | UseQueryResult<T> |
| useOverviewAnalytics | Overview metrics | UseQueryResult<OverviewMetrics> |
| useTaskInsights | Task insights (requires POV) | UseQueryResult<TaskInsightsResponse> |
| useTaskPerformance | Task performance metrics | UseQueryResult<unknown> |
| useTaskAnalytics | Both performance + insights | UseQueryResult<unknown> |

---

## Module Exports

**Top-Level Import:**
```typescript
import {
  // Components
  MetricCard,
  AnalyticsCard,
  RecommendationCard,
  NoRecommendationsCard,
  MetricCardSkeleton,
  MetricGridSkeleton,
  InsightsSkeleton,
  ExportButton,

  // Hooks
  useAnalyticsQuery,
  useOverviewAnalytics,
  useTaskInsights,
  useTaskPerformance,
  useTaskAnalytics,

  // Context
  AnalyticsProvider,
  useAnalyticsContext,

  // Types
  type AnalyticsDomain,
  type TimeRange,
  type TaskInsightsResponse,
  type Recommendation,
} from '@/components/analytics';
```

---

## POV Editor Integration

| Resource | Path | Purpose |
|----------|------|---------|
| AnalyticsSection | `/components/poveditor/pov/sections/AnalyticsSection.tsx` | Embedded POV analytics |

**Features:**
- Task completion metrics (from local state)
- Team activity metrics (from local state)
- Timeline status calculation
- Health & Risk indicators (API-powered)
- AI Recommendations (shared RecommendationCard)
- Recent Team Activity feed
- Agent Activity history

---

## Database Query Summary

| Domain | Parallel Queries | Key Tables |
|--------|-----------------|------------|
| Overview | 6 | POV, Task, AgentExecution |
| Tasks/Performance | 15 | Task, TaskActivity |
| Tasks/Insights | 9 | Task, Phase, User |
| Team | 5 | Activity, User, Task |
| Agents | 1 | AgentExecution |
| MCP | 1 | MCPInteraction, MCPTool |

---

## Security Features

1. **Rate Limiting**: 200 req/min
2. **Authentication**: requireAuth middleware
3. **Input Validation**: Zod schemas
4. **POV Access Control**: validatePOVAccess
5. **CUID Enforcement**: All ID fields
6. **Enum Validation**: domain, timeRange, status
7. **Array Constraints**: max 10 metrics
8. **String Constraints**: max 50 chars
9. **Error Sanitization**: No data leakage
10. **Multi-tenant Isolation**: Cross-POV filtering

---

## Related Documentation

- Endpoint Consolidation: `/cline_docs/reviews/endpoint-consolidation-*/`
- UI Refactoring Plan: `/.claude/plans/parallel-riding-lecun.md`
- Response Schemas: `/lib/validation/analytics-response.ts`
