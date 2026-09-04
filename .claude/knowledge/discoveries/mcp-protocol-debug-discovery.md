# MCP Protocol Debug Discovery Prompt

## Discovery Mission
Comprehensive analysis of MCP (Model Context Protocol) server architecture, resource management flows, and protocol compliance to identify root causes of resource reading failures despite successful discovery.

## 🆕 2026-05-26 — "ChatGPT connector fails but Claude works"? Check OIDC discovery FIRST

```bash
# OpenAI's connector backend probes GET /.well-known/openid-configuration during discovery and
# ABORTS on a 404 (before register/authorize). Claude/Gemini use oauth-authorization-server + DCR
# and never probe it. So the signature "ChatGPT setup fails, Claude succeeds" == openid-config 404.
# We dropped it once on a "zero hits" basis; re-added b222db64. Verify it returns 200:
curl -s https://paichart.app/.well-known/openid-configuration -o /dev/null -w "openid-config HTTP %{http_code}\n"
grep -n "openid-configuration" lib/mcp/server/routes/oauth-discovery-routes.ts
# nginx signature: OpenAI aiohttp UA → openid-configuration → 404
ssh <PROD_USER>@<PROD_HOST> "grep openid-configuration /var/log/nginx/access.log | grep aiohttp | tail"
```

Ref: `b222db64`. Discovery routes live in `lib/mcp/server/routes/oauth-discovery-routes.ts` (R5 path array, pinned test in `scripts/test-routes-oauth-discovery.ts`).

---

## Current Known Issues (HISTORICAL - MOSTLY RESOLVED)
- ✅ **RESOLVED**: Resources discoverable via ListMcpResourcesTool but fail on ReadMcpResourceTool
- ✅ **RESOLVED**: Claude Desktop shows "I'm not able to directly access MCP artifact links"  
- ✅ **RESOLVED**: Database contains artifact content but MCP server returns "Resource not found"
- ✅ **RESOLVED**: Claude.ai browser tool invisibility - Fixed with 202 Accepted notifications
- ✅ **ACHIEVED**: Universal MCP client compatibility with dual-mode architecture

## Major Breakthroughs (2025-09-10)
- **🔥 notifications/initialized protocol fix**: 202 Accepted resolves Claude.ai proxy forwarding
- **🔥 Manual session management**: Bypassed broken SDK callbacks with direct storage
- **🔥 Dual-mode architecture**: Automatic client detection enabling universal compatibility
- **🔥 Complete method coverage**: Added prompts/list and resources/list handlers
- **🔥 Production validation**: 10+ tool executions working across both Claude Code and Claude.ai browser

## Discovery Areas

### 1. MCP Server Protocol Implementation
**Investigate**: `./mcp-server-v5.js`

**Focus Points**:
- Resource request handler implementation (lines around `resources/read`)
- URI parsing and resource key generation logic
- Database query execution and error handling
- Response format compliance with MCP specification
- Environment variable loading and configuration access

**Key Questions**:
- How are incoming `mcp://artifacts/{id}` URIs parsed and transformed?
- What resource keys are used for database lookups vs cache access?
- Are database queries succeeding but responses failing format validation?
- Is the response structure MCP-compliant (`contents` array format)?

### 2. Resource Manager Architecture
**Investigate**: `./lib/mcp/simple-resource-manager.js`

**Focus Points**:
- Resource registration flow and cache storage patterns
- Resource retrieval methods and key transformation logic
- Database artifact queries and content loading
- Cache-to-protocol format mapping

**Key Questions**:
- How are resources stored in the cache (what keys are used)?
- What happens during `getResource()` calls with `includeContent=true`?
- Are there inconsistencies between registration and retrieval key formats?
- How is database content transformed into MCP-compliant responses?

### 3. Database Integration Layer
**Investigate**: Database queries and Prisma integration

**Focus Points**:
- Agent artifact table structure and content storage
- Query execution patterns and error handling
- Data transformation between database and MCP protocol
- Connection pooling and transaction management

**Key Questions**:
- Do direct database queries for test artifacts succeed?
- Is artifact content properly stored and retrievable?
- Are there database connection issues during MCP requests?
- How is binary/text content handled in database storage?

### 4. Protocol Compliance Analysis
**Investigate**: MCP specification adherence

**Focus Points**:
- Resource URI format (`mcp://` protocol handling)
- Resource content structure (`contents` array vs `content` property)
- JSON-RPC request/response format compliance
- Error response format and status codes

**Key Questions**:
- Are resource URIs properly formatted according to MCP spec?
- Is the response structure exactly what Claude Desktop expects?
- Are error responses providing actionable debugging information?
- How does the current implementation compare to MCP reference implementations?

### 5. Environment and Configuration
**Investigate**: Runtime environment and configuration loading

**Focus Points**:
- Environment variable availability during MCP server execution
- Database connection string and authentication
- API keys and signing keys for artifact access
- Development vs production configuration differences

**Key Questions**:
- Are all required environment variables loaded when MCP server starts?
- Is the database connection properly established before handling requests?
- Are authentication tokens valid for artifact access?
- How does the MCP server handle configuration errors?

## Testing Methodology

### 1. Direct Protocol Testing
Create isolated test scripts that:
- Send raw MCP JSON-RPC messages to server
- Log complete request/response cycles
- Test specific failing resource URIs
- Validate response format compliance

### 2. Database Verification
- Direct SQL queries for test artifacts
- Content size and format validation
- Transaction isolation testing
- Connection pool status checks

### 3. Cache State Analysis
- Resource manager cache inspection
- Key format comparison between operations
- Cache invalidation and cleanup testing
- Memory vs database consistency checks

### 4. Configuration Validation
- Environment variable enumeration
- Configuration file parsing
- Authentication token validation
- Network connectivity testing

## Expected Discoveries

### Architecture Issues
- Split-brain patterns where discovery and reading use different code paths
- Cache key inconsistencies causing lookup failures
- Protocol format violations in response structure
- Configuration loading race conditions

### Integration Problems
- Database query errors masked by poor error handling
- Resource manager state inconsistencies
- Authentication failures in artifact access
- Environment variable loading timing issues

### Protocol Compliance Gaps
- Non-standard resource URI handling
- Incorrect response format for Claude Desktop
- Missing required MCP response fields
- Error response format problems

## Handover Protocol

Upon completion, provide:

### 1. Root Cause Analysis
- Specific technical issue preventing resource reading
- Code locations and line numbers for problematic areas
- Architecture diagrams showing failure points
- Comparison with working resource discovery flow

### 2. Diagnostic Evidence
- Complete protocol message traces
- Database query results and timings
- Configuration validation results
- Cache state snapshots

### 3. Recommended Fixes
- Specific code changes with file paths and line numbers
- Configuration adjustments needed
- Testing procedures for validation
- Rollback procedures if fixes fail

### 4. Test Validation Plan
- Specific test cases to verify fixes
- Success criteria for each test
- Regression testing recommendations
- Monitoring and alerting suggestions

## Gemini CLI Compatibility Fixes (2025-09-24)

### Protocol Compliance
```bash
# Check prompts/get implementation
echo "=== Prompts/Get Handler ==="
grep -r "case 'prompts/get'" mcp-server-http-clean.js -B 5 -A 30

# Message format validation
echo "=== Message Content Format ==="
grep -r "role.*user.*content.*type.*text" mcp-server-http-clean.js -B 2 -A 2

# Notification compliance (202 Accepted)
echo "=== Notification Response ==="
grep -r "notifications/initialized.*202" mcp-server-http-clean.js -B 2 -A 5
```

### Schema Validation Issues
```bash
# Check for non-standard fields
echo "=== Schema Generation ==="
grep -r "markdownDescription\|zodToJsonSchema" mcp-server-v5.js -B 2 -A 5

# Tool schema export
echo "=== Tool Capabilities Export ==="
grep -r "getToolCapabilities\|convertZodToJsonSchema" mcp-server-v5.js -B 2 -A 10
```

### OAuth Discovery
```bash
# Multiple discovery paths
echo "=== OAuth Discovery Endpoints ==="
grep -r "well-known/oauth\|oauth/discovery" mcp-server-http-clean.js -B 2 -A 2

# SSE session creation
echo "=== OAuth SSE Sessions ==="
grep -r "OAuth.*session.*create" mcp-server-http-clean.js -B 5 -A 10
```

## Tools Available
- **Read**: Examine source code and configuration files
- **Edit**: Apply targeted fixes to identified issues
- **Write**: Create test scripts and diagnostic tools
- **Bash**: Execute database queries and protocol tests
- **Grep**: Search for patterns across the codebase
- **Glob**: Find related files and dependencies
---

## Wave 6 Update — MCP Transport Lives in mcp-transport-routes.ts (May 21, 2026)

**Wave 6 Phase 6.5** (commit `3e9aec51`) extracted R11 (POST /mcp main handler) + R12 (GET /mcp SSE) from `mcp-server-http-clean.js` to `lib/mcp/server/routes/mcp-transport-routes.ts`.

### Where to debug MCP protocol issues now

| Symptom | Where to look |
|---|---|
| POST /mcp returning wrong status code / wrong JSON-RPC error shape | `lib/mcp/server/routes/mcp-transport-routes.ts:registerR11Post` |
| GET /mcp SSE establishment failing | `lib/mcp/server/routes/mcp-transport-routes.ts:registerR12GetSSE` |
| ChatGPT manifest discovery (`User-Agent: openai-mcp/*`) failing | R12 inner branch — `mcp-transport-routes.ts` lines around `isChatGPTDiscovery` |
| Initialize request not triggering OAuth (Claude Desktop) | B2 in `lib/mcp/server/routes/oauth-flow-routes.ts:registerB2UnauthInitializeMiddleware` (NOT R11 — B2 must fire FIRST) |
| Session ID assignment / Mcp-Session-Id header | R11 — search `currentSessionId` in `mcp-transport-routes.ts` |
| Stateless vs persistent mode routing | `ctx.detectClientMode(req)` → `MCPCoreManager.detectClientMode()` at `lib/mcp/server/mcp-core.ts` (Wave 7 Phase 7.2 extracted from server class). |
| processRequest backend dispatch failures (12-method switch) | `MCPCoreManager.processRequest()` at `lib/mcp/server/mcp-core.ts` (Wave 7 Phase 7.2 extracted from server-class `processMCPRequest` — same logic, renamed for clarity). Server class delegates via `ctx.processMCPRequest = (req, user) => this.mcpCore.processRequest(req, user)`. |
| Stateless mode dispatch (R11 fallback) | `MCPCoreManager.handleStatelessRequest()` at `lib/mcp/server/mcp-core.ts` (Wave 7 Phase 7.2). Try/finally cleanup added per Plan v2 I-CROSS-10. |
| Resource URI shape parsing (resources/read branch) | `parseResourceUri()` at `lib/mcp/server/mcp-resource-uri.ts` (Wave 7 Phase 7.2 sub-helper extraction per I-CROSS-6). |
| VALID_MCP_METHODS dispatch allowlist | `lib/mcp/server/mcp-methods.ts` (Wave 7 Phase 7.2 D6 fold — symmetric with MCP_PUBLIC_METHODS at `lib/auth/mcp-method-classifier.ts`). |
| MCP backend lifecycle init (`setupMCPServer` + `initializeAuthContext`) | `MCPCoreManager.init()` + `MCPCoreManager.initializeAuthContext()` at `lib/mcp/server/mcp-core.ts` (Wave 7 Phase 7.1). Server-class `start()` calls `await this.mcpCore.init()` then `await this.mcpCore.initializeAuthContext()`. |

### Critical pattern — R12 inner-closure auth (sec-ops C6)

R12 does NOT use chain-auth (`app.get('/mcp', authMiddleware, ...)`). It uses inner-closure auth (`authMiddleware(req, res, async () => { ... })`) because the ChatGPT manifest discovery branch must run WITHOUT auth.

```javascript
// R12 simplified structure:
ctx.app.get('/mcp', async (req, res) => {
  if (isChatGPTDiscovery) {
    return res.json(staticManifest);  // No auth — explicit branch
  }
  authMiddleware(req, res, async () => {  // INNER closure for auth
    // SSE establishment + session creation
  });
});
```

**Test 3 in `scripts/test-routes-mcp-transport.ts` is the load-bearing assertion**: `GET /mcp` + non-ChatGPT UA + no auth → 401 from inner closure (proves NO SSE-establishment bypass).

### Curl debug commands (post-Wave-6 paths)

```bash
# POST /mcp unauth initialize (expect 401 + WWW-Authenticate from B2)
curl -v -X POST https://paichart.app/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}},"id":1}'

# GET /mcp + ChatGPT UA (expect 200 manifest, no auth challenge)
curl -v -H 'User-Agent: openai-mcp/1.0' https://paichart.app/mcp

# GET /mcp + curl UA (expect 401 from inner closure)
curl -v https://paichart.app/mcp
```

@see `lib/mcp/server/routes/mcp-transport-routes.ts`
@see `scripts/test-routes-mcp-transport.ts`
