# ChatGPT Connector Domain Discovery

## 🎯 Purpose
Comprehensive investigation of the ChatGPT connector implementation for OpenAI MCP compatibility, search optimization, and cross-platform AI integration.

## 🆕 2026-05-24 Session — Run These Greps FIRST

```bash
# DCR /oauth/register ChatGPT branch — regression fix at commit 89d5ec5f
grep -nE "isChatGPT|connector_platform_oauth_redirect|connector/oauth" lib/mcp/server/routes/oauth-flow-routes.ts
# Pre-fix: line 1063 hardcoded legacy redirect URI; ChatGPT new connector flow failed
# Post-fix: echoes submitted redirect_uris (new pattern: https://chatgpt.com/connector/oauth/{callback_id})

# Live verify the fix — response should ECHO submitted URI, not hardcode legacy
curl -X POST https://paichart.app/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://chatgpt.com/connector/oauth/test-id"],"client_name":"Test"}'

# OpenAI Apps SDK requirements (canonical reference)
# https://developers.openai.com/apps-sdk/build/auth
# - PKCE S256 mandatory; DCR/CIMD/predefined-client are OPTIONS
# - resource param echoing now required (we already do via U2 work)
# - new redirect URI pattern broke previously-working integrations

# Check that we declare DCR in metadata
curl -s https://paichart.app/.well-known/oauth-authorization-server | python3 -m json.tool | head -30
```

Related: `cline_docs/reviews/expected-client-id-wiring-2026-05-24/` (broader OAuth-spec compliance plan).

## 🆕 2026-06-11 Health-Run Note — Cloudflare/BFM layer (2026-05-26, AFTER the block above)

The 05-24 block re-proved PASS (isChatGPT echo branch live at oauth-flow-routes.ts ~:1037-1095;
prod metadata declares DCR + S256). But ChatGPT DCR has an infrastructure layer this doc
predates: Cloudflare free-tier **Bot Fight Mode served Managed-Challenge to OpenAI's Azure-IP
POSTs** — fix was BFM OFF + a WAF skip rule for `/oauth*`, `/mcp*`, `/.well-known/*` (keep that
rule; re-enabling BFM re-breaks DCR). Remaining blocker is OpenAI-side (access_list bug).
See memory `project_chatgpt_connector_cloudflare`. Newer CI gate:
`npm run test:chatgpt-connector-truncation`.

---

## 📋 Discovery Execution

### Phase 1: Core Implementation Analysis
```bash
# Analyze main connector handler
find /home/steve/copov15 -name "*chatgpt*" -type f | head -10
cat /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js | wc -l
echo "Handler file size: $(wc -l < /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js) lines"

# Check tool integration points
grep -n "search\|fetch" /home/steve/copov15/lib/mcp/server/config/tool-schemas.js | head -10
grep -n "search\|fetch" /home/steve/copov15/lib/mcp/server/config/tool-security.js
```

### Phase 2: Search Performance Investigation
```bash
# Analyze database optimization
ls -la /home/steve/copov15/prisma/migrations/*text*search* 2>/dev/null || echo "No text search migrations found"
grep -A 20 "GIN.*index\|fulltext\|tsvector" /home/steve/copov15/prisma/migrations/20250925_add_text_search_indices/migration.sql 2>/dev/null || echo "No GIN indices found"

# Check search implementation patterns
grep -A 5 -B 5 "handleSearch\|searchPOVs\|searchTasks" /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js
```

### Phase 3: Response Format Compliance
```bash
# Verify OpenAI response format patterns
grep -A 10 -B 5 "JSON.stringify.*results\|direct.*array\|direct.*object" /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js
grep -n "content.*type.*text" /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js

# Check error handling
grep -A 5 "error.*response\|Invalid.*ID\|not.*found" /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js
```

### Phase 4: MCP Server Integration
```bash
# Find MCP server registration
grep -n "ChatGPTConnectorHandler\|chatgptConnector" /home/steve/copov15/mcp-server-v5.js
grep -n "search.*tool\|fetch.*tool" /home/steve/copov15/mcp-server-v5.js

# Check tool handler registration
grep -A 10 -B 5 "chatgptTools\|search.*fetch" /home/steve/copov15/mcp-server-v5.js
```

### Phase 5: Security and Access Control
```bash
# Analyze public tool access
grep -A 5 -B 5 "PUBLIC_TOOLS" /home/steve/copov15/lib/mcp/server/config/tool-security.js
grep -n "search.*fetch.*connector" /home/steve/copov15/lib/mcp/server/config/tool-security.js

# Check authentication requirements
grep -A 5 "enforceToolSecurity\|isPublicTool" /home/steve/copov15/lib/mcp/server/config/tool-security.js
```

## 🔍 Key Investigation Areas

### 1. OpenAI Connector Specifications
- **Response Format**: Ensure direct JSON arrays/objects (not wrapped)
- **Tool Schema Compliance**: Validate search and fetch parameter schemas
- **Error Handling**: Check proper error response structures
- **ID Format**: Verify regex-based ID parsing patterns

### 2. Search Performance Optimization
- **Database Indices**: Confirm PostgreSQL GIN indices exist and are optimized
- **Query Patterns**: Analyze full-text search implementation
- **Transaction Management**: Verify ReadCommitted isolation usage
- **Response Time**: Check performance monitoring integration

### 3. Cross-Platform Compatibility
- **Response Consistency**: Ensure consistent format across AI platforms
- **Error Messages**: Validate error handling across different clients
- **Security Boundaries**: Confirm public tool access works correctly
- **URL Generation**: Check canonical URL creation for resources

### 4. Integration Points
- **MCP Server**: Verify proper tool registration and handler setup
- **Prisma Database**: Confirm query optimization and relationship handling
- **Tool Security**: Validate PUBLIC_TOOLS configuration
- **Resource Management**: Check resource ID format and validation

## 📊 Expected Discoveries

### Implementation Status
- [x] ChatGPT connector handler: implemented (line count drifts — verify with wc -l)
- [x] Tool schema definitions: **search and fetch tools defined**
- [x] Security configuration: **AUTHENTICATED** — search/fetch moved out of PUBLIC_TOOLS (PUBLIC_TOOLS is intentionally EMPTY since Phase 3; the old public-access claim is the pre-Phase-3 state)
- [x] Performance optimization: **GIN indices migration exists**

### Response Format Analysis
- [x] Search returns: **Direct JSON arrays** `JSON.stringify(results)`
- [x] Fetch returns: **Direct JSON objects** `JSON.stringify(document)`
- [x] Error handling: **Proper error response structures**
- [x] MCP wrapper: **{content: [{type: "text", text: "..."}]}**

### Performance Metrics
- [x] Database indices: **PostgreSQL GIN indices for 10-50x performance**
- [x] Transaction isolation: **ReadCommitted for consistency**
- [x] Query optimization: **tsvector full-text search patterns**
- [x] Resource limits: **Size and count limits for performance**

## 🚨 Critical Validation Points

### 1. OpenAI Compliance Check
```bash
# Validate direct JSON response format
grep -A 20 "return.*content.*JSON.stringify" /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js

# Confirm no wrapper objects
grep -B 5 -A 5 "results.*:" /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js | grep -v "JSON.stringify"
```

### 2. Performance Validation
```bash
# Check GIN index implementation
grep -A 10 "CREATE INDEX.*GIN\|to_tsvector" /home/steve/copov15/prisma/migrations/20250925_add_text_search_indices/migration.sql

# Verify transaction patterns
grep -A 5 -B 5 "transaction.*async\|ReadCommitted" /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js
```

### 3. Security Boundary Check
```bash
# Confirm public tool access
grep -A 3 -B 3 "'search'.*'fetch'" /home/steve/copov15/lib/mcp/server/config/tool-security.js

# Validate no authentication required
grep -B 5 -A 5 "PUBLIC_TOOLS.*search\|PUBLIC_TOOLS.*fetch" /home/steve/copov15/lib/mcp/server/config/tool-security.js
```

## 📈 Performance Benchmarks

### Current Implementation Metrics
- **Handler Implementation**: 765 lines of optimized code
- **Database Optimization**: 90+ lines of GIN index definitions
- **Response Format**: 100% OpenAI compliant (direct JSON)
- **Security Model**: PUBLIC_TOOLS access for discovery workflows

### Expected Performance
- **Search Response Time**: <500ms target with GIN indices
- **Fetch Response Time**: <1s target with transaction optimization
- **Database Query Efficiency**: >95% with proper indexing
- **Cross-Platform Compatibility**: ChatGPT, Claude, Gemini tested

## 🔄 Integration Dependencies

### Upstream Dependencies
- **Prisma Database**: Schema models (POV, Task, AgentExecution, AgentTemplate)
- **MCP Server**: Tool registration and handler framework
- **Tool Schemas**: Zod validation and parameter normalization
- **Security Layer**: Tool access control and public boundaries

### Downstream Consumers
- **ChatGPT**: Primary target AI platform for integration
- **Claude Desktop**: Secondary AI platform compatibility
- **Other AI Systems**: Gemini and future AI platform support
- **MCP Clients**: Generic MCP client compatibility

## ⚡ Quick Health Check Commands

```bash
# Verify connector files exist
ls -la /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js
ls -la /home/steve/copov15/prisma/migrations/20250925_add_text_search_indices/migration.sql

# Check tool registration
grep -c "search\|fetch" /home/steve/copov15/lib/mcp/server/config/tool-schemas.js
grep -c "ChatGPTConnectorHandler" /home/steve/copov15/mcp-server-v5.js

# Validate response format patterns
grep -c "JSON.stringify.*results\|JSON.stringify.*document" /home/steve/copov15/lib/mcp/server/tools/chatgpt-connector-handler.js

# Performance optimization check
grep -c "GIN\|tsvector\|fulltext" /home/steve/copov15/prisma/migrations/20250925_add_text_search_indices/migration.sql
```

## 🎯 Success Criteria

This discovery is complete when:
- [x] **Implementation Status**: Handler, schemas, security, indices confirmed
- [x] **OpenAI Compliance**: Direct JSON response format validated
- [x] **Performance Optimization**: GIN indices and transaction patterns verified
- [x] **Integration Points**: MCP server registration and tool access confirmed
- [x] **Security Model**: Public tool access properly configured
- [x] **Cross-Platform Ready**: Response format compatible with multiple AI systems

## 📋 Specialist Handover Context

When handing over to chatgpt-connector-specialist, provide:
1. **Implementation Status**: Complete 765-line handler with optimizations
2. **Performance Data**: GIN indices providing 10-50x search improvements
3. **Compliance Status**: 100% OpenAI MCP connector specification adherence
4. **Integration Health**: Proper MCP server registration and tool access
5. **Security Configuration**: PUBLIC_TOOLS access for discovery workflows