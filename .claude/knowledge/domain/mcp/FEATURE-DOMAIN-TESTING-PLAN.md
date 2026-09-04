# MCP Hub Feature Domain Testing Plan

> **Version**: 1.0 | **Created**: 2026-01-12
> **Status**: Ready for execution
> **Complements**: `/.claude/knowledge/protocols/mcp-domain-testing-methodology-v2.md` (tool-focused testing)
> **Focus**: Integration behaviors and cross-cutting concerns

---

## Overview

This plan defines **feature domain testing** - testing integration points and behaviors that span multiple tools. It complements the existing tool-focused methodology by testing "how things work together" rather than "does each tool work individually."

### When to Use Each Approach

| Approach | Use When | Example |
|----------|----------|---------|
| **Tool-focused** (existing) | Testing new/untested tools | "Test all parameters of task.create" |
| **Feature domain** (this doc) | Testing integration behaviors | "Test variable chaining across execution modes" |

---

## Feature Domains (7 Domains)

### Domain 1: Internal Service Routing

**Purpose**: Test that internal pAIchart services route correctly without HTTP calls

**Files Under Test**:
- `lib/mcp/server/tools/internal/InternalServiceRouter.js`
- `lib/mcp/server/tools/hub/workflow-tools-handler.js`

**Test Scenarios**:

| ID | Scenario | Input | Expected Outcome |
|----|----------|-------|------------------|
| ISR-1 | List POVs via internal routing | `services(action: "call")(paichart-project-service, project(action: "pov.list"), {status: 'IN_PROGRESS'})` | Returns POVs, no HTTP call |
| ISR-2 | Get POV details via internal routing | `services(action: "call")(paichart-project-service, project(action: "pov.details"), {povId: 'xxx'})` | Returns POV with team members |
| ISR-3 | List tasks via internal routing | `services(action: "call")(paichart-project-service, project(action: "task.list"), {povId: 'xxx'})` | Returns tasks for POV |
| ISR-4 | Context normalization | Call with `user.id` vs `apiUserContext.userId` | Both work identically |
| ISR-5 | Unknown service fallback | `services(action: "call")(unknown-service, tool, {})` | Clear error message |
| ISR-6 | Unknown tool on known service | `services(action: "call")(paichart-project-service, fake_tool, {})` | Lists available tools |

**Success Criteria**:
- All internal calls bypass HTTP
- Context normalization handles both MCP and API patterns
- Error messages list available services/tools

---

### Domain 2: Variable Chaining

**Purpose**: Test `{{step.N.output.field}}` variable resolution across workflow steps

**Files Under Test**:
- `lib/services/workflow/core/orchestration-engine.js` (resolveVariables, navigatePath)

**Test Scenarios**:

| ID | Scenario | Input | Expected Outcome |
|----|----------|-------|------------------|
| VC-1 | Simple field access | `{{step.0.output.id}}` | Resolves to actual ID value |
| VC-2 | Nested field access | `{{step.0.output.data.name}}` | Resolves nested path |
| VC-3 | Array access | `{{step.0.output.data[0].id}}` | Resolves first array element |
| VC-4 | Array with nested field | `{{step.0.output.povs[0].team[0].userId}}` | Deep nested resolution |
| VC-5 | Entire output object | `{{step.0.output}}` | Passes full object (not stringified) |
| VC-6 | Embedded in string | `"Found {{step.0.output.count}} items"` | String interpolation works |
| VC-7 | Missing step reference | `{{step.5.output.id}}` (step 5 doesn't exist) | Graceful handling, no crash |
| VC-8 | Missing field in output | `{{step.0.output.nonexistent}}` | Returns undefined, no crash |
| VC-9 | Chaining across 3+ steps | Step 2 uses step 1, step 3 uses step 2 | Full chain resolves |
| VC-10 | data vs output alias | `{{step.0.data.id}}` vs `{{step.0.output.id}}` | Both work identically |

**Success Criteria**:
- All path patterns resolve correctly
- Missing data handled gracefully
- No stringification of object values when entire output referenced

---

### Domain 3: Workflow Execution Modes

**Purpose**: Test sequential, parallel, and conditional execution modes

**Files Under Test**:
- `lib/services/workflow/core/orchestration-engine.js`
- `lib/mcp/server/tools/hub/workflow-tools-handler.js`

**Test Scenarios**:

| ID | Scenario | Input | Expected Outcome |
|----|----------|-------|------------------|
| WE-1 | Sequential - basic | 2 steps, sequential mode | Step 1 completes before step 2 starts |
| WE-2 | Sequential - variable chaining | Step 2 uses `{{step.0.output}}` | Variables resolve correctly |
| WE-3 | Sequential - failure stop | Step 1 fails, failureStrategy: 'stop' | Step 2 never executes |
| WE-4 | Sequential - failure continue | Step 1 fails, failureStrategy: 'continue' | Step 2 still executes |
| WE-5 | Parallel - independent | 3 independent steps | All run concurrently |
| WE-6 | Parallel - with dependencies | Step 3 depends on step 1 | Step 3 waits for step 1 |
| WE-7 | Parallel - mixed | 2 independent, 1 dependent | Correct ordering |
| WE-8 | Conditional - then branch | Condition passes | Step 1 (then) executes, step 2 (else) skipped |
| WE-9 | Conditional - else branch | Condition fails | Step 2 (else) executes, step 1 (then) skipped |
| WE-10 | Circular dependency detection | Step 1 depends on step 2, step 2 depends on step 1 | Error before execution |

**Success Criteria**:
- Execution order matches mode semantics
- Failure strategies respected
- Dependencies analyzed correctly
- Circular dependencies caught

---

### Domain 4: Dual-Handler Parity

**Purpose**: Verify TypeScript and JavaScript handlers produce identical results

**Files Under Test**:
- `lib/services/workflow/handlers/mcpOrchestrationHandler.ts` (TS path)
- `lib/mcp/server/tools/hub/workflow-tools-handler.js` (JS path)

**Test Scenarios**:

| ID | Scenario | Method | Expected Outcome |
|----|----------|--------|------------------|
| DH-1 | Same workflow via MCP tool | `services(action: "workflow.execute")` MCP tool | Result matches expected format |
| DH-2 | Validation errors match | Invalid input to both | Same error structure |
| DH-3 | Activity logs match | Execute workflow | Both log with `source: 'mcp_hub'` |
| DH-4 | Execution tracking | Complete workflow | Both create MCPWorkflowExecution record |
| DH-5 | POV access validation | User without access | Both return ACCESS_DENIED |
| DH-6 | Internal service routing | Call internal service | Both route via InternalServiceRouter |

**Success Criteria**:
- Feature parity verified
- No behavioral differences between paths
- Activity records identical

**Note**: Currently only JS path is used (TS path has no callers). These tests prepare for future TS path usage.

---

### Domain 5: Activity Tracking

**Purpose**: Test platform activity logging for orchestration events

**Files Under Test**:
- `lib/auth/audit.ts` (TS)
- `lib/services/workflow/security/orchestration-audit.ts` (TS)
- `lib/mcp/server/tools/hub/workflow-tools-handler.js` (JS auditOrchestration)

**Test Scenarios**:

| ID | Scenario | Action | Expected Outcome |
|----|----------|--------|------------------|
| AT-1 | Workflow start logged | Execute workflow | Activity with action: 'orchestration.start' |
| AT-2 | Workflow complete logged | Successful workflow | Activity with action: 'orchestration.complete' |
| AT-3 | Workflow failed logged | Failed workflow | Activity with action: 'orchestration.failed' |
| AT-4 | Source field populated | Any workflow | `metadata.source = 'mcp_hub'` |
| AT-5 | Security event logged | Access denied | Activity type: 'SECURITY_EVENT' |
| AT-6 | Query by source | `SELECT WHERE source='mcp_hub'` | Returns orchestration activities |
| AT-7 | Step count in metadata | 3-step workflow | `metadata.stepCount = 3` |

**Success Criteria**:
- All workflow events logged
- Source field always 'mcp_hub'
- Security events captured with severity

---

### Domain 6: Service Registry

**Purpose**: Test MCP Hub service discovery, health, and call routing

**Files Under Test**:
- `lib/mcp/server/tools/hub/service-tools-handler.js`
- `lib/mcp/server/tools/hub/workflow-tools-handler.js`

**Test Scenarios**:

| ID | Scenario | Action | Expected Outcome |
|----|----------|--------|------------------|
| SR-1 | Discover all services | `services(action: "discover")()` | Returns registered services |
| SR-2 | Discover by capability | `services(action: "discover")(capability: 'monitoring')` | Filtered results |
| SR-3 | Get service health | `services(action: "health")(service_name: 'xxx')` | Health metrics returned |
| SR-4 | Get service tools | `registry(action: "tools")(service_name: 'xxx')` | Tool schemas returned |
| SR-5 | Call external service | `services(action: "call")(external, tool, args)` | HTTP call made, result returned |
| SR-6 | Call internal service | `services(action: "call")(paichart-*, tool, args)` | Routed via InternalServiceRouter |
| SR-7 | Service not found | `services(action: "call")(nonexistent, tool, args)` | Clear error with suggestions |
| SR-8 | Tool not found on service | `services(action: "call")(known, fake_tool, args)` | Lists available tools |

**Success Criteria**:
- Discovery returns accurate service list
- Health checks work
- Internal vs external routing correct
- Error messages helpful

---

### Domain 7: Security Policies

**Purpose**: Test security validation in workflow execution

**Files Under Test**:
- `lib/mcp/server/tools/hub/workflow-tools-handler.js` (validateServiceCall, validateServiceResponse)
- `lib/mcp/server/security/service-call-policy.js`

**Test Scenarios**:

| ID | Scenario | Action | Expected Outcome |
|----|----------|--------|------------------|
| SP-1 | Tool whitelist | Call whitelisted tool | Allowed |
| SP-2 | Blocked pattern | Arguments contain `sudo rm` | Blocked before execution |
| SP-3 | Blocked URL | Call to 169.254.x.x (metadata) | Blocked |
| SP-4 | Size limit - params | 150KB parameter payload | Blocked (100KB limit) |
| SP-5 | Size limit - response | Service returns 2MB | Blocked (1MB limit) |
| SP-6 | Internal service bypass | `services(action: "call")(paichart-project-service, ...)` | Skips external security checks |
| SP-7 | PII filtering | Response contains credit card | Redacted in output |
| SP-8 | POV access validation | User not on POV team | ACCESS_DENIED before workflow |

**Success Criteria**:
- Blocked patterns caught before execution
- Internal services bypass external checks
- PII redacted from responses
- POV access enforced

---

## Execution Approach

### Option A: POV-Based (Recommended)

Create a POV: **"MCP Hub Feature Domain Testing"**

Phases:
1. **PLANNING** - Review this doc, prepare test data
2. **EXECUTION** - 7 stages (one per domain)
3. **REVIEW** - Document findings, update architecture docs

Each domain becomes a stage with test scenarios as tasks.

### Option B: Incremental

Test domains as they become relevant:
1. Start with Domain 1 (Internal Service Routing) - we just fixed this
2. Add Domain 2 (Variable Chaining) - we just tested this
3. Continue based on priority

---

## Test Data Requirements

| Data | Purpose | How to Get |
|------|---------|------------|
| Active POV ID | Test POV access, task listing | `project(action: "pov.list")(status: 'IN_PROGRESS')` |
| Team member ID | Test assignments | `project(action: "pov.details")(povId)` → team |
| Phase/Stage IDs | Test task creation | `project(action: "pov.details")(povId)` → phases |
| Registered service | Test external calls | `services(action: "discover")()` |
| User without POV access | Test access denial | Use different user context |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Domain coverage | 7/7 domains tested |
| Scenario pass rate | 90%+ scenarios pass |
| Critical bugs found | 0 blocking issues |
| Integration confidence | 92%+ (production-ready) |

---

## Troubleshooting Tips & Gotchas

Lessons learned from recent bug fixes. Check these before assuming something is broken.

### Domain 1: Internal Service Routing

| Gotcha | What We Learned | Fix |
|--------|-----------------|-----|
| **Wrong endpoint pattern** | `/api/pov/{povId}/tasks` doesn't exist | Use `/api/tasks?povId={povId}` instead |
| **Multiple API patterns** | Same data available via different routes | Verify endpoint exists before assuming it works |
| **Context field names** | MCP uses `user.id`, API uses `apiUserContext.userId` | `normalizeContext()` handles both - check it's being called |

**How to verify correct endpoint**:
```bash
# Check what API routes exist
ls -la app/api/tasks/
ls -la app/api/pov/[povId]/

# Search for route handlers
grep -r "export async function GET" app/api/tasks/
```

### Domain 2: Variable Chaining

| Gotcha | What We Learned | Fix |
|--------|-----------------|-----|
| **Response structure varies** | `project(action: "pov.list")` returns `{ data: [...] }` not `{ povs: [...] }` | Always check actual response, don't assume |
| **Path is `data[0].id`** | Not `povs[0].id` or `items[0].id` | Log step output to see actual structure |
| **Entire output vs field** | `{{step.0.output}}` returns object, not string | Intentional - allows passing complex data |

**How to debug variable chaining**:
```javascript
// Add a step that just logs the previous output
{ service: 'paichart-project-service', tool: 'project(action: "pov.list")', arguments: {} }
// Then check what step.0.output actually contains before using it
```

### Domain 3: Workflow Execution

| Gotcha | What We Learned | Fix |
|--------|-----------------|-----|
| **workflowId is a FK** | Can't use generated string like `wf-${Date.now()}` | Use `null` for ad-hoc executions |
| **failedStep type mismatch** | Prisma expects String, engine returns Int | Convert: `String(result.failedStep)` |
| **Timeout vs validation error** | Invalid enum causes 30s timeout, not quick error | Validate BEFORE database query |

**How to check Prisma schema expectations**:
```bash
# Check the model definition
grep -A 20 "model MCPWorkflowExecution" prisma/schema.prisma
```

### Domain 4: Dual-Handler Parity

| Gotcha | What We Learned | Fix |
|--------|-----------------|-----|
| **TS path is unused** | Initialized at startup but no callers | Don't expect it to be called - all traffic via JS |
| **Process separation** | MCP server and Next.js are different processes | Can't directly call TS functions from JS |
| **Shared code must be JS** | TS can import JS, JS can't easily import TS | Put shared logic in `.js` files |

### Domain 5: Activity Tracking

| Gotcha | What We Learned | Fix |
|--------|-----------------|-----|
| **JS has local function** | `auditOrchestration()` in JS can't import TS version | Maintain both, keep aligned |
| **source field manual** | Both handlers must explicitly set `source: 'mcp_hub'` | Not automatic - verify it's there |
| **Two activity tables** | `Activity` (platform) vs `TaskActivity` (task-specific) | Different tables, different purposes |

**How to verify activity logging**:
```sql
-- Check recent MCP Hub activities
SELECT * FROM "Activity"
WHERE metadata->>'source' = 'mcp_hub'
ORDER BY "createdAt" DESC
LIMIT 10;
```

### Domain 6: Service Registry

| Gotcha | What We Learned | Fix |
|--------|-----------------|-----|
| **Internal vs external** | `paichart-*` services route internally, others go HTTP | Check `isInternalService()` logic |
| **Service name lookup** | Fuzzy matching exists | Partial names might match unexpectedly |

### Domain 7: Security Policies

| Gotcha | What We Learned | Fix |
|--------|-----------------|-----|
| **Internal bypass** | `paichart-*` services skip security policy checks | Intentional - internal services trusted |
| **Validation order** | Zod first, then engine validation, then security | Multiple layers - check which failed |

---

## Related Documentation

- **Tool-focused testing**: `/.claude/knowledge/protocols/mcp-domain-testing-methodology-v2.md`
- **Workflow architecture**: `/.claude/knowledge/domain/mcp/workflow-dual-handler-architecture.md`
- **Platform activity**: `/.claude/knowledge/domain/mcp/PLATFORM-ACTIVITY-SYSTEM.md`
- **Internal routing**: `lib/mcp/server/tools/internal/InternalServiceRouter.js`
- **Orchestration engine**: `lib/services/workflow/core/orchestration-engine.js`
