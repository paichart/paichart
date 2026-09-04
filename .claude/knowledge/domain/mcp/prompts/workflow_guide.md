# MCP Hub Workflow Orchestration Guide

> **Master multi-service workflows: sequential, parallel, and conditional execution**
>
> Variable chaining, proven patterns, and troubleshooting

---

## 🎯 Quick Navigation

**What do you need?**

- **[A] Quick start** → See Your First Workflow
- **[B] Learn execution modes** → See 3 Execution Modes
- **[C] Chain outputs** → See Variable Chaining
- **[D] See examples** → See 7 Proven Patterns
- **[E] Handle failures** → See Failure Strategies
- **[F] Monitor execution** → See Workflow Monitoring

---

## 🎁 Pre-Built Named Workflows (Try These First!)

**We've created 4 demo workflows** you can run immediately:

| Workflow | Purpose | Time | Mode |
|----------|---------|------|------|
| **trust-level-basic-demo** | Learn trust levels & token passing | 10s | Sequential |
| **jwks-validation-advanced-demo** | Get code examples (TS, JS, Python) | 15s | Parallel |
| **token-troubleshooting-demo** | Debug trust level issues | 20s | Sequential |
| **pov-workflow-showcase** | Explore POV data in parallel | 10s | Parallel |

**Run any workflow**:
```javascript
services({ action: "workflow.execute", workflowName: "trust-level-basic-demo"})
```

**Perfect for**:
- ✅ Learning by example (run first, then read guide)
- ✅ Getting working code (copy-paste ready)
- ✅ Testing token validation (before building your service)
- ✅ Understanding execution modes (parallel vs sequential)

---

## 🚀 What You'll Learn

By the end of this guide, you'll understand:
- ✅ How to create multi-service workflows
- ✅ 3 execution modes (sequential, parallel, conditional)
- ✅ Variable chaining (`{{step.N.output...}}`)
- ✅ 7 proven workflow patterns you can use
- ✅ Failure strategies (stop, continue, rollback)
- ✅ How to monitor and debug workflows

**Time**: 30-40 minutes

---

## Section A1: Pre-Built Workflows (Try These First!)

**Before building your own, explore our 4 demo workflows** (stored in database, ready to use):

### Education Workflows

#### 1. trust-level-basic-demo (10 seconds)

**Purpose**: Learn trust levels and token validation basics

```javascript
services({ action: "workflow.execute", workflowName: "trust-level-basic-demo"})
```

**What you'll see**:
- Your trust level (OWNER, TEAM_MEMBER, SCOPED, or ANONYMOUS)
- Whether you receive JWT tokens (and why)
- 11-step JWKS validation process
- TypeScript code example (145 lines, copy-paste ready)
- Component 5 verification
- Performance metrics (avg 34ms)

**Perfect for**: First-time users, external service developers

---

#### 2. jwks-validation-advanced-demo (15 seconds, parallel)

**Purpose**: Get working code in TypeScript, JavaScript, AND Python

```javascript
services({ action: "workflow.execute", workflowName: "jwks-validation-advanced-demo"})
```

**What you'll get**:
- 3 complete code examples (one per language)
- All run in parallel (15s total, not 45s sequential)
- Same validation logic, different implementations
- Copy-paste into your service and it works!

**Perfect for**: Developers integrating external services (choose your language)

---

### Troubleshooting Workflows

#### 3. token-troubleshooting-demo (20 seconds, sequential)

**Purpose**: Debug trust level changes with POV context

```javascript
services({ action: "workflow.execute", workflowName: "token-troubleshooting-demo"})
```

**What you'll see**:
- How POV context affects trust levels
- Step 1: Get your POVs
- Step 2: Validate with POV context included
- Trust level explanation (why OWNER vs TEAM_MEMBER vs SCOPED)

**Perfect for**: Debugging "why didn't I get a token?" issues

---

### Demo Workflows

#### 4. pov-workflow-showcase (10 seconds, parallel)

**Purpose**: See parallel execution in action

```javascript
services({ action: "workflow.execute", workflowName: "pov-workflow-showcase"})
```

**What you'll see**:
- Two independent queries running simultaneously
- Step 1: Get POVs (internal service)
- Step 2: Get tasks (internal service)
- Both complete in ~10s (faster than 20s sequential)

**Perfect for**: Understanding execution modes (parallel vs sequential)

---

## Section A: Your First Workflow (5 min)

### Simple Two-Step Workflow

**Goal**: Get POVs and send a summary email

```javascript
services({ action: "workflow.execute",
  steps: [
    // Step 0: Get POVs
    {
      service: "paichart-project-service",
      tool: "project",
      arguments: { action: "pov.list", status: "IN_PROGRESS", limit: 10 }
    },
    // Step 1: Send email (uses step 0 result)
    {
      service: "notification-service",
      tool: "send",
      arguments: {
        channel: "email",
        recipients: [{ id: "team", address: "team@company.com" }],
        message: {
          subject: "POV Status Report",
          body: "Found {{step.0.output.totalCount}} active POVs",
          priority: "normal"
        }
      },
      dependsOn: [0]  // Wait for step 0
    }
  ],
  executionMode: "sequential"
})
```

**What happens**:
1. Step 0 runs → Gets POVs → Returns result
2. Step 1 runs → Uses `{{step.0.output.totalCount}}` from step 0 → Sends email

**Response**:
```json
{
  "success": true,
  "status": "COMPLETED",
  "summary": {
    "totalSteps": 2,
    "completed": 2,
    "failed": 0
  },
  "executionTime": 1228
}
```

**✅ Success!** Your first multi-service workflow!

---

## Section B: 3 Execution Modes

### Mode 1: Sequential

**When**: Steps must run in order, each uses previous outputs

```
Step 1 ──[complete]──▶ Step 2 ──[complete]──▶ Step 3
```

**Example**:
```javascript
services({ action: "workflow.execute",
  steps: [
    { service: "data-source", tool: "fetch" },
    { service: "transformer", tool: "process", dependsOn: [0] },
    { service: "storage", tool: "save", dependsOn: [1] }
  ],
  executionMode: "sequential"
})
```

**Use for**:
- Data pipelines (fetch → transform → store)
- Transaction workflows (order matters)
- Variable chaining (step 2 needs step 1 output)

---

### Mode 2: Parallel

**When**: Steps are independent, can run simultaneously

```
          ┌──▶ Step 1 ──┐
          │             │
Start ────┼──▶ Step 2 ──┼──────▶ Complete
          │             │
          └──▶ Step 3 ──┘
```

**Example**:
```javascript
services({ action: "workflow.execute",
  steps: [
    { service: "weather-api", tool: "get_current", arguments: { location: "NYC" } },
    { service: "weather-api", tool: "get_current", arguments: { location: "London" } },
    { service: "weather-api", tool: "get_current", arguments: { location: "Tokyo" } }
  ],
  executionMode: "parallel"
})
```

**Use for**:
- Multi-location data fetching
- Broadcast notifications (multiple channels)
- Independent health checks

**Limit**: Max 5 parallel steps (prevents resource exhaustion)

---

### Mode 3: Conditional (If/Then/Else)

**When**: Execute different branches based on a condition step's result

```
                    ┌──▶ Step 1 (THEN)   ← condition passed
                    │
Start ──▶ Step 0 ──┤
                    │
                    └──▶ Step 2 (ELSE)   ← condition failed
```

**How branching works**:
- **Step 0** always executes — it's the **condition check**
- If step 0 **succeeds with data** → Step 1 ("then") executes, Step 2 is skipped
- If step 0 **fails or returns no data** → Step 1 is skipped, Step 2 ("else") executes
- Step 2 is optional — omit it if you don't need an else branch

**Condition logic**: `conditionPassed = step0.success && step0.data` (truthy check)

**Example** (Notify only if stalled POVs exist):
```javascript
services({ action: "workflow.execute",
  steps: [
    // Step 0: CONDITION - check for stalled POVs
    {
      service: "paichart-project-service",
      tool: "project",
      arguments: { action: "pov.list", status: "STALLED" }
    },
    // Step 1: THEN - alert if stalled POVs found
    {
      service: "notification-service",
      tool: "send",
      arguments: {
        channel: "slack",
        message: { subject: "Stalled POVs detected", body: "Review needed", priority: "high" }
      }
    },
    // Step 2: ELSE - all clear if condition failed
    {
      service: "notification-service",
      tool: "send",
      arguments: {
        channel: "slack",
        message: { subject: "All POVs on track", body: "No action needed", priority: "normal" }
      }
    }
  ],
  executionMode: "conditional"
})
```

**Variable chaining**: The "then" branch (step 1) can reference step 0 outputs via `{{step.0.output.data[0].id}}`. The "else" branch (step 2) cannot (step 0 failed, output may be unreliable).

**Use for**:
- Conditional notifications (alert only when issues exist)
- Graceful degradation (try primary, fall back to secondary)
- Gate checks (verify precondition before acting)

**Limitations**:
- Exactly 3 steps max (condition + then + else)
- Binary branching only (no if/else-if/else chains)
- No custom condition expressions (uses success + truthy data)

---

## Section C: Variable Chaining

### What is Variable Chaining?

**Reference previous step outputs** in later steps using `{{step.N.output...}}`.

**Syntax**:
```javascript
{{step.0.output}}                    // Entire output of step 0
{{step.0.output.data[0].id}}        // Nested field (array index + property)
{{step.0.output.totalCount}}        // Top-level field
```

---

### How It Works

**Step 0 returns**:
```json
{
  "data": [
    { "id": "cm123", "title": "Project Alpha", "status": "IN_PROGRESS" }
  ],
  "totalCount": 1
}
```

**Step 1 can reference**:
```javascript
arguments: {
  povId: "{{step.0.output.data[0].id}}",         // "cm123"
  title: "{{step.0.output.data[0].title}}",      // "Project Alpha"
  count: "{{step.0.output.totalCount}}"          // 1
}
```

**Result**: Hub replaces variables with actual values before calling service.

---

### Important: Response Structure

**All pAIchart list operations return**:
```javascript
{ data: [...], total: N }  // Consistent wrapper
```

**NOT entity-specific names**:
```javascript
{ povs: [...] }    // ❌ WRONG
{ tasks: [...] }   // ❌ WRONG
```

**This means always use `data[N]`**:
```javascript
// ✅ CORRECT
{{step.0.output.data[0].id}}      // Works for POVs, tasks, services, etc.

// ❌ WRONG
{{step.0.output.povs[0].id}}      // "povs" field doesn't exist
{{step.0.output.tasks[0].id}}     // "tasks" field doesn't exist
```

---

### Path Normalization

**Both formats work** (engine normalizes automatically):

```javascript
{{step.0.output.data[0].id}}   // Full path with 'output'
{{step.0.data[0].id}}          // Shorthand without 'output'

// Both resolve to the same value!
```

---

### Variable Chaining Examples

**Example 1**: Get POV tasks
```javascript
steps: [
  { service: "paichart-project-service", tool: "project", arguments: { action: "pov.list", limit: 1 } },
  {
    service: "paichart-project-service",
    tool: "project",
    arguments: { action: "task.list", povId: "{{step.0.output.data[0].id}}" },  // Use POV ID from step 0
    dependsOn: [0]
  }
]
```

**Example 2**: Multiple fields
```javascript
steps: [
  { service: "paichart-project-service", tool: "project", arguments: { action: "task.list", limit: 1 } },
  {
    service: "notification-service",
    tool: "send",
    arguments: {
      message: {
        subject: "Task: {{step.0.output.data[0].title}}",       // Task title
        body: "Status: {{step.0.output.data[0].status}}\nPriority: {{step.0.output.data[0].priority}}"
      }
    },
    dependsOn: [0]
  }
]
```

---

## Section D: 7 Proven Patterns

### Pattern 1: POV Status Report

**Use case**: Weekly management updates

```javascript
services({ action: "workflow.execute",
  steps: [
    { service: "paichart-project-service", tool: "project", arguments: { action: "pov.list", status: "IN_PROGRESS", limit: 10 } },
    { service: "paichart-project-service", tool: "project", arguments: { action: "pov.details", povId: "{{step.0.output.data[0].id}}" }, dependsOn: [0] },
    {
      service: "notification-service",
      tool: "send",
      arguments: {
        channel: "email",
        recipients: [{ id: "mgmt", address: "team@company.com" }],
        message: {
          subject: "POV Status: {{step.1.output.title}}",
          body: "Customer: {{step.1.output.customerName}}\nStatus: {{step.1.output.status}}",
          priority: "normal"
        }
      },
      dependsOn: [1]
    }
  ],
  executionMode: "sequential"
})
```

---

### Pattern 2: Blocked Task Escalation

**Use case**: Daily standup preparation

```javascript
services({ action: "workflow.execute",
  steps: [
    { service: "paichart-project-service", tool: "project", arguments: { action: "task.list", status: "BLOCKED", limit: 20 } },
    {
      service: "notification-service",
      tool: "escalate",
      arguments: {
        escalationPath: [
          { channel: "email", recipients: [{id: "owner", address: "owner@company.com"}], delayMinutes: 0 },
          { channel: "slack", recipients: [{id: "team", address: "#project-alerts"}], delayMinutes: 30 }
        ],
        message: {
          subject: "Blocked Tasks Alert",
          body: "Found {{step.0.output.totalCount}} blocked tasks requiring attention",
          priority: "high"
        }
      },
      dependsOn: [0]
    }
  ],
  executionMode: "sequential",
  failureStrategy: "continue"  // Send alert even if some notifications fail
})
```

---

### Pattern 3: Screenshot Documentation

**Use case**: Capture dashboards as PDFs

```javascript
services({ action: "workflow.execute",
  steps: [
    { service: "browser-automation-service", tool: "take_screenshot", arguments: { url: "https://paichart.app/dashboard", fullPage: true }, timeout: 60000 },
    { service: "browser-automation-service", tool: "generate_pdf", arguments: { url: "https://paichart.app/dashboard", pageSettings: { format: "A4", landscape: true } }, timeout: 120000 }
  ],
  executionMode: "sequential",  // Sequential to avoid resource contention
  failureStrategy: "continue",
  timeout: 180000  // 3 minutes total
})
```

**Note**: PDF generation requires extended timeout (60-120s).

---

### Pattern 4: Competitor Price Monitor

**Use case**: Market research automation

```javascript
services({ action: "workflow.execute",
  steps: [
    {
      service: "browser-automation-service",
      tool: "scrape_page",
      arguments: {
        url: "https://competitor.com/pricing",
        selectors: { title: ".product-title", price: ".price-value" },
        waitFor: ".pricing-table"
      }
    },
    {
      service: "notification-service",
      tool: "send",
      arguments: {
        channel: "slack",
        recipients: [{ id: "channel", address: "#competitive-intel" }],
        message: {
          subject: "Competitor Price Update",
          body: "Latest pricing data scraped successfully",
          priority: "normal"
        }
      },
      dependsOn: [0]
    }
  ],
  executionMode: "sequential"
})
```

---

### Pattern 5: Task Completion Notify

**Use case**: Milestone achievement announcements

```javascript
services({ action: "workflow.execute",
  steps: [
    { service: "paichart-project-service", tool: "project", arguments: { action: "task.list", status: "IN_PROGRESS", limit: 1 } },
    { service: "paichart-project-service", tool: "project", arguments: { action: "task.context", taskId: "{{step.0.output.data[0].id}}", includeHistory: true }, dependsOn: [0] },
    {
      service: "paichart-project-service",
      tool: "perform",
      arguments: {
        action: "task.complete",
        taskId: "{{step.0.output.data[0].id}}",
        completionNotes: "Completed via workflow automation"
      },
      dependsOn: [1]
    },
    {
      service: "notification-service",
      tool: "broadcast",
      arguments: {
        channels: ["email", "slack"],
        recipients: {
          email: [{ id: "team", address: "team@company.com" }],
          slack: [{ id: "channel", address: "#project-updates" }]
        },
        message: {
          subject: "Task Completed: {{step.0.output.data[0].title}}",
          body: "Task completed successfully",
          priority: "normal"
        }
      },
      dependsOn: [2]
    }
  ],
  executionMode: "sequential",
  failureStrategy: "continue"  // Send notification even if task completion fails
})
```

**Note**: Use `project(action: "task.list")` output (step.0) for variable chaining, not `project(action: "task.context")` (returns text).

---

### Pattern 6: Weekly POV Digest

**Use case**: Portfolio health report

```javascript
services({ action: "workflow.execute",
  steps: [
    // Parallel: Get POVs by status (steps 0-2 run simultaneously)
    { service: "paichart-project-service", tool: "project", arguments: { action: "pov.list", status: "IN_PROGRESS", limit: 50 } },
    { service: "paichart-project-service", tool: "project", arguments: { action: "pov.list", status: "VALIDATION", limit: 20 } },
    { service: "paichart-project-service", tool: "project", arguments: { action: "pov.list", status: "STALLED", limit: 20 } },

    // Sequential: Screenshot after data gathered
    { service: "browser-automation-service", tool: "take_screenshot", arguments: { url: "https://paichart.app/dashboard", fullPage: true }, dependsOn: [0, 1, 2] },

    // Send consolidated report
    {
      service: "notification-service",
      tool: "send",
      arguments: {
        channel: "email",
        recipients: [{ id: "mgmt", address: "leadership@company.com", name: "Leadership Team" }],
        message: {
          subject: "Weekly POV Digest",
          body: "IN_PROGRESS, VALIDATION, and STALLED POVs summary attached",
          priority: "normal"
        }
      },
      dependsOn: [3]
    }
  ],
  executionMode: "parallel",  // Respects dependsOn for smart parallelism (conditional mode is a positional 1-3 step if/then/else — not this)
  failureStrategy: "continue",
  timeout: 180000  // 3 minutes
})
```

**Smart parallelism**: Steps 0-2 run in parallel, step 3 waits for all, step 4 waits for step 3.

---

### Pattern 7: Error Monitoring Alert

**Use case**: Notify on critical errors

```javascript
services({ action: "workflow.execute",
  steps: [
    { service: "sentry-mcp", tool: "get_issues", arguments: { level: "critical", limit: 10 } },
    {
      service: "jira-mcp",
      tool: "create_issue",
      arguments: {
        summary: "Critical error: {{step.0.output.data[0].title}}",
        description: "{{step.0.output.data[0].message}}",
        priority: "high"
      },
      dependsOn: [0]
    },
    {
      service: "notification-service",
      tool: "send",
      arguments: {
        channel: "pagerduty",
        message: { subject: "Critical issue created", priority: "urgent" }
      },
      dependsOn: [1]
    }
  ],
  executionMode: "sequential"
})
```

**Capability-based discovery**: AI finds "sentry-mcp" (monitoring), "jira-mcp" (issue-tracking), "notification-service" (communication).

---

## Section E: Failure Strategies

### Strategy 1: Stop (Default)

**Behavior**: Halt immediately on first failure

```javascript
{ failureStrategy: "stop" }
```

**Execution**:
- Step 1: Success ✓
- Step 2: Failure ✗
- Step 3: Not executed ⏸️

**Use when**: Steps are dependent, continuing makes no sense

---

### Strategy 2: Continue

**Behavior**: Execute all steps, record failures

```javascript
{ failureStrategy: "continue" }
```

**Execution**:
- Step 1: Success ✓
- Step 2: Failure ✗ (recorded)
- Step 3: Executed ✓

**Use when**: Steps are independent, you want best-effort execution

**Example**: Broadcasting notifications - if email fails, still try Slack

---

### Strategy 3: Rollback

**Behavior**: Stop on first failure (same as "stop"). Rollback undo logic is not yet implemented — currently this strategy halts execution immediately, preventing further damage.

```javascript
{ failureStrategy: "rollback" }
```

**Execution**:
- Step 1: Success ✓
- Step 2: Failure ✗
- Step 3: Not executed ⏸️
- (Future: undo step 1)

**Use when**: Transaction-like workflows where continuing after failure is unacceptable

**Note**: Currently behaves identically to "stop". Automatic undo of completed steps is a planned future enhancement.

**Prerequisites before rollback can be implemented**:
1. **Accurate failure detection** — Step results must correctly report success/failure (fixed Mar 2026: isError detection, failure strategy enforcement)
2. **Action identity** — Step results need to capture *what was done* (e.g., "created record X"), not just the response data
3. **Compensating action registry** — Services must declare their undo operations (e.g., `task.complete` → `task.reopen`)
4. **Structured error context** — Errors need to indicate whether failure was total or partial (half-sent notification can't be unsent)
5. **Idempotency guarantees** — Undo operations must be safe to retry if the rollback itself fails partway through

---

## Section F: Workflow Monitoring

### Check Workflow Status

```javascript
services({ action: "workflow.status", executionId: "cmka6qpv90001yxgz95z51ogw" })
```

**Response**:
```json
{
  "status": "COMPLETED",
  "progress": "3/3 steps",
  "duration": "4521ms",
  "results": [...]
}
```

**Status values**:
- `RUNNING` - In progress
- `COMPLETED` - Success ✅
- `FAILED` - Error occurred ❌
- `CANCELLED` - User stopped it
- `TIMEOUT` - Exceeded time limit

---

### View Execution History

```javascript
services({ action: "workflow.list",
  status: "COMPLETED",  // Optional filter
  limit: 20
})
```

**Response**:
```json
{
  "executions": [
    {
      "id": "exec_1",
      "status": "COMPLETED",
      "startTime": "2026-02-02T10:00:00Z",
      "duration": 1234,
      "steps": 3
    }
  ],
  "total": 45
}
```

---

### Cancel Running Workflow

```javascript
services({ action: "workflow.cancel",
  executionId: "exec_xyz789",
  reason: "User requested cancellation"
})
```

**When to cancel**:
- Workflow taking too long
- Made a mistake in step configuration
- Service is down, no point continuing

---

## Section G: Timeouts & Limits

### Workflow Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| **Max steps** | 20 | Prevents workflow complexity |
| **Max parallel steps** | 5 | Prevents resource exhaustion |
| **Max call depth** | 3 | Prevents infinite chains |
| **Global timeout** | 10 min (600,000ms) | Maximum workflow duration |
| **Default timeout** | 1 min (60,000ms) | If not specified |
| **Min step timeout** | 1 second | Ensures meaningful execution |
| **Max step timeout** | 60 seconds | Prevents hung steps |

---

### Timeout Configuration

**Global timeout** (entire workflow):
```javascript
services({ action: "workflow.execute",
  steps: [...],
  timeout: 120000  // 2 minutes for entire workflow
})
```

**Per-step timeout** (individual operations):
```javascript
{
  service: "browser-automation-service",
  tool: "generate_pdf",
  arguments: { url: "..." },
  timeout: 120000  // 2 minutes for this step only
}
```

**Recommended timeouts**:
- PDF generation: 60-120 seconds
- Screenshots: 30-60 seconds
- API calls: 30 seconds (default)
- Scraping: 30-90 seconds

---

## Section H: Troubleshooting

### Error: "Variable resolution failed"

**Cause**: Invalid step reference path

**Example**:
```javascript
// Step 0 returns: { data: [{ id: "cm123" }] }

❌ arguments: { povId: "{{step.0.output.povs[0].id}}" }  // "povs" doesn't exist

✅ arguments: { povId: "{{step.0.output.data[0].id}}" }   // Use "data"
```

**Debug**: Run step 0 alone, check response structure

---

### Error: "Service not found"

**Cause**: Typo or service not registered

**Solution**:
```javascript
// 1. Check available services
services(action: "discover")

// 2. Verify service name exactly matches
// Case-sensitive: "notification-service" ≠ "Notification-Service"
```

---

### Error: "Service not reachable"

**Cause**: External service down

**Solution**:
```javascript
// 1. Check service health
services({ action: "health", service_name: "the-service" })

// 2. If status: "ERROR" → Service is down or unreachable
// 3. Wait for service to come back online
// 4. Or use failureStrategy: "continue" to skip failed steps
```

---

### Error: "step.N does not exist"

**Cause**: Referenced step doesn't exist

**Example**:
```javascript
// Only 2 steps defined (0, 1)
❌ arguments: { id: "{{step.5.output.id}}" }  // Step 5 doesn't exist!

✅ arguments: { id: "{{step.0.output.id}}" }  // Step 0 exists
```

**Fix**: Verify step indices match actual steps (0-indexed)

---

### Error: "Circular dependency detected"

**Cause**: Step dependencies form a loop

**Example**:
```javascript
steps: [
  { service: "a", tool: "x", dependsOn: [1] },  // Depends on step 1
  { service: "b", tool: "y", dependsOn: [0] }   // Depends on step 0
]
// Step 0 → Step 1 → Step 0 (circular!)
```

**Fix**: Remove circular dependencies

---

### Error: "Timeout exceeded"

**Cause**: Workflow took longer than timeout

**Solutions**:
1. **Increase global timeout**:
   ```javascript
   { timeout: 180000 }  // 3 minutes
   ```

2. **Increase per-step timeout** (for slow operations):
   ```javascript
   { service: "pdf-service", tool: "generate", timeout: 120000 }
   ```

3. **Optimize workflow** - Remove unnecessary steps

---

## 🚀 Best Practices

### Design

1. ✅ **Start simple** - Test with 2-3 steps before scaling
2. ✅ **Use variable chaining** - Connect steps with {{step.N.output...}}
3. ✅ **Choose right mode** - Sequential for dependent, parallel for independent
4. ✅ **Add timeouts** - Especially for PDF/screenshot generation (60-120s)

---

### Variable Chaining

1. ✅ **Always use `data[N]`** - All list operations return `{ data: [...] }`
2. ✅ **Test step outputs** - Run steps individually to verify structure
3. ✅ **Use shorthand** - `{{step.0.data[0].id}}` works (no need for "output")
4. ✅ **Reference structured data** - Use `project(action: "task.list")`, not `project(action: "task.context")` (text)

---

### Failure Handling

1. ✅ **Use "stop" for dependent workflows** - Don't continue if critical step fails
2. ✅ **Use "continue" for notifications** - Best-effort delivery
3. ✅ **Use "rollback" for transactions** - All-or-nothing operations

---

### Performance

1. ✅ **Use parallel mode** - When steps are independent (max 5 concurrent)
2. ✅ **Set appropriate timeouts** - Don't wait forever for slow services
3. ✅ **Monitor execution time** - Check `executionTime` in response
4. ✅ **Cancel long-running workflows** - If stuck or unnecessary

---

## 📚 Related Documentation

**Deep Dive Prompts**:
- [E] **external_service_auth** - Authenticate external services in workflows
- [G] **trust_levels** - Understand token passing in workflows
- [F] **security_policy** - Workflow limits, blocked patterns

**Quick Start**:
- [A] **get_started** - Role-based tutorials (Path C: Consumer)
- [D] **register_guide** - Register services to use in workflows

**Interactive**:
- `/prompt orchestrate_workflow` - Build workflows interactively

---

## 💬 Support

**Workflow Questions**: steve.terry@paichart.com
**Documentation**: https://paichart.app/docs
**Interactive Builder**: `/prompt orchestrate_workflow`

---

## 📖 Quick Reference

### Execution Modes

```javascript
executionMode: "sequential"   // Steps run in order
executionMode: "parallel"     // All steps run together
executionMode: "conditional"  // Step 0 = condition, Step 1 = then, Step 2 = else
```

### Variable Chaining

```javascript
// Reference previous outputs
{{step.0.output.data[0].id}}         // Full path
{{step.0.data[0].id}}                // Shorthand (same result)
{{step.0.output.totalCount}}         // Top-level field
```

### Failure Strategies

```javascript
failureStrategy: "stop"      // Halt on failure (default)
failureStrategy: "continue"  // Best-effort execution
failureStrategy: "rollback"  // Stop on failure (undo not yet implemented)
```

### Workflow Commands

```javascript
// Execute workflow
services({ action: "workflow.execute", steps: [...], executionMode: "sequential" })

// Check status
services({ action: "workflow.status", executionId: "..." })

// View history
services({ action: "workflow.list", status: "COMPLETED", limit: 20 })

// Cancel workflow
services({ action: "workflow.cancel", executionId: "...", reason: "..." })
```

### Limits

- Max steps: 20
- Max parallel: 5
- Max call depth: 3
- Global timeout: 10 min
- Step timeout: 1-60 seconds

### Common Patterns

1. **POV Status Report** - Get POVs → Email summary
2. **Blocked Task Escalation** - Find blockers → Notify team
3. **Screenshot Documentation** - Capture dashboard → Generate PDF
4. **Competitor Monitor** - Scrape prices → Notify changes
5. **Task Completion** - Complete task → Broadcast notification
6. **Weekly Digest** - Parallel POV fetch → Screenshot → Email
7. **Error Monitoring** - Get errors → Create ticket → Alert

---

**Version**: 1.1 | **Updated**: 2026-03-03 | **Status**: Production-Ready
**Patterns**: 7 tested workflows | **Performance**: ~1-3s per workflow (typical)
