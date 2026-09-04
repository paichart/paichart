# Part 2: MCP Protocol Server Tool Consolidation

> **Status**: Planning (Revised v3) | **Created**: 2026-03-06 | **Revised**: 2026-03-07
> **Depends on**: Part 1 (complete) | **Ref**: `.claude/knowledge/domain/mcp/tool-consolidation-embedded-completion.md`
>
> **Specialist Reviews**: 4 completed (2026-03-06) — findings incorporated
> | Specialist | Confidence | Key Finding |
> |-----------|-----------|-------------|
> | MCP Hub | 82% | `get_service_health` consolidation gap |
> | Architectural Review | 82% | `resolveUserContext` wrapping required |
> | Database Manager | 72% | MCPWorkflow.steps migration gap |
> | Prompt Construction | 82% | ChatGPT connector + error helpers missed |

Part 1 consolidated the **embedded server** (14 -> 5 tools). Part 2 does the same for the **MCP Protocol server** (mcp-server-v5.js) used by external clients (Claude Desktop, ChatGPT connector).

---

## Key Decisions

### Clean Cutover (no dual registration)
This is a UAT environment with no external clients depending on old names. Dual registration creates confusion (AI clients see both old and new names, don't know which to use). Instead: **remove old tool registrations, add new ones, done.** One deployment, clean break.

### Shared Architecture
Both servers (embedded + protocol) use the **same dispatchers, same tool names, same schemas**. The only difference is the protocol server wraps each dispatcher in `resolveUserContext()` for global context fallback.

### `perform` is a Direct Binding
`perform` binds directly to `advancedTools.handleExecuteTaskAction` — which itself delegates to `TaskActionHandler.handle()`. This is functionally identical to the dispatcher pattern (a class with `handle(args, context)` that routes by action). No special treatment needed.

### `perform` is the Canonical Pattern Reference
All schema descriptions reference `perform` as the example of the action-based pattern. Never reference `execute_task_action` from any new code.

---

## Consolidated Tool Names

| New Name | Old Names Replaced | Permission |
|----------|-------------------|------------|
| `project` | `list_povs`, `get_pov_details`, `list_tasks`, `get_task_context` | AUTHENTICATED |
| `perform` | `execute_task_action`, `agent_results` | AUTHENTICATED |
| `analytics` | `get_ai_recommendations`, `analyze_team_performance` | AUTHENTICATED |
| `template` | `list_agent_templates`, `get_agent_template_details` | ADMIN |
| `services` | `discover_services`, `call_service`, `execute_workflow`, `get_service_health`, `get_workflow_status`, `cancel_workflow`, `list_workflow_executions` | AUTHENTICATED |

**Tools NOT consolidated** (stay as-is): `search`, `fetch`, `register_service`, `update_service`, `delete_service`, `list_my_services`, `get_service_tools`, `list_prompts`, `prompt_command`

---

## Updated ServicesDispatcher Actions

The Part 1 `ServicesDispatcher` has 3 actions. Part 2 expands it to 7:

| Action | Handler | Was |
|--------|---------|-----|
| `discover` | `hubTools.handleDiscoverServices` | `discover_services` |
| `call` | `hubTools.handleCallService` | `call_service` |
| `health` | `hubTools.handleGetServiceHealth` | `get_service_health` |
| `workflow.execute` | `hubTools.handleExecuteWorkflow` | `execute_workflow` |
| `workflow.status` | `hubTools.handleGetWorkflowStatus` | `get_workflow_status` |
| `workflow.cancel` | `hubTools.handleCancelWorkflow` | `cancel_workflow` |
| `workflow.list` | `hubTools.handleListWorkflowExecutions` | `list_workflow_executions` |

Update `CONSOLIDATED_SCHEMAS.services` to include all 7 actions in the enum and description.

Update `LEGACY_TOOL_MAP` in all 3 locations to add:
```
'get_service_health': 'services',
'get_workflow_status': 'services',
'cancel_workflow': 'services',
'list_workflow_executions': 'services',
```

---

## Part 1 Cleanup (embedded-server.ts leftover old names)

These functions in `lib/mcp/embedded-server.ts` still use old tool names from before Part 1:

- [ ] **`generateNavigationSuggestions()` (lines 478-498)** — switch cases `list_povs`, `list_tasks` with old-name suggestions
  - Update cases to `project` and suggestion text to consolidated names

- [ ] **`generateResourceLinks()` (lines 531-660)** — switch cases `list_povs`, `list_tasks`, `get_pov_details`, `analyze_team_performance`, `list_agent_templates`, `get_ai_recommendations`
  - Update all 6 cases to consolidated names

- [ ] **`generateElicitationPrompts()` (lines 841-950)** — switch cases + `followUpAction` and `action` values
  - `list_povs` (846): `followUpAction: 'get_pov_details'` -> `followUpAction: 'project'`
  - `list_tasks` (870): options reference `get_task_context`, `analyze_team_performance`, `get_ai_recommendations`, `execute_task_action`
  - `get_pov_details` (894): options reference `get_task_context`, `analyze_team_performance`, `get_ai_recommendations`, `execute_task_action`
  - `analyze_team_performance` (908): options reference `get_ai_recommendations`, `analyze_team_performance`
  - `get_ai_recommendations` (921): `followUpAction: 'execute_task_action'`
  - `list_agent_templates` (943): options reference `get_agent_template_details`
  - Update ALL switch cases, followUpAction values, and option action values to consolidated names

- [ ] **`testAllTools()` (lines 1695-1727)** — switch cases for test args
  - `list_povs`, `list_tasks`, `get_pov_details`, `get_task_context`, `execute_task_action`, `get_ai_recommendations`, `analyze_team_performance`
  - Update to consolidated names: `project` (with action variants), `perform`, `analytics`

---

## Section 1: MCP Protocol Server Core

### 1.1 Tool Registration in mcp-server-v5.js

- [ ] **`mcp-server-v5.js:956-968`** - Basic + Advanced tool collection loops
  - **Action**: Remove these loops entirely. Replace with consolidated tool registration using same dispatchers as embedded server, wrapped in `resolveUserContext`:
    ```javascript
    const projectDispatcher = new ProjectDispatcher(this.basicTools, this.advancedTools);
    const analyticsDispatcher = new AnalyticsDispatcher(this.advancedTools);
    const templateDispatcher = new TemplateDispatcher(this.basicTools);
    const servicesDispatcher = new ServicesDispatcher(this.hubTools); // expanded to 7 actions

    this.toolHandlers.set('project', async (args, context) => {
      const userContext = resolveUserContext(context, 'project');
      return projectDispatcher.handle(args, userContext);
    });
    this.toolHandlers.set('perform', async (args, context) => {
      const userContext = resolveUserContext(context, 'perform');
      return this.advancedTools.handleExecuteTaskAction(args, userContext);
    });
    this.toolHandlers.set('analytics', async (args, context) => {
      const userContext = resolveUserContext(context, 'analytics');
      return analyticsDispatcher.handle(args, userContext);
    });
    this.toolHandlers.set('template', async (args, context) => {
      const userContext = resolveUserContext(context, 'template');
      return templateDispatcher.handle(args, userContext);
    });
    this.toolHandlers.set('services', async (args, context) => {
      const userContext = resolveUserContext(context, 'services');
      return servicesDispatcher.handle(args, userContext);
    });
    ```
  - Keep `prompt_command` registration from basicTools as-is

- [ ] **`mcp-server-v5.js:985-1021`** - Hub tool handler registration
  - Remove `discover_services`, `get_service_health`, `call_service`, `execute_workflow`, `get_workflow_status`, `cancel_workflow`, `list_workflow_executions` from hub array (all now routed through `services` dispatcher)
  - Keep: `register_service`, `list_my_services`, `update_service`, `delete_service`, `list_prompts`, `get_service_tools`

- [ ] **`mcp-server-v5.js:1051-1078`** - `setupRequestHandlers()` / `ListToolsRequestSchema`
  - Check `CONSOLIDATED_SCHEMAS` first, fall back to `TOOL_SCHEMAS`

### 1.2 ServicesDispatcher Update

- [ ] **`lib/mcp/server/tools/dispatchers/services-dispatcher.js`** - Expand from 3 to 7 actions
  - Add: `health`, `workflow.status`, `workflow.cancel`, `workflow.list`
  - Update `VALID_ACTIONS` array
  - Add switch cases delegating to hub handler methods

### 1.3 HTTP Transport Server (verification only)

- [x] **`mcp-server-http-clean.js`** - VERIFIED: Zero hardcoded tool names. Delegates to `mcpServer.toolHandlers` dynamically. No changes needed. **Wave 7 Phase 7.2 update (2026-05-21)**: the delegating `tools/call` dispatch case moved with `processMCPRequest` to `MCPCoreManager.processRequest` at `lib/mcp/server/mcp-core.ts`. Still accesses `mcpServer.toolHandlers.get(toolName)` via the local `mcpServer` const after inline guard. Verification holds — zero hardcoded names.

---

## Section 2: Tool Schemas

### 2.1 Remove legacy TOOL_SCHEMAS entries

Clean cutover — remove (not deprecate) these entries from `lib/mcp/server/config/tool-schemas.js`:

- [ ] `list_povs` schema
- [ ] `get_pov_details` schema
- [ ] `list_tasks` schema
- [ ] `get_task_context` schema
- [ ] `execute_task_action` schema
- [ ] `agent_results` schema
- [ ] `get_ai_recommendations` schema
- [ ] `analyze_team_performance` schema
- [ ] `list_agent_templates` schema
- [ ] `get_agent_template_details` schema
- [ ] `discover_services` schema
- [ ] `call_service` schema
- [ ] `execute_workflow` schema
- [ ] `get_service_health` schema
- [ ] `get_workflow_status` schema
- [ ] `cancel_workflow` schema
- [ ] `list_workflow_executions` schema

### 2.2 Update CONSOLIDATED_SCHEMAS

- [ ] **`services` schema** — expand from 3 to 7 actions, enrich description with categories, workflow examples, tips (port from legacy `discover_services` schema richness)
- [ ] **All schemas** — verify cross-references only use consolidated names, reference `perform` as pattern example

### 2.3 Update non-consolidated tool schemas

- [ ] **`search` schema** — update SEE ALSO and WORKFLOW cross-references to consolidated names
- [ ] **`fetch` schema** — update SEE ALSO cross-references to consolidated names

---

## Section 3: Tool Annotations

**File**: `lib/mcp/server/config/tool-annotations.js`

- [ ] Remove all legacy platform tool annotations (lines 125-185): `list_povs`, `get_pov_details`, `list_tasks`, `get_task_context`, `execute_task_action`, `get_ai_recommendations`, `analyze_team_performance`, `list_agent_templates`, `get_agent_template_details`, `agent_results`
- [ ] Remove legacy hub tool annotations: `discover_services`, `get_service_health`, `call_service`, `execute_workflow`, `get_workflow_status`, `cancel_workflow`, `list_workflow_executions`
- [ ] Keep consolidated annotations (lines 11-42) and non-consolidated tool annotations

---

## Section 4: Tool Security

**File**: `lib/mcp/server/config/tool-security.js`

- [ ] Remove from AUTHENTICATED_TOOLS: `discover_services`, `get_service_health`, `list_povs`, `get_pov_details`, `list_tasks`, `execute_task_action`, `get_task_context`, `get_ai_recommendations`, `analyze_team_performance`, `execute_workflow`, `get_workflow_status`, `cancel_workflow`, `list_workflow_executions`
- [ ] Remove from ADMIN_TOOLS: `list_agent_templates`, `get_agent_template_details`
- [ ] Verify consolidated names already present: `project`, `perform`, `analytics`, `services` in AUTHENTICATED; `template` in ADMIN

---

## Section 5: Response Formatters

### 5.1 Base Formatters

- [ ] **`lib/mcp/server/utils/formatters.js:58-76`** - `getSimpleFollowUpSuggestions()`
  - Replace old-name cases with consolidated names and updated suggestion text

### 5.2 Enhanced Formatters

- [ ] **`lib/mcp/server/utils/enhanced-formatters.js:19-43`** - `formatToolResponse()`
  - Replace old-name switch cases with consolidated names
- [ ] **`lib/mcp/server/utils/enhanced-formatters.js:61-74`** - `generateFollowUpSuggestions()`
  - Replace old-name cases with consolidated names

---

## Section 6: Error Messages, Hints & Recovery

### 6.1 Error Helpers

- [ ] **`lib/mcp/server/tools/basic/error-helpers.js`** — 12+ old-name references
  - Lines 40-42, 73, 95, 120, 144, 209: `list_povs()`, `get_pov_details()`, `get_task_context()`, `list_tasks()`
  - Update all to consolidated names

### 6.2 Smart Error Recovery

- [ ] **`lib/mcp/server/utils/smart-error-recovery.js:541-542`**
  - `suggestedTool: 'list_povs'` -> `suggestedTool: 'project'`

### 6.3 Auth Messages

- [ ] **`lib/mcp/server/utils/auth-messages.js:24-25`**
  - References `list_povs`, `get_ai_recommendations` in auth gate text

### 6.4 Handler Error Messages & _meta.tool

Update ALL handler error messages, nextSteps, and `_meta.tool` values:

**sdk-native-basic-tools.js:**
- [ ] `handleListPOVs()` — nextSteps (246-282), errors (294-319), `_meta.tool`
- [ ] `handleListTasks()` — nextSteps + errors (~480-540), `_meta.tool`
- [ ] `handleGetPOVDetails()` — nextSteps + errors (~724-758), `_meta.tool`
- [ ] `handleListAgentTemplates()` — nextSteps + errors (~926-939), `_meta.tool`
- [ ] `handleGetAgentTemplateDetails()` — nextSteps + errors (~1098-1111), `_meta.tool`

**sdk-native-advanced-tools.js:**
- [ ] `handleGetTaskContext()` — nextSteps + `_meta.tool`
- [ ] `handleExecuteTaskAction()` — nextSteps + `_meta.tool`
- [ ] `handleAgentResults()` — nextSteps + `_meta.tool`
- [ ] `handleGetAIRecommendations()` — nextSteps + `_meta.tool`
- [ ] `handleAnalyzeTeamPerformance()` — nextSteps + `_meta.tool`

### 6.5 Hub Tool Handler Hints

- [ ] **`lib/mcp/server/tools/hub/service-call-handler.js:404`** — `get_service_health` reference
- [ ] **`lib/mcp/server/tools/hub/service-registration-handler.js:367`** — `get_service_health` reference
- [ ] **`lib/mcp/server/tools/hub/service-update-handler.js:258,261`** — `get_service_health` references
- [ ] **`lib/mcp/server/tools/hub/service-tools-handler.js:210`** — `get_service_health` reference
- [ ] **`lib/mcp/server/tools/hub/user-services-handler.js:121`** — `get_service_health` reference
- [ ] **`lib/mcp/server/tools/hub/service-discovery-handler.js:390-398`** — `get_service_health`, `call_service` references
- [ ] **`lib/mcp/server/tools/hub/service-health-handler.js:159,166,173,489-490`** — self-references to `get_service_health`
- [ ] **`lib/mcp/server/tools/hub/workflow-tools-handler.js:732`** — `list_povs` example

---

## Section 7: ChatGPT Connector Handler

**File**: `lib/mcp/server/tools/chatgpt-connector-handler.js`

- [ ] **Line 114** — `"Use list_povs() for structured POV browsing"`
- [ ] **Line 173** — `"Use list_povs() or list_tasks() to browse available resources"`
- [ ] **Line 195** — `"Use list_povs() as an alternative"`
- [ ] **Line 272** — `"Use list_povs() to see available POV IDs"`
- [ ] **Lines 1159-1179** — Full next-step suggestions using `get_pov_details`, `execute_task_action`, `get_task_context`, `agent_results`, `list_agent_templates`

Update all to consolidated names.

---

## Section 8: Parameter Normalizer

**File**: `lib/mcp/server/utils/parameter-normalizer.js`

- [ ] **Lines 765-946** — Tool-specific normalization maps keyed by old names
  - Replace keys: `list_povs` -> `project`, `get_pov_details` -> `project`, `execute_task_action` -> `perform`, `get_ai_recommendations` -> `analytics`, `analyze_team_performance` -> `analytics`
  - Update POV context injection array (~line 924) and task context injection array (~line 946)

---

## Section 9: Agent Templates

**File**: `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts`

- [ ] **Lines 58-66** — Tool category documentation
- [ ] **Lines 143-149** — QA Test Engineer tool guidance (6 refs)
- [ ] **Lines 171-177** — Business Analyst tool guidance (7 refs incl. `agent_results`)
- [ ] **Lines 199-205** — Technical Consultant tool guidance (7 refs incl. `agent_results`)
- [ ] **Line 215** — DevOps section (`analyze_team_performance`)

- [ ] **Re-seed templates**: `npx tsx scripts/seed-agent-templates.ts`

---

## Section 10: MCP Prompts

- [ ] **`lib/mcp/server/prompts/prompt-registry.js:288-324`** — `audit_all_tasks` prompt content
- [ ] **`temp-scripts/seed-prompt-templates.ts`** — 5 templates with 10+ old-name references
  - `pov_health_check`, `team_performance_report`, `high_priority_summary`, `phase_transition_checklist`, `blocked_tasks_investigation`
- [ ] **Production database audit**:
  ```sql
  SELECT id, name, "promptText" FROM "AgentPromptLibrary"
  WHERE "promptText" LIKE '%list_povs%' OR "promptText" LIKE '%execute_task_action%'
  OR "promptText" LIKE '%get_pov_details%' OR "promptText" LIKE '%list_tasks%'
  OR "promptText" LIKE '%get_ai_recommendations%' OR "promptText" LIKE '%analyze_team_performance%'
  OR "promptText" LIKE '%get_service_health%' OR "promptText" LIKE '%discover_services%';
  ```
- [ ] **`lib/mcp/server/tools/hub/workflow-tools-handler.js:732`** — example text

---

## Section 11: Frontend Components

- [ ] **`components/workflows/RecommendationEngine.tsx:115-221`** — tool detection + workflow steps
- [ ] **`components/workflows/WorkflowEditor.tsx:575`** — `placeholder="list_povs"` -> `"project"`
- [ ] **`components/mcp/MCPServerManager.tsx:336`** — tool tooltip listing
- [ ] **`components/analytics/tabs/InsightsTab.tsx:72-120`** — AI prompt suggestions

---

## Section 12: API Routes

- [ ] **`app/api/mcp/status/route.ts:171-181`** — tool list + `toolCount`
- [x] ~~**`app/api/mcp/tools/performance/route.ts:207-235`** — tool ID references~~ (OBSOLETE — route family deleted 2026-06-12: dead code, 0 callers, fabricated metrics)

---

## Section 13: Database Migration

### 13.1 Extend migration script

- [ ] **`scripts/migrate-mcp-tool-names.ts`** — Add:
  - `MCPWorkflow.steps[].tool` field rewriting (HIGH risk if missed)
  - `Task.mcpToolId` scan
  - New entries in LEGACY_TOOL_MAP: `get_service_health`, `get_workflow_status`, `cancel_workflow`, `list_workflow_executions`

### 13.2 Historical execution records

- [ ] **DO NOT migrate** `MCPWorkflowExecution` records (audit data)
  - Any UI/API reading execution steps should apply LEGACY_TOOL_MAP at read time

### 13.3 Fix broken interaction tracking (pre-existing bug)

- [ ] **`mcp-server-v5.js:1092-1103`** — `prisma.mcpInteraction.create()` uses non-existent fields
  - Fix field mapping to actual schema fields, use consolidated tool names

### 13.4 Re-seed example workflows

- [ ] **`scripts/seed-example-workflows.ts`** — Update tool names in workflow step definitions

---

## Section 14: Scripts & Verification

- [ ] **`scripts/verify-tool-annotations.js:73-74`** — Update expected tool names
- [ ] **`scripts/test-mcp-pagination-exposure.ts`** — Update refs
- [ ] **`scripts/test-mcp-hub-tools.ts`** — Update `get_service_health` refs
- [ ] **`scripts/test-mcp-action-security.ts`** — Update expectations

---

## Section 15: Documentation & Knowledge Base

- [ ] `.claude/knowledge/domain/mcp/mcp-layer-jsdoc-reference.md`
- [ ] `.claude/knowledge/domain/mcp/tool-permission-management.md`
- [ ] `.claude/knowledge/domain/mcp/mcp-hub-service-registration-reference.md`
- [ ] `.claude/knowledge/patterns/mcp-tool-gold-standard-pattern.md`
- [ ] `.claude/knowledge/patterns/handler-level-authorization-pattern.md`
- [ ] `.claude/agents/prompt-construction-specialist.md`
- [ ] `.claude/agents/agent-execution-specialist.md`
- [ ] `.claude/agents/mcp-hub-specialist.md`
- [ ] `docs/sales_eng_website/index.html:279, 303`
- [ ] `cline_docs/` various files (leave as historical)

---

## Implementation Order

Since this is a clean cutover (no dual registration), the order is:

1. **Part 1 cleanup** — Fix embedded-server.ts leftover old names (4 functions)
2. **ServicesDispatcher** — Expand from 3 to 7 actions
3. **LEGACY_TOOL_MAP** — Add 4 new entries in all 3 locations
4. **Schemas** — Remove 17 legacy schemas, update `services` consolidated schema, update `search`/`fetch` cross-refs
5. **mcp-server-v5.js** — Replace old tool registrations with 5 consolidated + `resolveUserContext` wrappers
6. **Config files** — tool-annotations.js, tool-security.js (remove legacy entries)
7. **Handlers & formatters** — Error messages, nextSteps, `_meta.tool`, follow-up suggestions
8. **ChatGPT connector + error helpers** — All old-name references
9. **Parameter normalizer** — Replace old-name keys
10. **Agent templates + prompts** — Update + re-seed
11. **Frontend + API routes** — Components and status endpoints
12. **Database migration** — Extend script, run migration, fix interaction tracking
13. **Scripts** — Update verification and test scripts
14. **Documentation** — Knowledge base sweep

**Build + test after each major step.**

---

## Estimated Scope

| Section | Files | Effort |
|---------|-------|--------|
| Part 1 cleanup (embedded-server.ts) | 1 file | Medium |
| ServicesDispatcher expansion | 1 file | Small |
| LEGACY_TOOL_MAP updates | 3 files | Small |
| Schemas (remove legacy + update) | 1 file (large) | Medium |
| mcp-server-v5.js core | 1 file | Medium |
| Config (annotations + security) | 2 files | Small |
| Handler error messages + hints | 2 files + 8 hub files | Large |
| ChatGPT connector | 1 file | Medium |
| Parameter normalizer | 1 file | Small |
| Agent templates + prompts | 3 files + re-seed | Medium |
| Frontend + API | 6 files | Medium |
| Database migration | 2 files + DB | Medium |
| Scripts | 4 files | Small |
| Documentation | 10+ files | Low priority |
