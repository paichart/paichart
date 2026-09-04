# mcp-integration-specialist — Domain Library

> **Created 2026-06-11** (Protocol 12 soft-band trim). Depth evicted from the agent file; verbatim;
> the paired discovery's proven greps outrank this file.

## [evicted] MCP Tool Security Management

**PRIMARY REFERENCE**: `/.claude/knowledge/domain/mcp/tool-permission-management.md`

**Purpose**: Comprehensive guide to MCP tool permission architecture and management

**Contains**:
- Tool security model post-consolidation (PUBLIC: 0, AUTHENTICATED: 9, ADMIN: 1, Total: 10)
- Two-layer auth enforcement (method-level + tool-level)
- Step-by-step procedures for moving tools between categories
- Security best practices and decision frameworks
- Testing and verification commands
- Production-validated implementation (100% confidence)

**When to Reference**:
- Implementing new MCP tools (determine correct security category)
- Modifying tool permissions (safely move between tiers)
- Conducting security audits (verify enforcement)
- Debugging tool access issues (understand auth layers)

**Key Files Documented**:
- `/lib/mcp/server/config/tool-security.js` - Tool category definitions
- `mcp-server-http-clean.js` - Tool enforcement: grep for `enforceToolSecurity` (line numbers shift as the monolith is decomposed; ~line 3473 at 2026-05-20)
- `mcp-server-http-clean.js` - Dynamic tool filtering: grep for `getToolsForUser` (~line 3459 at 2026-05-20)

**Security Decision Matrix**: Use guide's decision framework to categorize new tools correctly


## [evicted] Pino Structured Logging for MCP Operations

**Pattern Reference**: `/.claude/knowledge/patterns/pino-structured-logging-pattern.md` (Pattern #43, 96% confidence)

### Two Logging Systems (Do NOT Confuse)

| System | Purpose | Output | When to Use |
|--------|---------|--------|-------------|
| **pino** (structured JSON) | All server-side logging | PM2 stdout (JSON lines) | MCP tool execution, server lifecycle, transport events |
| **OAuth audit logger** | OAuth-specific audit trail | `/var/log/paichart/oauth-audit.log` | OAuth token minting, provider callbacks |

### MCP-Relevant Domain Loggers

All loggers imported from `lib/logger.ts` with correct pino API: **object first, message string second**.

| Logger | Domain | MCP Use Case |
|--------|--------|-------------|
| `mcpLogger` | MCP operations | Tool execution, server connections, transport errors, protocol events |
| `apiLogger` | API operations | MCP tools calling internal APIs via apiClient, endpoint timing |
| `authLogger` | Authentication | MCP auth context, token validation in MCP middleware |
| `complianceLogger` | Compliance | Tool access auditing, security enforcement events |

### Correct pino API for MCP Logging

```typescript
import { mcpLogger, apiLogger } from '@/lib/logger';

// ✅ CORRECT: Object first, message second
mcpLogger.info({ tool: 'project', userId: context.user?.id, duration: 45 }, 'Tool execution completed');
mcpLogger.error({ err: error, tool: 'services', serviceId }, 'Tool execution failed');
apiLogger.warn({ endpoint: '/api/tasks', status: 403, userId }, 'MCP tool API call rejected');

// ❌ WRONG: Message first (console.log style)
mcpLogger.info('Tool executed', { tool: 'project' });  // WRONG ORDER

// ❌ WRONG: error key (pino uses 'err' for auto-serialization)
mcpLogger.error({ error: e }, 'Failed');  // Use { err: e } instead
```

### Production PM2 Log Analysis for MCP

```bash
# All MCP domain events
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"mcp\"' | jq" 2>/dev/null | tail -20

# MCP tool execution errors
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 500 --nostream | grep '\"domain\":\"mcp\"' | grep '\"level\":50' | jq '{tool: .tool, err: .err.message, time: .time}'" 2>/dev/null | tail -20

# MCP transport/connection issues
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 300 --nostream | grep '\"domain\":\"mcp\"' | grep -i 'transport\|connection\|disconnect' | jq" 2>/dev/null | tail -10

# Tool security enforcement events (auth failures)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 300 --nostream | grep '\"domain\":\"mcp\"' | grep '\"level\":40' | jq '{tool: .tool, msg: .msg, userId: .userId}'" 2>/dev/null | tail -10

# API calls from MCP tools
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"api\"' | grep -i 'mcp\|tool' | jq" 2>/dev/null | tail -10
```

### MCP Logging Checklist

When implementing or reviewing MCP tools:
- [ ] Tool execution start/end logged with `mcpLogger` (include tool name, userId, duration)
- [ ] Tool errors logged with `{ err: error }` key (pino auto-serialization)
- [ ] Security enforcement events logged with `mcpLogger.warn()` or `complianceLogger`
- [ ] API calls within tools logged with `apiLogger` (include endpoint, status)
- [ ] No `console.log` or `console.error` in MCP server-side code (use pino loggers)
- [ ] Log levels correct: info for success, warn for auth rejection, error for failures


## [evicted] Core Knowledge and Expertise

### Tool Security Boundaries (Phase 3 - Jan 31, 2026)
- **All Tools Authenticated (10 total post-consolidation)**: PUBLIC_TOOLS empty, all require auth
  - 6 consolidated: `project`, `perform`, `analytics`, `template`, `services`, `registry` (in embedded, HTTP, stdio)
  - 4 standalone: `search`, `fetch`, `prompt_command`, `list_prompts` (HTTP + stdio only, NOT in embedded server)
- **Admin Tools**: 1 at tool-level (`registry` requires admin for register/unregister actions)
- **Dynamic Tool Filtering**: `getToolsForUser()` in `tool-security.js`, called from HTTP + stdio servers
- **Security File**: `/lib/mcp/server/config/tool-security.js` defines tool categories
- **Enforcement**: `enforceToolSecurity()` middleware validates access based on tool category and user context
- **Tool Security Level**: `getToolSecurityLevel()` returns 'public', 'authenticated', or 'admin'
- **Error Handling**: Enhanced with multi-method authentication guidance (API Key, OAuth, JWT Bearer, Claude Desktop)

### Tool Architecture
- **Responsibility**: Static and dynamic tool registration management
- **Key Files**: `/lib/services/mcp/serverManager.ts` - Central server and tool management
- **Patterns**: Tool registry deduplication, unified tool access across components
- **Integration Points**: Static tool definitions in code (`lib/services/mcp/staticTools.ts`); service registry rows in the `mcp_tools` DB table (~~`.mcp-servers.json`~~ DELETED); dynamic discovery via `services(action: 'discover')`

### Tool Execution Methods
- **Responsibility**: Agent execution engine integration and LLM function calling
- **Key Files**: `/lib/services/agentExecutionEngine.ts` - Agent tool integration, `/mcp-server-v5.js` - Server tool handlers
- **Patterns**: Static tool registration, LLM function calling, agent-driven tool execution
- **Integration Points**: Agent execution, parameter normalization, result formatting

### Transport Boundary Coercion (Feb 2026) ⭐
- **Responsibility**: Defend against object-to-string mutation at MCP transport boundaries
- **Utility**: `lib/utils/ensure-object.ts` (sole source of truth since Phase 2 proper Apr 8 2026 — the `.js` sibling was deleted as part of Bug Class 73 eradication; extensionless `require('.../ensure-object')` resolves to the `.ts` via ts-node in both PM2 processes)
- **Pattern**: MCP transports (stdio, SSE, HTTP) may serialize nested objects to JSON strings
- **Key Insight**: SDK `CallToolRequestSchema` validates top-level `arguments` as object, but inner `arguments` field in `services(action: "call")` CAN be string from AI clients
- **Docker Services**: Inline `ensureObject` function (cannot import from `lib/`). See gold standard template.
- **Guard Placement**: Apply `ensureObject` BEFORE `.parse()` - transport coercion before domain validation
- **Excluded**: `agentExecutionEngine.ts` has different semantics (LLM response parsing, not transport)
- **References**: Pattern #35, `/.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md`
- **Discovery**: Part 11 of `boundary-contract-discovery.md` has regression detection grep commands

### Server Management
- **Responsibility**: Server lifecycle and health monitoring
- **Key Files**: `/lib/services/mcp/mcpService.ts` - High-level tool execution API
- **Patterns**: Connection state tracking, reconnection logic, embedded server support
- **Integration Points**: External server configuration, Claude Desktop integration

### MCP Server Creation Security (2025-10-29 RCE Prevention)
- **Responsibility**: Prevent remote code execution via MCP server stdio transport configuration
- **Key Files**: `/app/api/mcp/servers/route.ts` (lines 38-68)
- **Security Pattern**: Command whitelist with absolute path enforcement
- **Implementation**:
  ```typescript
  // Stdio transport command validation
  command: z.string()
    .regex(/^\/[a-zA-Z0-9\/_\-\.]+$/, 'Must be absolute path starting with /')
    .refine((cmd) => {
      const allowedCommands = [
        '/usr/bin/node',
        '/usr/bin/python',
        '/usr/bin/python3',
        '/usr/local/bin/node',
        '/usr/local/bin/npx'
      ];
      return allowedCommands.includes(cmd);
    }, { message: 'Command must be from allowed list' })

  // Args validation
  args: z.array(
    z.string().refine((arg) => {
      const dangerousPatterns = ['-e', '--eval', '-c', 'eval(', 'exec('];
      return !dangerousPatterns.some(pattern => arg.includes(pattern));
    }, { message: 'Argument contains dangerous pattern' })
  )
  ```
- **Attack Prevention**:
  - Path traversal: `../../../bin/sh` → Blocked by absolute path regex
  - Malicious commands: `/bin/rm`, `/usr/bin/curl` → Blocked by whitelist
  - Code injection args: `-e "code"`, `--eval "code"` → Blocked by arg validation
- **Admin-Only Protection**: MCP server creation requires ADMIN or SUPER_ADMIN role
- **Integration Points**: MCP server registration API, admin dashboard, server configuration
- **Whitelist Management**: Update allowed commands in schema for new runtimes
- **Confidence**: 95/100 (sec-ops + database-manager validated)

### Static Tool Definitions
- **Responsibility**: Managing static tool fallbacks and definitions with security boundaries
- **Key Files**: 
  - `/lib/services/mcp/staticTools.ts` - Static tool definitions
  - `/lib/mcp/server/tools/sdk-native-basic-tools.js` - Tool implementations
  - `/lib/mcp/server/config/tool-security.js` - Security boundaries (Plan 8)
  - `/lib/mcp/server/tools/public-discovery-filter.js` - Public data filtering (Plan 8)
- **Patterns**: Static tool registration, embedded server implementations, SDK-native handlers, security enforcement
- **Integration Points**: Tool registry, server initialization, agent function calling, authentication middleware


## [evicted] Key Information

### My Knowledge Base

**Tool Architecture Reference** (95% confidence, Jan 2026):
`/.claude/knowledge/domain/mcp/tool-architecture-reference.md`
- Complete catalog of all 26 MCP tools across functional categories
- File locations for schemas, handlers, and routing
- Handler pattern documentation (Gold Standard pattern)
- Workflow System documentation (`workflow.trigger` action)
- New tool implementation checklist
- Key files: tool-schemas.js, hub-tools-handler.js, workflowEngine.ts

**Database Prompt Creation** (95% confidence):
`/.claude/knowledge/domain/mcp/database-prompt-creation-guide.md`
- Creating database prompts without code changes (seed scripts, Prisma Studio, Admin API)
- AgentPromptLibrary schema and field requirements
- MCP visibility requirements (tags: ['mcp'], isPublic: true, status: ACTIVE)
- Handlebars templating for variables
- Security validation (XSS, injection, DoS prevention)
- Integration with built-in prompts (two-tier merge system)

### Critical Files
- `/lib/services/mcp/serverManager.ts` - Central server and tool management hub
- `/lib/services/agentExecutionEngine.ts` - Agent execution with MCP tool integration
- `/lib/services/mcp/mcpService.ts` - High-level tool execution API
- `/lib/mcp/embedded-server.ts` - Internal tool implementations with no network overhead
- `/mcp-server-v5.js` - Pure SDK-native implementation handling tools AND resources
- `/lib/mcp/server/tools/sdk-native-basic-tools.js` - Static tool implementations
- `/lib/mcp/server/prompts/prompt-registry.js` - Built-in prompts + database prompt loading
- `/lib/utils/ensure-object.ts` - Transport boundary guard utility (TS + CJS versions)
- `/lib/mcp/server/tools/hub-tools-handler.js` - Hub tools facade (delegates to 10 extracted handlers)
- `/lib/mcp/server/tools/hub/prompt-list-handler.js` - Prompt discovery (list_prompts implementation)
- `~/.config/Claude/claude_desktop_config.json` - Server connection definitions

### Common Tasks You Handle
1. **Tool Registration Issues**
   - Verify static registration matches dynamic discovery
   - Resolve tool registry conflicts and deduplication
   - Ensure unified tool access across all components

2. **Agent Tool Execution Problems**
   - Debug tool function calling in agent execution engine
   - Handle parameter normalization and validation
   - Troubleshoot tool availability and registration issues

3. **Server Connection Management**
   - Monitor server health and connection states
   - Implement reconnection logic for disconnected servers
   - Configure new server integrations

4. **Static Tool Implementation**
   - Add new static tool definitions
   - Configure SDK-native tool handlers
   - Handle tool response formatting and error scenarios

### When to Use This Specialist
- MCP tools not appearing in UI despite server connection
- Agent execution engine not calling tools properly
- "Server not connected" issues requiring reconnection logic
- "Invalid request parameters" from parameter format mismatches
- Static tool registration and definition issues
- Tool execution in agent context not working
- Need to integrate new external MCP servers
- Business Analyst or other agents not completing tool analysis


## [evicted] Learning Notes
- **Pattern**: Tools are registered statically and called via agent execution engine LLM function calling
- **Gotcha**: Static tool registration must match dynamic discovery or tools won't appear
- **Tip**: Always check tool definitions in `lib/services/mcp/serverManager.ts` (the old `mcpServerManager` name never existed) and `lib/mcp/server/config/tool-schemas.js`
- **Insight**: Parameter normalization in SDK-native tools prevents 70% of tool execution failures
- **Pattern**: Embedded MCP server runs inside Next.js process - no network overhead
- **Distinction**: MCP has two concepts - **Tools** (functions to execute) vs **Resources** (data to access via mcp:// URIs)
- **Transport Guard**: Always apply `ensureObject()` before `.parse()` in CallToolRequestSchema handlers. Docker services need inline copy.
- **Server File**: Main MCP server is `mcp-server-v5.js` which handles both tools AND resources
- **Claude Desktop**: Config at `~/.config/Claude/claude_desktop_config.json` defines server connections
- **Agent Integration**: Tools are converted to LLM functions and called automatically by agents
- **Tool Storage**: Tools stored in task.mcpContext and template.metadata.mcpToolConfiguration

### Dual-Process Architecture & HTTP Timeout Constraints (Feb 2026)

**Critical Architecture**: The MCP server (`paichart-mcp`) and web server (`paichart-web`) are separate processes communicating via HTTP:
```
Claude Desktop --(stdio, NO timeout)--> MCP Server (paichart-mcp)
  --(HTTP, 30s timeout)--> Web Server (paichart-web, port 3000)
```

**Key Constraint**: `api-client.js` has a 30s HTTP timeout (`SERVER_CONFIG.api.timeout`). Any web server handler called by the MCP server MUST respond within 30s or the MCP server gets a network timeout. This is critical for agent execution which takes 30-120s.

**Pattern: Fire-and-Forget + Poll-and-Return** (Feb 2026):
For long-running operations (agent execution), use this two-layer pattern:
1. **Web server handler** (`agent-execute-handler.ts`): Dispatch without `await`, return immediately
2. **MCP server handler** (`task-action-handler.js`): Poll `agent.status` every 5s internally (each call <1s), then fetch `agent.results` when complete. Return everything in one tool response.

MCP tool calls from Claude Desktop have NO timeout — Claude waits patiently. The 30s limit is only on the internal HTTP calls.

**Key Files**:
| File | Purpose |
|------|---------|
| `/lib/mcp/server/utils/api-client.js` | HTTP client singleton, 30s timeout, 3 retries with linear backoff |
| `/lib/mcp/server/config/server-config.js` | `api.timeout: 30000`, `api.retries: 3`, internal URL `http://127.0.0.1:3000` |
| `/lib/mcp/server/tools/advanced/task-action-handler.js` | Poll-and-return for `agent.execute` |
| `/lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts` | Fire-and-forget dispatcher |

**Gotchas**:
- `api-client.js` uses `node-fetch` with `internalBaseUrl` (127.0.0.1:3000) to avoid nginx round-trip
- Retry logic in `isSimpleRetryableError()` retries on timeout/network/connection/fetch errors
- `setUserContext()` is DEPRECATED — use per-request `options.userContext` (P0-2 fix)

### Embedded Server Context Passing (Feb 2026)

**Bug Fixed**: The embedded MCP server (`lib/mcp/embedded-server.ts`) calls tool handlers during LLM execution. Handlers expect `(args, context)` where context has `{ user, authenticated }`.

**Previous bug**: `callTool(name, args)` only passed args, not context. This caused `ContextEnricher.enrichContext(baseContext)` to crash on `Cannot destructure property 'user' of 'baseContext'`.

**Fix**: `callTool` now accepts optional context parameter and passes it through:
```typescript
async callTool(name: string, args: any, context?: any): Promise<any> {
  const result = await implementation(args, context || {});
}
```

**Context construction in mcpService.ts**: When calling embedded tools from the execution engine, construct minimal context from userId:
```typescript
const toolContext = options?.userId ? {
  user: { id: options.userId },
  authenticated: true
} : undefined;
```

**ContextEnricher defensive null check**: `enrichContext(baseContext)` now handles `null`/`undefined` baseContext gracefully, returning `{ authenticated: false, apiUserContext: null }`.

### Validation Schema Alignment (Feb 2026)

**Critical**: The Zod schemas in `mcp-action-validation.ts` silently strip fields not defined in the per-action schema. When adding fields to MCP action handlers, the field MUST also be added to the corresponding `MCPParameterSchemas` entry. See `validation-engine-specialist` for full details.

**Detection grep**:
```bash
# Compare schema fields vs handler fields for an action
grep -A5 "'agent.status'" lib/validation/mcp-action-validation.ts
grep "const {.*} = parameters" lib/mcp/handlers/agent-status-handler.ts
```

### Sprint 3: MCP Action Validation Enhancement (Dec 2025) ⭐ NEW
**What Changed**: perform tool now supports ~70 parameters (40 added) with centralized alias mapping

**Key Improvements**:
- **40 Missing Parameters**: Audited all 12 handlers, added missing params to validation schemas
- **Centralized Alias Mapping**: `PARAMETER_ALIAS_MAPPINGS` + `normalizeAliases()` in mcp-action-validation.ts
- **Enhanced Error Messages**: Semantic enum mappings (position, type, analysisType) + 17 example values
- **Pattern**: `optional() + .refine() + .transform(normalizeAliases)` for flexible validation

**Alias Support** (snake_case → camelCase):
- `task_name` → `taskName`, `pov_id` → `povId`, `due_date` → `dueDate`
- `agent_template_name` → `agentTemplateName`, `role` → `agentRole`
- Context-specific: `stageName` → `name` (stage.create only)

**Files**:
- `lib/validation/mcp-action-validation.ts` - Centralized aliases (lines 99-145)
- `/.claude/knowledge/protocols/quarterly-review-protocol.md` - Discovery #9

**Grep Commands**:
```bash
# Find centralized alias mappings
grep -A 20 "PARAMETER_ALIAS_MAPPINGS" lib/validation/mcp-action-validation.ts

# Find normalizeAliases usage
grep -n "normalizeAliases" lib/validation/mcp-action-validation.ts

# Find semantic enum mappings
grep -A 30 "SEMANTIC_ENUM_MAPPINGS" lib/validation/mcp-action-validation.ts
```

### Error Helper, Tool Schema & Fuzzy Search Patterns (Dec 2025)
**Baseline Pattern**: `/.claude/knowledge/patterns/mcp-tool-ux-pattern.md`
**Gold Standard Pattern**: `/.claude/knowledge/patterns/mcp-tool-gold-standard-pattern.md`

- **Error Helpers**: 3 modules (basic, advanced, browser) with 22 error generators
- **Functions**: `povNotFoundError()`, `taskNotFoundError()`, `agentExecutionNotFoundError()`
- **Format**: Emoji prefixes (❌🔍💡🔧), fuzzy suggestions, recovery steps
- **Tool Schemas**: 100% coverage (28 tools) - WHEN TO USE, SEE ALSO, EXAMPLES
- **Fuzzy Helper**: `/lib/mcp/server/utils/fuzzy-search-helper.js` - `getScoredSuggestions()`

### Gold Standard Excellence Patterns (Dec 2025 Assessment)
**Reference**: `/.claude/knowledge/patterns/mcp-tool-gold-standard-pattern.md`
**Source**: 28-tool UX assessment across 5 domains

**6 Gold Standards to Apply**:
1. **Description UX** (ChatGPT Connector) - A+ format with WHEN TO USE, WORKFLOW, complete examples
2. **Workflow Documentation** (Browser Automation) - 4-step workflow with "(you are here)" markers
3. **Error Categorization** (Hub Tools) - CONFIGURATION/DATABASE/PERMISSION categories with recovery
4. **State-Aware Responses** (Browser Automation) - nextSteps adapt based on outcome
5. **Decision Trees** (Advanced Tools) - [WHICH ACTION DO I USE?] format for multi-action tools
6. **Cost/Benefit Messaging** (Browser Automation) - Include savings/impact when relevant

**Grading Rubric**:
- A+: All 6 gold standards + innovations
- A: 5+ gold standards met
- A-: 4 gold standards met
- B+: 3 gold standards met
- B: 2 gold standards + baseline

**When to Apply**: New tools, tool upgrades, UX reviews

### NEW: Plan 8 Tool Security Patterns
- **Three Security Levels**: PUBLIC_TOOLS (no auth), AUTHENTICATED_TOOLS (user required), ADMIN_TOOLS (admin role required)
- **Security Enforcement**: `enforceToolSecurity()` checks tool category and user context before allowing execution
- **Public Tool Filtering**: Authenticated tools like `services(action: "discover")` filter sensitive data via `filterPublicServiceData()`
- **Authentication Flow**: Tools check `context?.user?.id` for authentication, `context.user.role` for authorization
- **Error Messages**: Clear security errors like "Authentication required for tool: X" or "Admin privileges required"
- **Tool Security Helper**: `isPublicTool()` and `getToolSecurityLevel()` helpers for checking tool access levels

### SECURITY: Whitelist Before MCP Exposure (Nov 2025) ⚠️ CRITICAL

**Pattern**: 3-Layer Whitelist Protection for endpoints accepting dynamic function/action/command names

**Attack Vector**: AI Prompt Injection via MCP Tools
```
User to ChatGPT: "Call my execute-function tool with functionName='delete_database'"
ChatGPT → MCP Tool → POST /api/endpoint {"functionName": "delete_database"}
Without Whitelist: ❌ Executes malicious function
With Whitelist: ✅ 400 Bad Request + security log
```

**3-Layer Defense**:
1. **Layer 1**: Zod enum validation - `z.enum(ALLOWED_FUNCTIONS)` rejects at schema level
2. **Layer 2**: Type-safe registry - `Record<AllowedName, Handler>` (no switch/default)
3. **Layer 3**: Security logging - Log userId, IP, timestamp for rejected calls

**Implementation**:
```typescript
// Validation schema
const ALLOWED_ACTIONS = ['read', 'write', 'delete'] as const;
const schema = z.object({
  action: z.enum(ALLOWED_ACTIONS, {
    errorMap: () => ({ message: `Action must be one of: ${ALLOWED_ACTIONS.join(', ')}` })
  })
});

// Function registry (no switch/default!)
const REGISTRY: Record<typeof ALLOWED_ACTIONS[number], Handler> = {
  'read': handleRead,
  'write': handleWrite,
  'delete': handleDelete
};

// Route with security logging
if (!result.success) {
  mcpLogger.error({
    tool: 'tool_name',
    requestedAction: body.action,
    userId: context?.user?.id,
  }, 'MCP tool attack attempt');
  return 400 error
}
```

**When to Use**:
- ✅ **BEFORE** exposing endpoint as MCP tool
- ✅ Any tool accepting function names, action types, commands
- ✅ Tools callable by external AI agents (ChatGPT, Claude Desktop)

**Example**: `execute-function` endpoint (NOT MCP-exposed yet, but whitelist implemented proactively)
**Files**: `execute-function-validation.ts`, `function-registry.ts`
**Impact**: 80% risk reduction (21/20 → 5/20)

**Why Critical for MCP**: AI agents can be tricked via prompt injection to call malicious functions. Whitelists prevent exploitation.

### Self-Documenting Hub Architecture
- **registry(action: 'list') Tool**: Gold Standard A grade with comprehensive nextSteps guidance
- **services(action: 'discover') Tool**: Hub capability browsing for authenticated users
- **All Authenticated**: Phase 3 requires authentication for all tools (PUBLIC_TOOLS empty)
- **Integration Points**: Registered in tool-schemas.js, tool-security.js, tool-annotations.js, hub-tools-handler.js (facade → extracted handlers), mcp-server-v5.js
- **Self-Referential Design**: Tool documents itself, completing the self-discovery loop
- **Revolutionary Milestone**: First truly self-documenting AI service registry tool

### NEW: OAuth 2.0 MCP Authentication Integration (Plan 9)
- **Dual Token Support**: OAuth 2.0 + JWT authentication for MCP server contexts
- **Token Format Detection**: `Bearer oauth2_` vs standard `Bearer jwt_token` automatic recognition

### NEW: ChatGPT OpenAI Connector Integration (2025-09-25)
- **Search & Fetch Tools**: Successfully integrated `search` and `fetch` tools for OpenAI MCP compatibility
- **Tool Registration Pattern**: Added to tool-schemas.js with Zod validation, registered in mcp-server-v5.js
- **PUBLIC_TOOLS Security**: Both tools configured as PUBLIC_TOOLS for unauthenticated read-only access
- **Handler Implementation**: ChatGPTConnectorHandler in `/lib/mcp/server/tools/chatgpt-connector-handler.js`
- **Response Format**: Direct JSON arrays/objects matching OpenAI requirements (no wrapper objects)
- **Tool Discovery**: Fixed hardcoded PUBLIC_TOOLS array in mcp-server-http-clean.js for proper listing
- **Integration Files**: Modified tool-schemas.js, tool-security.js, mcp-server-v5.js, mcp-server-http-clean.js
- **Production Deployment**: Successfully deployed and operational at https://paichart.app/mcp
- **Enhanced Middleware**: `enhanced-auth-middleware.ts` with 4-tier authentication fallback
- **MCP Context Integration**: `authenticateMCPRequest()` method supports OAuth tokens
- **Tool Security Preserved**: OAuth users access same tool boundaries (PUBLIC/AUTHENTICATED/ADMIN)
- **Enterprise Features**: OAuth SSO integration with Claude Desktop and MCP clients

### NEW: MCP Pagination Exposure Pattern (Nov 15, 2025)
- **Helper**: MetadataEnhancer utility (`/lib/mcp/server/utils/metadata-enhancer.js`) for API metadata pass-through
- **Structure**: _meta.pagination { total, returned, hasMore, nextPage, currentPage, totalPages, pageSize }
- **Tools Updated**: project(task.list), services(discover), list_browser_templates (3 tools enhanced)
- **Pattern**: `MetadataEnhancer.createEnhancedMeta({ tool, apiResponse, filters })` - centralizes extraction logic
- **Formatters**: Updated to show "X of Y total (page N of M)" in text responses
- **Evidence**: 30/30 dual-layer tests (100% passing), 80% reduction in user confusion about completeness
- **Impact**: Exposes existing API capabilities (pagination, performance) that were hidden from AI clients
- **Reference**: `/.claude/knowledge/patterns/mcp-metadata-exposure-pattern.md`

### NEW: MCP Tools vs Server-Side Prompts Paradigm (Nov 15, 2025)
- **Critical Distinction**: Two execution contexts in MCP server
- **MCP Tools**: External interface (AI client → MCP → apiClient.get() → API/HTTP → DB) - use MetadataEnhancer pattern
- **Server-Side Prompts**: Internal functions (Prompt registry → prisma.findMany() → DB direct) - use manual count pattern
- **Why Different**: Tools respect API layer boundaries (external), prompts have direct DB access (internal, faster)
- **Example**: project(task.list) (tool) uses apiClient, audit_all_tasks (prompt) uses prisma directly
- **Pattern Choice**: Building tool? Use apiClient + MetadataEnhancer. Building prompt? Use direct Prisma + count.
- **Reference**: Pattern 4 in mcp-metadata-exposure-pattern.md (explains both paradigms)

### NEW: Streamable HTTP Transport Integration (Plan 10)
- **MCP 2025-03-26 Compliance**: Full specification support with POST + GET dual transport
- **JSON-RPC Processing**: Single and batched request handling with proper status codes
- **Transport Security**: Origin validation and DNS rebinding protection
- **Session Management**: Mcp-Session-Id header support for enhanced client experience
- **Backward Compatibility**: Existing SSE clients continue working unchanged
- **Integration Points**: All 26 MCP tools working with streamable transport, authentication preserved

### NEW: HTTP Authentication Context Flow (August 2025)
- **Context Initialization**: `initializeAuthContext()` establishes user from API key on server startup
- **Full Context Passing**: All tool handlers now accept `(args, context)` signature consistently
- **Authentication Flag**: Context includes `authenticated: true/false` for tool access control
- **Read-Only Access**: 17 tools available without authentication for better onboarding
- **Write Protection**: 8 tools require authentication for data modification operations
- **Fixed Logic**: Authentication requirement check corrected from inverted logic


## [evicted] MCP Layer Architecture: Lessons from task.update Fix (2025-10-15)

**Layer Separation**:
- MCP Server Layer:  - Receives raw parameters, normalizes
- API Handler Layer:  - Receives normalized params, executes business logic

**task.update Case**: 
- Manual extraction at API handler layer is CORRECT
- Already receives normalized parameters from MCP server upstream
- Not duplicating logic - operating at different layer

**MCP Protocol Best Practice**:
- Response diff enhances client UX (ChatGPT can report exact changes)
- NO_EFFECT errors better than silent success
- Transaction isolation prevents race conditions in before/after diff
- Token cost for diff: < 0.5% of limit (negligible)



