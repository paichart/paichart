# MCP Hub Service Registration Technical Reference

> **Companion to**: `mcp-hub-integration-guide.md`
>
> **Version**: 1.4 | **Updated**: January 13, 2026 | **Contact**: <maintainer-email>

---

## Overview

This document provides comprehensive technical reference for registering **external MCP services** with the pAIchart Hub. It covers all parameters, transport options, capability formats, and configuration settings.

**Key Concept**: Users discover services by **capability** (monitoring, communication, automation), not by service name. When you register your service with appropriate capabilities, AI agents automatically find and use it when users request related functionality.

**Primary Guide**: See `mcp-hub-integration-guide.md` for architecture overview, security model, and getting started tutorial.

---

## Table of Contents

1. [Quick Registration](#quick-registration)
2. [Complete Parameter Reference](#complete-parameter-reference)
3. [Transport Options](#transport-options)
4. [Capabilities Formats](#capabilities-formats)
5. [Configuration Options](#configuration-options)
6. [Quality Grades](#quality-grades)
7. [Access Control](#access-control)
8. [Internal Service Registration (NEW)](#internal-service-registration-new)
9. [Complete Examples](#complete-examples)
10. [Post-Registration Operations](#post-registration-operations)
11. [Troubleshooting](#troubleshooting)

---

## Quick Registration

### Minimum Viable Registration

```
registry(action: "register")(
  name: "my-service",
  description: "What your service does (10-500 chars)",
  endpoint: "https://your-domain.com/mcp",
  category: "data-services"
)
```

### Recommended Registration (with Full Schemas)

```
registry(action: "register")(
  name: "my-service",
  description: "Comprehensive description of service capabilities",
  endpoint: "https://your-domain.com/mcp",
  category: "data-services",
  version: "1.0.0",
  capabilities: {
    tools: [
      {
        name: "my_tool",
        description: "What this tool does",
        inputSchema: {
          type: "object",
          properties: {
            param1: { type: "string", description: "Parameter description" }
          },
          required: ["param1"]
        }
      }
    ]
  }
)
```

---

## Complete Parameter Reference

### Required Parameters

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `name` | string | 1-100 chars, lowercase, hyphens allowed | Unique service identifier |
| `description` | string | 10-500 chars | Clear description of service functionality (see Description Usage below) |
| `endpoint` | string (URL) | Valid URL format | MCP endpoint URL |
| `category` | enum | See categories below | Service category for discovery |

### Description Usage

**How descriptions are used by different tools**:

| Tool | Description Usage | Details Shown |
|------|-------------------|---------------|
| `services(action: "discover")` | ✅ **Truncated** (first paragraph or 150 chars) | Brief summary for browsing |
| `registry(action: "tools")` | ✅ **Full** (complete description) | Complete documentation with WHEN TO USE, EXAMPLES, etc. |
| `services(action: "call")` | ❌ **Not used** (execution only) | Service executed by ID/name, description not read |
| `services(action: "workflow.execute")` | ❌ **Not used** (execution only) | Workflow steps reference services by ID/name only |

**Best Practice**: Write a clear first paragraph (80-150 chars) as your summary, then add details in subsequent paragraphs.

**Example**:
```
"Multi-channel notification routing service for email, Slack, and webhooks.

WHEN TO USE:
✅ Send task completion notifications
✅ Alert stakeholders on status changes
..."
```

**services(action: "discover") returns**: "Multi-channel notification routing service for email, Slack, and webhooks."
**registry(action: "tools") returns**: Full description including WHEN TO USE section

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `version` | string | "1.0.0" | Semantic version (e.g., "2.1.0") |
| `capabilities` | object | `{}` | Tools, resources, prompts |
| `authType` | enum | "NONE" | Authentication method |

### Categories

```
┌────────────────────┬─────────────────────────────────────────────┐
│ Category           │ Use For                                      │
├────────────────────┼─────────────────────────────────────────────┤
│ ai-intelligence    │ AI/ML services, inference, embeddings       │
│ data-services      │ Data APIs, weather, databases, analytics    │
│ automation         │ Browser automation, workflows, RPA          │
│ monitoring         │ Observability, logging, alerting, APM       │
│ communication      │ Notifications, email, SMS, chat             │
│ security           │ Auth, compliance, encryption (requires review) │
└────────────────────┴─────────────────────────────────────────────┘
```

**Note**: `security`, `authentication`, `payment`, `financial`, `medical`, `healthcare`, `government`, and `legal` categories require admin approval before activation.

### Authentication Types

```
┌───────────────┬───────────────────────────────────────────────────┐
│ authType      │ Description                                        │
├───────────────┼───────────────────────────────────────────────────┤
│ NONE          │ No authentication required (public service)        │
│ API_KEY       │ X-API-Key header authentication                   │
│ BEARER_TOKEN  │ JWT/OAuth Bearer token in Authorization header    │
│ OAUTH2        │ Full OAuth 2.0 authorization code flow            │
│ HMAC          │ HMAC signature-based authentication               │
└───────────────┴───────────────────────────────────────────────────┘
```

---

## Transport Options

The `endpoint` URL determines the transport protocol used for MCP communication.

### 1. Streamable HTTP (Recommended for External Services)

```
endpoint: "https://your-service.com/mcp"
endpoint: "https://api.company.com/mcp"
```

| Aspect | Details |
|--------|---------|
| **Protocol** | Standard HTTP with JSON-RPC |
| **Best For** | External services, serverless, corporate networks |
| **SDK Client** | `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js` |
| **Bidirectional** | Full request/response per call |
| **Firewall-Friendly** | Works through corporate proxies without VPN |
| **Scalable** | No persistent connections, perfect for serverless |

**Server Implementation Pattern**:
```typescript
import { StreamableHTTPTransport } from './transports/streamable-http.js';

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPTransport({ sessionId: req.sessionId });
  await transport.handleRequest(req, res, req.body);
});
```

### 2. SSE (Server-Sent Events) - For Internal/Local Services

```
endpoint: "https://your-service.com/sse"
endpoint: "http://localhost:3100/sse"
```

| Aspect | Details |
|--------|---------|
| **Protocol** | HTTP/HTTPS with SSE streaming |
| **Best For** | Internal Docker services, local development |
| **SDK Client** | `SSEClientTransport` from `@modelcontextprotocol/sdk/client/sse.js` |
| **Bidirectional** | Requires separate POST endpoint for client→server messages |
| **Limitations** | Blocked by many corporate firewalls, requires VPN |

**Server Implementation Pattern**:
```typescript
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// GET /sse - Establish SSE connection
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  await mcpServer.connect(transport);
});

// POST /message - Handle client messages
app.post('/message', async (req, res) => {
  await transport.handlePostMessage(req, res, req.body);
});
```

### Transport Selection Guide

```
┌──────────────────────────────┬─────────────┬────────────────────┐
│ Use Case                     │ Streamable  │ SSE                │
│                              │ HTTP        │                    │
├──────────────────────────────┼─────────────┼────────────────────┤
│ External services (internet) │ ✓✓          │ ✗ (VPN required)   │
│ Corporate networks           │ ✓✓          │ ✗ (firewall issues)│
│ Serverless deployment        │ ✓✓          │ ✓                  │
│ Simple request/response      │ ✓✓          │ ✓                  │
│ Internal Docker services     │ ✓           │ ✓✓                 │
│ Local development            │ ✓           │ ✓✓                 │
│ Load balancer friendly       │ ✓✓          │ ✓                  │
│ Real-time streaming updates  │ ✓           │ ✓✓                 │
└──────────────────────────────┴─────────────┴────────────────────┘

✓✓ = Recommended  ✓ = Supported  ✗ = Not Recommended
```

**Key Recommendation**: Use **Streamable HTTP** for external services (no VPN required, works through corporate firewalls). Use **SSE** only for internal Docker services on localhost where firewall traversal isn't needed.

> **Note**: WebSocket transport was removed in January 2026 due to security and performance concerns.

---

## Capabilities Formats

### Format 1: Simple (Legacy) - Grade C

Just tool names as strings. Quick to register but AI clients won't know what parameters to pass.

```json
{
  "capabilities": {
    "tools": ["get_forecast", "get_alerts", "get_current"],
    "resources": ["weather-data", "location-cache"],
    "prompts": ["weather-report", "storm-alert"]
  }
}
```

**Pros**:
- Quick registration
- Minimal setup
- Good for prototyping

**Cons**:
- AI clients can't discover parameters
- No validation guidance
- Lower quality grade (C)

### Format 2: Full Schema (Recommended) - Grade A

Complete tool definitions with JSON Schema for parameters.

```json
{
  "capabilities": {
    "tools": [
      {
        "name": "get_forecast",
        "description": "Get weather forecast for a location",
        "inputSchema": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City name or coordinates (e.g., 'San Francisco' or '37.7749,-122.4194')"
            },
            "days": {
              "type": "number",
              "description": "Number of forecast days (1-14)",
              "minimum": 1,
              "maximum": 14,
              "default": 7
            },
            "units": {
              "type": "string",
              "enum": ["celsius", "fahrenheit"],
              "default": "celsius",
              "description": "Temperature units"
            }
          },
          "required": ["location"]
        }
      },
      {
        "name": "get_alerts",
        "description": "Get active weather alerts for a region",
        "inputSchema": {
          "type": "object",
          "properties": {
            "region": {
              "type": "string",
              "description": "Region code (e.g., 'US-CA' for California)"
            },
            "severity": {
              "type": "string",
              "enum": ["all", "minor", "moderate", "severe", "extreme"],
              "default": "all"
            }
          },
          "required": ["region"]
        }
      }
    ],
    "resources": ["weather-data"],
    "prompts": ["weather-report"]
  }
}
```

**Pros**:
- AI clients discover parameters via `registry(action: "tools")`
- Better validation and documentation
- Enables proper `services(action: "call")` usage
- Grade A quality rating

**Cons**:
- More verbose registration
- Requires upfront schema design

### inputSchema Best Practices

```json
{
  "type": "object",
  "properties": {
    // String with description
    "name": {
      "type": "string",
      "description": "User's full name",
      "minLength": 1,
      "maxLength": 100
    },

    // Enum (dropdown choices)
    "priority": {
      "type": "string",
      "enum": ["low", "normal", "high", "urgent"],
      "default": "normal",
      "description": "Message priority level"
    },

    // Number with constraints
    "count": {
      "type": "number",
      "minimum": 1,
      "maximum": 100,
      "default": 10,
      "description": "Number of items to return"
    },

    // Boolean
    "includeMetadata": {
      "type": "boolean",
      "default": false,
      "description": "Include additional metadata in response"
    },

    // Array
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Filter by tags"
    },

    // Nested object
    "options": {
      "type": "object",
      "properties": {
        "format": { "type": "string", "enum": ["json", "xml", "csv"] },
        "compress": { "type": "boolean" }
      }
    }
  },
  "required": ["name"]
}
```

---

## Configuration Options

After registration, additional configuration can be set via `registry(action: "update")`:

```javascript
registry(action: "update")({
  service_name: "my-service",
  updates: {
    // Operational Settings (NEW - January 2026)
    healthCheckPath: "/api/status",    // Custom health check path (default: "/health")

    rateLimit: {                       // Rate limiting (flat structure)
      requests: 100,                   // Max requests per window
      windowMs: 60000                  // Window size in ms (1 minute)
    },

    maxExecutionTime: 45000,           // Max execution time in ms (default: 30000)

    // Access Control (NEW - January 2026)
    permissions: {
      publicAccess: true               // Allow any authenticated user (default: false)
    }
  }
})
```

### Configuration Fields Reference

**Structure Explained**: Fields are organized by **semantic purpose**:
- **Flat fields**: Operational settings (HOW service operates)
- **Nested under permissions**: Access control (WHO can access)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `healthCheckPath` | string | "/health" | Custom health check endpoint path |
| `rateLimit.requests` | number | 100 | Max requests per window |
| `rateLimit.windowMs` | number | 60000 | Rate limit window in ms |
| `maxExecutionTime` | number | 30000 | Max execution time in ms (enforced) |
| `permissions.publicAccess` | boolean | `false` | Allow any authenticated user to call |

**Why the separation**:
- **Operational settings** (`rateLimit`, `maxExecutionTime`) control how the Hub manages your service (timeouts, throttling)
- **Access control** (`publicAccess`) controls who can discover and call your service
- This semantic separation makes it clear what each field does and where to find it

### How Rate Limiting Works

The Hub enforces rate limits **before** calling your service:

```
User Request → Hub Rate Limit Check → Your Service
                     ↓
              If exceeded: 429 with retry-after
              If allowed: Forward to service
```

**Response when rate limited:**
```
⏱️ Rate Limit Exceeded: You've exceeded the rate limit for service "my-service".
Limit: 100 requests per 60s. Retry in 45s or contact the service owner to increase limits.
```

### How maxExecutionTime Works

The Hub enforces execution timeouts using `Promise.race`:

```javascript
// Internal enforcement (service-call-handler.js)
const response = await Promise.race([
  client.callTool({ name: tool, arguments: args }),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), maxExecutionTime)
  )
]);
```

If your service takes longer than `maxExecutionTime`, the call is aborted and an error is returned.

---

## Quality Grades

The Hub automatically assesses service quality based on tool schema completeness. Check via `registry(action: "tools")`:

```
┌───────┬─────────────────────────────────────────────────────────────┐
│ Grade │ Criteria                                                     │
├───────┼─────────────────────────────────────────────────────────────┤
│   A   │ All tools have full inputSchema                             │
│       │ ✓ AI clients can discover all parameters                    │
│       │ ✓ Best integration experience                               │
├───────┼─────────────────────────────────────────────────────────────┤
│   B   │ Some tools have inputSchema (partial)                       │
│       │ ⚠ Some tools lack parameter documentation                   │
│       │ → Upgrade by adding missing schemas                         │
├───────┼─────────────────────────────────────────────────────────────┤
│   C   │ Legacy registration - tool names only                       │
│       │ ⚠ AI clients don't know what parameters to pass             │
│       │ → Re-register with full tool definitions                    │
├───────┼─────────────────────────────────────────────────────────────┤
│   D   │ No tools registered                                         │
│       │ ⚠ Service provides no callable functionality                │
│       │ → Add tools to enable AI client interaction                 │
└───────┴─────────────────────────────────────────────────────────────┘
```

### Checking Your Grade

```
registry(action: "tools", service_name: "my-service")

// Response includes:
{
  "qualityAssessment": {
    "grade": "A",
    "schemaQuality": "full",
    "toolsWithSchema": 5,
    "totalTools": 5,
    "message": "All tools have full parameter schemas - excellent AI client compatibility"
  }
}
```

### Upgrading from Grade C to A

**Before (Grade C)**:
```
capabilities: { tools: ["send", "broadcast"] }
```

**After (Grade A)**:
```
capabilities: {
  tools: [
    {
      name: "send",
      description: "Send a notification to a single recipient",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["email", "sms", "push"] },
          recipient: { type: "string" },
          message: { type: "string" }
        },
        required: ["channel", "recipient", "message"]
      }
    },
    {
      name: "broadcast",
      description: "Send notification to multiple recipients",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["email", "sms", "push"] },
          recipients: { type: "array", items: { type: "string" } },
          message: { type: "string" }
        },
        required: ["channel", "recipients", "message"]
      }
    }
  ]
}
```

---

## Access Control

### Who Can Call Your Service?

Access is determined by `checkServiceAccess()`:

```
┌─────────────────────────────┬────────────────────────────────────────┐
│ Check (in order)            │ Result                                  │
├─────────────────────────────┼────────────────────────────────────────┤
│ publicAccess: true          │ ✓ Any authenticated user can call      │
│ User is service owner       │ ✓ Owner always has access              │
│ User is Hub admin           │ ✓ Admins always have access            │
│ None of the above           │ ✗ Access denied                        │
└─────────────────────────────┴────────────────────────────────────────┘
```

### Making Your Service Public

**During Registration** (not supported - services start private):
```
// Services always start with permissions.publicAccess: false
```

**After Registration**:
```
registry(action: "update")(
  service_name: "my-service",
  updates: { permissions: { publicAccess: true } }
)
```

### Access Control Matrix

| Scenario | Owner | Admin | Authenticated User | Anonymous |
|----------|-------|-------|-------------------|-----------|
| `publicAccess: false` | ✓ | ✓ | ✗ | ✗ |
| `publicAccess: true` | ✓ | ✓ | ✓ | ✗ |

**Note**: Anonymous access is never allowed. All users must authenticate with the Hub.

---

## Internal Service Registration (pAIchart-Specific)

> **Note**: This section documents pAIchart's internal services. External service integrators can skip this section.
> **Updated**: March 2026 — Added recommendation-engine and kpi-service.
> **Creation Guide**: See `/.claude/knowledge/patterns/internal-service-gold-standard-pattern.md` for step-by-step creation pattern.

pAIchart exposes internal platform tools as domain-grouped services through the Hub. These services use direct handler invocation (no HTTP calls) for zero-latency internal routing.

### Registered Internal Services

| Service ID | Name | Category | Tools | Endpoint | Status |
|------------|------|----------|-------|----------|--------|
| `paichart-project-service` | pAIchart Project Service | data-services | project, perform | `internal://project` | Active |
| `paichart-recommendation-engine` | pAIchart Recommendation Engine | ai-intelligence | (system tool — FK target for recommendations) | `internal://recommendation-engine` | Active (Phase 1.5) |
| `paichart-kpi-service` | pAIchart KPI Service | ai-intelligence | kpi (score/history/evaluate) | `internal://kpi-service` | Active |

**Service types**:
- **Routable** (`paichart-project-service`, `paichart-kpi-service`): Registered in `InternalServiceRouter.serviceToolMap`, callable via `services(action: "call")`
- **System** (`paichart-recommendation-engine`): DB FK target only, not directly callable via MCP. Used as `toolId` for `MCPRecommendation` records.

**Registration script**: `scripts/register-internal-services.ts` — run with `npx ts-node scripts/register-internal-services.ts`

### How Internal Services Work

```
services(action: "call", targetService: "paichart-kpi-service", tool: "kpi", arguments: {...})
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   ServiceCallHandler.handle()  │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │  Is Internal Service?          │
                    │  (endpoint: 'internal://...')   │
                    └───────────────┬───────────────┘
                                    │
              YES ─────────────────┴─────────────────── NO
                │                                         │
                ▼                                         ▼
   ┌─────────────────────────┐           ┌─────────────────────────┐
   │  InternalServiceRouter   │           │  HTTP/SSE Connection    │
   │  serviceToolMap lookup   │           │  ServiceConnectionPool  │
   │  ~0ms latency            │           │  ~100-200ms latency     │
   └────────────┬────────────┘           └─────────────────────────┘
                │
    ┌───────────┴───────────┐
    │  Dual-Mode Routing    │
    ├───────────────────────┤
    │  Web UI context:      │
    │   Direct TypeScript   │
    │   service calls       │
    │   (zero HTTP)         │
    ├───────────────────────┤
    │  MCP server context:  │
    │   HTTP API fallback   │
    │   (inherits auth)     │
    └───────────────────────┘
```

**Dual-mode routing**: `InternalServiceRouter` detects whether it's running inside Next.js (web UI) or standalone MCP server. In web context, it calls TypeScript services directly (zero latency). In MCP server context, it falls back to HTTP API calls (inherits `requirePermission` + IDOR checks).

### Calling Internal Services

Internal services are called the same way as external services:

```
// Project data
services(action: "call", targetService: "paichart-project-service", tool: "project", arguments: { action: "pov.list", status: "IN_PROGRESS" })

// KPI scoring
services(action: "call", targetService: "paichart-kpi-service", tool: "kpi", arguments: { action: "score", povId: "cmgalsi2m..." })

// KPI evaluation (triggers recalculation)
services(action: "call", targetService: "paichart-kpi-service", tool: "kpi", arguments: { action: "evaluate", povId: "cmgalsi2m..." })
```

### Service Name Aliases

Internal services support **name aliases** for flexible lookups:

| Internal Name (Routing) | Display Name (Database) |
|------------------------|------------------------|
| `paichart-project-service` | `pAIchart Project Service` |
| `paichart-recommendation-engine` | `pAIchart Recommendation Engine` |
| `paichart-kpi-service` | `pAIchart KPI Service` |

```
services(action: "health", service_name: "paichart-kpi-service")        // Internal name
services(action: "health", service_name: "pAIchart KPI Service")        // Display name
registry(action: "tools", service_name: "paichart-project-service")     // Internal name
registry(action: "tools", service_name: "pAIchart Project Service")     // Display name
```

The alias resolution happens automatically. Lookup order:
1. Try exact match on provided name
2. If no match, resolve alias (internal ↔ display name)
3. Try fuzzy search on resolved name

**Benefits of internal routing**:
- Zero network latency (same process, direct handler call)
- No HTTP connection overhead
- Instant health checks (always healthy)
- Same authentication/authorization model as external services
- Dual-mode: TypeScript direct calls in web UI, HTTP fallback in MCP server

### Health Checks for Internal Services

Internal services are always reported as healthy since they run in the same process:

```
services(action: "health", service_name: "paichart-project-service")

// Returns:
{
  service: "pAIchart POV Service",
  status: "healthy",
  type: "internal",
  message: "Internal service (same process - always available)",
  responseTime: 0,
  storedMetrics: {
    version: "1.0.0",
    status: "ACTIVE",
    uptimePercent: "100.0%"
  }
}
```

### Registration Script

Internal services are registered via:

```bash
npm run mcp:register-internal
```

This runs `scripts/register-internal-services.ts` which upserts the service definitions in the database.

### Internal vs Docker Services

The MCP Hub supports both patterns:

| Aspect | Internal Services | Docker Services |
|--------|------------------|-----------------|
| **Endpoint** | `internal://service-name` | `http://localhost:PORT/sse` |
| **Transport** | Direct handler invocation | HTTP/SSE network call |
| **Process** | Same process as Hub | Separate Docker container |
| **Latency** | ~0ms | ~100-200ms |
| **Health Check** | Instant (same process) | HTTP `/health` endpoint |
| **Use Case** | pAIchart core tools | External/isolated services |

**Examples**:
- **Internal**: `paichart-project-service`, `paichart-project-service`
- **Docker**: `browser-automation-service`, `notification-service`, `sentry-mcp`

Both coexist without conflict. The routing decision is automatic based on the service configuration.

---

## Complete Examples

### Example 1: Alpha Vantage (Financial Data - Streamable HTTP)

**Real-world production service using Streamable HTTP transport.**

```
registry(action: "register")(
  name: "alpha-vantage-market-data",
  description: "Official Alpha Vantage MCP server providing 100+ tools for real-time and historical stock market data, including equity prices, options, forex, crypto, commodities, economic indicators, and 40+ technical analysis indicators.",
  endpoint: "https://mcp.alphavantage.co/mcp?apikey=YOUR_API_KEY",
  category: "data-services",
  version: "1.0.0",
  authType: "NONE",
  capabilities: {
    tools: [
      {
        name: "TOOL_CALL",
        description: "Execute any Alpha Vantage API tool by name",
        inputSchema: {
          type: "object",
          properties: {
            tool_name: {
              type: "string",
              description: "Tool name (e.g., 'GLOBAL_QUOTE', 'TIME_SERIES_DAILY')"
            },
            arguments: {
              type: "string",
              description: "JSON string of tool arguments"
            }
          },
          required: ["tool_name", "arguments"]
        }
      },
      {
        name: "TOOL_LIST",
        description: "List all available Alpha Vantage API tools",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "TOOL_GET",
        description: "Get full schema for a specific tool",
        inputSchema: {
          type: "object",
          properties: {
            tool_name: { type: "string" }
          },
          required: ["tool_name"]
        }
      }
    ],
    resources: ["market-data", "fundamental-data", "economic-data"]
  }
)
```

**Why Streamable HTTP**:
- ✅ Works globally without VPN
- ✅ Firewall-friendly for corporate networks
- ✅ Perfect for serverless (AWS Lambda deployment)
- ✅ API key passed in URL query parameter

**Tested**: Production-ready, returns real market data in ~750ms.

### Example 2: Weather API (Data Service)

```
registry(action: "register")(
  name: "global-weather-api",
  description: "Real-time weather forecasts, alerts, and historical data for any location worldwide. Supports multiple units and languages.",
  endpoint: "https://api.myweather.com/mcp",
  category: "data-services",
  version: "2.0.0",
  authType: "API_KEY",
  capabilities: {
    tools: [
      {
        name: "get_current",
        description: "Get current weather conditions",
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name, coordinates, or airport code"
            },
            units: {
              type: "string",
              enum: ["metric", "imperial"],
              default: "metric"
            }
          },
          required: ["location"]
        }
      },
      {
        name: "get_forecast",
        description: "Get weather forecast",
        inputSchema: {
          type: "object",
          properties: {
            location: { type: "string" },
            days: { type: "number", minimum: 1, maximum: 14, default: 7 },
            hourly: { type: "boolean", default: false }
          },
          required: ["location"]
        }
      },
      {
        name: "get_alerts",
        description: "Get active weather alerts",
        inputSchema: {
          type: "object",
          properties: {
            region: { type: "string", description: "Region code (e.g., US-CA)" },
            severity: { type: "string", enum: ["all", "minor", "moderate", "severe", "extreme"] }
          },
          required: ["region"]
        }
      }
    ],
    resources: ["weather-data", "historical-archive"],
    prompts: ["daily-briefing", "storm-tracker"]
  }
)
```

### Example 2: Notification Hub (Communication)

```
registry(action: "register")(
  name: "enterprise-notification-hub",
  description: "Multi-channel notifications with delivery tracking, templates, and scheduling. Supports email, Slack, SMS, push, and webhooks.",
  endpoint: "https://notify.company.com/sse",
  category: "communication",
  version: "3.1.0",
  authType: "BEARER_TOKEN",
  capabilities: {
    tools: [
      {
        name: "send_notification",
        description: "Send notification to a single recipient",
        inputSchema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              enum: ["email", "slack", "sms", "push", "webhook"],
              description: "Delivery channel"
            },
            recipient: {
              type: "string",
              description: "Email, phone, Slack channel, or endpoint URL"
            },
            message: {
              type: "object",
              properties: {
                subject: { type: "string" },
                body: { type: "string" },
                priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
                templateId: { type: "string" }
              },
              required: ["body"]
            },
            schedule: {
              type: "string",
              format: "date-time",
              description: "ISO 8601 datetime for scheduled delivery"
            }
          },
          required: ["channel", "recipient", "message"]
        }
      },
      {
        name: "broadcast",
        description: "Send notification to multiple recipients",
        inputSchema: {
          type: "object",
          properties: {
            channels: {
              type: "array",
              items: { type: "string", enum: ["email", "slack", "sms", "push"] }
            },
            recipients: {
              type: "object",
              properties: {
                email: { type: "array", items: { type: "string" } },
                slack: { type: "array", items: { type: "string" } },
                sms: { type: "array", items: { type: "string" } }
              }
            },
            message: {
              type: "object",
              properties: {
                subject: { type: "string" },
                body: { type: "string" }
              },
              required: ["body"]
            }
          },
          required: ["channels", "message"]
        }
      },
      {
        name: "get_delivery_status",
        description: "Check delivery status of a notification",
        inputSchema: {
          type: "object",
          properties: {
            notificationId: { type: "string", description: "Notification ID from send response" }
          },
          required: ["notificationId"]
        }
      }
    ],
    resources: ["delivery-logs", "templates", "analytics"],
    prompts: ["compose-message", "schedule-campaign"]
  }
)
```

### Example 3: Browser Automation (Automation)

```
registry(action: "register")(
  name: "browser-automation-pro",
  description: "On-demand browser automation for web scraping, form filling, screenshots, and PDF generation. Runs headless Chrome with full JavaScript support.",
  endpoint: "http://automation-cluster.internal:3100/sse",
  category: "automation",
  version: "1.5.0",
  authType: "NONE",
  capabilities: {
    tools: [
      {
        name: "scrape_page",
        description: "Extract structured data from a web page using CSS selectors",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri" },
            selectors: {
              type: "object",
              description: "Map of field names to CSS selectors",
              additionalProperties: { type: "string" }
            },
            waitFor: {
              type: "string",
              description: "CSS selector to wait for before scraping"
            },
            timeout: {
              type: "number",
              default: 30000,
              description: "Page load timeout in ms"
            }
          },
          required: ["url"]
        }
      },
      {
        name: "take_screenshot",
        description: "Capture screenshot of a web page",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri" },
            fullPage: { type: "boolean", default: false },
            viewport: {
              type: "object",
              properties: {
                width: { type: "number", default: 1280 },
                height: { type: "number", default: 720 }
              }
            },
            format: { type: "string", enum: ["png", "jpeg", "webp"], default: "png" }
          },
          required: ["url"]
        }
      },
      {
        name: "fill_form",
        description: "Fill and submit a web form",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri" },
            fields: {
              type: "object",
              description: "Map of field selectors to values",
              additionalProperties: { type: "string" }
            },
            submitSelector: {
              type: "string",
              description: "CSS selector for submit button"
            },
            waitAfterSubmit: {
              type: "number",
              default: 5000,
              description: "Wait time after submit in ms"
            }
          },
          required: ["url", "fields"]
        }
      },
      {
        name: "generate_pdf",
        description: "Generate PDF from a web page",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri" },
            format: { type: "string", enum: ["A4", "Letter", "Legal"], default: "A4" },
            landscape: { type: "boolean", default: false },
            printBackground: { type: "boolean", default: true }
          },
          required: ["url"]
        }
      }
    ]
  }
)
```

### Example 4: AI Analytics (AI Intelligence)

```
registry(action: "register")(
  name: "ai-analytics-engine",
  description: "Advanced AI analytics including sentiment analysis, entity extraction, summarization, and classification. Powered by fine-tuned models.",
  endpoint: "https://ai.analytics.company.com/mcp",
  category: "ai-intelligence",
  version: "2.0.0",
  authType: "OAUTH2",
  capabilities: {
    tools: [
      {
        name: "analyze_sentiment",
        description: "Analyze sentiment of text",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", maxLength: 10000 },
            language: { type: "string", default: "en" },
            granularity: { type: "string", enum: ["document", "sentence"], default: "document" }
          },
          required: ["text"]
        }
      },
      {
        name: "extract_entities",
        description: "Extract named entities from text",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            types: {
              type: "array",
              items: { type: "string", enum: ["PERSON", "ORG", "LOCATION", "DATE", "MONEY", "PRODUCT"] }
            }
          },
          required: ["text"]
        }
      },
      {
        name: "summarize",
        description: "Generate summary of text",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            maxLength: { type: "number", default: 200 },
            style: { type: "string", enum: ["bullet", "paragraph", "headline"], default: "paragraph" }
          },
          required: ["text"]
        }
      },
      {
        name: "classify",
        description: "Classify text into categories",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            categories: {
              type: "array",
              items: { type: "string" },
              description: "List of possible categories"
            },
            multiLabel: { type: "boolean", default: false }
          },
          required: ["text", "categories"]
        }
      }
    ],
    resources: ["model-catalog", "training-data"],
    prompts: ["batch-analysis", "custom-model-training"]
  }
)
```

---

## Post-Registration Operations

### Verify Registration

```
# 1. Check it appears in discovery
services(action: "discover", capability: "weather")

# 2. Check your service list
registry(action: "list")()

# 3. Verify tool schemas
registry(action: "tools", service_name: "my-service")

# 4. Check health monitoring
services(action: "health", service_name: "my-service")
```

### Update Service

```
# Update description
registry(action: "update")(
  service_name: "my-service",
  updates: { description: "Updated description with new features" }
)

# Update capabilities (add new tool)
registry(action: "update")(
  service_name: "my-service",
  updates: { capabilities: { tools: [...] } }
)

# Enable public access
registry(action: "update")(
  service_name: "my-service",
  updates: { permissions: { publicAccess: true } }
)

# Set rate limiting (100 requests per minute) - flat structure
registry(action: "update")(
  service_name: "my-service",
  updates: { rateLimit: { requests: 100, windowMs: 60000 } }
)

# Set custom health check path
registry(action: "update")(
  service_name: "my-service",
  updates: { healthCheckPath: "/api/health" }
)

# Set max execution time (45 seconds) - flat structure
registry(action: "update")(
  service_name: "my-service",
  updates: { maxExecutionTime: 45000 }
)

# Change status
registry(action: "update")(
  service_name: "my-service",
  updates: { status: "MAINTENANCE" }
)
```

### Status Values

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Service is operational and discoverable |
| `INACTIVE` | Service is registered but not accepting calls |
| `MAINTENANCE` | Temporarily unavailable for maintenance |
| `DEPRECATED` | Service will be removed soon |

### Delete Service

```
registry(action: "delete")(
  service_name: "my-service",
  confirm: true
)
```

**What gets deleted**: Registration, configuration, health history, metrics, metadata.

**What's retained**: Anonymized audit logs (90 days for compliance).

---

## Troubleshooting

### Common Registration Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Service name already registered" | Duplicate name | Choose unique name |
| "Invalid endpoint URL" | Malformed URL | Use full URL with protocol |
| "Category required" | Missing category | Add valid category enum |
| "Description too short" | < 10 characters | Provide meaningful description |
| "Authentication required" | Not logged in | Authenticate via OAuth/API key |

### Service Not Discoverable

1. Check status is `ACTIVE`:
   ```
   registry(action: "list")()
   ```

2. Verify category matches search:
   ```
   services(action: "discover", category: "data-services")
   ```

3. Check for approval requirement (high-risk categories)

### services(action: "call") Access Denied

```
Error: "Access Denied: You don't have permission to access this MCP service"
```

**Solutions**:
1. Service owner needs to enable `publicAccess: true`
2. Or service owner adds you to explicit permissions (future)
3. Or request admin access

### services(action: "call") Blocked by Compliance

```
Error: "Service call blocked by compliance policy: Tool 'X' is not in the approved tools whitelist"
```

**Solutions**:
1. Register the tool in your service's `capabilities.tools` (dynamic approval)
2. Use a standard tool name from the pre-approved list (static approval)
3. Avoid blocked patterns in tool names (delete, exec, admin, etc.)

> See [MCP Hub Security Policy](./mcp-hub-security-policy.md) for complete list of pre-approved tools and blocked patterns.

### Quality Grade Lower Than Expected

```
registry(action: "tools", service_name: "my-service")
```

Check `qualityAssessment.toolsMissingSchemas` to see which tools need `inputSchema` added.

---

## Related Documentation

- **Integration Guide**: `mcp-hub-integration-guide.md` - Architecture, security, getting started
- **Security Policy**: `mcp-hub-security-policy.md` - Tool approval, blocked patterns, compliance
- **MCP SDK**: `@modelcontextprotocol/sdk` - Official MCP SDK documentation

---

## Changelog

- **v1.5** (January 23, 2026): Field Location Standardization (BREAKING API CHANGE)
  - **BREAKING**: Flattened `rateLimit` and `maxExecutionTime` in registry(action: "update") API
  - OLD: `updates: { permissions: { rateLimit: {...}, maxExecutionTime: 45000 } }`
  - NEW: `updates: { rateLimit: {...}, maxExecutionTime: 45000, permissions: { publicAccess: true } }`
  - Semantic correction: Operational settings (HOW) vs access control (WHO)
  - Storage: `publicAccess` in permissions column, operational settings in configuration column
  - Impact: External API callers must update structure (API is 2 weeks old, minimal impact)
  - Updated all examples and field reference table
  - Added semantic explanation (WHO vs HOW)

- **v1.4** (January 13, 2026): External Service Focus
  - CLARIFIED: Overview emphasizes external MCP services and capability-based discovery
  - UPDATED: Internal service section marked as pAIchart-specific, not required for external integrators
  - EMPHASIS: Users discover services by capability, not service name

- **v1.3** (January 12, 2026): Service Name Aliases
  - NEW: "Service Name Aliases" section for internal service lookups
  - Added alias table mapping internal names to display names
  - Documented alias resolution order in services(action: "health") and registry(action: "tools")
  - Verified via Feature Domain Testing (Domain 2: Service Discovery - all PASS)

- **v1.2** (January 11, 2026): Internal Service Registration
  - NEW: Internal service registration section with `internal://` endpoints
  - NEW: paichart-project-service and paichart-project-service documented
  - NEW: InternalServiceRouter architecture diagram
  - Added comparison: Internal vs Docker services
  - Added registration script: `npm run mcp:register-internal`

- **v1.1** (January 8, 2026): Permissions & Configuration Update
  - Added `healthCheckPath` parameter for custom health endpoints
  - Added `permissions` object with `publicAccess`, `rateLimit`, `maxExecutionTime`
  - Documented rate limiting enforcement (requests + windowMs)
  - Documented maxExecutionTime enforcement (Promise.race pattern)
  - **Removed WebSocket transport** (security/performance concerns)
  - Updated all examples to use new `updates` object structure

- **v1.0** (January 2026): Initial release
  - Complete parameter reference
  - Transport options (SSE, HTTP)
  - Capabilities formats (legacy vs full schema)
  - Quality grades system
  - Configuration options
  - Complete registration examples
