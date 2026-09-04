# Authentication & Authorization Discovery Task

**Last Updated**: 2026-02-22 (Added pino structured logging search commands)
**Status**: Enhanced v10.0 - Phase 3 Complete with Inline Enforcement Pattern
**Confidence**: Very High - Complete auth system + OAuth hybrid + RBAC + inline enforcement + DEMO_USER role
**Last Validated**: 2025-10-09 - Phase 3 Complete (Tool Security + API Filtering + Verification)

## 🆕 2026-06-06 Session — JWT_ACCESS_SECRET FULLY RETIRED (run these FIRST)

`JWT_ACCESS_SECRET` is GONE — Deploy 1 `c9636035` + Deploy 2 `a6c8d9a6` (code, env, running processes, GitHub secret; proc-verified). **Auth is RS256-only end to end.** D7 updated: RS256 Bearer = FRESH (Prisma, Path 1a); api-key tokens = FRESH (`enforceActiveApiKey`); HS256 = rejected.

> ⚠️ **The `lib/ app/`-scoped grep in the 2026-05-28 block below is exactly what made the 4-specialist review MISS two HS256 verifiers** in the **top-level `middleware/` dir** (`admin.ts` + `auth.ts`, both `jwtVerify(cookie, config.jwt.accessSecret, HS256)`, now DELETED). The `npm run build` typecheck caught them. **ALWAYS grep repo-wide:**

```bash
# accessSecret/JWT_ACCESS_SECRET should return ZERO crypto consumers REPO-WIDE (not just lib/ app/):
grep -rnE "config\.jwt\.accessSecret|JWT_ACCESS_SECRET" . --include="*.ts" --include="*.js" | grep -vE "node_modules|\.next|retired|removed 2026-06"
# D7 paths in the live middleware:
grep -nE "enforceActiveApiKey|Path 1a|Path 1c|Path 2|FRESH role" lib/auth/oauth/auth-manager.ts
```

Refs: `JWT_KEY_ROTATION_GUIDE.md` (Retirement section), [[feedback_run_build_before_push]] (build catches what grep misses).

---

## 🆕 2026-05-28 Session — Run These Greps FIRST (HS256 verify-surface — Step 2 SHIPPED)

✅ Step 2 shipped (`9faabda0` + `eb745fc3`): verifyAccessToken/verifyRefreshToken RS256-only; Edge HS256 accept + dead `x-user-id` header-injection removed.

```bash
# CONFIRM the HS256 session/refresh verify branches are GONE (must return nothing):
grep -nE "jwtVerify\(token, accessSecret|jwtVerify\(token, refreshSecret" lib/auth/token-manager.ts
# Edge middleware is RS256-claim-validate-or-refresh (no HS256 jwtVerify, no x-user-id injection):
grep -nE "jwtVerify|x-user-id|x-user-role" lib/auth/middleware.ts
# API keys mint RS256 (2026-06-04, 1dc46117); revocation enforced in verifyAccessToken (gated on scope 'api-key' → ApiKeyService.enforceActiveApiKey: fresh role + active-jti, fail-closed). validateApiKey + mcp-http-middleware.ts DELETED.
grep -nE "enforceActiveApiKey|scope.*api-key|mintMcpToken" lib/services/apiKeyService.ts lib/auth/token-manager.ts
# JWT_ACCESS_SECRET consumers (token-manager HS256 branches GONE; customAuthProvider + validateApiKey DELETED → no HS256 verify left; the secret itself was REMOVED 2026-06-06 — expect only retired-comments/docs/scripts-archive):
grep -rnE "JWT_ACCESS_SECRET|accessSecret|JWT_SECRET" lib/ app/ mcp-server-http-clean.js --include="*.ts" --include="*.js" | grep -ivE "//"
```

Specs: `cline_docs/follow-ups/hs256-step2-implementation-spec-2026-05-28.md` + parent `hs256-verify-surface-hardening-2026-05-28.md`. Full apiKey mint→RS256 migration DEFERRED. Ref: [[prelaunch-pentest-2026-05-26]].

---

## 🆕 2026-06-13 Session — Run These Greps FIRST (refresh-token race fix `71d18b4d`+`f24da472`; 8h cap REMOVED)

```bash
# SINGLE-FLIGHT refresh (race fix): route-level Map in refresh/route.ts is the LOAD-BEARING
# chokepoint — dedups ALL callers (middleware loopback, AuthProvider ×3, multi-tab)
# onto one BC36 rotation. Expect 4 hits (type comment, decl, get, set/delete).
grep -c "inflightRotations" app/api/auth/refresh/route.ts

# Middleware refreshOnce() is a loopback-fetch OPTIMIZATION only (saves N−1 round-trips +
# limiter budget) — correctness is owned by the route. BC20 body-cancel exactly once;
# resolves to extracted {ok, setCookie}, never a shared Response. Expect 9 hits.
grep -c "refreshOnce\|inflightRefresh" lib/auth/middleware.ts

# Regression-guard marker — INFO level deliberately (prod log floor is info; debug would
# never surface). Fires only on actual dedup. Expect exactly 2 sites (route + middleware).
grep -rn "refresh deduplicated" app lib --include="*.ts"

# 8h MAX_SESSION_DURATION REMOVED by product ruling 2026-06-12 (PLAN-v2 §2-PD): it was
# already dead for active sessions (rotation resets createdAt). Idle bound is now the
# refresh token's 7-day expiresAt. Expect ZERO hits — a hit means someone re-added it.
grep -rEn "MAX_SESSION_DURATION|max_session_duration_exceeded" app lib --include="*.ts"

# Refresh-token byte-uniqueness: signRefreshToken sets a random jti (~:163; mintMcpToken's
# is ~:273). Without it, same-second mints are IDENTICAL strings → same-second rotation
# made one-time-use vacuous. Expect 2 hits.
grep -n "setJti" lib/auth/token-manager.ts

# Refresh caller inventory (3 files): AuthProvider (14-min interval + <2min pre-empt +
# visibilitychange wake) + middleware (via refreshOnce). rate-limit.ts match is the
# authRefreshLimiter keying, NOT a caller. (get-client-auth deleted 2026-06-13 —
# always-null hook reading HttpOnly cookies client-side; ledger L7.)
#   Keying note (2026-06-13): authRefreshLimiter keys PER REFRESH-TOKEN (sha256 of the
#   cookie, 60/h, dedicated store) — NOT per IP — because the BC69 loopback presents the
#   server's egress IP and collapsed all users into one bucket (correlated mass-logout).
#   See TODO-loopback-refresh-rate-limit.md. The OTHER IP-keyed limiters now resolve client
#   identity via CF-Connecting-IP (lib/utils/client-ip.ts, single source of truth — fixed
#   e469aff5; TRUSTED_PROXY unset had collapsed them into one global bucket, ledger L6).
grep -rl "api/auth/refresh" components lib app --include="*.ts" --include="*.tsx"
```

Key facts (2026-06-28 update): MCP-client refresh (chatgpt/claude-desktop) is now **DB-persisted +
sha256-hashed** Prisma `RefreshToken` rows via `MCPOAuthTokenManager` (`provider:'mcp'`; was in-memory,
now survives pm2 reload). Discriminator is `provider` (REVERSED from the old note): **MCP** rows write
`provider:'mcp'`+`clientId`, **web** rows write them `null`. Both systems' tokens are hashed at rest now.
See `cline_docs/reviews/mcp-refresh-token-persistence-2026-06-28/`.
Phase 2 (rotation grace window: guarded CAS, reuse-detection telemetry, 24h tombstones)
is DEFERRED with named triggers — full spec
`cline_docs/reviews/refresh-token-race-2026-06-12/PLAN-v2.md`. Repro/regression:
`npm run test:refresh-race` (verified RED pre-fix `[401,200,401]` + 2×P2025, GREEN post).

---


> Older dated blocks (05-27, 05-26, 05-24) evicted per Protocol 12 R1 → library §Evicted session blocks.

## Objective
Perform a comprehensive discovery of the authentication and authorization system in pAIchart, including JWT implementation, API key management, RBAC enforcement, session handling, and security measures across all layers.

## Context
Authentication and authorization are critical security components. pAIchart uses a multi-layered approach with JWT tokens, API keys, role-based access control, and automatic filtering at the API level. Understanding this system is essential for maintaining security and proper access control.

**MCP HTTP Authentication Context (UPDATED August 2025)**: The system now supports HTTP transport for MCP with:
- JWT-based authentication using jose library for signature verification
- Support for both X-API-Key and Bearer token headers
- Claude Desktop integration via mcp-remote bridge
- Per-session transport isolation for security
- Environment-based auth configuration (MCP_HTTP_AUTH_REQUIRED=true/false)
- Simplified JWT validation without TypeScript compilation requirements
- **NEW**: Context initialization via `initializeAuthContext()` on server startup
- **NEW**: Full context passing to all tool handlers with `authenticated` flag
- **NEW**: Authentication-based tool access (read-only tools for unauthenticated)
- **FIXED**: Authentication logic corrected (was inverted)

**Phase 2.2 WebSocket Auth Caching Context**: The system has implemented advanced auth caching achieving:
- Dual-layer caching (L1 memory + L2 Redis-like) for WebSocket authentication
- 85% authentication query reduction target achieved
- Real-time cache invalidation with <100ms response time
- AES-256-GCM encryption for all cached tokens
- Security event integration with blacklist system
- Cache warming strategies and comprehensive metrics
- Emergency flush capabilities for security incidents

## Discovery Scope

### 1. Authentication Implementation
- [ ] JWT token generation and validation
- [ ] API key management system
- [ ] Session authentication flow
- [ ] Token storage patterns (cookies, headers)
- [ ] Authentication middleware and guards
- [ ] Login/logout implementations
- [ ] NEW: Real-time token invalidation via WebSocket (Plan 7)
- [ ] NEW: Security event processing integration (Plan 7)
- [ ] NEW: WebSocket auth event broadcasting (<25ms latency) (Plan 7)
- [ ] NEW: 5 threat detection patterns (brute_force, credential_stuffing, token_theft, privilege_escalation, suspicious_location) (Plan 7)
- [ ] NEW: Lean MCP OAuth implementation (2025-09-21)
- [ ] NEW: OAuth token validation patterns (GitHub, Google, Microsoft)
- [ ] NEW: Stateless OAuth security model
- [ ] NEW: MCP manifest OAuth configuration
- [ ] **MCP Tool Security**: Three-tier permission model (PUBLIC/AUTHENTICATED/ADMIN)
  - **Reference**: `/.claude/knowledge/domain/mcp/tool-permission-management.md`
  - Discover: Tool categorization, two-layer enforcement, security boundaries


### 2. Authorization & RBAC — condensed (Phase 2 trim, 2026-06-11)

Live model (full narrative → library): **two deliberate systems** — the RolePermission TABLE
answers role-capability questions ("can this role create a POV?"; no instance exists yet);
**validatePOVAccess** answers instance-scoped questions (edit/delete/view THIS POV). The split is
question-type, not resource-type (`project_permission_architecture_intent` memory). checkPermission
call-set is CLOSED; 5-min permission cache keys on {id, role} — passing raw TokenPayload
(.userId not .id) collides the cache key → cross-role escalation (2026-05-26 block, identity-map).
Full architecture narrative + history: domain/auth/auth-permissions-library.md §Phase 2.

**Custom roles — backend-functional, GUI-dormant, KEPT (2026-07-01):** `Role` table + `User.customRoleId` FK
exist and the admin user create + update handlers honor `customRoleId` (create assignment gated SUPER_ADMIN
per BC39; `AdminUserService` writes it). `CustomRoleSelect` + `/api/admin/roles` exist. **Known gap:** the GUI
create dialog doesn't reliably send `customRoleId` on first submit (front-end timing bug — the *edit* path
works); user-mgmt GUI is SUPER_ADMIN-only while the API allows `[ADMIN, SUPER_ADMIN]` (intentional). This is
**NOT dead code** — reserved for a future custom-role GUI; do not delete it as unused.
Verify: `grep -rn "customRoleId" lib/admin app/api/admin && cat components/admin/CustomRoleSelect.tsx | head`.

- [ ] Token security (encryption, signing)
- [ ] Password hashing and storage
- [ ] Rate limiting implementation
- [ ] CORS configuration
- [ ] Security headers usage
- [ ] Audit logging for access
- [ ] NEW: Tool security boundaries (PUBLIC_TOOLS vs AUTHENTICATED_TOOLS vs ADMIN_TOOLS) (Plan 8)
- [ ] NEW: Service authorization with checkServiceAccess (Plan 8)
- [ ] NEW: Public discovery data filtering (Plan 8)
- [ ] NEW: SERVICE_CALL and UNAUTHORIZED_SERVICE_ACCESS audit events (Plan 8)
- [ ] NEW: enforceToolSecurity() middleware (Plan 8)

### 4. Integration Points
- [ ] MCP server authentication
- [ ] MCP HTTP transport authentication (NEW)
- [ ] API route protection patterns
- [ ] Frontend auth state management
- [ ] Database auth queries
- [ ] External service authentication
- [ ] WebSocket authentication
- [ ] Claude Desktop authentication via mcp-remote

### 5. Token Management
- [ ] Token generation endpoints
- [ ] Refresh token implementation
- [ ] Token expiration handling
- [ ] Token revocation mechanisms
- [ ] Token validation middleware
- [ ] Token payload structure
- [ ] **Phase 2: RS256/JWKS implementation** (Added 2026-01-21)
- [ ] **Trust level token gating** (TEAM_MEMBER enabled)
- [ ] **Audit logging for trust denials** (Activity table)
- [ ] **MCP token forwarding chain** (Added 2026-03-11) — see section 5b below

### 5b. MCP Token Forwarding Chain Discovery (NEW - 2026-03-11)

**Pattern**: `/.claude/knowledge/patterns/identity-preserving-token-forwarding-pattern.md` (96% confidence)

**Context**: When MCP tools make internal API calls, the user's JWT token must survive every layer boundary. Token loss at any point causes 401 errors. Common root cause: expired RS256 tokens (15-min TTL) with broken client refresh cycles.

```bash
echo "=== MCP Token Forwarding Chain ==="

# 1. Token inclusion in req.user across all 4 auth paths (RS256, HS256, OAuth, API key)
echo "Auth paths storing token in req.user:"
grep -n "token:" mcp-server-http-clean.js | grep "req.user\|oauthUser" | head -10

# 2. Session context preserves user (including token)
echo "Session context creation:"
grep -n "user: req.user" mcp-server-http-clean.js | head -5

# 3. MCPCoreManager.processRequest receives user from session context
# Wave 7 Phase 7.2 (2026-05-21): processMCPRequest body moved to
# lib/mcp/server/mcp-core.ts:MCPCoreManager.processRequest. Server class
# delegates via _buildRouteContext.processMCPRequest closure.
echo "processRequest user passing (search both old + new locations):"
grep -n "processMCPRequest.*sessionContext\|processMCPRequest.*req.user\|processRequest.*req.user" mcp-server-http-clean.js lib/mcp/server/mcp-core.ts lib/mcp/server/routes/mcp-transport-routes.ts | head -10

# 4. setUserContext propagates token to MCP server
echo "setUserContext with token:"
grep -n "setUserContext" mcp-server-http-clean.js | head -5

# 5. resolveUserContext prefers per-request over global
echo "resolveUserContext fallback logic:"
grep -n "resolveUserContext\|CONTEXT FALLBACK" mcp-server-v5.js | head -5

# 6. ContextEnricher synthesis (post-U2 2026-05-19: token DROPPED from apiUserContext, azp ADDED)
echo "ContextEnricher post-U2 synthesis (apiUserContext.{userId, email, role, azp, isDemoUser} — NO token):"
grep -n "token\|azp\|userId" lib/mcp/server/middleware/context-enricher.js | head -15
echo "isAuthenticated semantics shifted: checks userId not token (Phase D site #6)"

# 7. apiClient post-U2 mints per-call with INTERNAL_API_AUDIENCE (NO Bearer-forward)
echo "apiClient per-call mint (Phase D site #5):"
grep -B 2 -A 12 "await mintMcpToken({" lib/mcp/server/utils/api-client.js
echo "Bearer header now built from freshly-minted per-call token, not options.userContext.token"

# 8. buildTokenPayload guards (for Tier 1 direct calls)
echo "buildTokenPayload guards:"
grep -n "trim\|validRoles\|includes" lib/mcp/server/utils/build-token-payload.js

# 9. Token TTL values
echo "Token TTL:"
grep -n "expiresIn" lib/auth/oauth/mcp-oauth-validator.js | head -3
grep -n "expiresIn\|exp.*=" mcp-server-http-clean.js | grep -i "mint\|sign" | head -5

# 10. OAuth validator mints HS256 JWT (REMOVED 2026-05-18 U2 Path B v3 — see note below)
echo "OAuth JWT minting (post-deletion expect zero hits):"
grep -n "jwt.sign" lib/auth/oauth/mcp-oauth-validator.js | head -3
```

**2026-05-18 update (U2 Path B v3, commit `9b2c2d08`)**: the validator's per-callback HS256 mint at `lib/auth/oauth/mcp-oauth-validator.js:511-533` was deleted as dead code after 5-specialist review proved zero downstream consumers.

**2026-05-19 update (U2 Audience-Tightening, 9 commits ending `de6a2fa6`)**: canonical mint site is now `lib/auth/token-manager.ts:mintMcpToken` (consolidated from inline definition formerly in `mcp-server-http-clean.js` — grep for `mintMcpToken` to find current callers). RS256, kid rotates ~90-day (current `paichart-2026-04`). Audiences now **per-service** per RFC 8707 via `audienceForService({name})` helper at `lib/mcp/server/tools/hub/audience-policy.js` — examples `https://paichart.app/mcp/snowflake-service`, `https://paichart.app/mcp/token-validator-service`. Legacy generic `/api` and `/mcp` still minted for `INTERNAL_API_AUDIENCE` (internal API calls) and `MCP_FRONTDOOR_AUDIENCE` (OAuth callbacks/refresh-grant). 3 auth-middleware paths consolidated into `populateReqUser(req, claims, token, authMethod, extras)` helper (Phase E.1) populating `req.user.{id, email, role, token, azp, authMethod}`. `azp` (Option α) propagated end-to-end through `setUserContext` → `context.user.azp` → per-call mints. Refresh-grant `client_id` mismatch enforcement at `/oauth/token` with `grant_type=refresh_token` (dedicated `/oauth/refresh` endpoint DROPPED Wave 6 Phase 0.6 / 2026-05-21 — zero production hits). Mint rate limit 100/min/user via `checkRateLimit`. `OrchestrationContext.user.token` and `WorkflowConfig.token` DROPPED entirely (Phase D sites #16/#17). Full plan: `cline_docs/reviews/u2-audience-tightening-2026-05-19/IMPLEMENTATION-PLAN-v3.1.md`. Forensic runbook: `.claude/knowledge/domain/mcp/cross-service-jti-forensics.md`.

**2026-05-19/20 update (SessionStore extraction, Phase 2.0 → 2.11)**: all in-memory MCP session state (transports, contexts, timestamps, OAuth requests, auth codes) extracted from `mcp-server-http-clean.js` into a strongly-typed `SessionStore` class at `lib/auth/oauth/session-store.ts` (466 LOC + 10 race/LRU/TTL unit tests in `scripts/test-session-store.ts`). The `SessionContext` interface includes `userId`, `user.{id, email, role, token, azp, authMethod, scope, jti, permissions}`, `authenticated`, `authMethod`, `temporary`, `createdAt`. `AuthCodeData` includes `userId, email, role, scope, audience, originalClientId, clientRedirectUri, clientName, code_challenge, code_challenge_method, correlationId, timestamp, tenantId`. `OAuthRequestData` includes `originalClientId, clientRedirectUri, clientState, clientName, requestedScope, requestedResource, code_challenge, code_challenge_method, correlationId, githubClientId, githubClientSecretEnv, provider, createdAt`. Atomic `exchangeAuthCode` synchronous get+delete preserved (race-tested). `isAllowedRedirectUri` consolidated onto SessionStore in Phase 2.8. Callers in `mcp-server-http-clean.js` now use `this.sessionStore.{setSession,getTransport,getContext,hasSession,deleteSession,setOAuthRequest,getOAuthRequest,deleteOAuthRequest,setAuthCode,exchangeAuthCode,isAllowedRedirectUri,getEvictionStats,getLimits}()`. Upgrade procedure for SDK bumps: `.claude/knowledge/protocols/mcp-sdk-upgrade-protocol.md` (Protocol 9). Tracked Item #1 watches the 30-min idle TTL; Tracked Item #2 watches the 2026 MCP stateless transition (SEP-1442, SEP-2567).

`TokenPayload` (`lib/auth/token-manager.ts:15-19`) exposes only `{userId, email, role}` — `provider` and `isDemoUser` were HS256-only JWT claims with zero verified-JWT consumers and are now derived inline from `user.role` at every consumption site.

**Questions to answer**:
- Are all 4 auth paths storing `token` in `req.user`?
- Does session context preserve the full user object (including token)?
- Is `resolveUserContext` preferring per-request context over global?
- Is the token reaching `apiClient` via `ContextEnricher`?
- What is the token TTL for each auth path? (RS256: 15min — HS256 OAuth path removed 2026-05-18)
- ~~Is the OAuth validator minting an HS256 JWT?~~ (Deleted 2026-05-18 U2 Path B v3)

### 6. MCP Hub Trust Levels (Phase 2 - Added 2026-01-21)
```bash
# Trust level implementation
echo "=== MCP Hub Trust Levels ==="
cat lib/services/workflow/security/trust-level.js | head -100

# Trust levels that receive JWT tokens
grep -A 5 "TOKEN_RECEIVING_TRUST_LEVELS" lib/services/workflow/security/trust-level.js

# TEAM_MEMBER trust enabled in Phase 2
grep "TEAM_MEMBER" lib/services/workflow/security/trust-level.js

# Trust determination logic
grep -A 30 "async function determineTrustLevel" lib/services/workflow/security/trust-level.js

# Audit logging integration
grep -B 5 -A 15 "logTrustDenial" lib/services/workflow/integrations/service-caller.ts
grep -B 5 -A 15 "logTrustDenial" lib/mcp/server/tools/hub/workflow-tools-handler.js
```


## OAuth Security & Permission Assignment — condensed (Phase 2 trim, 2026-06-11)

KEPT derive-state check — phantom-user detection (users created without permission rows):
```bash
# BOTH paths: MCP is .js (mcp-oauth-validator.js), WEB is .ts (oauth-service.ts, provider-id-canonical since Wave 2 2026-06-21). The old *.js-only grep MISSED the web path.
grep -n "findFirst.*OR.*email.*oauth\|OR:.*whereConditions.*email\|findUnique({ where: { email: userInfo.email }" lib/auth/oauth/*.js lib/auth/oauth/oauth-service.ts
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.findMany({where:{oauthProvider:{not:null}},select:{id:true,email:true,role:true}}).then(r=>{console.log(r.length,'oauth users');p.\$disconnect()})"
```
OAuth users get role USER on first login (DEMO_USER only via demo flow); role assignment flow,
why-both-systems rationale, inline-vs-centralized architecture: library §Phase 2.

## Search Strategies

### 1. Authentication Flow Analysis
```bash
# Find JWT implementation
grep -r "jsonwebtoken\|jwt" --include="*.ts" --include="*.js" | grep -v node_modules | head -20

# Locate token generation
grep -r "sign(\|generateToken\|createToken" --include="*.ts" --include="*.js" | head -20

# Find token validation
grep -r "verify(\|verifyToken\|validateToken\|verifyAccessToken" --include="*.ts" --include="*.js" | head -20

# API key handling
grep -r "X-API-Key\|x-api-key\|apiKey\|api_key" --include="*.ts" --include="*.js" | head -20

# Session management
grep -r "session\|cookie.*token\|accessToken" --include="*.ts" --include="*.js" | head -20

# Login/logout endpoints
find app/api -name "route.ts" | xargs grep -l "login\|logout\|signin\|signout" | head -10

# OAuth permission assignment (NEW - 2025-10-09)
grep -n "permissions.*canRegisterServices\|permissions.*canViewServices" lib/auth/oauth/mcp-oauth-validator.js

# OAuth inline permissions in JWT
grep -n "permissions: {" lib/auth/oauth/mcp-oauth-validator.js -A 15
```

### 1b. Wave 3a Extracted Auth Modules (May 20, 2026 — Phase 3.10a shipped)
```bash
# AuthManager class — sole authority for: populateReqUser, generateRefreshToken,
# detectOAuthClient, checkCallbackRateLimit, initialize.
# (validateScopeMatch DELETED 2026-06-11 — dead since Wave 3b.0a 0f07ac90 removed its
#  only-ever caller, the dead Microsoft exchange handler; the check was a tautology.)
# Server-class versions of all 4 hot-path methods were DELETED in Phase 3.10a
# (commit e2ee8a38). Class is 813 LOC with 28 unit tests passing (2026-06-11).
grep -n "class AuthManager\|^  async\|^  public" lib/auth/oauth/auth-manager.ts | head -30

# Confirm AuthManager dispatch sites — expected counts (re-proven 2026-06-11;
# Wave 6 moved most dispatch into lib/mcp/server/routes/oauth-flow-routes.ts):
#   mcp-server-http-clean.js (`this.authManager.`): createMiddleware 1 (lazy-init),
#     detectOAuthClient 1, initialize 1, destroy 1
#   oauth-flow-routes.ts (`authManager.`): detectOAuthClient 1,
#     checkCallbackRateLimit 1 (SEC-C4), generateRefreshToken 2 (proxy mint + refresh
#     rotation), checkRegisterRateLimit 1 (/oauth/register DCR gate, 8f19afae — 30/min/IP)
#   populateReqUser: 3 — dispatched INSIDE AuthManager.createMiddleware
#     (grep `this.populateReqUser(` in auth-manager.ts), never via this.authManager.
#   validateScopeMatch: 0 — method DELETED 2026-06-11 (was dead since Wave 3b.0a;
#     pre-Wave-6 "4 generateRefreshToken / 4 detectOAuthClient" counts retired with
#     the dead Microsoft exchange handler + Wave 6 route extraction)
grep -nE "authManager\.[a-zA-Z]+\(" mcp-server-http-clean.js lib/mcp/server/routes/oauth-flow-routes.ts
grep -c "this\.populateReqUser(" lib/auth/oauth/auth-manager.ts  # expect 3

# JWT key store — kid-based public key lookup (Phase 3.0b, closes SEC-C2)
grep -n "export function getPublicKeyPEM\|export function __resetKeyCache" lib/auth/jwt-key-store.ts

# Auth constants — TOKEN_TTL, scopes, audiences (Phase 3.1)
grep -n "^export const" lib/auth/auth-constants.ts | head -25

# SEC-C1 fail-fast guard REMOVED 2026-06-06 (JWT_ACCESS_SECRET fully retired — Deploy 1 c9636035
# deleted the presence-guards on purpose; zero hits here is CORRECT, not a regression):
grep -n "JWT_ACCESS_SECRET is not set" lib/auth/oauth/auth-manager.ts mcp-server-http-clean.js  # expect ZERO

# SEC-C4 fix (Phase 3.9, commit baa4613a) — verify Retry-After header is set on 429
grep -n "Retry-After\|retryAfterSeconds" mcp-server-http-clean.js lib/auth/oauth/auth-manager.ts

# Verify token-manager goes through jwt-key-store (Phase 3.0b)
grep -n "getPublicKeyPEM\|importSPKI\|decodeProtectedHeader" lib/auth/token-manager.ts

# AuthManager unit tests (28 passing as of 2026-06-11; Tests 7/9/15/28 removed with their dead subjects — see suite header for tombstones; Test 17b = detectOAuthClient parity)
grep -n "^async function test_\|^const TESTS" scripts/test-auth-manager.ts | head -30

# Confirm server-class dead code is GONE (Phase 3.0a + 3.10a — these should all return empty)
grep -n "^  async verifyGitHubToken\|^  async findOrCreateUserFromGitHub\|^  async mcpOAuthRefreshMiddleware" mcp-server-http-clean.js
grep -n "^  generateRefreshToken\|^  validateScopeMatch\|^  detectOAuthClient" mcp-server-http-clean.js
grep -n "^function populateReqUser" mcp-server-http-clean.js
# Canonical implementations now live in:
#   lib/auth/oauth/auth-manager.ts (4 methods deleted from server in 3.10a)
#   lib/auth/oauth/mcp-oauth-validator.js (3 OAuth helper methods deleted in 3.0a)

# Sibling implementation note: /register inline classifier still operates on
# redirect_uris[] + client_name (Phase 3.8b consolidation deferred for
# Claude-Desktop-first protection). Cross-reference comment at line ~2920.
grep -n "🔗 SIBLING IMPLEMENTATION\|🔗 NOTE: This inline classifier" mcp-server-http-clean.js
```

### 2. Authorization Implementation
```bash
# Find role definitions (including DEMO_USER - added 2025-10-09)
grep -r "UserRole\|DEMO_USER\|ADMIN\|SUPER_ADMIN" --include="*.ts" --include="*.tsx" | grep -E "enum|type|const" | head -20

# Find ResourceAction and ResourceType enums (MCP_SERVICE added 2025-10-09)
grep -r "enum ResourceAction\|enum ResourceType" --include="*.ts" -A 10 | head -50

# Find MCP_SERVICE permissions (Phase 3.4 - Hub Tools)
grep -r "MCP_SERVICE\|mcp-service" --include="*.ts" --include="*.js" | head -20

# DRY Access Control - Shared Utility (2025-10-10)
grep -n "export function validatePOVAccess" lib/auth/validate-pov-access.ts -A 30

# POV Access Validation Usage
grep -rn "validatePOVAccess" app/api lib/ --include="*.ts" | head -20

# Find hub tools permission checks (LEGACY - pre-Phase 3)
grep -r "checkPermission.*mcp-service\|registerServices\|viewServices" lib/mcp/server/tools/ -n | head -20

# Find enforceToolSecurity implementation (Phase 1.1 - 2025-10-09)
grep -n "enforceToolSecurity" lib/mcp/server/config/tool-security.js -A 20

# Find enforceToolSecurity usage in MCP server
grep -n "enforceToolSecurity" mcp-server-http-clean.js -B 2 -A 5

# Find PUBLIC_TOOLS, AUTHENTICATED_TOOLS, ADMIN_TOOLS arrays
grep -n "PUBLIC_TOOLS\|AUTHENTICATED_TOOLS\|ADMIN_TOOLS" lib/mcp/server/config/tool-security.js -A 10

# Find Permission interfaces and types
grep -r "interface.*Permission\|type.*Permission" --include="*.ts" -A 5 | head -30

# Find rolePermissions matrix
grep -r "rolePermissions\|RolePermissions" --include="*.ts" -A 20 | head -50

# Locate authorization checks
grep -r "role.*===.*ADMIN\|checkPermission\|hasPermission\|authorize" --include="*.ts" | head -20

# Find conditional permissions
grep -r "conditions.*isOwner\|conditions.*isTeamMember" --include="*.ts" -B 2 -A 2 | head -30

# Find getAuthUser usage
grep -r "getAuthUser\|authUser\|currentUser" --include="*.ts" | head -20

# POV access control
grep -r "ownerId.*userId\|team.*members.*userId" --include="*.ts" | head -20

# Permission middleware
grep -r "authMiddleware\|requireAuth\|authenticated" --include="*.ts" | head -20

# Role-based queries
grep -r "role.*!==.*ADMIN.*&&\|if.*user\.role" --include="*.ts" -A 3 | head -30

# Find DEMO_USER inline checks (Phase 3.3 - 2025-10-09)
grep -rn "user.role === 'DEMO_USER'\|user.role === UserRole.DEMO_USER" app/api lib/ -A 5 | head -50

# Find metadata.isDemo checks for demo POV filtering
grep -rn "metadata.isDemo\|metadata.*isDemo.*true" app/api lib/ -B 2 -A 5 | head -50

# Find inline DEMO_USER filtering in POV endpoints
grep -rn "DEMO_USER.*demo.*POV\|demo users can only access demo POVs" app/api lib/ -B 3 -A 3 | head -50

# Count inline DEMO_USER checks across codebase
grep -r "user.role === 'DEMO_USER'" app/api lib/ --include="*.ts" | wc -l
```

### 3. Security Measures
```bash
# Password hashing
grep -r "bcrypt\|argon2\|hash.*password\|password.*hash" --include="*.ts" --include="*.js" | head -20

# Rate limiting
grep -r "rate.*limit\|rateLimit\|limiter" --include="*.ts" --include="*.js" | head -20

# CORS configuration
grep -r "cors\|Access-Control\|origin.*header" --include="*.ts" --include="*.js" | head -20

# Security headers
grep -r "helmet\|security.*header\|X-Frame-Options\|CSP" --include="*.ts" --include="*.js" | head -20

# Audit logging
grep -r "audit.*log\|access.*log\|security.*event" --include="*.ts" | head -20

# Token encryption
grep -r "encrypt.*token\|token.*encrypt\|JWT_SECRET" --include="*.ts" --include="*.js" | head -20

# MCP error codes for authentication (Phase 3 - standardized -32001)
grep -rn "code: -32001\|Authentication.*required" mcp-server-http-clean.js -B 2 -A 2

# Tool security enforcement (Phase 1.1)
grep -rn "P1.1.*Enforce tool security\|enforceToolSecurity.*toolName" mcp-server-http-clean.js -B 1 -A 5
```

### 3.1. Handler Auth Plan vs Implementation (NEW - 2025-10-09)
```bash
# Compare proposed centralized architecture vs actual inline implementation
echo "=== Handler Auth Plan Analysis ==="

# Find proposed AuthenticationMiddleware pattern (in plan but not implemented)
echo "Proposed pattern (handler-auth-plan.md):"
grep -n "class AuthenticationMiddleware\|class PermissionMiddleware" cline_docs/handler-auth-plan.md -A 10

# Find actual inline implementation
echo "Actual implementation (inline pattern):"
grep -rn "enforceToolSecurity" lib/mcp/server/config/tool-security.js mcp-server-http-clean.js | head -10

# Count inline DEMO_USER checks (10/13 endpoints)
echo "Inline DEMO_USER checks count:"
grep -r "user.role === 'DEMO_USER'\|UserRole.DEMO_USER" app/api lib/ --include="*.ts" | grep -v "test\|spec" | wc -l

# Find issues identified in handler-auth-plan.md
echo "Issues from handler-auth-plan.md:"
grep -n "Key Issues Identified\|No Universal Middleware\|Missing Security Enforcement" cline_docs/handler-auth-plan.md -A 5

# Verify those issues are now resolved
echo "Resolution verification:"
grep -n "enforceToolSecurity.*function\|PUBLIC_TOOLS.*includes" lib/mcp/server/config/tool-security.js -A 3
```

### 3.2. Admin-Only Endpoint Pattern Discovery (Jan 2026)

**Purpose**: Discover endpoints using `createHandler` with `allowedRoles` for admin-only access

```bash
echo "=== ADMIN-ONLY ENDPOINT DISCOVERY ==="

echo "--- createHandler with allowedRoles ---"
grep -rn "allowedRoles.*ADMIN\|allowedRoles.*SUPER_ADMIN" app/api --include="*.ts"

echo "--- createHandler factory usage ---"
grep -rn "createHandler({" app/api --include="*.ts" | head -20

echo "--- Workflow REST API (Admin-Only) ---"
ls -la app/api/workflows/*.ts app/api/workflows/**/*.ts 2>/dev/null
find app/api/workflows -name "route.ts" -type f

echo "--- UserRole import for role checks ---"
grep -rn "import.*UserRole.*from.*@prisma/client" app/api --include="*.ts"

echo "--- Named Workflow REST Endpoints ---"
grep -rn "workflowName\|MCPWorkflow" app/api/workflows --include="*.ts" | head -20

echo "--- createHandler implementation ---"
grep -n "export.*createHandler\|allowedRoles.*includes" lib/api/createHandler.ts -A 5 | head -30
```

**Expected Findings**:
- `/app/api/workflows/route.ts` - `allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN]`
- `/app/api/workflows/[id]/route.ts` - Admin-only single workflow operations
- `/app/api/workflows/run/route.ts` - Admin-only workflow execution by name
- `createHandler` validates roles before invoking handler

**Pattern Classification**:
| Endpoint Type | Authorization Pattern |
|---------------|----------------------|
| POV-scoped resources | validatePOVAccess (ownership) |
| System-level admin | createHandler + allowedRoles |
| Public discovery | No auth (or minimal) |

### 3.1. Split Authentication Architecture Detection
```bash
# CRITICAL: Split Authentication Paths
echo "=== Authentication Split-Brain Detection ==="
echo "JWT vs Session dual paths:"
grep -r "JWT.*fallback\|session.*fallback\|auth.*alternative" --include="*.ts" -B 3 -A 3 | head -10

echo "Authentication bypass patterns:"
grep -r "requireAuth.*skip\|authenticate.*optional\|bypass.*auth" --include="*.ts" -A 5 | head -10

echo "Development auth overrides:"
grep -r "NODE_ENV.*development.*auth\|development.*skip.*auth" --include="*.ts" -B 3 -A 3 | head -5

# Environment Variable Auth Bypass
echo "=== Auth Environment Variable Bypass ==="
echo "Auth disable patterns:"
grep -r "SKIP_AUTH\|DISABLE_AUTH\|AUTH_BYPASS" --include="*.ts" --include="*.js" -B 2 -A 2

echo "Development mode auth skips:"
grep -r "process\.env\.NODE_ENV.*auth\|development.*auth.*skip" --include="*.ts" -B 3 -A 3

echo "API key environment bypasses:"
grep -r "API_KEY.*override\|bypass.*api.*key\|skip.*token" --include="*.ts" -B 2 -A 2

# Permission Dual Implementation
echo "=== Permission System Split-Brain ==="
echo "Role-based vs ownership dual checks:"
grep -r "role.*check.*admin\|permission.*check.*owner" --include="*.ts" | grep -E "(\&\&|\|\|).*alternative" | head -5

echo "Permission bypass patterns:"
grep -r "permission.*bypass\|access.*override\|role.*skip" --include="*.ts" -B 2 -A 2 | head -10

echo "Dual authorization middleware:"
grep -r "middleware.*auth.*dual\|auth.*middleware.*fallback" --include="*.ts" -B 3 -A 3
```

### 4. MCP Server Authentication
```bash
# MCP auth implementation
grep -r "getAuthHeaders\|auth-manager" lib/mcp --include="*.js" --include="*.ts" | head -20

# API key priority
grep -r "PAICHART_API_KEY\|process\.env\..*API_KEY" lib/mcp --include="*.js" | head -20

# Bearer token handling
grep -r "Bearer\|Authorization.*header" lib/mcp --include="*.js" --include="*.ts" | head -20

# Session fallback
grep -r "cookie\|session.*auth" lib/mcp --include="*.js" | head -20

# Auth error handling
grep -r "401\|403\|Unauthorized\|Forbidden" lib/mcp --include="*.js" | head -20
```

### 5. API Route Protection
```bash
# Protected routes
for route in $(find app/api -name "route.ts" | head -20); do
  echo "=== $route ==="
  grep -n "getAuthUser\|requireAuth\|authenticate" "$route" || echo "⚠️  No auth check found"
done

# Public routes (potential security risk)
for route in $(find app/api -name "route.ts" | head -20); do
  if ! grep -q "getAuthUser\|auth\|session" "$route"; then
    echo "❌ Potentially unprotected: $route"
  fi
done

# Auth middleware usage
grep -r "middleware.*auth\|auth.*middleware" app/api --include="*.ts" | head -20

# Error responses
grep -r "status(401)\|status(403)" app/api --include="*.ts" | head -20
```

### 6. Frontend Auth Integration
```bash
# Auth context/providers
find . -name "*auth*" -path "*/context/*" -o -path "*/providers/*" | grep -E "\.(ts|tsx)$" | head -10

# Token storage in frontend
grep -r "localStorage.*token\|sessionStorage.*token" --include="*.ts" --include="*.tsx" | head -20

# Auth hooks
grep -r "useAuth\|useUser\|useSession" --include="*.ts" --include="*.tsx" | head -20

# Protected route components
grep -r "RequireAuth\|ProtectedRoute\|AuthGuard" --include="*.tsx" | head -20

# Login/logout UI
grep -r "onLogin\|onLogout\|handleAuth" --include="*.tsx" | head -20
```

### 7. OAuth Architecture Validation (CRITICAL - ADD THIS FIRST)
```bash
echo "=== 🚨 CRITICAL: OAuth Architecture Validation ==="
echo "ALWAYS validate OAuth changes against dual architecture documentation:"
echo ""

# Check architecture documentation exists
echo "1. OAuth Architecture Documentation:"
[ -f cline_docs/oauth-architecture-clarification.md ] && echo "✅ Dual architecture doc exists" || echo "❌ MISSING architecture doc"
[ -f cline_docs/oauth-system-boundaries.md ] && echo "✅ System boundaries doc exists" || echo "❌ MISSING boundaries doc"

echo ""
echo "2. Dual OAuth System Validation:"
echo "   System A (MCP OAuth): Stateless AI client authentication"
echo "   System B (Web App OAuth): Stateful browser user authentication"
echo ""

# Validate MCP OAuth does NOT use Web App OAuth storage
echo "3. Token Storage Separation Check:"
echo "   MCP OAuth tokens should use MCPOAuthTokenManager:"
grep -r "MCPOAuthTokenManager" lib/auth/oauth --include="*.ts" --include="*.js" | head -5

echo ""
echo "   Web App OAuth tokens should use EnterpriseOAuthService:"
grep -r "EnterpriseOAuthService.tokenStorage" lib/auth/oauth --include="*.ts" | head -5

echo ""
echo "❌ VIOLATION CHECK: MCP OAuth should NEVER use EnterpriseOAuthService.tokenStorage"
grep -r "EnterpriseOAuthService.tokenStorage" mcp-server*.js lib/auth/oauth/mcp-oauth-*.js 2>/dev/null && echo "🚨 ARCHITECTURAL VIOLATION DETECTED" || echo "✅ No cross-contamination found"

echo ""
echo "4. Health Monitoring Separation:"
echo "   Health endpoint should distinguish MCP OAuth from Web App OAuth:"
grep -rn "mcpOAuthTokens\|webAppTokens" app/api/auth/oauth/health --include="*.ts" | head -5

echo ""
echo "5. Token Refresh Service Validation:"
echo "   MCP OAuth (GitHub) should NOT use TokenRefreshService:"
echo "   Web App OAuth (Microsoft/Google) SHOULD use TokenRefreshService:"
grep -rn "TokenRefreshService" lib/auth/oauth --include="*.ts" -B 2 -A 2 | head -10
```


### 7.1/7.2 OAuth Production Implementation — moved (Phase 2 trim, 2026-06-11)

Microsoft MCP OAuth, provider configuration, and the lean-OAuth implementation narratives
(2025-09→10 era, pre-OAuth-proxy) → library §Phase 2. Current OAuth ground truth: the proxy
pattern (project_oauth_proxy memory) + oauth-multi-provider-discovery's dated blocks.

### 8. Token Lifecycle
```bash
# Token expiration
grep -r "expiresIn\|exp\|expiry\|expiration" --include="*.ts" --include="*.js" | grep -i token | head -20

# Refresh token logic
grep -r "refresh.*token\|token.*refresh\|refreshToken" --include="*.ts" --include="*.js" | head -20

# Token revocation
grep -r "revoke.*token\|blacklist\|invalidate.*token" --include="*.ts" | head -20

# Token payload structure
grep -r "payload.*userId\|decoded.*email\|token.*role" --include="*.ts" | head -20

# Token validation errors
grep -r "TokenExpiredError\|JsonWebTokenError\|invalid.*token" --include="*.ts" | head -20
```

### 9. Database Auth Queries
```bash
# User authentication queries
grep -r "findUnique.*email\|findFirst.*email.*password" --include="*.ts" | head -20

# Role-based filtering
grep -r "where.*role\|filter.*role" --include="*.ts" | grep -i prisma | head -20

# Team access queries
grep -r "team.*members.*some\|members.*userId" --include="*.ts" | head -20

# API key storage
grep -r "apiKey\|api_key" prisma/schema.prisma -A 5 -B 5

# Session storage
grep -r "RefreshToken\|Session" prisma/schema.prisma -A 10
```

### 8.1. MCP HTTP Authentication (UPDATED August 2025)
```bash
# MCP HTTP server authentication - Clean implementation
echo "=== MCP HTTP Authentication - Clean Server ==="
if [ -f mcp-server-http-clean.js ]; then
  echo "HTTP clean server auth implementation ✅"
  grep -c "createAuthMiddleware" mcp-server-http-clean.js
  grep -c "X-API-Key\|Authorization.*Bearer" mcp-server-http-clean.js
  echo "Context initialization:"
  # Wave 7 Phase 7.1 (2026-05-21): initializeAuthContext moved to MCPCoreManager
  grep -c "initializeAuthContext" lib/mcp/server/mcp-core.ts mcp-server-http-clean.js
  echo "Authentication requirement logic (should be === 'true'):"
  grep "this.authRequired.*process.env.MCP_HTTP_AUTH_REQUIRED" mcp-server-http-clean.js | head -1
fi

# Authentication middleware
echo "=== MCP Auth Middleware ==="
if [ -f lib/auth/mcp-http-middleware.ts ]; then
  echo "TypeScript middleware exists ✅"
  grep -c "MCPAuthenticatedRequest" lib/auth/mcp-http-middleware.ts
fi

# JWT validation in MCP
echo "=== JWT Validation ==="
grep -r "jose.*verify\|JWT.*decode" mcp-server-http-clean.js | head -5
grep -r "Buffer.from.*base64.*payload" mcp-server-http-clean.js | head -5

# Environment variables for auth
echo "=== Auth Environment Variables ==="
grep -r "MCP_HTTP_AUTH_REQUIRED\|JWT_ACCESS_SECRET" --include="*.js" --include="*.md"

# Claude Desktop authentication configs
echo "=== Claude Desktop Auth Configs ==="
ls -la claude_desktop_config*.json 2>/dev/null | grep -E "authenticated|bearer"
grep -c "X-API-Key\|Authorization.*Bearer" claude_desktop_config*.json 2>/dev/null || echo "0"

# mcp-remote authentication bridge
echo "=== mcp-remote Auth Bridge ==="
grep -r "mcp-remote.*--header" --include="*.json" --include="*.md" | head -3
grep -r "PAICHART_API_KEY" --include="*.json" | head -3

# Authentication test endpoints
echo "=== Auth Test Results ==="
# Check if auth is enforced
curl -s -X POST http://localhost:8080/mcp -o /dev/null -w "%{http_code}" 2>/dev/null || echo "Server not running"

# Context passing to tool handlers
echo "=== Tool Handler Context Support ==="
echo "Basic tools accepting context:"
grep -c "async handle.*args, context" lib/mcp/server/tools/sdk-native-basic-tools.js
echo "Advanced tools accepting context:"
grep -c "async handle.*args, context" lib/mcp/server/tools/sdk-native-advanced-tools.js
echo "Browser automation tools accepting context:"
grep -c "async handle.*args, context" lib/mcp/server/tools/sdk-native-browser-automation-tools.js
echo "Hub tools accepting context:"
grep -c "async handle.*args, context" lib/mcp/server/tools/hub-tools-handler.js

# Authentication-based tool access
echo "=== Authentication-Based Tool Access ==="
echo "Read-only tools (consolidated names):"
grep -E "project|template|analytics|services.*discover" lib/mcp/server/tools/*.js | wc -l
echo "Write operation tools (require authentication):"
grep -E "perform|registry|services.*call" lib/mcp/server/tools/*.js | wc -l

# Check for authentication checks in write handlers
echo "=== Authentication Checks in Write Handlers ==="
echo "perform (execute_task_action) auth check:"
grep -A 5 "handleExecuteTaskAction" lib/mcp/server/tools/sdk-native-advanced-tools.js | grep -c "context.*authenticated"
echo "create_browser_automation_task auth check:"
grep -A 5 "handleCreateBrowserAutomationTask" lib/mcp/server/tools/sdk-native-browser-automation-tools.js | grep -c "context.*authenticated"
```

### 8.2. Plans 7 & 8: Security Event System and Tool Boundaries (NEW)
```bash
# PLAN 7: WebSocket Auth Event Broadcasting
echo "=== Plan 7: Real-time Auth Events ==="
echo "WebSocket auth broadcaster:"
ls -la ./lib/websocket/auth-event-broadcaster.ts
grep -c "broadcastAuthEvent\|invalidateToken" ./lib/websocket/auth-event-broadcaster.ts 2>/dev/null || echo "0"

echo "Security event processor: DELETED 2026-06-14 (c5dab442 — dormant dead code, never ran)."
echo "  Live threat controls: login-route rate-limit/anomaly + lib/auth/audit.ts + fail2ban."

echo "Threat detection patterns:"
grep -r "brute_force\|credential_stuffing\|token_theft\|privilege_escalation\|suspicious_location" --include="*.ts" | head -10

echo "Real-time latency achievements:"
grep -r "<25ms\|broadcast.*latency\|real.*time.*invalidation" --include="*.ts" --include="*.md" | head -5

# PLAN 8: MCP Tool Security Boundaries
echo -e "\n=== Plan 8: Tool Security Architecture ==="
echo "Tool security configuration:"
ls -la ./lib/mcp/server/config/tool-security.js
grep -c "PUBLIC_TOOLS\|AUTHENTICATED_TOOLS\|ADMIN_TOOLS" ./lib/mcp/server/config/tool-security.js 2>/dev/null || echo "0"

echo -e "\nPublic tools (should be 4):"
grep "PUBLIC_TOOLS" ./lib/mcp/server/config/tool-security.js -A 10 | grep "'" | wc -l

echo "Authenticated tools (should be 31+):"
grep "AUTHENTICATED_TOOLS" ./lib/mcp/server/config/tool-security.js -A 40 | grep "'" | wc -l

echo "Admin tools (should be 3):"
grep "ADMIN_TOOLS" ./lib/mcp/server/config/tool-security.js -A 5 | grep "'" | wc -l

echo -e "\nTool security enforcement:"
grep -r "enforceToolSecurity\|isPublicTool\|getToolSecurityLevel" --include="*.js" | head -10

echo -e "\nService authorization:"
grep -r "checkServiceAccess\|service.*authorization\|services.*auth" --include="*.js" | head -10

echo "Triple validation (ownership, admin, public):"
grep -A 10 "checkServiceAccess" ./lib/mcp/server/tools/hub-tools-handler.js | grep -E "ownerId|role.*ADMIN|publicAccess"

echo -e "\nPublic discovery filtering:"
ls -la ./lib/mcp/server/tools/public-discovery-filter.js
grep -c "filterPublicServiceData\|hide.*sensitive" ./lib/mcp/server/tools/public-discovery-filter.js 2>/dev/null || echo "0"

echo "Fields hidden from public (should be 8+):"
grep "// .* HIDDEN" ./lib/mcp/server/tools/public-discovery-filter.js | wc -l

echo -e "\nRate limiting tiers:"
grep -r "100.*min.*public\|1000.*min.*authenticated\|10.*service" --include="*.js" --include="*.md" | head -5

echo -e "\nAudit logging for services:"
grep -r "SERVICE_CALL\|UNAUTHORIZED_SERVICE_ACCESS\|audit.*service" --include="*.js" --include="*.ts" | head -10

echo -e "\nPlan 8 Philosophy check:"
grep -r "Security enables\|don't constrain\|foundational.*security" --include="*.md" --include="*.js" | head -5

# PLAN 9: OAuth 2.0 Enterprise Authentication
echo -e "\n=== Plan 9: OAuth 2.0 Implementation ==="
echo "OAuth provider configurations:"
ls -la ./lib/auth/oauth/oauth-config.ts

echo -e "\nOAuth service implementation:"
ls -la ./lib/auth/oauth/oauth-service.ts

echo -e "\nEnhanced authentication middleware:"
ls -la ./lib/auth/enhanced-auth-middleware.ts

echo -e "\nOAuth API endpoints:"
ls -la ./app/api/auth/oauth/\[provider\]/route.ts
ls -la ./app/api/auth/oauth/callback/\[provider\]/route.ts

echo -e "\nOAuth provider support (should show Microsoft, Google, GitHub):"
grep -A 5 "OAUTH_PROVIDERS" ./lib/auth/oauth/oauth-config.ts | head -10

echo -e "\nDual authentication implementation:"
grep -r "oauth2_.*Bearer\|tryOAuthAuthentication\|4-tier.*auth" --include="*.ts" | head -5

echo -e "\nOAuth state security (PKCE):"
grep -r "generateCodeChallenge\|PKCE\|validateOAuthState" --include="*.ts" | head -5

echo -e "\nEnterprise features (team sync, role mapping):"
grep -r "teamSync\|roleMapping\|enterpriseFeatures" --include="*.ts" | head -5
```


### §8.3 — RETIRED: WebSocket Auth Caching moved to library (lib/websocket/ deleted 315db03e; auth context now flows per Wave 3a AuthManager)

### 8. Authentication Context Propagation (2025-09-24 NEW)
```bash
# Prompt filtering with user context
echo "=== Prompt Context Passing ==="
grep -r "listPrompts.*user" lib/mcp/server --include="*.js" -B 2 -A 2

# Tool filtering by authentication
echo "=== Tool Authentication Filtering ==="
grep -r "PUBLIC_TOOLS\|AUTHENTICATED_TOOLS" lib/mcp/server mcp-server-http-clean.js --include="*.js" | head -20

# Resource access with user context
echo "=== Resource User Context ==="
grep -r "user.*context.*resource" lib/mcp/server --include="*.js" -B 1 -A 1
```

### 9. Security Configuration
```bash
# Environment variables
grep -E "JWT_SECRET\|TOKEN_SECRET\|SESSION_SECRET\|API_KEY" .env.example

# Security constants
grep -r "JWT_SECRET\|TOKEN_EXPIRY\|SESSION_DURATION" --include="*.ts" | grep -E "const|env" | head -20

# Encryption config
grep -r "algorithm.*aes\|crypto.*secret" --include="*.ts" | head -20

# Salt rounds
grep -r "saltRounds\|SALT_ROUNDS\|bcrypt.*rounds" --include="*.ts" | head -20

# Allowed origins
grep -r "allowedOrigins\|cors.*origin" --include="*.ts" --include="*.js" | head -20
```

### 10. Component-Level Authorization
```bash
# Find component permission checks
grep -r "canEdit\|canView\|canDelete\|hasPermission" --include="*.tsx" --include="*.ts" | head -30

# Find permission state management
grep -r "setCanEdit\|setCanView\|checkPermissions" --include="*.tsx" -B 3 -A 3 | head -30

# Look for pragmatic/simple approaches (developer comments)
grep -r "simple.*approach\|pragmatic\|workaround\|TODO.*permission\|FIXME.*auth" --include="*.tsx" --include="*.ts" -i -B 2 -A 5 | head -40

# Find Jan Marshal or developer-specific implementations
grep -r "Jan Marshal\|JM\|MARSHAL" --include="*.tsx" --include="*.ts" -i -B 5 -A 10 | head -30

# Component permission hooks
grep -r "usePermission\|useAuth\|useCanEdit" --include="*.tsx" --include="*.ts" | head -20

# Find permission UI patterns (disabled states)
grep -r "disabled=.*canEdit\|disabled=.*permission\|disabled=.*auth" --include="*.tsx" -B 2 -A 2 | head -30

# Look for default permission behaviors
grep -r "default.*allow\|default.*true.*permission\|permissive.*default" --include="*.tsx" --include="*.ts" -i | head -20

# Find permission error handling
grep -r "catch.*permission\|error.*auth.*default" --include="*.tsx" --include="*.ts" -B 3 -A 5 | head -30
```

### 11. Plan 11B Authentication-Based Tool Access Validation
```bash
echo "=== Plan 11B Implementation Validation ==="

# Verify dynamic tool filtering implementation
echo "1. Tool filtering implementation:"
grep -n "Filter tools based on authentication status" mcp-server-http-clean.js -A 30

# Check read-only tools list
echo "2. Read-only tools configuration (17 expected):"
grep -n "readOnlyTools = \[" mcp-server-http-clean.js -A 20

# Validate tool count and categorization
echo "3. Tool categorization verification:"
echo "   Read-only tools count: $(grep -A 20 'readOnlyTools = \[' mcp-server-http-clean.js | grep -E "'[a-z_]+'" | wc -l)"

# Check test suite exists and coverage
echo "4. Test suite validation:"
[ -f scripts/test-auth-tool-access.js ] && echo "✅ Test suite exists" || echo "❌ Test suite missing"
grep -c "EXPECTED_READ_ONLY_TOOLS\|EXPECTED_AUTH_REQUIRED_TOOLS" scripts/test-auth-tool-access.js 2>/dev/null || echo "❌ Test arrays missing"

# Verify registry(action: 'list') Gold Standard implementation
echo "5. registry(action: 'list') Gold Standard A implementation:"
grep -n "nextSteps" lib/mcp/server/tools/hub/user-services-handler.js -A 5 -B 2

# Check error message enhancement
echo "6. Multi-method authentication error messages:"
grep -r "🔐 Authentication Required\|API Key:\|OAuth:\|JWT Bearer:" lib/mcp/server/utils/ --include="*.js"

# Validate Phase 3 security (all tools authenticated)
echo "7. Phase 3 security validation (PUBLIC_TOOLS should be empty):"
grep -A 3 "PUBLIC_TOOLS" lib/mcp/server/config/tool-security.js

# Run comprehensive Plan 11B test if available
echo "8. Plan 11B comprehensive test execution:"
if [ -f scripts/test-auth-tool-access.js ]; then
    echo "Test suite found - run with: node scripts/test-auth-tool-access.js"
    echo "Expected: 9/9 tests should pass for Plan 11B validation"
else
    echo "❌ Test suite not found"
fi

# Check authentication context initialization
echo "9. Authentication context initialization:"
# Wave 7 Phase 7.1: initializeAuthContext moved from server class to MCPCoreManager.
grep -n "initializeAuthContext" lib/mcp/server/mcp-core.ts mcp-server-http-clean.js -A 10 -B 5
```

### 12. System Health Validation
```bash
echo "=== Authentication System Health Check ==="
echo "1. JWT library: $(grep -c "jsonwebtoken" package.json && echo '✅ Installed' || echo '❌ Missing')"
echo "2. getAuthUser exists: $([ -f lib/auth/get-auth-user.ts ] && echo '✅ YES' || echo '❌ NO')"
echo "3. Auth middleware: $(find . -name "*middleware*" -path "*auth*" | wc -l) files"
echo "4. Protected routes: $(grep -r "getAuthUser" app/api --include="*.ts" | wc -l)"
echo "5. Unprotected routes: $(find app/api -name "route.ts" -exec grep -L "auth\|Auth" {} \; | wc -l)"

# Role distribution
echo -e "\n=== Role Implementation ==="
echo "USER role refs: $(grep -r "role.*USER" --include="*.ts" | grep -v "SUPER_USER" | wc -l)"
echo "ADMIN role refs: $(grep -r "role.*ADMIN" --include="*.ts" | grep -v "SUPER_ADMIN" | wc -l)"
echo "SUPER_ADMIN refs: $(grep -r "SUPER_ADMIN" --include="*.ts" | wc -l)"

# Security indicators
echo -e "\n=== Security Indicators ==="
echo "Password hashing: $(grep -c "bcrypt\|argon2" package.json && echo '✅ Configured' || echo '❌ Check implementation')"
echo "Rate limiting: $(grep -c "rate.*limit" --include="*.ts" . 2>/dev/null && echo '✅ Found' || echo '❌ Missing')"
echo "CORS config: $(grep -c "cors" --include="*.ts" --include="*.js" . 2>/dev/null && echo '✅ Found' || echo '❌ Missing')"

# Token management
echo -e "\n=== Token Management ==="
echo "Token generation: $(grep -c "sign(" --include="*.ts" . 2>/dev/null) implementations"
echo "Token validation: $(grep -c "verify(" --include="*.ts" . 2>/dev/null) implementations"
echo "Refresh tokens: $(grep -c "refresh.*token" --include="*.ts" . 2>/dev/null && echo '✅ Implemented' || echo '❌ Not found')"

# MCP Integration
echo -e "\n=== MCP Authentication ==="
echo "auth-manager.js: $([ -f lib/mcp/auth-manager.js ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "API key env var: $(grep -c "PAICHART_API_KEY" lib/mcp/*.js 2>/dev/null || echo '0') references"
echo "Auth headers: $(grep -c "getAuthHeaders" lib/mcp/*.js 2>/dev/null || echo '0') usages"

# Plan 7 & 8 Security
echo -e "\n=== Plans 7 & 8 Security Features ==="
echo "WebSocket auth broadcaster: $([ -f lib/websocket/auth-event-broadcaster.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
# Security event processor + WebSocket auth broadcaster: DELETED (dormant Plan-7/8 infra — c5dab442 / 315db03e). Live threat controls are in the login route + audit + fail2ban.
echo "Tool security config: $([ -f lib/mcp/server/config/tool-security.js ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Public discovery filter: $([ -f lib/mcp/server/tools/public-discovery-filter.js ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Tool boundaries: $(grep -c "PUBLIC_TOOLS\|AUTHENTICATED_TOOLS" lib/mcp/server/config/tool-security.js 2>/dev/null || echo '0') arrays"
```


## Recent JWT Validation Patterns (Oct 22, 2025)

### Search: Edge Runtime RS256 Validation
```bash
grep -r "Edge Runtime\|atob.*headerB64\|manual.*RS256.*decode" --include="*.js" --include="*.ts" -B5 -A15 . | grep -v node_modules | head -120
```

**Questions to answer**:
- Is Edge Runtime RS256 decode implemented?
- Does it use atob() + JSON.parse() instead of crypto.createPublicKey()?
- Is there a security justification comment (trust chain)?
- Does it validate azp claim after decode?
- Does it fall through to HS256 for session tokens?

### Search: Duplicate JWT Validation Functions
```bash
find . -path "*/lib/jwt.ts" -o -path "*/lib/auth/token-manager.ts"
grep -n "function verifyAccessToken\|export.*verifyAccessToken" lib/jwt.ts lib/auth/token-manager.ts 2>/dev/null
```

**Questions to answer**:
- Do BOTH lib/jwt.ts AND lib/auth/token-manager.ts exist?
- Do both have verifyAccessToken functions?
- Are the implementations consistent (same RS256 + azp logic)?
- Is there a comment warning about duplication?
- Do they both support expectedClientId parameter?

### Search: azp Claim Client Binding
```bash
grep -r "azp.*claim\|expectedClientId\|authorized.*party" --include="*.js" --include="*.ts" -B3 -A8 . | grep -v node_modules | head -100
```

**Questions to answer**:
- Is azp claim validation implemented?
- Does it prevent token reuse across clients?
- Does it log "✅ azp claim validated"?
- Is it implemented in BOTH JWT files?
- What error message for mismatch?

### Search: Connection Pooling for Auth
```bash
grep -r "globalPrisma\|global\.prisma.*Prisma" --include="*.js" --include="*.ts" -B3 -A5 . | grep -v node_modules | head -80
```

**Questions to answer**:
- Is global Prisma client used for OAuth?
- Where is it defined (mcp-server-http-clean.js)?
- Which auth functions use globalPrisma?
- Are $disconnect() calls removed?
- How many locations (should be 3 for OAuth)?

### Search: RBAC Field Propagation
```bash
grep -r "mintMcpToken.*email\|mintMcpToken({" --include="*.js" --include="*.ts" \
  lib/auth/ lib/mcp/ lib/services/ mcp-server-http-clean.js -B 2 -A 12 2>/dev/null \
  | grep -v node_modules | head -80
```

**Questions to answer**:
- Does mintMcpToken include email and role parameters?
- Are all call sites passing email and role?
- Does getAuthUser extract email and role from JWT?
- Is RBAC filtering working (DEMO_USER sees demo POVs)?
- Is this documented as RBAC FIX in comments?

---


## Output Format — pointer (Phase 2 trim, 2026-06-11)

Report skeleton (Summary/Security Analysis/Recommendations/Migration Plan template) → library
§Phase 2. Findings reporting follows the standard specialist handover (see the specialist file).

## Pino Structured Logging for Auth Debugging (NEW - Feb 2026)

**Two logging systems coexist** — understand both:
- **pino** (domain loggers via `lib/logger.ts`): Server-side JSON output → PM2 JSON logs
- **OAuth audit logger** (`lib/auth/oauth/oauth-logger.ts`): Custom file logger → `/var/log/paichart/oauth-audit.log`

### Pino Domain Logger Discovery
```bash
echo "=== Pino Auth Domain Logger Usage ==="

# Find pino domain logger imports across auth code
echo "Domain logger imports in auth code:"
grep -rn "from.*lib/logger\|require.*lib/logger" lib/auth/ app/api/auth/ --include="*.ts" --include="*.js" | head -30

# authLogger usage (primary for auth debugging)
echo -e "\nauthLogger calls:"
grep -rn "authLogger\.\(info\|warn\|error\|debug\)" lib/auth/ app/api/auth/ --include="*.ts" --include="*.js" | head -30

# apiLogger usage in auth API routes
echo -e "\napiLogger calls in auth routes:"
grep -rn "apiLogger\.\(info\|warn\|error\|debug\)" app/api/auth/ --include="*.ts" | head -20

# Verify correct pino API (object-first: logger.method({ key: val }, 'message'))
echo -e "\nPino API correctness check:"
grep -rn "authLogger\.\(info\|warn\|error\)(" lib/auth/ app/api/auth/ --include="*.ts" --include="*.js" | head -20

# Check for legacy console.log still in auth code (should be migrated to pino)
echo -e "\nLegacy console.log in auth code (should be zero):"
grep -rn "console\.\(log\|warn\|error\)" lib/auth/ app/api/auth/ --include="*.ts" --include="*.js" | grep -v node_modules | wc -l
```

**Questions to answer**:
- Which pino domain loggers are used in auth code (authLogger, apiLogger)?
- Is the pino object-first API used correctly?
- Are JWT operations, RBAC checks, and session events logged with structured context?
- Are there remaining console.log calls that should be migrated to pino?

### Production Pino Log Monitoring — Auth Domain
```bash
echo "=== Production Pino Logs — Auth Domain ==="

# pino auth domain — all recent entries
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | jq -r '[.time, .level, .msg] | @tsv'" 2>/dev/null | tail -30

# pino auth errors only (level 50 = error)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":50' | jq" 2>/dev/null | tail -20

# pino auth warnings (level 40 = warn) — permission denials, token issues
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":40' | jq" 2>/dev/null | tail -20

# JWT-specific pino logs
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | grep -i 'jwt\|token\|refresh' | jq" 2>/dev/null | tail -20

# Compare: OAuth audit log (separate system — NOT pino)
ssh <PROD_USER>@<PROD_HOST> "tail -20 /var/log/paichart/oauth-audit.log | jq '.action,.userId,.provider'" 2>/dev/null
```

**Questions to answer**:
- Are pino structured logs flowing for auth domain in production?
- Are JWT validation errors captured with structured context (userId, tokenType)?
- Do auth warnings include permission denial details (role, resource)?
- Are both pino and OAuth audit logs producing complementary output?

## Debugging Helpers

```bash
# Quick auth system check
echo "=== Auth System Quick Check ==="
protected_routes=$(grep -r "getAuthUser" app/api --include="*.ts" | wc -l)
total_routes=$(find app/api -name "route.ts" | wc -l)
echo "Route protection: $protected_routes/$total_routes"

# Find auth vulnerabilities
echo -e "\n=== Potential Vulnerabilities ==="
echo "Hardcoded secrets: $(grep -r "secret.*=.*['\"]" --include="*.ts" | grep -v ".env" | wc -l)"
echo "Plain console.log of tokens: $(grep -r "console.*token\|log.*password" --include="*.ts" | wc -l)"
echo "localStorage tokens: $(grep -r "localStorage.*token" --include="*.tsx" | wc -l)"

# Check specific route protection
check_route_auth() {
  route=$1
  echo -e "\n=== Checking $route ==="
  grep -n "getAuthUser\|authenticate\|requireAuth" "$route" || echo "❌ No auth found"
  grep -n "role.*check\|permission" "$route" || echo "⚠️  No role check"
}

# Usage: check_route_auth "app/api/pov/route.ts"

# Token security check
echo -e "\n=== Token Security ==="
grep -r "JWT_SECRET\|TOKEN_SECRET" .env.example || echo "❌ No JWT_SECRET in .env.example"
grep -r "httpOnly.*true" --include="*.ts" || echo "⚠️  No httpOnly cookies found"
grep -r "secure.*true" --include="*.ts" | grep -i cookie || echo "⚠️  No secure cookie flag"

# RBAC implementation check
echo -e "\n=== RBAC Implementation ==="
for role in USER ADMIN SUPER_ADMIN; do
  count=$(grep -r "role.*===.*['\"]$role['\"]" --include="*.ts" | wc -l)
  echo "$role checks: $count"
done

# Find all auth-related files
echo -e "\n=== Auth File Locations ==="
find . -name "*auth*" -type f | grep -E "\.(ts|tsx|js)$" | grep -v node_modules | sort
```

## Deliverables

1. **Auth Architecture Diagram** - Visual flow of authentication/authorization
2. **Security Audit Report** - Vulnerabilities with CVSS scores
3. **RBAC Permission Matrix** - Complete role/resource mapping
4. **Route Protection Audit** - Every route with auth status
5. **Token Security Analysis** - Lifecycle, storage, transmission
6. **Compliance Checklist** - OWASP/industry standards
7. **Auth Migration Guide** - Step-by-step security improvements
8. **MCP Auth Documentation** - How MCP authentication works
9. **Incident Response Plan** - What to do on auth breach
10. **Auth Testing Suite** - Security test scenarios

---

## Team Authorization Pattern Discovery ⭐ NEW 2025-11-02

**Purpose**: Discover usage of team management authorization helper and identify anti-patterns
**Source**: PROJECT_MANAGER authorization implementation (Week 6)
**Helper**: `/lib/pov/auth/team-authorization.ts`

### Team Authorization Helper Usage

```bash
# Find all endpoints using canManageTeamMembers helper
echo "=== Team Authorization Helper Usage ==="
grep -rn "canManageTeamMembers" app/api/pov/ lib/pov/ --include="*.ts" -B 5 -A 10

# Expected: 5 endpoints
# 1. POST /api/pov/[povId]/team/members
# 2. DELETE /api/pov/[povId]/team/members/[memberId]
# 3. PUT /api/pov/[povId]/team/members/[memberId]
# 4. POST /api/pov/[povId]/team/members/batch
# 5. GET /api/pov/[povId]/team/available

# Count usage
echo "Total canManageTeamMembers calls: $(grep -r "canManageTeamMembers" app/api/pov/ lib/pov/ --include="*.ts" | wc -l)"
```

### Find Anti-Pattern 1: Inline Team Auth (Should Use Helper)

```bash
# Find inline owner/admin checks that might be team-related
echo "=== Inline Owner/Admin Checks (potential anti-pattern) ==="
grep -rn "isOwner.*isAdmin\|ownerId.*userId.*ADMIN" app/api/pov/ lib/pov/ \
  --include="*.ts" | grep -v "canManageTeamMembers" | grep -i "team\|member"

# If results found: Consider replacing with canManageTeamMembers helper
# Pattern to replace:
#   const isOwner = pov.ownerId === user.userId;
#   const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
#   if (!isOwner && !isAdmin) return 403;
```

### Find Anti-Pattern 2: checkPermission for Team Operations

```bash
# Find checkPermission used for team operations (might be too broad)
echo "=== CheckPermission for Team Operations (potential anti-pattern) ==="
grep -rn "checkPermission" app/api/pov/ lib/pov/ --include="*.ts" -A 5 -B 5 | \
  grep -i "team\|member" -B 5 -A 5

# Issue: checkPermission(ResourceAction.EDIT) blocks DEMO_USER even if PROJECT_MANAGER
# Solution: Replace with canManageTeamMembers for team operations
```

### Verify POV Queries Include Team Members

```bash
# Helper requires pov.team.members - verify all calls include it
echo "=== POV Queries for Team Auth (must include team.members) ==="

# Find POV queries in team-related endpoints
for file in app/api/pov/*/team/**/*.ts lib/pov/handlers/team.ts; do
  if [ -f "$file" ]; then
    echo "File: $file"
    grep -n "prisma.pOV.findUnique" "$file" -A 15 | grep -E "team:|members:" || echo "  ⚠️ No team.members included!"
  fi
done

# All should show: team: { include: { members: true } }
```

### Find PROJECT_MANAGER Restriction Enforcement

```bash
# Verify all 3 restrictions are enforced
echo "=== PROJECT_MANAGER Restriction Checks ==="

# Check helper has all 3 restrictions
echo "Restriction 1 (Cannot remove PMs):"
grep -n "Cannot remove.*PROJECT_MANAGER\|remove.*Project Manager" \
  lib/pov/auth/team-authorization.ts

echo "Restriction 2 (Cannot promote to PM):"
grep -n "Cannot.*assign.*PROJECT_MANAGER\|assign.*Project Manager" \
  lib/pov/auth/team-authorization.ts

echo "Restriction 3 (Cannot change own role):"
grep -n "Cannot change.*own role\|change your own role" \
  lib/pov/auth/team-authorization.ts

# Expected: All 3 restrictions present in helper
```

### Team Authorization Coverage Audit

```bash
# Complete audit of team authorization coverage
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║ TEAM AUTHORIZATION COVERAGE AUDIT                              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

echo ""
echo "=== Endpoints Using Helper (Expected: 5) ==="
grep -l "canManageTeamMembers" app/api/pov/*/team/**/*.ts lib/pov/handlers/team.ts 2>/dev/null | wc -l

echo ""
echo "=== Inline Team Auth Without Helper (Should be 0) ==="
grep -rn "isOwner.*isAdmin" app/api/pov/*/team/ lib/pov/handlers/team.ts \
  --include="*.ts" 2>/dev/null | grep -v "canManageTeamMembers" | wc -l

echo ""
echo "=== CheckPermission for Team (Should be 0) ==="
grep -rn "checkPermission" lib/pov/handlers/team.ts app/api/pov/*/team/ \
  --include="*.ts" 2>/dev/null | grep -v "import" | wc -l

echo ""
echo "Coverage Summary:"
echo "✅ All team endpoints use helper: [CHECK ABOVE]"
echo "✅ No inline duplication: [CHECK ABOVE]"
echo "✅ No checkPermission anti-pattern: [CHECK ABOVE]"
```

### Authorization Error Message Consistency

```bash
# Verify all team endpoints return consistent error messages
echo "=== Team Authorization Error Messages ==="

# Should all say "Only POV owner, site admin, or Project Manager can..."
grep -rn "error.*owner.*admin.*Project Manager\|error.*owner.*Project Manager" \
  app/api/pov/*/team/ lib/pov/handlers/team.ts --include="*.ts"

# Find any team errors NOT using helper message
grep -rn "error.*team.*member\|error.*manage.*team" \
  app/api/pov/*/team/ --include="*.ts" | grep -v "canManageTeamMembers"

# Expected: All errors come from helper (consistent messaging)
```

---

## Success Criteria

- ✅ All routes have appropriate authentication
- ✅ RBAC consistently enforced across all layers
- ✅ No hardcoded secrets or tokens
- ✅ Token lifecycle properly managed
- ✅ Security headers implemented
- ✅ Audit logging captures all auth events
- ✅ Rate limiting prevents brute force
- ✅ CORS properly configured
- ✅ Session security hardened
- ✅ MCP authentication documented and secure
## Task Action Authorization Discovery (NEW - 2025-10-16)

### MCP Task Action Route Authorization Audit

**Context**: Discovered systemic vulnerability where 11 of 13 task actions had no authorization.

```bash
echo "=== Task Action Authorization Coverage ==="
echo "NOTE: Handlers extracted Dec 17-18, 2025 to lib/mcp/tasks/action/handlers/"

# Count validatePOVAccess usage in extracted task action handlers
echo "validatePOVAccess calls in extracted handlers:"
grep -r "validatePOVAccess" lib/mcp/tasks/action/handlers/ | wc -l

# Also check the route facade (should only have import)
echo "validatePOVAccess in route facade:"
grep -c "validatePOVAccess" app/api/mcp/tasks/action/route.ts

# Find all task action handler modules (post-extraction)
echo -e "\nTask action handler modules:"
find lib/mcp/tasks/action/handlers/ -name "*-handler.ts" | wc -l

# Expected: 15 handler modules (extracted Dec 17-18)

# Check each handler module has authorization
echo -e "\nAuthorization coverage per handler:"
for handler in lib/mcp/tasks/action/handlers/**/*-handler.ts; do
  handler_name=$(basename "$handler")
  has_auth=$(grep -c "validatePOVAccess\|isDemo\|DEMO_USER" "$handler")
  if [ "$has_auth" -gt 0 ]; then
    echo "  ✅ $handler_name: Protected ($has_auth checks)"
  else
    echo "  ⚠️  $handler_name: Review needed (0 checks found)"
  fi
done

# Verify POV context is fetched correctly in extracted handlers
echo -e "\nPOV context fetching patterns:"
grep -r "pov: {" lib/mcp/tasks/action/handlers/ | wc -l

# Check metadata is included (required for DEMO_USER validation)
echo "POV metadata inclusions in handlers:"
grep -r "metadata: true" lib/mcp/tasks/action/handlers/ | wc -l

# Check team members are included (required for team validation)
echo "Team member inclusions in handlers:"
grep -r "members: {" lib/mcp/tasks/action/handlers/ | wc -l

# Find legacy permission checks (should be migrated)
echo -e "\nLegacy permission checks in extracted handlers:"
grep -rn "checkTaskCommentPermission\|checkPermission" lib/mcp/tasks/action/handlers/

# Verify security audit logging in extracted handlers
echo -e "\nSecurity audit log contexts:"
grep -r "logContext:" lib/mcp/tasks/action/handlers/ | wc -l

# Expected: 11+ log contexts (one per protected action)
```

### REST API validatePOVAccess Coverage

```bash
echo "=== validatePOVAccess Usage Across Codebase ==="

# Find all files using validatePOVAccess
echo "Files using validatePOVAccess:"
grep -r "validatePOVAccess" --include="*.ts" --include="*.js" app/ lib/ | cut -d: -f1 | sort -u | wc -l

# Expected: 15+ files (14 REST + 1 MCP task action route)

# List specific usage
echo -e "\nValidatePOVAccess usage by file:"
grep -r "validatePOVAccess" --include="*.ts" app/ lib/ | cut -d: -f1 | sort | uniq -c | sort -rn

# Check for inconsistent patterns (inline vs utility)
echo -e "\nInline DEMO_USER checks (should use validatePOVAccess):"
grep -r "user.role === 'DEMO_USER'" --include="*.ts" app/api | wc -l

# Expected: 2 (agent.results, analytics.generate - reference implementations)
# If > 2: May have missed some during refactor

# Verify all POV operations are protected
echo -e "\nPOV modification endpoints:"
find app/api/pov -name "route.ts" -exec grep -l "prisma.*update\|prisma.*create" {} \; | wc -l

echo "POV endpoints with validatePOVAccess:"
find app/api/pov -name "route.ts" -exec grep -l "validatePOVAccess" {} \; | wc -l

# These should match - all POV modifications should have authorization
```

### Authorization Gap Detection

```bash
echo "=== Authorization Gap Detection ==="
echo "NOTE: Handlers extracted Dec 17-18, 2025 to lib/mcp/tasks/action/handlers/"

# Find all MCP action handler modules
echo "MCP action handler modules:"
find lib/mcp/tasks/action/handlers/ -name "*-handler.ts" | wc -l

# Find handlers without authorization
echo -e "\nAuthorization coverage per extracted handler:"
for handler in lib/mcp/tasks/action/handlers/**/*-handler.ts; do
  handler_name=$(basename "$handler")
  has_auth=$(grep -c "validatePOVAccess\|isDemo\|DEMO_USER" "$handler")

  if [ "$has_auth" -eq 0 ]; then
    echo "  ⚠️ No auth found: $handler_name"
  else
    echo "  ✅ Protected: $handler_name ($has_auth checks)"
  fi
done

# Check for database operations without authorization
echo -e "\nDatabase modifications in handlers (should all have auth):"
grep -rn "prisma.*update\|prisma.*create\|prisma.*delete" lib/mcp/tasks/action/handlers/ | head -20

# Verify each handler has preceding validatePOVAccess
echo -e "\nHandlers with DB writes but no validatePOVAccess:"
for handler in lib/mcp/tasks/action/handlers/**/*-handler.ts; do
  has_write=$(grep -c "prisma.*update\|prisma.*create\|prisma.*delete" "$handler")
  has_auth=$(grep -c "validatePOVAccess" "$handler")
  if [ "$has_write" -gt 0 ] && [ "$has_auth" -eq 0 ]; then
    echo "  ⚠️ $(basename $handler): $has_write writes, no auth"
  fi
done
```

### DEMO_USER Pattern Verification

```bash
echo "=== DEMO_USER Access Pattern Verification ==="

# Find all metadata.isDemo checks
echo "isDemo checks across codebase:"
grep -r "metadata.*isDemo\|isDemo.*true" --include="*.ts" app/ lib/ | wc -l

# Expected: 17+ locations (validatePOVAccess + inline checks)

# Verify consistency
echo -e "\nDEMO_USER role checks:"
grep -r "role === 'DEMO_USER'\|role === UserRole.DEMO_USER" --include="*.ts" app/ lib/ | wc -l

# Check for missing metadata in POV fetches (search extracted handlers)
echo -e "\nPOV fetches without metadata (potential DEMO_USER gaps):"
for handler in lib/mcp/tasks/action/handlers/**/*-handler.ts; do
  handler_name=$(basename "$handler")
  has_pov=$(grep -c "pov: {" "$handler")
  has_metadata=$(grep -c "metadata: true\|metadata:" "$handler")

  if [ "$has_pov" -gt 0 ] && [ "$has_metadata" -eq 0 ]; then
    echo "  ⚠️ $handler_name: POV fetch without metadata"
  fi
done
```

---

## Wave 6 Update — Auth Patterns Across Extracted Route Files (May 21, 2026)

Wave 6 Phases 6.2-6.5 (commits `7ace95b7` → `3e9aec51`) extracted ALL 12 routes from `mcp-server-http-clean.js:setupRoutes()` into `lib/mcp/server/routes/*.ts`. Auth-relevant patterns the auth-permissions-specialist must know:

### 1. D11 LOCKED INVARIANT — OAuth callback audience (Plan v2)

OAuth callback flow (R7 → R8 → R9) audience is ALWAYS:

```
audience = requestedResource || MCP_FRONTDOOR_AUDIENCE   (front-door audience = `${PUBLIC_BASE_URL}/mcp`)
```

Since 2026-09-04 (D4) the front-door string is DERIVED from `APP_BASE_URL` in `lib/auth/public-base-url.ts`
and imported from the AUTH layer (never from audience-policy — an import from there would breach the boundary
the lock defends). Three legs carry the lock: `oauth-flow-routes.ts` R7 (`:429`-ish) and R9 (`:962`-ish), and the
Microsoft authorize path in `mcp-server-http-clean.js` (`resource || MCP_FRONTDOOR_AUDIENCE`). Pinned by
`test:security-invariants` (count = 2 in oauth-flow-routes + 1 in clean.js; no audience-policy import).

This is **NOT** `audienceForService()` (per-service audience helper at `lib/mcp/server/tools/hub/audience-policy`). Per-service audiences are OUTBOUND-MINT-ONLY (called from MCP tool handlers when forwarding to downstream services). The OAuth callback path mints front-door tokens for AI clients (Claude Desktop, ChatGPT, Gemini, Claude Code).

Documented in the `oauth-flow-routes.ts` file-header. **DO NOT** "tidy" R7 `requestedResource: resource || MCP_FRONTDOOR_AUDIENCE` or R9 `requestedAudience = storedAudience || MCP_FRONTDOOR_AUDIENCE` into per-service helper calls.

### 2. D13 R10 sibling-classifier SYNC warning

`registerR10Register` in `oauth-flow-routes.ts` has an INLINE client classifier (operates on `redirect_uris[]` + `client_name`) that is a documented sibling of `AuthManager.detectOAuthClient` (operates on a single `redirect_uri`). The file-header docstring carries the SYNC WARNING; `scripts/test-routes-oauth-flow.ts` Tests 26-29 are fixture-based equivalence tests across 4 baseline URIs.

**Maintenance contract**: When adding/removing a pattern in `AuthManager.CLIENT_PROVIDER_MAP`, audit R10's inline classifier too. Phase 3.8b deferred consolidation per Claude-Desktop-first prioritization.

### 3. C6 inner-closure auth pattern in R12 (sec-ops)

`registerR12GetSSE` in `mcp-transport-routes.ts` invokes `authMiddleware` **INSIDE** the route handler (not in the Express chain), gated by a ChatGPT-discovery branch that runs WITHOUT auth. This is **load-bearing** — moving authMiddleware to the chain breaks ChatGPT manifest discovery.

R11 uses the standard chain-auth pattern (`app.post('/mcp', authMiddleware, ...)`); R12 uses inner-closure. Test 3 in `scripts/test-routes-mcp-transport.ts` is the critical assertion: `GET /mcp` no-auth + non-ChatGPT UA → 401 from inner closure (proves NO SSE-establishment bypass).

### 4. U2 Phase E.8 client_id mismatch enforcement preserved

`registerR9Token` in `oauth-flow-routes.ts` preserves the cross-client refresh attack defense verbatim (RFC 6749 §6): refresh tokens issued to Client A cannot be used by Client B. Search `refresh client_id mismatch` in `oauth-flow-routes.ts`.

### 5. New file locations for auth-related routes

| Concern | Old (pre-Wave-6) | New (post-Wave-6) |
|---|---|---|
| RFC 6750 401 trigger (B2) | mcp-server-http-clean.js inline | `lib/mcp/server/routes/oauth-flow-routes.ts:registerB2UnauthInitializeMiddleware` |
| OAuth authorize/callback/token/register | mcp-server-http-clean.js inline | `lib/mcp/server/routes/oauth-flow-routes.ts:registerR7Authorize/R8Callback/R9Token/R10Register` |
| MCP main handler + SSE (R11, R12) | mcp-server-http-clean.js inline | `lib/mcp/server/routes/mcp-transport-routes.ts:registerR11Post/R12GetSSE` |
| JWKS endpoint (R3) | mcp-server-http-clean.js inline | `lib/mcp/server/routes/oauth-discovery-routes.ts:registerJWKSEndpoint` |
| `/mcp` Link header middleware (B1) | mcp-server-http-clean.js inline | `lib/mcp/server/routes/oauth-discovery-routes.ts:registerLinkHeaderMiddleware` |

`createAuthMiddleware` factory still lives at `lib/auth/oauth/auth-manager.ts:createMiddleware` (Wave 4); R11/R12 grab the wrapper via `ctx.getAuthMiddleware()`.