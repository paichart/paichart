# MCP Hub Discovery Task

**Last Updated**: 2026-06-11 (health-run: consolidated tool counts, born-stale module list purged, gold-standard runner fixed)
**Status**: Enhanced v4.9 - Post-consolidation counts re-proven; Expected Outputs marked as dated snapshots
**Confidence**: Very High - Production-ready with named workflows, admin GUI, internal routing
**Last Validated**: 2026-07-27 - Tools 9 AUTH + 1 ADMIN = 10, hub modules 15, advanced modules 6, resources 15, test suites 18, facades 377/302, annotations 10/10, gold standard services B+ / registry B, §1b policy wiring INTACT (grep itself was drifted — fixed), prod 15 ACTIVE services
*(Prior: 2026-07-14 — same counts except advanced modules 5.)*

## Objective
Perform comprehensive discovery of the MCP Hub implementation including service registry architecture, cross-service orchestration capabilities, production service integrations, and the revolutionary conversational AI service ecosystem.

## Context
The MCP Hub represents a paradigm shift in AI service architecture - transforming pAIchart from a project management platform into the world's first conversational AI service registry. Successfully launched 2025-08-17 with 4 registered services including production Sentry MCP integration.

## Discovery Scope

### 1. Service Registry Architecture
- [ ] Analyze MCPTool model usage as service registry
- [ ] Document service storage in configuration/permissions JSON fields
- [ ] Map service ownership tracking via ownerId
- [ ] Verify service discovery via database queries
- [ ] Test service uniqueness validation
- [ ] Document service status lifecycle (ACTIVE, INACTIVE, ERROR, MAINTENANCE)

### 2. MCP Hub Tools Implementation
- [ ] Examine the consolidated tool surface (6 consolidated + 4 standalone = 10) in mcp-server-v5.js
- [ ] Analyze tool schemas in tool-schemas.js with Zod validation
- [ ] Document parameter parsing for JSON strings vs objects
- [x] Test authentication context passing from HTTP to MCP server ✅ (Fixed August 2025)
- [ ] Verify tool handler implementations in hub-tools-handler.js
- [ ] Map tool capabilities and error handling

### 3. Cross-Service Communication
- [ ] Test services(action: "call") for service-to-service communication
- [ ] Analyze service discovery by capability and category
- [ ] Document service health monitoring and performance tracking
- [ ] Test service interaction logging via MCPInteraction model
- [ ] Verify service proxy capabilities and error handling
- [ ] Map cross-service authentication and authorization

### 4. Production Service Integrations
- [ ] Document Sentry MCP integration success (OAuth, 5 tools, 2 resources)
- [ ] Analyze weather-api and sentiment-analyzer test services
- [ ] Map service capability patterns and categorization
- [ ] Test service registration workflow via register_guide database prompt
- [ ] Verify service discovery patterns across different service types
- [ ] Document production readiness indicators

### 5. Database Prompt System (Evolved from Built-in Wizards)
- [ ] Examine 18 database prompts (17 AgentPromptLibrary + 1 built-in audit_all_tasks)
- [ ] Key hub prompts: register_guide, get_started, workflow_guide, security_policy, trust_levels
- [ ] Test prompt-to-tool integration and parameter handling
- [ ] Document natural language service management patterns
- [ ] Map prompt argument handling and context injection
- [ ] Verify conversational service discovery effectiveness

### 6. HTTP Server and Cross-Platform Access
- [ ] Analyze mcp-server-http-clean.js wrapper functionality (the old `mcp-server-http.js` was deleted as dead code Apr 8 2026 / Phase 2.P0 step 2)
- [x] Document authentication context passing mechanism ✅ (Documented August 2025)
- [ ] Test Windows and Linux Claude Desktop compatibility
- [ ] Verify session management and user context preservation
- [ ] Map JWT token handling and API key authentication
- [ ] Document HTTP endpoint accessibility and CORS configuration

### 7. Tool Security & Access Permissions (Feb 2026)
- [ ] Verify 9 AUTHENTICATED_TOOLS + 1 ADMIN_TOOLS = 10 total (post-consolidation, re-proven 2026-06-11)
- [ ] Verify ADMIN_TOOLS: template (consolidated from list_agent_templates, get_agent_template_details)
- [ ] Test enforceToolSecurity() blocks non-admin from ADMIN_TOOLS
- [ ] Test getToolsForUser() returns 9 for USER/DEMO_USER, 10 for ADMIN
- [ ] Verify handler-level authorization: pov-create-handler.ts checkPermission table gate (ADMIN+USER since ed74e8ce 2026-05-25 — NOT hardcoded ADMIN); pov-update-handler.ts:63 ADMIN check
- [ ] Check fallbackPermissionCheck() in hub-utilities.js — since 2026-07-28 it DENIES ALL roles (was: DEMO_USER = USER, view+create granted). Verify it still denies; a role branch reappearing here means someone re-opened a fail-open on the permission path.
- [ ] Verify prompt-list-handler.js isPublic filter for non-admins
- [ ] Check JWT token permissions in mcp-oauth-validator.js (canRegisterServices includes DEMO_USER)
- [ ] Verify role hierarchy in user.ts (DEMO_USER rank = USER rank = 1)
- [ ] Run pipeline alignment: node scripts/verify-tool-annotations.js
- [ ] Reference: /.claude/knowledge/patterns/mcp-tool-lifecycle-pattern.md (Tool Access Permissions)

### 8. Plan 8 Security Integration
- [ ] Verify tool security boundaries (all tools AUTHENTICATED after Phase 3)
- [ ] Test service authorization with checkServiceAccess() triple validation
- [ ] Validate public discovery data filtering (8+ fields hidden)
- [ ] Confirm rate limiting tiers (100/1000/10 per minute)
- [ ] Check audit logging for SERVICE_CALL and UNAUTHORIZED_SERVICE_ACCESS
- [ ] Test public vs authenticated discovery responses

### 10. Modular Architecture (Dec 2025)
- [ ] Verify extracted handler modules in lib/mcp/server/tools/hub/ (14 modules)
- [ ] Check advanced handlers in lib/mcp/server/tools/advanced/ (5 modules)
- [ ] Validate facade pattern with dependency injection
- [ ] Confirm all handlers < 400 lines (maintainability goal)
- [ ] Test backward compatibility (100% maintained)
- [ ] Verify handler delegation pattern (one-line method calls)

### 11. Real Service Calling (Dec 2025)
- [ ] Test real MCP SDK client instantiation
- [ ] Verify HTTP/SSE transport support (WebSocket removed Jan 2026)
- [ ] Validate connection lifecycle (connect → callTool → pool manages close)
- [ ] Check real execution time tracking (not simulated)
- [ ] Test error handling for failed service calls
- [ ] Verify service-call-handler.js implementation (~440 lines)

### 12. Real Health Checks (Dec 2025)
- [ ] Test actual HTTP endpoint ping with fetch
- [ ] Verify 5-second timeout with AbortController
- [ ] Validate real latency measurement
- [ ] Check combined stored + realtime health data
- [ ] Test service-health-handler.js implementation (~500 lines)
- [ ] Verify realtime bypass parameter

### 13. Hub Resources (Dec 2025)
- [ ] Test 8 MCP resources (mcp://hub/services, mcp://hub/analytics, etc.)
- [ ] Verify integration into mcp-server-v5.js resource handler
- [ ] Check hub-resources.js implementation (293 lines)
- [ ] Validate resource URI patterns
- [ ] Test resource data retrieval

### 14. Performance Optimizations (Dec 2025)
- [ ] Verify database indices (composite + GIN)
- [ ] Test parallel queries (count + findMany in Promise.all)
- [ ] Validate discovery caching (60s TTL, LRU eviction)
- [ ] Check health caching (30s TTL, realtime bypass)
- [ ] Measure performance improvement (expected 70-86% faster)
- [ ] Test cache invalidation on mutations

### 15. Test Coverage (Dec 2025)
- [ ] Review 199 MCP tests across 6 suites
- [ ] Verify dual-layer architecture (pattern + behavior)
- [ ] Test initialization suite compliance
- [ ] Validate hub-tools test coverage
- [ ] Check resource-manager tests
- [ ] Verify parameter-intelligence tests

### 16. Workflow System (Jan 2026)
- [ ] Analyze MCPWorkflow and MCPWorkflowExecution models
- [ ] Document execution modes (PREDEFINED vs AD_HOC)
- [ ] Test MCPServiceOrchestrationHandler orchestration
- [ ] Verify orchestration modes (sequential, parallel, conditional)
- [ ] Check failure strategies (stop, continue, rollback)
- [ ] Validate workflow step dependencies
- [ ] Test WorkflowEngine plugin architecture

### 17. Workflow Monitoring (Jan 2026)
- [ ] Test services(action: "workflow.list") tool
- [ ] Verify services(action: "workflow.status") tool
- [ ] Check workflow execution history and status tracking

### 18. Activity Integration (Jan 2026)
- [ ] Test WORKFLOW_EXECUTED activity type
- [ ] Verify logWorkflowExecution integration in workflowEngine
- [ ] Check activity details schema (workflowId, workflowType, workflowStatus)
- [ ] Validate task timeline display of workflow executions
- [ ] Test fire-and-forget logging pattern

### 19. Compliance Policy (Jan 2026)
- [ ] Verify APPROVED_TOOLS static whitelist (~40 tools)
- [ ] Test dynamic whitelisting from registered service capabilities
- [ ] Check isTrustedInternalService() helper for localhost exception (BC70: checks both name and id)
- [ ] Validate BLOCKED_PATTERNS for injection/traversal protection
- [ ] Test BLOCKED_URLS for SSRF protection (internal networks, cloud metadata)
- [ ] Verify size limits (100KB params, 1MB response, max depth 3)
- [ ] Test violation message extraction (type/message/severity objects)

### 20. Docker Internal Services (Jan 2026, BC70 fix Mar 2026)
- [ ] Verify browser-automation-service registration via seed script
- [ ] Test browser service tools (scrape_page, fill_form, take_screenshot, etc.)
- [ ] Check notification-service registration
- [ ] Verify localhost endpoint allowed via isTrustedInternalService() (BC70: checks both name and id)
- [ ] Test service connection pooling
- [ ] Compare seed script vs `registry(action: 'register')` tool paths (seeded = title-case name, registered = kebab-case)

### 21. Hub Tools Enhancement Phase 1+2 (Jan 2026)
- [ ] Test `registry(action: 'tools')` for AI parameter discovery
- [ ] Verify fuzzy search by service_name (exact → partial → case-insensitive)
- [ ] Check schemaVersion field (1 = legacy string, 2 = full schema)
- [ ] Test state-aware nextSteps (found tools vs empty vs legacy format)
- [ ] Validate enhanced `registry(action: 'register')` accepts both formats
- [ ] Test legacy format: `capabilities: { tools: ['tool1', 'tool2'] }`
- [ ] Test new format: `capabilities: { tools: [{name, description, inputSchema}] }`
- [ ] Verify service-tools-handler.js implementation (~270 lines)
- [ ] Run Gold Standard compliance test: `npx tsx scripts/test-gold-standard-compliance.js --hub` (bare `node` exits 1 since 2026-06-11 — chain needs ts-node-style resolution for lib/prisma.ts; it silently no-opped Apr 8 → Jun 11)
- [ ] Current grades (proven 2026-06-11): services B+ (6/9), registry B (4/8) — the legacy '9/10 tools A grade' claim predates consolidation

### 22. Internal Service Infrastructure (Jan 2026)
- [ ] Verify InternalServiceRouter.js exists and routes internal:// calls
- [ ] Check paichart-project-service + paichart-kpi-service + paichart-recommendation-engine registrations (post 2026-05-23 router cleanup, commit 792dbc01)
- [ ] Verify InternalServiceRouter.serviceToolMap has NO legacy `paichart-pov-service` / `paichart-task-service` entries (dropped — were never in DB → dead code)
- [ ] Test internal service call flow (no HTTP, same process)
- [ ] Verify context normalization (MCP context.user.id ↔ Hub context.apiUserContext.userId)
- [ ] Check internal service health returns healthy without HTTP ping
- [ ] Test npm run mcp:register-internal script
- [ ] Verify services in database with configuration.type = 'internal'

### 23. Shared Orchestration Engine (Jan 2026)
- [ ] Verify orchestration-engine.js exists as pure JavaScript
- [ ] Check engine is imported by both workflow-tools-handler.js (JS) and mcpOrchestrationHandler.ts (TS)
- [ ] Test variable chaining resolution ({{step.N.output.field}})
- [ ] Test circular dependency detection
- [ ] Verify two-step validation: Zod schema → Engine.validate()
- [ ] Check execution modes (sequential, parallel, conditional)
- [ ] Check failure strategies (stop, continue, rollback)
- [ ] Verify 100% feature parity between JS and TS handlers

### 24. Transport Architecture (Jan 2026 - WebSocket Removed)
- [ ] Confirm WebSocket transport code removed from service-call-handler.js
- [ ] Verify service-connection-pool.js rejects ws:// endpoints
- [ ] Check SSEClientTransport is the only external transport
- [ ] Verify PostgreSQL NOTIFY/LISTEN for real-time events (not WebSocket)
- [ ] Confirm ws package removed from package.json dependencies

### 25. Named Workflow System & GUI (Jan 2026)
- [ ] Verify workflowName parameter in services(action: "workflow.execute") tool schema
- [ ] Check MCPWorkflow schema has unique name constraint
- [ ] Test REST API endpoints: GET/POST /api/workflows, POST /api/workflows/run
- [ ] Verify admin-only access (allowedRoles: [ADMIN, SUPER_ADMIN])
- [ ] Check Workflow GUI at /workflows route
- [ ] Test WorkflowTerminal CRUD operations
- [ ] Test RecommendationEngine service discovery
- [ ] Verify sidenav entry with role-based visibility
- [ ] Check /api/mcp/services admin endpoint for service listing

## Search Strategies

### 1. Service Registry Analysis
```bash
# Check registered services
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT id, name, status, version, configuration->>'endpoint' as endpoint, configuration->>'ownerEmail' as owner FROM mcp_tools ORDER BY \"createdAt\" DESC;"

# Analyze service capabilities and approval status
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT name, status, configuration->>'approvalStatus' as approval_status, permissions->>'publicAccess' as public FROM mcp_tools WHERE status = 'ACTIVE';"

# Check service interactions
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT toolId, action, status, \"executionTime\", \"createdAt\" FROM mcp_interactions ORDER BY \"createdAt\" DESC LIMIT 10;"
```

### 1b. Registry-Transparency Policy Audit (2026-05-23, commit 2460ed7e)
Cross-tenant exposure in `services.discover` / `services.health`. Policy: publisher-contact + verified badge visible; internal authorization plumbing stripped. See mcp-hub-specialist § "Registry-transparency policy" for the field-by-field table.
```bash
# Confirm the stripOwnerIdentity plumbing exists (was added 2026-05-23 — if missing, policy regressed)
grep -n "stripOwnerIdentity" lib/mcp/server/tools/public-discovery-filter.js lib/mcp/server/tools/hub/service-discovery-handler.js

# Confirm M1 was rolled back in services.health — handler should NOT gate ownerEmail per-caller
grep -nE "isOwnerOrAdmin.*ownerEmail|owner: isOwnerOrAdmin" lib/mcp/server/tools/hub/service-health-handler.js
# Expected: zero hits. Hits indicate someone reintroduced per-caller email gating (breaks single-mental-model).

# Confirm per-service factory is wired in the handler.
# 2026-07-27 fix: the old grep's `filterServiceArray.*optionsFor` alternative NEVER matched —
# the handler passes an INLINE arrow, not a variable named optionsFor. It silently degraded to
# a 1-hit false-clean. Match the real call shape instead (expect 2 hits: the call + the flag).
grep -nE "filterServiceArray\(accessFiltered|stripOwnerIdentity: s\._isOwnerOrAdmin" lib/mcp/server/tools/hub/service-discovery-handler.js
# Expected: line ~324 (filterServiceArray(accessFiltered, true, (s) => ({ ) and ~325 (stripOwnerIdentity: ...).
# Zero hits = the per-service factory was removed → cross-tenant identity leak REGRESSION.

# Live verify cross-tenant strip (need a USER-role MCP token + a service owned by another account):
#   services(action: 'discover', limit: 20)
# In an externally-owned service row, expect ONLY: category, endpoint, transport, ownerEmail, serviceType, approvalStatus
# in configuration; permissions should only contain publicAccess. If ownerId/createdBy/evaluationResult/canDelete[]/
# canModify[]/permissions.owner present in a cross-tenant row → REGRESSION.
#
# ⚠️ A CLEAN LIVE RUN IS NOT EVIDENCE OF SAFETY (2026-07-27). Prod has exactly ONE distinct service
# owner, so `isOwner` is true on every service that carries strippable fields and the strip has
# nothing to demonstrate. The 2026-07-26 live experiment returned a correct-looking result while a
# real cross-tenant leak was live. Trust `npm run test:hub-discovery-caller-isolation` (two
# constructed owners) over any live observation on this registry.
```

#### 1b-ii. Cache-vs-policy wiring (added 2026-07-27 — the gap that let a leak survive §1b)

The 2026-07-27 health-run recorded "§1b policy wiring INTACT" and was **right about the filter and
wrong about the system**: a response cache sat in FRONT of `filterServiceArray`, so the correct
filter was simply never reached on a cache hit. §1b above checks that the control exists. These
check that nothing bypasses it.

**Invariant** (pattern `cache-key-as-trust-boundary`): *a cache in front of an authorization filter
relocates the trust boundary to the cache key; the key is then a security control.*

```bash
# 1) Enumerate every cache WRITE in the hub, then hand-verify each stores only
#    caller-independent data. This is a REVIEW TRIGGER, not a zero-hit assertion.
grep -nE "setCacheValue|\.cache\.set\(|healthCache\.set\(" lib/mcp/server/tools/hub/*.js
# Expected as of 2026-07-27: exactly 2 hits, both audited and legitimate —
#   hub-utilities.js:~651        RateLimitCache, keyed `${userId}:${serviceId}` (caller IS the key)
#   service-health-handler.js:~117  setHealthCacheValue; caller-dependent nextSteps/recommendation
#                                are applied AFTER retrieval via _applyCallerProjection()
# A THIRD hit is the finding: read what it stores before accepting it.
# service-discovery-handler.js must NOT appear — its cache was deleted (see check 4).

# 2) Cache keys must be built from NORMALIZED args, never raw ones.
#    For each handler that caches: the generateCacheKey/cacheKey line number must be GREATER than
#    the normalizeForTool line number. Discovery had this inverted (key :153, normalize :182),
#    which cached a full-schema response under the lightweight key — a POISONING defect, not a
#    hit-rate defect. service-health-handler.js is the correct reference (normalize :165, key :211).
grep -nE "normalizeForTool|cacheKey = |generateCacheKey\(" lib/mcp/server/tools/hub/service-health-handler.js

# 3) Authorization must not sit BELOW a cache-hit return.
#    For every handler with a cache-hit early return, checkPermission/extractAuthContext must appear
#    at a LOWER line number than the return. service-health-handler.js violated this until
#    2026-07-27: the hit returned health data without ever evaluating VIEW permission.
grep -nE "extractAuthContext|checkPermission|return \{$|cached\.data" lib/mcp/server/tools/hub/service-health-handler.js | head -20
# Expected: extractAuthContext + checkPermission lines BEFORE the first `...cached.data` return.

# 4) The discovery response cache is DELETED and must stay deleted in that form.
grep -c "NO RESPONSE CACHE HERE" lib/mcp/server/tools/hub/service-discovery-handler.js
# Expected: 1. Zero = someone reintroduced a cache; read that block before reviewing the change.

# 5) GENERALISED: any fast path that returns BEFORE authorization — caches are
#    only one instance. Counts `return` statements preceding each hub handler's
#    first authorization call. A rising count is the finding.
for f in lib/mcp/server/tools/hub/*.js; do
  auth=$(grep -nE "checkPermission|checkServiceAccess|validateServiceCall|isUserAdmin" "$f" \
         | grep -v "^[0-9]*: *[/*]" | head -1 | cut -d: -f1)
  [ -z "$auth" ] && continue
  early=$(awk -v a="$auth" 'NR<a && /^[[:space:]]*return /{c++} END{print c+0}' "$f")
  printf "  auth@%-5s early-returns-before:%-3s %s\n" "$auth" "$early" "$(basename $f)"
done
# Baseline 2026-07-27 (investigate any INCREASE):
#   hub-shared-middleware 4 · hub-utilities 1 · service-call-handler 2
#   service-discovery-handler 0 · service-health-handler 1
#   service-registration-handler 1 · workflow-tools-handler 0
#
# service-call-handler's 2 are the INTERNAL-SERVICE SHORT-CIRCUIT and are known:
# the internal branch returns before STEP 2.5b, so validateServiceCall AND
# checkServiceAccess are both skipped for internal services. Defensible (the
# router's serviceToolMap is the allowlist) and contained by an exact-id lookup —
# see the ⚠️ block on InternalServiceRouter.routeCall(). Confirm that block still
# exists; it is the only thing telling a future editor the lookup is load-bearing:
grep -c "DO NOT ADD A NAME-BASED FALLBACK" lib/mcp/server/tools/internal/InternalServiceRouter.js
# Expected: 1.
```

### 2. MCP Hub Tool Architecture
```bash
# Find hub tool implementations
grep -r "handleRegisterService\|handleDiscoverServices" lib/mcp/server/tools/ -A 10

# Check tool schemas (consolidated: registry tool with actions)
grep -A 20 "registry:" lib/mcp/server/config/tool-schemas.js

# Check service approval policy (TRUSTED_INTERNAL_SERVICES, risk patterns)
grep -A 5 "TRUSTED_INTERNAL_SERVICES\|HIGH_RISK_PATTERNS" lib/mcp/server/config/service-approval-policy.js

# Verify tool handler registration
grep -A 15 "hubToolNames.*=" mcp-server-v5.js

# Test tool parameter validation.
# 2026-07-28: the old grep here was `z\.union.*z\.string\.transform` on ONE line. It
# returned zero after the D2 refactor — not because the union went away, but because it
# is now multi-line. A single-line regex over a formatted schema is brittle by
# construction; match the PROPERTY instead of the layout.
#
# What matters is that the JSON-STRING branch cannot bypass the object schema's caps.
# Before D2 it did: `capabilities` submitted as a string skipped the 200-tool cap and
# every field constraint. It must now .pipe() into the same object schema.
grep -n "serviceCapabilitiesSchema = z.union" -A 14 lib/mcp/server/config/tool-schemas.js
# Expected: a `.pipe(serviceCapabilitiesObjectSchema)` on the string branch. Its ABSENCE
# is the finding — the union bypass is re-opened. Gate: npm run test:registry-field-parity
grep -c "pipe(serviceCapabilitiesObjectSchema)" lib/mcp/server/config/tool-schemas.js
# Expected: 1
```

### 3. Prompt System Integration
```bash
# Check built-in prompts in prompt-registry.js (currently only audit_all_tasks)
grep -A 10 "registerPrompt" lib/mcp/server/prompts/prompt-registry.js

# Check database prompt loading (AgentPromptLibrary with 'mcp' tag)
grep -A 10 "agentPromptLibrary" lib/mcp/server/prompts/prompt-registry.js

# Hub prompts are database-stored: register_guide, get_started, workflow_guide, etc.
# Use list_prompts MCP tool or check agent_prompt_library table for current inventory
```

### 4. Authentication and Security
```bash
# Check authentication middleware
grep -A 15 "req\.user.*=" mcp-server-http-clean.js

# Verify user context passing
grep -A 10 "setUserContext\|this\.userContext" mcp-server-v5.js

# Check permission system integration (search extracted modules - Dec 15 extraction)
grep -r "checkPermission.*MCP_SERVICE\|checkServiceAccess" lib/mcp/server/tools/hub/
```

### 5. Tool Security & Access Permissions (Feb 2026)
```bash
# Full reference: /.claude/knowledge/patterns/mcp-tool-lifecycle-pattern.md (Tool Access Permissions section)
echo "=== Tool Security & Permissions Verification ==="

# Layer 1: Tool-level visibility (which tools users SEE)
echo -e "\n=== PUBLIC_TOOLS (should be empty) ==="
grep -A 3 "const PUBLIC_TOOLS" lib/mcp/server/config/tool-security.js

echo -e "\n=== AUTHENTICATED_TOOLS (expect 9 entries — proven 2026-06-11; the old grep -c \"'\" was non-discriminating) ==="
sed -n '/^const AUTHENTICATED_TOOLS/,/^];/p' lib/mcp/server/config/tool-security.js | grep -c "^  '"

echo -e "\n=== ADMIN_TOOLS (expect 1: template) ==="
grep -A 5 "const ADMIN_TOOLS" lib/mcp/server/config/tool-security.js

echo -e "\n=== getToolsForUser counts comment ==="
grep -A 6 "Expected counts" lib/mcp/server/config/tool-security.js

echo -e "\n=== enforceToolSecurity ADMIN check ==="
grep -A 5 "ADMIN_TOOLS.includes" lib/mcp/server/config/tool-security.js

# Layer 2: Handler-level authorization (what actions users CAN DO)
echo -e "\n=== Handler-Level Role Checks ==="
echo "--- pov.create table gate (NOT hardcoded ADMIN since ed74e8ce 2026-05-25) ---"
grep -n "canCreate = await checkPermission" lib/mcp/tasks/action/handlers/pov/pov-create-handler.ts   # expect 1

echo "--- hub-utilities fallbackPermissionCheck ---"
grep -A 15 "fallbackPermissionCheck" lib/mcp/server/tools/hub/hub-utilities.js | head -20

echo "--- prompt-list-handler isPublic filter ---"
grep -A 5 "isAdminRole\|isPublic" lib/mcp/server/tools/hub/prompt-list-handler.js | head -10

# Supporting permission files
echo -e "\n=== JWT Token Permissions (mcp-oauth-validator) ==="
grep -A 10 "permissions:" lib/auth/oauth/mcp-oauth-validator.js | head -15

echo -e "\n=== Role Hierarchy (user.ts) ==="
grep -A 6 "roleHierarchy" lib/admin/handlers/user.ts | head -8

echo -e "\n=== Context Enricher isDemoUser ==="
grep "isDemoUser" lib/mcp/server/middleware/context-enricher.js

echo -e "\n=== Prompt Registry POV Filtering by Role ==="
grep -B 2 -A 5 "isDemoUser\|DEMO_USER" lib/mcp/server/prompts/prompt-registry.js | head -15

# Pipeline alignment verification
echo -e "\n=== Pipeline Alignment Check ==="
node scripts/verify-tool-annotations.js
```

### 6. Plan 8 Security Integration
```bash
# Check hub tool security boundaries
echo "=== Plan 8: Hub Tool Security Boundaries ==="
grep "services\|discover" lib/mcp/server/config/tool-security.js
grep "registry\|services" lib/mcp/server/config/tool-security.js

# Verify service authorization implementation (search extracted modules - Dec 15)
echo -e "\n=== Service Authorization in Hub ==="
grep -A 10 "checkServiceAccess" lib/mcp/server/tools/hub/service-call-handler.js

# Check public discovery filtering (extracted module - Dec 15)
echo -e "\n=== Public Discovery Data Filtering ==="
grep -A 5 "filterPublicServiceData\|filterPublic" lib/mcp/server/tools/hub/service-discovery-handler.js
grep "isAuthenticated" lib/mcp/server/tools/hub/*.js | head -5

# Verify rate limiting for hub operations
echo -e "\n=== Rate Limiting for Hub Tools ==="
grep -r "rate.*limit.*discover\|rate.*limit.*register" --include="*.js" --include="*.md" | head -5

# Check audit logging for service operations (search all hub handlers)
echo -e "\n=== Service Operation Audit Logging ==="
grep -r "SERVICE_CALL\|UNAUTHORIZED_SERVICE_ACCESS" lib/mcp/server/tools/hub/

# Test public vs authenticated discovery
echo -e "\n=== Test Public Discovery (no auth) ==="
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"services","arguments":{"action":"discover"}},"id":1}' | jq '.result.authenticated'

echo -e "\n=== Test Authenticated Discovery ==="
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_JWT_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"services","arguments":{"action":"discover"}},"id":2}' | jq '.result.authenticated'
```

### 6. Production Service Testing
```bash
# Test service registration functionality
node test-service-registration.js

# Check service discovery capabilities
node test-discovery.js

# Verify HTTP server accessibility
curl -s http://localhost:8080/health | jq

# Test authenticated service operations
curl -X POST http://localhost:8080/mcp -H "X-API-Key: JWT_TOKEN" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq '.result.tools[] | select(.name | test("registry|services"))'
```

### 7. Modular Architecture Discovery (Dec 2025)
```bash
# Discover extracted hub handlers
echo "=== Hub Handler Modules ==="
find lib/mcp/server/tools/hub/*.js -type f
ls lib/mcp/server/tools/hub/*.js | wc -l  # expect 15 (proven 2026-06-11; was 14 at Mar 2026 validation)

# Discover advanced handlers
echo -e "\n=== Advanced Handler Modules ==="
find lib/mcp/server/tools/advanced/*.js -type f
ls lib/mcp/server/tools/advanced/*.js | wc -l  # expect 6 .js files (was 5 until lean-card-facts.js landed 2026-07-18, 0a25b7a1) + analytics/ subdir (4 more files; team-performance-handler lives there)

# Check facade pattern implementation
echo -e "\n=== Facade Pattern Delegations ==="
grep "return this\." lib/mcp/server/tools/hub-tools-handler.js | head -15

# Handler line counts — the original "<400 lines" goal is HISTORICAL (Dec 2025).
# Handlers grew with hardening: workflow-tools-handler 1486, task-action 731,
# service-call 681 as of 2026-06-11. Use this as a size-trend probe, not a gate.
echo -e "\n=== Handler Line Counts (size trend; <400 goal retired) ==="
for f in lib/mcp/server/tools/hub/*.js; do wc -l "$f"; done
for f in lib/mcp/server/tools/advanced/*.js; do wc -l "$f"; done

# Check main facade line reduction (facades SHRANK below the Dec-2025 range — more extraction since)
echo -e "\n=== Facade Line Counts (expect 377 + 302 as of 2026-07-27) ==="
wc -l lib/mcp/server/tools/sdk-native-advanced-tools.js
wc -l lib/mcp/server/tools/hub-tools-handler.js

# Verify dependency injection pattern
echo -e "\n=== Dependency Injection ==="
grep "constructor(prisma, utilities, parent)" lib/mcp/server/tools/hub/*.js | head -5
```

### 8. Real Service Calling Discovery (Dec 2025)
```bash
# Find real MCP SDK client implementation
echo "=== Real MCP Client Implementation ==="
grep -n "require('@modelcontextprotocol/sdk/client" lib/mcp/server/tools/hub/service-call-handler.js

# Verify NO simulated flag (should return nothing)
echo -e "\n=== Check for Simulation (should be empty) ==="
grep "simulated: true" lib/mcp/server/tools/hub/service-call-handler.js

# Check transport support (WebSocket removed Jan 2026, SSE/HTTP only)
echo -e "\n=== Transport Support ==="
grep "SSEClientTransport\|StreamableHTTPClientTransport" lib/mcp/server/utils/service-connection-pool.js

# Verify connection lifecycle
echo -e "\n=== Connection Lifecycle ==="
grep -A 5 "async connect()" lib/mcp/server/tools/hub/service-call-handler.js
grep -A 5 "async callTool(" lib/mcp/server/tools/hub/service-call-handler.js
grep -A 5 "async close()" lib/mcp/server/tools/hub/service-call-handler.js

# Check real execution time tracking
echo -e "\n=== Execution Time Tracking ==="
grep "executionTime.*Date\.now()" lib/mcp/server/tools/hub/service-call-handler.js
```

### 9. Real Health Checks Discovery (Dec 2025)
```bash
# Find real HTTP ping implementation
echo "=== Real HTTP Ping ==="
grep -n "fetch(endpoint" lib/mcp/server/tools/hub/service-health-handler.js

# Check AbortController (5s timeout)
echo -e "\n=== Timeout Implementation ==="
grep "AbortController\|5000" lib/mcp/server/tools/hub/service-health-handler.js

# Verify real latency measurement
echo -e "\n=== Latency Measurement ==="
grep "Date.now() - pingStart" lib/mcp/server/tools/hub/service-health-handler.js

# Check combined health data
echo -e "\n=== Combined Health Data ==="
grep -A 10 "combineHealthData\|realtimeHealth\|storedHealth" lib/mcp/server/tools/hub/service-health-handler.js | head -15

# Verify realtime bypass parameter
echo -e "\n=== Realtime Bypass ==="
grep "realtime.*bypass\|skipCache" lib/mcp/server/tools/hub/service-health-handler.js
```

### 10. Hub Resources Discovery (Dec 2025)
```bash
# Find hub resource provider
echo "=== Hub Resource Provider ==="
ls -lh lib/mcp/server/resources/hub-resources.js

# Check resource URIs
echo -e "\n=== Resource URI Patterns ==="
grep "mcp://hub/" lib/mcp/server/resources/hub-resources.js

# Count resources
echo -e "\n=== Resource Count (expect 15 — proven 2026-06-11; was 8 at Dec 2025) ==="
grep "uri:.*mcp://hub/" lib/mcp/server/resources/hub-resources.js | wc -l

# Verify integration into MCP server
echo -e "\n=== MCP Server Integration ==="
grep "HubResourceProvider" mcp-server-v5.js
grep "require.*hub-resources" mcp-server-v5.js

# List all resource types
echo -e "\n=== All Hub Resources ==="
grep "uri:.*mcp://hub/" lib/mcp/server/resources/hub-resources.js | sed 's/.*uri: "//' | sed 's/".*//'
```

### 11. Performance Optimization Discovery (Dec 2025)
```bash
# Check database indices
echo "=== Database Indices ==="
psql $DATABASE_URL -c "\d+ mcp_tools" | grep "mcp_discovery_performance\|mcp_capability_search"

# Alternative: Check migration files
echo -e "\n=== Index Creation Migrations ==="
find prisma/migrations -name "*.sql" -exec grep -l "CREATE INDEX.*mcp_" {} \;

# Find caching implementation
echo -e "\n=== Discovery Caching ==="
grep "this.cache = new Map()\|this.discoveryCache" lib/mcp/server/tools/hub/service-discovery-handler.js

# Check health caching
echo -e "\n=== Health Caching ==="
grep "this.healthCache = new Map()" lib/mcp/server/tools/hub/service-health-handler.js

# Verify parallel queries
echo -e "\n=== Parallel Queries ==="
grep -A 5 "Promise.all.*count.*findMany\|Promise.all.*\[.*total.*services" lib/mcp/server/tools/hub/service-discovery-handler.js

# Check cache TTL configuration
echo -e "\n=== Cache TTL Configuration ==="
grep "TTL.*60\|CACHE_TTL\|60.*1000" lib/mcp/server/tools/hub/service-discovery-handler.js
grep "TTL.*30\|CACHE_TTL\|30.*1000" lib/mcp/server/tools/hub/service-health-handler.js

# Verify cache invalidation
echo -e "\n=== Cache Invalidation ==="
grep "cache.delete\|cache.clear\|invalidate" lib/mcp/server/tools/hub/*.js | head -10
```

### 12. Test Coverage Discovery (Dec 2025)
```bash
# Find MCP test suites
echo "=== MCP Test Suites ==="
ls scripts/test-mcp-*.ts
ls scripts/test-mcp-*.ts | wc -l  # expect 18 (proven 2026-07-14; +transport-parity since 2026-06-11's 17; was 6 at Dec 2025)

# Count total tests
echo -e "\n=== Total Test Count ==="
grep -h "Total Tests:" scripts/test-mcp-*.ts

# Check dual-layer format
echo -e "\n=== Dual-Layer Test Format ==="
grep "Layer 1.*Pattern\|Layer 2.*Behavior" scripts/test-mcp-*.ts | head -10

# List test suites
echo -e "\n=== Test Suite Coverage ==="
ls scripts/test-mcp-*.ts | sed 's/scripts\/test-mcp-//' | sed 's/.ts//'

# Check test framework compliance
echo -e "\n=== Validation Architecture Compliance ==="
grep "validation-testing-architecture" scripts/test-mcp-*.ts | wc -l

# Verify test results tracking
echo -e "\n=== Test Results ==="
grep "PASSED\|FAILED\|Total:" scripts/test-mcp-*.ts | head -20
```

### 13. Error Helper Pattern Discovery (Dec 2025)
```bash
# Find error helper modules
echo "=== Error Helper Modules ==="
ls -la lib/mcp/server/tools/basic/error-helpers.js
ls -la lib/mcp/server/tools/advanced/error-helpers.js
ls -la lib/mcp/server/tools/hub/error-helpers.js
# (browser/error-helpers.js DELETED with lib/mcp/server/tools/browser/ when browser
#  automation moved to a standalone Docker service — commit 17185e45)

# Check error helper functions defined
echo -e "\n=== Error Helper Functions ==="
grep -n "^function\|^const.*Error\|module\.exports" lib/mcp/server/tools/basic/error-helpers.js | head -10
grep -n "^function\|^const.*Error\|module\.exports" lib/mcp/server/tools/advanced/error-helpers.js | head -10
grep -n "^function\|module\.exports" lib/mcp/server/tools/hub/error-helpers.js | head -15

# Check error helper integration in hub handlers
echo -e "\n=== Hub Handler Error Integration ==="
grep -rn "require.*error-helpers" lib/mcp/server/tools/hub/ --include="*.js"

# Bug Class 30: Error Delivery Channel Mismatch (Mar 2026)
# Hub handlers that throw instead of returning {content, isError: true}
# become JSON-RPC errors that Claude mobile hides as "Error occurred during tool execution"
echo -e "\n=== Bug Class 30: Throw vs Return Audit ==="
echo "Hub handler throws (potential BC30 — should these return MCP content?):"
grep -rn "throw new Error\|throw enhancedOperationError\|throw notFoundError\|throw validationError\|throw missingServiceIdentifierError\|throw permissionDeniedError\|throw serviceNotFoundByIdError" lib/mcp/server/tools/hub/ --include="*.js" | grep -v error-helpers.js | grep -v "// " | grep -v "@throws"
echo ""
echo "Hub handler MCP content returns (BC30 safe):"
grep -rn "isError: true" lib/mcp/server/tools/hub/ --include="*.js" | grep -v error-helpers.js

# Verify fuzzy search helper usage
echo -e "\n=== Fuzzy Search Helper ==="
ls -la lib/mcp/server/utils/fuzzy-search-helper.js
grep -rn "fuzzy-search-helper" lib/mcp/server/tools/ --include="*.js" | wc -l

# Check tool schema documentation coverage
echo -e "\n=== Tool Schema Documentation ==="
echo "Total tools: $(grep -c '"name":' lib/mcp/server/config/tool-schemas.js)"
echo "WHEN TO USE: $(grep -c 'WHEN TO USE:' lib/mcp/server/config/tool-schemas.js)"
echo "SEE ALSO: $(grep -c 'SEE ALSO:' lib/mcp/server/config/tool-schemas.js)"
echo "EXAMPLES: $(grep -c 'EXAMPLES:' lib/mcp/server/config/tool-schemas.js)"
```

### 14. Workflow System Discovery (Jan 2026)
```bash
# Find workflow-related models in Prisma schema
echo "=== MCPWorkflow Models ==="
grep -A 30 "model MCPWorkflow " prisma/schema.prisma
grep -A 40 "model MCPWorkflowExecution " prisma/schema.prisma

# Check workflow enums
echo -e "\n=== Workflow Enums ==="
grep -A 5 "enum MCPWorkflowStatus" prisma/schema.prisma
grep -A 6 "enum MCPWorkflowExecutionStatus" prisma/schema.prisma
grep -A 3 "enum MCPExecutionMode" prisma/schema.prisma

# Find WorkflowEngine implementation
echo -e "\n=== WorkflowEngine ==="
ls -la lib/services/workflow/workflowEngine.ts
grep -n "class WorkflowEngine\|registerHandler\|execute(" lib/services/workflow/workflowEngine.ts | head -15

# Check orchestration parameters schema
echo -e "\n=== Orchestration Parameters ==="
ls -la lib/services/workflow/types/orchestration-params.ts
grep -A 10 "MCPOrchestrationParamsSchema" lib/services/workflow/types/orchestration-params.ts

# Verify execution modes
echo -e "\n=== Execution Modes ==="
grep "executionMode.*sequential\|parallel\|conditional" lib/services/workflow/types/orchestration-params.ts

# Check failure strategies
echo -e "\n=== Failure Strategies ==="
grep "failureStrategy.*stop\|continue\|rollback" lib/services/workflow/types/orchestration-params.ts

# Find workflow activity logging integration
echo -e "\n=== Activity Logging Integration ==="
grep -n "logWorkflowExecution" lib/services/workflow/workflowEngine.ts
grep -A 10 "logWorkflowExecution" lib/tasks/services/taskActivityService.ts | head -15

# Check workflow execution tracking
echo -e "\n=== Workflow Execution Tracking ==="
grep -rn "mCPWorkflowExecution" lib/mcp/server/tools/hub-tools-handler.js | head -5
```

### 15. Performance Monitoring Discovery (Jan 2026)
```bash
# Find getHubPerformanceStats implementation
echo "=== Performance Stats Implementation ==="
grep -A 50 "async getHubPerformanceStats" lib/mcp/server/tools/hub-tools-handler.js | head -60

# Check workflow metrics calculation
echo -e "\n=== Workflow Metrics ==="
grep -A 30 "async getWorkflowMetrics" lib/mcp/server/tools/hub-tools-handler.js | head -35

# Verify overallPerformance calculation
echo -e "\n=== Overall Performance Calculation ==="
grep -A 20 "calculateOverallPerformance" lib/mcp/server/tools/hub-tools-handler.js | head -25

# Check recommendations generation
echo -e "\n=== Recommendations Generation ==="
grep -A 50 "generateRecommendations" lib/mcp/server/tools/hub-tools-handler.js | head -55

# Verify recommendation thresholds
echo -e "\n=== Recommendation Thresholds ==="
grep "hitRate.*<\|successRate.*<\|reuseRate.*<" lib/mcp/server/tools/hub-tools-handler.js

# Check cache stats methods
echo -e "\n=== Cache Stats Methods ==="
grep -n "getCacheStats\|getHealthCacheStats" lib/mcp/server/tools/hub/*.js
```

### 16. Activity Integration Discovery (Jan 2026)
```bash
# Find WORKFLOW_EXECUTED action type
echo "=== WORKFLOW_EXECUTED Action Type ==="
grep -n "WORKFLOW_EXECUTED" lib/types/activity.ts
grep -n "WORKFLOW_EXECUTED" lib/validation/activity-validation.ts
grep -n "WORKFLOW_EXECUTED" lib/constants/bloomberg-styles.ts

# Check workflow activity details schema
echo -e "\n=== Workflow Activity Details ==="
grep -A 10 "workflowId\|workflowType\|workflowStatus" lib/types/activity.ts

# Verify logWorkflowExecution helper
echo -e "\n=== logWorkflowExecution Helper ==="
grep -A 20 "export function logWorkflowExecution" lib/tasks/services/taskActivityService.ts

# Check workflowEngine integration
echo -e "\n=== WorkflowEngine Activity Integration ==="
grep -B 2 -A 10 "logWorkflowExecution" lib/services/workflow/workflowEngine.ts

# Verify activity export in index.ts
echo -e "\n=== Activity Service Exports ==="
grep "logWorkflowExecution" lib/tasks/services/index.ts

# Check all 18 activity types have symbols
echo -e "\n=== Activity Symbol Parity (should be 18) ==="
grep -c "symbol:" lib/constants/bloomberg-styles.ts
grep "WORKFLOW_EXECUTED\|REOPENED" lib/constants/bloomberg-styles.ts
```

### 17. Compliance Policy Discovery (Jan 2026)
```bash
# Find compliance policy configuration
echo "=== Compliance Policy Configuration ==="
ls -la lib/mcp/server/config/service-call-policy.js
head -50 lib/mcp/server/config/service-call-policy.js

# Check static APPROVED_TOOLS whitelist
echo -e "\n=== Static APPROVED_TOOLS Whitelist ==="
grep -A 50 "const APPROVED_TOOLS" lib/mcp/server/config/service-call-policy.js | head -55

# Check BLOCKED_PATTERNS (security)
echo -e "\n=== Blocked Security Patterns ==="
grep -A 25 "const BLOCKED_PATTERNS" lib/mcp/server/config/service-call-policy.js | head -30

# Check isTrustedInternalService helper (BC70: checks both name and id for SSRF bypass)
echo -e "\n=== Trusted Internal Services ==="
grep -A 10 "TRUSTED_INTERNAL_SERVICES" lib/mcp/server/config/service-approval-policy.js
echo -e "\n=== isTrustedInternalService Helper ==="
grep -A 8 "function isTrustedInternalService" lib/mcp/server/config/service-approval-policy.js

# Check BLOCKED_URLS (SSRF protection)
echo -e "\n=== SSRF Protection (Blocked URLs) ==="
grep -A 20 "const BLOCKED_URLS" lib/mcp/server/config/service-call-policy.js | head -25

# Check size limits
echo -e "\n=== Size Limits ==="
grep -A 5 "const LIMITS" lib/mcp/server/config/service-call-policy.js

# Verify validateServiceCall function signature (dynamic whitelist support)
echo -e "\n=== validateServiceCall Function ==="
grep -A 15 "function validateServiceCall" lib/mcp/server/config/service-call-policy.js

# Check dynamic whitelist implementation in handler
echo -e "\n=== Dynamic Whitelist in Service Call Handler ==="
grep -B 5 -A 20 "registeredTools" lib/mcp/server/tools/hub/service-call-handler.js
```

### 17B. JWT/JWKS & Trust Level System (Phase 2 - Jan 2026)
```bash
# JWKS endpoint implementation
echo "=== JWKS Endpoint (RS256 Public Key) ==="
cat app/api/auth/jwks/route.ts

# RS256 token signing
echo -e "\n=== RS256 Token Signing ==="
grep -A 30 "async function signAccessToken" lib/auth/token-manager.ts
grep -A 30 "async function getPrivateKey" lib/auth/token-manager.ts

# Trust level system
echo -e "\n=== Trust Level System ==="
cat lib/services/workflow/security/trust-level.js | head -100

# Token receiving trust levels
echo -e "\n=== Token Gating Configuration ==="
grep -A 8 "TOKEN_RECEIVING_TRUST_LEVELS" lib/services/workflow/security/trust-level.js

# TEAM_MEMBER trust determination
echo -e "\n=== TEAM_MEMBER Trust Logic ==="
grep -B 5 -A 15 "TEAM_MEMBER" lib/services/workflow/security/trust-level.js

# Trust denial audit logging
echo -e "\n=== Audit Logging Integration ==="
grep -B 5 -A 20 "logTrustDenial" lib/services/workflow/integrations/service-caller.ts
grep -B 5 -A 20 "logTrustDenial" lib/mcp/server/tools/hub/workflow-tools-handler.js

# Rate limiting for JWKS
echo -e "\n=== JWKS Rate Limiting ==="
grep -A 5 "jwksLimiter" lib/middleware/rate-limit.ts app/api/auth/jwks/route.ts

# Security monitoring scripts
echo -e "\n=== Security Monitoring Scripts ==="
ls -la scripts/monitor-jwks-health.sh scripts/monitor-trust-denials.sh
head -50 scripts/monitor-jwks-health.sh
head -50 scripts/monitor-trust-denials.sh

# Verify production deployment
echo -e "\n=== Production Security Monitoring ==="
ssh root@production "crontab -l | grep monitor"
ssh root@production "ls -la /var/log/jwks-monitor.log /var/log/trust-denials.log"
```

### 18. Docker Internal Services Discovery (Jan 2026)
```bash
# Find internal service directories
echo "=== Internal Service Directories ==="
ls -la services/
ls -la services/browser-automation-service/ 2>/dev/null || echo "browser-automation-service not found"
ls -la services/notification-service/ 2>/dev/null || echo "notification-service not found"

# Check browser automation service entry point
echo -e "\n=== Browser Automation Service Entry Point ==="
head -100 services/browser-automation-service/src/index.ts 2>/dev/null || echo "Service not built"

# Check seed scripts for internal services
echo -e "\n=== Seed Scripts ==="
ls -la scripts/seed-*-service.ts

# Check browser automation service registration
echo -e "\n=== Browser Service Registration ==="
grep -A 30 "mCPTool.upsert" scripts/seed-browser-automation-service.ts | head -35

# Check service capabilities (tools registered)
echo -e "\n=== Browser Service Tools ==="
grep -A 10 "tools:" scripts/seed-browser-automation-service.ts | head -15

# Check notification service (if exists)
echo -e "\n=== Notification Service Registration ==="
grep -A 30 "mCPTool.upsert" scripts/seed-notification-service.ts 2>/dev/null | head -35 || echo "Notification service seed not found"

# Verify services in database
echo -e "\n=== Registered Internal Services ==="
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT id, name, status, configuration->>'endpoint' as endpoint FROM mcp_tools WHERE id IN ('browser-automation-service', 'notification-service');"

# Check service connection pool
echo -e "\n=== Service Connection Pool ==="
ls -la lib/mcp/server/utils/service-connection-pool.js
grep -A 20 "class ServiceConnectionPool" lib/mcp/server/utils/service-connection-pool.js | head -25
```

### 19. Service Call Flow Discovery (Jan 2026)
```bash
# Trace complete service call flow
echo "=== Service Call Handler Flow ==="

# Step 1: Authentication check
echo -e "\n--- Step 1: Authentication ---"
grep -A 10 "STEP 1: Enforce authentication" lib/mcp/server/tools/hub/service-call-handler.js

# Step 2: Validation framework
echo -e "\n--- Step 2: Zod Validation ---"
grep -A 10 "STEP 2: Apply unified validation" lib/mcp/server/tools/hub/service-call-handler.js

# Step 2.5: Compliance policy (new)
echo -e "\n--- Step 2.5: Compliance Policy ---"
grep -A 15 "STEP 2.5: NEW - Apply Anthropic compliance" lib/mcp/server/tools/hub/service-call-handler.js

# Step 3: Service lookup
echo -e "\n--- Step 3: Service Lookup ---"
grep -A 10 "STEP 3: Find target service" lib/mcp/server/tools/hub/service-call-handler.js

# Step 4: Service access authorization
echo -e "\n--- Step 4: Authorization ---"
grep -A 10 "STEP 4: NEW - Check service access" lib/mcp/server/tools/hub/service-call-handler.js

# Step 5: Audit logging
echo -e "\n--- Step 5: Audit Logging ---"
grep -A 10 "STEP 5: NEW - Audit log" lib/mcp/server/tools/hub/service-call-handler.js

# Connection pool usage
echo -e "\n--- Connection Pool Usage ---"
grep -A 10 "getOrCreateClient\|connectionPool" lib/mcp/server/tools/hub/service-call-handler.js | head -15

# Check violation message extraction fix
echo -e "\n--- Violation Message Fix ---"
grep "violationMessages\|map(v => v.message" lib/mcp/server/tools/hub/service-call-handler.js
```

### 20. Hub Tools Enhancement Discovery (Jan 2026)
```bash
# Find registry(action: 'tools') implementation (handler: service-tools-handler.js)
echo "=== registry(action: 'tools') Tool Discovery ==="

# Check service-tools-handler.js exists and line count
echo -e "\n--- Handler Implementation ---"
ls -la lib/mcp/server/tools/hub/service-tools-handler.js
wc -l lib/mcp/server/tools/hub/service-tools-handler.js

# Check handler class structure
echo -e "\n--- Handler Class ---"
grep -n "class ServiceToolsHandler\|async handle(" lib/mcp/server/tools/hub/service-tools-handler.js

# Find tool extraction from capabilities
echo -e "\n--- Tool Extraction ---"
grep -A 10 "extractTools\|extractTools(" lib/mcp/server/tools/hub/service-tools-handler.js

# Check state-aware nextSteps (GS4 compliance)
echo -e "\n--- State-Aware nextSteps ---"
grep -A 15 "buildNextSteps\|nextSteps:" lib/mcp/server/tools/hub/service-tools-handler.js | head -25

# Check schemaVersion detection
echo -e "\n--- schemaVersion Detection ---"
grep "schemaVersion\|hasFullSchemas" lib/mcp/server/tools/hub/service-tools-handler.js

# Check error helper usage (GS8 compliance)
echo -e "\n--- Error Helpers ---"
grep "require.*error-helpers\|enhancedOperationError\|notFoundError" lib/mcp/server/tools/hub/service-tools-handler.js

# Check tool schema registration
echo -e "\n--- Tool Schema ---"
grep -A 30 "registry:" lib/mcp/server/config/tool-schemas.js | head -35

# Check security configuration (consolidated name)
echo -e "\n--- Security Config ---"
grep "registry" lib/mcp/server/config/tool-security.js

# Check tool annotations (consolidated name)
echo -e "\n--- Tool Annotations ---"
grep -A 10 "registry" lib/mcp/server/config/tool-annotations.js

# Check handler wiring in hub-tools-handler.js
echo -e "\n--- Handler Wiring ---"
grep -n "ServiceToolsHandler\|handleGetServiceTools" lib/mcp/server/tools/hub-tools-handler.js

# Check registration in mcp-server-v5.js (consolidated name)
echo -e "\n--- MCP Server Registration ---"
grep "registry" mcp-server-v5.js

# Test enhanced registry(action: 'register') schema
echo -e "\n=== Enhanced registry(action: 'register') Discovery ==="

# Check capabilities schema accepts both formats
echo -e "\n--- Capabilities Schema ---"
grep -A 30 "capabilities:" lib/mcp/server/config/tool-schemas.js | grep -A 20 "registry" | head -30

# Check tools array accepts objects with inputSchema
echo -e "\n--- Tools Array Schema ---"
grep -B 5 -A 15 "inputSchema" lib/mcp/server/config/tool-schemas.js | grep -A 15 "tools:" | head -20

# Run Gold Standard compliance test (MUST use tsx — bare node exits 1 loudly since 2026-06-11)
echo -e "\n=== Gold Standard Compliance Test ==="
npx tsx scripts/test-gold-standard-compliance.js --hub

# Check Gold Standard test script exists
echo -e "\n--- Test Script Location ---"
ls -la scripts/test-gold-standard-compliance.js
```

### 21. Internal Service Infrastructure Discovery (Jan 2026)
```bash
# Discover Internal Service Router
echo "=== Internal Service Infrastructure Discovery ==="

# Check InternalServiceRouter.js exists
echo -e "\n--- Internal Service Router ---"
ls -la lib/mcp/server/tools/internal/InternalServiceRouter.js
wc -l lib/mcp/server/tools/internal/InternalServiceRouter.js

# Check service tool mappings
echo -e "\n--- Service Tool Mappings ---"
grep -A 30 "serviceToolMap = {" lib/mcp/server/tools/internal/InternalServiceRouter.js | head -35

# Check context normalization
echo -e "\n--- Context Normalization ---"
grep -A 15 "normalizeContext" lib/mcp/server/tools/internal/InternalServiceRouter.js

# Check isInternalService detection
echo -e "\n--- Internal Service Detection ---"
grep -A 10 "isInternalService" lib/mcp/server/tools/internal/InternalServiceRouter.js

# Check POV service handlers
echo -e "\n--- POV Service Handlers ---"
grep -n "handleListPOVs\|handleGetPOVDetails\|handleGetPOVPhases" lib/mcp/server/tools/internal/InternalServiceRouter.js

# Check Task service handlers
echo -e "\n--- Task Service Handlers ---"
grep -n "handleListTasks\|handleGetTaskDetails" lib/mcp/server/tools/internal/InternalServiceRouter.js

# Check service-call-handler integration
echo -e "\n--- Service Call Handler Integration ---"
grep -n "InternalServiceRouter\|internalRouter" lib/mcp/server/tools/hub/service-call-handler.js

# Check service-health-handler internal bypass
echo -e "\n--- Health Handler Internal Bypass ---"
grep -A 10 "internal.*service\|type.*internal" lib/mcp/server/tools/hub/service-health-handler.js

# Check registration script
echo -e "\n--- Registration Script ---"
ls -la scripts/register-internal-services.ts
grep -A 20 "INTERNAL_SERVICES" scripts/register-internal-services.ts | head -25

# Check npm script
echo -e "\n--- npm Script ---"
grep "mcp:register-internal" package.json

# Verify registered internal services in database
echo -e "\n--- Database Verification ---"
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT id, name, status, configuration->>'type' as type, configuration->>'endpoint' as endpoint FROM mcp_tools WHERE id LIKE 'paichart-%';"
```

### 22. Shared Orchestration Engine Discovery (Jan 2026)
```bash
# Discover Shared Orchestration Engine
echo "=== Shared Orchestration Engine Discovery ==="

# Check orchestration-engine.js exists
echo -e "\n--- Orchestration Engine File ---"
ls -la lib/services/workflow/core/orchestration-engine.js
wc -l lib/services/workflow/core/orchestration-engine.js

# Check OrchestrationEngine class
echo -e "\n--- OrchestrationEngine Class ---"
grep -n "class OrchestrationEngine\|constructor(" lib/services/workflow/core/orchestration-engine.js | head -10

# Check validate method
echo -e "\n--- Validate Method ---"
grep -A 20 "validate(params)" lib/services/workflow/core/orchestration-engine.js | head -25

# Check execute method
echo -e "\n--- Execute Method ---"
grep -A 20 "async execute(params" lib/services/workflow/core/orchestration-engine.js | head -25

# Check variable chaining (resolveVariables)
echo -e "\n--- Variable Chaining ---"
grep -A 30 "resolveVariables" lib/services/workflow/core/orchestration-engine.js | head -35

# Check circular dependency detection
echo -e "\n--- Circular Dependency Detection ---"
grep -A 20 "detectCircularDependencies\|detectCycles" lib/services/workflow/core/orchestration-engine.js | head -25

# Check dependency analysis
echo -e "\n--- Dependency Analysis ---"
grep -A 20 "analyzeDependencies" lib/services/workflow/core/orchestration-engine.js | head -25

# Verify JS handler imports engine
echo -e "\n--- JS Handler Import ---"
grep -n "orchestration-engine\|OrchestrationEngine" lib/mcp/server/tools/hub/workflow-tools-handler.js | head -5

# Verify TS handler imports engine
echo -e "\n--- TS Handler Import ---"
grep -n "orchestration-engine\|OrchestrationEngine" lib/services/workflow/handlers/mcpOrchestrationHandler.ts | head -5

# Check Zod validation in JS handler
echo -e "\n--- JS Handler Zod Validation ---"
grep -A 15 "initializeZodSchema\|safeParse" lib/mcp/server/tools/hub/workflow-tools-handler.js | head -20

# Check two-step validation pattern
echo -e "\n--- Two-Step Validation ---"
grep -n "zodResult\|engine.validate\|Engine.*validate" lib/mcp/server/tools/hub/workflow-tools-handler.js | head -10

# Check workflow-tools-handler line count
echo -e "\n--- Workflow Tools Handler ---"
ls -la lib/mcp/server/tools/hub/workflow-tools-handler.js
wc -l lib/mcp/server/tools/hub/workflow-tools-handler.js
```

### 23. Transport Architecture Discovery (Jan 2026 - WebSocket Removed)
```bash
# Verify WebSocket Removal
echo "=== Transport Architecture Discovery (WebSocket Removed) ==="

# Check service-call-handler for WebSocket removal
echo -e "\n--- Service Call Handler Transport ---"
grep -n "WebSocket\|ws://" lib/mcp/server/tools/hub/service-call-handler.js | head -10
grep -n "SSEClientTransport\|http://" lib/mcp/server/tools/hub/service-call-handler.js | head -10

# Check service-connection-pool for WebSocket removal
echo -e "\n--- Connection Pool Transport ---"
grep -n "WebSocket\|ws://" lib/mcp/server/utils/service-connection-pool.js | head -10
grep -n "SSEClientTransport\|Unsupported.*protocol" lib/mcp/server/utils/service-connection-pool.js | head -10

# Check ws package in dependencies
echo -e "\n--- ws Package in Dependencies ---"
grep '"ws"' package.json
grep '@types/ws' package.json

# Check PostgreSQL NOTIFY/LISTEN (replaces WebSocket for real-time)
echo -e "\n--- PostgreSQL NOTIFY/LISTEN ---"
grep -r "NOTIFY\|LISTEN\|pg_notify" lib/events/ --include="*.ts" --include="*.js" | head -10

# Check base-event-emitter for PostgreSQL pattern
echo -e "\n--- Base Event Emitter ---"
grep -n "NOTIFY\|LISTEN" lib/events/base-event-emitter.ts | head -10

# Verify CLAUDE.md updated (no WebSocket server)
echo -e "\n--- CLAUDE.md WebSocket References ---"
grep -n "WebSocket\|ws-server" CLAUDE.md | head -5

# Check real-time events pattern
echo -e "\n--- Real-time Events Pattern ---"
grep -A 10 "PostgreSQL NOTIFY\|pg_notify" lib/notifications/send-notification.ts 2>/dev/null || echo "Using React Query polling"
```

### 26. Workflow System Limits Discovery (Jan 2026)
```bash
# Discover workflow execution limits
echo "=== Workflow System Limits Discovery ==="

# Find per-user execution limits
echo -e "\n--- Execution Limits ---"
grep -n "MAX_CONCURRENT_EXECUTIONS_PER_USER" lib/mcp/server/tools/hub/workflow-tools-handler.js

# Check enforcement in services(action: "workflow.execute")
echo -e "\n--- Limit Enforcement ---"
grep -A 20 "runningCount.*MAX_CONCURRENT" lib/mcp/server/tools/hub/workflow-tools-handler.js | head -25

# Find step count limits in Zod schemas
echo -e "\n--- Step Count Limits ---"
grep "\.max(20)\|min(1)\.max(20)" lib/services/workflow/types/orchestration-params.ts lib/workflows/schemas.ts

# Find parallel execution limits
echo -e "\n--- Parallel Limits ---"
grep -n "maxConcurrent" lib/services/workflow/core/orchestration-engine.js lib/mcp/server/tools/hub/workflow-tools-handler.js

# Check timeout constraints
echo -e "\n--- Timeout Constraints ---"
grep "timeout.*min\|timeout.*max\|600000\|60000" lib/services/workflow/types/orchestration-params.ts

# Check argument size limits
echo -e "\n--- Argument Size Limits ---"
grep "50000\|50KB" lib/services/workflow/types/orchestration-params.ts

# Check comprehensive limits documentation
echo -e "\n--- System Limits Reference ---"
grep -A 50 "System Limits Reference" .claude/knowledge/domain/mcp/mcp-hub-workflow-orchestration-reference.md | head -60
```

### 24. Named Workflow System & GUI Discovery (Jan 2026)
```bash
# Discover Named Workflow REST API
echo "=== Named Workflow REST API ==="
ls -la app/api/workflows/
grep -n "createHandler\|allowedRoles" app/api/workflows/route.ts | head -10

# Check workflowName parameter in services(action: "workflow.execute")
echo -e "\n--- workflowName Parameter ---"
grep -A 10 "workflowName" lib/mcp/server/config/tool-schemas.js | head -15

# Check MCPWorkflow schema for named workflows
echo -e "\n--- MCPWorkflow Schema ---"
grep -A 15 "model MCPWorkflow " prisma/schema.prisma | head -20

# Discover Workflow GUI components
echo -e "\n=== Workflow GUI Components ==="
ls -la app/\(authenticated\)/workflows/
ls -la components/workflows/

# Check WorkflowTerminal CRUD operations
echo -e "\n--- WorkflowTerminal ---"
grep -n "handleRunWorkflow\|handleDeleteWorkflow\|handleCloneWorkflow\|fetchWorkflows" components/workflows/WorkflowTerminal.tsx | head -10

# Check RecommendationEngine service discovery
echo -e "\n--- RecommendationEngine ---"
grep -n "generateRecommendations\|fetch.*services" components/workflows/RecommendationEngine.tsx | head -10

# Check admin-only services endpoint
echo -e "\n--- Admin Services Endpoint ---"
grep -A 20 "export async function GET" app/api/mcp/services/route.ts | head -25

# Check sidenav entry
echo -e "\n--- Sidenav Workflows Entry ---"
grep -B 2 -A 5 "Workflows" components/layout/SideNav.tsx

# Verify named workflow execution
echo -e "\n--- Named Workflow Execution ---"
grep -n "workflowName\|executeByName" lib/services/workflow/ -r --include="*.ts" | head -10
```

### 25. Recommendation Engine Discovery (Jan 2026)
```bash
# Discover Recommendation Engine implementation
echo "=== Recommendation Engine Discovery ==="

# Check main component
echo -e "\n--- RecommendationEngine Component ---"
ls -la components/workflows/RecommendationEngine.tsx
wc -l components/workflows/RecommendationEngine.tsx

# Check helper functions (category + tool matching)
echo -e "\n--- Service Matching Helpers ---"
grep -n "const hasCategory\|const hasTool" components/workflows/RecommendationEngine.tsx

# Check recommendation generation logic
echo -e "\n--- generateRecommendations Function ---"
grep -A 5 "const generateRecommendations" components/workflows/RecommendationEngine.tsx

# Check category-based service discovery
echo -e "\n--- Category-Based Discovery ---"
grep -n "hasCategory(s,\|notificationServices\|monitoringServices\|automationServices" components/workflows/RecommendationEngine.tsx

# Check recommendation types
echo -e "\n--- Recommendation Types ---"
grep "type.*service-combo\|type.*template\|type.*tool-chain" components/workflows/RecommendationEngine.tsx | head -10

# Check service capabilities schema
echo -e "\n--- Service Categories in Seed Scripts ---"
grep "categories:" scripts/seed-*-service.ts

# Check enhancement plan
echo -e "\n--- Enhancement Plan (TODO) ---"
ls -la .claude/knowledge/domain/mcp/TODO-recommendation-engine-9-10.md
head -30 .claude/knowledge/domain/mcp/TODO-recommendation-engine-9-10.md

# Verify no hardcoded service names (should NOT find 'sentry')
echo -e "\n--- Hardcoded Service Check (should be empty) ---"
grep -n "name.includes('sentry')" components/workflows/RecommendationEngine.tsx
```

### 21. registry(action: 'update') Enhancements Discovery (Jan 2026)
```bash
# Check registry(action: 'update') enhancement plan location
echo "=== registry(action: 'update') Enhancement Plan ==="
ls -la cline_docs/reviews/mcp-hub-update-service-enhancements-2026-01-08/

# Check service-update-handler for new fields (healthCheckPath, permissions)
echo -e "\n=== service-update-handler New Fields ==="
grep -n "healthCheckPath\|publicAccess\|maxExecutionTime\|rateLimit" lib/mcp/server/tools/hub/service-update-handler.js

# Check hub-utilities for checkRateLimit helper
echo -e "\n=== Rate Limit Utility ==="
grep -A 20 "function checkRateLimit\|checkRateLimit = " lib/mcp/server/tools/hub/hub-utilities.js

# Check service-call-handler for rate limit enforcement
echo -e "\n=== Rate Limit Enforcement in services(action: 'call') ==="
grep -B 5 -A 15 "rateLimit\|checkRateLimit" lib/mcp/server/tools/hub/service-call-handler.js

# Check service-health-handler for healthCheckPath usage
echo -e "\n=== healthCheckPath in Health Handler ==="
grep -B 5 -A 10 "healthCheckPath" lib/mcp/server/tools/hub/service-health-handler.js

# Check discovery handler for publicAccess exposure
echo -e "\n=== publicAccess in Discovery ==="
grep -B 5 -A 10 "publicAccess" lib/mcp/server/tools/hub/service-discovery-handler.js

# Check Zod schemas for new fields
echo -e "\n=== Zod Schemas for New Fields ==="
grep -A 60 "registry:" lib/mcp/server/config/tool-schemas.js | grep -E "healthCheckPath|publicAccess|maxExecutionTime|rateLimit"

# Check orchestration service-caller for rate limit integration (P2.5)
echo -e "\n=== Orchestration Rate Limit Integration ==="
grep -n "checkRateLimit\|rateLimit" lib/services/workflow/integrations/service-caller.ts 2>/dev/null || echo "Not yet implemented (P2.5 task)"

# Verify audit logging for permissions changes
echo -e "\n=== Audit Logging for Permissions ==="
grep -n "audit\|trackActivity" lib/mcp/server/tools/hub/service-update-handler.js

# Check hub-audit-service.js (P0 prerequisite)
echo -e "\n=== Hub Audit Service ==="
ls -la lib/mcp/server/tools/hub/hub-audit-service.js 2>/dev/null || echo "Not yet implemented (P0 task)"

# Check cache bounds configuration (P0 prerequisite)
echo -e "\n=== Rate Limit Cache Configuration ==="
grep "maxEntries\|MAX_CACHE_SIZE\|Map()" lib/mcp/server/tools/hub/hub-utilities.js | head -5
```

## Expected Outputs — moved to library (Phase 2 trim, 2026-06-11)

The 21 status-snapshot blocks (Dec 2025 – Feb 2026 point-in-time records: service registry,
hub tools, prompts, modular architecture, transports, workflows, etc.) live in
`.claude/knowledge/domain/mcp/mcp-hub-library.md`. They were ALREADY bannered as dated
snapshots in the 2026-06-11 health-run; known-superseded figures: active services 4/9 → **12**
(prod, **15** at 2026-07-14), prompts 18 → **16**, resources 8 → **15**, test suites 6 → **18**, facades → 302/383.
Where a number matters, the greps above (with proven expect-counts) win — never the snapshots.
NOTE for the size scan: snapshot text inside plain fences evades the prose metric — eviction
was by MERIT (stale-claim surface), not by the number.

## ChatGPT OpenAI Connector (2025-09-25 COMPLETE)

### Implementation Status
```
Search Tool: ✅ Full-text search with PostgreSQL GIN indices
Fetch Tool: ✅ Detailed resource retrieval with proper metadata
Response Format: ✅ Direct JSON arrays/objects (OpenAI compliant)
URL Generation: ✅ Correct Next.js routes with context awareness
Database Indices: ✅ 15+ performance indices deployed to production
Production Status: ✅ Live at https://paichart.app/mcp
```

### Performance Optimizations
```
Text Search Indices: ✅ GIN indices on POV, Phase, Stage, Task, AgentExecution, AgentTemplate
Foreign Key Indices: ✅ All hierarchical relationships optimized
Query Pattern Indices: ✅ Status + date filtering combinations
Expected Performance: 10-50x search improvement
Actual Performance: Pending production load testing
```

### Technical Implementation
```
Handler: /lib/mcp/server/tools/chatgpt-connector-handler.js
Schema Updates: /lib/mcp/server/config/tool-schemas.js
Security Config: /lib/mcp/server/config/tool-security.js (PUBLIC_TOOLS)
Server Integration: mcp-server-v5.js and mcp-server-http-clean.js
Migration: /prisma/migrations/20250925_add_text_search_indices/
```

## Cross-Client Compatibility (2025-09-24 UPDATED)

### Gemini CLI Support
```bash
# Check tool schema generation
echo "=== Tool Schema Validation ==="
grep -r "markdownDescription\|zodToJsonSchema" mcp-server-v5.js --include="*.js" -B 2 -A 2

# Check prompts/get handler
echo "=== Prompt Execution Handler ==="
grep -r "case 'prompts/get'" mcp-server-http-clean.js -B 5 -A 20

# Message content format
echo "=== Message Content Structure ==="
grep -r "type.*text.*text.*content" mcp-server-http-clean.js --include="*.js" -B 2 -A 2
```

### Tool and Prompt Filtering
```bash
# Authentication-based filtering — CORRECTED 2026-06-11: these arrays no longer live in
# mcp-server-http-clean.js (facade-stripped across Waves 5-7); tool-security.js is the source.
echo "=== PUBLIC_TOOLS (intentionally EMPTY since Phase 3) ==="
grep -A 2 "const PUBLIC_TOOLS" lib/mcp/server/config/tool-security.js

echo "=== AUTHENTICATED_TOOLS (9) + ADMIN_TOOLS (1) ==="
grep -A 16 "const AUTHENTICATED_TOOLS" lib/mcp/server/config/tool-security.js | grep "^  '"
```

### 30. Pino Structured Logging for Hub Operations (Feb 2026)
```bash
# Audit mcpLogger adoption in hub handler files
echo "=== mcpLogger Usage in Hub Handlers ==="
grep -rn "mcpLogger" lib/mcp/server/tools/hub/ --include="*.js"
grep -rn "mcpLogger" lib/mcp/server/tools/hub-tools-handler.js

# Audit complianceLogger adoption
echo -e "\n=== complianceLogger Usage ==="
grep -rn "complianceLogger" lib/mcp/server/config/service-call-policy.js
grep -rn "complianceLogger" lib/mcp/server/security/compliance-monitor.js

# Audit authLogger for trust level events
echo -e "\n=== authLogger in Trust Level System ==="
grep -rn "authLogger" lib/services/workflow/security/trust-level.js
grep -rn "authLogger" lib/mcp/server/tools/hub/workflow-tools-handler.js

# Detect legacy console.log in hub files (should be zero)
echo -e "\n=== Legacy console.log in Hub (should be empty) ==="
grep -rn "console\.\(log\|error\|warn\|info\)" lib/mcp/server/tools/hub/ --include="*.js" | head -20
grep -rn "console\.\(log\|error\|warn\|info\)" lib/mcp/server/tools/hub-tools-handler.js | head -10

# Verify correct pino API (object-first, not message-first)
echo -e "\n=== Verify Object-First pino API ==="
grep -rn "mcpLogger\.\(info\|warn\|error\)({" lib/mcp/server/tools/hub/ --include="*.js" | head -10
grep -rn "mcpLogger\.\(info\|warn\|error\)('[^']*'" lib/mcp/server/tools/hub/ --include="*.js" | head -10

# Check error serialization uses { err: error } key
echo -e "\n=== Error Serialization Pattern ==="
grep -rn "{ err:" lib/mcp/server/tools/hub/ --include="*.js" | head -10
grep -rn "{ error:" lib/mcp/server/tools/hub/ --include="*.js" | grep -v "isError\|errorCount\|errorMessage" | head -10

# Production PM2 log analysis for hub operations
echo -e "\n=== Production Log Analysis Commands ==="
echo "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"mcp\"' | jq 'select(.tool != null)'"
echo "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"compliance\"' | jq 'select(.violation != null)'"
echo "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | jq 'select(.trustLevel != null)'"
```

## Key Questions to Answer

1. How scalable is the current MCPTool-based service registry?
2. What are the optimal service discovery patterns for large service ecosystems?
3. How should service dependency management evolve as the ecosystem grows?
4. What production monitoring and alerting should be implemented?
5. How can service quality and reliability be measured and enforced?
6. What are the best practices for cross-service authentication and authorization?
7. How should service versioning and compatibility be managed?
8. What community governance models should guide service ecosystem growth?
9. How to maintain compatibility across Claude Desktop, Claude.ai, and Gemini CLI?

## Success Criteria

- ✅ All 4 registered services accessible and operational
- ✅ Service discovery sub-500ms across all query types
- ✅ Cross-service communication working with proper error handling
- ✅ Authentication and ownership security model validated
- ✅ Real production service (Sentry) integration successful
- ✅ Conversational management interface operational
- ✅ Cross-platform Claude Desktop compatibility confirmed
- ✅ Hub scalability architecture assessed and optimized
- ✅ Compliance policy blocking dangerous tool calls (Jan 2026)
- ✅ Dynamic whitelisting for registered service tools (Jan 2026)
- ✅ SSRF protection with trusted internal service exception (Jan 2026)
- ✅ Browser automation service callable via Hub orchestration (Jan 2026)

### 27. Streamable HTTP Client Transport Discovery (Jan 23, 2026)
```bash
# Verify StreamableHTTPClientTransport import
echo "=== Streamable HTTP Transport Import ==="
grep -n "StreamableHTTPClientTransport" lib/mcp/server/utils/service-connection-pool.js

# Check transport detection logic
echo -e "\n=== Transport Auto-Detection ==="
grep -A 15 "const isSSE = " lib/mcp/server/utils/service-connection-pool.js

# Verify both transports are used
echo -e "\n=== SSE Transport Usage ==="
grep -n "new SSEClientTransport" lib/mcp/server/utils/service-connection-pool.js

echo -e "\n=== Streamable HTTP Transport Usage ==="
grep -n "new StreamableHTTPClientTransport" lib/mcp/server/utils/service-connection-pool.js

# Check Alpha Vantage service (real Streamable HTTP service)
echo -e "\n=== Alpha Vantage Service (Streamable HTTP) ==="
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT id, name, configuration->>'endpoint' as endpoint FROM mcp_tools WHERE id = 'cmkq1ocs90002yxl51l464i97';"
```

### 28. Alpha Vantage Integration Discovery (Jan 23, 2026)
```bash
# Verify Alpha Vantage registration
echo "=== Alpha Vantage Service Status ==="
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT id, name, status, permissions->>'publicAccess' as public, version FROM mcp_tools WHERE name LIKE '%alpha%';"

# Check wrapper pattern tools
echo -e "\n=== Wrapper Tools (TOOL_LIST, TOOL_GET, TOOL_CALL) ==="
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT capabilities->'tools' as tools FROM mcp_tools WHERE id = 'cmkq1ocs90002yxl51l464i97';"

# Verify API key preservation in URL
echo -e "\n=== API Key in URL (Query Params Preserved) ==="
grep "apikey" <(PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -t -c "SELECT configuration->>'endpoint' FROM mcp_tools WHERE id = 'cmkq1ocs90002yxl51l464i97';")

# Check service interactions (call history)
echo -e "\n=== Alpha Vantage Call History ==="
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT action, status, \"executionTime\", \"createdAt\" FROM mcp_interactions WHERE \"toolId\" = 'cmkq1ocs90002yxl51l464i97' ORDER BY \"createdAt\" DESC LIMIT 5;"
```

### 29. Field Location Standardization Discovery (Jan 23, 2026)
```bash
# Verify all services have publicAccess in permissions column
echo "=== publicAccess Location Validation ==="
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT id, name, permissions->>'publicAccess' as perm_public, configuration->>'publicAccess' as config_public FROM mcp_tools ORDER BY id;"

# Check seed scripts use correct structure
echo -e "\n=== Seed Script Field Locations ==="
grep -A 15 "permissions:" scripts/seed-notification-service.ts | head -20
grep -A 15 "configuration:" scripts/seed-notification-service.ts | head -20

# Verify no dual-checks remain
echo -e "\n=== Dual-Check Cleanup (should be 0) ==="
grep -c "configuration?.publicAccess" lib/mcp/server/tools/hub/hub-utilities.js lib/mcp/server/tools/hub/workflow-tools-handler.js || echo "0 dual-checks (clean)"

# Check registry(action: 'update') API structure
echo -e "\n=== registry(action: 'update') API Structure (Flattened) ==="
grep -A 10 "rateLimit:" lib/mcp/server/config/tool-schemas.js | grep -B 2 -A 8 "describe.*operational"

# Verify migration results
echo -e "\n=== Migration Validation ==="
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT COUNT(*) as total, COUNT(CASE WHEN permissions->>'publicAccess' IS NOT NULL THEN 1 END) as have_public_access FROM mcp_tools;"
```

---

## Revolutionary Impact Assessment

The MCP Hub represents a fundamental shift from traditional service registries to conversational AI service ecosystems. Key revolutionary aspects:

1. **Conversational Service Management**: Natural language replaces complex APIs
2. **Pure MCP Protocol**: Eliminates translation layers and integration complexity
3. **Zero Infrastructure Rebuild**: Leverages existing pAIchart models perfectly
4. **Real-World Validation**: Production services integrate seamlessly (Alpha Vantage, 113 financial tools)
5. **Cross-Platform Accessibility**: Works across Windows and Linux environments
6. **Service Ecosystem Intelligence**: Services discover and evaluate each other autonomously
7. **Universal Transport Support** (NEW): SSE + Streamable HTTP (firewall-friendly, serverless-ready)
8. **Semantic Field Organization** (NEW): Clear separation of access control vs operational settings

This discovery should validate the revolutionary nature of the MCP Hub and identify optimization opportunities for scaling the AI service ecosystem.

---

## Tool NextSteps & Template Pipeline (Apr 2026)

### Grep Commands

```bash
# Tool nextSteps — verify all hub handlers have workflow-aligned hints
grep -n "nextSteps" lib/mcp/server/tools/hub/service-call-handler.js
grep -n "nextSteps" lib/mcp/server/tools/hub/service-discovery-handler.js
grep -n "nextSteps" lib/mcp/server/tools/hub/service-tools-handler.js
grep -n "nextSteps" lib/mcp/server/tools/hub/service-health-handler.js

# Services tool WORKFLOW section — verify registry(tools) is in the description
grep -A10 "WORKFLOW:" lib/mcp/server/config/tool-schemas.js | head -15

# Validation error flow — do details reach the LLM?
grep -n "error.*details\|safeErrors\|validation.errors" app/api/mcp/tasks/action/route.ts
grep -n "error.*details" lib/mcp/server/utils/api-client.js

# MCP template pipeline — which templates exist?
grep -n "MCP_ORCHESTRATION\|MCP_SERVICE_DISCOVERY\|MCP_SERVICE_REGISTRY" scripts/seed-*.ts

# Template role guidance entries for MCP
grep -n "'mcp_" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts
```

### Key Findings (Apr 2026)

- **Consistent workflow chain**: Tool nextSteps now follow `registry(tools)` → `services(health)` → `services(call)` → `perform(task.comment)` across all 4 hub handlers
- **IMPORTANT warning**: The `services` tool description WORKFLOW section includes an explicit warning about checking `registry(tools)` before calling — fires from the tool definition itself, regardless of session history
- **4-template pipeline**: MCP Service Discovery → MCP Service Registry → MCP Service Orchestrator → MCP Workflow Orchestrator
- **Agent Template Gold Standard**: Pattern #44 at `/.claude/knowledge/patterns/agent-template-gold-standard-pattern.md` — 8 standards for template creation/maintenance
- **MAX_TOOL_TURNS**: Increased from 10 to 30 (Apr 2026) for workflow orchestration agents. Timeout 1080s (18min)
- **Validation error flow**: Zod validation details now propagated through `route.ts` → `api-client.js` → LLM error formatter, enabling self-correction on first retry