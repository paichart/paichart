# MCP Hub Workflow Orchestration Technical Reference

> **Companion to**: `mcp-hub-integration-guide.md`, `mcp-hub-service-registration-reference.md`
>
> **Version**: 1.5 | **Updated**: January 13, 2026 | **Contact**: <maintainer-email>

---

## Overview

This document provides comprehensive technical reference for orchestrating multi-service workflows through the pAIchart MCP Hub. It covers orchestration modes, step configuration, failure strategies, and practical workflow patterns.

**Key Concept**: Users describe what they want to accomplish, and AI discovers appropriate services by **capability**. Workflows chain multiple external services together—users don't need to know service names, just what they want to achieve.

**Primary Guides**:
- See `mcp-hub-integration-guide.md` for architecture overview and getting started
- See `mcp-hub-service-registration-reference.md` for service registration

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Workflow Tools (NEW)](#workflow-tools-new)
3. [Orchestration Concepts](#orchestration-concepts)
4. [Execution Modes](#execution-modes)
5. [Step Configuration](#step-configuration)
6. [Failure Strategies](#failure-strategies)
7. [Service Call Reference](#service-call-reference)
8. [Workflow Patterns](#workflow-patterns)
9. [Performance & Monitoring](#performance--monitoring)
10. [Security & Compliance](#security--compliance)
11. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Simple Sequential Workflow

Call multiple services in sequence using the `services(action: "call")` tool:

```
# Step 1: Fetch data
services(action: "call")(
  targetService: "weather-api",
  tool: "get_forecast",
  arguments: { location: "San Francisco" }
)

# Step 2: Send notification with result
services(action: "call")(
  targetService: "notification-hub",
  tool: "send_notification",
  arguments: {
    channel: "slack",
    recipient: "#alerts",
    message: "Weather forecast retrieved"
  }
)
```

### Using the Workflow Builder Prompt

For guided workflow creation, use the built-in prompt:

```
/prompt orchestrate_workflow
```

This opens an interactive session showing:
- Available services for orchestration
- Workflow patterns (sequential, parallel, event-driven, conditional)
- Example workflows for common use cases

---

## Workflow Tools (NEW)

> **Added**: January 11, 2026 (v1.1)

Instead of manually chaining `services(action: "call")` calls, use the dedicated workflow tools for automated orchestration with execution tracking.

### services(action: "workflow.execute")

Execute a multi-service workflow with automatic step management:

```
services(action: "workflow.execute")({
  steps: [
    {
      service: "paichart-project-service",
      tool: "project(action: "pov.list")",
      arguments: { status: "IN_PROGRESS" }
    },
    {
      service: "paichart-project-service",
      tool: "project(action: "task.list")",
      arguments: { povId: "{{step.0.output.data[0].id}}" },
      dependsOn: [0]
    }
  ],
  executionMode: "sequential",
  failureStrategy: "stop",
  timeout: 60000
})
```

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `workflowName` | string | optional | Name of saved workflow to execute (alternative to steps) |
| `steps` | array | optional* | Array of step objects (max 20). *Required if no workflowName |
| `executionMode` | string | "sequential" | "sequential", "parallel", or "conditional" |
| `failureStrategy` | string | "stop" | "stop", "continue", or "rollback" |
| `timeout` | number | 60000 | Global timeout in milliseconds |
| `povId` | string | optional | POV scope for the workflow |
| `taskId` | string | optional | Task context (derives povId if not provided) |

**Named Workflow Mode** (NEW - January 2026):

Instead of providing inline steps, reference a saved workflow by name:

```
services(action: "workflow.execute")({
  workflowName: "testing-workflow",
  povId: "cm123..."
})
```

Named workflows are:
- Stored in MCPWorkflow table
- Managed via REST API (Admin only)
- Looked up by unique name
- Must have status: ACTIVE

**Step Object**:
```javascript
{
  service: "service-id-or-name",  // Required
  tool: "tool-name",               // Required
  arguments: { ... },              // Optional, default: {}
  dependsOn: [0, 1],              // Optional, step indices
  timeout: 30000                  // Optional, per-step timeout
}
```

**Variable Chaining** (sequential mode):
Reference previous step outputs using `{{step.N.output}}` or `{{step.N.output.field}}`:
- `{{step.0.output}}` - Entire output of step 0
- `{{step.0.output.data[0].id}}` - Nested field access (array index + property)
- `{{step.0.output.data[0].title}}` - Access any nested property

**Response Structure Consistency** (Important!):

All pAIchart list operations return data in a consistent wrapper format:
```javascript
{ data: [...], total: N, ... }  // NOT { povs: [...] } or { tasks: [...] }
```

This means variable chaining always uses `data[N]` regardless of the entity type:
```javascript
// POVs
"{{step.0.output.data[0].id}}"      // Correct - accesses first POV's ID
"{{step.0.output.povs[0].id}}"      // WRONG - "povs" field doesn't exist

// Tasks
"{{step.1.output.data[0].id}}"      // Correct - accesses first task's ID
"{{step.1.output.tasks[0].id}}"     // WRONG - "tasks" field doesn't exist
```

**Path Normalization** (Flexibility):

The orchestration engine normalizes paths for convenience - both formats work:
```javascript
// These are equivalent:
"{{step.0.output.data[0].id}}"   // Full path with 'output'
"{{step.0.data[0].id}}"          // Shorthand without 'output'

// The engine strips both 'output.' and 'data.' prefixes automatically
// See orchestration-engine.js lines 160-162
```

**Variable Error Detection**:

Invalid step references now return clear error messages:
```javascript
// If you reference step.5 but only 2 steps exist:
"Error: step.5 does not exist (only 2 steps defined)"

// Not the confusing previous message:
"Error: POV not found..."  // This was the old, misleading error
```

**Returns**:
```javascript
{
  success: true,
  executionRef: "wf-1768163242868",  // Reference ID for logging
  executionId: "cmka6qpv90001yxgz95z51ogw",  // Use for status checks
  status: "COMPLETED",
  summary: {
    totalSteps: 2,
    completed: 2,
    failed: 0,
    mode: "sequential",
    services: ["paichart-project-service", "paichart-project-service"]
  },
  executionTime: 1228
}
```

### services(action: "workflow.status")

Check the status of a running or completed workflow:

```
services(action: "workflow.status", executionId: "exec_xyz789")
```

**Returns**:
```javascript
{
  success: true,
  executionId: "exec_xyz789",
  status: "RUNNING",      // RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT
  progress: "2/5 steps",
  startTime: "2026-01-11T10:00:00Z",
  duration: 5000,
  error: null             // Error message if failed
}
```

### services(action: "workflow.cancel")

Cancel a running workflow:

```
services(action: "workflow.cancel")(
  executionId: "exec_xyz789",
  reason: "User requested cancellation"
)
```

### services(action: "workflow.list")

List workflow execution history:

```
services(action: "workflow.list")(
  status: "COMPLETED",    // Optional filter
  povId: "pov_abc123",    // Optional filter
  limit: 20,
  offset: 0
)
```

**Returns**:
```javascript
{
  success: true,
  executions: [
    { id: "exec_1", status: "COMPLETED", startTime: "...", duration: 1234 },
    { id: "exec_2", status: "FAILED", error: "Service unavailable" }
  ],
  pagination: {
    total: 45,
    limit: 20,
    offset: 0,
    hasMore: true
  }
}
```

### When to Use Workflow Tools vs services(action: "call")

| Scenario | Recommended Approach |
|----------|---------------------|
| Single service call | `services(action: "call")` |
| 2-3 independent calls | Multiple `services(action: "call")` |
| Dependent steps with variable chaining | `services(action: "workflow.execute")` |
| Need execution tracking/history | `services(action: "workflow.execute")` |
| Parallel execution with dependencies | `services(action: "workflow.execute")` |
| Conditional branching | `services(action: "workflow.execute")` |
| Reusable workflow templates | `services(action: "workflow.execute")` with `workflowName` |

---

## Named Workflows (Admin Management)

> **Note**: This section documents internal admin functionality for the pAIchart Workflow Management GUI. Most users interact with workflows via MCP tools (services(action: "workflow.execute")), not via direct management.

Named workflows are saved workflow templates that can be executed by name. They are:
- **Managed by admins** via the Workflow Management GUI at `/workflows`
- **Executed via MCP** using `services(action: "workflow.execute", { workflowName: "my-workflow" })`
- **Stored in MCPWorkflow table** with unique names

### Execute Named Workflow (MCP Tool)

```
services(action: "workflow.execute")({
  workflowName: "error-to-ticket-workflow",
  povId: "cm123..."
})
```

### Workflow Categories

| Category | Use For |
|----------|---------|
| `testing` | Automated testing workflows |
| `deployment` | CI/CD and release workflows |
| `analysis` | Data analysis and reporting |
| `automation` | General automation tasks |
| `monitoring` | Health checks and alerting |

**Admin GUI**: Administrators manage named workflows at `/workflows` (requires ADMIN role).

---

## Orchestration Concepts

### What is Workflow Orchestration?

Workflow orchestration enables AI agents to chain multiple MCP service calls into coordinated workflows. The Hub provides:

- **Service Discovery**: Find services with required capabilities
- **Call Routing**: Route calls to appropriate service endpoints
- **State Management**: Track workflow execution state
- **Error Handling**: Configurable failure strategies
- **Security**: Authentication and access control enforcement

### Workflow Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Workflow Definition                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │  Step 1  │───▶│  Step 2  │───▶│  Step 3  │───▶│  Step N  │      │
│  │ service A│    │ service B│    │ service C│    │ service X│      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│                                                                      │
│  Execution Mode: sequential | parallel | conditional                │
│  Failure Strategy: stop | continue | rollback                       │
│  Timeout: 1s - 5min (global) | 1s - 60s (per step)                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Execution Modes

The Hub supports three orchestration modes, configured via `executionMode`:

### 1. Sequential Mode (Default)

Steps execute in order, each waiting for the previous to complete. Use for dependent operations.

```
Execution Flow:
Step 1 ──[complete]──▶ Step 2 ──[complete]──▶ Step 3

Configuration:
{
  steps: [
    { service: "data-source", tool: "fetch", arguments: {...} },
    { service: "transformer", tool: "process", arguments: {...} },
    { service: "storage", tool: "save", arguments: {...} }
  ],
  executionMode: "sequential"
}
```

**Use Cases**:
- Data pipelines where each step needs previous output
- Transaction workflows requiring order guarantees
- Authentication → authorization → action chains

### 2. Parallel Mode

All steps execute concurrently with no dependencies. Use for independent operations.

```
Execution Flow:
              ┌──▶ Step 1 ──┐
              │             │
Start ────────┼──▶ Step 2 ──┼──────▶ Complete
              │             │
              └──▶ Step 3 ──┘

Configuration:
{
  steps: [
    { service: "weather-api", tool: "get_current", arguments: { location: "NYC" } },
    { service: "weather-api", tool: "get_current", arguments: { location: "LA" } },
    { service: "weather-api", tool: "get_current", arguments: { location: "Chicago" } }
  ],
  executionMode: "parallel"
}
```

**Use Cases**:
- Multi-location data fetching
- Broadcast notifications to multiple channels
- Independent health checks

### 3. Conditional Mode (If/Then/Else)

Step 0 is the condition check. If it succeeds with data, step 1 ("then") executes. If it fails or returns no data, step 2 ("else") executes. Maximum 3 steps.

```
Execution Flow:
                        ┌──▶ Step 1 (THEN)   ← condition passed
                        │
Start ──▶ Step 0 ──────┤
                        │
                        └──▶ Step 2 (ELSE)   ← condition failed

Condition logic: conditionPassed = step0.success && step0.data (truthy check)

Configuration:
{
  steps: [
    { service: "paichart-project-service", tool: "project(action: "pov.list")", arguments: { status: "STALLED" } },
    { service: "notification-service", tool: "send", arguments: { message: "Stalled POVs found" } },
    { service: "notification-service", tool: "send", arguments: { message: "All clear" } }
  ],
  executionMode: "conditional"
}
```

**Branching Rules**:
- Step 1 ("then") can reference step 0 outputs via `{{step.0.output...}}` variable chaining
- Step 2 ("else") cannot reference step 0 outputs (step 0 failed, output unreliable)
- Step 2 is optional — omit if no else branch needed

**Use Cases**:
- Conditional notifications (alert only when issues exist)
- Graceful degradation (try primary, fall back to secondary)
- Gate checks (verify precondition before acting)

---

## Step Configuration

### Step Schema

Each workflow step has the following structure:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `service` | string | Yes | Service name or ID from Hub registry |
| `tool` | string | Yes | Tool name to invoke on the service |
| `arguments` | object | Yes | Arguments to pass to the tool |
| `dependsOn` | number[] | No | Step indices this step depends on (parallel mode) |
| `timeout` | number | No | Per-step timeout in ms (1000-60000) |

### Example Step Configurations

**Basic Step**:
```json
{
  "service": "weather-api",
  "tool": "get_forecast",
  "arguments": { "location": "San Francisco", "days": 7 }
}
```

**Step with Timeout**:
```json
{
  "service": "slow-api",
  "tool": "heavy_computation",
  "arguments": { "data": {...} },
  "timeout": 45000
}
```

**Step with Dependencies**:
```json
{
  "service": "aggregator",
  "tool": "merge_results",
  "arguments": { "format": "json" },
  "dependsOn": [1, 2, 3]
}
```

### Step Limits

| Constraint | Value | Description |
|------------|-------|-------------|
| Max steps per workflow | 20 | Prevents runaway workflows |
| Min step timeout | 1,000 ms (1s) | Ensures meaningful execution |
| Max step timeout | 60,000 ms (60s) | Prevents hung steps |
| Global timeout | 1,000 - 600,000 ms | Overall workflow limit (default: 60s) |

### System Limits Reference

> **Added**: January 16, 2026 (Quarterly Security Review)

Comprehensive reference of all workflow and service limits:

#### Workflow Execution Limits

| Limit | Value | Location | Description |
|-------|-------|----------|-------------|
| Max steps per workflow | 20 | `schemas.ts` | Prevents workflow complexity explosion |
| Max concurrent executions per user | 10 | `workflow-tools-handler.js` | Prevents resource monopolization |
| Global workflow timeout | 600,000 ms (10 min) | `schemas.ts` | Maximum workflow duration |
| Default workflow timeout | 60,000 ms (1 min) | `schemas.ts` | Default if not specified |
| Per-step timeout max | 60,000 ms (1 min) | `orchestration-params.ts` | Maximum individual step duration |
| Trigger events per workflow | 50 | `schemas.ts` | DoS prevention for event arrays |

#### Parallel Execution Limits

| Limit | Value | Location | Description |
|-------|-------|----------|-------------|
| Parallel steps within workflow | 5 | `service-caller.ts:114` | Batched to prevent pool exhaustion |
| Service call chain depth | 3 | `service-call-policy.js:175` | Prevents infinite recursive calls |

#### Rate Limits

| Limit | Value | Location | Description |
|-------|-------|----------|-------------|
| Default service rate limit | 100 requests / 60s | `service-call-handler.js:317` | Per-service, per-user |
| Rate limit window | 60,000 ms | Configurable per service | Time window for request counting |

#### Size Limits

| Limit | Value | Location | Description |
|-------|-------|----------|-------------|
| Max parameter size | 100 KB | `service-call-policy.js` | Request payload limit |
| Max response size | 1 MB | `service-call-policy.js` | Response payload limit |
| Workflow arguments size | 50 KB | `orchestration-params.ts` | Per-step arguments limit |
| Workflow name length | 100 chars | `schemas.ts` | Name field maximum |
| Workflow description | 500 chars | `schemas.ts` | Description field maximum |

#### Execution Time Analysis

| Scenario | Calculation | Expected Time |
|----------|-------------|---------------|
| Typical workflow | 3 steps × 5s/step | ~15 seconds |
| Heavy workflow | 10 steps × 10s/step | ~100 seconds |
| Max theoretical (sequential) | 20 steps × 60s/step | 20 minutes |

#### Capacity Planning

With `MAX_CONCURRENT_EXECUTIONS_PER_USER = 10`:
- **Conservative estimate**: 10 workflows × 60s default = 10 minutes execution capacity per user
- **Burst capacity**: 10 workflows × 5 min max = 50 minutes worst-case
- **Service calls**: 10 workflows × 20 steps = 200 potential service calls (distributed)

---

## Failure Strategies

Configure how the workflow handles step failures with `failureStrategy`:

### 1. Stop (Default)

Halt execution immediately on first failure. No further steps execute.

```json
{
  "steps": [...],
  "failureStrategy": "stop"
}
```

**Behavior**:
- Step 1: Success ✓
- Step 2: Failure ✗
- Step 3: Not executed ⏸️

**Use When**: Steps are dependent and continuing makes no sense

### 2. Continue

Continue executing remaining steps even if some fail. Aggregate all results.

```json
{
  "steps": [...],
  "failureStrategy": "continue"
}
```

**Behavior**:
- Step 1: Success ✓
- Step 2: Failure ✗ (recorded)
- Step 3: Executed ✓

**Use When**: Steps are independent and you want best-effort execution

### 3. Rollback

Stop on first failure (same as "stop"). Automatic undo of completed steps is planned but not yet implemented.

```json
{
  "steps": [...],
  "failureStrategy": "rollback"
}
```

**Behavior**:
- Step 1: Success ✓
- Step 2: Failure ✗
- Step 3: Not executed ⏸️
- (Future: undo step 1)

**Note**: Currently behaves identically to "stop". Automatic undo is a planned future enhancement.

**Prerequisites before implementing rollback**:
1. **Accurate failure detection** — Step results must correctly report success/failure (fixed Mar 2026: isError detection, failure strategy enforcement across all execution modes)
2. **Action identity in step results** — Results currently contain `{ success, data, error, service, tool }` but not *what was done* (e.g., "created record cm123"). Rollback needs to know what to undo.
3. **Compensating action registry** — Services must declare undo operations (e.g., `task.complete` → `task.reopen`). No services currently expose this.
4. **Structured error context** — `error` is a flat string. Rollback needs to know if failure was total or partial (a half-sent notification can't be unsent).
5. **Idempotency guarantees** — Undo operations must be safe to retry if the rollback itself fails partway through.

---

## Service Call Reference

### services(action: "call") Tool

The primary tool for invoking services through the Hub:

```
services(action: "call")(
  targetService: string,    // Service name or ID
  tool: string,            // Tool to execute
  arguments: object        // Tool arguments
)
```

### Required Authentication

All service calls require authentication. Supported methods:

| Method | Header/Mechanism |
|--------|------------------|
| API Key | `X-API-Key: your-api-key` |
| OAuth Bearer | `Authorization: Bearer <jwt>` |
| OAuth Session | Authenticated via Microsoft/Google/GitHub |
| MCP Session | Claude Desktop authenticated session |

### Response Format

```json
{
  "success": true,
  "targetService": "weather-api",
  "tool": "get_forecast",
  "arguments": { "location": "San Francisco" },
  "result": { ... },
  "_meta": {
    "tool": "services(action: "call")",
    "timestamp": "2026-01-08T10:30:00Z",
    "sdkNative": true
  },
  "metadata": {
    "executionTime": 125,
    "maxExecutionTime": 30000,
    "targetServiceId": "cljxyz123",
    "sourceUser": "user@company.com",
    "endpoint": "https://api.weather.com/mcp"
  },
  "nextSteps": [
    "✅ Service call completed successfully",
    "Result available above",
    "Make another call: services(action: "call", ...)",
    "Check service health: services(action: "health", ...)"
  ]
}
```

### Access Control

Service access is determined by:

| Check | Access Granted |
|-------|---------------|
| `publicAccess: true` | Any authenticated user |
| User is service owner | Always ✓ |
| User is Hub admin | Always ✓ |
| None of the above | Access denied ✗ |

### Rate Limiting

If the target service has rate limiting configured, calls are limited:

```
Response when rate limited:
⏱️ Rate Limit Exceeded: You've exceeded the rate limit for service "weather-api".
Limit: 100 requests per 60s. Retry in 45s or contact the service owner.
```

### Execution Timeout

Calls are enforced with `maxExecutionTime` (default 30s):

```
Response on timeout:
TIMEOUT: Service call exceeded 30000ms limit
```

---

## Workflow Patterns

### Pattern 1: Data Pipeline

Fetch → Transform → Store → Notify

```
# 1. Fetch raw data
services(action: "call")(
  targetService: "data-collector",
  tool: "fetch_records",
  arguments: { source: "salesforce", since: "2026-01-01" }
)

# 2. Transform/enrich
services(action: "call")(
  targetService: "data-transformer",
  tool: "enrich",
  arguments: { schema: "customer-360" }
)

# 3. Store results
services(action: "call")(
  targetService: "data-warehouse",
  tool: "insert",
  arguments: { table: "enriched_customers" }
)

# 4. Send notification
services(action: "call")(
  targetService: "notification-hub",
  tool: "send",
  arguments: { channel: "slack", message: "Pipeline complete: 1,234 records" }
)
```

### Pattern 2: Multi-Location Weather Check

Parallel fetch for multiple locations:

```
# All three execute simultaneously
services(action: "call", targetService: "weather-api", tool: "get_current", arguments: { location: "NYC" })
services(action: "call", targetService: "weather-api", tool: "get_current", arguments: { location: "London" })
services(action: "call", targetService: "weather-api", tool: "get_current", arguments: { location: "Tokyo" })
```

### Pattern 3: Web Scraping with Screenshot

```
# 1. Scrape the page
services(action: "call")(
  targetService: "browser-automation",
  tool: "scrape_page",
  arguments: {
    url: "https://competitor.com/pricing",
    selectors: { prices: ".pricing-tier", features: ".feature-list" }
  }
)

# 2. Take screenshot for reference
services(action: "call")(
  targetService: "browser-automation",
  tool: "take_screenshot",
  arguments: {
    url: "https://competitor.com/pricing",
    fullPage: true
  }
)
```

### Pattern 4: Conditional Alert System

Check conditions before alerting:

```
# 1. Check system health
services(action: "call")(
  targetService: "monitoring-service",
  tool: "get_metrics",
  arguments: { service: "production-api" }
)

# 2. If metrics indicate issue, alert
# (Conditional based on Step 1 result)
services(action: "call")(
  targetService: "notification-hub",
  tool: "broadcast",
  arguments: {
    channels: ["slack", "email", "pagerduty"],
    priority: "high",
    message: "Production API degradation detected"
  }
)
```

### Pattern 5: AI Analysis Pipeline

```
# 1. Collect data from multiple sources
services(action: "call", targetService: "crm-connector", tool: "get_leads", arguments: { days: 30 })
services(action: "call", targetService: "analytics-api", tool: "get_traffic", arguments: { days: 30 })

# 2. Run AI analysis
services(action: "call")(
  targetService: "ai-analytics",
  tool: "analyze_correlation",
  arguments: {
    datasets: ["leads", "traffic"],
    objective: "identify_conversion_drivers"
  }
)

# 3. Generate report
services(action: "call")(
  targetService: "report-generator",
  tool: "create_pdf",
  arguments: { template: "executive-summary" }
)
```

### Pattern 6: External Service Orchestration (Primary Use Case)

Chain external MCP services discovered by capability:

```
User: "Check for critical errors and create a ticket if found"

AI discovers:
- monitoring service → "sentry-mcp" (capability: monitoring)
- ticketing service → "jira-mcp" (capability: issue-tracking)

services(action: "workflow.execute")({
  steps: [
    {
      service: "sentry-mcp",
      tool: "get_issues",
      arguments: { level: "critical", limit: 10 }
    },
    {
      service: "jira-mcp",
      tool: "create_issue",
      arguments: {
        summary: "Critical error: {{step.0.output.data[0].title}}",
        description: "{{step.0.output.data[0].message}}",
        priority: "high"
      },
      dependsOn: [0]
    }
  ],
  executionMode: "sequential"
})
```

**Key insight**: Users describe intent ("check for errors"), AI discovers services by capability, and orchestrates automatically.

### Pattern 7: pAIchart Internal Service Chaining (Platform-Specific)

> **Note**: This pattern uses pAIchart's internal services. External service integrators can use similar patterns with their own services.

Use internal services with variable chaining for project management workflows:

```
services(action: "workflow.execute")({
  steps: [
    {
      service: "paichart-project-service",
      tool: "project(action: "pov.list")",
      arguments: { limit: 1 }
    },
    {
      service: "paichart-project-service",
      tool: "project(action: "task.list")",
      arguments: {
        povId: "{{step.0.output.data[0].id}}",
        limit: 5
      }
    }
  ],
  executionMode: "sequential"
})
```

**Result** (actual execution):
```javascript
{
  success: true,
  executionRef: "wf-1768163242868",
  executionId: "cmka6qpv90001yxgz95z51ogw",
  status: "COMPLETED",
  summary: {
    totalSteps: 2,
    completed: 2,
    failed: 0,
    mode: "sequential",
    services: ["paichart-project-service", "paichart-project-service"]
  },
  stepResults: [
    { success: true, tool: "project(action: "pov.list")", executionTime: 817 },
    { success: true, tool: "project(action: "task.list")", executionTime: 380 }
  ],
  executionTime: 1228
}
```

**Available Internal Services**:

| Service | Tools | Description |
|---------|-------|-------------|
| `paichart-project-service` | `project(action: "pov.list")`, `project(action: "pov.details")`, `get_pov_phases` | POV (Project) management |
| `paichart-project-service` | `project(action: "task.list")`, `get_task_details`, `project(action: "task.context")`, `perform(action: "execute")` | Task operations |

**Internal Service Benefits**:
- Zero network latency (same process)
- No external compliance checks
- Direct handler invocation
- Full context preservation

---

## Performance & Monitoring

### Monitoring Workflow Performance

Monitor workflow performance via workflow status tools:

```
services(action: "workflow.status", executionId: "...")
services(action: "workflow.list")()
```

**Response includes workflow metrics**:
```json
{
  "workflow": {
    "last24Hours": {
      "total": 150,
      "completed": 142,
      "failed": 5,
      "running": 3,
      "successRate": "94.7%"
    },
    "performance": {
      "avgDurationMs": 2340
    },
    "byType": {
      "mcp_service_orchestration": 120,
      "parallel_service_execution": 25,
      "conditional_workflow": 5
    }
  },
  "recommendations": [
    {
      "area": "workflow_execution",
      "priority": "medium",
      "message": "3 workflows currently running - monitor for completion",
      "metric": 3
    }
  ]
}
```

### Connection Pool Stats

The Hub maintains connection pools for efficient service calling:

```json
{
  "connectionPool": {
    "active": 5,
    "idle": 15,
    "total": 20,
    "reuseRate": "85%"
  }
}
```

**Recommendation thresholds**:
| Metric | Threshold | Priority |
|--------|-----------|----------|
| Workflow success rate | < 80% | High |
| Running workflows | > 10 | Medium |
| Connection reuse rate | < 30% | Medium |

---

## Security & Compliance

### Authentication Enforcement

All workflow calls require authentication:
- Unauthenticated calls are rejected with detailed guidance
- Session tokens are validated on each call
- Audit logs track all successful and failed attempts

### Compliance Validation

Before executing service calls, the Hub validates:

| Check | Description |
|-------|-------------|
| Tool whitelist | Only registered tools can be called |
| Blocked patterns | Shell commands, SQL injection, path traversal blocked |
| Parameter size | 100KB max parameters, 1MB max response |
| Call depth | Max 3 nested service calls (prevents infinite chains) |

### Audit Logging

All workflow and service calls are logged to the Activity table with origin tracking:

```json
{
  "type": "WORKFLOW_ORCHESTRATION",
  "action": "orchestration.complete",
  "userId": "cmfwdwnxo0000yxb3onp3455g",
  "metadata": {
    "success": true,
    "source": "mcp_hub",
    "timestamp": "2026-01-12T20:27:24.115Z",
    "executionRef": "wf-1768163242868",
    "executionId": "cmka6qpv90001yxgz95z51ogw",
    "successCount": 2,
    "totalExecutionTime": 1228
  }
}
```

**Activity Source Types** (for filtering and debugging):

| Source | Description |
|--------|-------------|
| `mcp_hub` | MCP Hub workflow orchestration |
| `mcp_server` | MCP server tool operations |
| `web_ui` | Browser/frontend actions |
| `api` | Direct API calls |
| `webhook` | External webhook triggers |
| `cron` | Scheduled jobs |
| `admin` | Admin panel actions |

**Query by source**:
```sql
SELECT * FROM Activity
WHERE metadata->>'source' = 'mcp_hub'
ORDER BY createdAt DESC;
```

### Security Violations

Blocked calls are logged with enhanced detail:

```json
{
  "type": "SECURITY_EVENT",
  "action": "orchestration.security.access_denied",
  "userId": "user123",
  "metadata": {
    "success": false,
    "source": "mcp_hub",
    "severity": "high",
    "targetService": "dangerous-service",
    "tool": "exec_command",
    "violations": ["BLOCKED_PATTERN", "SHELL_COMMAND_DETECTED"],
    "riskLevel": "HIGH"
  }
}
```

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Authentication Required" | Not logged in | Authenticate via OAuth, API key, or session |
| "Service not found" | Invalid service name | Use `services(action: "discover")()` to find available services |
| "Access Denied" | No permission | Service owner must enable `publicAccess: true` |
| "Rate Limit Exceeded" | Too many calls | Wait for retry-after period or contact owner |
| "TIMEOUT" | Call took too long | Increase service's `maxExecutionTime` setting |
| "Tool not whitelisted" | Tool not in registry | Register tool in service capabilities |

### Debugging Workflow Failures

1. **Check service health**:
   ```
   services(action: "health", service_name: "failing-service")
   ```

2. **Verify service is active**:
   ```
   services(action: "discover", capability: "needed-capability")
   ```

3. **Check workflow history**:
   ```
   services(action: "workflow.list")()
   ```

4. **Review service tools**:
   ```
   registry(action: "tools", service_name: "target-service")
   ```

### Token Limit Exceeded (Large Workflow Results)

**Symptom**: Workflow result shows "exceeds maximum allowed tokens" or output is truncated.

**Cause**: Workflow steps return large payloads (e.g., full POV objects with nested data), and the combined result exceeds the AI client's token limit (typically 30,000-125,000 characters).

**Solutions**:

1. **Limit result size in step arguments**:
   ```javascript
   {
     service: "paichart-project-service",
     tool: "project(action: "pov.list")",
     arguments: {
       status: "IN_PROGRESS",
       limit: 5  // Reduce from default to limit response size
     }
   }
   ```

2. **Use summarization tools**: Chain a summarization step after data-heavy steps:
   ```javascript
   // Step 2: Summarize the results
   {
     service: "ai-service",
     tool: "summarize",
     arguments: {
       data: "{{step.0.output}}",
       format: "brief"
     }
   }
   ```

3. **Extract only needed fields**: Instead of returning full objects, select specific fields in subsequent processing.

4. **Check workflow status separately**: Use `services(action: "workflow.status")(executionId)` to retrieve results in a separate call, which may handle larger payloads.

**Note**: This is an AI client limitation, not a Hub limitation. The Hub stores full results in MCPWorkflowExecution.

### Compliance Policy Blocking Legitimate Content

**Symptom**: `"Service call blocked by compliance policy: Detected blocked pattern"` even for normal notification messages.

**Cause**: The compliance policy (`lib/mcp/server/config/service-call-policy.js`) includes security patterns that may match legitimate content. For example, shell operators like `;` `&` `|` are blocked.

**Solutions**:

1. **Avoid shell-like characters in message content**: Characters like `|`, `;`, `&` in notification bodies will be blocked.

2. **Use simple text in notifications**: Avoid complex formatting that might contain blocked patterns.

3. **For internal services**: Trusted internal services (notification-service, browser-automation-service) bypass URL blocking but not pattern blocking for external compliance.

**Recently Fixed** (January 2026): Parentheses `()` are now allowed in message content. Previously, titles like "Project Name (Demo)" would be blocked. Only actual command substitution patterns `$(cmd)` and backticks are now blocked.

### Step Failure Analysis

When a step fails, the response includes:

```json
{
  "success": false,
  "targetService": "failing-service",
  "tool": "broken_tool",
  "error": "Connection timeout after 30000ms",
  "metadata": {
    "executionTime": 30001,
    "targetServiceId": "cljxyz123",
    "timestamp": "2026-01-08T10:30:00Z"
  }
}
```

**Analysis steps**:
1. Check `executionTime` vs `maxExecutionTime`
2. Verify service endpoint is reachable
3. Check service health status
4. Review recent service calls for patterns

---

## Related Documentation

- **Integration Guide**: `mcp-hub-integration-guide.md` - Architecture, security, getting started
- **Service Registration**: `mcp-hub-service-registration-reference.md` - Complete registration reference
- **Workflow System**: `MCP-WORKFLOW-SYSTEM.md` - Internal workflow engine documentation
- **MCP Hub Positioning**: `MCP-HUB-POSITIONING.md` - AI-native orchestration vs traditional automation

---

## Changelog

- **v1.6** (January 13, 2026): Compliance Policy Fix & Troubleshooting
  - FIXED: Compliance policy now allows parentheses `()` in message content
  - Previously, titles like "Project Name (Demo)" were blocked by overly aggressive injection pattern
  - Only actual command substitution `$(cmd)` and backticks `` `cmd` `` are now blocked
  - NEW: Troubleshooting section for "Token Limit Exceeded" with solutions
  - NEW: Troubleshooting section for "Compliance Policy Blocking Legitimate Content"
  - Updated `lib/mcp/server/config/service-call-policy.js` line 64-69

- **v1.5** (January 13, 2026): External Service Focus
  - CLARIFIED: Overview emphasizes capability-based discovery—users describe intent, AI discovers services
  - SIMPLIFIED: Named Workflow REST API section replaced with simplified Admin Management section
  - NEW: Pattern 6 - External Service Orchestration showing capability-based discovery flow
  - RENAMED: Old Pattern 6 is now Pattern 7 (pAIchart-specific)
  - EMPHASIS: External MCP services are the primary focus, internal services are platform-specific

- **v1.4** (January 12, 2026): Named Workflow System
  - NEW: `workflowName` parameter for `services(action: "workflow.execute")` MCP tool
  - NEW: `taskId` parameter for task context derivation
  - NEW: REST API documentation for Admin workflow management
  - NEW: Named Workflow REST API section with all endpoints
  - Workflows can now be saved in MCPWorkflow table and executed by name
  - Admin CRUD operations via `/api/workflows/*` endpoints

- **v1.3** (January 12, 2026): Response Structure Consistency Documentation
  - NEW: "Response Structure Consistency" section explaining `{ data: [...] }` wrapper pattern
  - NEW: "Path Normalization" section documenting that both `output.` and `data.` prefixes work
  - NEW: "Variable Error Detection" section with improved error message examples
  - CLARIFIED: Variable chaining always uses `data[N]` not entity-specific names like `povs[N]`
  - Verified via Feature Domain Testing (33/33 scenarios passed)

- **v1.2** (January 12, 2026): Internal Services & Activity Tracking
  - NEW: Pattern 6 - pAIchart Internal Service Chaining with real tested example
  - NEW: Internal services table (`paichart-project-service`, `paichart-project-service`)
  - NEW: Activity source tracking (`source: 'mcp_hub'`) for origin filtering
  - NEW: Activity Source Types table for debugging
  - FIXED: Variable chaining path (`data[0].id` instead of `povs[0].id`)
  - FIXED: Response format (`executionRef` instead of `workflowId`)
  - Updated audit logging examples with real execution data
  - Added SQL query example for filtering by source

- **v1.1** (January 11, 2026): Added Workflow Tools
  - NEW: `services(action: "workflow.execute")` tool for automated multi-service orchestration
  - NEW: `services(action: "workflow.status")` tool for execution tracking
  - NEW: `services(action: "workflow.cancel")` tool for workflow cancellation
  - NEW: `services(action: "workflow.list")` tool for execution history
  - Added variable chaining documentation (`{{step.N.output}}`)
  - Added comparison table: Workflow Tools vs services(action: "call")

- **v1.0** (January 8, 2026): Initial release
  - Three execution modes documented (sequential, parallel, conditional)
  - Step configuration and limits
  - Failure strategies (stop, continue, rollback)
  - Service call reference with authentication
  - Workflow patterns with practical examples
  - Performance monitoring integration
  - Security and compliance guidelines
  - Troubleshooting guide
