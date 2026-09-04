# MCP Tool Assignment Flow

> **Version**: 1.0 | **Updated**: 2026-03-10 | **Confidence**: 95%
> **Author**: prompt-construction-specialist
> **Related**: `tool-architecture-reference.md`, `agent-prompt-assembly-pattern.md`

## Overview

This document traces the complete pipeline of how MCP tools flow from configuration to LLM execution — from initial selection through validation, storage, retrieval, and finally conversion to callable LLM function schemas.

## The Two-Layer Approach

MCP tools reach the LLM in two complementary layers:

| Layer | What | Purpose |
|-------|------|---------|
| **Layer 1: Prompt text** | `"You have access to: project, perform, analytics..."` | Guidance on when/how to use tools |
| **Layer 2: Function schemas** | `tools: [{ name, description, parameters }]` | Actual callable function definitions |

Both layers are injected at execution time. The LLM needs Layer 1 for behavioral guidance and Layer 2 for schema-compliant tool calls.

## Complete Pipeline: 3 Stages

### Stage 1: Selection (`agent.configure` handler)

**File**: `lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts`

When `agent.configure` is called with a `taskId` and `agentTemplateId`, the handler determines which tools the agent gets:

```
Sources merged (deduplicated):
├── Template metadata.mcpToolConfiguration.selectedTools  (from UI)
├── Template metadata.mcpConfiguration.mcpTools           (alternate naming)
└── mcpTools parameter from MCP command                   (caller override)
         ↓
    allRequestedTools = [...new Set([...templateTools, ...commandTools])]
```

Each requested tool is **validated** against actually available tools by querying:
1. `mcpService.getAllTools()` — live server tools
2. `mcpToolRegistry.searchTools({})` — registered tools
3. `embeddedMCPServer.getTools()` — embedded server tools

Only validated tools survive. Unknown tools are logged as warnings and dropped.

**Key code** (lines 264-289):
```typescript
const normalizedTemplateMcpTools = templateMcpTools.map(tool => {
  if (typeof tool === 'string') return tool;
  if (typeof tool === 'object' && tool !== null) {
    const toolObj = tool as any;
    return toolObj.toolName || toolObj.name || (toolObj.toolId ? toolObj.toolId.split(':').pop() : null);
  }
  return null;
}).filter(Boolean);

const allRequestedTools = [...new Set([...normalizedTemplateMcpTools, ...(mcpTools || [])])];

// Validate against available
for (const requestedTool of allRequestedTools) {
  if (allAvailableToolNames.includes(requestedTool)) {
    validatedMcpTools.push(requestedTool);
  } else {
    log.warn({ tool: requestedTool, source }, 'tool not available');
  }
}
```

### Stage 2: Storage (task database record)

The validated tools are stored in **two places** on the task:

```typescript
// 1. mcpContext.tools — array of tool objects (primary)
updateData.mcpContext = {
  tools: validatedMcpTools.map((toolName, index) => ({
    id: `tool-${index}`,
    name: toolName,
    serverName: 'unknown'
  })),
  workflow: { ... },
  successMetrics: [ ... ],
  configuredVia: 'mcp',
  configuredAt: new Date().toISOString()
};

// 2. mcpToolId — shortcut when single tool
updateData.mcpToolId = validatedMcpTools.length === 1 ? validatedMcpTools[0] : undefined;
```

### Stage 3: Retrieval & Conversion (execution time)

**Files**:
- `app/api/pov/agent/execute/stream/route.ts` (streaming path)
- `lib/services/agentExecutionEngine.ts` (engine path)

When the task executes, tools are read back and converted through 4 steps:

**Step 3a — Read tool names from `task.mcpContext.tools`:**
```typescript
const rawNames = mcpContext.tools.map(tool => tool.name || tool);
```

**Step 3b — Map legacy names to consolidated names:**
```typescript
const LEGACY_TOOL_MAP: Record<string, string> = {
  'list_povs': 'project',
  'get_pov_details': 'project',
  'list_tasks': 'project',
  'execute_task_action': 'perform',
  'get_ai_recommendations': 'analytics',
  'list_agent_templates': 'template',
  'call_service': 'services',
  'register_service': 'registry',
  // ... etc
};

for (const name of rawNames) {
  mapped.add(LEGACY_TOOL_MAP[name] || name);
}
mcpToolNames = [...mapped];
```

**Step 3c — Default if none specified:**
```typescript
const CONSOLIDATED_TOOLS = ['project', 'perform', 'analytics', 'template', 'services', 'registry'];

if (mcpToolNames.length === 0) {
  mcpToolNames = [...CONSOLIDATED_TOOLS];
}
```

**Step 3d — Convert to LLM function schemas:**
```typescript
const toolDefinitions = await mcpServerManager.getToolDefinitions(mcpToolNames);

mcpFunctions = toolDefinitions.map(({ tool }) => ({
  name: tool.name,
  description: tool.description || `MCP tool: ${tool.name}`,
  parameters: tool.inputSchema || { type: 'object', properties: {}, required: [] }
}));
```

**Step 3e — Inject into LLM call (both layers):**
```typescript
// Layer 1: Text guidance in prompt
mcpToolsInfo = `You have access to the following MCP tools: ${mcpToolNames.join(', ')}. Use them when needed.`;

// Layer 2: Function schemas passed to LLM API
llmResponse = await llmService.generateText(userPrompt, {
  systemPrompt,
  tools: mcpFunctions,   // ← actual callable schemas
  // ...
});
```

## Visual Summary

```
agent.configure(taskId, agentTemplateId, mcpTools?)
       │
       ▼
  ┌─────────────────────┐
  │ Merge template +    │
  │ command tools        │
  │ Validate against     │
  │ available servers    │
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │ task.mcpContext = {  │  ← Stored in DB
  │   tools: [...]       │
  │ }                    │
  └──────────┬──────────┘
             │
    execute/stream ──────────────────────┐
             │                           │
             ▼                           ▼
  ┌──────────────────┐      ┌──────────────────────┐
  │ Read tool names   │      │ Legacy name mapping   │
  │ from mcpContext   │      │ (old → consolidated)  │
  └────────┬─────────┘      └──────────┬───────────┘
           │                           │
           └───────────┬───────────────┘
                       ▼
           ┌───────────────────────┐
           │ mcpServerManager      │
           │ .getToolDefinitions() │
           │                       │
           │ Returns: name,        │
           │ description, schema   │
           └───────────┬───────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │ LLM receives:         │
           │  • Text guidance      │
           │  • Function schemas   │
           │  • Agentic tool loop  │
           │    (up to 5 turns)    │
           └───────────────────────┘
```

## Key Details

### Default Tools
When no tools are configured, the system defaults to all 6 consolidated tools:
`project`, `perform`, `analytics`, `template`, `services`, `registry`

### Legacy Name Mapping
Tasks configured before tool consolidation may have old granular names stored (e.g., `list_povs`, `execute_task_action`). The `LEGACY_TOOL_MAP` ensures these map to the current consolidated tool names at execution time.

### Hub Tool Guidance
When `services` is in the tool list, `buildHubToolGuidance()` (in `agentExecutionEngine.ts`) appends additional routing guidance teaching the LLM to use `services(action: "call")` as the gateway for hub service calls. This queries the `MCPTool` table for active services.

### Agentic Tool Loop
The streaming route supports up to **5 tool turns** with a base timeout of 180s + 60s per turn. When the LLM returns a `tool_use` stop reason, the system:
1. Executes the tool call via MCP
2. Appends the result to the conversation
3. Calls the LLM again with updated context
4. Repeats until `end_turn` or max turns reached

### Validation Behavior
- Tools not found in any server are silently dropped (with a `log.warn`)
- The task still configures successfully even if some tools are unavailable
- At execution time, `mcpServerManager.getToolDefinitions()` only returns schemas for tools that are actually running

## Related Files

| File | Role |
|------|------|
| `lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts` | Stage 1: Selection & validation |
| `app/api/pov/agent/execute/stream/route.ts` | Stage 3: Streaming path retrieval & conversion |
| `lib/services/agentExecutionEngine.ts` | Stage 3: Engine path retrieval & conversion |
| `lib/services/mcp/serverManager.ts` | `getToolDefinitions()` — schema resolution |
| `lib/services/mcp/toolRegistry.ts` | Tool registration & search |
| `lib/mcp/embedded-server.ts` | Embedded MCP server tool listing |

## When to Reference This Document

- Debugging why an agent doesn't have expected tools
- Understanding the legacy→consolidated tool name mapping
- Tracing tool availability validation failures
- Understanding the two-layer (text + schema) injection pattern
- Investigating agentic tool loop behavior
