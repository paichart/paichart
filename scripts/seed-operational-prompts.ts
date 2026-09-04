/**
 * Seed script: Operational prompts for agent_prompt_library
 *
 * This script is the canonical source for the "operational" tier of the
 * prompt library — prompts that users invoke via /prompt in Claude Desktop /
 * ChatGPT, plus auto-execute analytics prompts. It complements two other
 * canonical seeds:
 *
 *   - scripts/seed-protocol-prompts.ts  — orchestration protocols + one
 *     harness GUI guide (HOWTO-use-pipeline-harness)
 *   - scripts/seed-agent-templates.ts   — agent template backstories
 *
 * Pattern ref: .claude/knowledge/patterns/prompt-library-gold-standard-pattern.md
 * Rationalisation context: cline_docs/reviews/prompt-library-rationalisation-2026-04-24/
 *
 * Naming convention (locked 2026-04-24):
 *   HOWTO-<topic>  — instructional "tell me how to" prompts
 *   DEMO-<topic>   — "show me" walkthroughs / showcases
 *   ABOUT-<topic>  — "tell me about" reference / explanation prompts
 *   <snake_case>   — execution prompts (auto-run analytics, no user menu)
 *
 * All educational prompts use category DOCUMENTATION.
 * Analytics prompts use category ANALYSIS.
 *
 * Run locally:  npx ts-node --project prisma/tsconfig.seed.json scripts/seed-operational-prompts.ts
 * Run on prod:  NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-operational-prompts.ts
 */

import { PrismaClient } from '@prisma/client';
import { AgentCategory, AgentComplexity, AgentTemplateStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface OperationalPromptEntry {
  name: string;
  description: string;
  category: AgentCategory;
  useCase: string;
  complexity: AgentComplexity;
  estimatedTime: number | null;
  status: AgentTemplateStatus;
  isPublic: boolean;
  tags: string[];
  version: string;
  variables: any;
  examples: any;
  promptText: string;
}

const operationalPrompts: OperationalPromptEntry[] = [
  {
    name: 'ABOUT-security-policy',
    description: "User-friendly guide to Hub security, compliance, and safeguards",
    category: AgentCategory.DOCUMENTATION,
    useCase: "Understand what's allowed, what's blocked, and how to troubleshoot security issues",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:general'],
    version: "1.0.0",
    variables: {} as any,
    examples: {} as any,
    promptText: `# MCP Hub Security Policy

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
✅ **Per-service token isolation** (May 2026 — tokens only work at their intended service)
✅ **Trust-based access** (6-tier hierarchy)
✅ **Content filtering** (17 blocked patterns + SSRF blocklist)
✅ **Rate limiting** (prevent abuse — including per-user token mint limits)
✅ **Audit logging** (90-day retention with forensic trace IDs)

**Purpose**: Enable innovation while ensuring safe and responsible use

### ✨ What's new (May 2026): Cross-service token isolation

Each token the Hub issues is now **scoped to a single service**. When the Hub sends a token to your service, that token only works at YOUR service — not at any other service on the platform.

**For you, this means**:
- 🛡️ **Smaller risk surface**: If a token leaks, the damage is limited to one service
- 🔍 **Forensic clarity**: Each token carries a unique trace ID (\`jti\`) and originating client name (\`azp\`) so we can answer "which client sent which token to which service" precisely
- 🤝 **No action needed for most users**: just keep using the platform as you normally would

External service developers: see \`/prompt HOWTO-validate-jwt-tokens\` for the updated validator pattern.

---

## Section A: Allowed Operations (What You CAN Do)

### ✅ Service Discovery

**Always allowed** (no authentication required):

\`\`\`javascript
// Find services by capability
services(action: "discover", capability: "monitoring")

// Check service health
services(action: "health", service_name: "notification-service")

// View service tools and parameters
registry(action: "tools", { service_name: "browser-automation-service" })
\`\`\`

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

\`\`\`javascript
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
\`\`\`

**Security boundaries**:
- ✅ Can register external HTTPS services
- ✅ Can use custom health check paths (no \`..\` traversal)
- ✅ Can configure rate limits and timeouts
- ❌ Cannot use localhost URLs (SSRF prevention — enforced at both registration AND update)
- ❌ Cannot use private network IPs (10.*, 192.168.*, 172.16-31.*)
- ❌ Cannot use cloud metadata endpoints (169.254.169.254, metadata.google/azure/aws)
- ❌ Cannot register services with blocked tool names (see Section B)

---

### ✅ Cross-Service Communication

**Call tools on any service you have access to**:

\`\`\`javascript
services(action: "call", {
  targetService: "notification-service",
  tool: "send",
  arguments: {
    channel: "email",
    message: { subject: "Task Complete", body: "..." }
  }
})
\`\`\`

**Access control**:
- **Public services** (\`publicAccess: true\`) → Any authenticated user
- **Private services** (\`publicAccess: false\`) → Owner + Hub admins only

**Token passing** (automatic, trust-based):
- ✅ **OWNER**: You call your own service → Receives your JWT token
- ✅ **TEAM_MEMBER**: You are in a POV team owned by the service owner → Receives token
- ❌ **SCOPED**: Public service with POV context → No token (only povId)
- ❌ **ANONYMOUS**: Public service, no POV → No token

**Why token-gating**: External services can validate tokens via JWKS endpoint, but we only pass tokens to trusted services to prevent abuse.

---

### ✅ Workflow Orchestration

**Create multi-service workflows**:

\`\`\`javascript
services(action: "workflow.execute", {
  steps: [
    { service: "paichart-project-service", tool: "project", arguments: { action: "pov.list" } },
    { service: "notification-service", tool: "send", arguments: {...}, dependsOn: [0] }
  ],
  executionMode: "sequential"  // or "parallel", "conditional"
})
\`\`\`

**Security limits**:
- ✅ Max 20 steps per workflow
- ✅ Max 5 parallel steps (concurrent execution)
- ✅ Max call depth: 3 (service chains limited)
- ✅ Variable chaining: \`{{step.N.output.field}}\` (no code execution)

**Why limits**: Prevent resource exhaustion and infinite loops.

---

## Section B: Blocked Patterns (What's NOT Allowed)

### ⛔ Blocked Patterns in \`services(action: 'call')\`

**The compliance policy scans tool names AND \`JSON.stringify(arguments)\` for 17 patterns.**

Tools pass if they appear in the static APPROVED_TOOLS whitelist OR are registered with the target service (dynamic whitelist). Blocked patterns override both whitelists.

#### 1. Dangerous Shell Commands

\`\`\`
❌ sudo <cmd>, rm -rf, chmod 755, chown user:, rmdir -
\`\`\`

**Note**: Bare words like \`delete\` or \`exec\` are NOT blocked — only dangerous compound patterns.

---

#### 2. Network/Shell Execution

\`\`\`
❌ ssh -<args>, telnet <port>, netcat, nc -<args>
❌ shell(), bash(), cmd(), powershell()
❌ ; rm, ; sudo, ; chmod (semicolon chaining)
❌ | bash, | sh, | exec (pipe to shell)
\`\`\`

---

#### 3. SQL Injection (Full Statement Patterns)

\`\`\`
❌ INSERT INTO, UPDATE <table> SET, DELETE FROM
❌ DROP TABLE/DATABASE, ALTER TABLE, GRANT <priv> TO, TRUNCATE TABLE
\`\`\`

**Note**: Bare words \`update\`, \`delete\`, \`create\` are NOT blocked — only full SQL statement syntax.

---

#### 4. Injection & Traversal

\`\`\`
❌ ../ (path traversal)
❌ $() (command substitution)
❌ \${VAR} (env var expansion)
❌ $ENV_VAR (env var reference, 2+ uppercase chars)
❌ <script>, javascript:, data: (XSS injection)
\`\`\`

---

#### 5. Security Bypass & Metadata

\`\`\`
❌ bypass/disable/skip auth/authentication/security
❌ 169.254.169.254 (cloud metadata)
❌ metadata.google/azure/aws.*
❌ /latest/meta-data (AWS metadata path)
❌ /wp-admin, /phpmyadmin, /administrator
❌ /.env, /.git, /.ssh, /.aws (hidden config files)
\`\`\`

---

### ⛔ Blocked URLs

**SSRF Prevention** - These URL patterns are blocked:

| Pattern | Reason | Example |
|---------|--------|---------|
| \`localhost\`, \`127.0.0.1\`, \`0.0.0.0\` | Local services | \`http://localhost:8080\` |
| \`192.168.*\` | Private network (Class C) | \`http://192.168.1.1\` |
| \`10.*\` | Private network (Class A) | \`http://10.0.0.1\` |
| \`172.16-31.*\` | Private network (Class B) | \`http://172.16.0.1\` |
| \`169.254.169.254\` | Cloud metadata (AWS) | \`http://169.254.169.254/latest/meta-data\` |
| \`metadata.google/azure/aws.*\` | Cloud metadata (GCP/Azure/AWS) | \`http://metadata.google.internal\` |
| \`/wp-admin\`, \`/phpmyadmin\`, \`/administrator\` | Admin panels | \`https://site.com/wp-admin/\` |
| \`/.env\`, \`/.git\`, \`/.ssh\`, \`/.aws\` | Hidden config files | \`https://site.com/.env\` |
| \`/debug\`, \`/_debug\`, \`/__debug\` | Debug endpoints | \`https://site.com/debug/\` |

**Exception**: First-party services (browser-automation-service, notification-service, weather-service, eia-service, eodhd-service) can use localhost URLs because they're trusted internal Docker services.

**Enforced at TWO boundaries**:
- **\`services(action: 'call')\`**: \`service-call-policy.js\` scans arguments for blocked URLs
- **\`registry(action: "register")\` / \`registry(action: "update")\`**: \`BLOCKED_DOMAINS\` list prevents storing SSRF targets in DB

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
\`\`\`
Service A → Service B → Service C → Service D (❌ BLOCKED: depth 4)
\`\`\`

---

## Section C: Multi-Layer Security Model

**4 Layers of Protection** - Every request passes through:

### Layer 1: Tool-Level Security

**First check**: Is the tool public or authenticated?

\`\`\`javascript
// All tools require authentication (Phase 3: Jan 31, 2026)
// PUBLIC_TOOLS is empty - no unauthenticated access

// AUTHENTICATED tools (requires OAuth, API Key, or JWT)
services(action: "discover")
services(action: "health")
registry(action: "register")
services(action: "call")
perform()
\`\`\`

**Enforcement**: \`tool-security.js\` - Checks if user is authenticated

---

### Layer 2: Service Resolution + Compliance Policy Check

**Second check**: Does the target service exist? Then, are the tool name and parameters safe?

**Ordering** (critical — service resolution runs FIRST):
1. Resolve target service from DB (single query, \`OR [{ id }, { name }]\`)
2. If service not found → \`"Target service 'X' not found"\` (not a compliance error)
3. If service exists → Run compliance policy against tool name + arguments

**What the compliance policy checks** (17 patterns):
- ✅ Tool is in static APPROVED_TOOLS whitelist OR registered with the target service (dynamic whitelist)
- ✅ Tool name and arguments don't match blocked patterns (SQL injection, shell commands, etc.)
- ✅ URLs in arguments aren't localhost/private networks/cloud metadata
- ✅ No path traversal (\`../\`)
- ✅ Parameter size under 100KB

**Blocked** → Error: "Service call blocked by compliance policy: [specific violation]"

---

### Layer 3: Role-Based Authorization

**Third check**: Does the user have permission?

**Examples**:

\`\`\`javascript
// Admin-only operations
perform({ action: "pov.update" })  // ❌ Requires ADMIN role (pov.create is table-governed: ADMIN+USER allowed, DEMO blocked)

// Service ownership check
registry(action: "update", { service_name: "someone-else-service" })  // ❌ Not your service

// POV access check
project(action: "task.list", povId: "not-your-pov")  // ❌ No access to that POV
\`\`\`

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
\`\`\`
User calls Service A (OWNER trust)
  → Service A receives JWT token ✅
  → Service A calls Service B (SCOPED trust)
    → Service B receives NO token (only povId) ❌
\`\`\`

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

\`\`\`javascript
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
\`\`\`

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
| \`pov.update\` | Mutate existing POV | Business-critical resource (pov.create: ADMIN+USER via RolePermission table) |
| Service approval | Approve high-risk services | Security review |
| Team management | Add/remove team members | Access control |

**How to request admin access**: Contact sales@paichart.com

---

### Private Prompt Visibility (isPublic flag)

**Security rule**: Prompt visibility is controlled by an explicit \`isPublic\` flag set when a prompt is created or seeded — there is no automatic tagging. \`isPublic: false\` prompts are hidden from non-admin users at BOTH the list and fetch paths.

**Example**:
\`\`\`javascript
// Prompt registered with explicit visibility
{
  name: "create_pov_wizard",
  isPublic: false  // set explicitly at creation/seed time
}

// Result: non-admins never see or run it (registry cache-hit guard + list filter)
\`\`\`

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

### Endpoint URL Sanitization (\`sanitizeEndpointUrl\`)

Services may register endpoint URLs containing API keys in query parameters (e.g., \`https://api.example.com/mcp?apikey=SECRET\`). The \`sanitizeEndpointUrl()\` utility strips sensitive query parameters before any user-facing output.

**Canonical location**: \`lib/mcp/server/tools/hub/hub-shared-middleware.js\`

**Sensitive parameters masked**: \`apikey\`, \`api_key\`, \`key\`, \`token\`, \`secret\`, \`password\`, \`auth\`, \`access_token\`

**Applied at all user-facing extraction sites** (8 sites, 6 files):
- \`hub-resources.js\` — MCP resource URIs (4 sites: all services, active, by-category, service detail)
- \`service-tools-handler.js\` — \`registry(action: "tools")\` response
- \`service-health-handler.js\` — \`services(action: 'health')\` response
- \`service-call-handler.js\` — \`services(action: 'call')\` metadata
- \`service-registration-handler.js\` — \`registry(action: "register")\` response
- \`app/api/mcp/services/route.ts\` — HTTP API (inline TypeScript copy)

**NOT sanitized** (internal routing needs raw URLs): \`hub-utilities.js\` health checks, \`InternalServiceRouter\`, connection pool internals.

**Regression detection**:
\`\`\`bash
grep -rn "configuration\\?\\.endpoint" lib/mcp/server/ --include="*.js" | grep -v sanitize | grep -v "\\/\\/"
\`\`\`

**Why service-call-handler accesses credentials**:
- **Purpose**: To authenticate with external services on your behalf
- **Security**: Credentials never returned in responses
- **Audit**: All credential access logged

**Example**:
\`\`\`javascript
// User calls external service
services(action: "call", {
  targetService: "external-api",
  tool: "get_data"
})

// Hub internal flow:
1. Fetch service record (includes endpoint + credentials)
2. Call external service with credentials (auth header)
3. Return ONLY the response (credentials filtered out)
\`\`\`

---

### Field Filtering by Auth Status

**Public Discovery** (8+ fields hidden):
\`\`\`javascript
// Public user sees:
{
  id: "cm123...",
  name: "weather-service",
  description: "Weather data API",
  status: "ACTIVE",
  capabilities: { tools: ["get_forecast"] }
  // HIDDEN: endpoint, ownerId, credentials, API keys
}
\`\`\`

**Authenticated Discovery** (owner fields visible):
\`\`\`javascript
// Authenticated user sees:
{
  // ... all public fields, plus:
  ownerId: "user456",
  configuration: { category: "data-services" },
  permissions: { publicAccess: true }
  // STILL HIDDEN: endpoint (unless you're the owner), credentials
}
\`\`\`

**Service Owner** (everything):
\`\`\`javascript
// Service owner sees:
{
  // ... all fields, including:
  endpoint: "https://api.myservice.com/mcp",
  healthCheckPath: "/health"
  // STILL HIDDEN: credentials (not stored, set during registration)
}
\`\`\`

---

## Section G: Troubleshooting Blocked Calls

### Error: "Service call blocked by compliance policy"

**Cause**: Tool name or parameters contain blocked patterns.

**Solution**:

1. **Check tool name** - Avoid: shell, exec, delete, rm, drop, etc.
   \`\`\`javascript
   // ❌ BLOCKED
   { tool: "exec_command" }

   // ✅ ALLOWED
   { tool: "run_task" }
   \`\`\`

2. **Check parameters** - Avoid injection characters: ; & | \` $ ( )
   \`\`\`javascript
   // ❌ BLOCKED
   { arguments: { cmd: "ls; rm -rf /" } }

   // ✅ ALLOWED
   { arguments: { action: "list_files" } }
   \`\`\`

3. **Check URLs** - Avoid localhost, private IPs, cloud metadata
   \`\`\`javascript
   // ❌ BLOCKED
   { arguments: { url: "http://localhost:8080/api" } }

   // ✅ ALLOWED
   { arguments: { url: "https://api.external.com/data" } }
   \`\`\`

4. **If false positive** - Contact steve.terry@paichart.com for whitelist approval

---

### Error: "Unauthorized service access"

**Cause**: You don't have permission to call the service.

**Solution**:

1. **Check if service is public**:
   \`\`\`javascript
   services(action: "health", service_name: "the-service")
   // Check: permissions.publicAccess = true?
   \`\`\`

2. **If private** - Contact service owner for access or ask them to update:
   \`\`\`javascript
   registry(action: "update", {
     service_name: "the-service",
     updates: { permissions: { publicAccess: true } }
   })
   \`\`\`

3. **If you're the owner** - You should have access automatically. Check authentication.

---

### Error: "Rate limit exceeded"

**Cause**: Too many requests in the time window.

**Solution**:

1. **Wait for window to reset** (default: 1 minute)

2. **If you own the service** - Increase the limit:
   \`\`\`javascript
   registry(action: "update", {
     service_name: "my-service",
     updates: {
       rateLimit: { requests: 200, windowMs: 60000 }  // 200/min
     }
   })
   \`\`\`

3. **If calling someone else's service** - Ask owner to increase limit

---

### Error: "Insufficient trust level"

**Cause**: Service requires a token, but your trust level doesn't grant one.

**Debug workflow**:

\`\`\`javascript
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
\`\`\`

**Trust level rules**:
- You can't "upgrade" your trust level manually
- Trust is determined by ownership and team membership
- See [G] **ABOUT-trust-levels** prompt for deep dive

---

## 🚀 Best Practices

### For Service Developers

1. **Use descriptive tool names** - \`get_weather\` not \`exec_fetch\`
2. **Validate tokens via JWKS** - \`GET https://paichart.app/api/auth/jwks\`
3. **Set appropriate rate limits** - Start conservative (50/min), adjust as needed
4. **Use custom health paths** - If your health endpoint isn't \`/health\`
5. **Make services public cautiously** - Start private, make public when ready

---

### For Service Consumers

1. **Check health before calling** - \`services(action: 'health')\` shows reliability
2. **Handle rate limits gracefully** - Implement exponential backoff
3. **Use workflows for multi-step operations** - Better than manual chaining
4. **Respect service ownership** - Ask before making private services public

---

### For Operators

1. **Monitor health regularly** - \`services(action: "health", includeDiagnostics: true)\`
2. **Review audit logs** - Check Activity table for security events
3. **Approve high-risk services carefully** - Security categories require review
4. **Update rate limits proactively** - Before users hit limits

---

## 📚 Related Documentation

**Deep Dive Prompts**:
- [G] **ABOUT-trust-levels** - 6-tier trust system explained
- [E] **HOWTO-validate-jwt-tokens** - JWKS validation, Component 5
- [H] **architecture** - How security layers work internally

**Quick Start**:
- [A] **HOWTO-get-started** - New-user familiarization (try pAIchart in minutes)
- [D] **HOWTO-register-service** - Step-by-step service registration

**Workflows**:
- [I] **HOWTO-use-workflows** - Multi-service orchestration

---

## 💬 Support

**Security Questions**: steve.terry@paichart.com
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
❌ Injection (../,  $(), \${}, <script>, javascript:)
❌ Security bypass (bypass/disable/skip auth)
❌ Localhost/private network/cloud metadata URLs

### Rate Limits
- Discovery: 100/min (public), 1000/min (authenticated)
- Service calls: 1000/min (authenticated), 10/min (per service)
- Custom limits: Configurable via \`registry(action: "update")\`

### Security Layers
1. Tool-level (PUBLIC vs AUTHENTICATED)
2. Service resolution + Compliance policy (existence check THEN blocked patterns/SSRF)
3. Role-based authorization (ADMIN vs DEMO_USER)
4. Trust-level token gating (6 levels)

### Update-Time Security (Feb 2026)
- healthCheckPath: Rejects \`..\` traversal (Zod schema + handler)
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
- v1.2 (Feb 26, 2026): Added \`sanitizeEndpointUrl()\` documentation in Section F. Corrected endpoint visibility table (authenticated users see sanitized URLs, not hidden). Added regression detection grep.
- v1.1 (Feb 24, 2026): Fixed rateLimit/maxExecutionTime param structure (flat, not inside permissions). Updated blocked patterns to match actual 17-pattern policy (SQL patterns are statement-level, not bare words). Added update-time SSRF blocklist and healthCheckPath traversal rejection. Corrected blocked URLs list. Documented service-resolution-before-compliance ordering.`,
  },
  {
    name: 'ABOUT-trust-levels',
    description: "Complete guide to the 6-tier trust system and token passing",
    category: AgentCategory.DOCUMENTATION,
    useCase: "Understand who gets JWT tokens, why, and how to debug trust issues",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:general'],
    version: "1.0.0",
    variables: {} as any,
    examples: {} as any,
    promptText: `# MCP Hub Trust Levels

> **Complete guide to the 6-tier trust system and token passing**
>
> Understand who gets JWT tokens, why, and how to debug trust issues

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

### ✨ What's new (May 2026): Per-service tokens

Each token now carries an **audience label** specific to the service it was made for. When the Hub sends your service a token, it has \`aud: https://paichart.app/mcp/<your-service>\` — and your service is the **only** one that can use it.

**Why this matters to you**:
- 🛡️ **Smaller blast radius**: If a token leaks somehow, it only works at your service — not at any other service on the Hub
- 🔍 **Easier debugging**: When you see an "unexpected aud" error, the audience tells you exactly which service the token was meant for
- 🤝 **No change needed if your service already trusts pAIchart**: just update your validator's accept-list to include your service's audience URI (see HOWTO-validate-jwt-tokens for the pattern)

**Quick mental model**: A token is like a movie ticket. Pre-May-2026, all pAIchart tickets said "good at any pAIchart cinema." Now each ticket says "good only at Cinema X" — so a stolen Cinema X ticket can't get you into Cinema Y.

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
- \`paichart-project-service\` (project(action: "pov.list"), project(action: "pov.details"), project(action: "task.list"), perform)

**Token access**: ✅ **Full JWT token**

**Why trusted**:
- Same process = no network boundary
- Platform-owned = audited codebase
- Zero HTTP overhead (direct function calls)

**Example**:
\`\`\`javascript
// User calls internal service
services({ action: "workflow.execute",
  steps: [{
    service: "paichart-project-service",
    tool: "project",
    arguments: { action: "pov.list", status: "IN_PROGRESS" }
  }]
})

// Result: Service receives full JWT token (INTERNAL trust)
\`\`\`

**Routing**: \`InternalServiceRouter\` (no HTTP, ~100ms faster)

---

### Level 2: TRUSTED

**Definition**: First-party Docker services running on localhost.

**Services**:
- \`browser-automation-service\` (localhost:3100)
- \`notification-service\` (localhost:3101)

**Token access**: ✅ **Full JWT token**

**Why trusted**:
- First-party services (pAIchart-managed)
- Localhost-only (not internet-accessible)
- Deployed with platform (same infrastructure)

**Example**:
\`\`\`javascript
// User calls browser automation
services({ action: "call",
  targetService: "browser-automation-service",
  tool: "take_screenshot",
  arguments: { url: "https://example.com" }
})

// Result: Service receives JWT token (TRUSTED trust)
\`\`\`

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
\`\`\`javascript
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
\`\`\`

**Use case**: External services validating pAIchart users via JWKS.

**Validation**: Service verifies token via \`GET https://paichart.app/api/auth/jwks\`

---

### Level 4: TEAM_MEMBER

**Definition**: You are a team member of a POV **owned by the service owner**. A POV is a project entity an administrator creates with phase, stage and tasks and has team members you assign.

**Token access**: ✅ **Full JWT token**

**Why trusted**:
- Service owner controls the POV (they own it)
- Service owner controls team membership (they add you)
- Mutual trust: Owner trusts you enough to add you to their team

**Example**:
\`\`\`javascript
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
\`\`\`

**Trust determination**:
\`\`\`
Check: Is CALLER a team member of POV owned by SERVICE OWNER?
  → Query: TeamMember where userId = callerId
           AND team.povs includes povId
           AND pov.ownerId = serviceOwnerId
  → If YES → TEAM_MEMBER trust
  → If NO → Downgrade to SCOPED
\`\`\`

**Security**:
- ✅ Service owner controls access (owns POV + manages team)
- ❌ **FIXED**: Prevents attack where caller creates POV, adds service owner, steals token
- POV ownership verification prevents privilege escalation

---

### Level 5: SCOPED

**Definition**: Public service called with POV context, but owner not in team.

**Token access**: ❌ **No token** (receives \`povId\` and \`tenantId\` only)

**Why untrusted**:
- Public service (anyone can call)
- Service owner not in your POV team (stranger)
- POV context present (tenant isolation needed)

**Example**:
\`\`\`javascript
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
\`\`\`

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
\`\`\`javascript
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
\`\`\`

**Use case**: Public discovery, read-only operations, stateless APIs.

---

## Section B: Debugging Trust Issues

### Common Problem: "Service didn't receive token"

**Step-by-step debugging workflow**:

#### Step 1: Check What Trust Level You Have

\`\`\`javascript
// Test with token-validator service
services({ action: "workflow.execute",
  povId: "your-pov-id",  // Optional
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: {}
  }]
})
\`\`\`

**Response shows**:
\`\`\`json
{
  "trustLevel": "OWNER",  // Your current trust level
  "tokenReceived": true,
  "explanation": "You own this service, so you receive a token",
  "howToImprove": null
}
\`\`\`

---

#### Step 2: Understand Why

**Checklist**:

| Trust Level | Requirement | How to Check |
|-------------|-------------|--------------|
| **INTERNAL** | Service is pAIchart-* | Can't register (platform-only) |
| **TRUSTED** | Service on localhost | \`endpoint: "http://localhost:3100"\` |
| **OWNER** | You registered the service | \`registry(action: "list")\` shows it |
| **TEAM_MEMBER** | Owner in your POV team | Check POV team members |
| **SCOPED** | Public + POV context | Public service, has povId |
| **ANONYMOUS** | Public, no POV | Public service, no povId |

---

#### Step 3: Common Scenarios

**Scenario 1**: "I'm calling my own service but didn't get a token"

**Likely cause**: Service registered by someone else

**Solution**:
\`\`\`javascript
// 1. Check ownership
registry(action: "list")
// Does your service appear? If NO → you don't own it

// 2. If you don't own it, ask owner to transfer ownership (contact admin)
// 3. Or register your own copy of the service
\`\`\`

---

**Scenario 2**: "I'm in the POV team but didn't get a token"

**Likely cause**: POV is not owned by the service owner (you're on a team, but service owner doesn't own that POV)

**Trust determination**:
\`\`\`
Check: Are you in a team of a POV OWNED BY the service owner?
  → NOT: Is service owner in YOUR POV team (prevents attack!)
  → Service owner must OWN the POV for TEAM_MEMBER trust
\`\`\`

**Solution**:
\`\`\`javascript
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
\`\`\`

**Security note**: You cannot grant yourself TEAM_MEMBER trust by creating a POV and adding the service owner. The service owner must own the POV.

---

**Scenario 3**: "Service is public, why no token?"

**Expected behavior**: Public services get **SCOPED** or **ANONYMOUS** trust (no token).

**Why**: Security - public services can't be trusted with user tokens.

**Solutions**:
1. **Make service private** → Only you can call (OWNER trust)
   \`\`\`javascript
   registry(action: "update", {
     service_name: "my-service",
     updates: { permissions: { publicAccess: false } }
   })
   \`\`\`

2. **Join POV team** → Service owner joins your POV team (TEAM_MEMBER trust)

3. **Don't use tokens** → Service works with \`userId\`/\`email\` only (no validation)

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
\`\`\`
POV: "Customer Onboarding" (cm123...)
Team: Alice, Bob
Service: "data-service" (owner: Charlie)

Alice calls data-service in POV context
  → Charlie NOT in team → SCOPED trust (no token)
\`\`\`

**Fix**: Invite Charlie to POV team OR register your own service

---

## Section C: token-validator Service (Test Your Integration)

### What is token-validator?

**Purpose**: Test and verify external service authentication integration.

**Service name**: \`test-auth-service\` or \`token-validator-service\`

**What it does**:
1. Receives service call with \`_context\`
2. Shows your trust level (with jwtCapable boolean and trustDecision reasoning)
3. Validates token via JWKS (if received)
4. Provides step-by-step validation results
5. Shows enhanced visual formatting (box header, RESULTS, SUMMARY)
6. Optionally shows copy-paste code examples (set \`includeCodeExample: true\`)

---

### How to Use

**Visual Testing (Enhanced Format)** ⭐ NEW:
\`\`\`javascript
services({ action: "workflow.execute",
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: { enhancedFormat: true }  // ← Beautiful visual output!
  }]
})
\`\`\`

**Or use our pre-built demo** (easier):
\`\`\`javascript
services({ action: "workflow.execute", workflowName: "trust-level-basic-demo"})
\`\`\`

**See complete visual guide:** \`/prompt DEMO-token-validation\`

**Programmatic Use (Raw JSON):**
\`\`\`javascript
services({ action: "workflow.execute",
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: { enhancedFormat: false }  // ← Parse this in scripts
  }]
})
\`\`\`

**With POV context:**
\`\`\`javascript
services({ action: "workflow.execute",
  povId: "cm123...",  // Your POV ID
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: { enhancedFormat: true }
  }]
})
\`\`\`

**What you'll get**:
- ✅ Your trust level (OWNER, TEAM_MEMBER, SCOPED, or ANONYMOUS)
- ✅ Whether you receive tokens (yes/no + explanation)
- ✅ 11-step JWKS validation process
- ✅ Copy-paste TypeScript code (145 lines)
- ✅ Component 5 verification
- ✅ Performance metrics (avg 34ms)

**Time**: 10 seconds (faster than building ad-hoc workflow!)

**Advanced**: Try the other demos:
- \`trust-level-basic-demo\` - Learn trust basics
- \`jwks-validation-advanced-demo\` - Get TypeScript + JavaScript + Python examples
- \`token-troubleshooting-demo\` - Debug trust level changes with POV context

See [I] **HOWTO-use-workflows** for complete workflow documentation.

---

### Response Breakdown

\`\`\`json
{
  "trustLevel": "OWNER",
  "tokenReceived": true,
  "validation": {
    "step1": "✅ Token extracted from _context",
    "step2": "✅ JWKS fetched (34ms)",
    "step3": "✅ Public key found (kid: paichart-2026-04)",
    "step4": "✅ Signature valid (RS256)",
    "step5": "✅ Issuer valid (https://paichart.app)",
    "step6": "✅ Audience valid (https://paichart.app/mcp/<your-service-slug>, RFC 8707 per-service)",
    "step7": "✅ Token not expired",
    "step8": "✅ Claims extracted"
  },
  "claims": {
    "sub": "user456",
    "email": "alice@company.com",
    "role": "ADMIN",
    "aud": "https://paichart.app/mcp/<your-service-slug>",
    "iss": "https://paichart.app",
    "azp": "claude-desktop"
  },
  "codeExamples": {
    "typescript": "...",
    "javascript": "...",
    "python": "..."
  },
  "howToImprove": null
}
\`\`\`

**If no token received**:
\`\`\`json
{
  "trustLevel": "SCOPED",
  "tokenReceived": false,
  "explanation": "Service owner not in POV team",
  "howToImprove": "Invite service owner to your POV team to receive tokens"
}
\`\`\`

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

\`\`\`
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
\`\`\`

**Implementation**: \`lib/services/workflow/security/trust-level.js\`

---

### Trust Degradation in Service Chains

**Rule**: Service chains inherit the **lowest** trust level.

**Example**:
\`\`\`
User (OWNER trust) → Service A (receives token)
                       ↓
                Service A calls Service B (SCOPED trust)
                       ↓
                Service B receives NO token (degraded to SCOPED)
\`\`\`

**Why**: Prevent token forwarding attacks - Service A can't pass user's token to Service B.

**Security implication**: External services MUST NOT forward user tokens to other services.

---

## Section E: Token Passing Policy

### When Tokens Are Passed

**Current implementation**:

| Tool | Trust Levels Applied? | Token Passing |
|------|----------------------|---------------|
| **\`services(action: 'workflow.execute')\`** | ✅ Yes (deployed) | Trust-based (1-4 get tokens) |
| **\`services(action: 'call')\`** | ⚠️ No (planned) | No tokens currently |

**Why difference**:
- \`services(action: 'workflow.execute')\` = Multi-service chains (higher risk) → Trust levels deployed
- \`services(action: 'call')\` = Direct user call (lower risk) → Trust levels planned

---

### Security Reasoning

**The Threat**: Confused Deputy Attack

\`\`\`
User → Hub → Service A (public, gets token)
                ↓ Service A is malicious
         Service A → Hub → Service B (using user's token)
                              ↑ User never authorized this!
\`\`\`

**Protection**: Trust levels prevent Service A from receiving user's token (unless Service A is OWNER or TEAM_MEMBER).

---

### Token Delegation Rules

**PROHIBITED** (documented in service registration guide):

\`\`\`javascript
// ❌ WRONG: Don't forward user tokens to other services
async function myTool(args) {
  const userToken = args._context.token;

  // Don't do this!
  await callAnotherService({
    headers: { Authorization: \`Bearer \${userToken}\` }
  });
}
\`\`\`

**APPROVED**:

\`\`\`javascript
// ✅ RIGHT: Use service credentials
async function myTool(args) {
  const userToken = args._context.token;

  // 1. Validate user first
  const user = await validateToken(userToken);

  // 2. Use YOUR service's credentials for other calls
  await callAnotherService({
    headers: { Authorization: \`Bearer \${myServiceToken}\` },
    userId: user.userId  // Track who initiated
  });
}
\`\`\`

---

### Audit Logging

**All trust decisions are logged** to Activity table:

\`\`\`json
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
\`\`\`

**Purpose**: Security forensics, abuse detection, compliance.

---

## 🚀 Best Practices

### For External Service Developers

1. **Test with token-validator** - Verify your integration works before deployment
   \`\`\`javascript
   services({ action: "workflow.execute", steps: [{ service: "token-validator-service", tool: "verify_auth" }] })
   \`\`\`

2. **Validate tokens via JWKS** - Don't trust _context without verification
   \`\`\`javascript
   const jwks = await fetch('https://paichart.app/api/auth/jwks').then(r => r.json());
   const verified = await verifyJWT(token, jwks.keys);
   \`\`\`

3. **Handle missing tokens gracefully** - Not all callers get tokens (SCOPED/ANONYMOUS)
   \`\`\`javascript
   if (!args._context.token) {
     // Fallback: Use userId/email for basic operations
     // Or reject if token validation is required
   }
   \`\`\`

4. **Never forward tokens** - Use your service's credentials for downstream calls

5. **Start private, make public later** - Test with OWNER trust first
   \`\`\`javascript
   registry(action: "register", {
     permissions: { publicAccess: false }  // Start private
   })
   \`\`\`

---

### For Service Consumers

1. **Understand trust requirements** - Check if service needs a token
   \`\`\`javascript
   registry(action: "tools", { service_name: "the-service" })
   // Read description: Does it validate tokens?
   \`\`\`

2. **Use POV context when available** - Enables TEAM_MEMBER trust
   \`\`\`javascript
   services({ action: "workflow.execute",
     povId: "cm123...",  // Include POV context
     steps: [...]
   })
   \`\`\`

3. **Register your own services for full control** - OWNER trust guaranteed

4. **Test before deploying workflows** - Use token-validator to verify trust

---

### For Operators

1. **Monitor trust denials** - Check Activity table for patterns
   \`\`\`sql
   SELECT * FROM "Activity"
   WHERE action = 'TRUST_DENIAL'
   ORDER BY "createdAt" DESC LIMIT 50;
   \`\`\`

2. **Explain trust to users** - "You didn't get a token because..."

3. **Recommend OWNER trust** - Encourage users to register their own services

4. **Review team membership** - Ensure POV teams are correct for TEAM_MEMBER trust

---

## 📚 Related Documentation

**Deep Dive Prompts**:
- [E] **HOWTO-validate-jwt-tokens** - JWKS validation, RS256 tokens, Component 5
- [F] **ABOUT-security-policy** - Multi-layer security, blocked patterns
- [H] **architecture** - How trust levels fit into Hub architecture

**Quick Start**:
- [A] **HOWTO-register-service** - Register your MCP service (step-by-step)
- [D] **HOWTO-register-service** - Register your first service (OWNER trust)

**Workflows**:
- [I] **HOWTO-use-workflows** - Multi-service orchestration with trust levels

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

\`\`\`
1. Internal service? → INTERNAL
2. Localhost Docker? → TRUSTED
3. You own service? → OWNER
4. Owner in POV team? → TEAM_MEMBER
5. Public + POV? → SCOPED
6. Public, no POV? → ANONYMOUS
\`\`\`

### Debugging Checklist

✅ Test with token-validator service
✅ Check ownership (\`registry(action: "list")\`)
✅ Check POV team membership (\`project(action: "pov.details")\`)
✅ Verify service is private vs public
✅ Confirm POV context is passed
✅ Review trust denial audit logs

### Token Validation (External Services)

\`\`\`javascript
// 1. Fetch JWKS
const jwks = await fetch('https://paichart.app/api/auth/jwks').then(r => r.json());

// 2. Verify token
// U2 Audience-Tightening (RFC 8707): replace <your-service-slug> with your
// service's normalized name. The 2 legacy generic audiences remain accepted
// during the overlap window — drop them later once the per-service audience
// is your only minted form.
const verified = await verifyJWT(args._context.token, jwks.keys, {
  algorithms: ['RS256'],
  audience: [
    'https://paichart.app/mcp',                       // legacy (overlap)
    'https://paichart.app/api',                       // legacy (overlap)
    'https://paichart.app/mcp/<your-service-slug>'    // per-service (RFC 8707)
  ],
  issuer: 'https://paichart.app'
});

// 3. Use claims
const userId = verified.sub;
const email = verified.email;
\`\`\`

---

**Version**: 1.0 | **Created**: 2026-02-02 | **Status**: Production-Ready
**Validation**: token-validator service (34ms JWKS validation, 100% success)`,
  },
  {
    name: 'DEMO-mcp-platform',
    description: "Purpose: First-time demonstration of MCP orchestration capabilities\nAudience: Executives, Architects, Platform Evaluators",
    category: AgentCategory.DOCUMENTATION,
    useCase: "Demonstrate that ChatGPT is operating as an MCP-native orchestration client by:\nEstablishing authenticated identity\nNavigating structured delivery data (POVs / Tasks)\nDiscovering available MCP services\nValidating service health before use\nExecuting live cross-service calls\nRunning a multi-service workflow\n\nProducing analytics insight\n\nShowing reusable automation via prompts\n\nDemonstrating auditability of actions",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 180,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive'],
    version: "1.0.0",
    variables: {} as any,
    examples: {} as any,
    promptText: `# MCP Platform Showcase

> **Purpose**: First-time demonstration of MCP orchestration capabilities
> **Audience**: Executives, Architects, Platform Evaluators
> **Version**: 2.0 | **Updated**: 2026-03-19

---

## Objective

Demonstrate that the AI client (ChatGPT, Claude Desktop, Gemini) is operating as an MCP-native orchestration client by:

1. Establishing authenticated identity
2. Discovering enterprise work dynamically
3. Navigating structured delivery data (POVs and Tasks)
4. Discovering available MCP services
5. Validating service health before use
6. Executing live cross-service calls
7. Running a multi-service workflow
8. Producing analytics insight
9. Showing reusable automation via prompts
10. Demonstrating auditability of actions

This is not a test script. It is a narrative walkthrough of MCP value.

---

## Step 1 — Identity and Trust Context

\`\`\`
registry(action: "list")
\`\`\`

**Explain**: Confirms authenticated identity (email, role, access level) and shows services you own. Establishes trust context within the MCP Hub.

---

## Step 2 — Discover Active Business Work

\`\`\`
project(action: "pov.list", status: "IN_PROGRESS", limit: 5)
\`\`\`

**Explain**: Shows that AI is discovering live initiatives dynamically, not querying a static database.

---

## Step 3 — Semantic Discovery Across the Platform

\`\`\`
search("security")
\`\`\`

**Explain**: Demonstrates natural language discovery across POVs, tasks, and templates. Returns type-prefixed results (\`pov-xxx\`, \`task-xxx\`, \`template-xxx\`).

---

## Step 4 — Inspect Execution Layer

\`\`\`
project(action: "task.list", status: "IN_PROGRESS", limit: 5)
\`\`\`

**Explain**: Shows traversal from portfolio strategy to delivery execution — here scoped to *active* work. \`task.list\` filters by task \`status\` (OPEN, IN_PROGRESS, COMPLETED, BLOCKED), plus \`priority\`, \`pov_name\`, \`assignee\`, or \`phase_name\`.

---

## Step 5 — Deep Context Resolution

\`\`\`
project(action: "pov.details", pov_name: "<select one returned POV>")
\`\`\`

**Explain**: AI understands delivery structure — teams, phases, stages, task statistics, and progress.

---

## Step 6 — Discover MCP Service Ecosystem

\`\`\`
services(action: "discover")
\`\`\`

**Explain**: Reveals the full service mesh available for orchestration — internal platform services, Docker containers, and external SaaS integrations.

---

## Step 7 — Validate a Service Before Using It

\`\`\`
services(action: "health", service_name: "weather-service", realtime: true)
\`\`\`

**Explain**: Shows trust-aware orchestration where AI checks reliability (response time, success rate, uptime) before invoking a service.

---

## Step 8 — Invoke External Capability Through MCP

\`\`\`
services(action: "call",
  targetService: "weather-service",
  tool: "current_weather",
  arguments: { location: "Houston,US", units: "imperial" })
\`\`\`

**Explain**: The AI client brokers execution through the Hub rather than generating answers directly. Real data from a real service.

---

## Step 9 — Execute Multi-Service Workflow

\`\`\`
services(action: "workflow.execute",
  steps: [
    { service: "weather-service", tool: "current_weather",
      arguments: { location: "Houston,US", units: "imperial" } },
    { service: "eia-service", tool: "get_generation_mix_by_state",
      arguments: { state: "TX", period: "latest" } }
  ],
  executionMode: "parallel",
  failureStrategy: "continue")
\`\`\`

**Explain**: Demonstrates orchestration across independent services — weather and energy data fetched in parallel, correlated by the AI.

---

## Step 10 — Generate Operational Analytics

\`\`\`
analytics(action: "team.performance", timeframe: "30d", includeIndividual: true)
\`\`\`

**Explain**: Moves from orchestration to insight. AI-powered performance metrics across the delivery portfolio.

---

## Step 11 — Execute a Reusable Automation Playbook

\`\`\`
prompt_command(promptName: "energy_operations_optimizer")
\`\`\`

**Explain**: Shows how prompts become reusable operational intelligence workflows. This prompt cross-correlates weather and energy data to generate actionable recommendations.

---

## Step 12 — Demonstrate Governance and Auditability

\`\`\`
services(action: "workflow.list", limit: 5)
\`\`\`

**Explain**: Every AI-driven action is traceable and reviewable — execution IDs, timestamps, step results, and status.

---

## Expected Outcome

The user witnesses a complete lifecycle:

\`\`\`
Identity → Discovery → Understanding → Orchestration → Insight → Governance
\`\`\`

This establishes MCP as an AI-operable coordination platform, not just an integration layer.

---

## Tool Name Reference

| This Prompt | Consolidated Tool | Tier |
|-------------|------------------|------|
| \`registry(action: "list")\` | \`registry\` | Platform |
| \`project(action: "pov.list")\` | \`project\` | Platform |
| \`search("...")\` | \`search\` | Platform |
| \`project(action: "task.list")\` | \`project\` | Platform |
| \`project(action: "pov.details")\` | \`project\` | Platform |
| \`services(action: "discover")\` | \`services\` | Platform → Hub |
| \`services(action: "health")\` | \`services\` | Platform → Hub |
| \`services(action: "call")\` | \`services\` | Platform → Tier 2/3 |
| \`services(action: "workflow.execute")\` | \`services\` | Platform → Hub |
| \`analytics(action: "team.performance")\` | \`analytics\` | Platform |
| \`prompt_command(...)\` | \`prompt_command\` | Platform |
| \`services(action: "workflow.list")\` | \`services\` | Platform → Hub |

**Architecture context**: See \`platform_tool_architecture\` prompt for the three-tier model (Platform Tools / Internal Services / External Services).

---

## Related Prompts

- **platform_tool_architecture** — Three-tier tool architecture
- **getting_started** — Interactive onboarding (role-based paths)
- **ABOUT-trust-levels** — 6-tier trust hierarchy for token access
- **HOWTO-use-workflows** — Multi-service workflow orchestration
- **DEMO-token-validation** — Token validation UX demonstration`,
  },
  {
    name: 'DEMO-token-validation',
    description: "Visual guide to token validation",
    category: AgentCategory.DOCUMENTATION,
    useCase: "See comprehensive validation results with enhanced formatting",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:devops'],
    version: "1.0.0",
    variables: {} as any,
    examples: {} as any,
    promptText: `# Token Validator — Visual Validation Showcase

> **Gold standard MCP service response UX demonstration**
>
> See comprehensive validation results with enhanced formatting

---

## Quick Test

**Fastest way to see enhanced validation:**

\`\`\`javascript
services(action: "workflow.execute", workflowName: "trust-level-basic-demo")
\`\`\`

**Or direct call:**

\`\`\`javascript
services(action: "workflow.execute", {
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: { enhancedFormat: true }
  }]
})
\`\`\`

---

## What You'll See

### Complete Validation Report

\`\`\`
╔═══════════════════════════════════════════════════════════════════╗
║  TRUSTED TRUST LEVEL - COMPLETE SUCCESS                          ║
╚═══════════════════════════════════════════════════════════════════╝

RESULTS:
  ✅ Trust Level: TRUSTED
  ✅ Token Received: true
  ✅ Token Validation: SUCCESS (11/11 steps passed)
  ✅ Execution Time: 147ms
  ✅ JWKS Validation: 43ms (Component 5 compliant)

VALIDATION STEPS:
  ✅ _context received from pAIchart Hub
  ✅ Trust level assigned: TRUSTED
  ✅ JWT token present in _context (trust level grants token access)
  ✅ Token header decoded - Algorithm: RS256, Key ID: paichart-2026-04
  ✅ Token uses RS256 (asymmetric public key cryptography)
  ✅ JWKS public keys fetched from https://paichart.app/api/auth/jwks (41ms)
  ✅ Public key matched: kid='paichart-2026-04' found in JWKS
  ✅ RS256 signature verified using public key (41ms)
  ✅ Token issuer validated: https://paichart.app
  ✅ Token audience validated: https://paichart.app/mcp/token-validator-service (per-service, RFC 8707)
  ✅ Token not expired (valid for 13 minutes)

TOKEN CLAIMS VERIFIED:
  • User: you@example.com
  • Role: ADMIN
  • Issuer: https://paichart.app
  • Audience: https://paichart.app/mcp/token-validator-service
  • Expires In: 13 minutes
  • Authorized Party (azp): claude-desktop

SUMMARY:
Token Validation:
  ✅ JWT received and decoded
  ✅ RS256 signature verified via JWKS
  ✅ Issuer/audience validated
  ✅ Token not expired

Security Verified:
  ✅ Public key cryptography (RS256)
  ✅ Trust level properly assigned
  ✅ 43ms validation (< 50ms SLA)
  ✅ Component 5 compliant
\`\`\`

---

## Section Breakdown

### 1. RESULTS (5 Key Metrics)

Instant status overview — see success at a glance.

- Trust level assigned (INTERNAL, TRUSTED, OWNER, TEAM_MEMBER, SCOPED, or ANONYMOUS)
- Whether a JWT token was received
- Overall validation status (11 steps)
- Performance metrics (total + JWKS validation time)

### 2. VALIDATION STEPS (11-Step Process)

Detailed JWKS validation breakdown:

- Step-by-step token verification with timing per step
- Failure point identification (first red X shows where validation broke)
- Educational: see exactly how RS256/JWKS validation works

### 3. TOKEN CLAIMS VERIFIED

User identity confirmation from the decoded JWT:

- Verified user email and role
- Token issuer and audience (Component 5 compliance)
- Token expiration countdown

### 4. SUMMARY

What was validated + contextual insights auto-detected from trust level:

| Trust Level | Contextual Notes |
|-------------|-----------------|
| INTERNAL | Platform service, full access |
| TRUSTED | Localhost Docker service, full token access |
| OWNER | Service ownership verified, full token for integration testing |
| TEAM_MEMBER | POV team validated, token for collaboration |
| SCOPED | POV context validated, no token (add service owner to team for token) |
| ANONYMOUS | No POV context, no token (hints to improve trust) |

---

## Trust Level Reference

The Hub assigns one of 6 trust levels to each service call, which determines JWT token access:

| Trust Level | Token? | When Assigned |
|-------------|--------|---------------|
| INTERNAL | Yes | \`paichart-*\` platform services |
| TRUSTED | Yes | Localhost Docker services (in TRUSTED_INTERNAL_SERVICES list) |
| OWNER | Yes | Caller owns the target service |
| TEAM_MEMBER | Yes | Service owner is on the caller's POV team |
| SCOPED | No | Public service called with a povId |
| ANONYMOUS | No | Public service called without povId |

**See also**: \`/prompt ABOUT-trust-levels\` for the complete guide.

---

## Testing Different Trust Levels

### Test 1: TRUSTED (Localhost Docker Service)

The \`token-validator-service\` runs on localhost:3105, so it gets TRUSTED trust automatically:

\`\`\`javascript
services(action: "workflow.execute", workflowName: "trust-level-basic-demo")
\`\`\`

**Expected**: Trust Level TRUSTED, token received, 11/11 validation steps pass.

### Test 2: Multi-Language Validation (Parallel)

Runs 3 parallel validations — TypeScript, JavaScript, Python contexts:

\`\`\`javascript
services(action: "workflow.execute", workflowName: "jwks-validation-advanced-demo")
\`\`\`

**Expected**: 3 parallel results, all TRUSTED, total time ~300ms (not 900ms sequential).

### Test 3: Troubleshooting with POV Context

\`\`\`javascript
services(action: "workflow.execute", {
  workflowName: "token-troubleshooting-demo",
  povId: "your-pov-id"
})
\`\`\`

**Expected**: Trust level may vary based on POV team membership. Useful for debugging why a service isn't receiving tokens.

---

## Advanced Usage

### Raw JSON Format (For Programmatic Parsing)

\`\`\`javascript
services(action: "call", {
  targetService: "token-validator-service",
  tool: "verify_auth",
  arguments: { enhancedFormat: false }
})
\`\`\`

Returns raw JSON without \`_visual\` or \`_formatted\` fields. Use for CI/CD scripts, automated testing, log parsing.

### Custom Code Examples (Opt-In)

Code examples are disabled by default to prevent ChatGPT safety layer blocks. To include TypeScript/JavaScript/Python validation code:

\`\`\`javascript
services(action: "call", {
  targetService: "token-validator-service",
  tool: "verify_auth",
  arguments: {
    enhancedFormat: true,
    includeCodeExample: true,
    codeLanguage: "python"
  }
})
\`\`\`

---

## What This Demonstrates

### For External Service Developers

This is the gold standard for MCP service responses:

1. Clear status — box header shows trust level + result
2. Key metrics — 5 most important points upfront
3. Detailed validation — 11-step process with checkmarks
4. User identity — verified claims in friendly format
5. Educational summary — what was validated and why
6. Performance — timing metrics for SLA compliance
7. Contextual help — auto-detected based on trust level

### For Users

Understand your integration status instantly:

- Green checkmarks = everything working
- Red X marks = what failed and where
- Trust level = why you did/didn't get a token
- Contextual notes = how to improve your access

### For Support

Screenshot-ready troubleshooting — user sends screenshot, support sees trust level, validation status, and error point. No follow-up questions needed.

---

## Pre-Built Demo Workflows

\`\`\`javascript
// 1. Basic trust level test
services(action: "workflow.execute", workflowName: "trust-level-basic-demo")

// 2. Advanced JWKS validation (3 languages, parallel)
services(action: "workflow.execute", workflowName: "jwks-validation-advanced-demo")

// 3. Troubleshooting with POV context
services(action: "workflow.execute", {
  workflowName: "token-troubleshooting-demo",
  povId: "your-pov-id"
})

// 4. Direct service call (simplest)
services(action: "call", {
  targetService: "token-validator-service",
  tool: "verify_auth",
  arguments: { enhancedFormat: true }
})
\`\`\`

---

## Related Prompts

- **ABOUT-trust-levels** — Complete 6-tier trust hierarchy guide
- **HOWTO-validate-jwt-tokens** — JWKS integration deep dive
- **ABOUT-security-policy** — Multi-layer Hub security
- **HOWTO-use-workflows** — Multi-service orchestration
- **getting_started** — New user tutorials
- **HOWTO-register-service** — Register your first service
- **platform_tool_architecture** — Three-tier tool architecture (platform / internal / external)

---

**Version:** 2.0 | **Updated:** 2026-03-19 | **Status:** Production-Ready
**Service:** \`token-validator-service\` (localhost:3105)
**Purpose:** Demonstrate gold standard MCP service validation UX`,
  },
  {
    name: 'HOWTO-get-started',
    description: "Friendly first-run guide for new pAIchart users — get familiar in minutes via guided prompts and plain-language questions.",
    category: AgentCategory.DOCUMENTATION,
    useCase: "New to pAIchart? Get familiar fast — run a POV audit, watch services orchestrate, take the full feature tour, or just ask in plain language.",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:general'],
    version: "2.1.0", // 2026-07-08: added HOWTO-mcp-tools + HOWTO-run-an-agent to the "Go deeper" library list (were missing after they were seeded).
    variables: {} as any,
    examples: {} as any,
    promptText: `# Getting Started with pAIchart

> **A friendly first run for new users — get familiar in a few minutes.**

---

## What is pAIchart?

pAIchart is an AI-native hub for **delivery management** (Proof-of-Value projects → phases → tasks) plus a **registry of external MCP services** (weather, energy, financial data, automation, and more). You drive it in plain language — it finds the right tools, composes the steps, and runs them for you.

Nothing to configure to begin. Just run a guided prompt or ask a question.

---

## Try it now — three guided prompts

Run these with \`prompt_command\` (or type \`/\` and pick them):

**1. See your POV portfolio** — *POV management*
\`\`\`
prompt_command(command: "/prompt task_audit_and_planning")
\`\`\`
Audits tasks across all your active POVs, flags bottlenecks and risks, and hands you a prioritized plan — in seconds.

**2. Watch services orchestrate** — *MCP service orchestration*
\`\`\`
prompt_command(command: "/prompt energy_operations_optimizer")
\`\`\`
Composes weather + energy services into operational recommendations — a live look at multi-service orchestration.

**3. The full tour** — *comprehensive; a few minutes, many steps*
\`\`\`
prompt_command(command: "/prompt DEMO-mcp-platform")
\`\`\`
A guided showcase of the whole platform: identity, POV/task data, service discovery, and orchestration.

---

## Or just ask (free-form)

No prompt required — pAIchart is built for natural language. Try:
- "What POVs and services do I have?"
- "Which of my POVs are at risk?"
- "What can the weather service do?"
- "Summarize my highest-priority tasks."

The AI client reads your intent, finds the right tools, and responds.

---

## Go deeper — the HOWTO library

Load any guide with \`prompt_command(command: "/prompt <name>")\`, or run \`list_prompts()\` to see them all:

- **HOWTO-mcp-tools** — how pAIchart's tools work (the \`entity(action: "verb")\` surface)
- **HOWTO-register-service** — register your own MCP service with the Hub
- **HOWTO-use-workflows** — multi-service orchestration in depth
- **HOWTO-validate-jwt-tokens** — secure your service (JWKS, trust levels)
- **ABOUT-trust-levels** — who gets tokens, and why
- **ABOUT-security-policy** — what's allowed, what's blocked
- **HOWTO-run-an-agent** — run one specialist agent on a task
- **HOWTO-use-pipeline-harness** — autonomous multi-specialist pipelines

---

## Prompts vs. workflows

What you just ran are **prompts** — guided, ready-made templates you invoke with \`/prompt …\` (or by asking). A **workflow** is different: a multi-step orchestration across several services that the AI composes and runs for you (e.g. "get my POVs, screenshot the dashboard, and email it"). You don't need workflows to get started — just ask for what you want and pAIchart composes one when it helps. To learn the mechanics later, load \`/prompt HOWTO-use-workflows\`.

---

**Version**: 2.1 | **Updated**: 2026-07-08 | **Status**: Production-Ready`,
  },
  {
    name: 'HOWTO-register-service',
    description: "Step-by-step tutorial: Register your MCP service in 15 minutes",
    category: AgentCategory.DOCUMENTATION,
    useCase: "By the end of this guide, you'll have:\n- Registered your MCP service with the Hub\n- Made it discoverable by AI agents (ChatGPT, Claude Desktop, Gemini)\n- Achieved **Grade A quality** (full parameter schemas)\n- Configured access control and rate limits\n- Verified it works end-to-end",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:general'],
    version: "1.0.0",
    variables: {} as any,
    examples: {} as any,
    promptText: `# MCP Hub Service Registration Guide

> **Step-by-step tutorial: Register your MCP service in 15 minutes**
>
> From zero to Grade A quality with validation at each step

---

## 🎯 What You'll Accomplish

By the end of this guide, you'll have:
- ✅ Registered your MCP service with the Hub
- ✅ Made it discoverable by AI agents (ChatGPT, Claude Desktop, Gemini)
- ✅ Achieved **Grade A quality** (full parameter schemas)
- ✅ Configured access control and rate limits
- ✅ Verified it works end-to-end

**Time**: 15-20 minutes

---

## 📋 Prerequisites Checklist

Before you begin, ensure you have:

- ✅ MCP service running (Node.js with MCP SDK 1.25.3+)
- ✅ Service deployed and reachable (HTTPS endpoint or localhost)
- ✅ pAIchart Hub account (OAuth via Microsoft, Google, or GitHub)
- ✅ Service has \`/health\` endpoint (or custom health path)

**Not ready?** See [A] **HOWTO-register-service** for the full setup tutorial

---

## Step 1: Basic Registration (2 min) - Grade C

### Minimum Viable Registration

**Start simple** - just register the service:

\`\`\`javascript
registry(action: "register", {
  name: "my-weather-api",
  description: "Real-time weather forecasts and alerts for global locations",
  endpoint: "https://api.myservice.com/mcp",
  category: "data-services"
})
\`\`\`

**Response** (auto-approved path — most data-services / monitoring / automation / communication / ai-intelligence services):
\`\`\`json
{
  "serviceId": "cm3xyz...",
  "status": "ACTIVE",
  "message": "Service registered successfully",
  "qualityGrade": "D",
  "nextSteps": "Add tool capabilities to enable AI client interaction"
}
\`\`\`

**Alternate Response** (policy engine flagged for review — common for \`security\` category, localhost endpoints, or descriptions matching high-risk keywords):
\`\`\`json
{
  "success": true,
  "serviceId": "cm3xyz...",
  "status": "PENDING_APPROVAL",
  "message": "Service 'my-weather-api' submitted for approval",
  "approvalDetails": {
    "riskLevel": "MEDIUM",
    "estimatedReviewTime": "24-48 hours",
    "reasons": [...],
    "warnings": [...],
    "guidance": ["✅ Service approved with enhanced monitoring", ...]
  }
}
\`\`\`

**What this means**: Your service row is created with \`status: 'INACTIVE'\` and \`configuration.approvalStatus: 'PENDING_APPROVAL'\`. It won't appear in \`services(action: 'discover')\` until an admin promotes it. Check status anytime via \`registry(action: 'list')\`.

---

### Choose Your Category

**6 Hub categories** for discovery:

| Category | Use For | Auto-Approved? |
|----------|---------|----------------|
| **ai-intelligence** | AI/ML services, inference, embeddings | ✅ Yes |
| **data-services** | Data APIs, weather, databases, analytics | ✅ Yes |
| **automation** | Browser automation, workflows, RPA | ✅ Yes |
| **monitoring** | Observability, logging, alerting, APM | ✅ Yes |
| **communication** | Notifications, email, SMS, chat | ✅ Yes |
| **security** | Auth, compliance, encryption | ⚠️ Requires approval |

**High-risk categories** (require admin review):
- \`security\`, \`authentication\`, \`payment\`, \`financial\`
- \`medical\`, \`healthcare\`, \`government\`, \`legal\`

**Why categories matter**: AI discovers services by capability - "find monitoring services" returns all services in \`monitoring\` category.

---

### ✅ Checkpoint 1: Verify Registration

**Check it appears in your services**:
\`\`\`javascript
registry(action: "list")
\`\`\`

**Should see**:
\`\`\`json
{
  "services": [{
    "id": "cm3xyz...",
    "name": "my-weather-api",
    "status": "ACTIVE",
    "category": "data-services"
  }],
  "total": 1
}
\`\`\`

**✅ Success**: Service registered! (Grade D - no tools yet)

---

### What the Hub Adds Server-Side

You only supply \`name\`, \`endpoint\`, \`category\`, \`description\`, \`capabilities\`, \`version\`, \`authType\`. The Hub populates these into your service's \`configuration\` JSON at registration time:

| Field | Value | Where it comes from |
|---|---|---|
| \`ownerId\` | Your user CUID | Session token (\`userId\`) |
| \`ownerEmail\` | Your account email | Session token (\`userEmail\`) — surfaced in \`registry(action: 'list')\` and the Services UI |
| \`createdBy\` | \`"user_registration"\` | Hardcoded provenance marker |
| \`serviceType\` | \`"mcp_service"\` | Hardcoded marker (future-proofing for non-MCP service types) |
| \`approvalStatus\` | \`"APPROVED"\` or \`"PENDING_APPROVAL"\` | Policy engine verdict |
| \`evaluationResult\` | \`{ timestamp, evaluation: { risks, warnings, riskLevel, approvalRecommendation }, evaluatedBy }\` | Full policy engine output for audit |
| \`transport\` | \`"streamable-http"\`, \`"sse"\`, or \`"http"\` | Derived from endpoint URL scheme: \`/mcp\` → streamable-http, \`/sse\` → sse, else http |

When you read your service back via \`registry(action: 'list')\` or \`services(action: 'discover')\`, expect to see these fields alongside whatever you provided in \`updates.capabilities\` etc.

---

## Step 2: Add Tool Capabilities (5 min) - Grade C → A

### Why Add Tool Schemas?

**Without schemas** (Grade C):
- AI doesn't know what parameters to pass
- Must guess based on tool name
- Error-prone integration

**With schemas** (Grade A):
- AI discovers exact parameters via \`registry(action: "tools")\`
- Proper validation and documentation
- Best integration experience

---

### Add Tools with Full Schemas

> **⚠️ Tool names must match your server exactly.** The \`name\` you register is the literal string the Hub forwards on every call — it must byte-match the name your MCP server exposes (case- and separator-sensitive, so \`get-forecast\` ≠ \`get_forecast\`). Use your server's **real** tool names, whatever the convention: kebab-case (\`get-forecast\`), snake_case (\`get_forecast\`), or camelCase (\`getForecast\`). The examples below use snake_case only as an example — it is **not** a required or preferred convention.

**Update your service** with complete tool definitions:

\`\`\`javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    capabilities: {
      tools: [
        {
          name: "get_forecast",
          description: "Get weather forecast for a location",
          inputSchema: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "City name or coordinates (e.g., 'Sydney' or '-33.8688,151.2093')"
              },
              days: {
                type: "number",
                description: "Number of forecast days (1-14)",
                minimum: 1,
                maximum: 14,
                default: 7
              },
              units: {
                type: "string",
                enum: ["celsius", "fahrenheit"],
                default: "celsius",
                description: "Temperature units"
              }
            },
            required: ["location"]
          }
        },
        {
          name: "get_alerts",
          description: "Get active weather alerts for a region",
          inputSchema: {
            type: "object",
            properties: {
              region: {
                type: "string",
                description: "Region code (e.g., 'AU-NSW' for New South Wales)"
              },
              severity: {
                type: "string",
                enum: ["all", "minor", "moderate", "severe", "extreme"],
                default: "all"
              }
            },
            required: ["region"]
          }
        }
      ]
    }
  }
})
\`\`\`

**Response**:
\`\`\`json
{
  "serviceId": "cm3xyz...",
  "updated": ["capabilities"],
  "message": "Service updated successfully"
}
\`\`\`

---

### Schema Best Practices

**String with validation**:
\`\`\`javascript
location: {
  type: "string",
  description: "Clear description of what this is",
  minLength: 1,
  maxLength: 100
}
\`\`\`

**Enum (dropdown choices)**:
\`\`\`javascript
priority: {
  type: "string",
  enum: ["low", "normal", "high", "urgent"],
  default: "normal",
  description: "Message priority level"
}
\`\`\`

**Number with constraints**:
\`\`\`javascript
count: {
  type: "number",
  minimum: 1,
  maximum: 100,
  default: 10,
  description: "Number of items to return"
}
\`\`\`

**Boolean**:
\`\`\`javascript
includeMetadata: {
  type: "boolean",
  default: false,
  description: "Include additional metadata in response"
}
\`\`\`

**Array**:
\`\`\`javascript
tags: {
  type: "array",
  items: { type: "string" },
  description: "Filter by tags"
}
\`\`\`

---

### ✅ Checkpoint 2: Verify Quality Grade

**Check your grade**:
\`\`\`javascript
registry(action: "tools", { service_name: "my-weather-api" })
\`\`\`

**Should see**:
\`\`\`json
{
  "qualityAssessment": {
    "grade": "A",
    "schemaQuality": "full",
    "toolsWithSchema": 2,
    "totalTools": 2,
    "message": "All tools have full parameter schemas - excellent AI client compatibility"
  }
}
\`\`\`

**✅ Success**: Grade A achieved! AI can now discover your tool parameters.

---

## Step 3: Configure Access Control (3 min)

### Set Public Access

**Default**: Services start private (owner + admins only)

**Make public** (allow any authenticated user):
\`\`\`javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    permissions: {
      publicAccess: true
    }
  }
})
\`\`\`

**Security note**: Start private, test with OWNER trust, make public when ready.

---

### Configure Rate Limiting

**Protect your service** from abuse:

\`\`\`javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    rateLimit: {
      requests: 100,    // Max 100 requests
      windowMs: 60000   // Per minute (60000ms)
    },
    maxExecutionTime: 30000  // 30 seconds timeout
  }
})
\`\`\`

**How it works**:
- Hub enforces rate limit **before** calling your service
- Requests beyond limit → Error: "Rate limit exceeded"
- No rate limiting code needed in your service!

**Recommended starting values**:
- **Data services**: 100/min
- **Communication services**: 50/min (email/SMS costs)
- **Automation services**: 20/min (browser automation is slow)
- **AI services**: 30/min (inference is expensive)

---

### Custom Health Check Path

**If your health endpoint isn't \`/health\`**:

\`\`\`javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    healthCheckPath: "/api/status"  // Custom path
  }
})
\`\`\`

**Health check requirements**:
- Must return HTTP 200 for healthy status
- Response time < 5 seconds
- Optional: Include version, timestamp in response

---

### ✅ Checkpoint 3: Verify Configuration

**Check health**:
\`\`\`javascript
services(action: "health", { service_name: "my-weather-api" })
\`\`\`

**Should see**:
\`\`\`json
{
  "status": "healthy",
  "responseTime": "45ms",
  "successRate": 100,
  "version": "1.0.0",
  "permissions": {
    "publicAccess": true,
    "rateLimit": { "requests": 100, "windowMs": 60000 }
  }
}
\`\`\`

**✅ Success**: Service configured and healthy!

---

## Step 4: Test Your Service (3 min)

### Test Discovery

**Check it appears in discovery**:
\`\`\`javascript
services(action: "discover", { category: "data-services" })
\`\`\`

**Should see your service**:
\`\`\`json
{
  "services": [{
    "name": "my-weather-api",
    "description": "Real-time weather forecasts...",
    "category": "data-services",
    "status": "ACTIVE"
  }]
}
\`\`\`

**✅ Discovery works!**

---

### Test Tool Call

**Call your tool through the Hub**:
\`\`\`javascript
services(action: "call", {
  targetService: "my-weather-api",
  tool: "get_forecast",
  arguments: {
    location: "Sydney",
    days: 3,
    units: "celsius"
  }
})
\`\`\`

**Should return**: Weather forecast data from your service

**✅ Service calls work!**

---

### Test with token-validator (IMPORTANT!)

**Verify token authentication** (if your service validates tokens):

\`\`\`javascript
services(action: "workflow.execute", {
  steps: [{
    service: "test-auth-service",
    tool: "verify_auth",
    arguments: {}
  }]
})
\`\`\`

**Shows**:
- Your trust level (should be OWNER)
- Whether you received a token (should be YES)
- JWKS validation results (11 steps)
- Copy-paste code examples for your service

**Why important**: Confirms your service will receive tokens and can validate them via JWKS.

**Per-service audience (RFC 8707)**: tokens forwarded to your service carry \`aud: https://paichart.app/mcp/<your-service-slug>\` — accept *that* audience, not the generic \`/mcp\`. This is the security point: a token stolen from another service can't be replayed against yours (blast-radius isolation). For the full accept-list code (JS + Python, plus the legacy-overlap window), see [E] **HOWTO-validate-jwt-tokens**.

---

### ✅ Checkpoint 4: End-to-End Verification

**Checklist**:
- ✅ Service appears in \`services(action: 'discover')\`
- ✅ Health check returns "healthy"
- ✅ Grade is "A" (full schemas)
- ✅ \`services(action: 'call')\` returns expected results
- ✅ token-validator shows OWNER trust + token received

**🎉 Success**: Your service is fully integrated!

---

## Step 5: Advanced Configuration (Optional - 5 min)

### Transport Selection

**Choose the right transport** for your deployment:

**Streamable HTTP** (\`/mcp\` endpoint) ✅ **Recommended**:
\`\`\`javascript
endpoint: "https://api.myservice.com/mcp"
\`\`\`

**Best for**:
- External services (internet-accessible)
- Corporate networks (works through firewalls)
- Serverless (AWS Lambda, Cloudflare Workers)
- Standard HTTP POST (universally compatible)

**SSE** (\`/sse\` endpoint):
\`\`\`javascript
endpoint: "http://localhost:3100/sse"
\`\`\`

**Best for**:
- Internal Docker services (localhost only)
- Real-time streaming (long-lived connections)
- Local development

**Why Streamable HTTP is recommended**: No VPN required, works through corporate firewalls, perfect for external services.

---

### Version Management

**Update version** when you make changes:

\`\`\`javascript
registry(action: "update", {
  service_name: "my-weather-api",
  updates: {
    version: "1.1.0"  // Semantic versioning
  }
})
\`\`\`

**Best practice**: Follow semver (1.0.0 → 1.1.0 → 2.0.0)

---

### Service Description Guidelines

A good description is a stable contract that any future caller — human or AI agent — can read and immediately understand the service mechanics, without being directed at a specific moment, customer, or resource.

**Three-sentence shape**:

1. **What it does** — capability and scope.
2. **How it authenticates** — auth model, and whether per-user identity forwarding is required.
3. **What the caller needs** — preconditions to make a call succeed (a \`povId\`, team membership, a tool that must be called first, etc.).

**Don't put in the description**:

- ❌ Specific identifiers (CUIDs, povIds, userIds, container names)
- ❌ Account or customer names (\`you@example.com\`, "Acme Corp")
- ❌ Instructions directed at an agent ("you should…", "I want you to…")
- ❌ Mutable operational state ("as of 2026-05-13 the service…")
- ❌ Deployment / billing notes ("trial expires…", "rate-limited until…")

Any of those belong in \`configuration\` (for owner/operator fields the Hub already surfaces), in your team's runbook, or in the response payload when relevant — not in a permanent description string read by everyone forever.

**Good**:

> Snowflake data warehouse access with read-only SQL queries, schema exploration, and object metadata. Supports JWKS-authenticated workflow execution for user-scoped audit trails. Calls require \`workflow.execute\` with a \`povId\` where the caller has team membership for identity forwarding.

**Bad** (anti-pattern from a real session):

> …Supports JWKS-authenticated workflow execution. The owner of the service is you@example.com and is also the owner of Acme Corp Firewall with povId cmExamplePov0000000000000 so to enable token passing assign team membership.

The bad version embeds an owner identity, a specific POV ID, and an imperative aimed at one reader — none of that is useful (or true) to the next caller. The good version captures the same mechanics in stable terms.

**Optional extras** for longer descriptions: a WHEN TO USE checklist or EXAMPLES block (multi-paragraph). \`services(action: 'discover')\` shows the first paragraph as the summary; \`registry(action: "tools")\` shows the full text.

**Why this matters**: \`services(action: 'discover')\` and the descriptions returned to AI clients are the *only* surface most callers see before deciding whether to use your service. Treat them like API docs, not chat.

---

### Resources and Prompts

**Optional capabilities** (future functionality):

\`\`\`javascript
capabilities: {
  tools: [...],
  resources: ["weather-data", "historical-archive"],  // MCP resources
  prompts: ["daily-briefing", "storm-tracker"]        // Interactive prompts
}
\`\`\`

**Currently**: Only \`tools\` are fully supported. Resources and prompts are stored but not yet utilized.

---

## 🚀 Complete Registration Example

**Grade A registration** with all best practices:

\`\`\`javascript
registry(action: "register", {
  name: "premium-weather-service",
  description: "Enterprise weather API with real-time forecasts, alerts, and historical data for 200+ countries. Includes severe weather monitoring and customizable notifications.

WHEN TO USE:
✅ Get accurate weather forecasts (1-14 days)
✅ Monitor severe weather alerts by region
✅ Access historical weather data
✅ Integrate weather into dashboards and workflows

FEATURES:
- 15-minute update frequency
- 99.9% uptime SLA
- Multi-language support (20+ languages)
- Customizable units (metric/imperial)

EXAMPLES:
- get_forecast(location: 'Sydney', days: 7, units: 'celsius')
- get_alerts(region: 'AU-NSW', severity: 'extreme')
- get_historical(location: 'Melbourne', startDate: '2025-01-01')",

  endpoint: "https://api.premiumweather.com/mcp",
  category: "data-services",
  version: "2.0.0",

  capabilities: {
    tools: [
      {
        name: "get_forecast",
        description: "Get weather forecast for a location (1-14 days)",
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name, coordinates, or airport code"
            },
            days: {
              type: "number",
              description: "Number of forecast days",
              minimum: 1,
              maximum: 14,
              default: 7
            },
            units: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              default: "celsius"
            },
            language: {
              type: "string",
              description: "Response language (ISO 639-1 code)",
              default: "en"
            }
          },
          required: ["location"]
        }
      },
      {
        name: "get_alerts",
        description: "Get active weather alerts for a region",
        inputSchema: {
          type: "object",
          properties: {
            region: {
              type: "string",
              description: "Region code (e.g., 'AU-NSW', 'US-CA')"
            },
            severity: {
              type: "string",
              enum: ["all", "minor", "moderate", "severe", "extreme"],
              default: "all",
              description: "Filter by alert severity"
            },
            includeExpired: {
              type: "boolean",
              default: false,
              description: "Include alerts that have expired"
            }
          },
          required: ["region"]
        }
      },
      {
        name: "get_historical",
        description: "Get historical weather data for analysis",
        inputSchema: {
          type: "object",
          properties: {
            location: { type: "string" },
            startDate: {
              type: "string",
              format: "date",
              description: "Start date (YYYY-MM-DD)"
            },
            endDate: {
              type: "string",
              format: "date",
              description: "End date (YYYY-MM-DD)"
            },
            metrics: {
              type: "array",
              items: {
                type: "string",
                enum: ["temperature", "precipitation", "wind", "humidity", "pressure"]
              },
              description: "Metrics to include"
            }
          },
          required: ["location", "startDate"]
        }
      }
    ]
  }
})
\`\`\`

**After registration, configure access**:
\`\`\`javascript
registry(action: "update", {
  service_name: "premium-weather-service",
  updates: {
    permissions: {
      publicAccess: true  // Make public after testing
    },
    rateLimit: {
      requests: 100,
      windowMs: 60000  // 100/min
    },
    maxExecutionTime: 45000  // 45 seconds
  }
})
\`\`\`

---

## 🔧 Troubleshooting Common Issues

### Error: "Service name already registered"

**Cause**: Another user already registered that name

**Solution**: Choose a unique name
\`\`\`javascript
// Try: my-weather-api → my-weather-api-v2
// Or: premium-weather-api
\`\`\`

**Check availability**:
\`\`\`javascript
services(action: "discover")  // See all registered services
\`\`\`

---

### Error: "Invalid endpoint URL"

**Cause**: Malformed URL or unsupported protocol

**Common mistakes**:
\`\`\`javascript
❌ endpoint: "my-service.com"           // Missing protocol
❌ endpoint: "ws://my-service.com"      // WebSocket not supported
❌ endpoint: "localhost:3100"           // Missing http://

✅ endpoint: "https://my-service.com/mcp"    // Correct!
✅ endpoint: "http://localhost:3100/sse"     // Localhost OK for Docker
\`\`\`

---

### Error: "Category required"

**Cause**: Missing or invalid category

**Solution**: Use one of 6 valid categories
\`\`\`javascript
// Valid:
category: "data-services"
category: "automation"
category: "monitoring"
category: "communication"
category: "ai-intelligence"
category: "security"  // Requires approval

// Invalid:
category: "weather"  // Not a valid category
\`\`\`

---

### Error: "Description too short"

**Cause**: Description < 10 characters

**Solution**: Provide meaningful description (10-500 chars)
\`\`\`javascript
❌ description: "Weather"  // Too short (7 chars)

✅ description: "Real-time weather forecasts and alerts for global locations"  // Good (69 chars)
\`\`\`

---

### Service Not Discoverable

**Checklist**:

1. **Check status**:
   \`\`\`javascript
   registry(action: "list")
   // status should be "ACTIVE"
   \`\`\`

2. **Verify category**:
   \`\`\`javascript
   services(action: "discover", { category: "data-services" })
   // Your service should appear
   \`\`\`

3. **Check approval** (high-risk categories):
   - Security, payment, medical, government categories require admin approval
   - Contact: steve.terry@paichart.com

---

### Service Call Returns 404

**Cause**: Health check failed or endpoint unreachable

**Solution**:

1. **Test endpoint directly**:
   \`\`\`bash
   curl https://your-service.com/health
   # Should return: { "status": "healthy" }
   \`\`\`

2. **Check health via Hub**:
   \`\`\`javascript
   services(action: "health", {
     service_name: "my-weather-api",
     realtime: true  // Force fresh health check
   })
   \`\`\`

3. **If status is "ERROR"**:
   - Verify service is running
   - Check endpoint URL is correct
   - Ensure \`/health\` endpoint works

---

### Quality Grade Lower Than Expected

**Check which tools need schemas**:
\`\`\`javascript
registry(action: "tools", { service_name: "my-weather-api" })
\`\`\`

**Response shows**:
\`\`\`json
{
  "qualityAssessment": {
    "grade": "B",
    "toolsMissingSchemas": ["get_historical"],  // This tool needs schema!
    "message": "Some tools missing schemas - add inputSchema to upgrade to Grade A"
  }
}
\`\`\`

**Solution**: Add \`inputSchema\` to all tools

---

### Call Blocked by Compliance Policy

**Error**:
\`\`\`
Service call blocked by compliance policy: Tool 'delete_records' contains blocked pattern
\`\`\`

**Cause**: Tool name contains blocked patterns

**Blocked patterns**:
- System commands: \`sudo\`, \`rm\`, \`delete\`, \`drop\`, \`exec\`
- Network access: \`ssh\`, \`curl\`, \`shell\`, \`bash\`
- Database mods: \`insert\`, \`update\`, \`alter\`, \`grant\`

**Solution**: Rename tool
\`\`\`javascript
❌ tools: ["delete_records"]  // Contains "delete"

✅ tools: ["remove_records"]  // "remove" is OK
✅ tools: ["clear_cache"]     // Alternative
\`\`\`

**See full list**: [F] **ABOUT-security-policy** → Section B: Blocked Patterns

---

## 📚 Best Practices Summary

### Registration

1. ✅ **Start with basic registration** - Get it working first (Grade C)
2. ✅ **Add full schemas** - Upgrade to Grade A for best integration
3. ✅ **Test privately first** - Use OWNER trust before going public
4. ✅ **Configure rate limits** - Protect your service from abuse
5. ✅ **Verify with token-validator** - Test token authentication works

---

### Tool Naming

1. ✅ **Use snake_case** - \`get_weather\`, \`send_notification\`
2. ✅ **Be descriptive** - \`analyze_sentiment\` not \`analyze\`
3. ✅ **Include verb** - \`create_\`, \`get_\`, \`update_\`, \`delete_\`, \`list_\`
4. ✅ **Avoid blocked patterns** - No \`exec\`, \`shell\`, \`delete\`, \`drop\`

---

### Schemas

1. ✅ **Add descriptions** - AI uses these to understand parameters
2. ✅ **Use enums** - For dropdown choices (priority, format, etc.)
3. ✅ **Set defaults** - Makes parameters optional with sensible defaults
4. ✅ **Add constraints** - minimum/maximum for numbers, minLength/maxLength for strings
5. ✅ **Mark required fields** - Use \`required: ["field1", "field2"]\`

---

### Access Control

1. ✅ **Start private** - Test with OWNER trust first
2. ✅ **Make public cautiously** - Verify security before opening access
3. ✅ **Set rate limits** - Start conservative, increase if needed
4. ✅ **Monitor health** - Check regularly with \`services(action: 'health')\`

---

## 🎓 Next Steps

**Your service is registered!** What's next?

### For Developers

**Secure your service**:
- [E] **HOWTO-validate-jwt-tokens** - JWKS validation, Component 5, RS256 tokens
- [G] **ABOUT-trust-levels** - Understand when you receive tokens

**Build workflows**:
- [I] **HOWTO-use-workflows** - Multi-service orchestration

**Understand security**:
- [F] **ABOUT-security-policy** - Compliance, blocked patterns, safeguards

---

### Try It Now

**Open ChatGPT or Claude Desktop** and say:
> "Find weather services and get the forecast for Sydney"

**AI will**:
1. Discover your service (capability: weather)
2. Call \`get_forecast({ location: "Sydney" })\`
3. Return results to user

**No service name needed** - AI discovers by capability!

---

## 📖 Quick Reference

### Registration Commands

\`\`\`javascript
// Basic registration
registry(action: "register", {
  name: "my-service",
  description: "What it does (10-500 chars)",
  endpoint: "https://api.myservice.com/mcp",
  category: "data-services"
})

// Add tools (upgrade to Grade A)
registry(action: "update", {
  service_name: "my-service",
  updates: {
    capabilities: {
      tools: [
        {
          name: "tool_name",
          description: "What it does",
          inputSchema: { type: "object", properties: {...}, required: [...] }
        }
      ]
    }
  }
})

// Configure access
registry(action: "update", {
  service_name: "my-service",
  updates: {
    permissions: { publicAccess: true },
    rateLimit: { requests: 100, windowMs: 60000 },
    maxExecutionTime: 30000,
    healthCheckPath: "/health"
  }
})
\`\`\`

---

### Verification Commands

\`\`\`javascript
// Check your services
registry(action: "list")

// Check discovery
services(action: "discover", { category: "data-services" })

// Check quality grade
registry(action: "tools", { service_name: "my-service" })

// Check health
services(action: "health", { service_name: "my-service" })

// Test service call
services(action: "call", {
  targetService: "my-service",
  tool: "my_tool",
  arguments: {...}
})

// Test token auth
services(action: "workflow.execute", {
  steps: [{ service: "test-auth-service", tool: "verify_auth" }]
})
\`\`\`

---

### Quality Grades

| Grade | Criteria | Action |
|-------|----------|--------|
| **A** | All tools have schemas | ✅ Perfect! |
| **B** | Some tools have schemas | Add schemas to remaining tools |
| **C** | Tool names only | Add full tool definitions |
| **D** | No tools | Add tools to enable AI interaction |

---

### Categories

| Category | Use For | Auto-Approved? |
|----------|---------|----------------|
| \`ai-intelligence\` | AI/ML, inference | ✅ Yes |
| \`data-services\` | APIs, databases | ✅ Yes |
| \`automation\` | Browser, workflows | ✅ Yes |
| \`monitoring\` | Logging, alerts | ✅ Yes |
| \`communication\` | Email, SMS, Slack | ✅ Yes |
| \`security\` | Auth, encryption | ⚠️ Requires approval |

---

## 💬 Support

**Registration Help**: steve.terry@paichart.com
**Documentation**: https://paichart.app/docs
**API Status**: https://paichart.app/status

---

**Version**: 1.0 | **Created**: 2026-02-02 | **Status**: Production-Ready
**Target Time**: 15-20 minutes | **Quality Goal**: Grade A`,
  },
  {
    name: 'HOWTO-use-workflows',
    description: "Master multi-service workflows: sequential, parallel, and conditional execution",
    category: AgentCategory.DOCUMENTATION,
    useCase: "Variable chaining, proven patterns, and troubleshooting",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:general'],
    version: "2.0.0", // 2026-07-09: v2 rewrite (Claude Desktop collab) — Quick Start (single call before first workflow), Retry & Resilience, 4-step consumer path, timeout-ambiguity flagged, bug fixes (totalCount->total, completionNotes->completionNote). Schema claims verified live. Removed broken interactive-builder prompt ref (x3). // 2026-07-08: Section 0.
    variables: {} as any,
    examples: {} as any,
    promptText: `# MCP Hub Workflow Orchestration Guide

> **Master multi-service workflows: sequential, parallel, and conditional execution.** Variable chaining, retry & resilience, proven patterns, and troubleshooting.

---

## ⚡ Quick Start (5 minutes)

### First, one service call — the atom of everything here

Before any workflow, understand the single call. \`services(action: "call")\` executes one tool on one service through the Hub:

\`\`\`javascript
services({ action: "call",
  targetService: "weather-service",       // which service (from discover)
  tool: "current_weather",                // which tool on that service (from registry(tools))
  arguments: { location: "Sydney,AU", units: "metric" }   // that tool's parameters, per its inputSchema
})
\`\`\`

Three things to notice: \`targetService\` names the service, \`tool\` names the operation on it, and \`arguments\` must match that tool's own schema (not pAIchart's) — which is why the consumer path below inspects schemas with \`registry(tools)\` before calling. The Hub brokers the call, applies the service's timeout/rate-limit config, and returns the tool's result. If a single call works, you're ready to chain calls.

### Then, your first workflow — calls chained together

A **workflow is just a series of service calls** (steps) executed by the Hub as one unit — with ordering, output-passing, retries, and a failure policy you'd otherwise hand-roll. The smallest useful one: two steps, one service, output of step 0 feeding step 1.

\`\`\`javascript
services({ action: "workflow.execute",
  executionMode: "sequential",
  steps: [
    { service: "paichart-project-service", tool: "project",
      arguments: { action: "pov.list", status: "IN_PROGRESS", limit: 1 } },
    { service: "paichart-project-service", tool: "project",
      arguments: { action: "task.list", povId: "{{step.0.output.data[0].id}}", status: "OPEN", limit: 3 },
      dependsOn: [0] }
  ]
})
\`\`\`

Each step object is essentially the same shape as a single \`call\` (service + tool + arguments — note the step field is \`service\` where the standalone call uses \`targetService\`), plus workflow-only fields: \`dependsOn\`, \`retries\`, \`retryDelay\`, and per-step \`timeout\`.

✅ **Verified live**: COMPLETED, 2/2 steps, 252ms. Step 1 received the real POV CUID resolved from step 0's output. The response includes \`executionId\` (for \`workflow.status\`), a \`summary\` (totalSteps/completed/failed/mode/services), and per-step \`stepResults\` each carrying \`success\`, \`data\`, \`executionTime\`, and \`attempts\`.

That's the whole model: **steps** call **tools** on **services**; **variable chaining** wires outputs to inputs; an **execution mode** and a **failure strategy** govern the run.

### Call vs workflow — when to use which

Direct calls are really good: for one operation against a public-access service, \`services(call)\` is the fastest path — no step array, no orchestration overhead. Reach for \`workflow.execute\` when you need any of:

- **Two or more operations that belong together** — ordering, output chaining, a shared failure policy, one audit record
- **Identity forwarding (JWKS token passing)** — **only workflows carry your authenticated identity to the target service.** A workflow execution can pass a Hub-signed JWT (validated by the service via JWKS) so the service knows *who* is calling, at what trust level (OWNER / TEAM_MEMBER / SCOPED / ANONYMOUS), and can keep user-scoped audit trails. Direct \`services(call)\` does not forward your identity this way. Attach POV context with the \`povId\` parameter on \`workflow.execute\` — trust level depends on your team membership in that POV.
  - ✅ **Live example**: the registered \`snowflake-service\` states it outright — "Calls require workflow.execute with a povId where the caller has team membership for identity forwarding." A direct \`call\` to a service like this won't authenticate; even a **single-step workflow** is the right shape when the service needs to know who you are.
  - Deep dives: \`ABOUT-trust-levels\` (the 4 trust levels and when tokens are issued) and \`HOWTO-validate-jwt-tokens\` (validating them in your own service). Try it live: \`services({ action: "workflow.execute", workflowName: "trust-level-basic-demo" })\`.

Rule of thumb: **anonymous data in, one shot → \`call\`; identity, ordering, or chaining → \`workflow.execute\`** (even for a single step, if the service demands a token).

Read on for each piece — or just try a pre-built workflow first.

---

## 🎁 Pre-Built Named Workflows (try these first)

| Workflow | Purpose | Measured time | Mode |
|----------|---------|------|------|
| **trust-level-basic-demo** | Learn trust levels & token passing | ~10s | Sequential |
| **jwks-validation-advanced-demo** | Get code examples (TS, JS, Python) | ~15s | Parallel |
| **token-troubleshooting-demo** | Debug trust level issues | ~20s | Sequential |
| **daily-energy-weather** | Multi-service: TX grid mix + capacity + Austin weather & forecast | **~4.5s** ✅ measured (was listed "<1s") | Sequential |

\`\`\`javascript
services({ action: "workflow.execute", workflowName: "daily-energy-weather" })
\`\`\`

✅ **Verified live**: \`daily-energy-weather\` ran 4/4 steps COMPLETED across eia-service + weather-service in 4,496ms. External API steps dominate the runtime (1.7–1.8s each for EIA; 0.1–0.6s for weather) — expect seconds, not sub-second, for anything calling external services.

---

## Section 0: The Consumer Path — 4 steps, not 3

Before chaining services into a workflow, find them, **learn their schemas**, and confirm they respond. (To register your OWN service, see \`HOWTO-register-service\`.)

\`\`\`
[1] DISCOVER ──▶ [2] INSPECT SCHEMAS ──▶ [3] HEALTH ──▶ [4] CALL / EXECUTE
    services(discover)   registry(tools)      services(health)   services(call / workflow.execute)
\`\`\`

### 1. Discover — by capability, not name
\`\`\`javascript
services({ action: "discover", capability: "monitoring" })   // or: category, or nothing for all
\`\`\`
Returns matching services with IDs, tool NAME lists, and a per-service \`_schemaInfo\` tool count (2026-08-21: discover is lean by default — full tool descriptions + schemas come from step 2, or pass \`includeSchemas: true\`).

### 2. Inspect tool schemas — the step v1 omitted
**Never call a service without checking its schema first** — parameter names are service-specific and guessing causes avoidable errors. ✅ Verified live: the platform's own \`discover\` output now says exactly this in its \`nextSteps\`.
\`\`\`javascript
registry({ action: "tools", service_name: "weather-service" })
\`\`\`
Returns each tool's full \`inputSchema\` (required fields, enums, defaults) plus a schema-quality grade. Example: \`current_weather\` requires \`location\` (string, "City,CC") with optional \`units: "metric"|"imperial"\` — if you'd guessed \`city\` or \`units: "C"\`, the call would fail.

### 3. Health — with a live probe
\`\`\`javascript
services({ action: "health", service_name: "weather-service", realtime: true })
\`\`\`
\`realtime: true\` (default false, undocumented in v1) performs a live HTTP probe in addition to returning stored metrics. ✅ Verified live: returned stored stats (3.2ms avg, 99.9% success) plus a realtime block (7ms latency, HTTP 200) and a \`recommendation: "use"\`.

### 4. Call once directly, then orchestrate
\`\`\`javascript
services({ action: "call", targetService: "weather-service", tool: "current_weather",
           arguments: { location: "Sydney,AU", units: "metric" } })
\`\`\`
Confirm one call works before wiring it into a multi-step workflow. Note: if the service requires your authenticated identity (JWKS token validation — e.g. \`snowflake-service\`), test with a **single-step \`workflow.execute\` + \`povId\`** instead, since direct calls don't forward identity (see "Call vs workflow" above).

**Consumer checklist**: ☐ discovered ☐ schemas inspected ☐ health verified ☐ single call tested ☐ then \`workflow.execute\`.

---

## Section B: 3 Execution Modes

### Mode 1: Sequential (default)
Steps run in order; each may use previous outputs.
\`\`\`javascript
services({ action: "workflow.execute", executionMode: "sequential",
  steps: [
    { service: "data-source", tool: "fetch" },
    { service: "transformer", tool: "process", dependsOn: [0] },
    { service: "storage", tool: "save", dependsOn: [1] }
  ]})
\`\`\`
Use for: data pipelines, transactions, variable chaining.

### Mode 2: Parallel
Independent steps run simultaneously (max 5 concurrent). \`dependsOn\` still creates smart ordering within parallel mode — steps without dependencies start together; dependent steps wait.
\`\`\`javascript
services({ action: "workflow.execute", executionMode: "parallel",
  steps: [
    { service: "weather-service", tool: "current_weather", arguments: { location: "NYC,US" } },
    { service: "weather-service", tool: "current_weather", arguments: { location: "London,UK" } },
    { service: "weather-service", tool: "current_weather", arguments: { location: "Tokyo,JP" } }
  ]})
\`\`\`
Use for: multi-location fetches, broadcast notifications, independent health checks.

### Mode 3: Conditional (if/then/else)
- **Step 0** always executes — it is the condition check
- Step 0 succeeds **with truthy data** → step 1 ("then") runs, step 2 skipped
- Step 0 fails or returns no data → step 1 skipped, step 2 ("else") runs (step 2 optional)
- Condition logic: \`step0.success && step0.data\`

Limitations: exactly 3 steps max, binary branching only, no custom condition expressions. The "then" branch can variable-chain from step 0; the "else" branch should not (step 0's output may be unreliable).

Use for: conditional alerts, graceful degradation, gate checks.

---

## Section C: Variable Chaining

Reference previous step outputs with \`{{step.N.output...}}\`:
\`\`\`javascript
{{step.0.output}}                  // entire output of step 0
{{step.0.output.data[0].id}}      // nested field (array index + property)
{{step.0.output.total}}           // top-level count field — see fix below
{{step.0.data[0].id}}             // shorthand (path normalization: 'output' optional)
\`\`\`

### The \`data[N]\` wrapper rule — verified, with one fix
All pAIchart list operations return a consistent wrapper:
\`\`\`javascript
{ data: [...], total: N }    // ✅ verified live — this exact shape
\`\`\`
- ✅ **CORRECT**: \`{{step.0.output.data[0].id}}\` — works for POVs, tasks, services alike
- ❌ **WRONG**: \`{{step.0.output.povs[0].id}}\` / \`{{step.0.output.tasks[0].id}}\` — entity-named fields don't exist
- ❌ **WRONG (v1 bug, fixed here)**: \`{{step.0.output.totalCount}}\` — v1's own first example used this, but ✅ the live response field is **\`total\`**, not \`totalCount\`. Use \`{{step.0.output.total}}\`.

✅ **Verified live**: the Quick Start workflow above chained \`{{step.0.output.data[0].id}}\` into step 1's \`povId\` successfully; step 0's raw output was \`{ data: [ { id: "cmque2dhq…", … } ], total: 1 }\`.

**Debug tip**: run step 0 alone (via \`services(call)\`) and inspect the real response shape before writing chain expressions. Chained references only see *structured* outputs — chain from \`project(action: "task.list")\` (structured), not \`project(action: "task.context")\` (formatted text).

---

## Section R: Retry & Resilience (schema-verified)

The steps schema carries retry controls:

| Parameter | Level | Range | Default | What it does |
|-----------|-------|-------|---------|--------------|
| \`retries\` | per-step | 0–5 | — | how many times to re-attempt this step on failure |
| \`retryDelay\` | per-step | 1,000–30,000 ms | — | wait between attempts (back off transient failures) |
| \`maxTotalRetries\` | workflow | 0–20 | 10 | global retry budget across ALL steps |

\`\`\`javascript
services({ action: "workflow.execute", executionMode: "sequential",
  maxTotalRetries: 6,
  steps: [
    { service: "weather-service", tool: "current_weather",
      arguments: { location: "Sydney,AU" },
      retries: 3, retryDelay: 2000 }
  ]})
\`\`\`

✅ **Verified live**: every \`stepResults\` entry reports an \`attempts\` count — the retry machinery is real and observable per step.

Rules of thumb: use per-step \`retries\` for transient failures (rate limits, network blips); keep \`maxTotalRetries\` bounded to prevent retry storms in large workflows; when retries are exhausted, \`failureStrategy\` decides what happens next.

> ⚠️ **Unverified semantics**: exactly how retries interact with timeouts (whether retry attempts consume the workflow's time budget) and the per-step defaults when omitted have not been confirmed against the engine — verify with the platform team before relying on them in production.

---

## Section T: Timeout Semantics — known ambiguity, flagged

Two sources disagree, so this guide states both rather than guessing:

- **v1 doc claims**: global workflow timeout 10 min (600,000 ms) default-if-unset 1 min; per-step timeout 1–60 s; and its own Pattern 3 sets per-step \`timeout: 60000\` / \`120000\` plus a workflow-level \`timeout: 180000\`.
- **Live \`services\` schema says**: \`timeout\` is a "per-call timeout in ms (1000–300000), clamped to 300000ms; overrides the service's configured ceiling for this call."

What's safe to rely on today: a workflow-level \`timeout\` parameter is accepted, per-step \`timeout\` appears in the step objects, and the schema clamps at 300,000 ms. **Which value governs when they conflict — and whether the 10-minute global ceiling still exists — needs platform verification.** Until then: set the workflow \`timeout\` conservatively (≈2× expected duration, ≤300,000 ms), give slow steps (PDF generation 60–120s, screenshots 30–60s, scraping 30–90s) explicit per-step timeouts, and watch for \`TIMEOUT\` status in \`workflow.status\`.

---

## Section D: 7 Proven Patterns (corrected)

The seven canonical patterns — with two field-name fixes:

1. **POV Status Report** — \`pov.list\` → \`pov.details\` (chained povId) → email. *(Fix: any \`totalCount\` reference → \`total\`.)*
2. **Blocked Task Escalation** — \`task.list status: "BLOCKED"\` → \`escalate\` with a timed channel chain; \`failureStrategy: "continue"\` so the alert best-efforts through channel failures. *(Fix: body text \`{{step.0.output.total}}\`.)*
3. **Screenshot Documentation** — \`take_screenshot\` → \`generate_pdf\`, sequential to avoid resource contention, extended per-step timeouts (60–120s).
4. **Competitor Price Monitor** — \`scrape_page\` with CSS selectors → Slack notify.
5. **Task Completion Notify** — \`task.list\` → \`task.context\` → \`perform(task.complete)\` → \`broadcast\`. *(Fix: the completion parameter is \`completionNote\`, singular — v1 wrote \`completionNotes\`. Also note task status is a state machine: OPEN → COMPLETED directly is rejected; the task must be IN_PROGRESS first.)*
6. **Weekly POV Digest** — three parallel \`pov.list\` calls (steps 0–2), screenshot \`dependsOn: [0,1,2]\`, email \`dependsOn: [3]\` — smart parallelism via dependsOn inside parallel mode.
7. **Error Monitoring Alert** — monitoring service → issue tracker → pager, sequential.

---

## Section E: Failure Strategies

| Strategy | Behavior | Use when |
|----------|----------|----------|
| \`stop\` (default) | halt immediately on first failure | dependent steps — continuing makes no sense |
| \`continue\` | execute all steps, record failures | independent steps, best-effort delivery (notifications) |
| \`rollback\` | **currently identical to \`stop\`** — halts immediately; undo of completed steps is not yet implemented | transaction-like workflows (future) |

The honest prerequisites for real rollback: accurate failure detection (fixed Mar 2026), action identity capture, a compensating-action registry (e.g. \`task.complete\` → \`task.reopen\`), structured partial-failure context, and idempotent undo. Until those land, treat \`rollback\` as \`stop\`.

---

## Section F: Monitoring & Governance

### Status
\`\`\`javascript
services({ action: "workflow.status", executionId: "cmrcyb9d4000lyxfy20i6iqjj" })
\`\`\`
✅ **Verified live** — returns \`status\`, \`progress\` ("2/2 steps"), \`startTime\`/\`endTime\`, \`duration\` (ms), \`error\`, and \`failedStep\`. Status values: \`RUNNING | COMPLETED | FAILED | CANCELLED | TIMEOUT\`.

### History
\`\`\`javascript
services({ action: "workflow.list", status: "COMPLETED", limit: 20 })
\`\`\`
✅ **Verified live** — returns executions with an undocumented-but-useful **\`workflowType\`** discriminator (\`named_workflow\` for pre-built runs, \`mcp_service_orchestration\` for custom step arrays, \`analytics\` for analytics operations — yes, analytics calls appear in this same audit trail), an optional \`povId\` linking the execution to a POV, and \`pagination\` (\`total\`, \`limit\`, \`offset\`, \`hasMore\`).

### Cancel
\`\`\`javascript
services({ action: "workflow.cancel", executionId: "...", reason: "User requested cancellation" })
\`\`\`
When: taking too long, misconfigured steps, or the target service is down.

---

## Section G: Limits

| Limit | Value | Verified? |
|-------|-------|-----------|
| Max steps | 20 | ✅ schema (\`maxItems: 20\`) |
| Max parallel steps | 5 | v1 claim (not schema-visible) |
| Max call depth | 3 | v1 claim (not schema-visible) |
| Per-step retries | 0–5 | ✅ schema |
| Retry delay | 1,000–30,000 ms | ✅ schema |
| Workflow retry budget | \`maxTotalRetries\` 0–20 (default 10) | ✅ schema |
| \`timeout\` clamp | 300,000 ms (5 min) | ✅ schema — see Section T for the ambiguity vs v1's 10-min global claim |

---

## Section H: Troubleshooting

**"Variable resolution failed"** — invalid path. Most common causes: entity-named fields (\`povs[0]\` → use \`data[0]\`) and the v1 example bug (\`totalCount\` → use \`total\`). Debug by running step 0 alone and inspecting the real shape.

**"Service not found"** — typo or unregistered. \`services(discover)\` to list; names are case-sensitive.

**"Service not reachable"** — check \`services(health, realtime: true)\`; if the realtime probe fails, wait or use \`failureStrategy: "continue"\` to skip.

**"step.N does not exist"** — steps are 0-indexed; reference only defined indices.

**"Circular dependency detected"** — \`dependsOn\` forms a loop; break the cycle.

**"Timeout exceeded"** — raise the workflow \`timeout\` (≤300,000 ms), give slow steps explicit per-step timeouts, or split the workflow.

**Parameter mismatch on a service call** — you skipped consumer-path step 2. \`registry(tools)\` gives the exact \`inputSchema\`; guessing \`city\` when the schema says \`location\` fails every time.

**Retry exhaustion** — if per-step \`retries\` sum past \`maxTotalRetries\`, the budget wins and later steps get fewer attempts than configured. Check \`attempts\` in \`stepResults\`.

---

## 🚀 Best Practices

Design: start with 2–3 steps; choose sequential for dependent work, parallel for independent; give slow operations explicit timeouts. Consumer path: never skip \`registry(tools)\` — schema inspection prevents the most common workflow failure class. Chaining: always \`data[N]\` and \`total\`; test step outputs individually; chain from structured list actions, not text-returning context actions. Resilience: per-step \`retries\` for transient failures, \`continue\` for best-effort fan-outs, bounded \`maxTotalRetries\`; treat \`rollback\` as \`stop\` until undo ships. Monitoring: check \`executionTime\` and per-step \`attempts\` in every response; use \`workflow.list\` as your audit trail.

---

## 📚 Related Documentation

- **HOWTO-mcp-tools** — the \`entity(action: "verb")\` surface and the tools-depend-on-tools context rules behind everything here
- **HOWTO-register-service** — register your own service (the producer path)
- **HOWTO-run-an-agent** / **HOWTO-use-pipeline-harness** — agent and pipeline execution
- **HOWTO-validate-jwt-tokens** / **ABOUT-trust-levels** / **ABOUT-security-policy** — auth, tokens, and limits

---

**Version**: 2.0 | **Updated**: 2026-07-09 | **Status**: Production-ready with two items flagged for platform verification (timeout precedence; retry/timeout interaction)
**Verification**: live runs 2026-07-09 — \`daily-energy-weather\` (4/4, 4.5s) and a custom variable-chained workflow (2/2, 252ms, chain resolution confirmed)`,
  },
  {
    name: 'HOWTO-validate-jwt-tokens',
    description: "Validate pAIchart JWT tokens in your external MCP service",
    category: AgentCategory.DOCUMENTATION,
    useCase: "JWKS validation, RS256 tokens, Component 5, and security best practices",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:general'],
    version: "1.0.0",
    variables: {} as any,
    examples: {} as any,
    promptText: `# External Service Authentication

> **Validate pAIchart JWT tokens in your external MCP service**
>
> JWKS validation, RS256 tokens, Component 5, and security best practices

---

## 🎯 Quick Navigation

**What do you need?**

- **[A] Quick start** → See 3-Step Integration
- **[B] Understand JWKS** → See What is JWKS?
- **[C] Component 5** → See Audience-Based Isolation
- **[D] Code examples** → See Implementation Examples
- **[E] Test integration** → See token-validator Service
- **[F] Troubleshooting** → See Common Validation Errors

---

## 🔐 What You'll Learn

By the end of this guide, you'll understand:
- ✅ How to validate pAIchart JWT tokens using JWKS
- ✅ What Component 5 is (audience-based isolation)
- ✅ Why RS256 is secure (no shared secrets)
- ✅ How to implement validation in TypeScript/JavaScript/Python
- ✅ How to test with token-validator service

**Time**: 20-30 minutes

---

## Section A: 3-Step Integration (Quick Start)

### Step 1: Install JWT Library

**TypeScript/JavaScript** (recommended):
\`\`\`bash
npm install jose
\`\`\`

**Python**:
\`\`\`bash
pip install pyjwt cryptography
\`\`\`

---

### Step 2: Validate Tokens via JWKS

**TypeScript/JavaScript**:
\`\`\`typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

// pAIchart JWKS endpoint - fetches public key automatically
const PAICHART_JWKS = createRemoteJWKSet(
  new URL('https://paichart.app/api/auth/jwks')
);

async function validatePAIchartToken(token: string) {
  try {
    // U2 Audience-Tightening (RFC 8707, 2026-05-19): the Hub now mints
    // PER-SERVICE audiences (e.g., https://paichart.app/mcp/<your-service-slug>).
    // Replace <your-service-slug> with your service's normalized name —
    // the value passed at service registration. The 2 legacy generic audiences
    // remain accepted during the 1-week overlap window; drop them once the
    // Hub stops minting generic.
    const { payload } = await jwtVerify(token, PAICHART_JWKS, {
      issuer: 'https://paichart.app',
      audience: [
        'https://paichart.app/api',                       // legacy (overlap)
        'https://paichart.app/mcp',                       // legacy (overlap)
        'https://paichart.app/mcp/<your-service-slug>'    // per-service (RFC 8707)
      ]
    });

    return {
      valid: true,
      userId: payload.sub,
      email: payload.email,
      role: payload.role
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
\`\`\`

**Python**:
\`\`\`python
import jwt
import requests
from cryptography.hazmat.primitives import serialization

def validate_paichart_token(token: str):
    try:
        # Fetch JWKS
        jwks_url = 'https://paichart.app/api/auth/jwks'
        jwks = requests.get(jwks_url).json()

        # Decode header to get key ID
        header = jwt.get_unverified_header(token)
        kid = header['kid']

        # Find matching public key
        key = next((k for k in jwks['keys'] if k['kid'] == kid), None)
        if not key:
            return {'valid': False, 'error': 'Public key not found'}

        # Convert JWK to PEM
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)

        # Verify token
        # U2 Audience-Tightening (RFC 8707, 2026-05-19): the Hub now mints
        # PER-SERVICE audiences (e.g., https://paichart.app/mcp/<your-service-slug>).
        # Replace <your-service-slug> with your service's normalized name.
        # The 2 legacy generic audiences remain accepted during the overlap.
        payload = jwt.decode(
            token,
            public_key,
            algorithms=['RS256'],
            issuer='https://paichart.app',
            audience=[
                'https://paichart.app/api',                       # legacy (overlap)
                'https://paichart.app/mcp',                       # legacy (overlap)
                'https://paichart.app/mcp/<your-service-slug>'    # per-service (RFC 8707)
            ]
        )

        return {
            'valid': True,
            'userId': payload['sub'],
            'email': payload['email'],
            'role': payload['role']
        }
    except Exception as e:
        return {'valid': False, 'error': str(e)}
\`\`\`

---

### 💡 Quick Start: Get Working Code Examples

**Want to see all 3 language implementations at once?**

Run this workflow to get TypeScript, JavaScript, AND Python examples in parallel (15 seconds):

\`\`\`javascript
services(action: "workflow.execute", workflowName: "jwks-validation-advanced-demo")
\`\`\`

**Returns**: Complete working code for all 3 languages + validation results + performance metrics

---

### Step 3: Use in Your Tool Handler

**TypeScript**:
\`\`\`typescript
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const context = args._context;

  // Validate token
  if (!context?.token) {
    return {
      content: [{ type: 'text', text: 'Authentication required' }],
      isError: true
    };
  }

  const auth = await validatePAIchartToken(context.token);
  if (!auth.valid) {
    return {
      content: [{ type: 'text', text: \`Invalid token: \${auth.error}\` }],
      isError: true
    };
  }

  // Now you have verified user identity!
  console.log(\`Request from \${auth.email} (\${auth.role})\`);

  // Implement your business logic
  const results = await yourBusinessLogic(args, auth);
  return { content: [{ type: 'text', text: JSON.stringify(results) }] };
});
\`\`\`

**✅ Done!** Your service now validates pAIchart tokens securely.

---

## Section B: What is JWKS?

### JWKS Explained

**JWKS** = JSON Web Key Set

**Purpose**: Distribute public keys for JWT validation

**How it works**:
\`\`\`
Your Service                    pAIchart Hub
     │                                │
     │  1. GET /api/auth/jwks        │
     ├───────────────────────────────>│
     │                                │
     │  2. Public key JSON            │
     │<───────────────────────────────┤
     │                                │
     │  3. Verify JWT signature       │
     │     using public key           │
     │                                │
     ✅ Token valid!                  │
\`\`\`

**Benefits**:
- ✅ **No shared secrets** - public key can't sign new tokens
- ✅ **Automatic rotation** - JWKS endpoint updates during key rotation
- ✅ **Industry standard** - OAuth 2.0, OpenID Connect
- ✅ **Secure** - private key never leaves pAIchart infrastructure

---

### JWKS Endpoint Details

**URL**: \`GET https://paichart.app/api/auth/jwks\`

**Response**:
\`\`\`json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "paichart-2026-01",
      "use": "sig",
      "alg": "RS256",
      "n": "xGOz...",  // Public key modulus
      "e": "AQAB"     // Public key exponent
    }
  ]
}
\`\`\`

**Cache headers**:
- \`Cache-Control: public, max-age=86400\` (24 hours)
- \`Expires\`: 24 hours from request

**Security features**:
- Rate limited (100 requests/minute per IP)
- Filters expired keys automatically
- Multi-key support (during rotation)
- Empty array prevention

**Validation time**: ~34ms (including network fetch)

---

### RS256 vs HS256

**RS256** (Asymmetric - used by pAIchart):
- ✅ Public key validates, private key signs
- ✅ No shared secrets
- ✅ External services can validate but not mint tokens
- ✅ Industry standard for distributed systems

**HS256** (Symmetric - deprecated for external use):
- ❌ Same secret signs and validates
- ❌ Sharing secret enables token minting
- ❌ Security risk if leaked
- ⚠️ Only used for legacy API keys (sunset Jul 5, 2026)

**Why RS256**: External services shouldn't be able to mint new tokens (only validate existing ones).

---

## Section C: Component 5 - Audience-Based Isolation

### What is Component 5?

**Component 5** = Resource-specific token audiences (RFC 8707)

**Security boundary**: Tokens are scoped to specific resources to prevent reuse attacks.

**U2 Audience-Tightening (2026-05-19)**: per-service audiences extend Component 5
beyond the 2 generic audiences below — every external service registered with
the Hub now gets its own audience URI for cross-service blast-radius isolation.

**Audiences**:

| Audience | Purpose | Algorithm | Status |
|----------|---------|-----------|--------|
| \`https://paichart.app/mcp/<your-service-slug>\` | Per-service (RFC 8707) — minted for tokens forwarded to your service | RS256 | ✅ Active (U2 — primary) |
| \`https://paichart.app/api\` | Web/API operations (legacy generic; still minted for internal /api/* calls) | RS256 | ✅ Active (overlap) |
| \`https://paichart.app/mcp\` | MCP front-door inbound (legacy generic; still minted for OAuth callbacks) | RS256 + HS256 | ✅ Active (overlap) |
| \`paichart-api\` | Legacy Web tokens | RS256 | ⚠️ Deprecated (sunset Jul 5, 2026) |
| \`paichart-app\` | Legacy API keys | HS256 | ⚠️ Deprecated (sunset Jul 5, 2026) |

**Convention**: \`<your-service-slug>\` is your service's normalized name —
NFKD-normalized lowercase with non-alphanumeric chars replaced by dashes
(e.g., "Snowflake Service" → \`snowflake-service\`). The exact value is set
at service registration and stored in the Hub's MCPTool configuration.

---

### Attack Scenario Prevented

**Before Component 5** (no audience validation):
\`\`\`
1. Attacker steals MCP token from external service
2. Reuses token to access Web/API endpoints
3. Gains unauthorized access to user data
\`\`\`

**After Component 5** (audience-based isolation):
\`\`\`
1. Attacker steals MCP token (aud: https://paichart.app/mcp)
2. Attempts to access Web/API endpoint (requires aud: https://paichart.app/api)
3. Token rejected: Audience mismatch ✅
\`\`\`

---

### How to Validate (Component 5 + U2 per-service)

**Accept your per-service audience PLUS the 2 legacy generic audiences during overlap**:

\`\`\`typescript
await jwtVerify(token, JWKS, {
  issuer: 'https://paichart.app',
  audience: [
    'https://paichart.app/mcp/<your-service-slug>',   // per-service (RFC 8707) — primary
    'https://paichart.app/api',                       // legacy (overlap window)
    'https://paichart.app/mcp'                        // legacy (overlap window)
  ]
});
\`\`\`

**Why include your per-service audience** (NEW for U2):
- The Hub now mints \`aud: https://paichart.app/mcp/<your-service-slug>\` for every per-call token forwarded to your service. Reject this and ALL workflow steps targeting you fail with "unexpected aud claim value".
- Per-service audiences mean a stolen token at Service A cannot replay at Service B — RFC 8707 blast-radius isolation.

**Why also accept legacy generic audiences** (during overlap):
- Older clients may still hold tokens minted with the generic \`/mcp\` or \`/api\` audience until they refresh
- Service registrations done before U2 (2026-05-19) may still receive generic-audience tokens
- After T+1week monitoring shows zero generic-audience hits, narrow your accept-list to per-service only

**Security**: Token isolation prevents cross-resource AND cross-service reuse. A token minted for service X cannot validate at service Y, even if X and Y both accept legacy generic audiences.

**Best practice — env-var-driven accept-list**:

Hardcoding audiences means future audience-scheme changes require code edits across every service. Better:

\`\`\`typescript
const ISSUER = process.env.PAICHART_ISSUER || 'https://paichart.app';
const PER_SERVICE_AUD = process.env.PAICHART_PER_SERVICE_AUDIENCE
  || \`\${ISSUER}/mcp/<your-service-slug>\`;
const LEGACY_AUDS = (process.env.PAICHART_LEGACY_AUDIENCES
  || \`\${ISSUER}/api,\${ISSUER}/mcp\`).split(',').map(s => s.trim());

await jwtVerify(token, JWKS, {
  issuer: ISSUER,
  audience: [PER_SERVICE_AUD, ...LEGACY_AUDS]
});
\`\`\`

Then narrow your accept-list by setting \`PAICHART_LEGACY_AUDIENCES=\`\` (empty) in your service's env config — no rebuild needed.

---

### RFC Compliance

**Component 5 implements**:
- ✅ **RFC 8707**: Resource Indicators for OAuth 2.0
- ✅ **RFC 9068**: JWT Profile for OAuth 2.0 (audience-restricted tokens)
- ✅ **OIDC Core 1.0**: Proper audience claim validation

**Validation Status**: ✅ Deployed Jan 30, 2026 (34ms JWKS validation, 100% success)

---

## Section D: Implementation Examples

### Complete Service Example (TypeScript)

\`\`\`typescript
// src/index.ts - Complete authenticated MCP service
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import express from 'express';

const app = express();
app.use(express.json());

// pAIchart JWKS for token validation
const PAICHART_JWKS = createRemoteJWKSet(
  new URL('https://paichart.app/api/auth/jwks')
);

// Validate pAIchart JWT
async function validateToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, PAICHART_JWKS, {
      issuer: 'https://paichart.app',
      audience: ['https://paichart.app/api', 'https://paichart.app/mcp']
    });
    return { valid: true, ...payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// MCP Server
const mcpServer = new Server(
  { name: 'my-analytics-service', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'analyze_data',
    description: 'Analyze project data (requires authentication)',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' }
      },
      required: ['projectId']
    }
  }]
}));

// Tool handler with authentication
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const context = args._context;

  // Step 1: Check for token
  if (!context?.token) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: 'Authentication required',
        hint: 'This service requires OWNER or TEAM_MEMBER trust level',
        trustLevel: context?.trustLevel || 'UNKNOWN'
      })}],
      isError: true
    };
  }

  // Step 2: Validate the token
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

  // Step 3: Log authenticated request
  console.log(\`[Auth] \${auth.email} (\${auth.role}) called \${name}\`);

  // Step 4: Implement business logic
  if (name === 'analyze_data') {
    const results = await yourAnalysisFunction(args.projectId, {
      userId: auth.sub,
      tenantId: context.tenantId,
      requestedBy: auth.email
    });

    return {
      content: [{ type: 'text', text: JSON.stringify({
        success: true,
        analyzedBy: auth.email,
        results
      })}]
    };
  }
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
  const transport = transports.get(req.query.sessionId) || [...transports.values()][0];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'healthy' }));

app.listen(3200, () => console.log('Service running on port 3200'));
\`\`\`

---

### Streamable HTTP Version

**For serverless/external deployments** (recommended):

\`\`\`typescript
// Streamable HTTP — the SDK transport owns request handling.
// Create the transport once and connect the server (stateless: sessionIdGenerator: undefined).
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
await mcpServer.connect(transport);

app.post('/mcp', (req, res) => {
  transport.handleRequest(req, res, req.body);
});
\`\`\`

**Register with**:
\`\`\`javascript
registry(action: "register", {
  endpoint: "https://your-service.com/mcp"  // Streamable HTTP
})
\`\`\`

---

### Python Example (Flask)

\`\`\`python
from flask import Flask, request, jsonify
import jwt
import requests

app = Flask(__name__)

# Fetch JWKS
def get_jwks():
    return requests.get('https://paichart.app/api/auth/jwks').json()

# Validate pAIchart token
def validate_token(token: str):
    try:
        jwks = get_jwks()
        header = jwt.get_unverified_header(token)
        kid = header['kid']

        # Find matching key
        key = next((k for k in jwks['keys'] if k['kid'] == kid), None)
        if not key:
            return {'valid': False, 'error': 'Key not found'}

        # Verify token
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=['RS256'],
            issuer='https://paichart.app',
            audience=['https://paichart.app/api', 'https://paichart.app/mcp']
        )

        return {
            'valid': True,
            'userId': payload['sub'],
            'email': payload['email'],
            'role': payload['role']
        }
    except Exception as e:
        return {'valid': False, 'error': str(e)}

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    context = data.get('_context', {})

    # Validate token
    if not context.get('token'):
        return jsonify({'error': 'Authentication required'}), 401

    auth = validate_token(context['token'])
    if not auth['valid']:
        return jsonify({'error': f"Invalid token: {auth['error']}"}), 401

    # Your business logic here
    results = perform_analysis(data, auth)
    return jsonify({'success': True, 'results': results})

if __name__ == '__main__':
    app.run(port=3200)
\`\`\`

---

## Section E: What Your Service Receives

### _context Object

**Every Hub call includes** \`_context\` in tool arguments:

\`\`\`typescript
{
  name: "analyze_project",
  arguments: {
    projectId: "proj-123",  // User's arguments

    // Automatically added by Hub
    _context: {
      userId: "clm8xyz123",        // pAIchart user ID (CUID)
      userEmail: "alice@acme.com", // User's email
      userRole: "ADMIN",           // USER, DEMO_USER, ADMIN, SUPER_ADMIN
      token: "eyJhbGci...",        // JWT (RS256) - if trust level allows
      povId: "clpov789",           // POV context (if POV-scoped)
      tenantId: "clpov789",        // Tenant ID (currently = povId)
      requestId: "uuid-v4",        // Request trace ID
      source: "mcp_hub_workflow",  // Origin identifier
      trustLevel: "TEAM_MEMBER"    // Trust level (helps debugging)
    }
  }
}
\`\`\`

---

### When You Receive Tokens

**Trust levels that receive tokens**:
- ✅ **INTERNAL** - pAIchart-* services (always get tokens)
- ✅ **TRUSTED** - Localhost Docker services
- ✅ **OWNER** - User calls their own registered service
- ✅ **TEAM_MEMBER** - Service owner is in POV team

**Trust levels that DON'T receive tokens**:
- ❌ **SCOPED** - Public service with POV context (only povId)
- ❌ **ANONYMOUS** - Public service, no POV (only userId)

**Check trustLevel field** to understand why you did/didn't receive a token.

**See full guide**: [G] **ABOUT-trust-levels** prompt

---

### JWT Token Claims

**Standard claims** (in every token):

\`\`\`typescript
{
  // User identity
  sub: "clm8xyz123",           // User ID (subject)
  userId: "clm8xyz123",        // Duplicate for convenience
  email: "alice@acme.com",     // User email
  role: "ADMIN",               // Platform role

  // Security
  iss: "https://paichart.app",           // Issuer (who minted token)
  aud: "https://paichart.app/mcp",       // Audience (which resource)

  // Timing
  iat: 1737008745,             // Issued at (Unix timestamp)
  exp: 1737012345,             // Expires at (Unix timestamp)

  // Key rotation
  kid: "paichart-2026-01"      // Key ID (in header, not payload)
}
\`\`\`

**Use in your service**:
\`\`\`typescript
const auth = await validateToken(context.token);

// User identity
console.log(\`User: \${auth.email}\`);
console.log(\`Role: \${auth.role}\`);

// Tenant context (from _context, not token)
console.log(\`Tenant: \${context.tenantId}\`);
console.log(\`POV: \${context.povId}\`);
\`\`\`

---

## Section F: First-Party Token Minting (Security Critical)

### Why pAIchart Mints Its Own Tokens

**The Problem**: OAuth Passthrough Attack

**Vulnerable pattern**:
\`\`\`javascript
// ❌ CRITICAL SECURITY HOLE
// User authenticates via GitHub OAuth
const githubToken = await exchangeCodeForToken(code);

// WRONG: Return GitHub's token directly
res.json({ access_token: githubToken.access_token });
\`\`\`

**Attack scenario**:
1. User authenticates via GitHub
2. Malicious external service receives GitHub token
3. Service uses token on GitHub API
4. Result: **Private repos cloned, malicious code pushed**

**Security Impact**: 0/10 (GitHub account compromise)

---

**Secure pattern** (pAIchart implementation):
\`\`\`javascript
// ✅ SECURE (First-party minting)
const githubUser = await authenticateWithGitHub(code);

// Mint OUR token (RS256 with pAIchart identity)
const mcpToken = mintToken({
  userId: user.id,
  email: user.email,
  role: user.role,
  audience: 'https://paichart.app/mcp'  // OUR resource
});

// Return OUR token (not GitHub's!)
res.json({ access_token: mcpToken });
\`\`\`

**Security Impact**: 95/100 (pAIchart-scoped, revocable, JWKS-validatable)

---

### Security Benefits

✅ **External services never receive OAuth provider tokens**
✅ **Token scope limited to pAIchart operations only**
✅ **No GitHub/Microsoft/Google account access possible**
✅ **First-party control over all token capabilities**

**Pattern**: See \`.claude/knowledge/patterns/oauth-token-minting-not-passthrough.md\` (Pattern #29)

---

## Section G: token-validator Service (Test Your Integration)

### What is token-validator?

**Purpose**: Test and verify your JWKS integration works correctly.

**Service**: \`test-auth-service\` or \`token-validator-service\` (port 3105)

**What it does**:
1. Receives your service call with \`_context\`
2. Shows your trust level
3. Validates token via JWKS (11-step verification)
4. Returns step-by-step validation results
5. Provides copy-paste code examples

---

### How to Test

**Basic test**:
\`\`\`javascript
services(action: "workflow.execute", {
  steps: [{
    service: "test-auth-service",
    tool: "verify_auth",
    arguments: {}
  }]
})
\`\`\`

**Response**:
\`\`\`json
{
  "trustLevel": "OWNER",
  "tokenReceived": true,
  "validation": {
    "step1": "✅ Token extracted from _context",
    "step2": "✅ JWKS fetched (34ms)",
    "step3": "✅ Public key found (kid: paichart-2026-04)",
    "step4": "✅ Signature valid (RS256)",
    "step5": "✅ Issuer valid (https://paichart.app)",
    "step6": "✅ Audience valid (https://paichart.app/mcp/<your-service-slug>, RFC 8707 per-service)",
    "step7": "✅ Token not expired",
    "step8": "✅ Claims extracted"
  },
  "claims": {
    "sub": "user456",
    "email": "alice@company.com",
    "role": "ADMIN",
    "aud": "https://paichart.app/mcp/<your-service-slug>",
    "iss": "https://paichart.app",
    "azp": "claude-desktop"
  },
  "codeExamples": {
    "typescript": "...",  // Copy-paste ready
    "javascript": "...",
    "python": "..."
  }
}
\`\`\`

**Validation time**: ~34ms (JWKS fetch + RS256 verification)

---

### Interpreting Results

**If tokenReceived: false**:
\`\`\`json
{
  "trustLevel": "SCOPED",
  "tokenReceived": false,
  "explanation": "Service owner not in POV team",
  "howToImprove": "Join a POV team owned by the service owner to receive tokens"
}
\`\`\`

**Solutions**:
- Register your own service → OWNER trust
- Join POV team → TEAM_MEMBER trust
- Make service work without tokens → Use userId/email only

---

## Section H: Common Validation Errors

### Error: "Invalid signature"

**Cause**: Token signature doesn't match JWKS public key

**Common reasons**:
1. Wrong JWKS endpoint (using old URL)
2. Using HS256 validation instead of RS256
3. Token expired or corrupted

**Solution**:
\`\`\`typescript
// Ensure you're using RS256 JWKS validation
const JWKS = createRemoteJWKSet(new URL('https://paichart.app/api/auth/jwks'));
await jwtVerify(token, JWKS, { algorithms: ['RS256'] });  // Specify RS256
\`\`\`

---

### Error: "Unexpected audience"

**Cause**: Token audience doesn't match expected values

**Solution**: Accept BOTH audiences
\`\`\`typescript
// ❌ WRONG - only accepts one audience
await jwtVerify(token, JWKS, {
  audience: 'https://paichart.app/mcp'  // Rejects /api tokens!
});

// ✅ CORRECT - accepts both
await jwtVerify(token, JWKS, {
  audience: ['https://paichart.app/api', 'https://paichart.app/mcp']
});
\`\`\`

---

### Error: "Invalid issuer"

**Cause**: Token issuer doesn't match expected value

**Solution**: Use correct issuer URL
\`\`\`typescript
await jwtVerify(token, JWKS, {
  issuer: 'https://paichart.app'  // Exact match required
});
\`\`\`

---

### Error: "Token expired"

**Cause**: Token's \`exp\` claim is in the past

**Solution**: This is normal - pAIchart tokens have limited lifetime
- Access tokens: 15 minutes
- Refresh tokens: 7 days
- Hub automatically refreshes during workflows

**Handling**:
\`\`\`typescript
// jose library throws automatically
try {
  await jwtVerify(token, JWKS);
} catch (error) {
  if (error.code === 'ERR_JWT_EXPIRED') {
    return { valid: false, error: 'Token expired - user should re-authenticate' };
  }
}
\`\`\`

---

### Error: "Public key not found"

**Cause**: Token's \`kid\` doesn't match any key in JWKS

**Reasons**:
1. Using old token after key rotation
2. JWKS cache is stale
3. Wrong JWKS endpoint

**Solution**:
\`\`\`typescript
// Check token header
const header = jwt.decode(token, { complete: true }).header;
console.log('Token kid:', header.kid);  // e.g., "paichart-2026-01"

// Fetch fresh JWKS
const jwks = await fetch('https://paichart.app/api/auth/jwks').then(r => r.json());
console.log('Available kids:', jwks.keys.map(k => k.kid));

// Should match! If not, token is from different issuer or very old
\`\`\`

---

## 🚀 Best Practices

### Security

1. ✅ **Always validate tokens** - Never trust \`_context\` without verification
2. ✅ **Accept both audiences** - \`/api\` and \`/mcp\` tokens may call your service
3. ✅ **Verify issuer** - Ensure token is from \`https://paichart.app\`
4. ✅ **Handle missing tokens** - Not all trust levels receive tokens (SCOPED, ANONYMOUS)
5. ✅ **Never forward tokens** - Use your service's credentials for downstream calls
6. ✅ **Log authentication events** - Audit who accessed what

---

### Performance

1. ✅ **Cache JWKS** - \`createRemoteJWKSet\` caches automatically (24-hour TTL)
2. ✅ **Validate once per request** - Don't re-validate same token multiple times
3. ✅ **Use async validation** - Don't block request handling

---

### Development

1. ✅ **Test with token-validator** - Verify integration before deploying
2. ✅ **Start private** - Test with OWNER trust first
3. ✅ **Handle errors gracefully** - Return helpful error messages
4. ✅ **Use TypeScript** - Type safety for token claims

---

## 📚 Related Documentation

**Deep Dive Prompts**:
- [G] **ABOUT-trust-levels** - 6-tier trust system (when you receive tokens)
- [F] **ABOUT-security-policy** - Multi-layer security, compliance
- [H] **architecture** - How token passing works internally

**Quick Start**:
- [A] **HOWTO-register-service** - Register your MCP service (step-by-step)
- [D] **HOWTO-register-service** - Register your service first

**Workflows**:
- [I] **HOWTO-use-workflows** - Use your authenticated service in workflows

---

## 💬 Support

**Authentication Questions**: steve.terry@paichart.com
**JWKS Endpoint**: https://paichart.app/api/auth/jwks
**Documentation**: https://paichart.app/docs

---

## 📖 Quick Reference

### JWKS Endpoint

\`\`\`
GET https://paichart.app/api/auth/jwks
\`\`\`

**Returns**:
\`\`\`json
{
  "keys": [{
    "kty": "RSA",
    "kid": "paichart-2026-01",
    "use": "sig",
    "alg": "RS256",
    "n": "...",  // Public key
    "e": "AQAB"
  }]
}
\`\`\`

### Validation Code (TypeScript)

\`\`\`typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://paichart.app/api/auth/jwks'));

async function validate(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'https://paichart.app',
    audience: ['https://paichart.app/api', 'https://paichart.app/mcp']
  });
  return payload;
}
\`\`\`

### Component 5 (Audience Isolation)

**Accept both audiences**:
\`\`\`typescript
audience: ['https://paichart.app/api', 'https://paichart.app/mcp']
\`\`\`

**Why**: Web UI and MCP clients use different audiences. Your service should work with both.

### Token Claims

\`\`\`typescript
{
  sub: "user-id",              // User ID
  email: "user@company.com",   // Email
  role: "ADMIN",               // Role
  iss: "https://paichart.app", // Issuer
  aud: "https://paichart.app/mcp",  // Audience
  exp: 1737012345,             // Expiration
  iat: 1737008745              // Issued at
}
\`\`\`

### Trust Levels (Who Gets Tokens)

| Level | Token? | Requirement |
|-------|--------|-------------|
| INTERNAL | ✅ Yes | pAIchart-* service |
| TRUSTED | ✅ Yes | Localhost Docker |
| OWNER | ✅ Yes | You own the service |
| TEAM_MEMBER | ✅ Yes | Caller in POV team (POV owned by service owner) |
| SCOPED | ❌ No | Public + POV context |
| ANONYMOUS | ❌ No | Public, no POV |

### Testing

\`\`\`javascript
// Test your integration
services(action: "workflow.execute", {
  steps: [{ service: "test-auth-service", tool: "verify_auth" }]
})

// Returns: Trust level, validation steps, code examples
\`\`\`

---

**Version**: 1.0 | **Created**: 2026-02-02 | **Status**: Production-Ready
**Validation**: 34ms JWKS validation, 100% success | **Security**: 95/100
**RFC Compliance**: RFC 8707 (Resource Indicators), RFC 9068 (JWT Profile)`,
  },
  {
    name: 'energy_operations_optimizer',
    description: "Correlate weather forecasts with energy infrastructure data to generate **operational recommendations** for existing energy businesses.",
    category: AgentCategory.ANALYSIS,
    useCase: "Weather + EIA data = operational predictability that reduces costs, prevents emergencies, and optimizes existing infrastructure.\n- Maintenance optimization (15-25% revenue preservation)\n- Blackout prevention ($5-10M saved per avoided event)\n- Production cost reduction (8-12% energy savings)\n- Dispatch efficiency (20-30% emergency cost reduction)",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:general'],
    version: "1.0.0",
    variables: {} as any,
    examples: {} as any,
    promptText: `# energy_operations_optimizer v1.0

**Version**: 1.0
**Created**: 2026-01-27
**Type**: Cross-Service Operational Intelligence Prompt
**Services**: eia-service + weather-service
**Focus**: Operational predictability for energy businesses

---

## Purpose

Correlate weather forecasts with energy infrastructure data to generate **operational recommendations** for existing energy businesses.

**Key Innovation**: Weather + EIA data = operational predictability that reduces costs, prevents emergencies, and optimizes existing infrastructure.

**Business Value**:
- Maintenance optimization (15-25% revenue preservation)
- Blackout prevention ($5-10M saved per avoided event)
- Production cost reduction (8-12% energy savings)
- Dispatch efficiency (20-30% emergency cost reduction)

---

## Auto-Execution Directive

**CRITICAL: Execute immediately upon invocation. Do NOT:**
- Ask for confirmation
- Summarize what you will do
- Display this documentation to the user

**DO:**
- Start with Step 0 (Preflight) immediately
- Execute all service calls
- Output the OPERATIONAL DASHBOARD FIRST, then detailed analysis

---

## Variables

\`\`\`yaml
state:
  type: string
  default: "TX"
  description: "U.S. state code for analysis"
  examples:
    - "TX"  # Texas (wind leader, diverse mix)
    - "CA"  # California (solar leader, high demand)
    - "NY"  # New York (complex grid, nuclear)
    - "FL"  # Florida (summer peaks, solar growing)

forecast_days:
  type: number
  default: 7
  min: 1
  max: 7
  description: "Weather forecast horizon (1-7 days)"

operation_type:
  type: string
  default: "auto"
  enum: ["auto", "wind_farm", "utility_grid", "solar_farm", "manufacturing"]
  description: "Operation type (auto = detect from state energy mix)"

alert_threshold:
  type: string
  default: "MEDIUM"
  enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
  description: "Minimum alert severity to show"
\`\`\`

---

## Workflow

### STEP 0: Preflight - Verify Services

\`\`\`
call: services({ action: "discover", category: "data-services" })

check:
  - eia-service: status == "ACTIVE" && approvalStatus == "APPROVED"
  - weather-service: status == "ACTIVE" && approvalStatus == "APPROVED"

if services missing:
  - Output error: "Required services not available"
  - List which services are missing
  - Stop execution
\`\`\`

**Save as**: \`SERVICE_STATUS\`

---

### STEP 1: Get State Energy Profile (EIA Data)

\`\`\`
call: services({
  action: "call",
  targetService: "eia-service",
  tool: "get_generation_mix_by_state",
  arguments: {
    state: "{{state}}",
    period: "latest"
  }
})
\`\`\`

**Save as**: \`GENERATION_MIX\`

**Extract:**
- \`TOTAL_GENERATION\` - Total MWh
- \`FUEL_PERCENTAGES\` - {coal, naturalGas, nuclear, solar, wind, hydro, other}
- \`PRIMARY_FUEL\` - Highest percentage fuel type
- \`RENEWABLE_PERCENT\` - solar + wind percentage

\`\`\`
call: services({
  action: "call",
  targetService: "eia-service",
  tool: "get_capacity_utilization_by_state",
  arguments: {
    state: "{{state}}",
    season: "both"
  }
})
\`\`\`

**Save as**: \`CAPACITY_DATA\`

**Extract:**
- \`SUMMER_CAPACITY_GW\` - Summer capacity in GW
- \`WINTER_CAPACITY_GW\` - Winter capacity in GW
- \`UTILIZATION_PERCENT\` - Current utilization
- \`PEAK_DEMAND_GW\` - Peak demand

---

### STEP 2: Get Weather Forecast (State Capital)

Determine state capital for weather forecast:

\`\`\`yaml
state_capitals:
  TX: "Austin,US"
  CA: "Sacramento,US"
  NY: "Albany,US"
  FL: "Tallahassee,US"
  # ... add as needed
\`\`\`

\`\`\`
call: services({
  action: "call",
  targetService: "weather-service",
  tool: "forecast",
  arguments: {
    location: STATE_CAPITAL,
    days: {{forecast_days}},
    units: "imperial"
  }
})
\`\`\`

**Save as**: \`FORECAST_DATA\`

\`\`\`
call: services({
  action: "call",
  targetService: "weather-service",
  tool: "current_weather",
  arguments: {
    location: STATE_CAPITAL,
    units: "imperial"
  }
})
\`\`\`

**Save as**: \`CURRENT_WEATHER\`

**Extract from forecasts:**
- \`MAX_TEMP\` - Highest temp in forecast
- \`MIN_TEMP\` - Lowest temp in forecast
- \`AVG_TEMP\` - Average daily temp
- \`WIND_SPEEDS[]\` - Daily wind speeds
- \`CONDITIONS[]\` - Daily weather conditions
- \`HOT_DAYS\` - Count of days > 95°F
- \`COLD_DAYS\` - Count of days < 32°F
- \`HIGH_WIND_DAYS\` - Count of days with wind > 20 mph

---

### STEP 3: Operational Pattern Detection (Decision Tree)

Apply rules based on state energy mix and weather forecast.

#### Rule Set: Wind Farm Operations

\`\`\`yaml
rules:
  # CRITICAL: High wind period (maximize generation)
  - id: WIND_MAXIMIZE_GENERATION
    severity: HIGH
    conditions:
      - RENEWABLE_PERCENT.wind > 15%  # Significant wind in state
      - AND AVG_WIND_SPEED > 20 mph for 3+ consecutive days
    operational_impact: "Optimal generation period - defer all maintenance"
    recommendation:
      action: "MAXIMIZE_GENERATION"
      details:
        - "Cancel non-critical maintenance (all turbines online)"
        - "Expect 90-100% capacity factor"
        - "Lock in favorable power purchase agreements"
        - "Revenue opportunity: +25-40% vs normal week"
    confidence: HIGH
    timeframe: "Days {{high_wind_start}}-{{high_wind_end}}"

  # HIGH: Low wind window (maintenance opportunity)
  - id: WIND_MAINTENANCE_WINDOW
    severity: MEDIUM
    conditions:
      - RENEWABLE_PERCENT.wind > 15%
      - AND AVG_WIND_SPEED < 10 mph for 3+ consecutive days
    operational_impact: "Low generation expected - optimal maintenance window"
    recommendation:
      action: "SCHEDULE_MAINTENANCE"
      details:
        - "Schedule turbine maintenance Days {{low_wind_start}}-{{low_wind_end}}"
        - "Expected generation loss: 15-25% (minimal)"
        - "Complete repairs before high-wind period resumes"
        - "Revenue preservation: 15-25% vs random scheduling"
    confidence: HIGH
    timeframe: "Days {{low_wind_start}}-{{low_wind_end}}"

  # MEDIUM: Variable wind (monitor closely)
  - id: WIND_VARIABLE_PATTERN
    severity: LOW
    conditions:
      - RENEWABLE_PERCENT.wind > 15%
      - AND wind_variability > 50%  # High day-to-day variation
    operational_impact: "Unpredictable generation - keep backup ready"
    recommendation:
      action: "STANDBY_MODE"
      details:
        - "Keep natural gas peakers on standby"
        - "Monitor hourly forecasts for ramp events"
        - "Defer long-duration maintenance"
    confidence: MEDIUM
    timeframe: "Entire forecast period"
\`\`\`

#### Rule Set: Solar Farm Operations

\`\`\`yaml
rules:
  # HIGH: Extended sunny period (maximize generation)
  - id: SOLAR_OPTIMAL_GENERATION
    severity: HIGH
    conditions:
      - RENEWABLE_PERCENT.solar > 10%
      - AND CLEAR_DAYS >= 4  # 4+ days of clear/mostly clear
    operational_impact: "Peak solar generation expected"
    recommendation:
      action: "MAXIMIZE_GENERATION"
      details:
        - "Defer panel cleaning to after sunny period"
        - "Expect 80-90% capacity factor"
        - "Prepare for rapid ramp-down if weather changes"
    confidence: HIGH
    timeframe: "Days {{clear_start}}-{{clear_end}}"

  # CRITICAL: Cloud cover period (dispatch planning)
  - id: SOLAR_CLOUD_IMPACT
    severity: HIGH
    conditions:
      - RENEWABLE_PERCENT.solar > 10%
      - AND CLOUDY_DAYS >= 2
      - AND solar_drop_expected > 40%
    operational_impact: "Significant solar shortfall - backup generation needed"
    recommendation:
      action: "PREPARE_BACKUP"
      details:
        - "Pre-warm {{backup_capacity_needed}} GW natural gas peakers"
        - "Alert grid operator 4 hours before cloud cover"
        - "Expect {{solar_shortfall_mw}} MW shortfall"
        - "Cost impact: \${{backup_cost_estimate}}/hour"
    confidence: HIGH
    timeframe: "Days {{cloudy_start}}-{{cloudy_end}}"
\`\`\`

#### Rule Set: Utility Grid Operations

\`\`\`yaml
rules:
  # CRITICAL: Heat wave (demand spike risk)
  - id: HEAT_WAVE_DEMAND_SPIKE
    severity: CRITICAL
    conditions:
      - MAX_TEMP > 100°F
      - AND HOT_DAYS >= 3
    operational_impact: "AC load spike - blackout risk if capacity insufficient"
    recommendation:
      action: "EMERGENCY_PREPARATION"
      details:
        - "Pre-position {{reserve_capacity_needed}} GW reserves"
        - "Defer all maintenance on peaker plants"
        - "Alert demand response programs (prepare load shedding)"
        - "Estimated peak demand: {{peak_demand_forecast}} GW"
        - "Available margin: {{capacity_margin}}% ({{margin_status}})"
      severity_assessment:
        - margin > 10%: "SAFE - monitor"
        - margin 5-10%: "TIGHT - standby"
        - margin < 5%: "CRITICAL - activate demand response"
    confidence: HIGH
    timeframe: "Peak risk: Days {{heat_start}}-{{heat_end}}, 2-7pm"

  # HIGH: Cold snap (heating load spike)
  - id: COLD_SNAP_HEATING_LOAD
    severity: HIGH
    conditions:
      - MIN_TEMP < 25°F
      - AND COLD_DAYS >= 2
    operational_impact: "Heating load spike - natural gas generation increase needed"
    recommendation:
      action: "INCREASE_GENERATION"
      details:
        - "Increase natural gas generation by {{gas_increase_percent}}%"
        - "Pre-order fuel if reserves < 80%"
        - "Monitor for infrastructure freeze risk"
        - "Estimated additional demand: {{additional_demand_mw}} MW"
    confidence: HIGH
    timeframe: "Days {{cold_start}}-{{cold_end}}"

  # MEDIUM: Renewable intermittency (dispatch planning)
  - id: RENEWABLE_INTERMITTENCY
    severity: MEDIUM
    conditions:
      - RENEWABLE_PERCENT > 25%
      - AND weather_variability == HIGH  # Changing conditions
    operational_impact: "Variable renewable output - backup cycling needed"
    recommendation:
      action: "OPTIMIZE_DISPATCH"
      details:
        - "Keep {{backup_mw}} MW quick-start capacity ready"
        - "Monitor hourly forecasts for cloud/wind changes"
        - "Use battery storage for smoothing (if available)"
        - "Expected cycling: {{ramp_events_expected}} ramp events"
    confidence: MEDIUM
    timeframe: "Entire forecast period"
\`\`\`

#### Rule Set: Manufacturing/Industrial

\`\`\`yaml
rules:
  # HIGH: Low-demand period (cost optimization)
  - id: LOW_DEMAND_OPPORTUNITY
    severity: MEDIUM
    conditions:
      - CURRENT_UTILIZATION < 60%  # Grid has headroom
      - AND weather == MILD  # 60-80°F, no extremes
    operational_impact: "Grid has excess capacity - favorable energy rates"
    recommendation:
      action: "INCREASE_PRODUCTION"
      details:
        - "Schedule energy-intensive processes now"
        - "Grid utilization low ({{UTILIZATION_PERCENT}}%)"
        - "Rates likely favorable due to low demand"
        - "Potential savings: 8-12% vs peak-demand periods"
    confidence: MEDIUM
    timeframe: "Next {{mild_weather_days}} days"

  # CRITICAL: Extreme weather (production risk)
  - id: EXTREME_WEATHER_PRODUCTION_RISK
    severity: HIGH
    conditions:
      - (MAX_TEMP > 105°F OR MIN_TEMP < 10°F)
      - AND state_utilization > 85%
    operational_impact: "Grid stressed - power interruption risk"
    recommendation:
      action: "REDUCE_LOAD"
      details:
        - "Shift production to off-peak hours"
        - "Consider temporary production halt if grid emergency declared"
        - "Backup generators on standby"
        - "Cost of interruption: \${{interruption_cost_estimate}}/hour"
    confidence: HIGH
    timeframe: "Peak risk: {{extreme_weather_window}}"
\`\`\`

**Output**: \`OPERATIONAL_ALERTS[]\` - Array of matched rules

---

### STEP 4: Generate Operational Recommendations

For each OPERATIONAL_ALERT:

\`\`\`yaml
recommendation_generation:
  for each alert in OPERATIONAL_ALERTS:
    if alert.severity >= {{alert_threshold}}:

      # Build recommendation
      recommendation = {
        operation_type: detect_operation(GENERATION_MIX),
        action: alert.recommendation.action,
        severity: alert.severity,
        impact: alert.operational_impact,
        details: alert.recommendation.details,
        confidence: alert.confidence,
        timeframe: alert.timeframe,
        business_value: estimate_value(alert, CAPACITY_DATA),
        weather_driver: alert.id
      }

      RECOMMENDATIONS.append(recommendation)

  # Sort by severity (CRITICAL > HIGH > MEDIUM > LOW)
  RECOMMENDATIONS.sort(severity DESC, confidence DESC)
\`\`\`

**Auto-detect operation type:**
\`\`\`javascript
function detect_operation(generation_mix) {
  if (generation_mix.wind > 20%) return "WIND_FARM_OPERATIONS";
  if (generation_mix.solar > 15%) return "SOLAR_FARM_OPERATIONS";
  if (generation_mix.naturalGas > 40%) return "UTILITY_GRID_OPERATIONS";
  return "GENERAL_OPERATIONS";
}
\`\`\`

**Save as**: \`RECOMMENDATIONS[]\`

---

## Output Template

**IMPORTANT**: Always output OPERATIONAL DASHBOARD FIRST.

\`\`\`markdown
# ⚡ Energy Operations Dashboard - {{state}}

**Generated:** {{timestamp}}
**State:** {{state}} ({{state_name}})
**Forecast Period:** {{forecast_days}} days
**Services:** eia-service ✅ + weather-service ✅

---

## 🎯 OPERATIONAL DASHBOARD - Quick View

### Current State Profile

| Metric | Value | Status |
|--------|-------|--------|
| **Total Generation** | {{TOTAL_GENERATION}} TWh/month | — |
| **Primary Fuel** | {{PRIMARY_FUEL}} ({{primary_fuel_percent}}%) | — |
| **Renewable Mix** | Solar {{solar_pct}}% + Wind {{wind_pct}}% = {{RENEWABLE_PERCENT}}% | {{renewable_status}} |
| **Capacity** | {{SUMMER_CAPACITY_GW}} GW (summer) / {{WINTER_CAPACITY_GW}} GW (winter) | — |
| **Utilization** | {{UTILIZATION_PERCENT}}% | {{utilization_status}} |

**Utilization Status**:
- < 60%: ✅ NORMAL (grid has headroom)
- 60-80%: ⚠️ ELEVATED (monitor closely)
- > 80%: 🔴 HIGH (stressed, risk of issues)

**Renewable Status**:
- < 15%: Low (traditional grid)
- 15-30%: Moderate (emerging renewables)
- > 30%: High (significant intermittency management needed)

---

### Weather Forecast Summary

**Current:** {{CURRENT_TEMP}}°F (feels {{CURRENT_FEELS_LIKE}}°F), {{CURRENT_CONDITIONS}}

**<forecast_days>-Day Outlook:**

Produce a markdown table with columns: Day / High / Low / Wind / Conditions / Grid Impact. One row per day in DAILY_FORECASTS. Use the format: day_num (integer), tempMax (°F), tempMin (°F), windSpeed (mph), conditions (string), grid_impact_emoji. Use ⚡/🔴/✅ emoji per the grid-impact severity mapping.

After the table, emit four bold metadata lines:
- **Temperature Range:** <MIN_TEMP>°F to <MAX_TEMP>°F
- **Hot Days (>95°F):** <HOT_DAYS count>
- **Cold Days (<32°F):** <COLD_DAYS count>
- **High Wind Days (>20mph):** <HIGH_WIND_DAYS count>

---

### 🚨 Operational Alerts (<OPERATIONAL_ALERTS count>)

If RECOMMENDATIONS is non-empty, emit one markdown table per recommendation with four rows:
- Row 1 (header-like): <severity_emoji> | **<action>** | <confidence> confidence | <timeframe>
- Row 2 (separator): |---|---|---|---|
- Row 3: **Impact:** | <impact> | | |
- Row 4: **Business Value:** | <business_value> | | |

If RECOMMENDATIONS is empty, emit a single "no alerts" table:
- ✅ | **NO ALERTS** | Normal operations | Entire period
- |---|---|---|---|
- **Status:** | No weather-driven operational changes needed | | |

---

## 📋 Detailed Recommendations

If RECOMMENDATIONS is non-empty, emit one subsection per recommendation (1-indexed):

- Level-3 heading "<N>. <action> - <severity> <severity_emoji>"
- "**Operational Impact:** <impact>"
- "**Recommended Actions:**" followed by a bulleted list, one bullet per item in the recommendation's details array ("- <action_item>")
- "**Weather Driver:** <weather_driver>"
- "**Confidence:** <confidence>"
- "**Timeframe:** <timeframe>"
- "**Estimated Value:** <business_value>"
- "**Grid Context:**" followed by a bulleted list:
  - "Current utilization: <UTILIZATION_PERCENT>%"
  - "Available headroom: <100 minus UTILIZATION_PERCENT>%"
  - "<PRIMARY_FUEL> provides <primary_fuel_percent>% of generation"
- Separator line "---" after each recommendation

If RECOMMENDATIONS is empty, emit a single "Normal Operations" subsection instead:

- Level-2 heading "✅ Normal Operations - No Alerts"
- "**Weather Analysis:** <forecast_days>-day forecast shows normal conditions for <state>."
- "**Current Status:**" bulleted list with: Temperature range <MIN_TEMP>-<MAX_TEMP>°F (typical for season); No extreme weather events expected; Grid utilization <UTILIZATION_PERCENT>% (<utilization_status>)
- "**Recommendation:** Continue normal operations. Re-run analysis in 24-48 hours."

---

## 📊 Energy Mix Analysis

**{{state}} Current Generation Mix:**

| Fuel Type | Generation (MWh) | Percentage | Weather Sensitivity |
|-----------|------------------|------------|---------------------|
| Natural Gas | {{gas_mwh}} | {{gas_pct}}% | ⚡ Moderate (backup for renewables) |
| Wind | {{wind_mwh}} | {{wind_pct}}% | 🌬️ HIGH (wind speed correlation) |
| Solar | {{solar_mwh}} | {{solar_pct}}% | ☀️ HIGH (cloud cover impact) |
| Coal | {{coal_mwh}} | {{coal_pct}}% | ⚫ Low (baseload, weather-independent) |
| Nuclear | {{nuclear_mwh}} | {{nuclear_pct}}% | ☢️ Low (baseload, weather-independent) |
| Hydro | {{hydro_mwh}} | {{hydro_pct}}% | 💧 Moderate (seasonal/drought) |
| Other | {{other_mwh}} | {{other_pct}}% | — |

**Total Generation:** {{TOTAL_GENERATION}} TWh/month

**Weather Exposure:** {{RENEWABLE_PERCENT}}% of generation is weather-dependent (solar + wind)

---

## 🎯 Cross-Correlation Insights

### What Weather + EIA Data Reveals

Emit the following bold-headed insight blocks, but ONLY when the triggering condition is met for the analysed state. Skip blocks whose condition is not met.

- **If RENEWABLE_PERCENT > 25**: "**High Renewable State** (<RENEWABLE_PERCENT>% solar + wind):" followed by bullets: "Weather drives <RENEWABLE_PERCENT>% of generation"; "Forecast accuracy critical for dispatch planning"; "Backup capacity must match intermittency"; "🎯 Recommendation: Use hourly forecasts for real-time dispatch optimization".
- **If wind percentage > 20**: "**Wind Leader** (<wind_pct>%):" followed by bullets about wind speed forecast impact on <wind_mwh> MWh generation, 5 mph change = ~<wind_impact_percent>% generation change, and a 7-day-wind-forecast maintenance-planning recommendation.
- **If solar percentage > 15**: "**Solar Significant** (<solar_pct>%):" with bullets on cloud cover impact on <solar_mwh> MWh generation, 60-80% generation drop on cloudy days, hourly forecast recommendation for backup dispatch coordination.
- **If natural gas percentage > 40**: "**Natural Gas Heavy** (<gas_pct>%):" with bullets on temperature extremes driving demand, gas as backup for renewable intermittency, temperature-forecast-guides-fuel-procurement recommendation.

If none of the above conditions is met, omit this section entirely and move to the next heading.

---

## 💰 Business Value Estimates

### Potential Savings/Revenue This Period

For each item in RECOMMENDATIONS, emit a bold-headed block:

- "**<action>:**" followed by a bulleted list:
  - "Type: <value_type> (cost avoidance, revenue preservation, efficiency gain)"
  - "Estimate: <business_value>"
  - "Confidence: <confidence>"
  - "Basis: <value_calculation_basis>"

After all per-recommendation blocks, emit: "**Total Potential Value:** \${{total_value_estimate}}"

**Calculation Basis:**
- Wind maintenance optimization: 15-25% revenue preservation
- Blackout prevention: $5-10M per avoided event
- Production cost optimization: 8-12% energy savings
- Dispatch efficiency: 20-30% emergency cost reduction

---

## 📈 Historical Weather-Energy Correlations

**<state> Specific Examples:**

Produce a markdown table with columns Date / Weather Event / Energy Impact / Lesson. Populate rows based on the analysed state. If no state-specific examples are known, emit a single row "No state-specific historical events recorded — monitor live forecasts for pattern detection."

State-specific reference events to draw from:
- **TX**: Feb 2021 multi-day freeze (<10°F) caused 30 GW offline, $130B damage — lesson: pre-position reserves for cold snaps. Aug 2023 heat wave (110°F+) drove peak demand 85 GW (record) — lesson: demand response prevented blackouts. Dec 2022 Winter Storm Uri caused natural gas supply disruption — lesson: weather + fuel logistics = critical.
- **CA**: Aug 2020 heat wave + fires caused rolling blackouts — lesson: solar drops evening = backup needed. Sep 2022 Flex Alert success managed heat wave without blackouts — lesson: demand response + forecast = success.
- **NY**: Jan 2018 bomb cyclone drove peak demand spike — lesson: cold weather = heating load.

Include only the rows for the state currently being analysed.

**Key Insight:** Weather forecasting enables proactive operations vs reactive crisis management.

---

## ✅ Recommended Actions (Prioritized)

### Immediate (Next 24 hours):

For each RECOMMENDATION whose timeframe mentions "Day 1", emit a checklist bullet: "- [ ] <action>: <impact>". If none match, emit "- [ ] No immediate actions required for the next 24 hours."

### Short-term (Days 2-3):

For each RECOMMENDATION whose timeframe mentions "Day 2" or "Day 3", emit a checklist bullet "- [ ] <action>: <impact>". If none match, emit "- [ ] No short-term actions identified."

### Medium-term (Days 4-7):

For each RECOMMENDATION whose timeframe mentions "Day 4+", emit a checklist bullet "- [ ] <action>: <impact>". If none match, emit "- [ ] No medium-term actions identified."

### Ongoing:
- [ ] Monitor weather forecast updates (run this analysis daily)
- [ ] Track actual vs forecast accuracy
- [ ] Adjust operations based on forecast changes
- [ ] Document cost savings achieved

---

## 🔄 Continuous Improvement

**Recommended Analysis Frequency:**
- **High renewable states** (>25%): Daily (weather drives operations)
- **Moderate renewable** (10-25%): Every 2-3 days
- **Low renewable** (<10%): Weekly (less weather-sensitive)

**What to Monitor:**
- Forecast accuracy (actual temps vs predicted)
- Operational decision outcomes (savings achieved)
- Correlation strength (weather → generation → costs)

**Re-run this analysis:**
- Daily during extreme weather periods
- Every 2-3 days during normal conditions
- Immediately if forecast changes significantly

---

**Disclaimer:** Operational analysis for planning purposes. Weather forecasts have inherent uncertainty. Always maintain safety margins and follow grid operator protocols.

**Prompt Version:** energy_operations_optimizer v1.0
**Services Used:** 2 (eia-service, weather-service)
**Operational Focus:** Cost reduction, blackout prevention, efficiency optimization
\`\`\`

---

## State-Specific Optimization Rules

### Texas (Wind + Natural Gas Leader)

**Focus**: Wind generation optimization, cold snap preparation

**Key Metrics**:
- Wind: 27% (U.S. leader)
- Natural Gas: 40% (backup + baseload)
- Solar: 10% (growing fast)

**Weather Priorities**:
1. 7-day wind forecast (maintenance planning)
2. Cold snap alerts (<25°F = freeze risk)
3. Heat wave monitoring (>100°F = demand spike)

---

### California (Solar + Renewable Mandate)

**Focus**: Solar intermittency management, heat wave preparation

**Key Metrics**:
- Solar: 23% (leader)
- Natural Gas: 50% (backup)
- Renewables: 32% total

**Weather Priorities**:
1. Hourly cloud cover (solar drop prediction)
2. Heat wave tracking (>95°F = AC load)
3. Wind forecast (desert solar + wind combo)

---

### New York (Nuclear + Diverse Mix)

**Focus**: Demand forecasting, winter preparation

**Key Metrics**:
- Natural Gas: 45%
- Nuclear: 30% (baseload)
- Hydro: 20%

**Weather Priorities**:
1. Cold snap alerts (<20°F = heating load)
2. Summer heat (>90°F = AC demand)
3. Storm tracking (infrastructure risk)

---

### Florida (Summer Peak, Solar Growing)

**Focus**: AC demand management, solar growth

**Key Metrics**:
- Natural Gas: 75% (dominant)
- Solar: 12% (growing 20%/year)
- Renewables: 15%

**Weather Priorities**:
1. Heat/humidity tracking (heat index >100 = peak AC)
2. Hurricane monitoring (infrastructure risk)
3. Solar forecast (cloud cover impacts)

---

## Usage Examples

\`\`\`bash
# Default: Texas wind + grid optimization
/prompt energy_operations_optimizer

# California solar operations
/prompt energy_operations_optimizer state="CA"

# New York winter operations (7-day forecast)
/prompt energy_operations_optimizer state="NY" forecast_days=7

# High sensitivity (all alerts)
/prompt energy_operations_optimizer alert_threshold="LOW"

# Wind farm specific (Texas)
/prompt energy_operations_optimizer state="TX" operation_type="wind_farm"

# Manufacturing facility planning
/prompt energy_operations_optimizer state="OK" operation_type="manufacturing"
\`\`\`

---

## Appendix: Confidence Scoring

| Confidence | Criteria | Operational Risk |
|------------|----------|------------------|
| **HIGH** | Strong weather-energy correlation + Clear forecast pattern + <3 day timeframe | Low risk - high confidence decision |
| **MEDIUM** | Moderate correlation + Developing pattern + 3-5 day timeframe | Moderate risk - monitor closely |
| **LOW** | Weak correlation + Uncertain pattern + >5 day timeframe | High uncertainty - standby mode |

---

## Tags

\`#mcp\` \`#cross-service\` \`#operations\` \`#energy\` \`#eia\` \`#weather\` \`#grid-optimization\` \`#renewable-integration\` \`#cost-reduction\` \`#predictive-analytics\``,
  },
  {
    name: 'pov_health_check',
    description: "Provides a focused, high-resolution health check for a single POV. This prompt retrieves POV details, evaluates status, analyzes tasks, surfaces risks, and generates actionable recommendations using pAIchart tools. Ideal when you want fast clarity on where a POV stands, what\u2019s blocking it, and what to do next.",
    category: AgentCategory.ANALYSIS,
    useCase: "1. Validate Readiness Before Customer Meetings\n\nA solutions architect or PM quickly checks the POV status (phases, stages, task blockers, high-priority items) before a customer call or internal readiness review.\n\n2. Daily POV Monitoring\n\nA delivery lead runs pov_health_check each morning for the POVs they own. It instantly shows:\n\nWhat changed\n\nWhat\u2019s overdue\n\nWhat\u2019s blocking progress\n\nThe recommended actions for the day\n\n3. Deep-Dive After Automated Portfolio Audit\n\nWhen tasks_audit_and_plan identifies a priority POV, users can call pov_health_check povId=\"...\" to run a sharper drill-down on that specific POV.",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:general'],
    version: "1.0.0",
    variables: {
      "pov": { "type": "string", "required": true, "description": "POV identifier: povId, pov_name, or partial name for fuzzy matching" },
      "task_focus": { "type": "string", "default": "CRITICAL", "required": false, "description": "CRITICAL | HIGH_PRIORITY | ALL" },
      "include_recommendations": { "type": "boolean", "default": true, "required": false, "description": "Include AI-generated recommendations" },
      "include_comparison": { "type": "boolean", "default": true, "required": false, "description": "Compare against similar POVs for percentile ranking" },
      "critical_task_limit": { "type": "number", "default": 5, "required": false, "description": "Max tasks to deep-dive via project(action: 'task.context')" }
    } as any,
    examples: {"example_1": {"input": {"pov": "CyberDefense Pro - Cisco Secure Email Gateway C695", "task_focus": "critical"}, "output": "A detailed POV health report including status, phases, high-priority tasks, blockers, and actionable steps."}, "example_2": {"input": {"pov": "cmgalshus00bcyx39sfdutido", "task_focus": "high_priority", "include_recommendations": true}, "output": "Deep dive into high-priority tasks for the given POV ID with AI recommendations and next steps."}, "example_3": {"input": {"pov": "CyberDefense Pro", "task_focus": "all"}, "output": "Full POV analysis with tasks across all priorities, phase breakdowns, risks, and recommended actions."}} as any,
    promptText: `# POV Health Check v2.1

## Purpose & Differentiation

This prompt provides **analytical value beyond individual tool guidance**:
- **Health Scoring**: Quantified 0-100 score with weighted factors
- **Critical Thresholds**: Objective severity ratings (not subjective assessment)
- **Phase Bottleneck Detection**: Identifies stuck phases with blocked/stalled tasks
- **Comparative Analysis**: Ranks POV against similar projects (same status/theatre)

**When to use this vs. following tool nextSteps:**
- Use this prompt when you need a **quantified health assessment** with comparable metrics
- Follow tool nextSteps when you want **step-by-step exploration** at your own pace

---

## Tool Name Reference

When workflow steps reference tool calls, use the **consolidated tool names**:

| Consolidated Tool | Action | Was (legacy) |
|---|---|---|
| \`project\` | \`pov.details\` | \`project(action: "pov.details")\` |
| \`project\` | \`pov.list\` | \`project(action: "pov.list")\` |
| \`project\` | \`task.list\` | \`project(action: "task.list")\` |
| \`project\` | \`task.context\` | \`project(action: "task.context")\` |
| \`analytics\` | \`recommendations.get\` | \`analytics(action: "recommendations.get")\` |

## Auto-Execution Directive

**CRITICAL: Execute immediately upon invocation. Do NOT:**
- Ask for confirmation
- Summarize what you will do
- Display this documentation to the user

**DO:**
- Start with Step 1 immediately
- Execute all tool calls
- Output only the final Health Report

---

## Variables

\`\`\`json
{
  "pov": {
    "type": "string",
    "required": true,
    "description": "POV identifier: povId, pov_name, or partial name for fuzzy matching"
  },
  "task_focus": {
    "type": "enum",
    "values": ["CRITICAL", "HIGH_PRIORITY", "ALL"],
    "default": "CRITICAL",
    "required": false,
    "description": "Controls which tasks to deep-dive into. CRITICAL = BLOCKED + HIGH priority, HIGH_PRIORITY = HIGH priority only, ALL = all non-completed tasks"
  },
  "include_recommendations": {
    "type": "boolean",
    "default": true,
    "required": false,
    "description": "Include AI-generated recommendations for key tasks and POV-level insights"
  },
  "include_comparison": {
    "type": "boolean",
    "default": true,
    "required": false,
    "description": "Compare against similar POVs (same status) for percentile ranking"
  },
  "critical_task_limit": {
    "type": "number",
    "default": 5,
    "required": false,
    "description": "Maximum tasks to deep-dive with project(action: 'task.context')"
  }
}
\`\`\`

---

## Workflow

### STEP 1: Identify and Load POV

\`\`\`
Execute: project({ action: "pov.details", pov_name: "{{pov}}" })
\`\`\`

Extract and store:
- \`POV_ID\`, \`POV_NAME\`, \`STATUS\`, \`OWNER\`
- \`PHASES[]\` with stage counts
- \`TEAM_MEMBERS[]\` with IDs
- \`TASK_SUMMARY\` (total, completed, open, blocked)
- \`GEOGRAPHY\` (theatre, country, region)

If POV not found: Display fuzzy suggestions from error and STOP.

---

### STEP 2: Load All Tasks

\`\`\`
Execute: project({
  action: "task.list",
  povId: POV_ID,
  limit: 200
})
\`\`\`

Store as \`ALL_TASKS[]\` and compute:
- \`TOTAL_TASKS\` = count(ALL_TASKS)
- \`COMPLETED_TASKS\` = count(status == "COMPLETED")
- \`OPEN_TASKS\` = count(status == "OPEN")
- \`IN_PROGRESS_TASKS\` = count(status == "IN_PROGRESS")
- \`BLOCKED_TASKS\` = count(status == "BLOCKED")
- \`HIGH_PRIORITY_OPEN\` = count(priority == "HIGH" AND status != "COMPLETED")
- \`UNASSIGNED_TASKS\` = count(assignee is null/empty)

---

### STEP 3: Compute Health Score (0-100)

**Health Score Formula:**

\`\`\`
COMPLETION_SCORE = (COMPLETED_TASKS / TOTAL_TASKS) * 40
  // Max 40 points for completion rate

BLOCKED_PENALTY = min(BLOCKED_TASKS * 5, 20)
  // -5 points per blocked task, max -20

UNASSIGNED_PENALTY = min(UNASSIGNED_TASKS * 2, 10)
  // -2 points per unassigned task, max -10

HIGH_PRIORITY_PENALTY = min(HIGH_PRIORITY_OPEN * 3, 15)
  // -3 points per open HIGH priority, max -15

PROGRESS_BONUS = (IN_PROGRESS_TASKS > 0) ? 10 : 0
  // +10 if work is actively in progress

PHASE_HEALTH_BONUS = (see Step 4)
  // 0-15 points based on phase progression

HEALTH_SCORE = max(0, min(100,
  COMPLETION_SCORE
  - BLOCKED_PENALTY
  - UNASSIGNED_PENALTY
  - HIGH_PRIORITY_PENALTY
  + PROGRESS_BONUS
  + PHASE_HEALTH_BONUS
))
\`\`\`

---

### STEP 4: Phase-Level Bottleneck Detection

For each phase in \`PHASES[]\`:

\`\`\`
PHASE_TASKS = filter ALL_TASKS where phaseId == phase.id
PHASE_BLOCKED = count(PHASE_TASKS where status == "BLOCKED")
PHASE_COMPLETION = count(PHASE_TASKS where status == "COMPLETED") / count(PHASE_TASKS)

IF PHASE_BLOCKED > 0:
  BOTTLENECK_PHASES.push({
    name: phase.name,
    blocked_count: PHASE_BLOCKED,
    completion: PHASE_COMPLETION,
    severity: PHASE_BLOCKED >= 3 ? "CRITICAL" : PHASE_BLOCKED >= 2 ? "HIGH" : "MEDIUM"
  })
\`\`\`

**Phase Health Bonus Calculation:**
\`\`\`
IF no BOTTLENECK_PHASES with severity == "CRITICAL":
  PHASE_HEALTH_BONUS = 15
ELSE IF no BOTTLENECK_PHASES with severity == "HIGH":
  PHASE_HEALTH_BONUS = 10
ELSE IF BOTTLENECK_PHASES.length <= 1:
  PHASE_HEALTH_BONUS = 5
ELSE:
  PHASE_HEALTH_BONUS = 0
\`\`\`

---

### STEP 5: Critical Task Thresholds

Apply these **objective thresholds** to categorize severity:

| Condition | Severity | Action Required |
|-----------|----------|-----------------|
| \`BLOCKED_TASKS >= 3\` | CRITICAL | Immediate escalation |
| \`BLOCKED_TASKS >= 1\` | HIGH | Unblock within 24h |
| \`HIGH_PRIORITY_OPEN >= 5\` | CRITICAL | Resource reallocation |
| \`HIGH_PRIORITY_OPEN >= 3\` | HIGH | Prioritize this sprint |
| \`UNASSIGNED_TASKS >= 5\` | HIGH | Assign resources |
| \`COMPLETION_RATE == 0%\` | CRITICAL | POV may be stalled |
| \`COMPLETION_RATE < 20%\` AND \`STATUS == "VALIDATION"\` | CRITICAL | Risk of missing close |

Store matching conditions in \`SEVERITY_FLAGS[]\`.

---

### STEP 6: Comparative Analysis (if include_comparison == true)

\`\`\`
Execute: project({
  action: "pov.list",
  status: "{{STATUS}}",
  limit: 50
})
\`\`\`

For each comparison POV, compute completion rate:
\`\`\`
COMPARISON_DATA = comparable_povs.map(p => ({
  id: p.id,
  name: p.name,
  completion: p.completedTasks / p.totalTasks * 100
}))

SORTED = COMPARISON_DATA.sort_by(completion DESC)
PERCENTILE = (index_of(POV_ID in SORTED) / SORTED.length) * 100

RANK_LABEL =
  PERCENTILE <= 25 ? "Top 25% (Leader)" :
  PERCENTILE <= 50 ? "Top 50% (Above Average)" :
  PERCENTILE <= 75 ? "Bottom 50% (Below Average)" :
  "Bottom 25% (Needs Attention)"
\`\`\`

---

### STEP 7: Deep Dive Tasks (based on task_focus)

Select tasks based on \`{{task_focus}}\` setting:

\`\`\`
IF task_focus == "CRITICAL":
  // BLOCKED tasks + HIGH priority open tasks
  FOCUS_TASKS = ALL_TASKS
    .filter(t => t.status == "BLOCKED" OR (t.priority == "HIGH" AND t.status != "COMPLETED"))
    .sort_by(
      status == "BLOCKED" ? 0 : 1,  // BLOCKED first
      priority == "HIGH" ? 0 : 1,   // HIGH priority next
      createdAt ASC                  // Oldest first
    )

ELSE IF task_focus == "HIGH_PRIORITY":
  // Only HIGH priority tasks (any status except COMPLETED)
  FOCUS_TASKS = ALL_TASKS
    .filter(t => t.priority == "HIGH" AND t.status != "COMPLETED")
    .sort_by(
      status == "BLOCKED" ? 0 : status == "IN_PROGRESS" ? 1 : 2,
      createdAt ASC
    )

ELSE IF task_focus == "ALL":
  // All non-completed tasks
  FOCUS_TASKS = ALL_TASKS
    .filter(t => t.status != "COMPLETED")
    .sort_by(
      priority == "HIGH" ? 0 : priority == "MEDIUM" ? 1 : 2,
      status == "BLOCKED" ? 0 : status == "IN_PROGRESS" ? 1 : 2,
      createdAt ASC
    )

// Limit to configured maximum
FOCUS_TASKS = FOCUS_TASKS.slice(0, {{critical_task_limit}})
\`\`\`

For each focus task:
\`\`\`
Execute: project({
  action: "task.context",
  taskId: task.id,
  includeHistory: true,
  includeAnalytics: true,
  includeRecommendations: {{include_recommendations}},
  contextDepth: "full"
})
\`\`\`

Store results in \`TASK_CONTEXTS[]\`.

---

### STEP 8: Get AI Recommendations (if include_recommendations == true)

\`\`\`
Execute: analytics({
  action: "recommendations.get",
  povId: POV_ID,
  limit: 10
})
\`\`\`

Store as \`AI_RECOMMENDATIONS[]\`.

---

## Output Template

Produce a markdown report with the sections below. Values in angle-brackets are fields you computed in Steps 1-8 — substitute them inline. Do NOT emit Handlebars-style placeholders in the output.

**Report Header**: Level-1 heading "POV Health Report: <POV_NAME>". Below the heading, four bold metadata lines: Generated (current timestamp), POV ID, Status, Owner.

**Health Score section**: Level-2 heading formatted as "Health Score: <HEALTH_SCORE>/100 <HEALTH_GRADE>" (e.g., "82/100 A"). Follow with a markdown table showing Component / Value / Score Impact columns, one row per component:
- Completion Rate (value = COMPLETION_RATE%, impact = +COMPLETION_SCORE)
- Blocked Tasks (value = BLOCKED_TASKS count, impact = -BLOCKED_PENALTY)
- Unassigned Tasks (value = UNASSIGNED_TASKS count, impact = -UNASSIGNED_PENALTY)
- High-Priority Open (value = HIGH_PRIORITY_OPEN count, impact = -HIGH_PRIORITY_PENALTY)
- Active Progress (value = "Yes" if IN_PROGRESS_TASKS > 0 else "No", impact = +PROGRESS_BONUS)
- Phase Health (value = PHASE_HEALTH_STATUS string, impact = +PHASE_HEALTH_BONUS)

Follow the table with the Health Grade legend: 80-100 A (Healthy), 60-79 B (Good), 40-59 C (Needs Attention), 20-39 D (At Risk), 0-19 F (Critical).

**Severity Flags section**: Level-2 heading "Severity Flags". If any flags matched in Step 6, emit them as bullets in the format "- <severity>: <condition> - <action>". If none matched, emit the single line "No critical severity flags detected."

**Phase Analysis section**: Level-2 heading "Phase Analysis". Markdown table with columns Phase / Tasks / Completed / Blocked / Status. One row per phase (from PHASES array): name, task_count, completed percentage with %, blocked_count, and bottleneck_severity (or "OK" when absent).

Follow the table with a level-3 subheading "Bottlenecks Detected". List each bottleneck phase as a bullet: "- **<name>**: <blocked_count> blocked tasks (<severity>)". If no bottlenecks, emit "No phase bottlenecks detected."

**Comparative Ranking section**: Only include when include_comparison=true. Level-2 heading "Comparative Ranking". Lead line: "**Compared to <COMPARISON_COUNT> POVs with status \\"<STATUS>\\":**". Markdown table with columns Metric / This POV / Avg (Same Status) / Percentile — one row for Completion showing this POV's rate, the peer average, and the percentile. Follow with a bold line "**Ranking:** <RANK_LABEL>".

**Focus Tasks section**: Level-2 heading "Focus Tasks - <task_focus> (<count>)" where count = length of FOCUS_TASKS. List up to critical_task_limit tasks (default 5). For each task, emit a level-3 subheading "<N>. <title>" (N = 1-indexed position), then bulleted metadata:
- "**ID:** <id> | **Status:** <status> | **Priority:** <priority>"
- "**Assignee:** <assignee>" (emit "UNASSIGNED" when null/empty)
- "**Phase:** <phase> | **Stage:** <stage>"
- "**Age:** <age_days> days"

If the task has recommendations in its context (from task.context step), append one more bullet: "**AI Recommendation:** <first recommendation text>".

**AI Recommendations section**: Only include when include_recommendations=true. Level-2 heading "AI Recommendations". List up to 5 items from AI_RECOMMENDATIONS as numbered items (1., 2., 3., ...):
"<N>. **<type>** (<impact> impact, <confidence>% confidence)" then the description on the next indented line.

**Actionable Next Steps section**: Level-2 heading "Actionable Next Steps" with three level-3 subsections:
- "Immediate (Today)" — bulleted checklist (- [ ] ...) of IMMEDIATE_ACTIONS items
- "This Week" — bulleted checklist of WEEKLY_ACTIONS
- "Strategic" — bulleted checklist of STRATEGIC_ACTIONS

Each action's text comes from the Action Generation Rules table below, matched against the severity flags from Step 6.

**Footer**: Three bold lines:
- "**Prompt Version:** pov_health_check v2.1"
- "**Task Focus:** <task_focus>"
- "**Unique Value:** Health scoring, phase bottlenecks, comparative ranking"

---

## Action Generation Rules

Generate actions based on severity flags:

| Severity Flag | Action Category | Example Action |
|---------------|-----------------|----------------|
| BLOCKED >= 3 | Immediate | "Escalate blocked tasks to {{OWNER}} for unblocking" |
| BLOCKED >= 1 | Immediate | "Review blocker on task {{task.title}} ({{task.id}})" |
| UNASSIGNED >= 5 | Immediate | "Assign {{UNASSIGNED_TASKS}} tasks - team capacity review needed" |
| HIGH_PRIORITY >= 5 | This Week | "Prioritize {{HIGH_PRIORITY_OPEN}} HIGH tasks in sprint planning" |
| COMPLETION == 0% | Immediate | "POV appears stalled - schedule kickoff/restart meeting" |
| PERCENTILE > 75% | Strategic | "POV underperforming peers - consider resource boost or scope reduction" |
| COMPLETION > 80% | This Week | "POV near completion - prepare validation/close activities" |

---

## Usage Examples

\`\`\`json
{
  "example_1_basic": {
    "input": {
      "pov": "CyberDefense Pro"
    },
    "output": "Full health report with score, phase analysis, and recommendations (defaults: task_focus=CRITICAL, include_recommendations=true)"
  },
  "example_2_quick_check": {
    "input": {
      "pov": "cmgalshus00bcyx39sfdutido",
      "task_focus": "CRITICAL",
      "include_comparison": false,
      "critical_task_limit": 3
    },
    "output": "Focused health check without comparative analysis, top 3 critical (BLOCKED + HIGH) tasks"
  },
  "example_3_high_priority_only": {
    "input": {
      "pov": "Global Tech Solutions",
      "task_focus": "HIGH_PRIORITY",
      "include_recommendations": true,
      "critical_task_limit": 5
    },
    "output": "Health report focusing only on HIGH priority tasks, with AI recommendations"
  },
  "example_4_full_audit": {
    "input": {
      "pov": "NetworkShield Inc",
      "task_focus": "ALL",
      "include_comparison": true,
      "include_recommendations": true,
      "critical_task_limit": 10
    },
    "output": "Comprehensive analysis of ALL non-completed tasks with peer comparison and AI recommendations"
  }
}
\`\`\`

---

## Version History

- **v2.1** (Dec 2025): Restored \`task_focus\` variable (CRITICAL/HIGH_PRIORITY/ALL), renamed \`include_ai_recommendations\` to \`include_recommendations\` for backward compatibility
- **v2.0** (Dec 2025): Complete rewrite with health scoring, thresholds, phase bottlenecks, comparative analysis
- **v1.0** (Nov 2025): Original workflow-based prompt (now in pov_health_check_old.md)`,
  },
  {
    name: 'task_audit_and_planning',
    description: "Run a complete POV portfolio audit and generate an actionable execution plan in seconds. Automatically audits tasks across all active Projects, identifies bottlenecks and risks, selects the highest-impact POV (prioritizing VALIDATION status), and drills into critical tasks with AI recommendations. Perfect for delivery managers, architects, and operators who need instant portfolio health visibility and prioritized next steps.",
    // Version drift fix 2026-04-24: body text declares v2.6 (CHANGELOG in prompt),
    // but the `version` column was last at 2.2.0. Aligning seed file to the body.
    category: AgentCategory.ANALYSIS,
    useCase: "PORTFOLIO HEALTH REVIEW: Weekly executive check-ins where leaders need instant visibility into all active POVs, risk areas, and immediate action items across regions or globally. CUSTOMER POV ACCELERATION: Solution architects steering specific customer deployments (e.g., \"CyberDefense Pro\") who need to see exactly what tasks remain and who should complete them to move from VALIDATION to WON. DAILY STANDUP AUTOMATION: Delivery teams running daily operations who need a single command to identify today's highest-priority POV and tasks requiring immediate attention.",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 5,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive'],
    version: "2.6.0",
    variables: {"auto_drilldown": {"type": "boolean", "default": false, "required": false, "description": "Auto-select highest-impact POV (true) or present candidates for user choice (false). Set true for automated reports."}, "initial_context": {"type": "string", "required": false, "description": "\ud83c\udfaf RECOMMENDED: Context to prioritize (e.g., 'CyberDefense Pro', 'Mexico POVs', 'email gateway'). Biases POV selection and task focus.", "placeholder": "e.g., 'validation POVs for customer X'"}, "pov_status_filter": {"type": "string", "default": "IN_PROGRESS,STALLED,VALIDATION", "required": false, "validation": "^(PROJECTED|IN_PROGRESS|STALLED|VALIDATION|WON|LOST)(,(PROJECTED|IN_PROGRESS|STALLED|VALIDATION|WON|LOST))*$", "description": "POV statuses to audit (comma-separated). Options: PROJECTED,IN_PROGRESS,STALLED,VALIDATION,WON,LOST"}, "task_status_filter": {"type": "string", "default": "OPEN,IN_PROGRESS,BLOCKED", "required": false, "validation": "^(OPEN|IN_PROGRESS|BLOCKED|COMPLETED)(,(OPEN|IN_PROGRESS|BLOCKED|COMPLETED))*$", "description": "Task statuses to include (comma-separated). Options: OPEN,IN_PROGRESS,BLOCKED,COMPLETED"}, "focus_validation_povs": {"type": "boolean", "default": true, "required": false, "description": "Prefer VALIDATION POVs when selecting focus (recommended: true to accelerate deals toward WON)"}} as any,
    examples: "# Default execution - full audit with auto drilldown\n/prompt task_audit_and_planning_v2\n\n# Audit only VALIDATION POVs\n/prompt task_audit_and_planning_v2 pov_status_filter=[\"VALIDATION\"]\n\n# Dry run - see planned tool calls without executing\n/prompt task_audit_and_planning_v2 dry_run=true\n\n# Skip deep dive for faster execution\n/prompt task_audit_and_planning_v2 auto_drilldown=false\n\n# Limit scope for large portfolios\n/prompt task_audit_and_planning_v2 max_povs=10 max_critical_tasks=3" as any,
    promptText: `# ============================================================================
# AUTO-EXECUTE PROMPT - task_audit_and_planning v2.6
# ============================================================================
# CHANGELOG v2.6:
#   - Merged v2.5 improvements (audit_all_tasks as Step 1, fallback logic)
#   - FIX: Replaced perform(action: "analytics.generate") with correct tool
#          analytics(action: "recommendations.get") for POV-level AI recs
#   - FIX: analytics.generate requires analysisType param and is for reports,
#          not recommendations. recommendations.get is the correct action.
#   - Removed redundant Step 2 (audit_all_tasks already retrieves all tasks)
#   - Cleaned up variable rendering (false defaults now render correctly)
# ============================================================================

You MUST automatically execute all MCP pAIchart tools immediately.

NEVER ask "Should I run this?" or "Ready to begin?" or "Option A/B/C"
NEVER switch to descriptive mode - always execute real tools
NEVER summarize instead of executing - run actual tool calls
Assume tools are connected unless a tool call returns an error
If a tool fails, report the error but continue with remaining steps

TOOL NAME REFERENCE:

| Consolidated Tool | Action | Was (legacy) |
|---|---|---|
| \`project\` | \`pov.list\` | \`list_povs\` |
| \`project\` | \`pov.details\` | \`get_pov_details\` |
| \`project\` | \`task.list\` | \`list_tasks\` |
| \`project\` | \`task.context\` | \`get_task_context\` |
| \`perform\` | \`task.update\` | \`execute_task_action\` |
| \`analytics\` | \`recommendations.get\` | \`get_ai_recommendations\` |
| \`prompt_command\` | (command param) | unchanged |
| \`list_prompts\` | (no action) | unchanged |

LOOP HANDLING:
When instructions say "for each POV" or "for each task":
- Iterate through ALL items in the results
- Execute the specified tool for each item
- Gather all outputs before proceeding
- Continue to next step

TOOL EXECUTION:
Use the consolidated pAIchart MCP tools:
  project(action: "pov.list")                    - Get POV list
  project(action: "pov.details", povId: "...")   - Get POV details
  project(action: "task.list", povId: "...")     - Get task lists
  project(action: "task.context", taskId: "...") - Get task context
  analytics(action: "recommendations.get", povId: "...") - Get AI recommendations
  perform(action: "task.update", taskId: "...")  - Update tasks

Execute immediately upon reading this prompt. No confirmation needed.

# ============================================================================
# EXECUTE IMMEDIATELY - WORKFLOW BEGINS NOW
# ============================================================================

## STEP 1: Audit All POVs and Tasks (Single Call)

Execute the audit_all_tasks prompt, which retrieves ALL tasks across ALL active
POVs (IN_PROGRESS, STALLED, VALIDATION) in a single operation:

  prompt_command({ command: "/prompt audit_all_tasks includeCompleted=true" })

Store results as: ALL_POVS and ALL_TASKS

FALLBACK (only if audit_all_tasks fails or returns an error):
  Execute three separate calls to cover all statuses:
    project({ action: "pov.list", status: "IN_PROGRESS", limit: 200 })
    project({ action: "pov.list", status: "STALLED", limit: 200 })
    project({ action: "pov.list", status: "VALIDATION", limit: 200 })
  Then for each POV:
    project({ action: "task.list", povId: POV.id, limit: 200 })
  Note: If fallback is used, log "audit_all_tasks failed - using manual fallback"

NOTE: Do NOT execute a separate task.list loop after audit_all_tasks succeeds.
audit_all_tasks already returns complete task data for all POVs. Doing both
would duplicate data and waste tool calls.

# ============================================================================

## DATA VOLUME HANDLING STRATEGY

CRITICAL: Complete entire workflow regardless of data volume. NEVER stop to ask
permission.

IF total_povs > 5 OR total_tasks > 50:
  - Use summary tables (completion %, HIGH-priority counts only)
  - NO full task lists in global summary
  - Deep dive ONLY on selected focus POV

IF total_povs <= 5 AND total_tasks <= 50:
  - Present moderate detail
  - Include task counts per phase
  - Deep dive on selected focus POV

# ============================================================================

## STEP 2: Analyze & Build Global Summary

{{#if initial_context}}
USER CONTEXT: "{{initial_context}}"
Prioritize POVs/tasks matching this context.
{{/if}}

Calculate for each POV:
  - Completion rate = (completed / total) * 100
  - HIGH priority OPEN/BLOCKED count
  - Risk level:
      CRITICAL if 0% progress
      HIGH     if completion < 20%
      MEDIUM   if completion < 50%
      LOW      if completion >= 70%

Present as condensed table:
  | POV Name (ID suffix) | Status | Complete | High-Pri | Risk | Owner |

# ============================================================================

## STEP 3: Generate Global Next Steps

Produce 3-7 concrete recommendations:
  - Focus on VALIDATION POVs first (closest to WON)
  - Identify capacity issues (unassigned HIGH tasks)
  - Flag sequencing problems (Planning incomplete, Implementation started)
  - Use direct language: "Assign X to Y" not "Consider assigning..."

# ============================================================================

## STEP 4: Select Focus POV

  candidates = POVs with status = VALIDATION

  IF candidates.length == 0:
    candidates = POVs with status = IN_PROGRESS
    OUTPUT: "No VALIDATION POVs found. Selecting IN_PROGRESS."

  IF {{auto_drilldown}} == true:
    selected_pov = candidate with highest revenue OR most high_priority_open tasks
    OUTPUT: "Auto-selected: [POV_NAME]"

  ELSE (auto_drilldown == false, default):
    IF candidates.length > 3:
      Present top 3 candidates ranked by (revenue DESC, then high_priority_open DESC)
    ELSE:
      Present all candidates
    Ask user to select before continuing to Step 5

# ============================================================================

## STEP 5: Deep Dive Selected POV

Execute in sequence:

  1. pov_details = project({
       action: "pov.details",
       povId: selected_pov.id
     })

  2. critical_tasks = project({
       action: "task.list",
       povId: selected_pov.id,
       priority: "HIGH",
       limit: 50
     })
     (Omit status filter to capture OPEN, IN_PROGRESS, and BLOCKED)

  3. For top 3-5 most critical tasks ONLY
     (prioritize: BLOCKED first, then IN_PROGRESS, then OPEN, oldest first):
       task_context = project({
         action: "task.context",
         taskId: task.id,
         includeHistory: true,
         includeAnalytics: true,
         includeRecommendations: true,
         contextDepth: "full"
       })

  4. ai_recs = analytics({
       action: "recommendations.get",
       povId: selected_pov.id,
       limit: 10
     })
     IMPORTANT: "analytics" is a SEPARATE tool from "perform". Do NOT use
     perform(action: "analytics.generate") — that is a different action requiring
     analysisType. Use the analytics tool directly with action "recommendations.get".
     If this returns an error, note it in the execution log and proceed without it.

# ============================================================================

## STEP 6: Present Structured Output

Use this EXACT structure:

---

# Global Task Audit Summary

| POV Name (ID suffix) | Status | Complete | High-Pri Open | Risk | Owner |
|---|---|---|---|---|---|
[one row per POV]

**Portfolio Health:** [N] active POVs | [N] VALIDATION | [N] IN_PROGRESS | [N] STALLED

---

# Global Next Steps (All POVs)

[3-7 concrete recommendations from Step 3]

---

# Focus POV: [POV_NAME] (ID: ...last8chars)

**Status:** [status] | **Owner:** [owner] | **Revenue:** $[amount]
**Completion:** [X%] | **High-Priority Tasks:** [count] | **Overdue:** [count]

## Team
[team members and roles]

## Critical Tasks ([N] tasks)

| Task (ID suffix) | Status | Assignee | Notes |
|---|---|---|---|
[top 3-5 tasks]

## AI Recommendations

[Output from analytics(action: "recommendations.get"), or "recommendations unavailable" if it failed]

---

# Suggested Next Actions

- [ ] [Specific action with task/POV names and IDs]
- [ ] [Specific action with task/POV names and IDs]
- [ ] [Specific action with task/POV names and IDs]

---

**Prompt Version:** v2.6 | **Tool Calls:** [N] | **Execution Notes:** [any errors or fallbacks]

---

# ============================================================================
# FINAL EXECUTION CHECKLIST
# ============================================================================
# Before responding, verify you have:
#
#   [x] Executed audit_all_tasks (or fallback pov.list + task.list calls)
#   [x] Did NOT run a redundant task.list loop after audit_all_tasks succeeded
#   [x] Calculated actual completion rates from real data
#   [x] Selected a focus POV using the {{auto_drilldown}} logic
#   [x] Executed project(action: "pov.details") for focus POV
#   [x] Executed project(action: "task.list") for focus POV critical tasks
#   [x] Executed project(action: "task.context") for top 3-5 critical tasks
#   [x] Attempted analytics(action: "recommendations.get") and logged result
#   [x] Presented structured markdown output with real data
#   [x] Logged any errors or fallbacks in the Execution Notes footer
#
# If any item is unchecked, go back and run the actual tools.
# ============================================================================

# ============================================================================
# VARIABLES CONFIGURATION
# ============================================================================

{
  "auto_drilldown": {
    "type": "boolean",
    "default": false,
    "required": false,
    "description": "Auto-select highest-impact POV (true) or present top candidates for user choice (false). Set true for automated/scheduled reports."
  },
  "initial_context": {
    "type": "string",
    "required": false,
    "description": "RECOMMENDED: Context to prioritize (e.g., 'CyberDefense Pro', 'Mexico POVs', 'email gateway'). Biases POV selection and task focus.",
    "placeholder": "e.g., 'validation POVs for customer X'"
  },
  "pov_status_filter": {
    "type": "string",
    "default": "IN_PROGRESS,STALLED,VALIDATION",
    "required": false,
    "validation": "^(PROJECTED|IN_PROGRESS|STALLED|VALIDATION|WON|LOST)(,(PROJECTED|IN_PROGRESS|STALLED|VALIDATION|WON|LOST))*$",
    "description": "POV statuses to audit (comma-separated). Options: PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST"
  },
  "task_status_filter": {
    "type": "string",
    "default": "OPEN,IN_PROGRESS,BLOCKED",
    "required": false,
    "validation": "^(OPEN|IN_PROGRESS|BLOCKED|COMPLETED)(,(OPEN|IN_PROGRESS|BLOCKED|COMPLETED))*$",
    "description": "Task statuses to include (comma-separated). Options: OPEN, IN_PROGRESS, BLOCKED, COMPLETED"
  },
  "focus_validation_povs": {
    "type": "boolean",
    "default": true,
    "required": false,
    "description": "Prefer VALIDATION POVs when selecting focus (recommended: true to accelerate deals toward WON)"
  }
}

# ============================================================================
# USAGE EXAMPLES
# ============================================================================

{
  "example_1_portfolio_review": {
    "name": "Weekly Portfolio Health Check",
    "command": "/prompt task_audit_and_planning",
    "input": {
      "auto_drilldown": false,
      "pov_status_filter": "IN_PROGRESS,STALLED,VALIDATION",
      "task_status_filter": "OPEN,IN_PROGRESS,BLOCKED",
      "focus_validation_povs": true
    },
    "output": "Global audit across all active POVs, prioritized next steps, top 3 VALIDATION POV candidates presented for user selection",
    "use_case": "Weekly executive review or standup"
  },
  "example_2_customer_focus": {
    "name": "Accelerate Specific Customer POV",
    "command": "/prompt task_audit_and_planning initial_context=\\"CyberDefense Pro\\" auto_drilldown=true",
    "input": {
      "auto_drilldown": true,
      "initial_context": "CyberDefense Pro validation",
      "pov_status_filter": "VALIDATION",
      "task_status_filter": "OPEN,IN_PROGRESS",
      "focus_validation_povs": true
    },
    "output": "Targeted analysis of CyberDefense Pro POV with auto-selected focus and task-level recommendations",
    "use_case": "Solution architect steering customer toward WON"
  },
  "example_3_automated_report": {
    "name": "Daily Automated Report (Bot/Scheduled)",
    "command": "/prompt task_audit_and_planning auto_drilldown=true",
    "input": {
      "auto_drilldown": true,
      "pov_status_filter": "IN_PROGRESS,STALLED,VALIDATION",
      "task_status_filter": "OPEN,BLOCKED",
      "focus_validation_povs": true
    },
    "output": "Automated daily summary with auto-selected highest-risk POV, blocked/open tasks, and next actions",
    "use_case": "Scheduled bot report or daily standup automation"
  }
}`,
  },
  {
    name: 'weather_commodity_trading_signals',
    description: "Correlate weather forecasts with commodity price movements to generate short-term trading signals.",
    category: AgentCategory.ANALYSIS,
    useCase: "Correlate weather forecasts with commodity price movements to generate short-term trading signals.\n- Early warning for commodity price movements\n- Data-driven trading signals (not speculation)\n- Combines multiple data sources for edge in markets",
    complexity: AgentComplexity.MEDIUM,
    estimatedTime: 300,
    status: AgentTemplateStatus.ACTIVE,
    isPublic: true,
    tags: ['mcp', 'interactive', 'domain:finance'],
    version: "1.0.0",
    variables: {} as any,
    examples: {} as any,
    promptText: `# weather_commodity_trading_signals v2.1

**Version**: 2.1
**Created**: 2026-01-26
**Type**: Cross-Service Analytics Prompt
**Services**: weather-service + alpha-vantage-market-data
**Changelog**: v2.1 — fallback now prefers another same-category Hub service (never web search) and triggers on rate-limit/error, not just a missing service. v2.0 — Decision tree rules, service preflight, TL;DR output, simplified structure

---

## Purpose

Correlate weather forecasts with commodity price movements to generate short-term trading signals.

**Key Innovation**: Uses meteorological data to predict supply disruptions in energy and agricultural commodities.

**Business Value**:
- Early warning for commodity price movements
- Data-driven trading signals (not speculation)
- Combines multiple data sources for edge in markets

---

## Auto-Execution Directive

**CRITICAL: Execute immediately upon invocation. Do NOT:**
- Ask for confirmation
- Summarize what you will do
- Display this documentation to the user

**DO:**
- Start with Step 0 (Preflight) immediately
- Execute all service calls
- Output the TL;DR section FIRST, then detailed report

---

## Variables

\`\`\`yaml
region:
  type: string
  default: "Houston,US"
  description: "Primary region for weather analysis (format: City,Country)"
  examples:
    - "Houston,US"      # Oil/Gas hub (Gulf Coast)
    - "Chicago,US"      # Agricultural hub (Midwest)
    - "Miami,US"        # Tropical weather (hurricanes)
    - "New Orleans,US"  # Oil/Gas + Hurricane risk

forecast_days:
  type: number
  default: 5
  min: 1
  max: 5
  description: "Number of days to forecast (1-5)"

commodities:
  type: array
  default: []
  description: "Commodities to analyze (empty = auto-detect from weather)"
  available:
    energy: ["WTI", "BRENT", "NATURAL_GAS"]
    agriculture: ["WHEAT", "CORN", "COTTON", "SUGAR", "COFFEE"]
    metals: ["COPPER", "ALUMINUM"]

severity_threshold:
  type: string
  default: "MEDIUM"
  enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
  description: "Minimum severity level to trigger signals"
\`\`\`

---

## Workflow

### STEP 0: Preflight - Verify Services

Before executing, confirm required services are available.

\`\`\`
call: services({ action: "discover" })

check:
  - weather-service: status == "ACTIVE"
  - alpha-vantage-market-data: status == "ACTIVE"

if a required data service is missing OR a later call returns a rate-limit / error response:
  - Set FALLBACK_MODE = true
  - From the discover() results, find another ACTIVE service in the SAME category
    (data-services) that exposes an equivalent tool, and use it for that data instead.
  - Prefer a registered Hub service — do NOT fall back to web search / the public internet.
  - If no same-category Hub service can supply the data, mark that data point
    "unavailable" in the report and continue with available services.
\`\`\`

**Save as**: \`SERVICE_STATUS\`

---

### STEP 1: Fetch Weather Forecast

\`\`\`
call: services({
  action: "call",
  targetService: "weather-service",
  tool: "forecast",
  arguments: {
    location: "{{region}}",
    days: {{forecast_days}},
    units: "imperial"
  }
})
\`\`\`

**Save as**: \`FORECAST_DATA\`

**Also fetch current conditions:**

\`\`\`
call: services({
  action: "call",
  targetService: "weather-service",
  tool: "current_weather",
  arguments: {
    location: "{{region}}",
    units: "imperial"
  }
})
\`\`\`

**Save as**: \`CURRENT_WEATHER\`

**Extract from results:**
- \`DAILY_FORECASTS[]\` - Array of daily conditions
- \`MAX_TEMP\` - Highest temp in forecast period
- \`MIN_TEMP\` - Lowest temp in forecast period
- \`WIND_MAX\` - Peak wind speed across forecast
- \`CONDITIONS[]\` - Weather conditions array
- \`CURRENT_TEMP\` - Current temperature
- \`CURRENT_FEELS_LIKE\` - Current feels-like temperature

---

### STEP 2: Weather Pattern Detection (Decision Tree)

Apply the following rules in order. Multiple rules can match.

#### Rule Set: Energy Commodities

\`\`\`yaml
rules:
  # CRITICAL: Hurricane/Tropical Storm (Gulf Coast)
  - id: HURRICANE_RISK
    severity: CRITICAL
    conditions:
      - region MATCHES ["Houston", "Gulf", "New Orleans", "Miami", "Tampa"]
      - AND (WIND_MAX > 75 OR CONDITIONS CONTAINS ["hurricane", "tropical storm", "cyclone"])
    impact: "Gulf Coast refineries at risk - oil/gas supply disruption likely"
    commodities: [WTI, BRENT, NATURAL_GAS]
    price_direction: UP
    confidence: HIGH
    timeframe: "1-3 days"

  # HIGH: Cold Snap (Heating Demand)
  - id: COLD_SNAP
    severity: HIGH
    conditions:
      - region MATCHES ["Houston", "Texas", "Gulf", "Chicago", "Midwest"]
      - AND MIN_TEMP < 25
      - AND consecutive_cold_days >= 2
    impact: "Extreme cold increases heating demand significantly"
    commodities: [NATURAL_GAS]
    price_direction: UP
    confidence: HIGH
    timeframe: "1-5 days"

  # HIGH: Severe Cold Snap (Infrastructure Risk)
  - id: FREEZE_RISK
    severity: HIGH
    conditions:
      - region MATCHES ["Houston", "Texas", "Gulf"]
      - AND MIN_TEMP < 15
      - AND consecutive_cold_days >= 3
    impact: "Infrastructure freeze risk - similar to Feb 2021 Texas Freeze"
    commodities: [NATURAL_GAS, WTI]
    price_direction: UP
    confidence: HIGH
    timeframe: "1-7 days"
    historical_reference: "Feb 2021: Natural Gas +97% ($2.71 → $5.35)"

  # HIGH: Heat Wave (Cooling Demand)
  - id: HEAT_WAVE
    severity: HIGH
    conditions:
      - MAX_TEMP > 100
      - AND consecutive_hot_days >= 3
    impact: "Extended heat wave increases cooling/power demand"
    commodities: [NATURAL_GAS]
    price_direction: UP
    confidence: MEDIUM
    timeframe: "2-5 days"

  # MEDIUM: Moderate Cold
  - id: MODERATE_COLD
    severity: MEDIUM
    conditions:
      - region MATCHES ["Houston", "Texas", "Gulf", "South"]
      - AND MIN_TEMP < 32
      - AND MIN_TEMP >= 25
    impact: "Below-freezing temps increase heating demand"
    commodities: [NATURAL_GAS]
    price_direction: UP
    confidence: MEDIUM
    timeframe: "1-3 days"
\`\`\`

#### Rule Set: Agricultural Commodities

\`\`\`yaml
rules:
  # HIGH: Flooding Risk
  - id: FLOODING_RISK
    severity: HIGH
    conditions:
      - region MATCHES ["Chicago", "Midwest", "Kansas", "Iowa", "Nebraska"]
      - AND days_with_heavy_rain >= 3  # heavy = precipitation > 50%
    impact: "Heavy rainfall threatens crop harvest and transport"
    commodities: [WHEAT, CORN]
    price_direction: UP
    confidence: MEDIUM
    timeframe: "1-2 weeks"

  # MEDIUM: Drought Risk
  - id: DROUGHT_RISK
    severity: MEDIUM
    conditions:
      - region MATCHES ["Chicago", "Midwest", "Kansas", "Great Plains"]
      - AND days_with_rain == 0
      - AND forecast_days >= 5
      - AND MAX_TEMP > 90
    impact: "No precipitation + high heat = crop stress"
    commodities: [WHEAT, CORN, COTTON]
    price_direction: UP
    confidence: LOW  # 5-day window too short for drought confirmation
    timeframe: "2-4 weeks"

  # HIGH: Tropical Storm (Sugar/Coffee regions)
  - id: TROPICAL_AGRICULTURE
    severity: HIGH
    conditions:
      - region MATCHES ["Miami", "Florida", "Gulf", "Caribbean"]
      - AND CONDITIONS CONTAINS ["tropical", "hurricane", "storm"]
    impact: "Tropical weather threatens sugar cane and shipping"
    commodities: [SUGAR, COFFEE]
    price_direction: UP
    confidence: MEDIUM
    timeframe: "1-2 weeks"
\`\`\`

#### Rule Set: No Significant Weather

\`\`\`yaml
rules:
  # DEFAULT: Normal Conditions
  - id: NORMAL_CONDITIONS
    severity: NONE
    conditions:
      - No other rules matched
    impact: "No significant weather events detected"
    commodities: []
    price_direction: NEUTRAL
    confidence: N/A
    timeframe: N/A
\`\`\`

**Output**: \`WEATHER_ALERTS[]\` - Array of matched rules

---

### STEP 3: Fetch Commodity Prices

Determine which commodities to fetch based on alerts or user input.

\`\`\`
if {{commodities}} is not empty:
  COMMODITIES_TO_FETCH = {{commodities}}
else if WEATHER_ALERTS has matches:
  COMMODITIES_TO_FETCH = unique commodities from all WEATHER_ALERTS
else:
  COMMODITIES_TO_FETCH = ["WTI", "NATURAL_GAS"]  # Default energy basket
\`\`\`

**For each commodity, fetch historical data:**

\`\`\`
for commodity in COMMODITIES_TO_FETCH:
  call: services({
    action: "call",
    targetService: "alpha-vantage-market-data",
    tool: "TOOL_CALL",
    arguments: {
      tool_name: commodity,
      arguments: "{}"
    }
  })
\`\`\`

**Parse response and extract:**
- \`current_price\` - Most recent price
- \`current_date\` - Date of most recent price
- \`previous_month_price\` - Prior month price
- \`month_over_month_change\` - Percentage change
- \`year_ago_price\` - Price 12 months ago
- \`year_over_year_change\` - YoY percentage change
- \`trend\` - UP if MoM > 0, DOWN if MoM < 0

**Save as**: \`COMMODITY_DATA[]\`

---

### STEP 4: Generate Trading Signals

For each WEATHER_ALERT that meets severity threshold:

\`\`\`yaml
signal_generation:
  for each alert in WEATHER_ALERTS:
    if alert.severity >= {{severity_threshold}}:
      for each commodity in alert.commodities:
        
        # Find commodity data
        data = COMMODITY_DATA.find(commodity)
        
        # Generate signal
        signal = {
          commodity: commodity,
          direction: alert.price_direction,
          confidence: alert.confidence,
          current_price: data.current_price,
          trend: data.trend,
          reasoning: alert.impact,
          weather_driver: alert.id,
          severity: alert.severity,
          timeframe: alert.timeframe,
          action: determine_action(alert.price_direction, alert.confidence)
        }
        
        TRADING_SIGNALS.append(signal)

  # Sort by confidence (HIGH > MEDIUM > LOW) then severity
  TRADING_SIGNALS.sort(confidence DESC, severity DESC)
\`\`\`

**Action determination:**
\`\`\`yaml
action_rules:
  - direction: UP, confidence: HIGH → "🟢 STRONG BUY SIGNAL"
  - direction: UP, confidence: MEDIUM → "🟡 BUY SIGNAL"
  - direction: UP, confidence: LOW → "⚪ WEAK BUY (monitor)"
  - direction: DOWN, confidence: HIGH → "🔴 STRONG SELL SIGNAL"
  - direction: DOWN, confidence: MEDIUM → "🟡 SELL SIGNAL"
  - direction: DOWN, confidence: LOW → "⚪ WEAK SELL (monitor)"
  - direction: NEUTRAL → "⚖️ HOLD / NO ACTION"
\`\`\`

**Save as**: \`TRADING_SIGNALS[]\`

---

## Output Template

**IMPORTANT**: Always output TL;DR section FIRST.

\`\`\`markdown
# 🌦️ Weather-Driven Commodity Trading Signals

**Generated:** {{timestamp}}
**Region:** {{region}}
**Forecast Period:** {{forecast_days}} days
**Services:** weather-service ✅ + alpha-vantage-market-data ✅

---

## 🎯 TL;DR - Quick Signals

Produce a markdown table with columns Commodity / Signal / Confidence / Current Price / Action. If TRADING_SIGNALS is non-empty, emit one row per signal in the format: commodity | direction | confidence | \${current_price} | action. If TRADING_SIGNALS is empty, emit a single row: — | NEUTRAL | — | — | No weather-driven signals.

After the table, emit two bold metadata lines:
- "**Key Weather Event:** <PRIMARY_ALERT.id> - <PRIMARY_ALERT.impact>"
- "**Timeframe:** <PRIMARY_ALERT.timeframe>"

---

## 🌡️ Weather Summary

"**Current in <region>:** <CURRENT_TEMP>°F (feels like <CURRENT_FEELS_LIKE>°F)"

Then a markdown table with columns Day / High / Low / Conditions / Alert. One row per item in DAILY_FORECASTS: date, tempMax°F, tempMin°F, conditions, alert_indicator.

After the table: "**Temperature Range:** <MIN_TEMP>°F to <MAX_TEMP>°F"

---

## ⚠️ Weather Alerts (<WEATHER_ALERTS count>)

If WEATHER_ALERTS is non-empty, emit one subsection per alert:

- Level-3 heading: "<severity> - <id>"
- Markdown Attribute/Value table with rows:
  - **Impact** | <impact>
  - **Commodities** | <commodities>
  - **Price Direction** | <price_direction>
  - **Confidence** | <confidence>
  - **Timeframe** | <timeframe>
  - **Historical** | <historical_reference> (include this row ONLY when the alert has a historical_reference field; omit otherwise)
- Separator "---" after each alert subsection

If WEATHER_ALERTS is empty, emit instead: "✅ **No significant weather events detected** - Normal market conditions expected."

---

## 📊 Commodity Data (Alpha Vantage)

Produce a markdown table with columns Commodity / Current / Prior Month / MoM Change / Trend. One row per item in COMMODITY_DATA: commodity name, \${current_price}, \${previous_month_price}, month_over_month_change%, trend_emoji (🔺 / 🔻 / ➡️).

---

## 🎯 Detailed Signals

If TRADING_SIGNALS is non-empty, emit one subsection per signal (1-indexed):

- Level-3 heading "<N>. <commodity> - <action>"
- Markdown Attribute/Value table with rows:
  - **Signal** | <direction> (<confidence> confidence)
  - **Current Price** | \${current_price}
  - **Weather Driver** | <weather_driver> (<severity>)
  - **Reasoning** | <reasoning>
  - **Timeframe** | <timeframe>
  - **Momentum** | <trend> (<month_over_month_change>% MoM)
- Separator "---" after each subsection

If TRADING_SIGNALS is empty, emit instead:

"📊 **No trading signals generated**

Weather conditions do not indicate significant commodity supply/demand disruption.

**Recommendation:** Continue monitoring; re-run analysis tomorrow."

---

## 📈 Historical Reference

| Event | Year | Weather | Commodity | Price Impact |
|-------|------|---------|-----------|--------------|
| Texas Freeze | Feb 2021 | Multi-day <10°F | Natural Gas | **+97%** ($2.71→$5.35) |
| Hurricane Katrina | Aug 2005 | Category 5 | WTI | **+16%** ($60→$70) |
| Polar Vortex | Jan 2019 | Midwest freeze | Natural Gas | **+30%** |
| Summer Heat Wave | Aug 2022 | Extended >100°F | Natural Gas | **+100%** (to $8.81) |
| Midwest Drought | 2012 | No rain + heat | Corn/Wheat | **+45-50%** |

---

## ✅ Next Steps

### If Signals Generated:
- [ ] Validate signal against other market factors
- [ ] Set price alerts for entry/exit points
- [ ] Monitor weather forecast updates daily
- [ ] Re-run analysis in 24 hours

### Ongoing Monitoring:
- [ ] Track {{region}} weather for changes
- [ ] Watch for extended/intensified weather events
- [ ] Compare forecast vs actual temperatures

---

**Disclaimer:** Educational/informational analysis only. Not financial advice. Weather correlation is one factor among many. Always consult financial professionals.

**Prompt Version:** weather_commodity_trading_signals v2.1
**Services Used:** 2 (weather-service, alpha-vantage-market-data)
\`\`\`

---

## Regional Commodity Mapping Reference

| Region | Primary Commodities | Key Weather Risks |
|--------|---------------------|-------------------|
| Houston, TX | WTI, BRENT, NATURAL_GAS | Hurricane, freeze, heat |
| New Orleans, LA | WTI, NATURAL_GAS | Hurricane, flooding |
| Chicago, IL | WHEAT, CORN, NATURAL_GAS | Drought, flooding, cold |
| Kansas City, MO | WHEAT, CORN | Drought, tornadoes |
| Miami, FL | SUGAR, COFFEE | Hurricanes |
| Midland, TX | WTI | Freeze, drought |

---

## Usage Examples

\`\`\`bash
# Default: Houston weather → Energy commodities (auto-detect)
/prompt weather_commodity_trading_signals_v2

# Specific region: Chicago → Agricultural focus
/prompt weather_commodity_trading_signals_v2 region="Chicago,US"

# Manual commodity selection
/prompt weather_commodity_trading_signals_v2 commodities='["WHEAT", "CORN", "NATURAL_GAS"]'

# High sensitivity: Alert on any weather event
/prompt weather_commodity_trading_signals_v2 severity_threshold="LOW"

# Gulf Coast hurricane monitoring
/prompt weather_commodity_trading_signals_v2 region="New Orleans,US" commodities='["WTI", "NATURAL_GAS"]'
\`\`\`

---

## Appendix: Confidence Scoring Guide

| Confidence | Criteria |
|------------|----------|
| **HIGH** | Strong historical correlation + Clear weather pattern + Short timeframe |
| **MEDIUM** | Moderate correlation + Weather pattern developing + Medium timeframe |
| **LOW** | Weak/indirect correlation + Uncertain pattern + Long timeframe |

| Weather Pattern | Commodity | Historical Correlation | Typical Confidence |
|-----------------|-----------|------------------------|-------------------|
| Hurricane (Gulf) | WTI, BRENT | Very Strong | HIGH |
| Freeze (Texas) | NATURAL_GAS | Very Strong | HIGH |
| Cold Snap | NATURAL_GAS | Strong | HIGH |
| Heat Wave | NATURAL_GAS | Moderate | MEDIUM |
| Drought | WHEAT, CORN | Moderate (delayed) | LOW-MEDIUM |
| Flooding | WHEAT, CORN | Moderate | MEDIUM |

---

## Version History

- **v2.0** (2026-01-26): Major rewrite
  - Added service preflight check (Step 0)
  - Replaced pseudo-code with decision tree rules
  - Added TL;DR output section (always first)
  - Simplified rule matching logic
  - Added historical reference table
  - Improved output template structure
  
- **v1.0** (2026-01-25): Initial release

---

## Tags

\`#mcp\` \`#cross-service\` \`#analytics\` \`#weather\` \`#commodities\` \`#trading\` \`#alpha-vantage\` \`#decision-tree\``,
  },
];

async function main() {
  console.log(`Seeding ${operationalPrompts.length} operational prompts...`);
  let created = 0, updated = 0;

  for (const entry of operationalPrompts) {
    const existing = await prisma.agentPromptLibrary.findFirst({
      where: { name: entry.name },
    });

    if (existing) {
      console.log(`  Updating: ${entry.name} (id: ${existing.id})`);
      await prisma.agentPromptLibrary.update({
        where: { id: existing.id },
        data: { ...entry, updatedAt: new Date() },
      });
      updated++;
    } else {
      console.log(`  Creating: ${entry.name}`);
      await prisma.agentPromptLibrary.create({ data: entry });
      created++;
    }
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Total: ${operationalPrompts.length}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
