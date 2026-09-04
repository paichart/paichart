# Hub Authentication & Context Passing

> **Updated**: 2026-01-16 (original) | **Reality post-U2**: 2026-05-19 | **Related**: workflow-dual-handler-architecture.md, mcp-hub-external-service-authentication.md

> **⚠️ POST-U2 (2026-05-19) UPDATE — read this before relying on the flow diagrams below**
>
> After U2 Audience-Tightening (9 commits ending `de6a2fa6`), token flow shifted from "forward inbound Bearer through orchestration chain" to "per-call mint at each downstream consumer with per-service audience" (RFC 8707). The Bearer-forward narrative throughout this doc is HISTORICAL — accurate for understanding the pre-U2 model but not the current code.
>
> **Current model (post-U2)**:
> - `req.user.{token, azp}` populated by `populateReqUser(req, claims, token, authMethod, extras)` helper at `mcp-server-http-clean.js` (3 auth paths consolidated in Phase E.1: RS256, HS256-fallback, X-API-Key)
> - `setUserContext` carries `{token, azp}` into `context.user.{token, azp}` (Phase D site #8 added azp; token KEPT for front-door Tier 1 fast-path per boundary-contract C3)
> - `extractAuthContext` returns `{userId, userEmail, role, azp}` — **NO `token` field** (Phase D site #2)
> - `ContextEnricher` synthesizes `apiUserContext.{userId, email, role, azp, isDemoUser}` — **NO `token` field** (Phase D site #6); `isAuthenticated` checks `userId` not `token`
> - Downstream consumers MINT per-call:
>   - `api-client.js:57` mints with `INTERNAL_API_AUDIENCE` for `/api/*`
>   - `service-caller.ts:300+` mints with `audienceForService(serviceInfo)` for external services
>   - `workflow-tools-handler.js:558+` mints with `audienceForService(serviceRecord)`, post-trust-gate
> - `OrchestrationContext.user.token` and `WorkflowConfig.token` types DROPPED (Phase D sites #16/#17)
> - Trust-gate at `trust-level.js:200` uses spread guard `{...(token ? { token } : {})}` to prevent `token: undefined` leakage (Phase F.4)
>
> Full plan: `cline_docs/reviews/u2-audience-tightening-2026-05-19/IMPLEMENTATION-PLAN-v3.1.md`. Forensic trace: `cross-service-jti-forensics.md`. Canonical mint: `lib/auth/token-manager.ts:mintMcpToken`. Audience helper: `lib/mcp/server/tools/hub/audience-policy.js`.

This document describes how user authentication tokens flow through the system for both MCP and REST API paths.

**For External Service Developers**: See [External Service Authentication Guide](./mcp-hub-external-service-authentication.md) for how to validate pAIchart JWT tokens in your service.

## Overview: Dual Entry Points

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION FLOW OVERVIEW                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Claude Desktop / ChatGPT              Web UI (Admin)                          │
│          │                                    │                                  │
│          ▼                                    ▼                                  │
│   ┌──────────────┐                    ┌──────────────┐                          │
│   │ MCP Server   │                    │ REST API     │                          │
│   │ (JavaScript) │                    │ (TypeScript) │                          │
│   └──────┬───────┘                    └──────┬───────┘                          │
│          │                                    │                                  │
│          │ workflow-tools-handler.js          │ mcpOrchestrationHandler.ts      │
│          │                                    │                                  │
│          ▼                                    ▼                                  │
│   ┌──────────────────────────────────────────────────────────────────┐          │
│   │                    InternalServiceRouter                          │          │
│   │         (Zero HTTP for internal services)                         │          │
│   │                                                                   │          │
│   │   • paichart-project-service  → apiClient.get('/api/pov/...')        │          │
│   │   • paichart-project-service → apiClient.get('/api/tasks/...')      │          │
│   └──────────────────────────────────────────────────────────────────┘          │
│          │                                    │                                  │
│          ▼                                    ▼                                  │
│   ┌──────────────────────────────────────────────────────────────────┐          │
│   │              External Services (HTTP Connection Pool)             │          │
│   │                                                                   │          │
│   │   • notification-service  → localhost:3101                       │          │
│   │   • browser-automation    → localhost:3100                       │          │
│   │   • sentry-mcp           → external endpoint                     │          │
│   └──────────────────────────────────────────────────────────────────┘          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Path A: MCP Server (Claude Desktop / ChatGPT)

This path handles MCP protocol requests from AI clients.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PATH A: MCP SERVER TOKEN FORWARDING                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  A1. AUTHENTICATION (AuthManager.createMiddleware — lib/auth/oauth/auth-manager.ts) │
│      Wave 3a/4 extraction; was mcp-server-http-clean.js:636-714 pre-Wave-3a       │
│      ┌──────────────────────────────────────────────────────────────────┐       │
│      │ Bearer token received → Validates JWT/OAuth → Creates req.user   │       │
│      │ via AuthManager.populateReqUser(req, claims, token, ...)         │       │
│      │                                                                   │       │
│      │   req.user = {                                                    │       │
│      │     id: user.id,                                                  │       │
│      │     email: user.email,                                            │       │
│      │     role: user.role,                                              │       │
│      │     token: token,  ← ✅ TOKEN PRESERVED HERE                      │       │
│      │     azp: claims.azp ← U2 Phase D (2026-05-19) per-call mint forensics │
│      │   }                                                               │       │
│      └──────────────────────────────────────────────────────────────────┘       │
│                               ↓                                                  │
│  A2. CONTEXT PROPAGATION (MCPCoreManager.processRequest — lib/mcp/server/mcp-core.ts) │
│      Wave 7 Phase 7.2 extraction; was mcp-server-http-clean.js:3463-3472 pre-Wave-7 │
│      ┌──────────────────────────────────────────────────────────────────┐       │
│      │ processRequest(request, user) → Calls setUserContext():          │       │
│      │                                                                   │       │
│      │   mcpServer.setUserContext({                                      │       │
│      │     user: {                                                       │       │
│      │       id: user.userId || user.id,                                 │       │
│      │       email: user.email,                                          │       │
│      │       role: user.role,                                            │       │
│      │       token: user.token, ← ✅ P0-2 FIX: Forward JWT token         │       │
│      │       azp: user.azp,     ← U2 Phase D: client-binding for mint   │       │
│      │     },                                                            │       │
│      │     authenticated: true                                           │       │
│      │   });                                                             │       │
│      └──────────────────────────────────────────────────────────────────┘       │
│                               ↓                                                  │
│  A3. TOOL EXECUTION (mcp-server-v5.js:982-988)                                  │
│      ┌──────────────────────────────────────────────────────────────────┐       │
│      │ resolveUserContext() passes context to tool handlers:            │       │
│      │                                                                   │       │
│      │   const result = await handler(processedArgs, this.userContext); │       │
│      │                                                                   │       │
│      │   Context includes: context.user.token (the JWT)                 │       │
│      └──────────────────────────────────────────────────────────────────┘       │
│                               ↓                                                  │
│  A4. WORKFLOW HANDLER (workflow-tools-handler.js)                               │
│      ┌──────────────────────────────────────────────────────────────────┐       │
│      │ WorkflowToolsHandler routes by service type:                     │       │
│      │                                                                   │       │
│      │   // Internal services: InternalServiceRouter (zero HTTP)        │       │
│      │   if (INTERNAL_SERVICES.includes(service)) {                     │       │
│      │     return this.internalRouter.routeCall(                        │       │
│      │       serviceId, tool, args, context                             │       │
│      │     );                                                           │       │
│      │   }                                                              │       │
│      │                                                                   │       │
│      │   // External services: Pass _context with JWT (Jan 2026)        │       │
│      │   client.callTool({                                              │       │
│      │     name: tool,                                                  │       │
│      │     arguments: {                                                 │       │
│      │       ...args,                                                   │       │
│      │       _context: {                                                │       │
│      │         userId, userEmail, userRole,                             │       │
│      │         token: userToken,  ← JWT FOR EXTERNAL AUTH              │       │
│      │         requestId, source: 'mcp_hub_workflow'                    │       │
│      │       }                                                          │       │
│      │     }                                                            │       │
│      │   });                                                            │       │
│      └──────────────────────────────────────────────────────────────────┘       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Path B: REST API (Web UI Workflow Execution)

This path handles workflow execution from the admin Web UI at `/workflows`.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PATH B: REST API TOKEN FORWARDING                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  B1. API REQUEST (lib/workflows/handlers.ts:259-267)                            │
│      ┌──────────────────────────────────────────────────────────────────┐       │
│      │ POST /api/workflows/run receives token from header OR cookie:   │       │
│      │                                                                   │       │
│      │   // Try Authorization header first (API clients)               │       │
│      │   const authHeader = req.headers.get('authorization');           │       │
│      │   let token = authHeader?.startsWith('Bearer ')                  │       │
│      │     ? authHeader.substring(7) : undefined;                       │       │
│      │                                                                   │       │
│      │   // Fallback to cookie (browser requests)                      │       │
│      │   if (!token) {                                                  │       │
│      │     token = req.cookies.get(config.cookie.accessToken)?.value; │       │
│      │   }  // Note: config.cookie.accessToken = 'token'              │       │                                                              │       │
│      └──────────────────────────────────────────────────────────────────┘       │
│                               ↓                                                  │
│  B2. WORKFLOW EXECUTION (lib/services/workflow/index.ts:174-178)                │
│      ┌──────────────────────────────────────────────────────────────────┐       │
│      │ executeOrchestrationWorkflow() passes token in config:           │       │
│      │                                                                   │       │
│      │   const config = {                                               │       │
│      │     workflowType,                                                │       │
│      │     povId: options?.povId,                                       │       │
│      │     token: options?.token,  ← ✅ TOKEN PASSED HERE               │       │
│      │     parameters                                                   │       │
│      │   };                                                             │       │
│      └──────────────────────────────────────────────────────────────────┘       │
│                               ↓                                                  │
│  B3. HANDLER EXECUTION (mcpOrchestrationHandler.ts:77-79)                       │
│      ┌──────────────────────────────────────────────────────────────────┐       │
│      │ MCPServiceOrchestrationHandler.execute() builds context:         │       │
│      │                                                                   │       │
│      │   const context = await buildOrchestrationContext(               │       │
│      │     userId,                                                      │       │
│      │     config.povId,                                                │       │
│      │     config.token  ← ✅ TOKEN FORWARDED                           │       │
│      │   );                                                             │       │
│      └──────────────────────────────────────────────────────────────────┘       │
│                               ↓                                                  │
│  B4. CONTEXT BUILDING (orchestration-context.ts:50-63)                          │
│      ┌──────────────────────────────────────────────────────────────────┐       │
│      │ buildOrchestrationContext() stores token in user object:         │       │
│      │                                                                   │       │
│      │   const dbUser = await prisma.user.findUniqueOrThrow({...});     │       │
│      │   const user = { ...dbUser, token };  ← ✅ TOKEN STORED          │       │
│      │                                                                   │       │
│      │   Returns: OrchestrationContext.user.token                       │       │
│      └──────────────────────────────────────────────────────────────────┘       │
│                               ↓                                                  │
│  B5. SERVICE ROUTING (service-caller.ts:141-172)                                │
│      ┌──────────────────────────────────────────────────────────────────┐       │
│      │ orchestrationServiceCaller.callService() routes by type:         │       │
│      │                                                                   │       │
│      │   if (isInternalService(service)) {                              │       │
│      │     const internalContext = {                                    │       │
│      │       user: { id, email, token, role },                          │       │
│      │       apiUserContext: { userId, token, email, role }             │       │
│      │     };                                                           │       │
│      │     return router.routeCall(service, tool, args, internalContext);│       │
│      │   }                                                              │       │
│      │   // External: Use HTTP connection pool with _context            │       │
│      └──────────────────────────────────────────────────────────────────┘       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Convergence: InternalServiceRouter

Both paths converge at `InternalServiceRouter` for internal pAIchart services.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    INTERNAL SERVICE ROUTING (SHARED)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Location: lib/mcp/server/tools/internal/InternalServiceRouter.js               │
│                                                                                  │
│  REGISTERED INTERNAL SERVICES:                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐           │
│  │ serviceToolMap = {                                               │           │
│  │   'paichart-project-service': {                                      │           │
│  │     'project(action: "pov.list")': handleListPOVs,                                 │           │
│  │     'project(action: "pov.details")': handleGetPOVDetails,                      │           │
│  │     'get_pov_phases': handleGetPOVPhases                         │           │
│  │   },                                                             │           │
│  │   'paichart-project-service': {                                     │           │
│  │     'project(action: "task.context")': advancedTools.handleGetTaskContext,      │           │
│  │     'perform(action: "execute")': advancedTools.handleExecuteTaskAction,│           │
│  │     'project(action: "task.list")': handleListTasks,                               │           │
│  │     'get_task_details': handleGetTaskDetails                     │           │
│  │   }                                                              │           │
│  │ }                                                                │           │
│  └──────────────────────────────────────────────────────────────────┘           │
│                                                                                  │
│  DETECTION METHODS:                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐           │
│  │ // Path A (JS): Check service configuration                      │           │
│  │ isInternalService(service) {                                     │           │
│  │   return service?.configuration?.type === 'internal' ||          │           │
│  │          service?.configuration?.endpoint?.startsWith('internal://');│        │
│  │ }                                                                │           │
│  │                                                                   │           │
│  │ // Path B (TS): Check serviceToolMap directly                    │           │
│  │ function isInternalService(serviceId: string): boolean {         │           │
│  │   return !!router.serviceToolMap?.[serviceId];                   │           │
│  │ }                                                                │           │
│  └──────────────────────────────────────────────────────────────────┘           │
│                                                                                  │
│  CONTEXT NORMALIZATION:                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐           │
│  │ // InternalServiceRouter normalizes context from both paths:     │           │
│  │ normalizeContext(context) {                                      │           │
│  │   return {                                                       │           │
│  │     ...context,                                                  │           │
│  │     user: context.apiUserContext || context.user || {},          │           │
│  │     apiUserContext: context.apiUserContext || {                  │           │
│  │       userId: context.user?.id,                                  │           │
│  │       token: context.user?.token,  ← USED FOR API AUTH           │           │
│  │       email: context.user?.email,                                │           │
│  │       role: context.user?.role                                   │           │
│  │     }                                                            │           │
│  │   };                                                             │           │
│  │ }                                                                │           │
│  └──────────────────────────────────────────────────────────────────┘           │
│                                                                                  │
│  API CLIENT USAGE:                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐           │
│  │ // Internal handlers use apiClient with userContext:             │           │
│  │ const userContext = this.buildUserContext(context);              │           │
│  │ return apiClient.get('/api/pov', params, { userContext });       │           │
│  │                                                                   │           │
│  │ // apiClient extracts token for Authorization header:            │           │
│  │ const token = options.userContext?.token;                        │           │
│  │ if (token) {                                                     │           │
│  │   headers['Authorization'] = `Bearer ${token}`;                  │           │
│  │ }                                                                │           │
│  │                                                                   │           │
│  │ // IMPORTANT: Internal URL for server-to-server calls           │           │
│  │ // Uses http://127.0.0.1:3000 to avoid nginx round-trip         │           │
│  │ // and prevent connection deadlock (504 Gateway Timeout)        │           │
│  │ const baseUrl = SERVER_CONFIG.api.internalBaseUrl;              │           │
│  │ // Configured in server-config.js:                              │           │
│  │ // internalBaseUrl: process.env.APP_INTERNAL_BASE_URL           │           │
│  │ //   || 'http://127.0.0.1:3000'                                 │           │
│  └──────────────────────────────────────────────────────────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files Reference

| Component | File | Purpose |
|-----------|------|---------|
| MCP Auth | `lib/mcp/server/mcp-server-http-clean.js` | JWT/OAuth validation |
| MCP Server | `lib/mcp/server/mcp-server-v5.js` | Tool execution dispatch |
| JS Handler | `lib/mcp/server/tools/hub/workflow-tools-handler.js` | MCP workflow execution |
| TS Handler | `lib/services/workflow/handlers/mcpOrchestrationHandler.ts` | REST API workflow execution |
| Service Caller | `lib/services/workflow/integrations/service-caller.ts` | Internal/external routing |
| Internal Router | `lib/mcp/server/tools/internal/InternalServiceRouter.js` | Zero-HTTP internal calls |
| Context Builder | `lib/services/workflow/types/orchestration-context.ts` | OrchestrationContext with token |
| API Client | `lib/mcp/server/utils/api-client.js` | HTTP with auth headers |

---

## Troubleshooting

**504 Gateway Timeout on /api/workflows/run**

Primary cause: **Connection Deadlock** - Server calling itself via external HTTPS URL
- When the web server calls `/api/pov` via `https://paichart.app/api/pov`, nginx forwards it back to the same server
- This creates a deadlock: the server waits for itself to respond
- **Fix**: Use internal URL `http://127.0.0.1:3000` for server-to-server calls (bypasses nginx)
- Configuration: `SERVER_CONFIG.api.internalBaseUrl` in `server-config.js`
- Uses `127.0.0.1` instead of `localhost` to avoid IPv6 resolution issues

Secondary cause: Token not passed to internal services
- Fix: Ensure `handleRunWorkflow` extracts token from Authorization header OR cookies
- Verify: `OrchestrationContext.user.token` is populated
- Note: Browser requests send cookies (`token`), not Authorization header - must check both!

**"s is not a function" error in workflows**
- Cause: `node-fetch` incorrectly bundled by Next.js webpack
- Fix: Add `node-fetch` to `serverComponentsExternalPackages` in `next.config.js`:
  ```javascript
  experimental: {
    serverComponentsExternalPackages: ['@modelcontextprotocol/sdk', 'node-fetch']
  }
  ```

**Internal service returns 401 Unauthorized**
- Cause: Token missing in `apiUserContext`
- Check: `InternalServiceRouter.normalizeContext()` output
- Verify: `apiClient` receives `userContext.token`

**Service not found: paichart-project-service**
- Cause: `isInternalService()` not detecting internal service
- Check: Service exists in `InternalServiceRouter.serviceToolMap`
- Fix: Add service to serviceToolMap if missing

---

## External Service Authentication (Jan 2026)

External services registered with the Hub receive `_context` in tool arguments containing:

```javascript
_context: {
  userId: "clm8xyz123",           // pAIchart user CUID
  userEmail: "user@company.com", // User email
  userRole: "ADMIN",             // ADMIN, MANAGER, USER, VIEWER
  token: "eyJhbGciOiJSUzI1NiIs...", // JWT for validation
  requestId: "wf-1737012345678", // Request trace ID
  source: "mcp_hub_workflow"     // Origin identifier
}
```

**Validation Flow**:
```
┌────────────────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICE JWT VALIDATION                              │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   1. External service receives tool call with _context                         │
│                               │                                                 │
│                               ▼                                                 │
│   2. Extract token: const token = args._context.token                          │
│                               │                                                 │
│                               ▼                                                 │
│   3. Fetch JWKS: GET https://paichart.app/api/auth/jwks                        │
│                               │                                                 │
│                               ▼                                                 │
│   4. Validate JWT signature and claims (jose library)                          │
│      - issuer: "https://paichart.app"                                          │
│      - audience: "paichart-api"                                                │
│                               │                                                 │
│                               ▼                                                 │
│   5. Use verified claims for authorization:                                    │
│      - payload.sub → userId                                                    │
│      - payload.email → userEmail                                               │
│      - payload.tenantId → organization ID (cross-tenant)                       │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Implementation**: See [External Service Authentication Guide](./mcp-hub-external-service-authentication.md) for complete code examples using the `jose` library.

---

## Token Passing Policy: services(action: "call") vs services(action: "workflow.execute")

**Architectural Decision** (2026-01-30): Different token passing policies for direct calls vs workflows

### Current Implementation

**services(action: "workflow.execute")** - Trust level system (DEPLOYED):
```typescript
// lib/mcp/server/tools/hub/workflow-tools-handler.js (lines 425-469)
const trustLevel = await determineTrustLevel({
  serviceId, serviceRecord, userId, povId, prisma
});

const serviceContext = buildServiceContext(trustLevel, {
  userId, userEmail, userRole,
  token: userToken,  // Only if trust level allows
  povId, tenantId, requestId, source
});

client.callTool({
  name: tool,
  arguments: { ...args, _context: serviceContext }
});
```

**services(action: "call")** - No trust levels (CURRENT STATE):
```typescript
// lib/mcp/server/tools/hub/service-call-handler.js (line 400)
client.callTool({
  name: tool,
  arguments: validatedArgs.arguments  // No _context!
});
```

### The Decision

**Status**: `services(action: "call")` does NOT currently pass tokens (identified 2026-01-30)

**Planned Enhancement** (Roadmap):
```typescript
// Proposed: services(action: "call") with trust levels
const trustLevel = await determineTrustLevel({...});
const serviceContext = buildServiceContext(trustLevel, {...});

client.callTool({
  name: tool,
  arguments: {
    ...args,
    _context: serviceContext  // Pass token based on trust
  }
});
```

### Security Reasoning

**The Threat Model** - Token Delegation Attack:

```
Scenario: User calls Service A, Service A forwards token to Service B

User → Hub → Service A (public, gets token)
                ↓ Service A is malicious
         Service A → Hub → Service B (using user's token)
                              ↑ User never authorized this!
```

**Alternatives Considered**:

**Option 1: Never Pass Tokens to Public Services** ❌
```
Pros: Maximum security, zero delegation risk
Cons: External services can't validate user identity
      Breaks Component 5 use case (external service auth)
Verdict: Too restrictive for intended use case
```

**Option 2: Always Pass Tokens to All Services** ❌
```
Pros: Simple, no trust level complexity
Cons: Public services can forward tokens freely
      No protection against delegation attacks
Verdict: Too permissive, enables confused deputy attacks
```

**Option 3: Trust Level System (CURRENT)** ✅
```
Pros: Granular control (INTERNAL, TRUSTED, OWNER, TEAM_MEMBER get tokens)
      Service ownership determines token access
      POV team membership grants token access
Cons: services(action: "call") doesn't implement this yet (TODO)
Verdict: Balanced approach, aligned with OAuth best practices
```

**Option 4: Scope-Based Delegation** 🔮 (Future)
```
Pros: OAuth standard pattern (token scopes control access)
      Fine-grained permissions per service
      Explicit user consent for delegation
Cons: Requires major token system overhaul
      Need UI for user consent flows
Verdict: Roadmap item for Phase 4
```

### Chosen Approach: Trust Levels with Delegation Controls

**Design Principles** (2026-01-30 consensus):

1. **Direct User Calls** (`services(action: "call")` - when implemented):
   - User explicitly calls the service
   - Pass token if service is PUBLIC (user chose to use it)
   - Service validates token and makes authorization decision
   - Risk: Low (user made the call, knows which service)

2. **Multi-Service Workflows** (`services(action: "workflow.execute")`):
   - Service chains can forward tokens
   - Trust levels prevent token leakage
   - Only OWNER/TEAM_MEMBER services in workflow get tokens
   - Risk: Medium (service could call another service)

3. **Service-to-Service Delegation** (PROHIBITED):
   - Services MUST NOT forward user tokens to other services
   - If Service A needs Service B, use service credentials (not user's)
   - Audit logging tracks all token usage
   - Violation detection: Monitor for delegation patterns

**Mitigation**: Document in service registration guide:
```
⚠️ CRITICAL: Do not forward user tokens to other services

// ❌ WRONG: Token delegation
async function myTool(args) {
  const userToken = args._context.token;

  // Don't do this!
  await callAnotherService({
    headers: { Authorization: `Bearer ${userToken}` }
  });
}

// ✅ RIGHT: Use service credentials
async function myTool(args) {
  const userToken = args._context.token;

  // Validate user first
  const user = await validateToken(userToken);

  // Use YOUR service's credentials for other calls
  await callAnotherService({
    headers: { Authorization: `Bearer ${myServiceToken}` },
    userId: user.userId  // Track who initiated
  });
}
```

### Future Enhancements (Roadmap)

**Phase 4: Delegation Tracking** (Q2 2026)
- Add `delegatedFrom` field to _context
- Track: User → Service A → Service B token chains
- Audit log: Complete delegation trail
- User visibility: "Service A used your token to call Service B"

**Phase 5: Scope-Based Authorization** (Q3 2026)
- Token scopes: `["call:service-a", "read:pov-123"]`
- Service A can only call Service B if token has `call:service-b` scope
- User consent UI for scope granting
- OAuth 2.0 fine-grained authorization (RFC 9396)

### Current Recommendation (2026-01-30)

**For services(action: "call") implementation**:
1. ✅ Pass tokens to PUBLIC services (user explicitly called)
2. ✅ Use trust level system (same as services(action: "workflow.execute"))
3. ✅ Document "no token forwarding" policy
4. 🔮 Add delegation tracking in Phase 4 (if abuse detected)

**Risk Level**: **LOW** (manageable with current controls + documentation)

**Specialist Consensus**: Approved by auth-permissions + oauth-multi-provider specialists

---
