# Part 1: Embedded Server Tool Consolidation — Completion Notes

> **Status**: COMPLETE | **Deployed**: 2026-03-06 | **Commits**: `dc0b31e3`, `2becca97`
> **Result**: 14 tools -> 5, both execution paths (GUI streaming + MCP Protocol agent execution) working

This document captures the exact implementation for Part 1 so Part 2 can follow the same patterns.

---

## What Was Done

Consolidated 14 embedded MCP server tools into 5 for the agent execution paths:
- GUI streaming path (`app/api/pov/agent/execute/stream/route.ts`)
- MCP Protocol agent execution path (`lib/services/agentExecutionEngine.ts`)

The MCP Protocol server (`mcp-server-v5.js`) for external clients was NOT changed (that's Part 2).

---

## Files Created

### 1. `lib/mcp/server/tools/dispatchers/project-dispatcher.js` (NEW)

Thin routing layer — receives `{ action, ...params }`, dispatches to existing handlers. No business logic.

```
Constructor: (basicTools: SDKNativeBasicTools, advancedTools: SDKNativeAdvancedTools)
Method:      handle(args, context) -> Promise<MCP response>

Sub-actions:
  pov.list     -> basicTools.handleListPOVs(params, context)
  pov.details  -> basicTools.handleGetPOVDetails(params, context)
  task.list    -> basicTools.handleListTasks(params, context)
  task.context -> advancedTools.handleGetTaskContext(params, context)
```

Key pattern: Extracts `action` from args, validates against `VALID_ACTIONS`, passes remaining `params` to handler. Returns MCP error response (not throw) for invalid actions.

### 2. `lib/mcp/server/tools/dispatchers/analytics-dispatcher.js` (NEW)

```
Constructor: (advancedTools: SDKNativeAdvancedTools)
Method:      handle(args, context) -> Promise<MCP response>

Sub-actions:
  recommendations.get -> advancedTools.handleGetAIRecommendations(params, context)
  team.performance    -> advancedTools.handleAnalyzeTeamPerformance(params, context)
```

### 3. `lib/mcp/server/tools/dispatchers/template-dispatcher.js` (NEW)

```
Constructor: (basicTools: SDKNativeBasicTools)
Method:      handle(args, context) -> Promise<MCP response>

Sub-actions:
  list    -> basicTools.handleListAgentTemplates(params, context)
  details -> basicTools.handleGetAgentTemplateDetails(params, context)
```

### 4. `lib/mcp/server/tools/dispatchers/services-dispatcher.js` (NEW)

```
Constructor: (hubTools: HubToolsHandler)
Method:      handle(args, context) -> Promise<MCP response>

Sub-actions:
  discover          -> hubTools.handleDiscoverServices(params, context)
  call              -> hubTools.handleCallService(params, context)
  workflow.execute   -> hubTools.handleExecuteWorkflow(params, context)
```

Note: `get_service_health` is NOT included — stays standalone (specialist review decision).

### 5. `scripts/migrate-mcp-tool-names.ts` (NEW)

Database migration script for `Task.mcpContext.tools[]` JSON field. Maps old tool names to consolidated names.

```
Usage: npx tsx scripts/migrate-mcp-tool-names.ts [--dry-run]
Result: Dry-run showed 0 affected rows (no tasks have mcpContext.tools set)
```

---

## Files Modified

### 6. `lib/mcp/embedded-server.ts`

**Lines 15, 28-32**: Added imports for CONSOLIDATED_SCHEMAS and 4 dispatchers

Before:
```typescript
import { TOOL_SCHEMAS } from './server/config/tool-schemas';
```

After:
```typescript
import { TOOL_SCHEMAS, CONSOLIDATED_SCHEMAS } from './server/config/tool-schemas';
// ...
const { ProjectDispatcher } = require('./server/tools/dispatchers/project-dispatcher');
const { AnalyticsDispatcher } = require('./server/tools/dispatchers/analytics-dispatcher');
const { TemplateDispatcher } = require('./server/tools/dispatchers/template-dispatcher');
const { ServicesDispatcher } = require('./server/tools/dispatchers/services-dispatcher');
```

**Lines 1639-1658**: `registerToolImplementations()` — replaced 14 tool registrations with 5

Before (conceptual — was ~14 individual registrations):
```typescript
allTools['list_povs'] = basicTools.handleListPOVs.bind(basicTools);
allTools['get_pov_details'] = basicTools.handleGetPOVDetails.bind(basicTools);
// ... 12 more
```

After:
```typescript
const projectDispatcher = new ProjectDispatcher(basicTools, advancedTools);
const analyticsDispatcher = new AnalyticsDispatcher(advancedTools);
const templateDispatcher = new TemplateDispatcher(basicTools);
const servicesDispatcher = new ServicesDispatcher(hubTools);

const allTools: Record<string, (args: any, context: any) => Promise<any>> = {
  project: (args, context) => projectDispatcher.handle(args, context),
  perform: advancedTools.handleExecuteTaskAction.bind(advancedTools),  // Direct binding, NOT dispatcher
  analytics: (args, context) => analyticsDispatcher.handle(args, context),
  template: (args, context) => templateDispatcher.handle(args, context),
  services: (args, context) => servicesDispatcher.handle(args, context),
};
```

**KEY PATTERN**: `perform` is a direct binding to `handleExecuteTaskAction` (which already has its own 13-action internal router). The other 4 tools use dispatchers. This is intentional — `perform` IS `execute_task_action` renamed, with its own mature routing.

**Lines 106-108**: `getTools()` — checks CONSOLIDATED_SCHEMAS first, falls back to TOOL_SCHEMAS

```typescript
const schema = CONSOLIDATED_SCHEMAS[toolName as keyof typeof CONSOLIDATED_SCHEMAS]
  || TOOL_SCHEMAS[toolName as keyof typeof TOOL_SCHEMAS];
```

### 7. `lib/mcp/server/config/tool-schemas.js`

**Lines 44-388**: Added `CONSOLIDATED_SCHEMAS` object with 5 tool schemas

Each schema includes:
- `title`: Short display name
- `description`: Rich text with ACTIONS, EXAMPLES, WORKFLOW, SEE ALSO sections (all referencing consolidated names, never old names)
- `inputSchema`: Zod schema with `action` enum as first parameter + all sub-action parameters as optional fields

`perform` schema (lines 119-270) is the most complex — reuses `execute_task_action`'s parameter normalization transform (flat params -> nested `parameters` object, alias mapping).

Exported alongside legacy schemas:
```javascript
module.exports = { TOOL_SCHEMAS, CONSOLIDATED_SCHEMAS };
```

### 8. `lib/mcp/server/config/tool-security.js`

**Lines 20-24**: Added consolidated names to AUTHENTICATED_TOOLS:
```javascript
'project', 'perform', 'analytics', 'services',
```

**Line 58**: Added `template` to ADMIN_TOOLS:
```javascript
'template',
```

**Line 63**: Removed `agent_results` from ADMIN_TOOLS with comment:
```javascript
// 'agent_results' removed -- use perform(action: 'agent.results') instead
```

Legacy tool names kept in both arrays for MCP Protocol server (Part 2).

### 9. `lib/mcp/server/config/tool-annotations.js`

**Lines 11-42**: Added 5 consolidated tool annotations:
```javascript
'project':   { title: 'Query Project Data',            readOnlyHint: true,  destructiveHint: false },
'perform':   { title: 'Perform Task Action',           readOnlyHint: false, destructiveHint: true  },
'analytics': { title: 'Analytics and Recommendations', readOnlyHint: true,  destructiveHint: false },
'template':  { title: 'Agent Template Management',     readOnlyHint: true,  destructiveHint: false },
'services':  { title: 'External Service Operations',   readOnlyHint: false, destructiveHint: true  },
```

Legacy annotations kept below for Part 2.

### 10. `app/api/pov/agent/execute/stream/route.ts`

**Lines 260-289**: Added legacy name mapping + default tool loading for GUI streaming path

```typescript
const CONSOLIDATED_TOOLS = ['project', 'perform', 'analytics', 'template', 'services'];
const LEGACY_TOOL_MAP: Record<string, string> = {
  'list_povs': 'project', 'get_pov_details': 'project',
  'list_tasks': 'project', 'get_task_context': 'project',
  'execute_task_action': 'perform', 'agent_results': 'perform',
  'get_ai_recommendations': 'analytics', 'analyze_team_performance': 'analytics',
  'list_agent_templates': 'template', 'get_agent_template_details': 'template',
  'call_service': 'services', 'discover_services': 'services', 'execute_workflow': 'services',
};

// Extract from mcpContext.tools, map legacy -> consolidated, dedup via Set
// Default to ALL 5 consolidated tools if none specified
if (mcpToolNames.length === 0) {
  mcpToolNames = [...CONSOLIDATED_TOOLS];
}
```

### 11. `lib/services/agentExecutionEngine.ts`

**Lines 394-422**: Same pattern as stream/route.ts for MCP Protocol agent execution path

```typescript
const CONSOLIDATED_TOOLS = ['project', 'perform', 'analytics', 'template', 'services'];
const LEGACY_TOOL_MAP: Record<string, string> = { /* same map */ };

let rawTools = mcpConfig.tools?.map(/* extract name */).filter(Boolean) || config.mcpTools || [];
const mappedToolSet = new Set<string>();
for (const name of rawTools) {
  mappedToolSet.add(LEGACY_TOOL_MAP[name] || name);
}
let mcpToolNames = [...mappedToolSet];
if (mcpToolNames.length === 0) {
  mcpToolNames = [...CONSOLIDATED_TOOLS];
}
```

Before: `mcpTools` defaulted to `[]` when no tools configured -> agents had no tools.
After: Defaults to all 5 consolidated tools -> agents always have tools.

### 12. `app/auth/oauth/success/page.tsx`

**Lines 700-730**: Updated MCP Tools Overview section from 14 old names to 5 consolidated names in the OAuth success UI.

---

## What Was NOT Changed (deferred to Part 2)

- `mcp-server-v5.js` — MCP Protocol server still registers 14 legacy tool names
- `sdk-native-basic-tools.js` / `sdk-native-advanced-tools.js` — handler registrations unchanged
- Handler error messages, nextSteps hints, `_meta.tool` values — all still use old names
- Formatters follow-up suggestions — still use old names
- ChatGPT connector handler — still uses old names
- Frontend components (RecommendationEngine, WorkflowEditor, MCPServerManager, InsightsTab) — mostly old names
- Agent templates (pAIchartUniversalTemplate.ts) — still reference old names
- Database prompts — still reference old names

---

## LEGACY_TOOL_MAP (single source of truth)

This map appears in 3 locations (must stay in sync):

1. `app/api/pov/agent/execute/stream/route.ts:262-269` — GUI streaming path
2. `lib/services/agentExecutionEngine.ts:396-403` — MCP Protocol agent execution path
3. `scripts/migrate-mcp-tool-names.ts:18-32` — Database migration script

```typescript
{
  'list_povs': 'project',
  'get_pov_details': 'project',
  'list_tasks': 'project',
  'get_task_context': 'project',
  'execute_task_action': 'perform',
  'agent_results': 'perform',
  'get_ai_recommendations': 'analytics',
  'analyze_team_performance': 'analytics',
  'list_agent_templates': 'template',
  'get_agent_template_details': 'template',
  'call_service': 'services',
  'discover_services': 'services',
  'execute_workflow': 'services',
}
```

Note: `get_service_health` is intentionally ABSENT — stays standalone (not consolidated).

---

## Testing & Verification

1. **Build**: `npm run build` passed with no new errors
2. **Production deploy**: Deployed successfully
3. **Agent execution test**: Created task "Verify consolidated MCP tool loading" in NetworkShield POV, assigned QA Test Engineer agent, executed via `mcp__paichart__execute_task_action(action: "agent.execute")`
   - Result: `mcpToolsProvided: ["project", "perform", "analytics", "template", "services"]`
   - Agent successfully used `project(action: 'pov.list')` to list POVs
   - Status: SUCCESS, 24s execution

---

## Patterns for Part 2 to Reuse

### Dispatcher Pattern
All 4 dispatchers follow identical structure:
1. Constructor takes handler instances
2. `handle(args, context)` extracts `action`, validates, dispatches
3. Returns MCP error response (not throw) for invalid/missing action
4. Passes `...params` (args minus action) to handler

### perform Direct Binding
`perform` does NOT use a dispatcher — it's `handleExecuteTaskAction` directly. The handler already has 13 sub-actions with its own routing. For Part 2, this means:
- Protocol server registers `perform` as direct binding to `advancedTools.handleExecuteTaskAction`
- BUT must wrap in `resolveUserContext` (embedded server doesn't need this, protocol server does)

### Schema Lookup
```
Check CONSOLIDATED_SCHEMAS[name] first -> fall back to TOOL_SCHEMAS[name]
```

### Default Tool Loading
When `mcpContext.tools` is empty: default to `['project', 'perform', 'analytics', 'template', 'services']`. Map legacy names through `LEGACY_TOOL_MAP` with Set dedup.
