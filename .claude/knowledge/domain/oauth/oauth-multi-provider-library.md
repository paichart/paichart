# oauth-multi-provider-specialist — Domain Library

> **Created 2026-06-11** (Protocol 12 wave 2): depth evicted from `.claude/agents/oauth-multi-provider-specialist.md`.
> Verbatim at eviction; dates are provenance. The paired discovery's proven greps outrank this file.

## [evicted] 🆕 2026-05-28 Session — Pointers (HS256 verify-surface hardening — Step 2 SHIPPED)

- **✅ Step 2 SHIPPED 2026-05-28** (commits `9faabda0` + `eb745fc3`, verified in prod via `oauth-essentials` 9/9): `token-manager.verifyAccessToken` + `verifyRefreshToken` are now **RS256-only** — the HS256 session/refresh verify branches were DELETED (so the old `token-manager.ts:399/:457` HS256-consumer refs are GONE), and the Edge `middleware.ts` HS256 cookie accept + its dead header-injection subsystem were removed. Reframe that drove it: forgery risk = HS256 **verify-acceptance**, not mint. Plan + spec: `cline_docs/follow-ups/hs256-verify-surface-hardening-2026-05-28.md` + `hs256-step2-implementation-spec-2026-05-28.md`.
- **The full apiKey mint→RS256 migration (Option C) was DEFERRED** — verify-surface hardening delivered most of its security value at zero customer impact. Doc `apiKeyService-hs256-to-rs256-migration-2026-05-24.md` (Addenda A+B) stays a backlog item; revisit only if audit-forced.
- **Only ONE HS256 mint site** (unchanged): `apiKeyService.ts:70` (user API keys, 1-yr TTL). The daily-summary "HS256 Mint Sites: 9" alarm is a FALSE positive (Addendum A — regex counts lines).
- **api keys are RS256 (2026-06-04, `1dc46117`).** `apiKeyService.generateApiKey` mints RS256 via `mintMcpToken` (was HS256) → api keys authenticate `/mcp` and are revocable (active-`jti` check in `verifyAccessToken`). The dead `apiKeyService.validateApiKey` + `mcp-http-middleware.ts` were **DELETED** — there are now **no HS256 token mint/verify sites** in the codebase (the last HS256 verifier `customAuthProvider` was deleted 2026-05-28, `374af326`).
- **`JWT_SECRET` retired (2026-06-04, `627283ba`)** — it was a byte-identical legacy dup of `JWT_ACCESS_SECRET`; boot guard + demo script repointed. `JWT_ACCESS_SECRET` is the sole HS256 secret. Env-var removal (`.env.production` + secrets + `ecosystem.config.js`) is step 2, pending after the deploy is healthy.
- **`JWT_ACCESS_SECRET` consumers after Step 2** *(⚠️ HISTORICAL — the secret was FULLY RETIRED 2026-06-06; see top pointer. All consumers below are GONE: apiKeyService migrated to RS256, the `:338`/`:299` presence-guards removed, and two dead `middleware/` verifiers deleted)*: ~~`apiKeyService.ts:259` + the `auth-manager.ts:338` / `mcp-server-http-clean.js:299` presence-guards~~. RS256 verify path is pentest-verified + pinned by `scripts/test-security-invariants.ts` (incl. negative pins asserting the HS256 session/refresh branches stay absent).

## [evicted] 🆕 2026-05-26 Session — Pointers (ChatGPT OIDC discovery)

- **ChatGPT connector now requires `/.well-known/openid-configuration`** — OpenAI's backend probes OIDC discovery and **ABORTS on a 404** (verified: 2 failed ChatGPT setups died there; Claude/Gemini use `oauth-authorization-server` + DCR and were unaffected). We'd dropped it on a "zero hits in 14 days" basis; re-added `b222db64`. **Don't drop it again** — served by the R5 array in `oauth-discovery-routes.ts`; our metadata is already a valid OIDC doc. Symptom to recognize: "ChatGPT fails, Claude works."

## [evicted] 🆕 2026-05-24 Session — Pointers

- **ChatGPT DCR regression fix** (commit `89d5ec5f`): `lib/mcp/server/routes/oauth-flow-routes.ts:1063` — ChatGPT branch was hardcoding legacy `connector_platform_oauth_redirect`; now echoes `body?.redirect_uris`. Per OpenAI Apps SDK new spec (`https://chatgpt.com/connector/oauth/{callback_id}`).
- **`expectedClientId-wiring` MVP plan**: `cline_docs/reviews/expected-client-id-wiring-2026-05-24/` (6-specialist plan, 96% post-edit projection). **Phase 0 found NO persistent DCR allowlist storage exists** (no `oauth_clients` table; `/oauth/register` mints fresh client_id per request). Plan blocked on storage decision.
- **U2-related grep**: `grep -nE "azp|setAudience|audience:" lib/auth/token-manager.ts mcp-server-http-clean.js lib/services/apiKeyService.ts`

## [evicted] 🆕 OAuth Audit Logging (Nov 11, 2025) - PRODUCTION

**Status**: ✅ Comprehensive provider validation logging deployed with correlation IDs

**Provider Validation Events** ⭐ YOUR DOMAIN:
- `github_token_validation` - GitHub API validation (https://api.github.com/user)
- `microsoft_token_validation` - Microsoft Graph API validation (graph.microsoft.com/v1.0/me)
- `microsoft_graph_api_call` - Graph API interaction tracking
- `google_token_validation` - Google API validation (READY when Google implemented)
- `scope_resource_captured` - Exact scope/resource parameters ⭐ CRITICAL
- `scope_resource_validation` - String-for-string scope matching ⭐ CRITICAL

**What's Logged**:
- Correlation ID (links authorize → token → validate)
- Execution time (Graph API/GitHub API call duration)
- Success/failure with error messages
- User ID after validation
- Scope exact match verification (`exactScopeMatch: true/false`)

**Log Location**: `/var/log/paichart/oauth-audit.log`

**Monitoring Commands**:
```bash
# Microsoft Graph API validation (YOUR SPECIALTY)
ssh <PROD_USER>@<PROD_HOST> "grep 'microsoft_token_validation' /var/log/paichart/oauth-audit.log | jq"

# Scope validation (CRITICAL for ChatGPT)
ssh <PROD_USER>@<PROD_HOST> "grep 'scope_resource_validation' /var/log/paichart/oauth-audit.log | jq '.metadata.exactScopeMatch'"

# Provider-specific flows
ssh <PROD_USER>@<PROD_HOST> "cat /var/log/paichart/oauth-audit.log | jq -r '.provider' | sort | uniq -c"
```

**Reference**: `/.claude/knowledge/domain/oauth/oauth-audit-logging-quick-ref.md`

**Implementation**: `/.claude/knowledge/domain/oauth/mcp-oauth-logging-plan.md` (92% confidence, CRITICAL FIX #1 and #4)

## [evicted] Core Knowledge and Expertise

### First-Party Token Architecture (BREAKTHROUGH!)

**Knowledge Source**: `chatgpt-oauth-final-status-report.md` (9+ hours of implementation)

**What is First-Party Token Minting?**
- Server creates its own JWT instead of returning provider token
- JWT signed with server's private key
- JWT verified with server's public key (JWKS endpoint)
- Provider tokens stored server-side only (never sent to client)

**When to Use**:
- ✅ **First-Party (REQUIRED)**: Microsoft OAuth, Google OAuth, OpenID Connect flows
- ✅ **Proxy Pattern**: GitHub OAuth — server handles exchange via /oauth/callback, all clients get first-party RS256 JWTs
- ❌ **Never**: Mix strategies for same provider (consistency critical)

**Implementation Pattern**:
```javascript
// 1. Exchange provider code for provider token
const providerToken = await exchangeWithProvider(code);

// 2. Store provider token server-side (never return to client)
this.mcpOAuthTokenManager.storeToken(userId, providerToken);

// 3. Mint first-party JWT with exact scope from authorization
const mcpToken = this.mintMcpToken({
  userId: user.id,
  scope: capturedScope,  // CRITICAL: Use exact scope from /authorize
  ttlSeconds: 900
});

// 4. Return first-party JWT to client
res.json({
  access_token: mcpToken,  // OUR JWT, not provider token
  token_type: 'Bearer',
  expires_in: 900,
  scope: capturedScope     // CRITICAL: Return exact scope
});
```

**JWT Claims Structure**:
```javascript
{
  // Standard OIDC claims
  "iss": "https://paichart.app",              // Issuer
  "aud": "https://paichart.app/mcp",          // Audience (resource)
  "sub": "cmgws3rfw0002yxrpzavjk85a",         // Subject (user ID)
  "exp": <timestamp + 900>,                   // Expiration (15 minutes)
  "iat": <timestamp>,                         // Issued at
  "nbf": 0,                                   // Not before
  
  // MCP-specific claims
  "scope": "mcp:read tools:graph.read ...",   // EXACT scope from /authorize
  "jti": "<random-uuid>",                     // JWT ID (unique)
  
  // OAuth client tracking
  "azp": "Ov23lipNE6HwohVfv9NC",              // Authorized party (client_id)
  
  // JWT Header
  "alg": "RS256",                             // Algorithm
  "kid": "paichart-1"                         // Key ID (for JWKS)
}
```

### Provider-Specific Token Strategies

**GitHub OAuth**:
- **Strategy**: Proxy pattern — server-side exchange, first-party RS256 JWT
- **Why**: GitHub tokens are already valid authentication tokens
- **Token Return**: `{ access_token: ghToken, scope: "read:user,read:org", ... }`
- **Client Handling**: ChatGPT accepts GitHub tokens directly
- **Architecture**: OAuth proxy pattern — single org GitHub App, server-own callback URL, pac_ auth codes

**Microsoft OAuth**:
- **Strategy**: FIRST-PARTY token minting REQUIRED
- **Why**: Microsoft tokens are resource-specific (Graph), ChatGPT needs MCP resource tokens
- **Token Return**: `{ access_token: ourJWT, scope: exactScope, ... }`
- **Client Handling**: ChatGPT validates JWT signature via JWKS endpoint
- **Critical**: Scope MUST match exactly (ChatGPT string-for-string comparison)

**Google OAuth**:
- **Strategy**: FIRST-PARTY token minting REQUIRED (similar to Microsoft)
- **Why**: Google tokens are Google-specific, need MCP resource wrapper
- **Token Return**: `{ access_token: ourJWT, scope: exactScope, ... }`
- **Client Handling**: Same JWT validation as Microsoft via JWKS

### Scope/Resource Parameter Matching (CRITICAL!)

**The Problem** (from ChatGPT breakthrough):
- ChatGPT sends exact `scope` in `/authorize` request
- ChatGPT sends `resource` parameter (RFC 8707)
- ChatGPT VALIDATES that returned token matches EXACTLY
- If mismatch: "Not all requested permissions were granted"

**The Solution**:
```javascript
// 1. CAPTURE scope/resource from authorize request
app.get('/oauth/authorize', (req, res) => {
  const { scope, resource, state } = req.query;
  
  // CRITICAL: Store by state for later retrieval
  this.scopeCache.set(state, {
    scope: scope,      // "read:user read:org" - EXACT string
    resource: resource // "https://..." - RFC 8707
  });
  
  // Redirect to provider...
});

// 2. RETRIEVE stored scope/resource for token response
app.post('/oauth/token', async (req, res) => {
  const { state } = req.query;
  
  // CRITICAL: Get exact scope from cache
  const cachedScope = this.scopeCache.get(state);
  
  // Mint JWT with EXACT scope
  const token = this.mintMcpToken({
    scope: cachedScope.scope  // MUST be identical
  });
  
  // Return EXACT scope
  res.json({
    access_token: token,
    scope: cachedScope.scope  // MUST be identical
  });
});
```

**Why String-For-String Matters**:
- ChatGPT hardcodes scope validation
- Space ordering matters: `"read:org read:user"` ≠ `"read:user read:org"`
- Case matters: `"Read:User"` ≠ `"read:user"`
- Extra spaces matter: `"read:user  read:org"` ≠ `"read:user read:org"`

**Common Mismatch Bug**:
```javascript
// ❌ WRONG: Converting scope list to different format
const scope = 'read:user read:org';
const mcpScope = scope.split(' ').map(s => `tools:${s}`).join(' ');
// Result: "tools:read:user tools:read:org" ← NOT WHAT CHATGPT SENT!

// ✅ RIGHT: Return EXACT scope received
const mcpToken = this.mintMcpToken({ scope: capturedScope }); // Exact!
```

### RFC 8707 Resource Parameter

**What is it?**
- Standard OAuth 2.0 extension for identifying resource being accessed
- Client specifies resource in `/authorize` request
- Server must honor resource in token response

**In OAuth Flow**:
```
/authorize?resource=https://paichart.app/mcp&scope=...
        ↓
/token → { aud: "https://paichart.app/mcp", ... }
```

**ChatGPT Implementation**:
- Sends `?resource=https://...` in authorization request
- Expects JWT with matching `aud` claim
- Validates: JWT.aud === requested.resource

**Implementation**:
```javascript
// Capture resource
const resource = req.query.resource; // RFC 8707

// Store for token response
this.scopeCache.set(state, { resource });

// Include in JWT
jwt.sign({ aud: cachedResource }, ...)
```

### JWT/JWKS Infrastructure

**JWKS Endpoint** (Public Key Distribution):
```
GET /.well-known/jwks.json
GET /mcp/.well-known/jwks.json
GET /oauth/jwks.json
→ { "keys": [{ "kty": "RSA", "kid": "paichart-1", ... }] }
```

**Why Multiple Paths?**
- Different clients (ChatGPT, Claude, Gemini) try different paths
- nginx alias compatibility
- Standards compliance (OIDC discovery)

**JWT Validation Flow**:
```
1. Client receives JWT: eyJhbGciOiJSUzI1NiIsImtpZCI6InBhaWNoYXJ0LTEi...
2. Extracts header: { alg: "RS256", kid: "paichart-1" }
3. Fetches JWKS: GET /.well-known/jwks.json
4. Finds matching key: kid === "paichart-1"
5. Verifies signature: JWT signature matches key
6. Checks claims: aud, iss, exp all valid
7. Uses token for authenticated requests
```

**Critical Implementation Details**:
```javascript
// 1. Generate RSA keypair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// 2. Store in environment (loaded at startup)
MCP_PRIVATE_KEY_PEM = "-----BEGIN PRIVATE KEY-----..."
MCP_PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----..."

// 3. JWKS endpoint exposes public key
app.get('/.well-known/jwks.json', (req, res) => {
  const keyObj = crypto.createPublicKey(process.env.MCP_PUBLIC_KEY_PEM);
  const jwk = keyObj.export({ format: 'jwk' });
  jwk.use = 'sig';      // Signature use
  jwk.kid = 'paichart-1'; // Key ID
  jwk.alg = 'RS256';    // Algorithm
  res.json({ keys: [jwk] });
});

// 4. Sign tokens with private key
jwt.sign(payload, process.env.MCP_PRIVATE_KEY_PEM, {
  algorithm: 'RS256',
  keyid: 'paichart-1'
});
```

### Nginx Routing Infrastructure (Production-Critical)

**Context:** JWKS and OAuth discovery endpoints require proper nginx routing to function correctly. Today's deployment revealed critical path resolution issues that caused 404 errors.

**Nginx Configuration**: `/etc/nginx/sites-available/paichart.app`

**Routing Rules:**

**OAuth Discovery Endpoints** (Routed to MCP Server - Port 8080):
```nginx
# Routes to MCP server:
location ~ ^/.well-known/oauth-authorization-server$ {
    proxy_pass http://127.0.0.1:8080;
}

location ~ ^/mcp/.well-known/oauth-authorization-server$ {
    proxy_pass http://127.0.0.1:8080;
}

location ~ ^/.well-known/oauth-protected-resource$ {
    proxy_pass http://127.0.0.1:8080;
}

location /mcp {
    proxy_pass http://127.0.0.1:8080;
}
```

**Web Server Routes** (Port 3000 - Default):
```nginx
# Everything else routes to Next.js web server:
location / {
    proxy_pass http://127.0.0.1:3000;
}
```

**The JWKS Path Problem:**

**Issue:** `/.well-known/jwks.json` is NOT routed to MCP server in nginx!
```
Request: GET https://paichart.app/.well-known/jwks.json
nginx: No matching location block → Routes to web server (port 3000)
Web server: Next.js tries to serve it → Returns HTML 404 page
Result: ❌ JWKS not found
```

**Solution:** Add multiple JWKS paths in MCP server code
```javascript
// MCP server serves JWKS on multiple paths for nginx compatibility
app.get([
  '/.well-known/jwks.json',       // Standard OIDC path (might 404 via nginx)
  '/mcp/.well-known/jwks.json',   // ✅ nginx routes /mcp/* to MCP server
  '/oauth/jwks.json',              // ✅ Alternative that works
  '/mcp/jwks.json'                 // ✅ Fallback
], (req, res) => {
  // Serve JWKS
});
```

**Debugging JWKS 404 Errors:**

```bash
# Test direct MCP server access (bypasses nginx):
curl http://localhost:8080/.well-known/jwks.json
# Should return JWKS

# Test via nginx (port 80/443):
curl https://paichart.app/.well-known/jwks.json
# Might return HTML 404 if not routed

# Test /mcp prefix (should work):
curl https://paichart.app/mcp/.well-known/jwks.json
# Should return JWKS

# Check nginx routing:
nginx -t  # Test config
grep -A 5 "well-known" /etc/nginx/sites-available/paichart.app
```

**Why This Matters:**
- ChatGPT fetches JWKS via `jwks_uri` from OAuth discovery
- If JWKS returns 404 or HTML, ChatGPT can't verify JWT signatures
- Token validation fails → "Not all permissions granted"
- Multiple paths ensure client compatibility

**Best Practice:** Advertise working path in OAuth discovery:
```javascript
{
  "jwks_uri": "https://paichart.app/mcp/.well-known/jwks.json"  // ✅ Works via nginx
}
```

### Scope/Resource Parameter Capture Pattern

**File**: `/mcp-server-http-clean.js` (lines 640-663, 1318-1350)

**Pattern**:
```javascript
// MAP: Store scope/resource by state
const scopeCache = new Map(); // state → { scope, resource }

// AUTHORIZE endpoint: Capture
app.get('/oauth/authorize', (req, res) => {
  const { state, scope, resource } = req.query;
  
  // Store for later retrieval
  scopeCache.set(state, { scope, resource });
  
  // Redirect to provider
  res.redirect(`https://provider.com/authorize?state=${state}&...`);
});

// TOKEN endpoint: Retrieve and use
app.post('/oauth/token', (req, res) => {
  const { state } = extractState(req.body);
  
  // Retrieve exact scope/resource
  const cached = scopeCache.get(state);
  
  // Mint token with exact values
  const token = mintMcpToken({
    scope: cached.scope,
    aud: cached.resource
  });
  
  // Return exact scope
  res.json({
    access_token: token,
    scope: cached.scope // EXACT!
  });
});
```

### azp (Authorized Party) Claim

**What is it?**
- OAuth 2.0 ID Token claim identifying which client is authorized
- Client ID of the OAuth application
- Required for validating client binding

**Why Required for ChatGPT?**
- ChatGPT validates that token is issued FOR IT
- azp claim must match ChatGPT's client_id
- Prevents token substitution between clients

**Implementation**:
```javascript
jwt.sign({
  azp: clientId,  // "Ov23lipNE6HwohVfv9NC" (ChatGPT's client_id)
  aud: "https://paichart.app/mcp",
  // ... other claims
}, privateKey, {
  algorithm: 'RS256'
});
```

## [evicted] Key Information

### OAuth Provider Configurations
**File**: `.env.production`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `MCP_PRIVATE_KEY_PEM` / `MCP_PUBLIC_KEY_PEM`

### Token Minting (First-Party)
**Function**: `mintMcpToken(userId, scope, ttlSeconds)`
- **Location**: `/mcp-server-http-clean.js` line 804
- **Signs with**: `MCP_PRIVATE_KEY_PEM`
- **Returns**: JWT with aud/iss/scope/azp/jti
- **TTL**: 900 seconds (15 minutes) typical

### JWKS Endpoint
**URLs**:
- `https://paichart.app/.well-known/jwks.json`
- `https://paichart.app/mcp/.well-known/jwks.json`
- `https://paichart.app/oauth/jwks.json`
- Multiple paths for client compatibility

### OAuth Discovery Endpoint
**URL**: `https://paichart.app/.well-known/oauth-authorization-server`
**Must Include**:
- `jwks_uri`: Full path to JWKS endpoint
- `scopes_supported`: Array of supported scopes
- `token_endpoint_auth_methods_supported`

### Protected Resource Metadata
**URL**: `https://paichart.app/.well-known/oauth-protected-resource`
**Advertises**:
- `resource`: `https://paichart.app/mcp`
- `scopes_supported`: MCP scope list
- `bearer_methods_supported`: ["header"]

## [evicted] Learning Notes

### Pattern: Scope Capture by State
- **Pattern**: Store OAuth parameters by state identifier
- **Why**: Scope/resource needed across request boundary
- **Implementation**: `scopeCache.set(state, { scope, resource })`
- **Retrieval**: `scopeCache.get(stateFromToken)`
- **Tip**: Clear cache entries after 10 minutes (state typically short-lived)

### Gotcha: Scope String Formatting
- **Problem**: ChatGPT validates scope string-for-string
- **Common Mistake**: Converting scope to different format (e.g., adding `tools:` prefix)
- **Solution**: Capture EXACT scope, return EXACT scope
- **Test**: `assert(returnedScope === capturedScope)`

### Gotcha: JWKS Endpoint Not Accessible
- **Problem**: Client can't fetch public key for validation
- **Common Mistake**: JWKS behind authentication, bad nginx config
- **Solution**: JWKS must be PUBLIC (no auth required)
- **Test**: `curl https://paichart.app/.well-known/jwks.json`

### Gotcha: Missing azp Claim
- **Problem**: ChatGPT can't bind token to itself
- **Common Mistake**: Only including iss/aud/sub in JWT
- **Solution**: Add azp claim with client_id
- **Test**: `jwt.decode(token).azp === clientId`

### Gotcha: Resource Parameter Mismatch
- **Problem**: JWT aud doesn't match requested resource
- **Common Mistake**: Using generic aud value
- **Solution**: Capture resource from request, include in JWT aud
- **Test**: `jwt.decode(token).aud === capturedResource`

### Critical: Microsoft OAuth with ChatGPT
- **Insight**: ChatGPT doesn't accept raw Microsoft tokens
- **Why**: Microsoft tokens are Graph-scoped, not MCP-scoped
- **Solution**: First-party token minting required
- **Evidence**: From chatgpt-oauth-final-status-report.md (10+ hours testing)

### Insight: GitHub OAuth Works Different
- **Insight**: GitHub uses proxy pattern — server exchanges code, mints first-party JWT
- **Why**: GitHub tokens are general-purpose auth tokens
- **Why Unique**: Other providers are resource-specific
- **Solution**: All providers use first-party tokens; GitHub via proxy pattern

### Insight: Token Lifetime Management
- **Pattern**: MCP tokens short-lived (900 seconds = 15 minutes)
- **Why**: Reduces blast radius if token compromised
- **Why**: Token refresh is easy (just request new one)
- **Refresh**: Client requests new token via OAuth flow


## [evicted] 🆕 Recent Implementation Patterns (Oct-Dec 2025 archive, 466 lines)


### 🎉 Dec 13, 2025 Final Resolution - ALL PLATFORMS WORKING ✅✅✅

**Status:** Server-side OAuth implementation 100% complete - ALL PLATFORMS WORKING!

**Working Platforms:**
- ✅ ChatGPT (Microsoft OAuth) - 100% success rate since Dec 6, 22:30 UTC
- ✅ Claude Code (GitHub OAuth) - Ongoing 100% success rate
- ✅ Claude Desktop (GitHub OAuth) - 🎉 FIXED Dec 13, 2025! Full OAuth flow working

**Method-Level Authentication Implemented (Dec 8, 21:52 UTC):**
```javascript
// Removed global authRequired flag
// Added secure-by-default method-level security

static MCP_PUBLIC_METHODS = [
  'initialize', 'notifications/initialized', 'ping',
  'tools/list', 'resources/list', 'prompts/list'
];

isProtectedMethod(method) {
  if (!method || method === '') return true;  // Secure by default
  const normalizedMethod = method.toLowerCase();
  return !MCP_PUBLIC_METHODS.includes(normalizedMethod);
}
```

**Critical Discovery:** ChatGPT OAuth uses OIDC endpoints (NOT MCP methods), therefore authRequired flag was irrelevant to ChatGPT OAuth.

**Reference:** `/.claude/knowledge/domain/oauth/oauth-final-status-dec-2025.md` - Complete final resolution

---

### 🚨 Claude Desktop 401 on Initialize Fix (Dec 13, 2025) - BREAKTHROUGH

**Discovery:** Claude Desktop only triggers OAuth discovery on **POST /mcp failures**, NOT GET failures!

**Root Cause:** The server was returning 200 on POST /mcp `initialize` (it was a "public" method), so Claude Desktop thought it was connected and never initiated OAuth. The later GET /mcp → 401 was ignored.

**Fix Applied** (extracted Wave 6 Phase 6.4 / commit `5f97c9ed` to `lib/mcp/server/routes/oauth-flow-routes.ts:registerB2UnauthInitializeMiddleware` — verbatim move):
```javascript
// Return 401 on POST /mcp initialize when no auth
this.app.post('/mcp', (req, res, next) => {
  const hasAuth = req.headers.authorization || req.headers['x-api-key'];
  const isInitialize = req.body?.method === 'initialize';

  if (!hasAuth && isInitialize) {
    const resourceMetadataUrl = 'https://paichart.app/.well-known/oauth-protected-resource';
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
    res.setHeader('Link', `<${resourceMetadataUrl}>; rel="oauth-protected-resource"`);
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Authentication required' },
      id: req.body?.id || null
    });
  }
  next();
});
```

**Configuration Requirement:**
⚠️ Remote MCP servers MUST be added via **Settings > Connectors** UI in Claude Desktop, NOT via `claude_desktop_config.json`.

**Reference:** `/.claude/knowledge/domain/oauth/claude-desktop-oauth-diagnostic-guide.md`

---

### 🆕 Azure AD App Registration Configuration (Dec 13, 2025) - CRITICAL FOR CHATGPT

**Discovery:** ChatGPT uses PKCE (public client) OAuth - requires specific Azure AD configuration!

**Problem:** Users couldn't complete Microsoft OAuth - redirected to Microsoft login but never returned.

**Root Cause:** Azure AD App Registration had "Allow public client flows" DISABLED.

**Required Azure Portal Settings:**

#### 1. App Registration → Authentication Blade

| Setting | Required Value | Why |
|---------|---------------|-----|
| **Allow public client flows** | ✅ **Enabled** | ChatGPT uses PKCE without client secret |
| **Supported account types** | "Multitenant + personal Microsoft accounts" | Allow any Microsoft account |
| **Enable Live SDK support** | Enabled (optional) | Legacy support |

**Implicit Grant Settings** (typically NOT needed for PKCE):
- Access tokens: ❌ Disabled (PKCE uses authorization code)
- ID tokens: ❌ Disabled (PKCE uses authorization code)

#### 2. App Registration → API Permissions Blade

| Permission | Type | Admin Consent | Purpose |
|------------|------|---------------|---------|
| `User.Read` | Delegated | No | Sign in and read user profile |
| `email` | Delegated | No | View user's email address |
| `openid` | Delegated | No | Sign users in (OIDC) |
| `profile` | Delegated | No | View user's basic profile |
| `offline_access` | Delegated | No | Maintain access (refresh tokens) |
| `User.ReadBasic.All` | Delegated | No | Read all users' basic profiles |

**Optional Application Permissions** (for server-to-server):
- `User.Read.All` - Read all users' full profiles (requires admin consent)
- `Directory.Read.All` - Read directory data (requires admin consent)

#### 3. Enterprise Applications → Properties

| Setting | Required Value | Why |
|---------|---------------|-----|
| **Enabled for users to sign in** | ✅ Yes | Allow sign-in |
| **Assignment required** | ❌ **No** | Don't require explicit user assignment |
| **Visible to users** | Optional | App visibility in portal |

**⚠️ CRITICAL:** If "Assignment required" is Yes, only explicitly assigned users can authenticate!

#### 4. Redirect URIs (Authentication Blade)

Must include ChatGPT's redirect URI:
```
https://chatgpt.com/connector_platform_oauth_redirect
```

**Type:** Web (not SPA, not Mobile/Desktop)

#### Verification Commands:

```bash
# Test OAuth flow initiates correctly
curl -v "https://paichart.app/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&scope=openid+email"

# Check token exchange works
ssh <PROD_USER>@<PROD_HOST> "tail -50 /var/log/nginx/access.log | grep 'oauth/token'"

# Verify successful tokens
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-mcp --lines 20 --nostream | grep 'token_exchange\|Microsoft'"
```

**Common Azure AD Errors:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| OAuth starts but never completes | "Allow public client flows" disabled | Enable in Authentication blade |
| "User not assigned" error | "Assignment required" is Yes | Set to No in Enterprise App |
| "Scope not granted" | Missing API permissions | Add required delegated permissions |
| Works for some users, not others | Single tenant mode | Change to Multitenant |

**Reference:** This configuration was discovered when a user on a different PC couldn't authenticate - enabling "Allow public client flows" was the fix.

---

### ChatGPT Registration Scope Fix (Dec 6-7, 2025) - BREAKTHROUGH

**Critical Discovery:** ChatGPT requires `scope: 'openid email'` exactly in registration response

**Problem:** ChatGPT OAuth flow initiated but never completed token exchange

**Root Cause:** Registration endpoint returned GitHub-style scopes (`'read:user read:org'`) instead of OIDC scopes

**Discovery Source:** Wei Ming T. article "How to Set Up OAuth for the ChatGPT Connector" (Oct 21, 2025)

**Fix Applied:**
```javascript
// File: mcp-server-http-clean.js — grep `CHATGPT_SCOPE` for current sites
// (line numbers shift as the monolith is decomposed). Canonical value now
// lives in `lib/auth/auth-constants.ts` as `CHATGPT_SCOPE = 'openid email'`
// (Phase 3.1, May 20, 2026). Server-class static prop re-exports it.

// Before (BROKEN):
scope: 'read:user read:org',  // GitHub-style scopes cause ChatGPT OAuth to fail

// After (WORKING):
scope: 'openid email',  // ChatGPT requires exactly this for OIDC compliance
```

**Why This Works:**
- ChatGPT uses OIDC (OpenID Connect) for OAuth discovery
- OIDC requires `openid` scope minimum
- ChatGPT accepts `openid` + `email` or `email` alone
- Adding other scopes like `profile` or `phone` causes errors
- GitHub scopes (`read:user read:org`) are invalid for OIDC

**Impact:**
- ✅ ChatGPT Microsoft OAuth fully functional (Dec 6, 22:30 UTC)
- ✅ Token exchange successful
- ✅ Scope validation: `exactScopeMatch: true`
- ✅ User authenticated: <maintainer-email>

**Production Evidence:**
```json
{
  "timestamp": "2025-12-06T22:30:49.802Z",
  "action": "mcp_oauth_token_exchange",
  "provider": "microsoft",
  "userId": "cmgws3rfw0002yxrpzavjk85a",
  "success": true
}
```

**ChatGPT Configuration:**
- Client ID/Secret: **Leave EMPTY** (auto-discovers via OIDC)
- Provider: Microsoft OAuth
- Scope (registration): `'openid email'` ✅ CRITICAL
- Redirect URI: `https://chatgpt.com/connector_platform_oauth_redirect`

---

### Claude Desktop OAuth Investigation (Dec 7-8, 2025) - ANTHROPIC BUG CONFIRMED ❌

**Problem:** Claude Desktop didn't initiate OAuth flow for remote MCP servers

**Initial Investigation:** Added RFC 9728 compliant WWW-Authenticate header

**Fix Applied:**
```javascript
// File: mcp-server-http-clean.js — grep `WWW-Authenticate` for current sites
// (line numbers shift). Note: the realm= parameter was later removed per
// Dec 13 2025 fix (some clients had parser issues); current production form
// uses Bearer + resource_metadata without realm.
res.setHeader(
  'WWW-Authenticate',
  'Bearer realm="mcp", resource_metadata="https://paichart.app/.well-known/oauth-protected-resource"'
);
```

**Server Status:** 100% RFC 9728 compliant ✅

**Evidence (Dec 8, 21:58 UTC):**
```bash
# Server returns correct 401 + WWW-Authenticate
curl -i https://paichart.app/mcp
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="mcp", resource_metadata="https://paichart.app/.well-known/oauth-protected-resource"

# Claude Desktop receives this but doesn't initiate OAuth
# No discovery, no registration, no OAuth flow
```

**Root Cause:** Anthropic OAuth proxy bug (client-side)

**Related GitHub Issues:**
- #5826: "service is never contacted"
- #3515: OAuth proxy `step=start_error`
- #11814: "infinite about:blank loop"
- #1674: `step=end_error` after callback

**Workaround:** API Key authentication (works perfectly)

**Claude Desktop Configuration:**
- Server URL: `https://paichart.app/mcp`
- Auth Method: API Key (OAuth broken on Anthropic side)
- Provider: GitHub OAuth (when fixed)
- Scope: `'read:user read:org'` (GitHub scopes)
- Redirect URI: `https://claude.ai/api/mcp/auth_callback`

---

### OAuth Discovery Method Comparison (Dec 8, 2025)

**Three Different Discovery Mechanisms:**

| Platform | Discovery Method | Standard | Trigger | Scope |
|----------|-----------------|----------|---------|-------|
| **ChatGPT** | Probes oauth-authorization-server AND openid-configuration | RFC 8414 + OIDC Discovery | Fetches both `/.well-known/` docs (server-side), then DCR | `openid email` ⚠️ openid-configuration was dropped Phase 0.6 (zero-hits) then **RE-ADDED `b222db64` 2026-05-26** — ChatGPT aborts on its 404. MUST return 200; do NOT re-drop (see 2026-05-26 pointer at top of this file). |
| **Claude Desktop** | Protected Resource Metadata | RFC 9728 | Reads `WWW-Authenticate: resource_metadata="..."` on 401 | `read:user read:org` |
| **Claude Code** | Direct Registration | OAuth 2.0 DCR | Calls `/oauth/register` directly | `read:user read:org` |

**Critical Distinction:**
- ChatGPT and Claude Desktop use DIFFERENT discovery standards
- ChatGPT requires OIDC scopes, Claude Desktop requires GitHub scopes
- Both work simultaneously with proper configuration
- Must support BOTH discovery methods for full platform coverage

---

### Microsoft `offline_access` Normalization (Dec 13, 2025) - CRITICAL

**Discovery:** Microsoft NEVER returns `offline_access` in granted scopes - it's a meta-scope

**Problem:** Scope comparison showed mismatch (`scopeMatch: false`) even when refresh token was received

**Root Cause:** Per [Microsoft documentation](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc):
> "The `offline_access` scope is used to REQUEST a Refresh Token and is NEVER returned as a scope"

**Solution:** Normalize scopes by removing `offline_access` before comparison

**Implementation** (`mcp-server-http-clean.js`):
```javascript
// Normalize by removing offline_access (Microsoft never returns it)
const normalizeScope = (scope) =>
  scope?.split(' ').filter(s => s !== 'offline_access').sort().join(' ');

const scopeMatchNormalized = normalizeScope(msScope) === normalizeScope(tokenData.scope);

// OAuth audit log (custom file logger → /var/log/paichart/oauth-audit.log)
oauthLogger.log({
  action: 'provider_token_received',
  metadata: {
    scopeMatch: scopeMatchNormalized,      // Normalized (no false positives)
    scopeMatchRaw: msScope === tokenData.scope,  // Raw for debugging
    offlineAccessRequested: msScope?.includes('offline_access'),
    hasRefreshToken: !!tokenData.refresh_token   // TRUE = offline_access worked!
  }
});

// pino structured log (→ PM2 JSON output, domain: 'auth')
authLogger.info({ scopeMatch: scopeMatchNormalized, provider: 'microsoft' }, 'Microsoft scope normalized');
```

**Key Insight:** `hasRefreshToken: true` is the REAL indicator that `offline_access` worked, not the scope string.

**Audit Events:**
- `provider_token_received` - Shows both normalized and raw scope comparison
- `scopeMatch: true` with `scopeMatchRaw: false` is EXPECTED for Microsoft

**Commits:**
- `963fac1` - fix(oauth): Normalize Microsoft scope comparison to handle offline_access

---

### Scope/Resource String-For-String Matching (Nov 11, 2025) - CRITICAL

**Discovery**: THE #1 ChatGPT OAuth failure point is exact scope matching
**Implementation**: Capture exact `scope` and `resource` parameters at authorize, return identically at token exchange
**Files**: scope capture lives in the OAuth flow routes — grep `requestedScope:` / `requestedResource:` in `lib/mcp/server/routes/oauth-flow-routes.ts` (`validateScopeMatch` DELETED 2026-06-11 — exact-scope echo enforced by construction) (line numbers shift; prefer grep). Phase 2.x note: scope captured into `OAuthRequestData` (now defined on `SessionStore` in `lib/auth/oauth/session-store.ts`) and written via `this.sessionStore.setOAuthRequest()`.
**Validation**: `exactScopeMatch: true` logged in OAuth audit
**Result**: ✅ ChatGPT Microsoft OAuth working

### Provider Validation Logging (Nov 11, 2025) - CRITICAL FIX #1

**Implementation**: Added OAuth audit logging to `verifyMicrosoftToken()` and `verifyGitHubToken()`
**File**: `lib/auth/oauth/mcp-oauth-validator.js:189-265` (Microsoft), `58-136` (GitHub)
**Added**: Graph API call logging, validation success/failure, correlation ID tracking
**Result**: ✅ Provider validation now fully visible in OAuth audit logs

### Edge Runtime RS256 Validation Pattern

**CRITICAL**: Edge Runtime (Next.js API routes) doesn't support `crypto.createPublicKey()` or `importSPKI()` for RS256 validation.

**Solution**: Manual JWT decode without verification (trust upstream validation)

```typescript
// expectedClientId: removed 2026-04-01 (commit 4e4f8b31) as dead code, then
// RESTORED 2026-05-18 (token-manager.ts:310-313) — optional azp enforcement,
// threaded through verifyMcpToken (auth-manager.ts:391) — 1 of 4 verifyAccessToken
// sites — but DORMANT (no caller passes it yet; live client-binding = the
// refresh-grant client_id check at oauth-flow-routes.ts:747). azp written to every JWT.
// HS256 session/refresh fallback REMOVED 2026-05-28 (Step 2) — RS256-only now.
export async function verifyAccessToken(
  token: string,
  expectedClientId?: string
): Promise<JWTPayload> {
  // Full RS256 cryptographic verification (kid-based JWKS lookup) with issuer +
  // audience validation; non-RS256 tokens rejected (no HS256 branch).

    return payload;
  }
}
```

**Why this works**:
- RS256 tokens already validated in MCP server (signature verified on minting)
- Middleware detects RS256 and passes through
- Edge Runtime just extracts claims (no re-verification needed)
- Safe because we control the entire flow

**Location**: Implement in BOTH JWT files (see below)

### Duplicate JWT Validation Files

**CRITICAL**: Two files have `verifyAccessToken()` functions due to historical code duplication. Both must be updated for consistency.

**Files**:
1. `lib/jwt.ts` - Primary JWT utilities (used by getAuthUser, some API routes)
2. `lib/auth/token-manager.ts` - Duplicate JWT utilities (re-exported by lib/auth/index.ts, used by other API routes)

**Import confusion**:
```typescript
// Some routes import from '@/lib/auth':
import { verifyAccessToken } from '@/lib/auth';  // Gets token-manager version

// getAuthUser imports from '../jwt':
import { verifyAccessToken } from '../jwt';      // Gets lib/jwt version
```

**Action Required**: When updating JWT validation logic, update BOTH files to avoid inconsistency.

### Scope String-For-String Validation (Item 1)

**Implemented**: originally `validateScopeMatch()` in `mcp-server-http-clean.js` — **method DELETED 2026-06-11** (see note below)

> **🔄 Phase 3.8c → 3.10a (May 20, 2026)**: Migrated to `AuthManager.validateScopeMatch` (aead8b5b), server-class version deleted (e2ee8a38).
>
> **🗑️ DELETED 2026-06-11**: `AuthManager.validateScopeMatch` removed outright. Its only-ever caller was the dead Microsoft token-exchange handler removed in Wave 3b.0a (`0f07ac90`, 2026-05-12) — and the check was a **tautology**: it compared the client-requested scope to a response field assembled FROM that same value (`scope: requestedScope`), never a provider's returned scopes. The ChatGPT exact-scope requirement is now enforced **by construction** at the live token endpoint (`lib/mcp/server/routes/oauth-flow-routes.ts` echoes `requestedScope` verbatim). `scope_match_validated`/`scope_mismatch_detected` audit events are no longer emitted (historical logs pre-2026-05-12 only). Code blocks below are historical.

```javascript
validateScopeMatch(requested, returned) {
  if (requested !== returned) {
    throw new Error(
      `Scope mismatch: requested="${requested}" returned="${returned}". ` +
      `ChatGPT requires exact match (order, spacing, case-sensitive).`
    );
  }
  authLogger.info({ requested }, 'Scope validation exact match');
}
```

**Usage**: Call before returning token response
```javascript
// Validate scope match (ChatGPT requirement)
this.validateScopeMatch(requestedScope, tokenResponse.scope);
res.json(tokenResponse);
```

**Why**: Prevents "permission not granted" errors from ChatGPT (discovered in Oct 19-20 implementation)

### azp Claim Validation (Item 2)

**Implemented**: Optional `expectedClientId` parameter in both `verifyAccessToken` functions

**Pattern**:
```typescript
// Add optional parameter
export async function verifyAccessToken(
  token: string,
  expectedClientId?: string  // NEW
): Promise<JWTPayload>

// Validate azp claim for RS256 tokens
if (expectedClientId && payload.azp) {
  if (payload.azp !== expectedClientId) {
    throw new Error('Token not authorized for this client');
  }
  authLogger.info({ azp: payload.azp }, 'azp claim validated');
}
```

**Security Benefit**: Prevents token reuse across different OAuth clients

### Connection Pooling Pattern (Item 3)

**Implemented**: Global Prisma client in `mcp-server-http-clean.js`

**Pattern**:
```javascript
// Top of file (after requires)
const { PrismaClient } = require('@prisma/client');

// Global Prisma client (reuse connection pool)
const globalPrisma = global.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  global.prisma = globalPrisma;
}

// In OAuth flows - use globalPrisma instead of new PrismaClient()
const user = await globalPrisma.user.findUnique({
  where: { id: userId }
});
// No $disconnect() - connection pool is reused
```

**Performance**: Reduces database connection churn during OAuth token validation/refresh

**Locations Updated**:
- Line ~553: RS256 token validation
- Line ~1592: Refresh token endpoint
- Line ~1862: OAuth token refresh grant

## [evicted] 🆕 Pino Structured Logging for OAuth Debugging (Feb 2026)

**Status**: ✅ Full codebase uses pino structured logging (348+ files migrated, including all MCP server JS)

**Pattern Reference**: `/.claude/knowledge/patterns/pino-structured-logging-pattern.md` (Pattern #43, 96% confidence)

**Two Logging Systems** — Know when to use each:

| System | Logger | Output | When to Use |
|--------|--------|--------|-------------|
| **pino (structured)** | `authLogger` from `@/lib/logger` | PM2 JSON logs | Server-side debug, errors, flow tracing |
| **OAuth audit log** | `oauthLogger` from `oauth-logger.ts` | `/var/log/paichart/oauth-audit.log` | OAuth-specific events, correlation IDs, compliance |

**Domain Loggers for OAuth** (exported from `lib/logger.ts`):
```typescript
import { authLogger } from '@/lib/logger';  // Auth, OAuth, JWT, permissions
import { mcpLogger } from '@/lib/logger';   // MCP tools, resources, servers
import { apiLogger } from '@/lib/logger';   // API routes, validation
```

**Correct pino API** — Object FIRST, message SECOND:
```typescript
// ✅ CORRECT pino pattern
authLogger.info({ userId, provider, scope }, 'OAuth token minted');
authLogger.error({ err: error, provider, tokenId }, 'Token validation failed');
authLogger.warn({ scopeMatch: false, requested, returned }, 'Scope mismatch detected');

// ❌ WRONG — message first (console.* habit)
authLogger.info('Token minted', { userId });  // Wrong order!

// ❌ WRONG — wrong error key
authLogger.error({ error: someError }, 'Failed');  // Must use { err: error }
```

**PM2 JSON Log Monitoring** (pino structured logs):
```bash
# Auth domain errors (pino JSON)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":50'"

# All auth domain logs
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | jq '{time, level, msg}'"

# OAuth-related auth logs (combine with audit log for full picture)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep -i 'oauth\|token\|scope' | jq"

# MCP domain OAuth events
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"mcp\"' | grep -i 'oauth' | jq"
```

**When Debugging OAuth Issues**: Use BOTH logging systems:
1. **Start with pino** (`pm2 logs` + `grep '"domain":"auth"'`) for server-side errors and flow tracing
2. **Then check audit log** (`/var/log/paichart/oauth-audit.log`) for OAuth-specific events and correlation IDs
3. **Cross-reference** using timestamps and userId to get the complete picture

## [evicted] 🆕 Recent Updates

### Component 5: Audience Standardization (Jan 30, 2026) ⭐ → extended by U2 Audience-Tightening (May 19, 2026) ⭐⭐
**Status**: ✅ Deployed | **Security**: 95/100 | **RFC**: 8707, 9068 compliant

**Audiences (current, post-U2)**:
- `https://paichart.app/mcp/<service-slug>` — **per-service (RFC 8707, primary post-U2)**. Convention via `audienceForService({name})` from `lib/mcp/server/tools/hub/audience-policy.js`. Examples: `/mcp/snowflake-service`, `/mcp/token-validator-service`.
- `https://paichart.app/api` — internal `/api/*` calls (`INTERNAL_API_AUDIENCE`)
- `https://paichart.app/mcp` — MCP front door (OAuth callbacks, refresh-grant)
- `paichart-api`, `paichart-app` — Deprecated (sunset Jul 5, 2026)

**U2 Additions**:
- Cross-service blast-radius isolation (Snowflake-forwarded token cannot replay at Databricks/EIA/etc.)
- `azp` claim propagation (Option α) — populated at `populateReqUser()` helper (Phase E.1)
- `expectedClientId` enforcement at refresh-grant (`mcp-server-http-clean.js` `/oauth/token` with `grant_type=refresh_token` — dedicated `/oauth/refresh` endpoint DROPPED Wave 6 Phase 0.6 / 2026-05-21)
- Mint rate limit 100/min/user via `checkRateLimit('mint:userId', ...)`

**Reference**: `/.claude/knowledge/domain/oauth/oauth-audience-architecture.md` + `cline_docs/reviews/u2-audience-tightening-2026-05-19/IMPLEMENTATION-PLAN-v3.1.md`

---
