# OAuth Timeout Settings Explained

> **Understanding the three OAuth timeout constants in pAIchart MCP Server**
>
> Version 1.0 | Created: 2026-02-02 | Audience: Developers, Operators

---

## Quick Reference

**Three timeout constants** (lib/auth/auth-constants.ts (Wave 3a Phase 3.1 — was mcp-server-http-clean.js:92 pre-Wave-3a)-94):

```javascript
static TOKEN_TTL_SECONDS = 43200;  // 12 hours - Access token lifetime
static OAUTH_STATE_TTL_MS = 15 * 60 * 1000;  // 15 minutes - OAuth state expiration
static REFRESH_TOKEN_TTL_DAYS = 7;  // 7 days - Refresh token lifetime
```

**Purpose**: Three different lifetimes for three different OAuth components.

---

## 1. TOKEN_TTL_SECONDS (Access Token)

### What It Is

**The JWT access token** that clients use for every API/MCP request.

**Current setting**: 43200 seconds (12 hours)

**Location**: `lib/auth/auth-constants.ts (Wave 3a Phase 3.1 — was mcp-server-http-clean.js:92 pre-Wave-3a)`

---

### Purpose

Authenticates each API call - clients include this token in every request:

```javascript
// Client sends with every request
Authorization: Bearer eyJhbGci...  // ← This token expires after TOKEN_TTL_SECONDS
```

---

### Lifecycle

```
User authenticates → Get access token
  ↓
Use for API calls (valid for 12 hours)
  ↓
Token expires after 12 hours
  ↓
Client tries refresh_token grant (get new access token)
  OR
Client re-authenticates (full OAuth flow)
```

**Example timeline**:
```
9:00 AM: Authenticate → Get 12-hour token
9:00 AM - 9:00 PM: Use token for all API calls ✅
9:00 PM: Token expires → Need new token
```

---

### Historical Context

**Evolution**:
- **Original**: 8 hours (commit 109dc8c)
- **Oct 2025**: Reverted to 15 minutes (commit d4572274)
  - Reason: In-memory refresh tokens lost on server restart
  - Solution: Short TTL tolerates restart timing
- **Feb 2026**: Increased to 12 hours (commit 54b9b0fe)
  - Reason: Better UX, full work day coverage
  - Risk: Server restart during 12h window → Must re-auth

**The trade-off**:
- **Short TTL** (15 min): Restart-tolerant, frequent refresh
- **Long TTL** (12 hours): Better UX, restart-sensitive

---

### Industry Standards

| Provider | Access Token TTL |
|----------|------------------|
| Google | 1 hour |
| Microsoft | 1-2 hours |
| GitHub | Indefinite (PAT) or 8 hours |
| AWS | 8-12 hours |
| **pAIchart** | **12 hours** |

**Assessment**: pAIchart's 12 hours is on the longer end but within industry standards.

---

### Security Implications

**Longer TTL**:
- ⚠️ Stolen token valid for 12 hours (longer attack window)
- ✅ Mitigated by: Logout revocation, password change invalidation, rate limiting

**Shorter TTL**:
- ✅ Stolen token expires quickly (15 minutes)
- ⚠️ More frequent refresh (more opportunities for interception)

**Accepted risk**: 12 hours is acceptable (much shorter than 7-day refresh tokens)

---

## 2. OAUTH_STATE_TTL_MS (OAuth State Parameter)

### What It Is

**CSRF protection code** used during OAuth authorization flow (NOT a token!).

**Current setting**: 900000 ms (15 minutes)

**Location**: `lib/auth/auth-constants.ts (Wave 3a Phase 3.1 — was mcp-server-http-clean.js:93 pre-Wave-3a)`

---

### Purpose

**Prevents OAuth hijacking attacks** by ensuring the authorization callback came from a legitimate request:

```
Server generates random state: "abc123xyz"
  ↓
Redirect to GitHub: github.com/login?state=abc123xyz
  ↓
User approves on GitHub
  ↓
GitHub redirects back: paichart.app/callback?state=abc123xyz
  ↓
Server validates state matches (CSRF protection)
  ↓
State deleted (one-time use!)
```

---

### Lifecycle

```
Create state: 9:00:00 AM
  ↓
User approves on GitHub: 9:00:30 AM (typically 30 seconds later)
  ↓
Callback validates state: 9:00:31 AM
  ↓
State deleted (used once, discarded)
  ↓
Total lifetime: 31 seconds (of 15-minute allowance)
```

**Why 15 minutes**: Gives user plenty of time to complete OAuth flow.

**Actual usage**: Usually completes in < 1 minute.

---

### Security Model

**Attack scenario prevented**:
```
Attacker intercepts authorization URL
  ↓
Attacker tries to use victim's OAuth callback
  ↓
Server checks state parameter
  ↓
State doesn't match (or expired) → Reject ❌
```

**Why one-time use**: State is deleted immediately after successful callback.

**Why expiration**: Old authorization requests should fail (prevents replay attacks).

---

### This is NOT a Token

**Important distinction**:
- OAuth state: Temporary CSRF protection (seconds)
- Access token: Authentication credential (hours)
- Refresh token: Renewal mechanism (days)

**State lifecycle**:
- Created: When user clicks "Authenticate"
- Used: When OAuth callback returns
- Deleted: Immediately after validation (success or fail)
- **Never cached client-side** (server-side only)

---

## 3. REFRESH_TOKEN_TTL_DAYS (Refresh Token)

### What It Is

**Long-lived token** that clients use to get new access tokens without re-authenticating.

**Current setting**: 7 days

**Location**: `lib/auth/auth-constants.ts (Wave 3a Phase 3.1 — was mcp-server-http-clean.js:94 pre-Wave-3a)`

---

### Purpose

**Enables silent token renewal** - users don't re-authenticate for 7 days:

```
Initial OAuth → Get access_token (12h) + refresh_token (7d)
  ↓
Use access_token for 12 hours
  ↓
Access token expires
  ↓
Client sends refresh_token to server
  ↓
Server returns new access_token (12h) + new refresh_token (7d)
  ↓
Repeat for 7 days without user interaction
```

---

### Lifecycle

```
Issue refresh token: Monday 9:00 AM
  ↓
Access tokens expire every 12 hours (9 PM, 9 AM next day, etc.)
  ↓
Refresh token renews them silently (no user interaction)
  ↓
Refresh token expires: Next Monday 9:00 AM (7 days later)
  ↓
Full re-authentication required
```

**Example**: User authenticates once on Monday, doesn't re-auth until next Monday (7 days).

---

### Storage Problem

**Critical issue**: Refresh tokens stored in-memory (`new Map()`):

```typescript
// lib/auth/oauth/mcp-oauth-token-manager.ts (was `.js` until Phase 2 proper / Bug Class 73
// eradication Apr 8 2026; the .js sibling had drifted 82 lines behind the .ts for ~6 weeks)
MCPOAuthTokenManager.refreshTokens = new Map();  // ❌ Lost on server restart!
```

**What happens on server restart**:
```
User authenticated at 9:00 AM
  ↓
Access token valid until 9:00 PM (12 hours)
  ↓
Server restarts at 3:00 PM
  ↓
In-memory refresh tokens cleared (new Map())
  ↓
At 9:00 PM: Access token expires
  ↓
Client tries refresh_token grant
  ↓
Server: "Invalid refresh token" (not in memory) ❌
  ↓
Client: Must re-authenticate
```

**This is why 15-minute TTL was chosen** (Oct 2025): Frequent refresh tolerates restart timing.

---

### Security Implications

**Refresh tokens are powerful**:
- ✅ Can mint new access tokens for 7 days
- ❌ If stolen, attacker has 7-day access window
- ❌ If database compromised, all refresh tokens exposed

**Why in-memory storage**:
- ✅ Not persisted in database (can't steal from DB breach)
- ✅ Lost on restart (limits exposure window)
- ⚠️ Trade-off: UX vs security

**Industry practice**: Most platforms store in database with encryption (Auth0, Okta, Google).

---

## How They Work Together

### OAuth Flow Timeline

**Step 1: Initial Authentication** (Full OAuth Flow)

```
User → "Authenticate with GitHub"
  ↓
Server creates state: "abc123" (TTL: 15 min)
  ↓
Redirect to GitHub
  ↓
User approves (< 1 min typically)
  ↓
GitHub callback with state: "abc123"
  ↓
Server validates state (CSRF check) ✅
  ↓
Server exchanges code for tokens
  ↓
Server mints first-party tokens:
  - access_token: 12-hour JWT
  - refresh_token: 7-day token
  ↓
Server deletes state (one-time use)
  ↓
Returns tokens to client
```

**Timeouts used**:
- ✅ OAuth state: 15 minutes (user has time to approve)
- ✅ Access token: 12 hours (issued now)
- ✅ Refresh token: 7 days (issued now)

---

**Step 2: Normal API Usage** (0-12 hours)

```
Client makes API request
  ↓
Includes: Authorization: Bearer [12-hour access token]
  ↓
Server validates JWT
  ↓
Request succeeds ✅
```

**Timeouts used**:
- ✅ Access token: Checked on every request (valid for 12h)
- ❌ OAuth state: Not involved (only during initial auth)
- ❌ Refresh token: Not used yet (access token still valid)

---

**Step 3: Token Refresh** (After 12 hours)

```
Access token expires (12 hours later)
  ↓
Client sends refresh_token grant:
  POST /oauth/token
  {
    grant_type: "refresh_token",
    refresh_token: "..."
  }
  ↓
Server looks up refresh token in Map
  ↓
Server validates token not expired (< 7 days)
  ↓
Server mints NEW access token (12h)
  ↓
Server mints NEW refresh token (7d, rotation)
  ↓
Server deletes old refresh token
  ↓
Returns new tokens to client
```

**Timeouts used**:
- ✅ Access token: New 12-hour token issued
- ❌ OAuth state: Not involved (no redirect flow)
- ✅ Refresh token: Checked (< 7 days?), rotated

---

**Step 4: After Server Restart** (The Problem)

```
Server restarts (in-memory Map cleared)
  ↓
Client tries refresh_token grant
  ↓
Server: "Refresh token not found" (Map empty) ❌
  ↓
Client: Must re-authenticate (back to Step 1)
```

**Timeouts involved**:
- Access token: Might still be valid (if restart recent)
- Refresh token: LOST (in-memory storage cleared)
- OAuth state: Created fresh for re-auth flow

---

## Configuration Trade-Offs

### Scenario 1: Short Access Token (15 min) ✅ PROVEN

**Settings**:
```javascript
TOKEN_TTL_SECONDS = 900;  // 15 minutes
REFRESH_TOKEN_TTL_DAYS = 7;  // 7 days
```

**Behavior**:
- Client refreshes every 15 minutes (automatic, silent)
- Server restarts tolerated (token often still valid)
- Even if refresh fails, re-auth happens quickly (15 min)

**UX**: Acceptable (auto-refresh is invisible to user)

**Stability**: ✅ Proven (Oct 2025 - Feb 2026)

---

### Scenario 2: Long Access Token (12 hours) ⚠️ RESTART-SENSITIVE

**Settings**:
```javascript
TOKEN_TTL_SECONDS = 43200;  // 12 hours
REFRESH_TOKEN_TTL_DAYS = 7;  // 7 days
```

**Behavior**:
- Client refreshes every 12 hours (infrequent)
- Server restart during 12h window → Refresh fails
- Users must re-authenticate after restarts

**UX**: Better (fewer refreshes) BUT interrupted by restarts

**Stability**: ⚠️ Tested Oct 2025, failed due to in-memory issue

---

### Scenario 3: Database Persistence (Future)

**Settings**:
```javascript
TOKEN_TTL_SECONDS = 43200;  // 12 hours
REFRESH_TOKEN_TTL_DAYS = 7;  // 7 days
// + Database storage for refresh tokens
```

**Behavior**:
- Long-lived access tokens (12 hours)
- Refresh tokens survive server restarts (database)
- Seamless UX (no interruptions)

**Requirements**:
- ✅ Database schema (RefreshToken model exists)
- ⚠️ Encryption needed (security requirement)
- ⚠️ 15-20 hours implementation + KMS setup

**Security**: Database breach exposes all refresh tokens (requires encryption)

---

## Comparison Table

| Setting | Access TTL | Refresh Behavior | Restart Impact | UX Quality | Security Risk |
|---------|-----------|------------------|----------------|------------|---------------|
| **15-min (current proven)** | 15 min | Every 15 min | Tolerant ✅ | Good | Low (3/10) |
| **12-hour (experimental)** | 12 hours | Every 12h | Sensitive ❌ | Better | Low (4/10) |
| **12h + Database** | 12 hours | Every 12h | Tolerant ✅ | Best | Medium (7/10)* |

*Requires encryption to reduce to 4/10

---

## How to Change Settings

### Access Token TTL

**File**: `lib/auth/auth-constants.ts (Wave 3a Phase 3.1 — was mcp-server-http-clean.js:92 pre-Wave-3a)`

```javascript
// Current: 12 hours
static TOKEN_TTL_SECONDS = 43200;

// Conservative: 15 minutes (proven stable)
static TOKEN_TTL_SECONDS = 900;

// Aggressive: 24 hours (not recommended without database)
static TOKEN_TTL_SECONDS = 86400;
```

**After changing**:
```bash
git commit -m "fix(oauth): Adjust access token TTL to X hours"
git push origin main
# GitHub Actions deploys automatically
```

**Impact**: All new authentications use new TTL (existing tokens unaffected).

---

### OAuth State TTL

**File**: `lib/auth/auth-constants.ts (Wave 3a Phase 3.1 — was mcp-server-http-clean.js:93 pre-Wave-3a)`

```javascript
// Current: 15 minutes
static OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

// Conservative: 5 minutes (most OAuth flows complete in < 1 min)
static OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

// Generous: 30 minutes (if users are slow to approve)
static OAUTH_STATE_TTL_MS = 30 * 60 * 1000;
```

**Recommendation**: Keep at 15 minutes (good balance, rarely hits limit).

---

### Refresh Token TTL

**File**: `lib/auth/auth-constants.ts (Wave 3a Phase 3.1 — was mcp-server-http-clean.js:94 pre-Wave-3a)`

```javascript
// Current: 7 days
static REFRESH_TOKEN_TTL_DAYS = 7;

// Conservative: 1 day (more frequent re-auth)
static REFRESH_TOKEN_TTL_DAYS = 1;

// Generous: 30 days (industry standard for some providers)
static REFRESH_TOKEN_TTL_DAYS = 30;
```

**Limitation**: With in-memory storage, longer TTL doesn't help if server restarts frequently.

**Recommendation**: Keep at 7 days (industry standard, balances UX vs security).

---

## Decision Framework

### When to Use Short Access Token (15 min)

✅ **Use 15-minute TTL when**:
- Refresh tokens stored in-memory (current state)
- Server restarts are common (development, frequent deploys)
- Stability prioritized over UX
- Proven solution needed (tested since Oct 2025)

**Example**: Production with in-memory refresh tokens (current architecture)

---

### When to Use Long Access Token (12 hours)

✅ **Use 12-hour TTL when**:
- Refresh tokens persisted in database
- Server restarts are rare (stable production)
- UX prioritized over restart tolerance
- Willing to accept occasional re-auth after restarts

**Example**: Stable production with database-persisted refresh tokens

---

### When to Implement Database Persistence

✅ **Implement database persistence when**:
- Need long access tokens (8-12 hours) for better UX
- Can implement encryption (AES-256 or KMS)
- Willing to invest 15-20 hours implementation
- Security team approves encrypted token storage

**Requirements**:
- Database schema (exists: RefreshToken model)
- Encryption (AES-256-GCM or AWS KMS)
- Cleanup job (hourly, remove expired)
- Monitoring (token health metrics)

---

## Testing Considerations

### Test Access Token Duration

**Verify tokens expire at expected time**:

```javascript
// Decode token to check expiration
const decoded = jwt.decode(accessToken);
console.log('Expires at:', new Date(decoded.exp * 1000));
console.log('Valid for:', (decoded.exp - decoded.iat), 'seconds');
// Should match: TOKEN_TTL_SECONDS
```

---

### Test Refresh Token Flow

**Verify refresh works**:

```bash
# 1. Authenticate (get access + refresh tokens)
# 2. Wait for access token to expire (or invalidate manually)
# 3. Client sends refresh_token grant
# 4. Should get new access token (no re-auth)
```

---

### Test Server Restart Resilience

**Critical test**:

```bash
# 1. Authenticate both ChatGPT and Claude Desktop
# 2. Restart server: pm2 restart paichart-mcp
# 3. Wait for access tokens to expire
# 4. Try using both clients
# Expected with 15-min TTL: Both work (token still valid)
# Expected with 12h TTL: Both fail (refresh tokens lost)
```

**This test proves**: Whether TTL choice is restart-tolerant.

---

## Monitoring & Metrics

### Key Metrics to Track

**Token expiration rate**:
```javascript
// How often do tokens expire?
expirationRate = authentications / day * (24 / TOKEN_TTL_HOURS)

// Example: 100 users, 12h TTL
expirationRate = 100 * (24 / 12) = 200 expirations/day
```

**Refresh success rate**:
```javascript
// How often does refresh_token grant succeed?
refreshSuccessRate = successful_refreshes / total_refresh_attempts

// Target: > 95% (high indicates in-memory tokens available)
// Low rate: Server restarts clearing tokens
```

**Re-authentication rate**:
```javascript
// How often do users re-authenticate?
reauthRate = full_oauth_flows / day

// With 15-min TTL + restarts: ~5-10/day per user (high)
// With 12h TTL + database: ~0.14/day per user (7-day cycle)
```

---

## Current Configuration (Feb 2026)

```javascript
// Access token
static TOKEN_TTL_SECONDS = 43200;  // 12 hours (experimental)

// OAuth state
static OAUTH_STATE_TTL_MS = 15 * 60 * 1000;  // 15 minutes (stable)

// Refresh token
static REFRESH_TOKEN_TTL_DAYS = 7;  // 7 days (standard)
```

**Storage**: In-memory Map (lost on restart)

**Status**: Testing 12-hour TTL with fresh connectors (Feb 2026)

**Fallback**: Revert to 15 minutes if restart issues persist

---

## Historical Timeline

| Date | Change | Reason | Outcome |
|------|--------|--------|---------|
| **Pre-Oct 2025** | 8-hour TTL | Better UX | Failed (restart issue) |
| **Oct 25, 2025** | Reverted to 15 min | Work around in-memory loss | ✅ Stable |
| **Feb 2, 2026** | Increased to 12h | Better UX attempt | Testing with fresh connectors |
| **Future** | Database persistence | Solve restart issue | Pending (encryption requirement) |

---

## Recommendations

### Current State (In-Memory Refresh Tokens)

**Recommended**:
```javascript
TOKEN_TTL_SECONDS = 900;  // 15 minutes (proven stable)
OAUTH_STATE_TTL_MS = 15 * 60 * 1000;  // 15 minutes (fine)
REFRESH_TOKEN_TTL_DAYS = 7;  // 7 days (standard)
```

**Rationale**: Proven stable Oct 2025 - Feb 2026, restart-tolerant.

---

### Future State (Database Persistence)

**When implemented**:
```javascript
TOKEN_TTL_SECONDS = 43200;  // 12 hours (better UX)
OAUTH_STATE_TTL_MS = 15 * 60 * 1000;  // 15 minutes (no change)
REFRESH_TOKEN_TTL_DAYS = 7;  // 7 days (no change)
// + Database storage with encryption
```

**Rationale**: Best UX + restart-tolerant + secure (if encrypted).

---

## Related Documentation

- **OAuth Integration Guide**: `.claude/knowledge/domain/mcp/mcp-hub-external-service-authentication.md`
- **Token Security**: `.claude/knowledge/domain/oauth/oauth-audience-architecture.md`
- **Database Plan**: `cline_docs/reviews/hub-ux-enhancement-2026-01-31/oauth-refresh-token-implementation-plan.md`
- **Production Ops**: `.claude/knowledge/PRODUCTION_OPERATIONS_GUIDE.md`

---

**Version**: 1.0 | **Created**: 2026-02-02 | **Status**: Living Document
**Maintained By**: oauth-multi-provider-specialist, oauth-multi-client-specialist
