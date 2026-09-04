# MCP Hub: Getting Started

> **Interactive guide for external service developers, Hub operators, and service consumers**
>
> Choose your role to see tailored tutorials and examples

---

## 🎯 What is MCP Hub?

**pAIchart MCP Hub** is an AI-native service orchestration platform that enables AI agents to discover, compose, and execute multi-service workflows dynamically.

**Key Difference from Traditional Automation**:
- **Zapier/n8n**: Humans design workflows → Machines execute them
- **MCP Hub**: AI discovers services → AI composes workflows → AI executes them

```
User: "Optimize our energy operations according to weather forcast"
   ↓
AI reasons about what's needed
   ↓
AI discovers available services by capability
   ↓
AI composes workflow steps
   ↓
AI executes and adapts if steps fail
```

**The Power**: Workflows emerge from goals, not pre-configuration.

---

## 👤 Choose Your Role

**What best describes you?**

- **[A] Developer** - I want to register an external MCP service
- **[B] Operator** - I manage Hub services and monitor health
- **[C] Consumer** - I want to use services and create workflows

---

## Path A: Developer - Register Your First Service (15 min)

> **Goal**: Register an MCP service with pAIchart Hub and make it discoverable by AI

### What You'll Build

A simple "Hello World" MCP service that AI agents can discover and call through ChatGPT, Claude Desktop, or Gemini.

### Prerequisites

- Node.js 18+
- MCP SDK 1.17.5+ (`npm install @modelcontextprotocol/sdk`)
- pAIchart Hub account (OAuth via Microsoft, Google, or GitHub)

---

### Step 1: Create Your MCP Service (5 min)

**Choose your transport** (we recommend Streamable HTTP for external services):

**Option 1: Streamable HTTP** ✅ **Recommended**
- Works through corporate firewalls without VPN
- Perfect for serverless (AWS Lambda, Cloudflare Workers)
- Standard HTTP POST - universally compatible

**Option 2: SSE**
- Requires VPN for external access (firewalls block long-lived connections)
- Better for real-time streaming on trusted networks
- Use for internal Docker services only

**Quick Start Code** (Streamable HTTP):

```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Create MCP Server
const mcpServer = new Server(
  { name: 'hello-world-service', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Define your tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'say_hello',
    description: 'Say hello to someone',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' }
      },
      required: ['name']
    }
  }]
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'say_hello') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ message: `Hello, ${args.name}!` })
      }]
    };
  }

  return {
    content: [{ type: 'text', text: 'Unknown tool' }],
    isError: true
  };
});

// Streamable HTTP endpoint
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string || 'default-session';
    res.setHeader('Mcp-Session-Id', sessionId);

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

// Health check (required for Hub monitoring)
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.listen(3100, () => {
  console.log('MCP Server listening on port 3100');
});
```

**What this does**:
- Creates an MCP server with one tool: `say_hello`
- Exposes `/mcp` endpoint (Streamable HTTP transport)
- Provides `/health` endpoint for Hub monitoring

---

### Step 2: Deploy Your Service (3 min)

Deploy to any hosting platform:
- **Cloud**: AWS, GCP, Azure, Heroku, Vercel
- **Container**: Docker, Kubernetes
- **On-premise**: Any server with HTTPS

**Example Docker deployment**:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3100
CMD ["node", "src/index.js"]
```

**Ensure your endpoint is reachable** (public HTTPS or VPN).

---

### Step 3: Register with pAIchart Hub (2 min)

**Via ChatGPT, Claude Desktop, or MCP tool**:

```javascript
registry(action: "register", {
  name: "hello-world-service",
  description: "Simple greeting service for testing MCP Hub integration",
  endpoint: "https://your-domain.com/mcp",  // Your deployed endpoint
  category: "data-services",  // Options: ai-intelligence, data-services, automation, monitoring, communication, security
  capabilities: {
    tools: [{
      name: "say_hello",
      description: "Say hello to someone",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name to greet" }
        },
        required: ["name"]
      }
    }]
  }
})
```

**⚠️ Important**: Include `inputSchema` for **Grade A quality**
- **With schemas**: AI knows what parameters to pass (Grade A)
- **Without schemas**: AI must guess parameters (Grade C)

**Response**:
```json
{
  "serviceId": "cm3xyz...",
  "status": "ACTIVE",
  "message": "Service registered successfully"
}
```

**Access Control** (default is private):
- `publicAccess: false` (default) - Only you and Hub admins
- To make public: Use `registry(action: "update", { permissions: { publicAccess: true } })`

---

### Step 4: Test Your Service (3 min)

**Check discovery**:
```javascript
services({ action: "discover", capability: "greeting" })
// Returns: Your service appears in results ✅
```

**Check health**:
```javascript
services({ action: "health", service_name: "hello-world-service" })
// Returns: { status: "healthy", responseTime: "45ms", successRate: 100 }
```

**Call your tool through the Hub**:
```javascript
services({
  action: "call",
  targetService: "hello-world-service",
  tool: "say_hello",
  arguments: { name: "Alice" }
})
// Returns: { message: "Hello, Alice!" }
```

---

### Step 5: Next Steps (2 min)

**✅ Your service is now live!** AI agents can discover and use it.

**What users can now do** (through ChatGPT, Claude, Gemini):
> "Say hello to Bob using the greeting service"

**AI will**:
1. Discover your service by capability
2. Call `say_hello` with `{ name: "Bob" }`
3. Return result to user

**Next tutorials**:
- [D] **register_guide** - Add more tools, improve quality grade
- [E] **external_service_auth** - Secure your service with trust levels
- [F] **security_policy** - Understand Hub compliance and safeguards

**Try it now**: Open ChatGPT and say:
> "Find services with greeting capability and say hello to me"

---

## Path B: Operator - Manage and Monitor Hub Services

> **Goal**: Approve services, monitor health, debug trust levels, and manage access

### Your Responsibilities

As a Hub operator, you:
- **Approve** new service registrations (high-risk categories)
- **Monitor** service health and performance
- **Debug** trust level issues and authentication failures
- **Manage** access control and rate limits

---

### Operator Workflow

#### 1. Service Approval (High-Risk Categories)

**Auto-Approved Categories**:
- `data-services`, `automation`, `monitoring`, `communication`

**Requires Operator Review**:
- `security`, `authentication`, `payment`, `financial`
- `medical`, `healthcare`, `government`, `legal`

**Review checklist**:
```javascript
// Get service details
services({
  action: "health",
  service_name: "new-payment-service",
  includeDiagnostics: true
})

// Check:
// - Endpoint uses HTTPS ✅
// - Health check responds < 200ms ✅
// - Description is clear and accurate ✅
// - Category matches capabilities ✅
// - No blocked patterns in tool names ✅
```

**Approve or reject**:
```javascript
// Via admin API (operator access required)
// Approval process: Contact steve.terry@paichart.com
```

---

#### 2. Health Monitoring

**Check service health**:
```javascript
services({
  action: "health",
  service_name: "notification-service",
  includeDiagnostics: true
})
```

**Returns**:
```json
{
  "status": "healthy",
  "version": "2.1.0",
  "responseTime": "78ms",
  "successRate": 98.5,
  "errorCount": 12,
  "lastHeartbeat": "2026-01-31T10:30:00Z",
  "diagnostics": {
    "uptime": "7d 12h",
    "totalCalls": 1547
  }
}
```

**Health alert thresholds**:
- ⚠️ Response time > 500ms
- ⚠️ Success rate < 95%
- 🔴 Success rate < 85%
- 🔴 Service unreachable

---

#### 3. Trust Level Debugging

**Common issue**: "Service call blocked - insufficient trust level"

**Debug workflow**:
```javascript
// 1. Check what trust level the service requires
registry(action: "tools", { service_name: "external-api" })
// Returns: tools with trust level requirements

// 2. Check user's current trust level
// User token shows: trustLevel: "UNVERIFIED"

// 3. Explain to user:
// "This service requires BASIC_USER trust level"
// "You have: UNVERIFIED (OAuth sign-in only)"
// "To upgrade: Complete profile, verify email, wait 24h"
```

**Trust Level Hierarchy**:
1. **PUBLIC** (0) - No auth required
2. **UNVERIFIED** (1) - OAuth sign-in only
3. **BASIC_USER** (2) - Email verified + 24h
4. **TRUSTED_USER** (3) - Email + 7 days + 10+ calls
5. **TRUSTED_EXTERNAL** (4) - External service (registered)
6. **INTERNAL** (5) - Platform services only

**See full guide**: [G] **trust_levels** prompt

---

#### 4. Access Control Management

**Check who can access a service**:
```javascript
// Via registry(action: "list") (service owners only)
registry(action: "list", { includeMetrics: true })
```

**Update access settings**:
```javascript
registry(action: "update", {
  service_name: "my-service",
  updates: {
    permissions: {
      publicAccess: true,  // Allow any authenticated user
      rateLimit: {
        requests: 100,    // Max 100 requests
        windowMs: 60000   // Per minute
      },
      maxExecutionTime: 30000  // 30s timeout
    },
    healthCheckPath: "/api/status"  // Custom health endpoint
  }
})
```

**Rate limiting**:
- Hub enforces rate limits **before** calling your service
- Protects service from abuse without code changes

---

#### 5. Troubleshooting Playbook

**Problem**: Service registered but not discoverable

**Solution**:
```javascript
// 1. Check service status
services({ action: "health", service_name: "my-service" })
// If status: "INACTIVE" → Service stopped or endpoint unreachable

// 2. Check service registration
services({ action: "discover" })  // See if service appears

// 3. Test endpoint directly
// curl https://your-service.com/health
// Should return: { "status": "healthy" }
```

---

**Problem**: Service calls timing out

**Solution**:
```javascript
// 1. Check response time
services({ action: "health", service_name: "slow-service" })
// responseTime: "25000ms" ← Problem!

// 2. Increase timeout (if justified)
registry(action: "update", {
  service_name: "slow-service",
  updates: {
    permissions: {
      maxExecutionTime: 60000  // 60s (from 30s default)
    }
  }
})

// 3. Or ask service owner to optimize
```

---

**Problem**: Compliance policy blocks legitimate service call

**Solution**:
```javascript
// 1. Check error details - shows which pattern blocked the call
// Example: "Blocked pattern: shell_command"

// 2. If false positive:
// - Rename tool (avoid shell_, exec_, rm_, delete_)
// - Contact steve.terry@paichart.com for whitelist approval

// 3. See all blocked patterns:
// [F] security_policy prompt
```

---

### Operator Dashboard (Planned)

**Coming soon**:
- Real-time service health dashboard
- Trust level analytics
- Compliance violation alerts
- Service approval queue

**Current**: Use MCP tools via ChatGPT/Claude Desktop

---

### Next Steps for Operators

**Deep Dive Resources**:
- [F] **security_policy** - Understand all compliance rules
- [G] **trust_levels** - Master trust level system
- [H] **architecture** - Learn Hub internals

**Contact**: steve.terry@paichart.com (for approvals, whitelist requests)

---

## Path C: Consumer - Use Services and Create Workflows

> **Goal**: Discover services by capability, call tools, and orchestrate multi-service workflows

### What You Can Do

As a service consumer, you can:
- **Discover** services by what they can do (capability-based)
- **Call** tools on any service you have access to
- **Orchestrate** multi-service workflows (sequential, parallel, conditional)

**No coding required** - just describe what you want in ChatGPT, Claude, or Gemini!

---

### Consumer Workflow

#### 1. Discover Services by Capability

**Instead of knowing service names, search by capability**:

```javascript
// Find services that can monitor errors
services({ action: "discover", capability: "monitoring" })

// Find services that can send notifications
services({ action: "discover", capability: "communication" })

// Find services that can automate browsers
services({ action: "discover", capability: "automation" })
```

**Returns**:
```json
{
  "services": [
    {
      "name": "sentry-mcp",
      "description": "Error tracking and performance monitoring",
      "capabilities": ["monitoring", "error-tracking", "alerting"],
      "status": "ACTIVE",
      "responseTime": "45ms"
    }
  ]
}
```

**Categories** (for filtering):
- `ai-intelligence` - AI/ML services, inference
- `data-services` - Data APIs, analytics
- `automation` - Browser automation, workflows, RPA
- `monitoring` - Observability, logging, alerting
- `communication` - Notifications, email, SMS, chat
- `security` - Auth, compliance, encryption

---

#### 2. Check Service Health Before Calling

**Verify service is healthy**:
```javascript
services({ action: "health", service_name: "notification-service" })
```

**Returns**:
```json
{
  "status": "healthy",
  "responseTime": "67ms",
  "successRate": 99.2,
  "lastHeartbeat": "2026-01-31T10:32:15Z"
}
```

**Green light**: `successRate > 95%`, `status: "healthy"`

---

#### 3. Discover Tool Parameters

**See what tools a service offers**:
```javascript
registry(action: "tools", { service_name: "notification-service" })
```

**Returns**:
```json
{
  "tools": [
    {
      "name": "send",
      "description": "Send notification to single recipient",
      "inputSchema": {
        "type": "object",
        "properties": {
          "channel": { "type": "string", "enum": ["email", "slack", "sms"] },
          "message": { "type": "object" }
        },
        "required": ["channel", "message"]
      }
    }
  ]
}
```

**Now you know**: Tool expects `channel` (email/slack/sms) and `message` object

---

#### 4. Call a Service Tool

**Execute a tool on a service**:
```javascript
services({
  action: "call",
  targetService: "notification-service",
  tool: "send",
  arguments: {
    channel: "slack",
    recipients: [{ id: "channel", address: "#project-updates" }],
    message: {
      subject: "Task Completed",
      body: "The migration task has been completed successfully.",
      priority: "normal"
    }
  }
})
```

**Returns**:
```json
{
  "success": true,
  "channel": "slack",
  "deliveredTo": "#project-updates",
  "timestamp": "2026-01-31T10:35:00Z"
}
```

---

#### 5. Create Multi-Service Workflows

**Example: POV Status Report**

**Natural language** (ChatGPT/Claude):
> "Get my active POVs, take a screenshot of the dashboard, and email the report to management"

**What AI does** (via Hub):
```javascript
services({
  action: "workflow.execute",
  steps: [
    // Step 0: Get POVs
    {
      service: "paichart-project-service",
      tool: "project",
      arguments: { action: "pov.list", status: "IN_PROGRESS", limit: 10 }
    },
    // Step 1: Take screenshot (uses step 0 result)
    {
      service: "browser-automation-service",
      tool: "take_screenshot",
      arguments: {
        url: "https://paichart.app/dashboard",
        fullPage: true
      },
      dependsOn: [0]
    },
    // Step 2: Send email (uses step 0 result)
    {
      service: "notification-service",
      tool: "send",
      arguments: {
        channel: "email",
        recipients: [{ id: "mgmt", address: "team@company.com" }],
        message: {
          subject: "POV Status Report",
          body: "Found {{step.0.output.totalCount}} active POVs. See dashboard screenshot attached.",
          priority: "normal"
        }
      },
      dependsOn: [1]
    }
  ],
  executionMode: "sequential",
  failureStrategy: "continue"
})
```

**Variable Chaining**: Use `{{step.N.output...}}` to reference previous step results

---

#### 6. Workflow Execution Modes

**Sequential** - Steps run in order, each can reference previous outputs:
```javascript
executionMode: "sequential"
// Step 0 → Step 1 → Step 2 → Step 3
```

**Parallel** - Independent steps run together:
```javascript
executionMode: "parallel"
// Step 0 ┬→ Step 1
//        ├→ Step 2  (all run together)
//        └→ Step 3
```

**Conditional** - If/then/else branching (max 3 steps):
```javascript
executionMode: "conditional"
// Step 0 = CONDITION (always runs)
// Step 1 = THEN branch (runs if step 0 succeeds with data)
// Step 2 = ELSE branch (runs if step 0 fails or returns no data)
//
// Variable chaining: Step 1 can reference {{step.0.output...}}
// Step 2 cannot (step 0 failed, output unreliable)
// Step 2 is optional (omit if no else branch needed)
```

---

#### 7. Monitor Workflow Execution

**Check status**:
```javascript
services({ action: "workflow.status", executionId: "clxyz123abc" })
```

**Returns**:
```json
{
  "status": "COMPLETED",
  "progress": "3/3 steps",
  "duration": "4521ms",
  "results": [...]
}
```

**Status values**:
- `RUNNING` - In progress
- `COMPLETED` - Success ✅
- `FAILED` - Error occurred ❌
- `CANCELLED` - User stopped it
- `TIMEOUT` - Exceeded time limit

---

#### 8. Proven Workflow Patterns

**7 tested workflows** you can use:

1. **POV Status Report** - Weekly management updates
2. **Blocked Task Escalation** - Auto-notify on blockers
3. **Screenshot Documentation** - Capture dashboards as PDFs
4. **Competitor Price Monitor** - Track pricing changes
5. **Task Completion Notify** - Announce milestone completion
6. **Weekly POV Digest** - Portfolio health report
7. **Error Monitoring Alert** - Notify on critical issues

**See examples**: [I] **workflow_guide** prompt

---

### Natural Language Usage (Recommended!)

**Instead of writing JSON, just describe what you want**:

**In ChatGPT**:
> "Find all my blocked tasks and send a Slack alert to #dev-team"

**AI will**:
1. Discover `paichart-project-service` (capability: task-management)
2. Discover `notification-service` (capability: communication)
3. Call `project({ action: "task.list", status: "BLOCKED" })`
4. Call `send({ channel: "slack", recipients: [...] })`

**You get**: Results without writing any code!

---

### Next Steps for Consumers

**Deep Dive Resources**:
- [I] **workflow_guide** - Master workflow orchestration (sequential, parallel, conditional)
- [F] **security_policy** - Understand what's allowed/blocked
- [H] **architecture** - Learn how the Hub routes your requests

**Try it now**: Open ChatGPT or Claude Desktop and say:
> "Show me my active POVs and send a summary to my email"

---

## 🚀 What's Next?

**You've completed the getting_started tutorial!**

### Quick Start Workflows (Try These Now!)

**We've created 4 demo workflows** to help you learn:

**Education**:
```javascript
// Start here - learn trust levels (10 sec)
services({ action: "workflow.execute", workflowName: "trust-level-basic-demo" })

// Advanced - see code examples in 3 languages (15 sec, parallel)
services({ action: "workflow.execute", workflowName: "jwks-validation-advanced-demo" })
```

**Practical**:
```javascript
// Explore your POVs and tasks (10 sec, parallel)
services({ action: "workflow.execute", workflowName: "pov-workflow-showcase" })

// Debug trust levels with POV context (20 sec)
services({ action: "workflow.execute", workflowName: "token-troubleshooting-demo" })
```

**What you'll learn**:
- ✅ How trust levels work (OWNER vs TEAM_MEMBER vs SCOPED)
- ✅ Whether you receive JWT tokens (and why)
- ✅ Copy-paste code examples (TypeScript, JavaScript, Python)
- ✅ Parallel vs sequential execution
- ✅ Variable chaining between steps

---

### Choose Your Next Step

**For Developers** (registered your service):
- [D] **register_guide** - Add more tools, improve quality to Grade A
- [E] **external_service_auth** - Secure with trust levels and JWKS
- [F] **security_policy** - Understand Hub compliance rules

**For Operators** (managing services):
- [F] **security_policy** - Master all compliance and safeguards
- [G] **trust_levels** - Deep dive into 6-level trust system
- [H] **architecture** - Understand Hub internals

**For Consumers** (using services):
- [I] **workflow_guide** - Master multi-service orchestration
- Browse services: `/prompt discover_services_conversation`
- Create workflows: `/prompt orchestrate_workflow`

---

## 💬 Support & Community

**Technical Support**: steve.terry@paichart.com
**Documentation**: https://paichart.app/docs
**API Status**: https://paichart.app/status

**About pAIchart**:
- **Focus**: Enterprise AI orchestration, MCP ecosystem
- **Founded**: 2025
- **Headquarters**: Australia

---

## 📖 Quick Reference

### Key Concepts

**Service Discovery** - Find services by capability, not name
- AI asks: "What can help with monitoring?"
- Hub returns: Services with `monitoring` capability

**Variable Chaining** - Connect workflow steps
- `{{step.0.output.data[0].id}}` = Reference previous step result

**Trust Levels** - Security tiers (PUBLIC → UNVERIFIED → BASIC_USER → TRUSTED_USER → TRUSTED_EXTERNAL → INTERNAL)

**Execution Modes** - Sequential, Parallel, Conditional

### Common Commands

```javascript
// Discovery
services({ action: "discover", capability: "monitoring" })
services({ action: "health", service_name: "my-service" })
registry(action: "tools", { service_name: "my-service" })

// Service Calls
services({ action: "call", targetService: "...", tool: "...", arguments: {...} })

// Workflows
services({ action: "workflow.execute", steps: [...], executionMode: "sequential" })
services({ action: "workflow.status", executionId: "..." })

// Registration (developers)
registry(action: "register", { name: "...", endpoint: "...", capabilities: {...} })
```

---

**Version**: 1.1 | **Updated**: 2026-03-03 | **Status**: Production-Ready
