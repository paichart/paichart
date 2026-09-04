# MCP Hub Security Policy

> **Version**: 2.1.0 | **Updated**: 2026-01-31 | **Reality post-U2**: 2026-05-19 | **Status**: Active
>
> This document describes the comprehensive security policies, threat prevention, token management, incident response, compliance framework, and Hub service registry architecture enforced by the MCP Hub for cross-service communication.
>
> **Security Score**: 95/100 (Enterprise-Grade)
> **Validation Status**: Component 5 tested and deployed (2026-01-30); U2 Audience-Tightening deployed (2026-05-19)
> **Hub Architecture**: Modular (16 handlers), Multi-tenant (POV-scoped), Protocol-compliant (MCP 2025-03-26)

> **⚠️ POST-U2 (2026-05-19) UPDATE — security model extended**
>
> This document was last comprehensively updated 2026-01-31. The U2 Audience-Tightening initiative (9 commits ending `de6a2fa6`) significantly extended the threat model and token management policies:
>
> - **Per-service audience (RFC 8707)** — cross-service blast-radius isolation. A stolen token forwarded to Service A cannot replay at Service B. Convention: `https://paichart.app/mcp/<service-slug>` via `audienceForService(service)` helper.
> - **azp claim (Option α) end-to-end propagation** — client-binding for forensic chain (claude-desktop, chatgpt-com, gemini-cli, webapp). Refresh-grant `client_id` mismatch now enforced at `/oauth/token` + `/oauth/refresh` (blocks cross-client refresh attempts).
> - **populateReqUser() helper** — single source of truth for 3 auth paths (RS256, HS256-fallback, X-API-Key). Future field additions (Tier 3 tenantId) touch one place.
> - **Per-call mint at downstream consumers** — replaces Bearer-forward pattern. Mint rate-limited 100/min/user via `checkRateLimit`. Audience REQUIRED (no implicit default). Log volume sampling via `PAICHART_MCP_MINT_LOG_SAMPLE_RATE`.
> - **trust-level.js defensive guard** — spread guard prevents `token: undefined` from being set when upstream mint fails (Phase F.4).
>
> Authoritative references (post-U2):
> - Plan: `cline_docs/reviews/u2-audience-tightening-2026-05-19/IMPLEMENTATION-PLAN-v3.1.md`
> - Mint canonical: `lib/auth/token-manager.ts:mintMcpToken`
> - Audience policy: `lib/mcp/server/tools/hub/audience-policy.js`
> - Forensic runbook: `.claude/knowledge/domain/mcp/cross-service-jti-forensics.md`
>
> Token management sections below reflect the pre-U2 model. The defense-in-depth narrative (Component 5, JWKS, multi-key rotation, etc.) is still accurate — U2 added a layer ON TOP, didn't replace.

## Overview

The MCP Hub implements a multi-layered security architecture for cross-service calls to:
- **Prevent proxy attacks** - Using the Hub to attack internal systems (SSRF prevention)
- **Ensure content safety** - Block malicious operations and injection attempts
- **Protect sensitive data** - Filter PII, credentials, and implement token exposure controls
- **Limit resource consumption** - Size limits, call depth restrictions, rate limiting
- **Enforce token security** - Trust-based token delegation, RS256 validation, JWKS endpoint

All external service calls are validated against this policy. Internal pAIchart services (paichart-project-service, paichart-project-service) bypass external compliance checks.

---

## 🔐 Token Security Architecture (NEW - Phase 3)

### RS256/JWKS Public Key Cryptography

**Security Model**: External services validate pAIchart JWT tokens using public key cryptography without requiring shared secrets.

| Component | Purpose | Status |
|-----------|---------|--------|
| **RS256 Signing** | Asymmetric token signing | ✅ Deployed Jan 24, 2026 |
| **JWKS Endpoint** | Public key distribution | ✅ Deployed Jan 24, 2026 |
| **Multi-Key Support** | Zero-downtime rotation | ✅ Deployed Jan 24, 2026 |
| **Audience Isolation** | Resource-specific tokens | ✅ Deployed Jan 30, 2026 |
| **HS256 Validation** | API key validation | ✅ Deployed Jan 30, 2026 |

**JWKS Endpoint**: `GET https://paichart.app/api/auth/jwks`

**Security Features**:
- Rate limited (100 requests/minute per IP)
- 24-hour cache headers for performance
- Multi-key array (supports current + previous during rotation)
- Automatic expired key filtering
- Empty JWKS array prevention

**How External Services Validate Tokens**:
```typescript
// 1. Fetch public keys from JWKS endpoint
const jwksResponse = await fetch('https://paichart.app/api/auth/jwks');
const jwks = await jwksResponse.json();

// 2. Extract public key matching token's kid
const publicKey = jwks.keys.find(k => k.kid === token.header.kid);

// 3. Verify token signature using public key (RS256)
const verified = await verifyJWT(token, publicKey, {
  algorithms: ['RS256'],
  audience: 'https://paichart.app/mcp',
  issuer: 'https://paichart.app'
});
```

**Security Benefits**:
- ✅ No shared secrets between services
- ✅ External services can't mint tokens (only verify)
- ✅ Key rotation without service downtime
- ✅ Cryptographic proof of token authenticity
- ✅ Prevents token forgery attacks

**Reference**: `services/token-validator-service/` - Production validation proof

### Audience-Based Token Isolation (Component 5)

**Security Boundary**: Tokens are scoped to specific resources to prevent reuse attacks.

| Audience | Purpose | Algorithm | Status |
|----------|---------|-----------|--------|
| `https://paichart.app/api` | Web/API operations | RS256 | ✅ Active |
| `https://paichart.app/mcp` | MCP operations | RS256 + HS256 | ✅ Active |
| `paichart-api` | Legacy Web tokens | RS256 | ⚠️ Deprecated (sunset Jul 5, 2026) |
| `paichart-app` | Legacy API keys | HS256 | ⚠️ Deprecated (sunset Jul 5, 2026) |

**Attack Scenario Prevented**:
```
❌ BEFORE (no audience validation):
  1. Attacker steals MCP token from external service
  2. Reuses token to access Web/API endpoints
  3. Gains unauthorized access to user data

✅ AFTER (Component 5):
  1. Attacker steals MCP token (aud: /mcp)
  2. Attempts to access Web/API endpoint (requires aud: /api)
  3. Token rejected: Audience mismatch
```

**Validation**: Both RS256 and HS256 paths validate audience + issuer (defense in depth)

**RFC Compliance**:
- ✅ **RFC 8707**: Resource Indicators for OAuth 2.0
- ✅ **RFC 9068**: JWT Profile for OAuth 2.0 (audience-restricted tokens)
- ✅ **OIDC Core 1.0**: Proper audience claim validation

**Reference**: `.claude/knowledge/domain/oauth/oauth-audience-architecture.md`

### First-Party Token Minting (CRITICAL Security Fix)

**Vulnerability**: OAuth passthrough attack scenario

**Before** (CRITICAL vulnerability):
```javascript
// GitHub OAuth flow - INSECURE
const githubToken = await exchangeCodeForToken(code);

// ❌ DANGER: Passing GitHub's token directly to external services!
return { access_token: githubToken };  // External service now has GitHub access!
```

**Attack Scenario**:
1. User authenticates via GitHub OAuth
2. External service receives GitHub token (not pAIchart token!)
3. Malicious service uses GitHub token to access user's repositories
4. **Impact**: Full GitHub account compromise

**After** (SECURE - deployed Jan 24, 2026):
```javascript
// GitHub OAuth flow - SECURE
const githubUser = await authenticateWithGitHub(code);

// ✅ SECURE: Mint OUR token (RS256 with pAIchart identity)
const mcpToken = this.mintMcpToken({
  userId: user.id,
  email: user.email,
  role: user.role,
  audience: 'https://paichart.app/mcp'  // OUR resource
});

return { access_token: mcpToken };  // External service gets pAIchart token only
```

**Security Benefits**:
- ✅ External services never receive OAuth provider tokens
- ✅ Token scope limited to pAIchart operations only
- ✅ No GitHub/Microsoft/Google account access possible
- ✅ First-party control over all token capabilities

**Implementation**: `mcp-server-http-clean.js` lines 2784-2824

**Pattern**: See `.claude/knowledge/patterns/oauth-token-minting-not-passthrough.md` (Pattern #29)

### Unified Key Architecture

**Design Decision** (Jan 30, 2026): pAIchart uses **ONE RSA key pair** for all tokens.

**Rationale**:
- ✅ RFC 8707/9068 compliant (OAuth 2.0 multi-audience standard)
- ✅ Industry pattern (Google, Microsoft, Auth0 all use single keys)
- ✅ Simpler key rotation (one 90-day schedule)
- ✅ JWKS works for all token types (web, API, MCP OAuth)
- ✅ Audience claims provide isolation (not separate keys)

**Key Details**:
- **Key ID**: `paichart-2026-01` (unified for web/API + MCP OAuth)
- **Algorithm**: RS256 (RSA-2048)
- **Rotation**: Every 90 days (next: April 21, 2026)
- **Audiences**: `https://paichart.app/api` (web/API), `https://paichart.app/mcp` (MCP OAuth)

**Token Isolation**: Different `aud` claims prevent cross-use (web token can't be used for MCP, vice versa)

**Specialist Consensus**: 2-1 vote for consolidation (92% confidence)
- auth-permissions-specialist: APPROVE (operational simplicity)
- oauth-multi-provider-specialist: APPROVE (RFC compliance)
- sec-ops-specialist: PREFER TWO KEYS (defense-in-depth)
- **Final decision**: ONE KEY (blast radius acceptable, standards compliance prioritized)

**Validation**: Component 5 tested with token-validator-service (34ms JWKS validation, 100% success)

---

## 🛡️ Trust Level System (NEW - Phase 2)

**Security Control**: JWT token exposure to external services is controlled by a 6-tier trust hierarchy.

### Trust Levels

| Level | Description | Token Access | Use Case |
|-------|-------------|--------------|----------|
| **INTERNAL** | pAIchart-* services (in-process) | ✅ Full token | POV/Task operations |
| **TRUSTED** | Localhost Docker services | ✅ Full token | browser-automation, notification |
| **OWNER** | Caller owns the service | ✅ Full token | User's own services |
| **TEAM_MEMBER** | Service owner is POV team member | ✅ Full token (RS256) | External team services |
| **SCOPED** | Public service with POV context | ❌ No token | Public workflows with POV |
| **ANONYMOUS** | Public service, no POV | ❌ No token | Public discovery, read-only |

**Token Receiving Levels** (Phase 2 - TEAM_MEMBER enabled):
- INTERNAL, TRUSTED, OWNER, TEAM_MEMBER receive JWT token
- SCOPED, ANONYMOUS receive povId/tenantId only (identifiers, not secrets)

**Security Reasoning**:
- **TEAM_MEMBER enabled**: External services can now validate tokens via JWKS (RS256 public key)
- **No shared secrets**: Services verify tokens cryptographically, can't mint new tokens
- **Trust degradation**: Service chains inherit lowest trust level (prevents escalation)

**Example**:
```
User calls Service A (OWNER trust → receives token)
  ↓
Service A calls Service B (SCOPED trust)
  ↓
Service B receives SCOPED trust (lower of OWNER vs SCOPED)
  → No token passed to Service B
```

**Implementation**: `lib/services/workflow/security/trust-level.js`

### Trust Level Determination Flow

```
┌─────────────────────────────────────┐
│ Workflow executes service call     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ determineTrustLevel()               │
│                                     │
│ 1. Internal service?                │
│    → INTERNAL                       │
│                                     │
│ 2. Localhost Docker?                │
│    → TRUSTED                        │
│                                     │
│ 3. Caller owns service?             │
│    → OWNER                          │
│                                     │
│ 4. Service owner in POV team?       │
│    → TEAM_MEMBER                    │
│                                     │
│ 5. Public + POV context?            │
│    → SCOPED                         │
│                                     │
│ 6. Public + no POV?                 │
│    → ANONYMOUS                      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ buildServiceContext()               │
│                                     │
│ If token-receiving level:           │
│   → Include JWT token               │
│ Else:                               │
│   → povId/tenantId only             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ logTrustDenial() if no token        │
│ → Activity table (Security audit)   │
└─────────────────────────────────────┘
```

**Audit Logging**: All trust denials logged to Activity table for security forensics:
```typescript
{
  action: 'TRUST_DENIAL',
  type: 'Security',
  metadata: {
    serviceId,
    serviceName,
    trustLevel,
    povId,
    reason: 'Token withheld: trust level SCOPED does not receive tokens'
  }
}
```

### Implementation Status & Roadmap

**Current Implementation** (Jan 30, 2026):
- ✅ **services(action: "workflow.execute")**: Trust level system DEPLOYED
- ⚠️ **services(action: "call")**: Trust levels NOT YET implemented (identified Jan 30)

**Architectural Decision**:
- `services(action: "workflow.execute")` uses trust levels (prevents service chaining abuse)
- `services(action: "call")` currently bypasses trust system (to be enhanced)

**Planned Enhancement** (Low effort - infrastructure exists):
```typescript
// services(action: "call") enhancement (service-call-handler.js)
// Infrastructure already exists - just needs integration

const trustLevel = await determineTrustLevel({
  serviceId, serviceRecord, userId, povId, prisma
});

const serviceContext = buildServiceContext(trustLevel, {
  userId, userEmail, userRole, token, povId, ...
});

client.callTool({
  name: tool,
  arguments: { ...args, _context: serviceContext }  // Add trust-filtered context
});
```

**Implementation Complexity**: **LOW** (1-2 hours)
- ✅ Trust level module exists (`trust-level.js`)
- ✅ buildServiceContext function exists
- ✅ Service lookup logic exists
- ✅ Only needs integration into service-call-handler.js

**Security Benefit**: Prevents token exposure to untrusted services via services(action: "call")

**Note**: Scope-based delegation (Phase 4/5 roadmap) requires major infrastructure and is beyond current scope. Trust levels provide sufficient security for current needs.

**Reference**: Full architectural discussion in `hub-authentication-context-passing.md` (Token Passing Policy section)

---

## 🏗️ Hub Architecture Security (MCP Hub Specialist)

### Service Registry Architecture

**Database Model**: `MCPTool` - Centralized registry for all MCP services

**Storage Design**:
```prisma
model MCPTool {
  id             String   @id @default(cuid())
  name           String   @unique
  status         MCPToolStatus  // ACTIVE, INACTIVE, ERROR, MAINTENANCE
  version        String
  configuration  Json     // Operational settings (endpoint, category, healthCheckPath)
  permissions    Json     // Access control (publicAccess, rateLimit, maxExecutionTime)
  capabilities   Json     // Tools, resources, prompts arrays
  // ... other fields
}
```

**Security Boundaries**:
- **Configuration column**: Operational settings (HOW service operates)
  - `endpoint`: Service URL (HTTPS, SSE, internal://)
  - `category`: Service classification for discovery
  - `healthCheckPath`: Custom health endpoint (default: `/health`)
  - `ownerId`: Service owner (for authorization)
  - `type`: `'external'` or `'internal'` (routing optimization)

- **Permissions column**: Access control (WHO can access)
  - `publicAccess`: boolean (everyone vs owner-only)
  - `rateLimit`: `{ requests: number, windowMs: number }`
  - `maxExecutionTime`: Per-service timeout in milliseconds

**Rule of Thumb**: "WHO vs HOW" determines column placement
- Access control → `permissions`
- Operational settings → `configuration`

**Reference**: `cline_docs/task-standardize-service-field-locations-2026-01-23.md`

### Service Discovery Security

**Handler**: `service-discovery-handler.js` (334 lines)

**Discovery Modes**:
1. **Public Discovery** (unauthenticated):
   - Returns limited service data
   - Filters sensitive fields: `endpoint`, `ownerId`, `API keys`, `credentials`
   - Response: ~8 fields hidden for security

2. **Authenticated Discovery** (JWT token):
   - Returns full service metadata
   - Includes ownership information
   - Enables service management operations

**Performance Optimizations**:
- **Discovery Cache**: 60s TTL with LRU eviction
- **Cache Invalidation**: Automatic on register/update/delete
- **Parallel Queries**: `Promise.all([count, findMany])`
- **Database Indices**:
  - Composite: `(status, responseTime, successRate)`
  - GIN: `capabilities` JSONB for tool/category search

**Security Controls**:
```javascript
// Public discovery filter (8+ sensitive fields hidden)
function filterPublicServiceData(service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    status: service.status,
    version: service.version,
    capabilities: service.capabilities,
    // REDACTED: endpoint, ownerId, credentials, API keys
  };
}
```

### Service Health Monitoring Security

**Handler**: `service-health-handler.js` (264 lines)

**Real HTTP Health Checks** (not simulated):
```javascript
// Actual HTTP ping with timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

const response = await fetch(endpoint, {
  method: 'GET',
  signal: controller.signal
});

const latency = Date.now() - pingStart; // Real timing
```

**Security Features**:
- **Timeout Protection**: 5-second AbortController prevents hanging
- **Health Cache**: 30s TTL reduces load on external services
- **Realtime Bypass**: `realtime: true` parameter for critical checks
- **Status Detection**: HTTP 2xx = ACTIVE, timeout/error = ERROR

**Custom Health Paths**:
```javascript
// Service can specify custom health endpoint
const healthPath = service.configuration?.healthCheckPath || '/health';
const endpoint = `${baseUrl}${healthPath}`;
```

**Internal Service Bypass**:
```javascript
// Internal services (paichart-*) always healthy (same process)
if (service.configuration?.type === 'internal') {
  return { status: 'ACTIVE', latency: 0, source: 'internal' };
}
```

### Cross-Service Communication Security

**Handler**: `service-call-handler.js` (339 lines)

**Security Flow** (7 validation steps):
```
┌─────────────────────────────────────┐
│ 1. Authentication Check             │  ❌ Reject if unauthenticated
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 2. Zod Schema Validation            │  ❌ Reject malformed requests
│    (targetService, tool, arguments) │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 2.5 Compliance Policy Check (NEW)   │  ❌ Block dangerous tools/URLs
│    - validateServiceCall()          │     (service-call-policy.js)
│    - Static + Dynamic whitelist     │
│    - Blocked patterns (12+)         │
│    - SSRF protection                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 3. Service Lookup                   │  ❌ Service not found
│    (MCPTool database query)         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 4. Service Access Authorization     │  ❌ Unauthorized access
│    - checkServiceAccess()           │     (owner/admin/public check)
│    - Triple validation              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 5. Trust Level Determination        │  🔐 Token gating decision
│    - determineTrustLevel()          │
│    - Build service context          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 6. Service Routing                  │
│    - Internal: InternalServiceRouter│  (no HTTP, same process)
│    - External: MCP SDK Client       │  (HTTP/SSE transport)
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 7. Audit Logging                    │  📊 Activity table logging
│    - SERVICE_CALL (success)         │     (90-day retention)
│    - UNAUTHORIZED_SERVICE_ACCESS    │
│    - TRUST_DENIAL (if applicable)   │
└─────────────────────────────────────┘
```

**Connection Pool Security**:
```javascript
// Reuse connections for performance (50-70% faster)
// But enforce security on every call
class ServiceConnectionPool {
  async getOrCreateClient(serviceId, endpoint) {
    // Check cache first
    if (this.connections.has(serviceId)) {
      this.stats.reused++;
      return this.connections.get(serviceId);
    }

    // Validate transport (SSE/HTTP only, WebSocket removed Jan 2026)
    const isSSE = endpoint.includes('/sse');
    const transport = isSSE
      ? new SSEClientTransport(new URL(endpoint))
      : new StreamableHTTPClientTransport(new URL(endpoint));

    // Create new client with MCP SDK
    const client = new Client({ name: 'paichart-mcp-hub', version: '1.0.0' }, {
      capabilities: {}
    });
    await client.connect(transport);

    // Cache for reuse
    this.connections.set(serviceId, client);
    this.stats.created++;
    return client;
  }
}
```

**Transport Security**:
- **Supported**: HTTP, HTTPS, SSE (`/sse` suffix)
- **Removed**: WebSocket (`ws://`) rejected with error (Jan 2026)
- **Validation**: URL protocol check before connection

### Internal Service Infrastructure Security

**Router**: `InternalServiceRouter.js` - Zero network overhead for pAIchart services

**Registered Internal Services**:
- `paichart-project-service`: POV operations (project(action: "pov.list"), project(action: "pov.details"), get_pov_phases)
- `paichart-project-service`: Task operations (project(action: "task.context"), perform(action: "execute"), project(action: "task.list"))

**Security Benefits**:
1. **No HTTP Exposure**: Services communicate in-process (same Node.js runtime)
2. **No Network Latency**: Zero HTTP round-trip (100-200ms savings)
3. **Context Normalization**: Handles both MCP and Hub API context patterns
4. **Health Bypass**: Internal services always healthy (no external ping needed)

**Routing Logic**:
```javascript
// Detect internal service by endpoint pattern
const isInternalService = service.configuration?.endpoint?.startsWith('internal://');

if (isInternalService) {
  // Route directly to pAIchart handlers (no HTTP)
  return InternalServiceRouter.routeCall(service, tool, arguments, context);
} else {
  // External service: use HTTP/SSE transport
  return externalServiceCall(service, tool, arguments, context);
}
```

**Context Normalization** (security critical):
```javascript
// MCP context pattern
const userId = context.user?.id;

// Hub API context pattern
const userId = context.apiUserContext?.userId;

// Router normalizes both patterns
function normalizeContext(context) {
  return {
    userId: context.user?.id || context.apiUserContext?.userId,
    tenantId: context.povId || context.tenantId,
    // ... normalize other fields
  };
}
```

### Workflow Orchestration Security

**Shared Engine**: `orchestration-engine.js` (pure JavaScript, used by both MCP and API handlers)

**Execution Modes**:
- **Sequential**: Steps run in order, variable chaining allowed
- **Parallel**: Independent steps run concurrently (max 5 concurrent)
- **Conditional**: Dependency graph determines execution order

**Security Limits**:
```javascript
// Prevent resource exhaustion
const MAX_CONCURRENT_EXECUTIONS_PER_USER = 10;
const MAX_STEPS_PER_WORKFLOW = 20;
const MAX_PARALLEL_STEPS = 5;
const MAX_CALL_DEPTH = 3;  // Service chains limited
```

**Variable Chaining Security**:
```javascript
// Supports: {{step.N.output.field}}
// Security: No code execution, JSON path resolution only
function resolveVariables(stepOutput, currentArgs) {
  const pattern = /\{\{step\.(\d+)\.output(\.[\w\[\]\.]+)?\}\}/g;

  // Replace with actual values from previous steps
  // NO eval(), NO function execution
  return JSON.parse(JSON.stringify(currentArgs).replace(pattern, (match, stepNum, path) => {
    return resolvePath(stepOutput[stepNum], path);
  }));
}
```

**Circular Dependency Detection**:
```javascript
// Prevent infinite loops
function detectCircularDependencies(steps) {
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(stepIndex) {
    if (recursionStack.has(stepIndex)) {
      throw new Error('Circular dependency detected');
    }
    // ... DFS traversal
  }

  steps.forEach((_, idx) => dfs(idx));
}
```

**Failure Strategies**:
- **stop**: Halt on first error (default, safest)
- **continue**: Log error, continue with remaining steps
- **rollback**: Attempt to undo completed steps (best-effort)

**Orchestration Monitoring** (Jan 2026):
```javascript
// Log workflow execution to Activity table
await logWorkflowExecution({
  taskId,
  workflowId,
  workflowType: 'mcp_service_orchestration',
  workflowStatus: 'SUCCESS' | 'FAILED' | 'PARTIAL',
  workflowStepCount: steps.length,
  workflowExecutionTime: duration
});
```

### Service Lifecycle Security

**Lifecycle States**: ACTIVE → INACTIVE → MAINTENANCE → ERROR

**Registration** (seed scripts vs registry(action: "register")):
- **Seed Scripts**: First-party Docker services (admin bypass, no owner)
  - Used for: browser-automation-service, notification-service
  - Can use localhost endpoints (TRUSTED_INTERNAL_SERVICES exception)

- **registry(action: "register") Tool**: Customer/external services
  - User ownership assigned automatically
  - SSRF validation (localhost blocked)
  - Approval workflow (AUTO_APPROVE, MANUAL_REVIEW, REJECT)
  - Rate limited (public: 100/min, authenticated: 1000/min)

**Service Updates** (registry(action: "update")):
- **Security**: Only owner or admin can update
- **Fields**: healthCheckPath, publicAccess, rateLimit, maxExecutionTime
- **Audit**: All updates logged to Activity table
- **Cache Invalidation**: Discovery cache cleared on update

**Service Deletion** (GDPR Right to Erasure):
- **Security**: Only owner or admin can delete
- **What's Deleted**: Service registration, health history, interaction logs
- **What's Retained**: Anonymized audit logs (90 days for compliance)
- **Confirmation**: Requires `confirm: true` parameter

**Deactivation** (registry(action: "update") with status: 'INACTIVE'):
- **Alternative to deletion**: Service hidden but data retained
- **Reversible**: Can reactivate with status: 'ACTIVE'
- **Discovery**: Inactive services excluded from discovery

### Cross-Tenant Isolation Security (POV-Based Scoping)

**Security Model**: Multi-tenant isolation using POV (Proof of Value) as tenant boundary

**Tenant Hierarchy**:
```
User → POV (tenant boundary) → Team → Tasks → Workflows
```

**POV ID Propagation**:
```javascript
// POV context flows through entire service call chain
workflow.execute({
  povId: 'cm123...',  // Tenant identifier
  userId: 'user456',
  steps: [
    { service: 'service-a', tool: 'project(action: "task.list")', arguments: {} },
    { service: 'service-b', tool: 'analyze_data', arguments: {} }
  ]
});

// Every service call receives:
{
  povId: 'cm123...',     // Tenant boundary (required for scoped operations)
  tenantId: 'cm123...',  // Alias for compatibility
  userId: 'user456',     // User identity
  token: 'eyJ...'        // JWT token (if trust level allows)
}
```

**Tenant Boundary Enforcement**:

1. **Service Call Handler** (service-call-handler.js):
```javascript
// POV context validation
if (context.povId) {
  // Verify user has access to POV
  const povAccess = await checkPOVAccess(context.userId, context.povId);
  if (!povAccess) {
    throw new Error('Unauthorized: User does not have access to POV');
  }
}

// Pass povId to service (tenant boundary preserved)
await serviceClient.callTool({
  name: tool,
  arguments: {
    ...userArguments,
    _context: {
      povId: context.povId,
      tenantId: context.povId,
      userId: context.userId
    }
  }
});
```

2. **Internal Services** (paichart-project-service, paichart-project-service):
```javascript
// All operations scoped to POV
async listTasks({ povId, ...filters }) {
  // Enforce tenant boundary
  return await prisma.task.findMany({
    where: {
      povId: povId,  // Tenant isolation
      ...filters
    }
  });
}
```

3. **Trust Level Determination** (trust-level.js):
```javascript
// TEAM_MEMBER trust: Service owner must be in POV's team
if (povId && serviceOwnerId) {
  const isTeamMember = await prisma.teamMember.findFirst({
    where: {
      userId: serviceOwnerId,
      team: { povs: { some: { id: povId } } }  // POV→Team→TeamMember hierarchy
    }
  });

  if (isTeamMember) {
    return TrustLevel.TEAM_MEMBER;  // Elevated trust within tenant
  }
}
```

**Security Implications**:

| Trust Level | POV Context | Tenant Isolation |
|-------------|-------------|------------------|
| **INTERNAL** | Always scoped | ✅ Strict (Prisma WHERE clause) |
| **TRUSTED** | Optional | ✅ Strict (if povId provided) |
| **OWNER** | Optional | ✅ User's own POVs only |
| **TEAM_MEMBER** | Required | ✅ Strict (service owner in POV team) |
| **SCOPED** | Required | ⚠️ Limited (povId passed but no token) |
| **ANONYMOUS** | None | ❌ No isolation (public operations) |

**Tenant Data Leakage Prevention**:

```javascript
// ❌ DANGEROUS: No POV scoping
const tasks = await prisma.task.findMany();  // Returns ALL tenants' data!

// ✅ SAFE: POV-scoped query
const tasks = await prisma.task.findMany({
  where: { povId: context.povId }  // Tenant boundary enforced
});

// ✅ SAFE: withPOVAccess middleware (automatic scoping)
const tasks = await withPOVAccess(context.userId, context.povId, async (pov) => {
  return await prisma.task.findMany({
    where: { povId: pov.id }  // Verified access + scoped query
  });
});
```

**Audit Logging** (tenant-aware):
```javascript
// All service calls logged with POV context
await logActivity({
  action: 'SERVICE_CALL',
  userId: context.userId,
  povId: context.povId,  // Tenant identifier
  metadata: {
    serviceName,
    tool,
    trustLevel,
    // ... other details
  }
});

// Tenant isolation in audit queries
const auditLog = await prisma.activity.findMany({
  where: {
    povId: tenantId,  // Only this tenant's audit trail
    action: 'SERVICE_CALL'
  }
});
```

**Cross-Tenant Attack Prevention**:

| Attack Vector | Mitigation |
|---------------|-----------|
| **POV ID manipulation** | Token validation (povId encoded in JWT) |
| **Cross-tenant service calls** | Trust level verification (TEAM_MEMBER requires POV membership) |
| **Data leakage via workflows** | Variable chaining preserves povId ({{step.N.output}} includes _context) |
| **Unauthorized team access** | withPOVAccess middleware validates user→POV relationship |

**Example Attack Scenario (Prevented)**:
```javascript
// Attacker tries to access another tenant's data
❌ ATTEMPT:
services(action: "call")({
  targetService: 'paichart-project-service',
  tool: 'project(action: "task.list")',
  arguments: {
    povId: 'attacker-pov-123',  // Different tenant!
    _context: {
      povId: 'victim-pov-456'   // Trying to spoof victim's tenant
    }
  }
});

✅ BLOCKED:
1. JWT token validation extracts real povId from token claims
2. Mismatch detected: token.povId !== arguments._context.povId
3. Request rejected: "Unauthorized POV access"
4. Audit log entry: UNAUTHORIZED_SERVICE_ACCESS
```

**Multi-Tenant Best Practices for External Services**:

1. **Always validate povId**:
```javascript
// External service receiving Hub call
function handleHubRequest(request) {
  const { povId, userId, token } = request._context;

  // Verify token matches povId claim
  const claims = verifyJWT(token);
  if (claims.povId !== povId) {
    throw new Error('POV ID mismatch');
  }

  // Use povId for all database queries
  return yourService.getData({ tenantId: povId, userId });
}
```

2. **Don't trust user-provided povId**:
```javascript
// ❌ INSECURE: Trust user input
const povId = request.arguments.povId;

// ✅ SECURE: Extract from validated token
const claims = verifyJWT(request._context.token);
const povId = claims.povId;  // Cryptographically verified
```

3. **Log all cross-tenant operations**:
```javascript
// Audit log with tenant context
logger.info('Service call', {
  tenantId: povId,
  userId,
  operation: 'project(action: "task.list")',
  timestamp: new Date()
});
```

### MCP Protocol & Transport Security

**Supported Transports**: HTTP, HTTPS, SSE (Server-Sent Events)

**Removed Transports**: WebSocket (`ws://`) - Removed January 2026 for security reasons

**Transport Auto-Detection**:
```javascript
// service-connection-pool.js
const isSSE = endpoint.includes('/sse');
const transport = isSSE
  ? new SSEClientTransport(new URL(endpoint))
  : new StreamableHTTPClientTransport(new URL(endpoint));
```

**Transport Security Features**:

1. **SSE (Server-Sent Events)**:
   - Use case: Long-lived connections (browser-automation-service, notification-service)
   - Security: TLS encryption (HTTPS required in production)
   - Firewall-friendly: Works through corporate proxies
   - Connection pooling: Reuse connections for performance

2. **Streamable HTTP (POST /mcp)**:
   - Use case: Stateless service calls (Alpha Vantage, external APIs)
   - Security: Standard HTTPS with certificate validation
   - Serverless-ready: Works with AWS Lambda, Cloudflare Workers
   - API key preservation: Query parameters (`?apikey=KEY`) maintained

**TLS Certificate Validation**:
```javascript
// Enforced for all external HTTPS connections
const httpsAgent = new https.Agent({
  rejectUnauthorized: true,  // Reject self-signed certificates
  minVersion: 'TLSv1.2'      // Minimum TLS 1.2
});
```

**Endpoint Validation** (before connection):
```javascript
function validateEndpoint(endpoint) {
  const url = new URL(endpoint);

  // Block WebSocket (removed transport)
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    throw new Error('WebSocket transport not supported (use HTTP/SSE)');
  }

  // Block localhost (unless trusted service)
  if (!isTrustedInternalService(serviceName)) {
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      throw new Error('Localhost endpoints blocked (SSRF prevention)');
    }
  }

  // Block private networks
  if (isPrivateNetwork(url.hostname)) {
    throw new Error('Private network endpoints blocked');
  }

  // Block cloud metadata endpoints
  if (isCloudMetadata(url.hostname)) {
    throw new Error('Cloud metadata endpoints blocked');
  }
}
```

**Connection Pooling Security**:
```javascript
// ServiceConnectionPool manages connections securely
class ServiceConnectionPool {
  constructor() {
    this.connections = new Map();  // serviceId → MCP Client
    this.maxConnections = 20;      // LRU eviction at limit
    this.maxIdleTime = 5 * 60 * 1000;  // 5 minutes
  }

  async getOrCreateClient(serviceId, endpoint) {
    // Security: Validate endpoint before creating client
    validateEndpoint(endpoint);

    // Reuse existing connection if available
    if (this.connections.has(serviceId)) {
      const client = this.connections.get(serviceId);
      // Security: Verify client still connected
      if (client.isConnected()) {
        return client;
      }
    }

    // Create new client with transport security
    const client = await this.createSecureClient(endpoint);
    this.connections.set(serviceId, client);
    return client;
  }

  // LRU eviction when at capacity
  evictLRU() {
    const lruServiceId = this.findLRU();
    const client = this.connections.get(lruServiceId);
    await client.close();  // Clean disconnect
    this.connections.delete(lruServiceId);
  }
}
```

**MCP Protocol Security** (2025-03-26 Spec Compliance):
```javascript
// All MCP messages validated against spec
interface MCPRequest {
  jsonrpc: '2.0';           // Fixed version
  method: string;           // tools/call, resources/list, etc.
  params: object;           // Tool-specific parameters
  id: string | number;      // Request ID for correlation
}

// Security validations:
// 1. JSON-RPC 2.0 compliance (reject other versions)
// 2. Method whitelist (only allowed MCP methods)
// 3. Parameter schema validation (Zod schemas)
// 4. Request ID tracking (prevent replay attacks)
```

**Timeout Protection**:
```javascript
// Per-service timeout configuration
const timeout = service.permissions?.maxExecutionTime || 30000;  // Default 30s

// AbortController for timeout enforcement
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout);

try {
  const result = await client.callTool({
    name: tool,
    arguments: args
  }, { signal: controller.signal });
} finally {
  clearTimeout(timeoutId);
}
```

**Rate Limiting** (per-service):
```javascript
// Service-specific rate limits (permissions.rateLimit)
const rateLimit = service.permissions?.rateLimit || {
  requests: 100,
  windowMs: 60000  // 1 minute
};

// Check rate limit before service call
const isAllowed = await checkRateLimit(serviceId, userId, rateLimit);
if (!isAllowed) {
  throw new Error('Rate limit exceeded for service');
}
```

**Real-time Event Security** (PostgreSQL NOTIFY/LISTEN):
```javascript
// Replaced WebSocket with PostgreSQL for internal real-time events
// Security benefits:
// 1. No exposed WebSocket port (attack surface reduced)
// 2. Database-level authentication (reuse existing credentials)
// 3. Channel-based authorization (subscribe only to authorized channels)

await prisma.$executeRaw`NOTIFY pov_updates, ${JSON.stringify({
  povId,
  action: 'workflow_completed',
  userId
})}`;

// Channels are POV-scoped (tenant isolation)
const channel = `pov:${povId}:updates`;
```

**SDK Version Security**:
- **Current**: `@modelcontextprotocol/sdk@1.25.3` (January 2026)
- **Critical Fix**: PR #1214 - Release HTTP connections properly (prevents connection leaks)
- **Security**: ReDoS vulnerability fix (v1.25.2 CVE patch)
- **Validation**: Peer dependency Zod v3.25+ enforced

**Transport Performance vs Security**:

| Transport | Latency | Security | Use Case |
|-----------|---------|----------|----------|
| **Internal Routing** | 0ms (in-process) | ✅ Highest (no network) | paichart-* services |
| **Connection Pool (cached)** | 50-70ms | ✅ High (TLS + reuse) | Frequent calls |
| **Connection Pool (fresh)** | 100-200ms | ✅ High (TLS + validation) | First call |
| **WebSocket (removed)** | N/A | ❌ Deprecated | N/A |

---

## 🚨 Service Registration Security

**Security Control**: Risk-based evaluation and approval workflow for new service registrations to prevent malicious service attacks.

### Service Approval Policy

**Implementation**: `lib/mcp/server/config/service-approval-policy.js`

| Approval Type | Risk Level | Review Time | Criteria |
|---------------|------------|-------------|----------|
| **AUTO_APPROVE** | LOW | Immediate | No risks detected |
| **AUTO_APPROVE_WITH_MONITORING** | MEDIUM | Immediate | Low risk + 7-day monitoring |
| **MANUAL_REVIEW** | HIGH | 24-48 hours | Admin approval required |
| **REJECT** | CRITICAL | Immediate | Blocked patterns detected |

### Trusted Internal Services (Bypass)

**First-party Docker services** bypass all security checks:
- browser-automation-service
- notification-service
- weather-service
- eia-service
- eodhd-service

**Reasoning**: These services run on localhost by design and are owned/operated by pAIchart.

### High-Risk Categories

**Require manual admin approval**:
- system, admin, security, infrastructure, database
- authentication, authorization, payment, financial
- medical, healthcare, government, legal, compliance

### Blocked Endpoint Patterns

| Pattern | Security Risk | Example |
|---------|--------------|---------|
| `localhost`, `127.0.0.1`, `0.0.0.0` | SSRF to local services | http://localhost:8080 |
| `192.168.*`, `10.*`, `172.16-31.*` | Private network access | http://192.168.1.1/admin |
| `169.254.169.254` | Cloud metadata endpoint | AWS/GCP/Azure credential theft |
| `metadata.google.*`, `metadata.azure.*` | Cloud provider metadata | Service account keys |

**Exception**: Admins can register localhost services (internal infrastructure)

**User Guidance** (localhost rejection):
```
🔒 Localhost endpoints are blocked to prevent SSRF attacks
✅ For internal services: Contact admin to add to TRUSTED_INTERNAL_SERVICES
✅ For external services: Use public HTTPS endpoints (https://api.yourservice.com)
✅ For development: Deploy to cloud with proper authentication
📚 See: https://paichart.app/docs/mcp-hub-security-policy
```

### Safe Endpoint Patterns (Auto-Approved)

```regex
^mcp://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:[0-9]+)?/.*$
^https://api\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.*$
^https://[a-zA-Z0-9.-]+\.herokuapp\.com/.*$
^https://[a-zA-Z0-9.-]+\.vercel\.app/.*$
```

---

## 🔍 Two-Tier Tool Approval System

When you call a tool via `services(action: "call")`, the Hub validates it against two whitelists:

### Tier 1: Static Whitelist (Pre-Approved)

These ~50 tools are always allowed without registration:

| Category | Tools |
|----------|-------|
| **Weather & Environmental** | `get_weather`, `get_forecast`, `get_climate_data`, `weather_current`, `weather_forecast` |
| **Data Analysis** | `analyze_data`, `process_data`, `transform_data`, `validate_data`, `parse_data` |
| **Text Processing** | `translate_text`, `summarize_text`, `analyze_sentiment`, `extract_keywords`, `classify_text` |
| **Notifications** | `send_notification`, `send_email`, `create_alert`, `log_event`, `notify` |
| **System Status** | `get_status`, `health_check`, `get_info`, `list_items`, `get_metrics`, `ping`, `test_connection` |
| **Database (Read-Only)** | `query_database`, `search_records`, `get_record`, `list_records`, `find_data` |
| **File Operations (Safe)** | `read_file`, `list_files`, `get_file_info`, `download_file`, `get_content` |
| **Common API Verbs** | `get`, `list`, `search`, `find`, `fetch`, `retrieve`, `check`, `validate`, `test` |
| **pAIchart Platform** | `perform(action: "execute")` |
| **Browser Automation** | `scrape_page`, `fill_form`, `click_element`, `take_screenshot`, `generate_pdf`, `run_script`, `trace_session` |
| **Notification Service** | `send`, `broadcast`, `escalate`, `schedule` |

### Tier 2: Dynamic Whitelist (Registered Tools)

Tools registered in your service's `capabilities.tools` are automatically approved:

```javascript
// When registering your service:
registry(action: "register")({
  name: 'my-analytics-service',
  capabilities: {
    tools: ['custom_report', 'aggregate_metrics', 'trend_analysis']
  }
  // ...
})
```

Now `custom_report`, `aggregate_metrics`, and `trend_analysis` are approved for your service.

### Approval Logic

```
Tool Approved = (In Static Whitelist) OR (Registered with Target Service)
```

If neither condition is met:
```
Error: Tool 'unknown_tool' is not in the approved tools whitelist
       and not registered with service 'my-service'
```

---

## ⛔ Blocked Patterns

The following patterns are **always blocked** regardless of whitelist status:

### System Administration Commands
```
sudo, rm, del, delete, drop, truncate, exec, eval, system
```

### Network/System Access
```
ssh, telnet, ftp, curl, wget, nc, netcat
```

### Code Execution
```
shell, bash, cmd, powershell, exec, spawn
```

### Database Modification
```
insert, update, delete, create, alter, drop, grant, revoke
```

### File System Modification
```
write, create, modify, chmod, chown, mkdir, rmdir
```

### Authentication Bypass
```
bypass.*auth, override.*auth, disable.*auth, skip.*auth
```

### Injection Characters
```
; & | ` $ ( )
```

### Path Traversal
```
../
```

### Script Injection
```
<script, javascript:, data:
```

### Environment Variables
```
${, $VARIABLE
```

### Cloud Metadata Endpoints
```
169.254.169.254, metadata, instance-data
```

### Admin/System Paths
```
/admin, /system, /config, /internal
```

---

## 🌐 URL Restrictions

Parameters containing URLs are validated against blocked patterns:

### Blocked URL Patterns

| Pattern | Reason |
|---------|--------|
| `localhost`, `127.0.0.1`, `0.0.0.0` | Prevents SSRF to local services |
| `192.168.*` | Private network (Class C) |
| `10.*` | Private network (Class A) |
| `172.16-31.*` | Private network (Class B) |
| `169.254.169.254` | Cloud metadata endpoint |
| `metadata.google.*`, `metadata.azure.*`, `metadata.aws.*` | Cloud provider metadata |
| `/admin`, `/wp-admin`, `/administrator` | Admin interfaces |
| `/system`, `/config`, `/debug`, `/internal` | System endpoints |

### Trusted Internal Services Exception

These first-party services can use localhost URLs:
- `browser-automation-service`
- `notification-service`

---

## 📏 Size and Depth Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| **Max Parameter Size** | 100 KB | Prevents memory exhaustion |
| **Max Response Size** | 1 MB | Prevents response flooding |
| **Max Call Depth** | 3 | Prevents infinite service chains |

### Call Depth Example

```
Service A → Service B → Service C → Service D (BLOCKED: depth 4)
```

The call depth prevents:
- Circular call loops
- Infinite recursion
- Resource exhaustion from chained calls

---

## 🔒 Token Delegation Controls (NEW)

**Security Policy**: JWT tokens MUST NOT be forwarded to downstream services.

### Prohibited Pattern

```typescript
// ❌ PROHIBITED: Token forwarding
async function callExternalService(token) {
  const response = await fetch('https://external-service.com/api', {
    headers: { 'Authorization': `Bearer ${token}` }  // ❌ Token leak!
  });
}
```

**Why Prohibited**: Confused deputy attack - external service can impersonate the user.

### Approved Pattern

```typescript
// ✅ APPROVED: Trust-based token passing
const serviceContext = buildServiceContext(trustLevel, contextData);

// If trust level is INTERNAL/TRUSTED/OWNER/TEAM_MEMBER:
//   → serviceContext.token is included
// If trust level is SCOPED/ANONYMOUS:
//   → serviceContext.token is undefined (only povId/tenantId)
```

**Audit Logging**: All token delegations logged to Activity table for forensics.

**Phase 4 Roadmap**: Explicit delegation tracking with revocation capabilities.

---

## 🔐 Sensitive Data Handling

### Detection Patterns

The policy detects and warns about:
- Credit card numbers (4 groups of 4 digits)
- Email addresses
- Phone numbers
- SSN patterns
- API keys and tokens

### Response Filtering

Responses are automatically filtered to redact:
```
api_key: "sk-abc123..."  →  api_key: "[REDACTED]"
card: "4111-1111-1111-1111"  →  card: "[CARD-REDACTED]"
email: "user@example.com"  →  email: "[EMAIL-REDACTED]"
```

---

## ⚠️ Risk Levels

Each validation returns a risk assessment:

| Level | Condition |
|-------|-----------|
| **CRITICAL** | Any CRITICAL severity violation |
| **HIGH** | Any HIGH severity violation |
| **MEDIUM** | Any MEDIUM severity violation |
| **LOW** | Warnings only, no violations |
| **SAFE** | No violations or warnings |

Calls with violations are blocked. Warnings are logged but allowed.

---

## 📊 Security Monitoring & Incident Response (NEW)

### Automated Security Monitoring

**Implementation**: Production cron jobs on paichart.app

| Monitor | Frequency | Purpose | Alert Threshold |
|---------|-----------|---------|-----------------|
| **Trust Denial Patterns** | Hourly | Detect token exposure attempts | 50+ denials/hour |
| **JWKS Health** | Every 5 minutes | Ensure token validation available | HTTP 200 required |
| **JWT Key Age** | Daily 6 AM AEST | Prevent key expiry | 75+ days warning |

**Scripts**:
- `scripts/monitor-trust-denials.sh` - Hourly pattern detection
- `scripts/monitor-jwks-health.sh` - 5-minute health checks
- `scripts/monitor-oauth-logs.sh` - Daily OAuth audit

### Trust Denial Monitoring

**Detection Logic** (hourly cron):
```sql
-- Count trust denials in last hour
SELECT COUNT(*) FROM "Activity"
WHERE action = 'TRUST_DENIAL'
  AND "createdAt" > NOW() - INTERVAL '1 hour';
```

**Alert Thresholds**:
- **CRITICAL** (50+ denials/hour): Potential DoS attack or misconfigured services
- **WARNING** (20-49 denials/hour): Elevated denial rate - investigate
- **NORMAL** (<20 denials/hour): Expected behavior

**Coordinated Attack Detection**:
- 10+ denials for same service in 15 minutes from 5+ users → CRITICAL alert
- Logs to `/var/log/trust-denials.log`
- Optional webhook to Slack/PagerDuty

**Forensic Analysis**:
- Top services with denials
- Denial reasons breakdown
- User patterns (10+ denials from single user = suspicious)

### JWKS Health Monitoring

**Validation Checks** (every 5 minutes):
1. Endpoint accessibility (HTTP 200)
2. Response structure (`.keys` array exists)
3. Key count (>0 keys present)
4. Current key ID present
5. Key structure validation (kty, n, e, use, alg fields)
6. Algorithm validation (RS256 required)
7. Cache headers (max-age directive)
8. Response time (<2 seconds)

**Alert Scenarios**:
- JWKS endpoint down → CRITICAL
- No keys in array → CRITICAL
- Expected key ID missing → CRITICAL
- Response time >2s → WARNING

**Logs**: `/var/log/jwks-monitor.log`

### Security Event Audit Trail

**Activity Table Logging**:
```typescript
// Trust denials
{ action: 'TRUST_DENIAL', type: 'Security', metadata: {...} }

// JWKS health checks
{ action: 'JWKS_HEALTH_CHECK', type: 'Security', metadata: {...} }

// Trust denial monitoring
{ action: 'TRUST_DENIAL_MONITORING', type: 'Security', metadata: {...} }
```

**Retention**: 90 days for compliance audits

### Incident Response Workflow

**Phase 1: Detection** (automated monitors)
- Trust denial pattern detected
- JWKS endpoint failure
- JWT key age threshold exceeded

**Phase 2: Alert** (webhook + syslog)
- Slack/PagerDuty notification
- Email to system@paichart.com
- Syslog entry for centralized monitoring

**Phase 3: Investigation** (forensics)
```bash
# Query trust denial patterns
psql -c "SELECT metadata->>'serviceName', COUNT(*)
         FROM Activity WHERE action='TRUST_DENIAL'
         GROUP BY metadata->>'serviceName' ORDER BY COUNT(*) DESC;"

# Check JWKS health
curl -I https://paichart.app/api/auth/jwks

# Review PM2 logs
pm2 logs mcp-server --lines 100 | grep -i "trust\|jwks\|token"
```

**Phase 4: Remediation**
- Service misconfiguration → Update service registration
- Attack pattern → Block service/user
- JWKS failure → Restart MCP server, verify environment variables
- Key expiry → Execute key rotation (`.claude/knowledge/JWT_KEY_ROTATION_GUIDE.md`)

**Phase 5: Post-Incident**
- Document in Activity table
- Update security policy if pattern repeats
- Add monitoring rule if new attack vector

---

## 📋 Compliance & Governance

### SOC 2 Type II Compliance Mapping

| SOC 2 Principle | Security Control | Implementation |
|----------------|------------------|----------------|
| **CC6.1** - Logical Access | Trust Level System | 6-tier hierarchical token exposure control |
| **CC6.2** - Authentication | RS256/JWKS | Public key cryptography, no shared secrets |
| **CC6.3** - Authorization | Service Approval Policy | Risk-based approval workflow |
| **CC6.6** - Audit Logging | Trust Denial Logging | All security events to Activity table (90-day retention) |
| **CC7.1** - Security Monitoring | Automated Monitors | Hourly trust denials, 5-min JWKS health |
| **CC7.2** - Incident Response | Alert Workflow | Webhook + syslog + forensic queries |

### ISO 27001:2022 Compliance Mapping

| Control | Security Implementation | Evidence |
|---------|------------------------|----------|
| **A.5.15** - Access Control | Trust level determines token access | trust-level.js lines 57-62 |
| **A.5.16** - Identity Management | RS256 signing, JWKS validation | app/api/auth/jwks/route.ts |
| **A.5.17** - Authentication | Multi-factor (OAuth + JWT) | mcp-server-http-clean.js OAuth flow |
| **A.8.15** - Logging | Security event audit trail | Activity table (TRUST_DENIAL, JWKS_HEALTH_CHECK) |
| **A.8.16** - Monitoring | Automated security monitoring | 3 production cron jobs (trust, JWKS, OAuth) |

### GDPR Compliance

| Requirement | Implementation |
|-------------|---------------|
| **Art. 25** - Data Protection by Design | Trust levels prevent over-exposure (SCOPED/ANONYMOUS get no token) |
| **Art. 30** - Records of Processing | Activity table audit trail (90-day retention) |
| **Art. 32** - Security Measures | RS256 encryption, JWKS endpoint, rate limiting |
| **Art. 33** - Breach Notification | Automated alerts (trust denials, JWKS failures) |

### Audit Evidence Collection

**For quarterly compliance audits**:

```bash
# 1. Trust denial statistics (last 90 days)
psql -c "SELECT
  COUNT(*) as total_denials,
  COUNT(DISTINCT \"userId\") as unique_users,
  COUNT(DISTINCT metadata->>'serviceName') as unique_services
FROM Activity
WHERE action='TRUST_DENIAL' AND \"createdAt\" > NOW() - INTERVAL '90 days';"

# 2. JWKS health uptime (last 30 days)
psql -c "SELECT
  COUNT(*) as health_checks,
  SUM(CASE WHEN metadata->>'status'='healthy' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN metadata->>'status'='healthy' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as uptime_pct
FROM Activity
WHERE action='JWKS_HEALTH_CHECK' AND \"createdAt\" > NOW() - INTERVAL '30 days';"

# 3. Service registration approvals (last 90 days)
psql -c "SELECT
  configuration->>'approvalRecommendation' as approval_type,
  COUNT(*) as count
FROM MCPTool
WHERE \"createdAt\" > NOW() - INTERVAL '90 days'
GROUP BY approval_type;"

# 4. Token security validation
curl https://paichart.app/api/auth/jwks | jq '.keys | length'  # Should be 1-2

# 5. Security monitoring log review
tail -100 /var/log/trust-denials.log
tail -100 /var/log/jwks-monitor.log
```

---

## 🎯 Threat Model & Attack Scenarios

### Threat 1: OAuth Token Passthrough Attack

**Attack Vector**: Malicious service receives OAuth provider token instead of pAIchart token

**Before Fix** (CRITICAL vulnerability):
```
1. User authenticates via GitHub OAuth
2. MCP server receives GitHub access token
3. MCP server PASSES GitHub token to external service (not our token!)
4. Malicious service uses GitHub token to access user's repositories
5. Impact: Full GitHub account compromise
```

**Mitigation** (deployed Jan 24, 2026):
- First-party token minting in OAuth flow
- External services receive pAIchart RS256 JWT only
- GitHub token never leaves MCP server
- **Security Score**: +8 points (CRITICAL vulnerability eliminated)

**Detection**: Audit OAuth token exchange responses (should have `iss: https://paichart.app`)

### Threat 2: Token Reuse Across Resources

**Attack Vector**: Attacker steals MCP token, reuses for Web/API access

**Before Fix** (Component 5):
```
1. Attacker intercepts MCP token from external service call
2. Token has no audience restriction (works everywhere)
3. Attacker reuses token to access /api/users, /api/povs (Web APIs)
4. Impact: Unauthorized data access
```

**Mitigation** (deployed Jan 30, 2026):
- Audience-based token isolation (`/api` vs `/mcp`)
- Token validation enforces audience claim
- MCP tokens rejected at Web/API endpoints
- **Security Score**: +4 points (token reuse prevented)

**Detection**: Monitor 401 errors with "Invalid audience" message

### Threat 3: Confused Deputy Attack

**Attack Vector**: Low-trust service receives token, forwards to malicious service

**Scenario**:
```
1. User calls Service A (SCOPED trust, no token)
2. Service A claims to call Service B (needs token)
3. Service A tricks Hub into forwarding user's token
4. Service A receives token, forwards to attacker-controlled server
5. Impact: Token theft
```

**Mitigation** (trust-level.js):
- Trust degradation: Service chains inherit lowest trust
- Explicit token delegation prohibition
- Audit logging for all trust denials
- **Security Score**: Native protection (95/100)

**Detection**: TRUST_DENIAL events in Activity table

### Threat 4: SSRF via Service Registration

**Attack Vector**: Attacker registers service with localhost/metadata endpoint

**Scenario**:
```
1. Attacker registers service: endpoint="http://169.254.169.254/metadata/v1/"
2. Service approved (no validation)
3. Hub calls service → SSRF to cloud metadata endpoint
4. Attacker receives AWS credentials, service account keys
5. Impact: Full cloud infrastructure compromise
```

**Mitigation** (service-approval-policy.js):
- BLOCKED_DOMAINS list (localhost, metadata endpoints)
- Admin-only exception for localhost (infrastructure)
- Actionable user guidance on rejection
- **Security Score**: CRITICAL risk eliminated

**Detection**: Service registration rejections with "BLOCKED_ENDPOINT" reason

### Threat 5: Token Forgery

**Attack Vector**: Attacker generates fake JWT token to impersonate user

**Before Fix** (HS256 only):
```
1. Attacker discovers shared secret (leaked in config, logs)
2. Attacker mints token: sign({ userId: 'admin' }, sharedSecret, 'HS256')
3. Token accepted by system
4. Impact: Full account takeover
```

**Mitigation** (RS256/JWKS):
- Asymmetric cryptography (RSA-2048 private key never shared)
- External services validate via public key only
- Private key rotation without service downtime
- **Security Score**: Cryptographic proof of authenticity (95/100)

**Detection**: Monitor for tokens with invalid signatures

### Threat 6: JWKS Endpoint DoS

**Attack Vector**: Attacker floods JWKS endpoint to prevent token validation

**Scenario**:
```
1. Attacker scripts 10,000 requests/minute to /api/auth/jwks
2. Server CPU saturated, endpoint unresponsive
3. External services can't validate tokens
4. Impact: Service denial for all external integrations
```

**Mitigation** (app/api/auth/jwks/route.ts):
- Rate limiting (100 requests/minute per IP)
- 24-hour cache headers (reduces load)
- 5-minute health monitoring (alerts on downtime)
- **Security Score**: DoS resilience (95/100)

**Detection**: JWKS health check failures in `/var/log/jwks-monitor.log`

### Threat 7: Service Registry Poisoning (Hub-Specific)

**Attack Vector**: Attacker registers malicious service, then social engineers users to call it

**Scenario**:
```
1. Attacker registers service: "data-analytics-pro" (sounds legitimate)
2. Service auto-approved (passes basic checks)
3. Attacker markets service to users via Slack/Discord
4. Users call service via services(action: "workflow.execute")
5. Service exfiltrates data via arguments or response manipulation
6. Impact: Data theft, credential harvesting
```

**Mitigation** (service-approval-policy.js + user education):
- Risk-based approval workflow (HIGH_RISK_CATEGORIES require manual review)
- 7-day monitoring for AUTO_APPROVE_WITH_MONITORING
- Service reputation tracking (success rate, error rate)
- User warnings for low-reputation services
- **Security Score**: Moderate risk (depends on user awareness)

**Detection**:
- Low success rate for new services
- High error count in MCPInteraction logs
- TRUST_DENIAL patterns for suspicious services

**Recommendation**:
```javascript
// Show service reputation before calling
services(action: "discover", { capability: 'analytics' })
// Response includes:
{
  services: [{
    name: 'data-analytics-pro',
    successRate: 45%,  // ⚠️ Warning: Low success rate
    errorCount: 127,
    registrationDate: '2026-01-30'  // ⚠️ Warning: Newly registered
  }]
}
```

### Threat 8: Workflow Orchestration DoS (Hub-Specific)

**Attack Vector**: Attacker creates workflow with excessive steps or circular dependencies

**Scenario**:
```
1. Attacker creates workflow with 1000 steps (MAX_STEPS_PER_WORKFLOW = 20)
2. OR creates circular dependency: Step 1 depends on Step 5, Step 5 depends on Step 1
3. Workflow execution exhausts server resources
4. Impact: Hub unavailable for legitimate users
```

**Mitigation** (orchestration-engine.js):
- MAX_STEPS_PER_WORKFLOW = 20 (Zod schema validation)
- Circular dependency detection (DFS algorithm)
- MAX_CONCURRENT_EXECUTIONS_PER_USER = 10
- Per-user rate limiting on services(action: "workflow.execute")
- **Security Score**: CRITICAL risk eliminated (95/100)

**Detection**:
```javascript
// Circular dependency error
Error: Circular dependency detected in workflow:
  Step 1 → Step 5 → Step 8 → Step 1

// Execution limit error
Error: User has 10 running workflows (maximum allowed)
```

**Audit Logging**:
```sql
-- Monitor workflow execution limits
SELECT userId, COUNT(*) as running_workflows
FROM "MCPWorkflowExecution"
WHERE status = 'RUNNING'
GROUP BY userId
HAVING COUNT(*) >= 8;  -- Alert threshold
```

### Threat 9: Connection Pool Exhaustion (Hub-Specific)

**Attack Vector**: Attacker floods service calls to exhaust connection pool

**Scenario**:
```
1. Attacker creates 50 concurrent workflows
2. Each workflow calls external service 10 times
3. Connection pool maxed out (maxConnections = 20)
4. LRU eviction thrashing (constant create/close)
5. Impact: Legitimate users get "Connection pool exhausted" errors
```

**Mitigation** (service-connection-pool.js):
- LRU eviction when at maxConnections (20)
- Connection reuse (stats tracking: created vs reused)
- Per-user execution limits (prevents single user monopolizing pool)
- 5-minute idle timeout (reclaims stale connections)
- **Security Score**: Moderate risk (DoS possible but limited)

**Detection**:
```javascript
// Pool statistics
const stats = connectionPool.getStats();
{
  activeConnections: 18,  // ⚠️ Warning: Near limit
  created: 234,
  reused: 1891,           // ✅ Good: 89% reuse rate
  evictions: 12           // ⚠️ Watch: Evictions indicate pressure
}
```

**Monitoring**:
```bash
# Alert if evictions spike
grep "evictions:" /var/log/mcp-hub.log | tail -100
# Threshold: >50 evictions/hour = investigate
```

### Threat 10: Cross-Tenant Data Leakage (Hub-Specific)

**Attack Vector**: Malicious service ignores povId scoping, returns data from other tenants

**Scenario**:
```
1. User A calls external service with povId: 'pov-A'
2. Service receives: { povId: 'pov-A', userId: 'user123', token: '...' }
3. Malicious service IGNORES povId, queries all tenants' data
4. Returns data from pov-B, pov-C in response
5. Impact: Data breach, GDPR violation
```

**Mitigation** (multi-layered):
- **Layer 1**: Trust level system (SCOPED services get no token)
- **Layer 2**: Token claims validation (povId encoded in JWT)
- **Layer 3**: Internal services enforce scoping (paichart-* services)
- **Layer 4**: User education (verify service behavior before use)
- **Security Score**: High risk for external services (depends on service implementation)

**Detection** (requires external service cooperation):
```javascript
// External service SHOULD log povId usage
logger.audit({
  action: 'query_executed',
  povId: request._context.povId,
  recordsReturned: results.length,
  timestamp: new Date()
});

// Hub can detect anomalies:
// - Service called with povId A, but returns records from povId B
// - Requires response inspection (not implemented)
```

**Best Practice for External Services**:
```javascript
// ✅ CORRECT: Respect povId scoping
async function handleRequest(request) {
  const { povId } = request._context;

  // Validate povId is in token claims
  const claims = verifyJWT(request._context.token);
  if (claims.povId !== povId) {
    throw new Error('POV ID mismatch');
  }

  // Enforce scoping in ALL queries
  return await db.records.findMany({
    where: { tenantId: povId }  // REQUIRED
  });
}
```

**Recommendation**: Hub should implement response inspection for POV ID leakage (future enhancement)

---

## 🛠️ Troubleshooting

### "Tool 'X' is not in the approved tools whitelist"

**Cause**: Tool not in static whitelist AND not registered with service.

**Fix**: Add the tool to your service's `capabilities.tools`:
```javascript
registry(action: "update")({
  serviceId: 'your-service-id',
  updates: {
    capabilities: {
      tools: ['existing_tool', 'X']  // Add the missing tool
    }
  }
})
```

### "Detected blocked pattern in tool or parameters"

**Cause**: Tool name or parameters contain blocked keywords.

**Fix**: Rename tool to avoid blocked patterns:
- `delete_user` → `remove_user`
- `exec_script` → `run_script`
- `admin_action` → `privileged_action`

### "Blocked URL detected in parameters"

**Cause**: Parameters contain localhost or private network URLs.

**Fix**: Use public HTTPS endpoints in parameters:
```javascript
// BAD
arguments: { url: 'http://localhost:8080/api' }

// GOOD
arguments: { url: 'https://api.example.com/endpoint' }
```

### "Parameters exceed maximum size limit"

**Cause**: JSON-serialized parameters exceed 100KB.

**Fix**: Reduce parameter size or split into multiple calls.

### "Service call depth exceeds maximum"

**Cause**: Service A called B called C called D (4 levels).

**Fix**: Flatten your service call chain to maximum 3 levels.

### "Trust denial: SCOPED trust level does not receive tokens"

**Cause**: Service has SCOPED trust (public service with POV context) but expects token.

**Fix Options**:
1. **Service owner joins POV team** → TEAM_MEMBER trust (receives token)
2. **User owns the service** → OWNER trust (receives token)
3. **Service uses povId for scoping** → No token needed (identifier only)

**Verification**:
```bash
# Check trust denial logs
psql -c "SELECT metadata FROM Activity
         WHERE action='TRUST_DENIAL'
         ORDER BY \"createdAt\" DESC LIMIT 10;"
```

### "JWKS endpoint returned empty keys array"

**Cause**: All keys expired or JWT_PUBLIC_KEY_BASE64 not set.

**Fix**:
```bash
# 1. Verify environment variable
echo $JWT_PUBLIC_KEY_BASE64

# 2. Check key expiry
curl https://paichart.app/api/auth/jwks | jq '.keys[].kid'

# 3. If expired, rotate keys (see JWT_KEY_ROTATION_GUIDE.md)
```

---

## 📚 Related Documentation

### Hub Architecture
- [MCP Hub Discovery](../../../.claude/knowledge/discoveries/mcp-hub-discovery.md) - Complete Hub architecture mapping
- [MCP Hub Integration Guide](./mcp-hub-integration-guide.md) - Getting started with MCP Hub
- [MCP Hub Service Registration](./mcp-hub-service-registration-reference.md) - Service registration reference
- [MCP Hub Workflow Orchestration](./mcp-hub-workflow-orchestration-reference.md) - Multi-service orchestration patterns

### Security Implementation
- [Service Call Policy](../../../lib/mcp/server/config/service-call-policy.js) - Compliance policy implementation
- [Trust Level System](../../../lib/services/workflow/security/trust-level.js) - 6-tier trust hierarchy
- [Tool Security Configuration](../../../lib/mcp/server/config/tool-security.js) - Authentication requirements
- [Service Approval Policy](../../../lib/mcp/server/config/service-approval-policy.js) - Risk-based approval workflow

### Authentication & Tokens
- [OAuth Audience Architecture](../oauth/oauth-audience-architecture.md) - Token isolation details
- [JWT Key Rotation Guide](../../JWT_KEY_ROTATION_GUIDE.md) - Zero-downtime key rotation procedures
- [Phase 3 Implementation](../../../../cline_docs/reviews/phase-3-jwt-enhancements-2026-01-24/) - RS256/JWKS deployment
- [External Service Auth Guide](./mcp-hub-external-service-authentication.md) - How external services validate tokens

### Implementation Patterns
- [Facade Extraction Pattern](../../../.claude/knowledge/patterns/facade-extraction-pattern.md) - Modular handler architecture
- [Field Leakage Prevention](../../../.claude/knowledge/patterns/field-leakage-prevention-pattern.md) - Cross-boundary validation
- [Global Prisma Singleton](../../../.claude/knowledge/patterns/global-prisma-singleton-pattern.md) - Shared database access

### Troubleshooting
- [Service Onboarding Guide](../../../../cline_docs/mcp-hub-service-onboarding-troubleshooting-guide.md) - 80+ pages of troubleshooting
- [Compliance Monitor](../../../lib/mcp/server/compliance/compliance-monitor.js) - Automated compliance checks

---

## 🔄 Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.1.0 | 2026-01-31 | **HUB ARCHITECTURE UPDATE**: Added Hub Architecture Security sections: Service Registry Architecture (MCPTool model, field standardization), Service Discovery Security (public/auth modes, caching), Service Health Monitoring (real HTTP pings, custom paths), Cross-Service Communication (7-step validation flow, connection pooling), Internal Service Infrastructure (zero network overhead), Workflow Orchestration Security (execution modes, limits, circular dependency detection), Cross-Tenant Isolation (POV-based scoping, withPOVAccess), MCP Protocol Security (transport validation, rate limiting, TLS) |
| 2.0.0 | 2026-01-31 | **MAJOR SECURITY UPDATE**: Added Token Security Architecture (RS256/JWKS, audience isolation, first-party minting), Trust Level System (6-tier hierarchy), Service Registration Security, Token Delegation Controls, Security Monitoring, Incident Response, Threat Model, Compliance Mapping (SOC 2, ISO 27001, GDPR) |
| 1.0.0 | 2026-01-11 | Initial documentation of compliance policy (tool approval, blocked patterns, URL restrictions, size limits) |

---

## 📞 Security Support

For security concerns or custom approval requests:

- **Email**: mcp-support@paichart.com
- **Emergency**: system@paichart.com (monitored 24/7)
- **Documentation**: https://paichart.app/docs/mcp-hub-security-policy

**Expected Response Times**:
- Critical security incidents: 2 hours
- Custom tool approval: 24-48 hours
- General inquiries: 2-3 business days
