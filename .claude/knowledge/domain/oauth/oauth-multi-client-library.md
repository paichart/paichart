# oauth-multi-client-specialist — Domain Library

> **Created 2026-06-11** by the Protocol 12 eviction rollout (wave 1): knowledge depth moved OUT of
> `.claude/agents/oauth-multi-client-specialist.md` per the eviction rule
> (`.claude/knowledge/protocols/specialist-eviction-protocol.md`). The specialist is the router;
> this file is the store — greppable on demand, NOT auto-loaded. Content is verbatim at eviction
> time; dates/commits are provenance. Evicted session blocks are at the end under
> "Evicted session blocks (R3 dispositions in the rollout triage table)".

---

## 🆕 Pino Structured Logging for Multi-Client Debugging (Feb 2026)

**Status**: ✅ Full codebase uses pino structured logging (348+ files migrated, including all MCP server JS)

**Pattern Reference**: `/.claude/knowledge/patterns/pino-structured-logging-pattern.md` (Pattern #43, 96% confidence)

**Two Logging Systems** — Know when to use each:

| System | Logger | Output | When to Use |
|--------|--------|--------|-------------|
| **pino (structured)** | `authLogger` from `@/lib/logger` | PM2 JSON logs | Server-side debug, errors, client detection tracing |
| **OAuth audit log** | `oauthLogger` from `oauth-logger.ts` | `/var/log/paichart/oauth-audit.log` | OAuth events, client detection events, correlation IDs |

**Domain Loggers for Multi-Client OAuth** (exported from `lib/logger.ts`):
```typescript
import { authLogger } from '@/lib/logger';  // Auth, OAuth, JWT, client detection
import { mcpLogger } from '@/lib/logger';   // MCP protocol, session management
```

**Correct pino API** — Object FIRST, message SECOND:
```typescript
// ✅ CORRECT pino pattern for multi-client debugging
authLogger.info({ clientName, redirectUri: redirect_uri, provider }, 'Client detected');
authLogger.debug({ clientName, selectedProvider, clientIdEnv }, 'OAuth app selected');
authLogger.error({ err: error, clientName, provider }, 'Token exchange failed');

// ❌ WRONG — message only (no context for filtering)
authLogger.info('No auth on initialize - returning 401');

// ✅ CORRECT — include context object
authLogger.info({ method: 'initialize' }, 'No auth on initialize - returning 401');
```

**PM2 JSON Log Monitoring** (pino structured logs):
```bash
# Auth domain client detection logs
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep -i 'client\|detect' | jq"

# Auth domain errors (level 50)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":50' | jq"

# Combined auth + MCP domain for OAuth flow tracing
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep -E '\"domain\":\"(auth|mcp)\"' | grep -i 'oauth\|token\|client' | jq '{time, domain, level, msg}'"
```

**When Debugging Multi-Client OAuth Issues**: Use BOTH logging systems:
1. **pino logs** (`pm2 logs` + `grep '"domain":"auth"'`) — Server-side errors, client detection, token flow
2. **OAuth audit log** (`/var/log/paichart/oauth-audit.log`) — `client_detected` events, correlation IDs, provider-specific flows
3. **Cross-reference** by timestamp and clientName to trace complete multi-client flows

## 🆕 Recent Implementation Patterns (Oct-Dec 2025)

### 🎉 Dec 13, 2025 Final Multi-Client Status - ALL THREE PLATFORMS WORKING ✅✅✅

**Status:** Server-side OAuth implementation 100% complete - ALL PLATFORMS WORKING!

**Working Platforms:**
- ✅ **ChatGPT** (Microsoft OAuth) - 100% success rate since Dec 6, 22:30 UTC
- ✅ **Claude Code** (GitHub OAuth) - Ongoing 100% success rate
- ✅ **Claude Desktop** (GitHub OAuth) - 🎉 FIXED Dec 13, 2025! Full OAuth flow working

**Production Metrics (Dec 13, 20:57 UTC):**
- ChatGPT OAuth: 47/47 attempts successful
- Claude Code OAuth: 156/156 attempts successful
- Claude Desktop OAuth: ✅ WORKING (was 0% before fix)

**Reference:** `/.claude/knowledge/domain/oauth/claude-desktop-oauth-diagnostic-guide.md` - Complete diagnostic guide

---

### 🚨 Claude Desktop 401 on Initialize Fix (Dec 13, 2025) - BREAKTHROUGH

**Discovery:** Claude Desktop only triggers OAuth discovery on **POST /mcp failures**, not GET failures!

**Problem:** Claude Desktop was receiving 401 on GET /mcp (SSE endpoint), but had already "initialized" successfully via POST /mcp, so it never initiated OAuth.

**Root Cause Analysis:**
1. Claude Desktop sends `POST /mcp` with `method: "initialize"` as first request
2. Server returned 200 (initialize was a "public" method)
3. Claude Desktop thought it was connected successfully
4. Later GET /mcp → 401, but Claude Desktop ignored it (already "initialized")
5. No OAuth discovery ever triggered

**Critical Fix Applied** (extracted Wave 6 Phase 6.4 / commit `5f97c9ed` to `lib/mcp/server/routes/oauth-flow-routes.ts:registerB2UnauthInitializeMiddleware` — verbatim move; pre-Wave-6 was inline at `mcp-server-http-clean.js`):
```javascript
// FIX: Return 401 on POST /mcp initialize when no auth
// CRITICAL: Claude Desktop only triggers OAuth on POST failures, not GET
this.app.post('/mcp', (req, res, next) => {
  const hasAuth = req.headers.authorization || req.headers['x-api-key'];
  const isInitialize = req.body?.method === 'initialize';

  // If no auth AND this is initialize request, return 401 to trigger OAuth
  if (!hasAuth && isInitialize) {
    authLogger.info({ method: 'initialize' }, 'No auth on initialize - returning 401');

    const resourceMetadataUrl = 'https://paichart.app/.well-known/oauth-protected-resource';

    // RFC 6750 WWW-Authenticate header
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);

    // RFC 9728 Link header (backup)
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

**Additional Fix:** Add Link header to ALL /mcp responses (extracted Wave 6 Phase 6.3 / commit `8c192d3d` to `lib/mcp/server/routes/oauth-discovery-routes.ts:registerLinkHeaderMiddleware`):
```javascript
// FIX 1: Add OAuth discovery Link header to ALL /mcp responses
this.app.use('/mcp', (req, res, next) => {
  const resourceMetadataUrl = 'https://paichart.app/.well-known/oauth-protected-resource';
  res.setHeader('Link', `<${resourceMetadataUrl}>; rel="oauth-protected-resource"`);
  res.setHeader('Access-Control-Expose-Headers', 'Link, WWW-Authenticate, MCP-Session-Id');
  next();
});
```

**Expected Flow After Fix:**
```
1. Claude Desktop POSTs initialize without auth
2. Server returns 401 with OAuth discovery headers ← NEW!
3. Claude Desktop reads WWW-Authenticate/Link headers
4. Claude Desktop fetches /.well-known/oauth-protected-resource → 200
5. Claude Desktop fetches /.well-known/oauth-authorization-server → 200
6. Claude Desktop calls /oauth/register (DCR) → 201
7. Claude Desktop opens browser for /oauth/authorize
8. User authenticates with GitHub
9. Claude Desktop calls POST /mcp WITH Bearer token → 200 ✅
```

**Verified Flow (Dec 13, 20:57 UTC):**
```
POST /mcp → 401 (our fix triggered!)
GET /.well-known/oauth-protected-resource → 200 ✅
GET /.well-known/oauth-authorization-server → 200 ✅
POST /oauth/register → 201 ✅
GET /oauth/authorize → 302 ✅ (GitHub redirect)
POST /mcp → 200 ✅ AUTHENTICATED!
```

**Configuration Requirement:**
⚠️ **CRITICAL**: Remote MCP servers MUST be added via **Settings > Connectors** UI in Claude Desktop, NOT via `claude_desktop_config.json`. The JSON config method doesn't trigger OAuth discovery for remote servers.

**Commits:**
- `a0f23e3` - fix(oauth): Return 401 on initialize to trigger Claude Desktop OAuth discovery

**Impact:**
- Claude Desktop GitHub OAuth: 0% → 100% success rate
- All three AI platforms now working with OAuth

---

### WWW-Authenticate Resource Metadata (Dec 8, 2025) - CRITICAL FIX

**Discovery:** Claude Desktop requires `resource_metadata` parameter in WWW-Authenticate header (RFC 9728)

**Problem:** Claude Desktop wasn't initiating OAuth flow for remote MCP servers

**Root Cause:** WWW-Authenticate header missing RFC 9728 compliant `resource_metadata` parameter

**Fix Applied:**
```javascript
// File: lib/auth/oauth/auth-manager.ts (AuthManager.createMiddleware — Wave 4 Phase 4.4)
// Pre-Wave-4 (May 2026), the WWW-Authenticate header lived at
// mcp-server-http-clean.js:670 in the inline auth middleware.
// Grep 'WWW-Authenticate' in lib/auth/oauth/auth-manager.ts for current location.

// Before (MISSING resource_metadata):
res.setHeader('WWW-Authenticate', 'Bearer realm="paichart.app", charset="UTF-8"');

// After (RFC 9728 COMPLIANT):
res.setHeader(
  'WWW-Authenticate',
  'Bearer realm="mcp", resource_metadata="https://paichart.app/.well-known/oauth-protected-resource"'
);
```

**Why This Works:**
- **RFC 9728** defines OAuth 2.0 Protected Resource Metadata
- Claude Desktop reads WWW-Authenticate header on 401 Unauthorized response
- `resource_metadata` parameter points to discovery document
- Claude Desktop fetches metadata and discovers OAuth endpoints
- OAuth registration and flow proceed automatically

**Impact:**
- ✅ Claude Desktop OAuth fully functional (Dec 8, 02:28 UTC)
- ✅ GitHub OAuth provider working
- ✅ Token validation successful
- ✅ User authenticated: <maintainer-email>

**Discovery Method Comparison:**

| Platform | Discovery Standard | Trigger | Header/Endpoint |
|----------|-------------------|---------|----------------|
| **ChatGPT** | Probes BOTH oauth-authorization-server AND openid-configuration (server-side, from OpenAI Azure IPs) | Fetches both discovery docs, then DCR | `/.well-known/oauth-authorization-server` + `/.well-known/openid-configuration` ⚠️ openid-configuration was wrongly dropped Phase 0.6 (zero-hits) then **RE-ADDED `b222db64` 2026-05-26** — ChatGPT aborts the connector on its 404. Discovery is an OR per OpenAI docs, but ChatGPT probes openid-configuration, so it MUST return 200. Do NOT re-drop. |
| **Claude Desktop** | RFC 9728 | Reads 401 response header | `WWW-Authenticate: resource_metadata="..."` |
| **Claude Code** | OAuth 2.0 DCR | Direct registration call | `/oauth/register` |

**Critical Lesson:** Different AI platforms use DIFFERENT OAuth discovery mechanisms. Must support ALL three standards for full platform coverage.

---

### GitHub OAuth Single Callback Limitation (Nov 15, 2025) - BREAKTHROUGH 🚨

**Discovery**: GitHub OAuth apps only allow ONE callback URL per app. This is a fundamental constraint that requires architectural changes.

**Problem**: Claude Desktop CLI (`http://localhost:*/callback`) and Claude.ai Browser (`https://claude.ai/api/mcp/auth_callback`) were trying to share one GitHub OAuth app.

**Impact**:
- OAuth flow reached GitHub with correct client ID ✅
- GitHub rejected the flow because callback URL didn't match registered URL ❌
- No token exchange occurred (flow stopped at authorization step)

**Solution**: Split Claude into TWO separate clients with TWO separate GitHub OAuth apps:

```javascript
// BEFORE (Nov 14, 2025) - BROKEN
{
  claude: {  // ❌ One app for both CLI and browser
    detect: (uri) => uri?.includes('claude.ai') ||
                     (uri?.includes('localhost') && uri?.includes('/callback')),
    clientIdEnv: 'CLAUDE_GITHUB_CLIENT_ID'  // App registered with claude.ai callback only
  }
}
// Result: CLI requests localhost callback → GitHub rejects (not in allowed list)

// AFTER (Nov 15, 2025) - WORKING
{
  'claude-desktop': {  // ✅ Dedicated app for CLI
    detect: (uri) => uri?.includes('localhost') && uri?.includes('/callback'),
    clientIdEnv: 'CLAUDE_DESKTOP_GITHUB_CLIENT_ID'  // NEW app with localhost callback
  },
  'claude-browser': {  // ✅ Dedicated app for browser
    detect: (uri) => uri?.includes('claude.ai'),
    clientIdEnv: 'CLAUDE_GITHUB_CLIENT_ID'  // Existing app with claude.ai callback
  }
}
```

**Architecture Changes**:
1. Created `detectOAuthClient()` helper method (lines 942-988)
2. Updated all 4 OAuth handlers to use helper consistently
3. Split CLIENT_PROVIDER_MAP into 5 clients (was 3)
4. Updated environment files (.env.example, .env.production.template)
5. Updated deployment workflow with new environment variables

**Manual Setup Required**:
- Create new GitHub OAuth app for Claude Desktop
- Callback URL: `http://localhost/callback` (supports dynamic ports)
- Add `CLAUDE_DESKTOP_GITHUB_CLIENT_ID` and `_SECRET` to GitHub Secrets
- See: `/cline_docs/claude-desktop-oauth-setup-steps.md`

**Files Modified**:
- `mcp-server-http-clean.js` (helper method + 4 handlers)
- `.github/workflows/production-deploy.yml` (environment variables)
- `.env.example`, `.env.production.template` (documentation)

**Commits**:
- `986807c` - detectOAuthClient() helper
- `291d0e8` - Claude Desktop split + environment files

**Lesson**: When supporting multiple callback URL patterns for the same logical client, create separate OAuth apps. GitHub's single-callback limitation is non-negotiable.

### PKCE-Based Scope Lookup (Dec 13, 2025) - CRITICAL FIX

**Discovery:** ChatGPT does NOT send state parameter in token exchange request

**Problem:** Scope lookup by state failed → fell back to wrong default scopes → scope mismatch

**Root Cause:** OAuth spec allows omitting state in token exchange (it's for CSRF in authorization, not token exchange). ChatGPT follows this strictly.

**Solution:** Store scope by `code_challenge` during authorization, compute `code_challenge` from `code_verifier` during token exchange

**Implementation** (`mcp-server-http-clean.js` — Phase 2.x routes through `SessionStore` at `lib/auth/oauth/session-store.ts`):
```javascript
// Authorization: Store by code_challenge (in addition to state)
if (code_challenge) {
  this.sessionStore.setOAuthRequest(`pkce:${code_challenge}`, oauthRequestData);
}

// Token exchange: Compute code_challenge from code_verifier
if (!oauthRequest && code_verifier) {
  const computedChallenge = crypto
    .createHash('sha256')
    .update(code_verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  oauthRequest = this.sessionStore.getOAuthRequest(`pkce:${computedChallenge}`);
}
```

**Audit Event:** `oauth_pkce_fallback_success` logged when PKCE lookup succeeds

**Commits:**
- `754d4e9` - fix(oauth): PKCE-based scope lookup for ChatGPT

---

### Scope Constants Consolidation (Dec 13, 2025 → relocated May 20, 2026)

**Problem:** 19 scope definition locations, 8 hardcoded strings → maintenance burden, mismatch risk

**Current canonical location** (Wave 3a Phase 3.1, May 20, 2026): `lib/auth/auth-constants.ts` (~130 LOC). Server-class static properties on `CleanMCPHTTPServer` now re-export from this module — zero behaviour change, single source of truth lives in `lib/auth/`.

```typescript
// lib/auth/auth-constants.ts — exported constants:
export const CHATGPT_SCOPE = 'openid email';                            // Microsoft OAuth — for MCP/ChatGPT
export const CLAUDE_SCOPE = 'user:email';                               // GitHub OAuth — for Claude Desktop (Apr 2026 reduction from 'read:user read:org')
export const MICROSOFT_GRAPH_SCOPE = 'openid profile email User.Read';  // Graph API
export const MICROSOFT_GRAPH_SCOPE_OFFLINE = '...offline_access';       // With refresh
export const MCP_SCOPES = ['mcp:read', 'tools:graph.read', ...];        // MCP capabilities
export const OIDC_SCOPES = ['openid', 'email', 'profile'];
export const GITHUB_SCOPES = ['read:user', 'read:org'];
// Also: TOKEN_TTL_SECONDS=900, OAUTH_STATE_TTL_MS, REFRESH_TOKEN_TTL_DAYS,
//       LEGACY_AUDIENCES, PER_SERVICE_AUDIENCE_PREFIX, JWT_ISSUER
```

**Import path** for new code: `import { CLAUDE_SCOPE, ... } from '@/lib/auth/auth-constants'`. Reading `CleanMCPHTTPServer.CHATGPT_SCOPE` still works (re-export) but new code should import from the module directly.

**Benefits:**
- Single source of truth for ALL scopes — now in `lib/auth/`, not buried in `mcp-server-http-clean.js`
- Prevents scope string typos
- Easy to update when provider requirements change
- Future `AuthManager` consumes from this module directly (no server-class coupling)

**Commits:**
- `1ce3da7` - MICROSOFT_GRAPH_SCOPE constant
- `f90211b` - CLAUDE_SCOPE consolidation
- `13d2446` - Complete scope array constants
- `ecd63bf1` - Phase 3.1: extracted to `lib/auth/auth-constants.ts` (Wave 3a, May 20, 2026)

**Confidence:** 82% → 92% (per oauth-multi-client-specialist audit)

---

### Client ID Mismatch Fix (Nov 11, 2025) - CRITICAL

**Problem**: ChatGPT received GitHub client ID in registration but Microsoft used different client ID
**Root Cause**: Registration returned `CHATGPT_GITHUB_CLIENT_ID` but we default to Microsoft provider
**Fix**: Return `CHATGPT_MICROSOFT_CLIENT_ID` in registration for consistency
**File**: `mcp-server-http-clean.js` (grep `CHATGPT_MICROSOFT_CLIENT_ID` to find current location — line numbers shift)
**Result**: ✅ ChatGPT Microsoft OAuth now working

### Scope String-For-String Validation

**CRITICAL for ChatGPT**: ChatGPT validates exact scope match (order, spacing, case-sensitive). Mismatches cause "permission not granted" errors.

> **🔄 Phase 3.8c → 3.10a (May 20, 2026)**: Migrated to `AuthManager.validateScopeMatch`; server-class version deleted in 3.10a (commit e2ee8a38).
>
> **🗑️ DELETED 2026-06-11**: `AuthManager.validateScopeMatch` removed outright. Its only-ever caller was the dead Microsoft token-exchange handler removed in Wave 3b.0a (`0f07ac90`, 2026-05-12) — and the check was a **tautology**: it compared the client-requested scope to a response field assembled FROM that same value (`scope: requestedScope`), never a provider's returned scopes. The ChatGPT exact-scope requirement is now enforced **by construction** at the live token endpoint (`lib/mcp/server/routes/oauth-flow-routes.ts` echoes `requestedScope` verbatim). `scope_match_validated`/`scope_mismatch_detected` audit events are no longer emitted (historical logs pre-2026-05-12 only). Code blocks below are historical.

**Implementation** (`mcp-server-http-clean.js`):
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

// Usage before token return
this.validateScopeMatch(requestedScope, tokenResponse.scope);
res.json(tokenResponse);
```

**Why**: Learned from Oct 19-20 ChatGPT OAuth implementation (10+ hours debugging)

### Client-Specific Token Validation (azp)

**What it's for**: `azp` ("authorized party") is the `client_id` a token was minted for, stamped on every MCP JWT. An `azp === expectedClientId` check would block cross-client token replay.

**Current reality (2026-05-28) — built, but DORMANT and coarse. Do not describe it as a live guarantee:**
- The `expectedClientId` param is *threaded through* `verifyMcpToken` (`auth-manager.ts:391`, 1 of 4 `verifyAccessToken` call sites) and the mismatch check exists (`token-manager.ts:368-377`, `warn` + throw on mismatch) — but **no caller passes a value**, so the check is skipped in practice.
- The live client-binding that DOES run is the separate refresh-grant `client_id` check at `oauth-flow-routes.ts:747`.
- Even if enforced, azp is **coarse**: Claude Desktop, Claude browser, and Gemini all authenticate through the same GitHub org app (`azp = Iv23lizLBJNisgLT7shD`), so azp **cannot** tell them apart (it *can* distinguish ChatGPT/Microsoft from the GitHub-app clients). Fine-grained per-client binding needs Phase 5.1's `client_type` claim.

**Implementation** (`lib/auth/token-manager.ts`, re-exported by `lib/jwt.ts`):
```typescript
// expectedClientId: removed 2026-04-01 (commit 4e4f8b31) as dead code, then
// RESTORED 2026-05-18 (token-manager.ts:310-313) — optional azp enforcement,
// threaded through verifyMcpToken (auth-manager.ts:391) — 1 of 4 verifyAccessToken
// sites — but DORMANT (no caller passes it yet; live client-binding = the
// refresh-grant client_id check at oauth-flow-routes.ts:747). azp written to every JWT.
export async function verifyAccessToken(
  token: string,
  expectedClientId?: string
): Promise<JWTPayload> {
  // ... RS256-only decode (no HS256 branch as of Step 2 2026-05-28) with issuer + audience validation ...
  if (expectedClientId) {
    const azp = payload.azp as string | undefined;
    if (azp && azp !== expectedClientId) {
      authLogger.warn({ expectedClientId, actualAzp: azp }, 'azp mismatch — cross-client reuse blocked');
      throw new Error('Token azp claim does not match expected client');
    }
  }
  return payload;
}
```

**Future**: per-client enforcement (e.g. "a ChatGPT token can't be replayed by Gemini") becomes meaningful once Phase 5.1 adds the `client_type` claim AND a caller actually passes `expectedClientId`. Until then, treat azp as audit metadata, not an access control. Consult `oauth-multi-provider-specialist` for the Phase 5.1 plan.

### Edge Runtime Compatibility

**CRITICAL**: Edge Runtime (Next.js API routes) doesn't support `crypto.createPublicKey()` or `importSPKI()`

**Solution**: Manual JWT decode (atob + JSON.parse) instead of cryptographic verification
- Safe because RS256 tokens already validated in MCP server/middleware
- Edge Runtime just extracts claims
- See oauth-multi-provider-specialist for full pattern

**Files Affected**: `lib/jwt.ts` AND `lib/auth/token-manager.ts` (both must be updated)

### Multi-Client Testing Checklist

When implementing OAuth changes, test with ALL clients:

**ChatGPT** (Microsoft OAuth, PKCE required):
- [ ] OAuth flow completes
- [ ] Scope validation passes (exact match)
- [ ] azp claim validated
- [ ] project(action: "pov.list") works
- [ ] project(action: "task.list") works
- [ ] Refresh token flow works (7-day TTL)

**Claude Desktop** (GitHub OAuth, PKCE optional):
- [ ] OAuth flow completes
- [ ] Long-lived token (8+ hours)
- [ ] No reconnect after PM2 restart (within token lifetime)

**Gemini CLI** (GitHub OAuth, PKCE optional):
- [ ] OAuth flow completes
- [ ] Public tools work without auth
- [ ] Authenticated tools work with auth

## 🆕 CLIENT_PROVIDER_MAP Architecture (Nov 15, 2025) - PRODUCTION

**Status**: ✅ Comprehensive client detection system with dynamic port support for Claude Desktop

### Overview

CLIENT_PROVIDER_MAP is the centralized client detection and provider coordination system that maps AI clients to their OAuth providers and client IDs. It solves the multi-client coordination challenge of routing ChatGPT, Claude Desktop, and Gemini to their correct OAuth configurations.

**File**: `mcp-server-http-clean.js` (lines 1804-1822)

### The Architecture

```javascript
const CLIENT_PROVIDER_MAP = {
  gemini: {  // CHECK FIRST: Most specific localhost port
    detect: (uri) => uri?.includes('localhost:7777'),
    defaultProvider: 'github',
    clientIdEnv: 'GEMINI_GITHUB_CLIENT_ID'
  },
  chatgpt: {  // CHECK SECOND: Specific domains
    detect: (uri) => uri?.includes('chatgpt.com') ||
                     uri?.includes('openai.com') ||
                     uri?.includes('localhost:8000'),
    defaultProvider: 'microsoft',
    clientIdEnv: 'CHATGPT_MICROSOFT_CLIENT_ID'
  },
  claude: {  // CHECK LAST: Catch-all for remaining localhost callbacks
    detect: (uri) => uri?.includes('claude.ai') ||
                     (uri?.includes('localhost') && uri?.includes('/callback')),
    defaultProvider: 'github',
    clientIdEnv: 'CLAUDE_GITHUB_CLIENT_ID'
  }
};

// Detection logic
const detectedClientEntry = Object.entries(CLIENT_PROVIDER_MAP)
  .find(([_, config]) => config.detect(redirect_uri));

const detectedClientName = detectedClientEntry ? detectedClientEntry[0] : 'webapp';
const detectedClientConfig = detectedClientEntry ? detectedClientEntry[1] : null;

// Provider selection: explicit param > client default > global default
const selectedProvider = (provider ||
                          (detectedClientConfig?.defaultProvider) ||
                          'github').toLowerCase();
```

### Critical Design Decisions

#### 1. Detection Order Matters! ⚠️

**ORDER**: gemini → chatgpt → claude

**Why**: Claude detection is a catch-all pattern (`localhost:*/callback`) that would match Gemini if checked first.

**Example**:
```javascript
// Gemini: localhost:7777/oauth/callback
// ✅ Correct order: Matches gemini (most specific)
// ❌ Wrong order: Would match claude (localhost + /callback)

// Claude Desktop: localhost:53397/callback
// ✅ Correct order: Doesn't match gemini/chatgpt, matches claude
```

#### 2. Dynamic Port Handling for Claude Desktop

**Problem**: Claude Desktop uses random localhost ports (49399, 64385, 53397, etc.)

**Solution**: Catch-all pattern for any `localhost:*/callback`

```javascript
claude: {
  detect: (uri) => uri?.includes('claude.ai') ||
                   (uri?.includes('localhost') && uri?.includes('/callback'))
}
```

**Why Not Hardcode Ports**:
- Ports change every connection
- No way to predict port in advance
- Catch-all is safe because Gemini checked first

#### 3. Provider-Client ID Coordination (Updated Nov 15, 2025)

Each client has dedicated environment variable for its client ID:

| Client | Provider | Client ID Env Var | GitHub App ID | Callback URL |
|--------|----------|-------------------|---------------|--------------|
| ChatGPT | Microsoft | `CHATGPT_MICROSOFT_CLIENT_ID` | `Ov23lipNE6HwohVfv9NC` | `chatgpt.com/connector_platform_oauth_redirect` |
| Claude Desktop | GitHub | `CLAUDE_DESKTOP_GITHUB_CLIENT_ID` | **TBD - Create new app** | `localhost/callback` 🆕 |
| Claude Browser | GitHub | `CLAUDE_GITHUB_CLIENT_ID` | `<REDACTED-SECRET>` | `claude.ai/api/mcp/auth_callback` |
| Gemini CLI | GitHub | `GEMINI_GITHUB_CLIENT_ID` | `Ov23liVv4beh4BFKIpBT` | `localhost:7777/oauth/callback` |
| Web App | GitHub | `GITHUB_CLIENT_ID` | `Ov23ligMA2fCPQarlM6h` | `paichart.app/api/auth/oauth/callback/github` |

**Note**: Claude Desktop requires a NEW GitHub OAuth app (http://localhost/callback) separate from Claude Browser (https://claude.ai/api/mcp/auth_callback) due to GitHub's single-callback-URL limitation.

**Dynamic Selection**:
```javascript
const githubClientId = detectedClientConfig?.clientIdEnv
  ? (process.env[detectedClientConfig.clientIdEnv] || client_id)
  : (process.env.GITHUB_CLIENT_ID || client_id);
```

### 🔧 COMPREHENSIVE FIX: detectOAuthClient() Helper Method (Nov 15, 2025) - PRODUCTION

**Status**: ✅ Centralized client detection across ALL OAuth handlers (Commit 986807c)

> **🔄 Phase 3.8d → 3.10a (May 20, 2026)**: Migrated to `AuthManager.detectOAuthClient` in `lib/auth/oauth/auth-manager.ts` (Phase 3.8d, commit 90fc81c6) — 2 patterns dropped during the JS→TS port were restored in 3.8d (Gemini `localhost && /oauth/callback` fallback, ChatGPT `localhost:8000` local dev). Test 17b in `scripts/test-auth-manager.ts` locks the parity invariants. Server-class version deleted in 3.10a (commit e2ee8a38). Callers use `this.authManager.detectOAuthClient(redirect_uri)`. Code blocks below are historical — they document the centralization that made the AuthManager extraction possible.
>
> **Sibling implementation note** (Wave 6 Phase 6.4 / commit `5f97c9ed`): The `/register` endpoint moved to `lib/mcp/server/routes/oauth-flow-routes.ts:registerR10Register`. Its inline classifier (`redirect_uris[]` + `client_name`) is now a documented SIBLING of `AuthManager.detectOAuthClient` per Plan v2 D13 — the file-header docstring in `oauth-flow-routes.ts` contains the SYNC WARNING, and `scripts/test-routes-oauth-flow.ts` includes a fixture-based equivalence test asserting both classifiers agree on baseline URIs. Consolidation still deferred (Phase 3.8b) per Claude-Desktop-first prioritization. The two classifiers must stay in sync — if you add/remove a pattern in `AuthManager.CLIENT_PROVIDER_MAP`, audit the R10 inline classifier too.

#### The Problem We Fixed

**Root Cause**: Fix #4 (ee43b2d) was INCOMPLETE - it only fixed the GitHub authorization handler, but **THREE other OAuth handlers** still used OLD hardcoded detection logic.

**Broken Handlers Identified**:
1. ❌ Microsoft Authorization Handler (line 963) - Used `redirect_uri.includes('claude.ai')`
2. ❌ Microsoft Token Exchange Handler (line 1087) - Used `redirect_uri.includes('claude.ai')`
3. ❌ GitHub Token Exchange Handler (line 2134) - Used `redirect_uri.includes('claude.ai')`
4. ❌ Main Authorization Endpoint (line 1804-1822) - Had inline CLIENT_PROVIDER_MAP (code duplication)

**Why All Failed**: Claude Desktop uses `localhost:53397/callback` (random dynamic port) which does NOT match the hardcoded `claude.ai` check, causing detection to fall back to "webapp" and use the wrong GitHub client ID.

#### The Comprehensive Solution

**Created Centralized Helper Method** (`detectOAuthClient()` at lines 942-988):

```javascript
/**
 * 🔧 CRITICAL FIX: Detect OAuth client using CLIENT_PROVIDER_MAP
 *
 * This centralizes client detection logic to prevent inconsistencies
 * across different OAuth handlers (GitHub, Microsoft, token exchange, etc.)
 *
 * @param {string} redirect_uri - OAuth callback URL
 * @returns {object} { clientName, clientConfig } - Detected client info
 *
 * Detection Order (IMPORTANT - most specific first!):
 * 1. Gemini: localhost:7777 (most specific port)
 * 2. ChatGPT: chatgpt.com, openai.com, localhost:8000
 * 3. Claude: claude.ai OR localhost with /callback (fallback for dynamic ports)
 * 4. Fallback: 'webapp' if no match
 *
 * Why Claude is last: Its localhost pattern would match Gemini
 * if checked first. Order prevents false positives.
 */
detectOAuthClient(redirect_uri) {
  const CLIENT_PROVIDER_MAP = {
    gemini: {  // CHECK FIRST - Most specific localhost port
      detect: (uri) => uri?.includes('localhost:7777'),
      defaultProvider: 'github',
      clientIdEnv: 'GEMINI_GITHUB_CLIENT_ID'
    },
    chatgpt: {  // CHECK SECOND - Specific domains
      detect: (uri) => uri?.includes('chatgpt.com') || uri?.includes('openai.com') || uri?.includes('localhost:8000'),
      defaultProvider: 'microsoft',
      clientIdEnv: 'CHATGPT_MICROSOFT_CLIENT_ID'
    },
    claude: {  // CHECK LAST - Fallback for remaining localhost callbacks
      detect: (uri) => uri?.includes('claude.ai') ||
                       (uri?.includes('localhost') && uri?.includes('/callback')),
      defaultProvider: 'github',
      clientIdEnv: 'CLAUDE_GITHUB_CLIENT_ID'
    }
  };

  // Detect client from redirect_uri
  const detectedClientEntry = Object.entries(CLIENT_PROVIDER_MAP)
    .find(([_, config]) => config.detect(redirect_uri));

  return {
    clientName: detectedClientEntry ? detectedClientEntry[0] : 'webapp',
    clientConfig: detectedClientEntry ? detectedClientEntry[1] : null
  };
}
```

**All 4 Handlers Now Use This Helper**:

```javascript
// 1. Microsoft Authorization Handler
const { clientName, clientConfig } = this.detectOAuthClient(redirect_uri);
const isGeminiCLI = clientName === 'gemini';
const isChatGPT = clientName === 'chatgpt';
const isClaude = clientName === 'claude';

// 2. Microsoft Token Exchange Handler
const { clientName } = this.detectOAuthClient(redirect_uri);
const isGeminiCLI = clientName === 'gemini';
const isChatGPT = clientName === 'chatgpt';
const isClaude = clientName === 'claude';

// 3. GitHub Token Exchange Handler
const { clientName } = this.detectOAuthClient(redirect_uri);
const isGeminiCLI = clientName === 'gemini';
const isChatGPT = clientName === 'chatgpt';
const isClaude = clientName === 'claude';

// 4. Main Authorization Endpoint
const { clientName: detectedClientName, clientConfig: detectedClientConfig } = this.detectOAuthClient(redirect_uri);
const selectedProvider = (provider ||
                          (detectedClientConfig?.defaultProvider) ||
                          'github').toLowerCase();
```

#### Before vs After

**Before Fix (BROKEN)**:
```javascript
// OLD: Each handler recalculated detection independently
const isClaude = redirect_uri && redirect_uri.includes('claude.ai');
// Result for localhost:53397/callback → FALSE → detected as "webapp" ❌
```

**After Fix (WORKING)**:
```javascript
// NEW: All handlers use centralized detectOAuthClient()
const { clientName } = this.detectOAuthClient(redirect_uri);
const isClaude = clientName === 'claude';
// Result for localhost:53397/callback → TRUE → detected as "claude" ✅
```

#### Key Benefits

1. **Single Source of Truth**: CLIENT_PROVIDER_MAP defined once in helper method
2. **Consistent Detection**: All handlers use same logic, no inconsistencies
3. **Dynamic Port Support**: Claude Desktop's random ports handled correctly
4. **No Code Duplication**: DRY principle enforced
5. **Easy Maintenance**: Update detection logic in ONE place

#### Critical Lesson Learned

**❌ NEVER recalculate client detection in handlers** - Always use the centralized helper method.

**Before (ANTI-PATTERN)**:
```javascript
// Authorization endpoint calculates detection
const detectedClientName = ...

// GitHub handler RECALCULATES (WRONG!)
const isClaude = redirect_uri && redirect_uri.includes('claude.ai');
```

**After (CORRECT PATTERN)**:
```javascript
// Authorization endpoint uses helper
const { clientName } = this.detectOAuthClient(redirect_uri);

// GitHub handler uses helper (SAME LOGIC!)
const { clientName } = this.detectOAuthClient(redirect_uri);
```

#### Implementation Guidelines

**When adding new OAuth handlers**:
1. ✅ ALWAYS call `this.detectOAuthClient(redirect_uri)` first
2. ✅ Extract `clientName` from returned object
3. ✅ Use `clientName === 'claude'` for comparison
4. ❌ NEVER use `redirect_uri.includes('claude.ai')` directly
5. ❌ NEVER duplicate CLIENT_PROVIDER_MAP logic

**Example for new handler**:
```javascript
async handleNewOAuthFlow(req, res) {
  const { redirect_uri } = req.query;

  // ✅ CORRECT: Use centralized helper
  const { clientName, clientConfig } = this.detectOAuthClient(redirect_uri);
  const isGeminiCLI = clientName === 'gemini';
  const isChatGPT = clientName === 'chatgpt';
  const isClaude = clientName === 'claude';

  // ❌ WRONG: Don't recalculate
  // const isClaude = redirect_uri && redirect_uri.includes('claude.ai');

  // Use detected client for OAuth app selection
  const oauthClientId = clientConfig?.clientIdEnv
    ? process.env[clientConfig.clientIdEnv]
    : process.env.DEFAULT_CLIENT_ID;
}
```

### Diagnostic Commands (Updated Nov 15, 2025)

#### Verify Client Detection in Production
```bash
# Check recent client detections
ssh <PROD_USER>@<PROD_HOST> "grep 'client_detected' /var/log/paichart/oauth-audit.log | tail -10 | jq"

# Expected output for Claude Desktop CLI:
{
  "action": "client_detected",
  "clientId": "claude-desktop",  // ✅ New split detection
  "redirectUri": "http://localhost:51949/callback",
  "metadata": {
    "selectedGitHubApp": "<CLAUDE_DESKTOP_GITHUB_CLIENT_ID>",  // ✅ Separate app
    "isClaude": true
  }
}

# Expected output for Claude Browser:
{
  "action": "client_detected",
  "clientId": "claude-browser",  // ✅ Browser variant
  "redirectUri": "https://claude.ai/api/mcp/auth_callback",
  "metadata": {
    "selectedGitHubApp": "<REDACTED-SECRET>",  // ✅ Original Claude app
    "isClaude": true
  }
}
```

#### Track Client Distribution
```bash
# Which clients are authenticating?
ssh <PROD_USER>@<PROD_HOST> "grep 'client_detected' /var/log/paichart/oauth-audit.log | jq -r '.clientId' | sort | uniq -c"

# Expected (after split):
#   15 chatgpt
#   35 claude-desktop (CLI)
#    7 claude-browser (Browser)
#    8 gemini
#    3 webapp
```

#### Verify detectOAuthClient() Helper Deployed
```bash
# Check code on production
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && grep -A30 'detectOAuthClient(redirect_uri)' lib/mcp/server/routes/oauth-flow-routes.ts lib/auth/oauth/auth-manager.ts | head -35"

# Should show gemini → chatgpt → claude-desktop → claude-browser order
```

#### Debug Client Detection Issues
```bash
# Enable debug logging (add to authorization handler — uses pino authLogger)
authLogger.debug({
  redirectUri: redirect_uri,
  detectedClientName,
  detectedProvider: detectedClientConfig?.defaultProvider,
  clientIdEnv: detectedClientConfig?.clientIdEnv,
  envValue: process.env[detectedClientConfig?.clientIdEnv]
}, 'Client detection');

# View pino JSON logs (structured — filterable by domain/level)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep -i 'client.*detect' | jq"

# View with LOG_LEVEL=debug for verbose output
ssh <PROD_USER>@<PROD_HOST> "LOG_LEVEL=debug pm2 restart paichart && sleep 3 && pm2 logs paichart --lines 50 --nostream | grep '\"domain\":\"auth\"' | jq"
```

### Common Pitfalls (Updated Nov 15, 2025)

#### Pitfall 1: GitHub OAuth Apps Only Allow ONE Callback URL 🚨 CRITICAL

**Problem**: Attempting to add multiple callback URLs to a single GitHub OAuth app.

**Discovery**: GitHub OAuth app settings do NOT support multiple callback URLs per app.

**Example Failure**:
```
Attempting to configure one app with:
- https://claude.ai/api/mcp/auth_callback (browser)
- http://localhost/callback (CLI)
❌ GitHub UI only allows ONE callback URL
```

**Solution**: Create SEPARATE GitHub OAuth apps for different callback URL patterns.

**Correct Approach**:
```javascript
// Create 5 separate GitHub OAuth apps:
1. Web App: https://paichart.app/api/auth/oauth/callback/github
2. Gemini CLI: http://localhost:7777/oauth/callback
3. ChatGPT: https://chatgpt.com/connector_platform_oauth_redirect
4. Claude Browser: https://claude.ai/api/mcp/auth_callback
5. Claude Desktop: http://localhost/callback (NEW - supports dynamic ports)

// Map each client to its dedicated app:
const CLIENT_PROVIDER_MAP = {
  gemini: { clientIdEnv: 'GEMINI_GITHUB_CLIENT_ID' },
  chatgpt: { clientIdEnv: 'CHATGPT_MICROSOFT_CLIENT_ID' },
  'claude-desktop': { clientIdEnv: 'CLAUDE_DESKTOP_GITHUB_CLIENT_ID' },  // NEW
  'claude-browser': { clientIdEnv: 'CLAUDE_GITHUB_CLIENT_ID' }
}
```

**Impact**: This is why Claude Desktop authentication was failing - trying to use browser callback URL for CLI localhost callbacks.

#### Pitfall 2: Wrong Detection Order
```javascript
// ❌ WRONG: Claude Desktop checked before Gemini
const CLIENT_PROVIDER_MAP = {
  'claude-desktop': { detect: (uri) => uri?.includes('localhost') && uri?.includes('/callback') },
  gemini: { detect: (uri) => uri?.includes('localhost:7777') }
}
// Result: Gemini matches claude-desktop first → Wrong client ID!

// ✅ CORRECT: Gemini checked first (most specific)
const CLIENT_PROVIDER_MAP = {
  gemini: { detect: (uri) => uri?.includes('localhost:7777') },
  'claude-desktop': { detect: (uri) => uri?.includes('localhost') && uri?.includes('/callback') }
}
```

#### Pitfall 3: Hardcoding Claude Desktop Ports
```javascript
// ❌ WRONG: Hardcoded port
'claude-desktop': { detect: (uri) => uri?.includes('localhost:49399') }
// Result: Port changes to 64385 → Not detected → Falls back to webapp!

// ✅ CORRECT: Dynamic port detection
'claude-desktop': { detect: (uri) => uri?.includes('localhost') && uri?.includes('/callback') }
```

#### Pitfall 4: Not Using detectOAuthClient() Helper Consistently (CRITICAL!)
```javascript
// ❌ WRONG: Recalculating detection in each handler
async handleMicrosoftAuthorize(req, res) {
  const isClaude = redirect_uri && redirect_uri.includes('claude.ai'); // Recalculated!
}

async handleGitHubTokenExchange(req, res) {
  const isClaude = redirect_uri && redirect_uri.includes('claude.ai'); // Recalculated again!
}

// ✅ CORRECT: Use centralized detectOAuthClient() helper
async handleMicrosoftAuthorize(req, res) {
  const { clientName } = this.detectOAuthClient(redirect_uri); // Uses helper
  const isClaude = clientName === 'claude-desktop' || clientName === 'claude-browser';
}

async handleGitHubTokenExchange(req, res) {
  const { clientName } = this.detectOAuthClient(redirect_uri); // Same logic!
  const isClaude = clientName === 'claude-desktop' || clientName === 'claude-browser';
}
```

**Why This Matters**: Fix #4 (ee43b2d) only fixed ONE handler but left THREE others broken, causing OAuth to fail.

#### Pitfall 5: Provider-Client ID Mismatch
```javascript
// ❌ WRONG: ChatGPT defaults to Microsoft but returns GitHub client ID
{
  chatgpt: {
    defaultProvider: 'microsoft',
    clientIdEnv: 'CHATGPT_GITHUB_CLIENT_ID'  // ❌ Mismatch!
  }
}

// ✅ CORRECT: Provider and client ID must match
{
  chatgpt: {
    defaultProvider: 'microsoft',
    clientIdEnv: 'CHATGPT_MICROSOFT_CLIENT_ID'  // ✅ Matches provider
  }
}
```

### Integration Points

**Registration Handler** (lines 2246-2360):
- Detects client type from `redirect_uris` in request body
- Returns appropriate client ID for detected client
- Should align with CLIENT_PROVIDER_MAP logic

**Authorization Handler** (lines 1789-1950):
- Uses CLIENT_PROVIDER_MAP for provider and client ID selection
- Critical that this NEVER recalculates detection

**GitHub OAuth Handler** (lines 1909-1940):
- MUST use `detectedClientName` from CLIENT_PROVIDER_MAP
- MUST NOT recalculate `isClaude`, `isChatGPT`, `isGeminiCLI`

**Microsoft OAuth Handler** (lines 1050-1100):
- Uses same client detection pattern
- Should be updated to use CLIENT_PROVIDER_MAP

### Success Criteria (Updated Nov 15, 2025)

✅ **Client Detection** (5 distinct clients):
- ChatGPT (chatgpt.com) → "chatgpt" → Microsoft OAuth → CHATGPT_MICROSOFT_CLIENT_ID
- Claude Desktop (localhost:*/callback) → "claude-desktop" → GitHub OAuth → CLAUDE_DESKTOP_GITHUB_CLIENT_ID 🆕
- Claude Browser (claude.ai) → "claude-browser" → GitHub OAuth → CLAUDE_GITHUB_CLIENT_ID
- Gemini CLI (localhost:7777) → "gemini" → GitHub OAuth → GEMINI_GITHUB_CLIENT_ID
- Unknown → "webapp" → GitHub OAuth → GITHUB_CLIENT_ID (fallback)

✅ **OAuth Audit Logs**:
- `client_detected` event shows correct `clientId` ("claude-desktop" for CLI, "claude-browser" for browser)
- `metadata.selectedGitHubApp` matches expected client ID for each variant
- No provider-client ID mismatches
- Both Claude variants correctly identified and routed

✅ **Authentication Success**:
- All 5 clients complete OAuth flow successfully
- Claude Desktop CLI authenticates with localhost callback
- Claude Browser authenticates with claude.ai callback
- No "MCP error -32603: Internal error" from project(action: "pov.list")
- `authenticated: true` in hub info
- Separate GitHub OAuth apps properly configured for each callback URL pattern

✅ **Environment Configuration**:
- `CLAUDE_DESKTOP_GITHUB_CLIENT_ID` set in GitHub Secrets
- `CLAUDE_DESKTOP_GITHUB_CLIENT_SECRET` set in GitHub Secrets
- New GitHub OAuth app created with `http://localhost/callback` registered
- Deployment workflow includes new environment variables

### Related Documentation

- **Bug Report**: `/cline_docs/oauth-claude-bug-report.md` - Complete analysis of Claude Desktop authentication failure
- **Setup Guide**: `/cline_docs/claude-desktop-oauth-setup-steps.md` - Step-by-step GitHub OAuth app creation 🆕
- **Redirect Loop Analysis**: `/cline_docs/claude-desktop-oauth-redirect-loop-analysis.md` - Original callback handler investigation
- **OAuth Audit Logging**: `/.claude/knowledge/domain/oauth/oauth-audit-logging-quick-ref.md` - Monitoring commands

## Core Knowledge and Expertise

### OAuth Provider Configurations (Updated 2025-11-15)

**GitHub OAuth (5 separate apps for different clients)**:

| Client | GitHub Client ID | GitHub Secret Name | Callback URL | Session Mode |
|--------|-----------------|-------------------|--------------|--------------|
| **Web App** | `Ov23ligMA2fCPQarlM6h` | `GITHUB_CLIENT_ID` | `https://paichart.app/api/auth/oauth/callback/github` | Stateful |
| **Gemini CLI** | `Ov23liVv4beh4BFKIpBT` | `GEMINI_GITHUB_CLIENT_ID` | `http://localhost:7777/oauth/callback` | Stateless |
| **ChatGPT** | `Ov23lipNE6HwohVfv9NC` | `CHATGPT_GITHUB_CLIENT_ID` | `https://chatgpt.com/connector_platform_oauth_redirect` | Stateless |
| **Claude Browser** | `<REDACTED-SECRET>` | `CLAUDE_GITHUB_CLIENT_ID` | `https://claude.ai/api/mcp/auth_callback` | Stateful |
| **Claude Desktop** | **TBD - Create new app** | `CLAUDE_DESKTOP_GITHUB_CLIENT_ID` | `http://localhost/callback` | Stateful 🆕 |

**🚨 CRITICAL NOTE**: GitHub OAuth apps only allow ONE callback URL per app. Claude Desktop CLI (`localhost` callbacks) and Claude.ai Browser (`claude.ai` callbacks) require separate OAuth apps.

**Microsoft OAuth (Azure AD)** - ✅ **PRODUCTION (2025-10-14)**:
- Application ID: `f2e44a69-2bba-44e5-8beb-7940b4125c02` - **CURRENT**
- ~~Old App ID: `bff19a19-8b1e-4310-bf71-ecd1ba7f178e`~~ - **DEPRECATED**
- Environment Variables: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
- **Redirect URIs** (all registered in single Azure AD app):
  - `https://paichart.app/api/auth/oauth/callback/microsoft` (Web App)
  - `https://claude.ai/api/mcp/auth_callback` (Claude Desktop MCP)
  - `https://chatgpt.com/connector_platform_oauth_redirect` (ChatGPT MCP)
  - `http://localhost:7777/oauth/callback` (Gemini CLI - dev/testing)
- Tenant: Common (multi-tenant)
- Token Lifetime: Access 60-90 min, Refresh 90 days
- **Implementation**: Plan v3.2 complete with circuit breakers and retry logic
- **Architecture**: Hybrid - Web App stateful, MCP stateful (different from GitHub's stateless MCP)

**Google OAuth** - PLANNED:
- GitHub Secret: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Callback: `https://paichart.app/oauth/callback/google` (MCP OAuth)
- Token Lifetime: Access 1 hour, Refresh 6 months

**Client Detection Logic** — `AuthManager.detectOAuthClient` in `lib/auth/oauth/auth-manager.ts` (Wave 3a Phase 3.8d migration, May 2026). Was at `mcp-server-http-clean.js:764-779` pre-Wave-3a:
```javascript
// Detects client by redirect_uri parameter
function detectOAuthClient(redirect_uri) {
  if (redirect_uri.includes('chatgpt.com')) return 'CHATGPT_GITHUB_CLIENT_ID';
  if (redirect_uri.includes('localhost:7777')) return 'GEMINI_GITHUB_CLIENT_ID';
  if (redirect_uri.includes('claude.ai')) return 'CLAUDE_GITHUB_CLIENT_ID';
  return 'GITHUB_CLIENT_ID'; // Default to web app
}
```

### Multi-Client OAuth Patterns

**Stateless vs Stateful Session Management**:

**Stateless Clients** (ChatGPT, Gemini, Claude.ai browser):
- No session persistence between requests
- OAuth token sent with EVERY request
- DELETE requests after auth completion (return 200 OK)
- No token storage required
- Client must handle token persistence

**Stateful Clients** (Claude Code, Web App):
- Session persistence across requests
- OAuth token stored server-side (MCP OAuth: MCPOAuthTokenManager, Web App: EnterpriseOAuthService)
- Cookie-based session management
- Server handles token refresh

**PKCE (Proof Key for Code Exchange)**:

**Required for**: ChatGPT (MUST forward code_challenge/code_verifier)
**Optional for**: Claude, Gemini
**Flow**:
```
1. Client generates code_verifier (random string)
2. Client hashes to create code_challenge
3. Authorization: Send code_challenge to pAIchart
4. pAIchart forwards code_challenge to provider (GitHub/Microsoft/Google)
5. Token exchange: Client sends code_verifier to pAIchart
6. pAIchart forwards code_verifier to provider
7. Provider validates: SHA256(code_verifier) === code_challenge
8. Provider returns access token
```

**Critical Implementation** (mcp-server-http-clean.js):
```javascript
// Authorization endpoint - MUST forward PKCE params
if (code_challenge) {
  providerAuthUrl.searchParams.set('code_challenge', code_challenge);
  providerAuthUrl.searchParams.set('code_challenge_method', code_challenge_method || 'S256');
}

// Token exchange endpoint - MUST forward code_verifier
if (code_verifier) {
  tokenParams.append('code_verifier', code_verifier);
}
```

### Provider-Specific Patterns

**GitHub OAuth**:
- Token Lifetime: 1+ year (effectively permanent)
- Refresh: Not needed (tokens don't expire)
- Scope: `read:user`, `user:email`
- Validation: `GET /user` endpoint
- Token Format: `gho_*` or `ghp_*`
- Works with: Claude Desktop, ChatGPT, Gemini, Web App

**Microsoft OAuth (Azure AD)** - NEW:
- Token Lifetime: Access 60-90 min, Refresh 90 days
- Refresh: REQUIRED (short-lived access tokens)
- Scope: `openid`, `profile`, `email`, `offline_access` (for refresh token)
- Validation: `GET /me` endpoint (Microsoft Graph API)
- Token Format: JWT (eyJ...)
- Multi-tenant: Supports personal and organizational accounts
- **Key Difference from GitHub**: Requires token refresh service integration

**Google OAuth** - PLANNED:
- Token Lifetime: Access 1 hour, Refresh 6 months
- Refresh: REQUIRED (short-lived access tokens)
- Scope: `openid`, `email`, `profile`
- Validation: `GET /oauth2/v3/userinfo` endpoint
- Token Format: JWT (eyJ...)
- **Key Difference from GitHub**: Requires token refresh service integration

### Cross-Client Coordination Challenges

**Challenge 1: Token Lifetime Variation**
- GitHub: 1+ year (stateless OK)
- Microsoft: 60-90 min (MUST use MCPOAuthTokenManager + TokenRefreshService)
- Google: 1 hour (MUST use MCPOAuthTokenManager + TokenRefreshService)

**Solution**:
```typescript
// Hybrid approach: Stateless for GitHub, Stateful for Microsoft/Google
if (provider === 'github') {
  // Validate per-request, no storage
  await validateGitHubToken(accessToken);
} else if (provider === 'microsoft' || provider === 'google') {
  // Store in MCPOAuthTokenManager, use TokenRefreshService
  MCPOAuthTokenManager.storeToken(userId, tokenData);
}
```

**Challenge 2: Client Detection Ambiguity**
- Multiple clients may use same callback URL pattern
- User-agent may not be reliable
- Need fallback detection mechanisms

**Solution**:
```javascript
// Priority: redirect_uri > user-agent > state parameter
function detectClient(redirect_uri, user_agent, state) {
  // 1. Check redirect_uri (most reliable)
  if (redirect_uri.includes('chatgpt.com')) return 'chatgpt';
  if (redirect_uri.includes('localhost:7777')) return 'gemini';

  // 2. Check user-agent (fallback)
  if (user_agent.includes('openai-mcp')) return 'chatgpt';
  if (user_agent.includes('gemini-cli')) return 'gemini';

  // 3. Default to Claude/web app
  return 'claude';
}
```

**Challenge 3: PKCE Forwarding**
- ChatGPT requires PKCE, others don't
- Must forward code_challenge/code_verifier correctly
- GitHub, Microsoft, Google all support PKCE differently

**Solution**:
```javascript
// Always forward PKCE if provided (even if optional)
const authParams = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: scope,
  response_type: 'code',
  state: state
});

// Forward PKCE if present
if (code_challenge) {
  authParams.set('code_challenge', code_challenge);
  authParams.set('code_challenge_method', code_challenge_method || 'S256');
}
```

## Critical Implementation Patterns

### Pattern 1: Client-Specific OAuth App Selection
```javascript
// mcp-server-http-clean.js implementation
function getOAuthCredentials(redirect_uri) {
  if (redirect_uri.includes('chatgpt.com')) {
    return {
      clientId: process.env.CHATGPT_GITHUB_CLIENT_ID,
      clientSecret: process.env.CHATGPT_GITHUB_CLIENT_SECRET,
      provider: 'github',
      client: 'chatgpt'
    };
  }
  if (redirect_uri.includes('localhost:7777')) {
    return {
      clientId: process.env.GEMINI_GITHUB_CLIENT_ID,
      clientSecret: process.env.GEMINI_GITHUB_CLIENT_SECRET,
      provider: 'github',
      client: 'gemini'
    };
  }
  if (redirect_uri.includes('claude.ai')) {
    return {
      clientId: process.env.CLAUDE_GITHUB_CLIENT_ID,
      clientSecret: process.env.CLAUDE_GITHUB_CLIENT_SECRET,
      provider: 'github',
      client: 'claude'
    };
  }
  // Default: Web app
  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    provider: 'github',
    client: 'webapp'
  };
}
```

### Pattern 2: Provider-Agnostic Token Validation
```javascript
// lib/auth/oauth/multi-provider-validator.js
async function validateToken(provider, accessToken) {
  switch (provider) {
    case 'github':
      return await validateGitHubToken(accessToken);
    case 'microsoft':
      return await validateMicrosoftToken(accessToken);
    case 'google':
      return await validateGoogleToken(accessToken);
    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
  }
}

async function validateGitHubToken(accessToken) {
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  return await response.json();
}

async function validateMicrosoftToken(accessToken) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  return await response.json();
}

async function validateGoogleToken(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  return await response.json();
}
```

### Pattern 3: Microsoft MCP OAuth Implementation (PRODUCTION - 2025-10-14)

**Complete implementation** of Microsoft OAuth for AI clients following Plan v3.2:

**Key Implementation Components**:
1. **MCPOAuthTokenManager** (`/lib/auth/oauth/mcp-oauth-token-manager.ts`):
   - Separate token storage: `mcp_oauth_${userId}_microsoft`
   - Auto-refresh triggers at 10 min before expiry
   - Circuit breaker integration per provider
   - Methods: storeToken(), getToken(), getTokenStats(), getAllCircuitBreakers()

2. **Microsoft OAuth Handlers** (`/mcp-server-http-clean.js`):
   ```javascript
   // Lines 791-839: Authorization handler
   handleMicrosoftAuthorize(req, res) {
     // Client detection
     const msClientId = isClaude
       ? (process.env.CLAUDE_MICROSOFT_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID)
       : process.env.MICROSOFT_CLIENT_ID;

     // Build Microsoft auth URL
     const msAuthUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
     msAuthUrl.searchParams.set('client_id', msClientId);
     msAuthUrl.searchParams.set('redirect_uri', redirect_uri); // AI platform callback
     msAuthUrl.searchParams.set('scope', 'openid profile email User.Read');

     // Forward PKCE for ChatGPT
     if (code_challenge) {
       msAuthUrl.searchParams.set('code_challenge', code_challenge);
       msAuthUrl.searchParams.set('code_challenge_method', code_challenge_method || 'S256');
     }

     res.redirect(msAuthUrl.toString());
   }

   // ~~handleMicrosoftTokenExchange (276 LOC)~~ — DELETED Wave 3b.0a
   // (2026-05-12, commit 0f07ac90). Zero production callers. Live token
   // exchange flow uses exchangeMicrosoftCode() helper (~185 LOC) routed
   // through the /oauth/token endpoint with provider=microsoft. Historical
   // shape preserved here for reference only:
   /*
   async handleMicrosoftTokenExchange(req, res) {  // DELETED
     if (MCPOAuthTokenManager.isCircuitOpen('microsoft')) {
       return res.status(503).json({ error: 'service_unavailable' });
     }
     const response = await fetchWithRetry(msTokenUrl, params, {
       maxAttempts: 3,
       retryableStatusCodes: [429, 503, 504]
     });
     MCPOAuthTokenManager.storeToken(user.id, { ... });
     MCPOAuthTokenManager.recordSuccess('microsoft');
     return res.json({ access_token, token_type, expires_in, scope });
   }
   */

   // ~~refreshMicrosoftToken (144 LOC)~~ — DELETED Wave 3b.0a (2026-05-12).
   // Zero production callers. Microsoft refresh flow now uses the /oauth/token
   // endpoint with grant_type=refresh_token (handled in the live token
   // exchange path). Historical shape preserved here for reference only:
   /*
   async refreshMicrosoftToken(userId, refreshToken) {  // DELETED
     if (MCPOAuthTokenManager.isCircuitOpen('microsoft')) {
       throw new Error('Circuit breaker OPEN');
     }
     const response = await fetchWithRetry(msTokenUrl, refreshParams, {
       maxAttempts: 3,
       initialDelay: 2000
     });
     MCPOAuthTokenManager.storeToken(userId, updatedTokenData);
     MCPOAuthTokenManager.recordSuccess('microsoft');
   }
   */

   // ~~Auto-refresh middleware~~ — REMOVED Phase 3.0a (May 2026): had zero callers,
   // never wired into Express chain. Microsoft token refresh now triggered on-demand
   // via /oauth/token endpoint with grant_type=refresh_token (refreshMicrosoftToken
   // helper was also deleted in Wave 3b.0a 2026-05-12 — zero callers).
   // Historical pattern preserved below for reference (do NOT re-introduce as middleware):
   /*
   async mcpOAuthRefreshMiddleware(req, res, next) {  // REMOVED
     // Only for Microsoft/Google (GitHub tokens are long-lived)
     if (user.authMethod.includes('microsoft')) {
       const tokenData = MCPOAuthTokenManager.getToken(user.id, 'microsoft');
       const expiresIn = tokenData.expiresAt.getTime() - Date.now();

       // Refresh if <10 minutes until expiry
       if (expiresIn < 10 * 60 * 1000) {
         await this.refreshMicrosoftToken(user.id, tokenData.refreshToken); // refreshMicrosoftToken DELETED Wave 3b.0a — example only
       }
     }
     next();
   }
   */
   ```

3. **Provider Selection Mechanism** (Phase 1):
   ```javascript
   // Lines 1250-1288: Authorization routing
   GET /oauth/authorize?provider=microsoft&redirect_uri=https://claude.ai/...
     ↓ Validates provider (github or microsoft)
     ↓ Routes to handleMicrosoftAuthorize() or GitHub handler

   // Token exchange routing (grep `app.post.*oauth/token` for current location)
   POST /oauth/token
   Body: { provider: "microsoft", code: "...", redirect_uri: "...", code_verifier: "..." }
     ↓ Validates provider
     ↓ Routes to exchangeMicrosoftCode() helper or GitHub handler
     //   NOTE: legacy handleMicrosoftTokenExchange (276 LOC) deleted Wave 3b.0a
   ```

4. **Circuit Breaker & Retry** (Phase 0.9):
   - **Circuit Breaker**: 5 failures → OPEN, 60s timeout → HALF_OPEN, 2 successes → CLOSED
   - **Retry Logic**: Exponential backoff (1s, 2s, 4s), respects Retry-After header
   - **Provider Isolation**: Each provider has independent circuit breaker state
   - **Health Monitoring**: `.circuitBreakers.mcpOAuth` shows per-provider status

**Cross-Client Compatibility**:
- ✅ Claude Desktop: Full support with `?provider=microsoft` parameter
- ✅ ChatGPT: Full support with PKCE forwarding
- ✅ Gemini CLI: Full support (localhost callback + provider parameter)
- ✅ Web App: Separate flow via EnterpriseOAuthService (architectural boundary maintained)

**Deployment Status**:
- ✅ Deployed: 2025-10-14 (commit 0037fc0)
- ✅ Production tested: Microsoft redirect working
- ✅ Health monitoring: Showing separate MCP OAuth vs Web App OAuth stats
- ⏳ Awaiting: First Microsoft OAuth authentication flow to verify end-to-end

### Pattern 3: Hybrid Token Storage Strategy
```javascript
// lib/auth/oauth/multi-client-token-manager.js
class MultiClientTokenManager {
  static async handleTokenStorage(provider, client, userId, tokenData) {
    // GitHub: Stateless (no storage for MCP clients)
    if (provider === 'github' && ['chatgpt', 'gemini', 'claude'].includes(client)) {
      // Validate once, don't store (long-lived tokens)
      return { stored: false, reason: 'stateless_github' };
    }

    // Microsoft/Google: Stateful (MUST store for MCP clients)
    if ((provider === 'microsoft' || provider === 'google') && ['chatgpt', 'gemini', 'claude'].includes(client)) {
      await MCPOAuthTokenManager.storeToken(userId, {
        provider,
        client,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        refreshExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        lastRefreshed: new Date(),
        refreshAttempts: 0
      });
      return { stored: true, reason: 'stateful_microsoft_google' };
    }

    // Web App: Always stateful (EnterpriseOAuthService)
    if (client === 'webapp') {
      await EnterpriseOAuthService.storeToken(userId, tokenData);
      return { stored: true, reason: 'webapp_stateful' };
    }
  }
}
```


---

## Architectural Learning Notes

### Microsoft MCP OAuth Implementation (2025-10-13)
**Source**: architectural-review-specialist review of microsoft-mcp-auth-plan.md v2→v3
**Lesson**: oauth-multi-client-specialist is uniquely positioned to validate provider coordination patterns that other specialists miss.

**Critical Multi-Client Considerations for Microsoft OAuth**:
1. **Token Lifetime Mismatch**: GitHub tokens last 1+ year (stateless OK), Microsoft tokens last 60-90 min (MUST use stateful storage)
2. **Client Detection**: Must distinguish Microsoft OAuth for ChatGPT vs Claude Desktop vs Gemini (same callback patterns)
3. **Provider Coordination**: Microsoft Graph API has different rate limits, error codes, and validation endpoints than GitHub
4. **Cross-Provider Token Storage**: GitHub tokens don't need storage (MCP OAuth stateless), Microsoft tokens MUST use MCPOAuthTokenManager (MCP OAuth stateful)

**What Other Specialists Missed**:
- auth-permissions-specialist: Validated OAuth patterns but didn't check multi-provider coordination
- integration-manager-specialist: Validated token storage but didn't check provider-specific lifetime differences
- mcp-hub-specialist: Validated MCP protocol but didn't check cross-client token lifecycle
- architectural-review-specialist: Caught dual OAuth architecture violation but didn't validate provider-specific patterns

**Prevention**:
- ✅ ALWAYS validate token lifetime differences between providers (GitHub: years, Microsoft/Google: minutes)
- ✅ ALWAYS check client detection works across all providers (not just GitHub)
- ✅ ALWAYS verify provider-specific validation endpoints (GitHub: /user, Microsoft: /me, Google: /userinfo)
- ✅ ALWAYS confirm token storage strategy matches provider lifetime (stateless for GitHub, stateful for Microsoft/Google)

---

