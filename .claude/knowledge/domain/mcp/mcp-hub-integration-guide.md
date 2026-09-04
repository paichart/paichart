# pAIchart MCP Hub Integration Guide

> **Build MCP Services That Connect to the pAIchart AI Orchestration Hub**
>
> Version 1.4 | January 13, 2026 | Contact: steve.terry@paichart.com

---

## Connect Your AI Services to the World

**[paichart.app/mcp](https://paichart.app/mcp)** - See instructions on how to register your MCP server, call and track services and run service to service workflows (sequential, parallel etc):

**[paichart.app](https://paichart.app)** - See instructions on how to use ChatGPT / Claude /Gemini to chat to your service

| Platform | Access Method |
|----------|---------------|
| **ChatGPT** | Via pAIchart's OpenAI-compatible connector |
| **Claude** | Via Claude Desktop or Claude Code |
| **Gemini** | Via pAIchart's Google AI connector |
| **Custom AI Agents** | Via MCP protocol (SSE or Streamable HTTP) |
| **Webhooks** | Event-driven triggers (planned) |
| **Scheduled Jobs** | Cron-style automation (planned) |

**How it works**:
1. You register your MCP server with pAIchart Hub
2. Users authenticate with pAIchart (OAuth or API key)
3. Users call your service or run workflows through ChatGPT, Claude, or Gemini
4. The Hub routes requests to your MCP server securely

**Authentication Options** (for users calling your service):
- **OAuth 2.0**: Sign in with Microsoft, Google, or GitHub
- **API Keys**: Generate keys for programmatic access
- **JWT Tokens**: Enterprise SSO integration

**Transport Recommendation** (NEW - January 2026):
- **Streamable HTTP** (`/mcp` endpoint): ✅ **Recommended for external services**
  - Works through corporate firewalls without VPN
  - Perfect for serverless deployments (AWS Lambda, Cloudflare Workers)
  - Standard HTTP POST - universally compatible
- **SSE** (`/sse` endpoint): For internal Docker services only
  - Requires VPN for external access (corporate firewalls block long-lived connections)
  - Better for real-time streaming on trusted networks

---

## See It In Action

Here's what your users can do through ChatGPT, Claude, or Gemini once your service is registered:

### Example 1: Browser Automation Service

**User prompt in ChatGPT:**
> "Scrape the pricing table from competitor.com and take a screenshot"

**What happens:**
```
ChatGPT → pAIchart Hub → browser-automation-service

services(action: "call")({
  targetService: "browser-automation-service",
  tool: "scrape_page",
  arguments: {
    url: "https://competitor.com/pricing",
    selectors: { prices: ".pricing-tier", features: ".feature-list" }
  }
})

services(action: "call")({
  targetService: "browser-automation-service",
  tool: "take_screenshot",
  arguments: { url: "https://competitor.com/pricing", fullPage: true }
})
```

**User receives:** Structured pricing data + full-page screenshot

---

### Example 2: Notification Service

**User prompt in ChatGPT:**
> "Send a Slack alert to #sales and email the team about the new lead from Acme Corp"

**What happens:**
```
ChatGPT → pAIchart Hub → notification-service

services(action: "call")({
  targetService: "notification-service",
  tool: "broadcast",
  arguments: {
    channels: ["slack", "email"],
    message: "New lead from Acme Corp!",
    recipients: {
      slack: "#sales",
      email: ["sales-team@company.com"]
    },
    priority: "high"
  }
})
```

**User receives:** Confirmation that notifications were sent to both channels

---

### Example 3: Multi-Service Workflow

**User prompt in ChatGPT:**
> "Check our website for broken links, and if any are found, notify the dev team on Slack"

**What happens (orchestrated by Hub):**
```
1. browser-automation-service.scrape_page → Find all links
2. browser-automation-service.run_script → Check each link status
3. IF broken links found:
   notification-service.send → Alert #dev-team on Slack
```

**User receives:** Report of broken links + confirmation dev team was notified

---

### What This Means For You

When you register your MCP service with pAIchart Hub:
- **Users describe what they want**, not which service to use
- **AI discovers your service** by capability matching (monitoring, communication, automation, etc.)
- The AI figures out which tools to call
- Your service handles the actual work
- Users get structured, actionable results

**Users don't need to know your service name.** They say "notify the team" and AI discovers your notification service. They say "check for errors" and AI finds your monitoring service.

**You build the capability. We make it discoverable.**

---

## What is pAIchart Hub?

pAIchart Hub is an **AI service orchestration platform** that enables:
- **Service Discovery**: Your MCP service becomes discoverable by AI agents
- **Cross-Service Communication**: AI agents can orchestrate calls across multiple services
- **Enterprise Security**: Authentication, authorization, and Anthropic-compliant content filtering
- **Usage Analytics**: Track how your service is being used

**The Hub acts as a secure proxy** - your service endpoint is never exposed directly to end users.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        pAIchart Hub                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ Discovery   │    │ Orchestration│    │ Compliance Layer     │   │
│  │ Registry    │    │ Engine       │    │ (Anthropic MCP)      │   │
│  └─────────────┘    └──────────────┘    └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                      │
         │  MCP Protocol (SSE / Streamable HTTP)
         │                    │                      │
         ▼                    ▼                      ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐
│ Your Service │    │ Weather API  │    │ Browser Automation       │
│ (Private)    │    │ (Public)     │    │ Service (Internal)       │
└──────────────┘    └──────────────┘    └──────────────────────────┘
```

**Key Insight**: Your service runs privately (cloud, on-premise, or local). The Hub connects to it - you don't need to expose it to the internet if you use a VPN or private network peering.

---

## Security & Permissions Model

### Your Service Endpoint is Protected

When you register a service, **the endpoint you provide is NOT shared with users**. The Hub:
1. Validates all incoming requests (authentication, rate limiting)
2. Applies Anthropic compliance filters (content safety, blocked patterns)
3. Connects to your service on your behalf
4. Returns sanitized responses

### Access Control Options

| Setting | Who Can Use Your Service |
|---------|-------------------------|
| `publicAccess: false` (default) | Only you (the owner) and Hub admins |
| `publicAccess: true` | Any authenticated Hub user |
| Future: Explicit permissions | Specific users/organizations you approve |

```javascript
// Register with private access (default)
registry(action: "register")({
  name: 'my-weather-api',
  endpoint: 'https://api.mycompany.com/weather'
  // Services start private by default
});

// Later, make it public
registry(action: "update")({
  service_name: 'my-weather-api',
  updates: { permissions: { publicAccess: true } }
});
```

### Rate Limiting & Execution Timeouts (NEW - January 2026)

You can protect your service with Hub-enforced limits:

```javascript
registry(action: "update")({
  service_name: 'my-weather-api',
  updates: {
    // Custom health check path
    healthCheckPath: '/api/status',

    permissions: {
      // Rate limiting (enforced by Hub before calling your service)
      rateLimit: {
        requests: 100,    // Max 100 requests
        windowMs: 60000   // Per minute
      },

      // Execution timeout (enforced with Promise.race)
      maxExecutionTime: 30000  // 30 seconds max
    }
  }
});
```

**How it works:**
- Rate limits are checked **before** your service is called
- Execution timeouts abort long-running calls automatically
- Both protect your service from abuse without code changes

### Endpoint Privacy Options

| Your Setup | Exposure Level |
|------------|---------------|
| Public HTTPS endpoint | Hub connects over internet (encrypted) |
| VPN/Private peering | Hub connects privately (enterprise) |
| Localhost (internal only) | Hub connects internally (pAIchart-managed services only) |

---

## Anthropic Compliance

pAIchart Hub implements comprehensive **Anthropic MCP compliance** to ensure safe AI interactions:

### Content Filtering
- **Prohibited content detection**: Harmful instructions, hate speech, malicious code
- **Personal information protection**: SSN, credit cards, API keys automatically redacted
- **Response sanitization**: Sensitive paths and tokens filtered from responses

### Service Call Policy

Every cross-service call is validated for:
- **Tool whitelist**: Only approved tool names can be called (static + dynamic approval)
- **Blocked patterns**: Shell commands, SQL injection, path traversal blocked
- **Parameter size limits**: 100KB max parameters, 1MB max response
- **Call depth limits**: Prevents infinite service chains (max 3 deep)

> **Full Documentation**: See [MCP Hub Security Policy](./mcp-hub-security-policy.md) for complete details on:
> - Two-tier tool approval system (50+ pre-approved tools + your registered tools)
> - All blocked patterns and URL restrictions
> - How to get custom tools approved
> - Troubleshooting compliance errors

### Compliance Monitoring
All security events are logged:
- Blocked service calls
- Registration rejections
- Content filter activations
- Rate limit violations

```
Risk Levels: LOW → MEDIUM → HIGH → CRITICAL
Alert thresholds: 10 critical events/hour triggers alerts
```

### Service Approval Policy
High-risk service categories require additional review:
- `security`, `authentication`, `payment`, `financial`
- `medical`, `healthcare`, `government`, `legal`

Standard categories are auto-approved:
- `data-services`, `automation`, `monitoring`, `communication`

---

## Quick Start: Build Your First MCP Service

### Prerequisites
- Node.js 18+
- MCP SDK 1.17.5+
- pAIchart Hub account

### Step 1: Create Your Service

```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';

const PORT = process.env.PORT || 3100;
const app = express();

// CRITICAL: Parse JSON before MCP handlers
app.use(express.json({ limit: '10mb' }));

// Create MCP Server
const mcpServer = new Server(
  { name: 'my-weather-service', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Define your tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'get_weather',
    description: 'Get current weather for a location',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' }
      },
      required: ['location']
    }
  }]
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'get_weather') {
    // Your actual implementation
    const weather = await fetchWeather(args.location);
    return {
      content: [{ type: 'text', text: JSON.stringify(weather) }]
    };
  }

  return {
    content: [{ type: 'text', text: 'Unknown tool' }],
    isError: true
  };
});

// SSE endpoint for MCP protocol
const activeTransports = new Map();

app.get('/sse', async (req: Request, res: Response) => {
  const transport = new SSEServerTransport('/message', res);
  activeTransports.set(transport.sessionId, transport);

  req.on('close', () => {
    activeTransports.delete(transport.sessionId);
  });

  await mcpServer.connect(transport);

  // Keep connection alive until client disconnects
  await new Promise(resolve => req.on('close', resolve));
});

// CRITICAL FIX: Pass req.body to handlePostMessage
// Express.json() consumes the stream, so we must pass the parsed body
app.post('/message', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = activeTransports.get(sessionId)
    || [...activeTransports.values()][0];

  if (!transport) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // CRITICAL: Third parameter prevents "stream is not readable" error
  await transport.handlePostMessage(req, res, req.body);
});

// Health check (required for Hub monitoring)
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`MCP Server listening on port ${PORT}`);
});
```

### Alternative: Streamable HTTP Implementation (Recommended for External Services)

**For services deployed outside your network, use Streamable HTTP** - works through corporate firewalls without VPN:

```typescript
// src/index.ts - Streamable HTTP transport
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express, { Request, Response } from 'express';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Create MCP Server (same as SSE)
const mcpServer = new Server(
  { name: 'my-weather-service', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Define tools (same as SSE - see above)
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ ... }));
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => { ... });

// Streamable HTTP endpoint - single POST endpoint handles everything
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string || 'default-session';

    // Set session ID header for client
    res.setHeader('Mcp-Session-Id', sessionId);

    // Process MCP JSON-RPC request
    const response = await mcpServer.handleRequest(req.body);

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal error' },
      id: req.body?.id || null
    });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`MCP Server (Streamable HTTP) on port ${PORT}`);
});
```

**When to use each**:
- **Streamable HTTP** (`/mcp`): External services, serverless, corporate networks (no VPN)
- **SSE** (`/sse`): Internal Docker services, real-time streaming (localhost only)

### Step 2: Deploy Your Service

Deploy to any hosting platform:
- **Cloud**: AWS, GCP, Azure, Heroku, Vercel
- **Container**: Docker, Kubernetes
- **On-premise**: Any server with HTTPS

Ensure your endpoint is reachable by the Hub (public HTTPS or VPN).

### Step 3: Register with pAIchart Hub

Via MCP tool (Claude Desktop, ChatGPT, etc.):
```
registry(action: "register")({
  name: "my-weather-service",
  description: "Real-time weather data for any city worldwide",
  endpoint: "https://your-domain.com/mcp",
  category: "data-services",
  capabilities: {
    tools: ["get_weather"]
  }
})
```

### Step 4: Test Your Service

```
# Check it appears in discovery
services(action: "discover", capability: "weather")

# Check health
services(action: "health", service_name: "my-weather-service")

# Call your tool through the Hub
services(action: "call")({
  targetService: "my-weather-service",
  tool: "get_weather",
  arguments: { location: "San Francisco" }
})
```

---

## Best Practices

### Tool Naming
- Use `snake_case`: `get_weather`, `send_notification`
- Be descriptive: `analyze_sentiment` not `analyze`
- Include verb: `create_`, `get_`, `update_`, `delete_`, `list_`

### Health Checks
The Hub periodically checks `/health`. Return:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-06T12:00:00Z",
  "version": "1.0.0"
}
```

### Error Handling
Return structured errors:
```typescript
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      error: 'Location not found',
      code: 'LOCATION_NOT_FOUND',
      suggestion: 'Try a different city name'
    })
  }],
  isError: true
};
```

### Rate Limiting
Implement your own rate limiting - the Hub enforces platform-level limits, but you should protect your resources.

---

## API Response Patterns

Understanding the Hub's response patterns helps build reliable integrations.

### Response Structure Consistency

All pAIchart list operations use a consistent wrapper format:

```javascript
// All list operations return:
{ data: [...], total: N, ... }

// NOT entity-specific names like:
{ povs: [...] }     // WRONG
{ tasks: [...] }    // WRONG
{ services: [...] } // WRONG
```

**Why this matters for workflows**: When chaining service calls, always access results via `data`:
```javascript
// Variable chaining in services(action: "workflow.execute"):
arguments: { povId: "{{step.0.output.data[0].id}}" }  // Correct
arguments: { povId: "{{step.0.output.povs[0].id}}" }  // WRONG - won't work
```

### Service Name Lookups

Internal services support **name aliases** for flexibility:

| Can Use | Also Works |
|---------|-----------|
| `paichart-project-service` | `pAIchart POV Service` |
| `paichart-project-service` | `pAIchart Task Service` |

Both formats work with `services(action: "health")`, `registry(action: "tools")`, and `services(action: "call")`:
```
services(action: "health", service_name: "paichart-project-service")    // Works
services(action: "health", service_name: "pAIchart POV Service")    // Also works
```

---

## Common Issues

### "stream is not readable" Error
**Cause**: Express body-parser consumes the request stream before MCP SDK reads it.
**Fix**: Pass `req.body` as third argument:
```typescript
await transport.handlePostMessage(req, res, req.body);
```

### "Session not found" Error
**Cause**: SSE connection closed before message arrived.
**Fix**: Keep SSE handler alive with `await closePromise` pattern.

### "Service call blocked by compliance policy"
**Cause**: Tool name not in approved list, or parameters contain blocked patterns.
**Fix**:
1. Add the tool to your service's `capabilities.tools` when registering
2. Use standard tool names from the pre-approved list
3. Avoid blocked patterns in tool names and parameters

> See [MCP Hub Security Policy](./mcp-hub-security-policy.md) for the complete list of pre-approved tools, blocked patterns, and troubleshooting guide.

---

## Data Rights & GDPR Compliance

pAIchart Hub respects your data rights and complies with GDPR requirements.

### Your Rights as a Service Owner

| Right | How to Exercise |
|-------|-----------------|
| **Right to Access** | Use `registry(action: "list")()` to see all your registered services |
| **Right to Rectification** | Use `registry(action: "update")()` to modify service details |
| **Right to Erasure** | Use `registry(action: "delete")()` to permanently remove your service |
| **Right to Data Portability** | Export service configuration via `registry(action: "list")(includeMetrics: true)` |

### Deleting Your Service

You can permanently delete your service at any time:

```javascript
// Delete your service (owner-only operation)
registry(action: "delete")({
  service_name: 'my-weather-service'  // Or use serviceId
})
```

**What gets deleted:**
- Service registration and configuration
- Endpoint information
- Health check history
- Usage metrics and call logs
- All associated metadata

**What is NOT deleted:**
- Your account (managed separately)
- Other services you own
- Audit logs (retained for compliance, anonymized after 90 days)

### Data Retention

| Data Type | Retention Period |
|-----------|------------------|
| Service configuration | Until you delete it |
| Health check history | 30 days rolling |
| Call logs | 90 days (anonymized thereafter) |
| Security audit logs | 1 year (required for compliance) |

### Contact for Data Requests

For data access requests or questions: **steve.terry@paichart.com**

---

## Why pAIchart Hub?

| Challenge | Self-Hosted | pAIchart Hub |
|-----------|-------------|--------------|
| Multi-platform access | Build connectors for ChatGPT, Claude, Gemini separately | Register once, accessible everywhere |
| Authentication | Implement OAuth, API keys yourself | Built-in, enterprise-ready |
| Anthropic compliance | Research and implement yourself | Pre-certified, continuously updated |
| Service discovery | Users must know your endpoint | Searchable registry |
| Security | Your responsibility | Content filtering, rate limiting, audit logging included |

**Bottom line**: Focus on building your service. We handle the infrastructure.

---

## Support & Contact

**Technical Support**: steve.terry@paichart.com
**Documentation**: https://paichart.app/docs
**API Status**: https://paichart.app/status

### About pAIchart

pAIchart is an AI-native project management and orchestration platform. The MCP Hub is our service registry and orchestration layer, enabling enterprises to build interconnected AI workflows.

**Founded**: 2025
**Headquarters**: Australia
**Focus**: Enterprise AI orchestration, MCP ecosystem

---

## Changelog

- **v1.4** (January 13, 2026): Capability-Based Discovery Emphasis
  - UPDATED: Platform access table - replaced REST API with MCP protocol, webhooks, scheduled jobs
  - CLARIFIED: Users discover services by capability, not by service name
  - EMPHASIS: External service integration is the primary focus

- **v1.3** (January 12, 2026): API Response Patterns
  - NEW: "API Response Patterns" section with response structure consistency info
  - NEW: Documentation of `{ data: [...] }` wrapper pattern for all list operations
  - NEW: Service name alias documentation for internal services
  - Added variable chaining examples showing correct `data[N]` path format
  - Verified via Feature Domain Testing (33/33 scenarios passed)

- **v1.2** (January 11, 2026): Security Policy Documentation
  - Created comprehensive [MCP Hub Security Policy](./mcp-hub-security-policy.md) document
  - Added detailed tool approval documentation (static + dynamic whitelists)
  - Documented all blocked patterns and URL restrictions
  - Enhanced compliance troubleshooting guidance

- **v1.1** (January 8, 2026): Permissions & Rate Limiting
  - Added `permissions` object with `publicAccess`, `rateLimit`, `maxExecutionTime`
  - Added `healthCheckPath` for custom health endpoints
  - Removed WebSocket transport (security/performance concerns)
  - Updated examples to use new `updates` object structure

- **v1.0** (January 2026): Initial public release
  - SSE transport support
  - Service registration and discovery
  - Anthropic compliance layer
  - Access control (public/private)
