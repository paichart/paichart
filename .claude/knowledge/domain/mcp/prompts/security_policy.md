# MCP Hub Security Policy

> **User-friendly guide to Hub security, compliance, and safeguards**
>
> Understand what's allowed, what's blocked, and how to troubleshoot security issues

---

## 🎯 Quick Navigation

**What are you trying to do?**

- **[A] Understand what's safe** → See Allowed Operations
- **[B] Troubleshoot blocked calls** → See Troubleshooting
- **[C] Learn security model** → See Multi-Layer Security
- **[D] Configure rate limits** → See Rate Limiting
- **[E] Understand admin tools** → See Admin vs User Tools

---

## 🔐 Security Score: 95/100 (Enterprise-Grade)

**pAIchart MCP Hub implements comprehensive safeguards** to ensure safe, compliant AI interactions:

✅ **Multi-layer validation** (4 security layers)
✅ **Token security** (RS256/JWKS public key cryptography)
✅ **Trust-based access** (6-tier hierarchy)
✅ **Content filtering** (17 blocked patterns + SSRF blocklist)
✅ **Rate limiting** (prevent abuse)
✅ **Audit logging** (90-day retention)

**Purpose**: Enable innovation while ensuring safe and responsible use

---

## Section A: Allowed Operations (What You CAN Do)

### ✅ Service Discovery

**Always allowed** (no authentication required):

```javascript
// Find services by capability
services(action: "discover", capability: "monitoring")

// Check service health
services(action: "health", service_name: "notification-service")

// View service tools and parameters
registry(action: "tools", { service_name: "browser-automation-service" })
```

**What you see (public vs authenticated)**:

| Field | Public Users | Authenticated Users | Service Owners |
|-------|-------------|--------------------|--------------------|
| Service name | ✅ | ✅ | ✅ |
| Description | ✅ | ✅ | ✅ |
| Capabilities | ✅ | ✅ | ✅ |
| Status | ✅ | ✅ | ✅ |
| Health metrics | ✅ | ✅ | ✅ |
| **Endpoint URL** | ❌ | ❌ | ✅ |
| **Owner ID** | ❌ | ✅ | ✅ |
| **Credentials** | ❌ | ❌ | ✅ (never exposed to users) |

**Why hidden**: Endpoint URLs and credentials are security-sensitive. Only service owners need to see their own service endpoints.

---

### ✅ Service Registration & Management

**Authenticated users can**:

```javascript
// Register your own MCP service
registry(action: "register", {
  name: "my-weather-api",
  endpoint: "https://api.myservice.com/mcp",  // Your endpoint
  category: "data-services",
  capabilities: { tools: ["get_forecast"] }
})

// Update your service settings
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    permissions: { publicAccess: true },  // Make service public
    rateLimit: { requests: 100, windowMs: 60000 },  // 100/min (flat, not inside permissions)
    maxExecutionTime: 30000  // 30 second timeout (flat)
  }
})

// View your services
registry(action: "list", { includeMetrics: true })
```

**Security boundaries**:
- ✅ Can register external HTTPS services
- ✅ Can use custom health check paths (no `..` traversal)
- ✅ Can configure rate limits and timeouts
- ❌ Cannot use localhost URLs (SSRF prevention — enforced at both registration AND update)
- ❌ Cannot use private network IPs (10.*, 192.168.*, 172.16-31.*)
- ❌ Cannot use cloud metadata endpoints (169.254.169.254, metadata.google/azure/aws)
- ❌ Cannot register services with blocked tool names (see Section B)

---

### ✅ Cross-Service Communication

**Call tools on any service you have access to**:

```javascript
services(action: "call", {
  targetService: "notification-service",
  tool: "send",
  arguments: {
    channel: "email",
    message: { subject: "Task Complete", body: "..." }
  }
})
```

**Access control**:
- **Public services** (`publicAccess: true`) → Any authenticated user
- **Private services** (`publicAccess: false`) → Owner + Hub admins only

**Token passing** (automatic, trust-based):
- ✅ **OWNER**: You call your own service → Receives your JWT token
- ✅ **TEAM_MEMBER**: You are in a POV team owned by the service owner → Receives token
- ❌ **SCOPED**: Public service with POV context → No token (only povId)
- ❌ **ANONYMOUS**: Public service, no POV → No token

**Why token-gating**: External services can validate tokens via JWKS endpoint, but we only pass tokens to trusted services to prevent abuse.

---

### ✅ Workflow Orchestration

**Create multi-service workflows**:

```javascript
services(action: "workflow.execute", {
  steps: [
    { service: "paichart-project-service", tool: "project", arguments: { action: "pov.list" } },
    { service: "notification-service", tool: "send", arguments: {...}, dependsOn: [0] }
  ],
  executionMode: "sequential"  // or "parallel", "conditional"
})
```

**Security limits**:
- ✅ Max 20 steps per workflow
- ✅ Max 5 parallel steps (concurrent execution)
- ✅ Max call depth: 3 (service chains limited)
- ✅ Variable chaining: `{{step.N.output.field}}` (no code execution)

**Why limits**: Prevent resource exhaustion and infinite loops.

---

## Section B: Blocked Patterns (What's NOT Allowed)

### ⛔ Blocked Patterns in `services(action: 'call')`

**The compliance policy scans tool names AND `JSON.stringify(arguments)` for 17 patterns.**

Tools pass if they appear in the static APPROVED_TOOLS whitelist OR are registered with the target service (dynamic whitelist). Blocked patterns override both whitelists.

#### 1. Dangerous Shell Commands

```
❌ sudo <cmd>, rm -rf, chmod 755, chown user:, rmdir -
```

**Note**: Bare words like `delete` or `exec` are NOT blocked — only dangerous compound patterns.

---

#### 2. Network/Shell Execution

```
❌ ssh -<args>, telnet <port>, netcat, nc -<args>
❌ shell(), bash(), cmd(), powershell()
❌ ; rm, ; sudo, ; chmod (semicolon chaining)
❌ | bash, | sh, | exec (pipe to shell)
```

---

#### 3. SQL Injection (Full Statement Patterns)

```
❌ INSERT INTO, UPDATE <table> SET, DELETE FROM
❌ DROP TABLE/DATABASE, ALTER TABLE, GRANT <priv> TO, TRUNCATE TABLE
```

**Note**: Bare words `update`, `delete`, `create` are NOT blocked — only full SQL statement syntax.

---

#### 4. Injection & Traversal

```
❌ ../ (path traversal)
❌ $() (command substitution)
❌ ${VAR} (env var expansion)
❌ $ENV_VAR (env var reference, 2+ uppercase chars)
❌ <script>, javascript:, data: (XSS injection)
```

---

#### 5. Security Bypass & Metadata

```
❌ bypass/disable/skip auth/authentication/security
❌ 169.254.169.254 (cloud metadata)
❌ metadata.google/azure/aws.*
❌ /latest/meta-data (AWS metadata path)
❌ /wp-admin, /phpmyadmin, /administrator
❌ /.env, /.git, /.ssh, /.aws (hidden config files)
```

---

### ⛔ Blocked URLs

**SSRF Prevention** - These URL patterns are blocked:

| Pattern | Reason | Example |
|---------|--------|---------|
| `localhost`, `127.0.0.1`, `0.0.0.0` | Local services | `http://localhost:8080` |
| `192.168.*` | Private network (Class C) | `http://192.168.1.1` |
| `10.*` | Private network (Class A) | `http://10.0.0.1` |
| `172.16-31.*` | Private network (Class B) | `http://172.16.0.1` |
| `169.254.169.254` | Cloud metadata (AWS) | `http://169.254.169.254/latest/meta-data` |
| `metadata.google/azure/aws.*` | Cloud metadata (GCP/Azure/AWS) | `http://metadata.google.internal` |
| `/wp-admin`, `/phpmyadmin`, `/administrator` | Admin panels | `https://site.com/wp-admin/` |
| `/.env`, `/.git`, `/.ssh`, `/.aws` | Hidden config files | `https://site.com/.env` |
| `/debug`, `/_debug`, `/__debug` | Debug endpoints | `https://site.com/debug/` |

**Exception**: First-party services (browser-automation-service, notification-service, weather-service, eia-service, eodhd-service) can use localhost URLs because they're trusted internal Docker services.

**Enforced at TWO boundaries**:
- **`services(action: 'call')`**: `service-call-policy.js` scans arguments for blocked URLs
- **`registry(action: "register")` / `registry(action: "update")`**: `BLOCKED_DOMAINS` list prevents storing SSRF targets in DB

---

### ⛔ Size & Depth Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| **Max Parameter Size** | 100 KB | Prevents memory exhaustion |
| **Max Response Size** | 1 MB | Prevents response flooding |
| **Max Call Depth** | 3 | Prevents infinite service chains |
| **Max Workflow Steps** | 20 | Prevents resource abuse |
| **Max Parallel Steps** | 5 | Prevents concurrent overload |

**Call Depth Example**:
```
Service A → Service B → Service C → Service D (❌ BLOCKED: depth 4)
```

---

## Section C: Multi-Layer Security Model

**4 Layers of Protection** - Every request passes through:

### Layer 1: Tool-Level Security

**First check**: Is the tool public or authenticated?

```javascript
// All tools require authentication (Phase 3: Jan 31, 2026)
// PUBLIC_TOOLS is empty - no unauthenticated access

// AUTHENTICATED tools (requires OAuth, API Key, or JWT)
services(action: "discover")
services(action: "health")
registry(action: "register")
services(action: "call")
perform()
```

**Enforcement**: `tool-security.js` - Checks if user is authenticated

---

### Layer 2: Service Resolution + Compliance Policy Check

**Second check**: Does the target service exist? Then, are the tool name and parameters safe?

**Ordering** (critical — service resolution runs FIRST):
1. Resolve target service from DB (single query, `OR [{ id }, { name }]`)
2. If service not found → `"Target service 'X' not found"` (not a compliance error)
3. If service exists → Run compliance policy against tool name + arguments

**What the compliance policy checks** (17 patterns):
- ✅ Tool is in static APPROVED_TOOLS whitelist OR registered with the target service (dynamic whitelist)
- ✅ Tool name and arguments don't match blocked patterns (SQL injection, shell commands, etc.)
- ✅ URLs in arguments aren't localhost/private networks/cloud metadata
- ✅ No path traversal (`../`)
- ✅ Parameter size under 100KB

**Blocked** → Error: "Service call blocked by compliance policy: [specific violation]"

---

### Layer 3: Role-Based Authorization

**Third check**: Does the user have permission?

**Examples**:

```javascript
// Admin-only operations
perform({ action: "pov.update" })  // ❌ Requires ADMIN role (pov.create is table-governed: ADMIN+USER allowed, DEMO blocked)

// Service ownership check
registry(action: "update", { service_name: "someone-else-service" })  // ❌ Not your service

// POV access check
project(action: "task.list", povId: "not-your-pov")  // ❌ No access to that POV
```

**Roles**:
- **DEMO_USER**: Full Hub access (register services, call services)
- **ADMIN**: Full Hub + POV management + service approval
- **SUPER_ADMIN**: Complete platform access

---

### Layer 4: Trust-Level Token Gating

**Fourth check**: Should this service receive a JWT token?

**Trust Hierarchy** (6 levels):

| Level | Description | Token Passed? | Use Case |
|-------|-------------|--------------|----------|
| **INTERNAL** | pAIchart-* services | ✅ Yes | POV/Task operations |
| **TRUSTED** | Localhost Docker services | ✅ Yes | browser-automation, notification |
| **OWNER** | You call your own service | ✅ Yes | Your registered services |
| **TEAM_MEMBER** | Caller in team of POV owned by service owner | ✅ Yes | Team collaboration |
| **SCOPED** | Public service + POV context | ❌ No | Public workflows with POV |
| **ANONYMOUS** | Public service, no POV | ❌ No | Public discovery |

**Example**:
```
User calls Service A (OWNER trust)
  → Service A receives JWT token ✅
  → Service A calls Service B (SCOPED trust)
    → Service B receives NO token (only povId) ❌
```

**Security reasoning**: Trust degrades through service chains to prevent token leakage.

---

## Section D: Rate Limiting

### Default Limits (Per User)

| Endpoint | Public | Authenticated | Service Call |
|----------|--------|--------------|--------------|
| **Discovery** | 100/min | 1000/min | N/A |
| **Service Calls** | N/A | 1000/min | 10/min (per service) |
| **JWKS Endpoint** | 100/min (per IP) | 100/min (per IP) | N/A |

### Custom Service Rate Limits

**Service owners can configure their own limits**:

```javascript
registry(action: "update", {
  service_name: "my-api",
  updates: {
    rateLimit: {
      requests: 50,     // Max 50 requests
      windowMs: 60000   // Per minute (60000ms)
    },
    maxExecutionTime: 30000  // 30 seconds timeout
  }
})
// Note: rateLimit and maxExecutionTime are flat in updates (not nested inside permissions)
```

**How it works**:
1. Hub enforces rate limit **before** calling your service
2. Requests beyond limit → Error: "Rate limit exceeded"
3. Protects your service from abuse without code changes

**Benefits**:
- ✅ No rate limiting code in your service
- ✅ Hub blocks excessive calls automatically
- ✅ Configurable per service

---

## Section E: Admin vs User Tools

### Admin-Only Tools (Require ADMIN or SUPER_ADMIN Role)

**Operations restricted to administrators**:

| Tool | Purpose | Why Admin-Only |
|------|---------|----------------|
| `pov.update` | Mutate existing POV | Business-critical resource (pov.create: ADMIN+USER via RolePermission table since 2026-05-25) |
| Service approval | Approve high-risk services | Security review |
| Team management | Add/remove team members | Access control |

**How to request admin access**: Contact sales@paichart.com

---

### Private Prompt Visibility (isPublic flag)

**Security rule**: Prompt visibility is controlled by an explicit `isPublic` flag set when a prompt is created or seeded — there is no automatic tagging. `isPublic: false` prompts are hidden from non-admin users at BOTH the list and fetch paths.

**Example**:
```javascript
// Prompt registered with explicit visibility
{
  name: "create_pov_wizard",
  isPublic: false  // set explicitly at creation/seed time
}

// Result: non-admins never see or run it (registry cache-hit guard + list filter)
```

**Why**: Prevents exposure of internal/admin workflows to regular users.

---

## Section F: Credential Protection

### When Credentials Are Exposed

**CRITICAL**: Service credentials are **NEVER** exposed to users. Endpoint URLs are **sanitized** before exposure.

**Who sees what**:

| Viewer | Service Endpoint | Service Credentials |
|--------|------------------|---------------------|
| **Public users** | ❌ Hidden | ❌ Hidden |
| **Authenticated users** | ✅ Sanitized | ❌ Hidden |
| **Service owner** | ✅ Sanitized | ❌ Hidden (not stored) |
| **Hub internal code** | ✅ Raw (to call service) | ✅ Yes (if needed for auth) |

### Endpoint URL Sanitization (`sanitizeEndpointUrl`)

Services may register endpoint URLs containing API keys in query parameters (e.g., `https://api.example.com/mcp?apikey=SECRET`). The `sanitizeEndpointUrl()` utility strips sensitive query parameters before any user-facing output.

**Canonical location**: `lib/mcp/server/tools/hub/hub-shared-middleware.js`

**Sensitive parameters masked**: `apikey`, `api_key`, `key`, `token`, `secret`, `password`, `auth`, `access_token`

**Applied at all user-facing extraction sites** (8 sites, 6 files):
- `hub-resources.js` — MCP resource URIs (4 sites: all services, active, by-category, service detail)
- `service-tools-handler.js` — `registry(action: "tools")` response
- `service-health-handler.js` — `services(action: 'health')` response
- `service-call-handler.js` — `services(action: 'call')` metadata
- `service-registration-handler.js` — `registry(action: "register")` response
- `app/api/mcp/services/route.ts` — HTTP API (inline TypeScript copy)

**NOT sanitized** (internal routing needs raw URLs): `hub-utilities.js` health checks, `InternalServiceRouter`, connection pool internals.

**Regression detection**:
```bash
grep -rn "configuration\?\.endpoint" lib/mcp/server/ --include="*.js" | grep -v sanitize | grep -v "\/\/"
```

**Why service-call-handler accesses credentials**:
- **Purpose**: To authenticate with external services on your behalf
- **Security**: Credentials never returned in responses
- **Audit**: All credential access logged

**Example**:
```javascript
// User calls external service
services(action: "call", {
  targetService: "external-api",
  tool: "get_data"
})

// Hub internal flow:
1. Fetch service record (includes endpoint + credentials)
2. Call external service with credentials (auth header)
3. Return ONLY the response (credentials filtered out)
```

---

### Field Filtering by Auth Status

**Public Discovery** (8+ fields hidden):
```javascript
// Public user sees:
{
  id: "cm123...",
  name: "weather-service",
  description: "Weather data API",
  status: "ACTIVE",
  capabilities: { tools: ["get_forecast"] }
  // HIDDEN: endpoint, ownerId, credentials, API keys
}
```

**Authenticated Discovery** (owner fields visible):
```javascript
// Authenticated user sees:
{
  // ... all public fields, plus:
  ownerId: "user456",
  configuration: { category: "data-services" },
  permissions: { publicAccess: true }
  // STILL HIDDEN: endpoint (unless you're the owner), credentials
}
```

**Service Owner** (everything):
```javascript
// Service owner sees:
{
  // ... all fields, including:
  endpoint: "https://api.myservice.com/mcp",
  healthCheckPath: "/health"
  // STILL HIDDEN: credentials (not stored, set during registration)
}
```

---

## Section G: Troubleshooting Blocked Calls

### Error: "Service call blocked by compliance policy"

**Cause**: Tool name or parameters contain blocked patterns.

**Solution**:

1. **Check tool name** - Avoid: shell, exec, delete, rm, drop, etc.
   ```javascript
   // ❌ BLOCKED
   { tool: "exec_command" }

   // ✅ ALLOWED
   { tool: "run_task" }
   ```

2. **Check parameters** - Avoid injection characters: ; & | ` $ ( )
   ```javascript
   // ❌ BLOCKED
   { arguments: { cmd: "ls; rm -rf /" } }

   // ✅ ALLOWED
   { arguments: { action: "list_files" } }
   ```

3. **Check URLs** - Avoid localhost, private IPs, cloud metadata
   ```javascript
   // ❌ BLOCKED
   { arguments: { url: "http://localhost:8080/api" } }

   // ✅ ALLOWED
   { arguments: { url: "https://api.external.com/data" } }
   ```

4. **If false positive** - Contact <maintainer-email> for whitelist approval

---

### Error: "Unauthorized service access"

**Cause**: You don't have permission to call the service.

**Solution**:

1. **Check if service is public**:
   ```javascript
   services(action: "health", service_name: "the-service")
   // Check: permissions.publicAccess = true?
   ```

2. **If private** - Contact service owner for access or ask them to update:
   ```javascript
   registry(action: "update", {
     service_name: "the-service",
     updates: { permissions: { publicAccess: true } }
   })
   ```

3. **If you're the owner** - You should have access automatically. Check authentication.

---

### Error: "Rate limit exceeded"

**Cause**: Too many requests in the time window.

**Solution**:

1. **Wait for window to reset** (default: 1 minute)

2. **If you own the service** - Increase the limit:
   ```javascript
   registry(action: "update", {
     service_name: "my-service",
     updates: {
       rateLimit: { requests: 200, windowMs: 60000 }  // 200/min
     }
   })
   ```

3. **If calling someone else's service** - Ask owner to increase limit

---

### Error: "Insufficient trust level"

**Cause**: Service requires a token, but your trust level doesn't grant one.

**Debug workflow**:

```javascript
// 1. Check trust level requirement
registry(action: "tools", { service_name: "external-service" })
// Note: If service validates tokens, it needs OWNER or TEAM_MEMBER trust

// 2. Understand your trust level:
// - Calling YOUR service → OWNER (receives token) ✅
// - Service you in team of POV OWNED BY service owner → TEAM_MEMBER (receives token) ✅
// - Public service → SCOPED or ANONYMOUS (no token) ❌

// 3. Solutions:
// - Register your own service → OWNER trust
// - Join a POV team owned by the service owner → TEAM_MEMBER trust
// - Ask service owner to make it work without tokens → Update service
```

**Trust level rules**:
- You can't "upgrade" your trust level manually
- Trust is determined by ownership and team membership
- See [G] **trust_levels** prompt for deep dive

---

## 🚀 Best Practices

### For Service Developers

1. **Use descriptive tool names** - `get_weather` not `exec_fetch`
2. **Validate tokens via JWKS** - `GET https://paichart.app/api/auth/jwks`
3. **Set appropriate rate limits** - Start conservative (50/min), adjust as needed
4. **Use custom health paths** - If your health endpoint isn't `/health`
5. **Make services public cautiously** - Start private, make public when ready

---

### For Service Consumers

1. **Check health before calling** - `services(action: 'health')` shows reliability
2. **Handle rate limits gracefully** - Implement exponential backoff
3. **Use workflows for multi-step operations** - Better than manual chaining
4. **Respect service ownership** - Ask before making private services public

---

### For Operators

1. **Monitor health regularly** - `services(action: "health", includeDiagnostics: true)`
2. **Review audit logs** - Check Activity table for security events
3. **Approve high-risk services carefully** - Security categories require review
4. **Update rate limits proactively** - Before users hit limits

---

## 📚 Related Documentation

**Deep Dive Prompts**:
- [G] **trust_levels** - 6-tier trust system explained
- [E] **external_service_auth** - JWKS validation, Component 5
- [H] **architecture** - How security layers work internally

**Quick Start**:
- [A] **get_started** - Role-based tutorials for developers/operators/consumers
- [D] **register_guide** - Step-by-step service registration

**Workflows**:
- [I] **workflow_guide** - Multi-service orchestration

---

## 💬 Support

**Security Questions**: <maintainer-email>
**Report Vulnerabilities**: security@paichart.app
**Documentation**: https://paichart.app/docs

---

## 📖 Quick Reference

### Allowed Operations
✅ Service discovery (public)
✅ Service registration (authenticated)
✅ Cross-service calls (authenticated + access control)
✅ Workflow orchestration (authenticated)

### Blocked Patterns (17 total)
❌ Dangerous shell (sudo <cmd>, rm -rf, chmod, chown)
❌ Shell execution (shell(), bash(), cmd(), powershell())
❌ SQL statements (INSERT INTO, UPDATE...SET, DELETE FROM, DROP TABLE)
❌ Injection (../,  $(), ${}, <script>, javascript:)
❌ Security bypass (bypass/disable/skip auth)
❌ Localhost/private network/cloud metadata URLs

### Rate Limits
- Discovery: 100/min (public), 1000/min (authenticated)
- Service calls: 1000/min (authenticated), 10/min (per service)
- Custom limits: Configurable via `registry(action: "update")`

### Security Layers
1. Tool-level (PUBLIC vs AUTHENTICATED)
2. Service resolution + Compliance policy (existence check THEN blocked patterns/SSRF)
3. Role-based authorization (ADMIN vs DEMO_USER)
4. Trust-level token gating (6 levels)

### Update-Time Security (Feb 2026)
- healthCheckPath: Rejects `..` traversal (Zod schema + handler)
- endpoint: Checked against BLOCKED_DOMAINS on update (not just registration)

### Trust Levels
- **INTERNAL** - pAIchart services (token: yes)
- **TRUSTED** - Localhost Docker (token: yes)
- **OWNER** - Your own service (token: yes)
- **TEAM_MEMBER** - Caller in POV team (POV owned by service owner) (token: yes)
- **SCOPED** - Public + POV context (token: no)
- **ANONYMOUS** - Public, no POV (token: no)

---

**Version**: 1.2 | **Updated**: 2026-02-26 | **Status**: Production-Ready
**Security Score**: 95/100 | **Compliance**: Anthropic AUP, RFC 8707, RFC 9068

**Changelog**:
- v1.2 (Feb 26, 2026): Added `sanitizeEndpointUrl()` documentation in Section F. Corrected endpoint visibility table (authenticated users see sanitized URLs, not hidden). Added regression detection grep.
- v1.1 (Feb 24, 2026): Fixed rateLimit/maxExecutionTime param structure (flat, not inside permissions). Updated blocked patterns to match actual 17-pattern policy (SQL patterns are statement-level, not bare words). Added update-time SSRF blocklist and healthCheckPath traversal rejection. Corrected blocked URLs list. Documented service-resolution-before-compliance ordering.
