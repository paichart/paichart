# Three-Tier Tool Architecture

> **Version**: 1.0 | **Created**: 2026-03-19 | **Author**: Steve + Claude
>
> The pAIchart MCP platform has three distinct tiers of tools. Understanding which tier a tool belongs to determines how it's discovered, called, authenticated, and composed.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    AI Client Layer                        │
│         (Claude Desktop, ChatGPT, Gemini CLI)            │
└──────────────┬──────────────────────┬───────────────────┘
               │ tools/list           │ services(action:"call")
               │ (always visible)     │ (discovered via Hub)
               ▼                      ▼
┌──────────────────────┐  ┌───────────────────────────────┐
│   Tier 1: Platform   │  │        Tier 2 & 3: Hub        │
│       Tools          │  │         Services               │
│                      │  │                                │
│  project             │  │  ┌─────────────────────────┐  │
│  perform             │  │  │ Tier 2: Internal         │  │
│  analytics           │  │  │                          │  │
│  template            │  │  │ KPI Service (→ API)      │  │
│  search              │  │  │ Project Service (direct)  │  │
│  fetch               │  │  │ Task Service (direct)     │  │
│  services ◄──────────┼──┤  │ Recommendation Engine*    │  │
│  registry            │  │  └─────────────────────────┘  │
│  list_prompts        │  │                                │
│  prompt_command       │  │  ┌─────────────────────────┐  │
│                      │  │  │ Tier 3: External          │  │
└──────────────────────┘  │  │                          │  │
                          │  │ weather-service (Docker)  │  │
                          │  │ eia-service (Docker)      │  │
                          │  │ eodhd-service (Docker)    │  │
                          │  │ Snowflake Service (Docker)│  │
                          │  │ notification-service      │  │
                          │  │ alpha-vantage (SaaS)      │  │
                          │  │ token-validator (Docker)  │  │
                          │  │ browser-automation        │  │
                          │  └─────────────────────────┘  │
                          └───────────────────────────────┘

* Recommendation Engine is registered in the Hub catalog but
  its actual implementation lives as a Tier 1 platform tool
  (analytics). See "Case Study" section below.
```

---

## Tier 1: Platform Tools

**What**: Native MCP tools hardcoded into the server (`mcp-server-v5.js`, `mcp-server-http-clean.js`). Always available to every connected client.

**Tools**:

| Tool | Purpose |
|------|---------|
| `project` | Query POVs and tasks (pov.list, pov.details, task.list, task.context) |
| `perform` | Execute actions (task.create, task.update, agent.execute, analytics.generate) |
| `analytics` | AI recommendations and team performance metrics |
| `template` | Browse and inspect agent templates (ADMIN) |
| `search` | Natural language search across all resource types |
| `fetch` | Retrieve details for a specific resource by type-prefixed ID |
| `services` | Gateway to Hub — discover, call, health check, workflow orchestration |
| `registry` | Register, update, delete Hub services |
| `list_prompts` | Browse prompt templates |
| `prompt_command` | Execute a prompt template |

**Characteristics**:
- Show up in `tools/list` automatically — no registration needed
- Direct access to domain services and database (no HTTP round-trip)
- Authenticated via the MCP connection's session (JWT or OAuth)
- Cannot be registered or deregistered — they ARE the platform
- The `services` and `registry` tools are the **gateway** into Tier 2 and 3
- Defined in `lib/mcp/server/config/tool-schemas.js`
- Handlers in `lib/mcp/server/tools/` (dispatchers, advanced, hub)

**How clients use them**:
```
project(action: "pov.list", limit: 5)
perform(action: "task.create", povId: "...", ...)
analytics(action: "recommendations.get", povId: "...")
```

---

## Tier 2: Internal Hub Services

**What**: Platform-owned services registered in the Hub, callable via `services(action: "call")`. They run inside the same Node.js process but go through the InternalServiceRouter for dispatch.

**Services**:

| Service | ID | Tools | Routing |
|---------|----|-------|---------|
| KPI Service | `paichart-kpi-service` | `kpi` (score, history, evaluate) | HTTP piggyback via apiClient |
| Project Service | `paichart-project-service` | `project`, `perform` | Direct domain calls (in-process) |
| Task Service | `paichart-task-service` | `project`, `perform`, `get_task_context`, etc. | Direct domain calls (in-process) |
| Recommendation Engine | `paichart-recommendation-engine` | None (catalog entry only) | N/A — see Case Study below |

**Characteristics**:
- Discoverable via `services(action: "discover")`
- Routed through `InternalServiceRouter` — no network hop for direct calls
- Registered in the `MCPTool` database table with `configuration.type: "internal"`
- Can participate in Hub workflows (variable chaining, parallel execution)
- Get health checks, usage metrics, discovery metadata
- Owned by the platform, not by individual users
- Two sub-patterns for how they execute:

### Sub-pattern A: Direct Domain Calls (Project, Task)

The InternalServiceRouter calls domain service functions directly in the same process. No HTTP, no `apiClient`, no serialization overhead.

```
services(action: "call", tool: "project", args)
  → InternalServiceRouter.handleProject(args, context)
    → advancedTools.handleProject(args, context)  // in-process
```

**Pros**: Fast (~1ms). No auth token forwarding needed (context passed directly).
**Cons**: Doesn't inherit REST API middleware (rate limiting, logging, access control must be handled separately).

### Sub-pattern B: HTTP Piggyback (KPI)

The InternalServiceRouter makes an HTTP call to the platform's own REST API via `apiClient`. This lets the service inherit all the middleware on that endpoint (authentication, `withPOVAccess`, validation, logging).

```
services(action: "call", tool: "kpi", args)
  → InternalServiceRouter.handleKPI(args, context)
    → apiClient.get("/api/pov/{povId}/kpi", {}, { userContext })
      → Next.js API route → withPOVAccess → kpiService.getPOVKPIs()
```

**Pros**: Inherits all access control and middleware for free. Single source of truth for security.
**Cons**: HTTP round-trip (~10-50ms). Must forward user token correctly (see Critical Pattern below).

### Critical Pattern: apiClient 3-Argument Call

```javascript
// CORRECT — auth in 3rd argument:
apiClient.get(endpoint, queryParams, { userContext })

// WRONG — headers serialized as query params (?headers=[object Object]):
apiClient.get(endpoint, { headers })
```

The `apiClient.get()` signature is `(endpoint, params, options)`. The second argument is ALWAYS query params (serialized via `new URLSearchParams()`). Auth goes in the third argument as `{ userContext: { token, userId, role } }`.

**How clients use them**:
```
services(action: "call", targetService: "paichart-kpi-service", tool: "kpi",
         arguments: { action: "score", povId: "..." })
```

---

## Tier 3: External Hub Services

**What**: User-registered or infrastructure services running as separate processes (Docker containers, SaaS APIs, remote endpoints). Called via HTTP/SSE through the Hub.

**Services** (as of March 2026):

| Service | Transport | Category | Location |
|---------|-----------|----------|----------|
| weather-service | Docker/SSE | data-services | localhost:3102 |
| eia-service | Docker/SSE | data-services | localhost:3103 |
| eodhd-service | Docker/SSE | data-services | localhost:3104 |
| token-validator-service | Docker/SSE | security | localhost:3105 |
| Snowflake Service | Docker/SSE | data-analytics | localhost:3106 |
| notification-service | Docker/HTTP | communication | localhost:3101 |
| browser-automation | Docker/HTTP | automation | localhost:3100 |
| alpha-vantage-market-data | SaaS/HTTPS | data-services | mcp.alphavantage.co |

**Characteristics**:
- Registered via `registry(action: "register")` with endpoint, category, capabilities
- Network hop required (HTTP/SSE to Docker container or remote URL)
- JWT token forwarded for identity via the trust level system:
  - TRUSTED: Full JWT token (localhost Docker services)
  - VERIFIED: Scoped JWT (approved external services)
  - ANONYMOUS: No token (untrusted endpoints)
- Security policy evaluation on registration (SSRF checks, localhost blocking, approval flow)
- User-owned — subject to ownership permissions, quotas, GDPR Right to Erasure deletion
- Can be composed into multi-service workflows (sequential, parallel, conditional)
- Tool schemas registered for AI client compatibility (`schemaVersion: 2`)

**How clients use them**:
```
services(action: "call", targetService: "weather-service", tool: "forecast",
         arguments: { location: "Sydney", days: 5 })
```

---

## The Bridge: How `services` Connects the Tiers

The `services` platform tool (Tier 1) is the gateway to Tier 2 and 3. When you call `services(action: "call")`, the Hub call handler determines the routing:

```
services(action: "call", targetService: "...", tool: "...", arguments: {...})
    │
    ▼
Hub Call Handler (service-call-handler.js)
    │
    ├── Is configuration.type === "internal"?
    │   YES → InternalServiceRouter.routeCall()     [Tier 2]
    │           ├── Direct domain call (Project/Task)
    │           └── HTTP piggyback via apiClient (KPI)
    │
    └── NO → External HTTP/SSE call                 [Tier 3]
              ├── Token forwarding (trust level)
              ├── Timeout management
              └── Error handling + retry
```

The AI client uses the same call pattern regardless of tier:
```
services(action: "call", targetService: "paichart-kpi-service", tool: "kpi", ...)   ← Tier 2
services(action: "call", targetService: "weather-service", tool: "forecast", ...)   ← Tier 3
```

This is the power of the Hub abstraction — the client doesn't need to know whether a service is internal or external.

---

## Case Study: Recommendation Engine vs KPI Service

These two services illustrate the evolution of the architecture and why both patterns exist.

### Recommendation Engine (Early 2025 — Pre-Hub)

The recommendation engine was built before the Hub existed. It was implemented as a **native Tier 1 platform tool**:

```
analytics(action: "recommendations.get", povId: "...", type: "RISK_MITIGATION")
```

**Implementation path**:
```
analytics tool → AIRecommendationsHandler.handle()
  → apiClient.get('/api/mcp/tasks/recommendations', params, { userContext })
    → Next.js API → recommendation logic → response
```

When the Hub was later built, the recommendation engine was registered as a Hub catalog entry (`paichart-recommendation-engine`) so it would appear in `services(action: "discover")`. But it has **no handler in the InternalServiceRouter** — it's a catalog-only listing. The actual work still happens through the `analytics` platform tool.

**Result**: Dual identity — discoverable as a Hub service, but only callable as a platform tool.

### KPI Service (March 2026 — Hub-Native)

The KPI service was built after the Hub architecture was mature. It was designed from the start as a **Tier 2 internal Hub service**:

```
services(action: "call", targetService: "paichart-kpi-service", tool: "kpi",
         arguments: { action: "score", povId: "..." })
```

**Implementation path**:
```
services tool → Hub Call Handler → InternalServiceRouter.routeCall()
  → handleKPI(args, context)
    → apiClient.get('/api/pov/{povId}/kpi', {}, { userContext })
      → Next.js API → withPOVAccess → kpiService → response
```

It uses the HTTP piggyback pattern to inherit `withPOVAccess` from the REST endpoint, so access control is handled once in one place.

**Result**: Single identity — Hub-native, callable only through `services(action: "call")`.

### Comparison Table

| Aspect | Recommendation Engine | KPI Service |
|--------|----------------------|-------------|
| **Era** | Early 2025 (pre-Hub) | March 2026 (Hub-native) |
| **Tier** | Tier 1 (platform tool) | Tier 2 (internal Hub service) |
| **How to call** | `analytics(action: "recommendations.get")` | `services(action: "call", tool: "kpi")` |
| **Hub registration** | Catalog entry only (no handler) | Full handler in InternalServiceRouter |
| **InternalServiceRouter** | Not present | `handleKPI()` with 3 actions |
| **Auth pattern** | `apiClient.get(endpoint, params, { userContext })` | `apiClient.get(endpoint, {}, { userContext })` |
| **Access control** | Via REST API middleware | Via `withPOVAccess` on REST endpoint |
| **Workflow composable** | No (not a Hub service call) | Yes (can chain in workflows) |
| **Actions** | Single tool, single purpose | Single tool, 3 actions (score, history, evaluate) |

### Which Pattern to Use for New Services?

**Use Tier 2 (Hub-native)** when:
- The service should be discoverable and composable in workflows
- You want usage metrics and health monitoring through the Hub
- External AI clients (ChatGPT, Gemini) should be able to call it via the standard `services(action: "call")` pattern
- The service is read-only or has well-defined actions

**Use Tier 1 (platform tool)** when:
- The functionality is core to every user session (project, perform, search)
- It needs to be in `tools/list` for MCP protocol compliance (e.g., OAuth discovery)
- Maximum performance is critical (no Hub routing overhead)
- The tool is part of the platform's essential vocabulary

---

## Smoke Testing by Tier

| Tier | Smoke Test | Coverage |
|------|-----------|----------|
| Tier 1 | `pov-task-lifecycle-essentials-test.md` | project, perform |
| Tier 1 | `analytics-essentials-smoke-test.md` | analytics |
| Tier 1 | `search-fetch-cross-resource-essentials-test.md` | search, fetch |
| Tier 2 | `internal-service-router-essentials-test.md` | KPI, Project, Task services |
| Tier 2+3 | `hub-and-logging-essentials-test.md` | Hub register/discover/call, workflows |
| Tier 3 | `hub-security-resilience-test.md` | Trust levels, token forwarding |

---

## File Reference

| Component | File | Purpose |
|-----------|------|---------|
| Platform tool schemas | `lib/mcp/server/config/tool-schemas.js` | Tier 1 tool definitions |
| Internal service router | `lib/mcp/server/tools/internal/InternalServiceRouter.js` | Tier 2 dispatch |
| Hub call handler | `lib/mcp/server/tools/hub/service-call-handler.js` | Tier 2/3 routing |
| API client | `lib/mcp/server/utils/api-client.js` | HTTP calls for Tier 2 piggyback |
| Context enricher | `lib/mcp/server/middleware/context-enricher.js` | Token extraction for forwarding |
| Service registration | `scripts/register-internal-services.ts` | Tier 2 DB registration |
| Recommendations handler | `lib/mcp/server/tools/advanced/ai-recommendations-handler.js` | Tier 1 implementation |
| KPI handler | `InternalServiceRouter.js` → `handleKPI()` | Tier 2 implementation |
| KPI domain service | `lib/pov/services/kpi.ts` | Business logic |
| KPI API endpoint | `app/api/pov/[povId]/kpi/route.ts` | REST + withPOVAccess |
