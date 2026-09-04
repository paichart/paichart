# OAuth Multi-Provider Discovery Prompt

**Last Updated**: 2026-06-21 (GitHub private-email resolved via /user/emails — stub removed)
**Purpose**: Map OAuth 2.0 multi-provider implementation, token strategies, provider-specific patterns, first-party token minting, and provider validation logging.

**Target Specialist**: oauth-multi-provider-specialist

**Discovery Depth**: VERY THOROUGH - This is critical OAuth infrastructure

---

## 🆕 2026-06-21 Session — GitHub private-email (Wave 1) + web provider-id matching (Wave 2) — Run These Greps FIRST

```bash
# Wave 1 — shared resolver (NEW): both web + MCP paths call this for GitHub email
grep -n "resolveGitHubEmail\|isNoReply\|/user/emails" lib/auth/oauth/github-email.ts
# Wave 1 web path: resolve in getUserInfo, reject-only-if-no-verified-email in normalizeUserData
grep -n "resolveGitHubEmail\|GITHUB_NO_VERIFIED_EMAIL" lib/auth/oauth/oauth-service.ts
# Wave 1 MCP path: resolve before findOrCreateUser; STUB REMOVED (no more ${login}@github.user)
grep -n "resolveGitHubEmail\|GITHUB_NO_VERIFIED_EMAIL\|github.user" lib/auth/oauth/mcp-oauth-validator.js
# Wave 1 error-page wiring (renamed GITHUB_EMAIL_PRIVATE -> GITHUB_NO_VERIFIED_EMAIL)
grep -rn "github_no_verified_email\|GITHUB_NO_VERIFIED_EMAIL" "app/api/auth/oauth/callback/[provider]/route.ts" app/auth/oauth/error/page.tsx
# Wave 2 — web now matches returning users by (provider, providerId), email only a link fallback
grep -n "findFirst({" lib/auth/oauth/oauth-service.ts                       # provider-id match in createOrUpdateUser
grep -n "crossProviderLink\|Cross-provider account link" lib/auth/oauth/oauth-service.ts
# Wave 2 CI regression pin (asserts web matches by provider-id, not email)
grep -n "Wave2:" scripts/test-security-invariants.ts
```

**What changed (commits f1ed2e74 + 3439e6a5, deployed 2026-06-20/21):**
- GitHub `GET /user` returns `email:null` for PRIVATE emails regardless of the `user:email` scope. Previously: MCP path **fabricated** a `${login}@github.user` stub; web path **hard-rejected** (`GITHUB_EMAIL_PRIVATE`). Both because neither called `GET /user/emails`.
- NOW: shared `lib/auth/oauth/github-email.ts` `resolveGitHubEmail(token, profileEmail, correlationId?)` → public email → primary&verified non-noreply → any verified non-noreply → noreply (`isNoReply:true`) → `null`. Returns `{email, isNoReply}` (the `verified` field was removed in review — was unearned). Never throws (returns null on any failure).
- Both paths reject only when NO verified email resolves, throwing **`GITHUB_NO_VERIFIED_EMAIL`** (renamed from `GITHUB_EMAIL_PRIVATE`); error UI case is `github_no_verified_email`.
- **GitHub App requirement**: the MCP GitHub App needs the **"Email addresses: read"** account permission for `/user/emails` (CONFIRMED granted). Web OAuth App uses the `user:email` scope.
- Reviewed by auth-permissions/boundary/oauth specialists (88/86/88, all GO-WITH-CHANGES).

**Wave 2 SHIPPED (commit `ed615ebe` + CI pin `b88e122f`, deployed 2026-06-21):** the WEB path (`oauth-service.ts` `createOrUpdateUser`) now matches returning users by the immutable `(oauthProvider, oauthProviderId)` (was email `findUnique` — recyclable/spoofable = takeover vector), mirroring the already-hardened MCP path. Email is ONLY a gated fallback (`if (!existingUser && userInfo.email)`) to LINK the same human across providers (GitHub/Claude ↔ Microsoft/ChatGPT) — accepted email-link risk, one account per person. Cross-provider links emit `authLogger.warn('Cross-provider account link …')` (forensic trail; surfaced in the daily-summary "OAuth Cross-Provider Links" metric). CI pin: section H in `scripts/test-security-invariants.ts` (negative-controlled — fails if reverted to email-primary). This makes the web path follow **Pattern #31 oauth-provider-id-canonical** (previously MCP-only).

- **Still deferred**: `isNoReply` not persisted (no `User` column; needs DB review + a user-email feature). **Still parked**: Microsoft nOAuth tenant-pin (`/common/` → tenant) — Wave 2 closes the GitHub username-reuse takeover but NOT Microsoft nOAuth, because the cross-provider email-link still trusts the MS email. Plan: `cline_docs/follow-ups/noauth-microsoft-tenant-fix-plan.md`.

## 🆕 2026-06-11 Session — Run These Greps FIRST (kid single-source + minter deletions)

The JWT kid default is CENTRALIZED (`6a14a15b`): `getCurrentKid()` + `DEFAULT_JWT_KEY_ID` in
`lib/auth/jwt-key-store.ts` (`:64` / `:52`) replaced 9 duplicated `|| 'paichart-2026-01'` literals
that had gone one rotation stale. `mcp://hub/security` `keyId` is now live (was a wrong fact in prod).
Dead HS256 minter scripts DELETED (`1f9fbb2c`): `generate-system-token.js` + `generate-demo-jwt.js`
(RS256 replacement: `scripts/mint-monitor-token.ts`).

```bash
# Kid single-source invariant — inline fallback literals MUST be zero (all sites use getCurrentKid()):
grep -rnE "JWT_KEY_ID \|\| '" lib/ app/ mcp-server-http-clean.js scripts/ --include="*.ts" --include="*.js"
# Expected: ZERO hits. The ONLY remaining kid-fallback literals are the two rotation-bump sites:
grep -n "DEFAULT_JWT_KEY_ID" lib/auth/jwt-key-store.ts            # :52 constant (bump each rotation)
grep -n "JWT_KEY_ID=" .github/workflows/production-deploy.yml      # secrets-fallback literal (keep in sync)

# getCurrentKid consumers (mint ×3, JWKS ×4, hub resource, monitor minter):
grep -rn "getCurrentKid()" lib/ app/ scripts/ --include="*.ts" --include="*.js" | grep -v jwt-key-store

# mcp://hub/security keyId must be dynamic (no kid literal in hub-resources):
grep -n "keyId\|paichart-2026" lib/mcp/server/resources/hub-resources.js
# Live check (kid must match JWKS):
curl -s https://paichart.app/mcp/.well-known/jwks.json | python3 -c "import json,sys; print([k['kid'] for k in json.load(sys.stdin)['keys']])"

# Deleted minters must NOT reappear (zero hits outside docs/historical):
ls scripts/generate-system-token.js scripts/generate-demo-jwt.js 2>&1 | grep -c "No such file"  # expect 2
```

⚠️ Legacy HS256 `PAICHART_API_KEY` survives ONLY as a decode-only boot-context seed
(`mcp-core.ts:256-259` — claims extracted WITHOUT signature verify; it does NOT authenticate `/mcp`
or `/api`). `validate:schemas` needs an RS256 token to exercise (HS256 → exits 0, all skipped) and
supports `BASE_URL=https://paichart.app` + `.env` auto-load since `cfa4eedd`.

---

## 🆕 2026-06-06 Session — JWT_ACCESS_SECRET FULLY RETIRED (run these FIRST)

`JWT_ACCESS_SECRET` is GONE — Deploy 1 `c9636035` + Deploy 2 `a6c8d9a6` (code, env, processes, GitHub secret; proc-verified). **No symmetric JWT secret remains; minting + verification are 100% RS256/JWKS.** The "deferred Option C" apiKey mint migration shipped (`1dc46117`); this session removed the secret itself.

> ⚠️ The `lib/ app/`-scoped greps in the 2026-05-28 block below MISSED two HS256 verifiers in the **top-level `middleware/` dir** (`admin.ts`/`auth.ts`, now DELETED) — `npm run build` caught them. **Grep repo-wide.** Alg-confusion stays impossible: every `jwtVerify` is pinned `['RS256']` against an asymmetric `KeyLike`.

```bash
# REPO-WIDE — should return ZERO crypto consumers (only retired-comments / docs):
grep -rnE "config\.jwt\.accessSecret|JWT_ACCESS_SECRET|setProtectedHeader\(\{ alg: 'HS256'" . --include="*.ts" --include="*.js" | grep -vE "node_modules|\.next|retired|removed 2026-06"
```

---

## 🆕 2026-05-28 Session — Run These Greps FIRST (HS256 verify-surface — Step 2 SHIPPED)

✅ Step 2 shipped (commits `9faabda0` + `eb745fc3`): `verifyAccessToken`/`verifyRefreshToken` are RS256-only; Edge HS256 accept + dead header-injection removed. Confirm the current state:

```bash
# verifyAccessToken/verifyRefreshToken are RS256-only — these MUST return nothing (HS256 branches deleted):
grep -nE "jwtVerify\(token, accessSecret|jwtVerify\(token, refreshSecret" lib/auth/token-manager.ts
# The ONE HS256 mint site (user API keys) — DEFERRED full-migration target (anchor on the jose header):
grep -rn "setProtectedHeader({ alg: 'HS256'" lib/ app/ mcp-server-http-clean.js
# api keys mint RS256 since 2026-06-04 (1dc46117); validateApiKey + mcp-http-middleware.ts DELETED. Verify no HS256 mint/verify sites remain:
grep -nE "mintMcpToken|scope.*api-key|enforceActiveApiKey" lib/services/apiKeyService.ts lib/auth/token-manager.ts
# JWT_ACCESS_SECRET is FULLY RETIRED 2026-06-06 (see top block) — this grep must be REPO-WIDE and should now return only retired-comments/docs:
grep -rnE "JWT_ACCESS_SECRET|accessSecret|process.env.JWT_SECRET" lib/ app/ mcp-server-http-clean.js --include="*.ts" --include="*.js" | grep -ivE "//"
```

Plan + spec: `cline_docs/follow-ups/hs256-verify-surface-hardening-2026-05-28.md` + `hs256-step2-implementation-spec-2026-05-28.md`. The full apiKey mint→RS256 migration (`apiKeyService-hs256-to-rs256-migration-2026-05-24.md`, Addenda A+B) was DEFERRED — verify-surface hardening got the security value at zero customer impact.

---

## 🆕 2026-05-26 Session — Run These Greps FIRST (ChatGPT requires OIDC discovery)

```bash
# ChatGPT's connector backend (OpenAI Python/aiohttp) probes GET /.well-known/openid-configuration
# during discovery and ABORTS on a 404 — even when oauth-protected-resource + oauth-authorization-server
# return 200. Claude/Gemini use oauth-authorization-server + DCR and never probe openid-configuration.
# We had DROPPED openid-configuration (Phase 0.6 "zero hits") → ChatGPT setups silently failed at
# discovery. Re-added in b222db64. DO NOT drop it again.
grep -n "openid-configuration" lib/mcp/server/routes/oauth-discovery-routes.ts
curl -s https://paichart.app/.well-known/openid-configuration -o /dev/null -w "openid-config HTTP %{http_code} (must be 200)\n"

# Diagnostic for "ChatGPT connector fails but Claude works": the signature is OpenAI's aiohttp UA
# hitting openid-configuration → 404 in nginx.
ssh <PROD_USER>@<PROD_HOST> "grep openid-configuration /var/log/nginx/access.log | grep aiohttp | tail"
```

Ref: commit `b222db64`; memory `[[Smithery Registration & GitHub App Migration]]` (ChatGPT OIDC requirement). The metadata is served at the R5 route array in `oauth-discovery-routes.ts` (pinned test: `scripts/test-routes-oauth-discovery.ts` Test 11).

---

## 🆕 2026-05-24 Session — Run These Greps FIRST

```bash
# ChatGPT DCR regression fix (commit 89d5ec5f) — was hardcoding legacy redirect URI
grep -nE "isChatGPT|connector_platform_oauth_redirect|connector/oauth" lib/mcp/server/routes/oauth-flow-routes.ts
# OpenAI Apps SDK new redirect pattern: https://chatgpt.com/connector/oauth/{callback_id}

# azp / audience / setAudience inventory across all mint sites
grep -nE "azp:|setAudience|audience:" lib/auth/token-manager.ts mcp-server-http-clean.js lib/services/apiKeyService.ts

# Scope constants used by /oauth/register branches
grep -nE "CHATGPT_SCOPE|CLAUDE_SCOPE|MCP_SCOPE" lib/mcp/server/routes/oauth-flow-routes.ts

# expectedClientId-wiring MVP — 6-specialist plan (96% projected) BLOCKED on DCR storage decision
ls cline_docs/reviews/expected-client-id-wiring-2026-05-24/
# Phase 0 finding: NO prisma.oauthClient table exists; /oauth/register mints fresh client_id per request
```

Related follow-ups: `expected-client-id-wiring-2026-05-24.md` + `apiKeyService-hs256-to-rs256-migration-2026-05-24.md` + (resolved this session) `cf-authenticated-origin-pulls-2026-05-24.md`.

---

## Phase 0: OAuth Audit Logging Discovery (NEW - Nov 11, 2025)

### Search 0.1: Provider Validation Logging
```bash
echo "=== Provider Validation Logging Discovery ==="

# Find provider validation logging in validators
grep -n "github_token_validation\|microsoft_token_validation\|google_token_validation" lib/auth/oauth/mcp-oauth-validator.js | head -20

# Find Graph API call logging
grep -n "microsoft_graph_api_call\|google.*api.*call" lib/auth/oauth/mcp-oauth-validator.js | head -10

# Check OAuth audit logger import
grep -n "oauthLogger.*require\|import.*oauthLogger" lib/auth/oauth/mcp-oauth-validator.js | head -5
```

**Questions to answer**:
- Are GitHub, Microsoft, Google validation logged?
- Are provider API calls logged (Graph API, GitHub API)?
- Is correlation ID passed to validators?
- What validation metadata is captured?

### Search 0.2: Scope/Resource Parameter Tracking
```bash
echo "=== Scope/Resource Parameter Discovery ==="

# Find scope/resource capture logging
grep -n "scope_resource_captured\|requestedScope\|requestedResource" mcp-server-http-clean.js | head -30

# Find scope validation logging
grep -n "scope_resource_validation\|exactScopeMatch" mcp-server-http-clean.js | head -20

# Check scope storage in OAuth requests
# Note: Phase 2.x (May 2026) moved oauthRequests Map into SessionStore. Writes now go via
# this.sessionStore.setOAuthRequest(...). The OAuthRequestData interface (incl. requestedScope)
# lives in lib/auth/oauth/session-store.ts.
grep -n "sessionStore\.setOAuthRequest\|requestedScope:" mcp-server-http-clean.js lib/auth/oauth/session-store.ts | head -10
```

**Questions to answer**:
- Where are scope/resource parameters captured?
- Is exact scope matching validated and logged?
- How are scopes stored between authorize and token exchange?
- Is RFC 8707 resource parameter handled?

### Search 0.3: OAuth Audit Log Analysis (Production)
```bash
echo "=== OAuth Audit Log Provider Analysis ==="

# Provider distribution
ssh <PROD_USER>@<PROD_HOST> "cat /var/log/paichart/oauth-audit.log | jq -r '.provider' | sort | uniq -c"

# Microsoft Graph API validation
ssh <PROD_USER>@<PROD_HOST> "grep 'microsoft_token_validation' /var/log/paichart/oauth-audit.log | jq"

# Scope validation results
ssh <PROD_USER>@<PROD_HOST> "grep 'scope_resource_validation' /var/log/paichart/oauth-audit.log | jq '.metadata.exactScopeMatch' | sort | uniq -c"

# Provider validation failures
ssh <PROD_USER>@<PROD_HOST> "grep -E '(github|microsoft|google)_token_validation' /var/log/paichart/oauth-audit.log | grep '\"success\":false' | jq"
```

**Questions to answer**:
- Which providers are being used in production?
- Are all provider validations succeeding?
- Is scope matching working (exactScopeMatch: true)?
- Are there any provider-specific failures?

### Search 0.4: Phantom User Vulnerability Detection (NEW - Feb 2026)
```bash
echo "=== OAuth Phantom User Pattern Detection ==="

# NOTE: BOTH paths now — MCP is .js (mcp-oauth-validator.js), WEB is .ts
# (oauth-service.ts, hardened in Wave 2 2026-06-21). The old *.js-only greps
# MISSED the web path entirely — always include the .ts file.

# Find vulnerable email-primary lookup in OAuth user create/update (should be NONE)
grep -n "findFirst.*OR.*email\|OR:.*whereConditions" lib/auth/oauth/*.js lib/auth/oauth/oauth-service.ts | head -10
# Web-path regression check: createOrUpdateUser must NOT lead with findUnique({where:{email}})
grep -n "findUnique({ where: { email: userInfo.email }" lib/auth/oauth/oauth-service.ts   # expect: only inside the !existingUser link fallback, never first

# Check for phantom user detection (should exist post-fix)
grep -n "findUnique.*verifyUser\|Phantom user detected" lib/auth/oauth/*.js | head -10

# Verify provider ID canonical pattern — should be the PRIMARY match on BOTH paths
grep -n "oauthProviderId: validatedUser.id\|oauthProviderId: userInfo.providerUserId" lib/auth/oauth/*.js lib/auth/oauth/oauth-service.ts | head -10
# Cross-provider email-LINK fallback (intentional; gated by !existingUser)
grep -n "crossProviderLink\|Cross-provider account link\|existingUserByEmail" lib/auth/oauth/*.js lib/auth/oauth/oauth-service.ts | head -10
```

**Questions to answer**:
- Are OAuth lookups using email OR clauses? (vulnerable)
- Is phantom user detection implemented? (findUnique verification)
- Is provider ID the only match criterion? (canonical identity)
- Is unique constraint on (oauthProvider, oauthProviderId)? (database enforcement)

**Vulnerability**: Email-based matching allows deleted users to re-auth as phantoms (CVSS 8.5)
**Fix Pattern**: See `oauth-phantom-user-detection.md` + `oauth-provider-id-canonical.md`

### Search 0.5: OAuth Proxy Pattern Infrastructure (NEW - Mar 2026)
```bash
echo "=== OAuth Proxy Pattern Discovery ==="

# Find the /oauth/callback route (server's own callback handler)
grep -n 'oauth/callback.*async' mcp-server-http-clean.js | head -10

# Find proxy pattern infrastructure: auth code generation, state mapping, redirect_uri allowlist
# Note: Phase 2.x (May 2026) moved auth code + OAuth request state + isAllowedRedirectUri into
# SessionStore (lib/auth/oauth/session-store.ts). Callers use this.sessionStore.{setAuthCode,
# exchangeAuthCode, setOAuthRequest, isAllowedRedirectUri}() in mcp-server-http-clean.js.
grep -n 'proxyPattern\|pac_\|sessionStore\.setAuthCode\|sessionStore\.exchangeAuthCode\|sessionStore\.isAllowedRedirectUri\|serverCallbackUrl\|serverState' mcp-server-http-clean.js | head -20

# Find auth code store implementation (synchronous atomic get+delete; replay-prevention)
echo -e "\nAuth code store implementation (SessionStore):"
grep -n 'setAuthCode\|exchangeAuthCode\|deleteAuthCode' lib/auth/oauth/session-store.ts | head -20
```

**Questions to answer**:
- Is the proxy pattern implemented (server receives GitHub callback, issues its own auth code)?
- Where is the server's own /oauth/callback handler?
- How are `pac_` prefixed auth codes generated and exchanged?
- What is the `isAllowedRedirectUri()` allowlist?
- How does `serverState` map to the original client state?

## Phase 1: OAuth Provider Architecture Discovery

### Search 1: Find all OAuth provider implementations
```bash
find . -type f -name "*.js" -o -name "*.ts" | xargs grep -l "oauth.*github\|oauth.*microsoft\|oauth.*google" | grep -v node_modules | head -30
```

**Questions to answer**:
- How many OAuth providers are implemented?
- Which providers have handlers: GitHub, Microsoft, Google?
- Which providers use the proxy pattern (server callback + first-party auth code)?
  **Note**: As of Mar 2026, ALL providers use the proxy pattern. The server receives the provider callback at its own `/oauth/callback` URL, validates the provider token, then issues a `pac_` prefixed first-party auth code that the client exchanges for a first-party JWT. No provider tokens are passed through to clients.
- Where is provider selection logic?

### Search 1a: Dispatcher fan-out at mcp-oauth-validator.js (NEW - 2026-05-18)

```bash
grep -n "verifyOAuthToken\|verifyGitHubToken\|verifyMicrosoftToken\|verifyGoogleToken\|findOrCreateUser" lib/auth/oauth/mcp-oauth-validator.js | head -20
```

**Architectural note**: `mcp-oauth-validator.js:verifyOAuthToken` is a **fan-out dispatcher** — it tries GitHub → Google → Microsoft in sequence and returns the first success. When auditing which OAuth providers reach a code path inside `findOrCreateUser`, account for:
- All 3 providers via the dispatcher (grep `mcp-oauth-validator.js` for `findOrCreateUser` to find the per-provider call sites — typically GitHub/Google/Microsoft each call it once before returning)
- Direct `verifyMicrosoftToken` entries inside `mcp-server-http-clean.js` (bypasses the dispatcher) — grep `oauthValidator\.verifyMicrosoftToken` for current sites; line numbers shift as the monolith is decomposed

**Why this matters**: Round 1 of U2 Path B v3 (2026-05-18) initially framed the dead HS256 mint as "reachable only via GitHub provider". Round 2 re-verification across 3 specialists found this was wrong — the mint runs for ALL 3 providers, with identical discard outcome at the callback consumer sites in `mcp-server-http-clean.js` (post-Wave-3a these have shifted from their Dec-2025 line numbers; grep `oauthValidator\.verifyMicrosoftToken\|oauthValidator\.verifyOAuthToken` for current locations). The dispatcher fan-out is non-obvious from a single call-site grep and worth surfacing explicitly to future audits.

### Search 2: Locate token minting functions
```bash
# Post-U2 (2026-05-19): canonical mintMcpToken consolidated to lib/auth/token-manager.ts
# Per-call mint sites:
grep -rn "mintMcpToken\|mintToken\|jwt.sign\|new SignJWT" --include="*.js" --include="*.ts" \
  lib/auth/ lib/mcp/ lib/services/ mcp-server-http-clean.js 2>/dev/null \
  | grep -v node_modules | head -50

# Canonical signature + helper:
grep -A 20 "export interface MintMcpTokenOptions\|export async function mintMcpToken" \
  lib/auth/token-manager.ts

# Audience policy:
cat lib/mcp/server/tools/hub/audience-policy.js 2>/dev/null | head -100
```

**Questions to answer**:
- Is there a first-party token minting function? (Yes: `lib/auth/token-manager.ts:mintMcpToken` post-U2 Phase A consolidation)
- What algorithm is used? (RS256 via jose `SignJWT`)
- What audiences does it support? (per-service via `audienceForService(service)`, plus `INTERNAL_API_AUDIENCE` and `MCP_FRONTDOOR_AUDIENCE`)
- What claims are included (aud, iss, scope, azp)?
- How are tokens signed?

### Search 3: Find JWKS/JWT infrastructure
```bash
grep -r "jwks\|JWKS\|\.well-known.*jwks\|publicKeyPem\|privateKeyPem" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- Are JWKS endpoints exposed?
- What paths serve JWKS?
- How is the public key exported?
- Is jwks_uri advertised in OAuth discovery?

### Search 4: Find scope/resource parameter handling
```bash
grep -r "scope.*resource\|resource.*parameter\|RFC.*8707" --include="*.js" --include="*.ts" --include="*.md" . | grep -v node_modules | head -30
```

**Questions to answer**:
- How are scope parameters captured?
- Is the resource parameter (RFC 8707) supported?
- How are scope/resource values stored?
- Are they matched exactly in token response?

---

## Phase 2: Provider-Specific Implementation Discovery

### Search 5: GitHub OAuth implementation
```bash
grep -r "github.*oauth\|GITHUB_CLIENT\|handleGitHub\|verifyGitHub" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- How does GitHub OAuth work?
- Are GitHub tokens proxied (server callback) and wrapped as first-party tokens?
- What scopes are requested?
- Where is GitHub token validation?

### Search 6: Microsoft OAuth implementation
```bash
grep -r "microsoft.*oauth\|MICROSOFT_CLIENT\|handleMicrosoft\|microsoft.*token" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- How does Microsoft OAuth work?
- Are Microsoft tokens stored server-side?
- What token strategy is used?
- Where is Microsoft-specific logic?

### Search 7: Google OAuth implementation
```bash
grep -r "google.*oauth\|GOOGLE_CLIENT\|handleGoogle\|google.*token" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- How does Google OAuth work?
- What is the token strategy?
- Are there provider-specific quirks?
- Where is Google token handling?

### Search 8: Provider selection logic
```bash
grep -r "provider.*=\|selectedProvider\|detectProvider\|chooseProvider" --include="*.js" --include="*.ts" -A5 -B5 . | grep -v node_modules | head -100
```

**Questions to answer**:
- How is the OAuth provider selected?
- Is there client detection (ChatGPT vs Claude vs Gemini)?
- How does provider fallback work?
- What is the default provider?

---

## Phase 3: ChatGPT-Specific OAuth Discovery

### Search 9: ChatGPT OAuth handling
```bash
grep -r "ChatGPT\|chatgpt\|openai-mcp\|connector.*oauth" --include="*.js" --include="*.ts" --include="*.md" . | grep -v node_modules | head -50
```

**Questions to answer**:
- Is ChatGPT specially handled?
- What OAuth provider does ChatGPT use?
- Are there ChatGPT-specific scope requirements?
- Where is ChatGPT detection logic?

### Search 10: azp claim handling
```bash
grep -r "azp\|authorized.*party\|client_id.*claim" --include="*.js" --include="*.ts" . | grep -v node_modules | head -30
```

**Questions to answer**:
- Is azp claim included in JWT?
- How is client_id bound to token?
- Is there client-specific token validation?

### Search 11: ChatGPT scope requirements
```bash
grep -r "read:user\|read:org\|scope.*match\|scope.*exact" --include="*.md" . | grep -v node_modules | head -50
```

**Questions to answer**:
- What are ChatGPT's exact scope requirements?
- Are scopes validated for exact match?
- How are scope mismatches handled?
- What's the error message?

---

## Phase 4: Token Management Discovery

### Search 12: Token storage patterns
```bash
grep -r "MCPOAuthTokenManager\|tokenStorage\|token.*store\|storeToken" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- How are provider tokens stored?
- Is storage server-side or client-side?
- How long are tokens retained?
- Is there token cleanup/rotation?

### Search 12b: Token TTL and refresh lifecycle (NEW - 2026-03-11)
```bash
echo "=== Token TTL Discovery ==="

# MCP RS256 token TTL (first-party minted)
echo "RS256 MCP token TTL:"
grep -n "expiresIn\|exp.*=" mcp-server-http-clean.js | grep -i "mint\|sign\|token" | head -10

# OAuth validator HS256 token TTL
echo "OAuth validator HS256 token TTL:"
grep -n "expiresIn" lib/auth/oauth/mcp-oauth-validator.js | head -5

# Refresh token handling
echo "Refresh token flow:"
grep -n "refresh_token\|mcp_refresh\|grant_type.*refresh" mcp-server-http-clean.js | head -15

# Token refresh endpoint
echo "Token refresh endpoint:"
grep -n "refresh.*grant\|grant.*refresh" mcp-server-http-clean.js | head -5
```

**Questions to answer**:
- What is the RS256 MCP token TTL? (expected: 15 minutes)
- What is the OAuth validator HS256 token TTL? (expected: 24 hours)
- How does the refresh token flow work?
- What happens when a client's refresh token expires?
- **Common 401 root cause**: RS256 tokens expire after 15 min. If client refresh cycle breaks, forwarded tokens are expired.

### Search 13: Token exchange flow
```bash
grep -r "exchange.*token\|token.*exchange\|grant_type.*authorization_code" --include="*.js" --include="*.ts" -A10 -B2 . | grep -v node_modules | head -100
```

**Questions to answer**:
- How is authorization_code exchanged for token?
- What happens after provider token is obtained?
- Is a first-party token minted?
- What is returned to client?

### Search 14: Token validation
```bash
grep -r "verifyToken\|validateToken\|jwt.verify\|checkToken" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- How are tokens validated on MCP endpoints?
- What claims are checked?
- How is the signature verified?
- Is JWKS used for validation?

---

## Phase 5: Environment & Configuration Discovery

### Search 15: OAuth environment variables
```bash
grep -r "GITHUB_CLIENT\|MICROSOFT_CLIENT\|GOOGLE_CLIENT\|MCP_.*KEY\|JWKS\|oauth" .env* 2>/dev/null | head -30
grep -r "process.env.GITHUB\|process.env.MICROSOFT\|process.env.GOOGLE\|process.env.MCP" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- What OAuth environment variables are configured?
- Are private/public keys loaded?
- Where are secrets stored?
- Are there provider-specific configs?

### Search 16: OAuth endpoints configuration
```bash
grep -r "authorization_endpoint\|token_endpoint\|jwks_uri\|oauth.*well-known" --include="*.js" --include="*.ts" --include="*.md" . | grep -v node_modules | head -50
```

**Questions to answer**:
- What OAuth endpoints are exposed?
- Are they registered in OAuth discovery?
- What are all JWKS paths?
- Is jwks_uri advertised?

---

## Phase 6: Documentation Discovery

### Search 17: Find all OAuth documentation
```bash
ls -lh cline_docs/*oauth* cline_docs/*chatgpt* | grep -E "\.md$"
```

**Questions to answer**:
- What OAuth documentation exists?
- Which documents are most recent?
- What are key learnings?
- Are there implementation guides?

### Search 18: OAuth architecture documentation
```bash
grep -r "oauth.*architecture\|dual.*oauth\|System A\|System B" --include="*.md" . | grep -v node_modules | head -50
```

**Questions to answer**:
- Is OAuth architecture documented?
- Are dual OAuth systems described (MCP vs Web App)?
- What are system boundaries?
- Are there integration rules?

### Search 19: ChatGPT OAuth breakthrough documentation
```bash
grep -r "chatgpt.*oauth\|ChatGPT.*oauth\|breakthrough\|final.*status.*report" --include="*.md" . | head -20
ls -lh cline_docs/chatgpt-oauth* cline_docs/oauth-provider-mismatch* 2>/dev/null | sort -k6,7
```

**Questions to answer**:
- What ChatGPT OAuth insights are documented?
- What's the latest status report?
- Are scope/resource patterns documented?
- What's the breakthrough solution?

---

## Phase 7: Implementation Files Discovery

### Search 20: Locate MCP OAuth handler
```bash
grep -r "app.get.*authorize\|app.post.*token\|oauth.*handler" --include="*.js" --include="*.ts" -A5 . | grep -v node_modules | head -100
```

**Questions to answer**:
- Where is OAuth authorize handler?
- Where is OAuth token exchange handler?
- Are there separate handlers per provider?
- What's the flow structure?

### Search 21: Locate token minting implementation
```bash
# Post-U2 (2026-05-19): canonical at lib/auth/token-manager.ts. Inspect there first.
grep -A 60 "export async function mintMcpToken" lib/auth/token-manager.ts
grep -B 2 -A 15 "MintMcpTokenOptions" lib/auth/token-manager.ts

# Per-call mint callsites (each must enumerate ALL required fields explicitly per v3.1 Edit 2):
grep -rn "await mintMcpToken({" lib/mcp/ lib/services/ lib/auth/ mcp-server-http-clean.js 2>/dev/null | head -20
```

**Questions to answer**:
- What does mintMcpToken function do? (Mints RS256 JWT with required fields userId/email/role/scope/audience + optional azp/ttlSeconds/jti/purpose)
- What parameters does it accept? (`MintMcpTokenOptions` interface)
- What claims does it create? (`{userId/sub, email, role, scope, aud, azp?, jti, iss, iat, exp}` — Snowflake-compat: `scope` gets `session:role-any` appended)
- How does it sign the token? (jose `SignJWT` with `getPrivateKey()` from `JWT_PRIVATE_KEY_BASE64`, kid from `getCurrentKid()` — `JWT_KEY_ID` env or `DEFAULT_JWT_KEY_ID` fallback, centralized 2026-06-11)
- Pre-mint guards: rate limit 100/min/user (Phase F.2), audience REQUIRED (no implicit default), log volume sampling for per-call-forward (Phase F.5)

### Search 22: Locate JWKS endpoint
```bash
grep -r "\.well-known.*jwks\|jwks\.json\|keys.*:\s*\[" --include="*.js" --include="*.ts" -B5 -A10 . | grep -v node_modules | head -100
```

**Questions to answer**:
- Where is JWKS endpoint implemented?
- What format does it return?
- Are multiple paths served?
- How is the public key exported?

---

## Phase 8: Validation & Testing Discovery

### Search 23: OAuth validation code
```bash
grep -r "validateScope\|validateResource\|validateAud\|checkScope" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- Are scopes validated?
- How are they validated?
- Is exact matching enforced?
- What happens on mismatch?

### Search 24: OAuth tests
```bash
find . -path ./node_modules -prune -o -type f -name "*oauth*.test.js" -o -name "*oauth*.spec.js" -o -name "*test*oauth*" 2>/dev/null | head -30
```

**Questions to answer**:
- Are OAuth tests present?
- What scenarios are tested?
- Are provider-specific tests present?
- Is ChatGPT OAuth tested?

### Search 25: Production OAuth flow evidence
```bash
# Legacy console.log bracket patterns (pre-pino migration)
grep -r "\[OAuth\]\|\[MCP OAuth\]\|\[OAuth.*Token\]" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50

# pino structured logging — authLogger usage in OAuth code
grep -rn "authLogger\.\(info\|warn\|error\|debug\)" lib/auth/oauth/ --include="*.ts" --include="*.js" | head -30
grep -rn "mcpLogger\.\(info\|warn\|error\|debug\)" mcp-server-http-clean.js | head -30

# Check which domain loggers are imported in OAuth files
grep -rn "from.*lib/logger\|require.*lib/logger" lib/auth/oauth/ mcp-server-http-clean.js --include="*.ts" --include="*.js" | head -20
```

**Questions to answer**:
- What logging is present (pino domain loggers vs legacy console.log)?
- Are OAuth flows logged with structured context (object-first pino API)?
- What pino domain loggers are used (authLogger, mcpLogger, apiLogger)?
- Are provider names, correlation IDs, and scope info included in log context?
- How can OAuth be monitored via PM2 JSON logs?

### Search 25b: Pino structured log monitoring (Production)
```bash
# pino auth domain logs — filter by level and provider
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | jq -r '[.time, .level, .msg, .provider // \"no-provider\"] | @tsv'" 2>/dev/null | tail -30

# pino auth errors only (level 50 = error)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":50' | jq" 2>/dev/null | tail -20

# pino MCP domain logs — OAuth-related
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"mcp\"' | grep -i 'oauth\|token\|scope' | jq" 2>/dev/null | tail -20

# OAuth audit log (separate custom file logger — NOT pino)
ssh <PROD_USER>@<PROD_HOST> "tail -50 /var/log/paichart/oauth-audit.log | jq" 2>/dev/null
```

**Questions to answer**:
- Are pino structured logs flowing for auth domain in production?
- Are auth errors (level 50) being captured with provider context?
- Does the OAuth audit log (separate from pino) have recent entries?
- Are both logging systems (pino + OAuth audit) producing output?

---

## Phase 9: Integration Points Discovery

### Search 26: MCP handler OAuth integration
```bash
grep -r "req.user\|req.headers.authorization\|Bearer.*token" --include="*.js" --include="*.ts" . | grep -v node_modules | wc -l
grep -r "authMiddleware\|auth.*handler\|checkAuth" --include="*.js" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- How do MCP handlers receive auth context?
- What auth middleware exists?
- Are tokens extracted from Authorization header?
- How is user context passed through?

### Search 27: Database OAuth schema
```bash
grep -r "oauth_provider\|oauth_id\|oauth_token" --include="*.prisma" --include="*.ts" . | grep -v node_modules | head -50
```

**Questions to answer**:
- How is OAuth state stored in database?
- What fields track provider info?
- Is token metadata stored?
- How are users linked to OAuth accounts?

### Search 28: RBAC/Permission OAuth integration
```bash
grep -r "scope.*permission\|permission.*scope\|RBAC.*oauth" --include="*.js" --include="*.ts" --include="*.md" . | grep -v node_modules | head -50
```

**Questions to answer**:
- How are OAuth scopes mapped to permissions?
- Is RBAC integrated with OAuth?
- How are scopes enforced?
- What permission levels exist?

---

## Phase 10: Synthesis & Analysis

### Synthesis Questions:

1. **Provider Strategy Matrix** (Proxy Pattern - Mar 2026):
   - GitHub: First-party tokens via proxy (server callback at /oauth/callback, pac_ auth codes)
   - Microsoft: First-party tokens via proxy (same pattern)
   - Google: First-party tokens via proxy (same pattern)
   - **All providers now use the same proxy pattern**: the server sends its own callback URL to the provider, receives the provider token at /oauth/callback, validates it, then issues a pac_ prefixed first-party auth code. The client exchanges that code for a first-party JWT. No provider tokens are ever exposed to clients.

2. **Token Lifecycle**:
   - How are tokens created?
   - How long do they live?
   - When are they refreshed?
   - How are they revoked?

3. **Scope Handling**:
   - How are scopes specified?
   - Are they validated?
   - Is exact matching used?
   - What's the mismatch behavior?

4. **ChatGPT-Specific**:
   - What OAuth provider does ChatGPT use?
   - What are ChatGPT's requirements?
   - What's the breakthrough solution?
   - Why does it matter?

5. **JWKS Infrastructure**:
   - What paths serve JWKS?
   - How is public key managed?
   - How do clients validate signatures?
   - What's the key rotation strategy?

6. **First-Party Tokens**:
   - Are they implemented?
   - What do they protect against?
   - Why are they needed?
   - What's the tradeoff?

7. **Architecture Health**:
   - Are dual OAuth systems isolated?
   - Is token storage separated?
   - Are boundaries enforced?
   - Any cross-contamination risks?

---

## Phase 11: Recent Implementation Patterns (Oct 22, 2025)

### Search 24: Scope validation functions
```bash
grep -r "validateScopeMatch\|validateScope\|scope.*validation" --include="*.js" --include="*.ts" -B2 -A10 . | grep -v node_modules | head -80
```

**Questions to answer**:
- ~~Is there a validateScopeMatch function?~~ (NO — DELETED 2026-06-11; exact-scope echo enforced by construction at the token endpoint, dead runtime check removed)
- Where is it defined?
- Where is it called (token response flow)?
- What error message does it throw?
- Does it log "✅ Exact match"?

### Search 25: azp claim
```bash
grep -r "azp" --include="*.js" --include="*.ts" -B2 -A3 . | grep -v node_modules | head -100
```

**Questions to answer**:
- Where is `azp` written? (mintMcpToken sets it from originalClientId)
- Note: `expectedClientId` was removed from `verifyAccessToken` 2026-04-01 (commit 4e4f8b31) as dead code, then **RESTORED 2026-05-18** (`token-manager.ts:310-313`) as optional azp enforcement — threaded through `verifyMcpToken` (`auth-manager.ts:391`, 1 of 4 `verifyAccessToken` call sites) but **dormant** (no caller passes it yet; live client-binding today is the refresh-grant `client_id` check at `oauth-flow-routes.ts:747`). The parameter EXISTS today (don't assume it's absent). Per-client validation is still limited because GitHub MCP clients share one org-app azp (`Iv23lizLBJNisgLT7shD`) until Phase 5.1 (`client_type` claim).

### Search 26: Edge Runtime RS256 patterns
```bash
grep -r "Edge Runtime\|atob.*headerB64\|manual.*decode\|RS256.*decode" --include="*.js" --include="*.ts" -B5 -A15 . | grep -v node_modules | head -150
```

**Questions to answer**:
- Is Edge Runtime RS256 decode implemented?
- Does it use atob() + JSON.parse() instead of crypto.createPublicKey()?
- Is there a comment explaining why (Edge Runtime limitations)?
- Does it validate azp claim after decode?
- Does it fall through to HS256 verification?

### Search 27: Duplicate JWT validation files
```bash
find . -path "*/lib/jwt.ts" -o -path "*/lib/auth/token-manager.ts" | head -5
grep -l "verifyAccessToken" lib/jwt.ts lib/auth/token-manager.ts 2>/dev/null
```

**Questions to answer**:
- Do both lib/jwt.ts and lib/auth/token-manager.ts exist?
- Do both have verifyAccessToken functions?
- Are the implementations consistent (both support RS256 + azp)?
- Is there a comment warning about the duplication?

### Search 28: Global Prisma connection pooling
```bash
grep -r "globalPrisma\|global.prisma\|new PrismaClient.*global" --include="*.js" --include="*.ts" -B3 -A8 . | grep -v node_modules | head -100
```

**Questions to answer**:
- Is there a global Prisma client in mcp-server-http-clean.js?
- Where is it defined (top of file)?
- Which OAuth functions use globalPrisma instead of new PrismaClient()?
- Are $disconnect() calls removed (connection pool reused)?
- How many locations were updated (should be 3)?

### Search 29: Connection pooling usage in OAuth flows
```bash
grep -n "await globalPrisma\|globalPrisma.user.findUnique" mcp-server-http-clean.js 2>/dev/null | head -10
```

**Questions to answer**:
- Line ~553: RS256 token validation?
- Line ~1592: Refresh token endpoint?
- Line ~1862: OAuth token refresh grant?
- Are all 3 locations using globalPrisma?
- Are there any remaining "new PrismaClient()" in OAuth code?

---

## Expected Discoveries

### Code Discoveries:
- [ ] OAuth authorize endpoint (line numbers)
- [ ] OAuth token exchange endpoint (line numbers)
- [ ] First-party token minting function (line numbers)
- [ ] JWKS endpoint (line numbers)
- [ ] Token validation middleware (line numbers)
- [ ] Provider detection logic (line numbers)
- [ ] Scope capture pattern (line numbers)
- [ ] Token storage implementation (line numbers)
- [x] **(Oct 22 → removed)**: validateScopeMatch — DELETED 2026-06-11 (dead since Wave 3b.0a; tautological self-comparison)
- [ ] **NEW (Oct 22)**: azp validation in verifyAccessToken (both JWT files)
- [ ] **NEW (Oct 22)**: Edge Runtime RS256 decode pattern
- [ ] **NEW (Oct 22)**: Global Prisma connection pool (3 locations)
- [ ] **NEW (Mar 26)**: Proxy pattern infrastructure (serverCallbackUrl, pac_ auth codes, isAllowedRedirectUri)
- [ ] **NEW (May 26)**: SessionStore class — `lib/auth/oauth/session-store.ts` owns all session/auth-code/OAuth-request state and `isAllowedRedirectUri`. Callers in `mcp-server-http-clean.js` use `this.sessionStore.*`. See `protocols/mcp-sdk-upgrade-protocol.md`.

### Documentation Discoveries:
- [ ] OAuth architecture clarification
- [ ] Dual OAuth systems documentation
- [ ] Provider-specific patterns
- [ ] ChatGPT OAuth breakthrough insights
- [ ] First-party token requirements
- [ ] RFC 8707 resource parameter handling
- [ ] Scope/resource matching requirements
- [ ] azp claim requirements

### Configuration Discoveries:
- [ ] OAuth providers configured (GitHub, Microsoft, Google)
- [ ] Environment variables loaded
- [ ] Private/public keys available
- [ ] JWKS endpoints exposed
- [ ] JWKS paths (all variants)
- [ ] OAuth discovery endpoint

### Pattern Discoveries:
- [ ] Scope capture by state
- [ ] First-party token minting
- [ ] Provider token storage
- [ ] Token lifecycle management
- [ ] Client detection logic
- [ ] Provider selection strategy
- [ ] Fallback behavior
- [ ] **NEW (Mar 26)**: Proxy pattern (server callback → pac_ auth code → first-party JWT)

---

## Critical Questions for oauth-multi-provider-specialist

After discovery completes, answer these:

1. **What is the current token strategy for each provider?**
   - GitHub: [ ] Proxy (first-party via server callback) [ ] First-Party [ ] Mixed [ ] Unknown
   - Microsoft: [ ] Proxy (first-party via server callback) [ ] First-Party [ ] Mixed [ ] Unknown
   - Google: [ ] Proxy (first-party via server callback) [ ] First-Party [ ] Mixed [ ] Unknown

2. **Is ChatGPT OAuth working?**
   - [ ] Working perfectly
   - [ ] Partially working
   - [ ] Broken
   - [ ] Unknown

3. **What's the scope matching approach?**
   - [ ] Exact string matching
   - [ ] Normalized matching
   - [ ] Not validated
   - [ ] Unknown

4. **Is JWKS infrastructure complete?**
   - [ ] Public key exposed
   - [ ] Multiple paths served
   - [ ] jwks_uri advertised
   - [ ] Token validation working
   - [ ] [ ] All of above
   - [ ] [ ] Partial

5. **What OAuth issues need fixing?**
   - [ ] Token strategy inconsistency
   - [ ] Scope mismatch bugs
   - [ ] JWKS accessibility
   - [ ] ChatGPT compatibility
   - [ ] First-party token missing
   - [ ] None - all working

---

## Success Criteria

Discovery complete when:

- ✅ All OAuth providers mapped (GitHub, Microsoft, Google)
- ✅ Token strategies documented for each provider
- ✅ First-party token implementation (if present) understood
- ✅ JWKS infrastructure fully mapped
- ✅ Scope/resource handling documented
- ✅ ChatGPT OAuth patterns identified
- ✅ Token lifecycle documented
- ✅ All critical files located with line numbers
- ✅ All configuration discovered
- ✅ Architecture health assessed

---

## Related Discovery Prompts

- `/cline_docs/discovery-prompts/auth-permissions-discovery.md` - Broader auth context
- `/cline_docs/discovery-prompts/oauth-multi-client-discovery.md` - Multi-client coordination
- `/cline_docs/discovery-prompts/mcp-integration-discovery.md` - MCP integration points

## Related Documentation

- `/.claude/knowledge/domain/oauth/chatgpt-oauth-diagnostic-guide.md` - ChatGPT OAuth troubleshooting (95% confidence, Dec 7 2025)
- `/.claude/knowledge/domain/oauth/oauth-audit-logging-quick-ref.md` - OAuth monitoring quick reference
- `/.claude/knowledge/domain/oauth/chatgpt-oauth-final-status-report.md` - ChatGPT OAuth resolution journey

---

## Wave 6 Update — selectProvider Helper + Extracted OAuth Flow (May 21, 2026)

**Wave 6 Phase 6.4** (commit `5f97c9ed`) extracted R7 authorize + R9 token from `mcp-server-http-clean.js` to `lib/mcp/server/routes/oauth-flow-routes.ts`, AND introduced a new file-private helper for provider routing:

### `selectProvider(ctx, redirectUri, explicitProvider)` (Plan v2 C8 fold)

```typescript
// lib/mcp/server/routes/oauth-flow-routes.ts
function selectProvider(
  ctx: RouteContext,
  redirectUri: string | undefined,
  explicitProvider: string | undefined
): ProviderSelection {
  const { clientName, clientConfig } = authManager.detectOAuthClient(redirectUri);
  const selectedProvider = (explicitProvider ||
                            clientConfig?.defaultProvider ||
                            'github').toLowerCase() as 'github' | 'microsoft';
  return { selectedProvider, detectedClientName: clientName, detectedClientConfig: clientConfig };
}
```

Used by BOTH R7 (authorize) and R9 (token) — same selection algorithm shared. Selection precedence: explicit `?provider=` query param > client's defaultProvider from AuthManager > `'github'`.

**Why file-private not in AuthManager**: These code branches are route-local (they sit BETWEEN AuthManager's classifier output and the Express response). AuthManager exposes `detectOAuthClient`; `selectProvider` consumes its output + the route's query string. Plan v2 D12 design decision.

### New file locations for provider-routing concerns

| Concern | Old (pre-Wave-6) | New (post-Wave-6) |
|---|---|---|
| GET /oauth/authorize (R7) — provider routing | mcp-server-http-clean.js inline | `lib/mcp/server/routes/oauth-flow-routes.ts:registerR7Authorize` |
| GET /oauth/callback (R8) — Microsoft delegation | mcp-server-http-clean.js inline | `lib/mcp/server/routes/oauth-flow-routes.ts:registerR8Callback` |
| POST /oauth/token (R9) — refresh + auth-code grants | mcp-server-http-clean.js inline | `lib/mcp/server/routes/oauth-flow-routes.ts:registerR9Token` |
| POST /oauth/register (R10) — classifier + 2 branches | mcp-server-http-clean.js inline | `lib/mcp/server/routes/oauth-flow-routes.ts:registerR10Register` |

### D11 LOCKED INVARIANT — OAuth callback audience

OAuth flow audience = `requestedResource || MCP_FRONTDOOR_AUDIENCE` (front door = `${PUBLIC_BASE_URL}/mcp`, derived from `APP_BASE_URL` in `lib/auth/public-base-url.ts` since 2026-09-04 — imported from the auth layer, NEVER from audience-policy). **NOT** `audienceForService()`. Third leg: the Microsoft authorize path in `mcp-server-http-clean.js`. See file-header of `oauth-flow-routes.ts` and the auth-permissions-discovery.md "Wave 6 Update" section for full rationale.

```bash
grep -c "← D11 LOCKED" lib/mcp/server/routes/oauth-flow-routes.ts               # expect 3 — R7 store (:440), R8 carry-through (:648), R9 mint (:973) each carry the marker; never count the `|| MCP_FRONTDOOR_AUDIENCE` expression (the docstring quotes it too)
grep -c "resource || MCP_FRONTDOOR_AUDIENCE" mcp-server-http-clean.js               # expect 1 — Microsoft leg (D11)
```

### Handlers still on server class (referenced via RouteContext)

`handleMicrosoftAuthorize` and `exchangeMicrosoftCode` remain on the server class (Wave 3b dead-code drop preserved their alive paths). R7 invokes them via `ctx.handleMicrosoftAuthorize(req, res)` and R8 via `ctx.exchangeMicrosoftCode(opts)`. To debug Microsoft-specific provider behavior, grep both `mcp-server-http-clean.js` (method bodies) and `lib/mcp/server/routes/oauth-flow-routes.ts` (delegation sites).

**Retry behavior (2026-06-09):** `exchangeMicrosoftCode` is the ONLY live `fetchWithRetry` caller (retries the MS token endpoint on 429/503/504). As of 2026-06-09 the retry backoff has **±20% jitter** (`lib/auth/oauth/retry-utils.ts` `calculateDelay`, behind a `jitter` flag — BC14 herd de-sync; signed off by oauth-multi-provider/client). **✅ Retry-After honored (fixed 2026-06-09):** previously dead code (`fetchWithRetry` set only `error.statusCode`); now it captures `response.headers.get('retry-after')` and sets `error.response.headers` at the throw site, so `withRetry`'s 429 branch clamps the delay to `Retry-After`. Jitter never subtracts from it.
```bash
# Verify the live MS-exchange retry config + that Retry-After is now wired
grep -n "fetchWithRetry(" mcp-server-http-clean.js            # the one live call (token exchange)
grep -n "error.response\|retry-after" lib/auth/oauth/retry-utils.ts  # fetchWithRetry sets error.response; withRetry:88 reads it
```

@see `lib/mcp/server/routes/oauth-flow-routes.ts`
@see `scripts/test-routes-oauth-flow.ts`
