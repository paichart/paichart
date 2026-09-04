# Boundary Contract Discovery Task

**Last Updated**: 2026-02-22
**Status**: Enhanced v1.1 - Added pino structured logging for boundary diagnostics
**Confidence**: Very High - Based on Oct 20-21 bug pattern analysis
**Last Validated**: 2026-02-22 - Added pino structured logging discovery steps

## 🆕 2026-05-27 Session — Run These Greps FIRST (phantom-canonical convergence — G-1)

```bash
# Phantom-canonical sweep (BC75): hand-rolled validatePOVAccess copies that DON'T delegate to the canonical:
grep -rnE "function validatePOVAccess|validateMCPPOVAccess\(" lib/ --include="*.js" --include="*.ts" | grep -v "lib/auth/validate-pov-access"

# demo-write gate now covers the .js hub layer + is comment-robust (a future phantom-canonical can't pass green):
grep -nE "Pass C|stripComments|lib/mcp/server" scripts/test-demo-write-coverage.ts
```

G-1 (`a3b2f3da`): the `workflow-tools-handler.js:220` JS copy converged → `validateMCPPOVAccess(requireWrite:true)`. Ref: [[prelaunch-pentest-2026-05-26]].

---

## 🆕 2026-05-26 Session — Run These Greps FIRST (identity-map + phantom-canonical)

```bash
# IDENTITY-MAP boundary: checkPermission expects {id, role} but TokenPayload carries .userId.
# Passing raw TokenPayload → id=undefined → colliding cache key → cross-role escalation. The fix
# is the explicit {id: user.userId, role} map at each gate:
grep -rn "checkPermission(" app/api/pov/route.ts lib/mcp/tasks/action/handlers/pov/pov-create-handler.ts

# PHANTOM-CANONICAL (validation layer, 2026-05-25): the POV-update route validates tasks[] via
# NestedTaskInputSchema (task-shapes.ts) — NOT the plausibly-named task-validation.ts. Fixing the
# wrong schema first cost a deploy. Grep ALL sites for the field, then trace which schema the
# FAILING route imports (the error's field-path prefix, e.g. tasks.N.x, points to the nested schema):
grep -rn "outputArtifacts" lib/validation/ --include="*.ts"
```

Ref: `cline_docs/reviews/role-permission-option-c-2026-05-25/boundary-contract-review.md`. See also [[Phantom canonical audit]] memory (now covers validation schemas).

---

## 🆕 2026-05-24 Session — Run These Greps FIRST

```bash
# P1.4 settings GET/PUT contract change — you caught the round-trip fail-mode at review
grep -nE "redactSensitiveSettings|mergeSettingsPreservingSecrets" lib/settings/
# GET strips: llm.{anthropicApiKey, geminiApiKey} + apiKey.token; replaces with *Configured/hasKey
# PUT merge guard: preserves stored secrets when incoming is empty/redacted

# AuditLogViewer severity classifier — maps 13 new event types to Badge variants
grep -nE "getSeverity|rowClass|badgeVariant|actionBadgeVariant" components/admin/AuditLog/AuditLogViewer.tsx

# Audience-overlap RESIDUAL gap (you flagged it): both /api + /mcp accepted in single check
grep -nB2 -A5 "audience: \[" lib/auth/token-manager.ts
# Line 359-362 → MCP token IS valid against /api/* today. Site 1 follow-up tracks the close.

# expectedClientId-wiring MVP plan (your boundary-contract-review.md caught the type narrowing trap)
ls cline_docs/reviews/expected-client-id-wiring-2026-05-24/

# Test pattern reference (extend for new boundaries)
ls scripts/test-{pov-field-filtering,auth-audit-coverage,admin-audit-coverage,settings-redaction}.ts
```

Related follow-ups: `expected-client-id-site1-web-api-2026-05-24.md` (P0/7-day SLA — TBD), `api-handler-bc54-consistency-2026-05-24.md` (LOW priority XFF gate).

---

## Objective
Systematically map all data boundaries in the system, validate that contracts are complete across boundaries, and identify potential "field leakage" bugs where required fields disappear during data transformation between layers.

## Context
The Oct 20-21 OAuth bugs revealed a repeating pattern: authentication succeeded, but downstream features failed because required fields (token, email, role) were missing in data passed across boundaries. This discovery maps all boundaries, defines contracts, and provides executable validation commands to catch these bugs in development.

## Discovery Scope

### Part 1: Complete Boundary Mapping (7 Authentication Boundaries)

Map each boundary with direction, contract definition, code locations, historical bugs, and validation commands.

#### Boundary 1: OAuth Provider → User Object

**Direction**: Microsoft/GitHub API Response → Database User Record

**Contract Definition**:
```typescript
// SOURCE: OAuth provider response
interface OAuthProviderResponse {
  id: string;           // Provider's user ID
  email: string;        // REQUIRED - User email (may be null for GitHub private)
  name?: string;        // Display name
  avatar_url?: string;  // Profile picture
}

// DESTINATION: Database user record (Prisma User model)
interface DatabaseUser {
  id: string;           // Generated internally
  email: string;        // REQUIRED for authentication
  name: string | null;  // Optional display name
  avatarUrl: string | null;  // Optional avatar
}
```

**Code Locations**:
- **Source Producer**: `lib/auth/oauth/mcp-oauth-validator.js` — `verifyMicrosoftToken()` (~lines 189-265) and `verifyGitHubToken()` (~lines 58-136). Note: server-class duplicates in `mcp-server-http-clean.js` were removed in Phase 3.0a (Wave 3a, May 2026).
- **Destination Consumer**: `mcp-oauth-validator.js` — `findOrCreateUser()` (canonical; replaces deleted server-class `findOrCreateUserFromGitHub()`)
- **Contract Bridge**: OAuth response → Prisma.user.create()

**Historical Bugs**: None documented

**Common Issues**:
- GitHub users with private emails (email = null)
- Missing avatar_url (handled gracefully with null)
- Name field inconsistencies across providers

**Validation Commands**:
```bash
# Check OAuth provider response handling (canonical lives in validator class)
grep -A 30 "verifyMicrosoftToken\|verifyGitHubToken" lib/auth/oauth/mcp-oauth-validator.js | grep "email\|name\|avatar"

# Check database user creation
grep -A 20 "findOrCreateUser" mcp-oauth-validator.js | grep "email\|name\|avatarUrl"

# Validate email is always required
grep -B 5 -A 5 "email.*required\|email.*NOT NULL" prisma/schema.prisma
```

---

#### Boundary 2: User Object → JWT Payload ⚠️ BUG HISTORY

**Direction**: Database User → RS256 JWT (mintMcpToken)

**Contract Definition**:
```typescript
// SOURCE: Database user (from findOrCreateUser or getAuthUser)
interface SourceUser {
  id: string;           // User ID
  email: string;        // REQUIRED for downstream RBAC
  role: UserRole;       // REQUIRED for downstream RBAC
}

// DESTINATION: JWT Payload (RS256 for MCP/OAuth)
interface JWTPayload {
  sub: string;          // User ID (mapped from id)
  email: string;        // ✅ REQUIRED - Added Oct 21
  role: string;         // ✅ REQUIRED - Added Oct 21
  scope: string;        // OAuth scopes
  azp: string;          // Authorized party (client ID)
  jti: string;          // JWT ID (unique token identifier)
  iss: string;          // Issuer
  aud: string;          // Audience
  exp: number;          // Expiration
  iat: number;          // Issued at
}
```

**Code Locations** (post-U2 2026-05-19):
- **Source Producer**: User row from Prisma — `globalPrisma.user.findUnique({ where: { id }})` (rest of pipeline reads `id, email, role`)
- **Destination Consumer**: `lib/auth/token-manager.ts:mintMcpToken(opts: MintMcpTokenOptions)` — canonical home post-Phase-A consolidation. Required fields: `userId, email, role, scope, audience`.
- **Contract Bridge**: `lib/auth/token-manager.ts:SignJWT` constructor payload + `.setAudience/.setSubject/.setJti/.setIssuedAt/.setExpirationTime` chain
- **Per-call mint callsites** (each must enumerate all required fields explicitly per v3.1 Edit 2):
  - `lib/mcp/server/utils/api-client.js:57` (uses `INTERNAL_API_AUDIENCE`)
  - `lib/services/workflow/integrations/service-caller.ts:300+` (uses `audienceForService(serviceInfo)`)
  - `lib/mcp/server/tools/hub/workflow-tools-handler.js:558+` (uses `audienceForService(serviceRecord)`, post-trust-gate)
  - 4 internal `mcp-server-http-clean.js` callsites (OAuth callback + 2 refresh-grant paths)

**Historical Bugs**:
- **Oct 21, 2025**: Missing `email` and `role` in JWT payload
  - **Symptom**: DEMO_USER saw 0 POVs (RBAC filtering failed)
  - **Root Cause**: mintMcpToken didn't include email/role in payload
  - **Fix**: Added `email: email,` and `role: role,` to payload object (lines 906-907)
  - **Debug Time**: 1 hour, 5+ iterations
  - **Prevention**: This boundary test would catch it

**Common Issues**:
- Forgetting to add new required fields when downstream consumers need them
- HS256 vs RS256 payload inconsistencies
- Token expiration too short/long

**Validation Commands** (post-U2 2026-05-19):
```bash
# mintMcpToken canonical signature (consolidated to lib/auth/token-manager.ts in Phase A)
grep -A 20 "interface MintMcpTokenOptions" lib/auth/token-manager.ts
grep -A 60 "export async function mintMcpToken" lib/auth/token-manager.ts

# Verify required fields are present in MintMcpTokenOptions: userId, email, role, scope, audience
grep -B 1 -A 12 "interface MintMcpTokenOptions" lib/auth/token-manager.ts

# Per-call mint callsites must enumerate ALL required fields explicitly (v3.1 Edit 2):
grep -B 2 -A 12 "await mintMcpToken({" lib/mcp/server/utils/api-client.js
grep -B 2 -A 12 "await mintMcpToken({" lib/services/workflow/integrations/service-caller.ts
grep -B 2 -A 12 "await mintMcpToken({" lib/mcp/server/tools/hub/workflow-tools-handler.js

# Compare canonical mintMcpToken vs verifyAccessToken contract asymmetry (boundary-contract I2):
echo "=== MINTER OUTPUT (claims set) ==="
grep -A 8 "const signer = new SignJWT" lib/auth/token-manager.ts
echo "=== VERIFIER OUTPUT (TokenPayload) ==="
grep -A 5 "interface TokenPayload" lib/auth/token-manager.ts
```

**Contract Gap Analysis**:
```javascript
// What getAuthUser NEEDS (destination):
const requiredFields = ['userId', 'email', 'role'];

// What mintMcpToken PRODUCES (source):
const producedFields = ['sub', 'email', 'role', 'scope', 'azp', 'jti', 'iss', 'aud', 'exp', 'iat'];

// GAP CHECK:
// - userId → mapped from 'sub' ✅
// - email → present ✅ (added Oct 21)
// - role → present ✅ (added Oct 21)
```

---

#### Boundary 3: JWT Payload → Decoded JWT

**Direction**: Encoded JWT String → Decoded JWT Object (verifyAccessToken)

**Contract Definition**:
```typescript
// SOURCE: JWT string (Bearer token from Authorization header)
type JWTString = string; // "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."

// DESTINATION: Decoded JWT object
interface DecodedJWT {
  sub: string;          // User ID
  email: string;        // User email
  role: string;         // User role
  scope?: string;       // OAuth scopes (optional)
  azp?: string;         // Authorized party (optional)
  jti?: string;         // JWT ID (optional)
  iss: string;          // Issuer
  aud: string;          // Audience
  exp: number;          // Expiration timestamp
  iat: number;          // Issued at timestamp
}
```

**Code Locations**:
- **Source Producer**: HTTP Authorization header `Bearer ${token}`
- **Destination Consumer**: `lib/jwt.ts` line 50 (verifyAccessToken)
- **Contract Bridge**: jwt.verify() with RS256/HS256 algorithms

**Historical Bugs**: None documented

**Common Issues**:
- Algorithm mismatch (RS256 vs HS256)
- Expired tokens (exp < Date.now())
- Invalid signature (wrong secret/public key)
- Missing audience/issuer validation

**Validation Commands**:
```bash
# Check token verification logic
grep -A 30 "verifyAccessToken" lib/jwt.ts

# Validate both RS256 and HS256 supported
grep -E "RS256|HS256" lib/jwt.ts

# Check public key configuration
grep -A 5 "MCP_JWT_PUBLIC_KEY\|JWT_SECRET" lib/jwt.ts

# Test token decoding (manual)
# node -e "console.log(require('jsonwebtoken').decode('TOKEN_HERE'))"
```

---

#### Boundary 4: Decoded JWT → AuthUser ⚠️ BUG HISTORY

**Direction**: Decoded JWT → AuthUser Interface (getAuthUser)

**Contract Definition**:
```typescript
// SOURCE: Decoded JWT
interface DecodedJWT {
  sub?: string;         // User ID (RS256)
  userId?: string;      // User ID (HS256)
  email?: string;       // User email (OPTIONAL in JWT, but REQUIRED for RBAC)
  role?: string;        // User role (OPTIONAL in JWT, but REQUIRED for RBAC)
  scope?: string;       // OAuth scopes
}

// DESTINATION: AuthUser (used throughout API routes)
interface AuthUser {
  userId: string;       // REQUIRED - from decoded.sub || decoded.userId
  email: string;        // REQUIRED - from decoded.email
  role: UserRole;       // REQUIRED - from decoded.role
}
```

**Code Locations**:
- **Source Producer**: `lib/jwt.ts` verifyAccessToken return value
- **Destination Consumer**: `lib/auth/get-auth-user.ts` line 30
- **Contract Bridge**: Lines 35-39 (user object construction)

**Historical Bugs**:
- **Oct 21, 2025**: undefined `email` and `role` in AuthUser
  - **Symptom**: RBAC filtering in app/api/pov/route.ts line 176 failed (user.role === 'DEMO_USER' was undefined === 'DEMO_USER')
  - **Root Cause**: Upstream mintMcpToken didn't include email/role, so decoded.email and decoded.role were undefined
  - **Fix**: Added email/role to mintMcpToken (Boundary 2)
  - **Debug Time**: 1 hour (part of same debugging session as Boundary 2)
  - **Prevention**: Boundary contract assertion would have caught missing fields

**Common Issues**:
- Assuming fields exist in JWT without validation
- Different field names across JWT types (sub vs userId)
- Missing role field causing RBAC bypass
- Missing email field causing query failures

**Validation Commands**:
```bash
# Check getAuthUser extraction logic
grep -A 20 "export async function getAuthUser" lib/auth/get-auth-user.ts

# Verify user object construction
grep -A 10 "const user = {" lib/auth/get-auth-user.ts | grep "userId\|email\|role"

# Find all usages of AuthUser to determine required fields
grep -r "user\\.role\|user\\.email\|user\\.userId" app/api/*/route.ts | head -20

# DESTINATION CONTRACT ANALYSIS (what fields are actually used?)
echo "=== Fields Used in API Routes ==="
grep -oh "user\\.\\w*" app/api/*/route.ts | sort -u
```

**Contract Gap Analysis**:
```javascript
// What API routes USE (destination needs):
const usedFields = ['userId', 'email', 'role'];  // From grep analysis

// What getAuthUser PRODUCES (source provides):
const producedFields = ['userId', 'email', 'role'];  // From decoded JWT

// GAP CHECK:
// If decoded.email is undefined → user.email is undefined → RBAC breaks
// If decoded.role is undefined → user.role is undefined → RBAC breaks
```

---

#### Boundary 5: AuthUser → req.user ⚠️ BUG HISTORY

**Direction**: AuthUser (from getAuthUser) → Express req.user (MCP Middleware)

**Contract Definition**:
```typescript
// SOURCE: AuthUser (from getAuthUser)
interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
}

// DESTINATION: req.user (MCP authentication middleware)
interface ReqUser {
  id: string;           // Mapped from userId
  email: string;        // Pass-through
  role: string;         // Pass-through
  token: string;        // ✅ REQUIRED - Added Oct 20
  authMethod: 'mcp_token' | 'session';
  scope?: string;       // OAuth scopes
}
```

**Code Locations**:
- **Source Producer**: `lib/auth/get-auth-user.ts` (returns AuthUser)
- **Destination Consumer**: `mcp-server-http-clean.js` line 1059 (MCP authentication middleware)
- **Contract Bridge**: Lines 1075-1081 (req.user assignment)

**Historical Bugs**:
- **Oct 20, 2025**: Missing `token` field in req.user
  - **Symptom**: ContextEnricher tried to forward token to API (line 28), but user.token was undefined → API returned 401
  - **Root Cause**: req.user construction didn't include the token field
  - **Fix**: Added `token: token,` to req.user object (line 1077)
  - **Debug Time**: 2 hours, 5+ iterations
  - **Prevention**: This boundary test would catch it

**Common Issues**:
- Forgetting to include token when API forwarding is needed
- Field name mismatches (userId vs id)
- Missing scope for OAuth context

**Validation Commands**:
```bash
# Check MCP authentication middleware req.user construction
grep -A 30 "// MCP Token Authentication" mcp-server-http-clean.js | grep "req.user = {"

# Verify token is included (Oct 20 fix)
grep -A 15 "req.user = {" mcp-server-http-clean.js | grep "token:"

# Check where req.user.token is used (destination needs)
grep -r "req\\.user\\.token\|user\\.token" lib/mcp/ mcp-server-http-clean.js

# Find ContextEnricher dependency on token
grep -A 10 "class ContextEnricher" lib/mcp/server/middleware/context-enricher.js | grep "token"
```

**Contract Gap Analysis**:
```javascript
// What ContextEnricher NEEDS (destination):
const requiredFields = ['id', 'email', 'role', 'token'];  // Line 28 uses user.token

// What MCP middleware PRODUCES (source):
const producedFields = ['id', 'email', 'role', 'token', 'authMethod', 'scope'];

// GAP CHECK (Oct 20):
// Before fix: token was missing → ContextEnricher failed
// After fix: token included → ContextEnricher works ✅
```

---

#### Boundary 6: req.user → API Headers

**Direction**: MCP req.user → HTTP Authorization Header (ContextEnricher)

**Contract Definition**:
```typescript
// SOURCE: req.user (MCP middleware)
interface ReqUser {
  id: string;
  email: string;
  role: string;
  token: string;        // REQUIRED for API forwarding
  authMethod: string;
  scope?: string;
}

// DESTINATION: HTTP headers for web API
interface APIHeaders {
  'Authorization': `Bearer ${string}`;  // Requires req.user.token
  'X-User-Id'?: string;                 // Optional user context
  'X-User-Email'?: string;              // Optional user context
  'X-User-Role'?: string;               // Optional user context
}
```

**Code Locations**:
- **Source Producer**: `mcp-server-http-clean.js` req.user object
- **Destination Consumer**: `lib/mcp/server/middleware/context-enricher.js` line 28
- **Contract Bridge**: Line 29-32 (Authorization header construction)

**Historical Bugs**: Related to Oct 20 bug (missing token in req.user)

**Common Issues**:
- Undefined token causing "Authorization: Bearer undefined"
- Wrong token type (session token instead of API token)
- Missing headers for user context

**Validation Commands**:
```bash
# Check ContextEnricher authorization header construction
grep -A 30 "class ContextEnricher" lib/mcp/server/middleware/context-enricher.js | grep "Authorization"

# Verify token forwarding logic
grep -B 5 -A 10 "user\\.token" lib/mcp/server/middleware/context-enricher.js

# Check if token validation happens before forwarding
grep -E "if.*token|token.*undefined|!token" lib/mcp/server/middleware/context-enricher.js
```

---

#### Boundary 7: AuthUser → RBAC Query ⚠️ BUG HISTORY

**Direction**: AuthUser → Prisma WHERE Clause (RBAC Filtering)

**Contract Definition**:
```typescript
// SOURCE: AuthUser (from getAuthUser)
interface AuthUser {
  userId: string;       // REQUIRED for ownership filtering
  email: string;        // REQUIRED for audit logs
  role: UserRole;       // REQUIRED for role-based filtering
}

// DESTINATION: Prisma query WHERE clause
interface PrismaWhereClause {
  OR?: [
    { ownerId: string },               // userId used here
    { metadata: { path: ['isDemo'], equals: true } }  // role === 'DEMO_USER' enables this
  ];
  // OR for other roles:
  ownerId?: string;  // role !== 'DEMO_USER' → only owned POVs
}
```

**Code Locations**:
- **Source Producer**: `lib/auth/get-auth-user.ts` (AuthUser object)
- **Destination Consumer**: `app/api/pov/route.ts` line 176-184 (RBAC filtering)
- **Contract Bridge**: Lines 176-184 (conditional query construction)

**Historical Bugs**:
- **Oct 21, 2025**: undefined `role` caused RBAC filtering to skip
  - **Symptom**: DEMO_USER saw 0 POVs instead of demo POVs
  - **Root Cause**: user.role was undefined (from upstream Boundary 2/4), so `if (user.role === 'DEMO_USER')` was false
  - **Fix**: Added role to JWT payload (Boundary 2)
  - **Debug Time**: 1 hour (same session as Boundary 2/4)
  - **Impact**: RBAC completely bypassed for undefined roles

**Common Issues**:
- Undefined role → RBAC skipped → security/UX failure
- Missing userId → ownership filtering fails
- Role field name mismatch (role vs userRole)

**Validation Commands**:
```bash
# Check RBAC filtering logic in POV API
grep -A 30 "role === 'DEMO_USER'" app/api/pov/route.ts

# Find all RBAC patterns
grep -r "user\\.role === \|role === 'ADMIN'\|role === 'USER'" app/api/*/route.ts

# Verify userId is used for ownership filtering
grep -r "ownerId.*user\\.userId\|userId.*user\\.id" app/api/*/route.ts

# RBAC DEPENDENCY ANALYSIS
echo "=== Fields Required for RBAC ==="
grep -oh "user\\.\\w*" app/api/pov/route.ts | sort -u
```

**Contract Gap Analysis**:
```javascript
// What RBAC filtering NEEDS (destination):
const requiredFields = ['userId', 'role'];  // Lines 176-184

// What getAuthUser PRODUCES (source):
const producedFields = ['userId', 'email', 'role'];

// GAP CHECK:
// If decoded.role is undefined (Boundary 2/4 bug) → RBAC breaks
// If userId is missing → ownership filtering breaks
```

---

### Part 2: Cross-Boundary Validation Patterns

#### Pattern 1: Comparative Path Analysis (5-Minute Protocol)

**When to Use**: "Works in Context A, broken in Context B"

**Example**: Web app (HS256) works, ChatGPT/MCP (RS256) broken

```bash
# Step 1: Identify the two paths (2 min)
echo "=== Path A: Web App (Working) ==="
echo "Browser → Cookie (HS256 JWT) → getAuthUser → API Route"

echo "=== Path B: ChatGPT/MCP (Broken) ==="
echo "ChatGPT → OAuth → RS256 JWT → getAuthUser → API Route"

# Step 2: Capture data at same boundary in both paths (2 min)
# Add temporary logging at Boundary 4 (Decoded JWT → AuthUser):
# authLogger.debug({ decoded }, 'Path A HS256 decoded');
# authLogger.debug({ decoded }, 'Path B RS256 decoded');

# Step 3: Side-by-side comparison (1 min)
echo "=== Compare JWT Payloads ==="
# Copy logs from both paths, compare keys:
# Path A keys: sub, userId, email, role, iss, aud, exp, iat
# Path B keys: sub, scope, jti, azp, iss, aud, exp, iat
# MISSING in B: email, role ← ROOT CAUSE!
```

#### Pattern 2: Contract Definition from Destination

**When to Use**: Before implementing new boundary transformation

**Method**: Work BACKWARDS from consumer to producer

```bash
# Step 1: Find destination code that USES the data
grep -A 20 "user\\.role\|user\\.email\|user\\.token" app/api/pov/route.ts

# Step 2: List ALL fields used (these are REQUIRED)
grep -oh "user\\.\\w*" app/api/pov/route.ts | sort -u
# Output: user.email, user.role, user.userId

# Step 3: Define the contract
cat > /tmp/boundary-contract.ts <<EOF
interface AuthUser {
  userId: string;  // Used in: ownership filtering
  email: string;   // Used in: audit logs, display
  role: UserRole;  // Used in: RBAC filtering (line 176)
}
EOF

# Step 4: Validate source produces ALL required fields
grep -A 10 "const user = {" lib/auth/get-auth-user.ts
# Check: Does it produce userId? email? role?
```

#### Pattern 3: Gap Analysis Automation

**When to Use**: Debugging "authentication works, feature doesn't"

```bash
# Define contracts
DESTINATION_FIELDS="userId email role token"
SOURCE_FIELDS=$(grep -A 10 "const user = {" lib/auth/get-auth-user.ts | grep -oE "\\w+:" | sed 's/://')

# Calculate gap
echo "=== Gap Analysis ==="
echo "Destination needs: $DESTINATION_FIELDS"
echo "Source produces: $SOURCE_FIELDS"

# Find missing fields (bash array diff)
for field in $DESTINATION_FIELDS; do
  if ! echo "$SOURCE_FIELDS" | grep -q "$field"; then
    echo "❌ MISSING: $field"
  else
    echo "✅ Present: $field"
  fi
done
```

---

### Part 2.5: Typed-Error Discriminator Audit (Apr 2026)

When reviewing changes that throw or catch errors at MCP/HTTP/SSE boundaries, run this audit. Surfaces violations of the three-rule contract documented in the agent file's "Typed-Error Discriminator Contract" section.

#### Grep set

```bash
# 1. Find domain errors NOT extending AppError (P0 violation)
# 2026-07-28: was self-referential — it matched `AppError` itself (lib/errors.ts:4),
# which by definition extends Error. Expected-zero could never hold, so this grep had
# been silently wrong since it was written. Exclude the base class it mandates.
grep -rEn 'export\s+class\s+\w+Error\s+extends\s+Error\b' --include='*.ts' lib/ app/ | grep -v node_modules | grep -v 'class AppError extends'
# Expected: zero hits. Any hit is a CRITICAL finding — domain errors must extend AppError.

# 2. Find MCP boundary catches that flatten to INTERNAL_ERROR without instanceof check
grep -rEnB3 "code:\s*['\"]INTERNAL_ERROR['\"]" --include='*.ts' app/api/mcp/ | grep -v node_modules
# Read each hit: confirm an `instanceof AppError` check fronts the generic catch.
# Working precedent: app/api/tasks/[taskId]/agent/execute/route.ts:228

# 3. Find stdio MCP tool catches that read only error.message (missing _meta.errorCode)
grep -rEnB3 "_meta:\s*\{" --include='*.js' lib/mcp/server/tools/ | grep -v node_modules
# For each catch returning isError: true: confirm errorCode is extracted into _meta.

# 4. Audit securityEvent tagging — should be at violation sites, NOT on error classes
grep -rEn "securityEvent:\s*true" --include='*.{ts,js}' lib/ app/ | grep -v node_modules
# All hits should be inside log.warn/log.info payloads. None should be on
# `class X extends AppError` constructor or `super(...)` calls.

# 5. Find duplicate-skip helpers — confirm they do NOT tag securityEvent (benign races)
grep -A10 "logReactorDuplicateSkip\|logReactor\w+Skip" lib/services/reactor-skip-counter.ts
# Verify duplicate-class skips do NOT carry securityEvent. Mismatch-class skips DO.
```

#### When this audit fires
- Plan adds new error type to domain code (`extends Error|AppError|...`)
- Plan changes catch behavior at MCP HTTP route or MCP stdio tool boundary
- Plan adds reactor skip logging
- Specialist review of any feature touching `lib/errors.ts` or MCP boundary surfaces

Cross-references:
- Agent file §"Typed-Error Discriminator Contract"
- `lib/errors.ts:4` (`AppError` base)
- `cline_docs/reviews/harness-clobber-detection-2026-04-25/` (canonical Phase 4 implementation)
- `scripts/test-mcp-boundary-error-codes.ts` (Layer 1 regression test)

---

### Part 3: Integration with Architectural Review — pointer (Phase 2 trim, 2026-06-11)

The reciprocal embedding lives in `architectural-review-discovery.md` §5.5 (boundary-contract
gate + trigger conditions + field-completeness checklist). When arch-review flags JWT/token/
AuthUser/req.user/RBAC patterns in a plan, it activates this specialist; full trigger list and
handover format are in that doc — single home, no duplicate to drift.


### Part 4: Prevention Tools and Tests — moved (Phase 2 trim, 2026-06-11)

BoundaryLogger design + CI boundary-test templates live in
`.claude/knowledge/domain/boundary-contracts/boundary-pattern-library.md` §Prevention Tools.
For NEW boundaries: add a contract test to CI (pattern in the library) — the test IS the prevention.

### Part 5: Boundary Debugging Protocol — canonical pointer (Phase 2 trim, 2026-06-11)

The 5-Minute Boundary Debug Protocol summary lives in the specialist; the CANONICAL full version
(with runtime-verification step) is in the boundary-pattern-library. Steps: confirm-boundary-bug →
capture both paths → diff fields → read destination contract → trace backwards → VERIFY AT RUNTIME.

### Part 6: Success Criteria

**Boundary Analysis Complete When**:
- [ ] All 7 authentication boundaries mapped
- [ ] Contracts defined for each boundary (TypeScript interfaces)
- [ ] Historical bugs documented (Oct 20-21)
- [ ] Validation commands executable
- [ ] Gap analysis automated
- [ ] Prevention tests created for critical boundaries

**Prevention System Working When**:
- [ ] Next similar bug caught in development (not production)
- [ ] Debugging time reduced from 1-2 hours to 5-10 minutes (10-20x improvement)
- [ ] Zero field leakage bugs in production
- [ ] Boundary tests in CI prevent regressions
- [ ] BoundaryLogger catches violations in development
- [ ] **Runtime verification catches field name mismatches** (NEW: Nov 20, 2025)

---


### Part 6.5: Runtime Verification Protocol ⭐ (condensed — Phase 2 trim, 2026-06-11)

**MANDATORY final step of any boundary audit** — static analysis FAILED on a real security bug
(Nov 2025: code read `user.userId`, runtime object carried `id`). Always verify the live shape:

```bash
# 1. Add temporary logging at the boundary crossing:
#    authLogger.debug({ keys: Object.keys(user), user }, 'runtime shape at <boundary>');
# 2. Invoke the code path (both contexts if dual-path: API ctx carries userId; MCP ctx carries id)
# 3. Compare runtime keys vs code field-accesses:
grep -n "user\.userId\|user\.id\b" <suspect-file>   # what code READS
# 4. Mismatch (reads a key runtime doesn't carry) = the bug. undefined in a Prisma filter
#    silently widens the query ({ownerId: undefined} → {}) — security impact, not just a crash.
```

Full narrative, worked security-bug example, and MCP-vs-API context table:
`.claude/knowledge/domain/boundary-contracts/boundary-pattern-library.md` §Runtime Field Name Verification.

### Part 7: Common Execution Patterns

#### Pattern A: Pre-Implementation Validation

**Before implementing authentication/authorization features**:

```bash
# 1. Map boundaries data will cross
echo "New feature: [DESCRIPTION]"
echo "Boundaries: [LIST]"

# 2. Define contracts at each boundary
# See Part 1 for contract templates

# 3. Validate source produces what destination needs
# Use gap analysis pattern from Part 2

# 4. Add boundary tests
# Use test templates from Part 4

# 5. Implement with confidence
```

#### Pattern B: Reactive Debugging

**When encountering "works in A, broken in B"**:

```bash
# 1. Run 5-minute protocol (Part 5)
# 2. Find missing fields
# 3. Fix source to include missing fields
# 4. Test
# 5. Add prevention test
```

#### Pattern C: Architectural Review

**During plan review**:

```bash
# 1. Run boundary_contract_gate.sh
# 2. If triggered → Activate boundary-contract-specialist
# 3. Validate all contracts
# 4. Require tests for critical boundaries
# 5. Approve implementation
```

---

### Part 8: Frontend/Backend Type Boundary Discovery ⭐ NEW 2025-11-02

**Purpose**: Discover type mismatches between frontend and backend
**Source**: Week 6 POV validation debugging (15 errors from type mismatches)
**Evidence**: 5-minute type analysis prevents hours of debugging

#### 8.1 Frontend Type Discovery Commands
```bash
# Find EditorState or form type definitions
echo "=== Frontend Type Definitions ==="
grep -rn "interface.*EditorState\|type.*EditorState" components/ \
  --include="*.tsx" --include="*.ts" -A 30 | head -100

# Find useState with typed initial values
echo "=== Frontend State Types ==="
grep -rn "useState<" components/ --include="*.tsx" -A 3 | head -50

# Find form field types (input types indicate expected data format)
echo "=== Form Input Types ==="
grep -rn "type=\"number\"\|type=\"date\"\|type=\"text\"\|type=\"email\"" \
  components/ --include="*.tsx" | head -30

# Find specific fields we care about
echo "=== Specific Field Types (revenue, dueDate, inputContext) ==="
grep -rn "revenue:\|dueDate:\|inputContext:" components/poveditor/ \
  --include="*.tsx" -B 2 -A 2 > /tmp/frontend-field-types.txt
cat /tmp/frontend-field-types.txt
```

#### 8.2 Backend Schema Discovery Commands
```bash
# Find all Zod validation schemas
echo "=== Backend Validation Schemas ==="
grep -rn "const.*Schema = z\.object" lib/validation/ lib/*/handlers/ \
  app/api/ --include="*.ts" -A 20 | head -100

# Find number fields (should match frontend number inputs)
echo "=== Number Field Validation ==="
grep -rn "z\.number()" lib/validation/ lib/*/handlers/ \
  --include="*.ts" | head -30

# Find date fields
echo "=== Date Field Validation ==="
grep -rn "dueDate:\|startDate:\|endDate:" lib/validation/ lib/*/handlers/ \
  --include="*.ts" -A 2 | head -30

# Find specific fields matching frontend
echo "=== Specific Backend Schema Fields ==="
grep -rn "revenue:\|dueDate:\|inputContext:" lib/pov/handlers/ \
  lib/validation/ --include="*.ts" -A 2 > /tmp/backend-field-types.txt
cat /tmp/backend-field-types.txt
```

#### 8.3 Type Boundary Comparative Analysis (5 Minutes)
```bash
# Automated side-by-side comparison
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║ FRONTEND vs BACKEND TYPE COMPARISON                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

# Compare frontend vs backend for specific fields
echo ""
echo "=== FRONTEND TYPES ==="
cat /tmp/frontend-field-types.txt

echo ""
echo "=== BACKEND TYPES ==="
cat /tmp/backend-field-types.txt

echo ""
echo "=== TYPE MISMATCH DETECTION ==="
echo "Check for:"
echo "  - Frontend: type=\"number\" → Backend: z.number() ✅ MATCH"
echo "  - Frontend: type=\"number\" → Backend: z.string() ❌ MISMATCH"
echo "  - Frontend: value={null} → Backend: .optional() ❌ NEEDS .nullable()"
echo "  - Frontend: value={null} → Backend: .nullish() ✅ MATCH"
```

#### 8.4 Specific Type Pattern Discovery
```bash
# Find .nullable().optional() patterns (correct for forms)
echo "=== Fields Accepting Null (correct form pattern) ==="
grep -rn "\.nullable()\.optional()\|\.nullish()" \
  lib/validation/ lib/*/handlers/ --include="*.ts" | head -30

# Find fields with only .optional() (potential null handling issue)
echo "=== Fields with ONLY .optional() (may reject null) ==="
grep -rn "\.optional()" lib/validation/ lib/*/handlers/ \
  --include="*.ts" | grep -v "\.nullable()" | grep -v "\.nullish()" | head -30

# Find union type patterns (multi-source data handling)
echo "=== Union Type Patterns (multi-source compatibility) ==="
grep -rn "z\.union(\[" lib/validation/ lib/*/handlers/ \
  --include="*.ts" -A 3 | head -50

# Find specific string/number unions (form data coercion)
echo "=== String/Number Union Patterns (form input handling) ==="
grep -rn "z\.union.*z\.string.*z\.number\|z\.union.*z\.number.*z\.string" \
  lib/validation/ lib/*/handlers/ --include="*.ts" -A 2 | head -30

# Find specific string/object unions (multi-format data)
echo "=== String/Object Union Patterns (multi-source data) ==="
grep -rn "z\.union.*z\.string.*z\.record\|z\.union.*z\.record.*z\.string" \
  lib/validation/ lib/*/handlers/ --include="*.ts" -A 2 | head -30
```

#### 8.5 Type Mismatch Analysis Template

Use this template for 5-minute type boundary analysis:

```
Field Comparison Table:
-----------------------
Field           | Frontend Type  | Frontend Value | Backend Schema          | Match? | Issue
----------------|----------------|----------------|-------------------------|--------|------------------
revenue         | number (input) | "2000000"      | z.number()              | ❌     | String sent for number
dueDate         | date (input)   | null           | z.string().optional()   | ❌     | Null not accepted
inputContext    | object (state) | {...}          | z.string()              | ❌     | Object sent for string
title           | text (input)   | "POV Title"    | z.string()              | ✅     | OK

Type Violation Categories:
1. String Numbers: Frontend sends "123" for number field
2. Null Handling: Frontend sends null, backend only accepts undefined
3. Object vs String: Different sources send different formats
```

**Automated Detection**:
```bash
# Create comparison report
echo "Field | Frontend | Backend | Issue" > /tmp/type-boundary-report.txt

# Check revenue field
frontend_revenue=$(grep "revenue" /tmp/frontend-field-types.txt)
backend_revenue=$(grep "revenue" /tmp/backend-field-types.txt)
echo "revenue | $frontend_revenue | $backend_revenue | Check types match" >> /tmp/type-boundary-report.txt

# Display report
cat /tmp/type-boundary-report.txt
```

---

## Quick Reference: Boundary Map

```
┌─────────────────────────────────────────────────────────────┐
│ AUTHENTICATION/AUTHORIZATION BOUNDARY MAP                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 1. OAuth Provider → User Object                             │
│    Files: mcp-server-http-clean.js, mcp-oauth-validator.js │
│    Contract: { id, email, name, avatar }                    │
│    Issues: GitHub private email                             │
│                                                             │
│ 2. User Object → JWT Payload ⚠️ BUG HISTORY (Oct 21)        │
│    Files: lib/auth/token-manager.ts:mintMcpToken            │
│    (U2 Phase A consolidation — was mcp-server-http-clean.js │
│    line 867 pre-U2)                                         │
│    Contract: { sub, email, role, scope, azp, jti }          │
│    Fix: Added email, role to payload                        │
│                                                             │
│ 3. JWT String → Decoded JWT                                 │
│    Files: lib/jwt.ts line 50                                │
│    Contract: { sub, email, role, iss, aud, exp }            │
│    Issues: Algorithm mismatch, expired tokens               │
│                                                             │
│ 4. Decoded JWT → AuthUser ⚠️ BUG HISTORY (Oct 21)           │
│    Files: lib/auth/get-auth-user.ts line 30                 │
│    Contract: { userId, email, role }                        │
│    Fix: Upstream - added to JWT payload                     │
│                                                             │
│ 5. AuthUser → req.user ⚠️ BUG HISTORY (Oct 20)              │
│    Files: lib/auth/oauth/auth-manager.ts:populateReqUser    │
│    (Wave 3a Phase 3.6 consolidation — was mcp-server-       │
│    http-clean.js:1059 pre-Wave-3a)                          │
│    Contract: { id, email, role, token, azp, authMethod }   │
│    Fix: Added token field to req.user (Oct 20); azp added   │
│    U2 Phase D (2026-05-19) for per-call mint forensics      │
│                                                             │
│ 6. req.user → API Headers                                   │
│    Files: lib/mcp/server/middleware/context-enricher.js:28  │
│    Contract: { Authorization: Bearer ${token} }             │
│    Issues: Undefined token, wrong token type                │
│                                                             │
│ 7. AuthUser → RBAC Query ⚠️ BUG HISTORY (Oct 21)            │
│    Files: app/api/pov/route.ts line 176                     │
│    Contract: { userId, role }                               │
│    Fix: Upstream - added role to JWT                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Validation Commands Summary

```bash
# Quick health check of all 7 boundaries
echo "=== Boundary Health Check ==="

# Boundary 2: JWT Payload includes email/role
grep -A 15 "const payload = {" mcp-server-http-clean.js | grep "email:\|role:"

# Boundary 4: getAuthUser extracts email/role
grep -A 10 "const user = {" lib/auth/get-auth-user.ts | grep "email\|role"

# Boundary 5: req.user includes token
grep -A 15 "req.user = {" mcp-server-http-clean.js | grep "token:"

# Boundary 7: RBAC uses role
grep -A 10 "user\\.role === 'DEMO_USER'" app/api/pov/route.ts

echo "✅ All critical fields present across boundaries"
```

---

### Part 9: React Async Error Handling Discovery ⭐ NEW 2025-11-02

**Purpose**: Discover double catch pattern usage and identify silent failure risks
**Source**: Week 6 silent failure debugging (3 bugs fixed)

#### Find Double Catch Pattern Usage

```bash
# Find all uses of double catch pattern
echo "=== Double Catch Pattern Usage (Preventing Silent Failures) ==="
grep -rn "\.catch((err\|\.catch((error" components/ --include="*.tsx" -B 5 -A 5

# Expected pattern:
# handleSubmit(e).catch((err) => {
#   toast({ title: 'Failed', description: err.message });
# });

# Count usage
echo "Total double catch patterns: $(grep -r "\.catch((err\|\.catch((error" components/ --include="*.tsx" | wc -l)"
```

#### Find Async Handlers WITHOUT Double Catch (Risk!)

```bash
# Find async form handlers
echo "=== Async Form Handlers (should have double catch) ==="
grep -rn "onSubmit={" components/ --include="*.tsx" -A 2 | grep -i "async\|handle"

# Find async button handlers
echo "=== Async Button Handlers (should have double catch) ==="
grep -rn "onClick={" components/ --include="*.tsx" -A 2 | grep -i "async\|handle"

# Find async select handlers
echo "=== Async Select Handlers (should have double catch) ==="
grep -rn "onValueChange={" components/ --include="*.tsx" -A 2 | grep -i "async\|handle"

# Check which DON'T have .catch()
echo "=== Potential Silent Failure Risks ==="
grep -rn "onSubmit={handle\|onClick={handle\|onValueChange={handle" components/ \
  --include="*.tsx" -A 3 | grep -v "\.catch(" | head -20

# If results found: Likely missing double catch pattern
```

#### Validate Defense-in-Depth Layers

```bash
# Check for all 4 error handling layers
echo "=== Defense-in-Depth Layer Detection ==="

echo "Layer 1 (Backend Validation):"
grep -rn "safeParse\|\.parse(" app/api/ lib/*/handlers/ --include="*.ts" | wc -l

echo "Layer 2 (Backend Authorization):"
grep -rn "canManage\|checkPermission\|validatePOVAccess" app/api/ --include="*.ts" | wc -l

echo "Layer 3 (Frontend Try-Catch):"
grep -rn "catch (error" components/ --include="*.tsx" | wc -l

echo "Layer 4 (Frontend Promise Catch):"
grep -rn "\.catch((err\|\.catch((error" components/ --include="*.tsx" | wc -l

echo "Coverage: All 4 layers present?"
```

#### Find Components Missing Error Handling

```bash
# Find async functions in components without try-catch
echo "=== Async Functions Without Error Handling ==="
grep -rn "const.*= async\|async function" components/ --include="*.tsx" -A 20 | \
  grep -v "try {" -A 15 | grep "fetch\|await" | head -20

# Find fetch calls without error handling
echo "=== Fetch Calls Without Try-Catch ==="
grep -rn "await fetch\|fetch(" components/ --include="*.tsx" -B 5 | \
  grep -v "try {" -B 5 | head -20
```

---

### Part 10: React Hook Dependency Array Boundary Discovery ⭐ NEW 2025-12-29

**Purpose**: Discover stale closure bugs where useCallback/useEffect functions use props/state not in dependency arrays
**Source**: TaskActivityTimeline POV filtering bug (f55168c)
**Boundary**: Props/State → Hook Closure → Function Execution

#### Find All Hook Dependency Arrays

```bash
echo "=== React Hook Dependency Arrays (useCallback/useEffect) ==="

# Find all useCallback dependency arrays
grep -rn "}, \[" components/ --include="*.tsx" -A 1 | grep -E "useCallback|const.*=.*useCallback"

# Example output:
# components/tasks/TaskActivityTimeline.tsx:269:  }, [taskId, actionFilter, userFilter];
#                                                    ^^^^^^  ^^^^^^^^^^^^  ^^^^^^^^^^
# Check: Are all function params/state included?
```

#### Detect Stale Closure Bugs (Missing Dependencies)

```bash
echo "=== Potential Stale Closure Bugs ==="

# Step 1: Find components with props that should be in deps
# Look for: Component receives povId prop + useCallback dependency array
grep -rn "export function.*{.*povId" components/ --include="*.tsx" -A 100 | \
  grep -B 5 "}, \[" | \
  grep -v "povId" | head -30

# Step 2: Find useCallback using props not in deps
# Pattern: Function uses variable but it's not in dependency array
grep -rn "useCallback.*{" components/ --include="*.tsx" -A 20 | \
  grep -B 15 "}, \[" | head -50

# Manual verification needed:
# - Does function body use variables?
# - Are ALL those variables in dependency array?
# - Missing = stale closure bug
```

#### Cross-Reference Function Signature vs Dependencies

```bash
echo "=== Function Signature vs Dependency Array Comparison ==="

# For a specific component (replace with actual path):
COMPONENT="components/tasks/TaskActivityTimeline.tsx"

echo "1. Function parameters:"
grep -n "export function.*{" $COMPONENT

echo "2. Dependency arrays:"
grep -n "}, \[" $COMPONENT

echo "3. Variables used in useCallback:"
grep -A 50 "useCallback(async () =>" $COMPONENT | grep -E "taskId|povId|filter" | head -10

# Manual comparison:
# - List all params from step 1
# - List all deps from step 2
# - Find params used in step 3 but missing from step 2
# - Missing = boundary contract violation
```

#### Symptoms to Look For

**User reports:**
- "Selection doesn't update data"
- "Filter doesn't work after changing"
- "Hard refresh fixes it"
- "Shows old/stale data"

**Quick Test:**
```bash
# If user reports stale data after prop change:
COMPONENT_PATH="[path to component]"

echo "Finding dependency issues in: $COMPONENT_PATH"

# 1. Get all useCallback/useEffect
grep -n "useCallback\|useEffect" $COMPONENT_PATH

# 2. For each, check its dependency array
grep -n "}, \[" $COMPONENT_PATH

# 3. Look for prop names in function but not in deps
# Example: "povId" appears in function body but not in deps array
```

#### Validation Pattern

```bash
echo "=== React Hook Boundary Contract Validation ==="

# Find all useCallback functions and their dependencies
grep -rn "const.*useCallback" components/ --include="*.tsx" -A 1 | \
  grep "}, \[" | \
  sed 's/.*}, \[/Deps: [/' | \
  head -20

# For each result, manually verify:
# - Does function use props not in deps array?
# - Does function use state not in deps array?
# - Missing = stale closure boundary bug
```

#### Example Findings

**Good Pattern (Correct Boundary)**:
```typescript
// TaskActivityTimeline.tsx (AFTER FIX)
const fetchActivities = useCallback(async () => {
  const params = new URLSearchParams({
    taskId,   // ✅ In deps
    povId,    // ✅ In deps
    actionFilter,  // ✅ In deps
  });
}, [taskId, povId, actionFilter, userFilter, dateFilter, maxItems]);
   // ^^^^^^  ^^^^^ ^^^^^^^^^^^^ ^^^^^^^^^^  ^^^^^^^^^^  ^^^^^^^^
   // All used variables present in deps ✅
```

**Bad Pattern (Broken Boundary)**:
```typescript
// TaskActivityTimeline.tsx (BEFORE FIX)
const fetchActivities = useCallback(async () => {
  const params = new URLSearchParams({
    taskId,   // ✅ In deps
    povId,    // ❌ NOT in deps - STALE CLOSURE BUG!
    actionFilter,  // ✅ In deps
  });
}, [taskId, actionFilter, userFilter, dateFilter, maxItems]);
   // ^^^^^^  Missing povId! ❌
```

**Detection:**
```bash
# In TaskActivityTimeline.tsx
grep -n "povId" components/tasks/TaskActivityTimeline.tsx
# Line 117: povId,  (in function params)
# Line 145: ...(povId && { povId }),  (used in function body)

grep -n "}, \[" components/tasks/TaskActivityTimeline.tsx
# Line 269: }, [taskId, actionFilter, ...];  (NO povId!)
# BUG DETECTED: povId used but not in deps ❌
```

**Fix Time**: 2 minutes (grep pattern) vs 2 hours (traditional debugging)

---

---

### Part 11: MCP Transport Boundary Coercion Discovery ⭐ NEW 2026-02-15

**Objective**: Detect unguarded MCP transport boundaries where tool arguments may arrive as stringified JSON instead of objects, causing Zod `.parse()` failures or Prisma Json column corruption.

**Background**: MCP transports (stdio, SSE, HTTP) may silently serialize nested objects to JSON strings. The `ensureObject` utility (`lib/utils/ensure-object.ts`) guards against this. All known sites were protected in Feb 2026 (commit 82c40f9f), but new callTool sites may be added.

#### Step 1: Find All callTool Entry Points

```bash
echo "=== All CallToolRequestSchema handlers (transport entry points) ==="
grep -rn "CallToolRequestSchema" --include="*.ts" --include="*.js" | grep -v node_modules | grep -v ".d.ts"

echo ""
echo "=== All callTool() call sites (transport exits) ==="
grep -rn "\.callTool(" --include="*.ts" --include="*.js" | grep -v node_modules | grep -v ".d.ts"
```

#### Step 2: Verify Each Has ensureObject Guard

```bash
echo "=== Sites WITH ensureObject guard ==="
grep -rn "ensureObject" --include="*.ts" --include="*.js" | grep -v node_modules | grep -v ".d.ts" | grep -v "ensure-object\."

echo ""
echo "=== REGRESSION CHECK: .parse() on raw args without guard ==="
# These should return ZERO results if all sites are protected
grep -rn "\.parse(request\.params\.arguments)" services/ --include="*.ts"
grep -rn "\.parse(args)" services/ --include="*.ts" | grep -v ensureObject
```

#### Step 3: Check Docker Services (Standalone - Cannot Import from lib/)

```bash
echo "=== Docker service CallToolRequestSchema handlers ==="
grep -rn "CallToolRequestSchema" services/*/src/index.ts

echo ""
echo "=== Docker services with inline ensureObject ==="
grep -rn "function ensureObject" services/*/src/index.ts

echo ""
echo "=== UNGUARDED Docker services ==="
# Cross-reference: services with CallToolRequestSchema but WITHOUT ensureObject
for svc in services/*/src/index.ts; do
  has_handler=$(grep -c "CallToolRequestSchema" "$svc")
  has_guard=$(grep -c "ensureObject" "$svc")
  if [ "$has_handler" -gt 0 ] && [ "$has_guard" -eq 0 ]; then
    echo "  ❌ UNGUARDED: $svc"
  fi
done
```

#### Step 4: Check Prisma Json Column Writes

```bash
echo "=== Prisma writes that may store stringified args ==="
# Look for patterns where args go directly to Prisma Json columns
grep -rn "parameters:.*args\|parameters:.*arguments" --include="*.ts" --include="*.js" | grep -v node_modules

echo ""
echo "=== Verify ensureObject is applied BEFORE Prisma writes ==="
# In mcp-server-v5.js, the guard must be before the mcpInteraction.create()
grep -n "ensureObject\|mcpInteraction\.create\|parameters:" mcp-server-v5.js | head -10
```

#### Step 5: Validate Guard Placement

```bash
echo "=== Known protected sites (should match 15 files) ==="
echo "Hub (import from lib/utils/ensure-object):"
grep -rln "require.*ensure-object\|import.*ensure-object" --include="*.ts" --include="*.js" | grep -v node_modules | grep -v "ensure-object\."

echo ""
echo "Docker (inline function):"
grep -rln "function ensureObject" services/ --include="*.ts"
```

#### Expected Results (Feb 2026 Baseline)

**Protected sites (14 total, down from 15 after Phase 2.P0 step 3 Apr 8 2026)**:
- `mcp-server-v5.js` - require + guard before Prisma write
- ~~`mcp-embedded-bridge.js`~~ — **DELETED Apr 8 2026** (Phase 2.P0 step 3, dead code with no live launcher). Bug Class 73 eradication incidentally removed this file.
- `lib/mcp/embedded-server.ts` - import + defense-in-depth
- `lib/services/mcp/mcpService.ts` - import + gateway guard
- `lib/mcp/server/tools/hub/service-call-handler.js` - require + inner args guard
- `lib/mcp/server/tools/hub/workflow-tools-handler.js` - require + step args guard
- `lib/services/workflow/integrations/service-caller.ts` - import + orchestration guard
- 6x `services/*/src/index.ts` - inline function + guard before `.parse()`

**Intentionally excluded**:
- `lib/services/agentExecutionEngine.ts` - Different semantics (LLM response parsing, `{ raw: string }` fallback is intentional)
- `app/api/mcp/tasks/action/route.ts` - Has its own guard with Claude Desktop-specific error messages

**References**:
- Utility: `lib/utils/ensure-object.ts` / `.js`
- Pattern: `/.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md`
- Gold standard: `/.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md`
- Review: `cline_docs/reviews/ensure-object-utility-2026-02-15/confidence-assessment.md`

---

### Part 13: MCP Context → TokenPayload Boundary ⭐ NEW 2026-03-09

**Objective**: Validate the token forwarding chain from MCP HTTP server through context-enricher to API route JWT verification — the boundary where MCP user identity crosses into the API auth layer.

**Background**: The perform tool three-tier fallback (Mar 2026) relies on this chain: `mcp-server-http-clean.js` sets `req.user.token` → `setUserContext` → `context-enricher` maps to `apiUserContext.token` → `api-client` sends as Authorization header → `createHandler` verifies JWT. A break at any point causes admin auth fallback (security gap).

#### Step 1: Token Inclusion at MCP HTTP Server

```bash
echo "=== Token set in req.user (3 auth paths) ==="
grep -n "token:" mcp-server-http-clean.js | grep "req.user\|oauthUser" | head -5

echo ""
echo "=== Token forwarded in setUserContext ==="
grep -n "token.*user\.token\|setUserContext" mcp-server-http-clean.js | grep -v "//\|log" | head -5
```

#### Step 2: Context Enricher Token Mapping

```bash
echo "=== Context enricher maps token to apiUserContext ==="
grep -n "token" lib/mcp/server/middleware/context-enricher.js | head -5

echo ""
echo "=== isAuthenticated checks token presence ==="
grep -n "isAuthenticated\|apiUserContext.*token" lib/mcp/server/middleware/context-enricher.js | head -5
```

#### Step 3: API Client Token Usage and Fallback

```bash
echo "=== API client reads token from userContext ==="
grep -n "userContext.*token\|Authorization.*Bearer" lib/mcp/server/utils/api-client.js | head -5

echo ""
echo "=== Admin auth fallback (should be blocked on writes) ==="
grep -n "ADMIN\|adminAuth\|fallback" lib/mcp/server/utils/api-client.js | head -5
```

#### Step 4: buildTokenPayload Guards

```bash
echo "=== buildTokenPayload validation ==="
grep -n "buildTokenPayload\|email.*guard\|role.*enum\|empty.*string" lib/mcp/server/utils/build-token-payload.js | head -10
```

**Crossing Points**:
1. `mcp-server-http-clean.js` → `req.user = { id, email, role, token }` (3 auth paths: RS256, HS256, OAuth)
2. `context-enricher.js` → `apiUserContext.token = user.token`
3. `api-client.js` → `Authorization: Bearer ${token}` (or admin fallback if missing)

---

### Part 14: Multi-Surface Error-Shape Boundary ⭐ NEW 2026-04-18

**Objective**: For plans that cross >2 user-facing error surfaces (MCP throw + SSE event + HTTP response + error.json artifact + client library), verify every surface emits a consistent structured shape so GUI error-rendering logic can be shared.

**Session evidence**: The Apr 2026 race-fix review shipped 7 specialists in sequence; boundary-contract was added LATE (after the first 5 completed) and caught 4 CRITICAL shape-contract bugs the others missed — an SSE shape incompatible with the GUI `sseUtils` consumer, a writer-scope bug that would have crashed at runtime, an HTTP 409 that bypassed `createHandler` convention, and an untyped MCP error missing the `.code` discriminator. Lesson: **boundary-contract is now standing roster for any plan with >2 user-facing error surfaces**, not a late-stage gate.

#### Step 1: Find Error-Emission Surfaces Per Plan

```bash
echo "=== MCP-path typed errors (throw with .code) ==="
# MCP-visible errors should use ApiError(ErrorCode.*) or a typed subclass —
# never a plain new Error() (would lose the .code discriminator GUIs use).
grep -rn '^export class .* extends AppError' lib/errors.ts
echo "AppError-derived classes with .code discriminator"

echo ""
echo "=== SSE-path error emissions (must match GUI sseUtils consumer) ==="
# GUI consumer at lib/pov/api/agent-service.ts:701-705 switches on
# event.data.type === 'error' and reads data.error.message. Flat shapes
# won't reach the handler.
grep -rn "type: 'error'" app/api --include='*.ts'
grep -rn 'data: \${JSON.stringify.*type:.*error' app/api --include='*.ts'

echo ""
echo "=== HTTP route conventions (createHandler vs NextResponse.json) ==="
# Routes wrapped by createHandler should return {error:{message,code}},
# NOT call NextResponse.json() directly. Check for the mixed pattern.
grep -rln 'createHandler' app/api --include='*.ts' | head -10
grep -rn 'return NextResponse\.json.*status:\s*[45]' app/api --include='*.ts' | head -10
```

#### Step 2: Verify Canonical Error-Code Consistency

```bash
echo "=== Error-code canonical check ==="
# Same conceptual error should have ONE canonical code across all surfaces.
# The Apr 2026 race-fix caught a file emitting both 'ALREADY_RUNNING' and
# the new 'DUPLICATE_ACTIVE_EXECUTION' for the same condition — confusing
# for consumers.
grep -rn "code:\s*'[A-Z_]\+'" app/api/ lib/services/ --include='*.ts' | \
  awk -F"'" '{print $2}' | sort | uniq -c | sort -rn | head -20
echo "If any code appears only once, it's likely the Odd-One-Out (potential split)"
```

#### Step 3: Discriminated-Union API Shape Enforcement

```bash
echo "=== API responses with variant-dependent fields ==="
# If an API returns {role, siblings?, parentHarness?} with optional fields
# that depend on role, the TS union should be discriminated not loose.
grep -rn 'z\.discriminatedUnion' lib/validation/
echo "Discriminated-union schemas (runtime enforcement)"

grep -rn 'export type [A-Z][a-zA-Z]* =\s*$' --include='*.ts' | head -10
echo "TS types split over multiple lines — check if they should be discriminated unions"
```


### Part 12: Pino Structured Logging for Boundary Diagnostics (condensed — Phase 2 trim, 2026-06-11)

API usage + logger taxonomy: pattern #43 (`pino-structured-logging-pattern.md`) + the library §Pino.
Production boundary-debug commands (the derive-state part — kept):

```bash
pm2 logs paichart --lines 200 --nostream | grep '"domain":"auth"' | jq 'select(.level >= 40)'
pm2 logs paichart --lines 200 --nostream | grep '"domain":"api"' | jq 'select(.boundary != null)'
pm2 logs paichart --lines 200 --nostream | grep '"domain":"mcp"' | jq 'select(.coercion != null)'
pm2 logs paichart --lines 500 --nostream | grep '"level":50' | jq '{domain, msg, err: .err.message}'
```

## Wave 6 Update — RouteContext Interface (May 21, 2026)

**Wave 6 Phase 6.1** (commit `835bbd76`) introduced a NEW cross-boundary contract:

**`RouteContext` interface** at `lib/mcp/server/routes/route-context.ts` — 13-field dependency-injection contract between the server class and the 5 extracted route files (`health-routes.ts`, `oauth-discovery-routes.ts`, `oauth-flow-routes.ts`, `mcp-transport-routes.ts`). This is now the canonical boundary between Express setup and route-handler bodies.

### Critical pattern — Lazy accessors

`RouteContext.getAuthMiddleware()` + `RouteContext.getMcpServer()` are **deferred-resolution thunks**, NOT pre-computed values. This preserves the Wave 4 Phase 4.4 SEC-C4 lesson: do not invoke `authManager.createMiddleware()` at route-registration time, only at first-request time.

```typescript
// lib/mcp/server/routes/route-context.ts
export interface RouteContext {
  app: Application;
  // ... data fields ...
  getAuthMiddleware: () => RequestHandler;  // LAZY — defers createMiddleware()
  getMcpServer: () => PureSDKNativeServerType | null;  // LAZY — survives null at registration
  // ... helper-delegate fields ...
}
```

The server class constructs this via `_buildRouteContext()` (new method, commit `7ace95b7`).

### Boundary-validation test discipline

`scripts/test-routes-orchestrator.ts` Test 4 pins the SEC-C4 invariant: `getMcpServer()` is called 0 times during `registerAllRoutes()` (lazy survives nil-construction). `getAuthMiddleware()` may be called ≤1 time (mcp-transport-routes legitimately grabs the wrapper once for both R11 chain-auth and R12 inner-closure-auth).

### When auditing this boundary

1. Any new field added to `RouteContext` MUST follow the lazy-accessor pattern if it depends on construction-order-sensitive state.
2. Any new sub-registrar MUST type its `ctx.X` access through the interface, not cast to `any`.
3. The Plan v2 D11 LOCKED INVARIANT (OAuth audience = `requestedResource || front door`) crosses through `RouteContext.sessionStore` → R7/R8/R9; if you're adding per-service audience logic, see the `oauth-flow-routes.ts` file-header NOT this boundary.

@see `lib/mcp/server/routes/route-context.ts`
@see `scripts/test-routes-orchestrator.ts`
@see `cline_docs/reviews/express-routes-extraction-2026-05-21/express-routes-extraction-plan-v2.md`


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