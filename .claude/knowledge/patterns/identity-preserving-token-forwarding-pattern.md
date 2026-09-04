# Identity-Preserving Token Forwarding Pattern

**Confidence**: 96% ✅
**Created**: 2026-03-10
**Updated**: 2026-03-11 (session context chain, token TTL, 4 auth paths, expanded handler coverage)
**Validated By**: sec-ops-specialist, boundary-contract-specialist, auth-permissions-specialist
**Production Use**: Perform, team-performance, agent-results tools (Mar 2026)

> **⚠️ POST-U2 (2026-05-19) UPDATE — Pattern superseded by Per-Call Mint Pattern**
>
> After U2 Audience-Tightening (9 commits ending `de6a2fa6`), the "Bearer-forward through chain" model below is HISTORICAL. The new pattern is **per-call mint at each downstream consumer** with per-service audience (RFC 8707):
> - `lib/mcp/server/utils/api-client.js:57` mints with `INTERNAL_API_AUDIENCE`
> - `lib/services/workflow/integrations/service-caller.ts:300+` mints with `audienceForService(serviceInfo)`
> - `lib/mcp/server/tools/hub/workflow-tools-handler.js:558+` mints with `audienceForService(serviceRecord)`, post-trust-gate
>
> The identity-preservation GOAL is unchanged — user's identity still propagated end-to-end. The MECHANISM shifted from "forward Bearer token unchanged" to "mint a fresh per-call token bearing the user's `{userId, email, role, azp}` for the specific destination audience". This achieves stronger isolation: a stolen Snowflake-forwarded token cannot replay at Databricks/EIA/etc.
>
> The "fail-closed Tier 3" outer wrapper is unchanged (now checks `userContext?.userId` not `userContext?.token` per Phase D sites #9-#11). Tier 1 (direct in-process) and Tier 2 (HTTP fallback) both retained.
>
> Full plan: `cline_docs/reviews/u2-audience-tightening-2026-05-19/IMPLEMENTATION-PLAN-v3.1.md`. Forensic trace: `.claude/knowledge/domain/mcp/cross-service-jti-forensics.md`. Canonical mint: `lib/auth/token-manager.ts:mintMcpToken`.

---

## Pattern Overview

**Problem**: When an MCP tool makes internal API calls on behalf of a user, the user's identity can be lost at layer boundaries. If the system falls back to admin/system credentials, operations execute with elevated privileges — bypassing POV access controls, team membership checks, and audit trails.

**Solution**: Forward the user's own JWT token through every layer boundary. If no token is available, fail closed (throw) rather than substituting elevated credentials.

**Results**: Zero privilege escalation paths in MCP→API calls. User identity preserved for access control and audit logging at every layer.

---

## When to Use This Pattern

- **Any MCP tool that performs write operations through the API layer** — the three-tier fallback with fail-closed Tier 3 is mandatory
- **Read-only API tools** — Context-Enriched API Client pattern is sufficient (admin fallback on reads is scoped by API routes)
- **Direct Prisma tools** (e.g., Hub) — don't need token forwarding, but must enforce ownership at the query level and rely on upstream middleware for token verification
- Any cross-process boundary where user identity must be preserved
- Systems with admin/system credentials that could be misused as fallback

### Decision Matrix: Which Pattern to Apply

| Tool Behavior | Pattern | Example |
|---|---|---|
| **Writes via API layer** | Three-Tier Fallback (this pattern) | `perform`, `analytics.team_performance`, `perform.agent_results` |
| **Reads via API layer** | Context-Enriched API Client | `project.pov_list`, `analytics.recommendations_get`, `template.*` |
| **Direct Prisma (own domain)** | Ownership enforcement + upstream trust | Hub tools (`registry.*`, `services.*`) |

### Three Auth Architectures in pAIchart MCP

**1. Three-Tier Fallback** (perform, team-performance, agent-results)
- Token re-verified at API route via `createHandler`
- Fail-closed if no token — strongest guarantee
- Required for: write operations crossing the API boundary
- Handlers: `task-action-handler.js`, `team-performance-handler.js`, `agent-results-handler.js`

**2. Context-Enriched API Client** (most tools)
- `ContextEnricher` extracts user token → `apiClient` forwards as Bearer header
- API route re-verifies token via `createHandler`
- Admin fallback only for reads when no token (safe — API routes scope results)

**3. Direct Prisma + Ownership Enforcement** (Hub tools)
- Skip API layer entirely — query Prisma with `ownerFilter: userId`
- `validateOwnership()` checks `ownerId === userId` or admin
- Token verified upstream by MCP HTTP middleware, not re-verified in handler
- **Trade-off**: No defense-in-depth on token verification. Safe today because all paths go through verified middleware, but weaker if hub handlers are ever called from unverified contexts

---

## The Pattern

### Three-Tier Execution Fallback

```
Tier 1: In-process route (preferred)
  → router-bridge.js loads TypeScript handler directly
  → User identity from JWT verification in createHandler
  → Only works in ts-node processes (paichart-web)

Tier 2: Authenticated HTTP with user's own token
  → apiClient.post() with Authorization: Bearer ${userToken}
  → User identity verified by API route's createHandler
  → Works in any process (paichart-mcp standalone)

Tier 3: Fail closed
  → throw new Error('No authenticated user context')
  → NEVER fall back to admin/system credentials
```

### Full Token Forwarding Chain

```
mcp-server-http-clean.js (auth middleware)
  → req.user = { id, email, role, token }     // 4 auth paths: RS256, HS256, OAuth provider, API key
  │
  ├─ RS256 (MCP first-party): token = RS256 JWT (15-min TTL, aud: paichart.app/mcp)
  ├─ HS256 (session JWT):     token = HS256 JWT (cookie-based)
  ├─ OAuth provider:          token = HS256 JWT minted by mcp-oauth-validator.js (24h TTL)
  └─ API key:                 token = the API key string itself

mcp-server-http-clean.js (session context) — Wave 6 routes
  → sessionContext = { user: req.user }        // Stored in SessionStore.sessionContexts
  → ctx.processMCPRequest(request, sessionContext.user)  // Delegates to MCPCoreManager
    // (lib/mcp/server/routes/mcp-transport-routes.ts:R11 — Wave 6 Phase 6.5)

lib/mcp/server/mcp-core.ts (MCPCoreManager.processRequest) — Wave 7 Phase 7.2
  → mcpServer.setUserContext({ user: { id, email, role, token, azp } })   // Global context (backup)
  → handler(toolArgs, { user, authenticated })        // Per-request context (preferred)
  // Pre-Wave-7 (May 2026), this body lived inline at mcp-server-http-clean.js:processMCPRequest.
  // Extracted verbatim to MCPCoreManager. Server class now delegates via
  // _buildRouteContext.processMCPRequest = (req, user) => this.mcpCore.processRequest(req, user).

mcp-server-v5.js (resolveUserContext)
  → if (context?.user) return context           // Per-request context (preferred)
  → else return this.userContext                 // Global fallback (warns in logs)

Dispatcher (e.g., analytics-dispatcher.js)
  → handler.handle(params, context)             // Passes context unchanged

Handler (e.g., team-performance-handler.js)
  → ContextEnricher.enrichContext(context)       // Extracts user.token
  → ContextEnricher.getUserContext(enriched)     // Returns apiUserContext

context-enricher.js
  → apiUserContext.token = user.token            // Maps to API context

api-client.js
  → Authorization: Bearer ${token}               // Forwarded to API route
  → If no token: admin fallback (reads only)     // Writes: fail closed at handler

API route (createHandler)
  → verifyAccessToken(token)                     // Full JWT verification
  → user = { userId, email, role }               // Identity restored
```

### Token TTL and Refresh

| Auth Path | Token Type | TTL | Refresh Mechanism |
|-----------|-----------|-----|-------------------|
| RS256 MCP first-party | RS256 JWT | **15 minutes** | Client refresh token (`mcp_refresh_*`) |
| HS256 session | HS256 JWT | Session-based | Cookie refresh |
| OAuth provider (GitHub/Google/MS) | HS256 JWT (minted) | **24 hours** | Re-authentication |
| API key | Raw string | No expiry | Manual rotation |

**Common 401 Root Cause**: RS256 MCP tokens expire after 15 minutes. If the client's refresh cycle breaks (e.g., stale refresh token, connection reset), subsequent tool calls forward an expired token to the API route, which rejects it. The MCP server itself may still accept the request if it validated the token before expiry but the session context cached the old token. **Fix**: Re-add the MCP connector to trigger a fresh OAuth flow.

### Key Implementation: buildTokenPayload Guards

```javascript
// lib/mcp/server/utils/build-token-payload.js
function buildTokenPayload(context) {
  // Guard 1: Empty string email → null (prevents '' matching)
  const email = context.email?.trim() || null;

  // Guard 2: Role enum validation (prevents invalid roles)
  const validRoles = ['USER', 'ADMIN', 'SUPER_ADMIN', 'DEMO_USER', 'PROJECT_MANAGER'];
  const role = validRoles.includes(context.role) ? context.role : 'USER';

  return { userId: context.id, email, role };
}
```

---

## Anti-Pattern: Admin Auth Fallback

```javascript
// ❌ WRONG: Falls back to admin credentials when user token missing
if (!token) {
  headers['Authorization'] = `Bearer ${process.env.ADMIN_TOKEN}`;
}

// ✅ CORRECT: Fail closed on write endpoints
if (!token && isWriteEndpoint) {
  throw new Error('No authenticated user context for write operation');
}
```

---

## Key Files

| File | Role | Pattern |
|------|------|---------|
| `mcp-server-http-clean.js` | Token in req.user (4 auth paths consolidated via `AuthManager.populateReqUser`, Wave 3a/4) + session context | All |
| `lib/mcp/server/mcp-core.ts` | `MCPCoreManager.processRequest` — calls `setUserContext` with token + azp; dispatches to handlers (Wave 7 Phase 7.2 extraction from server-class processMCPRequest) | All |
| `lib/mcp/server/routes/mcp-transport-routes.ts` | R11 entry — delegates to `ctx.processMCPRequest` which lazily routes through MCPCoreManager (Wave 6 Phase 6.5) | All |
| `mcp-server-v5.js` | `resolveUserContext` (per-request vs global fallback), tool handler registration | All |
| `lib/mcp/server/tools/advanced/task-action-handler.js` | Three-tier fallback (perform tool) | Three-Tier |
| `lib/mcp/server/tools/advanced/analytics/team-performance-handler.js` | Three-tier fallback (analytics.team_performance) | Three-Tier |
| `lib/mcp/server/tools/advanced/agent-results-handler.js` | Three-tier fallback (perform.agent_results) | Three-Tier |
| `lib/mcp/server/tools/advanced/ai-recommendations-handler.js` | Context-Enriched API Client (analytics.recommendations_get) | API Client |
| `lib/mcp/tasks/action/router-bridge.js` | Tier 1 JS→TS bridge — loads `tier:'direct'` in both `paichart-web` and `paichart-mcp` since Phase 2 proper Apr 8 2026 (previously the MCP worker silently fell back to Tier 2; see Bug Class 73) | Three-Tier |
| `lib/mcp/server/utils/build-token-payload.js` | Token payload validation guards | Three-Tier |
| `lib/mcp/server/utils/api-client.js` | Tier 2 HTTP with token forwarding | API Client |
| `lib/mcp/server/middleware/context-enricher.js` | Token mapping to API context | API Client |
| `lib/auth/oauth/mcp-oauth-validator.js` | HS256 JWT minting for OAuth provider users (24h TTL) | All |
| `lib/auth/validate-pov-access.ts` | Downstream access control (uses forwarded identity) | Three-Tier / API Client |
| `lib/mcp/server/tools/hub/hub-shared-middleware.js` | `extractAuthContext` + `validateOwnership` | Direct Prisma |
| `lib/mcp/server/tools/hub/hub-utilities.js` | `checkServiceAccess` (owner/admin/public) | Direct Prisma |

---

## Known Limitations

1. **DEMO_USER write access**: `validatePOVAccess` grants `DEMO_USER` role write access to POVs with `metadata.isDemo === true`. By design for demo onboarding but means demo POVs don't enforce team membership. Consider adding a `readOnly` parameter for write operations like `agent.execute`.

2. **Hub tools trust upstream verification**: `extractAuthContext()` in `hub-shared-middleware.js` reads `context.user` but never re-verifies the JWT signature. Ownership enforcement (`validateOwnership`, `resolveService` with `ownerFilter`) is solid, but token claims (userId, role) are trusted from context without independent verification. Currently safe because MCP HTTP middleware validates tokens before populating context, but lacks defense-in-depth if hub handlers are ever invoked from a different entry point.

---

## Related Patterns

- **field-leakage-prevention-pattern.md** — Same boundary-crossing concern (fields lost at boundaries)
- **transport-boundary-argument-coercion-pattern.md** — Data shape mutation at transport boundaries
- **handler-level-authorization-pattern.md** — Per-action auth checks that depend on forwarded identity
- **mcp-api-context-differences.md** — MCP vs API auth context differences
- **api-security-withPOVAccess-pattern.md** — Downstream consumer of forwarded identity

---

## Validation

```bash
# Verify three-tier pattern in ALL handlers (not just task-action)
grep -n "routeAction\|Tier 2\|Tier 3\|throw.*No authenticated" lib/mcp/server/tools/advanced/task-action-handler.js
grep -n "routeAction\|Tier 2\|Tier 3\|throw.*No authenticated" lib/mcp/server/tools/advanced/analytics/team-performance-handler.js
grep -n "routeAction\|Tier 2\|Tier 3\|throw.*No authenticated" lib/mcp/server/tools/advanced/agent-results-handler.js

# Verify token in req.user across all 4 auth paths
grep -n "token:" mcp-server-http-clean.js | grep "req.user\|oauthUser"

# Verify session context preserves user (including token)
grep -n "user: req.user" mcp-server-http-clean.js | head -5

# Verify resolveUserContext per-request preference
grep -n "resolveUserContext\|CONTEXT FALLBACK" mcp-server-v5.js | head -5

# Verify admin fallback blocked on writes
grep -n "ADMIN_AUTH_BLOCKED\|blockAdminAuth" lib/mcp/server/utils/api-client.js

# Verify buildTokenPayload guards
grep -n "trim\|validRoles\|includes" lib/mcp/server/utils/build-token-payload.js

# Verify OAuth validator mints HS256 JWT (not passing provider token)
grep -n "jwt.sign\|expiresIn" lib/auth/oauth/mcp-oauth-validator.js | head -5

# Verify MCP RS256 token TTL
grep -n "expiresIn\|exp.*=" mcp-server-http-clean.js | grep -i "mint\|token" | head -5

# Verify token forwarding through context enricher
grep -n "token" lib/mcp/server/middleware/context-enricher.js | head -5
```
