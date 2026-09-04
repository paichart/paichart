# MCP Hub Named Workflows - Sample Reference

> **Version**: 1.1 | **Updated**: 2026-01-15 | **Status**: Production-Ready
>
> This document provides optimized, tested workflow examples for the MCP Hub.
> All workflows have been validated against production services (6/6 passing).

## Overview

Named workflows are stored in the `MCPWorkflow` database table and can be executed by name using:
```
services(action: "workflow.execute", { workflowName: "workflow-name" })
```

## Available Services

| Service | Tools | Type |
|---------|-------|------|
| `paichart-project-service` | project(action: "pov.list"), project(action: "pov.details"), get_pov_phases | Internal |
| `paichart-project-service` | project(action: "task.list"), project(action: "task.context"), perform(action: "execute") | Internal |
| `browser-automation-service` | scrape_page, take_screenshot, generate_pdf, fill_form | External |
| `notification-service` | send, broadcast, escalate, schedule | External |

**Internal services**: Always available, use InternalServiceRouter
**External services**: Must be running, use ServiceConnectionPool

## Variable Chaining Syntax

Reference previous step outputs with `{{step.N.output...}}`:

```javascript
// Step 0 returns: { data: [{ id: 'cm123', title: 'My POV' }] }

// Step 1 can reference:
arguments: {
  povId: '{{step.0.output.data[0].id}}',      // 'cm123'
  title: '{{step.0.output.data[0].title}}'     // 'My POV'
}
```

**Important Notes**:
- Internal APIs return `data` arrays, not entity-named arrays (use `data[0].id`, not `povs[0].id`)
- `project(action: "task.context")` returns **text content**, not structured data - use `project(action: "task.list")` output for task fields
- For notification messages, reference the step that returns structured data (typically `project(action: "task.list")` or `project(action: "pov.list")`)

## Execution Modes

| Mode | Behavior |
|------|----------|
| `sequential` | Steps run in order, can chain variables |
| `parallel` | Independent steps run together |
| `conditional` | Step 0 = condition, Step 1 = then, Step 2 = else |

## Failure Strategies

| Strategy | Behavior |
|----------|----------|
| `stop` | Stop on first failure (default) |
| `continue` | Continue despite failures |
| `rollback` | Attempt to undo completed steps |

## Timeouts

**Global timeout**: Set at workflow level (default: 60000ms)
```javascript
{ timeout: 120000 }  // 2 minutes for entire workflow
```

**Per-step timeout**: Set on individual steps for long-running operations
```javascript
{
  service: 'browser-automation-service',
  tool: 'generate_pdf',
  arguments: { url: '...' },
  timeout: 120000  // 2 minutes for this step only
}
```

**Best Practices**:
- PDF generation: 60-120 seconds
- Screenshots: 30-60 seconds
- API calls: 30 seconds (default)
- Scraping: 30-90 seconds depending on page complexity

---

## Sample Workflows

### 1. POV Status Report

**Purpose**: Generate and send a POV status report to stakeholders.

**Use Cases**:
- Weekly status updates to management
- Client meeting preparation
- Portfolio health check

```javascript
services(action: "workflow.execute", { workflowName: "pov-status-report" })
```

**Definition**:
```javascript
{
  name: 'pov-status-report',
  category: 'reporting',
  steps: {
    steps: [
      {
        service: 'paichart-project-service',
        tool: 'project(action: "pov.list")',
        arguments: {
          status: 'IN_PROGRESS',
          limit: 10
        }
      },
      {
        service: 'paichart-project-service',
        tool: 'project(action: "pov.details")',
        arguments: {
          povId: '{{step.0.output.data[0].id}}'
        },
        dependsOn: [0]
      },
      {
        service: 'notification-service',
        tool: 'send',
        arguments: {
          channel: 'email',
          recipients: [
            { id: 'stakeholder', address: 'team@company.com', name: 'Team' }
          ],
          message: {
            subject: 'POV Status Report: {{step.1.output.title}}',
            body: 'POV: {{step.1.output.title}}\nCustomer: {{step.1.output.customerName}}\nStatus: {{step.1.output.status}}',
            priority: 'normal'
          }
        },
        dependsOn: [1]
      }
    ],
    executionMode: 'sequential',
    failureStrategy: 'stop',
    timeout: 60000
  }
}
```

---

### 2. Blocked Task Escalation

**Purpose**: Find blocked tasks and send escalation notifications.

**Use Cases**:
- Daily standup preparation
- Bottleneck identification
- Proactive issue resolution

```javascript
services(action: "workflow.execute", { workflowName: "blocked-task-escalation" })
```

**Definition**:
```javascript
{
  name: 'blocked-task-escalation',
  category: 'automation',
  steps: {
    steps: [
      {
        service: 'paichart-project-service',
        tool: 'project(action: "task.list")',
        arguments: {
          status: 'BLOCKED',
          limit: 20
        }
      },
      {
        service: 'notification-service',
        tool: 'escalate',
        arguments: {
          escalationPath: [
            {
              channel: 'email',
              recipients: [{ id: 'owner', address: 'owner@company.com' }],
              delayMinutes: 0
            },
            {
              channel: 'slack',
              recipients: [{ id: 'team', address: '#project-alerts' }],
              delayMinutes: 30
            }
          ],
          message: {
            subject: 'Blocked Tasks Alert',
            body: 'Found {{step.0.output.totalCount}} blocked tasks requiring attention.',
            priority: 'high'
          },
          maxEscalations: 3
        },
        dependsOn: [0]
      }
    ],
    executionMode: 'sequential',
    failureStrategy: 'continue',
    timeout: 45000
  }
}
```

---

### 3. Screenshot Documentation

**Purpose**: Capture screenshots and generate PDF documentation.

**Use Cases**:
- Visual documentation of dashboards
- Compliance evidence capture
- Before/after comparison for changes
- Client presentation materials

```javascript
services(action: "workflow.execute", { workflowName: "screenshot-documentation" })
```

**Definition**:
```javascript
{
  name: 'screenshot-documentation',
  category: 'documentation',
  steps: {
    steps: [
      {
        service: 'browser-automation-service',
        tool: 'take_screenshot',
        arguments: {
          url: 'https://paichart.app/dashboard',
          fullPage: true
        },
        timeout: 60000  // 60s for screenshot
      },
      {
        service: 'browser-automation-service',
        tool: 'generate_pdf',
        arguments: {
          url: 'https://paichart.app/dashboard',
          pageSettings: {
            format: 'A4',
            landscape: true,
            margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
          }
        },
        timeout: 120000  // 120s for PDF generation (can be slow)
      }
    ],
    executionMode: 'sequential',  // Sequential to avoid resource contention
    failureStrategy: 'continue',
    timeout: 180000  // 3 minutes total
  }
}

// NOTE: PDF generation requires extended timeout. The default 30s is insufficient.
// Changed from parallel to sequential after production testing (2026-01-15).
```

---

### 4. Competitor Price Monitor

**Purpose**: Monitor competitor pricing and alert on changes.

**Use Cases**:
- Daily competitive intelligence
- Price change monitoring
- Market research automation

```javascript
services(action: "workflow.execute", { workflowName: "competitor-price-monitor" })
```

**Definition**:
```javascript
{
  name: 'competitor-price-monitor',
  category: 'intelligence',
  steps: {
    steps: [
      {
        service: 'browser-automation-service',
        tool: 'scrape_page',
        arguments: {
          url: 'https://example.com/pricing',
          selectors: {
            title: '.product-title',
            price: '.price-value',
            currency: '.currency-symbol'
          },
          waitFor: '.pricing-table'
        }
      },
      {
        service: 'notification-service',
        tool: 'send',
        arguments: {
          channel: 'slack',
          recipients: [{ id: 'channel', address: '#competitive-intel' }],
          message: {
            subject: 'Competitor Price Update',
            body: 'Latest pricing data scraped successfully. Check dashboard for details.',
            priority: 'normal'
          }
        },
        dependsOn: [0]
      }
    ],
    executionMode: 'sequential',
    failureStrategy: 'stop',
    timeout: 90000
  }
}
```

---

### 5. Task Completion Notify

**Purpose**: Mark a task complete and notify the team.

**Use Cases**:
- Automated task completion workflows
- Milestone achievement announcements
- Team celebration triggers

```javascript
services(action: "workflow.execute", { workflowName: "task-completion-notify" })
```

**Definition**:
```javascript
{
  name: 'task-completion-notify',
  category: 'automation',
  steps: {
    steps: [
      {
        service: 'paichart-project-service',
        tool: 'project(action: "task.list")',
        arguments: {
          status: 'IN_PROGRESS',
          limit: 1
        }
      },
      {
        service: 'paichart-project-service',
        tool: 'project(action: "task.context")',
        arguments: {
          taskId: '{{step.0.output.data[0].id}}',
          includeHistory: true
        },
        dependsOn: [0]
      },
      {
        service: 'paichart-project-service',
        tool: 'perform(action: "execute")',
        arguments: {
          action: 'task.complete',
          taskId: '{{step.0.output.data[0].id}}',
          completionNotes: 'Completed via workflow automation'  // Flat, not nested in parameters
        },
        dependsOn: [1]
      },
      {
        service: 'notification-service',
        tool: 'broadcast',
        arguments: {
          channels: ['email', 'slack'],
          recipients: {
            email: [{ id: 'team', address: 'team@company.com' }],
            slack: [{ id: 'channel', address: '#project-updates' }]
          },
          message: {
            // Use step.0 (project(action: "task.list")) for structured data, NOT step.1 (project(action: "task.context") returns text)
            subject: 'Task Completed: {{step.0.output.data[0].title}}',
            body: 'Task "{{step.0.output.data[0].title}}" has been marked complete.\n\nStatus: {{step.0.output.data[0].status}}\nPriority: {{step.0.output.data[0].priority}}\nPhase: {{step.0.output.data[0].phase.name}}',
            priority: 'normal'
          }
        },
        dependsOn: [2]
      }
    ],
    executionMode: 'sequential',
    failureStrategy: 'continue',  // Continue even if notification fails
    timeout: 60000
  }
}

// NOTE: perform(action: "execute") expects flat arguments, not nested in 'parameters'.
// Use project(action: "task.list") output (step.0) for variable chaining - project(action: "task.context") returns text content.
// Changed failureStrategy from 'rollback' to 'continue' after production testing (2026-01-15).
```

---

### 6. Weekly POV Digest

**Purpose**: Generate weekly digest of all POVs by status.

**Use Cases**:
- Weekly management reports
- Monday morning status sync
- Portfolio review meetings

```javascript
services(action: "workflow.execute", { workflowName: "weekly-pov-digest" })
```

**Definition**:
```javascript
{
  name: 'weekly-pov-digest',
  category: 'reporting',
  steps: {
    steps: [
      // Parallel: Get POVs by status (steps 0-2 have no dependencies)
      {
        service: 'paichart-project-service',
        tool: 'project(action: "pov.list")',
        arguments: { status: 'IN_PROGRESS', limit: 50 }
      },
      {
        service: 'paichart-project-service',
        tool: 'project(action: "pov.list")',
        arguments: { status: 'VALIDATION', limit: 20 }
      },
      {
        service: 'paichart-project-service',
        tool: 'project(action: "pov.list")',
        arguments: { status: 'STALLED', limit: 20 }
      },
      // Sequential: Screenshot after data gathered
      {
        service: 'browser-automation-service',
        tool: 'take_screenshot',
        arguments: {
          url: 'https://paichart.app/dashboard',
          fullPage: true
        },
        dependsOn: [0, 1, 2]  // Wait for all status queries
      },
      // Send consolidated report
      {
        service: 'notification-service',
        tool: 'send',
        arguments: {
          channel: 'email',
          recipients: [
            { id: 'management', address: 'leadership@company.com', name: 'Leadership Team' }
          ],
          message: {
            subject: 'Weekly POV Digest - Active Projects Report',
            body: 'Weekly POV Status Summary:\n\nIN_PROGRESS: Active POVs\nVALIDATION: POVs ready to close\nSTALLED: POVs needing intervention\n\nDashboard screenshot attached.',
            priority: 'normal'
          }
        },
        dependsOn: [3]
      }
    ],
    executionMode: 'sequential',  // Respects dependsOn for smart parallelism
    failureStrategy: 'continue',
    timeout: 180000
  }
}
```

---

## Creating New Workflows

### Via Seed Script

Add to `scripts/seed-example-workflows.ts`:

```typescript
const NEW_WORKFLOW: WorkflowDefinition = {
  id: 'workflow-unique-id',
  name: 'my-workflow-name',
  description: 'What it does...',
  category: 'automation',  // reporting, automation, documentation, intelligence
  steps: {
    steps: [...],
    executionMode: 'sequential',
    failureStrategy: 'stop',
    timeout: 60000
  }
};
```

Run: `npx ts-node -r tsconfig-paths/register scripts/seed-example-workflows.ts`

### Via API (Ad-hoc)

```javascript
services(action: "workflow.execute")({
  steps: [
    { service: 'paichart-project-service', tool: 'project(action: "pov.list")', arguments: { status: 'IN_PROGRESS' } },
    { service: 'paichart-project-service', tool: 'project(action: "task.list")', arguments: { povId: '{{step.0.output.data[0].id}}' }, dependsOn: [0] }
  ],
  executionMode: 'sequential'
})
```

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Service not found` | Typo or service not registered | Use `services(action: "discover")()` to see available services |
| `Service not reachable` | External service down | Check if browser-automation-service or notification-service is running |
| `Variable resolution failed` | Invalid step reference | Verify `{{step.N.output...}}` paths match actual response structure |
| `SSE error: 404` | Service endpoint not found | Service is registered but not running |

### Debugging Variable Chains

Test step outputs individually:

```javascript
// First, run step 0 alone
project(action: "pov.list", { status: 'IN_PROGRESS', limit: 1 })
// Check response: { data: [{ id: 'cm123', title: '...' }] }

// Verify your path: data[0].id = 'cm123'
```

### Service Health

```javascript
services(action: "health", { service_name: 'notification-service' })
```

---

## See Also

- `/.claude/knowledge/domain/mcp/mcp-hub-workflow-orchestration-reference.md` - Complete orchestration reference
- `/.claude/knowledge/domain/mcp/workflow-dual-handler-architecture.md` - Handler architecture
- `scripts/seed-example-workflows.ts` - Source seed script
