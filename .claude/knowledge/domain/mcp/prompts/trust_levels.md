# MCP Hub Trust Levels

> **Complete guide to the 6-tier trust system and token passing**
>
> Understand who gets JWT tokens, why, and how to debug trust issues

> **⚠️ POST-U2 (2026-05-19) UPDATE — token flow shifted**
>
> Trust-level GATING logic is unchanged: 6 tiers (INTERNAL/TRUSTED/OWNER/TEAM_MEMBER/SCOPED/ANONYMOUS), only the first 4 receive tokens. What CHANGED:
>
> - **Pre-U2**: trust gate filtered the inbound Bearer token (userToken from extractAuthContext). If trust allowed, Bearer-forwarded unchanged.
> - **Post-U2 (Phase C, May 19)**: trust gate determines permission FIRST, then mints a **per-call token** ONLY when trust grants — with **per-service audience** (`audienceForService(serviceRecord)` from `lib/mcp/server/tools/hub/audience-policy.js`). The minted token bears the user's `{userId, email, role, azp}` for the specific destination only.
>
> Wins: no wasted RSA-sign on denials; mint audit log correlates 1:1 with trust-grant events; per-service audience prevents cross-service token replay (a Snowflake-forwarded token cannot validate at Databricks/EIA/etc.).
>
> Spread guard at `trust-level.js:200` (Phase F.4): `{ ...baseContext, ...(token ? { token } : {}) }` — prevents `token: undefined` from being set when upstream mint fails.
>
> Code references below show the pre-U2 Bearer-forward model. The current implementation is at `lib/mcp/server/tools/hub/workflow-tools-handler.js:558+` (Phase C mint-before-trust) and `lib/services/workflow/integrations/service-caller.ts:300+` (Phase D site #7).

---

## 🎯 Quick Navigation

**What do you need?**

- **[A] Understand trust levels** → See 6-Tier Hierarchy
- **[B] Why didn't my service get a token?** → See Debugging Trust Issues
- **[C] Test my integration** → See token-validator Service
- **[D] Learn trust determination** → See How Trust is Calculated
- **[E] Understand token security** → See Token Passing Policy

---

## 🔐 What Are Trust Levels?

**Trust levels control whether external services receive JWT tokens** from the Hub.

**The Problem**:
- External services need to validate user identity (via JWT tokens)
- But passing tokens to untrusted services is dangerous (token leakage, delegation attacks)

**The Solution**:
- **6-tier trust hierarchy** determines who gets tokens
- Based on **ownership**, **team membership**, and **POV context**
- Trust degrades through service chains (prevents token forwarding)

**Security Goal**: Pass tokens to trusted services only, protect users from delegation attacks.

---

## Section A: 6-Tier Trust Hierarchy

### Trust Level Overview

| Level | Description | Token Passed? | Use Case |
|-------|-------------|--------------|----------|
| **1. INTERNAL** | pAIchart-* services (same process) | ✅ Yes | POV/Task operations |
| **2. TRUSTED** | Localhost Docker services | ✅ Yes | browser-automation, notification |
| **3. OWNER** | You call your own registered service | ✅ Yes | Your external MCP services |
| **4. TEAM_MEMBER** | Service owner in your POV team | ✅ Yes | Team collaboration |
| **5. SCOPED** | Public service + POV context | ❌ No (only povId) | Public workflows with POV |
| **6. ANONYMOUS** | Public service, no POV | ❌ No | Public discovery, read-only |

**Key Rule**: Only levels 1-4 receive JWT tokens. Levels 5-6 get povId/tenantId identifiers only.

---

### Level 1: INTERNAL

**Definition**: pAIchart platform services running in the same Node.js process.

**Services**:
- `paichart-project-service` (project(action: "pov.list"), project(action: "pov.details"), project(action: "task.list"), perform)

**Token access**: ✅ **Full JWT token**

**Why trusted**:
- Same process = no network boundary
- Platform-owned = audited codebase
- Zero HTTP overhead (direct function calls)

**Example**:
```javascript
// User calls internal service
services({ action: "workflow.execute",
  steps: [{
    service: "paichart-project-service",
    tool: "project",
    arguments: { action: "pov.list", status: "IN_PROGRESS" }
  }]
})

// Result: Service receives full JWT token (INTERNAL trust)
```

**Routing**: `InternalServiceRouter` (no HTTP, ~100ms faster)

---

### Level 2: TRUSTED

**Definition**: First-party Docker services running on localhost.

**Services**:
- `browser-automation-service` (localhost:3100)
- `notification-service` (localhost:3101)

**Token access**: ✅ **Full JWT token**

**Why trusted**:
- First-party services (pAIchart-managed)
- Localhost-only (not internet-accessible)
- Deployed with platform (same infrastructure)

**Example**:
```javascript
// User calls browser automation
services({ action: "call",
  targetService: "browser-automation-service",
  tool: "take_screenshot",
  arguments: { url: "https://example.com" }
})

// Result: Service receives JWT token (TRUSTED trust)
```

**Security**: Endpoint validation blocks external services from using localhost URLs.

---

### Level 3: OWNER

**Definition**: You call a service you registered.

**Token access**: ✅ **Full JWT token**

**Why trusted**:
- You own the service = you control the code
- Self-service validation (you authenticate yourself)
- No delegation risk (you're calling your own service)

**Example**:
```javascript
// 1. You register a service
registry(action: "register", {
  name: "my-weather-api",
  endpoint: "https://api.myservice.com/mcp",
  capabilities: { tools: ["get_forecast"] }
})

// 2. You call your own service
services({ action: "call",
  targetService: "my-weather-api",
  tool: "get_forecast",
  arguments: { location: "Sydney" }
})

// Result: Your service receives YOUR JWT token (OWNER trust)
```

**Use case**: External services validating pAIchart users via JWKS.

**Validation**: Service verifies token via `GET https://paichart.app/api/auth/jwks`

---

### Level 4: TEAM_MEMBER

**Definition**: You are a team member of a POV **owned by the service owner**. A POV is a project entity an administrator creates with phase, stage and tasks and has team members you assign.

**Token access**: ✅ **Full JWT token**

**Why trusted**:
- Service owner controls the POV (they own it)
- Service owner controls team membership (they add you)
- Mutual trust: Owner trusts you enough to add you to their team

**Example**:
```javascript
// Team setup:
// - POV: "Data Analytics Platform" (povId: cm123...)
// - POV Owner: Bob (service owner)
// - Team: Bob (owner), Alice (member)
// - Bob registered "data-analytics-service"

// Alice calls Bob's service with Bob's POV context
services({ action: "workflow.execute",
  povId: "cm123...",  // Bob's POV (Bob owns this POV)
  steps: [{
    service: "data-analytics-service",  // Bob's service
    tool: "analyze_trends",
    arguments: { metric: "conversions" }
  }]
})

// Result: Bob's service receives Alice's token (TEAM_MEMBER trust)
// Because: Alice is in Bob's team, and Bob owns the POV
```

**Trust determination**:
```
Check: Is CALLER a team member of POV owned by SERVICE OWNER?
  → Query: TeamMember where userId = callerId
           AND team.povs includes povId
           AND pov.ownerId = serviceOwnerId
  → If YES → TEAM_MEMBER trust
  → If NO → Downgrade to SCOPED
```

**Security**:
- ✅ Service owner controls access (owns POV + manages team)
- ❌ **FIXED**: Prevents attack where caller creates POV, adds service owner, steals token
- POV ownership verification prevents privilege escalation

---

### Level 5: SCOPED

**Definition**: Public service called with POV context, but owner not in team.

**Token access**: ❌ **No token** (receives `povId` and `tenantId` only)

**Why untrusted**:
- Public service (anyone can call)
- Service owner not in your POV team (stranger)
- POV context present (tenant isolation needed)

**Example**:
```javascript
// Public service (not team member)
services({ action: "workflow.execute",
  povId: "cm123...",  // POV context provided
  steps: [{
    service: "public-analytics-service",  // Public service
    tool: "calculate_metrics",
    arguments: { data: [...] }
  }]
})

// Service receives:
{
  _context: {
    povId: "cm123...",      // ✅ Tenant identifier
    tenantId: "cm123...",   // ✅ Alias
    userId: "user456",      // ✅ User identifier
    userEmail: "alice@company.com",  // ✅ Email
    // ❌ NO TOKEN (SCOPED trust - not team member)
  }
}
```

**Use case**: Public services that work with POV-scoped data but don't need token validation.

---

### Level 6: ANONYMOUS

**Definition**: Public service, no POV context.

**Token access**: ❌ **No token** (no POV context either)

**Why untrusted**:
- Public service (anyone can call)
- No POV context (no tenant boundary)
- Read-only operations (discovery, health checks)

**Example**:
```javascript
// Call public service without POV
services({ action: "call",
  targetService: "public-weather-api",
  tool: "get_forecast",
  arguments: { location: "Sydney" }
})

// Service receives:
{
  _context: {
    userId: "user456",      // ✅ User identifier
    userEmail: "alice@company.com",  // ✅ Email
    // ❌ NO TOKEN (ANONYMOUS trust)
    // ❌ NO POV ID (no tenant context)
  }
}
```

**Use case**: Public discovery, read-only operations, stateless APIs.

---

## Section B: Debugging Trust Issues

### Common Problem: "Service didn't receive token"

**Step-by-step debugging workflow**:

#### Step 1: Check What Trust Level You Have

```javascript
// Test with token-validator service
services({ action: "workflow.execute",
  povId: "your-pov-id",  // Optional
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: {}
  }]
})
```

**Response shows**:
```json
{
  "trustLevel": "OWNER",  // Your current trust level
  "tokenReceived": true,
  "explanation": "You own this service, so you receive a token",
  "howToImprove": null
}
```

---

#### Step 2: Understand Why

**Checklist**:

| Trust Level | Requirement | How to Check |
|-------------|-------------|--------------|
| **INTERNAL** | Service is pAIchart-* | Can't register (platform-only) |
| **TRUSTED** | Service on localhost | `endpoint: "http://localhost:3100"` |
| **OWNER** | You registered the service | `registry(action: "list")` shows it |
| **TEAM_MEMBER** | Owner in your POV team | Check POV team members |
| **SCOPED** | Public + POV context | Public service, has povId |
| **ANONYMOUS** | Public, no POV | Public service, no povId |

---

#### Step 3: Common Scenarios

**Scenario 1**: "I'm calling my own service but didn't get a token"

**Likely cause**: Service registered by someone else

**Solution**:
```javascript
// 1. Check ownership
registry(action: "list")
// Does your service appear? If NO → you don't own it

// 2. If you don't own it, ask owner to transfer ownership (contact admin)
// 3. Or register your own copy of the service
```

---

**Scenario 2**: "I'm in the POV team but didn't get a token"

**Likely cause**: POV is not owned by the service owner (you're on a team, but service owner doesn't own that POV)

**Trust determination**:
```
Check: Are you in a team of a POV OWNED BY the service owner?
  → NOT: Is service owner in YOUR POV team (prevents attack!)
  → Service owner must OWN the POV for TEAM_MEMBER trust
```

**Solution**:
```javascript
// 1. Check who owns the service
services({ action: "health", service_name: "the-service" })
// Note the ownerId

// 2. Check who owns the POV
project({ action: "pov.details", povId: "your-pov" })
// Does ownerId match service ownerId? If NO → SCOPED trust (no token)

// 3. Solutions:
// - Use a POV owned by the service owner → TEAM_MEMBER trust ✅
// - Ask service owner to add you to THEIR POV team → TEAM_MEMBER trust ✅
// - Register your own service → OWNER trust ✅
// - Use service without tokens (SCOPED/ANONYMOUS) → Update service logic
```

**Security note**: You cannot grant yourself TEAM_MEMBER trust by creating a POV and adding the service owner. The service owner must own the POV.

---

**Scenario 3**: "Service is public, why no token?"

**Expected behavior**: Public services get **SCOPED** or **ANONYMOUS** trust (no token).

**Why**: Security - public services can't be trusted with user tokens.

**Solutions**:
1. **Make service private** → Only you can call (OWNER trust)
   ```javascript
   registry(action: "update", {
     service_name: "my-service",
     updates: { permissions: { publicAccess: false } }
   })
   ```

2. **Join POV team** → Service owner joins your POV team (TEAM_MEMBER trust)

3. **Don't use tokens** → Service works with `userId`/`email` only (no validation)

---

### Error Messages Explained

**"Insufficient trust level"**

**Meaning**: Service requires a token, but your trust level doesn't grant one.

**Common causes**:
- Public service (SCOPED/ANONYMOUS trust)
- Service owner not in POV team
- You don't own the service

**Fix**: See "Step 2: Understand Why" above

---

**"Service owner not found in POV team"**

**Meaning**: TEAM_MEMBER trust check failed - service owner isn't in the POV's team.

**Example**:
```
POV: "Customer Onboarding" (cm123...)
Team: Alice, Bob
Service: "data-service" (owner: Charlie)

Alice calls data-service in POV context
  → Charlie NOT in team → SCOPED trust (no token)
```

**Fix**: Invite Charlie to POV team OR register your own service

---

## Section C: token-validator Service (Test Your Integration)

### What is token-validator?

**Purpose**: Test and verify external service authentication integration.

**Service name**: `test-auth-service` or `token-validator-service`

**What it does**:
1. Receives service call with `_context`
2. Shows your trust level (with jwtCapable boolean and trustDecision reasoning)
3. Validates token via JWKS (if received)
4. Provides step-by-step validation results
5. Shows enhanced visual formatting (box header, RESULTS, SUMMARY)
6. Optionally shows copy-paste code examples (set `includeCodeExample: true`)

---

### How to Use

**Visual Testing (Enhanced Format)** ⭐ NEW:
```javascript
services({ action: "workflow.execute",
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: { enhancedFormat: true }  // ← Beautiful visual output!
  }]
})
```

**Or use our pre-built demo** (easier):
```javascript
services({ action: "workflow.execute", workflowName: "trust-level-basic-demo"})
```

**See complete visual guide:** `/prompt validation_showcase`

**Programmatic Use (Raw JSON):**
```javascript
services({ action: "workflow.execute",
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: { enhancedFormat: false }  // ← Parse this in scripts
  }]
})
```

**With POV context:**
```javascript
services({ action: "workflow.execute",
  povId: "cm123...",  // Your POV ID
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: { enhancedFormat: true }
  }]
})
```

**What you'll get**:
- ✅ Your trust level (OWNER, TEAM_MEMBER, SCOPED, or ANONYMOUS)
- ✅ Whether you receive tokens (yes/no + explanation)
- ✅ 11-step JWKS validation process
- ✅ Copy-paste TypeScript code (145 lines)
- ✅ Component 5 verification
- ✅ Performance metrics (avg 34ms)

**Time**: 10 seconds (faster than building ad-hoc workflow!)

**Advanced**: Try all 4 demos:
- `trust-level-basic-demo` - Learn trust basics
- `jwks-validation-advanced-demo` - Get TypeScript + JavaScript + Python examples
- `token-troubleshooting-demo` - Debug trust level changes with POV context
- `pov-workflow-showcase` - See parallel execution

See [I] **workflow_guide** for complete workflow documentation.

---

### Response Breakdown

```json
{
  "trustLevel": "OWNER",
  "tokenReceived": true,
  "validation": {
    "step1": "✅ Token extracted from _context",
    "step2": "✅ JWKS fetched (34ms)",
    "step3": "✅ Public key found (kid: paichart-2026-01)",
    "step4": "✅ Signature valid (RS256)",
    "step5": "✅ Issuer valid (https://paichart.app)",
    "step6": "✅ Audience valid (https://paichart.app/mcp)",
    "step7": "✅ Token not expired",
    "step8": "✅ Claims extracted"
  },
  "claims": {
    "sub": "user456",
    "email": "alice@company.com",
    "role": "ADMIN",
    "aud": "https://paichart.app/mcp",
    "iss": "https://paichart.app"
  },
  "codeExamples": {
    "typescript": "...",
    "javascript": "...",
    "python": "..."
  },
  "howToImprove": null
}
```

**If no token received**:
```json
{
  "trustLevel": "SCOPED",
  "tokenReceived": false,
  "explanation": "Service owner not in POV team",
  "howToImprove": "Invite service owner to your POV team to receive tokens"
}
```

---

### Validation Time

**Typical**: ~34ms (JWKS fetch + signature validation)

**Why fast**:
- JWKS cached (24-hour TTL)
- RS256 asymmetric verification (public key cryptography)
- No database queries needed

---

## Section D: How Trust is Calculated

### Trust Determination Flow

```
┌─────────────────────────────────────┐
│ Service call starts                 │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ determineTrustLevel()               │
│                                     │
│ 1. Internal service?                │
│    endpoint starts with internal:// │
│    → INTERNAL                       │
│                                     │
│ 2. Localhost Docker?                │
│    endpoint = localhost:310x        │
│    → TRUSTED                        │
│                                     │
│ 3. Caller owns service?             │
│    userId = service.ownerId         │
│    → OWNER                          │
│                                     │
│ 4. Caller in POV team owned by      │
│    service owner?                   │
│    povId + caller in team +         │
│    pov.ownerId = serviceOwnerId     │
│    → TEAM_MEMBER                    │
│                                     │
│ 5. Public + POV context?            │
│    publicAccess=true + povId        │
│    → SCOPED                         │
│                                     │
│ 6. Public + no POV?                 │
│    publicAccess=true, no povId      │
│    → ANONYMOUS                      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ buildServiceContext()               │
│                                     │
│ If trust level 1-4:                 │
│   → Include JWT token in _context   │
│ Else:                               │
│   → Only povId/tenantId/userId      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Pass _context to external service   │
└─────────────────────────────────────┘
```

**Implementation**: `lib/services/workflow/security/trust-level.js`

---

### Trust Degradation in Service Chains

**Rule**: Service chains inherit the **lowest** trust level.

**Example**:
```
User (OWNER trust) → Service A (receives token)
                       ↓
                Service A calls Service B (SCOPED trust)
                       ↓
                Service B receives NO token (degraded to SCOPED)
```

**Why**: Prevent token forwarding attacks - Service A can't pass user's token to Service B.

**Security implication**: External services MUST NOT forward user tokens to other services.

---

## Section E: Token Passing Policy

### When Tokens Are Passed

**Current implementation**:

| Tool | Trust Levels Applied? | Token Passing |
|------|----------------------|---------------|
| **`services(action: 'workflow.execute')`** | ✅ Yes (deployed) | Trust-based (1-4 get tokens) |
| **`services(action: 'call')`** | ⚠️ No (planned) | No tokens currently |

**Why difference**:
- `services(action: 'workflow.execute')` = Multi-service chains (higher risk) → Trust levels deployed
- `services(action: 'call')` = Direct user call (lower risk) → Trust levels planned

---

### Security Reasoning

**The Threat**: Confused Deputy Attack

```
User → Hub → Service A (public, gets token)
                ↓ Service A is malicious
         Service A → Hub → Service B (using user's token)
                              ↑ User never authorized this!
```

**Protection**: Trust levels prevent Service A from receiving user's token (unless Service A is OWNER or TEAM_MEMBER).

---

### Token Delegation Rules

**PROHIBITED** (documented in service registration guide):

```javascript
// ❌ WRONG: Don't forward user tokens to other services
async function myTool(args) {
  const userToken = args._context.token;

  // Don't do this!
  await callAnotherService({
    headers: { Authorization: `Bearer ${userToken}` }
  });
}
```

**APPROVED**:

```javascript
// ✅ RIGHT: Use service credentials
async function myTool(args) {
  const userToken = args._context.token;

  // 1. Validate user first
  const user = await validateToken(userToken);

  // 2. Use YOUR service's credentials for other calls
  await callAnotherService({
    headers: { Authorization: `Bearer ${myServiceToken}` },
    userId: user.userId  // Track who initiated
  });
}
```

---

### Audit Logging

**All trust decisions are logged** to Activity table:

```json
{
  "action": "TRUST_DENIAL",
  "type": "Security",
  "metadata": {
    "serviceId": "cm456...",
    "serviceName": "public-service",
    "trustLevel": "SCOPED",
    "povId": "cm123...",
    "reason": "Token withheld: trust level SCOPED does not receive tokens"
  }
}
```

**Purpose**: Security forensics, abuse detection, compliance.

---

## 🚀 Best Practices

### For External Service Developers

1. **Test with token-validator** - Verify your integration works before deployment
   ```javascript
   services({ action: "workflow.execute", steps: [{ service: "token-validator-service", tool: "verify_auth" }] })
   ```

2. **Validate tokens via JWKS** - Don't trust _context without verification
   ```javascript
   const jwks = await fetch('https://paichart.app/api/auth/jwks').then(r => r.json());
   const verified = await verifyJWT(token, jwks.keys);
   ```

3. **Handle missing tokens gracefully** - Not all callers get tokens (SCOPED/ANONYMOUS)
   ```javascript
   if (!args._context.token) {
     // Fallback: Use userId/email for basic operations
     // Or reject if token validation is required
   }
   ```

4. **Never forward tokens** - Use your service's credentials for downstream calls

5. **Start private, make public later** - Test with OWNER trust first
   ```javascript
   registry(action: "register", {
     permissions: { publicAccess: false }  // Start private
   })
   ```

---

### For Service Consumers

1. **Understand trust requirements** - Check if service needs a token
   ```javascript
   registry(action: "tools", { service_name: "the-service" })
   // Read description: Does it validate tokens?
   ```

2. **Use POV context when available** - Enables TEAM_MEMBER trust
   ```javascript
   services({ action: "workflow.execute",
     povId: "cm123...",  // Include POV context
     steps: [...]
   })
   ```

3. **Register your own services for full control** - OWNER trust guaranteed

4. **Test before deploying workflows** - Use token-validator to verify trust

---

### For Operators

1. **Monitor trust denials** - Check Activity table for patterns
   ```sql
   SELECT * FROM "Activity"
   WHERE action = 'TRUST_DENIAL'
   ORDER BY "createdAt" DESC LIMIT 50;
   ```

2. **Explain trust to users** - "You didn't get a token because..."

3. **Recommend OWNER trust** - Encourage users to register their own services

4. **Review team membership** - Ensure POV teams are correct for TEAM_MEMBER trust

---

## 📚 Related Documentation

**Deep Dive Prompts**:
- [E] **external_service_auth** - JWKS validation, RS256 tokens, Component 5
- [F] **security_policy** - Multi-layer security, blocked patterns
- [H] **architecture** - How trust levels fit into Hub architecture

**Quick Start**:
- [A] **get_started** - Role-based tutorials (Path A: Developer)
- [D] **register_guide** - Register your first service (OWNER trust)

**Workflows**:
- [I] **workflow_guide** - Multi-service orchestration with trust levels

---

## 💬 Support

**Trust Level Questions**: steve.terry@paichart.com
**Token Validation Issues**: Use token-validator service first
**Documentation**: https://paichart.app/docs

---

## 📖 Quick Reference

### 6 Trust Levels (Who Gets Tokens)

| Level | Token? | Requirement |
|-------|--------|-------------|
| **INTERNAL** | ✅ Yes | pAIchart-* service |
| **TRUSTED** | ✅ Yes | Localhost Docker |
| **OWNER** | ✅ Yes | You own the service |
| **TEAM_MEMBER** | ✅ Yes | Owner in POV team |
| **SCOPED** | ❌ No | Public + POV context |
| **ANONYMOUS** | ❌ No | Public, no POV |

### Trust Determination (Order Matters)

```
1. Internal service? → INTERNAL
2. Localhost Docker? → TRUSTED
3. You own service? → OWNER
4. Owner in POV team? → TEAM_MEMBER
5. Public + POV? → SCOPED
6. Public, no POV? → ANONYMOUS
```

### Debugging Checklist

✅ Test with token-validator service
✅ Check ownership (`registry(action: "list")`)
✅ Check POV team membership (`project(action: "pov.details")`)
✅ Verify service is private vs public
✅ Confirm POV context is passed
✅ Review trust denial audit logs

### Token Validation (External Services)

```javascript
// 1. Fetch JWKS
const jwks = await fetch('https://paichart.app/api/auth/jwks').then(r => r.json());

// 2. Verify token
const verified = await verifyJWT(args._context.token, jwks.keys, {
  algorithms: ['RS256'],
  audience: 'https://paichart.app/mcp',
  issuer: 'https://paichart.app'
});

// 3. Use claims
const userId = verified.sub;
const email = verified.email;
```

---

**Version**: 1.0 | **Created**: 2026-02-02 | **Status**: Production-Ready
**Validation**: token-validator service (34ms JWKS validation, 100% success)
