# OAuth Token Refresh System Discovery Task

> ⚠️ **SUPERSEDED 2026-06-28 on the storage axis.** This doc planned the v2.2 **in-memory** refresh design.
> MCP refresh tokens are now **DB-persisted in `RefreshToken` (`provider:'mcp'`) + sha256-hashed at rest**
> (survives pm2 reload); web refresh tokens are hashed at rest too. References below to "in-memory Map" /
> "keyed by user ID" describe the old design. Current design + rationale:
> `cline_docs/reviews/mcp-refresh-token-persistence-2026-06-28/` (6-specialist-reviewed). The flow-mapping
> (PKCE, token exchange, providers) below is still useful; the storage answers are stale.

**Last Updated**: 2025-10-13
**Status**: SUPERSEDED on storage (see banner) — flow-mapping still valid
**Confidence**: High - Comprehensive analysis for v2.2 implementation (in-memory storage)
**Last Validated**: 2025-10-13 - Initial discovery run

## Objective

Perform comprehensive discovery of the OAuth authentication and token management system in pAIchart to prepare for implementing automatic token refresh with in-memory storage, background refresh service, and proactive token renewal.

## Context

The pAIchart MCP Hub currently uses OAuth 2.0 authentication with Microsoft, Google, and GitHub providers. Desktop clients (Claude Desktop, ChatGPT) require automatic token refresh to eliminate daily re-authentication. This discovery maps the complete OAuth flow, token storage patterns, server integration points, and identifies implementation risks for the v2.2 plan (in-memory storage with 8-10 hour implementation timeline).

## Discovery Scope

### 1. OAuth Flow Architecture
- [ ] Trace complete OAuth flow from initiation to callback
- [ ] Document PKCE implementation (in-memory storage pattern at line 389)
- [ ] Map token exchange process and error handling
- [ ] Identify where tokens are created and stored
- [ ] Document JWT token generation for MCP authentication

### 2. Token Lifecycle Management
- [ ] Where are OAuth tokens currently stored? (in-memory vs database)
- [ ] How long do access tokens live? (currently 3600s)
- [ ] Where are refresh tokens stored? (if at all)
- [ ] Token retrieval patterns across the codebase
- [ ] Token expiration handling (current vs desired state)

### 3. Server Integration Points
- [ ] How does `server.ts` initialize OAuth services?
- [ ] How does `mcp-server-http-clean.js` use OAuth tokens?
- [ ] Where would middleware be inserted for token refresh?
- [ ] Server startup sequences and OAuth service initialization
- [ ] Session management patterns (persistent vs stateless)

### 4. MCP Authentication Flow
- [ ] How does MCP server validate OAuth tokens?
- [ ] Where in request lifecycle does authentication occur?
- [ ] How are tokens passed to MCP requests?
- [ ] User context propagation patterns
- [ ] Authentication middleware architecture

### 5. Provider-Specific Patterns
- [ ] GitHub OAuth flow and token expiry (6 months for refresh tokens)
- [ ] Microsoft OAuth flow and token expiry (90 days for refresh tokens)
- [ ] Google OAuth flow and token expiry (6 months for refresh tokens)
- [ ] Provider refresh token API endpoints
- [ ] Refresh token rotation support by provider

### 6. Edge Cases & Integration Challenges
- [ ] Concurrent OAuth requests handling
- [ ] Token expiry during active MCP session
- [ ] Multiple client connections for same user
- [ ] Server restart behavior with OAuth sessions
- [ ] Race conditions in token refresh

### 7. Existing Refresh Infrastructure
- [ ] Is there any existing token refresh logic?
- [ ] What patterns exist in oauth-service.ts line 453+?
- [ ] How does the current refreshOAuthToken method work?
- [ ] Error handling for failed refreshes
- [ ] Retry logic for provider failures

## Search Strategies

### 1. Core OAuth Service Discovery
```bash
# Primary OAuth service file
cat -n /home/steve/copov15/lib/auth/oauth/oauth-service.ts | head -100

# OAuth configuration
cat -n /home/steve/copov15/lib/auth/oauth/oauth-config.ts

# Find all OAuth-related imports
grep -r "import.*oauth" --include="*.ts" --include="*.js" /home/steve/copov15/lib /home/steve/copov15/app/api -B 1 -A 1

# OAuth service instantiation
grep -r "oauthService\|OAuthService" --include="*.ts" --include="*.js" /home/steve/copov15 -l | head -20
```

### 2. Token Storage Patterns
```bash
# Find in-memory storage patterns (like PKCE)
grep -r "Map<.*token\|storage.*token" --include="*.ts" --include="*.js" /home/steve/copov15/lib/auth -B 2 -A 5

# Find existing token storage
grep -r "pkceStorage\|tokenStorage" --include="*.ts" /home/steve/copov15/lib/auth -n -B 2 -A 5

# Look for session storage patterns
# Note: Phase 2.x (May 2026) consolidated session storage into SessionStore class.
# Authoritative location: lib/auth/oauth/session-store.ts. Callers use this.sessionStore.*.
grep -rn "sessionStore\.\(setSession\|getTransport\|getContext\|hasSession\|deleteSession\)" /home/steve/copov15/mcp-server-http-clean.js /home/steve/copov15/lib/auth/oauth/session-store.ts -B 2 -A 5

# Find token retrieval patterns
grep -r "getToken\|retrieveToken\|findToken" --include="*.ts" /home/steve/copov15/lib/auth -n
```

### 3. Token Refresh Logic Discovery
```bash
# Find existing refresh methods
grep -r "refreshOAuthToken\|refreshToken\|refresh_token" --include="*.ts" /home/steve/copov15/lib/auth -n -B 5 -A 10

# Find provider refresh endpoints
grep -r "endpoints.*token\|token.*endpoint" --include="*.ts" /home/steve/copov15/lib/auth/oauth -n -A 3

# Look for expiry checking
grep -r "expiresAt\|expiresIn\|expires_in\|isExpired" --include="*.ts" /home/steve/copov15/lib/auth -n -B 2 -A 2

# Token validation patterns
grep -r "validateToken\|verifyToken\|checkToken" --include="*.ts" /home/steve/copov15/lib/auth -n
```

### 4. Server Integration Discovery
```bash
# Server startup sequence
cat -n /home/steve/copov15/server.ts | head -100

# MCP server initialization
grep -r "setupAuth\|initializeAuth\|setupMCPServer" --include="*.js" /home/steve/copov15 -n -B 3 -A 10

# Middleware patterns
ls -la /home/steve/copov15/lib/auth/*middleware* | head -10
cat -n /home/steve/copov15/lib/auth/enhanced-auth-middleware.ts | head -50

# OAuth validator usage
grep -r "MCPOAuthValidator\|verifyOAuthToken" --include="*.js" --include="*.ts" /home/steve/copov15 -n -B 2 -A 5
```

### 5. MCP Request Flow Analysis
```bash
# Note: Wave 6 Phase 6.4-6.5 (May 21, 2026) — route bodies moved from
# mcp-server-http-clean.js to lib/mcp/server/routes/*.ts. Grep both locations
# during transition; the server class now contains only the orchestrator
# delegation (_buildRouteContext + 4 register*Routes calls).

# MCP authentication middleware (createMiddleware factory lives on AuthManager;
# wrapper lazy-init at lib/auth/oauth/auth-manager.ts; R11/R12 grab it from ctx)
grep -rn "createAuthMiddleware\|authMiddleware" /home/steve/copov15/lib/auth/oauth/auth-manager.ts /home/steve/copov15/lib/mcp/server/routes/mcp-transport-routes.ts /home/steve/copov15/mcp-server-http-clean.js -B 5 -A 15

# User context propagation
grep -rn "setUserContext\|req.user\|user context" /home/steve/copov15/lib/mcp/server/routes/mcp-transport-routes.ts /home/steve/copov15/mcp-server-http-clean.js -A 5

# Token passing patterns (R11/R12 + B2 handle Authorization header inspection)
grep -rn "Authorization.*Bearer\|x-api-key" /home/steve/copov15/lib/mcp/server/routes/mcp-transport-routes.ts /home/steve/copov15/lib/mcp/server/routes/oauth-flow-routes.ts /home/steve/copov15/mcp-server-http-clean.js -B 3 -A 3

# Session management (Phase 2.x SessionStore lives at lib/auth/oauth/session-store.ts;
# R11/R12 read via ctx.sessionStore.{hasSession,getTransport,getContext})
grep -rn "sessionId\|sessionStore\.\(getTransport\|getContext\|hasSession\)" /home/steve/copov15/lib/mcp/server/routes/mcp-transport-routes.ts /home/steve/copov15/mcp-server-http-clean.js | head -30
```

### 6. API Route Discovery
```bash
# OAuth callback routes
find /home/steve/copov15/app/api/auth/oauth -name "route.ts" -o -name "*.ts"

# OAuth initiation endpoints
ls -R /home/steve/copov15/app/api/auth/oauth/

# Token refresh endpoint (if exists)
find /home/steve/copov15/app/api/auth -name "*refresh*" -o -name "*token*"

# List all auth API routes
ls -R /home/steve/copov15/app/api/auth/ | head -50
```

### 7. Database Schema Discovery
```bash
# Find User model with OAuth fields
grep -A 50 "model User" /home/steve/copov15/prisma/schema.prisma | grep -i "oauth\|token"

# Check for existing token storage fields
grep -B 2 -A 2 "oauthAccessToken\|oauthRefreshToken\|oauthToken" /home/steve/copov15/prisma/schema.prisma

# User authentication fields
grep -B 5 -A 10 "oauthProvider\|oauthProviderId" /home/steve/copov15/prisma/schema.prisma
```

### 8. Error Handling and Logging
```bash
# OAuth error patterns
grep -r "OAuth.*error\|OAuth.*failed\|OAuth.*catch" --include="*.ts" /home/steve/copov15/lib/auth/oauth -n -B 2 -A 5

# Token refresh failures
grep -r "refresh.*failed\|refresh.*error" --include="*.ts" /home/steve/copov15/lib/auth -n -A 3

# Console logging patterns
grep -r "console.log.*OAuth\|console.error.*OAuth" --include="*.ts" --include="*.js" /home/steve/copov15/lib/auth -n | head -20

# Existing audit logging
ls -la /home/steve/copov15/lib/auth/audit.ts
```

### 9. Type Definitions Discovery
```bash
# OAuth types
cat -n /home/steve/copov15/lib/types/auth.ts | grep -A 20 "OAuthTokens\|OAuthUserInfo"

# Find all OAuth type references
grep -r "OAuthTokens\|OAuthUserInfo\|AuthResult" --include="*.ts" /home/steve/copov15/lib -n | head -20

# Token type definitions
grep -r "interface.*Token\|type.*Token" --include="*.ts" /home/steve/copov15/lib/types -n -A 5
```

### 10. Environment Configuration
```bash
# OAuth environment variables
grep -r "OAUTH\|GITHUB_CLIENT\|MICROSOFT_CLIENT\|GOOGLE_CLIENT" /home/steve/copov15/.env.example 2>/dev/null

# JWT signing config — RS256-only since 2026-05-28; the symmetric secrets are RETIRED
# (JWT_SECRET 2026-06-04, JWT_ACCESS_SECRET 2026-06-06). Expect only retired-comments + scripts/archive:
grep -r "JWT_ACCESS_SECRET\|JWT_SECRET" /home/steve/copov15 --include="*.ts" --include="*.js" -n | grep -v node_modules | head -10
# Live signing material is RS256: JWT_PRIVATE_KEY_BASE64 / JWT_PUBLIC_KEY_BASE64 / JWT_KEY_ID (getCurrentKid())

# Token timeout configuration
grep -r "expiresIn.*24h\|OAUTH.*TIMEOUT" /home/steve/copov15 --include="*.ts" -n
```

### 11. Testing Infrastructure
```bash
# Find OAuth tests
find /home/steve/copov15/__tests__ -name "*oauth*" -o -name "*auth*" -o -name "*token*" 2>/dev/null

# Mock patterns for OAuth
grep -r "mock.*oauth\|jest.*mock.*oauth" /home/steve/copov15/__tests__ -n 2>/dev/null

# Test coverage for token refresh
find /home/steve/copov15 -name "*.test.ts" -o -name "*.spec.ts" | xargs grep -l "refresh.*token" 2>/dev/null
```

### 12. Provider API Documentation References
```bash
# GitHub OAuth documentation references
grep -r "github.*oauth.*doc\|github.*api.*doc" /home/steve/copov15 --include="*.md" -i

# Microsoft OAuth references
grep -r "microsoft.*oauth\|azure.*oauth" /home/steve/copov15 --include="*.md" -i

# Google OAuth references
grep -r "google.*oauth\|gcp.*oauth" /home/steve/copov15 --include="*.md" -i
```

### 13. Concurrent Access Patterns
```bash
# Lock patterns
grep -r "lock\|mutex\|semaphore" --include="*.ts" /home/steve/copov15/lib/auth -n

# Race condition prevention
grep -r "Promise.all\|await.*Promise\|concurrent" --include="*.ts" /home/steve/copov15/lib/auth -n -A 3

# Transaction patterns
grep -r "transaction\|BEGIN\|COMMIT" --include="*.ts" /home/steve/copov15/lib -n | head -15
```

### 14. Performance and Monitoring
```bash
# Timing patterns
grep -r "Date.now()\|performance\|executionTime" --include="*.ts" /home/steve/copov15/lib/auth -n | head -15

# Request tracking
grep -r "requestId\|correlationId\|traceId" --include="*.ts" --include="*.js" /home/steve/copov15/lib/auth -n

# Health check endpoints
grep -r "/health\|/status" --include="*.ts" --include="*.js" /home/steve/copov15 -n | head -10
```

### 15. Validation Commands
```bash
# Verify OAuth service is instantiated correctly
echo "=== OAuth Service Health Check ==="
echo "1. OAuth service file exists: $([ -f /home/steve/copov15/lib/auth/oauth/oauth-service.ts ] && echo '✅ YES' || echo '❌ NO')"
echo "2. OAuth config file exists: $([ -f /home/steve/copov15/lib/auth/oauth/oauth-config.ts ] && echo '✅ YES' || echo '❌ NO')"
echo "3. PKCE storage pattern line 389: $(grep -n "pkceStorage = new Map" /home/steve/copov15/lib/auth/oauth/oauth-service.ts | cut -d: -f1)"
echo "4. Refresh token method line: $(grep -n "refreshOAuthToken" /home/steve/copov15/lib/auth/oauth/oauth-service.ts | head -1 | cut -d: -f1)"
echo "5. MCP OAuth validator exists: $([ -f /home/steve/copov15/lib/auth/oauth/mcp-oauth-validator.js ] && echo '✅ YES' || echo '❌ NO')"
```

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: OAuth Token Refresh System
═══════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: OAuth Flow Architecture
□ Section 2: Token Lifecycle Management
□ Section 3: Server Integration Points
□ Section 4: MCP Authentication Flow
□ Section 5: Provider-Specific Patterns
□ Section 6: Edge Cases & Integration Challenges
□ Section 7: Existing Refresh Infrastructure
□ Section 8: Component Inventory
□ Section 9: Data Flow Analysis
□ Section 10: Integration Point Mapping
□ Section 11: Security Assessment
□ Section 12: Performance Baseline

Current Status: 🚀 Starting Discovery
Commands: 0/X executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: OAuth Flow Architecture [██████████] 100%
   Commands: X/X | Found: PKCE in-memory storage at line 389
🔄 Section 2: Token Lifecycle [███░░░░░░░] 30%
   Commands: X/X | Analyzing token expiry patterns...
```

## Special Attention Areas

1. **In-Memory Storage Risk**: PKCE verifiers stored in-memory (line 389) - pattern to follow for token storage. Tokens lost on server restart.

2. **Token Rotation**: Some providers rotate refresh tokens on refresh. Need to handle both rotating and non-rotating scenarios.

3. **Provider Differences**: GitHub, Microsoft, and Google have different refresh token lifetimes (6 months, 90 days, 6 months).

4. **Race Conditions**: Multiple simultaneous token refreshes for same user must be prevented. Need Promise-based locking (in-memory).

5. **Session Management**: MCP server uses both persistent (Claude Desktop) and stateless (Claude.ai browser) modes. Token refresh must work for both.

6. **JWT Expiry**: Current JWT tokens expire in 24h (line 146). Refresh should proactively renew 10 minutes before expiry.

7. **Server Restart**: In-memory token storage means tokens are lost on restart. Users must re-authenticate. This is acceptable per v2.2 plan.

8. **Circuit Breaker**: Need circuit breaker pattern to prevent cascade failures when provider APIs are down.

9. **Log Injection**: Provider error messages must be sanitized before logging to prevent XSS/log injection attacks.

10. **Performance**: Background service must use indexed queries (not applicable for in-memory, but relevant for future database upgrade).

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact |
|------|----------|------------|---------|
| Server restart loses all tokens | High | High | Users must re-authenticate after restarts |
| Provider rate limits | Medium | Medium | Circuit breaker prevents cascade failures |
| Concurrent refresh attempts | Medium | High | Promise-based locking prevents race conditions |
| Token refresh fails silently | High | Medium | File audit logs catch failures, alerting needed |
| PKCE verifiers lost on restart | Low | High | User retries OAuth flow, minor inconvenience |
| Provider API downtime | Medium | Low | Circuit breaker stops retry attempts, graceful degradation |
| Log injection from provider errors | High | Low | Input sanitization prevents XSS attacks |
| Memory leak from stale tokens | Medium | Medium | Periodic cleanup removes expired tokens |
| Multiple clients per user | Medium | Medium | Each client gets own token, no sharing needed |
| Token rotation confusion | Low | Medium | Handle both rotating and non-rotating providers |

## Expected Outputs

### 1. OAuth Flow Map
```markdown
## Complete OAuth Flow

### Initiation (oauth-service.ts:50-95)
1. User clicks OAuth provider button
2. Service generates state parameter with CSRF protection (line 67)
3. Service generates PKCE code verifier + challenge (lines 71-72)
4. Service stores PKCE verifier in-memory Map (line 75)
5. Service redirects to provider authorization URL (line 94)

### Callback (oauth-service.ts:100-172)
1. Provider redirects to callback route with code + state
2. Service validates state parameter (line 108)
3. Service retrieves PKCE verifier from in-memory Map (line 117)
4. Service exchanges code for tokens (line 123)
5. Service gets user info from provider API (line 126)
6. Service creates/updates user in database (line 129)
7. Service generates internal JWT token (lines 132-147)
8. Service returns JWT + OAuth refresh token (lines 151-163)

### Token Storage (Current)
- **PKCE Verifiers**: In-memory Map (line 389), expires 15 minutes
- **OAuth Tokens**: NOT STORED (only passed through)
- **JWT Tokens**: Returned to client, expire 24h

### Token Storage (Planned v2.2)
- **OAuth Access Tokens**: In-memory Map, keyed by user ID
- **OAuth Refresh Tokens**: In-memory Map, keyed by user ID
- **Token Metadata**: expiresAt, refreshExpiresAt, lastRefreshed, refreshAttempts
```

### 2. Integration Point Map
```markdown
## MCP Server Integration (mcp-server-http-clean.js)

### Authentication Flow
1. **Request arrives** → Line 1202: POST /mcp endpoint
2. **Auth middleware** → Line 511: createAuthMiddleware()
3. **JWT verification** → `verifyAccessToken(token)` in `lib/auth/token-manager.ts` (Wave 3a U2 extraction)
4. **OAuth validation** → `oauthValidator.verifyOAuthToken(token)` in `lib/auth/oauth/mcp-oauth-validator.js`
5. **User context** → `req.user = { id, email, role, token, azp }` set by `AuthManager.populateReqUser` (Wave 3a/4 extraction; Phase 3.6 made authoritative)
6. **MCP processing** → `MCPCoreManager.processRequest(request, user)` at `lib/mcp/server/mcp-core.ts` (Wave 7 Phase 7.2 extraction from server-class processMCPRequest)

### Token Refresh Middleware Insertion Points
- **Option A**: Within `AuthManager.createMiddleware()` in `lib/auth/oauth/auth-manager.ts` (Wave 4 extraction) after JWT fails
- **Option B**: In `MCPCoreManager.processRequest` (`lib/mcp/server/mcp-core.ts`) before tool execution — Wave 7 Phase 7.2 location
- **Recommended**: Option A (middleware) for non-blocking async refresh

### Session Management
- **Persistent sessions** (Claude Desktop): R11 (`lib/mcp/server/routes/mcp-transport-routes.ts:registerR11Post` — Wave 6 Phase 6.5) — `this.sessionStore.hasSession(sessionId)` gate, `getTransport()` reuse
- **Stateless sessions** (Claude.ai browser): `MCPCoreManager.handleStatelessRequest` (`lib/mcp/server/mcp-core.ts` — Wave 7 Phase 7.2) — `temporary:true` branch with try/finally cleanup (I-CROSS-10 fold)
- **Token context**: SessionStore.sessionContexts (`lib/auth/oauth/session-store.ts`) — `SessionContext` interface includes `userId`, `user.{id,email,role,token,azp,authMethod,scope,jti,permissions}`. Phase 2.x (May 2026).

### Server Startup (post-Wave-7 chain)
- `start()` in `mcp-server-http-clean.js` orchestrates lifecycle
- `setupAuth()` configures JWT verification (still on server class)
- `await this.authManager.initialize()` — AuthManager init (Wave 3a)
- `await this.mcpCore.init()` — MCPCoreManager backend init (Wave 7 Phase 7.1; replaced server-class `setupMCPServer()`)
- `await this.mcpCore.initializeAuthContext()` — seeds context from PAICHART_API_KEY env var (Wave 7 Phase 7.1; replaced server-class `initializeAuthContext()`)
- **Future**: Start token refresh background service here (likely between authManager.initialize and mcpCore.init)
```

### 3. Token Lifecycle Analysis
```markdown
## Token Lifecycle

### Access Token (OAuth Provider)
- **Issued**: During initial auth callback (oauth-service.ts:204)
- **Lifetime**: 3600 seconds (1 hour) - tokens.expires_in
- **Storage**: Currently NOT stored, v2.2 plans in-memory Map
- **Usage**: Passed in Authorization header for MCP requests
- **Refresh**: Provider refresh endpoint with refresh_token grant

### Refresh Token (OAuth Provider)
- **Issued**: During initial auth callback (oauth-service.ts:205)
- **Lifetime**:
  - GitHub: 6 months (estimate)
  - Microsoft: 90 days (line 176 in plan)
  - Google: 6 months (estimate)
- **Storage**: Currently NOT stored, v2.2 plans in-memory Map
- **Usage**: Exchange for new access token when expired
- **Rotation**: Some providers rotate, others reuse (line 485-486)

### JWT Token (Internal)
- **Issued**: After OAuth success (oauth-service.ts:132-147)
- **Lifetime**: 24 hours (line 146)
- **Storage**: Client-side only (returned to client)
- **Usage**: MCP authentication, verified by mcp-server-http-clean.js
- **Refresh**: NOT refreshed, but OAuth token refresh allows JWT regeneration

### Token Refresh Flow (Planned)
1. Background service checks Map every 5 minutes
2. Find tokens expiring within 10 minutes
3. Call refreshOAuthToken(userId, provider)
4. Exchange refresh_token for new access_token
5. Update token in Map with new expiresAt
6. Log refresh event to audit file
7. If refresh fails, increment refreshAttempts counter
8. After 3 failures, mark token as expired
```

### 4. File Inventory
```markdown
## Critical Files for Token Refresh Implementation

### Core OAuth Services
- `/home/steve/copov15/lib/auth/oauth/oauth-service.ts` - Main OAuth service (lines 40-673)
  - Line 389: PKCE in-memory storage pattern (template for token storage)
  - Line 453: Existing refreshOAuthToken method (provider, refreshToken) → OAuthTokens
  - Line 283: createOrUpdateUser method (where tokens would be stored)

- `/home/steve/copov15/lib/auth/oauth/oauth-config.ts` - Provider configurations
  - Lines 39-95: Provider endpoint URLs including token refresh endpoints
  - Lines 153-168: OAuth scopes per provider

- `/home/steve/copov15/lib/auth/oauth/mcp-oauth-validator.js` - OAuth token validation
  - Used by MCP server for verifying tokens

### Server Integration
- `/home/steve/copov15/server.ts` - Main HTTP server
  - Line 89: initializeServer() - where token refresh service would start

- `/home/steve/copov15/mcp-server-http-clean.js` - MCP HTTP server (facade, 1013 LOC post-Wave-7)
  - `AuthManager.createMiddleware()` at `lib/auth/oauth/auth-manager.ts` (Wave 4 Phase 4.2) - token refresh middleware insertion point (was Line 511 pre-Wave-4)
  - `MCPCoreManager.processRequest()` at `lib/mcp/server/mcp-core.ts` (Wave 7 Phase 7.2) - user context with token (was Line 1632 pre-Wave-7)

### API Routes
- `/home/steve/copov15/app/api/auth/oauth/[provider]/route.ts` - OAuth initiation
- `/home/steve/copov15/app/api/auth/oauth/callback/[provider]/route.ts` - OAuth callback
- `/home/steve/copov15/app/api/auth/refresh/route.ts` - Existing refresh endpoint (if any)

### Types
- `/home/steve/copov15/lib/types/auth.ts` - OAuthTokens, OAuthUserInfo types

### Supporting Files
- `/home/steve/copov15/lib/auth/audit.ts` - Audit logging infrastructure
- `/home/steve/copov15/prisma/schema.prisma` - User model with OAuth fields
```

## Output Format

```markdown
# OAuth Token Refresh System Discovery Report

## Executive Summary
- **System Type**: OAuth 2.0 with PKCE flow for enterprise authentication
- **Providers**: Microsoft, Google, GitHub with dedicated OAuth apps
- **Current State**: JWT tokens expire 24h, OAuth tokens not stored, no automatic refresh
- **Architecture**: Next.js HTTP server + MCP HTTP server, single PM2 instance
- **Token Pattern**: In-memory PKCE storage (line 389) provides template for token storage

## Detailed Findings

### 1. OAuth Flow Architecture
- **Initiation**: Lines 50-95 in oauth-service.ts
- **PKCE Implementation**: In-memory Map storage (line 389), 15-minute expiry with cleanup
- **Token Exchange**: Lines 177-210, handles all 3 providers
- **User Creation**: Lines 283-333, creates/updates users with OAuth data
- **JWT Generation**: Lines 132-147, creates internal MCP authentication token

### 2. Token Lifecycle
- **Access Token Lifetime**: 3600 seconds (1 hour) from all providers
- **Refresh Token Lifetime**: Provider-specific (6 months GitHub/Google, 90 days Microsoft)
- **Current Storage**: No OAuth token storage, only PKCE verifiers in-memory
- **Token Passing**: JWT token returned to client, OAuth tokens discarded after callback

### 3. Server Integration
- **Main Server**: server.ts initializes services via initializeServer() (line 89)
- **MCP Server**: mcp-server-http-clean.js handles MCP requests with auth middleware
- **Auth Middleware**: Lines 511-636, validates JWT or OAuth tokens
- **User Context**: Stored in req.user, propagated to MCP request processing

### 4. MCP Authentication
- **Request Flow**: POST /mcp → auth middleware → verify token → process request
- **Token Verification**: JWT via verifyAccessToken() or OAuth via oauthValidator
- **User Context**: { id, email, role, token } attached to request
- **Session Types**: Persistent (Claude Desktop) and stateless (Claude.ai browser)

### 5. Provider Patterns
- **GitHub**:
  - Authorization: https://github.com/login/oauth/authorize
  - Token: https://github.com/login/oauth/access_token
  - Refresh tokens: 6 months (estimated)

- **Microsoft**:
  - Authorization: https://login.microsoftonline.com/common/oauth2/v2.0/authorize
  - Token: https://login.microsoftonline.com/common/oauth2/v2.0/token
  - Refresh tokens: 90 days

- **Google**:
  - Authorization: https://accounts.google.com/o/oauth2/v2/auth
  - Token: https://oauth2.googleapis.com/token
  - Refresh tokens: 6 months (estimated)

### 6. Integration Challenges
- **In-Memory Tokens**: Lost on server restart, users must re-authenticate
- **Concurrent Refresh**: Multiple simultaneous refreshes need locking (Promise-based)
- **Session Management**: Both persistent and stateless modes need token refresh
- **Provider Differences**: Token rotation varies by provider (line 485-486 handles both)

### 7. Existing Infrastructure
- **Refresh Method**: oauth-service.ts line 453-495, fully implemented
- **Error Handling**: Basic console logging, no structured audit trail
- **Provider API Calls**: Standard fetch with URLSearchParams for form encoding
- **Token Rotation**: Handled by falling back to old refresh token if new one not returned

## Recommendations

### Phase 0: Pre-Implementation (30 minutes)
1. ✅ **No Database Changes**: Use in-memory storage like PKCE pattern (line 389)
2. ✅ **No Encryption Needed**: Memory not persistent, tokens lost on restart is acceptable
3. ✅ **File-Based Logging**: Create oauth-logger.ts for audit trail (JSON format)

### Phase 1: OAuth Service Enhancement (2-3 hours)
1. **Add Token Storage Map** (similar to pkceStorage line 389):
   ```typescript
   private static tokenStorage = new Map<string, {
     userId: string;
     provider: string;
     accessToken: string;
     refreshToken: string;
     expiresAt: Date;
     refreshExpiresAt: Date;
     lastRefreshed: Date;
     refreshAttempts: number;
   }>();
   ```

2. **Update createOrUpdateUser()** (line 283) to store tokens in Map after callback
3. **Add Input Sanitization** for provider error messages (prevent log injection)
4. **Add Circuit Breaker** to stop retry attempts after 5 failures in 5 minutes
5. **Add Promise-Based Locking** to prevent concurrent refreshes

### Phase 2: Background Refresh Service (1.5-2 hours)
1. **Create token-refresh-service.ts** with background timer (every 5 minutes)
2. **Iterate tokenStorage Map** to find tokens expiring within 10 minutes
3. **Call refreshOAuthToken()** for expiring tokens with rate limiting (1/second)
4. **Log all refresh events** to oauth-audit.log (structured JSON)
5. **Handle failures** with exponential backoff and circuit breaker

### Phase 3: Server Integration (1 hour)
1. **Start refresh service** in server.ts initializeServer() (line 89)
2. **Add non-blocking middleware** in `lib/auth/oauth/auth-manager.ts:createMiddleware` (extracted Wave 4) — wire into R11/R12 via the existing `ctx.getAuthMiddleware()` lazy accessor in `lib/mcp/server/routes/mcp-transport-routes.ts`
3. **Queue async refreshes** if token expires soon, don't block request
4. **Health check endpoint** at /api/auth/oauth/health for monitoring

### Phase 4: Testing & Validation (2-3 hours)
1. **Unit tests** for sanitization, circuit breaker, concurrent refresh prevention
2. **Integration tests** for OAuth flow with token storage
3. **Load tests** for background service performance
4. **Security tests** for log injection prevention

### Phase 5: Logging & Monitoring (1-2 hours)
1. **File-based logging** to /var/log/paichart/oauth-audit.log
2. **Log rotation** with logrotate (30 days retention)
3. **Monitoring commands** for viewing logs and failures
4. **Health check** returns service status and recent activity

## Test Scenarios
1. **Initial OAuth Flow**: User authenticates, tokens stored in Map
2. **Token Refresh**: Background service refreshes token 10 min before expiry
3. **Concurrent Requests**: Multiple requests don't cause duplicate refreshes
4. **Provider Failure**: Circuit breaker stops attempts after 5 failures
5. **Server Restart**: Tokens lost, users must re-authenticate (acceptable)
6. **Token Rotation**: Both rotating and non-rotating providers work correctly
7. **Log Injection**: Provider error messages sanitized before logging

## Next Steps
1. ✅ Review discovery findings with team
2. ✅ Confirm in-memory storage approach (vs database)
3. ⏳ Generate encryption key for future database upgrade (not needed for v2.2)
4. ⏳ Create oauth-logger.ts for file-based audit trail
5. ⏳ Begin Phase 1 implementation (OAuth service enhancements)
```

## Deliverables

1. ✅ Complete OAuth flow map from initiation to token storage
2. ✅ Token lifecycle documentation with provider-specific details
3. ✅ Server integration point identification with line numbers
4. ✅ MCP authentication flow diagram with middleware insertion points
5. ✅ Risk assessment with mitigation strategies
6. ✅ Provider API endpoint documentation for refresh
7. ✅ File inventory with critical implementation files
8. ✅ In-memory storage pattern documentation (PKCE as template)
9. ✅ Edge case identification with handling strategies
10. ✅ Implementation recommendation with 8-10 hour timeline

## Success Criteria

- ✅ All OAuth providers (Microsoft, Google, GitHub) refresh endpoints documented
- ✅ Complete token lifecycle mapped from issuance to expiry
- ✅ Server integration points identified with specific line numbers
- ✅ MCP authentication flow fully understood with middleware locations
- ✅ In-memory storage pattern validated (PKCE Map at line 389)
- ✅ Risk assessment completed with mitigation strategies
- ✅ Clear implementation path defined with time estimates
- ✅ Edge cases documented with handling approaches
- ✅ Security considerations addressed (log injection, circuit breaker)
- ✅ Testing strategy defined for each implementation phase

## Validation Commands

```bash
# Verify all critical files exist
echo "=== File Existence Check ==="
[ -f /home/steve/copov15/lib/auth/oauth/oauth-service.ts ] && echo "✅ oauth-service.ts exists" || echo "❌ Missing"
[ -f /home/steve/copov15/lib/auth/oauth/oauth-config.ts ] && echo "✅ oauth-config.ts exists" || echo "❌ Missing"
[ -f /home/steve/copov15/mcp-server-http-clean.js ] && echo "✅ mcp-server-http-clean.js exists" || echo "❌ Missing"
[ -f /home/steve/copov15/server.ts ] && echo "✅ server.ts exists" || echo "❌ Missing"

# Verify PKCE pattern
echo "=== PKCE Pattern Verification ==="
grep -n "pkceStorage = new Map" /home/steve/copov15/lib/auth/oauth/oauth-service.ts

# Verify refresh method exists
echo "=== Refresh Method Verification ==="
grep -n "async refreshOAuthToken" /home/steve/copov15/lib/auth/oauth/oauth-service.ts

# Count OAuth-related files
echo "=== OAuth File Count ==="
find /home/steve/copov15/lib/auth/oauth -type f | wc -l

# Verify server initialization
echo "=== Server Initialization ==="
grep -n "initializeServer" /home/steve/copov15/server.ts
```

---

**Discovery Status**: ✅ COMPLETE
**Implementation Ready**: YES
**Confidence Level**: 93/100
**Next Action**: Begin Phase 1 implementation with OAuth service enhancements
