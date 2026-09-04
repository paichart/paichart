# MCP Service Quality Assessment Protocol

> **Version**: 1.0 | **Created**: 2026-01-06 | **Owner**: mcp-hub-specialist
>
> **Purpose**: Systematic assessment of MCP services registered in the pAIchart Hub to ensure quality, reliability, and AI-client usability.

## Overview

This protocol defines when and how to assess MCP service quality for services registered in the pAIchart Hub. The goal is to ensure services meet quality standards that enable effective AI-client interaction.

## Assessment Triggers

| Trigger | Assessment Type | Priority |
|---------|----------------|----------|
| New service registration | Full assessment | High |
| Service endpoint change | Health + Tool assessment | Medium |
| Periodic review (30 days) | Full assessment | Low |
| Customer complaint | Targeted assessment | High |
| Pre-onboarding consultation | Advisory assessment | Medium |

## Quality Dimensions

### 1. Schema Quality (Weight: 40%)
**Tool**: `registry(action: "tools")`

| Grade | Criteria | Score |
|-------|----------|-------|
| A | Full inputSchema with required fields, descriptions, examples | 100% |
| B | inputSchema present but missing some descriptions | 75% |
| C | schemaVersion 1 (string-only tools, no schemas) | 50% |
| D | No tools registered | 25% |

**Key Indicator**: `schemaVersion` in response
- `schemaVersion: 2` = Full schemas available
- `schemaVersion: 1` = Legacy registration, needs upgrade

### 2. Health Reliability (Weight: 30%)
**Tool**: `services(action: "health")`

| Grade | Criteria | Score |
|-------|----------|-------|
| A | 99%+ uptime, <500ms response, heartbeat active | 100% |
| B | 95-99% uptime, <1000ms response | 75% |
| C | 90-95% uptime, <2000ms response | 50% |
| D | <90% uptime or no heartbeat | 25% |

**Key Indicators**:
- `successRate`: Target 99%+
- `averageResponseTime`: Target <500ms
- `lastHeartbeat`: Should be recent (<5 minutes)

### 3. Tool Functionality (Weight: 20%)
**Tool**: `services(action: "call")`

| Grade | Criteria | Score |
|-------|----------|-------|
| A | All tools callable, proper error responses | 100% |
| B | Most tools callable, minor issues | 75% |
| C | Some tools fail, inconsistent responses | 50% |
| D | Tools fail to execute | 25% |

### 4. Documentation Quality (Weight: 10%)
**Tool**: `services(action: "discover")` + manual review

| Grade | Criteria | Score |
|-------|----------|-------|
| A | Clear description, capability list, contact info | 100% |
| B | Adequate description, some capabilities listed | 75% |
| C | Minimal description | 50% |
| D | No meaningful description | 25% |

## Assessment Workflow

### Phase 1: Tool Discovery (5 minutes)

```bash
# Run tool discovery
registry(action: "tools", service_name: '<service>')

# Check response for:
# - schemaVersion (1 = needs upgrade, 2 = good)
# - toolCount (should have at least 1 tool)
# - hasFullSchemas flag
# - nextSteps guidance
```

**Quality Signals from Response**:
```javascript
// schemaVersion 2 - Good quality
{
  schemaVersion: 2,
  hasFullSchemas: true,
  nextSteps: ["Found 4 tools with full parameter schemas..."]
}

// schemaVersion 1 - Needs improvement
{
  schemaVersion: 1,
  hasFullSchemas: false,
  nextSteps: ["⚠️ Tool parameter schemas not available (schemaVersion: 1)..."]
}
```

### Phase 2: Health Check (2 minutes)

```bash
# Run health check with diagnostics
services(action: "health", service_name: '<service>', includeDiagnostics: true)

# Check response for:
# - status (ACTIVE, INACTIVE, MAINTENANCE)
# - successRate (target: 99%+)
# - averageResponseTime (target: <500ms)
# - lastHeartbeat (should be recent)
```

### Phase 3: Tool Test (5 minutes per tool)

```bash
# Test each registered tool
services(action: "call")(
  targetService: '<service>',
  tool: '<tool_name>',
  arguments: { /* from inputSchema */ }
)

# Verify:
# - Tool executes successfully
# - Error responses are structured
# - Response matches expected schema
```

### Phase 4: Score Calculation

```
Overall Score = (Schema × 0.4) + (Health × 0.3) + (Functionality × 0.2) + (Documentation × 0.1)

Grade Mapping:
- A+: 95-100% (Excellent - reference implementation)
- A:  90-94%  (Very Good - minor improvements possible)
- A-: 85-89%  (Good - some improvements recommended)
- B+: 80-84%  (Adequate - improvements needed)
- B:  75-79%  (Acceptable - significant improvements needed)
- C:  <75%    (Needs Work - remediation required)
```

## Remediation Guidance

### schemaVersion 1 → 2 Upgrade

**Problem**: Service registered with string-only tool names (no inputSchema)

**Solution**: Re-register with full tool schemas

```javascript
// Before (legacy)
registry(action: "register")({
  name: 'my-service',
  capabilities: {
    tools: ['send_notification', 'list_channels']  // String only
  }
})

// After (full schemas)
registry(action: "register")({
  name: 'my-service',
  capabilities: {
    tools: [
      {
        name: 'send_notification',
        description: 'Send notification to user or channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Target channel ID' },
            message: { type: 'string', description: 'Message content' },
            priority: { type: 'string', enum: ['low', 'normal', 'high'] }
          },
          required: ['channel', 'message']
        }
      }
    ]
  }
})
```

### Health Issues

| Issue | Solution |
|-------|----------|
| High response time | Check endpoint latency, consider caching |
| Low success rate | Review error logs, fix failing operations |
| Stale heartbeat | Ensure health endpoint is responding |
| Endpoint unreachable | Verify URL, check firewall rules |

### Documentation Issues

| Issue | Solution |
|-------|----------|
| Vague description | Add specific use cases and capabilities |
| Missing capabilities | List all tools, resources, prompts |
| No contact info | Add maintainer email or support URL |

## Automation Hooks

### Pre-Registration Check
The `register_service_wizard` prompt guides users through quality registration:
1. Asks for full tool schemas (not just names)
2. Validates inputSchema structure
3. Recommends description improvements
4. Checks endpoint accessibility

### Post-Registration Feedback
The `registry(action: "tools")` response includes implicit quality feedback:
- `schemaVersion: 1` triggers upgrade guidance in `nextSteps`
- `hasFullSchemas: false` indicates improvement opportunity
- Specific recommendations based on tool structure

### Periodic Assessment
Schedule monthly quality reviews:
```bash
# List all services for assessment
services(action: "discover", status: 'ACTIVE')

# Assess each service
for service in services:
  registry(action: "tools", serviceId: service.id)
  services(action: "health", serviceId: service.id)
  # Record scores
```

## Integration with Gold Standards

This protocol aligns with the MCP Tool Gold Standard Pattern (GS1-GS10):

| Gold Standard | Assessment Application |
|--------------|----------------------|
| GS4 State-Aware Responses | `registry(action: "tools")` adapts nextSteps based on schemaVersion |
| GS7 Error Response nextSteps | Quality feedback embedded in error responses |
| GS9 Success Response _meta | Assessment metadata included in responses |

## Quick Reference

```bash
# Full assessment workflow
registry(action: "tools", service_name: '<service>')    # Schema quality
services(action: "health", service_name: '<service>')   # Health reliability
services(action: "call", targetService: '<service>', ...)   # Functionality test

# Interpret schemaVersion
schemaVersion: 2 → Full schemas, good quality
schemaVersion: 1 → Legacy, recommend upgrade

# Target metrics
Schema Quality: Full inputSchema for all tools
Health: 99%+ uptime, <500ms response
Tools: All callable with proper error handling
Docs: Clear description with capability list
```

## Related Resources

- **Integration Guide**: `/.claude/knowledge/domain/mcp/mcp-hub-integration-guide.md`
- **Gold Standard Pattern**: `/.claude/knowledge/patterns/mcp-tool-gold-standard-pattern.md`
- **Docker Service Pattern**: `/.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md`
- **Test Script**: `scripts/test-gold-standard-compliance.js`
- **Discovery Prompt**: `/.claude/knowledge/discoveries/mcp-hub-discovery.md` (Section 21)
