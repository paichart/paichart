# MCP Tool Architecture Reference

**Version**: 2.0.2
**Created**: 2026-01-03
**Last Updated**: 2026-05-06 (code-grounded correction: 34 actions, perform=14, browser story, security box)
**Confidence**: 95% (Production-validated)
**Domain Specialists**: mcp-integration-specialist, mcp-hub-specialist, prompt-construction-specialist

---

## Overview

This document provides a comprehensive catalog of all MCP tools in pAIchart, their categories, file locations, handler patterns, and implementation architecture. Use this reference when:
- Adding new MCP tools
- Understanding tool organization
- Finding handler implementations
- Following established patterns

**Total Tools**: 10 tools (6 consolidated, 4 standalone), exposing **34 actions** across the consolidated surface (project 4, perform 14, analytics 2, template 2, services 7, registry 5).

**Architectural change in March 2026**: the tool surface was consolidated from 26 individually-registered tools into 10 — 6 action-based tools (`project`, `perform`, `analytics`, `template`, `services`, `registry`) plus 4 standalone tools (`search`, `fetch`, `prompt_command`, `list_prompts`) left ungrouped because their semantics did not benefit from action-routing. The 6 consolidated tools expose 34 actions between them, so the surface lost no capability — only the count of names visible in `tools/list` dropped (26 → 10). Pre-consolidation tool names are deprecated and no longer exposed.

> **Migration mapping** for developers familiar with the pre-consolidation surface: see [Pre-Consolidation Mapping](#pre-consolidation-mapping) at the end of the Tool Categories section.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Definition Layer                        │
│  /lib/mcp/server/config/tool-schemas.js                        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ TOOL_SCHEMAS = {                                          │ │
│  │   tool_name: {                                            │ │
│  │     title: "Human Title",                                 │ │
│  │     description: "WHEN TO USE / EXAMPLES / SEE ALSO",     │ │
│  │     inputSchema: z.object({ ... })                        │ │
│  │   }                                                       │ │
│  │ }                                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Security Layer                               │
│  /lib/mcp/server/config/tool-security.js                       │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ PUBLIC_TOOLS = [] (Phase 3: all tools require auth)        │ │
│  │ AUTHENTICATED_TOOLS = [9 tools]                           │ │
│  │ ADMIN_TOOLS = ['template'] (+ handler-level gates)        │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Handler Layer                                │
│  /lib/mcp/server/tools/                                        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ hub-tools-handler.js → Delegates to:                      │ │
│  │   ├── hub/service-discovery-handler.js                    │ │
│  │   ├── hub/service-registration-handler.js                 │ │
│  │   └── hub/... (other specialized handlers)                │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server Layer                             │
│  /mcp-server-http-clean.js (HTTP) | /mcp-server-v5.js (stdio)  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ • Tool registration with MCP SDK                          │ │
│  │ • Request routing to handlers                             │ │
│  │ • Response formatting                                     │ │
│  │ • Authentication enforcement                              │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Files Quick Reference

| File | Purpose | When to Modify |
|------|---------|----------------|
| `/lib/mcp/server/config/tool-schemas.js` | Tool definitions (Zod schemas, descriptions) | Adding/modifying tool parameters |
| `/lib/mcp/server/config/tool-security.js` | Security tier assignments | Changing tool permissions |
| `/lib/mcp/server/config/tool-annotations.js` | Anthropic Directory annotations | Adding tool metadata |
| `/lib/mcp/server/tools/hub-tools-handler.js` | MCP Hub handler orchestration | Adding Hub tools |
| `/lib/mcp/server/tools/hub/*.js` | Individual tool handlers | Implementing tool logic |
| `/mcp-server-http-clean.js` | HTTP MCP server | Tool registration, routing |
| `/mcp-server-v5.js` | Stdio MCP server | Local tool registration |

---

## Tool Categories

The MCP server exposes **10 tools** to AI clients: 6 consolidated tools that route by sub-action, plus 4 standalone tools.

### At a glance

| Tool | Type | Auth | Actions | Purpose |
|---|---|---|---|---|
| `project` | Consolidated | AUTH | 4 | Read POVs and tasks |
| `perform` | Consolidated | AUTH | 14 | Create / modify POVs, tasks, stages, agents |
| `analytics` | Consolidated | AUTH | 2 | Recommendations and team performance |
| `template` | Consolidated | ADMIN | 2 | Agent template browsing |
| `services` | Consolidated | AUTH | 7 | Hub: discovery, calling, workflow orchestration |
| `registry` | Consolidated | AUTH | 5 | Hub: register and manage your own services |
| `search` | Standalone | AUTH | — | Cross-resource natural-language search |
| `fetch` | Standalone | AUTH | — | Get specific resource by ID |
| `prompt_command` | Standalone | AUTH | — | Execute prompt templates |
| `list_prompts` | Standalone | AUTH | — | List available prompts |

---

### Consolidated Tools

#### `project` (4 actions)

**Purpose**: Read-only queries against POVs and tasks.

| Action | Description |
|---|---|
| `pov.list` | List POVs with filtering (status, geography, customer, owner) |
| `pov.details` | Comprehensive POV details (team IDs, phases, stages) |
| `task.list` | List tasks with flexible filtering |
| `task.context` | Deep task analysis with history, dependencies, recommendations |

**Key Files**:
- Schema: `/lib/mcp/server/config/tool-schemas.js` (`CONSOLIDATED_SCHEMAS.project`)
- Dispatcher: `/lib/mcp/server/tools/dispatchers/project-dispatcher.js`
- Handlers: `/lib/mcp/server/tools/sdk-native-basic-tools.js`, `/lib/mcp/server/tools/sdk-native-advanced-tools.js`

**Pattern Notes**:
- Supports fuzzy name matching (exact → partial → case-insensitive)
- `pov.details` returns team member IDs needed for `perform(action: "task.create")` assignee fields
- Supports theatre aliases (`'Asia'` → `'APJ'`, `'Europe'` → `'EMEA'`)

---

#### `perform` (14 actions)

**Purpose**: All write/execute operations against POVs, tasks, stages, and agents.

| Category | Actions | Description |
|---|---|---|
| POV | `pov.create`, `pov.update` | Create / update POV (`pov.update` ADMIN-only via handler check; `pov.create` RolePermission-table governed — ADMIN+USER, DEMO blocked; see Security Tiers) |
| Task | `task.create`, `task.update`, `task.assign`, `task.complete`, `task.comment` | Task CRUD + state transitions |
| Stage | `stage.create` | Create stage within a phase |
| Agent | `agent.configure`, `agent.assign`, `agent.execute`, `agent.status`, `agent.results` | Agent template assignment and execution lifecycle |
| Analytics | `analytics.generate` | Generate performance / insights reports |

**Key Files**:
- Schema: `/lib/mcp/server/config/tool-schemas.js` (`CONSOLIDATED_SCHEMAS.perform`)
- Action handler: `/lib/mcp/tasks/action/handlers/task-action-handler.js`
- Per-action handlers: `/lib/mcp/tasks/action/handlers/<domain>/<action>-handler.ts`

**Pattern Notes**:
- `task.update` is the canonical path for any task field change including assignee. `task.assign` is a specialised alternative for assignee-only updates.
- Browser-automation execution is no longer a separate `workflow.trigger` action under `perform`. Browser workflows are now invoked via `services(action: "workflow.execute")` with a `workflowType` parameter (see `services` below).

---

#### `analytics` (2 actions)

**Purpose**: AI-generated recommendations and team performance analysis.

| Action | Description |
|---|---|
| `recommendations.get` | AI-generated suggestions across 14 recommendation types (see *Recommendation Types* section below) |
| `team.performance` | Team performance metrics over `7d` / `30d` / `90d` / `1y` |

**Key Files**:
- Schema: `/lib/mcp/server/config/tool-schemas.js` (`CONSOLIDATED_SCHEMAS.analytics`)
- Dispatcher: `/lib/mcp/server/tools/dispatchers/analytics-dispatcher.js`
- Handler: `/lib/mcp/server/tools/sdk-native-advanced-tools.js`

---

#### `template` (2 actions)

**Purpose**: Agent template browsing.

| Action | Auth | Description |
|---|---|---|
| `list` | ADMIN | List available agent templates (filter by category) |
| `details` | ADMIN | Template configuration and parameters |

> **Note**: The whole `template` tool is in `ADMIN_TOOLS` — both `list` and `details` require admin. Tier-level visibility, not per-action.

**Key Files**:
- Schema: `/lib/mcp/server/config/tool-schemas.js` (`CONSOLIDATED_SCHEMAS.template`)
- Dispatcher: `/lib/mcp/server/tools/dispatchers/template-dispatcher.js`
- Handler: `/lib/mcp/server/tools/sdk-native-basic-tools.js`

**Pattern Notes**:
- Browser automation is **not** part of the `template` surface. The former standalone browser tools (`list_browser_templates`, `get_browser_template_details`, `validate_browser_template_parameters`, `create_browser_automation_task`) were moved out to a separate browser-automation MCP service and are now reached through the workflow system: `services(action: "workflow.execute", workflowType: "web_scraping" | "ui_interaction" | "form_submission" | "browser_automation")`. See the *Workflow System* section below. (There is no `category: "browser"` filter on `template`.)

---

#### `services` (7 actions)

**Purpose**: Hub-side discovery, cross-service calling, and multi-service workflow orchestration.

| Action | Description |
|---|---|
| `discover` | Find services by capability, category, or full-text |
| `call` | Call a tool exposed by another registered service |
| `health` | Check a service's health and metrics |
| `workflow.execute` | Run a multi-service workflow (sequential / parallel / conditional) |
| `workflow.status` | Check workflow execution status |
| `workflow.cancel` | Cancel a running workflow |
| `workflow.list` | List historical workflow executions |

**Key Files**:
- Schema: `/lib/mcp/server/config/tool-schemas.js` (`CONSOLIDATED_SCHEMAS.services`)
- Main facade: `/lib/mcp/server/tools/hub-tools-handler.js`
- Per-action handlers in `/lib/mcp/server/tools/hub/`:
  - `service-discovery-handler.js`
  - `service-call-handler.js`
  - `service-health-handler.js`
  - `workflow-tools-handler.js` (handles all four `workflow.*` actions)

---

#### `registry` (5 actions)

**Purpose**: Manage your own services in the Hub registry.

| Action | Description |
|---|---|
| `register` | Register a new MCP service |
| `list` | View your registered services |
| `update` | Modify a service's configuration |
| `delete` | Remove a service (GDPR-compliant) |
| `tools` | Inspect another service's exposed tool definitions |

**Key Files**:
- Schema: `/lib/mcp/server/config/tool-schemas.js` (`CONSOLIDATED_SCHEMAS.registry`)
- Per-action handlers in `/lib/mcp/server/tools/hub/`:
  - `service-registration-handler.js`
  - `user-services-handler.js`
  - `service-update-handler.js`
  - `service-delete-handler.js`
  - `service-tools-handler.js`

---

### Standalone Tools

#### `search`

**Purpose**: Natural-language search across POVs, tasks, templates, and other resources. Returns ChatGPT-compatible format.

**Auth**: AUTH | **Returns**: `{ results: [{ id, title, url, ... }, ...] }`
**Key Files**: `/lib/mcp/server/config/tool-schemas.js` (`TOOL_SCHEMAS.search`); `/mcp-server-http-clean.js` (ChatGPT connector section).

#### `fetch`

**Purpose**: Get a specific resource by ID. Returns direct object (not wrapped).

**Auth**: AUTH | **Returns**: full resource object
**ID format**: `<type>-<id>`, e.g. `pov-cmh5abc...`, `task-cm123...`
**Key Files**: `/lib/mcp/server/config/tool-schemas.js` (`TOOL_SCHEMAS.fetch`); `/mcp-server-http-clean.js`.

#### `prompt_command`

**Purpose**: Execute a prompt template by name with parameters.

**Auth**: AUTH
**Syntax**: `/prompt [name] param1=value1 param2=value2`
**Built-in prompts**: 10 (hardcoded in registry); database prompts are dynamic (`agent_prompt_library` table).
**Key Files**: `/lib/mcp/server/prompts/prompt-registry.js`.

#### `list_prompts`

**Purpose**: Search available prompt templates.

**Auth**: AUTH (admin filter applied at handler level — non-admins only see public prompts)
**Key Files**: `/lib/mcp/server/tools/hub/prompt-list-handler.js`.

---

### Pre-Consolidation Mapping

For developers familiar with the pre-consolidation surface (March 2026 and earlier), here is the mapping from old tool names to current invocation forms. The old names are no longer registered and will return "Unknown tool" errors.

| Pre-March-2026 tool | Current form |
|---|---|
| `list_povs` | `project(action: "pov.list")` |
| `get_pov_details` | `project(action: "pov.details")` |
| `list_tasks` | `project(action: "task.list")` |
| `get_task_context` | `project(action: "task.context")` |
| `execute_task_action` | `perform(action: "<sub-action>", ...)` — pass the sub-action directly, no nested `action: "execute"` |
| `agent_results` | `perform(action: "agent.results", ...)` |
| `get_ai_recommendations` | `analytics(action: "recommendations.get")` |
| `analyze_team_performance` | `analytics(action: "team.performance")` |
| `list_agent_templates` | `template(action: "list")` |
| `get_agent_template_details` | `template(action: "details")` |
| `list_browser_templates` | (moved to the browser-automation service; invoke via `services(action: "workflow.execute", workflowType: ...)`) |
| `get_browser_template_details` | (moved to the browser-automation service) |
| `validate_browser_template_parameters` | (moved to the browser-automation service) |
| `create_browser_automation_task` | `services(action: "workflow.execute", workflowType: "browser_automation")` |
| `discover_services` | `services(action: "discover")` |
| `call_service` | `services(action: "call")` |
| `get_service_health` | `services(action: "health")` |
| `execute_workflow` | `services(action: "workflow.execute")` |
| `get_workflow_status` | `services(action: "workflow.status")` |
| `cancel_workflow` | `services(action: "workflow.cancel")` |
| `list_workflow_executions` | `services(action: "workflow.list")` |
| `register_service` | `registry(action: "register")` |
| `update_service` | `registry(action: "update")` |
| `delete_service` | `registry(action: "delete")` |
| `list_my_services` | `registry(action: "list")` |
| `get_service_tools` | `registry(action: "tools")` |
| `search`, `fetch`, `prompt_command`, `list_prompts` | (unchanged — left standalone) |

---

## Analytics & Metrics Quick Reference

This section consolidates all analytics-related tools and actions across the platform.

### Tool/Action Matrix

| Need | Tool/Action | Valid Types | Handler |
|------|-------------|-------------|---------|
| Task/POV performance metrics | `perform(action: "analytics.generate")` | `performance`, `insights` | `analytics-generate-handler.ts` |
| AI-powered recommendations | `analytics(action: "recommendations.get")` | 14 types (see below) | `sdk-native-advanced-tools.js` |
| Team velocity & metrics | `analytics(action: "team.performance")` | timeframe: `7d`, `30d`, `90d`, `1y` | `sdk-native-advanced-tools.js` |
| Agent execution status | `perform(action: "agent.status")` | taskId required | `agent-status-handler.ts` |
| Agent results & artifacts | `perform(action: "agent.results")` | taskId required | `agent-results-handler.ts` |
| MCP Hub overview | `registry(action: "list")` | (no params) | `user-services-handler.js` |

### When to Use What

```
Need task/POV metrics?
  → analytics.generate (performance | insights)

Need AI recommendations?
  → analytics(action: "recommendations.get") (14 types including activity-based)

Need team performance?
  → analytics(action: "team.performance") (velocity, completion rates, trends)

Need agent execution data?
  → agent.status (is it running? progress?)
  → agent.results (output, artifacts, logs)

Need Hub overview?
  → registry(action: "list") (your services, identity context)
  → services(action: "discover") (browse all hub services)
```

### Recommendation Types (`analytics(action: "recommendations.get")`)

| Type | Description |
|------|-------------|
| `OPTIMIZATION` | Performance improvements |
| `AUTOMATION` | Automation opportunities |
| `RISK_MITIGATION` | Risk reduction suggestions |
| `RESOURCE_ALLOCATION` | Capacity planning |
| `ACTIVITY_BASED` | Based on recent task activity |
| `BLOCKER_RESOLUTION` | Unblock stuck tasks |
| `DEADLINE_RISK` | At-risk deadlines |
| `DEPENDENCY_OPTIMIZATION` | Dependency improvements |
| `QUALITY_IMPROVEMENT` | Quality enhancements |
| `COST_REDUCTION` | Cost optimization |
| `SKILL_MATCHING` | Better task-assignee matching |
| `WORKFLOW_IMPROVEMENT` | Process improvements |
| `COMMUNICATION` | Communication suggestions |
| `KNOWLEDGE_TRANSFER` | Documentation gaps |

### Key Files

| Component | File |
|-----------|------|
| Analytics generate handler | `/lib/mcp/tasks/action/handlers/analytics/analytics-generate-handler.ts` |
| Agent status handler | `/lib/mcp/tasks/action/handlers/agent/agent-status-handler.ts` |
| Agent results handler | `/lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts` |
| Analytics service | `/lib/services/analytics/TaskAnalyticsService.ts` |
| Recommendations API | `/app/api/admin/analytics/recommendations/route.ts` |
| Validation schemas | `/lib/validation/mcp-action-validation.ts` |

### Historical Note

The `analytics.generate` action previously had stub implementations for `agent_execution_status` and `summary` types that returned empty/placeholder data. These were removed (January 2026) in favor of the dedicated `agent.status` and `agent.results` actions which provide complete execution data.

---

## Workflow System (via `services(action: "workflow.*")`)

The workflow system provides pluggable automation orchestration. As of the March 2026 consolidation, all workflow operations are exposed under the `services` tool — not under `perform`. The previous `perform(action: "workflow.trigger")` action has been retired.

### Overview

Workflow execution is invoked via `services(action: "workflow.execute")`:

```javascript
services({
  action: 'workflow.execute',
  workflowType: 'web_scraping',      // REQUIRED
  targetId: 'task123',                // Optional - validates POV access
  workflowConfig: { ... },            // Optional configuration
  executionMode: 'sequential',        // sequential | parallel | conditional
  failureStrategy: 'stop'             // stop | continue | rollback
})
```

The companion actions `services(action: "workflow.status")`, `services(action: "workflow.cancel")`, and `services(action: "workflow.list")` cover the rest of the workflow lifecycle.

### Architecture

```
services(action: "workflow.execute")
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│         workflow-tools-handler.js                        │
│  • POV/Task access validation                           │
│  • MCP service integration                              │
│  • Fallback mode support                                │
│  • Database logging (MCPWorkflowExecution)              │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│               WorkflowEngine (Singleton)                 │
│  • Plugin-based handler registration                    │
│  • Retry logic with configurable attempts               │
│  • Timeout handling                                     │
│  • Task status updates                                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│          BrowserAutomationHandler                        │
│  Supports: web_scraping, ui_interaction,                │
│            form_submission, browser_automation          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│           OnDemandBrowserService                         │
│  Actual browser automation execution                    │
└─────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `/lib/mcp/server/config/tool-schemas.js` (`CONSOLIDATED_SCHEMAS.services`) | `workflow.*` action definitions |
| `/lib/mcp/server/tools/hub/workflow-tools-handler.js` | MCP action handler (handles all four `workflow.*` actions) |
| `/lib/services/workflow/workflowEngine.ts` | Core workflow engine (singleton) |
| `/lib/services/workflow/index.ts` | Service initialization & exports |
| `/lib/services/workflow/handlers/browserHandler.ts` | Browser automation handler |
| `/lib/services/workflow/browserWorkflowTemplates.ts` | Workflow templates |

### Supported Workflow Types

Currently, only **Browser Automation** workflows are registered:

| Workflow Type | Required Parameters | Description |
|--------------|---------------------|-------------|
| `web_scraping` | `targetUrls`/`targetUrl`, `selectors` | Extract data from web pages |
| `ui_interaction` | `targetUrl`, `interactionSteps` | Interact with UI elements |
| `form_submission` | `formUrl`, `formData`, `fieldMappings` | Submit forms automatically |
| `browser_automation` | `automationScript` or `targetUrl` | General browser automation |

### Database Model

Workflow executions are tracked in `MCPWorkflowExecution`:

```prisma
model MCPWorkflowExecution {
  id          String   @id @default(cuid())
  workflowId  String
  status      MCPWorkflowExecutionStatus  // RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT
  startTime   DateTime
  endTime     DateTime?
  duration    Int?     // Duration in ms
  input       Json?    // Input parameters
  output      Json?    // Execution results
  steps       Json     // Step execution details
  error       String?  // Error message if failed
  failedStep  String?  // Step that failed
}
```

### Workflow Engine Features

- **Singleton Pattern**: `WorkflowEngine.getInstance()`
- **Plugin Architecture**: Register custom handlers via `registerWorkflowHandler()`
- **Retry Logic**: Configurable retries with `maxRetries`, `retryDelaySeconds`
- **Timeout Handling**: `timeoutSeconds` per workflow
- **Fallback Mode**: Works when MCP service unavailable
- **Task Integration**: Updates task status during execution

### Security

- Validates POV access if `targetId` provided
- Uses `validatePOVAccess` with `throwOnDeny: true`
- Logs all executions to database for audit trail

### Extending the Workflow System

To add a new workflow handler:

```typescript
import { WorkflowHandler, WorkflowConfig, WorkflowResult } from './workflowEngine';

class CustomWorkflowHandler implements WorkflowHandler {
  readonly handlerType = 'custom_handler';
  readonly supportedWorkflowTypes = ['custom_workflow', 'another_type'];

  async execute(config: WorkflowConfig, userId: string): Promise<WorkflowResult> {
    // Implementation
  }

  async validate?(config: WorkflowConfig): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }>;
  getCapabilities?(): { name: string; description: string; supportedTypes: string[]; version: string };
}

// Register during initialization
const engine = getWorkflowEngine();
engine.registerHandler(new CustomWorkflowHandler());
```

---

## Handler Pattern: `registry(action: "list")` Example (Gold Standard A)

The `registry(action: "list")` tool demonstrates the Gold Standard handler pattern:

### 1. Schema Definition (`tool-schemas.js`)

```javascript
registry(action: "list"): {
  title: "List My Services",
  description: `View your registered MCP services...

WORKFLOW: services(action: "discover") → registry(action: "register") → (you are here) → registry(action: "update")

WHEN TO USE:
✅ Check your registered services and their status
✅ Monitor service health and configuration
❌ Not registered yet (use registry(action: "register") first)

TRY: registry(action: "list")() — see all your services
CHECK: services(action: "health", serviceId) — verify a specific service
ALTERNATIVE: services(action: "discover")() — browse all hub services

SEE ALSO:
• registry(action: "register") - Register a new service
• registry(action: "update") - Update service configuration
• registry(action: "delete") - Remove a service (GDPR)`,
  inputSchema: z.object({
    status: z.enum(['active', 'inactive', 'all']).optional().default('all'),
    category: z.string().optional()
  })
}
```

### 2. Handler Class (`user-services-handler.js`)

```javascript
class UserServicesHandler {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async handle(args, context) {
    try {
      // 1. Query user's services
      const services = await this.prisma.mCPTool.findMany({
        where: { userId: context.user.id }
      });

      // 2. Return structured response with _meta and nextSteps
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        _meta: {
          tool: 'registry(action: "list")',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          nextSteps: response.nextSteps
        },
        nextSteps: { ... }
      };
    } catch (error) {
      // Structured error response
      return {
        success: false,
        error: 'Missing Required Information',
        requiredFields: { ... },
        example: { ... }
      };
    }
  }
}

module.exports = { UserServicesHandler };
```

### 3. Handler Registration (`hub-tools-handler.js`)

```javascript
const { UserServicesHandler } = require('./hub/user-services-handler');

class HubToolsHandler {
  constructor(prisma, sharedNormalizer, promptRegistry) {
    this.prisma = prisma || globalPrisma;

    // Initialize specialized handlers (facade pattern)
    this.userServicesHandler = new UserServicesHandler(this.prisma);
    this.serviceDiscoveryHandler = new ServiceDiscoveryHandler(this.prisma);
    // ... other handlers
  }

  async handleListMyServices(args, context) {
    return this.userServicesHandler.handle(args, context);
  }
}
```

### 4. Tool Routing (`mcp-server-v5.js`)

Routing happens at two scopes. The transport server registers each consolidated tool by its **bare name** (e.g. `'registry'`, not `'registry(action: "list")'`); the dispatcher inside the tool routes to the correct handler based on the `action` parameter inside the call.

```javascript
// Tool names registered with the transport server (bare names only)
const consolidatedToolNames = [
  'project', 'perform', 'analytics', 'template', 'services', 'registry'
];
const standaloneToolNames = [
  'search', 'fetch', 'prompt_command', 'list_prompts'
];

// Tool execution routing — consolidated tools delegate to a dispatcher
switch (name) {
  case 'registry':
    return registryDispatcher.handle(args, context);
    // dispatcher reads args.action and routes to the matching handler
  case 'services':
    return servicesDispatcher.handle(args, context);
  // ... other consolidated tools

  case 'search':
    return searchHandler.handle(args, context);  // standalone, no dispatcher
  // ... other standalone tools
}
```

The string `'registry(action: "list")'` is the **invocation form an AI client uses**, not the registered tool name. Internal routing keys are the bare consolidated names.

---

## Security Tiers

### PUBLIC Tools (0 tools)
All tools require authentication. `PUBLIC_TOOLS` is intentionally empty.

### AUTHENTICATED Tools (9 tools)
Requires USER, DEMO_USER, or higher. The 9 consolidated/standalone tools that any authenticated user can see:
- `project`, `perform`, `analytics`, `services`, `registry` (5 consolidated)
- `search`, `fetch`, `prompt_command`, `list_prompts` (4 standalone)

### ADMIN Tools (1 tool at tool-level)
Visible only to ADMIN and SUPER_ADMIN roles:
- `template` (covers both `list` and `details` actions)

**Plus handler-level authorisation** for action-specific gating within otherwise-authenticated tools:
- `perform(action: "pov.create")` — RolePermission-table governed via `checkPermission(PoV, CREATE)` inside the handler (`pov-create-handler.ts:284`; ADMIN+USER allowed, DEMO blocked since 2026-05-25 ed74e8ce)
- `perform(action: "pov.update")` — ADMIN-only via role check inside the handler (`pov-update-handler.ts:63`)
- The other twelve `perform` actions are open to any authenticated user. This is the two-axis model: `perform` is AUTHENTICATED at the tool level, with two actions gated to ADMIN at the handler level.
- Other handler-level checks documented in the Two-Layer Permission Model section of `/.claude/knowledge/patterns/mcp-tool-lifecycle-pattern.md`

**File**: `/lib/mcp/server/config/tool-security.js` (the source of truth: `AUTHENTICATED_TOOLS` and `ADMIN_TOOLS` arrays).

**Total**: 0 PUBLIC + 9 AUTHENTICATED + 1 ADMIN = 10 tools at the tool-list level.

---

## Response Structure Pattern

All tools return SDK-compliant responses:

```json
{
  "content": [{
    "type": "text",
    "text": "Human-readable response..."
  }],
  "isError": false,
  "_meta": {
    "tool": "tool_name",
    "timestamp": "2026-01-03T12:00:00.000Z",
    "sdkNative": true,
    "itemCount": 10,
    "pagination": {
      "total": 100,
      "returned": 10,
      "hasMore": true,
      "currentPage": 1,
      "totalPages": 10
    }
  }
}
```

---

## Adding a New Tool Checklist

1. **Define Schema** (`tool-schemas.js`)
   - [ ] Add to `TOOL_SCHEMAS` object
   - [ ] Include `title`, `description`, `inputSchema`
   - [ ] Description format: WHEN TO USE, EXAMPLES, SEE ALSO

2. **Create Handler** (`/lib/mcp/server/tools/hub/`)
   - [ ] Create `[tool-name]-handler.js`
   - [ ] Implement class with `handle(args, context)` method
   - [ ] Add JSDoc documentation
   - [ ] Return `_meta` object for SDK compatibility

3. **Register Handler** (`hub-tools-handler.js` or domain handler)
   - [ ] Import handler class
   - [ ] Initialize in constructor
   - [ ] Add delegation method

4. **Set Security Tier** (`tool-security.js`)
   - [ ] Add to appropriate tier (PUBLIC/AUTH/ADMIN)

5. **Add Annotations** (`tool-annotations.js`)
   - [ ] Add Anthropic Directory compliant annotations

6. **Route Tool** (`mcp-server-http-clean.js`)
   - [ ] Add case in tool execution switch

7. **Test**
   - [ ] Test with Claude Desktop
   - [ ] Test with ChatGPT (if applicable)
   - [ ] Verify security enforcement

---

## Related Documentation

- **API Reference**: `/.claude/knowledge/domain/mcp/api-reference.md`
- **Implementation Patterns**: `/.claude/knowledge/domain/mcp/implementation-patterns.md`
- **Permission Management**: `/.claude/knowledge/domain/mcp/tool-permission-management.md`
- **JSDoc Reference**: `/.claude/knowledge/domain/mcp/mcp-layer-jsdoc-reference.md`
- **Database Prompts**: `/.claude/knowledge/domain/mcp/database-prompt-creation-guide.md`

---

## Migration History

**May 2026** (v2.0.2 — code-grounded correction pass):
- Corrected action count: `perform` has **14** actions, not 13 — the v2.0 entry missed `pov.update` (a fully-wired action with its own handler, validation schema, and ADMIN gate). Total reachable actions across the consolidated surface is **34**, not 33. Verified against `tool-schemas.js` (`CONSOLIDATED_SCHEMAS.perform` enum).
- Corrected the browser-automation story. The v2.0 entry (below) claimed browser tools were "absorbed into the agent-template surface" via `template(action: "list", category: "browser")` — **this was wrong**. There is no `category: "browser"` on `template`. Browser automation lives in a separate browser-automation MCP service, reached via `services(action: "workflow.execute", workflowType: ...)` (WorkflowEngine → `scrape_page` / `run_script`). The `template`-section note and the Pre-Consolidation Mapping rows were corrected accordingly.
- Corrected the Architecture Overview diagram box: was `AUTHENTICATED_TOOLS = [26 tools]` / `ADMIN_TOOLS = []`; actual is 9 AUTHENTICATED + 1 ADMIN (`template`), matching the Security Tiers section.
- Added `pov.update` as a second handler-level ADMIN gate alongside `pov.create` in the Security Tiers section.
- All corrections grounded in a direct codebase sweep (May 2026), not a doc-to-doc copy.

**April 2026** (v2.0 — post-consolidation refresh):
- Headline tool count corrected from 35 (pre-consolidation) to 10 (6 consolidated + 4 standalone) with 33 actions across the consolidated surface.
- Tool Categories section restructured around the consolidated `entity.verb` surface (`project`, `perform`, `analytics`, `template`, `services`, `registry`).
- Added Pre-Consolidation Mapping table at the end of Tool Categories for migration reference.
- Workflow System section moved from `perform(action: "workflow.trigger")` to `services(action: "workflow.*")`. The previous `workflow.trigger` action is retired.
- Browser-automation tools (`list_browser_templates`, `get_browser_template_details`, `validate_browser_template_parameters`, `create_browser_automation_task`) absorbed into the agent-template / agent-execution surface; the standalone names are no longer exposed.
- Analytics & Metrics matrix updated to current invocation forms (no nested `action: "execute"`).

**January 2026** (v1.x — pre-consolidation):
- Created tool architecture reference document
- Documented all 35 tools across 8 categories
- Added handler pattern documentation
- Added new tool checklist
- Added Workflow System documentation (`workflow.trigger` action)
  - WorkflowEngine architecture (singleton, plugin-based handlers)
  - BrowserAutomationHandler (4 workflow types)
  - MCPWorkflowExecution database model
  - Extension guide for custom workflow handlers
- Added Analytics & Metrics Quick Reference section (v1.2)
  - Consolidated all analytics tools/actions
  - Tool/action matrix with valid types and handlers
  - "When to use what" decision guide
  - All 14 recommendation types documented
  - Historical note on removed stub implementations

---

**Document Version**: 2.0.2
**Last Updated**: 2026-05-06
**Contact**: support@paichart.com
