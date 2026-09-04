# MCP Tool Consolidation Plan

> **Status**: Planning | **Created**: 2026-03-06
> **Scope**: Embedded server first, MCP Protocol server second

## Goal

Consolidate 14 individual MCP tools into 5 logical tools to:
- Reduce per-request token overhead (tool definitions ~200-500 tokens each)
- Unify permission model (one permission per tool, no sub-action checks)
- Remove the `agent_results` standalone duplicate
- Establish consistent `entity.verb` naming convention

## Naming Spec

### Final Tool Names

| Tool | Permission | Replaces |
|------|------------|----------|
| `project` | AUTHENTICATED | list_povs, get_pov_details, list_tasks, get_task_context |
| `perform` | AUTHENTICATED | execute_task_action (+ absorbs agent_results) |
| `analytics` | AUTHENTICATED | get_ai_recommendations, analyze_team_performance |
| `template` | ADMIN | list_agent_templates, get_agent_template_details |
| `services` | AUTHENTICATED | call_service, discover_services, execute_workflow |

### Sub-Action Naming Convention

**Rule**: Use `entity.verb` prefix only when the tool spans multiple entities. Single-entity tools use plain verbs.

```
project(action: "pov.list", limit: 10)
project(action: "pov.details", povId: "...")
project(action: "task.list", povId: "...", status: "OPEN")
project(action: "task.context", taskId: "...")

perform(action: "pov.create", name: "...", ...)
perform(action: "task.create", title: "...", povId: "...")
perform(action: "task.update", taskId: "...", ...)
perform(action: "task.assign", taskId: "...", ...)
perform(action: "task.complete", taskId: "...")
perform(action: "task.comment", taskId: "...", ...)
perform(action: "stage.create", povId: "...", ...)
perform(action: "agent.configure", taskId: "...", ...)
perform(action: "agent.assign", taskId: "...", ...)
perform(action: "agent.execute", taskId: "...")
perform(action: "agent.status", executionId: "...")
perform(action: "agent.results", taskId: "...")
perform(action: "analytics.generate", ...)

analytics(action: "recommendations.get", limit: 5, type: "OPTIMIZATION")
analytics(action: "team.performance", timeframe: "30d")

template(action: "list", limit: 50)
template(action: "details", templateId: "...")

services(action: "discover", capability: "monitoring")
services(action: "call", serviceId: "...", tool: "...", args: {...})
services(action: "workflow.execute", steps: [...])
```

### Removed

- `agent_results` standalone tool (ADMIN) -- functionality kept as `perform(action: "agent.results")` at AUTHENTICATED level
- This closes the permission inconsistency: `agent.results` was already accessible at AUTHENTICATED via the old `execute_task_action`

---

## Part 1: Embedded Server Implementation

**Scope**: `lib/mcp/embedded-server.ts` and supporting files
**Risk**: Low -- embedded server is internal, we control both sides

### Step 1: Create Dispatcher Modules

Create thin dispatcher files that route `action` param to existing handlers.

#### 1a. `lib/mcp/server/tools/dispatchers/project-dispatcher.js`

```
Dispatches:
  "pov.list"      -> basicTools.handleListPOVs(args, context)
  "pov.details"   -> basicTools.handleGetPOVDetails(args, context)
  "task.list"     -> basicTools.handleListTasks(args, context)
  "task.context"  -> advancedTools.handleGetTaskContext(args, context)

Validation:
  - action is required
  - action must be in validActions array
  - Pass remaining args through to handler unchanged
```

#### 1b. `lib/mcp/server/tools/dispatchers/analytics-dispatcher.js`

```
Dispatches:
  "recommendations.get"  -> advancedTools.handleGetAIRecommendations(args, context)
  "team.performance"     -> advancedTools.handleAnalyzeTeamPerformance(args, context)
```

#### 1c. `lib/mcp/server/tools/dispatchers/template-dispatcher.js`

```
Dispatches:
  "list"     -> basicTools.handleListAgentTemplates(args, context)
  "details"  -> basicTools.handleGetAgentTemplateDetails(args, context)
```

#### 1d. `lib/mcp/server/tools/dispatchers/services-dispatcher.js`

```
Dispatches:
  "discover"          -> hubTools.handleDiscoverServices(args, context)
  "call"              -> hubTools.handleCallService(args, context)
  "workflow.execute"  -> hubTools.handleExecuteWorkflow(args, context)
```

#### 1e. `perform` -- No new dispatcher needed

`execute_task_action` handler (TaskActionHandler) already dispatches 13 sub-actions.
Just rename the registration from `execute_task_action` to `perform`.
Remove `agent_results` standalone registration.

### Step 2: Update Tool Schemas (`tool-schemas.js`)

Replace 14 individual schemas with 5 consolidated schemas.

Each new schema needs:
- `title` and `description` listing all available sub-actions
- `inputSchema` with `action` as required enum field + union of all sub-action params
- Keep individual param validation (carried over from original schemas)

**Key detail**: The `action` enum in each schema tells the LLM what sub-actions are available.

### Step 3: Update Embedded Server Registration (`embedded-server.ts`)

```typescript
// Before: 14 tool registrations
const allTools = {
  list_povs: ...,
  get_pov_details: ...,
  // ... 12 more

// After: 5 tool registrations
const allTools = {
  project: (args, context) => projectDispatcher.handle(args, context),
  perform: advancedTools.handleExecuteTaskAction.bind(advancedTools),
  analytics: (args, context) => analyticsDispatcher.handle(args, context),
  template: (args, context) => templateDispatcher.handle(args, context),
  services: (args, context) => servicesDispatcher.handle(args, context),
};
```

### Step 4: Update Tool Security (`tool-security.js`)

```javascript
// Before: 14+ entries across 3 tiers
AUTHENTICATED_TOOLS: ['list_povs', 'get_pov_details', ...]
ADMIN_TOOLS: ['list_agent_templates', 'get_agent_template_details', 'agent_results']

// After: 5 entries across 2 tiers
AUTHENTICATED_TOOLS: ['project', 'perform', 'analytics', 'services']
ADMIN_TOOLS: ['template']
```

### Step 5: Update Tool Annotations (`tool-annotations.js`)

Map new tool names to their annotation metadata (readOnlyHint, destructiveHint, etc.).

### Step 6: Update Supporting Files

| File | Change |
|------|--------|
| `app/api/mcp/status/route.ts` | Update tool listing |
| `app/auth/oauth/success/page.tsx` | Update tool display |
| `scripts/register-internal-services.ts` | Update service tool definitions |
| `lib/mcp/server/config/service-call-policy.js` | Check for tool name refs |

### Step 7: Update Streaming Route Tool Filtering

`app/api/pov/agent/execute/stream/route.ts` reads tool names from `task.mcpContext.tools[]`.
After consolidation, the default tool set changes. Ensure:
- Default tools list uses new names
- Any stored `mcpContext.tools` with old names still work (backward compat or migration)

### Step 8: Test

- Start dev server, verify embedded server registers 5 tools
- Execute each sub-action via the Builder / streaming route
- Verify ADMIN permission on `template` tool
- Verify `agent.results` works via `perform`
- Check MCP status endpoint returns correct tool list

---

## Part 2: MCP Protocol Server (Companion Doc)

**Scope**: `lib/mcp/server/mcp-server-v5.js` and MCP Protocol tooling
**Risk**: Medium -- breaking change for external clients (Claude Desktop, ChatGPT connector)
**Timing**: After Part 1 is tested and stable

### What Changes

The MCP Protocol server (`mcp-server-v5.js`) currently exposes the old 14+ tool names to external clients:
- Claude Desktop users
- ChatGPT connector
- Any MCP client connecting via stdio/SSE

### Approach

#### Option A: Clean Break (Recommended)

Rename all tools to match embedded server names. External clients update their prompts.

**Impact**:
- Claude Desktop: Tools auto-discovered on connect, names update automatically
- ChatGPT connector: `chatgpt-connector-handler.js` routes `search` and `fetch` -- these are separate tools NOT being consolidated, so no impact
- Workflow definitions: Any saved workflows referencing old tool names need migration
- Documentation: Update all .md files referencing old names

#### Option B: Alias Period

Keep old names as aliases for 30 days, log deprecation warnings, then remove.

**Implementation**:
- Register both old and new names in tool schemas
- Old names delegate to new dispatchers
- Add deprecation notice in tool response `_meta`
- Remove old names after migration period

### Files to Update (MCP Protocol Server)

| File | Change |
|------|--------|
| `lib/mcp/server/tools/sdk-native-basic-tools.js` | Update handler method names/routing |
| `lib/mcp/server/tools/sdk-native-advanced-tools.js` | Update handler method names/routing |
| `lib/mcp/server/tools/hub-tools-handler.js` | Update handler method names/routing |
| `lib/mcp/server/config/tool-schemas.js` | Replace 14 schemas with 5 |
| `lib/mcp/server/config/tool-security.js` | Already updated in Part 1 |
| `lib/mcp/server/config/tool-annotations.js` | Already updated in Part 1 |
| `lib/mcp/server/tools/chatgpt-connector-handler.js` | Verify `search`/`fetch` unaffected |
| `lib/mcp/server/tools/internal/InternalServiceRouter.js` | Update internal service tool names |
| `scripts/register-internal-services.ts` | Update registered service tools |

### Service Registration Migration

The Hub has registered services with old tool names in the database:
- `paichart-pov-service`: tools include `list_povs`, `get_pov_details`, `get_pov_phases`
- `paichart-task-service`: tools include `get_task_context`, `execute_task_action`, `list_tasks`

These MCPTool records need updating:
```sql
-- Example migration (run after code deployment)
UPDATE "MCPTool" SET name = 'project' WHERE name IN ('list_povs', 'get_pov_details', 'list_tasks', 'get_task_context');
-- etc.
```

Or re-run `scripts/register-internal-services.ts` with updated definitions.

### Testing (Part 2)

- Connect Claude Desktop, verify 5 tools appear
- Test each sub-action via Claude Desktop
- Test ChatGPT connector `search` and `fetch` still work
- Verify Hub service discovery returns updated tool names
- Test workflow execution with new tool names

---

## Migration Checklist

### Part 1 (Embedded Server)
- [ ] Create 4 dispatcher modules (project, analytics, template, services)
- [ ] Write consolidated tool schemas (5 schemas)
- [ ] Update embedded-server.ts registration
- [ ] Update tool-security.js (14 entries -> 5)
- [ ] Update tool-annotations.js
- [ ] Update MCP status route
- [ ] Update OAuth success page tool display
- [ ] Update streaming route default tools
- [ ] Remove agent_results standalone registration
- [ ] Test all sub-actions via Builder/streaming
- [ ] Verify permissions (ADMIN on template, AUTHENTICATED on rest)
- [ ] Build passes
- [ ] Commit and push

### Part 2 (MCP Protocol Server)
- [ ] Decide: Clean break vs alias period
- [ ] Update MCP Protocol server tool registration
- [ ] Update tool schemas for MCP Protocol
- [ ] Update InternalServiceRouter tool names
- [ ] Update service registrations (script + database)
- [ ] Update ChatGPT connector (verify no impact)
- [ ] Update documentation (.md files)
- [ ] Test Claude Desktop connection
- [ ] Test ChatGPT connector
- [ ] Test Hub service discovery
- [ ] Test workflow execution
- [ ] Build passes
- [ ] Commit and push

---

## Notes

- Internal handlers (handleListPOVs, handleGetTaskContext, etc.) do NOT change -- dispatchers just route to them
- The `perform` tool is just a rename of `execute_task_action` -- TaskActionHandler unchanged
- `agent_results` standalone removal is safe -- it was already bypassed via `execute_task_action(action: "agent.results")`
- `search` and `fetch` (ChatGPT connector tools) are NOT part of this consolidation
- MCP Protocol server tools that only exist there (register_service, update_service, delete_service, list_my_services, get_service_health, get_service_tools, list_prompts, prompt_command, get_workflow_status, cancel_workflow, list_workflow_executions) are addressed in Part 2
