# Tool Architecture Discovery

> **Purpose**: Validate tool registration parity, dispatcher coverage, schema consistency, and detect legacy name leakage
> **Specialist**: mcp-tool-architecture-specialist
> **Estimated Time**: 15-30 minutes

---

## Phase 1: Schema Parity Check

### 1.1 List all consolidated tool schemas
```bash
# Discriminating form (2026-06-11): the old `grep "^\s\+\w\+:"` matched schema FIELDS and
# description-text too, so its output could never be compared to the expectation. Top-level
# entries are 2-space-indented keys whose line ENDS at the opening brace (`\{$`) — without
# the `$` anchor the count is 16, not 6 (template-literal text inside descriptions matches too):
sed -n '/^const CONSOLIDATED_SCHEMAS = {/,/^};/p' lib/mcp/server/config/tool-schemas.js | grep -cE "^  [a-z_]+: \{$"   # expect 6
sed -n '/^const TOOL_SCHEMAS = {/,/^};/p' lib/mcp/server/config/tool-schemas.js | grep -cE "^  [a-z_]+: \{$"           # expect 4
```
**Expected**: 6 entries in CONSOLIDATED_SCHEMAS (project, perform, analytics, template, services, registry) + 4 in TOOL_SCHEMAS (search, fetch, prompt_command, list_prompts). Both counts proven 2026-06-11.

### 1.2 Verify dispatcher VALID_ACTIONS match schema enums
```bash
# Dispatcher actions
grep "VALID_ACTIONS" lib/mcp/server/tools/dispatchers/*.js

# Schema action enums
grep -A 1 "enum:" lib/mcp/server/config/tool-schemas.js
```
**Check**: Every dispatcher action must appear in the corresponding schema enum

### 1.3 Verify getToolCapabilities iterates both schema objects
```bash
grep -A 5 "getToolCapabilities" mcp-server-v5.js | head -20
```
**Check**: Must iterate CONSOLIDATED_SCHEMAS AND TOOL_SCHEMAS (bug found Mar 2026 where only TOOL_SCHEMAS was iterated)

---

## Phase 2: Security Tier Validation

### 2.1 Check all tools are in a security tier
```bash
grep -A 30 "AUTHENTICATED_TOOLS\|ADMIN_TOOLS\|PUBLIC_TOOLS" lib/mcp/server/config/tool-security.js
```
**Check**: Every tool in CONSOLIDATED_SCHEMAS + TOOL_SCHEMAS must appear in exactly one tier

### 2.2 Verify handler-level authorization (corrected 2026-06-11)
```bash
# pov.create — RolePermission-TABLE governed since 2026-05-25 (ed74e8ce): ADMIN+USER allowed,
# DEMO blocked. NOT hardcoded-ADMIN — do not re-add a role!==ADMIN gate.
grep -n "canCreate = await checkPermission" lib/mcp/tasks/action/handlers/pov/pov-create-handler.ts   # expect 1 (the gate, ~:284)

# pov.update — still hardcoded ADMIN/SUPER_ADMIN
grep -n "role !== UserRole.ADMIN" lib/mcp/tasks/action/handlers/pov/pov-update-handler.ts   # expect 1 (:63)
```
**Check**: `pov.create` gated by `checkPermission(PoV, CREATE)` against the RolePermission table (question-type: role capability, no instance yet — see `project_permission_architecture_intent`). `pov.update` requires ADMIN at the handler.

---

## Phase 3: Tool Annotations Check

### 3.1 List all annotated tools
```bash
grep "^\s\+'" lib/mcp/server/config/tool-annotations.js
```
**Check**: All 6 consolidated tools + 4 standalone tools = 10 total should have annotations

---

## Phase 4: LEGACY_TOOL_MAP Sync

### 4.1 Compare all 3 LEGACY_TOOL_MAP locations
```bash
# Location 1
grep -A 25 "LEGACY_TOOL_MAP\|legacyToolMap\|legacy.*=.*{" lib/services/agentExecutionEngine.ts | head -30

# Location 2
grep -A 25 "LEGACY_TOOL_MAP\|legacyMap\|legacy.*:" app/api/pov/agent/execute/stream/route.ts | head -30

# Location 3
grep -A 25 "LEGACY_TOOL_MAP" scripts/migrate-mcp-tool-names.ts | head -30
```
**Check**: All 3 must have identical key-value mappings

---

## Phase 5: Legacy Name Leakage Audit

### 5.1 Count all legacy tool name references
```bash
# Full legacy name pattern
rg "list_povs|get_pov_details|execute_task_action|get_task_context|get_ai_recommendations|analyze_team_performance|list_agent_templates|get_agent_template_details|agent_results|discover_services|call_service|get_service_health|execute_workflow|get_workflow_status|cancel_workflow|list_workflow_executions|register_service|list_my_services|update_service|delete_service|get_service_tools" --type js --type ts -c
```

### 5.2 Check user-facing references (must be zero)
```bash
# _meta.tool values
rg "_meta.*tool.*['\"]" lib/mcp/server/tools/ --type js -n | grep -v "//\|services\|registry\|project\|perform\|analytics\|template\|search\|fetch\|prompt_command\|list_prompts"

# nextSteps containing legacy names
rg "nextSteps" lib/mcp/server/tools/ --type js -A 5 | grep -i "list_povs\|execute_task_action\|discover_services\|call_service\|get_service_health"
```
**Check**: Zero user-facing legacy references

### 5.3 Verify internal references use consolidated names
```bash
# Handler registrations (should use consolidated action names like 'project.pov_list')
grep "toolHandlers.set" lib/mcp/server/tools/sdk-native-basic-tools.js lib/mcp/server/tools/sdk-native-advanced-tools.js

# Performance timing (should use consolidated names like 'sdk_native_project_pov_list')
grep "performanceMonitor" lib/mcp/server/tools/advanced/*.js | grep "start\|end"

# Rate limit keys (should use consolidated names like 'perform:${userId}')
grep "rateLimit\|rateLimiter" lib/mcp/server/tools/advanced/*.js
```
**Check**: All should use consolidated naming. Only handler method names (e.g., `handleListPOVs`) retain legacy-style names.

---

## Phase 6: Dispatcher Coverage

### 6.1 Verify all dispatchers exist and route correctly
```bash
ls -la lib/mcp/server/tools/dispatchers/

# Check each dispatcher's handle() method has all actions
grep -A 30 "handle(" lib/mcp/server/tools/dispatchers/project-dispatcher.js | head -35
grep -A 20 "handle(" lib/mcp/server/tools/dispatchers/analytics-dispatcher.js | head -25
grep -A 15 "handle(" lib/mcp/server/tools/dispatchers/template-dispatcher.js | head -20
grep -A 30 "handle(" lib/mcp/server/tools/dispatchers/services-dispatcher.js | head -35
grep -A 20 "handle(" lib/mcp/server/tools/dispatchers/registry-dispatcher.js | head -25
```

### 6.2 Verify perform direct binding
```bash
grep "perform" mcp-server-v5.js | grep "toolHandlers\|handleExecuteTaskAction"
grep "perform" lib/mcp/embedded-server.ts | grep "toolHandlers\|handleExecuteTaskAction"
```
**Check**: `perform` should route directly to handleExecuteTaskAction, not through a dispatcher

### 6.3 Verify three-tier fallback in ALL handlers (Mar 2026)
```bash
# Tier 1/2/3 in task-action-handler (perform tool)
echo "=== task-action-handler ==="
grep -n "routeAction\|Tier 2\|Tier 3\|throw.*No authenticated" lib/mcp/server/tools/advanced/task-action-handler.js | head -5

# Tier 1/2/3 in team-performance-handler (analytics.team_performance)
echo "=== team-performance-handler ==="
grep -n "routeAction\|Tier 2\|Tier 3\|throw.*No authenticated" lib/mcp/server/tools/advanced/analytics/team-performance-handler.js | head -5

# Tier 1/2/3 in agent-results-handler (perform.agent_results)
echo "=== agent-results-handler ==="
grep -n "routeAction\|Tier 2\|Tier 3\|throw.*No authenticated" lib/mcp/server/tools/advanced/agent-results-handler.js | head -5

# buildTokenPayload guards (empty-string, role enum)
grep -n "buildTokenPayload\|role.*enum\|email.*guard" lib/mcp/server/utils/build-token-payload.js

# Router bridge (JS→TS bridge — now loads `tier:'direct'` in BOTH paichart-web
# and paichart-mcp since Phase 2 proper Apr 8 2026 registered ts-node in
# mcp-server-http-clean.js. Pre-Phase-2 it silently fell back to Tier 2 HTTP
# in paichart-mcp — see Bug Class 73 and TODO-RATE-LIMIT-FIX.md.)
grep -n "require.*router\|routeAction\|loadRouter" lib/mcp/tasks/action/router-bridge.js | head -5

# Context-Enriched API Client handlers (should use ContextEnricher, not three-tier)
echo "=== Context-Enriched handlers ==="
grep -n "ContextEnricher" lib/mcp/server/tools/advanced/ai-recommendations-handler.js | head -3
```
**Check**: Three-tier in task-action, team-performance, agent-results. Context-Enriched in ai-recommendations. Pattern ref: `identity-preserving-token-forwarding-pattern.md`

### 6.4a GS14 Dispatch-Boundary safeParse (Phase 1, 2026-05-16; refactored Phase 1.5, 2026-05-17)

The GS14 chokepoint pattern closes the multi-path bypass discovered in pov.update. Phase 1.5 lifted the enforcement to the registration site — dispatchers no longer call `validateDispatchArgs` themselves; they receive Zod-validated `args`.

Canonical surfaces:

- **`embedded-server.ts:~1669-1674`** — registers all 6 consolidated tools via `wrapWithSchema('toolName', ...)`. This is the **structural** GS14 enforcement site. (`perform` joined the wrapped set 2026-05-23, `b89078b5` Wave A gap closure; mcp-server-v5.js got its parallel wraps in `f63c92b3`.)
- **`lib/mcp/server/tools/dispatchers/dispatch-with-schema.js`** — exports `validateDispatchArgs(toolName, args)` (the underlying check) AND `wrapWithSchema(toolName, handler)` (sugar that wraps a dispatcher handle method).
- **`lib/mcp/server/tools/hub/workflow-tools-handler.js`** — L3 handler-boundary validation via its OWN `WorkflowHandlerInputSchema` safeParse (W1 closure, 2026-05-16). CORRECTED 2026-06-11: this file never used `validateDispatchArgs` at any commit (`git -S` empty — a born-stale claim); the L3 boundary is covered, by a different mechanism.

```bash
# Verify the helper exports both functions
echo "=== GS14 helper exports ==="
grep -n "function validateDispatchArgs\|function wrapWithSchema\|module.exports" lib/mcp/server/tools/dispatchers/dispatch-with-schema.js

# Verify wrapWithSchema is used at the embedded-server registration site (all 6 consolidated tools)
echo ""
echo "=== wrapWithSchema calls at registration ==="
grep -cn "wrapWithSchema('" lib/mcp/embedded-server.ts   # expect 6 (proven 2026-06-11)

# Expected: 6 wrapWithSchema calls (project, perform, analytics, template, services, registry).
# `perform` was wrapped 2026-05-23 (b89078b5) — the old "5 calls, perform stays direct"
# expectation predates that gap closure. perform still BINDS direct to
# handleExecuteTaskAction (no dispatcher), but its args go through the schema wrapper.

# Verify the 5 dispatchers DON'T call validateDispatchArgs themselves anymore
# (Phase 1.5 structural lift — boilerplate removed)
echo ""
echo "=== Dispatchers should NOT call validateDispatchArgs (Phase 1.5) ==="
grep -l "validateDispatchArgs" lib/mcp/server/tools/dispatchers/*.js | grep -v dispatch-with-schema

# Expected: empty output. The 5 dispatcher files no longer import or call it.
# If any dispatcher file lists here, it's been re-introduced incorrectly —
# the wrapper at embedded-server.ts already handles enforcement.

# Verify workflow-tools-handler's L3 handler-boundary validation (own Zod schema, NOT validateDispatchArgs)
echo ""
echo "=== workflow-tools-handler L3 boundary (WorkflowHandlerInputSchema) ==="
grep -n "WorkflowHandlerInputSchema" lib/mcp/server/tools/hub/workflow-tools-handler.js | head -3   # expect >=2 (declaration + safeParse use)

# Verify CONSOLIDATED_SCHEMAS has an entry per consolidated tool
echo ""
echo "=== CONSOLIDATED_SCHEMAS coverage ==="
grep -n "CONSOLIDATED_SCHEMAS = \|^  '" lib/mcp/server/config/tool-schemas.js | grep -E "(project|analytics|template|services|registry|perform)" | head -10

# Verify the helper throws on unknown toolName (defends against config drift)
echo ""
echo "=== Throw-on-config-drift smoke (Phase 1 test #15) ==="
grep -n "CONSOLIDATED_SCHEMAS lookup miss\|nonexistent_tool_typo" scripts/test-mcp-phase1-smoke.ts | head -3
```

**Check**: 6 `wrapWithSchema` calls at embedded-server.ts registration (incl. `perform` since `b89078b5`); 0 `validateDispatchArgs` calls in the dispatcher files (Phase 1.5 lift); workflow-tools-handler.js covered by its own `WorkflowHandlerInputSchema` safeParse. If a new consolidated tool is registered without a `wrapWithSchema` call, GS14 enforcement is bypassed — that's the post-Phase-1.5 P0 hazard (it has happened: f63c92b3).

### 6.4 Verify perform action routing (generic vs special pre-processing) — re-proven 2026-06-11
```bash
# Actions with special pre-processing (still 4: pov.create, stage.create, task.create, agent.execute)
# SHAPE NOTE (2026-06-11): task.create + stage.create moved from `if (action === ...)` into the
# grouped `actionsRequiringPOV.includes(action)` check — a bare `action === ` grep sees only 2 of 4.
echo "=== Actions with special pre-processing ==="
grep -nE "action === 'pov.create'|action === 'agent.execute'|actionsRequiringPOV = " lib/mcp/server/tools/advanced/task-action-handler.js   # expect 3 lines (:167, :298, :357)

# Schema-declared actions (14 since 2026-05-15 — pov.update added in 8bb6915a)
echo ""
echo "=== Schema-declared perform actions ==="
grep -A 5 "action: z.enum(\[$" lib/mcp/server/config/tool-schemas.js | grep -oE "'[a-z]+\.[a-z_]+'" | wc -l   # expect 14
# Handler's own validActions list must match (BC75 two-sources-of-truth hazard — the handler documents it):
grep -c "'analytics.generate'" lib/mcp/server/tools/advanced/task-action-handler.js   # expect 1 (last entry of validActions)

# Verify generic three-tier dispatch (routeAction / apiClient) handles ALL actions
echo ""
echo "=== Generic dispatch point (shared by all 14 actions) ==="
grep -n "routeAction(action\|apiClient.post" lib/mcp/server/tools/advanced/task-action-handler.js | head -5
```
**Check**: Only 4 actions have special pre-processing (2 via `action ===`, 2 via the `actionsRequiringPOV` group). The remaining 10 flow generically through `routeAction(action, finalParameters)` or `apiClient.post()`. This is intentional — `perform` is NOT a dispatcher because the three-tier pattern IS the shared business logic.

### 6.5 Shared-param-bag collision audit (2026-06-09)

A consolidated tool flattens ONE param bag across all actions, so a shared `z.enum` param's values must be the
UNION of what every consuming handler reads, or the schema silently REJECTS valid input for some actions (the
`perform.format` bug, fcf0947a). Run when adding/changing a consolidated enum param OR when a new action joins:
```bash
# 1. List every enum param in the consolidated schemas
grep -nE "z\.enum\(\[" lib/mcp/server/config/tool-schemas.js

# 2. For a suspect param (e.g. format), find the enum values vs what handlers actually read/compare
grep -rn "\bformat\b" lib/mcp/server/config/tool-schemas.js                              # schema values
grep -rn "format ===\|format ==\|format || " lib/mcp/tasks/action/handlers/ lib/mcp/server/tools/advanced/  # handler reads
# MISMATCH = collision (schema rejects a value a handler needs) → enum must be the UNION of consumers.

# 3. Distinguish the two NON-bugs before flagging:
grep -rn "|| analysisType\||| .*Type\b" lib/mcp/tasks/action/handlers/  # `a || b` = intentional alias (e.g. CD compat), NOT a collision
grep -rn "else if (position ===\|} else {" lib/mcp/tasks/action/handlers/*/  # value routed to else-default = benign schema-vs-behavior gap, not a reject
```
**Rule:** a real collision = the schema enum LACKS a value a handler reads (→ rejects valid input). An alias
(`a||b`) or an else-default value is fine. See mcp-tool-architecture-specialist §Shared-param-bag collision risk.

---

### 6.6 agent.execute poll-gate audit (2026-07-14)

The OUTER dispatcher owns agent.execute's completion-poll; two prompt-return branches must both exist:

```bash
# Gate present: in-agent-loop (callingExecutionId) + waitForCompletion:false both skip the poll
grep -n "promptReturn\|inAgentLoop\|waitForCompletion" lib/mcp/server/tools/advanced/task-action-handler.js | head
# Schema declares the nested param (flat top-level form is stripped by design)
grep -n "waitForCompletion" lib/mcp/server/config/tool-schemas.js
# Prod behavior anchor (should appear on every in-loop or opted-out execute)
# ssh prod: grep 'agent.execute prompt-return' /var/log/paichart/mcp-combined-0.log | tail -5
```

**What to look for**: in-loop calls NEVER poll (pipeline protocols exit-and-retrigger); human-client default
stays poll-to-completion; the five doc surfaces stay in sync when semantics change (tool-schemas docstring,
HOWTO-run-an-agent §6, orchestrator Step 3 retry text, ADD guide §8, cEOS DEMO-RUN-GUIDE Path B).

## Phase 7: Service Registry

### 7.1 Check internal service registration
```bash
grep "paichart-project-service\|paichart-pov-service\|paichart-task-service" scripts/register-internal-services.ts
grep "INTERNAL_SERVICES\|LEGACY_SERVICE" lib/services/workflow/security/trust-level.js
```
**Check**: Only `paichart-project-service` should be active. Legacy names only in backward-compat routing.

---

## Summary Template

After running all phases, fill in:

```
Tool Architecture Discovery Results
====================================
Schema Parity:     [PASS/FAIL] - 6 consolidated + 4 standalone = 10 tools
Security Tiers:    [PASS/FAIL] - All tools in exactly one tier
Annotations:       [PASS/FAIL] - X/Y tools annotated
LEGACY_TOOL_MAP:   [PASS/FAIL] - 3/3 locations in sync
Legacy Leakage:    [PASS/FAIL] - X user-facing refs (target: 0)
Dispatcher Coverage: [PASS/FAIL] - All actions routed
Service Registry:  [PASS/FAIL] - paichart-project-service active

Overall Health: [HEALTHY/NEEDS-ATTENTION/CRITICAL]
```
