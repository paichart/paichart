# Resource Manager Discovery Prompt

**Last Updated**: 2026-03-14
**Status**: Enhanced v4.0 — Post-P6 migration update
**Confidence**: Very High - Validated with full discovery run + P6 migration complete
**Last Validated**: 2026-03-14 — P6 apiClient eliminated, admin fallback hardened

## 🆕 2026-05-27 Session — Run These Greps FIRST (embedded-server resource authz)

```bash
# Every POV-scoped resource CONTENT method must SELF-SCOPE (the MCP resources/read gate at
# mcp-core.ts ~:574 is FAIL-OPEN (line drifts — locate via grep -n "povContext" lib/mcp/server/mcp-core.ts) when metadata.povContext is absent — don't rely on it):
grep -nE "private async get[A-Za-z]+Content\(" lib/mcp/embedded-server.ts
grep -nE "userContext|validateMCPPOVAccess|buildPOVAccessFilter" lib/mcp/embedded-server.ts | head -20

# The fail-open gate (validates ONLY if povContext present — no fail-closed else):
grep -nE "povContext|Access denied" lib/mcp/server/mcp-core.ts | head
```

POV-scoped methods (getPOV/Task/Execution/Artifact/AIRecommendations Content) self-scope; getTeamPerformance / getTemplateExecutionContext / getSystemLogs are aggregate/mock/global (unscoped OK). Artifact IDOR fixed `f8f046ac`. Ref: [[prelaunch-pentest-2026-05-26]].

---

## 🆕 2026-05-24 Session — Run These Greps FIRST

```bash
# P1.5 fail-CLOSED shipped (commit bdfd305d) — embedded MCP buildPOVAccessFilter
# now THROWS on missing userContext (was fail-OPEN — returned {} = all POVs)
grep -nE "userContext required for resource access|buildPOVAccessFilter|buildTaskAccessFilter" lib/mcp/embedded-server.ts

# Tests pinned (42/42 pass)
npm run test:mcp-resource-security 2>&1 | tail -10

# Adjacent already-hardened (2026-05-17, pre-session)
grep -nE "buildPOVAccessFilter" lib/mcp/server/tools/chatgpt-connector-handler.js

# Resource fetch call sites — confirm they propagate userContext
grep -rnE "readServerResource\|getPOVDatabaseContent\|getTaskDatabaseContent" lib/services/mcp/ lib/mcp/embedded-server.ts 2>/dev/null | head -10
```

Related: `cline_docs/follow-ups/embedded-mcp-role-flip-functional-test-2026-05-24.md` (✅ RESOLVED — live-verified via UAT MCP connection as steve.terry@paichart.com USER role, agent execution `cmpjdnr310001yx7j7z7fzic6` SUCCESS).

---

## Objective
Map and understand the MCP Resource Manager system in pAIchart, including resource discovery, caching strategies, access control, event-driven updates, and integration with the broader MCP ecosystem.

## Context
The Resource Manager orchestrates resource availability across MCP servers. It implements caching with TTL, event emission, POV-scoped access control, and lifecycle management. Three resource types (artifacts, executions, hub) are served via three transport layers (stdio, HTTP, REST API) using two manager implementations sharing a common contract.

## Current Architecture Summary (Mar 2026)

### Resource Types
| Type | URI Pattern | DB Model | Content |
|------|-------------|----------|---------|
| Artifacts | `mcp://artifacts/{id}` | `agentArtifact` | Agent execution outputs |
| Executions | `mcp://executions/{id}` | `agentExecution` | Execution metadata |
| Hub | `mcp://hub/*` (8 URIs) | `MCPTool` | Service registry data |

### Transport Layers
| Layer | File | Auth |
|-------|------|------|
| Stdio | `mcp-server-v5.js` | Single-user process |
| HTTP | `mcp-server-http-clean.js` | JWT/OAuth/API key middleware |
| REST API | `app/api/mcp/resources/` | JWT via `getAuthUser()` |

### Dual Manager Architecture
| Manager | File | Language | Used By |
|---------|------|----------|---------|
| SimpleResourceManager | `lib/mcp/simple-resource-manager.js` | JS | MCP servers (stdio + HTTP) |
| MCPResourceManager | `lib/services/mcp/resourceManager.ts` | TS | REST API (singleton) |

Both implement `IResourceManager` interface. Shared constants/helpers in `resource-manager-shared.js`.

### Embedded Server (P6 — Mar 2026)
All 9 `apiClient` HTTP loopback calls replaced with direct Prisma queries. `userContext` threaded through full chain. `apiClient` import removed, admin auth fallback hardened to throw. The embedded server no longer handles resources via HTTP loopback — resource reads go through REST API layer with `buildPOVAccessFilter` / `buildTaskAccessFilter`.

## Discovery Scope

### 1. Resource Architecture
- [ ] Map all resource types and their URI patterns
- [ ] Document access control implementations (POV validation, cached context)
- [ ] Trace the read flow for each transport layer
- [ ] Verify hub resources integrated in both stdio and HTTP handlers
- [ ] Check artifact ↔ execution ↔ task relationship

### 2. Resource Lifecycle Management
- [ ] Resource discovery from MCP servers (5-minute intervals)
- [ ] Cache implementation with TTL (10-minute default, 5-min cleanup)
- [ ] LRU eviction at MAX_RESOURCES=5000
- [ ] Event emission patterns and listeners
- [ ] Artifact cleanup (daily-midnight-UTC by task — status-aware keep-4S/4F; daily by age >90d)

### 3. Integration Analysis
- [ ] Dual manager architecture — verify shared contract compliance
- [ ] Hub resource provider integration in both transport layers
- [ ] REST API endpoint security (auth + POV validation + audit)
- [ ] Embedded server direct Prisma queries (P6 migration)
- [ ] Signed URL download mechanism

### 4. Security Verification
- [ ] POV access validation on all resource endpoints
- [ ] Cached POV context (~5ms) vs DB fallback (~50-100ms)
- [ ] HMAC-signed download URLs (1hr expiry, rate limited)
- [ ] No admin auth fallback (hardened to throw — Mar 2026)

## Search Strategies

### 1. Core Component Patterns
```bash
# Resource manager usage
grep -r "resourceManager\|MCPResourceManager" --include="*.ts" --include="*.tsx"
grep -r "globalThis\.resourceManager\|globalThis\.mcpResourceManager" --include="*.ts"

# Resource manager imports
grep -r "from.*['\"].*resourceManager" --include="*.ts" --include="*.tsx"
grep -r "import.*MCPResourceManager" --include="*.ts"

# Singleton instance
grep -r "MCPResourceManager\.getInstance" --include="*.ts"
```

### 2. Shared Contract Verification
```bash
# Verify shared module health
echo "=== Shared Module Health ==="
echo "resource-manager-shared.js: $([ -f lib/mcp/resource-manager-shared.js ] && echo '✅' || echo '❌')"
echo "resource-manager-types.ts: $([ -f lib/mcp/resource-manager-types.ts ] && echo '✅' || echo '❌')"

# Verify shared constant usage (not hardcoded strings)
echo "=== Shared Constant Usage ==="
echo "SimpleResourceManager imports from shared:"
grep -c "require.*resource-manager-shared" lib/mcp/simple-resource-manager.js
echo "MCPResourceManager imports from shared:"
grep -c "resource-manager-types\|resource-manager-shared" lib/services/mcp/resourceManager.ts

# Verify IResourceManager compliance
echo "=== IResourceManager Interface ==="
grep -n "implements IResourceManager" lib/services/mcp/resourceManager.ts
grep -n "getStats()\|async close()" lib/services/mcp/resourceManager.ts | head -5

# Verify buildResourceKey usage
echo "=== buildResourceKey Usage ==="
grep -c "buildResourceKey" lib/mcp/simple-resource-manager.js lib/services/mcp/resourceManager.ts

# Verify RESOURCE_KEY_PREFIX usage
echo "=== RESOURCE_KEY_PREFIX Usage ==="
grep -c "RESOURCE_KEY_PREFIX" lib/mcp/simple-resource-manager.js lib/services/mcp/resourceManager.ts

# Regression: hardcoded key strings should NOT exist
echo "=== Hardcoded Key Regression ==="
grep -c "startsWith('artifact-')" lib/mcp/simple-resource-manager.js lib/services/mcp/resourceManager.ts || echo "0 (good)"
grep -c '`artifact-\${' lib/services/mcp/resourceManager.ts || echo "0 (good)"
```

### 3. Security Verification
```bash
# HTTP resource handlers exist
echo "=== HTTP Resource Handlers ==="
grep -n "case 'resources/read'" mcp-server-http-clean.js
grep -n "case 'resources/list'" mcp-server-http-clean.js

# POV validation in handlers
grep -n "povContext\|povCtx\|ownerId.*userId\|teamMemberIds" mcp-server-http-clean.js | grep -v "^.*//.*$" | head -10

# REST route security
grep -n "getAuthUser\|validatePOVAccess\|trackActivity" app/api/mcp/resources/\[...uri\]/route.ts

# No $disconnect on shared Prisma
grep -n "\$disconnect" lib/mcp/simple-resource-manager.js | grep -v "//" | head -5
# Expected: 0 results

# apiClient removal verified (P6)
echo "=== P6 Verification ==="
grep -n "import.*apiClient" lib/mcp/embedded-server.ts
# Expected: 0 results (import removed Mar 2026)
echo "Admin fallback hardened:"
grep -n "admin fallback disabled" lib/mcp/server/utils/api-client.js
# Expected: 1 result (throw statement)
```

### 4. Cache Management
```bash
# Cache operations
grep -r "resourceCache\|_resourceCache" --include="*.ts"
grep -r "buildResourceKey\|RESOURCE_KEY_PREFIX" --include="*.ts" --include="*.js" | grep -v node_modules | grep -v test

# TTL and expiration
grep -n "CACHE_TTL\|_expiresAt\|_cleanupExpired\|cleanupInterval" lib/mcp/simple-resource-manager.js

# Key format consistency (dash-prefix only, no colon-prefix)
echo "=== Key Format Check ==="
echo "Colon-prefixed keys (should be ZERO):"
grep -n "execution:\${.*}\|artifact:\${.*}" lib/services/mcp/resourceManager.ts | grep -v "^.*//.*$" | grep -v "description\|Generated"
```

### 5. Hub Resources
```bash
# Hub resource provider
grep -n "mcp://hub" lib/mcp/server/resources/hub-resources.js | head -10

# Hub integrated in both transports
echo "=== Hub in Stdio ==="
grep -n "hubResource" mcp-server-v5.js | head -5
echo "=== Hub in HTTP ==="
grep -n "hubResource" mcp-server-http-clean.js | head -5

# MCP spec compliance (contents plural, not content singular)
grep -n "contents:" lib/mcp/server/resources/hub-resources.js | head -5
```

### 6. Embedded Server (P6 Migration)
```bash
# userContext threading
grep -n "userContext" lib/mcp/embedded-server.ts | head -10

# Access filters
grep -n "buildPOVAccessFilter\|buildTaskAccessFilter" lib/mcp/embedded-server.ts

# Direct Prisma (no apiClient)
echo "=== apiClient references (should be comments only) ==="
grep -n "apiClient" lib/mcp/embedded-server.ts | grep -v "//" | head -5
# Expected: 0 results
```

### 7. Database Integration
```bash
# Prisma queries for resources
grep -r "prisma.*artifact\|prisma.*agentExecution" --include="*.ts" | grep -v test | head -10

# Artifact cleanup — expect cleanupArtifactsByAge default + daily call to read RETENTION_DAYS.agentArtifact
# (shared map with compliance-monitor since 2026-07-08, lib/mcp/server/security/retention-windows.js)
grep -n "cleanupArtifactsByTask\|cleanupArtifactsByAge\|RETENTION_DAYS" lib/services/mcp/resourceManager.ts
```

### 8. API Routes
```bash
# Resource API routes
find app/api -path "*resource*" -name "*.ts"
find app/api -path "*artifact*" -name "*.ts"

# API consumers
grep -r "fetch.*api.*resource\|/api/mcp/resources" --include="*.ts" --include="*.tsx" | head -10
```

### 9. Test Coverage
```bash
# Test files
find scripts -name "test-*resource*"

# Run tests
echo "=== Resource Tests ==="
npm run test:mcp-resource-manager 2>&1 | tail -5
npm run test:mcp-resource-security 2>&1 | tail -5
```

### 10. Component Discovery
```bash
# All resource-related files
find . \( -name "*resource*.ts" -o -name "*resource*.tsx" -o -name "*resource*.js" \) | grep -v node_modules | grep -E "(lib|app|components)" | sort

# UI components using resources
grep -r "useResource\|ResourceContext" components/ --include="*.tsx"
```

## Watch for Regressions

These issues were fixed in Feb-Mar 2026. Verify they haven't regressed:

1. **Cache key format**: Dash-prefix only (`artifact-{id}`). No colon-prefix, no raw IDs.
2. **HTTP `resources/read` handler**: Must exist in `mcp-server-http-clean.js`
3. **POV validation**: All resource endpoints must have auth + access control
4. **`$disconnect` anti-pattern**: `close()` must not call `prisma.$disconnect()`
5. **Hub resources**: Must be in **both** stdio and HTTP transport `resources/list` handlers
6. **MCP spec**: `contents` (plural) for `resources/read`, `content` (singular) for `tools/call`
7. **apiClient eliminated**: No live usage in `embedded-server.ts`, admin fallback throws

## Active Concerns

1. **Race condition**: Discovery every 5 min vs cache TTL 10 min — could serve stale data during window
2. **Singleton safety**: `globalThis.mcpResourceManager` — check for proper instance management
3. **Memory**: Event listener cleanup in `cleanup()` and `stopPolling()` methods
4. **Dual manager gotcha**: `registerResource`/`updateResource` only on SimpleResourceManager — execution engine guards with `typeof`
5. **v5 stdio userContext**: Single-user process model is safe today, but needs threading if architecture changes to shared MCP server (documented in multi-tenancy plan)

## Expected Outputs

### Component Inventory
```markdown
## Core Files
- `lib/mcp/resource-manager-shared.js` (~130 lines) - Shared constants and helpers
- `lib/mcp/resource-manager-types.ts` (~126 lines) - IResourceManager interface and types
- `lib/services/mcp/resourceManager.ts` (~2012 lines) - TS singleton for REST API
- `lib/mcp/simple-resource-manager.js` (~523 lines) - JS manager for MCP servers
- `lib/mcp/server/resources/hub-resources.js` (~402 lines) - Hub resource provider

## Transport Handlers
- `mcp-server-v5.js` (lines ~1271-1504) - Stdio resource handlers
- `mcp-server-http-clean.js` (lines ~1941+, ~3650+) - HTTP resource handlers

## API Routes
- `app/api/mcp/resources/route.ts` - List resources
- `app/api/mcp/resources/[...uri]/route.ts` - Read resource by URI
- `app/api/artifacts/[id]/download/route.ts` - Authenticated download
- `app/api/artifacts/[id]/public-download/route.ts` - Signed URL download

## Tests
- `scripts/test-mcp-resource-manager.ts` - 29 tests
- `scripts/test-mcp-resource-security.ts` - 42 tests
- Smoke test: `/.claude/knowledge/smoke-tests/mcp-resources-essentials-test.md` (12/12)
```

### Data Flow
```
Resource Lifecycle:
1. Discovery: MCP servers → discoverResources() → every 5 min with TTL
2. Registration: registerResource() → cache with POV context → emit event
3. Access: getResource() → check cache (5ms) → DB fallback (50-100ms) → POV validation
4. Cleanup: daily @ midnight UTC (status-aware keep 4 SUCCESS + 4 FAILED/task, via shared selectExecutionsToDelete) + daily (delete >90 days) + LRU eviction at 5000
```

### Performance Baselines
| Operation | Target | Notes |
|-----------|--------|-------|
| Cache hit | ~5ms | No DB query |
| Cache miss | ~50-100ms | DB + MIME override |
| POV validation | ~5ms cached | ~50-100ms DB fallback |
| Hub read | ~100-200ms | Direct Prisma |
| Discovery | ~1-2s | Then 5-min TTL refresh |

## Success Criteria

- All resource endpoints verified with auth + POV validation
- Cache key format consistent (dash-prefix via shared constants)
- Both transport layers serve all 3 resource types
- No apiClient usage in embedded server (P6 complete)
- Admin auth fallback hardened to throw
- Tests pass: manager (29) + security (42) + smoke (12)
