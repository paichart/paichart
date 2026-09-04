# auth-permissions-specialist — Domain Library

> **Created 2026-06-11** by the Protocol 12 eviction rollout (wave 1): knowledge depth moved OUT of
> `.claude/agents/auth-permissions-specialist.md` per the eviction rule
> (`.claude/knowledge/protocols/specialist-eviction-protocol.md`). The specialist is the router;
> this file is the store — greppable on demand, NOT auto-loaded. Content is verbatim at eviction
> time; dates/commits are provenance. Evicted session blocks are at the end under
> "Evicted session blocks (R3 dispositions in the rollout triage table)".

---

## MCP Tool Security Architecture

**IMPORTANT**: When working with MCP tool permissions, consult:
- **Guide**: `/.claude/knowledge/domain/mcp/tool-permission-management.md`
- **Purpose**: Three-tier tool security (PUBLIC, AUTHENTICATED, ADMIN)
- **Contains**:
  - Two-layer auth model (method-level + tool-level enforcement)
  - Step-by-step tool movement procedures
  - Security best practices for tool categorization
  - Verification and testing procedures

**When to Reference**:
- Modifying tool permission categories
- Conducting MCP security audits
- Implementing new MCP tools
- Reviewing tool access control

**Key Insight**: Tool security works WITH method-level auth (both layers validate together)

### How to Interpret Discovery Results

**Run auth-permissions-discovery.md first, then interpret:**

**POV Protection Patterns** (4 patterns - from endpoint-security-audit.md Phase 1.5):
- **Middleware found** (Pattern 1 or 2): Route protected ✅
- **Handler found** (Pattern 3): Check handler file in lib/pov/handlers/
  - Handler has `validatePOVAccess` or `checkPermission`: Protected ✅
  - Handler missing checks: Vulnerable ❌
- **Manual validatePOVAccess** (Pattern 4): Route protected ✅
- **User-scoped query only**: Review if sufficient (OK for list endpoints)
- **None**: CRITICAL - immediate protection needed ❌

**validatePOVAccess Signature** (Correct usage):
```typescript
// ✅ CORRECT (boundary-contract validated)
validatePOVAccess(user, pov, { throwOnDeny: true, logContext: 'Operation' })

// Where pov = { id, ownerId, metadata, team: { members: [{userId}] } }

// ❌ WRONG (will not compile)
validatePOVAccess(povId, user.userId)
```

**DEMO_USER Bypass Behavior**:
- Built into `validatePOVAccess` automatically
- Checks `metadata.isDemo === true`
- Additive access model: owned + team + demo POVs
- No special code needed in routes


---

## 🆕 Recent Updates

### Component 5: Audience Standardization (Jan 30, 2026) ⭐ DEPLOYED → extended by U2 (May 19, 2026)

**Status**: ✅ Production (Component 5: `99965175` Jan 30; U2 Audience-Tightening: 9 commits ending `de6a2fa6` May 19)

**Audiences (current)**:
- `https://paichart.app/mcp/<service-slug>` — **per-service (RFC 8707, primary post-U2)**. Convention: `audienceForService({name})` → NFKD-normalized service name. Examples: `/mcp/snowflake-service`, `/mcp/token-validator-service`.
- `https://paichart.app/api` — Web/API (RS256, used for internal `/api/*` calls)
- `https://paichart.app/mcp` — MCP front door inbound (OAuth callbacks, refresh-grant)
- `paichart-api`, `paichart-app` — Deprecated (sunset Jul 5, 2026)

**U2 Key Changes (2026-05-19)**:
- Per-service audience minting via Hub-side `audienceForService` helper (RFC 8707 blast-radius isolation)
- `azp` claim (Option α) propagated from auth middleware through per-call mints
- 3 auth-middleware paths consolidated into `populateReqUser()` helper
- Refresh-grant `client_id` mismatch enforcement at `/oauth/token` (dedicated `/oauth/refresh` endpoint DROPPED Wave 6 Phase 0.6 / 2026-05-21 — clients use `/oauth/token` with `grant_type=refresh_token` per RFC 6749 §6)
- Mint rate limit (100/min/user) + log volume sampling (`PAICHART_MCP_MINT_LOG_SAMPLE_RATE`)

**Reference**: `/.claude/knowledge/domain/oauth/oauth-audience-architecture.md` + `cline_docs/reviews/u2-audience-tightening-2026-05-19/IMPLEMENTATION-PLAN-v3.1.md`

---

### Wave 3a: AuthManager Extraction (May 20, 2026) — Substantially Complete

**Status**: 🟢 Phases 3.0a → 3.10a shipped (commits `e133bdbc` → `e2ee8a38`). AuthManager **is sole authority** for all 4 extracted methods — the legacy server-class implementations have been **deleted**, not just deprecated. Only 3.10b (drift sweep — this section is part of it) and 3.10c (8-cat time-bomb audit) remain in Wave 3a.

**Security fixes closed by this wave**:
- ✅ **SEC-C1** (silent fallback `JWT_ACCESS_SECRET || 'access-secret'`) — Phase 3.5a WARN (`545f1731`) + 3.5b THROW (`f7fa0ec5`) closed it at the time. **Superseded 2026-06-06**: the guards were deliberately DELETED in the retirement Deploy 1 (`c9636035`) because the secret itself is gone — `grep "JWT_ACCESS_SECRET is not set"` returning ZERO is correct, not a regression. The vulnerability class is closed permanently (no symmetric secret exists to fall back to).
- ✅ **SEC-C2** (multi-key JWKS verification gap) — Phase 3.0b (`6ae70fc3`). Kid-based lookup via `lib/auth/jwt-key-store.ts`.
- ✅ **SEC-C3** (auth startup race) — partial via Phase 3.5b initialize gate (`f7fa0ec5`). Full closure: AuthManager owns startup ordering now.
- ✅ **SEC-C4** (RFC 6585 §4 Retry-After header on 429) — Phase 3.9 (`baa4613a`). `AuthManager.checkCallbackRateLimit` returns `retryAfterSeconds`; caller sets `Retry-After` header.

**New files introduced** (canonical for token/scope/audience handling):

| File | Purpose | Authority status |
|---|---|---|
| `lib/auth/oauth/auth-manager.ts` (813 LOC as of 2026-06-11) | 10 public methods (+1 test-only `__getRateLimitMapSize`) — extracted auth pipeline. Includes `verifyMcpToken`, `populateReqUser`, `decodeJwtPayload`, `detectOAuthClient`, `generateRefreshToken`, `createMiddleware`, `checkCallbackRateLimit`, `checkRegisterRateLimit` (post-Wave-3a, `8f19afae` — /oauth/register DCR gate 30/min/IP), `initialize`, `destroy`. (`validateScopeMatch` DELETED 2026-06-11 — dead since Wave 3b.0a `0f07ac90` removed its only-ever caller, the dead Microsoft exchange handler; check was a tautological self-comparison. `scope_match_validated`/`scope_mismatch_detected` audit events retired with it.) | 🟢 **`populateReqUser` is authoritative on hot path** (Phase 3.6, commit `e80df8c4`). `initialize()` is authoritative for startup fail-fast (Phase 3.5b). `generateRefreshToken`/`detectOAuthClient`/`checkCallbackRateLimit` callers migrated (Phase 3.8/3.8d/3.9) — dispatch sites now live in `lib/mcp/server/routes/oauth-flow-routes.ts` post-Wave-6. |
| `lib/auth/jwt-key-store.ts` (~180 LOC) | Single source of truth for **kid-based public key lookup**. Handles 5 edge cases: missing/malformed kid → throw, kid collision → fail-fast, race-during-rotation → re-read env on miss, `JWT_KEY_PREV_EXPIRES` enforcement, alg pinning. Exports `getPublicKeyPEM(kid)` + `__resetKeyCacheForTests()`. | 🟢 authoritative — `lib/auth/token-manager.ts` and inline verifier in `mcp-server-http-clean.js` both go through it for RS256 verification. Closes SEC-C2. |
| `lib/auth/auth-constants.ts` (~130 LOC) | Single source of truth for `TOKEN_TTL_SECONDS=900`, `OAUTH_STATE_TTL_MS`, `REFRESH_TOKEN_TTL_DAYS`, `CHATGPT_SCOPE='openid email'`, `CLAUDE_SCOPE='user:email'` (Apr 2026 reduction), `MICROSOFT_GRAPH_SCOPE*`, `MCP_SCOPES`, `OIDC_SCOPES`, `GITHUB_SCOPES`, `LEGACY_AUDIENCES`, `PER_SERVICE_AUDIENCE_PREFIX`, `JWT_ISSUER`. | 🟢 authoritative — server-class static props now re-export from this module. |

**Test fixture**: `test/fixtures/test-jwt-keys.ts` — generates 3 RSA keypairs at suite startup (current/previous/foreign). Exposed via `installTestKeysIntoEnv()` and `getTestKeys()`. Used by `scripts/test-auth-manager.ts` (28 passing as of 2026-06-11; Tests 7/9/15/28 removed with their dead subjects — tombstones in the suite header).

**req.user contract (post-3.6, AuthManager-authoritative)**:
- Always: `id`, `userId` (dual emission for downstream `user.id || user.userId` callers), `email`, `role`, `token`, `authMethod`
- Optional extras (when claim present in JWT): `azp`, `name`, `scope`, `jti`, `permissions`, `tenantId`, `provider`
- **`Object.freeze`'d post-population** (SEC-N1 / Test 18). Any code that mutated req.user after auth will now throw — none was found pre-3.6, but downstream code must not assume mutability.

**Dead code dropped in Phase 3.0a** (zero callers; all canonical lives in `lib/auth/oauth/mcp-oauth-validator.js`):
- `CleanMCPHTTPServer.verifyGitHubToken()`
- `CleanMCPHTTPServer.findOrCreateUserFromGitHub()`
- `CleanMCPHTTPServer.mcpOAuthRefreshMiddleware()`

**Dead code dropped in Phase 3.6** (when AuthManager became authoritative on hot path):
- `_shadowValidateAuth()` server-class helper — Phase 3.4 shadow validation, removed in 3.6 commit. 0 `auth_dual_validate_drift` events fired across 3.5a + 3.5b deploys, confirming AuthManager-vs-legacy equivalence.

**Dead code dropped in Phase 3.10a** (commit `e2ee8a38`):
- Legacy `populateReqUser` bare function (was inline in mcp-server-http-clean.js — grep history shows pre-Phase-3.10a location)
- Legacy `generateRefreshToken` class method
- Legacy `validateScopeMatch` class method *(the AuthManager port itself was then deleted 2026-06-11 — dead since Wave 3b.0a)*
- Legacy `detectOAuthClient` class method

All 4 had 0 callers after 3.6/3.8/3.8c/3.8d migrations. Net -129 LOC. Stub comments remain pointing future maintainers at the AuthManager equivalents.

**Reference**: `cline_docs/reviews/auth-manager-extraction-2026-05-20/auth-manager-extraction-plan-v3.md` (82-item traceability matrix, 94% confidence).

---

### Wave 4: Auth Middleware Orchestrator Extraction (May 20, 2026) — COMPLETE

**Status**: 🟢 Phases 4.0–4.5 shipped (commits `8e777de9` → present). `AuthManager.createMiddleware()` is now **sole authority** for the auth orchestration on the hot path. The server-class `createAuthMiddleware()` is a thin ~30 LOC delegation wrapper that catches `AuthMiddlewareReject` and merges `req.body?.id ?? null` into the JSON-RPC envelope at serialize time.

**Phases shipped**:
- **4.0** (`8e777de9`) — Inject `prismaClient` into AuthManager constructor (typed `PrismaUserReader` interface)
- **4.1** (`f94d319c`) — Define `AuthMiddlewareReject` builder class (statusCode + headers + jsonRpcErrorWithoutId)
- **4.2** (`be9ba379`) — Fill `AuthManager.createMiddleware()` with full orchestration; +11 unit tests (Tests 22-33) covering RS256/HS256/API-key paths, role-source asymmetry (D7), byte-identical role strings, undefined-method, token-field invariant, dual-emit verification
- **4.3** (`9d08a4fd`) — Shadow validation observation window with synthetic ReqUser comparison (no req mutation per boundary I2); 5 wire sites in legacy
- **4.4** (`843c49da`) + **hotfix** (`ef04e744`) — Flip authority + delete legacy 234 LOC + remove shadow. Hotfix added lazy-init pattern in wrapper to defer `authManager.createMiddleware()` factory call until first request (avoided SEC-C4 throw-before-init at server construction time).
- **4.5** (this commit) — Drift sweep + 8-cat time-bomb audit + this section

**Wave 4 design decisions (v2 plan)**:
- D1: Prisma injected at construction
- D2: Use existing `AuthManager.verifyMcpToken` (no verifier lambda — eliminates SEC-C3 race + 2-sig confusion)
- D3: `AuthMiddlewareReject` builder pattern; server wrapper serializes
- D6: DUAL emit (pino `this.logger` + `this.oauthAuditLogger`) on success + 401 paths
- D7: Role-source asymmetry — **RS256 (Path 1a) reads FRESH role from Prisma**; api-key tokens ALSO read FRESH (`enforceActiveApiKey`, 2026-06-04); HS256 path retired. Test 27 locks the RS256 invariant (Test 28 HS256-asymmetry deleted 2026-06-06). *(Updated — see the 2026-06-06 pointer at top; the "HS256/API-key read STALE" framing is obsolete.)*
- D8: Observation gate ≥100 requests + 24h + 0 drift (or all-Case-B per triage) + p99 < 50ms

**Behavioral improvement landed in Phase 4.4**:
- `req.user.name` is now populated from `prisma.user.name` when JWT payload lacks the name claim. Downstream consumers (task comments, audit logs, notifications) see real names instead of undefined. This was the 26 drift events in Phase 4.3 observation — Case B (intentional improvement) per the drift triage framework.

**Bugs Phase 4.3 shadow caught**:
- 26 name-divergence drift events (Case B — design improvement, accepted)
- 10 TypeError events during reconnect window: `token-manager.verifyAccessToken` inner catch swallows RS256 errors and falls through to HS256 with Uint8Array secret. PRE-EXISTING bug not introduced by Wave 4. Filed as Task #135 follow-up.
- 1 SEC-C4 throw-before-init bug in Phase 4.4 wrapper: `authManager.createMiddleware()` called at server-construction time, before `initialize()`. Caught by health-gate auto-rollback (release `release_20260520_104615` rolled back after 10 startup attempts). Hotfix `ef04e744` deferred the factory call to first request.

**File size impact (start of Wave 4 → end of Wave 4)**:
- `mcp-server-http-clean.js`: 4054 LOC → **~3886 LOC** (-168 LOC net)
- `lib/auth/oauth/auth-manager.ts`: ~600 LOC → ~900 LOC (orchestration moved IN)
- Net codebase: ~+130 LOC but with 33 unit tests covering the auth middleware at Wave 4 close (was 0 dedicated unit tests for the legacy orchestration; smoke tests only). *(Suite is 28 as of 2026-06-11 — Tests 7/9/15/28 removed when their subjects were deleted: verifyApiKey, validateScopeMatch, SEC-C1 guard, HS256 asymmetry.)*

**Reference**: `cline_docs/reviews/auth-middleware-extraction-2026-05-20/auth-middleware-extraction-plan-v2.md` (28-item traceability matrix, 95%+ confidence) + `cline_docs/reviews/auth-middleware-extraction-2026-05-20/phase-0-inventory.md`.

---

## 🆕 Recent JWT Validation Patterns (Oct 22, 2025)

### Edge Runtime RS256 Validation

**CRITICAL CONSTRAINT**: Edge Runtime (Next.js API routes) doesn't support Node crypto module.

**Problem**: Cannot use `crypto.createPublicKey()` or `importSPKI()` for RS256 JWT verification

**Solution**: Manual JWT decode without cryptographic verification

```typescript
// expectedClientId: removed 2026-04-01 (commit 4e4f8b31) as dead code, then
// RESTORED 2026-05-18 (token-manager.ts:310-313) — optional azp enforcement,
// threaded through verifyMcpToken (auth-manager.ts:391) — 1 of 4 verifyAccessToken
// sites — but DORMANT (no caller passes it yet; live client-binding = the
// refresh-grant client_id check at oauth-flow-routes.ts:747).
// HS256 session/refresh fallback REMOVED 2026-05-28 (Step 2) — RS256-only now.
export async function verifyAccessToken(
  token: string,
  expectedClientId?: string
): Promise<JWTPayload> {
  // Full RS256 cryptographic verification (kid-based JWKS lookup) with issuer +
  // audience validation; non-RS256 tokens rejected (no HS256 branch).
}
```

**Security Justification**:
- RS256 tokens already validated in MCP server (signature verified on minting)
- Middleware detects RS256 and passes through (already authenticated)
- Edge Runtime just extracts claims (no re-verification needed)
- Safe because we control the entire authentication chain

**Trust Chain**:
1. MCP server mints RS256 token (signs with private key)
2. Token sent to client (ChatGPT, Claude Desktop, etc.)
3. Client sends token in Authorization header
4. Middleware validates RS256 signature (full crypto verification)
5. Edge Runtime extracts claims (trusts middleware validation)

### Duplicate JWT Validation Functions

**CRITICAL**: Two files have `verifyAccessToken()` due to historical code duplication. Both must be updated for consistency.

**Files**:
1. `lib/jwt.ts` - Primary JWT utilities
   - Used by: getAuthUser, some API routes
   - Import path: `import { verifyAccessToken } from '@/lib/jwt'`

2. `lib/auth/token-manager.ts` - Duplicate JWT utilities
   - Re-exported by: `lib/auth/index.ts`
   - Used by: Other API routes
   - Import path: `import { verifyAccessToken } from '@/lib/auth'`

**Import Confusion Example**:
```typescript
// Route A
import { verifyAccessToken } from '@/lib/auth';  // Gets token-manager version

// Route B (via getAuthUser)
import { verifyAccessToken } from '../jwt';      // Gets lib/jwt version
```

**Action Required**: When updating JWT validation logic, update BOTH files to avoid runtime inconsistency.

**Known Issue**: OAuth Roadmap Item 1.1 recommends consolidation into single `lib/auth/token-validator.ts` (deferred due to complexity)

### azp Claim (Client Binding)

**Status**: `azp` is written to every minted JWT (set from `originalClientId`). The azp-enforcement parameter `expectedClientId` is threaded through `verifyMcpToken` (`auth-manager.ts:391`, 1 of 4 `verifyAccessToken` call sites) but is **dormant** — no caller passes it yet, so the azp check is skipped. The live client-binding that runs today is the separate refresh-grant `client_id` check at `oauth-flow-routes.ts:747`.

**History**: `expectedClientId` was removed from `verifyAccessToken` 2026-04-01 (commit `4e4f8b31`) as dead code, then **RESTORED 2026-05-18** (`token-manager.ts:310-313`) as optional opt-in azp enforcement. Per-client validation is still limited because all GitHub MCP clients share one org-app `azp` (`Iv23lizLBJNisgLT7shD`) until Phase 5.1 (`client_type` JWT claim) lands — but the parameter and the azp check EXIST today.

**Future**: When Phase 5.1 adds `client_type`, consult `oauth-multi-provider-specialist` for the full implementation plan. `clientName` is already threaded through the OAuth flow to the auth code store as groundwork.


  return payload;
}
```

**Security Benefit**: Token minted for ChatGPT (azp=chatgpt_client_id) cannot be used by Gemini

**Usage**: Pass client_id when validating tokens from specific clients

### Phase 2: RS256/JWKS & MCP Hub Trust Levels (Jan 2026)

**JWT Migration to RS256**: Asymmetric signing enables external service token validation

**Key Changes**:
- **Algorithm**: HS256 → RS256 (RSA-2048)
- **JWKS Endpoint**: `GET /api/auth/jwks` - Public key for external validation
- **Token Claims**: Added `iss`, `aud`, `kid` (standards-compliant)
- **Validation Enhanced**: Both `verifyAccessToken()` functions now validate issuer/audience

**MCP Hub Trust Level System**: Authorization model for cross-service token passing
- **File**: `lib/services/workflow/security/trust-level.js`
- **6 Trust Levels**: INTERNAL, TRUSTED, OWNER, TEAM_MEMBER, SCOPED, ANONYMOUS
- **Token Gating**: Only first 4 levels receive JWT tokens
  - **TEAM_MEMBER** newly enabled in Phase 2 (service owner is POV team member)
- **Trust Determination**: `determineTrustLevel()` queries POV team membership
- **Context Building**: `buildServiceContext()` includes/excludes token based on trust
- **Audit Trail**: `logTrustDenial()` logs when tokens withheld (Activity table)
- **Developer Visibility**: `_context.trustLevel` helps debug "why no token?"

**Security Implications**:
- External services owned by POV team members now receive tokens (TEAM_MEMBER trust)
- Services can validate tokens via JWKS without shared secrets (public key crypto)
- All trust denials logged for security monitoring and forensics
- Trust levels prevent token leakage to untrusted services

**Related**:
- External dev guide: `.claude/knowledge/domain/mcp/mcp-hub-external-service-authentication.md`
- Security assessment: `cline_docs/reviews/sec-ops-phase-2-assessment-2026-01-21.md`

### Connection Pooling for OAuth User Lookups

**Performance Optimization**: Global Prisma client for OAuth flows

**Problem**: Previous pattern created new database connection for every token validation/refresh

**Solution**:
```javascript
// Top of mcp-server-http-clean.js
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

**Locations Updated** (grep patterns — line numbers shift; mcp-server-http-clean.js 4518→3031 LOC across 5 waves):
- RS256 token validation (MCP authentication middleware) — grep `verifyAccessToken` in `lib/auth/oauth/auth-manager.ts:createMiddleware`
- ~~Refresh token endpoint /oauth/refresh~~ — DROPPED Wave 6 Phase 0.6 / 2026-05-21
- OAuth token refresh grant (/oauth/token with grant_type=refresh_token) — extracted to `lib/mcp/server/routes/oauth-flow-routes.ts:registerR9Token` in Wave 6 Phase 6.4 (commit `5f97c9ed`); grep `grant_type === 'refresh_token'` there

**Performance Impact**: Reduces database connection churn, improves OAuth latency

### Server-to-Server Auth Context (Jan 2026)

**JWT Token Flow for MCP→API Calls**:
- Cookie name: `token` (accessed via `config.cookie.accessToken` which resolves to `'token'`)
- API Client: `lib/mcp/server/utils/api-client.js` uses per-request `userContext` (no global state)
- Pattern: Pass `{ userContext: { token, userId, role } }` in options to `apiClient.get/post/put/delete`

**Per-Request Auth Pattern** (P0-2 Fix):
```javascript
// ✅ CORRECT - Per-request context
await apiClient.get('/api/endpoint', {}, {
  userContext: { token, userId: user.id, role: user.role }
});

// ❌ DEPRECATED - Global state (logged as error)
apiClient.setUserContext(context);  // Don't use
```

**⚠️ SECURITY AUDIT PENDING**: X-User-Id/X-User-Role Headers
- Some endpoints may trust `X-User-Id` and `X-User-Role` headers without JWT validation
- **Risk**: Header spoofing if attacker can reach endpoint directly
- **Mitigation**: All endpoints MUST validate JWT token, not just headers
- **Discovery command**: `grep -r "X-User-Id\|X-User-Role" lib/ app/ --include="*.ts" --include="*.js"`
- **Status**: Audit pending (see todo list)

### RBAC Field Propagation (Oct 21, 2025 Bug Fix)

**Bug**: DEMO_USER could see POVs in web app but not in ChatGPT

**Root Cause**: RS256 JWT missing email and role claims

**Fix**: Added email and role parameters to `mintMcpToken()` and all call sites

```javascript
// Before (broken)
const mcpToken = this.mintMcpToken({
  userId: user.id,
  scope: requestedScope,
  azp: requestedClientId
});

// After (working)
const mcpToken = this.mintMcpToken({
  userId: user.id,
  email: user.email,  // RBAC FIX: Required by getAuthUser
  role: user.role,    // RBAC FIX: Required for DEMO_USER filtering
  scope: requestedScope,
  azp: requestedClientId
});
```

**Why This Matters**:
- getAuthUser expects email and role in JWT payload
- RBAC filtering (e.g., DEMO_USER) requires role in req.user
- Missing fields → undefined values → RBAC failures

**Lesson**: Use boundary contract debugging methodology for field propagation bugs (see boundary-contract-specialist)

## 🆕 Pino Structured Logging for Auth Debugging (Feb 2026)

**Status**: ✅ Full codebase uses pino structured logging (348+ files migrated, including all MCP server JS)

**Pattern Reference**: `/.claude/knowledge/patterns/pino-structured-logging-pattern.md` (Pattern #43, 96% confidence)

**Two Logging Systems for Auth** — Know when to use each:

| System | Logger | Output | When to Use |
|--------|--------|--------|-------------|
| **pino (structured)** | `authLogger` from `@/lib/logger` | PM2 JSON logs | Server-side auth errors, JWT validation, RBAC checks |
| **OAuth audit log** | `oauthLogger` from `oauth-logger.ts` | `/var/log/paichart/oauth-audit.log` | OAuth-specific events, token refresh, correlation IDs |

**Domain Loggers for Auth** (exported from `lib/logger.ts`):
```typescript
import { authLogger } from '@/lib/logger';  // Auth, OAuth, JWT, permissions
import { apiLogger } from '@/lib/logger';   // API routes, validation, responses
import { dbLogger } from '@/lib/logger';    // Database, Prisma, connections
```

**Correct pino API** — Object FIRST, message SECOND:
```typescript
// ✅ CORRECT pino patterns for auth
authLogger.info({ userId, role, authMethod }, 'User authenticated');
authLogger.warn({ userId, resource, action }, 'Permission denied');
authLogger.error({ err: error, endpoint, userId }, 'JWT validation failed');

// ❌ WRONG — message first (console.* habit)
authLogger.info('User authenticated', { userId });

// ❌ WRONG — wrong error key (pino needs 'err')
authLogger.error({ error: someError }, 'Failed');  // Must use { err: error }
```

**PM2 JSON Log Monitoring** (pino structured logs):
```bash
# Auth domain errors (level 50 = error)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":50' | jq"

# Auth domain warnings and above (level 40+)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | grep -E '\"level\":(40|50|60)' | jq"

# JWT validation events
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep -i 'jwt\|token\|verif' | jq"

# Permission/RBAC events
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep -i 'permission\|rbac\|role\|access' | jq"

# Pretty-print recent auth logs with jq
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 50 --nostream | grep '\"domain\":\"auth\"' | jq '{time, level, msg}'"
```

**When Debugging Auth Issues**: Use BOTH systems:
1. **pino logs** (`pm2 logs` + `grep '"domain":"auth"'`) — JWT errors, RBAC failures, middleware issues
2. **OAuth audit log** (`/var/log/paichart/oauth-audit.log`) — OAuth flow events, token refresh, provider validation
3. **Cross-reference** by timestamp and userId for complete auth picture

## Core Knowledge and Expertise

### Authentication Systems
- **JWT Token Management**: Token generation, validation, expiration, refresh flows
- **API Key Architecture**: User-specific keys, revocation, rotation strategies
- **Session Management**: Cookie-based auth, session persistence, security headers
- **Multi-factor Authentication**: Implementation patterns, security considerations

### Authorization & RBAC
- **Role Definitions**: USER, DEMO_USER, ADMIN, SUPER_ADMIN hierarchies and permissions
- **Access Control Patterns**: POV ownership, team membership, resource filtering
- **Permission Matrices**: Who can access what, when, and how
- **Dynamic Authorization**: Context-based access, geographical restrictions
- **Hub Tools Permissions**: MCP_SERVICE resource type with proper RolePermission integration (✅ Phase 3.4 complete)

### Security Implementation
- **Token Security**: Encryption, signing, secure storage, transmission
- **API Security**: Rate limiting, CORS, CSRF protection, XSS prevention
- **Audit Logging**: Access tracking, security events, compliance requirements
- **Vulnerability Prevention**: Common auth pitfalls, OWASP top 10

### NEW: Real-Time Security Architecture (Plans 7 & 8)
- **WebSocket Auth Events**: Real-time token invalidation across all sessions (<25ms latency)
- **Security Event Processing**: 5 threat detection patterns with automated response
- **Tool Security Boundaries**: PUBLIC_TOOLS vs AUTHENTICATED_TOOLS enforcement
- **Service Authorization**: services(action: "call") protection with checkServiceAccess validation
- **Public Discovery Filtering**: Sensitive data protection for unauthenticated users

### Plan 8 Foundational Security Details
- **Foundational Security Philosophy**: "Security enables, doesn't constrain" - features inherit security automatically
- **Tool Security Implementation**: `/lib/mcp/server/config/tool-security.js` with array-based configuration
  - 17 PUBLIC_TOOLS: Basic discovery, listing, and information tools
  - 7 AUTHENTICATED_TOOLS: Execution, creation, and service management tools

### OAuth 2.0 Implementation (Rationalized — Single Org App)
- **Discovery Endpoints**: Multiple paths including `/oauth/.well-known/oauth-authorization-server` (RFC 8414)
- **Single Org GitHub App**: MCP_CLI_GITHUB_CLIENT_ID (pAIchartMCP) for ALL MCP clients via proxy pattern
- **Session Auto-Creation**: OAuth-authenticated users automatically get SSE sessions
- **State Management**: OAUTH_STATE_SECRET with PKCE support (validated server-side between client and pAIchart)
- **Token Exchange**: Proxy pattern — pac_ auth codes exchanged for first-party RS256 JWTs

### Authentication Context Propagation
- **Prompt Filtering**: Must pass user context to `listPrompts({ user })` for authenticated prompts
- **Tool Filtering**: Authentication determines available tools (17 public vs 24 authenticated)
- **Resource Access**: User context required for personalized resource filtering
- **Session Persistence**: OAuth tokens enable persistent authenticated sessions
  - ADMIN_TOOLS: `template` (admin-only consolidated tool)
- **enforceToolSecurity() Middleware**: Three-tier approach with automatic enforcement
- **Public Discovery Filtering**: `/lib/mcp/server/tools/public-discovery-filter.js`
  - Hides: endpoints, configuration, ownerId, ownerEmail, apiKeys, timestamps
  - Shows: name, description, capabilities, status, version, category, popularity
- **Service Authorization**: Enhanced checkServiceAccess() in hub-tools-handler.js
  - Triple validation: ownership check, admin role check, public flag check
  - Automatic audit logging for all service calls
- **Rate Limiting Architecture**: 
  - Public users: 100 requests/min
  - Authenticated users: 1000 requests/min  
  - Service calls: 10 calls/min per user
- **Audit Event Types**: SERVICE_CALL, UNAUTHORIZED_SERVICE_ACCESS with full context

### **🔐 Microsoft MCP OAuth Implementation (PRODUCTION - 2025-10-14)**

**Status**: ✅ **FULLY DEPLOYED** - Microsoft OAuth for AI clients (Claude Desktop, ChatGPT, Gemini)

**Implementation**: Microsoft MCP OAuth Plan v3.2 - Complete multi-provider OAuth with operational resilience

#### Architecture: Hybrid MCP OAuth
- **System A (MCP OAuth)**: MCPOAuthTokenManager - AI clients (Claude, ChatGPT, Gemini)
  - GitHub: Stateless (long-lived tokens, no storage)
  - Microsoft: Stateful (60-90 min tokens, auto-refresh)
  - Google: Stateful (when implemented)
- **System B (Web App OAuth)**: EnterpriseOAuthService - Browser users
  - All providers: Stateful with background refresh

#### Key Implementation Files
- **Token Manager**: `/lib/auth/oauth/mcp-oauth-token-manager.ts` (294 lines)
  - Separate storage: `mcp_oauth_${userId}_${provider}` keys
  - Provider-specific methods: getToken(), storeToken(), removeToken()
  - Circuit breaker integration per provider
  - Health monitoring: getTokenStats(), getExpiringTokens()

- **Circuit Breaker**: `/lib/auth/oauth/circuit-breaker-utils.ts` (135 lines)
  - States: CLOSED → OPEN (5 failures) → HALF_OPEN (60s timeout)
  - Prevents cascading failures during provider outages
  - Per-provider instances with independent state management

- **Retry Logic**: `/lib/auth/oauth/retry-utils.ts` (142 lines)
  - Exponential backoff: 1s, 2s, 4s (max 30s)
  - Respects Retry-After header for rate limiting (429)
  - Retryable status codes: 429, 503, 504

- **MCP OAuth Handlers**: `mcp-server-http-clean.js` (grep — line numbers shift)
  - `handleMicrosoftAuthorize()` — live, ~144 LOC; redirects to Microsoft authorization endpoint
  - `exchangeMicrosoftCode()` — live, ~185 LOC; proxy helper for code exchange
  - ~~`handleMicrosoftTokenExchange()`~~ — **DELETED Wave 3b.0a (2026-05-12, commit `0f07ac90`)**: 276 LOC dead handler; zero production callers
  - ~~`refreshMicrosoftToken()`~~ — **DELETED Wave 3b.0a (2026-05-12)**: 144 LOC; zero production callers
  - ~~`mcpOAuthRefreshMiddleware()`~~ — **REMOVED Phase 3.0a (May 2026)**: had zero callers, never wired into Express chain
  - Provider selection mechanism (`?provider=microsoft`) at /oauth/authorize
  - Provider routing in /oauth/token endpoint
  - **Note**: line numbers in `mcp-server-http-clean.js` shift frequently (file 4518→3031 LOC across Waves 1-5); prefer grep over file:line refs per Protocol 9.

- **Health Monitoring**: `/app/api/auth/oauth/health/route.ts`
  - Separate webApp vs mcpOAuth token statistics
  - Provider breakdown (github, microsoft, google)
  - Circuit breaker status per provider
  - Expiring token tracking with 10-min threshold

#### Provider Selection Flow
```javascript
// Authorization
GET /oauth/authorize?provider=microsoft&redirect_uri=https://claude.ai/...
  ↓ Routes to handleMicrosoftAuthorize()
  ↓ Redirects to login.microsoftonline.com/common/oauth2/v2.0/authorize

// Token Exchange
POST /oauth/token
Body: { provider: "microsoft", code: "auth_code", ... }
  ↓ Routes to exchangeMicrosoftCode() proxy helper (live; ~185 LOC)
  // NOTE: legacy handleMicrosoftTokenExchange (276 LOC) deleted Wave 3b.0a 2026-05-12
  ↓ Fetches from login.microsoftonline.com/common/oauth2/v2.0/token
  ↓ Stores in MCPOAuthTokenManager
  ↓ Returns access_token to AI client
```

#### Security Features (Phase 0.9 - Production Critical)
1. **Circuit Breaker Pattern**:
   - Threshold: 5 failures in 5 minutes
   - Open duration: 60 seconds minimum
   - Half-open test: 2 successes to close
   - Prevents provider API suspension from rate limit violations

2. **Retry Logic with Backoff**:
   - Max attempts: 3
   - Initial delay: 1-2 seconds
   - Backoff multiplier: 2x
   - Respects Retry-After header (Microsoft rate limiting)

3. **Token Refresh Middleware**:
   - Triggers: <10 minutes until expiry
   - Non-blocking: Failures don't block requests
   - Provider-aware: Only for Microsoft/Google (not GitHub)
   - Logged: All attempts in oauth-audit.log

#### OAuth Registration Responses (Phase 3)
All registration endpoints now advertise Microsoft support:
```json
{
  "client_id": "...",
  "supported_providers": ["github", "microsoft"],
  "provider_selection": "Use ?provider=microsoft query parameter"
}
```

#### Monitoring Commands
```bash
# Check MCP OAuth tokens
curl -s https://paichart.app/api/auth/oauth/health | jq '.tokens.mcpOAuth'

# Circuit breaker status
curl -s https://paichart.app/api/auth/oauth/health | jq '.circuitBreakers.mcpOAuth'

# Microsoft-specific tokens
curl -s https://paichart.app/api/auth/oauth/health?provider=microsoft | jq
```

#### Implementation Phases Completed
- ✅ Phase 0.1: MCPOAuthTokenManager (architectural separation)
- ✅ Phase 0.2-0.3: Token exchange and refresh handlers
- ✅ Phase 0.4: Health monitoring enhancements
- ✅ Phase 0.7: Multi-client coordination docs
- ✅ Phase 0.9: Circuit breakers + retry logic (CRITICAL)
- ✅ Phase 1: Provider selection mechanism
- ✅ Phase 2: Microsoft OAuth authorization flow
- ✅ Phase 3: Registration endpoint updates

#### Critical Fixes Included
1. **Null Email Handling** (2025-10-14):
   - Fixes ChatGPT "connected but no tools" for GitHub private emails
   - Dynamic WHERE clause building in mcp-oauth-validator.js:188-207
   - Prevents PrismaClientValidationError on null email searches

2. **GitHub expires_in Missing** (2025-10-14):
   - Defaults to 1 year if expires_in not provided
   - Fixes "Invalid time value" error in web app OAuth
   - Applied to oauth-service.ts:207

#### Related Documentation
- **Master Plan**: `/cline_docs/microsoft-mcp-auth-plan.md` (v3.2)
- **Implementation Discovery**: `/cline_docs/microsoft-oauth-implementation-discovery.md`
- **Architecture**: `/.claude/knowledge/domain/oauth/oauth-architecture-clarification.md`
<!-- - **Handover Prompt**: oauth-implementation-handover-prompt.md - File never existed -->

### OAuth 2.0 Hybrid Implementation (PRODUCTION READY - Plan 9)
- **Dual Authentication Architecture**: OAuth 2.0 + JWT hybrid with backward compatibility
- **Enterprise Providers**: Microsoft Azure AD, Google Workspace, GitHub OAuth integration
- **PKCE Security**: Proof Key for Code Exchange - **FIXED** with EnterpriseOAuthService.pkceStorage Map
- **Token Formats**: `oauth2_` prefixed tokens vs standard JWT tokens with automatic detection
- **4-Tier Authentication Fallback**: OAuth → JWT → API Key → Session authentication
- **Enterprise Features**: Team sync, role mapping (Azure AD/Google roles → pAIchart roles), domain restrictions
- **State Management**: Cryptographic nonces with 15-minute expiration for CSRF protection
- **Directory Compliance**: 89% Anthropic Directory compliant with OAuth 2.0 requirement met

#### Production OAuth Status (VERIFIED WORKING)
- **GitHub OAuth**: ✅ FULLY OPERATIONAL - Client ID: <REDACTED-SECRET>
- **Microsoft OAuth**: ⏳ Pending configuration (buttons disabled)
- **Google OAuth**: ⏳ Pending configuration (buttons disabled)
- **Login Page**: OAuth buttons live at https://paichart.app/login
- **Critical Fixes Applied**:
  - PKCE verifier storage fixed (was returning random values)
  - OAuth redirect URLs use APP_BASE_URL (not request.url)
  - PM2 ecosystem.config.js includes OAuth environment variables
  - Class name references corrected (EnterpriseOAuthService)

#### **CRITICAL OAuth Deployment Knowledge (2025-09-20)**

### Multi-Client OAuth Architecture (PRODUCTION - 2025-09-27)
Successfully implemented OAuth for multiple AI clients with unique configurations:

#### ChatGPT OAuth Implementation ✅ FULLY WORKING
- **GitHub OAuth App**: Separate app with Client ID: Ov23lifjCoFj7gtlIW2E
- **PKCE Required**: Full support with code_challenge/code_verifier forwarding
- **Critical Fixes Applied**:
  1. Forward PKCE parameters in authorization (code_challenge, code_challenge_method)
  2. Include code_verifier in token exchange to GitHub
  3. Stateless mode detection for openai-mcp user agent
  4. Return 200 OK for DELETE requests (stateless session cleanup)
- **Environment Variables**: Uses MCP_CLI_GITHUB_CLIENT_ID (org app) for GitHub path, MICROSOFT_CLIENT_ID for Microsoft path
- **Known Issue**: Mobile app completes OAuth but doesn't send tokens in subsequent requests

#### Gemini CLI OAuth ✅ WORKING
- **GitHub OAuth App**: Single org app (pAIchartMCP) via proxy pattern
- **Redirect URI**: http://localhost:7777/oauth/callback (validated by isAllowedRedirectUri)
- **Detection**: Based on redirect_uri containing localhost:7777 (CLIENT_PROVIDER_MAP)
- **Environment Variables**: Uses MCP_CLI_GITHUB_CLIENT_ID (org app — rationalized Mar 2026)

#### Claude OAuth (Default) ✅ WORKING
- **GitHub OAuth App**: Default/fallback app
- **Session Modes**:
  - Persistent for Claude Code (claude-code user agent)
  - Stateless for Claude.ai browser (Claude-User user agent)
- **Environment Variables**: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (fallback)

#### Client Detection Implementation
```javascript
// In MCPCoreManager.detectClientMode() at lib/mcp/server/mcp-core.ts (Wave 7 Phase 7.2;
// was in server class at lines 602-628 pre-Wave-7)
if (userAgent.includes('openai-mcp') || userAgent.toLowerCase().includes('chatgpt')) {
  return 'stateless'; // ChatGPT
}
if (userAgent.includes('claude-code')) {
  return 'persistent'; // Claude Code
}
if (userAgent.includes('Claude-User')) {
  return 'stateless'; // Claude.ai browser
}
```

#### PKCE Implementation (Required for ChatGPT)
```javascript
// Authorization - lines 786-792
if (code_challenge) {
  githubAuthUrl.searchParams.set('code_challenge', code_challenge);
}
if (code_challenge_method) {
  githubAuthUrl.searchParams.set('code_challenge_method', code_challenge_method);
}

// Token Exchange - lines 865-868
if (code_verifier) {
  params.append('code_verifier', code_verifier);
}
```

#### OAuth Flow Status
- **Desktop/Windows ChatGPT**: ✅ Full OAuth with 26 authenticated tools
- **Mobile ChatGPT**: ⚠️ OAuth completes but app doesn't persist tokens (19 public tools)
- **Gemini CLI**: ✅ Full OAuth with localhost redirect
- **Claude All Platforms**: ✅ Full OAuth with appropriate session modes

#### **CRITICAL OAuth Deployment Knowledge (2025-09-20)**
- **GitHub Secret Naming Restrictions**: GitHub blocks secrets named `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as security feature
  - **Solution**: Use alternative names like `PAICHART_GITHUB_CLIENT_ID` and `PAICHART_GITHUB_CLIENT_SECRET`
  - **Environment Mapping**: Map alternative names to standard OAuth environment variables in deployment scripts
- **Build vs Runtime Environment Variables**: OAuth configuration requires both build-time and runtime access
  - **Build-time**: Next.js build process needs CLIENT_ID variables for static optimization
  - **Runtime**: Server needs CLIENT_SECRET variables for OAuth flow processing
  - **Solution**: Ensure OAuth variables available in both build environment and runtime environment

### **🔄 OAuth Token Refresh System (IMPLEMENTED - 2025-10-13)**

**Status**: ✅ **PRODUCTION READY** - Automatic token refresh with comprehensive security

**Implementation Overview**:
- **Architecture**: In-memory Map-based storage following PKCE pattern (`oauth-service.ts:389`)
- **Background Service**: Checks every 5 minutes, refreshes tokens 10 min before expiry
- **Security**: Log injection prevention + circuit breaker + Promise-based locking
- **Audit Logging**: Structured JSON logs to `/var/log/paichart/oauth-audit.log`
- **Zero Database Impact**: No migrations, no DB queries during refresh
- **Health Monitoring**: `/api/auth/oauth/health` endpoint for comprehensive diagnostics

**How It Works**:
1. **Token Storage** (oauth-service.ts:394-403):
   ```typescript
   private static tokenStorage = new Map<string, {
     userId: string;
     provider: 'microsoft' | 'google' | 'github';
     accessToken: string;         // OAuth access token
     refreshToken: string;         // OAuth refresh token
     expiresAt: Date;              // Access token expiry (1 hour)
     refreshExpiresAt: Date;       // Refresh token expiry (90d-6mo)
     lastRefreshed: Date;          // Last successful refresh
     refreshAttempts: number;      // Failure counter (max 3)
   }>();
   ```

2. **Token Lifecycle**:
   - **Access Tokens**: 1 hour lifespan (all providers)
   - **Refresh Tokens**:
     - GitHub: 6 months
     - Google: 6 months
     - Microsoft: 90 days
   - **Background Check**: Every 5 minutes
   - **Refresh Threshold**: 10 minutes before expiry
   - **Rate Limiting**: 1 refresh per second

3. **Security Features** (oauth-service.ts:474-610):
   - **SECURITY FIX #1** - Log Injection Prevention:
     - Uses `sanitize-html` library (prevents Unicode bypass)
     - All provider errors sanitized before logging
     - Pattern: `sanitizeInput(errorMessage, 1000)`

   - **SECURITY FIX #2** - Circuit Breaker Pattern:
     - Blocks provider after 5 failures in 5 minutes
     - States: CLOSED → OPEN → HALF_OPEN
     - Auto-recovery after 5-minute cooldown
     - Pattern: `checkCircuitBreaker(provider)`

   - **Race Condition Prevention**:
     - Promise-based locking per user
     - Concurrent refresh attempts return same promise
     - Debouncing: Skip if refreshed <60s ago
     - Pattern: `refreshLocks.set(lockKey, refreshPromise)`

4. **Refresh Flow** (oauth-service.ts:616-802):
   ```
   Background Service → Check expiresAt
   ↓
   Token expiring within 10 min? → Queue refresh
   ↓
   Check circuit breaker → CLOSED?
   ↓
   Check for existing lock → None?
   ↓
   Create refresh promise + lock
   ↓
   Call provider refresh API → Exchange refresh_token
   ↓
   Update tokenStorage with new tokens
   ↓
   Log to oauth-audit.log → Structured JSON
   ↓
   Clear lock → Success
   ```

**Discovery & Monitoring**:
- **Discovery Prompt**: `/.claude/knowledge/discoveries/oauth-token-refresh-discovery.md`
  - Use when: Investigating token refresh architecture
  - Maps: Complete OAuth flow, token lifecycle, server integration points
  - Provides: Security assessment, implementation risks, edge cases

- **Health Check Endpoint**: `GET /api/auth/oauth/health`
  ```json
  {
    "status": "healthy",
    "service": {
      "running": true,              // Background service active
      "lastRun": "2025-10-13...",   // Should be <5 min ago
      "tokensInMemory": 15          // Active OAuth sessions
    },
    "tokens": {
      "expiringWithin10Min": 2,     // Need refresh soon
      "expired": 0,                  // Should always be 0
      "failedRefreshes": 0           // Should always be 0
    },
    "circuitBreakers": [
      {
        "provider": "microsoft",
        "state": "CLOSED",            // OPEN = blocked
        "failures": 0                 // 5+ triggers circuit breaker
      }
    ],
    "warnings": []                    // Any warnings = investigate
  }
  ```

**Audit Logging** (oauth-logger.ts):
- **Format**: Structured JSON (one event per line)
- **Location**: `/var/log/paichart/oauth-audit.log` (or `/tmp/paichart` fallback)
- **Retention**: 30 days with automatic rotation
- **Event Types**:
  - `token_refreshed`: Successful refresh
  - `refresh_failed`: Failed refresh attempt
  - Includes: userId, provider, executionTimeMs, errorMessage, tokenRotated
- **Search Methods**:
  ```typescript
  oauthLogger.searchByUser(userId, limit)
  oauthLogger.searchByProvider(provider, limit)
  oauthLogger.getFailures(limit)
  oauthLogger.getStats(sinceDate)
  ```

**Monitoring Commands**:
```bash
# Health check
curl -s https://paichart.app/api/auth/oauth/health | jq

# OAuth audit log (custom file logger — OAuth-specific events)
ssh <PROD_USER>@<PROD_HOST> "tail -f /var/log/paichart/oauth-audit.log | jq"

# Count refreshes today (OAuth audit log)
ssh <PROD_USER>@<PROD_HOST> "grep '$(date +%Y-%m-%d)' /var/log/paichart/oauth-audit.log | grep 'token_refreshed' | wc -l"

# Find refresh failures (OAuth audit log)
ssh <PROD_USER>@<PROD_HOST> "grep 'refresh_failed' /var/log/paichart/oauth-audit.log | jq"

# Check circuit breakers
curl -s https://paichart.app/api/auth/oauth/health | jq '.circuitBreakers'

# pino structured logs — auth domain errors (PM2 JSON output)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":50' | jq"

# pino structured logs — all auth events
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | jq '{time, level, msg}'"

# Manual trigger (admin)
curl -X POST https://paichart.app/api/auth/oauth/health
```

**Alert Thresholds**:
- ⚠️ **Warning**: Service last run >10 minutes ago
- ⚠️ **Warning**: >20% tokens expiring within 10 minutes
- 🚨 **Critical**: Circuit breaker OPEN for any provider
- 🚨 **Critical**: Background service stopped (`service.running: false`)
- 🚨 **Critical**: Failure rate >10% in last 24 hours

**Deployment Notes**:
- **In-Memory Trade-off**: Tokens lost on server restart (users re-authenticate)
- **Zero Migrations**: No database schema changes required
- **PM2 Integration**: Service starts/stops with main server
- **Graceful Shutdown**: Token refresh service stops cleanly via SIGTERM
- **38% Faster**: No DB queries vs database-stored token approach

**Enhanced Management Endpoints (v2.3 - 2025-10-13)**:

**Query Parameter Filtering** (`/api/auth/oauth/health`):
- `?minimal=true` - Quick status check (status + token count only)
- `?provider=microsoft` - Filter by OAuth provider (microsoft, google, github)
- `?userId=user_123` - Check specific user's token status
- `?warnings-only=true` - Return only warnings
- `?detailed=true` - Include full token details (expiresAt, minutesUntilExpiry, refreshAttempts)

**Token Management Operations**:
```bash
# Get token status for specific user (shows provider, expiry, attempts)
GET /api/auth/oauth/token?userId={userId}

# Force refresh token (admin operation, auto-detects provider from storage)
POST /api/auth/oauth/token
Body: {"userId": "user_123", "provider": "microsoft"}  # provider optional

# Remove token from storage (forces user re-authentication)
DELETE /api/auth/oauth/token?userId={userId}

# Cleanup all expired tokens (manual maintenance)
POST /api/auth/oauth/cleanup
```

**Circuit Breaker Management**:
```bash
# Get all circuit breaker statuses
GET /api/auth/oauth/circuit-breaker

# Reset circuit breaker after provider issue fixed
POST /api/auth/oauth/circuit-breaker
Body: {"action": "reset", "provider": "microsoft"}

# Force circuit breaker to OPEN (testing failover behavior)
POST /api/auth/oauth/circuit-breaker
Body: {"action": "open", "provider": "microsoft"}
```

**Operational Use Cases**:
1. **User Reports Token Issues**: GET token status → check expiry/attempts → force refresh if needed
2. **Provider Outage Recovery**: GET circuit-breaker → wait for cooldown → reset breaker → verify recovery
3. **Memory Optimization**: POST cleanup → remove expired tokens → monitor token count
4. **Debugging Sessions**: GET health with detailed=true → inspect exact expiry times → diagnose refresh failures
5. **Testing Failover**: POST circuit-breaker action=open → verify service degrades gracefully → reset when ready

**Security Considerations**:
- ⚠️ **Admin-Only Operations**: Token management and circuit breaker endpoints require admin authentication (TODO: implement)
- ✅ **No Secrets Exposed**: All endpoints return sanitized data (no refresh tokens, no client secrets)
- ✅ **Audit Logging**: All management operations logged to oauth-audit.log
- ✅ **Rate Limited**: Admin endpoints subject to standard API rate limits

**Related Documentation**:
- **Monitoring Guide**: `/docs/oauth-token-refresh-monitoring.md` (v2.0 with enhanced endpoints documentation)
- **Deployment Guide**: `/docs/oauth-token-refresh-deployment.md` (deployment checklist)
<!-- - **Implementation Plan**: oauth-token-refresh-implementation-plan-v2.1-final.md - Session-specific, not migrated -->
- **Discovery Prompt**: `/.claude/knowledge/discoveries/oauth-token-refresh-discovery.md` (architecture mapping)

**Files Modified** (Phase 0-6 Complete + v2.3 Enhancements):
- ✅ `lib/auth/oauth/oauth-service.ts` - Enhanced with token storage + security fixes
- ✅ `lib/auth/oauth/oauth-logger.ts` - Structured audit logging (NEW)
- ✅ `lib/auth/oauth/token-refresh-service.ts` - Background refresh service (NEW)
- ✅ `lib/auth/oauth/token-refresh-middleware.ts` - Non-blocking middleware (NEW)
- ✅ `lib/server-init.ts` - Service startup/shutdown integration
- ✅ `app/api/auth/oauth/health/route.ts` - Health check endpoint with query parameters (ENHANCED v2.3)
- ✅ `app/api/auth/oauth/token/route.ts` - Token management operations (NEW v2.3)
- ✅ `app/api/auth/oauth/cleanup/route.ts` - Expired token cleanup (NEW v2.3)
- ✅ `app/api/auth/oauth/circuit-breaker/route.ts` - Circuit breaker management (NEW v2.3)
- ✅ `config/logrotate/paichart-oauth` - Log rotation config (NEW)
- ✅ `package.json` - Added sanitize-html dependency

**Provider-Specific Token Lifetimes**:
- **GitHub**: Access 1h, Refresh 6 months (estimated)
- **Google**: Access 1h, Refresh 6 months (estimated)
- **Microsoft**: Access 1h, Refresh 90 days (documented)
- **ENTERPRISE_ROLE_MAPPING Export Issues**: Next.js builds can fail on complex role mapping exports
  - **Root Cause**: Circular dependencies or complex object structures during build-time evaluation
  - **Fallback**: Implement role mapping directly in oauth-service.ts as backup to exported constants
  - **Pattern**: Use simple object literals instead of complex exported structures
- **OAuth Environment Variable Requirements**: Complete set for production deployment
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (or alternative names)
  - `OAUTH_STATE_SECRET`, `OAUTH_SESSION_TIMEOUT`, `OAUTH_PKCE_ENABLED`
  - `APP_BASE_URL` (critical for redirect URL construction)
  - **All must be available in both build and runtime environments**

#### **🔥 LEAN MCP OAUTH IMPLEMENTATION SUCCESS (2025-09-21)**
- **🎯 Lean Strategy Victory**: 250 lines of code vs 2000+ line complex alternatives
- **🔒 Stateless Security Model**: OAuth tokens validated per-request - MORE secure than session storage
- **🗄️ Zero Database Changes**: Reused existing User table with oauthProvider/oauthProviderId fields
- **🔧 Unified Validator Pattern**: `/lib/auth/oauth/mcp-oauth-validator.js` handles GitHub, Google, Microsoft
- **📄 Manifest Configuration**: `/mcp_manifest.json` declares OAuth for Claude Desktop integration
- **🛡️ Provider-Based Security**: OAuth providers handle replay protection, token expiry, user verification
- **👥 Role-Based Permission Flow**: OAuth users inherit existing RBAC permissions automatically
- **🌐 Browser vs Desktop Architecture**: Claude.ai uses stateless OAuth, Claude Desktop uses manifest
- **✅ 92% Expert Confidence**: Validated as superior approach by auth-permissions-specialist
- **⚡ Implementation Time**: 2 hours total vs estimated 2-4 weeks for complex session-based approach

### Multi-Server JWT Architecture
- **Token Extraction**: Authorization headers (`Bearer token`) across HTTP/WebSocket/MCP servers
- **User Context Passing**: Consistent authentication context between transport types
- **Enhanced Auth Middleware**: `/lib/auth/enhanced-auth-middleware.ts` - 4-tier fallback system
- **MCP JWT Integration**: User context forwarding via API client with Bearer token authentication
- **Session Management**: HTTP-only cookies with JWT or OAuth tokens for web interface

### Identity-Preserving Token Forwarding (Mar 2026)
- **Pattern**: `/.claude/knowledge/patterns/identity-preserving-token-forwarding-pattern.md`
- **Three-Tier Fallback**: Tier 1 (in-process router-bridge) → Tier 2 (HTTP with user JWT) → Tier 3 (fail closed, never admin fallback)
- **Token Chain**: `mcp-server-http-clean.js` → `context-enricher.js` → `api-client.js` → `createHandler` JWT verification
- **buildTokenPayload Guards**: Empty-string email rejection, role enum validation in `lib/mcp/server/utils/build-token-payload.js`
- **Admin Fallback Blocked**: Write endpoints reject admin auth fallback — user must have own token
- **isDemo Limitation**: `validatePOVAccess` grants DEMO_USER write access to demo POVs (by design, but consider `readOnly` param)

### NEW: HTTP Server Authentication Context Flow (August 2025)
- **Context Initialization**: `MCPCoreManager.initializeAuthContext()` at `lib/mcp/server/mcp-core.ts` (Wave 7 Phase 7.1; was in server class pre-Wave-7) establishes user from PAICHART_API_KEY env var on startup
- **Full Context Passing**: HTTP server passes complete context including `authenticated` flag to all tool handlers
- **Tool Handler Consistency**: All 14+ handlers accept `(args, context)` parameters for uniform authentication
- **Authentication Logic Fix**: Corrected inverted logic - `MCP_HTTP_AUTH_REQUIRED === 'true'` (not `!== 'false'`)
- **Unauthenticated Access**: When `MCP_HTTP_AUTH_REQUIRED=false`, allows read-only tool access without credentials
- **Context Structure**: `{ user: {...}, authenticated: true/false, authMethod: 'jwt'/'api_key' }`

### Plan 11B: Authentication-Based Tool Access (100% Success)
- **Tool List Filtering**: Dynamic tool availability based on authentication status (lines 637-657 in mcp-server-http-clean.js)
- **All Tools Authenticated (10 total)**: Phase 3 (Jan 31, 2026) moved all tools behind authentication
  - 6 consolidated: `project`, `perform`, `analytics`, `template`, `services`, `registry`
  - 4 standalone: `search`, `fetch`, `prompt_command`, `list_prompts`
- **Error Message Enhancement**: Multi-method authentication guidance (API Key, OAuth, JWT Bearer, Claude Desktop)
- **100% Test Success**: Comprehensive test suite with 9/9 tests passed validating all Plan 11B features

## Key Information

### POV Access Authorization Helpers (Complete Set)

The pAIchart platform has **three complementary POV authorization patterns**:

| Helper | File | Purpose | Used By |
|--------|------|---------|---------|
| `withPOVAccess` | `lib/auth/validate-pov-access.ts` | Middleware wrapper for `[povId]` routes | 23 routes |
| `buildPOVAccessFilter(user)` | `lib/pov/auth/pov-access-filter.ts` | Multi-POV WHERE clause for lists/dashboards | 9 endpoints |
| `getPOVForAccess(povId)` | `lib/tasks/helpers/pov-access.ts` | Direct POV lookup for `validatePOVAccess` | 6 call sites |
| `getTaskWithPOV(taskId)` | `lib/tasks/helpers/pov-access.ts` | POV lookup via task relation | 6 call sites |
| `canManageTeamMembers` | `lib/pov/auth/team-authorization.ts` | Team management authorization | 5 endpoints |
| `getValidatePOVAccess()` (NEW 2026-05-23) | `lib/mcp/server/tools/internal/InternalServiceRouter.js` | Lazy-loader that returns `validatePOVAccess` when direct mode active (TS reachable). Used by 4 direct-mode handlers (handleGetPOVDetails, handleGetPOVPhases, handleListTasks, handleGetTaskDetails) to gate cross-tenant DB reads when InternalServiceRouter runs in a Next.js context. Dormant in MCP-server context (HTTP fallback active). | 4 handlers |

**Audit grep** when reviewing changes to `lib/mcp/server/tools/internal/InternalServiceRouter.js`: every direct-mode handler that reads POV/task data MUST call `getValidatePOVAccess()` and gate the response. R1 (commit 792dbc01) added the gates as defense-in-depth — regressions would re-open the dormant bypass.

#### `buildPOVAccessFilter(user)` ⭐ NEW 2026-04-02

**File**: `lib/pov/auth/pov-access-filter.ts`
**Created**: 2026-04-02 (consolidated from 9 files with identical inline logic)
**Purpose**: Returns a Prisma WHERE clause scoping queries to POVs the user can access
**Confidence**: 95% (3 specialist reviews, production-validated)

**Logic**:
- ADMIN/SUPER_ADMIN → `{}` (no filter, see all)
- USER → `{ OR: [{ ownerId }, { team.members.some }] }`
- DEMO_USER → adds `{ metadata.isDemo: true }`

**Also exports**: `buildPOVAccessFilterWithRole(user)` → returns `{ filter, isAdmin }` for endpoints needing conditional sub-queries

**Discovery commands**:
```bash
# Find all usages
grep -rn "buildPOVAccessFilter" app/api/ --include="*.ts"

# Find potential DRY violations (inline filter that should use helper)
grep -rn "ownerId.*userId.*team.*members.*some" app/api/ --include="*.ts" | grep -v "buildPOVAccessFilter"
```

---

### Team Management Authorization Helper ⭐ NEW 2025-11-02

**File**: `/lib/pov/auth/team-authorization.ts`
**Created**: 2025-11-02 (Production-tested)
**Purpose**: Centralized team authorization for Owner, Admin, and PROJECT_MANAGER delegation
**Confidence**: 95% (4 specialist reviews, production-validated)

#### What It Does

Provides centralized authorization for ALL team management operations:
- Add team members
- Remove team members
- Update team member roles
- Bulk add team members
- View available users (for team selection)

**Authorization Hierarchy**:
1. **POV Owner** → Full control over all team operations
2. **Site Admins** (ADMIN, SUPER_ADMIN) → Full control (admin override)
3. **PROJECT_MANAGER** → Can manage team with 3 restrictions

**PROJECT_MANAGER Restrictions** (Built-in):
1. ❌ Cannot remove other PROJECT_MANAGERs (owner-only)
2. ❌ Cannot promote members to PROJECT_MANAGER (owner-only)
3. ❌ Cannot change own role (prevents accidental self-demotion)

#### Usage Pattern

```typescript
import { canManageTeamMembers } from '@/lib/pov/auth/team-authorization';

// In your API endpoint handler
const authCheck = canManageTeamMembers(user, pov, {
  operation: 'add',           // 'add' | 'remove' | 'updateRole' | 'bulkAdd'
  targetMemberId?: string,    // For remove/updateRole (checks restrictions)
  targetRole?: TeamRole       // For updateRole (checks PM promotion restriction)
});

if (!authCheck.allowed) {
  return NextResponse.json(
    { error: authCheck.reason },  // Clear, specific error message
    { status: 403 }
  );
}

// Authorization passed, proceed with operation
// Optional: Use authCheck.authorizedAs for audit logging
```

#### When to Use This Helper

**✅ ALWAYS Use For**:
- Team member CRUD operations (add, remove, update)
- Bulk team operations
- Available users listing (if managing team, need to see who to add)
- Any UI that shows team management controls
- Team-related permission checks

**❌ DON'T Use For**:
- Task assignment (different permission model)
- Phase/Stage management (different permission model)
- POV metadata updates (use validatePOVAccess)
- Non-team resources (CRM, KPI, etc.)

#### Replaces These Anti-Patterns

```typescript
// ❌ ANTI-PATTERN 1: Inline owner/admin checks (DRY violation)
const isOwner = pov.ownerId === user.userId;
const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
if (!isOwner && !isAdmin) {
  return 403;
}

// ❌ ANTI-PATTERN 2: checkPermission for team operations (too broad)
const hasPermission = await checkPermission(user, pov, ResourceAction.EDIT);
if (!hasPermission) {
  return 403;  // Blocks DEMO_USER even if PROJECT_MANAGER!
}

// ✅ CORRECT PATTERN: Use helper
const authCheck = canManageTeamMembers(user, pov, { operation: 'add' });
if (!authCheck.allowed) {
  return NextResponse.json({ error: authCheck.reason }, { status: 403 });
}
```

#### Current Coverage (5 Endpoints)

All team management endpoints use this helper:

1. **POST** `/api/pov/[povId]/team/members` - Add member
2. **DELETE** `/api/pov/[povId]/team/members/[memberId]` - Remove member
3. **PUT** `/api/pov/[povId]/team/members/[memberId]` - Update role
4. **POST** `/api/pov/[povId]/team/members/batch` - Bulk add
5. **GET** `/api/pov/[povId]/team/available` - Available users (needs team mgmt permission)

#### POV Query Requirements

**Helper needs `pov.team.members`** for PROJECT_MANAGER check:

```typescript
// ✅ CORRECT: Include team members
const pov = await prisma.pOV.findUnique({
  where: { id: povId },
  include: {
    team: {
      include: {
        members: true  // Needed for PROJECT_MANAGER check
      }
    }
  }
});

// ❌ WRONG: Missing team members
const pov = await prisma.pOV.findUnique({
  where: { id: povId },
  select: { id: true, ownerId: true, teamId: true }  // Missing team.members!
});
```

**Pattern**: Always include `team: { include: { members: true } }` when using helper

#### Security Decisions (auth-permissions-specialist Review)

**From Nov 2, 2025 specialist review** (91% confidence):

1. **Error Messages**: Use specific, not generic (92% confidence)
   - ✅ "Only POV owner, site admin, or Project Manager can..."
   - ❌ NOT "Permission denied"

2. **PROJECT_MANAGER Scope**: Cannot manage other PROJECT_MANAGERs (88% confidence)
   - Prevents PM conflicts
   - Maintains role hierarchy

3. **PROJECT_MANAGER Promotion**: Owner-only (90% confidence)
   - Owner controls who manages team
   - Prevents unauthorized delegation

4. **Self-Modification**: Cannot change own role (95% confidence)
   - Security best practice
   - Prevents accidental self-demotion

#### Production Validation

**Evidence**: Nov 2, 2025 implementation
- ✅ Tested with DEMO_USER + PROJECT_MANAGER role
- ✅ All 5 endpoints working correctly
- ✅ All 3 restrictions enforced
- ✅ Error toasts showing properly
- ✅ No security issues found

**Specialist Reviews**:
- auth-permissions: 91%
- architectural-review: 92%
- boundary-contract: 92%
- types-system: 95%
- **Average**: 92.5% ✅✅

---

### Critical Files
- `/lib/auth/auth.ts` - Core authentication logic
- `/lib/auth/permissions.ts` - RolePermission system with SUPER_ADMIN bypass, permission caching
- `/lib/auth/validate-pov-access.ts` - **DRY shared utility** for POV access validation (2025-10-10)
- `/lib/auth/get-auth-user.ts` - Extract authenticated user from requests
- `/lib/auth/middleware.ts` - Auth middleware implementations
- `/lib/auth/rbac.ts` - Role-based access control
- `/app/api/auth/login/route.ts` - Login endpoint
- `/mcp-server-v5.js` - MCP auth implementation (lines 412-456)
- `/lib/types/auth.ts` - UserRole enum (USER, DEMO_USER, ADMIN, SUPER_ADMIN), ResourceType, ResourceAction
- `/scripts/setup-permissions.ts` - Permission seed script (319 permissions across all roles)

### NEW: Plan 11B Authentication-Based Tool Access Files
- `/mcp-server-http-clean.js` - Lines 637-657: Tool list filtering based on authentication status
- `/scripts/test-auth-tool-access.js` - Comprehensive test suite validating Plan 11B implementation (100% success)
- `/lib/mcp/server/utils/auth-messages.js` - Multi-method authentication error messages
- `/lib/mcp/server/tools/hub-tools-handler.js` - Hub tool facade with handler delegation

### NEW: HTTP Server Authentication Files (August 2025)
- `/mcp-server-http-clean.js`:
  - Line 34: Authentication requirement logic (`this.authRequired = process.env.MCP_HTTP_AUTH_REQUIRED === 'true'`)
  - Lines 209-284: `createAuthMiddleware()` - Handles both required and optional authentication
  - `MCPCoreManager.processRequest()` at `lib/mcp/server/mcp-core.ts` (Wave 7 Phase 7.2 extraction; was lines 561-576 in pre-Wave-7 mcp-server-http-clean.js) - Sets full authentication context via `mcpServer.setUserContext({ user: { id, email, role, token, azp }, authenticated, authMethod })`. Token + azp threading preserved verbatim across the move.
  - Lines 646-662: Tool execution with full context passing
  - `MCPCoreManager.initializeAuthContext()` at `lib/mcp/server/mcp-core.ts` (Wave 7 Phase 7.1 extraction; was lines 758-804 in pre-Wave-7 mcp-server-http-clean.js) - Initializes auth from PAICHART_API_KEY env var on startup
- `/package.json` - Line 16: Removed hardcoded auth environment variables from npm scripts

### NEW: Plan 7 & 8 Security Enhancements
- ~~`/lib/websocket/auth-event-broadcaster.ts`~~ + ~~`/lib/events/security-event-processor.ts`~~ — Plan-7 threat-detection infra, DELETED (315db03e / c5dab442) as dormant dead code; live threat controls = login-route rate-limit/anomaly + audit + fail2ban
- `/lib/mcp/server/config/tool-security.js` - Public/private tool boundaries (Plan 8)
- `/lib/mcp/server/tools/public-discovery-filter.js` - Data filtering for public access (Plan 8)
- `/lib/mcp/server/tools/hub-tools-handler.js` - Service authorization with audit logging (Plan 8)

### NEW: OAuth 2.0 Hybrid Implementation (Plan 9)
- `/lib/auth/oauth/oauth-config.ts` - Enterprise OAuth provider configurations (Microsoft, Google, GitHub)
- `/lib/auth/oauth/oauth-service.ts` - Complete OAuth flow handling with PKCE security
- `/lib/auth/enhanced-auth-middleware.ts` - Dual authentication middleware (OAuth + JWT)
- `/app/api/auth/oauth/[provider]/route.ts` - OAuth authorization endpoints
- `/app/api/auth/oauth/callback/[provider]/route.ts` - OAuth callback handling with enterprise features

### NEW: Lean MCP OAuth Implementation (2025-09-21)
- `/lib/auth/oauth/mcp-oauth-validator.js` - **UNIFIED OAUTH VALIDATOR** - 250 lines handling GitHub, Google, Microsoft
- `/mcp_manifest.json` - **MCP OAUTH MANIFEST** - OAuth provider configuration for Claude Desktop
- **Database Reuse**: Existing User table with oauthProvider/oauthProviderId fields (no schema changes)
- **Stateless Architecture**: OAuth tokens validated per-request, no session storage complexity
- **Provider Security**: GitHub/Google/Microsoft APIs handle token security, replay protection, expiry

### Multi-Server Authentication Files
- `/lib/mcp/server/utils/api-client.js` - MCP server JWT token forwarding with Bearer authentication
- `/mcp-server-v5.js` - User context setting and authentication coordination
- `/lib/types/auth.ts` - OAuth user info, tokens, and auth context type definitions
- `/prisma/migrations/20250825231538_add_oauth_fields/migration.sql` - OAuth database schema

### Enhanced Authentication Flow Hierarchy (Plan 9)
1. **OAuth 2.0 Bearer Tokens** (Enterprise) - `Bearer oauth2_` format with enterprise providers
2. **JWT Bearer Tokens** (Existing) - `Bearer jwt_token` format for backward compatibility
3. **API Key Authentication** (MCP) - X-API-Key header with JWT tokens
4. **Session Cookies** (Web) - HTTP-only cookies with JWT or OAuth tokens

### Database Schema Enhancements (OAuth Fields)
- **oauth_provider**: Provider name (microsoft, google, github)
- **oauth_provider_id**: External provider user ID
- **avatar_url**: User profile picture from OAuth provider
- **organization_domain**: Enterprise domain for team sync
- **last_login_at**: OAuth login tracking
- **Indexes**: Optimized for OAuth lookups and enterprise filtering

### Common Tasks You Handle
1. **Authentication Implementation**
   - JWT token generation and validation
   - API key management and rotation
   - Real-time token invalidation via WebSocket events
   - Success criteria: Secure tokens, proper expiration, no exposed secrets, <25ms invalidation

2. **Permission Management**
   - RBAC implementation and updates
   - Access control list modifications
   - Tool security boundary enforcement (public vs authenticated)
   - Service-level authorization checks
   - Success criteria: Correct role hierarchies, no privilege escalation, proper tool boundaries

3. **Security Auditing**
   - Authentication flow review
   - Permission matrix validation
   - Threat detection and response (5 patterns)
   - Service call audit logging
   - Success criteria: OWASP compliance, no vulnerabilities, complete audit logs, threat detection active

### When to Use This Specialist
- Authentication implementation or debugging needed
- API key management and rotation required
- JWT token issues or improvements
- RBAC changes or permission matrix updates
- Security vulnerability assessment
- Session management problems
- MCP authentication failures
- Login/logout flow modifications
- Security compliance audits

### NEW: OAuth 2.0 Specialist Scenarios
- OAuth provider configuration and testing
- Enterprise authentication integration (Microsoft, Google, GitHub)
- Multi-server JWT token passing and context coordination
- PKCE security implementation and validation
- OAuth callback handling and error management
- Enterprise role mapping and organization domain filtering
- Token format migration and backward compatibility
- Directory compliance and security audit requirements

## Learning Notes

- API keys are the primary auth method for MCP server
- Session cookies provide seamless browser experience
- JWT tokens enable stateless API authentication
- Role hierarchy: SUPER_ADMIN > ADMIN > USER
- Geographical filtering applied at query level, not auth level
- MCP server uses priority-based auth checking (API key first)

### NEW: Plan 7 & 8 Patterns
- **Real-time invalidation**: WebSocket broadcasts auth events in <25ms for instant token revocation
- **Threat detection**: 5 patterns active - brute_force, credential_stuffing, token_theft, privilege_escalation, suspicious_location
- **Tool security**: Arrays define PUBLIC_TOOLS (no auth) vs AUTHENTICATED_TOOLS (auth required)
- **Service access**: checkServiceAccess() validates ownership, public flag, or admin role
- **Audit everything**: SERVICE_CALL and UNAUTHORIZED_SERVICE_ACCESS events logged
- **Public filtering**: filterPublicServiceData() hides endpoints, owner info from public users
- **Plan 8 Achievement**: Security is now embedded in platform DNA - features inherit protection automatically
- **Tool boundaries flexible**: Easy to move tools between PUBLIC/AUTHENTICATED arrays without code changes
- **Discovery filtering adapts**: Automatically adjusts to data structure without breaking functionality
- **Service calls secured**: Triple validation (ownership+admin role+public flag) with full audit trail
- **Rate limiting tiered**: Different limits for public/authenticated/service calls without complex infrastructure
- **Foundational approach**: 24-48 hours implementation vs 3-4 weeks of prescriptive architecture
- **OAuth 2.0 Hybrid**: Enterprise-grade OAuth with Microsoft/Google/GitHub, dual authentication (OAuth + JWT)

### Production Deployment Auth (NEW - 2025-09-05)
- **Production Droplet**: Digital Ocean server at <PROD_HOST> (paichart.app) - THE production environment
- **Production Environment**: JWT and session secrets configured for production security
- **MCP Authentication**: JWT-based authentication working on production at paichart.app
- **Infrastructure SSH**: Key-based authentication (ed25519) for server access at <PROD_USER>@<PROD_HOST>
- **Database User**: Production uses `paichart` user with proper permissions, not superuser
- **Session Security**: Production session configuration hardened for public internet
- **API Key Management**: Production API keys working through environment variables
- **Authentication Flow**: Single backend prevents auth session conflicts vs multi-server architecture
- **Environment Separation**: Auth secrets properly separated between dev/staging/production
- **Critical Architecture**: mcp-server-http-clean.js prevents auth session inconsistencies
- **Security Headers**: nginx proxy adds security headers including auth-related CORS/CSP
- **Token Validation**: Production JWT validation working with paichart.app domain constraints
- **Directory Compliance**: 89% Anthropic Directory compliant, PKCE security with recognized CA certificates
- **Enterprise Features**: Team sync, role mapping, domain restrictions for corporate customers
- **Backward Compatible**: Zero breaking changes, existing JWT users unaffected by OAuth addition

### 🚨 CRITICAL: AsyncLocalStorage + Custom Server Incompatibility (Jan 2026)

**Status**: ✅ **FIXED** - All auth routes updated to avoid AsyncLocalStorage errors

**Root Cause**: Next.js 14's `cookies()` function from `next/headers` requires AsyncLocalStorage, which isn't available when:
1. Running with a custom server (`server.ts` with ts-node)
2. PM2's `require-in-the-middle` instrumentation interferes with module loading
3. Static imports evaluate at MODULE LOAD time (not function call time)

**Error Signature**:
```
Error: Invariant: `cookies` expects to have requestAsyncStorage, none available.
Error: Invariant: AsyncLocalStorage accessed in runtime where it is not available
```

**Files Fixed** (Jan 2026):
1. **`app/api/auth/login/route.ts`** - Removed unused `cookies` import
2. **`app/api/auth/logout/route.ts`** - Removed unused `cookies` import
3. **`app/api/auth/me/route.ts`** - Changed from `cookies()` to `req.cookies`
4. **`lib/auth/verify.ts`** - Changed from `cookies()` to `req.cookies`
5. **`lib/auth/get-auth-user.ts`** - Dynamic import for `getAuthUserFromServer()`
6. **`app/providers.tsx`** - Pass empty array instead of `cookies().getAll()`

**Safe Patterns**:
```typescript
// ✅ SAFE: Use req.cookies in API routes
const token = req.cookies.get('accessToken')?.value;

// ✅ SAFE: Use response.cookies.set() (doesn't need AsyncLocalStorage)
response.cookies.set('accessToken', token, { httpOnly: true });

// ✅ SAFE: Dynamic import defers loading
const { cookies } = await import('next/headers');

// ❌ UNSAFE: Static import triggers at module load
import { cookies } from 'next/headers';
```

**Why This Matters**:
- Custom server (`server.ts`) is required for MCP HTTP integration
- PM2 is used for production process management
- Next.js SSR pages that import `cookies()` will fail silently
- Errors cascade: auth breaks → 500 responses → "body used already" in MCP

**Detection**: If login starts failing with empty 500 responses, check for:
1. AsyncLocalStorage errors in server logs
2. Recently added `import { cookies } from 'next/headers'` anywhere
3. Module load-time calls to Next.js server functions

**Related Fixes**:
- `mcp-server-http-clean.js` - User token forwarding (prevents admin fallback)
- `lib/mcp/server/utils/api-client.js` - Body handling (read as text first)

### New OAuth 2.0 Implementation Patterns (Plan 9)
- **Enhanced Auth Middleware**: 4-tier fallback system checks OAuth first, then JWT, API key, session
- **PKCE Security**: Code challenge/verifier with SHA256 hashing for OAuth security
- **State Parameter**: Cryptographic nonces prevent CSRF attacks with 15-minute expiration
- **Enterprise Role Mapping**: Azure AD/Google Workspace roles → pAIchart role hierarchy
- **Token Format Detection**: `oauth2_` prefix distinguishes OAuth tokens from JWT tokens
- **Multi-Provider Support**: Microsoft Graph API, Google OAuth2, GitHub OAuth apps
- **Database Integration**: OAuth fields indexed for performance, organization domain filtering
- **Cookie Integration**: OAuth tokens stored in HTTP-only cookies for web sessions

### OAuth Credentials Reference (2025-10-02)

**GitHub OAuth Apps (rationalized Mar 2026 — 2 apps):**
- Web App: `Ov23ligMA2fCPQarlM6h` (GITHUB_CLIENT_ID) → web login only
- MCP (all clients): `Iv23lizLBJNisgLT7shD` (MCP_CLI_GITHUB_CLIENT_ID) → org GitHub App, proxy pattern, callback: paichart.app/oauth/callback

**Microsoft OAuth (WEB APP + MCP):**
- Application ID: `f2e44a69-2bba-44e5-8beb-7940b4125c02` (MICROSOFT_CLIENT_ID) - **CURRENT**
- ~~Old App ID: `bff19a19-8b1e-4310-bf71-ecd1ba7f178e`~~ - **DEPRECATED**
- ✅ **MCP OAuth Enabled**: Supports Claude Desktop, ChatGPT, Gemini (2025-10-14)
- **Redirect URIs**:
  - `https://paichart.app/api/auth/oauth/callback/microsoft` (Web App)
  - `https://claude.ai/api/mcp/auth_callback` (Claude Desktop MCP)
  - `https://chatgpt.com/connector_platform_oauth_redirect` (ChatGPT MCP)
  - `http://localhost:7777/oauth/callback` (Gemini CLI - dev/testing)
- **Architecture**: Hybrid - Web App uses EnterpriseOAuthService, MCP uses MCPOAuthTokenManager
- **Token Refresh**: Auto-refresh at 10 min before 60-90 min expiry (MCP only)
- **Circuit Breaker**: 5 failures → OPEN, 60s cooldown → HALF_OPEN (Phase 0.9)

**MCP API Key:**
- PAICHART_API_KEY: JWT token for system@paichart.com user
- ⚠️ **EXPIRES:** End of March 2026 - requires regeneration

### CRITICAL: OAuth Routing Discovery (2025-10-01) ⚠️

**ChatGPT/Gemini OAuth Does NOT Use Standalone `/oauth/*` Routes!**

**Key Finding:**
- ❌ **WRONG**: Adding `/oauth/authorize` and `/oauth/token` nginx routes (breaks OAuth)
- ✅ **CORRECT**: All OAuth traffic routes through `/mcp` prefix

**Working OAuth Flow:**
```
ChatGPT/Gemini → https://paichart.app/mcp
                ↓
nginx: location /mcp { proxy_pass http://127.0.0.1:8080 }
                ↓
MCP Server handles ALL OAuth internally:
  - /mcp/oauth/authorize → MCP server OAuth handler
  - /mcp/oauth/token → MCP server OAuth handler
  - /mcp/oauth/register → MCP server OAuth handler
```

**Evidence (2025-10-01 logs):**
- ChatGPT successfully authenticated WITHOUT `/oauth/authorize` route
- Token exchange succeeded: `[OAuth Token] Successfully exchanged code for token`
- Tools accessible: `User authenticated: true Total tools: 28 Filtered tools: 26`

**nginx Configuration (CORRECT):**
```nginx
location /mcp {
    proxy_pass http://127.0.0.1:8080;  # All MCP traffic including OAuth
}

# DO NOT ADD:
# location /oauth/authorize { }  ❌ Interferes with /mcp routing
# location /oauth/token { }      ❌ Interferes with /mcp routing
```

**Web App OAuth (Separate System):**
- `/auth/oauth/[provider]` → port 3000 (web server)
- `/api/auth/oauth` → port 3000 (web server)
- These are for web UI login, NOT MCP clients

**Lesson Learned:** MCP OAuth is self-contained within `/mcp` endpoint. Adding root-level OAuth routes creates conflicts.

---

### Plan 11B Authentication-Based Tool Access Patterns
- **Dynamic Tool Filtering**: Authentication status determines tool availability at runtime (not static configuration)
- **Read-Only Explorer Pattern**: 17 tools available without credentials for discovery and evaluation
- **Phase 3 Full Authentication**: All 26 tools require authentication (PUBLIC_TOOLS empty)
- **Authentication-Aware Responses**: `registry(action: 'list')` provides identity-aware service listing with Gold Standard A grade
- **Tiered Tool Categories**: Clear separation between discovery/analytics (public) vs operations/management (auth-required)
- **Comprehensive Error Messages**: Failed auth attempts provide guidance for 4 authentication methods
- **Test-Driven Validation**: 100% test coverage with 9 test scenarios covering all Plan 11B functionality
- **Business Decision Flexibility**: Easy movement of tools between categories based on business needs

### DEMO_USER Role & Hub Tools Permissions (Phase 3 ✅ COMPLETED - 2025-10-09)

**✅ Implemented**: Full DEMO_USER role integration with inline enforcement pattern across MCP and API layers

#### DEMO_USER Role Implementation
- **Database Enum**: Added to `UserRole` enum in Prisma schema via `ALTER TYPE` (local + production ready)
- **TypeScript Types**: Added to `lib/types/auth.ts` enum and `AVAILABLE_ROLES` array
- **Permission System**: 10 DEMO_USER permissions seeded (POV, Task, MCP_SERVICE resources)
- **Prisma Client**: Regenerated with `npx prisma generate` to include new role

#### Inline Enforcement Pattern (Phase 3 Implementation)

**Architecture Decision**: Inline enforcement instead of centralized middleware classes

**Implementation Locations**:

1. **MCP Tool-Level Security** (Phase 1.1 ✅ COMPLETE)
   - **File**: `/lib/mcp/server/config/tool-security.js` (enforceToolSecurity function)
   - **Called**: `/mcp-server-http-clean.js` lines 1792-1802 (before every tool execution)
   - **Pattern**: Function-based enforcement checking PUBLIC_TOOLS vs AUTHENTICATED_TOOLS vs ADMIN_TOOLS

2. **API Resource Filtering** (Phase 3.3 ✅ COMPLETE - 10/13 endpoints)
   - **Pattern**: Inline DEMO_USER checks in each API endpoint
   - **Example**: POV listing (/api/pov/route.ts lines 175-181)
   ```typescript
   if (user.role === 'DEMO_USER') {
     query.metadata = {
       path: ['isDemo'],
       equals: true
     };
   }
   ```
   - **Example**: Individual POV GET (/lib/pov/handlers/get.ts lines 32-44)
   ```typescript
   if (user.role === UserRole.DEMO_USER) {
     const isDemo = pov.metadata?.isDemo === true;
     if (!isDemo) {
       throw new ApiError("FORBIDDEN", "Access denied - demo users can only access demo POVs");
     }
   }
   ```

**Endpoints Secured** (10/13):
- ✅ POV listing, individual GET, phase templates
- ✅ Tasks listing, phases, stages
- ✅ Progress metrics, global activities

**Why Inline Instead of Middleware**:
- ✅ Faster implementation (deployed and working)
- ✅ Explicit security checks visible in each endpoint
- ✅ Same functional outcome as centralized approach
- ⚠️ Trade-off: Less centralization but more transparency

#### Permission Matrix (Verified in Database)

| Hub Tool Operation | DEMO_USER | USER | ADMIN | SUPER_ADMIN |
|-------------------|-----------|------|-------|-------------|
| services(action: 'discover') | ✅ VIEW | ✅ VIEW | ✅ VIEW | ✅ VIEW |
| services(action: 'health') | ✅ VIEW | ✅ VIEW | ✅ VIEW | ✅ VIEW |
| registry(action: 'list') | ✅ VIEW | ✅ VIEW | ✅ VIEW | ✅ VIEW |
| registry(action: 'register') | ❌ | ✅ CREATE | ✅ CREATE | ✅ CREATE |
| registry(action: 'update') | ❌ | ❌ (owner only) | ✅ EDIT | ✅ EDIT |
| registry(action: 'delete') | ❌ | ❌ | ❌ | ✅ DELETE |

**Database Verification** (role_permissions table):
```sql
DEMO_USER | mcp-service | view   | enabled: true  ✅
DEMO_USER | mcp-service | create | enabled: false ❌
DEMO_USER | mcp-service | edit   | enabled: false ❌
DEMO_USER | mcp-service | delete | enabled: false ❌
```

#### Files Modified (Phase 3 Complete)
- ✅ `lib/types/auth.ts` - Added DEMO_USER to UserRole enum
- ✅ `prisma/schema.prisma` - Added DEMO_USER to UserRole enum
- ✅ `scripts/setup-permissions.ts` - Added DEMO_USER permissions (10 new)
- ✅ `lib/mcp/server/config/tool-security.js` - enforceToolSecurity() function (Phase 1.1)
- ✅ `mcp-server-http-clean.js` - Tool security enforcement (lines 1792-1802)
- ✅ `app/api/pov/route.ts` - DEMO_USER POV filtering (lines 175-181)
- ✅ `lib/pov/handlers/get.ts` - DEMO_USER individual POV validation (lines 32-44)
- ✅ `app/api/pov/[povId]/phase-templates/route.ts` - Phase template access control
- ✅ 7 more API endpoints with inline DEMO_USER checks
- ✅ Database: Applied `ALTER TYPE "UserRole" ADD VALUE 'DEMO_USER'` (production)

#### Seed Data Statistics
- **Total Permissions**: 319 permissions seeded (includes DEMO_USER)
- **DEMO_USER Permissions**: 10 permissions (POV: 2, Task: 4, MCP_SERVICE: 4)
- **Seed Script**: `scripts/setup-permissions.ts` runs via `npx ts-node`

#### Production Deployment Status
- ✅ **DEMO_USER enum**: Added to production database via ALTER TYPE
- ✅ **Demo Infrastructure**: 2 demo POVs created (168 tasks across 36 phases)
- ✅ **OAuth JWT Fix**: Deployed (commit a94b333)
- ✅ **Tool Security**: Deployed (commit 6c01320)
- ✅ **POV Filtering**: Deployed (commit 0dabe52)
- ✅ **Verification**: jacob.wilcox sees exactly 2 demo POVs (tested 2025-10-09)

#### Handler Auth Plan vs Implementation

**Reference**: `/cline_docs/handler-auth-plan.md` - Proposed centralized middleware architecture

**Plan Proposed**:
- AuthenticationMiddleware class with enforceToolSecurity()
- PermissionMiddleware class with checkResourceAccess()
- Custom error classes (AuthenticationError, AuthorizationError)
- Context enrichment pattern
- Centralized security enforcement

**Our Implementation** (Functional Equivalent):
- ✅ enforceToolSecurity() **FUNCTION** (not class) in tool-security.js
- ✅ Inline DEMO_USER checks in 10/13 API endpoints (not PermissionMiddleware class)
- ✅ Standard MCP error codes (-32001) instead of custom error classes
- ✅ Direct context passing `{ user, authenticated }` instead of enrichment
- ✅ Same security outcomes, different architecture

**Issues from handler-auth-plan.md RESOLVED**:
1. ✅ "No Universal Middleware" → enforceToolSecurity() EXISTS and is ENFORCED
2. ✅ "Missing Security Enforcement" → PUBLIC/AUTHENTICATED/ADMIN arrays enforced
3. ✅ "Manual Checking" → Centralized at MCP layer, inline at API layer
4. ✅ "Inconsistent Error Messages" → MCP errors standardized (-32001)
5. ✅ "No Centralized Permission Logic" → Tool-level centralized, resource-level inline

**Trade-offs**:
- ✅ **Faster deployment**: Inline checks deployed immediately
- ✅ **Explicit security**: Visible in each endpoint
- ✅ **Same outcomes**: 100% functional goals achieved
- ⚠️ **Less DRY**: Code duplication across 10 endpoints vs 1 middleware class
- ⚠️ **Future refactor**: Can migrate to middleware pattern if needed

**Current Status**: Production-ready, verified working, all Phase 3 goals met

#### OAuth Permission Flow Integration
**File**: `/lib/auth/oauth/mcp-oauth-validator.js` (lines 251-265)

OAuth users receive **inline permissions** in their JWT token based on role:
```javascript
permissions: {
  canViewPOVs: true, // All authenticated users
  canCreatePOVs: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
  canEditTasks: ['ADMIN', 'SUPER_ADMIN', 'USER', 'DEMO_USER'].includes(user.role),
  canAccessMCP: true,
  canManageTeams: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
  canDeletePOVs: user.role === 'SUPER_ADMIN',

  // Hub Tools permissions (aligned with Phase 3.4)
  canRegisterServices: ['ADMIN', 'SUPER_ADMIN', 'USER'].includes(user.role), // DEMO_USER: false
  canViewServices: true, // All authenticated including DEMO_USER

  isDemoUser: user.role === 'DEMO_USER',
  canEditDemoTasks: user.role === 'DEMO_USER'
}
```

**Dual Permission System**:
1. **OAuth Inline Permissions**: Quick checks in OAuth validator (lines 251-265)
2. **RolePermission Database**: Full RBAC system used by hub tools checkPermission() (Phase 3.4)

**Why Both?**:
- **OAuth inline**: Fast permission hints for UI/client-side decisions
- **RolePermission DB**: Authoritative server-side enforcement with audit logging

Both systems stay **synchronized** via role-based logic.

### 🔥 Lean MCP OAuth Implementation Patterns (2025-09-21)
- **Lean vs Complex Strategy**: 250 lines of code beats 2000+ line complex alternatives every time
- **Stateless Security Superiority**: Per-request validation eliminates session storage security risks
- **Provider-Based Security Model**: Let OAuth providers handle security concerns - don't reinvent
- **Database Reuse Success**: Existing schemas can support new auth patterns without changes
- **Unified Validator Architecture**: Single class handling multiple providers reduces complexity
- **Manifest-Driven Configuration**: Claude Desktop OAuth via simple JSON configuration
- **Role Inheritance Pattern**: OAuth users automatically get permissions from existing RBAC
- **Browser vs Desktop Patterns**: Different OAuth flows for different client types
- **Expert Validation Critical**: 92% confidence from domain expert validates lean approach
- **Implementation Speed**: 2 hours lean implementation vs 2-4 weeks complex approach


---

## Evicted session blocks (R3 dispositions in the rollout triage table)

## 🆕 2026-05-27 Session — Pointers (team-membership exclusion: `fa4a1954`) [evicted 2026-06-13]

- **`NON_SELECTABLE_ROLES = ['DEMO_USER','SUPER_ADMIN']`** (`lib/utils/team-member-guard.ts`) is the single source of truth for "never a team member / assignee." Reuse it for any new picker (`notIn`) or team-write path (`findBlockedTeamMemberIds()`). Enforced at 7 surfaces: 3 pickers (`/api/users`, `getAvailableMembers`, `getAvailableAssignees`) + 4 write guards (single add, batch, `applyTeamUpdate` = MCP/REST `pov.update`, POV-create loop). MCP `pov.create` takes no member list.
  - **2026-06-04:** the guard now also excludes **`@paichart.system` service accounts** via `SYSTEM_ACCOUNT_EMAIL_SUFFIX` + `isNonSelectableUser({role,email})` (`team-member-guard.ts`) — it matches role **OR** the email suffix. A plain-`USER` service account (e.g. `monitor@paichart.system`) and the ADMIN `demo-owner@paichart.system` were *not* caught by role alone; the suffix catches both. All 6 surfaces + cleanup-demo-users `PROTECTED_EMAILS` now suffix-aware.
- **`CreateUserSchema.password` is OPTIONAL (2026-06-04)** (`lib/validation/admin-user-validation.ts`): the admin create-user dialog collects no password (OAuth-only — users link by email on first OAuth login), so a required password broke *every* create. Optional, with the full strength chain still applied **when** a value is supplied. Passwordless users (incl. `@paichart.system` service accounts) cannot password-login (`!user.password` short-circuit at `login/route.ts`).
- **Candidate-filter vs actor-check is a real distinction**: filtering who's *selectable* (`notIn NON_SELECTABLE_ROLES`) is NOT the same as gating what a role may *do* (`role === 'DEMO_USER'` directory-harvest deny + GET access filter). Don't fold SUPER_ADMIN into the actor checks — a super-admin must keep view/admin privileges.
- **Scope**: 30-day retention targets DEMO_USER only (SUPER_ADMIN never deleted). `demo-owner@paichart.system` (ADMIN demo-content owner, synthetic email) deliberately left functional. DEMO exclusion via `d4fb0b0f`/`de67ec94`.
- **Frontend wiring + live-debug**: the dropdowns are in `components/poveditor/pov/sections/TeamSection.tsx` — PM/SE/TT selects ← `users` (`/api/users`); add-member ← `availableUsers` (`/api/pov/[id]/team/available`, which routes through `getAvailableTeamMembersHandler` → `getAvailableMembers`, **no query of its own**). When a blocked user still appears in the browser after a verified-correct fix, it's almost always **stale client React state** (mount-time fetch) → hard-refresh; check prod HEAD + the compiled `.next` artifact before assuming a code gap (2026-05-27 — a pre-deploy tab, not a bug).

### [evicted] 2026-05-27 discovery greps (team-membership exclusion)

```bash
# SINGLE SOURCE OF TRUTH for "never a team member/assignee": NON_SELECTABLE_ROLES =
# ['DEMO_USER','SUPER_ADMIN'] in lib/utils/team-member-guard.ts. New pickers/write paths
# MUST reuse it — `notIn` for query filters, findBlockedTeamMemberIds() for write-side.
grep -rn "NON_SELECTABLE_ROLES\|findBlockedTeamMemberIds" lib/ app/ --include="*.ts"

# CANDIDATE filter (who's selectable) ≠ ACTOR/viewer check (what a role may DO). Candidate →
# `notIn NON_SELECTABLE_ROLES` (3 pickers: /api/users, getAvailableMembers, getAvailableAssignees).
# Actor → `role === 'DEMO_USER'` (directory-harvest deny + GET access filter) — must NOT gain SUPER_ADMIN.
grep -rn "notIn: NON_SELECTABLE_ROLES\|role === 'DEMO_USER'" app/api lib --include="*.ts"

# All 4 TeamMember.create entry points are guarded (single add, batch, applyTeamUpdate =
# MCP+REST pov.update, POV-create loop). MCP pov.create takes no member list (not a vector).
grep -rn "teamMember.create" app/api lib --include="*.ts"

# FRONTEND wiring: POV-editor dropdowns live in components/poveditor/pov/sections/TeamSection.tsx —
# PM/SE/TT selects map `users` (← GET /api/users); add-member maps `availableUsers` (← GET
# /api/pov/[id]/team/available). NOTE team/available is an INDIRECTION: route →
# getAvailableTeamMembersHandler → TeamService.getAvailableMembers (no query of its own — trace it).
grep -rn "/api/users\|team/available\|getAvailableTeamMembersHandler" components/poveditor app/api/pov --include="*.tsx" --include="*.ts"
```

Scope: 30-day retention (`cleanup-demo-users.ts`) targets DEMO_USER ONLY — SUPER_ADMIN never deleted. `demo-owner@paichart.system` (ADMIN, owns demo content, synthetic email) deliberately kept selectable-functional. Refs: `fa4a1954` (SUPER_ADMIN), `d4fb0b0f`/`de67ec94` (DEMO_USER).

**Diagnostic — filter is correct but a blocked user STILL shows in a browser dropdown** (2026-05-27, real): (1) confirm prod HEAD has the commit (`ssh … git rev-parse HEAD`); (2) grep the COMPILED artifact `.next/server/app/api/users/route.js` for `notIn`/`SUPER_ADMIN` — a `git pull` without rebuild/restart serves stale code; (3) most often it's **stale client React state** — `TeamSection` fetches `/api/users` once on mount and holds it, so a tab opened before the deploy keeps the old list → **hard-refresh**. Backend was provably correct; the cause was a pre-deploy tab.

## 🆕 2026-05-26 Session — Pointers (role-permission Option C shipped + verified)

- **POV-create is now TABLE-DRIVEN** via `checkPermission(PoV, CREATE)` at BOTH gates — web `app/api/pov/route.ts:302` + MCP `pov-create-handler.ts`. Old hardcoded `role !== 'ADMIN'` gate removed. Policy: ADMIN+USER create, **DEMO blocked**. A new top-level resource has no instance → role-level capability → table is the correct tool.
- **`checkPermission` enforced surface is a CLOSED set**: `mcp-service` create/view (hub) + `pov` create. Everything instance-scoped (POV/phase/task view/edit/delete, child-create) is `validatePOVAccess`. The dead instance-condition code (`evaluatePermissionConditions`/`checkResourceOwnership`/`checkTeamAccess`/`isTeamMember`) + the `rolePermissions` constant were DELETED — `checkPermission` reads `enabled` only.
- **HEADLINE security fix**: MCP gate must map `{id: user.userId, role}` — a raw `TokenPayload` gives `user.id===undefined` → role-blind colliding permission-cache key → cross-role escalation. `Resource.id` widened to `string|null` (coerced to `'*'` for cache key).
- **Admin `/admin/permissions` PUT now calls `permissionCache.clear()`** — role toggles are immediately effective (was 5-min TTL lag).
- **Batch A** (`d5b4d7ee`): phase-create + assignee migrated to `validatePOVAccess` (closed an IDOR gap — `checkPermission` discarded ownerId/teamId); task-view gate removed (query-scoped). **Batch B** (`ed74e8ce`) + prod seed + pm2 restart.
- Plan: `cline_docs/follow-ups/role-permission-IMPLEMENTATION-PLAN-2026-05-25.md`; review: `cline_docs/reviews/role-permission-option-c-2026-05-25/`.

## 🆕 2026-05-24 Session — Pointers

- **DB-level audit shipped** (P2.2 + P2.4): 13 new event types in Activity table. Auth: `AUTHENTICATION:{LOGIN_SUCCESS,LOGIN_FAILED,OAUTH_LOGIN_SUCCESS,LOGOUT}`. Admin: `USER_MANAGEMENT:{CREATE_USER,UPDATE_USER,DELETE_USER}`, `ROLE_MANAGEMENT:{CREATE_ROLE,UPDATE_ROLE,DELETE_ROLE}`, `PERMISSION_CHANGE`, `JWT_STATUS:VIEW`, `AUDIT_LOG:VIEW` (meta-audit), `ARTIFACT_CLEANUP:EXECUTE`. Pattern: fire-and-forget `void trackActivity(...)`.
- **Tests**: `scripts/test-{auth,admin}-audit-coverage.ts` (28 string-pinned assertions in `test:all-validation`).
- **Settings redaction** (P1.4): `lib/settings/prisma/mappers.ts:redactSensitiveSettings` + `lib/settings/services/settings.ts:mergeSettingsPreservingSecrets` — strips LLM keys / JWT tokens from GET response; PUT merge guard prevents wipe.
- **Brute-force defense** (P1.2 + P1.3): `lib/middleware/rate-limit.ts:checkUserRateLimit` + `app/api/auth/login/route.ts` (per-email 5/15min) + fail2ban `paichart-auth` jail.
- **P1.5 fail-CLOSED**: `lib/mcp/embedded-server.ts:buildPOVAccessFilter` throws on missing userContext (was fail-OPEN). RESOLVED via role-flip test.
- **expected-client-id-wiring** (Steve's todo): `cline_docs/reviews/expected-client-id-wiring-2026-05-24/IMPLEMENTATION-PLAN.md` — 6-specialist plan; blocked on DCR storage decision.




---

## Trim follow-up additions (2026-06-11)

## Recent Critical Fix: MCP Task Action Authorization (2025-10-16)

### **Systemic Authorization Vulnerability Resolved**

**Discovery**: Comprehensive audit revealed **11 of 13 task actions had ZERO authorization checks**

**Root Cause**: 
- REST API vs MCP RPC architectural fork
- validatePOVAccess utility created for REST endpoints (14 endpoints)
- MCP monolithic action route (42K tokens, 4000+ lines) excluded from refactor

**Vulnerability Severity**: HIGH
- Any authenticated user could modify any task/POV in system
- No tenant isolation, no ownership validation
- Cross-tenant data tampering possible
- Task hijacking (reassign to unauthorized users)

**Fix Applied**: Added validatePOVAccess to all 11 unprotected actions

**Actions Secured**:
1. task.create - `/app/api/mcp/tasks/action/route.ts:612`
2. task.update - Line 1300
3. task.assign - Line 1669
4. task.complete - Line 1867
5. task.comment - Line 2022 (replaced checkTaskCommentPermission with validatePOVAccess)
6. stage.create - Line 2196 (validates via phase → POV)
7. agent.configure - Line 2528
8. agent.assign - Line 3622
9. agent.execute - Line 3310
10. agent.status - Line 3764 (conditional if taskId provided)
11. workflow.trigger - Line 3424 (conditional if targetId provided)

**Already Protected** (reference implementations):
- agent.results - Line 3660 (inline DEMO_USER check)
- analytics.generate - Line 3362 (inline DEMO_USER check)

**Implementation Pattern**:
```typescript
// Fetch task/POV with authorization context
const taskForAuth = await prisma.task.findUnique({
  where: { id: taskId },
  select: {
    pov: {
      select: {
        id: true,
        ownerId: true,
        metadata: true,  // For DEMO_USER isDemo check
        team: {
          select: {
            members: {
              select: { userId: true }
            }
          }
        }
      }
    }
  }
});

// Single line authorization
validatePOVAccess(user, taskForAuth.pov, {
  throwOnDeny: true,
  logContext: 'Task Update'
});
```

**Security Model Enforced**:
- POV owner: Full access ✅
- Team members: Full access ✅
- DEMO_USER on demo POVs (metadata.isDemo = true): Access ✅
- Admins (ADMIN, SUPER_ADMIN): Override access ✅
- Unauthorized users: ApiError('FORBIDDEN') ❌

**Lines Added**: ~250 lines total (avg 23 lines per action)

**Testing**: ChatGPT validation successful, deployed to UAT

**Specialist Reviews**:
- auth-permissions-specialist: 93% confidence
- architectural-review-specialist: 94% confidence
- Pattern validation: 98% confidence

**Related Documentation**:
- `/cline_docs/task-action-authorization-audit.md` - Audit findings
- `/cline_docs/validate-pov-access-implementation.md` - Implementation plan
- `/cline_docs/task-action-auth-disparity-analysis.md` - Root cause analysis

---



---

## Phase 2 discovery-trim additions (2026-06-11) — evicted from auth-permissions-discovery.md

### [evicted] §2 Authorization & RBAC (architecture narrative)

### 2. Authorization & RBAC

**CRITICAL UPDATE (2025-11-07)**: Dual authorization model documented

**Two Authorization Systems**:
1. **validatePOVAccess** (ownership-based) - PRIMARY for resource operations
2. **checkPermission** (role-based) - For system-level operations

**Reference**: `/.claude/knowledge/patterns/authorization-dual-layer-pattern.md`

**Discovery Commands** ⭐ ENHANCED (Nov 26, 2025):

- [ ] **4-Pattern POV Protection Detection** (prevents 60% false positive rate):
  ```bash
  # Pattern 1: withPOVAccess middleware (route-level)
  echo "=== Pattern 1: withPOVAccess Middleware ==="
  grep -r "export const.*= withPOVAccess\|withPOVAccess(async" app/api/pov --include="*.ts" -l | wc -l

  # Pattern 2: requirePermission middleware (route-level)
  echo "=== Pattern 2: requirePermission Middleware ==="
  grep -r "requirePermission.*ResourceType\.PoV" app/api/pov --include="*.ts" -l | wc -l

  # Pattern 3: Handler-level protection (service-level)
  echo "=== Pattern 3: Handler-Level Protection ==="
  for file in $(find app/api/pov -name "route.ts"); do
    has_handler=$(grep -c "Handler(" "$file" 2>/dev/null || echo 0)
    if [ "$has_handler" -gt 0 ]; then
      handler=$(grep "Handler(" "$file" | head -1 | grep -oE "[a-zA-Z]+Handler")
      echo "  $file → check lib/pov/handlers/ for $handler"
      grep -l "validatePOVAccess\|checkPermission.*PoV" lib/pov/handlers/*.ts 2>/dev/null
    fi
  done

  # Pattern 4: Manual validatePOVAccess in routes
  echo "=== Pattern 4: Manual validatePOVAccess ==="
  grep -r "validatePOVAccess(user, pov\|validatePOVAccess(authUser" app/api/pov --include="*.ts" -l | wc -l

  # TRULY UNPROTECTED: Check all 4 patterns
  echo "=== TRULY UNPROTECTED ROUTES ==="
  for file in $(find app/api/pov -name "route.ts"); do
    has_any=$(grep -c "withPOVAccess\|requirePermission\|Handler(\|validatePOVAccess" "$file" 2>/dev/null || echo 0)
    if [ "$has_any" -eq 0 ]; then
      # Double-check: might have user scoping in query
      has_scoping=$(grep -c "ownerId.*user\.userId" "$file" 2>/dev/null || echo 0)
      if [ "$has_scoping" -eq 0 ]; then
        echo "❌ CRITICAL: $file - NO PROTECTION"
      else
        echo "⚠️ REVIEW: $file - User-scoped query (verify sufficient)"
      fi
    fi
  done

  # Expected: <5 routes (utilities, deprecated, or legitimately public)
  ```

- [ ] **POV Helper Functions** ⭐ NEW (Nov 26, 2025):
  ```bash
  # Helper functions for extracting POV from task/execution/artifact relationships
  # Location: lib/utils/pov-helpers.ts

  # Usage check:
  grep -r "getPOVFromTask\|getPOVFromExecution\|getPOVFromArtifact" app/api --include="*.ts" | wc -l

  # What they return: Full POV context for validatePOVAccess
  # { id, ownerId, metadata, team: { members: [{userId}] } }

  # Why metadata: true (not metadata: { select: { isDemo: true } }):
  # - Matches 100% of codebase pattern (consistency)
  # - validatePOVAccess needs full metadata object
  # - No sensitive data in metadata (customer, teamSize, isDemo, tenantId)
  # - Negligible performance impact (< 0.1ms, ~1.5 KB)
  # - Future-proof (multi-tenancy tenantId ready)
  # - Auth-permissions specialist validated: 94% confidence

  # When to use helpers:
  # - Routes with taskId in body/params (not povId)
  # - Routes with executionId in params
  # - Routes with artifactId in params
  # - Alternative to 28-line manual Prisma queries
  ```

- [ ] **Identify files using validatePOVAccess** (ownership-based model):
  ```bash
  grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l | grep -v "node_modules" | grep -v "cline_docs"
  # Current: 30+ files (all POV-scoped operations)
  ```

- [ ] **Identify files using checkPermission** (role-based model):
  ```bash
  grep -r "checkPermission" lib/ app/ --include="*.ts" | grep -v "import" | grep -v "node_modules" | grep -v "export function" | grep "await.*checkPermission"
  # Current: ~5-8 files (system-level operations)
  ```

- [ ] **Identify dual-layer patterns** (both systems):
  ```bash
  # Find files with BOTH (potential inconsistency or intentional dual-layer)
  for file in $(grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l); do
    if grep -q "await.*checkPermission" "$file"; then
      echo "DUAL: $file"
    fi
  done
  # Expected: 0 (current codebase is consistent)
  ```

- [ ] **Check POV query completeness** (for validatePOVAccess):
  ```bash
  # Automated scan:
  ./scripts/audit-pov-access-completeness.sh
  # Checks: ownerId, metadata, team.members fields present
  # Current: 0 issues (100% complete)
  ```

- [ ] Role definitions (USER, DEMO_USER, ADMIN, SUPER_ADMIN) ✅ DEMO_USER added 2025-10-09
- [ ] ResourceAction enum (VIEW, CREATE, EDIT, DELETE, etc.)
- [ ] ResourceType enum (POV, PHASE, TASK, MCP_SERVICE, etc.) ✅ MCP_SERVICE added
- [ ] Permission matrices and enforcement
- [ ] Conditional permissions (isOwner, isTeamMember)
- [ ] rolePermissions detailed mapping
- [ ] POV access control implementation
- [ ] Team-based access patterns
- [ ] Resource filtering at API level
- [ ] Role assignment and management
- [ ] Component-level permission checks
- [ ] Pragmatic implementation approaches

- [x] **NEW: DEMO_USER Role Implementation** (Phase 3 - 2025-10-09)
  - Database enum added via ALTER TYPE (production deployed)
  - TypeScript types updated in lib/types/auth.ts
  - 10 permissions seeded (POV: 2, Task: 4, MCP_SERVICE: 4)
  - Read-only access pattern for demo/trial users

- [x] **NEW: Inline Enforcement Pattern** (Phase 3 - 2025-10-09)
  - Tool-level: enforceToolSecurity() function in tool-security.js (Phase 1.1)
  - API-level: Inline DEMO_USER checks in 10/13 endpoints (Phase 3.3)
  - Pattern chosen over centralized middleware classes for faster deployment
  - Same functional outcomes as handler-auth-plan.md proposals
  - Files: `mcp-server-http-clean.js` (grep for `enforceToolSecurity(toolName`), `app/api/pov/route.ts` (175-181), `lib/pov/handlers/get.ts` (32-44)
  - **Note**: line numbers in `mcp-server-http-clean.js` shift frequently — prefer grep over file:line refs.

- [x] **NEW: DRY Access Control Refactor** (2025-10-10)
  - Shared utility: validatePOVAccess() in lib/auth/validate-pov-access.ts
  - Replaces 14 duplicate inline checks with single source of truth
  - Supports DEMO_USER additive access (owned + team + demo)
  - Multi-tenant ready with tenantId support
  - Type-safe with function overloads (throw vs return modes)
  - 56% code reduction (~800 lines → ~350 lines)

- [x] **NEW: Authorization Model Alignment** (2025-11-07 - P0-1 Task Domain Fix)
  - Migrated task operations from checkPermission to validatePOVAccess
  - Achieved 100% consistency (27 files using ownership-based model)
  - Removed dual permission checks (was causing DEMO_USER bugs)
  - Pattern: POV-scoped operations use validatePOVAccess, system operations use checkPermission
  - Files: lib/tasks/handlers/task.ts (4 handlers), lib/tasks/helpers/pov-access.ts
  - Result: Security score 68 → 72, permission consistency 100%
  - **Reference**: `/.claude/knowledge/patterns/authorization-dual-layer-pattern.md`

- [x] **NEW: Admin-Only Endpoint Pattern** (2026-01-13 - Named Workflow System)
  - Uses `createHandler` with `allowedRoles` for role-based endpoint protection
  - Pattern: System-level operations (workflow management, admin features)
  - Files: `/app/api/workflows/*.ts` (CRUD + run endpoints)
  - Discovery commands below in Step 6.5

### 3. Security Infrastructure

---

### [evicted] OAuth vuln detection + user-permission-assignment narratives

## OAuth Security Vulnerability Detection (NEW - 2026-02-10)

### Critical: Phantom User Detection
```bash
# NOTE: BOTH paths — MCP is .js (mcp-oauth-validator.js), WEB is .ts
# (oauth-service.ts, provider-id-canonical since Wave 2 2026-06-21). Old *.js-only
# greps missed the web path entirely — always include oauth-service.ts.

# Check for vulnerable email-primary lookups (CVSS 8.5 if found) — both paths
grep -n "findFirst.*OR.*email.*oauth\|OR:.*whereConditions.*email\|findUnique({ where: { email: userInfo.email }" lib/auth/oauth/*.js lib/auth/oauth/oauth-service.ts

# Verify phantom user detection — BOTH paths now (web added #4 2026-06-21: a
# verify findUnique({where:{id}}) after the lookup, forcing create on stale-cache phantom)
grep -n "findUnique.*verifyUser\|Phantom user detected\|Phantom user from stale cache" lib/auth/oauth/*.js lib/auth/oauth/oauth-service.ts

# Verify provider ID canonical match — should be PRIMARY on both paths post-Wave-2
grep -n "oauthProviderId: validatedUser.id\|oauthProviderId: userInfo.providerUserId" lib/auth/oauth/*.js lib/auth/oauth/oauth-service.ts
```

**Patterns**: `oauth-phantom-user-detection.md`, `oauth-provider-id-canonical.md`
**Fixed**: 2026-02-10 (CVSS 8.5 vulnerability closed)

---

## OAuth User Permission Assignment (NEW - 2025-10-09)

### How OAuth Users Get Permissions

**Dual Permission System**: OAuth users receive permissions through TWO synchronized systems:

#### 1. OAuth Inline Permissions (Fast Client-Side Checks)
**File**: `/lib/auth/oauth/mcp-oauth-validator.js` (lines 251-265)

When OAuth users authenticate (GitHub, Google, Microsoft), they receive **inline permissions** in their JWT token:

```javascript
// Generated at OAuth login time
permissions: {
  canViewPOVs: true, // All authenticated users
  canCreatePOVs: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
  canEditTasks: ['ADMIN', 'SUPER_ADMIN', 'USER', 'DEMO_USER'].includes(user.role),
  canAccessMCP: true,
  canManageTeams: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
  canDeletePOVs: user.role === 'SUPER_ADMIN',

  // Hub Tools permissions (aligned with Phase 3.4)
  canRegisterServices: ['ADMIN', 'SUPER_ADMIN', 'USER'].includes(user.role), // DEMO_USER: false
  canViewServices: true, // All authenticated including DEMO_USER

  isDemoUser: user.role === 'DEMO_USER',
  canEditDemoTasks: user.role === 'DEMO_USER'
}
```

**Purpose**: Quick permission hints for UI/client-side decisions (e.g., show/hide buttons)

#### 2. RolePermission Database (Authoritative Server-Side Enforcement)
**File**: `/lib/auth/permissions.ts` + `role_permissions` table

Server-side API endpoints and hub tools use the **RolePermission system** for authoritative checks:

```typescript
// In hub-tools-handler.js (Phase 3.4)
const hasPermission = await checkPermission(
  user,
  { type: 'mcp-service', id: null },
  'create',
  { source: 'mcp_hub_tools' }
);
// Queries role_permissions table
// Logs to PermissionLog
// Caches result
```

**Purpose**: Authoritative enforcement with audit logging, permission caching, SUPER_ADMIN bypass

### Why Both Systems?

| System | Purpose | Speed | Authority | Logging |
|--------|---------|-------|-----------|---------|
| **OAuth Inline** | UI hints, quick checks | ⚡ Instant | ⚠️ Advisory | ❌ No |
| **RolePermission DB** | Server enforcement | 🐌 Cached (fast) | ✅ Authoritative | ✅ Yes |

**Synchronization**: Both systems use the **same role-based logic**, so they stay in sync:
- `canRegisterServices` in OAuth → `checkPermission('mcp-service', 'create')` in DB
- Both check: `['ADMIN', 'SUPER_ADMIN', 'USER'].includes(user.role)`

### OAuth User Role Assignment Flow

```
1. User clicks "Login with GitHub/Google/Microsoft"
   ↓
2. OAuth provider authenticates user
   ↓
3. mcp-oauth-validator.js receives OAuth token
   ↓
4. User lookup/creation in database (User table)
   - First time: Creates user with role = 'USER' (default)
   - Existing: Uses stored role from User.role field
   ↓
5. JWT token generated with:
   - userId, email, role
   - Inline permissions based on role
   - isDemoUser flag
   ↓
6. JWT stored in cookie/returned to client
   ↓
7. Subsequent API calls:
   - JWT validated
   - User role extracted
   - RolePermission system checks permissions
   - Audit log created
```

### DEMO_USER Role for OAuth Users

**How to assign**: Update User.role in database:
```sql
UPDATE users SET role = 'DEMO_USER' WHERE email = 'demo@example.com';
```

**Permissions after role change**:
- ✅ Next OAuth login → inline permissions updated automatically
- ✅ Current session → JWT remains valid with old permissions (24h expiry)
- ✅ RolePermission checks → use new role immediately

**Use Cases**:
- Trial users: Limited read-only access
- Demo environments: Prevent data modification
- Onboarding: Safe exploration before upgrade

### Implementation Architecture: Inline vs Centralized

**Reference Document**: `/cline_docs/handler-auth-plan.md`

**Plan Proposed** (Centralized Middleware):
- AuthenticationMiddleware class with enforceToolSecurity()
- PermissionMiddleware class with checkResourceAccess()
- Custom error classes (AuthenticationError, AuthorizationError)
- Context enrichment pattern
- Single middleware entry point

**Actual Implementation** (Inline Enforcement - Phase 3):

1. **MCP Tool Security** (Phase 1.1):
   - Function: `enforceToolSecurity()` in `/lib/mcp/server/config/tool-security.js`
   - Called: `/mcp-server-http-clean.js` — grep `enforceToolSecurity(toolName` to find the active callsite. (Line numbers shift; prefer grep for `mcp-server-http-clean.js`.)
   - Pattern: PUBLIC_TOOLS vs AUTHENTICATED_TOOLS vs ADMIN_TOOLS arrays

2. **API Resource Filtering** (Phase 3.3):
   - Pattern: Inline DEMO_USER checks in 10/13 API endpoints
   - Example: `/app/api/pov/route.ts` lines 175-181 (POV listing filter)
   - Example: `/lib/pov/handlers/get.ts` lines 32-44 (individual POV validation)
   - Example: `/app/api/pov/[povId]/phase-templates/route.ts` (phase template access)

**Why Inline Pattern Chosen**:
- ✅ Faster deployment (working in production now)
- ✅ Explicit security (visible in each endpoint)
- ✅ Same functional outcomes (100% security goals met)
- ✅ Verified working (jacob.wilcox test passed)
- ⚠️ Trade-off: Less DRY, more code duplication

**Issues from handler-auth-plan.md RESOLVED**:
1. ✅ "No Universal Middleware" → enforceToolSecurity() exists and is enforced
2. ✅ "Missing Security Enforcement" → Arrays now enforced at MCP layer
3. ✅ "Manual Checking" → Centralized at tool level, inline at resource level
4. ✅ "Inconsistent Error Messages" → MCP errors standardized (-32001)
5. ✅ "No Centralized Permission Logic" → Hybrid approach (tool-level centralized, resource-level inline)

**Production Status**:
- ✅ OAuth JWT bug fixed (commit a94b333)
- ✅ Tool security deployed (commit 6c01320)
- ✅ API filtering deployed (commit 0dabe52)
- ✅ Demo infrastructure created (2 POVs, 168 tasks)
- ✅ Verified working (jacob.wilcox sees only demo POVs)


---

### [evicted] OAuth production implementation narratives (Microsoft 7.1 / provider config 7.2 / lean 7.1)

### 7.1. Microsoft MCP OAuth Implementation (PRODUCTION - 2025-10-14)
```bash
# Microsoft MCP OAuth Status
echo "=== Microsoft MCP OAuth Implementation ==="
echo "Microsoft OAuth handlers deployed:"
# Note: handleMicrosoftTokenExchange + refreshMicrosoftToken DELETED Wave 3b.0a 2026-05-12; only handleMicrosoftAuthorize + exchangeMicrosoftCode helper remain live
grep -c "handleMicrosoftAuthorize\|exchangeMicrosoftCode" mcp-server-http-clean.js

echo "Microsoft Client ID (current):"
grep "MICROSOFT_CLIENT_ID.*f2e44a69" .env* ecosystem.config.js 2>/dev/null || echo "Not found in env files"

echo "MCPOAuthTokenManager implementation (.ts is sole source of truth since Phase 2 proper Apr 8 2026):"
ls -la lib/auth/oauth/mcp-oauth-token-manager.ts
# Bug Class 73 guard: assert no .js sibling has re-appeared
[ -f lib/auth/oauth/mcp-oauth-token-manager.js ] && echo "⚠️ BC73 REGRESSION: .js shadow re-appeared" || echo "✓ no .js shadow"

echo "Circuit breaker implementation:"
ls -la lib/auth/oauth/circuit-breaker-utils.ts
[ -f lib/auth/oauth/circuit-breaker-utils.js ] && echo "⚠️ BC73 REGRESSION: .js shadow re-appeared" || echo "✓ no .js shadow"

echo "Retry logic implementation:"
ls -la lib/auth/oauth/retry-utils.ts
[ -f lib/auth/oauth/retry-utils.js ] && echo "⚠️ BC73 REGRESSION: .js shadow re-appeared" || echo "✓ no .js shadow"

# Provider selection mechanism
echo "Provider routing in authorization endpoint:"
grep -n "provider.*microsoft\|selectedProvider" mcp-server-http-clean.js | grep -A 3 "oauth/authorize" | head -10

echo "Provider routing in token endpoint:"
grep -n "provider.*microsoft\|selectedProvider" mcp-server-http-clean.js | grep -A 3 "oauth/token" | head -10

# Token refresh middleware
echo "MCP OAuth refresh middleware:"
# Note: mcpOAuthRefreshMiddleware was removed in Phase 3.0a (Wave 3a, May 2026) — zero callers, proactive refresh was no-op. Grep retained for forensic purposes only (expect empty).
grep -n "mcpOAuthRefreshMiddleware" mcp-server-http-clean.js -A 5 | head -15

# Circuit breaker integration
echo "Circuit breaker checks:"
grep -n "isCircuitOpen\|recordSuccess\|recordFailure" mcp-server-http-clean.js | head -10

# Health monitoring
echo "MCP OAuth health monitoring:"
grep -n "mcpOAuthTokens\|mcpCircuitBreakers" app/api/auth/oauth/health/route.ts | head -10

# Azure AD redirect URIs
echo "Microsoft OAuth redirect URIs registered:"
echo "  - https://paichart.app/api/auth/oauth/callback/microsoft (Web App)"
echo "  - https://claude.ai/api/mcp/auth_callback (Claude Desktop)"
echo "  - https://chatgpt.com/connector_platform_oauth_redirect (ChatGPT)"
echo "  - http://localhost:7777/oauth/callback (Gemini CLI - dev)"

# Test Microsoft OAuth flow
echo "Test Microsoft OAuth authorization:"
echo "  curl -I 'https://paichart.app/oauth/authorize?provider=microsoft&client_id=test&redirect_uri=https://claude.ai/api/mcp/auth_callback&state=test123'"
echo "  Expected: HTTP 302 redirect to login.microsoftonline.com"

### 7.2. OAuth Provider Configuration (PRODUCTION READY)
```bash
# OAuth provider configuration
echo "=== OAuth Providers Status ==="
grep -r "GITHUB_CLIENT_ID\|MICROSOFT_CLIENT_ID\|GOOGLE_CLIENT_ID" .env* ecosystem.config.js | head -20

# PKCE implementation (CRITICAL - MUST USE EnterpriseOAuthService.pkceStorage)
echo "=== PKCE Storage Implementation ==="
grep -r "pkceStorage\|storePKCEVerifier\|retrievePKCEVerifier" lib/auth/oauth --include="*.ts" -A 5 -B 2

# OAuth redirect URLs (MUST use APP_BASE_URL not request.url)
echo "=== OAuth Redirect Configuration ==="
grep -r "APP_BASE_URL\|request\.url" app/api/auth/oauth --include="*.ts" -B 2 -A 2

# OAuth button components
echo "=== OAuth UI Components ==="
find components/auth -name "*OAuth*" -o -name "*oauth*" | head -10

# OAuth environment in PM2
echo "=== PM2 OAuth Environment ==="
grep -E "GITHUB_CLIENT|APP_BASE_URL|OAUTH" ecosystem.config.js | head -20

# CRITICAL: OAuth Deployment Issues (2025-09-24 UPDATED)
echo "=== OAuth Deployment Gotchas ==="
echo "GitHub secret naming restrictions:"
echo "  ❌ BLOCKED: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (GitHub security feature)"
echo "  ✅ ALLOWED: PAICHART_GITHUB_CLIENT_ID, PAICHART_GITHUB_CLIENT_SECRET"
echo "  ✅ GEMINI: GEMINI_GITHUB_CLIENT_ID, GEMINI_GITHUB_CLIENT_SECRET (separate app)"
echo ""
echo "Build vs Runtime environment variables:"
echo "  Build-time: CLIENT_ID needed for Next.js optimization"
echo "  Runtime: CLIENT_SECRET needed for OAuth flow processing"
echo ""
echo "OAuth Discovery Endpoints (RFC 8414):"
echo "  - /oauth/.well-known/oauth-authorization-server"
echo "  - /.well-known/oauth-authorization-server"
echo "  - /oauth/discovery"
echo ""
echo "Session Management:"
echo "  - OAuth users get automatic SSE sessions"
echo "  - express.urlencoded() middleware required for token exchange"
echo ""
echo "ENTERPRISE_ROLE_MAPPING export issues:"
grep -r "ENTERPRISE_ROLE_MAPPING" lib/auth/oauth --include="*.ts" -B 2 -A 2 | head -10
echo ""
echo "OAuth environment variables required for production:"
echo "  - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (or alternative names)"
echo "  - OAUTH_STATE_SECRET, OAUTH_SESSION_TIMEOUT, OAUTH_PKCE_ENABLED"
echo "  - APP_BASE_URL (critical for redirect URL construction)"
```

### 7.1. Lean MCP OAuth Implementation (NEW - 2025-09-21)
```bash
echo "=== Lean MCP OAuth Implementation Validation ==="
# Check unified OAuth validator
echo "1. Unified OAuth Validator (should be ~250 lines):"
if [ -f lib/auth/oauth/mcp-oauth-validator.js ]; then
    echo "✅ OAuth validator found: $(wc -l < lib/auth/oauth/mcp-oauth-validator.js) lines"
    echo "Providers supported:"
    grep -c "verifyGitHubToken\|verifyGoogleToken\|verifyMicrosoftToken" lib/auth/oauth/mcp-oauth-validator.js
else
    echo "❌ OAuth validator missing"
fi
# Check MCP manifest configuration
echo -e "\n2. MCP OAuth Manifest:"
if [ -f mcp_manifest.json ]; then
    echo "✅ MCP manifest found"
    echo "OAuth providers declared:"
    grep -c "github\|google\|microsoft" mcp_manifest.json
    echo "Auth type: $(grep '"type"' mcp_manifest.json | cut -d'"' -f4)"
else
    echo "❌ MCP manifest missing"
fi
# Validate stateless architecture
echo -e "\n3. Stateless OAuth Architecture:"
echo "OAuth validation pattern (per-request, no sessions):"
grep -n "verifyOAuthToken" lib/auth/oauth/mcp-oauth-validator.js | head -5
echo "Provider API calls (GitHub, Google, Microsoft):"
grep -c "api.github.com\|googleapis.com\|graph.microsoft.com" lib/auth/oauth/mcp-oauth-validator.js
# Check database reuse (no schema changes)
echo -e "\n4. Database Reuse Success:"
echo "Existing oauth fields in User table:"
grep -A 10 -B 10 "oauthProvider\|oauthProviderId" prisma/schema.prisma | head -15
echo "New user creation without schema changes:"
grep -n "oauthProvider.*provider" lib/auth/oauth/mcp-oauth-validator.js | head -3
# Validate role-based permissions
echo -e "\n5. Role-Based Permission Inheritance:"
echo "OAuth users get role-based permissions:"
grep -A 10 "permissions.*canViewPOVs\|permissions.*canCreatePOVs" lib/auth/oauth/mcp-oauth-validator.js
# Check expert confidence validation
echo -e "\n6. Implementation Confidence Validation:"
echo "Auth-permissions-specialist validation:"
grep -r "92%.*confidence\|validated.*auth.*expert" --include="*.md" cline_docs/ | head -3
# Verify lean vs complex approach
echo -e "\n7. Lean Implementation Success Metrics:"
echo "Lines of code (should be ~250):"
wc -l lib/auth/oauth/mcp-oauth-validator.js 2>/dev/null || echo "File not found"
echo "Implementation time claimed: 2 hours vs 2-4 weeks complex"
echo "Security model: Stateless (MORE secure than session storage)"
echo "Database changes: 0 (reused existing fields)"
```


---

### [evicted] §8.3 WebSocket Auth Caching (STALE — lib/websocket deleted 315db03e)

### 8.3. Phase 2.2 WebSocket Auth Caching
```bash
# PHASE 2.2: Dual-Layer Authentication Caching
echo "=== Phase 2.2: WebSocket Auth Caching System ==="
echo "Auth cache implementation:"
ls -la ./lib/websocket/auth-cache.ts

echo "Dual-layer caching architecture:"
grep -r "L1.*cache\|L2.*cache\|memory.*cache.*redis" --include="*.ts" | head -5

echo "Cache performance metrics:"
grep -r "hitRate\|cache.*stat\|85%.*reduction" --include="*.ts" --include="*.md" | head -5

echo "Real-time cache invalidation:"
grep -r "invalidateToken\|cache.*invalid\|real.*time.*invalid" --include="*.ts" | head -5

# Security Integration with Cache
echo -e "\n=== Security-Events Integration ==="
echo "Security events with caching:"
ls -la ./lib/websocket/security-events.ts

echo "Cache encryption patterns:"
grep -r "encrypt.*cache\|cache.*encrypt\|encrypted.*token" --include="*.ts" | head -5

echo "Token validation performance:"
grep -r "validateCachedToken\|cache.*validation\|<.*1ms" --include="*.ts" --include="*.md" | head -3

# Cache Invalidation Patterns
echo -e "\n=== Cache Invalidation Strategies ==="
echo "User-based invalidation:"
grep -r "invalidateUser.*Token\|user.*token.*invalid" --include="*.ts" | head -5

echo "Emergency flush capabilities:"
grep -r "emergency.*flush\|flush.*cache\|security.*incident" --include="*.ts" | head -3

echo "Cache warming strategies:"
grep -r "cache.*warm\|preload.*cache\|promote.*cache" --include="*.ts" | head -5
```


---

### [evicted] Progress tracking + visual handover templates (specialist scaffold, not discovery content)

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: Authentication & Authorization Discovery
═════════════════════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Authentication Flow Analysis
□ Section 2: Authorization Implementation
□ Section 3: Security Measures
□ Section 4: MCP Server Authentication
□ Section 5: API Route Protection
□ Section 6: Frontend Auth Integration
□ Section 7: Token Lifecycle
□ Section 8: Database Auth Queries
□ Section 9: Security Configuration
□ Section 10: Component-Level Authorization
□ Section 11: Plan 11B Authentication-Based Tool Access Validation
□ Section 12: System Health Validation

Current Status: 🚀 Starting Discovery
Commands: 0/105 executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Auth Flow [██████████] 100%
   Commands: 12/12 | Found: JWT, API keys, sessions
🔄 Section 2: Authorization [███░░░░░░░] 30%
   Commands: 5/15 | Analyzing RBAC...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** Auth middleware, RBAC system ✅
⚠️ **Critical Issues:** 2 security vulnerabilities
🔍 **Areas Investigated:** 
   - ✅ JWT implementation validated
   - ✅ RBAC permissions mapped
   - ⚠️ API key rotation missing
   - ❌ Session CSRF incomplete

## Context for Specialist:
- Key Finding: rolePermissions matrix comprehensive
- Risk Area: API key management needs hardening
- Focus Needed: Implement token rotation strategy

Delegating to: auth-specialist
Reason: Security expertise required
Priority: Fix API key rotation and CSRF protection

--- ACTIVATING AUTH-SPECIALIST ---
```

### Specialist Reception Template
```markdown
--- AUTH-SPECIALIST ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** Auth middleware, RBAC ✅
⚠️ **Issues:** 2 security vulnerabilities acknowledged
🔍 **Focus Areas:** API key rotation priority

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Analyzing security gaps...
[████░░░░░░] 40% → Reviewing token lifecycle...
[██████████] 100% → Analysis complete ✅

## Specialist Findings:
1. Implement rotating API keys with expiry
2. Add CSRF tokens to session auth
3. Enable JWT refresh token flow
```

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact | Mitigation |
|------|----------|------------|---------|------------|
| Hardcoded secrets | Critical | Medium | Full system compromise | Environment variables, secret rotation |
| Missing auth checks | Critical | Medium | Unauthorized access | Route protection audit, middleware |
| Weak password policy | High | High | Account compromise | Strong password requirements, MFA |
| No token expiration | High | Medium | Persistent unauthorized access | Implement token TTL, refresh flow |
| Plain text passwords | Critical | Low | Data breach | Proper hashing (bcrypt/argon2) |
| Session fixation | High | Low | Account takeover | Session regeneration on login |
| CSRF vulnerability | High | Medium | Unauthorized actions | CSRF tokens, SameSite cookies |
| Insecure token storage | High | Medium | Token theft | HttpOnly cookies, secure storage |
| No rate limiting | Medium | High | Brute force attacks | Implement rate limiters |
| Excessive permissions | Medium | High | Privilege escalation | Principle of least privilege |
| No audit logging | Medium | High | Undetected breaches | Comprehensive access logs |
| Weak token secret | High | Low | Token forgery | Strong random secrets |
| CORS misconfiguration | Medium | Medium | XSS attacks | Strict origin policy |
| SQL injection in auth | Critical | Low | Database compromise | Parameterized queries |
| Missing HTTPS | Critical | Low | Man-in-the-middle | Enforce HTTPS everywhere |

---


---

### [evicted] Output format / report skeleton / migration plan

## Output Format

```markdown
# Authentication & Authorization Discovery Report

## Summary
- Auth method: [JWT/Session/API Key]
- RBAC implementation: ✅/❌
- Protected routes: X/Y
- Security score: X/100
- Critical issues: X

## Authentication Architecture

### Primary Methods
1. JWT Tokens
   - Implementation: [location]
   - Secret management: [secure/insecure]
   - Expiration: [configured/missing]

2. API Keys
   - Storage: [database/encrypted]
   - Format: [JWT/random]
   - Revocation: [supported/missing]

3. Session Auth
   - Cookie config: [secure/insecure]
   - Session storage: [location]
   - CSRF protection: ✅/❌

### Token Lifecycle
- Generation: [endpoints]
- Validation: [middleware]
- Refresh: [implemented/missing]
- Revocation: [supported/missing]

## Authorization System

### Role Hierarchy
- USER: [permissions with conditions]
- ADMIN: [permissions]
- SUPER_ADMIN: [permissions]

### Permission System
- ResourceActions: [list all found]
- ResourceTypes: [list all found]
- Conditional permissions: [isOwner, isTeamMember patterns]
- Permission matrix: [summary of rolePermissions]

### Access Control Implementation
- POV filtering: [automatic/manual]
- Team access: [implemented/missing]
- API-level enforcement: ✅/❌
- Component-level checks: [patterns found]

### Permission Checks
- Route protection: X/Y routes
- Resource filtering: [locations]
- Role validation: [consistent/gaps]
- UI permission states: [how components handle]

### Implementation Philosophy
- Pragmatic approaches: [e.g., Jan Marshal's simple approach]
- Default behaviors: [permissive/restrictive]
- Error handling: [how permission errors are handled]

## Security Analysis

### ✅ Implemented
- [List of security measures in place]

### ❌ Missing/Weak
- [Security gaps identified]

### 🔴 Critical Issues
1. [Issue]: [Impact] - [Fix]
2. [Prioritized list]

## Integration Points

### MCP Server
- Auth method: JWT (X-API-Key or Bearer token)
- HTTP Transport: mcp-server-http-clean.js with authentication middleware (registers ts-node + tsconfig-paths at startup since Phase 2 proper Apr 8 2026; the old `mcp-server-http.js` was deleted as dead code in Phase 2.P0 step 2)
- Priority chain: Bearer token → X-API-Key → Reject
- Error handling: 401 for unauthorized, proper error messages
- Claude Desktop: Uses mcp-remote bridge with X-API-Key header
- Session isolation: Per-session transport architecture

### API Routes
- Protected: X routes
- Unprotected: Y routes (list critical ones)
- Middleware usage: [consistent/gaps]

### Frontend
- Token storage: [secure/insecure]
- Auth state: [managed/ad-hoc]
- Protected routes: [implemented/missing]

## Compliance & Best Practices

### ✅ Following Standards
- [OWASP compliance points]

### ❌ Violations
- [Standards not met]

## Recommendations

### 🔴 Critical (Security patches)
1. [Fix unprotected routes]
2. [Implement missing auth]
3. [Security headers]

### 🟡 Important (This month)
1. [Token refresh flow]
2. [Audit logging]
3. [Rate limiting]

### 🟢 Enhancements (Future)
1. [MFA support]
2. [OAuth integration]
3. [WebAuthn]

## Migration Plan

### Phase 1: Critical Security (1 week)
- [ ] Protect X unprotected routes
- [ ] Fix token storage
- [ ] Add security headers

### Phase 2: Enhanced Security (2 weeks)
- [ ] Implement refresh tokens
- [ ] Add comprehensive audit logs
- [ ] Rate limiting on auth endpoints

### Phase 3: Advanced Features (1 month)
- [ ] MFA implementation
- [ ] Session management improvements
- [ ] Advanced RBAC features
```


---

### [evicted] [evicted dated block] 05-26 Option C

## 🆕 2026-05-26 Session — Run These Greps FIRST (role-permission Option C shipped: Batch A `d5b4d7ee` + Batch B `ed74e8ce`)

```bash
# POV-create is now TABLE-DRIVEN via checkPermission(PoV, CREATE) at BOTH gates
# (web + MCP). The old hardcoded `role !== 'ADMIN'` gate is GONE. Policy: ADMIN+USER create, DEMO blocked.
grep -nE "checkPermission|ResourceType.PoV" app/api/pov/route.ts lib/mcp/tasks/action/handlers/pov/pov-create-handler.ts

# checkPermission's ENTIRE enforced surface is now a CLOSED set: mcp-service create/view
# (hub) + pov create. Everything instance-scoped (POV/phase/task view/edit/delete, child-create)
# → validatePOVAccess. Per-action principle: role-capability→table, instance→validatePOVAccess.
grep -rn "checkPermission(" lib/ app/ --include="*.ts" --include="*.js" | grep -vE "export|function checkPermission|checkPermissions\("

# Dead instance-condition machinery REMOVED (evaluatePermissionConditions, checkResourceOwnership,
# checkTeamAccess, isTeamMember) + the `rolePermissions` constant. checkPermission reads enabled only.
grep -nE "evaluatePermissionConditions|checkResourceOwnership|export const rolePermissions" lib/auth/permissions.ts lib/types/auth.ts || echo "✓ dead code gone"

# Resource.id is now string|null (capability checks pass id:null → coerced to '*' for cache key)
grep -n "id: string | null\|resource.id ?? " lib/types/auth.ts lib/auth/permissions.ts

# Seed = enforced grants ONLY; bootstrap-only + post-seed verify. Admin PUT flushes the cache.
grep -nE "ENFORCED_GRANTS|permissionCache.clear" scripts/setup-permissions.ts app/api/admin/permissions/route.ts

# Live prod table (expect 9 rows):
ssh <PROD_USER>@<PROD_HOST> 'cd /var/www/paichart-app/current && source .env.production && psql "$DATABASE_URL" -c "SELECT role, \"resourceType\", action, enabled FROM role_permissions ORDER BY \"resourceType\", role;"'
```

Refs: plan `cline_docs/follow-ups/role-permission-IMPLEMENTATION-PLAN-2026-05-25.md`, review `cline_docs/reviews/role-permission-option-c-2026-05-25/`. The DB-matrix-vs-validatePOVAccess split is DELIBERATE (per-action boundary), not a bug.

---


---

### [evicted] [evicted dated block] 05-24

## 🆕 2026-05-24 Session — Run These Greps FIRST

```bash
# P2.2 + P2.4 DB-level audit shipped — 13 new event types in Activity table
grep -rnE "void trackActivity|'AUTHENTICATION'|'USER_MANAGEMENT'|'ROLE_MANAGEMENT'|'PERMISSION_CHANGE'|'JWT_STATUS'|'AUDIT_LOG'|'ARTIFACT_CLEANUP'" app/api/auth/ app/api/admin/ lib/admin/handlers/

# Regression tests pinned in test:all-validation (28 string-pinned assertions)
ls scripts/test-{auth,admin}-audit-coverage.ts

# P1.4 settings redaction + PUT merge guard (the round-trip fail-mode catch)
grep -nE "redactSensitiveSettings|mergeSettingsPreservingSecrets|anthropicApiKeyConfigured" lib/settings/

# P1.2 per-email rate limit + P1.3 fail2ban
grep -nE "checkUserRateLimit|clearUserRateLimit|EMAIL_LOGIN_LIMIT" lib/middleware/rate-limit.ts app/api/auth/login/route.ts

# P1.5 MCP embedded server fail-CLOSED
grep -nE "userContext required for resource access" lib/mcp/embedded-server.ts

# Real-data check: 7-day Activity table by type/action
ssh <PROD_USER>@<PROD_HOST> 'cd /var/www/paichart-app/current && source .env.production && psql "$DATABASE_URL" -c "SELECT type, action, COUNT(*) FROM \"Activity\" WHERE \"createdAt\" > NOW() - INTERVAL '"'"'7 days'"'"' GROUP BY type, action ORDER BY COUNT(*) DESC LIMIT 20;"'
```

Related: `cline_docs/reviews/expected-client-id-wiring-2026-05-24/` (Steve's todo, 6-specialist plan, blocked on DCR storage decision), `cline_docs/follow-ups/activity-retention-365d-soc2-2026-05-24.md` (SOC 2 12-month evidence requirement).

---


---

