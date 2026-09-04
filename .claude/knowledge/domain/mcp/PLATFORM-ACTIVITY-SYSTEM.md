# Platform Activity System

> **Version**: 1.0 | **Updated**: 2026-01-12
> **Status**: Production
> **Confidence**: 92%
> **Related Files**:
> - `lib/auth/audit.ts` (TypeScript core)
> - `lib/services/workflow/security/orchestration-audit.ts` (TypeScript wrapper)
> - `lib/mcp/server/tools/hub/workflow-tools-handler.js` (JavaScript implementation)

---

## Overview

The Platform Activity System provides **platform-wide audit trail logging** for security, compliance, and operational events. Unlike the Task Activity System (which tracks task-specific changes), this system captures cross-cutting concerns like permissions, security violations, admin actions, and workflow orchestration.

**Key Capabilities:**
- Platform-wide audit trail (not task-specific)
- 10+ activity types (security, permissions, admin, orchestration)
- Dual implementation paths (TypeScript + JavaScript)
- Source tracking (`web_ui`, `api`, `mcp_hub`, `cron`, etc.)
- Fire-and-forget logging pattern
- JSONB metadata for flexible structured data

> **See also**: For task-specific activity tracking (status changes, assignments, comments, agent runs), see [`TASK-ACTIVITY-SYSTEM.md`](./TASK-ACTIVITY-SYSTEM.md).

---

## Two Activity Systems

pAIchart has **two separate activity systems** for different purposes:

| System | Table | Purpose | Scope |
|--------|-------|---------|-------|
| **Platform Activity** | `Activity` | Security, permissions, admin, orchestration | Platform-wide |
| **Task Activity** | `TaskActivity` | Status, assignments, comments, agent runs | Per-task |

This document covers the **Platform Activity** system.

---

## 1. Operational Goals

### 1.1 Security & Compliance
- **Audit Trail**: Complete record of who did what, when, and from where
- **Incident Investigation**: Trace security events back to source
- **Compliance**: Meet regulatory requirements for activity logging (SOC2, GDPR)
- **Anomaly Detection**: Identify unusual patterns (e.g., bulk operations, off-hours access)

### 1.2 Debugging & Operations
- **Source Identification**: Know if activity originated from `web_ui`, `api`, `mcp_hub`, `cron`, etc.
- **Request Tracing**: Follow a request across system boundaries
- **Error Correlation**: Link failures to specific workflows or services
- **Performance Analysis**: Identify slow or problematic operations

### 1.3 Analytics & Insights
- **Usage Patterns**: Understand how MCP Hub services are used
- **User Behavior**: Track feature adoption and workflow preferences
- **Capacity Planning**: Predict resource needs based on activity trends
- **Success Metrics**: Measure workflow completion rates

---

## 2. Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Activity Table (Prisma)                     │
│  { userId, type, action, metadata: { source, timestamp, ... } } │
└─────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ prisma.activity.create()
                                 │
        ┌────────────────────────┴────────────────────────┐
        │                                                  │
   TypeScript Path                                  JavaScript Path
   (Next.js API, Services)                          (MCP Server)
        │                                                  │
        ▼                                                  ▼
┌───────────────────┐                          ┌───────────────────┐
│  trackActivity()  │                          │ auditOrchestration│
│  lib/auth/audit.ts│                          │ (local function)  │
│                   │                          │ workflow-tools-   │
│  - Generic API    │                          │ handler.js        │
│  - Used by all TS │                          │                   │
│  - 10+ callers    │                          │  - MCP-specific   │
│                   │                          │  - source:'mcp_hub│
└───────────────────┘                          └───────────────────┘
        │
        ▼
┌───────────────────┐
│orchestration-audit│
│.ts (wrapper)      │
│                   │
│ - Workflow-specific
│ - Adds context    │
│ - source:'mcp_hub'│
└───────────────────┘
```

### 2.2 Why Two Paths?

The dual-path architecture exists because of **process separation**:
- **Next.js process** runs TypeScript services and API routes
- **MCP Server process** runs JavaScript handlers for AI clients
- These are separate Node.js processes that cannot directly call each other

Both paths write to the same `Activity` table with aligned data structures.

> **See also**: [`workflow-dual-handler-architecture.md`](./workflow-dual-handler-architecture.md) for full explanation of process boundaries.

---

## 3. Data Model

### 3.1 Activity Table (Prisma)

```prisma
model Activity {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  type      String   // e.g., 'SECURITY_EVENT', 'WORKFLOW_ORCHESTRATION'
  action    String   // e.g., 'orchestration.start', 'permission.denied'
  metadata  Json?    @db.JsonB
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(...)

  @@index([userId])
  @@index([type])
  @@index([createdAt])
  @@map("activities")
}
```

### 3.2 Metadata Schema

```typescript
// lib/auth/audit.ts
interface AuditLogMetadata {
  resourceId?: string;
  resourceType?: ResourceType;
  action?: ResourceAction;
  details?: string;
  success: boolean;
  error?: string;
  ip?: string;
  userAgent?: string;
  source?: ActivitySource;
  [key: string]: any;
}

type ActivitySource =
  | 'web_ui'        // Browser/frontend actions
  | 'api'           // Direct API calls
  | 'mcp_hub'       // MCP Hub orchestration
  | 'mcp_server'    // MCP server operations
  | 'webhook'       // External webhook triggers
  | 'cron'          // Scheduled jobs
  | 'system'        // Internal system operations
  | 'admin'         // Admin panel actions
  | string;         // Allow custom sources
```

---

## 4. Activity Types

### 4.1 Core Types

| Type | Action Pattern | Purpose |
|------|----------------|---------|
| `PERMISSION_CHECK` | `permission.granted`, `permission.denied` | Access control decisions |
| `ROLE_CHANGE` | `role.updated` | User role modifications |
| `TEAM_MEMBERSHIP` | `team.member.added`, `team.member.removed` | Team changes |
| `PERMISSION_CHANGE` | `permission.updated` | Permission setting changes |
| `PHASE_STAGE_OPERATION` | `phase.created`, `stage.deleted` | Lifecycle events |
| `TEMPLATE_APPLICATION` | `template.applied` | Agent template usage |
| `SECURITY_VIOLATION` | `security.violation` | Security breach attempts |
| `TEMPLATE_MUTATION` | `template.created`, `template.updated` | Template CRUD |
| `WORKFLOW_ORCHESTRATION` | `orchestration.start`, `orchestration.complete` | MCP Hub workflows |
| `SECURITY_EVENT` | `orchestration.security.access_denied` | Orchestration security |

### 4.2 ActivitySource Values

| Source | Description | Used By |
|--------|-------------|---------|
| `web_ui` | Browser/frontend actions | React components, forms |
| `api` | Direct API calls | External integrations |
| `mcp_hub` | MCP Hub orchestration | Workflow execution, service calls |
| `mcp_server` | MCP server operations | Tool execution, resource access |
| `webhook` | External webhook triggers | GitHub, Slack integrations |
| `cron` | Scheduled jobs | Cleanup, reporting jobs |
| `system` | Internal system operations | Migrations, startup tasks |
| `admin` | Admin panel actions | User management, settings |

---

## 5. Module Responsibilities

### 5.1 TypeScript: `lib/auth/audit.ts`

**Purpose**: Core activity tracking API for the entire platform

| Function | Purpose |
|----------|---------|
| `trackActivity()` | Generic activity logging (base function) |
| `logPermissionCheck()` | Permission grant/deny events |
| `logRoleChange()` | User role modifications |
| `logTeamMembershipChange()` | Team add/remove events |
| `logPermissionChange()` | Permission setting changes |
| `logPhaseStageOperation()` | Phase/stage lifecycle events |
| `logTemplateApplication()` | Agent template usage |
| `logSecurityViolation()` | Security breach attempts |
| `logTemplateMutation()` | Template CRUD operations |
| `getAuditLogs()` | Query activity history |

### 5.2 TypeScript: `lib/services/workflow/security/orchestration-audit.ts`

**Purpose**: Specialized wrapper for MCP Hub workflow orchestration

| Function | Purpose |
|----------|---------|
| `auditOrchestration()` | Log workflow start/complete/step/failed |
| `auditSecurityEvent()` | Log access_denied/policy_violation/unauthorized_service |

**Key Features**:
- Accepts `OrchestrationContext` (rich context object)
- Automatically extracts userId, povId, workflowId
- Adds `source: 'mcp_hub'` to all events

### 5.3 JavaScript: `lib/mcp/server/tools/hub/workflow-tools-handler.js`

**Purpose**: Direct activity logging for MCP server (runs in separate process)

| Function | Purpose |
|----------|---------|
| `auditOrchestration()` | Log workflow events (mirrors TS version) |
| `auditSecurityEvent()` | Log security events (mirrors TS version) |

**Key Features**:
- Runs in MCP server process (separate from Next.js)
- Direct `prisma.activity.create()` calls
- Adds `source: 'mcp_hub'` to all events

---

## 6. Integration Points (10+)

| Location | Activity Types |
|----------|----------------|
| `lib/settings/services/settings.ts` | Settings changes |
| `lib/admin/handlers/settings.ts` | Admin settings |
| `lib/admin/handlers/user.ts` | User management |
| `lib/services/workflow/security/orchestration-audit.ts` | Workflow orchestration |
| `lib/mcp/server/tools/hub/workflow-tools-handler.js` | MCP orchestration |
| `lib/auth/` (various) | Permission checks |
| `lib/pov/handlers/` | POV operations |
| `lib/agents/handlers/` | Agent operations |
| API routes | Direct operations |

---

## 7. Consumers

### 7.1 Admin Audit Dashboard

```
/admin/audit
```

Displays platform-wide activity with filtering by:
- User
- Type
- Source
- Date range

### 7.2 API Endpoint

```
GET /api/audit
```

Query activities programmatically with same filters.

### 7.3 Direct Queries (Debugging)

```sql
-- All MCP Hub activities
SELECT * FROM Activity
WHERE metadata->>'source' = 'mcp_hub'
ORDER BY createdAt DESC;

-- Compare sources
SELECT metadata->>'source' as source, COUNT(*)
FROM Activity
GROUP BY metadata->>'source';

-- Security events
SELECT * FROM Activity WHERE type = 'SECURITY_EVENT';

-- User's recent activity
SELECT * FROM Activity
WHERE userId = 'user_123'
ORDER BY createdAt DESC LIMIT 50;
```

---

## 8. Quick Reference

### Add Activity from TypeScript

```typescript
import { trackActivity } from '@/lib/auth/audit';

await trackActivity(userId, 'MY_TYPE', 'my.action', {
  success: true,
  source: 'web_ui',
  customField: 'value'
});
```

### Add Activity from JavaScript (MCP Server)

```javascript
await prisma.activity.create({
  data: {
    userId,
    type: 'MY_TYPE',
    action: 'my.action',
    metadata: {
      success: true,
      source: 'mcp_hub',
      timestamp: new Date().toISOString(),
      customField: 'value'
    }
  }
});
```

### Query Activities by Source

```typescript
const mcpActivities = await prisma.activity.findMany({
  where: {
    metadata: {
      path: ['source'],
      equals: 'mcp_hub'
    }
  },
  orderBy: { createdAt: 'desc' },
  take: 100
});
```

---

## 9. Future Considerations

### 9.1 Planned Features

- **Real-time Dashboard**: WebSocket-powered activity stream
- **Alerting**: Trigger alerts on security events
- **Export**: CSV/JSON export for compliance
- **Retention**: Automated archival and cleanup

### 9.2 JS/TS Consolidation (Optional)

Currently, TypeScript and JavaScript have separate implementations that are **functionally aligned**. Future consolidation options:

**Option A: JS imports compiled TS**
```javascript
const { trackActivity } = require('../../../../auth/audit');
```

**Option B: Shared audit utility**
```javascript
// lib/shared/audit-utils.js (CommonJS, no TS dependencies)
function createActivityData(userId, type, action, metadata = {}) {
  return { userId, type, action, metadata: { timestamp: new Date().toISOString(), ...metadata } };
}
```

**Option C: Extract to shared package**
- Create `@paichart/audit` internal package
- Both TS and JS import from package

**Current recommendation**: Keep current structure (both aligned, low risk).

**When to consolidate**:
- Adding new activity types that need to work in both
- Refactoring MCP server architecture
- Implementing real-time activity streaming

---

## 10. Related Documentation

- **Task Activity System**: [`TASK-ACTIVITY-SYSTEM.md`](./TASK-ACTIVITY-SYSTEM.md) (task-specific changes)
- **Workflow Architecture**: [`workflow-dual-handler-architecture.md`](./workflow-dual-handler-architecture.md) (process boundaries)
- **MCP Hub Reference**: [`mcp-hub-workflow-orchestration-reference.md`](./mcp-hub-workflow-orchestration-reference.md)
