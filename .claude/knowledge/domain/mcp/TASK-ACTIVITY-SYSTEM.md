# Task Activity System

> **Last Updated**: January 2026 (Updated 2026-01-05)
> **Status**: Production - Rich Details + Visual Redesign + Workflow Support Complete
> **Confidence**: 94%

## Overview

The Task Activity System provides **comprehensive audit trail logging** for all task-related changes across the platform. It captures structured activity data with rich details and displays them using distinctive visual treatments in the TaskActivityTimeline component.

**Key Capabilities:**
- 18 activity types (status, priority, assignment, comments, agent executions, stage/phase changes, workflows)
- Rich JSONB details for structured data storage
- Fire-and-forget logging pattern (non-blocking)
- Inline visual treatments (diffs, quote blocks, agent cards, Kanban lanes, workflow cards)
- AUDIT mode for metadata inspection
- POV-scoped filtering for multi-tenant access
- Workflow execution tracking (MCPServiceOrchestrationHandler integration)

## Architecture

### Data Flow

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Activity Sources   │────▶│  taskActivityService │────▶│  TaskActivity DB    │
│  (22 locations)     │     │  (fire-and-forget)   │     │  (details JSONB)    │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
                                                                   │
                                                                   ▼
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  TaskActivity       │◀────│  /api/tasks/.../     │◀────│  Prisma Query       │
│  Timeline UI        │     │  activities          │     │  (POV-scoped)       │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
```

### Core Files

| Layer | File | Purpose |
|-------|------|---------|
| **Schema** | `prisma/schema.prisma` | TaskActivity model with details JSONB |
| **Types** | `lib/types/activity.ts` | Shared types, Zod schemas, action enum |
| **Service** | `lib/services/taskActivityService.ts` | 12 logging methods + CRUD |
| **API** | `app/api/tasks/[taskId]/activities/route.ts` | Task-specific activities |
| **API** | `app/api/tasks/global/activities/route.ts` | Cross-task activities |
| **Frontend** | `components/tasks/TaskActivityTimeline.tsx` | Main timeline display |
| **Frontend** | `components/tasks/activity-visuals.tsx` | 6 visual treatment components |
| **Constants** | `lib/constants/bloomberg-styles.ts` | ACTION_SYMBOLS (16 types) |

## Schema

### TaskActivity Model

```prisma
model TaskActivity {
  id        String   @id @default(cuid())
  taskId    String   @map("task_id")
  userId    String   @map("user_id")
  action    String
  details   Json?    @db.JsonB    // Rich structured data
  timestamp DateTime @default(now())

  task      Task     @relation(...)
  user      User     @relation(...)

  @@index([taskId])
  @@index([userId])
  @@index([timestamp])
  @@map("task_activities")
}
```

### Details Schema (TypeScript)

```typescript
interface ActivityDetails {
  // Field changes
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;

  // Assignment
  assigneeName?: string;
  assigneeId?: string;
  previousAssignee?: { id: string; name: string };

  // Comments
  comment?: string;

  // Agent execution
  agentName?: string;
  executionId?: string;
  executionStatus?: 'PENDING' | 'READY' | 'RUNNING' | 'PENDING_REVIEW'
                  | 'REVIEW_APPROVED' | 'REVIEW_REJECTED' | 'SUCCESS' | 'FAILED';

  // Stage/Phase changes (human-readable names for timeline display)
  oldStageName?: string;
  newStageName?: string;
  oldPhaseName?: string;
  newPhaseName?: string;

  // Attachments
  attachmentName?: string;
  attachmentId?: string;
  fileSize?: number;
  fileType?: string;

  // Workflow execution (Added 2026-01-05)
  workflowId?: string;           // MCPWorkflowExecution.id
  workflowType?: string;         // e.g., 'mcp_service_orchestration', 'browser_automation'
  workflowStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  workflowStepCount?: number;    // Total steps executed
  workflowExecutionTime?: number; // Total execution time in ms

  // Metadata
  source?: 'WEB' | 'API' | 'MCP' | 'AGENT' | 'SYSTEM';
}
```

## Activity Types (18)

| Action | Symbol | Color | Visual Treatment |
|--------|--------|-------|------------------|
| `CREATED` | `+` | green | None (creation event) |
| `COMPLETED` | `✓` | emerald | None (completion event) |
| `REOPENED` | `↺` | amber | None (reopen event) |
| `UPDATED` | `~` | yellow | Transition (if details) |
| `ASSIGNED` | `→` | blue | Transition |
| `UNASSIGNED` | `←` | purple | Transition |
| `STATUS_CHANGED` | `◐` | orange | Transition |
| `PRIORITY_CHANGED` | `!` | red | Transition |
| `COMMENT_ADDED` | `"` | indigo | Quote block |
| `AGENT_EXECUTED` | `⚡` | cyan | Agent card |
| `DUE_DATE_CHANGED` | `⏰` | amber | Transition |
| `TITLE_UPDATED` | `✎` | teal | None |
| `DESCRIPTION_UPDATED` | `✎` | teal | None |
| `PHASE_CHANGED` | `➜` | pink | Phase transition |
| `STAGE_CHANGED` | `◈` | violet | Stage transition |
| `ATTACHMENT_ADDED` | `📎` | sky | Attachment badge |
| `ATTACHMENT_REMOVED` | `📎` | gray | Attachment badge |
| `WORKFLOW_EXECUTED` | `⚙` | fuchsia | Workflow card (NEW) |

> **Note**: All 18 activity types now have full parity between `TaskActivityAction` enum, `ACTION_SYMBOLS`, and `TaskActivityActionSchema` (verified 2026-01-05).

## Service Methods

### taskActivityService (13 methods)

```typescript
// Rich logging methods (fire-and-forget)
logTaskCreated(taskId, userId, metadata?)
logTaskCompleted(taskId, userId, metadata?)
logTaskReopened(taskId, userId, metadata?)
logFieldChange(taskId, userId, change, metadata?)      // Generic field changes
logTaskAssignment(taskId, userId, newAssignee, oldAssignee?, metadata?)
logTaskUnassignment(taskId, userId, oldAssignee?, metadata?)
logCommentAdded(taskId, userId, comment, metadata?)
logAgentExecution(taskId, userId, agent, execution, metadata?)
logStageChange(taskId, userId, stageChange, metadata?)
logPhaseChange(taskId, userId, phaseChange, metadata?)
logAttachmentAdded(taskId, userId, attachment, metadata?)
logAttachmentRemoved(taskId, userId, attachment, metadata?)
logWorkflowExecution(taskId, userId, workflow, metadata?)  // NEW 2026-01-05
```

### logWorkflowExecution Signature

```typescript
function logWorkflowExecution(
  taskId: string,
  userId: string,
  workflow: {
    workflowId: string;
    workflowType: string;                    // e.g., 'mcp_service_orchestration'
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
    stepCount?: number;
    executionTime?: number;                  // in ms
  },
  metadata?: ActivityMetadata
): void
```

### Fire-and-Forget Pattern

Activity logging uses a non-blocking pattern to prevent audit failures from affecting user operations:

```typescript
// In handler/service code
taskActivityService.logStatusChange(taskId, userId, oldStatus, newStatus)
  .catch(err => taskLogger.error({ err }, 'Failed to log status change'));

// Returns immediately, logging happens async
return { success: true, task: updatedTask };
```

**Benefits:**
- User operation never blocked by activity logging
- Failed logging doesn't cause 500 errors
- Graceful degradation (audit may be incomplete vs operation fails)

**Trade-off:** Activity logs may occasionally be incomplete if logging fails.

## Visual Components

### 7 Treatment Types

Located in `components/tasks/activity-visuals.tsx`:

#### 1. ActivityTransition (Inline Diffs)
```
OPEN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━> IN_PROGRESS
```
Used for: STATUS_CHANGED, PRIORITY_CHANGED, ASSIGNED, DUE_DATE_CHANGED

#### 2. ActivityComment (Quote Blocks)
```
▌ "This task needs more details about the integration requirements..."
```
Used for: COMMENT_ADDED

#### 3. ActivityAgentCard (Status Cards)
```
┌─────────────────────────────────────────────────┐
│ 🤖 Technical Analysis Agent          [SUCCESS] │
│ ████████████████████ 100%                       │
│ Execution: abc1234  Duration: 2.3s  Tokens: 847 │
└─────────────────────────────────────────────────┘
```
Used for: AGENT_EXECUTED

#### 4. ActivityStageTransition (Kanban Lanes)
```
[ Requirements ] ───────────────────> [ Technical Design ]
```
Used for: STAGE_CHANGED

#### 5. ActivityPhaseTransition (Phase Changes)
```
╔═══════════════════════════════════════════════════════════╗
║  Discovery  ══════════════════════════>  Implementation   ║
╚═══════════════════════════════════════════════════════════╝
```
Used for: PHASE_CHANGED

#### 6. ActivityAttachment (File Badges)
```
[ PDF ] quarterly-report.pdf ──────────────────── 2.4 MB
```
Used for: ATTACHMENT_ADDED, ATTACHMENT_REMOVED

#### 7. ActivityWorkflow (Workflow Cards) - NEW 2026-01-05
```
┌─────────────────────────────────────────────────┐
│ ⚙ MCP Service Orchestration          [SUCCESS] │
│ ████████████████████ 100%                       │
│ Workflow: abc1234  Steps: 3  Duration: 4.2s     │
└─────────────────────────────────────────────────┘
```
Used for: WORKFLOW_EXECUTED

### AUDIT Mode

Toggle in TaskActivityTimeline header reveals metadata:
- IP Address
- Source (WEB, API, MCP, SYSTEM)
- Request/Session ID
- Full timestamp
- User email
- Task ID
- Raw action string

## API Endpoints

### Task-Specific Activities

```
GET /api/tasks/[taskId]/activities
GET /api/tasks/[taskId]/activities/summary
GET /api/tasks/[taskId]/activities/export?format=csv
```

**Query Parameters:**
- `action` - Filter by action type
- `userId` - Filter by user
- `dateRange` - 7d, 30d, 90d
- `source` - WEB, API, MCP, SYSTEM
- `limit` - Max results (default 100)
- `includeDetails` - Include rich details (default true)

### Global Activities (Cross-Task)

```
GET /api/tasks/global/activities
GET /api/tasks/global/activities/summary
```

**Additional Parameters:**
- `povId` - Filter by POV (required for non-admin)
- `taskId` - Set to 'global' for cross-task view

### Response Format

```typescript
{
  data: {
    activities: TaskActivity[];
    pagination: { total, page, limit };
  }
}

// With includeDetails=true
{
  data: {
    activities: [
      {
        id: "cm...",
        taskId: "cm...",
        userId: "cm...",
        action: "STATUS_CHANGED",
        details: {
          fieldName: "status",
          oldValue: "OPEN",
          newValue: "IN_PROGRESS"
        },
        timestamp: "2026-01-01T10:30:00Z",
        user: { id, name, email }
      }
    ]
  }
}
```

## Integration Points

Activity logging is integrated in **24 locations** across the codebase:

### Task Operations
- `lib/tasks/handlers/taskHandler.ts` - CRUD operations
- `lib/tasks/handlers/taskUpdateHandler.ts` - Field updates
- `lib/tasks/handlers/taskStatusHandler.ts` - Status changes
- `lib/tasks/handlers/taskAssignmentHandler.ts` - Assignments

### POV Operations
- `lib/pov/handlers/povTaskHandler.ts` - POV-level task ops
- `lib/pov/handlers/povPhaseHandler.ts` - Phase changes

### Agent Operations
- `lib/agents/handlers/agentExecutionHandler.ts` - Agent runs
- `lib/mcp/tools/executeTaskAction.ts` - MCP-initiated actions

### Workflow Operations (NEW 2026-01-05)
- `lib/services/workflow/workflowEngine.ts` - Workflow execution tracking
- `lib/services/taskBulkService.ts` - Bulk phase/stage moves

### MCP Operations
- `lib/mcp/tasks/action/handlers/task/task-update-handler.ts` - MCP task updates

### API Routes
- `app/api/tasks/[taskId]/route.ts` - Direct task updates
- `app/api/pov/[povId]/tasks/route.ts` - POV task operations

## How to Add New Activity Types

### Step 1: Add Action Type

```typescript
// lib/types/activity.ts
export type TaskActivityAction =
  | 'CREATED'
  | 'STATUS_CHANGED'
  // ... existing types
  | 'YOUR_NEW_ACTION';  // Add here
```

### Step 2: Add Action Symbol

```typescript
// lib/constants/bloomberg-styles.ts
export const ACTION_SYMBOLS = {
  // ... existing symbols
  YOUR_NEW_ACTION: { symbol: '◆', color: 'text-emerald-400', label: 'NEW' },
};
```

### Step 3: Add Service Method

```typescript
// lib/services/taskActivityService.ts
async logYourNewAction(
  taskId: string,
  userId: string,
  specificData: any,
  source: string = 'WEB'
): Promise<void> {
  await this.create({
    taskId,
    userId,
    action: 'YOUR_NEW_ACTION',
    details: {
      fieldName: 'yourField',
      oldValue: specificData.old,
      newValue: specificData.new,
      source
    }
  });
}
```

### Step 4: Add Visual Treatment (Optional)

```typescript
// components/tasks/activity-visuals.tsx

// 1. Update getActivityVisualType()
if (actionUpper === 'YOUR_NEW_ACTION' && details?.specificField) {
  return 'yourNewType';
}

// 2. Create component if needed
export function ActivityYourNew({ data }: Props) {
  return (
    <div className="pl-14 font-mono text-xs">
      {/* Your visual treatment */}
    </div>
  );
}
```

### Step 5: Integrate in TaskActivityTimeline

```typescript
// components/tasks/TaskActivityTimeline.tsx

// In the activity row rendering:
{visualType === 'yourNewType' && activity.details?.specificField && (
  <ActivityYourNew data={activity.details} />
)}
```

### Step 6: Call from Integration Point

```typescript
// In your handler/service
import { taskActivityService } from '@/lib/services/taskActivityService';

// Fire-and-forget
taskActivityService.logYourNewAction(taskId, userId, data)
  .catch(err => taskLogger.error({ err }, 'Activity logging failed'));
```

## Performance Considerations

- **Fire-and-forget**: Logging doesn't block user operations
- **Indexed columns**: taskId, userId, timestamp for fast queries
- **No GIN index**: JSONB details not indexed (query by action, not details content)
- **Pagination**: Default 100 limit, supports offset
- **POV scoping**: Activities filtered by POV access at query time

## Security

- **POV Access Control**: Activities filtered through validatePOVAccess
- **IDOR Prevention**: Returns 404 (not 403) for unauthorized POV access
- **Admin Override**: Admins can view all activities
- **Audit Trail**: Complete history preserved, no hard deletes

## Consumers

### Portfolio Intelligence (Phase 7)

TaskActivity data is queried by the Portfolio Intelligence system to generate **6 activity-based recommendations**:

| Recommendation | Query Pattern | Trigger |
|---------------|---------------|---------|
| STALE_TASK_DETECTION | `groupBy` + `_max.timestamp` | 5+ tasks with no activity in 7+ days |
| ACTIVITY_BOTTLENECK | `groupBy` counting STATUS_CHANGED | 3+ tasks with 5+ status changes |
| ASSIGNMENT_VOLATILITY | `groupBy` counting ASSIGNED | 2+ tasks reassigned 3+ times |
| COMMENT_HEAVY_TASKS | `groupBy` counting COMMENT_ADDED | 2+ tasks with 10+ comments |
| AGENT_RETRY_PATTERN | `groupBy` counting AGENT_EXECUTED | 2+ tasks with 3+ agent executions |
| RAPID_STATUS_CYCLING | `findMany` + timestamp analysis | 1+ tasks with 3+ status changes in 24h |

**See**: `/.claude/knowledge/domain/mcp/PORTFOLIO-INTELLIGENCE.md` for full recommendation documentation.

### TaskActivityTimeline (UI)

The primary consumer displaying activities in task detail views with visual treatments.

### Activity Summary API

Aggregated activity counts for dashboard widgets and exports.

## Related Documentation

- **Platform Activity System**: [`PLATFORM-ACTIVITY-SYSTEM.md`](./PLATFORM-ACTIVITY-SYSTEM.md) (security, permissions, admin, orchestration)
- **Portfolio Intelligence**: `/.claude/knowledge/domain/mcp/PORTFOLIO-INTELLIGENCE.md` (activity-based recommendations)
- **Pattern**: `/.claude/knowledge/patterns/fire-and-forget-activity-logging-pattern.md`
- **Pattern**: `/.claude/knowledge/patterns/parallel-query-optimization-pattern.md` (used by recommendations)
- **Visual Design**: `/cline_docs/reviews/task-activity-rich-details-2025-12-31/visual-design-spec.md`
- **Implementation Plan**: `/cline_docs/reviews/task-activity-rich-details-2025-12-31/implementation-plan.md`
- **Analytics Data Flow**: `/.claude/knowledge/patterns/analytics-data-flow-pattern.md`
