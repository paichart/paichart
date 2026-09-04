# MCP Workflow System Discovery

**Last Updated**: 2026-03-05
**Status**: Production - Complete with Executions API, Cleanup, Admin GUI, Retries, Structured Errors, Crash Recovery + BUG-004 variable resolution fix
**Confidence**: 95% - Validated through specialist review + implementation session
**Last Validated**: 2026-03-05 - BUG-004 variable resolution regex fix, debug logging, 14-test suite

## Objective

Perform comprehensive discovery of the MCP Workflow System including API routes, handlers, schemas, execution tracking, frontend components, and MCP tool integration for multi-service orchestration.

## Context

The MCP Workflow System provides **workflow orchestration and execution tracking** for the pAIchart MCP Hub. It enables named workflows, ad-hoc multi-service orchestration, execution history, and admin management through a Bloomberg-style terminal interface.

**Key Architecture Insight**: The system has a dual-layer architecture:
- **TypeScript Layer**: `/lib/workflows/handlers.ts` + `/app/api/workflows/` routes (Admin GUI)
- **JavaScript Layer**: `workflow-tools-handler.js` + `orchestration-engine.js` (MCP Tools)
- **Shared Engine**: `orchestration-engine.js` is pure JS used by both layers

## Discovery Scope

### 0. Error & Status Visibility Surfaces (post-BUG-HUB-001, May 22)

**Where workflow execution errors surface to operators / AI clients** — there is NO dedicated workflow-analytics MCP tool; the surfaces are:

| Surface | Tool / location | What it returns | Auth |
|---|---|---|---|
| **Primary list view** | `services(action: 'workflow.list')` MCP tool | `id`, `status`, `startTime`, `endTime`, `duration`, `error`, `failedStep`, `povId` — **post-BUG-HUB-001 select includes both error AND failedStep** | Bearer token, user-scoped |
| **Detail view** | `services(action: 'workflow.status', executionId: ...)` MCP tool | Full execution row including `output` (per-step results) and `steps` metadata | Bearer token |
| **Audit log** | `Activity` table via SQL (or admin UI) | Per-orchestration metadata including aggregated `error` string post-BUG-HUB-001 Fix 5 | SQL access only |
| **Pino logs** | `journalctl -u paichart-app` | Per-step + per-execution structured logs (`component: 'orchestration-engine'` etc.) | SSH access only |

**No `analytics` MCP tool path covers workflow executions** — `analytics` is scoped to POV/task data. If the customer wants aggregated workflow-failure stats (top error types, MTBF, time-to-recover), that's a backlog item.

**Post-BUG-HUB-001 invariant**: when `services(action: 'workflow.list')` returns a row with `status: 'FAILED'`, the `error` field is GUARANTEED to be non-empty (and `failedStep` populated for the workflow-definition step index, not the array position). If you see a FAILED row with `error: null` in production after May 22, that's a regression — file as a new bug.

### 1. API Route Architecture
- [ ] Verify all workflow API routes exist
- [ ] Check createHandler usage with requireAuth and allowedRoles
- [ ] Confirm admin-only access (ADMIN, SUPER_ADMIN roles)
- [ ] Document rate limiting configuration
- [ ] Verify pagination support (limit, offset)

### 2. Workflow Handlers
- [ ] Analyze all 6 handlers in lib/workflows/handlers.ts
- [ ] Check user assertion pattern (user! with middleware guarantee)
- [ ] Verify JSON transformation for nested steps structure
- [ ] Document error response patterns

### 3. Validation Schemas
- [ ] Examine Zod schemas in lib/workflows/schemas.ts
- [ ] Check nativeEnum usage for Prisma enums
- [ ] Verify CUID validation on ID fields
- [ ] Document WorkflowStepSchema re-export pattern

### 4. Execution Tracking
- [ ] Analyze MCPWorkflowExecution model
- [ ] Check orchestration-tracker.ts implementation
- [ ] Verify execution status lifecycle (RUNNING → COMPLETED/FAILED)
- [ ] Document orchestrationTracker.start() - creates RUNNING record
- [ ] Check orchestrationTracker.complete(executionId, results, success, errorMessage?)
- [ ] Verify errorMessage parameter — Path 2 callers (mcpOrchestrationHandler.ts:227) must forward `result.error` from engine. Tracker has defensive fallback at orchestration-tracker.ts:114 (`error: success ? null : (errorMessage || 'Workflow failed without diagnostic context...')`) per BUG-HUB-001 fix May 22.
- [ ] Document recordStep() for incremental step recording
- [ ] Examine metadata storage pattern (stepsCompleted, totalSteps, totalExecutionTime)
- [ ] Check validation-before-execution vs execution-failure error handling patterns
- [ ] **Error aggregation invariant** (BUG-HUB-001, May 22): verify `engine.execute()` return contract at orchestration-engine.js:680-737 — when `success === false`, `error` is ALWAYS non-empty (aggregated from first failed step if inner executor didn't propagate). Grep: `grep -n "aggregatedError\|aggregatedFailedStep" lib/services/workflow/core/orchestration-engine.js`
- [ ] **Workflow.list surface** — verify select clause at workflow-tools-handler.js:~1389 includes BOTH `error: true` AND `failedStep: true`. Audit log at workflow-tools-handler.js:1094-1106 must surface `result.error` in metadata. Grep: `grep -nA3 "select:.*\\b" lib/mcp/server/tools/hub/workflow-tools-handler.js | grep -A12 "workflowType"`
- [ ] **Two persistence paths to MCPWorkflowExecution.error** — confirm both routes accept the aggregated error: Path 1 = workflow-tools-handler.js:~1060 direct prisma update; Path 2 = mcpOrchestrationHandler.ts:227 → orchestrationTracker.complete(.., result.error). Run SQL probe to attribute failures: `SELECT "workflowType", COUNT(*) FROM mcp_workflow_executions WHERE status='FAILED' AND error IS NULL GROUP BY "workflowType";` (post-fix should return 0 rows).

### 5. Cleanup & Time Bomb Prevention
- [ ] Verify cleanupOldExecutions in compliance-monitor.js
- [ ] Check retention periods — MCPWorkflowExecution is **30 days** (COMPLETED/FAILED only; a stale "90 days" claim here matched a JSDoc drift fixed `d78597fe`). Since 2026-07-08 all windows live in ONE map: `lib/mcp/server/security/retention-windows.js` `RETENTION_DAYS` (defaults + sweep + resourceManager read it; literal pins in `scripts/test-compliance-monitor.ts` are the change ritual)
- [ ] Confirm scheduleCleanup is called on startup
- [ ] Document cleanup interval configuration

### 6. Frontend Components
- [ ] Analyze WorkflowsPage.tsx client component
- [ ] Check WorkflowTerminal CRUD interface
- [ ] Verify WorkflowExecutionsPanel data fetching
- [ ] Document Bloomberg-style table patterns

### 7. MCP Tool Integration
- [ ] Examine workflow-tools-handler.js
- [ ] Verify services(action: "workflow.execute") tool schema
- [ ] Check workflowName parameter for named workflows
- [ ] Document variable chaining resolution

### 8. Workflow Engine Core Files (post-U2 2026-05-19)
- [ ] Analyze workflowEngine.ts — `WorkflowConfig.token` field DROPPED (Phase D site #16); current fields: workflowType, povId, workflowId, executionConfig, parameters, metadata
- [ ] Check index.ts entry point — `executeOrchestrationWorkflow` no longer accepts `token` option; Bearer-extract at handlers.ts:355,367 deleted (sites #12/#13)
- [ ] Examine orchestration-context.ts — `OrchestrationContext.user.token` DROPPED, `azp?: string` ADDED (Phase D site #17). `buildOrchestrationContext(userId, povId?)` no longer takes `token` parameter (was 3rd arg pre-U2).
- [ ] Verify orchestration-params.ts schema (unaffected by U2)

### 9. Orchestration Engine
- [ ] Analyze orchestration-engine.js (pure JS)
- [ ] Check execution modes (sequential, parallel, conditional)
- [ ] Verify failure strategies (stop, continue, rollback)
- [ ] Document dependency graph resolution
- [ ] Check `executeWithRetry()` method and retry wiring into all 3 modes
- [ ] Verify `retryState` global budget tracking across steps

### 9b. Per-Step Retries & Error Types (Mar 2026)
- [ ] Verify `executeWithRetry()` in orchestration-engine.js
- [ ] Check retry schema fields (`retries`, `retryDelay`, `maxTotalRetries`) in all 4 schema files
- [ ] Verify `WorkflowErrorTypeSchema` Zod enum (9 error types) in orchestration-params.ts
- [ ] Check all 13 error return paths have `errorType` + `retryable` fields
- [ ] Verify `retryable === true` strict opt-in (not `=== false`)
- [ ] Check `_globalDeadline` set in workflow-tools-handler.js before execution
- [ ] Verify exponential backoff formula: `retryDelay * 2^(attempt-1)`
- [ ] Check global retry budget enforcement (`retryState.totalRetries < maxTotalRetries`)

### 9c. Crash Recovery (Mar 2026)
- [ ] Verify `recoverStaleExecutions()` method in workflow-tools-handler.js
- [ ] Check 15-min threshold (900000ms) — 5-min safety margin over 10-min timeout
- [ ] Verify startup call from HubToolsHandler constructor (fire-and-forget)
- [ ] Check `updateMany` atomic pattern (single SQL)

### 10. Rate Limiting & Security
- [ ] Check internal call bypass logic
- [ ] Verify admin-only role enforcement
- [ ] Document rate limit tiers
- [ ] Analyze proxy header detection

### 11. POV Security & Trust Levels
- [ ] Analyze trust-level.js security layer
- [ ] Examine trust level constants (INTERNAL, TRUSTED, OWNER, SCOPED, ANONYMOUS)
- [ ] Document determineTrustLevel() service classification logic
- [ ] Verify TOKEN_RECEIVING_TRUST_LEVELS configuration (which trust levels receive JWT token)
- [ ] Check INTERNAL_SERVICES and TRUSTED_INTERNAL_SERVICES lists
- [ ] Understand checkPOVRequirement() warning system for external services
- [ ] Check cross-service trust inheritance rules (trust cannot increase through chains)
- [ ] Document ownership-based trust (OWNER trust when user owns the service)

### 12. Service Calling Architecture
- [ ] Analyze orchestrationServiceCaller.callService() routing logic
- [ ] Document InternalServiceRouter.js dual-mode routing (direct vs HTTP)
- [ ] Check isInternalService() detection logic
- [ ] Verify auto-detection of TypeScript service availability (getPOVService, getTaskService)
- [ ] Document direct mode (Web UI context → calls domain services directly)
- [ ] Check HTTP fallback mode (MCP server → calls /api routes)
- [ ] Verify internal service list: paichart-project-service, paichart-kpi-service, paichart-recommendation-engine (post 2026-05-23 router cleanup — `paichart-pov-service` + `paichart-task-service` dropped, were never in DB)
- [ ] Confirm direct-mode handlers (handleGetPOVDetails, handleGetPOVPhases, handleListTasks, handleGetTaskDetails) all gate via getValidatePOVAccess (commit 792dbc01 R1)
- [ ] Examine connection pooling benefits (100-200ms savings per call)

### 13. Audit & Security Events
- [ ] Check orchestration-audit.ts event logging
- [ ] Document audit events (start, complete, failed)
- [ ] Verify auditOrchestration() call sites in mcpOrchestrationHandler
- [ ] Examine audit metadata structure (stepCount, services, errors)

### 14. Database Models
- [ ] Examine MCPWorkflow model
- [ ] Check MCPWorkflowExecution model
- [ ] Verify enum definitions (MCPWorkflowStatus, MCPWorkflowExecutionStatus)
- [ ] Document JSON field structure (steps, triggers, schedule)
- [ ] Check error and failedStep fields for validation failures

### 15. System Limits Discovery
- [ ] Find MAX_CONCURRENT_EXECUTIONS_PER_USER limit
- [ ] Check step count limits in Zod schemas
- [ ] Verify timeout constraints
- [ ] Document parallel execution limits (maxConcurrent)
- [ ] Check argument size limits

## Search Strategies

### 1. API Route Discovery
```bash
# Find all workflow API routes
find app/api/workflows -name "route.ts" -type f

# Check route handlers and methods
grep -r "export async function \(GET\|POST\|PUT\|DELETE\)" app/api/workflows/ -A 5

# Verify createHandler usage pattern
grep -r "createHandler" app/api/workflows/ -B 2 -A 10

# Check admin role enforcement
grep -r "allowedRoles.*ADMIN" app/api/workflows/ -A 2

# Find rate limiting configuration
grep -r "rateLimit:" app/api/workflows/ -A 3
```

### 2. Handler Analysis
```bash
# List all workflow handlers
grep "^export async function handle" lib/workflows/handlers.ts

# Check user assertion pattern (user! with middleware guarantee)
grep "user\!" lib/workflows/handlers.ts

# Find JSON transformation logic (nested steps extraction)
grep -A 10 "stepsConfig.*as Record" lib/workflows/handlers.ts

# Check pagination implementation
grep -B 5 -A 10 "limit.*offset" lib/workflows/handlers.ts

# Find error response patterns
grep "return.*error:" lib/workflows/handlers.ts -A 3
```

### 3. Schema Validation
```bash
# Find all Zod schemas
grep -r "z\.\(object\|string\|number\|enum\|nativeEnum\)" lib/workflows/schemas.ts -A 3

# Check Prisma enum imports
grep "import.*from '@prisma/client'" lib/workflows/schemas.ts

# Verify nativeEnum usage (prevents drift)
grep "z\.nativeEnum" lib/workflows/schemas.ts -A 2

# Find CUID validation
grep "z\.string()\.cuid()" lib/workflows/schemas.ts

# Check WorkflowStepSchema re-export
grep "WorkflowStepSchema" lib/workflows/schemas.ts
grep "WorkflowStepSchema" lib/services/workflow/types/orchestration-params.ts -A 10
```

### 4. Execution Tracking
```bash
# Find MCPWorkflowExecution model
grep -A 30 "model MCPWorkflowExecution" prisma/schema.prisma

# Check orchestration tracker
grep -r "createExecution\|updateExecution" lib/services/workflow/tracking/ -A 5

# Find execution status updates
grep -r "status.*COMPLETED\|status.*FAILED\|status.*RUNNING" lib/services/workflow/ -B 2 -A 2

# Check metadata storage
grep -r "metadata.*Json" lib/services/workflow/
```

### 5. Named Workflows Database Validation (Feb 2026)
```bash
# List all named workflows
ssh <PROD_USER>@<PROD_HOST> "PGPASSWORD='[PASSWORD]' psql -U paichart -h localhost -d paichart_production -c \"SELECT name, category, status, jsonb_array_length(steps->'steps') as step_count, steps->'executionMode' as mode FROM mcp_workflows ORDER BY \\\"createdAt\\\" DESC;\""

# Verify workflow JSON structure
ssh <PROD_USER>@<PROD_HOST> "PGPASSWORD='[PASSWORD]' psql -U paichart -h localhost -d paichart_production -c \"SELECT name, jsonb_pretty(steps) FROM mcp_workflows WHERE name = 'trust-level-basic-demo';\""

# Check workflow execution history
SELECT we.id, we.status, we.duration, we."createdAt"
FROM mcp_workflow_executions we
JOIN mcp_workflows w ON we."workflowId" = w.id
WHERE w.name = 'trust-level-basic-demo'
ORDER BY we."createdAt" DESC LIMIT 10;

# Production workflows (validated Feb 2026):
# - trust-level-basic-demo (sequential, 1 step, 50-60ms)
# - jwks-validation-advanced-demo (parallel, 3 steps, 73ms)
# - token-troubleshooting-demo (sequential, 2 steps, 59ms)
# - pov-workflow-showcase (parallel, 2 steps, 587ms)
```

**Variable Chaining Fix** (Critical):
```
Internal services return: { data: [...], total: N }

WRONG: {{step.0.output.povs[0].id}}
RIGHT: {{step.0.output.data[0].id}}
```

### 6. Cleanup Scheduler Discovery
```bash
# Find cleanup methods in compliance monitor
grep -A 20 "cleanupOldExecutions" lib/mcp/server/security/compliance-monitor.js

# Check retention periods — expect RETENTION_DAYS.<key> references (single source of truth since
# 2026-07-08), ZERO numeric defaults; the values themselves live in retention-windows.js
grep "retentionDays" lib/mcp/server/security/compliance-monitor.js -A 5
cat lib/mcp/server/security/retention-windows.js | grep -A 12 "RETENTION_DAYS = Object.freeze"

# Verify scheduleCleanup call
grep "scheduleCleanup" lib/mcp/server/security/compliance-monitor.js -A 10

# Find cleanup interval configuration
grep "setInterval.*cleanup\|24.*60.*60.*1000" lib/mcp/server/security/compliance-monitor.js -A 3

# Check all records cleaned up
grep "cleanupOld" lib/mcp/server/security/compliance-monitor.js
```

### 6. Frontend Component Analysis
```bash
# Find workflow page components
find app -path "*workflows*" -name "*.tsx"
find components/workflows -name "*.tsx"

# Check data fetching patterns
grep -r "fetch.*workflows" app/\(authenticated\)/workflows/ components/workflows/ -A 5

# Find BLOOMBERG_TABLE usage
grep "BLOOMBERG_TABLE" app/\(authenticated\)/workflows/WorkflowsPage.tsx -A 3

# Check execution panel implementation
grep -A 50 "function WorkflowExecutionsPanel" app/\(authenticated\)/workflows/WorkflowsPage.tsx

# Find status badge rendering
grep -A 15 "getStatusBadge" app/\(authenticated\)/workflows/WorkflowsPage.tsx
```

### 7. MCP Tool Integration
```bash
# Find workflow tools in MCP server
grep -r "workflow.execute\|workflow.status\|workflow.cancel\|workflow.list" lib/mcp/server/ -l

# Check tool schemas (consolidated under 'services' tool)
grep -A 30 "services:" lib/mcp/server/config/tool-schemas.js

# Find workflowName parameter handling
grep -r "workflowName" lib/mcp/server/tools/hub/workflow-tools-handler.js -A 5

# Check tool handler implementation
grep -A 40 "handleExecuteWorkflow" lib/mcp/server/tools/hub/workflow-tools-handler.js
```

### 8. Workflow Engine Core Files
```bash
# Core workflow engine - executeWorkflow, WorkflowConfig, retry logic
ls -la lib/services/workflow/workflowEngine.ts
grep -A 20 "interface WorkflowConfig" lib/services/workflow/workflowEngine.ts
grep -A 30 "async executeWorkflow" lib/services/workflow/workflowEngine.ts
grep -A 20 "executeWithRetries" lib/services/workflow/workflowEngine.ts

# Workflow service entry point - executeOrchestrationWorkflow
ls -la lib/services/workflow/index.ts
grep -A 20 "executeOrchestrationWorkflow" lib/services/workflow/index.ts
grep "getWorkflowEngine\|initializeWorkflowEngine" lib/services/workflow/index.ts

# Orchestration context — post-U2 2026-05-19: token DROPPED, azp ADDED
ls -la lib/services/workflow/types/orchestration-context.ts
grep -A 30 "buildOrchestrationContext" lib/services/workflow/types/orchestration-context.ts
grep -A 20 "interface OrchestrationContext" lib/services/workflow/types/orchestration-context.ts
# Token field should NOT appear (dropped Phase D site #17); azp? should appear instead:
grep -nE "\btoken\b|\bazp\b" lib/services/workflow/types/orchestration-context.ts
# Expected: token only in JSDoc historical notes; azp on user object

# Orchestration params schema
ls -la lib/services/workflow/types/orchestration-params.ts
grep -A 20 "MCPOrchestrationParams" lib/services/workflow/types/orchestration-params.ts
```

### 9. Orchestration Engine Analysis
```bash
# Find shared orchestration engine (correct path!)
ls -la lib/services/workflow/core/orchestration-engine.js

# Check execution mode implementations
grep -A 20 "executeSequential\|executeParallel\|executeConditional" lib/services/workflow/core/orchestration-engine.js

# Find failure strategy handling
grep -r "failureStrategy\|stop\|continue\|rollback" lib/services/workflow/core/orchestration-engine.js -A 3

# Check variable chaining resolution
grep -A 10 "resolveVariables\|{{step\." lib/services/workflow/core/orchestration-engine.js

# Check variable resolution regex (BUG-004 fix — must use boundary-safe regex)
echo ""
echo "=== Variable Resolution Regex (BUG-004) ==="
grep -n "output\.data|output|data" lib/services/workflow/core/orchestration-engine.js
grep -n '(?:\\.|$)' lib/services/workflow/core/orchestration-engine.js

# Run variable resolution tests
echo ""
echo "=== Variable Resolution Tests ==="
npm run test:variable-resolution 2>&1 | tail -10

# Verify dependency graph logic
grep -A 15 "dependsOn\|buildDependencyGraph" lib/services/workflow/core/orchestration-engine.js
```

### 9b. Per-Step Retries & Error Types (Mar 2026)
```bash
# Find executeWithRetry method
grep -A 40 "async executeWithRetry" lib/services/workflow/core/orchestration-engine.js

# Check retryState initialization in all 3 execution modes
grep -B 2 -A 3 "retryState" lib/services/workflow/core/orchestration-engine.js

# Verify executeWithRetry wiring (should appear at all callService call sites)
grep "executeWithRetry" lib/services/workflow/core/orchestration-engine.js

# Find WorkflowErrorTypeSchema enum
grep -A 12 "WorkflowErrorTypeSchema" lib/services/workflow/types/orchestration-params.ts

# Check errorType in all error return paths (MCP handler)
grep -n "errorType:" lib/mcp/server/tools/hub/workflow-tools-handler.js

# Check errorType in engine variable error paths
grep -n "errorType:" lib/services/workflow/core/orchestration-engine.js

# Verify retryable field assignments
grep -n "retryable:" lib/mcp/server/tools/hub/workflow-tools-handler.js lib/services/workflow/core/orchestration-engine.js

# Check retry schema fields across all 4 schema files
grep -n "retries\|retryDelay\|maxTotalRetries" lib/services/workflow/types/orchestration-params.ts lib/mcp/server/config/tool-schemas.js lib/validation/mcp-hub-validation.ts
# Note: `orchestration-params.js` and `mcp-hub-validation.js` were deleted Apr 8 2026
# (Phase 2 proper / Bug Class 73 eradication). .ts files are now the sole source of
# truth — the extensionless resolver picks them up via ts-node in both PM2 processes.

# Find _globalDeadline setup
grep -n "_globalDeadline" lib/mcp/server/tools/hub/workflow-tools-handler.js lib/services/workflow/core/orchestration-engine.js

# Check exponential backoff implementation
grep -A 5 "Math.pow" lib/services/workflow/core/orchestration-engine.js

# Verify attempts field in step results
grep -n "attempts" lib/services/workflow/core/orchestration-engine.js lib/services/workflow/tracking/orchestration-tracker.ts lib/workflows/types.ts
```

### 9c. Crash Recovery (Mar 2026)
```bash
# Find recoverStaleExecutions method
grep -A 25 "recoverStaleExecutions" lib/mcp/server/tools/hub/workflow-tools-handler.js

# Check startup call in HubToolsHandler
grep "recoverStaleExecutions" lib/mcp/server/tools/hub-tools-handler.js -A 3

# Verify 15-min threshold
grep "900000\|maxAgeMs" lib/mcp/server/tools/hub/workflow-tools-handler.js

# Check onStepComplete $transaction (race condition fix)
grep -A 15 "onStepComplete" lib/mcp/server/tools/hub/workflow-tools-handler.js | head -20

# Verify lastCompletedStep metadata tracking
grep "lastCompletedStep" lib/mcp/server/tools/hub/workflow-tools-handler.js
```

### 10. Rate Limiting & Security
```bash
# Find rate limiting in API handler
grep -A 20 "options\.rateLimit" lib/api-handler.ts

# Check internal call bypass
grep -A 10 "isInternalCall\|forwardedFor\|x-real-ip" lib/api-handler.ts

# Find admin role checks
grep -r "allowedRoles.*UserRole\.\(ADMIN\|SUPER_ADMIN\)" lib/workflows/ app/api/workflows/

# Check authentication requirement
grep "requireAuth: true" app/api/workflows/ -r
```

### 11. POV Security & Trust Levels
```bash
# Find trust-level.js security layer
find lib/services/workflow/security -name "trust-level.js"

# Check trust level constants
grep -A 8 "const TrustLevel" lib/services/workflow/security/trust-level.js

# Check INTERNAL_SERVICES and TRUSTED_INTERNAL_SERVICES
grep -A 3 "INTERNAL_SERVICES.*=" lib/services/workflow/security/trust-level.js
grep -A 3 "TRUSTED_INTERNAL_SERVICES.*=" lib/services/workflow/security/trust-level.js

# Document determineTrustLevel logic (ownership, team membership, public access)
grep -A 50 "async function determineTrustLevel" lib/services/workflow/security/trust-level.js

# Check TOKEN_RECEIVING_TRUST_LEVELS (which trust levels get JWT token)
grep -A 10 "TOKEN_RECEIVING_TRUST_LEVELS" lib/services/workflow/security/trust-level.js

# Understand checkPOVRequirement warning system for external services
grep -A 20 "function checkPOVRequirement" lib/services/workflow/security/trust-level.js

# Check trust inheritance (trust cannot increase through chains)
grep -A 15 "function getEffectiveTrustLevel" lib/services/workflow/security/trust-level.js

# Find buildServiceContext — post-U2 spread guard (Phase F.4) prevents `token: undefined`
grep -A 25 "function buildServiceContext" lib/services/workflow/security/trust-level.js
# Expected pattern: { ...baseContext, ...(token ? { token } : {}) }
# JSDoc at :163 distinguishes per-call-minted token (post-U2) from Bearer-forwarded (pre-U2, REMOVED)
grep -B 1 -A 4 "contextData.token" lib/services/workflow/security/trust-level.js
```

### 12. Service Calling Architecture
```bash
# Find orchestrationServiceCaller
grep -A 30 "orchestrationServiceCaller" lib/services/workflow/integrations/service-caller.ts

# Check InternalServiceRouter
find lib/mcp/server/tools/internal -name "InternalServiceRouter.js"

# Document isInternalService logic
grep -A 10 "isInternalService" lib/services/workflow/integrations/service-caller.ts

# Check auto-detection of TypeScript services
grep -A 5 "getPOVService\|getTaskService" lib/mcp/server/tools/internal/InternalServiceRouter.js

# Find direct mode implementation
grep -A 20 "DIRECT MODE\|use domain service directly" lib/mcp/server/tools/internal/InternalServiceRouter.js

# Check HTTP fallback mode
grep -A 20 "HTTP FALLBACK\|apiClient\.get" lib/mcp/server/tools/internal/InternalServiceRouter.js

# Verify internal service list
grep "INTERNAL_SERVICES.*=" lib/services/workflow/security/trust-level.js -A 3

# Check connection pooling
grep -A 10 "ServiceConnectionPool\|connection pooling" lib/services/workflow/integrations/service-caller.ts
```

### 13. Audit & Security Events
```bash
# Find orchestration-audit.ts
find lib/services/workflow/security -name "orchestration-audit.ts"

# Check auditOrchestration function
grep -A 20 "export.*auditOrchestration" lib/services/workflow/security/orchestration-audit.ts

# Find audit event types
grep "type.*'start'\|'complete'\|'failed'" lib/services/workflow/security/orchestration-audit.ts

# Check audit call sites in TS handler
grep "auditOrchestration" lib/services/workflow/handlers/mcpOrchestrationHandler.ts -B 2 -A 5

# Check audit call sites in JS handler (includes retry/error metadata)
grep "auditOrchestration" lib/mcp/server/tools/hub/workflow-tools-handler.js -B 2 -A 8

# Examine audit metadata structure (totalRetries, errorTypes added Mar 2026)
grep -A 10 "totalRetries\|errorTypes" lib/mcp/server/tools/hub/workflow-tools-handler.js
```

### 14. Database Model Discovery
```bash
# Find MCPWorkflow model
grep -A 40 "model MCPWorkflow " prisma/schema.prisma

# Check MCPWorkflowExecution model
grep -A 50 "model MCPWorkflowExecution" prisma/schema.prisma

# Find workflow status enum
grep -A 10 "enum MCPWorkflowStatus" prisma/schema.prisma

# Check execution status enum
grep -A 10 "enum MCPWorkflowExecutionStatus" prisma/schema.prisma

# Find execution mode enum
grep -A 5 "enum MCPExecutionMode" prisma/schema.prisma

# Check JSON field usage
grep "Json" prisma/schema.prisma | grep -i workflow
```

### 14. System Limits Discovery
```bash
# Find per-user execution limits
grep -rn "MAX_CONCURRENT_EXECUTIONS_PER_USER" lib/mcp/server/tools/hub/ lib/services/workflow/

# Check step count limits in schemas
grep -A 5 "\.max(20)\|\.min(1)\.max(20)" lib/services/workflow/types/orchestration-params.ts lib/workflows/schemas.ts

# Find timeout constraints (global max = 600000ms / 10 min as of Mar 2026)
grep -A 3 "timeout.*min\|timeout.*max\|600000\|60000" lib/services/workflow/types/orchestration-params.ts lib/workflows/schemas.ts

# Check parallel execution limits (maxConcurrent)
grep -rn "maxConcurrent\|MAX_CONCURRENT" lib/services/workflow/ lib/mcp/server/tools/hub/

# Find argument size limits
grep -A 5 "50000\|50KB\|argsStr.length" lib/services/workflow/types/orchestration-params.ts

# Check rate limits for workflow APIs
grep -A 5 "rateLimit:" app/api/workflows/

# Find MAX_CALL_DEPTH and other service limits
grep -n "MAX_CALL_DEPTH\|MAX_PARAM_SIZE\|MAX_RESPONSE" lib/mcp/server/config/service-call-policy.js

# Verify execution limit enforcement in MCP handler
grep -A 20 "runningCount.*MAX_CONCURRENT" lib/mcp/server/tools/hub/workflow-tools-handler.js

# Check limits documentation
grep -A 30 "System Limits Reference" .claude/knowledge/domain/mcp/mcp-hub-workflow-orchestration-reference.md | head -40
```

### 12. Integration Testing
```bash
# Test workflow list API
curl -s http://localhost:3000/api/workflows -H "Cookie: accessToken=JWT_TOKEN" | jq '.data.workflows | length'

# Test executions API
curl -s http://localhost:3000/api/workflows/executions -H "Cookie: accessToken=JWT_TOKEN" | jq '.data'

# Check workflow count
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT COUNT(*) FROM \"MCPWorkflow\";"

# Check execution count
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT COUNT(*) FROM \"MCPWorkflowExecution\";"

# Check execution status distribution
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT status, COUNT(*) FROM \"MCPWorkflowExecution\" GROUP BY status;"
```

### 13. Triple-Handler Architecture Verification
```bash
# Verify Admin GUI handlers (CRUD for named workflows)
ls -la lib/workflows/handlers.ts

# Verify TS execution handler
ls -la lib/services/workflow/handlers/mcpOrchestrationHandler.ts

# Verify JS MCP handler
ls -la lib/mcp/server/tools/hub/workflow-tools-handler.js

# Check shared engine location (correct path!)
ls -la lib/services/workflow/core/orchestration-engine.js

# Check shared engine import in TS handler
grep "orchestration-engine\|OrchestrationEngine" lib/services/workflow/handlers/mcpOrchestrationHandler.ts

# Check shared engine import in JS handler
grep "orchestration-engine\|OrchestrationEngine" lib/mcp/server/tools/hub/workflow-tools-handler.js

# Verify engine is pure JS (no TS)
file lib/services/workflow/core/orchestration-engine.js

# Check both execution handlers use same validation
grep "MCPOrchestrationParams" lib/services/workflow/handlers/mcpOrchestrationHandler.ts lib/mcp/server/tools/hub/workflow-tools-handler.js
```

## Key Files Reference

| Category | File | Purpose |
|----------|------|---------|
| **API Routes** | `app/api/workflows/route.ts` | List/Create workflows |
| | `app/api/workflows/[id]/route.ts` | Get/Update/Delete workflow |
| | `app/api/workflows/run/route.ts` | Run workflow |
| | `app/api/workflows/executions/route.ts` | List executions |
| **Admin GUI Handlers** | `lib/workflows/handlers.ts` | 6 handlers for Admin CRUD |
| **TS Execution Handler** | `lib/services/workflow/handlers/mcpOrchestrationHandler.ts` | TypeScript orchestration |
| **JS MCP Handler** | `lib/mcp/server/tools/hub/workflow-tools-handler.js` | MCP tool handler |
| **Workflow Engine** | `lib/services/workflow/workflowEngine.ts` | Core engine, executeWorkflow, WorkflowConfig |
| | `lib/services/workflow/index.ts` | Entry point, executeOrchestrationWorkflow |
| **Shared Engine** | `lib/services/workflow/core/orchestration-engine.js` | Pure JS core engine |
| **Types** | `lib/services/workflow/types/orchestration-context.ts` | `buildOrchestrationContext(userId, povId?)`, `azp` propagation (post-U2 2026-05-19: `token` field DROPPED, replaced by per-call mint at downstream consumers) |
| | `lib/services/workflow/types/orchestration-params.ts` | Orchestration Zod schemas |
| **Schemas** | `lib/workflows/schemas.ts` | Admin API Zod schemas |
| **Tracking** | `lib/services/workflow/tracking/orchestration-tracker.ts` | Execution tracking |
| **Cleanup** | `lib/mcp/server/security/compliance-monitor.js` | Cleanup scheduler |
| **Frontend** | `app/(authenticated)/workflows/page.tsx` | Server component |
| | `app/(authenticated)/workflows/WorkflowsPage.tsx` | Client component (incl. StepResultRow) |
| | `components/workflows/WorkflowTerminal.tsx` | CRUD interface |
| | `components/workflows/WorkflowEditor.tsx` | Step builder (incl. retry GUI) |
| | `components/workflows/RecommendationEngine.tsx` | Service discovery |
| **Shared Types** | `lib/workflows/types.ts` | Frontend ServiceCallResult, WorkflowExecution |
| **Database** | `prisma/schema.prisma` | MCPWorkflow, MCPWorkflowExecution |
| **Docs** | `.claude/knowledge/domain/mcp/MCP-WORKFLOW-SYSTEM.md` | System documentation |
| | `.claude/knowledge/domain/mcp/workflow-dual-handler-architecture.md` | Architecture guide |
| | `.claude/knowledge/domain/mcp/mcp-hub-workflow-orchestration-reference.md` | User reference |

## Patterns to Apply

| Pattern | Application | Reference |
|---------|-------------|-----------|
| **nativeEnum** | Use `z.nativeEnum(PrismaEnum)` to prevent drift | schemas.ts |
| **CUID validation** | Use `.cuid()` on ID filter params | schemas.ts |
| **JSON nesting** | Transform `steps.steps` before sending to frontend | handlers.ts |
| **Internal bypass** | Skip rate limiting for internal calls (no proxy headers) | api-handler.ts |
| **Cleanup scheduler** | Add cleanup for new record types — add the window to `retention-windows.js` `RETENTION_DAYS` + a pin in `test-compliance-monitor.ts` (never a bare numeric default) | compliance-monitor.js |
| **Admin-only CRUD** | Use `createHandler` with `allowedRoles`, not `withPOVAccess` | handlers.ts |
| **Execution limits** | Enforce per-user concurrent execution limits | workflow-tools-handler.js |
| **Prompt injection** | Use `detectPromptInjection()` on user-supplied strings | orchestration-params.ts |
| **Error type classification** | All error paths set `errorType` + `retryable` | workflow-tools-handler.js, orchestration-engine.js |
| **Retry opt-in** | `retryable === true` (strict), not `=== false` | orchestration-engine.js |
| **Crash recovery** | Startup cleanup of stale RUNNING executions | workflow-tools-handler.js |
| **Atomic JSON update** | A plain `$transaction()` does NOT prevent lost-update (no row lock at READ COMMITTED). Use atomic SQL (`jsonb \|\|` / `jsonb_set`) or `FOR UPDATE` / RepeatableRead. See BC19 / transaction-atomicity-pattern.md | orchestration-tracker.ts recordStep (fixed 2026-06-08) |

## Time Bomb Prevention Checklist

When adding new workflow features:

- [ ] Does it create new database records? → Add cleanup scheduler
- [ ] Does it use Prisma enums? → Use z.nativeEnum() in Zod
- [ ] Does it filter by ID? → Add .cuid() validation
- [ ] Does it store JSON? → Document nested structure, add transformation
- [ ] Is it called internally? → Consider rate limit bypass
- [ ] Is it admin-only? → Use createHandler with allowedRoles
- [ ] Does it accept user input? → Add prompt injection detection
- [ ] Could it cause resource exhaustion? → Enforce execution limits
- [ ] Does it have error return paths? → Set `errorType` + `retryable` fields
- [ ] Does it do read-modify-write on a JSON column? → atomic `jsonb \|\|`/`jsonb_set` OR `FOR UPDATE`/RepeatableRead (a plain `$transaction()` does NOT prevent lost-update — BC19)

## Related Documentation

- **MCP Hub Discovery**: `/.claude/knowledge/discoveries/mcp-hub-discovery.md`
- **MCP Workflow System**: `/.claude/knowledge/domain/mcp/MCP-WORKFLOW-SYSTEM.md`
- **Time Bomb Pattern**: `/.claude/knowledge/patterns/time-bomb-detection-pattern.md`
- **API Handler Pattern**: `lib/api-handler.ts` (createHandler)
- **Bloomberg Styles**: `lib/constants/bloomberg-styles.ts` (BLOOMBERG_TABLE)
