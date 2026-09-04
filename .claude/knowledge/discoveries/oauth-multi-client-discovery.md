# OAuth Multi-Client Discovery Task

**Last Updated**: 2026-03-26 (Updated for OAuth proxy pattern, added proxy infrastructure grep commands)
**Status**: Comprehensive v3.1 - Multi-Client OAuth with Proxy Pattern & Audit Logging
**Confidence**: Very High - Complete multi-client OAuth system with logging
**Purpose**: Enable oauth-multi-client-specialist to validate multi-client coordination and audit logging

## 🆕 2026-05-24 Session — Run These Greps FIRST

```bash
# verifyAccessToken call-site inventory (4 actual sites; 1 wired with expectedClientId)
grep -rnE "verifyAccessToken" lib/ app/ mcp-server-http-clean.js 2>/dev/null \
  | grep -v node_modules | grep -v test \
  | grep -v "function verifyAccessToken\|export.*verifyAccessToken\|import.*verifyAccessToken"
# Wired:   lib/auth/oauth/auth-manager.ts:387 (U2 Path B v3)
# Unwired: lib/api-handler.ts:137, lib/auth/mcp-http-middleware.ts:72, lib/auth/oauth/auth-manager.ts:403

# DCR storage check — Phase 0 finding: DOES NOT exist
grep -nE "^model.*[Oo]auth[Cc]lient" prisma/schema.prisma   # → expect zero matches
ssh <PROD_USER>@<PROD_HOST> 'cd /var/www/paichart-app/current && source .env.production && psql "$DATABASE_URL" -c "\dt" | grep -i oauth'   # zero oauth tables

# ChatGPT DCR regression fix shipped (89d5ec5f)
grep -nE "isChatGPT|connector_platform_oauth_redirect|connector/oauth" lib/mcp/server/routes/oauth-flow-routes.ts

# Allowlist source CONFLICT resolved (env vars are server↔provider only, never in JWT azp)
grep -nE "MICROSOFT_CLIENT_ID|GITHUB_CLIENT_ID" lib/auth/oauth/oauth-config.ts mcp-server-http-clean.js | head -5
```

Related: `cline_docs/reviews/expected-client-id-wiring-2026-05-24/` (6-specialist plan, blocked on DCR storage), `cline_docs/follow-ups/expected-client-id-wiring-2026-05-24.md` (Phase A inventory table).

---

## Objective

Perform a comprehensive discovery of pAIchart's multi-client OAuth implementation supporting multiple AI clients (Claude Desktop, ChatGPT, Gemini) and multiple OAuth providers (GitHub, Microsoft, Google). This discovery investigates provider coordination patterns, client detection logic, token lifecycle management, PKCE implementation, and cross-client security isolation.

## Context

pAIchart implements **dual OAuth architectures**:
- **MCP OAuth (System A)**: Stateless/stateful authentication for AI clients (Claude, ChatGPT, Gemini)
- **Web App OAuth (System B)**: Stateful authentication for browser users

This discovery focuses on **MCP OAuth (System A)** multi-client coordination patterns.

## Critical Architecture Documentation

**ALWAYS review these documents before OAuth multi-client changes**:

1. **`/cline_docs/oauth-architecture-clarification.md`** - Dual OAuth architecture (MCP OAuth vs Web App OAuth)
   - **Why Critical**: Defines System A (MCP OAuth - AI Clients) vs System B (Web App OAuth - Browser Users)
   - **Review when**: Adding new OAuth providers (Microsoft, Google), configuring client detection, implementing token management

2. **`/cline_docs/oauth-system-boundaries.md`** - System boundary rules and type guards (if exists)
   - **Why Critical**: Prevents mixing MCP OAuth and Web App OAuth token storage

## Discovery Scope

### Section 1: OAuth Provider Configurations
- [ ] GitHub OAuth (4 separate apps: Web, Gemini, ChatGPT, Claude)
- [ ] Microsoft OAuth (Azure AD - PLANNED)
- [ ] Google OAuth (PLANNED)
- [ ] Callback URLs and redirect patterns
- [ ] Token lifetimes (GitHub: 1+ year, Microsoft: 60-90 min, Google: 1 hour)
- [ ] Validation endpoints (GitHub: /user, Microsoft: /me, Google: /userinfo)
- [ ] Provider-specific client_id/client_secret environment variables
- [ ] GitHub secret naming restrictions (PAICHART_GITHUB_CLIENT_ID vs GITHUB_CLIENT_ID)

### Section 2: Multi-Client Coordination
- [ ] Client detection (Claude Desktop, Claude Code, ChatGPT, Gemini)
- [ ] Stateless vs stateful session management
- [ ] User-agent and redirect_uri patterns
- [ ] Session mode detection logic (persistent vs stateless)
- [ ] Client-specific OAuth app selection
- [ ] Fallback detection mechanisms (redirect_uri > user-agent > state parameter)
- [ ] Multi-client redirect URL patterns
- [ ] **Claude Code** stores credentials in `~/.claude/.credentials.json` (mcpOAuth section) with own refresh cycle
- [ ] **Proxy pattern**: ALL unknown/MCP CLI clients go through the org GitHub App (MCP_CLI_GITHUB_CLIENT_ID)

### Section 3: Token Lifetime Coordination
- [ ] GitHub: Long-lived (stateless OK, 1+ year, no refresh needed)
- [ ] Microsoft: Short-lived (stateful required, 60-90 min access, 90 days refresh)
- [ ] Google: Short-lived (stateful required, 1 hour access, 6 months refresh)
- [ ] **MCP first-party RS256**: 15-minute TTL — common 401 root cause when refresh breaks
- [ ] **OAuth validator HS256**: 24-hour TTL — minted by `mcp-oauth-validator.js` for provider users
- [ ] Hybrid token storage strategy validation
- [ ] MCPOAuthTokenManager integration for short-lived tokens
- [ ] TokenRefreshService integration for Microsoft/Google
- [ ] Cross-provider token lifecycle patterns

### Section 4: PKCE Implementation
- [ ] ChatGPT: PKCE required (code_challenge/code_verifier forwarding)
- [ ] Claude: PKCE optional
- [ ] Gemini: PKCE optional
- [ ] Provider-specific PKCE support (GitHub, Microsoft, Google)
- [ ] PKCE parameter forwarding in authorization endpoint
- [ ] PKCE parameter forwarding in token exchange endpoint
- [ ] code_challenge_method support (S256, plain)

### Section 5: Provider-Specific Validation Endpoints
- [ ] GitHub: api.github.com/user
- [ ] Microsoft: graph.microsoft.com/v1.0/me
- [ ] Google: googleapis.com/oauth2/v3/userinfo
- [ ] Generic token validation patterns (multi-provider)
- [ ] Error handling per provider
- [ ] Rate limiting considerations per provider

### Section 6: Cross-Client Token Isolation
- [ ] Token storage keys (prevent leaks between clients)
- [ ] Client-specific token access validation
- [ ] Token ownership checks
- [ ] User-based token isolation
- [ ] Provider-client combination uniqueness

### Section 7: Health Monitoring Separation
- [ ] MCP OAuth token count (MCPOAuthTokenManager)
- [ ] Web App OAuth token count (EnterpriseOAuthService)
- [ ] Provider-specific token counts (GitHub, Microsoft, Google)
- [ ] Circuit breaker status (TokenRefreshService)
- [ ] Token refresh failure tracking

### Section 8: Known Issues Investigation
- [ ] ChatGPT mobile app token persistence
- [ ] Microsoft token expiry (60-90 min)
- [ ] Cross-provider client detection ambiguity
- [ ] Token refresh service integration
- [ ] OAuth flow failures (PKCE, redirect mismatches)

### Section 9: OAuth Audit Logging Discovery (NEW - Nov 11, 2025)
- [ ] Client detection logging (`client_detected` event)
- [ ] Client registration logging (`oauth_client_registration` event)
- [ ] Correlation ID tracking for multi-client flows
- [ ] Client-specific monitoring queries
- [ ] Cross-client OAuth flow analysis
- [ ] Client detection accuracy validation

### Section 10: OAuth Proxy Pattern Infrastructure (NEW - Mar 2026)
- [ ] redirect_uri allowlist (`isAllowedRedirectUri`, `allowedDomains`)
- [ ] Server's own callback URL (`serverCallbackUrl`, `OAUTH_CALLBACK_URL`)
- [ ] Auth code lifecycle (`pac_` prefix, `generateAuthCode`, `exchangeAuthCode`)
- [ ] Callback rate limiting (`AuthManager.checkCallbackRateLimit` — Phase 3.9, May 2026. Replaced inline `_callbackRateLimit` Map. Returns `{allowed, retryAfterSeconds?}`; caller sets `Retry-After` header per RFC 6585 §4.)
- [ ] MCP CLI GitHub App (`MCP_CLI_GITHUB_CLIENT_ID`)

## Search Strategies

### 0. OAuth Audit Logging (NEW - Nov 11, 2025)

#### 0.1 Client Detection Logging
```bash
echo "=== OAuth Client Detection Logging ==="

# Find client detection logging
grep -n "client_detected\|clientId.*chatgpt\|clientId.*gemini\|clientId.*claude" mcp-server-http-clean.js | head -20

# Check OAuth audit logger usage for clients
grep -n "oauthLogger.*client" mcp-server-http-clean.js lib/auth/oauth/*.js | head -30

# Verify client registration logging
grep -n "oauth_client_registration" mcp-server-http-clean.js | head -10
```

**Questions to answer**:
- Are ChatGPT, Gemini, and Claude detection logged?
- Is client type captured in OAuth audit log?
- Are correlation IDs generated for each client flow?
- What metadata is logged for client detection?

#### 0.2 OAuth Audit Log Analysis (Production)
```bash
echo "=== OAuth Audit Log Client Analysis ==="

# Analyze client types in OAuth audit log
ssh <PROD_USER>@<PROD_HOST> "grep 'client_detected' /var/log/paichart/oauth-audit.log | jq -r '.clientId' | sort | uniq -c"

# Check client registration events
ssh <PROD_USER>@<PROD_HOST> "grep 'oauth_client_registration' /var/log/paichart/oauth-audit.log | jq"

# ChatGPT-specific flows
ssh <PROD_USER>@<PROD_HOST> "grep '\"clientId\":\"chatgpt\"' /var/log/paichart/oauth-audit.log | jq -r '.action' | sort | uniq -c"

# Track multi-client correlation IDs
ssh <PROD_USER>@<PROD_HOST> "cat /var/log/paichart/oauth-audit.log | jq -r 'select(.correlationId) | .correlationId' | sort | uniq | wc -l"
```

**Questions to answer**:
- How many distinct clients have authenticated?
- Which clients use which providers?
- Are correlation IDs linking complete flows?
- What is the client distribution (ChatGPT vs Gemini vs Claude)?

#### 0.3 Correlation ID Tracking
```bash
echo "=== Correlation ID Discovery ==="

# Find correlation ID generation
grep -n "correlationId.*oauth-\|oauth-.*Math.random" mcp-server-http-clean.js | head -20

# Find correlation ID storage
# Note: Phase 2.x (May 2026) moved oauthRequests Map into SessionStore. Writes now go via
# this.sessionStore.setOAuthRequest(...) in mcp-server-http-clean.js; the OAuthRequestData
# interface (incl. correlationId field) lives in lib/auth/oauth/session-store.ts.
grep -n "sessionStore\.setOAuthRequest.*correlationId\|correlationId:" mcp-server-http-clean.js lib/auth/oauth/session-store.ts | head -30

# Find correlation ID usage in logging
grep -n "correlationId:" lib/auth/oauth/oauth-logger.ts lib/auth/oauth/mcp-oauth-validator.js mcp-server-http-clean.js | head -50
```

**Questions to answer**:
- Where are correlation IDs generated?
- How are they stored and propagated?
- Are they passed to all OAuth stages?
- Do they link client registration → authorize → token → validate?

#### 0.4 Pino Structured Logging for Multi-Client Debugging (NEW - Feb 2026)
```bash
echo "=== Pino Structured Logging — Multi-Client Auth Discovery ==="

# Find pino domain logger imports in OAuth files
echo "Domain logger imports in OAuth code:"
grep -rn "from.*lib/logger\|require.*lib/logger" lib/auth/oauth/ mcp-server-http-clean.js --include="*.ts" --include="*.js" | head -20

# authLogger usage in OAuth client detection and token flows
echo -e "\nauthLogger usage in OAuth code:"
grep -rn "authLogger\.\(info\|warn\|error\|debug\)" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -30

# mcpLogger usage in MCP server OAuth flows
echo -e "\nmcpLogger usage in MCP OAuth flows:"
grep -rn "mcpLogger\.\(info\|warn\|error\|debug\)" mcp-server-http-clean.js | grep -i "oauth\|client\|token\|scope" | head -20

# Check for correct pino object-first API (should be logger.method({ key: val }, 'msg'))
echo -e "\nPino API correctness check (should have object arg first):"
grep -rn "authLogger\.\(info\|warn\|error\)(" lib/auth/oauth/ mcp-server-http-clean.js --include="*.ts" --include="*.js" | head -20
```

**Questions to answer**:
- Which pino domain loggers (authLogger, mcpLogger) are used in OAuth code?
- Is the pino object-first API used correctly: `logger.method({ key: val }, 'message')`?
- Do log entries include client type (chatgpt/gemini/claude) in the context object?
- Are provider names and correlation IDs included in pino structured context?

#### 0.5 Production Pino Log Monitoring — Client Detection
```bash
echo "=== Production Pino Logs — Client Detection ==="

# pino auth domain logs — filter by client detection keywords
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | grep -i 'client' | jq" 2>/dev/null | tail -30

# pino auth errors (level 50 = error) — OAuth failures
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":50' | jq" 2>/dev/null | tail -20

# pino MCP domain logs — OAuth token exchanges
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"mcp\"' | grep -i 'token\|oauth' | jq" 2>/dev/null | tail -20

# Compare: OAuth audit log (separate custom file logger — NOT pino)
ssh <PROD_USER>@<PROD_HOST> "tail -30 /var/log/paichart/oauth-audit.log | jq '.action,.clientId,.provider'" 2>/dev/null
```

**Questions to answer**:
- Are pino structured logs flowing for client detection events?
- Do pino auth errors include client type and provider in context?
- Are both logging systems (pino + OAuth audit) producing complementary output?
- Can client detection failures be traced through pino JSON logs?

#### 0.6 OAuth Proxy Pattern Infrastructure (NEW - Mar 2026)
```bash
echo "=== OAuth Proxy Pattern Infrastructure Discovery ==="

# redirect_uri allowlist — which client redirect URIs are permitted
echo "Redirect URI allowlist:"
# Note: Phase 2.8 (May 2026) moved isAllowedRedirectUri to SessionStore. Callers in
# mcp-server-http-clean.js now use this.sessionStore.isAllowedRedirectUri(uri).
# The allowlist corpus (ALLOWED_OAUTH_REDIRECT_DOMAINS) is exposed as a static on the class.
grep -n 'sessionStore\.isAllowedRedirectUri\|ALLOWED_OAUTH_REDIRECT_DOMAINS\|allowedDomains' mcp-server-http-clean.js lib/auth/oauth/session-store.ts | head -15

# Server's own callback URL — sent to GitHub instead of client's redirect_uri
echo -e "\nServer callback URL:"
grep -n 'serverCallbackUrl\|OAUTH_CALLBACK_URL' mcp-server-http-clean.js | head -10

# Auth code lifecycle — pac_ prefixed codes generated by server, exchanged by client
echo -e "\nAuth code lifecycle (pac_ prefix):"
# Note: Phase 2.x (May 2026) moved authCodes Map + setAuthCode/exchangeAuthCode into
# SessionStore. callbacks in mcp-server-http-clean.js call this.sessionStore.setAuthCode(...)
# and this.sessionStore.exchangeAuthCode(...). The synchronous atomic get+delete invariant
# (replay-prevention) is preserved on SessionStore; race-tested in scripts/test-session-store.ts.
grep -n 'pac_\|sessionStore\.setAuthCode\|sessionStore\.exchangeAuthCode' mcp-server-http-clean.js lib/auth/oauth/session-store.ts | head -20

# Callback rate limiting
# Phase 3.9 (May 2026) migrated this to AuthManager — legacy `_callbackRateLimit` Map deleted.
# AuthManager.checkCallbackRateLimit owns the 30/min/IP gate + cleanupRateLimitState interval.
echo -e "\nCallback rate limiting:"
grep -n 'checkCallbackRateLimit\|Retry-After' mcp-server-http-clean.js lib/auth/oauth/auth-manager.ts | head -10

# MCP CLI GitHub App env var (used for all unknown/MCP CLI clients)
echo -e "\nMCP CLI GitHub App:"
grep -n 'MCP_CLI_GITHUB_CLIENT_ID\|MCP_CLI_GITHUB_CLIENT_SECRET' mcp-server-http-clean.js | head -10
```

**Questions to answer**:
- What domains/URIs are in the redirect_uri allowlist?
- What is the server's own callback URL (sent to GitHub)?
- How are `pac_` auth codes generated, stored, and exchanged?
- Is callback rate limiting in place?
- Is MCP_CLI_GITHUB_CLIENT_ID configured for MCP CLI clients (Smithery, Claude Code, etc.)?

## Search Strategies

### 1. OAuth Provider Configurations

#### 1.1 GitHub OAuth Apps (4 Separate Apps)
```bash
echo "=== GitHub OAuth Apps Discovery ==="

# Find GitHub OAuth app configurations (rationalized — 2 apps only)
echo "GitHub OAuth client IDs:"
grep -E "GITHUB_CLIENT_ID|MCP_CLI_GITHUB_CLIENT_ID" .env ecosystem.config.js 2>/dev/null | grep -v "^#"

# Find GitHub OAuth app secrets
echo -e "\nGitHub OAuth client secrets:"
grep -E "GITHUB_CLIENT_SECRET|MCP_CLI_GITHUB_CLIENT_SECRET" .env ecosystem.config.js 2>/dev/null | grep -v "^#"

# Verify proxy pattern callback URL (single server-owned callback)
echo -e "\nProxy callback URL:"
grep -rn "serverCallbackUrl\|OAUTH_CALLBACK_URL\|oauth/callback" mcp-server-http-clean.js | head -10

# Check client detection logic (CLIENT_PROVIDER_MAP — detect + defaultProvider only)
echo -e "\nClient detection by redirect_uri:"
grep -A30 "detectOAuthClient\|CLIENT_PROVIDER_MAP" mcp-server-http-clean.js | head -50

# Verify single org app used everywhere
echo -e "\nOrg app usage:"
grep -n "MCP_CLI_GITHUB_CLIENT_ID" mcp-server-http-clean.js | head -10

# GitHub OAuth App Summary (rationalized Mar 2026)
echo -e "\n=== GitHub OAuth App Summary ==="
echo "Rationalized to 2 apps (Mar 2026):"
echo "1. Web App: GITHUB_CLIENT_ID (web login only)"
echo "2. MCP (all clients): MCP_CLI_GITHUB_CLIENT_ID (org GitHub App, proxy pattern)"
echo "   Covers: Claude Desktop, Claude Browser, Gemini, ChatGPT GitHub, Smithery, Glama, mcporter"
```

#### 1.2 Microsoft OAuth (Azure AD) - PLANNED
```bash
echo "=== Microsoft OAuth Configuration Discovery ==="

# Find Microsoft OAuth configuration
echo "Microsoft OAuth client ID and secret:"
grep -r "MICROSOFT_CLIENT_ID\|MICROSOFT_CLIENT_SECRET\|MICROSOFT_TENANT_ID" .env ecosystem.config.js 2>/dev/null | grep -v "^#"

# Check Microsoft Graph API integration
echo -e "\nMicrosoft Graph API integration:"
grep -rn "graph.microsoft.com\|/v1.0/me\|validateMicrosoftToken" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20

# Verify Microsoft callback URLs
echo -e "\nMicrosoft callback URLs:"
grep -rn "callback.*microsoft\|redirect_uri.*microsoft" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -10

# Microsoft token lifetime configuration
echo -e "\nMicrosoft token lifetime settings:"
grep -rn "microsoft.*token.*lifetime\|access.*token.*60.*min\|90.*days\|refresh.*expires" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -15

# Microsoft OAuth endpoints
echo -e "\nMicrosoft OAuth endpoints:"
grep -rn "login.microsoftonline.com\|oauth2/v2.0/authorize\|oauth2/v2.0/token" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -10

# Microsoft scope configuration
echo -e "\nMicrosoft OAuth scopes:"
grep -rn "openid.*profile.*email\|User.Read\|offline_access" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -10

echo -e "\n=== Microsoft MCP OAuth Summary (PRODUCTION - 2025-10-14) ==="
echo "✅ DEPLOYED Configuration:"
echo "- Client ID: f2e44a69-2bba-44e5-8beb-7940b4125c02 (CURRENT)"
echo "- Old Client ID: bff19a19-8b1e-4310-bf71-ecd1ba7f178e (DEPRECATED)"
echo "- Tenant: Common (multi-tenant)"
echo "- Redirect URIs:"
echo "    - https://paichart.app/api/auth/oauth/callback/microsoft (Web App)"
echo "    - https://claude.ai/api/mcp/auth_callback (Claude Desktop MCP)"
echo "    - https://chatgpt.com/connector_platform_oauth_redirect (ChatGPT MCP)"
echo "    - http://localhost:7777/oauth/callback (Gemini CLI - dev)"
echo "- Token Lifetime: 60-90 min access, 90 days refresh"
echo "- Validation: https://graph.microsoft.com/v1.0/me"
echo "- Scopes: openid, profile, email, User.Read"
echo "- Implementation: Plan v3.2 complete (0037fc0)"
echo "- Components:"
echo "    - MCPOAuthTokenManager (lib/auth/oauth/mcp-oauth-token-manager.ts)"
echo "    - Circuit breaker (lib/auth/oauth/circuit-breaker-utils.ts)"
echo "    - Retry logic (lib/auth/oauth/retry-utils.ts)"
echo "    - Provider routing — split across:"
echo "      * lib/auth/oauth/auth-manager.ts (AuthManager.detectOAuthClient + CLIENT_PROVIDER_MAP — Wave 3a Phase 3.8d)"
echo "      * lib/mcp/server/routes/oauth-flow-routes.ts (R7/R8/R9 — Wave 6 Phase 6.4)"
echo "      * mcp-server-http-clean.js (handleMicrosoftAuthorize — Wave 7.4 Domain C backlog)"
```

#### 1.3 Google OAuth - PLANNED
```bash
echo "=== Google OAuth Configuration Discovery ==="

# Find Google OAuth configuration
echo "Google OAuth client ID and secret:"
grep -r "GOOGLE_CLIENT_ID\|GOOGLE_CLIENT_SECRET" .env ecosystem.config.js 2>/dev/null | grep -v "^#"

# Check Google OAuth API integration
echo -e "\nGoogle OAuth API integration:"
grep -rn "googleapis.com\|/oauth2/v3/userinfo\|validateGoogleToken" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20

# Verify Google callback URLs
echo -e "\nGoogle callback URLs:"
grep -rn "callback.*google\|redirect_uri.*google" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -10

# Google token lifetime configuration
echo -e "\nGoogle token lifetime settings:"
grep -rn "google.*token.*lifetime\|access.*token.*1.*hour\|refresh.*6.*months" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -15

# Google OAuth endpoints
echo -e "\nGoogle OAuth endpoints:"
grep -rn "accounts.google.com\|oauth2/v2/auth\|oauth2.googleapis.com/token" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -10

# Google scope configuration
echo -e "\nGoogle OAuth scopes:"
grep -rn "openid.*email.*profile" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -10

echo -e "\n=== Google OAuth Summary ==="
echo "Expected configuration:"
echo "- Callback: https://paichart.app/oauth/callback/google"
echo "- Token Lifetime: 1 hour access, 6 months refresh"
echo "- Validation: https://www.googleapis.com/oauth2/v3/userinfo"
echo "- Scopes: openid, email, profile"
```

#### 1.4 OAuth Environment Variable Validation
```bash
echo "=== OAuth Environment Variable Validation ==="

# Check all OAuth environment variables
echo "All OAuth configuration variables:"
printenv | grep -E "GITHUB|MICROSOFT|GOOGLE|OAUTH|PKCE|MCP_CLI" | sort

# Validate required OAuth variables
echo -e "\n=== Required OAuth Variables Check ==="
required_vars=(
  "GITHUB_CLIENT_ID"          # Web login
  "GITHUB_CLIENT_SECRET"
  "MCP_CLI_GITHUB_CLIENT_ID"  # Org app for all MCP clients (rationalized Mar 2026)
  "MCP_CLI_GITHUB_CLIENT_SECRET"
  "MICROSOFT_CLIENT_ID"       # ChatGPT Microsoft OAuth
  "MICROSOFT_CLIENT_SECRET"
  "OAUTH_STATE_SECRET"
  "JWT_PRIVATE_KEY_BASE64"    # RS256 mint key (JWT_ACCESS_SECRET RETIRED 2026-06-06 — do not re-add)
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing: $var"
  else
    echo "✅ Present: $var (length: ${#!var})"
  fi
done

# Check PM2 ecosystem configuration
echo -e "\n=== PM2 OAuth Environment ==="
grep -E "GITHUB|MICROSOFT|GOOGLE|OAUTH|MCP_CLI" ecosystem.config.js | head -30

# GitHub secret naming restrictions check
echo -e "\n=== GitHub Secret Naming Restrictions ==="
echo "GitHub Actions blocks: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET"
echo "Workaround names: PAICHART_GITHUB_CLIENT_ID, PAICHART_GITHUB_CLIENT_SECRET"
grep -rn "PAICHART_GITHUB" .env ecosystem.config.js 2>/dev/null | head -5
```

### 2. Multi-Client Coordination

#### 2.1 Client Detection Logic
```bash
echo "=== Client Detection Discovery ==="

# Client detection across providers
echo "Client detection functions:"
# Post-Wave-7: detectOAuthClient lives at lib/auth/oauth/auth-manager.ts:AuthManager.detectOAuthClient (Wave 3a Phase 3.8d).
# detectClientMode lives at lib/mcp/server/mcp-core.ts:MCPCoreManager.detectClientMode (Wave 7 Phase 7.2).
grep -A40 "detectOAuthClient" lib/auth/oauth/auth-manager.ts | head -60
grep -A40 "detectClientMode" lib/mcp/server/mcp-core.ts | head -60

# Redirect URI patterns (note: with proxy pattern, the server uses its own callback URL
# for the provider request, so redirect_uri detection happens at /oauth/authorize time
# to select the right GitHub App, not at callback time)
echo -e "\nRedirect URI detection patterns:"
grep -rn "redirect_uri.*includes\|callback.*url.*pattern" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -30

# redirect_uri allowlist validation (proxy pattern)
echo -e "\nredirect_uri allowlist (isAllowedRedirectUri):"
# Note: Phase 2.8 (May 2026) extracted isAllowedRedirectUri to SessionStore.
# Authoritative implementation lives in lib/auth/oauth/session-store.ts.
grep -B5 -A20 "isAllowedRedirectUri" lib/auth/oauth/session-store.ts | head -40
echo -e "\nCallers in mcp-server-http-clean.js:"
grep -n "sessionStore\.isAllowedRedirectUri" mcp-server-http-clean.js | head -10

# User-agent based detection
echo -e "\nUser-agent patterns:"
grep -rn "user-agent\|User-Agent\|userAgent" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | grep -E "chatgpt|gemini|claude|openai-mcp|python-httpx|Claude-User" | head -30

# Client detection priority order
echo -e "\nClient detection priority logic:"
grep -B5 -A20 "Priority.*redirect_uri\|Check redirect_uri\|fallback.*detection" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | head -40

# Client-specific patterns
echo -e "\n=== Client-Specific Patterns ==="
echo "ChatGPT patterns:"
grep -rn "chatgpt.com\|openai-mcp\|chatgpt.*detected" mcp-server-http-clean.js --include="*.js" | head -10

echo -e "\nGemini patterns:"
grep -rn "localhost:7777\|gemini.*detected\|gemini.*cli" mcp-server-http-clean.js --include="*.js" | head -10

echo -e "\nClaude patterns:"
grep -rn "claude.ai\|claude-code\|Claude-User\|python-httpx.*claude" mcp-server-http-clean.js --include="*.js" | head -10

echo -e "\nMCP CLI / Smithery patterns (proxy pattern — all unknown clients use org GitHub App):"
grep -rn "MCP_CLI\|smithery\|mcp.*cli.*detect\|unknown.*client.*github" mcp-server-http-clean.js --include="*.js" | head -10

# Client detection ambiguity handling
echo -e "\n=== Client Detection Ambiguity Handling ==="
grep -rn "ambiguity\|fallback\|default.*client\|unknown.*client" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | head -20
```

#### 2.2 Stateless vs Stateful Session Management
```bash
echo "=== Session Management Discovery ==="

# Session mode detection
echo "Session mode detection logic:"
# Post-Wave-7: detectClientMode lives at lib/mcp/server/mcp-core.ts:MCPCoreManager (Wave 7 Phase 7.2).
grep -A30 "detectClientMode\|session.*mode\|stateless.*mode\|persistent.*mode" lib/mcp/server/mcp-core.ts mcp-server-http-clean.js | head -60

# Stateless patterns
echo -e "\nStateless session patterns:"
grep -rn "stateless.*mode\|stateless.*pattern\|temporary.*session" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | head -20

# Stateful patterns
echo -e "\nStateful session patterns:"
grep -rn "persistent.*mode\|stateful.*session\|session.*persistence" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | head -20

# Session storage implementation
echo -e "\nSession storage:"
# Note: Phase 2.x (May 2026) consolidated session storage into SessionStore class.
# Primary location: lib/auth/oauth/session-store.ts (transports, contexts, timestamps).
grep -rn "sessionStore\.\(getTransport\|getContext\|hasSession\|setSession\|deleteSession\)" mcp-server-http-clean.js lib/auth/oauth/session-store.ts | head -25

# Session cleanup patterns
echo -e "\nSession cleanup:"
grep -rn "cleanup.*session\|delete.*session\|temporary.*session.*cleanup" mcp-server-http-clean.js --include="*.js" | head -20

# Client-specific session modes
echo -e "\n=== Client-Specific Session Modes ==="
echo "Expected session modes:"
echo "- ChatGPT: PERSISTENT (changed 2025-10-02 from stateless for OAuth token persistence)"
echo "- Gemini CLI: Stateless"
echo "- Claude Code: Persistent"
echo "- Claude.ai Browser: Stateless (python-httpx) or Persistent (MCP integration)"

# Verify session mode assignments
grep -B5 -A10 "ChatGPT.*detected\|Gemini.*detected\|Claude.*detected" mcp-server-http-clean.js | grep -E "stateless|persistent|PERSISTENT" | head -20
```

#### 2.3 Client-Specific OAuth App Selection
```bash
echo "=== Client-Specific OAuth App Selection ==="

# OAuth app selection by client
echo "Client-to-OAuth-app mapping:"
grep -B10 -A20 "getOAuthCredentials\|OAuth app.*client\|client.*oauth.*app" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -60

# ChatGPT OAuth app selection
# Rationalized: all clients use single org app — verify detection still works
echo -e "\nClient detection (CLIENT_PROVIDER_MAP — detect + defaultProvider):"
grep -B2 -A5 "detect:.*uri" mcp-server-http-clean.js | head -30

# Verify registration handler has 2 branches (ChatGPT + everyone else)
echo -e "\nRegistration handler branches:"
grep -n "isChatGPT\|else {" mcp-server-http-clean.js | grep -A1 'isChatGPT' | head -10

# Verify single org app used in authorize handler
echo -e "\nAuthorize handler app selection:"
grep -n "MCP_CLI_GITHUB_CLIENT_ID\|githubClientId.*=" mcp-server-http-clean.js | head -5
```

### 3. Token Lifetime Coordination

#### 3.1 GitHub Token Lifetime (Long-Lived)
```bash
echo "=== GitHub Token Lifetime Discovery ==="

# GitHub token lifetime
echo "GitHub token characteristics:"
grep -rn "github.*token.*lifetime\|token.*expir.*year\|long.*lived.*github" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -15

# GitHub token validation
echo -e "\nGitHub token validation (stateless):"
grep -rn "verifyGitHubToken\|api.github.com/user" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20
# Note: server-class verifyGitHubToken() was removed in Phase 3.0a (Wave 3a, May 2026). Canonical lives in lib/auth/oauth/mcp-oauth-validator.js.

# GitHub token storage (should NOT be stored for MCP OAuth)
echo -e "\nGitHub token storage patterns (MCP OAuth should be stateless):"
grep -rn "github.*token.*store\|store.*github.*token" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -15

echo -e "\n=== GitHub Token Summary ==="
echo "Characteristics:"
echo "- Lifetime: 1+ year (effectively permanent)"
echo "- Refresh: Not needed"
echo "- Validation: Per-request via api.github.com/user"
echo "- Storage: Stateless (no server-side storage for MCP OAuth)"
echo "- MCP OAuth: Client presents token with each request"
```

#### 3.2 Microsoft Token Lifetime (Short-Lived)
```bash
echo "=== Microsoft Token Lifetime Discovery ==="

# Microsoft token lifetime
echo "Microsoft token characteristics:"
grep -rn "microsoft.*token.*lifetime\|access.*token.*60.*min\|90.*days.*refresh" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Microsoft token refresh logic
echo -e "\nMicrosoft token refresh:"
# Note: refreshMicrosoftToken DELETED Wave 3b.0a 2026-05-12 (zero callers); Microsoft refresh now uses /oauth/token grant_type=refresh_token path
grep -rn "microsoft.*refresh\|refresh.*microsoft.*token" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Microsoft token expiry handling
echo -e "\nMicrosoft token expiry:"
grep -rn "token.*expir.*microsoft\|expiresAt.*microsoft\|access.*token.*expires" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Microsoft token storage (MUST be stateful)
echo -e "\nMicrosoft token storage (should use MCPOAuthTokenManager):"
grep -rn "MCPOAuthTokenManager.*microsoft\|store.*microsoft.*token" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -15

echo -e "\n=== Microsoft Token Summary ==="
echo "Characteristics:"
echo "- Access Token Lifetime: 60-90 minutes"
echo "- Refresh Token Lifetime: 90 days"
echo "- Refresh: REQUIRED (short-lived access tokens)"
echo "- Storage: STATEFUL (MCPOAuthTokenManager)"
echo "- Token Refresh Service: REQUIRED"
```

#### 3.3 Google Token Lifetime (Short-Lived)
```bash
echo "=== Google Token Lifetime Discovery ==="

# Google token lifetime
echo "Google token characteristics:"
grep -rn "google.*token.*lifetime\|access.*token.*1.*hour\|6.*months.*refresh" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Google token refresh logic
echo -e "\nGoogle token refresh:"
grep -rn "google.*refresh\|refresh.*google.*token\|refreshGoogleToken" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Google token expiry handling
echo -e "\nGoogle token expiry:"
grep -rn "token.*expir.*google\|expiresAt.*google" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Google token storage (MUST be stateful)
echo -e "\nGoogle token storage (should use MCPOAuthTokenManager):"
grep -rn "MCPOAuthTokenManager.*google\|store.*google.*token" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -15

echo -e "\n=== Google Token Summary ==="
echo "Characteristics:"
echo "- Access Token Lifetime: 1 hour"
echo "- Refresh Token Lifetime: 6 months"
echo "- Refresh: REQUIRED (short-lived access tokens)"
echo "- Storage: STATEFUL (MCPOAuthTokenManager)"
echo "- Token Refresh Service: REQUIRED"
```

#### 3.4 Hybrid Token Storage Strategy
```bash
echo "=== Hybrid Token Storage Strategy Discovery ==="

# Token storage decision logic
echo "Token storage strategy by provider:"
grep -rn "provider.*github.*stateless\|provider.*microsoft.*stateful\|provider.*google.*stateful" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20

# MCPOAuthTokenManager usage
echo -e "\nMCPOAuthTokenManager integration:"
grep -rn "MCPOAuthTokenManager\|mcp.*oauth.*token.*manager" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# TokenRefreshService integration
echo -e "\nTokenRefreshService integration:"
grep -rn "TokenRefreshService\|token.*refresh.*service" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Stateless validation patterns (GitHub)
echo -e "\nStateless validation (GitHub):"
grep -rn "stateless.*github\|validate.*per.*request\|no.*storage.*github" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -20

# Stateful storage patterns (Microsoft/Google)
echo -e "\nStateful storage (Microsoft/Google):"
grep -rn "stateful.*microsoft\|stateful.*google\|store.*refresh.*token" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20

echo -e "\n=== Hybrid Strategy Summary ==="
echo "Strategy by provider:"
echo "✅ GitHub: Stateless (validate per-request, no storage, long-lived tokens)"
echo "✅ Microsoft: Stateful (MCPOAuthTokenManager + TokenRefreshService, short-lived tokens)"
echo "✅ Google: Stateful (MCPOAuthTokenManager + TokenRefreshService, short-lived tokens)"
```

### 4. PKCE Implementation

#### 4.1 PKCE Parameter Forwarding
```bash
echo "=== PKCE Implementation Discovery ==="

# PKCE parameter handling
echo "PKCE parameters in authorization endpoint:"
grep -rn "code_challenge\|code_verifier\|PKCE" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -30

# Authorization endpoint PKCE
echo -e "\nAuthorization endpoint PKCE forwarding:"
grep -B10 -A15 "code_challenge.*searchParams\|code_challenge_method.*searchParams" mcp-server-http-clean.js | head -40

# Token exchange endpoint PKCE
echo -e "\nToken exchange endpoint PKCE forwarding:"
grep -B10 -A15 "code_verifier.*params\|code_verifier.*append" mcp-server-http-clean.js | head -40

# PKCE validation
echo -e "\nPKCE validation logic:"
grep -rn "validate.*pkce\|verify.*code_challenge\|SHA256.*code_verifier" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# code_challenge_method support
echo -e "\ncode_challenge_method support:"
grep -rn "code_challenge_method\|S256\|plain" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20
```

#### 4.2 ChatGPT PKCE Requirements
```bash
echo "=== ChatGPT PKCE Requirements ==="

# ChatGPT PKCE requirement
echo "ChatGPT PKCE handling:"
grep -B10 -A20 "chatgpt.*pkce\|pkce.*required.*chatgpt\|pkce.*chatgpt" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | head -40

# PKCE forwarding verification
echo -e "\nPKCE parameter forwarding for ChatGPT:"
grep -B5 -A10 "isChatGPT.*code_challenge\|chatgpt.*code_challenge" mcp-server-http-clean.js | head -25

echo -e "\n=== ChatGPT PKCE Summary ==="
echo "Requirements:"
echo "- PKCE: REQUIRED"
echo "- code_challenge: MUST forward to GitHub"
echo "- code_challenge_method: MUST forward (typically S256)"
echo "- code_verifier: MUST forward in token exchange"
echo "- Failure: OAuth flow fails without PKCE forwarding"
```

#### 4.3 Provider-Specific PKCE Support
```bash
echo "=== Provider-Specific PKCE Support ==="

# GitHub PKCE support
echo "GitHub PKCE support:"
grep -rn "github.*pkce\|pkce.*github" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -15

# Microsoft PKCE support
echo -e "\nMicrosoft PKCE support:"
grep -rn "microsoft.*pkce\|pkce.*microsoft" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -15

# Google PKCE support
echo -e "\nGoogle PKCE support:"
grep -rn "google.*pkce\|pkce.*google" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -15

echo -e "\n=== Provider PKCE Support Summary ==="
echo "GitHub: Supports PKCE (optional)"
echo "Microsoft: Supports PKCE (recommended)"
echo "Google: Supports PKCE (recommended)"
echo "pAIchart: Always forwards PKCE if provided by client"
```

### 5. Provider-Specific Validation Endpoints

#### 5.1 GitHub Token Validation
```bash
echo "=== GitHub Token Validation Discovery ==="

# GitHub validation endpoint
echo "GitHub token validation:"
grep -rn "api.github.com/user\|validateGitHubToken\|verifyGitHubToken" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -25
# Note: server-class verifyGitHubToken() was removed in Phase 3.0a (Wave 3a, May 2026). Canonical lives in lib/auth/oauth/mcp-oauth-validator.js.

# GitHub API request headers
echo -e "\nGitHub API headers:"
grep -B5 -A10 "github.*headers\|Authorization.*Bearer.*github" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -30

# GitHub user profile extraction
echo -e "\nGitHub user profile extraction:"
grep -rn "githubUser\|github.*profile\|github.*email\|github.*login" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -25

# GitHub validation error handling
echo -e "\nGitHub validation error handling:"
grep -rn "github.*error\|github.*status\|github.*failed" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -20
```

#### 5.2 Microsoft Token Validation
```bash
echo "=== Microsoft Token Validation Discovery ==="

# Microsoft validation endpoint
echo "Microsoft token validation:"
grep -rn "graph.microsoft.com.*\/me\|validateMicrosoftToken\|verifyMicrosoftToken" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -25

# Microsoft Graph API headers
echo -e "\nMicrosoft Graph API headers:"
grep -B5 -A10 "microsoft.*headers\|graph.microsoft.*Authorization" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -30

# Microsoft user profile extraction
echo -e "\nMicrosoft user profile extraction:"
grep -rn "microsoftUser\|microsoft.*profile\|microsoft.*email\|userPrincipalName" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -25

# Microsoft validation error handling
echo -e "\nMicrosoft validation error handling:"
grep -rn "microsoft.*error\|microsoft.*status\|microsoft.*failed" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20
```

#### 5.3 Google Token Validation
```bash
echo "=== Google Token Validation Discovery ==="

# Google validation endpoint
echo "Google token validation:"
grep -rn "googleapis.com.*userinfo\|validateGoogleToken\|verifyGoogleToken" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -25

# Google API headers
echo -e "\nGoogle API headers:"
grep -B5 -A10 "google.*headers\|googleapis.*Authorization" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -30

# Google user profile extraction
echo -e "\nGoogle user profile extraction:"
grep -rn "googleUser\|google.*profile\|google.*email\|google.*name" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -25

# Google validation error handling
echo -e "\nGoogle validation error handling:"
grep -rn "google.*error\|google.*status\|google.*failed" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20
```

#### 5.4 Generic Multi-Provider Validation
```bash
echo "=== Generic Multi-Provider Validation ==="

# Multi-provider validation function
echo "Multi-provider validation patterns:"
grep -rn "function validateToken\|validateOAuthToken\|verifyOAuthToken" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -25

# Provider-agnostic validation
echo -e "\nProvider-agnostic validation logic:"
grep -B10 -A30 "switch.*provider\|provider.*===.*github\|provider.*===.*microsoft\|provider.*===.*google" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -60

# MCPOAuthValidator implementation
echo -e "\nMCPOAuthValidator implementation:"
grep -rn "class MCPOAuthValidator\|MCPOAuthValidator.verify" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -30

# Unified validation response format
echo -e "\nUnified validation response:"
grep -rn "return.*user\|validated.*user\|oauth.*user.*object" lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20
```

### 6. Cross-Client Token Isolation

#### 6.1 Token Storage Keys
```bash
echo "=== Cross-Client Token Isolation Discovery ==="

# Token storage key format
echo "Token storage key patterns:"
grep -rn "oauth.*\${userId}\|token.*key.*client\|mcp_oauth_.*userId" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Client-specific token keys
echo -e "\nClient-specific token keys:"
grep -rn "client.*token.*key\|token.*key.*client.*provider" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Provider-client combination keys
echo -e "\nProvider-client combination keys:"
grep -rn "provider.*client.*key\|${provider}.*${client}\|token.*${userId}.*${provider}" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Token isolation validation
echo -e "\nToken isolation checks:"
grep -rn "checkTokenOwnership\|validateTokenAccess\|token.*belongs.*user" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20
```

#### 6.2 Client-Specific Token Access
```bash
echo "=== Client-Specific Token Access ==="

# Token access by client
echo "Client-specific token retrieval:"
grep -rn "getToken.*client\|retrieveToken.*client\|fetchToken.*client" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Token storage by client
echo -e "\nClient-specific token storage:"
grep -rn "storeToken.*client\|saveToken.*client\|setToken.*client" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Client access validation
echo -e "\nClient access validation:"
grep -rn "client.*access.*check\|validate.*client.*access" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Token leak prevention
echo -e "\nToken leak prevention:"
grep -rn "prevent.*leak\|isolation.*check\|cross.*client.*validation" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20
```

#### 6.3 Token Ownership Validation
```bash
echo "=== Token Ownership Validation ==="

# Ownership checks
echo "Token ownership validation:"
grep -rn "checkTokenOwnership\|validateTokenOwnership\|token.*owner.*userId" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# User-based token filtering
echo -e "\nUser-based token filtering:"
grep -rn "filter.*userId\|where.*userId\|token.*user.*match" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Cross-user token access prevention
echo -e "\nCross-user token access prevention:"
grep -rn "prevent.*cross.*user\|unauthorized.*token.*access\|token.*access.*denied" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20
```

### 7. Health Monitoring Separation

#### 7.1 MCP OAuth Token Monitoring
```bash
echo "=== MCP OAuth Token Monitoring Discovery ==="

# MCP OAuth token count
echo "MCP OAuth token count:"
grep -rn "mcpOAuthTokens\|MCPOAuthTokenManager.*count\|mcp.*oauth.*token.*count" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# MCPOAuthTokenManager implementation
echo -e "\nMCPOAuthTokenManager:"
grep -rn "class MCPOAuthTokenManager\|MCPOAuthTokenManager.getTokenCount" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -30

# MCP OAuth health metrics
echo -e "\nMCP OAuth health metrics:"
grep -rn "mcp.*oauth.*health\|mcp.*token.*metrics" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25
```

#### 7.2 Web App OAuth Token Monitoring
```bash
echo "=== Web App OAuth Token Monitoring Discovery ==="

# Web App OAuth token count
echo "Web App OAuth token count:"
grep -rn "webAppTokens\|EnterpriseOAuthService.*count\|web.*app.*oauth.*count" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# EnterpriseOAuthService implementation
echo -e "\nEnterpriseOAuthService:"
grep -rn "class EnterpriseOAuthService\|EnterpriseOAuthService.tokenStorage" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -30

# Web App OAuth health metrics
echo -e "\nWeb App OAuth health metrics:"
grep -rn "web.*app.*oauth.*health\|enterprise.*oauth.*metrics" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# ❌ CRITICAL: Verify no cross-contamination
echo -e "\n❌ VIOLATION CHECK: MCP OAuth should NEVER use EnterpriseOAuthService"
grep -r "EnterpriseOAuthService.tokenStorage" mcp-server*.js lib/auth/oauth/mcp-oauth-*.js 2>/dev/null && echo "🚨 ARCHITECTURAL VIOLATION DETECTED" || echo "✅ No cross-contamination found"
```

#### 7.3 Provider-Specific Token Monitoring
```bash
echo "=== Provider-Specific Token Monitoring ==="

# GitHub token monitoring
echo "GitHub token count:"
grep -rn "github.*tokens.*count\|count.*github.*tokens" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Microsoft token monitoring
echo -e "\nMicrosoft token count:"
grep -rn "microsoft.*tokens.*count\|count.*microsoft.*tokens" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Google token monitoring
echo -e "\nGoogle token count:"
grep -rn "google.*tokens.*count\|count.*google.*tokens" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# Provider breakdown in health endpoint
echo -e "\nProvider breakdown:"
grep -rn "provider.*count\|tokens.*by.*provider\|group.*by.*provider" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25
```

#### 7.4 Token Refresh Service Monitoring
```bash
echo "=== Token Refresh Service Monitoring ==="

# Token refresh service health
echo "TokenRefreshService health:"
grep -rn "TokenRefreshService.*health\|refresh.*service.*status" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Circuit breaker status
echo -e "\nCircuit breaker status:"
grep -rn "circuit.*breaker\|circuitBreaker.*status\|OPEN\|CLOSED" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Token refresh failures
echo -e "\nToken refresh failures:"
grep -rn "refresh.*failure\|failed.*refresh\|refreshAttempts" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Tokens expiring soon
echo -e "\nTokens expiring soon:"
grep -rn "expiring.*soon\|expiringWithin10Min\|expiring.*10.*minutes" app/api/auth/oauth/health/ lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25
```

#### 7.5 Health Endpoint Structure
```bash
echo "=== Health Endpoint Structure Discovery ==="

# Health endpoint route
echo "Health endpoint implementation:"
ls -la app/api/auth/oauth/health/route.ts 2>/dev/null || echo "Health endpoint not found"

# Health response structure
echo -e "\nHealth response structure:"
grep -A50 "export.*GET\|export.*async.*function" app/api/auth/oauth/health/route.ts 2>/dev/null | head -60

# Monitoring script
echo -e "\nMonitoring script:"
ls -la scripts/enterprise-health-monitor.sh 2>/dev/null || echo "Monitoring script not found"

# Daily health email
echo -e "\nDaily health email configuration:"
grep -rn "OAuth.*Token.*Refresh\|OAuth.*metrics" scripts/enterprise-health-monitor.sh 2>/dev/null | head -20
```

### 8. Known Issues Investigation

#### 8.1 ChatGPT Mobile App Token Persistence
```bash
echo "=== ChatGPT Mobile App Token Persistence Issue ==="

# Mobile app detection
echo "Mobile app detection:"
grep -rn "mobile.*app\|android\|ios\|mobile.*user.*agent" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20

# Token persistence handling
echo -e "\nToken persistence for mobile:"
grep -rn "token.*persist.*mobile\|mobile.*token.*storage\|store.*token.*mobile" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20

# Mobile-specific workarounds
echo -e "\nMobile-specific workarounds:"
grep -rn "mobile.*workaround\|workaround.*mobile\|mobile.*fix" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -20

echo -e "\n=== ChatGPT Mobile Issue Summary ==="
echo "Known Issue:"
echo "- Symptom: OAuth completes but tokens not sent in subsequent requests"
echo "- Client: ChatGPT mobile app (iOS/Android)"
echo "- Root Cause: Mobile app doesn't persist/send OAuth tokens"
echo "- Status: Shows 'connected' but can't use as source"
echo "- Workaround: Use web version or desktop app"
```

#### 8.2 Microsoft Token Expiry Issue
```bash
echo "=== Microsoft Token Expiry Issue ==="

# Microsoft token expiry tracking
echo "Microsoft token expiry tracking:"
grep -rn "microsoft.*token.*expir\|expiresAt.*microsoft\|microsoft.*60.*min" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Token refresh service integration
echo -e "\nMicrosoft token refresh integration:"
grep -rn "TokenRefreshService.*microsoft\|microsoft.*TokenRefreshService" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Expiry warning/alerts
echo -e "\nExpiry warnings:"
grep -rn "token.*expir.*warn\|expiring.*soon.*microsoft\|10.*minutes.*expir" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -20

# MCPOAuthTokenManager integration
echo -e "\nMCPOAuthTokenManager for Microsoft:"
grep -rn "MCPOAuthTokenManager.*microsoft\|microsoft.*MCPOAuthTokenManager" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

echo -e "\n=== Microsoft Token Expiry Summary ==="
echo "Known Issue:"
echo "- Symptom: Users lose access after 60-90 minutes"
echo "- Provider: Microsoft OAuth (Azure AD)"
echo "- Root Cause: Short-lived access tokens (60-90 min)"
echo "- Solution: MCPOAuthTokenManager + TokenRefreshService (v3 Phase 0)"
echo "- Status: Planned (microsoft-mcp-auth-plan.md v3)"
```

#### 8.3 Cross-Provider Client Detection Ambiguity
```bash
echo "=== Cross-Provider Client Detection Ambiguity ==="

# Client detection fallback logic
echo "Client detection fallback:"
grep -A30 "detectClient.*fallback\|fallback.*detection\|client.*detection.*priority" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" --include="*.ts" | head -50

# User-agent vs redirect_uri priority
echo -e "\nDetection priority order:"
grep -rn "Priority.*redirect_uri\|user.*agent.*priority\|redirect.*uri.*priority" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | head -20

# Ambiguous client patterns
echo -e "\nAmbiguous client patterns:"
grep -rn "ambiguous.*client\|client.*ambiguity\|unknown.*client.*pattern" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | head -20

# Default client selection
echo -e "\nDefault/fallback client:"
grep -rn "default.*client\|fallback.*oauth.*app\|unknown.*client.*default" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | head -20

echo -e "\n=== Client Detection Ambiguity Summary ==="
echo "Known Issue:"
echo "- Symptom: Multiple clients may use same callback URL pattern"
echo "- Root Cause: User-agent may not be reliable, need fallback"
echo "- Solution: Priority detection (redirect_uri > user-agent > state parameter)"
echo "- Risk: Wrong OAuth app selection leads to authorization failure"
echo "- Mitigation (Mar 2026): Proxy pattern with isAllowedRedirectUri() validates"
echo "  all redirect URIs against an allowlist. Unknown clients use the org GitHub App"
echo "  (MCP_CLI_GITHUB_CLIENT_ID), eliminating ambiguity for MCP CLI clients."
```

#### 8.4 Token Refresh Service Integration
```bash
echo "=== Token Refresh Service Integration Issues ==="

# TokenRefreshService setup
echo "TokenRefreshService implementation:"
grep -rn "class TokenRefreshService\|TokenRefreshService.*constructor" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -30

# Service integration with OAuth
echo -e "\nTokenRefreshService OAuth integration:"
grep -rn "TokenRefreshService.*oauth\|oauth.*TokenRefreshService" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Background refresh implementation
echo -e "\nBackground refresh implementation:"
grep -rn "setInterval.*refresh\|cron.*refresh\|schedule.*refresh" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Refresh failure handling
echo -e "\nRefresh failure handling:"
grep -rn "refresh.*failure\|failed.*refresh\|refresh.*error" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

# Circuit breaker implementation
echo -e "\nCircuit breaker:"
grep -rn "circuit.*breaker\|circuitBreaker.*open\|circuitBreaker.*closed" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -25

echo -e "\n=== Token Refresh Integration Summary ==="
echo "Known Issue:"
echo "- Symptom: Tokens expire without automatic refresh"
echo "- Root Cause: TokenRefreshService not integrated with MCPOAuthTokenManager"
echo "- Solution: Phase 0 of microsoft-mcp-auth-plan.md v3"
echo "- Components: MCPOAuthTokenManager creation, service integration"
```

#### 8.5 OAuth Flow Failures
```bash
echo "=== OAuth Flow Failure Patterns ==="

# PKCE-related failures
echo "PKCE failure patterns:"
grep -rn "pkce.*error\|code_verifier.*missing\|code_challenge.*error" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -25

# Redirect mismatch failures
# NOTE: The proxy pattern (Mar 2026) largely eliminates redirect_uri mismatch bugs.
# The server always sends its own serverCallbackUrl to GitHub, so the redirect_uri
# registered on the GitHub App always matches. Client redirect_uri mismatches are
# caught earlier by isAllowedRedirectUri() at /oauth/authorize time, before the
# provider redirect even happens.
echo -e "\nRedirect mismatch failures:"
grep -rn "redirect.*mismatch\|redirect_uri.*error\|callback.*mismatch" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -25

# Client detection failures
echo -e "\nClient detection failures:"
grep -rn "client.*detection.*fail\|unknown.*client.*error\|client.*not.*recognized" mcp-server-http-clean.js lib/auth/oauth/ --include="*.js" | head -25

# Token exchange failures
echo -e "\nToken exchange failures:"
grep -rn "token.*exchange.*fail\|token.*exchange.*error\|exchange.*failed" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -25

# OAuth error logging
echo -e "\nOAuth error logging:"
grep -rn "oauthLogger.log.*error\|oauth.*error.*log\|log.*oauth.*failure" lib/auth/oauth/ mcp-server-http-clean.js --include="*.js" --include="*.ts" | head -25

echo -e "\n=== OAuth Flow Failure Summary ==="
echo "Common failure causes:"
echo "1. Missing code_verifier in token exchange (ChatGPT PKCE)"
echo "2. PKCE parameters not forwarded to provider"
echo "3. Client detection failing (wrong OAuth app used)"
echo "4. Redirect URI not in allowlist (isAllowedRedirectUri rejects)"
echo "5. Token validation failure (expired, revoked, invalid)"
echo ""
echo "Proxy pattern mitigations (Mar 2026):"
echo "- redirect_uri mismatch with provider: ELIMINATED (server uses own callback URL)"
echo "- Unknown client redirect: Caught by isAllowedRedirectUri() at authorize time"
echo "- Client detection ambiguity: Unknown clients default to org GitHub App"
```

## OAuth Flow Endpoint Analysis

### Authorization Endpoint (/oauth/authorize)
```bash
echo "=== Authorization Endpoint Analysis ==="

# Find authorization endpoint
echo "Authorization endpoint implementation:"
grep -A60 "app.get.*\/oauth\/authorize\|\/authorize'" mcp-server-http-clean.js | head -70

# PKCE parameter forwarding
echo -e "\nPKCE parameter forwarding:"
grep -B5 -A15 "code_challenge.*searchParams\|code_challenge_method.*searchParams" mcp-server-http-clean.js | head -30

# Client detection in authorization
echo -e "\nClient detection in authorization:"
grep -B10 -A20 "isGeminiCLI\|isChatGPT\|isClaude.*redirect_uri" mcp-server-http-clean.js | head -50

# GitHub redirect (note: server sends its own serverCallbackUrl, NOT the client's redirect_uri)
echo -e "\nGitHub authorization redirect:"
grep -B5 -A10 "github.com/login/oauth/authorize\|githubAuthUrl" mcp-server-http-clean.js | head -25
```

### Token Exchange Endpoint (/oauth/token)
```bash
echo "=== Token Exchange Endpoint Analysis ==="

# Find token exchange endpoint
echo "Token exchange endpoint implementation:"
grep -A80 "app.post.*\/oauth\/token\|\/token'" mcp-server-http-clean.js | head -90

# PKCE code_verifier forwarding
echo -e "\nPKCE code_verifier forwarding:"
grep -B5 -A15 "code_verifier.*params\|code_verifier.*append" mcp-server-http-clean.js | head -30

# Client detection in token exchange
echo -e "\nClient detection in token exchange:"
grep -B10 -A20 "isGeminiCLI\|isChatGPT\|isClaude.*token.*exchange" mcp-server-http-clean.js | head -50

# GitHub token exchange
echo -e "\nGitHub token exchange:"
grep -B5 -A15 "github.com/login/oauth/access_token\|githubTokenUrl" mcp-server-http-clean.js | head -30

# OAuth logger integration
echo -e "\nOAuth token exchange logging:"
grep -B5 -A10 "oauthLogger.log.*mcp_oauth_token_exchange" mcp-server-http-clean.js | head -25
```

### Registration Endpoint (/oauth/register)
```bash
echo "=== Registration Endpoint Analysis ==="

# Find registration endpoint
echo "Registration endpoint implementation:"
grep -A90 "app.post.*\/oauth\/register\|\/register'" mcp-server-http-clean.js | head -100

# Client detection in registration
echo -e "\nClient detection in registration:"
grep -B10 -A30 "isGeminiCLI\|isChatGPT\|isClaude.*register" mcp-server-http-clean.js | head -60

# RFC 7591 compliance
echo -e "\nRFC 7591 compliance:"
grep -B5 -A20 "RFC 7591\|201 Created\|client_id_issued_at" mcp-server-http-clean.js | head -40

# Client-specific responses
echo -e "\nClient-specific registration responses:"
grep -A15 "Gemini.*OAuth.*app\|ChatGPT.*OAuth.*app\|Claude.*OAuth.*app" mcp-server-http-clean.js | head -60
```

### OAuth Discovery Endpoints
```bash
echo "=== OAuth Discovery Endpoints ==="

# Well-known OAuth endpoints
echo "OAuth discovery endpoints:"
grep -A40 ".well-known/oauth-authorization-server\|.well-known/openid-configuration" mcp-server-http-clean.js | head -50

# Discovery response structure
echo -e "\nDiscovery response:"
grep -A30 "authorization_endpoint.*paichart\|token_endpoint.*paichart" mcp-server-http-clean.js | head -40

# PKCE support in discovery
echo -e "\nPKCE support in discovery:"
grep -A5 "code_challenge_methods_supported" mcp-server-http-clean.js | head -10
```

## System Health Validation

### OAuth Configuration Health
```bash
echo "=== OAuth Configuration Health Check ==="

# Check OAuth environment variables
echo "1. OAuth environment variables:"
required_oauth_vars=(
  "GITHUB_CLIENT_ID"
  "GITHUB_CLIENT_SECRET"
  "MCP_CLI_GITHUB_CLIENT_ID"       # Org app for all MCP clients (rationalized Mar 2026)
  "MCP_CLI_GITHUB_CLIENT_SECRET"
  "MICROSOFT_CLIENT_ID"            # ChatGPT Microsoft OAuth
  "MICROSOFT_CLIENT_SECRET"
  "OAUTH_STATE_SECRET"
  "JWT_PRIVATE_KEY_BASE64"         # RS256 mint key (JWT_ACCESS_SECRET RETIRED 2026-06-06 — do not re-add)
)

for var in "${required_oauth_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "   ❌ Missing: $var"
  else
    echo "   ✅ Present: $var"
  fi
done

# Check OAuth implementation files
echo -e "\n2. OAuth implementation files:"
oauth_files=(
  "mcp-server-http-clean.js"
  "lib/auth/oauth/mcp-oauth-validator.js"
  "lib/auth/oauth/oauth-config.ts"
  "lib/auth/oauth/token-refresh-service.ts"
  "lib/auth/oauth/oauth-logger.ts"
  "app/api/auth/oauth/health/route.ts"
)

for file in "${oauth_files[@]}"; do
  if [ -f "$file" ]; then
    echo "   ✅ $file exists"
  else
    echo "   ❌ $file missing"
  fi
done

# Check OAuth endpoints
echo -e "\n3. OAuth endpoint implementation:"
grep -c "\/oauth\/authorize" mcp-server-http-clean.js && echo "   ✅ Authorization endpoint" || echo "   ❌ Authorization endpoint missing"
grep -c "\/oauth\/token" mcp-server-http-clean.js && echo "   ✅ Token endpoint" || echo "   ❌ Token endpoint missing"
grep -c "\/oauth\/register" mcp-server-http-clean.js && echo "   ✅ Registration endpoint" || echo "   ❌ Registration endpoint missing"

# Check rationalized OAuth support (2 apps: web + org MCP)
echo -e "\n4. OAuth app configuration (rationalized Mar 2026):"
grep -c "MCP_CLI_GITHUB_CLIENT_ID" mcp-server-http-clean.js && echo "   ✅ Org GitHub App (all MCP clients)" || echo "   ❌ Org GitHub App not configured"
grep -c "MICROSOFT_CLIENT_ID" mcp-server-http-clean.js && echo "   ✅ Microsoft OAuth (ChatGPT)" || echo "   ❌ Microsoft OAuth not configured"
grep -c "CLIENT_PROVIDER_MAP" mcp-server-http-clean.js && echo "   ✅ Client detection map (detect + defaultProvider)" || echo "   ❌ Client detection missing"

# Check PKCE support
echo -e "\n5. PKCE implementation:"
grep -c "code_challenge" mcp-server-http-clean.js && echo "   ✅ PKCE authorization support" || echo "   ❌ PKCE authorization missing"
grep -c "code_verifier" mcp-server-http-clean.js && echo "   ✅ PKCE token exchange support" || echo "   ❌ PKCE token exchange missing"

# Check proxy pattern infrastructure
echo -e "\n6. Proxy pattern infrastructure:"
grep -c "isAllowedRedirectUri" mcp-server-http-clean.js && echo "   ✅ redirect_uri allowlist" || echo "   ❌ redirect_uri allowlist missing"
grep -c "serverCallbackUrl" mcp-server-http-clean.js && echo "   ✅ Server callback URL" || echo "   ❌ Server callback URL missing"
grep -c "pac_" mcp-server-http-clean.js && echo "   ✅ First-party auth codes (pac_)" || echo "   ❌ First-party auth codes missing"
grep -c "exchangeAuthCode" mcp-server-http-clean.js && echo "   ✅ Auth code exchange" || echo "   ❌ Auth code exchange missing"
```

### Multi-Provider OAuth Validation
```bash
echo "=== Multi-Provider OAuth Validation ==="

# GitHub provider validation
echo "1. GitHub OAuth provider:"
grep -c "api.github.com/user" lib/auth/oauth/ mcp-server-http-clean.js && echo "   ✅ GitHub token validation" || echo "   ❌ GitHub validation missing"

# Microsoft provider validation (planned)
echo -e "\n2. Microsoft OAuth provider (PLANNED):"
grep -c "graph.microsoft.com" lib/auth/oauth/ && echo "   ✅ Microsoft token validation" || echo "   ⚠️  Microsoft validation not implemented"

# Google provider validation (planned)
echo -e "\n3. Google OAuth provider (PLANNED):"
grep -c "googleapis.com.*userinfo" lib/auth/oauth/ && echo "   ✅ Google token validation" || echo "   ⚠️  Google validation not implemented"

# Multi-provider validator
echo -e "\n4. Unified multi-provider validator:"
grep -c "MCPOAuthValidator" lib/auth/oauth/ && echo "   ✅ MCPOAuthValidator implemented" || echo "   ❌ MCPOAuthValidator missing"
```

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: OAuth Multi-Client Discovery
═════════════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: OAuth Provider Configurations (GitHub, Microsoft, Google)
□ Section 2: Multi-Client Coordination (Claude, ChatGPT, Gemini)
□ Section 3: Token Lifetime Coordination (Hybrid storage strategy)
□ Section 4: PKCE Implementation (ChatGPT requirements)
□ Section 5: Provider-Specific Validation Endpoints
□ Section 6: Cross-Client Token Isolation
□ Section 7: Health Monitoring Separation
□ Section 8: Known Issues Investigation
□ Section 10: Proxy Pattern Infrastructure (NEW - Mar 2026)

Current Status: 🚀 Starting Multi-Client OAuth Discovery
Commands: 0/160+ executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: OAuth Providers [██████████] 100%
   Commands: 25/25 | Found: 4 GitHub apps, Microsoft config, Google planned
🔄 Section 2: Multi-Client Coordination [███░░░░░░░] 30%
   Commands: 8/20 | Analyzing client detection...
```

## Output Format

```markdown
# OAuth Multi-Client Discovery Report

## Executive Summary
- OAuth systems: 2 (MCP OAuth for AI clients, Web App OAuth for browsers)
- OAuth providers: GitHub (active), Microsoft (planned), Google (planned)
- Clients: Claude Desktop, ChatGPT, Gemini CLI
- GitHub OAuth apps: 4 (Web, ChatGPT, Gemini, Claude) + MCP CLI GitHub App
- Token storage: Hybrid (stateless GitHub, stateful Microsoft/Google)
- PKCE: Implemented and forwarded
- Proxy pattern: ALL providers use server callback + pac_ auth codes (Mar 2026)
- Multi-client coordination: [status]

## Section 1: Provider Configuration Analysis

### GitHub OAuth
- Apps configured: 4 (Web, Gemini, ChatGPT, Claude) + MCP CLI GitHub App
- Callback URLs: [list with client mapping]
- Token lifetime: 1+ year (stateless)
- Validation endpoint: GET api.github.com/user
- Status: ✅ Fully implemented

### Microsoft OAuth
- Configuration status: [Found/Missing/Planned]
- Callback URLs: [list]
- Token lifetime: 60-90 min access, 90 days refresh (stateful)
- Validation endpoint: GET graph.microsoft.com/v1.0/me
- Status: [implementation status]

### Google OAuth
- Configuration status: [Found/Missing/Planned]
- Token lifetime: 1 hour access, 6 months refresh (stateful)
- Validation endpoint: GET googleapis.com/oauth2/v3/userinfo
- Status: [implementation status]

## Section 2: Multi-Client Coordination Analysis

### Client Detection
- Detection method: [redirect_uri priority > user-agent > state parameter]
- Priority: [order of detection methods]
- Clients supported: [Claude Desktop, ChatGPT, Gemini]
- Ambiguity handling: [fallback logic]
- Unknown clients: Route to org GitHub App (MCP_CLI_GITHUB_CLIENT_ID) via proxy pattern

### Session Management
- Stateless clients: [ChatGPT (note: changed to persistent 2025-10-02), Gemini, Claude.ai browser]
- Stateful clients: [Claude Code, ChatGPT (persistent mode)]
- Session mode detection: [logic explanation]

### Token Storage Strategy
- GitHub: [stateless/stateful] - [reason]
- Microsoft: [stateless/stateful] - [reason]
- Google: [stateless/stateful] - [reason]
- Storage implementation: [MCPOAuthTokenManager/EnterpriseOAuthService]

## Section 3: Token Lifetime Coordination

### Provider Comparison
| Provider | Access Token | Refresh Token | Storage | Refresh Service |
|----------|--------------|---------------|---------|-----------------|
| GitHub | 1+ year | N/A | Stateless | Not needed |
| Microsoft | 60-90 min | 90 days | Stateful | Required |
| Google | 1 hour | 6 months | Stateful | Required |

### Hybrid Storage Strategy Validation
- Strategy description: [how it works]
- MCPOAuthTokenManager: [integration status]
- TokenRefreshService: [integration status]
- Cross-provider coordination: [assessment]

## Section 4: PKCE Implementation Analysis

### Client Requirements
- ChatGPT: [PKCE required/optional] - [forwarding status]
- Claude: [PKCE required/optional] - [forwarding status]
- Gemini: [PKCE required/optional] - [forwarding status]

### Parameter Forwarding
- Authorization endpoint: [code_challenge/code_challenge_method logic]
- Token exchange endpoint: [code_verifier logic]
- Provider support: [GitHub/Microsoft/Google PKCE status]

## Section 5: Provider Validation Endpoints

### Validation Patterns
- GitHub: [validation method] - [endpoint: api.github.com/user]
- Microsoft: [validation method] - [endpoint: graph.microsoft.com/v1.0/me]
- Google: [validation method] - [endpoint: googleapis.com/oauth2/v3/userinfo]
- Error handling: [provider-specific patterns]

### Multi-Provider Validator
- Implementation: [MCPOAuthValidator status]
- Provider routing: [switch statement logic]
- Error handling: [unified patterns]

## Section 6: Cross-Client Token Isolation

### Token Storage Keys
- Format: [key structure]
- Client isolation: [implementation]
- Provider-client combination: [uniqueness]

### Token Access Validation
- Ownership checks: [implementation]
- Cross-user prevention: [mechanisms]
- Token leak prevention: [validation]

## Section 7: Health Monitoring

### MCP OAuth Monitoring
- Token count: [MCPOAuthTokenManager method]
- Metrics: [what's tracked]

### Web App OAuth Monitoring
- Token count: [EnterpriseOAuthService method]
- Metrics: [what's tracked]

### Provider Separation
- GitHub tokens: [count]
- Microsoft tokens: [count]
- Google tokens: [count]

### Token Refresh Service
- Status: [running/stopped]
- Circuit breaker: [OPEN/CLOSED]
- Failed refreshes: [count]
- Tokens expiring soon: [count]

## Section 8: Critical Issues Found

### Known Issues
1. **ChatGPT Mobile App Token Persistence**
   - Impact: [severity]
   - Status: [known limitation]
   - Workaround: [use web/desktop]

2. **Microsoft Token Expiry (60-90 min)**
   - Impact: [user impact]
   - Status: [planned fix in v3 Phase 0]
   - Solution: [MCPOAuthTokenManager + TokenRefreshService]

3. **Cross-Provider Client Detection Ambiguity**
   - Impact: [risk of wrong OAuth app selection]
   - Status: [mitigated by priority detection + proxy pattern]
   - Solution: [redirect_uri > user-agent > state; unknown → org GitHub App]

4. **Token Refresh Service Integration**
   - Impact: [tokens expire without refresh]
   - Status: [planned for Microsoft/Google]
   - Solution: [Phase 0 implementation]

## Section 10: Proxy Pattern Infrastructure (NEW - Mar 2026)

### Proxy Pattern Overview
- Server callback URL: [serverCallbackUrl value]
- Auth code prefix: pac_ (pAIchart auth code)
- Redirect URI allowlist: [domains in isAllowedRedirectUri]
- Rate limiting: AuthManager.checkCallbackRateLimit (30/min/IP, RFC 6585 §4 Retry-After header on 429 — Phase 3.9, May 2026)

### Redirect Mismatch Elimination
- Provider redirect: Always uses server's own callback URL → no mismatch possible
- Client redirect: Validated by isAllowedRedirectUri() at authorize time
- Impact: Entire class of redirect_uri mismatch bugs eliminated

## Recommendations

### 🔴 Critical (Blocking)
1. [Recommendation with specific fix]
2. [Priority 1 items]

### 🟡 Important (Should Fix)
1. [Recommendation with specific fix]
2. [Priority 2 items]

### 🟢 Enhancement (Nice to Have)
1. [Recommendation with specific fix]
2. [Priority 3 items]

## Confidence Assessment
```

**Overall Multi-Client OAuth Confidence: X/10**

Breakdown:
- Provider coordination: Y/3
- Client detection: Y/2
- Token storage: Y/2
- PKCE implementation: Y/1
- Health monitoring: Y/1
- Cross-client isolation: Y/1

## Next Steps

1. [If issues found] → Fix critical OAuth coordination issues
2. [If Microsoft planned] → Implement Phase 0 (MCPOAuthTokenManager)
3. [If Google planned] → Extend multi-provider support
4. [If all good] → Validate microsoft-mcp-auth-plan.md v3
```

## Recent Implementation Patterns (Oct 22, 2025)

### Search: Scope String-For-String Validation
```bash
grep -r "validateScopeMatch\|validateScope\|scope.*validation.*exact" --include="*.js" --include="*.ts" -B2 -A10 . | grep -v node_modules | head -50
```

**Questions to answer**:
- ~~Is validateScopeMatch() implemented for ChatGPT?~~ (DELETED 2026-06-11 — exact-scope echo is enforced by construction at the token endpoint, `scope: requestedScope`; the runtime check was a tautology, dead since Wave 3b.0a)
- Where is it called in the token response flow?
- Does it log "✅ Exact match" on success?
- What error does it throw on mismatch?

### Search: azp Claim (Client Binding)
```bash
grep -r "azp" --include="*.js" --include="*.ts" -B2 -A3 . | grep -v node_modules | head -80
```

**Questions to answer** (post-U2 2026-05-19):
- Where is `azp` written to minted JWTs? (`lib/auth/token-manager.ts:mintMcpToken` — `azp` is an optional `MintMcpTokenOptions` field. Callsites: OAuth callback uses `originalClientId`, refresh-grant uses `refreshData.clientId`, per-call mints use `req.user.azp` propagated through context.)
- Where is `azp` POPULATED on req.user? (`AuthManager.populateReqUser()` at `lib/auth/oauth/auth-manager.ts` — extracted Wave 3a Phase 3.6 from `mcp-server-http-clean.js`; grep `populateReqUser` to locate. `azp` populated from `payload.azp` per Phase E.1.)
- Where is `azp` VALIDATED? (`verifyAccessToken` in `lib/auth/token-manager.ts` accepts optional `expectedClientId` parameter; restored 2026-05-18 oauth-multi-client review). Refresh-grant enforcement at `/oauth/token` with `grant_type=refresh_token` rejects `client_id` mismatch (Phase E.8, oauth-multi-provider IM-5). Dedicated `/oauth/refresh` endpoint DROPPED Wave 6 Phase 0.6 / 2026-05-21.
- `clientName` is now stored in `oauthRequestData` at authorize time and flows through to auth code store

### Search: Multi-Client Testing Patterns
```bash
grep -r "ChatGPT.*test\|Gemini.*test\|Claude.*test\|multi.*client.*test" --include="*.test.ts" --include="*.test.js" --include="*.md" . | grep -v node_modules | head -30
```

**Questions to answer**:
- Are there multi-client OAuth tests?
- Do tests cover ChatGPT (Microsoft + PKCE)?
- Do tests cover Claude Desktop (GitHub + optional PKCE)?
- Do tests cover Gemini (GitHub + optional PKCE)?

### Search: Edge Runtime Compatibility
```bash
grep -r "Edge Runtime\|atob.*JWT\|manual.*decode.*RS256" --include="*.js" --include="*.ts" -B3 -A8 . | grep -v node_modules | head -80
```

**Questions to answer**:
- Is Edge Runtime RS256 decode implemented?
- Does it use atob() instead of crypto.createPublicKey()?
- Is there a comment explaining Edge Runtime limitations?
- Does it validate azp claim after decode?

---

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact | Mitigation |
|------|----------|------------|---------|------------|
| Client detection failure | High | Medium | Wrong OAuth app, auth failure | Priority detection (redirect_uri first) |
| PKCE not forwarded | Critical | Low | ChatGPT OAuth fails | Mandatory forwarding in all endpoints |
| Token storage mixing | Critical | Low | System A/B violation | Architectural guardrails, code reviews |
| Microsoft token expiry | High | High | Users lose access after 60 min | MCPOAuthTokenManager + TokenRefreshService |
| Cross-client token leak | Critical | Low | Security breach | Token ownership validation |
| Provider API rate limit | Medium | Medium | Validation failures | Rate limiting, caching |
| Callback URL mismatch | ~~High~~ Low | ~~Medium~~ Very Low | OAuth flow fails | Proxy pattern: server uses own callback URL; isAllowedRedirectUri() validates client URIs |
| Missing OAuth secrets | Critical | Low | Complete auth failure | Environment variable validation |

## Success Criteria

### OAuth Provider Implementation
- ✅ GitHub OAuth: 4 separate apps (Web, ChatGPT, Gemini, Claude) + MCP CLI GitHub App
- ✅ Microsoft OAuth: Client ID configured, validation endpoint ready
- ✅ Google OAuth: Configuration prepared
- ✅ All providers: PKCE support working

### Multi-Client Coordination
- ✅ Client detection 100% accurate (no misrouted OAuth apps)
- ✅ Stateless clients (ChatGPT, Gemini) work correctly
- ✅ Stateful clients (Claude Code) persist sessions
- ✅ PKCE parameters forwarded correctly for ChatGPT

### Token Management
- ✅ GitHub OAuth remains stateless (no token storage for MCP clients)
- ✅ Microsoft OAuth stores tokens + uses refresh service
- ✅ Google OAuth stores tokens + uses refresh service (when added)
- ✅ Hybrid storage strategy validated

### Health & Security
- ✅ Health monitoring distinguishes MCP OAuth from Web App OAuth
- ✅ Zero cross-client token leaks (Claude can't see ChatGPT tokens)
- ✅ Provider-specific token counts accurate
- ✅ Circuit breaker prevents cascading failures

## Key Files Reference

### OAuth Implementation
- `/mcp-server-http-clean.js` - Main OAuth server (lines 196-529: OAuth endpoints, lines 784-823: client detection)
- `/lib/auth/oauth/mcp-oauth-validator.js` - Multi-provider token validation
- `/lib/auth/oauth/oauth-config.ts` - OAuth provider configurations
- `/lib/auth/oauth/token-refresh-service.ts` - Token refresh service
- `/lib/auth/oauth/oauth-logger.ts` - OAuth logging

### Client Detection
- `/mcp-server-http-clean.js` lines 784-823 - Client detection by user-agent and redirect_uri

### Environment Configuration
- `.env` - OAuth credentials (4 GitHub apps, MCP CLI GitHub App, Microsoft, Google)
- `ecosystem.config.js` - PM2 environment variables

### Health Monitoring
- `/app/api/auth/oauth/health/route.ts` - OAuth health endpoint
- `/scripts/enterprise-health-monitor.sh` - Monitoring script

### Architecture Documentation
- `/cline_docs/oauth-architecture-clarification.md` - Dual OAuth architecture
- `/cline_docs/microsoft-mcp-auth-plan.md` - Microsoft implementation plan v3
- `/.claude/knowledge/domain/oauth/chatgpt-oauth-diagnostic-guide.md` - ChatGPT OAuth troubleshooting (95% confidence, Dec 7 2025)

## Deliverables

1. **Multi-Provider OAuth Matrix** - GitHub/Microsoft/Google comparison
2. **Multi-Client Coordination Map** - Client detection flowchart
3. **Token Lifecycle Diagrams** - Stateless vs stateful flows
4. **PKCE Implementation Audit** - ChatGPT requirements validation
5. **Cross-Client Security Analysis** - Token isolation verification
6. **Health Monitoring Dashboard** - Separation validation
7. **Known Issues Documentation** - Workarounds and solutions
8. **OAuth Coordination Guide** - Provider-client best practices
9. **Proxy Pattern Infrastructure Audit** - redirect_uri allowlist, auth code lifecycle, rate limiting

## Debugging Helpers

```bash
# Quick multi-client OAuth check
echo "=== Multi-Client OAuth Quick Check ==="
oauth_apps=$(grep -c "GITHUB_CLIENT_ID" .env)
echo "OAuth apps configured: $oauth_apps/4"

# Test OAuth flow for specific client
test_oauth_client() {
  client=$1
  echo "=== Testing OAuth for $client ==="

  # Rationalized (Mar 2026): all MCP clients use single org app via proxy
  case $client in
    chatgpt)
      echo "Provider: Microsoft OAuth"
      echo "Client ID: $MICROSOFT_CLIENT_ID"
      echo "Callback: https://chatgpt.com/connector_platform_oauth_redirect"
      echo "PKCE: Required"
      ;;
    gemini|claude|mcp-cli|smithery|glama|mcporter|*)
      echo "Provider: GitHub OAuth (proxy pattern)"
      echo "Client ID: $MCP_CLI_GITHUB_CLIENT_ID (org app — all clients)"
      echo "Callback: Server's own /oauth/callback (proxy)"
      echo "PKCE: Validated server-side"
      ;;
  esac
}

# Usage: test_oauth_client chatgpt

# Verify OAuth endpoint health
echo -e "\n=== OAuth Endpoint Health ==="
curl -s http://localhost:8080/.well-known/oauth-authorization-server | jq '.' 2>/dev/null || echo "Discovery endpoint not responding"

# Check client detection (pino structured logs via PM2)
echo -e "\n=== Client Detection Test (pino JSON logs) ==="
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep -i 'client.*detect' | jq -r '[.time, .msg, .clientType // \"unknown\"] | @tsv'" 2>/dev/null | tail -20 || echo "No recent client detection logs"

# Fallback: legacy log format
grep -A5 "CLIENT DETECTION" /var/log/paichart/mcp-out-0.log 2>/dev/null | tail -20 || echo "No legacy client detection logs"
```

## Note on Discovery Execution

This discovery prompt is designed to be executed by the oauth-multi-client-specialist. It provides comprehensive commands for investigating all aspects of multi-provider, multi-client OAuth coordination in the pAIchart platform.

**Expected execution time**: 45-60 minutes
**Expected findings**: 100+ data points across 10 major sections
**Required expertise**: OAuth multi-client coordination, provider-specific patterns, security isolation, proxy pattern infrastructure

---

**Document Version**: 3.1
**Total Lines**: 1000+
**Coverage**: 10 major sections, 160+ discovery commands
**Target Specialist**: oauth-multi-client-specialist
**Purpose**: Enable validation of microsoft-mcp-auth-plan.md v3 and proxy pattern infrastructure
