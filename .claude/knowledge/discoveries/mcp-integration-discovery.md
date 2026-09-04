# MCP Integration Specialist Discovery

**Last Updated**: 2026-06-11 (health-run: dead paths purged, ensureObject growth re-proven, snapshot banner)
**Status**: Enhanced v5.2 - Production-tested with security architecture
**Confidence**: Very High - Production-tested with security architecture
**Last Validated**: 2026-06-11 - File inventory re-proven; console.log=0 holds; ensureObject 7→21 files

## Objective
Perform a comprehensive discovery of the MCP (Model Context Protocol) tool integration system to understand tool registration, discovery, execution routing, parameter handling, and the static tool registration pattern implementation.

## Context
MCP tools enable agents to interact with external services. The system uses a dual-server architecture (embedded + MCP v5), unified storage approach, static tool registration, and agent function calling integration. We need to understand the complete tool lifecycle, storage patterns, UI integration, execution flows, and security boundaries.

**Important Distinction**: MCP has two concepts - **Tools** (functions to execute) and **Resources** (data accessed via mcp:// URIs). This discovery focuses on **Tools**. For Resources, see resource-manager-discovery.md.

**Plan 8 Security Context**: The system now implements tool security boundaries:
- Public tools accessible without authentication
- Authenticated tools requiring user login
- Admin tools requiring elevated privileges
- Security enforcement via middleware
- Public data filtering for sensitive information

## Discovery Scope

### 1. Tool Registration and Discovery
Search for and document:
- Static tool definitions and registration
- Dynamic tool discovery from servers
- Tool registry implementation
- Server configuration (~~.mcp-servers.json~~ DELETED — external-server config retired; registry lives in the mcp_tools DB table)
- Startup registration flow

### 1.1 HTTP Transport Support (NEW)
Analyze:
- HTTP server wrapper (mcp-server-http-clean.js)
- StreamableHTTPServerTransport usage
- Per-session transport architecture
- Authentication middleware integration
- CORS configuration for cross-origin

### 2. Execution Methods
Identify:
- Agent execution engine integration
- Static tool registration and calling
- Agent LLM function calling patterns
- Tool execution routing logic
- Tool result formatting

### 3. Server Management
Find:
- MCPServerManager implementation
- Server lifecycle (connecting, connected, disconnected)
- Server persistence patterns
- Health monitoring mechanisms
- Connection error handling

### 4. Parameter Handling
Analyze:
- Parameter normalization patterns
- Validation against schemas
- Parameter transformation logic
- Common parameter aliases
- Error messages for invalid params

### 5. Integration Points
Locate:
- Agent execution engine tool calls
- Tool selection for prompts
- Result processing in agents
- Error handling in execution flow
- Tool availability checking

### 6. MCP Tools vs Server-Side Prompts Paradigm (NEW - Nov 15, 2025)

**Critical Discovery**: Two different execution contexts in MCP server

Identify and document:
- **MCP Tool handlers execution path**: AI client → MCP protocol → Tool handler → `apiClient.post()` → API/HTTP → Database (for `perform`, `team-performance`, `agent-results`)
- **Embedded server resource reads** (P6 migration, Mar 2026): AI client → MCP protocol → `readResource()` → Direct `prisma.findMany()` with `buildPOVAccessFilter`/`buildTaskAccessFilter` → Database (same process, no HTTP)
- **Server-Side Prompts execution path**: Prompt registry → Direct `prisma.findMany()` → Database (same process)
- **Why different**: Tool handlers use API boundaries for write operations; resource reads and prompts are internal read-only (direct DB access)
- **Pattern implications**: Tools use MetadataEnhancer for pagination, prompts use manual count()
- **Examples**: project(action: 'task.list') (tool) vs audit_all_tasks (prompt)

**Files to Check**:
```bash
# MCP Tools (external interface)
grep -rn "apiClient.get" lib/mcp/server/tools/

# Server-Side Prompts (internal functions)
grep -rn "prisma\\..*\\.findMany\|prisma\\..*\\.count" lib/mcp/server/prompts/

# Compare execution contexts
```

**Documentation**: Pattern 4 in `/.claude/knowledge/patterns/mcp-metadata-exposure-pattern.md`

### 7. Tool Security (Plan 8)
Analyze:
- Tool security configuration file
- PUBLIC_TOOLS array definition
- AUTHENTICATED_TOOLS array definition
- ADMIN_TOOLS array definition
- enforceToolSecurity() middleware
- Public data filtering implementation

## Search Strategies

### 1. Core MCP Components
```bash
# Server manager and registry
grep -r "MCPServerManager\|mcpServerManager" --include="*.ts" -l
grep -r "class MCPServerManager\|new MCPServerManager" --include="*.ts"

# Tool execution patterns
grep -r "mcpServerManager\|getToolDefinitions" --include="*.ts" -B 2 -A 5
grep -r "callExternalTool\|executeTool\|executeToolOnServer" --include="*.ts" -A 3

# Tool registry
grep -r "toolRegistry\|registerTool\|getToolDefinition" --include="*.ts"
grep -r "tools\.set\|tools\.get\|tools\.has" --include="*.ts" | grep -i mcp

# Main MCP server file (handles both tools and resources)
echo "=== Checking mcp-server-v5.js ==="
grep -c "CallToolRequestSchema" mcp-server-v5.js
grep -c "ListToolsRequestSchema" mcp-server-v5.js
grep "class.*Server\|export.*Server" mcp-server-v5.js
```

### 2. Tool Discovery and Registration
```bash
# Tool list and discovery
grep -r "tools/list\|tools/call" --include="*.ts" -B 2 -A 2
grep -r "staticTools\|dynamicTools" --include="*.ts"

# Tool definitions
grep -r "toolName\|tool_name" --include="*.ts" | grep -v "node_modules" | head -20
grep -r "inputSchema\|outputSchema" --include="*.ts" -B 2 -A 5

# Server configuration
find . -name ".mcp-servers.json" -o -name "mcp-servers.json" | xargs cat
grep -r "mcpServersConfig\|mcp-servers" --include="*.ts"
```

### 3. Execution Methods and Routing
```bash
# Agent execution engine integration
grep -r "mcpFunctions\|functionCall.*auto" --include="*.ts" -B 2 -A 5
grep -r "enhancedConfig\.mcpTools" --include="*.ts" | head -10

# Static tool registration
grep -r "staticTools\|getStaticTools" --include="*.ts" -B 2 -A 5
grep -r "sdk-native.*tools" --include="*.js" -l

# Tool results and errors
grep -r "toolResult\|tool_result" --include="*.ts" -A 3
grep -r "isError.*true\|_meta.*error" --include="*.ts"
```

### 4. Parameter Processing and Validation
```bash
# Parameter normalization
grep -r "normalizeParameters\|validateParameters" --include="*.ts" -B 2 -A 5
grep -r "parameters.*\|\|.*params" --include="*.ts" | grep -i tool

# Schema validation
grep -r "required.*:.*\[\|properties.*:.*{" --include="*.ts" | grep -B 3 -A 3 tool
grep -r "transformParameters\|mapParameters" --include="*.ts"

# Parameter aliases and mappings
grep -r "param.*alias\|alias.*param" --include="*.ts" -i
grep -r "povId.*\|\|.*pov_id\|taskId.*\|\|.*task_id" --include="*.ts"
```

### 5. Server Lifecycle Management
```bash
# Server connections
grep -r "connectServer\|disconnectServer\|serverConnection" --include="*.ts"
grep -r "connecting\|connected\|disconnected" --include="*.ts" | grep -i mcp

# Server persistence
grep -r "prisma\.mCPServer" --include="*.ts" -A 3
grep -r "upsert.*server\|findUnique.*server" --include="*.ts" | grep -i mcp

# Health monitoring
grep -r "checkHealth\|serverHealth\|ping.*server" --include="*.ts"
grep -r "lastSeen\|last_seen\|heartbeat" --include="*.ts" | grep -i mcp
```

### 6. Integration and Error Handling
```bash
# Agent integration
grep -r "mcpServerManager\.getToolDefinitions" --include="*.ts" -B 2 -A 5
grep -r "mcpTools\|mcp_tools" --include="*.ts" -B 2 -A 2

# Error patterns
grep -r "MCPError\|ToolError\|tool.*error" --include="*.ts" -i
grep -r "timeout.*tool\|tool.*timeout" --include="*.ts" -i

# Retry and recovery
grep -r "retry.*tool\|tool.*retry" --include="*.ts"
grep -r "fallback\|recover.*tool" --include="*.ts"
```

### 7. Streamable HTTP Transport Implementation (NEW - Plan 10)
```bash
# Check Streamable HTTP transport implementation
echo "=== Streamable HTTP Transport Analysis ==="
echo "Transport module implementation:"
# streamable-http.js DELETED as dead code (756e5f67) — transport is SDK StreamableHTTPServerTransport wired in lib/mcp/server/mcp-core.ts

echo -e "\nMCP HTTP server Streamable HTTP enhancement:"
grep -A 10 "handleStreamableHTTPRequest\|streamable-http\|JSON-RPC" mcp-server-http-clean.js

echo -e "\nOrigin validation security:"
grep -rn "validateOrigin\|allowedOrigins\|DNS rebinding" lib/mcp/server/ --include="*.ts" --include="*.js" | head -5

echo -e "\nJSON-RPC processing capabilities:"
grep -rn "processRequest\|batched.*request" lib/mcp/server/mcp-core.ts | head -5

echo -e "\nSession management:"
grep -rn "Mcp-Session-Id\|mcp-session-id" lib/mcp/server/ --include="*.ts" --include="*.js" | head -5

echo -e "\nMCP 2025-03-26 specification compliance:"
curl -s http://localhost:8080/health | jq '.mcp.streamableHttp, .mcp.compliance' 2>/dev/null || echo "Server not running"

echo -e "\nTest Streamable HTTP functionality:"
curl -I -X POST http://localhost:8080/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" 2>/dev/null || echo "Server not running"
```

### 8. Plan 8 Tool Security Implementation
```bash
# Tool security configuration
echo "=== Plan 8: Tool Security Architecture ==="
echo "Security configuration file:"
ls -la ./lib/mcp/server/config/tool-security.js
grep -c "PUBLIC_TOOLS\|AUTHENTICATED_TOOLS\|ADMIN_TOOLS" ./lib/mcp/server/config/tool-security.js 2>/dev/null || echo "0"

echo "Public tools list:"
grep "PUBLIC_TOOLS.*=.*\[" ./lib/mcp/server/config/tool-security.js -A 10

echo "Authenticated tools list:"
grep "AUTHENTICATED_TOOLS.*=.*\[" ./lib/mcp/server/config/tool-security.js -A 20

echo "Admin tools list:"
grep "ADMIN_TOOLS.*=.*\[" ./lib/mcp/server/config/tool-security.js -A 5

echo "Security enforcement middleware:"
grep -r "enforceToolSecurity" --include="*.js" | head -10

echo "Tool security level checking:"
grep -r "isPublicTool\|getToolSecurityLevel" --include="*.js" | head -10

echo "Public data filtering:"
ls -la ./lib/mcp/server/tools/public-discovery-filter.js
grep -c "filterPublicServiceData" ./lib/mcp/server/tools/public-discovery-filter.js 2>/dev/null || echo "0"

echo "Authentication context in tools:"
grep -r "context.*user.*id\|context.*user.*role" ./lib/mcp/server/tools/ --include="*.js" | head -10
```

### 8. Performance and Monitoring (ENHANCED - Phase 1 Optimization)
```bash
# Tool execution metrics
grep -r "tool.*duration\|execution.*time" --include="*.ts" | grep -i mcp
grep -r "tool.*count\|usage.*metric" --include="*.ts"

# Resource Manager Performance Optimization (NEW)
echo "=== Resource Manager N+1 Elimination ==="
grep -n "resource.*cache\|resource.*discovery" lib/services/mcp/resourceManager.ts 2>/dev/null | head -5   # path corrected 2026-06-11 (lives under mcp/)
echo "Resource discovery optimized - achieved 80% performance reduction"

# Context Builder Performance (NEW)
echo -e "\n=== MCP Context Builder Optimization ==="
grep -r "context.*builder.*performance\|execution.*context" --include="*.ts" | head -3
echo "MCP execution context building optimized for Tasks 7-8"

# Caching and optimization
grep -r "toolCache\|cachedTools" --include="*.ts"
grep -r "connection.*pool\|reuse.*connection" --include="*.ts" | grep -i mcp

# Query Mapper Integration with MCP (NEW)
echo -e "\n=== MCP Query Mapper Integration ==="
grep -r "mcpContext.*includeMcpContext\|MinimalSelects.*task.*mcpContext" lib/database/query-mappers.ts | head -3
echo "MCP context now integrated into query mappers for optimal loading"

# Logging and debugging
grep -r "log.*tool\|debug.*mcp" --include="*.ts" -i
grep -r "trace.*execution\|verbose.*tool" --include="*.ts"
```

### 8.1. Split-Brain Architecture Detection
```bash
# CRITICAL: Dual MCP Integration Paths  
echo "=== MCP Split-Brain Architecture Detection ==="
echo "Embedded vs External server patterns:"
grep -r "embedded.*server\|external.*server" --include="*.ts" -B 3 -A 3 | head -10

echo "DirectToolExecutor vs SDK patterns:"
grep -r "directToolExecutor\|SDK\.request" --include="*.ts" | grep -E "(fallback|alternative)" | head -10

echo "Dual tool registration patterns:"
grep -r "registerTool.*static\|registerTool.*dynamic" --include="*.ts" -A 5 -B 5 | head -10

# Environment Variable Bypass Detection
echo "=== MCP Environment Variable Bypass ==="
echo "API key override patterns:"
grep -r "PAICHART_API_KEY.*override\|bypass.*api.*key" --include="*.ts" -B 2 -A 2

echo "MCP server configuration bypasses:"
grep -r "MCP_.*skip\|MCP_.*disable" --include="*.ts" -B 3 -A 3

# Tool Registry Inconsistencies
echo "=== MCP Tool Registry Split-Brain ==="
echo "Tool caching inconsistencies:"
grep -r "tool.*registry.*dual\|tool.*cache.*split" --include="*.ts" -B 3 -A 3

echo "Server connection dual paths:"
grep -r "mcp.*connection.*fallback\|server.*backup" --include="*.ts" -B 2 -A 2
```

### 9. Tool Storage and Configuration Patterns
```bash
# Task-level MCP storage
grep -r "mcpContext" --include="*.ts" -B 2 -A 5 | grep -E "task\.|Task"
grep -r "task\.mcpContext\.tools" --include="*.ts"

# Agent template MCP storage
grep -r "metadata\.mcpToolConfiguration" --include="*.ts" -B 2 -A 5
grep -r "selectedTools" --include="*.ts" | grep -i template

# Legacy storage patterns (should be empty)
grep -r "capabilities\.mcpTools" --include="*.ts"
grep -r "metadata\.mcpConfiguration" --include="*.ts" | grep -v "mcpToolConfiguration"
```

### 10. UI Component Integration
```bash
# MCP tool selection components
find components -name "*MCPTools*" -o -name "*ToolSelector*" | grep -i mcp
grep -r "MCPToolsSelector\|AgentConfigurationForm" components/ --include="*.tsx" -l

# Dashboard components
grep -r "MCPToolDashboard\|MCPServerManager" components/ --include="*.tsx" -l

# Template configuration components
grep -r "MCPToolsTab\|AgentConfigTab" components/ --include="*.tsx" -l
```

### 11. Agent Execution Engine Integration
```bash
# Tool to function conversion
grep -r "getToolDefinitions\|getToolDefinition" --include="*.ts" -B 2 -A 5
grep -r "LLMFunction.*mcp\|mcpFunctions" --include="*.ts"

# Function calling in agents
grep -r "options\.functions.*=.*mcp\|functionCall.*name" --include="*.ts" -B 5 -A 5
grep -r "Tool call requested\|Tool belongs to server" --include="*.ts"

# Enhanced config extraction
grep -r "enhancedConfig\.mcpTools" --include="*.ts" -B 2 -A 10
```

### 12. Static Tools Fallback System
```bash
# Static tool definitions
find . -name "staticTools.ts" -o -name "*static*tool*" | grep -v node_modules
grep -r "STATIC_SERVER_TOOLS\|StaticServerTools" --include="*.ts"

# Static tool registration
grep -r "registerStaticTools\|hasStaticTools\|getStaticTools" --include="*.ts" -B 2 -A 5

# Tool extraction scripts
find scripts -name "*mcp-tools*" -o -name "*query*tool*"
ls -la scripts/mcp-tools-output/
```

### 13. Server Lifecycle and Persistence
```bash
# Shutdown behavior
grep -r "shutdown.*server\|removeServer.*embedded\|disconnectServer" --include="*.ts" -B 5 -A 5

# External vs embedded differentiation
grep -r "isEmbedded\|transport.*embedded" --include="*.ts" -B 2 -A 2

# Server config persistence
grep -r "serverConfigStore\|\.mcp-servers\.json" --include="*.ts"
```

### 13. Dual-Server Architecture
```bash
# Embedded server
grep -r "embedded-server\.ts\|embeddedServer" --include="*.ts" -l
grep -r "Direct database access\|No network overhead" --include="*.ts" --include="*.md"

# MCP Server v5
find . -name "mcp-server-v*.js" | xargs ls -la
grep -r "SDK-Native Tool Handlers\|SimpleResourceManager" --include="*.js"

# Shared tool implementations
find . -name "sdk-native-*-tools.js" | xargs ls -la
```

### 14. Parameter Format Compatibility
```bash
# Nested vs top-level parameters
grep -r "parameters\.\|action.*parameters" --include="*.ts" -B 3 -A 3 | grep -E "nested|top.*level"
grep -r "Claude Desktop.*compat\|parameter.*format" --include="*.ts" --include="*.md"

# Special handling patterns
grep -r "stage\.create.*param\|backward.*compat" --include="*.ts" -B 2 -A 5
```

### 15. Prompt Command Tool Integration
```bash
# Prompt command tool discovery
echo "=== Prompt Command Tool ==="
grep -r "prompt_command" --include="*.js" --include="*.ts" -l
grep -r "PromptCommandHandler" --include="*.js" --include="*.ts" -l

# /prompt command patterns
grep -r "\/prompt\s" --include="*.js" --include="*.ts" --include="*.md"
grep -r "commandPattern.*prompt" --include="*.js"

# Prompt registry integration
grep -r "promptRegistry\|PromptRegistry" --include="*.js" --include="*.ts" -l
grep -r "registerPrompt\|getPrompt\|listPrompts" --include="*.js" --include="*.ts"

# Command parsing and execution
grep -r "isPromptCommand\|parseCommand\|executePromptCommand" --include="*.js" --include="*.ts"
grep -r "handleIfPromptCommand" --include="*.js" --include="*.ts"

# Tool registration in schemas
grep -r "prompt_command.*title\|prompt_command.*description" lib/mcp/server/config/tool-schemas.js
grep -r "handlePromptCommand" lib/mcp/server/tools/sdk-native-basic-tools.js

# Integration in request handler
grep -r "promptCommandHandler.*isPromptCommand" mcp-server-v5.js -B 2 -A 5
grep -r "this\.promptCommandHandler\s*=" mcp-server-v5.js

# Test for prompt command functionality
if [ -f test-prompt-commands.js ]; then
  echo "Prompt command test script exists ✅"
  grep -c "\/prompt help\|\/prompt list" test-prompt-commands.js
fi
```

### 16. Migration and Legacy Patterns
```bash
# Find legacy storage usage
echo "=== Legacy Storage Patterns (should be minimal) ==="
grep -r "metadata\.mcpConfiguration" --include="*.ts" | grep -v "mcpToolConfiguration" | wc -l
grep -r "capabilities.*mcpTools" --include="*.ts" | wc -l

# Check migration completeness
echo "=== Current Storage Patterns ==="
grep -r "mcpContext.*tools" --include="*.ts" | wc -l
grep -r "mcpToolConfiguration.*selectedTools" --include="*.ts" | wc -l
```

### 17. HTTP Transport and Claude Desktop Integration
```bash
# HTTP wrapper implementation
echo "=== HTTP Transport Server ==="
if [ -f mcp-server-http-clean.js ]; then
  echo "HTTP wrapper exists ✅"
  grep -c "StreamableHTTPServerTransport" mcp-server-http-clean.js
  grep -c "per-session" mcp-server-http-clean.js
fi

# Authentication middleware
echo "=== Auth Middleware ==="
find lib/auth -name "*mcp-http*" -type f | xargs ls -la
grep -r "verifyAccessToken.*mcp" --include="*.ts" | head -3

# CORS configuration
echo "=== CORS Settings ==="
grep -r "cors.*origin" mcp-server-http-clean.js
grep -r "credentials.*true" mcp-server-http-clean.js

# Claude Desktop configs
echo "=== Claude Desktop Configs ==="
find . -name "*claude_desktop*" -name "*.json" | xargs ls -la
grep -c "mcp-remote" claude_desktop_config*.json 2>/dev/null || echo "0"

# mcp-remote package usage
echo "=== mcp-remote Bridge ==="
grep "mcp-remote" package.json
grep -r "@smithery/mcp-remote-client\|mcp-remote" --include="*.json" --include="*.md"
```

### 18. Transport Architecture Patterns
```bash
# Session management
echo "=== Session Architecture ==="
grep -r "sessionId\|session_id" mcp-server-http-clean.js | head -5
grep -r "transports\[sessionId\]" mcp-server-http-clean.js

# Transport lifecycle
echo "=== Transport Lifecycle ==="
grep -r "onsessioninitialized\|transport\.handleRequest" mcp-server-http-clean.js
grep -r "transport\.close\|cleanup.*session" mcp-server-http-clean.js

# Error handling in HTTP
echo "=== HTTP Error Handling ==="
grep -r "catch.*error\|res\.status" mcp-server-http-clean.js | head -5
grep -r "CORS_ERROR\|AUTH_ERROR" --include="*.js" --include="*.ts"
```

### 19. Centralized Validation Alias Mapping (Dec 2025 Sprint 3) ⭐ NEW
```bash
# Sprint 3: MCP Action Validation Enhancement
# 40 missing parameters fixed across 9 schemas

echo "=== Centralized Alias Mapping System ==="
# Find PARAMETER_ALIAS_MAPPINGS constant (14 aliases)
grep -A 25 "const PARAMETER_ALIAS_MAPPINGS" lib/validation/mcp-action-validation.ts

# Find normalizeAliases function
grep -A 20 "function normalizeAliases" lib/validation/mcp-action-validation.ts

# Find schemas using normalizeAliases (5 schemas)
grep -n "normalizeAliases" lib/validation/mcp-action-validation.ts

echo "=== Semantic Enum Mappings (6 fields) ==="
# priority, status, workflowType, position, type, analysisType
grep -A 50 "const SEMANTIC_ENUM_MAPPINGS" lib/validation/mcp-action-validation.ts

echo "=== Error Message Example Values (29 examples) ==="
grep -A 40 "const exampleValues" lib/validation/mcp-action-validation.ts

echo "=== Handler vs Schema Audit (Discovery #9) ==="
# Extract handler parameters
for handler in lib/mcp/tasks/action/handlers/*/*.ts; do
  echo "--- $handler ---"
  grep -A 30 "const {" "$handler" | grep -E "^\s+\w+," | head -20
done

# Reference: /.claude/knowledge/protocols/quarterly-review-protocol.md - Discovery #9
```

**Key Pattern**: `optional() + .refine() + .transform(normalizeAliases)`
**Files**:
- `lib/validation/mcp-action-validation.ts` - Centralized aliases (lines 99-145)
- `lib/mcp/server/utils/parameter-normalizer.js` - Runtime normalization (separate layer)

**Alias Support**:
- Snake_case → camelCase: `task_name→taskName`, `pov_id→povId`, `due_date→dueDate`
- Alternative naming: `role→agentRole`, `completionNotes→completionNote`
- Context-specific: `stageName→name` (stage.create only)

### 20. Error Helper Pattern (Dec 2025)
```bash
# Error helper modules - centralized, reusable error generators
echo "=== Error Helper Modules ==="
ls -la lib/mcp/server/tools/basic/error-helpers.js
ls -la lib/mcp/server/tools/advanced/error-helpers.js
# tools/browser/ DELETED (17185e45 — browser automation moved to standalone Docker service)

# Error helper functions defined
echo "=== Error Helper Functions Defined ==="
grep -n "^function\|^const.*Error\|module\.exports" lib/mcp/server/tools/basic/error-helpers.js
grep -n "^function\|^const.*Error\|module\.exports" lib/mcp/server/tools/advanced/error-helpers.js
# tools/browser/ DELETED (17185e45 — browser automation moved to standalone Docker service)

# Error helper usage in handlers
echo "=== Error Helper Integration ==="
grep -rn "require.*error-helpers\|from.*error-helpers" lib/mcp/server/tools/ --include="*.js"
grep -rn "povNotFoundError\|taskNotFoundError\|agentExecutionNotFoundError" lib/mcp/server/tools/ --include="*.js"

# Error helper pattern: fuzzy suggestions
echo "=== Fuzzy Suggestion Pattern ==="
grep -rn "getScoredSuggestions\|findBestMatch" lib/mcp/server/tools/ --include="*.js" | head -10

# Verify consistent error format
echo "=== Error Format Consistency ==="
grep -rn "❌\|🔍\|💡\|🔧" lib/mcp/server/tools/*/error-helpers.js | head -10
```

### 20. Tool Schema Documentation Patterns (Dec 2025)
```bash
# Tool schema file
echo "=== Tool Schema Location ==="
ls -la lib/mcp/server/config/tool-schemas.js

# WHEN TO USE pattern coverage
echo "=== WHEN TO USE Pattern Coverage ==="
grep -c "WHEN TO USE:" lib/mcp/server/config/tool-schemas.js

# SEE ALSO pattern coverage
echo "=== SEE ALSO Pattern Coverage ==="
grep -c "SEE ALSO:" lib/mcp/server/config/tool-schemas.js

# EXAMPLES pattern coverage
echo "=== EXAMPLES Pattern Coverage ==="
grep -c "EXAMPLES:" lib/mcp/server/config/tool-schemas.js

# WORKFLOW pattern coverage
echo "=== WORKFLOW Pattern Coverage ==="
grep -c "WORKFLOW:" lib/mcp/server/config/tool-schemas.js

# PARAMETERS section pattern
echo "=== [PARAMETERS] Format Usage ==="
grep -c "\[PARAMETERS\]" lib/mcp/server/config/tool-schemas.js

# Verify all patterns present per tool
echo "=== Tool Documentation Completeness ==="
echo "Total tools: $(grep -c '"name":' lib/mcp/server/config/tool-schemas.js)"
echo "With WHEN TO USE: $(grep -c 'WHEN TO USE:' lib/mcp/server/config/tool-schemas.js)"
echo "With SEE ALSO: $(grep -c 'SEE ALSO:' lib/mcp/server/config/tool-schemas.js)"
echo "With EXAMPLES: $(grep -c 'EXAMPLES:' lib/mcp/server/config/tool-schemas.js)"
```

### 21. Fuzzy Search Helper Pattern (Dec 2025)
```bash
# Centralized fuzzy search helper
echo "=== Fuzzy Search Helper Location ==="
ls -la lib/mcp/server/utils/fuzzy-search-helper.js

# Functions exported from fuzzy search helper
echo "=== Fuzzy Search Functions ==="
grep -n "^function\|module\.exports" lib/mcp/server/utils/fuzzy-search-helper.js

# Usage in handlers
echo "=== Fuzzy Search Integration ==="
grep -rn "require.*fuzzy-search-helper\|from.*fuzzy-search-helper" lib/mcp/server/ --include="*.js"
grep -rn "findBestMatch\|getScoredSuggestions" lib/mcp/server/tools/ --include="*.js" | head -10

# 3-level search replaced
echo "=== Legacy 3-Level Search (should be replaced) ==="
grep -rn "exactMatch\|partialMatch\|wordBased" lib/mcp/server/tools/ --include="*.js" | wc -l
```

### 16. System Validation
```bash
# Comprehensive health check
echo "=== MCP System Health Check ==="
echo "1. Static tools defined: $(grep -c "STATIC_SERVER_TOOLS" lib/services/mcp/staticTools.ts 2>/dev/null || echo '0')"
echo "2. External servers: registry rows in mcp_tools DB (the .mcp-servers.json file is DELETED) — services(action: 'discover')"
echo "3. Tool registry methods: $(grep -c "registerTool\|getAllTools\|findToolByName" lib/services/mcp/toolRegistry.ts 2>/dev/null || echo '0')"
echo "4. Agent function support: $(grep -c "mcpFunctions\|getToolDefinitions" lib/services/agentExecutionEngine.ts 2>/dev/null || echo '0')"
echo "5. UI components: $(find components -name "*MCPTools*" 2>/dev/null | wc -l)"
```


### 22. Pino Structured Logging for MCP Operations
```bash
# MCP logging migration status
echo "=== Pino Logger Usage in MCP Code ==="

# Check mcpLogger adoption in MCP server files
echo "mcpLogger usage (primary MCP logger):"
grep -rn "mcpLogger\." lib/mcp/ mcp-server-v5.js mcp-server-http*.js --include="*.ts" --include="*.js" | grep -v node_modules | wc -l

echo ""
echo "apiLogger usage in MCP tools (API calls from tools):"
grep -rn "apiLogger\." lib/mcp/server/tools/ --include="*.ts" --include="*.js" | wc -l

echo ""
echo "authLogger usage in MCP auth (middleware, context):"
grep -rn "authLogger\." lib/mcp/ lib/auth/ --include="*.ts" --include="*.js" | grep -v node_modules | wc -l

# Detect legacy console.log in MCP code (should be zero)
echo ""
echo "=== Legacy console.log in MCP Code (should be 0) ==="
grep -rn "console\.log\|console\.error\|console\.warn" lib/mcp/ mcp-server-v5.js --include="*.ts" --include="*.js" | grep -v node_modules | grep -v "// legacy" | wc -l

# Check correct pino API usage (object first, message second)
echo ""
echo "=== Pino API Correctness Check ==="
echo "Correct pattern (object first):"
grep -rn "mcpLogger\.\(info\|warn\|error\|debug\)({" lib/mcp/ mcp-server-v5.js --include="*.ts" --include="*.js" | grep -v node_modules | wc -l

echo "Potential wrong pattern (string first):"
grep -rn "mcpLogger\.\(info\|warn\|error\|debug\)('" lib/mcp/ mcp-server-v5.js --include="*.ts" --include="*.js" | grep -v node_modules | wc -l

# Check error serialization (should use 'err' not 'error')
echo ""
echo "=== Error Serialization Check ==="
echo "Correct { err: error } pattern:"
grep -rn "{ err:" lib/mcp/ mcp-server-v5.js --include="*.ts" --include="*.js" | grep -v node_modules | wc -l

echo "Wrong { error: error } pattern (misses pino auto-serialization):"
grep -rn "{ error:" lib/mcp/ mcp-server-v5.js --include="*.ts" --include="*.js" | grep -v node_modules | grep -v "isError\|errorMap\|errorMessage\|error_code\|error'" | wc -l

# Production MCP log analysis
echo ""
echo "=== Production MCP Log Analysis ==="
echo "Run on production server:"
echo "ssh <PROD_USER>@<PROD_HOST> \"pm2 logs paichart --lines 200 --nostream | grep '\\\"domain\\\":\\\"mcp\\\"' | jq '{msg: .msg, tool: .tool, level: .level}'\" 2>/dev/null | tail -20"
echo ""
echo "MCP errors in last 500 lines:"
echo "ssh <PROD_USER>@<PROD_HOST> \"pm2 logs paichart --lines 500 --nostream | grep '\\\"domain\\\":\\\"mcp\\\"' | grep '\\\"level\\\":50' | jq\" 2>/dev/null | tail -10"
```

## Special Attention Areas

1. **Tool Versioning**: How tool updates are handled, schema evolution
2. **Backward Compatibility**: Legacy tool support, deprecated parameters
3. **Security**: Parameter sanitization, injection prevention, access control
4. **Rate Limiting**: Tool usage constraints, throttling mechanisms
5. **Cost Tracking**: Usage metrics for billing, token consumption
6. **Connection Stability**: Reconnection logic, connection pooling
7. **Storage Migration**: Legacy locations vs unified storage approach
8. **Static Tool Fallback**: Protocol issue workarounds
9. **Agent Function Calling**: LLM tool integration patterns
10. **UI-API Consistency**: Same storage used by both paths
11. **Dual-Server Benefits**: Embedded vs MCP v5 tradeoffs
12. **HTTP Transport**: StreamableHTTPServerTransport for Windows clients
13. **Claude Desktop Bridge**: mcp-remote package for stdio-to-HTTP
14. **Session Isolation**: Per-session transport architecture
15. **Cross-Origin Support**: CORS configuration for external clients

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: MCP Tool Integration Discovery
═══════════════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Core MCP Components
□ Section 2: Tool Discovery and Registration
□ Section 3: Execution Methods and Routing
□ Section 4: Parameter Processing and Validation
□ Section 5: Server Lifecycle Management
□ Section 6: Integration and Error Handling
□ Section 7: Performance and Monitoring
□ Section 8: Tool Storage and Configuration Patterns
□ Section 9: UI Component Integration

Current Status: 🚀 Starting Discovery
Commands: 0/85 executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Core Components [██████████] 100%
   Commands: 15/15 | Found: 2 servers, 3 services
🔄 Section 2: Tool Discovery [███░░░░░░░] 30%
   Commands: 3/10 | Mapping tool registry...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** 2 servers, 15 tools ✅ (dated snapshot — current surface is 6 consolidated + 4 standalone = 10 tools)
⚠️ **Critical Issues:** 3 SDK parse errors
🔍 **Areas Investigated:** 
   - ✅ Dual-server architecture mapped
   - ✅ Tool registry validated (static + dynamic)
   - ⚠️ Direct executor needed for 2 servers
   - ❌ Resource manager incomplete

## Context for Specialist:
- Key Finding: Embedded server bypasses network overhead
- Risk Area: SDK parse errors with claude-code server
- Focus Needed: Direct executor implementation

Delegating to: mcp-integration-specialist
Reason: Deep MCP protocol expertise required
Priority: Fix SDK parse errors, optimize tool routing

--- ACTIVATING MCP-INTEGRATION-SPECIALIST ---
```

### Specialist Reception Template
```markdown
--- MCP-INTEGRATION-SPECIALIST ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** 2 servers, 15 tools ✅ (dated snapshot — see above)
⚠️ **Issues:** 3 SDK parse errors acknowledged
🔍 **Focus Areas:** Direct executor priority

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Analyzing server configurations...
[████░░░░░░] 40% → Reviewing parse errors...
[██████████] 100% → Analysis complete ✅

## Specialist Findings:
1. claude-code server needs direct executor
2. browser-use server requires special handling
3. Embedded server 5x faster for DB operations
```

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact |
|------|----------|------------|---------|
| Server connection failure | High | Medium | Tools unavailable |
| Parameter validation bypass | Critical | Low | Security vulnerability |
| Tool timeout | Medium | High | Poor user experience |
| Direct Executor process leak | High | Low | Resource exhaustion |
| Schema mismatch | Medium | Medium | Execution failures |
| Rate limit exceeded | Low | High | Temporary unavailability |

## Expected Outputs

### 1. Component Inventory
```markdown
## MCP System Components

### Core Services
- `/lib/services/mcp/serverManager.ts` - Server orchestration (the doc's old `mcpServerManager.ts` name never existed)
- ~~`/lib/services/mcp/directToolExecutor.ts`~~ - DELETED long ago (pre-browser-automation era)
- [Additional files found]

### Tool Registry
- Static tools: X defined
- Dynamic tools: Y servers
- Total available: Z tools

### Server Configuration
- Embedded server: [Status]
- External servers: [List with status]
- Problematic servers: [Why problematic]
```

### 2. Execution Flow Comparison
```
SDK Execution:
1. Agent calls tool → MCPService
2. Validate parameters → Transform
3. SDK.request() → Server
4. Parse response → Return

Direct Execution:
1. Agent calls tool → MCPService
2. Check problematic list → Route
3. Spawn process → Direct call
4. Parse stdout → Return
```

### 3. Tool Catalog
```markdown
| Tool | Server | Parameters | Direct? | Usage |
|------|--------|------------|---------|--------|
| project (task.list) | embedded | povId, status | No | High |
| browser_navigate | browser-use | url | Yes | Medium |
```

### 4. Storage Architecture Map
```markdown
| Component | Storage Location | Purpose |
|-----------|------------------|----------|
| Tasks | task.mcpContext | Runtime MCP configuration |
| Templates | metadata.mcpToolConfiguration | Template tool selection |
| Legacy | capabilities.mcpTools | DEPRECATED - should not exist |
```

### 5. UI Component Map
- Tool Selection: [Components using MCPToolsSelector]
- Configuration: [Components building mcpContext]
- Management: [Dashboard components]

### 6. Agent Integration Analysis
- Function Conversion: [How tools become LLM functions]
- Tool Routing: [Server identification for execution]
- Success Rate: [Tool call completion metrics]

### 7. Dual-Server Architecture
```
Embedded Server:
- Direct database access
- No network overhead
- Integrated lifecycle
- Internal use only

MCP Server v5:
- External client support
- Standard MCP protocol
- JWT authentication
- Claude Desktop compatible

HTTP Transport (NEW):
- Windows client support
- StreamableHTTPServerTransport
- Per-session isolation
- Port 8080 default
```

### 8. Claude Desktop Configuration
```json
// Using mcp-remote bridge (RECOMMENDED)
{
  "mcpServers": {
    "paichart": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://192.168.86.73:8080/mcp",
        "--allow-http"  // Required for non-localhost HTTP
      ]
    }
  }
}

// With authentication
{
  "mcpServers": {
    "paichart": {
      "command": "npx",
      "args": [
        "@smithery/mcp-remote-client",
        "http://192.168.86.73:8080/mcp",
        "--header",
        "Authorization:${PAICHART_TOKEN}"
      ],
      "env": {
        "PAICHART_TOKEN": "Bearer YOUR_JWT_TOKEN_HERE"
      }
    }
  }
}
```

**Key Requirements**:
- Claude Desktop REQUIRES a "command" field (not direct HTTP config)
- Use mcp-remote package as stdio-to-HTTP bridge
- Add --allow-http flag for non-localhost HTTP URLs
- Authentication via Bearer token in headers

## Output Format

```markdown
# MCP Tool Integration Discovery Report

## Summary
- Total MCP files: X
- Configured servers: Y (Z active, W external)
- Available tools: V (U static, T dynamic)
- Direct Executor usage: S%
- Integration points: R
- UI components: Q
- Storage patterns: P

## Detailed Findings

### 1. Dual-Server Architecture
#### Embedded Server (lib/mcp/embedded-server.ts)
- **Purpose**: High-performance internal access
- **Features**: Direct DB access, no network overhead
- **Tools**: [List of embedded tools]
- **Lifecycle**: Created on startup, removed on shutdown

#### MCP Server v5 (mcp-server-v5.js)
- **Purpose**: External client support (Claude Desktop)
- **Features**: Standard MCP protocol, JWT auth
- **Tools**: Uses same SDK-native implementations
- **Resources**: SimpleResourceManager integration

### 2. Tool Storage Architecture
#### Task Level
- **Location**: task.mcpContext
- **Structure**: {agentRole, executionType, tools[], workflow}
- **Usage**: Runtime configuration for execution

#### Template Level  
- **Location**: metadata.mcpToolConfiguration
- **Structure**: {selectedTools[], toolConfigurations, toolCoordination}
- **Usage**: Template-based tool selection

#### Legacy (DEPRECATED)
- **capabilities.mcpTools**: X occurrences (should be 0)
- **metadata.mcpConfiguration**: Y occurrences (should be 0)

### 3. Tool Execution Paths
#### SDK Execution
- **Flow**: Agent → MCPService → SDK.request() → Server
- **When**: Standard servers, protocol compliant
- **Performance**: [Latency metrics]

#### Direct Executor
- **Flow**: Agent → MCPService → DirectExecutor → Spawn process
- **When**: Problematic servers (claude-code, browser-use)
- **Performance**: [Process overhead metrics]

#### Agent Function Calling (NEW)
- **Flow**: Task.mcpContext → getToolDefinitions() → LLM Functions → Agent
- **Implementation**: agentExecutionEngine.ts enhanced
- **Result**: Agents can now call MCP tools

### 4. UI Component Integration
#### Tool Selection
- **MCPToolsSelector**: Reusable selection component
- **AgentConfigurationForm**: Builds mcpContext
- **MCPToolsTab**: Template configuration

#### Management
- **MCPToolDashboard**: System-wide management
- **MCPServerManager**: Server configuration UI
- **ServerConfigForm**: Add/edit servers

### 5. Static Tool System
#### Purpose
- Fallback for protocol issues
- Immediate availability without connection
- Bypass SDK parsing errors

#### Implementation
- **Definition**: lib/services/mcp/staticTools.ts
- **Registration**: On server startup
- **Servers**: claude-code (12 tools), browser-use (11 tools)

### 6. Parameter Handling
#### Normalization
- **Aliases**: povId ↔ pov_id, taskId ↔ task_id
- **Formats**: Nested vs top-level parameters
- **Claude Desktop**: Special compatibility handling

#### Validation
- **Schema**: Against inputSchema definitions
- **Required**: Enforcement patterns
- **Errors**: User-friendly messages

### 7. Integration Analysis
#### API Routes
- **/api/mcp/tools**: List available tools
- **/api/mcp/servers**: Manage servers
- **/api/mcp/tasks/action**: Execute actions

#### Services
- **MCPServerManager**: Lifecycle and persistence
- **MCPToolRegistry**: Tool storage and search
- **AgentExecutionEngine**: Function calling integration

### 8. Performance Analysis
- **Tool Discovery**: X ms average
- **Execution Time**: SDK: Y ms, Direct: Z ms
- **Cache Hit Rate**: W%
- **Memory Usage**: [Metrics]

### 9. Security Assessment
- **Parameter Sanitization**: [Methods used]
- **Access Control**: [Implementation]
- **Vulnerabilities**: [If any found]

### 10. HTTP Transport Implementation (NEW)
#### Architecture
- **File**: mcp-server-http-clean.js
- **Transport**: StreamableHTTPServerTransport
- **Sessions**: Per-session isolation (not singleton)
- **Port**: 8080 (configurable via PORT env)

#### Authentication
- **Middleware**: ~~lib/auth/mcp-http-middleware.ts~~ DELETED in the HS256→RS256 migration; auth middleware is AuthManager.createMiddleware (lib/auth/oauth/auth-manager.ts)
- **Methods**: JWT tokens, API keys
- **Reuse**: 70% code reuse from existing auth

#### Critical Implementation Details
- **Per-Session**: Each client gets isolated transport
- **handleRequest**: Use transport.handleRequest(req, res, body)
- **NOT**: transport.send() - this method doesn't exist
- **Session Cleanup**: Automatic on disconnect

#### Claude Desktop Integration
- **Bridge**: mcp-remote npm package required
- **Config**: Must use "command" field, not HTTP directly
- **Flag**: --allow-http for non-localhost connections
- **Auth**: Bearer token via environment variables

## Migration Status
- **Storage Migration**: X% complete
- **Legacy Code**: Y files still using old patterns
- **UI Consistency**: Z components updated
- **HTTP Transport**: Production-ready for Windows clients

## Recommendations
1. [Critical - Security/Performance fixes]
2. [Important - Architecture improvements]
3. [Nice to have - Developer experience]

## Test Scenarios
1. [Multi-server tool execution]
2. [Storage migration validation]
3. [Agent function calling test]
4. [Static fallback verification]

## Next Steps
1. Complete storage migration for remaining X components
2. Implement tool execution monitoring
3. Add performance benchmarks
4. Document troubleshooting guide
```

## Deliverables

1. Complete tool catalog with capabilities matrix and storage locations
2. Execution flow diagrams (SDK vs Direct vs Agent Function Calling)
3. Server configuration guide with persistence behavior
4. Parameter handling specification with compatibility matrix
5. Integration patterns documentation (UI, API, Agent)
6. Troubleshooting guide with common issues and solutions
7. Performance optimization recommendations
8. Storage migration status report
9. Static tool fallback implementation guide
10. Dual-server architecture comparison
11. UI component integration map
12. Agent execution enhancement analysis

## Success Criteria

- All tools documented with complete parameter schemas and storage locations
- Execution paths fully mapped including agent function calling
- Server configurations understood with lifecycle and persistence details
- Parameter handling rules clear with compatibility requirements
- Integration points identified across UI, API, and Agent layers
- Problem areas documented with mitigation strategies
- Performance implications noted with benchmarks
- Storage migration completeness verified
- Static tool fallback system documented
- Dual-server architecture benefits and tradeoffs clear
- UI-API consistency validated
- Agent tool execution flow complete
- HTTP transport configuration documented for Windows clients
- Claude Desktop integration patterns clear with mcp-remote

## Common HTTP Transport Issues and Solutions

### Issue: "Server disconnected" in Claude Desktop
**Cause**: SSH transport issues on Windows
**Solution**: Use HTTP transport with mcp-server-http-clean.js

### Issue: "command Required" error
**Cause**: Claude Desktop requires stdio interface
**Solution**: Use mcp-remote package as bridge

### Issue: "Cannot read properties of undefined (reading 'error')"
**Cause**: Using non-existent transport.send() method
**Solution**: Use transport.handleRequest(req, res, body)

### Issue: "Non-HTTPS URLs only allowed for localhost"
**Cause**: mcp-remote security restriction
**Solution**: Add --allow-http flag to args

### Issue: Session conflicts
**Cause**: Singleton transport architecture
**Solution**: Per-session transport with sessionId tracking

## Phase 1 MCP Performance Optimization Integration (REFERENCE)

### Resource Manager N+1 Elimination (Tasks 7-8)
```bash
# Resource discovery optimization
echo "=== Resource Manager Performance Fix ==="
echo "Achievement: 80% performance reduction in resource discovery"
echo "Method: Resource caching strategies and batch processing"
echo "Files: lib/services/mcp/resourceManager.ts, context builders"

# MCP context building optimization
grep -r "resource.*performance\|resource.*cache" --include="*.ts" lib/services/ | head -3
```

### MCP Context Integration with Query Mappers
```bash
# Task mapper MCP integration
echo "=== MCP Context in Query Mappers ==="
echo "Location: lib/database/query-mappers.ts (createTaskMapper)"
echo "Features: mcpContext and mcpMetadata lazy loading" 
echo "Usage: includeMcpContext option for on-demand MCP data"

# Check MCP context fields in mappers
grep -n "mcpContext\|mcpMetadata\|mcpToolId\|mcpWorkflowId" lib/database/query-mappers.ts | head -5
```

### Execution Context Building Optimization
```bash
# Context builder performance improvements
echo "=== MCP Execution Context Optimization ==="
echo "Tasks 7-8: Fixed N+1 in execution context building" 
echo "Method: Batch resource loading, context caching"
echo "Impact: Faster agent execution preparation"

# Integration with task system
grep -r "execution.*context.*optimization" --include="*.ts" lib/ | head -3
```

### Performance Metrics for MCP System
- **Resource Discovery**: 80% performance improvement achieved
- **Context Building**: N+1 queries eliminated in execution context
- **MCP Context Loading**: Now uses lazy loading via query mappers
- **Tool Integration**: Maintains performance baselines from Phase 1

### Key MCP Integration Points Enhanced
- Task MCP context now integrated into query mappers for optimal loading
- Resource manager uses caching strategies to prevent repeated discovery
- Execution context building optimized to batch resource operations
- MCP metadata fields added to lazy loading patterns

---

## Transport Boundary Coercion Audit ⭐ NEW 2026-02-15

MCP transports may serialize nested objects to JSON strings. The `ensureObject` utility guards against this at every transport boundary.

### Find Unguarded Transport Entry Points

```bash
echo "=== All CallToolRequestSchema handlers ==="
grep -rn "CallToolRequestSchema" --include="*.ts" --include="*.js" | grep -v node_modules | grep -v ".d.ts"

echo ""
echo "=== Sites with ensureObject guard ==="
grep -rn "ensureObject" --include="*.ts" --include="*.js" | grep -v node_modules | grep -v "ensure-object\." | grep -v "cline_docs"

echo ""
echo "=== REGRESSION: Docker services missing inline ensureObject ==="
for svc in services/*/src/index.ts; do
  has_handler=$(grep -c "CallToolRequestSchema" "$svc" 2>/dev/null)
  has_guard=$(grep -c "ensureObject" "$svc" 2>/dev/null)
  if [ "$has_handler" -gt 0 ] && [ "$has_guard" -eq 0 ]; then
    echo "  ❌ UNGUARDED: $svc"
  fi
done

echo ""
echo "=== Verify guard is BEFORE .parse() in Docker services ==="
grep -n "ensureObject\|\.parse(" services/*/src/index.ts | head -20
```

### Verify Hub Guard Imports

```bash
echo "=== Hub files importing ensureObject ==="
grep -rn "require.*ensure-object\|import.*ensure-object" --include="*.ts" --include="*.js" | grep -v node_modules | grep -v "ensure-object\."

echo ""
echo "=== Expected: 21 files (proven 2026-06-11 — guard adoption GREW from the original 7 hub files; growth is healthy, shrinkage below 7 would be the regression) ==="
```

### Check Prisma Json Column Protection

```bash
echo "=== Args written to Prisma Json columns ==="
grep -n "parameters:.*args\|parameters:.*rawArgs" mcp-server-v5.js
# Guard must appear BEFORE this line
```

### Baseline (Feb 2026)

**15 protected sites**: 7 hub files (import from lib/) + 6 Docker services (inline) + 2 utility files
**Excluded**: agentExecutionEngine.ts (LLM response parsing, different semantics)
**Pattern**: `/.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md`
**Gold Standard**: `/.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md` (includes inline guard)