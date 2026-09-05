# MCP Hub Service Registration Guide

> **Step-by-step tutorial: Register your MCP service in 15 minutes**
>
> From zero to Grade A quality with validation at each step

---

## 🎯 What You'll Accomplish

By the end of this guide, you'll have:
- ✅ Registered your MCP service with the Hub
- ✅ Made it discoverable by AI agents (ChatGPT, Claude Desktop, Gemini)
- ✅ Achieved **Grade A quality** (full parameter schemas)
- ✅ Configured access control and rate limits
- ✅ Verified it works end-to-end

**Time**: 15-20 minutes

---

## 📋 Prerequisites Checklist

Before you begin, ensure you have:

- ✅ MCP service running (Node.js with MCP SDK 1.17.5+)
- ✅ Service deployed and reachable (HTTPS endpoint or localhost)
- ✅ pAIchart Hub account (OAuth via Microsoft, Google, or GitHub)
- ✅ Service has `/health` endpoint (or custom health path)

**Not ready?** See [A] **get_started** → Path A: Developer for full setup tutorial

---

## Step 1: Basic Registration (2 min) - Grade C

### Minimum Viable Registration

**Start simple** - just register the service:

```javascript
registry(action: "register", {
  name: "my-weather-api",
  description: "Real-time weather forecasts and alerts for global locations",
  endpoint: "https://api.myservice.com/mcp",
  category: "data-services"
})
```

**Response**:
```json
{
  "serviceId": "cm3xyz...",
  "status": "ACTIVE",
  "message": "Service registered successfully",
  "qualityGrade": "D",
  "nextSteps": "Add tool capabilities to enable AI client interaction"
}
```

---

### Choose Your Category

**6 Hub categories** for discovery:

| Category | Use For | Auto-Approved? |
|----------|---------|----------------|
| **ai-intelligence** | AI/ML services, inference, embeddings | ✅ Yes |
| **data-services** | Data APIs, weather, databases, analytics | ✅ Yes |
| **automation** | Browser automation, workflows, RPA | ✅ Yes |
| **monitoring** | Observability, logging, alerting, APM | ✅ Yes |
| **communication** | Notifications, email, SMS, chat | ✅ Yes |
| **security** | Auth, compliance, encryption | ⚠️ Requires approval |

**High-risk categories** (require admin review):
- `security`, `authentication`, `payment`, `financial`
- `medical`, `healthcare`, `government`, `legal`

**Why categories matter**: AI discovers services by capability - "find monitoring services" returns all services in `monitoring` category.

---

### ✅ Checkpoint 1: Verify Registration

**Check it appears in your services**:
```javascript
registry(action: "list")
```

**Should see**:
```json
{
  "services": [{
    "id": "cm3xyz...",
    "name": "my-weather-api",
    "status": "ACTIVE",
    "category": "data-services"
  }],
  "total": 1
}
```

**✅ Success**: Service registered! (Grade D - no tools yet)

---

## Step 2: Add Tool Capabilities (5 min) - Grade C → A

### Why Add Tool Schemas?

**Without schemas** (Grade C):
- AI doesn't know what parameters to pass
- Must guess based on tool name
- Error-prone integration

**With schemas** (Grade A):
- AI discovers exact parameters via `registry(action: "tools")`
- Proper validation and documentation
- Best integration experience

---

### Add Tools with Full Schemas

**Update your service** with complete tool definitions:

```javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    capabilities: {
      tools: [
        {
          name: "get_forecast",
          description: "Get weather forecast for a location",
          inputSchema: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "City name or coordinates (e.g., 'Sydney' or '-33.8688,151.2093')"
              },
              days: {
                type: "number",
                description: "Number of forecast days (1-14)",
                minimum: 1,
                maximum: 14,
                default: 7
              },
              units: {
                type: "string",
                enum: ["celsius", "fahrenheit"],
                default: "celsius",
                description: "Temperature units"
              }
            },
            required: ["location"]
          }
        },
        {
          name: "get_alerts",
          description: "Get active weather alerts for a region",
          inputSchema: {
            type: "object",
            properties: {
              region: {
                type: "string",
                description: "Region code (e.g., 'AU-NSW' for New South Wales)"
              },
              severity: {
                type: "string",
                enum: ["all", "minor", "moderate", "severe", "extreme"],
                default: "all"
              }
            },
            required: ["region"]
          }
        }
      ]
    }
  }
})
```

**Response**:
```json
{
  "serviceId": "cm3xyz...",
  "updated": ["capabilities"],
  "message": "Service updated successfully"
}
```

---

### Schema Best Practices

**String with validation**:
```javascript
location: {
  type: "string",
  description: "Clear description of what this is",
  minLength: 1,
  maxLength: 100
}
```

**Enum (dropdown choices)**:
```javascript
priority: {
  type: "string",
  enum: ["low", "normal", "high", "urgent"],
  default: "normal",
  description: "Message priority level"
}
```

**Number with constraints**:
```javascript
count: {
  type: "number",
  minimum: 1,
  maximum: 100,
  default: 10,
  description: "Number of items to return"
}
```

**Boolean**:
```javascript
includeMetadata: {
  type: "boolean",
  default: false,
  description: "Include additional metadata in response"
}
```

**Array**:
```javascript
tags: {
  type: "array",
  items: { type: "string" },
  description: "Filter by tags"
}
```

---

### ✅ Checkpoint 2: Verify Quality Grade

**Check your grade**:
```javascript
registry(action: "tools", { service_name: "my-weather-api" })
```

**Should see**:
```json
{
  "qualityAssessment": {
    "grade": "A",
    "schemaQuality": "full",
    "toolsWithSchema": 2,
    "totalTools": 2,
    "message": "All tools have full parameter schemas - excellent AI client compatibility"
  }
}
```

**✅ Success**: Grade A achieved! AI can now discover your tool parameters.

---

## Step 3: Configure Access Control (3 min)

### Set Public Access

**Default**: Services start private (owner + admins only)

**Make public** (allow any authenticated user):
```javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    permissions: {
      publicAccess: true
    }
  }
})
```

**Security note**: Start private, test with OWNER trust, make public when ready.

---

### Configure Rate Limiting

**Protect your service** from abuse:

```javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    rateLimit: {
      requests: 100,    // Max 100 requests
      windowMs: 60000   // Per minute (60000ms)
    },
    maxExecutionTime: 30000  // 30 seconds timeout
  }
})
```

**How it works**:
- Hub enforces rate limit **before** calling your service
- Requests beyond limit → Error: "Rate limit exceeded"
- No rate limiting code needed in your service!

**Recommended starting values**:
- **Data services**: 100/min
- **Communication services**: 50/min (email/SMS costs)
- **Automation services**: 20/min (browser automation is slow)
- **AI services**: 30/min (inference is expensive)

---

### Custom Health Check Path

**If your health endpoint isn't `/health`**:

```javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    healthCheckPath: "/api/status"  // Custom path
  }
})
```

**Health check requirements**:
- Must return HTTP 200 for healthy status
- Response time < 5 seconds
- Optional: Include version, timestamp in response

---

### ✅ Checkpoint 3: Verify Configuration

**Check health**:
```javascript
services(action: "health", { service_name: "my-weather-api" })
```

**Should see**:
```json
{
  "status": "healthy",
  "responseTime": "45ms",
  "successRate": 100,
  "version": "1.0.0",
  "permissions": {
    "publicAccess": true,
    "rateLimit": { "requests": 100, "windowMs": 60000 }
  }
}
```

**✅ Success**: Service configured and healthy!

---

## Step 4: Test Your Service (3 min)

### Test Discovery

**Check it appears in discovery**:
```javascript
services(action: "discover", { category: "data-services" })
```

**Should see your service**:
```json
{
  "services": [{
    "name": "my-weather-api",
    "description": "Real-time weather forecasts...",
    "category": "data-services",
    "status": "ACTIVE"
  }]
}
```

**✅ Discovery works!**

---

### Test Tool Call

**Call your tool through the Hub**:
```javascript
services(action: "call", {
  targetService: "my-weather-api",
  tool: "get_forecast",
  arguments: {
    location: "Sydney",
    days: 3,
    units: "celsius"
  }
})
```

**Should return**: Weather forecast data from your service

**✅ Service calls work!**

---

### Test with token-validator (IMPORTANT!)

**Verify token authentication** (if your service validates tokens):

```javascript
services(action: "workflow.execute", {
  steps: [{
    service: "test-auth-service",
    tool: "verify_auth",
    arguments: {}
  }]
})
```

**Shows**:
- Your trust level (should be OWNER)
- Whether you received a token (should be YES)
- JWKS validation results (11 steps)
- Copy-paste code examples for your service

**Why important**: Confirms your service will receive tokens and can validate them via JWKS.

---

### ✅ Checkpoint 4: End-to-End Verification

**Checklist**:
- ✅ Service appears in `services(action: 'discover')`
- ✅ Health check returns "healthy"
- ✅ Grade is "A" (full schemas)
- ✅ `services(action: 'call')` returns expected results
- ✅ token-validator shows OWNER trust + token received

**🎉 Success**: Your service is fully integrated!

---

## Step 5: Advanced Configuration (Optional - 5 min)

### Transport Selection

**Choose the right transport** for your deployment:

**Streamable HTTP** (`/mcp` endpoint) ✅ **Recommended**:
```javascript
endpoint: "https://api.myservice.com/mcp"
```

**Best for**:
- External services (internet-accessible)
- Corporate networks (works through firewalls)
- Serverless (AWS Lambda, Cloudflare Workers)
- Standard HTTP POST (universally compatible)

**SSE** (`/sse` endpoint):
```javascript
endpoint: "http://localhost:3100/sse"
```

**Best for**:
- Internal Docker services (localhost only)
- Real-time streaming (long-lived connections)
- Local development

**Why Streamable HTTP is recommended**: No VPN required, works through corporate firewalls, perfect for external services.

---

### Version Management

**Update version** when you make changes:

```javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    version: "1.1.0"  // Semantic versioning
  }
})
```

**Best practice**: Follow semver (1.0.0 → 1.1.0 → 2.0.0)

---

### Service Description Guidelines

**Write a clear first paragraph** (80-150 chars) as your summary:

**Good**:
```
"Real-time weather forecasts and alerts for global locations.

WHEN TO USE:
✅ Get current conditions for any city
✅ Forecast weather for 1-14 days
✅ Monitor severe weather alerts

EXAMPLES:
- get_forecast(location: 'Sydney', days: 7)
- get_alerts(region: 'AU-NSW', severity: 'severe')"
```

**Why**: `services(action: 'discover')` shows first paragraph; `registry(action: "tools")` shows full description.

---

### Resources and Prompts

**Optional capabilities** (future functionality):

```javascript
capabilities: {
  tools: [...],
  resources: ["weather-data", "historical-archive"],  // MCP resources
  prompts: ["daily-briefing", "storm-tracker"]        // Interactive prompts
}
```

**Currently**: Only `tools` are fully supported. Resources and prompts are stored but not yet utilized.

---

## 🚀 Complete Registration Example

**Grade A registration** with all best practices:

```javascript
registry(action: "register", {
  name: "premium-weather-service",
  description: "Enterprise weather API with real-time forecasts, alerts, and historical data for 200+ countries. Includes severe weather monitoring and customizable notifications.

WHEN TO USE:
✅ Get accurate weather forecasts (1-14 days)
✅ Monitor severe weather alerts by region
✅ Access historical weather data
✅ Integrate weather into dashboards and workflows

FEATURES:
- 15-minute update frequency
- 99.9% uptime SLA
- Multi-language support (20+ languages)
- Customizable units (metric/imperial)

EXAMPLES:
- get_forecast(location: 'Sydney', days: 7, units: 'celsius')
- get_alerts(region: 'AU-NSW', severity: 'extreme')
- get_historical(location: 'Melbourne', startDate: '2025-01-01')",

  endpoint: "https://api.premiumweather.com/mcp",
  category: "data-services",
  version: "2.0.0",

  capabilities: {
    tools: [
      {
        name: "get_forecast",
        description: "Get weather forecast for a location (1-14 days)",
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name, coordinates, or airport code"
            },
            days: {
              type: "number",
              description: "Number of forecast days",
              minimum: 1,
              maximum: 14,
              default: 7
            },
            units: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              default: "celsius"
            },
            language: {
              type: "string",
              description: "Response language (ISO 639-1 code)",
              default: "en"
            }
          },
          required: ["location"]
        }
      },
      {
        name: "get_alerts",
        description: "Get active weather alerts for a region",
        inputSchema: {
          type: "object",
          properties: {
            region: {
              type: "string",
              description: "Region code (e.g., 'AU-NSW', 'US-CA')"
            },
            severity: {
              type: "string",
              enum: ["all", "minor", "moderate", "severe", "extreme"],
              default: "all",
              description: "Filter by alert severity"
            },
            includeExpired: {
              type: "boolean",
              default: false,
              description: "Include alerts that have expired"
            }
          },
          required: ["region"]
        }
      },
      {
        name: "get_historical",
        description: "Get historical weather data for analysis",
        inputSchema: {
          type: "object",
          properties: {
            location: { type: "string" },
            startDate: {
              type: "string",
              format: "date",
              description: "Start date (YYYY-MM-DD)"
            },
            endDate: {
              type: "string",
              format: "date",
              description: "End date (YYYY-MM-DD)"
            },
            metrics: {
              type: "array",
              items: {
                type: "string",
                enum: ["temperature", "precipitation", "wind", "humidity", "pressure"]
              },
              description: "Metrics to include"
            }
          },
          required: ["location", "startDate"]
        }
      }
    ]
  }
})
```

**After registration, configure access**:
```javascript
registry(action: "update", {
  service_name: "premium-weather-service",
  updates: {
    permissions: {
      publicAccess: true  // Make public after testing
    },
    rateLimit: {
      requests: 100,
      windowMs: 60000  // 100/min
    },
    maxExecutionTime: 45000  // 45 seconds
  }
})
```

---

## 🔧 Troubleshooting Common Issues

### Error: "Service name already registered"

**Cause**: Another user already registered that name

**Solution**: Choose a unique name
```javascript
// Try: my-weather-api → my-weather-api-v2
// Or: premium-weather-api
```

**Check availability**:
```javascript
services(action: "discover")  // See all registered services
```

---

### Error: "Invalid endpoint URL"

**Cause**: Malformed URL or unsupported protocol

**Common mistakes**:
```javascript
❌ endpoint: "my-service.com"           // Missing protocol
❌ endpoint: "ws://my-service.com"      // WebSocket not supported
❌ endpoint: "localhost:3100"           // Missing http://

✅ endpoint: "https://my-service.com/mcp"    // Correct!
✅ endpoint: "http://localhost:3100/sse"     // Localhost OK for Docker
```

---

### Error: "Category required"

**Cause**: Missing or invalid category

**Solution**: Use one of 6 valid categories
```javascript
// Valid:
category: "data-services"
category: "automation"
category: "monitoring"
category: "communication"
category: "ai-intelligence"
category: "security"  // Requires approval

// Invalid:
category: "weather"  // Not a valid category
```

---

### Error: "Description too short"

**Cause**: Description < 10 characters

**Solution**: Provide meaningful description (10-500 chars)
```javascript
❌ description: "Weather"  // Too short (7 chars)

✅ description: "Real-time weather forecasts and alerts for global locations"  // Good (69 chars)
```

---

### Service Not Discoverable

**Checklist**:

1. **Check status**:
   ```javascript
   registry(action: "list")
   // status should be "ACTIVE"
   ```

2. **Verify category**:
   ```javascript
   services(action: "discover", { category: "data-services" })
   // Your service should appear
   ```

3. **Check approval** (high-risk categories):
   - Security, payment, medical, government categories require admin approval
   - Contact: <maintainer-email>

---

### Service Call Returns 404

**Cause**: Health check failed or endpoint unreachable

**Solution**:

1. **Test endpoint directly**:
   ```bash
   curl https://your-service.com/health
   # Should return: { "status": "healthy" }
   ```

2. **Check health via Hub**:
   ```javascript
   services(action: "health", {
     service_name: "my-weather-api",
     realtime: true  // Force fresh health check
   })
   ```

3. **If status is "ERROR"**:
   - Verify service is running
   - Check endpoint URL is correct
   - Ensure `/health` endpoint works

---

### Quality Grade Lower Than Expected

**Check which tools need schemas**:
```javascript
registry(action: "tools", { service_name: "my-weather-api" })
```

**Response shows**:
```json
{
  "qualityAssessment": {
    "grade": "B",
    "toolsMissingSchemas": ["get_historical"],  // This tool needs schema!
    "message": "Some tools missing schemas - add inputSchema to upgrade to Grade A"
  }
}
```

**Solution**: Add `inputSchema` to all tools

---

### Call Blocked by Compliance Policy

**Error**:
```
Service call blocked by compliance policy: Tool 'delete_records' contains blocked pattern
```

**Cause**: Tool name contains blocked patterns

**Blocked patterns**:
- System commands: `sudo`, `rm`, `delete`, `drop`, `exec`
- Network access: `ssh`, `curl`, `shell`, `bash`
- Database mods: `insert`, `update`, `alter`, `grant`

**Solution**: Rename tool
```javascript
❌ tools: ["delete_records"]  // Contains "delete"

✅ tools: ["remove_records"]  // "remove" is OK
✅ tools: ["clear_cache"]     // Alternative
```

**See full list**: [F] **security_policy** → Section B: Blocked Patterns

---

## 📚 Best Practices Summary

### Registration

1. ✅ **Start with basic registration** - Get it working first (Grade C)
2. ✅ **Add full schemas** - Upgrade to Grade A for best integration
3. ✅ **Test privately first** - Use OWNER trust before going public
4. ✅ **Configure rate limits** - Protect your service from abuse
5. ✅ **Verify with token-validator** - Test token authentication works

---

### Tool Naming

1. ✅ **Use snake_case** - `get_weather`, `send_notification`
2. ✅ **Be descriptive** - `analyze_sentiment` not `analyze`
3. ✅ **Include verb** - `create_`, `get_`, `update_`, `delete_`, `list_`
4. ✅ **Avoid blocked patterns** - No `exec`, `shell`, `delete`, `drop`

---

### Schemas

1. ✅ **Add descriptions** - AI uses these to understand parameters
2. ✅ **Use enums** - For dropdown choices (priority, format, etc.)
3. ✅ **Set defaults** - Makes parameters optional with sensible defaults
4. ✅ **Add constraints** - minimum/maximum for numbers, minLength/maxLength for strings
5. ✅ **Mark required fields** - Use `required: ["field1", "field2"]`

---

### Access Control

1. ✅ **Start private** - Test with OWNER trust first
2. ✅ **Make public cautiously** - Verify security before opening access
3. ✅ **Set rate limits** - Start conservative, increase if needed
4. ✅ **Monitor health** - Check regularly with `services(action: 'health')`

---

## 🎓 Next Steps

**Your service is registered!** What's next?

### For Developers

**Secure your service**:
- [E] **external_service_auth** - JWKS validation, Component 5, RS256 tokens
- [G] **trust_levels** - Understand when you receive tokens

**Build workflows**:
- [I] **workflow_guide** - Multi-service orchestration
- `/prompt orchestrate_workflow` - Interactive workflow builder

**Understand security**:
- [F] **security_policy** - Compliance, blocked patterns, safeguards

---

### Try It Now

**Open ChatGPT or Claude Desktop** and say:
> "Find weather services and get the forecast for Sydney"

**AI will**:
1. Discover your service (capability: weather)
2. Call `get_forecast({ location: "Sydney" })`
3. Return results to user

**No service name needed** - AI discovers by capability!

---

## 📖 Quick Reference

### Registration Commands

```javascript
// Basic registration
registry(action: "register", {
  name: "my-service",
  description: "What it does (10-500 chars)",
  endpoint: "https://api.myservice.com/mcp",
  category: "data-services"
})

// Add tools (upgrade to Grade A)
registry(action: "update", {
  service_name: "my-service",
  updates: {
    capabilities: {
      tools: [
        {
          name: "tool_name",
          description: "What it does",
          inputSchema: { type: "object", properties: {...}, required: [...] }
        }
      ]
    }
  }
})

// Configure access
registry(action: "update", {
  service_name: "my-service",
  updates: {
    permissions: { publicAccess: true },
    rateLimit: { requests: 100, windowMs: 60000 },
    maxExecutionTime: 30000,
    healthCheckPath: "/health"
  }
})
```

---

### Verification Commands

```javascript
// Check your services
registry(action: "list")

// Check discovery
services(action: "discover", { category: "data-services" })

// Check quality grade
registry(action: "tools", { service_name: "my-service" })

// Check health
services(action: "health", { service_name: "my-service" })

// Test service call
services(action: "call", {
  targetService: "my-service",
  tool: "my_tool",
  arguments: {...}
})

// Test token auth
services(action: "workflow.execute", {
  steps: [{ service: "test-auth-service", tool: "verify_auth" }]
})
```

---

### Quality Grades

| Grade | Criteria | Action |
|-------|----------|--------|
| **A** | All tools have schemas | ✅ Perfect! |
| **B** | Some tools have schemas | Add schemas to remaining tools |
| **C** | Tool names only | Add full tool definitions |
| **D** | No tools | Add tools to enable AI interaction |

---

### Categories

| Category | Use For | Auto-Approved? |
|----------|---------|----------------|
| `ai-intelligence` | AI/ML, inference | ✅ Yes |
| `data-services` | APIs, databases | ✅ Yes |
| `automation` | Browser, workflows | ✅ Yes |
| `monitoring` | Logging, alerts | ✅ Yes |
| `communication` | Email, SMS, Slack | ✅ Yes |
| `security` | Auth, encryption | ⚠️ Requires approval |

---

## 💬 Support

**Registration Help**: <maintainer-email>
**Documentation**: https://paichart.app/docs
**API Status**: https://paichart.app/status

---

**Version**: 1.0 | **Created**: 2026-02-02 | **Status**: Production-Ready
**Target Time**: 15-20 minutes | **Quality Goal**: Grade A
