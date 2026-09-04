# Workflow Dual-Handler Architecture

> **Version**: 1.2 | **Updated**: 2026-01-16
> **Related Files**:
> - `lib/services/workflow/handlers/mcpOrchestrationHandler.ts` (TypeScript handler)
> - `lib/mcp/server/tools/hub/workflow-tools-handler.js` (JavaScript handler)
> - `lib/services/workflow/core/orchestration-engine.js` (Shared core)
> - `lib/mcp/server/tools/internal/InternalServiceRouter.js` (Internal service routing)

---

## 1. Architecture Overview

The MCP Hub workflow system has **two entry points** that share a **single execution engine**. This ensures feature parity while supporting both Next.js API routes (TypeScript) and MCP server tools (JavaScript).

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         ENTRY POINTS                                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  TypeScript Path (Next.js API)          JavaScript Path (MCP Server)     │
│  ─────────────────────────────          ─────────────────────────────     │
│  executeOrchestrationWorkflow()         services(action: "workflow.execute") MCP tool         │
│            │                                       │                      │
│            ▼                                       ▼                      │
│  ┌─────────────────────────┐          ┌─────────────────────────────┐    │
│  │ MCPServiceOrchestration │          │ WorkflowToolsHandler        │    │
│  │ Handler (TS)            │          │ (JS)                        │    │
│  │                         │          │                             │    │
│  │ - POV access validation │          │ - Direct MCP tool call      │    │
│  │ - Zod schema validation │          │ - Prisma execution tracking │    │
│  │ - Connection pooling    │          │ - Activity audit logging    │    │
│  │ - orchestrationTracker  │          │ - InternalServiceRouter     │    │
│  └──────────┬──────────────┘          └──────────────┬──────────────┘    │
│             │                                        │                    │
│             └────────────────┬───────────────────────┘                    │
│                              ▼                                            │
│              ┌───────────────────────────────────────┐                    │
│              │  OrchestrationEngine (JS)             │                    │
│              │  lib/services/workflow/core/          │                    │
│              │                                       │                    │
│              │  - Variable resolution                │                    │
│              │  - Dependency analysis                │                    │
│              │  - Sequential/Parallel/Conditional    │                    │
│              │  - Failure strategies                 │                    │
│              │  - NO external dependencies           │                    │
│              └───────────────────────────────────────┘                    │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Why Two Handlers? (Process Boundaries)

The dual-handler architecture exists because of **process separation**, not language differences:

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│     Next.js Process             │     │     MCP Server Process          │
│     (server.ts)                 │     │     (mcp-server-v5.js)          │
│                                 │     │                                 │
│  mcpOrchestrationHandler.ts ────┼──✗──┼── Can't call across process     │
│                                 │     │                                 │
│  Compiled TS → JS at runtime    │     │  workflow-tools-handler.js      │
│                                 │     │                                 │
└─────────────────────────────────┘     └─────────────────────────────────┘
                │                                       │
                └───────────────┬───────────────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │  orchestration-engine.js     │
                 │  (Shared - both CAN import)  │
                 └──────────────────────────────┘
```

**Key points**:
- JavaScript **can** import compiled TypeScript (that's how the shared engine works)
- But MCP server runs as a **separate Node.js process** from Next.js
- Functions in one process **cannot directly call** functions in the other

**Solution**:
- **TS handler** → For code running inside Next.js (API routes, services)
- **JS handler** → For code running inside MCP server process
- **Shared engine** → Both import `orchestration-engine.js` for execution logic (no duplication)

---

## 3. Entry Points - Current Usage

| Entry Point | When Used | Consumer | Status |
|-------------|-----------|----------|--------|
| **mcpOrchestrationHandler.ts** | Next.js API routes, Web UI | `/api/workflows/run`, browser clients | **Active** |
| **workflow-tools-handler.js** | MCP tool calls from AI clients | Claude Desktop, ChatGPT | **Active** |

> **Current State (Jan 2026)**: Both handlers are actively used:
> - **TypeScript path**: Web UI at `/workflows` → `POST /api/workflows/run` → `lib/workflows/handlers.ts` → `executeOrchestrationWorkflow()` → `MCPServiceOrchestrationHandler`
> - **JavaScript path**: AI clients → MCP `services(action: "workflow.execute")` tool → `workflow-tools-handler.js`
>
> **Note**: There's a separate, unrelated workflow system at `lib/pov/services/workflow.ts` for POV lifecycle management (approvals, status changes) - not part of this architecture.

### TypeScript Path (API Routes)

```typescript
import { executeOrchestrationWorkflow } from '@/lib/services/workflow';

await executeOrchestrationWorkflow(
  'mcp_service_orchestration',
  {
    steps: [
      { service: 'sentry', tool: 'list_issues', arguments: { limit: 5 } },
      { service: 'slack', tool: 'send_message', arguments: { text: '{{step.0.output.count}} issues' } }
    ],
    executionMode: 'sequential'
  },
  userId,
  { povId: 'clxxxx123' }
);
```

### JavaScript Path (MCP Tool)

```
// Claude Desktop or ChatGPT calls:
services(action: "workflow.execute")({
  steps: [
    { service: 'paichart-project-service', tool: 'project(action: "pov.list")', arguments: { status: 'IN_PROGRESS' } },
    { service: 'paichart-project-service', tool: 'project(action: "task.list")', arguments: { povId: '{{step.0.output.data[0].id}}' } }
  ],
  executionMode: 'sequential'
})
```

---

## 4. Shared Core Engine

Both handlers use the **same `OrchestrationEngine`** (`orchestration-engine.js`):

| Capability | Description |
|------------|-------------|
| **Variable Chaining** | `{{step.N.output.field}}` - Reference previous step outputs |
| **Array Access** | `{{step.0.output.data[0].id}}` - Navigate arrays |
| **Execution Modes** | Sequential, parallel, conditional |
| **Dependency Analysis** | Topological sort for parallel execution |
| **Circular Detection** | DFS-based cycle detection |
| **Failure Strategies** | Stop, continue, rollback |

The engine is **stateless** - callers inject their own `callService` function via dependency injection.

### Why JavaScript (not TypeScript)?

The MCP server runs in a Node.js CommonJS context. A JS file can be imported by both:
- **JS**: `require('../core/orchestration-engine')`
- **TS**: `require('../core/orchestration-engine') as { OrchestrationEngine: ... }`

No build complexity, single source of truth.

---

## 5. Handler Differences

| Aspect | TS Handler | JS Handler |
|--------|------------|------------|
| **Service Caller** | `orchestrationServiceCaller` (dynamic `isInternalService()` check) | `INTERNAL_SERVICES` hardcoded list + `InternalServiceRouter` |
| **Internal Services** | Dynamic: checks `router.serviceToolMap?.[serviceId]` | Hardcoded: `['paichart-project-service', 'paichart-project-service']` |
| **Token Passing** | `_context` with token + user identity (via service-caller.ts) | `_context` with token + user identity (Jan 2026) |
| **Execution Tracking** | `orchestrationTracker` | Direct Prisma `MCPWorkflowExecution` |
| **Audit Logging** | Imports `orchestration-audit.ts` | Local `auditOrchestration()` function |
| **Zod Validation** | Direct import | Dynamic import with fallback |
| **Connection Pool** | Via service-caller | `ServiceConnectionPool` class |

> **Note**: Both handlers now pass `_context` in tool arguments for external service authentication and user identity propagation.

---

## 6. Feature Parity Matrix

| Feature | TS Handler | JS Handler | Status |
|---------|------------|------------|--------|
| **Shared Engine** | OrchestrationEngine | OrchestrationEngine | ✅ Parity |
| **Zod Validation** | MCPOrchestrationParamsSchema | Dynamic import | ✅ Parity |
| **Engine Validation** | Circular deps, ordering | Same engine | ✅ Parity |
| **POV Access** | validateMCPPOVAccess | validatePOVAccess | ✅ Parity |
| **Audit Logging** | auditOrchestration | auditOrchestration | ✅ Parity |
| **Security Policy** | validateServiceCall | validateServiceCall | ✅ Parity |
| **Connection Pool** | orchestrationServiceCaller | ServiceConnectionPool | ✅ Parity |
| **Response Filter** | (via service-caller) | validateServiceResponse | ✅ Parity |
| **Internal Routing** | (via service-caller) | InternalServiceRouter | ✅ Parity |
| **Timeout Enforcement** | Promise.race | Promise.race | ✅ Parity |
| **Token Passing** | `_context` in args | `_context` with token (Jan 2026) | ✅ Parity |

**Result: 100% Feature Parity** - Both handlers support authenticated external service calls.

> **External Service Auth**: Services receive `_context` with user identity:
> ```
> _context: {
>   userId, userEmail, userRole,  // User identity
>   token,                        // JWT (HS256) for validation
>   povId, tenantId,              // Scope context
>   requestId, source             // Tracing
> }
> ```
> **Note**: Token uses HS256 (shared secret). JWKS/RS256 is on the roadmap - see `TODO-jwks-public-key-auth.md`.

---

## 7. Security Policy Compliance

### Requirements from mcp-hub-security-policy.md

| Requirement | Implementation | Location |
|-------------|----------------|----------|
| **Tool Whitelist** | Static (~50 tools) + dynamic (registered) | `validateServiceCall()` |
| **Blocked Patterns** | Regex check (sudo, rm, exec, etc.) | service-call-policy.js |
| **Blocked URLs** | Private networks, metadata endpoints | service-call-policy.js |
| **Size Limits** | 100KB params, 1MB response | service-call-policy.js |
| **Call Depth** | Max 3 levels | service-call-policy.js |
| **PII Filtering** | Credit cards, emails, SSN redacted | `validateServiceResponse()` |

### Internal Service Handling (Two Different Mechanisms)

| Mechanism | Services | Effect | Location |
|-----------|----------|--------|----------|
| **INTERNAL_SERVICES** | `paichart-project-service`, `paichart-project-service` | Routed via InternalServiceRouter (no HTTP at all) | workflow-tools-handler.js:25 |
| **TRUSTED_INTERNAL_SERVICES** | `browser-automation-service`, `notification-service` | Bypass URL security checks (allows localhost) | service-call-policy.js:144 |

> **Key Distinction**: `INTERNAL_SERVICES` completely bypass HTTP (in-process routing). `TRUSTED_INTERNAL_SERVICES` still make HTTP calls but are allowed to call localhost/127.0.0.1 endpoints.

### Security Flow (JS Handler)

```
1. Authentication check (userId required)
2. POV access validation (if povId provided)
3. Zod schema validation (type safety)
4. Engine validation (business logic)
5. Per-step security:
   ├─ Internal service? → InternalServiceRouter (bypass policy)
   └─ External service? → validateServiceCall() → ConnectionPool → validateServiceResponse()
6. Audit logging (start, complete, failed events)
```

---

## 8. Validation Layers

| Layer | Purpose | What It Catches |
|-------|---------|-----------------|
| **Zod Schema** | Data shape & types | Empty strings, invalid ranges, missing required fields |
| **Engine.validate()** | Business logic | Circular dependencies, invalid dependsOn references |

Both layers are **complementary, not redundant**. Defense-in-depth at nanosecond cost.

---

## 9. Key Design Decisions

### 9.1 Shared Core in JavaScript

**Problem**: MCP server (JS) and API routes (TS) had ~60% feature parity.

**Solution**: Extract pure execution logic to JS module importable by both.

**Result**: Single source of truth, fix once → both benefit.

### 9.2 Lazy Zod Loading

**Problem**: Zod schema is in TypeScript ESM, MCP server is CommonJS.

**Solution**: Dynamic import with graceful fallback.

```javascript
async function initializeZodSchema() {
  if (!MCPOrchestrationParamsSchema) {
    try {
      const schemaModule = await import('..../orchestration-params');
      MCPOrchestrationParamsSchema = schemaModule.MCPOrchestrationParamsSchema;
    } catch (error) {
      // Fallback: mock schema that always passes
      MCPOrchestrationParamsSchema = { safeParse: (data) => ({ success: true, data }) };
    }
  }
  return MCPOrchestrationParamsSchema;
}
```

### 9.3 Connection Pooling

**Problem**: Each MCP client connection takes 100-200ms to establish.

**Solution**: `ServiceConnectionPool` reuses connections.

**Result**: 100-200ms savings per external service call.

### 9.4 Internal Service Router

**Problem**: Internal services (paichart-project-service, paichart-project-service) don't need HTTP calls.

**Solution**: `InternalServiceRouter` routes directly to API handlers in-process.

**Result**: Zero network overhead for internal orchestration.

---

## 10. Activity Tracking & Source Identification

### Activity Logging (Internal)

Both handlers log activities with `source: 'mcp_hub'` for origin identification:

| Source | Description |
|--------|-------------|
| `mcp_hub` | MCP Hub orchestration workflows |
| `web_ui` | Browser/frontend actions |
| `api` | Direct API calls |
| `mcp_server` | MCP server tool execution |

```sql
SELECT * FROM Activity WHERE metadata->>'source' = 'mcp_hub' ORDER BY createdAt DESC;
```

### External Service Context (`_context.source`)

External services receive `source: 'mcp_hub_workflow'` in `_context` to identify call origin:

| Context Source | Where Set | Purpose |
|----------------|-----------|---------|
| `mcp_hub_workflow` | `service-caller.ts:210` | External service calls from TS handler |
| `mcp_hub_workflow` | `workflow-tools-handler.js:411` | External service calls from JS handler |

**Note**: Internal services (routed via `InternalServiceRouter`) do not currently receive `source` in their context.

> **See also**: [`PLATFORM-ACTIVITY-SYSTEM.md`](./PLATFORM-ACTIVITY-SYSTEM.md) for complete activity tracking architecture.

---

## 11. Future Considerations

1. **Metrics**: Execution time tracking per service for performance analysis
2. **Caching**: Cache service lookups for frequently called services
3. **Retry Logic**: Configurable retry for transient failures
4. **Rate Limiting**: Per-workflow rate limiting (currently per-service only)
