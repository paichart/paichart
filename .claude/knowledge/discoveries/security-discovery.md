# Security Discovery Task

**Last Updated**: 2026-06-12 (Symmetric JWT secrets fully retired; verifyApiKey/hashSecret orphans deleted)
**Status**: Enhanced v3.2 - Post-RS256-only auth model
**Confidence**: Very High - Comprehensive security analysis + Plan 8 MCP-first architecture
**Last Validated**: 2026-06-12 - Full discovery run; all expectation blocks matched (2 findings: hashing.ts orphans, npm audit 25-high backlog)

> **AUTH MODEL NOTE (2026-06-06)**: Both symmetric JWT secrets are RETIRED — `JWT_SECRET`
> (2026-06-04) and `JWT_ACCESS_SECRET` (2026-06-06, `c9636035`/`a6c8d9a6`). Auth is **RS256-only
> end to end**; there are NO HS256 token mint/verify sites in the codebase. Any prose below that
> mentions HS256 secrets/paths is historical — the greps themselves remain correct (they now
> confirm zero-hit). Audit greps must be REPO-WIDE, not `lib/ app/`-scoped (the 2026-06-06
> retirement found two stragglers in top-level `middleware/` that scoped greps missed).

## 🆕 2026-06-25 — Harness output guards R9/R10 + their feature flags (LIVE in prod since 2026-06-29)

```bash
# R9 sanitizer + R10 redactor pure modules, call-sites, CI pins, and the env flags
grep -rln "sanitizeChainedOutput\|redactArtifactSecrets\|redactArtifactsForPersist" lib/ app/
grep -rn "CONNECTED_OUTPUT_SANITIZE_ENABLED\|ARTIFACT_SECRET_REDACT_ENABLED" lib/ app/ .env* scripts/test-security-invariants.ts
```
**Both flags are ON in prod since 2026-06-29** (`f7398004`) — the `=false` in `.env.example` / `.env.production.template` is the code default only.
R9 (`CONNECTED_OUTPUT_SANITIZE_ENABLED`) neutralizes untrusted connected-service output before pAIchart's reasoner; R10 (`ARTIFACT_SECRET_REDACT_ENABLED`) redacts secrets from persisted artifacts. Both **env-var, default-OFF in code** (see the prod-state note above) — these are *additive transforms* (a disable-flag on a real security *gate* would be a bypass; here OFF is fail-safe). R9 **enable-gate = C1** (detector false-positives — routed to prompt-construction + sec-ops). CI pins in `scripts/test-security-invariants.ts` §I/§J. Full ref: `.claude/knowledge/domain/harness/harness-output-guards.md`.

## 🆕 2026-07-26 — `services.call` gating: the approved-tools whitelist does NOT cover internal services

```bash
# The two-step order is the finding: internal services route and RETURN at 2.5a, BEFORE the
# policy gate at 2.5b. Expect 2.5a ~:141 (resolve) / :217 (routeCall + return), 2.5b :267.
grep -n "STEP 2.5a\|STEP 2.5b\|internalRouter.routeCall\|validateServiceCall(" lib/mcp/server/tools/hub/service-call-handler.js

# The static whitelist. Note 'fetch' is APPROVED (row: "Common API operations").
grep -n "'get', 'list', 'search'" lib/mcp/server/config/service-call-policy.js

# How an internal service is IDENTIFIED (endpoint prefix test — expect the doc line :5 + the
# startsWith check ~:215). The internal set is REGISTRY state, not code: check it live with
# services(action:'discover') and grep the endpoints. 3 in prod 2026-07-26 (project,
# kpi-service, recommendation-engine); the count is a live fact, do not trust it from here.
grep -rn "internal://" lib/mcp/server/tools/internal/InternalServiceRouter.js
```

**`internal://` services bypass `validateServiceCall` entirely.** `service-call-handler.js` resolves
the target at STEP 2.5a (`:141`), and for an internal service calls `internalRouter.routeCall` and
**returns** (`:217`) — the compliance policy at STEP 2.5b (`:267`) is only reached by EXTERNAL
services, as its own comment says. So neither the approved-tools whitelist nor the blocked-pattern /
blocked-URL checks apply to an internal service call.

**Harmless today** — the three internal services expose `project` / `perform` / KPI / recommendation
tools, none of which return artifact bodies. **The trap is the assumption**: "the approved-tools
whitelist covers us" is FALSE for internal services. Check this before adding a fourth internal
service, especially one that returns stored content.

**Related, and the reason this was looked at**: `fetch` IS in the static whitelist
(`service-call-policy.js:33`), so the policy gate would not block `services.call(tool:'fetch')`
against an EXTERNAL service either. What makes that safe today is that no registered service exposes
a `fetch` tool and none points back at pAIchart's own MCP (verified 2026-07-26 across all 15
registered services). Registration would not stop someone building it: `assertEndpointSafe`
(`service-registration-handler.js:271`) blocks private IPs / localhost / RFC-1918, but a PUBLIC
self-URL is not private. The real `fetch` is nonetheless POV-scoped —
`chatgpt-connector-handler.js:1301` scopes artifact reads by `execution.task.pov: povAccessFilter`,
so no cross-tenant read — but an agent WOULD reach its own execution's `result.json`, which carries
the raw pre-R9 `toolCalls`. That is a reasoner-bound path by the rule in
`sanitize-chained-output.ts`'s BOUNDARY note; it requires deliberate self-registration and does not
exist today. See `cline_docs/reviews/r9-option-b-2026-07-26/TRACE-CORRECTION.md`.

## 🆕 2026-07-26 — The `securityEvent` pino tag (a convention with a test-pinned NEGATIVE)

```bash
# Every emit site. Expect 14 files (2026-07-26): 4 lib/services + harness, the MCP hub/security
# handlers, 2 app/api routes. The tag marks an INTEGRITY VIOLATION on a security boundary.
grep -rln "securityEvent" lib/ app/ --include=*.ts --include=*.js

# The pinned NEGATIVE — a benign guard firing must NOT carry the tag.
grep -n "securityEvent" scripts/test-reactor-race-guard.ts lib/services/reactor-skip-counter.ts

# WHO CONSUMES IT — answer before adding a site (the answer today is: nothing).
grep -rn "securityEvent" ~/disaster-recovery/scripts/daily-summary.sh   # 1 hit, a COMMENT only
grep -rn "securityEvent" .claude/knowledge/   # incl. TODO-observability-and-diagnostics-roadmap.md
grep -n "storeSecurityEvent\|SECURITY_EVENT" lib/mcp/server/security/compliance-monitor.js
```
**Nothing consumes the boolean today** (verified 2026-07-26). The daily-summary email does **not**
count it — every real metric there anchors on a message string or `errorCode`, and the one
`securityEvent` hit is a comment. `ComplianceMonitor` is a **name collision**: it builds a local
object *called* `securityEvent` and writes an `Activity` row with `type:'SECURITY_EVENT'` — there is
no `SecurityEvent` Prisma model and it never reads the pino field. Alerting/log-viewer consumption is
unbuilt roadmap (`TODO-observability-and-diagnostics-roadmap.md` §112-144).

**Convention**: the tag means *integrity violation*, and is **deliberately withheld** from benign
guard firings — `logReactorBudgetSkip` omits it and that omission is test-pinned
(`scripts/test-reactor-race-guard.ts`). Before tagging a new site, ask whether it can fire routinely
on benign input; a routinely-firing tag desensitizes the channel operators use to find real attacks.
**Known exception (accepted 2026-07-26)**: the R9 site-A sanitizer warn (`agentic-tool-loop.ts`)
carries the tag even though a firing may be a C1 false positive — it is unclassifiable at emit time
and "a security boundary rewrote data" is true in both branches. Safe only while nothing consumes the
flag; **re-decide before wiring any `securityEvent`-filtered alert pipeline.**

## 🆕 2026-06-23 Session — Run These Greps FIRST (cross-tenant analytics leak class — `264e09c6` + `9c80d7a9`)
```bash
# LEAK CLASS: a tenant-scoped read gated only by `if (povId)` whose NO-povId branch builds an
# unscoped `where` → all-tenant aggregates (incl. user names/emails) to ANY authenticated non-admin.
# Hit 3 analytics domains (tasks/team/mcp) across two passes — the first fix missed siblings.
grep -rnE "if \(povId\)|\.\.\.\(povId && " app/api/analytics/domains/
# RULE: every no-povId path on a tenant resource MUST scope — getAccessiblePovIds(user)
# (lib/auth/accessible-pov-scope.ts) or buildPOVAccessFilter(user) (lib/pov/auth/pov-access-filter.ts);
# admin → global, else { in: accessibleIds }. Empty set → { in: [] } → zero rows (fail-CLOSED).

# FAIL-OPEN SMELL: `povIds?.length` in a where-builder — empty [] drops the filter → all-tenant.
grep -rn "povIds?.length" lib/ app/   # Expected: ZERO (9c80d7a9 → truthy `else if (povIds)`). Any hit = regression.

# IDOR: teamId / assigneeId accepted as a SOLE filter with no membership/access check (team domain, 9c80d7a9).
grep -rnE "if \(teamId\)" app/api/analytics/domains/
```

## 🆕 2026-05-27 Session — Run These Greps FIRST (identity exposure: demo+system hidden from lists `fa4a1954`)

```bash
# Demo + system/super-admin identities (emails) must not surface in team/assignee pickers.
# NON_SELECTABLE_ROLES = ['DEMO_USER','SUPER_ADMIN'] + @paichart.system email suffix (isNonSelectableUser) gate it (team-member-guard.ts; suffix added 2026-06-04 — role-only missed plain-USER/ADMIN service accounts).
# Severity-by-audience: pre-fix, those emails were enumerable by ANY authenticated viewer.
grep -rn "NON_SELECTABLE_ROLES\|findBlockedTeamMemberIds" lib/ app/ --include="*.ts"

# PII retirement: <maintainer-email> deleted (reassign→clear→delete). Demo rows hard-deleted
# after 30d idle — DEMO_USER ONLY. Confirm protected accounts + retention window:
grep -nE "PROTECTED_EMAILS|retentionDays|role: 'DEMO_USER'" scripts/cleanup-demo-users.ts
```

```bash
# STANDING CI GATE locks the pentest wins (SSRF/MA-1/M-2/JWT-alg/M-1) — extend it when touching security:
grep -nE "validateUrlSafety|sanitizePovMetadata|parseEnumParam|algorithms|status: 401" scripts/test-security-invariants.ts
# Error-handling class (M-1/M-2): unvalidated input → unhandled throw → 500. Guards/helpers:
grep -rn "parseEnumParam\|sanitizePovMetadata" lib/ app/ --include="*.ts"
grep -nE "verifyAccessToken\(token\)|INVALID_TOKEN|status: 401" lib/api-handler.ts | head
```

Refs: `fa4a1954`, `d4fb0b0f`/`de67ec94`; public demo privacy statement in `paichart` repo (`b919f55`); standing CI gate `scripts/test-security-invariants.ts` (M-1/M-2/MA-1/SSRF/JWT); G-1..G-4 in `TODO-pentest-panel-hardening-2026-05-27.md`. Memories: `project_team_membership_exclusion`, `project_demo_privacy_statement`.

---

## 🆕 2026-05-26 Session — Run These Greps FIRST (role-permission Option C)

```bash
# CACHE-KEY ESCALATION CLASS: checkPermission's User param needs {id, role}. A raw TokenPayload
# has .userId (not .id) → id=undefined → role-blind colliding permission-cache key → cross-role
# escalation (ADMIN priming true grants DEMO true for 5 min). Confirm callers map userId→id:
grep -rn "checkPermission(" lib/ app/ --include="*.ts" --include="*.js" | grep -vE "export|function checkPermission|checkPermissions\("

# Permission cache MUST be flushed on role-permission change (admin PUT) else 5-min stale window:
grep -nE "permissionCache.clear|invalidateUserPermissions" app/api/admin/permissions/route.ts lib/auth/cache.ts

# IDOR fix (Batch A d5b4d7ee): phase-create + assignee now use validatePOVAccess. checkPermission
# DISCARDS resource.ownerId/teamId (instance scoping is dead) — any caller passing them expecting
# scoping is broken. checkPermission fails CLOSED on error/missing-row (verified).
grep -rn "checkPermission" lib/pov/handlers/ lib/tasks/handlers/ --include="*.ts"
```

Ref: `cline_docs/reviews/role-permission-option-c-2026-05-25/sec-ops-review.md`.

---

## 🆕 2026-05-24 Session — Run These Greps FIRST

This session shipped P1 (stop hackers) + P2 (visibility) tracks. Surface the changes via:

```bash
# Perimeter (P1.1 + cf-aop): UFW :443→CF CIDRs only + nginx mTLS + cron + fail2ban
ls infra/{ufw,nginx,cron,fail2ban}/   # 4 manual-deploy ops config dirs
grep -nE "TRUSTED_PROXY" ecosystem.config.js lib/middleware/rate-limit.ts

# Client-IP identity (L6 fix 2026-06-13): lib/utils/client-ip.ts getClientIP is the
# SINGLE SOURCE for client IP (rate-limit gating + NextRequest audit logs). Precedence:
# CF-Connecting-IP (non-spoofable — UFW :443 is CF-locked, CF overwrites the header) →
# XFF/x-real-ip ONLY if TRUSTED_PROXY set (BC54, unset in prod) → request.ip||'direct'.
# Pre-fix, TRUSTED_PROXY-unset collapsed all IP-keyed limiters into ONE global bucket.
# Separate by design: oauth-flow-routes.ts clientIp() is the Express/audit twin (see L6).
grep -n "cf-connecting-ip" lib/utils/client-ip.ts          # expect the primary-source line
grep -rln "from '@/lib/utils/client-ip'" lib app middleware --include="*.ts"  # ~14 limiter/audit consumers (incl top-level middleware/)
ssh <PROD_USER>@<PROD_HOST> 'ufw status numbered | head -10; grep -A2 paichart-auth /etc/fail2ban/jail.local'

# Login defense (P1.2 + P1.3)
grep -nE "checkUserRateLimit|EMAIL_LOGIN_LIMIT|clearUserRateLimit" lib/middleware/rate-limit.ts app/api/auth/login/route.ts

# DB-level audit (P2.2 auth + P2.4 admin)
grep -rnE "void trackActivity|'AUTHENTICATION'|'USER_MANAGEMENT'|'ROLE_MANAGEMENT'|'PERMISSION_CHANGE'|'JWT_STATUS'|'AUDIT_LOG'|'ARTIFACT_CLEANUP'" app/api/auth/ app/api/admin/ lib/admin/handlers/
ls scripts/test-{auth,admin}-audit-coverage.ts   # 28 regression assertions wired into test:all-validation

# Settings redaction (P1.4) + MCP fail-CLOSED (P1.5)
grep -nE "redactSensitiveSettings|mergeSettingsPreservingSecrets|anthropicApiKeyConfigured" lib/settings/
grep -nE "userContext required for resource access|buildPOVAccessFilter" lib/mcp/embedded-server.ts

# ChatGPT DCR /oauth/register redirect_uris fix (2026-05-24)
grep -nE "isChatGPT|connector/oauth|connector_platform_oauth_redirect" lib/mcp/server/routes/oauth-flow-routes.ts

# Monitoring (P2.1 fixed; P2.3 daily-summary local-VM doc'd; dead-mans-switch on prod)
cat infra/cron/paichart-monitors.cron       # SHELL=bash + ( ) wrapping fix
ls scripts/dead-mans-switch.sh               # P2.3 — alerts if local-VM silent >36h
```

**Related artifacts**: `cline_docs/reviews/expected-client-id-wiring-2026-05-24/` (6-specialist plan, 96% post-edit projection — but DCR allowlist storage doesn't exist; see plan §self-audit). `cline_docs/follow-ups/` — many new HIGH/MED/LOW items filed this session.

**Trust gap NOTE (re-validate before citing)**: the "Phase 2.0 Security Foundation Context" section below claims token blacklist, AES-256-GCM cache encryption, and "comprehensive audit system" — original sec-ops audit (2026-05-19) confirmed these claims are NOT in production code. Treat as aspirational doc, not deployed state.

---

## Objective
Perform a comprehensive security audit of the pAIchart platform, examining authentication systems, authorization mechanisms, API security, vulnerability assessment, and security best practices implementation.

## Context
Security is the foundation of trust in any platform. This discovery provides deep analysis of authentication flows, authorization patterns, security vulnerabilities, threat vectors, and compliance with security best practices. It identifies both strengths and critical gaps in the security posture.

**Phase 2.0 Security Foundation Context**: The system has implemented comprehensive security enhancements including:
- Token blacklist system with real-time invalidation (CVSS 9.3 vulnerability prevention)
- AES-256-GCM cache encryption for all cached tokens
- Comprehensive security audit system with event tracking
- Multi-layer security defense preventing 5 critical vulnerabilities (CVSS 6.2-9.3)
- Real-time security event broadcasting and monitoring

**Plan 8 Foundational Security Context**: MCP-first security architecture implementing:
- Tool security boundaries (4 public, 31+ authenticated, 3 admin tools)
- Service call authorization with triple validation (ownership, admin, public)
- Public discovery filtering (hides 8+ sensitive fields)
- Rate limiting tiers (100/min public, 1000/min authenticated, 10/min services)
- Audit logging for SERVICE_CALL and UNAUTHORIZED_SERVICE_ACCESS events
- Philosophy: "Security enables, doesn't constrain" - features inherit protection

## Discovery Scope

### 1. Authentication System Analysis
- [ ] JWT token implementation and security
- [ ] Token lifecycle and expiration management
- [ ] Authentication middleware effectiveness
- [ ] Session management and cookie security
- [ ] Multi-factor authentication implementation
- [ ] Password policies and enforcement
- [ ] **MCP Tool Security Architecture** (December 2025):
  - **Guide**: `/.claude/knowledge/domain/mcp/tool-permission-management.md`
  - Three-tier model: PUBLIC (8 tools), AUTHENTICATED (20 tools), ADMIN (3 tools)
  - Two-layer enforcement: Method-level + Tool-level validation
  - Security files: `/lib/mcp/server/config/tool-security.js`, `mcp-server-http-clean.js` lines 3065-3074
  - Audit: Tool categorization correctness, enforcement verification, permission escalation risks

### 2. Authorization & RBAC Assessment

**CRITICAL UPDATE (2025-11-07)**: Dual authorization model in use

**Two Systems** (both valid, complementary):
1. **validatePOVAccess** (ownership-based) - Resource-level operations
2. **checkPermission** (role-based) - System-level operations

**Pattern Reference**: `/.claude/knowledge/patterns/authorization-dual-layer-pattern.md`

**Discovery Commands** ⭐ ENHANCED (Nov 26, 2025):

- [ ] **4-Pattern POV Protection Detection** (prevents 60% false positive rate):
  ```bash
  # CRITICAL: Check ALL 4 patterns before flagging as vulnerable

  # Pattern 1: withPOVAccess middleware (route-level)
  echo "=== Pattern 1: withPOVAccess Middleware ==="
  grep -r "export const.*= withPOVAccess\|withPOVAccess(async" app/api/pov --include="*.ts" -l | wc -l

  # Pattern 2: requirePermission middleware (route-level)
  echo "=== Pattern 2: requirePermission Middleware ==="
  grep -r "requirePermission.*ResourceType\.PoV" app/api/pov --include="*.ts" -l | wc -l

  # Pattern 3: Handler-level protection (service-level) ⚠️ CRITICAL - Often missed!
  echo "=== Pattern 3: Handler-Level Protection ==="
  for file in $(find app/api/pov -name "route.ts"); do
    has_handler=$(grep -c "Handler(" "$file" 2>/dev/null || echo 0)
    if [ "$has_handler" -gt 0 ]; then
      handler=$(grep "Handler(" "$file" | head -1 | grep -oE "[a-zA-Z]+Handler")
      echo "  Route: $file → Handler: $handler"
      echo "    Check lib/pov/handlers/ for validatePOVAccess or checkPermission"
    fi
  done

  # Verify which handlers have POV checks
  echo "  Handlers with POV validation:"
  grep -l "validatePOVAccess\|checkPermission.*PoV" lib/pov/handlers/*.ts 2>/dev/null

  # Pattern 4: Manual validatePOVAccess in routes
  echo "=== Pattern 4: Manual validatePOVAccess ==="
  grep -r "validatePOVAccess(user, pov\|validatePOVAccess(authUser" app/api/pov --include="*.ts" -l | wc -l

  # COMPREHENSIVE: Find truly unprotected routes
  echo "=== TRULY UNPROTECTED ROUTES ==="
  for file in $(find app/api/pov -name "route.ts"); do
    has_any=$(grep -c "withPOVAccess\|requirePermission\|Handler(\|validatePOVAccess" "$file" 2>/dev/null || echo 0)
    if [ "$has_any" -eq 0 ]; then
      # Double-check for user scoping (list endpoints)
      has_scoping=$(grep -c "ownerId.*user\.userId\|team.*members.*userId: user\.userId" "$file" 2>/dev/null || echo 0)
      if [ "$has_scoping" -eq 0 ]; then
        echo "❌ CRITICAL: $file - NO PROTECTION"
      else
        echo "⚠️ REVIEW: $file - User-scoped query (verify sufficient)"
      fi
    fi
  done

  # Expected: <5 routes (utilities, deprecated, or legitimately public)
  ```

- [ ] **Map validatePOVAccess usage** (ownership-based):
  ```bash
  grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l | grep -v "node_modules" | grep -v "cline_docs"
  # Expected: 30+ files (POV-scoped operations)
  ```

- [ ] **Map checkPermission usage** (role-based):
  ```bash
  grep -r "checkPermission" lib/ app/ --include="*.ts" | grep -v "import" | grep -v "export function" | grep "await.*checkPermission"
  # Expected: ~5-8 calls (system-level operations)
  ```

- [ ] **Detect dual-layer patterns**:
  ```bash
  for file in $(grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l); do
    if grep -q "await.*checkPermission" "$file"; then
      echo "DUAL: $file"
    fi
  done
  # Expected: 0 (consistent single-layer model)
  ```

- [ ] **Verify POV query completeness**:
  ```bash
  ./scripts/audit-pov-access-completeness.sh
  # Checks: ownerId, metadata, team.members present
  # Expected: 0 issues
  ```

- [ ] Role-based access control implementation
- [ ] Permission system architecture
- [ ] Resource ownership validation
- [ ] Team-based access controls
- [ ] Admin and super-admin privileges
- [ ] Permission caching and performance

### 3. Input Validation Framework (NEW - Plan 6/7)
- [ ] Zod schema enforcement coverage
- [ ] Injection prevention patterns (SQL/XSS/Path)
- [ ] MCP action whitelisting (ALLOWED_MCP_ACTIONS)
- [ ] Request size limits and DoS prevention
- [ ] Validation bypass detection
- [ ] Security violation logging and tracking
- [ ] Validated data usage consistency
- [ ] Hub service registration validation

### 4. API Security Audit
- [ ] Authentication requirement coverage
- [ ] Input validation framework integration
- [ ] Rate limiting implementation
- [ ] CORS configuration security
- [ ] Security headers enforcement
- [ ] Error handling and information disclosure
- [ ] MCP tool auth context enforcement

### 5. Vulnerability Assessment
- [ ] SQL injection protection via validation
- [ ] Cross-site scripting (XSS) prevention
- [ ] Cross-site request forgery (CSRF) protection
- [ ] Path traversal vulnerabilities
- [ ] Command injection risks
- [ ] Dependency vulnerabilities
- [ ] Validation framework bypasses

### 6. Security Configuration Review
- [ ] Environment variable security
- [ ] Configuration bypass patterns
- [ ] Secret management practices
- [ ] Encryption implementation
- [ ] Cryptographic algorithm usage
- [ ] Security monitoring and logging

## Search Strategies

### 1. Authentication System Discovery
```bash
# JWT Implementation Analysis
echo "=== JWT Security Analysis ==="
echo "JWT library usage:"
grep -r "jose\|jsonwebtoken" --include="*.ts" --include="*.js" | wc -l

echo "JWT signing analysis:"
grep -r "HS256\|RS256\|ES256" --include="*.ts" | head -5

echo "Token expiration patterns:"
grep -r "exp\|expir.*time\|maxAge" --include="*.ts" | head -5

echo "JWT secret analysis:"
grep -r "JWT.*SECRET\|jwt.*secret" --include="*.ts" --include="*.env*" | head -5

# Phase 2: RS256/JWKS Implementation (Added 2026-01-21)
echo -e "\n=== Phase 2: RS256/JWKS Security ==="
echo "JWKS endpoint:"
cat app/api/auth/jwks/route.ts

echo "RS256 token signing:"
grep -A 20 "signAccessToken\|signRefreshToken" lib/auth/token-manager.ts

echo "RS256 key management:"
grep -r "JWT_PRIVATE_KEY_BASE64\|JWT_PUBLIC_KEY_BASE64\|JWT_KEY_ID" --include="*.ts" --include="*.js"

echo "Trust level token gating:"
grep -A 10 "TOKEN_RECEIVING_TRUST_LEVELS\|TEAM_MEMBER" lib/services/workflow/security/trust-level.js

echo "Audit logging:"
grep -A 20 "logTrustDenial" lib/services/workflow/security/trust-level.js

echo "Rate limiting:"
grep -A 5 "jwksLimiter" lib/middleware/rate-limit.ts app/api/auth/jwks/route.ts

# Authentication Middleware Analysis
echo -e "\n=== Authentication Middleware ==="
find . -name "*auth*" -name "*.ts" | grep -v node_modules | head -10

echo "Authentication checks:"
grep -r "authenticate\|auth.*middleware" --include="*.ts" | wc -l

echo "Token verification patterns:"
grep -r "verify.*token\|jwtVerify" --include="*.ts" | wc -l

echo "Cookie security patterns:"
grep -r "httpOnly\|secure.*cookie\|sameSite" --include="*.ts" | wc -l
```

### 2. Authorization & RBAC Discovery  
```bash
# RBAC Implementation Analysis
echo "=== RBAC & Authorization Analysis ==="
echo "Role definitions:"
grep -r "enum.*Role\|UserRole\|ADMIN\|USER" --include="*.ts" | wc -l

echo "Permission checks:"
grep -r "checkPermission\|hasPermission\|canAccess" --include="*.ts" | wc -l

echo "Resource ownership patterns:"
grep -r "isOwner\|ownerId\|resource.*owner" --include="*.ts" | wc -l

echo "Team-based access:"
grep -r "isTeamMember\|team.*access\|teamId" --include="*.ts" | wc -l

echo "Super admin bypasses:"
grep -r "SUPER_ADMIN\|superadmin\|admin.*bypass" --include="*.ts" | wc -l

# Permission Caching Analysis
echo -e "\n=== Permission Caching ==="
echo "Cache implementations:"
grep -r "permission.*cache\|cache.*permission" --include="*.ts" | wc -l

echo "Cache invalidation:"
grep -r "invalidate.*permission\|permission.*invalidate" --include="*.ts" | wc -l
```

### 3. API Security Assessment
```bash
# API Route Security Analysis
echo "=== API Security Assessment ==="
echo "Total API routes:"
find app/api -name "route.ts" | wc -l

echo "Protected routes (with auth):"
find app/api -name "route.ts" -exec grep -l "auth\|authenticate\|token\|verify" {} \; | wc -l

echo "Unprotected routes:"
echo "⚠️ CRITICAL: Unprotected API Routes:"
for route in $(find app/api -name "route.ts"); do
  if ! grep -q "authenticate\|auth\|session\|token\|verify\|jwt" "$route"; then
    echo "❌ $route"
  fi
done

echo -e "\n=== Input Validation Analysis ==="
echo "Zod validations:"
grep -r "zod\|z\." --include="*.ts" | wc -l

echo "Schema validations:"
grep -r "parse\|parseAsync\|safeParse" --include="*.ts" | wc -l

echo "Input sanitization:"
grep -r "sanitize\|escape\|clean" --include="*.ts" | wc -l
```

### 4. Security Headers & Middleware
```bash
# Security Headers Analysis
echo "=== Security Headers Analysis ==="
echo "Helmet.js usage:"
grep -r "helmet" --include="*.ts" --include="*.js" | wc -l

echo "CORS configuration:"
grep -r "cors\|origin" --include="*.ts" | wc -l

echo "Security headers:"
grep -r "X-Frame-Options\|Content-Security-Policy\|X-XSS-Protection\|Strict-Transport-Security" --include="*.ts" | wc -l

echo "Rate limiting:"
grep -r "rate.*limit\|ratelimit\|throttle" --include="*.ts" | wc -l

# HTTPS and Cookie Security
echo -e "\n=== HTTPS & Cookie Security ==="
echo "Secure cookie configuration:"
grep -r "secure.*true\|httpOnly.*true" --include="*.ts" | wc -l

echo "SameSite cookie settings:"
grep -r "sameSite" --include="*.ts" | wc -l

echo "HTTPS enforcement:"
grep -r "https\|ssl\|tls" --include="*.ts" | wc -l
```

### 5. Vulnerability Assessment
```bash
# SQL Injection Protection
echo "=== SQL Injection Assessment ==="
echo "Parameterized queries:"
grep -r "prisma\.\\\$executeRaw\|prisma\.\\\$queryRaw" --include="*.ts" | wc -l

echo "Raw SQL usage:"
grep -r "\\\$executeRaw\|\\\$queryRaw" --include="*.ts" | head -5

echo "String interpolation in queries:"
grep -r "prisma.*\\\${.*}" --include="*.ts" | head -5

# XSS Protection Analysis
echo -e "\n=== XSS Protection Assessment ==="
echo "Dangerous HTML usage:"
grep -r "dangerouslySetInnerHTML\|innerHTML" --include="*.tsx" --include="*.ts" | wc -l

echo "HTML sanitization:"
grep -r "sanitize.*html\|dompurify\|xss" --include="*.ts" | wc -l

# Prompt Injection Protection (Week 5)
echo -e "\n=== Prompt Injection Protection (Week 5) ==="
echo "Injection prevention library:"
grep -r "applyTemplateSafe\|detectPromptInjection" lib/ --include="*.ts" | wc -l

echo "Injection patterns:"
grep -r "INSTRUCTION_OVERRIDE\|ROLE_SWITCHING\|JAILBREAK\|SYSTEM_MANIPULATION" lib/security --include="*.ts" | wc -l

echo "Variable sanitization:"
grep -r "sanitizeTemplateVariable\|validateTemplateVariables" lib/ --include="*.ts" | wc -l

echo "ADMIN-ONLY authorization:"
grep -r "user.role.*ADMIN.*SUPER_ADMIN" app/api --include="*.ts" | wc -l

echo "Content-Security-Policy headers:"
grep -r "Content-Security-Policy\|CSP" --include="*.ts" | wc -l

# Command Injection Assessment  
echo -e "\n=== Command Injection Assessment ==="
echo "Shell command execution:"
grep -r "exec\|spawn\|system" --include="*.ts" --include="*.js" | grep -v node_modules | wc -l

echo "User input in commands:"
grep -r "exec.*\\\${.*}\|spawn.*\\\${.*}" --include="*.ts" | head -5
```

### 6. Dependency & Environment Security
```bash
# Dependency Security Analysis
echo "=== Dependency Security Analysis ==="
echo "Security audit results:"
npm audit --audit-level=high --json 2>/dev/null | jq '.vulnerabilities | length' || echo "Unable to audit"

echo "Critical vulnerabilities:"
npm audit --audit-level=critical --json 2>/dev/null | jq '.vulnerabilities | length' || echo "Unable to audit"

# Environment Variable Security
echo -e "\n=== Environment Variable Security ==="
for var in JWT_SECRET DATABASE_URL PAICHART_API_KEY; do
  echo "Checking $var security patterns:"
  usage_count=$(grep -r "$var" --include="*.ts" --include="*.js" | wc -l)
  bypass_count=$(grep -r "$var" --include="*.ts" --include="*.js" | grep -E "(bypass|skip|ignore|fallback)" | wc -l)
  echo "  Usage: $usage_count, Bypasses: $bypass_count"
done

echo -e "\n=== Secret Management Analysis ==="
echo "Hardcoded secrets (potential):"
grep -r "password.*=.*['\"].*['\"]" --include="*.ts" | head -3
grep -r "secret.*=.*['\"].*['\"]" --include="*.ts" | head -3
grep -r "key.*=.*['\"].*['\"]" --include="*.ts" | head -3
```

### 6.1. Input Validation Framework Analysis (NEW - Plan 6/7)
```bash
# CRITICAL: Comprehensive Input Validation Framework
echo "=== Input Validation Framework (Plan 6/7 Implementation) ==="
echo "Validation modules:"
ls -la lib/validation/ | grep -E "\.ts$"

echo -e "\n=== Zod Schema Enforcement ==="
echo "Validation framework usage:"
grep -r "InputValidationFramework\|ValidationSchemas\|ValidationPatterns" --include="*.ts" | wc -l

echo "MCP action validation:"
grep -r "validateMCPActionRequest\|ALLOWED_MCP_ACTIONS" --include="*.ts" | wc -l

echo "Hub validation:"
grep -r "validateMCPHubRequest\|MCPHubToolSchemas" --include="*.ts" | wc -l

# Injection Prevention Analysis
echo -e "\n=== Injection Prevention Patterns ==="
echo "SQL injection prevention:"
grep -r "NO_SQL_INJECTION" lib/validation --include="*.ts" | wc -l

echo "XSS prevention:"
grep -r "NO_SCRIPT_INJECTION" lib/validation --include="*.ts" | wc -l

echo "Path traversal prevention:"
grep -r "NO_PATH_TRAVERSAL" lib/validation --include="*.ts" | wc -l

# Validation Coverage Assessment
echo -e "\n=== Validation Coverage ==="
echo "Routes with validation:"
validation_routes=$(grep -r "validateMCPActionRequest\|validateMCPHubRequest\|ValidationSchemas\|validateRequestBody" app/api --include="*.ts" | cut -d: -f1 | sort -u | wc -l)
total_routes=$(find app/api -name "route.ts" | wc -l)
echo "Protected with validation: $validation_routes/$total_routes"

echo "Direct body parsing without validation (SECURITY RISK):"
grep -r "req\.json()" app/api --include="*.ts" | grep -v "validate" | head -5

# Text Validation Tiers (2025-10-15 Enhancement)
echo -e "\n=== Text Validation Tiers ==="
echo "SAFE_TEXT pattern (descriptions/prompts):"
grep -n "SAFE_TEXT:" lib/validation/input-validation-framework.ts | head -1

echo "COMMENT_TEXT pattern (human notes, @mentions):"
grep -n "COMMENT_TEXT:" lib/validation/input-validation-framework.ts | head -1

echo "SAFE_NAME pattern (identifiers):"
grep -n "SAFE_NAME:" lib/validation/input-validation-framework.ts | head -1

echo -e "\nUsage of validation tiers:"
echo "SAFE_TEXT usages: $(grep -r 'ValidationSchemas\.SAFE_TEXT' lib/validation --include="*.ts" | wc -l)"
echo "COMMENT_TEXT usages: $(grep -r 'ValidationSchemas\.COMMENT_TEXT' lib/validation --include="*.ts" | wc -l)"
echo "SAFE_NAME usages: $(grep -r 'ValidationSchemas\.SAFE_NAME' lib/validation --include="*.ts" | wc -l)"

# DoS Prevention
echo -e "\n=== DoS Prevention Measures ==="
echo "Request size limits:"
grep -r "50000\|10000.*limit\|size.*limit" lib/validation --include="*.ts" | head -5

echo "Rate limiting references:"
grep -r "rate.*limit\|throttle" --include="*.ts" | wc -l

# Security Event Logging
echo -e "\n=== Security Violation Tracking ==="
echo "Security violation logging:"
grep -r "securityIssues\|security.*violation\|SECURITY:" --include="*.ts" --include="*.js" | wc -l

echo "Validation error tracking:"
grep -r "validation\.errors\|validation failed" --include="*.ts" | wc -l

echo "Violation count tracking:"
grep -r "violationCount" lib/validation --include="*.ts" | wc -l
```

### 6.2. Content Filtering & Policy Enforcement (NEW - 2025-10-15)
```bash
echo "=== Content Filtering & Anthropic Compliance ==="
echo "Content filter policy module:"
ls -la lib/mcp/server/config/content-filter-policy.js 2>/dev/null || echo "Not found"

echo -e "\nProhibited content categories:"
grep -c "HARMFUL_INSTRUCTIONS\|PERSONAL_INFO\|MALICIOUS_CODE\|HATE_SPEECH" lib/mcp/server/config/content-filter-policy.js 2>/dev/null || echo "0"

echo "Harmful instruction patterns:"
grep -A 5 "HARMFUL_INSTRUCTIONS:" lib/mcp/server/config/content-filter-policy.js 2>/dev/null | grep "/" | wc -l

echo "PII detection patterns (SSN, credit cards):"
grep -A 3 "PERSONAL_INFO:" lib/mcp/server/config/content-filter-policy.js 2>/dev/null | grep "/" | wc -l

echo "Malicious code patterns:"
grep -A 8 "MALICIOUS_CODE:" lib/mcp/server/config/content-filter-policy.js 2>/dev/null | grep "/" | wc -l

echo -e "\nResponse filtering (outbound safety):"
grep -A 5 "RESPONSE_FILTERS:" lib/mcp/server/config/content-filter-policy.js 2>/dev/null | grep "/" | wc -l

echo "Content filter function:"
grep -n "function filterContent" lib/mcp/server/config/content-filter-policy.js 2>/dev/null

echo -e "\nContent filter usage:"
grep -r "filterContent\|validateServiceInteraction" --include="*.js" --include="*.ts" | wc -l
```

### 6.3. MCP Security Controls (NEW)
```bash
echo "=== MCP Security Implementation ==="
echo "MCP tools with auth context:"
grep -r "context\?\.user\|context\.user" lib/mcp --include="*.js" --include="*.ts" | wc -l

echo "Permission checks in MCP tools:"
grep -r "checkPermission\|canCreate\|canRead\|canUpdate" lib/mcp/server/tools --include="*.js" | wc -l

echo "JWT extraction in MCP:"
grep -r "extractJWT\|verifyToken" lib/mcp --include="*.js" --include="*.ts" | wc -l

echo -e "\n=== MCP Action Whitelisting ==="
echo "Whitelisted actions:"
grep -A30 "ALLOWED_MCP_ACTIONS" lib/validation/mcp-action-validation.ts | grep "'" | wc -l

echo "Action validation enforcement:"
grep -r "z\.enum(ALLOWED_MCP_ACTIONS)" --include="*.ts" | wc -l

echo "Unauthorized action prevention:"
grep -r "Invalid or unauthorized MCP action" --include="*.ts" | wc -l
```

### 6.4. MCP Token Forwarding Chain Security (Mar 2026)

> **2026-06-12 UPDATE**: All HS256 paths in this section are GONE — auth is RS256-only since
> 2026-06-06 (`JWT_ACCESS_SECRET` retired; the "4 auth paths" consolidated to 3 RS256 paths via
> `populateReqUser` in U2 2026-05-19). The HS256-referencing greps below now serve as zero-hit
> confirmations; treat any non-zero result as a regression.

```bash
echo "=== MCP Token Forwarding Chain ==="

echo "--- Three-Tier Fallback (ALL handlers, not just perform) ---"
echo "task-action-handler:"
grep -n "routeAction\|Tier 2\|Tier 3\|throw.*No authenticated" lib/mcp/server/tools/advanced/task-action-handler.js | head -5
echo "team-performance-handler:"
grep -n "routeAction\|Tier 2\|Tier 3\|throw.*No authenticated" lib/mcp/server/tools/advanced/analytics/team-performance-handler.js | head -5
echo "agent-results-handler:"
grep -n "routeAction\|Tier 2\|Tier 3\|throw.*No authenticated" lib/mcp/server/tools/advanced/agent-results-handler.js | head -5

echo "--- Token in req.user (4 auth paths) ---"
grep -n "token:" mcp-server-http-clean.js | grep "req.user\|oauthUser" | head -10

echo "--- Session context preserves token ---"
grep -n "user: req.user" mcp-server-http-clean.js | head -5

echo "--- resolveUserContext (per-request vs global fallback) ---"
grep -n "resolveUserContext\|CONTEXT FALLBACK" mcp-server-v5.js | head -5

echo "--- ContextEnricher synthesis (post-U2 2026-05-19: token DROPPED, azp ADDED) ---"
grep -nE "\btoken\b|\bazp\b|userId" lib/mcp/server/middleware/context-enricher.js | head -10
echo "isAuthenticated semantics shifted: checks userId not token (Phase D site #6)"

echo "--- apiClient per-call mint (post-U2 Phase D site #5) ---"
echo "Pre-U2 grep below should now return ZERO Bearer-forward callsites in api-client.js:"
grep -n "Bearer.*token\|userContext.*token" lib/mcp/server/utils/api-client.js | head -5
echo "Post-U2 mint pattern (should appear):"
grep -B 1 -A 12 "await mintMcpToken({" lib/mcp/server/utils/api-client.js

echo "--- Token TTL (common 401 root cause) ---"
echo "Canonical mint at lib/auth/token-manager.ts post-U2 Phase A:"
grep -n "ttlSeconds\|setExpirationTime" lib/auth/token-manager.ts | head -5
echo "Default: 900s (15min)"

echo "--- OAuth validator HS256 mint at mcp-oauth-validator.js:511-533 was DELETED (U2 Path B v3, 9b2c2d08, 2026-05-18) ---"
echo "Expect zero hits below — confirms cleanup landed:"
grep -n "jwt.sign" lib/auth/oauth/mcp-oauth-validator.js | head -3

echo "--- Admin auth fallback BLOCKED on writes ---"
grep -n "ADMIN_AUTH_BLOCKED\|blockAdminAuth\|write.*admin" lib/mcp/server/utils/api-client.js | head -5

echo "--- validatePOVAccess isDemo limitation ---"
grep -n "isDemo\|DEMO_USER" lib/auth/validate-pov-access.ts | head -5
```
**Pattern**: `/.claude/knowledge/patterns/identity-preserving-token-forwarding-pattern.md` (96% confidence)
**Security Note**: RS256 MCP tokens have 15-min TTL. Expired tokens forwarded via `apiClient` cause 401s. Fix: re-add MCP connector for fresh OAuth flow.
**Security Note (updated 2026-06-12)**: `isDemo` grants DEMO_USER **READ only** since the 2026-05-26 demo-write fix — writes require owner/team via `requireWrite` (`validate-pov-access.ts:140-142`); coverage enforced by CI gate `scripts/test-demo-write-coverage.ts`.
**Agent prompt-injection (Phase 0 static recon, 2026-06-12)**: NOT a launch blocker — agent MCP tool calls mint an RS256 token scoped to the *requesting user's own id+role* (`mcpService.ts:437`) and run through the same fail-closed `buildPOVAccessFilter` chokepoint as REST/MCP, so a fully-hijacked model cannot escalate cross-tenant. Full findings + sec-ops assessment + deferred opt-in live-harness plan: `.claude/knowledge/TODO-agent-prompt-injection-testing.md`. 2 defense-in-depth follow-ups: DI-1 (LOW, NOT exploitable today) embedded-server.ts:2322 `{role:'ADMIN'}` fallback for absent userContext — not externally reachable (no userId-less external subscription path) + mirrors a deliberate internal-read bypass in the sibling artifact method; recommended fix = make the bypass explicit (`if (userContext)` shape), not a throw. DI-2 DONE (mcpService.ts:444 log reworded).

### 6.3. Phase 2 Security Foundation Analysis
```bash
# PHASE 2.0: Token Blacklist System Analysis
echo "=== Phase 2.0: Token Blacklist Security System ==="
echo "Token blacklist implementation:"
ls -la ./lib/websocket/security/ 2>/dev/null || echo "Directory not found"
find ./lib/websocket/security -name "*.ts" 2>/dev/null | head -10

echo "Blacklist functionality analysis:"
grep -r "SecureTokenBlacklist\|tokenBlacklist" --include="*.ts" | wc -l

echo "Real-time invalidation patterns:"
grep -r "invalidat.*event\|blacklist.*event" --include="*.ts" | head -5

echo "Token hashing security:"
grep -r "hashToken\|sha256.*token" --include="*.ts" | head -3

# Cache Encryption Analysis
echo -e "\n=== AES-256-GCM Cache Encryption ==="
echo "Cache encryption implementation:"
ls -la ./lib/websocket/security/cache-encryption.ts 2>/dev/null || echo "File not found"

echo "Encryption patterns:"
grep -r "AES-256-GCM\|encrypt.*token\|decrypt.*token" --include="*.ts" | head -5

echo "Security config analysis:"
grep -r "SECURITY_CONFIG\|security.*config" --include="*.ts" | head -5

# Security Audit System
echo -e "\n=== Comprehensive Security Audit System ==="
echo "Audit logging implementation:"
ls -la ./lib/websocket/security/audit-logger.ts 2>/dev/null || echo "File not found"

echo "Security event tracking:"
grep -r "auditLog\|security.*event\|audit.*entry" --include="*.ts" | head -10

echo "CVSS vulnerability prevention:"
grep -r "CVSS\|vulnerability.*prevent\|security.*prevent" --include="*.ts" | head -5
```

### 6.4. Plan 8 Foundational Security (NEW - MCP-First Architecture)
```bash
# CRITICAL: Plan 8 Tool Security Boundaries
echo "=== Plan 8: Tool Security Implementation ==="
echo "Tool security config location:"
ls -la ./lib/mcp/server/config/tool-security.js

echo -e "\nTool boundary definitions:"
grep -A 5 "PUBLIC_TOOLS\|AUTHENTICATED_TOOLS\|ADMIN_TOOLS" ./lib/mcp/server/config/tool-security.js

echo -e "\nTool enforcement middleware:"
grep -n "enforceToolSecurity" ./lib/mcp/server/config/tool-security.js

echo -e "\nPublic tools count (should be 4):"
grep "PUBLIC_TOOLS" ./lib/mcp/server/config/tool-security.js -A 10 | grep "'" | wc -l

echo -e "\nAuthenticated tools count (should be 31+):"
grep "AUTHENTICATED_TOOLS" ./lib/mcp/server/config/tool-security.js -A 40 | grep "'" | wc -l

# Service Authorization & Audit
echo -e "\n=== Service Authorization & Audit Logging ==="
echo "Service authorization implementation:"
grep -n "checkServiceAccess" ./lib/mcp/server/tools/hub-tools-handler.js | head -5

echo -e "\nTriple validation checks (ownership, admin, public):"
grep -A 10 "checkServiceAccess" ./lib/mcp/server/tools/hub-tools-handler.js | grep -E "ownerId|role.*ADMIN|publicAccess"

echo -e "\nAudit logging for service calls:"
grep -r "auditServiceCall\|SERVICE_CALL\|UNAUTHORIZED_SERVICE_ACCESS" --include="*.js" | head -10

# Public Discovery Filtering
echo -e "\n=== Public Discovery Data Filtering ==="
echo "Public filter implementation:"
ls -la ./lib/mcp/server/tools/public-discovery-filter.js

# 2026-07-28: expectation re-baselined from "8+" to exactly 8. The count was 11
# until `filterPublicPromptData` was deleted (zero callers) — its 3 HIDDEN markers
# went with it. The old "8+" still passed, but only by sitting exactly on the
# boundary: one further deletion would have failed a check whose message reads as
# a SECURITY REGRESSION rather than doc drift. All 8 now come from
# filterPublicServiceData, which is live.
echo -e "\nFields hidden from public users (expect exactly 8, all in filterPublicServiceData):"
grep "// .* HIDDEN" ./lib/mcp/server/tools/public-discovery-filter.js | wc -l

# 2026-07-28: the `createPublicDiscoveryResponse` grep that stood here was DELETED,
# not updated. The function is gone (zero callers since the Jan 2026 Phase 3
# public-access removal), so the grep returned nothing — and a discovery grep that
# finds nothing reads as CLEAN, not as "the symbol no longer exists". That
# false-clean shape is the same one that let the §1b hub check pass while a cache
# bypassed the filter it was checking (2026-07-27).
#
# There is no public response builder to inspect any more: PUBLIC_TOOLS is empty,
# tool-security.js requires auth before any handler runs, and filterServiceArray is
# called with a hardcoded `true`. Verify that invariant instead of a dead symbol:
# Match a CALL or DEFINITION — `name(` — not any mention. A bare name grep counts
# the deletion tombstone's own prose and returns 2, which looks like a finding and
# is not one. (Caught by running this before writing it down.)
echo -e "\nPublic response builder should not exist (expect 0 calls/definitions):"
grep -rn "createPublicDiscoveryResponse(" ./lib/ 2>/dev/null | wc -l

echo -e "\nAuthentication status checks in discovery:"
grep "isAuthenticated" ./lib/mcp/server/tools/public-discovery-filter.js | wc -l

# Rate Limiting Implementation
echo -e "\n=== Rate Limiting by Authentication Tier ==="
echo "Rate limit configurations:"
grep -r "100.*min.*public\|1000.*min.*authenticated\|10.*service.*call" --include="*.js" --include="*.md" | head -5

echo -e "\nRate limiter implementation:"
grep -r "RateLimiterMemory\|rateLimiter\|incrementRateLimit" --include="*.js" --include="*.ts" | head -5

# Plan 8 Security Philosophy Check
echo -e "\n=== Plan 8 Foundational Security Summary ==="
echo "Philosophy: 'Security enables, doesn't constrain'"
echo ""
echo "Tool Boundaries:"
echo "- Public tools: $(grep PUBLIC_TOOLS ./lib/mcp/server/config/tool-security.js -A 10 2>/dev/null | grep "'" | wc -l || echo 'N/A')"
echo "- Authenticated tools: $(grep AUTHENTICATED_TOOLS ./lib/mcp/server/config/tool-security.js -A 40 2>/dev/null | grep "'" | wc -l || echo 'N/A')"
echo "- Admin tools: $(grep ADMIN_TOOLS ./lib/mcp/server/config/tool-security.js -A 5 2>/dev/null | grep "'" | wc -l || echo 'N/A')"
echo ""
echo "Data Protection:"
echo "- Fields hidden from public: $(grep '// .* HIDDEN' ./lib/mcp/server/tools/public-discovery-filter.js 2>/dev/null | wc -l || echo 'N/A')"
echo ""
echo "Security Events:"
grep -r "SERVICE_CALL\|UNAUTHORIZED_SERVICE_ACCESS" --include="*.js" | wc -l

# Endpoint URL Credential Leakage (Bug Class BC9)
echo -e "\n=== Endpoint URL Sanitization ==="
echo "sanitizeEndpointUrl usage (should be 8+ sites):"
grep -rn "sanitizeEndpointUrl" lib/mcp/server/ app/api/mcp/ --include="*.js" --include="*.ts" | wc -l
echo -e "\nUnsanitized endpoint extraction (potential leaks):"
grep -rn "configuration\?\.endpoint" lib/mcp/server/ --include="*.js" | grep -v sanitize | grep -v "//"

# Error Level Misclassification (Bug Class BC10)
echo -e "\n=== Error Level Classification ==="
echo "Potential misclassified errors (expected conditions at error level):"
grep -rn "log\.error" lib/mcp/server/ --include="*.js" | grep -iE "not.found|invalid|validation|parse|format" | head -10
```

### 6.6. Pino Structured Logging for Security Monitoring (NEW - Feb 2026)
```bash
echo "=== PINO SECURITY LOGGING ANALYSIS ==="
echo "--- authLogger Usage in Security Code ---"
grep -rn "authLogger\.\(info\|warn\|error\|debug\)" lib/auth/ lib/middleware/ app/api/auth/ --include="*.ts" --include="*.js" | head -20
echo "authLogger calls for authentication/authorization events"

echo -e "\n--- complianceLogger Usage ---"
grep -rn "complianceLogger\.\(info\|warn\|error\)" lib/ app/ --include="*.ts" --include="*.js" | head -15
echo "complianceLogger calls for audit trail events"

echo -e "\n--- Security Event Logging via apiLogger ---"
grep -rn "apiLogger\.\(warn\|error\)" lib/ app/ --include="*.ts" | grep -i "attack\|inject\|violation\|blocked\|unauthorized" | head -15
echo "Security violation logging via apiLogger"

echo -e "\n--- Domain Logger Imports in Security Code ---"
grep -rn "from.*lib/logger\|import.*logger" lib/auth/ lib/security/ lib/middleware/ --include="*.ts" | head -15
echo "Logger imports in security-related files"

echo -e "\n--- Legacy console.log in Security Code ---"
grep -rn "console\.\(log\|warn\|error\)" lib/auth/ lib/security/ lib/middleware/ --include="*.ts" | wc -l
echo "Legacy console.log calls in security code (should be zero)"

echo -e "\n--- Production Auth Domain Logs ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | jq" 2>/dev/null | tail -20

echo -e "\n--- Production Auth Errors (level 50) ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":50' | jq" 2>/dev/null | tail -10

echo -e "\n--- Production Security Warnings (failed logins, attacks) ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 500 --nostream | grep '\"level\":40' | grep -i 'inject\|attack\|unauthorized\|blocked\|violation' | jq" 2>/dev/null | tail -20

echo -e "\n--- Production Error Distribution by Domain ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 500 --nostream | grep '\"level\":50' | jq -r '.domain' | sort | uniq -c | sort -rn" 2>/dev/null
echo "Error distribution (auth/api errors may indicate attacks)"
```

**Questions to answer**:
- Is authLogger being used for login failures, token issues, and OAuth events?
- Is complianceLogger being used for audit trail events?
- Are security violations (injection attempts, unauthorized access) being logged with structured context?
- Are there remaining console.log calls in security code that should migrate to pino?
- Are auth domain logs flowing in production PM2 JSON output?
- Can production pino logs identify attack patterns (failed logins, injection attempts)?

---

### 7. Audit & Monitoring Analysis
```bash
# Security Logging Analysis
echo "=== Security Audit & Monitoring ==="
echo "Audit log implementations:"
grep -r "audit\|log.*security\|security.*log" --include="*.ts" | wc -l

echo "Failed authentication logging:"
grep -r "failed.*auth\|auth.*failed\|login.*fail" --include="*.ts" | wc -l

echo "Permission denied logging:"
grep -r "permission.*denied\|access.*denied\|forbidden" --include="*.ts" | wc -l

echo "Security event monitoring:"
grep -r "security.*event\|event.*security" --include="*.ts" | wc -l

# Activity Tracking
echo -e "\n=== Activity Tracking ==="
echo "User activity tracking:"
grep -r "trackActivity\|logActivity" --include="*.ts" | wc -l

echo "Permission check logging:"
grep -r "logPermissionCheck" --include="*.ts" | wc -l
```

### 8. Cryptographic Implementation Review
```bash
# Cryptography Analysis
echo "=== Cryptographic Implementation ==="
echo "Bcrypt usage for passwords:"
grep -r "bcrypt" --include="*.ts" --include="*.js" | wc -l

echo "Crypto library usage:"
grep -r "crypto\|encrypt\|decrypt\|hash" --include="*.ts" | wc -l

echo "Random generation:"
grep -r "random\|uuid\|nanoid" --include="*.ts" | wc -l

echo "Salt usage:"
grep -r "salt\|saltRounds" --include="*.ts" | wc -l

# Password Security
echo -e "\n=== Password Security ==="
echo "Password policies:"
grep -r "password.*policy\|password.*requirement" --include="*.ts" | wc -l

echo "Password validation patterns:"
grep -r "password.*pattern\|password.*regex" --include="*.ts" | wc -l

echo "Password strength validation:"
grep -r "strong.*password\|password.*strength" --include="*.ts" | wc -l
```

## Expected Outputs

### 1. Authentication Security Report
```
JWT Implementation:
- Algorithm: [HS256/RS256]
- Token expiration: Access [X minutes], Refresh [Y days]  
- Secret management: [Environment variables/Hardcoded]
- Cookie security: HttpOnly [Yes/No], Secure [Yes/No], SameSite [Setting]

Authentication Coverage:
- Middleware implementation: [Complete/Partial]
- Route protection: X/Y routes protected
- Token verification: [Proper/Issues found]
```

### 2. Authorization & RBAC Report
```
RBAC Implementation:
- Roles defined: [USER/ADMIN/SUPER_ADMIN]
- Permission system: [Resource-based/Role-based]
- Ownership checks: [Implemented/Missing]
- Team-based access: [Available/Not implemented]

Permission Performance:
- Caching enabled: [Yes/No]
- Cache invalidation: [Proper/Issues]
- Database queries: [Optimized/N+1 issues]
```

### 3. Input Validation Framework Report (NEW)
```
Validation Coverage:
- Routes with validation: X/Y (Z%)
- Zod schema enforcement: [Active/Partial/Missing]
- Direct body parsing bypasses: X instances
- Validated data usage: [Consistent/Gaps found]

Injection Prevention:
- SQL injection patterns blocked: [Yes/No]
- XSS injection patterns blocked: [Yes/No]
- Path traversal patterns blocked: [Yes/No]
- Security pattern detection: X patterns enforced

MCP Security:
- Whitelisted actions: X actions defined
- Action validation: [Enforced/Bypassed]
- Auth context in tools: X/Y tools protected
- Permission checks: X implementations

DoS Prevention:
- Request size limits: [50KB params/10KB metadata]
- Rate limiting: X implementations
- Resource exhaustion protection: [Yes/No]
```

### 4. Vulnerability Assessment Report
```
Critical Vulnerabilities:
- SQL Injection: [Protected via Zod/Vulnerable]
- XSS Protection: [Validation framework/Missing]
- CSRF Protection: [Yes/No]
- Command Injection: [Risks identified: X]
- Validation bypasses: X instances found

Security Headers:
- Helmet.js: [Configured/Missing]
- CORS: [Properly configured/Issues]
- CSP: [Implemented/Missing]
- HSTS: [Enabled/Disabled]
```

### 5. API Security Analysis
```
API Route Protection:
- Total routes: X
- Protected with auth: Y (Z%)
- Protected with validation: W (V%)
- Unprotected: [List of vulnerable endpoints]
- Input validation: [Framework enforced/Gaps identified]

Rate Limiting:
- Implementation: [Yes/No]
- Coverage: [Global/Per-route/Missing]
- DDoS protection: [Size limits + Rate limiting/Missing]

Security Logging:
- Validation failures tracked: X points
- Security violations logged: Y instances
- Audit trail: [Comprehensive/Partial]
```

## Key Questions to Answer

1. Are all API endpoints properly authenticated?
2. Is the JWT implementation secure and following best practices?
3. Does the RBAC system properly enforce permissions?
4. Are there any SQL injection or XSS vulnerabilities?
5. Are security headers properly configured?
6. Is input validation comprehensive across all endpoints?
7. Are secrets properly managed and not hardcoded?
8. Is security monitoring and audit logging implemented?
9. Are dependencies free from known security vulnerabilities?
10. Does the system follow security best practices?

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: Security Discovery
═══════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Authentication System Analysis
□ Section 2: Authorization & RBAC Assessment  
□ Section 3: API Security Audit
□ Section 4: Vulnerability Assessment
□ Section 5: Security Configuration Review
□ Section 6: Dependency & Environment Security
□ Section 7: Audit & Monitoring Analysis
□ Section 8: Cryptographic Implementation Review

Current Status: 🚀 Starting Security Discovery
Commands: 0/64 executed
Findings: 0 critical 🔴 | 0 high ⚠️ | 0 medium 🟡 | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Authentication [██████████] 100%
   Commands: 8/8 | Found: JWT HS256, 15min tokens, cookie security
🔄 Section 2: Authorization [███░░░░░░░] 30%
   Commands: 3/10 | Analyzing RBAC patterns...
```

## Security Risk Assessment Matrix

| Risk Category | Severity | Likelihood | Impact | Mitigation Priority |
|---------------|----------|------------|---------|-------------------|
| Unprotected API routes | Critical | High | System compromise | Immediate |
| Missing JWT secret | Critical | Medium | Authentication bypass | Immediate |
| SQL injection vulnerability | Critical | Medium | Data breach | Immediate |
| XSS vulnerability | High | High | User account compromise | High |
| Missing CSRF protection | High | Medium | State-changing attacks | High |
| Weak password policy | Medium | High | Account compromise | Medium |
| Missing security headers | Medium | High | Various attacks | Medium |
| Insufficient rate limiting | Medium | Medium | DoS attacks | Medium |
| Dependency vulnerabilities | Variable | Medium | Various impacts | Ongoing |
| Information disclosure | Low | Low | Data leakage | Low |

## Security Compliance Checklist

### Authentication Security ✅❌
- [ ] JWT tokens use secure algorithms (HS256 minimum)
- [ ] Token expiration properly configured
- [ ] Refresh token rotation implemented
- [ ] Secure cookie configuration (HttpOnly, Secure, SameSite)
- [ ] Password policies enforced
- [ ] Account lockout protection
- [ ] Multi-factor authentication available

### Authorization Security ✅❌  
- [ ] All API routes have authentication
- [ ] RBAC properly implemented and tested
- [ ] Resource ownership validation
- [ ] Principle of least privilege followed
- [ ] Admin/super-admin controls separated
- [ ] Permission caching secure and consistent

### Input Validation & Output Security ✅❌
- [ ] All user inputs validated
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS protection (output encoding, CSP)
- [ ] CSRF protection implemented
- [ ] File upload security controls
- [ ] Path traversal prevention

### Infrastructure Security ✅❌
- [ ] Security headers configured (Helmet.js)
- [ ] HTTPS enforced
- [ ] CORS properly configured
- [ ] Rate limiting implemented
- [ ] Environment variables secure
- [ ] Dependencies regularly updated
- [ ] Security monitoring and alerting

## Deliverables

1. **Security Assessment Report** - Comprehensive security posture analysis
2. **Vulnerability Register** - Prioritized list of security issues with fixes
3. **Authentication Flow Diagram** - Visual representation of auth mechanisms
4. **RBAC Permission Matrix** - Complete mapping of roles and permissions
5. **API Security Coverage Map** - Route-by-route security analysis
6. **Security Monitoring Dashboard** - Real-time security metrics
7. **Compliance Checklist** - Standards and regulations adherence
8. **Security Incident Response Plan** - Procedures for security events
9. **Penetration Testing Report** - Security testing results and recommendations
10. **Security Training Materials** - Developer security guidelines

### 6.5. Production Infrastructure Security Hardening (NEW - 2025-09-06)
```bash
# CRITICAL: Production Security Hardening Assessment
echo "=== Production Security Hardening Assessment (2025-09-06) ==="
echo "Production Server Status: <PROD_HOST> (paichart.app)"

echo -e "\n=== System-Level Security Status ==="
echo "SSH Connection Test:"
ssh -o ConnectTimeout=5 <PROD_USER>@<PROD_HOST> "uname -a && uptime" 2>/dev/null || echo "❌ SSH Connection Failed"

echo -e "\nSecurity Package Status:"
ssh <PROD_USER>@<PROD_HOST> "dpkg -l | grep -E '(fail2ban|certbot|unattended-upgrades)'" 2>/dev/null || echo "❌ Cannot check packages"

echo -e "\nKernel Security Status:"
ssh <PROD_USER>@<PROD_HOST> "uname -r && ls /var/run/reboot-required 2>/dev/null || echo 'No reboot required'" 2>/dev/null || echo "❌ Cannot check kernel"

# Network Security Assessment
echo -e "\n=== Network & Firewall Security ==="
echo "fail2ban Status:"
ssh <PROD_USER>@<PROD_HOST> "systemctl status fail2ban --no-pager -l | head -10" 2>/dev/null || echo "❌ Cannot check fail2ban"

echo -e "\nBanned IP Status:"
ssh <PROD_USER>@<PROD_HOST> "fail2ban-client status sshd | grep 'Currently banned'" 2>/dev/null || echo "❌ Cannot check banned IPs"

echo -e "\nfail2ban Configuration Check:"
ssh <PROD_USER>@<PROD_HOST> "test -f /etc/fail2ban/jail.local && echo '✅ Custom jail.local exists' || echo '❌ No custom config'" 2>/dev/null

# SSL/TLS Certificate Security
echo -e "\n=== SSL Certificate Security ==="
echo "SSL Certificate Status:"
ssh <PROD_USER>@<PROD_HOST> "certbot certificates 2>/dev/null | grep -E '(Certificate Name|Expiry Date)'" 2>/dev/null || echo "❌ Cannot check certificates"

echo -e "\nHTTPS Functionality Test:"
curl -I -k -m 5 https://paichart.app/health 2>/dev/null | head -3 || echo "❌ HTTPS test failed"

echo -e "\nSSL Certificate Files:"
ssh <PROD_USER>@<PROD_HOST> "ls -la /etc/letsencrypt/live/paichart.app/ | grep -E '(fullchain|privkey)'" 2>/dev/null || echo "❌ Cannot check cert files"

# Web Server Security Assessment
echo -e "\n=== Web Server Security Hardening ==="
echo "nginx Security Configuration:"
ssh <PROD_USER>@<PROD_HOST> "nginx -t 2>&1 | tail -2" 2>/dev/null || echo "❌ Cannot test nginx config"

echo -e "\nnginx Security Headers Test:"
curl -I -k -m 5 https://paichart.app/health 2>/dev/null | grep -E '(Strict-Transport|X-Frame|Content-Security|X-Content-Type)' | wc -l | awk '{print $1 " security headers found"}' || echo "❌ Cannot test headers"

echo -e "\nnginx Configuration Security:"
ssh <PROD_USER>@<PROD_HOST> "grep -E '(server_tokens|rate_limit|deny)' /etc/nginx/sites-available/paichart.app | wc -l" 2>/dev/null || echo "❌ Cannot check nginx security"

# Database Security Status
echo -e "\n=== Database Security Assessment ==="
echo "PostgreSQL Status:"
ssh <PROD_USER>@<PROD_HOST> "systemctl status postgresql --no-pager | head -3" 2>/dev/null || echo "❌ Cannot check PostgreSQL"

echo -e "\nDatabase User Test:"
ssh <PROD_USER>@<PROD_HOST> "PGPASSWORD='[REDACTED]' psql -U paichart -h localhost -d paichart_production -c 'SELECT version();' | head -2" 2>/dev/null || echo "❌ Cannot test database connection"

echo -e "\nDatabase Permissions:"
ssh <PROD_USER>@<PROD_HOST> "sudo -u postgres psql -c '\\du paichart' | grep paichart" 2>/dev/null || echo "❌ Cannot check user permissions"

# Security Monitoring Assessment
echo -e "\n=== Security Monitoring Status ==="
echo "Security Monitoring Script:"
ssh <PROD_USER>@<PROD_HOST> "test -x /usr/local/bin/security-monitor.sh && echo '✅ Security monitor exists and executable' || echo '❌ Security monitor missing'" 2>/dev/null

echo -e "\nSecurity Log Status:"
ssh <PROD_USER>@<PROD_HOST> "test -f /var/log/security-monitor.log && tail -3 /var/log/security-monitor.log || echo '❌ No security logs found'" 2>/dev/null

echo -e "\nCron Job Status:"
ssh <PROD_USER>@<PROD_HOST> "crontab -l | grep security-monitor || echo '❌ Security monitoring cron not found'" 2>/dev/null

# Application Security Status
echo -e "\n=== Application Security Status ==="
echo "PM2 Process Security:"
ssh <PROD_USER>@<PROD_HOST> "pm2 status | grep -E '(online|stopped|errored)'" 2>/dev/null || echo "❌ Cannot check PM2 status"

echo -e "\nPM2 Auto-startup:"
ssh <PROD_USER>@<PROD_HOST> "systemctl status pm2-root --no-pager | head -3" 2>/dev/null || echo "❌ Cannot check PM2 service"

echo -e "\nEnvironment Security:"
ssh <PROD_USER>@<PROD_HOST> "test -f /var/www/paichart-app/current/.env && echo '✅ Environment file exists' || echo '❌ Environment file missing'" 2>/dev/null

# Automatic Updates Status
echo -e "\n=== Automatic Security Updates ==="
echo "Unattended Upgrades Status:"
ssh <PROD_USER>@<PROD_HOST> "systemctl status unattended-upgrades --no-pager | head -3" 2>/dev/null || echo "❌ Cannot check auto-updates"

echo -e "\nUpdate Configuration:"
ssh <PROD_USER>@<PROD_HOST> "test -f /etc/apt/apt.conf.d/20auto-upgrades && cat /etc/apt/apt.conf.d/20auto-upgrades || echo '❌ Auto-update config missing'" 2>/dev/null

echo -e "\nPending Updates:"
ssh <PROD_USER>@<PROD_HOST> "apt list --upgradable 2>/dev/null | wc -l" 2>/dev/null || echo "❌ Cannot check updates"

# Security Assessment Summary
echo -e "\n=== Production Security Summary ==="
echo "Security Hardening Implementation Date: 2025-09-06"
echo "Security Score: 95/100 (Enterprise-Grade)"
echo ""
echo "Critical Security Files:"
echo "- Security Monitor: /usr/local/bin/security-monitor.sh"
echo "- Security Logs: /var/log/security-monitor.log"
echo "- fail2ban Config: /etc/fail2ban/jail.local"
echo "- nginx Security: /etc/nginx/sites-available/paichart.app"
echo "- SSL Certificates: /etc/letsencrypt/live/paichart.app/"
echo "- Security Checklist: /root/security-checklist.txt"
echo ""
echo "Maintenance Schedule:"
echo "- Every 15min: Security monitoring execution"
echo "- Daily 02:00: Security updates with conditional reboot"
echo "- Weekly: Log rotation"
echo "- Monthly: SSL certificate renewal verification"
```

## Success Criteria

- ✅ Zero critical security vulnerabilities in production
- ✅ 100% API route authentication coverage
- ✅ JWT implementation following security best practices
- ✅ Comprehensive RBAC with proper access controls
- ✅ All security headers properly configured
- ✅ Input validation coverage >95%
- ✅ Security monitoring and audit logging complete
- ✅ Dependency vulnerabilities addressed
- ✅ Security compliance checklist 100% complete
- ✅ Penetration testing passed with no critical findings
- ✅ **Production infrastructure security hardening complete (2025-09-06)**
- ✅ **Enterprise-grade security monitoring active (95/100 security score)**
- ✅ **SSL/TLS certificates automated with 90-day lifecycle**
- ✅ **Network intrusion prevention active (fail2ban + VPC firewall)**
- ✅ **Daily security threat intelligence reporting (2025-09-30)**
- ✅ **Automated anomaly detection with 0-10 risk scoring (2025-09-30)**
- ✅ **Attack surface analysis across 5 threat categories (2025-09-30)**

## Daily Security Monitoring System (Enhanced 2025-09-30, accuracy fix 2026-05-24)

### Security Threat Intelligence
**Daily automated security report** provides comprehensive 24-hour threat analysis.

**ARCHITECTURE NOTE (2026-05-24 P2.3)**: this script lives on Steve's LOCAL VM,
not on the prod server. The path below is the local-VM path. Cron also runs
on the local VM at `0 6 * * *`. Resilience: prod-side
`scripts/dead-mans-switch.sh` runs at 07:00 UTC and emails an alert via
Brevo if the local VM hasn't successfully sent the daily summary in >36h
(catches "VM off / sleeping / network-isolated" without duplicating the
73KB local report). Closes the 2026-05-19 sec-ops audit Net-new #1
"fictional infrastructure" finding.

```bash
# Security monitoring script with intelligence — LOCAL VM, not prod
/home/steve/disaster-recovery/scripts/daily-summary.sh

# Key capabilities
- 15 security metrics tracked across 5 categories
- Intelligent anomaly detection (0-10 risk scoring)
- Auto-generated remediation recommendations
- Attack pattern recognition (SQL injection, XSS, path traversal)
- fail2ban analytics (ban/unban activity tracking)
- System integrity monitoring (unauthorized changes)
```

### Attack Vector Categories Monitored
1. **Authentication Attacks**: SSH brute force, invalid users, unauthorized access
2. **Web Application Attacks**: SQL injection, XSS, path traversal
3. **Reconnaissance**: Security scanner detection, bot activity
4. **Intrusion Prevention**: fail2ban effectiveness tracking
5. **System Integrity**: New users, package changes, privilege escalation

### Anomaly Detection Thresholds
```bash
# Risk scoring triggers (daily-summary.sh:156-197)
Failed SSH > 50/day:        +2 points (HIGH)
fail2ban bans > 20/day:     +3 points (CRITICAL)
SQL/XSS > 5 attempts:       +3 points (CRITICAL)
HTTP 5xx > 100/day:         +2 points (HIGH)
New user accounts:          +4 points (CRITICAL)
Invalid users > 20:         +1 point  (MEDIUM)
Path traversal > 5:         +2 points (HIGH)
Security scanners > 5:      +1 point  (MEDIUM)
```

## Step 9: Sensitive Field Exposure Check

Verify sensitive fields are never exposed in API responses:

```bash
echo "=== SENSITIVE FIELD EXPOSURE ==="
echo "--- Prisma Selects with Sensitive Fields ---"
grep -rn "password.*true\|resetToken.*true\|verificationToken.*true\|twoFactorSecret.*true" lib --include="*.ts"
echo "Should all be 'false' or excluded"

echo "--- Plaintext Credentials ---"
grep -r "apiKey.*:\s*['\"]sk-\|secret.*:\s*['\"]" app lib --include="*.ts" | grep -v "Hash\|Encrypted\|process.env"
echo "Should find none (or only env vars)"

echo "--- Crypto Infrastructure ---"
ls lib/crypto/*.ts 2>/dev/null
grep -n "hashApiKey" lib/crypto/*.ts
# 2026-06-12: hashSecret + verifyApiKey deleted as zero-caller orphans (Axis 6);
# hashApiKey is the sole surviving export (caller: app/api/admin/settings/llm/route.ts)

echo "--- API Key Exposure in Responses ---"
grep -r "apiKey.*:" app/api --include="*.ts" -A 2 | grep -v "apiKeySet\|apiKeyHash"
echo "Should only find 'apiKeySet' booleans"
```

### When to Reference This Discovery
- Security monitoring enhancement requests
- Attack pattern analysis
- Threat intelligence integration
- Security reporting customization
- Anomaly detection threshold tuning
- Incident response automation
- Sensitive field validation checks

---

## BC71 detection (Untrusted Input in Response-Text Interpolation, 2026-05-22)

When investigating XSS, response sanitization, or "what fields could carry user input back to MCP clients":

### Two-axis grep (axis 1: helpers, axis 2: inline)

```bash
# Axis 1: well-known echo sites in error-helpers
grep -rE 'new Error\(`.*\$\{(searchTerm|name|title|provided|action)' \
  lib/mcp/server/tools/*/error-helpers.js

# Axis 2: inline interpolation outside helpers (Plan v1 of BUG-BASIC-XSS-1
# MISSED this axis — boundary-contract specialist found 5 bypass paths
# bringing scope from 11 → ~135 sites)
grep -rE 'throw new Error\(`.*\$\{|error: `.*\$\{|text: `.*\$\{|message: `.*\$\{' \
  lib/mcp/server/tools/ --include='*.js' | grep -v error-helpers | grep -v test-

# Verify sanitize coverage (catches any new echo site without the wrap)
grep -rL "sanitizeForResponse" lib/mcp/server/tools/ --include='*.js' \
  | xargs grep -lE 'throw new Error\(`.*\$\{' 2>/dev/null
```

### Defense pattern verification

```bash
# L1 input rejection (16 fields covered)
grep -nE "SafeNameField" lib/mcp/server/config/tool-schemas.js | head -5

# L4 output sanitization (canonical utility)
cat lib/mcp/server/tools/response-sanitizer.js | head -50
```

### Reference
- BC71 in `.claude/knowledge/domain/mcp/bug-class-registry.md`
- Sanitize utility: `lib/mcp/server/tools/response-sanitizer.js` (5-char OWASP escape, reuses `lib/utils/sanitize.ts:escapeHtml` via KEEP IN SYNC inline copy)
- L1 input rejection: `lib/mcp/server/config/tool-schemas.js:SafeNameField`
- Markdown URL allowlist: `lib/mcp/server/tools/advanced/analytics/analytics-formatters.js:sanitizeLinkUri`
- Pattern memory: [[feedback_bc2_audits_two_axes]] (two-axis grep saved this)
