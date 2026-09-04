# MCP Hub Architecture

> **Technical reference for administrators and advanced developers**
>
> Hub components, service routing, security layers, and performance optimizations

---

## 🎯 Quick Navigation

**What do you need?**

- **[A] Understand components** → See Hub Components
- **[B] Service call flow** → See 7-Step Validation Flow
- **[C] Internal routing** → See Internal vs External Routing
- **[D] Security architecture** → See Multi-Layer Security
- **[E] Performance** → See Optimizations

---

## 🏗️ What You'll Learn

By the end of this guide, you'll understand:
- ✅ Hub architecture components (registry, router, pool)
- ✅ Service call flow (7-step validation)
- ✅ Internal routing (zero-overhead for platform services)
- ✅ Security layers (4-tier protection)
- ✅ Connection pooling (50-70% faster)

**Audience**: Admins, architects, advanced developers

---

## Section A: Hub Components

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        pAIchart Hub                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ Discovery   │    │ Orchestration│    │ Compliance Layer     │   │
│  │ Registry    │    │ Engine       │    │ (Anthropic MCP)      │   │
│  └─────────────┘    └──────────────┘    └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                      │
         │  MCP Protocol (SSE / Streamable HTTP)
         │                    │                      │
         ▼                    ▼                      ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐
│ Your Service │    │ Weather API  │    │ Browser Automation       │
│ (Private)    │    │ (Public)     │    │ Service (Internal)       │
└──────────────┘    └──────────────┘    └──────────────────────────┘
```

---

### Component 1: Service Registry (MCPTool Model)

**Database Model**: Centralized registry for all MCP services

**Column Purpose** (WHO vs HOW):
- **configuration**: Operational settings (HOW service operates)
  - `endpoint`: Service URL (HTTPS, SSE, internal://)
  - `category`: Service classification
  - `healthCheckPath`: Custom health endpoint
  - `type`: `'external'` or `'internal'` (routing optimization)

- **permissions**: Access control (WHO can access)
  - `publicAccess`: boolean (everyone vs owner-only)
  - `rateLimit`: `{ requests, windowMs }`
  - `maxExecutionTime`: Per-service timeout

---

### Component 2: Orchestration Engine

**Purpose**: Execute multi-service workflows with dependency management

**Features**:
- 3 execution modes (sequential, parallel, conditional)
- Variable chaining (`{{step.N.output...}}`)
- Failure strategies (stop, continue, rollback)
- Circular dependency detection

**Execution Modes**:
- **Sequential**: Steps run in order, each can reference previous outputs via variable chaining
- **Parallel**: Independent steps run in `Promise.all` batches (max 5 concurrent), dependent steps run after
- **Conditional**: Step 0 = condition check, Step 1 = "then" branch (if success + data), Step 2 = "else" branch (if failure or no data). Max 3 steps.

**Failure Strategies**:
- **stop** (default): Halt on first failure
- **continue**: Execute all steps, record failures
- **rollback**: Halt on first failure (same as stop; automatic undo is planned but not yet implemented)

**Limits**:
- Max 20 steps per workflow
- Max 5 parallel steps (batched)
- Max call depth: 3 (prevents infinite chains)
- Global timeout: 10 min (default: 1 min)
- Per-step timeout: 1-60 seconds (enforced at runtime)

---

### Component 3: Internal Service Router

**Purpose**: Zero-overhead routing for pAIchart platform services

**Registered Services**:
- `paichart-project-service` (project(action: 'pov.list'), project(action: 'pov.details'), project(action: 'task.list'), project(action: 'task.context'), perform)
- Legacy aliases: `paichart-pov-service`, `paichart-task-service` (backward compat only)

**Performance**:
- **Internal**: ~0ms network overhead (same process)
- **External**: ~100-200ms (HTTP round-trip)
- **Savings**: 100-200ms per internal call

---

### Component 4: Service Connection Pool

**Purpose**: Reuse MCP client connections for performance

**Features**:
- Connection caching (serviceId → MCP Client)
- LRU eviction (max 20 connections)
- Idle timeout (5 minutes)
- Transport auto-detection (SSE vs HTTP)
- Promise deduplication (concurrent calls to same service share one connection creation)
- Proactive stale detection (`client.onclose()` removes dead connections immediately)
- Statistics tracking (hits, misses, evictions, errors per pool instance)

**Performance**:
- **First call**: ~200ms (create connection + call)
- **Cached call**: ~50ms (reuse connection)
- **Improvement**: 50-70% faster

---

### Component 4b: Resilient Service Call Utility

**Purpose**: Wrap external MCP service calls with automatic retry on network failures

**Features**:
- 30-second timeout per call
- Auto-retry on stale connections (ECONNRESET, EPIPE, socket hang up)
- Conservative error classification (only retries known-network errors, not application errors)
- Single retry maximum (no retry storms)
- Fire-and-forget eviction of stale connections from pool before retry

---

### Component 5: Compliance Layer

**Purpose**: Validate all service calls against Anthropic Acceptable Use Policy

**Blocked Patterns** (12+ categories):
- System commands: sudo, rm, delete, drop, exec
- Network access: ssh, curl, shell, bash
- Database mods: insert, update, alter, grant
- Injection: ; & | ` $ ( ) ../

**URL Restrictions**:
- Localhost/private IPs (SSRF prevention)
- Cloud metadata endpoints
- Admin paths (/admin, /system)

**Size Limits**:
- Max parameter size: 100 KB
- Max response size: 1 MB
- Max call depth: 3

---

## Section B: 7-Step Validation Flow

**Every cross-service call goes through**:

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
│ 3. Compliance Policy Check          │  ❌ Block dangerous tools/URLs
│    - validateServiceCall()          │
│    - Blocked patterns (12+)         │
│    - SSRF protection                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 4. Service Lookup                   │  ❌ Service not found
│    (MCPTool database query)         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 5. Service Access Authorization     │  ❌ Unauthorized access
│    - checkServiceAccess()           │
│    - Owner/admin/public check       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 6. Trust Level Determination        │  🔐 Token gating decision
│    - determineTrustLevel()          │
│    - Build service context          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 7. Service Routing                  │
│    - Internal: InternalServiceRouter│  (no HTTP)
│    - External: MCP SDK Client       │  (HTTP/SSE)
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 8. Audit Logging                    │  📊 Activity table
│    - SERVICE_CALL (success)         │
│    - UNAUTHORIZED_SERVICE_ACCESS    │
│    - TRUST_DENIAL (if applicable)   │
└─────────────────────────────────────┘
```

---

## Section C: Internal vs External Routing

### Internal Services (Zero-Overhead)

**Services**:
- `paichart-project-service` (preferred)
- `paichart-pov-service` (legacy alias)
- `paichart-task-service` (legacy alias)

**Routing**:
```
User → Hub → InternalServiceRouter → Direct handler call → Database
       0ms network overhead
```

**Benefits**:
- ✅ No HTTP overhead (100-200ms savings)
- ✅ No rate limits (same process)
- ✅ Shared auth context
- ✅ Always healthy (no ping needed)

---

### External Services (HTTP/SSE)

**Services**:
- `browser-automation-service` (localhost:3100)
- `notification-service` (localhost:3101)
- User-registered services

**Routing**:
```
User → Hub → ServiceConnectionPool → HTTP/SSE transport → External service
       100-200ms network latency
```

**Optimization**: Connection pooling (50-70% faster on subsequent calls)

---

### Comparison

| Aspect | Internal | External |
|--------|----------|----------|
| **Latency** | ~0ms | ~100-200ms |
| **Transport** | Direct function call | HTTP/SSE |
| **Process** | Same Node.js runtime | Separate process/container |
| **Health Check** | Instant (same process) | HTTP ping required |
| **Rate Limits** | None (same process) | Hub-enforced |
| **Use Case** | pAIchart core tools | Third-party integrations |

---

## Section D: Multi-Layer Security

### Layer 1: Tool-Level Security

**First check**: Is tool public or authenticated?

**Security tiers**:
- **PUBLIC**: None (Phase 3: all tools require auth)
- **AUTHENTICATED**: All consolidated tools (`services(action: 'discover')`, `registry(action: 'register')`, `services(action: 'call')`, etc.)
- **ADMIN**: Via action handlers (`pov.update`, `template`), not tool-level. `pov.create` is RolePermission-table governed (ADMIN+USER, DEMO blocked) since 2026-05-25.

---

### Layer 2: Compliance Policy

**Second check**: Are tool name and parameters safe?

**Validation**:
- Tool name doesn't contain blocked patterns
- Parameters don't contain injection characters
- URLs aren't localhost/private networks
- No path traversal attempts

**Blocked patterns**: 12+ categories (shell, exec, delete, ssh, etc.)

---

### Layer 3: Role-Based Authorization

**Third check**: Does user have permission?

**Checks**:
- Admin-only actions (pov.update); pov.create is table-governed (ADMIN+USER)
- Service ownership (registry(action: 'update'))
- POV access (project(action: 'task.list') with povId)

**Roles**:
- **DEMO_USER**: Full Hub access
- **ADMIN**: Full Hub + POV management
- **SUPER_ADMIN**: Complete platform access

---

### Layer 4: Trust-Level Token Gating

**Fourth check**: Should this service receive a JWT token?

**Trust hierarchy**:
1. **INTERNAL** → Token passed (pAIchart-* services)
2. **TRUSTED** → Token passed (localhost Docker)
3. **OWNER** → Token passed (you own service)
4. **TEAM_MEMBER** → Token passed (owner in POV team)
5. **SCOPED** → No token (public + POV context)
6. **ANONYMOUS** → No token (public, no POV)

**Purpose**: Prevent token leakage to untrusted services

---

## Section E: Data Architecture

### MCPTool (Service Registry)

**Purpose**: Store all registered MCP services

---

### MCPWorkflowExecution (Workflow Tracking)

**Purpose**: Track all workflow executions

**Status values**:
- RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT

---

### Activity (Audit Logging)

**Purpose**: Security audit trail (90-day retention)

**Logged events**:
- `SERVICE_CALL` (success)
- `UNAUTHORIZED_SERVICE_ACCESS` (blocked)
- `TRUST_DENIAL` (token withheld)
- `WORKFLOW_EXECUTION` (completion)

**Retention**: 90 days (compliance requirement)

---

## Section F: Performance Optimizations

### Optimization 1: Connection Pooling

**Problem**: Creating new MCP connections is expensive (~200ms)

**Solution**: Reuse connections across requests

**Results**:
- First call: ~200ms
- Cached call: ~50ms
- **Improvement**: 50-70% faster

---

### Optimization 2: Discovery Cache

**Problem**: Service discovery queries are expensive

**Solution**: 60-second cache with LRU eviction

**Cache invalidation**: Automatic on register/update/delete

---

### Optimization 3: Parallel Queries

**Problem**: Sequential database queries are slow

**Solution**: Use `Promise.all` for independent queries

**Improvement**: 40-50% faster for multi-query operations

---

### Optimization 4: JWKS Caching

**Problem**: Fetching JWKS on every validation is slow

**Solution**: 24-hour cache (HTTP cache headers)

**Validation time**: ~34ms (including cached JWKS fetch)

---

## Section G: Transport Protocols

### Supported Transports

**1. Streamable HTTP** (`/mcp` endpoint):
- Standard HTTP POST (JSON-RPC)
- Firewall-friendly (works through corporate proxies)
- Perfect for serverless (AWS Lambda, Cloudflare Workers)
- Recommended for external services

**2. SSE** (`/sse` endpoint):
- Server-Sent Events (long-lived connection)
- Bidirectional with POST /message
- Better for real-time streaming
- Use for internal Docker services

**3. WebSocket** (REMOVED):
- Removed January 2026 (security/performance concerns)
- Use Streamable HTTP or SSE instead

---

### Transport Security

**TLS Certificate Validation**:

**Endpoint Validation**:

---

## Section H: Token Architecture

### Unified Key Architecture

**Design**: One RSA key pair for all tokens

**Key Details**:
- **Key ID**: `paichart-2026-01`
- **Algorithm**: RS256 (RSA-2048)
- **Rotation**: Every 90 days
- **Audiences**: `https://paichart.app/api` (web), `https://paichart.app/mcp` (MCP)

**Token Isolation**: Achieved via `aud` claim, not separate keys

**Why unified**:
- ✅ RFC 8707/9068 compliant (industry standard)
- ✅ Simpler key rotation (one schedule)
- ✅ JWKS works for all token types

---

### JWKS Endpoint

**URL**: `GET https://paichart.app/api/auth/jwks`

**Response**:
```json
{
  "keys": [{
    "kty": "RSA",
    "kid": "paichart-2026-01",
    "use": "sig",
    "alg": "RS256",
    "n": "...",  // Public key modulus
    "e": "AQAB"  // Public key exponent
  }]
}
```

**Features**:
- Multi-key support (current + previous during rotation)
- Automatic expired key filtering
- 24-hour cache headers
- Rate limited (100/min per IP)

**Security Score**: 95/100 (enterprise-grade)

---

### Token Claims

**Standard claims**:
```typescript
{
  sub: "user-id",              // User ID
  userId: "user-id",           // Duplicate
  email: "user@company.com",   // Email
  role: "ADMIN",               // Role
  iss: "https://paichart.app", // Issuer
  aud: "https://paichart.app/mcp",  // Audience (Component 5)
  exp: 1737012345,             // Expiration
  iat: 1737008745              // Issued at
}
```

**Algorithms**:
- **RS256**: External tokens (MCP OAuth, web sessions)
- **HS256**: Legacy API keys (deprecated, sunset Jul 5, 2026)

---

## Section J: Cross-Tenant Isolation

### POV-Based Tenancy

**Tenant hierarchy**:
```
User → POV (tenant boundary) → Team → Tasks → Workflows
```

**POV ID Propagation**:

---

### Tenant Boundary Enforcement

**Service calls**:

**Database queries**:

**Trust level check**:

---

### Attack Prevention

| Attack Vector | Mitigation |
|---------------|-----------|
| **POV ID manipulation** | Token validation (povId in JWT claims) |
| **Cross-tenant calls** | Trust level verification (TEAM_MEMBER check) |
| **Data leakage** | withPOVAccess middleware |
| **Unauthorized team access** | Database-level WHERE clause |

---

## Section K: Rate Limiting Architecture

### Three-Tier Rate Limiting

**Tier 1: Global Hub Limits**
- Discovery: 100/min (public), 1000/min (authenticated)
- Service calls: 1000/min (authenticated)
- JWKS: 100/min per IP

**Tier 2: Per-Service Limits**
- Configurable via `registry(action: "update")`
- Default: 10/min per service
- Enforced before calling service

**Tier 3: Service-Specific Limits**
- Set by service owner
- Hub enforces via rate limiter
- Custom: 1-10,000 requests per window

**Enforcement point**: Before Hub calls external service

---

## Section L: Monitoring & Health

### Service Health Checks

**Real HTTP pings** (not simulated):

**Features**:
- 5-second timeout (AbortController)
- 30-second cache (reduces load)
- Realtime bypass (`realtime: true`)
- Status detection (HTTP 2xx = ACTIVE)

---

### Hub Performance Metrics

**Available via**: `services(action: 'workflow.list')` and `services(action: 'workflow.status')`

**Metrics**:
- Cache hit rates
- Average response times
- Service success rates
- Connection pool stats

---

## 🚀 Key Architectural Decisions

### Decision 1: Unified Key Architecture

**Choice**: One RSA key for web + MCP tokens

**Rationale**:
- RFC 8707 compliant (industry standard)
- Simpler rotation (one 90-day schedule)
- Audience claims provide isolation

**Alternative rejected**: Separate keys per resource (too complex)

---

### Decision 2: First-Party Token Minting

**Choice**: Mint pAIchart tokens (don't pass OAuth provider tokens)

**Rationale**:
- Prevents GitHub/Microsoft account compromise
- Full control over token capabilities
- Revocable at pAIchart level

**Security impact**: 0/10 → 95/100 (CRITICAL fix)

---

### Decision 3: Internal Service Router

**Choice**: Direct handler calls for pAIchart-* services

**Rationale**:
- Zero HTTP overhead (100-200ms savings)
- Shared auth context (no token passing needed)
- Same process = always healthy

**Trade-off**: Tighter coupling (acceptable for platform services)

---

### Decision 4: Trust Level System

**Choice**: 6-tier hierarchy for token passing

**Rationale**:
- Granular control (not all-or-nothing)
- Team collaboration (TEAM_MEMBER trust)
- Prevents delegation attacks

**Alternative rejected**: Always pass tokens (too risky), never pass tokens (too restrictive)

---

## 📚 Related Documentation

**User Guides**:
- [A] **get_started** - Role-based tutorials
- [D] **register_guide** - Service registration
- [I] **workflow_guide** - Multi-service orchestration

**Security**:
- [F] **security_policy** - Compliance, blocked patterns
- [G] **trust_levels** - 6-tier trust system
- [E] **external_service_auth** - JWKS validation

---

## 💬 Support

**Architecture Questions**: steve.terry@paichart.com
**Documentation**: https://paichart.app/docs
**Source Code**: Private (enterprise platform)

---

## 📖 Quick Reference

### Hub Components

1. **Service Registry** - MCPTool model (service catalog)
2. **Orchestration Engine** - Multi-service workflow execution
3. **Internal Router** - Zero-overhead platform services
4. **Connection Pool** - Reuse MCP connections (50-70% faster)
5. **Compliance Layer** - Anthropic AUP validation

### Service Call Flow (7 Steps)

1. Authentication check
2. Zod schema validation
3. Compliance policy check
4. Service lookup (database)
5. Access authorization
6. Trust level determination
7. Service routing (internal vs external)
8. Audit logging

### Internal vs External

| Feature | Internal | External |
|---------|----------|----------|
| Latency | ~0ms | ~100-200ms |
| Transport | Direct call | HTTP/SSE |
| Health | Always healthy | HTTP ping |
| Rate limits | None | Hub-enforced |

### Security Layers

1. **Tool-level** - PUBLIC/AUTHENTICATED/ADMIN
2. **Compliance** - Blocked patterns, SSRF
3. **Role-based** - User/Admin permissions
4. **Trust-level** - Token gating (6 tiers)

### Performance Optimizations

- **Connection pooling**: 50-70% faster (subsequent calls)
- **Discovery cache**: 60s TTL (reduces DB load)
- **Parallel queries**: 40-50% faster (Promise.all)
- **JWKS cache**: 24h TTL (34ms validation)
- **Internal routing**: 100-200ms savings (zero HTTP)

### Database Models

- **MCPTool** - Service registry
- **MCPWorkflowExecution** - Workflow tracking
- **Activity** - Audit logging (90-day retention)

---

**Version**: 1.1 | **Updated**: 2026-03-03 | **Status**: Production-Ready
**Total Tools**: 35 tools | **Handlers**: 16 specialized handlers
**Security**: 4-layer validation | **Performance**: 50-70% faster (pooling)
