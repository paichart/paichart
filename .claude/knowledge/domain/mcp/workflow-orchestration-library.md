# workflow-orchestration-specialist — Domain Library

> **Created 2026-06-11** (Protocol 12 soft-band trim). Depth evicted from the agent file; verbatim;
> the paired discovery's proven greps outrank this file.

## [evicted] Visual Protocol

When activated, provide clear visual feedback:

### On Activation
```
╔═══════════════════════════════════════╗
║ ⚡ WORKFLOW ORCHESTRATION START       ║
╚═══════════════════════════════════════╝
Domain: MCP Hub Workflow System
Focus: [specific area - execution/definition/debugging]
```

### On Completion
```
╔═══════════════════════════════════════╗
║ ⚡ WORKFLOW ORCHESTRATION COMPLETE    ║
╚═══════════════════════════════════════╝
```


## [evicted] Trust Level Integration in Workflows (Jan 30, 2026, updated post-U2 2026-05-19)

**Security Control**: Workflows use trust level system to control token exposure to external services.

**Implementation**: `lib/mcp/server/tools/hub/workflow-tools-handler.js:558+` (post-Phase-C, mint-before-trust pattern)

> **⚠️ POST-U2 UPDATE**: Pre-U2 the trust gate filtered an inbound Bearer token (userToken from extractAuthContext). Post-U2 (Phase C, 2026-05-19), the trust gate determines permission FIRST, then mints a per-call token ONLY when trust grants — preventing wasted RSA-sign work on denials AND tightening audience to the specific destination service.

**Pre-U2 (historical, deprecated)**:
```typescript
// Pre-U2: Bearer-forward — trust gate filtered userToken
const trustLevel = await determineTrustLevel({ serviceId, serviceRecord, userId, povId, prisma });
const serviceContext = buildServiceContext(trustLevel, {
  userId, userEmail, userRole,
  token: userToken,  // ← inbound Bearer, only if trustLevel allows
  povId, tenantId, requestId, source
});
```

**Post-U2 (current, mint-before-trust per Phase C)**:
```typescript
// Trust permission FIRST
const trustLevel = await determineTrustLevel({ serviceId, serviceRecord, userId, povId, prisma });
const hasToken = trustLevelReceivesToken(trustLevel);

// Per-call mint ONLY if trust grants (RFC 8707 blast-radius isolation via per-service audience)
let perCallToken;
if (hasToken) {
  perCallToken = await mintMcpToken({
    userId, email: userEmail, role: userRole,
    scope: 'mcp:execute',
    audience: audienceForService(serviceRecord),  // ← per-service URI, NOT generic
    azp: context?.user?.azp,                       // ← Option α: client-binding for forensic chain
    ttlSeconds: 900,
    purpose: 'per-call-forward',
  });
}

// Pass FRESHLY-MINTED token (not inbound Bearer) to buildServiceContext.
// trust-level.js spread guard {...(token ? {token} : {})} prevents `token: undefined` (Phase F.4).
const serviceContext = buildServiceContext(trustLevel, {
  userId, userEmail, userRole,
  token: perCallToken,  // ← per-call mint with per-service audience, OR undefined for trust denials
  povId, tenantId, requestId, source
});
```

**Same pattern at `lib/services/workflow/integrations/service-caller.ts:300+`** (web-API workflow path, Phase D site #7).

**Trust Levels** (who gets tokens in workflows):
- ✅ INTERNAL (paichart-* services) - Full token
- ✅ TRUSTED (localhost Docker) - Full token
- ✅ OWNER (caller owns service) - Full token
- ✅ TEAM_MEMBER (owner is POV team member) - Full token
- ❌ SCOPED (public + POV context) - No token
- ❌ ANONYMOUS (public, no POV) - No token

**Token Delegation Policy**:
- Services in workflows receive tokens based on trust
- Services MUST NOT forward tokens to other services
- Audit logging tracks all token usage
- See: `hub-authentication-context-passing.md` (Token Passing Policy section)

**Note**: `services(action: 'call')` intentionally does NOT forward tokens. This is a security decision, not a gap:
- Direct calls have no POV context → no authorization scope for trust level
- Any authenticated user could send their JWT to any public service
- Workflow execution requires explicit `povId` + OWNER/TEAM_MEMBER trust
- See: `TODO-services-call-token-forwarding.md` for full analysis if this is ever reconsidered

**Strict OAuth Enforcement** (REQUIRE_OAUTH, Mar 2026):
- External OAuth services (e.g., Snowflake) can set `REQUIRE_OAUTH=true` in their `.env`
- When enabled, queries without a valid per-user OAuth token are **rejected**, not silently downgraded to service account
- Prevents unauthenticated queries from bypassing audit trails and row-level security
- Health checks bypass this (use service account directly)
- See: `docker-mcp-service-gold-standard-v2.md` → "Strict OAuth Enforcement"

**Files** (post-U2 2026-05-19):
- Trust module: `lib/services/workflow/security/trust-level.js` — `determineTrustLevel`, `trustLevelReceivesToken`, `buildServiceContext` (spread guard at :200 per Phase F.4), `logTrustDenial`
- Workflow handler: `lib/mcp/server/tools/hub/workflow-tools-handler.js` — mint-before-trust at `createServiceCaller` (Phase C)
- Service caller (TS twin for web-API path): `lib/services/workflow/integrations/service-caller.ts` — same mint-before-trust + per-service audience (Phase D site #7)
- Audience helper: `lib/mcp/server/tools/hub/audience-policy.js` — `audienceForService(service)`, NFKD normalize, collision detection at service registration
- Canonical mint: `lib/auth/token-manager.ts:mintMcpToken` (consolidated Phase A; rate-limited 100/min/user; required `audience` field with NO implicit default)
- Orchestration context (TS type): `lib/services/workflow/types/orchestration-context.ts` — `OrchestrationContext.user.token` DROPPED post-Phase-D site #17; `azp?: string` ADDED
- Workflow config (TS type): `lib/services/workflow/workflowEngine.ts` — `WorkflowConfig.token` DROPPED post-Phase-D site #16
- Web-API entry chain (Bearer-extract removed): `lib/workflows/handlers.ts:355,367` (sites #12/#13), `lib/services/workflow/index.ts:181` (site #14), `lib/services/workflow/handlers/mcpOrchestrationHandler.ts:90` (site #15)


## [evicted] SSRF Protection & Trust Level — Decoupled Architecture (Mar 2026)

**Two separate concerns, two separate lists** (decoupled Mar 15, 2026, 5-specialist review 91.2/100):

### SSRF Bypass (network-layer): "Can we reach this endpoint?"
- **File**: `lib/mcp/server/config/service-call-policy.js`
- **Function**: `isSSRFExemptService(serviceOrName)`
- **List**: `SSRF_EXEMPT_SERVICES` — all localhost Docker services
- **Services**: browser-automation, notification, weather, eia, eodhd, token-validator, snowflake (7 total)
- **Applied in**: service-call-handler, workflow-tools-handler, service-update-handler, hub-utilities (4 code paths)

### Trust Level (application-layer): "Should we forward the JWT token?"
- **File**: `lib/mcp/server/config/service-approval-policy.js`
- **Function**: `isTrustedInternalService(serviceOrName)`
- **List**: `TRUSTED_INTERNAL_SERVICES` — services that get automatic TRUSTED trust level
- **Services**: browser-automation, notification, weather, eia, eodhd, token-validator (6 total, NO snowflake)
- **Applied in**: `trust-level.js` → `determineTrustLevel()`

### Why Decoupled
A service can be SSRF-exempt (runs on localhost Docker) without deserving automatic JWT token forwarding. The Snowflake service uses External OAuth — it passes the caller's JWT to Snowflake for per-user authentication. It needs SSRF bypass (localhost:3106) but should only receive tokens through OWNER/TEAM_MEMBER trust (via `povId`), not automatic TRUSTED trust.

### Adding a New Docker Service
1. **Always**: Add to `SSRF_EXEMPT_SERVICES` in `service-call-policy.js` (SSRF bypass)
2. **If TRUSTED (standard internal)**: Also add to `TRUSTED_INTERNAL_SERVICES` in `service-approval-policy.js`
3. **If External OAuth**: Do NOT add to `service-approval-policy.js` — token forwarding via OWNER/TEAM_MEMBER trust only


## [evicted] Production Named Workflows (Feb 2026 - Validated)

**4 educational workflows in mcp_workflows table**:
- trust-level-basic-demo (sequential, 1 step, 50-60ms) - Learn trust levels
- jwks-validation-advanced-demo (parallel, 3 steps, 73ms) - Multi-language code examples
- token-troubleshooting-demo (sequential, 2 steps, 59ms) - Debug trust issues
- pov-workflow-showcase (parallel, 2 steps, 587ms) - Data gathering demo

**Database queries**:
```sql
-- List named workflows
SELECT name, category, status,
       jsonb_array_length(steps->'steps') as step_count,
       steps->'executionMode' as mode
FROM mcp_workflows ORDER BY "createdAt" DESC;

-- Verify workflow structure
SELECT name, jsonb_pretty(steps) FROM mcp_workflows WHERE name = 'trust-level-basic-demo';
```

**Variable Chaining — BUG-004 FIX (Mar 2026)**:
All three prefix forms now resolve correctly:
- `{{step.0.output.data[0].id}}` — compound prefix `output.data` stripped ✅
- `{{step.0.output.items[0].id}}` — `output` prefix stripped ✅
- `{{step.0.data[0].id}}` — `data` prefix stripped ✅

```javascript
// WRONG (fails with internal services):
{{step.0.output.povs[0].id}}

// RIGHT (internal services return {data: [...], total: N}):
{{step.0.output.data[0].id}}
```

**Performance validated**: Parallel execution 2-3x faster than sequential for independent steps.


## [evicted] 2026-05-16/17 MCP Hub Hardening — Patterns Acquired

Two-day session shipped Phase 1 (GS14) + Phase 2 (4 chunks) + Phase 3 C1 + Phase 4 + 5 engine invariants + boy-scout cleanup. Six patterns to anchor for future workflow work:

**1. Engine consumes only 5 fields, NOT handler-meta** (Phase 4 commission, May 16):
`MCPOrchestrationEngine.execute(params)` reads ONLY `steps`, `executionMode`, `failureStrategy`, `timeout`, `maxTotalRetries`. **Handler-meta** (`workflowName`, `povId`, `taskId`) is resolved BEFORE the engine sees params — `workflowName` → DB lookup → `steps` populated; `povId` controls trust-level/auth OUTSIDE the engine. This separation is structural — collapsing handler-meta into the engine schema (option A from the Phase 4 plan) would inappropriately grow the engine's responsibility. Document at `lib/services/workflow/types/orchestration-params.ts`.

**2. Shared constants + contract test (NOT schema collapse)** (Phase 4 Option C, May 17):
The L1 dispatch schema + L3 handler schema + engine schema all redeclared the same numeric bounds (timeout 1000-600000, maxTotalRetries 0-20, executionMode enum, etc.). Linked only by a prose "KEEP IN SYNC" comment. **Fix**: 7 named constants exported from `orchestration-params.ts` (`EXECUTION_MODES`, `WORKFLOW_TIMEOUT_BOUNDS`, `WORKFLOW_RETRY_BUDGET_BOUNDS`, etc.); L1 + L3 inline copies + contract test `scripts/test-workflow-schema-alignment.ts` (19 assertions, run via `npm run validate:workflow-schema-alignment`). Structural drift detection replaces comment-as-contract. Per [[feedback_phantom_canonical_audit]].

**3. 6 engine-only invariants NOT expressible in Zod** (Phase 4, May 16):
`engine.validate()` enforces what schemas can't:
- Variable chaining `{{step.N.output.field}}` — missing step is LOUD (`__variableError` marker → checkForVariableErrors → fails step); missing field is silent undefined (graceful for partial outputs). Investigation closed 2026-05-17.
- dependsOn DAG — forward-only by index, range check, circular detection
- Conditional mode 1-3 steps contract (added Phase 4) — schema allows 1-20; engine enforces 1-3 for `executionMode: conditional`
- Retry budget interaction (added Phase 4) — `sum(step.retries) <= maxTotalRetries`
- Internal service routing — `paichart-*` services bypass trust-level gate (lives in `service-call-policy.js` SSRF_EXEMPT_SERVICES; engine docstring references)
- Step output shapes — `{success, data, ...}` convention NOT enforced (per Phase 4 architectural decision — customer services define their own MCP envelope; codifying per-service contracts in hub Zod would scale N-schemas-for-N-customer-services badly)

Full docstring at `orchestration-engine.js validate()` documents all 6.

**4. Runtime drift logger** (Phase 4, May 17):
When `engine.validate()` rejects a payload `safeParse` already accepted, that's a schema-vs-engine contract gap (Zod let something through that engine semantically refuses). Log `securityEvent: true` + `component: 'workflow-handler'` + `engineErrors` array. SOC can alert on this combination. Lives at `workflow-tools-handler.js:~847`.

**5. WorkflowListHandlerInputSchema for sibling actions** (Phase 2 W1, May 16):
The original `WorkflowHandlerInputSchema` only covered `workflow.execute`. `workflow.list` initially read raw `povId` from args — same BC76 pattern fixed in pov.update. **Fix**: per-action L3 handler-boundary schemas where the L1 cross-action union is permissive. Today: 3 sites use action-discriminator (workflow execute / service-update / service-registration via L1 transform). Adding a 4th L3 schema follows the same pattern.

**6. assertEndpointSafe shared helper for cross-trust gates** (sec-ops Finding B, May 16):
6 hub call sites previously wrapped `validateUrlSafety` inline with different shapes. Asymmetric defenses across handlers caused the register-vs-update SSRF gap. **Pattern**: lift runtime gates to a shared helper at `hub-utilities.js:assertEndpointSafe(endpoint, { existingService, action })` — exempt-by-existingService + uniform error. When adding a new path that fetches user-controlled URLs, import the helper, don't reimplement inline.

**7. Error aggregation invariant + dual-path persistence** (BUG-HUB-001, May 22):
`engine.execute()` post-fix invariant: when `success === false`, `error` is ALWAYS a non-empty string — synthesized from first failed step's `result.results[i]` if the inner executor didn't propagate one. Handles `failureStrategy: 'continue'` AND `executionMode: 'conditional'` cases where inner executors return `{ results }` or `{ results, branch }` with no outer error. Uses `failedStep.stepIndex` (workflow-definition index) not array position — required for conditional ELSE-branch correctness.

**TWO persistence paths** to `MCPWorkflowExecution.error` — both must accept the aggregated error:
- **Path 1**: hub → `workflow-tools-handler.js:1060` direct `prisma.mCPWorkflowExecution.update({ error: result.error || null })` — relies on the engine invariant
- **Path 2**: TS handler → `mcpOrchestrationHandler.ts:227` → `orchestrationTracker.complete(executionId, results, success, result.error)` → tracker's `error: success ? null : (errorMessage || fallback)` defensive write

Error format: `"<step error msg> (step ${stepIdx}: ${service}.${tool})"` — leading position MUST be the error message (`lib/mcp/server/utils/execution-analytics.js:984` `categorizeError()` does substring matching on the leading text; service names in leading position would shift categories).

**Surface**: errors visible via `services(action: 'workflow.list')` (must include both `error` AND `failedStep` in the select) + `services(action: 'workflow.status')` + Activity audit log metadata.

**Sibling pre-existing bug surfaced (not yet fixed)**: `resilient-call.js:31` throws `'TIMEOUT: Workflow execution exceeded Nms limit'` but `workflow-tools-handler.js:1132` checks `error.message === 'Workflow timeout'` — TIMEOUT status branch never fires; rows always go FAILED. File a separate bug if encountered.

**Adjacent UX fixes shipped same day** (BUG-HUB-002, BUG-HUB-003, May 22 in `service-discovery-handler.js`):
- Empty-category discover now surfaces ACTUAL populated categories via `$queryRaw` JSONB aggregation (Prisma groupBy doesn't natively support JSONB paths)
- Internal services (`configuration.type === 'internal'` OR `endpoint.startsWith('internal://')`) decorated with `_metricsApplicable: false` + `_metricsHint` so consumers distinguish "metrics not applicable" from "measurement bug"


## [evicted] Core Expertise

### 1. Workflow Definition & Structure

**Workflow Schema**:
```typescript
{
  name: string,           // Workflow identifier
  description?: string,   // Human-readable description
  executionMode: 'sequential' | 'parallel' | 'conditional',
  failureStrategy: 'stop' | 'continue' | 'rollback',
  steps: WorkflowStep[]   // Array of execution steps
}
```

**Step Structure**:
```typescript
{
  name: string,           // Step identifier for variable references
  toolName: string,       // MCP tool to invoke (e.g., "get_pov_summary")
  arguments: object,      // Tool arguments (supports variable chaining)
  dependsOn?: string[],   // Parallel mode: run after these steps (conditional mode is positional — it ignores dependsOn)
  condition?: string,     // Optional execution condition
  retries?: number,       // Retry attempts on retryable errors (0-5, default 0)
  retryDelay?: number     // Base retry delay in ms (1000-30000, default 2000)
}
```

### 2. Execution Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `sequential` | Steps run in order, each waits for previous | Data pipelines, dependent operations |
| `parallel` | Independent steps run in batches (max 5), dependent steps run after | Independent data gathering, fan-out/fan-in |
| `conditional` | Step 0 = condition, Step 1 = then, Step 2 = else (max 3 steps) | Gate checks, conditional notifications |

**Conditional Mode** (if/then/else):
- Step 0 always executes — it's the **condition check**
- If step 0 **succeeds with data** → Step 1 ("then") runs, Step 2 skipped
- If step 0 **fails or returns no data** → Step 1 skipped, Step 2 ("else") runs
- Condition logic: `conditionPassed = step0.success && step0.data` (truthy check)
- Step 1 can reference step 0 outputs via variable chaining; Step 2 cannot

```json
{
  "executionMode": "conditional",
  "steps": [
    { "service": "paichart-project-service", "tool": "project", "arguments": { "action": "pov.list", "status": "STALLED" } },
    { "service": "notification-service", "tool": "send", "arguments": { "message": "Stalled POVs detected" } },
    { "service": "notification-service", "tool": "send", "arguments": { "message": "All POVs on track" } }
  ]
}
```

### 3. Variable Chaining

**Syntax**: `{{step.N.output.field}}` or `{{step.name.output.field}}`

**How It Works**:
- Reference previous step outputs in subsequent step arguments
- Supports nested field access: `{{step.0.output.data.items[0].id}}`
- Engine resolves variables before each step execution

**Example**:
```json
{
  "steps": [
    {
      "name": "get_tasks",
      "toolName": "get_pov_tasks",
      "arguments": { "povId": "cm123..." }
    },
    {
      "name": "summarize",
      "toolName": "create_summary",
      "arguments": {
        "taskCount": "{{step.get_tasks.output.total}}",
        "blockedTasks": "{{step.get_tasks.output.blocked}}"
      }
    }
  ]
}
```

### Variable Resolution Fix (BUG-004 — Mar 2026)

**Bug**: `{{step.0.output.data.location}}` resolved to `undefined` because the old regex `/^(output|data)\.?/` only stripped `output.`, leaving `data.location`. Since `stepResult.data` already unwraps the payload, `navigatePath` tried `data.location` inside the payload — double-indexing.

**Fix**: Regex changed to `/^(output\.data|output|data)(?:\.|$)/` at both sites (lines 167, 183 of `orchestration-engine.js`). The `(?:\.|$)` boundary prevents false-stripping on field names like `dataField`.

**Debug logging**: `resolveVariableString` now logs `[Variable Resolution] path=... → normalized=... dataKeys=...` at debug level.

**Tests**: `npm run test:variable-resolution` — 14 tests (4 pattern + 10 behavior), dual-layer architecture.

### 4. Per-Step Retries (Mar 2026)

**Retry System**: `executeWithRetry()` in `orchestration-engine.js`

**How it works**:
- Steps opt-in to retries via `retries` field (0-5, default 0 = no retries)
- Only errors with `retryable === true` are retried (strict opt-in, CRIT-3)
- Exponential backoff: `retryDelay * 2^(attempt-1)` (e.g., 2s, 4s, 8s, 16s)
- Global retry budget: `maxTotalRetries` (default 10, max 20) prevents retry storms
- Global deadline check: Skips retry if insufficient time for delay + estimated execution

**Retryable errors**: `timeout`, `network` (ECONNREFUSED, ECONNRESET, ENOTFOUND, EAI_AGAIN)
**Not retryable**: `rate_limited` (would amplify the problem), `service_rejected`, `policy_blocked`, `validation`, `not_found`, `variable_error`

**Step result fields**:
- `errorType`: Classification string (9 types)
- `retryable`: Whether the error was retryable
- `attempts`: Total attempts made (1 = no retries, 2+ = retried)

**Example with retries**:
```json
{
  "steps": [
    {
      "service": "external-api-service",
      "tool": "fetch_data",
      "arguments": { "query": "test" },
      "retries": 3,
      "retryDelay": 2000,
      "timeout": 10000
    }
  ],
  "maxTotalRetries": 10
}
```

### 5. Failure Strategies

| Strategy | Behavior |
|----------|----------|
| `stop` | Halt execution on first failure (default) |
| `continue` | Log failure, continue with remaining steps |
| `rollback` | Halt on first failure, same as stop (automatic undo is planned but not yet implemented — see prerequisites below) |

**Rollback Prerequisites** (must be addressed before implementing undo):
1. Accurate failure detection (fixed Mar 2026: isError, failure strategy enforcement)
2. Action identity in step results (what was done, not just response data)
3. Compensating action registry (services declare undo operations)
4. Structured error context (total vs partial failure)
5. Idempotency guarantees (safe to retry failed undo operations)

### 6. Structured Error Types (Mar 2026)

**9 error type classifications** (`WorkflowErrorTypeSchema` in `orchestration-params.ts`):

| Error Type | Retryable | Source |
|------------|-----------|--------|
| `timeout` | Yes | Step/workflow timeout exceeded |
| `network` | Yes | ECONNREFUSED, ECONNRESET, ENOTFOUND, EAI_AGAIN |
| `service_error` | No | Service returned 5xx or unexpected error |
| `service_rejected` | No | Service returned `isError: true` |
| `validation` | No | Input validation failure |
| `not_found` | No | Service or tool not found |
| `policy_blocked` | No | Security policy, SSRF, access denied |
| `rate_limited` | No | Rate limit exceeded (HIGH-7: retrying amplifies) |
| `variable_error` | No | Variable resolution failure |

**Applied to all 13 error return paths**: 10 in `createServiceCaller()` (workflow-tools-handler.js) + 3 variable error paths in orchestration-engine.js.

### 7. Crash Recovery (Mar 2026)

**`recoverStaleExecutions()`** in `workflow-tools-handler.js`:
- Called fire-and-forget on server startup from `HubToolsHandler` constructor
- Marks RUNNING executions older than 15 minutes as FAILED
- 15-min threshold = 5-min safety margin over 10-min global timeout (CRIT-6)
- Uses `updateMany` for atomic single-SQL operation
- Leaves `duration` and `failedStep` as null (unknown for recovered executions)

### 8. Dual-Handler Architecture

**Architecture Diagram**:
```
┌─────────────────────────────────────────────────────────────┐
│  Admin GUI (Next.js)                                         │
│  /app/api/workflows/* → lib/workflows/handlers.ts           │
└──────────────────────────┬──────────────────────────────────┘
                           │ Uses
┌──────────────────────────▼──────────────────────────────────┐
│  OrchestrationEngine (Pure JavaScript)                       │
│  lib/services/workflow/core/orchestration-engine.js         │
│  - executeWorkflow(), getWorkflowStatus(), cancelWorkflow() │
│  - Variable resolution, dependency graph, step execution    │
└──────────────────────────┬──────────────────────────────────┘
                           │ Uses
┌──────────────────────────▼──────────────────────────────────┐
│  MCP Tools (JavaScript)                                      │
│  lib/mcp/server/tools/hub/workflow-tools-handler.js         │
│  - services(workflow.execute, workflow.status, workflow.cancel) │
│  - services(workflow.list)                                     │
└─────────────────────────────────────────────────────────────┘
```

**Why Dual Handlers?**:
- TypeScript handlers for Admin GUI with Zod validation
- JavaScript handlers for MCP tools (pure JS required for MCP server)
- Shared engine ensures identical behavior across both interfaces

**Feature Parity**: 100% - Both interfaces use same OrchestrationEngine

### 9. MCP Workflow Tools

| Tool | Purpose |
|------|---------|
| `services(action: 'workflow.execute')` | Start workflow execution |
| `services(action: 'workflow.status')` | Check execution status |
| `services(action: 'workflow.cancel')` | Cancel running workflow |
| `services(action: 'workflow.list')` | Query execution history |

### 10. Internal Services

**InternalServiceRouter** handles calls to pAIchart's own services:

| Service | Tools | Examples |
|---------|-------|----------|
| `paichart-project-service` | `project`, `perform` | pov.list, pov.details, task.list, task.update |
| `paichart-kpi-service` | `kpi` | score, history, evaluate |
| `paichart-recommendation-engine` | `recommendation` | list (POV/task-scoped) |

**Note (2026-05-23)**: Legacy names `paichart-pov-service` and `paichart-task-service` were DROPPED from `InternalServiceRouter.serviceToolMap` (commit 792dbc01). They were never present in the MCPTool DB → unreachable via `services.call` (resolver 404s before routing). Dead code at the routing layer. `scripts/register-internal-services.ts` actively deletes them via `LEGACY_SERVICE_IDS`.

**Routing** (via `InternalServiceRouter.routeCall(serviceId, tool, args, context)`):
```javascript
// service-call-handler.js L140 — internal services skip checkServiceAccess
// (downstream auth via REST middleware). INTERNAL_SERVICE_ACCESS audit
// event emitted at every internal call (792dbc01).
```

### Workflow execution persistence — write-time sanitize (A5, commit aa9e4d68)

`mcp_workflow_executions.input` and `mcp_workflow_executions.steps` JSONB columns persist user-controlled `step.service` / `step.tool` / `step.arguments` fields. Without write-time escape, an adversary submitting `service: "<script>alert(1)</script>"` lands the raw payload in DB — any future admin UI rendering workflow-execution history without output sanitize executes it.

**Verified live as a finding 2026-05-23** before the fix. Three write sites all now wrapped:
- L1014 initial `mCPWorkflowExecution.create` — wraps `validatedParams` via `sanitizeMetadataForAudit`
- L1066 incremental `onStepComplete` — wraps `result` per step
- L1090 final `mCPWorkflowExecution.update` — wraps `result.results` + sanitizes `result.error`

**When reviewing changes to `workflow-tools-handler.js`**: any new `prisma.activity.create` or `mCPWorkflowExecution.*` write that takes user-supplied fields MUST go through `sanitizeMetadataForAudit` from `lib/mcp/server/tools/response-sanitizer.js`. Same wrap also applied to `auditOrchestration` (L289) + `auditSecurityEvent` (L315) where `...details` spread carries user-controlled `workflowName` / `services[]`.

### 11. Key Files Reference

| Category | File | Purpose |
|----------|------|---------|
| **API Routes** | `app/api/workflows/route.ts` | List/Create workflows |
| | `app/api/workflows/[id]/route.ts` | Get/Update/Delete workflow |
| | `app/api/workflows/run/route.ts` | Execute workflow (by name/id — the old [id]/execute path never shipped) |
| | `app/api/workflows/executions/route.ts` | Execution history |
| **Handlers** | `lib/workflows/handlers.ts` | 6 TypeScript handlers |
| **Schemas** | `lib/workflows/schemas.ts` | Zod validation schemas |
| **MCP Tools** | `lib/mcp/server/tools/hub/workflow-tools-handler.js` | MCP interface |
| **Engine** | `lib/services/workflow/core/orchestration-engine.js` | Core execution logic |
| **Context** | `lib/services/workflow/types/orchestration-context.ts` | Build execution context |
| **Cleanup** | `lib/mcp/server/security/compliance-monitor.js` | 90-day retention |
| **Frontend** | `app/(authenticated)/workflows/WorkflowsPage.tsx` | Admin GUI |
| | `components/workflows/WorkflowTerminal.tsx` | Execution terminal |


## [evicted] Sample Workflows

**Reference**: `/.claude/knowledge/domain/mcp/sample-workflows.md`

### POV Status Report (Sequential)
```json
{
  "name": "pov_status_report",
  "executionMode": "sequential",
  "failureStrategy": "stop",
  "steps": [
    { "name": "summary", "toolName": "get_pov_summary", "arguments": { "povId": "{{input.povId}}" } },
    { "name": "tasks", "toolName": "get_pov_tasks", "arguments": { "povId": "{{input.povId}}" } },
    { "name": "report", "toolName": "generate_report", "arguments": {
      "title": "{{step.summary.output.title}}",
      "taskCount": "{{step.tasks.output.total}}"
    }}
  ]
}
```

### Competitor Price Monitor (Parallel)
```json
{
  "name": "competitor_price_monitor",
  "executionMode": "parallel",
  "failureStrategy": "continue",
  "steps": [
    { "name": "amazon", "toolName": "fetch_price", "arguments": { "source": "amazon", "productId": "{{input.productId}}" } },
    { "name": "ebay", "toolName": "fetch_price", "arguments": { "source": "ebay", "productId": "{{input.productId}}" } },
    { "name": "walmart", "toolName": "fetch_price", "arguments": { "source": "walmart", "productId": "{{input.productId}}" } }
  ]
}
```


## [evicted] Learning Notes

### Recommendation-KPI Pipeline (Mar 2026)

The recommendation engine now includes KPI evaluation as part of its orchestration:

```
GET /api/mcp/recommendations?povId=X
  Phase A: gatherContextualData()     → 9 parallel queries
  Phase B: generator sub-queries      → 2 parallel queries (workload, analytics)
  Phase B.5: evaluateKPIsForPOV()     → 1 query (load POV KPIs) + pure logic
  Phase C: 5 generators               → pure logic (stale, unassigned, deadlines, progress, KPI alerts)
  Phase C.5: persist KPI scores       → fire-and-forget
  Phase D: persist recommendations    → $transaction with dedup
```

Key orchestration decisions:
- **Continue-on-error** (WO-8): Independent actions don't block each other during execution
- **Generator 5 dedup**: KPI alerts skip `stale-task-ratio` (already covered by stale tasks generator)
- **KPI scores included in response**: Frontend reads from same API call (no separate auth-failing fetch)
- **Internal services**: `paichart-recommendation-engine` (FK target), `paichart-kpi-service` (routable via InternalServiceRouter)

See `/.claude/knowledge/domain/mcp/TODO-autonomous-management-agent.md` for the full roadmap.

### Critical Patterns (Jan 2026)

1. **nativeEnum for Prisma**: Use `z.nativeEnum(PrismaEnum)` to prevent Zod/Prisma enum drift
2. **CUID Validation**: Add `.cuid()` on ID filter parameters for security
3. **JSON Nesting**: Steps stored as `{steps: [...]}` - extract before frontend display
4. **Internal Bypass**: Skip rate limiting for internal calls (no proxy headers, 127.0.0.1)
5. **Cleanup Scheduler**: New record types need cleanup added to compliance-monitor.js
6. **Admin-Only Routes**: Use `createHandler` with `allowedRoles`, not `withPOVAccess`

### Debugging Tips

1. **Workflow Not Executing**: Check OrchestrationEngine logs, verify tool exists
2. **Variable Not Resolving**: Confirm step name matches, check output structure
3. **Execution Stuck**: Look for unresolved dependencies in conditional mode; check `recoverStaleExecutions()` logs on startup
4. **Handler Mismatch**: Verify both TS and JS handlers updated for new features
5. **Retry Not Triggering**: Verify step has `retries > 0` AND error has `retryable === true` (strict opt-in)
6. **Error Type Missing**: Check all 13 error paths in `createServiceCaller()` — each should set `errorType` + `retryable`
7. **Stale RUNNING Records**: Check if `recoverStaleExecutions()` ran on startup (pino log: "Recovered stale workflow executions")
8. **Variable Double-Indexing (BUG-004)**: If `output.data.X` returns undefined, check the prefix normalization regex in `orchestration-engine.js` lines 167/183. The compound prefix `output.data` must be stripped as a unit before `.X`, not just `output.` leaving `data.X`.

### Retention Policy (compliance-monitor.js)

| Table | Purpose | Retention |
|-------|---------|-----------|
| `MCPWorkflowExecution` | Workflow execution history | 90 days |
| `Activity` | User/system activity + security events | 180 days |
| `TaskActivity` | Task-specific activity log | 90 days |
| `MCPInteraction` | MCP tool call logs | 30 days |
| `AgentArtifact` | Agent execution outputs | 30 days |
| `Notification` | User notifications (read only) | 7 days |
| `RefreshToken` | Auth tokens | Expired removed |

Cleanup runs on startup + every 24 hours

### System Limits Reference (Mar 2026)

**Workflow Execution Limits**:
| Limit | Value | Enforcement Location |
|-------|-------|---------------------|
| `MAX_CONCURRENT_EXECUTIONS_PER_USER` | 10 | `workflow-tools-handler.js` |
| `MAX_STEPS_PER_WORKFLOW` | 20 | Zod schema (orchestration-params.ts) |
| `MAX_WORKFLOW_TIMEOUT` | 600,000ms (10 min) | Zod schema |
| `MIN_WORKFLOW_TIMEOUT` | 1,000ms (1 sec) | Zod schema |
| `MAX_STEP_TIMEOUT` | 60,000ms (60 sec) | Zod schema |

**Retry Limits**:
| Limit | Value | Enforcement Location |
|-------|-------|---------------------|
| `MAX_STEP_RETRIES` | 5 | Zod schema (orchestration-params.ts) |
| `MAX_TOTAL_RETRIES` | 20 | Zod schema (default 10) |
| `MIN_RETRY_DELAY` | 1,000ms (1 sec) | Zod schema |
| `MAX_RETRY_DELAY` | 30,000ms (30 sec) | Zod schema |
| `STALE_EXECUTION_AGE` | 900,000ms (15 min) | `recoverStaleExecutions()` |

**Parallel Execution Limits (Internal)**:
| Limit | Value | Purpose |
|-------|-------|---------|
| `maxConcurrent` | 5 | Parallel step execution (orchestration-engine.js) |
| `MAX_CALL_DEPTH` | 3 | Prevents infinite service chains |
| `MAX_PARAM_SIZE` | 100KB | Per-step argument limit |

**Rate Limits (API)**:
| Endpoint | Limit | Scope |
|----------|-------|-------|
| `/api/workflows/*` | 100 req/60s | Per-user |

**Reference**: `/.claude/knowledge/domain/mcp/mcp-hub-workflow-orchestration-reference.md` (System Limits Reference section)


