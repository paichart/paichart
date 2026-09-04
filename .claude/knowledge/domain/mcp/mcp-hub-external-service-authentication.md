# MCP Hub External Service Authentication Guide

> **Build JWT-Authenticated Services & Enable Cross-Tenant Communication**
>
> Version 3.0 | January 30, 2026 | **Reality post-U2: May 19, 2026** | Contact: steve.terry@paichart.com

> **⚠️ POST-U2 (2026-05-19) UPDATE — read before implementing your validator**
>
> The Hub now mints **per-service audiences** (RFC 8707) for tokens forwarded to your service: `https://paichart.app/mcp/<your-service-slug>` where `<your-service-slug>` is your service's name NFKD-normalized to lowercase URL-safe form (e.g., "Snowflake Service" → `snowflake-service`).
>
> **Your validator's accept-list MUST include this per-service audience** or you will reject all per-call mints with "unexpected aud claim value" errors. The 2 legacy generic audiences (`/api`, `/mcp`) remain accepted during the 1-week overlap window after U2 deploy.
>
> Recommended pattern (env-var-driven, future-proof):
> ```typescript
> const PER_SERVICE_AUD = process.env.PAICHART_PER_SERVICE_AUDIENCE
>   || 'https://paichart.app/mcp/<your-service-slug>';
> const LEGACY_AUDS = (process.env.PAICHART_LEGACY_AUDIENCES
>   || 'https://paichart.app/api,https://paichart.app/mcp').split(',').map(s => s.trim());
> const PAICHART_AUDIENCES = [PER_SERVICE_AUD, ...LEGACY_AUDS];
> ```
>
> Audience helper (Hub-side, for reference): `lib/mcp/server/tools/hub/audience-policy.js` exports `audienceForService(service)` with NFKD normalize + collision detection at service-registration time.
>
> The `azp` claim (Option α) is now propagated through per-call mints — your validator can return it for forensic trace (see `.claude/knowledge/domain/mcp/cross-service-jti-forensics.md`). May be undefined for X-API-Key auth (PAICHART_API_KEY has no azp claim — known forensic-chain limit per v3.1 N-5).
>
> Full plan: `cline_docs/reviews/u2-audience-tightening-2026-05-19/IMPLEMENTATION-PLAN-v3.1.md`. Reference validator: `services/snowflake-service/src/auth/jwks-validator.ts` (updated 2026-05-19 to include per-service audience). Pattern template: `.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md` Step 4 (also updated 2026-05-19).

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| `_context` passing to external services | ✅ Implemented | userId, userEmail, userRole, token, povId, tenantId, requestId, source, trustLevel |
| JWT token in `_context` | ✅ Implemented | RS256 signed, includes sub/email/role/exp/iat/iss/aud |
| Internal service routing | ✅ Implemented | Zero-overhead for paichart-* services |
| **JWKS endpoint (`/api/auth/jwks`)** | **✅ Validated** | **GET https://paichart.app/api/auth/jwks - production tested 2026-01-30** |
| **RS256 asymmetric signing** | **✅ Validated** | **Unified key ID: paichart-2026-01 (web + MCP)** |
| **JWT issuer/audience claims** | **✅ Validated** | **iss: https://paichart.app, aud: /api OR /mcp** |
| **TEAM_MEMBER token passing** | **✅ Live** | **External services receive tokens securely** |
| **Unified key architecture** | **✅ Deployed** | **One RSA key for web/API + MCP OAuth (RFC 8707 compliant)** |
| **Token validation service** | **✅ Live** | **token-validator-service for customer onboarding (port 3105)** |
| **First-party token minting** | **✅ Deployed** | **Prevents OAuth passthrough vulnerabilities (CRITICAL fix)** |

**Component 5 VALIDATED** (2026-01-30): External service JWKS validation tested and working. Unified key architecture deployed. Security score: 95/100. **Test Results**: 34ms validation time, 100% success rate.

---

## Overview

pAIchart Hub enables **enterprise authentication** for external MCP services. This means:
- Your external service receives user context with every call
- JWT tokens enable cryptographic identity verification
- Services can authorize actions based on the calling user

**Use Cases:**
| Scenario | Description |
|----------|-------------|
| **Multi-tenant SaaS** | Your service validates which pAIchart tenant is calling |
| **User-scoped data** | Return only data the calling user has access to |
| **Audit logging** | Log which user triggered each action |
| **Cross-organization** | Services in different organizations can securely collaborate |

---

## How It Works

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICE AUTHENTICATION FLOW                         │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   User in ChatGPT / Claude Desktop                                             │
│          │                                                                      │
│          │ "Run analysis on Project Alpha using my-analytics-service"          │
│          ▼                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐             │
│   │              pAIchart Hub (Orchestration Layer)               │             │
│   │                                                               │             │
│   │  1. Validates user's pAIchart authentication                 │             │
│   │  2. Resolves "my-analytics-service" from registry            │             │
│   │  3. Includes _context with JWT token in tool call            │             │
│   └───────────────────────────┬───────────────────────────────────┘             │
│                               │                                                 │
│                               │ MCP call_tool with _context:                   │
│                               │ {                                              │
│                               │   userId: "clxxxxxx",                          │
│                               │   userEmail: "user@company.com",               │
│                               │   userRole: "ADMIN",                           │
│                               │   token: "eyJhbGciOiJSUzI1NiIs...",            │
│                               │   requestId: "wf-1737012345678",               │
│                               │   source: "mcp_hub_workflow"                   │
│                               │ }                                              │
│                               ▼                                                 │
│   ┌──────────────────────────────────────────────────────────────┐             │
│   │            Your External Service (my-analytics-service)       │             │
│   │                                                               │             │
│   │  1. Extracts _context from tool arguments                    │             │
│   │  2. Validates JWT against pAIchart JWKS endpoint             │             │
│   │  3. Authorizes action based on user identity                 │             │
│   │  4. Returns user-scoped results                              │             │
│   └───────────────────────────────────────────────────────────────┘             │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## What Your Service Receives

When pAIchart Hub calls your external service, it includes a `_context` object in the tool arguments:

```typescript
// Your tool receives:
{
  name: "analyze_project",
  arguments: {
    projectId: "proj-123",           // User's arguments
    metrics: ["velocity", "quality"],

    // Automatically added by Hub (lib/services/workflow/integrations/service-caller.ts)
    _context: {
      userId: "clm8xyz123abc",       // pAIchart user ID (CUID)
      userEmail: "alice@acme.com",   // User's email
      userRole: "ADMIN",             // USER, DEMO_USER, ADMIN, SUPER_ADMIN
      token: "eyJhbGciOiJSUzI1NiIs...",  // JWT (RS256) for JWKS validation
      povId: "clpov789def",          // POV context (if workflow is POV-scoped)
      tenantId: "clpov789def",       // Tenant ID (currently = povId)
      requestId: "uuid-v4-here",     // Request trace ID (UUID v4)
      source: "mcp_hub_workflow",    // Origin identifier
      trustLevel: "TEAM_MEMBER"      // Trust level assigned (helps debugging)
    }
  }
}
```

### Understanding Trust Levels (Debugging)

**New in Phase 2**: The `_context` now includes `trustLevel` to help developers understand authentication decisions.

| Trust Level | Gets Token? | When Assigned | Use Case |
|-------------|-------------|---------------|----------|
| `INTERNAL` | ✅ Yes | Service ID starts with `paichart-*` | Internal pAIchart services |
| `TRUSTED` | ✅ Yes | Service runs on localhost Docker | Local development services |
| `OWNER` | ✅ Yes | User calling workflow owns the service | User's own services |
| `TEAM_MEMBER` | ✅ Yes | Service owner is on POV team | Team collaboration |
| `SCOPED` | ❌ No | Public service with POV context | Limited POV access |
| `ANONYMOUS` | ❌ No | Public service, no POV context | Public APIs |

**Debugging Example**:
```typescript
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { _context } = request.params.arguments;

  console.log(`Trust Level: ${_context.trustLevel}`);
  console.log(`Has Token: ${!!_context.token}`);

  // If you didn't get a token, trustLevel explains why:
  if (!_context.token) {
    if (_context.trustLevel === 'ANONYMOUS') {
      // Need POV context: Ask user to specify povId in workflow
    } else if (_context.trustLevel === 'SCOPED') {
      // Have POV but service is public: Need OWNER or TEAM_MEMBER trust
    }
  }
});
```

**Common Questions**:
- *"Why didn't I get a token?"* → Check `trustLevel` value
- *"How do I get OWNER trust?"* → Register service ownership in pAIchart Hub
- *"How do I get TEAM_MEMBER trust?"* → Have POV admin add you to team

---

## Implementing JWT Validation

### Recommended: JWKS Validation (RS256 - Public Key Cryptography)

**✅ Phase 2 Complete** - pAIchart uses **RS256** (asymmetric) signing with public key validation via JWKS endpoint.

No shared secrets needed - validate tokens using the public JWKS endpoint:

```typescript
// Recommended approach using jose library (Node.js)
import { createRemoteJWKSet, jwtVerify } from 'jose';

// pAIchart JWKS endpoint - fetches public key automatically
const PAICHART_JWKS = createRemoteJWKSet(
  new URL('https://paichart.app/api/auth/jwks')
);

async function validatePAIchartToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, PAICHART_JWKS, {
      issuer: 'https://paichart.app',
      audience: ['https://paichart.app/api', 'https://paichart.app/mcp']  // Component 5
    });

    return {
      valid: true,
      userId: payload.sub,        // User ID (same as payload.userId)
      email: payload.email,
      role: payload.role,
    };
  } catch (error) {
    console.error('[Auth] Token validation failed:', error);
    return { valid: false, error: error.message };
  }
}
```

**Benefits:**
- ✅ **No shared secrets** - uses public key cryptography
- ✅ **Automatic key rotation** - JWKS endpoint handles key updates
- ✅ **Secure** - private key never leaves pAIchart infrastructure
- ✅ **Industry standard** - OAuth 2.0/OpenID Connect compatible

**JWKS Details:**
- **Endpoint**: `GET https://paichart.app/api/auth/jwks`
- **Cache**: 24-hour TTL (public, immutable)
- **Algorithm**: RS256 (RSA-2048)
- **Key ID**: `paichart-2026-01` (see `kid` in token header)

### Step 3: Use in Your Tool Handler

```typescript
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Extract _context (always present for Hub calls)
  const context = args._context;

  if (!context?.token) {
    return {
      content: [{ type: 'text', text: 'Authentication required' }],
      isError: true
    };
  }

  // Validate the JWT
  const auth = await validatePAIchartToken(context.token);

  if (!auth.valid) {
    return {
      content: [{ type: 'text', text: `Invalid token: ${auth.error}` }],
      isError: true
    };
  }

  // Now you have verified user identity!
  console.log(`Request from ${auth.email} (${auth.role})`);

  // Implement your business logic with user context
  if (name === 'analyze_project') {
    // Use auth.userId, auth.tenantId for authorization
    const results = await analyzeProject(args.projectId, {
      requestedBy: auth.userId,
      tenantId: auth.tenantId
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(results) }]
    };
  }
});
```

---

## Cross-Tenant Service Communication

### Scenario: Organization A calls Organization B's service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CROSS-TENANT SERVICE CALL                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Org A: Acme Corp                        Org B: Analytics Inc              │
│   ─────────────────                       ─────────────────────              │
│                                                                              │
│   User: alice@acme.com                    Service: acme-analytics           │
│          │                                         │                         │
│          │ "Analyze our Q4 data"                  │                         │
│          ▼                                         │                         │
│   ┌──────────────┐                                │                         │
│   │ pAIchart Hub │ ───── _context.token ─────────▶│                         │
│   │              │       (Alice's JWT)             │                         │
│   └──────────────┘                                │                         │
│                                                    ▼                         │
│                                           ┌──────────────────┐              │
│                                           │ Analytics Inc    │              │
│                                           │ validates JWT:   │              │
│                                           │                  │              │
│                                           │ ✓ Token valid    │              │
│                                           │ ✓ User: alice    │              │
│                                           │ ✓ Org: Acme Corp │              │
│                                           │ ✓ Authorized     │              │
│                                           └──────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Pattern

```typescript
// In your external service (Analytics Inc)
async function handleAnalyzeData(args: any) {
  const { _context } = args;

  // 1. Validate the token is from pAIchart
  const auth = await validatePAIchartToken(_context.token);
  if (!auth.valid) throw new Error('Invalid authentication');

  // 2. Check if this user/org is authorized to use your service
  const isAuthorized = await checkServiceAuthorization(
    auth.tenantId,  // Acme Corp's tenant ID
    auth.userId     // Alice's user ID
  );

  if (!isAuthorized) {
    return { error: 'Organization not authorized for this service' };
  }

  // 3. Perform the analysis with proper attribution
  const results = await performAnalysis(args.data, {
    requestedBy: auth.email,
    organization: auth.tenantId,
    auditLog: true  // Log who accessed what
  });

  return results;
}
```

---

## Security Best Practices

### 1. Always Validate Tokens
Never trust `_context` values without validating the JWT:

```typescript
// BAD - trusting context without validation
const userId = args._context.userId;  // Could be spoofed!

// GOOD - validate JWT first
const auth = await validatePAIchartToken(args._context.token);
const userId = auth.userId;  // Verified from token claims
```

### 2. Check Token Expiration
pAIchart JWTs have limited lifetime:

```typescript
const { payload } = await jwtVerify(token, JWKS);

// Check expiration (already done by jwtVerify, but for custom logic)
if (payload.exp && Date.now() >= payload.exp * 1000) {
  throw new Error('Token expired');
}
```

### 3. Verify Issuer and Audience

```typescript
await jwtVerify(token, JWKS, {
  issuer: 'https://paichart.app',      // Must be from pAIchart
  audience: ['https://paichart.app/api', 'https://paichart.app/mcp']  // Component 5: Accept both
});
```

### 4. Log Security Events
Track authentication for audit compliance:

```typescript
async function auditLog(event: string, context: any) {
  await db.securityLogs.create({
    data: {
      event,
      userId: context.userId,
      email: context.email,
      tenantId: context.tenantId,
      timestamp: new Date(),
      source: 'mcp_hub_external_call'
    }
  });
}

// Usage
await auditLog('DATA_ACCESS', auth);
```

---

## JWT Token Claims Reference

### Current Claims (Implemented)

| Claim | Description | Example |
|-------|-------------|---------|
| `sub` | User ID (CUID) | `"clm8xyz123abc"` |
| `userId` | User ID (duplicate of sub) | `"clm8xyz123abc"` |
| `email` | User email | `"alice@acme.com"` |
| `role` | Platform role | `"USER"`, `"DEMO_USER"`, `"ADMIN"`, `"SUPER_ADMIN"` |
| `exp` | Expiration timestamp | `1737012345` |
| `iat` | Issued at timestamp | `1737008745` |

### Standard Claims (Deployed - Phase 2 & Component 5)

| Claim | Description | Status |
|-------|-------------|--------|
| `iss` | Token issuer | ✅ `https://paichart.app` (Phase 2) |
| `aud` | Token audience | ✅ `https://paichart.app/api` OR `https://paichart.app/mcp` (Component 5) |

### Future Claims (Roadmap)

| Claim | Description | Status |
|-------|-------------|--------|
| `tenantId` | Organization/tenant ID | 🔮 Roadmap (multi-tenancy) |

> **Note**: `tenantId` is available in `_context` (derived from POV), but not yet in JWT claims. Audience values are resource-specific URLs per RFC 8707.

---

## Testing Your Integration

### 1. Local Development

For local testing, you can generate tokens using the shared secret:

```typescript
// test-utils.ts - Generate test tokens for development
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

export async function generateTestToken(user: { userId: string; email: string; role: string }) {
  return await new SignJWT({
    ...user,
    sub: user.userId
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(JWT_SECRET);
}
```

> **Future**: A `/api/auth/test-token` endpoint is planned for easier development testing.

### 2. Integration Test

```typescript
describe('JWT Authentication', () => {
  it('should validate pAIchart tokens', async () => {
    const testContext = {
      userId: 'cltest123',
      userEmail: 'test@example.com',
      userRole: 'ADMIN',
      token: await getTestToken()  // From pAIchart test endpoint
    };

    const result = await yourService.callTool({
      name: 'analyze_data',
      arguments: { data: [1, 2, 3], _context: testContext }
    });

    expect(result.isError).toBe(false);
  });

  it('should reject invalid tokens', async () => {
    const result = await yourService.callTool({
      name: 'analyze_data',
      arguments: { data: [1, 2, 3], _context: { token: 'invalid' } }
    });

    expect(result.isError).toBe(true);
  });
});
```

---

## Example: Complete Service Implementation

Here's a full example of an external service with JWT authentication:

```typescript
// analytics-service/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import express from 'express';

const app = express();
app.use(express.json());

// pAIchart JWKS for token validation
const PAICHART_JWKS = createRemoteJWKSet(
  new URL('https://paichart.app/api/auth/jwks')
);

// MCP Server
const mcpServer = new Server(
  { name: 'analytics-service', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Validate pAIchart JWT
async function validateToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, PAICHART_JWKS, {
      issuer: 'https://paichart.app',
      audience: ['https://paichart.app/api', 'https://paichart.app/mcp']  // Component 5
    });
    return { valid: true, ...payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// Tool handler with authentication
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const context = args._context;

  // Require authentication for all tools
  if (!context?.token) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: 'Authentication required',
        hint: 'This service requires a valid pAIchart JWT token'
      })}],
      isError: true
    };
  }

  // Validate the token
  const auth = await validateToken(context.token);
  if (!auth.valid) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: 'Invalid token',
        details: auth.error
      })}],
      isError: true
    };
  }

  // Log the authenticated request
  console.log(`[Auth] ${auth.email} (${auth.role}) called ${name}`);

  // Handle tools
  if (name === 'analyze_metrics') {
    // User-scoped analysis
    const results = await analyzeMetrics(args.projectId, {
      requestedBy: auth.sub,
      tenantId: auth.tenantId
    });

    return {
      content: [{ type: 'text', text: JSON.stringify({
        success: true,
        analyzedBy: auth.email,
        results
      })}]
    };
  }

  return {
    content: [{ type: 'text', text: 'Unknown tool' }],
    isError: true
  };
});

// SSE endpoint
const transports = new Map();
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  transports.set(transport.sessionId, transport);
  req.on('close', () => transports.delete(transport.sessionId));
  await mcpServer.connect(transport);
  await new Promise(resolve => req.on('close', resolve));
});

app.post('/message', async (req, res) => {
  const transport = transports.get(req.query.sessionId)
    || [...transports.values()][0];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'healthy' }));

app.listen(3200, () => {
  console.log('Analytics service running on port 3200');
});
```

---

## Registering Your Authenticated Service

When registering with the Hub, indicate that your service uses JWT authentication:

```javascript
registry(action: "register")({
  name: "my-analytics-service",
  description: "Analytics service with pAIchart JWT authentication",
  endpoint: "https://analytics.mycompany.com/sse",
  category: "data-services",
  authType: "BEARER_TOKEN",  // Indicates JWT auth
  capabilities: {
    tools: [
      {
        name: "analyze_metrics",
        description: "Analyze project metrics (requires authentication)",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" }
          },
          required: ["projectId"]
        }
      }
    ]
  }
})
```

---

## Compliance & Security

### SOC 2 / ISO 27001 Requirements

**Key Management** (Control CC6.7):
- ✅ RSA-2048 keys (industry standard minimum)
- ✅ 90-day rotation schedule (first rotation: April 21, 2026)
- ✅ Multi-key JWKS support (zero-downtime rotation)
- ✅ Audit logging (Activity table tracks token usage)
- ✅ Emergency rotation procedure (<1 hour)

**Access Control** (Control CC6.1):
- ✅ Trust level system (INTERNAL, TRUSTED, OWNER, TEAM_MEMBER)
- ✅ Audience-based isolation (RFC 8707 - resource-specific)
- ✅ Token revocation capability
- ✅ Role-based authorization (ADMIN, MANAGER, USER, VIEWER)

**Audit Logging** (Control CC7.2):
- ✅ All token validations logged (Activity table)
- ✅ Trust denials logged (security forensics)
- ✅ Service calls tracked (MCPInteraction table)
- ✅ 90-day retention (compliance requirement)

### GDPR Compliance

**Data Protection**:
- ✅ Token contains minimal PII (userId, email, role only)
- ✅ No sensitive data in tokens (passwords, API keys excluded)
- ✅ Token expiration (15-minute access, 7-day refresh)
- ✅ Right to erasure (user deletion invalidates tokens)

**Cross-Tenant Data Isolation**:
- ✅ `tenantId` in `_context` (derived from POV)
- ✅ External services can enforce tenant boundaries
- ✅ Trust level system prevents unauthorized access
- ✅ Audit trail for cross-tenant service calls

### Security Posture

**Current Score**: **95/100**

**Strengths** (90+ points):
- ✅ RS256 asymmetric cryptography (no shared secrets)
- ✅ JWKS public key distribution
- ✅ Audience claim validation (RFC 8707)
- ✅ Issuer claim validation
- ✅ Trust level system
- ✅ First-party token minting (prevents passthrough)

**Deductions** (-5 points):
- ⚠️ Deprecated audiences still accepted (90-day transition, sunset Jul 5, 2026)

**Next Milestone** (April 21, 2026): First 90-day key rotation (security score → 97/100)

---

## Testing Your Integration

### Option 1: Use Token Validator Service (Recommended)

pAIchart provides **token-validator-service** for validating your integration:

**Via MCP (ChatGPT/Claude Desktop)**:
```javascript
services(action: "workflow.execute")({
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: { testMessage: "Testing my integration" }
  }]
})
```

**Via Web UI** (Visual):
1. Go to https://paichart.app/workflows
2. Create new workflow
3. Add step: `token-validator-service` → `verify_auth`
4. Click "Execute"
5. See validation results with step input/output

**Expected Result**:
```json
{
  "success": true,
  "validation": {
    "status": "SUCCESS",
    "validatedBy": "JWKS (RS256 public key)",
    "validationTime": "34ms"
  },
  "tokenClaims": {
    "userId": "clm8xyz...",
    "email": "user@company.com",
    "role": "ADMIN",
    "issuer": "https://paichart.app",
    "audience": "https://paichart.app/mcp"
  },
  "context": {
    "trustLevel": "OWNER",  // or TEAM_MEMBER, SCOPED, etc.
    "povId": "clpov123..."
  },
  "component5Verification": {
    "expectedAudiences": ["https://paichart.app/api", "https://paichart.app/mcp"],
    "actualAudience": "https://paichart.app/mcp",
    "match": "YES"
  }
}
```

**Trust Level Debugging**:
- If you get `trustLevel: "ANONYMOUS"`, you need POV team membership or service ownership
- If you get `receivedToken: false`, check the trust level hint in the response
- See trust level table in "Understanding Trust Levels" section

### Option 2: Local Development Testing

For local testing, you can generate test tokens:

```typescript
// test-utils.ts - Generate test tokens for development
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

export async function generateTestToken(user: { userId: string; email: string; role: string }) {
  return await new SignJWT({
    ...user,
    sub: user.userId
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(JWT_SECRET);
}
```

> **Production Testing**: Always use **token-validator-service** for validating JWKS integration.

---

## Unified Key Architecture

**Design Decision** (2026-01-30): pAIchart uses **ONE RSA key pair** for all tokens.

**Rationale**:
- ✅ RFC 8707/9068 compliant (OAuth 2.0 multi-audience pattern)
- ✅ Industry standard (Google, Microsoft, Auth0 all use single keys)
- ✅ Simpler key rotation (one 90-day schedule)
- ✅ JWKS works for all tokens (web, API, MCP OAuth)

**Key Details**:
- **Key ID**: `paichart-2026-01`
- **Algorithm**: RS256 (RSA-2048)
- **Uses**: Web login tokens, API tokens, MCP OAuth tokens
- **Audiences**: `https://paichart.app/api` (web/API), `https://paichart.app/mcp` (MCP)

**Token Isolation**: Achieved via `aud` claim, not separate keys

**Example**:
```typescript
// Web/API token
{ kid: "paichart-2026-01", aud: "https://paichart.app/api" }

// MCP OAuth token (ChatGPT, Claude Desktop)
{ kid: "paichart-2026-01", aud: "https://paichart.app/mcp" }

// SAME KEY, different audiences → tokens NOT interchangeable
```

**Security Pattern**: See `oauth-token-minting-not-passthrough.md` for why first-party minting is critical.

---

## Critical Security: First-Party Token Minting

**⚠️ CRITICAL VULNERABILITY PREVENTED** (2026-01-30)

### The Passthrough Attack

**Vulnerable Pattern** (Fixed):
```javascript
// ❌ CRITICAL SECURITY HOLE (OAuth passthrough)
app.post('/oauth/token', async (req, res) => {
  const githubToken = await exchangeCodeForToken(code);

  // WRONG: Returns GitHub's token directly
  res.json({
    access_token: githubToken.access_token  // ← GitHub token!
  });
});
```

**Attack Scenario**:
1. User authenticates via GitHub OAuth
2. Malicious external service receives GitHub token
3. Service uses token on GitHub API
4. Result: Private repos cloned, malicious code pushed

**Security Impact**: **0/10** (GitHub account compromise)

### The Secure Pattern

**Fixed Implementation**:
```javascript
// ✅ SECURE (First-party minting)
app.post('/oauth/token', async (req, res) => {
  const githubToken = await exchangeCodeForToken(code);

  // STEP 1: Validate GitHub token, get user
  const user = await validateGitHubToken(githubToken.access_token);

  // STEP 2: Mint OUR first-party token
  const ourToken = mintToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    audience: 'https://paichart.app/mcp'
  });

  // STEP 3: Return OUR token (not GitHub's!)
  res.json({
    access_token: ourToken  // ← pAIchart RS256 JWT
  });
});
```

**Security Impact**: **95/100** (pAIchart-scoped, revocable, JWKS-validatable)

**Pattern**: See `.claude/knowledge/patterns/oauth-token-minting-not-passthrough.md`

---

## Per-User Authentication to Third-Party Services (External OAuth)

> **Added**: March 2026 | **Validated**: Snowflake External OAuth

pAIchart can provide **per-user authentication to third-party services** — but only if the third party supports **External OAuth with custom authorization servers**.

### How It Works

The pAIchart JWT (from `_context.token`) is passed directly to the third party as an OAuth token. The third party validates it against pAIchart's JWKS endpoint and maps the user's `email` claim to a local account.

### Requirement: The Third Party Must Support External OAuth

This pattern **only works** if the third-party service:
1. Accepts JWTs from external authorization servers (not just its own tokens)
2. Can validate signatures via a configurable JWKS URL
3. Can map JWT claims (e.g., `email`) to local user accounts

**Services that support this** (confirmed or likely):
| Service | External OAuth? | Validated? |
|---------|----------------|------------|
| **Snowflake** | Yes — `CREATE SECURITY INTEGRATION external_oauth` | Production-validated March 2026 |
| **Databricks** | Yes — External OAuth with custom IdP | Not tested |
| **BigQuery** | Partial — Workforce Identity Federation | Not tested |
| **Azure SQL** | Yes — External OAuth via Entra ID | Not tested |

**Services that do NOT support this**:
| Service | Why Not | Alternative |
|---------|---------|-------------|
| **GitHub** | GitHub is an OAuth provider, not consumer. Cannot accept third-party JWTs. | Service account (PAT) |
| **Slack** | Bot tokens only. No External OAuth. | Service account (Bot Token) |
| **Most SaaS APIs** | API key or their own OAuth only | Service account credentials |

### The Key Distinction

- **pAIchart MCP services** (your own code): Always receive `_context.token` via trust levels. Your code validates via JWKS. This always works.
- **Third-party services** (Snowflake, Databricks, etc.): Only works if they accept external JWTs. Otherwise, use a service account.

### Implementation Reference

See `docker-mcp-service-gold-standard-v2.md` → "Use Case: Snowflake MCP Service" for the complete External OAuth setup including Snowflake SQL, scope configuration, and gotchas.

---

## FAQ

### Q: Can I use my own JWT tokens instead of pAIchart's?
**A:** The Hub passes pAIchart tokens for federated authentication. If you need your own tokens, implement a token exchange in your service.

### Q: Can I pass the pAIchart JWT to any third-party service?
**A:** Only if the third party supports External OAuth with custom authorization servers (like Snowflake). Most services (GitHub, Slack, etc.) only accept their own tokens. For those, use a service account with static credentials.

### Q: What if the token expires mid-workflow?
**A:** pAIchart tokens have a reasonable lifetime (typically 1 hour). For long workflows, the Hub automatically refreshes tokens.

### Q: Can I restrict which pAIchart users can call my service?
**A:** Yes! Validate the JWT and check `tenantId` or `email` against your authorization list.

### Q: Is the token visible to users?
**A:** No. The `_context` is added server-side by the Hub. Users only see tool arguments they provide.

---

## Support

**Technical Support**: steve.terry@paichart.com
**JWKS Endpoint**: https://paichart.app/api/auth/jwks
**Documentation**: https://paichart.app/docs

---

## Changelog

- **v3.0** (January 30, 2026): Component 5 Validation & Security Hardening
  - ✅ **VALIDATED**: External service JWKS validation tested and working (34ms, 100% success)
  - ✅ **UNIFIED KEY**: Consolidated to one RSA key pair (paichart-2026-01) for web + MCP
  - ✅ **SECURITY FIX**: Prevented GitHub OAuth passthrough vulnerability (0/10 → 95/100)
  - ✅ **FIRST-PARTY MINTING**: All OAuth flows now mint pAIchart tokens (not provider passthrough)
  - Added: Compliance & Security section (SOC 2, ISO 27001, GDPR)
  - Added: Token Validator Service (token-validator-service for customer onboarding)
  - Added: First-party token minting security pattern
  - Added: Unified key architecture documentation
  - Pattern: oauth-token-minting-not-passthrough.md (pattern #29)
  - Test service: Docker container on port 3105
  - Specialist consensus: 92% confidence for unified key architecture

- **v2.0** (January 30, 2026): Component 5 - Audience standardization
  - Updated all audience examples to resource-specific URLs
  - Changed validation: `'paichart-api'` → `['https://paichart.app/api', 'https://paichart.app/mcp']`
  - Added RFC 8707/9068 compliance notes
  - Updated status: iss/aud moved from "Roadmap" to "Deployed"
  - Phase 3 multi-key JWKS mentioned
  - Security score: 95/100

- **v1.1** (January 16, 2026): Accuracy update
  - Clarified HS256 (current) vs RS256 (roadmap) signing
  - Updated `_context` fields to match actual implementation
  - Added implementation status table
  - Corrected JWT claims to reflect current state
  - Added local development token generation guide
  - Linked to TODO-jwks-public-key-auth.md for roadmap items

- **v1.0** (January 16, 2026): Initial release
  - JWT token passing in `_context` for external services
  - Cross-tenant communication patterns
  - Complete service implementation example
