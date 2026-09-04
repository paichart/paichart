# MCP Workflow System

> **Last Updated**: 2026-01-08
> **Status**: Production - Orchestration + Performance Stats Complete
> **Confidence**: 92%

## Overview

The MCP Workflow System provides **workflow orchestration and execution tracking** for the pAIchart MCP Hub. It enables multi-service workflows, performance monitoring, and execution history tracking.

**Key Capabilities:**
- Plugin-based workflow engine with handler registration
- 3 orchestration modes (sequential, parallel, conditional)
- Execution tracking with MCPWorkflowExecution model
- Performance statistics with recommendations
- Task activity integration (WORKFLOW_EXECUTED action type)
- POV-scoped workflows for multi-tenant isolation

## Architecture

### Data Flow

```
┌─────────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
│  Workflow Handlers      │────▶│  WorkflowEngine          │────▶│  MCPWorkflowExecution   │
│  (orchestration, etc.)  │     │  (singleton, plugins)    │     │  (tracking DB)          │
└─────────────────────────┘     └──────────────────────────┘     └─────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
│  Performance Stats      │◀────│  HubToolsHandler         │◀────│  get_hub_performance_   │
│  (cache, workflows)     │     │  (getHubPerformanceStats)│     │  stats tool             │
└─────────────────────────┘     └──────────────────────────┘     └─────────────────────────┘
```

### Core Files

| Layer | File | Purpose |
|-------|------|---------|
| **Schema** | `prisma/schema.prisma` | MCPWorkflow, MCPWorkflowExecution models |
| **Engine** | `lib/services/workflow/workflowEngine.ts` | Core orchestration engine |
| **Types** | `lib/services/workflow/types/orchestration-params.ts` | Zod schemas for orchestration |
| **Context** | `lib/services/workflow/types/orchestration-context.ts` | Execution context types |
| **Security** | `lib/services/workflow/security/orchestration-audit.ts` | Audit logging |
| **Tracking** | `lib/services/workflow/tracking/orchestration-tracker.ts` | Execution tracking |
| **Validation** | `lib/validation/workflow-validation.ts` | Input validation schemas |
| **Hub Tools** | `lib/mcp/server/tools/hub-tools-handler.js` | Performance stats API |

## Schema

### MCPWorkflow Model (Saved Workflows)

```prisma
model MCPWorkflow {
  id              String            @id @default(cuid())
  name            String
  description     String?
  toolId          String

  // Workflow Configuration
  steps           Json              // Workflow steps and configuration
  triggers        Json              // Workflow triggers and conditions
  schedule        Json?             // Scheduled execution configuration

  // Execution State
  status          MCPWorkflowStatus @default(ACTIVE)
  lastExecution   DateTime?
  nextExecution   DateTime?
  executionCount  Int               @default(0)

  // Performance Metrics
  successRate     Float?
  averageTime     Float?
  errorRate       Float?

  // Relationships
  tool            MCPTool           @relation(...)
  executions      MCPWorkflowExecution[]
}
```

### MCPWorkflowExecution Model (Execution History)

```prisma
model MCPWorkflowExecution {
  id              String            @id @default(cuid())

  // Workflow Reference (optional for ad-hoc)
  workflowId      String?           // NULLABLE for ad-hoc executions

  // Execution Identity
  userId          String            // Who triggered execution (REQUIRED)
  povId           String?           // POV scope (optional)
  executionMode   MCPExecutionMode  @default(AD_HOC)
  workflowType    String?           // e.g., 'mcp_service_orchestration'

  // Execution Details
  status          MCPWorkflowExecutionStatus @default(RUNNING)
  startTime       DateTime          @default(now())
  endTime         DateTime?
  duration        Int?              // Duration in ms

  // Execution Data
  input           Json?             // Input parameters
  output          Json?             // Execution results
  steps           Json?             // Step execution details
  metadata        Json?             // Additional context

  // Error Handling
  error           String?           // Error message if failed
  failedStep      String?           // Step that failed

  // Relationships
  workflow        MCPWorkflow?      @relation(...)
  user            User              @relation(...)
  pov             POV?              @relation(...)
}
```

### Enums

```prisma
enum MCPWorkflowStatus {
  ACTIVE
  PAUSED
  DISABLED
  ERROR
}

enum MCPWorkflowExecutionStatus {
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
  TIMEOUT
}

enum MCPExecutionMode {
  PREDEFINED    // Execution of a saved MCPWorkflow
  AD_HOC        // On-demand orchestration without saved workflow
}
```

## Workflow Types

### Supported Workflow Types

| Type | Mode | Description |
|------|------|-------------|
| `mcp_service_orchestration` | Sequential/Parallel | Multi-service workflow orchestration |
| `parallel_service_execution` | Parallel | Concurrent service calls |
| `conditional_workflow` | Conditional | Branch-based workflow execution |
| `browser_automation` | Sequential | Puppeteer browser automation |

### Orchestration Parameters Schema

```typescript
// WorkflowStep - A single step in an orchestration
{
  service: string;          // Service name or ID
  tool: string;             // Tool to invoke
  arguments: Record<string, unknown>;  // Tool arguments
  dependsOn?: number[];     // Step dependencies
  timeout?: number;         // Step timeout (1s-60s)
}

// MCPOrchestrationParams - Complete orchestration config
{
  steps: WorkflowStep[];              // 1-20 steps
  executionMode: 'sequential' | 'parallel' | 'conditional';
  failureStrategy: 'stop' | 'continue' | 'rollback';
  timeout: number;                     // 1s-5min (default 60s)
}
```

## Workflow Engine

### Plugin Registration

```typescript
import { WorkflowEngine } from '@/lib/services/workflow/workflowEngine';

// Get singleton instance
const engine = WorkflowEngine.getInstance();

// Register a custom handler
engine.registerHandler({
  handlerType: 'my_handler',
  supportedWorkflowTypes: ['my_workflow_type'],

  async execute(config, userId) {
    // Implementation
    return {
      success: true,
      workflowId: 'wf_...',
      status: 'SUCCESS',
      data: { /* results */ }
    };
  },

  getCapabilities() {
    return {
      name: 'My Handler',
      description: 'Custom workflow handler',
      supportedTypes: ['my_workflow_type'],
      version: '1.0.0'
    };
  }
});
```

### Execution Flow

```
1. Client calls workflow execution API
2. WorkflowEngine selects appropriate handler
3. Handler validates configuration
4. Handler executes workflow steps
5. MCPWorkflowExecution record created/updated
6. Activity logged to TaskActivity (if taskId provided)
7. Result returned to client
```

## Performance Statistics

### Workflow Performance Metrics

```typescript
{
  // Cache performance
  discovery: {
    size: number;
    maxSize: number;
    timeout: number;
    hits: number;
    misses: number;
    evictions: number;
    invalidations: number;
    hitRate: string;         // e.g., "85.5%"
  },

  health: {
    size: number;
    ttl: number;
    hits: number;
    misses: number;
    realtimeBypass: number;
    hitRate: string;
  },

  connectionPool: {
    active: number;
    idle: number;
    total: number;
    reuseRate: string;
  },

  // Workflow metrics (NEW 2026-01-05)
  workflow: {
    last24Hours: {
      total: number;
      completed: number;
      failed: number;
      running: number;
      successRate: string;   // e.g., "95.0%"
    },
    performance: {
      avgDurationMs: number | null;
    },
    byType: {
      [workflowType: string]: number;
    }
  },

  // Overall system health
  overallPerformance: {
    cacheEfficiency: string;     // Average hit rate
    connectionHealth: string;    // Pool reuse rate
    systemStatus: 'healthy' | 'degraded';
  },

  // Actionable recommendations
  recommendations: [
    {
      area: 'discovery_cache' | 'health_cache' | 'connection_pool' | 'workflow_execution' | 'overall';
      priority: 'high' | 'medium' | 'info';
      message: string;
      metric: string | number | null;
    }
  ],

  timestamp: string;  // ISO 8601
}
```

### Recommendation Thresholds

| Area | High Priority | Medium Priority |
|------|---------------|-----------------|
| Discovery Cache | Hit rate < 50% | Hit rate < 75% |
| Health Cache | Hit rate < 50% | - |
| Connection Pool | - | Reuse rate < 30% |
| Workflow Execution | Success rate < 80% | > 10 running |

## Integration Points

### Task Activity Integration

Workflow executions are logged to the Task Activity System when a `taskId` is provided:

```typescript
// In workflowEngine.ts
import { logWorkflowExecution } from '@/lib/tasks/services/taskActivityService';

// After workflow completion
if (config.taskId) {
  logWorkflowExecution(config.taskId, userId, {
    workflowId,
    workflowType: config.workflowType,
    status: result.success ? 'SUCCESS' : 'FAILED',
    stepCount: result.data?.summary?.total,
    executionTime: result.executionTime,
  });
}
```

**Activity Details Schema:**
```typescript
{
  workflowId: string;           // MCPWorkflowExecution.id
  workflowType: string;         // e.g., 'mcp_service_orchestration'
  workflowStatus: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  workflowStepCount: number;
  workflowExecutionTime: number; // ms
}
```

### MCP Hub Integration

Performance stats are exposed via the Hub Tools API:

```javascript
// In hub-tools-handler.js
async getHubPerformanceStats() {
  const discoveryStats = this.serviceDiscoveryHandler?.getCacheStats();
  const healthStats = this.serviceHealthHandler?.getHealthCacheStats();
  const poolStats = this.serviceCallHandler?.connectionPool?.getPoolStats();
  const workflowMetrics = await this.getWorkflowMetrics();

  return {
    discovery: discoveryStats,
    health: healthStats,
    connectionPool: poolStats,
    workflow: workflowMetrics,
    overallPerformance: this.calculateOverallPerformance(...),
    recommendations: this.generateRecommendations(...),
    timestamp: new Date().toISOString()
  };
}
```

## Execution Modes

### Sequential Mode

Steps execute in order, each waiting for the previous to complete.

```typescript
{
  steps: [
    { service: 'service-a', tool: 'analyze', arguments: {...} },
    { service: 'service-b', tool: 'transform', arguments: {...} },
    { service: 'service-c', tool: 'publish', arguments: {...} }
  ],
  executionMode: 'sequential',
  failureStrategy: 'stop'
}
```

### Parallel Mode

All steps execute concurrently.

```typescript
{
  steps: [
    { service: 'service-a', tool: 'fetch-data', arguments: {...} },
    { service: 'service-b', tool: 'fetch-data', arguments: {...} },
    { service: 'service-c', tool: 'fetch-data', arguments: {...} }
  ],
  executionMode: 'parallel',
  failureStrategy: 'continue'
}
```

### Conditional Mode

Steps execute based on dependency graph.

```typescript
{
  steps: [
    { service: 'source', tool: 'fetch', arguments: {...} },           // 0
    { service: 'transform-a', tool: 'process', arguments: {...}, dependsOn: [0] },  // 1
    { service: 'transform-b', tool: 'process', arguments: {...}, dependsOn: [0] },  // 2
    { service: 'merge', tool: 'combine', arguments: {...}, dependsOn: [1, 2] }       // 3
  ],
  executionMode: 'conditional'
}
```

## Failure Strategies

| Strategy | Behavior |
|----------|----------|
| `stop` | Halt execution on first failure |
| `continue` | Continue with remaining steps, aggregate failures |
| `rollback` | *Not yet implemented* — currently behaves like `stop`; completed steps are **not** undone (no compensation logic in the engine, verified 2026-07-01) |

## Security

### Audit Logging

All workflow executions are audited via `orchestration-audit.ts`:
- User ID and authentication method
- Workflow configuration
- Execution result and duration
- Errors and failure details

### POV Scoping

Workflows can be scoped to a specific POV:
- `povId` in workflow config restricts resource access
- POV validation occurs before execution
- Results are filtered by POV access

## Service Call Enforcement (January 2026)

When orchestrating service calls, the Hub enforces:

| Feature | Enforcement | Location |
|---------|-------------|----------|
| Rate Limiting | LRU cache with configurable limits | `hub-utilities.js` |
| Execution Timeout | `Promise.race` with `maxExecutionTime` | `service-call-handler.js` |
| Connection Pooling | Reused connections with idle timeout | `ServiceConnectionPool` |

**maxExecutionTime** (default 30s, configurable per service):
```javascript
// Service can configure via registry(action: "update")
registry(action: "update")(service_name: "my-api", updates: {
  permissions: { maxExecutionTime: 45000 }  // 45 seconds
})
```

## Related Documentation

- **Task Activity System**: `/.claude/knowledge/domain/mcp/TASK-ACTIVITY-SYSTEM.md`
- **MCP Hub Architecture**: `/.claude/knowledge/domain/mcp/tool-architecture-reference.md`
- **Portfolio Intelligence**: `/.claude/knowledge/domain/mcp/PORTFOLIO-INTELLIGENCE.md`
- **Discovery Protocol**: `/.claude/knowledge/protocols/discovery-first-workflow-guide.md`
- **Time Bomb Prevention**: `/.claude/knowledge/patterns/time-bomb-detection-pattern.md` - Cache bounds and cleanup patterns
